#!/usr/bin/env python3
"""
pipeline-watcher.py — Pipeline State Machine Driver

Webhook-primary pipeline driver. Pulse fires webhooks on every label
mutation and task creation; the webhook handler triggers the appropriate
service immediately. A low-frequency heartbeat poll (default 300s) runs
as a safety net to catch missed webhooks, resolve dependency unblocks,
and collect executor telemetry.

Architecture:
  - Flask webhook server on port 8810 — PRIMARY event path
  - Heartbeat poll every 300s (POLL_INTERVAL) — safety net only
  - Label state machine maps task label dimensions to service actions
  - Watchdog runs on both paths to clean stuck states before triggering
  - Telemetry scraping detects dead executor PIDs on heartbeat cycles

Services spawned as subprocesses (subprocess.Popen):
  stage.py, evaluate.py, orchestrate.py, executor.py, reviewer.py, diagnose.py
"""
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [pipeline-watcher] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("pipeline-watcher")

# Force unbuffered output for real-time log visibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", SCRIPT_DIR / ".." / "..")).resolve()
STATE_DIR = SCRIPT_DIR / "state"
ACTIVE_DIR = SCRIPT_DIR / "active"
LOCK_FILE = STATE_DIR / "locks" / "pipeline-watcher.lock"
ORCHESTRATE_LOCK = STATE_DIR / "locks" / "orchestrate.lock"
PULSE_PORT = int(os.environ.get("PULSE_PORT", "8800"))
PULSE_API = os.environ.get("PULSE_API") or f"http://localhost:{PULSE_PORT}/api/v1"
os.environ["PULSE_API"] = PULSE_API
sys.path.insert(0, str(SCRIPT_DIR / "services"))
from _shared import conditional_claim, pulse_get, pulse_post, set_label, update_stage_label
from contextlib import contextmanager
from observability import log_audit, log_decision, notify_msgbus


@contextmanager
def _thread_id_scope(thread_id: str):
    """Temporarily override NEXUS_THREAD_ID env for observability emits in this scope.

    Phase 5.5 — pipeline-watcher emits decisions/audits per-task; using a fresh
    thread_id per emit prevents leakage into the next task's events. Storyline
    correlation across retries is preserved via task_id (the dashboard's primary
    join key).
    """
    prior = os.environ.get("NEXUS_THREAD_ID")
    os.environ["NEXUS_THREAD_ID"] = thread_id
    try:
        yield
    finally:
        if prior is None:
            os.environ.pop("NEXUS_THREAD_ID", None)
        else:
            os.environ["NEXUS_THREAD_ID"] = prior


def _pipe_watcher_thread_id(task_id: str) -> str:
    """Generate a fresh thread_id for this pipeline-watcher emit on `task_id`."""
    return f"pipe-watcher-{task_id}-{int(time.time())}"


# Phase 5.5 — auth circuit breaker (mirrors dispatcher.sh:998-1029 in pipeline-v2).
# 30-min half-life: file written by executor.py on auth-class errors;
# pipeline-watcher reads it and skips dispatch while fresh, auto-clears when stale.
AUTH_FAILURE_TIMESTAMP_FILE = SCRIPT_DIR / "state" / "auth-failure-timestamp"
AUTH_BREAKER_HALFLIFE_S = int(os.environ.get("AUTH_BREAKER_HALFLIFE_S", "1800"))


def _check_auth_circuit_breaker() -> tuple[bool, int]:
    """Return (active, age_seconds). Auto-clears the timestamp file when stale.

    active=True means "skip claude-engine dispatches"; pipeline-watcher emits a
    retry/fail_fast decision and returns without launching executor.
    """
    if not AUTH_FAILURE_TIMESTAMP_FILE.exists():
        return False, 0
    try:
        ts_str = AUTH_FAILURE_TIMESTAMP_FILE.read_text().strip()
        ts = int(ts_str) if ts_str else 0
    except (OSError, ValueError):
        return False, 0
    age = int(time.time()) - ts
    if age >= AUTH_BREAKER_HALFLIFE_S:
        # Stale → auto-clear and resume normal dispatch
        try:
            AUTH_FAILURE_TIMESTAMP_FILE.unlink(missing_ok=True)
        except OSError:
            pass
        log.info("Auth circuit breaker expired (age=%ds, halflife=%ds) — resumed",
                 age, AUTH_BREAKER_HALFLIFE_S)
        return False, age
    return True, age

WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT", "8810"))
WEBHOOK_CALLBACK_HOST = os.environ.get("WEBHOOK_CALLBACK_HOST", "host.docker.internal")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
SIDECAR_DIR = ACTIVE_DIR
MAX_CONCURRENT_EXECUTORS = 5
MAX_DIAGNOSE_ATTEMPTS = int(os.environ.get("MAX_DIAGNOSE_ATTEMPTS", "3"))
WEBHOOK_DEDUP_WINDOW = 2.0

# Cycle-exception observability: catch silent burst-failures like the
# AION-13dc7b96 incident (4466 error lines over 74h with no alert).
ALERT_ERROR_THRESHOLD = int(os.environ.get("ALERT_ERROR_THRESHOLD", "50"))
ALERT_WINDOW_SECONDS = int(os.environ.get("ALERT_WINDOW_SECONDS", "300"))  # 5 min

# Watchdog W1: consecutive-cycle-error counter — distinct signal from the
# burst-rate alert above. Catches persistent-failure modes where each cycle
# fails identically and cumulative count stays below the burst threshold
# (e.g. AION-13dc7b96: ~1 error/min for 74h never tripped 50/5min).
WATCHDOG_CYCLE_ERROR_THRESHOLD = int(os.environ.get("WATCHDOG_CYCLE_ERROR_THRESHOLD", "5"))

metrics = {
    "poll_cycles": 0,
    "webhook_events": 0,
    "webhook_deduped": 0,
    "webhook_unblocks": 0,
    "triggers": {"stage": 0, "evaluate": 0, "orchestrate": 0, "execute": 0, "review": 0, "diagnose": 0},
    "watchdog_resets": 0,
    "chain_blocks": 0,
    "claim_conflicts": 0,
    "task_processing_errors": 0,
    "cycle_exceptions": 0,
    "alerts_emitted": 0,
}

