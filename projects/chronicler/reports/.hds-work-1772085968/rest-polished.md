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

Feature inventory summary with size-categorized counts per component (S=days, M=1-2 weeks, L=2-4 weeks, XL=1+ months):

| Component | S | M | L | XL | Total |
|-----------|---|---|---|----|-------|
| World History Visualizer | 7 | 8 | 6 | 3 | ~30 |
| Database Explorer | 9 | 11 | 5 | 2 | ~40 |
| AI Storyteller | 12 | 15 | 7 | 5 | ~62 |
| AI Fortress Player | 14 | 18 | 10 | 2 | ~50 |
| Mod Manager | 6 | 12 | 10 | 6 | ~44 |
| Labor Manager | 8 | 12 | 8 | 3 | ~35 |
| CDM & Database | varies | | | | ~30 |
| Data ETL | varies | | | | ~20 |

Grand total: ~260+ discrete features across all components.

Bridge data flow architecture: DF Game (running) -> chronicler-bridge.lua (repeat job, 100 ticks) -> JSON file on disk -> HTTP server (port 8889) -> Python watcher (chronicler watch) -> Change detector (snapshot comparison) -> PostgreSQL CDM -> Storyteller / Explorer / API.

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

Additional site marker taxonomy: Pentagon (blue): MysteriousDungeon; Hexagon (blue): MysteriousPalace. These are not in REQ-VIS-003, which lists Pentagon (Fortress, ForestRetreat, Town, DarkPits) and Hexagon large (MountainHalls, Castle, DarkFortress) without distinguishing the blue mysterious variants.

Worldgen monitoring is a novel capability confirmed by reviewing all 17 reference repositories: no existing tool monitors world generation in real-time.

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

weblegends-style BFS static site generation is a stretch goal for data export (beyond CSV/JSON export listed in REQ-EXP-025/026).

Worship strength thresholds (numerical values for REQ-EXP-011 HF detail page): dubious <10, casual <25, average <75, faithful <90, ardent >=90.

Noble position categories with badge colors: Noble=amber badge, Military=red badge, Administrator=blue badge, Other=stone badge. (Confirming REQ-EXP-012 listing -- presented here as standalone reference taxonomy.)

JSONB field inventory uses `jsonb_object_keys()` sampling technique. Table row counts are obtained from `pg_stat_user_tables`. Column/type/PK/FK/index detail is obtained from `information_schema`.

The complete entity detail page routing follows LegendsViewer-Next's 70-route pattern (35 list pages + 35 detail pages) as the architectural model for the full routing system.

HF node visual class styling for family tree and graph visualizations: current=dashed orange border, dead=30% opacity, male=blue background, female=magenta background, leader=round-octagon with crown icon, necromancer=round-hexagon with skull icon, vampire=hexagon with vampire icon, werebeast=hexagon with wolf icon, ghost=hexagon with ghost icon.

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

The 132 event types covered by the template system (REQ-STR-016) are decomposed into these groups with full categorical taxonomy: 15 HF lifecycle types (died, revived, wounded, abducted, enslaved, freed, ransomed); 10 relationship types (add/remove HF/entity/site links); 12 HF action types (attacked_site, destroyed_site, confronted, does_interaction, preach); 10 HF intrigue types (convicted, interrogated, formed_intrigue, failed_frame, sabotage); 13 artifact types (created, destroyed, lost, found, given, possessed, recovered, stored, transformed, copied, claim_formed); 18 site/construction types (created_site, destroyed_site, site_taken_over, reclaim_site, created_structure, razed_structure); 14 entity types (entity_created, dissolved, incorporated, overthrown, law, persecuted, alliance_formed); 8 war/combat types (field_battle, squad_vs_squad, tactical_situation, attacked_site, plundered_site); 10 diplomacy types (peace_accepted/rejected, agreement_formed/concluded/rejected, trade, first_contact); 7 culture/art types (poetic/musical/dance_form_created, written_content_composed, knowledge_discovered); 8 masterpiece types (arch_construct, item, dye, item_improvement, food, engraving, lost); 5 occasion types (ceremony, competition, performance, procession, gamble); 14 misc types (creature_devoured, body_abused, merchant, sneak_into_site, spotted_leaving, insurrection). Total: 144 types in df-structures (authoritative); 132 fully handled by LB2; 12 gap types are DF 0.47+ additions needing graceful fallback.

