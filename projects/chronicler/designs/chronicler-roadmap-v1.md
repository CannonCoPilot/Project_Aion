# Chronicler Development Roadmap v1.0
## From Data Pipeline to Fortress Intelligence

**Created**: 2026-02-23, Session 34
**Updated**: 2026-02-24, Session 34
**Source**: PRD v2.2 + 4 active plan files + gap analysis + user corrections + dfhack-run SSH transport discovery
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Current State Summary

### What's Built (v0.8)

| Component | Status | Key Metrics |
|-----------|--------|-------------|
| **CDM Schema** | COMPLETE | 35 tables, composite PKs, 109K records |
| **Legends XML Parser** | COMPLETE | lxml iterparse, 141 event types, lossless |
| **Lua Bridge** | COMPLETE | v6, 16 sections, 7 data domains |
| **Watcher** | COMPLETE | `chronicler watch`, 3+ cycles verified, graceful shutdown |
| **Change Detector** | COMPLETE | 11 event types (death, mood, stress, pregnancy, etc.) |
| **Explorer** | COMPLETE | 6 tabs: People, Civilizations, Geography, Schema, Data, Graph |
| **Entity Positions** | COMPLETE | 11,712 position defs + 13,501 assignments extracted |
| **Storyteller** | COMPLETE | Keyword→SQL routing, dual-tier context, 12K char budget |
| **Test Suite** | COMPLETE | 131 tests, composite PK correctness |
| **Explorer UI Enhancements** | COMPLETE | Phases 1-7 of rippling-honking-crescent |

### Runtime Environment

| Component | Detail |
|-----------|--------|
| **DF Host** | UTM Win11 VM (`DF-Windows` / `192.168.64.3`) |
| **DF Version** | 53.10 + DFHack 53.10-r1 |
| **Data Transport** | `dfhack-run` over SSH (primary); TCP RPC broken for game-thread calls |
| **SSH Key** | `~/.ssh/df-vm` |
| **File Transfer** | HTTP server port 8889 (~105 MB/s) or SCP (~19 MB/s) |
| **Current World** | "The Land of Dawning" — year 250, 257×257, 48K HFs, 442K events |

### What's Missing (v0.8 → v1.0 Gap)

| Gap | Impact | PRD Phase |
|-----|--------|-----------|
| No "who matters" concept | LLM searches 60K+ HFs equally | Phase 1 |
| Embark dwarves may lack HF records | Starting dwarves invisible to storyteller | Phase 2 |
| No live event generation | Fortress-born entities have zero event history | Phase 2 |
| No death detection beyond flag check | Deaths go undetected when units disappear | Phase 1 |
| No unified person view | Unit and HF treated as separate entities | Phase 3 |
| Static keyword→SQL routing | Can't handle novel questions or multi-hop reasoning | Phase 3 |
| No Events tab | Event browsing missing from explorer | Phase 4 |
| No Knowledge Horizon | No dynamic visibility scoping | Phase 4-5 |
| Unit data extraction incomplete | ~15 fields captured out of 100+ available | Phase 2 |

---

## Roadmap Overview

```
PHASE 1 ──→ PHASE 2 ──→ PHASE 3 ──→ PHASE 4 ──→ PHASE 5
Denizen     Embark +     Agentic      Events +     Polish +
Registry    Events       Storyteller  Horizon      Long-term
(6-8 hrs)   (6-8 hrs)   (8-10 hrs)   (4-6 hrs)   (ongoing)
```

**Total estimated effort**: 24-32 hours for Phases 1-4 (core v1.0)

---

## Phase 1: Denizen Registry + Death Detection

**Effort**: 6-8 hours
**Goal**: Central tracking table for every fortress-relevant being, with death/absence detection and embark identification.

### 1.1 Schema: `fortress_denizens` table

**File**: `chronicler/db/schema.sql`

Create the denizen registry table with status tracking, NVS scoring, and embark detection. Schema defined in PRD v2.2 Section 3 — includes `embark BOOLEAN`, `narrative_value FLOAT`, `status TEXT` (resident/departed/deceased/missing/visitor/attacker/skulker/historical), and `last_seen_tick INT`.

