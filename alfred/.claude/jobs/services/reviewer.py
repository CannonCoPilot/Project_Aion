#!/usr/bin/env python3
"""
reviewer.py — Pipeline v2 Review Service

Post-execution verification using local Ollama (default) or Claude CLI
(opt-in via metadata.review_engine == "claude-cli"). Checks if execution
output matches expectations. Triggers Diagnose on failure.

Engine routing (Phase 1.3.5 — token-compression):
  - default: call_ollama(REVIEW_MODEL) — qwen3:32b
  - opt-in : claude -p --output-format json (review_engine="claude-cli")

review_telemetry now carries an `engine` marker on both paths so the
pipeline-telemetry extractor can route per-row engine selection.
"""
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import archive_task, call_ollama, conditional_claim, extract_json, get_ollama_telemetry, log_activity, pulse_patch, pulse_post, remove_sidecar, write_sidecar
from observability import log_decision
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [reviewer] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("reviewer")

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
MODEL = os.environ.get("REVIEW_MODEL", "qwen3:32b")

PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", ".")).resolve()
HOST_PROJECT_DIR = os.environ.get("HOST_PROJECT_DIR", "")

def _host_to_container_path(p: str) -> Path:
    """Translate host-absolute paths to container-internal paths for fs checks."""
    if HOST_PROJECT_DIR and p.startswith(HOST_PROJECT_DIR):
        return PROJECT_DIR / p[len(HOST_PROJECT_DIR):].lstrip("/")
    return Path(p)

# Map reviewer's string-confidence levels to log_decision's float scale.
_CONFIDENCE_MAP = {"high": 0.9, "medium": 0.6, "low": 0.3}

REVIEW_PROMPT = """You are a task execution reviewer. Evaluate whether a task was completed successfully.

Task: {title}
Description: {description}
Expected output: {expected_output}

Execution summary from context:
{context_summary}

Filesystem verification results (automated checks):
{filesystem_report}

Questions to answer:
1. Did the execution address the task objective?
2. Were the expected files modified (if applicable)?
3. Do the filesystem checks confirm files were actually created/modified?
4. Are there any obvious issues or incomplete work?
5. If filesystem checks found missing files, does the context summary explain why?

IMPORTANT: If filesystem checks show expected output files are MISSING, this is strong
evidence of failure — do NOT pass the task unless there is a valid explanation.

Output JSON:
{{
  "passed": true/false,
  "confidence": "high/medium/low",
  "issues": ["list of issues if any"],
  "summary": "brief assessment"
}}

Be brief.
/no_think"""  # token-compression Phase 1.3


def _verify_filesystem(task: dict) -> str:
    """Check if files claimed by context_summary actually exist on disk."""
    metadata = task.get("metadata", {}) or {}
    ctx = metadata.get("context_summary", {})
    stage_out = metadata.get("stage_output", {}) or {}
    checks = []

    files_modified = ctx.get("files_modified", []) if isinstance(ctx, dict) else []
    for f in files_modified:
        p = _host_to_container_path(f) if os.path.isabs(f) else PROJECT_DIR / f
        exists = p.exists()
        checks.append(f"{'FOUND' if exists else 'MISSING'}: {f}")
        if exists:
            stat = p.stat()
            age_min = (datetime.now(timezone.utc).timestamp() - stat.st_mtime) / 60
            checks.append(f"  Last modified: {age_min:.0f} minutes ago, size: {stat.st_size} bytes")

    expected_paths = stage_out.get("file_paths", [])
    for f in expected_paths:
        p = _host_to_container_path(f) if os.path.isabs(f) else PROJECT_DIR / f
        if f not in files_modified:
            exists = p.exists()
            checks.append(f"{'FOUND' if exists else 'NOT FOUND'} (expected): {f}")

    exec_log = metadata.get("executor_log")
    if exec_log:
        log_path = _host_to_container_path(exec_log) if os.path.isabs(exec_log) else Path(exec_log)
        if log_path.exists():
            checks.append(f"Executor log: {log_path.stat().st_size} bytes")
        else:
            checks.append(f"Executor log MISSING: {exec_log}")

    telemetry = metadata.get("telemetry", {})
    if telemetry:
        checks.append(f"Execution duration: {telemetry.get('duration_ms', 'unknown')}ms")
        if telemetry.get("files_touched"):
            checks.append(f"Files touched by executor: {', '.join(telemetry['files_touched'])}")

    return "\n".join(checks) if checks else "No filesystem artifacts to verify."



