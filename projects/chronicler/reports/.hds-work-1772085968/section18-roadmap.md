## 18. Development Roadmap

### 18.1 Phase Overview

The Chronicler project is organized into 7 development phases, progressing from foundational data completeness through full application maturity. Each phase builds on the prior phase's deliverables. Within each phase, work is organized into stages that can be executed in parallel where dependencies allow.

Phase 1: Data Foundation (CDM completeness, XML parser, post-parse pipeline)
Phase 2: Explorer Core (entity detail pages, search, navigation, cross-linking)
Phase 3: Narrative Engine (event templates, death causes, agentic storyteller)
Phase 4: Visualization (world map, charts, family trees, graphs)
Phase 5: Live Integration (bridge enhancements, worldgen, Knowledge Horizon)
Phase 6: Advanced Components (Mod Manager, Labor Manager, AI Advisor)
Phase 7: Polish & Production (performance, testing, packaging, deployment)

Phase Dependencies (explicit predecessor/successor chain):
Phase 1 --> Phase 2 (explorer needs complete data)
Phase 1 --> Phase 3 (narrative needs complete events)
Phase 2 --> Phase 4 (visualizations sit on explorer pages)
Phase 3 --> Phase 5 (KH integrates with storyteller)
Phase 2, Phase 3 --> Phase 6 (advanced components need explorer + narrative)
All --> Phase 7 (polish is last)

### 18.2 Phase Details

#### Phase 1: Data Foundation

Goal: Complete the CDM schema, XML parser, and post-parse processing so all DF data is available in PostgreSQL with full cross-referencing.
Entry State: v0.8 -- 35 tables, 8/14+ XML sections parsed, 1.65M records
Exit State: 40+ tables, all 14+ XML sections parsed, post-parse pipeline running, all entity types and fields complete

**Stage 1.1: CDM Schema Extensions** (Duration: 1 week)
Task 1.1.1 (CDM-006): Add `world_constructions` table (world_id, id, name, type, coords) -- Deliverable: SQL migration + model
Task 1.1.2 (CDM-006): Add `art_forms` table (world_id, id, name, type [dance/musical/poetic], details JSONB) -- Deliverable: SQL migration + model
Task 1.1.3 (CDM-006): Add `identities` table (world_id, id, name, race, caste, details JSONB) -- Deliverable: SQL migration + model
Task 1.1.4 (CDM-006): Add `rivers` table (world_id, id, name, coords, details JSONB) -- Deliverable: SQL migration + model
Task 1.1.5 (CDM-006): Complete `landmasses` and `mountain_peaks` tables (add missing fields) -- Deliverable: SQL migration
Task 1.1.6 (CDM-007): Extend `historical_figures` with high-priority fields (spheres, goals, skills, kills, whereabouts, entity_reputations, intrigue_actors, used_identities, journey_pets, holds_artifact) -- Deliverable: SQL migration
Task 1.1.7 (CDM-007): Add `active_interactions` JSONB field to HFs for vampire/necromancer/were detection -- Deliverable: SQL migration
Task 1.1.8 (CDM-010): Add `worldgen_snapshots` table -- Deliverable: SQL migration
Task 1.1.9 (CDM-011): Add `world_modpacks` table -- Deliverable: SQL migration

**Stage 1.2: XML Parser Completion** (Duration: 1-2 weeks)
Task 1.2.1 (ETL-003): Parse `<world_constructions>` section (roads, tunnels, bridges) -- Deliverable: Parser extension
Task 1.2.2 (ETL-003): Parse `<dance_forms>`, `<musical_forms>`, `<poetic_forms>` sections -- Deliverable: Parser extension
Task 1.2.3 (ETL-003): Parse `<identities>` section -- Deliverable: Parser extension
Task 1.2.4 (ETL-003): Parse `<rivers>` section -- Deliverable: Parser extension
Task 1.2.5 (ETL-003): Complete `<mountain_peaks>` and `<landmasses>` parsing -- Deliverable: Parser extension
Task 1.2.6 (ETL-003): Parse expanded HF fields from legends_plus.xml (skills, kills, whereabouts, entity_reputations, active_interactions, etc.) -- Deliverable: Parser extension
Task 1.2.7 (ETL-003): Parse `<entity_populations>` section fully -- Deliverable: Parser extension
Task 1.2.8 (ETL-002): Audit dual-file merge rules against LV-Next/LB2 merge strategies -- Deliverable: Verification report

