# Chronicler Monitoring System — Implementation Plan

## Context

The Chronicler Storyteller web UI is live at localhost:8080 with full SSE streaming from Qwen3-8B via LiteLLM. Both worlds (Namoram: 109K records, Ormon: 1.54M records) are loaded and queryable. However, there is **zero observability** — no logging, no metrics, no middleware, no health checks. The user wants to track data exchange and activity between the Chronicler interface and Qwen3 LLM.

**Goal**: Add a lightweight monitoring system (~230 LOC) that logs every LLM interaction with timing breakdowns, context metrics, and token counts — viewable via a dashboard page and JSON API.

---

## Changes

### 1. Add `storyteller_log` table to schema (~16 lines)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

Append a `storyteller_log` table capturing: query, world, keywords, context stats, model config, token counts, 4-phase latency breakdown (context retrieval, TTFT, LLM streaming, total), status, and errors. All `CREATE IF NOT EXISTS` for idempotent re-runs.

### 2. Create `chronicler/monitoring.py` (~80 lines)

**New file**: `InteractionLog` dataclass with:
- Fields for every metric (query, world, keywords, context_records, context_chars, context_categories, model, temperature, tokens_streamed, response_chars, status, error)
- `time.monotonic()`-based timing methods: `start()`, `context_done()`, `llm_start()`, `first_token()`, `count_token()`, `finish()`
- `async flush(pool)` — single INSERT to `storyteller_log`, called after SSE stream completes (zero user-facing latency)

### 3. Instrument `/api/ask` handler (~18 lines added)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/storyteller.py`

Inline instrumentation (not middleware — middleware can't measure per-phase latencies or SSE body content):
- Create `InteractionLog` at request start
- `log.context_done()` after `retrieve_context()` + `format_context()`
- `log.llm_start()` / `log.first_token()` / `log.count_token()` in the SSE generator
- `log.flush(pool)` after `{"done": True}` is yielded

### 4. Make `_extract_keywords` public (rename only)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py`

Rename `_extract_keywords` → `extract_keywords` (2 lines changed). Allows the storyteller route to log which keywords were searched.

### 5. Create monitoring API endpoints (~55 lines)

**New file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/monitoring.py`

Three endpoints:
- `GET /api/monitoring/interactions?limit=50&world_id=N` — recent interactions list
- `GET /api/monitoring/interactions/{id}` — full detail for one interaction
- `GET /api/monitoring/summary` — aggregate stats (total, avg TTFT, avg latency, error rate)

### 6. Create monitoring dashboard page (~80 lines)

**New file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/monitoring.html`

Same Tailwind dark theme as `index.html`. Shows:
- Summary cards (total interactions, avg TTFT, avg total latency, error count)
- Table of recent interactions (time, query, world, context records, tokens, TTFT, total, status)
- Click to expand full detail
- Auto-refreshes every 30 seconds via `setInterval` + `fetch()`

### 7. Register monitoring routes in app.py (~6 lines)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/app.py`

Include monitoring router, add `GET /monitoring` page route.

---

## File Summary

| File | Action | ~LOC |
|------|--------|------|
| `chronicler/monitoring.py` | Create | +80 |
| `chronicler/api/routes/monitoring.py` | Create | +55 |
| `chronicler/api/templates/monitoring.html` | Create | +80 |
| `chronicler/api/routes/storyteller.py` | Modify | +18 |
| `chronicler/api/app.py` | Modify | +6 |
| `chronicler/storyteller/context.py` | Modify | rename |
| `chronicler/db/schema.sql` | Modify | +16 |

**Total**: ~230 LOC, 3 new files, 4 modified files. No new dependencies.

---

## What This Intentionally Does NOT Do

- No request middleware for read-only endpoints (worlds, stats) — only LLM interactions matter
- No log rotation — one row per question, grows slowly for a dev tool
- No Python `logging` integration — structured data goes to PostgreSQL, not stdout
- No real-time websocket monitoring — 30s poll is sufficient locally

---

## Verification

1. Run schema migration: `psql -U jarvis -d chronicler -c "CREATE TABLE IF NOT EXISTS storyteller_log (...)"`
2. Restart uvicorn: `chronicler serve --port 8080`
3. Open http://localhost:8080, ask a question, verify SSE streaming still works
4. Open http://localhost:8080/monitoring, verify the interaction appears with timing data
5. `curl http://localhost:8080/api/monitoring/summary` — verify aggregate stats
6. `curl http://localhost:8080/api/monitoring/interactions?limit=5` — verify JSON output
