# Research Report: Dwarf Fortress + DFHack Development Project

**Date**: 2026-02-18
**Scope**: macOS setup, DFHack development environment, repository analysis of DFHack ecosystem, feature inspiration from existing tools, product vision for AI storyteller + all-inclusive data viewer, first-iteration project plan with phased roadmap and technology stack recommendations.

---

## Executive Summary

Dwarf Fortress has no official macOS Steam release and that situation is unlikely to change in the near term; the macOS port was cancelled in August 2024. Running the Windows Steam edition through CrossOver (the recommended paid option) or via a Linux VM is the practical path forward for a development environment. DFHack is the central framework that makes all serious DF tooling possible: it exposes a live, in-process memory-access library via both C++ plugins and Lua scripts, and provides a TCP/Protobuf remote interface (RemoteFortressReader) that external applications can connect to for real-time game data streaming.

The product vision described — a Common Data Model (CDM) database fed by live DFHack polling, powering an AI storyteller and an all-inclusive data viewer — is both technically achievable and meaningfully differentiated from what exists. The current ecosystem is fragmented: legends viewers only work from XML exports, real-time tools are limited to 3D voxel renderers, and the AI storyteller space is essentially unexplored. Combining live data ingestion, historical XML import, a unified relational+vector CDM, and an LLM storytelling pipeline represents a genuinely novel contribution to the DF community.

The project is scoped into five phases: (1) environment setup and data exploration, (2) CDM database design and initial data ingestion, (3) AI storyteller pipeline, (4) data viewer frontend, (5) integration, polish, and community release. The recommended stack centers on Python for the data pipeline and AI layer, with a Lua/C++ DFHack plugin for data emission, PostgreSQL + pgvector for the CDM, and a modern web frontend (SvelteKit or Vue 3) for the viewer.

---

## Part 1: macOS Setup Guide

### 1.1 Situation: No Native macOS Support

The Dwarf Fortress Steam Edition has no native macOS build. Bay 12 Games cancelled the macOS port in August 2024. The free classic (legacy) version of DF also does not provide an ARM-native binary. All macOS users must run the Windows edition through a compatibility layer.

### 1.2 Option Comparison

| Method | Cost | Apple Silicon | Performance | DFHack Support | Recommendation |
|--------|------|--------------|-------------|----------------|----------------|
| **CrossOver** | ~$74/yr | Yes | Best (Wine-based, no VM overhead) | Yes (manual install into bottle) | Primary recommendation |
| **Parallels + Windows ARM** | ~$100/yr | Yes | Good (full VM) | Yes (native Windows) | Best for development isolation |
| **UTM + Windows ARM** | Free | Yes | Good (QEMU/Apple VZ) | Yes (native Windows) | Free alternative to Parallels |
| **Wineskin Winery** | Free | Yes | Moderate | Possible (complex) | Viable fallback |
| **Game Porting Toolkit 2/3** | Free (dev) | Yes | Developer evaluation only | Untested | Not recommended for daily use |
| Whisky | Archived | Yes | Was moderate | Untested | Abandoned May 2025, avoid |

**Recommended path for a development workflow**: Use **Parallels Desktop + Windows 11 ARM** or **UTM + Windows 11 ARM**. A full Windows VM gives you native DFHack compilation support, the full Windows Visual Studio toolchain, and a clean environment that matches DFHack's primary build target. CrossOver is excellent for playing the game but introduces complexity when you need to compile C++ plugins into the same Wine bottle.

**Recommended path for playing/testing only**: **CrossOver** is the most polished Wine-based option following Whisky's deprecation. Install a Windows bottle, use SteamCMD to install DF (since you cannot browse the Steam store from a Wine bottle natively), then manually install DFHack into the `Dwarf Fortress` folder inside the bottle.

### 1.3 CrossOver + SteamCMD Setup Steps

```
1. Install CrossOver from codeweavers.com (free 14-day trial available)
2. Create a new Windows 10 bottle named "DwarfFortress"
3. Install Visual C++ 2015-2022 Redistributable via Winetricks inside the bottle
4. Download SteamCMD for Windows into the bottle and run it
5. Use SteamCMD: login <username> / app_update 975370 validate
6. Download DFHack Windows release matching your DF version from github.com/DFHack/dfhack/releases
7. Extract DFHack into the Dwarf Fortress folder inside the bottle
8. Launch dfhack.bat instead of Dwarf Fortress.exe
```