**Stage 1.3: Post-Parse Processing Pipeline** (Duration: 1-2 weeks)
Task 1.3.1 (ETL-004): Step 1: Resolve HF-to-HF family links (mother/father/child/spouse from hf_links) -- Deliverable: Processing step
Task 1.3.2 (ETL-004): Step 2: Resolve HF-to-entity position assignments -- Deliverable: Processing step
Task 1.3.3 (ETL-004): Step 3: Derive vampire/werebeast/necromancer flags from interaction events -- Deliverable: Processing step
Task 1.3.4 (ETL-004): Step 4: Compute site ruin status from destruction/reclaim events -- Deliverable: Processing step
Task 1.3.5 (ETL-004): Step 5: Build entity war lists from event collections -- Deliverable: Processing step
Task 1.3.6 (ETL-004): Step 6: Compute HF kill lists from death events -- Deliverable: Processing step
Task 1.3.7 (ETL-004): Step 7: Calculate importance scores (df-narrator formulas) -- Deliverable: Processing step
Task 1.3.8 (ETL-004): Step 8: Build event-to-entity cross-reference index -- Deliverable: Processing step
Task 1.3.9 (ETL-004): Step 9: Resolve site ownership history from events -- Deliverable: Processing step
Task 1.3.10 (ETL-004): Step 10: Validate referential integrity (all FK refs resolve) -- Deliverable: Processing step + tests

**Stage 1.4: Test Suite Extension** (Duration: 0.5 weeks, parallel with 1.2-1.3)
Task 1.4.1: Add tests for all new XML sections -- Deliverable: pytest additions
Task 1.4.2: Add tests for post-parse processing steps -- Deliverable: pytest additions
Task 1.4.3: Add tests for new CDM tables and constraints -- Deliverable: pytest additions
Task 1.4.4: Re-ingest all worlds and verify record counts -- Deliverable: Verification
Note: Stage 1.4 can run in parallel with Stages 1.2 and 1.3.

---

#### Phase 2: Explorer Core

Goal: Build comprehensive entity detail pages, global search, cross-linking, and navigation so users can browse all world data.
Entry State: 6 tabs (People, Civilizations, Geography, Schema, Data, Graph), basic data grid
Exit State: Full entity detail pages for all types, global search, perspective-aware cross-linking, hover popovers

**Stage 2.1: Entity Detail Page Framework** (Duration: 1 week)
Task 2.1.1 (EXP-011-019): Design generic detail page template (header, cards, events, mini-map placeholder) -- Deliverable: Template system
Task 2.1.2 (EXP-027): Implement cross-linking infrastructure (entity references -> navigable links) -- Deliverable: Link renderer
Task 2.1.3 (EXP-028): Implement perspective-aware rendering (context entity suppression, relational pronouns) -- Deliverable: Event renderer
Task 2.1.4 (NAV-005): Implement DF calendar utility (seconds72 -> date/month/season) -- Deliverable: Shared utility

**Stage 2.2: Primary Entity Detail Pages** (Duration: 2-3 weeks)
Task 2.2.1 (EXP-011): Historical Figure detail page (24 sections) -- Deliverable: API + template
Task 2.2.2 (EXP-012): Entity (Civilization) detail page (5 tabs: Leaders, Sites, Members, Groups, Wars) -- Deliverable: API + template
Task 2.2.3 (EXP-013): Site detail page (3 tabs: Structures, Properties, History) -- Deliverable: API + template
Task 2.2.4 (EXP-014): Artifact detail page (chain-of-custody timeline) -- Deliverable: API + template
Task 2.2.5 (EXP-015): Region detail page (biome, evilness, sites) -- Deliverable: API + template
Task 2.2.6 (EXP-016): Structure detail page -- Deliverable: API + template
Task 2.2.7 (EXP-017): Written Content detail page -- Deliverable: API + template
Task 2.2.8 (EXP-018): Event Collection detail page (19 types, drill-down hierarchy) -- Deliverable: API + template

**Stage 2.3: Secondary Entity Detail Pages** (Duration: 1 week)
Task 2.3.1 (EXP-019): Underground Region detail page -- Deliverable: API + template
Task 2.3.2 (EXP-019): Landmass detail page -- Deliverable: API + template
Task 2.3.3 (EXP-019): Mountain Peak detail page -- Deliverable: API + template
Task 2.3.4 (EXP-019): River detail page -- Deliverable: API + template
Task 2.3.5 (EXP-019): World Construction detail page -- Deliverable: API + template
Task 2.3.6 (EXP-019): Art Form detail pages (3 types) -- Deliverable: API + template
Task 2.3.7 (EXP-019): Identity detail page -- Deliverable: API + template
Task 2.3.8 (EXP-019): Historical Era detail page -- Deliverable: API + template
Task 2.3.9 (VIS-022): Years and Events browser (chronological index) -- Deliverable: API + template

**Stage 2.4: Search and Navigation** (Duration: 1 week)
Task 2.4.1 (EXP-021): Global search with live autocomplete (debounced, categorized results) -- Deliverable: API + UI component
Task 2.4.2 (EXP-022): HF filtering by type flags (deity, vampire, etc.) -- Deliverable: Filter UI
Task 2.4.3 (NAV-003): Hover popovers for entity preview (Ajax-fetched, Bootstrap/Tippy.js) -- Deliverable: Popover system
Task 2.4.4 (NAV-004): Breadcrumb / prev-next navigation (FABs on detail pages) -- Deliverable: Navigation UI
Task 2.4.5 (EXP-004): JSONB column field inventory in schema browser -- Deliverable: Schema enhancement
Task 2.4.6 (EXP-010): Row detail overlay/modal in data browser -- Deliverable: UI enhancement
Task 2.4.7 (EXP-025): Query results export (CSV/JSON) -- Deliverable: Export functionality

