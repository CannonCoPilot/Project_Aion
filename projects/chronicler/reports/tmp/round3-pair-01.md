# Round 3 Consolidation: Core Planning, Implementation & Data Pipeline

**Sources**: round2-pair-01.md (Core Planning & Phase Implementation) + round2-pair-02.md (Data Pipeline & Ingestion Systems)
**Consolidated**: 2026-02-25
**Round**: 3 / Final Pair 01

---

## Complete Feature Inventory

### Current State (v0.8) — What Is Built

| Component | Status | Key Metrics / Notes |
|-----------|--------|----------------------|
| CDM PostgreSQL Schema | COMPLETE | 35 tables, composite PKs, 109K records |
| Legends XML Parser | COMPLETE | lxml iterparse, 141 event types, lossless capture, streaming capable (>25 MB files) |
| Lua Bridge | COMPLETE | v6, 16 sections, 7 data domains, HTTP on port 8888 |
| Watcher | COMPLETE | `chronicler watch`, 3+ cycles verified, graceful shutdown |
| Change Detector | COMPLETE | 11 event types: death, mood, stress, pregnancy, ghost, etc. (watcher.py); 5 types in detector.py: ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED |
| Explorer | COMPLETE | 6 tabs: People, Civilizations, Geography, Schema, Data, Graph |
| Entity Positions | COMPLETE | 11,712 position definitions + 13,501 assignments + 41,199 historical links extracted |
| Storyteller | COMPLETE | Keyword→SQL routing, dual-tier context (HISTORICAL + LIVE), 12,000-char budget, 5 live data retrieval paths, 23 routes |
| Test Suite | COMPLETE | 131 tests, composite PK correctness, all passing in 0.19s |
| Explorer UI Enhancements | COMPLETE | Phases 1-7 of rippling-honking-crescent plan |
| Live Polling Daemon (core) | COMPLETE | `chronicler watch` CLI; fallback chain; bridge storage; change detection |
| Lua Probes (initial) | COMPLETE | `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)` |
| Monitoring System | NOT STARTED | ~230 LOC, 3 new files, 4 modified files |
| RAG Indexing | PARTIAL | dfhack 8,476 pts; dwarf-therapist 926 pts; df-wiki 4 pts |

**Live world data confirmed** (world "The Land of Dawning", year 250, 257×257):
- 48,366 historical figures
- 442,716 history events
- 4,901 entities (8 dwarf civs, 8 human, 8 elf, 9 goblin, 8 kobold + underground)
- 8,035 artifacts
- 2,154 sites
- 2,278 regions

**Database note**: DB currently holds world "Namoram" from legends XML; live VM runs "The Land of Dawning". Phase 1 (denizen registry) works with either — populated from live data regardless of which world's legends are in the DB.

**Web UI**: Live at `localhost:8080`. Full SSE streaming from Qwen3-8B via LiteLLM. Two worlds queryable: Namoram (world 5, 109K records) and Ormon (1.54M records).

---

### Gap Closure Work — All Complete (Session 32, 2026-02-22)

All gap-closure phases were completed before denizen registry development begins. ~70% was already implemented before the revised v2 plan was written; Session 32 audit confirmed this and completed the remainder.

#### Phase 0: Data Integrity Fixes — DONE

- **BUG-005 (kill_count)**: Was LEFT JOIN'd to event_count (mirroring wrong count); was grouping by `hf_id_1` (victim) instead of `hf_id_2` (slayer). Fixed to independent UPDATE with correct grouping. Result: 8,680 figures updated, max kill count rose from 3 to 146.
- **BUG-006 (link table UNIQUE constraints)**: Deduped 4,679 rows from `hf_links` and 23 from `hf_entity_links`. Added UNIQUE constraints: `uq_hf_links`, `uq_hf_entity_links`, `uq_hf_site_links`. Updated ON CONFLICT: hf_links/hf_site_links → DO NOTHING; hf_entity_links → DO UPDATE SET position_name.
- **BUG-008 (region parsing scope)**: Changed `.//region` → `regions/region` and `.//underground_region` → `underground_regions/underground_region`. Verified: 240/240 regions and 125/125 underground_regions match.
- **BUG-001/REFL-023**: Boolean flag debugging (deities, vampires, necromancers, werebeasts).
- **BUG-003 (site ownership)**: Fixed from legends_plus `cur_owner_id`.

#### Phase 1: Composite PK Migration — DONE

- All 13 legends tables migrated to `PRIMARY KEY (world_id, id)`.
- Link tables received `world_id` column, composite UNIQUE constraints, and composite FKs.
- `structures` table: PK = `(world_id, site_id, id)`, FK to sites composite.
- `collection_events`/`collection_subcollections`: world_id + composite FKs.
- Resolves 10,932 cross-world ID collisions.
- Recovered 5,466 HFs from world "Namoram" (previously lost to ID collision with world "Ormon").
- Post-migration totals: 60,787 total HFs (was 55,321; 9.9% data restoration).
  - World 1 (Namoram): 5,466 HFs, 29,682 events.
  - World 2 (Ormon): 55,321 HFs, 566,973 events.
- Backup taken before migration: `chronicler-pre-migration.dump` (17MB).

#### Phase 2: Storyteller Enrichment — DONE

- **Relationship traversal on HF match**: queries `hf_links` for spouse/children/parents, `hf_entity_links` for civ memberships and positions, `hf_site_links` for associated sites.
- **Event payload enrichment**: JOINs to resolve hf_id → name, site_id → name. Natural-language templates for 6 event types. `_summarize_details()` for JSONB fields. Example: "Bomrek was slain by Urist at Goldenhall in year 253".
- **Emotion/zone integration in live unit queries**: `_build_emotion_map()` matches latest `dwarf_emotions` probe to unit IDs; `_build_zone_owner_map()` resolves owner → zone name.
- **War name resolution**: JOINs collection queries to resolve entity IDs → names in 3 locations.
- **Confidence signaling**: context density note prepended to all retrieval results. If < 3 records: caution warning. If > 10 records: rich context note.
- **HF-to-unit cross-reference**: `_retrieve_live_units()` JOINs to historical_figures.

#### Phase 3: XML Completeness — DONE

- **`written_contents` table**: composite PK (world_id, id), dual-source parsing (legends.xml + legends_plus.xml). Imported: 61,692 written contents across 2 worlds.
- **`historical_eras` table**: composite PK (world_id, name), start_year = -1 preserved. Imported: 2 eras.
- **Region parsing verified and fixed**: underground_regions backfilled with type/depth from legends.xml. All 1,570 underground_regions corrected (0 NULLs remaining).
- **Entity Position Extraction**: position definitions and historical/active assignment links fully extracted and stored (11,712 definitions, 13,501 assignments, 41,199 historical links).

#### Phase 4: Operational Hardening — DONE

- 131-test suite, all passing in 0.19s.
  - `test_xml_parser.py`: 26 tests
  - `test_context.py`: 30 tests
  - `test_detector.py`: 29 tests
  - `test_schema.py`: 46 tests
- **`lua_probes` retention policy**: keep last N per probe_name per world_id via `_cleanup_lua_probes_count()`. Cleanup every 10 watcher cycles.
- **Bridge health monitoring**: consecutive failure counter, warn after 3 failures, continue with core-only data.

---

### Target State (v1.0) — Three Pillars

1. **Denizen-Centric Data**: Every fortress-relevant being tracked in a registry; Unit+HF data merged; live events recorded as they happen.
2. **Agentic Intelligence**: LLM autonomously queries the database, exploring relationships and events through iterative SQL execution until it can provide an evidence-based response.
3. **Domain-Specific Explorer**: Fortress-centric views (People, Events, Civilizations, Geography) with cross-linking, NVS sorting, and Knowledge Horizon masking.

**Mental model**: The denizen registry is the root node of the Knowledge Horizon graph. The agentic storyteller is an autonomous analyst with read-only database access, not a retrieval pipeline.

---

### Four Strategic Priorities (v0.8 → v1.0)

1. **Denizen Registry** — Gateway table tracking every being who has touched the fortress; root node for all queries; anchor for Narrative Value Scores. The "keystone table" — every subsequent phase depends on it.
2. **Embark-Aware Data Unification** — Post-embark legends re-export as primary path; synthetic HF records only as fallback; relationships sourced from Unit data, not heuristic guessing.
3. **Live Event Generation** — Convert runtime state transitions (kills, marriages, deaths, profession changes) into `history_events`-compatible records; gives fortress-born entities a proper event history.
4. **Agentic Storyteller** — Replace keyword-routed extraction with an LLM that autonomously executes SQL queries, performing iterative rounds of data exploration to build evidence-based responses.

---

### Identified Gaps (v0.8 → v1.0)

| Gap | Impact | Assigned Phase |
|-----|--------|----------------|
| No "who matters" concept | LLM searches 60K+ HFs equally | Phase 1 |
| Embark dwarves may lack HF records | Starting dwarves invisible to storyteller | Phase 2 |
| No live event generation | Fortress-born entities have zero event history | Phase 2 |
| No death detection beyond flag check | Deaths go undetected when units disappear | Phase 1 |
| No unified person view | Unit and HF treated as separate entities | Phase 3 |
| Static keyword→SQL routing | Can't handle novel questions or multi-hop reasoning | Phase 3 |
| No Events tab | Event browsing missing from explorer | Phase 4 |
| No Knowledge Horizon | No dynamic visibility scoping | Phase 4-5 |
| Unit data extraction incomplete | ~15 fields captured out of 100+ available | Phase 2 |
| No monitoring/observability for storyteller | Cannot diagnose LLM quality or performance | Monitoring backlog |
| No RAG knowledge base for Chronicler dev | AI components lack DF reference knowledge | RAG backlog |

---

### Phase 1 Features: Denizen Registry + Death Detection

**Estimated effort**: 6-8 hours
**Status**: PLANNED, NOT YET STARTED (all prerequisites met as of 2026-02-24)

**Prerequisites satisfied**:
- [x] Composite PK migration complete (Session 32)
- [x] 131-test suite passing
- [x] Bridge v6 with 16 sections deployed
- [x] Watcher verified E2E (`chronicler watch`)
- [x] Change detector handling 11 event types
- [x] Explorer 6-tab structure complete
- [x] `dfhack-run` over SSH verified working

#### Denizen Registry (`fortress_denizens` table)

Purpose: tracks every unit/HF who has been present at, lived at, visited, attacked, skulked around, or otherwise interacted with the fortress. Serves three purposes:
1. LLM Gateway — agentic storyteller starting point for most queries
2. Narrative Value Scoring — composite importance score (0-100)
3. Death Tracking — registry of known denizens enables "fell off radar" detection

**Status values**:
- `resident` — currently living in fortress
- `departed` — left alive (migrated out, caravan departed)
- `deceased` — confirmed dead
- `missing` — was resident, now absent (no departure/death event)
- `visitor` — temporary presence (diplomat, merchant, performer)
- `attacker` — hostile presence (siege, ambush)
- `skulker` — covert presence (thief, snatcher)
- `historical` — known only from legends/relationships, never physically present

**Valid status transitions**:
- `resident` → `missing` (unit disappeared without death flag)
- `resident` → `deceased` (is_alive = FALSE or death event)
- `resident` → `departed` (left fortress)
- `missing` → `deceased` (confirmed dead after investigation)
- `missing` → `resident` (reappeared — false alarm)

**Population sources**:
| Source | Trigger | Status Set | Embark? |
|--------|---------|------------|---------|
| Watcher detects new unit | Unit appears in bridge `unit_summary` | `resident` | See embark logic |
| First watcher cycle | Unit count ≤ starting count, no prior watcher data | `resident` | `TRUE` |
| Watcher detects unit departure | Unit no longer in `unit_summary`, no death flag | `missing` → investigate | — |
| Bridge `announcements` | "A human caravan has arrived", "An ambush!" | `visitor` / `attacker` | — |
| Bridge `armies` | Army controller matches hostile entity | `attacker` | — |
| Legends XML import | HF with `hf_site_links` to fortress site | `historical` | — |
| Relationship chain | Spouse/parent/child of a `resident` | `historical` | — |

