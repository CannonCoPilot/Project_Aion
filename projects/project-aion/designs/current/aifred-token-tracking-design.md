# AIFred-Pro Token Tracking & Session-Aware Task Scheduling — Design Plan

**Version**: 1.1.0
**Created**: 2026-04-23
**Author**: Nate (Jarvis)
**Target**: AIFred-Pro-Dev (`nate-dev` branch)
**Status**: Design — pending implementation

---

## 1. Problem Statement

AIFred-Pro orchestrates autonomous Claude Code agents via Nexus (cron dispatcher, 24 personas, job execution). Current metrics infrastructure estimates token usage via 4-char heuristics (`context-usage-tracker.js`) and parses `<usage>` tags from subagent results (`subagent-dispatcher.js`). Neither captures **actual Anthropic API-level token counts, rate-limit state, or session billing data**.

This creates three gaps:

1. **No real cost visibility** — estimated costs diverge from actual billing; no way to correlate Pulse task execution with API spend
2. **No rate-limit awareness** — Nexus dispatches jobs without knowing whether the 5h rolling token window is exhausted, leading to wasted executions and 429 errors
3. **No session-aware scheduling** — all tasks execute immediately regardless of time-of-day, token burn rate, or remaining session budget

## 2. Vision

A **token-aware operations layer** that:
- Captures real API-level telemetry per request (input, output, cache tokens, model, cost)
- Surfaces usage metrics on the Dashboard OverviewPage (daily/monthly, burn rate, session timeline)
- Gates task execution on token budget (remaining 5h window, daily/monthly caps)
- Optimizes non-critical task execution for off-peak hours
- Provides session lifecycle awareness (start/stop times, duration, percent usage)

---

## 3. Architecture

### 3.1 Data Collection — Three Tiers

#### Tier 1: Reverse Proxy (PRIMARY — real-time operational state)

**This is the only way to know actual Anthropic-enforced budget state.** Claude Code silently swallows API response headers — it does not expose rate-limit data, session utilization, or remaining budget. A reverse proxy intercepts every Anthropic API request/response and captures the headers that tell us where we stand against the plan limits.

**Anthropic response headers captured per request**:
```
# Per-request token counts (in response body, not headers)
usage.input_tokens
usage.output_tokens
usage.cache_creation_input_tokens
usage.cache_read_input_tokens

# Rate limit state (response headers)
anthropic-ratelimit-requests-limit / -remaining / -reset
anthropic-ratelimit-tokens-limit / -remaining / -reset
anthropic-ratelimit-input-tokens-limit / -remaining / -reset
anthropic-ratelimit-output-tokens-limit / -remaining / -reset

# Max plan unified rolling windows (response headers)
anthropic-ratelimit-unified-tokens-limit / -remaining / -reset
anthropic-ratelimit-unified-status
anthropic-ratelimit-unified-5h-status / -reset / -utilization
anthropic-ratelimit-unified-7d-status / -reset / -utilization
anthropic-ratelimit-unified-representative-claim
anthropic-ratelimit-unified-fallback-percentage
retry-after                                      # On 429 only
```

**Why proxy is primary, not optional**: You cannot derive operational budget state from token counts alone. Anthropic's internal accounting includes factors invisible to us — concurrent sessions on the same plan, cache exemption policies, plan-level calculations. The headers are what Anthropic *actually thinks* your budget is. Everything else is estimation.

**Routing**: Set `ANTHROPIC_BASE_URL=http://localhost:<PROXY_PORT>` in Claude Code's environment. The proxy forwards to `https://api.anthropic.com` transparently, capturing headers on every response.

**Implementation options** (evaluated during Phase 1):

| Option | Pros | Cons |
|--------|------|------|
| **proxyclawd** (dyshay/proxyclawd) | Purpose-built for Claude Code, TUI+WebUI, MCP server for self-query | External dependency, TLS interception |
| **Custom lightweight proxy** (Python/Node) | Full control, minimal deps, tailored to our schema | Build effort |
| **mitmproxy** | Mature, scriptable (Python addons), captures everything | Heavy, complex TLS setup |
| **nginx reverse proxy** | Battle-tested, low overhead | Limited header parsing/storage logic |

**Recommended**: Start with a custom lightweight proxy (Python FastAPI or Node) — ~100 lines to forward requests, capture headers+body usage, and write to PostgreSQL. If proxyclawd proves stable, adopt it and retire the custom proxy.

