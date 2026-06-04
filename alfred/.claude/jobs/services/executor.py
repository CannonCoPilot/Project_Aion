#!/usr/bin/env python3
"""
executor.py — Pipeline v2 Execute Service

Launches Claude headless for a specific task. Reads task from Pulse,
builds prompt with persona context, runs claude -p, and updates labels.

Env vars (set by event-watcher):
  TASK_ID: The task to execute
  PULSE_API: Pulse API base URL
  PULSE_PORT: Pulse port number
  PROJECT_DIR: AIFred-Pro-Dev project root
  TASK_JSON: Optional pre-fetched task JSON
"""
import json
import logging
import os
import re
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from _shared import call_ollama_streaming, get_ollama_telemetry, load_persona_prompt, log_activity, pulse_get, pulse_patch, pulse_post, set_label
from observability import log_audit, log_cost, log_decision, notify_msgbus
from observability.thread import ensure_thread_id

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [executor] %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("executor")

TASK_ID = os.environ.get("TASK_ID", "")
PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")
PULSE_PORT = os.environ.get("PULSE_PORT", "8800")
PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", ".")).resolve()
# Host-side path for prompt generation — signal-delegation executes on the host,
# not inside Docker, so paths in prompts must be host-resolvable.
HOST_PROJECT_DIR = Path(os.environ.get("HOST_PROJECT_DIR", str(PROJECT_DIR)))
JOBS_DIR = Path(__file__).parent.parent
SIDECAR_DIR = JOBS_DIR / "active"
LOG_DIR = PROJECT_DIR / ".claude" / "logs" / "headless" / "executions"

SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ~200K tokens ≈ 800KB of JSONL/log text at ~4 bytes/token
COMPRESSED_MODE_BYTES = int(os.environ.get("COMPRESSED_MODE_BYTES", 800_000))

# Phase 5.5 — observability infra paths (must match executor.sh and lib/cost-log.sh)
COST_LEDGER_FILE = JOBS_DIR / "data" / "cost-ledger.jsonl"
AGENT_OUTPUT_DIR = PROJECT_DIR / ".claude" / "agent-output"
JOB_NAME = os.environ.get("JOB_NAME", "executor")

# Phase 5.5 — auth circuit breaker file (read by pipeline-watcher's fail_fast logic).
# Mirrors dispatcher.sh:999 / executor.sh:2044. 30-minute half-life enforced
# on the reader side so a stale file auto-clears.
AUTH_FAILURE_TIMESTAMP_FILE = JOBS_DIR / "state" / "auth-failure-timestamp"
JARVIS_SESSION_ID_FILE = JOBS_DIR / "state" / "jarvis-session-id"
EXECUTOR_MAX_BUDGET_USD = float(os.environ.get("EXECUTOR_MAX_BUDGET_USD", "1.50"))

# Auth-class regex — translated from executor.sh:832
_AUTH_ERROR_RE = re.compile(
    r"(HTTP[/ ]401|unauthorized|authentication_error|invalid.*api.key|"
    r"invalid.*credential|Please run /login|APIAuthenticationError)",
    re.IGNORECASE,
)
# Transient-class regex — translated from executor.sh:840
_TRANSIENT_ERROR_RE = re.compile(
    r'(500.*Internal server error|"type":\s*"api_error"|502 Bad Gateway|'
    r"503 Service Unavailable|529.*Overloaded|rate.limit|rate_limit|429|"
    r"ECONNRESET|ETIMEDOUT|socket hang up|overloaded_error)",
    re.IGNORECASE,
)
# Wrapped-API-error regex — caught even on exit 0 (executor.sh:847)
_WRAPPED_API_ERROR_RE = re.compile(
    r'"error".*"api_error".*"Internal server error"', re.IGNORECASE,
)


def _classify_error(exit_code: int, output: str) -> str:
    """Return 'auth', 'transient', or 'fatal' for the given subprocess output.

    Port of executor.sh:classify_error(). Matches the same regex set so the
    behavior is identical between bash and python paths.
    """
    if not output:
        return "fatal" if exit_code != 0 else "auth"  # unreachable in practice
    if exit_code != 0:
        if _AUTH_ERROR_RE.search(output):
            return "auth"
        if _TRANSIENT_ERROR_RE.search(output):
            return "transient"
    if _WRAPPED_API_ERROR_RE.search(output):
        return "transient"
    return "fatal"


def _trip_auth_circuit_breaker() -> None:
    """Write state/auth-failure-timestamp + emit activation audit.

    Mirrors executor.sh:2042-2045. Read by pipeline-watcher's fail_fast logic
    on the next process_task cycle. The 30-minute auto-clear lives on the
    reader side, not here.
    """
    try:
        AUTH_FAILURE_TIMESTAMP_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUTH_FAILURE_TIMESTAMP_FILE.write_text(str(int(datetime.now(timezone.utc).timestamp())))
    except OSError as e:
        log.error("Failed to write auth circuit breaker timestamp: %s", e)
        return
    log_audit(
        "system:executor", "system.auth_circuit_break", "config", "auth.circuit_breaker",
        details={"state": "active", "set_by": "executor.py", "task_id": TASK_ID},
    )
    log.error("Auth circuit breaker activated — wrote %s", AUTH_FAILURE_TIMESTAMP_FILE)

EPILOGUE = """

After completing all task work, produce a context summary as the LAST thing you output.
Format as JSON in <context-summary> tags:
<context-summary>
{
  "task_completed": "brief description of what was done",
  "files_modified": ["path1", "path2"],
  "key_findings": ["finding about codebase"],
  "gotchas": ["issues encountered"],
  "context_for_next": "relevant context for the next related task"
}
</context-summary>
"""



def _resolve_output_dir(task: dict) -> Path:
    """Derive an output directory from the task's project label.

    Returns host-side path (HOST_PROJECT_DIR) so prompts sent via signal-delegation
    reference paths the host Claude CLI can actually write to.
    Docker-internal mkdir uses PROJECT_DIR; prompt uses HOST_PROJECT_DIR.
    """
    labels = task.get("labels", [])
    project = "misc"
    for lbl in labels:
        if lbl.startswith("project:"):
            project = lbl.split(":", 1)[1]
            break
    (PROJECT_DIR / "output" / project).mkdir(parents=True, exist_ok=True)
    return HOST_PROJECT_DIR / "output" / project


def _fetch_parent_context(metadata: dict) -> str | None:
    """Walk up the parent chain to find the root task's full description."""
    parent_id = metadata.get("parent_id")
    visited = set()
    while parent_id and parent_id not in visited:
        visited.add(parent_id)
        parent = pulse_get(f"/tasks/{parent_id}")
        if not parent:
            break
        parent_meta = parent.get("metadata") or {}
        parent_desc = parent.get("description", "")
        if parent_meta.get("original_prompt"):
            return parent_meta["original_prompt"]
        if len(parent_desc) > 500:
            return parent_desc
        parent_id = parent_meta.get("parent_id")
    return None


