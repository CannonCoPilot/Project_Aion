#!/usr/bin/env python3
"""audit-ingest.py — JSONL → Postgres reconciliation for Nexus observability.

Phase 5.3 of Nexus Revamp. Idempotent replay tool: reads JSONL spool files from
.claude/data/ and .claude/agent-output/ and inserts missing rows into the Postgres
audit plane (pulse.audit_log / cost_events / decision_events). Complements the
real-time dual-write in Phase 5.2 — runs on a 15-minute cron to reconcile events
that were spooled to JSONL but failed to reach Pulse (e.g., Pulse was down).

Idempotence strategy: byte-offset tracking per file in
`.claude/jobs/state/audit-ingest-state.json`. On each run, resume from the saved
offset. Rotation / truncation is detected via inode + size checks — when the inode
changes or the file shrinks below the saved offset, reset to 0 and re-ingest.

Sources and transformations (configured in SOURCES below):
  - audit-log.jsonl       → pulse.audit_log  (direct; correlation_id → thread_id)
  - cost-ledger.jsonl     → pulse.cost_events  (cost → cost_usd rename)
  - decision-log.jsonl    → pulse.decision_events  (direct)
  - label-mutations.jsonl → pulse.audit_log  (synth actor/action from source/action)
  - pipeline-health.jsonl → pulse.audit_log  (synth actor=system:pipeline-watchdog)
  - agent-output/results/orchestrator/decisions-*.jsonl → pulse.audit_log  (summary events)

NOT ingested by this tool:
  - agent-output/results/ai-david/*.jsonl — already in pulse.ai_david_feedback;
    Phase 5.5 will retrofit those rows with thread_id in place.
  - swallowed-errors.jsonl — handled separately by --replay-swallowed (future work).

Usage:
    audit-ingest.py [--all]                 # default: process all configured sources
    audit-ingest.py --file audit-log.jsonl  # single file
    audit-ingest.py --reset                 # wipe state and full re-ingest
    audit-ingest.py --dry-run               # count what would be ingested, no inserts
    audit-ingest.py --limit N               # stop after N rows per file (testing)
    audit-ingest.py --since 2026-03-12      # skip rows older than this date

Exit codes:
    0 — success
    1 — bad args / config error
    2 — runtime error (DB unreachable, file permission, state corruption)
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.stderr.write("[audit-ingest] ERROR: psycopg2 not installed. "
                     "Install with: pip install psycopg2-binary\n")
    sys.exit(2)


# ============================================================================
# Configuration
# ============================================================================

PROJECT_DIR = Path(os.environ.get("PROJECT_DIR", Path.home() / "AIProjects"))
DATA_DIR = PROJECT_DIR / ".claude" / "data"
AGENT_OUTPUT_DIR = PROJECT_DIR / ".claude" / "agent-output"
STATE_FILE = PROJECT_DIR / ".claude" / "jobs" / "state" / "audit-ingest-state.json"
LOG_FILE = PROJECT_DIR / ".claude" / "logs" / "audit-ingest.log"

def db_connect_kwargs() -> dict:
    """Build psycopg2.connect() kwargs from env. Avoids URL encoding issues with
    passwords that contain special characters."""
    if os.environ.get("PULSE_DB_URL"):
        return {"dsn": os.environ["PULSE_DB_URL"]}
    return {
        "host": os.environ.get("PULSE_DB_HOST", "localhost"),
        "port": int(os.environ.get("PULSE_DB_PORT", "5434")),
        "dbname": os.environ.get("PULSE_DB_NAME", "pulse"),
        "user": os.environ.get("PULSE_DB_USER", "vadmin"),
        "password": os.environ.get("PULSE_DB_PASSWORD", "password"),
    }

BATCH_SIZE = 200  # rows per transaction

logger = logging.getLogger("audit-ingest")


# ============================================================================
# Source definitions
# ============================================================================

@dataclass
class Source:
    """A JSONL source file and its transform function."""
    name: str                                    # Human-readable name
    path: Path                                   # Absolute path
    target_table: str                            # Fully-qualified table name
    transform: Callable[[dict], dict | None]     # row-dict → column-dict (None = skip)
    glob: bool = False                           # True if path is a glob pattern


def _parse_ts(s: str) -> datetime | None:
    """Parse an ISO-8601 timestamp, normalizing to UTC."""
    if not s:
        return None
    # Accept both 2026-04-11T04:20:08Z and 2026-04-11T04:20:08.000Z formats
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def transform_audit_log(row: dict) -> dict | None:
    """audit-log.jsonl → pulse.audit_log."""
    ts = _parse_ts(row.get("ts"))
    if ts is None:
        return None
    thread_id = row.get("correlation_id") or "backfill-unknown"
    actor = row.get("actor") or ""
    action = row.get("action") or ""
    entity_type = row.get("entity_type")
    entity_id = row.get("entity_id")
    if not actor or not action:
        return None
    return {
        "ts": ts,
        "thread_id": thread_id,
        "actor": actor,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "task_id": entity_id if entity_type == "task" else None,
        "project_id": None,
        "session_id": None,
        "severity": "info",
        "details": row.get("details") or {},
        "source_file": "audit-log.jsonl",
    }


def transform_cost_ledger(row: dict) -> dict | None:
    """cost-ledger.jsonl → pulse.cost_events."""
    ts = _parse_ts(row.get("ts"))
    if ts is None or row.get("cost") is None or not row.get("model"):
        return None
    return {
        "ts": ts,
        "thread_id": None,  # historical rows have no thread_id
        "task_id": None,
        "session_id": None,
        "job": row.get("job"),
        "persona": row.get("persona"),
        "model": row["model"],
        "engine": row.get("engine"),
        "cost_usd": row["cost"],
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
        "project_id": None,
    }


def transform_decision_log(row: dict) -> dict | None:
    """decision-log.jsonl → pulse.decision_events."""
    ts = _parse_ts(row.get("ts"))
    if ts is None:
        return None
    actor = row.get("actor")
    dtype = row.get("decision_type")
    outcome = row.get("outcome")
    if not actor or not dtype or not outcome:
        return None
    return {
        "ts": ts,
        "thread_id": row.get("thread_id") or "backfill-unknown",
        "parent_id": row.get("parent_id"),
        "task_id": row.get("task_id"),
        "actor": actor,
        "decision_type": dtype,
        "outcome": outcome,
        "alternatives": row.get("alternatives"),
        "signals_matched": row.get("signals_matched"),
        "confidence": row.get("confidence"),
        "rationale": row.get("rationale"),
        "downstream_effect": row.get("downstream_effect"),
    }


def transform_label_mutations(row: dict) -> dict | None:
    """label-mutations.jsonl → pulse.audit_log (synthesized labeling events)."""
    ts = _parse_ts(row.get("timestamp"))
    if ts is None:
        return None
    task_id = row.get("task_id") or ""
    label = row.get("label") or ""
    action_raw = row.get("action") or "mutated"
    source = row.get("source") or "unknown"
    if not task_id or not label:
        return None
    return {
        "ts": ts,
        "thread_id": f"backfill-label-{ts.strftime('%Y%m%d')}",
        "actor": f"source:{source}",
        "action": f"label.{action_raw}",
        "entity_type": "task",
        "entity_id": task_id,
        "task_id": task_id,
        "project_id": None,
        "session_id": None,
        "severity": "info",
        "details": {
            "label": label,
            "scenario": row.get("scenario"),
            "backfill": True,
        },
        "source_file": "label-mutations.jsonl",
    }


def transform_pipeline_health(row: dict) -> dict | None:
    """pipeline-health.jsonl → pulse.audit_log (watchdog check events)."""
    ts = _parse_ts(row.get("timestamp"))
    if ts is None:
        return None
    check = row.get("check") or "unknown"
    task_id = row.get("task_id")
    return {
        "ts": ts,
        "thread_id": f"backfill-watchdog-{ts.strftime('%Y%m%d')}",
        "actor": "system:pipeline-watchdog",
        "action": f"watchdog.{check}",
        "entity_type": "task" if task_id else "system",
        "entity_id": task_id or "pipeline-watchdog",
        "task_id": task_id,
        "project_id": None,
        "session_id": None,
        "severity": row.get("severity") or "info",
        "details": {
            "message": row.get("message"),
            "action_taken": row.get("action_taken"),
            "rule_reference": row.get("rule_reference"),
            "dry_run": row.get("dry_run"),
            "backfill": True,
        },
        "source_file": "pipeline-health.jsonl",
    }


def transform_orchestrator_decision(row: dict) -> dict | None:
    """orchestrator decisions-*.jsonl → pulse.audit_log (run summaries)."""
    ts = _parse_ts(row.get("timestamp"))
    if ts is None:
        return None
    rtype = row.get("type") or "event"
    return {
        "ts": ts,
        "thread_id": row.get("session_id") or f"backfill-orchestrator-{ts.strftime('%Y%m%d')}",
        "actor": "job:orchestrator",
        "action": f"orchestrator.{rtype}",
        "entity_type": "job",
        "entity_id": "orchestrator",
        "task_id": None,
        "project_id": None,
        "session_id": row.get("session_id"),
        "severity": "info",
        "details": {k: v for k, v in row.items() if k not in ("timestamp", "type")},
        "source_file": "orchestrator/decisions",
    }


def default_sources() -> list[Source]:
    """Return the default source list. Missing files are silently skipped."""
    return [
        Source("audit-log", DATA_DIR / "audit-log.jsonl",
               "pulse.audit_log", transform_audit_log),
        Source("cost-ledger", DATA_DIR / "cost-ledger.jsonl",
               "pulse.cost_events", transform_cost_ledger),
        Source("decision-log", DATA_DIR / "decision-log.jsonl",
               "pulse.decision_events", transform_decision_log),
        Source("label-mutations", DATA_DIR / "label-mutations.jsonl",
               "pulse.audit_log", transform_label_mutations),
        Source("pipeline-health", DATA_DIR / "pipeline-health.jsonl",
               "pulse.audit_log", transform_pipeline_health),
        Source("orchestrator-decisions",
               AGENT_OUTPUT_DIR / "results" / "orchestrator",
               "pulse.audit_log", transform_orchestrator_decision,
               glob=True),
    ]


# ============================================================================
# State management
# ============================================================================

def load_state() -> dict[str, dict]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text()).get("files", {})
    except Exception as exc:
        logger.warning("Failed to load state file %s: %s — resetting", STATE_FILE, exc)
        return {}


def save_state(state: dict[str, dict]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"files": state, "updated_at": datetime.now(timezone.utc).isoformat()}, indent=2))
    tmp.replace(STATE_FILE)


def file_position(path: Path, state: dict[str, dict]) -> int:
    """Return the byte offset to resume from, handling rotation/truncation."""
    key = str(path)
    entry = state.get(key)
    if not entry:
        return 0
    try:
        st = path.stat()
    except FileNotFoundError:
        return 0
    # Inode changed = rotation → reset
    if entry.get("inode") != st.st_ino:
        logger.info("inode changed for %s (rotation detected) — resetting offset", path.name)
        return 0
    # File shrunk below offset = truncation → reset
    if st.st_size < entry.get("offset", 0):
        logger.info("size shrunk below offset for %s (truncation detected) — resetting", path.name)
        return 0
    return entry.get("offset", 0)


def update_state_entry(path: Path, offset: int, state: dict[str, dict],
                       run_ingested: int, batch_delta: int) -> None:
    """Update state for a path.

    run_ingested — cumulative rows ingested during THIS run (overwrites last_run_ingested)
    batch_delta  — rows added SINCE the previous update_state_entry call (adds to total)
    """
    key = str(path)
    try:
        st = path.stat()
        inode = st.st_ino
    except FileNotFoundError:
        inode = None
    prev_total = state.get(key, {}).get("total_ingested", 0)
    state[key] = {
        "inode": inode,
        "offset": offset,
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "last_run_ingested": run_ingested,
        "total_ingested": prev_total + batch_delta,
    }


# ============================================================================
# Insertion
# ============================================================================

INSERT_SQL: dict[str, str] = {
    # Phase 5.5 hardening (AIProjects-nmgj): each INSERT uses ON CONFLICT DO NOTHING
    # against the dedup unique indexes from alembic 013. Protects against the
    # direct-dual-write + cron-reconcile duplication — when decision-log.sh /
    # audit-log.sh / cost-log.sh already POSTed the event to the API, this replay
    # path silently skips the re-insert.
    "pulse.audit_log": """
        INSERT INTO pulse.audit_log
            (ts, thread_id, actor, action, entity_type, entity_id, task_id,
             project_id, session_id, severity, details, source_file)
        VALUES
            (%(ts)s, %(thread_id)s, %(actor)s, %(action)s, %(entity_type)s,
             %(entity_id)s, %(task_id)s, %(project_id)s, %(session_id)s,
             %(severity)s, %(details)s, %(source_file)s)
        ON CONFLICT (thread_id, ts, actor, action) DO NOTHING
    """,
    "pulse.cost_events": """
        INSERT INTO pulse.cost_events
            (ts, thread_id, task_id, session_id, job, persona, model, engine,
             cost_usd, input_tokens, output_tokens, cache_read_tokens,
             cache_creation_tokens, cache_hit_ratio, duration_s, success,
             router_model, router_overridden, company, project_id)
        VALUES
            (%(ts)s, %(thread_id)s, %(task_id)s, %(session_id)s, %(job)s,
             %(persona)s, %(model)s, %(engine)s, %(cost_usd)s, %(input_tokens)s,
             %(output_tokens)s, %(cache_read_tokens)s, %(cache_creation_tokens)s,
             %(cache_hit_ratio)s, %(duration_s)s, %(success)s, %(router_model)s,
             %(router_overridden)s, %(company)s, %(project_id)s)
        ON CONFLICT (thread_id, ts, job, persona, model) DO NOTHING
    """,
    "pulse.decision_events": """
        INSERT INTO pulse.decision_events
            (ts, thread_id, parent_id, task_id, actor, decision_type, outcome,
             alternatives, signals_matched, confidence, rationale, downstream_effect)
        VALUES
            (%(ts)s, %(thread_id)s, %(parent_id)s, %(task_id)s, %(actor)s,
             %(decision_type)s, %(outcome)s, %(alternatives)s, %(signals_matched)s,
             %(confidence)s, %(rationale)s, %(downstream_effect)s)
        ON CONFLICT (thread_id, ts, actor, decision_type) DO NOTHING
    """,
}


def jsonify_nested(row: dict) -> dict:
    """Serialize dict/list fields to JSON strings for psycopg2 JSONB binding."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (dict, list)):
            out[k] = json.dumps(v)
        else:
            out[k] = v
    return out


