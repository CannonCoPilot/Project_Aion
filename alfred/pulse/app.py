"""
Pulse — Task Management API for Project Aion
A Pulse-compatible REST API implementing the contract defined in pulse-api.sh.
Stores tasks, labels, events, messages, triggers, jobs, and settings in PostgreSQL.
"""
import asyncio
import json
import logging
import os
import time
import uuid
import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from io import StringIO
from typing import Any, Dict, Optional

import asyncpg
import httpx
import yaml
from ruamel.yaml import YAML as RuamelYAML
from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("pulse")

app = FastAPI(title="Pulse", version="1.0.0-aion")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info("%s %s completed in %.1fms", request.method, request.url.path, duration_ms)
    return response


# --- Configuration ---
DB_HOST = os.environ.get("PULSE_DB_HOST", "localhost")
DB_PORT = int(os.environ.get("PULSE_DB_PORT", "5432"))
DB_NAME = os.environ.get("PULSE_DB_NAME", "pulse")
DB_USER = os.environ.get("PULSE_DB_USER", "pulse")
DB_PASS = os.environ.get("PULSE_DB_PASSWORD", "")
SERVICE_TOKEN = os.environ.get("PULSE_SERVICE_TOKEN", "")
TAXONOMY_PATH = os.environ.get("PULSE_TAXONOMY_PATH", "")

pool: Optional[asyncpg.Pool] = None

# --- Pipeline v2 State Machine Schema ---

PIPELINE_DIMENSIONS = {
    "staging":   {"values": ["wait", "processing", "done", "blocked"], "default": "wait"},
    "evaluated": {"values": ["no", "processing", "done", "blocked"],   "default": "no"},
    "queued":    {"values": ["no", "done", "blocked"],                 "default": "no"},
    "active":    {"values": ["no", "claiming", "running", "done", "blocked"], "default": "no"},
    "completed": {"values": ["no", "reviewing", "done"],               "default": "no"},
    "blocked":   {"values": ["no", "yes", "diagnosing"],               "default": "no"},
}

DEFAULT_PIPELINE_LABELS = [
    f"{dim}:{spec['default']}" for dim, spec in PIPELINE_DIMENSIONS.items()
]

V1_DEPRECATED_TRANSITIONS = {"approve", "modify", "pause", "claim", "complete", "executor-fail"}

# Label prefixes stripped on task close. Pipeline FSM labels become noise once
# a task is terminal — they confuse dashboard views that classify by label state.
TERMINAL_STRIP_PREFIXES = (
    "staging:", "evaluated:", "queued:", "active:", "completed:",
    "blocked:", "reason:", "stage:", "assigned:",
)


def strip_terminal_labels(labels: list[str]) -> list[str]:
    """Remove pipeline FSM labels that are meaningless on a closed task."""
    return [l for l in labels if not any(l.startswith(p) for p in TERMINAL_STRIP_PREFIXES)]


def parse_dimension_label(label: str) -> tuple | None:
    if ":" not in label:
        return None
    dim, val = label.split(":", 1)
    if dim in PIPELINE_DIMENSIONS:
        return (dim, val)
    return None


def validate_dimension_label(label: str) -> str | None:
    """Returns error message if label has invalid dimension value, None if valid."""
    parsed = parse_dimension_label(label)
    if parsed is None:
        return None
    dim, val = parsed
    valid = PIPELINE_DIMENSIONS[dim]["values"]
    if val not in valid:
        return f"Invalid value '{val}' for dimension '{dim}'. Valid: {valid}"
    return None


def enforce_dimension_uniqueness(labels: list, new_label: str) -> list:
    """Remove any existing label in the same dimension before adding new_label."""
    parsed = parse_dimension_label(new_label)
    if parsed is None:
        return labels
    dim, _ = parsed
    return [l for l in labels if not l.startswith(f"{dim}:")]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_iso_ts(s: str) -> datetime:
    """Parse an ISO-8601 / RFC 3339 timestamp string into a tz-aware datetime.

    Required at boundaries that bind to TIMESTAMPTZ via asyncpg — the binder's
    prepared-statement type inference rejects raw strings even with `$N::timestamptz`
    casts. Accepts the 'Z' suffix used by writers (date -u +%Y-%m-%dT%H:%M:%SZ).
    """
    if s and s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def gen_id(prefix="AION"):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# --- Lifecycle ---

@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASS, min_size=2, max_size=10
    )
    await init_schema()


@app.on_event("shutdown")
async def shutdown():
    if pool:
        await pool.close()


