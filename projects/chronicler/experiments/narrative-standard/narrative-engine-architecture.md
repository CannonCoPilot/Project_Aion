# Narrative Engine Architecture — Phase 3 Pre-Development Reference

**Date:** 2026-03-04
**Status:** Design exploration (not yet implemented)
**Context:** Follows the Narrative Gold-Standard Experiment (2026-03-03) and prompt
template design (v1.0 + v2.0). Documents the gap analysis between the current
Chronicler chat system and the target autonomous narrative architecture.

---

## 1. Current Architecture (as of Phase 2 completion)

### Data Flow

```
User query
  → Frontend (storyteller.js) sends POST /api/storyteller/chat
  → Backend calls build_storyteller_context(query, pool, world_id)
    → search_entities() — single PostgreSQL full-text search, ~10 results
  → Results formatted as markdown text, injected into system prompt
  → litellm.acompletion(messages, stream=True) — text-only, no tool-use
  → SSE stream: {"type":"chunk","content":"..."} → {"type":"done"}
  → Frontend renders markdown in chat bubble
```

### Key Files

| File | Role | Lines |
|---|---|---|
| `chronicler/storyteller/llm.py` | LiteLLM streaming client (text-only) | ~95 |
| `chronicler/storyteller/context.py` | Single-shot search → format as text | ~85 |
| `chronicler/storyteller/prompts.py` | Static system prompt with `{context}` injection | ~65 |
| `chronicler/api/routes/storyteller.py` | `/api/storyteller/chat` endpoint, SSE streaming | ~72 |
| `chronicler/api/static/js/storyteller.js` | Chat UI, client-side conversation history | ~130 |
| `chronicler/config.py` | Singleton config (model, temp, max_tokens, etc.) | ~80 |

### Capabilities

- Multi-turn conversation (client sends full history each request)
- SSE streaming with simple markdown rendering
- Model: `ollama/qwen3:32b` via direct Ollama API (localhost:11434)
- Context: single FTS search against `entities` table, ~10 results, ~12K chars max
- No tool-use / function-calling infrastructure anywhere in the codebase

### Limitations

- **Shallow context retrieval:** One search query, one table, ~10 results. Cannot
  follow relationship chains, build event timelines, or cross-reference entities.
- **No SQL access for the LLM:** The LLM never sees or writes SQL. All data
  retrieval is pre-canned in Python.
- **Low max_tokens (2048):** Insufficient for full narratives (experiment showed
  3,000–10,000 words needed for standard biographies).
- **No fact grounding:** The LLM receives unstructured text context and narrates
  freely. No fact registry, no annotation system, no self-validation.

---

## 2. Target Architecture (v2.0 Autonomous Narrative Engine)

### Data Flow

```
User query
  → Frontend sends POST /api/storyteller/chat
  → Backend builds messages with v2.0 system prompt (includes CDM schema reference)
  → Tool-use loop begins:
    ┌─→ litellm.acompletion(messages, tools=[query_database], stream=True)
    │   → LLM returns tool_call: query_database(sql, purpose)
    │   → Backend executes SQL (with safety guards)
    │   → Backend appends tool result to messages
    │   → SSE: {"type":"tool_call","purpose":"..."} for frontend progress
    └─── Repeat (8–25 iterations) until LLM returns text
  → LLM streams fact registry + narrative + appendix + annotations + coverage
  → SSE: {"type":"chunk","content":"..."} → {"type":"done"}
  → Frontend renders with section awareness and research progress indicators
```

### What the LLM Does Autonomously

| Phase | Action |
|---|---|
| 1. Identify | Parse user query → determine subject type, name, focus |
| 2. Extract | Call query_database ~6 times for core records (HF, links, positions, works) |
| 3. Timeline | Call query_database for all events mentioning the subject |
| 4. Expand | Call query_database for referenced entities, sites, regions |
| 5. Derive | Compute ages, durations, statistics, phase boundaries in-context |
| 6. Register | Output numbered fact registry (F001–FNNN) |
| 7. Narrate | Output narrative + appendix + annotated version + coverage matrix |

---

## 3. Gap Analysis: What Needs to Change

### 3.1 New File: `storyteller/tools.py`

**Purpose:** Tool definition schemas and SQL execution with safety guards.

**Contains:**
- `TOOL_SCHEMAS`: JSON tool definition for litellm's `tools` parameter
- `execute_query_database(pool, world_id, sql, purpose)`: validates SELECT-only,
  injects `$WORLD_ID`, enforces row limit (500), enforces timeout (5s), returns
  JSON rows

**Design decision — raw SQL vs. high-level tools:**

| Approach | Pros | Cons |
|---|---|---|
| **Raw SQL** (`query_database`) | Maximum flexibility; LLM can write any query; one tool handles everything | Requires LLM to write valid SQL with JOINs, JSONB operators; error-prone for smaller models |
| **High-level tools** (`get_hf`, `get_events_for`, `get_entity_members`, etc.) | LLM just picks which tool to call; no SQL errors; easier for smaller models | Need to pre-define a tool for each query pattern; less flexible for ad-hoc exploration |
| **Hybrid** (both) | LLM uses high-level tools for common patterns, falls back to raw SQL for edge cases | More tool schemas to maintain; LLM must decide which level to use |