#### Tier 2: JSONL Session Files (SUPPLEMENTAL — retrospective analytics)

Claude Code writes session data to:
```
~/.claude/projects/{url-encoded-project-path}/{session-uuid}.jsonl
```

Each assistant turn contains `usage` object with actual token counts. Suitable for:
- Post-session billing summaries and cost attribution
- Historical trend analysis
- Session duration and turn count tracking
- Backfilling gaps if proxy was down

**Community tool**: `ccusage` (npm) provides rich dashboard from JSONL files.

#### Tier 3: OpenTelemetry Native (SUPPLEMENTAL — structured metrics export)

Claude Code ships built-in OTel support. Useful for Prometheus/Grafana integration but does NOT expose rate-limit headers — only per-request token counts from the response body.

**Environment variables**:
```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_LOG_RAW_API_BODIES=1           # Full request+response JSON as OTel logs
```

**Use case**: Feed Prometheus for time-series metrics and Grafana dashboards. Complements the proxy (which feeds PostgreSQL for the Pulse API). Not a replacement for the proxy — OTel cannot capture rate-limit headers.

### 3.2 Data Storage

**New PostgreSQL tables** (in `aifred-dev-postgres`, database `pulse`):

See `projects/aifred-usage-tracking/anthropic-api-headers-reference.md` for the full header catalog (6 families, ~41 headers) that informs this schema.

```sql
-- ═══════════════════════════════════════════════════════════════
-- Per-API-call: token usage + rate-limit snapshot (from proxy)
-- One row per Anthropic API request/response pair.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE api_requests (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          TEXT UNIQUE,              -- from `request-id` header (req_xxx)
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    organization_id     TEXT,                     -- from `anthropic-organization-id` header

    -- Request context (enriched by proxy from request body/env)
    model               TEXT NOT NULL,            -- claude-opus-4-6, claude-sonnet-4-6, etc.
    is_streaming        BOOLEAN DEFAULT false,    -- stream: true in request
    session_id          TEXT,                     -- Claude Code session UUID (from env/context)
    project             TEXT,                     -- project context (jarvis, chronicler, etc.)
    agent_name          TEXT,                     -- Nexus persona or subagent name
    task_id             TEXT,                     -- Pulse task ID if applicable

    -- Token counts (from response body `usage` object)
    input_tokens        INTEGER NOT NULL,
    output_tokens       INTEGER NOT NULL,
    cache_read_tokens   INTEGER DEFAULT 0,        -- 0.1x input cost; does NOT count toward ITPM
    cache_write_tokens  INTEGER DEFAULT 0,        -- 1.25x input cost
    speed               TEXT,                     -- 'fast' or 'standard' (fast mode beta only)

    -- Computed cost (from token counts x model pricing)
    cost_usd            NUMERIC(10,6),

    -- Family 2: Standard per-minute rate limits (RFC 3339 resets)
    rl_requests_limit       INTEGER,
    rl_requests_remaining   INTEGER,
    rl_tokens_limit         INTEGER,
    rl_tokens_remaining     INTEGER,
    rl_input_remaining      INTEGER,
    rl_output_remaining     INTEGER,

    -- Family 4: Unified / Max plan (Unix epoch resets)
    unified_status              TEXT,             -- within_limit | limit_reached | over_limit
    unified_5h_status           TEXT,
    unified_5h_utilization      NUMERIC(12,10),   -- decimal 0.0-1.0 (high precision)
    unified_5h_reset            TIMESTAMPTZ,      -- converted from Unix epoch
    unified_7d_status           TEXT,
    unified_7d_utilization      NUMERIC(12,10),
    unified_7d_reset            TIMESTAMPTZ,      -- converted from Unix epoch
    unified_representative_claim TEXT,            -- five_hour | seven_day
    unified_fallback_pct        NUMERIC(8,6),
    unified_overage_disabled    TEXT,             -- reason string or NULL if enabled

    -- Family 5: Fast mode (Opus 4.6 beta; NULL when not applicable)
    fast_input_remaining    INTEGER,
    fast_output_remaining   INTEGER,

    -- Error state
    http_status         INTEGER DEFAULT 200,
    retry_after_secs    INTEGER,                  -- from `retry-after` header (429 only)

    -- Raw header dump (everything anthropic-* for future-proofing)
    raw_headers         JSONB,

    -- Ingestion source
    source              TEXT NOT NULL DEFAULT 'proxy'  -- proxy, jsonl, otel
);

-- ═══════════════════════════════════════════════════════════════
-- Session lifecycle events
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE session_events (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT NOT NULL,
    event_type      TEXT NOT NULL,                -- start, end, pause, resume, jicm_clear, error
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    project         TEXT,
    cumulative_input    BIGINT,                   -- total input tokens at event time
    cumulative_output   BIGINT,                   -- total output tokens at event time
    cumulative_cost     NUMERIC(10,4),            -- total cost at event time
    request_count       INTEGER,                  -- total requests in session at event time
    duration_secs       INTEGER,
    metadata            JSONB
);

-- ═══════════════════════════════════════════════════════════════
-- Aggregated summaries (materialized by cron from api_requests)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE usage_summary (
    id              BIGSERIAL PRIMARY KEY,
    period_type     TEXT NOT NULL,                -- daily, weekly, monthly
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,

    -- Totals
    total_input         BIGINT,
    total_output        BIGINT,
    total_cache_read    BIGINT,
    total_cache_write   BIGINT,
    total_cost_usd      NUMERIC(12,4),
    request_count       INTEGER,
    session_count       INTEGER,
    error_count         INTEGER,                  -- 429s and other errors

    -- Billable vs. non-billable breakdown
    billable_input      BIGINT,                   -- input - cache_read (cache reads are cheaper)
    billable_output     BIGINT,

    -- Breakdowns (JSONB for flexibility)
    model_breakdown     JSONB,                    -- {model: {input, output, cache_read, cost, requests}}
    project_breakdown   JSONB,
    agent_breakdown     JSONB,
    hourly_breakdown    JSONB,                    -- {hour: {input, output, cost}} for peak/off-peak

    UNIQUE(period_type, period_start)
);

-- ═══════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX idx_api_requests_timestamp ON api_requests (timestamp);
CREATE INDEX idx_api_requests_session ON api_requests (session_id);
CREATE INDEX idx_api_requests_project ON api_requests (project);
CREATE INDEX idx_api_requests_model ON api_requests (model);
CREATE INDEX idx_api_requests_request_id ON api_requests (request_id);
CREATE INDEX idx_session_events_session ON session_events (session_id);
CREATE INDEX idx_session_events_type ON session_events (event_type, timestamp);
CREATE INDEX idx_usage_summary_period ON usage_summary (period_type, period_start);
```