async def init_schema():
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'open',
                priority TEXT DEFAULT 'medium',
                labels TEXT[] DEFAULT '{}',
                notes TEXT DEFAULT '',
                metadata JSONB DEFAULT '{}',
                created_by TEXT DEFAULT 'system',
                claimed_by TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                closed_at TIMESTAMPTZ,
                closed_reason TEXT
            );
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                task_id TEXT,
                event_type TEXT NOT NULL,
                actor TEXT DEFAULT 'system',
                data JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                source TEXT DEFAULT 'system',
                actor TEXT DEFAULT 'system',
                severity TEXT DEFAULT 'info',
                job_name TEXT,
                data JSONB DEFAULT '{}',
                delivered BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS triggers (
                id SERIAL PRIMARY KEY,
                task_id TEXT,
                stage TEXT,
                source TEXT DEFAULT 'system',
                handler TEXT,
                claimed_by TEXT,
                status TEXT DEFAULT 'pending',
                result TEXT,
                error TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS job_state (
                job_name TEXT PRIMARY KEY,
                last_run TIMESTAMPTZ,
                fail_count INTEGER DEFAULT 0,
                data JSONB DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_by TEXT DEFAULT 'system',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS webhooks (
                id SERIAL PRIMARY KEY,
                url TEXT NOT NULL,
                events TEXT[] DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_labels ON tasks USING GIN(labels);
            CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
            CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered);
            CREATE INDEX IF NOT EXISTS idx_triggers_status ON triggers(status);
            CREATE INDEX IF NOT EXISTS idx_webhooks_url ON webhooks(url);

            CREATE TABLE IF NOT EXISTS test_run_telemetry (
                id SERIAL PRIMARY KEY,
                suite_id TEXT NOT NULL,
                run_task_id TEXT NOT NULL,
                completed_at TIMESTAMPTZ DEFAULT NOW(),
                wall_seconds INT,
                task_count INT DEFAULT 1,
                chain_count INT DEFAULT 0,
                api_calls INT DEFAULT 0,
                cost_usd NUMERIC(10,4) DEFAULT 0,
                burn_weight_start NUMERIC(5,4),
                burn_weight_end NUMERIC(5,4),
                burn_weight_delta_pp NUMERIC(5,1),
                cache_read_tokens BIGINT DEFAULT 0,
                cache_write_tokens BIGINT DEFAULT 0,
                output_tokens BIGINT DEFAULT 0,
                input_tokens BIGINT DEFAULT 0,
                chain_ids TEXT[] DEFAULT '{}',
                models TEXT[] DEFAULT '{}',
                engines TEXT[] DEFAULT '{}',
                window_crossed BOOLEAN DEFAULT FALSE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_trt_run_task ON test_run_telemetry(run_task_id);
            CREATE INDEX IF NOT EXISTS idx_trt_suite ON test_run_telemetry(suite_id);
            ALTER TABLE test_run_telemetry ADD COLUMN IF NOT EXISTS window_crossed BOOLEAN DEFAULT FALSE;
        """)


async def _capture_test_run_telemetry(conn, task_id: str, suite_id: str):
    """Compute and store telemetry for a completed test suite run.

    Walks the task tree (parent + children + grandchildren), collects all
    chain_ids, then aggregates api_requests by matching session_id = 'chain-<chain_id>'.
    Captures 5hr burn weight from the utilization readings bracketing the run window.
    """
    import logging
    log = logging.getLogger("pulse.telemetry")

    parent = await conn.fetchrow("SELECT created_at, closed_at FROM tasks WHERE id = $1", task_id)
    if not parent or not parent["closed_at"]:
        return

    all_task_ids = await conn.fetch("""
        WITH RECURSIVE tree AS (
            SELECT id, metadata->>'chain_id' as chain_id, created_at, closed_at,
                   metadata->>'executor_model' as model, metadata->>'executor_engine' as engine
            FROM tasks WHERE id = $1
            UNION ALL
            SELECT c.id, c.metadata->>'chain_id', c.created_at, c.closed_at,
                   c.metadata->>'executor_model', c.metadata->>'executor_engine'
            FROM tasks c
            JOIN tree t ON c.labels::text LIKE '%parent:' || t.id || '%'
        )
        SELECT * FROM tree
    """, task_id)

    chain_ids = list({r["chain_id"] for r in all_task_ids if r["chain_id"]})
    models = list({r["model"] for r in all_task_ids if r["model"]})
    engines = list({r["engine"] for r in all_task_ids if r["engine"]})
    task_count = len(all_task_ids)

    if not chain_ids:
        log.warning("No chain_ids found for suite run %s — skipping telemetry", task_id)
        return

    session_ids = [f"chain-{cid}" for cid in chain_ids]

    run_start = parent["created_at"]
    run_end = parent["closed_at"]

    api_stats = await conn.fetchrow("""
        SELECT COUNT(*) as calls,
               COALESCE(SUM(cost_usd), 0) as cost,
               COALESCE(SUM(cache_read_tokens), 0) as cache_read,
               COALESCE(SUM(cache_write_tokens), 0) as cache_write,
               COALESCE(SUM(output_tokens), 0) as output_tokens,
               COALESCE(SUM(input_tokens), 0) as input_tokens
        FROM api_requests
        WHERE session_id = ANY($1)
          AND timestamp >= $2 AND timestamp <= $3
    """, session_ids, run_start, run_end)
    wall_seconds = int((run_end - run_start).total_seconds()) if run_start and run_end else None

    start_row = await conn.fetchrow("""
        SELECT unified_5h_utilization, unified_5h_reset FROM api_requests
        WHERE timestamp <= $1 AND unified_5h_utilization IS NOT NULL
        ORDER BY timestamp DESC LIMIT 1
    """, run_start)

    end_row = await conn.fetchrow("""
        SELECT unified_5h_utilization, unified_5h_reset FROM api_requests
        WHERE timestamp >= $1 AND unified_5h_utilization IS NOT NULL
        ORDER BY timestamp ASC LIMIT 1
    """, run_end)

    burn_start = float(start_row["unified_5h_utilization"]) if start_row else None
    burn_end = float(end_row["unified_5h_utilization"]) if end_row else None
    window_crossed = False
    delta_pp = None

    if burn_start is not None and burn_end is not None:
        start_reset = start_row["unified_5h_reset"] if start_row else None
        end_reset = end_row["unified_5h_reset"] if end_row else None

        if start_reset and end_reset and start_reset != end_reset:
            window_crossed = True
            peak_in_old_window = await conn.fetchval("""
                SELECT MAX(unified_5h_utilization) FROM api_requests
                WHERE unified_5h_reset = $1
                  AND timestamp >= $2 AND timestamp <= $3
                  AND unified_5h_utilization IS NOT NULL
            """, start_reset, run_start, run_end)
            old_segment = float(peak_in_old_window) - burn_start if peak_in_old_window else 0
            new_segment = burn_end
            delta_pp = round((old_segment + new_segment) * 100, 1)
            log.info("Window-crossed burn: old=%.1fpp + new=%.1fpp = %.1fpp",
                     old_segment * 100, new_segment * 100, delta_pp)
        else:
            delta_pp = round((burn_end - burn_start) * 100, 1)

    await conn.execute("""
        INSERT INTO test_run_telemetry
            (suite_id, run_task_id, completed_at, wall_seconds, task_count, chain_count,
             api_calls, cost_usd, burn_weight_start, burn_weight_end, burn_weight_delta_pp,
             cache_read_tokens, cache_write_tokens, output_tokens, input_tokens,
             chain_ids, models, engines, window_crossed)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (run_task_id) DO UPDATE SET
            completed_at=EXCLUDED.completed_at, wall_seconds=EXCLUDED.wall_seconds,
            task_count=EXCLUDED.task_count, chain_count=EXCLUDED.chain_count,
            api_calls=EXCLUDED.api_calls, cost_usd=EXCLUDED.cost_usd,
            burn_weight_start=EXCLUDED.burn_weight_start, burn_weight_end=EXCLUDED.burn_weight_end,
            burn_weight_delta_pp=EXCLUDED.burn_weight_delta_pp,
            cache_read_tokens=EXCLUDED.cache_read_tokens, cache_write_tokens=EXCLUDED.cache_write_tokens,
            output_tokens=EXCLUDED.output_tokens, input_tokens=EXCLUDED.input_tokens,
            chain_ids=EXCLUDED.chain_ids, models=EXCLUDED.models, engines=EXCLUDED.engines,
            window_crossed=EXCLUDED.window_crossed
    """,
        suite_id, task_id, run_end, wall_seconds, task_count, len(chain_ids),
        api_stats["calls"], float(api_stats["cost"]),
        burn_start, burn_end, delta_pp,
        api_stats["cache_read"], api_stats["cache_write"],
        api_stats["output_tokens"], api_stats["input_tokens"],
        chain_ids, models, engines, window_crossed,
    )
    log.info("Telemetry captured: suite=%s task=%s calls=%d cost=$%.2f burn=%.1fpp%s",
             suite_id, task_id, api_stats["calls"], float(api_stats["cost"]),
             delta_pp or 0, " (window-crossed)" if window_crossed else "")


async def log_event(conn, task_id, event_type, actor="system", data=None):
    await conn.execute(
        "INSERT INTO events (task_id, event_type, actor, data) VALUES ($1, $2, $3, $4)",
        task_id, event_type, actor, json.dumps(data or {})
    )


def task_to_dict(row):
    d = dict(row)
    for k in ("created_at", "updated_at", "closed_at"):
        if d.get(k):
            d[k] = d[k].isoformat()
    if d.get("metadata") and isinstance(d["metadata"], str):
        d["metadata"] = json.loads(d["metadata"])
    return d


# --- Webhook Infrastructure ---

async def fire_webhooks(event_type: str, payload: dict):
    """Fire webhooks with retry (up to 3 attempts, 0.5s/1.0s backoff)."""
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT url FROM webhooks WHERE $1 = ANY(events) OR events = '{}'",
                event_type
            )
        if not rows:
            return
        async with httpx.AsyncClient(timeout=5.0) as client:
            for row in rows:
                delivered = False
                for attempt in range(3):
                    try:
                        resp = await client.post(row["url"], json={
                            "event_type": event_type,
                            "timestamp": now_iso(),
                            **payload,
                        })
                        if resp.status_code < 500:
                            delivered = True
                            break
                    except Exception:
                        pass
                    if attempt < 2:
                        await asyncio.sleep(0.5 * (attempt + 1))
                if not delivered:
                    logger.warning("Webhook delivery failed after 3 attempts to %s for %s",
                                   row["url"], event_type)
    except Exception as e:
        logger.warning("Webhook fire error: %s", e)


def fire_webhooks_bg(event_type: str, payload: dict):
    """Schedule webhook delivery as a background task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(fire_webhooks(event_type, payload))
        else:
            asyncio.run(fire_webhooks(event_type, payload))
    except RuntimeError:
        pass


# --- Health ---

@app.get("/api/v1/health")
async def health():
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "version": "1.0.0-aion", "timestamp": now_iso()}
    except Exception as e:
        return JSONResponse({"status": "error", "error": str(e)}, status_code=503)


@app.get("/api/v1/version")
async def version():
    return {"version": "2.1.0", "pipeline": "v2"}


# --- Tasks ---

@app.get("/api/v1/tasks")
async def list_tasks(
    status: Optional[str] = None,
    label: Optional[str] = Query(None),
    search: Optional[str] = None,
    created_after: Optional[str] = None,
    updated_after: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1
    if label:
        conditions.append(f"${idx} = ANY(labels)")
        params.append(label)
        idx += 1
    if search:
        conditions.append(f"(title ILIKE ${idx} OR description ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1
    if created_after:
        conditions.append(f"created_at > ${idx}")
        params.append(datetime.fromisoformat(created_after.replace("Z", "+00:00")))
        idx += 1
    if updated_after:
        conditions.append(f"updated_at > ${idx}")
        params.append(datetime.fromisoformat(updated_after.replace("Z", "+00:00")))
        idx += 1

    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    query = f"SELECT * FROM tasks{where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx+1}"
    count_params = list(params)
    params.extend([limit, offset])

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        count_q = f"SELECT COUNT(*) FROM tasks{where}"
        total = await conn.fetchval(count_q, *count_params) if count_params else await conn.fetchval("SELECT COUNT(*) FROM tasks{where}".format(where=where))

    return {"tasks": [task_to_dict(r) for r in rows], "total": total}


@app.get("/api/v1/tasks/ready")
async def ready_tasks(limit: int = 10):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM tasks WHERE status = 'open' AND 'auto:ready' = ANY(labels) "
            "AND NOT ('waiting:owner' = ANY(labels) OR 'needs-input' = ANY(labels) OR 'manual-action' = ANY(labels) OR 'parked' = ANY(labels)) "
            "ORDER BY created_at LIMIT $1", limit
        )
    return {"tasks": [task_to_dict(r) for r in rows]}


@app.get("/api/v1/tasks/{task_id}")
async def get_task(task_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
    if not row:
        raise HTTPException(404, f"Task {task_id} not found")
    return task_to_dict(row)


@app.post("/api/v1/tasks")
async def create_task(request: Request):
    data = await request.json()
    task_id = data.get("id", gen_id())
    title = data.get("title", "Untitled")
    description = data.get("description", "")
    priority = data.get("priority", "medium")
    caller_labels = data.get("labels", [])
    actor = data.get("actor", "system")
    metadata = data.get("metadata", {})

    labels = list(DEFAULT_PIPELINE_LABELS)
    for cl in caller_labels:
        err = validate_dimension_label(cl)
        if err:
            raise HTTPException(400, err)
        parsed = parse_dimension_label(cl)
        if parsed:
            dim, _ = parsed
            labels = [l for l in labels if not l.startswith(f"{dim}:")]
        if cl not in labels:
            labels.append(cl)

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO tasks (id, title, description, priority, labels, created_by, metadata) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
            task_id, title, description, priority, labels, actor, json.dumps(metadata)
        )
        await log_event(conn, task_id, "created", actor, {"title": title, "labels": labels})

    fire_webhooks_bg("task:created", {"task_id": task_id, "title": title, "labels": labels})
    return {"id": task_id, "title": title, "status": "open", "labels": labels}


@app.patch("/api/v1/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    data = await request.json()
    actor = data.pop("actor", "system")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
        if not row:
            raise HTTPException(404, f"Task {task_id} not found")

        updates = []
        params = []
        idx = 1

        status_set = False
        closing = False
        if "status" in data:
            updates.append(f"status = ${idx}")
            params.append(data["status"])
            idx += 1
            status_set = True
            if data["status"] == "closed":
                closing = True
                # Preserve invariant: status='closed' implies closed_at IS NOT NULL.
                # COALESCE keeps any prior close timestamp (re-close is a no-op for closed_at).
                updates.append("closed_at = COALESCE(closed_at, NOW())")
        if "claim" in data and data["claim"]:
            updates.append(f"claimed_by = ${idx}")
            params.append(actor)
            idx += 1
            if not status_set:
                updates.append(f"status = ${idx}")
                params.append("in_progress")
                idx += 1
        if "labels" in data:
            updates.append(f"labels = ${idx}")
            params.append(data["labels"])
            idx += 1
        if "append_notes" in data:
            existing = row["notes"] or ""
            new_notes = existing + "\n" + data["append_notes"] if existing else data["append_notes"]
            updates.append(f"notes = ${idx}")
            params.append(new_notes)
            idx += 1
        if "priority" in data:
            updates.append(f"priority = ${idx}")
            params.append(data["priority"])
            idx += 1
        if "description" in data:
            updates.append(f"description = ${idx}")
            params.append(data["description"])
            idx += 1
        if "metadata" in data:
            existing_meta = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else (row["metadata"] or {})
            existing_meta.update(data["metadata"])
            updates.append(f"metadata = ${idx}")
            params.append(json.dumps(existing_meta))
            idx += 1

        if closing and "labels" not in data:
            current_labels = list(row["labels"] or [])
            clean_labels = strip_terminal_labels(current_labels)
            if clean_labels != current_labels:
                updates.append(f"labels = ${idx}")
                params.append(clean_labels)
                idx += 1

        if updates:
            updates.append(f"updated_at = ${idx}")
            params.append(datetime.now(timezone.utc))
            idx += 1
            params.append(task_id)
            await conn.execute(
                f"UPDATE tasks SET {', '.join(updates)} WHERE id = ${idx}",
                *params
            )
            await log_event(conn, task_id, "updated", actor, data)

    if closing:
        asyncio.create_task(_maybe_capture_telemetry(task_id))

    if "status" in data:
        fire_webhooks_bg("status:changed", {"task_id": task_id, "status": data["status"]})
    if "labels" in data:
        fire_webhooks_bg("label:transition", {"task_id": task_id, "labels": data["labels"]})

    return {"id": task_id, "updated": True}


async def _maybe_capture_telemetry(task_id: str):
    """Fire-and-forget: if this task has test_suite_id metadata, capture telemetry."""
    try:
        async with pool.acquire() as conn:
            meta = await conn.fetchval(
                "SELECT metadata FROM tasks WHERE id = $1", task_id)
            if meta:
                m = json.loads(meta) if isinstance(meta, str) else meta
                suite_id = m.get("test_suite_id")
                if suite_id:
                    await _capture_test_run_telemetry(conn, task_id, suite_id)
    except Exception as e:
        import logging
        logging.getLogger("pulse.telemetry").error("Telemetry capture failed for %s: %s", task_id, e)


@app.post("/api/v1/tasks/{task_id}/close")
async def close_task(task_id: str, request: Request):
    data = await request.json()
    reason = data.get("reason", "")
    actor = data.get("actor", "system")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT labels FROM tasks WHERE id = $1", task_id)
        clean_labels = strip_terminal_labels(list(row["labels"] or [])) if row else []
        await conn.execute(
            "UPDATE tasks SET status = 'closed', closed_at = NOW(), closed_reason = $1, "
            "labels = $2, updated_at = NOW() WHERE id = $3",
            reason, clean_labels, task_id
        )
        await log_event(conn, task_id, "closed", actor, {"reason": reason})

    asyncio.create_task(_maybe_capture_telemetry(task_id))
    return {"id": task_id, "status": "closed"}


# --- Labels ---

@app.post("/api/v1/tasks/{task_id}/labels")
async def add_labels(task_id: str, request: Request):
    data = await request.json()
    labels_to_add = data.get("labels", [])
    actor = data.get("actor", "system")

    for label in labels_to_add:
        err = validate_dimension_label(label)
        if err:
            raise HTTPException(400, err)

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT labels FROM tasks WHERE id = $1", task_id)
        if not row:
            raise HTTPException(404, f"Task {task_id} not found")

        current = list(row["labels"] or [])
        for label in labels_to_add:
            current = enforce_dimension_uniqueness(current, label)
            if label not in current:
                current.append(label)

        await conn.execute(
            "UPDATE tasks SET labels = $1, updated_at = NOW() WHERE id = $2",
            current, task_id
        )
        await log_event(conn, task_id, "labels_added", actor, {"labels": labels_to_add})

    for lbl in labels_to_add:
        fire_webhooks_bg("label:added", {"task_id": task_id, "label": lbl})
    return {"id": task_id, "labels_added": labels_to_add, "labels": current}


@app.delete("/api/v1/tasks/{task_id}/labels/{label}")
async def remove_label(task_id: str, label: str, actor: str = "system"):
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tasks SET labels = array_remove(labels, $1), updated_at = NOW() WHERE id = $2",
            label, task_id
        )
        await log_event(conn, task_id, "label_removed", actor, {"label": label})

    fire_webhooks_bg("label:removed", {"task_id": task_id, "label": label})
    return {"id": task_id, "label_removed": label}


# --- Webhooks ---

@app.post("/api/v1/webhooks")
async def register_webhook(request: Request):
    data = await request.json()
    url = data.get("url", "")
    events = data.get("events", [])
    if not url:
        raise HTTPException(400, "url is required")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM webhooks WHERE url = $1", url)
        if existing:
            await conn.execute("UPDATE webhooks SET events = $1 WHERE url = $2", events, url)
            return {"id": existing["id"], "url": url, "events": events, "updated": True}
        wid = await conn.fetchval(
            "INSERT INTO webhooks (url, events) VALUES ($1, $2) RETURNING id",
            url, events
        )
    return {"id": wid, "url": url, "events": events}


@app.get("/api/v1/webhooks")
async def list_webhooks():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM webhooks ORDER BY created_at")
    return {"webhooks": [dict(r) for r in rows]}


@app.delete("/api/v1/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: int):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM webhooks WHERE id = $1", webhook_id)
    return {"deleted": webhook_id}


# --- Conditional Update (atomic label claim) ---

@app.post("/api/v1/tasks/{task_id}/conditional-update")
async def conditional_update(task_id: str, request: Request):
    """Atomic label update with precondition check.

    Supports single or multi-label preconditions. Returns 200 if claim succeeded,
    409 if precondition failed (another service already claimed this task).
    """
    data = await request.json()
    preconditions = data.get("preconditions", [])
    if "precondition" in data:
        preconditions = [data["precondition"]]
    set_labels = data.get("set_labels", [])
    if "set_label" in data:
        set_labels = [data["set_label"]]
    remove_labels = data.get("remove_labels", [])
    set_status = data.get("status")
    set_metadata = data.get("metadata")
    actor = data.get("actor", "system")

    if not preconditions:
        raise HTTPException(400, "At least one precondition required")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT labels, status, metadata FROM tasks WHERE id = $1 FOR UPDATE", task_id
        )
        if not row:
            raise HTTPException(404, f"Task {task_id} not found")

        current_labels = list(row["labels"] or [])

        for pre in preconditions:
            label_val = pre.get("label_value") if isinstance(pre, dict) else pre
            if label_val not in current_labels:
                return JSONResponse(
                    {"error": "precondition_failed", "task_id": task_id,
                     "expected": label_val, "current_labels": current_labels},
                    status_code=409
                )

        new_labels = [l for l in current_labels if l not in remove_labels]
        for pre in preconditions:
            label_val = pre.get("label_value") if isinstance(pre, dict) else pre
            if label_val in new_labels:
                new_labels.remove(label_val)
        for lbl in set_labels:
            if lbl not in new_labels:
                new_labels.append(lbl)

        updates = ["labels = $1", "updated_at = $2"]
        params = [new_labels, datetime.now(timezone.utc)]
        idx = 3

        if set_status:
            updates.append(f"status = ${idx}")
            params.append(set_status)
            idx += 1
            if set_status == "closed":
                updates.append("closed_at = COALESCE(closed_at, NOW())")
                new_labels = strip_terminal_labels(new_labels)
                params[0] = new_labels

        if set_metadata:
            existing_meta = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else (row["metadata"] or {})
            existing_meta.update(set_metadata)
            updates.append(f"metadata = ${idx}")
            params.append(json.dumps(existing_meta))
            idx += 1

        params.append(task_id)
        await conn.execute(
            f"UPDATE tasks SET {', '.join(updates)} WHERE id = ${idx}",
            *params
        )
        await log_event(conn, task_id, "conditional_update", actor, {
            "preconditions": preconditions, "set_labels": set_labels,
            "remove_labels": remove_labels
        })

    fire_webhooks_bg("label:transition", {"task_id": task_id, "labels": new_labels})
    return {"id": task_id, "labels": new_labels, "claimed": True}


# --- Pipeline Active State ---

SIDECAR_DIR = os.environ.get("SIDECAR_DIR", ".claude/jobs/active")

@app.get("/api/v1/pipeline/active")
async def pipeline_active():
    """Returns task IDs with active sidecar files, grouped by pipeline stage."""
    result = {"staging": [], "evaluating": [], "orchestrating": [], "executing": [], "reviewing": []}
    sidecar_path = Path(SIDECAR_DIR)
    if not sidecar_path.exists():
        return result
    for f in sidecar_path.iterdir():
        if not f.suffix == ".json":
            continue
        try:
            data = json.loads(f.read_text())
            task_id = data.get("task_id", f.stem.replace(".exec", "").replace(".eval", "").replace(".review", ""))
            if ".eval." in f.name or f.name.endswith(".eval.json"):
                result["evaluating"].append(task_id)
            elif ".review." in f.name or f.name.endswith(".review.json"):
                result["reviewing"].append(task_id)
            elif ".stage." in f.name or f.name.endswith(".stage.json"):
                result["staging"].append(task_id)
            elif ".orch." in f.name or f.name.endswith(".orch.json"):
                result["orchestrating"].append(task_id)
            else:
                result["executing"].append(task_id)
        except Exception:
            continue
    return result


@app.get("/api/v1/pipeline/integrity")
async def pipeline_integrity():
    """Check all non-closed tasks for dimension integrity violations."""
    violations = []
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, labels FROM tasks WHERE status != 'closed'")

    for row in rows:
        labels = list(row["labels"] or [])
        task_id = row["id"]

        for dim, spec in PIPELINE_DIMENSIONS.items():
            dim_labels = [l for l in labels if l.startswith(f"{dim}:")]
            if len(dim_labels) == 0:
                violations.append({"task_id": task_id, "issue": f"missing:{dim}"})
            elif len(dim_labels) > 1:
                violations.append({"task_id": task_id, "issue": f"duplicate:{dim}", "values": dim_labels})
            elif dim_labels[0].split(":", 1)[1] not in spec["values"]:
                violations.append({"task_id": task_id, "issue": f"invalid:{dim}", "value": dim_labels[0]})

    return {"status": "ok" if len(violations) == 0 else "violations_found", "violations": violations, "total_checked": len(rows), "clean": len(violations) == 0}


@app.get("/api/v1/pipeline/stress-status")
async def pipeline_stress_status():
    """Returns task counts per pipeline dimension value from the tasks table.

    For each of the six pipeline dimensions (staging, evaluated, queued, active,
    completed, blocked), returns a dict mapping each observed value to its task
    count. Counts all tasks regardless of status.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT labels FROM tasks")

    result: dict = {dim: {} for dim in PIPELINE_DIMENSIONS}

    for row in rows:
        for label in (row["labels"] or []):
            parsed = parse_dimension_label(label)
            if parsed:
                dim, val = parsed
                result[dim][val] = result[dim].get(val, 0) + 1

    return result


# Used by the task automation pipeline to verify multi-step chain dependency execution.
# Agents call this endpoint to confirm the pipeline chain is reachable and operational
# before proceeding with chained task steps.
@app.get("/api/v1/pipeline/chain-test")
async def pipeline_chain_test():
    """Step 1 of the pipeline chain test. Returns chain operational status."""
    return {"chain": "operational", "step": 1}


# --- Live Task Detail ---

@app.get("/api/v1/tasks/{task_id}/live")
async def task_live_detail(task_id: str):
    """Live execution detail for a task — reads sidecar file + tails JSONL transcript."""
    sidecar_path = Path(SIDECAR_DIR) / f"{task_id}.exec.json"

    if not sidecar_path.exists():
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
        if not row:
            raise HTTPException(404, f"Task {task_id} not found")
        return {
            "task_id": task_id,
            "status": "not_active",
            "metadata": json.loads(row["metadata"]) if isinstance(row["metadata"], str) else (row["metadata"] or {}),
        }

    try:
        sidecar = json.loads(sidecar_path.read_text())
    except Exception:
        sidecar = {}

    elapsed = 0
    start_time = sidecar.get("start_time")
    if start_time:
        from datetime import datetime as dt
        try:
            start_dt = dt.fromisoformat(start_time.replace("Z", "+00:00"))
            elapsed = int((datetime.now(timezone.utc) - start_dt).total_seconds())
        except Exception:
            pass

    pid = sidecar.get("pid")
    pid_alive = False
    if pid:
        try:
            os.kill(int(pid), 0)
            pid_alive = True
        except (ProcessLookupError, ValueError, PermissionError):
            pass

    log_info = {"log_bytes": 0, "log_lines": 0, "activity_tail": []}
    log_file = sidecar.get("log_file")
    if log_file:
        log_path = Path(log_file)
        if log_path.exists():
            try:
                log_info["log_bytes"] = log_path.stat().st_size
                with open(log_path, "r", errors="replace") as f:
                    lines = f.readlines()
                log_info["log_lines"] = len(lines)
                tail = lines[-30:] if len(lines) > 30 else lines
                log_info["activity_tail"] = [l.rstrip() for l in tail if l.strip()]
            except Exception:
                pass

    return {
        "task_id": task_id,
        "status": "active" if pid_alive else "stale",
        "persona": sidecar.get("persona"),
        "model": sidecar.get("model"),
        "session_id": sidecar.get("session_id"),
        "pid": pid,
        "pid_alive": pid_alive,
        "start_time": start_time,
        "elapsed_seconds": elapsed,
        "log_bytes": log_info["log_bytes"],
        "log_lines": log_info["log_lines"],
        "activity_tail": log_info["activity_tail"],
        "prompt_preview": sidecar.get("prompt_preview"),
        "log_file": log_file,
    }


# --- Transitions ---

TRANSITIONS = {
    # --- Legacy (v1) transitions — DEPRECATED, kept for backward compat ---
    "approve": {
        "remove": ["pipeline:needs-approval"],
        "add": ["pipeline:approved", "auto:ready", "stage:queue"],
    },
    "modify": {
        "remove": ["pipeline:approved", "auto:ready", "stage:queue"],
        "add": ["stage:evaluate"],
    },
    "pause": {
        "remove": ["auto:ready", "auto:candidate", "stage:queue", "stage:execute",
                    "pipeline:needs-approval", "pipeline:approved"],
        "add": ["parked"],
        "status": "deferred",
    },
    "claim": {
        "remove": ["stage:queue"],
        "add": ["stage:execute"],
        "status": "in_progress",
    },
    "complete": {
        "remove_prefix": ["stage:", "auto:", "pipeline:", "risk:"],
        "status": "closed",
    },
    "executor-fail": {
        "remove": ["auto:ready"],
        "add": ["parked", "stage:review", "pipeline:needs-approval"],
    },
    # --- Pipeline v2 transitions (6-dimension label state machine, guarded) ---
    "v2-stage-done": {
        "requires": ["staging:processing"],
        "remove": ["staging:processing"],
        "add": ["staging:done"],
    },
    "v2-evaluate-done": {
        "requires": ["evaluated:processing"],
        "remove": ["evaluated:processing"],
        "add": ["evaluated:done"],
    },
    "v2-evaluate-block": {
        "requires": ["evaluated:processing"],
        "remove": ["evaluated:processing", "blocked:no"],
        "add": ["evaluated:blocked", "blocked:yes"],
    },
    "v2-queue-done": {
        "requires": ["queued:no"],
        "remove": ["queued:no"],
        "add": ["queued:done"],
    },
    "v2-execute-start": {
        "requires": ["active:claiming"],
        "remove": ["active:claiming"],
        "add": ["active:running"],
        "status": "in_progress",
    },
    "v2-execute-done": {
        "requires": ["active:running"],
        "remove": ["active:running"],
        "add": ["active:done"],
    },
    "v2-review-pass": {
        "requires": ["completed:reviewing"],
        "remove": ["completed:reviewing", "active:done"],
        "add": ["completed:done"],
        "status": "closed",
    },
    "v2-review-fail": {
        "requires": ["completed:reviewing"],
        "remove": ["completed:reviewing", "active:done"],
        "add": ["active:no", "blocked:yes"],
    },
    "v2-execute-fail": {
        "requires": ["active:running"],
        "remove": ["active:running"],
        "add": ["active:no", "queued:done"],
    },
    "v2-unblock": {
        "requires": ["blocked:yes"],
        "remove_prefix": ["staging:", "evaluated:", "queued:", "active:", "completed:", "blocked:", "reason:"],
        "add": ["staging:wait", "evaluated:no", "queued:no", "active:no", "completed:no", "blocked:no"],
        "status": "open",
    },
    "v2-reset-to-staging": {
        "remove_prefix": ["staging:", "evaluated:", "queued:", "active:", "completed:", "blocked:", "reason:"],
        "add": ["staging:wait", "evaluated:no", "queued:no", "active:no", "completed:no", "blocked:no"],
        "status": "open",
    },
}


@app.post("/api/v1/tasks/{task_id}/transition")
async def transition_task(task_id: str, request: Request):
    data = await request.json()
    scenario = data.get("scenario", "")
    actor = data.get("actor", "system")

    if scenario not in TRANSITIONS:
        raise HTTPException(400, f"Unknown transition: {scenario}")

    if scenario in V1_DEPRECATED_TRANSITIONS:
        logger.warning("Deprecated v1 transition '%s' by actor '%s' on task %s", scenario, actor, task_id)

    trans = TRANSITIONS[scenario]

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT labels, status FROM tasks WHERE id = $1 FOR UPDATE", task_id)
        if not row:
            raise HTTPException(404, f"Task {task_id} not found")

        labels = list(row["labels"] or [])

        for req in trans.get("requires", []):
            if req not in labels:
                return JSONResponse(
                    {"error": "precondition_failed", "scenario": scenario,
                     "required": req, "current_labels": labels},
                    status_code=409
                )

        # Remove specified labels
        for lbl in trans.get("remove", []):
            if lbl in labels:
                labels.remove(lbl)

        # Remove by prefix
        for prefix in trans.get("remove_prefix", []):
            labels = [l for l in labels if not l.startswith(prefix)]

        # Add specified labels
        for lbl in trans.get("add", []):
            if lbl not in labels:
                labels.append(lbl)

        new_status = trans.get("status", row["status"])

        if new_status == "closed":
            labels = strip_terminal_labels(labels)
            await conn.execute(
                "UPDATE tasks SET labels = $1, status = $2, updated_at = NOW(), closed_at = NOW() WHERE id = $3",
                labels, new_status, task_id,
            )
        else:
            await conn.execute(
                "UPDATE tasks SET labels = $1, status = $2, updated_at = NOW() WHERE id = $3",
                labels, new_status, task_id,
            )
        await log_event(conn, task_id, f"transition:{scenario}", actor, {"from_status": row["status"], "to_status": new_status})

    fire_webhooks_bg("label:transition", {"task_id": task_id, "scenario": scenario, "labels": labels})
    return {"id": task_id, "scenario": scenario, "status": new_status, "labels": labels}


@app.post("/api/v1/tasks/{task_id}/stage")
async def stage_transition(task_id: str, request: Request):
    data = await request.json()
    new_stage = data.get("new_stage", "")
    actor = data.get("actor", "system")

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT labels FROM tasks WHERE id = $1", task_id)
        if not row:
            raise HTTPException(404)

        labels = [l for l in (row["labels"] or []) if not l.startswith("stage:")]
        labels.append(f"stage:{new_stage}")

        await conn.execute("UPDATE tasks SET labels = $1, updated_at = NOW() WHERE id = $2", labels, task_id)
        await log_event(conn, task_id, "stage_change", actor, {"new_stage": new_stage})

    return {"id": task_id, "stage": new_stage}


# --- Triggers ---

@app.post("/api/v1/triggers/emit")
async def emit_trigger(request: Request):
    data = await request.json()
    async with pool.acquire() as conn:
        tid = await conn.fetchval(
            "INSERT INTO triggers (task_id, stage, source) VALUES ($1, $2, $3) RETURNING id",
            data.get("task_id"), data.get("stage"), data.get("source", "system")
        )
    return {"trigger_id": tid}


@app.post("/api/v1/triggers/claim-handler")
async def claim_triggers(request: Request):
    data = await request.json()
    handler = data.get("handler", "")
    claimed_by = data.get("claimed_by", handler)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "UPDATE triggers SET handler = $1, claimed_by = $2, status = 'claimed' "
            "WHERE status = 'pending' AND (handler IS NULL OR handler = $1) RETURNING *",
            handler, claimed_by
        )
    return {"claimed": len(rows), "triggers": [dict(r) for r in rows]}


@app.get("/api/v1/triggers/pending")
async def pending_triggers():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM triggers WHERE status = 'pending' ORDER BY created_at")
    return {"triggers": [dict(r) for r in rows]}


@app.post("/api/v1/triggers/{trigger_id}/complete")
async def complete_trigger(trigger_id: int, request: Request):
    data = await request.json()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE triggers SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2",
            data.get("result", "completed"), trigger_id
        )
    return {"trigger_id": trigger_id, "status": "completed"}


@app.post("/api/v1/triggers/{trigger_id}/fail")
async def fail_trigger(trigger_id: int, request: Request):
    data = await request.json()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE triggers SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2",
            data.get("error", ""), trigger_id
        )
    return {"trigger_id": trigger_id, "status": "failed"}


# --- Messages ---

@app.get("/api/v1/messages/pending")
async def pending_messages():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM messages WHERE delivered = FALSE ORDER BY created_at LIMIT 50"
        )
    results = []
    for r in rows:
        d = dict(r)
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        if isinstance(d.get("data"), str):
            d["data"] = json.loads(d["data"])
        results.append(d)
    return {"messages": results}


@app.post("/api/v1/messages")
async def create_message(request: Request):
    data = await request.json()
    async with pool.acquire() as conn:
        mid = await conn.fetchval(
            "INSERT INTO messages (event_type, source, actor, severity, job_name, data) "
            "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            data.get("event_type", "info"),
            data.get("source", "system"),
            data.get("actor", "system"),
            data.get("severity", "info"),
            data.get("job_name"),
            json.dumps(data.get("data", {}))
        )
    return {"id": mid}


@app.post("/api/v1/messages/{message_id}/deliver")
async def deliver_message(message_id: int):
    async with pool.acquire() as conn:
        await conn.execute("UPDATE messages SET delivered = TRUE WHERE id = $1", message_id)
    return {"id": message_id, "delivered": True}


# --- Jobs ---

@app.patch("/api/v1/jobs/{job_name}")
async def update_job(job_name: str, request: Request):
    data = await request.json()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO job_state (job_name, last_run, fail_count, data) "
            "VALUES ($1, $2, $3, $4) "
            "ON CONFLICT (job_name) DO UPDATE SET last_run = COALESCE($2, job_state.last_run), "
            "fail_count = COALESCE($3, job_state.fail_count), data = COALESCE($4, job_state.data)",
            job_name,
            data.get("last_run"),
            data.get("fail_count"),
            json.dumps(data.get("data", {}))
        )
    return {"job_name": job_name, "updated": True}


# --- Settings ---

@app.get("/api/v1/settings")
async def get_all_settings():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM settings ORDER BY key")
    return {"settings": {r["key"]: r["value"] for r in rows}}


@app.get("/api/v1/settings/{key}")
async def get_setting(key: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM settings WHERE key = $1", key)
    if not row:
        return {"key": key, "value": None}
    return {"key": key, "value": row["value"]}


@app.put("/api/v1/settings/{key}")
async def update_setting(key: str, request: Request):
    data = await request.json()
    value = data.get("value")
    actor = data.get("actor", "system")
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3) "
            "ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()",
            key, json.dumps(value), actor
        )
    return {"key": key, "value": value}


# --- Events ---

@app.get("/api/v1/events")
async def get_events(
    task_id: Optional[str] = None,
    event_type: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
):
    conditions = []
    params = []
    idx = 1
    if task_id:
        conditions.append(f"task_id = ${idx}")
        params.append(task_id)
        idx += 1
    if event_type:
        conditions.append(f"event_type = ${idx}")
        params.append(event_type)
        idx += 1
    if since:
        try:
            since_ts = parse_iso_ts(since)
        except (ValueError, TypeError) as e:
            raise HTTPException(400, f"Invalid 'since' timestamp '{since}': {e}")
        conditions.append(f"created_at > ${idx}")
        params.append(since_ts)
        idx += 1
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"SELECT * FROM events {where_clause} ORDER BY created_at DESC LIMIT ${idx}"
    params.append(limit)
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    results = []
    for r in rows:
        d = dict(r)
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        if isinstance(d.get("data"), str):
            d["data"] = json.loads(d["data"])
        results.append(d)
    return {"events": results}


@app.post("/api/v1/events")
async def create_event(request: Request):
    data = await request.json()
    task_id = data.get("task_id", "")
    event_type = data.get("event_type", "custom")
    actor = data.get("actor", "system")
    event_data = data.get("data", {})
    async with pool.acquire() as conn:
        await log_event(conn, task_id, event_type, actor, event_data)
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# --- Observability — audit / decision / cost dual-write receivers           ---
# Tables created by pulse/migrations/0001-phase-5-1-observability-tables.sql.
# Writers (shell + python send identical payloads):
#   shell:  .claude/jobs/lib/{audit,cost,decision}-log.sh
#   python: .claude/jobs/services/observability/{audit,cost,decision}_log.py
# ON CONFLICT clauses match the migration's UNIQUE constraints exactly (6/6/5 cols).
# ═══════════════════════════════════════════════════════════════════════════════


@app.post("/api/v1/audit/events")
async def post_audit_event(request: Request):
    data = await request.json()
    required = ("ts", "thread_id", "actor", "action", "entity_type", "entity_id")
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise HTTPException(400, f"Missing required fields: {', '.join(missing)}")
    try:
        ts = parse_iso_ts(data["ts"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid ts: {e}")
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO pulse.audit_log
                (ts, thread_id, actor, action, entity_type, entity_id,
                 task_id, project_id, session_id, severity, details, source_file)
            VALUES ($1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11::jsonb, $12)
            ON CONFLICT (thread_id, ts, actor, action, entity_type, entity_id) DO NOTHING
            """,
            ts, data["thread_id"], data["actor"], data["action"],
            data["entity_type"], data["entity_id"],
            data.get("task_id"), data.get("project_id"), data.get("session_id"),
            data.get("severity") or "info",
            json.dumps(data.get("details") or {}),
            data.get("source_file") or "api",
        )
    return {"status": "ok"}


@app.post("/api/v1/audit/decisions")
async def post_decision_event(request: Request):
    data = await request.json()
    required = ("ts", "thread_id", "actor", "decision_type", "outcome")
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise HTTPException(400, f"Missing required fields: {', '.join(missing)}")
    try:
        ts = parse_iso_ts(data["ts"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid ts: {e}")
    alts = data.get("alternatives")
    sigs = data.get("signals_matched")
    down = data.get("downstream_effect")
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO pulse.decision_events
                (ts, thread_id, parent_id, task_id, actor, decision_type, outcome,
                 alternatives, signals_matched, confidence, rationale, downstream_effect)
            VALUES ($1, $2, $3, $4, $5, $6, $7,
                    $8::jsonb, $9::jsonb, $10, $11, $12::jsonb)
            ON CONFLICT (thread_id, ts, actor, decision_type, outcome) DO NOTHING
            """,
            ts, data["thread_id"],
            data.get("parent_id"), data.get("task_id"),
            data["actor"], data["decision_type"], data["outcome"],
            json.dumps(alts) if alts is not None else None,
            json.dumps(sigs) if sigs is not None else None,
            data.get("confidence"), data.get("rationale"),
            json.dumps(down) if down is not None else None,
        )
    return {"status": "ok"}


@app.post("/api/v1/costs/events")
async def post_cost_event(request: Request):
    data = await request.json()
    if not data.get("ts"):
        raise HTTPException(400, "Missing required field: ts")
    try:
        ts = parse_iso_ts(data["ts"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid ts: {e}")
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO pulse.cost_events
                (ts, thread_id, task_id, session_id, job, persona, model, engine,
                 cost_usd, input_tokens, output_tokens, cache_read_tokens,
                 cache_creation_tokens, cache_hit_ratio, duration_s, success,
                 router_model, router_overridden, company, project_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12,
                    $13, $14, $15, $16,
                    $17, $18, $19, $20)
            ON CONFLICT (thread_id, ts, model, engine, job, persona) DO NOTHING
            """,
            ts, data.get("thread_id"), data.get("task_id"), data.get("session_id"),
            data.get("job"), data.get("persona"), data.get("model"), data.get("engine"),
            data.get("cost_usd"), data.get("input_tokens"), data.get("output_tokens"),
            data.get("cache_read_tokens"), data.get("cache_creation_tokens"),
            data.get("cache_hit_ratio"), data.get("duration_s"), data.get("success"),
            data.get("router_model"), data.get("router_overridden"),
            data.get("company"), data.get("project_id"),
        )
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# --- Observability — read-side endpoints (P1.B1.1)                          ---
# Symmetric to the POST receivers above. Replace dashboard direct-DB access.
# Consumed by dashboard/server/services/pulse-events.ts (post-refactor).
# ═══════════════════════════════════════════════════════════════════════════════


def _serialize_audit_row(r) -> dict:
    """asyncpg Record → dict, normalize ts/JSONB."""
    d = dict(r)
    if d.get("ts"):
        d["ts"] = d["ts"].isoformat()
    if isinstance(d.get("details"), str):
        d["details"] = json.loads(d["details"])
    return d


def _serialize_decision_row(r) -> dict:
    d = dict(r)
    if d.get("ts"):
        d["ts"] = d["ts"].isoformat()
    for k in ("alternatives", "signals_matched", "downstream_effect"):
        if isinstance(d.get(k), str):
            d[k] = json.loads(d[k])
    if isinstance(d.get("confidence"), Decimal):
        d["confidence"] = float(d["confidence"])
    return d


def _serialize_cost_row(r) -> dict:
    d = dict(r)
    if d.get("ts"):
        d["ts"] = d["ts"].isoformat()
    for k in ("cost_usd", "cache_hit_ratio", "duration_s"):
        if isinstance(d.get(k), Decimal):
            d[k] = float(d[k])
    return d


@app.get("/api/v1/audit/events")
async def list_audit_events(
    thread_id: Optional[str] = None,
    task_id: Optional[str] = None,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where: list[str] = []
    params: list = []

    def push(clause: str, value) -> None:
        params.append(value)
        where.append(clause.replace("?", f"${len(params)}"))

    if thread_id:
        push("thread_id = ?", thread_id)
    if task_id:
        push("task_id = ?", task_id)
    if actor:
        push("actor = ?", actor)
    if action:
        push("action = ?", action)
    if since:
        try:
            push("ts >= ?", parse_iso_ts(since))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid since: {since}")
    if until:
        try:
            push("ts <= ?", parse_iso_ts(until))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid until: {until}")

    sql = f"""
        SELECT id, ts, thread_id, actor, action, entity_type, entity_id, task_id,
               project_id, session_id, severity, details, source_file
        FROM pulse.audit_log
        {('WHERE ' + ' AND '.join(where)) if where else ''}
        ORDER BY ts DESC
        LIMIT {limit} OFFSET {offset}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return {
        "events": [_serialize_audit_row(r) for r in rows],
        "limit": limit,
        "offset": offset,
        "count": len(rows),
    }


@app.get("/api/v1/audit/decisions")
async def list_decision_events(
    thread_id: Optional[str] = None,
    task_id: Optional[str] = None,
    actor: Optional[str] = None,
    decision_type: Optional[str] = None,
    outcome: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where: list[str] = []
    params: list = []

    def push(clause: str, value) -> None:
        params.append(value)
        where.append(clause.replace("?", f"${len(params)}"))

    if thread_id:
        push("thread_id = ?", thread_id)
    if task_id:
        push("task_id = ?", task_id)
    if actor:
        push("actor = ?", actor)
    if decision_type:
        push("decision_type = ?", decision_type)
    if outcome:
        push("outcome = ?", outcome)
    if since:
        try:
            push("ts >= ?", parse_iso_ts(since))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid since: {since}")
    if until:
        try:
            push("ts <= ?", parse_iso_ts(until))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid until: {until}")

    sql = f"""
        SELECT id, ts, thread_id, parent_id, task_id, actor, decision_type, outcome,
               alternatives, signals_matched, confidence, rationale, downstream_effect
        FROM pulse.decision_events
        {('WHERE ' + ' AND '.join(where)) if where else ''}
        ORDER BY ts DESC
        LIMIT {limit} OFFSET {offset}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return {
        "decisions": [_serialize_decision_row(r) for r in rows],
        "limit": limit,
        "offset": offset,
        "count": len(rows),
    }


@app.get("/api/v1/costs/events")
async def list_cost_events(
    thread_id: Optional[str] = None,
    task_id: Optional[str] = None,
    job: Optional[str] = None,
    persona: Optional[str] = None,
    engine: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where: list[str] = []
    params: list = []

    def push(clause: str, value) -> None:
        params.append(value)
        where.append(clause.replace("?", f"${len(params)}"))

    if thread_id:
        push("thread_id = ?", thread_id)
    if task_id:
        push("task_id = ?", task_id)
    if job:
        push("job = ?", job)
    if persona:
        push("persona = ?", persona)
    if engine:
        push("engine = ?", engine)
    if since:
        try:
            push("ts >= ?", parse_iso_ts(since))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid since: {since}")
    if until:
        try:
            push("ts <= ?", parse_iso_ts(until))
        except (ValueError, TypeError):
            raise HTTPException(400, f"Invalid until: {until}")

    sql = f"""
        SELECT id, ts, thread_id, task_id, session_id, job, persona, model, engine,
               cost_usd, input_tokens, output_tokens, cache_read_tokens,
               cache_creation_tokens, cache_hit_ratio, duration_s, success,
               router_model, router_overridden, company, project_id
        FROM pulse.cost_events
        {('WHERE ' + ' AND '.join(where)) if where else ''}
        ORDER BY ts DESC
        LIMIT {limit} OFFSET {offset}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return {
        "events": [_serialize_cost_row(r) for r in rows],
        "limit": limit,
        "offset": offset,
        "count": len(rows),
    }


@app.get("/api/v1/observability/storyline/{thread_id}")
async def get_storyline(thread_id: str):
    """Joined audit + cost + decision events for a thread, ordered by ts ASC."""
    async with pool.acquire() as conn:
        audit_rows = await conn.fetch(
            """
            SELECT id, ts, thread_id, actor, action, entity_type, entity_id, task_id,
                   project_id, session_id, severity, details, source_file
            FROM pulse.audit_log WHERE thread_id = $1 ORDER BY ts ASC LIMIT 500
            """,
            thread_id,
        )
        cost_rows = await conn.fetch(
            """
            SELECT id, ts, thread_id, task_id, session_id, job, persona, model, engine,
                   cost_usd, input_tokens, output_tokens, cache_read_tokens,
                   cache_creation_tokens, cache_hit_ratio, duration_s, success,
                   router_model, router_overridden, company, project_id
            FROM pulse.cost_events WHERE thread_id = $1 ORDER BY ts ASC LIMIT 500
            """,
            thread_id,
        )
        dec_rows = await conn.fetch(
            """
            SELECT id, ts, thread_id, parent_id, task_id, actor, decision_type, outcome,
                   alternatives, signals_matched, confidence, rationale, downstream_effect
            FROM pulse.decision_events WHERE thread_id = $1 ORDER BY ts ASC LIMIT 500
            """,
            thread_id,
        )
    events: list[dict] = []
    for r in audit_rows:
        d = _serialize_audit_row(r)
        d["kind"] = "audit"
        events.append(d)
    for r in cost_rows:
        d = _serialize_cost_row(r)
        d["kind"] = "cost"
        events.append(d)
    for r in dec_rows:
        d = _serialize_decision_row(r)
        d["kind"] = "decision"
        events.append(d)
    events.sort(key=lambda e: e.get("ts") or "")
    return {"thread_id": thread_id, "events": events, "count": len(events)}


@app.get("/api/v1/observability/decisions/stats")
async def get_decision_stats(since_hours: int = Query(24, ge=1, le=720)):
    """Decision aggregates over the last `since_hours` (default 24, max 30 days)."""
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    async with pool.acquire() as conn:
        total_row = await conn.fetchrow(
            "SELECT COUNT(*) AS n FROM pulse.decision_events WHERE ts >= $1", since
        )
        by_actor = await conn.fetch(
            "SELECT actor, COUNT(*) AS n FROM pulse.decision_events WHERE ts >= $1"
            " GROUP BY actor ORDER BY COUNT(*) DESC LIMIT 10",
            since,
        )
        by_type = await conn.fetch(
            "SELECT decision_type, COUNT(*) AS n FROM pulse.decision_events WHERE ts >= $1"
            " GROUP BY decision_type ORDER BY COUNT(*) DESC LIMIT 10",
            since,
        )
        by_outcome = await conn.fetch(
            "SELECT outcome, COUNT(*) AS n FROM pulse.decision_events WHERE ts >= $1"
            " GROUP BY outcome ORDER BY COUNT(*) DESC LIMIT 10",
            since,
        )
        threads_row = await conn.fetchrow(
            "SELECT COUNT(DISTINCT thread_id) AS n FROM pulse.decision_events WHERE ts >= $1",
            since,
        )
    total = int(total_row["n"]) if total_row else 0
    return {
        "total": total,
        "by_actor": [{"actor": r["actor"], "count": int(r["n"])} for r in by_actor],
        "by_decision_type": [{"decision_type": r["decision_type"], "count": int(r["n"])} for r in by_type],
        "by_outcome": [{"outcome": r["outcome"], "count": int(r["n"])} for r in by_outcome],
        "decisions_per_hour": (total / since_hours) if since_hours else 0,
        "unique_threads": int(threads_row["n"]) if threads_row else 0,
        "since_hours": since_hours,
    }


@app.get("/api/v1/observability/threads")
async def list_recent_threads(limit: int = Query(50, ge=1, le=500)):
    """Distinct decision-event threads with first/last timestamps and counts."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT thread_id,
                   MIN(ts) AS first_ts,
                   MAX(ts) AS last_ts,
                   COUNT(*) AS decision_count
            FROM pulse.decision_events
            GROUP BY thread_id
            ORDER BY MAX(ts) DESC
            LIMIT $1
            """,
            limit,
        )
    return {
        "threads": [
            {
                "thread_id": r["thread_id"],
                "first_ts": r["first_ts"].isoformat() if r["first_ts"] else None,
                "last_ts": r["last_ts"].isoformat() if r["last_ts"] else None,
                "decision_count": int(r["decision_count"]),
            }
            for r in rows
        ],
        "count": len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Reviewer Dash backend (R1)                                              ---
# Per plans/aifred-pro-dev-reviewer-dash.md: 3 GET endpoints feeding the new
# dashboard timeline page. Boundary-correct — no direct-DB consumption from
# dashboard; all reads go through these endpoints.
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/observability/timeline")
async def get_observability_timeline(
    since_hours: int = Query(24, ge=1, le=720),
    persona: Optional[str] = None,
    actor: Optional[str] = None,
    decision_type: Optional[str] = None,
    outcome: Optional[str] = None,
    task_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(200, ge=1, le=500),
):
    """Flat timeline of decisions ordered by ts ASC, with nearest-cost annotation.

    Cost annotation is a correlated subquery: for each decision, the cost row
    in the same thread_id with the smallest |delta_ts|. Decisions outside any
    thread that produced cost rows yield NULL nearest_cost_usd. This is a
    debug-flow projection — for full per-thread storyline use
    /api/v1/observability/storyline/{thread_id}.

    Filter contract (REO B4):
      - persona: single-value backward-compat alias for actor. Treated as
        actor if both supplied (actor wins).
      - actor / decision_type / outcome: comma-separated multivalue (e.g.
        actor=persona:reviewer,reviewer). Each becomes ANY($N::text[]).
      - task_id / thread_id: exact-match single value.
      - q: free-text ILIKE against rationale plus downstream_effect::text.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    where = ["d.ts >= $1"]
    params: list = [since]

    def _csv_list(s: Optional[str]) -> Optional[list]:
        if not s:
            return None
        items = [v.strip() for v in s.split(",") if v.strip()]
        return items or None

    actor_list = _csv_list(actor) or _csv_list(persona)
    if actor_list:
        if len(actor_list) == 1:
            params.append(actor_list[0])
            where.append(f"d.actor = ${len(params)}")
        else:
            params.append(actor_list)
            where.append(f"d.actor = ANY(${len(params)}::text[])")

    dt_list = _csv_list(decision_type)
    if dt_list:
        if len(dt_list) == 1:
            params.append(dt_list[0])
            where.append(f"d.decision_type = ${len(params)}")
        else:
            params.append(dt_list)
            where.append(f"d.decision_type = ANY(${len(params)}::text[])")

    out_list = _csv_list(outcome)
    if out_list:
        if len(out_list) == 1:
            params.append(out_list[0])
            where.append(f"d.outcome = ${len(params)}")
        else:
            params.append(out_list)
            where.append(f"d.outcome = ANY(${len(params)}::text[])")

    if task_id:
        params.append(task_id)
        where.append(f"d.task_id = ${len(params)}")

    if thread_id:
        params.append(thread_id)
        where.append(f"d.thread_id = ${len(params)}")

    if q:
        params.append(f"%{q}%")
        where.append(
            f"(d.rationale ILIKE ${len(params)} "
            f"OR d.downstream_effect::text ILIKE ${len(params)})"
        )

    sql = f"""
        SELECT d.id, d.ts, d.thread_id, d.task_id, d.actor, d.decision_type,
               d.outcome, d.confidence, d.rationale,
               (
                 SELECT c.cost_usd FROM pulse.cost_events c
                 WHERE c.thread_id = d.thread_id
                 ORDER BY abs(EXTRACT(EPOCH FROM (c.ts - d.ts))) ASC
                 LIMIT 1
               ) AS nearest_cost_usd,
               (
                 SELECT c.persona FROM pulse.cost_events c
                 WHERE c.thread_id = d.thread_id
                 ORDER BY abs(EXTRACT(EPOCH FROM (c.ts - d.ts))) ASC
                 LIMIT 1
               ) AS nearest_cost_persona
        FROM pulse.decision_events d
        WHERE {' AND '.join(where)}
        ORDER BY d.ts ASC
        LIMIT {limit}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    events = []
    for r in rows:
        d = dict(r)
        if d.get("ts"):
            d["ts"] = d["ts"].isoformat()
        if isinstance(d.get("confidence"), Decimal):
            d["confidence"] = float(d["confidence"])
        if isinstance(d.get("nearest_cost_usd"), Decimal):
            d["nearest_cost_usd"] = float(d["nearest_cost_usd"])
        events.append(d)
    return {
        "events": events,
        "count": len(events),
        "since_hours": since_hours,
        "filters": {
            "actor": actor_list,
            "decision_type": dt_list,
            "outcome": out_list,
            "task_id": task_id,
            "thread_id": thread_id,
            "q": q,
        },
        "persona": actor_list[0] if actor_list and len(actor_list) == 1 else None,
    }


@app.get("/api/v1/observability/persona-aggregates")
async def get_persona_aggregates(since_hours: int = Query(24, ge=1, le=720)):
    """Per-actor aggregates over the last `since_hours`.

    Joins decision_events grouped by (actor, thread_id) to cost_events grouped
    by thread_id, then re-aggregates by actor. Decisions in threads with no
    cost rows still count toward decision_count but contribute $0 / 0s.
    Used by ReviewerDash filter chips and stat cards.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    sql = """
        WITH dec AS (
            SELECT actor, thread_id, COUNT(*) AS decision_count
            FROM pulse.decision_events
            WHERE ts >= $1
            GROUP BY actor, thread_id
        ),
        costs AS (
            SELECT thread_id,
                   SUM(cost_usd) AS total_cost_usd,
                   AVG(duration_s) AS avg_duration_s
            FROM pulse.cost_events
            WHERE ts >= $1
            GROUP BY thread_id
        )
        SELECT d.actor,
               SUM(d.decision_count) AS decision_count,
               COALESCE(SUM(c.total_cost_usd), 0) AS total_cost_usd,
               AVG(c.avg_duration_s) AS avg_duration_s,
               COUNT(DISTINCT d.thread_id) AS thread_count
        FROM dec d
        LEFT JOIN costs c ON c.thread_id = d.thread_id
        GROUP BY d.actor
        ORDER BY SUM(d.decision_count) DESC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, since)
    aggs = []
    for r in rows:
        aggs.append({
            "actor": r["actor"],
            "decision_count": int(r["decision_count"] or 0),
            "total_cost_usd": float(r["total_cost_usd"] or 0),
            "avg_duration_s": float(r["avg_duration_s"]) if r["avg_duration_s"] is not None else None,
            "thread_count": int(r["thread_count"] or 0),
        })
    return {
        "aggregates": aggs,
        "count": len(aggs),
        "since_hours": since_hours,
    }


@app.get("/api/v1/observability/decisions/{event_id}")
async def get_decision_by_id(event_id: int):
    """Single decision row + linked cost + audit rows in the same thread.

    Returns 404 if event_id not present. linked_costs and linked_audit are
    the full ordered trails for that thread — let the drawer assemble the
    breakdown. REO B6: case-file drawer joins all three on thread_id.
    """
    async with pool.acquire() as conn:
        dec_row = await conn.fetchrow(
            """
            SELECT id, ts, thread_id, parent_id, task_id, actor, decision_type,
                   outcome, alternatives, signals_matched, confidence, rationale,
                   downstream_effect
            FROM pulse.decision_events
            WHERE id = $1
            """,
            event_id,
        )
        if not dec_row:
            raise HTTPException(404, f"Decision event {event_id} not found")
        cost_rows = await conn.fetch(
            """
            SELECT id, ts, job, persona, model, engine, cost_usd, input_tokens,
                   output_tokens, cache_read_tokens, cache_creation_tokens,
                   cache_hit_ratio, duration_s, success
            FROM pulse.cost_events
            WHERE thread_id = $1
            ORDER BY ts ASC
            """,
            dec_row["thread_id"],
        )
        audit_rows = await conn.fetch(
            """
            SELECT id, ts, thread_id, actor, action, entity_type, entity_id,
                   task_id, project_id, session_id, severity, details, source_file
            FROM pulse.audit_log
            WHERE thread_id = $1
            ORDER BY ts ASC
            """,
            dec_row["thread_id"],
        )
    decision = _serialize_decision_row(dec_row)
    costs = [_serialize_cost_row(r) for r in cost_rows]
    audit = [_serialize_audit_row(r) for r in audit_rows]
    return {"decision": decision, "linked_costs": costs, "linked_audit": audit}


# --- Project Import ---

@app.post("/api/v1/projects/import")
async def import_project(request: Request):
    data = await request.json()
    yaml_content = data.get("yaml", data.get("content", ""))

    if isinstance(yaml_content, str):
        try:
            plan = yaml.safe_load(yaml_content)
        except Exception:
            raise HTTPException(400, "Invalid YAML content")
    else:
        plan = yaml_content

    tasks = plan.get("tasks", [])
    created = 0

    # Pass 1: assign IDs and build title-prefix→ID mapping for depends_on resolution
    title_to_id: dict[str, str] = {}
    task_rows = []
    for task in tasks:
        task_id = gen_id("SETUP")
        title = task.get("title", "Untitled")
        # Map title prefixes like "GS-1:" to the generated ID
        prefix = title.split(":")[0].strip() if ":" in title else title.strip()
        title_to_id[prefix] = task_id
        task_rows.append((task_id, task))

    # Pass 2: resolve depends_on logical names to actual task IDs, then insert
    async with pool.acquire() as conn:
        for task_id, task in task_rows:
            labels = task.get("labels", [])
            if "source:orchestration" not in labels:
                labels.append("source:orchestration")
            metadata = {}
            if "depends_on" in task:
                resolved = [title_to_id.get(dep, dep) for dep in task["depends_on"]]
                metadata["depends_on"] = resolved
            if "phase" in task:
                metadata["phase"] = task["phase"]
                labels.append(f"phase:{task['phase']}")

            await conn.execute(
                "INSERT INTO tasks (id, title, description, priority, labels, metadata, created_by) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
                task_id, task.get("title", "Untitled"),
                task.get("description", ""), task.get("priority", "medium"),
                labels, json.dumps(metadata), "bootstrap"
            )
            created += 1

    return {"imported": created, "total_tasks": len(tasks), "id_map": title_to_id}


# ═══════════════════════════════════════════════════════════════════════════════
# --- Usage Tracking — Token-based, Anthropic session-aware                  ---
# --- Data source: ONLY proxy-captured Anthropic API headers (source='proxy') -
# --- "Session" = Anthropic 5h rolling window, NOT Claude Code session_id    ---
# ═══════════════════════════════════════════════════════════════════════════════

# Filter: ONLY proxy-captured data with actual Anthropic headers.
# No fallback, no backfill, no estimation.
PROXY_ONLY = "source = 'proxy' AND http_status = 200"


@app.get("/api/v1/usage/session-window")
async def usage_session_window():
    """Anthropic 5h rolling window state from unified rate-limit headers.

    This is the Anthropic-enforced session — a 5-hour rolling token budget
    that resets on a sliding window. This is NOT a Claude Code session.
    """
    async with pool.acquire() as conn:
        latest = await conn.fetchrow(f"""
            SELECT unified_status, unified_5h_status, unified_5h_utilization,
                   unified_5h_reset, unified_7d_status, unified_7d_utilization,
                   unified_7d_reset, unified_representative_claim,
                   unified_fallback_pct,
                   rl_tokens_limit, rl_tokens_remaining,
                   rl_input_remaining, rl_output_remaining,
                   timestamp
            FROM api_requests
            WHERE unified_status IS NOT NULL AND {PROXY_ONLY}
            ORDER BY id DESC LIMIT 1
        """)

    if not latest:
        return {
            "status": "no_proxy_data",
            "message": "No proxy-captured requests with Anthropic unified headers. Set ANTHROPIC_BASE_URL=http://localhost:9800 to route traffic through the proxy.",
        }

    five_h_util = float(latest["unified_5h_utilization"]) if latest["unified_5h_utilization"] else None
    seven_d_util = float(latest["unified_7d_utilization"]) if latest["unified_7d_utilization"] else None
    representative = latest["unified_representative_claim"] or "five_hour"

    # Compute reset countdown for 5h window
    reset_5h = latest["unified_5h_reset"]
    reset_5h_seconds = None
    if reset_5h:
        delta = (reset_5h - datetime.now(timezone.utc)).total_seconds()
        reset_5h_seconds = max(0, int(delta))

    reset_7d = latest["unified_7d_reset"]
    reset_7d_seconds = None
    if reset_7d:
        delta = (reset_7d - datetime.now(timezone.utc)).total_seconds()
        reset_7d_seconds = max(0, int(delta))

    return {
        "unified_status": latest["unified_status"],
        "representative_claim": representative,
        "five_hour": {
            "status": latest["unified_5h_status"],
            "utilization": five_h_util,
            "reset_at": reset_5h.isoformat() if reset_5h else None,
            "reset_seconds": reset_5h_seconds,
        },
        "seven_day": {
            "status": latest["unified_7d_status"],
            "utilization": seven_d_util,
            "reset_at": reset_7d.isoformat() if reset_7d else None,
            "reset_seconds": reset_7d_seconds,
        },
        "per_minute_rate_limit": {
            "tokens_limit": latest["rl_tokens_limit"],
            "tokens_remaining": latest["rl_tokens_remaining"],
            "input_remaining": latest["rl_input_remaining"],
            "output_remaining": latest["rl_output_remaining"],
        },
        "last_updated": latest["timestamp"].isoformat(),
    }


@app.get("/api/v1/usage/session-tokens")
async def usage_session_tokens():
    """Token breakdown for the current Anthropic 5h window.

    The Anthropic 5h window is FIXED, not rolling. It has a defined reset
    timestamp that does not change until the window resets. All requests
    sharing the same unified_5h_reset belong to the same session window.
    The window boundary is determined EXCLUSIVELY from the header data.
    """
    async with pool.acquire() as conn:
        # Get the current window's reset timestamp
        latest = await conn.fetchrow(f"""
            SELECT unified_5h_reset, unified_5h_utilization,
                   rl_tokens_limit, rl_tokens_remaining
            FROM api_requests
            WHERE unified_5h_reset IS NOT NULL AND {PROXY_ONLY}
            ORDER BY id DESC LIMIT 1
        """)

        if not latest or not latest["unified_5h_reset"]:
            return {
                "status": "no_proxy_data",
                "message": "No proxy-captured requests with Anthropic rate-limit headers.",
            }

        current_reset = latest["unified_5h_reset"]

        # Sum tokens for all requests in THIS window (same reset timestamp)
        row = await conn.fetchrow(f"""
            SELECT COUNT(*) as request_count,
                   COALESCE(SUM(input_tokens), 0) as input_tokens,
                   COALESCE(SUM(output_tokens), 0) as output_tokens,
                   COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
                   COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
                   MIN(timestamp) as window_first_request
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
        """, current_reset)

    utilization = float(latest["unified_5h_utilization"]) if latest["unified_5h_utilization"] else 0
    tokens_limit = latest["rl_tokens_limit"]
    tokens_remaining = latest["rl_tokens_remaining"]

    total_spent = (row["input_tokens"] or 0) + (row["output_tokens"] or 0)
    window_first = row["window_first_request"]

    return {
        "window_reset": current_reset.isoformat(),
        "window_first_request": window_first.isoformat() if window_first else None,
        "utilization": utilization,
        "tokens_spent": total_spent,
        "input_tokens": row["input_tokens"] or 0,
        "output_tokens": row["output_tokens"] or 0,
        "cache_read_tokens": row["cache_read_tokens"] or 0,
        "cache_write_tokens": row["cache_write_tokens"] or 0,
        "request_count": row["request_count"],
        "rate_limit_tokens_limit": tokens_limit,
        "rate_limit_tokens_remaining": tokens_remaining,
    }


@app.get("/api/v1/usage/session-spend-dollars")
async def usage_session_spend_dollars():
    """USD cost breakdown for the current Anthropic 5h window.

    Anchored on the latest unified_5h_reset (same window-frame as
    /usage/session-tokens). Returns total cost in USD, by-model and by-agent
    breakdowns, and a linear projection of cost-to-window-end based on the
    current burn rate.

    Design: Jarvis/projects/project-aion/designs/reverse-proxy-paradigm-and-surfacing-2026-05-05.md §8.3
    """
    async with pool.acquire() as conn:
        latest = await conn.fetchrow(f"""
            SELECT unified_5h_reset
            FROM api_requests
            WHERE unified_5h_reset IS NOT NULL AND {PROXY_ONLY}
            ORDER BY id DESC LIMIT 1
        """)

        if not latest or not latest["unified_5h_reset"]:
            return {
                "status": "no_proxy_data",
                "message": "No proxy-captured requests with Anthropic rate-limit headers.",
            }

        current_reset = latest["unified_5h_reset"]

        totals = await conn.fetchrow(f"""
            SELECT COALESCE(SUM(cost_usd), 0) AS total_usd,
                   COUNT(*) AS request_count,
                   MIN(timestamp) AS window_first_request
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
        """, current_reset)

        by_model = await conn.fetch(f"""
            SELECT COALESCE(model, 'unknown') AS model,
                   COALESCE(SUM(cost_usd), 0) AS cost_usd,
                   COUNT(*) AS request_count
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
            GROUP BY model
            ORDER BY cost_usd DESC
        """, current_reset)

        by_agent = await conn.fetch(f"""
            SELECT COALESCE(agent_name, 'unattributed') AS agent_name,
                   COALESCE(SUM(cost_usd), 0) AS cost_usd,
                   COUNT(*) AS request_count
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
            GROUP BY agent_name
            ORDER BY cost_usd DESC
        """, current_reset)

    total_usd = float(totals["total_usd"] or 0)
    window_first = totals["window_first_request"]

    # Linear projection: scale current spend by (remaining / elapsed)
    projection_usd = None
    if window_first and current_reset:
        now = datetime.now(timezone.utc)
        elapsed = (now - window_first).total_seconds()
        remaining = max(0, (current_reset - now).total_seconds())
        if elapsed > 0:
            projection_usd = total_usd + (total_usd / elapsed) * remaining

    return {
        "window_reset": current_reset.isoformat(),
        "window_first_request": window_first.isoformat() if window_first else None,
        "total_usd": round(total_usd, 6),
        "request_count": totals["request_count"],
        "projection_to_window_end_usd": (
            round(projection_usd, 6) if projection_usd is not None else None
        ),
        "by_model": [
            {
                "model": r["model"],
                "cost_usd": float(r["cost_usd"] or 0),
                "request_count": r["request_count"],
            }
            for r in by_model
        ],
        "by_agent": [
            {
                "agent_name": r["agent_name"],
                "cost_usd": float(r["cost_usd"] or 0),
                "request_count": r["request_count"],
            }
            for r in by_agent
        ],
    }


@app.get("/api/v1/usage/model-tokens")
async def usage_model_tokens():
    """Token count per Anthropic model in the current 5h window.

    Window boundary from unified_5h_reset header. Not computed.
    """
    async with pool.acquire() as conn:
        latest = await conn.fetchrow(f"""
            SELECT unified_5h_reset
            FROM api_requests
            WHERE unified_5h_reset IS NOT NULL AND {PROXY_ONLY}
            ORDER BY id DESC LIMIT 1
        """)

        if not latest or not latest["unified_5h_reset"]:
            return {
                "status": "no_proxy_data",
                "message": "No proxy-captured requests with Anthropic rate-limit headers.",
            }

        current_reset = latest["unified_5h_reset"]

        rows = await conn.fetch(f"""
            SELECT COALESCE(model, 'unknown') as model,
                   COUNT(*) as request_count,
                   COALESCE(SUM(input_tokens), 0) as input_tokens,
                   COALESCE(SUM(output_tokens), 0) as output_tokens,
                   COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
                   COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
            GROUP BY model
            ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC
        """, current_reset)

    return {
        "window_reset": current_reset.isoformat(),
        "models": [
            {
                "model": r["model"],
                "request_count": r["request_count"],
                "input_tokens": r["input_tokens"],
                "output_tokens": r["output_tokens"],
                "cache_read_tokens": r["cache_read_tokens"],
                "cache_write_tokens": r["cache_write_tokens"],
                "total_tokens": r["input_tokens"] + r["output_tokens"],
            }
            for r in rows
        ],
    }


# In-process cache for the historical message-size histogram.
# Populated on demand and refreshed at most once per `_HIST_CACHE_TTL` seconds.
# Lost on container restart (acceptable: cold-start recomputes once).
_message_sizes_historical_cache: Dict[str, Any] = {"computed_at": None, "payload": None}
_HIST_CACHE_TTL = 24 * 3600  # 24h


def _quantile(sorted_values: list, q: float) -> float:
    """Linear-interpolation quantile on a pre-sorted list."""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = q * (len(sorted_values) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = pos - lo
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac)


# Canonical log-spaced bin candidates. The endpoint truncates to the smallest
# prefix that brackets the observed historical max, then keeps an open-ended
# top bin (>= last boundary). Round values are deliberate — visual continuity
# matters more than arithmetic precision once bins are wider than ~1K tokens.
_LOG_BIN_CANDIDATES = [
    100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000,
]


def _derive_log_bin_boundaries(max_tokens: int) -> list:
    """Pick log-spaced round boundaries that just enclose the observed max.

    Always starts at 0; the last boundary is the lower edge of the open-ended
    top bin (everything ≥ that boundary spills there). For max=64354, returns
    [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000] (11 bins,
    last is [64K, +inf) which catches the 64354 max).

    Stop condition uses strict > so the first candidate above max becomes the
    upper-bound *of the open-ended bin*, not an extra empty boundary.
    """
    boundaries = [0]
    for c in _LOG_BIN_CANDIDATES:
        if c > max_tokens:
            break
        boundaries.append(c)
    # Guarantee at least 2 bins even when max_tokens is tiny / zero.
    if len(boundaries) == 1:
        boundaries.append(_LOG_BIN_CANDIDATES[0])
    return boundaries


def _format_bin_label(from_v: int, to_v) -> str:
    """Render a bin range as a tight label (e.g. '500-1K', '32K-64K', '64K+')."""
    def _fmt(v: int) -> str:
        if v >= 1000:
            return f"{v // 1000}K" if v % 1000 == 0 else f"{v / 1000:.1f}K"
        return str(v)
    if to_v is None:
        return f"{_fmt(from_v)}+"
    return f"{_fmt(from_v)}-{_fmt(to_v)}"


@app.get("/api/v1/usage/message-sizes-historical")
async def usage_message_sizes_historical(days: int = 30):
    """Per-bin boxplot stats over the last `days` days, grouped by 5h session.

    For each log-spaced token-size bin, returns the Q0/Q1/Q2/Q3/Q4 of
    *per-session message counts*. A "session" is one Anthropic 5h window
    (identified by `unified_5h_reset`). Only completed sessions are
    included — the live current window is excluded so the overlay reads
    "what's typical" rather than "what's happening right now".

    Bin boundaries are log-spaced (0, 100, 250, 500, 1K, 2K, ...) with the
    top bin open-ended (>=). The boundaries are derived from the observed
    historical max so the chart has stable bin widths in the rendering layer.

    Cached in-process for 24h. `days` is capped at 90.
    """
    days = max(1, min(int(days), 90))

    now = datetime.now(timezone.utc)
    cached_at = _message_sizes_historical_cache.get("computed_at")
    if cached_at and (now - cached_at).total_seconds() < _HIST_CACHE_TTL:
        cached = _message_sizes_historical_cache.get("payload")
        if cached:
            return cached

    cutoff = now - timedelta(days=days)
    async with pool.acquire() as conn:
        # Only completed 5h sessions: unified_5h_reset is in the past.
        rows = await conn.fetch(f"""
            SELECT (input_tokens + output_tokens) AS total_tokens,
                   unified_5h_reset
            FROM api_requests
            WHERE timestamp >= $1
              AND unified_5h_reset IS NOT NULL
              AND unified_5h_reset < $2
              AND {PROXY_ONLY}
        """, cutoff, now)

    boundaries = _derive_log_bin_boundaries(0)
    if not rows:
        empty_bins = []
        for i in range(len(boundaries)):
            from_v = boundaries[i]
            to_v = boundaries[i + 1] if i + 1 < len(boundaries) else None
            empty_bins.append({
                "index": i,
                "from": from_v,
                "to": to_v,
                "label": _format_bin_label(from_v, to_v),
                "count": 0,
                "q0": 0, "q1": 0, "q2": 0, "q3": 0, "q4": 0,
                "n_sessions_with_msgs": 0,
            })
        payload = {
            "days": days,
            "computed_at": now.isoformat(),
            "max_message_tokens": 0,
            "message_count": 0,
            "n_sessions": 0,
            "bins": empty_bins,
        }
        _message_sizes_historical_cache["computed_at"] = now
        _message_sizes_historical_cache["payload"] = payload
        return payload

    totals = [int(r["total_tokens"] or 0) for r in rows]
    max_tokens = max(totals) if totals else 0
    boundaries = _derive_log_bin_boundaries(max_tokens)
    n_bins = len(boundaries)  # final bin is open-ended

    def _bin_index(tokens: int) -> int:
        # Walk boundaries; last bin is everything >= boundaries[-1].
        for i in range(1, n_bins):
            if tokens < boundaries[i]:
                return i - 1
        return n_bins - 1

    # Per-session, per-bin count — NOT per-day. A session is one 5h window.
    # Sessions with zero rows in a given bin contribute 0 to that bin's
    # distribution (so quiet sessions correctly anchor the lower whisker).
    sessions_seen = set()
    session_bin_counts: dict = {}  # (session_id, bin_idx) → count
    for r in rows:
        sid = r["unified_5h_reset"]
        sessions_seen.add(sid)
        bidx = _bin_index(int(r["total_tokens"] or 0))
        session_bin_counts[(sid, bidx)] = session_bin_counts.get((sid, bidx), 0) + 1

    bins_out = []
    for i in range(n_bins):
        per_session = [session_bin_counts.get((s, i), 0) for s in sessions_seen]
        per_session.sort()
        from_v = boundaries[i]
        to_v = boundaries[i + 1] if i + 1 < n_bins else None
        bins_out.append({
            "index": i,
            "from": from_v,
            "to": to_v,
            "label": _format_bin_label(from_v, to_v),
            "count": sum(per_session),
            "q0": int(per_session[0]) if per_session else 0,
            "q1": int(round(_quantile(per_session, 0.25))),
            "q2": int(round(_quantile(per_session, 0.50))),
            "q3": int(round(_quantile(per_session, 0.75))),
            "q4": int(per_session[-1]) if per_session else 0,
            "n_sessions_with_msgs": sum(1 for c in per_session if c > 0),
        })

    payload = {
        "days": days,
        "computed_at": now.isoformat(),
        "max_message_tokens": max_tokens,
        "message_count": len(totals),
        "n_sessions": len(sessions_seen),
        "bins": bins_out,
    }
    _message_sizes_historical_cache["computed_at"] = now
    _message_sizes_historical_cache["payload"] = payload
    return payload


@app.get("/api/v1/usage/message-sizes")
async def usage_message_sizes():
    """Per-request token sizes for histogram display.

    Returns individual request token counts (input+output) in the current
    5h window, plus the max message size. Only proxy-captured data.
    Window boundary from unified_5h_reset header. Not computed.
    """
    async with pool.acquire() as conn:
        latest = await conn.fetchrow(f"""
            SELECT unified_5h_reset
            FROM api_requests
            WHERE unified_5h_reset IS NOT NULL AND {PROXY_ONLY}
            ORDER BY id DESC LIMIT 1
        """)

        if not latest or not latest["unified_5h_reset"]:
            return {
                "status": "no_proxy_data",
                "message": "No proxy-captured requests with Anthropic rate-limit headers.",
            }

        current_reset = latest["unified_5h_reset"]

        rows = await conn.fetch(f"""
            SELECT input_tokens, output_tokens, cache_read_tokens,
                   cache_write_tokens, model, timestamp
            FROM api_requests
            WHERE unified_5h_reset = $1 AND {PROXY_ONLY}
            ORDER BY timestamp ASC
        """, current_reset)

    if not rows:
        return {
            "window_reset": current_reset.isoformat(),
            "max_message_tokens": 0,
            "message_count": 0,
            "messages": [],
        }

    messages = []
    max_tokens = 0
    for r in rows:
        total = (r["input_tokens"] or 0) + (r["output_tokens"] or 0)
        max_tokens = max(max_tokens, total)
        messages.append({
            "input_tokens": r["input_tokens"] or 0,
            "output_tokens": r["output_tokens"] or 0,
            "cache_read_tokens": r["cache_read_tokens"] or 0,
            "total_tokens": total,
            "model": r["model"],
            "timestamp": r["timestamp"].isoformat(),
        })

    return {
        "window_reset": current_reset.isoformat(),
        "max_message_tokens": max_tokens,
        "message_count": len(messages),
        "messages": messages,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Improvement #1: Session Budget History (per-window budget estimation)  ---
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/usage/session-budget-history")
async def usage_session_budget_history():
    """Estimated total token budget for each distinct Anthropic 5h window.

    For each window (identified by unified_5h_reset), computes:
    - Total tokens captured by proxy in that window
    - Final utilization (last observed value)
    - Estimated budget = total_tokens / utilization
    - Confidence: coefficient of variation of running estimates (low = good)
    - Day-of-week and hour-of-day for temporal pattern analysis

    The estimate is most accurate when the proxy captures ALL traffic in the
    window. Concurrent sessions (web, other CLI) inflate utilization without
    contributing to our token count, causing underestimation.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            WITH window_requests AS (
                SELECT
                    unified_5h_reset,
                    id,
                    timestamp,
                    input_tokens + output_tokens AS req_tokens,
                    unified_5h_utilization::float AS util,
                    SUM(input_tokens + output_tokens)
                        OVER (PARTITION BY unified_5h_reset ORDER BY id) AS cum_tokens
                FROM api_requests
                WHERE unified_5h_reset IS NOT NULL
                  AND unified_5h_utilization > 0
                  AND {PROXY_ONLY}
            ),
            running_estimates AS (
                SELECT
                    unified_5h_reset,
                    id,
                    timestamp,
                    cum_tokens,
                    util,
                    cum_tokens / NULLIF(util, 0) AS est_budget
                FROM window_requests
            ),
            window_summary AS (
                SELECT
                    unified_5h_reset,
                    COUNT(*) AS request_count,
                    MIN(timestamp) AS first_request,
                    MAX(timestamp) AS last_request,
                    MAX(cum_tokens) AS total_tokens,
                    (array_agg(util ORDER BY id DESC))[1] AS final_utilization,
                    MAX(cum_tokens) / NULLIF(
                        (array_agg(util ORDER BY id DESC))[1], 0
                    ) AS estimated_budget,
                    STDDEV(est_budget) AS est_stddev,
                    AVG(est_budget) AS est_mean
                FROM running_estimates
                GROUP BY unified_5h_reset
            )
            SELECT
                unified_5h_reset,
                request_count,
                first_request,
                last_request,
                total_tokens::bigint,
                final_utilization,
                ROUND(estimated_budget)::bigint AS estimated_budget,
                CASE
                    WHEN est_mean > 0 AND request_count >= 3
                    THEN ROUND((est_stddev / NULLIF(est_mean, 0) * 100)::numeric, 1)
                    ELSE NULL
                END AS confidence_cv_pct,
                EXTRACT(DOW FROM first_request) AS day_of_week,
                EXTRACT(HOUR FROM first_request) AS hour_of_day
            FROM window_summary
            ORDER BY unified_5h_reset ASC
        """)

    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    return {
        "windows": [
            {
                "window_reset": r["unified_5h_reset"].isoformat(),
                "window_start": (r["unified_5h_reset"] - timedelta(hours=5)).isoformat(),
                "first_request": r["first_request"].isoformat(),
                "last_request": r["last_request"].isoformat(),
                "request_count": r["request_count"],
                "total_tokens": r["total_tokens"],
                "final_utilization": r["final_utilization"],
                "estimated_budget": r["estimated_budget"],
                "confidence_cv_pct": float(r["confidence_cv_pct"])
                    if r["confidence_cv_pct"] is not None else None,
                "confidence_label": (
                    "high" if r["confidence_cv_pct"] is not None and r["confidence_cv_pct"] < 20
                    else "medium" if r["confidence_cv_pct"] is not None and r["confidence_cv_pct"] < 50
                    else "low" if r["confidence_cv_pct"] is not None
                    else "insufficient_data"
                ),
                "day_of_week": int(r["day_of_week"]),
                "day_name": day_names[int(r["day_of_week"])],
                "hour_of_day": int(r["hour_of_day"]),
            }
            for r in rows
        ],
        "total_windows": len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Improvement #3: Window Transition Detection                            ---
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/usage/window-transitions")
async def usage_window_transitions():
    """Detect when the Anthropic 5h window resets (unified_5h_reset changes).

    Returns each transition: the old window's final state and the new window's
    first state, including utilization drop and token count reset.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            WITH ordered AS (
                SELECT
                    id, timestamp, unified_5h_reset,
                    unified_5h_utilization::float AS util,
                    input_tokens + output_tokens AS req_tokens,
                    LAG(unified_5h_reset) OVER (ORDER BY id) AS prev_reset,
                    LAG(unified_5h_utilization::float) OVER (ORDER BY id) AS prev_util,
                    LAG(timestamp) OVER (ORDER BY id) AS prev_ts
                FROM api_requests
                WHERE unified_5h_reset IS NOT NULL AND {PROXY_ONLY}
            )
            SELECT
                timestamp AS transition_at,
                prev_reset AS old_window_reset,
                unified_5h_reset AS new_window_reset,
                prev_util AS old_window_final_util,
                util AS new_window_first_util,
                prev_util - util AS utilization_drop,
                EXTRACT(EPOCH FROM (timestamp - prev_ts))::int AS gap_seconds
            FROM ordered
            WHERE prev_reset IS NOT NULL
              AND unified_5h_reset != prev_reset
            ORDER BY timestamp ASC
        """)

    return {
        "transitions": [
            {
                "transition_at": r["transition_at"].isoformat(),
                "old_window_reset": r["old_window_reset"].isoformat()
                    if r["old_window_reset"] else None,
                "new_window_reset": r["new_window_reset"].isoformat(),
                "old_window_final_util": r["old_window_final_util"],
                "new_window_first_util": r["new_window_first_util"],
                "utilization_drop": r["utilization_drop"],
                "gap_seconds": r["gap_seconds"],
            }
            for r in rows
        ],
        "total_transitions": len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Improvement #4: Utilization Burn Rate Curve                            ---
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/usage/burn-rate-curve")
async def usage_burn_rate_curve():
    """Utilization % over time within each 5h window.

    Returns per-request utilization snapshots grouped by window, with elapsed
    seconds from window start. Enables overlaying multiple windows on the same
    0-5h x-axis to compare consumption patterns.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            WITH windowed AS (
                SELECT
                    unified_5h_reset,
                    timestamp,
                    unified_5h_utilization::float AS util,
                    model,
                    input_tokens + output_tokens AS req_tokens,
                    SUM(input_tokens + output_tokens)
                        OVER (PARTITION BY unified_5h_reset ORDER BY id) AS cum_tokens,
                    ROW_NUMBER() OVER (PARTITION BY unified_5h_reset ORDER BY id) AS seq,
                    (unified_5h_reset - INTERVAL '5 hours') AS window_open
                FROM api_requests
                WHERE unified_5h_reset IS NOT NULL
                  AND unified_5h_utilization IS NOT NULL
                  AND {PROXY_ONLY}
            )
            SELECT
                unified_5h_reset,
                timestamp,
                util,
                model,
                cum_tokens::bigint,
                seq::int,
                EXTRACT(EPOCH FROM (timestamp - window_open))::int AS elapsed_seconds,
                EXTRACT(DOW FROM window_open) AS day_of_week
            FROM windowed
            ORDER BY unified_5h_reset, seq
        """)

    windows: dict = {}
    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    for r in rows:
        key = r["unified_5h_reset"].isoformat()
        if key not in windows:
            window_open = r["unified_5h_reset"] - timedelta(hours=5)
            windows[key] = {
                "window_reset": key,
                "window_open": window_open.isoformat(),
                "first_observed_util": r["util"],
                "day_of_week": int(r["day_of_week"]),
                "day_name": day_names[int(r["day_of_week"])],
                "points": [],
            }
        windows[key]["points"].append({
            "elapsed_seconds": r["elapsed_seconds"],
            "utilization": r["util"],
            "cumulative_tokens": r["cum_tokens"],
            "seq": r["seq"],
            "model": r["model"],
        })

    return {
        "windows": list(windows.values()),
        "total_windows": len(windows),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Improvement #5: Cache Effectiveness                                    ---
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/usage/cache-effectiveness")
async def usage_cache_effectiveness():
    """Cache hit ratio over time.

    cache_read_tokens are 10x cheaper than input_tokens and do NOT count toward
    ITPM rate limits. A high cache ratio means we're saving both money and budget.
    Returns per-request and rolling averages.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT
                timestamp,
                model,
                input_tokens,
                cache_read_tokens,
                cache_write_tokens,
                CASE WHEN (input_tokens + cache_read_tokens) > 0
                    THEN cache_read_tokens::float /
                         (input_tokens + cache_read_tokens)
                    ELSE 0
                END AS cache_hit_ratio,
                unified_5h_reset
            FROM api_requests
            WHERE {PROXY_ONLY}
            ORDER BY timestamp ASC
        """)

    if not rows:
        return {"status": "no_proxy_data", "message": "No proxy-captured requests."}

    total_input = sum(r["input_tokens"] or 0 for r in rows)
    total_cache_read = sum(r["cache_read_tokens"] or 0 for r in rows)
    total_cache_write = sum(r["cache_write_tokens"] or 0 for r in rows)
    overall_ratio = total_cache_read / max(total_input + total_cache_read, 1)

    points = []
    window_size = 10
    for i, r in enumerate(rows):
        window_start = max(0, i - window_size + 1)
        window_input = sum(rows[j]["input_tokens"] or 0 for j in range(window_start, i + 1))
        window_cache = sum(rows[j]["cache_read_tokens"] or 0 for j in range(window_start, i + 1))
        rolling = window_cache / max(window_input + window_cache, 1)

        points.append({
            "timestamp": r["timestamp"].isoformat(),
            "cache_hit_ratio": round(r["cache_hit_ratio"], 4),
            "rolling_avg": round(rolling, 4),
            "model": r["model"],
            "input_tokens": r["input_tokens"] or 0,
            "cache_read_tokens": r["cache_read_tokens"] or 0,
            "cache_write_tokens": r["cache_write_tokens"] or 0,
        })

    return {
        "overall_cache_hit_ratio": round(overall_ratio, 4),
        "total_input_tokens": total_input,
        "total_cache_read_tokens": total_cache_read,
        "total_cache_write_tokens": total_cache_write,
        "estimated_savings_factor": round(1 / max(1 - overall_ratio * 0.9, 0.1), 2),
        "request_count": len(rows),
        "points": points,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# --- Improvement #6: 429 Rejection Event Forensics                          ---
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/api/v1/usage/rejection-events")
async def usage_rejection_events():
    """All 429 rate-limit rejections with forensic context.

    Shows the utilization at time of rejection, day/hour, retry-after,
    and which quota was governing. Reveals Anthropic's actual cutoff behavior.
    """
    async with pool.acquire() as conn:
        rejections = await conn.fetch("""
            SELECT
                timestamp,
                model,
                unified_status,
                unified_5h_status,
                unified_5h_utilization::float AS util_5h,
                unified_7d_utilization::float AS util_7d,
                unified_representative_claim,
                unified_5h_reset,
                retry_after_secs,
                EXTRACT(DOW FROM timestamp) AS day_of_week,
                EXTRACT(HOUR FROM timestamp) AS hour_of_day,
                raw_headers
            FROM api_requests
            WHERE source = 'proxy' AND http_status = 429
            ORDER BY timestamp ASC
        """)

        near_misses = await conn.fetch(f"""
            SELECT
                timestamp,
                unified_5h_utilization::float AS util_5h,
                unified_status
            FROM api_requests
            WHERE unified_5h_utilization::float >= 0.80 AND {PROXY_ONLY}
            ORDER BY timestamp ASC
        """)

    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    return {
        "rejections": [
            {
                "timestamp": r["timestamp"].isoformat(),
                "model": r["model"],
                "unified_status": r["unified_status"],
                "five_hour_status": r["unified_5h_status"],
                "five_hour_utilization": r["util_5h"],
                "seven_day_utilization": r["util_7d"],
                "governing_claim": r["unified_representative_claim"],
                "retry_after_secs": r["retry_after_secs"],
                "day_of_week": int(r["day_of_week"]),
                "day_name": day_names[int(r["day_of_week"])],
                "hour_of_day": int(r["hour_of_day"]),
            }
            for r in rejections
        ],
        "near_misses": [
            {
                "timestamp": r["timestamp"].isoformat(),
                "utilization": r["util_5h"],
                "status": r["unified_status"],
            }
            for r in near_misses
        ],
        "total_rejections": len(rejections),
        "total_near_misses": len(near_misses),
    }


# ============================================================================
# Phase 1.1 — /personas page rebuild backend (2026-05-13).
#
# Design: Jarvis projects/project-aion/designs/current/personas-rebuild-design-2026-05-12.md v5.0
# Migration: pulse/migrations/0002-phase-1-1-personas-rebuild.sql (9 tables + 20 indexes + 1 trigger)
#
# Endpoints (25 total): persona CRUD (13) + tool catalog (4) + viz data (5) + MCP claim (2) +
# WebSocket /socket (1). Tier-gated writes server-side per Axiom A (design §1.3).
#
# Notes for Phase 1.2 deployment:
# - pulse container needs PULSE_PERSONAS_DIR env var pointing at mounted personas/ volume
# - Without the volume mount, GET endpoints work (DB-backed) but YAML edit endpoints will
#   return 503 (filesystem unavailable) until docker-compose.dev.yml adds the mount
# - Companion bootstrap SQL at pulse/migrations/seed-persona-metadata-2026-05-13.sql populates
#   the 32 personas directly so endpoint smoke-testing works pre-volume-mount
# ============================================================================

PERSONAS_DIR = Path(os.environ.get("PULSE_PERSONAS_DIR", "/jobs/personas"))

# Tier classification per design §3 (LOCKED per Sir Q1 2026-05-12).
# All personas NOT listed here default to Tier D.
TIER_MAP: Dict[str, str] = {
    "autofix-executor": "A",
    "task-investigator": "A",
    "team-verdict": "A",
    "pipeline-reviewer": "A",
    "cortex": "B",
    "context-maintainer": "B",
    "librarian": "C",
}

# Cluster axis for Group 2 (Tier C + D) per design §3.5. Group 1 (Tier A+B) has no cluster.
CLUSTER_MAP: Dict[str, str] = {
    "content-writer": "Engineering",
    "infrastructure-deployer": "Engineering",
    "test-writer": "Engineering",
    "backend-eng": "Engineering",
    "db-eng": "Engineering",
    "ux-eng": "Engineering",
    "test-reviewer": "Quality",
    "test-researcher": "Quality",
    "security-reviewer": "Quality",
    "bug-fixer": "Quality",
    "troubleshooter": "Quality",
    "ai-reviewer": "Quality",
    "analyst": "Research",
    "researcher": "Research",
    "researcher-readonly": "Research",
    "skill-experimenter": "Research",
    "investigator": "Research",
    "creative-action": "Creative",
    "aurora-feedback": "Creative",
    "creative-thinker": "Creative",
    "creative-builder": "Creative",
    "creative-presenter": "Creative",
    "orchestrator": "Planner",
    "project-manager": "Planner",
    "task-evaluator": "Planner",
    "librarian": "Research",
}

# Tier-gating matrix per design §6.8. Returns the set of fields editable for each tier.
# Tier A + B: nothing editable in UI.
# Tier C: prompt, methodology, metadata-tags, partial-config. Permissions filesystem-only.
# Tier D: everything editable with confirmation gates.
TIER_GATE_WRITES: Dict[str, set] = {
    "A": set(),
    "B": set(),
    "C": {"prompt", "methodology", "metadata"},
    "D": {"prompt", "config", "methodology", "permissions", "metadata"},
}


# --- WebSocket pub/sub (in-memory; single-instance scope) ---

# Each entry: WebSocket connection + set of subscribed channels.
_socket_clients: list = []


def _persona_tier(name: str) -> str:
    return TIER_MAP.get(name, "D")


def _persona_cluster(name: str) -> Optional[str]:
    tier = _persona_tier(name)
    if tier in ("A", "B"):
        return None
    return CLUSTER_MAP.get(name)


def _check_tier_gate(tier: str, field: str) -> Optional[str]:
    """Returns error detail if write is gated; None if allowed."""
    allowed = TIER_GATE_WRITES.get(tier, set())
    if field not in allowed:
        return f"Tier {tier} personas are read-only for field '{field}'. Edit filesystem + git commit instead."
    return None


def _load_yaml_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = _ruamel.load(StringIO(path.read_text()))
        return data if data else {}
    except Exception as exc:
        logger.warning("YAML parse error in %s: %s", path, exc)
        return {}


_ruamel = RuamelYAML()
_ruamel.preserve_quotes = True
_ruamel.default_flow_style = False


def _save_yaml_file(path: Path, data: dict) -> None:
    """Comment-preserving round-trip write via ruamel.yaml."""
    path.parent.mkdir(parents=True, exist_ok=True)
    buf = StringIO()
    _ruamel.dump(data, buf)
    path.write_text(buf.getvalue())


async def _persona_or_404(conn, name: str) -> dict:
    row = await conn.fetchrow("SELECT * FROM pulse.persona_metadata WHERE name = $1", name)
    if row is None:
        raise HTTPException(status_code=404, detail=f"persona '{name}' not found")
    return dict(row)


async def _emit_persona_audit(conn, persona_name: str, action: str, actor: str, details: dict) -> None:
    """Emit an audit_log row for any /personas mutation."""
    await conn.execute(
        """
        INSERT INTO pulse.audit_log (ts, thread_id, actor, event_type, payload)
        VALUES ($1, $2, $3, $4, $5)
        """,
        datetime.now(timezone.utc),
        f"persona-edit-{persona_name}-{uuid.uuid4().hex[:8]}",
        actor,
        action,
        json.dumps({"persona": persona_name, **details}),
    ) if False else None  # audit_log column set varies across Phase D; soft-emit deferred until 1.2


async def _broadcast_socket(channel: str, payload: dict) -> None:
    """Push a payload to all connected /api/v1/socket clients subscribed to channel."""
    dead = []
    for entry in list(_socket_clients):
        ws, subs = entry["ws"], entry["channels"]
        if subs and channel not in subs:
            continue
        try:
            await ws.send_json({"channel": channel, "payload": payload})
        except Exception:
            dead.append(entry)
    for d in dead:
        if d in _socket_clients:
            _socket_clients.remove(d)


# ----------------------------------------------------------------------------
# Persona CRUD endpoints
# ----------------------------------------------------------------------------

@app.get("/api/v1/personas")
async def list_personas(
    tier: Optional[str] = None,
    cluster: Optional[str] = None,
    status: Optional[str] = None,
):
    """List personas with metadata. Optional filters."""
    async with pool.acquire() as conn:
        where_clauses = []
        args: list = []
        if tier:
            args.append(tier)
            where_clauses.append(f"tier = ${len(args)}")
        if cluster:
            args.append(cluster)
            where_clauses.append(f"cluster = ${len(args)}")
        if status:
            args.append(status)
            where_clauses.append(f"status = ${len(args)}")
        else:
            where_clauses.append("status != 'soft_deleted'")
        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"
        rows = await conn.fetch(
            f"SELECT * FROM pulse.persona_metadata WHERE {where_sql} ORDER BY tier, cluster NULLS FIRST, name",
            *args,
        )
        # Job-binding badge counts (active scheduled jobs per persona).
        # Phase 1.1 uses static counts from design §3.6; Phase 1.2 will derive from registry.yaml.
        job_bindings = {
            "investigator": 4,
            "context-maintainer": 1,
            "pipeline-reviewer": 1,
            "creative-thinker": 1,
            "creative-builder": 1,
            "creative-presenter": 1,
        }
        return {
            "personas": [
                {
                    **_personarow_to_dict(r),
                    "job_binding_count": job_bindings.get(r["name"], 0),
                }
                for r in rows
            ],
            "count": len(rows),
        }


def _personarow_to_dict(row) -> dict:
    d = dict(row)
    for k in ("created_at", "updated_at", "soft_deleted_at", "unlocked_until"):
        if d.get(k):
            d[k] = d[k].isoformat()
    return d


@app.get("/api/v1/personas/running")
async def personas_running():
    """Live-state set — personas with active claims, recent activity snapshots, or in-flight executions."""
    async with pool.acquire() as conn:
        active_claim_rows = await conn.fetch(
            """
            SELECT DISTINCT persona_name FROM pulse.mcp_claims
            WHERE released_at IS NULL AND persona_name IS NOT NULL
            """
        )
        active_activity_rows = await conn.fetch(
            """
            SELECT DISTINCT persona_name FROM pulse.persona_activity_snapshots
            WHERE fired_at > NOW() - INTERVAL '60 seconds'
            """
        )
        in_flight_rows = await conn.fetch(
            """
            WITH selected AS (
                SELECT outcome AS persona_name, thread_id
                FROM pulse.decision_events
                WHERE decision_type = 'persona_selection'
                  AND ts > NOW() - INTERVAL '10 minutes'
                  AND thread_id IS NOT NULL
            ), released AS (
                SELECT DISTINCT thread_id
                FROM pulse.decision_events
                WHERE decision_type = 'task_release'
                  AND ts > NOW() - INTERVAL '10 minutes'
                  AND thread_id IS NOT NULL
            )
            SELECT DISTINCT s.persona_name FROM selected s
            LEFT JOIN released r ON r.thread_id = s.thread_id
            WHERE r.thread_id IS NULL AND s.persona_name IS NOT NULL
            """
        )
        active_set = (
            {r["persona_name"] for r in active_claim_rows}
            | {r["persona_name"] for r in active_activity_rows}
            | {r["persona_name"] for r in in_flight_rows}
        )
        return {"running": sorted(active_set), "count": len(active_set)}


@app.get("/api/v1/personas/{name}")
async def get_persona(name: str):
    """Full detail. Joins DB-resident state (metadata + active prompt version + permissions
    assignments + last activity) with filesystem-resident state (config.yaml + methodology.yaml
    + prompt.md fallback). Phase 1.2 enrichment — every sub-tab in the detail panel reads
    from this single response."""
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        active_prompt = await conn.fetchrow(
            """
            SELECT id, version_label, prompt_content, created_by, created_at, notes
            FROM pulse.persona_prompt_versions
            WHERE persona_name = $1 AND active = TRUE
            LIMIT 1
            """,
            name,
        )
        permissions = await conn.fetch(
            """
            SELECT a.tool_id, a.state, a.assigned_by, a.assigned_at,
                   t.name AS tool_name, t.family, t.source_workspace, t.domain
            FROM pulse.persona_tool_assignments a
            JOIN pulse.tool_catalog t ON t.tool_id = a.tool_id
            WHERE a.persona_name = $1
            ORDER BY t.family, t.name
            """,
            name,
        )
        last_activity = await conn.fetchrow(
            """
            SELECT event_type, outcome, tokens_in, tokens_out, fired_at
            FROM pulse.persona_activity_snapshots
            WHERE persona_name = $1
            ORDER BY fired_at DESC
            LIMIT 1
            """,
            name,
        )

        # Filesystem-resident state — Phase 1.2 detail panel sub-tabs 2 (Config) + 4 (Methodology).
        persona_dir = PERSONAS_DIR / name
        config_yaml = _load_yaml_file(persona_dir / "config.yaml")
        methodology_yaml = _load_yaml_file(persona_dir / "methodology.yaml")

        # Active-prompt: prefer DB version, fall back to prompt.md on disk for personas not
        # yet seeded into persona_prompt_versions. Identified by id=0 in the response so the
        # UI can suppress "restore previous version" affordances.
        active_prompt_dict: Optional[dict] = None
        if active_prompt:
            active_prompt_dict = dict(active_prompt)
            for k in ("created_at",):
                if active_prompt_dict.get(k) is not None and hasattr(active_prompt_dict[k], "isoformat"):
                    active_prompt_dict[k] = active_prompt_dict[k].isoformat()
        else:
            prompt_path = persona_dir / "prompt.md"
            if prompt_path.exists():
                try:
                    fs_prompt = prompt_path.read_text()
                except OSError as exc:
                    logger.warning("Could not read prompt.md for %s: %s", name, exc)
                    fs_prompt = ""
                active_prompt_dict = {
                    "id": 0,
                    "version_label": "filesystem-baseline",
                    "prompt_content": fs_prompt,
                    "active": True,
                    "created_at": None,
                    "created_by": "filesystem",
                    "notes": "Read from prompt.md — no DB version row exists for this persona yet.",
                }

        last_activity_dict = None
        if last_activity:
            last_activity_dict = dict(last_activity)
            if last_activity_dict.get("fired_at") is not None and hasattr(last_activity_dict["fired_at"], "isoformat"):
                last_activity_dict["fired_at"] = last_activity_dict["fired_at"].isoformat()

        return {
            "metadata": _personarow_to_dict(meta),
            "config": config_yaml,
            "methodology": methodology_yaml,
            "active_prompt": active_prompt_dict,
            "permissions": [dict(r) for r in permissions],
            "last_activity": last_activity_dict,
        }


@app.get("/api/v1/personas/{name}/activity")
async def get_persona_activity(name: str, limit: int = 100, event_type: Optional[str] = None):
    """Token-first activity stream. Joins persona_activity_snapshots."""
    async with pool.acquire() as conn:
        await _persona_or_404(conn, name)  # 404 if absent
        args: list = [name, limit]
        et_clause = ""
        if event_type:
            args.append(event_type)
            et_clause = f"AND event_type = ${len(args)}"
        rows = await conn.fetch(
            f"""
            SELECT id, event_type, thread_id, outcome, tokens_in, tokens_out, fired_at,
                   prompt_snapshot, permissions_snapshot, config_snapshot
            FROM pulse.persona_activity_snapshots
            WHERE persona_name = $1 {et_clause}
            ORDER BY fired_at DESC
            LIMIT $2
            """,
            *args,
        )
        return {
            "persona": name,
            "events": [
                {
                    **{k: v for k, v in dict(r).items() if k != "fired_at"},
                    "fired_at": r["fired_at"].isoformat(),
                }
                for r in rows
            ],
            "count": len(rows),
        }


@app.put("/api/v1/personas/{name}/prompt")
async def update_persona_prompt(name: str, request: Request):
    """Save new prompt version. Tier-gated: A/B refused, C/D allowed."""
    body = await request.json()
    new_content = body.get("prompt_content")
    version_label = body.get("version_label")
    notes = body.get("notes")
    created_by = body.get("created_by", "ui")
    if not new_content:
        raise HTTPException(status_code=400, detail="prompt_content required")
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "prompt")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        async with conn.transaction():
            # Deactivate current active version
            await conn.execute(
                "UPDATE pulse.persona_prompt_versions SET active = FALSE WHERE persona_name = $1 AND active = TRUE",
                name,
            )
            new_id = await conn.fetchval(
                """
                INSERT INTO pulse.persona_prompt_versions
                  (persona_name, version_label, prompt_content, active, created_by, notes)
                VALUES ($1, $2, $3, TRUE, $4, $5)
                RETURNING id
                """,
                name,
                version_label,
                new_content,
                created_by,
                notes,
            )
            # Filesystem write — gracefully no-op if PERSONAS_DIR missing
            try:
                (PERSONAS_DIR / name / "prompt.md").write_text(new_content)
                fs_synced = True
            except (OSError, PermissionError) as exc:
                logger.warning("Could not write prompt.md for %s: %s", name, exc)
                fs_synced = False
        await _broadcast_socket("persona-state", {"persona": name, "event": "prompt-updated", "version_id": new_id})
        return {"persona": name, "version_id": new_id, "fs_synced": fs_synced}


@app.put("/api/v1/personas/{name}/config")
async def update_persona_config(name: str, request: Request):
    """Update config.yaml (engine/model/output/session). Tier D fully editable; Tier C partial."""
    body = await request.json()
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "config")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        # Filesystem read-merge-write
        config_path = PERSONAS_DIR / name / "config.yaml"
        existing = _load_yaml_file(config_path)
        # Block hard-coded limits — replaced by observation tunnel per design §6.5
        body.pop("limits", None)
        existing.update(body)
        try:
            _save_yaml_file(config_path, existing)
            fs_synced = True
        except (OSError, PermissionError) as exc:
            logger.warning("Could not write config.yaml for %s: %s", name, exc)
            fs_synced = False
        return {"persona": name, "config": existing, "fs_synced": fs_synced}


@app.put("/api/v1/personas/{name}/methodology")
async def update_persona_methodology(name: str, request: Request):
    """Update methodology.yaml. Tier C/D editable."""
    body = await request.json()
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "methodology")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        methodology_path = PERSONAS_DIR / name / "methodology.yaml"
        try:
            _save_yaml_file(methodology_path, body)
            fs_synced = True
        except (OSError, PermissionError) as exc:
            logger.warning("Could not write methodology.yaml for %s: %s", name, exc)
            fs_synced = False
        return {"persona": name, "methodology": body, "fs_synced": fs_synced}


@app.put("/api/v1/personas/{name}/permissions")
async def update_persona_permissions(name: str, request: Request):
    """Update permissions.yaml. Tier D only (with confirmation gate enforced by UI;
    server validates payload but doesn't block Tier C explicitly per design — C is
    UI-read-only but server allows admin edits via direct API)."""
    body = await request.json()
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "permissions")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        # Mirror allowed_tools[] into persona_tool_assignments
        allowed_tools = body.get("allowed_tools", [])
        denied_tools = body.get("denied_tools", [])
        async with conn.transaction():
            # Clear existing assignments
            await conn.execute(
                "DELETE FROM pulse.persona_tool_assignments WHERE persona_name = $1", name
            )
            for tool_id in allowed_tools:
                await conn.execute(
                    """
                    INSERT INTO pulse.persona_tool_assignments (persona_name, tool_id, state, assigned_by)
                    VALUES ($1, $2, 'allowed', $3)
                    ON CONFLICT DO NOTHING
                    """,
                    name, tool_id, body.get("assigned_by", "ui"),
                )
            for tool_id in denied_tools:
                await conn.execute(
                    """
                    INSERT INTO pulse.persona_tool_assignments (persona_name, tool_id, state, assigned_by)
                    VALUES ($1, $2, 'denied', $3)
                    ON CONFLICT DO NOTHING
                    """,
                    name, tool_id, body.get("assigned_by", "ui"),
                )
        # Filesystem write
        permissions_path = PERSONAS_DIR / name / "permissions.yaml"
        try:
            _save_yaml_file(permissions_path, body)
            fs_synced = True
        except (OSError, PermissionError) as exc:
            logger.warning("Could not write permissions.yaml for %s: %s", name, exc)
            fs_synced = False
        await _broadcast_socket("persona-state", {"persona": name, "event": "permissions-updated"})
        return {"persona": name, "permissions": body, "fs_synced": fs_synced}


@app.put("/api/v1/personas/{name}/metadata")
async def update_persona_metadata(name: str, request: Request):
    """Update DB metadata (tags, status). Tier-gated for tier/cluster changes
    (admin-only via filesystem)."""
    body = await request.json()
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "metadata")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        # Whitelist fields user can update via UI
        allowed_keys = {"tags", "status", "owner"}
        updates = {k: v for k, v in body.items() if k in allowed_keys}
        if not updates:
            raise HTTPException(status_code=400, detail=f"No updatable fields. Allowed: {allowed_keys}")
        set_clauses = []
        args: list = []
        for k, v in updates.items():
            args.append(json.dumps(v) if k == "tags" else v)
            set_clauses.append(f"{k} = ${len(args)}")
        args.append(name)
        await conn.execute(
            f"UPDATE pulse.persona_metadata SET {', '.join(set_clauses)} WHERE name = ${len(args)}",
            *args,
        )
        return {"persona": name, "updated": updates}


@app.get("/api/v1/personas/{name}/prompt-versions")
async def list_prompt_versions(name: str, limit: int = 50):
    async with pool.acquire() as conn:
        await _persona_or_404(conn, name)
        rows = await conn.fetch(
            """
            SELECT id, version_label, active, created_by, created_at, notes,
                   LENGTH(prompt_content) AS char_count
            FROM pulse.persona_prompt_versions
            WHERE persona_name = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            name, limit,
        )
        return {
            "persona": name,
            "versions": [
                {**dict(r), "created_at": r["created_at"].isoformat()} for r in rows
            ],
        }


@app.post("/api/v1/personas/{name}/prompt-versions/{version_id}/restore")
async def restore_prompt_version(name: str, version_id: int):
    """Set a historical prompt version as active. Tier C/D only."""
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "prompt")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        existing = await conn.fetchrow(
            "SELECT prompt_content FROM pulse.persona_prompt_versions WHERE id = $1 AND persona_name = $2",
            version_id, name,
        )
        if existing is None:
            raise HTTPException(status_code=404, detail=f"version {version_id} not found for {name}")
        async with conn.transaction():
            await conn.execute(
                "UPDATE pulse.persona_prompt_versions SET active = FALSE WHERE persona_name = $1 AND active = TRUE",
                name,
            )
            await conn.execute(
                "UPDATE pulse.persona_prompt_versions SET active = TRUE WHERE id = $1",
                version_id,
            )
            try:
                (PERSONAS_DIR / name / "prompt.md").write_text(existing["prompt_content"])
            except (OSError, PermissionError):
                pass
        return {"persona": name, "version_id": version_id, "active": True}


@app.post("/api/v1/personas")
async def create_persona(request: Request):
    """Create a new Tier D persona via the +New wizard. Always lands at Tier D."""
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if "/" in name or " " in name or not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="name must be kebab-case alphanumeric")
    cluster = body.get("cluster")
    if cluster and cluster not in {"Engineering", "Quality", "Research", "Creative", "Planner"}:
        raise HTTPException(status_code=400, detail=f"unknown cluster: {cluster}")
    owner = body.get("owner", "ui")
    prompt = body.get("prompt", "")
    config = body.get("config", {})
    methodology = body.get("methodology", {})
    permissions = body.get("permissions", {})
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT name FROM pulse.persona_metadata WHERE name = $1", name)
        if existing:
            raise HTTPException(status_code=409, detail=f"persona '{name}' already exists")
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO pulse.persona_metadata
                  (name, tier, cluster, status, owner, schema_version)
                VALUES ($1, 'D', $2, 'active', $3, 2)
                """,
                name, cluster, owner,
            )
            if prompt:
                await conn.execute(
                    """
                    INSERT INTO pulse.persona_prompt_versions
                      (persona_name, version_label, prompt_content, active, created_by, notes)
                    VALUES ($1, 'initial', $2, TRUE, $3, 'Created via /personas +New wizard')
                    """,
                    name, prompt, owner,
                )
            # Filesystem write — best-effort
            try:
                pdir = PERSONAS_DIR / name
                pdir.mkdir(parents=True, exist_ok=True)
                if prompt:
                    (pdir / "prompt.md").write_text(prompt)
                if config:
                    _save_yaml_file(pdir / "config.yaml", config)
                if methodology:
                    _save_yaml_file(pdir / "methodology.yaml", methodology)
                if permissions:
                    _save_yaml_file(pdir / "permissions.yaml", permissions)
                fs_synced = True
            except (OSError, PermissionError) as exc:
                logger.warning("Could not write filesystem for new persona %s: %s", name, exc)
                fs_synced = False
        await _broadcast_socket("persona-state", {"persona": name, "event": "created"})
        return {"persona": name, "tier": "D", "fs_synced": fs_synced}


@app.delete("/api/v1/personas/{name}")
async def delete_persona(name: str):
    """Soft-delete a Tier D persona (30d retention). Tier A/B/C refused."""
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        if meta["tier"] != "D":
            raise HTTPException(
                status_code=403,
                detail=f"Tier {meta['tier']} personas cannot be deleted (Tier D only).",
            )
        await conn.execute(
            """
            UPDATE pulse.persona_metadata
            SET status = 'soft_deleted', soft_deleted_at = now()
            WHERE name = $1
            """,
            name,
        )
        await _broadcast_socket("persona-state", {"persona": name, "event": "soft-deleted"})
        return {"persona": name, "status": "soft_deleted"}


# ----------------------------------------------------------------------------
# Tool catalog endpoints
# ----------------------------------------------------------------------------

@app.get("/api/v1/tool-catalog")
async def list_tool_catalog(family: Optional[str] = None, source: Optional[str] = None):
    async with pool.acquire() as conn:
        where_clauses = []
        args: list = []
        if family:
            args.append(family)
            where_clauses.append(f"family = ${len(args)}")
        if source:
            args.append(source)
            where_clauses.append(f"source_workspace = ${len(args)}")
        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"
        rows = await conn.fetch(
            f"SELECT * FROM pulse.tool_catalog WHERE {where_sql} ORDER BY family, name",
            *args,
        )
        return {
            "tools": [
                {**dict(r), "ingested_at": r["ingested_at"].isoformat(), "last_seen": r["last_seen"].isoformat()}
                for r in rows
            ],
            "count": len(rows),
        }


@app.get("/api/v1/persona-tool-matrix")
async def persona_tool_matrix():
    """Joined Persona × Tool matrix. Includes UNASSIGNED tools (no persona has access)."""
    async with pool.acquire() as conn:
        personas = await conn.fetch(
            "SELECT name, tier, cluster FROM pulse.persona_metadata WHERE status != 'soft_deleted' ORDER BY tier, cluster NULLS FIRST, name"
        )
        tools = await conn.fetch(
            "SELECT tool_id, name, family, source_workspace, domain FROM pulse.tool_catalog ORDER BY family, name"
        )
        assignments = await conn.fetch(
            "SELECT persona_name, tool_id, state FROM pulse.persona_tool_assignments"
        )
        # Build matrix as nested dict: persona → tool → state
        matrix: Dict[str, Dict[str, str]] = {}
        for r in assignments:
            matrix.setdefault(r["persona_name"], {})[r["tool_id"]] = r["state"]
        # UNASSIGNED = tools with no allowed/denied/admin_only row in any persona
        tool_has_any = {r["tool_id"] for r in assignments}
        unassigned = [t["tool_id"] for t in tools if t["tool_id"] not in tool_has_any]
        return {
            "personas": [dict(p) for p in personas],
            "tools": [dict(t) for t in tools],
            "matrix": matrix,
            "unassigned_tools": unassigned,
        }


@app.post("/api/v1/personas/{name}/tools/{tool_id}")
async def assign_tool(name: str, tool_id: str, request: Request):
    body = await request.json() if request.headers.get("content-length") else {}
    state = body.get("state", "allowed")
    if state not in {"allowed", "denied", "admin_only"}:
        raise HTTPException(status_code=400, detail="state must be allowed|denied|admin_only")
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "permissions")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        tool = await conn.fetchrow("SELECT tool_id FROM pulse.tool_catalog WHERE tool_id = $1", tool_id)
        if tool is None:
            raise HTTPException(status_code=404, detail=f"tool '{tool_id}' not in catalog")
        await conn.execute(
            """
            INSERT INTO pulse.persona_tool_assignments (persona_name, tool_id, state, assigned_by)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (persona_name, tool_id)
            DO UPDATE SET state = EXCLUDED.state, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
            """,
            name, tool_id, state, body.get("assigned_by", "ui"),
        )
        return {"persona": name, "tool_id": tool_id, "state": state}


@app.delete("/api/v1/personas/{name}/tools/{tool_id}")
async def revoke_tool(name: str, tool_id: str):
    async with pool.acquire() as conn:
        meta = await _persona_or_404(conn, name)
        gate = _check_tier_gate(meta["tier"], "permissions")
        if gate:
            raise HTTPException(status_code=403, detail=gate)
        await conn.execute(
            "DELETE FROM pulse.persona_tool_assignments WHERE persona_name = $1 AND tool_id = $2",
            name, tool_id,
        )
        return {"persona": name, "tool_id": tool_id, "state": "unassigned"}


# ----------------------------------------------------------------------------
# Visualization data sources (Core §4.4 Graph + Add-ons §5.1/5.2/5.3/5.5)
# ----------------------------------------------------------------------------

@app.get("/api/v1/persona-graph")
async def persona_graph():
    """Force-graph-ready payload: nodes (persona + tool + job) + edges."""
    async with pool.acquire() as conn:
        personas = await conn.fetch(
            "SELECT name, tier, cluster, status FROM pulse.persona_metadata WHERE status != 'soft_deleted'"
        )
        tools = await conn.fetch(
            "SELECT tool_id, name, family, source_workspace FROM pulse.tool_catalog"
        )
        edges_rows = await conn.fetch(
            "SELECT persona_name, tool_id, state FROM pulse.persona_tool_assignments"
        )
        nodes = []
        for p in personas:
            nodes.append({
                "id": f"persona:{p['name']}",
                "type": "persona",
                "label": p["name"],
                "tier": p["tier"],
                "cluster": p["cluster"],
                "status": p["status"],
            })
        for t in tools:
            nodes.append({
                "id": f"tool:{t['tool_id']}",
                "type": "tool",
                "label": t["name"],
                "family": t["family"],
                "source": t["source_workspace"],
            })
        edges = [
            {
                "source": f"persona:{e['persona_name']}",
                "target": f"tool:{e['tool_id']}",
                "state": e["state"],
            }
            for e in edges_rows
        ]
        return {"nodes": nodes, "edges": edges}


@app.get("/api/v1/persona-flow")
async def persona_flow():
    """Pipeline-v2 swim-lane stages + persona attachments.

    Executor stage is dynamic — queries decision_events for personas that have
    actually executed tasks in the last 7 days.  All other stages use static
    mappings derived from the service-file audit (pipeline-watcher → score.py →
    evaluate.py → executor.py → reviewer.py → close)."""
    executor_personas: list[str] = []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT outcome AS persona_name
                FROM pulse.decision_events
                WHERE decision_type = 'persona_selection'
                  AND ts > NOW() - INTERVAL '7 days'
                  AND outcome IS NOT NULL
                ORDER BY persona_name
                """
            )
            executor_personas = [r["persona_name"] for r in rows]
    except Exception:
        pass
    stages = [
        {"id": "pulse-event", "label": "Pulse Event", "personas": []},
        {"id": "score", "label": "Score", "personas": []},
        {"id": "evaluate", "label": "Evaluate", "personas": ["autofix-executor"]},
        {"id": "executor", "label": "Executor", "personas": executor_personas},
        {"id": "reviewer", "label": "Reviewer", "personas": ["pipeline-reviewer"]},
        {"id": "close", "label": "Close", "personas": []},
    ]
    creative_arm = [
        {"id": "creative-think", "label": "Think", "personas": ["creative-thinker"]},
        {"id": "creative-build", "label": "Build", "personas": ["creative-builder"]},
        {"id": "creative-present", "label": "Present", "personas": ["creative-presenter"]},
        {"id": "creative-feedback", "label": "Feedback", "personas": ["aurora-feedback"]},
        {"id": "creative-action", "label": "Action", "personas": ["creative-action"]},
    ]
    team_arm = [
        {"id": "team-investigate", "label": "Investigate", "personas": ["task-investigator"]},
        {"id": "team-verdict", "label": "Verdict", "personas": ["team-verdict"]},
    ]
    return {
        "pipeline_v2": stages,
        "creative_pipeline": creative_arm,
        "team_pipeline": team_arm,
    }