Indexes: status, narrative_value DESC, hf_id, embark flag.

**Acceptance**: Table exists, migrations run cleanly against live DB.

### 1.2 Module: `chronicler/denizens.py`

**File**: `chronicler/denizens.py` (NEW)

Core denizen management:
- `register_denizen(conn, world_id, unit, is_embark)` — insert or update
- `update_denizen_status(conn, world_id, unit_id, new_status, cause)` — status transitions
- `compute_nvs(conn, world_id, denizen_id)` — NVS formula from PRD Section 3
- `get_fortress_denizens(conn, world_id, status_filter, sort_by)` — query with filters

### 1.3 Watcher Integration: Denizen Tracking

**File**: `chronicler/dfhack/watcher.py`

Each poll cycle:
1. On **first cycle** (no prior denizen entries): all detected units → `embark = TRUE`
2. New units not seen before → `register_denizen(status='resident')`
3. Units no longer in bridge data → `status = 'missing'` (investigate)
4. `is_alive` transitions FALSE → `status = 'deceased'` + departure metadata
5. All observed units → update `last_seen_tick`

### 1.4 Death Detection Enhancement

**File**: `chronicler/dfhack/watcher.py`

Compare current unit list to previous cycle:
- **Direct detection**: `is_alive` flag changes → `deceased`
- **Absence detection**: Unit in previous cycle but not current → `missing`
- **Threshold**: After N consecutive missing cycles → escalate to `presumed_deceased`

Logic defined in PRD v2.2 Section 4.3.

### 1.5 NVS Computation

**File**: `chronicler/denizens.py`

Initial NVS formula (from PRD Section 3):
```
NVS = (screen_time × 0.30) + (event_density × 0.25) +
      (relationship_depth × 0.20) + (recency × 0.15) +
      (status_weight × 0.10)
```

Computed per watcher cycle. Status weights: resident=1.0, deceased=0.8, visitor=0.5, historical=0.3.

### 1.6 CLI Command: `chronicler denizens`

**File**: `chronicler/cli.py`

New subcommand showing all denizens with: name, status, embark flag, NVS, HF link status.

### 1.7 HF Linking

**File**: `chronicler/denizens.py`

For each denizen with `hist_fig_id`, check if the HF exists in `historical_figures` → set `hf_id` on the denizen record.

### Phase 1 Verification

- [ ] Run watcher 3+ cycles → `fortress_denizens` populated with all fortress units
- [ ] First-cycle units all have `embark = TRUE`
- [ ] Kill a dwarf in DF → denizen status → `deceased` within 2 cycles
- [ ] Missing dwarf (disappears without death flag) → status → `missing`
- [ ] `chronicler denizens` shows all 20+ dwarves with status, NVS, embark flag
- [ ] NVS scores are non-zero and vary between denizens

### Phase 1 Files Summary

| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/db/schema.sql` | ADD `fortress_denizens` table + indexes | ~40 |
| `chronicler/denizens.py` | NEW — registry management module | ~200 |
| `chronicler/dfhack/watcher.py` | MODIFY — denizen tracking + death detection | ~100 |
| `chronicler/cli.py` | MODIFY — add `denizens` command | ~40 |

---

## Phase 2: Embark HF Handling + Unit Data Expansion + Live Events

**Effort**: 6-8 hours
**Depends on**: Phase 1 (denizen registry must exist for embark detection)
**Goal**: Embark dwarves get HF records, unit data extraction expands, and live event generation begins.

### 2.1 Schema: `embark` column on `historical_figures`

**File**: `chronicler/db/schema.sql`

```sql
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS embark BOOLEAN DEFAULT FALSE;
```

### 2.2 Schema: Event source tracking on `history_events`

**File**: `chronicler/db/schema.sql`

```sql
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
```

Source values: `'legends'`, `'live_watcher'`, `'live_bridge'`.

### 2.3 Embark HF Fallback: `chronicler/synthetic.py`

**File**: `chronicler/synthetic.py` (NEW)

After legends import + first watcher cycle:
1. For each embark denizen, check if `hist_fig_id` exists in `historical_figures`
2. **If found** (post-embark export used): set `embark = TRUE` on the HF record
3. **If not found** (pre-embark export only): create synthetic HF record from Unit data
   - Pull relationships from Unit record's `details.relationships[]` (9 slots)
   - Create `hf_links` entries from Unit relationship data
   - Mark HF as `synthetic = True` in details JSONB
   - `ON CONFLICT DO UPDATE` ensures re-import replaces synthetic with authoritative data

Logic defined in PRD v2.2 Section 4.1.

### 2.4 Bridge Expansion (from rippling-honking-crescent Phase 3)

**File**: `chronicler/dfhack/scripts/chronicler-bridge.lua`

Expand unit data extraction:

| Field | Effort | Priority |
|-------|--------|----------|
| `birth_year`, `sex`, `death_cause` | ~15 lines Lua | HIGH |
| Relationships (9 slots) | ~15 lines Lua | HIGH |
| Personality traits (50 facets) | ~60 lines Lua | MEDIUM |
| Physical/mental attributes | ~30 lines Lua | LOW |
| `cultural_identity` | ~2 lines Lua | LOW |

### 2.5 Schema Expansion: Unit columns

**File**: `chronicler/db/schema.sql`

Add columns to `units` table: `birth_year INT`, `sex INT`, `death_cause TEXT`.
Personality, relationships, and attributes go into `details` JSONB.

### 2.6 Watcher Sync: Expanded fields

**File**: `chronicler/dfhack/watcher.py`

Write new bridge fields to `units` table columns + `details` JSONB on each sync cycle.

### 2.7 Live Event Generator: `chronicler/events.py`

**File**: `chronicler/events.py` (NEW)

`EventGenerator` class detecting state transitions and writing `history_events` records:
- Event IDs start at max(legends_event_id) + 10,000 to avoid collision
- All events written with `live_generated = TRUE`, `source = 'live_watcher'`

**Event types for Phase 2 (first 3)**:

| Event | Detection Method | HF Event Type |
|-------|-----------------|---------------|
| Death | `is_alive` transition FALSE or unit disappearance | `hf died` |
| Profession change | `profession` field diff between cycles | `change creature type` |
| Skill milestone | Skill level crosses threshold (Proficient→Expert→Master→Legendary) | `skill milestone` (custom) |

Additional event types (marriage, birth, artifact, arrival, departure) deferred to Phase 5.

### 2.8 Watcher ↔ Event Generator Integration

**File**: `chronicler/dfhack/watcher.py`

Instantiate `EventGenerator` per cycle. Feed state diffs from change detector:
- Death detection → `event_gen.record_death()`
- Profession change → `event_gen.record_profession_change()`
- Skill level crossing threshold → `event_gen.record_skill_milestone()`

### 2.9 XML Parser: Re-import idempotency

**File**: `chronicler/ingest/xml_parser.py`

When importing legends XML:
- Preserve `embark` flag on `ON CONFLICT DO UPDATE`
- If a synthetic HF exists and authoritative HF data arrives, replace synthetic data but keep `embark = TRUE`

### 2.10 User Documentation

**File**: `chronicler/docs/` or README

Instructions for post-embark legends re-export:
> "For best results, export legends from DFHack after embarking (`exportlegends` command). This ensures all starting dwarves have complete Historical Figure records."

### Phase 2 Verification

- [ ] Post-embark export: embark dwarves in `historical_figures` with `embark = TRUE`, NO synthetic flag
- [ ] Pre-embark export only: embark dwarves get synthetic HF records with Unit-sourced relationships
- [ ] Kill a dwarf → death event in `history_events` with `live_generated = TRUE`
- [ ] Change profession → profession change event generated
- [ ] Skill crosses Legendary → skill milestone event generated
- [ ] `units` table has `birth_year` and `sex` populated from bridge
- [ ] `details` JSONB includes personality, relationships, attributes
- [ ] Re-import legends XML → synthetic data replaced, `embark` flag preserved

### Phase 2 Files Summary

| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/db/schema.sql` | MODIFY — embark, unit cols, event cols | ~15 |
| `chronicler/synthetic.py` | NEW — embark HF fallback | ~120 |
| `chronicler/events.py` | NEW — live event generator | ~200 |
| `chronicler/dfhack/scripts/chronicler-bridge.lua` | MODIFY — expand extraction | ~120 |
| `chronicler/dfhack/watcher.py` | MODIFY — sync new fields + event gen | ~80 |
| `chronicler/ingest/xml_parser.py` | MODIFY — embark preservation | ~20 |