def build_prompt(task: dict) -> str:
    title = task.get("title", "Untitled")
    description = task.get("description", "")
    metadata = task.get("metadata", {}) or {}
    stage_output = metadata.get("stage_output") or {}

    structured_desc = stage_output.get("structured_description", description)
    if not isinstance(structured_desc, str):
        structured_desc = "\n".join(str(x) for x in structured_desc) if isinstance(structured_desc, list) else str(structured_desc)
    expected_output = stage_output.get("expected_output", "")
    if isinstance(expected_output, list):
        expected_output = "\n".join(f"- {x}" for x in expected_output)
    scope = stage_output.get("scope", "")
    if not isinstance(scope, str):
        scope = str(scope)
    file_paths = stage_output.get("file_paths", [])

    parts = [f"# Task: {title}", "", "## Objective",
             structured_desc or description or "(no description)", ""]

    parent_context = _fetch_parent_context(metadata)
    if parent_context:
        parts.extend(["## Master Project Specification (from parent task — authoritative context)",
                       parent_context, ""])

    if description and structured_desc != description:
        parts.extend(["## Original Task Description (authoritative for file paths and steps)",
                       description, ""])
    if expected_output:
        parts.extend(["## Expected Output", expected_output, ""])
    if scope:
        parts.extend(["## Scope", scope, ""])
    if file_paths:
        parts.extend(["## Relevant Files (may be approximate — verify paths exist before using)",
                       "\n".join(f"- {f}" for f in file_paths), ""])

    output_dir = _resolve_output_dir(task)
    parts.extend([
        "## Output Directory",
        f"Write all output files to: {output_dir}",
        "",
        "## Task ID",
        f"Pulse task: {task.get('id', TASK_ID)}",
        "Do NOT close or update the Pulse task yourself. The pipeline handles task lifecycle automatically.",
        "", EPILOGUE,
    ])
    prompt = "\n".join(parts)
    prompt += "\n\nBe brief."  # token-compression Phase 1.2
    return prompt


def _propagate_chain_resume(session_id: str, context_summary: dict | None,
                            log_bytes: int = 0) -> None:
    """Propagate session ID + log size to the next task in the chain."""
    task_data = pulse_get(f"/tasks/{TASK_ID}")
    if not task_data:
        return
    meta = task_data.get("metadata", {}) or {}
    chain_id = meta.get("chain_id")
    chain_order = meta.get("chain_order")
    if chain_id is None or chain_order is None:
        return
    all_tasks = pulse_get("/tasks?status=open&limit=200")
    if not all_tasks:
        return
    for t in all_tasks.get("tasks", []):
        t_meta = t.get("metadata", {}) or {}
        if t_meta.get("chain_id") == chain_id and t_meta.get("chain_order") == chain_order + 1:
            resume_meta = {"chain_resume": session_id, "prior_log_bytes": log_bytes}
            if context_summary:
                resume_meta["prior_context_summary"] = context_summary
            pulse_patch(f"/tasks/{t['id']}", {"metadata": resume_meta})
            log.info("Propagated chain_resume=%s (log=%d bytes) to next task %s",
                     session_id, log_bytes, t["id"])
            return


def _extract_context_summary(log_path: Path) -> dict | None:
    """Parse <context-summary> JSON from executor log output."""
    try:
        text = log_path.read_text(errors="replace")
        match = re.search(r"<context-summary>\s*(\{.*?\})\s*</context-summary>", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
    except Exception as e:
        log.warning("Failed to extract context summary from %s: %s", log_path, e)
    return None


def _extract_telemetry(log_path: Path, start_time: datetime) -> dict:
    """Extract execution telemetry from log output and timing."""
    telemetry = {
        "duration_ms": int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000),
    }
    try:
        text = log_path.read_text(errors="replace")
        lines = text.splitlines()
        telemetry["log_lines"] = len(lines)
        tool_calls = sum(1 for l in lines if "tool_use" in l.lower() or "Tool:" in l)
        if tool_calls:
            telemetry["tool_calls"] = tool_calls
        files_modified = set()
        for l in lines:
            m = re.search(r"(?:Wrote|Edited|Created)\s+(\S+\.\w+)", l)
            if m:
                files_modified.add(m.group(1))
        if files_modified:
            telemetry["files_touched"] = sorted(files_modified)
    except Exception as e:
        log.warning("Telemetry extraction partial for %s: %s", log_path, e)
    return telemetry


