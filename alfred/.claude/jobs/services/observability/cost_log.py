"""Python port of lib/cost-log.sh — cost / token / model economics logging.

Phase 5.2 of Nexus Revamp. Wraps a cost-ledger.jsonl append with parallel
dual-write to pulse.cost_events via POST /api/v1/costs/events.

The caller constructs the JSONL row matching the cost-ledger schema:
  {ts, job, persona, model, engine, cost, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, cache_hit_ratio, duration_s,
   success, router_model, router_overridden, company}

The Postgres payload renames `cost` -> `cost_usd` and adds thread_id, task_id,
session_id, project_id from env / args.
"""
import logging
import os
from typing import Any

from ._io import (
    DATA_DIR,
    jsonl_append,
    post_to_pulse,
)
from .thread import get_thread_id

log = logging.getLogger("observability.cost")

COST_LEDGER_FILE = DATA_DIR / "cost-ledger.jsonl"
COST_DUAL_WRITE_DEFAULT = "1"


def log_cost(row: dict[str, Any], task_id: str | None = None) -> bool:
    """Append a cost ledger row + POST to Pulse cost_events.

    Args:
        row: dict matching the cost-ledger schema (must include `ts`, `cost`,
             `model`, `engine` at minimum — additional fields pass through).
        task_id: optional task association for the Postgres row.

    Returns:
        True if write succeeded; False if row is empty/invalid.
    """
    if not row or not isinstance(row, dict):
        log.warning("log_cost called with empty/invalid row")
        return False

    # Enrich JSONL row with thread_id (matches bash: correlation_id field)
    thread_id = get_thread_id(enforce=False)
    enriched_row = dict(row)
    if thread_id:
        enriched_row["correlation_id"] = thread_id

    jsonl_append(COST_LEDGER_FILE, enriched_row)

    if os.environ.get("COST_DUAL_WRITE", COST_DUAL_WRITE_DEFAULT) == "1":
        session_id = os.environ.get("NEXUS_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID")
        # Build Pulse payload — rename cost -> cost_usd, attach correlation
        payload = {
            "ts": row.get("ts"),
            "thread_id": thread_id,
            "task_id": task_id,
            "session_id": session_id,
            "job": row.get("job"),
            "persona": row.get("persona"),
            "model": row.get("model"),
            "engine": row.get("engine"),
            "cost_usd": row.get("cost"),
            "input_tokens": row.get("input_tokens"),
            "output_tokens": row.get("output_tokens"),
            "cache_read_tokens": row.get("cache_read_tokens"),
            "cache_creation_tokens": row.get("cache_creation_tokens"),
            "cache_hit_ratio": row.get("cache_hit_ratio"),
            "duration_s": row.get("duration_s"),
            "success": row.get("success"),
            "router_model": row.get("router_model"),
            "router_overridden": row.get("router_overridden"),
            "company": row.get("company"),
            "project_id": row.get("project_id"),  # may be None
        }
        post_to_pulse("/costs/events", payload)

    return True