### Schema Design Notes

1. **`api_requests` replaces separate `token_usage` + `rate_limit_state` tables** — one row per API call captures both token counts AND rate-limit snapshot atomically. No need to join across tables for budget decisions.

2. **`unified_5h_utilization` uses `NUMERIC(12,10)`** — Anthropic returns high-precision decimals like `"0.018842..."`. Storing as `NUMERIC(5,2)` would lose this precision.

3. **`unified_*_reset` stored as `TIMESTAMPTZ`** — the proxy converts Unix epoch integers from the headers to timestamps at write time. Consumers never need to parse epochs.

4. **`raw_headers` JSONB column** — future-proofing. If Anthropic adds new headers (e.g., for new quota dimensions), they're captured immediately without schema changes.

5. **`cache_read_tokens` tracked separately** — these do NOT count toward ITPM rate limits and are billed at 0.1x input rate. The `usage_summary` table computes `billable_input` = `total_input - total_cache_read` for accurate cost reporting.

6. **`hourly_breakdown` in `usage_summary`** — enables peak vs. off-peak analysis for the scheduling optimizer.

### 3.3 Ingestion Pipeline

```
                    ANTHROPIC_BASE_URL=http://localhost:9800
                                    │
┌──────────────────┐                │
│ Claude Code      │────────────────┘
│ (all sessions)   │
└──────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│ Reverse Proxy (:9800)                    PRIMARY         │
│                                                          │
│  Intercepts every Anthropic API call:                    │
│  • Forwards request → api.anthropic.com                  │
│  • Captures response headers (ratelimit-*, unified-*)    │
│  • Captures response body (usage.input/output_tokens)    │
│  • Writes to PostgreSQL per-request                      │
│                                                          │
│  Stores:                                                 │
│  ├─► token_usage (per-request token counts + cost)       │
│  └─► rate_limit_state (budget snapshot per response)     │
└──────────────────────────┬───────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
┌────────────────┐ ┌──────────────┐  ┌──────────────────┐
│ PostgreSQL     │ │ JSONL Parser │  │ OTel (optional)  │
│ (:5433 dev)    │ │ cron (5min)  │  │ → Prometheus     │
│                │ │ backfill +   │  │ → Grafana        │
│ token_usage    │ │ historical   │  │ (time-series     │
│ rate_limit     │ │ analytics    │  │  dashboards)     │
│ session_events │ └──────┬───────┘  └──────────────────┘
│ usage_summary  │        │
└───────┬────────┘        │
        │     ┌───────────┘
        ▼     ▼
┌──────────────────┐
│ Pulse API        │
│ /api/v1/usage/*  │
│ (:8800)          │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────┐
│ Dashboard        │     │ Nexus Dispatcher     │
│ OverviewPage     │     │ Budget gate check    │
│ (:8701)          │     │ before task dispatch │
└──────────────────┘     └──────────────────────┘
```