---

## Phase 3: Agentic Storyteller + Explorer Integration

**Effort**: 8-10 hours
**Depends on**: Phase 2 (live events + denizen registry + unified data)
**Goal**: LLM autonomously explores the database via SQL tool-use; explorer shows fortress-centric views.

### 3.1 SQL Tool Definition

**File**: `chronicler/storyteller/agent.py` (NEW)

Read-only `query_database` tool with:
- Safety: keyword blocklist + `asyncpg readonly=True` transaction
- Row limit: 50 rows max, LIMIT injection if not present
- Timeout: 5s per query
- Schema defined in PRD v2.2 Section 7.

### 3.2 Agentic Loop

**File**: `chronicler/storyteller/agent.py`

Multi-round LLM → SQL → results → LLM cycle (max 5 rounds). On `end_turn`, return narrative. On max rounds, ask LLM to conclude with gathered data.

### 3.3 Schema Summary Builder

**File**: `chronicler/storyteller/agent.py`

Auto-generated table/column/rowcount summary for LLM system prompt (~2K tokens). Cached, updated on server start.

### 3.4 Denizen Summary Builder

**File**: `chronicler/storyteller/agent.py`

Top 10 denizens by NVS + recent events for LLM context.

### 3.5 Unified Person Builder: `chronicler/storyteller/person.py`

**File**: `chronicler/storyteller/person.py` (NEW)

`build_unified_person(conn, world_id, identifier)`:
- Accepts unit_id, hf_id, or name search
- Merges Unit + HF data per `unit-hf-field-mapping.md`
- Returns the unified JSON schema

### 3.6 Agentic System Prompt

**File**: `chronicler/storyteller/prompts.py`

In-world chronicler persona with database access instructions. Includes schema summary, denizen context, world_id constraint. Full prompt defined in PRD v2.2 Section 7.

### 3.7 Config Toggle

**File**: `chronicler/config.py`

`storyteller_mode: "agentic" | "keyword"` — defaults to `agentic`, falls back to existing keyword-routing.

### 3.8 Agentic API Endpoint

**File**: `chronicler/api/routes/storyteller.py`

SSE streaming endpoint for agentic responses. Tool calls hidden from UI; only final narrative streamed.

### 3.9 Explorer: Fortress Folk View

**File**: `chronicler/api/templates/explorer.html`

People tab enhancements:
- "Fortress Folk" default view: only `fortress_denizens` with `status IN ('resident', 'deceased', 'missing')`, sorted by NVS
- Status badges: Green (resident), Gray (departed), Red (deceased), Yellow (missing)
- Embark badge: Star icon for founding dwarves
- NVS column: Sortable narrative value score

### 3.10 Explorer: Unified Person Detail

**File**: `chronicler/api/templates/explorer.html`

Click any denizen → merged Unit + HF view:
- Combined personality + historical data
- Combined event timeline (legends + live-generated, chronologically sorted)
- Relationships from both sources

### 3.11 Denizen API Endpoint

**File**: `chronicler/api/routes/people.py`

- `GET /api/people/denizens?world_id=...&status=...&sort=nvs` — fortress denizens list
- `GET /api/people/unified/{identifier}` — unified person JSON

### Phase 3 Verification

