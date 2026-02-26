# Round 2 Consolidation: Foundation Vision & Data Extraction Techniques

**Consolidated**: 2026-02-24
**Sources**:
- `round1-pair-13.md` — Worldgen Scraping + DFHack Scripting Research consolidation (itself consolidating `worldgen-scraping-research.md` + `dwarven-surveyor-scripts-research.md`)
- `dwarf-fortress-project-plan.md` — Original foundational project plan (758 lines, dated 2026-02-18)

---

## Original Product Vision

### Project Name

**"Chronicler"** — A living record of every world Dwarf Fortress generates.

### Core Design Philosophy

Every procedurally generated DF world is a novel. The characters have backstories, traumas, achievements, and relationships. The civilizations rise and fall through wars, plagues, and migrations. The artifacts change hands across centuries. Most players never see 5% of the history their world generates. Chronicler makes all of it visible, searchable, and narratable.

Two mutually reinforcing purposes:

**Purpose 1 — The AI Storyteller**: A conversational interface that knows your world as well as any bard in it. You can ask "who was the most tragic dwarf in the history of Uristmcbronze?" and get a coherent character study drawing on their biography, relationships, and the events that shaped them. You can ask "tell me the story of the Fall of Bladetower" and receive a narrative with named characters speaking in voices consistent with their psychological profiles.

**Purpose 2 — The Living Atlas**: An all-inclusive data viewer, running in your browser, showing everything from world-generation demographics to your current fortress population in real time. A single place that does everything LegendsViewer, LegendsBrowser, and LegendsViewer-Next do, unified into one coherent experience, with the addition of live data and demographic analytics no existing tool provides.

### Differentiation from Existing Tools

The current ecosystem is fragmented:
- Legends viewers only work from XML exports (require export → reload cycle for updates)
- Real-time tools are limited to 3D voxel renderers (Armok Vision, Vox Uristi)
- AI storyteller space is essentially unexplored
- No unified CDM connecting live game state to historical data
- No worldgen-phase data scraping in any existing tool
- No demographic visualization (population pyramids, skill distributions, migration flows)

Combining live data ingestion, historical XML import, a unified relational+vector CDM, and an LLM storytelling pipeline represents a genuinely novel contribution to the DF community.

**Gaps in existing tools being addressed**:
- No live data (all existing viewers require export-reload cycle)
- No AI-powered Q&A or narrative generation
- No unified CDM connecting live game state to historical data
- No demographic visualization
- No worldgen data scraping or live worldgen monitoring
- LegendsViewer is Windows-only and unmaintained; LegendsBrowser2/LegendsViewer-Next have no live data

---

## All Features & Requirements

### Category 1: Real-Time Worldgen Monitor (Novel Capability — No Existing Tool Does This)

