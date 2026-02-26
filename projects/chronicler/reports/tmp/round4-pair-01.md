# Final Consolidation: Complete Chronicler/DwarfCron Planning History

**Sources**: round3-pair-01.md (Core Planning, Phase Implementation, Data Pipeline & Ingestion) + round3-pair-02.md (User Interface, VM Infrastructure, Data Model Design & Research)
**Consolidated**: 2026-02-25
**Round**: 4 / Final Merge

---

## 1. Product Vision & Architecture Overview

### 1.1 Chronicler's Unique Position in the DF Ecosystem

Chronicler is the first tool in the DF ecosystem that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse → CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel; no prior tool does this)
6. Dynamic Knowledge Horizon masking (limits LLM's search space to what the fortress plausibly knows)

No existing tool (LegendsViewer-Next, LegendsBrowser, LegendsBrowser2, weblegends, df-narrator, df-ai) covers all six simultaneously.

### 1.2 Current State (v0.8) — What Is Built

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

### 1.3 Gap Closure Work — All Complete (Session 32, 2026-02-22)

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

### 1.4 Target State (v1.0) — Three Pillars

1. **Denizen-Centric Data**: Every fortress-relevant being tracked in a registry; Unit+HF data merged; live events recorded as they happen.
2. **Agentic Intelligence**: LLM autonomously queries the database, exploring relationships and events through iterative SQL execution until it can provide an evidence-based response.
3. **Domain-Specific Explorer**: Fortress-centric views (People, Events, Civilizations, Geography) with cross-linking, NVS sorting, and Knowledge Horizon masking.

**Mental model**: The denizen registry is the root node of the Knowledge Horizon graph. The agentic storyteller is an autonomous analyst with read-only database access, not a retrieval pipeline.

### 1.5 Four Strategic Priorities (v0.8 → v1.0)

1. **Denizen Registry** — Gateway table tracking every being who has touched the fortress; root node for all queries; anchor for Narrative Value Scores. The "keystone table" — every subsequent phase depends on it.
2. **Embark-Aware Data Unification** — Post-embark legends re-export as primary path; synthetic HF records only as fallback; relationships sourced from Unit data, not heuristic guessing.
3. **Live Event Generation** — Convert runtime state transitions (kills, marriages, deaths, profession changes) into `history_events`-compatible records; gives fortress-born entities a proper event history.
4. **Agentic Storyteller** — Replace keyword-routed extraction with an LLM that autonomously executes SQL queries, performing iterative rounds of data exploration to build evidence-based responses.

### 1.6 Identified Gaps (v0.8 → v1.0)

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

### 1.7 Data Flow Architecture

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

### 1.8 New Architectural Components

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

### 1.9 Technology Stack

- FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs.
- Single `explorer.html` template.
- API routes structured in separate files per domain.
- PostgreSQL with `unaccent` extension for diacritic-tolerant search.
- vis.js loaded from CDN (`https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`) — no build step.
- Server start: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`.

### 1.10 Reference Tool Benchmarking — Feature Targets

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

## 2. Component Specifications

### 2.1 Explorer Web UI

#### 2.1.1 Tab Architecture

- Replace generic Schema/Data/Graph tabs with domain-specific tabs.
- Final tab order: `People | Civilizations | Geography | Events | Database | Graph`
- **Database** tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries; power-user access must not be removed.
- **Graph** tab = existing vis.js ego-network graph visualization as a standalone tab, also launchable from any domain detail view via "View graph" buttons.
- Update `_nav.html` to keep top-level pages (Chat / Explorer / Monitoring) and add sub-tabs within Explorer.
- Single-world simplification: hardcode `world_id=8` ("Thadar En" / "Namoram") in frontend API calls; keep `world_id` parameter in routes for schema correctness.
- Explorer is exposed at route `/explorer` within the existing Chronicler web app (not a standalone tool).

#### 2.1.2 Shared Top Navigation

- Top nav bar with links to: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`).
- Active page highlighted in amber.
- Implemented as a Jinja2 partial: `_nav.html`.
- Each template sets a `{% set active = "<page>" %}` variable before including the partial.
- `index.html`: Change body to `flex flex-col h-screen`; add nav partial before sidebar; wrap sidebar+main in `<div class="flex flex-1 overflow-hidden">`.
- `monitoring.html`: Replace existing `<header>` block with the nav partial include.

#### 2.1.3 People Tab

- Unified searchable interface merging historical figures (HFs) and in-game units.
- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter.
- Filter input stored in `peopleResults` array; `filterPeopleList(q)` re-renders matching items.
- Search supports both Dwarvish names and English translations.
- Accent-insensitive search: DF names use diacritics (ö, ü, ï, é) that break plain `ILIKE`; use `unaccent(name) ILIKE unaccent($1)` pattern with `unaccent` extension enabled on the PostgreSQL database.
- **Right panel detail card**:
  - Both Dwarvish and English names prominently displayed.
  - Biographical info: race, caste, birth/death years, computed age.
  - Relationships list (spouse, parent, child, master, etc.) with clickable names.
  - Entity memberships with position titles.
  - Skills table (for units).
  - Key life events (collapsed by default).
  - Graph button: opens ego-network in Graph tab for this entity.

##### Age Display

- Computed at display time, not stored — avoids staleness.
- Living unit/HF with `birth_year` and `game_year`: `"127 (born year 23)"`.
- Living unit/HF with `birth_year` only: `"born year 23"`.
- Dead entity with both years: `"Year 150, age 127 (old age)"`.
- Units without `birth_year` (pre-expansion bridge): gracefully show "?".
- `current_game_year` fetched from `sync_snapshots` (most recent snapshot for world).

##### HF Detail View (`renderHfDetail()`)

- Already comprehensive from legends XML extraction; no structural changes needed.
- Shows: biography, relationships, entity memberships, positions held, site links, identities, events.
- Add: computed age display using `current_game_year`.
- Cross-navigation: when a unit exists for this HF, show linked Unit card with nav-link.

##### Unit Detail View (`renderUnitDetail()`)

- Add biography card (expanded): `birth_year`, computed age, sex, death_cause.
- Relationships section: from `unit.details.relationships` — show Spouse, Mother, Father as nav-links (resolved histfig IDs to names via batch lookup).
- Personality section: 50 traits as compact grid with descriptive labels, values list, needs with satisfaction bars, dreams with accomplished flags.
- Attributes section: 6 physical + 12 mental attributes as bar charts.
- Linked HF card: when `hist_fig_id` exists and HF is found, show "This unit has a corresponding Historical Figure record." with nav-link. When HF not found: "Born after legends export."
- Skills table.
- Both Dwarvish and English names.

##### HF-Unit Linkage Gap Handling

- Unit `hist_fig_id` values (36,469+) can exceed max HF id (35,333) from the legends XML export.
- Gracefully display "No legends record — born after legends export" when HF not found.
- Cross-navigation: Unit detail links to HF record and vice versa when both exist.

##### Fortress Folk View (Phase 3 Integration)

- "Fortress Folk" default view: only `fortress_denizens` where `status IN ('resident', 'deceased', 'missing')`, sorted by NVS
- Status badges: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark)
- NVS column: sortable narrative value score
- Embark badge: visual indicator for founding dwarves

##### Unified Person Detail (Phase 3 Integration)

Click any denizen → merged Unit + HF view:
- Combined personality + historical data
- Combined event timeline (legends + live-generated, chronologically sorted)
- For `missing` denizens: timeline of last observations and nearby events ("death investigation")
- Relationships from both sources

#### 2.1.4 Civilizations Tab

- Browse entities: civilizations, religions, military orders.
- **Left panel**: Entity list grouped by type (Civilization, Religion, Military, Other), with race badges and member counts. Filter input (name/race substring) + sort dropdown (Name A-Z, Name Z-A, Most Members, Most Sites).
- **Right panel detail card**:
  - Entity name, type, race.
  - Positions table: Position | Title (gender-appropriate) | Category (color-coded badge) | Site | Current Holder.
    - Noble: king, queen, duke, baron, count, lord, monarch, emperor, consort — amber badge.
    - Military: general, captain, militia, commander, sheriff, champion, marshal — red badge.
    - Administrator: manager, bookkeeper, broker, expedition leader, mayor, chief medical — blue badge.
    - Other: fallback — stone badge.
  - Gender-appropriate title: `is_female = (holder_sex == 1 or holder_caste == "FEMALE")`, pick `name_female` / `name_male` / `name`.
  - Notable members (leaders, deities, vampires).
  - Controlled sites with links to Geography tab.
  - Related events (wars, conquests).

##### Members Loading

- Load up to 1,000 members (limit raised from prior lower value).
- Columns: Name, Race, Link Type, Position (from `position_name`), Status.
- Clickable column headers → toggle sort ascending/descending.
- Filter input → client-side substring on name/race/position.
- Data stored in `civMembersData`; client-side sort and filter without re-fetch.

#### 2.1.5 Geography Tab

- Browse sites, regions, and structures with connections to entities and HFs.
- **Left panel**: Sites grouped by type (town, fortress, cave, shrine, etc.). Filter input (name/owner substring) + sort dropdown (Name A-Z, Name Z-A, Most HFs, Most Structures).
- **Right panel detail card**: Site detail with structures, owner civ, notable inhabitants, historical events at this location.
- Regions list with type.
- Cross-linking: clicking a site from the Civilizations tab navigates to Geography tab detail.

#### 2.1.6 Events & Timeline Tab

- Browse historical events chronologically with participant filtering.
- **Controls**: Year range slider, event type dropdown, participant search.
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable).
- **Collection view**: Expandable war/battle trees.
- Event collections: WAR, BATTLE, SIEGE, and others.
- Collection detail with sub-events.
- Filtered event list: by year range, event type, HF participant, site, with limit.
- Source filter: "All Events" / "Legends Only" / "Live Only"
- Default: showing only events at the fortress site or involving fortress denizens

##### Event Detail Cards

Context-aware rendering following the **weblegends** pattern:
- Circumstance/reason fields where available
- Clickable entity references (HFs, sites, entities)

##### Event Collection View

Expandable war → battle → event trees (benchmarking **LegendsBrowser2** collection summarization). Per-LegendsBrowser2: 100+ event type rendering, war/battle/siege tree structure.

#### 2.1.7 Database Tab (Schema Browser + Data Browser)

- Formerly the "Explorer" page, now the Database tab within the new Explorer architecture.

##### Schema Browser

- Table list with row counts (use `pg_stat_user_tables.n_live_tup` for speed; exact count on detail view).
- Columns, types, primary keys, foreign keys (outgoing + incoming), and indexes per table.
- Table names validated against regex `^[a-z_][a-z0-9_]*$` plus existence check in `information_schema.tables`.
- Two-column layout: table list (left, 280px) + detail panel (right).
- Table list: clickable items showing `table_name (row_count)`, grouped by category (Legends, Geography, Live, Monitoring).
- Detail panel: columns table with PK badge, FK links (clickable → navigate to target table), incoming FKs, indexes.

##### Data Browser

- Table selector dropdown (reuses table list from schema browser).
- Filter bar: text search across text columns + sort column dropdown + ascending/descending toggle.
- Data grid with:
  - Clickable column headers for sorting.
  - FK values as clickable links navigating to the referenced row (carrying `world_id` for composite PKs).
  - JSONB columns as collapsible `<details>` with formatted JSON.
  - Booleans as colored indicators; NULLs as gray italic.
  - Long text truncated with expand-on-click.
- Pagination: Previous/Next buttons, page X of Y display, rows-per-page selector (25 / 50 / 100).
- SQL Runner: collapsible textarea, Run button, results grid, row limit selector, execution time display.
- SQL Runner safety: keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE) as defense-in-depth; primary defense is `conn.transaction(readonly=True)`; wrapped query with enforced LIMIT cap; all dynamic table/column names validated against `information_schema` before interpolation.

#### 2.1.8 Graph Tab

- vis.js ego-network visualization of historical figures (HFs), entities, and sites.
- Reuses existing Graph tab implementation; launchable from domain views via "View graph" buttons throughout.
- Search box with typeahead → `/api/explorer/graph/search` → results displayed as `Name (type)`.
- World selector dropdown.
- Depth selector: 1-hop / 2-hop / 3-hop radio buttons.
- vis.js canvas: full remaining height, dark background, forceAtlas2Based physics.
- Node info panel: overlay on click showing entity details + "Expand" button.
- Click-to-expand: adds clicked node's 1-hop connections to existing graph incrementally.
- Legend: node shapes and colors.
- Performance guard: node count badge; warning at 500+ nodes; refuse expansion at 1,000+ nodes.
- Graph query pattern: BFS from center node, depth 1–3 (clamped). Each hop:
  1. Fetch frontier HF details from `historical_figures`.
  2. Fetch HF→HF edges from `hf_links` (bidirectional).
  3. Fetch HF→Entity edges from `hf_entity_links` (with `position_name`).
  4. Fetch HF→Site edges from `hf_site_links`.
  5. Build next frontier from discovered HF IDs not yet visited.
