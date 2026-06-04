-- AIFred-Pro Usage Tracking Schema
-- Applied to the dev Pulse database (pulse_dev on aifred-dev-postgres)
-- Captures per-request Anthropic API telemetry from the reverse proxy.

-- ═══════════════════════════════════════════════════════════════
-- Per-API-call: token usage + rate-limit snapshot (from proxy)
-- One row per Anthropic API request/response pair.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS api_requests (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          TEXT UNIQUE,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    organization_id     TEXT,

    -- Request context
    model               TEXT,
    is_streaming        BOOLEAN DEFAULT false,
    session_id          TEXT,
    project             TEXT,
    agent_name          TEXT,
    task_id             TEXT,

    -- Token counts (from response body `usage` object)
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens   INTEGER DEFAULT 0,
    cache_write_tokens  INTEGER DEFAULT 0,
    speed               TEXT,

    -- Computed cost
    cost_usd            NUMERIC(10,6),

    -- Family 2: Standard per-minute rate limits
    rl_requests_limit       INTEGER,
    rl_requests_remaining   INTEGER,
    rl_tokens_limit         INTEGER,
    rl_tokens_remaining     INTEGER,
    rl_input_remaining      INTEGER,
    rl_output_remaining     INTEGER,

    -- Family 4: Unified / Max plan
    unified_status              TEXT,
    unified_5h_status           TEXT,
    unified_5h_utilization      NUMERIC(12,10),
    unified_5h_reset            TIMESTAMPTZ,
    unified_7d_status           TEXT,
    unified_7d_utilization      NUMERIC(12,10),
    unified_7d_reset            TIMESTAMPTZ,
    unified_representative_claim TEXT,
    unified_fallback_pct        NUMERIC(8,6),
    unified_overage_disabled    TEXT,

    -- Family 5: Fast mode (NULL when not applicable)
    fast_input_remaining    INTEGER,
    fast_output_remaining   INTEGER,

    -- Error state
    http_status         INTEGER DEFAULT 200,
    retry_after_secs    INTEGER,

    -- Raw header dump for future-proofing
    raw_headers         JSONB,

    -- Ingestion source
    source              TEXT NOT NULL DEFAULT 'proxy'
);

-- ═══════════════════════════════════════════════════════════════
-- Session lifecycle events
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS session_events (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    project         TEXT,
    cumulative_input    BIGINT,
    cumulative_output   BIGINT,
    cumulative_cost     NUMERIC(10,4),
    request_count       INTEGER,
    duration_secs       INTEGER,
    metadata            JSONB
);

-- ═══════════════════════════════════════════════════════════════
-- Aggregated summaries (materialized by cron from api_requests)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS usage_summary (
    id              BIGSERIAL PRIMARY KEY,
    period_type     TEXT NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    total_input         BIGINT,
    total_output        BIGINT,
    total_cache_read    BIGINT,
    total_cache_write   BIGINT,
    total_cost_usd      NUMERIC(12,4),
    request_count       INTEGER,
    session_count       INTEGER,
    error_count         INTEGER,
    billable_input      BIGINT,
    billable_output     BIGINT,
    model_breakdown     JSONB,
    project_breakdown   JSONB,
    agent_breakdown     JSONB,
    hourly_breakdown    JSONB,
    UNIQUE(period_type, period_start)
);

-- ═══════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests (timestamp);
CREATE INDEX IF NOT EXISTS idx_api_requests_session ON api_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_project ON api_requests (project);
CREATE INDEX IF NOT EXISTS idx_api_requests_model ON api_requests (model);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events (session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events (event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_summary_period ON usage_summary (period_type, period_start);
