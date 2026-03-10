# Phase 3: Narrative Engine — Implementation Plan

## Context

Phase 2 (Explorer Core) is complete (50/50 checks). Phase 3 transforms the storyteller from keyword-routing into a full narrative engine with: (1) 132+ deterministic event templates for explorer pages, (2) death cause rendering, (3) war/biography/civ narrative generators, and (4) an agentic LLM with autonomous SQL for the chat interface.

**Key finding:** Phase 2 already built substantial infrastructure that the PRD (written pre-Phase 2) didn't account for. 52 event templates, `PerspectiveRenderer`, `EntityLinkRenderer`, `EntityNameCache`, monitoring dashboard, and `annotated_schema.py` all exist. The plan extends this architecture rather than rebuilding.

**PRD:** `projects/chronicler/reports/phases/phase-3-narrative-engine.md`
**Product code:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Stage 3.1a: Death Cause Renderer (P1)

**New file:** `chronicler/explorer/death_cause.py` (~120 lines)
- `DEATH_CAUSE_MAP`: 50+ DF cause codes → human-readable templates (with `{by_weapon}` optional placeholder)
- `DeathCauseRenderer.render(cause, details)` → classmethod returning rendered string
- `render_age_at_death(birth_year, death_year, birth_seconds, death_seconds)` → fraction-aware ages

**Modify:** `chronicler/explorer/perspective.py`
- In `_render_template()`: when substituting `{cause}` field for `hf died` events, call `DeathCauseRenderer.render()` instead of raw string escape

**Modify:** `chronicler/api/routes/detail_pages.py`
- In `hf_detail_page()`: pre-render `death_cause_rendered` for the HF context dict and kill list entries

**Modify:** `chronicler/api/templates/hf_detail.html`
- Replace `{{ hf.death_cause|replace('_', ' ')|title }}` (lines 65, 118) with `{{ hf.death_cause_rendered }}`

**Verify:** HF who died `STRUCK_DOWN` shows "was struck down"; kills with weapons show "struck down by a bronze sword"

---

## Stage 3.1b: ~80 New Event Templates (P1)

**Modify:** `chronicler/explorer/perspective.py` (+~200 lines)
- Add ~80 entries to `EVENT_TEMPLATES` dict
- Add corresponding `COLUMN_MAP_BY_EVENT` entries for non-default column names
- Add any new field names to `ENTITY_REF_FIELDS`
- Add dynamic overrides to `_resolve_template()` for conditional logic

**Template groups** (batch by category, validate DB field names before each batch):

| Group | ~Count | Key types |
|---|---|---|
| Relationship | 10 | `hf_relationship_denied`, `hf_reach_summit`, `hf_preach`, `hf_travel` |
| Artifact | 8 | `artifact_destroyed`, `artifact_lost`, `artifact_found`, `artifact_possessed` |
| Site/Construction | 10 | `site_dispute`, `site_retired`, `rampaged_in_site`, `new_site_leader`, `replaced_structure` |
| Entity | 10 | `entity_dissolved`, `entity_incorporated`, `entity_overthrown`, `entity_law`, `first_contact` |
| Diplomacy | 6 | `agreement_formed`, `agreement_concluded`, `trade`, `diplomat_lost` |
| Culture/Art | 5 | `poetic_form_created`, `musical_form_created`, `dance_form_created` |
| Masterpiece | 7 | `masterpiece_arch_construct`, `masterpiece_item`, `masterpiece_food`, etc. |
| Occasion | 5 | `ceremony`, `competition`, `performance`, `procession`, `gamble` |
| Misc | ~10 | `sneak_into_site`, `insurrection`, `hf_convicted`, `sabotage`, etc. |

**Critical:** Before each batch, run `SELECT DISTINCT jsonb_object_keys(details) FROM history_events WHERE event_type = '<type>' AND world_id = 1` to verify actual field names.

**Verify:** No event type renders as raw JSON/generic fallback in the UI

---