The agentic storyteller system prompt (REQ-STR-007) will include an annotated schema summary of approximately 2,000 tokens covering 40+ table definitions. Evidence citations should be included in LLM responses as an explicit hallucination mitigation strategy, in addition to confidence signaling and read-only SQL (`SET TRANSACTION READ ONLY`). The denizen summary provides top-N fortress inhabitants ranked by NVS score for context selection.

Event collection types enumerated by category: Warfare (battle, war, duel, raid, site_conquered); Political (insurrection, persecution, purge, entity_overthrown); Calamities (beast_attack, abduction, theft); Rituals (occasion, procession, ceremony, performance, competition); Travel (journey). Total: 19 types.

AI Storyteller pipeline step sequence: extract_keywords -> categorical routing (23 routes) -> name-based ILIKE search -> world overview fallback -> format_context (12,000 character budget) -> build_messages -> stream_completion -> SSE response.

Storyteller 23 categorical routes enumerated: hf_flag (deity/vampire/necromancer/werebeast/ghost), hf_race (megabeast/dragon/titan/forgotten), entity_type (civilization/religion), collection_type (war/battle), artifacts, written_contents, live_units, live_squads, live_armies, live_events, live_reports.

LLM configuration: Primary Model = Qwen3-8B via LiteLLM (dev), Claude API (production); Temperature = 0.8 (configurable); Max Tokens = 2048 (configurable); Streaming = SSE via sse_starlette; Embedding = qwen3-embedding:4b via MLX (2560-dim, localhost:8000).

Death cause narrative rendering complete list (50+ variants from weblegends): OLD_AGE -> 'died of old age', SHOT -> 'was shot and killed', BLEED -> 'bled to death', DROWN -> 'drowned', SUFFOCATE -> 'suffocated', MAGMA -> 'was consumed by magma', DRAGONFIRE -> 'was killed by dragonfire', CAVEIN -> 'was crushed in a cave-in', DRAWBRIDGE -> 'was smashed by a drawbridge', BEHEAD -> 'was beheaded', CRUCIFY -> 'was crucified', BURN_ALIVE -> 'was burned to a crisp', HACK_TO_PIECES -> 'was hacked to pieces', DRAIN_BLOOD -> 'was drained of blood', LEAPT_FROM_HEIGHT -> 'leapt from a great height', INFECTION -> 'succumbed to infection', plus 25+ more each including weapon info, slayer identity with race, age at death. Source: weblegends 94 event handler files.

Circumstance/Reason rendering enum types -- 'Circumstance' types: Death, Prayer, DreamAbout, Nightmare, FromAfar. 'Reason' types: glorify_hf, artifact_is_heirloom, as_a_symbol_of_everlasting_peace (note prefix 'as_a_' -- REQ-STR-018 incorrectly lists as 'symbol_of_everlasting_peace'). 'Death' is a Circumstance type omitted from REQ-STR-018.

Architectural pattern -- Event Rendering Pipeline: all successful legends browsers implement: Event (typed struct) -> Context (current entity perspective) -> Template (per-type prose) -> HTML (with entity links). For Chronicler with LLM: Event (CDM row) -> Context (target entity + related entities) -> LLM prompt (with event type template) -> Narrative (with entity references marked for linking).

Persona-driven narrative voice: each dwarf speaks with personality-consistent voice derived from mapping 50 personality traits + beliefs + goals + needs to narrative personality dimensions, then deriving a voice description and injecting as a character voice prompt. This extends REQ-STR-010 which only mentions '50 personality traits.'

Civilization narrative arc event sequence for rise-and-fall narratives: entity_created -> site_taken_over -> alliance_formed -> overthrown -> dissolved. This ordered event sequence pattern is the implementation basis for REQ-STR-015.