### 3.4 API Endpoints (Pulse Dev — new)

Add to `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/pulse/app.py`:

```
GET /api/v1/usage/current          # Current session stats + rate limit state
GET /api/v1/usage/daily?date=      # Daily summary (tokens, cost, by model/project)
GET /api/v1/usage/weekly           # Weekly rollup
GET /api/v1/usage/monthly          # Monthly rollup
GET /api/v1/usage/sessions         # Session list with duration, tokens, cost
GET /api/v1/usage/burn-rate        # Current tokens/minute, projected daily total
GET /api/v1/usage/budget           # Remaining budget vs. caps (5h, daily, monthly)
POST /api/v1/usage/ingest          # Receive token_usage records from collector
```

### 3.5 Dashboard Components (React + Tailwind v4)

**OverviewPage additions** (new cards alongside existing ActionItems, ThroughputChart, etc.):

| Component | Data Source | Visualization |
|-----------|-------------|---------------|
| `SessionBudgetMeter` | `/usage/budget` | Progress bar: 5h session window (primary gate) |
| `WeeklyQuotaBars` | `/usage/budget` | Per-model progress bars: all models, sonnet-only |
| `MonthlySpendMeter` | `/usage/budget` | Spend vs. limit bar + balance remaining |
| `TokenBurnCard` | `/usage/burn-rate` | Gauge: current burn rate + trend arrow + ETA |
| `DailyUsageSpark` | `/usage/daily` | Sparkline: last 7 days input+output tokens |
| `SessionTimeline` | `/usage/sessions` | Horizontal timeline: sessions with duration bars |
| `CostBreakdown` | `/usage/daily` | Donut chart: cost by model tier (Recharts) |
| `ModelMix` | `/usage/daily` | Stacked bar: opus vs sonnet vs haiku per day |

**New full page** (`/usage` route):
- Detailed daily/weekly/monthly views
- Per-project cost attribution table
- Per-agent efficiency rankings (tokens per task)
- Historical trends (Recharts line charts)
- Session replay timeline with token waterfall

### 3.6 Task Execution Gates (Nexus Integration)

**Token-budget dispatcher gate** in `scripts/dispatcher.sh`:

```bash
# Before dispatching a job, check budget against the GOVERNING constraint
budget_check() {
    local budget=$(curl -s http://localhost:8800/api/v1/usage/budget)
    local governing=$(echo "$budget" | jq -r '.representative_claim')  # five_hour or seven_day
    local status=$(echo "$budget" | jq -r '.unified_status')           # within_limit, limit_reached, over_limit
    local util_5h=$(echo "$budget" | jq -r '.five_hour_utilization')   # 0-100 percent
    local util_7d=$(echo "$budget" | jq -r '.seven_day_utilization')
    local reset_mins=$(echo "$budget" | jq -r '.governing_reset_minutes')
    
    # Hard stop: Anthropic says we're at/over limit
    if [ "$status" = "limit_reached" ] || [ "$status" = "over_limit" ]; then
        echo "BUDGET_EXHAUSTED: unified_status=$status, resets in ${reset_mins}m"
        return 1
    fi
    
    # Gate on whichever window is governing (representative_claim)
    local util="$util_5h"
    [ "$governing" = "seven_day" ] && util="$util_7d"
    
    # Return utilization for priority-based threshold check
    echo "$util"
    return 0
}
```