Chronicler has the opportunity to be the **first-ever tool** that monitors Dwarf Fortress world generation in real time. No DFHack plugin, community script, or third-party tool has ever polled live worldgen data during generation. All existing tools (exportlegends, df-ai, weblegends) only read data after generation is complete. DFHack maintainer explicitly acknowledged this gap in 2023 (Discussion #3774: "DFHack has very little tooling around worldgen currently").

**Sub-features**:

- **Live Phase Progress Display**: Show the current worldgen phase (one of 12 states: None, Initializing, PreparingElevation, SettingTemperature, RunningRivers, FormingLakesAndMinerals, GrowingVegetation, VerifyingTerrain, ImportingWildlife, RecountingLegends, Finalizing, Done) as generation proceeds. Map this directly to a progress bar in the Chronicler UI.
- **River Generation Progress**: Show `rivers_cur / rivers_total` as a percentage during the RunningRivers phase.
- **Civilization Placement Counter**: Show `civ_count` and `civs_left_to_place` during the Finalizing phase — watch civilizations appear one by one.
- **Historical Figure Count Live Feed**: Show `#world.history.figures` incrementing during RecountingLegends (state 8), where the bulk of history is written.
- **Historical Event Count Live Feed**: Show `#world.history.events` growing in real time.
- **Era Formation Tracker**: Show `#world.history.eras` as new eras open.
- **Entity Count Live Feed**: Watch `#world.entities.all` and `#worldgen_status.entities` as civilizations form.
- **Site Count Live Feed**: Watch `#worldgen_status.sites` and `#world.world_data.sites` fill during site placement.
- **Beast Placement Flags**: Binary indicators for `placed_megabeasts`, `placed_caves`, `placed_good_evil`, `finished_prehistory`.
- **Rejection Counter**: Show `num_rejects` — how many times the world engine has rejected a terrain configuration and restarted.
- **Rampage Counter**: Show `rampage_num` — megabeast rampages during prehistory.
- **New Events Stream**: Real-time feed of the most recently added history events (id, type, year) as generation writes them, using `last_event_id_added` as a cursor.
- **World Parameters Summary**: Display seed, world title, dimensions (dim_x, dim_y), end year, and civilization caps from `worldgen_parms` the moment generation begins.
- **Terrain Geography Accumulation**: Track `region_count`, `landmass_count`, `river_count`, `geo_biome_count`, `site_count` from `world_data` as terrain phases fill these vectors.
- **Terrain Tile Grid Snapshot** (experimental): Read the `world_data.region_map` 2D elevation/rainfall/temperature/volcanism/evilness grid during terrain phases for a real-time evolving world map preview.
- **Auto-Start/Stop Monitoring**: Automatically begin recording when the user enters the worldgen screen and stop when generation completes, with no user intervention required.
- **Worldgen Complete Trigger**: Detect `worldgen_status.state == 10` (combined with `#world.entities.all > 0` and `viewscreen_new_regionst.simple_mode == 0`) and fire the Chronicler post-worldgen ingestion pipeline automatically.

### Category 2: Worldgen Snapshot Database (CDM Extension)

- **`worldgen_snapshots` Table**: Persist every polled snapshot to a new CDM table. Schema: `(world_name, seed, state_id, state_name, snapshot_ts, figure_count, event_count, era_count, civ_count, civs_left, rivers_cur, rivers_total, rampage_num, num_rejects, entity_count, site_count, landmass_count, river_count, geo_biome_count, snapshot_num)`.
- **`worldgen_complete` Record**: Write a final completion record when `state == 10` is first detected, capturing all final counts.
- **World Parameters Record**: Store `worldgen_parms` (seed, title, dim_x, dim_y, end_year, total_civ_number, megabeast_cap, etc.) in a dedicated `worldgen_params` table for cross-world comparison.
- **Cross-World Analytics**: Compare worldgen characteristics across multiple generated worlds — which seeds produce more events, more civilizations, longer prehistory, more rejections.
- **`chronicler worldgen-watch` CLI Command**: Python-side command that reads the JSON snapshots from `worldgen-bridge.lua` and ingests them into the CDM in real time.

### Category 3: Interactive World Map Visualizer

Derived from DwarvenSurveyor's architecture, adapted as a Chronicler UI panel. DwarvenSurveyor proves that `legends.xml` + `legends_plus.xml` alone are sufficient for a full navigable world map.

- **Biome Region Map**: Render each biome region as a colored mesh/polygon on a 2D world map. Support 10 biome types: Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains — each with a distinct color/material.
- **Evilness Overlay**: Color-code or overlay regions by evilness rating (from `legends_plus.xml` or CDM). Allow toggling evilness as a map layer.
- **Site Markers**: Place clickable icons on the map for each site. Color-code by site type across the full 20-type taxonomy: Camp, Cave, Dark Fortress, Dark Pits, Forest Retreat, Fortress, Castle, Fort, Hamlet, Hillocks, Labyrinth, Lair, Monastery, Mountain Halls, Ruins, Shrine, Tomb, Tower, Town, Vault.
- **Site Hover Tooltips**: Floating tooltip on mouse-over showing site name, type, coordinates, controlling entity, and historical summary.
- **Region Hover Panel**: Sidebar panel showing region name, type, evilness, and historical events on mouse-over.
- **Camera Navigation**: Pan/zoom the world map with arrow keys, WASD, or click-drag. Enforce map bounds.
- **Search and Jump**: Search for a site or region by name; click result to jump camera to that location.
- **Site Bounding Box**: Show the site `rectangle` (4-corner bounding box in world tiles) in addition to the single `coord` marker.
- **Large Region Support**: Handle regions with >10,000 tiles by splitting into multiple render chunks (DwarvenSurveyor splits into 4 meshes; Chronicler should use viewport culling for performance).
- **`regionDataMap` Fast Lookup**: Pre-compute a `world_width x world_height` 2D array mapping every world tile to its region for O(1) hover detection.
- **Y-Axis Flip Handling**: Account for DF's inverted Y coordinate system when rendering (DF Y=0 is top; screen Y=0 is typically bottom).
- **Worldgen Live Map Preview**: During worldgen, update the map as terrain phases complete — show regions appearing, rivers drawing, sites being placed in real time.
- **Timeline Scrubber**: See the map at any world year; navigate temporal state of the world map (from LegendsViewer/LegendsViewer-Next pattern).
- **Civ Territory Overlays**: Overlay civilization territorial control on the map.
- **Leaflet.js Integration**: Use Leaflet.js for the web-based map implementation (proven by LegendsViewer-Next).

### Category 4: Fortress-Mode Event Capture & Logging

Derived from myDFHackScripts pattern, adapted for Chronicler's bridge:

- **Announcement / Report Logger**: Poll `df.global.world.status.reports` to capture all in-game announcement text with id and repeat_count. Ingest to CDM for searchable announcement history.
- **Item Creation Logger**: Hook `ITEM_CREATED` eventful event. Log item id, type, material, name, description, maker (hist_figure_id), quality (0-5), value, and artifact flag.
- **Death Logger**: Hook `UNIT_DEATH` event. Log unit id, name, race, death cause (resolved from enum), killer name, whether killer is a fortress citizen, and killer race.
- **Job Completion Logger**: Hook `JOB_COMPLETED` event. Log job name, job type (enum), and worker name.
- **Citizen Arrival Logger**: Poll `df.global.world.units.active` every N ticks. Detect citizen count changes. Log new citizens with id, name, race, age, sex.
- **Invasion Logger**: Hook `eventful.onInvasion`. Log invasion events with entity, time, and outcome.
- **Petition Logger**: Poll `df.global.world.agreements.all` to detect new petitions or treaty changes.
- **Written Work / Book Logger**: Poll `df.global.world.items.all` for book items using `dfhack.items.getBookTitle(item)`. Detect when a fortress citizen writes a new book — capture title, author, content type.
- **Masterwork Tracker**: Count items with `quality == 5` over time. Graph masterwork production rate.
- **Top Worker Analysis**: Aggregate job completion records to rank workers by completed jobs, masterworks, or job type specialization.
- **Citizen Arrival by Year**: Track when each citizen joined the fortress, enabling historical migration graphs.
- **Deaths by Year / Cause**: Aggregate death records by year and cause for mortality analysis.
- **In-Game Bar/Line Graph Widget**: Render time-series graphs inside the DF UI using a DFHack GUI widget (like CurveWidget.lua) for stats like deaths, arrivals, production over time — without leaving the game.

### Category 5: Death Cause & Incident Investigation

- **Death Cause Resolution**: Search `df.global.world.incidents.all` for death incidents by victim unit id. Resolve `death_cause` enum to human-readable string. Identify the killer's unit id and name.
- **Killer Identification**: From a `UNIT_DEATH` event, walk `world.incidents.all` to find the associated incident, extract `incident.criminal` (killer unit_id), resolve the killer's name via `dfhack.units.getReadableName`.
- **Citizen/Non-Citizen Kill Classification**: Flag whether a death was caused by a fortress citizen (friendly fire, accidents) vs. an enemy or wildlife.
- **Death Cause Taxonomy**: Maintain a complete `df.death_type` enum lookup table for all possible death causes.
- **Incident-to-Historical-Event Linkage**: Link fortress-mode death incidents to pre-existing historical figure death events in the Legends database when a historical figure is involved.

### Category 6: Historical Figure Lineage Extraction

- **Parent-Chain Walk**: Given a unit's `unit.relationship_ids.Mother` and `unit.relationship_ids.Father` (both are hist_figure_ids), walk the full lineage tree by resolving each into `df.global.world.history.figures`.
- **Family Tree Builder**: Recursively construct family trees for fortress citizens and notable historical figures.
- **Ancestor/Descendant Search**: Given a historical figure id, find all known ancestors (walk up parent chain) and all known descendants (scan figures for matching parent ids).
- **Lineage Database**: Store resolved lineage relationships in the CDM for graph query and UI display.
- **Family Tree Visualization (D3.js)**: D3.js force graph or tree layout for rendering family trees in the web UI.
- **Live Lineage (No Export Required)**: Family tree construction can be done live in-game via the bridge — does not require waiting for a Legends export.

### Category 7: Item & Artifact Tracking

- **Complete Material Classification**: Use a full lookup table classifying DF materials into categories: Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature. Apply this to all item logging.
- **Artifact Registry**: Track all items with `item.flags.artifact == true`. Record maker, creation year, name, material, description, and current owner/location.
- **Quality Distribution Dashboard**: Track quality distribution (0-5) for produced items over time. Show per-worker and per-job-type quality curves.
- **Item Value Tracking**: Record `dfhack.items.getValue(item)` for produced items. Track economic output over time.
- **Artifact Transfer Chain**: Full holder history timeline (creator → holder → current location), surfaced in the data viewer.

### Category 8: XML-Based World Data Ingestion (Post-Worldgen)

- **`legends.xml` Parser**: Parse DF's standard Legends Mode export for sites and regions. Extract name, type, coord, and rectangle for every site. Extract region name and type for every region.
- **`legends_plus.xml` Parser**: Parse DFHack's `exportlegends` output for per-tile region coordinate arrays (pipe-delimited `x,y|x,y` format) and evilness ratings.
- **`ParseCoordinates` Algorithm**: Implement the pipe-delimited coordinate string parser as a Python utility — split on `|`, split each pair on `,`, construct a list of `(x, y)` integer tuples.
- **Site Type Taxonomy (20 types)**: Ingest and store all 20 DF site types with their indices (Camp=0 through Vault=19).
- **Region Type Taxonomy (10 biome types)**: Ingest and store all 10 biome types with their indices.
- **`evilness` Field for Regions**: Add `evilness` (string, from legends_plus) to the CDM `regions` table if not already present.
- **Site Rectangle Storage**: Store both the single `coord` tile and the `rectangle` (bounding box) for sites in the CDM `sites` table.
- **Streaming Parser (SAX/iterparse)**: Handle 1GB+ legends files without OOM via `lxml iterparse`.
- **Import Progress Tracking**: Track import progress; support incremental re-import.
- **Parse Order**: world → regions → sites → entities → historical_figures → events → artifacts.
- **`world_sites_and_pops.txt` Parser**: Parse site populations file and populate CDM site population records.

### Category 9: Automated Post-Worldgen Ingestion Pipeline

- **Completion Detection**: Detect `worldgen_status.state == 10` and auto-trigger the full Chronicler ETL pipeline (export legends, ingest CDM, run analysis).
- **`exportlegends` Auto-Run**: After worldgen completes, auto-run DFHack's `exportlegends` command to produce `legends.xml` and `legends_plus.xml` without requiring user action in Legends Mode.
- **Auto-Embark Scripting**: Optionally leverage df-ai's `worldgen_status.state == 10` detection to auto-trigger embark after generation, enabling fully automated world-generate-and-embark workflows.

### Category 10: Cross-Session Persistence & Analytics

- **Log File Persistence**: Write all event logs to a structured file with timestamp (day, month, year) prepended to every line. Support deduplication of consecutive identical messages.
- **Log Parser for Historical Analysis**: Parse the structured log file into typed structs by event type. Enable queries: job counts, top workers, masterwork counts, citizen arrivals by year, deaths by year.
- **Session Continuity**: Detect whether a log already exists for the current fortress and append rather than overwrite. Preserve all prior sessions' data.

### Category 11: AI Storyteller Pipeline

- **Character Profile Generation**: Given figure_id, retrieve historical_figure + unit records from CDM, pull all history_events involving that figure (sorted chronologically), pull relationship graph (2 hops), pull artifacts created or held, assemble structured "character brief" (birth → formative events → achievements → death), vector similarity search for thematically related events/figures, inject into LLM with persona prompt.
- **World Q&A**: Embed user query → ANN search across all embedding tables → retrieve top-k relevant chunks (figures + events + sites) → LLM answers with full source attribution.
- **Voice Emulation**: Use unit's `soul_data` (traits, beliefs, goals, needs) to derive a personality description. Map DF trait scores to narrative personality dimensions. Include key life events as formative context. Ground LLM responses in the character's documented worldview.
- **CLI Interface**: `chronicler ask "who was Urist McBronze?"` — free-form questions answered with narrative responses grounded in CDM data.
- **LLM Prompt Templates**: Character biography narrative, event description/battle account, civilization history, dwarf voice Q&A (in-character), world Q&A (bard/narrator voice).
- **Context-Aware AI Chat Panel**: Floating chat interface in the web UI. Context-aware ("tell me about this dwarf" when viewing a figure page). Response with inline links to referenced entities.
- **Local + API LLM Support**: Ollama (local) for development, Claude API for production Q&A quality.

### Category 12: Common Data Model (CDM) — Core Tables

The CDM bridges live game data (from DFHack RPC) with historical data (from XML exports) using a unified relational model.

**ID namespacing**: All IDs are namespaced: `{world_id}:{entity_type}:{game_id}` to support multiple worlds.

**Source tracking**: `source` column on all entities: `'live' | 'legends_xml' | 'legends_plus' | 'world_gen_txt'`.

**Change detection**: `updated_at` timestamp on live-polled entities.

**Embedding linkage**: `embedding_id` FK to vector tables for entities that have narrative embeddings.

```sql
-- World container (one per DF world)
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
              site_id, region_id, entity_id, figure_ids_json,
              details_json)
history_collection(id, world_id, type, start_year, end_year,
                   name, event_ids_json)

-- Objects
artifact(id, world_id, name, item_type, material,
         creator_hfid, current_holder_hfid, holder_history_json)

-- Linguistic
language(id, world_id, name)
word(id, language_id, word, translation, part_of_speech)

-- Worldgen monitoring (new tables)
worldgen_snapshots(world_name, seed, state_id, state_name, snapshot_ts,
                   figure_count, event_count, era_count, civ_count,
                   civs_left, rivers_cur, rivers_total, rampage_num,
                   num_rejects, entity_count, site_count, landmass_count,
                   river_count, geo_biome_count, snapshot_num)
worldgen_params(seed, title, dim_x, dim_y, end_year, total_civ_number,
                megabeast_cap, semimegabeast_cap, titan_number, demon_number)
```

### Category 13: CDM Vector Tables (pgvector)

- `figure_embeddings` — biography chunks → 2560-dim vectors
- `event_embeddings` — event narratives → 2560-dim vectors
- `artifact_embeddings` — artifact histories
- `site_embeddings` — site histories

Embedding generation: qwen3-embedding:4b via Ollama, 2560-dim, consistent with Jarvis infrastructure.

### Category 14: Live Data Sync (DFHack RPC / Lua Bridge)

- **DFHack Lua Polling Script**: Poll `df.world.units.active` every 10 ticks; emit unit state changes via DFHack RPC or local socket. Track: position, job, mood, stress, skills, labors, relationships.
- **Python RPC Client**: Connect to RemoteFortressReader; poll `GetUnitList` every N seconds; diff against CDM `unit` table; write changes.
- **RemoteFortressReader Endpoints**: `GetUnitList`, `GetBlockList`, `GetMaterialList`, `GetPlantList`, `GetMapInfo`, `GetViewInfo`, `GetTiletypeList`.
- **Live Unit State (WebSocket)**: Push live unit state updates to the web frontend via WebSocket.
- **DFHack Event System**: Subscribe to `unit_new_active`, `unit_death`, `job_completed`, `invasion` events rather than brute-force polling where possible (df-ai pattern).
- **`chronicler sync` CLI Command**: Maintains live unit data while DF is running.

### Category 15: Data Viewer Backend (API)

**API endpoints (OpenAPI 3.0)**:
- `/world/{id}` — world overview, stats
- `/figures/{id}` — figure detail, timeline, relationships
- `/entities/{id}` — civilization detail, sites, positions, events
- `/sites/{id}` — site detail, structures, population history, events
- `/events?filters` — event search with type/date/figure/site filters
- `/artifacts/{id}` — artifact detail, holder chain
- `/map/{world_id}` — map data (sites, regions, overlays)
- `/demographics/{world_id}` — population statistics and aggregations
- `/search?q=` — full-text + semantic search across CDM
- `/live/units` — WebSocket: live unit state stream
- `/ai/ask` — Q&A endpoint

**Demographic aggregation queries**:
- Population by race/caste/site/entity over time
- Skill distribution histograms
- Event frequency by type and year
- Kill counts, war statistics

### Category 16: Web Frontend Features

All features from existing legends viewers matched or exceeded, plus new capabilities:

**World Map Page (Leaflet.js)**:
- Plot sites with icons by type
- Plot regions as polygons
- Timeline scrubber (see map at any world year)
- Click site → site detail panel
- Civ territory overlays

**Entity Browser Pages**:
- Historical figure detail (portrait placeholder, bio, timeline, relationships, artifacts)
- Entity/civ detail (territory, positions, population, event log)
- Site detail (structures, inhabitants, event log, population over time)
- Artifact detail (creator, holder chain timeline, current status)
- War/conflict pages with battle lists, casualties, faction comparison

**Visualizations**:
- Family tree (D3.js force graph or tree layout)
- Population over time line charts
- Skill distribution histograms
- Race/caste demographic pie/bar charts
- War/battle timeline charts
- Population statistics and demographic breakdowns

**Search**:
- Full-text + semantic search across all entity types
- Advanced filtering with aggregation (Min/Max/Sum/Avg pattern from LegendsViewer)

**Live Fortress Dashboard**:
- Real-time unit grid (Dwarf Therapist-style labor matrix — dwarves × labors × skills 2D grid)
- Live mood/stress indicators
- Active job tracking
- Recent events feed

**Existing Viewer Feature Parity (from LegendsViewer/LegendsBrowser2/LegendsViewer-Next)**:
- Historical figure pages with biography timeline, kill list, relationships, artifact history
- Entity/civilization pages with territory maps, event timelines, population data
- Site pages with structure lists, inhabitant history, event log
- Advanced search and filtering with aggregation
- Population statistics and demographic breakdowns

### Category 17: Packaging & Distribution

- **Docker Compose**: `docker-compose up` starts PostgreSQL + pgvector + backend + frontend
- **One-Command World Import**: `chronicler import /path/to/world/`
- **Auto-Detection**: Auto-detect DF installation directory (Steam path detection)
- **DFHack Integration Packaging**: Single `chronicler-dfhack.lua` script to drop in DF scripts folder
- **Community Release**: GitHub repository, README, screenshots
- **Submit to DF Community**: Bay 12 Forums, Reddit r/dwarffortress
- **User Documentation**: Setup guide, world import guide, AI usage guide

### Category 18: Development Environment & Tooling

- **DFHack Plugin Dev Workflow**: Prefer Lua scripts over C++ for initial development (hot-reload, no compile cycle). C++ only for performance-critical per-tick operations or RPC interface extension.
- **Scripting Workflow**: Develop .lua scripts in `hack/scripts/` inside DF installation; test interactively in DFHack console; use `repeatutil.registerRepeating()` for polling loops.
- **Build Dependencies (C++)**: CMake 3.21+, MSVC v143 toolchain, Perl 5 with XML::LibXML/XML::LibXSLT, Ninja, zlib, ccache.
- **Remote Interface Config**: `dfhack-config/remote-server.json` with `allow_remote: true`, port 5000.
- **Testing Strategy**: DFHack `test/` framework for Lua unit tests; pytest with test PostgreSQL instance for pipeline tests; mock DFHack RPC responses using pre-captured Protobuf binary payloads.

---

## Technology Stack

### Stack Decision Matrix

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

### Key Python Libraries

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

### macOS Development Environment Options

| Method | Cost | Apple Silicon | Performance | DFHack Support | Recommendation |
|--------|------|--------------|-------------|----------------|----------------|
| **CrossOver** | ~$74/yr | Yes | Best (Wine-based, no VM overhead) | Yes (manual install into bottle) | Primary recommendation for playing |
| **Parallels + Windows ARM** | ~$100/yr | Yes | Good (full VM) | Yes (native Windows) | Best for development isolation |
| **UTM + Windows ARM** | Free | Yes | Good (QEMU/Apple VZ) | Yes (native Windows) | Free alternative to Parallels |
| **Wineskin Winery** | Free | Yes | Moderate | Possible (complex) | Viable fallback |
| **Game Porting Toolkit 2/3** | Free (dev) | Yes | Developer evaluation only | Untested | Not recommended for daily use |
| Whisky | Archived | Yes | Was moderate | Untested | Abandoned May 2025, avoid |

**Recommended path for development workflow**: Parallels Desktop + Windows 11 ARM or UTM + Windows 11 ARM (full Windows VM gives native DFHack compilation support, full Windows Visual Studio toolchain).

---

## Implementation Architecture

### Three-Tier Development Architecture

```
┌─────────────────────────────────────┐
│  macOS Host (Development)           │
│  - VSCode / IDE                     │
│  - Python pipeline (venv)           │
│  - Git repository                   │
│  - Database (PostgreSQL local)      │
│  - Web frontend dev server          │
└────────────────┬────────────────────┘
                 │ shared folder / network
┌────────────────▼────────────────────┐
│  Windows VM / Wine Bottle (Game)    │
│  - Dwarf Fortress (Steam)           │
│  - DFHack (with custom plugin)      │
│  - DFHack TCP server on port 5000   │
│  - Lua data-emission scripts        │
└─────────────────────────────────────┘
```

### Full Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: DATA INGESTION                                     │
│                                                              │
│  [DF Game Process]                                           │
│       │                                                      │
│  [DFHack Plugin/Script]                                      │
│   ├── RemoteFortressReader RPC (live unit/map data)          │
│   └── Lua polling script (per-tick: events, state changes)  │
│       │                                                      │
│  [XML Import Pipeline]                                       │
│   ├── legends.xml (base world history)                       │
│   └── legends_plus.xml (DFHack-enriched data)               │
│       │                                                      │
│  [World-Gen Scraper]                                         │
│   └── world_sites_and_pops.txt                              │
│       │                                                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────────┐
│  LAYER 2: COMMON DATA MODEL (CDM) DATABASE                   │
│                                                              │
│  PostgreSQL + pgvector                                       │
│                                                              │
│  Core Tables:                                                │
│  world, region, site, structure                              │
│  entity (civilization), entity_position                      │
│  historical_figure, unit (live)                              │
│  history_event, history_collection                           │
│  artifact, item, material                                    │
│  relationship, entity_link, hf_link                         │
│  language, word                                              │
│  worldgen_snapshots, worldgen_params                         │
│                                                              │
│  Vector Tables (pgvector):                                   │
│  figure_embeddings (biography chunks → 2560-dim vectors)     │
│  event_embeddings (event narratives → 2560-dim vectors)      │
│  artifact_embeddings (artifact histories)                    │
│  site_embeddings (site histories)                            │
│                                                              │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴──────────┐
        │                      │
┌───────▼──────────┐  ┌────────▼─────────────────────────────┐
│  LAYER 3A:       │  │  LAYER 3B:                            │
│  AI STORYTELLER  │  │  DATA VIEWER BACKEND                  │
│                  │  │                                        │
│  RAG Pipeline:   │  │  FastAPI / REST + WebSocket           │
│  Query → embed   │  │  - Entity lookup / search             │
│  → pgvector ANN  │  │  - Timeline queries                   │
│  → context build │  │  - Demographic aggregations           │
│  → LLM prompt    │  │  - Map data serving                   │
│  → response      │  │  - Live unit state (WS push)          │
│                  │  │                                        │
│  LLM Backend:    │  └────────────────┬──────────────────────┘
│  Local (Ollama)  │                   │
│  or API (Claude) │  ┌────────────────▼──────────────────────┐
│                  │  │  LAYER 4: WEB FRONTEND                 │
└──────────────────┘  │                                        │
                       │  SvelteKit or Vue 3 + TypeScript      │
                       │  - World map (Leaflet.js)             │
                       │  - Entity browser                     │
                       │  - Family tree (D3.js)                │
                       │  - Timeline visualization             │
                       │  - Demographic charts (Observable/D3) │
                       │  - AI chat panel                      │
                       │  - Live fortress dashboard            │
                       └────────────────────────────────────────┘
```

### Project Repository Structure

```
chronicler/
├── dfhack/                         # DFHack plugin & scripts
│   ├── chronicler-emit.lua         # Live data emission script
│   ├── chronicler-export.lua       # Triggered export helper
│   ├── worldgen-bridge.lua         # Worldgen monitoring script
│   └── chronicler-bridge.lua       # Fortress-mode event bridge
├── src/
│   ├── chronicler/
│   │   ├── __init__.py
│   │   ├── cli.py                  # Click CLI entry point
│   │   ├── config.py               # Configuration (Pydantic settings)
│   │   ├── db/
│   │   │   ├── models.py           # SQLAlchemy models (CDM)
│   │   │   ├── migrations/         # Alembic migrations
│   │   │   └── queries.py          # CDM query layer
│   │   ├── ingest/
│   │   │   ├── xml_parser.py       # Legends XML ingestion
│   │   │   ├── pops_parser.py      # world_sites_and_pops.txt parser
│   │   │   ├── live_sync.py        # DFHack RPC live sync
│   │   │   └── worldgen_watch.py   # Worldgen snapshot ingestion
│   │   ├── embed/
│   │   │   ├── biography.py        # Figure biography assembler
│   │   │   ├── pipeline.py         # Embedding generation pipeline
│   │   │   └── store.py            # pgvector read/write
│   │   ├── ai/
│   │   │   ├── retrieval.py        # RAG retrieval
│   │   │   ├── prompts.py          # LLM prompt templates
│   │   │   └── storyteller.py      # Storyteller interface
│   │   └── api/
│   │       ├── main.py             # FastAPI app
│   │       ├── routes/             # Route handlers
│   │       └── ws/                 # WebSocket handlers
├── frontend/                       # SvelteKit app
│   ├── src/
│   │   ├── routes/                 # Page routes
│   │   ├── lib/
│   │   │   ├── map/                # Leaflet integration
│   │   │   ├── charts/             # D3/Observable components
│   │   │   └── api.ts              # API client
│   │   └── components/             # Svelte components
│   └── vite.config.ts
├── docker-compose.yml              # PostgreSQL + pgvector + app
├── pyproject.toml                  # Python package config
├── README.md
└── docs/
    ├── setup.md
    ├── dfhack-integration.md
    └── api-reference.md
```

### Lua Script Architecture (chronicler-bridge.lua Subsystem Pattern)

The orchestrator pattern from myDFHackScripts `FortressStatistics.lua`:
- Enable DFHack eventful hooks (ITEM_CREATED, UNIT_DEATH, JOB_COMPLETED, INVASION) at startup.
- Start a polling watcher at 500-tick intervals.
- Each subsystem (LogHandler, ItemLogger, DeathLogger, etc.) is a separate module.
- This is the exact architecture to replicate for `chronicler-bridge.lua` subsystems.

### worldgen-bridge.lua (Complete Reference Implementation)

Deploy via `repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]`. Key implementation details:
- Guard execution with `dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)`.
- Wrap `df.global.world.world_data` access in `pcall` since it is a pointer that may be nil during early phases.
- Use `ws.last_event_id_added` as a cursor to extract only newly added events since the previous poll.
- Cap new event extraction at 50 per poll to avoid JSON size explosion during RecountingLegends.
- Convert DF strings with `dfhack.df2utf()` to handle special characters in world titles.

```lua
-- worldgen-bridge.lua — Chronicler worldgen monitor
local json = require('json')
local wg_state = { last_event_id = -1, snapshots = 0 }

