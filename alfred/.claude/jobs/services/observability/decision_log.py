"""Python port of lib/decision-log.sh — branching-decision rationale logging.

Phase 5.5 of Nexus Revamp. Counterpart to audit_log: every persona/script that
makes a branching decision (route, retry, gate, fix, approve) calls log_decision
with the alternatives considered, signals matched, confidence, and rationale.

Schema (one JSON line per call):
  {ts, actor, decision_type, outcome, alternatives, signals_matched, confidence,
   rationale, downstream_effect, task_id, thread_id, parent_id}
"""
import logging
import os
from typing import Any

from ._io import (
    DATA_DIR,
    coerce_json,
    jsonl_append,
    post_to_pulse,
    utc_iso_now,
)
from .thread import get_parent_id, get_thread_id

log = logging.getLogger("observability.decision")

DECISION_LOG_FILE = DATA_DIR / "decision-log.jsonl"
DECISION_DUAL_WRITE_DEFAULT = "1"


def log_decision(
    actor: str,
    decision_type: str,
    outcome: str,
    alternatives: list | dict | None = None,
    signals_matched: list | dict | None = None,
    confidence: float | None = None,
    rationale: str | None = None,
    downstream_effect: dict | None = None,
    task_id: str | None = None,
) -> bool:
    """Record a branching decision with rationale.

    Args:
        actor: who decided (persona:name, system:component, job:name).
        decision_type: kind of decision (risk_assessment, route, retry, budget_gate,
                       fix, gate_fire, action_select).
        outcome: the chosen path (e.g. "risk:destructive", "stage:review", "blocked").
        alternatives: list of {option, score} options considered.
        signals_matched: list of matched rule names or signal objects.
        confidence: float 0..1 (or None).
        rationale: human-readable reasoning.
        downstream_effect: dict describing what was changed.
        task_id: optional task this decision is about.

    Returns:
        True if write succeeded; False on missing mandatory params.
    """
    if not actor or not decision_type or not outcome:
        log.warning(
            "log_decision missing params: actor=%r decision_type=%r outcome=%r",
            actor, decision_type, outcome,
        )
        return False

    thread_id = get_thread_id()
    if not thread_id:
        # decision-log is more lenient than audit-log: fall through to synthetic id
        # (matches bash: synthetic id when NEXUS_THREAD_ID + NEXUS_CORRELATION_ID
        # both unset; only audit-log fails closed in Phase 5.8).
        thread_id = get_thread_id(enforce=False)
        if not thread_id:
            log.error("log_decision could not resolve thread_id even synthetic; aborting")
            return False

    parent_id = get_parent_id()
    ts = utc_iso_now()

    alternatives_obj = coerce_json(alternatives) if alternatives is not None else None
    signals_obj = coerce_json(signals_matched) if signals_matched is not None else None
    downstream_obj = coerce_json(downstream_effect) if downstream_effect is not None else None

    record = {
        "ts": ts,
        "actor": actor,
        "decision_type": decision_type,
        "outcome": outcome,
        "alternatives": alternatives_obj,
        "signals_matched": signals_obj,
        "confidence": confidence,
        "rationale": rationale,
        "downstream_effect": downstream_obj,
        "task_id": task_id,
        "thread_id": thread_id,
        "parent_id": parent_id,
    }

    # JSONL spool (durable)
    jsonl_append(DECISION_LOG_FILE, record)

    # Pulse dual-write (best effort)
    if os.environ.get("DECISION_DUAL_WRITE", DECISION_DUAL_WRITE_DEFAULT) == "1":
        post_to_pulse("/audit/decisions", {
            "ts": ts,
            "thread_id": thread_id,
            "parent_id": parent_id,
            "actor": actor,
            "decision_type": decision_type,
            "outcome": outcome,
            "alternatives": alternatives_obj,
            "signals_matched": signals_obj,
            "confidence": confidence,
            "rationale": rationale,
            "downstream_effect": downstream_obj,
            "task_id": task_id,
        })

    return True