The `representative_claim` header tells us whether the 5h or 7d window is the binding constraint. The gate checks whichever Anthropic considers governing — not always 5h.

**Priority-based scheduling**:

| Priority | Behavior |
|----------|----------|
| P1 Critical | Always execute — no budget gate |
| P2 High | Execute if >10% budget remaining |
| P3 Normal | Execute if >20% budget remaining |
| P4 Low | Execute only during off-peak or >50% remaining |
| P5 Background | Queue for off-peak hours only |

**Off-peak detection** (approximate, based on usage patterns):
- Peak: 08:00-18:00 local time (weekdays)
- Off-peak: 18:00-08:00 + weekends
- Configurable via `PULSE_PEAK_HOURS` environment variable

---

## 4. Implementation Phases

### Phase 1: Reverse Proxy & Data Collection (Week 1)

1. **Build reverse proxy** — lightweight Python (FastAPI) or Node proxy on `:9800` that forwards to `api.anthropic.com`, captures response headers + body `usage` object, writes to PostgreSQL
2. **Create DB schema** — `token_usage`, `session_events`, `rate_limit_state`, `usage_summary` tables in `aifred-dev-postgres`
3. **Configure Claude Code routing** — set `ANTHROPIC_BASE_URL=http://localhost:9800` in Jarvis tmux launcher and Nexus execution environment
4. **Validate header capture** — confirm all `anthropic-ratelimit-*` and `anthropic-ratelimit-unified-*` headers are being stored per request
5. **Build JSONL parser** — cron job (5min) for backfill/historical analytics from `~/.claude/projects/` session files

**DoD**: Proxy running, Claude Code routing through it, every API call writing token counts + rate-limit state to PostgreSQL. JSONL parser as backup/backfill.

### Phase 2: API & Budget Engine (Week 2)

1. **Pulse API endpoints** — `/usage/*` routes in `pulse/app.py` reading from proxy-populated tables
2. **Budget calculator** — derives current state from latest `rate_limit_state` row (5h utilization, weekly remaining, monthly spend)
3. **Burn rate calculator** — sliding window (last 15 min) tokens/minute from `token_usage`
4. **Aggregation service** — cron job computing `usage_summary` daily/weekly/monthly rollups
5. **Optional: OTel export** — add Prometheus + Grafana for time-series dashboards alongside PostgreSQL

**DoD**: All `/usage/*` endpoints returning real data sourced from proxy-captured headers. Budget state reflects actual Anthropic-enforced limits.

### Phase 3: Dashboard Visualization (Week 3)

1. **OverviewPage cards** — TokenBurnCard, DailyUsageSpark, BudgetMeter, CostBreakdown
2. **Session timeline** — horizontal bars showing session durations with token heat coloring
3. **Usage page** (`/usage` route) — full analytics view with daily/weekly/monthly tabs
4. **Per-project breakdown** — table with cost attribution per project
5. **Per-agent rankings** — efficiency table (tokens per task completed)

**DoD**: Dashboard OverviewPage shows live usage data. Full `/usage` page with historical trends. All components use Tailwind v4 and match existing design system.

### Phase 4: Intelligent Scheduling (Week 4)

1. **Budget gate in dispatcher** — check remaining budget before job dispatch
2. **Priority-based scheduling** — P1-P5 tiers with different budget thresholds
3. **Off-peak queue** — low-priority tasks deferred to off-peak hours
4. **Burn rate alerting** — Telegram notification via @Keryx_Archon when budget <10%
5. **Session-aware Jarvis JICM** — JICM considers token budget in compression decisions

**DoD**: Nexus dispatcher respects token budget. Low-priority tasks queue for off-peak. Telegram alerts functional. Session-aware gates tested end-to-end.

---

## 5. Prior Art (Existing AIFred-Pro Infrastructure)