- All entity/site detail fetches batched with `ANY($1::int[])` — no per-node N+1 queries.
- Node styling:
  - HF (default): dot, stone (#78716c).
  - HF (deity): dot, gold (#f6b93b).
  - HF (vampire): dot, red (#ef4444).
  - HF (necromancer): dot, purple (#a855f7).
  - HF (werebeast): dot, orange (#f97316).
  - HF (ghost): dot, slate (#94a3b8).
  - Entity (civilization): diamond, blue (#3b82f6).
  - Entity (religion): diamond, purple (#a855f7).
  - Site: square, green (#22c55e).
- Edge colors: family=green, spouse=pink, enemy=red, membership=blue (dashed), site link=lime (dashed).
- Node ID prefixing (`hf-123`, `entity-456`, `site-789`) avoids ID collisions between entity types.
- Return format vis.js DataSet-compatible:
  ```json
  {
    "nodes": [{"id": "hf-123", "label": "Urist", "shape": "dot", "color": {...}}],
    "edges": [{"from": "hf-123", "to": "hf-456", "label": "spouse", "color": "#f472b6"}]
  }
  ```

#### 2.1.9 Knowledge Horizon Filter (Stub, Phase 8, Deferred)

- Concept: filter all Explorer views to show only entities/events within the fortress's "known world."
- UI: "Fortress Knowledge" toggle in tab bar, hidden until horizon data exists.
- `knowledge_horizon` table: `(world_id, entity_type, entity_id, visible BOOLEAN)`.
- Backend: horizon status endpoint + optional `?horizon=true` filter param on existing endpoints.
- Full computation deferred; stub SQL table and endpoint in place for future activation.
- Explorer also serves as the design workbench for tier-propagation logic for this dynamic masking system.

#### 2.1.10 Cross-Linking Navigation

- Clicking a name in any tab navigates to the relevant tab's detail view.
- "View graph" buttons throughout domain views jump to Graph tab with entity pre-loaded.
- Civilizations → Geography (controlled sites).
- People → Civilizations (entity memberships).
- People → Geography (site links from HF data).
- Unit detail → HF detail (when linked) and vice versa.

#### 2.1.11 Sidebar Scroll Consistency

- Filter/sort controls in `flex-shrink-0` header; list containers have `overflow-y-auto`.

### 2.2 Knowledge Horizon — Dynamic Database Masking

#### Core Concept

The Knowledge Horizon is a dynamic masking system that limits the LLM's effective search space within the Chronicler database. Instead of exposing all ~1.65M CDM records across 35 tables, the mask exposes only data relevant to the fortress and its inhabitants. The mask grows organically as in-game conditions change (migrants arrive, squads raid, diplomats visit, artifacts are acquired, wars are declared).

#### Goals

- Reduce LLM search space so the LLM can be more thorough in sequential queries.
- Prevent the LLM from drawing inferences based on information a fortress would not logically possess.
- Dynamically expand the mask as the game state changes.
- Treat the Knowledge Horizon as an in-world limitation, not a system limitation (the LLM should represent ignorance as in-world uncertainty).

#### Masking Dimensions

**Geographic Scope**
- Always visible: The region containing the fortress; adjacent regions.
- Masked by default: Distant regions; other continents.
- Revealed by: Migrants from distant sites; trade caravan origins; raid targets.

**Civilization Scope**
- Always visible: The fortress's parent civilization structure (government type, notable positions).
- Masked by default: Internal details of foreign civilizations.
- Revealed by: Diplomatic contact; wars; raids on foreign sites.

**Individual Scope**
- Always visible: All fortress inhabitants (units table); their direct family.
- Masked by default: Individuals with no connection to fortress denizens.
- Revealed by: Arrival at fortress; family connection to a resident; organizational overlap.

#### Visibility Caveats (7 Rules)

**CAV-001: Organization Membership Propagation** (Status: Always visible with restrictions)
- Cults / Secret Societies: A member carries knowledge of all other members of that cult.
- Military Squads: Members know their squad-mates and chain of command.
- Guilds / Craft Groups: Members know other guild members at the same site.
- Religious Orders: Members know other worshippers of the same deity at nearby sites.
- Civilization (broad): Members do NOT carry knowledge of every single civilization member.
- Rationale: A cult is small and secretive; a civilization has thousands of members — no individual carries a mental model of all of them.

**CAV-002: Civilization Nobles and Administrators** (Status: Always visible)
- All civilization members should carry knowledge of:
  - Civilization-level nobles (king, queen, duke, baron, etc.).
  - Administrators (bookkeeper, manager, expedition leader).
  - Law-givers and military commanders.
- These are public figures whose roles are known civilization-wide.

**CAV-003: Previous Residence Knowledge** (Status: Always visible)
- A dwarf carries knowledge of all inhabitants of their previous residences (sites where they lived before migrating to the fortress).
- Includes: Other residents who lived there concurrently; notable structures and site features; local government and notable figures.
- Derivation: Cross-reference `hf_site_links` for previous residencies, then expose all HFs with overlapping site links at those sites.

**CAV-004: Starting Dwarf Background Generation** (Status: Requires implementation — new game process)
- Dwarf Fortress starting dwarves (the initial 7) do not have historical figure backgrounds — they exist only as units, not as entries in the legends data, creating a knowledge gap.
- Proposed heuristic:
  1. Check known relationships of starting dwarves (spouse, children via unit data).
  2. Assign parentage from the civilization's HF pool based on name/race matching.
  3. Assign previous residency to the civilization's capital or a nearby site.
  4. Generate synthetic `hf_site_links` and `hf_links` entries for these dwarves.
  5. Mark synthetic entries with a `source = 'inferred'` flag so they are distinguishable from legends data.
- Trigger: Run on first `chronicler watch` cycle for a new fortress (when unit count <= 7 and no HF matches exist).

**CAV-005: Family Chain Propagation** (Status: Always visible, depth-limited)
- Depth 1 (spouse, children, parents): Always visible.
- Depth 2 (siblings, grandparents, in-laws): Visible if alive.
- Depth 3+ (extended family): Masked unless another caveat reveals them.

**CAV-006: Event-Based Revelation** (Status: Dynamic)
- Certain history events unmask previously hidden data:
  - War declaration: Reveals the enemy entity's leadership, sites, and military.
  - Caravan arrival: Reveals the sending civilization's trade goods and diplomats.
  - Migrant wave: Reveals each migrant's previous site and social connections.
  - Raid/expedition return: Reveals sites visited and entities encountered.
  - Artifact acquisition: Reveals the artifact's creation history and previous owners.

**CAV-007: LLM Inference Restrictions** (Status: Permanent rule)
- The LLM must be instructed:
  - Do NOT infer events or relationships not present in the unmasked data.
  - Do NOT speculate about masked regions or civilizations.
  - When asked about unknown areas, state that the fortress has no intelligence on that topic.
  - Treat the Knowledge Horizon as an in-world limitation, not a system limitation.

#### Knowledge Horizon — Phased Rollout Plan

| Phase | Scope | When |
|-------|-------|------|
| Phase 1 (current PRD) | Denizen registry as starting point for agentic queries | Immediate |
| Phase 2 | View-based masking for HFs (visible if denizen or 1-hop from denizen) | After Phase 1 validated |
| Phase 3 | Geographic masking (visible sites = fortress region + denizen origins) | After Phase 2 |
| Phase 4 | Full Knowledge Horizon with 7 caveats (CAV-001 through CAV-007) | Long-term |

In agentic architecture, Knowledge Horizon manifests as query constraints injected into the system prompt rather than database views. Default: advisory mode (system prompt) not enforcement (SQL views).

#### Knowledge Horizon — Database Architecture Alternatives

**Preferred Approach: View-Based Masking**
- Create PostgreSQL views that filter base tables through a `visibility` predicate.
- Naturally consistent with live data; no data duplication.

```sql
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT hf_id FROM knowledge_horizon WHERE visible = true);
```

**Alternative Approach: Materialized Subset**
- Copy visible rows into shadow tables, refreshed on each watcher cycle.
- Pros: Faster queries.
- Cons: Higher storage cost; sync complexity.

**Recommended Path**: Start with view-based masking. If query performance becomes an issue at 60K+ HFs, add materialized views with incremental refresh.

**Exploration Prerequisites** (must be done before implementation):
1. Map organization types present in `entities` and `hf_entity_links`.
2. Count HFs per organization type to size the visibility tiers.
3. Trace a sample dwarf's connections through `hf_links`, `hf_site_links`, `hf_entity_links` to validate propagation rules.
4. Identify starting dwarves in the `units` table that lack HF matches.

### 2.3 Narrative Engine Features

#### Event Rendering Pipeline

Standard pattern (adopted from all successful tools):
```
Event (typed struct) → Context (current entity perspective) → Template (per-type prose) → HTML (with entity links)
```

Chronicler with LLM:
```
Event (CDM row) → Context (target entity + related entities) → LLM prompt (with event type template) → Narrative (with entity references marked for linking)
```

#### Perspective-Aware Rendering (LegendsBrowser2 gold standard)

When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns ("his wife"), while other entities remain fully linked. weblegends implements the same via `event_link()` (suppresses link for context entity). LegendsViewer-Next does NOT do this.

Requirement: Implement perspective-aware narrative generation. Pass entity ID as context to LLM so narrative uses appropriate pronouns and suppresses redundant self-references.

#### Death Cause Rendering (40+ variants, from weblegends)

Complete death cause taxonomy with specific prose per cause:
```
OLD_AGE → "died of old age"
SHOT → "was shot and killed"
BLEED → "bled to death"
DROWN → "drowned"
SUFFOCATE → "suffocated"
MAGMA → "was consumed by magma"
DRAGONFIRE → "was killed by dragonfire"
CAVEIN → "was crushed in a cave-in"
DRAWBRIDGE → "was smashed by a drawbridge"
BEHEAD → "was beheaded"
CRUCIFY → "was crucified"
BURN_ALIVE → "was burned to a crisp"
HACK_TO_PIECES → "was hacked to pieces"
DRAIN_BLOOD → "was drained of blood"
LEAPT_FROM_HEIGHT → "leapt from a great height"
INFECTION → "succumbed to infection"
... (25+ more variants)
```

Each death also includes: weapon info, slayer identity with race, and age at death (with fractional year display).

Requirement: Implement full 40+ death cause taxonomy in Chronicler's narrative engine. Highest-value narrative enrichment feature.

#### Cross-Linking Infrastructure

Every successful legends browser makes cross-linking the central UX. All entity references in event narrative text must become navigable links.

| Aspect | LV-Next | LB2 | weblegends |
|---|---|---|---|
| Link format | HTML `<a>` generated server-side | HTML `<a>` via Go template functions | HTML `<a>` via C++ `link()` function |
| Context awareness | No | Yes (`HfId` context → relational pronouns) | Yes (`event_context` → suppress self-links) |
| Rendering | `v-html` injection | Go template `{{ hf .Id }}` | `ostream << link(s, entity)` |
| Hover preview | No | Yes (Bootstrap popover via Ajax) | No |

#### DF Calendar Utility (shared across all narrative/display code)

Formula (all tools use the same approach):
```python
# seconds72 → calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

# Month names
months = ["Granite", "Slate", "Felsite",      # Spring
          "Hematite", "Malachite", "Galena",   # Summer
          "Limestone", "Sandstone", "Timber",  # Autumn
          "Moonstone", "Opal", "Obsidian"]     # Winter

# Season
season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```

Requirement: Implement once in a shared utility, use consistently everywhere.

### 2.4 Visualization Features

Chronicler currently has NO visualization beyond the vis.js ego-network graph. Every existing legends browser provides at least map and chart visualization.

| Visualization | LV-Next | LB1 | LB2 | weblegends | Priority for Chronicler |
|---|---|---|---|---|---|
| Interactive world map (Leaflet) | Yes | No | Yes | Static PNG | **P1** — centerpiece feature |
| Site markers (type-coded shapes) | Yes | Yes | Yes | No | **P1** |
| Civilization color coding | Yes (HSV) | Yes (jscolor) | Yes | No | **P1** |
| Family tree (graph viz) | Yes (Cytoscape dagre) | Yes (SVG custom) | No | No | **P2** |
| Curse lineage tree | No | Yes (SVG) | No | No | **P3** |
| Warfare graph (force-directed) | Yes (Cytoscape cola) | No | No | No | **P2** |
| War chord diagram | No | Yes (D3) | No | No | **P3** |
| Event timeline (line chart) | Yes (Chart.js) | No | No | No | **P2** |
| Population pie/doughnut | Yes (Chart.js) | Yes (D3) | No | No | **P2** |
| Event type breakdown (bar) | Yes (Chart.js) | No | No | No | **P3** |
| Per-object mini-map | Yes | No | No | Yes | **P2** |
| Hover popovers | No | Yes (Bootstrap) | Yes (Bootstrap) | No | **P2** |

#### Map Implementation Consensus

- Coordinate system: `L.CRS.Simple` (no geographic projection)
- Y-axis: Inverted from DF coordinates (`map_height - y`)
- Scale: 4-10 pixels per world tile
- Site markers: Colored polygons/shapes coded by site type and owning civilization
- Layer control: Toggle site layers by civilization/type
- Chronicler advantage: PostgreSQL + PostGIS (if extended) enables spatial queries no in-memory tool can match

### 2.5 Worldgen Monitoring (Novel Capability)

No existing tool monitors worldgen in real time.

Available data in `world_generatorst` struct at `df.global.world.worldgen_status`:
- 12-state generation phase enum (None through Done)
- Progress counters (rivers, civs, rampages)
- Phase completion flags (caves placed, megabeasts placed, etc.)
- Event cursor (`last_event_id_added`)
- Live access to `world.history.figures/events/eras` as they populate

Implementation: A `worldgen-bridge.lua` script using the existing `repeat` job pattern, polling every 30 frames (~0.5s), writing JSON snapshots.

CDM addition: `worldgen_snapshots` table.

Chronicler value: First-ever real-time worldgen dashboard showing:
- Civilization count rising
- Event accumulation curves
- Era transitions
- Phase progression as world generates

### 2.6 LLM Advisor (AI DF Player)

Exclusive action queue architecture (from df-ai):
- Maintain one active action chain
- Queue pending actions
- Report completion/failure before starting next

Stock threshold model from df-ai provides reference heuristics for LLM advisor context.

### 2.7 Mod Awareness (Deferred)

The only potentially relevant feature is recording which mods were active when a world was generated, capturable during worldgen monitoring. Full mod management (raw file parsing, conflict detection, profile management) is deferred and out of scope for Chronicler core.

### 2.8 Monitoring & Observability System

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

### 2.9 Post-Parse Processing Pipeline

Every legends browser runs a post-parse cross-referencing pass (LV-Next: 12 resolve steps, LB2: 6 process steps). Chronicler requires the same after XML ingestion:

1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores

---

## 3. Common Data Model & Database Schema

### 3.1 Unit-Historical Figure Data Model

#### Core Concept

Units (live game entities from DFHack memory) and Historical Figures (legends XML data) often represent the same person. The mapping defines which fields exist on each, which overlap, and which source is authoritative — enabling the LLM storyteller to merge both views into a unified "person" for narrative generation.

#### Linkage Mechanism

- `units.hist_fig_id` → `historical_figures.id` (within same `world_id`).
- Not all units have HF records (born after legends export date).
- Not all HFs have unit records (dead, off-map, or non-fortress entities).

#### Overlapping Fields (Both Sources)

| Field | Unit Source | HF Source | Authoritative |
|-------|-------------|-----------|---------------|
| Name (Dwarvish) | `units.name` | `historical_figures.name` | Unit (live, may change) |
| Name (English) | `units.english_name` | — | Unit only |
| Race | `units.race` | `historical_figures.race` | Either (should match) |
| Caste | `units.caste` | `historical_figures.caste` | Either (should match) |
| Birth year | `units.birth_year` | `historical_figures.birth_year` | HF (canonical) |
| Death year | — | `historical_figures.death_year` | HF only |
| Death cause | `units.death_cause` | `historical_figures.death_cause` | HF (richer text) |
| Sex | `units.sex` (0=M, 1=F) | `historical_figures.caste` | Unit (numeric) |
| Alive status | `units.is_alive` | `death_year IS NULL` | Unit (real-time) |
| Civilization | `units.civ_id` | `historical_figures.entity_id` | Unit (may change) |
| Relationships | `units.details.relationships` (9 slots) | `hf_links` table | HF (comprehensive) |
| Entity memberships | — | `hf_entity_links` table | HF only |
| Position history | — | `hf_position_links` table | HF only |

#### Unit-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Profession | `units.profession` | Current job assignment |
| Position (x,y,z) | `units.pos_x/y/z` | Real-time map coordinates |
| Skills | `units.details.skills[]` | Full skill list with levels + XP |
| Labors | `units.details.labors[]` | Active labor assignments |
| Personality traits | `units.details.personality.traits{}` | 50 facets, 0–100 scale |
| Values | `units.details.personality.values[]` | Core value priorities |
| Needs | `units.details.personality.needs[]` | Need satisfaction levels |
| Dreams/goals | `units.details.personality.dreams[]` | Life aspirations |
| Physical attributes | `units.details.physical_attrs{}` | STR, AGI, etc. (6 attributes) |
| Mental attributes | `units.details.mental_attrs{}` | Analytical, Focus, etc. (12+ attributes) |
| Stress level | Bridge `unit_summary` | Current stress counter |
| Mood | Bridge `unit_summary` | Strange mood status |
| Squad | `units.details.squad_id` | Military assignment |
| Old year (lifespan) | `units.details.old_year` | Expected death year |
| Cultural identity | `units.details.cultural_identity` | Cultural group beyond civ |

#### HF-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Kill count | `historical_figures.kill_count` | Lifetime kills |
| Event count | `historical_figures.event_count` | Historical events involved in |
| Type flags | `is_deity, is_vampire, ...` | 6 boolean flags |
| Identities | `identities` table | Assumed names/disguises |
| Site links | `hf_site_links` table | Home, lair, prison, etc. |
| Spheres | `historical_figures.details` | Deity spheres of influence |
| Written works | Events table | Authored books/compositions |
| Reputation | Events table | Derived from event participation |

#### Unit-HF Merge Strategy (6 Rules)

1. Start with Unit data (always fresher for live entities).
2. Overlay HF data for historical depth (relationships, events, positions).
3. For conflicts: prefer Unit for real-time state; prefer HF for historical facts.
4. Personality data is Unit-only (not present in legends XML).
5. Event history comes from TWO sources: HF events (legends XML) + live-generated events (watcher state transitions). Both stored in `history_events` table, distinguished by `live_generated` flag and `source` column.
6. If a unit has no HF record and is an embark dwarf: flag `embark: true` — personality and skills are available; event history grows from live event generation forward.

#### Unit-HF Merge — Unified Person Schema

The LLM is served a single merged JSON "person" object:

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
    {"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345},
    {"type": "Mother", "name": "Urvad Glazedchest", "hf_id": 12346}
  ],

  "personality": {
    "notable_traits": ["Very brave", "Very curious", "Somewhat anxious"],
    "values": ["Family", "Craftsmanship"],
    "unmet_needs": ["Socialize", "Practice martial art"],
    "dreams": ["Start a family (accomplished)", "Master a skill"]
  },

  "positions_held": [
    {"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}
  ],

  "skills": [
    {"name": "Mining", "level": 20, "label": "Legendary"},
    {"name": "Hammerdwarf", "level": 12, "label": "Great"}
  ],

  "key_events": [
    {"year": 45, "type": "slew", "description": "Slew a forgotten beast"},
    {"year": 120, "type": "artifact", "description": "Created Asen Nidostdishmab"}
  ],

  "sources": {
    "unit_id": 567,
    "hf_id": 12340,
    "world_id": 8
  }
}
```

#### Integration: Knowledge Horizon + Unit-HF Merge

- The Knowledge Horizon masking system determines WHICH historical figures are visible to the LLM.
- The Unit-HF field mapping determines HOW those visible figures are presented to the LLM (merged person schema).
- The `fortress_denizens` registry is the bridge: it identifies fortress-relevant units, the merge layer produces their unified person objects, and the Knowledge Horizon governs which external HFs are reachable from those persons via relationship traversal.
- Starting dwarves (CAV-004) and embark dwarves (Merge Rule 6) share the same problem: no HF record. Both require synthetic data generation with `source = 'inferred'` flags.
- CAV-003 (Previous Residence Knowledge) directly uses `hf_site_links` — the same table that appears in the HF-only fields of the field mapping.

### 3.2 CDM Entity Coverage & Gaps

#### Core Entity Types — Coverage Across Tools

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | df-structures | Chronicler CDM |
|---|---|---|---|---|---|---|
| Historical Figures | Full | Full | Full | Scored subset | Full (canonical) | Full |
| Sites | Full | Full | Full | Scored subset | Full | Full |
| Entities (Civs) | Full | Full | Full | Name only | Full | Full |
| Artifacts | Full | Full | Full | Scored subset | Full | Full |
| Regions | Full | Full | Full | No | Full | Full |
| Underground Regions | Full | Full | Full | No | Full | Partial |
| Structures | Full | Full | Full | No | Full | Full |
| World Constructions | Full | Full | Partial | No | Full | **Missing** |
| Written Content | Full | Full | Partial | No | Full | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | Full | **Missing** |
| Identities | Full | Full | No | No | Full | **Missing** |
| Landmasses | Full | Full | No | No | Full | Partial |
| Mountain Peaks | Full | Full | No | No | Full | Partial |
| Rivers | Full | Stub | No | No | Full | **Missing** |
| Entity Populations | Full | Stub | Partial | No | Full | Partial |
| Event Collections | Full | Full | Full | Partial | Full | Partial |

#### Historical Figure (HF) CDM — Completeness Audit

Already in Chronicler CDM: `id`, `name`, `race`, `caste`, `sex`, `birth_year`, `death_year`, `profession`, `associated_type`, `civ_id`, `unit_id`

Missing — High Priority:
- `deity`, `force`, `ghost` flags (from `histfig_flags`)
- `active_interactions` (vampire/necromancer/werebeast detection)
- `spheres` (deity domains)
- `goals` (life goals)
- `skills` with XP points (from `info.skills`)
- `entity_links` with link type and position details
- `histfig_links` (family: mother/father/child/spouse)
- `site_links` (lair, home, seat_of_power)
- `kills` (notable and other kill records)
- `whereabouts` / `current_state` (geographic location)
- `vague_relationships` and `relationship_profiles`
- `entity_reputations` (murderer, hero, monster, etc.)
- `intrigue_actors` / `intrigue_plots` (v0.47+ intrigue system)
- `used_identities` / `current_identity` (false identity tracking)
- `journey_pets`
- `holds_artifact` (currently held artifacts)
- `breed_id`, `cultural_identity`, `family_head_id`

Missing — Medium Priority:
- `orientation_flags`
- `curse_year` / `curse_seconds`
- `personality` (values, ethics, mannerisms — 70+ mannerism types, value types, ethic types)
- `knowledge_profile` (known secrets, known books, belief systems)
- `reputation_profile` (wanted status, journey profile)

Required New CDM Entity Types:
- `WorldConstructions` table (roads, bridges, tunnels)
- `ArtForms` tables x 3 (poetic, musical, dance)
- `Identities` table (false identities assumed by HFs)
- `Rivers` table
- Full `Entity Populations` extension

#### Importance Scoring

Add `importance_score` columns to: `historical_figures`, `sites`, `artifacts`, `conflicts` (from df-narrator formulas). Compute on XML ingestion. Use for LLM context selection (top-N entities by score for world summary generation).

Scoring formulas (from df-narrator, directly usable):

**Figure Importance Score**:
```
events x 2 (cap 500) + kills x 15 + vampire(80) + necromancer(100) + deity(120) +
force(90) + megabeast(70) + HF_links x 3 (cap 100) + leadership_positions x 20 +
artifacts_held x 30 + spheres x 10 + skills_bonus (cap 80) + site_links x 5 (cap 50) +
entity_links x 3 (cap 60) + death_recorded(5)
```

**Site Importance Score**:
```
events + deaths x 2 + event_collections x 5 + structures x 3
```

**Conflict Importance Score**:
```
deaths x 3 + battles x 10 + sites_involved x 5 + duration_years
```

**Artifact Importance Score**:
```
events x 10 + unique_holders x 20 + lost_or_stolen(30) + named(50)
```

#### Reference Taxonomies

**Site Types** (24 distinct, union of all sources):
Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress, Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery, Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace, Ruins, Shrine, Tomb, Tower, Town, Vault

**Entity Types** (from weblegends + LB2):
Civilization, Site Government, Nomadic Group, Migrating Group, Religion, Military Unit (mercenary/shadowy/versatile), Guild, Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang, Outcast, Semi-Megabeast, Mega-Beast, Unknown

**HF Relationship Types** (comprehensive, from df-structures):
- HF-to-HF: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner
- HF-to-Entity: Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position, Former Position, Position Claim, Occupation, Former Occupation, Squad, Former Squad
- HF-to-Site: Lair, Home Site (abstract/realization building), Seat of Power, Hangout, Occupation, Prison

**HF XML Event Fields That Reference HF IDs** (canonical list from df-narrator):
```
hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid,
changee_hfid, changer_hfid, woundee_hfid, wounder_hfid,
doer_hfid, target_hfid, attacker_hfid, defender_hfid,
hist_fig_id, body_hfid, hfid_target, hfid_attacker,
hfid_defender, trickster_hfid, cover_hfid, student_hfid,
teacher_hfid, trainer_hfid, seeker_hfid
```

### 3.3 Database Schema — Complete DDL

#### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

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

Alternative stub schema (simpler):
```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
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
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex INT;  -- SMALLINT in some schemas
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
-- Personality, relationships, attributes → details JSONB
```

### 3.4 Entity Position Extraction (CDM)

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

## 4. Data Extraction & Ingestion Pipeline

### 4.1 DFHack Bridge — Unit Data Extraction

#### Fields Currently Captured (~15 fields out of 100+ available)

- Identity: id, name, english_name, first_name, race (via race_map), caste (in schema but NOT previously in bridge output), profession.
- Position: pos_x/y/z.
- State: is_alive, flags1/2/3, mood, has_mood, had_mood.
- Social: civ_id, hist_fig_id, squad_id, squad_position.
- Emotional: stress, focus, longterm_stress, combat_hardened.
- Physical: pregnancy_timer, pregnancy_spouse, soldier_mood.
- Skills: full skill list (id, rating, experience) via `dwarf_skills` section.
- Emotions: recent emotions (type, thought, strength, severity, year) via `dwarf_emotions` section.

#### New Fields to Extract (High Value, Phase 3 — COMPLETE)

| Field | Lua Path | Narrative/Analytical Value |
|-------|----------|---------------------------|
| birth_year | `u.birth_year` | Age calculation, generational stories |
| birth_time | `u.birth_time` | Precise birth timing |
| old_year | `u.old_year` | Expected lifespan |
| sex | `u.sex` | Gender for title selection |
| caste (from bridge) | `u.caste` | Currently in schema but not bridge output |
| relationship_ids | `u.relationship_ids[type]` | Spouse, Mother, Father — 9 slots, histfig IDs |
| death_cause | `u.counters.death_cause` | Enriches death events beyond boolean |
| cultural_identity | `u.cultural_identity` | Cultural group beyond civ_id |
| personality traits | `u.status.current_soul.personality.traits[facet]` | 50 facets (Brave, Curious, etc.) |
| personality values | `u.status.current_soul.personality.values[i]` | Core values (Family, Tradition, Power...) |
| personality needs | `u.status.current_soul.personality.needs[i]` | 30 need types with focus_level |
| life goals/dreams | `u.status.current_soul.personality.dreams[i]` | Start family, master skill, etc. |
| physical attrs | `u.body.physical_attrs[type].value` | Strength, Agility, etc. (6 attrs) |
| mental attrs | `u.status.current_soul.mental_attrs[type].value` | Analytical, Focus, etc. (12 attrs) |
| preferences | `u.status.current_soul.preferences[i]` | Likes/dislikes for materials, creatures |
| need states | `u.counters2.hunger_timer` etc. | Hunger, thirst, sleep timers |

#### Expanded `unit_summary` Section Code

```lua
-- Biographical
entry.birth_year = u.birth_year
entry.birth_time = u.birth_time
entry.old_year = u.old_year
entry.sex = u.sex
entry.caste = u.caste

-- Relationships (9 slots, 0-indexed)
entry.relationships = {}
local rel_types = {'PetOwner','Spouse','Mother','Father','LastAttacker','GroupLeader','Draggee','Dragger','RiderMount'}
for i, rtype in ipairs(rel_types) do
    local hfid = u.relationship_ids[i-1]
    if hfid and hfid > -1 then
        entry.relationships[rtype] = hfid
    end
end

-- Death cause (for dead units still in list)
if dfhack.units.isDead(u) then
    entry.death_cause = u.counters.death_cause
end

-- Cultural identity
entry.cultural_identity = u.cultural_identity
```

#### New `dwarf_personality` Bridge Section Code

```lua
local soul = u.status.current_soul
if soul then
    local p = soul.personality
    -- Traits (50 facets, 0-100 scale stored as 0-10000 internally)
    entry.traits = {}
    for i = 0, 49 do
        entry.traits[df.personality_facet_type[i]] = p.traits[i]
    end
    -- Values
    entry.values = {}
    for _, v in ipairs(p.values) do
        table.insert(entry.values, {type=df.value_type[v.type], strength=v.strength})
    end
    -- Needs with focus level
    entry.needs = {}
    for _, n in ipairs(p.needs) do
        table.insert(entry.needs, {type=df.need_type[n.id], focus=n.focus_level, level=n.need_level})
    end
    -- Dreams/goals
    entry.dreams = {}
    for _, d in ipairs(p.dreams) do
        table.insert(entry.dreams, {type=df.goal_type[d.type], accomplished=d.flags.accomplished})
    end
    -- Physical attributes (6)
    entry.physical_attrs = {}
    for i = 0, 5 do
        local attr = u.body.physical_attrs[i]
        entry.physical_attrs[df.physical_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
    -- Mental attributes (12)
    entry.mental_attrs = {}
    for i = 0, 11 do
        local attr = soul.mental_attrs[i]
        entry.mental_attrs[df.mental_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
end
```

#### Bridge Data Domains Covered

- `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.

#### Bridge Enhancement Requirements (Planned)

1. Add `eventful` subscriptions for reactive event capture (currently polling-only):
   - `UNIT_DEATH`
   - `ITEM_CREATED`
   - `JOB_COMPLETED`
   - `UNIT_NEW_ACTIVE`
   - `SYNDROME`
2. Death cause enrichment — use `df.global.world.incidents.all` pattern from myDFHackScripts to get death cause enum + killer ID.
3. Parent/family chain — `unit.relationship_ids.Mother/Father` for family tree data from live units.
4. Book detection — `dfhack.items.getBookTitle(item)` for written work events.
5. Incident system — full incident lookup for crime/death narrative.

#### Polling + Events Hybrid Pattern (proven from myDFHackScripts)

Use `eventful` subscriptions for real-time events (deaths, item creation) AND polling via `dfhack.timeout` for state changes (citizen count, reports, petitions). Catches both immediate events and gradual state transitions.

#### Bridge Architecture Validation (from Research)

Three independent codebases (df-ai, myDFHackScripts, weblegends) use the same fundamental patterns, confirming Chronicler's approach:

| Pattern | df-ai (C++) | myDFHackScripts (Lua) | Chronicler bridge (Lua) |
|---|---|---|---|
| Tick-based polling | `OnupdateCallback` | `dfhack.timeout(500, 'ticks')` | `repeat --time 500 --timeUnits ticks` |
| Event subscription | N/A (C++ hooks) | `eventful.onUnitDeath[modId]` | Not yet (polling only) |
| Change detection | Set comparison (citizen IDs) | `Helper.watch()` factory | Snapshot comparison |
| Data access | `df::world->units.active` | `df.global.world.units.active` | `df.global.world.units.active` |
| Death cause lookup | Direct memory | `df.global.world.incidents.all` | Not yet |

### 4.2 Lua Bridge Script (`chronicler-bridge.lua`)

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

### 4.3 Live Polling Daemon Features (Watcher / Bridge / Probes)

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

### 4.4 XML Parser Modifications (`chronicler/ingest/xml_parser.py`)

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

### 4.5 Event Type Taxonomy — Full Canonical Inventory

#### Authoritative Count: 141 Total Canonical Types

- 133 from df-structures `history_event_type` enum (excluding `NONE = -1`)
- 8 additional types added in the DF 50.x Steam release (not yet in df-structures enum)

NOTE: The research-synthesis.md incorrectly reported 144 types. The event-type-taxonomy.md (dated 2026-02-23) corrects this. All downstream tooling and planning must use **141**, not 144.

Coverage across tools:

| Source | Event Types | Authoritative? |
|--------|-------------|----------------|
| df-structures `history_event_type` enum | 133 | Yes — canonical for older DF versions |
| DF 50.x Steam additions (not in enum yet) | 8 | Yes — observed in real DF 50.13 DB |
| **Total canonical** | **141** | **Combined authoritative** |
| LegendsBrowser2 `events.go` | 122 handled | Yes — most complete handler implementation |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Yes — .NET source, production |
| weblegends `events/*.cpp` | 94 files | Yes — C++ source, production |
| Chronicler DB (world 8, "Thadar En") | 97 observed types | Real DF 50.13 legends XML observation |
| df-narrator | Generic (type string) | No — no per-type handling |

#### Chronicler Strategy for Unhandled Types

- Store all event types as TEXT column (no DB enum constraint)
- Raw event data stored in `details` JSONB column
- The agentic storyteller handles all types via LLM interpretation of raw field data — no per-type template required
- This covers the 11 types in df-structures with no LegendsBrowser2 handler, gracefully

#### Recommended Target

All 141 event types for schema definition, with narrative templates for the 122 types that LegendsBrowser2 handles, and graceful LLM fallback (raw field dump) for the remaining 19.

#### Category 1: HF Lifecycle (17 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HIST_FIGURE_DIED | hf died | 20,620 | Yes | Death of a historical figure |
| HIST_FIGURE_WOUNDED | hf wounded | 3,263 | Yes | HF takes wounds in combat |
| HIST_FIGURE_ABDUCTED | hf abducted | 3,282 | Yes | HF kidnapped |
| HIST_FIGURE_REVIVED | hf revived | 425 | Yes | Resurrection or undead reanimation |
| HIST_FIGURE_REUNION | hf reunion | 136 | Yes | HF reunited with family/companions |
| HIST_FIGURE_REACH_SUMMIT | — | Not in DB | Yes | HF climbs a mountain peak |
| HIST_FIGURE_TRAVEL | hf travel | 802 | Yes | Long-distance journey |
| HIST_FIGURE_NEW_PET | hf new pet | 319 | Yes | HF acquires a pet |
| HIST_FIGURE_SIMPLE_BATTLE_EVENT | hf simple battle event | 17,238 | Yes | Generic combat action |
| HIST_FIGURE_SIMPLE_ACTION | — | Not in DB | **No** | Generic non-combat action (unhandled) |
| CHANGE_HF_STATE | change hf state | 53,077 | Yes | State transition (settled, wandering, etc.) |
| CHANGE_HF_JOB | change hf job | 49,584 | Yes | Profession change |
| CHANGE_HF_BODY_STATE | change hf body state | 118 | Yes | Physical transformation |
| CHANGE_HF_MOOD | — | Not in DB | **No** | Mood change (strange mood, etc.) — unhandled |
| CHANGE_CREATURE_TYPE | changed creature type | 122 | Yes | Species transformation (curse) |
| HF_GAINS_SECRET_GOAL | hf gains secret goal | 424 | Yes | Acquires a secret motivation |
| HF_RELATIONSHIP_DENIED | hf relationship denied | 2,742 | Yes | Relationship attempt rejected |

#### Category 2: HF Relationships & Links (10 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ADD_HF_HF_LINK | add hf hf link | 19,061 | Yes | New relationship between HFs |
| REMOVE_HF_HF_LINK | remove hf hf link | 7,108 | Yes | Relationship ended |
| ADD_HF_ENTITY_LINK | add hf entity link | 33,880 | Yes | HF joins entity |
| REMOVE_HF_ENTITY_LINK | remove hf entity link | 1,568 | Yes | HF leaves entity |
| ADD_HF_SITE_LINK | add hf site link | 4,208 | Yes | HF associated with site |
| REMOVE_HF_SITE_LINK | remove hf site link | 841 | Yes | HF leaves site |
| ADD_HF_ENTITY_HONOR | add hf entity honor | 16 | Yes | Honor/award granted |
| ASSUME_IDENTITY | assume identity | 1,878 | Yes | HF takes false identity |
| HFS_FORMED_REPUTATION_RELATIONSHIP | hfs formed reputation relationship | 3,579 | Yes | Reputation link formed |
| HFS_FORMED_INTRIGUE_RELATIONSHIP | hfs formed intrigue relationship | 448 | Yes | Intrigue link formed |

#### Category 3: HF Actions (14 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HF_ATTACKED_SITE | hf attacked site | 168 | Yes | HF leads attack on a site |
| HF_DESTROYED_SITE | hf destroyed site | 123 | Yes | HF destroys a site |
| HF_CONFRONTED | hf confronted | 127 | Yes | HF confrontation (challenge) |
| HF_DOES_INTERACTION | hf does interaction | 52 | Yes | Supernatural interaction |
| HF_LEARNS_SECRET | hf learns secret | 181 | Yes | Learns necromancy/vampirism |
| HF_PREACH | hf preach | 449 | Yes | Religious preaching |
| HF_FREED | — | Not in DB | Yes | HF freed from captivity |
| HF_RANSOMED | hf ransomed | 1 | Yes | HF ransomed |
| HF_ENSLAVED | — | Not in DB | Yes | HF enslaved |
| HF_ACT_ON_BUILDING | — | Not in DB | **No** | HF acts on a building — unhandled |
| HF_ACT_ON_ARTIFACT | — | Not in DB | **No** | HF acts on an artifact — unhandled |
| HF_RAZED_BUILDING | — | Not in DB | **No** | HF razes a building — unhandled |
| HF_RECRUITED_UNIT_TYPE_FOR_ENTITY | hf recruited unit type for entity | 3,441 | Yes | Military recruitment |
| SNEAK_INTO_SITE | — | Not in DB | Yes | Covert infiltration |

#### Category 4: HF Intrigue (6 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HF_CONVICTED | hf convicted | 854 | Yes | Criminal conviction |
| HF_INTERROGATED | hf interrogated | 40 | Yes | Interrogation |
| FAILED_INTRIGUE_CORRUPTION | failed intrigue corruption | 1,245 | Yes | Corruption attempt failed |
| FAILED_FRAME_ATTEMPT | failed frame attempt | 24 | Yes | Framing attempt failed |
| SABOTAGE | — | Not in DB | Yes | Sabotage action |
| SPOTTED_LEAVING_SITE | — | Not in DB | Yes | Caught leaving a site |

#### Category 5: Artifacts (13 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ARTIFACT_CREATED | artifact created | 5,773 | Yes | Artifact forged/crafted |
| ARTIFACT_DESTROYED | — | Not in DB | Yes | Artifact destroyed |
| ARTIFACT_LOST | artifact lost | 435 | Yes | Artifact whereabouts unknown |
| ARTIFACT_FOUND | artifact found | 22 | Yes | Lost artifact rediscovered |
| ARTIFACT_RECOVERED | artifact recovered | 16 | Yes | Artifact retrieved |
| ARTIFACT_POSSESSED | artifact possessed | 67 | Yes | Artifact claimed by HF |
| ARTIFACT_GIVEN | artifact given | 299 | Yes | Artifact transferred |
| ARTIFACT_STORED | artifact stored | 4,721 | Yes | Artifact placed in storage |
| ARTIFACT_TRANSFORMED | — | Not in DB | Yes | Artifact altered |
| ARTIFACT_COPIED | artifact copied | 287 | Yes | Written artifact copied |
| ARTIFACT_CLAIM_FORMED | artifact claim formed | 732 | Yes | Ownership claim |
| ARTIFACT_HIDDEN | — | Not in DB | **No** | Artifact hidden — unhandled |
| ARTIFACT_DROPPED | — | Not in DB | **No** | Artifact dropped — unhandled |

#### Category 6: Sites & Construction (11 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| CREATED_SITE | created site | 1,126 | Yes | New site established |
| WAR_DESTROYED_SITE | destroyed site | 10 | Yes | Site destroyed in war |
| RECLAIM_SITE | reclaim site | 46 | Yes | Abandoned site reclaimed |
| SITE_DIED | — | Not in DB | Yes | Site population died off |
| SITE_RETIRED | — | Not in DB | Yes | Player retired a fortress |
| CREATED_BUILDING | created structure | 1,401 | Yes | Building constructed |
| REPLACED_BUILDING | replaced structure | 6 | Yes | Building replaced |
| ENTITY_RAZED_BUILDING | razed structure | 35 | Yes | Building torn down |
| CREATED_WORLD_CONSTRUCTION | created world construction | 203 | Yes | Road/bridge/tunnel |
| MODIFIED_BUILDING | modified building | 12 | Yes | Building altered |
| BUILDING_PROFILE_ACQUIRED | building profile acquired | 256 | Yes | Building gains profile |

#### Category 7: Entities (14+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ENTITY_CREATED | entity created | 1,112 | Yes | New organization formed |
| ENTITY_ACTION | — | Not in DB | **No** | Generic entity action — unhandled |
| ENTITY_INCORPORATED | entity incorporated | 313 | Yes | Entity absorbed into another |
| ENTITY_DISSOLVED | entity dissolved | 4 | Yes | Entity disbanded |
| ENTITY_LAW | entity law | 8 | Yes | Law enacted |
| ENTITY_PERSECUTED | entity persecuted | 375 | Yes | Religious/political persecution |
| ENTITY_OVERTHROWN | entity overthrown | 10 | Yes | Government overthrown |
| ENTITY_ALLIANCE_FORMED | entity alliance formed | 9 | Yes | Alliance between entities |
| ENTITY_EQUIPMENT_PURCHASE | entity equipment purchase | 3 | Yes | Military equipment purchase |
| ENTITY_BREACH_FEATURE_LAYER | entity breach feature layer | 1 | Yes | Underground breach |
| ENTITY_SEARCHED_SITE | — | Not in DB | Yes | Entity searches a site |
| ENTITY_RAMPAGED_IN_SITE | — | Not in DB | Yes | Entity rampages at site |
| ENTITY_FLED_SITE | — | Not in DB | Yes | Entity flees a site |
| ENTITY_EXPELS_HF | — | Not in DB | Yes | Entity expels member |
| REGIONPOP_INCORPORATED_INTO_ENTITY | regionpop incorporated into entity | 42 | Yes | Population joins entity |
| CREATE_ENTITY_POSITION | create entity position | 1,145 | Yes | New position title |
| ADD_ENTITY_SITE_PROFILE_FLAG | — | Not in DB | **No** | Site profile flag set — unhandled |

#### Category 8: War & Combat (8+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| WAR_ATTACKED_SITE | attacked site | 346 | Yes | Siege or attack on site |
| WAR_FIELD_BATTLE | field battle | 102 | Yes | Open-field battle |
| WAR_PLUNDERED_SITE | plundered site | 98 | Yes | Site looted after capture |
| WAR_SITE_NEW_LEADER | new site leader | 74 | Yes | Leadership changed after battle |
| WAR_SITE_TAKEN_OVER | site taken over | 69 | Yes | Site conquered |
| WAR_SITE_TRIBUTE_FORCED | site tribute forced | 1 | Yes | Tribute imposed |
| TACTICAL_SITUATION | — | Not in DB | Yes | Tactical military event |
| SQUAD_VS_SQUAD | — | Not in DB | Yes | Squad combat |
| SITE_SURRENDERED | — | Not in DB | Yes | Site capitulation |
| BODY_ABUSED | body abused | 258 | Yes | Corpse desecration |
| CREATURE_DEVOURED | creature devoured | 5,412 | Yes | Entity eaten |
| ITEM_STOLEN | item stolen | 3,256 | Yes | Theft |
| INSURRECTION_STARTED | — | Not in DB | Yes | Uprising begins |
| INSURRECTION_ENDED | — | Not in DB | **No** | Uprising ends — unhandled |

#### Category 9: Diplomacy (9+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| FIRST_CONTACT | — | Not in DB | Yes | First meeting between civilizations |
| FIRST_CONTACT_FAILED | — | Not in DB | Yes | Failed contact attempt |
| WAR_PEACE_ACCEPTED | peace accepted | 53 | Yes | Peace treaty signed |
| WAR_PEACE_REJECTED | peace rejected | 6 | Yes | Peace offer rejected |
| TOPICAGREEMENT_CONCLUDED | — | Not in DB | Yes | Agreement concluded |
| TOPICAGREEMENT_REJECTED | — | Not in DB | Yes | Agreement rejected |
| TOPICAGREEMENT_MADE | — | Not in DB | Yes | Agreement proposed |
| DIPLOMAT_LOST | — | Not in DB | Yes | Diplomat killed/missing |
| AGREEMENTS_VOIDED | — | Not in DB | **No** | Agreements cancelled — unhandled |
| AGREEMENT_FORMED | agreement formed | 2,379 | Yes | Formal agreement |
| AGREEMENT_CONCLUDED | — | Not in DB | Yes | Agreement completed |
| SITE_DISPUTE | site dispute | 231 | Yes | Territorial dispute |
| TRADE | trade | 737 | Yes | Trade event |
| MERCHANT | — | Not in DB | Yes | Merchant caravan |

#### Category 10: Culture & Art (8+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| POETIC_FORM_CREATED | poetic form created | 49 | Yes | New poetic form invented |
| MUSICAL_FORM_CREATED | musical form created | 73 | Yes | New musical form |
| DANCE_FORM_CREATED | dance form created | 25 | Yes | New dance form |
| WRITTEN_CONTENT_COMPOSED | written content composed | 26,819 | Yes | Written work created |
| KNOWLEDGE_DISCOVERED | knowledge discovered | 2,790 | Yes | Knowledge/technology advance |
| PERFORMANCE | performance | 6,929 | Yes | Public performance |
| COMPETITION | competition | 4,404 | Yes | Competitive event |
| PROCESSION | procession | 2,305 | Yes | Formal procession |
| CEREMONY | ceremony | 3,591 | Yes | Religious ceremony |
| GAMBLE | gamble | 1,682 | Yes | Gambling event |

#### Category 11: Masterpieces (7 types — all NOT in DB, all in LB2)

| df-structures Name | Description |
|---|---|
| MASTERPIECE_CREATED_ARCH_CONSTRUCT | Masterwork construction |
| MASTERPIECE_CREATED_ITEM | Masterwork item |
| MASTERPIECE_CREATED_DYE_ITEM | Masterwork dyed item |
| MASTERPIECE_CREATED_ITEM_IMPROVEMENT | Masterwork improvement |
| MASTERPIECE_CREATED_FOOD | Masterwork meal |
| MASTERPIECE_CREATED_ENGRAVING | Masterwork engraving |
| MASTERPIECE_LOST | Masterwork destroyed/lost |

#### DF 50.x Steam-Era Event Types (8 types — Not in df-structures enum)

These appear in Chronicler's database (world 8, DF 50.13) but are not in the df-structures `history_event_type` enum:

| DB Name | Count (World 8) | Likely Purpose |
|---|---|---|
| hf prayed inside structure | 388 | HF prayer at temple/shrine |
| hf equipment purchase | 523 | HF buys equipment (individual, vs entity-level purchase) |
| hf performed horrible experiments | 43 | Necromancer experiments |
| hf profaned structure | 41 | HF desecrates a building |
| entity relocate | 55 | Entity moves to new site |
| entity primary criminals | 47 | Entity designates criminals |
| holy city declaration | 9 | City declared holy |
| hf viewed artifact | 56 | HF examines an artifact |

#### 11 Types in df-structures with No LegendsBrowser2 Handler

Chronicler relies on LLM fallback for these:

1. AGREEMENTS_VOIDED — Diplomatic agreements cancelled
2. ARTIFACT_DROPPED — Artifact discarded
3. ARTIFACT_HIDDEN — Artifact hidden from view
4. CHANGE_HF_MOOD — HF mood change (strange mood onset)
5. ENTITY_ACTION — Generic entity action
6. HF_ACT_ON_ARTIFACT — HF manipulates an artifact
7. HF_ACT_ON_BUILDING — HF acts on a building
8. HF_RAZED_BUILDING — HF personally destroys a building
9. HIST_FIGURE_SIMPLE_ACTION — Generic HF non-combat action
10. INSURRECTION_ENDED — Uprising resolved
11. ADD_ENTITY_SITE_PROFILE_FLAG — Site profile flag added

### 4.6 Remote File Deployment to HomeServer

Deploy `chronicler-bridge.lua` to `dfhack-config/scripts/` on HomeServer without manual RDP intervention.

**Remote access approach options (ranked by feasibility)**:
1. User manually copies files via RDP (works now, manual)
2. SMB to `C:\Users\Nathaniel` share + `script-paths.txt` entry
3. WinRM / PowerShell Remoting (needs HomeServer config: `evil-winrm` or `pywinrm`)
4. SSH server (OpenSSH Server Windows feature)
5. DFHack RPC `run_command` to bootstrap file writes from existing RPC connection

**CURRENT BLOCKER**: impacket remote exec auth failing — SMB signing required, null sessions disabled, possible account lockout.

### 4.7 RAG / Semantic Search Knowledge Base

Build a comprehensive, searchable knowledge base across all DF reference sources.

**Target collections**:

| Collection | Est. Points | Content |
|-----------|-------------|---------|
| `dfhack` | ~8,700 | DFHack core + scripts + myDFHackScripts Lua |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source |
| `df-ai` | ~1,500-2,000 | Autonomous fort AI plugin (best DFHack plugin API reference) |
| `weblegends` | ~3,000-4,000 | Web legends viewer plugin (event/entity field reference for CDM) |
| `df-structures` | ~2,000-3,000 | DF memory structure XML definitions — CRITICAL, canonical data dictionary |
| `df-narrator` | ~300-500 | Python legends parser + narrator — HIGH, direct prototype reference |
| `dfhack-client-python` | ~100-200 | Python RPC client — HIGH, needed for Phase 0 live data access |
| `df-wiki` | ~5,000-8,000 | Core DF wiki articles (~500-800 pages selectively crawled) |
| `research` | ~1,200 | DF project plan + features notes |

**Wiki ingestion phases**:
- Phase 1: Core gameplay (~300 pages): fortress mode, guides, mechanics, interface, buildings, items, labors, etc.
- Phase 2: World/history/legends (~150 pages): adventure mode, events, lore, biomes, races/civs, Historical_figure, Entity, Site, Artifact, Personality_trait, Emotion, Thought, Need, Skill, Attribute, Military, Noble, etc.
- Phase 3: Modding/data reference (~100 pages): game files, creature raws, building raws, materials

**RAG Indexing Final State Targets**:

| Collection | Starting Points | Est. Final Points |
|-----------|----------------|-------------------|
| `dfhack` | 8,476 | ~8,700 |
| `dwarf-therapist` | 926 | 926 |
| `df-ai` | 0 | ~1,500-2,000 |
| `weblegends` | 0 | ~3,000-4,000 |
| `df-structures` | 0 | ~2,000-3,000 |
| `df-narrator` | 0 | ~300-500 |
| `dfhack-client-python` | 0 | ~100-200 |
| `df-wiki` | 4 | ~5,000-8,000 |
| `research` | ~1,200 | ~1,200+ |

- Total new points from plan: ~12,000-18,000
- Grand total after plan: ~21,000-27,000 points
- MLX bulk embedding estimate: ~30-60 minutes for ~20k chunks
- Qdrant memory impact: ~200MB additional RAM

**Status**: Draft (2026-02-19). At time of plan: dfhack 8,476 pts, dwarf-therapist 926 pts, df-wiki 4 pts. Not-yet-indexed: df-ai, weblegends, myDFHackScripts. Not-yet-cloned: df-structures, df-narrator, dfhack-client-python, LegendsBrowser2, LegendsViewer-Next, df-sites-analyzer.

---

## 5. Infrastructure & Dev Environment

### 5.1 Runtime Environment

**UTM Win11 VM (primary DF runtime)**:
| Component | Detail |
|-----------|--------|
| VM identity | `DF-Windows` / `WIN-MRGFUCCV202` / `192.168.64.3` / Windows 11 Pro ARM 64-bit (10.0.26200) |
| DF Version | 53.10 + DFHack 53.10-r1 |
| Data Transport | `dfhack-run` over SSH (primary); HTTP bridge port 8888; TCP RPC broken for game-thread calls |
| SSH Key | `~/.ssh/df-vm` |
| File Transfer | HTTP file server port 8889 (~105 MB/s) or SCP via `vm-lifecycle.sh scp-pull` (~19 MB/s, requires `-O -T` flags); Guest Agent emergency-only (~0.24 MB/s) |
| World (live) | "The Land of Dawning" — year 250, 257x257 |
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

### 5.2 VM Autonomous Control Infrastructure

- Jarvis must have full autonomous control over a Windows environment for: file transfers, script execution, DFHack console commands, in-game control, and Windows app packaging.
- The UTM VM (`DF-Windows`) is the primary candidate; the HomeServer (`WIN-48L3R2QLQN0`, 192.168.4.194) is a fallback for DF hosting.
- `utmctl` is the primary interface for VM lifecycle management: `list`, `status`, `start`, `stop`, `suspend`, `exec`, `file push/pull`, `ip-address`, `clone`.
- SSH key-based authentication must be established from Mac to the VM.
- `utmctl exec` is fire-and-forget (no stdout relay) — use `exec-capture` (simple commands) or `exec-ps` (complex PowerShell via base64) for output capture.
- PowerShell 7 must be installed on the VM (`winget install Microsoft.PowerShell`).
- QEMU Guest Agent + SPICE Guest Tools required for guest-agent-based file transfer.
- `qemu-img` (v10.2.1 via Homebrew) must be available on Mac for VM snapshot/restore.
- VM disk UUID changes on re-create — auto-detect via glob pattern, never hardcode.
- `utmctl file pull` returns exit 0 on failure — always validate output content, not `$?`.
- PowerShell takes ~10s to start under Prism ARM emulation — always use polling with done-marker pattern rather than fixed sleep.

#### VM Identity & Configuration

- VM name: `DF-Windows`.
- VM IP: `192.168.64.3`.
- VM hostname: `WIN-MRGFUCCV202`.
- VM OS: Windows 11 Pro ARM 64-bit (10.0.26200).
- SSH key: `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control).
- SSH user on VM: `Chronicler`.
- QEMU disk path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`.
- Disk UUID (current, auto-detected): `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- `qemu-img` version: 10.2.1 (installed via Homebrew).
- `utmctl` binary: available and fully mapped.
- DFHack RPC port: 5000.
- HTTP file server port: 8889.
- DF install path on VM (planned): `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`.
- DF version: 53.10, DFHack version: 53.10-r1.

#### HomeServer Identity

- Hostname: `WIN-48L3R2QLQN0`.
- IP: `192.168.4.194`.
- User: `Nathaniel`, Password: `DwarfF0rtress`.
- OS: Windows 10 Pro x86_64.

#### File Transfer Methods (VM)

- HTTP file server on port 8889: ~105 MB/s. Start via `vm-lifecycle.sh http-serve start`.
- SCP via `vm-lifecycle.sh scp-pull`: ~19 MB/s. Requires `-O -T` flags for Windows paths with spaces/parentheses.
- Guest Agent: emergency-only (~0.24 MB/s, 440x slower than HTTP server).

#### Live Data Access

TCP RPC is broken for game-thread calls on DFHack 53.x running under Prism (ARM Windows VM). Only cached calls (GetVersion, GetWorldInfo) work — all other calls hang waiting for CoreSuspender. This is a thread scheduling issue where the TCP server's network thread cannot acquire the Core lock.

Working transports:
1. `dfhack-run` over SSH — executes Lua commands directly on the DFHack Core thread, bypassing TCP. Verified access to all data domains.
2. `chronicler-bridge.lua` — HTTP-served JSON for bulk data (runs within DFHack's process, unaffected by TCP issue).

Verified live data access via `dfhack-run` SSH (world 8 "Thadar En"):
- `df.global.world.history.figures` — 48,366 HFs
- `df.global.world.history.events` — 442,716 events
- `df.global.world.entities.all` — 4,901 entities
- `df.global.world.artifacts.all` — 8,035 artifacts
- `df.global.world.world_data.sites` — 2,154 sites

### 5.3 VM Automation Phases

#### Phase 0 Pre-Work — COMPLETE

- [x] `vm-lifecycle.sh` created and tested (19-command VM control wrapper, 451 lines).
- [x] `vm-bootstrap.sh` created (343 lines).
- [x] `vm-config.sh` created with auto-detecting disk UUID.
- [x] SSH key pair generated: `~/.ssh/df-vm` (ed25519).
- [x] `utmctl` API fully mapped.
- [x] Disk UUID auto-detected: `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- [x] `qemu-img` installed (v10.2.1).
- [x] `exec-capture` and `exec-ps` verified against running VM.
- [x] OS confirmed: Windows 11 Pro ARM 64-bit (10.0.26200).
- [x] `utmctl exec` returns output — hostname `WIN-MRGFUCCV202` verified.
- [x] `utmctl ip-address` returns valid IP `192.168.64.3`.

#### Phase 0 Pending

- [ ] SSH key-based auth working from Mac (pending: run `vm-bootstrap.sh`).

#### Phase 1 (DF + DFHack Risk Validation) — NOT STARTED

- Critical risk: DF is x86-64 only. On Windows 11 ARM in UTM, it runs under Prism x86-64 translation + QEMU ARM virtualization (double emulation). DFHack memory introspection under Prism is untested.
- Phase 1 is the make-or-break gate — must be completed before investing further.
- Steps:
  1. Install Steam via SSH (`winget install Valve.Steam`).
  2. User installs DF from Steam (requires interactive Steam login via UTM display).
  3. User verifies DF launches (window renders, no crash).
  4. Jarvis installs DFHack 53.10-r1 (download + extract to DF dir via SCP).
  5. Jarvis configures `remote-server.json` (`allow_remote: true`, port 5000).
  6. Jarvis launches DF with DFHack and opens firewall rule via `netsh`.
  7. Jarvis tests RPC Core methods: `ListUnits`, `GetWorldInfo`, `ListEnums` from Mac.
  8. Jarvis/user deploys + tests Lua bridge (SCP bridge.lua, start repeat job in DFHack console).
  9. Jarvis deploys + tests HTTP server (SCP PS1, start via SSH, curl from Mac).
  10. Jarvis runs performance benchmark: DF FPS, RPC latency, bridge freshness.
- Validation matrix:
  - DF launches under Prism: PASS → continue; FAIL → VM = packaging-only, DF stays on HomeServer.
  - DFHack loads: PASS → continue; FAIL → try without plugins; if still fails, VM = packaging-only.
  - RPC Core methods respond: PASS → continue; FAIL → debug network config.
  - Bridge repeat job runs: PASS → continue; FAIL → try manual Lua execution.
  - Performance >10 FPS: PASS → VM is primary DF host; FAIL → VM = secondary, HomeServer = primary.
- Report: `projects/chronicler/reports/vm-risk-validation.md` — document Phase 1 results.

#### Phase 2 (Automation Stack) — NOT STARTED

- `vm-ssh.sh`: SSH connection wrapper with retry, timeout, key handling.
- `vm-deploy.sh`: SCP-based deployment of Lua scripts, PS1 scripts, and configs.
- `vm-dfhack-cmd.sh`: Execute DFHack console commands via SSH → `dfhack-run`.
- `vm-service-manager.sh`: Start/stop HTTP server, bridge, PostgreSQL.
- VM lifecycle automation: start → wait for SSH → return IP.
- Snapshot management: stop → `qemu-img snapshot -c <name> <qcow2>` → start.
- Health check script: ping VM, test SSH, test DFHack RPC, check bridge freshness.
- `vm-deploy-all.sh`: One-command full Chronicler deployment.
- `vm-watch.sh`: Start watcher pointed at VM.
- Chronicler `config.py` update: remove hardcoded HomeServer IP (`192.168.4.194`), add `VM_HOST` auto-detection via `utmctl ip-address`.

#### Phase 3 (Chronicler Full Integration Against VM) — NOT STARTED

- Deploy bridge v6+ via `vm-deploy-all.sh`.
- Start bridge repeat job via SSH → `dfhack-run` or `onMapLoad.init`.
- Run `chronicler watch` against target host.
- Verify all data domains: `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- Verify v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.
- Trigger in-game change → verify `unit_events` row is created.
- Start `chronicler serve` → test web UI.
- Run full 131-test suite.
- 30-minute stability test: verify memory, connections, and data integrity.

#### Phase 4 (HomeServer SSH Enhancement) — NOT STARTED (parallel with 2-3)

- HomeServer currently works for DFHack RPC and SMB file transfer but lacks SSH, remote exec, and auto-start services.
- User-performed steps: Install OpenSSH Server via Settings, start and set sshd to Automatic, open firewall on port 22.
- Jarvis-autonomous steps after SSH is available:
  - Deploy SSH public key.
  - Verify key-based auth: `ssh Nathaniel@192.168.4.194 hostname`.
  - Test SCP file deploy.
  - Test remote PowerShell execution.
  - Create Task Scheduler job for auto-start HTTP server on login.
  - Test `dfhack-run` via SSH tunnel: `ssh -L 5001:localhost:5000 Nathaniel@192.168.4.194 -N`.

#### Phase 5 (Platform Decision + Windows App Foundation) — NOT STARTED

- Platform decision rule: If VM runs DF at >10 FPS with stable RPC → VM is primary. Otherwise → hybrid (HomeServer for DF, VM for packaging).
- Platform comparison:
  - VM (DF works): Full automation (utmctl + SSH), snapshots, offline dev, ARM Windows target, low complexity.
  - VM (packaging only) + HomeServer (DF): Split automation, partial offline dev, x86 Windows via HomeServer, medium complexity.
  - HomeServer only: SSH-only automation, no snapshots, no offline dev, x86 Windows (majority target), low complexity.
- Deliverable Windows app components:
  - Python runtime: PyInstaller → `chronicler.exe` (build on VM or HomeServer).
  - Database: Embedded PostgreSQL or SQLite (SQLite preferred for single-user simplicity).
  - LLM runtime: Bundled Ollama + Qwen3-1.7B, or llama.cpp for lighter footprint.
  - Web UI: FastAPI + Jinja2 on localhost (already built).
  - DFHack connector: TCP RPC client (already built in `client.py`).
  - Bridge auto-setup: Installer copies Lua script, auto-configures `onMapLoad.init`.
  - System tray: `pystray` for background service with Start/Stop controls.
  - Installer: NSIS or Inno Setup wrapping all components.
- Steps:
  1. Document Phase 1-4 results in `platform-decision.md`.
  2. Choose packaging tool (PyInstaller recommended for maturity).
  3. Create `packaging/` directory with build configs.
  4. Test basic `chronicler.exe` build in VM.
  5. Create installer script.
  6. Test full install → run → verify cycle in clean VM snapshot.
- Report: `projects/chronicler/reports/platform-decision.md`.

### 5.4 VM Scripts

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

#### Existing Scripts (Phase 0 Complete)

- `vm-config.sh`: Shared config — auto-detects disk UUID via glob `*.qcow2`, defines DRY constants for VM name, IP, SSH key, user, etc.
- `vm-lifecycle.sh`: 19-command VM control wrapper (451 lines) — covers all `utmctl` operations plus `exec-capture` and `exec-ps` helpers.
- `vm-bootstrap.sh`: Autonomous Phase 0 bootstrap script — OpenSSH install, SSH key deployment, SSH config, PowerShell 7 install (343 lines).

#### Scripts to Be Created

- `vm-install-df.sh` — DF/DFHack install + configuration (Phase 1).
- `vm-test-rpc.py` — RPC validation test script (Phase 1).
- `vm-ssh.sh` — SSH connection wrapper with retry/timeout/key handling (Phase 2).
- `vm-deploy.sh` — SCP-based deployment script for Lua/PS1/configs (Phase 2).
- `vm-dfhack-cmd.sh` — Execute DFHack commands via SSH → `dfhack-run` (Phase 2).
- `vm-service-manager.sh` — Start/stop HTTP server, bridge, PostgreSQL (Phase 2).
- `vm-deploy-all.sh` — One-command full deployment (Phase 2).
- `vm-watch.sh` — Start watcher pointed at VM (Phase 2).

---

## 6. API Routes & Code Implementation

### 6.1 API Routes

#### People (`chronicler/api/routes/people.py`)

- `GET /api/people/search?q=...&type=all|hf|unit` — Unified search across HFs + units by name (Dwarvish and English); returns type, race, alive/dead status.
- `GET /api/people/hf/{world_id}/{hf_id}` — HF detail: name, race, birth/death, relationships (from `hf_links`), entity memberships (from `hf_entity_links`), site links (from `hf_site_links`), position history (from `hf_position_links`), key events, identities, `current_game_year`.
- `GET /api/people/unit/{unit_id}` — Unit detail: both names, race, profession, skills, labors, position, linked HF (if linkable), civ membership, `current_game_year`, expanded fields from Phase 3.
- `GET /api/people/hf/{world_id}/{hf_id}/events?limit=50` — Events involving this HF.
- `GET /api/people/hf/{world_id}/{hf_id}/relationships` — Graph-ready relationship data.
- `GET /api/people/denizens?world_id=...&status=...&sort=nvs` — fortress denizens list
- `GET /api/people/unified/{identifier}` — unified person JSON
- Relationship name resolution via batch lookup:
  ```python
  rel_ids = [v for v in relationships.values() if v]
  hf_names = await conn.fetch(
      "SELECT id, name FROM historical_figures WHERE world_id = $1 AND id = ANY($2::int[])",
      world_id, rel_ids)
  name_map = {r["id"]: r["name"] for r in hf_names}
  ```
  Return `resolved_relationships`: `[{type: "Spouse", hf_id: 12345, name: "Urist McHammer"}]`.
- `current_game_year` fetch pattern:
  ```python
  current_year = await conn.fetchval(
      "SELECT game_year FROM sync_snapshots WHERE world_id = $1 "
      "ORDER BY synced_at DESC LIMIT 1", world_id)
  ```
- `unaccent` search pattern: `unaccent(name) ILIKE unaccent($1)` on `name` and `english_name` fields.

#### Civilizations (`chronicler/api/routes/civilizations.py`)

- `GET /api/civilizations?type=...` — List entities with type filter, member counts, site counts.
- `GET /api/civilizations/{world_id}/{entity_id}` — Entity detail.
- `GET /api/civilizations/{world_id}/{entity_id}/positions` — Position hierarchy with current/former holders.
- `GET /api/civilizations/{world_id}/{entity_id}/members?limit=1000` — Paginated member list from `hf_entity_links`.
- Position query:
  ```sql
  SELECT ep.position_id, ep.name, ep.name_male, ep.name_female,
         hpl.hf_id AS holder_hf_id, hf.name AS holder_name,
         hf.sex AS holder_sex, hf.caste AS holder_caste,
         s.id AS site_id, s.name AS site_name
  FROM entity_positions ep
  LEFT JOIN hf_position_links hpl ON ...
  LEFT JOIN historical_figures hf ON ...
  LEFT JOIN sites s ON s.world_id = ep.world_id AND s.owner_entity_id = ep.entity_id
  WHERE ep.world_id = $1 AND ep.entity_id = $2
  ORDER BY ep.name
  ```
- `_categorize_position(name)` helper classifies positions into Noble / Military / Administrator / Other.

#### Geography (`chronicler/api/routes/geography.py`)

- `GET /api/geography/sites?type=...&owner=...` — Sites with owner entity, type filter.
- `GET /api/geography/sites/{world_id}/{site_id}` — Site detail.
- `GET /api/geography/regions` — Regions list with type.

#### Events (`chronicler/api/routes/events.py`)

- `GET /api/events?year_from=...&year_to=...&type=...&hf=...&site=...&limit=100` — Filtered event list.
- `GET /api/events/collections?type=WAR|BATTLE|...` — Event collections.
- `GET /api/events/collections/{world_id}/{id}` — Collection detail with sub-events.

#### Explorer / Database Tab (`chronicler/api/routes/explorer.py`)

- `GET /api/explorer/tables` — All tables with row counts.
- `GET /api/explorer/tables/{name}` — Columns, types, PKs, FKs, indexes.
- `GET /api/explorer/tables/{name}/data?page=1&limit=25&sort=&order=asc&filter=` — Paginated rows with column metadata.
- `POST /api/explorer/query` — Read-only SQL results (SELECT/WITH only, `conn.transaction(readonly=True)`, max 500 rows).
- `graph_search()`: add `unaccent` wrapping on HF, entity, site, unit name searches.
- Add Knowledge Horizon endpoint (stub).
- Do NOT refactor existing `explorer.py` — add new domain route files alongside it.
- Row serialization: `_serialize_row()` helper converts asyncpg types (datetime, Decimal, bytes) to JSON-safe values.

#### Graph Endpoints (in `explorer.py`)

- `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=1` — Ego network: HF center + HF/entity/site links.
- `GET /api/explorer/graph/entity/{world_id}/{entity_id}?depth=1` — Entity center + member HFs.
- `GET /api/explorer/graph/site/{world_id}/{site_id}?depth=1` — Site center + linked HFs.
- `GET /api/explorer/graph/search?q=&world_id=` — Typeahead search across HFs, entities, sites.

### 6.2 Code Implementations

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

### 6.3 Chronicler Product Code Files

Location: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

#### Explorer UI — Files Modified or Created

| Action | File |
|--------|------|
| Create | `chronicler/api/templates/partials/_nav.html` |
| Create | `chronicler/api/routes/explorer.py` |
| Create | `chronicler/api/routes/people.py` |
| Create | `chronicler/api/routes/civilizations.py` |
| Create | `chronicler/api/routes/geography.py` |
| Create | `chronicler/api/routes/events.py` |
| Create | `chronicler/api/templates/explorer.html` |
| Modify | `chronicler/api/app.py` (import + register all new routers; add `/explorer` page route; add `active` context variable to `/` and `/monitoring` routes) |
| Modify | `chronicler/api/templates/index.html` (flex layout, nav partial) |
| Modify | `chronicler/api/templates/monitoring.html` (replace header with nav partial) |
| Modify | `chronicler/config.py` (remove hardcoded `192.168.4.194`, add `VM_HOST` auto-detection via `utmctl ip-address`) |
| Modify | `chronicler/db/schema.sql` (unaccent extension, unit columns, knowledge_horizon table) |
| Modify | `chronicler/dfhack/scripts/chronicler-bridge.lua` (expanded unit field extraction) |
| Modify | `chronicler/dfhack/watcher.py` (handle new bridge fields) |
| Modify | `chronicler/sync/sync.py` (handle new bridge fields) |
| Create | `projects/chronicler/designs/unit-hf-field-mapping.md` (design doc for LLM integration mapping) |

#### Windows App Packaging — Files to Be Created

- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/pyinstaller.spec`
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/build-windows.sh`

### 6.4 app.py Modifications

- Import and include `explorer_router` (and all new domain routers) with `/api` prefix.
- Add `GET /explorer` page route rendering `explorer.html`.
- Add `active` context variable to existing `/` and `/monitoring` routes.

### 6.5 File Modification Estimates by Phase

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

### 6.6 Key File Paths

| Path | Description |
|------|-------------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/` | Product code root |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler` | CLI |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` | Database schema |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | Bridge script |
| `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/` | Dev artifacts root |
| `/Users/nathanielcannon/Claude/GitRepos/` | Reference repos |

---

## 7. Phase-by-Phase Development Plan

### 7.1 Version Milestones

| Version | Phases | State |
|---------|--------|-------|
| v0.8 | Baseline + Gap Closure | CURRENT |
| v0.9 | Phases 1-2 complete | Database tracks every fortress being; embark dwarves have HF records; deaths generate events |
| v1.0 | Phases 1-4 complete | Agentic storyteller; fortress-centric explorer; browsable event timeline; initial Knowledge Horizon |
| v1.5+ | Phase 5 items | Proactive narrative; full KH with 7 caveats; interactive maps; family trees; skills time-series |

### 7.2 Phase 1: Denizen Registry + Death Detection

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

**Status values**: `resident`, `departed`, `deceased`, `missing`, `visitor`, `attacker`, `skulker`, `historical`

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
| First watcher cycle | Unit count <= starting count, no prior watcher data | `resident` | `TRUE` |
| Watcher detects unit departure | Unit no longer in `unit_summary`, no death flag | `missing` → investigate | — |
| Bridge `announcements` | "A human caravan has arrived", "An ambush!" | `visitor` / `attacker` | — |
| Bridge `armies` | Army controller matches hostile entity | `attacker` | — |
| Legends XML import | HF with `hf_site_links` to fortress site | `historical` | — |
| Relationship chain | Spouse/parent/child of a `resident` | `historical` | — |

**Embark detection logic**: On the first watcher cycle (no prior `fortress_denizens` entries for the world_id), all detected units are marked `embark = TRUE`. Subsequent arrivals are NOT embark dwarves. The `embark` flag is permanent once set.

**Field-by-field description**:
- `id`: SERIAL PRIMARY KEY
- `world_id`: INT NOT NULL REFERENCES worlds(id)
- `unit_id`: INT (nullable)
- `hf_id`: INT (nullable)
- `name`: TEXT NOT NULL
- `english_name`: TEXT
- `race`: TEXT
- `status`: TEXT NOT NULL DEFAULT 'unknown'
- `embark`: BOOLEAN DEFAULT FALSE
- `arrival_year`: INT
- `arrival_tick`: INT
- `departure_year`: INT
- `departure_tick`: INT
- `departure_cause`: TEXT — 'death', 'departure', 'unknown'
- `narrative_value`: FLOAT DEFAULT 0.0 — 0.0 to 100.0
- `last_seen_tick`: INT
- `details`: JSONB DEFAULT '{}'
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()
- UNIQUE (world_id, unit_id)
- UNIQUE (world_id, hf_id)

Both UNIQUE constraints are separate so that a denizen can have one without the other.

#### Narrative Value Score (NVS)

Composite score 0-100 reflecting a denizen's storytelling importance. Recomputed per watcher cycle.

Formula:
```
NVS = (screen_time x 0.30) + (event_density x 0.25) +
      (relationship_depth x 0.20) + (recency x 0.15) +
      (status_weight x 0.10)
```

Each component normalized 0.0-1.0; final score scaled to 0.0-100.0.

| Component | Weight | Calculation |
|-----------|--------|-------------|
| screen_time | 30% | Watcher cycles where this denizen was observed / total cycles |
| event_density | 25% | Count of `history_events` involving this entity / max events any denizen |
| relationship_depth | 20% | Number of `hf_links` + unit relationships to other denizens / max relationships |
| recency | 15% | 1.0 - (ticks_since_seen / max_ticks_since_seen) |
| status_weight | 10% | `resident`=1.0, `deceased`=0.8, `visitor`=0.5, `historical`=0.3 |

Additional NVS rules:
- Deceased denizens retain historical scores (recency frozen at departure tick).
- Denizens with no HF link: event_density=0, relationship_depth=0, still score on screen_time, recency, status_weight.
- Edge case: first cycle — total_cycles=1, all denizens have screen_time=1.0.
- Edge case: NVS denominator guard — floor of 1 to avoid division by zero.
- `compute_all_nvs` runs per watcher cycle.

**df-narrator global scoring formula** (for comparison):
```
score = min(events x 2, 500) + kills x 15 + type_bonus + links x 3 + positions x 20 + artifacts x 30
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

#### Phase 1 HF Linking

HF linking occurs at three points:
1. During denizen registration (when unit data includes `hist_fig_id`)
2. After legends XML import (when HF records become available for previously unit-only denizens)
3. After post-embark legends re-export (Phase 2)

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

### 7.3 Phase 2: Embark HF Handling + Unit Data Expansion + Live Event Generator

**Estimated effort**: 6-8 hours
**Depends on**: Phase 1 (denizen registry must exist for embark detection)

#### Embark-Aware HF Handling

**Problem**: The 7-20 starting dwarves have `hist_fig_id` values beyond the pre-embark legends XML export range.

**Primary solution**: Post-embark legends re-export from the live fortress using DFHack's `exportlegends` command.

**Fallback solution**: Generate synthetic HF records from Unit data when embark dwarves' `hist_fig_id` values aren't found in HF records.

**Key design decisions**:
1. Post-embark re-export is PRIMARY
2. Synthetic HFs are FALLBACK ONLY
3. `embark` flag — new `BOOLEAN` column on `historical_figures` table
4. Relationships from Unit records — from `details.relationships[]` field (9 slots), NOT heuristic guessing
5. Idempotent on re-import — `ON CONFLICT DO UPDATE` replaces synthetic data with authoritative legends data while preserving `embark` flag

#### Unit-HF Merge for Storyteller

**Solution**: Unified Person Builder — new module `chronicler/storyteller/person.py`
**Implementation**: `build_unified_person(conn, world_id, identifier)` → unified JSON

#### Bridge Expansion (Unit Data Fields)

| Field | Effort | Priority |
|-------|--------|----------|
| `birth_year`, `sex`, `death_cause` | ~15 lines Lua | HIGH |
| Relationships (9 slots) | ~15 lines Lua | HIGH |
| Personality traits (50 facets) | ~60 lines Lua | MEDIUM |
| Physical/mental attributes | ~30 lines Lua | LOW |
| `cultural_identity` | ~2 lines Lua | LOW |

#### Live Event Generation (New Capability)

Generates EVENT records from live in-game data, written to `history_events` table.

**Event types to generate**:

| Event Type | Detection Method | Maps to HF Event Type |
|-----------|------------------|----------------------|
| Death | `is_alive` transition FALSE | `HF_DIED` |
| Kill | `kill_count` increases between cycles | `HF_SIMPLE_BATTLE_EVENT` |
| Marriage | New spouse relationship appears | `ADD_HF_HF_LINK` (spouse) |
| Childbirth | New unit with parent relationships | `HF_BORN` (custom) |
| Profession change | `profession` field changes | `CHANGE_CREATURE_TYPE` (approximate) |
| Position assignment | Position data changes | `ASSUME_IDENTITY` or custom |
| Mood | Strange mood detected | `STRANGE_MOOD` (custom) |
| Artifact creation | New artifact appears | `ARTIFACT_CREATED` |
| Arrival (migrant) | New unit detected, not first cycle | `MIGRANT_ARRIVED` (custom) |
| Departure | Unit disappears without death flag | `HF_LEFT_SITE` (custom) |
| Skill milestone | Skill crosses Proficient→Expert→Master→Legendary | `SKILL_MILESTONE` (custom) |
| Stress event | Stress crosses critical thresholds | `STRESS_CRISIS` (custom) |

**Phase 2 implements first 3 event types**: death, profession change, skill milestone.

**Event ID anti-collision**: Live-generated event IDs start at max(legends_event_id) + 10,000.

#### New Bridge Sections

- **Denizen Tracking**: `id`, `hist_fig_id`, `is_alive`, `pos`, `kill_count` for all units (cap 500).
- **Relationship Extraction**: 9 relationship slots from `u.status.current_soul.relationships`.

### 7.4 Phase 3: Agentic Storyteller + Explorer Integration

**Estimated effort**: 8-10 hours
**Depends on**: Phase 2

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

#### Target Agentic Storyteller Architecture (v1.0)

```
User question
  ↓
LLM receives system prompt with:
  - Database schema summary (~2K tokens)
  - SQL tool definition (read-only)
  - Denizen registry summary (top denizens by NVS)
  - Instructions for autonomous data exploration
  ↓
LLM decides what to query → emits SQL tool call
  ↓
Tool executor: validates query, executes, returns results (max 50 rows)
  ↓
LLM analyzes results → may issue another query (up to 5 rounds)
  ↓
LLM composes final response with evidence citations
```

#### SQL Tool (`query_database`)

- **Input schema**: `{sql: string, reasoning: string}`
- **Safety layers**: keyword blocklist + `asyncpg readonly=True` + row limit + 5s timeout
- **Row limit**: 50 rows max
- **Tables described to LLM**: historical_figures, history_events, entities, sites, units, fortress_denizens, hf_links, hf_entity_links

#### Agentic System Prompt

Key elements:
- Persona: "Chronicler, a scholar-narrator of Dwarf Fortress"
- Instructs: start with broad queries, then narrow down
- ILIKE for name searches
- Always include `world_id` in WHERE clauses
- Check both `historical_figures` AND `units` tables
- `live_generated = TRUE` events are highly reliable
- Response style: in-world chronicler; cite specific events/dates/relationships

#### LLM Model Options

| Model | Tool Use | Latency | Quality | Notes |
|-------|----------|---------|---------|-------|
| Claude Sonnet/Haiku via API | Native | ~2-3s TTFT | Excellent | Best tool use, API cost |
| Qwen3 32B via Ollama | Supported | ~5-8s TTFT | Good | Local, free, needs testing |
| Qwen3 8B via Ollama | Partial | ~0.4s TTFT | Moderate | Current model |
| Llama 3.1 70B via Ollama | Supported | ~10s TTFT | Good | Local, proven tool use |

### 7.5 Phase 4: Events Tab + Knowledge Horizon Stub

**Estimated effort**: 4-6 hours
**Depends on**: Phase 3

#### Events API + UI

- Chronological event table with clickable participants and locations
- Year range slider, event type filter, source filter
- War/battle collection trees (expandable)
- Knowledge Horizon table populated from denizen registry

#### Knowledge Horizon Population

Initial visibility from denizen registry:
- All denizens → `visible`
- 1-hop relationships of denizens → `inferred`
- Everything else → `unknown`

#### Horizon Integration with Agentic LLM

System prompt addition:
> "Scope your queries through the fortress_denizens table. Do not speculate about entities outside the fortress's knowledge."

### 7.6 Phase 5: Polish + Long-Term (Post-v1.0)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1 | Accent-insensitive search (`unaccent` extension) | rippling Phase 1 | 1 hr |
| 2 | Age calculation display | rippling Phase 2 | 1 hr |
| 3 | Position table enhancement (gender-appropriate titles) | rippling Phase 5 | 1 hr |
| 4 | Sidebar sort/filter | rippling Phase 6 | 2 hrs |
| 5 | Load members enhancement | rippling Phase 7 | 1 hr |
| 6 | Additional live event types (marriage, birth, artifact creation, mood, arrival/departure) | PRD v2.2 | 4 hrs |
| 7 | Narrative engine (proactive story generation) | session-state | 6-8 hrs |
| 8 | Skills time-series tracking | session-state | 3-4 hrs |
| 9 | Full Knowledge Horizon with all 7 caveats (CAV-001 through CAV-007) | knowledge-horizon.md | 6-8 hrs |
| 10 | Interactive maps (Leaflet.js) | benchmark LegendsViewer-Next | 6-8 hrs |
| 11 | Family tree visualization | benchmark LegendsViewer-Next | 4-6 hrs |
| 12 | Global figure scoring (df-narrator formula) alongside NVS | PRD v2.2 | 2 hrs |

Items 1-5 (UI polish): can start any time, independent of Phases 1-4.
Items 6-12 (post-v1.0): depend on Phases 1-4 foundation.

### 7.7 Explorer UI Phases Status

- **Phase 1** (Accent-Insensitive Search): COMPLETE.
- **Phase 2** (Age Calculation): COMPLETE.
- **Phase 3** (Unit Data Extraction Expansion): COMPLETE.
- **Phase 4** (Unit/HF Field Mapping + Detail View): COMPLETE.
- **Phase 5** (Position Table Enhancement): COMPLETE.
- **Phase 6** (Left Panel Sort/Filter): COMPLETE.
- **Phase 7** (Load Members Enhancement): COMPLETE.
- **Phase 8** (Knowledge Horizon Filter): DEFERRED — NOT STARTED.

### 7.8 Database Explorer Status (subsumed into Explorer)

- Phase 1 (Navigation + Schema Browser): COMPLETE (subsumed as Database tab).
- Phase 2 (Data Browser): COMPLETE (subsumed as Database tab).
- Phase 3 (Entity Graph): COMPLETE (subsumed as Graph tab).

### 7.9 Roadmap Phase Status Summary

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| Phase 1 | Denizen Registry + Death Detection | 6-8 hrs | PLANNED — all prerequisites met |
| Phase 2 | Embark HF + Unit Expansion + Live Events | 6-8 hrs | PLANNED — depends on Phase 1 |
| Phase 3 | Agentic Storyteller + Explorer Integration | 8-10 hrs | PLANNED — depends on Phase 2 |
| Phase 4 | Events Tab + Knowledge Horizon Stub | 4-6 hrs | PLANNED — depends on Phase 3 |
| Phase 5 (UI polish items 1-5) | Accent search, age calc, position titles, sidebar, load members | 6-8 hrs total | Can start any time |
| Phase 5 (post-v1.0 items 6-12) | Narrative engine, skills tracking, full KH, maps, family trees, global scoring | Ongoing | Depends on Phases 1-4 |
| Monitoring System | Observability dashboard + LLM logging | ~230 LOC | NOT STARTED — no dependencies |
| RAG Indexing | Qdrant knowledge base for DF reference | Ongoing | PARTIAL |
| Probe Expansion | 10 new Lua probes + bridge enhancements | ~130 LOC | NOT STARTED |

### 7.10 Phase Verification Checklists

#### Phase 1 Verification
- [ ] `fortress_denizens` table exists with all columns and indexes
- [ ] Run watcher 3+ cycles → table populated
- [ ] First-cycle units all have `embark = TRUE`
- [ ] Second-cycle new arrivals have `embark = FALSE`
- [ ] Kill a dwarf → status changes to `deceased` within 2 cycles
- [ ] Disappearing dwarf without death flag → status `missing`
- [ ] NVS scores non-zero and varied
- [ ] Denizens with matching HFs have `hf_id` populated
- [ ] `chronicler denizens` CLI shows formatted output
- [ ] All 12 tests pass, no regressions

#### Phase 2 Verification
- [ ] Post-embark export: embark dwarves in HF with `embark = TRUE`, no synthetic flag
- [ ] Pre-embark export only: synthetic HF records with Unit-sourced relationships
- [ ] Kill → death event with `live_generated = TRUE`
- [ ] Profession change → profession event generated
- [ ] Legendary skill → milestone event generated
- [ ] `units` table has `birth_year`, `sex` from bridge
- [ ] `details` JSONB includes personality, relationships, attributes
- [ ] Re-import legends → synthetic data replaced, `embark` flag preserved

#### Phase 3 Verification
- [ ] "Tell me about [fortress dwarf]" → LLM executes 2-3 queries, returns merged view
- [ ] "Who died recently?" → accurate report from denizen registry + death events
- [ ] "Who killed the dwarf who was married to the mayor?" → multi-hop reasoning works
- [ ] Config toggle between agentic and keyword mode works
- [ ] Explorer People tab defaults to fortress denizens with NVS sort

#### Phase 4 Verification
- [ ] Events tab: filter by year range, type, participant
- [ ] Source filter works (Live Only / Legends Only)
- [ ] War/battle collections expandable
- [ ] Knowledge Horizon table populated from denizen registry
- [ ] Agentic LLM respects horizon constraints

#### Daemon Verification Steps
1. Verify RPC: `chronicler sync-live`
2. Deploy bridge to target host
3. Start bridge repeat job
4. Start HTTP server
5. Verify: `curl http://<host>:8888/chronicler-state.json`
6. Start watcher: `chronicler watch --interval 10 --probe-interval 60`
7. First cycle: "Synced N units, 0 events"
8. Verify probes: `SELECT * FROM lua_probes ORDER BY probed_at DESC LIMIT 10;`
9. Cause in-game change → verify detection
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`

### 7.11 Plans With Remaining Work

| Plan File | Done | Remaining | Maps to Roadmap Phase |
|-----------|------|-----------|----------------------|
| `rippling-honking-crescent.md` | Phases 1-7 | Phase 3 (unit data expansion), Phase 8 (KH stub) | Phase 2 (bridge expansion), Phase 4 (KH) |
| `shiny-churning-sprout.md` | People, Civs, Geo tabs | Events & Timeline tab | Phase 4 (events tab) |

### 7.12 Cross-Phase Dependency Graph

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

---

## 8. Design Decisions

### Decision 1: Post-Embark Legends Re-Export as Primary
Post-embark re-export is PRIMARY; synthetic HF is FALLBACK ONLY. Post-embark export produces authoritative HF records for all embark dwarves.

### Decision 2: Relationships from Unit Records, NOT Heuristic Guessing
Relationship data for synthetic HFs comes exclusively from the Unit record's `details.relationships[]` field (9 slots). Heuristic guessing was explicitly rejected.

### Decision 3: `dfhack-run` over SSH as Primary Transport
TCP RPC is broken for game-thread calls on DFHack 53.x under Prism. `dfhack-run` over SSH executes Lua directly on the DFHack Core thread.

### Decision 4: Agentic Storyteller Replaces Keyword Routing
23-route keyword→SQL routing replaced with agentic LLM (up to 5 SQL rounds). Keyword-routing retained as fallback via `storyteller_mode: "keyword"` config.

### Decision 5: Live Events in Same `history_events` Table
Using same table with `live_generated BOOLEAN` and `source TEXT` columns. Unified events table for the agentic storyteller.

### Decision 6: Knowledge Horizon as Advisory (System Prompt), Not Enforcement (SQL Views)
Phase 1-3 KH as query constraints in system prompt; view-based enforcement deferred.

### Decision 7: NVS Computed Per Watcher Cycle, Stored in Denizen Record
Enables O(1) NVS sort on explorer.

### Decision 8: Event ID Gap of 10,000+
`_next_event_id` starts at max(legends_event_id) + 10,000.

### Decision 9: SSE Streaming for Agentic Responses
Tool calls hidden from UI; only final narrative streamed via SSE.

### Decision 10: `embark` Flag on Both HF and Denizen Tables
HF flag for storyteller context; denizen flag for UI badges.

### Decision 11: Composite PKs over Single-Column PKs
All 13 legends tables: `PRIMARY KEY (world_id, id)`. Resolves cross-world ID collisions.

### Decision 12: `fortress_denizens` Has Two Nullable FK Columns
Both `unit_id` and `hf_id` nullable with separate UNIQUE constraints.

### Decision 13: Embark Detection via Absence of Records
First watcher cycle detected by zero entries for `world_id`.

### Decision 14: `missing` Status Distinct from `deceased`
Vanished unit gets `missing`, upgradeable to `deceased` upon confirmation.

### Decision 15: Storyteller Enrichment over Raw Data
JOIN-resolved names and natural-language templates.

### Decision 16: Confidence Signaling in Storyteller
Context density note prepended to results. < 3 records: caution. > 10 records: rich context.

### Decision 17: `lua_probes` Retention Cleanup Every 10 Cycles
Balance between storage management and watcher cycle performance.

### Decision 18: Bridge Health Monitoring with Graceful Degradation
After 3 consecutive failures, warn but continue with core-only data.

### Decision 19: Written Contents Dual-Source Parsing
legends.xml provides core fields; legends_plus.xml provides enriched fields.

### Decision 20: kill_count Computation Fix
Changed from LEFT JOIN to independent UPDATE; changed grouping from hf_id_1 to hf_id_2.

### Decision 21: Lua Bridge as Primary Data Path
Bridge handles bulk periodic dumps; probes handle targeted queries. No RFR dependency.

### Decision 22: Inline Instrumentation for Monitoring
Middleware cannot capture per-phase latencies. Instrumentation in `/api/ask` handler.

### Decision 23: Entity Position Dual-Source Merge Strategy
Both sources merged into `hf_position_links` using `DO NOTHING` on conflict.

### Decision 24: Selective Wiki Crawl for RAG
~500-800 high-value pages from 43,621 total wiki pages.

### Explorer UI Architecture Decisions
- Units and HFs are ontologically the same type of being.
- Rich personality/attribute data stays in `details` JSONB.
- Do not refactor `explorer.py` — add new domain routes alongside.
- Preserve SQL runner for power users.
- Single-world simplification in frontend.
- Personality data in separate bridge section (`dwarf_personality`).
- Reuse vis.js graph; add "View graph" buttons throughout.
- Age computed at display time.
- Member limit raised to 1,000 with client-side sort/filter.
- Gender-appropriate titles from entity_positions data.
- Knowledge Horizon as a stub.
- HF-Unit gap is a known data limitation — graceful fallback.
- Three-tab structure embedded as Database + Graph within 6-tab structure.
- Shared nav partial `_nav.html`.
- vis.js from CDN — no build step.
- SQL Runner two-layer safety.
- Graph BFS depth clamped at 3; batched fetches; performance limits at 500/1000 nodes.
- Node ID prefixing avoids cross-type collisions.

### Knowledge Horizon Design Choices
- View-based masking preferred over shadow/materialized tables.
- Civilization-broad membership does NOT propagate visibility.
- Family depth cap at 3.
- Synthetic HF records flagged `source = 'inferred'`.
- In-world framing of ignorance.
- Dedicated `knowledge_horizon` table updated by watcher loop.

### Unit-HF Merge Design Choices
- Unit authoritative for real-time; HF authoritative for historical facts.
- Personality is Unit-only.
- Dual-source event history in same `history_events` table.
- Embark dwarf flag for explicit handling.
- `fortress_denizens` as routing layer for narrative relevance.

### Event Type Storage Strategy
Store type as TEXT, raw data in JSONB `details`. No DB enum constraint.

### Narrative Engine: LLM Over Templates
LLM reads raw `details` JSONB for all 141 event types. Per-type templates as LLM prompts, not standalone renderers.

### Event Type Count Correction
Canonical count is **141** (133 df-structures + 8 DF 50.x). NOT 144 as previously reported.

### Visualization Stack
Leaflet.js (world map), Cytoscape.js dagre (family tree), Cytoscape.js cola (warfare graph), Chart.js (timelines/distribution), D3.js (chord diagrams).

### VM Platform Strategy
- Prefer UTM VM over HomeServer for full local control.
- HomeServer remains fallback.
- Phase 1 risk validation gates all further VM investment.
- Decision rule: >10 FPS with stable RPC = VM primary.
- Fresh Windows install over password recovery.
- `exec-capture` / `exec-ps` pattern because `utmctl exec` cannot relay stdout.
- Done-marker polling over fixed sleep (variable PowerShell startup).
- Disk UUID auto-detection via glob.

### Windows App Architecture Decisions
- PyInstaller for packaging.
- SQLite preferred over embedded PostgreSQL for single-user.
- Bundled Ollama + Qwen3-1.7B for LLM runtime.
- `pystray` for system tray.
- NSIS or Inno Setup for installer.

---

## 9. Open Items & Risk Register

### 9.1 Implementation Questions (Phase 1)

1. **Watcher previous_units accessibility**: Must verify state is accessible in watcher.
2. **Race condition on simultaneous watcher instances**: Add advisory lock or check.
3. **Escalation threshold for `missing` → `presumed_deceased`**: N not yet defined.
4. **Bridge `hist_fig_id` availability**: Gap should be measured.
5. **`kill_count` field**: `u.status.current_soul.performance_group_ref` needs verification.

### 9.2 Architecture Questions (Phases 2-4)

6. **Agentic storyteller model selection**: Qwen3 32B vs Claude Haiku needs testing.
7. **NVS weight tuning**: May over-weight screen_time. Iterative tuning needed.
8. **Knowledge Horizon caveats**: Full definitions in `knowledge-horizon.md`.
9. **Victim info for kill recording**: Victim resolution logic not specified.
10. **`sync_snapshots` table**: Full schema and population mechanism need verification.

### 9.3 Data Questions

11. **World mismatch**: DB "Namoram" vs live VM "The Land of Dawning".
12. **Denizens with no `hist_fig_id`**: Proportion in practice unknown.
13. **Re-ingestion of world 5**: Whether completed as part of Session 32 is unclear.
14. **Legends_plus assignments silent drop**: Reconciliation query may be needed.

### 9.4 Explorer UI Open Items

- **Preferences field extraction**: Planned but not yet in bridge.
- **Need state extraction**: Planned but not yet in bridge.
- **LLM storyteller integration**: Unified person JSON designed but not integrated.
- **Full Knowledge Horizon computation**: Entirely unspecified beyond stub.
- **"View graph" buttons**: Specific implementation per tab not detailed.
- **Events tab year range slider**: Widget selection not specified.
- **Geography tab right panel**: "Notable inhabitants" definition unclear.
- **Database tab grouping**: Table-to-category mapping not specified.
- **Cross-linking from Events tab**: Navigation implementation not specified.
- **Civilizations tab related events**: Fetch/display not detailed.

### 9.5 Knowledge Horizon Open Items

- 4 prerequisite exploration queries not yet run.
- Performance at 60K+ HFs unverified.
- NVS formula referenced but not yet defined (now defined in this doc).
- Watcher loop timing/frequency for KH updates not specified.

### 9.6 Event Type Open Items

- 44 of 141 types have zero occurrences in world 8 — parsing gap or genuine rarity needs verification.
- 8 DF 50.x types have undocumented field schemas.
- Template/prompt coverage for 19 non-LB2 types needs drafting.

### 9.7 CDM Gap Open Items

- Legends-XML personality vs DFHack unit personality relationship undocumented.
- `WorldConstructions`, `ArtForms x 3`, `Identities`, `Rivers` need full schema design.
- `Entity Populations` extension needs full field audit.

### 9.8 Deployment Questions

15. **HomeServer remote deployment blocked**: Manual RDP workaround available.
16. **HTTP server lifecycle**: No automated lifecycle management described.
17. **Bridge script path on HomeServer**: Needs confirmation.
18. **Multi-environment targeting**: VM vs HomeServer targeting not fully resolved.

### 9.9 Monitoring Questions

19. **`_extract_keywords` rename audit**: No audit performed.

### 9.10 Long-Term Questions

20. **Narrative engine (proactive)**: No design written.
21. **Skills time-series**: New table needed, design not written.
22. **Interactive maps**: Coordinate coverage needs assessment.
23. **Family tree visualization**: Rendering library not selected.

### 9.11 RAG Questions

24. **Execution status** beyond 2026-02-19 draft date unknown.
25. **`df-wiki` collection**: 4 pts at plan time, current state unknown.
26. **MediaWiki crawler**: Not yet written.
27. **LB2, LV-Next, df-sites-analyzer**: No concrete indexing plan.
28. **`research` collection audit**: Source documents not described.

### 9.12 VM Infrastructure Open Items

- **Phase 1 outcome unknown**: DF under Prism double-emulation is central question.
- **DFHack RPC on VM vs dfhack-run SSH**: Validation plan needs reconciliation.
- **Steam on ARM**: May require x64 emulation.
- **HomeServer SSH**: Requires user action.
- **`vm-bootstrap.sh`**: Last pending Phase 0 item.
- **ARM vs x86 packaging**: Majority of end-users are x86_64.
- **Qwen3-1.7B on Windows**: Performance without GPU not validated.
- **Distribution/signing/updates**: No decisions made.

### 9.13 Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bridge deployment failures (VM offline) | MEDIUM | Test locally; deploy via SCP |
| TCP RPC broken for game-thread calls | HIGH | Use `dfhack-run` over SSH |
| Watcher previous_units state not accessible | MEDIUM | Verify; add if missing |
| NVS over-weights screen time | LOW | Tune weights iteratively |
| NVS denominator zero on first cycle | LOW | Floor of 1 guard |
| Bridge missing `hist_fig_id` | LOW | HF linking optional |
| `dfhack-run` SSH latency | LOW | <0.5s; acceptable |
| Race condition on dual watchers | LOW | Advisory lock |
| Post-embark legends unavailable | LOW | Synthetic HF fallback |
| Synthetic HF conflicts with re-import | LOW | ON CONFLICT DO UPDATE |
| Knowledge Horizon too aggressive | MEDIUM | Default advisory mode |
| LLM context overflow | MEDIUM | Static schema ~2K tokens; 50 row cap |
| Agentic LLM too many queries | MEDIUM | Max 5 rounds; keyword fallback |
| Agentic LLM invalid SQL | LOW | Read-only transaction + blocklist + timeout |
| Live event ID collision | LOW | 10,000+ gap |
| HomeServer deployment blocked | MEDIUM | Manual RDP workaround |
| `_extract_keywords` rename breaks | LOW | Audit callers first |

---

## 10. Metrics & Targets

### 10.1 Effort Estimates

| Phase | Effort | Cumulative |
|-------|--------|-----------|
| Phase 1: Denizen Registry + Death Detection | 6-8 hours | 6-8 hrs |
| Phase 2: Embark HF + Unit Expansion + Live Events | 6-8 hours | 12-16 hrs |
| Phase 3: Agentic Storyteller + Explorer Integration | 8-10 hours | 20-26 hrs |
| Phase 4: Events Tab + Knowledge Horizon Stub | 4-6 hours | 24-32 hrs |
| Monitoring System | ~3-4 hours | Parallel |
| Phase 5: Polish + Long-Term | Ongoing | — |

**Total for v1.0 (Phases 1-4)**: 24-32 hours

### 10.2 Performance Targets

| Metric | Target |
|--------|--------|
| Agentic storyteller response | Under 15 seconds |
| Max SQL rounds | 5 rounds |
| Per-query timeout | 5 seconds |
| Max rows per query | 50 rows |
| Denizen tracking cap | 500 entries |
| NVS range | 0.0-100.0 |
| Schema summary for LLM | ~2K tokens |
| Death detection latency | Within 2 watcher cycles |
| Missing detection latency | Within 3 watcher cycles |
| HTTP transfer (VM) | ~105 MB/s |
| SCP transfer (VM) | ~19 MB/s |
| Test suite execution | 0.19s baseline |
| Phase 1 new tests | 12 tests, >80% coverage |
| Bridge polling | 100 game ticks |
| Watcher polling | 10s default |
| Probe interval | 60s default |
| Monitoring refresh | 30 seconds |

### 10.3 Key Verification Metrics

| Milestone | Metric |
|-----------|--------|
| v0.9 | Embark dwarf with kill, profession change, and Legendary skill has 3+ live events |
| v1.0 | "Who killed the dwarf married to the mayor?" → accurate, evidence-cited narrative in <15s |

### 10.4 Data Recovery Metrics (Already Achieved)

- Cross-world ID collisions resolved: 10,932
- HFs recovered (Namoram): 5,466
- Total HFs post-migration: 60,787 (9.9% restoration)
- Kill counts corrected: 8,680 figures (max: 3 → 146)
- Written contents imported: 61,692 across 2 worlds
- Underground regions backfilled: 1,570 (0 NULLs)

### 10.5 Entity Position Extraction Metrics

| Table | Expected Row Count |
|-------|--------------------|
| `entity_positions` | ~11,712 |
| `hf_position_links` (combined) | ~41,000-55,000 |
| Active (end_year IS NULL) | ~6,843 |
| Former | ~34,356 |
| From legends_plus assignments | up to ~13,501 |

### 10.6 World Data Reference

| World | DB Name | Events (legends) | Events (live) | HFs | Entities | Artifacts | Sites | Event Types |
|---|---|---|---|---|---|---|---|---|
| "Namoram" | CDM (primary) | ~109K total | — | — | — | — | — | — |
| "Thadar En" (world 8) | Chronicler DB | 312,254 | 442,716 | 48,366 | 4,901 | 8,035 | 2,154 | 97 of 141 |

### 10.7 Event Frequency Reference (World 8)

Most common:
- change hf state: 53,077
- change hf job: 49,584
- add hf entity link: 33,880
- written content composed: 26,819
- hf died: 20,620

Rarest observed:
- site tribute forced: 1
- hf ransomed: 1
- entity breach feature layer: 1

### 10.8 Event Type Coverage Target

- CDM: 141 canonical types
- LLM narrative templates: 122 types (all LB2-handled)
- Graceful LLM fallback: 19 remaining types

---

## 11. Prioritized Action Item List

### Tier 1 — Critical (blocks narrative engine and explorer)

| # | Action | Source | Effort |
|---|---|---|---|
| 1 | Add all 141 event types to CDM taxonomy | dfhack-infrastructure | Medium |
| 2 | Extend HF CDM with missing high-priority fields | All legends browsers | Large |
| 3 | Add importance scoring columns + compute | df-narrator | Small |
| 4 | Implement death cause narrative rendering (40+) | weblegends | Medium |
| 5 | Implement perspective-aware event narrative | LB2, weblegends | Medium |
| 6 | Add cross-linking infrastructure | All legends browsers | Medium |
| 7 | Implement DF calendar utility | df-narrator, weblegends | Small |
| 8 | Run Knowledge Horizon prerequisite queries (4) | KH design | Small |
| 9 | Implement `knowledge_horizon` table + masking | KH design | Medium |
| 10 | Implement `fortress_denizens` registry + NVS | Unit-HF merge design | Medium |
| 11 | Implement embark dwarf synthetic HF generation | Unit-HF merge design | Small |

### Tier 2 — High Value (visualization and data completeness)

| # | Action | Source | Effort |
|---|---|---|---|
| 12 | Interactive world map (Leaflet.js) | LV-Next, LB2 | Large |
| 13 | Family tree visualization (Cytoscape.js dagre) | LV-Next, LB1 | Medium |
| 14 | Event timeline charts (Chart.js) | LV-Next | Medium |
| 15 | Population distribution charts | LV-Next, LB1 | Small |
| 16 | Hover popovers for entity preview | LB2 | Medium |
| 17 | Global search with autocomplete | LB2 | Medium |
| 18 | Add missing CDM entity types: WorldConstructions, ArtForms (3), Identities, Rivers | All | Large |
| 19 | Extend HF CDM with medium-priority fields | All | Medium |
| 20 | Post-parse cross-referencing pipeline (7 steps) | LV-Next, LB2 | Medium |

### Tier 3 — Bridge Enhancements

| # | Action | Source | Effort |
|---|---|---|---|
| 21 | Add `eventful` subscriptions | myDFHackScripts | Small |
| 22 | Death cause resolution via incidents | myDFHackScripts | Small |
| 23 | Parent/family chain extraction | myDFHackScripts | Small |
| 24 | Book/written work detection | myDFHackScripts | Small |
| 25 | Create `worldgen-bridge.lua` | worldgen research | Medium |
| 26 | Add `worldgen_snapshots` CDM table | worldgen research | Small |

### Tier 4 — Stretch / Deferred

| # | Action | Source | Effort |
|---|---|---|---|
| 27 | Curse lineage tree | LB1 | Medium |
| 28 | Warfare graph (Cytoscape.js cola) | LV-Next | Medium |
| 29 | War chord diagram (D3.js) | LB1 | Medium |
| 30 | Mod awareness (active mods per world) | mod research | Small |
| 31 | Stock threshold model from df-ai | df-ai | Medium |
| 32 | Raw file parser for mod conflict detection | mod research | Large |

---

## 12. Dependencies & Reference Documents

### 12.1 Dependencies

| Dependency | Required For | Status |
|------------|-------------|--------|
| Composite PK migration | All phases | COMPLETE |
| 131-test suite | Regression safety | COMPLETE |
| Bridge v6 (16 sections) | Phase 1 denizen tracking | COMPLETE |
| Explorer 6-tab structure | Phases 3-4 UI integration | COMPLETE |
| Entity position extraction | Phase 3 position display + KH | COMPLETE |
| UTM Win11 VM access | Phase 2 bridge deployment | Available |
| LLM with tool-use support | Phase 3 agentic storyteller | Available |

### 12.2 Active Plan Files

| Plan File | Done | Remaining | Maps to Phase |
|-----------|------|-----------|---------------|
| `rippling-honking-crescent.md` | Phases 1-7 | Phase 3, Phase 8 | Phase 2, Phase 4 |
| `shiny-churning-sprout.md` | People, Civs, Geo | Events & Timeline | Phase 4 |

### 12.3 Reference Design Documents

| Document | Path | Role |
|----------|------|------|
| PRD v2.2 | `projects/chronicler/designs/chronicler-prd-v2.md` | Source of truth |
| Development Roadmap v1.1 | `projects/chronicler/designs/chronicler-roadmap-v1.md` | Phase-by-phase plan |
| Phase 1 Detailed Plan | `projects/chronicler/designs/phase-1-denizen-registry.md` | Phase 1 implementation |
| Unit-HF Field Mapping | `projects/chronicler/designs/unit-hf-field-mapping.md` | Merge strategy |
| Knowledge Horizon Design | `projects/chronicler/designs/knowledge-horizon.md` | 7 caveats |
| Data Gap Analysis | `projects/chronicler/reports/data-gap-analysis-2026-02-22.md` | Gap catalog |
| Gap Closure Critical Review | `projects/chronicler/reports/gap-closure-critical-review.md` | Execution record |
| UI Enhancements Plan | `.claude/plans/rippling-honking-crescent.md` | Remaining: Phase 3, 8 |
| Explorer Redesign Plan | `.claude/plans/shiny-churning-sprout.md` | Remaining: Events tab |
| Mac Studio Roadmap | `.claude/plans/mac-studio-db-ai-roadmap.md` | Infrastructure context |

### 12.4 Reference Repositories

| Repository | Language | Key Features for Chronicler |
|-----------|----------|----------------------------|
| LegendsBrowser2 | Go + Vue.js | Custom streaming XML tokenizer, 100+ event types, collection summaries |
| LegendsViewer-Next | .NET 8 + Vue 3 | Leaflet.js maps, family trees, async XmlReader, fastest loader |
| df-narrator | Python | Figure/site/conflict scoring formulas, direct prototype reference |
| weblegends | C++ (DFHack plugin) | 96 per-event HTML generators, context-aware rendering |
| df-ai | C++ (DFHack plugin) | Event manager pattern, best DFHack plugin API reference |
| DwarfFortressLogger | C++ (Qt) | Real-time memory-mapped DF structure access |
| df-structures | XML | Canonical DF memory structure definitions — CRITICAL |
| dfhack-client-python | Python | Python RPC client |
| dwarf-therapist | C++ (Qt) | Labor management reference |

---

*Final consolidation written 2026-02-25. Sources: round3-pair-01.md (Core Planning, Phase Implementation, Data Pipeline & Ingestion) + round3-pair-02.md (User Interface, VM Infrastructure, Data Model Design & Research). All information from both documents preserved and cross-referenced. No information discarded.*