def main():
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)

    if not TASK_ID:
        log.error("No TASK_ID provided")
        sys.exit(1)

    task_json = os.environ.get("TASK_JSON")
    if task_json:
        task = json.loads(task_json)
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
    metadata = task.get("metadata", {}) or {}

    context_summary = metadata.get("context_summary",
                                   (metadata.get("stage_output") or {}).get("expected_output",
                                                                            "No execution context available"))
    expected_output = (metadata.get("stage_output") or {}).get("expected_output", "Not specified")

    filesystem_report = _verify_filesystem(task)
    log.info("Filesystem verification for %s:\n%s", TASK_ID, filesystem_report)

    log.info("Reviewing task %s: %s", TASK_ID, title)
    sidecar = write_sidecar(TASK_ID, "review")

    prompt = REVIEW_PROMPT.format(
        title=title,
        description=description,
        expected_output=expected_output,
        context_summary=json.dumps(context_summary) if isinstance(context_summary, dict) else str(context_summary),
        filesystem_report=filesystem_report,
    )

    engine = "ollama"
    response = call_ollama(prompt, MODEL)
    if not response:
        log.warning("No Ollama response — reverting to completed:no for retry")
        log_decision(
            "persona:reviewer",
            "review_outcome",
            "engine_failed",
            rationale="Ollama returned no response",
            confidence=0.0,
            downstream_effect={"engine": "ollama", "model": MODEL,
                               "revert_to_label": "completed:no"},
            task_id=TASK_ID,
        )
        conditional_claim(TASK_ID, "completed:reviewing", "completed:no",
                          actor="reviewer")
        return
    review_telemetry = get_ollama_telemetry()
    review_telemetry["engine"] = "ollama"
    model_used = MODEL

    result = extract_json(response)
    passed = result.get("passed", False) if result else False

    review_meta = {
        "review_output": result or {"passed": False, "summary": "LLM output unparseable — defaulted to fail"},
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": model_used,
        "review_telemetry": review_telemetry,
    }
    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": review_meta, "actor": "reviewer"})

    if passed:
        remove_sidecar(sidecar)
        log_activity(TASK_ID, "review", "PASSED review", {
            "model": model_used,
            "engine": engine,
            "confidence": result.get("confidence"),
            "review_telemetry": review_telemetry,
        })
        log.info("Task %s PASSED review (engine=%s)", TASK_ID, engine)
        log_decision(
            "persona:reviewer",
            "review_outcome",
            "passed",
            rationale=(result or {}).get("summary", "no summary"),
            confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
            downstream_effect={
                "engine": engine,
                "model": model_used,
                "issues": (result or {}).get("issues", []),
                "next_label": "completed:done",
                "task_archived": True,
            },
            task_id=TASK_ID,
        )
        archive_task(TASK_ID)
        pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
            "precondition": {"label_value": "completed:reviewing"},
            "set_labels": ["completed:done"],
            "remove_labels": ["completed:reviewing", "active:done"],
            "status": "closed",
            "actor": "reviewer",
        })
    else:
        fail_reason = result.get("summary", "unknown") if result else "parse error"
        remove_sidecar(sidecar)
        log_activity(TASK_ID, "review", f"FAILED review: {fail_reason}",
                     {"model": model_used, "engine": engine,
                      "retry_count": metadata.get("retry_count", 0) + 1})
        log.info("Task %s FAILED review: %s", TASK_ID, fail_reason)
        retry_count = metadata.get("retry_count", 0) + 1

        if retry_count >= 3:
            log.warning("Task %s exceeded max retries (%d) — blocking", TASK_ID, retry_count)
            log_decision(
                "persona:reviewer",
                "review_outcome",
                "blocked_max_retries",
                rationale=f"{fail_reason} (retry limit {retry_count} reached)",
                confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
                downstream_effect={
                    "engine": engine,
                    "model": model_used,
                    "retry_count": retry_count,
                    "issues": (result or {}).get("issues", []),
                    "set_labels": ["blocked:yes", "reason:max-retries", "completed:no"],
                },
                task_id=TASK_ID,
            )
            pulse_patch(f"/tasks/{TASK_ID}", {
                "metadata": {"retry_count": retry_count}, "actor": "reviewer"})
            pulse_post(f"/tasks/{TASK_ID}/conditional-update", {
                "precondition": {"label_value": "completed:reviewing"},
                "set_labels": ["blocked:yes", "reason:max-retries", "completed:no"],
                "remove_labels": ["completed:reviewing", "blocked:no"],
                "actor": "reviewer",
            })
        else:
            log_decision(
                "persona:reviewer",
                "review_outcome",
                "failed_diagnose_triggered",
                rationale=fail_reason,
                confidence=_CONFIDENCE_MAP.get((result or {}).get("confidence") or "", 0.5),
                downstream_effect={
                    "engine": engine,
                    "model": model_used,
                    "retry_count": retry_count,
                    "issues": (result or {}).get("issues", []),
                    "diagnose_launched": True,
                },
                task_id=TASK_ID,
            )
            pulse_patch(f"/tasks/{TASK_ID}", {
                "metadata": {"retry_count": retry_count}, "actor": "reviewer"})
            # Launch diagnose with visible logging
            diagnose_script = Path(__file__).parent / "diagnose.py"
            if diagnose_script.exists():
                svc_log_dir = Path(os.environ.get("PROJECT_DIR", ".")) / ".claude" / "logs" / "headless"
                svc_log_dir.mkdir(parents=True, exist_ok=True)
                svc_log = svc_log_dir / "service-diagnose.log"
                with open(svc_log, "a") as lf:
                    subprocess.Popen(
                        [sys.executable, str(diagnose_script)],
                        env={**os.environ, "TASK_ID": TASK_ID},
                        stdout=lf, stderr=lf, start_new_session=True,
                    )
                log.info("Launched diagnose for task %s (retry %d)", TASK_ID, retry_count)
            else:
                log.warning("diagnose.py not found — resetting task to staging directly")
                from _shared import pulse_label_remove
                stale = [l for l in task.get("labels", [])
                         if l.split(":")[0] in ("staging", "evaluated", "queued",
                                                "active", "completed", "blocked", "reason")]
                reset = ["staging:wait", "evaluated:no", "queued:no", "active:no",
                         "completed:no", "blocked:no"]
                for lbl in stale:
                    if lbl not in reset:
                        pulse_label_remove(TASK_ID, lbl)
                pulse_post(f"/tasks/{TASK_ID}/labels", {
                    "labels": reset, "actor": "reviewer"})
                pulse_patch(f"/tasks/{TASK_ID}", {"status": "open", "actor": "reviewer"})


if __name__ == "__main__":
    main()