# Sliding-window error tracking: list of (timestamp, task_id, error_class) tuples.
_error_window: list[tuple[float, str, str]] = []

# Watchdog W1: consecutive-cycle-error counter. Reset on any successful cycle.
_consecutive_cycle_errors: int = 0

_webhook_seen: dict[str, float] = {}

STATE_DIR.mkdir(parents=True, exist_ok=True)
ACTIVE_DIR.mkdir(parents=True, exist_ok=True)
(STATE_DIR / "locks").mkdir(parents=True, exist_ok=True)

SERVICES = {
    "stage": SCRIPT_DIR / "services" / "stage.py",
    "evaluate": SCRIPT_DIR / "services" / "evaluate.py",
    "orchestrate": SCRIPT_DIR / "services" / "orchestrate.py",
    "execute": SCRIPT_DIR / "services" / "executor.py",
    "review": SCRIPT_DIR / "services" / "reviewer.py",
    "diagnose": SCRIPT_DIR / "services" / "diagnose.py",
}

SCORE_SCRIPT = SCRIPT_DIR / "services" / "score.py"

STUCK_TIMEOUT_SECONDS = 300  # 5 min — reset processing states older than this
EXECUTOR_RETRY_TTL_SECONDS = 3600  # 1h — auto-reset executor_attempts after this cooldown
DIAGNOSE_EXHAUSTION_TTL_SECONDS = 7200  # 2h — auto-reset diagnose_attempts after cooldown
DECOMPOSED_PARENT_STALE_SECONDS = 3600  # 1h — auto-close parent if children are stuck

REQUIRED_DIMENSIONS = {
    "blocked": "blocked:no",
    "active": "active:no",
    "completed": "completed:no",
}


def get_task_labels(task: dict) -> list[str]:
    return task.get("labels", [])


def has_label(labels: list[str], key: str) -> bool:
    return key in labels


def _has_dimension(labels: list[str], dim: str) -> bool:
    """Check if any label with the given dimension prefix exists."""
    prefix = f"{dim}:"
    return any(l.startswith(prefix) for l in labels)


def reset_label(task_id: str, old_label: str, new_label: str):
    """Reset a stuck label to a recoverable state (atomic via conditional_claim)."""
    set_label(task_id, old_label, new_label)


def heal_missing_dimensions(task: dict) -> int:
    """Detect and add missing required dimension labels. Returns count of fixes."""
    task_id = task["id"]
    labels = get_task_labels(task)
    fixes = 0
    for dim, default in REQUIRED_DIMENSIONS.items():
        if not _has_dimension(labels, dim):
            pulse_post(f"/tasks/{task_id}/labels", {
                "labels": [default],
                "actor": "watchdog:heal-dimensions",
            })
            log.info("Watchdog: added missing %s to %s", default, task_id)
            fixes += 1
    return fixes


def heal_executor_retry_ttl(task: dict) -> bool:
    """Auto-reset executor_attempts after 1h cooldown. Returns True if healed."""
    task_id = task["id"]
    labels = get_task_labels(task)
    meta = task.get("metadata") or {}
    exec_attempts = meta.get("executor_attempts", 0)

    if exec_attempts < 3:
        return False
    if not (has_label(labels, "blocked:yes") and has_label(labels, "reason:max-executor-retries")):
        return False

    last_attempt_ts = meta.get("last_executor_ts", 0)
    if not last_attempt_ts:
        age = _task_age_seconds(task)
    else:
        age = time.time() - last_attempt_ts

    if age < EXECUTOR_RETRY_TTL_SECONDS:
        return False

    pulse_post(f"/tasks/{task_id}/conditional-update", {
        "precondition": {"label_value": "blocked:yes"},
        "set_labels": ["blocked:no"],
        "remove_labels": ["blocked:yes", "reason:max-executor-retries"],
        "metadata": {"executor_attempts": 0, "last_error": None, "last_error_class": None},
        "actor": "watchdog:retry-ttl",
    })
    log.info("Watchdog: auto-reset executor_attempts on %s (age=%ds, ttl=%ds)",
             task_id, int(age), EXECUTOR_RETRY_TTL_SECONDS)
    metrics["watchdog_resets"] += 1
    return True


def heal_diagnose_exhaustion_ttl(task: dict) -> bool:
    """Auto-reset diagnose_attempts after 2h cooldown. Prevents permanent block."""
    task_id = task["id"]
    labels = get_task_labels(task)
    meta = task.get("metadata") or {}
    diag_attempts = meta.get("diagnose_attempts", 0)
    if diag_attempts < MAX_DIAGNOSE_ATTEMPTS:
        return False
    if not has_label(labels, "blocked:yes"):
        return False
    last_ts = meta.get("last_diagnose_ts", 0)
    age = (time.time() - last_ts) if last_ts else _task_age_seconds(task)
    if age < DIAGNOSE_EXHAUSTION_TTL_SECONDS:
        return False
    pulse_post(f"/tasks/{task_id}/conditional-update", {
        "precondition": {"label_value": "blocked:yes"},
        "set_labels": ["blocked:no"],
        "remove_labels": ["blocked:yes", "reason:max-diagnose-retries"],
        "metadata": {"diagnose_attempts": 0, "last_diagnose_ts": None},
        "actor": "watchdog:diagnose-ttl",
    })
    log.info("Watchdog: auto-reset diagnose_attempts on %s (age=%ds, ttl=%ds)",
             task_id, int(age), DIAGNOSE_EXHAUSTION_TTL_SECONDS)
    metrics["watchdog_resets"] += 1
    return True


