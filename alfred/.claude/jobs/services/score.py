#!/usr/bin/env python3
"""
score.py — Pipeline v2 Score Service (Phase D event-driven replacement)

Assigns risk:* routing labels to a single Pulse task using deterministic
heuristics over title + description + existing labels. No LLM required.

Plan B (ratified 2026-05-12): auto:* labels are V1 routing primitives consumed
only by the legacy shell layer (event-watcher.sh, pipeline-watchdog.sh,
team-runner.py, registry.yaml). V2 pipeline drives task advancement via
dimension labels (staging/evaluated/queued/active/completed/blocked) — auto:*
emission from the event-driven layer would produce labels nothing in v2 reads.
score.py therefore emits risk:* only; auto:* is intentionally absent.

Replaces the legacy task-score cron job from registry.yaml.

Invoked event-driven per task.created event by event-watcher.sh.

Usage:
    TASK_ID=AION-... python3 score.py
    python3 score.py --task-id AION-...
"""
import argparse
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from _shared import log_activity, pulse_get, pulse_post
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [score] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("score")


def determine_risk_label(labels: list, title: str, description: str) -> str | None:
    """Heuristic risk classification.
    Returns 'risk:safe', 'risk:moderate', 'risk:destructive', or None if already set."""
    if any(l.startswith("risk:") for l in labels):
        return None

    text = (title + " " + (description or "")).lower()

    destructive_keywords = [
        "force push", "force-push", "drop database", "drop table",
        "rm -rf", "delete all", "wipe ", "credentials", "secrets",
        "docker prune", "truncate ", "drop schema",
    ]
    if any(kw in text for kw in destructive_keywords):
        return "risk:destructive"

    moderate_keywords = [
        "config", "deploy", "docker", "compose", "schema", "migration",
        "multi-file", "multiple files", "restructure", "rename across",
        "api call", "endpoint", "database", "ci/cd", "production",
    ]
    if any(kw in text for kw in moderate_keywords):
        return "risk:moderate"

    return "risk:safe"


def score_task(task_id: str) -> dict:
    ensure_thread_id()
    start = datetime.now(timezone.utc)

    task = pulse_get(f"/tasks/{task_id}")
    if not task:
        log.error("Task %s not found", task_id)
        return {"task_id": task_id, "error": "not_found", "applied": []}

    labels = list(task.get("labels", []))
    title = task.get("title", "")
    description = task.get("description", "") or task.get("body", "")

    applied = []
    risk_label = determine_risk_label(labels, title, description)
    if risk_label:
        pulse_post(f"/tasks/{task_id}/labels",
                   {"labels": [risk_label], "actor": "score-service"})
        applied.append(risk_label)
        log.info("%s applied %s", task_id, risk_label)

    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    summary = (f"Scored: applied {','.join(applied)}" if applied
               else "Scored: risk already classified (no new labels)")
    log_activity(task_id, "score", summary,
                 {"applied": applied, "labels_before": labels})

    return {
        "task_id": task_id,
        "applied": applied,
        "labels_after": labels + applied,
        "duration_ms": duration_ms,
    }


def main():
    parser = argparse.ArgumentParser(description="Score a single Pulse task (risk:* only; Plan B)")
    parser.add_argument("--task-id", type=str, default=os.environ.get("TASK_ID"),
                        help="Task ID to score (or set TASK_ID env var)")
    args = parser.parse_args()

    if not args.task_id:
        log.error("No task ID. Pass --task-id or set TASK_ID env var.")
        sys.exit(1)

    result = score_task(args.task_id)
    if result.get("error"):
        sys.exit(2)
    log.info("Score complete: %s applied=%s duration=%dms",
             args.task_id, result["applied"], result["duration_ms"])


if __name__ == "__main__":
    main()