def _check_daily_budget_gate(job_name: str, max_daily_budget: float) -> tuple[bool, dict]:
    """Pre-LLM daily budget check — port of executor.sh:1681-1758.

    Reads cost-ledger.jsonl, sums today's spend for `job_name`, emits
    log_decision for blocked (>=100%) or proceed_with_warning (>=80%) outcomes.

    Returns (blocked, info). info has spend_usd/budget_usd/pct_used/job
    even when not blocked, so callers can include it in details.
    """
    if max_daily_budget <= 0 or not COST_LEDGER_FILE.exists():
        return False, {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    spend = 0.0
    try:
        with COST_LEDGER_FILE.open() as f:
            for line in f:
                try:
                    row = json.loads(line)
                    if row.get("job") == job_name and row.get("ts", "")[:10] == today:
                        spend += float(row.get("cost", 0) or 0)
                except (json.JSONDecodeError, ValueError, TypeError):
                    continue
    except OSError as e:
        log.warning("Could not read cost ledger %s: %s", COST_LEDGER_FILE, e)
        return False, {}

    pct_used = round((spend / max_daily_budget) * 100, 1) if max_daily_budget else 0.0
    info = {"job": job_name, "spend_usd": round(spend, 4),
            "budget_usd": max_daily_budget, "pct_used": pct_used}

    if spend >= max_daily_budget:
        log_decision(
            "system:executor", "budget_gate", "blocked",
            alternatives=[{"option": "proceed", "score": 0.0},
                          {"option": "blocked", "score": 1.0}],
            signals_matched=[{"signal": "daily_cap_exceeded", "weight": 1.0}],
            confidence=1.0,
            rationale=(f"Daily budget hard-stop: {job_name} spent ${spend:.4f} of "
                       f"${max_daily_budget:.2f} cap ({pct_used}%). Execution blocked."),
            downstream_effect={**info, "action": "execution_aborted"},
        )
        # Pipeline-v2 alert dispatch — parity with executor.sh:1713-1729.
        # First exceed/job/day = critical (Telegram); subsequent = info (dashboard-only).
        notify_msgbus(
            source=f"executor:{job_name}",
            severity="critical",
            summary=(f"💸 Budget hard-stop: {job_name} spent ${spend:.4f} / "
                     f"${max_daily_budget:.2f} ({pct_used}%) — execution aborted"),
            data={**info, "action": "execution_aborted"},
            job=job_name,
            dedup_key=f"budget-blocked-{job_name}",
        )
        return True, info

    if pct_used >= 80.0:
        log_decision(
            "system:executor", "budget_gate", "proceed_with_warning",
            alternatives=[{"option": "proceed", "score": 0.8},
                          {"option": "blocked", "score": 0.2}],
            signals_matched=[{"signal": "soft_threshold_80pct", "weight": 0.8}],
            confidence=0.8,
            rationale=(f"Soft budget threshold: {job_name} at {pct_used}% of daily cap "
                       f"(${spend:.4f}/${max_daily_budget:.2f}). Proceeding but warning."),
            downstream_effect={**info, "action": "warn_and_proceed"},
        )
        # Pipeline-v2 alert dispatch — parity with executor.sh:1672-1675.
        # Soft threshold hits log to dashboard (info severity); not Telegram-paged.
        notify_msgbus(
            source=f"executor:{job_name}",
            severity="warning",
            summary=(f"⚠️ Budget soft alert: {job_name} at {pct_used}% of daily "
                     f"${max_daily_budget:.2f} cap (${spend:.4f})"),
            data={**info, "action": "warn_and_proceed"},
            job=job_name,
            dedup_key=f"budget-soft-{job_name}",
        )
    return False, info


_PERSONA_REPORT_GLOBS: dict[str, tuple[str, str]] = {
    "ai-david": ("results", "decisions-*.json"),
    "ai-reviewer": ("results", "decisions-*.json"),
    "aurora-think": ("aurora", "think-*.json"),
    "creative-think": ("aurora", "think-*.json"),
    "aurora-build": ("aurora", "build-*.json"),
    "aurora-brainstorm": ("aurora", "build-*.json"),
    "creative-build": ("aurora", "build-*.json"),
    "aurora-present": ("aurora", "present-*.json"),
    "creative-present": ("aurora", "present-*.json"),
    "aurora-feedback": ("aurora", "feedback-*.json"),
    "creative-feedback": ("aurora", "feedback-*.json"),
    "aurora-action": ("aurora", "action-*.json"),
    "creative-action": ("aurora", "action-*.json"),
}


def _resolve_persona_report_path(persona_name: str) -> tuple[Path, str]:
    """Map persona name to (report_dir, glob_pattern). Mirrors executor.sh case statement."""
    sub, glob_pat = _PERSONA_REPORT_GLOBS.get(persona_name, ("results", "*.json"))
    if sub == "aurora":
        return AGENT_OUTPUT_DIR / "aurora", glob_pat
    return AGENT_OUTPUT_DIR / "results" / persona_name, glob_pat


def _parse_and_emit_persona_decisions(persona_name: str, exec_start: datetime) -> int:
    """Phase 5.5 — walk SDK persona report's `decisions[]` array, emit log_decision per entry.

    Port of executor.sh:_parse_and_emit_persona_decisions. Only files modified at or
    after exec_start are considered. Best-effort — never raises.

    Returns the number of decision_events successfully emitted (0 means no fresh
    report, no decisions[] array, or all entries malformed).
    """
    report_dir, glob_pat = _resolve_persona_report_path(persona_name)
    if not report_dir.is_dir():
        return 0

    exec_start_ts = exec_start.timestamp()
    candidates: list[tuple[float, Path]] = []
    for p in report_dir.glob(glob_pat):
        try:
            mtime = p.stat().st_mtime
            if mtime >= exec_start_ts:
                candidates.append((mtime, p))
        except OSError:
            continue
    if not candidates:
        return 0
    candidates.sort(reverse=True)
    report_file = candidates[0][1]

    try:
        report = json.loads(report_file.read_text())
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Phase 5.5: failed to load persona report %s: %s", report_file, e)
        return 0

    decisions = report.get("decisions") if isinstance(report, dict) else None
    if not isinstance(decisions, list) or not decisions:
        return 0

    actor = f"persona:{persona_name}"
    emitted = 0
    for i, entry in enumerate(decisions):
        if not isinstance(entry, dict):
            continue
        decision_type = entry.get("decision_type") or ""
        outcome = entry.get("outcome") or ""
        if not decision_type or not outcome:
            log.warning("Phase 5.5: skipping malformed decision #%d from %s "
                        "(missing decision_type or outcome)", i, persona_name)
            continue
        confidence_raw = entry.get("confidence")
        try:
            confidence = float(confidence_raw) if confidence_raw is not None else None
        except (ValueError, TypeError):
            confidence = None
        if log_decision(
            actor, decision_type, outcome,
            alternatives=entry.get("alternatives"),
            signals_matched=entry.get("signals_matched"),
            confidence=confidence,
            rationale=entry.get("rationale"),
            downstream_effect=entry.get("downstream_effect"),
            task_id=entry.get("task_id"),
        ):
            emitted += 1
    if emitted:
        log.info("Phase 5.5: emitted %d decision_events from %s persona report (%s)",
                 emitted, persona_name, report_file.name)
    return emitted


def _emit_task_release_to_queue(task_id: str, signal_name: str, detail: str) -> None:
    """Phase 5.5 — paired task.released audit + task_release released_to_queue decision.

    Called from each failure branch (exit_nonzero / timeout / exception / no_response).
    Mirrors executor.sh:2056-2073 (release-after-failure) symmetric counterpart to the
    success-branch release at executor.sh:2440-2451.
    """
    log_audit("system:executor", "task.released", "task", task_id, details={
        "from_stage": "execute", "to_stage": "queue",
        "reason": signal_name, "detail": detail,
    })
    log_decision(
        "system:executor", "task_release", "released_to_queue",
        alternatives=[{"option": "released_to_queue", "score": 0.9},
                      {"option": "retained_as_failed", "score": 0.1}],
        signals_matched=[{"signal": signal_name, "weight": 1.0}],
        confidence=0.9,
        rationale=(f"Execution failed ({signal_name}: {detail}). Releasing claim on "
                   f"{task_id} so dispatcher can re-dispatch on next cycle. Label "
                   "transitioned active:running→active:no."),
        downstream_effect={"task_id": task_id, "signal": signal_name,
                           "label_transition": "active:running→active:no"},
        task_id=task_id,
    )


def _execute_ollama(task: dict, model: str, session_id: str, persona_name: str) -> bool:
    """Execute a text-generation task via local Ollama model (no tool use).

    Returns True on success, False on failure. Writes output to a file in
    the project directory and stores telemetry in task metadata.
    """
    prompt = build_prompt(task)
    # Ollama models never get persona prompts — personas are designed for
    # Claude CLI with tool use (file access, NAS paths, domain constraints).
    # Ollama can't use tools, so persona prompts just cause hallucination.

    log.info("Ollama execution: task %s with model %s", TASK_ID, model)

    # Phase 5.5 — task_claim parity for Ollama path (mirrors claude branch in main()).
    claim_ok = set_label(TASK_ID, "active:claiming", "active:running")
    if claim_ok:
        log_audit("system:executor", "task.claimed", "task", TASK_ID, details={
            "persona": persona_name, "model": model, "engine": "ollama",
            "session_id": session_id,
        })
        log_decision(
            "system:executor", "task_claim", "claimed",
            alternatives=[{"option": "claimed", "score": 1.0},
                          {"option": "race_lost", "score": 0.0}],
            signals_matched=[{"signal": "label_transition_succeeded", "weight": 1.0}],
            confidence=1.0,
            rationale=f"Ollama claim transition succeeded for {TASK_ID} (model={model}).",
            downstream_effect={"task_id": TASK_ID, "engine": "ollama",
                               "stage_transition": "claiming→running"},
            task_id=TASK_ID,
        )
    else:
        log_decision(
            "system:executor", "task_claim", "race_lost",
            alternatives=[{"option": "claimed", "score": 0.0},
                          {"option": "race_lost", "score": 1.0}],
            signals_matched=[{"signal": "label_transition_failed_precondition", "weight": 1.0}],
            confidence=1.0,
            rationale=f"Ollama claim failed for {TASK_ID}; another executor owns it.",
            downstream_effect={"task_id": TASK_ID, "engine": "ollama", "action": "abort_cycle"},
            task_id=TASK_ID,
        )
        log.warning("Ollama task %s claim transition failed (race lost) — exiting", TASK_ID)
        return False

    live_file = LOG_DIR / f"live-{TASK_ID}.jsonl"
    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": {"live_file": str(live_file)}})

    response = call_ollama_streaming(prompt, model, live_file)
    telemetry = get_ollama_telemetry()

    if not response:
        log.error("Ollama returned no response for task %s", TASK_ID)
        set_label(TASK_ID, "active:running", "active:no")
        pulse_patch(f"/tasks/{TASK_ID}", {"metadata": {"last_error": "ollama_no_response"}})
        log_audit("system:executor", "task.failed", "task", TASK_ID, details={
            "persona": persona_name, "model": model, "engine": "ollama",
            "reason": "no_response",
        })
        _emit_task_release_to_queue(TASK_ID, "ollama_no_response",
                                    "empty response from Ollama")
        return False

    log_file = LOG_DIR / f"v2-executor-{TASK_ID}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
    log_file.write_text(response)
    log_bytes = log_file.stat().st_size

    title_slug = re.sub(r'[^a-z0-9]+', '-', task.get("title", "output").lower())[:40]
    output_dir = _resolve_output_dir(task)
    output_file = output_dir / f"{title_slug}.md"
    output_file.write_text(response)
    log.info("Ollama output written to %s (%d bytes)", output_file, len(response))

    context_summary = _extract_context_summary(log_file)
    exec_meta = {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "executor_session": session_id,
        "executor_persona": persona_name,
        "executor_model": model,
        "executor_engine": "ollama",
        "executor_log": str(log_file),
        "executor_log_bytes": log_bytes,
        "output_file": str(output_file),
        "telemetry": {
            "duration_ms": telemetry.get("total_duration_ms", 0),
            "prompt_tokens": telemetry.get("prompt_tokens", 0),
            "completion_tokens": telemetry.get("completion_tokens", 0),
            "log_lines": len(response.splitlines()),
            "files_touched": [str(output_file)],
            "ollama": telemetry,
        },
    }
    if context_summary:
        exec_meta["context_summary"] = context_summary

    log_activity(TASK_ID, "execute", f"Completed via Ollama ({model})", {
        "session_id": session_id, "persona": persona_name,
        "duration_ms": telemetry.get("total_duration_ms", 0),
        "prompt_tokens": telemetry.get("prompt_tokens", 0),
        "completion_tokens": telemetry.get("completion_tokens", 0),
        "engine": "ollama",
    })
    log.info("Task %s completed via Ollama in %dms (%d prompt + %d completion tokens)",
             TASK_ID, telemetry.get("total_duration_ms", 0),
             telemetry.get("prompt_tokens", 0), telemetry.get("completion_tokens", 0))

    set_label(TASK_ID, "active:running", "active:done")

    # Phase 5.5 — cost-ledger row for Ollama (cost=0 for local models; keeps row counts
    # consistent across engines and surfaces token usage in pulse.cost_events).
    ollama_cost_row = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "job": JOB_NAME,
        "persona": persona_name,
        "model": model,
        "engine": "ollama",
        "cost": 0.0,
        "input_tokens": telemetry.get("prompt_tokens", 0),
        "output_tokens": telemetry.get("completion_tokens", 0),
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
        "cache_hit_ratio": 0.0,
        "duration_s": (telemetry.get("total_duration_ms", 0) or 0) // 1000,
        "success": True,
        "router_model": None,
        "router_overridden": False,
        "company": None,
    }
    log_cost(ollama_cost_row, task_id=TASK_ID)

    log_audit("system:executor", "task.completed", "task", TASK_ID, details={
        "persona": persona_name, "model": model, "engine": "ollama",
        "duration_ms": telemetry.get("total_duration_ms", 0),
        "prompt_tokens": telemetry.get("prompt_tokens", 0),
        "completion_tokens": telemetry.get("completion_tokens", 0),
        "session_id": session_id,
    })
    log_audit("system:executor", "job.cost_recorded", "budget", JOB_NAME, details={
        "model": model, "engine": "ollama", "cost_usd": 0.0,
        "input_tokens": telemetry.get("prompt_tokens", 0),
        "output_tokens": telemetry.get("completion_tokens", 0),
        "task_id": TASK_ID,
    })
    log_audit("system:executor", "task.released", "task", TASK_ID, details={
        "from_stage": "execute", "to_stage": "done",
        "reason": "successful_completion", "engine": "ollama",
    })
    log_decision(
        "system:executor", "task_release", "released_after_success",
        alternatives=[{"option": "released_after_success", "score": 1.0},
                      {"option": "retained", "score": 0.0}],
        signals_matched=[{"signal": "execution_exit_zero", "weight": 1.0}],
        confidence=1.0,
        rationale=(f"Ollama execution complete for {TASK_ID} ({model}). "
                   "Label transitioned active:running→active:done."),
        downstream_effect={"task_id": TASK_ID, "engine": "ollama",
                           "label_transition": "active:running→active:done"},
        task_id=TASK_ID,
    )

    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": exec_meta})
    _propagate_chain_resume(session_id, context_summary, log_bytes=log_bytes)
    return True


