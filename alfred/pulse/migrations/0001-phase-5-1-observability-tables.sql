-- Phase 5.1 — Observability schema for Nexus audit/decision/cost tracking.
--
-- Authored 2026-05-04 as part of the nexus-sync supplant onto nate-dev (R6).
-- Column lists derived from .claude/jobs/audit-ingest.py INSERT statements
-- (in commit ea298c2). Type inference from bash dual-write payloads
-- (.claude/jobs/lib/{audit,cost,decision}-log.sh).
--
-- This is the destination schema for:
--   - shell:  log_audit / log_cost / log_decision (lib/*.sh)  -> POST /audit/events|/audit/decisions|/costs/events
--   - python: services/observability/{audit,cost,decision}_log.py  -> same endpoints (R5.5)
--   - replay: .claude/jobs/audit-ingest.py reconciles JSONL spools to these tables
--
-- Idempotent: CREATE SCHEMA IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- Run with:   docker exec -i aifred-dev-postgres psql -U pulse_dev -d pulse_dev < pulse/migrations/0001-phase-5-1-observability-tables.sql

CREATE SCHEMA IF NOT EXISTS pulse;

-- ============================================================================
-- pulse.audit_log
--
-- Every mutation event in the Nexus pipeline. Job lifecycle, task pipeline,
-- label changes, persona actions, system events, triggers — all flow here.
--
-- Source: lib/audit-log.sh log_audit() + python equivalent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.audit_log (
    id            BIGSERIAL PRIMARY KEY,
    ts            TIMESTAMPTZ NOT NULL,
    thread_id     TEXT NOT NULL,
    actor         TEXT NOT NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    task_id       TEXT,
    project_id    TEXT,
    session_id    TEXT,
    severity      TEXT,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_file   TEXT,
    inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, ts, actor, action, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts          ON pulse.audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_thread_id   ON pulse.audit_log (thread_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_task_id     ON pulse.audit_log (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON pulse.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity      ON pulse.audit_log (entity_type, entity_id);

-- ============================================================================
-- pulse.cost_events
--
-- Per-execution cost / token / cache telemetry. Driven by executor on
-- successful completion; cached for budget enforcement, ROI analysis,
-- and per-persona / per-project reporting.
--
-- Source: lib/cost-log.sh log_cost() + python equivalent.
-- Field rename from cost-ledger.jsonl: cost -> cost_usd.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.cost_events (
    id                     BIGSERIAL PRIMARY KEY,
    ts                     TIMESTAMPTZ NOT NULL,
    thread_id              TEXT,
    task_id                TEXT,
    session_id             TEXT,
    job                    TEXT,
    persona                TEXT,
    model                  TEXT,
    engine                 TEXT,
    cost_usd               NUMERIC(12,6),
    input_tokens           INTEGER,
    output_tokens          INTEGER,
    cache_read_tokens      INTEGER,
    cache_creation_tokens  INTEGER,
    cache_hit_ratio        NUMERIC(6,4),
    duration_s             INTEGER,
    success                BOOLEAN,
    router_model           TEXT,
    router_overridden      BOOLEAN,
    company                TEXT,
    project_id             TEXT,
    inserted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, ts, model, engine, job, persona)
);

CREATE INDEX IF NOT EXISTS idx_cost_events_ts          ON pulse.cost_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_thread_id   ON pulse.cost_events (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_events_task_id     ON pulse.cost_events (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_events_persona     ON pulse.cost_events (persona) WHERE persona IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_events_model       ON pulse.cost_events (model) WHERE model IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_events_project     ON pulse.cost_events (project_id) WHERE project_id IS NOT NULL;

-- ============================================================================
-- pulse.decision_events
--
-- Branching decision rationale. Every persona/script that makes a routing,
-- retry, gate, fix, or approval decision records the alternatives considered,
-- signals matched, confidence, and rationale here.
--
-- Source: lib/decision-log.sh log_decision() + python equivalent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.decision_events (
    id                  BIGSERIAL PRIMARY KEY,
    ts                  TIMESTAMPTZ NOT NULL,
    thread_id           TEXT NOT NULL,
    parent_id           TEXT,
    task_id             TEXT,
    actor               TEXT NOT NULL,
    decision_type       TEXT NOT NULL,
    outcome             TEXT NOT NULL,
    alternatives        JSONB,
    signals_matched     JSONB,
    confidence          NUMERIC(4,3),
    rationale           TEXT,
    downstream_effect   JSONB,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, ts, actor, decision_type, outcome)
);

CREATE INDEX IF NOT EXISTS idx_decision_events_ts        ON pulse.decision_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_thread_id ON pulse.decision_events (thread_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_parent    ON pulse.decision_events (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decision_events_task_id   ON pulse.decision_events (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decision_events_actor     ON pulse.decision_events (actor);
CREATE INDEX IF NOT EXISTS idx_decision_events_type      ON pulse.decision_events (decision_type);

-- ============================================================================
-- Permissions
-- pulse_dev role owns these (default for the user running the migration).
-- ============================================================================

GRANT USAGE ON SCHEMA pulse TO pulse_dev;
GRANT ALL ON ALL TABLES IN SCHEMA pulse TO pulse_dev;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pulse TO pulse_dev;