Proactive Narrative Engine (post-v1.0): watch for high-NVS events, generate narrative alerts via WebSocket (explicitly WebSocket, not SSE, as the delivery mechanism for proactive push). Architectural context: this is the 'proactive path' of the Template vs. LLM Hybrid framework.

Interaction text for vampire biting and necromantic raising uses game raws fields `hist_string_1` and `hist_string_2`. weblegends implements 94 event handler files for this type of content.

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

Furniture types (28) canonical list: archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well.

Material categories from myDFHackScripts (used in farm management and metalworking): Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature.

The AI Fortress Advisor LLM receives the stock threshold model as explicit context (not just fortress state) and military heuristics as LLM prompt advisories. Agentic SQL is also used for fortress analysis (not just storytelling).

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

---

Data entity coverage comparison matrix showing coverage level per entity type across all reference tools:

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | Chronicler |
|-------------|---------|-----|------------|-------------|------------|
| Historical Figures | Full | Full | Full | Scored subset | Full |
| Sites | Full | Full | Full | Scored subset | Full |
| Entities | Full | Full | Full | Name only | Full |
| Artifacts | Full | Full | Full | Scored subset | Full |
| Regions | Full | Full | Full | No | Full |
| Underground Regions | Full | Full | Full | No | Partial |
| Structures | Full | Full | Full | No | Full |
| World Constructions | Full | Full | Partial | No | MISSING |
| Written Content | Full | Full | Partial | No | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | MISSING |
| Identities | Full | Full | No | No | MISSING |
| Landmasses | Full | Full | No | No | Partial |
| Mountain Peaks | Full | Full | No | No | Partial |
| Rivers | Full | Stub | No | No | MISSING |
| Entity Populations | Full | Stub | Partial | No | Partial |
| Event Collections | Full | Full | Full | Partial | Partial |

HF field completeness audit -- missing HIGH PRIORITY fields: active_interactions (vampire/necromancer/werebeast interaction detection), spheres (deity domains), goals (life goals with accomplishment status), skills with XP points from info.skills, entity_links with link type and position details (expanded), histfig_links (mother/father/child/spouse -- family), site_links (lair, home, seat_of_power), kills (notable and other kill records), whereabouts/current_state (geographic location), vague_relationships and relationship_profiles, entity_reputations (murderer, hero, monster, poet, bard, etc.), intrigue_actors/intrigue_plots (v0.47+ intrigue system), used_identities/current_identity (false identity tracking), journey_pets, holds_artifact (currently held artifacts), breed_id/cultural_identity/family_head_id.

Missing MEDIUM PRIORITY: orientation_flags, curse_year/curse_seconds, personality (values, ethics, mannerisms -- 70+ mannerism types), knowledge_profile (known secrets, books, belief systems), reputation_profile (wanted status, journey profile).

Site type taxonomy (24 types) complete enumeration: Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress, Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery, Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace, Ruins, Shrine, Tomb, Tower, Town, Vault. Note: Mysterious Lair is in this list but not in REQ-VIS-003 site marker shapes.

Entity type taxonomy complete enumeration: Civilization, Site Government, Nomadic Group, Migrating Group, Religion, Military Unit (mercenary/shadowy/versatile), Guild, Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang, Outcast, Semi-Megabeast, Mega-Beast, Unknown.

Biome types (10) canonical list: Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains.

Structure types (12+) canonical list: mead_hall, keep, temple, dark_tower, market, tomb, dungeon/sewers/catacombs, underworld_spire, tavern, library, counting_house, guildhall, tower.

HF relationship types complete enumeration.

HF-to-HF: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner.

HF-to-Entity: Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position, Former Position, Position Claim, Occupation, Former Occupation, Squad, Former Squad.

HF-to-Site: Lair, Home Site (abstract/realization building), Seat of Power, Hangout, Occupation, Prison.

## 10. FS-2: Data ETL Systems

### REQ-ETL-001: Legends XML Parser (Streaming)
- `lxml.etree.iterparse` with `root.clear()`
- Handle files up to 1 GB+
- **Priority**: P1 (built)