**Known issue**: If the game fails to start with `msvcp140_atomic_wait.dll is missing`, open Wine Config inside the bottle, go to Libraries tab, type `msvcp140_atomic_wait` in the override box, and click Add.

### 1.4 Windows VM Setup Steps (Parallels or UTM)

```
1. Install Parallels Desktop (or UTM for free option)
2. Install Windows 11 ARM from the Microsoft website (available as free download)
3. Inside Windows: install Steam normally from store.steampowered.com
4. Purchase and install Dwarf Fortress from Steam
5. Download DFHack from github.com/DFHack/dfhack/releases (Windows 64-bit)
6. Extract into the DF Steam installation directory
7. Launch using dfhack.bat shortcut
8. Verify: type `version` in the DFHack console
```

---

## Part 2: Development Environment Design

### 2.1 Architecture Overview

The development workflow has three tiers:

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

The DFHack remote interface (TCP/Protobuf on port 5000) bridges the game environment to the macOS host. Your Python pipeline connects as an external client, polls data, and writes into the CDM database. This means DFHack plugin/script development happens inside the Windows environment, while all database, AI pipeline, and frontend code is developed natively on macOS.

### 2.2 DFHack Plugin Development Workflow

**Language choice**: For the data emission layer, prefer **Lua scripts** over C++ plugins for initial development. Lua scripts can be hot-reloaded without restarting DF (just re-run the script), are significantly easier to iterate on, and have full access to the `df.*` global namespace covering all memory structures. C++ plugins are necessary only for performance-critical, per-tick operations or if you need to extend the RPC interface with new Protobuf methods.

**Scripting workflow**:
```
1. Clone DFHack/scripts alongside your project
2. Develop .lua scripts in hack/scripts/ inside the DF installation
3. Test interactively in DFHack console: script my-script.lua
4. Use dfhack.run_script() for programmatic invocation
5. Use repeatutil.registerRepeating() for polling loops
6. Access all structures via the df.* global
```

**Plugin workflow (C++ only when necessary)**:
```
1. Clone DFHack with submodules: git clone --recursive https://github.com/DFHack/dfhack
2. Use Docker for cross-compilation: scripts/docker-build.sh (produces Windows .plug.dll)
3. Copy .plug.dll into Dwarf Fortress/hack/plugins/
4. Hot-reload: load my-plugin in DFHack console (no DF restart needed)
5. Use plugins/examples/skeleton.cpp as starting template
```

**Build dependencies** (inside Windows VM or Docker):
- CMake 3.21+
- MSVC v143 toolchain (Visual Studio 2022) for Windows target
- Perl 5 with XML::LibXML and XML::LibXSLT (Strawberry Perl on Windows)
- Ninja build system (faster than Make for incremental builds)
- zlib, ccache (strongly recommended for build performance)

**Remote interface setup** (allows macOS host to talk to DFHack):
```json
// Inside DF folder: dfhack-config/remote-server.json
{
  "allow_remote": true,
  "port": 5000
}
```
The VM's port 5000 must be forwarded to the macOS host (Parallels does this automatically; for UTM, configure port forwarding in VM network settings).

### 2.3 External Client Libraries

For the Python pipeline on macOS, use the existing Python client:
- **dfhack-client-python** (McArcady) — `github.com/McArcady/dfhack-client-python`
- Alternatively, generate Python Protobuf bindings directly from DFHack's `.proto` files in `plugins/remotefortressreader/`

The RemoteFortressReader plugin (bundled with DFHack) exposes the richest real-time data API including: `GetUnitList`, `GetBlockList`, `GetMaterialList`, `GetPlantList`, `GetMapInfo`, `GetViewInfo`, and `GetTiletypeList`. This is the primary data channel for live game state.

### 2.4 Testing Strategy

- **Unit testing Lua scripts**: DFHack has a `test/` framework in the scripts repo; use `test/` directory for script unit tests
- **Integration testing**: Create a saved game in a known state; automate via DFHack's `script` command from command line using `dfhack-run`
- **Pipeline testing**: Mock DFHack RPC responses using pre-captured Protobuf binary payloads
- **Database testing**: pytest with a test PostgreSQL instance; fixtures from XML export files

---

## Part 3: Repository Analysis

### 3.1 DFHack Core (github.com/DFHack/dfhack)