**Recommendation:** Start with **high-level tools** for reliability with Qwen3-32B.
Add raw SQL as an advanced fallback once tool-use quality is validated. The high-level
tools are essentially the SQL queries from the v2.0 prompt template, wrapped in
named functions.

**Candidate high-level tools:**

```
get_historical_figure(name_or_id)     → Core HF record + skills + flags
get_hf_relationships(hf_id)          → hf_links JOIN historical_figures
get_hf_entity_memberships(hf_id)     → hf_entity_links JOIN entities
get_hf_positions(hf_id)              → hf_position_links JOIN entity_positions
get_hf_site_links(hf_id)            → hf_site_links JOIN sites
get_events_for(hf_id, year_range?)   → history_events WHERE hf involved
get_written_works(author_hf_id)      → written_contents for author
get_entity(name_or_id)               → Core entity record
get_site(name_or_id)                 → Core site record
get_artifacts_for(hf_id)             → artifacts created or held
lookup_entities(id_list)             → Bulk name/type lookup for referenced entities
lookup_hfs(id_list)                  → Bulk name/race/dates for referenced HFs
```

### 3.2 Modify: `storyteller/llm.py`

**Current:** Single `litellm.acompletion` call, yields text chunks only.

**Target:** Tool-use loop that:
1. Calls `litellm.acompletion` with `tools` parameter
2. Accumulates streaming chunks
3. Detects tool_call in response
4. Yields a tool_call event (for SSE progress)
5. Executes the tool via `tools.py`
6. Appends tool result as a `tool` role message
7. Calls `litellm.acompletion` again with updated messages
8. Repeats until LLM returns pure text (the narrative output)
9. Yields text chunks as before

**Safety:** Enforce a max_tool_calls limit (default 30) to prevent infinite loops.

### 3.3 Modify: `api/routes/storyteller.py`

**Current SSE protocol:**
```
data: {"type": "chunk", "content": "<text>"}
data: {"type": "done"}
```

**Extended SSE protocol:**
```
data: {"type": "status", "phase": "research", "message": "Searching for historical figure..."}
data: {"type": "tool_call", "tool": "get_historical_figure", "purpose": "Core HF record"}
data: {"type": "tool_result", "tool": "get_historical_figure", "rows": 1}
data: {"type": "status", "phase": "writing", "message": "Composing narrative..."}
data: {"type": "chunk", "content": "<text>"}
data: {"type": "done", "stats": {"tool_calls": 14, "facts": 278}}
```

The route orchestrates the tool-use loop from `llm.py` and translates tool events
into SSE messages.

### 3.4 Rewrite: `storyteller/prompts.py`

**Current:** `get_system_prompt(context)` — injects pre-fetched text into a generic
narrator prompt.

**Target:** `get_system_prompt(world_name, world_id)` — returns the v2.0 autonomous
prompt with:
- Chronicler persona and voice guidelines
- Available tools and their descriptions
- CDM schema reference (tables, columns, key relationships)
- 7-phase methodology (identify → extract → timeline → expand → derive → register → narrate)
- Narrative guidelines (voice, structure, factual discipline)
- Output format specification (5 sections: registry, narrative, appendix, annotated, coverage)
- Anti-hallucination guardrails

No `{context}` injection — the LLM fetches its own context via tools.

### 3.5 Modify: `api/static/js/storyteller.js`

**Minimal changes:**
- Handle `status` and `tool_call` SSE events → show a research progress indicator
  (e.g., subtle "Researching..." with a count of queries made)
- Handle `tool_result` events → optionally show query count
- Differentiate research phase (show progress) from writing phase (stream text)
- Exclude tool_call/tool_result messages from visible conversation history

**Optional enhancements (later):**
- "Transparent research" toggle: show the LLM's queries and results in a collapsible panel
- Section-aware rendering: detect "Section 1: Fact Registry" etc. and render with
  different styling
- Fact tag rendering: parse `[FACT: F###]` tags in annotated output and highlight them

### 3.6 Modify: `config.py`

Add to `ChroniclerConfig`:

```python
storyteller_max_tool_calls: int = 30         # Safety limit per conversation turn
storyteller_query_timeout: float = 5.0       # Per-query SQL timeout (seconds)
storyteller_query_row_limit: int = 500       # Max rows per query result
storyteller_max_tokens: int = 8192           # Increase from 2048 for full narratives
storyteller_narrative_mode: str = "autonomous"  # "autonomous" (v2.0) or "contextual" (v1.0)
```

### 3.7 No Longer in Pipeline: `storyteller/context.py`

The `build_storyteller_context()` function is no longer called by the storyteller
route in v2.0 mode. The LLM does its own context retrieval via tools.

The file and `search_entities()` remain available for the Explorer module and for
a potential v1.0 "contextual" mode fallback.

---

## 4. Model Considerations