def heal_decomposed_parent_stale(task: dict) -> bool:
    """Auto-close decomposed parents when all children are done or stuck permanently."""
    meta = task.get("metadata") or {}
    subtask_ids = meta.get("subtask_ids") or meta.get("child_ids")
    if not subtask_ids or not isinstance(subtask_ids, list):
        return False
    labels = get_task_labels(task)
    if not has_label(labels, "queued:done"):
        return False
    orchestrated_at = meta.get("orchestrated_at")
    if not orchestrated_at:
        return False
    try:
        from datetime import datetime as dt, timezone as tz
        orch_dt = dt.fromisoformat(orchestrated_at.replace("Z", "+00:00"))
        age = (dt.now(tz.utc) - orch_dt).total_seconds()
    except Exception:
        age = 0
    if age < DECOMPOSED_PARENT_STALE_SECONDS:
        return False
    all_terminal = True
    for sid in subtask_ids:
        sub = pulse_get(f"/tasks/{sid}")
        if not sub:
            continue
        sub_labels = get_task_labels(sub)
        if sub.get("status") == "closed":
            continue
        if has_label(sub_labels, "blocked:yes"):
            continue
        if has_label(sub_labels, "completed:done"):
            continue
        all_terminal = False
        break
    if all_terminal:
        log.info("Watchdog: auto-closing stale decomposed parent %s — all %d children terminal (age=%ds)",
                 task["id"], len(subtask_ids), int(age))
        pulse_post(f"/tasks/{task['id']}/close", {
            "notes": f"Auto-closed: all {len(subtask_ids)} children terminal (closed or blocked) after {int(age)}s",
        })
        return True
    return False


def _fire_score(task_id: str):
    """Fire score.py for a newly created task (risk:* labeling)."""
    if not SCORE_SCRIPT.exists():
        log.warning("score.py not found at %s — skipping risk scoring", SCORE_SCRIPT)
        return
    try:
        subprocess.run(
            [sys.executable, str(SCORE_SCRIPT), "--task-id", task_id],
            timeout=30, capture_output=True, text=True
        )
        log.info("Score: risk label applied for %s", task_id)
    except Exception as e:
        log.warning("Score failed for %s: %s", task_id, e)


def startup_label_audit(tasks: list[dict]):
    """Run on pipeline-watcher startup: audit all open tasks and fix orphaned states."""
    total_fixes = 0
    for task in tasks:
        task_id = task["id"]
        labels = get_task_labels(task)

        fixes = heal_missing_dimensions(task)
        total_fixes += fixes

        if heal_executor_retry_ttl(task):
            total_fixes += 1
        if heal_diagnose_exhaustion_ttl(task):
            total_fixes += 1
        if heal_decomposed_parent_stale(task):
            total_fixes += 1

        stuck_states = {
            "staging:processing": "staging:wait",
            "evaluated:processing": "evaluated:no",
            "completed:reviewing": "completed:no",
            "active:claiming": "active:no",
            "blocked:diagnosing": "blocked:yes",
        }
        for stuck_label, recovery_label in stuck_states.items():
            if has_label(labels, stuck_label):
                reset_label(task_id, stuck_label, recovery_label)
                log.info("Startup audit: reset %s → %s on %s", stuck_label, recovery_label, task_id)
                total_fixes += 1

    if total_fixes > 0:
        log.info("Startup audit complete: %d fixes across %d tasks", total_fixes, len(tasks))
    else:
        log.info("Startup audit complete: all %d tasks clean", len(tasks))


def launch_service(service_name: str, task_id: str, task: dict | None = None) -> int | None:
    """Launch a pipeline service for a specific task. Returns subprocess PID or None on failure."""
    script = SERVICES.get(service_name)
    if not script or not script.exists():
        log.warning("Service script not found: %s (%s)", service_name, script)
        return None

    env = {
        **os.environ,
        "TASK_ID": task_id,
        "PULSE_API": PULSE_API,
        "PULSE_PORT": str(PULSE_PORT),
        "PROJECT_DIR": str(PROJECT_DIR),
    }
    if task:
        env["TASK_JSON"] = json.dumps(task)

    log.info("Launching %s for task %s", service_name, task_id)
    svc_log = PROJECT_DIR / ".claude" / "logs" / "headless" / f"service-{service_name}.log"
    svc_log.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(svc_log, "a") as lf:
            proc = subprocess.Popen(
                [sys.executable, str(script)],
                env=env, stdout=lf, stderr=lf,
                start_new_session=True,
            )
            return proc.pid
    except Exception as e:
        log.error("Failed to launch %s: %s", service_name, e)
        return None


ORCHESTRATE_LOCK_TIMEOUT = 600  # 10 min — design doc specifies 600s timeout guard


def check_orchestrate_lock() -> bool:
    """Check if orchestrate lock is held by a live process within timeout.
    Validates PID + create_time to guard against PID recycling."""
    if not ORCHESTRATE_LOCK.exists():
        return False
    try:
        content = ORCHESTRATE_LOCK.read_text().strip()
        parts = content.split(":")
        pid = int(parts[0])
        lock_time = float(parts[1]) if len(parts) > 1 else 0
        lock_create_time = float(parts[2]) if len(parts) > 2 else 0

        if lock_time and (time.time() - lock_time) > ORCHESTRATE_LOCK_TIMEOUT:
            log.info("Orchestrate lock expired (%.0fs old) — removing", time.time() - lock_time)
            ORCHESTRATE_LOCK.unlink(missing_ok=True)
            return False

        os.kill(pid, 0)
        if lock_create_time:
            import psutil
            try:
                actual_create = psutil.Process(pid).create_time()
                if abs(actual_create - lock_create_time) > 2.0:
                    log.info("Orchestrate lock PID %d recycled (create_time mismatch) — removing", pid)
                    ORCHESTRATE_LOCK.unlink(missing_ok=True)
                    return False
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                ORCHESTRATE_LOCK.unlink(missing_ok=True)
                return False
        return True
    except (ValueError, ProcessLookupError, PermissionError, FileNotFoundError, OSError):
        ORCHESTRATE_LOCK.unlink(missing_ok=True)
        return False


def count_active_executors() -> int:
    """Count active executor sidecar files (proxy for running executors)."""
    if not SIDECAR_DIR.exists():
        return 0
    return sum(1 for f in SIDECAR_DIR.iterdir() if f.name.endswith(".exec.json"))