**What it is**: A memory-access library for Dwarf Fortress, distributed with scripts and plugins. It acts as a shim/wrapper loaded alongside DF that provides:
- Full read/write access to all in-memory game structures via the `df.*` namespace
- A Lua scripting environment with hot-reload capability
- A C++ plugin system with per-tick hooks and console command registration
- A TCP/Protobuf RPC server (default port 5000) for external tool connectivity

**Architecture**:
- `library/` — core DFHack library, data structure bindings
- `library/xml/` — submodule pointing to df-structures; generates C++ headers and Lua wrappers at build time via Perl XSLT transforms
- `plugins/` — C++ plugins, including RemoteFortressReader
- `scripts/` — submodule pointing to DFHack/scripts (Lua)
- Language split: C++ (~75%), Lua (~15.5%), C (~8.2%)
- 20,000+ commits, 206 contributors, actively maintained

**Key capability for this project**: The `df.*` global in Lua provides direct access to every game structure defined in df-structures — units, history figures, entities, sites, items, world, personality. The RPC interface allows an external Python process to call any registered RPC method including all RemoteFortressReader endpoints.

### 3.2 DFHack Scripts (github.com/DFHack/scripts)

A separate repository (tracked as a submodule) containing ~300 Lua scripts organized as:
- Root scripts: game manipulation, automation, fixes
- `gui/` — interactive UI overlays built with DFHack's widget library
- `devel/` — developer introspection tools (very useful for building the CDM)
- `fix/` — in-game bug patches

**Particularly relevant scripts for this project**:
- Scripts in `devel/` expose how to enumerate all unit data, iterate history figures, and inspect world state
- `exportlegends` hooks the legends export to produce the enhanced `legends_plus.xml`
- The `list-unit-skills`, `view-item-refs`, and related inspection scripts show which `df.*` paths hold which data

### 3.3 df-structures (github.com/DFHack/df-structures)

XML definitions of every Dwarf Fortress memory structure, mapping field names to memory layout. This is the canonical data dictionary for the CDM design. Key structure files:

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
| `df.region.xml` | Geographic regions, biomes |
| `df.material.xml` | Material properties |

The structures are validated against `data-definition.xsd` and processed by Perl scripts at DFHack build time to generate C++ headers and Lua accessor wrappers.

---

## Part 4: Feature Inspiration Analysis

### 4.1 DrPhilHarmonik's DF Tools

This developer has built exactly the prototype pipeline this project targets, purely in Python against legends XML:
- **df-narrator** — parses `legends.xml` in a single pass, scores entities by significance, outputs ~1000-char Markdown chunks optimized for vector store ingestion, with a chatbot ingestion pipeline (`embed → Qdrant/Chroma → query`)
- **df-sites-analyzer**, **df-figures-analyzer**, **df-wars-analyzer**, **df-artifacts-analyzer** — focused analyzers demonstrating the breadth of legends data available

**Key lessons**:
- Single-pass XML parsing is viable even for 1GB+ legends files
- Scoring models (e.g., `score = events × 2 + kills × 15 + type_bonus`) effectively identify narratively interesting entities
- The output → embed → vector store pipeline is the correct architecture for the AI storyteller
- These tools are Python-only, XML-only (no live data), and not integrated with a database — the CDM approach extends this significantly

### 4.2 Dwarf Therapist (github.com/Dwarf-Therapist/Dwarf-Therapist)

A companion utility reading DF process memory directly (no DFHack dependency) via ptrace (Linux) or equivalent OS APIs.
- Technology: C++/Qt5, CMake
- Demonstrates: what unit-level data (skills, labors, attributes, traits, moods) can be read live from the running game
- Limitation for this project: does not use DFHack's structured API; maintenance burden of direct memory offsets without DFHack's XML-defined structures
- **Lesson**: The data model (dwarves × labors × skills as a 2D grid) is the right mental model for the demographic visualization layer

### 4.3 df-ai (github.com/BenLubar/df-ai)

An autonomous fort management DFHack plugin — the most comprehensive example of using DFHack's plugin API for complex game state reading and writing.
- Shows how to subscribe to per-tick events via `event_manager`
- Demonstrates modular subsystem design (plan, population, stocks, military)
- Configuration via `dfhack-config/df-ai.json` is a good pattern for the data emission plugin
- **Lesson**: Use DFHack's event system rather than brute-force polling where possible; subscribe to `unit_new_active`, `unit_death`, `job_completed`, etc.