- [ ] "Tell me about [fortress dwarf]" → LLM executes 2-3 queries, returns merged personality + history
- [ ] "Who died recently?" → LLM queries denizen registry + death events → accurate report
- [ ] "Tell me about my fortress" → LLM explores denizens, events, demographics → overview
- [ ] "Who killed the dwarf who was married to the mayor?" → multi-step query chaining works
- [ ] Config toggle: `storyteller_mode: keyword` reverts to v0.8 behavior
- [ ] Explorer People tab defaults to fortress denizens with NVS sort and embark badges
- [ ] Click any denizen → see merged Unit + HF + events view

### Phase 3 Files Summary

| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/storyteller/agent.py` | NEW — agentic loop + SQL tool | ~300 |
| `chronicler/storyteller/person.py` | NEW — unified person builder | ~150 |
| `chronicler/storyteller/prompts.py` | MODIFY — agentic system prompt | ~60 |
| `chronicler/storyteller/context.py` | RETAIN — fallback mode | ~0 |
| `chronicler/config.py` | MODIFY — storyteller_mode toggle | ~5 |
| `chronicler/api/routes/storyteller.py` | MODIFY — agentic endpoint | ~80 |
| `chronicler/api/routes/people.py` | MODIFY — denizen endpoints | ~60 |
| `chronicler/api/templates/explorer.html` | MODIFY — fortress folk + unified detail | ~200 |

---

## Phase 4: Events Tab + Knowledge Horizon Stub

**Effort**: 4-6 hours
**Depends on**: Phase 3 (agentic storyteller for horizon integration)
**Goal**: Browsable event timeline with source filtering; initial Knowledge Horizon constraints.

### 4.1 Events API

**File**: `chronicler/api/routes/events.py` (NEW)

- `GET /api/events?world_id=...&year_min=...&year_max=...&type=...&hf_id=...&source=...` — filtered event list
- `GET /api/events/collections?world_id=...` — war/battle/siege collection trees

### 4.2 Events Tab UI

**File**: `chronicler/api/templates/explorer.html`

From shiny-churning-sprout Phase 4 (NOT STARTED):
- Chronological event table with clickable participants and locations
- Source filter: "All Events" / "Legends Only" / "Live Only"
- Year range slider
- Event type filter dropdown

### 4.3 Event Detail Cards

**File**: `chronicler/api/templates/explorer.html`

Context-aware rendering following the **weblegends** pattern:
- Circumstance/reason fields where available
- Clickable entity references (HFs, sites, entities)

### 4.4 Event Collection View

**File**: `chronicler/api/templates/explorer.html`

Expandable war → battle → event trees (benchmarking **LegendsBrowser2** collection summarization).

### 4.5 Knowledge Horizon Table

**File**: `chronicler/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_type     TEXT NOT NULL,  -- 'hf', 'site', 'entity', 'event'
    entity_id       INT NOT NULL,
    visibility      TEXT NOT NULL DEFAULT 'unknown',
        -- 'visible'  : Within fortress knowledge
        -- 'inferred' : Known through relationships
        -- 'unknown'  : Outside fortress knowledge
    source          TEXT,           -- How visibility was determined
    UNIQUE (world_id, entity_type, entity_id)
);
```

### 4.6 Horizon Population

**File**: `chronicler/horizon.py` (NEW)

Script to set initial visibility based on denizen registry:
- All denizens → `visible`
- 1-hop relationships of denizens → `inferred`
- Everything else → `unknown`

### 4.7 Horizon Integration with Agentic LLM

**File**: `chronicler/storyteller/prompts.py`

Add horizon constraints to agentic system prompt:
> "Scope your queries through the fortress_denizens table. Do not speculate about entities outside the fortress's knowledge."

### Phase 4 Verification

- [ ] Events tab: filter by year range, type, participant → correct results
- [ ] Source filter: "Live Only" shows fortress events, "Legends Only" shows pre-fortress
- [ ] War/battle collections expandable in tree view
- [ ] Knowledge Horizon table populated from denizen registry
- [ ] Agentic LLM respects horizon constraints (doesn't volunteer unknown entities)

### Phase 4 Files Summary

| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/api/routes/events.py` | NEW — events endpoints | ~120 |
| `chronicler/api/templates/explorer.html` | MODIFY — events tab + horizon toggle | ~250 |
| `chronicler/db/schema.sql` | MODIFY — knowledge_horizon table | ~15 |
| `chronicler/horizon.py` | NEW — horizon computation | ~80 |
| `chronicler/storyteller/prompts.py` | MODIFY — horizon constraints | ~15 |