def _task_age_seconds(task: dict) -> float:
    """Seconds since task was last updated. Returns 0 if timestamp unavailable."""
    updated = task.get("updated_at")
    if not updated:
        return 0
    try:
        from datetime import datetime as dt, timezone as tz
        if isinstance(updated, str):
            updated_dt = dt.fromisoformat(updated.replace("Z", "+00:00"))
        else:
            updated_dt = updated
        return (dt.now(tz.utc) - updated_dt).total_seconds()
    except Exception:
        return 0


def watchdog_check(task: dict):
    """Detect invalid/stuck label states and reset them. Runs BEFORE process_task."""
    labels = get_task_labels(task)
    task_id = task["id"]
    age = _task_age_seconds(task)

    heal_missing_dimensions(task)

    if heal_executor_retry_ttl(task):
        return
    if heal_diagnose_exhaustion_ttl(task):
        return
    if heal_decomposed_parent_stale(task):
        return

    # Invalid combo: staging:wait + active:running (Pulse should prevent, belt-and-suspenders)
    if has_label(labels, "staging:wait") and has_label(labels, "active:running"):
        log.warning("Watchdog: invalid combo on %s (staging:wait + active:running) — resetting", task_id)
        pulse_post(f"/tasks/{task_id}/transition", {"scenario": "v2-reset-to-staging", "actor": "watchdog"})
        metrics["watchdog_resets"] += 1
        return

    # Stale active:claiming — only reset if older than threshold (executor needs time to start)
    if has_label(labels, "active:claiming") and age > STUCK_TIMEOUT_SECONDS:
        log.info("Watchdog: resetting stale active:claiming on %s (age: %.0fs)", task_id, age)
        reset_label(task_id, "active:claiming", "active:no")
        metrics["watchdog_resets"] += 1
        return

    # Stuck processing states — only reset if older than threshold
    stuck_states = {
        "staging:processing": "staging:wait",
        "evaluated:processing": "evaluated:no",
        "completed:reviewing": "completed:no",
    }
    for stuck_label, recovery_label in stuck_states.items():
        if has_label(labels, stuck_label) and age > STUCK_TIMEOUT_SECONDS:
            log.info("Watchdog: resetting stuck %s on %s (age: %.0fs)", stuck_label, task_id, age)
            reset_label(task_id, stuck_label, recovery_label)
            metrics["watchdog_resets"] += 1
            return


def chain_predecessor_done(task: dict) -> bool:
    """Check if this task's chain predecessor has finished or is permanently blocked.
    Returns True if ok to execute. A blocked predecessor is treated as "done" to
    prevent chain deadlocks — ordering is advisory, not a hard gate."""
    meta = task.get("metadata") or {}
    chain_order = meta.get("chain_order")
    chain_id = meta.get("chain_id")
    if chain_order is None or chain_order == 0 or not chain_id:
        return True
    data = pulse_get("/tasks?status=open&limit=200")
    if not data:
        return True
    for t in data.get("tasks", []):
        t_meta = t.get("metadata") or {}
        if (t_meta.get("chain_id") == chain_id
                and t_meta.get("chain_order") == chain_order - 1):
            t_labels = get_task_labels(t)
            if has_label(t_labels, "active:done") or has_label(t_labels, "completed:done"):
                return True
            if has_label(t_labels, "blocked:yes"):
                return True
            return False
    all_data = pulse_get("/tasks?limit=500")
    if all_data:
        for t in all_data.get("tasks", []):
            t_meta = t.get("metadata") or {}
            if (t_meta.get("chain_id") == chain_id
                    and t_meta.get("chain_order") == chain_order - 1):
                if t.get("status") == "closed":
                    return True
                t_labels = get_task_labels(t)
                if has_label(t_labels, "blocked:yes"):
                    return True
                return False
    return True


