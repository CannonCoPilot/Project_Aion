-- Phase 1.1 — /personas page rebuild — backend foundation schema.
--
-- Authored 2026-05-13 as the first build artifact of Project Aion Phase 1
-- (companion to design doc at Jarvis projects/project-aion/designs/current/
-- personas-rebuild-design-2026-05-12.md, v5.0).
--
-- Adds 9 new tables under the `pulse` schema to support:
--   • Persona registry mirror (tier/cluster/status/owner metadata)
--   • Append-only prompt version history
--   • Tool catalog (Skills/MCPs/Commands/Built-ins from Alfred + Jarvis + plugins)
--   • Persona × Tool permission assignment matrix
--   • Task observation (stuck/infinite/runaway/loop/permission-violation)
--   • MCP on-demand claim tracking (per design §6.4)
--   • Persona activity snapshots (Octopoda-OS frozen-snapshot pattern, §4.2 sub-tab 6)
--   • Persona village layout (Add-on §5.2; pokegents-pattern user-pref positions)
--   • Persona graph layout (Core §4.4; user-pref Canvas+d3-force node positions)
--
-- Co-existence:
--   Reuses pulse.audit_log + pulse.decision_events + pulse.cost_events from
--   0001-phase-5-1-observability-tables.sql via thread_id correlation.
--   No mutation of existing tables; this migration is purely additive.
--
-- Idempotent: all CREATE statements guarded with IF NOT EXISTS; trigger uses
-- DROP IF EXISTS + CREATE.
--
-- Run with:
--   docker exec -i aifred-dev-postgres psql -U pulse_dev -d pulse_dev \
--     < pulse/migrations/0002-phase-1-1-personas-rebuild.sql
--
-- Rollback: tables are scoped to the `pulse` schema and disjoint from existing
-- objects; `DROP TABLE pulse.<name>` per table is sufficient. No data is
-- destroyed by this migration; legacy_limits JSONB on persona_metadata is the
-- only field that mirrors data from existing persona config.yaml (and only at
-- the time of schema v1→v2 migration, which is a separate write).
--
-- See design §6.2 (DB schema), §6.4 (MCP on-demand claim), §6.5 (observation
-- tunnel), §6.8 (edit gating + schema versioning).

CREATE SCHEMA IF NOT EXISTS pulse;

