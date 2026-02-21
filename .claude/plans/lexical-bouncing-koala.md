# Chronicler Storyteller + Web UI — Implementation Plan

## Context

The Chronicler ETL pipeline is complete with 1.65M records across 2 worlds (Namoram, Ormon) in PostgreSQL. The `api/` and `storyteller/` modules are scaffolded but empty. FastAPI and uvicorn are already dependencies. LiteLLM (localhost:4000) serves Qwen3-8B/32B, and MLX (localhost:8000) serves embeddings. All infrastructure is running.

**Goal**: Build a DF-themed dark browser UI with chat-based storytelling, backed by FastAPI + htmx, powered by local Qwen3 via LiteLLM. No external LLM calls.

---

## Architecture

```
Browser (htmx + SSE) ─→ FastAPI ─→ Context Retriever (SQL) ─→ Qwen3 (LiteLLM) ─→ SSE Stream
                                  └→ CDM Database (asyncpg)
```

**LLM**: `qwen3-8b-nothink` via LiteLLM (localhost:4000) — fast inference, no reasoning preamble
**Streaming**: Server-Sent Events for token-by-token narrative delivery
**UI**: htmx for sidebar/navigation, vanilla JS EventSource for chat streaming (htmx SSE extension is unreliable for long streams)

---

## File Plan

### New Files (8 files)

| File | Purpose | ~Lines |
|------|---------|--------|
| `chronicler/api/app.py` | FastAPI app factory, mount routes, Jinja2, startup/shutdown | ~60 |
| `chronicler/api/routes/storyteller.py` | `POST /api/ask` (SSE stream), `GET /api/worlds` sidebar data | ~80 |
| `chronicler/api/routes/world.py` | `GET /api/world/{id}/stats`, entity/HF browse endpoints for sidebar | ~60 |
| `chronicler/api/templates/index.html` | Full-page template: sidebar + chat area + input | ~180 |
| `chronicler/api/templates/partials/message.html` | Chat message bubble (htmx partial) | ~15 |
| `chronicler/storyteller/context.py` | Query CDM for relevant context given a user question | ~120 |
| `chronicler/storyteller/llm.py` | Async LiteLLM client with SSE streaming | ~60 |
| `chronicler/storyteller/prompts.py` | System prompt templates (narrator persona, context formatting) | ~40 |

### Modified Files (3 files)

| File | Change |
|------|--------|
| `chronicler/config.py` | Add LLM model name, temperature, max_tokens settings |
| `chronicler/cli.py` | Add `chronicler serve` command (launches uvicorn) |
| `chronicler/api/__init__.py` | Re-export app for import convenience |

---

## Implementation Steps

### Step 1: Storyteller Backend (`storyteller/`)

**`storyteller/llm.py`** — LiteLLM async client
- Single `stream_completion(messages, model, temperature, max_tokens)` async generator
- Yields content delta strings via httpx SSE streaming to `POST localhost:4000/v1/chat/completions`
- Default model: `qwen3-8b-nothink` (configurable)
- Timeout: 120s

**`storyteller/prompts.py`** — Narrator persona
- System prompt: "You are the Chronicler, narrator of the worlds of Dwarf Fortress..."
- `format_context(records)` — turns CDM query results into structured text for the LLM
- Keeps assembled context under ~3000 tokens to leave room for generation

**`storyteller/context.py`** — CDM context retriever
- `retrieve_context(pool, world_id, query)` → list of formatted context strings
- Strategy: keyword extraction from the user query, then targeted SQL:
  - Search `historical_figures` by name (ILIKE)
  - Search `entities` by name/type
  - Search `sites` by name
  - Pull related events for matched entities/HFs (top 20 by year DESC)
  - Pull event collections (wars, battles) by name
- Returns structured context: "Historical Figure: Urist, dwarf, born year 12, died year 87 in battle..."
- Falls back to world overview (top civilizations, major wars) if no specific matches

### Step 2: FastAPI App (`api/`)

**`api/app.py`** — App factory
- Create FastAPI instance
- Mount Jinja2 templates from `api/templates/`
- Register routes from `routes/storyteller.py` and `routes/world.py`
- On startup: initialize DB pool
- On shutdown: close DB pool
- Serve `GET /` → render `index.html`