def insert_batch(conn, table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    sql = INSERT_SQL[table]
    serialized = [jsonify_nested(r) for r in rows]
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, serialized, page_size=BATCH_SIZE)
    return len(rows)


# ============================================================================
# Ingestion loop
# ============================================================================

def resolve_source_paths(source: Source) -> list[Path]:
    if not source.glob:
        return [source.path] if source.path.exists() else []
    # For glob sources (e.g., orchestrator directory), pick decisions-*.jsonl
    if source.path.is_dir():
        return sorted(source.path.glob("decisions-*.jsonl"))
    return []


def ingest_file(conn, source: Source, path: Path, state: dict,
                dry_run: bool, limit: int | None, since: datetime | None) -> tuple[int, int]:
    """Ingest one file. Returns (ingested, skipped)."""
    start_offset = file_position(path, state)
    try:
        f = path.open("rb")
    except FileNotFoundError:
        return (0, 0)
    f.seek(start_offset)

    ingested = 0
    skipped = 0
    batch: list[dict] = []
    offset = start_offset
    try:
        for line_bytes in f:
            line_offset_end = offset + len(line_bytes)
            offset = line_offset_end
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            transformed = source.transform(row)
            if transformed is None:
                skipped += 1
                continue
            if since is not None and transformed["ts"] < since:
                skipped += 1
                continue
            batch.append(transformed)
            # Flush when batch is full OR when adding one more would exceed limit
            should_flush = len(batch) >= BATCH_SIZE
            hit_limit = limit is not None and (ingested + len(batch)) >= limit
            if should_flush or hit_limit:
                batch_size = len(batch)
                if not dry_run:
                    insert_batch(conn, source.target_table, batch)
                    conn.commit()
                ingested += batch_size
                batch = []
                update_state_entry(path, offset, state, ingested, batch_size)
                save_state(state)
                if hit_limit:
                    break
        # Flush any remainder
        if batch:
            batch_size = len(batch)
            if not dry_run:
                insert_batch(conn, source.target_table, batch)
                conn.commit()
            ingested += batch_size
            update_state_entry(path, offset, state, ingested, batch_size)
    finally:
        f.close()

    # Final state checkpoint (no additional batch — delta=0)
    update_state_entry(path, offset, state, ingested, 0)
    save_state(state)
    return (ingested, skipped)