local STATE_NAMES = {
    [-1]='None', [0]='Initializing', [1]='PreparingElevation',
    [2]='SettingTemperature', [3]='RunningRivers',
    [4]='FormingLakesAndMinerals', [5]='GrowingVegetation',
    [6]='VerifyingTerrain', [7]='ImportingWildlife',
    [8]='RecountingLegends', [9]='Finalizing', [10]='Done',
}

local function get_worldgen_snapshot()
    local ws    = df.global.world.worldgen_status
    local parms = df.global.world.worldgen.worldgen_parms
    local snap  = {
        timestamp  = os.time(),
        state_id   = ws.state,
        state_name = STATE_NAMES[ws.state] or 'Unknown',
        seed        = parms.seed,
        world_title = dfhack.df2utf(parms.title),
        dim_x       = parms.dim_x,
        dim_y       = parms.dim_y,
        end_year    = parms.end_year,
        rivers_cur          = ws.rivers_cur,
        rivers_total        = ws.rivers_total,
        civ_count           = ws.civ_count,
        civs_left_to_place  = ws.civs_left_to_place,
        rampage_num         = ws.rampage_num,
        num_rejects         = ws.num_rejects,
        placed_caves        = ws.placed_caves,
        placed_good_evil    = ws.placed_good_evil,
        placed_megabeasts   = ws.placed_megabeasts,
        finished_prehistory = ws.finished_prehistory,
        figure_count  = #df.global.world.history.figures,
        event_count   = #df.global.world.history.events,
        era_count     = #df.global.world.history.eras,
        entity_count  = #df.global.world.entities.all,
        gen_entity_count = #ws.entities,
        gen_site_count   = #ws.sites,
        snapshot_num = wg_state.snapshots,
    }
    -- Geography (pointer may be nil early)
    local wd_ok, wd = pcall(function() return df.global.world.world_data end)
    if wd_ok and wd then
        snap.region_count    = #wd.regions
        snap.site_count      = #wd.sites
        snap.landmass_count  = #wd.landmasses
        snap.river_count     = #wd.rivers
        snap.geo_biome_count = #wd.geo_biomes
    end
    -- New events since last poll (cursor-based, capped at 50)
    local events  = df.global.world.history.events
    local ev_count = #events
    local new_events = {}
    if wg_state.last_event_id < 0 then
        wg_state.last_event_id = ws.last_event_id_added
    else
        local start_idx = ev_count
        for i = ev_count - 1, 0, -1 do
            if events[i].id <= wg_state.last_event_id then
                start_idx = i + 1; break
            end
            if i == 0 then start_idx = 0 end
        end
        local cap = math.min(ev_count, start_idx + 50)
        for i = start_idx, cap - 1 do
            local ev = events[i]
            table.insert(new_events, { id=ev.id, type=ev:getType(), year=ev.year })
            wg_state.last_event_id = ev.id
        end
    end
    snap.new_events = new_events
    wg_state.snapshots = wg_state.snapshots + 1
    return snap
