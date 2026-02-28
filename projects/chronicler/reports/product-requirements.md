# Chronicler -- Product Requirement Document (PRD)

**Version**: 1.0
**Date**: 2026-02-25
**Status**: Comprehensive -- All Features Cataloged
**Sources**: Research Synthesis v2, Planning History, 8 Component Research Reports, 17+ Repository Research Reports

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Product Architecture](#2-product-architecture)
3. [MC-1: World History & Demographics Visualizer](#3-mc-1-world-history--demographics-visualizer)
4. [MC-2: Database Explorer Tools](#4-mc-2-database-explorer-tools)
5. [MC-3: AI Storyteller (Narrative Engine)](#5-mc-3-ai-storyteller-narrative-engine)
6. [MC-4: AI Fortress Player (Advisor)](#6-mc-4-ai-fortress-player-advisor)
7. [MC-5: Mod Manager](#7-mc-5-mod-manager)
8. [MC-6: Labor Manager](#8-mc-6-labor-manager)
9. [FS-1: Common Data Model & Database](#9-fs-1-common-data-model--database)
10. [FS-2: Data ETL Systems](#10-fs-2-data-etl-systems)
11. [Cross-Cutting: Knowledge Horizon](#11-cross-cutting-knowledge-horizon)
12. [Cross-Cutting: Scoring & Ranking](#12-cross-cutting-scoring--ranking)
13. [Cross-Cutting: Navigation & UX Patterns](#13-cross-cutting-navigation--ux-patterns)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [DFHack Reference Guide](#15-dfhack-reference-guide)
16. [Technology Stack](#16-technology-stack)
17. [Current State (v0.8)](#17-current-state-v08)

---

## 1. Product Vision

### 1.1 Mission Statement

**Chronicler** is a living record of every world Dwarf Fortress generates. It is the first tool in the DF ecosystem to combine persistent database storage, live fortress polling, legends XML ingestion, LLM-driven narrative generation, worldgen monitoring, and dynamic Knowledge Horizon masking in a single integrated system.

### 1.2 Two Core Purposes

**Purpose 1 -- The AI Storyteller**: A conversational interface that knows your world as well as any bard in it. Ask "who was the most tragic dwarf in history?" and get a coherent character study drawing on biography, relationships, and the events that shaped them.

**Purpose 2 -- The Living Atlas**: An all-inclusive data viewer in your browser, showing everything from world-generation demographics to current fortress population in real time.

### 1.3 Unique Position

Chronicler is the only tool that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse to CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel capability)
6. Dynamic Knowledge Horizon masking
7. Mod management awareness
8. Labor/population management (Dwarf Therapist-equivalent)

---

## 2. Product Architecture

### 2.1 Component Hierarchy

```
Chronicler Application
|
+-- Main Components (6)
|   +-- MC-1: World History & Demographics Visualizer
|   +-- MC-2: Database Explorer Tools
|   +-- MC-3: AI Storyteller (Narrative Engine)
|   +-- MC-4: AI Fortress Player (Advisor)
|   +-- MC-5: Mod Manager
|   +-- MC-6: Labor Manager
|
+-- Foundational Systems (2)
|   +-- FS-1: Common Data Model & Database
|   +-- FS-2: Data ETL Systems
|
+-- Cross-Cutting Concerns
    +-- Knowledge Horizon
    +-- Scoring & Ranking
    +-- Navigation & UX Patterns
    +-- Calendar System
```

### 2.2 Data Flow

```
Legends XML --> Parser --> PostgreSQL (40+ tables)
Live Bridge --> Watcher --> Change Detector --> PostgreSQL
dfhack-run (SSH) --> Lua commands --> Bridge/Watcher
Worldgen Monitor --> Snapshots --> PostgreSQL
                                      |
                              Denizen Registry
                                      |
                         LLM (Agentic SQL Tool Use)
                           |               |
                         Chat          Explorer
                                   (fortress-centric views)
```

---

## 3. MC-1: World History & Demographics Visualizer

### REQ-VIS-001: Interactive World Map (Leaflet.js)
- Leaflet.js 1.9.4 with `L.CRS.Simple`
- Y-axis inverted from DF coordinates (`map_height - y`)
- Scale: 4-10 pixels per world tile
- Zoom: `minZoom: -2`, `maxZoom: 2`
- Base layer: World map PNG as `L.imageOverlay` at 50% opacity
- Map image generated from region type colors via Python Pillow
- Three cached sizes: thumbnail (tileSize=2), default (tileSize=4), large (tileSize=10)
- **Priority**: P1

### REQ-VIS-002: Map Layer Groups (Toggleable)
- Sites: colored polygons by owning entity; gray for ruins; yellow for unowned
- World Constructions: squares for points, polylines for roads/bridges/tunnels
- Mountain Peaks: triangle markers
- Landmasses: semi-transparent rectangles
- Regions: outline polygons, color-coded by evilness (fuchsia=evil, aqua=good)
- Rivers: polyline paths
- Battle markers: red diamond polygons
- Custom "All"/"None" toggle buttons
- **Priority**: P1

### REQ-VIS-003: Site Marker Shapes by Type
- Circle: Unknown, Cave, Lair, Camp
- Triangle: Monastery, Fort, Tomb
- Square (small): Hillocks, Hamlet
- Pentagon: Fortress, ForestRetreat, Town, DarkPits
- Hexagon (large): MountainHalls, Castle, DarkFortress
- Star: Vault, Labyrinth, Shrine, Tower, ImportantLocation
- Colors: owning civilization's color; ruins=gray (#aaa); unowned=yellow (#ff0)
- **Priority**: P1

### REQ-VIS-004: Civilization Color System
- HSV rotation: medium saturation for first 6 races, lighter for 7-12, darker for 13-18
- Applied consistently across all views
- Optional user-customizable race colors
- **Priority**: P1

### REQ-VIS-005: Per-Object Mini-Maps
- Each entity detail page includes a small focused map
- Object's tiles highlighted in Magenta with yellow/red oval
- Served via `/api/map/{type}/{id}` returning base64 PNG
- **Priority**: P2

### REQ-VIS-006: Map Timeline Scrubber
- Year slider showing site ownership state at any historical point
- Sites recolored based on historical ownership
- "Not yet founded" sites hidden; "destroyed" sites gray
- Data from history_events (created_site, destroyed_site, site_taken_over, reclaim_site)
- **Priority**: P3

### REQ-VIS-007: Civilization Territory Overlays
- Semi-transparent colored polygons computed from owned sites
- Convex hull or alpha shape algorithm
- Toggle per-civilization
- **Priority**: P3

### REQ-VIS-008: Worldgen Live Map Preview
- During worldgen, `worldgen-bridge.lua` polls `df.global.world.world_data.region_map`
- Progressive terrain visualization via WebSocket push
- Entirely novel feature
- **Priority**: P3

### REQ-VIS-009: Map Search and Jump
- Search input overlaid on map
- Autocomplete from `/api/search?term=X&types=site,region`
- Camera jump to centroid on selection
- **Priority**: P2

### REQ-VIS-010: Site Bounding Box Display
- Render site `rectangle` field as semi-transparent `L.rectangle` overlay
- Shows actual spatial extent, not just point marker
- **Priority**: P2

### REQ-VIS-011: Hover Popovers (Map and All Entity Links)
- Every entity link triggers a popover on hover
- Content from `/api/popover/{type}/{id}`
- HF: name, race, sex, birth/death, type flags
- Site: name, type, owner entity
- Entity: name, type, race
- Artifact: name, material, current holder
- **Priority**: P2

### REQ-VIS-012: Population Charts (Doughnut/Pie)
- Population by Race doughnut
- Area by Overworld Regions doughnut
- Library: Chart.js or D3.js
- **Priority**: P2

### REQ-VIS-013: Event Timeline (Line Chart)
- Events per year plotted as line
- Appears on World summary and every entity detail page
- Data from `/api/{type}/{id}/eventchart`
- Clickable: year range zooms to Events tab
- **Priority**: P2

### REQ-VIS-014: Event Type Breakdown (Bar Chart)
- Count of each distinct event type for an entity
- Horizontal bar sorted by count descending
- **Priority**: P3

### REQ-VIS-015: War Chord Diagram (D3.js)
- Chord/ribbon diagram showing inter-civilization conflicts
- Chord width proportional to war count
- **Priority**: P3

### REQ-VIS-016: Warfare Graph (Force-Directed)
- Cytoscape.js with `cytoscape-cola` layout
- Nodes: Civilizations and battles/wars
- Edges: attack/defense relationships
- **Priority**: P3

### REQ-VIS-017: Family Tree Visualization
- Cytoscape.js 3.31.0 with `cytoscape-dagre` layout
- Traverse HF links (mother/father/child) up to 3 generations each direction
- Node classes: current (dashed orange), dead (30% opacity), male (blue), female (magenta), leader (round-octagon + crown), necromancer (skull), vampire (vampire icon), werebeast (wolf), ghost (ghost icon)
- Two sizes: compact (360px) and fullscreen (720px)
- **Priority**: P2

### REQ-VIS-018: Curse Lineage Tree
- Trace `HfDoesInteraction` events for vampire/werebeast curse chains
- Follow chain to Patient Zero
- Vampire: red/dark theme; Werebeast: orange theme
- **Priority**: P3

### REQ-VIS-019: Entity Relationship Graph (vis.js)
- vis.js with forceAtlas2Based physics
- 1-3 hop depth selector
- Node styling by entity type (HF, entity, site) and flags (deity, vampire, etc.)
- Performance guard: warning at 500+ nodes; refuse at 1,000+
- **Priority**: P2 (partially built)

### REQ-VIS-020: World Summary Dashboard
- Map thumbnail, population doughnuts, active/lost civilizations
- Events line chart + paginated event table
- World statistics summary
- **Priority**: P2

### REQ-VIS-021: Historical Eras Browser
- Era list with name, start/end year, duration
- Era detail with events within era
- **Priority**: P3

### REQ-VIS-022: Years and Events Browser
- Chronological index of all events year by year
- Event types meta-page
- Individual event detail
- Pagination: 1000 events per page
- **Priority**: P2

### REQ-VIS-023: Event Collection Hierarchy
- 19 EventCollection types displayed as drill-down hierarchies
- War -> Battle -> Individual events
- Beast attack, abduction, theft collections
- **Priority**: P2

### REQ-VIS-024: In-Game Data Curve Widget
- Custom bar/line graph with slider controls for live fortress data
- Based on myDFHackScripts `CurveWidget.lua` pattern
- **Priority**: P4

---

## 4. MC-2: Database Explorer Tools

### REQ-EXP-001: Schema Browser -- Table List with Row Counts
- API: `GET /api/explorer/schema/tables`
- Scrollable left panel (280px) with table names and row count badges
- **Priority**: P1 (built)

### REQ-EXP-002: Schema Browser -- Column/Type/PK/FK/Index Detail
- API: `GET /api/explorer/schema/tables/{table_name}`
- Two-column layout: table list (left) + detail panel (right)
- **Priority**: P1 (built)

### REQ-EXP-003: Schema Browser -- Visual FK Relationship Lines
- vis.js or D3.js force-directed ERD
- Tables as nodes, FK relationships as edges
- **Priority**: P3

### REQ-EXP-004: Schema Browser -- JSONB Column Field Inventory
- Sample N rows and extract union of all JSONB keys
- Return as nested key tree
- **Priority**: P2

### REQ-EXP-005: Data Browser -- Paginated Data Grid
- Server-side pagination (10/25/50/100 per page)
- API: `GET /api/explorer/data/{table_name}?page=1&per_page=25`
- **Priority**: P1 (built)

### REQ-EXP-006: Data Browser -- Column-Level Filtering
- Filter bar with parameterized WHERE clauses
- Input sanitization required
- **Priority**: P1 (partially built)

### REQ-EXP-007: Data Browser -- Column Sorting
- Clickable headers, `ORDER BY` dynamic
- Table/column names validated against whitelist
- **Priority**: P1 (partially built)

### REQ-EXP-008: Data Browser -- FK Link Navigation
- FK values as clickable links to referenced entity
- **Priority**: P1 (built)

### REQ-EXP-009: Data Browser -- JSONB Collapsible Expansion
- Collapsible tree widgets, syntax-highlighted
- **Priority**: P1 (built)

### REQ-EXP-010: Data Browser -- Row Detail Overlay
- Click row for full-screen detail view
- All columns, expanded JSONB, FK links, related records
- **Priority**: P2

### REQ-EXP-011: Historical Figure Detail Page (24 sections)
1. Profile Overview (age, birth, death, spheres, positions)
2. Family Tree (Cytoscape.js dagre)
3. Skills (scrollable with rank icons)
4. Related Factions/Groups
5. Related Sites
6. Close Relationships (sex-specific labels)
7. Vague Relationships
8. Worshipped Deities (worship strength: dubious/casual/average/faithful/ardent)
9. Journey Pets
10. Noble Positions (with date ranges)
11. Worshipping Figures (if deity)
12. Worshipping Entities (if deity)
13. Notable Kills
14. Artifacts (currently held)
15. Dedicated Structures
16. Snatcher Of
17. Battles (as attacker/defender/non-combatant)
18. Beast Attacks (if beast)
19. Full Event History (paginated, 1000/page)
20. Entity Reputations
21. Intrigue actors/plots
22. Used Identities
23. Squad links
24. Site Property links
- **Priority**: P1

### REQ-EXP-012: Entity (Civilization) Detail Page (5 tabs)
- Leaders, Sites, Members, Groups, Wars
- Mini-map, entity color, race badge, member count
- Position badges: Noble=amber, Military=red, Administrator=blue, Other=stone
- **Priority**: P1

### REQ-EXP-013: Site Detail Page (3 tabs)
- Structures, Properties, History
- Mini-map, world populations, inhabitants, artifacts
- Owner entity with ownership history
- **Priority**: P1

### REQ-EXP-014: Artifact Detail Page
- Chain-of-custody timeline
- Material, item type, current holder/location
- Written content references
- **Priority**: P2

### REQ-EXP-015: Region Detail Page
- Biome type (10 types), evilness, contained sites
- Region outline on map
- **Priority**: P2

### REQ-EXP-016: Structure Detail Page
- Type (12+ types), ruin status, parent site
- **Priority**: P2

### REQ-EXP-017: Written Content Detail Page
- Form, author HF link, references, styles
- **Priority**: P2

### REQ-EXP-018: Event Collection Detail Page
- 19 collection types as drill-down hierarchies
- War: aggressor/defender, sub-collections (battles), map with markers
- Battle: squads, attackers/defenders, outcome
- **Priority**: P2

### REQ-EXP-019: Additional Entity Type Pages
- Underground Regions, Landmasses, Mountain Peaks, Rivers
- World Constructions, Art Forms (3 types), Identities, Historical Eras
- **Priority**: P2

### REQ-EXP-020: Accent-Insensitive Full-Text Search
- PostgreSQL `unaccent` extension
- `unaccent(name) ILIKE unaccent($1)` across all entity types
- **Priority**: P1

### REQ-EXP-021: Global Search with Live Autocomplete
- Debounced 200ms keystroke, 50 results max
- Results categorized by entity type
- Search scope: HFs, entities, sites, structures, regions, artifacts, constructions, art forms, written contents, landmasses, mountain peaks, identities
- **Priority**: P1

### REQ-EXP-022: HF Filtering by Type Flags
- deity, force, vampire, werebeast, necromancer, alive, ghost, adventurer, race
- Sort: name, race, birth, death, kills
- **Priority**: P2

### REQ-EXP-023: Advanced Query Builder (Visual)
- Drag-and-drop table selection, JOIN builder, WHERE builder
- Preview generated SQL
- **Priority**: P4

### REQ-EXP-024: Raw SQL Explorer (SQL Runner)
- Read-only transaction, keyword blocklist
- Enforced LIMIT cap (1000 rows), 5s timeout
- **Priority**: P1 (built)

### REQ-EXP-025: Query Results Export (CSV/JSON)
- Export from data grid and SQL runner
- **Priority**: P2

### REQ-EXP-026: Entity Data Export (Full Entity JSON)
- Complete entity record with JOINed data
- **Priority**: P3

### REQ-EXP-027: Cross-Linked Entity References
- Every entity reference is a clickable navigable link
- Server-side HTML generation with `<a>` tags
- **Priority**: P1

### REQ-EXP-028: Perspective-Aware Event Rendering
- Pass entity ID as context
- Suppress self-links, use relational pronouns
- **Priority**: P1

### REQ-EXP-029: Breadcrumb / Prev-Next Navigation
- Prev/Next floating action buttons on detail pages
- URL hash tab persistence
- **Priority**: P2

### REQ-EXP-030: Ego-Network Graph (vis.js)
- Already partially built
- 1-3 hop depth, forceAtlas2Based physics
- Node info panel, performance guards
- **Priority**: P2 (partially built)

---

## 5. MC-3: AI Storyteller (Narrative Engine)

### REQ-STR-001: Conversational World Q&A
- Natural language questions about DF world history
- 23 categorical routes for keyword routing
- Name-based ILIKE search fallback
- World overview fallback (summary stats)
- **Priority**: P1 (built)

### REQ-STR-002: Dual-Tier Context (HISTORICAL + LIVE)
- System prompt distinguishes two data tiers
- Answers weave legends data with current fortress state
- **Priority**: P1 (built)

### REQ-STR-003: SSE Streaming Responses
- `sse_starlette.sse.EventSourceResponse`
- Token-by-token display
- **Priority**: P1 (built)

### REQ-STR-004: Multi-World Support
- `world_id` parameter on every query
- World name injected into prompt context
- **Priority**: P1 (built)

### REQ-STR-005: Confidence Signaling
- Context density note: <3 records = caution; >10 = rich context
- **Priority**: P1 (built)

### REQ-STR-006: "No Record" Honesty
- System prompt: "If the records do not contain information, say so honestly"
- **Priority**: P1 (built)

### REQ-STR-007: Agentic SQL Tool Use
- LLM receives schema summary + SQL tool definition + denizen summary
- Up to 5 rounds of SQL exploration
- Read-only, 50 row max, 5s timeout per query
- Tool calls hidden from SSE stream
- **Priority**: P1 (planned v1.0)

### REQ-STR-008: Character Profile & Biography Generation
- Given figure_id: HF + unit records, events, relationships, artifacts
- LLM generates comprehensive biography
- **Priority**: P1

### REQ-STR-009: Unified Person View (Unit + HF Merge)
- 6-rule merge: start with Unit, overlay HF, conflict resolution by recency/authority
- Personality from Unit only, events from both sources
- **Priority**: P1 (implemented)

### REQ-STR-010: Personality-Driven Voice Emulation
- Map 50 personality traits to narrative dimensions
- Each dwarf "speaks" with personality-consistent voice
- **Priority**: P2

### REQ-STR-011: Relationship Traversal on HF Match
- Query hf_links (spouse/children/parents)
- Query hf_entity_links (memberships/positions)
- Query hf_site_links (associated sites)
- **Priority**: P1 (implemented)

### REQ-STR-012: Emotion/Zone Integration
- Match emotions to unit IDs
- Resolve zone ownership
- LLM connects dots for mood explanations
- **Priority**: P1 (implemented)

### REQ-STR-013: War Narrative Generation
- Query event_collections WHERE type='war'
- Retrieve sub-collections (battles, sieges)
- Resolve entity names
- **Priority**: P2

### REQ-STR-014: Battle Detail Rendering
- Attacker/defender civilizations, generals, region
- Named participants from event details
- **Priority**: P2

### REQ-STR-015: Civilization Rise-and-Fall Narratives
- Chronological entity events
- Leader succession from hf_position_links
- **Priority**: P2

### REQ-STR-016: Per-Type Event Narrative Templates (132+ types)
- Template bank for all 132 LB2-handled event types
- LLM fallback for remaining types
- Pattern: Event -> Context -> Template -> HTML
- **Priority**: P1

### REQ-STR-017: Death Cause Rendering (50+ variants)
- Complete taxonomy: OLD_AGE, SHOT, BLEED, DROWN, SUFFOCATE, MAGMA, DRAGONFIRE, CAVEIN, DRAWBRIDGE, BEHEAD, CRUCIFY, BURN_ALIVE, HACK_TO_PIECES, DRAIN_BLOOD, LEAPT_FROM_HEIGHT, INFECTION, + 25 more
- Weapon info, slayer identity with race, age at death
- **Priority**: P1

### REQ-STR-018: Circumstance/Reason Rendering
- Reasons: glorify_hf, artifact_is_heirloom, symbol_of_everlasting_peace
- Circumstances: Death, Prayer, DreamAbout, Nightmare, FromAfar
- **Priority**: P2

### REQ-STR-019: Age at Death with Fractions
- 1/4, 1/2, 3/4 display
- **Priority**: P2

### REQ-STR-020: Temporal Context in Events
- "In 125 on the 3rd of Granite" or suppressed year for continuation
- **Priority**: P2

### REQ-STR-021: Interaction Text from Game Raws
- Vampire biting, necromantic raising from `hist_string_1`/`hist_string_2`
- **Priority**: P3

### REQ-STR-022: Missing Event Fallback
- Fall back to DF's `getSentence()` via DFHack or raw field dump
- **Priority**: P2

### REQ-STR-023: Event Payload Enrichment
- JOINs resolving IDs to names
- Natural-language templates for JSONB fields
- **Priority**: P1 (implemented)

### REQ-STR-024: DF Calendar Formatting
- `seconds72 // 1200 + 1` for day_of_year
- Months: Granite through Obsidian
- Seasons: early/mid/late spring through winter
- **Priority**: P1

### REQ-STR-025: Narrative Value Score (NVS) for Denizens
- Fortress "who matters" ranking
- Updated per watcher cycle
- **Priority**: P1 (implemented)

### REQ-STR-026: Rivalry Detection (Co-Appearance)
- Count HF co-appearances across events using HF_FIELDS set
- Top-10 rivals per figure
- **Priority**: P2

### REQ-STR-027: Top-N Entity Selection for LLM Context
- Configurable: `--top-figures N`, `--top-sites N`, `--top-wars N`, `--top-artifacts N`
- Selection by importance score
- **Priority**: P1

### REQ-STR-028: Per-Interaction LLM Logging
- `storyteller_log` table with full metadata
- Four-phase latency tracking
- **Priority**: P1 (built)

### REQ-STR-029: Monitoring Dashboard
- Summary cards, recent interactions, auto-refresh 30s
- **Priority**: P2

### REQ-STR-030: Template vs. LLM Hybrid Rendering
- Fast path: deterministic templates for explorer event tables
- Rich path: LLM-enhanced for chat and featured content
- **Priority**: P1

### REQ-STR-031: Proactive Narrative Engine (Post-v1.0)
- Watch for high-NVS events
- Generate narrative alerts via WebSocket
- **Priority**: P4

### REQ-STR-032: Knowledge Horizon Integration
- Query against visible_* views instead of base tables
- System prompt advisory
- Confidence adjustment based on horizon scope
- **Priority**: P2

---

## 6. MC-4: AI Fortress Player (Advisor)

### REQ-ADV-001: Tick-Based Multi-Rate Polling
- Population: 25 ticks, Construction: 240 ticks, Stocks: 100 ticks
- **Priority**: P3

### REQ-ADV-002: Ten-Phase Population Update Cycle
- Trading, CitizenList, Nobles, Jobs, Military+Crimes, Pets, Dead, Caged, Locations, Emit
- **Priority**: P3

### REQ-ADV-003: Reactive Control Architecture
- Five invariant-maintenance loops
- Deviation detection and correction recommendations
- **Priority**: P3

### REQ-ADV-004: Exclusive Action Queue
- One active action chain; queue others
- Completion/failure reported before next
- **Priority**: P3

### REQ-ADV-005: Advisor vs. Autonomous Mode Toggle
- `advisor`: recommend only
- `autonomous`: execute via DFHack Lua
- **Priority**: P3

### REQ-ADV-006: Fortress Health Summary
- Daily (1,200 ticks) and annual (403,200 ticks) aggregation
- **Priority**: P3

### REQ-ADV-007: Event-Driven Reactive Alerts
- DFHack eventful: UNIT_DEATH, INVASION, SYNDROME, UNIT_NEW_ACTIVE, ITEM_CREATED
- **Priority**: P2

### REQ-ADV-008: Citizen Arrival/Departure Tracking
- Set comparison every 25 ticks
- Auto-assign bedroom/dining on arrival
- **Priority**: P2

### REQ-ADV-009: Noble Assignment Advisor
- Track: bookkeeper, manager, broker, mayor, sheriff, captain of guard
- Room value validation
- **Priority**: P3

### REQ-ADV-010: Job Stall Detection
- Auto-unsuspend non-repeating suspended jobs
- **Priority**: P3

### REQ-ADV-011: Military Sizing Advisor
- Target: 25%-75% of citizen count (configurable)
- XP-based draft/dismiss selection
- **Priority**: P3

### REQ-ADV-012: Squad Creation and Sizing
- 4/6/8/10 members based on total military
- Alternating Heavy melee / Heavy ranged uniforms
- **Priority**: P3

### REQ-ADV-013: Three-Tier Stock Threshold Model
- ~100 item categories: Needed, NeededPerDwarf, WatchStock, AlsoCount
- **Priority**: P3

### REQ-ADV-014: Automatic Production Ordering
- `queue_need(item, amount)` -> `add_manager_order(template, amount)`
- Duplicate avoidance within 5 units
- **Priority**: P3

### REQ-ADV-015: Farm Management
- 7 crop categories per season per biome
- drink_plants, thread_plants, mill_plants, bag_plants, dye_plants, slurry_plants, grow_plants
- **Priority**: P3

### REQ-ADV-016: Metalworking Chain
- 4-step: scan ore -> smelt bars -> forge equipment -> check quality
- **Priority**: P3

### REQ-ADV-017: Construction Planning (22 Room Types)
- 4-state machine: plan -> dig -> dug -> finished
- JSON-driven priority system
- Blueprint/floor plan support
- **Priority**: P4

### REQ-ADV-018: Trade Cycle Management (9 steps)
- Detect caravan -> broker -> items -> trade screen -> scan -> balance (110%) -> counter-offers -> dismiss
- **Priority**: P3

### REQ-ADV-019: Threat Assessment and Response
- Monitor hostile units, forgotten beasts, megabeasts, invaders
- Score threat severity
- **Priority**: P3

### REQ-ADV-020: Natural Language Fortress Advice (LLM)
- LLM receives fortress state + heuristic knowledge
- Data-backed reasoning with explicit explanation
- **Priority**: P3

### REQ-ADV-021: Multi-Step Action Plans
- LLM generates ordered step-by-step plans for complex projects
- **Priority**: P3

### REQ-ADV-022: Context-Aware Proactive Alerts
- LLM reviews fortress state and generates unsolicited alerts
- **Priority**: P3

### REQ-ADV-023: Fortress Post-Mortem Narrative
- On loss, generate narrative from accumulated events
- **Priority**: P3

### REQ-ADV-024: Embark Site Evaluation
- Water, metal, soil, trees, neighbors, cavern, aquifer, biome
- **Priority**: P4

### REQ-ADV-025: Random Embark with Auto-Restart
- Auto-queue new embark on fortress loss
- **Priority**: P4

---

## 7. MC-5: Mod Manager

### REQ-MOD-001: Mod Discovery via Filesystem Scan
- Scan `<DF_dir>/Mods/`, `data/vanilla/`, `data/installed_mods/`
- Parse `info.txt` files (v50 format)
- **Priority**: P3

### REQ-MOD-002: DFHack Live Mod Discovery
- `dfhack-run` over SSH to query `gui/mod-manager`
- **Priority**: P3

### REQ-MOD-003: info.txt Parser (All v50 Fields)
- ID, NAME, NUMERIC_VERSION, DISPLAYED_VERSION, EARLIEST_COMPATIBLE versions
- AUTHOR, DESCRIPTION, REQUIRES_ID, REQUIRES_ID_BEFORE_ME, REQUIRES_ID_AFTER_ME
- CONFLICTS_WITH_ID, Steam fields (STEAM_TITLE, STEAM_FILE_ID, etc.)
- **Priority**: P3

### REQ-MOD-004: Modpack CRUD
- Read/write `mod-manager.json`
- Create, rename, delete, set-default
- **Priority**: P3

### REQ-MOD-005: Profile Import/Export
- JSON format with version compatibility warnings
- **Priority**: P3

### REQ-MOD-006: Load Order Management
- 18 canonical header type ordering
- Drag-and-drop reordering in UI
- **Priority**: P3

### REQ-MOD-007: Level 1 Conflict Detection (Metadata)
- Dependency check, version incompatibility, CONFLICTS_WITH_ID
- O(n) scan with scannedModIDs/unscannedModIDs sets
- **Priority**: P3

### REQ-MOD-008: Level 2 Conflict Detection (Object ID)
- Parse `objects/*.txt` for duplicate definitions
- O(n x m) scan
- **Priority**: P3

### REQ-MOD-009: Level 3 Conflict Detection (Semantic)
- Full CUT/SELECT interaction analysis
- Requires raw compiler (REQ-MOD-015)
- **Priority**: P4

### REQ-MOD-010: Visual Conflict Indicators
- Green (clean), Yellow (warnings), Orange (overlap), Red (fatal)
- **Priority**: P3

### REQ-MOD-011: LOOT-Style Auto-Order
- Topological sort of dependency graph
- Community masterlist (long-term)
- **Priority**: P4

### REQ-MOD-012: Raw File Tokenizer
- State machine: COMMENTS -> TOKEN -> ARGS
- 18 DF super-types mapped to file prefixes
- **Priority**: P3

### REQ-MOD-013: Three-Way File Merge
- PyLNP algorithm: vanilla + accumulated + new mod
- `difflib.SequenceMatcher` based
- Status codes: 0 (clean) to 3 (fatal)
- **Priority**: P4

### REQ-MOD-014: Vanilla Baseline Management
- Baselines stored in designated directory
- `make_blank_files()` for clean comparison
- **Priority**: P4

### REQ-MOD-015: Full Raw Compiler
- DF-Modloader-style compilation pipeline
- EDIT/SELECT/CUT/OBJECT_TEMPLATE processing
- **Priority**: P4

### REQ-MOD-016: Modpack Snapshot at World Creation
- Capture active mod list during worldgen
- Store in `world_modpacks` table
- **Priority**: P3

### REQ-MOD-017: Mod History in Database
- Link game events to active modpack
- Query: "which mods were active when this creature was generated?"
- **Priority**: P3

### REQ-MOD-018: Mod Annotation in Legends Display
- Annotate entities with defining mod
- **Priority**: P4

### REQ-MOD-019: Steam Workshop Integration
- Detect subscribed Workshop mods
- Path resolution per platform
- Update notifications
- **Priority**: P4

### REQ-MOD-020: CLI Interface
- `chronicler mods list/profiles/activate/check`
- **Priority**: P3

---

## 8. MC-6: Labor Manager

### REQ-LAB-001: Labor Toggle Grid (Dwarf Therapist-style)
- 2D grid: dwarves (rows) x labors (columns)
- Read `unit.labors[]`, write via DFHack Lua
- **Priority**: P3

### REQ-LAB-002: Skill Display and Progression
- `unit.status.current_soul.skills[]`: skill_id, rating (0-20), experience
- Store snapshots per watcher cycle for delta tracking
- **Priority**: P3

### REQ-LAB-003: Personality Trait Visualization (50 Facets)
- `unit.status.current_soul.personality`
- Radar chart or bar chart
- Map extreme values to natural language
- **Priority**: P3

### REQ-LAB-004: Happiness/Stress Monitoring
- `stress_level` color-coded: green/yellow/orange/red
- Trend tracking over time
- **Priority**: P2

### REQ-LAB-005: Squad Assignment Management
- Read/write `unit.military.squad_id` and `squad_position`
- Squad rosters, equipment readiness
- **Priority**: P3

### REQ-LAB-006: Noble/Position Management
- Track `fortress_entity.positions.own`
- Room value validation
- **Priority**: P3

### REQ-LAB-007: Profession Management
- Custom profession templates (name + labor set)
- Batch-apply to groups
- **Priority**: P3

### REQ-LAB-008: Dwarf Filtering/Sorting
- Multi-criteria: name, race, profession, skill, stress, squad
- Accent-insensitive search
- **Priority**: P2

### REQ-LAB-009: Thought/Emotion Display
- `personality.emotions[]`: 80+ thought types
- Natural language descriptions
- **Priority**: P2

### REQ-LAB-010: Need Satisfaction Tracking
- `personality.needs[]`: type + satisfaction level
- Recommend actions to satisfy needs
- **Priority**: P3

### REQ-LAB-011: Attribute Display
- 6 physical: strength, agility, toughness, endurance, recuperation, disease_resistance
- 12+ mental: analytical_ability, focus, willpower, creativity, intuition, patience, memory, linguistic_ability, spatial_sense, musicality, kinesthetic_sense, empathy
- **Priority**: P3

### REQ-LAB-012: Citizen Roster with Configurable Polling
- Poll `df.global.world.units.active` at configurable interval (default 500 ticks)
- Track arrivals, departures, deaths
- **Priority**: P2

### REQ-LAB-013: AI-Powered Labor Assignment Advisor
- Personality + skills + fortress needs -> recommendations
- **Priority**: P4

### REQ-LAB-014: Skill-Based Labor Auto-Assignment
- Top N skills -> enable corresponding labors
- Configurable thresholds per labor type
- **Priority**: P3

### REQ-LAB-015: Population Migration Tracking
- `fortress_denizens` table with arrival/departure data
- Link migrants to origin sites
- **Priority**: P2

### REQ-LAB-016: Job Management and Stall Detection
- Scan for suspended non-repeating jobs
- Auto-unsuspend or alert
- **Priority**: P3

### REQ-LAB-017: Wound/Health Tracking
- `unit.health`, `unit.body.wounds[]`
- Severity, affected parts, treatment status
- **Priority**: P3

### REQ-LAB-018: Inventory/Equipment Display
- `unit.inventory[]`
- Quality levels, missing equipment alerts
- **Priority**: P3

### REQ-LAB-019: Relationship Visualization
- 9 relationship slots + hf_links
- Family cluster identification
- **Priority**: P3

### REQ-LAB-020: Skill Distribution Analytics
- Fortress-wide skill coverage
- Number of practitioners per skill, gaps
- **Priority**: P3

### REQ-LAB-021: Stress Trend Analysis
- Track stress snapshots over time
- Predict breakdowns via trend analysis
- **Priority**: P3

### REQ-LAB-022: Batch Labor Operations
- Select group by filter, apply changes to all
- **Priority**: P3

### REQ-LAB-023: Labor Optimization Engine
- Constraint satisfaction for optimal labor matrix
- **Priority**: P4

### REQ-LAB-024: Newcomer Orientation View
- Popup for migration waves
- Quick-assess and assign new arrivals
- **Priority**: P3

### REQ-LAB-025: Deathwatch and Casualty Tracking
- 4 detection mechanisms: flag, absence, announcement, history event
- Death cause via `df.global.world.incidents.all`
- **Priority**: P2

---

## 9. FS-1: Common Data Model & Database

### REQ-CDM-001: PostgreSQL 16 with Extensions
- pgvector (2560-dim embeddings)
- unaccent (diacritic-tolerant search)
- **Priority**: P1 (built)

### REQ-CDM-002: Composite Primary Keys
- All 13 legends tables: `PRIMARY KEY (world_id, id)`
- Multi-world support without ID collisions
- **Priority**: P1 (built)

### REQ-CDM-003: JSONB Details Columns
- `JSONB DEFAULT '{}'` on most tables
- Overflow/unmapped fields storage
- **Priority**: P1 (built)

### REQ-CDM-004: Event Types as TEXT
- No DB enum -- raw data in details JSONB
- Design Decision #25
- **Priority**: P1 (built)

### REQ-CDM-005: Complete Table Set (40+ tables)
- World metadata, geography, entities, sites, structures, HFs, artifacts, written content, events, event collections, eras, live data, storyteller, knowledge horizon, worldgen
- **Priority**: P1 (35 built, 5+ planned)

### REQ-CDM-006: Missing CDM Entity Types
- World Constructions, Art Forms (3 types), Identities, Rivers
- **Priority**: P1

### REQ-CDM-007: HF Field Extensions
- active_interactions, spheres, goals, skills with XP, expanded entity_links, family links, kills, whereabouts, relationship profiles, entity reputations, intrigue actors/plots, used identities, journey pets, holds_artifact
- **Priority**: P1

### REQ-CDM-008: Importance Score Columns
- `importance_score FLOAT DEFAULT 0.0` on HFs, sites, artifacts
- Computed on ingestion using df-narrator formulas
- **Priority**: P1 (implemented)

### REQ-CDM-009: Knowledge Horizon Table
- `knowledge_horizon (world_id, entity_type, entity_id, visible)`
- View-based masking
- **Priority**: P2

### REQ-CDM-010: Worldgen Snapshots Table
- `worldgen_snapshots (world_id, phase, progress_pct, data JSONB, captured_at)`
- **Priority**: P2

### REQ-CDM-011: World Modpacks Table
- `world_modpacks (world_id, snapshot_time, modpack_json)`
- **Priority**: P3

### REQ-CDM-012: pgvector Embedding Tables
- For in-database semantic search
- 2560-dim embeddings
- **Priority**: P3

### REQ-CDM-013: Creature Dictionary Table
- Parse `<creature_raw>` section from `legends_plus.xml` (1,879 creatures in test world)
- Store per-world creature dictionary: `creature_id` → `name_singular`, `name_plural`, plus classification flags
- Schema: `creature_dictionary(world_id INT, creature_id TEXT, name_singular TEXT, name_plural TEXT, flags JSONB, PRIMARY KEY (world_id, creature_id))`
- Flags JSONB captures boolean classification tags: `megabeast`, `titan`, `unique_demon`, `night_creature`, `generated`, `entity_race`, `savage`, `evil`, `good`, `mundane`, `fanciful`
- Resolves opaque tokens (e.g., `HFEXP33187 E_HUM1` → "night's wolf", `COLOSSUS_BRONZE` → "bronze colossus", `TITAN_5` → "desert titan")
- Must be populated during legends ingestion, before post-parse pipeline
- All race display throughout the application joins through this table — no hardcoded creature name mappings
- Per-world because night creature experiments, titans, and demons are procedurally generated unique to each world
- **Priority**: P1

---

## 10. FS-2: Data ETL Systems

### REQ-ETL-001: Legends XML Parser (Streaming)
- `lxml.etree.iterparse` with `root.clear()`
- Handle files up to 1 GB+
- **Priority**: P1 (built)

### REQ-ETL-002: Dual-File Merge (legends.xml + legends_plus.xml)
- Parse legends.xml first, legends_plus.xml second
- Match by id fields
- **Priority**: P1 (built)

### REQ-ETL-003: Parse All 15+ XML Sections
- Currently 8/15+: sites, artifacts, regions, underground_regions, HFs, entities, events, event_collections, written_contents, eras
- Missing: world_constructions, art_forms (3), identities, rivers, mountain_peaks (full), landmasses (full), creature_raw
- The `<creature_raw>` section in legends_plus.xml contains the per-world creature dictionary (1,879 entries in test world) — see REQ-CDM-013
- **Priority**: P1

### REQ-ETL-004: Post-Parse Processing Pipeline (10 Steps)
1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags
4. Compute site ruin status
5. Build entity war lists
6. Compute HF kill lists
7. Calculate importance scores
8. Build event-to-entity cross-reference index
9. Resolve site ownership history
10. Validate referential integrity
- **Priority**: P1

### REQ-ETL-005: Live Bridge (chronicler-bridge.lua v6)
- DFHack repeat job every 100 ticks
- 7 data domains, 16 sections
- JSON output served over HTTP port 8889
- **Priority**: P1 (built)

### REQ-ETL-006: Bridge Enhancement -- eventful Subscriptions
- UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, UNIT_NEW_ACTIVE, SYNDROME
- Reactive event capture (currently polling-only)
- **Priority**: P2

### REQ-ETL-007: Bridge Enhancement -- Death Cause Enrichment
- `df.global.world.incidents.all` for death cause enum + killer ID
- 40+ death cause variants
- **Priority**: P2

### REQ-ETL-008: Bridge Enhancement -- Family Chain
- `unit.relationship_ids.Mother/Father` for family tree data
- **Priority**: P2

### REQ-ETL-009: Bridge Enhancement -- Book Detection
- `dfhack.items.getBookTitle(item)` for written work events
- **Priority**: P3

### REQ-ETL-010: Bridge Enhancement -- Personality/Soul Data
- 50 personality facets, beliefs, goals, needs
- **Priority**: P2

### REQ-ETL-011: Bridge Enhancement -- Skill Progression
- Track skill changes per unit per watcher cycle
- **Priority**: P2

### REQ-ETL-012: Worldgen Monitoring (worldgen-bridge.lua)
- Poll `df.global.world.worldgen_status` every 30 frames
- 12-state generation phase tracking
- Auto-start via `dfhack.onStateChange.worldgen_monitor`
- **Priority**: P2

### REQ-ETL-013: Change Detection (11 Event Types)
- ARRIVED, DEPARTED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED, STRESS_CHANGED, BUILDING_ADDED, BUILDING_REMOVED, REPORT_NEW, ARTIFACT_CHANGE
- **Priority**: P1 (built)

### REQ-ETL-014: File Transfer
- HTTP server port 8889 (~105 MB/s)
- SCP with `-O -T` flags (~19 MB/s)
- Guest Agent fallback (~0.24 MB/s)
- **Priority**: P1 (built)

### REQ-ETL-015: dfhack-run SSH Transport
- All data domains verified accessible
- Replaces broken TCP RPC
- **Priority**: P1 (built)

### REQ-ETL-016: RAG/Vector Indexing
- Qdrant collections: dfhack 8,476 pts, dwarf-therapist 926 pts
- Target: df-wiki 21K-27K points via wiki crawl
- Qwen3-Embedding-4B via MLX, 2560-dim
- **Priority**: P3

---

## 10b. Embedding Pipelines

### REQ-EMB-001: Entity Text Extraction Pipeline
- Build entity-type-specific text extractors (HF, site, entity, artifact, event, written content)
- Concatenate relevant fields into embeddable text representations
- Used by both batch (`chronicler embed`) and live (watcher) embedding paths
- **Priority**: P2

### REQ-EMB-002: Chunking Strategy
- Split entity text into embedding-sized chunks (512 tokens max, 64-token overlap)
- Content hash (SHA-256) per chunk for incremental re-embedding
- Most entities single-chunk; long site histories may produce 2-3 chunks
- **Priority**: P2

### REQ-EMB-003: Batch Embedding CLI Command
- `chronicler embed` generates embeddings for all entities after legends ingestion
- Support `--entity-types`, `--force` (re-embed even if unchanged), `--batch-size`
- Target: full world (~109K entities) in < 10 minutes using MLX batch inference
- Populates the `embeddings` table (REQ-CDM-012)
- **Priority**: P2

### REQ-EMB-004: Incremental Live Embedding
- Watcher daemon detects changed entities via content_hash comparison
- Re-embeds only entities whose extracted text has changed
- Reactive event embedding: immediately embed high-priority events (deaths, invasions)
- Integrated with bridge eventful subscriptions (REQ-ETL-006)
- **Priority**: P2

### REQ-EMB-005: Hybrid Semantic Search
- Augment global search with pgvector cosine similarity alongside ILIKE text search
- Reciprocal Rank Fusion (RRF) to merge text and semantic result sets
- Enables conceptual queries ("most powerful necromancer", "battles near the mountain")
- **Priority**: P2

### REQ-EMB-006: Narrative Context Retrieval
- Feed semantically relevant entity descriptions to storyteller prompts
- Query embeddings table with user query vector, filter by similarity threshold (> 0.3)
- Inject alongside SQL-retrieved structured data for richer narrative generation
- **Priority**: P2

---

## 11. Cross-Cutting: Knowledge Horizon

### REQ-KH-001: Geographic Scope Masking
- Always visible: fortress region + adjacent
- Revealed by: migrants, caravans, raids, expeditions
- **Priority**: P2

### REQ-KH-002: Civilization Scope Masking
- Always visible: parent civ structure
- Revealed by: diplomatic contact, wars, raids
- **Priority**: P2

### REQ-KH-003: Individual Scope Masking
- Always visible: fortress inhabitants + direct family
- Revealed by: arrival, family connection, organizational overlap
- **Priority**: P2

### REQ-KH-004: CAV-001 Organization Membership Propagation
- Cults=full, squads=chain-of-command, guilds=same-site, religion=nearby, civ=NO
- **Priority**: P2

### REQ-KH-005: CAV-002 Nobles Always Visible
- Public figures known to fortress
- **Priority**: P2

### REQ-KH-006: CAV-003 Previous Residence Knowledge
- Migrant carries knowledge of former site
- **Priority**: P3

### REQ-KH-007: CAV-004 Starting Dwarf Background Generation
- Synthetic HF entries with `source = 'inferred'`
- **Priority**: P3

### REQ-KH-008: CAV-005 Family Chain Propagation
- Depth 1=always, 2=if alive, 3+=masked
- **Priority**: P3

### REQ-KH-009: CAV-006 Event-Based Revelation
- War -> enemy civ; caravan -> source civ; migrant -> origin site; raid -> target; artifact -> full history
- **Priority**: P2

### REQ-KH-010: CAV-007 LLM Inference Restrictions
- System prompt instruction: treat horizon as in-world limitation
- **Priority**: P2

### REQ-KH-011: View-Based Masking Architecture
- `knowledge_horizon` table + `visible_*` views
- **Priority**: P2

### REQ-KH-012: Phased Rollout
- Phase 1: Denizen registry
- Phase 2: View-based HF masking
- Phase 3: Geographic masking
- Phase 4: Full KH with 7 caveats
- **Priority**: P2

---

## 12. Cross-Cutting: Scoring & Ranking

### REQ-SCR-001: Figure Importance Score
- `LEAST(event_count*2,500) + kill_count*15 + is_vampire*80 + is_necromancer*100 + is_deity*120 + is_force*90 + is_werebeast*70 + LEAST(hf_links*3,100) + leadership_positions*20 + artifacts_held*30 + LEAST(site_links*5,50) + LEAST(entity_links*3,60) + death_recorded*5`
- **Priority**: P1 (implemented)

### REQ-SCR-002: Site Importance Score
- `events + deaths*2 + event_collections*5 + structures*3`
- **Priority**: P1 (implemented)

### REQ-SCR-003: Conflict Importance Score
- `deaths*3 + battles*10 + sites_involved*5 + duration_years`
- **Priority**: P2

### REQ-SCR-004: Artifact Importance Score
- `events*10 + unique_holders*20 + lost_or_stolen(30) + named(50)`
- **Priority**: P2

### REQ-SCR-005: NVS for Denizens
- Fortress-level ranking updated per watcher cycle
- **Priority**: P1 (implemented)

### REQ-SCR-006: Rivalry Detection
- Co-appearance counting across events via HF_FIELDS set
- **Priority**: P2

### REQ-SCR-007: Megabeast Detection
- Hardcoded race set: DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN
- **Priority**: P1 (implemented)

### REQ-SCR-008: Supernatural Detection
- Vampire: "VAMPIRE" in active_interactions
- Necromancer: "NECROMANCER" or "RAISE"
- Werebeast: "WEREBEAST"
- **Priority**: P1 (implemented)

### REQ-SCR-009: Entity Importance Score (IDF-Weighted Event Rarity)
- All 10 entity types scored: civilization, sitegovernment, religion, guild, performancetroupe, nomadicgroup, outcast, merchantcompany, militaryunit, migratinggroup
- Formula: `Σ count(event_type) × max(IDF, floor) + Σ count(link_type) × max(IDF, floor) + Σ collection_role × fixed_weight`
- IDF = `log2(N_type / n_entities_with_event)` — computed dynamically per world, no hand-tuning
- Signal sources: event_entity_xref (87K entity records), hf_entity_links (193K records), history_event_collections (11K entity refs)
- Floor weights: military conflict (5.0), political change (4.0), criminal/unusual (4.0), structural creation (2.0), cultural (3.0)
- HF link floors: slave (4.0), criminal (3.0), prisoner (3.0), enemy (1.0)
- Collection fixed weights: war attacker (15), war defender (12), conquest (10/8), beast attack (5)
- Scores normalized per entity type to 0-1000 range for cross-type UI comparability
- Schema: `entities.importance_score FLOAT DEFAULT 0.0` + `idx_entities_importance` DESC index
- Design principle: rare events within an entity type indicate narrative interest — a nomadic group that attacked a site (2.6% of nomadic groups) is more interesting per-event than one that merely recruited members (90.7%)
- **Priority**: P1 (implemented)

---

## 13. Cross-Cutting: Navigation & UX Patterns

### REQ-NAV-001: Cross-Linked Entity References
- Every entity name is a clickable navigable link
- Applied across all views
- **Priority**: P1

### REQ-NAV-002: Perspective-Aware Event Rendering
- Context entity suppressed; relational pronouns used
- **Priority**: P1

### REQ-NAV-003: Hover Popovers
- Ajax-fetched previews on hover for all entity links
- **Priority**: P2

### REQ-NAV-004: Breadcrumb / Prev-Next Navigation
- FABs on detail pages
- URL hash tab persistence
- **Priority**: P2

### REQ-NAV-005: DF Calendar System
- Consistent formatting across all views and narrative
- **Priority**: P1

---

## 14. Non-Functional Requirements

### REQ-NFR-001: Performance -- XML Parsing
- Handle legends.xml files up to 1 GB+ without OOM
- Streaming via iterparse with `root.clear()`

### REQ-NFR-002: Performance -- Explorer Response Time
- < 500ms for paginated data queries
- < 2s for complex JOIN queries (entity detail pages)

### REQ-NFR-003: Performance -- Graph Rendering
- Warning at 500+ nodes, refuse at 1,000+
- Progressive loading for large graphs

### REQ-NFR-004: Security -- SQL Injection Prevention
- Parameterized queries only
- Table/column name whitelist validation
- Keyword blocklist for SQL runner (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE)
- Read-only transactions

### REQ-NFR-005: Security -- Credentials
- No secrets in tracked files
- Credentials in `.claude/secrets/credentials.yaml` (gitignored)

### REQ-NFR-006: Reliability -- Watcher
- Graceful SIGTERM/SIGINT handling
- Bridge health monitoring with consecutive failure counter
- lua_probes retention policy

### REQ-NFR-007: Scalability -- Multi-World Support
- Composite PKs prevent ID collisions
- All queries scoped by world_id
- Currently tested with 3 worlds (combined 1.65M records)

### REQ-NFR-008: Observability -- Storyteller
- Per-interaction logging with latency breakdown
- Monitoring dashboard with auto-refresh
- API endpoints for programmatic access

### REQ-NFR-009: Accessibility -- Search
- Accent-insensitive search via `unaccent` extension
- Case-insensitive by default

### REQ-NFR-010: Compatibility -- DF Version
- Target: DF 53.10 + DFHack 53.10-r1
- UTM Windows 11 ARM VM under Prism emulation

---

## 15. DFHack Reference Guide

### 15.1 Data Access Paths (Lua via dfhack-run)

**Unit Access**:
```lua
df.global.world.units.active              -- all active units
df.global.world.units.all                 -- all units (including dead)
dfhack.units.isCitizen(unit)              -- true for fortress citizens
dfhack.units.isBaby(unit)                 -- true for babies
dfhack.translation.translateName(unit.name)  -- DF-language name
dfhack.units.getReadableName(unit)        -- human-readable name
dfhack.units.getRaceName(unit)            -- race name string
dfhack.units.getAge(unit)                 -- age in years
dfhack.units.isMale(unit)                 -- sex check
unit.hist_figure_id                       -- link to HF record
unit.status.current_soul                  -- soul (personality, skills)
unit.status.current_soul.skills[]         -- skill array (id, rating, experience)
unit.status.current_soul.personality      -- personality (50 facets, values, ethics)
unit.status.current_soul.personality.stress_level  -- stress integer
unit.status.current_soul.personality.emotions[]    -- recent emotions
unit.status.current_soul.personality.needs[]       -- unfulfilled needs
unit.status.current_soul.personality.goals[]       -- life goals
unit.status.current_soul.personality.values[]      -- held values
unit.status.current_soul.personality.ethics[]      -- ethical positions
unit.status.current_soul.personality.mannerisms[]  -- behavioral quirks
unit.status.current_soul.mental_attrs[]   -- mental attributes (12+)
unit.body.physical_attrs[]                -- physical attributes (6)
unit.body.wounds[]                        -- injury data
unit.inventory[]                          -- equipped items
unit.labors[]                             -- labor assignments (read/write)
unit.military.squad_id                    -- military squad assignment
unit.military.squad_position              -- position in squad
unit.relationship_ids.Mother              -- hist_figure_id of mother
unit.relationship_ids.Father              -- hist_figure_id of father
unit.relationship_ids.Spouse              -- hist_figure_id of spouse
unit.flags1.dead                          -- death flag
unit.flags2.killed                        -- killed flag
unit.profession                           -- profession enum
unit.custom_profession                    -- custom profession string
```

**Historical Figure Access**:
```lua
df.global.world.history.figures           -- all HFs
unit.hist_figure_id                       -- HF link from unit
dfhack.translation.translateName(hf.name) -- name translation
dfhack.translation.translateName(name, true)  -- English translation
hf.info.skills.skills[]                   -- skill array
hf.info.skills.points[]                   -- skill XP (parallel to skills)
hf.histfig_links[]                        -- relationship links
hf.entity_links[]                         -- entity membership links
hf.site_links[]                           -- site association links
hf.flags[]                                -- deity, force, ghost flags
hf.info.spheres[]                         -- deity spheres
hf.active_interactions[]                  -- vampire/necro/were interactions
hf.info.kills[]                           -- kill records
hf.info.whereabouts                       -- current location
```

**History Events**:
```lua
df.global.world.history.events            -- all events
df.global.world.history.events_death      -- death events specifically
df.global.world.history.event_collections -- all collections
df.global.world.history.eras              -- historical eras
df.global.world.history.intrigues         -- intrigue data (v0.47+)
```

**Incident / Death Cause**:
```lua
df.global.world.incidents.all             -- all incidents
-- Filter for death incidents:
if incident.type == df.incident_type.Death then
    death.victim     -- unit_id of victim
    death.criminal   -- unit_id of killer
    death.death_cause -- enum death_type (40+ variants)
end
df.death_type[death_cause_enum_value]     -- enum to string
```

**Item Access**:
```lua
df.global.world.items.all                 -- all items
df.item.find(item_id)                     -- find by ID
dfhack.items.getDescription(item, 0)      -- description string
dfhack.items.getValue(item)               -- trade value
dfhack.items.getBookTitle(item)           -- book title (for written works)
item.flags.artifact                       -- artifact flag
item.quality                              -- 0-5 (5=masterwork)
item.maker                                -- hist_figure_id of maker
```

**Announcement / Report Access**:
```lua
df.global.world.status.reports            -- game announcements
reports[#reports - 1].text                -- latest report text
reports[#reports - 1].id                  -- report ID
```

**Game Date**:
```lua
dfhack.world.ReadCurrentDay()             -- current day
dfhack.world.ReadCurrentMonth()           -- current month
dfhack.world.ReadCurrentYear()            -- current year
```

**World Data**:
```lua
df.global.world.world_data                -- world geography data
df.global.world.world_data.sites[]        -- all sites
df.global.world.world_data.region_map     -- 2D region map array
df.global.world.entities.all              -- all entities
df.global.world.artifacts.all             -- all artifacts
```

**Worldgen State Machine**:
```lua
df.global.world.worldgen_status           -- worldgen progress
df.global.world.worldgen_status.state     -- 12-state enum
-- States: None, Terrain, ElevationMap, Rainfall, Drainage, Temperature,
--         Volcanism, SavageryEvilness, Regions, Rivers, Civilizations, Done
df.global.world.worldgen_status.cur_year  -- current generation year
```

**Name Translation**:
```lua
dfhack.translation.translateName(name_obj)        -- DF-language name
dfhack.translation.translateName(name_obj, true)  -- English translation
dfhack.df2utf(string)                             -- CP437 -> UTF-8
```

### 15.2 DFHack eventful Module

```lua
local eventful = require('plugins.eventful')

-- Subscribe to events:
eventful.onUnitDeath[modId] = function(unit_id) ... end
eventful.onItemCreated[modId] = function(item_id) ... end
eventful.onJobCompleted[modId] = function(job) ... end
eventful.onInvasion[modId] = function() ... end

-- Enable events with tick interval:
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 0)
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 0)

-- Register periodic callback:
dfhack.timeout(500, 'ticks', function() ... end)  -- fire every 500 ticks
```

### 15.3 DFHack Repeat Job Pattern

```lua
-- The bridge uses this pattern:
local repeatUtil = require('repeat-util')
repeatUtil.scheduleEvery('chronicler-bridge', 100, 'ticks', function()
    -- Generate JSON and write to file
    local json = generate_bridge_data()
    local f = io.open(output_path, 'w')
    f:write(json)
    f:close()
end)
```

### 15.4 DFHack State Change Hook

```lua
dfhack.onStateChange.my_monitor = function(code)
    if code == SC_MAP_LOADED then
        -- World loaded, start monitoring
    elseif code == SC_MAP_UNLOADED then
        -- World unloaded, stop monitoring
    end
end
```

### 15.5 RemoteFortressReader (41 Functions)

RFR is loaded (41 functions registered) but ALL game-thread calls hang under Prism ARM emulation. Only cached calls work:
- `GetVersion` -- DFHack version info
- `GetWorldInfo` -- world name, current year

All other calls (GetUnitList, GetMapInfo, etc.) require CoreSuspender which is broken under Prism.

### 15.6 Key DFHack Gotchas

- **TCP RPC broken**: Game-thread calls hang on DFHack 53.x under Prism. Use `dfhack-run` over SSH.
- **dfhack-run transport**: Executes Lua on Core thread directly, bypassing TCP dispatch.
- **pcall safety**: Always wrap data access in `pcall` -- any section failure should not break others.
- **CP437 encoding**: All DF text is CP437; use `dfhack.df2utf()` for conversion.
- **nil checks**: Always nil-check `current_soul`, `personality`, `world_data` before access.
- **Diplomacy path**: `entity.resources.diplomacy.state` (NOT `world.diplomacy` which does not exist).

---

## 16. Technology Stack

| Component | Technology | Version/Notes |
|-----------|-----------|---------------|
| Backend | Python + FastAPI | 3.12.12, managed by uv |
| Frontend | Jinja2 templates + vanilla JS + Tailwind CSS | Single-page explorer.html |
| Database | PostgreSQL 16 | ParadeDB distribution |
| Extensions | pgvector, unaccent | 2560-dim embeddings |
| Graph Viz | vis.js | forceAtlas2Based physics |
| Map | Leaflet.js 1.9.4 | L.CRS.Simple |
| Charts | Chart.js / D3.js | Population, events, wars |
| Family Tree | Cytoscape.js 3.31.0 + dagre | Hierarchical DAG |
| Warfare Graph | Cytoscape.js + cola | Force-directed |
| LLM (dev) | Qwen3-8B via Ollama/LiteLLM | Local inference |
| LLM (prod) | Claude API | Production quality |
| Embeddings | Qwen3-Embedding-4B via MLX | 2560-dim, localhost:8000 |
| Vector Store | Qdrant + pgvector | Semantic search |
| Streaming | SSE via sse_starlette | Token-by-token |
| XML Parsing | lxml | iterparse streaming |
| Game Interface | DFHack 53.10-r1 | Lua via dfhack-run SSH |
| VM | UTM (Windows 11 ARM) | Prism emulation |
| Test Framework | pytest | 131 tests, 0.19s |

---

## 17. Current State (v0.8)

### Built and Working
- CDM PostgreSQL schema (35 tables, composite PKs, 1.65M records)
- Legends XML parser (733 lines, lxml iterparse, 8/14+ sections)
- Live bridge (v6, 922 lines, 7 data domains, HTTP port 8889)
- Watcher daemon (`chronicler watch`, change detection, graceful shutdown)
- Explorer UI (6 tabs: People, Civilizations, Geography, Schema, Data, Graph)
- Storyteller (23 routes, SSE streaming, dual-tier context, keyword mode)
- SQL Runner (read-only safety measures)
- FK link navigation, JSONB expansion
- Graph tab (vis.js ego network, partially built)
- Importance scoring (df-narrator formulas)
- Person view (Unit+HF merge, 6 rules)
- Fortress denizens (NVS ranking)
- VM infrastructure (19-command wrapper, HTTP/SCP transfer)
- 131-test suite

### Not Yet Started
- Interactive world map (Leaflet.js)
- Agentic SQL storyteller
- Event narrative templates (132 types)
- Death cause rendering (50+ variants)
- Entity detail pages (HF 24-section, Entity 5-tab, etc.)
- Knowledge Horizon
- Worldgen monitoring
- Labor Manager
- Mod Manager
- AI Fortress Advisor
- Family tree / warfare graphs
- Chart visualizations

---

*Chronicler Product Requirement Document v1.0 -- 2026-02-25*
*Total requirements: ~200+ across 9 subsystems*
*Priority levels: P1 (critical/v1.0), P2 (high-value), P3 (important), P4 (stretch/future)*
