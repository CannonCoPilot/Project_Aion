"""Python port of lib/audit-log.sh — unified audit logging.

Same dual-write semantics: JSONL spool at .claude/data/audit-log.jsonl, POST
to /api/v1/audit/events, fail-quiet to swallowed-errors.jsonl on POST failure.

Phase 5.8 fail-closed: refuses to write uncorrelated events unless
AUDIT_THREAD_ENFORCE=0. NEXUS_THREAD_ID is the lifecycle correlation primitive.

Schema (one JSON line per call):
  {ts, actor, action, entity_type, entity_id, details, correlation_id}

Usage:
    from observability import log_audit
    log_audit("system:executor", "task.claimed", "task", "AIProjects-123",
              details={"persona": "researcher"})
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
from .thread import get_thread_id

log = logging.getLogger("observability.audit")

AUDIT_LOG_FILE = DATA_DIR / "audit-log.jsonl"
AUDIT_DUAL_WRITE_DEFAULT = "1"


def log_audit(
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any] | str | None = None,
    correlation_id: str | None = None,
) -> bool:
    """Write a unified audit log entry.

    Args:
        actor: who performed the action (format: type:name, e.g. "system:executor").
        action: what happened (format: category.specific, e.g. "task.claimed").
        entity_type: task, job, persona, config, label, budget, message, service, lock.
        entity_id: identifier of the entity.
        details: optional dict (or JSON string) of action-specific context.
        correlation_id: legacy override for thread_id; NEXUS_THREAD_ID env wins.

    Returns:
        True if the JSONL write succeeded; False if mandatory params missing
        or thread_id resolution failed under enforcement.
    """
    if not actor or not action or not entity_type or not entity_id:
        log.warning(
            "log_audit missing params: actor=%r action=%r entity_type=%r entity_id=%r",
            actor, action, entity_type, entity_id,
        )
        return False

    thread_id = get_thread_id(override=correlation_id)
    if not thread_id:
        # FAIL-CLOSED matches Phase 5.8 bash behavior. Caller broke the contract;
        # don't write an uncorrelated event. Set AUDIT_THREAD_ENFORCE=0 to bypass.
        log.error(
            "log_audit FATAL: NEXUS_THREAD_ID not set (action=%s actor=%s); "
            "refusing to write uncorrelated event",
            action, actor,
        )
        return False

    details_obj = coerce_json(details) if details is not None else {}

    ts = utc_iso_now()
    record = {
        "ts": ts,
        "actor": actor,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "details": details_obj,
        "correlation_id": thread_id,
    }

    # JSONL spool (durable, never blocked by Postgres)
    jsonl_append(AUDIT_LOG_FILE, record)

    # Pulse dual-write (best effort)
    if os.environ.get("AUDIT_DUAL_WRITE", AUDIT_DUAL_WRITE_DEFAULT) == "1":
        # task_id denormalization: when entity_type=task, mirror entity_id for fast joins
        task_id = entity_id if entity_type == "task" else None
        post_to_pulse("/audit/events", {
            "ts": ts,
            "thread_id": thread_id,
            "actor": actor,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "task_id": task_id,
            "details": details_obj,
        })

    return True


def audit_details(**fields: Any) -> dict[str, Any]:
    """Convenience for building a details dict from kwargs.

    Mirrors the bash audit_details helper but with native Python kwargs.
    """
    return {k: v for k, v in fields.items() if v is not None}
