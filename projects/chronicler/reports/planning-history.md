# Chronicler Project -- Planning History Document

**Canonical Source of Truth for All Chronicler/DwarfCron Project Planning**
**Final consolidation date**: 2026-02-25
**Round**: 5 / Final Merge
**Sources**: round4-pair-01.md (Product Vision, Component Specifications, CDM/Database Schema, Data Pipeline, Infrastructure, UI/UX, Phase-by-Phase Plan, API Routes) + round4-pair-02.md (Foundation Vision, Complete Feature Inventory, Reference Tool Analysis, Data Quality, Architecture Patterns, Data Extraction Methods, Insights, Technical Appendices)

---

## 1. Product Vision & Foundation

### 1.1 Project Name & Design Philosophy

**"Chronicler"** -- A living record of every world Dwarf Fortress generates.

Every procedurally generated DF world is a novel. The characters have backstories, traumas, achievements, and relationships. The civilizations rise and fall through wars, plagues, and migrations. The artifacts change hands across centuries. Most players never see 5% of the history their world generates. Chronicler makes all of it visible, searchable, and narratable.

Two mutually reinforcing purposes:

**Purpose 1 -- The AI Storyteller**: A conversational interface that knows your world as well as any bard in it. You can ask "who was the most tragic dwarf in the history of Uristmcbronze?" and get a coherent character study drawing on their biography, relationships, and the events that shaped them. You can ask "tell me the story of the Fall of Bladetower" and receive a narrative with named characters speaking in voices consistent with their psychological profiles.

**Purpose 2 -- The Living Atlas**: An all-inclusive data viewer, running in your browser, showing everything from world-generation demographics to your current fortress population in real time. A single place that does everything LegendsViewer, LegendsBrowser, and LegendsViewer-Next do, unified into one coherent experience, with the addition of live data and demographic analytics no existing tool provides.

### 1.2 Chronicler's Unique Position in the DF Ecosystem