def process_task(task: dict):
    """Evaluate a single task's label state and trigger appropriate service."""
    task_id = task["id"]
    labels = get_task_labels(task)

    # Already being diagnosed — wait for diagnose to reset labels
    if has_label(labels, "blocked:diagnosing"):
        return

    # Blocked → Diagnose (failure recovery — root-cause and redesign)
    # Skip dependency-blocked tasks — they are waiting for parents, not failed
    if has_label(labels, "blocked:yes") and has_label(labels, "reason:dependency"):
        return
    if has_label(labels, "blocked:yes"):
        meta = task.get("metadata") or {}
        attempts = meta.get("diagnose_attempts", 0)
        if attempts >= MAX_DIAGNOSE_ATTEMPTS:
            log.warning("Task %s exhausted %d diagnose attempts — leaving blocked", task_id, attempts)
            return
        if conditional_claim(task_id, "blocked:yes", "blocked:diagnosing"):
            launch_service("diagnose", task_id, task)
            metrics["triggers"]["diagnose"] += 1
        else:
            metrics["claim_conflicts"] += 1
        return

    # Staging → Stage service
    if has_label(labels, "staging:wait") and has_label(labels, "blocked:no"):
        if conditional_claim(task_id, "staging:wait", "staging:processing"):
            launch_service("stage", task_id, task)
            metrics["triggers"]["stage"] += 1
        else:
            metrics["claim_conflicts"] += 1
        return

    # Staged → Evaluate service
    if has_label(labels, "staging:done") and has_label(labels, "evaluated:no") and has_label(labels, "blocked:no"):
        if conditional_claim(task_id, "evaluated:no", "evaluated:processing"):
            launch_service("evaluate", task_id, task)
            metrics["triggers"]["evaluate"] += 1
        else:
            metrics["claim_conflicts"] += 1
        return

    # Evaluated → Orchestrate (batch, single-instance guarded with pre-lock)
    if (has_label(labels, "staging:done") and has_label(labels, "evaluated:done")
            and has_label(labels, "queued:no") and has_label(labels, "blocked:no")):
        if not check_orchestrate_lock():
            try:
                ORCHESTRATE_LOCK.parent.mkdir(parents=True, exist_ok=True)
                ORCHESTRATE_LOCK.write_text(f"{os.getpid()}:{time.time()}")
                pid = launch_service("orchestrate", task_id, task)
                if pid is not None:
                    try:
                        import psutil
                        ctime = psutil.Process(pid).create_time()
                    except Exception:
                        ctime = 0
                    ORCHESTRATE_LOCK.write_text(f"{pid}:{time.time()}:{ctime}")
                    metrics["triggers"]["orchestrate"] += 1
                else:
                    ORCHESTRATE_LOCK.unlink(missing_ok=True)
            except Exception as e:
                log.error("Failed to pre-lock orchestrate: %s", e)
                ORCHESTRATE_LOCK.unlink(missing_ok=True)
        return

    # Queued → Execute (with concurrency limit + chain ordering + retry cap)
    if has_label(labels, "queued:done") and has_label(labels, "active:no") and has_label(labels, "blocked:no"):
        meta = task.get("metadata", {}) or {}

        # Decomposed parent guard: if this task was decomposed into subtasks,
        # auto-close it instead of re-executing (children already did the work)
        subtask_ids = meta.get("subtask_ids") or meta.get("child_ids")
        if subtask_ids and isinstance(subtask_ids, list) and len(subtask_ids) > 0:
            all_closed = True
            for sid in subtask_ids:
                sub = pulse_get(f"/tasks/{sid}")
                if sub and sub.get("status") != "closed":
                    all_closed = False
                    break
            if all_closed:
                log.info("Auto-closing decomposed parent %s — all %d children closed", task_id, len(subtask_ids))
                pulse_post(f"/tasks/{task_id}/close", {"notes": f"Auto-closed: all {len(subtask_ids)} subtasks completed"})
                return
            else:
                return

        exec_attempts = meta.get("executor_attempts", 0)
        last_error_preview = str(meta.get("last_error", "") or "")[:200]
        last_error_class = meta.get("last_error_class") or ""

        # Phase 5.5 — auth circuit breaker (executor.sh:1982 / dispatcher.sh:1004 parity).
        # If a previous executor invocation (any task) tripped the breaker, skip
        # claude dispatch; ollama-only models bypass the breaker.
        breaker_active, breaker_age = _check_auth_circuit_breaker()
        task_model = (meta.get("model") or os.environ.get("EXECUTOR_MODEL") or "claude-sonnet-4-6")
        is_ollama_task = (not task_model.startswith("claude-")) and (":" in task_model)
        if breaker_active and not is_ollama_task:
            with _thread_id_scope(_pipe_watcher_thread_id(task_id)):
                log_decision(
                    "system:pipeline-watcher", "retry", "fail_fast",
                    alternatives=[{"option": "retry", "score": 0.0},
                                  {"option": "fail_fast", "score": 1.0}],
                    signals_matched=[
                        {"signal": "auth_circuit_breaker_active", "weight": 1.0},
                        {"signal": "last_error_class_auth", "weight": 1.0}
                            if last_error_class == "auth" else
                        {"signal": "global_breaker_from_other_task", "weight": 1.0},
                    ],
                    confidence=1.0,
                    rationale=(f"Auth circuit breaker active (age={breaker_age}s of "
                               f"{AUTH_BREAKER_HALFLIFE_S}s halflife). Refusing to dispatch "
                               f"executor for {task_id} (model={task_model}). "
                               "Credentials need human intervention; will auto-resume after "
                               "halflife or on `rm state/auth-failure-timestamp`."),
                    downstream_effect={"task_id": task_id, "model": task_model,
                                       "breaker_age_s": breaker_age,
                                       "halflife_s": AUTH_BREAKER_HALFLIFE_S,
                                       "action": "skip_dispatch"},
                    task_id=task_id,
                )
                log_audit("system:pipeline-watcher", "system.auth_circuit_break", "config",
                          "auth.circuit_breaker", details={
                              "state": "active", "age_seconds": breaker_age,
                              "halflife_seconds": AUTH_BREAKER_HALFLIFE_S,
                              "task_id": task_id, "model": task_model,
                              "blocked_dispatch": True,
                          })
            metrics["claim_conflicts"] += 1  # bucket under conflicts to keep one metric
            return

        if exec_attempts >= 3:
            log.warning("Task %s exceeded max executor attempts (%d) — blocking", task_id, exec_attempts)
            # Phase 5.5 — give_up decision + task.blocked audit
            # (executor.sh:2022 architectural counterpart, relocated to orchestrator)
            with _thread_id_scope(_pipe_watcher_thread_id(task_id)):
                log_decision(
                    "system:pipeline-watcher", "retry", "give_up",
                    alternatives=[{"option": "retry", "score": 0.05},
                                  {"option": "give_up", "score": 0.95}],
                    signals_matched=[{"signal": "executor_attempts_exhausted", "weight": 1.0}],
                    confidence=0.95,
                    rationale=(f"Task {task_id} exec_attempts={exec_attempts} reached cap of 3. "
                               f"Blocking with reason:max-executor-retries. "
                               f"last_error={last_error_preview!r}"),
                    downstream_effect={"task_id": task_id, "exec_attempts": exec_attempts,
                                       "action": "block_task",
                                       "reason": "max-executor-retries"},
                    task_id=task_id,
                )
                log_audit("system:pipeline-watcher", "task.blocked", "task", task_id, details={
                    "reason": "max_executor_retries", "exec_attempts": exec_attempts,
                    "last_error_preview": last_error_preview,
                })
            pulse_post(f"/tasks/{task_id}/conditional-update", {
                "precondition": {"label_value": "active:no"},
                "set_labels": ["blocked:yes", "reason:max-executor-retries"],
                "remove_labels": ["active:no", "blocked:no"],
                "metadata": {"last_executor_ts": int(time.time())},
                "actor": "event-watcher",
            })
            return
        if count_active_executors() >= MAX_CONCURRENT_EXECUTORS:
            return
        if not chain_predecessor_done(task):
            metrics["chain_blocks"] += 1
            return
        if conditional_claim(task_id, "active:no", "active:claiming"):
            # Phase 5.5 — retry decision + job.retrying audit when re-dispatching
            # (executor.sh:2001 architectural counterpart, relocated to orchestrator).
            # First-dispatch (exec_attempts == 0) doesn't emit retry — it's not a retry.
            if exec_attempts > 0:
                with _thread_id_scope(_pipe_watcher_thread_id(task_id)):
                    log_decision(
                        "system:pipeline-watcher", "retry", "retry",
                        alternatives=[{"option": "retry", "score": 0.85},
                                      {"option": "give_up", "score": 0.15}],
                        signals_matched=[{"signal": "attempts_remaining", "weight": 1.0}],
                        confidence=0.85,
                        rationale=(f"Re-dispatching executor for {task_id} (attempt "
                                   f"{exec_attempts + 1}/3). Prior attempt failed with "
                                   f"last_error={last_error_preview!r}; assuming "
                                   "transient/recoverable."),
                        downstream_effect={"task_id": task_id,
                                           "next_attempt": exec_attempts + 1,
                                           "max_attempts": 3,
                                           "action": "dispatch_executor"},
                        task_id=task_id,
                    )
                    log_audit("system:pipeline-watcher", "job.retrying", "task", task_id, details={
                        "attempt": exec_attempts + 1, "max_attempts": 3,
                        "last_error_preview": last_error_preview,
                    })
            launch_service("execute", task_id, task)
            metrics["triggers"]["execute"] += 1
        else:
            metrics["claim_conflicts"] += 1
        return

    # Executed → Review
    if has_label(labels, "active:done") and has_label(labels, "completed:no") and has_label(labels, "blocked:no"):
        if conditional_claim(task_id, "completed:no", "completed:reviewing"):
            launch_service("review", task_id, task)
            metrics["triggers"]["review"] += 1
        else:
            metrics["claim_conflicts"] += 1
        return


