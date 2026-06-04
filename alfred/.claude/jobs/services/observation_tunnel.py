#!/usr/bin/env python3
"""
observation_tunnel.py — Phase 1.1 Observation Tunnel (design §6.5)

Replaces hard-coded execution limits (max_turns, max_budget_usd, timeout_minutes)
with five runtime detectors that watch active task execution and intervene when
adaptive thresholds are crossed.

Detectors:
  • stuck                — audit_log silence > N min (heuristic threshold; Phase 2 → rolling p95)
  • infinite             — pulse decision_events turn count > 2× p95 (heuristic; Phase 2 → adaptive)
  • runaway_cost         — cumulative cost > 3× p95 (heuristic; Phase 2 → adaptive)
  • loop                 — identical Bash command repeated 5+ times within a 5-minute window
  • permission_violation — tool call attempted against persona's denied_tools[]

Interventions (per task class; defaults below):
  • soft   — warning audit_log entry + (Phase 2) Telegram alert
  • medium — pause task (Phase 2: SIGSTOP); for Phase 1.1, marks task pulse label `blocked:yes`
  • hard   — terminate (Phase 2: SIGTERM/SIGKILL); for Phase 1.1, marks task `completed:reviewing`

Phase 1.1 scope:
  • Detector logic + intervention dispatch
  • Emit to pulse.task_observation via POST /api/v1/observations
  • SIGSTOP/SIGTERM + Telegram + adaptive baselines deferred to Phase 2

Deployment (Phase 1.2):
  • Continuous loop daemon (this script with --daemon flag)
  • Or cron-tick invocation every 60s

Standalone smoke run:
  ./observation_tunnel.py --once  # single sweep over active tasks
  ./observation_tunnel.py --daemon  # continuous loop
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

sys.path.insert(0, os.path.dirname(__file__))
from _shared import pulse_get, pulse_patch, pulse_post  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [observation-tunnel] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("observation-tunnel")

PULSE_API = os.environ.get("PULSE_API", "http://localhost:8800/api/v1")

# Heuristic thresholds (Phase 2 will replace with rolling p95 baselines)
STUCK_SILENCE_SECONDS = int(os.environ.get("OBS_STUCK_SECONDS", "600"))   # 10 min
INFINITE_TURN_LIMIT = int(os.environ.get("OBS_TURN_LIMIT", "100"))
RUNAWAY_COST_USD = float(os.environ.get("OBS_RUNAWAY_COST_USD", "5.00"))
LOOP_REPEAT_THRESHOLD = int(os.environ.get("OBS_LOOP_THRESHOLD", "5"))
LOOP_WINDOW_SECONDS = int(os.environ.get("OBS_LOOP_WINDOW_SECONDS", "300"))
SYSTEM_OVERLOAD_PCT = int(os.environ.get("OBS_OVERLOAD_PCT", "90"))
BURN_WARN_PCT = int(os.environ.get("OBS_BURN_WARN_PCT", "80"))

DAEMON_TICK_SECONDS = int(os.environ.get("OBS_TICK_SECONDS", "60"))


# ----------------------------------------------------------------------------
# Detectors
# ----------------------------------------------------------------------------

def detect_stuck(task: dict, audit_events: List[dict]) -> Optional[Dict[str, Any]]:
    """Last audit event for thread > STUCK_SILENCE_SECONDS ago."""
    if not audit_events:
        return None
    last = audit_events[0]
    last_ts_str = last.get("ts")
    if not last_ts_str:
        return None
    try:
        last_ts = datetime.fromisoformat(last_ts_str.replace("Z", "+00:00"))
    except ValueError:
        return None
    silence = (datetime.now(timezone.utc) - last_ts).total_seconds()
    if silence < STUCK_SILENCE_SECONDS:
        return None
    return {
        "evidence": {"last_audit_id": last.get("id"), "silence_seconds": silence, "threshold": STUCK_SILENCE_SECONDS},
        "suggested_intervention": "soft" if silence < STUCK_SILENCE_SECONDS * 2 else "medium",
    }


def detect_infinite(task: dict, decision_events: List[dict]) -> Optional[Dict[str, Any]]:
    """Turn count via decision_events row count for the thread."""
    turn_count = len(decision_events)
    if turn_count < INFINITE_TURN_LIMIT:
        return None
    return {
        "evidence": {"turn_count": turn_count, "threshold": INFINITE_TURN_LIMIT},
        "suggested_intervention": "medium" if turn_count < INFINITE_TURN_LIMIT * 2 else "hard",
    }


def detect_runaway_cost(task: dict, cost_events: List[dict]) -> Optional[Dict[str, Any]]:
    """Sum cost_usd for thread; flag if > RUNAWAY_COST_USD."""
    total = sum(float(e.get("cost_usd") or 0) for e in cost_events)
    if total < RUNAWAY_COST_USD:
        return None
    return {
        "evidence": {"total_cost_usd": total, "threshold_usd": RUNAWAY_COST_USD},
        "suggested_intervention": "medium" if total < RUNAWAY_COST_USD * 2 else "hard",
    }


def detect_loop(task: dict, audit_events: List[dict]) -> Optional[Dict[str, Any]]:
    """Identical Bash command repeated ≥ LOOP_REPEAT_THRESHOLD within LOOP_WINDOW_SECONDS."""
    now = datetime.now(timezone.utc)
    recent_cmds: List[str] = []
    for ev in audit_events:
        ts = ev.get("ts")
        if not ts:
            continue
        try:
            ev_ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            continue
        if (now - ev_ts).total_seconds() > LOOP_WINDOW_SECONDS:
            break
        payload = ev.get("payload") or {}
        if isinstance(payload, dict) and payload.get("tool") == "Bash":
            cmd = payload.get("command") or payload.get("cmd") or ""
            if cmd:
                recent_cmds.append(cmd[:200])  # truncate to avoid pathological storage
    if not recent_cmds:
        return None
    counts = Counter(recent_cmds)
    top_cmd, top_count = counts.most_common(1)[0]
    if top_count < LOOP_REPEAT_THRESHOLD:
        return None
    return {
        "evidence": {
            "repeated_command": top_cmd,
            "repeat_count": top_count,
            "threshold": LOOP_REPEAT_THRESHOLD,
            "window_seconds": LOOP_WINDOW_SECONDS,
        },
        "suggested_intervention": "soft" if top_count < LOOP_REPEAT_THRESHOLD * 2 else "medium",
    }


def detect_permission_violation(task: dict, audit_events: List[dict]) -> Optional[Dict[str, Any]]:
    """Audit event with tool name in persona's denied_tools[].
    Phase 1.1: skipped here — substrate-level enforcement in pulse/app.py PUT endpoints
    already blocks denied tool assignments, and runtime tool calls are best validated
    at the tool-invoker layer (deferred to Phase 2)."""
    return None


_cached_util: Dict[str, Any] = {"pct": None, "fetched_at": 0.0}


def _get_system_util_pct() -> Optional[int]:
    """Fetch current 5hr utilization from Pulse API, cached for 30s."""
    now = time.time()
    if _cached_util["pct"] is not None and now - _cached_util["fetched_at"] < 30:
        return _cached_util["pct"]
    try:
        data = requests.get(f"{PULSE_API}/usage/session-window", timeout=5).json()
        util = data.get("five_hour", {}).get("utilization")
        if util is not None:
            pct = int(float(util) * 100)
            _cached_util["pct"] = pct
            _cached_util["fetched_at"] = now
            return pct
    except Exception:
        pass
    return _cached_util.get("pct")


def detect_system_overload(task: dict, _events: List[dict]) -> Optional[Dict[str, Any]]:
    """System-level 5hr utilization check. Flags active tasks when burn weight is critical."""
    pct = _get_system_util_pct()
    if pct is None or pct < BURN_WARN_PCT:
        return None
    if pct >= SYSTEM_OVERLOAD_PCT:
        return {
            "evidence": {"system_util_pct": pct, "threshold_pct": SYSTEM_OVERLOAD_PCT},
            "suggested_intervention": "medium",
        }
    return {
        "evidence": {"system_util_pct": pct, "threshold_pct": BURN_WARN_PCT},
        "suggested_intervention": "soft",
    }


DETECTORS = {
    "stuck": detect_stuck,
    "infinite": detect_infinite,
    "runaway_cost": detect_runaway_cost,
    "loop": detect_loop,
    "permission_violation": detect_permission_violation,
    "system_overload": detect_system_overload,
}


# ----------------------------------------------------------------------------
# Interventions
# ----------------------------------------------------------------------------

def apply_intervention(task_id: str, observation_type: str, level: str, evidence: dict, persona: Optional[str]) -> None:
    """Dispatch the appropriate intervention. Phase 1.1: log + label nudge only."""
    log.warning("intervention: task=%s type=%s level=%s evidence=%s", task_id, observation_type, level, evidence)
    # Record observation via Pulse API (preserves boundary).
    pulse_post("/observations", {
        "task_id": task_id,
        "thread_id": task_id,  # Phase 1.1: thread_id == task_id heuristic; refine in Phase 2
        "persona_name": persona,
        "observation_type": observation_type,
        "intervention": level,
        "evidence": evidence,
    })
    if level == "medium":
        # Mark task blocked for human review
        pulse_patch(f"/tasks/{task_id}", {"add_labels": ["blocked:yes"], "remove_labels": ["blocked:no"]})
    elif level == "hard":
        pulse_patch(f"/tasks/{task_id}", {"add_labels": ["completed:reviewing", "blocked:yes"]})


# ----------------------------------------------------------------------------
# Sweep loop
# ----------------------------------------------------------------------------

def fetch_active_tasks() -> List[dict]:
    """Returns tasks currently in 'active:running' or 'active:claiming' state."""
    payload = pulse_get("/pipeline/active")
    if not payload:
        return []
    tasks = payload.get("tasks") if isinstance(payload, dict) else payload
    return tasks or []


def fetch_thread_events(thread_id: str) -> Dict[str, List[dict]]:
    """Fetch audit_log, decision_events, cost_events for a thread (sorted DESC)."""
    return {
        "audit": (pulse_get(f"/audit/events?thread_id={thread_id}&limit=200") or {}).get("events", []),
        "decisions": (pulse_get(f"/audit/decisions?thread_id={thread_id}&limit=200") or {}).get("events", []),
        "costs": (pulse_get(f"/costs/events?thread_id={thread_id}&limit=200") or {}).get("events", []),
    }


def sweep_once() -> Dict[str, int]:
    """Run one full sweep across active tasks. Returns counts by observation_type."""
    counts: Counter = Counter()
    tasks = fetch_active_tasks()
    log.info("sweep: %d active tasks", len(tasks))
    for task in tasks:
        task_id = task.get("id") or task.get("task_id")
        if not task_id:
            continue
        thread_id = task.get("thread_id") or task_id
        events = fetch_thread_events(thread_id)
        persona = task.get("assigned_persona") or (task.get("metadata") or {}).get("persona")
        for obs_type, detector in DETECTORS.items():
            try:
                if obs_type in ("stuck", "loop"):
                    result = detector(task, events["audit"])
                elif obs_type == "infinite":
                    result = detector(task, events["decisions"])
                elif obs_type == "runaway_cost":
                    result = detector(task, events["costs"])
                elif obs_type == "system_overload":
                    result = detector(task, [])
                else:
                    result = detector(task, events["audit"])
            except Exception as exc:  # noqa: BLE001 — detector errors must not halt the sweep
                log.warning("detector %s failed for task %s: %s", obs_type, task_id, exc)
                continue
            if result is None:
                continue
            apply_intervention(
                task_id=task_id,
                observation_type=obs_type,
                level=result["suggested_intervention"],
                evidence=result["evidence"],
                persona=persona,
            )
            counts[obs_type] += 1
    return dict(counts)


def daemon_loop() -> None:
    log.info("observation tunnel daemon starting; tick=%ds", DAEMON_TICK_SECONDS)
    while True:
        try:
            counts = sweep_once()
            if counts:
                log.info("sweep complete: %s", counts)
        except Exception as exc:  # noqa: BLE001 — daemon must survive single-tick failures
            log.error("sweep failed: %s", exc)
        time.sleep(DAEMON_TICK_SECONDS)


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 1.1 Observation Tunnel")
    parser.add_argument("--once", action="store_true", help="run one sweep and exit")
    parser.add_argument("--daemon", action="store_true", help="run continuous sweep loop")
    args = parser.parse_args()
    if args.once:
        counts = sweep_once()
        print(f"sweep counts: {counts}")
        return 0
    if args.daemon:
        daemon_loop()
        return 0
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