---

#### Phase 3: Narrative Engine

Goal: Build the complete event narrative system and upgrade the storyteller to agentic mode with autonomous SQL exploration.
Entry State: Keyword-routed storyteller with 23 routes, SSE streaming, dual-tier context
Exit State: Agentic SQL storyteller, 132+ event narrative templates, death cause rendering, war chronicles

**Stage 3.1: Event Narrative Template System** (Duration: 2-3 weeks)
Task 3.1.1 (STR-016): Design template system architecture (Event -> Context -> Template -> HTML) -- Deliverable: Architecture doc + base classes
Task 3.1.2 (STR-016): Implement HF lifecycle event templates (15 types: died, revived, wounded, abducted, etc.) -- Deliverable: Template implementations
Task 3.1.3 (STR-017): Implement death cause rendering (50+ variants with weapon info, slayer, age at death) -- Deliverable: Death cause renderer
Task 3.1.4 (STR-016): Implement relationship event templates (10 types: add/remove HF/entity/site links) -- Deliverable: Template implementations
Task 3.1.5 (STR-016): Implement artifact event templates (13 types) -- Deliverable: Template implementations
Task 3.1.6 (STR-016): Implement site/construction event templates (18 types) -- Deliverable: Template implementations
Task 3.1.7 (STR-016): Implement entity event templates (14 types) -- Deliverable: Template implementations
Task 3.1.8 (STR-016): Implement war/combat event templates (8 types) -- Deliverable: Template implementations
Task 3.1.9 (STR-016): Implement diplomacy event templates (10 types) -- Deliverable: Template implementations
Task 3.1.10 (STR-016): Implement culture/art event templates (7 types) -- Deliverable: Template implementations
Task 3.1.11 (STR-016): Implement remaining event templates (masterpieces, occasions, misc -- ~25 types) -- Deliverable: Template implementations
Task 3.1.12 (STR-022): Implement missing event fallback (raw field dump or DF getSentence) -- Deliverable: Fallback renderer

**Stage 3.2: Narrative Enrichment** (Duration: 1 week)
Task 3.2.1 (STR-018): Implement circumstance/reason rendering -- Deliverable: Enrichment module
Task 3.2.2 (STR-019): Implement age at death with fractions (1/4, 1/2, 3/4) -- Deliverable: Utility function
Task 3.2.3 (STR-020): Implement temporal context (year/season prefix, suppress repeats) -- Deliverable: Event wrapper
Task 3.2.4 (STR-013): Implement war narrative generation (collection -> battles -> events) -- Deliverable: Narrative generator
Task 3.2.5 (STR-014): Implement battle detail rendering -- Deliverable: Narrative generator
Task 3.2.6 (STR-015): Implement civilization rise-and-fall narratives -- Deliverable: Narrative generator
Task 3.2.7 (STR-008): Implement character profile/biography generation -- Deliverable: Biography generator

**Stage 3.3: Agentic Storyteller** (Duration: 2-3 weeks)
Task 3.3.1 (STR-007): Build annotated schema summary for system prompt (~2K tokens, 40+ table definitions) -- Deliverable: Schema generator
Task 3.3.2 (STR-007): Implement SQL tool definition (read-only via SET TRANSACTION READ ONLY, 50 row max, 5s timeout) -- Deliverable: Tool executor
Task 3.3.3 (STR-007): Implement SQL safety layer (keyword blocklist: DROP/DELETE/INSERT/UPDATE/ALTER/TRUNCATE, readonly transaction, LIMIT cap, validated table/column names) -- Deliverable: Safety module
Task 3.3.4 (STR-007): Build agentic prompt with schema + tool + denizen summary (top N by NVS score) + instructions -- Deliverable: Prompt template
Task 3.3.5 (STR-007): Implement multi-round SQL exploration (up to 5 rounds) -- Deliverable: Agent loop
Task 3.3.6 (STR-007): Filter tool calls from SSE stream (only narrative tokens to client) -- Deliverable: Stream filter
Task 3.3.7 (STR-007): Config toggle: keyword vs. agentic mode -- Deliverable: Configuration
Task 3.3.8 (STR-030): Implement template vs. LLM hybrid rendering -- Deliverable: Mode selector

**Stage 3.4: Monitoring and Observability** (Duration: 0.5 weeks)
Task 3.4.1 (STR-028): Enhance storyteller logging (four-phase latency) -- Deliverable: Logging improvements
Task 3.4.2 (STR-029): Build monitoring dashboard (/monitoring) with three API endpoints (interactions list, interaction detail, summary) -- Deliverable: Dashboard UI + API endpoints
Note: The InteractionLog instrumentation class provides phase latency tracking.

---

#### Phase 4: Visualization