def _record_error(task_id: str, error: Exception, source: str):
    """Track per-task / per-cycle errors in a sliding window; emit alert on threshold breach."""
    now = time.time()
    error_class = f"{source}:{type(error).__name__}"
    _error_window.append((now, task_id, error_class))
    # Trim window
    cutoff = now - ALERT_WINDOW_SECONDS
    while _error_window and _error_window[0][0] < cutoff:
        _error_window.pop(0)
    metrics["task_processing_errors"] += 1
    # Threshold-based alert
    if len(_error_window) >= ALERT_ERROR_THRESHOLD:
        # De-dupe: emit at most one alert per window.
        last_alert_path = STATE_DIR / "pipeline-watcher-alert.json"
        emit_alert = True
        if last_alert_path.exists():
            try:
                prior = json.loads(last_alert_path.read_text())
                if (now - prior.get("ts", 0)) < ALERT_WINDOW_SECONDS:
                    emit_alert = False
            except Exception:
                pass
        if emit_alert:
            # Aggregate by error_class for the alert payload.
            from collections import Counter
            cls_counts = Counter(c for (_, _, c) in _error_window).most_common(5)
            task_counts = Counter(t for (_, t, _) in _error_window).most_common(5)
            log.critical("ALERT: %d errors in last %ds — top classes=%s top tasks=%s",
                         len(_error_window), ALERT_WINDOW_SECONDS, cls_counts, task_counts)
            metrics["alerts_emitted"] += 1
            last_alert_path.write_text(json.dumps({
                "ts": now,
                "ts_iso": datetime.now(timezone.utc).isoformat(),
                "error_count": len(_error_window),
                "window_seconds": ALERT_WINDOW_SECONDS,
                "threshold": ALERT_ERROR_THRESHOLD,
                "top_error_classes": cls_counts,
                "top_error_tasks": task_counts,
            }, indent=2))
            # Phase 5.5 — pipeline-v2 alert dispatch wire-up. Closes the AION-13dc7b96
            # incident loop: state file + log.critical alone never reached operators.
            notify_msgbus(
                source="pipeline-watcher",
                severity="critical",
                summary=(
                    f"🚨 Pipeline error burst: {len(_error_window)} errors in last "
                    f"{ALERT_WINDOW_SECONDS}s (threshold {ALERT_ERROR_THRESHOLD}). "
                    f"Top class: {cls_counts[0][0] if cls_counts else 'unknown'}"
                ),
                data={
                    "error_count": len(_error_window),
                    "window_seconds": ALERT_WINDOW_SECONDS,
                    "threshold": ALERT_ERROR_THRESHOLD,
                    "top_error_classes": cls_counts,
                    "top_error_tasks": task_counts,
                },
            )


def _check_cycle_error_alert(error: Exception):
    """W1: alert when consecutive poll-cycle exceptions reach threshold.

    Distinct from _record_error's sliding-window threshold. Per-day dedup
    via sentinel in STATE_DIR. Closes the AION-13dc7b96 class of failure
    where each cycle fails the same way and the burst counter never trips.
    """
    global _consecutive_cycle_errors
    _consecutive_cycle_errors += 1
    if _consecutive_cycle_errors < WATCHDOG_CYCLE_ERROR_THRESHOLD:
        return
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    sentinel = STATE_DIR / f"watchdog-cycle-errors-{today}.sentinel"
    if sentinel.exists():
        return
    err_class = type(error).__name__
    err_msg = str(error)
    log.critical(
        "WATCHDOG: %d consecutive cycle errors (threshold %d) last=%s: %s",
        _consecutive_cycle_errors, WATCHDOG_CYCLE_ERROR_THRESHOLD, err_class, err_msg,
    )
    notify_msgbus(
        source="pipeline-watcher",
        severity="critical",
        summary=(
            f"🚨 Pipeline-watcher: {_consecutive_cycle_errors} consecutive cycle "
            f"exceptions (threshold {WATCHDOG_CYCLE_ERROR_THRESHOLD}). "
            f"Last: {err_class}: {err_msg[:120]}"
        ),
        data={
            "event": "watchdog.cycle_errors",
            "consecutive": _consecutive_cycle_errors,
            "threshold": WATCHDOG_CYCLE_ERROR_THRESHOLD,
            "last_exception_class": err_class,
            "last_exception_msg": err_msg,
        },
    )
    metrics["alerts_emitted"] += 1
    sentinel.write_text(json.dumps({
        "ts_iso": datetime.now(timezone.utc).isoformat(),
        "consecutive": _consecutive_cycle_errors,
        "threshold": WATCHDOG_CYCLE_ERROR_THRESHOLD,
        "last_exception_class": err_class,
        "last_exception_msg": err_msg,
    }, indent=2))


