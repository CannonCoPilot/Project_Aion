# Component Research: AI Dwarf Fortress Storyteller (Narrative Engine)

**Date**: 2026-02-25
**Component**: Main Component 3 of 6 -- AI Storyteller / Narrative Engine
**Sources**: planning-history.md, df-ai-research.md, narrator-weblegends-research.md, legendsviewer-next-research.md, legends-browsers-research.md, dfhack-infrastructure-research.md, research-synthesis.md, plus live source code from `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/`
**Scope**: Every feature, requirement, design detail, implementation approach, prompt pattern, scoring formula, and technical specification related to the AI Storyteller component.

---

## 1. Feature Inventory

### 1.1 Conversational World Query Engine

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-01 | Natural language world Q&A | Ask any question about DF world history and get narrative answers | Keyword extraction -> categorical routing -> SQL queries -> context assembly -> LLM prompt -> SSE stream | df-narrator (scoring for context selection), weblegends (event rendering) | L |
| F-02 | Dual-tier context architecture (HISTORICAL + LIVE) | Answers weave legends data with current fortress state | System prompt distinguishes two data tiers; context records tagged by category; LLM instructed to connect historical and live data | None (Chronicler original) | M |
| F-03 | SSE streaming responses | Real-time token-by-token display; no waiting for full response | `sse_starlette.sse.EventSourceResponse`, async generator yields `{"data": {"token": ...}}` per chunk | None (standard web pattern) | S |
| F-04 | World-aware multi-world support | Query different worlds without confusion | `world_id` parameter on every query; world name fetched and injected into prompt context | LegendsViewer-Next (multi-world bookmarks) | S |
| F-05 | Confidence signaling | User knows when data is thin vs. rich | Count context records at retrieval time; prepend density note: "<3 records = caution warning, >10 = rich context" | None (Chronicler original) | S |
| F-06 | "No record" honesty | Avoids hallucination; builds trust | System prompt: "If the records do not contain information, say so honestly -- 'The annals hold no record of such a thing' -- rather than inventing details." | None (prompt engineering) | S |
| F-07 | Categorical routing (23 routes) | Questions about "deities", "vampires", "wars" find correct data even when no name matches | `_CATEGORY_ROUTES` dict: keyword -> (query_type, parameter); routes: hf_flag (deity/vampire/necromancer/werebeast/ghost), hf_race (megabeast/dragon/titan/forgotten), entity_type (civilization/religion), collection_type (war/battle), artifacts, written_contents, live_units, live_squads, live_armies, live_events, live_reports | df-narrator (category classification) | M |
| F-08 | Name-based ILIKE search fallback | Find entities by partial name match | `WHERE name ILIKE '%keyword%'` on historical_figures, with `unaccent()` extension for diacritic-tolerant search | LegendsBrowser2 (autocomplete search) | S |
| F-09 | World overview fallback | Always returns something, even for vague queries | `_world_overview()` function: summary stats (HF count, event count, entity count, site count) as baseline context | df-narrator (world summary section) | S |

### 1.2 Agentic Storyteller (Target v1.0)

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-10 | Agentic SQL tool use | LLM autonomously explores database to find evidence before answering; handles novel questions keyword routing cannot | LLM receives schema summary (~2K tokens) + SQL tool definition (read-only); emits SQL tool calls; tool executor validates, executes (max 50 rows), returns results; up to 5 rounds | None (Chronicler original) | XL |
| F-11 | Iterative data exploration | Multi-hop reasoning: "who killed the most dwarves?" requires aggregate queries the LLM discovers | LLM decides what to query -> SQL tool call -> analyze results -> may issue another query -> compose final response with evidence citations | None (Chronicler original) | XL |
| F-12 | Database schema summary in system prompt | LLM knows table structure, column names, relationships | `annotated_schema.py` generates compressed schema summary for prompt injection; ~2K tokens covering 40+ tables | None (Chronicler original) | M |
| F-13 | SQL tool safety layer | Prevent accidental data modification; limit resource consumption | Read-only SQL: `SET TRANSACTION READ ONLY`; keyword blocklist (DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE); enforced LIMIT cap (50 rows); per-query timeout (5s); validated table/column names | None (standard security pattern) | M |
| F-14 | Denizen registry summary in prompt | LLM knows "who matters" in the fortress | Top denizens by NVS score injected as context; `fortress_denizens` table sorted by `narrative_value DESC` | df-narrator (figure scoring for subset selection) | M |
| F-15 | Evidence citations in responses | User can verify claims; builds trust | LLM instructed to cite source data (table, ID, year) when making claims; responses include "(Legends, Year 125)" or "(Live data)" tags | None (prompt engineering) | S |
| F-16 | Config toggle: keyword vs. agentic mode | Gradual rollout; fallback for reliability | Config flag `STORYTELLER_MODE = "keyword" | "agentic"`; keyword routing retained as fast fallback | None (deployment strategy) | S |
| F-17 | Hidden tool calls in SSE stream | User sees only narrative, not raw SQL | Tool call tokens filtered from SSE stream; only final narrative tokens sent to client | None (UX pattern) | S |

### 1.3 Character Profile & Biography Generation

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-18 | Character profile generation | Rich biography for any HF or unit | Given figure_id: retrieve HF + unit records, pull all history_events (chronological), pull relationship graph (2 hops), pull artifacts, assemble "character brief" JSON, inject into LLM with persona prompt | weblegends (figure page structure), LV-Next (HF detail), df-narrator (scored output) | L |
| F-19 | Unified Person view (Unit + HF merge) | Complete picture of fortress dwarf: historical legend AND current state | `chronicler/storyteller/person.py`: merge Unit data (live, fresher) with HF data (historical depth); 6 rules: start with Unit, overlay HF, conflict resolution by recency/authority, personality Unit-only, events from both sources, embark flag | None (Chronicler original) | L |
| F-20 | Personality-driven voice emulation | Each dwarf "speaks" with personality-consistent voice | Map `soul_data` (50 personality traits, beliefs, goals, needs) to narrative personality dimensions; derive voice description; inject as character voice prompt | df-ai (personality-based decision context) | M |
| F-21 | Relationship traversal on HF match | See family, enemies, allies, positions | Query `hf_links` for spouse/children/parents, `hf_entity_links` for civ memberships and positions, `hf_site_links` for associated sites; enriched context for LLM | weblegends (figure page: Related Figures/Entities/Sites sections) | M |
| F-22 | Emotion/zone integration in unit queries | "Why is Urist stressed?" -> connects emotions to context | `_build_emotion_map()` matches latest `dwarf_emotions` probe to unit IDs; `_build_zone_owner_map()` resolves owner -> zone name; system prompt instructs LLM to connect dots | None (Chronicler original) | M |
| F-23 | HF-to-unit cross-reference | Seamless navigation between historical record and live state | `_retrieve_live_units()` JOINs `units.hist_fig_id` to `historical_figures.id`; if alive in fortress, append live status to context | None (Chronicler original) | S |