### 4.4 WebLegends (github.com/BenLubar/weblegends)

A DFHack C++ plugin embedding an HTTP server directly inside DF, serving Wikipedia-style world history pages.
- Architecture: plugin → embedded HTTP server → render C++ → browser
- Data sources: all legends data via DFHack's in-process API (no file export needed)
- Notable: optional integration with df-ai for monitoring AI fort state
- **Lesson**: An embedded HTTP server in a DFHack plugin is a valid architecture for live data serving; however for this project, the RPC bridge to an external Python process is cleaner and more maintainable

### 4.5 Legends Viewers Comparison

| Tool | Language | Data Source | Status | Notable Features |
|------|----------|-------------|--------|------------------|
| **LegendsViewer** | C#/.NET, JS | XML export + legends_plus.xml | Unmaintained (pre-Steam) | Advanced search with Min/Max/Sum/Avg; temporal map navigation |
| **LegendsBrowser2** | Go + HTML/CSS/JS | legends.xml + legends_plus.xml | Active (v2.0.10, Jun 2025) | Single binary, fast XML streaming, server mode |
| **LegendsViewer-Next** | .NET 8 + Vue 3 + TypeScript | legends.xml + legends_plus.xml | Active (v1.2.0, Apr 2025) | Leaflet.js maps, family trees, paginated tables |

**Collective feature inventory to match or exceed**:
- Interactive world map with site markers and temporal navigation (year scrubbing)
- Historical figure pages with biography timeline, kill list, relationships, artifact history
- Entity/civilization pages with territory maps, event timelines, population data
- Site pages with structure lists, inhabitant history, event log
- War/conflict pages with battle lists, casualties, faction comparison
- Artifact pages with full transfer chain (creator → holder → current location)
- Family tree visualization for dynasties
- Advanced search and filtering with aggregation
- Population statistics and demographic breakdowns

**Gaps in existing tools** (where this project adds value):
- No live data (everything requires export → reload cycle)
- No AI-powered Q&A or narrative generation
- No unified CDM connecting live game state to historical data
- No demographic visualization (population pyramids, skill distributions, migration flows)
- No world-gen data scraping integration
- LegendsViewer is Windows-only and unmaintained; LegendsBrowser2/LegendsViewer-Next have no live data

---

## Part 5: Product Vision Document

### 5.1 Project Name Proposal

**"Chronicler"** — A living record of every world Dwarf Fortress generates.

### 5.2 Core Design Philosophy

Every procedurally generated DF world is a novel. The characters have backstories, traumas, achievements, and relationships. The civilizations rise and fall through wars, plagues, and migrations. The artifacts change hands across centuries. Most players never see 5% of the history their world generates. Chronicler makes all of it visible, searchable, and narratable.

Two mutually reinforcing purposes:

**Purpose 1 — The AI Storyteller**: A conversational interface that knows your world as well as any bard in it. You can ask "who was the most tragic dwarf in the history of Uristmcbronze?" and get a coherent character study drawing on their biography, relationships, and the events that shaped them. You can ask "tell me the story of the Fall of Bladetower" and receive a narrative with named characters speaking in voices consistent with their psychological profiles.

**Purpose 2 — The Living Atlas**: An all-inclusive data viewer, running in your browser, showing everything from world-generation demographics to your current fortress population in real time. A single place that does everything LegendsViewer, LegendsBrowser, and LegendsViewer-Next do, unified into one coherent experience, with the addition of live data and demographic analytics no existing tool provides.

### 5.3 Data Flow Architecture

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

### 5.4 Common Data Model Entity Schema

The CDM bridges live game data (from DFHack RPC) with historical data (from XML exports) using a unified relational model. Key design decisions:
- All IDs are namespaced: `{world_id}:{entity_type}:{game_id}` to support multiple worlds
- `source` column on all entities: `'live' | 'legends_xml' | 'legends_plus' | 'world_gen_txt'`
- `updated_at` timestamp on live-polled entities for change detection
- `embedding_id` FK to vector tables for entities that have narrative embeddings

**Core entities**:

```sql
-- World container (one per DF world)
world(id, name, altname, year_current, year_began, params_json)

-- Geography
region(id, world_id, name, type, coords_json)
site(id, world_id, name, type, coords, owner_entity_id, civ_id)
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
```