Goal: Build the interactive world map, charts, family trees, and all data visualizations.
Entry State: vis.js graph tab (partially built), no maps or charts
Exit State: Leaflet world map, Chart.js demographics, Cytoscape family trees, D3 war diagrams

**Stage 4.1: World Map** (Duration: 1-2 weeks)
Task 4.1.1 (VIS-001): Implement Leaflet.js world map (CRS.Simple, image overlay, zoom/pan) -- Deliverable: Map component
Task 4.1.2 (VIS-001): Implement map image generation (Python Pillow, 3 cached sizes) -- Deliverable: Image generator
Task 4.1.3 (VIS-002): Implement toggleable layer groups (sites, regions, mountains, etc.) -- Deliverable: Layer system
Task 4.1.4 (VIS-003): Implement site marker shapes by type (circle/triangle/square/pentagon/hexagon/star) -- Deliverable: Marker renderer. Note: Pentagon (blue)=MysteriousDungeon and Hexagon (blue)=MysteriousPalace are additional types not in all tool docs.
Task 4.1.5 (VIS-004): Implement civilization color system (HSV rotation) -- Deliverable: Color generator
Task 4.1.6 (VIS-009): Implement map search and jump (autocomplete, camera centering) -- Deliverable: Search overlay
Task 4.1.7 (VIS-010): Implement site bounding box display -- Deliverable: Rectangle overlay
Reference source for coordinate/biome rendering: DwarvenSurveyor (C#/Unity, ~1,500 lines, XML coordinate parsing).

**Stage 4.2: Charts and Demographics** (Duration: 1 week)
Task 4.2.1 (VIS-012): Population doughnut/pie charts (by race, by biome area) -- Deliverable: Chart components (Chart.js or D3.js)
Task 4.2.2 (VIS-013): Event timeline line chart (events per year) -- Deliverable: Chart component (Chart.js)
Task 4.2.3 (VIS-014): Event type breakdown bar chart -- Deliverable: Chart component (Chart.js)
Task 4.2.4 (VIS-020): World Summary Dashboard (map thumbnail, charts, statistics) -- Deliverable: Dashboard page

Chart library assignments consolidated:
- Population doughnut/pie: Chart.js or D3.js
- Event timeline (line): Chart.js
- Event type breakdown (bar): Chart.js
- War chord diagram: D3.js
- Warfare graph (force-directed): Cytoscape.js cola
- Family tree (hierarchical): Cytoscape.js dagre
- Curse lineage tree: Cytoscape.js or SVG
- Ego-network graph: vis.js forceAtlas2
- In-game data curve: Custom CurveWidget pattern

**Stage 4.3: Genealogy and Network Graphs** (Duration: 1-2 weeks)
Task 4.3.1 (VIS-017): Family tree visualization (Cytoscape.js dagre, 3-gen depth, node classes: current=dashed orange, dead=30% opacity, male=blue bg, female=magenta bg, leader=round-octagon+crown, necromancer=round-hexagon+skull, vampire=hexagon+vampire icon, werebeast=hexagon+wolf, ghost=hexagon+ghost) -- Deliverable: Family tree component
Task 4.3.2 (VIS-019): Polish ego-network graph (vis.js forceAtlas2, performance guards, node info panel) -- Deliverable: Graph improvements
Task 4.3.3 (VIS-005): Per-object mini-maps (entity detail pages, highlighted tiles) -- Deliverable: Mini-map generator
Task 4.3.4 (VIS-023): Event collection hierarchy drill-down -- Deliverable: Hierarchy component

**Stage 4.4: Advanced Visualizations (P3)** (Duration: 1-2 weeks, can be deferred)
Task 4.4.1 (VIS-015): War chord diagram (D3.js, inter-civ conflict web) -- Deliverable: D3 component
Task 4.4.2 (VIS-016): Warfare graph (Cytoscape.js cola, force-directed) -- Deliverable: Graph component
Task 4.4.3 (VIS-018): Curse lineage tree (vampire/werebeast chains) -- Deliverable: Lineage component
Task 4.4.4 (VIS-006): Map timeline scrubber (historical ownership state) -- Deliverable: Timeline component
Task 4.4.5 (VIS-007): Civilization territory overlays (convex hull) -- Deliverable: Territory renderer
Task 4.4.6 (VIS-021): Historical eras browser -- Deliverable: Era browser
Note: Stage 4.4 can be deferred to Phase 6 deferred stages.

---

#### Phase 5: Live Integration

Goal: Enhance the live bridge, implement worldgen monitoring, and build the Knowledge Horizon system.
Entry State: Bridge v6 (7 domains, polling only), no worldgen, no KH
Exit State: Bridge with eventful + enrichment, worldgen monitoring, KH Phase 1-3

**Stage 5.1: Bridge Enhancements** (Duration: 1-2 weeks)
Task 5.1.1 (ETL-006): Add eventful subscriptions (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, UNIT_NEW_ACTIVE, SYNDROME) -- Deliverable: Lua script update
Task 5.1.2 (ETL-007): Add death cause enrichment (incidents.all lookup via df.global.world.incidents.all) -- Deliverable: Lua function
Task 5.1.3 (ETL-008): Add family chain extraction (relationship_ids.Mother/Father) -- Deliverable: Lua function
Task 5.1.4 (ETL-009): Add book/written work detection (dfhack.items.getBookTitle) -- Deliverable: Lua function
Task 5.1.5 (ETL-010): Add personality/soul data (50 facets, beliefs, goals, needs) -- Deliverable: Lua section
Task 5.1.6 (ETL-011): Add skill progression tracking per unit -- Deliverable: Lua section + Python delta
Note: Polling + Events Hybrid pattern from myDFHackScripts: use eventful for real-time discrete events AND dfhack.timeout polling for gradual state transitions -- both mechanisms required.

**Stage 5.2: Worldgen Monitoring** (Duration: 1 week)
Task 5.2.1 (ETL-012): Create `worldgen-bridge.lua` (poll worldgen_status every 30 frames, ~0.5 seconds, distinct from main bridge 100-tick rate) -- Deliverable: Lua script
Task 5.2.2 (ETL-012): Implement auto-start via `dfhack.onStateChange.worldgen_monitor` -- Deliverable: State hook
Task 5.2.3 (ETL-012): Build Python worldgen snapshot ingester -- Deliverable: Python module
Task 5.2.4 (VIS-008): Implement worldgen live map preview (WebSocket push) -- Deliverable: Frontend component. Note: Entirely novel feature -- no existing tool in the 17-repo reference ecosystem monitors world generation in real-time.
Task 5.2.5 (ETL-012): Build worldgen dashboard (phase progress, civilization counts, event curves) -- Deliverable: Dashboard
Worldgen_status additional fields accessible: progress counters (rivers, civs, rampages), phase completion flags (caves_placed, megabeasts_placed, etc.), event cursor (last_event_id_added), live access to world.history.figures/events/eras as they populate.

**Stage 5.3: Knowledge Horizon** (Duration: 2-3 weeks)
Task 5.3.1 (KH-011): Create `knowledge_horizon` table + `visible_*` views -- Deliverable: SQL migration
  SQL: CREATE TABLE knowledge_horizon (world_id INT REFERENCES worlds(id), entity_type TEXT NOT NULL, entity_id INT NOT NULL, visible BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (world_id, entity_type, entity_id));
  SQL: CREATE VIEW visible_historical_figures AS SELECT * FROM historical_figures WHERE id IN (SELECT entity_id FROM knowledge_horizon WHERE entity_type = 'hf' AND visible = true);
Task 5.3.2 (KH-012): Phase 1: Denizen registry as starting point for visibility -- Deliverable: Initialization logic
Task 5.3.3 (KH-003): Phase 2: Individual scope masking (fortress inhabitants + direct family) -- Deliverable: Masking rules
Task 5.3.4 (KH-001): Phase 3: Geographic scope masking (fortress region + revealed regions) -- Deliverable: Masking rules
Task 5.3.5 (KH-002): Phase 3: Civilization scope masking (parent civ + contacted civs) -- Deliverable: Masking rules
Task 5.3.6 (KH-009): CAV-006: Event-based revelation (wars, caravans, migrants, raids) -- Deliverable: Event handlers
Task 5.3.7 (KH-004): CAV-001: Organization membership propagation -- Deliverable: Propagation rules
Task 5.3.8 (KH-005): CAV-002: Nobles always visible -- Deliverable: Exception rule
Task 5.3.9 (KH-010): CAV-007: LLM inference restrictions (system prompt) -- Deliverable: Prompt update
Task 5.3.10 (STR-032): Integrate KH with storyteller (query visible_* views) -- Deliverable: Storyteller update
Risk: KH complexity rated Medium impact. Mitigation: phased rollout (4 phases), start with simple denizen-based masking.

---

#### Phase 6: Advanced Components

Goal: Build the Mod Manager, Labor Manager, and AI Fortress Advisor as integrated Chronicler components.
Entry State: No mod management, no labor management, no advisor
Exit State: Core mod manager, labor grid with skill tracking, LLM-enhanced advisor

**Stage 6.1: Mod Manager Core** (Duration: 2-3 weeks)
Task 6.1.1 (MOD-001): Filesystem mod discovery (scan DF directories, parse info.txt) -- Deliverable: Mod scanner
Task 6.1.2 (MOD-003): info.txt parser (all v50 fields) -- Deliverable: Parser module
Task 6.1.3 (MOD-002): DFHack live mod discovery via dfhack-run (with PostgreSQL/JSON cache fallback when DFHack unavailable) -- Deliverable: Remote scanner
Task 6.1.4 (MOD-004): Modpack CRUD (mod-manager.json read/write) -- Deliverable: Profile manager
Task 6.1.5 (MOD-005): Profile import/export -- Deliverable: I/O functions
Task 6.1.6 (MOD-006): Load order management (18 header types) -- Deliverable: Order engine
Task 6.1.7 (MOD-007): Level 1 conflict detection (metadata) -- Deliverable: Conflict checker
Task 6.1.8 (MOD-010): Visual conflict indicators -- Deliverable: UI components. Mod browser: dual-pane UI (available vs. enabled mods).
Task 6.1.9 (MOD-016): Modpack snapshot at world creation -- Deliverable: Worldgen hook
Task 6.1.10 (MOD-020): CLI interface (chronicler mods) -- Deliverable: CLI commands
Reference sources: ModHearth, DF-Modloader, PyDwarf (doubly-linked token model for round-trip raw editing).

**Stage 6.2: Labor Manager Core** (Duration: 2-3 weeks)
Task 6.2.1 (LAB-012): Citizen roster with configurable polling -- Deliverable: Roster module
Task 6.2.2 (LAB-002): Skill display and progression tracking (including performance skills: musical_instruments, poetic_forms, musical_forms, dance_forms) -- Deliverable: Skill display
Task 6.2.3 (LAB-004): Happiness/stress monitoring (color-coded, trends) -- Deliverable: Stress monitor
Task 6.2.4 (LAB-008): Dwarf filtering/sorting (multi-criteria) -- Deliverable: Filter system
Task 6.2.5 (LAB-009): Thought/emotion display (80+ types) -- Deliverable: Emotion display
Task 6.2.6 (LAB-015): Population migration tracking -- Deliverable: Migration tracker
Task 6.2.7 (LAB-025): Deathwatch and casualty tracking (4 mechanisms: flag check unit.flags1.dead/unit.flags2.killed; absence detection from active list; announcement parsing; UNIT_DEATH eventful event) -- Deliverable: Death tracker
Task 6.2.8 (LAB-001): Labor toggle grid (Dwarf Therapist-style) -- Deliverable: Grid component
Task 6.2.9 (LAB-003): Personality trait visualization (50 facets, range -50 to +50, read from unit.status.current_soul.personality, used for labor recommendations/mood prediction/narrative voice) -- Deliverable: Personality display
Task 6.2.10 (LAB-011): Attribute display (6 physical + 12 mental) -- Deliverable: Attribute display
Additional features: goal/dream tracking (goal_type enum with accomplishment status), dwarf comparison view (2-4 side-by-side).
Integration: Storyteller integration (NVS scores for context selection), Explorer cross-linking (unit detail -> HF detail), Mod Manager integration (custom creatures -> labor type matching).
Reference source: DwarfFortressLogger (Java, ~3,000 lines, 29 memory sections, Dwarf Therapist-compatible layout).

**Stage 6.3: AI Fortress Advisor Core** (Duration: 2-3 weeks)
Task 6.3.1 (ADV-005): Advisor mode framework (recommend only vs. autonomous) -- Deliverable: Mode selector
Task 6.3.2 (ADV-020): Natural language fortress advice (LLM + fortress state + stock threshold model as explicit context + military heuristics as LLM prompt advisories) in 'Chronicler narrative voice' -- Deliverable: Advisor LLM prompt
Task 6.3.3 (ADV-008): Citizen arrival/departure tracking (including pet management: milkable/shearable/trainable/egg-laying/vermin-hunting/grazing; occupation assignment: tavern keeper/performer/scholar; ghost prevention; caged units; baby/mother reunification DF Bug 5551; immigration handling) -- Deliverable: Population tracker
Task 6.3.4 (ADV-007): Event-driven reactive alerts (UNIT_DEATH, INVASION, etc.) -- Deliverable: Alert system
Task 6.3.5 (ADV-011): Military sizing advisor (25%-75% bounds; includes tool confiscation, attack order scoring, training management, justice/crime monitoring) -- Deliverable: Military module
Task 6.3.6 (ADV-013): Stock threshold model (3-tier, ~100 categories; manager order stall detection: trim by 3/month if front order stuck in 'validated' state across 2 monthly checks) -- Deliverable: Stock module
Task 6.3.7 (ADV-006): Fortress health summary (daily/annual) -- Deliverable: Summary generator
Task 6.3.8 (ADV-023): Fortress post-mortem narrative -- Deliverable: Post-mortem generator
Additional: Construction planning (28 furniture types, 17 stockpile subtypes, room assignment workflow: new_citizen -> getbedroom -> getdiningroom, idle detection, vein mining advisor, cistern management).
Polling rates: Population=25 ticks, Military=25 ticks (phase 4), Nobles=25 ticks (phase 2), Trading=25 ticks (phase 0), Pets=25 ticks (phase 5), Justice=25 ticks (phase 4), Occupations=25 ticks (phase 8), Construction=240 ticks, Stocks=100 ticks, Farms=100 ticks.
Material categories for resource management: Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature.

**Stage 6.4: Advanced Mod Management (Deferred/P4)**
Task 6.4.1 (MOD-008): Level 2 conflict detection (object ID)
Task 6.4.2 (MOD-012): Raw file tokenizer (per-object mod attribution, raw visual diff viewer, mod content summary)
Task 6.4.3 (MOD-013): Three-way file merge (status codes: 0=clean merge, 1=potential issue, 2=overlap conflict, 3=fatal conflict)
Task 6.4.4 (MOD-015): Full raw compiler (DF-Modloader style: read_mod_raws_and_apply_edit_objects() -> apply_special_tokens_to_create_compiled_objects() -> write_compiled_objects(); EDIT selection methods: SEL_BY_ID, SEL_BY_CLASS, SEL_BY_TAG, SEL_BY_TAG_PRECISE, PLUS_SELECT, UNSELECT; operations: OT_ADD_TAG, OT_REMOVE_TAG, OT_CONVERT_TAG). Risk: Low impact, deferred to P4; core mod manager does not require compiler.
Task 6.4.5 (MOD-019): Steam Workshop integration
Additional Chronicler-unique features: modpack transition tracking (detect mid-save mod changes), modpack diff view (compare configurations).

**Stage 6.5: Advanced Labor Management (Deferred/P4)**
Task 6.5.1 (LAB-014): Skill-based labor auto-assignment
Task 6.5.2 (LAB-023): Labor optimization engine
Task 6.5.3 (LAB-013): AI-powered labor advisor
Task 6.5.4 (LAB-021): Stress trend analysis with prediction

**Stage 6.6: Advanced Advisor (Deferred/P4)**
Task 6.6.1 (ADV-017): Construction planning (22 room types: corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop)
Task 6.6.2 (ADV-018): Trade cycle management (9 steps)
Task 6.6.3 (ADV-024): Embark site evaluation
Task 6.6.4 (ADV-025): Random embark with auto-restart

---

#### Phase 7: Polish & Production

Goal: Performance optimization, comprehensive testing, packaging, deployment, and documentation.

**Stage 7.1: Performance** (Duration: 1 week)
Task 7.1.1: Index optimization for all heavy queries (entity detail pages, search, event filtering) -- Deliverable: SQL indexes
Task 7.1.2: Query performance profiling and optimization (< 500ms for paginated, < 2s for complex JOINs) -- Deliverable: Performance report. Risk: large worlds (1M+ events) require pagination, index optimization, and materialized views.
Task 7.1.3: Map image caching (avoid regeneration) -- Deliverable: Caching layer
Task 7.1.4: Graph rendering optimization (progressive loading for large graphs) -- Deliverable: UI optimization
Task 7.1.5: Storyteller response latency optimization -- Deliverable: LLM tuning

**Stage 7.2: Testing** (Duration: 1 week)
Task 7.2.1: Expand test suite for all new entity types and detail pages -- Deliverable: pytest additions
Task 7.2.2: Add integration tests for storyteller agentic mode -- Deliverable: Integration tests
Task 7.2.3: Add E2E tests for explorer navigation flows -- Deliverable: E2E tests
Task 7.2.4: Add tests for Knowledge Horizon masking rules -- Deliverable: KH tests
Task 7.2.5: Load testing with large worlds (500K+ events) -- Deliverable: Load test results

**Stage 7.3: Packaging and Deployment** (Duration: 0.5 weeks)
Task 7.3.1: Python package configuration (pyproject.toml) -- Deliverable: Package config
Task 7.3.2: Docker containerization -- Deliverable: Dockerfile
Task 7.3.3: VM deployment scripts (bridge, HTTP server, SSH setup) -- Deliverable: Deploy scripts
Task 7.3.4: User documentation (installation, configuration, usage) -- Deliverable: Docs

**Stage 7.4: Documentation** (Duration: 0.5 weeks)
Task 7.4.1: API documentation (all endpoints) -- Deliverable: API docs
Task 7.4.2: CDM schema documentation (all tables, columns, relationships) -- Deliverable: Schema docs
Task 7.4.3: User guide (getting started, features, FAQ) -- Deliverable: User guide
Task 7.4.4: Developer guide (architecture, contributing, extending) -- Deliverable: Dev guide

### 18.3 Timeline Estimates

Estimated Timeline per phase:

| Phase | Estimated Duration | Cumulative |
|-------|-------------------|------------|
| Phase 1 | 3-4 weeks | 3-4 weeks |
| Phase 2 | 4-6 weeks | 7-10 weeks |
| Phase 3 | 4-6 weeks | 11-16 weeks |
| Phase 4 | 3-4 weeks | 14-20 weeks |
| Phase 5 | 3-4 weeks | 17-24 weeks |
| Phase 6 | 6-10 weeks | 23-34 weeks |
| Phase 7 | 2-3 weeks | 25-37 weeks |

Total estimated timeline: 25-37 weeks across 7 phases.

Priority-to-Phase Mapping (Appendix A):

| Priority | Meaning | Phases |
|----------|---------|--------|
| P1 | Critical / v1.0 | Phases 1-3 |
| P2 | High Value | Phases 2-5 |
| P3 | Important | Phases 5-6 |
| P4 | Stretch / Future | Phase 6 (deferred stages), beyond |

### 18.4 Milestones & Acceptance Criteria

Milestone Definitions (Appendix B):

| Milestone | Phase | Definition of Done |
|-----------|-------|-------------------|
| M1: Data Complete | Phase 1 complete | All 14+ XML sections parsed, 40+ CDM tables, post-parse pipeline running, all worlds re-ingested |
| M2: Explorer Complete | Phase 2 complete | All entity detail pages, global search, cross-linking, hover popovers |
| M3: Storyteller v1.0 | Phase 3 complete | Agentic SQL mode, 132 event templates, death cause rendering |
| M4: Visualization | Phase 4 complete | Leaflet map, Chart.js demographics, Cytoscape family trees |
| M5: Live Complete | Phase 5 complete | Enhanced bridge, worldgen monitoring, Knowledge Horizon Phase 3 |
| M6: Full Suite | Phase 6 complete | Mod manager, labor manager, AI advisor all functional |
| M7: Release | Phase 7 complete | Performance optimized, fully tested, packaged, documented |

### 18.5 Risk Register

Risk Register (Appendix C):

| Risk | Impact | Mitigation |
|------|--------|------------|
| DFHack version incompatibility (new DF release) | High | Pin to DFHack 53.10-r1; test on new versions before upgrading |
| TCP RPC remains broken under Prism | Medium | Already mitigated: dfhack-run SSH transport is primary |
| Large world performance (1M+ events) | Medium | Pagination, index optimization, materialized views |
| LLM hallucination in agentic mode | High | Read-only SQL (SET TRANSACTION READ ONLY), evidence citations, confidence signaling |
| Knowledge Horizon complexity | Medium | Phased rollout (4 phases); start with simple denizen-based masking |
| Mod compiler complexity | Low | Deferred to P4; core mod manager does not require compiler |

### 18.6 Research Foundations

#### Reference Repository Inventory

Reference Repository Inventory table with per-repo detail:
- LegendsViewer-Next: C#/Vue.js, ~15,000 lines. Key contributions: Leaflet map, Cytoscape family tree, Chart.js viz, 115+ event types, Vue detail pages.
- LegendsBrowser: Java, ~8,000 lines. Key: SAX streaming XML, SVG family tree, D3 chord diagram, Bootstrap popovers.
- LegendsBrowser2: Go, ~12,000 lines. Key: 132 event types, custom XML tokenizer (NOT encoding/xml -- chose for performance), context-aware rendering, autocomplete search.
- weblegends: C++, ~6,000 lines. Key: 94 event handler files, 40+ death causes, perspective-aware linking, live DFHack memory.
- df-narrator: Python, ~2,000 lines. Key: 4 scoring formulas, HF_FIELDS set, rival detection, Markdown world summary.
- df-ai: C++, ~25,000 lines. Key: full fortress AI -- population, military, stocks, construction, trade management.
- dfhack-client-python: Python, ~1,500 lines. Key: RPC protocol implementation, binary frame format.
- DwarfFortressLogger: Java, ~3,000 lines. Key: 29 memory sections, Dwarf Therapist-compatible layout system.
- myDFHackScripts: Lua, ~2,000 lines. Key: death cause lookup, citizen detection, eventful hooks, polling patterns.
- DwarvenSurveyor: C#/Unity, ~1,500 lines. Key: XML coordinate parsing, biome rendering, site taxonomy.
- df-structures: XML, ~50,000 lines. Key: canonical memory layout, 144 event types (authoritative), all entity fields.
- DF-Modloader: Python, ~1,700 lines. Key: raw file compiler, EDIT/SELECT/CUT handling, object template system.
- ModHearth: C#, ~2,000 lines. Key: DFHack mod memory query, info.txt parsing, conflict detection.
- PyLNP: Python, ~3,000 lines. Key: three-way merge algorithm, baseline management, merge status tracking.
- PyDwarf: Python, ~2,500 lines. Key: doubly-linked token model, round-trip raw editing.
- Nexus Mod Manager: C#, ~50,000 lines. Key: plugin architecture, category browsing, multi-game mod management.
- Dwarf Therapist: C++, ~20,000 lines. Key: memory layout system (not directly usable via remote access).

#### Component and Repository Research Reports

Component research reports: component-01-world-history-visualizer.md (~800 lines), component-02-database-explorer.md (~900 lines), component-03-ai-storyteller.md (~800 lines), component-04-ai-player.md (~700 lines), component-05-mod-manager.md (~750 lines), component-06-labor-manager.md (~650 lines), component-07-cdm-database.md (~950 lines), component-08-data-etl.md (~850 lines).

Repository research reports: df-ai, LegendsViewer-Next, df-narrator+weblegends, LegendsBrowser+LB2, DFHack infrastructure (dfhack-client-python/DFLogger/df-structures/myDFHackScripts), mod management (DF-Modloader/ModHearth/PyLNP/PyDwarf), worldgen scraping, DwarvenSurveyor+scripts.

Research Synthesis v2 (this document) supersedes research-synthesis.md v1 (488 lines, 2026-02-23).