MAX_ATTEMPTS_PER_24H = int(os.environ.get("MAX_ATTEMPTS_PER_24H", "3"))

HARD_BLOCK_PATTERNS = [
    re.compile(r"docker[-_]?compose", re.IGNORECASE),
    re.compile(r"infrastructure/[a-zA-Z0-9_-]*compose", re.IGNORECASE),
    re.compile(r"\.git/(config|hooks/|objects/|refs/)", re.IGNORECASE),
    re.compile(r"credentials\.yaml", re.IGNORECASE),
    re.compile(r"\.env(\.|\s|$)", re.IGNORECASE),
    re.compile(r"\.ssh/", re.IGNORECASE),
    re.compile(r"force[ -]push", re.IGNORECASE),
]


def _check_attempt_budget(task: dict, exec_attempts: int) -> tuple[bool, dict]:
    """Auto-park task after MAX_ATTEMPTS_PER_24H executions.

    Why: investigation 2026-05-06 found a task (AION-4ad1bff9) evaluated 19x
    over 7.5 hours at $0.35-$0.64/run because PAUSE-routing was unreliable.
    Capping attempts bounds the cost of any unreliable-route or persistent
    pre-check-match-but-LLM-refuses case.

    Returns (blocked, info). When blocked, parks task and emits audit + decision events.
    """
    if exec_attempts <= MAX_ATTEMPTS_PER_24H:
        return False, {"attempts": exec_attempts, "max": MAX_ATTEMPTS_PER_24H}

    task_id = task.get("id", TASK_ID)
    pulse_post(f"/tasks/{task_id}/labels", {"labels": ["parked", "safety:attempts-exceeded"]})
    set_label(task_id, "active:claiming", "active:no")
    log_audit("system:executor", "task.parked.attempts_exceeded", "task", task_id, details={
        "attempts": exec_attempts,
        "max_attempts": MAX_ATTEMPTS_PER_24H,
        "policy": "auto-park-after-N-attempts-2026-05-06",
    })
    log_decision(
        "system:executor", "task_park", "attempts_exceeded",
        alternatives=[{"option": "execute", "score": 0.0},
                      {"option": "park", "score": 1.0}],
        signals_matched=[{"signal": "executor_attempts", "weight": 1.0, "value": exec_attempts}],
        confidence=1.0,
        rationale=(f"Task {task_id} attempted {exec_attempts}x; policy limit is "
                   f"{MAX_ATTEMPTS_PER_24H}. Auto-parked to halt repeated-evaluation "
                   "cost. Operator must review and unpark manually."),
        downstream_effect={"task_id": task_id, "labels_added": ["parked", "safety:attempts-exceeded"]},
        task_id=task_id,
    )
    return True, {"attempts": exec_attempts, "max": MAX_ATTEMPTS_PER_24H}