### 5.5 AI Storyteller Design

The storyteller operates as a RAG pipeline with structured context assembly:

**Character profile generation**:
1. Retrieve historical_figure + unit records from CDM
2. Pull all history_events involving that figure (sorted chronologically)
3. Pull relationship graph (2 hops: direct contacts + their notable events)
4. Pull artifacts created or held
5. Assemble structured "character brief" (birth → formative events → achievements → death)
6. Vector similarity search for thematically related events/figures
7. Inject into LLM with persona prompt: `"You are narrating the life of {name}. Their personality traits are: {soul_data}. Their documented history is: {timeline}. Speak as a bard who knew them personally."`

**World Q&A**:
1. Embed user query
2. ANN search across all embedding tables
3. Retrieve top-k relevant chunks (figures + events + sites)
4. LLM answers with full source attribution

**Voice emulation**:
- Use unit's `soul_data` (traits, beliefs, goals, needs) to derive a personality description
- Map DF trait scores to narrative personality dimensions
- Include key life events as formative context
- Ground LLM responses in the character's documented worldview

---

## Part 6: First-Iteration Project Plan

### Phase 0: Foundation (Weeks 1–2)

**Goal**: Working development environment with DFHack talking to Python on macOS.

**Tasks**:
- [ ] Set up Windows VM (Parallels or UTM) with DF Steam + DFHack
- [ ] Configure DFHack remote interface (`allow_remote: true`)
- [ ] Verify RemoteFortressReader connection from macOS Python client
- [ ] Install PostgreSQL + pgvector on macOS (via Homebrew or Docker)
- [ ] Set up Python 3.12 venv with: `grpcio`, `protobuf`, `psycopg2`, `sqlalchemy`, `pydantic`, `fastapi`, `uvicorn`
- [ ] Clone DFHack, df-structures, scripts repositories for reference
- [ ] Generate a test DF world and export legends.xml + legends_plus.xml
- [ ] Parse and explore the XML structure with Python; verify all expected entity types are present
- [ ] Write a minimal Lua script that polls `df.world.units.active` and logs to DFHack console

**Deliverable**: Python script that connects to DFHack, calls `GetUnitList` via RPC, and prints unit names to terminal.

### Phase 1: CDM Design & Data Ingestion (Weeks 3–6)

**Goal**: Fully populated CDM database from XML export; working live data sync for units.

**Tasks**:
- [ ] Finalize CDM schema (PostgreSQL DDL); create Alembic migrations
- [ ] Write XML import pipeline: parse legends.xml + legends_plus.xml → CDM
  - Parse order: world → regions → sites → entities → historical_figures → events → artifacts
  - Streaming parser (SAX/iterparse) for large files (1GB+)
  - Track import progress; support incremental re-import
- [ ] Write world_sites_and_pops.txt parser → populate site populations
- [ ] Write DFHack Lua polling script:
  - Poll `df.world.units.active` every 10 ticks
  - Emit unit state changes via DFHack RPC or write to a local socket
  - Track: position, job, mood, stress, skills, labors, relationships
- [ ] Write Python RPC client for live data sync:
  - Connect to RemoteFortressReader
  - Poll `GetUnitList` every N seconds
  - Diff against CDM `unit` table; write changes
- [ ] Write CDM query layer (SQLAlchemy models + query functions)
- [ ] Write tests: XML import correctness, live sync idempotency, query correctness

**Deliverable**: `chronicler import --world <path>` command populates full CDM; `chronicler sync` maintains live unit data while DF is running.

### Phase 2: AI Storyteller Pipeline (Weeks 7–10)

**Goal**: Working AI Q&A and character biography generation from CDM data.

**Tasks**:
- [ ] Set up embedding pipeline:
  - Use existing Qdrant infrastructure (jarvis-context pattern) or standalone pgvector
  - Generate embeddings for: historical figures (biography text), events (narrative text), sites (history text), artifacts (description + history)
  - Store embeddings in pgvector with FK to CDM records
  - Use qwen3-embedding:4b (2560-dim) for consistency with Jarvis infrastructure
- [ ] Write biography assembler:
  - Given figure_id: pull CDM records, assemble structured text biography
  - Include: life events timeline, relationships, artifacts, entity positions held
  - Chunk into ~1000-char segments for embedding
- [ ] Write RAG retrieval pipeline:
  - Embed query → ANN search pgvector → retrieve top-k chunks + CDM context
  - Assemble LLM context with structured sections