| Component | File | What It Captures | Gap |
|-----------|------|-------------------|-----|
| `context-usage-tracker.js` | `.claude/hooks/` | Per-tool token estimates (4-char heuristic) | Estimation, not actual |
| `subagent-dispatcher.js` | `.claude/hooks/` | Subagent token usage from `<usage>` tags | Only subagents, not all API calls |
| `session-tracker.js` | `.claude/hooks/` | Session start/end lifecycle events | No token data |
| `metrics-query.ts` | `.claude/skills/infrastructure-ops/tools/` | CLI for querying task-metrics.jsonl | Read-only, no dashboard |
| `stage-metrics.ts` | `dashboard/server/services/` | Workflow stage durations and throughput | Stage-level, not token-level |
| `quota-check.sh` (referenced) | `.claude/jobs/lib/` | Subscription-aware token quota check | File not found in current state |
| `gemini-api.sh` | `.claude/jobs/lib/` | Gemini quota + RPM rate limiting | Pattern to replicate for Anthropic |
| NexusOps Analytics | `dashboard/frontend/src/components/nexus-ops/` | CostDashboard, PerformanceChart, AccuracyTrend | Framework exists — add token data |

**Key insight**: The Gemini quota pattern in `gemini-api.sh` (`gemini_check_quota()` + `gemini_rpm_pace()`) is the closest existing model for what we need to build for Anthropic.

---

## 6. Community Tools

| Tool | Type | Usefulness |
|------|------|-----------|
| **ccusage** (ryoppippi/ccusage) | npm CLI | Rich JSONL dashboard — reference for data format |
| **proxyclawd** (dyshay/proxyclawd) | MITM proxy + MCP | Rate-limit header capture + self-query MCP |
| **claude-usage** (phuryn/claude-usage) | Python CLI | Session aggregation patterns |
| **tokscale** (junhoyeo/tokscale) | Web visualizer | Multi-session UI patterns |

None provide the full loop (collection → storage → dashboard → scheduling gates). This is greenfield integration work.

---

## 7. Key Design Decisions

1. **Proxy-first for operational state** — The reverse proxy is the only way to capture Anthropic's rate-limit headers, which are the source of truth for budget/quota state. Claude Code silently swallows these headers. OTel and JSONL are supplemental for token accounting — they cannot tell you how much budget remains because Anthropic's internal accounting includes factors invisible to us (concurrent sessions, plan-level calculations, cache exemptions).

2. **PostgreSQL as primary store, Prometheus optional** — The proxy writes directly to PostgreSQL, which the Pulse API already uses. This avoids adding infrastructure complexity. Prometheus + Grafana can be added later for time-series dashboards if needed, fed by OTel.

3. **Cache-read tokens don't count toward ITPM** — critical optimization. AIFred-Pro's agent sessions reuse system prompts heavily. Tracking cache-read separately enables accurate "billable" vs. "total" token reporting.

4. **Existing NexusOps analytics components as base** — The dashboard already has CostDashboard, PerformanceChart, and StageMetricsPanel. New usage components should integrate alongside these, not replace them. Use the same Recharts + Tailwind v4 patterns.

5. **Budget gates are advisory, not blocking** — P1 Critical tasks always execute. The gate prevents low-priority background work from consuming budget that critical work needs, but never blocks urgent tasks.

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Proxy adds latency to API calls | Proxy is local HTTP → HTTPS forward; expect <5ms overhead. Benchmark in Phase 1. |
| Proxy goes down, Claude Code breaks | Set `ANTHROPIC_BASE_URL` only in Nexus/Jarvis launcher scripts — bare Claude Code sessions bypass proxy. Proxy health check + auto-restart via Docker. |
| Streaming SSE buffering in proxy | Proxy MUST NOT buffer SSE responses. Forward chunks as received. Test with `stream: true` in Phase 1. |
| Unified header timestamp format (Unix epochs) | Proxy converts to TIMESTAMPTZ at write time. Parser handles both RFC 3339 and epoch. |
| Rate-limit header format changes by Anthropic | `raw_headers` JSONB column captures everything. Schema changes only needed for new typed columns. |
| JSONL files grow unbounded | Implement rotation (keep last 30 days) |
| Off-peak scheduling delays critical work | P1 Critical bypasses all gates |
| Overage spend not visible in headers | Compute from cumulative `cost_usd` in `api_requests` vs. configured monthly limit |

---

## 9. Claude.ai Usage Page Analysis (Screenshot Reference)

**Source**: `projects/aifred-usage-tracking/screenshot-sm.png` (claude.ai/settings/usage)
**Plan**: Max (5x)

