#!/usr/bin/env python3
"""
evaluate.py — Pipeline v2 Evaluate Service

Binary safety sweep + persona assignment + decomposition check using qwen3:32b.
Triggered by event-watcher when staging:done AND evaluated:no.
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import (call_ollama, conditional_claim, extract_json, get_ollama_telemetry,
                      list_personas, log_activity, pulse_patch, pulse_post, remove_sidecar, write_sidecar)
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [evaluate] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("evaluate")

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
MODEL = os.environ.get("EVALUATE_MODEL", "qwen3:32b")

EVALUATE_PROMPT = """You are a task evaluation assistant for a software automation pipeline.

Evaluate this task for safety, clarity, and decomposition needs.

Task ID: {task_id}
Title: {title}
Description: {description}
Labels: {labels}
Metadata: {metadata}

Available Personas: {personas}

Instructions:
1. SAFETY CHECK (binary pass/block):
   - Block ONLY if the task would: wipe a database, force-push to shared repos, modify credentials/secrets, delete production data, or perform clearly destructive/nefarious actions.
   - Default posture: PASS. Most tasks are safe. Be permissive.

2. INTELLIGIBILITY CHECK:
   - Is the prompt clear enough for an AI executor to act on?
   - If unclear, rewrite it for clarity in your output.

3. PERSONA ASSIGNMENT:
   - If the task already has an "assigned:<persona>" label, KEEP that persona unless it is clearly wrong for the task type.
   - Otherwise, match task to the best available persona based on type, keywords, domain.
   - If no good match, default to "autofix-executor".

4. DECOMPOSITION CHECK:
   - Should this task be split into smaller tasks?
   - Do NOT decompose if the task metadata contains "decomposition_depth" >= 2.
   - Do NOT decompose if the task has label "action:retrieve" — retrieval tasks (search + download) are atomic single-persona workflows. The assigned persona handles the full search→verify→download→report pipeline internally.
   - Do NOT decompose if the description is a single coherent instruction with a clear end state, even if it mentions multiple internal steps. Internal workflow steps (search then download then report) are NOT subtasks — they are the persona's responsibility.
   - Split ONLY if ALL of these apply:
     a) The task requires 2+ distinct personas with genuinely different skill sets
     b) The scope spans multiple independent deliverables that could be done in parallel
     c) Each proposed subtask would take >5 minutes and produces a distinct artifact
   - Each subtask must be a self-contained unit of work.
   - List subtasks IN EXECUTION ORDER. The first subtask has no dependencies.
   - Each subsequent subtask's "depends_on" names the prior subtask it needs.
   - Validation/verification subtasks MUST be listed LAST (they validate outputs from earlier steps).
   - DEFAULT TO NO DECOMPOSITION. When in doubt, keep the task atomic.

Output as JSON:
{{
  "safe": true/false,
  "block_reason": "reason if blocked, null if safe",
  "intelligible": true/false,
  "rewritten_prompt": "improved prompt if unclear, null if already clear",
  "persona": "persona-name from the Available Personas list ONLY",
  "decompose": false,
  "subtasks": [
    {{"title": "...", "description": "...", "depends_on": null}},
    {{"title": "...", "description": "...", "depends_on": "title of prior subtask"}}
  ],
  "confidence": "high/medium/low"
}}