end

local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
if not vs then return end
local ok, err = pcall(function()
    local snap = get_worldgen_snapshot()
    json.encode_file(snap, 'chronicler-worldgen.json')
end)
if not ok then dfhack.printerr('worldgen-bridge: ' .. tostring(err)) end
```

**Deploy**: `repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]`
**Stop**: `repeat --cancel worldgen-monitor`

### Auto-Start Hook for worldgen-bridge (`dfhack-config/init.lua`)

```lua
dfhack.onStateChange.worldgen_monitor = function(state)
    if state == SC_VIEWSCREEN_CHANGED then
        local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
        if vs then
            dfhack.run_command('repeat', '--name', 'worldgen-monitor',
                '--time', '30', '--timeUnits', 'frames',
                '--command', '[', 'worldgen-bridge', ']')
        else
            pcall(function()
                dfhack.run_command('repeat', '--cancel', 'worldgen-monitor')
            end)
        end
    end
end
```

### Death Cause Resolution Algorithm

```lua
function Helper.getIncidentDeathCauseByVictimId(unit_id)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death
           and incident.victim == unit_id then
            local cause = df.death_type[incident.death_cause]
            local killer_id = incident.criminal
            return cause, killer_id
        end
    end
    return nil, nil
end
```

### XML Coordinate Parser

**Lua/C# reference (DwarvenSurveyor)**:
```csharp
string[] pairs = coordString.Split('|');
foreach (string pair in pairs) {
    string[] xy = pair.Split(',');
    coords.Add(new Vector2Int(int.Parse(xy[0]), int.Parse(xy[1])));
}
```

**Python equivalent**:
```python
def parse_coordinates(coord_str: str) -> list[tuple[int, int]]:
    return [tuple(map(int, pair.split(','))) for pair in coord_str.split('|') if pair]
