#!/usr/bin/env python3
"""
diagnose.py — Pipeline v2 Diagnose Service

Reads task metadata from a failed execution, identifies failure mode,
redesigns the task prompt, and sends it back to staging:wait.
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import (call_ollama, extract_json, log_activity,
                      pulse_label_remove, pulse_patch, pulse_post)
from observability import log_audit, log_decision
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [diagnose] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("diagnose")

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
MODEL = os.environ.get("DIAGNOSE_MODEL", "qwen3:32b")
MAX_LIFECYCLE_RESETS = int(os.environ.get("MAX_LIFECYCLE_RESETS", "3"))

DIAGNOSE_PROMPT = """You are a task failure diagnostician. A task failed execution and review.

Task: {title}
Description: {description}
Review output: {review_output}
Retry count: {retry_count}

Execution context (if available):
{context_summary}

Diagnose the failure:
1. What went wrong? (hang, error, wrong output, missing context, scope too large?)
2. How should the task be redesigned to succeed on retry?
3. Should the persona be changed?
4. Should the task be split into smaller tasks?

Output JSON:
{{
  "failure_mode": "error|wrong_output|missing_context|scope_too_large|hang|unknown",
  "diagnosis": "brief explanation",
  "redesigned_prompt": "improved task description for retry",
  "change_persona": null or "new-persona-name",
  "should_split": false,
  "subtasks": []
}}

/no_think"""


def main():
    # Phase 5.2 — propagate / self-generate NEXUS_THREAD_ID for correlation
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)

    if not TASK_ID:
        log.error("No TASK_ID")
        sys.exit(1)

    try:
        r = requests.get(f"{PULSE_API}/tasks/{TASK_ID}", timeout=5)
        r.raise_for_status()
        task = r.json()
    except Exception as e:
        log.error("Fetch task %s: %s", TASK_ID, e)
        sys.exit(1)

    title = task.get("title", "")
    description = task.get("description", "")
    metadata = task.get("metadata", {}) or {}
    review_output = metadata.get("review_output", {})
    retry_count = metadata.get("retry_count", 0)
    diagnose_attempts = metadata.get("diagnose_attempts", 0)
    lifecycle_resets = metadata.get("lifecycle_resets", 0)

    if lifecycle_resets >= MAX_LIFECYCLE_RESETS:
        log.warning("Task %s exceeded lifecycle reset cap (%d/%d) — permanently blocking",
                     TASK_ID, lifecycle_resets, MAX_LIFECYCLE_RESETS)
        pulse_label_remove(TASK_ID, "blocked:diagnosing")
        pulse_post(f"/tasks/{TASK_ID}/labels", {
            "labels": ["blocked:yes", "reason:lifecycle-exhausted"],
            "actor": "diagnose-service",
        })
        pulse_label_remove(TASK_ID, "blocked:no")
        log_audit("system:diagnose", "task.lifecycle_exhausted", "task", TASK_ID, details={
            "lifecycle_resets": lifecycle_resets, "max": MAX_LIFECYCLE_RESETS,
        })
        return
    context_summary = metadata.get("context_summary", "Not available")
    exec_log_path = metadata.get("executor_log", "")
    exec_log_tail = ""
    if exec_log_path:
        try:
            from pathlib import Path
            lp = Path(exec_log_path)
            if lp.exists():
                text = lp.read_text(errors="replace")
                exec_log_tail = text[-2000:] if len(text) > 2000 else text
        except Exception:
            pass

    log.info("Diagnosing task %s (retry %d): %s", TASK_ID, retry_count, title)

    exec_context = json.dumps(context_summary) if isinstance(context_summary, dict) else str(context_summary)
    if exec_log_tail:
        exec_context += f"\n\nExecution log (last 2000 chars):\n{exec_log_tail}"

    prompt = DIAGNOSE_PROMPT.format(
        title=title,
        description=description,
        review_output=json.dumps(review_output),
        retry_count=retry_count,
        context_summary=exec_context,
    )

    response = call_ollama(prompt, MODEL)
    result = extract_json(response) if response else None

    # Phase 5.5 — record diagnose decision rationale
    failure_mode = (result or {}).get("failure_mode", "unknown")
    will_redesign = bool(result and result.get("redesigned_prompt"))
    will_change_persona = bool(result and result.get("change_persona"))
    log_decision(
        "system:diagnose",
        "diagnose_outcome",
        f"failure_mode:{failure_mode}",
        rationale=(result or {}).get("diagnosis", "LLM unavailable"),
        confidence=0.7 if result else 0.0,
        downstream_effect={
            "redesign_prompt": will_redesign,
            "change_persona": will_change_persona,
            "reset_to_staging": True,
            "diagnose_attempts": diagnose_attempts + 1,
        },
        task_id=TASK_ID,
    )

    diag_meta = {
        "diagnose_output": result or {"failure_mode": "unknown", "diagnosis": "LLM unavailable"},
        "diagnosed_at": datetime.now(timezone.utc).isoformat(),
        "diagnose_attempts": diagnose_attempts + 1,
        "lifecycle_resets": lifecycle_resets + 1,
        "executor_attempts": 0,
        "retry_count": 0,
    }

    if result and result.get("redesigned_prompt"):
        pulse_patch(f"/tasks/{TASK_ID}", {
            "description": result["redesigned_prompt"],
            "metadata": diag_meta,
            "actor": "diagnose-service",
        })
    else:
        pulse_patch(f"/tasks/{TASK_ID}", {
            "metadata": diag_meta,
            "actor": "diagnose-service",
        })

    if result and result.get("change_persona"):
        old_assigned = [l for l in task.get("labels", []) if l.startswith("assigned:")]
        for lbl in old_assigned:
            pulse_label_remove(TASK_ID, lbl)
        pulse_post(f"/tasks/{TASK_ID}/labels", {
            "labels": [f"assigned:{result['change_persona']}"],
            "actor": "diagnose-service",
        })

    reset_labels = ["staging:wait", "evaluated:no", "queued:no", "active:no",
                    "completed:no", "blocked:no"]
    stale_labels = [l for l in task.get("labels", [])
                    if l.split(":")[0] in ("staging", "evaluated", "queued", "active",
                                           "completed", "blocked", "reason")
                    and l not in reset_labels]
    for lbl in stale_labels:
        pulse_label_remove(TASK_ID, lbl)
    pulse_post(f"/tasks/{TASK_ID}/labels", {
        "labels": reset_labels,
        "actor": "diagnose-service",
    })
    pulse_patch(f"/tasks/{TASK_ID}", {"status": "open", "actor": "diagnose-service"})

    log.info("Task %s diagnosed and reset to staging (mode: %s)",
             TASK_ID, result.get("failure_mode", "unknown") if result else "unknown")

    log_activity(TASK_ID, "diagnose", f"Diagnosed: {failure_mode}", {
        "model": MODEL,
        "engine": "ollama",
        "failure_mode": failure_mode,
        "redesigned": will_redesign,
        "persona_changed": will_change_persona,
        "diagnose_attempts": diagnose_attempts + 1,
    })
    log_audit("system:diagnose", "task.diagnosed", "task", TASK_ID, details={
        "model": MODEL,
        "engine": "ollama",
        "failure_mode": failure_mode,
        "diagnose_attempts": diagnose_attempts + 1,
        "redesigned": will_redesign,
        "persona_changed": will_change_persona,
    })


if __name__ == "__main__":
    main()
