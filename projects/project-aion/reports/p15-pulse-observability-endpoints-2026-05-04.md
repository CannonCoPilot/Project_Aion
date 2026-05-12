---
type: validation-report
date: 2026-05-04
author: Jarvis (CannonCoPilot)
project: AIFred-Pro
workstream: P1.5 — Pulse API observability endpoints (closes nexus-sync supplant arc)
status: COMPLETE
related:
  - projects/project-aion/reports/nexus-sync-supplant-r6-validation-2026-05-04.md
target_branch: nate-dev (davidmoneil/AIFred-Pro)
target_file: pulse/app.py
---

# P1.5 — Pulse API Observability Endpoints

## Summary

Added the three Pulse API receivers prescribed by the Phase 5.1 migration
header: `POST /api/v1/audit/events`, `POST /api/v1/audit/decisions`,
`POST /api/v1/costs/events`. R5.5 had shipped the python observability module
(`services/observability/{audit,cost,decision}_log.py`) and R6 had landed the
schema migration. Without endpoints, every dual-write fail-quieted to
`swallowed-errors.jsonl`. With endpoints live, dual-write is end-to-end real-time.

End-to-end validated via the python writer (`log_audit()` from host) — row
landed in `pulse_dev.audit_log` via the API path, main spool wrote in parallel,
and `swallowed-errors.jsonl` stayed at **0 bytes** (no fail-quiet).

## What shipped

`pulse/app.py` (+108 / -0):

1. `parse_iso_ts()` helper near `now_iso()` — converts the writer's
   `%Y-%m-%dT%H:%M:%SZ` format into a tz-aware `datetime` for asyncpg
   TIMESTAMPTZ binding.
2. `POST /api/v1/audit/events` — INSERT into `pulse.audit_log` with the 6-col
   ON CONFLICT clause matching the migration's UNIQUE constraint. Defaults
   `severity='info'`, `source_file='api'`.
3. `POST /api/v1/audit/decisions` — INSERT into `pulse.decision_events` with
   the 5-col ON CONFLICT.
4. `POST /api/v1/costs/events` — INSERT into `pulse.cost_events` with the 6-col
   ON CONFLICT (thread_id-nullable; PostgreSQL <15 NULLs-distinct semantics
   correctly preserve replay rows that lack thread_id).

All three endpoints accept the exact JSON shape sent by both shell
(`lib/{audit,cost,decision}-log.sh`) and python
(`services/observability/{audit,cost,decision}_log.py`) writers, verified
field-by-field.

## Architectural notes (educational)

### asyncpg type-binding gotcha (one rebuild burned)

First implementation used `$1::timestamptz` SQL casts assuming Postgres would
parse the ISO string. asyncpg's prepared-statement type inference rejected the
string at the binder layer **before** the SQL evaluated:

```
asyncpg.exceptions.DataError: invalid input for query argument $1:
  '2026-05-05T03:07:12Z' (expected a datetime.date or datetime.datetime
  instance, got 'str')
```

Fix: parse the ISO string client-side and bind a `datetime` object. This
matches `audit-ingest.py`'s `_parse_ts` helper at line 104 — every
Postgres-Python boundary in the codebase parses timestamps before binding.
Lesson: SQL-level casts work for text-protocol bindings (JSONB) but not for
typed binary bindings (TIMESTAMPTZ via asyncpg's prepared statements).

### Schema-of-record divergence

`audit-ingest.py`'s `INSERT_SQL` table uses 4/5/4-column ON CONFLICT clauses,
but the R6 migration's UNIQUE constraints are 6/6/5 columns. The endpoint must
match the migration (Postgres requires ON CONFLICT to align with an existing
unique index/constraint). The divergence is because `audit-ingest.py` is from
David's separate `AIProjects-nmgj` repo (referenced in its own comment about
"alembic 013 / Phase 5.5 hardening") — a different schema with a different
dedup strategy.

### JSONB binding without codec

Pulse's `asyncpg.Pool` does **not** register a JSONB codec (no
`set_type_codec` call in startup). The existing `log_event` helper at line 204
serializes via `json.dumps()` and lets the column's text protocol handle the
parse. The new endpoints follow the same pattern — `json.dumps()` for
`details / alternatives / signals_matched / downstream_effect`, with `$N::jsonb`
casts at the SQL site (redundant but explicit).

## Validation evidence

### Pre-flight