**Embark detection logic**: On the first watcher cycle (no prior `fortress_denizens` entries for the world_id — detected by checking if fortress_denizens has zero entries), all detected units are marked `embark = TRUE`. Subsequent arrivals are NOT embark dwarves. The `embark` flag is permanent once set.

**Field-by-field description**:
- `id`: SERIAL PRIMARY KEY
- `world_id`: INT NOT NULL REFERENCES worlds(id)
- `unit_id`: INT (nullable — denizen can be known from HF without live unit record)
- `hf_id`: INT (nullable — denizen can be known from unit without matched HF)
- `name`: TEXT NOT NULL
- `english_name`: TEXT
- `race`: TEXT
- `status`: TEXT NOT NULL DEFAULT 'unknown'
- `embark`: BOOLEAN DEFAULT FALSE
- `arrival_year`: INT — when first detected at fortress
- `arrival_tick`: INT
- `departure_year`: INT
- `departure_tick`: INT
- `departure_cause`: TEXT — 'death', 'departure', 'unknown'
- `narrative_value`: FLOAT DEFAULT 0.0 — 0.0 to 100.0
- `last_seen_tick`: INT — last watcher cycle where this denizen was observed
- `details`: JSONB DEFAULT '{}' — extended metadata (roles, notable events, etc.)
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()
- UNIQUE (world_id, unit_id)
- UNIQUE (world_id, hf_id)

Both UNIQUE constraints are separate so that a denizen can have one without the other.

#### Narrative Value Score (NVS)

Composite score 0-100 reflecting a denizen's storytelling importance. Recomputed per watcher cycle. Draws from **df-narrator** scoring approach adapted for fortress context.

Formula:
```
NVS = (screen_time × 0.30) + (event_density × 0.25) +
      (relationship_depth × 0.20) + (recency × 0.15) +
      (status_weight × 0.10)
```

Each component normalized 0.0–1.0; final score scaled to 0.0–100.0.

| Component | Weight | Calculation |
|-----------|--------|-------------|
| screen_time | 30% | Watcher cycles where this denizen was observed ÷ total cycles |
| event_density | 25% | Count of `history_events` (HF + live-generated) involving this entity / max events any denizen |
| relationship_depth | 20% | Number of `hf_links` + unit relationships to other denizens / max relationships |
| recency | 15% | 1.0 - (ticks_since_seen / max_ticks_since_seen) — inverse of ticks since last observation |
| status_weight | 10% | `resident`=1.0, `deceased`=0.8, `visitor`=0.5, `historical`=0.3 |

Additional NVS rules:
- Deceased denizens retain historical scores (recency frozen at departure tick).
- Denizens with no HF link: event_density=0, relationship_depth=0, still score on screen_time, recency, status_weight.
- Edge case: first cycle — total_cycles=1, all denizens have screen_time=1.0.
- Edge case: NVS denominator guard — floor of 1 to avoid division by zero.
- `compute_all_nvs` runs per watcher cycle.

**df-narrator global scoring formula** (for comparison):
```
score = min(events × 2, 500) + kills × 15 + type_bonus + links × 3 + positions × 20 + artifacts × 30
```

Key difference: df-narrator ranks globally (who is most important in world history); NVS ranks locally (who is most important to the fortress's story). Chronicler should compute BOTH scores. Global df-narrator scoring alongside NVS is a Phase 5 feature.

#### Death Detection (Enhanced)

Four detection mechanisms:
1. **Direct detection (flag/is_alive)**: Unit `is_alive` flag transitions FALSE OR `killed` flag set → mark `deceased`, generate `UNIT_DIED` live event.
2. **Absence detection**: Denizen with `status = 'resident'` not observed for N consecutive watcher cycles → mark `missing`.
3. **Announcement correlation**: "X has been struck down" announcement → match name → mark `deceased`, generate event.
4. **History event correlation**: `HIST_FIGURE_DIED` event with matching `hf_id` → mark `deceased`.

The `missing` status captures cases where a dwarf simply disappears (killed by a forgotten beast, fell into chasm, loyalty cascade) without a clean death event. After N consecutive missing cycles, status escalates to `presumed_deceased`.

#### Phase 1 Module: `chronicler/denizens.py` (~200 lines, new file)

Core function signatures:
- `register_denizen(conn, world_id, unit, is_embark)` — insert or update
- `update_denizen_status(conn, world_id, unit_id, new_status, cause, year, tick)` — status transitions
- `link_hf(conn, world_id, denizen_id, hf_id)` — link to historical_figures record
- `compute_nvs(conn, world_id, denizen_id)` — NVS formula for one denizen
- `compute_all_nvs(conn, world_id)` — recompute for all denizens in one cycle
- `get_fortress_denizens(conn, world_id, status_filter, sort_by, limit)` — query with filters
- `detect_embark_dwarves(conn, world_id, units)` — returns list of unit IDs to mark embark

#### Phase 1 CLI Command: `chronicler denizens`

Options: `--world`, `--status`, `--sort` (nvs/name/arrival/status, default: nvs), `--limit` (default: 50)

Example output:
```
Fortress Denizens — World: The Land of Dawning (24 total)

  Name              Status    Embark  NVS    HF Link    Race    Arrived
  ─────────────────────────────────────────────────────────────────────
  Urist McAxe       resident  *       72.3   HF#12345   DWARF   Y250
  Kel Sworddawn     resident  *       68.1   HF#12346   DWARF   Y250
  Olin Sealrage     deceased  *       54.7   HF#12349   DWARF   Y250
  Mafol Bridger     resident          41.2   HF#15001   DWARF   Y251
```

#### Phase 1 HF Linking

HF linking occurs at three points:
1. During denizen registration (when unit data includes `hist_fig_id`)
2. After legends XML import (when HF records become available for previously unit-only denizens)
3. After post-embark legends re-export (Phase 2) — when embark dwarves gain HF records

Denizens without matching HFs have `hf_id = NULL`.

#### Phase 1 Test Suite

New file: `tests/test_denizens.py` (~250 lines). 12 required test cases:
1. `test_register_denizen_new`
2. `test_register_denizen_idempotent`
3. `test_embark_detection_first_cycle`
4. `test_embark_detection_subsequent_cycle`
5. `test_death_detection_flag`
6. `test_death_detection_absence`
7. `test_nvs_computation`
8. `test_nvs_ordering`
9. `test_hf_linking`
10. `test_status_transitions`
11. `test_get_fortress_denizens_filters`
12. `test_cli_denizens_command`

Coverage target: `denizens.py` > 80%. No regressions in existing 131-test suite.

---

### Phase 2 Features: Embark HF Handling + Unit Data Expansion + Live Event Generator

**Estimated effort**: 6-8 hours
**Depends on**: Phase 1 (denizen registry must exist for embark detection)

#### Embark-Aware HF Handling (Gap G1)

**Problem**: The 7-20 starting dwarves have `hist_fig_id` values beyond the pre-embark legends XML export range. They exist as Units but may have no Historical Figure records.

**Primary solution**: Post-embark legends re-export from the live fortress using DFHack's `exportlegends` command. This updated XML pair includes HF records for all dwarves created at embark.

**Fallback solution**: Generate synthetic HF records from Unit data when embark dwarves' `hist_fig_id` values aren't found in HF records.

**Key design decisions**:
1. Post-embark re-export is PRIMARY — user documentation must instruct
2. Synthetic HFs are FALLBACK ONLY
3. `embark` flag — new `BOOLEAN` column on `historical_figures` table
4. Relationships from Unit records — from `details.relationships[]` field (9 slots), NOT heuristic guessing
5. Idempotent on re-import — `ON CONFLICT DO UPDATE` replaces synthetic data with authoritative legends data while preserving `embark` flag

#### Unit↔HF Merge for Storyteller (Gap G2)

**Solution**: Unified Person Builder — new module `chronicler/storyteller/person.py`

**Merge strategy**:
1. Start with Unit data (always fresher for live entities)
2. Overlay HF data for historical depth (relationships, events, positions)
3. For conflicts: prefer Unit for real-time state, HF for historical facts
4. Personality data is Unit-only (not in legends XML)
5. Event history: HF events from legends XML + live-generated events from Event Generator

**Implementation**: `build_unified_person(conn, world_id, identifier)` → unified JSON; accepts unit_id, hf_id, or name search.

#### Bridge Expansion (Unit Data Fields)

| Field | Effort | Priority |
|-------|--------|----------|
| `birth_year`, `sex`, `death_cause` | ~15 lines Lua | HIGH |
| Relationships (9 slots) | ~15 lines Lua | HIGH |
| Personality traits (50 facets) | ~60 lines Lua | MEDIUM |
| Physical/mental attributes | ~30 lines Lua | LOW |
| `cultural_identity` | ~2 lines Lua | LOW |

Schema additions to `units` table: `birth_year INT`, `sex INT`, `death_cause TEXT`. Personality, relationships, and attributes go into `details` JSONB.

#### Live Event Generation (New Capability)

Generates EVENT records from live in-game data, written to the same `history_events` table as legends XML events. Essential for fortress-born entities (embark dwarves, babies born in-fortress) who have no pre-existing HF event history.

**Event types to generate**:

| Event Type | Detection Method | Maps to HF Event Type |
|-----------|------------------|----------------------|
| Death | `is_alive` transition FALSE, or unit disappearance | `HF_DIED` |
| Kill | Attacker's `kill_count` increases between cycles | `HF_SIMPLE_BATTLE_EVENT` |
| Marriage | New spouse relationship appears in unit data | `ADD_HF_HF_LINK` (spouse) |
| Childbirth | New unit appears with parent relationships pointing to fortress denizens | `HF_BORN` (custom) |
| Profession change | `profession` field changes between cycles | `CHANGE_CREATURE_TYPE` (approximate) |
| Position assignment | Position data changes (from entity_position_assignments) | `ASSUME_IDENTITY` or custom |
| Mood | Strange mood detected by change detector | `STRANGE_MOOD` (custom) |
| Artifact creation | New artifact appears in bridge data | `ARTIFACT_CREATED` |
| Arrival (migrant) | New unit detected by watcher, not first cycle | `MIGRANT_ARRIVED` (custom) |
| Departure | Unit disappears without death flag | `HF_LEFT_SITE` (custom) |
| Skill milestone | Skill level crosses threshold (Proficient→Expert→Master→Legendary) | `SKILL_MILESTONE` (custom) |
| Stress event | Stress level crosses critical thresholds | `STRESS_CRISIS` (custom) |

**Phase 2 implements first 3 event types**: death, profession change, skill milestone. Marriage, birth, artifact, mood, arrival/departure deferred to Phase 5.

**Event ID anti-collision**: Live-generated event IDs start at max(legends_event_id) + 10,000.

**Why this matters**: Without live event generation, embark dwarves and fortress-born characters appear to the storyteller with zero events despite potentially having the richest in-game stories.

#### New Bridge Section: Denizen Tracking

Lightweight `denizen_tracking` bridge section emitting minimal tracking data for ALL units. Capped at 500 entries.

Fields: `id`, `hist_fig_id`, `is_alive`, `pos` (x/y/z), `kill_count`.

#### New Bridge Section: Relationship Extraction

For embark dwarves and new arrivals, extract the 9 relationship slots from `u.status.current_soul.relationships`:
- `type` (unit_relationship_type enum)
- `histfig_id`
- `unit_id`

---

### Phase 3 Features: Agentic Storyteller + Explorer Integration

**Estimated effort**: 8-10 hours
**Depends on**: Phase 2 (live events + denizen registry + unified data)

#### Current Storyteller Architecture (v0.8 — to be replaced)

```
User question
  → extract_keywords()
  → stop-word filter
  → categorical routing (23 fixed routes) + ILIKE search
  → format_context()
  → 12,000 char budget
  → LLM (Qwen3 8B) generates response
```

Problems: fixed routing can't handle novel questions; no agency; no iterative refinement; can't follow chains of reasoning.

#### Target Agentic Storyteller Architecture (v1.0)

```
User question
  ↓
LLM receives system prompt with:
  - Database schema summary (table names, key columns, row counts)
  - SQL tool definition (read-only SELECT/WITH queries only)
  - Denizen registry summary (top denizens by NVS, recent events)
  - Instructions for autonomous data exploration
  ↓
LLM decides what to query → emits SQL tool call
  ↓
Tool executor: validates query (read-only), executes, returns results (max 50 rows)
  ↓
LLM analyzes results → may issue another query (up to N rounds, default 5)
  ↓
LLM composes final response with evidence citations
```

#### SQL Tool (`query_database`)

- **Name**: `query_database`
- **Input schema**: `{sql: string, reasoning: string}` — reasoning field required
- **Query types allowed**: SELECT or WITH (CTE) only
- **Safety layers (defense in depth)**:
  - keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE)
  - `asyncpg readonly=True` transaction (primary defense)
  - row limit enforcement (LIMIT injection if missing)
  - 5-second per-query timeout