---

## Phase 5: Polish + Long-Term Features

**Effort**: Ongoing
**Goal**: Quality-of-life improvements and advanced capabilities.

### Priority Order

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1 | Accent-insensitive search (`unaccent` extension) | rippling Phase 1 | 1 hr |
| 2 | Age calculation display | rippling Phase 2 | 1 hr |
| 3 | Position table enhancement (gender-appropriate titles) | rippling Phase 5 | 1 hr |
| 4 | Sidebar sort/filter | rippling Phase 6 | 2 hrs |
| 5 | Load members enhancement | rippling Phase 7 | 1 hr |
| 6 | Additional live event types (marriage, birth, artifact, mood, arrival/departure) | PRD v2.2 §5 | 4 hrs |
| 7 | Narrative engine (proactive story generation) | session-state | 6-8 hrs |
| 8 | Skills time-series tracking | session-state | 3-4 hrs |
| 9 | Full Knowledge Horizon with all 7 caveats | knowledge-horizon.md | 6-8 hrs |
| 10 | Interactive maps (Leaflet.js) | benchmark LegendsViewer-Next | 6-8 hrs |
| 11 | Family tree visualization | benchmark LegendsViewer-Next | 4-6 hrs |
| 12 | Global figure scoring (df-narrator formula) alongside NVS | PRD v2.2 §10 | 2 hrs |

### Items 1-5: Deferred from rippling-honking-crescent

These are UI polishing items that were planned but not yet implemented. They can be done independently of Phases 1-4 at any time.

### Items 6-12: Post-v1.0 Enhancements

These build on the v1.0 foundation (denizen registry, live events, agentic storyteller, knowledge horizon) and represent the path toward v1.5/v2.0.

---

## Dependency Graph

```
Phase 1: Denizen Registry
    ├── fortress_denizens table
    ├── death detection
    ├── embark identification
    └── NVS computation
         │
         ▼
Phase 2: Embark HF + Events
    ├── embark column on historical_figures
    ├── synthetic HF fallback
    ├── bridge expansion (unit fields)
    ├── live event generator (3 types)
    └── watcher ↔ event gen integration
         │
         ▼
Phase 3: Agentic Storyteller
    ├── SQL tool definition + safety
    ├── agentic loop (multi-round)
    ├── unified person builder
    ├── explorer fortress folk view
    └── config toggle (agentic/keyword)
         │
         ▼
Phase 4: Events Tab + Horizon
    ├── events API + UI tab
    ├── event collection trees
    ├── knowledge_horizon table
    └── horizon constraints in LLM prompt

Phase 5 (independent items):
    ├── Items 1-5: Can start any time (UI polish)
    └── Items 6-12: Depend on Phases 1-4 (post-v1.0)
```

---

## Active Plan Consolidation

### Plans Fully Complete (reference only)

| Plan File | Description | Status |
|-----------|-------------|--------|
| `sparkling-sauteeing-snowglobe.md` | Entity Position Extraction | COMPLETE |
| `woolly-swinging-naur.md` | Database Explorer (Schema/Data/Graph) | COMPLETE |

### Plans With Remaining Work

| Plan File | Done | Remaining | Maps to Roadmap |
|-----------|------|-----------|-----------------|
| `rippling-honking-crescent.md` | Phases 1-7 | Phase 3 (unit data expansion), Phase 8 (KH stub) | Phase 2 (bridge expansion), Phase 4 (KH) |
| `shiny-churning-sprout.md` | People, Civs, Geo tabs | Events & Timeline tab | Phase 4 (events tab) |

### PRD v2.2 Sections → Roadmap Phases

