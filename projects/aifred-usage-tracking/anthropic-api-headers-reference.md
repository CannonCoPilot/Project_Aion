# Anthropic Messages API — Complete HTTP Response Headers Reference

**Version**: 1.0.0
**Created**: 2026-04-23
**Purpose**: Exhaustive catalog of every header returned by `api.anthropic.com/v1/messages` for reverse proxy construction.
**Plan context**: Max (5x) subscription, Claude Code CLI client

---

## Header Families Overview

The API returns headers across **six distinct families**. On a Max plan, both standard (Family 2) AND unified (Family 4) headers appear simultaneously on every response.

| Family | Count | When Present | Timestamp Format |
|--------|-------|-------------|-----------------|
| 1. Universal | 3 | Every response | N/A |
| 2. Standard Rate Limit | 12 | Every non-error response (all plans) | RFC 3339 |
| 3. Priority Tier | 6 | Enterprise/Priority API accounts only | RFC 3339 |
| 4. Unified / Max Plan | 11 | Max subscription + Claude Code | **Unix epoch integer** |
| 5. Fast Mode | 6 | Opus 4.6 with `fast-mode-2026-02-01` beta only | RFC 3339 |
| 6. Condition-Specific | 3 | Streaming, 429 errors | Varies |

**Total**: Up to ~41 headers on a Max plan response.

---

## Family 1: Universal (Every Response)

| Header | Format | Example | Notes |
|--------|--------|---------|-------|
| `request-id` | `req_` + alphanumeric | `req_01EeMGZJbkFuvMVWGFVpQ5oW` | NOT `x-request-id`. SDK parses by exact name. |
| `anthropic-organization-id` | UUID | `f8d0d1e1-74d9-4d23-a6d5-812e6f5c6b7e` | Consistent per API key. Useful for multi-tenant routing. |
| `content-type` | MIME type | `application/json` | Overridden to `text/event-stream; charset=utf-8` for streaming. |

---

## Family 2: Standard Rate Limit (All Plans)

12 headers. Present on every non-error response. Reset timestamps use **RFC 3339** format.

The `anthropic-ratelimit-tokens-*` headers reflect the **most restrictive active limit** at time of response.

| Header | Format | Example |
|--------|--------|---------|
| `anthropic-ratelimit-requests-limit` | integer | `4000` |
| `anthropic-ratelimit-requests-remaining` | integer | `3999` |
| `anthropic-ratelimit-requests-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |
| `anthropic-ratelimit-tokens-limit` | integer | `400000` |
| `anthropic-ratelimit-tokens-remaining` | integer | `399980` |
| `anthropic-ratelimit-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |
| `anthropic-ratelimit-input-tokens-limit` | integer | `50000` |
| `anthropic-ratelimit-input-tokens-remaining` | integer | `49900` |
| `anthropic-ratelimit-input-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |
| `anthropic-ratelimit-output-tokens-limit` | integer | `10000` |
| `anthropic-ratelimit-output-tokens-remaining` | integer | `9800` |
| `anthropic-ratelimit-output-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |

---

## Family 3: Priority Tier (Enterprise Only)

6 headers. Only present for accounts with Priority Tier access. RFC 3339 timestamps.

| Header | Format | Example |
|--------|--------|---------|
| `anthropic-priority-input-tokens-limit` | integer | `200000` |
| `anthropic-priority-input-tokens-remaining` | integer | `198500` |
| `anthropic-priority-input-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |
| `anthropic-priority-output-tokens-limit` | integer | `50000` |
| `anthropic-priority-output-tokens-remaining` | integer | `49200` |
| `anthropic-priority-output-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |

---

## Family 4: Unified / Max Plan (Max Subscription + Claude Code)

11 headers. Present on Max subscription plans and Claude Code CLI sessions.

**CRITICAL**: Reset timestamps use **Unix epoch integers**, NOT RFC 3339. This differs from all other families.

| Header | Format | Example | Notes |
|--------|--------|---------|-------|
| `anthropic-ratelimit-unified-status` | string enum | `"within_limit"` | Global unified budget status |
| `anthropic-ratelimit-unified-reset` | Unix epoch int | `1745539200` | Overall unified budget reset |
| `anthropic-ratelimit-unified-5h-status` | string enum | `"within_limit"` | 5-hour rolling window status |
| `anthropic-ratelimit-unified-5h-reset` | Unix epoch int | `1745539200` | When 5h window resets |
| `anthropic-ratelimit-unified-5h-utilization` | decimal string | `"0.690000"` | Fraction consumed (0.69 = 69%) |
| `anthropic-ratelimit-unified-7d-status` | string enum | `"within_limit"` | 7-day window status |
| `anthropic-ratelimit-unified-7d-reset` | Unix epoch int | `1745971200` | When 7d window resets |
| `anthropic-ratelimit-unified-7d-utilization` | decimal string | `"0.120000"` | Fraction consumed (0.12 = 12%) |
| `anthropic-ratelimit-unified-representative-claim` | string enum | `"five_hour"` | Which window is the governing limit |
| `anthropic-ratelimit-unified-fallback-percentage` | decimal string | `"1.000000"` | Fallback budget percentage |
| `anthropic-ratelimit-unified-overage-disabled-reason` | string or absent | `"org_level_disabled"` | Why overage is off; absent if enabled |

### Status Enum Values
- `"within_limit"` — under quota
- `"limit_reached"` — at quota boundary
- `"over_limit"` — exceeded quota

### Representative Claim Values
- `"five_hour"` — 5h rolling window is the governing constraint
- `"seven_day"` — 7d window is the governing constraint

### Mapping to claude.ai Usage Page