- **Row limit**: 50 rows max
- **Databases described to LLM**: historical_figures, history_events, entities, sites, units, fortress_denizens, hf_links, hf_entity_links

#### Agentic Loop

- Max rounds: 5 (configurable)
- On `end_turn`: return final text response
- On `tool_use`: execute query, append result to message chain, continue
- On max rounds: ask LLM to conclude with gathered data
- SSE streaming: tool calls hidden from UI; only final narrative streamed

#### Agentic System Prompt (In-World Persona)

Key elements:
- Persona: "Chronicler, a scholar-narrator of Dwarf Fortress"
- Instructs: start with broad queries to orient, then narrow down
- ILIKE for name searches (names may be Dwarvish or English)
- Always include `world_id = {world_id}` in WHERE clauses
- Check both `historical_figures` AND `units` tables for fortress inhabitants
- Look at `fortress_denizens` for fortress-connected beings
- `live_generated = TRUE` events are from fortress observation — treat as highly reliable
- Response style: in-world chronicler; cite specific events/dates/relationships; acknowledge uncertainty; distinguish legends data from live observations; speculate cautiously about `missing` denizens

#### Schema Summary Builder

Auto-generated table/column/rowcount summary (~2K tokens). Cached, updated on server start.

#### Denizen Summary Builder

Top 10 denizens by NVS + recent events for LLM context.

#### Config Toggle

`storyteller_mode: "agentic" | "keyword"` in `chronicler/config.py`. Defaults to `agentic`. Existing keyword-routing retained as fallback.

#### LLM Model Options for Agentic Mode

| Model | Tool Use | Latency | Quality | Notes |
|-------|----------|---------|---------|-------|
| Claude Sonnet/Haiku via API | Native | ~2-3s TTFT | Excellent | Best tool use, API cost |
| Qwen3 32B via Ollama | Supported | ~5-8s TTFT | Good | Local, free, needs testing |
| Qwen3 8B via Ollama | Partial | ~0.4s TTFT | Moderate | Current model, may lack reliability |
| Llama 3.1 70B via Ollama | Supported | ~10s TTFT | Good | Local, proven tool use |

Recommendation: Start with Qwen3 32B for local development. For production quality, Claude Haiku via API offers best tool-use reliability at reasonable cost. System should support model swapping via config.

#### Explorer People Tab: Fortress Folk View

- "Fortress Folk" default view: only `fortress_denizens` where `status IN ('resident', 'deceased', 'missing')`, sorted by NVS
- Status badges: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark)
- NVS column: sortable narrative value score
- Embark badge: visual indicator for founding dwarves

#### Explorer Unified Person Detail

Click any denizen → merged Unit + HF view:
- Combined personality + historical data
- Combined event timeline (legends + live-generated, chronologically sorted)
- For `missing` denizens: timeline of last observations and nearby events ("death investigation")
- Relationships from both sources

#### Denizen API Endpoints

- `GET /api/people/denizens?world_id=...&status=...&sort=nvs` — fortress denizens list
- `GET /api/people/unified/{identifier}` — unified person JSON

---

### Phase 4 Features: Events Tab + Knowledge Horizon Stub

**Estimated effort**: 4-6 hours
**Depends on**: Phase 3 (agentic storyteller for horizon integration)

#### Events API Endpoints

- `GET /api/events?world_id=...&year_min=...&year_max=...&type=...&hf_id=...&source=...` — filtered event list
- `GET /api/events/collections?world_id=...` — war/battle/siege collection trees

#### Events Tab UI

- Chronological event table with clickable participants and locations
- Source filter: "All Events" / "Legends Only" / "Live Only"
- Year range slider
- Event type filter dropdown
- Default: showing only events at the fortress site or involving fortress denizens

#### Event Detail Cards

Context-aware rendering following the **weblegends** pattern:
- Circumstance/reason fields where available
- Clickable entity references (HFs, sites, entities)

#### Event Collection View

Expandable war → battle → event trees (benchmarking **LegendsBrowser2** collection summarization). Per-LegendsBrowser2: 100+ event type rendering, war/battle/siege tree structure.