### Qwen3-32B Tool-Use Capability

The current model (`ollama/qwen3:32b`) supports function calling. Key questions
to validate during implementation:

1. **SQL generation quality:** Can Qwen3-32B write valid PostgreSQL with JOINs,
   JSONB operators (`details::text LIKE`, `details->>'field'`), and proper
   `WHERE world_id = $WORLD_ID` filtering? If not, use high-level tools instead.

2. **Phase discipline:** Does the model follow the 7-phase methodology in order,
   or does it jump ahead to narrating before finishing research? The prompt needs
   explicit phase gates ("Do not proceed to Phase 7 until you have output the
   fact registry in Phase 6").

3. **Stop condition:** Does the model reliably stop calling tools when it has
   enough data, or does it over-query? The max_tool_calls safety limit handles
   runaway loops, but ideally the model self-regulates.

4. **Context window pressure:** Qwen3-32B has 32K context. The v2.0 system prompt
   (~3K tokens) + query results (~5K–15K) + fact registry output (~2K–5K) +
   narrative output (~4K–8K) totals ~15K–30K tokens. Tight but feasible for
   standard-length narratives. Extended narratives may need the `brief` setting
   or a context compression step (discard raw query results after compiling
   the registry).

### Alternative Models

If Qwen3-32B struggles with tool-use:
- **Qwen3-32B with high-level tools** (no raw SQL) — likely sufficient
- **Claude via API** (Haiku/Sonnet) — excellent tool-use, higher cost
- **Local model with RAG fallback** — use v1.0 pipeline for the research phase,
  v2.0 prompt for just the narration phase

---

## 5. Hybrid Architecture (Recommended for Production)

The ideal production system runs both v1.0 and v2.0 in parallel:

```
User query
  ├── If subject has pre-computed fact registry (cached):
  │     → v1.0 pipeline: inject registry → narrate (fast, cheap, deterministic)
  │
  └── If no cached registry (ad-hoc query):
        → v2.0 autonomous: LLM queries DB → builds registry → narrates (flexible, slower)
```

Both paths produce the same output format (fact registry + narrative + annotations),
so the validation pipeline and frontend rendering are shared.

Pre-computation targets for v1.0 caching:
- Top 100 HFs by prominence_score
- All sites with >10 events
- All entities of type "civilization"
- All wars/battles with >5 events

---

## 6. Estimated Implementation Scope

| Component | Effort | Est. Lines | Dependencies |
|---|---|---|---|
| `tools.py` (new) | Medium | ~150 | asyncpg pool |
| `llm.py` (tool loop) | Medium | ~100 modified | litellm tool-use API |
| `routes/storyteller.py` (SSE) | Small | ~50 modified | tools.py, llm.py |
| `prompts.py` (v2.0 prompt) | Large (content) | ~300 | CDM schema knowledge |
| `storyteller.js` (progress UI) | Small | ~40 new | SSE protocol |
| `config.py` (new settings) | Trivial | ~10 | — |
| Testing & validation | Medium | ~200 | Running model, DB |
| **Total** | | **~850** | |

---

## 7. Key References

| Document | Path |
|---|---|
| Prompt Template v1.0 (pipeline) | `experiments/narrative-standard/narrative-prompt-template.md` |
| Prompt Template v2.0 (autonomous) | `experiments/narrative-standard/narrative-prompt-template-v2.md` |
| Gold-Standard Experiment Methodology | `experiments/narrative-standard/methodology.md` |
| Fact Registry (278 facts, Minaro) | `experiments/narrative-standard/fact-registry.md` |
| Comparative Analysis (3-model) | `experiments/narrative-standard/comparative-analysis.md` |
| Narrative Outputs | `experiments/narrative-standard/narrative-{haiku,sonnet,opus}.md` |
| Phase 3 PRD | `reports/phases/phase-3-narrative-engine.md` |
| CDM Schema | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Current Storyteller Code | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/` |

---

## 8. Open Design Decisions (for Phase 3 kickoff)

1. **Raw SQL vs. high-level tools vs. hybrid** — Which tool abstraction level
   to start with. Recommendation: high-level tools first, raw SQL later.

2. **Fact registry as output section vs. hidden intermediate** — Should the user
   see the fact registry in the chat, or only the narrative? The experiment
   included it; production might hide it behind a toggle.

3. **Streaming granularity during research** — How much tool-use detail to show
   the user. Options: nothing (just "Researching..."), tool names, full SQL, or
   result previews.

4. **Conversation continuity** — After the LLM produces a narrative, can the user
   ask follow-up questions that reuse the same fact registry? This requires
   keeping the tool results in conversation history.

5. **Cache strategy** — When/how to pre-compute fact registries for common subjects.
   Options: background job, on-demand with caching, manual trigger.

6. **Annotation rendering** — How to display `[FACT: F###]` tags in the UI.
   Options: inline colored highlights, hover tooltips, toggleable overlay,
   or hidden (only visible in "transparency mode").

---

*Narrative Engine Architecture v1.0 — Phase 3 Pre-Development Reference*
*2026-03-04*