/no_think"""

# Destructive keyword blocklist — deterministic, instant, runs BEFORE LLM.
# Patterns are checked against full phrases, not individual words.
DESTRUCTIVE_PATTERNS = [
    "drop database", "drop schema", "drop table", "drop index",
    "truncate table", "delete from",
    "rm -rf", "rm -r /", "rm -f /",
    "force push", "force-push", "git push --force", "git push -f",
    "git reset --hard", "git clean -fd", "git clean -f",
    "format disk", "fdisk", "mkfs",
    "delete credentials", "remove credentials", "delete secrets",
    "wipe database", "wipe the database", "nuke database",
    "drop and recreate", "destroy database",
]

DESTRUCTIVE_KEYWORDS = ["drop", "wipe", "nuke", "destroy", "purge", "truncate"]
DESTRUCTIVE_TARGETS = ["database", "schema", "table", "production", "credentials", "secrets"]


def check_destructive_keywords(title: str, description: str, stage_desc: str) -> str | None:
    """Returns the matched pattern if destructive, None if safe."""
    combined = f"{title} {description} {stage_desc}".lower()
    for pattern in DESTRUCTIVE_PATTERNS:
        if pattern in combined:
            return pattern
    words = set(combined.split())
    has_keyword = [k for k in DESTRUCTIVE_KEYWORDS if k in words]
    has_target = [t for t in DESTRUCTIVE_TARGETS if t in words]
    if has_keyword and has_target:
        return f"{has_keyword[0]}+{has_target[0]}"
    return None


def revert():
    sidecar_path = Path(os.environ.get("PROJECT_DIR", ".")) / ".claude" / "jobs" / "active" / f"{TASK_ID}.eval.json"
    remove_sidecar(sidecar_path)
    conditional_claim(TASK_ID, "evaluated:processing", "evaluated:no",
                      actor="evaluate-service")


def main():
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)

    if not TASK_ID:
        log.error("No TASK_ID provided")
        sys.exit(1)

    task_json = os.environ.get("TASK_JSON")
    if task_json:
        try:
            task = json.loads(task_json)
        except (json.JSONDecodeError, TypeError) as e:
            log.error("Invalid TASK_JSON: %s", e)
            sys.exit(1)
    else:
        try:
            r = requests.get(f"{PULSE_API}/tasks/{TASK_ID}", timeout=5)
            r.raise_for_status()
            task = r.json()
        except Exception as e:
            log.error("Failed to fetch task %s: %s", TASK_ID, e)
            sys.exit(1)

    title = task.get("title", "Untitled")
    description = task.get("description", "")
    labels = task.get("labels", [])
    metadata = task.get("metadata", {}) or {}
    personas = list_personas()

    log.info("Evaluating task %s: %s", TASK_ID, title)
    sidecar = write_sidecar(TASK_ID, "evaluate")

    stage_desc = (metadata.get("stage_output") or {}).get("structured_description", "")
    matched_pattern = check_destructive_keywords(title, description, stage_desc)
    if matched_pattern:
        block_reason = f"destructive-keyword:{matched_pattern}"
        log_activity(TASK_ID, "evaluate", f"BLOCKED: destructive keyword matched: {matched_pattern}", {"blocked_by": "keyword-blocklist", "pattern": matched_pattern})
        log.warning("BLOCKED by keyword check: %s (matched '%s')", TASK_ID, matched_pattern)
        pulse_patch(f"/tasks/{TASK_ID}", {
            "metadata": {
                "evaluate_output": {"safe": False, "block_reason": block_reason,
                                    "blocked_by": "keyword-blocklist"},
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
                "evaluated_by": "keyword-blocklist",
            },
            "actor": "evaluate-service",
        })
        pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
            "precondition": {"label_value": "evaluated:processing"},
            "set_labels": ["evaluated:blocked", "blocked:yes", f"reason:{block_reason}"],
            "remove_labels": ["evaluated:processing", "blocked:no"],
            "actor": "evaluate-service",
        })
        return

    prompt = EVALUATE_PROMPT.format(
        task_id=TASK_ID,
        title=title,
        description=description or "(no description)",
        labels=", ".join(labels),
        metadata=json.dumps(metadata, indent=2) if metadata else "{}",
        personas=", ".join(personas),
    )

    response = call_ollama(prompt, MODEL)
    if not response:
        log.error("No Ollama response — reverting to evaluated:no")
        revert()
        return

    result = extract_json(response)
    if not result:
        log.error("Failed to parse Ollama response — reverting")
        revert()
        return

    is_safe = result.get("safe", True)
    pre_assigned = next((l.split(":", 1)[1] for l in labels if l.startswith("assigned:")), None)
    suggested_persona = result.get("persona", "autofix-executor")
    if suggested_persona not in personas and suggested_persona != "autofix-executor":
        log.warning("Persona '%s' not found — falling back to pre-assigned or autofix-executor", suggested_persona)
        suggested_persona = "autofix-executor"
    persona = pre_assigned if pre_assigned else suggested_persona
    decompose = result.get("decompose", False)
    current_depth = metadata.get("decomposition_depth", 0)
    if decompose and current_depth >= 2:
        log.info("Decomposition depth %d >= 2 — executing atomically", current_depth)
        decompose = False
    rewritten = result.get("rewritten_prompt")
    block_reason = result.get("block_reason")

    eval_metadata = {
        "evaluate_output": result,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "evaluated_by": MODEL,
    }

    if not is_safe:
        log.info("Task %s BLOCKED: %s", TASK_ID, block_reason)
        pulse_patch(f"/tasks/{TASK_ID}", {"metadata": eval_metadata, "actor": "evaluate-service"})
        pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
            "precondition": {"label_value": "evaluated:processing"},
            "set_labels": ["evaluated:blocked", "blocked:yes",
                           f"reason:{block_reason or 'safety'}"],
            "remove_labels": ["evaluated:processing", "blocked:no"],
            "actor": "evaluate-service",
        })
        return

    if rewritten:
        pulse_patch(f"/tasks/{TASK_ID}", {"description": rewritten, "actor": "evaluate-service"})

    add_labels = [f"assigned:{persona}"]

    if decompose and result.get("subtasks"):
        child_ids = []
        child_title_to_id = {}
        parent_labels = task.get("labels", [])
        inherited_labels = [l for l in parent_labels
                           if l.startswith(("project:", "phase:", "assigned:"))]
        subtasks = result["subtasks"]
        for i, st in enumerate(subtasks):
            if not isinstance(st, dict) or not st.get("title"):
                log.warning("Skipping invalid subtask: %s", st)
                continue
            child_labels = ["staging:wait", "evaluated:no", "queued:no", "active:no",
                            "completed:no", "blocked:no", f"parent:{TASK_ID}"] + inherited_labels
            parent_meta = task.get("metadata") or {}
            child_meta = {
                "parent_id": TASK_ID,
                "suggested_order": i,
                "sibling_count": len(subtasks),
                "decomposition_depth": current_depth + 1,
            }
            if parent_meta.get("model"):
                child_meta["model"] = parent_meta["model"]
            if parent_meta.get("source"):
                child_meta["source"] = parent_meta["source"]
            dep_title = st.get("depends_on")
            if dep_title and dep_title in child_title_to_id:
                child_meta["depends_on"] = [child_title_to_id[dep_title]]
            try:
                resp = requests.post(f"{PULSE_API}/tasks", json={
                    "title": st["title"],
                    "description": st.get("description", ""),
                    "priority": task.get("priority", 3),
                    "labels": child_labels,
                    "metadata": child_meta,
                    "actor": "evaluate-service",
                }, timeout=10)
                if resp.ok:
                    child_id = resp.json().get("id")
                    if child_id:
                        child_ids.append(child_id)
                        child_title_to_id[st["title"]] = child_id
                        log.info("Created subtask %s (order %d/%d): %s",
                                 child_id, i, len(subtasks), st.get("title", ""))
            except Exception as e:
                log.error("Failed to create subtask: %s", e)

        if child_ids:
            eval_metadata["decomposed"] = True
            eval_metadata["child_ids"] = child_ids

    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": eval_metadata, "actor": "evaluate-service"})
    pulse_post(f"/tasks/{TASK_ID}/labels", {"labels": add_labels, "actor": "evaluate-service"})

    conditional_claim(TASK_ID, "evaluated:processing", "evaluated:done",
                      actor="evaluate-service")
    remove_sidecar(sidecar)
    telemetry = get_ollama_telemetry()
    log_activity(TASK_ID, "evaluate", f"Evaluated: safe={is_safe}, persona={persona}, decompose={decompose}", {
        "model": MODEL,
        "safe": is_safe,
        "persona": persona,
        "decompose": decompose,
        "pre_assigned": pre_assigned,
        "confidence": result.get("confidence"),
        "ollama_telemetry": telemetry,
    })
    log.info("Task %s evaluated: safe=%s persona=%s decompose=%s",
             TASK_ID, is_safe, persona, decompose)


if __name__ == "__main__":
    main()