Chronicler is the first tool in the DF ecosystem that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse -> CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel; no prior tool does this)
6. Dynamic Knowledge Horizon masking (limits LLM's search space to what the fortress plausibly knows)

No existing tool (LegendsViewer-Next, LegendsBrowser, LegendsBrowser2, weblegends, df-narrator, df-ai) covers all six simultaneously.

### 1.3 Differentiation from Existing Tools

The current ecosystem is fragmented:
- Legends viewers only work from XML exports (require export -> reload cycle for updates)
- Real-time tools are limited to 3D voxel renderers (Armok Vision, Vox Uristi)
- AI storyteller space is essentially unexplored
- No unified CDM connecting live game state to historical data
- No worldgen-phase data scraping in any existing tool
- No demographic visualization (population pyramids, skill distributions, migration flows)

**Chronicler-Specific Advantages Over Reference Tools**:
1. **Persistent PostgreSQL database**: Enables historical diffs across saves, trend analysis, cross-session queries, incremental updates.
2. **LLM-enhanced narrative**: LLM generation for richer, non-repetitive narrative prose beyond templates.
3. **API-first design**: JSON APIs enabling external tooling and programmatic access.
4. **Live DFHack integration**: Data unavailable in XML: current inhabitants, site ownership, creature raw data for interaction text, squad names, occupation detail, age from live tick.
5. **Cross-save analytics**: Track population trends, war outcomes, artifact journeys across multiple fortress saves.
6. **Mod history in DB**: Unique feature -- link game events to the modpack active at time of generation.

### 1.4 Current State (v0.8) -- What Is Built

| Component | Status | Key Metrics / Notes |
|-----------|--------|----------------------|
| CDM PostgreSQL Schema | COMPLETE | 35 tables, composite PKs, 109K records |
| Legends XML Parser | COMPLETE | lxml iterparse, 141 event types, lossless capture, streaming capable (>25 MB files) |
| Lua Bridge | COMPLETE | v6, 16 sections, 7 data domains, HTTP on port 8888 |
| Watcher | COMPLETE | `chronicler watch`, 3+ cycles verified, graceful shutdown |
| Change Detector | COMPLETE | 11 event types: death, mood, stress, pregnancy, ghost, etc. (watcher.py); 5 types in detector.py: ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED |
| Explorer | COMPLETE | 6 tabs: People, Civilizations, Geography, Schema, Data, Graph |
| Entity Positions | COMPLETE | 11,712 position definitions + 13,501 assignments + 41,199 historical links extracted |
| Storyteller | COMPLETE | Keyword->SQL routing, dual-tier context (HISTORICAL + LIVE), 12,000-char budget, 5 live data retrieval paths, 23 routes |
| Test Suite | COMPLETE | 131 tests, composite PK correctness, all passing in 0.19s |
| Explorer UI Enhancements | COMPLETE | Phases 1-7 of rippling-honking-crescent plan |
| Live Polling Daemon (core) | COMPLETE | `chronicler watch` CLI; fallback chain; bridge storage; change detection |
| Lua Probes (initial) | COMPLETE | `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)` |
| Monitoring System | NOT STARTED | ~230 LOC, 3 new files, 4 modified files |
| RAG Indexing | PARTIAL | dfhack 8,476 pts; dwarf-therapist 926 pts; df-wiki 4 pts |

**Live world data confirmed** (world "The Land of Dawning", year 250, 257x257):
- 48,366 historical figures
- 442,716 history events
- 4,901 entities (8 dwarf civs, 8 human, 8 elf, 9 goblin, 8 kobold + underground)
- 8,035 artifacts
- 2,154 sites
- 2,278 regions

**Database note**: DB currently holds world "Namoram" from legends XML; live VM runs "The Land of Dawning". Phase 1 (denizen registry) works with either -- populated from live data regardless of which world's legends are in the DB.

**Web UI**: Live at `localhost:8080`. Full SSE streaming from Qwen3-8B via LiteLLM. Two worlds queryable: Namoram (world 5, 109K records) and Ormon (1.54M records).

### 1.5 Gap Closure Work -- All Complete (Session 32, 2026-02-22)

All gap-closure phases were completed before denizen registry development begins. ~70% was already implemented before the revised v2 plan was written; Session 32 audit confirmed this and completed the remainder.

#### Phase 0: Data Integrity Fixes -- DONE

- **BUG-005 (kill_count)**: Was LEFT JOIN'd to event_count (mirroring wrong count); was grouping by `hf_id_1` (victim) instead of `hf_id_2` (slayer). Fixed to independent UPDATE with correct grouping. Result: 8,680 figures updated, max kill count rose from 3 to 146.
- **BUG-006 (link table UNIQUE constraints)**: Deduped 4,679 rows from `hf_links` and 23 from `hf_entity_links`. Added UNIQUE constraints: `uq_hf_links`, `uq_hf_entity_links`, `uq_hf_site_links`. Updated ON CONFLICT: hf_links/hf_site_links -> DO NOTHING; hf_entity_links -> DO UPDATE SET position_name.
- **BUG-008 (region parsing scope)**: Changed `.//region` -> `regions/region` and `.//underground_region` -> `underground_regions/underground_region`. Verified: 240/240 regions and 125/125 underground_regions match.
- **BUG-001/REFL-023**: Boolean flag debugging (deities, vampires, necromancers, werebeasts).
- **BUG-003 (site ownership)**: Fixed from legends_plus `cur_owner_id`.

#### Phase 1: Composite PK Migration -- DONE

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

#### Phase 2: Storyteller Enrichment -- DONE

- **Relationship traversal on HF match**: queries `hf_links` for spouse/children/parents, `hf_entity_links` for civ memberships and positions, `hf_site_links` for associated sites.
- **Event payload enrichment**: JOINs to resolve hf_id -> name, site_id -> name. Natural-language templates for 6 event types. `_summarize_details()` for JSONB fields.
- **Emotion/zone integration in live unit queries**: `_build_emotion_map()` matches latest `dwarf_emotions` probe to unit IDs; `_build_zone_owner_map()` resolves owner -> zone name.
- **War name resolution**: JOINs collection queries to resolve entity IDs -> names in 3 locations.
- **Confidence signaling**: context density note prepended to all retrieval results. If < 3 records: caution warning. If > 10 records: rich context note.
- **HF-to-unit cross-reference**: `_retrieve_live_units()` JOINs to historical_figures.

#### Phase 3: XML Completeness -- DONE

- **`written_contents` table**: composite PK (world_id, id), dual-source parsing (legends.xml + legends_plus.xml). Imported: 61,692 written contents across 2 worlds.
- **`historical_eras` table**: composite PK (world_id, name), start_year = -1 preserved. Imported: 2 eras.
- **Region parsing verified and fixed**: underground_regions backfilled with type/depth from legends.xml. All 1,570 underground_regions corrected (0 NULLs remaining).
- **Entity Position Extraction**: position definitions and historical/active assignment links fully extracted and stored (11,712 definitions, 13,501 assignments, 41,199 historical links).

#### Phase 4: Operational Hardening -- DONE

- 131-test suite, all passing in 0.19s.
  - `test_xml_parser.py`: 26 tests
  - `test_context.py`: 30 tests
  - `test_detector.py`: 29 tests
  - `test_schema.py`: 46 tests
- **`lua_probes` retention policy**: keep last N per probe_name per world_id via `_cleanup_lua_probes_count()`. Cleanup every 10 watcher cycles.
- **Bridge health monitoring**: consecutive failure counter, warn after 3 failures, continue with core-only data.

### 1.6 Target State (v1.0) -- Three Pillars

1. **Denizen-Centric Data**: Every fortress-relevant being tracked in a registry; Unit+HF data merged; live events recorded as they happen.
2. **Agentic Intelligence**: LLM autonomously queries the database, exploring relationships and events through iterative SQL execution until it can provide an evidence-based response.
3. **Domain-Specific Explorer**: Fortress-centric views (People, Events, Civilizations, Geography) with cross-linking, NVS sorting, and Knowledge Horizon masking.

**Mental model**: The denizen registry is the root node of the Knowledge Horizon graph. The agentic storyteller is an autonomous analyst with read-only database access, not a retrieval pipeline.

### 1.7 Four Strategic Priorities (v0.8 -> v1.0)

1. **Denizen Registry** -- Gateway table tracking every being who has touched the fortress; root node for all queries; anchor for Narrative Value Scores. The "keystone table" -- every subsequent phase depends on it.
2. **Embark-Aware Data Unification** -- Post-embark legends re-export as primary path; synthetic HF records only as fallback; relationships sourced from Unit data, not heuristic guessing.
3. **Live Event Generation** -- Convert runtime state transitions (kills, marriages, deaths, profession changes) into `history_events`-compatible records; gives fortress-born entities a proper event history.
4. **Agentic Storyteller** -- Replace keyword-routed extraction with an LLM that autonomously executes SQL queries, performing iterative rounds of data exploration to build evidence-based responses.

### 1.8 Identified Gaps (v0.8 -> v1.0)

| Gap | Impact | Assigned Phase |
|-----|--------|----------------|
| No "who matters" concept | LLM searches 60K+ HFs equally | Phase 1 |
| Embark dwarves may lack HF records | Starting dwarves invisible to storyteller | Phase 2 |
| No live event generation | Fortress-born entities have zero event history | Phase 2 |
| No death detection beyond flag check | Deaths go undetected when units disappear | Phase 1 |
| No unified person view | Unit and HF treated as separate entities | Phase 3 |
| Static keyword->SQL routing | Can't handle novel questions or multi-hop reasoning | Phase 3 |
| No Events tab | Event browsing missing from explorer | Phase 4 |
| No Knowledge Horizon | No dynamic visibility scoping | Phase 4-5 |
| Unit data extraction incomplete | ~15 fields captured out of 100+ available | Phase 2 |
| No monitoring/observability for storyteller | Cannot diagnose LLM quality or performance | Monitoring backlog |
| No RAG knowledge base for Chronicler dev | AI components lack DF reference knowledge | RAG backlog |

### 1.9 Data Flow Architecture

```
CURRENT (v0.8):
  Legends XML -> Parser -> PostgreSQL (35+ tables) -> Keyword Routing -> Context Assembly -> LLM -> Chat
  Live Bridge -> Watcher -> PostgreSQL (units/events/probes) -> Keyword Routing (partial)
  dfhack-run (SSH) -> Lua commands -> stdout (verified working for all data domains)

TARGET (v1.0):
  Legends XML -> Parser ---------------------------------> PostgreSQL (40+ tables)
  Post-Embark Legends Re-export -> Parser (with embark detection) /
  Live Bridge -> Watcher --------------------------------/
  Live Bridge -> Event Generator -> history_events ------/
  dfhack-run (SSH) -> Lua probes -> Watcher ------------/
  Embark HF Fallback (if no post-embark export) --------/
                                                          |
                                                    Denizen Registry
                                                          |
                                                    LLM (Agentic SQL Tool Use)
                                                      |               |
                                                    Chat          Explorer
                                                                (fortress-centric views)
```

---

## 2. Architecture Overview

### 2.1 Technology Stack

- FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs.
- Single `explorer.html` template.
- API routes structured in separate files per domain.
- PostgreSQL with `unaccent` extension for diacritic-tolerant search.
- vis.js loaded from CDN (`https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`) -- no build step.
- Server start: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`.

#### Stack Decision Matrix

| Layer | Recommendation | Rationale | Alternatives |
|-------|---------------|-----------|--------------|
| **DFHack plugin language** | Lua (primary), C++ (if needed) | Hot-reload, full df.* access, no compile cycle for iteration | C++ only if per-tick performance matters |
| **External data pipeline** | Python 3.12 | Ecosystem for XML parsing, DB access, LLM integration; Jarvis already uses it | Go (faster, but less AI library ecosystem) |
| **XML parsing** | `lxml` iterparse (SAX-style) | Handles 1GB+ files without OOM | `defusedxml` for security-sensitive contexts |
| **Database** | PostgreSQL 16 + pgvector | Unified relational + vector store; reuses Jarvis infrastructure pattern | SQLite for simpler deployment |
| **ORM** | SQLAlchemy 2.0 | Async support, mature, Alembic migrations | Tortoise-ORM (async-first but smaller ecosystem) |
| **Embeddings** | qwen3-embedding:4b via Ollama | Consistent with Jarvis; 2560-dim; local/private | OpenAI ada-002 (2nd choice, API cost) |
| **LLM backend** | Ollama (local) + Claude API (quality) | Local for development; Claude for production Q&A quality | Llama3 local, GPT-4 |
| **API framework** | FastAPI + Uvicorn | Async, OpenAPI generation, WebSocket support | Django (heavier), Litestar |
| **Frontend framework** | SvelteKit | Lightweight, fast, SSR support, good DX | Vue 3 + Vite (also excellent, used by LegendsViewer-Next) |
| **Map library** | Leaflet.js | Used by LegendsViewer-Next, proven for DF maps | OpenLayers (more complex) |
| **Charts/dataviz** | Observable Plot + D3.js | D3 for custom tree/network charts; Observable Plot for analytics | Recharts, Chart.js (simpler but less flexible) |
| **Packaging** | Docker Compose | Multi-service orchestration, reproducible | Nix flake (complex), bare scripts |
| **DFHack RPC client** | dfhack-client-python or hand-rolled Protobuf | Thin library; may need custom methods not in existing clients | Rust client (dfhack-remote) if Python performance is insufficient |

#### Key Python Libraries

```
lxml>=5.0              # XML parsing
sqlalchemy>=2.0        # ORM + async
alembic>=1.13          # DB migrations
psycopg[binary]>=3.1   # PostgreSQL async driver
pgvector>=0.3          # pgvector Python client
fastapi>=0.110         # API framework
uvicorn[standard]>=0.29 # ASGI server
websockets>=12.0       # WebSocket support
protobuf>=4.25         # DFHack RPC
grpcio>=1.62           # gRPC (if extending RPC interface)
httpx>=0.27            # HTTP client for tests
pytest>=8.0            # Test framework
pydantic>=2.6          # Data validation
ollama>=0.2            # Ollama Python client
anthropic>=0.25        # Claude API client
numpy>=1.26            # Vector operations
```

### 2.2 New Architectural Components

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

### 2.3 Three-Tier Development Architecture

```
+-------------------------------------+
|  macOS Host (Development)           |
|  - VSCode / IDE                     |
|  - Python pipeline (venv)           |
|  - Git repository                   |
|  - Database (PostgreSQL local)      |
|  - Web frontend dev server          |
+----------------+--------------------+
                 | shared folder / network
+----------------v--------------------+
|  Windows VM / Wine Bottle (Game)    |
|  - Dwarf Fortress (Steam)           |
|  - DFHack (with custom plugin)      |
|  - DFHack TCP server on port 5000   |
|  - Lua data-emission scripts        |
+-------------------------------------+
```

### 2.4 Full Data Flow Architecture

```
+-------------------------------------------------------------+
|  LAYER 1: DATA INGESTION                                     |
|                                                              |
|  [DF Game Process]                                           |
|       |                                                      |
|  [DFHack Plugin/Script]                                      |
|   +-- RemoteFortressReader RPC (live unit/map data)          |
|   +-- Lua polling script (per-tick: events, state changes)   |
|       |                                                      |
|  [XML Import Pipeline]                                       |
|   +-- legends.xml (base world history)                       |
|   +-- legends_plus.xml (DFHack-enriched data)               |
|       |                                                      |
|  [World-Gen Scraper]                                         |
|   +-- world_sites_and_pops.txt                              |
|       |                                                      |
+-------------------+------------------------------------------+
                    |
+-------------------v------------------------------------------+
|  LAYER 2: COMMON DATA MODEL (CDM) DATABASE                   |
|                                                              |
|  PostgreSQL + pgvector                                       |
|                                                              |
|  Core Tables:                                                |
|  world, region, site, structure                              |
|  entity (civilization), entity_position                      |
|  historical_figure, unit (live)                              |
|  history_event, history_collection                           |
|  artifact, item, material                                    |
|  relationship, entity_link, hf_link                         |
|  language, word                                              |
|  worldgen_snapshots, worldgen_params                         |
|                                                              |
|  Vector Tables (pgvector):                                   |
|  figure_embeddings (biography chunks -> 2560-dim vectors)    |
|  event_embeddings (event narratives -> 2560-dim vectors)     |
|  artifact_embeddings (artifact histories)                    |
|  site_embeddings (site histories)                            |
+-------------------+------------------------------------------+
                    |
        +-----------+----------+
        |                      |
+-------v----------+  +-------v----------------------------+
|  LAYER 3A:       |  |  LAYER 3B:                         |
|  AI STORYTELLER  |  |  DATA VIEWER BACKEND               |
|                  |  |                                     |
|  RAG Pipeline:   |  |  FastAPI / REST + WebSocket         |
|  Query -> embed  |  |  - Entity lookup / search           |
|  -> pgvector ANN |  |  - Timeline queries                 |
|  -> context build|  |  - Demographic aggregations         |
|  -> LLM prompt   |  |  - Map data serving                 |
|  -> response     |  |  - Live unit state (WS push)        |
|                  |  |                                     |
|  LLM Backend:    |  +----------------+-------------------+
|  Local (Ollama)  |                   |
|  or API (Claude) |  +----------------v-------------------+
|                  |  |  LAYER 4: WEB FRONTEND              |
+------------------+  |                                     |
                      |  SvelteKit or Vue 3 + TypeScript    |
                      |  - World map (Leaflet.js)           |
                      |  - Entity browser                   |
                      |  - Family tree (D3.js)              |
                      |  - Timeline visualization           |
                      |  - Demographic charts (Observable)  |
                      |  - AI chat panel                    |
                      |  - Live fortress dashboard          |
                      +-------------------------------------+
```

### 2.5 Reference Tool Benchmarking -- Feature Targets

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
| Live event generation | None | Runtime state -> history_events records |
| Unified person view | None (HF-only in all viewers) | Merged Unit + HF + personality + events |
| Embark dwarf coverage | None (starting dwarves invisible everywhere) | Embark-aware HF handling + live events |
| Narrative Value Scoring | df-narrator (figure scoring for Markdown export) | Real-time NVS updated per watcher cycle |
| Database exploration | None (viewers are read-only displays) | SQL runner, schema browser, JSONB expansion |
| Knowledge Horizon masking | None | Dynamic visibility based on fortress knowledge |
| LLM observability | None | Monitoring dashboard with per-interaction latency breakdown |

### 2.6 Project Repository Structure

```
chronicler/
+-- dfhack/                         # DFHack plugin & scripts
|   +-- chronicler-emit.lua         # Live data emission script
|   +-- chronicler-export.lua       # Triggered export helper
|   +-- worldgen-bridge.lua         # Worldgen monitoring script
|   +-- chronicler-bridge.lua       # Fortress-mode event bridge
+-- src/
|   +-- chronicler/
|   |   +-- __init__.py
|   |   +-- cli.py                  # Click CLI entry point
|   |   +-- config.py               # Configuration (Pydantic settings)
|   |   +-- db/
|   |   |   +-- models.py           # SQLAlchemy models (CDM)
|   |   |   +-- migrations/         # Alembic migrations
|   |   |   +-- queries.py          # CDM query layer
|   |   +-- ingest/
|   |   |   +-- xml_parser.py       # Legends XML ingestion
|   |   |   +-- pops_parser.py      # world_sites_and_pops.txt parser
|   |   |   +-- live_sync.py        # DFHack RPC live sync
|   |   |   +-- worldgen_watch.py   # Worldgen snapshot ingestion
|   |   +-- embed/
|   |   |   +-- biography.py        # Figure biography assembler
|   |   |   +-- pipeline.py         # Embedding generation pipeline
|   |   |   +-- store.py            # pgvector read/write
|   |   +-- ai/
|   |   |   +-- retrieval.py        # RAG retrieval
|   |   |   +-- prompts.py          # LLM prompt templates
|   |   |   +-- storyteller.py      # Storyteller interface
|   |   +-- api/
|   |       +-- main.py             # FastAPI app
|   |       +-- routes/             # Route handlers
|   |       +-- ws/                 # WebSocket handlers
+-- frontend/                       # SvelteKit app
|   +-- src/
|   |   +-- routes/                 # Page routes
|   |   +-- lib/
|   |   |   +-- map/                # Leaflet integration
|   |   |   +-- charts/             # D3/Observable components
|   |   |   +-- api.ts              # API client
|   |   +-- components/             # Svelte components
|   +-- vite.config.ts
+-- docker-compose.yml              # PostgreSQL + pgvector + app
+-- pyproject.toml                  # Python package config
+-- README.md
+-- docs/
    +-- setup.md
    +-- dfhack-integration.md
    +-- api-reference.md
```

---

## 3. Component Specifications

### 3.1 World History & Demographics Visualizer

#### Interactive World Map (Leaflet.js)

- Library: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection needed).
- Map image generation: SkiaSharp PNG from world region data; three cached sizes (thumb/default/large). Use DF-exported `.bmp` map file if present, otherwise generate from `RegionTypeColors.BaseRegionColors`.
- **Coordinate system**: Y-axis inverted, scaled by tile size: `[(height - y) * scale, x * scale]`. This is the canonical formula.
- Base layer: world map PNG as image overlay (50% opacity).
- Scale: 4-10 pixels per world tile.
- Layer groups (each toggleable):
  - Sites: colored polygons by owning entity; gray for ruins; yellow for unowned
  - World Constructions: squares for point constructions, polylines for roads/bridges/tunnels
  - Mountain Peaks: triangle markers
  - Landmasses: semi-transparent rectangles
  - Regions: outline polygons, color-coded by evilness (fuchsia=evil, aqua=good)
  - Evilness fill layer (separate from region outlines)
  - Rivers: rendered paths
  - Battle markers: red diamond polygons on war/battle collection pages
- **Site marker shapes by type**: Circle (Unknown, Cave, Lair, Camp), Triangle (Monastery, Fort, Tomb), Square (Hillocks, Hamlet), Pentagon (Fortress, ForestRetreat, Town, DarkPits), Hexagon large (MountainHalls, Castle, DarkFortress), Star (Vault, Labyrinth, Shrine, Tower, ImportantLocation), Pentagon blue (MysteriousDungeon), Hexagon blue (MysteriousPalace).
- Marker colors: owning civilization's generated color (`Entity.LineColor`).
- Layer control: sites grouped by owner into Leaflet `LayerGroup`; "All"/"None" toggle buttons.
- Popup content: site name, type, owner name.
- Tooltips and popups on every map element via fetch to `/popover/{type}/{id}`.
- Zoom: `minZoom: -2`, `maxZoom: 2`.
- Per-object mini-maps: focused region-highlighted map on each entity detail page.
- Map coordinate system for non-square worlds: use worldgen params for width/height.
- **Timeline Scrubber**: See the map at any world year; navigate temporal state of the world map.
- **Civ Territory Overlays**: Overlay civilization territorial control on the map.
- **Worldgen Live Map Preview**: During worldgen, update the map as terrain phases complete.
- **Search and Jump**: Search for a site or region by name; click result to jump camera to that location.
- **Site Bounding Box**: Show the site `rectangle` (4-corner bounding box in world tiles) in addition to the single `coord` marker.
- **Large Region Support**: Handle regions with >10,000 tiles by splitting into multiple render chunks. Viewport culling for performance.
- **`regionDataMap` Fast Lookup**: Pre-compute a `world_width x world_height` 2D array mapping every world tile to its region for O(1) hover detection.
- **Y-Axis Flip Handling**: Account for DF's inverted Y coordinate system when rendering.

#### Hover Popovers

- Every entity hyperlink triggers hover popover.
- Content fetched from `/popover/{type}/{id}` endpoint returning compact HTML snippet.
- HF popover: name, race, sex, birth/death, type flags.
- Site popover: name, type, owner entity.
- Entity popover: name, type, race.
- Critical UX feature for exploration without navigation.

#### Civilization Color System

- HSV rotation algorithm: medium saturation for first 6 races, lighter for 7-12, darker for 13-18.
- Applied consistently across: map markers, warfare graph nodes, civilization list items.
- Each entity type has Color() and Icon() methods used consistently across map, lists, and links.

#### Population Charts

- Doughnut chart (Chart.js / D3): Population by Race.
- Doughnut chart: Area by Overworld Regions.
- Line chart: Events per year for world timeline.
- Bar chart: Event type breakdown by count.
- D3 population donut: at-a-glance demographic view with count labels.
- Library: `vue-chartjs` 5.3.2 (Chart.js 4.4.8 wrapper).
- Data endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`.

#### World Summary Dashboard / Home Page

- World map thumbnail linking to full interactive map.
- Population by Race and Area by Overworld Regions doughnut charts.
- Active Civilizations card list (with civilization color indicators).
- Lost Civilizations card list.
- Events section: line chart + paginated event table.
- Chronicles section: paginated event collection table.
- Heroic Ties card: player-related objects -- adventurer HFs, their factions, sites.
- Entities grouped by race, showing only civilization-type entities and necromancer groups.
- D3 War Chord Diagram (Wars tab): D3.js chord/ribbon diagram, each civilization as arc segment, chords connect warring pairs, hover highlights related chords.
- World statistics summary: years of recorded history, site count by type, civilization count, HF count, event count, artifact count.

#### Visualization Priority Matrix

| Visualization | LV-Next | LB1 | LB2 | weblegends | Priority for Chronicler |
|---|---|---|---|---|---|
| Interactive world map (Leaflet) | Yes | No | Yes | Static PNG | **P1** -- centerpiece feature |
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

### 3.2 Database Explorer Tools

#### Explorer Tab Architecture

- Replace generic Schema/Data/Graph tabs with domain-specific tabs.
- Final tab order: `People | Civilizations | Geography | Events | Database | Graph`
- **Database** tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries; power-user access must not be removed.
- **Graph** tab = existing vis.js ego-network graph visualization as a standalone tab, also launchable from any domain detail view via "View graph" buttons.
- Single-world simplification: hardcode `world_id=8` ("Thadar En" / "Namoram") in frontend API calls; keep `world_id` parameter in routes for schema correctness.
- Explorer is exposed at route `/explorer` within the existing Chronicler web app.

#### Shared Top Navigation

- Top nav bar with links to: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`).
- Active page highlighted in amber.
- Implemented as a Jinja2 partial: `_nav.html`.

#### People Tab

- Unified searchable interface merging historical figures (HFs) and in-game units.
- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter.
- Search supports both Dwarvish names and English translations.
- Accent-insensitive search: `unaccent(name) ILIKE unaccent($1)` pattern with `unaccent` extension enabled on PostgreSQL.
- **Right panel detail card**: Biographical info, relationships, entity memberships, skills, key life events, graph button.

##### HF Detail View

- Shows: biography, relationships, entity memberships, positions held, site links, identities, events.
- Computed age display using `current_game_year`.
- Cross-navigation: when a unit exists for this HF, show linked Unit card with nav-link.

##### Unit Detail View

- Biography card, relationships section, personality section (50 traits), attributes (6 physical + 12 mental), linked HF card, skills table, both Dwarvish and English names.

##### Fortress Folk View (Phase 3 Integration)

- "Fortress Folk" default view: only `fortress_denizens` where `status IN ('resident', 'deceased', 'missing')`, sorted by NVS
- Status badges: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark)
- NVS column: sortable narrative value score

##### Unified Person Detail (Phase 3 Integration)

Click any denizen -> merged Unit + HF view with combined personality + historical data, combined event timeline (legends + live-generated), relationships from both sources.

#### Civilizations Tab

- Browse entities: civilizations, religions, military orders.
- **Left panel**: Entity list grouped by type, with race badges and member counts. Filter + sort.
- **Right panel detail card**: Entity name, type, race, positions table with gender-appropriate titles and category-coded badges (Noble=amber, Military=red, Administrator=blue, Other=stone). Notable members, controlled sites, related events.
- Members loading: up to 1,000 members, clickable column headers, client-side sort and filter.

#### Geography Tab

- Browse sites, regions, and structures with connections to entities and HFs.
- **Left panel**: Sites grouped by type. Filter + sort.
- **Right panel detail card**: Site detail with structures, owner civ, notable inhabitants, historical events.
- Regions list with type.
- Cross-linking: clicking a site from the Civilizations tab navigates to Geography tab detail.

#### Events & Timeline Tab

- Browse historical events chronologically with participant filtering.
- **Controls**: Year range slider, event type dropdown, participant search.
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable).
- **Collection view**: Expandable war/battle trees.
- Source filter: "All Events" / "Legends Only" / "Live Only"
- Default: showing only events at the fortress site or involving fortress denizens.

##### Event Detail Cards

Context-aware rendering following the weblegends pattern: circumstance/reason fields, clickable entity references.

##### Event Collection View

Expandable war -> battle -> event trees.

#### Database Tab (Schema Browser + Data Browser)

##### Schema Browser

- Table list with row counts, columns, types, PKs, FKs, indexes per table.
- Two-column layout: table list (left, 280px) + detail panel (right).

##### Data Browser

- Table selector, filter bar, data grid with FK links, JSONB collapsible, pagination, SQL Runner.
- SQL Runner safety: keyword blocklist + `conn.transaction(readonly=True)` + enforced LIMIT cap + all dynamic table/column names validated.

#### Graph Tab

- vis.js ego-network visualization of HFs, entities, and sites.
- Search box with typeahead, world selector, depth selector (1-3 hop).
- vis.js canvas with forceAtlas2Based physics.
- Node info panel with click-to-expand.
- Performance guard: node count badge; warning at 500+ nodes; refuse expansion at 1,000+ nodes.
- Node styling: HF (default) stone, HF (deity) gold, HF (vampire) red, HF (necromancer) purple, HF (werebeast) orange, HF (ghost) slate, Entity (civilization) diamond blue, Entity (religion) diamond purple, Site square green.
- Edge colors: family=green, spouse=pink, enemy=red, membership=blue dashed, site link=lime dashed.

#### Cross-Linking Navigation

- Clicking a name in any tab navigates to the relevant tab's detail view.
- "View graph" buttons throughout domain views.
- Civilizations -> Geography, People -> Civilizations, People -> Geography, Unit <-> HF.

### 3.3 AI Dwarf Fortress Storyteller (Narrative Engine)

#### Core Storyteller Design

- **Core persona**: Speaks as "The Chronicler" with gravitas. Never fabricates facts. Says "The annals hold no record" rather than inventing.
- **Dual-tier context architecture**: System prompt distinguishes HISTORICAL (Legends XML) from LIVE (bridge) data. Context budget: 12,000 characters.
- **Contextual reconstruction**: Full narrative derived from sparse structured data.
- **Pre-resolved narrative-ready bridge data**: Bridge resolves raw IDs and coordinates into names and zone names in Lua before delivering to LLM.
- **Template-based vs. LLM-based rendering**: Templates remain as fast fallback and training scaffolding. LLM generation for richer, non-repetitive narrative prose.
- **Context-aware self-reference suppression**: Prevents narrative from being flooded with redundant constructions (weblegends `event_context` pattern).
- **Missing event fallback**: Fall back to DF's own `getSentence()` method via DFHack.
- **Cross-linked event narratives**: Every event sentence has clickable hyperlinks for each named entity.
- **Confidence signaling**: Count context records and characters at retrieval time.

#### Storyteller Retrieval Architecture

- **Current pipeline**: keyword extraction -> categorical routing (23 routes) -> ILIKE name search -> fallback `_world_overview()` -> `format_context` (12,000 char budget) -> LLM (Qwen3 8B via LiteLLM, temp 0.8, max 2048 tokens). STATUS: DONE.
- **Live data retrieval paths** (5 implemented): units table, unit_events, game_reports, lua_probes snapshots, plus JOIN of units.hist_fig_id to historical_figures. STATUS: DONE.
- **Categorical routes (23)**: "deity" -> historical_figures WHERE is_deity=TRUE; etc. STATUS: DONE.
- **pgvector / embedding-based retrieval** (long-term): infrastructure exists but unused.

#### Target Agentic Storyteller Architecture (v1.0)

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
Tool executor: validates query, executes, returns results (max 50 rows)
  |
LLM analyzes results -> may issue another query (up to 5 rounds)
  |
LLM composes final response with evidence citations
```

#### Character Profile Generation

Given figure_id, retrieve historical_figure + unit records from CDM, pull all history_events involving that figure (sorted chronologically), pull relationship graph (2 hops), pull artifacts created or held, assemble structured "character brief", vector similarity search for thematically related events/figures, inject into LLM with persona prompt.

#### Voice Emulation

Use unit's `soul_data` (traits, beliefs, goals, needs) to derive a personality description. Map DF trait scores to narrative personality dimensions.

#### Event Rendering Pipeline

Standard pattern: `Event (typed struct) -> Context (current entity perspective) -> Template (per-type prose) -> HTML (with entity links)`

Chronicler with LLM: `Event (CDM row) -> Context (target entity + related entities) -> LLM prompt (with event type template) -> Narrative (with entity references marked for linking)`

#### Perspective-Aware Rendering

When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns. Requirement: Implement perspective-aware narrative generation.

#### Death Cause Rendering (50+ variants)

Complete death cause taxonomy with specific prose per cause: OLD_AGE, SHOT, BLEED, DROWN, SUFFOCATE, MAGMA, DRAGONFIRE, CAVEIN, DRAWBRIDGE, BEHEAD, CRUCIFY, BURN_ALIVE, HACK_TO_PIECES, DRAIN_BLOOD, LEAPT_FROM_HEIGHT, INFECTION, and 35+ more. Each death includes weapon info, slayer identity with race, and age at death.

#### Entity Importance Scoring (df-narrator canonical)

**Figure Importance Score**:
- Events: `min(event_count * 2, 500)`, Kills: `kill_count * 15`, VAMPIRE: +80, NECROMANCER: +100, DEITY: +120, FORCE: +90, MEGABEAST: +70, HF-to-HF relationships: `min(hf_link_count * 3, 100)`, Leadership positions: `count * 20`, Artifacts held: `artifact_count * 30`, Deity spheres: `sphere_count * 10`, Skills: `min(skill_count * 2 + max_ip // 5000, 80)`, Site associations: `min(site_link_count * 5, 50)`, Entity links: `min(entity_link_count * 3, 60)`, Death recorded: +5

**Site Importance Score**: `event_count + (death_count * 2) + (event_collection_count * 5) + (structure_count * 3)`

**Conflict Importance Score**: `(deaths * 3) + (battle_count * 10) + (sites_involved * 5) + duration_years`

**Artifact Importance Score**: `(events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named`

#### Rivalry Detection (co-appearance)

Scan all events mentioning a figure's hfid; count co-appearances of other figure IDs. Compute top-10 rivals per figure. Lightweight but effective narrative technique.

#### DF Calendar Utility

```python
# seconds72 -> calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

months = ["Granite", "Slate", "Felsite",      # Spring
          "Hematite", "Malachite", "Galena",   # Summer
          "Limestone", "Sandstone", "Timber",  # Autumn
          "Moonstone", "Opal", "Obsidian"]     # Winter

season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```

### 3.4 AI Dwarf Fortress Player (Fortress Advisor)

#### Tick-Based Polling / Advisory Cadence (from df-ai)

- Every 25 game ticks: population alerts (new arrivals, deaths, stalled jobs, nobles, crimes).
- Every 100 ticks: stockpile status, production queue, farm/metal status.
- Every 240 ticks: construction status, room lifecycle completion.
- Every 1,200 ticks (1 DF day): full fortress health summary.
- Every 403,200 ticks (1 DF year): annual review / year-in-summary.
- 500-tick polling rate (~12 seconds) validated by myDFHackScripts.

DF timing constants: 1 DF year = 403,200 ticks. 1 DF day = 1,200 ticks.

#### Ten-Phase Population Update Cycle

Phase 0: Trading management; Phase 1: Citizenlist update; Phase 2: Noble assignment; Phase 3: Job unsuspend; Phase 4: Military management + crime review; Phase 5: Pet management; Phase 6: Dead unit handling; Phase 7: Caged unit management; Phase 8: Location occupations; Phase 9: Emit population event JSON.

#### Three-Tier Stock Threshold Model

Needed (absolute floor), NeededPerDwarf (scales per 100 dwarves), WatchStock (monitor only), AlsoCount (count for context). ~100 named stock item categories.

#### Advisor Subsystems

- **Room Type Taxonomy** (22 types): corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop.
- **Construction State Machine**: `plan -> dig -> dug -> finished`.
- **Priority-Driven Construction Sequencing**: JSON-driven priority filter system.
- **Blueprint / Floor Plan System**: Parse df-ai's JSON blueprint format.
- **Military Sizing Advisor**: 25-75% of citizen count, draft pool eligibility, squad size scaling.
- **Noble Assignment Advisor**: Track noble requirements, room value validation, conflict detection.
- **Trade Advisor**: Full caravan->broker->trade->counter-offer cycle.
- **Farm Management Advisor**: Biome-aware crop selection, season rotation.
- **Metalworking Production Chain Advisor**: ore -> bars -> equipment chain, stall detection.
- **Pet Management Advisor**: Detect capabilities, pasture assignment.
- **Occupation / Location Assignment Advisor**: Tavern, library, temple roles.
- **Justice and Crime Monitoring**: Scan `world->crimes`.
- **Fortress Loss Detection**: Monitor for fortress-loss messages, generate post-mortem narrative.
- **Job Stall Detection and Auto-Unsuspend**: Scan non-repeating suspended jobs.
- **Baby Reunification Bug Workaround (DF Bug 5551)**: Detect baby/mother separation.
- **Ore Vein Discovery and Mining Advisor**: `list_map_veins()`, `dig_vein()`.
- **Cistern and Water Supply Advisor**: Reservoir, well, lever connection tracking.

#### Reactive Control Architecture Philosophy

df-ai has no explicit goal tree. Five independent invariant-maintenance loops polling at different rates. Chronicler's LLM advisor should adopt the same: "current state deviates from desired state by X -- recommended corrective action is Y."

#### LLM Action Chain / Exclusive Callback Analogy

Maintain one active action chain at a time. Queue pending actions in FIFO order. Strict serialization prevents DF UI conflicts.

### 3.5 Dwarf Fortress Mod Manager

#### Core Mod Manager (MVP)

- **Mod discovery via filesystem scan**: Scan `<DF_dir>/Mods/`, `data/vanilla/`, `data/installed_mods/` for `info.txt` files.
- **DFHack live mod discovery**: Via `reqscript` to call `manager.get_modlist_fields()`.
- **info.txt parser**: Full token-based parser supporting all v50 fields.
- **Modpack CRUD backed by mod-manager.json**: Create, rename, delete, set-default, import/export.
- **Load order management**: Drag-and-drop reordering. Enforce header load order.
- **Mod browser with search/filter**: Dual-pane view (available/disabled vs. enabled).
- **Undo to last saved state**: Track unsaved changes.
- **Profile import/export**: Full JSON import/export.

#### Conflict Detection System

- **Level 1 -- Metadata conflict detection** (O(n)): Duplicate mod IDs, CONFLICTS_WITH_ID, REQUIRES_ID violations, version incompatibility.
- **Level 2 -- Object ID conflict detection** (O(n x m)): Parse all `objects/*.txt`, build object-to-mod map, flag duplicates. CRITICAL: Duplicate object IDs cause silent offset corruption.
- **Level 3 -- Semantic conflict detection** (expensive): Full DF-Modloader compiler pipeline.
- **Visual conflict indicators**: Color-code mods by status.
- **Three-way merge conflict detection** (PyLNP pattern): Line-based merge with vanilla baseline.
- **LOOT-style auto-order** (long-term): Topological sort of mod dependency graph.

#### Raw File Parsing and Analysis

- Raw file tokenizer (DF-Modloader canonical state machine): `COMMENTS -> TOKEN -> ARGS`.
- Object type catalog: 18 DF super-types.
- SELECT/CUT token detection with sub-object selectors.
- Raw visual diff viewer.

#### Advanced Mod Management (Long-term)

- Full raw compiler (DF-Modloader pattern): EDIT, OBJECT_TEMPLATE, USE_OBJECT_TEMPLATE, REMOVE_OBJECT.
- Legacy mod migration tool (SyntaxUpdater pattern).
- Modpack content discovery.
- Virtual file system isolation (Mod Organizer 2 pattern).
- Steam Workshop integration.

#### Modpack History and Audit

- DB schema for modpack state per world/event.
- Modpack snapshot at world creation.
- Mod annotation in legends display.

### 3.6 Dwarf Fortress Labor Manager

- Full unit soul data extraction: complete skill set, preferences, personality, performance skills.
- Soul personality snapshot: `unit_personality` including mannerisms (70+), values, ethics, thought history.
- Citizen roster tracker with configurable polling intervals.
- Unit metadata extraction: race, age, sex, names.
- Labor assignment advisor using personality and skill data.
- Dwarf Therapist 29-section memory layout shows data scope (but all accessible via DFHack Lua `df.global.*` paths instead).

### 3.7 Knowledge Horizon -- Dynamic Database Masking

#### Core Concept

The Knowledge Horizon limits the LLM's effective search space within the Chronicler database. Instead of exposing all ~1.65M CDM records across 35 tables, the mask exposes only data relevant to the fortress and its inhabitants. The mask grows organically as in-game conditions change.

#### Masking Dimensions

**Geographic Scope**: Always visible: fortress region + adjacent. Revealed by: migrants, caravans, raids.
**Civilization Scope**: Always visible: parent civilization structure. Revealed by: diplomatic contact, wars, raids.
**Individual Scope**: Always visible: all fortress inhabitants + direct family. Revealed by: arrival, family connection, organizational overlap.

#### Visibility Caveats (7 Rules)

**CAV-001**: Organization Membership Propagation -- Cults: full visibility. Military Squads: squad-mates and chain of command. Guilds: same-site members. Religious Orders: nearby site worshippers. Civilization (broad): NO full propagation.

**CAV-002**: Civilization Nobles and Administrators -- Always visible: civilization-level nobles, administrators, law-givers, military commanders.

**CAV-003**: Previous Residence Knowledge -- Dwarf carries knowledge of all inhabitants of previous residences.

**CAV-004**: Starting Dwarf Background Generation -- The initial 7 dwarves exist only as units, not as entries in legends data. Proposed heuristic: check relationships, assign parentage, assign previous residency, generate synthetic entries with `source = 'inferred'`.

**CAV-005**: Family Chain Propagation -- Depth 1 (spouse, children, parents): Always visible. Depth 2 (siblings, grandparents, in-laws): Visible if alive. Depth 3+: Masked unless another caveat reveals them.

**CAV-006**: Event-Based Revelation -- War declaration, caravan arrival, migrant wave, raid/expedition return, artifact acquisition each reveal specific data.

**CAV-007**: LLM Inference Restrictions -- Do NOT infer events or relationships not present in unmasked data. Treat the Knowledge Horizon as an in-world limitation.

#### Knowledge Horizon -- Phased Rollout Plan

| Phase | Scope | When |
|-------|-------|------|
| Phase 1 | Denizen registry as starting point | Immediate |
| Phase 2 | View-based masking for HFs (visible if denizen or 1-hop) | After Phase 1 |
| Phase 3 | Geographic masking | After Phase 2 |
| Phase 4 | Full Knowledge Horizon with 7 caveats | Long-term |

#### Database Architecture

**Preferred**: View-Based Masking using PostgreSQL views that filter through a `visibility` predicate.

```sql
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT hf_id FROM knowledge_horizon WHERE visible = true);
```

**Alternative**: Materialized Subset -- copy visible rows into shadow tables. Start with views; add materialized views if performance degrades at 60K+ HFs.

### 3.8 Monitoring & Observability System

#### Interaction Logging

Log every LLM interaction with: `query`, `world`, `keywords`, `context_stats`, `model`, `temperature`, `tokens_streamed`, `response_chars`, `status`, `error`. Four-phase latency: context retrieval, TTFT, LLM streaming, total wall time. Zero user-facing latency impact.

#### Monitoring Dashboard (`/monitoring`)

Summary cards, recent interactions table, click-to-expand detail, auto-refresh every 30 seconds.

#### Three JSON API Endpoints

- `GET /api/monitoring/interactions?limit=50&world_id=N`
- `GET /api/monitoring/interactions/{id}`
- `GET /api/monitoring/summary`

---

## 4. Common Data Model & Database Schema

### 4.1 CDM Core Tables

```sql
-- World container
world(id, name, altname, year_current, year_began, params_json)

-- Geography
region(id, world_id, name, type, coords_json, evilness)
site(id, world_id, name, type, coords, rectangle, owner_entity_id, civ_id)
structure(id, site_id, name, type, deity_id)

-- Civilizations & Factions
entity(id, world_id, name, type, race, parent_entity_id)
entity_position(entity_id, figure_id, title, start_year, end_year)

-- People & Creatures
historical_figure(id, world_id, name, race, caste, born_year, died_year,
                  killed_by_hfid, entity_links_json, soul_data_json)
unit(id, world_id, figure_id, name, race, caste,
     site_id, pos_x, pos_y, pos_z,
     skills_json, labors_json, attributes_json,
     personality_json, beliefs_json, goals_json,
     relationships_json, mood, stress_level, updated_at)

-- History
history_event(id, world_id, year, seconds72, type,
              site_id, region_id, entity_id, figure_ids_json, details_json)
history_collection(id, world_id, type, start_year, end_year,
                   name, event_ids_json)

-- Objects
artifact(id, world_id, name, item_type, material,
         creator_hfid, current_holder_hfid, holder_history_json)

-- Linguistic
language(id, world_id, name)
word(id, language_id, word, translation, part_of_speech)

-- Worldgen monitoring
worldgen_snapshots(world_name, seed, state_id, state_name, snapshot_ts,
                   figure_count, event_count, era_count, civ_count,
                   civs_left, rivers_cur, rivers_total, rampage_num,
                   num_rejects, entity_count, site_count, landmass_count,
                   river_count, geo_biome_count, snapshot_num)
worldgen_params(seed, title, dim_x, dim_y, end_year, total_civ_number,
                megabeast_cap, semimegabeast_cap, titan_number, demon_number)
```

### 4.2 CDM Vector Tables (pgvector)

- `figure_embeddings` -- biography chunks -> 2560-dim vectors
- `event_embeddings` -- event narratives -> 2560-dim vectors
- `artifact_embeddings` -- artifact histories
- `site_embeddings` -- site histories

Embedding generation: qwen3-embedding:4b via Ollama, 2560-dim.

### 4.3 Unit-Historical Figure Data Model

#### Linkage Mechanism

- `units.hist_fig_id` -> `historical_figures.id` (within same `world_id`).
- Not all units have HF records (born after legends export date).
- Not all HFs have unit records (dead, off-map, or non-fortress entities).

#### Overlapping Fields

| Field | Unit Source | HF Source | Authoritative |
|-------|-------------|-----------|---------------|
| Name (Dwarvish) | `units.name` | `historical_figures.name` | Unit (live) |
| Race | `units.race` | `historical_figures.race` | Either |
| Birth year | `units.birth_year` | `historical_figures.birth_year` | HF (canonical) |
| Alive status | `units.is_alive` | `death_year IS NULL` | Unit (real-time) |
| Relationships | `units.details.relationships` (9 slots) | `hf_links` table | HF (comprehensive) |

#### Unit-Only Fields

Profession, Position (x,y,z), Skills, Labors, Personality traits (50 facets), Values, Needs, Dreams/goals, Physical attributes (6), Mental attributes (12+), Stress level, Mood, Squad, Old year (lifespan), Cultural identity.

#### HF-Only Fields

Kill count, Event count, Type flags (6 boolean), Identities, Site links, Spheres, Written works, Reputation.

#### Unit-HF Merge Strategy (6 Rules)

1. Start with Unit data (always fresher).
2. Overlay HF data for historical depth.
3. For conflicts: prefer Unit for real-time; prefer HF for historical facts.
4. Personality data is Unit-only.
5. Event history from TWO sources, distinguished by `live_generated` flag.
6. Embark dwarves with no HF: flag `embark: true`.

#### Unified Person Schema (JSON for LLM)

```json
{
  "name": "Urist McHammer", "english_name": "Suntin", "race": "Dwarf",
  "caste": "Female", "birth_year": 23, "age": 127, "is_alive": true,
  "profession": "Legendary Miner", "civilization": "The Dagger of Feasting",
  "relationships": [{"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345}],
  "personality": {"notable_traits": ["Very brave"], "values": ["Family"], "unmet_needs": ["Socialize"], "dreams": ["Start a family (accomplished)"]},
  "positions_held": [{"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}],
  "skills": [{"name": "Mining", "level": 20, "label": "Legendary"}],
  "key_events": [{"year": 45, "type": "slew", "description": "Slew a forgotten beast"}],
  "sources": {"unit_id": 567, "hf_id": 12340, "world_id": 8}
}
```

### 4.4 Database Schema -- Key DDL

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
    departure_cause TEXT,
    narrative_value FLOAT DEFAULT 0.0,
    last_seen_tick  INT,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, unit_id),
    UNIQUE (world_id, hf_id)
);
```

#### `knowledge_horizon` Table

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
```

