"""Observability module — python port of Nexus audit/decision/cost logging.

Ports the bash libraries:
  lib/audit-log.sh    -> audit_log.py
  lib/decision-log.sh -> decision_log.py
  lib/cost-log.sh     -> cost_log.py
  audit-ingest.py     -> audit_ingest.py

Same dual-write semantics: durable JSONL spool + best-effort POST to Pulse,
fail-quiet to swallowed-errors.jsonl on POST failure for later replay.

Phase 5.2/5.5/5.8 (Nexus Revamp). thread_id correlation is the primitive —
all events carry NEXUS_THREAD_ID inherited from the cycle entry point.
"""
from .thread import get_thread_id, AUDIT_THREAD_ENFORCE_DEFAULT
from .audit_log import log_audit
from .decision_log import log_decision
from .cost_log import log_cost
from .notify import notify_msgbus

__all__ = [
    "get_thread_id",
    "log_audit",
    "log_decision",
    "log_cost",
    "notify_msgbus",
    "AUDIT_THREAD_ENFORCE_DEFAULT",
]