```

### Five-Phase Development Roadmap (Original Plan)

**Phase 0: Foundation (Weeks 1–2)**
Goal: Working development environment with DFHack talking to Python on macOS.
Deliverable: Python script that connects to DFHack, calls `GetUnitList` via RPC, prints unit names.

**Phase 1: CDM Design & Data Ingestion (Weeks 3–6)**
Goal: Fully populated CDM database from XML export; working live data sync for units.
Deliverable: `chronicler import --world <path>` command populates full CDM; `chronicler sync` maintains live unit data.

**Phase 2: AI Storyteller Pipeline (Weeks 7–10)**
Goal: Working AI Q&A and character biography generation from CDM data.
Deliverable: CLI storyteller that answers free-form questions about any world element with narrative responses grounded in CDM data.

**Phase 3: Data Viewer Backend (Weeks 11–14)**
Goal: REST + WebSocket API serving all viewer data.
Deliverable: Running FastAPI server with full API coverage; WebSocket live stream tested.

**Phase 4: Web Frontend (Weeks 15–20)**
Goal: Full-featured browser UI matching + exceeding existing legends viewers.
Deliverable: Feature-complete web UI running against local API.

**Phase 5: Integration, Polish & Release (Weeks 21–24)**
Goal: Packaged, distributable tool with documentation.
Deliverable: Docker Compose deployment with one-command install; community release.

---

## Data Access Patterns

### Worldgen Access Paths (All Verified for DF 53.10-r1)

```lua
-- Primary state machine
local ws         = df.global.world.worldgen_status
local state_val  = ws.state          -- int16_t: -1..10
local state_name = df.world_generatorst.T_state[state_val]

-- Progress counters
local rivers_done  = ws.rivers_cur
local rivers_total = ws.rivers_total
local civs_placed  = ws.civ_count
local civs_left    = ws.civs_left_to_place
local rampage_ct   = ws.rampage_num
local last_event   = ws.last_event_id_added  -- cursor into history.events
local num_rejects  = ws.num_rejects

-- Phase completion flags (bool)
local caves_placed      = ws.placed_caves
local good_evil_placed  = ws.placed_good_evil
local megabeasts_placed = ws.placed_megabeasts
local prehistory_done   = ws.finished_prehistory
local last_chron_time   = ws.last_chronicle_add_time  -- ulong timestamp

-- Worldgen parameters (set before generation)
local parms      = df.global.world.worldgen.worldgen_parms
local seed       = parms.seed
local title      = dfhack.df2utf(parms.title)
local dim_x      = parms.dim_x
local dim_y      = parms.dim_y
local end_year   = parms.end_year
local total_civs = parms.total_civ_number
local mega_cap   = parms.megabeast_cap
local semi_cap   = parms.semimegabeast_cap
local titan_num  = parms.titan_number
local demon_num  = parms.demon_number

-- Live history accumulation
local fig_count   = #df.global.world.history.figures
local event_count = #df.global.world.history.events
local era_count   = #df.global.world.history.eras
local mega_live   = #df.global.world.history.live_megabeasts
local semi_live   = #df.global.world.history.live_semimegabeasts

-- Geography (pointer; may be nil before terrain phase)
local wd_ok, wd = pcall(function() return df.global.world.world_data end)
if wd_ok and wd then
    local n_regions    = #wd.regions
    local n_sites      = #wd.sites
    local n_landmasses = #wd.landmasses
    local n_rivers     = #wd.rivers
    local n_geo_biomes = #wd.geo_biomes
    local n_mtn_peaks  = #wd.mountain_peaks
    local n_underground = #wd.underground_regions
    -- world_gen_wandering_group: worldgen-only temp data (nil post-worldgen)
end

-- Generator vectors (separate from world_data)
local gen_entities = #ws.entities  -- fills during prehistory
local gen_sites    = #ws.sites     -- fills during site placement

-- Viewscreen detection
local vs          = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
local in_worldgen = (vs ~= nil and vs.simple_mode == 0)
local is_done     = (ws.state == 10)
```

### Fortress-Mode Unit Access Paths

```lua
-- Active units and all units
df.global.world.units.active
df.global.world.units.all

-- Unit predicates
dfhack.units.isCitizen(unit)
dfhack.units.isMale(unit)
dfhack.units.getAge(unit)

-- Name and race resolution
dfhack.units.getReadableName(unit)
dfhack.units.getRaceName(unit)
dfhack.translation.translateName(unit.name)

-- Link to historical figure
unit.hist_figure_id

-- Historical figures
df.global.world.history.figures
dfhack.translation.translateName(histfig.name)
```

### Lineage / Relationship Access Paths

```lua
-- Parent relationships (hist_figure_ids)
unit.relationship_ids.Mother  -- hist_figure_id of mother
unit.relationship_ids.Father  -- hist_figure_id of father