#### Additional Tables

- `storyteller_log`: query, world, keywords, context stats, model, latency phases, etc.
- `unit_events`: Change events (ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED).
- `sync_snapshots`: Per-run metadata for each polling cycle.
- `lua_probes`: Stored results of Lua probe calls with timestamps.
- `written_contents`: composite PK (world_id, id), title, author_hf_id, type, form_id, year, details JSONB.
- `historical_eras`: composite PK (world_id, id), name, type, start_year, end_year.

#### Column Additions to Existing Tables

```sql
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS embark BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```

### 4.5 CDM Entity Coverage & Gaps

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | Chronicler CDM |
|---|---|---|---|---|---|
| Historical Figures | Full | Full | Full | Scored subset | Full |
| Sites | Full | Full | Full | Scored subset | Full |
| Entities (Civs) | Full | Full | Full | Name only | Full |
| Artifacts | Full | Full | Full | Scored subset | Full |
| Regions | Full | Full | Full | No | Full |
| Structures | Full | Full | Full | No | Full |
| World Constructions | Full | Full | Partial | No | **Missing** |
| Written Content | Full | Full | Partial | No | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | **Missing** |
| Identities | Full | Full | No | No | **Missing** |
| Rivers | Full | Stub | No | No | **Missing** |

Required New CDM Entity Types: `WorldConstructions`, `ArtForms` x 3, `Identities`, `Rivers`, full `Entity Populations` extension.