**`api/routes/storyteller.py`** — Chat endpoint
- `POST /api/ask` — accepts `{"query": "...", "world_id": 1}`
  - Calls `retrieve_context()` to get CDM context
  - Calls `stream_completion()` with system prompt + context + user query
  - Returns `StreamingResponse` with `text/event-stream` content type
  - Each SSE event: `data: {"token": "..."}` or `data: {"done": true}`

**`api/routes/world.py`** — World data for sidebar
- `GET /api/worlds` — list worlds with summary stats
- `GET /api/world/{id}/stats` — detailed counts per table
- `GET /api/world/{id}/civilizations` — entities with type=civilization
- `GET /api/world/{id}/figures?q=` — search HFs by name (for sidebar typeahead)

### Step 3: Web UI (`api/templates/`)

**`index.html`** — Single-page dark UI
- Tailwind CSS via CDN (dark mode, amber/stone accents for DF theme)
- htmx via CDN (sidebar interactions)
- Layout: fixed left sidebar (240px) + main chat area
- **Sidebar** (htmx-driven):
  - World selector dropdown (loads on page init)
  - World stats (regions, sites, HFs, events counts)
  - Quick links: Civilizations, Top Figures, Recent Wars
  - Each link fetches details via htmx into a detail panel
- **Chat area** (JS EventSource):
  - Message history (scrollable)
  - Input bar at bottom with Send button
  - On submit: append user message bubble, open SSE stream, append tokens to assistant bubble
  - Markdown rendering for response text (simple: bold, italic, lists)
- **Styling**: Dark background (#1a1a2e or similar), amber text accents, stone borders, monospace headers

### Step 4: CLI + Config Updates

**`config.py`** additions:
```python
LLM_MODEL = os.environ.get("CHRONICLER_LLM_MODEL", "qwen3-8b-nothink")
LLM_TEMPERATURE = float(os.environ.get("CHRONICLER_LLM_TEMP", "0.8"))
LLM_MAX_TOKENS = int(os.environ.get("CHRONICLER_LLM_MAX_TOKENS", "2048"))
```

**`cli.py`** — add `serve` command:
```python
@cli.command()
@click.option("--host", default="127.0.0.1")
@click.option("--port", default=8080, type=int)
def serve(host, port):
    """Launch the Chronicler web UI."""
    import uvicorn
    uvicorn.run("chronicler.api.app:app", host=host, port=port, reload=True)
```

### Step 5: Database Query Optimization

Add indexes for the storyteller's access patterns (if not already present):
- `CREATE INDEX IF NOT EXISTS idx_hf_name_trgm ON historical_figures USING gin (name gin_trgm_ops)` — fuzzy name search
- `CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON entities USING gin (name gin_trgm_ops)` — fuzzy entity search
- `CREATE INDEX IF NOT EXISTS idx_sites_name_trgm ON sites USING gin (name gin_trgm_ops)` — fuzzy site search
- These require `CREATE EXTENSION IF NOT EXISTS pg_trgm` first

Also add composite indexes for common join patterns:
- `idx_events_hf1_year` on `history_events(hf_id_1, year)` — HF event timeline
- `idx_events_site_year` on `history_events(site_id, year)` — site event timeline

---

## Dependencies

**New pip packages** (add to pyproject.toml):
- `jinja2` — template rendering (FastAPI optional dep)
- `sse-starlette` — SSE response helper for FastAPI
- `python-multipart` — form data parsing (FastAPI optional dep)

No npm, no node, no build step. htmx and Tailwind loaded from CDN.

---

## Verification

1. `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/pip install -e .`
2. `chronicler serve` — should start on http://127.0.0.1:8080
3. Browser opens to dark-themed UI with world selector
4. Select "Ormon" → sidebar populates with stats
5. Type "Tell me about the dwarven civilizations" → SSE stream returns narrative
6. Type a specific HF name → context retriever finds the figure and related events
7. Verify streaming works (tokens appear progressively, not all at once)