### 1.4 War Chronicles & Civilization Histories

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-24 | War narrative generation | "Tell me about the War of Burning" -> multi-paragraph war story | Query `history_event_collections` WHERE type='war'; retrieve sub-collections (battles, sieges); resolve entity names (attacker/defender); pull individual events for key battles; LLM generates narrative with chronological arc | weblegends (war_field_battle rendering), LB2 (war collection detail), df-narrator (conflict scoring) | L |
| F-25 | Battle detail rendering | Vivid battle accounts with named generals, attackers, defenders | Field battle events: "[attacker_civ] attacked [defender_civ] in [region]. [general_a] led the attack, and the defenders were led by [general_b]" | weblegends (`war_field_battle.cpp`), LB2 (`collection.html`) | M |
| F-26 | Civilization rise-and-fall narratives | "What happened to the Elven kingdom?" -> political history | Query entity events chronologically: created, site_taken_over, alliance_formed, overthrown, dissolved; pull leader succession from `hf_position_links`; LLM synthesizes into narrative | LV-Next (entity detail: Leaders, Sites, Wars tabs), LB2 (entity detail) | L |
| F-27 | War name resolution | "The War of Clashing" rather than "collection #4521" | JOIN collection queries to resolve entity IDs -> names in 3 locations; enriched event text for LLM | weblegends (entity name resolution in all events) | S |

### 1.5 Event Narrative Engine

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-28 | Per-type event narrative templates (122+ types) | Each event type has appropriate prose, not generic "something happened" | Template bank covering all 122 LB2-handled event types; graceful LLM fallback for remaining 19; template pattern: `Event (CDM row) -> Context (target entity + related entities) -> Template (per-type prose) -> HTML (with entity links)` | weblegends (94 per-event .cpp files), LB2 (132 `Html()` implementations) | XL |
| F-29 | Death cause rendering (50+ variants) | "was beheaded" vs. generic "died" -- massive narrative quality improvement | Complete death cause taxonomy: OLD_AGE, SHOT, BLEED, DROWN, SUFFOCATE, MAGMA, DRAGONFIRE, CAVEIN, DRAWBRIDGE, BEHEAD, CRUCIFY, BURN_ALIVE, HACK_TO_PIECES, DRAIN_BLOOD, LEAPT_FROM_HEIGHT, INFECTION, and 35+ more; each with weapon info, slayer identity with race, age at death | weblegends (`hist_figure_died.cpp` -- 40+ variants), LB2 (`HfDied` event) | L |
| F-30 | Perspective-aware event rendering | HF #123's page: events about them use "the dwarf" or pronouns, not their name | Pass entity ID as context; context-aware linking: `event_link(s, context, entity)` suppresses link for context entity; relational pronouns ("his wife") instead of full name | weblegends (`event_context` pattern), LB2 (HfId context -> relational pronouns) | M |
| F-31 | Circumstance/reason rendering | "after the death of [HF]", "as a symbol of everlasting peace" -- WHY events happened | Reasons: `glorify_hf`, `artifact_is_heirloom`, `as_a_symbol_of_everlasting_peace`, `artifact_is_symbol_of_entity_position`; Circumstances: `Death`, `Prayer`, `DreamAbout`, `Dream`, `Nightmare`, `FromAfar` | weblegends (`helpers/circumstance.cpp`), LB2 (events.go) | M |
| F-32 | Cross-linked event narratives | Every entity name in event text is clickable -> navigate to that entity | Server-generated HTML with `<a>` tags for each entity reference; entity type determines URL pattern; click navigates to detail view | weblegends (`link()` function), LB2 (Go template `{{ hf .Id }}`), LV-Next (`ToLink()` methods) | M |
| F-33 | Interaction text from game raws | Vampire biting, necromantic raising get natural language from DF data | `hf_does_interaction` events: pull `hist_string_1` and `hist_string_2` from interaction definitions in game raw data via DFHack | weblegends (`hf_does_interaction.cpp`) | M |
| F-34 | Missing event fallback | Unhandled event types still get some rendering | Fall back to DF's own `getSentence()` method via DFHack; or raw field dump with `<abbr>` tag wrapping event type/ID | weblegends (`do_event_missing()`) | S |
| F-35 | Event payload enrichment | Names instead of IDs, natural language instead of raw data | JOINs to resolve hf_id -> name, site_id -> name; natural-language templates for 6+ event types; `_summarize_details()` for JSONB fields | None (Chronicler enrichment pipeline) | M |
| F-36 | DF calendar formatting | "On the 15th of Limestone, year 125" instead of "year=125, seconds72=345600" | `seconds72 // 1200 + 1` -> day_of_year; `(doy-1)//28+1` -> month; months: Granite through Obsidian; seasons: early/mid/late spring/summer/autumn/winter | df-narrator (`format_time()`), weblegends (event preamble), LB2 (season display) | S |
| F-37 | Age at death calculation with fractions | "died at the age of 127 and a half" | `age_years_days(born_year, born_seconds, died_year, died_seconds)` -> fractional display: 1/4, 1/2, 3/4 if days >= 28*3, 28*6, 28*9 | weblegends (HTML fraction entities: `&frac14;`, `&frac12;`, `&frac34;`) | S |
| F-38 | Temporal context in event rendering | "In 125 on the 3rd of Granite," or "On the 3rd of Granite," for same-year continuation | Event wrapper prepends temporal context; suppresses year if same as previous event in sequence | weblegends (event() wrapper function) | S |

### 1.6 Scoring, Ranking & Entity Selection

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-39 | Historical Figure importance score | LLM focuses on important figures, not noise | `LEAST(event_count * 2, 500) + kill_count * 15 + is_vampire * 80 + is_necromancer * 100 + is_deity * 120 + is_force * 90 + is_werebeast * 70 + LEAST(hf_links * 3, 100) + leadership_positions * 20 + artifacts_held * 30 + LEAST(site_links * 5, 50) + LEAST(entity_links * 3, 60) + death_recorded * 5` | df-narrator (`score_figure()` lines 51-70) | M |
| F-40 | Site importance score | Identify historically significant locations | `events + deaths * 2 + event_collections * 5 + structures * 3` | df-narrator (`score_site()` lines 73-78) | S |
| F-41 | Conflict importance score | Rank wars/battles by narrative weight | `deaths * 3 + battles * 10 + sites_involved * 5 + duration_years` | df-narrator (`score_conflict_inline()` lines 81-87) | S |
| F-42 | Artifact importance score | Find narratively interesting artifacts | `events * 10 + unique_holders * 20 + lost_or_stolen(30) + named(50)` | df-narrator (`score_artifact_inline()` lines 90-111) | S |
| F-43 | Narrative Value Score (NVS) for denizens | Fortress "who matters" ranking, updated per watcher cycle | `fortress_denizens.narrative_value` column computed from: event count, kills, relationships, positions, artifacts, type flags; enables O(1) sort for LLM context selection | df-narrator formulas adapted for live fortress context | M |
| F-44 | Rivalry detection (co-appearance) | Surface meaningful figure pairs for narrative | Scan all events mentioning a figure's hfid; count co-appearances of other figure IDs in the same event (using HF_FIELDS set); top-10 rivals per figure; top 5 rivals for pair ranking | df-narrator (`find_rivals_inline()`) | M |
| F-45 | Top-N entity selection for LLM context | Context window budget: send only the most important entities | `--top-figures N` (default 10), `--top-sites N` (10), `--top-wars N` (5), `--top-artifacts N` (10); selection by importance score; configurable cutoffs | df-narrator (CLI args for top-N selection) | S |
| F-46 | Megabeast detection | Correctly identify dragons, titans, etc. | Race must be in hardcoded set: `{DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN}` | df-narrator (line 548-550) | S |
| F-47 | Vampire/Necromancer/Werebeast detection | Correctly flag supernatural figures | Vampire: any `active_interaction` containing "VAMPIRE" (case-insensitive); Necromancer: "NECROMANCER" or "RAISE"; Werebeast: "WEREBEAST" | df-narrator (lines 545-546), df-structures (`histfig_flags`) | S |