def _reset_cycle_error_counter():
    global _consecutive_cycle_errors
    _consecutive_cycle_errors = 0


def poll_cycle():
    """Heartbeat poll — safety net that catches missed webhooks, stuck states, and dependency unblocks."""
    metrics["poll_cycles"] += 1
    data = pulse_get("/tasks?status=open&limit=200")
    if not data:
        return

    tasks = data.get("tasks", [])
    in_progress = pulse_get("/tasks?status=in_progress&limit=200")
    if in_progress:
        tasks.extend(in_progress.get("tasks", []))

    for task in tasks:
        try:
            watchdog_check(task)
        except Exception as e:
            log.error("Watchdog error on %s: %s", task.get("id", "?"), e)
            _record_error(task.get("id", "?"), e, "watchdog")

    for task in tasks:
        try:
            process_task(task)
            _sync_stage_label(task.get("id", ""))
        except Exception as e:
            log.error("Error processing task %s: %s", task.get("id", "?"), e)
            _record_error(task.get("id", "?"), e, "process_task")

    try:
        check_dependency_unblocks(tasks)
    except Exception as e:
        log.error("Dependency unblock error: %s", e)
        _record_error("(dep-unblock)", e, "dependency_unblock")

    total_triggers = sum(metrics["triggers"].values())
    log.info("Heartbeat [#%d]: triggers=%d, webhooks=%d (deduped=%d, unblocks=%d), resets=%d, conflicts=%d, chain_blocks=%d, errors=%d (window=%d), alerts=%d",
             metrics["poll_cycles"], total_triggers,
             metrics["webhook_events"], metrics["webhook_deduped"], metrics["webhook_unblocks"],
             metrics["watchdog_resets"], metrics["claim_conflicts"], metrics["chain_blocks"],
             metrics["task_processing_errors"], len(_error_window), metrics["alerts_emitted"])


def _sync_stage_label(task_id: str):
    """Derive current pipeline stage from dimension labels and set stage:* for dashboard."""
    task = pulse_get(f"/tasks/{task_id}")
    if not task or task.get("status") == "closed":
        return
    labels = get_task_labels(task)
    if has_label(labels, "completed:done"):
        stage = "completed"
    elif has_label(labels, "active:done"):
        stage = "executed"
    elif has_label(labels, "active:running") or has_label(labels, "active:claiming"):
        stage = "executing"
    elif has_label(labels, "queued:done"):
        stage = "queued"
    elif has_label(labels, "evaluated:done"):
        stage = "evaluated"
    elif has_label(labels, "staging:done"):
        stage = "staged"
    elif has_label(labels, "staging:processing") or has_label(labels, "staging:wait"):
        stage = "staging"
    else:
        return
    update_stage_label(task_id, stage)


def check_dependency_unblocks(tasks):
    """Unblock tasks whose depends_on are all satisfied (all dependencies closed)."""
    blocked = [t for t in tasks
               if has_label(t.get("labels", []), "blocked:yes")
               and has_label(t.get("labels", []), "reason:dependency")]
    if not blocked:
        return

    closed_data = pulse_get("/tasks?status=closed&limit=500")
    if not closed_data:
        return
    closed_ids = {t["id"] for t in closed_data.get("tasks", [])}

    for task in blocked:
        task_id = task["id"]
        meta = task.get("metadata", {}) or {}
        deps = meta.get("depends_on", [])
        if not deps:
            continue
        if all(dep_id in closed_ids for dep_id in deps):
            result = pulse_post(f"/tasks/{task_id}/conditional-update", {
                "precondition": {"label_value": "blocked:yes"},
                "set_labels": ["blocked:no"],
                "remove_labels": ["blocked:yes", "reason:dependency"],
                "actor": "dependency-resolver",
            })
            if result:
                log.info("Unblocked task %s — all %d dependencies closed", task_id, len(deps))


def check_unblocks_for(closed_task_id: str):
    """When a task closes, find and unblock any tasks that depend on it."""
    data = pulse_get("/tasks?status=open&limit=200")
    if not data:
        return
    for task in data.get("tasks", []):
        labels = get_task_labels(task)
        if not (has_label(labels, "blocked:yes") and has_label(labels, "reason:dependency")):
            continue
        meta = task.get("metadata", {}) or {}
        deps = meta.get("depends_on", [])
        if not deps or closed_task_id not in deps:
            continue
        all_satisfied = True
        for dep_id in deps:
            if dep_id == closed_task_id:
                continue
            dep_data = pulse_get(f"/tasks/{dep_id}")
            if not dep_data or dep_data.get("status") != "closed":
                all_satisfied = False
                break
        if all_satisfied:
            result = pulse_post(f"/tasks/{task['id']}/conditional-update", {
                "precondition": {"label_value": "blocked:yes"},
                "set_labels": ["blocked:no"],
                "remove_labels": ["blocked:yes", "reason:dependency"],
                "actor": "dependency-resolver",
            })
            if result:
                log.info("Webhook unblock: task %s — dependency %s closed (all %d deps satisfied)",
                         task["id"], closed_task_id, len(deps))
                metrics["webhook_unblocks"] += 1
                task_refreshed = pulse_get(f"/tasks/{task['id']}")
                if task_refreshed:
                    process_task(task_refreshed)