| PRD Section | Content | Roadmap Phase |
|-------------|---------|---------------|
| §3 Denizen Registry | Table, NVS, death detection | Phase 1 |
| §4 Data Unification | Embark HF, person merge, death enhancement | Phases 1-3 |
| §5 Live Event Generation | EventGenerator, watcher integration | Phase 2 |
| §6 Explorer Enhancement | Fortress folk, events tab | Phases 3-4 |
| §7 Agentic Storyteller | SQL tool-use, agentic loop | Phase 3 |
| §8 Bridge Expansion | Unit field extraction | Phase 2 |
| §9 Knowledge Horizon | Phased rollout | Phase 4 (stub), Phase 5 (full) |
| §10 Reference Benchmarking | Feature parity targets | Cross-cutting |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bridge deployment failures (VM offline) | MEDIUM | Test locally with mock data; deploy via SCP to VM |
| TCP RPC broken for game-thread calls | HIGH | Use `dfhack-run` over SSH as primary transport; TCP RPC only for cached calls |
| NVS formula bias toward oldest dwarves | LOW | Tune weights iteratively; recency decay prevents stale dominance |
| Post-embark legends re-export unavailable | LOW | Synthetic HF fallback works automatically |
| Synthetic HF data conflicts with later re-import | LOW | `ON CONFLICT DO UPDATE` replaces synthetic; `embark` preserved |
| Agentic LLM generates excessive queries (latency) | MEDIUM | Max 5 rounds; fallback to keyword mode; model-specific tuning |
| Agentic LLM writes invalid SQL | LOW | Readonly transaction + keyword blocklist + 5s timeout |
| Live event IDs collide with legends IDs | LOW | 10,000+ ID gap between max legends ID and first live ID |
| Knowledge Horizon too aggressive | MEDIUM | Advisory mode (system prompt) not enforcement (SQL views) |
| LLM context overflow with rich denizen data | MEDIUM | Schema summary ~2K tokens; results capped at 50 rows |

---

## Success Milestones

### v0.9 (Phases 1-2 Complete)

The database tracks every fortress-relevant being. Embark dwarves have HF records. Deaths and state transitions generate events. Unit data extraction is comprehensive.

**Key metric**: An embark dwarf who kills a goblin, changes profession, and reaches Legendary skill has 3+ live-generated events in `history_events`.

### v1.0 (Phases 1-4 Complete)

The storyteller autonomously explores the database. The explorer shows fortress-centric views. Events are browsable with source filtering. Knowledge Horizon provides initial scoping.

**Key metric**: "Who killed the dwarf who was married to the mayor?" returns an accurate, evidence-cited narrative in under 15 seconds.

### v1.5+ (Phase 5 Items)

Proactive narrative generation, full Knowledge Horizon with all 7 caveats, interactive maps, family trees, skills time-series.

---

## Reference Documents

| Document | Path | Role |
|----------|------|------|
| PRD v2.2 | `projects/chronicler/designs/chronicler-prd-v2.md` | Source of truth for architecture |
| Phase 1 Detailed Plan | `projects/chronicler/designs/phase-1-denizen-registry.md` | Standalone Phase 1 implementation plan |
| Unit-HF Field Mapping | `projects/chronicler/designs/unit-hf-field-mapping.md` | Merge strategy |
| Knowledge Horizon Design | `projects/chronicler/designs/knowledge-horizon.md` | Phase 4+ architecture |
| Data Gap Analysis | `projects/chronicler/reports/data-gap-analysis-2026-02-22.md` | Gap catalog |
| Gap Closure Review | `projects/chronicler/reports/gap-closure-critical-review.md` | Phases 0-4 execution |
| UI Enhancements Plan | `.claude/plans/rippling-honking-crescent.md` | Remaining: Phase 3, 8 |
| Explorer Redesign Plan | `.claude/plans/shiny-churning-sprout.md` | Remaining: Events tab |
| Mac Studio Roadmap | `.claude/plans/mac-studio-db-ai-roadmap.md` | Infrastructure context |

---

*Chronicler Development Roadmap v1.1*
*Session 34, 2026-02-24*
*Consolidates: PRD v2.2, 4 active plans, gap analysis, user corrections, dfhack-run SSH transport discovery*