def ingest_source(conn, source: Source, state: dict, dry_run: bool,
                  limit: int | None, since: datetime | None) -> dict:
    paths = resolve_source_paths(source)
    if not paths:
        logger.info("%s: no files found (skipping)", source.name)
        return {"files": 0, "ingested": 0, "skipped": 0}
    totals = {"files": 0, "ingested": 0, "skipped": 0}
    for p in paths:
        ing, skp = ingest_file(conn, source, p, state, dry_run, limit, since)
        logger.info("%s <- %s: ingested=%d skipped=%d", source.target_table, p.name, ing, skp)
        totals["files"] += 1
        totals["ingested"] += ing
        totals["skipped"] += skp
        if limit is not None and totals["ingested"] >= limit:
            break
    return totals


# ============================================================================
# Main
# ============================================================================

def setup_logging() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler(sys.stderr),
        ],
    )
    # Log in UTC
    logging.Formatter.converter = time.gmtime


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--all", action="store_true", help="Process all configured sources (default)")
    g.add_argument("--file", metavar="NAME",
                   help="Process one named source (e.g. 'audit-log' or 'cost-ledger')")
    ap.add_argument("--reset", action="store_true",
                    help="Wipe the offset state file before running (full re-ingest)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Count rows that would be ingested, do not INSERT")
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap rows per file (for testing)")
    ap.add_argument("--since", default=None,
                    help="Skip rows with ts older than this ISO-8601 date")
    return ap.parse_args()