| claude.ai Field | Header Source |
|-----------------|--------------|
| Current session: 69% used | `unified-5h-utilization` = `"0.690000"` |
| Resets in 2hr 14min | `unified-5h-reset` (Unix epoch → compute delta) |
| Weekly All models: 12% | `unified-7d-utilization` = `"0.120000"` |
| Resets Sat 6:00 AM | `unified-7d-reset` (Unix epoch → format) |

---

## Family 5: Fast Mode (Opus 4.6 Beta Only)

6 headers. Only present when request includes `anthropic-beta: fast-mode-2026-02-01` AND model is `claude-opus-4-6`. RFC 3339 timestamps.

| Header | Format | Example |
|--------|--------|---------|
| `anthropic-fast-input-tokens-limit` | integer | `100000` |
| `anthropic-fast-input-tokens-remaining` | integer | `99200` |
| `anthropic-fast-input-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |
| `anthropic-fast-output-tokens-limit` | integer | `20000` |
| `anthropic-fast-output-tokens-remaining` | integer | `19700` |
| `anthropic-fast-output-tokens-reset` | RFC 3339 | `2026-04-24T00:01:00Z` |

---

## Family 6: Condition-Specific

### Streaming Responses Only (`stream: true`)

| Header | Value | Notes |
|--------|-------|-------|
| `content-type` | `text/event-stream; charset=utf-8` | Overrides universal `application/json` |
| `transfer-encoding` | `chunked` | Standard for SSE |

### 429 Too Many Requests Only

| Header | Format | Example | Notes |
|--------|--------|---------|-------|
| `retry-after` | integer (seconds) | `30` | Seconds to wait before retry |

---

## Response Body: `usage` Object

Not a header, but essential for per-request token accounting. Present in every non-streaming response body; accumulated in the final `message_delta` SSE event for streaming.

| Field | Type | Notes |
|-------|------|-------|
| `input_tokens` | integer | Tokens in the prompt (billable) |
| `output_tokens` | integer | Tokens generated (billable) |
| `cache_creation_input_tokens` | integer | Tokens written to prompt cache (1.25x input cost) |
| `cache_read_input_tokens` | integer | Tokens read from prompt cache (0.1x input cost). **Do NOT count toward ITPM rate limits** on most current models. |
| `speed` | string enum | `"fast"` or `"standard"`. Only present when fast mode beta was active. |

### Cost Calculation (April 2026 Pricing)

| Model | Input (per MTok) | Output (per MTok) | Cache Write | Cache Read |
|-------|-------------------|-------------------|-------------|------------|
| claude-opus-4-6 | $15.00 | $75.00 | $18.75 | $1.50 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-haiku-4-5 | $0.80 | $4.00 | $1.00 | $0.08 |

Formula:
```
cost = (input_tokens * input_rate / 1M)
     + (output_tokens * output_rate / 1M)
     + (cache_creation_input_tokens * cache_write_rate / 1M)
     + (cache_read_input_tokens * cache_read_rate / 1M)
```

---

## Proxy Implementation Notes

### 1. Timestamp Format Divergence
Families 2, 3, and 5 use RFC 3339 (`2026-04-24T00:01:00Z`). Family 4 (Unified/Max) uses Unix epoch integers (`1745539200`). The proxy parser must handle both.

### 2. Header Passthrough
Forward ALL `anthropic-ratelimit-*`, `anthropic-fast-*`, `request-id`, `anthropic-organization-id`, and `retry-after` headers verbatim to the downstream client (Claude Code). Do not strip or modify them — Claude Code may depend on their presence.

### 3. Streaming (SSE) Handling
- **Never buffer streaming responses.** The proxy must forward SSE chunks as they arrive.
- Set `X-Accel-Buffering: no` if behind nginx.
- Rate limit headers appear on the **initial** SSE response, not on individual events.
- The `usage` object appears in the final `message_delta` event's `usage` field.
- If upstream sends `content-encoding: gzip` and proxy decodes it, strip that header before forwarding to prevent double-decode.

### 4. Additive Header Sets
On a Max plan, both standard (Family 2) AND unified (Family 4) headers are present simultaneously. The proxy should capture all families — they provide different information (per-minute vs. rolling window).

### 5. Absent vs. Zero
Some headers may be absent rather than zero. `anthropic-ratelimit-unified-overage-disabled-reason` is only present when overage IS disabled. Treat absent headers as null, not zero.

### 6. Header Capture Schema

Recommended storage: capture all headers as a JSONB blob per request, plus extract key fields into typed columns for query performance.

```sql
-- Per-request capture
INSERT INTO api_responses (
    request_id,                          -- from request-id header
    timestamp,                           -- proxy wall clock
    -- Token counts (from response body)
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    -- Session budget (from unified headers)
    unified_5h_utilization,              -- decimal: 0.0 - 1.0
    unified_5h_reset,                    -- Unix epoch → timestamptz
    unified_5h_status,                   -- enum: within_limit, limit_reached, over_limit
    unified_7d_utilization,
    unified_7d_reset,
    unified_7d_status,
    representative_claim,                -- five_hour or seven_day
    -- Per-minute limits (from standard headers)
    tokens_remaining,
    tokens_limit,
    input_tokens_remaining,
    output_tokens_remaining,
    -- Full header dump (for anything we missed)
    raw_headers                          -- JSONB: all anthropic-* headers
);
```

---

## Sources

1. Anthropic Rate Limits Documentation — `platform.claude.com/docs/en/api/rate-limits`
2. Anthropic API Overview — `platform.claude.com/docs/en/api/overview`
3. Anthropic Python SDK `_response.py` — header parsing constants
4. Claude Code GitHub Issue #12829 — real unified header captures
5. Anthropic Fast Mode Documentation — `platform.claude.com/docs/en/build-with-claude/fast-mode`

---

*Reference document for AIFred-Pro usage tracking reverse proxy. Updated 2026-04-23.*