-- ============================================================================
-- pulse.persona_metadata
--
-- Per-persona registry mirror. Filesystem YAMLs (personas/<name>/{config,
-- permissions,methodology,prompt.md}) remain source-of-truth for prompt +
-- methodology + permissions; this table mirrors derived metadata (tier,
-- cluster, status, owner, tags) and is the substrate for tier-gated writes.
--
-- Axiom A (design §1.3): every PUT/POST endpoint checks this table's `tier`
-- field server-side and refuses tier-violating mutations regardless of UI
-- state. This is what makes Group 1 / Group 2 locking mechanically enforced.
--
-- legacy_limits archives v1-schema max_turns/max_budget_usd/timeout_minutes
-- for one release cycle, then dropped (per design §6.5 — observation tunnel
-- replaces hard-coded limits).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_metadata (
    name              TEXT PRIMARY KEY,
    tier              CHAR(1) NOT NULL CHECK (tier IN ('A','B','C','D')),
    cluster           TEXT,
    status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','soft_deleted','deprecated')),
    owner             TEXT,
    tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
    schema_version    INT  NOT NULL DEFAULT 2,
    legacy_limits     JSONB,
    unlocked_until    TIMESTAMPTZ,
    soft_deleted_at   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_metadata_tier    ON pulse.persona_metadata (tier);
CREATE INDEX IF NOT EXISTS idx_persona_metadata_cluster ON pulse.persona_metadata (cluster) WHERE cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_persona_metadata_status  ON pulse.persona_metadata (status);

-- ============================================================================
-- pulse.persona_prompt_versions
--
-- Append-only prompt history per persona. Active version selected by partial
-- unique index (one active row per persona). Surfaces in the §4.2 sub-tab 5
-- Prompt panel (version selector + diff view).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_prompt_versions (
    id              BIGSERIAL PRIMARY KEY,
    persona_name    TEXT NOT NULL REFERENCES pulse.persona_metadata(name) ON DELETE CASCADE,
    version_label   TEXT,
    prompt_content  TEXT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_persona_prompt_versions_persona ON pulse.persona_prompt_versions (persona_name, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_persona_prompt_versions_one_active
    ON pulse.persona_prompt_versions (persona_name)
    WHERE active = TRUE;

-- ============================================================================
-- pulse.tool_catalog
--
-- Inventoried tools across all sources: Alfred + Jarvis workspaces and
-- ~/.claude/plugins/. Ingested at backend startup + on filesystem-watcher
-- events + on manual /api/v1/tool-catalog/refresh.
--
-- Sources (design §6.3): personas/*/permissions.yaml allowed_tools, .mcp.json
-- files in Alfred/Jarvis/TokenCompressionBench/AIFred-Pro, plugin-bundled
-- .mcp.json files under marketplaces/, plugin registry installed_plugins.json,
-- and hard-coded built-in list (Read/Write/Edit/Bash/Grep/Glob/Task/etc.).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.tool_catalog (
    tool_id            TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    family             TEXT NOT NULL CHECK (family IN ('Skill','MCP','Command','Built-in')),
    source_workspace   TEXT NOT NULL CHECK (source_workspace IN ('Alfred','Jarvis','plugin')),
    source_path        TEXT,
    domain             TEXT,
    description        TEXT,
    ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_catalog_family ON pulse.tool_catalog (family);
CREATE INDEX IF NOT EXISTS idx_tool_catalog_source ON pulse.tool_catalog (source_workspace);
CREATE INDEX IF NOT EXISTS idx_tool_catalog_domain ON pulse.tool_catalog (domain) WHERE domain IS NOT NULL;

-- ============================================================================
-- pulse.persona_tool_assignments
--
-- The Permission primitive (design §1.1, item 6): Persona × Tool relation.
-- Materialized from permissions.yaml; cell-clicks in the §4.3 Matrix view
-- write here and emit audit_log rows.
--
-- state='unassigned' rows are not stored — absence of a (persona, tool) row
-- means unassigned. The UNASSIGNED Matrix row is computed as
--   SELECT * FROM tool_catalog t
--   WHERE NOT EXISTS (SELECT 1 FROM persona_tool_assignments a WHERE a.tool_id = t.tool_id);
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_tool_assignments (
    persona_name   TEXT NOT NULL REFERENCES pulse.persona_metadata(name) ON DELETE CASCADE,
    tool_id        TEXT NOT NULL REFERENCES pulse.tool_catalog(tool_id) ON DELETE CASCADE,
    state          TEXT NOT NULL CHECK (state IN ('allowed','denied','admin_only')),
    assigned_by    TEXT,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (persona_name, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_tool_state ON pulse.persona_tool_assignments (state);
CREATE INDEX IF NOT EXISTS idx_persona_tool_persona ON pulse.persona_tool_assignments (persona_name);
CREATE INDEX IF NOT EXISTS idx_persona_tool_tool ON pulse.persona_tool_assignments (tool_id);

-- ============================================================================
-- pulse.task_observation
--
-- Observation-tunnel events (design §6.5). Replaces hard-coded execution
-- limits with adaptive per-task-class watchers:
--   • stuck                — audit_log silence > N min (rolling p95)
--   • infinite             — turn count > rolling p95 × 2
--   • runaway_cost         — cumulative cost > rolling p95 × 3
--   • loop                 — identical Bash command repeated 5+ times in window
--   • permission_violation — tool call attempted against denied_tools[]
--
-- Each event carries evidence (relevant audit/decision/cost row IDs joined by
-- thread_id) and an intervention level (none/soft/medium/hard).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.task_observation (
    id                 BIGSERIAL PRIMARY KEY,
    task_id            TEXT NOT NULL,
    thread_id          TEXT,
    persona_name       TEXT,
    observation_type   TEXT NOT NULL
                         CHECK (observation_type IN ('stuck','infinite','runaway_cost','loop','permission_violation')),
    intervention       TEXT NOT NULL
                         CHECK (intervention IN ('none','soft','medium','hard')),
    evidence           JSONB NOT NULL,
    fired_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_persona ON pulse.task_observation (persona_name, fired_at DESC) WHERE persona_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_observation_type    ON pulse.task_observation (observation_type, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_observation_thread  ON pulse.task_observation (thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- pulse.mcp_claims
--
-- On-demand MCP claim tracking (design §6.4). MCPs are NOT loaded at session
-- start; each task claims required MCPs via POST /api/v1/mcp/claim and
-- releases via DELETE. Concurrent claims piggyback on ref-count.
--
-- released_at IS NULL means the claim is currently active. Ref-count of an
-- mcp_server is COUNT(*) WHERE released_at IS NULL AND mcp_server = ?.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.mcp_claims (
    claim_id            BIGSERIAL PRIMARY KEY,
    persona_name        TEXT REFERENCES pulse.persona_metadata(name),
    task_id             TEXT,
    mcp_server          TEXT NOT NULL,
    domain              TEXT NOT NULL,
    claimed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at         TIMESTAMPTZ,
    connection_params   JSONB
);

CREATE INDEX IF NOT EXISTS idx_mcp_claims_active        ON pulse.mcp_claims (mcp_server) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_claims_persona       ON pulse.mcp_claims (persona_name, released_at);
CREATE INDEX IF NOT EXISTS idx_mcp_claims_task          ON pulse.mcp_claims (task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- pulse.persona_activity_snapshots
--
-- Octopoda-OS frozen-snapshot pattern (design §4.2 sub-tab 6 + audit Wave 2).
-- Each row captures the persona's prompt + permissions + config AT THE TIME
-- of the event, providing reproducibility for any audit-log row.
--
-- This complements (not replaces) pulse.audit_log, pulse.decision_events, and
-- pulse.cost_events from 0001 — those tables capture WHAT happened; this
-- table captures WHAT THE PERSONA LOOKED LIKE while doing it. Join by
-- persona_name + thread_id + fired_at proximity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_activity_snapshots (
    id                     BIGSERIAL PRIMARY KEY,
    persona_name           TEXT NOT NULL,
    event_type             TEXT NOT NULL,
    thread_id              TEXT,
    prompt_snapshot        TEXT NOT NULL,
    permissions_snapshot   JSONB NOT NULL,
    config_snapshot        JSONB NOT NULL,
    outcome                TEXT,
    tokens_in              INT,
    tokens_out             INT,
    fired_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_persona_time ON pulse.persona_activity_snapshots (persona_name, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_event_type   ON pulse.persona_activity_snapshots (event_type, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_thread       ON pulse.persona_activity_snapshots (thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- pulse.persona_village_layout
--
-- Add-on §5.2 surface (pokemon-village paradigm). User-pref draggable
-- positions for persona sprites within the 544×480px tile grid. Zone
-- assignment is the themed-room label (Engineering Workshop / QA Lab / etc.).
--
-- Add-on table — Phase 1.3 surface; safe to ship Core (Phase 1.2) without
-- populating this table. Default layout computed deterministically from
-- cluster + tier at render time when rows absent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_village_layout (
    persona_name      TEXT PRIMARY KEY REFERENCES pulse.persona_metadata(name) ON DELETE CASCADE,
    grid_x            INT NOT NULL,
    grid_y            INT NOT NULL,
    zone_assignment   TEXT,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_village_zone ON pulse.persona_village_layout (zone_assignment) WHERE zone_assignment IS NOT NULL;

-- ============================================================================
-- pulse.persona_pref_graph_layout
--
-- Core §4.4 Graph view — user-pref Canvas+d3-force node positions. Optional;
-- absence falls back to force-directed default layout. Per-user (user_id) +
-- per-persona (persona_name) tuple.
--
-- Deferable to Phase 1.4 if Phase 1.2 scope tightens; the Graph view renders
-- correctly without user-pref persistence (deterministic d3-force layout from
-- node set is acceptable for Phase 1.2 gate).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pulse.persona_pref_graph_layout (
    user_id        TEXT NOT NULL,
    persona_name   TEXT NOT NULL REFERENCES pulse.persona_metadata(name) ON DELETE CASCADE,
    node_x         REAL NOT NULL,
    node_y         REAL NOT NULL,
    last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, persona_name)
);

-- ============================================================================
-- updated_at trigger for persona_metadata
--
-- Tier-gated mutations to persona_metadata bump updated_at automatically.
-- Idempotent: function uses CREATE OR REPLACE; trigger is DROP+CREATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION pulse.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_persona_metadata_updated_at ON pulse.persona_metadata;

CREATE TRIGGER trg_persona_metadata_updated_at
    BEFORE UPDATE ON pulse.persona_metadata
    FOR EACH ROW EXECUTE FUNCTION pulse.set_updated_at();

-- ============================================================================
-- Permissions
-- pulse_dev role owns these (matches 0001 convention).
-- ============================================================================

GRANT USAGE ON SCHEMA pulse TO pulse_dev;
GRANT ALL ON ALL TABLES IN SCHEMA pulse TO pulse_dev;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pulse TO pulse_dev;
GRANT ALL ON FUNCTION pulse.set_updated_at() TO pulse_dev;