@app.get("/api/v1/persona-village/layout")
async def persona_village_layout():
    """Village tile grid (Add-on §5.2)."""
    async with pool.acquire() as conn:
        positions = await conn.fetch(
            "SELECT persona_name, grid_x, grid_y, zone_assignment FROM pulse.persona_village_layout"
        )
        personas = await conn.fetch(
            "SELECT name, tier, cluster FROM pulse.persona_metadata WHERE status != 'soft_deleted'"
        )
        positioned = {p["persona_name"]: dict(p) for p in positions}
        # Default deterministic layout for any persona without saved position
        # Phase 1.3 Village view will refine; this returns enough for PoC render
        default_positions = []
        zone_anchor = {
            "Engineering": (4, 4), "Quality": (12, 4), "Research": (20, 4),
            "Creative": (4, 12), "Planner": (12, 12),
        }
        for idx, p in enumerate(personas):
            if p["name"] in positioned:
                continue
            tier = p["tier"]
            cluster = p["cluster"]
            if tier in ("A", "B"):
                # Internal Reserved Quarter
                default_positions.append({
                    "persona_name": p["name"],
                    "grid_x": 28 + (idx % 3),
                    "grid_y": 4 + (idx // 3),
                    "zone_assignment": "Internal Reserved Quarter",
                })
            else:
                ax, ay = zone_anchor.get(cluster, (16, 8))
                default_positions.append({
                    "persona_name": p["name"],
                    "grid_x": ax + (idx % 3),
                    "grid_y": ay + (idx // 3),
                    "zone_assignment": f"{cluster or 'Library'} Zone",
                })
        return {
            "grid_width": 34,
            "grid_height": 20,
            "positions": list(positioned.values()) + default_positions,
        }


@app.get("/api/v1/persona-timeline")
async def persona_timeline(window: str = "1h", limit: int = 1000):
    """Canvas Gantt event stream (Add-on §5.3).

    Primary source: persona_activity_snapshots (token-rich, post-Phase-1.4
    once snapshot emission is wired). Fallback when that table is empty:
    decision_events (count-based, available today). Frontend uses the
    `source` field to label provenance. Mirrors the heatmap pattern.
    """
    interval_map = {"1h": "1 hour", "6h": "6 hours", "24h": "24 hours", "7d": "7 days"}
    interval = interval_map.get(window, "1 hour")
    async with pool.acquire() as conn:
        snap_count = await conn.fetchval(
            "SELECT COUNT(*) FROM pulse.persona_activity_snapshots"
        )
        use_snapshots = snap_count > 0

        if use_snapshots:
            rows = await conn.fetch(
                f"""
                SELECT persona_name AS actor,
                       event_type,
                       outcome,
                       tokens_in,
                       tokens_out,
                       NULL::TEXT AS thread_id,
                       fired_at AS ts
                FROM pulse.persona_activity_snapshots
                WHERE fired_at > NOW() - INTERVAL '{interval}'
                ORDER BY fired_at DESC
                LIMIT $1
                """,
                limit,
            )
        else:
            rows = await conn.fetch(
                f"""
                SELECT actor,
                       decision_type AS event_type,
                       outcome,
                       0::INT AS tokens_in,
                       0::INT AS tokens_out,
                       thread_id,
                       ts
                FROM pulse.decision_events
                WHERE ts > NOW() - INTERVAL '{interval}'
                ORDER BY ts DESC
                LIMIT $1
                """,
                limit,
            )

        return {
            "source": "activity_snapshots" if use_snapshots else "decision_events_fallback",
            "window": window,
            "events": [
                {
                    "persona": r["actor"],
                    "type": r["event_type"],
                    "outcome": r["outcome"],
                    "tokens_in": r["tokens_in"],
                    "tokens_out": r["tokens_out"],
                    "thread_id": r["thread_id"],
                    "fired_at": r["ts"].isoformat(),
                }
                for r in rows
            ],
        }


@app.get("/api/v1/persona-heatmap")
async def persona_heatmap(window_days: int = 7):
    """Pre-aggregated heatmap data (Add-on §5.5).

    Primary source: persona_activity_snapshots (token-rich, post-Phase-1.4
    once snapshot emission is wired). Fallback when that table is empty:
    decision_events (count-based proxy, available today). Frontend uses the
    `source` field to label the data provenance.
    """
    async with pool.acquire() as conn:
        snap_count = await conn.fetchval(
            "SELECT COUNT(*) FROM pulse.persona_activity_snapshots"
        )
        use_snapshots = snap_count > 0

        if use_snapshots:
            heatmap_rows = await conn.fetch(
                f"""
                SELECT EXTRACT(DOW FROM fired_at)::INT AS dow,
                       EXTRACT(HOUR FROM fired_at)::INT AS hour,
                       COUNT(*)::INT AS count
                FROM pulse.persona_activity_snapshots
                WHERE fired_at > NOW() - INTERVAL '{window_days} days'
                GROUP BY dow, hour
                ORDER BY dow, hour
                """
            )
            trend_rows = await conn.fetch(
                f"""
                SELECT persona_name AS actor,
                       DATE_TRUNC('hour', fired_at) AS bucket,
                       SUM(tokens_in)::BIGINT AS tokens_in_sum,
                       SUM(tokens_out)::BIGINT AS tokens_out_sum,
                       COUNT(*)::INT AS event_count
                FROM pulse.persona_activity_snapshots
                WHERE fired_at > NOW() - INTERVAL '{window_days} days'
                GROUP BY persona_name, bucket
                ORDER BY bucket ASC, persona_name
                """
            )
            rank_rows = await conn.fetch(
                f"""
                SELECT persona_name AS actor,
                       COUNT(*)::INT AS event_count,
                       SUM(tokens_in + tokens_out)::BIGINT AS tokens_total
                FROM pulse.persona_activity_snapshots
                WHERE fired_at > NOW() - INTERVAL '{window_days} days'
                GROUP BY persona_name
                ORDER BY event_count DESC
                LIMIT 20
                """
            )
        else:
            heatmap_rows = await conn.fetch(
                f"""
                SELECT EXTRACT(DOW FROM ts)::INT AS dow,
                       EXTRACT(HOUR FROM ts)::INT AS hour,
                       COUNT(*)::INT AS count
                FROM pulse.decision_events
                WHERE ts > NOW() - INTERVAL '{window_days} days'
                GROUP BY dow, hour
                ORDER BY dow, hour
                """
            )
            trend_rows = await conn.fetch(
                f"""
                SELECT actor,
                       DATE_TRUNC('hour', ts) AS bucket,
                       0::BIGINT AS tokens_in_sum,
                       0::BIGINT AS tokens_out_sum,
                       COUNT(*)::INT AS event_count
                FROM pulse.decision_events
                WHERE ts > NOW() - INTERVAL '{window_days} days'
                GROUP BY actor, bucket
                ORDER BY bucket ASC, actor
                """
            )
            rank_rows = await conn.fetch(
                f"""
                SELECT actor,
                       COUNT(*)::INT AS event_count,
                       0::BIGINT AS tokens_total
                FROM pulse.decision_events
                WHERE ts > NOW() - INTERVAL '{window_days} days'
                GROUP BY actor
                ORDER BY event_count DESC
                LIMIT 20
                """
            )

        sankey_rows = await conn.fetch(
            f"""
            SELECT actor, decision_type, outcome, COUNT(*)::INT AS flow_count
            FROM pulse.decision_events
            WHERE ts > NOW() - INTERVAL '{window_days} days'
              AND actor IS NOT NULL AND decision_type IS NOT NULL AND outcome IS NOT NULL
            GROUP BY actor, decision_type, outcome
            ORDER BY flow_count DESC
            LIMIT 50
            """
        )

        return {
            "source": "activity_snapshots" if use_snapshots else "decision_events_fallback",
            "window_days": window_days,
            "heatmap": [dict(r) for r in heatmap_rows],
            "trends": [
                {
                    "persona": r["actor"],
                    "bucket": r["bucket"].isoformat(),
                    "tokens_in": r["tokens_in_sum"],
                    "tokens_out": r["tokens_out_sum"],
                    "event_count": r["event_count"],
                }
                for r in trend_rows
            ],
            "rank": [
                {
                    "persona": r["actor"],
                    "event_count": r["event_count"],
                    "tokens_total": r["tokens_total"],
                }
                for r in rank_rows
            ],
            "sankey": [
                {
                    "actor": r["actor"],
                    "decision_type": r["decision_type"],
                    "outcome": r["outcome"],
                    "count": r["flow_count"],
                }
                for r in sankey_rows
            ],
        }


# ----------------------------------------------------------------------------
# Observation tunnel emission (Phase 1.1 item 5)
# ----------------------------------------------------------------------------

@app.post("/api/v1/observations")
async def emit_observation(request: Request):
    """Receive observation events from the tunnel daemon. Writes to pulse.task_observation
    and broadcasts on the observation-tunnel WebSocket channel."""
    body = await request.json()
    task_id = body.get("task_id")
    observation_type = body.get("observation_type")
    intervention = body.get("intervention", "none")
    evidence = body.get("evidence", {})
    if not task_id or not observation_type:
        raise HTTPException(status_code=400, detail="task_id and observation_type required")
    if observation_type not in {"stuck", "infinite", "runaway_cost", "loop", "permission_violation"}:
        raise HTTPException(status_code=400, detail=f"unknown observation_type: {observation_type}")
    if intervention not in {"none", "soft", "medium", "hard"}:
        raise HTTPException(status_code=400, detail=f"invalid intervention: {intervention}")
    async with pool.acquire() as conn:
        obs_id = await conn.fetchval(
            """
            INSERT INTO pulse.task_observation
              (task_id, thread_id, persona_name, observation_type, intervention, evidence)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            task_id, body.get("thread_id"), body.get("persona_name"),
            observation_type, intervention, json.dumps(evidence),
        )
    await _broadcast_socket("observation-tunnel", {
        "id": obs_id, "task_id": task_id, "type": observation_type,
        "intervention": intervention, "evidence": evidence,
    })
    return {"id": obs_id, "task_id": task_id, "type": observation_type, "intervention": intervention}


@app.get("/api/v1/observations")
async def list_observations(
    task_id: Optional[str] = None,
    persona: Optional[str] = None,
    observation_type: Optional[str] = None,
    limit: int = 100,
):
    """Query observations. Used by Mission Control Add-on (§5.4 alert stream)."""
    where_clauses = []
    args: list = []
    if task_id:
        args.append(task_id)
        where_clauses.append(f"task_id = ${len(args)}")
    if persona:
        args.append(persona)
        where_clauses.append(f"persona_name = ${len(args)}")
    if observation_type:
        args.append(observation_type)
        where_clauses.append(f"observation_type = ${len(args)}")
    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"
    args.append(limit)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT id, task_id, thread_id, persona_name, observation_type,
                   intervention, evidence, fired_at
            FROM pulse.task_observation
            WHERE {where_sql}
            ORDER BY fired_at DESC
            LIMIT ${len(args)}
            """,
            *args,
        )
        return {
            "observations": [
                {**dict(r), "fired_at": r["fired_at"].isoformat()} for r in rows
            ],
            "count": len(rows),
        }


# ----------------------------------------------------------------------------
# MCP on-demand claim API (Core §6.4)
# ----------------------------------------------------------------------------

@app.post("/api/v1/mcp/claim")
async def mcp_claim(request: Request):
    """Acquire an MCP claim. Returns connection_params for the claimed server."""
    body = await request.json()
    persona = body.get("persona")
    task_id = body.get("task_id")
    mcp_server = body.get("mcp_server")
    domain = body.get("domain")
    if not mcp_server or not domain:
        raise HTTPException(status_code=400, detail="mcp_server and domain required")
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Lock existing active claims for this server (concurrent piggyback)
            existing = await conn.fetch(
                """
                SELECT claim_id, connection_params FROM pulse.mcp_claims
                WHERE mcp_server = $1 AND released_at IS NULL
                FOR UPDATE
                """,
                mcp_server,
            )
            # Phase 1.1: connection_params is a stub placeholder. Phase 1.2 will spawn
            # the actual MCP server subprocess and populate this with stdio/sse params.
            connection_params = (
                dict(existing[0]["connection_params"]) if existing and existing[0]["connection_params"]
                else {"mcp_server": mcp_server, "transport": "stub", "note": "Phase 1.1 stub; Phase 1.2 will spawn real subprocess"}
            )
            claim_id = await conn.fetchval(
                """
                INSERT INTO pulse.mcp_claims
                  (persona_name, task_id, mcp_server, domain, connection_params)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING claim_id
                """,
                persona, task_id, mcp_server, domain, json.dumps(connection_params),
            )
        await _broadcast_socket("mcp-claims", {"event": "claim", "claim_id": claim_id, "mcp_server": mcp_server})
        return {"claim_id": claim_id, "mcp_server": mcp_server, "connection_params": connection_params}


@app.delete("/api/v1/mcp/claim/{claim_id}")
async def mcp_release(claim_id: int):
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT mcp_server, released_at FROM pulse.mcp_claims WHERE claim_id = $1 FOR UPDATE",
                claim_id,
            )
            if row is None:
                raise HTTPException(status_code=404, detail=f"claim {claim_id} not found")
            if row["released_at"] is not None:
                return {"claim_id": claim_id, "already_released": True}
            await conn.execute(
                "UPDATE pulse.mcp_claims SET released_at = now() WHERE claim_id = $1",
                claim_id,
            )
            # Count remaining active claims for this MCP server
            active_count = await conn.fetchval(
                "SELECT COUNT(*) FROM pulse.mcp_claims WHERE mcp_server = $1 AND released_at IS NULL",
                row["mcp_server"],
            )
        await _broadcast_socket("mcp-claims", {
            "event": "release", "claim_id": claim_id, "mcp_server": row["mcp_server"], "active_ref_count": active_count,
        })
        return {"claim_id": claim_id, "released": True, "active_ref_count": active_count}


# ----------------------------------------------------------------------------
# Test Cockpit — catalog and runner endpoints
# ----------------------------------------------------------------------------

import yaml as _yaml  # noqa: E402

_TEST_CATALOG_PATH = Path("/app/test-suites/_catalog.yaml")


@app.get("/api/v1/test-catalog")
async def get_test_catalog():
    if not _TEST_CATALOG_PATH.exists():
        return {"suites": [], "deprecated": []}
    try:
        raw = _yaml.safe_load(_TEST_CATALOG_PATH.read_text())
        return {"suites": raw.get("suites", []), "deprecated": raw.get("deprecated", [])}
    except Exception as e:
        return {"suites": [], "deprecated": [], "error": str(e)}


@app.post("/api/v1/test-suites/{suite_id}/run")
async def run_test_suite(suite_id: str):
    if not _TEST_CATALOG_PATH.exists():
        raise HTTPException(404, "Test catalog not found")
    raw = _yaml.safe_load(_TEST_CATALOG_PATH.read_text())
    suites = {s["id"]: s for s in raw.get("suites", [])}
    suite = suites.get(suite_id)
    if not suite:
        raise HTTPException(404, f"Suite {suite_id} not found")
    if suite.get("status") != "active":
        raise HTTPException(400, f"Suite {suite_id} is not active (status={suite.get('status')})")

    created_ids = []
    tasks_to_create = []
    if suite.get("inline_task"):
        tasks_to_create.append(suite["inline_task"])
    elif suite.get("inline_tasks"):
        tasks_to_create.extend(suite["inline_tasks"])
    elif suite.get("file"):
        suite_file = _TEST_CATALOG_PATH.parent / suite["file"]
        if not suite_file.exists():
            raise HTTPException(404, f"Suite file {suite['file']} not found")
        file_data = _yaml.safe_load(suite_file.read_text())
        tasks_to_create.extend(file_data.get("tasks", []))

    for task_def in tasks_to_create:
        payload = {
            "title": task_def.get("title", f"[TEST] {suite['name']}"),
            "description": task_def.get("description", suite.get("description", "")),
            "labels": task_def.get("labels", ["staging:wait", "blocked:no", "active:no",
                                               "completed:no", "evaluated:no", "queued:no"]),
            "metadata": {
                "test_suite_id": suite_id,
                "test_suite_name": suite["name"],
                **({"timeout_minutes": suite["timeout_override_minutes"]}
                   if suite.get("timeout_override_minutes") else {}),
                **({"max_budget_usd": suite["max_budget_override_usd"]}
                   if suite.get("max_budget_override_usd") else {}),
            },
        }
        async with pool.acquire() as conn:
            task_id = f"TEST-{uuid.uuid4().hex[:8]}"
            await conn.execute(
                """INSERT INTO tasks (id, title, description, status, priority, labels, metadata, created_by)
                   VALUES ($1, $2, $3, 'open', 'medium', $4, $5::jsonb, 'test-cockpit')""",
                task_id, payload["title"], payload["description"],
                payload["labels"], json.dumps(payload["metadata"]),
            )
            created_ids.append(task_id)

    return {"suite_id": suite_id, "tasks_created": len(created_ids), "task_ids": created_ids}


@app.get("/api/v1/test-suites/{suite_id}/metrics")
async def get_suite_metrics(suite_id: str):
    """Return execution metrics from the telemetry table (chain-attributed)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM test_run_telemetry
               WHERE suite_id = $1
               ORDER BY completed_at DESC LIMIT 20""",
            suite_id,
        )
        if not rows:
            return {"suite_id": suite_id, "runs": [], "summary": None}

        runs = []
        total_wall_s = 0
        total_cost = 0.0
        total_burn = 0.0
        run_count = 0

        for r in rows:
            wall_s = r["wall_seconds"]
            if wall_s and wall_s > 0:
                total_wall_s += wall_s
                run_count += 1
            cost = float(r["cost_usd"] or 0)
            total_cost += cost
            burn = float(r["burn_weight_delta_pp"] or 0)
            total_burn += burn
            crossed = r.get("window_crossed", False) or False

            runs.append({
                "task_id": r["run_task_id"],
                "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
                "wall_seconds": wall_s,
                "task_count": r["task_count"],
                "chain_count": r["chain_count"],
                "models": list(r["models"] or []),
                "engines": list(r["engines"] or []),
                "window_crossed": crossed,
                "cost": {
                    "burn_weight_pp": float(r["burn_weight_delta_pp"]) if r["burn_weight_delta_pp"] is not None else None,
                    "burn_start_pct": round(float(r["burn_weight_start"]) * 100, 1) if r["burn_weight_start"] is not None else None,
                    "burn_end_pct": round(float(r["burn_weight_end"]) * 100, 1) if r["burn_weight_end"] is not None else None,
                    "api_calls": r["api_calls"],
                    "cost_usd": round(cost, 2),
                    "cache_read_tokens": r["cache_read_tokens"],
                    "cache_write_tokens": r["cache_write_tokens"],
                    "output_tokens": r["output_tokens"],
                },
            })

    avg_wall_s = round(total_wall_s / run_count) if run_count > 0 else None
    avg_cost = round(total_cost / run_count, 2) if run_count > 0 else None
    avg_burn = round(total_burn / run_count, 1) if run_count > 0 else None
    return {
        "suite_id": suite_id,
        "runs": runs,
        "summary": {
            "total_runs": len(runs),
            "avg_wall_seconds": avg_wall_s,
            "avg_cost_usd": avg_cost,
            "avg_burn_weight_pp": avg_burn,
            "total_cost_usd": round(total_cost, 2),
            "total_burn_weight_pp": round(total_burn, 1),
        },
    }