### 4.6 Reference Taxonomies

**Site Types** (24 distinct): Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress, Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery, Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace, Ruins, Shrine, Tomb, Tower, Town, Vault.

**Entity Types** (15): Civilization, Site Government, Nomadic Group, Migrating Group, Religion, Military Unit, Guild, Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang, Outcast, Semi-Megabeast, Mega-Beast, Unknown.

**HF Relationship Types (comprehensive)**:
- HF-to-HF: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner
- HF-to-Entity: Member, Former Member, Mercenary, Slave, Prisoner, Enemy, Criminal, Position, Former Position, Occupation, Squad
- HF-to-Site: Lair, Home Site, Seat of Power, Hangout, Occupation, Prison

---

## 5. Data Extraction & Ingestion Pipeline

### 5.1 Legends XML Parsing

#### Sections Currently Parsed (8 of 14+)

`<sites>`, `<artifacts>`, `<historical_figures>`, `<entities>`, `<historical_events>`, `<historical_event_collections>`, `<landmasses>` (legends_plus), `<mountain_peaks>` (legends_plus).

#### Additional Legends Data Targets

- **Written Contents**: title, author HF ID, year, type, form, references. Phase 3.2.
- **Historical Eras**: name, type, start/end year. Phase 3.3.
- **Regions and underground regions**: terrain types, evilness. Phase 3.1.
- **World constructions**: bridges, roads, tunnels.
- **Entity populations**: Phase 3.4 (optional).
- **Art forms**: poetic, musical, dance. Phase 3.5 (lowest priority).
- **Rivers**: geographic paths.
- **Creature raw**: creature definitions.
- **Structures within sites**: temples, libraries, keeps.
- **Site properties**: individual parcels, owner HF.
- **Owner history per site**: `OwnerPeriod` records.