#### Knowledge Horizon Table (`knowledge_horizon`)

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
    source          TEXT,
    UNIQUE (world_id, entity_type, entity_id)
);
```

#### Knowledge Horizon Population

Initial visibility from denizen registry:
- All denizens → `visible`
- 1-hop relationships of denizens → `inferred`
- Everything else → `unknown`

Position data (entity_positions + hf_position_links) feeds the KH tier-based visibility rules:
- Civilization nobles always visible
- Religion title-holders always visible

#### Knowledge Horizon — Phased Rollout Plan

| Phase | Scope | When |
|-------|-------|------|
| Phase 1 (current PRD) | Denizen registry as starting point for agentic queries | Immediate |
| Phase 2 | View-based masking for HFs (visible if denizen or 1-hop from denizen) | After Phase 1 validated |
| Phase 3 | Geographic masking (visible sites = fortress region + denizen origins) | After Phase 2 |
| Phase 4 | Full Knowledge Horizon with 7 caveats (CAV-001 through CAV-007) | Long-term |

In agentic architecture, Knowledge Horizon manifests as query constraints injected into the system prompt rather than database views. Default: advisory mode (system prompt) not enforcement (SQL views).

#### Horizon Integration with Agentic LLM

System prompt addition:
> "Scope your queries through the fortress_denizens table. Do not speculate about entities outside the fortress's knowledge."

---

### Phase 5 Features: Polish + Long-Term (Post-v1.0)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1 | Accent-insensitive search (`unaccent` extension) | rippling Phase 1 | 1 hr |
| 2 | Age calculation display | rippling Phase 2 | 1 hr |
| 3 | Position table enhancement (gender-appropriate titles) | rippling Phase 5 | 1 hr |
| 4 | Sidebar sort/filter | rippling Phase 6 | 2 hrs |
| 5 | Load members enhancement | rippling Phase 7 | 1 hr |
| 6 | Additional live event types (marriage, birth, artifact creation, mood, arrival/departure) | PRD v2.2 §5 | 4 hrs |
| 7 | Narrative engine (proactive story generation) | session-state | 6-8 hrs |
| 8 | Skills time-series tracking | session-state | 3-4 hrs |
| 9 | Full Knowledge Horizon with all 7 caveats (CAV-001 through CAV-007) | knowledge-horizon.md | 6-8 hrs |
| 10 | Interactive maps (Leaflet.js) | benchmark LegendsViewer-Next | 6-8 hrs |
| 11 | Family tree visualization | benchmark LegendsViewer-Next | 4-6 hrs |
| 12 | Global figure scoring (df-narrator formula) alongside NVS | PRD v2.2 §10 | 2 hrs |

Items 1-5 (UI polish deferred from rippling-honking-crescent): can start any time, independent of Phases 1-4.
Items 6-12 (post-v1.0): depend on Phases 1-4 foundation.

---

### Live Polling Daemon Features (Watcher / Bridge / Probes)

#### `chronicler watch` CLI

- Continuous game-state capture on configurable interval
- Change detection across 5 event types in detector.py: `ARRIVED`, `DIED`, `SKILL_UP`, `PROFESSION_CHANGED`, `SQUAD_CHANGED`
- Expanded change detection in watcher: 11 event types (death, mood, stress, pregnancy, ghost, etc.)
- CLI options: `--bridge-host`, `--interval`, `--enable-reports`, `--probe-interval`
- Silent bootstrap on first cycle: log "Synced N units, 0 events" + game year/tick without false-positive change events
- Store detected change events in `unit_events` table
- Store Lua probe results in `lua_probes` table
- Store per-run metadata in `sync_snapshots` table
- Graceful shutdown (Ctrl+C)

**Fallback chain for data access** (highest-to-lowest priority):
1. RemoteFortressReader (RFR) — NOT available on HomeServer (DFHack 53.10-r1). NOT usable on UTM VM for game-thread calls (CoreSuspender deadlock).
2. HTTP bridge JSON — primary working path for HomeServer.
3. Core RPC API (`ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads`).
4. Lua probes via `dfhack-run` over SSH — primary for UTM VM; fallback game-time source when bridge unavailable.

System must operate at full capability using only the RPC+bridge path when RFR is unavailable.

#### Lua Bridge Script (`chronicler-bridge.lua`)

- Runs as a DFHack `repeat` job every 100 ticks on the DFHack console thread (where `CoreSuspend` works correctly)
- Writes comprehensive game state to `chronicler-state.json`, served over HTTP on port 8888
- **Current state (v6)**: 16 sections, 7 data domains — fully implemented
- **Data domains captured via `df.global`**:
  - Game time: `df.global.cur_year`, `cur_year_tick`, `cur_season`
  - Fortress units: `df.global.world.units.active` — dwarves with stress, focus, names, squad assignments
  - Armies: `df.global.world.armies.all` — positions, member counts, controller IDs
  - Buildings: `df.global.world.buildings.all` — building counts by type
  - Artifacts: `df.global.world.artifacts.all` — named artifacts with translated names
  - History: `df.global.world.history.figures` / `.events` — counts and recent events
  - Announcements: `df.global.world.status.reports` — last 20 game announcements
  - Diplomacy: per-entity `entity.resources.diplomacy.state` (NOT `df.global.world.diplomacy` — does not exist)
  - Creature raws: `df.global.world.raws.creatures.all` — 934 creature type definitions
  - Unit count by race/caste
  - Building type summary
  - Active army positions
  - Fortress wealth and population statistics
  - Report cursor tracking
  - Unit flag extraction
  - History event cursor and payloads
  - Emotion/thought capture
  - Zone data capture
  - Event collection capture
  - Squads, mandates, and incidents
- Invocation: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
- Bridge file: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

**Planned enhancements (Phase 2)**:
- Denizen tracking section: `id`, `hist_fig_id`, `is_alive`, `pos`, `kill_count` for all units (cap 500)
- Relationship extraction section: 9 relationship slots from `u.status.current_soul.relationships`
- Unit data expansion: `birth_year`, `sex`, `death_cause`, personality traits (50 facets), physical/mental attributes

#### Lua Probes (`probe.py`)

**Already implemented**: `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)`.

**New probes to add (+80 LOC)**:
- `probe_game_time(client)` — cur_year, cur_year_tick, cur_season
- `probe_population(client)` — unit counts by race
- `probe_buildings(client)` — building counts by type
- `probe_items_summary(client)` — item counts by type
- `probe_artifacts(client)` — named artifacts
- `probe_history_figures(client)` — notable figures
- `probe_sites(client)` — active sites/civs
- `probe_reports(client)` — combat/announcements
- `probe_weather(client)` — `cur_season_tick`, weather state
- `probe_unit_full(client, id)` — full unit data: skills, attributes, personality, beliefs, goals

Each probe is a single-line Lua snippet returning JSON.

#### Remote File Deployment to HomeServer

Deploy `chronicler-bridge.lua` to `dfhack-config/scripts/` on HomeServer without manual RDP intervention.

**Remote access approach options (ranked by feasibility)**:
1. User manually copies files via RDP (works now, manual)
2. SMB to `C:\Users\Nathaniel` share + `script-paths.txt` entry
3. WinRM / PowerShell Remoting (needs HomeServer config: `evil-winrm` or `pywinrm`)
4. SSH server (OpenSSH Server Windows feature)
5. DFHack RPC `run_command` to bootstrap file writes from existing RPC connection

**CURRENT BLOCKER**: impacket remote exec auth failing — SMB signing required, null sessions disabled, possible account lockout.

---

### Monitoring & Observability System

#### Interaction Logging

Log every LLM interaction in the Storyteller web UI with full context:
- `query`, `world`, `keywords`, `context_stats`, `model`, `temperature`
- `tokens_streamed`, `response_chars`, `status`, `error`
- Four-phase latency: context retrieval duration, TTFT, LLM streaming duration, total wall time

Zero user-facing latency impact: `flush()` is async and called after SSE stream completes.

#### Monitoring Dashboard (`/monitoring`)

- Summary cards: total interactions, avg TTFT, avg total latency, error count
- Table of recent interactions: time, query, world, context records, tokens, TTFT, total, status
- Click-to-expand full detail for any row
- Auto-refresh every 30 seconds
- Same Tailwind dark theme as `index.html`

#### Three JSON API Endpoints

- `GET /api/monitoring/interactions?limit=50&world_id=N` — recent interactions list
- `GET /api/monitoring/interactions/{id}` — full detail for one interaction
- `GET /api/monitoring/summary` — aggregate stats (total, avg TTFT, avg latency, error rate)

---

### Entity Position Extraction (CDM)

- Extract all position data previously skipped entirely:
  - 11,712 position definitions
  - 13,501 current position assignments
  - 41,199 historical position links
- Store position definitions per entity (generic and gendered names, spouse titles) in `entity_positions` table
- Store who held which position and when (active and former) in `hf_position_links` table, merging data from standard legends and legends_plus
- Support Knowledge Horizon masking system:
  - Civilization nobles always visible
  - Religion title-holders always visible
- Expose new tables in Database Explorer UI under "Relationships" group
- Support re-ingestion of existing worlds (idempotent upserts)
- **Status**: COMPLETE (plan marked `[COMPLETE]`, Session 32, 2026-02-22)

---

### RAG / Semantic Search Knowledge Base

Build a comprehensive, searchable knowledge base across all DF reference sources.

**Target collections**:

| Collection | Est. Points | Content |
|-----------|-------------|---------|
| `dfhack` | ~8,700 | DFHack core + scripts + myDFHackScripts Lua |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source |
| `df-ai` | ~1,500–2,000 | Autonomous fort AI plugin (best DFHack plugin API reference) |
| `weblegends` | ~3,000–4,000 | Web legends viewer plugin (event/entity field reference for CDM) |
| `df-structures` | ~2,000–3,000 | DF memory structure XML definitions — CRITICAL, canonical data dictionary |
| `df-narrator` | ~300–500 | Python legends parser + narrator — HIGH, direct prototype reference |
| `dfhack-client-python` | ~100–200 | Python RPC client — HIGH, needed for Phase 0 live data access |
| `df-wiki` | ~5,000–8,000 | Core DF wiki articles (~500–800 pages selectively crawled) |
| `research` | ~1,200 | DF project plan + features notes |

**Wiki ingestion phases**:
- Phase 1: Core gameplay (~300 pages): fortress mode, guides, mechanics, interface, buildings, items, labors, etc.
- Phase 2: World/history/legends (~150 pages): adventure mode, events, lore, biomes, races/civs, Historical_figure, Entity, Site, Artifact, Personality_trait, Emotion, Thought, Need, Skill, Attribute, Military, Noble, etc.
- Phase 3: Modding/data reference (~100 pages): game files, creature raws, building raws, materials

**Execution order**:
1. Clone missing repos: `df-structures`, `df-narrator`, `dfhack-client-python`
2. Index codebase repos (Streams 1A–1F) — parallel via jarvis-rag MCP
3. Index research docs
4. Build MediaWiki API Python crawler script
5. Run wiki ingestion (Phases 1–3, ~500–800 pages, 1s delay between pages)
6. Validate — demonstrate semantic search across all collections

**Status**: Draft (2026-02-19). At time of plan: dfhack 8,476 pts, dwarf-therapist 926 pts, df-wiki 4 pts. Not-yet-indexed: df-ai, weblegends, myDFHackScripts. Not-yet-cloned: df-structures, df-narrator, dfhack-client-python, LegendsBrowser2, LegendsViewer-Next, df-sites-analyzer.

---

### Reference Tool Benchmarking — Feature Targets

**Must Match (Parity Features)**:

| Feature | Best-in-class Tool | Chronicler Status |
|---------|-------------------|-------------------|
| Streaming XML parse (>25MB files) | LegendsBrowser2 (custom Go tokenizer) | DONE (lxml iterparse) |
| 100+ event type rendering | LegendsBrowser2, LegendsViewer-Next | PARTIAL (wide table, 141 types enumerated) |
| Entity/figure/site cross-linking | All viewers | DONE (Explorer 6-tab with FK navigation) |
| Ego-network graph visualization | None (Chronicler original) | DONE (vis.js, 1-3 hop) |
| War/battle collection trees | LegendsBrowser2 | TODO (Events tab Phase 4) |
| Context-aware event rendering | weblegends (96 per-event .cpp files) | TODO (event detail cards) |
| Family tree visualization | LegendsViewer-Next (genealogy) | TODO (Phase 5) |
| Interactive maps | LegendsViewer-Next (Leaflet.js) | TODO (Phase 5) |

**Must Exceed (Differentiating Features)**:

| Feature | Existing Tool Capability | Chronicler Advantage |
|---------|------------------------|---------------------|
| Live fortress data | None (all viewers are post-game) | Real-time unit state via bridge |
| AI narrative | None | Agentic storyteller with SQL tool use |
| Live event generation | None | Runtime state → history_events records |
| Unified person view | None (HF-only in all viewers) | Merged Unit + HF + personality + events |
| Embark dwarf coverage | None (starting dwarves invisible everywhere) | Embark-aware HF handling + live events |
| Narrative Value Scoring | df-narrator (figure scoring for Markdown export) | Real-time NVS updated per watcher cycle |
| Database exploration | None (viewers are read-only displays) | SQL runner, schema browser, JSONB expansion |
| Knowledge Horizon masking | None | Dynamic visibility based on fortress knowledge |
| LLM observability | None | Monitoring dashboard with per-interaction latency breakdown |

---

## Architecture & Implementation

### Runtime Environment

**UTM Win11 VM (primary DF runtime)**:
| Component | Detail |
|-----------|--------|
| VM identity | `DF-Windows` / `WIN-MRGFUCCV202` / `192.168.64.3` / Windows 11 Pro ARM 64-bit (10.0.26200) |
| DF Version | 53.10 + DFHack 53.10-r1 |
| Data Transport | `dfhack-run` over SSH (primary); HTTP bridge port 8888; TCP RPC broken for game-thread calls |
| SSH Key | `~/.ssh/df-vm` |
| File Transfer | HTTP file server port 8889 (~105 MB/s) or SCP via `vm-lifecycle.sh scp-pull` (~19 MB/s, requires `-O -T` flags); Guest Agent emergency-only (~0.24 MB/s) |
| World (live) | "The Land of Dawning" — year 250, 257×257 |
| VM scripts | `projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh` |

**HomeServer (physical PC, secondary DF environment)**:
| Component | Detail |
|-----------|--------|
| Host | Windows 10 Pro x86_64 at `192.168.4.194`, machine name `WIN-48L3R2QLQN0` |
| DF Version | Dwarf Fortress 53.10 |
| DFHack Version | 53.10-r1 (release) on x86_64 |
| DFHack RPC | TCP port 5000; firewall rule "DFHack RPC" created and open |
| RemoteFortressReader | NOT AVAILABLE — `enable RemoteFortressReader` returns "Cannot enable plugin." Not shipped with DFHack 53.10-r1. |
| DF install path | `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\` |
| DFHack init chain | `dfhack.init` → `onLoad.init` → `onMapLoad.init` |
| DFHack config scripts | `dfhack-config/scripts/` — auto-discoverable |
| User / Pass | Nathaniel / DwarfF0rtress. RDP enabled. |

**Development Machine / DB / Web UI**:
| Component | Detail |
|-----------|--------|
| DB | PostgreSQL `chronicler` on localhost:5432 (CDM schema, 109K records) |
| World (DB) | "Namoram" — legends XML imported |
| Web UI | `localhost:8080`, SSE streaming from Qwen3-8B via LiteLLM |
| Bridge | v6, 16 sections, 7 data domains, HTTP on port 8888 |
| MLX Embedding Server | `localhost:8000` — Qwen3-Embedding-4B, 2560-dim |
| Qdrant | `localhost:6333` — running, healthy |

**Critical TCP RPC status**: Broken for game-thread calls on DFHack 53.x under Prism. Only cached calls (`GetVersion`, `GetWorldInfo`) work. All other calls hang waiting for CoreSuspender. Use `dfhack-run` command over SSH instead — executes Lua directly on the DFHack Core thread.

**Critical data access gotcha**: `df.global.world.diplomacy` does NOT exist. Diplomacy is per-entity at `entity.resources.diplomacy.state`. `run_command('lua', ...)` via RPC HANGS due to CoreSuspend deadlock on the RPC thread. All game-thread data routes through the HTTP bridge script.

---

### Data Flow Architecture

```
CURRENT (v0.8):
  Legends XML → Parser → PostgreSQL (35+ tables) → Keyword Routing → Context Assembly → LLM → Chat
  Live Bridge → Watcher → PostgreSQL (units/events/probes) → Keyword Routing (partial)
  dfhack-run (SSH) → Lua commands → stdout (verified working for all data domains)

TARGET (v1.0):
  Legends XML → Parser ──────────────────────────────→ PostgreSQL (40+ tables)
  Post-Embark Legends Re-export → Parser (with embark detection) ↗
  Live Bridge → Watcher ──────────────────────────────↗
  Live Bridge → Event Generator → history_events ─────↗
  dfhack-run (SSH) → Lua probes → Watcher ────────────↗
  Embark HF Fallback (if no post-embark export) ──────↗
                                                          ↓
                                                    Denizen Registry
                                                          ↓
                                                    LLM (Agentic SQL Tool Use)
                                                      ↓               ↓
                                                    Chat          Explorer
                                                                (fortress-centric views)
```

---

### New Architectural Components

| Component | Table/Module | Purpose |
|-----------|-------------|---------|
| Denizen Registry | `fortress_denizens` table | Gateway: every being who touched the fortress |
| Embark HF Fallback | `chronicler/synthetic.py` | Creates HF records for starting dwarves ONLY if not found in imported legends |
| Live Event Generator | `chronicler/events.py` | Converts runtime state transitions into `history_events`-compatible records |
| Death Detector | Watcher enhancement | Detects `is_alive` transitions + absence-based detection |
| Unified Person Builder | `chronicler/storyteller/person.py` | Merges Unit + HF data into single JSON for LLM consumption |
| Agentic SQL Interface | `chronicler/storyteller/agent.py` | LLM tool-use wrapper providing read-only SQL execution |
| Knowledge Horizon | `knowledge_horizon` table + views | Dynamic masking of database scope |
| Monitoring | `chronicler/monitoring.py` + routes/templates | Per-interaction LLM logging and dashboard |

---

### Database Schema — Complete DDL

#### `fortress_denizens` Table

```sql
CREATE TABLE IF NOT EXISTS fortress_denizens (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT,
    hf_id           INT,
    name            TEXT NOT NULL,
    english_name    TEXT,
    race            TEXT,
    status          TEXT NOT NULL DEFAULT 'unknown',
    embark          BOOLEAN DEFAULT FALSE,
    arrival_year    INT,
    arrival_tick    INT,
    departure_year  INT,
    departure_tick  INT,
    departure_cause TEXT,               -- 'death', 'departure', 'unknown'
    narrative_value FLOAT DEFAULT 0.0,  -- 0.0-100.0
    last_seen_tick  INT,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, unit_id),
    UNIQUE (world_id, hf_id)
);