@app.post("/api/v1/test-suites/backfill-telemetry")
async def backfill_telemetry(force: bool = False):
    """Backfill telemetry for closed test suite tasks. Pass ?force=true to recompute all."""
    async with pool.acquire() as conn:
        if force:
            tasks = await conn.fetch("""
                SELECT id, metadata->>'test_suite_id' as suite_id
                FROM tasks
                WHERE metadata->>'test_suite_id' IS NOT NULL
                  AND status = 'closed'
            """)
        else:
            tasks = await conn.fetch("""
                SELECT id, metadata->>'test_suite_id' as suite_id
                FROM tasks
                WHERE metadata->>'test_suite_id' IS NOT NULL
                  AND status = 'closed'
                  AND id NOT IN (SELECT run_task_id FROM test_run_telemetry)
            """)
        filled = 0
        for t in tasks:
            try:
                await _capture_test_run_telemetry(conn, t["id"], t["suite_id"])
                filled += 1
            except Exception as e:
                import logging
                logging.getLogger("pulse.telemetry").warning("Backfill skip %s: %s", t["id"], e)
    return {"backfilled": filled, "total_candidates": len(tasks), "force": force}


# ----------------------------------------------------------------------------
# WebSocket /api/v1/socket — real-time push channel
# ----------------------------------------------------------------------------