### 1.7 Knowledge Horizon Integration

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-48 | Dynamic visibility masking | LLM only "knows" what the fortress plausibly knows -- immersive, prevents meta-gaming | `knowledge_horizon` table: `(world_id, entity_type, entity_id, visible BOOLEAN)`; PostgreSQL views filter through visibility predicate; storyteller queries visible views instead of base tables | None (Chronicler original) | XL |
| F-49 | Geographic scope masking | Only nearby regions visible unless revealed by migrants/caravans/raids | Always visible: fortress region + adjacent; revealed by: migrant origin, caravan source, raid target | None (Chronicler original) | L |
| F-50 | Civilization scope masking | Only contacted civilizations visible | Always visible: parent civ structure; revealed by: diplomatic contact, wars, raids | None (Chronicler original) | L |
| F-51 | Individual scope masking | Only fortress inhabitants + direct family visible | Always visible: all fortress inhabitants + direct family; revealed by: arrival, family connection, organizational overlap | None (Chronicler original) | L |
| F-52 | 7 Visibility Caveats | Fine-grained masking rules | CAV-001: Org membership propagation (cults=full, squads=chain-of-command, guilds=same-site, religion=nearby, civ=NO full propagation); CAV-002: Civ nobles always visible; CAV-003: Previous residence knowledge; CAV-004: Starting dwarf background generation; CAV-005: Family chain (depth 1=always, 2=if alive, 3+=masked); CAV-006: Event-based revelation; CAV-007: LLM inference restrictions | None (Chronicler original design) | XL |
| F-53 | Event-based revelation (CAV-006) | Knowledge grows organically as game events occur | War declaration reveals enemy civ; caravan arrival reveals source civ; migrant wave reveals origin site; raid return reveals target site; artifact acquisition reveals artifact history | None (Chronicler original) | L |
| F-54 | LLM inference restrictions (CAV-007) | LLM treats horizon as in-world limitation, not metadata filter | System prompt: "Do NOT infer events or relationships not present in unmasked data. Treat the Knowledge Horizon as an in-world limitation." | None (prompt engineering) | S |
| F-55 | Phased Knowledge Horizon rollout | Ship incrementally; don't block v1.0 on full KH | Phase 1: Denizen registry as starting point; Phase 2: View-based HF masking (visible if denizen or 1-hop); Phase 3: Geographic masking; Phase 4: Full KH with 7 caveats | None (implementation strategy) | -- |

### 1.8 Monitoring & Observability

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-56 | Per-interaction LLM logging | Diagnose quality issues, track latency, measure usage | `storyteller_log` table: query, world, keywords, context_stats, model, temperature, tokens_streamed, response_chars, status, error; four-phase latency: context retrieval, TTFT, LLM streaming, total wall time | None (Chronicler original) | M |
| F-57 | Monitoring dashboard (`/monitoring`) | Visual overview of storyteller health | Summary cards (total queries, avg latency, error rate); recent interactions table; click-to-expand detail; auto-refresh every 30 seconds | None (Chronicler original) | M |
| F-58 | Three monitoring API endpoints | Programmatic access to storyteller metrics | `GET /api/monitoring/interactions?limit=50&world_id=N`; `GET /api/monitoring/interactions/{id}`; `GET /api/monitoring/summary` | None (standard REST pattern) | S |
| F-59 | InteractionLog instrumentation | Zero user-facing latency impact; inline capture | `InteractionLog` class: `.start()`, `.context_done(records, text)`, `.llm_start()`, `.first_token()`, `.count_token(token)`, `.finish(status, error)`, `.flush(pool)` | None (Chronicler original) | S |

### 1.9 Template vs. LLM Hybrid Rendering

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-60 | Template-based fast path | Instant rendering for event lists, entity summaries without LLM overhead | Deterministic template per event type filled with entity field values; used for explorer event tables, non-chat contexts; pattern: `Event -> Template -> HTML` | df-narrator (pure template output), weblegends (94 template handlers), LB2 (132 `Html()` methods) | L |
| F-61 | LLM-enhanced narrative path | Rich, non-repetitive prose for chat responses and featured content | Template output used as LLM input scaffold; LLM enriches with atmospheric prose, connections, character voice; pattern: `Event -> Context -> LLM prompt (with template scaffold) -> Narrative` | None (Chronicler LLM layer) | M |
| F-62 | Proactive narrative engine (post-v1.0) | Storyteller volunteers interesting observations without being asked | Watch for high-NVS events (deaths of important figures, war declarations, artifact creations); generate narrative alerts; push via WebSocket or notification system | None (Chronicler original long-term) | XL |

---

## 2. LLM Architecture

### 2.1 Model Selection

| Parameter | Current Value | Target Value | Notes |
|-----------|--------------|-------------|-------|
| Primary Model | Qwen3-8B via LiteLLM | Qwen3-8B (dev) / Claude API (production) | Local for development; Claude for production Q&A quality |
| Model Backend | Ollama (local) | Ollama + Claude API | LiteLLM proxy supports both backends transparently |
| Temperature | 0.8 | 0.8 (configurable) | Higher for narrative richness; lower for factual queries |
| Max Tokens | 2048 | 2048 (configurable) | Sufficient for most narrative responses |
| Streaming | SSE via `sse_starlette` | Same | Token-by-token streaming |
| Embedding Model | qwen3-embedding:4b via MLX | Same | 2560-dim; used for future pgvector retrieval |

**Stack Decision Matrix (from planning-history.md)**:
- LLM backend: Ollama (local) + Claude API (quality)
- Embeddings: qwen3-embedding:4b via Ollama / MLX server, 2560-dim Cosine
- Vector store: pgvector (PostgreSQL extension)
- LLM proxy: LiteLLM (transparent backend switching)

### 2.2 Prompt Engineering

#### System Prompt (Current Implementation)

From `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py`:

```
You are the Chronicler, the ancient narrator who has witnessed and recorded
all the histories of the worlds of Dwarf Fortress. You speak with gravitas
and authority, weaving tales of civilizations, great battles, legendary
figures, and the rise and fall of empires.

You have access to two kinds of records:
- HISTORICAL RECORDS (from the Legends): ancient annals of historical figures,
wars, civilizations, artifacts, and events spanning centuries.
- LIVE FORTRESS DATA: current observations from the fortress -- living
inhabitants, their emotions and stress levels, military squads, recent
events, and game announcements.

When records contain both historical and live data about the same figure,
weave them together -- the ancient legend AND their current state.

When asked about specific figures, places, or events, draw upon the provided
records to give accurate, detailed accounts. Embellish with atmospheric
prose but never fabricate facts that contradict the records.

Emotions have causes. If a dwarf is stressed, grieving, or traumatized, the
cause may be in recent events or announcements. Connect the dots when
circumstantial evidence supports it, but note uncertainty.

If the records do not contain information about what is asked, say so honestly
-- "The annals hold no record of such a thing" -- rather than inventing details.

Keep responses focused and engaging. Favor narrative storytelling over dry
recitation of facts. Use present tense for living figures and past tense for
the fallen.
```