The usage page reveals **four independent quota dimensions** that the dashboard must track:

### Dimension 1: Current Session (5h Rolling Window)
- **Meter**: 69% used, resets in 2hr 14min
- **Mapping**: `anthropic-ratelimit-unified-5h-utilization` header
- **Dashboard**: Primary gauge — most urgent for task scheduling decisions
- **Gate logic**: This is the dimension that triggers 429 errors and session throttling

### Dimension 2: Weekly Limits (Per-Model Tier)
- **All models**: 12% used, resets Saturday 6:00 AM
- **Sonnet only**: 7% used (separate sub-quota), resets Saturday 6:00 AM
- **Claude Design**: 0% used (unused product line)
- **Mapping**: `anthropic-ratelimit-unified-7d-utilization` header
- **Dashboard**: Weekly progress bars with per-model breakdown
- **Gate logic**: If weekly >80%, shift P4-P5 tasks to use cheaper models

### Dimension 3: Daily Routine Runs
- **Meter**: 0 / 15 runs used
- **Note**: Separate quota for scheduled routines (claude.ai Routines feature)
- **Dashboard**: Simple counter card
- **Gate logic**: Not applicable to Claude Code — this is a claude.ai web feature

### Dimension 4: Extra Usage (Overage Billing)
- **Spent**: $83.18 this billing period (104% of $80 monthly limit)
- **Monthly spend limit**: $80 (adjustable)
- **Current balance**: $53.25
- **Auto-reload**: Off
- **Resets**: May 1
- **Dashboard**: Cost meter with spend vs. limit, balance remaining
- **Gate logic**: Alert at 80% of monthly spend limit; hard-stop P5 tasks at 100%

### Dashboard Layout (Inspired by claude.ai)

The OverviewPage usage section should mirror this layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Usage Overview                                    Max (5x)  │
├─────────────────────────────────────────────────────────────┤
│ Current Session    ████████████████████░░░░░  69%           │
│ Resets in 2h 14m                                            │
├─────────────────────────────────────────────────────────────┤
│ Weekly (All)       ██░░░░░░░░░░░░░░░░░░░░░░  12%           │
│ Weekly (Sonnet)    █░░░░░░░░░░░░░░░░░░░░░░░   7%           │
│ Resets Sat 6:00 AM                                          │
├─────────────────────────────────────────────────────────────┤
│ Monthly Spend      ████████████████████████░ $83/$80 (104%) │
│ Balance: $53.25 · Resets May 1                              │
├─────────────────────────────────────────────────────────────┤
│ Burn Rate: ~450 tok/min · Est. session remaining: 1h 20m    │
│ Recommendation: Defer P4-P5 tasks until session reset       │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Remaining Open Questions

1. **Proxy implementation language** — Python (FastAPI + httpx) or Node (Express + node-fetch)? Python aligns with existing Pulse API stack. Evaluate in Phase 1.
2. **Multi-user tracking** — Does David's AIFred-Pro also need to route through this proxy? If so, `organization_id` header distinguishes accounts.
3. **Weekly per-model sub-quotas** — The claude.ai page shows separate "Sonnet only" and "All models" weekly bars. The unified-7d headers appear to be aggregate only. Per-model weekly quotas may need to be derived from request-level model tracking + the aggregate header.
4. **Overage spend** — Not present in any response header. Must be computed: sum `cost_usd` from `api_requests` for the billing period vs. a configured monthly limit ($80). The `unified-overage-disabled-reason` header only tells us IF overage is disabled, not how much was spent.
5. **Proxy port** — `:9800` proposed. No conflicts identified with current stack (Jarvis :5432/6333/6379/7474/8001, AIFred prod :8600/8700, AIFred dev :8701/8800, Authentik :9000/9443).
6. **Fast mode headers** — Only present with `anthropic-beta: fast-mode-2026-02-01`. Should the proxy inject this beta header automatically, or only capture it when Claude Code sends it?

## 11. Reference Documents

| Document | Path |
|----------|------|
| Anthropic API Headers Reference | `projects/aifred-usage-tracking/anthropic-api-headers-reference.md` |
| Claude.ai Usage Page Screenshot | `projects/aifred-usage-tracking/screenshot-sm.png` |
| This Design Plan | `projects/project-aion/designs/current/aifred-token-tracking-design.md` |