CREATE INDEX IF NOT EXISTS idx_fortress_denizens_status
    ON fortress_denizens(world_id, status);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_narrative
    ON fortress_denizens(world_id, narrative_value DESC);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_hf
    ON fortress_denizens(world_id, hf_id) WHERE hf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_embark
    ON fortress_denizens(world_id) WHERE embark = TRUE;
```

#### `knowledge_horizon` Table

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_type     TEXT NOT NULL,  -- 'hf', 'site', 'entity', 'event'
    entity_id       INT NOT NULL,
    visibility      TEXT NOT NULL DEFAULT 'unknown',
        -- 'visible', 'inferred', 'unknown'
    source          TEXT,
    UNIQUE (world_id, entity_type, entity_id)
);
```

#### `entity_positions` Table

```sql
CREATE TABLE IF NOT EXISTS entity_positions (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,
    name            TEXT,
    name_male       TEXT,
    name_female     TEXT,
    spouse          TEXT,
    spouse_male     TEXT,
    spouse_female   TEXT,
    UNIQUE (world_id, entity_id, position_id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_entity_positions_entity
    ON entity_positions(world_id, entity_id);
```

#### `hf_position_links` Table

```sql
CREATE TABLE IF NOT EXISTS hf_position_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    hf_id           INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,
    start_year      INT,
    end_year        INT,
    UNIQUE (world_id, hf_id, entity_id, position_id, start_year),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_hf
    ON hf_position_links(world_id, hf_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_entity
    ON hf_position_links(world_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_current
    ON hf_position_links(world_id, entity_id) WHERE end_year IS NULL;
```

#### `storyteller_log` Table

```sql
-- Fields:
query TEXT,
world INT,
keywords TEXT[],
context_records INT,
context_chars INT,
context_categories TEXT[],
model TEXT,
temperature FLOAT,
tokens_streamed INT,
response_chars INT,
status TEXT,
error TEXT,
context_retrieval_ms FLOAT,
ttft_ms FLOAT,
llm_streaming_ms FLOAT,
total_ms FLOAT
```

#### `unit_events` Table

Change events: `ARRIVED`, `DIED`, `SKILL_UP`, `PROFESSION_CHANGED`, `SQUAD_CHANGED`.

#### `sync_snapshots` Table

Per-run metadata for each polling cycle. Referenced by NVS SQL for `COUNT(DISTINCT cycle_tick)`.

#### `lua_probes` Table

Stored results of Lua probe calls with timestamps.

#### Column Additions to Existing Tables

```sql
-- historical_figures
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS embark BOOLEAN DEFAULT FALSE;

-- history_events
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
-- source values: 'legends', 'live_watcher', 'live_bridge'

-- units
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
-- Personality, relationships, attributes → details JSONB
```

---

### Key Parser Modifications (`chronicler/ingest/xml_parser.py`)

#### `_parse_historical_figures()` — HF Position Links

```python
# Position links (active)
for link in hf.findall("entity_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),  # maps to entity_positions.position_id
        _int(link, "start_year"),
        None,  # end_year (active = currently held)
    ))

# Former position links
for link in hf.findall("entity_former_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),
        _int(link, "start_year"),
        _int(link, "end_year"),
    ))
```

Return signature changes from `tuple[list, list, list, list]` to `tuple[list, list, list, list, list]`.

#### `_parse_legends_plus()` — Position Definitions and Assignments

```python
# Position definitions
for pos in ent.findall("entity_position"):
    result["entity_positions"].append((
        world_id, eid,
        _int(pos, "id"),
        _text(pos, "name"),
        _text(pos, "name_male"),
        _text(pos, "name_female"),
        _text(pos, "spouse"),
        _text(pos, "spouse_male"),
        _text(pos, "spouse_female"),
    ))

# Current position assignments
for assign in ent.findall("entity_position_assignment"):
    histfig = _int(assign, "histfig")
    pos_id = _int(assign, "position_id")
    if histfig is not None and pos_id is not None:
        result["entity_position_assignments"].append((
            world_id, histfig, eid, pos_id,
            None, None,  # start/end year not in assignments
        ))
```

#### `import_legends()` — Step 4: HF Position Links Insert

```python
n = await _batch_insert(conn, "hf_position_links",
    ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
    hf_position_link_rows,
    on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
counts["hf_position_links"] = n
```

#### `import_legends()` — Step 5: Legends_plus Position Definitions and Assignments

```python
# Entity position definitions (DO UPDATE to allow enrichment)
if plus_data.get("entity_positions"):
    n = await _batch_insert(conn, "entity_positions",
        ["world_id", "entity_id", "position_id", "name",
         "name_male", "name_female", "spouse", "spouse_male", "spouse_female"],
        plus_data["entity_positions"],
        on_conflict="(world_id, entity_id, position_id) DO UPDATE SET "
            "name = COALESCE(EXCLUDED.name, entity_positions.name), "
            "name_male = COALESCE(EXCLUDED.name_male, entity_positions.name_male), "
            "name_female = COALESCE(EXCLUDED.name_female, entity_positions.name_female), "
            "spouse = COALESCE(EXCLUDED.spouse, entity_positions.spouse), "
            "spouse_male = COALESCE(EXCLUDED.spouse_male, entity_positions.spouse_male), "
            "spouse_female = COALESCE(EXCLUDED.spouse_female, entity_positions.spouse_female)")

# Position assignments from legends_plus (merge)
if plus_data.get("entity_position_assignments"):
    n = await _batch_insert(conn, "hf_position_links",
        ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
        plus_data["entity_position_assignments"],
        on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
```

---

### Code Implementations

#### ETL Embark HF Logic (`chronicler/synthetic.py`)

```python
async def ensure_embark_hf_records(conn, world_id, embark_units):
    for unit in embark_units:
        if unit['hist_fig_id'] is None:
            continue
        existing = await conn.fetchval(
            "SELECT id FROM historical_figures WHERE world_id = $1 AND id = $2",
            world_id, unit['hist_fig_id'])
        if existing:
            # Post-embark export was used — just mark embark flag
            await conn.execute("""
                UPDATE historical_figures
                SET details = details || '{"embark": true}'::jsonb
                WHERE world_id = $1 AND id = $2
            """, world_id, unit['hist_fig_id'])
            continue
        # Create synthetic HF from Unit data
        relationships = unit.get('details', {}).get('relationships', [])
        await conn.execute("""
            INSERT INTO historical_figures (
                world_id, id, name, race, caste, birth_year,
                entity_id, embark, details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
        """, world_id, unit['hist_fig_id'], unit['name'], unit['race'],
            unit.get('caste'), unit.get('birth_year'), unit.get('civ_id'),
            json.dumps({
                'synthetic': True,
                'generated_from': 'unit_record',
                'unit_id': unit['id'],
                'relationships_from_unit': relationships,
                'generation_reason': 'Embark dwarf not found in imported legends XML'
            }))
        for rel in relationships:
            if rel.get('histfig_id'):
                await conn.execute("""
                    INSERT INTO hf_links (world_id, hf_id, target_hf_id, link_type)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                """, world_id, unit['hist_fig_id'],
                    rel['histfig_id'], rel.get('type', 'unknown'))
```

#### Death Detection (`chronicler/denizens.py` — integrated with watcher)

```python
async def detect_deaths(conn, world_id: int,
                        current_units: list[dict],
                        previous_units: list[dict],
                        event_gen=None):
    current_ids = {u['id'] for u in current_units}
    previous_ids = {u['id'] for u in previous_units}
    missing_ids = previous_ids - current_ids
    for uid in missing_ids:
        await update_denizen_status(conn, world_id, uid, 'missing',
            cause='disappeared_between_cycles', year=current_year, tick=current_tick)
    for unit in current_units:
        if unit.get('flags', {}).get('killed') or not unit.get('is_alive', True):
            current_status = await conn.fetchval(
                "SELECT status FROM fortress_denizens WHERE world_id = $1 AND unit_id = $2",
                world_id, unit['id'])
            if current_status in ('resident', 'missing'):
                await update_denizen_status(conn, world_id, unit['id'], 'deceased',
                    cause='death', year=current_year, tick=current_tick)
                if event_gen:
                    await event_gen.record_death(world_id, unit, current_year, current_tick)
```

#### EventGenerator Class (`chronicler/events.py`)

Key methods: `record_death`, `record_kill`, `record_profession_change`, `record_skill_milestone`, `record_marriage`, `record_birth`, `record_mood`, `record_artifact_created`, `record_arrival`, `record_departure`.

Event ID strategy: `_next_event_id` starts at max(legends_event_id) + 10,000, incremented per event.

All events written with `live_generated = TRUE`, `source = 'live_watcher'` (or `'live_bridge'`).

#### SQL Tool Safety (`chronicler/storyteller/agent.py`)

```python
async def execute_storyteller_query(conn, sql: str, max_rows: int = 50) -> dict:
    forbidden = {'insert', 'update', 'delete', 'drop', 'alter', 'truncate',
                 'create', 'grant', 'revoke'}
    tokens = sql.lower().split()
    if any(t in forbidden for t in tokens):
        return {"error": "Query contains forbidden keyword", "rows": []}
    try:
        async with conn.transaction(readonly=True):
            if 'limit' not in sql.lower():
                sql = f"SELECT * FROM ({sql}) _q LIMIT {max_rows}"
            rows = await asyncio.wait_for(conn.fetch(sql), timeout=5.0)
            return {
                "columns": [col for col in rows[0].keys()] if rows else [],
                "rows": [dict(r) for r in rows[:max_rows]],
                "row_count": len(rows),
                "truncated": len(rows) >= max_rows
            }
    except asyncio.TimeoutError:
        return {"error": "Query timed out (5s limit)", "rows": []}
    except Exception as e:
        return {"error": str(e), "rows": []}
```

#### NVS SQL Subqueries

```sql
-- screen_time: proportion of cycles observed
SELECT COUNT(*) FILTER (WHERE d.last_seen_tick IS NOT NULL) AS cycles_observed,
       (SELECT COUNT(DISTINCT cycle_tick) FROM sync_snapshots WHERE world_id = $1) AS total_cycles

-- event_density: events involving this denizen's HF
SELECT COUNT(*) FROM history_events
WHERE world_id = $1 AND (hf_id = $2 OR hf_id_2 = $2)

-- relationship_depth: links involving this denizen's HF
SELECT COUNT(*) FROM hf_links WHERE world_id = $1 AND hf_id = $2

-- recency: current_tick - last_seen_tick (lower = more recent = higher score)
-- normalized: 1.0 - (ticks_since_seen / max_ticks_since_seen)
```

#### Lua Bridge Relationship Extraction

```lua
local rels = {}
if u.status and u.status.current_soul then
    for _, rel in ipairs(u.status.current_soul.relationships) do
        table.insert(rels, {
            type = df.unit_relationship_type[rel.type] or tostring(rel.type),
            histfig_id = rel.histfig_id,
            unit_id = rel.unit_id
        })
    end
end
entry.relationships = rels
```

#### Lua Bridge Denizen Tracking Section