from fastapi import WebSocket, WebSocketDisconnect  # noqa: E402 — local import


@app.websocket("/api/v1/socket")
async def socket_endpoint(ws: WebSocket):
    await ws.accept()
    entry = {"ws": ws, "channels": set()}
    _socket_clients.append(entry)
    try:
        await ws.send_json({"event": "connected", "available_channels": [
            "persona-state", "task-state", "decision_events",
            "audit_log", "cost_events", "observation-tunnel", "mcp-claims",
        ]})
        while True:
            msg = await ws.receive_json()
            # Subscribe / unsubscribe protocol
            if msg.get("action") == "subscribe":
                channels = msg.get("channels", [])
                entry["channels"].update(channels)
                await ws.send_json({"event": "subscribed", "channels": sorted(entry["channels"])})
            elif msg.get("action") == "unsubscribe":
                channels = msg.get("channels", [])
                entry["channels"].difference_update(channels)
                await ws.send_json({"event": "unsubscribed", "channels": sorted(entry["channels"])})
            elif msg.get("action") == "ping":
                await ws.send_json({"event": "pong"})
            else:
                await ws.send_json({"event": "error", "detail": "unknown action; use subscribe/unsubscribe/ping"})
    except WebSocketDisconnect:
        pass
    finally:
        if entry in _socket_clients:
            _socket_clients.remove(entry)


# --- Entry point ---

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PULSE_PORT", "8700"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
