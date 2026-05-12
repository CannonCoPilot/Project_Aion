---
type: validation-report
date: 2026-05-04
author: Jarvis (CannonCoPilot)
project: AIFred-Pro
workstream: nexus-sync supplant onto nate-dev
phase: R6 — schema migration + observability smoke
status: COMPLETE
related:
  - projects/project-aion/reports/nexus-sync-supplant-r1-investigation-2026-05-04.md
  - projects/project-aion/reports/nexus-sync-supplant-r2-plan-2026-05-04.md
working_branch: nate-dev-supplant-2026-05-04
baseline_tag: pre-supplant-baseline-2026-05-04 (e8ccf64)
---

# R6 — Schema Migration + Observability Smoke

## Summary

Authored and applied the Phase 5.1 observability schema migration. Validated
that the python observability module (R5.5, commit `1983dc0`) produces payloads
that INSERT cleanly into the new schema. Cross-schema `thread_id` correlation
verified.

Pulse-side endpoint addition (POST `/audit/events`, `/audit/decisions`,
`/costs/events`) is **deferred** — pulse_dev currently 404s on these and the
python observability gracefully fails-quiet to swallowed-errors.jsonl. Once
endpoints land in pulse/app.py, the dual-write becomes live and audit-ingest
replays the spool.

## Migration Applied

**File**: `pulse/migrations/0001-phase-5-1-observability-tables.sql`
**Target**: `aifred-dev-postgres` (docker network `aifred-dev-network`), `pulse_dev` database
**Apply command**:
```bash
docker exec -i aifred-dev-postgres psql -U pulse_dev -d pulse_dev \
  < pulse/migrations/0001-phase-5-1-observability-tables.sql
```

Created:
- Schema: `pulse`
- Tables: `pulse.audit_log` (14 cols), `pulse.cost_events` (22 cols), `pulse.decision_events` (14 cols)
- Indexes: 5 + 6 + 6 (B-tree on time-series + correlation columns)
- Permissions: USAGE + ALL on schema/tables/sequences to `pulse_dev` role

Idempotent — `CREATE SCHEMA IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`.

## Schema Sources

Column lists derived from `.claude/jobs/audit-ingest.py` `INSERT` statements
(commit `ea298c2`). Type inference from bash payloads in
`.claude/jobs/lib/{audit,cost,decision}-log.sh`:

| Type | Used for |
|---|---|
| `TIMESTAMPTZ` | `ts`, `inserted_at` |
| `TEXT` | identifiers, actors, actions, outcomes, rationale |
| `JSONB` | `details`, `alternatives`, `signals_matched`, `downstream_effect` |
| `NUMERIC(12,6)` | `cost_usd` |
| `NUMERIC(6,4)` | `cache_hit_ratio` |
| `NUMERIC(4,3)` | `confidence` |
| `INTEGER` | token counts, `duration_s` |
| `BOOLEAN` | `success`, `router_overridden` |
| `BIGSERIAL` | primary key |

## Validation Results

### 1. Migration applied cleanly

```
CREATE SCHEMA
CREATE TABLE  (×3)
CREATE INDEX  (×17)
GRANT         (×3)
```

### 2. Python observability payload → schema compatibility

The python `log_audit` module produced a swallowed-errors payload during
R5.5 smoke when pulse_dev returned 404 (no endpoints yet). That exact payload
INSERTs cleanly into `pulse.audit_log`:

```sql
INSERT INTO pulse.audit_log (ts, thread_id, actor, action, entity_type,
                              entity_id, task_id, details)
SELECT (data->>'ts')::TIMESTAMPTZ, data->>'thread_id', data->>'actor',
       data->>'action', data->>'entity_type', data->>'entity_id',
       data->>'task_id', data->'details'
FROM (SELECT '<payload-json>'::JSONB AS data) x;
-- INSERT 0 1
```

Same validated for `pulse.cost_events` and `pulse.decision_events` with
synthetic payloads matching the R5.5 cost-ledger and decision-log schemas.

### 3. Cross-schema thread_id correlation

```
     source      | rows | threads
-----------------+------+---------
 audit_log       |    1 |       1
 cost_events     |    1 |       1
 decision_events |    1 |       1
```

A single `thread_id` joins records across all three observability tables —
the foundation for trace/lifecycle queries.

## Deferred Items (Future Work)

The following were originally in scope for R6 but reframed into separate
deliverables to keep this commit cohesive:

1. **Pulse API endpoints** (`POST /audit/events`, `/audit/decisions`,
   `/costs/events`) — pulse/app.py needs ~30 LOC per endpoint plus a
   pulse-dev container restart. Tracked separately. The python observability
   module already handles their absence gracefully (404 → swallowed-errors.jsonl).

2. **`audit-ingest.py` env adaptation** — the standalone CLI defaults to
   David's AIProjects env (port 5434, db=pulse, user=vadmin). Either:
   (a) pass our env via `audit-ingest.sh` wrapper, or
   (b) standup a sidecar container on `aifred-dev-network` for cron runs.
   Not blocking — audit-ingest is a back-office reconciliation tool, not a
   live-path service.

3. **`audit-ingest.py` host port access** — `aifred-dev-postgres` has no
   host port mapping (only on `aifred-dev-network`). Either expose 5433:5432
   in docker-compose.dev.yml or run audit-ingest from inside the network.

4. **Live integration test of full dual-write** — requires items 1 and 3 above.
   Once both land, the test is: invoke a pipeline-v2 service, observe it write
   to pulse.* tables in real time (no swallowed-errors entries).

## State at End of R6

- **Branch**: `nate-dev-supplant-2026-05-04` (local only)
- **Latest commits**:
  - R6 commit (this session, immediately following): pulse/migrations/0001-...
  - `1983dc0` R5.5 observability python ports
  - `012dcf5` …(21 nexus-sync commits + 2 follow-up fixes)…
  - `pre-supplant-baseline-2026-05-04` (e8ccf64) — rollback insurance
- **Schema**: pulse_dev has the Phase 5.1 schema applied; tables empty after smoke cleanup
- **Python observability**: functional, JSONL-only mode (Pulse endpoints absent → swallowed)
- **Smoke green**: all `.sh` syntax, all `.py` compile, dispatcher/event-watcher/services all boot

## Next: R7 — fast-forward + push + debrief

```bash
git checkout nate-dev
git merge --ff-only nate-dev-supplant-2026-05-04
git push origin nate-dev
```

Plus:
- Write `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-nexus-sync-supplant-completion.md`
- Update `.active-plan` + `session-state.md` + `Status/Archon/focus-areas.md`

R7 is mechanical (~15-20 min) since R5/R5.5/R6 all passed smoke.