#### Target Agentic System Prompt (v1.0)

```
[System prompt above]
+
Database schema summary (~2K tokens):
  - 40+ table definitions with column names, types, relationships
  - Key joins: historical_figures <-> units via hist_fig_id
  - Key joins: hf_links, hf_entity_links, hf_site_links for relationships
  - Key joins: history_events with hf_id_1, hf_id_2, site_id, entity_id

SQL tool definition:
  - Name: execute_sql
  - Input: SQL query string (read-only)
  - Output: JSON array of rows (max 50)
  - Constraints: SELECT only, 5s timeout, no DDL/DML

Denizen registry summary:
  - Top N denizens by NVS: name, race, status, NVS score, key facts

Instructions for autonomous exploration:
  - You may execute up to 5 SQL queries to explore the database
  - Start broad, then narrow based on results
  - Cite evidence: include table name and key values in your reasoning
  - When done exploring, compose a narrative response
```

#### Message Assembly Pattern

From `build_messages()`:

```python
[
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": (
        f"World: {world_name}\n\n"
        f"Historical Records:\n{context_text}\n\n"
        f"Question: {user_query}"
    )},
]
```

### 2.3 Context Assembly

#### Current Pipeline (v0.8 -- DONE)

```
User query
  |
extract_keywords(query) -- simple word tokenization + lowering
  |
Phase 1: Categorical routing
  - Match keywords against 23 route categories
  - Execute structured queries (hf_flag, hf_race, entity_type, collection_type, artifacts, written_contents, live_*)
  |
Phase 2: Name-based ILIKE search
  - Remaining keywords searched as name patterns
  - HF match triggers: events (10), live status cross-ref, relationships, entity memberships
  |
Phase 3: Fallback
  - If no results: _world_overview() -- summary counts
  |
format_context(records)
  - Group by category
  - 12,000 char budget (~3000-4000 tokens)
  - Truncation with "(...additional records truncated for brevity...)"
  |
build_messages(query, context, world_name)
  |
stream_completion(messages, model, temperature, max_tokens)
  |
SSE EventSourceResponse -> client
```

#### Target Agentic Pipeline (v1.0 -- PLANNED)

```
User question
  |
LLM receives system prompt with:
  - Database schema summary (~2K tokens)
  - SQL tool definition (read-only)
  - Denizen registry summary (top denizens by NVS)
  - Instructions for autonomous data exploration
  |
LLM decides what to query -> emits SQL tool call
  |
Tool executor:
  - Validates query (read-only, no DDL/DML)
  - Executes against PostgreSQL
  - Returns results (max 50 rows, 5s timeout)
  |
LLM analyzes results -> may issue another query (up to 5 rounds)
  |
LLM composes final response with evidence citations
  |
SSE stream (tool calls hidden from UI; only narrative tokens sent)
```

### 2.4 Token Budget Management

| Budget Component | Allocation | Notes |
|-----------------|-----------|-------|
| System prompt | ~500 tokens | Fixed persona + instructions |
| Schema summary (agentic) | ~2,000 tokens | Table definitions, key relationships |
| Denizen summary (agentic) | ~300 tokens | Top fortress denizens by NVS |
| Context records (keyword mode) | ~3,000-4,000 tokens | 12,000 char budget |
| User query | ~100 tokens | Typical question length |
| SQL tool call/response (agentic) | ~500 tokens per round | Up to 5 rounds = 2,500 tokens |
| Generation budget | 2,048 tokens | `LLM_MAX_TOKENS` config |
| **Total context window** | **~8,500 tokens (keyword) / ~7,500 tokens (agentic)** | Well within 32K context of Qwen3-8B |

### 2.5 Retrieval Paths (5 Implemented Live Data Paths)

| Path | Data Source | Query Pattern | Status |
|------|-----------|--------------|--------|
| Live Units | `units` table | `SELECT * FROM units WHERE world_id=$1 AND is_alive=TRUE` | DONE |
| Unit Events | `unit_events` table | Recent ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED | DONE |
| Game Reports | `game_reports` / bridge | Latest announcements and combat reports | DONE |
| Lua Probes | `lua_probes` table | Snapshots of probe_armies, probe_diplomacy, probe_unit_detail | DONE |
| HF Cross-Reference | `units JOIN historical_figures` | Match live units to historical records via `hist_fig_id` | DONE |

---

## 3. Knowledge Horizon Integration

### 3.1 Core Concept

The Knowledge Horizon limits the LLM's effective search space within the Chronicler database. Instead of exposing all ~1.65M CDM records across 35+ tables, the mask exposes only data relevant to the fortress and its inhabitants. The mask grows organically as in-game conditions change.

### 3.2 Masking Dimensions

**Geographic Scope**:
- Always visible: fortress region + adjacent regions
- Revealed by: migrants (origin site/region), caravans (source civ sites), raids (target location), expedition returns

**Civilization Scope**:
- Always visible: parent civilization structure (entity + positions + members)
- Revealed by: diplomatic contact, war declaration, raid encounter, caravan from new civ

**Individual Scope**:
- Always visible: all fortress inhabitants + direct family (depth 1)
- Revealed by: arrival at fortress, family connection discovery, organizational overlap

### 3.3 Seven Visibility Caveats (Full Detail)

**CAV-001: Organization Membership Propagation**
- Cults: full visibility of all members
- Military Squads: squad-mates and chain of command visible
- Guilds: same-site members visible
- Religious Orders: nearby site worshippers visible
- Civilization (broad): NO full propagation -- too many members

**CAV-002: Civilization Nobles and Administrators**
- Always visible: civilization-level nobles, administrators, law-givers, military commanders
- Rationale: these are public figures the fortress would know about

**CAV-003: Previous Residence Knowledge**
- A dwarf who previously lived at another site carries knowledge of all inhabitants of that site
- Implementation: backtrack denizen's origin site; reveal all HFs at that site

**CAV-004: Starting Dwarf Background Generation**
- The initial 7 dwarves exist only as units, not as entries in legends data
- Heuristic: check relationships, assign parentage, assign previous residency
- Generate synthetic HF entries with `source = 'inferred'`

**CAV-005: Family Chain Propagation**
- Depth 1 (spouse, children, parents): Always visible
- Depth 2 (siblings, grandparents, in-laws): Visible if alive
- Depth 3+: Masked unless another caveat reveals them
- Cap at depth 3 to prevent recursion bombs

**CAV-006: Event-Based Revelation**
- War declaration: reveals enemy civ, enemy leader, enemy sites involved
- Caravan arrival: reveals source civ, caravan leader
- Migrant wave: reveals origin site, all migrants' previous associations
- Raid/expedition return: reveals target site and any figures encountered
- Artifact acquisition: reveals artifact's full history (all previous holders, creation site)