## Stage 3.1c: Temporal Context Rendering (P2)

**Modify:** `chronicler/explorer/perspective.py`
- Add `TemporalContextRenderer` class (stateful, tracks `_last_year`)
- `wrap_event(event, rendered_text)` → adds `<span class="temporal-context">In Year X</span>` prefix on year changes

**Modify:** `chronicler/api/routes/detail_pages.py`
- In event list construction loops, wrap rendered text through `TemporalContextRenderer`

**Verify:** Sequential events show year headers only on year transitions

---

## Stage 3.1d: Circumstance/Reason Rendering (P2)

**Modify:** `chronicler/explorer/perspective.py`
- Add `REASON_TEMPLATES` and `CIRCUMSTANCE_TEMPLATES` dicts
- In `extract_enrichment_details()`, apply template lookup for natural language (e.g., "glorify_hf" → "to glorify {target_hf}")

**Verify:** Enrichment tags show "to glorify Urist" instead of "glorify_hf"

---

## Stage 3.2: Narrative Generators (P2)

**New file:** `chronicler/explorer/narratives.py` (~350 lines)
- `generate_war_narrative(conn, world_id, collection_id)` → structured dict with aggressor/defender, duration, battle summaries, key figures, death counts
- `generate_biography(conn, world_id, hf_id)` → structured dict with intro, supernatural flags, career sections, positions, relationships, artifacts, death, kill count
- `generate_civ_history(conn, world_id, entity_id)` → structured dict with founding, leader succession, wars, sites gained/lost, current state

**Modify:** `chronicler/api/routes/detail_pages.py`
- `hf_detail_page()`: call `generate_biography()`, pass to template
- `collection_detail_page()`: call `generate_war_narrative()` for war collections
- `entity_detail_page()`: call `generate_civ_history()` for civilizations

**Modify templates** (add collapsible narrative summary panels):
- `hf_detail.html` (+~80 lines): biography section above events table
- `collection_detail.html` (+~80 lines): war narrative panel
- `entity_detail.html` (+~60 lines): civilization history panel

**Verify:** War collection pages show structured narrative; HF pages show biography; civ pages show history

---

## Stage 3.3: Agentic Storyteller (P1)

**New file:** `chronicler/storyteller/agent.py` (~250 lines)
- `SQLSafetyLayer`: validate (SELECT-only, blocked keywords, world_id present) + execute (asyncpg, 5s timeout, 50 row limit)
- `SQL_TOOL`: OpenAI-format tool definition
- `AgenticStoryteller.run(query, world_id, pool)` → `AsyncGenerator[dict]` yielding `{"type": "token"|"progress", "content": str}`
- Multi-round loop: up to 5 SQL queries, tool calls consumed internally

**Modify:** `chronicler/storyteller/llm.py` (+~60 lines)
- Add `stream_completion_with_tools(messages, tools, model, ...)` alongside existing `stream_completion()`
- Same httpx transport, adds `tools` + `tool_choice` to payload, parses tool call deltas

**Modify:** `chronicler/storyteller/prompts.py` (+~25 lines)
- Add `build_agentic_messages(query, world_name, denizen_summary)` injecting `ANNOTATED_SCHEMA`

**Modify:** `chronicler/config.py` (+5 lines)
- Add `STORYTELLER_MODE = os.getenv('CHRONICLER_STORYTELLER_MODE', 'keyword')`

**Modify:** `chronicler/api/routes/storyteller.py` (+~40 lines)
- Mode-aware routing: `keyword` → existing path, `agentic` → `AgenticStoryteller`
- Add `mode: str = 'keyword'` to `AskRequest` model
- SSE: translate `{"type": "token"}` → `{"token": ...}`, `{"type": "progress"}` → `{"progress": ...}`

**Modify:** `chronicler/api/templates/explorer.html`
- Add progress indicator handler for `{"progress": ...}` SSE events
- Optional: mode toggle in chat UI

