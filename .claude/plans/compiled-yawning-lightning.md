# Stage 4.3: Agentic SQL Storyteller

## Context

Phase 4 Stages 4.1 (event templates) and 4.2 (narrative generators) are complete. Stage 4.3 is the crown jewel: an LLM with autonomous SQL tool use that can explore the Chronicler database and generate narrative responses. This replaces the brittle keyword routing with an LLM that formulates its own queries.

**Existing infrastructure** (reuse, don't rebuild):
- `annotated_schema.py` — 292-line schema reference (~3K tokens), already complete
- `llm.py` — streaming client via LiteLLM/httpx (OpenAI-compatible)
- `prompts.py` — narrator persona prompt + message builder
- `context.py` — keyword routing (33+ routes, becomes fallback)
- `storyteller.py` route — SSE streaming endpoint at `POST /api/ask`
- `monitoring.py` — InteractionLog with 4-phase timing, logs to `storyteller_log` table
- `config.py` — LLM model/URL/temp/max_tokens settings
- LiteLLM config — proxies Ollama models (qwen3-8b, qwen3-32b + nothink variants)

**Key technical constraint**: Qwen3 via Ollama supports OpenAI-compatible tool calling through LiteLLM. Use native tool calling API (not prompt-based SQL extraction).

## Files to Create/Modify

| File | Change | Est. Lines |
|------|--------|-----------|
| `chronicler/storyteller/agentic.py` | NEW: SQLSafetyLayer, SQL_TOOL def, AgenticStoryteller class | ~250 |
| `chronicler/storyteller/llm.py` | Add `stream_tool_completion()` for tool-calling streams | ~60 |
| `chronicler/api/routes/storyteller.py` | Add `POST /api/agentic/ask` endpoint, mode toggle | ~80 |
| `chronicler/config.py` | Add STORYTELLER_MODE, AGENTIC_MODEL, AGENTIC_MAX_ROUNDS | ~5 |
| `chronicler/monitoring.py` | Add sql_queries list, sql_rounds count to InteractionLog | ~30 |
| `tests/test_agentic.py` | NEW: 25+ tests (safety layer, tool def, prompt building, mode toggle) | ~250 |

## Implementation Steps

### Step 1: Config additions (~5 min)

Add to `chronicler/config.py`:
```python
STORYTELLER_MODE = os.environ.get("CHRONICLER_STORYTELLER_MODE", "hybrid")  # keyword|agentic|hybrid
AGENTIC_MODEL = os.environ.get("CHRONICLER_AGENTIC_MODEL", "qwen3-32b-nothink")
AGENTIC_MAX_ROUNDS = int(os.environ.get("CHRONICLER_AGENTIC_MAX_ROUNDS", "5"))
```

Use qwen3-32b-nothink (not 8b) for agentic mode — SQL generation needs the larger model's reasoning capability. The `nothink` variant avoids `<think>` blocks in output.

### Step 2: SQLSafetyLayer + tool definition (`agentic.py`) (~45 min)

New file `chronicler/storyteller/agentic.py`:

**SQLSafetyLayer** class:
- `BLOCKED_KEYWORDS`: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, EXECUTE, DO
- `MAX_ROWS = 50`, `TIMEOUT_SECONDS = 5`
- `validate(sql, world_id)` → `(bool, str)`: Must be SELECT, no blocked keywords, must reference world_id
- `execute(sql, world_id, pool)` → `dict`: Validate, enforce LIMIT, run with `asyncio.wait_for`, return `{rows, count}` or `{error, rows:[]}`
- Uses `pool.acquire()` + `conn.fetch()` (asyncpg native, returns list of Record)

**SQL_TOOL** definition (OpenAI function calling format):
```python
SQL_TOOL = {
    "type": "function",
    "function": {
        "name": "query_database",
        "description": "Execute a read-only SQL query...",
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "A read-only SELECT query. Must filter by world_id."},
                "purpose": {"type": "string", "description": "Brief explanation of what you're looking for."}
            },
            "required": ["sql", "purpose"]
        }
    }
}
```

**build_agentic_prompt(world_id, world_name)**: Combines `SYSTEM_PROMPT` from `prompts.py` with `ANNOTATED_SCHEMA` from `annotated_schema.py`, plus agentic instructions (up to N SQL rounds, cite records, honesty about missing data).

**AgenticStoryteller** class:
- `__init__(self, pool, world_id)` — stores pool + world_id, fetches world_name
- `async def ask(self, query) -> AsyncGenerator[dict, None]` — main agent loop:
  1. Build messages with system prompt + schema + user query
  2. Loop up to AGENTIC_MAX_ROUNDS:
     a. Call LLM with tools=[SQL_TOOL], stream=True
     b. Collect response — if tool_calls present, execute SQL, append results, continue loop
     c. If no tool_calls, yield narrative tokens and break
  3. Yields dicts: `{"type": "token", "data": str}`, `{"type": "progress", "data": str}`, `{"type": "sql", "data": dict}`, `{"type": "done"}`

### Step 3: Tool-calling LLM client (`llm.py`) (~30 min)

Add `stream_tool_completion()` to existing `llm.py`:
- Same httpx streaming client pattern
- Adds `tools` parameter to payload
- Returns full response as dict (content + tool_calls) rather than yielding tokens
- For non-tool responses, yields content tokens like existing `stream_completion`
- Handles the OpenAI delta format for tool calls (incremental `function.arguments` assembly)

Key difference: when tools are provided, we need to collect the FULL response first (to check for tool_calls) before deciding whether to yield tokens or execute tools. Two modes:
- `collect_with_tools()` — returns `(content_str, tool_calls_list)` for multi-round agent loop
- Keep existing `stream_completion()` unchanged for keyword mode

### Step 4: Agentic SSE endpoint (`storyteller.py`) (~30 min)

Add `POST /api/agentic/ask` endpoint:
```python
@router.post("/agentic/ask")
async def agentic_ask(body: AskRequest, request: Request):
    pool = request.app.state.pool
    storyteller = AgenticStoryteller(pool, body.world_id)

    async def event_generator():
        async for event in storyteller.ask(body.query):
            if event["type"] == "token":
                yield {"data": json.dumps({"token": event["data"]})}
            elif event["type"] == "progress":
                yield {"data": json.dumps({"progress": event["data"]})}
            elif event["type"] == "done":
                yield {"data": json.dumps({"done": True})}

    return EventSourceResponse(event_generator())
```

Add mode routing to existing `/ask` endpoint:
- If `STORYTELLER_MODE == "agentic"`, redirect to agentic handler
- If `STORYTELLER_MODE == "hybrid"`, check request body for optional `mode` field
- If `STORYTELLER_MODE == "keyword"`, use existing keyword routing (default)

### Step 5: Monitoring extensions (`monitoring.py`) (~15 min)

Add to InteractionLog:
- `mode: str = "keyword"` — tracking which mode served the request
- `sql_queries: list[dict] = field(default_factory=list)` — `[{sql, purpose, duration_ms, row_count, error}]`
- `sql_rounds: int = 0` — number of agent loop rounds
- `add_sql_query(sql, purpose, duration_ms, row_count, error=None)` method
- Update `flush()` to include new fields (add columns to INSERT or use details JSONB)

### Step 6: Tests (`test_agentic.py`) (~45 min)

25+ tests organized in groups:

**SQLSafetyLayer (10 tests)**:
- Rejects INSERT/UPDATE/DELETE/DROP
- Rejects queries without world_id
- Accepts valid SELECT with world_id
- Enforces LIMIT when missing
- Preserves existing LIMIT
- Rejects non-SELECT (e.g., WITH ... DELETE)
- Handles edge cases (empty string, only whitespace)
- Timeout enforcement (mock slow query)
- Error handling (bad SQL returns error dict)
- Case-insensitive keyword detection

**AgenticStoryteller (8 tests)**:
- build_agentic_prompt includes schema and persona
- build_agentic_prompt includes world_name
- Tool definition has correct structure
- Single-round response (no tool calls) yields tokens
- Multi-round response (tool calls + final answer)
- Max rounds enforcement (doesn't loop forever)
- SQL error in tool call doesn't crash
- Empty query handling

**Mode toggle (4 tests)**:
- keyword mode uses keyword routing
- agentic mode uses agentic handler
- hybrid mode respects request body mode field
- default mode is hybrid

**Integration (3 tests)**:
- Agentic endpoint returns SSE events
- Progress events emitted during SQL execution
- Done event always final

## Verification

1. `pytest tests/test_agentic.py -v` — all 25+ tests pass
2. `pytest tests/` — full suite regression
3. Start server: `cd DwarfCron && .venv/bin/chronicler serve --reload`
4. Test keyword mode (existing):
   ```bash
   curl -X POST http://localhost:8080/api/ask \
     -H "Content-Type: application/json" \
     -d '{"query": "tell me about vampires", "world_id": 1}'
   ```
5. Test agentic mode:
   ```bash
   curl -X POST http://localhost:8080/api/agentic/ask \
     -H "Content-Type: application/json" \
     -d '{"query": "who is the most powerful necromancer?", "world_id": 1}'
   ```
   Should see SSE events with progress indicators ("Querying database...") followed by narrative tokens.
6. Verify monitoring: `SELECT mode, sql_rounds, status FROM storyteller_log ORDER BY id DESC LIMIT 5;`

## What Comes Next

**Stage 4.4 — Monitoring & Observability** (0.5 weeks):
- Enhanced storyteller logging (4-phase latency for agentic mode)
- Monitoring dashboard with auto-refresh