#### Historical Figure Sub-Profiles (high storytelling value, not currently extracted)

Kill profile, wound history, skill history, personality (50 traits, 32 values, beliefs, goals, mannerisms 70+ types, ethics, thought history 80+ categories), whereabouts, reputation (hero, murderer, psychopath, etc.), known secrets, life goal, active interactions, lineage curse parent, BreedId, adventurer flag, current geographic state, notable kills, dedicated structures, intrigue actors/plots, orientation flags, worldgen flags, journey pets, masterpieces.

#### XML Parsing Architecture

All approaches agree: use streaming parsers for large legends XML files. Python ETL should use `iterparse` with `root.clear()` after each element.

**Dual-File Merge**: LegendsViewer-Next merges by matching `id` fields. Plus parser runs in single sequential pass.

**Post-Parse Processing Pipeline** (must adopt):
1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores

**Control character filtering**: DF XML output contains raw control characters. `FilteredStream` wrapper replaces all bytes < 32 with spaces. IBM CP473 legacy characters require conversion.

### 5.2 Live Bridge (chronicler-bridge.lua)

- Runs as DFHack `repeat` job every 100 ticks
- Writes comprehensive game state to `chronicler-state.json`, served over HTTP on port 8888
- **Current state (v6)**: 16 sections, 7 data domains, 922 lines Lua
- Invocation: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
- Bridge file: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

#### Data Domains Captured

`game_time`, `creature_raws`, `unit_summary` (12 fields + flags + mood + emotions), `armies`, `buildings`, `artifacts`, `announcements` (cursor-based, 200/tick), `diplomacy`, `history` (cursor-based, 100/tick), `world_info`, `entities`, `dwarf_skills`, `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `crimes`.

#### Unit Data Not Yet Captured

Health wounds, inventory/equipped items, `birth_year`/`old_year`, `relationship_ids[9]`, `following`, full personality needs/memories/preferences vectors.

#### World Structures Not Yet Captured

`world.activities`, `world.written_contents.all`, `world.jobs.list`, `world.manager_orders`, `world.items.all` (HIGH performance risk), `world.plants.all`, `world.interactions`, `world.identities`, `world.occupations`, `world.belief_systems`.

#### Bridge Enhancement Requirements

1. Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, UNIT_NEW_ACTIVE, SYNDROME)
2. Death cause enrichment via incidents
3. Parent/family chain
4. Book detection
5. Incident system for crime/death narrative

### 5.3 DFHack Integration & Lua Paths

#### Key Lua Globals

- `df.global.cur_year`, `df.global.cur_year_tick`, `df.global.pause_state`
- `df.global.ui` -- fortress UI state
- `df.global.world` -- units, items, buildings, jobs, history, crimes
- `df.global.plotinfo.main.fortress_site.name` -- current fortress name
- `df.global.world.world_data.name` -- world name

#### Key DFHack Lua Modules

- `dfhack.units.isCitizen()`, `isDead()`, `isSane()`, `getRaceName()`, `getAge()`, `getReadableName()`
- `dfhack.buildings.constructBuilding()`
- `dfhack.items.getBookTitle(item)`, `getDescription(item, 0)`, `getValue(item)`
- `dfhack.translation.translateName(name_compound)`
- `dfhack.world.ReadCurrentDay()`, `ReadCurrentMonth()`, `ReadCurrentYear()`

#### DFHack State Change Events

```lua
SC_WORLD_LOADED = 0, SC_WORLD_UNLOADED = 1, SC_MAP_LOADED = 2, SC_MAP_UNLOADED = 3,
SC_VIEWSCREEN_CHANGED = 4, SC_CORE_INITIALIZED = 5, SC_PAUSED = 7, SC_UNPAUSED = 8
-- NOTE: No SC_WORLDGEN_STARTED or SC_WORLDGEN_TICK -- must poll
```

#### Eventful Event Types (Complete List)

`TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE, UNIT_DEATH, ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION, INVENTORY_CHANGE, REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX`

#### Death Cause Resolution Algorithm

```lua
function Helper.getIncidentDeathCauseByVictimId(unit_id)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death
           and incident.victim == unit_id then
            return df.death_type[incident.death_cause], incident.criminal
        end
    end
    return nil, nil
end
```

### 5.4 Worldgen Monitoring

No existing tool monitors worldgen in real time.

#### `world_generatorst` State Machine

| Value | Name | Key Data Being Written |
|-------|------|----------------------|
| -1 | None | (pre-generation) |
| 0 | Initializing | (setup) |
| 1 | PreparingElevation | elevation grid |
| 2 | SettingTemperature | temperature/rainfall |
| 3 | RunningRivers | rivers_cur/total |
| 4 | FormingLakesAndMinerals | geo_biomes, underground_regions |
| 5 | GrowingVegetation | region vegetation |
| 6 | VerifyingTerrain | world rejection check |
| 7 | ImportingWildlife | entity_populations |
| 8 | RecountingLegends | history events/figures (bulk write) |
| 9 | Finalizing | civ placement, site naming |
| 10 | Done | all vectors complete |

#### Worldgen Access Paths (Verified for DF 53.10-r1)

```lua
local ws = df.global.world.worldgen_status
local state_val = ws.state
local parms = df.global.world.worldgen.worldgen_parms
-- Rivers, civs, rampages, rejection counters, phase completion flags
-- Live access to world.history.figures/events/eras as they populate
-- Geography via pcall(function() return df.global.world.world_data end)
```

#### worldgen-bridge.lua Reference Implementation

Deploy: `repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]`

Complete implementation captures: state, seed, world_title, dimensions, all progress counters, geography counts, new events since last poll (cursor-based, capped at 50).

#### Completion Detection

Three conditions: (1) `state == 10`, (2) `#world.entities.all > 0`, (3) `viewscreen_new_regionst.simple_mode == 0`.

### 5.5 Event Type Taxonomy

#### Authoritative Count: 141 Total Canonical Types

- 133 from df-structures `history_event_type` enum (excluding `NONE = -1`)
- 8 additional types added in the DF 50.x Steam release

Coverage: LegendsBrowser2 handles 122; LegendsViewer-Next 115+; weblegends 94; Chronicler DB observes 97 types in world 8.

#### Chronicler Strategy

Store all event types as TEXT column (no DB enum). Raw data in `details` JSONB. Agentic storyteller handles all via LLM interpretation. Narrative templates for 122 LB2-handled types, graceful LLM fallback for remaining 19.

(Full event type tables by category preserved in Appendix A.)

---

## 6. Infrastructure & Dev Environment

### 6.1 Runtime Environment

**UTM Win11 VM (primary DF runtime)**:

| Component | Detail |
|-----------|--------|
| VM identity | `DF-Windows` / `WIN-MRGFUCCV202` / `192.168.64.3` / Windows 11 Pro ARM 64-bit (10.0.26200) |
| DF Version | 53.10 + DFHack 53.10-r1 |
| Data Transport | `dfhack-run` over SSH (primary); HTTP bridge port 8888; TCP RPC broken for game-thread calls |
| SSH Key | `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control) |
| SSH user | `Chronicler` |
| File Transfer | HTTP file server port 8889 (~105 MB/s) or SCP (~19 MB/s, `-O -T` flags); Guest Agent emergency-only (~0.24 MB/s) |
| World (live) | "The Land of Dawning" -- year 250, 257x257 |
| VM scripts | `projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh` |

**HomeServer (physical PC, secondary DF environment)**:

| Component | Detail |
|-----------|--------|
| Host | Windows 10 Pro x86_64 at `192.168.4.194`, machine name `WIN-48L3R2QLQN0` |
| DF/DFHack | 53.10 / 53.10-r1 on x86_64 |
| DFHack RPC | TCP port 5000; firewall open |
| RemoteFortressReader | NOT AVAILABLE on 53.10-r1 |
| User / Pass | Nathaniel / DwarfF0rtress. RDP enabled. |

**Development Machine / DB / Web UI**:

| Component | Detail |
|-----------|--------|
| DB | PostgreSQL `chronicler` on localhost:5432 (CDM schema, 109K records) |
| Web UI | `localhost:8080`, SSE streaming from Qwen3-8B via LiteLLM |
| MLX Embedding Server | `localhost:8000` -- Qwen3-Embedding-4B, 2560-dim |
| Qdrant | `localhost:6333` |

**Critical TCP RPC status**: Broken for game-thread calls on DFHack 53.x under Prism. Only cached calls work. Use `dfhack-run` over SSH.

### 6.2 VM Automation Phases

#### Phase 0 Pre-Work -- COMPLETE

All `vm-config.sh`, `vm-lifecycle.sh` (19 commands, 451 lines), `vm-bootstrap.sh` (343 lines) created and tested. SSH key generated, disk UUID auto-detected, OS confirmed.

#### Phase 0 Pending

- [ ] SSH key-based auth working from Mac (pending: run `vm-bootstrap.sh`).

#### Phase 1 (DF + DFHack Risk Validation) -- NOT STARTED

Critical risk: DF is x86-64 only, running under double emulation (Prism + QEMU). Phase 1 is make-or-break gate.

#### Phases 2-5

Phase 2: Automation Stack scripts. Phase 3: Full Integration. Phase 4: HomeServer SSH Enhancement. Phase 5: Platform Decision + Windows App Foundation.

### 6.3 VM Scripts

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

Existing: `vm-config.sh`, `vm-lifecycle.sh`, `vm-bootstrap.sh`.
To create: `vm-install-df.sh`, `vm-test-rpc.py`, `vm-ssh.sh`, `vm-deploy.sh`, `vm-dfhack-cmd.sh`, `vm-service-manager.sh`, `vm-deploy-all.sh`, `vm-watch.sh`.

### 6.4 macOS Development Environment

| Method | Cost | Apple Silicon | Performance | DFHack Support |
|--------|------|--------------|-------------|----------------|
| CrossOver | ~$74/yr | Yes | Best | Yes (manual) |
| Parallels + Windows ARM | ~$100/yr | Yes | Good | Yes (native) |
| UTM + Windows ARM | Free | Yes | Good | Yes (native) |
| Wineskin Winery | Free | Yes | Moderate | Possible |

### 6.5 RAG / Semantic Search Knowledge Base

Target collections: dfhack ~8,700 pts, dwarf-therapist 926 pts, df-ai ~1,500-2,000, weblegends ~3,000-4,000, df-structures ~2,000-3,000, df-narrator ~300-500, dfhack-client-python ~100-200, df-wiki ~5,000-8,000.

Total target: ~21,000-27,000 points.

---

## 7. UI/UX Design & Implementation

### 7.1 Complete World Browser

From LegendsViewer-Next: 70 routes (35 list + 35 detail view pairs), 8 navigation groups: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals.

### 7.2 Historical Figure Detail Pages

**Identity and Status**: Native + English name, race, caste, sex, birth/death, type flags (deity/force/vampire/werebeast/necromancer/adventurer/ghost/leader), spheres, goals, kill count, age at death, importance score, orientation flags, worldgen flags, current geographic state.

**Family Tree**: Cytoscape.js dagre or SVG family tree. Multi-generation genealogy up to 3 generations up, all down. Click navigation. Two sizes.

**Curse Lineage Tree**: For vampires/werebeasts: "who bit whom" tree.

**Related Figures**: All relationship types with sex-specific labels. Deity worship strength. Vague relationships. Intrigue actors.

**Related Entities**: member, former_member, mercenary, slave, prisoner, enemy, criminal. Positions with titles. Squad links. Occupation roles.

**Full Event History**: Paginated (1000 events/page), perspective-aware rendering.

### 7.3 Entity (Civilization/Group) Pages

Tabs: Leaders, Sites, Members, Groups, Wars. Mini-map, D3 War Chord Diagram, entity type icons, warfare graph.

### 7.4 Site Pages

Tabs: Structures, Properties, History. Map, populations, inhabitants, artifacts, ownership.

### 7.5 Event Collection Pages

Collection hierarchy: wars contain battles/sieges, battles contain individual events. All levels navigable. War maps with battle markers.

### 7.6 Additional Pages

Artifact pages with chain-of-custody. Written content pages. Art form pages. Geography pages (regions, underground regions, landmasses, mountain peaks, rivers, world constructions). Identity pages. Years and events browser.

### 7.7 UI Framework Patterns

- SPA: Vuetify 3 + Vue 3 + Vue Router. Generic list/detail page patterns. ExpandableCard pattern.
- REST API: Paginated GET endpoints. Response: `{ items: [...], totalCount: N }`.
- Frontend data flow: Pinia stores per entity type.
- 8 navigation groups with tab URL hash persistence.
- Bootstrap 5 dark mode, responsive layout.

### 7.8 Multi-World Architecture

Composite primary key requirement (BUG-007 resolved). Multi-world bookmark system with file-based bookmark store and thumbnails.

### 7.9 Packaging & Distribution

- Docker Compose, one-command world import, auto-detection of DF installation
- DFHack integration packaging: single Lua script
- Community release: GitHub, Bay 12 Forums, Reddit
- Windows app: PyInstaller -> `chronicler.exe`, embedded PostgreSQL or SQLite, bundled Ollama + Qwen3-1.7B, `pystray` system tray, NSIS/Inno Setup installer

---

## 8. Reference Tool Analysis

### 8.1 df-narrator (Python XML entity scoring)

| Feature | Status | Notes |
|---------|--------|-------|
| Figure importance scoring | Reference | 4-formula system, well-calibrated |
| Site/Conflict/Artifact scoring | Reference | Deaths, collections weighted higher |
| Rivalry detection (co-appearance) | Reference | Top-10 rivals per figure |
| HF_FIELDS canonical list | Reference | All XML HF-reference fields |
| Calendar conversion formula | Reference | sec -> month/day/year |

Source: `/Users/nathanielcannon/Claude/GitRepos/df-narrator/`

### 8.2 weblegends (C++ DFHack plugin, live in-game HTML server)

| Feature | Status | Notes |
|---------|--------|-------|
| 94 event type handlers | Adapt | LB2's 132 is more complete baseline |
| Context-aware event rendering | Must adopt | `event_context` pattern critical |
| Hover popovers | Must adopt | Critical UX feature |
| Zombie handling | Must adopt | curse.original_histfig_id |
| Name translation `<abbr>` | Must adopt | Native/English display |
| Entity categorization | Must adopt | 11 entity type labels |
| Current inhabitant data (nemesis records) | Must adopt | DFHack only |
| Interaction text from raws | Must adopt | hist_string_1/2 |

Source: `/Users/nathanielcannon/Claude/GitRepos/weblegends/`

### 8.3 LegendsBrowser v1 (Java, DF 0.44)

| Feature | Status | Notes |
|---------|--------|-------|
| SVG Family Tree | Must adopt | Signature feature, not in LB2 |
| Curse Lineage Tree | Must adopt | Unique, high narrative value |
| D3 chord diagram (wars) | Must adopt | Best civ-war overview |
| D3 population donut | Must adopt | At-a-glance demographics |

Source: `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/`

### 8.4 LegendsBrowser2 (Go, DF 0.47, most complete)

| Feature | Status | Notes |
|---------|--------|-------|
| 132 event types | Must adopt | Complete baseline |
| Post-parse processing pipeline | Must adopt | Ruin tracking, kill lists |
| Season display in timestamps | Must adopt | "early spring of 125" |
| Popover endpoints | Must adopt | /popover/{type}/{id} |
| Leaflet world map | Must adopt | Centerpiece visualization |

Source: `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/`

### 8.5 LegendsViewer-Next (C#/.NET/Vue3)

| Feature | Status | Notes |
|---------|--------|-------|
| 70-route world browser | Must adopt | Complete coverage |
| Interactive Leaflet map | Must adopt | DF-specific coordinates |
| Streaming XML parser | Must adopt | FilteredStream for control chars |
| Multi-world bookmark system | Must adopt | File-based with thumbnails |
| O(1) entity lookup optimization | Must implement | Fast path + Dictionary |
| ExpandableCard pattern | Must adopt | Compact/expanded toggle |

### 8.6 df-ai (C++ autonomous fortress player)

All 20+ advisor subsystems must be adopted for the Fortress Advisor component. Key: tick-based multi-rate polling, 10-phase population cycle, three-tier stock threshold, room/construction/military/trade/farm/metalwork/pet/occupation/justice/loss detection advisors, reactive control architecture.

### 8.7 Other Reference Tools

**dfhack-client-python**: RPC protocol reference. CRITICAL: TCP RPC broken under Prism. Use `dfhack-run` over SSH.

**df-structures**: Canonical CDM data dictionary. 144 `history_event_type` variants. HF profile pointer bag (13 sub-pointers). Key files: df.unit.xml, df.soul.xml, df.history_figure.xml, df.history_event.xml, df.entity.xml, df.site.xml, df.world.xml, df.region.xml.

**myDFHackScripts**: Module architecture, generic watcher factory, death cause lookup, enum resolution, 500-tick polling rate.

**DwarvenSurveyor**: XML streaming parser, region terrain types, coordinate parser for legends data.

**DF-Modloader**: Raw compiler pipeline, EDIT/OBJECT_TEMPLATE/USE_OBJECT_TEMPLATE/REMOVE_OBJECT support, RawObject data model.

**ModHearth**: DFHack-integrated GUI mod manager, conflict detection algorithm, mod-manager.json schema.

**PyLNP/PyDwarf**: Three-way merge, doubly-linked token model for raw editing.

---

## 9. Data Quality & Gap Analysis

### 9.1 Critical Bugs (All Fixed)

- **BUG-005 (kill_count)**: Fixed -- changed grouping from victim to killer. 8,680 figures updated, max 3->146.
- **BUG-007 (multi-world collision)**: Fixed -- all 13 tables migrated to composite PK.
- **BUG-006 (link table duplicates)**: Fixed -- UNIQUE constraints added, 4,679 rows deduped.
- **BUG-008 (region parsing scope)**: Fixed -- scoped to `regions/region`.
- **BUG-001 (boolean flags)**: Fixed -- detection via spheres, interactions.
- **BUG-003 (site ownership)**: Fixed -- parse `cur_owner_id` from legends_plus.

### 9.2 Remaining Data Integrity Requirements

- **BUG-002 (multi-participant events truncated)**: Events with 10+ participants store only first two HF IDs. Design decision pending: JSONB array vs. junction table.
- **Control character filtering**: Verify current xml_parser.py handles this.
- **lua_probes cleanup**: Retention policy implemented (every 10 cycles).
- **Bridge health monitoring**: Implemented (warn after 3 failures).

### 9.3 Polling Timing Risk Matrix

| Event Category | Risk of Missing |
|----------------|-----------------|
| Marriage, Strange mood, Tantrum, Mandate, Crime, Noble appointment | HIGH (now partially mitigated) |
| Outside-world war event, Loyalty cascade | HIGH |
| Forgotten beast arrival, Intermediate states | MEDIUM |

### 9.4 Test Coverage

131 tests passing in 0.19s across 4 test files: `test_xml_parser.py` (26), `test_context.py` (30), `test_detector.py` (29), `test_schema.py` (46).

---

## 10. Phase-by-Phase Development Plan

### 10.1 Version Milestones

| Version | Phases | State |
|---------|--------|-------|
| v0.8 | Baseline + Gap Closure | CURRENT |
| v0.9 | Phases 1-2 | Database tracks every fortress being; embark dwarves have HF records; deaths generate events |
| v1.0 | Phases 1-4 | Agentic storyteller; fortress-centric explorer; browsable event timeline; initial Knowledge Horizon |
| v1.5+ | Phase 5+ | Proactive narrative; full KH; interactive maps; family trees |

### 10.2 Phase 1: Denizen Registry + Death Detection (6-8 hrs, PLANNED)

All prerequisites satisfied. `fortress_denizens` table with NVS computation, death detection (4 mechanisms: flag, absence, announcement, history event), embark detection, HF linking.

Verification: 10 checklist items + 12 new tests.

### 10.3 Phase 2: Embark HF + Unit Expansion + Live Events (6-8 hrs, PLANNED)

Post-embark legends re-export as PRIMARY. Synthetic HF as FALLBACK. Bridge expansion (birth_year, sex, relationships, personality). Live event generator (death, profession change, skill milestone initially).

### 10.4 Phase 3: Agentic Storyteller + Explorer Integration (8-10 hrs, PLANNED)

Replace keyword routing with agentic LLM (up to 5 SQL rounds). SQL tool safety. Unified person builder. Explorer fortress folk view. Config toggle.

### 10.5 Phase 4: Events Tab + Knowledge Horizon Stub (4-6 hrs, PLANNED)

Events API + UI, war/battle collections, knowledge_horizon table, horizon constraints in LLM prompt.

### 10.6 Phase 5: Polish + Long-Term (Post-v1.0)

12 items: accent search, age calc, position titles, sidebar sort/filter, load members, additional live event types, proactive narrative engine, skills time-series, full Knowledge Horizon (7 caveats), interactive maps, family trees, global figure scoring.

### 10.7 Original Five-Phase Plan (Historical)

Phase 0: Foundation (Weeks 1-2). Phase 1: CDM Design & Data Ingestion (Weeks 3-6). Phase 2: AI Storyteller Pipeline (Weeks 7-10). Phase 3: Data Viewer Backend (Weeks 11-14). Phase 4: Web Frontend (Weeks 15-20). Phase 5: Integration, Polish & Release (Weeks 21-24).

### 10.8 Phase Status Summary

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| Phase 1 | Denizen Registry + Death Detection | 6-8 hrs | PLANNED |
| Phase 2 | Embark HF + Unit Expansion + Live Events | 6-8 hrs | PLANNED |
| Phase 3 | Agentic Storyteller + Explorer Integration | 8-10 hrs | PLANNED |
| Phase 4 | Events Tab + Knowledge Horizon Stub | 4-6 hrs | PLANNED |
| Phase 5 (UI polish) | Items 1-5 | 6-8 hrs | Can start any time |
| Phase 5 (post-v1.0) | Items 6-12 | Ongoing | Depends on 1-4 |
| Monitoring System | Observability | ~230 LOC | NOT STARTED |
| RAG Indexing | Knowledge base | Ongoing | PARTIAL |
| Probe Expansion | 10 new probes | ~130 LOC | NOT STARTED |

### 10.9 Cross-Phase Dependency Graph

```
Phase 1: Denizen Registry
    +-- fortress_denizens table, death detection, embark, NVS
         |