```lua
entry.id = u.id
entry.hist_fig_id = u.hist_figure_id
entry.is_alive = not dfhack.units.isDead(u)
entry.pos = {x=u.pos.x, y=u.pos.y, z=u.pos.z}
entry.kill_count = u.status.current_soul and u.status.current_soul.performance_group_ref or 0
```

#### Watcher Integration Pseudocode

```python
# Per poll cycle:
current_units = await get_bridge_units()
embark_ids = await detect_embark_dwarves(conn, world_id, current_units)
for unit in current_units:
    is_embark = unit['id'] in embark_ids
    await register_denizen(conn, world_id, unit, is_embark=is_embark)
for unit in current_units:
    if unit.get('hist_fig_id'):
        existing_hf = await conn.fetchval(
            "SELECT id FROM historical_figures WHERE world_id = $1 AND id = $2",
            world_id, unit['hist_fig_id'])
        if existing_hf:
            await link_hf(conn, world_id, denizen_id, unit['hist_fig_id'])
await detect_deaths(conn, world_id, current_units, previous_units, event_gen)
await compute_all_nvs(conn, world_id)
```

Key concern: watcher must store `previous_units` state accessible to the denizen tracking code.

#### Watcher → Event Generator Integration Pattern

```python
event_gen = EventGenerator(conn, world_id)

await detect_deaths(conn, world_id, current_units, previous_units, event_gen)

for unit_id, changes in unit_diffs.items():
    if 'profession' in changes:
        await event_gen.record_profession_change(
            world_id, unit, changes['profession']['old'],
            changes['profession']['new'], year, tick)

    old_kills = changes.get('kill_count', {}).get('old', 0)
    new_kills = changes.get('kill_count', {}).get('new', 0)
    if new_kills > old_kills:
        await event_gen.record_kill(world_id, unit, victim_info, year, tick)

    for skill_change in changes.get('skills', []):
        if skill_change['new_level'] in MILESTONE_LEVELS:
            await event_gen.record_skill_milestone(
                world_id, unit, skill_change['name'],
                skill_change['old_level'], skill_change['new_level'], year, tick)
```

#### CLI Implementation

```python
@app.command()
def denizens(
    world: str = typer.Option(None, help="World name filter"),
    status: str = typer.Option(None, help="Status filter (resident/deceased/missing/...)"),
    sort: str = typer.Option("nvs", help="Sort by: nvs, name, arrival, status"),
    limit: int = typer.Option(50, help="Max results"),
):
    """List fortress denizens with status, NVS, and embark flag."""
```

#### Monitoring `InteractionLog` (`chronicler/monitoring.py`)

```python
# InteractionLog dataclass with all metric fields
# Timing methods using time.monotonic(): start(), context_done(), llm_start(), first_token(), count_token(), finish()
# async flush(pool) — single INSERT to storyteller_log, called after SSE stream completes
```

#### Entity Position Verification Queries

```sql
-- Position names for a sample civilization
SELECT ep.name, ep.name_male, ep.name_female, e.name as entity_name
FROM entity_positions ep
JOIN entities e ON e.world_id = ep.world_id AND e.id = ep.entity_id
WHERE ep.world_id = 5 AND e.type = 'civilization'
LIMIT 20;

-- Current position holders with resolved names
SELECT hf.name as holder, ep.name as position, ep.name_male, e.name as entity_name
FROM hf_position_links hpl
JOIN historical_figures hf ON hf.world_id = hpl.world_id AND hf.id = hpl.hf_id
JOIN entity_positions ep ON ep.world_id = hpl.world_id AND ep.entity_id = hpl.entity_id AND ep.position_id = hpl.position_id
JOIN entities e ON e.world_id = hpl.world_id AND e.id = hpl.entity_id
WHERE hpl.world_id = 5 AND hpl.end_year IS NULL
ORDER BY e.name, ep.position_id
LIMIT 20;
```

---

### File Modification Estimates by Phase

**Phase 1** (Denizen Registry — ~630 total lines):
| File | Action | Lines est. | Task |
|------|--------|-----------|------|
| `chronicler/db/schema.sql` | ADD `fortress_denizens` table + indexes | ~40 | 1.1 |
| `chronicler/denizens.py` | NEW — registry management module | ~200 | 1.2, 1.5, 1.7 |
| `chronicler/dfhack/watcher.py` | MODIFY — denizen tracking + death detection | ~100 | 1.3, 1.4 |
| `chronicler/cli.py` | MODIFY — add `denizens` command | ~40 | 1.6 |
| `tests/test_denizens.py` | NEW test file | ~250 | 1.8 |

**Phase 2**:
| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/db/schema.sql` | MODIFY — embark, unit cols, event cols | ~15 |
| `chronicler/synthetic.py` | NEW — embark HF fallback | ~120 |
| `chronicler/events.py` | NEW — live event generator | ~200 |
| `chronicler/dfhack/scripts/chronicler-bridge.lua` | MODIFY — expand extraction | ~120 |
| `chronicler/dfhack/watcher.py` | MODIFY — sync new fields + event gen | ~80 |
| `chronicler/ingest/xml_parser.py` | MODIFY — embark preservation | ~20 |

**Phase 3**:
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

**Phase 4**:
| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/api/routes/events.py` | NEW — events endpoints | ~120 |
| `chronicler/api/templates/explorer.html` | MODIFY — events tab + horizon toggle | ~250 |
| `chronicler/db/schema.sql` | MODIFY — knowledge_horizon table | ~15 |
| `chronicler/horizon.py` | NEW — horizon computation | ~80 |
| `chronicler/storyteller/prompts.py` | MODIFY — horizon constraints | ~15 |

**Monitoring System** (~230 total lines):
| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/monitoring.py` | NEW | ~80 |
| `chronicler/api/routes/monitoring.py` | NEW | ~55 |
| `chronicler/api/templates/monitoring.html` | NEW | ~80 |
| `chronicler/api/routes/storyteller.py` | MODIFY — inline instrumentation | +18 |
| `chronicler/api/app.py` | MODIFY — router registration | +6 |
| `chronicler/storyteller/context.py` | MODIFY — rename `_extract_keywords` → `extract_keywords` | 2 |
| `chronicler/db/schema.sql` | MODIFY — add storyteller_log table | +16 |

**Probe Expansion** (~130 total lines across 5 files):
| File | Action | Lines est. |
|------|--------|-----------|
| `chronicler/dfhack/probe.py` | MODIFY — 10 new probe functions | +80 |
| `chronicler/dfhack/watcher.py` | MODIFY — game time probe fallback | +10 |
| Others (client.py, config.py) | Minor IP/config updates | — |

---

### Key File Paths

| Path | Description |
|------|-------------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/` | Product code root |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler` | CLI |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` | Database schema |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | Bridge script |
| `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/` | Dev artifacts root |
| `/Users/nathanielcannon/Claude/GitRepos/` | Reference repos |

---

## Phase-by-Phase Status

### Version Milestones

| Version | Phases | State |
|---------|--------|-------|
| v0.8 | Baseline + Gap Closure | CURRENT |
| v0.9 | Phases 1-2 complete | Database tracks every fortress being; embark dwarves have HF records; deaths generate events |
| v1.0 | Phases 1-4 complete | Agentic storyteller; fortress-centric explorer; browsable event timeline; initial Knowledge Horizon |
| v1.5+ | Phase 5 items | Proactive narrative; full KH with 7 caveats; interactive maps; family trees; skills time-series |

### Gap Closure — 100% Complete (Session 32)

- Phase 0 (Quick Fixes): DONE
- Phase 1 (Composite PKs): DONE
- Phase 2 (Storyteller): DONE
- Phase 3 (XML): DONE
- Phase 4 (Hardening): DONE

### Roadmap Phases Status

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| Phase 1 | Denizen Registry + Death Detection | 6-8 hrs | PLANNED — all prerequisites met |
| Phase 2 | Embark HF + Unit Expansion + Live Events | 6-8 hrs | PLANNED — depends on Phase 1 |
| Phase 3 | Agentic Storyteller + Explorer Integration | 8-10 hrs | PLANNED — depends on Phase 2 |
| Phase 4 | Events Tab + Knowledge Horizon Stub | 4-6 hrs | PLANNED — depends on Phase 3 |
| Phase 5 (UI polish items 1-5) | Accent search, age calc, position titles, sidebar, load members | 6-8 hrs total | Can start any time |
| Phase 5 (post-v1.0 items 6-12) | Narrative engine, skills tracking, full KH, maps, family trees, global scoring | Ongoing | Depends on Phases 1-4 |
| Monitoring System | Observability dashboard + LLM logging | ~230 LOC | NOT STARTED — no dependencies |
| RAG Indexing | Qdrant knowledge base for DF reference | Ongoing | PARTIAL (see collection status) |
| Probe Expansion | 10 new Lua probes + bridge enhancements | ~130 LOC | NOT STARTED |

### Plans With Remaining Work

| Plan File | Done | Remaining | Maps to Roadmap Phase |
|-----------|------|-----------|----------------------|
| `rippling-honking-crescent.md` | Phases 1-7 | Phase 3 (unit data expansion), Phase 8 (KH stub) | Phase 2 (bridge expansion), Phase 4 (KH) |
| `shiny-churning-sprout.md` | People, Civs, Geo tabs | Events & Timeline tab | Phase 4 (events tab) |

### Plans Fully Complete (Reference Only)

| Plan File | Description |
|-----------|-------------|
| `sparkling-sauteeing-snowglobe.md` | Entity Position Extraction |
| `woolly-swinging-naur.md` | Database Explorer (Schema/Data/Graph) |
| PRD v2.2 §6 note: Phases 1-7 of `rippling-honking-crescent.md` | Explorer UI Enhancements |

### Phase Verification Checklists

#### Phase 1 Verification

- [ ] `fortress_denizens` table exists in PostgreSQL with all columns and indexes
- [ ] Run watcher 3+ cycles → table populated with all fortress units
- [ ] First-cycle units all have `embark = TRUE`
- [ ] Second-cycle new arrivals have `embark = FALSE`
- [ ] Kill a dwarf in DF → denizen status changes to `deceased` within 2 cycles
- [ ] Dwarf disappears without death flag → status changes to `missing`
- [ ] NVS scores are non-zero and vary between denizens
- [ ] NVS ordering makes sense (active residents > old visitors)
- [ ] Denizens with matching HFs have `hf_id` populated
- [ ] `chronicler denizens` CLI command shows formatted table with all fields
- [ ] All 12 tests pass, no regressions in existing 131-test suite

#### Phase 2 Completion Checklist

- [ ] Post-embark export: embark dwarves in `historical_figures` with `embark = TRUE`, NO synthetic flag
- [ ] Pre-embark export only: embark dwarves get synthetic HF records with Unit-sourced relationships
- [ ] Kill a dwarf → death event in `history_events` with `live_generated = TRUE`
- [ ] Change profession → profession change event generated
- [ ] Skill crosses Legendary → skill milestone event generated
- [ ] `units` table has `birth_year`, `sex` populated from bridge
- [ ] `details` JSONB includes personality, relationships, attributes
- [ ] Re-import legends XML → synthetic data replaced, `embark` flag preserved

#### Phase 3 Completion Checklist

- [ ] "Tell me about [fortress dwarf]" → LLM executes 2-3 queries, returns merged personality + history
- [ ] "Who died recently?" → LLM queries denizen registry + death events, returns accurate report
- [ ] "Tell me about my fortress" → LLM explores denizens, events, demographics, composes overview
- [ ] "Who killed the dwarf who was married to the mayor?" → LLM chains multiple queries to find answer
- [ ] Config toggle between agentic and keyword mode works
- [ ] Explorer People tab defaults to fortress denizens with NVS sort and embark badges
- [ ] Click any denizen → see merged Unit + HF + events view

#### Phase 4 Completion Checklist