def main() -> int:
    setup_logging()
    args = parse_args()

    since = None
    if args.since:
        since = _parse_ts(args.since) or _parse_ts(args.since + "T00:00:00Z")
        if since is None:
            logger.error("Invalid --since value: %s", args.since)
            return 1

    if args.reset:
        if STATE_FILE.exists():
            STATE_FILE.unlink()
            logger.info("State file wiped: %s", STATE_FILE)

    state = load_state()
    sources = default_sources()
    if args.file:
        sources = [s for s in sources if s.name == args.file]
        if not sources:
            logger.error("No source named '%s' — available: %s",
                         args.file, ", ".join(s.name for s in default_sources()))
            return 1

    try:
        conn = psycopg2.connect(**db_connect_kwargs())
        conn.autocommit = False
    except Exception as exc:
        logger.error("Cannot connect to Postgres: %s", exc)
        return 2

    grand = {"files": 0, "ingested": 0, "skipped": 0}
    try:
        for source in sources:
            t = ingest_source(conn, source, state, args.dry_run, args.limit, since)
            for k in grand:
                grand[k] += t[k]
    finally:
        conn.close()

    logger.info("DONE: files=%d ingested=%d skipped=%d dry_run=%s",
                grand["files"], grand["ingested"], grand["skipped"], args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
