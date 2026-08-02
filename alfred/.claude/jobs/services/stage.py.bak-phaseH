#!/usr/bin/env python3
"""
stage.py — Pipeline v2 Stage Service

Converts raw task ideas/prompts into structured ticket objects using qwen3:32b.
Triggered by event-watcher when a task has staging:wait.

Env vars (set by event-watcher):
  TASK_ID: The task to stage
  PULSE_API: Pulse API base URL
  TASK_JSON: Optional pre-fetched task JSON
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import call_ollama, conditional_claim, extract_json, get_ollama_telemetry, log_activity, pulse_patch, pulse_post, remove_sidecar, write_sidecar
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [stage] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("stage")

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
MODEL = os.environ.get("STAGE_MODEL", "qwen3:32b")
PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", ".")).resolve()

STAGE_PROMPT = """You are a task staging assistant. Your job is to convert a raw task idea into a well-structured task description.

Given this raw task:
Title: {title}
Description: {description}
Labels: {labels}

Produce a structured version with:
1. A clear, actionable objective (1-2 sentences)
2. Expected output (what files change, what should be verified)
3. Scope boundaries (what NOT to touch)
4. Relevant file paths ONLY if explicitly mentioned in the description — do NOT infer or guess paths

Output as JSON:
{{
  "structured_description": "...",
  "expected_output": "...",
  "scope": "...",
  "file_paths": [],
  "suggested_type": "verify|bug|feature|refactor|research|infrastructure",
  "suggested_priority": "critical|high|medium|low|backlog"
}}

/no_think"""


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

    log.info("Staging task %s: %s", TASK_ID, title)
    sidecar = write_sidecar(TASK_ID, "stage")

    prompt = STAGE_PROMPT.format(
        title=title,
        description=description or "(no description provided)",
        labels=", ".join(labels) if labels else "(none)",
    )

    response = call_ollama(prompt, MODEL)

    def revert(reason: str):
        remove_sidecar(sidecar)
        pulse_patch(f"/tasks/{TASK_ID}", {
            "metadata": {
                "stage_error": reason,
                "stage_attempted_at": datetime.now(timezone.utc).isoformat(),
            },
            "actor": "stage-service",
        })
        conditional_claim(TASK_ID, "staging:processing", "staging:wait",
                          actor="stage-service")

    if not response:
        log.error("No response from Ollama — reverting to staging:wait")
        revert("ollama_no_response")
        return

    structured = extract_json(response)
    if not structured:
        log.error("Failed to parse Ollama JSON — reverting to staging:wait")
        revert("json_parse_failed")
        return

    raw_paths = structured.get("file_paths", [])
    if raw_paths:
        validated = []
        for fp in raw_paths:
            p = PROJECT_DIR / fp if not os.path.isabs(fp) else Path(fp)
            if p.exists():
                validated.append(fp)
            else:
                log.warning("Stage path not found (dropped): %s", fp)
        structured["file_paths"] = validated
        structured["unverified_paths"] = [p for p in raw_paths if p not in validated]

    new_desc = structured.get("structured_description", description)
    patch_payload = {
        "metadata": {
            "stage_output": structured,
            "staged_at": datetime.now(timezone.utc).isoformat(),
        },
        "actor": "stage-service",
    }
    if new_desc and new_desc != description:
        patch_payload["description"] = new_desc
    result = pulse_patch(f"/tasks/{TASK_ID}", patch_payload)
    if not result:
        log.warning("Failed to persist stage_output metadata for %s — downstream evaluate may lack structured data", TASK_ID)

    suggested_type = structured.get("suggested_type")
    if suggested_type:
        pulse_post(f"/tasks/{TASK_ID}/labels", {
            "labels": [f"type:{suggested_type}"],
            "actor": "stage-service",
        })

    conditional_claim(TASK_ID, "staging:processing", "staging:done",
                      actor="stage-service")
    remove_sidecar(sidecar)
    telemetry = get_ollama_telemetry()
    log_activity(TASK_ID, "stage", f"Staged: type={structured.get('suggested_type', 'unknown')}, priority={structured.get('suggested_priority', 'unknown')}", {
        "model": MODEL,
        "suggested_type": structured.get("suggested_type"),
        "file_paths_count": len(structured.get("file_paths", [])),
        "ollama_telemetry": telemetry,
    })
    log.info("Task %s staged successfully (type=%s, priority=%s)",
             TASK_ID,
             structured.get("suggested_type", "unknown"),
             structured.get("suggested_priority", "unknown"))


if __name__ == "__main__":
    main()