- [ ] Events tab: filter by year range, type, participant → correct results
- [ ] Source filter: "Live Only" shows fortress events, "Legends Only" shows pre-fortress
- [ ] War/battle collections expandable in tree view
- [ ] Knowledge Horizon table populated from denizen registry
- [ ] Agentic LLM respects horizon constraints (doesn't volunteer unknown entities)

#### Daemon Verification Steps

1. Verify RPC connection: `chronicler sync-live`
2. Deploy bridge script to HomeServer (`dfhack-config/scripts/`)
3. Start bridge: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
4. Start HTTP server on HomeServer port 8888
5. Verify bridge: `curl http://192.168.4.194:8888/chronicler-state.json`
6. Start watcher: `chronicler watch --interval 10 --probe-interval 60`
7. First cycle: confirm "Synced N units, 0 events" + game year/tick
8. Verify Lua probes: `SELECT * FROM lua_probes ORDER BY probed_at DESC LIMIT 10;`
9. Cause a change in DF; verify change event detected
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`

#### Monitoring Verification Steps

1. Run schema migration: add storyteller_log table
2. Restart uvicorn: `chronicler serve --port 8080`
3. Ask a question in UI, verify SSE streaming still works
4. Open `/monitoring`, verify interaction appears with timing data
5. `curl http://localhost:8080/api/monitoring/summary`
6. `curl http://localhost:8080/api/monitoring/interactions?limit=5`

---

## Design Decisions

### Decision 1: Post-Embark Legends Re-Export as Primary (PRD v2.1 revision)

Post-embark re-export is PRIMARY; synthetic HF is FALLBACK ONLY. Post-embark export produces authoritative HF records for all embark dwarves; better to educate the user to do the re-export than rely on synthetic records.

### Decision 2: Relationships from Unit Records, NOT Heuristic Guessing (PRD v2.1 revision)

Relationship data for synthetic HFs comes exclusively from the Unit record's `details.relationships[]` field (9 slots). Heuristic guessing by matching names/races against the civ HF pool is error-prone and was explicitly rejected.

### Decision 3: `dfhack-run` over SSH as Primary Transport (PRD v2.2 revision)

TCP RPC is broken for game-thread calls on DFHack 53.x under Prism — CoreSuspender never acquired from network thread. `dfhack-run` over SSH executes Lua directly on the DFHack Core thread, bypassing the broken TCP dispatch. TCP RPC retained only for cached calls (GetVersion, GetWorldInfo).

### Decision 4: Agentic Storyteller Replaces Keyword Routing (PRD v2.1 revision)

PRD v2.0 defined a 23-route keyword→SQL routing pipeline. Replaced with agentic LLM that autonomously executes SQL queries (up to 5 rounds). Keyword routing is brittle, can't handle novel questions or multi-hop reasoning. Keyword-routing retained as fallback via `storyteller_mode: "keyword"` config.

### Decision 5: Live Events in the Same `history_events` Table

Could have created a separate `live_events` table. Using the same `history_events` table with `live_generated BOOLEAN` and `source TEXT` columns. Agentic storyteller queries a single unified events table without needing to distinguish source.

### Decision 6: Knowledge Horizon as Advisory (System Prompt), Not Enforcement (SQL Views)

Phase 1-3 KH implemented as query constraints injected into the system prompt; view-based enforcement deferred to Phase 2 KH rollout. Advisory mode avoids hiding useful data; can be made stricter later.

### Decision 7: NVS Computed Per Watcher Cycle, Stored in Denizen Record

NVS computed periodically by the watcher, stored as `narrative_value FLOAT` on the `fortress_denizens` record. Enables O(1) NVS sort on explorer; avoids complex real-time computation at query time.

### Decision 8: Event ID Gap of 10,000+ Between Legends and Live Events

`_next_event_id` starts at max(legends_event_id) + 10,000. Provides ample buffer; legends events are in the low millions, live events start at a safely distinguishable range.

### Decision 9: SSE Streaming for Agentic Responses

Tool calls hidden from UI; only final narrative response streamed via SSE. Better UX — user sees the narrative appear progressively rather than waiting for all SQL rounds to complete.

### Decision 10: `embark` Flag Added to Both `historical_figures` and `fortress_denizens`

HF flag needed for storyteller context ("this is a founding member"); denizen flag needed for UI badges and explorer filtering.

### Decision 11: Composite PKs over Single-Column PKs

All 13 legends tables migrated to `PRIMARY KEY (world_id, id)`. Resolves cross-world ID collisions. Without it, 5,466 HFs from Namoram were invisible due to ID collision with Ormon.

### Decision 12: `fortress_denizens` Has Two Nullable FK Columns

Both `unit_id` and `hf_id` are nullable with separate UNIQUE constraints. A denizen can be known from a live unit without a matched HF (unit-only), or from legends/relationships without a live unit record (historical).

### Decision 13: Embark Detection via Absence of Records

First watcher cycle detected by checking if `fortress_denizens` has zero entries for the `world_id`. Simple and reliable; avoids need for an explicit "cycle counter" state.

### Decision 14: `missing` Status is Distinct from `deceased`

A unit that vanishes without a death flag gets `missing` status, upgradeable to `deceased` upon confirmation. Captures game edge cases (unit offscreen, bug, forgotten beast kill) while remaining upgradeable.

### Decision 15: Storyteller Enrichment over Raw Data (Gap Closure Phase 2)

Enrich storyteller context with JOIN-resolved names and natural-language templates. Example: "Bomrek was slain by Urist at Goldenhall in year 253" vs raw hf_id/site_id values.

### Decision 16: Confidence Signaling in Storyteller

Storyteller prepends a context density note to all results. If < 3 records: caution warning. If > 10 records: rich context note. Helps LLM calibrate response confidence.

### Decision 17: `lua_probes` Retention Cleanup Every 10 Cycles

Cleanup runs every 10 watcher cycles (not every cycle) to avoid overhead. Keeps last N per probe_name per world_id. Balance between storage management and watcher cycle performance overhead.

### Decision 18: Bridge Health Monitoring with Graceful Degradation

After 3 consecutive bridge failures, watcher warns but continues with core-only data. Partial data is better than no data.

### Decision 19: Written Contents Dual-Source Parsing

legends.xml provides core fields (title, author, form); legends_plus.xml provides enriched fields (type, page start/end, references). Parser handles both, with legends.xml as primary source. Consistent with the general XML parsing strategy.

### Decision 20: kill_count Computation — Independent UPDATE, Correct Group Column

Changed from LEFT JOIN to independent UPDATE. Changed grouping column from hf_id_1 (victim) to hf_id_2 (slayer). The JOIN approach caused kill counts to mirror event counts rather than counting kills.

### Decision 21: Lua Bridge as Primary Data Path, Not RPC Plugin Calls

Lua scripting via `df.global` is the primary data access approach (officially supported community modding method). Bridge handles bulk periodic dumps every 100 ticks; probes handle targeted queries on a separate configurable interval. No RemoteFortressReader dependency — not available in DFHack 53.10-r1 on HomeServer.

### Decision 22: Inline Instrumentation for Monitoring, Not Middleware

Middleware cannot capture per-phase latencies or SSE body content. Instrumentation placed directly in the `/api/ask` handler and SSE generator. PostgreSQL for structured data, not Python `logging`.

### Decision 23: Entity Position Dual-Source Merge Strategy

Position links come from two sources (standard legends XML and legends_plus XML). Both merged into `hf_position_links` using `DO NOTHING` on conflict. NULL end_year = active position. Position IDs are entity-local (composite key `(world_id, entity_id, position_id)` is the correct reference). Upsert (DO UPDATE) on position definitions allows legends_plus to enrich records from standard legends.

### Decision 24: Selective Wiki Crawl for RAG

43,621 wiki pages exist but only ~500–800 are high-value for Chronicler development. Bulk crawl avoided in favor of targeted category-based selection. df-structures rated CRITICAL (canonical data dictionary). df-narrator rated HIGH (working prototype of the Chronicler pipeline). dfhack-client-python rated HIGH (needed for Phase 0 live data access).

---

## Open Items

### Implementation Questions (Phase 1)

1. **Watcher previous_units accessibility**: The watcher must store `previous_units` state accessible to the denizen tracking code. Must verify this state is accessible in the watcher before implementing. Add if missing.
2. **Race condition on simultaneous watcher instances**: If two watcher instances run simultaneously, duplicate denizen registrations could occur. Mitigation: Add advisory lock or check in watcher startup.
3. **Escalation threshold for `missing` → `presumed_deceased`**: After N consecutive missing cycles, status escalates. N is not yet defined.
4. **Bridge `hist_fig_id` availability**: Some units may not have `hist_fig_id` populated in the bridge. HF linking is optional — denizen works with unit_id only — but the gap should be measured.
5. **`kill_count` field in bridge**: The denizen tracking code references `u.status.current_soul.performance_group_ref` for kill_count. This field name should be verified against actual DF data structures.

### Architecture Questions (Phases 2-4)

6. **Agentic storyteller model selection**: Qwen3 32B for local or Claude Haiku for production, but this requires testing. Tool-use reliability at Qwen3 8B is described as "partial" — quantified testing needed.
7. **NVS weight tuning**: NVS formula weights (0.30/0.25/0.20/0.15/0.10) are initial estimates. Risk noted: formula may over-weight screen_time (bias toward oldest dwarves). Iterative tuning needed.
8. **Knowledge Horizon caveat definitions (CAV-001 through CAV-007)**: The design references 7 caveats for full KH but does not enumerate them in these source documents. Full definitions are in `knowledge-horizon.md` (not yet consolidated).
9. **Victim info for kill recording**: The watcher→event generator integration references `victim_info` but doesn't specify how to determine who was killed — only that `kill_count` increased. Victim resolution logic is not specified.
10. **`sync_snapshots` table**: The NVS SQL subquery references `sync_snapshots` for `COUNT(DISTINCT cycle_tick)`. This table is referenced but its full schema and population mechanism need to be verified.

### Data Questions

11. **World mismatch**: DB holds "Namoram" (legends XML); live VM runs "The Land of Dawning" (year 250). Phase 1 works with either, but long-term consistency (importing Dawning legends XML into DB) is not yet addressed.
12. **Denizens with no `hist_fig_id`**: Some units may have no `hist_fig_id` at all. These will have `hf_id = NULL` permanently unless resolved via post-embark legends re-export. Proportion in practice is unknown.
13. **Re-ingestion of world 5 (Namoram)**: Required after entity position schema migration. Whether this re-ingestion was completed as part of Session 32 work is unclear.
14. **Legends_plus assignments silent drop**: `entity_position_assignment` elements from legends_plus lack year data; records may fall into the `DO NOTHING` path when a matching standard-legends row already exists. Whether a reconciliation query is needed is not addressed.

### Deployment Questions

15. **HomeServer remote deployment blocked**: impacket remote exec auth failing (SMB signing required, null sessions disabled, possible account lockout). Manual RDP workaround available. Automation requires resolution of SMB share, WinRM/PowerShell Remoting, SSH server, or RPC-based file bootstrapping.
16. **HTTP server lifecycle management on HomeServer**: How is the PowerShell HTTP server started and kept running across DF restarts? No automated lifecycle management described.
17. **Bridge script path on HomeServer**: The exact path `dfhack-config/scripts/` relative to DF install needs to be confirmed on HomeServer.
18. **Multi-environment targeting**: The relationship between HomeServer (`192.168.4.194`) and UTM VM (`192.168.64.3`) — whether the polling daemon targets one or both, and whether the bridge/probe architecture differs between them — is not fully resolved.

### Monitoring Questions

19. **`_extract_keywords` rename audit**: The rename from private to public requires auditing all internal callers of the private name. No audit was performed.

### Phase 5 / Long-Term Questions

20. **Narrative engine (proactive story generation)**: Listed as Phase 5 item (6-8 hours), but no design has been written. Requires definition of what "proactive" means — periodic generation? event-triggered? on-demand summary?
21. **Skills time-series tracking**: Current schema stores only current skill levels. Time-series would require a new table. Design not yet written.
22. **Interactive maps (Leaflet.js)**: Requires geographic coordinate data. Current schema has region/site data but coordinate coverage needs assessment.
23. **Family tree visualization**: `hf_links` table has the data. Rendering library (D3.js? vis.js extension?) not yet selected.

### RAG Indexing Questions

24. **RAG execution status**: Status of the RAG plan beyond its 2026-02-19 draft date is unknown. Which (if any) of the not-yet-indexed repos have since been cloned and indexed is unknown.
25. **Current `df-wiki` collection state**: 4 points at plan time (target ~5,000–8,000 points); current state unknown.
26. **MediaWiki crawler script**: Has not been written; no template or prior implementation exists.
27. **LegendsBrowser2, LegendsViewer-Next, df-sites-analyzer**: Identified as MEDIUM/LOW priority but have no concrete indexing plan or timeline.
28. **`research` collection audit**: No description of how the existing ~1,200 points were generated or what documents they cover.

### Reference Documents Not Yet Consolidated

- `knowledge-horizon.md` (7 KH caveats CAV-001 through CAV-007)
- `unit-hf-field-mapping.md` (full merge strategy between Unit and HF fields)
- `chronicler-prd-v2.md` §10 (global figure scoring alongside NVS)
- All benchmark repository feature analysis reports

---

## Metrics & Targets

### Effort Estimates

| Phase | Effort | Cumulative |
|-------|--------|-----------|
| Phase 1: Denizen Registry + Death Detection | 6-8 hours | 6-8 hrs |
| Phase 2: Embark HF + Unit Expansion + Live Events | 6-8 hours | 12-16 hrs |
| Phase 3: Agentic Storyteller + Explorer Integration | 8-10 hours | 20-26 hrs |
| Phase 4: Events Tab + Knowledge Horizon Stub | 4-6 hours | 24-32 hrs |
| Monitoring System | ~3-4 hours | Parallel / independent |
| Phase 5: Polish + Long-Term | Ongoing | — |

**Total for v1.0 (Phases 1-4)**: 24-32 hours

### Performance Targets

| Metric | Target |
|--------|--------|
| Agentic storyteller response (with SQL rounds) | Under 15 seconds |
| Agentic storyteller max SQL rounds | 5 rounds |
| SQL query per-query timeout | 5 seconds |
| SQL query max rows returned | 50 rows |
| Denizen tracking bridge section cap | 500 entries |
| NVS range | 0.0 to 100.0 |
| Schema summary size for LLM prompt | ~2K tokens |
| Death detection latency | Within 2 watcher cycles |
| Missing detection latency | Within 3 watcher cycles |
| HTTP file transfer speed (UTM VM) | ~105 MB/s |
| SCP file transfer speed (UTM VM) | ~19 MB/s |
| Guest Agent transfer speed (emergency) | ~0.24 MB/s |
| Test suite execution time | 0.19s (baseline) |
| Phase 1 new tests | 12 test cases + coverage > 80% |
| Phase 1 estimated new/modified lines | ~630 |
| Bridge polling interval | 100 game ticks (DFHack repeat job) |
| Watcher polling interval | 10s default (configurable) |
| Probe interval | 60s default (configurable) |
| Monitoring dashboard auto-refresh | 30 seconds |
| Monitoring default interactions page size | 50 |

### Key Verification Metrics

| Milestone | Metric |
|-----------|--------|
| v0.9 | An embark dwarf who kills a goblin, changes profession, and reaches Legendary skill has 3+ live-generated events in `history_events` |
| v1.0 | "Who killed the dwarf who was married to the mayor?" returns accurate, evidence-cited narrative in under 15 seconds |

### Data Recovery Metrics (Gap Closure — Already Achieved)

- Cross-world ID collisions resolved: 10,932
- HFs recovered (Namoram, previously lost): 5,466
- Total HFs post-migration: 60,787 (was 55,321 — 9.9% data restoration)
- Kill counts corrected: 8,680 figures updated (max kill count: 3 → 146)
- Written contents imported: 61,692 rows across 2 worlds
- Underground regions backfilled with type/depth: 1,570 (0 NULLs remaining)
- Backup taken before migration: `chronicler-pre-migration.dump` (17MB)

### Entity Position Extraction Metrics

| Table | Expected Row Count |
|-------|--------------------|
| `entity_positions` | ~11,712 |
| `hf_position_links` (combined) | ~41,000–55,000 |
| — Active (end_year IS NULL) | ~6,843 (from legends) + overlap from legends_plus |
| — Former | ~34,356 (from legends) |
| — From legends_plus assignments | up to ~13,501 (mostly overlapping) |

### RAG Indexing Final State Targets

| Collection | Starting Points | Est. Final Points |
|-----------|----------------|-------------------|
| `dfhack` | 8,476 | ~8,700 |
| `dwarf-therapist` | 926 | 926 |
| `df-ai` | 0 | ~1,500–2,000 |
| `weblegends` | 0 | ~3,000–4,000 |
| `df-structures` | 0 | ~2,000–3,000 |
| `df-narrator` | 0 | ~300–500 |
| `dfhack-client-python` | 0 | ~100–200 |
| `df-wiki` | 4 | ~5,000–8,000 |
| `research` | ~1,200 | ~1,200+ |

- Total new points from plan: ~12,000–18,000
- Grand total after plan: ~21,000–27,000 points
- MLX bulk embedding estimate: ~30–60 minutes for ~20k chunks
- Qdrant memory impact: ~200MB additional RAM

---

## Dependencies & Risks

### Dependencies

| Dependency | Required For | Status |
|------------|-------------|--------|
| Composite PK migration | All phases | COMPLETE (Session 32) |
| 131-test suite | Regression safety | COMPLETE (Session 32) |
| Bridge v6 (16 sections) | Phase 1 denizen tracking | COMPLETE |
| Explorer 6-tab structure | Phases 3-4 UI integration | COMPLETE |
| Entity position extraction | Phase 3 position display + Knowledge Horizon | COMPLETE |
| UTM Win11 VM access | Phase 2 bridge deployment | Available (SSH + HTTP file server + SCP) |
| LLM with tool-use support | Phase 3 agentic storyteller | Available (Qwen3 32B, Claude API) |

### Cross-Phase Dependency Graph

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
    ├── live event generator (3 types initially)
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

Monitoring System: Independent — can start any time
RAG Indexing: Independent — can start any time
Probe Expansion: Independent — can start any time
```

### Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bridge deployment failures (VM offline) | MEDIUM | Test locally with mock data; deploy via SCP to VM |
| TCP RPC broken for game-thread calls | HIGH | Use `dfhack-run` over SSH as primary transport; TCP RPC only for cached calls |
| Watcher previous_units state not accessible for death detection | MEDIUM | Verify watcher stores previous cycle data; add if missing |
| NVS formula over-weights screen time (bias toward oldest dwarves) | LOW | Tune weights iteratively; add recency decay |
| NVS formula denominator is zero on first cycle | LOW | Guard against division by zero; set floor of 1 for denominators |
| Bridge unit data missing `hist_fig_id` for some units | LOW | HF linking is optional; denizen works with unit_id only |
| `dfhack-run` SSH latency adds to watcher cycle time | LOW | SSH commands are <0.5s; acceptable for 30s+ poll intervals |
| Race condition if two watcher instances run simultaneously | LOW | Add advisory lock or check in watcher startup |
| Post-embark legends re-export unavailable | LOW | Synthetic HF fallback works automatically |
| Synthetic HF data conflicts with later legends re-import | LOW | `ON CONFLICT DO UPDATE` replaces synthetic data; `embark` flag preserved |
| Knowledge Horizon too aggressive (hides useful data) | MEDIUM | Default to advisory (system prompt) not enforcement (SQL views) |
| LLM context overflow with rich denizen data | MEDIUM | Schema summary is static (~2K tokens); query results capped at 50 rows |
| Agentic LLM generates too many queries (latency) | MEDIUM | Max rounds cap (5); fallback to keyword mode |
| Agentic LLM writes invalid SQL | LOW | Read-only transaction rejects writes; keyword blocklist; 5s timeout |
| Live event IDs collide with legends event IDs | LOW | Gap of 10,000+ between max legends ID and first live ID |
| HomeServer remote deployment blocked | MEDIUM | Manual RDP workaround available; automation alternatives being explored |
| HTTP server lifecycle on HomeServer | LOW | Manual restart procedure documented; automation deferred |
| `_extract_keywords` rename breaks callers | LOW | Audit callers before rename |

---

## Reference Documents

### Active Plan Files

| Plan File | Done | Remaining | Maps to Roadmap Phase |
|-----------|------|-----------|----------------------|
| `rippling-honking-crescent.md` | Phases 1-7 | Phase 3 (unit data expansion), Phase 8 (KH stub) | Phase 2 (bridge expansion), Phase 4 (KH) |
| `shiny-churning-sprout.md` | People, Civs, Geo tabs | Events & Timeline tab | Phase 4 (events tab) |

### Reference Design Documents

| Document | Path | Role |
|----------|------|------|
| PRD v2.2 | `projects/chronicler/designs/chronicler-prd-v2.md` | Source of truth for architecture |
| Development Roadmap v1.1 | `projects/chronicler/designs/chronicler-roadmap-v1.md` | Phase-by-phase execution plan |
| Phase 1 Detailed Plan | `projects/chronicler/designs/phase-1-denizen-registry.md` | Standalone Phase 1 implementation plan |
| Unit-HF Field Mapping | `projects/chronicler/designs/unit-hf-field-mapping.md` | Merge strategy for unified person builder |
| Knowledge Horizon Design | `projects/chronicler/designs/knowledge-horizon.md` | Phase 4+ architecture, 7 caveats |
| Data Gap Analysis | `projects/chronicler/reports/data-gap-analysis-2026-02-22.md` | Exhaustive gap catalog (input to PRD) |
| Gap Closure Critical Review | `projects/chronicler/reports/gap-closure-critical-review.md` | Phases 0-4 execution record (COMPLETE) |
| UI Enhancements Plan | `.claude/plans/rippling-honking-crescent.md` | Remaining: Phase 3, Phase 8 |
| Explorer Redesign Plan | `.claude/plans/shiny-churning-sprout.md` | Remaining: Events tab (Phase 4) |
| Mac Studio Roadmap | `.claude/plans/mac-studio-db-ai-roadmap.md` | Infrastructure context |

### Reference Repositories (Benchmarking)

| Repository | Language | Key Features for Chronicler |
|-----------|----------|----------------------------|
| LegendsBrowser2 | Go + Vue.js | Custom streaming XML tokenizer, 100+ event types, collection summaries |
| LegendsViewer-Next | .NET 8 + Vue 3 | Leaflet.js maps, family trees, async XmlReader, fastest loader |
| df-narrator | Python | Figure/site/conflict scoring formulas, Markdown LLM output, direct prototype reference |
| weblegends | C++ (DFHack plugin) | 96 per-event HTML generators, context-aware circumstance/reason display |
| df-ai | C++ (DFHack plugin) | Event manager pattern, callback registration system, best DFHack plugin API reference |
| DwarfFortressLogger | C++ (Qt) | Real-time memory-mapped DF structure access |
| df-structures | XML | Canonical DF memory structure definitions — CRITICAL for CDM data dictionary |
| dfhack-client-python | Python | Python RPC client — HIGH for Phase 0 live data access |
| dwarf-therapist | C++ (Qt) | Labor management reference (Phase N: Labor Manager component) |

---

*Consolidation written 2026-02-25. Sources: round2-pair-01.md (Core Planning & Phase Implementation) + round2-pair-02.md (Data Pipeline & Ingestion Systems). All information from both documents preserved and cross-referenced. No information discarded.*