- [ ] Write LLM prompt templates:
  - Character biography narrative
  - Event description / battle account
  - Civilization history
  - Dwarf voice Q&A (in-character)
  - World Q&A (bard/narrator voice)
- [ ] Wire to LLM backend (Ollama local or Claude API)
- [ ] Build simple CLI interface: `chronicler ask "who was Urist McBronze?"`
- [ ] Evaluate output quality; tune prompts; test with diverse queries

**Deliverable**: CLI storyteller that answers free-form questions about any world element with narrative responses grounded in CDM data.

### Phase 3: Data Viewer Backend (Weeks 11–14)

**Goal**: REST + WebSocket API serving all viewer data.

**Tasks**:
- [ ] Design API schema (OpenAPI 3.0):
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
- [ ] Implement FastAPI backend
- [ ] Implement WebSocket live unit stream
- [ ] Implement demographic aggregation queries:
  - Population by race/caste/site/entity over time
  - Skill distribution histograms
  - Event frequency by type and year
  - Kill counts, war statistics
- [ ] Write API tests (pytest + httpx)

**Deliverable**: Running FastAPI server with full API coverage; WebSocket live stream tested.

### Phase 4: Web Frontend (Weeks 15–20)

**Goal**: Full-featured browser UI matching + exceeding existing legends viewers.

**Tasks**:
- [ ] Set up SvelteKit (or Vue 3 + Vite) project
- [ ] Implement world map page (Leaflet.js):
  - Plot sites with icons by type
  - Plot regions as polygons
  - Timeline scrubber (see map at any world year)
  - Click site → site detail panel
  - Civ territory overlays
- [ ] Implement entity browser pages:
  - Historical figure detail (portrait placeholder, bio, timeline, relationships, artifacts)
  - Entity/civ detail (territory, positions, population, event log)
  - Site detail (structures, inhabitants, event log, population over time)
  - Artifact detail (creator, holder chain timeline, current status)
- [ ] Implement family tree visualization (D3.js force graph or tree layout)
- [ ] Implement demographic charts (D3.js / Observable Plot):
  - Population over time line charts
  - Skill distribution histograms
  - Race/caste demographic pie/bar charts
  - War/battle timeline charts
- [ ] Implement search page (full-text + semantic, all entity types)
- [ ] Implement live fortress dashboard:
  - Real-time unit grid (Dwarf Therapist-style labor matrix)
  - Live mood/stress indicators
  - Active job tracking
  - Recent events feed
- [ ] Integrate AI chat panel:
  - Floating chat interface
  - Context-aware: `"tell me about this dwarf"` when viewing a figure page
  - Response with inline links to referenced entities
- [ ] Implement dark theme, responsive layout

**Deliverable**: Feature-complete web UI running against local API.

### Phase 5: Integration, Polish & Release (Weeks 21–24)

**Goal**: Packaged, distributable tool with documentation.

**Tasks**:
- [ ] Docker Compose packaging: `docker-compose up` starts PostgreSQL + pgvector + backend + frontend
- [ ] One-command world import: `chronicler import /path/to/world/`
- [ ] Auto-detection of DF installation directory (Steam path detection)
- [ ] DFHack integration packaging: single `chronicler-dfhack.lua` script to drop in DF scripts folder
- [ ] Write user documentation: setup guide, world import guide, AI usage guide
- [ ] Performance optimization: database indexes, query caching, lazy loading in frontend
- [ ] Community release: GitHub repository, README, screenshots
- [ ] Submit to DF community: Bay 12 Forums, Reddit r/dwarffortress

---

## Part 7: Technology Stack Recommendations

### 7.1 Stack Decision Matrix

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

### 7.2 Key Libraries