Phase 2: Embark HF + Events
    +-- embark column, synthetic HF, bridge expansion, live event generator
         |
Phase 3: Agentic Storyteller
    +-- SQL tool, agentic loop, unified person, fortress folk view
         |
Phase 4: Events Tab + Horizon
    +-- events API/UI, collection trees, knowledge_horizon

Phase 5: Independent items can start any time (UI polish)
Monitoring, RAG, Probes: Independent -- can start any time
```

---

## 11. Key Insights & Recommendations

### Narrative Architecture (1-5)

1. **Template-based vs. LLM-based rendering**: Templates remain as fast fallback. LLM generation for richer, non-repetitive narrative prose.
2. **Context-aware self-reference suppression is critical**: weblegends `event_context` pattern.
3. **Scoring formulas are well-calibrated**: df-narrator's four formulas represent community knowledge.
4. **Co-appearance rivalry detection** is lightweight but effective.
5. **Death cause granularity matters**: 50+ distinct death causes. Generic "died" is significant quality loss.

### Event Type Coverage (6-7)

6. **LegendsBrowser2 is most complete** for DF 0.47+. df-structures defines 144 variants.
7. **Masterpiece events** often overlooked but track cultural output.

### Data Model Insights (8-16)

8. **Ruin state must be derived from events** during post-parse processing.
9. **Entity type inference** needed for non-plus mode.
10. **Kill lists** must be built from HfDied events.
11. **Relationship profiles are plus-mode only**.
12. **Complete data available via DFHack Lua** `df.global.*` paths.
13. **Data integrity before features**: Composite PKs, kill_count fix must precede new features.
14. **Explicit world_id on every table** enables direct queries.
15. **Same ID space between legends and live data**.
16. **Control character filtering is mandatory**.

### Worldgen-Specific Insights (17-25)

17. **First-mover opportunity** for worldgen monitoring.
18. **`worldgen_status` is always safe to access** (compound, not pointer).
19. **DF's native Lua cannot be used** -- must use DFHack Lua.
20. **State 8 (RecountingLegends)** is high-speed write phase -- poll carefully.
21. **Completion detection requires three conditions**.
22. **XML data alone suffices for a full world map** (DwarvenSurveyor confirms).
23. **`region_map` 2D grid** may enable real-time worldgen map preview.
24. **Large regions require chunked rendering**.
25. **`worldgen_parms`** supports multi-world comparative analysis.

### Data Extraction Insights (26-30)

26. **Event-loop architecture validates bridge design**.
27. **`world.incidents.all`** is correct path for death cause resolution.
28. **`unit.relationship_ids.Mother/Father`** enables live lineage without export.
29. **Embedded HTTP server** (weblegends) is valid alternative architecture.
30. **DFHack macOS native build unsupported** -- Windows VM is the path.

### Visualization Insights (31-36)

31. **Leaflet world map is the centerpiece feature**.
32. **SVG Family Tree is a signature feature** unique to LB1.
33. **Curse Lineage Tree** is compelling narrative visualization.
34. **D3 chord diagrams** provide at-a-glance war overview.
35. **Consistent civilization coloring** reduces cognitive load.
36. **Event HTML rendering server-side** unlocks rich UX.

### XML Parsing Insights (37-38)

37. **Custom tokenizers outperform standard XML libraries**.
38. **Code generation** from XML structure analysis produces most maintainable parser.

### Performance Insights (39-42)

39. **1000 events/page** is right pagination threshold.
40. **500-tick polling rate** is production-validated.
41. **Generic watcher factory** is the reusable core.
42. **All-in-memory vs. database** tradeoff understood.

### Mod Management Insights (43-49)

43. **v50 is a clean break** from pre-v50 modding.
44. **Duplicate object IDs cause silent corruption**.
45. **DFHack's GUI mod manager API is undocumented**.
46. **No LOOT equivalent** for DF -- significant opportunity.
47. **Modpack history in DB** enables powerful queries.
48. **Cross-platform requirement** -- ModHearth is Windows-only.
49. **Steam Workshop integration gap**.

### Advisor Architecture Insights (50-54)

50. **Reactive control vs. goal planner**: invariant-maintenance is more robust.
51. **Stock threshold per-capita scaling** is essential.
52. **Exclusive action serialization**: never concurrent multi-step interactions.
53. **legends_plus.xml is transformative**: dramatically richer data.
54. **Breadcrumb/adjacent-ID navigation is essential**.

---

## 12. Design Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Post-Embark Legends Re-Export as Primary | Authoritative HF records for embark dwarves |
| 2 | Relationships from Unit Records, NOT Heuristic | 9 slots in unit data; guessing rejected |
| 3 | `dfhack-run` over SSH as Primary Transport | TCP RPC broken under Prism |
| 4 | Agentic Storyteller Replaces Keyword Routing | Up to 5 SQL rounds; keyword retained as fallback |
| 5 | Live Events in Same `history_events` Table | `live_generated` + `source` columns |
| 6 | Knowledge Horizon as Advisory (System Prompt) | View-based enforcement deferred |
| 7 | NVS Computed Per Watcher Cycle | Enables O(1) sort |
| 8 | Event ID Gap of 10,000+ | Anti-collision |
| 9 | SSE Streaming for Agentic Responses | Tool calls hidden from UI |
| 10 | `embark` Flag on Both HF and Denizen Tables | Different uses |
| 11 | Composite PKs over Single-Column PKs | Resolves cross-world collisions |
| 12 | `fortress_denizens` Has Two Nullable FK Columns | Unit-only or HF-only denizens possible |
| 13 | Embark Detection via Absence of Records | First watcher cycle has zero entries |
| 14 | `missing` Status Distinct from `deceased` | Vanished -> missing -> confirmed deceased |
| 15 | Storyteller Enrichment over Raw Data | JOIN-resolved names + templates |
| 16 | Confidence Signaling in Storyteller | Context density note prepended |
| 17 | `lua_probes` Retention Every 10 Cycles | Balance storage vs. performance |
| 18 | Bridge Health Monitoring with Degradation | Continue after 3 failures |
| 19 | Written Contents Dual-Source Parsing | legends.xml + legends_plus.xml |
| 20 | kill_count Fixed to Group by Killer | hf_id_2 not hf_id_1 |
| 21 | Lua Bridge as Primary Data Path | No RFR dependency |
| 22 | Inline Instrumentation for Monitoring | Middleware cannot capture per-phase latency |
| 23 | Entity Position Dual-Source Merge | DO NOTHING on conflict |
| 24 | Selective Wiki Crawl for RAG | ~500-800 pages from 43,621 total |
| 25 | Event Type Storage as TEXT | No DB enum constraint; raw data in JSONB |
| 26 | 141 Canonical Event Types | Corrected from 144 (2026-02-23) |
| 27 | View-based Knowledge Horizon Masking | Preferred over materialized tables |
| 28 | Family depth cap at 3 | Prevent recursion bombs |
| 29 | Synthetic HF records flagged `source = 'inferred'` | Distinguishable from legends data |

---

## 13. Open Items & Action Items

### 13.1 Verification Needed

| Assumption | Verification Method |
|------------|---------------------|
| Current xml_parser.py handles control characters | Check for FilteredStream-equivalent |
| IBM CP473 encoding handled | Verify or add conversion |
| DFHack TCP RPC broken only under Prism, or all 53.x | Test on HomeServer |
| `world_data.region_map` accessible during PreparingElevation | Empirical verification |
| `worldgen_status.entities` vs `world.entities.all` identity at completion | Test at state == 10 |
| `unit.relationship_ids.Mother/Father` availability | Verify on DFHack 53.10-r1 |
| Version integer format correctness | Validate against DFHack behavior |
| Steam Workshop path on macOS | Test macOS Steam paths |

### 13.2 Unresolved Design Decisions

- lua_probes time-series vs. UPSERT
- Multi-participant events: JSONB array vs. junction table
- DFHack TCP RPC vs. dfhack-run SSH as permanent transport
- Manager order CHEAT fallback adoption
- df-ai heuristics as LLM prompt vs. compiled rules
- Player Character distinction
- Map generation: DF-exported BMP vs. programmatic
- Frontend framework: Vue 3 + Vuetify 3 or SvelteKit (confirm)
- Event collection sub-events in Storyteller
- Conflict resolution for modpack transitions mid-save
- Graphiti / Neo4j complement to relational CDM

### 13.3 Data Capture Gaps

- No position/noble tracking in live bridge
- No HF link tracking in live bridge
- `world.activities`, `world.written_contents.all`, `world.jobs.list` not captured
- Individual building footprints, corpse spatial data not captured
- Full personality memories/preferences vectors not captured
- Loyalty cascade causality may be lost
- All HF sub-profile fields remain unextracted from Legends XML
- 12 event types defined in df-structures but unhandled by any tool

### 13.4 Prioritized Action Items

#### Tier 1 -- Critical

1. Add all 141 event types to CDM taxonomy
2. Extend HF CDM with missing high-priority fields
3. Add importance scoring columns + compute
4. Implement death cause narrative rendering (50+)
5. Implement perspective-aware event narrative
6. Add cross-linking infrastructure
7. Implement DF calendar utility
8. Run Knowledge Horizon prerequisite queries
9. Implement `fortress_denizens` registry + NVS
10. Implement embark dwarf synthetic HF generation

#### Tier 2 -- High Value

11. Interactive world map (Leaflet.js)
12. Family tree visualization
13. Event timeline charts
14. Population distribution charts
15. Hover popovers
16. Global search with autocomplete
17. Add missing CDM entity types
18. Post-parse cross-referencing pipeline

#### Tier 3 -- Bridge Enhancements

19. Add `eventful` subscriptions
20. Death cause resolution via incidents
21. Parent/family chain extraction
22. Book/written work detection
23. Create `worldgen-bridge.lua`
24. Add `worldgen_snapshots` CDM table

#### Tier 4 -- Stretch / Deferred

25. Curse lineage tree
26. Warfare graph
27. War chord diagram
28. Mod awareness
29. Stock threshold model
30. Raw file parser for mod conflict detection

---

## 14. Metrics & Targets

### 14.1 Effort Estimates

| Phase | Effort | Cumulative |
|-------|--------|-----------|
| Phase 1: Denizen Registry | 6-8 hrs | 6-8 hrs |
| Phase 2: Embark HF + Events | 6-8 hrs | 12-16 hrs |
| Phase 3: Agentic Storyteller | 8-10 hrs | 20-26 hrs |
| Phase 4: Events Tab + KH | 4-6 hrs | 24-32 hrs |
| Monitoring | ~3-4 hrs | Parallel |

**Total for v1.0**: 24-32 hours.

### 14.2 Performance Targets

| Metric | Target |
|--------|--------|
| Agentic response time | Under 15 seconds |
| Max SQL rounds | 5 |
| Per-query timeout | 5 seconds |
| Max rows per query | 50 |
| Death detection latency | Within 2 watcher cycles |
| Bridge polling | 100 game ticks |
| Watcher polling | 10s default |
| Test suite execution | 0.19s baseline |
| HTTP transfer (VM) | ~105 MB/s |

### 14.3 Data Recovery Metrics (Achieved)

- Cross-world collisions resolved: 10,932
- HFs recovered (Namoram): 5,466
- Total HFs post-migration: 60,787 (9.9% restoration)
- Kill counts corrected: 8,680 figures
- Written contents imported: 61,692

### 14.4 World Data Reference

| World | Events (legends) | Events (live) | HFs | Entities | Artifacts | Sites | Event Types |
|---|---|---|---|---|---|---|---|
| "Thadar En" (world 8) | 312,254 | 442,716 | 48,366 | 4,901 | 8,035 | 2,154 | 97 of 141 |

### 14.5 Code Metrics

| File | Lines |
|------|-------|
| chronicler-bridge.lua | 922 |
| xml_parser.py | 733 |
| context.py | 723 |
| schema.sql | 378 |
| watcher.py | 355 |
| bridge.py | 308 (24 accessors) |
| detector.py | 246 |

---

## 15. Technical Appendices

### Appendix A: Complete DF Event Type Reference

#### 141 Canonical Event Types (133 df-structures + 8 DF 50.x)

**Category 1: HF Lifecycle (17 types)**

| df-structures Name | DB Name | DB Count (World 8) | In LB2? |
|---|---|---|---|
| HIST_FIGURE_DIED | hf died | 20,620 | Yes |
| HIST_FIGURE_WOUNDED | hf wounded | 3,263 | Yes |
| HIST_FIGURE_ABDUCTED | hf abducted | 3,282 | Yes |
| HIST_FIGURE_REVIVED | hf revived | 425 | Yes |
| HIST_FIGURE_REUNION | hf reunion | 136 | Yes |
| HIST_FIGURE_TRAVEL | hf travel | 802 | Yes |
| HIST_FIGURE_NEW_PET | hf new pet | 319 | Yes |
| HIST_FIGURE_SIMPLE_BATTLE_EVENT | hf simple battle event | 17,238 | Yes |
| HIST_FIGURE_SIMPLE_ACTION | -- | Not in DB | **No** |
| CHANGE_HF_STATE | change hf state | 53,077 | Yes |
| CHANGE_HF_JOB | change hf job | 49,584 | Yes |
| CHANGE_HF_BODY_STATE | change hf body state | 118 | Yes |
| CHANGE_HF_MOOD | -- | Not in DB | **No** |
| CHANGE_CREATURE_TYPE | changed creature type | 122 | Yes |
| HF_GAINS_SECRET_GOAL | hf gains secret goal | 424 | Yes |
| HF_RELATIONSHIP_DENIED | hf relationship denied | 2,742 | Yes |
| HIST_FIGURE_REACH_SUMMIT | -- | Not in DB | Yes |

**Category 2: HF Relationships (10 types)**: ADD/REMOVE_HF_HF_LINK, ADD/REMOVE_HF_ENTITY_LINK, ADD/REMOVE_HF_SITE_LINK, ADD_HF_ENTITY_HONOR, ASSUME_IDENTITY, HFS_FORMED_REPUTATION_RELATIONSHIP, HFS_FORMED_INTRIGUE_RELATIONSHIP.

**Category 3: HF Actions (14 types)**: HF_ATTACKED_SITE, HF_DESTROYED_SITE, HF_CONFRONTED, HF_DOES_INTERACTION, HF_LEARNS_SECRET, HF_PREACH, HF_FREED, HF_RANSOMED, HF_ENSLAVED, HF_ACT_ON_BUILDING, HF_ACT_ON_ARTIFACT, HF_RAZED_BUILDING, HF_RECRUITED_UNIT_TYPE_FOR_ENTITY, SNEAK_INTO_SITE.

**Category 4: HF Intrigue (6 types)**: HF_CONVICTED, HF_INTERROGATED, FAILED_INTRIGUE_CORRUPTION, FAILED_FRAME_ATTEMPT, SABOTAGE, SPOTTED_LEAVING_SITE.

**Category 5: Artifacts (13 types)**: ARTIFACT_CREATED/DESTROYED/LOST/FOUND/RECOVERED/POSSESSED/GIVEN/STORED/TRANSFORMED/COPIED/CLAIM_FORMED/HIDDEN/DROPPED.

**Category 6: Sites & Construction (11 types)**: CREATED_SITE, WAR_DESTROYED_SITE, RECLAIM_SITE, SITE_DIED, SITE_RETIRED, CREATED/REPLACED/RAZED_BUILDING, CREATED_WORLD_CONSTRUCTION, MODIFIED_BUILDING, BUILDING_PROFILE_ACQUIRED.

**Category 7: Entities (14+ types)**: ENTITY_CREATED/INCORPORATED/DISSOLVED/LAW/PERSECUTED/OVERTHROWN/ALLIANCE_FORMED/EQUIPMENT_PURCHASE/BREACH_FEATURE_LAYER/SEARCHED_SITE/RAMPAGED_IN_SITE/FLED_SITE/EXPELS_HF, REGIONPOP_INCORPORATED, CREATE_ENTITY_POSITION.

**Category 8: War & Combat (8+ types)**: WAR_ATTACKED_SITE/FIELD_BATTLE/PLUNDERED_SITE/SITE_NEW_LEADER/SITE_TAKEN_OVER/SITE_TRIBUTE_FORCED, TACTICAL_SITUATION, SQUAD_VS_SQUAD, BODY_ABUSED, CREATURE_DEVOURED, ITEM_STOLEN.

**Category 9: Diplomacy (9+ types)**: FIRST_CONTACT, WAR_PEACE_ACCEPTED/REJECTED, TOPICAGREEMENT_*, DIPLOMAT_LOST, AGREEMENT_FORMED/CONCLUDED, SITE_DISPUTE, TRADE, MERCHANT.

**Category 10: Culture & Art (8+ types)**: POETIC/MUSICAL/DANCE_FORM_CREATED, WRITTEN_CONTENT_COMPOSED, KNOWLEDGE_DISCOVERED, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, GAMBLE.

**Category 11: Masterpieces (7 types)**: MASTERPIECE_CREATED_ARCH_CONSTRUCT/ITEM/DYE_ITEM/ITEM_IMPROVEMENT/FOOD/ENGRAVING, MASTERPIECE_LOST.

**DF 50.x Steam-Era Types (8)**: hf prayed inside structure, hf equipment purchase, hf performed horrible experiments, hf profaned structure, entity relocate, entity primary criminals, holy city declaration, hf viewed artifact.

**11 Types with No LB2 Handler**: AGREEMENTS_VOIDED, ARTIFACT_DROPPED, ARTIFACT_HIDDEN, CHANGE_HF_MOOD, ENTITY_ACTION, HF_ACT_ON_ARTIFACT, HF_ACT_ON_BUILDING, HF_RAZED_BUILDING, HIST_FIGURE_SIMPLE_ACTION, INSURRECTION_ENDED, ADD_ENTITY_SITE_PROFILE_FLAG.

### Appendix B: 19 EventCollection Types

**Warfare**: battle, war, duel, raid, site conquered.
**Political**: insurrection, persecution, purge, entity overthrown.
**Calamities**: beast attack, abduction, theft.
**Rituals**: occasion, procession, ceremony, performance, competition.
**Travel**: journey.

### Appendix C: df-ai Subsystem Timing Reference

| Subsystem | Update Frequency | Scope |
|-----------|-----------------|-------|
| Population | Every 25 ticks | Citizens, jobs, unsuspend |
| Military | Every 25 ticks (phase 4) | Draft/dismiss, squads |
| Nobles | Every 25 ticks (phase 2) | Position assignment |
| Trading | Every 25 ticks (phase 0) | Caravan, broker, trade |
| Pets | Every 25 ticks (phase 5) | Pasture, milking |
| Justice | Every 25 ticks (phase 4) | Crime, punishment |
| Occupations | Every 25 ticks (phase 8) | Tavern, performer |
| Construction Plan | Every 240 ticks | Dig, build, furnish |
| Stocks | Every 100 ticks | Item count, production |
| Farm | Every 100 ticks | Crop selection |
| Metalwork | Every 100 ticks | Ore, bars, equipment |
| Equipment | Every 100 ticks | Weapons, armor |
| Embark | Once | Site selection, initial party |
| Blueprint | Once | JSON -> room layout |

### Appendix D: LegendsViewer-Next Entity Data Model

**HistoricalFigure**: Name, Race, Caste, BirthYear, DeathYear, Age, Alive, Deity, Force, Ghost, Zombie, Adventurer, CurrentState, RelatedHistoricalFigures, RelatedEntities, RelatedSites, Skills, Spheres, ActiveInteractions, Goal, NotableKills, Battles, Positions, VagueRelationships, Reputations, HoldingArtifacts, IntrigueActors/Plots, BreedId, LineageCurseParent, FamilyTreeData.

**Site**: SiteType (22), UntranslatedName, Coordinates, Rectangle, Structures, OwnerHistory, SiteProperties.

**Entity**: EntityType (11), IsCiv, Race, SiteHistory, EntityPositions, EntityPositionAssignments, EntityOccasions, LineColor.

### Appendix E: df-structures Canonical CDM Dictionary Key Files

| File | Contents |
|------|----------|
| df.unit.xml | Live unit: position, job, inventory, relationships |
| df.soul.xml | Psychology: traits, values, memories, preferences |
| df.personality.xml | Emotions, goals, needs |
| df.history_figure.xml | Life events, entity links, artifacts |
| df.history_event.xml | All event types (100+ subtypes) |
| df.entity.xml | Civilizations, sites, positions |
| df.site.xml | Site data, structures, populations |
| df.world.xml | Top-level world state, calendar |
| df.region.xml | Regions, biomes; worldgen_parms; world_generatorst |

### Appendix F: Key File Paths

| Component | Path |
|-----------|------|
| Lua bridge | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| XML parser | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| Context retriever | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` |
| Watcher | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change detector | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Bridge accessor | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| DB schema | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| Product code root | `/Users/nathanielcannon/Claude/Projects/DwarfCron/` |
| Dev artifacts | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/` |
| Reference repos | `/Users/nathanielcannon/Claude/GitRepos/` |
| HomeServer | `192.168.4.194` (HTTP: 8888, RPC: 5000) |
| UTM VM | `192.168.64.3` (DF-Windows, Win11 ARM) |

### Appendix G: Reference Design Documents

| Document | Path |
|----------|------|
| PRD v2.2 | `projects/chronicler/designs/chronicler-prd-v2.md` |
| Development Roadmap v1.1 | `projects/chronicler/designs/chronicler-roadmap-v1.md` |
| Phase 1 Detailed Plan | `projects/chronicler/designs/phase-1-denizen-registry.md` |
| Unit-HF Field Mapping | `projects/chronicler/designs/unit-hf-field-mapping.md` |
| Knowledge Horizon Design | `projects/chronicler/designs/knowledge-horizon.md` |
| Data Gap Analysis | `projects/chronicler/reports/data-gap-analysis-2026-02-22.md` |
| Gap Closure Critical Review | `projects/chronicler/reports/gap-closure-critical-review.md` |
| UI Enhancements Plan | `.claude/plans/rippling-honking-crescent.md` |
| Explorer Redesign Plan | `.claude/plans/shiny-churning-sprout.md` |

### Appendix H: Reference Repositories

| Repository | Language | Key Features |
|-----------|----------|-------------|
| LegendsBrowser2 | Go + Vue.js | 132 event types, collection summaries, custom XML tokenizer |
| LegendsViewer-Next | .NET 8 + Vue 3 | Leaflet maps, family trees, async XML, fastest loader |
| df-narrator | Python | Scoring formulas, direct prototype reference |
| weblegends | C++ (DFHack) | 96 per-event HTML generators, context-aware rendering |
| df-ai | C++ (DFHack) | Event manager, autonomous fortress AI |
| df-structures | XML | Canonical DF memory definitions |
| myDFHackScripts | Lua | Production bridge patterns |
| DwarvenSurveyor | C# | XML streaming, world map parsing |
| DF-Modloader | Python | Raw compiler pipeline |
| ModHearth | C# | DFHack-integrated mod manager |

### Appendix I: Sources

**From worldgen-scraping-research.md + dwarven-surveyor-scripts-research.md**: df-structures XML files, df-ai embark.cpp, weblegends test/main.lua, DFHack Discussion #3774, DFHack Discussion #4961, DwarvenSurveyor Unity project, myDFHackScripts modules.

**From dwarf-fortress-project-plan.md (2026-02-18)**: Steam Community guides, DFHack documentation, GitHub repos for all reference tools.

**From upstream research reports**: All per-tool research for 16+ repositories.

---

*Final Planning History Document -- Round 5 merge of all Chronicler/DwarfCron project planning documents. Written 2026-02-25. All information from all source documents preserved. No information discarded.*