-- Walk to historical figure
local hf = df.historical_figure.find(unit.relationship_ids.Mother)
```

### Death and Incident Access Paths

```lua
-- All incidents (search for death cause)
df.global.world.incidents.all
incident.type       -- compare to df.incident_type.Death
incident.victim     -- unit_id
incident.criminal   -- unit_id of killer
incident.death_cause -- enum value
df.death_type[incident.death_cause]  -- enum -> string

-- Event hooks (eventful API)
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 1)
eventful.onUnitDeath.mykey = function(unit_id) ... end
```

### Item Access Paths

```lua
df.global.world.items.all
df.item.find(item_id)
dfhack.items.getDescription(item, 0)
dfhack.items.getValue(item)
dfhack.items.getBookTitle(item)
item.flags.artifact   -- boolean
item.quality          -- 0-5 (5=masterwork)
item.maker            -- hist_figure_id
```

### Announcement / Report Access Paths

```lua
df.global.world.status.reports
local last_report = reports[#reports - 1]
last_report.text
last_report.id
last_report.repeat_count
```

### Game Date Access Paths

```lua
dfhack.world.ReadCurrentDay()
dfhack.world.ReadCurrentMonth()
dfhack.world.ReadCurrentYear()
```

### Agreements / Petitions Access Paths

```lua
df.global.world.agreements.all
-- Poll for count changes to detect new petitions
```

### DFHack State Change Events (Complete List)

```lua
SC_WORLD_LOADED     = 0  -- after worldgen + world load (CDM ingestion trigger)
SC_WORLD_UNLOADED   = 1
SC_MAP_LOADED       = 2  -- after fortress embark
SC_MAP_UNLOADED     = 3
SC_VIEWSCREEN_CHANGED = 4  -- use for worldgen screen detection
SC_CORE_INITIALIZED = 5
SC_PAUSED           = 7
SC_UNPAUSED         = 8
-- NOTE: No SC_WORLDGEN_STARTED or SC_WORLDGEN_TICK — must poll
```

### `world_generatorst` State Machine (Complete Enum)

| Value | Name | Key Data Being Written |
|-------|------|----------------------|
| -1 | None | (pre-generation) |
| 0 | Initializing | (setup) |
| 1 | PreparingElevation | `world_data.region_map` elevation grid |
| 2 | SettingTemperature | region_map temperature/rainfall |
| 3 | RunningRivers | `rivers_cur/total`, `world_data.rivers` |
| 4 | FormingLakesAndMinerals | `geo_biomes`, `underground_regions` |
| 5 | GrowingVegetation | region vegetation |
| 6 | VerifyingTerrain | world rejection check (num_rejects increments here) |
| 7 | ImportingWildlife | entity_populations |
| 8 | RecountingLegends | `history.events`, `history.figures` (bulk write, high speed) |
| 9 | Finalizing | civ placement, site naming, `civ_count/civs_left_to_place` |
| 10 | Done | all vectors complete, safe to embark or export |

### Data Available During vs After Worldgen (Complete Reference)

| Data | During Worldgen | After Worldgen |
|------|----------------|----------------|
| `worldgen_status.state` (0-10) | Yes — live phase enum | Yes (= 10) |
| `worldgen_status.rivers_cur/total` | Yes — during RunningRivers | Yes (final values) |
| `worldgen_status.civ_count/civs_left_to_place` | Yes — during Finalizing | Yes |
| `worldgen_status.rampage_num` | Yes — during beast rampages | Yes |
| `worldgen_status.entities` vector | Yes — fills during prehistory | Yes (complete) |
| `worldgen_status.sites` vector | Yes — fills during site placement | Yes (complete) |
| `worldgen_status.last_event_id_added` | Yes — cursor into history.events | Yes |
| `worldgen_status.num_rejects` | Yes — increments each rejection | Yes |
| `worldgen_status.last_chronicle_add_time` | Yes — ulong timestamp | Yes |
| `world.history.figures` count | Yes — increments live | Yes (final) |
| `world.history.events` count | Yes — increments live | Yes (final) |
| `world.history.eras` | Yes — adds eras as they start | Yes (complete) |
| `world.history.live_megabeasts` | Yes — fills during beast placement | Yes |
| `world.worldgen.worldgen_parms` | Yes — set before gen starts | Yes (preserved) |
| `world.world_data.regions` vector | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.landmasses` | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.sites` | Yes — fills during site placement | Yes (complete) |
| `world.world_data.region_map` (2D grid) | Yes — fills during PreparingElevation | Yes (complete) |
| `world.world_data.rivers` | Yes — fills during RunningRivers | Yes (complete) |
| `world.world_data.underground_regions` | Yes — fills during Forming phase | Yes (complete) |
| `world.world_data.geo_biomes` | Yes — fills during Forming phase | Yes (complete) |
| `world.world_data.mountain_peaks` | Yes — fills during terrain | Yes (complete) |
| `world.world_data.world_gen_wandering_group` | Yes — worldgen temp data only | NO (nil after completion) |
| `world.worldgen_status.placed_megabeasts` etc. (bool flags) | Yes — set when phase completes | Yes |
| `world.entities.all` | Partial — fills during prehistory | Yes (complete) |
| Fortress-mode units, squads, etc. | No — don't exist yet | Yes (after embark) |

### XML Data Structures (DwarvenSurveyor Reference)

**SiteData** (from `legends.xml`):
- `name` — site name (title-cased)
- `type` — one of 20 site types (indices 0-19)
- `coord` — `(x, y)` world tile
- `rectangle` — `(xMin, yMin, xMax, yMax)` bounding box in world tiles / 16

**RegionData** (merged `legends.xml` + `legends_plus.xml`):
- `name` — region name
- `type` — one of 10 biome types
- `evilness` — string
- `coords` — `[(x, y), ...]` — every world tile occupied by this region

**Site Type Taxonomy (20 types)**:
Camp, Cave, Dark Fortress, Dark Pits, Forest Retreat, Fortress, Castle, Fort, Hamlet, Hillocks, Labyrinth, Lair, Monastery, Mountain Halls, Ruins, Shrine, Tomb, Tower, Town, Vault

**Biome Type Taxonomy (10 types)**:
Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains

### Material Classification Lookup (myDFHackScripts MaterialHelper)

- **Gem** — precious/semi-precious gems
- **Rock** — ordinary stone
- **EconomicStone** — flux/fuel/other economic uses
- **Ore** — metal-bearing ore
- **Metal** — smelted metal bars and objects
- **Wood** — all wood types
- **Plant** — plant-derived materials
- **Creature** — bone, leather, horn, silk, wool, etc.

### df-structures: Canonical CDM Data Dictionary (Key Files)

| File | Contents Relevant to CDM |
|------|--------------------------|
| `df.unit.xml` | Live unit instance: position, job, inventory, relationships |
| `df.soul.xml` | Unit psychology: traits, values, memories, preferences |
| `df.personality.xml` | Emotions, goals, needs |
| `df.history_figure.xml` | Historical person: life events, entity links, artifacts |
| `df.history_event.xml` | All event types (100+ subtypes) |
| `df.history_collection.xml` | Wars, sieges, raids grouped as collections |
| `df.entity.xml` | Civilizations, sites, positions |
| `df.site.xml` | Site data, structures, populations |
| `df.world.xml` | Top-level world state, calendar, time |
| `df.item.xml` | Item instances, quality, wear |
| `df.artifact.xml` | Named artifacts, creator, holder chain |
| `df.language.xml` | Language, words, translations |
| `df.region.xml` | Geographic regions, biomes; `worldgen_parms` (line 44), `world_generatorst` (line 843) |
| `df.material.xml` | Material properties |

---

## Key Insights

### Insight 1: Chronicler Has a Genuine First-Mover Opportunity for Worldgen Monitoring

No tool in the DF community has ever scraped live worldgen data during generation. The DFHack maintainer explicitly acknowledged this gap in 2023 (Discussion #3774: "DFHack has very little tooling around worldgen currently"). The `worldgen_status` struct is fully mapped in df-structures, the access path is confirmed working, and the implementation pattern (extend `chronicler-bridge.lua`) is already proven. This is a low-effort, high-value feature with no competition.

### Insight 2: `worldgen_status` is a Compound (Not a Pointer) — Always Safe to Access

The `worldgen_status` field is defined as `<compound name='worldgen_status' type-name='world_generatorst'/>` in the `world` struct — it is embedded by value, not a pointer. This means it is always valid memory as long as `df.global.world` is accessible. No null pointer check is required for the struct itself, only for `world_data` (which IS a pointer).

### Insight 3: DF's Native Lua (v50+) Cannot Be Used for Observation — Must Use DFHack Lua

DF's built-in Lua environment (added in v50) is intentionally sandboxed to content description (raws, worldgen hooks for modding). It cannot read game state, write files, or access `df.global.*`. All of Chronicler's data access must go through DFHack's separate Lua 5.3 environment. The DF native worldgen hooks (`do_once`, `do_once_early`, `preprocess`, `postprocess`) are exclusively for modding content into the world.

### Insight 4: State 8 (RecountingLegends) is the High-Speed Write Phase — Poll Carefully

During state 8, the `world.history.events` and `world.history.figures` vectors grow at their fastest rate. The cursor-based approach (`last_event_id_added` + capped extraction at 50 events per poll) prevents JSON output from exploding. The `CoreSuspend` mechanism used by DFHack's `repeat` command should protect reads during active writes, but very large worlds may stress this.

### Insight 5: `worldgen_status.state == 10` Completion Detection Requires Three Conditions

The correct full completion check (derived from both df-ai and weblegends independently) is:
1. `df.global.world.worldgen_status.state == 10`
2. `#df.global.world.entities.all > 0`
3. `viewscreen_new_regionst.simple_mode == 0`

Using only condition 1 may fire too early in some edge cases. All three together confirm that worldgen is genuinely complete and ready.

### Insight 6: DwarvenSurveyor Confirms XML Data Alone Suffices for a Full World Map

DwarvenSurveyor renders a fully navigable 2D world map with biome regions, evilness overlays, and clickable site markers using only `legends.xml` and `legends_plus.xml`. This means Chronicler's post-worldgen ingestion pipeline can power a full interactive map without requiring any additional memory scraping.

### Insight 7: The Event-Loop Architecture from myDFHackScripts Validates Chronicler's Bridge Design

The `FortressStatistics.lua` orchestrator — start eventful hooks + 500-tick polling loop — is exactly the pattern already used by `chronicler-bridge.lua`. The additional event types (ITEM_CREATED, JOB_COMPLETED, INVASION) and polling targets (agreements, items/books, announcements) are immediately portable as new Chronicler bridge modules. Each is a self-contained logger with its own data access path and CDM target.

### Insight 8: `world.incidents.all` Is the Correct Path for Death Cause Resolution

Death cause is not stored on the unit struct after death. The correct lookup is to search `df.global.world.incidents.all` for an incident of type `df.incident_type.Death` where `incident.victim == unit_id`. This pattern resolves both the death cause (enum -> string) and the killer's unit_id. This is a non-obvious access path validated empirically in myDFHackScripts.

### Insight 9: `unit.relationship_ids.Mother/Father` Enables Live Lineage Without Export

Historical figure lineage (parent-child relationships) is accessible live via `unit.relationship_ids.Mother` and `.Father` (both hist_figure_ids), resolved against `df.global.world.history.figures`. Family tree construction does not require waiting for a Legends export.

### Insight 10: The `world_data.region_map` 2D Grid May Enable a Real-Time Worldgen Map Preview

The `region_map` is a `world_width x world_height` grid of `region_map_entry` structs, each containing elevation, rainfall, temperature, volcanism, and evilness values. If this pointer is accessible during the PreparingElevation phase (state 1), Chronicler could render a grayscale elevation map that updates in real time as worldgen fills in terrain — a genuinely novel visualization. Needs empirical verification on a live worldgen.

### Insight 11: Large Region Tile Counts Require Chunked Rendering

DwarvenSurveyor splits regions with >10,000 world tiles into 4 separate meshes to stay under Unity's vertex limits. Chronicler's map renderer will need viewport culling or level-of-detail tiling for large worlds (e.g., a Large world is 257x257 = 66,049 tiles total).

### Insight 12: `worldgen_parms` Struct Supports Multi-World Comparative Analysis

Because `worldgen_parms` (seed, title, dim_x, dim_y, end_year, civ caps, beast caps) is preserved in memory after worldgen and stored in the CDM, Chronicler can build a world comparison dashboard: compare final stats of multiple worlds with different seeds/parameters to help players select the richest world for their fortress.

### Insight 13: DrPhilHarmonik's df-narrator Demonstrates the XML-to-AI Pipeline

The df-narrator project proves the pipeline: single-pass XML parsing → scoring entities by significance → 1000-char Markdown chunks → embed → Qdrant/Chroma → query. This is the exact architecture for the Chronicler AI storyteller. Scoring model example: `score = events × 2 + kills × 15 + type_bonus`. The CDM approach extends this significantly by adding live data and relational context.

### Insight 14: An Embedded HTTP Server in a DFHack Plugin Is a Valid Alternative Architecture

WebLegends demonstrates that a DFHack C++ plugin can embed an HTTP server directly inside DF. For Chronicler, the external Python RPC approach is cleaner and more maintainable, but the embedded server pattern is worth knowing as a fallback — particularly for serving the worldgen-bridge JSON to the Python pipeline without file-based I/O.

### Insight 15: DFHack macOS Native Build Is Currently Unsupported

The DFHack documentation states macOS support is "currently outdated" pending DF's own macOS port, which has been cancelled. The Windows DFHack running under CrossOver/Wine or a Windows VM is the de facto path. All DFHack development must target Windows.

---

## Open Questions & Gaps

### From the Original Foundational Plan

1. **RemoteFortressReader completeness**: The complete list of available RPC methods and their Protobuf schemas requires reading the plugin source code directly (`plugins/remotefortressreader/`). Some live data may only be accessible via Lua scripts rather than RPC.
2. **Legend export completeness for Steam DF**: The wiki notes the legends XML is "currently incomplete." The degree to which `legends_plus.xml` fills the gaps for the current Steam version (DF 50.x/53.x) requires empirical testing against a real export.
3. **AI voice quality**: Whether LLM-generated "character voice" responses feel authentically grounded in DF's procedurally generated personalities depends heavily on prompt engineering and CDM data richness. Significant iteration required.
4. **Performance of live sync**: The frequency at which DFHack data can be polled without impacting DF game performance is unknown without benchmarking. 10-tick polling is a conservative starting point.
5. **SvelteKit vs Vue 3 decision**: Need to scaffold a simple proof-of-concept for the world map page to decide.

### From the Worldgen Scraping Research

6. **`world_data.region_map` accessibility during PreparingElevation**: Needs empirical verification — does the pointer become valid during state 1, or only later?
7. **`worldgen_status.entities` vs `world.entities.all` identity at completion**: Are these the same records at state == 10, or does one contain a superset?
8. **CoreSuspend stress during RecountingLegends**: On very large worlds, rapid event vector growth during state 8 may cause issues with DFHack's polling mechanism. Needs testing.

### From DwarvenSurveyor Research

9. **Chunked rendering strategy**: Whether viewport culling (web-based canvas) or mesh splitting (desktop) is better for the Chronicler world map renderer on large worlds. Architecture decision pending.
10. **`regionDataMap` pre-computation timing**: When to pre-compute the `world_width x world_height` lookup array — at import time (and store in CDM?) or at query time (in memory in the frontend)?

### From myDFHackScripts Research

11. **`world.incidents.all` performance on DFHack 53.10-r1**: Linear search through all incidents may be slow in large worlds with many death events. Need to benchmark and consider indexing.
12. **`unit.relationship_ids.Mother/Father` availability**: These fields need verification on DFHack 53.10-r1, as struct layouts can change between DF versions.

### From the Original Plan (Related Topics, Unresolved)

13. **Graphiti / knowledge graph for DF world graph**: Representing relationships between figures, entities, and events as a graph (Graphiti/Neo4j) may complement the relational CDM. This was identified as a related topic but not incorporated into the plan.
14. **Armok Vision architecture**: Referenced as a comparison for the RFR streaming approach at higher update frequencies. Not analyzed.
15. **Vox Uristi**: Referenced as a reference for efficient voxel/map data extraction via RemoteFortressReader. Not analyzed.
16. **DF modding ecosystem**: Custom raws and workshop mods that extend entity types may require CDM extension hooks for mod-added content. Not addressed.
17. **WebLegends embedded server alternative**: Whether to offer a DFHack-plugin-embedded HTTP server as an alternative to the external Python RPC approach. Trade-offs not fully analyzed.

### Gap: No Plan for These Data Sources

- `world_sites_and_pops.txt` parsing is mentioned in the architecture but not detailed.
- The degree of overlap between RemoteFortressReader RPC data and what the Lua bridge can provide is not mapped.
- How to handle DF version upgrades that change memory layouts (df-structures updates required) is not addressed.

---

## Consolidated Action Items

### Environment & Infrastructure
- [ ] Decide on VM strategy (Parallels vs UTM) and provision the environment
- [ ] Configure DFHack remote interface (`allow_remote: true`, port 5000)
- [ ] Verify RemoteFortressReader connection from macOS Python client
- [ ] Install PostgreSQL + pgvector (Docker recommended)
- [ ] Set up Python 3.12 venv with all listed dependencies
- [ ] Clone DFHack, df-structures, scripts repositories for reference
- [ ] Generate a test DF world; export legends.xml + legends_plus.xml

### CDM Schema
- [ ] Read df-structures XML files to finalize CDM schema — specifically `df.unit.xml`, `df.soul.xml`, `df.history_figure.xml`, `df.history_event.xml`
- [ ] Write CDM DDL (start from schema outline in Implementation Architecture section)
- [ ] Create `worldgen_snapshots` CDM table with full schema
- [ ] Create `worldgen_params` CDM table for cross-world comparison
- [ ] Add `evilness` field to CDM `regions` table if not already present
- [ ] Add `rectangle` (bounding box) field to CDM `sites` table if not already present
- [ ] Verify all 20 site types and 10 biome types are represented in CDM schema

### Worldgen Bridge
- [ ] Create `worldgen-bridge.lua` from the template; deploy to DF install
- [ ] Add auto-start hook to `dfhack-config/init.lua` (SC_VIEWSCREEN_CHANGED handler)
- [ ] Add Python-side `chronicler worldgen-watch` CLI command to ingest JSON snapshots
- [ ] Test on Pocket world — verify all fields increment as expected during each phase
- [ ] Write final `worldgen_complete` record to CDM when state == 10 is first detected
- [ ] Investigate `world_data.region_map` accessibility during PreparingElevation phase
- [ ] Investigate `worldgen_status.entities` vs `world.entities.all` identity at completion

### XML Ingestion
- [ ] Write streaming XML parser for a small test world (< 100MB legends.xml)
- [ ] Implement Python `parse_coordinates()` for pipe-delimited coord strings from legends_plus.xml
- [ ] Write `world_sites_and_pops.txt` parser → populate site populations

### Fortress Event Capture (chronicler-bridge.lua extensions)
- [ ] Port death cause resolution (`world.incidents.all` search) to bridge
- [ ] Port parent-chain walk (Mother/Father relationship_ids) for HF lineage extraction
- [ ] Port book detection (`dfhack.items.getBookTitle`) for written work events
- [ ] Add ITEM_CREATED hook with material classification
- [ ] Add JOB_COMPLETED hook with worker tracking
- [ ] Add INVASION hook
- [ ] Add announcement/report polling module
- [ ] Add petition/agreement polling module
- [ ] Add citizen arrival detection module
- [ ] Test `df.global.world.incidents.all` on DFHack 53.10-r1
- [ ] Test `unit.relationship_ids.Mother/Father` on DFHack 53.10-r1

### AI Pipeline
- [ ] Prototype the biography assembler and a single AI query against real DF data
- [ ] Write RAG retrieval pipeline (embed query → pgvector ANN → context assembly)
- [ ] Wire to LLM backend (Ollama local or Claude API)
- [ ] Build `chronicler ask` CLI command
- [ ] Evaluate output quality; tune prompts

### Map Visualization
- [ ] Evaluate SvelteKit vs Vue 3 by scaffolding proof-of-concept for world map page
- [ ] Design Chronicler world map UI panel architecture (web-based vs desktop)
- [ ] Implement region mesh/polygon rendering with biome color coding
- [ ] Implement site marker layer with 20-type color coding
- [ ] Implement evilness overlay toggle
- [ ] Implement pan/zoom navigation with map bounds enforcement
- [ ] Implement site/region search with camera jump
- [ ] Implement worldgen live map preview (update as terrain phases complete)
- [ ] Design chunked rendering strategy for large regions (>10,000 tiles)

---

## Sources

**From worldgen-scraping-research.md + dwarven-surveyor-scripts-research.md**:
1. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml` — `worldgen_parms` (line 44), `world_data` (line 733), `world_generatorst` (line 843)
2. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml` — world struct with worldgen_status compound
3. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml` — `world_history` struct (line 185)
4. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.d_interface.xml` — `viewscreen_new_regionst` (lines 6044-6132)
5. `/Users/nathanielcannon/Claude/GitRepos/df-ai/embark.cpp` — worldgen completion detection (line 454)
6. `/Users/nathanielcannon/Claude/GitRepos/weblegends/test/main.lua` — worldgen_status.state polling (line 46)
7. DFHack Discussion #3774 — "Streamlining Repeated Worldgen?" (2023, myk002: "DFHack has very little tooling around worldgen currently")
8. DFHack Discussion #4961 — "DFHack and DF+Lua" (2024, scope of DF native Lua)
9. DFHack `exportlegends` documentation — v53.10-r1
10. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/share/memory_layouts/linux/v0.51.04-steam_linux64.ini`
11. `DwarfGenManager` (Nikorasu) — batch worldgen automation script
12. DFHack dfhack.lua — SC_ state change event constants
13. DwarvenSurveyor Unity project — `MapXMLParser.cs`, `Region.cs`, `Site.cs`, `CameraMover.cs`, `RegionPanel.cs`, `SitePanel.cs`, `SearchButtonCameraJump.cs`, `MeshCenterFinder.cs`
14. myDFHackScripts — `FortressStatistics.lua`, `LogHandler.lua`, `Helper.lua`, `AnnouncementLogger.lua`, `ItemLogger.lua`, `DeathLogger.lua`, `JobLogger.lua`, `CitizenLogger.lua`, `PetitionLogger.lua`, `AnnounceBooks.lua`, `MaterialHelper.lua`, `LogParser.lua`, `CurveWidget.lua`, `unit.lua`

**From dwarf-fortress-project-plan.md (2026-02-18)**:
15. [Steam Community Guide: Dwarf Fortress on MacOS](https://steamcommunity.com/sharedfiles/filedetails/?id=2971770677)
16. [GamingOnLinux: Dwarf Fortress macOS cancelled](https://www.gamingonlinux.com/2024/08/dwarf-fortress-adds-dwarf-babies-an-upgraded-adventure-mode-and-more-but-macos-cancelled/)
17. [DFHack Development Overview](https://docs.dfhack.org/en/stable/docs/dev/Dev-intro.html)
18. [DFHack Lua API Reference](https://docs.dfhack.org/en/latest/docs/dev/Lua%20API.html)
19. [DFHack Remote Interface](https://docs.dfhack.org/en/stable/docs/dev/Remote.html)
20. [RemoteFortressReader — DFHack docs](https://docs.dfhack.org/en/stable/docs/tools/RemoteFortressReader.html)
21. [GitHub: DFHack/dfhack](https://github.com/DFHack/dfhack)
22. [GitHub: DFHack/df-structures](https://github.com/DFHack/df-structures)
23. [GitHub: DrPhilHarmonik/df-narrator](https://github.com/DrPhilHarmonik/df-narrator)
24. [GitHub: Dwarf-Therapist/Dwarf-Therapist](https://github.com/Dwarf-Therapist/Dwarf-Therapist)
25. [GitHub: BenLubar/df-ai](https://github.com/BenLubar/df-ai)
26. [GitHub: BenLubar/weblegends](https://github.com/BenLubar/weblegends)
27. [GitHub: Kromtec/LegendsViewer](https://github.com/Kromtec/LegendsViewer)
28. [GitHub: robertjanetzko/LegendsBrowser2](https://github.com/robertjanetzko/LegendsBrowser2)
29. [GitHub: Kromtec/LegendsViewer-Next](https://github.com/Kromtec/LegendsViewer-Next)
30. [GitHub: McArcady/dfhack-client-python](https://github.com/McArcady/dfhack-client-python)
31. [Dwarf Fortress Wiki: Legends](https://dwarffortresswiki.org/index.php/DF2014:Legends)
32. [Medium: Dwarf2Text](https://lynn-72328.medium.com/dwarf2text-a-mediocre-data-to-text-generation-project-leads-to-learning-stuff-part-1-497639d14ebc)
33. [Whisky: macOS Wine wrapper (archived)](https://github.com/Whisky-App/Whisky)