```
# Python dependencies
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

### 7.3 Project Repository Structure

```
chronicler/
├── dfhack/                     # DFHack plugin & scripts
│   ├── chronicler-emit.lua     # Live data emission script
│   └── chronicler-export.lua   # Triggered export helper
├── src/
│   ├── chronicler/
│   │   ├── __init__.py
│   │   ├── cli.py              # Click CLI entry point
│   │   ├── config.py           # Configuration (Pydantic settings)
│   │   ├── db/
│   │   │   ├── models.py       # SQLAlchemy models (CDM)
│   │   │   ├── migrations/     # Alembic migrations
│   │   │   └── queries.py      # CDM query layer
│   │   ├── ingest/
│   │   │   ├── xml_parser.py   # Legends XML ingestion
│   │   │   ├── pops_parser.py  # world_sites_and_pops.txt parser
│   │   │   └── live_sync.py    # DFHack RPC live sync
│   │   ├── embed/
│   │   │   ├── biography.py    # Figure biography assembler
│   │   │   ├── pipeline.py     # Embedding generation pipeline
│   │   │   └── store.py        # pgvector read/write
│   │   ├── ai/
│   │   │   ├── retrieval.py    # RAG retrieval
│   │   │   ├── prompts.py      # LLM prompt templates
│   │   │   └── storyteller.py  # Storyteller interface
│   │   └── api/
│   │       ├── main.py         # FastAPI app
│   │       ├── routes/         # Route handlers
│   │       └── ws/             # WebSocket handlers
├── frontend/                   # SvelteKit app
│   ├── src/
│   │   ├── routes/             # Page routes
│   │   ├── lib/
│   │   │   ├── map/            # Leaflet integration
│   │   │   ├── charts/         # D3/Observable components
│   │   │   └── api.ts          # API client
│   │   └── components/         # Svelte components
│   └── vite.config.ts
├── docker-compose.yml          # PostgreSQL + pgvector + app
├── pyproject.toml              # Python package config
├── README.md
└── docs/
    ├── setup.md
    ├── dfhack-integration.md
    └── api-reference.md