```
$ docker exec aifred-dev-postgres psql -U pulse_dev -d pulse_dev -c "\dt pulse.*"
 Schema |      Name       | Type  |   Owner
--------+-----------------+-------+-----------
 pulse  | audit_log       | table | pulse_dev
 pulse  | cost_events     | table | pulse_dev
 pulse  | decision_events | table | pulse_dev
```

### Replay test (swallowed-errors → audit endpoint)

The single pre-existing entry in `swallowed-errors.jsonl` was a smoke-test
payload from R5.5 that 404'd (endpoint didn't exist). Replayed via curl:

```
$ PAYLOAD=$(jq -c '.payload' .claude/logs/swallowed-errors.jsonl)
$ curl -X POST http://localhost:8800/api/v1/audit/events \
       -H 'Content-Type: application/json' -d "$PAYLOAD"
HTTP 200  {"status":"ok"}
```

Re-POST same payload → HTTP 200 + ON CONFLICT-skipped (row count unchanged).
Idempotency proven.

### Synthetic decision + cost POSTs

Both returned HTTP 200, rows visible with all fields:

| Table             | thread_id            | key fields verified                      |
|-------------------|----------------------|------------------------------------------|
| audit_log         | smoke-pulse-13667    | severity defaulted, JSONB intact         |
| decision_events   | smoke-pulse-13667    | confidence=0.950 (NUMERIC(4,3)), JSONB ok|
| cost_events       | smoke-pulse-13667    | cost_usd=0.001234 (NUMERIC(12,6)), success=t (BOOL) |

Cross-table thread_id correlation: confirmed (joinable on `thread_id`).

### End-to-end python writer test

```python
NEXUS_THREAD_ID="p15-writer-test-1777952399" PROJECT_DIR=$(pwd) python3 -c "
from services.observability import log_audit
log_audit(actor='system:p15-writer-test', action='end2end.validation',
          entity_type='service', entity_id='p15-validation',
          details={'phase':'P1.5','via':'python writer','target':'pulse-dev'})
"
# log_audit returned: True
```

Three-way verification:

1. **DB row via Pulse API path**: id=4, source_file='api' (default applied),
   JSONB intact, thread_id correlation works.
2. **Main spool wrote**: `audit-log.jsonl` tail has the entry with
   `correlation_id` matching `thread_id`.
3. **swallowed-errors.jsonl: 0 bytes** — dual-write succeeded; **no fail-quiet**.

### Cleanup

Validation rows DELETEd from all three tables. Tables empty (matching R6's
post-smoke clean state). Pre-P1.5 swallowed-errors.jsonl preserved at
`.claude/logs/swallowed-errors-pre-p1.5.jsonl` for evidence.

## Deployment notes

- Image rebuilt: `aifred-pulse:latest` (only `COPY app.py` layer changed; rest
  cached).
- Container recreated: `docker compose ... up -d --no-deps --force-recreate
  pulse` — depends services (dashboard, pipeline) rode through cleanly via
  health-check.
- Production pulse (`aifred-pulse:8700`) **not affected** — pulse-prod runs
  from the same image but is currently down. When restarted, will inherit the
  new endpoints automatically.

## What's still deferred (audit-ingest swallowed-errors replay)

`audit-ingest.py` per its own docstring reads from `.claude/data/*.jsonl` (the
writer main spools), NOT from `swallowed-errors.jsonl`. The latter requires
a future `--replay-swallowed` mode (the docstring marks it as TODO). This is
fine because:

1. New writes after P1.5 succeed via dual-write — they reach Pulse and never
   spool to swallowed-errors.
2. The 1 historical entry was already replayed via direct curl in this
   validation.
3. audit-ingest.py's normal 15-min cron will reconcile main JSONL spools to
   Postgres regardless (ON CONFLICT-safe; idempotent).

`--replay-swallowed` mode → P3 (B2 sweep).

## Files touched

- `/Users/nathanielcannon/Claude/Alfred-Dev/pulse/app.py` — added
  `parse_iso_ts()` + 3 POST endpoints (~108 LOC).
- `/Users/nathanielcannon/Claude/Alfred-Dev/.claude/logs/swallowed-errors.jsonl`
  — truncated (preserved as `swallowed-errors-pre-p1.5.jsonl`).

## Outcome

Nexus-sync supplant arc (R5.5 → R6 → P1.5) **fully closed**: writers send
correctly-shaped payloads (R5.5), schema accepts them (R6), endpoints route
them to the correct tables (P1.5). Live observability enabled in pulse_dev.