def _check_hard_safety_preflight(task: dict) -> tuple[bool, dict]:
    """Pre-flight refusal for tasks the LLM persona will hard-fail.

    Why: investigation 2026-05-06 found pre_check too coarse — it matches any
    pipeline:approved + non-blocked task, even if that task contains a hard-rule
    violation (e.g. docker-compose edit, rule #4). Each match wastes ~$0.40 of
    LLM evaluation to re-discover the refusal.

    This function inspects the task's title + description for hard-block patterns
    and refuses pre-flight, applying labels {parked, safety:hard-block, waiting:human}.

    Returns (blocked, info). Patterns list is conservative; expand based on
    persona prompt audit. Attempt budget catches anything missed at N=3.
    """
    text = " ".join([
        task.get("title", "") or "",
        task.get("description", "") or "",
        task.get("notes", "") or "",
    ])
    matched = []
    for pat in HARD_BLOCK_PATTERNS:
        m = pat.search(text)
        if m:
            matched.append(m.re.pattern)
    if not matched:
        return False, {}

    task_id = task.get("id", TASK_ID)
    pulse_post(f"/tasks/{task_id}/labels", {"labels": ["parked", "safety:hard-block", "waiting:human"]})
    set_label(task_id, "active:claiming", "active:no")
    log_audit("system:executor", "task.parked.safety_hard_block", "task", task_id, details={
        "matched_patterns": matched,
        "policy": "preflight-hard-rule-mirror-2026-05-06",
    })
    log_decision(
        "system:executor", "task_park", "safety_hard_block",
        alternatives=[{"option": "execute", "score": 0.0},
                      {"option": "park", "score": 1.0}],
        signals_matched=[{"signal": f"hard_block_pattern:{p}", "weight": 1.0} for p in matched],
        confidence=1.0,
        rationale=(f"Task {task_id} content matches hard-block pattern(s) {matched}. "
                   "LLM persona would refuse this task (mirror of in-loop hard-rule "
                   "check). Pre-flight refusal saves the LLM evaluation cost. "
                   "Routed to {parked, safety:hard-block, waiting:human}."),
        downstream_effect={"task_id": task_id, "matched_patterns": matched,
                           "labels_added": ["parked", "safety:hard-block", "waiting:human"]},
        task_id=task_id,
    )
    return True, {"matched_patterns": matched}