```

---

## Action Items

- [ ] Decide on VM strategy (Parallels vs UTM) and provision the environment
- [ ] Purchase or trial CrossOver if VM approach is not preferred for running the game
- [ ] Generate a test world in DF with full world-gen and export legends.xml + legends_plus.xml for CDM design validation
- [ ] Read through df-structures XML files to finalize CDM schema — specifically `df.unit.xml`, `df.soul.xml`, `df.history_figure.xml`, `df.history_event.xml`
- [ ] Install dfhack-client-python and write a proof-of-concept RPC connection to DF
- [ ] Set up PostgreSQL + pgvector locally (Docker recommended for portability)
- [ ] Write the CDM DDL (start from the schema outline in 5.4)
- [ ] Write the streaming XML parser for a small test world (< 100MB legends.xml)
- [ ] Prototype the biography assembler and a single AI query against real DF data
- [ ] Evaluate SvelteKit vs Vue 3 by scaffolding a simple proof-of-concept for the world map page

---

## Sources

1. [Steam Community Guide: Dwarf Fortress on MacOS](https://steamcommunity.com/sharedfiles/filedetails/?id=2971770677)
2. [GamingOnLinux: Dwarf Fortress macOS cancelled](https://www.gamingonlinux.com/2024/08/dwarf-fortress-adds-dwarf-babies-an-upgraded-adventure-mode-and-more-but-macos-cancelled/)
3. [CodeWeavers CrossOver: Dwarf Fortress Compatibility](https://www.codeweavers.com/compatibility/crossover/dwarf-fortress)
4. [DFHack Development Overview — latest docs](https://docs.dfhack.org/en/stable/docs/dev/Dev-intro.html)
5. [DFHack Compilation — latest docs](https://docs.dfhack.org/en/stable/docs/dev/compile/Compile.html)
6. [DFHack Dependencies — latest docs](https://docs.dfhack.org/en/stable/docs/dev/compile/Dependencies.html)
7. [DFHack Lua API Reference — latest docs](https://docs.dfhack.org/en/latest/docs/dev/Lua%20API.html)
8. [DFHack Remote Interface — latest docs](https://docs.dfhack.org/en/stable/docs/dev/Remote.html)
9. [RemoteFortressReader — DFHack docs](https://docs.dfhack.org/en/stable/docs/tools/RemoteFortressReader.html)
10. [DFHack exportlegends — DFHack docs](https://docs.dfhack.org/en/stable/docs/tools/exportlegends.html)
11. [GitHub: DFHack/dfhack](https://github.com/DFHack/dfhack)
12. [GitHub: DFHack/scripts](https://github.com/DFHack/scripts)
13. [GitHub: DFHack/df-structures](https://github.com/DFHack/df-structures)
14. [GitHub: DrPhilHarmonik/df-narrator](https://github.com/DrPhilHarmonik/df-narrator)
15. [GitHub: DrPhilHarmonik/df-sites-analyzer](https://github.com/DrPhilHarmonik/df-sites-analyzer)
16. [GitHub: Dwarf-Therapist/Dwarf-Therapist](https://github.com/Dwarf-Therapist/Dwarf-Therapist)
17. [GitHub: BenLubar/df-ai](https://github.com/BenLubar/df-ai)
18. [GitHub: BenLubar/weblegends](https://github.com/BenLubar/weblegends)
19. [GitHub: Kromtec/LegendsViewer](https://github.com/Kromtec/LegendsViewer)
20. [GitHub: robertjanetzko/LegendsBrowser2](https://github.com/robertjanetzko/LegendsBrowser2)
21. [GitHub: Kromtec/LegendsViewer-Next](https://github.com/Kromtec/LegendsViewer-Next)
22. [GitHub: McArcady/dfhack-client-python](https://github.com/McArcady/dfhack-client-python)
23. [GitHub: plule/dfhack-remote (Rust)](https://github.com/plule/dfhack-remote)
24. [GitHub: alexchandel/dfhack-remote (JS)](https://github.com/alexchandel/dfhack-remote)
25. [Dwarf Fortress Wiki: XML dump](https://dwarffortresswiki.org/index.php/XML_dump)
26. [Dwarf Fortress Wiki: DF2014 XML dump](https://dwarffortresswiki.org/index.php/DF2014:XML_dump)
27. [Dwarf Fortress Wiki: Legends](https://dwarffortresswiki.org/index.php/DF2014:Legends)
28. [Apple Game Porting Toolkit — Developer](https://developer.apple.com/games/game-porting-toolkit/)
29. [AppleInsider: Game Porting Toolkit 2 exits beta](https://appleinsider.com/articles/25/01/16/game-porting-toolkit-2-exits-beta-to-help-developers-move-to-macos)
30. [Whisky: macOS Wine wrapper (archived)](https://github.com/Whisky-App/Whisky)
31. [AppleInsider: Whisky development ends](https://appleinsider.com/articles/25/04/16/whisky-development-ends-on-macos-to-help-wine-flourish)
32. [NVIDIA: Evolving AI-Powered Game Development with RAG](https://developer.nvidia.com/blog/evolving-ai-powered-game-development-with-retrieval-augmented-generation/)
33. [Medium: Dwarf2Text — DF legends data to text generation](https://lynn-72328.medium.com/dwarf2text-a-mediocre-data-to-text-generation-project-leads-to-learning-stuff-part-1-497639d14ebc)
34. [Utility:DF Storyteller — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Utility:DF_Storyteller)
35. [kelvie/dfhack-build-env — GitHub](https://github.com/kelvie/dfhack-build-env)

---

## Uncertainties

- **DFHack macOS native build status**: The documentation states macOS support is "currently outdated" pending DF's own macOS port, which has been cancelled. Whether the community will maintain macOS DFHack builds independently is unknown. The Windows DFHack running under CrossOver/Wine is the de facto path.
- **RemoteFortressReader completeness**: The RPC API exposed by RemoteFortressReader has not been fully documented. The complete list of available methods and their Protobuf schemas requires reading the plugin source code directly (`plugins/remotefortressreader/`). Some live data may only be accessible via Lua scripts rather than RPC.
- **Legend export completeness for Steam DF**: The wiki notes the legends XML is "currently incomplete." The degree to which `legends_plus.xml` fills the gaps for the current Steam version (DF 50.x) is not fully documented. Empirical testing against a real export is required.
- **AI voice quality**: Whether LLM-generated "character voice" responses feel authentically grounded in DF's procedurally generated personalities depends heavily on prompt engineering and the richness of the CDM data. This will require significant iteration.
- **Performance of live sync**: The frequency at which DFHack data can be polled without impacting DF game performance is unknown without benchmarking. A 10-tick polling interval is a conservative starting point.

## Related Topics

- Graphiti / knowledge graph approaches for representing the DF world graph (relationships between figures, entities, events) — may complement the relational CDM
- Port of WebLegends embedded-server pattern as an alternative to external RPC for the live data API
- DF modding ecosystem: custom raws, workshop mods that extend entity types (CDM may need extension hooks for mod-added content)
- Armok Vision architecture as a reference for the RFR streaming approach at higher update frequencies
- Vox Uristi as a reference for efficient voxel/map data extraction via RemoteFortressReader