### REQ-ETL-002: Dual-File Merge (legends.xml + legends_plus.xml)
- Parse legends.xml first, legends_plus.xml second
- Match by id fields
- **Priority**: P1 (built)

### REQ-ETL-003: Parse All 14+ XML Sections
- Currently 8/14+: sites, artifacts, regions, underground_regions, HFs, entities, events, event_collections, written_contents, eras
- Missing: world_constructions, art_forms (3), identities, rivers, mountain_peaks (full), landmasses (full)
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

XML approach comparison table across reference tools:

| Tool | Parser | Mode | Notes |
|------|--------|------|-------|
| Chronicler | lxml.etree.iterparse + root.clear() | Streaming, constant memory | |
| LegendsBrowser (Java) | SAX XMLReader + annotation handler | Streaming, constant memory | |
| LegendsBrowser2 (Go) | Custom hand-written tokenizer (NOT encoding/xml) | Streaming, buffered I/O | Chose custom for performance |
| LegendsViewer-Next (.NET) | Async XML with FilteredStream | Streaming, filtered | |
| DwarvenSurveyor (C#) | XmlReader streaming | Streaming | |
| df-narrator (Python) | xml.etree.ElementTree full-tree parse | Full-tree, then freed | |

Note: LB2 explicitly chose NOT to use encoding/xml for performance reasons.

Dual-file merge specifics: legends_plus.xml provides the following additional data NOT in legends.xml: per-tile coordinate arrays, evilness ratings, cur_owner_id, entity positions/assignments/honors, relationship profiles, vampire/werebeast/necromancer 'since' years, written content references, entity occasion schedules.

Live bridge data domains (9 domains, not 7 as previously stated): (1) Game time (year, tick, season); (2) Creature raws (934 creature types); (3) Unit summary (22 fortress dwarves with names, stress, focus, longterm_stress, combat_hardened, squad, position); (4) Armies (142+ armies with positions, member counts, controller IDs); (5) Buildings (205+ buildings by 16 building types); (6) Artifacts (named artifacts with DF-language and English translations); (7) Announcements (last 20 game reports); (8) Diplomacy (player civ relations via entity.resources.diplomacy.state -- already implemented in bridge, noted in Section 15.6 gotchas); (9) History (figure count, event count, last 50 events with type/year). Implementation: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` (922 lines, v6).

Post-parse processing pipeline source attribution: the 10-step pipeline is adapted from LB2's `world.process()` Go method. All reference legends browsers (LB2 world.process(), LV-Next post-parse) run a cross-referencing pass after XML loading -- this is non-optional.

Architectural pattern -- Generic Watcher Factory Pattern from myDFHackScripts: `Helper.watch()` closure returns a function that compares current state to saved state. On change, logs event and updates saved state. Configurable comparison function. This is the pattern for Chronicler's 11 change event types (REQ-ETL-013).

DFHack RAG index collection sizes: dfhack collection=8,476 points; dwarf-therapist collection=926 points; df-wiki collection=4 points (target: 21K-27K via wiki crawl). Embedding model: Qwen3-Embedding-4B via MLX at localhost:8000, 2560-dim. pgvector tables in PostgreSQL planned for in-database semantic search.

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

---

HF_FIELDS canonical set -- XML event fields that reference historical figure IDs (used for rivalry detection co-appearance counting): hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid, changee_hfid, changer_hfid, woundee_hfid, wounder_hfid, doer_hfid, target_hfid, attacker_hfid, defender_hfid, hist_fig_id, body_hfid, hfid_target, hfid_attacker, hfid_defender, trickster_hfid, cover_hfid, student_hfid, teacher_hfid, trainer_hfid, seeker_hfid. Total: 25 field names.

NVS (Narrative Value Score) computation factors for denizens: event count, kills, relationships, positions, artifacts, type flags. Enables O(1) sort for LLM context selection.

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

The hover popovers system (REQ-NAV-003 / REQ-VIS-011) will be implemented using Bootstrap or Tippy.js for the Ajax-fetched popover mechanism.

DF Calendar System Python implementation: `day_of_year = seconds72 // 1200 + 1`; `month = min((day_of_year - 1) // 28 + 1, 12)`; `day = (day_of_year - 1) % 28 + 1`. Month names: Granite, Slate, Felsite (Spring), Hematite, Malachite, Galena (Summer), Limestone, Sandstone, Timber (Autumn), Moonstone, Opal, Obsidian (Winter). Season lookup by month index. Note: `min()` guard on month calculation is required.

Cross-linking implementation comparison table across reference tools:

| Tool | Implementation | Context Awareness | Hover Preview |
|------|----------------|------------------|---------------|
| LV-Next | Server-side HTML `<a>` tags | No context | No |
| LB2 | Go template `{{ hf .Id }}` with HfId context | HfId context awareness | Bootstrap popover Ajax with perspective-aware relational pronouns |
| weblegends | C++ `link()` function with event_context | event_context awareness, suppress self-links | No |

Perspective-aware detail from LB2: when viewing HF #123, events mentioning HF #123 render as 'the dwarf' or relational pronouns ('his wife'). This is the LB2 Context.HfId pattern. weblegends implements same via `event_link()` -- suppress link for context entity.

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

The df-structures repository (XML, ~50,000 lines) provides the canonical memory layout, 144 event types (authoritative count), and all entity field definitions. It is the authoritative basis for all Chronicler field and event type reference data.

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
*Total requirements: ~200+ across 8 subsystems*
*Priority levels: P1 (critical/v1.0), P2 (high-value), P3 (important), P4 (stretch/future)*

Implementation status table (detailed, with file paths):

- XML legends ingestion: Built, 8/14+ sections, 733-line parser at `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
- XML+ merge legends_plus: Built, dual-file merge
- Live polling bridge: Built, v6, 922 lines at `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`, 9 data domains, 16 sections (note: 9 domains, not 7)
- dfhack-run SSH transport: Verified, all data domains accessible
- Change detection: Built, snapshot comparison, 11 event types
- PostgreSQL persistence: Built, 1.65M records, 40+ tables
- 131-test suite: Built
- CLI interface: Built, chronicler watch + chronicler ingest
- Schema browser: Built
- Data browser: Built
- SQL Runner: Built
- FK link navigation: Built
- Graph tab: Partially built, vis.js ego network, search, 1-3 hop depth
- Storyteller: Built, 23 routes, SSE streaming, keyword mode
- Storyteller monitoring: Built, logging, dashboard, 3 API endpoints
- Importance scoring: Implemented, df-narrator formulas
- Person view Unit+HF merge: Implemented, 6-rule merge
- Confidence signaling: Implemented
- Fortress denizens: Implemented, NVS ranking
- VM scripts: Built, vm-config/lifecycle/bootstrap, 19 commands
- File transfer: Built, HTTP 105 MB/s / SCP 19 MB/s / Guest Agent fallback
- Bridge deployment: Built, SMB + SSH deployment scripts

World 'Tar Thran' data scale: 48,366 historical figures, 442,716 events, 4,901 entities, 8,035 artifacts, 2,154 sites.

Gap analysis / planned features table with priorities:

- Agentic SQL storyteller (P1, 'Schema summary + SQL tool definition needed')
- Interactive world map (P1, 'Centerpiece visualization feature')
- Event narrative templates 132 types (P1, 'High-value narrative enrichment')
- Death cause rendering 50+ variants (P1, 'Critical for narrative quality')
- Perspective-aware rendering (P1)
- Missing CDM entity types WorldConstructions/ArtForms/Identities/Rivers (P1, 'Schema completeness')
- HF field extensions skills/kills/family/interactions/whereabouts (P1, 'Data completeness')
- Entity detail pages 24-section HF/5-tab Entity (P1, 'Explorer completeness')
- Global search with autocomplete (P2, 'Primary navigation mechanism')
- Family tree visualization (P2, 'Compelling genealogy feature')
- Population/event charts (P2, 'Demographic visualization')
- Hover popovers (P2, 'Exploration UX')
- Knowledge Horizon (P2, 'Immersive storyteller feature')
- Worldgen monitoring (P2, 'Novel capability')
- eventful subscriptions in bridge (P2, 'Reactive event capture')
- Death cause enrichment in bridge (P2, 'Narrative quality improvement')
- Labor manager grid+skills (P3)
- Mod manager core (P3)
- AI Fortress Advisor (P3)
- War chord diagram/warfare graph (P3)
- Raw compiler (P4)
- Labor optimization engine (P4)

Consolidated action items -- Tier 1 (Critical, Blocks Narrative Engine and Explorer):

1. Add all 144 event types to CDM taxonomy [M, df-structures]
2. Extend HF CDM with missing high-priority fields (flags, interactions, skills, links, kills, whereabouts) [L, All legends browsers]
3. Add importance scoring columns and compute on ingestion [S, df-narrator]
4. Implement death cause narrative rendering (50+ causes) [M, weblegends]
5. Implement perspective-aware event narrative generation [M, LB2/weblegends]
6. Add cross-linking infrastructure [M, All legends browsers]
7. Implement DF calendar utility (seconds72 to date/month/season) [S, df-narrator/weblegends]
8. Build agentic SQL storyteller (schema summary + SQL tool) [L, Chronicler original]
9. Parse remaining XML sections (world_constructions, art_forms, identities, rivers) [M, All legends browsers]
10. Build post-parse processing pipeline (10 cross-referencing steps) [L, LB2/LV-Next]

Consolidated action items -- Tier 2 (High Value, Visualization and Data Completeness):

11. Interactive world map with Leaflet.js [L, LV-Next/LB2]
12. Family tree visualization Cytoscape.js dagre [M, LV-Next/LB1]
13. Event timeline charts Chart.js line/bar [M, LV-Next]
14. Population distribution charts [S, LV-Next/LB1]
15. Hover popovers for entity preview [M, LB2]
16. Global search with autocomplete [M, LB2]
17. Entity detail pages HF 24-section/Entity 5-tab/Site/Artifact etc. [XL, All browsers]
18. Knowledge Horizon Phase 1-2 (denizen + view-based masking) [L, Chronicler original]

Consolidated action items -- Tier 3 (Bridge & Live Data Enhancements):

19. Add eventful subscriptions UNIT_DEATH/ITEM_CREATED/UNIT_NEW_ACTIVE/SYNDROME [S, myDFHackScripts]
20. Death cause resolution via df.global.world.incidents.all [S, myDFHackScripts]
21. Parent/family chain extraction unit.relationship_ids.Mother/Father [S, myDFHackScripts]
22. Book/written work detection dfhack.items.getBookTitle [S, myDFHackScripts]
23. Create worldgen-bridge.lua for real-time worldgen monitoring [M, worldgen-scraping]
24. Add worldgen_snapshots CDM table [S, worldgen-scraping]
25. Add personality/soul data to bridge (50 facets, beliefs, goals, needs) [M, df-structures]
26. Add skill progression tracking per unit [M, myDFHackScripts]

Consolidated action items -- Tier 4 (Stretch / Advanced Features):

27. Curse lineage tree vampire/werebeast 'who bit whom' [M, LB1]
28. Warfare graph Cytoscape.js cola force-directed [M, LV-Next]
29. War chord diagram D3.js [M, LB1]
30. Mod manager core discovery/profiles/conflict detection [L, ModHearth/DF-Modloader]
31. Labor manager core grid/skills/personality [XL, Dwarf Therapist patterns]
32. AI Fortress Advisor population/military/resources [XL, df-ai]
33. Stock threshold model as LLM advisor context [M, df-ai]
34. Raw file parser for mod conflict detection [L, DF-Modloader]
35. Full raw compiler pipeline [XL, DF-Modloader]
36. Labor optimization engine constraint satisfaction [XL, Chronicler original]
37. Mod awareness record active mods per world [S, Chronicler original]
38. Timeline scrubber historical map state [L, Chronicler original]
39. Civilization territory overlays [L, Chronicler original]
40. Worldgen live map preview [XL, Chronicler original]

Effort key: S=days, M=1-2 weeks, L=2-4 weeks, XL=1+ months