def main():
    # Phase 5.2/5.8 — ensure NEXUS_THREAD_ID is set so audit/decision/cost
    # events from this service correlate as a single execution thread.
    thread_id = ensure_thread_id()
    log.info("Thread ID: %s", thread_id)

    if not TASK_ID:
        log.error("No TASK_ID provided")
        sys.exit(1)

    # Phase 5.5 — process-boundary audit (job.started parity with executor.sh:1777)
    log_audit("system:executor", "job.started", "service", JOB_NAME, details={
        "task_id": TASK_ID, "thread_id": thread_id, "engine": "pipeline-v2",
    })

    task_json = os.environ.get("TASK_JSON")
    if task_json:
        try:
            task = json.loads(task_json)
        except (json.JSONDecodeError, TypeError) as e:
            log.error("Invalid TASK_JSON: %s", e)
            sys.exit(1)
    else:
        task = pulse_get(f"/tasks/{TASK_ID}")
        if not task:
            log.error("Failed to fetch task %s", TASK_ID)
            sys.exit(1)

    labels = task.get("labels", [])
    metadata = task.get("metadata", {}) or {}

    persona_name = "autofix-executor"
    persona_source = "default-fallback"
    for lbl in labels:
        if lbl.startswith("assigned:"):
            persona_name = lbl.split(":", 1)[1]
            persona_source = "from-assigned-label"
            break

    model = (metadata.get("model")
             or os.environ.get("EXECUTOR_MODEL")
             or "claude-sonnet-4-6")

    session_id = str(uuid.uuid4())
    exec_attempts = metadata.get("executor_attempts", 0) + 1
    pulse_patch(f"/tasks/{TASK_ID}", {"metadata": {"executor_attempts": exec_attempts}})
    log_activity(TASK_ID, "execute", f"Started: persona={persona_name}, attempt={exec_attempts}", {
        "persona": persona_name, "session_id": session_id, "attempt": exec_attempts,
    })

    # 2026-05-06 — pre-flight hard-safety + attempt-budget gates.
    # Both gates park the task with {parked, ...} labels; pre_check filter
    # excludes 'parked' so subsequent dispatcher cycles will not re-trip these.
    hard_blocked, hb_info = _check_hard_safety_preflight(task)
    if hard_blocked:
        log.warning("Hard-safety preflight refusal for %s: matched=%s", TASK_ID, hb_info["matched_patterns"])
        log_audit("system:executor", "job.failed", "job", JOB_NAME, details={
            "reason": "hard_safety_preflight", "task_id": TASK_ID, **hb_info,
        })
        sys.exit(2)

    attempts_blocked, ab_info = _check_attempt_budget(task, exec_attempts)
    if attempts_blocked:
        log.warning("Attempt budget exceeded for %s (%d/%d) — auto-parked",
                    TASK_ID, ab_info["attempts"], ab_info["max"])
        log_audit("system:executor", "job.failed", "job", JOB_NAME, details={
            "reason": "attempts_exceeded", "task_id": TASK_ID, **ab_info,
        })
        sys.exit(2)

    # Phase 5.5 — record persona-selection rationale
    log_decision(
        "system:executor",
        "persona_selection",
        persona_name,
        rationale=f"persona resolved via {persona_source}",
        confidence=1.0 if persona_source == "from-assigned-label" else 0.5,
        task_id=TASK_ID,
        downstream_effect={"executor_persona": persona_name, "executor_model": model},
    )
    log.info("Executing task %s with persona %s (model: %s, session: %s, attempt: %d)",
             TASK_ID, persona_name, model, session_id, exec_attempts)

    # Phase 5.5 — daily budget gate (parity with executor.sh:1681-1758).
    # MAX_DAILY_BUDGET=0 disables the gate (default).
    max_daily_budget = float(os.environ.get("MAX_DAILY_BUDGET", "0") or 0)
    blocked, gate_info = _check_daily_budget_gate(JOB_NAME, max_daily_budget)
    if blocked:
        log.error("Daily budget exceeded for %s ($%.4f / $%.2f, %.1f%%) — aborting task %s",
                  JOB_NAME, gate_info.get("spend_usd", 0), gate_info.get("budget_usd", 0),
                  gate_info.get("pct_used", 0), TASK_ID)
        # Release the claiming label so dispatcher can defer/retry rather than stuck-active.
        set_label(TASK_ID, "active:claiming", "active:no")
        log_audit("system:executor", "job.failed", "job", JOB_NAME, details={
            "reason": "daily_budget_exceeded",
            "task_id": TASK_ID,
            **gate_info,
        })
        sys.exit(2)

    # Route to Ollama for local models (no tool use — text generation only)
    is_ollama = not model.startswith("claude-") and ":" in model
    if is_ollama:
        success = _execute_ollama(task, model, session_id, persona_name)
        sys.exit(0 if success else 1)

    # BUG-1 FIX: Remove active:claiming (set by event-watcher), not active:no.
    # Phase 5.5 — emit task_claim claimed/race_lost decisions based on transition outcome.
    claim_ok = set_label(TASK_ID, "active:claiming", "active:running")
    if claim_ok:
        log_audit("system:executor", "task.claimed", "task", TASK_ID, details={
            "persona": persona_name, "model": model,
            "attempt": exec_attempts, "session_id": session_id,
        })
        log_decision(
            "system:executor", "task_claim", "claimed",
            alternatives=[{"option": "claimed", "score": 1.0},
                          {"option": "race_lost", "score": 0.0}],
            signals_matched=[{"signal": "label_transition_succeeded", "weight": 1.0}],
            confidence=1.0,
            rationale=(f"Successfully claimed task {TASK_ID} for execution by {JOB_NAME} "
                       f"(persona={persona_name}, model={model}). Label transitioned "
                       "active:claiming→active:running."),
            downstream_effect={"task_id": TASK_ID, "job": JOB_NAME, "persona": persona_name,
                               "stage_transition": "claiming→running"},
            task_id=TASK_ID,
        )
    else:
        log_decision(
            "system:executor", "task_claim", "race_lost",
            alternatives=[{"option": "claimed", "score": 0.0},
                          {"option": "race_lost", "score": 1.0}],
            signals_matched=[{"signal": "label_transition_failed_precondition", "weight": 1.0}],
            confidence=1.0,
            rationale=(f"Task {TASK_ID} active:claiming label missing or already transitioned. "
                       "Aborting to avoid double-execution; another executor (or watcher cycle) "
                       "owns this task."),
            downstream_effect={"task_id": TASK_ID, "job": JOB_NAME, "action": "abort_cycle"},
            task_id=TASK_ID,
        )
        log.warning("Task %s claim transition failed (race lost) — exiting", TASK_ID)
        sys.exit(0)

    try:
        prompt = build_prompt(task)
    except Exception as e:
        log.error("Failed to build prompt for %s: %s", TASK_ID, e)
        set_label(TASK_ID, "active:running", "active:no")
        sys.exit(1)

    log_file = LOG_DIR / f"v2-executor-{TASK_ID}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"

    sidecar_path = SIDECAR_DIR / f"{TASK_ID}.exec.json"
    sidecar_path.write_text(json.dumps({
        "task_id": TASK_ID,
        "session_id": session_id,
        "persona": persona_name,
        "model": model,
        "pid": os.getpid(),
        "start_time": datetime.now(timezone.utc).isoformat(),
        "prompt_preview": prompt[:200],
        "log_file": str(log_file),
    }, indent=2))

    persona_prompt = load_persona_prompt(persona_name)
    if persona_prompt:
        log_audit("system:executor", "persona.loaded", "persona", persona_name, details={
            "task_id": TASK_ID, "prompt_bytes": len(persona_prompt),
        })
    else:
        if persona_source == "from-assigned-label":
            log_audit("system:executor", "persona.error", "persona", persona_name, details={
                "task_id": TASK_ID, "reason": "prompt_load_failed",
            })
            notify_msgbus(
                source="executor:persona",
                severity="warning",
                summary=(f"⚠️ Persona load failed: '{persona_name}' (assigned to "
                         f"{TASK_ID}) — falling back to default"),
                data={
                    "task_id": TASK_ID,
                    "persona_name": persona_name,
                    "reason": "prompt_load_failed",
                },
                dedup_key=f"persona-load-{persona_name}",
            )

    output_dir = _resolve_output_dir(task)

    chain_resume = metadata.get("chain_resume")
    if chain_resume:
        prior_log_bytes = metadata.get("prior_log_bytes", 0)
        prior_summary = metadata.get("prior_context_summary")
        if prior_log_bytes > COMPRESSED_MODE_BYTES and prior_summary:
            summary_text = json.dumps(prior_summary, indent=2) if isinstance(prior_summary, dict) else str(prior_summary)
            prompt = (f"[CONTEXT FROM PRIOR TASK IN CHAIN]\n{summary_text}\n\n"
                      f"Use the above context to inform your work on the current task.\n\n{prompt}")

    def cleanup(signum=None, frame=None):
        sidecar_path.unlink(missing_ok=True)
        set_label(TASK_ID, "active:running", "active:no")
        log.info("Executor killed (signal %s) — reset to active:no", signum)
        sys.exit(1)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    exec_timeout = int(metadata.get("timeout_minutes", 0)) * 60 or int(os.environ.get("EXECUTOR_TIMEOUT", "0")) or 900
    task_budget = float(metadata.get("max_budget_usd", 0)) or EXECUTOR_MAX_BUDGET_USD
    exec_start = datetime.now(timezone.utc)

    signal_dir = JOBS_DIR / "state"
    request_file = signal_dir / f"execute-request-{TASK_ID}.json"
    result_file = signal_dir / f"execute-result-{TASK_ID}.json"
    result_file.unlink(missing_ok=True)

    jarvis_session_id = None
    if JARVIS_SESSION_ID_FILE.exists():
        jarvis_session_id = JARVIS_SESSION_ID_FILE.read_text().strip() or None

    request_payload = {
        "task_id": TASK_ID,
        "session_id": session_id,
        "persona": persona_name,
        "persona_prompt": persona_prompt,
        "model": model,
        "prompt": prompt,
        "chain_resume": chain_resume if chain_resume and not (metadata.get("prior_log_bytes", 0) > COMPRESSED_MODE_BYTES) else None,
        "chain_id": metadata.get("chain_id", ""),
        "jarvis_session_id": jarvis_session_id,
        "max_budget_usd": task_budget,
        "output_dir": str(output_dir),
        "log_file": str(log_file),
        "timeout_minutes": exec_timeout // 60,
        "max_turns": int(os.environ.get("EXECUTOR_MAX_TURNS", "50")),
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    request_file.write_text(json.dumps(request_payload, indent=2))
    log.info("Signal file written: %s (delegating to host executor)", request_file.name)

    elapsed = 0
    poll_interval = 5
    while elapsed < exec_timeout:
        if result_file.exists():
            break
        time.sleep(poll_interval)
        elapsed += poll_interval

    try:
        if not result_file.exists():
            log.error("Task %s timed out waiting for host executor (%ds)", TASK_ID, exec_timeout)
            request_file.unlink(missing_ok=True)
            set_label(TASK_ID, "active:running", "active:no")
            pulse_patch(f"/tasks/{TASK_ID}", {"metadata": {"last_error": "host executor timeout"}})
            log_audit("system:executor", "task.timeout", "task", TASK_ID, details={
                "persona": persona_name, "model": model, "timeout_seconds": exec_timeout,
            })
            _emit_task_release_to_queue(TASK_ID, "timeout", f"timeout_after={exec_timeout}s")
            sidecar_path.unlink(missing_ok=True)
            sys.exit(1)

        result_data = json.loads(result_file.read_text())
        request_file.unlink(missing_ok=True)
        result_file.unlink(missing_ok=True)

        cli_data = result_data.get("cli_data", {})
        result_text = result_data.get("result_text", "")
        returncode = result_data.get("returncode", 1)

        class _Result:
            def __init__(self, rc, out, err):
                self.returncode = rc
                self.stdout = out
                self.stderr = err

        # Bridge-generated results: cli_data is sparse metadata (execution_mode),
        # result_text carries the actual output + <context-summary>. Preserve it.
        # CLI-generated results: cli_data is the full --output-format json blob.
        bridge_model = cli_data.get("actual_model") or cli_data.get("requested_model")
        bridge_provider = cli_data.get("provider")
        if bridge_model:
            model = bridge_model
            log.info("Bridge reported model=%s provider=%s (overriding executor-resolved)", model, bridge_provider)
        if cli_data and "result" not in cli_data and "session_id" not in cli_data:
            result = _Result(returncode, result_text, result_data.get("stderr", ""))
        else:
            result = _Result(
                returncode,
                json.dumps(cli_data) if cli_data else result_text,
                result_data.get("stderr", ""),
            )

        # Parse JSON output from --output-format json
        cli_data = {}
        result_text = result.stdout or ""
        try:
            cli_data = json.loads(result.stdout)
            result_text = cli_data.get("result", result.stdout)
        except (json.JSONDecodeError, TypeError):
            pass

        # Write the result text (not raw JSON) to the log file
        log_file.write_text(result_text + ("\n\n--- STDERR ---\n" + result.stderr if result.stderr else ""))

        if result.returncode == 0:
            # Build telemetry from CLI JSON (rich) + fallback to log parsing
            model_usage = cli_data.get("modelUsage", {})
            usage = cli_data.get("usage", {})
            first_model = next(iter(model_usage.values()), {}) if model_usage else {}

            telemetry = {
                "duration_ms": cli_data.get("duration_ms") or int((datetime.now(timezone.utc) - exec_start).total_seconds() * 1000),
                "duration_api_ms": cli_data.get("duration_api_ms"),
                "num_turns": cli_data.get("num_turns"),
                "total_cost_usd": cli_data.get("total_cost_usd"),
                "stop_reason": cli_data.get("stop_reason"),
                "input_tokens": first_model.get("inputTokens"),
                "output_tokens": first_model.get("outputTokens"),
                "cache_read_tokens": first_model.get("cacheReadInputTokens"),
                "cache_creation_tokens": first_model.get("cacheCreationInputTokens"),
                "context_window": first_model.get("contextWindow"),
                "service_tier": usage.get("service_tier"),
            }
            # Also extract file-level info from log text
            log_telemetry = _extract_telemetry(log_file, exec_start)
            telemetry["log_lines"] = log_telemetry.get("log_lines")
            telemetry["tool_calls"] = log_telemetry.get("tool_calls")
            telemetry["files_touched"] = log_telemetry.get("files_touched")
            # Per-model breakdown
            if model_usage:
                telemetry["model_usage"] = model_usage

            log_activity(TASK_ID, "execute", "Completed successfully", {
                "session_id": cli_data.get("session_id", session_id),
                "persona": persona_name,
                "model": model,
                "engine": bridge_provider or "claude",
                "duration_ms": telemetry["duration_ms"],
                "num_turns": telemetry.get("num_turns"),
                "cost_usd": telemetry.get("total_cost_usd"),
                "input_tokens": telemetry.get("input_tokens"),
                "output_tokens": telemetry.get("output_tokens"),
            })
            log.info("Task %s completed in %dms, %d turns, $%.4f (%d in + %d out tokens)",
                     TASK_ID, telemetry["duration_ms"],
                     telemetry.get("num_turns") or 0,
                     telemetry.get("total_cost_usd") or 0,
                     telemetry.get("input_tokens") or 0,
                     telemetry.get("output_tokens") or 0)
            set_label(TASK_ID, "active:running", "active:done")

            # Phase 5.2 — emit cost ledger row (Pulse cost_events + JSONL spool)
            cache_read = telemetry.get("cache_read_tokens") or 0
            cache_creation = telemetry.get("cache_creation_tokens") or 0
            input_tokens = telemetry.get("input_tokens") or 0
            cache_hit_ratio = (
                cache_read / (cache_read + input_tokens)
                if (cache_read + input_tokens) > 0 else 0.0
            )
            cost_row = {
                "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "job": "executor",
                "persona": persona_name,
                "model": model,
                "engine": bridge_provider or "claude",
                "cost": telemetry.get("total_cost_usd") or 0,
                "input_tokens": input_tokens,
                "output_tokens": telemetry.get("output_tokens") or 0,
                "cache_read_tokens": cache_read,
                "cache_creation_tokens": cache_creation,
                "cache_hit_ratio": round(cache_hit_ratio, 4),
                "duration_s": (telemetry["duration_ms"] or 0) // 1000,
                "success": True,
                "router_model": None,
                "router_overridden": False,
                "company": None,
            }
            log_cost(cost_row, task_id=TASK_ID)

            # Phase 5.2 — audit task completion
            log_audit("system:executor", "task.completed", "task", TASK_ID, details={
                "persona": persona_name, "model": model,
                "duration_ms": telemetry["duration_ms"],
                "cost_usd": telemetry.get("total_cost_usd"),
                "session_id": cli_data.get("session_id", session_id),
                "num_turns": telemetry.get("num_turns"),
            })

            # Phase 5.5 — paired cost-recorded audit (parity with executor.sh:2375)
            log_audit("system:executor", "job.cost_recorded", "budget", JOB_NAME, details={
                "model": model, "cost_usd": telemetry.get("total_cost_usd"),
                "input_tokens": input_tokens, "output_tokens": telemetry.get("output_tokens") or 0,
                "cache_read_tokens": cache_read, "cache_creation_tokens": cache_creation,
                "cache_hit_ratio": round(cache_hit_ratio, 4),
                "task_id": TASK_ID,
            })

            # Phase 5.5 — fan out persona report decisions[] to log_decision (executor.sh:2387-2394)
            _parse_and_emit_persona_decisions(persona_name, exec_start)

            # Phase 5.5 — task_release after successful execution (executor.sh:2440-2451)
            log_audit("system:executor", "task.released", "task", TASK_ID, details={
                "from_stage": "execute", "to_stage": "done",
                "reason": "successful_completion",
            })
            log_decision(
                "system:executor", "task_release", "released_after_success",
                alternatives=[{"option": "released_after_success", "score": 1.0},
                              {"option": "retained", "score": 0.0}],
                signals_matched=[{"signal": "execution_exit_zero", "weight": 1.0}],
                confidence=1.0,
                rationale=(f"Successful execution complete for {TASK_ID}. Label transitioned "
                           "active:running→active:done."),
                downstream_effect={"task_id": TASK_ID, "job": JOB_NAME,
                                   "label_transition": "active:running→active:done"},
                task_id=TASK_ID,
            )

            resolved_session = cli_data.get("session_id", session_id)
            exec_meta = {
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "executor_session": resolved_session,
                "executor_persona": persona_name,
                "executor_model": model,
                "executor_engine": bridge_provider or "signal-delegation",
                "executor_log": str(log_file),
                "telemetry": telemetry,
            }
            context_summary = _extract_context_summary(log_file)
            if context_summary:
                exec_meta["context_summary"] = context_summary
            log_bytes = log_file.stat().st_size if log_file.exists() else 0
            exec_meta["executor_log_bytes"] = log_bytes
            pulse_patch(f"/tasks/{TASK_ID}", {"metadata": exec_meta})
            _propagate_chain_resume(resolved_session, context_summary, log_bytes=log_bytes)
        else:
            log.error("Task %s failed (exit %d)", TASK_ID, result.returncode)
            set_label(TASK_ID, "active:running", "active:no")
            error_detail = cli_data.get("result", result.stderr[:500] if result.stderr else f"exit code {result.returncode}")
            # Phase 5.5 — classify error so pipeline-watcher fail_fast can react
            full_output = (result.stdout or "") + "\n" + (result.stderr or "")
            error_class = _classify_error(result.returncode, full_output)
            pulse_patch(f"/tasks/{TASK_ID}", {"metadata": {
                "last_error": error_detail,
                "last_error_class": error_class,
            }})
            log_audit("system:executor", "task.failed", "task", TASK_ID, details={
                "persona": persona_name, "model": model,
                "exit_code": result.returncode,
                "error_class": error_class,
                "error_preview": (str(error_detail)[:200] if error_detail else None),
            })
            # Auth class → trip the global circuit breaker (executor.sh:2042-2045 parity)
            if error_class == "auth":
                _trip_auth_circuit_breaker()
            _emit_task_release_to_queue(TASK_ID, f"exit_nonzero_{error_class}",
                                        f"exit_code={result.returncode}")

    except Exception as e:
        log.error("Executor error for %s: %s", TASK_ID, e)
        set_label(TASK_ID, "active:running", "active:no")
        log_audit("system:executor", "task.error", "task", TASK_ID, details={
            "persona": persona_name, "error": str(e)[:200],
        })
        _emit_task_release_to_queue(TASK_ID, "exception", str(e)[:200])

    finally:
        sidecar_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