**Pre-flight check:** Verify LiteLLM tool-use with qwen3-8b: `curl localhost:4000/v1/chat/completions -d '{"model":"qwen3-8b-nothink","tools":[...],"messages":[...]}'`. If unsupported, fall back to prompt-based SQL extraction (`<sql>...</sql>` tags).

**Verify:** Ask the Chronicler about a specific HF → see SQL progress indicators → get narrative response with cited records

---

## Stage 3.4: Monitoring Enhancement (P2)

**Already done:** `monitoring.html` (202 lines), 3 API endpoints, `storyteller_log` table, auto-refresh. Only additive work needed.

**New file:** `chronicler/db/migrate_phase3_storyteller_log.sql` (~10 lines)
- `ALTER TABLE storyteller_log ADD COLUMN IF NOT EXISTS agentic_mode BOOL DEFAULT FALSE, sql_queries_count INT DEFAULT 0, sql_total_time_ms INT DEFAULT 0, sql_queries JSONB DEFAULT '[]'`

**Modify:** `chronicler/monitoring.py` — add 4 new fields to `InteractionLog.flush()`
**Modify:** `chronicler/api/templates/monitoring.html` — add Mode column, SQL detail in modal

**Verify:** Agentic queries show mode=agentic, SQL count, and expandable query details in dashboard

---

## Execution Order

```
Session 38:  3.1a (death cause renderer) + 3.1d (circumstance/reason)
Session 39-40: 3.1b (80 new templates, batched by category)
Session 41:  3.1c (temporal context) + 3.2 (narrative generators)
Session 42-43: 3.3 (agentic storyteller — safety layer, tool-use, agent loop, SSE)
Session 44:  3.4 (monitoring columns) + DoD validation
```

---

## Pitfalls to Watch

1. **LiteLLM tool-use compatibility** — qwen3-8b may not support OpenAI-format tool calls. Test first; have prompt-based SQL extraction as fallback.
2. **DB field name mismatch** — PRD uses idealized names; actual JSONB keys may differ. Always introspect before writing templates.
3. **Agentic SQL world_id** — LLM inlines world_id numerically (from system prompt). Validator checks presence, not parameterization. Actual execution always uses server-side world_id.
4. **Don't rebuild monitoring** — it already works. Only add agentic columns.
5. **Keep PerspectiveRenderer interface stable** — 12+ call sites in `detail_pages.py` depend on `render_event(event_dict, perspective_type, perspective_id, name_cache)`. No signature changes.

---

## DoD Checklist (from PRD Section 6)

### Event Templates
- [ ] Template system architecture implemented *(exists — PerspectiveRenderer)*
- [ ] 132+ event types have dedicated templates *(52 exist, +80 in 3.1b)*
- [ ] Death cause renderer handles 50+ variants *(3.1a)*
- [ ] Fallback template for remaining types *(exists — `_render_generic()`)*
- [ ] Perspective-aware rendering integrated *(exists)*
- [ ] Temporal context rendering works *(3.1c)*
- [ ] Circumstance/reason rendering works *(3.1d)*

### Narrative Generators
- [ ] War narrative generation *(3.2)*
- [ ] Battle detail rendering *(3.2)*
- [ ] Civilization rise-and-fall narratives *(3.2)*
- [ ] Character biography generation *(3.2)*
- [ ] Age at death with fractions *(3.1a)*

### Agentic Storyteller
- [ ] Annotated schema summary generated *(exists — annotated_schema.py)*
- [ ] SQL tool definition and safety layer *(3.3)*
- [ ] Multi-round SQL exploration up to 5 rounds *(3.3)*
- [ ] SSE stream filtering — tool calls hidden *(3.3)*
- [ ] Mode toggle keyword/agentic/hybrid *(3.3)*
- [ ] Template vs. LLM hybrid rendering *(3.3)*

### Observability
- [ ] Four-phase latency logging *(exists)*
- [ ] Monitoring dashboard with auto-refresh *(exists, enhanced in 3.4)*