**CAV-007: LLM Inference Restrictions**
- LLM MUST NOT infer events or relationships not present in unmasked data
- Treat the Knowledge Horizon as an in-world limitation
- Implementation: system prompt instruction only (no code enforcement at this level)

### 3.4 Database Architecture

**Preferred: View-Based Masking**

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);

CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT entity_id FROM knowledge_horizon
             WHERE entity_type = 'hf' AND visible = true);
```

**Alternative**: Materialized Subset -- copy visible rows into shadow tables. Start with views; add materialized views if performance degrades at 60K+ HFs.

### 3.5 Storyteller Integration

Knowledge Horizon affects the storyteller in two ways:
1. **Query scope**: Agentic SQL queries are executed against `visible_*` views, not base tables
2. **System prompt**: Advisory note tells LLM the horizon exists and to respect it
3. **Confidence signaling**: If horizon filters produce thin results, confidence note adjusts accordingly

---

## 4. Scoring & Ranking System

### 4.1 Complete Scoring Formulas

All formulas adapted from df-narrator and implemented in `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py`.

#### Figure Importance Score (implemented)

```sql
LEAST(COALESCE(event_count, 0) * 2, 500)
+ COALESCE(kill_count, 0) * 15
+ (is_vampire::int) * 80
+ (is_necromancer::int) * 100
+ (is_deity::int) * 120
+ (is_force::int) * 90
+ (is_werebeast::int) * 70
+ LEAST(COALESCE(hf_links_count, 0) * 3, 100)
+ COALESCE(leadership_positions, 0) * 20
+ COALESCE(artifacts_held, 0) * 30
+ LEAST(COALESCE(site_links, 0) * 5, 50)
+ LEAST(COALESCE(entity_links, 0) * 3, 60)
+ (CASE WHEN death_year IS NOT NULL THEN 5 ELSE 0 END)
```

**Weight analysis**:
- Events dominate (up to 500 pts)
- Deity type is next highest (120 pts)
- Kills matter significantly (x15 each, uncapped)
- Artifacts in possession are highly valued (x30 each)
- Leadership positions (x20 each)
- Skills contribute a capped bonus: `min(skill_count * 2 + max_ip // 5000, 80)`
- Death recorded is a minor signal (+5)

#### Site Importance Score (implemented)

```sql
events + deaths * 2 + event_collections * 5 + structures * 3
```

Deaths double-weighted. Collections (wars, battles touching the site) heavily weighted at 5x. Structures at 3x.

#### Conflict Importance Score (formula, not yet SQL)

```python
deaths * 3 + battle_count * 10 + sites_involved * 5 + duration_years
```

Battle count is the dominant factor -- a single multi-battle war outscores a massacre with no organized battles.

#### Artifact Importance Score (implemented, simplified)

```sql
events * 10
+ (CASE WHEN name IS NOT NULL AND name != '' THEN 50 ELSE 0 END)
+ (CASE WHEN holder_hf_id IS NOT NULL THEN 20 ELSE 0 END)
```

Note: Full formula includes `unique_holders * 20 + lost_or_stolen(30)` which requires event scanning; current implementation approximates with `has_holder`.

### 4.2 Narrative Value Score (NVS) for Fortress Denizens

NVS is computed per watcher cycle for the `fortress_denizens` table. It determines "who matters" in the fortress context specifically, adapting the global HF importance score to fortress-relevance.

```sql
fortress_denizens.narrative_value FLOAT DEFAULT 0.0
```

NVS factors (planned):
- Base HF importance score (if HF record exists)
- Live event count (arrivals, deaths, skill-ups, profession changes)
- Relationship density (connections to other denizens)
- Position/role (military commander > peasant)
- Embark flag bonus (starting 7 dwarves are historically significant)
- Recency bias (recent events weight more than ancient history)

### 4.3 Event Classification Sets

From df-narrator, used for scoring and filtering:

```python
COMBAT_EVENTS = {
    "attacked site", "hf attacked site", "field battle", "squad vs squad",
    "hf destroyed site", "plundered site", "site taken over", "razed structure",
    "hf simple battle event", "tactical situation", "site dispute", "reclaim site",
}

COLLECTION_WAR_TYPES = {"war", "battle", "siege", "attack", "raid", "insurrection"}

ARTIFACT_EVENT_TYPES = {
    "artifact created", "artifact given", "artifact lost", "artifact possessed",
    "artifact stored", "item stolen", "artifact claim formed", "masterpiece item",
}
```

### 4.4 HF_FIELDS -- Canonical HF Reference Field List

XML event fields that reference historical figure IDs (from df-narrator):

```python
HF_FIELDS = {
    'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid',
    'changee_hfid', 'changer_hfid', 'woundee_hfid', 'wounder_hfid',
    'doer_hfid', 'target_hfid', 'attacker_hfid', 'defender_hfid',
    'hist_fig_id', 'body_hfid', 'hfid_target', 'hfid_attacker',
    'hfid_defender', 'trickster_hfid', 'cover_hfid', 'student_hfid',
    'teacher_hfid', 'trainer_hfid', 'seeker_hfid',
}
```

---

## 5. Data Requirements

### 5.1 CDM Tables Feeding the Storyteller

| Table | Role in Storyteller | Key Columns |
|-------|--------------------|-------------|
| `historical_figures` | Core entity data | id, name, race, caste, birth_year, death_year, death_cause, is_deity/force/vampire/necromancer/werebeast/ghost, kill_count, event_count, entity_id, importance_score |
| `history_events` | Event narratives | id, year, seconds72, event_type, hf_id_1, hf_id_2, site_id, entity_id, details (JSONB), live_generated, source |
| `history_event_collections` | War/battle structures | id, type, name, start_year, end_year, event_ids_json, site_id |
| `sites` | Location context | id, name, type, coords, owner_entity_id, importance_score |
| `entities` | Civilization context | id, name, type, race |
| `artifacts` | Object narratives | id, name, item_type, material, creator_hfid, holder_hf_id, importance_score |
| `hf_links` | Relationship graph | hf_id, target_hf_id, link_type |
| `hf_entity_links` | Civic memberships | hf_id, entity_id, link_type, position_name |
| `hf_site_links` | Location associations | hf_id, site_id, link_type |
| `hf_position_links` | Leadership roles | hf_id, entity_id, position_id, start_year, end_year |
| `entity_positions` | Position definitions | entity_id, position_id, name, name_male, name_female |
| `units` | Live fortress data | id, hist_fig_id, name, race, profession, is_alive, skills_json, personality_json, stress_level, mood |
| `unit_events` | Live change log | ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED |
| `fortress_denizens` | Who matters | unit_id, hf_id, name, status, embark, narrative_value, arrival_year |
| `knowledge_horizon` | Visibility mask | entity_type, entity_id, visible |
| `written_contents` | Books/scrolls for context | id, title, author_hf_id, type, year |
| `lua_probes` | Real-time game state | probe_name, data_json, timestamp |
| `worlds` | Multi-world routing | id, name, altname |
| `storyteller_log` | Monitoring/debugging | query, keywords, context_stats, model, latency phases |

### 5.2 Live Data Feeding the Storyteller

| Data Domain | Source | Update Frequency | Storyteller Use |
|-------------|--------|-----------------|-----------------|
| Unit summary | Bridge (chronicler-bridge.lua) | Every 100 game ticks | Current inhabitants, professions, stress |
| Dwarf emotions | Bridge | Every 100 ticks | Emotional state for narrative color |
| Dwarf skills | Bridge | Every 100 ticks | Skill progression narrative |
| Squads | Bridge | Every 100 ticks | Military composition for queries |
| Armies | Bridge | Every 100 ticks | Siege/invasion detection |
| Announcements | Bridge (cursor-based, 200/tick) | Every 100 ticks | Recent events, combat reports |
| Diplomacy | Bridge | Every 100 ticks | Trade, petition context |
| Zone ownership | Bridge | Every 100 ticks | "Who lives where" context |
| Game time | Bridge | Every 100 ticks | Current year/tick for age calculations |
| World info | Bridge | Every 100 ticks | Fortress name, world name |

### 5.3 Computed Metrics Feeding the Storyteller

| Metric | Computation | Storage | Update Frequency |
|--------|------------|---------|-----------------|
| HF importance score | df-narrator formula via SQL | `historical_figures.importance_score` | On XML import + periodic recompute |
| Site importance score | df-narrator formula via SQL | `sites.importance_score` | On XML import |
| Artifact importance score | df-narrator formula via SQL | `artifacts.importance_score` | On XML import |
| NVS (denizen) | Adapted formula | `fortress_denizens.narrative_value` | Every watcher cycle |
| Rivalry co-appearance | Event scan for shared HF references | Computed on demand | Per query (or cached) |
| Kill count | COUNT of 'hf died' events where slayer_hfid matches | `historical_figures.kill_count` | On XML import |
| Event count | COUNT of events referencing this HF | `historical_figures.event_count` | On XML import |

---

## 6. Existing Implementation Status

### 6.1 Current Storyteller (v0.8 -- COMPLETE)

**Architecture**: Keyword -> SQL routing -> context assembly -> LLM (Qwen3-8B via LiteLLM)

**Key Files**:
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py` -- System prompt, format_context(), build_messages()
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` -- retrieve_context(), extract_keywords(), 23 categorical routes, ILIKE fallback
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/storyteller.py` -- POST /ask endpoint, SSE streaming, InteractionLog
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py` -- compute_importance_scores() for HFs, sites, artifacts
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/annotated_schema.py` -- Schema summary for agentic mode
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/monitoring.py` -- InteractionLog class

**What is built and working**:
- 23 categorical keyword routes (deity, vampire, war, fortress, stress, etc.)
- Name-based ILIKE search with relationship/event enrichment
- Dual-tier context (HISTORICAL + LIVE) with 12,000-char budget
- 5 live data retrieval paths (units, unit_events, reports, probes, HF cross-ref)
- SSE streaming from Qwen3-8B
- System prompt persona ("The Chronicler")
- Confidence signaling (context density note)
- HF importance scoring (df-narrator formula, SQL implementation)
- Site importance scoring (SQL implementation)
- Artifact importance scoring (simplified SQL implementation)
- Per-interaction monitoring with 4-phase latency breakdown
- Monitoring API endpoints (3) and dashboard
- Relationship traversal on HF match (hf_links, hf_entity_links)
- Event payload enrichment (JOIN-resolved names, natural-language templates for 6 types)
- Emotion/zone integration in live unit queries
- HF-to-unit cross-reference
- War name resolution

**Web UI**: Live at `localhost:8080`. Two worlds queryable: Namoram (world 5, 109K records) and Ormon (1.54M records).

### 6.2 What's Planned but Not Built

| Component | Phase | Effort | Status |
|-----------|-------|--------|--------|
| Agentic SQL tool use | Phase 3 | 8-10 hrs | PLANNED |
| Unified Person builder (Unit+HF merge) | Phase 3 | Included in Phase 3 | PLANNED |
| Personality-driven voice emulation | Phase 5+ | Medium | NOT STARTED |
| Full event narrative templates (122+ types) | Post-Phase 3 | Large | NOT STARTED |
| Death cause rendering (50+ variants) | Post-Phase 3 | Medium | NOT STARTED |
| Perspective-aware rendering | Post-Phase 3 | Medium | NOT STARTED |
| Circumstance/reason rendering | Post-Phase 3 | Medium | NOT STARTED |
| Cross-linked entity references in events | Post-Phase 3 | Medium | NOT STARTED |
| Knowledge Horizon (views) | Phase 4 | Medium | PLANNED |
| Full Knowledge Horizon (7 caveats) | Phase 5+ | XL | NOT STARTED |
| Proactive narrative engine | Phase 5+ | XL | NOT STARTED |
| pgvector / embedding-based retrieval | Long-term | Large | INFRASTRUCTURE EXISTS, UNUSED |
| Interaction text from game raws | Long-term | Medium | NOT STARTED |
| Rivalry detection | Long-term | Medium | NOT STARTED |
| NVS for fortress denizens | Phase 1 | Medium | PLANNED |
| Config toggle (keyword vs. agentic) | Phase 3 | Small | PLANNED |

### 6.3 Performance Targets

| Metric | Target |
|--------|--------|
| Agentic response time | Under 15 seconds |
| Max SQL rounds (agentic) | 5 |
| Per-query timeout | 5 seconds |
| Max rows per query | 50 |
| Context char budget | 12,000 characters |
| LLM max tokens | 2,048 |
| Event pagination | 1,000 events/page |
| Test suite execution | 0.19s baseline |

---

## 7. Open Questions & Design Decisions

### 7.1 Resolved Decisions

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| D-01 | Agentic storyteller replaces keyword routing | Up to 5 SQL rounds; keyword retained as fallback | Design Decision #4 |
| D-02 | Live events in same `history_events` table | `live_generated` + `source` columns distinguish | Design Decision #5 |
| D-03 | Knowledge Horizon as advisory (system prompt) initially | View-based enforcement deferred to Phase 4 | Design Decision #6 |
| D-04 | NVS computed per watcher cycle | Enables O(1) sort for LLM context selection | Design Decision #7 |
| D-05 | SSE streaming for agentic responses | Tool calls hidden from UI | Design Decision #9 |
| D-06 | Template-based rendering as fast fallback | LLM generation for richer prose; templates for speed | Insight #1 |
| D-07 | View-based Knowledge Horizon masking preferred | Over materialized tables; start with views | Design Decision #27 |
| D-08 | Storyteller enrichment over raw data | JOIN-resolved names + templates | Design Decision #15 |
| D-09 | Confidence signaling in storyteller | Context density note prepended to all retrieval | Design Decision #16 |
| D-10 | Inline instrumentation for monitoring | Middleware cannot capture per-phase latency | Design Decision #22 |
| D-11 | Event type storage as TEXT | No DB enum constraint; raw data in JSONB | Design Decision #25 |

### 7.2 Open Design Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| Q-01 | How should the LLM handle event collection sub-events in narrative? | (A) Flatten all events; (B) Hierarchical summary (war -> battles -> events); (C) LLM decides depth | Affects war narrative quality |
| Q-02 | Should pgvector embeddings be used for context retrieval? | (A) Yes, hybrid with SQL; (B) No, agentic SQL is sufficient; (C) Deferred until agentic proves insufficient | Infrastructure exists but unused |
| Q-03 | Graphiti / Neo4j as complement to relational CDM for narrative? | (A) Use for deep relationship traversal; (B) Stick with SQL JOINs | Affects relationship narrative depth |
| Q-04 | How should personality voice emulation map DF traits to narrative dimensions? | 50 personality facets -> N voice dimensions (need mapping design) | Affects character dialogue quality |
| Q-05 | Should the proactive narrative engine use WebSocket push or polling? | (A) WebSocket for real-time alerts; (B) Polling with SSE; (C) Both | Affects UX responsiveness |
| Q-06 | Frontend framework confirmation: Vue 3 + Vuetify 3 or SvelteKit? | Both discussed in planning docs; current UI is Jinja2 + vanilla JS | Affects all frontend storyteller UI |
| Q-07 | Should the agentic storyteller have access to DDL (CREATE TEMP TABLE) for complex analysis? | (A) Strictly SELECT only; (B) Allow temp tables for multi-step analysis | Affects analytical capability |
| Q-08 | Player Character distinction in narrative? | Adventurer HFs get special treatment? Player fortress gets first-person narrative? | Affects narrative perspective |
| Q-09 | How to render the 12 event types that no existing tool handles? | (A) LLM interprets raw JSONB; (B) Wait for community templates; (C) Implement based on df-structures field definitions | Affects event coverage completeness |

### 7.3 Known Gaps and Risks

| Gap | Impact | Mitigation |
|-----|--------|-----------|
| No narrative templates for 122+ event types | Events render as raw data, not prose | Priority: implement LB2's 132 event Html() patterns as Python templates |
| No death cause differentiation | All deaths render as "died" -- significant quality loss | Priority: implement weblegends' 50+ death cause taxonomy |
| No perspective-aware rendering | Events redundantly name the current entity | Priority: implement event_context pattern from weblegends/LB2 |
| No circumstance/reason rendering | "Why" of events is invisible | Medium priority: 6 circumstances + 4 reasons from weblegends |
| No interaction text from raws | Vampire biting, necromancy rendered generically | Low priority: requires DFHack access to interaction definitions |
| Artifact scoring simplified | Missing unique_holders and lost_or_stolen tracking | Medium priority: event scanning to count holders |
| NVS formula not yet defined | Fortress denizen ranking undefined | Phase 1 blocker: must define before denizen registry |
| pgvector pipeline unused | Embedding-based retrieval not leveraged | Deferred: agentic SQL may eliminate the need |
| No proactive narrative | Storyteller only responds, never initiates | Post-v1.0: requires event monitoring + significance threshold |
| Multi-participant event truncation (BUG-002) | Events with 10+ participants lose data | Design decision pending: JSONB array vs. junction table |
| Polling timing risk for rare events | Marriage, strange mood, tantrum may be missed | Partially mitigated by eventful subscriptions (Tier 3) |

---

## 8. Event Rendering Reference

### 8.1 Event Type Coverage by Tool

| Source | Event Types Handled | Chronicler Status |
|--------|--------------------|--------------------|
| df-structures `history_event_type` enum | 144 (canonical) | Store all as TEXT; 141 confirmed usable |
| LegendsBrowser2 `events.go` | 132 (most complete handling) | Target for narrative templates |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Secondary reference |
| weblegends `events/*.cpp` | 94 (with context-aware rendering) | Gold standard for death/interaction/circumstance rendering |
| Chronicler DB (World 8) | 97 observed types | Current coverage |
| df-narrator | Generic (type string only) | Scoring only, no per-type handling |

### 8.2 Event Rendering Pipeline (Canonical Pattern)

All successful tools follow:
```
Event (typed struct) -> Context (current entity perspective) -> Template (per-type prose) -> HTML (with entity links)
```

Chronicler with LLM extends this:
```
Event (CDM row) -> Context (target entity + related entities) -> LLM prompt (with event type template as scaffold) -> Narrative (with entity references marked for linking)
```

### 8.3 Death Cause Taxonomy (50+ Variants from weblegends)

```
NONE -> "died"
OLD_AGE -> "died of old age"
HUNGER -> "starved to death"
THIRST -> "died of thirst"
SHOT -> "was shot and killed"
BLEED -> "bled to death"
DROWN -> "drowned"
SUFFOCATE -> "suffocated"
STRUCK_DOWN -> "was struck down"
SCUTTLE -> "was scuttled"
COLLISION -> "died in a collision"
MAGMA -> "was consumed by magma"
MAGMA_MIST -> "was killed by magma mist"
DRAGONFIRE -> "was killed by dragonfire"
FIRE -> "burned to death"
SCALD -> "was scalded to death"
CAVEIN -> "was crushed in a cave-in"
DRAWBRIDGE -> "was smashed by a drawbridge"
FALLING_ROCKS -> "was killed by falling rocks"
CHASM -> "fell into a chasm"
CAGE -> "died in a cage"
MURDER -> "was murdered"
TRAP -> "was killed by a trap"
VANISH -> "vanished"
QUIT -> "gave in to despair"
ABANDON -> "was abandoned"
HEAT -> "died of heat"
COLD -> "died of cold"
SPIKE -> "was impaled on spikes"
ENCASE_LAVA -> "was encased in lava"
ENCASE_MAGMA -> "was encased in magma"
ENCASE_ICE -> "was encased in ice"
BEHEAD -> "was beheaded"
CRUCIFY -> "was crucified"
BURY_ALIVE -> "was buried alive"
DROWN_ALT -> "drowned"
BURN_ALIVE -> "was burned to a crisp"
FEED_TO_BEASTS -> "was fed to beasts"
HACK_TO_PIECES -> "was hacked to pieces"
LEAVE_OUT_IN_AIR -> "was left out in the air"
BOIL -> "was boiled alive"
MELT -> "melted"
CONDENSE -> "condensed"
SOLIDIFY -> "solidified"
INFECTION -> "succumbed to infection"
MEMORIALIZE -> "was memorialized"
SCARE -> "was scared to death"
DARKNESS -> "was consumed by darkness"
COLLAPSE -> "was killed in a collapse"
DRAIN_BLOOD -> "was drained of blood"
SLAUGHTER -> "was slaughtered"
VEHICLE -> "was killed by a vehicle"
FALLING_OBJECT -> "was killed by a falling object"
LEAPT_FROM_HEIGHT -> "leapt from a great height"
DROWN_ALT2 -> "drowned"
EXECUTION_GENERIC -> "was executed"
```

Each death also includes:
- Weapon info via `do_weapon()` function
- Slayer identity (HF or creature race) with link
- Age at death with fractional year display

### 8.4 Circumstance/Reason Text Rendering

**Reasons** (from weblegends `helpers/circumstance.cpp`):
- `glorify_hf` -> "in order to glorify [HF]"
- `artifact_is_heirloom_of_family_hfid` -> "of the [HF] family"
- `as_a_symbol_of_everlasting_peace` -> "as a symbol of everlasting peace"
- `artifact_is_symbol_of_entity_position` -> "as a symbol of authority within [entity]"

**Circumstances**:
- `Death` -> "after the death of [HF]"
- `Prayer` -> "after praying to [HF]"
- `DreamAbout` -> "after dreaming about [HF]"
- `Dream` -> "after a dream"
- `Nightmare` -> "after a nightmare"
- `FromAfar` -> "from afar"

### 8.5 Worship Strength Rendering

From weblegends, deity worship in HF relationships:
- < 10: "dubious"
- < 25: "casual"
- < 75: (average, no label)
- < 90: "faithful"
- >= 90: "ardent"

---

## 9. API Routes & Endpoints

### 9.1 Current Storyteller API

| Method | Route | Request | Response | Status |
|--------|-------|---------|----------|--------|
| POST | `/ask` | `{"query": str, "world_id": int}` | SSE stream: `{"token": str}` per chunk, `{"done": true}` at end, `{"error": str}` on failure | DONE |

### 9.2 Monitoring API

| Method | Route | Parameters | Response | Status |
|--------|-------|-----------|----------|--------|
| GET | `/api/monitoring/interactions` | `?limit=50&world_id=N` | JSON array of interaction logs | DONE |
| GET | `/api/monitoring/interactions/{id}` | -- | JSON interaction detail | DONE |
| GET | `/api/monitoring/summary` | -- | JSON summary stats | DONE |

### 9.3 Planned Storyteller API Extensions

| Method | Route | Purpose | Phase |
|--------|-------|---------|-------|
| POST | `/ask` (enhanced) | Agentic mode with SQL tool use | Phase 3 |
| GET | `/api/storyteller/denizens` | Top denizens by NVS | Phase 1 |
| GET | `/api/storyteller/profile/{hf_id}` | Character profile generation | Phase 3 |
| GET | `/api/storyteller/war/{collection_id}` | War narrative generation | Post-Phase 3 |
| WebSocket | `/ws/narrative-alerts` | Proactive narrative push | Phase 5+ |

---

## 10. Reference Tool Inspiration Summary

| Tool | Key Contribution to Storyteller | What to Adopt |
|------|-------------------------------|---------------|
| **df-narrator** | 4 scoring formulas, HF_FIELDS set, event classification sets, seconds72 calendar formula, rivalry detection, entity selection by score | Verbatim scoring formulas (already adopted); HF_FIELDS; COMBAT_EVENTS/COLLECTION_WAR_TYPES/ARTIFACT_EVENT_TYPES sets; top-N selection pattern |
| **weblegends** | 94 event handlers, 50+ death causes, context-aware rendering (`event_context`), circumstance/reason text, interaction text from raws, worship strength, entity categorization, zombie handling, name translation | Death cause taxonomy; perspective-aware rendering; circumstance/reason rendering; interaction text pattern; worship strength labels; entity type categorization |
| **LegendsBrowser2** | 132 event type handlers (most complete), perspective-aware `HfId` context, popover endpoints, collection hierarchy rendering | Baseline for 132 event narrative templates; collection hierarchy (war -> battle -> event); per-type `Html()` implementation pattern |
| **LegendsViewer-Next** | Family tree structure (Cytoscape), warfare graph, Chart.js visualizations, paginated server-side search | Family tree data model for storyteller context; paginated event display pattern |
| **LegendsBrowser v1** | SVG family tree, curse lineage tree, D3 chord diagram, reputation scores (24 dimensions) | Curse lineage for vampire/werebeast narratives; reputation dimension vocabulary |
| **df-ai** | Tick-based advisory cadence, fortress management heuristics, stock thresholds, military proportions | Advisory cadence for proactive narrative engine; domain knowledge for fortress advisor integration |
| **df-structures** | 144 event type enum (canonical), HF profile pointer bag (13 sub-profiles), complete personality/knowledge/reputation structures | Canonical event type taxonomy; HF sub-profile data model; personality dimension definitions for voice emulation |

---

## 11. Unified Person Schema (JSON for LLM Consumption)

The target Unified Person view merges Unit + HF data into a single JSON structure optimized for LLM context injection:

```json
{
  "name": "Urist McHammer",
  "english_name": "Suntin",
  "race": "Dwarf",
  "caste": "Female",
  "birth_year": 23,
  "age": 127,
  "is_alive": true,
  "profession": "Legendary Miner",
  "civilization": "The Dagger of Feasting",
  "relationships": [
    {"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345}
  ],
  "personality": {
    "notable_traits": ["Very brave"],
    "values": ["Family"],
    "unmet_needs": ["Socialize"],
    "dreams": ["Start a family (accomplished)"]
  },
  "positions_held": [
    {"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}
  ],
  "skills": [
    {"name": "Mining", "level": 20, "label": "Legendary"}
  ],
  "key_events": [
    {"year": 45, "type": "slew", "description": "Slew a forgotten beast"}
  ],
  "sources": {"unit_id": 567, "hf_id": 12340, "world_id": 8}
}
```

**Merge Rules (6)**:
1. Start with Unit data (always fresher)
2. Overlay HF data for historical depth
3. For conflicts: prefer Unit for real-time; prefer HF for historical facts
4. Personality data is Unit-only (HFs lack live personality)
5. Event history from TWO sources, distinguished by `live_generated` flag
6. Embark dwarves with no HF: flag `embark: true`

---

## 12. DF Calendar Utility (Shared by All Narrative Components)

```python
def format_df_date(year: int, seconds72: int) -> str:
    """Convert DF timestamp to calendar date string."""
    MONTHS = [
        "Granite", "Slate", "Felsite",      # Spring
        "Hematite", "Malachite", "Galena",   # Summer
        "Limestone", "Sandstone", "Timber",  # Autumn
        "Moonstone", "Opal", "Obsidian",     # Winter
    ]
    SEASONS = [
        "early spring", "mid spring", "late spring",
        "early summer", "mid summer", "late summer",
        "early autumn", "mid autumn", "late autumn",
        "early winter", "mid winter", "late winter",
    ]

    day_of_year = seconds72 // 1200 + 1
    month_idx = min((day_of_year - 1) // 28, 11)
    day = (day_of_year - 1) % 28 + 1

    month_name = MONTHS[month_idx]
    season = SEASONS[month_idx]

    return f"the {day}{'st' if day==1 else 'nd' if day==2 else 'rd' if day==3 else 'th'} of {month_name}, year {year}"


def format_age_at_death(born_year, born_seconds, died_year, died_seconds):
    """Calculate age at death with fractional years."""
    years = died_year - born_year
    days = (died_seconds - born_seconds) // 1200
    if days < 0:
        years -= 1
        days += 336  # 12 months * 28 days

    fraction = ""
    if days >= 28 * 9:
        fraction = " and three quarters"
    elif days >= 28 * 6:
        fraction = " and a half"
    elif days >= 28 * 3:
        fraction = " and a quarter"

    return f"{years}{fraction}"
```

---

*Component research document for AI Dwarf Fortress Storyteller. All features, formulas, templates, API routes, and design decisions extracted from all 7 source documents plus live source code analysis. "When in doubt, put it in."*
