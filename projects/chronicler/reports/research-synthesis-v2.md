# Chronicler Research Synthesis v2

**Date**: 2026-02-25
**Version**: 2.0
**Scope**: Comprehensive synthesis of 8 component-oriented research reports, 17+ repository deep-dives, and 2,000+ lines of planning history. Consolidates every feature, implementation pattern, data model decision, and reference tool insight discovered across the entire Chronicler research effort.

**Purpose**: This document serves as the definitive reference for all Chronicler product features, technical approaches, and ecosystem knowledge. It replaces the earlier research-synthesis.md (v1, 488 lines, 2026-02-23).

---

## Table of Contents

1. [Landscape Overview](#1-landscape-overview)
2. [Component Architecture](#2-component-architecture)
3. [Feature Inventory Summary](#3-feature-inventory-summary)
4. [Event Type Taxonomy](#4-event-type-taxonomy)
5. [Data Model & CDM Schema](#5-data-model--cdm-schema)
6. [Data ETL Systems](#6-data-etl-systems)
7. [Visualization & Map System](#7-visualization--map-system)
8. [Database Explorer](#8-database-explorer)
9. [AI Storyteller & Narrative Engine](#9-ai-storyteller--narrative-engine)
10. [AI Fortress Player & Advisor](#10-ai-fortress-player--advisor)
11. [Mod Management](#11-mod-management)
12. [Labor Manager](#12-labor-manager)
13. [Knowledge Horizon](#13-knowledge-horizon)
14. [Scoring & Ranking System](#14-scoring--ranking-system)
15. [Cross-Linking & Navigation Patterns](#15-cross-linking--navigation-patterns)
16. [Architectural Patterns](#16-architectural-patterns)
17. [Reference Data & Taxonomies](#17-reference-data--taxonomies)
18. [Implementation Status](#18-implementation-status)
19. [Consolidated Action Items](#19-consolidated-action-items)
20. [Sources & References](#20-sources--references)

---

## 1. Landscape Overview

The Dwarf Fortress legends/history tool ecosystem consists of six distinct categories, each addressing a different data access paradigm:

| Category | Tools Analyzed | Data Source | Access Pattern |
|----------|---------------|-------------|----------------|
| **Legends Browsers** | LegendsViewer-Next, LegendsBrowser, LegendsBrowser2 | XML export files | Batch parse, in-memory, web UI |
| **Live Game Servers** | weblegends | DFHack C++ memory | Real-time HTTP, per-request render |
| **Autonomous Agents** | df-ai | DFHack C++ memory | Tick-based reactive loop |
| **Narrative Generators** | df-narrator | XML export files | Score + template, LLM-sized output |
| **Infrastructure Tools** | dfhack-client-python, DwarfFortressLogger, myDFHackScripts, DwarvenSurveyor, df-structures | Mixed (RPC, memory, Lua, XML) | Various |
| **Mod Management** | DF-Modloader, ModHearth, PyLNP, PyDwarf, Nexus Mod Manager | Filesystem + DFHack Lua | Raw parsing, profile management |

**Chronicler's unique position**: No existing tool combines (1) persistent database storage, (2) live fortress polling, (3) legends XML ingestion, (4) LLM-driven narrative generation, (5) worldgen monitoring, (6) mod management awareness, and (7) labor/population management. Chronicler is the first to attempt all seven in a single integrated system.

### 1.1 Reference Repository Inventory

| Repository | Language | Lines Analyzed | Key Contribution |
|-----------|----------|---------------|-----------------|
| LegendsViewer-Next | C#/Vue.js | ~15,000 | Leaflet map, Cytoscape family tree, Chart.js viz, 115+ event types, Vue detail pages |
| LegendsBrowser | Java | ~8,000 | SAX streaming XML, SVG family tree, D3 chord diagram, Bootstrap popovers |
| LegendsBrowser2 | Go | ~12,000 | 132 event types, custom XML tokenizer, context-aware rendering, autocomplete search |
| weblegends | C++ | ~6,000 | 94 event handlers, 40+ death causes, perspective-aware linking, live DFHack memory |
| df-narrator | Python | ~2,000 | 4 scoring formulas, HF_FIELDS set, rival detection, Markdown world summary |
| df-ai | C++ | ~25,000 | Full fortress AI: population, military, stocks, construction, trade management |
| dfhack-client-python | Python | ~1,500 | RPC protocol implementation, binary frame format |
| DwarfFortressLogger | Java | ~3,000 | 29 memory sections, Dwarf Therapist-compatible layout system |
| myDFHackScripts | Lua | ~2,000 | Death cause lookup, citizen detection, eventful hooks, polling patterns |
| DwarvenSurveyor | C#/Unity | ~1,500 | XML coordinate parsing, biome rendering, site taxonomy |
| df-structures | XML | ~50,000 | Canonical memory layout, 144 event types, all entity fields |
| DF-Modloader | Python | ~1,700 | Raw file compiler, EDIT/SELECT/CUT handling, object template system |
| ModHearth | C# | ~2,000 | DFHack mod memory query, info.txt parsing, conflict detection |
| PyLNP | Python | ~3,000 | Three-way merge algorithm, baseline management, merge status tracking |
| PyDwarf | Python | ~2,500 | Doubly-linked token model, round-trip raw editing |
| Nexus Mod Manager | C# | ~50,000 | Plugin architecture, category browsing, multi-game mod management |
| Dwarf Therapist | C++ | ~20,000 | Memory layout system (not directly usable via remote access) |

---

## 2. Component Architecture

Chronicler is organized into 8 major subsystems (6 user-facing Main Components plus 2 foundational systems):

### 2.1 Main Components

| # | Component | Primary Function | Feature Count |
|---|-----------|-----------------|---------------|
| 1 | **World History & Demographics Visualizer** | Interactive maps, timelines, demographic charts, family trees, war visualizations | ~30 features |
| 2 | **Database Explorer Tools** | Schema browser, data grid, entity detail pages, search, SQL runner, graph visualization | ~40 features |
| 3 | **AI Storyteller (Narrative Engine)** | Conversational world Q&A, war chronicles, character biographies, event narratives | ~62 features |
| 4 | **AI Fortress Player (Advisor)** | Population management, military, resources, construction, trade, mood management | ~50+ features |
| 5 | **Mod Manager** | Mod discovery, conflict detection, load order, raw compilation, Steam Workshop integration | ~44 features |
| 6 | **Labor Manager** | Labor grid, skill tracking, personality visualization, stress monitoring, batch operations | ~35 features |

### 2.2 Foundational Systems

| # | System | Primary Function | Scope |
|---|--------|-----------------|-------|
| 7 | **Common Data Model (CDM) & Database** | PostgreSQL schema, multi-world support, JSONB details, composite PKs, entity tables | 40+ tables |
| 8 | **Data ETL Systems** | Legends XML parsing, live bridge, DFHack integration, worldgen monitoring, file transfer | 5 pipelines |

### 2.3 Cross-Cutting Concerns

- **Knowledge Horizon**: Dynamic visibility masking that limits LLM knowledge to what the fortress plausibly knows
- **Scoring & Ranking**: Importance scores for entity selection and LLM context budget management
- **Cross-Linking**: Every entity reference is a navigable hyperlink across all views
- **Calendar System**: Consistent DF date formatting (seconds72 to day/month/season)

---

## 3. Feature Inventory Summary

Total discrete features identified across all components: **~260+**

| Component | S | M | L | XL | Total |
|-----------|---|---|---|----|----|
| World History Visualizer | 7 | 8 | 6 | 3 | ~30 |
| Database Explorer | 9 | 11 | 5 | 2 | ~40 |
| AI Storyteller | 12 | 15 | 7 | 5 | ~62 |
| AI Fortress Player | 14 | 18 | 10 | 2 | ~50 |
| Mod Manager | 6 | 12 | 10 | 6 | ~44 |
| Labor Manager | 8 | 12 | 8 | 3 | ~35 |
| CDM & Database | varies | varies | varies | varies | ~30 |
| Data ETL | varies | varies | varies | varies | ~20 |

Complexity key: S = days, M = 1-2 weeks, L = 2-4 weeks, XL = 1+ months

---

## 4. Event Type Taxonomy

### 4.1 Canonical Reference

Cross-referencing all tools yields a definitive event type count:

| Source | Event Types | Authoritative? |
|--------|-------------|----------------|
| df-structures `history_event_type` enum | **144** | Yes (memory layout, canonical) |
| LegendsBrowser2 `events.go` | 132 | Yes (Go source, production) |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Yes (.NET source, production) |
| weblegends `events/*.cpp` | 94 files | Yes (C++ source, production) |
| df-narrator | Generic (type string) | No (no per-type handling) |

**Synthesis**: df-structures defines **144 event types** in the `history_event_type` enum. This is the canonical source. LegendsBrowser2's 132 types represent the most complete handling implementation. The gap consists of newer event types added in DF 0.47+ that some tools have not implemented handlers for.

**Chronicler strategy**: Store all 144 event types as TEXT (no DB enum -- Design Decision #25). Implement narrative templates for the 132 LB2-handled types. Graceful fallback (raw field dump) for the remaining 12.

### 4.2 Event Categories (Merged Taxonomy)

| Category | Count | Examples |
|----------|-------|---------|
| HF Lifecycle | 15 | died, revived, wounded, abducted, enslaved, freed, ransomed |
| HF Relationships | 10 | add/remove hf_hf_link, add/remove hf_entity_link, add/remove hf_site_link |
| HF Actions | 12 | attacked_site, destroyed_site, confronted, does_interaction, preach |
| HF Intrigue | 10 | convicted, interrogated, formed_intrigue, failed_frame, sabotage |
| Artifacts | 13 | created, destroyed, lost, found, given, possessed, recovered, stored, transformed, copied, claim_formed |
| Sites/Construction | 18 | created_site, destroyed_site, site_taken_over, reclaim_site, created_structure, razed_structure |
| Entities | 14 | entity_created, dissolved, incorporated, overthrown, law, persecuted, alliance_formed |
| War/Combat | 8 | field_battle, squad_vs_squad, tactical_situation, attacked_site, plundered_site |
| Diplomacy | 10 | peace_accepted/rejected, agreement_formed/concluded/rejected, trade, first_contact |
| Culture/Art | 7 | poetic/musical/dance_form_created, written_content_composed, knowledge_discovered |
| Masterpieces | 8 | arch_construct, item, dye, item_improvement, food, engraving, lost |
| Occasions | 5 | ceremony, competition, performance, procession, gamble |
| Misc | 14 | creature_devoured, body_abused, merchant, sneak_into_site, spotted_leaving, insurrection |

### 4.3 Event Collection Types (19 Types)

| Category | Types |
|----------|-------|
| Warfare | battle, war, duel, raid, site_conquered |
| Political | insurrection, persecution, purge, entity_overthrown |
| Calamities | beast_attack, abduction, theft |
| Rituals | occasion, procession, ceremony, performance, competition |
| Travel | journey |

---

## 5. Data Model & CDM Schema

### 5.1 Database Configuration

- **Database**: PostgreSQL 16 on localhost:5432, database `chronicler`
- **Extensions**: pgvector (2560-dim embeddings), unaccent (diacritic-tolerant search)
- **Key decisions**:
  - Composite PKs `(world_id, id)` on all 13 legends tables for multi-world support
  - `JSONB DEFAULT '{}'` details columns for overflow/unmapped fields
  - Event types stored as TEXT (no DB enum) -- raw data in details JSONB
  - `importance_score FLOAT DEFAULT 0.0` on HFs, sites, artifacts for LLM context selection
  - Live data stored alongside legends data in the same database

### 5.2 Complete Table Inventory

#### World Metadata
- `worlds` (id, name, alt_name, import_path, imported_at)

#### Geography
- `regions` (world_id, id, name, type [10 biome types], coords [pipe-delimited], evilness)
- `underground_regions` (world_id, id, type, depth, coords)
- `landmasses` (world_id, id, name, coords)
- `mountain_peaks` (world_id, id, name, coords, height)

#### Entities & Organizations
- `entities` (world_id, id, name, race, type, details JSONB)
- `entity_positions` (world_id, entity_id, position_id, name, details JSONB)

#### Sites & Structures
- `sites` (world_id, id, name, type [24 site types], coords, rectangle, owner_entity_id, details JSONB)
- `structures` (world_id, site_id, id, name, type [12+ structure types], details JSONB)

#### Historical Figures
- `historical_figures` (world_id, id, name, race, caste, sex, birth_year, death_year, profession, associated_type, civ_id, unit_id, is_deity, is_force, is_vampire, is_necromancer, is_werebeast, is_ghost, importance_score, details JSONB)
- `hf_links` (world_id, source_hf_id, target_hf_id, link_type, details JSONB)
- `hf_entity_links` (world_id, hf_id, entity_id, link_type, position_id, details JSONB)
- `hf_site_links` (world_id, hf_id, site_id, link_type, details JSONB)

#### Artifacts & Written Content
- `artifacts` (world_id, id, name, item_type, material, details JSONB, importance_score)
- `written_contents` (world_id, id, name, form, author_hf_id, details JSONB)

#### Events
- `history_events` (world_id, id, year, seconds72, type [144 types TEXT], details JSONB)
- `history_event_collections` (world_id, id, type [19 collection types], start_year, end_year, details JSONB)

#### Historical Eras
- `historical_eras` (world_id, id, name, type, start_year, end_year)

#### Live Data
- `units` (world_id, unit_id, name, race, profession, hist_fig_id, is_alive, stress_level, skills_json, personality_json, details JSONB)
- `unit_events` (world_id, unit_id, event_type, tick, details JSONB)
- `fortress_denizens` (world_id, unit_id, name, narrative_value, arrival_year, details JSONB)
- `game_reports` (world_id, report_id, text, tick, details JSONB)
- `lua_probes` (world_id, probe_type, tick, data JSONB)
- `sync_snapshots` (world_id, sync_type, tick, data JSONB)

#### Storyteller
- `storyteller_log` (id, world_id, query, keywords, context_stats, model, temperature, tokens_streamed, response_chars, status, error, latency)

#### Knowledge Horizon
- `knowledge_horizon` (world_id, entity_type, entity_id, visible BOOLEAN)

#### Worldgen (Planned)
- `worldgen_snapshots` (world_id, phase, progress_pct, data JSONB, captured_at)

### 5.3 Data Entity Coverage Comparison

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | Chronicler CDM |
|-------------|---------|-----|------------|-------------|----------------|
| Historical Figures | Full | Full | Full | Scored subset | Full |
| Sites | Full | Full | Full | Scored subset | Full |
| Entities (Civs) | Full | Full | Full | Name only | Full |
| Artifacts | Full | Full | Full | Scored subset | Full |
| Regions | Full | Full | Full | No | Full |
| Underground Regions | Full | Full | Full | No | Partial |
| Structures | Full | Full | Full | No | Full |
| World Constructions | Full | Full | Partial | No | **Missing** |
| Written Content | Full | Full | Partial | No | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | **Missing** |
| Identities | Full | Full | No | No | **Missing** |
| Landmasses | Full | Full | No | No | Partial |
| Mountain Peaks | Full | Full | No | No | Partial |
| Rivers | Full | Stub | No | No | **Missing** |
| Entity Populations | Full | Stub | Partial | No | Partial |
| Event Collections | Full | Full | Full | Partial | Partial |

### 5.4 HF Field Completeness Audit

**Already in Chronicler CDM**: id, name, race, caste, sex, birth_year, death_year, profession, associated_type, civ_id, unit_id, is_deity, is_force, is_vampire, is_necromancer, is_werebeast, is_ghost, importance_score

**Missing (high priority)**:
- `active_interactions` (vampire/necromancer/werebeast interaction detection)
- `spheres` (deity domains)
- `goals` (life goals with accomplishment status)
- `skills` with XP points (from `info.skills`)
- `entity_links` with link type and position details (expanded)
- `histfig_links` (mother/father/child/spouse -- family)
- `site_links` (lair, home, seat_of_power)
- `kills` (notable and other kill records)
- `whereabouts` / `current_state` (geographic location)
- `vague_relationships` and `relationship_profiles`
- `entity_reputations` (murderer, hero, monster, poet, bard, etc.)
- `intrigue_actors` / `intrigue_plots` (v0.47+ intrigue system)
- `used_identities` / `current_identity` (false identity tracking)
- `journey_pets`
- `holds_artifact` (currently held artifacts)
- `breed_id`, `cultural_identity`, `family_head_id`

**Missing (medium priority)**:
- `orientation_flags`
- `curse_year` / `curse_seconds`
- `personality` (values, ethics, mannerisms -- 70+ mannerism types)
- `knowledge_profile` (known secrets, books, belief systems)
- `reputation_profile` (wanted status, journey profile)

---

## 6. Data ETL Systems

### 6.1 Legends XML Pipeline

**Implementation**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` (733 lines)

**Technology**: Python `lxml` iterparse (SAX-style streaming). Consensus best practice across all reference tools:

| Tool | XML Approach | Memory Model |
|------|-------------|--------------|
| Chronicler | `lxml.etree.iterparse` + `root.clear()` | Streaming, constant memory |
| LegendsBrowser (Java) | SAX `XMLReader` + annotation handler | Streaming, constant memory |
| LegendsBrowser2 (Go) | Custom hand-written tokenizer (NOT `encoding/xml`) | Streaming, buffered I/O |
| LegendsViewer-Next (.NET) | Async XML with `FilteredStream` | Streaming, filtered |
| DwarvenSurveyor (C#) | `XmlReader` streaming | Streaming |
| df-narrator (Python) | `xml.etree.ElementTree` full-tree parse | Full-tree, then freed |

**Dual-File Merge** (legends.xml + legends_plus.xml):
- Parse `legends.xml` first to establish all entity records
- Parse `legends_plus.xml` second, matching by `id` fields
- legends_plus provides: per-tile coordinate arrays, evilness ratings, `cur_owner_id`, entity positions/assignments/honors, relationship profiles, vampire/werebeast/necromancer "since" years, written content references, entity occasion schedules

**Sections currently parsed**: 8 of 14+ (sites, artifacts, regions, underground_regions, historical_figures, entities, history_events, history_event_collections, written_contents, historical_eras)

**Missing sections**: world_constructions, art_forms (3 types: dance, musical, poetic), identities, rivers, mountain_peaks, landmasses (partial)

**Post-Parse Processing Pipeline** (adapted from LB2 `world.process()`):
1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores (df-narrator formulas)
8. Build event-to-entity cross-reference index
9. Resolve site ownership history from events
10. Validate referential integrity

### 6.2 Live Bridge System

**Implementation**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` (922 lines, v6)

The bridge runs as a DFHack `repeat` job every 100 ticks (~2.4 seconds), writing JSON to a file served over HTTP.

**Data Domains** (7 currently captured):
1. Game time (year, tick, season)
2. Creature raws (934 creature types)
3. Unit summary (22 fortress dwarves with names, stress, focus, longterm_stress, combat_hardened, squad, position)
4. Armies (142+ armies with positions, member counts, controller IDs)
5. Buildings (205+ buildings by 16 building types)
6. Artifacts (named artifacts with DF-language and English translations)
7. Announcements (last 20 game reports)
8. Diplomacy (player civ relations via `entity.resources.diplomacy.state`)
9. History (figure count, event count, last 50 events with type/year)

**Enhancement priorities**:
- Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, UNIT_NEW_ACTIVE, SYNDROME)
- Death cause enrichment via `df.global.world.incidents.all`
- Parent/family chain via `unit.relationship_ids.Mother/Father`
- Book detection via `dfhack.items.getBookTitle(item)`
- Full incident system for crime/death narrative
- Personality/soul data (50 facets, beliefs, goals, needs)
- Skill progression tracking per unit

### 6.3 DFHack Integration

**Working transport**: `dfhack-run` over SSH (TCP RPC is broken for game-thread calls on DFHack 53.x under Prism ARM emulation)

**Key data access paths** (Lua):
```
df.global.world.units.active          -- all active units
df.global.world.history.figures       -- 48,366 HFs
df.global.world.history.events        -- 442,716 events
df.global.world.entities.all          -- 4,901 entities
df.global.world.artifacts.all         -- 8,035 artifacts
df.global.world.world_data.sites      -- 2,154 sites
df.global.world.incidents.all         -- death causes + killer IDs
df.global.world.status.reports        -- game announcements
df.global.world.worldgen_status       -- worldgen state machine
```

**RemoteFortressReader**: IS loaded (41 RPC functions registered), but all game-thread calls hang under Prism. Works only for cached calls (GetVersion, GetWorldInfo).

**DFHack eventful module**: Reactive event subscriptions:
- `eventful.onUnitDeath[modId]` -- unit death callback
- `eventful.onItemCreated[modId]` -- item creation callback
- `eventful.onJobCompleted[modId]` -- job completion callback
- `eventful.onInvasion[modId]` -- invasion callback
- `eventful.enableEvent(eventful.eventType.UNIT_DEATH, tick_interval)`

### 6.4 Worldgen Monitoring

**Novel capability**: No existing tool monitors world generation in real-time.

The `world_generatorst` struct at `df.global.world.worldgen_status` provides:
- 12-state generation phase enum (None, Terrain, ElevationMap, Rainfall, Drainage, Temperature, Volcanism, SavageryEvilness, Regions, Rivers, Civilizations, Done)
- Progress counters (rivers, civs, rampages)
- Phase completion flags (caves_placed, megabeasts_placed, etc.)
- Event cursor (`last_event_id_added`)
- Live access to `world.history.figures/events/eras` as they populate

**Implementation**: `worldgen-bridge.lua` using `repeat` job pattern, polling every 30 frames (~0.5s), writing JSON snapshots. Auto-start via `dfhack.onStateChange.worldgen_monitor`.

### 6.5 Change Detection & Events

**11 event types** across watcher + detector:
- ARRIVED, DEPARTED, DIED (population changes)
- SKILL_UP, PROFESSION_CHANGED (skill progression)
- SQUAD_CHANGED (military changes)
- STRESS_CHANGED (mood monitoring)
- BUILDING_ADDED, BUILDING_REMOVED (construction)
- REPORT_NEW (game announcements)
- ARTIFACT_CHANGE (artifact events)

**4 death detection mechanisms**:
1. Flag check (`unit.flags1.dead` or `unit.flags2.killed`)
2. Absence detection (unit disappears from active list)
3. Announcement parsing (death text in game reports)
4. History event matching (UNIT_DEATH event from eventful)

**Death cause enrichment**: `df.global.world.incidents.all` provides 40+ death cause variants (OLD_AGE, SHOT, BLEED, DROWN, SUFFOCATE, MAGMA, DRAGONFIRE, CAVEIN, DRAWBRIDGE, BEHEAD, CRUCIFY, BURN_ALIVE, HACK_TO_PIECES, DRAIN_BLOOD, LEAPT_FROM_HEIGHT, INFECTION, and 25+ more) plus killer identification.

### 6.6 File Transfer Mechanisms

| Method | Speed | Use Case |
|--------|-------|----------|
| HTTP file server (port 8889) | ~105 MB/s | Primary: bridge JSON, legends XML bulk transfer |
| SCP via `vm-lifecycle.sh scp-pull` | ~19 MB/s | Secondary: requires `-O -T` flags for Windows paths |
| Guest Agent (utmctl) | ~0.24 MB/s | Emergency only (440x slower) |

### 6.7 RAG/Vector Indexing

**Current Qdrant collections**:
- dfhack: 8,476 points
- dwarf-therapist: 926 points
- df-wiki: 4 points (target: 21K-27K via wiki crawl)

**Embedding model**: Qwen3-Embedding-4B via MLX at localhost:8000, 2560-dim
**Planned**: pgvector tables in PostgreSQL for in-database semantic search

---

## 7. Visualization & Map System

### 7.1 Interactive World Map (Leaflet.js)

The centerpiece visualization feature. All reference implementations converge on the same approach:

- **Library**: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection)
- **Coordinate system**: Y-axis inverted from DF coordinates (`map_height - y`), scaled by tile size
- **Scale**: 4-10 pixels per world tile
- **Zoom**: `minZoom: -2`, `maxZoom: 2`
- **Base layer**: World map PNG as `L.imageOverlay` at 50% opacity
- **Map image**: Generated from region type colors (SkiaSharp/Pillow), three cached sizes: thumbnail (tileSize=2), default (tileSize=4), large (tileSize=10)

### 7.2 Map Layer Groups (Toggleable)

Each layer is a Leaflet `L.LayerGroup`:
- Sites (colored polygons by owning entity; gray for ruins; yellow for unowned)
- World Constructions (squares for points, polylines for roads/bridges/tunnels)
- Mountain Peaks (triangle markers)
- Landmasses (semi-transparent rectangles)
- Regions (outline polygons, color-coded by evilness)
- Rivers (polyline paths)
- Battle markers (red diamond polygons for war/battle views)

### 7.3 Site Marker Shapes (by Type)

```
Circle: Unknown, Cave, Lair, Camp
Triangle: Monastery, Fort, Tomb
Square (small): Hillocks, Hamlet
Pentagon: Fortress, ForestRetreat, Town, DarkPits
Hexagon (large): MountainHalls, Castle, DarkFortress
Star: Vault, Labyrinth, Shrine, Tower, ImportantLocation
Pentagon (blue): MysteriousDungeon
Hexagon (blue): MysteriousPalace
```

### 7.4 Civilization Color System

HSV rotation algorithm: medium saturation for first 6 races, lighter for 7-12, darker for 13-18. Applied consistently across all views. Optional user-customizable race colors via color picker (LegendsBrowser v1 feature).

### 7.5 Timeline Scrubber

Year slider showing site ownership state at any point in history. Sites recolored based on historical ownership. "Not yet founded" sites hidden; "destroyed" sites shown in gray.

### 7.6 Civilization Territory Overlays

Semi-transparent colored polygons computed from owned sites using convex hull or alpha shape algorithms. Toggle per-civilization.

### 7.7 Worldgen Live Map Preview

During world generation, `worldgen-bridge.lua` polls `df.global.world.world_data.region_map` and renders progressive terrain visualization via WebSocket push. Entirely novel feature.

### 7.8 Chart Visualizations

| Chart Type | Library | Use Case |
|-----------|---------|----------|
| Population doughnut/pie | Chart.js / D3.js | Race demographics, biome area distribution |
| Event timeline (line) | Chart.js | Events per year, narrative arc |
| Event type breakdown (bar) | Chart.js | Event category distribution |
| War chord diagram | D3.js | Inter-civilization conflict web |
| Warfare graph (force-directed) | Cytoscape.js cola | War/battle network topology |
| Family tree (hierarchical) | Cytoscape.js dagre | Multi-generation genealogy |
| Curse lineage tree | Cytoscape.js / SVG | Vampire/werebeast "who bit whom" chains |
| Ego-network graph | vis.js forceAtlas2 | Relationship exploration (1-3 hop) |
| In-game data curve | Custom widget | Bar/line graph with slider controls (CurveWidget pattern) |

### 7.9 Per-Object Mini-Maps

Each entity detail page includes a small focused map highlighting that object's location with magenta tiles and a yellow/red oval.

---

## 8. Database Explorer

### 8.1 Schema Browser

- Table list with row counts from `pg_stat_user_tables`
- Column/type/PK/FK/index detail from `information_schema`
- Visual FK relationship lines (vis.js/D3.js ERD)
- JSONB column field inventory via `jsonb_object_keys()` sampling

### 8.2 Data Browser

- Paginated data grid (10/25/50/100 items per page, server-side pagination)
- Column-level filtering with parameterized WHERE clauses
- Column sorting (clickable headers, `ORDER BY` dynamic)
- FK link navigation (click FK values to navigate to referenced entity)
- JSONB collapsible expansion (syntax-highlighted tree widgets)
- Row detail overlay/modal with all columns rendered

### 8.3 Entity Detail Pages

**Complete entity type coverage** (following LV-Next's 70-route pattern: 35 list + 35 detail):

**Historical Figure Detail Page** (24 sections):
1. Profile Overview (age, birth, death, spheres, positions)
2. Family Tree (Cytoscape.js dagre, 360px/720px toggle)
3. Skills (scrollable list with rank icons)
4. Related Factions/Groups
5. Related Sites
6. Close Relationships (with sex-specific labels)
7. Vague Relationships
8. Worshipped Deities (with worship strength: dubious/casual/average/faithful/ardent)
9. Journey Pets
10. Noble Positions (with date ranges)
11. Worshipping Figures (if deity)
12. Worshipping Entities (if deity)
13. Notable Kills
14. Artifacts (currently held)
15. Dedicated Structures
16. Snatcher Of (abduction victims)
17. Battles (as attacker/defender/non-combatant)
18. Beast Attacks (if beast)
19. Full Event History (paginated, 1000/page)
20. Entity Reputations
21. Intrigue actors/plots
22. Used Identities
23. Squad links
24. Site Property links

**HF Type Flag Visual Classes**:
- `current`: Dashed orange border
- `dead`: 30% opacity
- `male`: Blue background
- `female`: Magenta background
- `leader`: Round-octagon with crown icon
- `necromancer`: Round-hexagon with skull icon
- `vampire`: Hexagon with vampire icon
- `werebeast`: Hexagon with wolf icon
- `ghost`: Hexagon with ghost icon

**Entity (Civilization) Detail Page** (5 tabs): Leaders, Sites, Members, Groups, Wars
**Site Detail Page** (3 tabs): Structures, Properties, History
**Artifact Detail Page**: Chain-of-custody timeline, material, holder, written content
**Region Detail Page**: Biome type, evilness, contained sites
**Structure Detail Page**: Type (12+ types), ruin status, parent site
**Written Content Detail Page**: Form, author, references, styles
**Event Collection Detail Page**: Hierarchy browser (war -> battle -> events)
**Additional**: Underground Regions, Landmasses, Mountain Peaks, Rivers, World Constructions, Art Forms (3 types), Identities, Historical Eras

### 8.4 Search Infrastructure

- Accent-insensitive full-text search (`unaccent` extension)
- Global search with live autocomplete (debounced 200ms, 50 results max)
- HF filtering by type flags (deity, vampire, necromancer, leader, alive, ghost, adventurer, race)
- Sort options: name, race, birth, death, kills
- Advanced visual query builder (XL feature)
- Raw SQL explorer with safety measures (keyword blocklist, read-only transaction, LIMIT cap, timeout)

### 8.5 Data Export

- CSV/JSON export from query results and table data
- Full entity JSON export for external analysis or LLM ingestion
- weblegends-style BFS static site generation (stretch)

---

## 9. AI Storyteller & Narrative Engine

### 9.1 Conversational World Query Engine (Built)

**23 categorical routes**: hf_flag (deity/vampire/necromancer/werebeast/ghost), hf_race (megabeast/dragon/titan/forgotten), entity_type (civilization/religion), collection_type (war/battle), artifacts, written_contents, live_units, live_squads, live_armies, live_events, live_reports

**Pipeline**: extract_keywords -> categorical routing -> name-based ILIKE search -> world overview fallback -> format_context (12,000 char budget) -> build_messages -> stream_completion -> SSE response

### 9.2 Agentic Storyteller (Planned v1.0)

The LLM receives:
- Database schema summary (~2K tokens, 40+ table definitions)
- SQL tool definition (read-only, 50 row max, 5s timeout)
- Denizen registry summary (top N by NVS score)
- Instructions for autonomous exploration (up to 5 SQL queries)

Safety layer: `SET TRANSACTION READ ONLY`, keyword blocklist (DROP, DELETE, INSERT, UPDATE, ALTER, TRUNCATE), enforced LIMIT cap, per-query timeout, validated table/column names.

### 9.3 Character Profile & Biography Generation

**Unified Person View** (`person.py`): Merges Unit data (live, fresher) with HF data (historical depth) using 6 rules: start with Unit, overlay HF, resolve conflicts by recency/authority, personality from Unit only, events from both sources, embark flag tracking.

**Personality-driven voice**: Map 50 personality traits + beliefs + goals + needs to narrative personality dimensions, derive voice description, inject as character voice prompt.

### 9.4 Event Narrative Engine

**Per-type event templates** (122+ types handled):
- Template bank covering all 132 LB2-handled event types
- Graceful LLM fallback for remaining types
- Pattern: `Event (CDM row) -> Context (target entity) -> Template (per-type prose) -> HTML (with entity links)`

**Death cause rendering** (50+ variants from weblegends):
```
OLD_AGE -> "died of old age"
SHOT -> "was shot and killed"
BLEED -> "bled to death"
DROWN -> "drowned"
SUFFOCATE -> "suffocated"
MAGMA -> "was consumed by magma"
DRAGONFIRE -> "was killed by dragonfire"
CAVEIN -> "was crushed in a cave-in"
DRAWBRIDGE -> "was smashed by a drawbridge"
BEHEAD -> "was beheaded"
CRUCIFY -> "was crucified"
BURN_ALIVE -> "was burned to a crisp"
HACK_TO_PIECES -> "was hacked to pieces"
DRAIN_BLOOD -> "was drained of blood"
LEAPT_FROM_HEIGHT -> "leapt from a great height"
INFECTION -> "succumbed to infection"
... (25+ more, each with weapon info, slayer identity with race, age at death)
```

**Perspective-aware rendering**: Pass entity ID as context; suppress self-links, use relational pronouns. weblegends `event_link()` pattern and LB2 `Context.HfId` pattern.

**Circumstance/reason rendering**: Reasons (glorify_hf, artifact_is_heirloom, as_a_symbol_of_everlasting_peace), Circumstances (Death, Prayer, DreamAbout, Nightmare, FromAfar).

**Age at death with fractions**: `1/4`, `1/2`, `3/4` display using HTML fraction entities.

### 9.5 War Chronicles & Civilization Histories

- War narrative generation from event collections (battle chronology, named generals, entity names)
- Battle detail rendering (attacker civ, defender civ, region, generals)
- Civilization rise-and-fall narratives (entity events chronologically: created -> site_taken_over -> alliance_formed -> overthrown -> dissolved)

### 9.6 Template vs. LLM Hybrid

- **Fast path**: Deterministic template per event type for explorer event tables
- **Rich path**: LLM-enhanced narrative for chat responses and featured content
- **Proactive path** (post-v1.0): Watch for high-NVS events, generate narrative alerts via WebSocket

### 9.7 LLM Configuration

| Parameter | Current | Target |
|-----------|---------|--------|
| Primary Model | Qwen3-8B via LiteLLM | Qwen3-8B (dev) / Claude API (production) |
| Temperature | 0.8 | 0.8 (configurable) |
| Max Tokens | 2048 | 2048 (configurable) |
| Streaming | SSE via `sse_starlette` | Same |
| Embedding | qwen3-embedding:4b via MLX | Same (2560-dim) |

### 9.8 Monitoring & Observability

- Per-interaction LLM logging (`storyteller_log` table)
- Monitoring dashboard (`/monitoring`) with summary cards, recent interactions, auto-refresh
- Three API endpoints: interactions list, interaction detail, summary
- `InteractionLog` instrumentation class with phase latency tracking

---

## 10. AI Fortress Player & Advisor

### 10.1 Core Architecture (from df-ai)

**Reactive control architecture**: Five independent invariant-maintenance loops (population, plan, stocks, camera, trade) polling at different rates. Not goal-based or planner-based -- deviations from desired state trigger corrections.

**Tick-based multi-rate polling**:
| Subsystem | Frequency | Scope |
|-----------|-----------|-------|
| Population | 25 ticks | Citizens, jobs, unsuspend |
| Military | 25 ticks (phase 4) | Draft/dismiss, squads, attack |
| Nobles | 25 ticks (phase 2) | Position assignment |
| Trading | 25 ticks (phase 0) | Caravan, broker, trade |
| Pets | 25 ticks (phase 5) | Pasture, milking, shearing |
| Justice | 25 ticks (phase 4) | Crime, punishment |
| Occupations | 25 ticks (phase 8) | Tavern, performer, scholar |
| Construction | 240 ticks | Dig, build, furnish |
| Stocks | 100 ticks | Item count, production |
| Farms | 100 ticks | Crop selection, rotation |

**Ten-phase population update cycle**: Trading -> CitizenList -> Nobles -> Jobs -> Military+Crimes -> Pets -> Dead -> Caged -> Locations -> Emit JSON

**Exclusive action queue**: One active action chain at a time; queue others. Prevents conflicting multi-step actions (e.g., two trade negotiations).

**Advisor vs. autonomous mode toggle**: `mode: advisor` (recommend only) vs `mode: autonomous` (execute via DFHack Lua).

### 10.2 Population Management

- Citizen arrival/departure tracking (set comparison every 25 ticks)
- Noble assignment advisor (bookkeeper, manager, broker, mayor, sheriff, captain of guard)
- Noble apartment validation (room value requirements)
- Job stall detection and auto-unsuspend
- Pet management (milkable, shearable, trainable, egg-laying, vermin-hunting, grazing)
- Occupation assignment (tavern keeper, performer, scholar)
- Dead unit handling (ghost prevention, memorial slabs)
- Caged unit management
- Baby/mother reunification (DF Bug 5551)
- Immigration handling

### 10.3 Military Management

- Military sizing advisor (target 25%-75% of citizen count)
- Draft/dismiss with XP-based selection
- Squad creation and sizing (4/6/8/10 members based on total military)
- Uniform selection (Heavy melee / Heavy ranged, alternating every 3 squads)
- Tool confiscation for military service
- Attack order management (score squads, best-scoring sent)
- Threat assessment and response
- Training management
- Justice and crime monitoring

### 10.4 Resource Management

**Three-tier stock threshold model** (~100 item categories):
- `Needed`: Absolute floor quantity
- `NeededPerDwarf`: Per 100 citizens scaling
- `WatchStock`: Monitor only (no production order)
- Plus `AlsoCount` for context items

Production ordering: `queue_need(item, amount)` -> `add_manager_order(template, amount)`, check existing orders, avoid duplicates within 5 units.

Manager order stall detection: If front order stuck in `validated` state across two monthly checks, trim quantities by 3/month.

Subsystems: Farm management (7 crop categories per season/biome), metalworking chain (4-step ore->bars->equipment), equipment production, kitchen management, tree cutting, stockpile configuration.

### 10.5 Construction and Planning

- 22 room types tracked (corridor through workshop)
- 4-state construction machine (plan -> dig -> dug -> finished)
- JSON-driven priority filter system for construction sequencing
- Blueprint/floor plan system (JSON files specifying room layouts)
- Room assignment workflow (new_citizen -> getbedroom -> getdiningroom)
- Idle detection and room activation
- Vein mining advisor
- Cistern and water supply management
- 28 furniture types, 17 stockpile subtypes

### 10.6 Trade Management

9-step trading cycle: Detect caravan -> Identify broker -> Request broker at depot -> Wait for items -> Open trade screen -> Scan trader items -> Balance offer >= request x 110% -> Handle counter-offers -> Dismiss broker.

### 10.7 LLM-Enhanced Advisor Features

- Natural language fortress advice with data-backed reasoning
- Situation assessment with explicit reasoning chains
- Multi-step action plans for complex projects
- Context-aware proactive alerts
- Decision explanation in Chronicler narrative voice
- Stock threshold model as LLM context
- Military heuristics as LLM prompt advisories
- Agentic SQL for fortress analysis

---

## 11. Mod Management

### 11.1 Core Mod Manager (Tier 1: "Modpack Manager")

- Mod discovery via filesystem scan (`<DF_dir>/Mods/`, `data/vanilla/`, `data/installed_mods/`)
- DFHack live mod discovery via `dfhack-run` over SSH
- Cached mod list fallback (PostgreSQL or JSON cache)
- `info.txt` parser (all v50 fields including Steam metadata)
- Modpack CRUD (create, rename, delete, set-default via `mod-manager.json`)
- Profile import/export (JSON format)
- Load order management (18 canonical header types)
- Mod browser with search/filter (dual-pane available vs. enabled)
- CLI interface (`chronicler mods list/profiles/activate/check`)

### 11.2 Conflict Detection (Tier 1-2)

Three levels:
1. **Metadata**: Dependency check, version incompatibility, `CONFLICTS_WITH_ID` detection
2. **Object ID**: Parse `objects/*.txt` for duplicate definitions across mods
3. **Semantic**: Full CUT/SELECT interaction analysis (requires raw compiler)

Visual indicators: Green (clean), Yellow (warnings), Orange (overlap), Red (fatal).

### 11.3 Raw File Parsing (Tier 2: "Raw Analyzer")

- Raw file tokenizer (state machine: COMMENTS -> TOKEN -> ARGS)
- 18 DF super-types mapped to file prefixes
- Per-object mod attribution
- Raw visual diff viewer
- Mod content summary

### 11.4 Three-Way Merge System (Tier 2-3)

PyLNP algorithm: vanilla baseline + accumulated merge + new mod file. Uses `difflib.SequenceMatcher`. Status codes: 0 (clean), 1 (potential), 2 (overlap), 3 (fatal). Vanilla baseline management with `make_blank_files()` for clean comparison.

### 11.5 Full Raw Compiler (Tier 3)

DF-Modloader-style compilation pipeline:
1. `read_mod_raws_and_apply_edit_objects(mod)` per mod in load order
2. `apply_special_tokens_to_create_compiled_objects()` for OBJECT_TEMPLATE processing
3. `write_compiled_objects(output_path)` -- one `*_compiled.txt` per super-type

EDIT object processing: SEL_BY_ID, SEL_BY_CLASS, SEL_BY_TAG, SEL_BY_TAG_PRECISE, PLUS_SELECT, UNSELECT. Within EDIT: OT_ADD_TAG, OT_REMOVE_TAG, OT_CONVERT_TAG.

### 11.6 Chronicler-Unique Features

- Modpack snapshot at world creation (capture active mod list during worldgen monitoring)
- Mod history in database (`world_modpacks` table linking worlds to mod configurations)
- Mod annotation in legends display (annotate entities with defining mod)
- Modpack transition tracking (detect mid-save mod changes)
- Modpack diff view (compare configurations)

---

## 12. Labor Manager

### 12.1 Core Features

- **Labor toggle grid** (Dwarf Therapist-style): 2D grid, dwarves x labors, toggleable checkboxes. Read via `unit.labors[]`, write via DFHack Lua
- **Skill display and progression**: Read `unit.status.current_soul.skills[]` (skill_id, rating 0-20, experience). Store snapshots per watcher cycle for delta tracking
- **Personality trait visualization** (50 facets): Read `unit.status.current_soul.personality`, display as radar/bar chart, map extreme values to natural language
- **Happiness/stress monitoring**: `unit.status.current_soul.personality.stress_level`, color-coded indicator, trend tracking
- **Squad assignment management**: Read/write `unit.military.squad_id` and `squad_position`
- **Noble/position management**: Track `fortress_entity.positions.own`, validate room requirements
- **Profession management**: Custom profession templates (name + labor set), batch-apply
- **Dwarf filtering/sorting**: Multi-criteria filter (name, race, profession, skill, stress, squad)
- **Thought/emotion display**: `unit.status.current_soul.personality.emotions[]` (80+ thought types)
- **Need satisfaction tracking**: `unit.status.current_soul.personality.needs[]` with fulfillment status
- **Attribute display**: 6 physical + 12+ mental attributes with bar charts

### 12.2 Advanced Features

- Skill-based labor auto-assignment
- Military draft/dismiss advisor (25%-75% bounds, XP-based selection)
- Population migration tracking (arrival/departure with origin site linking)
- Job management and stall detection
- Pet/animal management
- Wound/health tracking (`unit.health`, `unit.body.wounds[]`)
- Inventory/equipment display (`unit.inventory[]`)
- Relationship visualization (9 relationship slots + hf_links)
- Goal/dream tracking (goal_type enum with accomplishment status)
- Dwarf comparison view (2-4 side-by-side)
- Skill distribution analytics (fortress-wide coverage)
- Stress trend analysis with prediction
- Batch labor operations
- Labor optimization engine (constraint satisfaction)
- Newcomer orientation view
- Deathwatch and casualty tracking (4 detection mechanisms)
- Performance skill tracking (musical_instruments, poetic_forms, musical_forms, dance_forms)

### 12.3 Integration Features

- Storyteller integration (NVS scores for context selection)
- Explorer cross-linking (unit detail -> HF detail)
- Mod Manager integration (custom creatures -> labor type matching)
- Live watcher data pipeline (bridge -> change detection -> database)

---

## 13. Knowledge Horizon

### 13.1 Core Concept

The Knowledge Horizon limits the LLM's effective search space to what the fortress plausibly knows. Instead of exposing all ~1.65M CDM records, the mask exposes only data relevant to the fortress and its inhabitants. The mask grows organically as in-game conditions change.

### 13.2 Three Masking Dimensions

**Geographic Scope**:
- Always visible: fortress region + adjacent regions
- Revealed by: migrants (origin site/region), caravans (source civ sites), raids (target location), expedition returns

**Civilization Scope**:
- Always visible: parent civ structure (entity + positions + members)
- Revealed by: diplomatic contact, war declaration, raid encounter, caravan from new civ

**Individual Scope**:
- Always visible: all fortress inhabitants + direct family (depth 1)
- Revealed by: arrival, family connection discovery, organizational overlap

### 13.3 Seven Visibility Caveats

**CAV-001**: Organization membership propagation (cults=full, squads=chain-of-command, guilds=same-site, religion=nearby, civ=NO full propagation)
**CAV-002**: Civilization nobles always visible (public figures)
**CAV-003**: Previous residence knowledge (migrant carries knowledge of former site)
**CAV-004**: Starting dwarf background generation (synthetic HF entries with `source = 'inferred'`)
**CAV-005**: Family chain propagation (depth 1=always, depth 2=if alive, depth 3+=masked)
**CAV-006**: Event-based revelation (war -> enemy civ, caravan -> source civ, migrant -> origin site, raid -> target site, artifact -> full history)
**CAV-007**: LLM inference restrictions (system prompt instruction: treat horizon as in-world limitation)

### 13.4 Database Architecture

View-based masking:
```sql
CREATE TABLE knowledge_horizon (
    world_id INT REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id INT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);

CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT entity_id FROM knowledge_horizon
             WHERE entity_type = 'hf' AND visible = true);
```

### 13.5 Phased Rollout

1. Denizen registry as starting point
2. View-based HF masking (visible if denizen or 1-hop)
3. Geographic masking
4. Full KH with 7 caveats

---

## 14. Scoring & Ranking System

### 14.1 Figure Importance Score (df-narrator)

```
LEAST(event_count * 2, 500)
+ kill_count * 15
+ is_vampire * 80
+ is_necromancer * 100
+ is_deity * 120
+ is_force * 90
+ is_werebeast * 70
+ LEAST(hf_links * 3, 100)
+ leadership_positions * 20
+ artifacts_held * 30
+ LEAST(site_links * 5, 50)
+ LEAST(entity_links * 3, 60)
+ death_recorded * 5
```

### 14.2 Site Importance Score

```
events + deaths * 2 + event_collections * 5 + structures * 3
```

### 14.3 Conflict Importance Score

```
deaths * 3 + battles * 10 + sites_involved * 5 + duration_years
```

### 14.4 Artifact Importance Score

```
events * 10 + unique_holders * 20 + lost_or_stolen(30) + named(50)
```

### 14.5 Narrative Value Score (NVS) for Denizens

Fortress-level "who matters" ranking updated per watcher cycle. Computed from: event count, kills, relationships, positions, artifacts, type flags. Enables O(1) sort for LLM context selection.

### 14.6 Rivalry Detection (Co-Appearance)

Scan events mentioning a figure's hfid; count co-appearances of other figure IDs (using HF_FIELDS set). Top-10 rivals per figure.

### 14.7 Megabeast Detection

Hardcoded race set: `{DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN}`

### 14.8 Supernatural Detection

- Vampire: any `active_interaction` containing "VAMPIRE" (case-insensitive)
- Necromancer: "NECROMANCER" or "RAISE"
- Werebeast: "WEREBEAST"

---

## 15. Cross-Linking & Navigation Patterns

### 15.1 The Core UX Pattern

Every successful legends browser makes cross-linking the central user experience:

| Aspect | LV-Next | LB2 | weblegends |
|--------|---------|-----|------------|
| Link format | Server-side HTML `<a>` | Go template `{{ hf .Id }}` | C++ `link()` function |
| Context awareness | No | Yes (`HfId` context) | Yes (`event_context`) |
| Hover preview | No | Yes (Bootstrap popover Ajax) | No |
| Perspective-aware | No | Yes (relational pronouns) | Yes (suppress self-links) |

### 15.2 Perspective-Aware Rendering

LegendsBrowser2's pattern: When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns ("his wife"), while other entities remain fully linked. weblegends implements the same via `event_link()` (suppress link for context entity).

### 15.3 Breadcrumb / Prev-Next Navigation

Prev/Next floating action buttons on detail pages for sequential browsing. URL hash tab persistence for cross-tab navigation.

---

## 16. Architectural Patterns

### 16.1 Event Rendering Pipeline

All successful tools:
```
Event (typed struct) -> Context (current entity perspective) -> Template (per-type prose) -> HTML (with entity links)
```

For Chronicler with LLM:
```
Event (CDM row) -> Context (target entity + related entities) -> LLM prompt (with event type template) -> Narrative (with entity references marked for linking)
```

### 16.2 Post-Parse Processing Pipeline

Every legends browser runs a post-parse cross-referencing pass. Chronicler should do the same:
1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores
8. Build event-to-entity cross-reference index
9. Resolve site ownership history
10. Validate referential integrity

### 16.3 Exclusive Action Queue (from df-ai)

One exclusive action at a time, queue others. Maps to how the LLM should execute multi-step fortress management:
- Maintain one active action chain
- Queue pending actions
- Report completion/failure before starting next

### 16.4 Polling + Events Hybrid (from myDFHackScripts)

Use `eventful` subscriptions for real-time events (deaths, item creation) AND polling via `dfhack.timeout` for state changes (citizen count, reports, petitions). This hybrid approach catches both immediate events and gradual state transitions.

### 16.5 Generic Watcher Factory Pattern

myDFHackScripts `Helper.watch()` closure: Returns a function that compares current state to saved state. On change, logs event and updates saved state. Configurable comparison function.

### 16.6 Bridge Data Flow Architecture

```
DF Game (running) -> chronicler-bridge.lua (repeat job, 100 ticks)
  -> JSON file on disk
  -> HTTP server (port 8889)
  -> Python watcher (chronicler watch)
  -> Change detector (snapshot comparison)
  -> PostgreSQL CDM
  -> Storyteller / Explorer / API
```

---

## 17. Reference Data & Taxonomies

### 17.1 HF_FIELDS -- Canonical HF Reference Field List

These XML event fields reference historical figure IDs:
```
hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid,
changee_hfid, changer_hfid, woundee_hfid, wounder_hfid,
doer_hfid, target_hfid, attacker_hfid, defender_hfid,
hist_fig_id, body_hfid, hfid_target, hfid_attacker,
hfid_defender, trickster_hfid, cover_hfid, student_hfid,
teacher_hfid, trainer_hfid, seeker_hfid
```

### 17.2 Site Type Taxonomy (24 types)

```
Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress,
Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery,
Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace,
Ruins, Shrine, Tomb, Tower, Town, Vault
```

### 17.3 Entity Type Taxonomy

```
Civilization, Site Government, Nomadic Group, Migrating Group,
Religion, Military Unit (mercenary/shadowy/versatile), Guild,
Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang,
Outcast, Semi-Megabeast, Mega-Beast, Unknown
```

### 17.4 Biome Types (10)

```
Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains
```

### 17.5 Structure Types (12+)

```
mead_hall, keep, temple, dark_tower, market, tomb, dungeon/sewers/catacombs,
underworld_spire, tavern, library, counting_house, guildhall, tower
```

### 17.6 HF Relationship Types

**HF-to-HF**: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner

**HF-to-Entity**: Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position, Former Position, Position Claim, Occupation, Former Occupation, Squad, Former Squad

**HF-to-Site**: Lair, Home Site (abstract/realization building), Seat of Power, Hangout, Occupation, Prison

### 17.7 Room Types (22)

```
corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace,
garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage,
pond, releasecage, stockpile, tradedepot, windmill, workshop
```

### 17.8 Furniture Types (28)

```
archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair,
chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box,
offering_place, pedestal, restraint, roller, statue, table, track_stop,
traction_bench, vertical_axle, weapon_rack, well
```

### 17.9 DF Calendar System

```python
# seconds72 -> calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

# Month names (DF months)
months = ["Granite", "Slate", "Felsite",    # Spring
          "Hematite", "Malachite", "Galena", # Summer
          "Limestone", "Sandstone", "Timber", # Autumn
          "Moonstone", "Opal", "Obsidian"]    # Winter

# Season from month
season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```

### 17.10 Material Categories (from myDFHackScripts)

```
Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature
```

### 17.11 Personality Facets (50)

Read from `unit.status.current_soul.personality`. Each facet ranges from -50 to +50. Used for labor recommendations, mood prediction, narrative voice emulation.

### 17.12 Worship Strength Thresholds

```
dubious: <10
casual: <25
average: <75
faithful: <90
ardent: >=90
```

### 17.13 Noble Position Categories

```
Noble: amber badge
Military: red badge
Administrator: blue badge
Other: stone badge
```

---

## 18. Implementation Status

### 18.1 What Is Built

| Capability | Status | Details |
|-----------|--------|---------|
| XML legends ingestion | Built | CDM schema, 8/14+ sections parsed, 733-line parser |
| XML+ merge (legends_plus) | Built | Dual-file merge strategy |
| Live polling (bridge) | Built | v6, 922 lines, 7 data domains, 16 sections |
| dfhack-run SSH transport | Verified | All data domains accessible |
| Change detection | Built | Snapshot comparison, 11 event types |
| PostgreSQL persistence | Built | 1.65M records, 40+ tables |
| 131-test suite | Built | Test coverage for core functionality |
| CLI interface | Built | `chronicler watch`, `chronicler ingest` |
| Schema browser | Built | Table list, column detail, FK info |
| Data browser | Built | Paginated grid, filters, JSONB expansion |
| SQL Runner | Built | Read-only safety measures |
| FK link navigation | Built | Cross-table clickable links |
| Graph tab | Partially built | vis.js ego network, search, 1-3 hop depth |
| Storyteller | Built | 23 categorical routes, SSE streaming, keyword mode |
| Storyteller monitoring | Built | Logging, dashboard, 3 API endpoints |
| Importance scoring | Implemented | df-narrator formulas adapted |
| Person view (Unit+HF merge) | Implemented | 6-rule merge with conflict resolution |
| Confidence signaling | Implemented | Context density notes |
| Fortress denizens | Implemented | NVS ranking per watcher cycle |
| VM scripts | Built | vm-config, vm-lifecycle, vm-bootstrap (19 commands) |
| File transfer | Built | HTTP (105 MB/s), SCP (19 MB/s), Guest Agent fallback |
| Bridge deployment | Built | SMB + SSH deployment scripts |

### 18.2 What Is Planned / Not Started

| Capability | Priority | Gap |
|-----------|----------|-----|
| Agentic SQL storyteller | P1 | Schema summary + SQL tool definition needed |
| Interactive world map (Leaflet) | P1 | Centerpiece visualization feature |
| Event narrative templates (132 types) | P1 | High-value narrative enrichment |
| Death cause rendering (50+ variants) | P1 | Critical for narrative quality |
| Perspective-aware rendering | P1 | Context-aware event linking |
| Missing CDM entity types (WorldConstructions, ArtForms, Identities, Rivers) | P1 | Schema completeness |
| HF field extensions (skills, kills, family, interactions, whereabouts) | P1 | Data completeness |
| Entity detail pages (24-section HF page, 5-tab Entity page, etc.) | P1 | Explorer completeness |
| Global search with autocomplete | P2 | Primary navigation mechanism |
| Family tree visualization | P2 | Compelling genealogy feature |
| Population/event charts | P2 | Demographic visualization |
| Hover popovers | P2 | Exploration UX |
| Knowledge Horizon | P2 | Immersive storyteller feature |
| Worldgen monitoring | P2 | Novel capability |
| eventful subscriptions in bridge | P2 | Reactive event capture |
| Death cause enrichment in bridge | P2 | Narrative quality improvement |
| Labor manager (grid + skills) | P3 | Dwarf Therapist-equivalent |
| Mod manager core | P3 | Modpack management |
| AI Fortress Advisor | P3 | df-ai-inspired recommendations |
| War chord diagram / warfare graph | P3 | Advanced visualizations |
| Raw compiler | P4 | Full mod compilation pipeline |
| Labor optimization engine | P4 | Constraint satisfaction optimization |

---

## 19. Consolidated Action Items

### Tier 1 -- Critical (Blocks Narrative Engine and Explorer)

| # | Action | Effort | Source |
|---|--------|--------|--------|
| 1 | Add all 144 event types to CDM taxonomy | M | df-structures |
| 2 | Extend HF CDM with missing high-priority fields (flags, interactions, skills, links, kills, whereabouts) | L | All legends browsers |
| 3 | Add importance scoring columns and compute on ingestion | S | df-narrator |
| 4 | Implement death cause narrative rendering (50+ causes) | M | weblegends |
| 5 | Implement perspective-aware event narrative generation | M | LB2, weblegends |
| 6 | Add cross-linking infrastructure (entity references become navigable links) | M | All legends browsers |
| 7 | Implement DF calendar utility (seconds72 to date/month/season) | S | df-narrator, weblegends |
| 8 | Build agentic SQL storyteller (schema summary + SQL tool) | L | Chronicler original |
| 9 | Parse remaining XML sections (world_constructions, art_forms, identities, rivers) | M | All legends browsers |
| 10 | Build post-parse processing pipeline (10 cross-referencing steps) | L | LB2, LV-Next |

### Tier 2 -- High Value (Visualization and Data Completeness)

| # | Action | Effort | Source |
|---|--------|--------|--------|
| 11 | Interactive world map with Leaflet.js | L | LV-Next, LB2 |
| 12 | Family tree visualization (Cytoscape.js dagre) | M | LV-Next, LB1 |
| 13 | Event timeline charts (Chart.js line/bar) | M | LV-Next |
| 14 | Population distribution charts | S | LV-Next, LB1 |
| 15 | Hover popovers for entity preview | M | LB2 |
| 16 | Global search with autocomplete | M | LB2 |
| 17 | Entity detail pages (HF 24-section, Entity 5-tab, Site, Artifact, etc.) | XL | All browsers |
| 18 | Knowledge Horizon Phase 1-2 (denizen + view-based masking) | L | Chronicler original |

### Tier 3 -- Bridge & Live Data Enhancements

| # | Action | Effort | Source |
|---|--------|--------|--------|
| 19 | Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, UNIT_NEW_ACTIVE, SYNDROME) | S | myDFHackScripts |
| 20 | Death cause resolution via `df.global.world.incidents.all` | S | myDFHackScripts |
| 21 | Parent/family chain extraction (`unit.relationship_ids.Mother/Father`) | S | myDFHackScripts |
| 22 | Book/written work detection (`dfhack.items.getBookTitle`) | S | myDFHackScripts |
| 23 | Create `worldgen-bridge.lua` for real-time worldgen monitoring | M | worldgen-scraping |
| 24 | Add `worldgen_snapshots` CDM table | S | worldgen-scraping |
| 25 | Add personality/soul data to bridge (50 facets, beliefs, goals, needs) | M | df-structures |
| 26 | Add skill progression tracking per unit | M | myDFHackScripts |

### Tier 4 -- Stretch / Advanced Features

| # | Action | Effort | Source |
|---|--------|--------|--------|
| 27 | Curse lineage tree (vampire/werebeast "who bit whom") | M | LB1 |
| 28 | Warfare graph (Cytoscape.js cola force-directed) | M | LV-Next |
| 29 | War chord diagram (D3.js) | M | LB1 |
| 30 | Mod manager core (discovery, profiles, conflict detection) | L | ModHearth, DF-Modloader |
| 31 | Labor manager core (grid, skills, personality) | XL | Dwarf Therapist patterns |
| 32 | AI Fortress Advisor (population, military, resources) | XL | df-ai |
| 33 | Stock threshold model as LLM advisor context | M | df-ai |
| 34 | Raw file parser for mod conflict detection | L | DF-Modloader |
| 35 | Full raw compiler pipeline | XL | DF-Modloader |
| 36 | Labor optimization engine (constraint satisfaction) | XL | Chronicler original |
| 37 | Mod awareness (record active mods per world) | S | Chronicler original |
| 38 | Timeline scrubber (historical map state) | L | Chronicler original |
| 39 | Civilization territory overlays | L | Chronicler original |
| 40 | Worldgen live map preview | XL | Chronicler original |

---

## 20. Sources & References

### 20.1 Component Research Reports

| Report | File | Lines | Scope |
|--------|------|-------|-------|
| World History Visualizer | `tmp/component-01-world-history-visualizer.md` | ~800 | Maps, timelines, demographics, family trees, war viz |
| Database Explorer | `tmp/component-02-database-explorer.md` | ~900 | Schema browser, data grid, entity pages, search, SQL |
| AI Storyteller | `tmp/component-03-ai-storyteller.md` | ~800 | Q&A engine, narrative engine, scoring, Knowledge Horizon |
| AI Player | `tmp/component-04-ai-player.md` | ~700 | Population, military, resources, construction, trade |
| Mod Manager | `tmp/component-05-mod-manager.md` | ~750 | Discovery, conflicts, raw parsing, compilation, Steam |
| Labor Manager | `tmp/component-06-labor-manager.md` | ~650 | Labor grid, skills, personality, stress, batch ops |
| CDM & Database | `tmp/component-07-cdm-database.md` | ~950 | Schema, tables, PKs, JSONB, unit-HF merge, indexes |
| Data ETL | `tmp/component-08-data-etl.md` | ~850 | XML parsing, bridge, DFHack, worldgen, file transfer |

### 20.2 Repository Research Reports

| Report | File | Repos Covered |
|--------|------|---------------|
| df-ai | `research/df-ai-research.md` | df-ai (C++) |
| LegendsViewer-Next | `research/legendsviewer-next-research.md` | LV-Next (.NET/Vue) |
| df-narrator + weblegends | `research/narrator-weblegends-research.md` | df-narrator, weblegends |
| LegendsBrowser + LB2 | `research/legends-browsers-research.md` | LB (Java), LB2 (Go) |
| DFHack infrastructure | `research/dfhack-infrastructure-research.md` | dfhack-client-python, DFLogger, df-structures, myDFHackScripts |
| Mod management | `research/mod-management-research.md` | DF-Modloader, ModHearth, PyLNP, PyDwarf |
| Worldgen scraping | `research/worldgen-scraping-research.md` | df-structures, df-ai, weblegends |
| DwarvenSurveyor + scripts | `research/dwarven-surveyor-scripts-research.md` | DwarvenSurveyor, myDFHackScripts |

### 20.3 Planning & Design Documents

| Document | Location |
|----------|----------|
| Planning History | `projects/chronicler/reports/planning-history.md` |
| Dev Environment Reference | `projects/chronicler/reports/dev-environment-reference.md` |
| Skill Review | `projects/chronicler/reports/skill-review.md` |
| Research Synthesis v1 | `projects/chronicler/reports/research-synthesis.md` |

---

*Research Synthesis v2 -- Chronicler Project, 2026-02-25*
*Total features cataloged: ~260+ across 8 components*
*Total repositories analyzed: 17*
*Total source documents synthesized: 8 component reports + 8 repository reports + planning history*