def collect_telemetry():
    """Scrape active sidecar files — detect dead PIDs, log runtime for live executors."""
    if not SIDECAR_DIR.exists():
        return
    from datetime import datetime as dt, timezone as tz
    active_count = 0
    for f in SIDECAR_DIR.iterdir():
        if f.suffix != ".json":
            continue
        try:
            data = json.loads(f.read_text())
            pid = data.get("pid")
            task_id = data.get("task_id", f.stem)
            if pid:
                try:
                    os.kill(int(pid), 0)
                    active_count += 1
                    start = data.get("start_time")
                    if start:
                        start_dt = dt.fromisoformat(start.replace("Z", "+00:00"))
                        runtime = int((dt.now(tz.utc) - start_dt).total_seconds())
                        if runtime > 600 and runtime % 300 < POLL_INTERVAL:
                            log.info("Telemetry: task %s running %dm (%s)", task_id,
                                     runtime // 60, data.get("persona", "?"))
                except ProcessLookupError:
                    log.warning("Telemetry: PID %s dead for task %s — marking done", pid, task_id)
                    reset_label(task_id, "active:running", "active:done")
                    f.unlink(missing_ok=True)
        except Exception:
            continue
    if active_count:
        log.info("Telemetry: %d active executors", active_count)


def register_webhook():
    result = pulse_post("/webhooks", {
        "url": f"http://{WEBHOOK_CALLBACK_HOST}:{WEBHOOK_PORT}/webhook",
        "events": ["task:created", "label:added", "label:removed", "label:transition"],
    })
    if result:
        log.info("Webhook registered (id: %s)", result.get("id"))
    else:
        log.warning("Failed to register webhook — will rely on polling only")


def run_webhook_server():
    try:
        from flask import Flask, request as flask_request, jsonify
    except ImportError:
        log.warning("Flask not installed — running in poll-only mode")
        return

    webhook_app = Flask("pipeline-watcher")
    webhook_app.logger.setLevel(logging.WARNING)

    @webhook_app.route("/webhook", methods=["POST"])
    def handle_webhook():
        data = flask_request.get_json(silent=True) or {}
        task_id = data.get("task_id")
        event_type = data.get("event_type", "unknown")

        if not task_id:
            return jsonify({"ok": True, "skipped": "no task_id"})

        now = time.time()
        dedup_key = f"{task_id}:{event_type}"
        last_seen = _webhook_seen.get(dedup_key, 0)
        if now - last_seen < WEBHOOK_DEDUP_WINDOW:
            metrics["webhook_deduped"] += 1
            return jsonify({"ok": True, "deduped": True})
        _webhook_seen[dedup_key] = now

        if len(_webhook_seen) > 500:
            cutoff = now - 60
            stale = [k for k, v in _webhook_seen.items() if v < cutoff]
            for k in stale:
                del _webhook_seen[k]

        metrics["webhook_events"] += 1
        log.info("Webhook: %s for %s", event_type, task_id)

        task_data = pulse_get(f"/tasks/{task_id}")
        if not task_data:
            return jsonify({"ok": True, "skipped": "task not found"})

        try:
            if event_type == "task:created":
                _fire_score(task_id)

            watchdog_check(task_data)
            process_task(task_data)
            _sync_stage_label(task_id)

            if event_type == "status:changed" and data.get("status") == "closed":
                check_unblocks_for(task_id)
        except Exception as e:
            log.error("Webhook processing error for %s: %s", task_id, e)

        return jsonify({"ok": True})

    @webhook_app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "component": "pipeline-watcher",
                        "mode": "webhook-primary",
                        "active_executors": count_active_executors(),
                        "max_executors": MAX_CONCURRENT_EXECUTORS,
                        "heartbeat_interval": POLL_INTERVAL,
                        "metrics": metrics})

    webhook_app.run(host="0.0.0.0", port=WEBHOOK_PORT, threaded=True)


def show_status():
    print("\n  Pipeline Watcher Status")
    print("  ──────────────────────────")
    print(f"  Mode:              webhook-primary")
    print(f"  Pulse API:         {PULSE_API}")
    print(f"  Webhook port:      {WEBHOOK_PORT}")
    print(f"  Heartbeat:         {POLL_INTERVAL}s")
    print(f"  Max executors:     {MAX_CONCURRENT_EXECUTORS}")

    h = pulse_get("/health")
    print(f"  Pulse:             {'healthy' if h else 'NOT RESPONDING'}")

    active = count_active_executors()
    print(f"  Active executors:  {active}/{MAX_CONCURRENT_EXECUTORS}")

    services_found = sum(1 for s in SERVICES.values() if s.exists())
    print(f"  Services:          {services_found}/{len(SERVICES)} scripts found")
    for name, path in SERVICES.items():
        status = "OK" if path.exists() else "MISSING"
        print(f"    {name}: {status}")
    print()


def main():
    if "--status" in sys.argv:
        show_status()
        return

    poll_only = "--poll-only" in sys.argv

    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
            os.kill(pid, 0)
            log.error("Another instance running (PID %d) — exiting", pid)
            sys.exit(1)
        except (ValueError, ProcessLookupError):
            LOCK_FILE.unlink(missing_ok=True)

    LOCK_FILE.write_text(str(os.getpid()))

    def cleanup(signum=None, frame=None):
        LOCK_FILE.unlink(missing_ok=True)
        log.info("Shutting down")
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    mode = "poll-only" if poll_only else "webhook-primary"
    log.info("Starting pipeline watcher (%s, heartbeat=%ds, webhook=%s, max_executors=%d)",
             mode, POLL_INTERVAL,
             "disabled" if poll_only else f"port {WEBHOOK_PORT}",
             MAX_CONCURRENT_EXECUTORS)

    for attempt in range(5):
        h = pulse_get("/health")
        if h:
            log.info("Pulse health check passed")
            break
        log.warning("Pulse not reachable (attempt %d/5) — retrying in 3s", attempt + 1)
        time.sleep(3)
    else:
        log.error("Pulse unreachable after 5 attempts — starting anyway (poll will retry)")

    startup_data = pulse_get("/tasks?status=open&limit=500")
    if startup_data:
        startup_label_audit(startup_data.get("tasks", []))

    if not poll_only:
        register_webhook()
        webhook_thread = threading.Thread(target=run_webhook_server, daemon=True)
        webhook_thread.start()

    try:
        while True:
            try:
                poll_cycle()
                collect_telemetry()
                _reset_cycle_error_counter()
            except Exception as e:
                log.error("Poll cycle error: %s", e)
                metrics["cycle_exceptions"] += 1
                _record_error("(poll-cycle)", e, "poll_cycle")
                _check_cycle_error_alert(e)
            time.sleep(POLL_INTERVAL)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
