# Chronicler -- Full Project Roadmap

**Version**: 2.0
**Date**: 2026-03-04
**Status**: Comprehensive end-to-end development outline (updated with completed phases + reordering)
**Reference**: Product Requirements Document (product-requirements.md), Research Synthesis v2 (research-synthesis-v2.md)

---

## Roadmap Overview

The Chronicler project is organized into **7 development phases**, progressing from foundational data completeness through full application maturity. Each phase builds on the prior phase's deliverables. Within each phase, work is organized into stages that can be executed in parallel where dependencies allow.

### v2.0 Revision Notes (2026-03-04)

**Phases 1-2 are COMPLETE.** Phase 3 (Narrative Engine) and Phase 5 (Live Integration) have been **swapped**. Live Integration is now Phase 3 because integrating live in-game data will likely introduce schema changes (new tables, modified columns for real-time state), which would cascade into narrative template and agentic schema rewrites. Stabilizing the schema with live data first avoids rework. Additionally, substantial narrative engine work was already completed during Phase 2 enhancements and early Phase 3 sessions (114 event templates, death cause renderer, circumstance/reason rendering, monitoring dashboard), reducing the remaining Narrative Engine scope.

```
Phase 1: Data Foundation — COMPLETE (2026-02-25, 64/64 checks)
Phase 2: Explorer Core — COMPLETE (2026-03-03, 50/50 checks)
Phase 3: Live Integration (bridge enhancements, worldgen, Knowledge Horizon, embedding pipelines)
Phase 4: Narrative Engine (agentic storyteller, war/biography generators, remaining templates)
Phase 5: Visualization (world map, charts, family trees, graphs)
Phase 6: Advanced Components (Mod Manager, Labor Manager, AI Advisor)
Phase 7: Polish & Production (performance, testing, packaging, deployment)
```

### Phase Dependencies

```
Phase 1 --> Phase 2 (explorer needs complete data) ✓ DONE
Phase 1 --> Phase 3 (live integration needs complete CDM) ✓ Phase 1 DONE
Phase 2 --> Phase 3 (KH needs entity detail pages for visibility toggle)
Phase 3 --> Phase 4 (narrative engine needs stable schema from live integration)
Phase 2 --> Phase 5 (visualizations sit on explorer pages)
Phase 3, Phase 4 --> Phase 6 (advanced components need live data + narrative)
All --> Phase 7 (polish is last)
```

### Estimated Timeline

| Phase | Status | Estimated Duration | Actual/Cumulative |
|-------|--------|-------------------|-------------------|
| Phase 1 | **COMPLETE** | 3-4 weeks | Completed 2026-02-25 |
| Phase 2 | **COMPLETE** | 4-6 weeks | Completed 2026-03-03 |
| Phase 3 | Next | 3-4 weeks | — |
| Phase 4 | Pending | 2-4 weeks (reduced; ~60% pre-built) | — |
| Phase 5 | Pending | 3-4 weeks | — |
| Phase 6 | Pending | 6-10 weeks | — |
| Phase 7 | Pending | 2-3 weeks | — |

---

## Phase 1: Data Foundation — COMPLETE

**Completed**: 2026-02-25
**Validation**: 64/64 checks passed, user-reviewed
**Milestone**: M1 — Data Complete

**Goal**: Complete the CDM schema, XML parser, and post-parse processing so all DF data is available in PostgreSQL with full cross-referencing.

**Entry State**: v0.8 — 35 tables, 8/14+ XML sections parsed, 1.65M records
**Exit State**: 40+ tables, all 15+ XML sections parsed (including creature_raw), post-parse pipeline running, creature dictionary populated, all entity types and fields complete

### Stage 1.1: CDM Schema Extensions — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 1.1.1 | CDM-006 | Add `world_constructions` table (world_id, id, name, type, coords) | SQL migration + model |
| 1.1.2 | CDM-006 | Add `art_forms` table (world_id, id, name, type [dance/musical/poetic], details JSONB) | SQL migration + model |
| 1.1.3 | CDM-006 | Add `identities` table (world_id, id, name, race, caste, details JSONB) | SQL migration + model |
| 1.1.4 | CDM-006 | Add `rivers` table (world_id, id, name, coords, details JSONB) | SQL migration + model |
| 1.1.5 | CDM-006 | Complete `landmasses` and `mountain_peaks` tables (add missing fields) | SQL migration |
| 1.1.6 | CDM-007 | Extend `historical_figures` with high-priority fields (spheres, goals, skills, kills, whereabouts, entity_reputations, intrigue_actors, used_identities, journey_pets, holds_artifact) | SQL migration |
| 1.1.7 | CDM-007 | Add `active_interactions` JSONB field to HFs for vampire/necromancer/were detection | SQL migration |
| 1.1.8 | CDM-010 | Add `worldgen_snapshots` table | SQL migration |
| 1.1.9 | CDM-011 | Add `world_modpacks` table | SQL migration |

### Stage 1.2: XML Parser Completion — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 1.2.1 | ETL-003 | Parse `<world_constructions>` section (roads, tunnels, bridges) | Parser extension |
| 1.2.2 | ETL-003 | Parse `<dance_forms>`, `<musical_forms>`, `<poetic_forms>` sections | Parser extension |
| 1.2.3 | ETL-003 | Parse `<identities>` section | Parser extension |
| 1.2.4 | ETL-003 | Parse `<rivers>` section | Parser extension |
| 1.2.5 | ETL-003 | Complete `<mountain_peaks>` and `<landmasses>` parsing | Parser extension |
| 1.2.6 | ETL-003 | Parse expanded HF fields from legends_plus.xml (skills, kills, whereabouts, entity_reputations, active_interactions, etc.) | Parser extension |
| 1.2.7 | ETL-003 | Parse `<entity_populations>` section fully | Parser extension |
| 1.2.8 | ETL-002 | Audit dual-file merge rules against LV-Next/LB2 merge strategies | Verification report |

### Stage 1.3: Post-Parse Processing Pipeline — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 1.3.1 | ETL-004 | Step 1: Resolve HF-to-HF family links (mother/father/child/spouse from hf_links) | Processing step |
| 1.3.2 | ETL-004 | Step 2: Resolve HF-to-entity position assignments | Processing step |
| 1.3.3 | ETL-004 | Step 3: Derive vampire/werebeast/necromancer flags from interaction events | Processing step |
| 1.3.4 | ETL-004 | Step 4: Compute site ruin status from destruction/reclaim events | Processing step |
| 1.3.5 | ETL-004 | Step 5: Build entity war lists from event collections | Processing step |
| 1.3.6 | ETL-004 | Step 6: Compute HF kill lists from death events | Processing step |
| 1.3.7 | ETL-004 | Step 7: Calculate importance scores (df-narrator formulas) | Processing step |
| 1.3.8 | ETL-004 | Step 8: Build event-to-entity cross-reference index | Processing step |
| 1.3.9 | ETL-004 | Step 9: Resolve site ownership history from events | Processing step |
| 1.3.10 | ETL-004 | Step 10: Validate referential integrity (all FK refs resolve) | Processing step + tests |

### Stage 1.4: Test Suite Extension — COMPLETE

| Task | Description | Deliverable |
|------|-------------|-------------|
| 1.4.1 | Add tests for all new XML sections | pytest additions |
| 1.4.2 | Add tests for post-parse processing steps | pytest additions |
| 1.4.3 | Add tests for new CDM tables and constraints | pytest additions |
| 1.4.4 | Re-ingest all worlds and verify record counts | Verification |

### Stage 1.5: Creature Dictionary — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 1.5.1 | CDM-013 | Create `creature_dictionary` table (world_id, creature_id, name_singular, name_plural, flags JSONB) | SQL migration |
| 1.5.2 | ETL-003 | Parse `<creature_raw>` section from legends_plus.xml (creature_id, names, classification flags) | Parser extension |
| 1.5.3 | CDM-013 | Add `get_creature_name()` utility for race display (with fallback for unknown IDs) | Python utility |
| 1.5.4 | CDM-013 | Update `chronicler ingest` to parse creature_raw before post-parse pipeline | CLI update |
| 1.5.5 | CDM-013 | Add tests: dictionary population, race resolution, flag extraction, fallback behavior | pytest additions |

---

## Phase 2: Explorer Core — COMPLETE

**Completed**: 2026-03-03
**Validation**: 50/50 checks passed (30 DoD + 13 enhancements + 7 regression SQL)
**Milestone**: M2 — Explorer Complete

**Goal**: Build comprehensive entity detail pages, global search, cross-linking, and navigation so users can browse all world data.

**Entry State**: 6 tabs (People, Civilizations, Geography, Schema, Data, Graph), basic data grid
**Exit State**: 17 entity detail pages, global search, perspective-aware cross-linking, hover popovers, 114 event templates, death cause rendering, monitoring dashboard

### Stage 2.1: Entity Detail Page Framework — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 2.1.1 | EXP-011-019 | Design generic detail page template (header, cards, events, mini-map placeholder) | Template system |
| 2.1.2 | EXP-027 | Implement cross-linking infrastructure (entity references -> navigable links) | Link renderer |
| 2.1.3 | EXP-028 | Implement perspective-aware rendering (context entity suppression, relational pronouns) | Event renderer |
| 2.1.4 | NAV-005 | Implement DF calendar utility (seconds72 -> date/month/season) | Shared utility |

### Stage 2.2: Primary Entity Detail Pages — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 2.2.1 | EXP-011 | Historical Figure detail page (24 sections) | API + template |
| 2.2.2 | EXP-012 | Entity (Civilization) detail page (5 tabs: Leaders, Sites, Members, Groups, Wars) | API + template |
| 2.2.3 | EXP-013 | Site detail page (3 tabs: Structures, Properties, History) | API + template |
| 2.2.4 | EXP-014 | Artifact detail page (chain-of-custody timeline) | API + template |
| 2.2.5 | EXP-015 | Region detail page (biome, evilness, sites) | API + template |
| 2.2.6 | EXP-016 | Structure detail page | API + template |
| 2.2.7 | EXP-017 | Written Content detail page | API + template |
| 2.2.8 | EXP-018 | Event Collection detail page (19 types, drill-down hierarchy) | API + template |

### Stage 2.3: Secondary Entity Detail Pages — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 2.3.1 | EXP-019 | Underground Region detail page | API + template |
| 2.3.2 | EXP-019 | Landmass detail page | API + template |
| 2.3.3 | EXP-019 | Mountain Peak detail page | API + template |
| 2.3.4 | EXP-019 | River detail page | API + template |
| 2.3.5 | EXP-019 | World Construction detail page | API + template |
| 2.3.6 | EXP-019 | Art Form detail pages (3 types) | API + template |
| 2.3.7 | EXP-019 | Identity detail page | API + template |
| 2.3.8 | EXP-019 | Historical Era detail page | API + template |
| 2.3.9 | VIS-022 | Years and Events browser (chronological index) | API + template |

### Stage 2.4: Search and Navigation — COMPLETE

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 2.4.1 | EXP-021 | Global search with live autocomplete (debounced, categorized results) | API + UI component |
| 2.4.2 | EXP-022 | HF filtering by type flags (deity, vampire, etc.) | Filter UI |
| 2.4.3 | NAV-003 | Hover popovers for entity preview (Ajax-fetched, Bootstrap/Tippy.js) | Popover system |
| 2.4.4 | NAV-004 | Breadcrumb / prev-next navigation (FABs on detail pages) | Navigation UI |
| 2.4.5 | EXP-004 | JSONB column field inventory in schema browser | Schema enhancement |
| 2.4.6 | EXP-010 | Row detail overlay/modal in data browser | UI enhancement |
| 2.4.7 | EXP-025 | Query results export (CSV/JSON) | Export functionality |

### Stage 2.5: Early Narrative Infrastructure (built during Phase 2 enhancements)

The following narrative engine components were built ahead of schedule during Phase 2 enhancement work and early Phase 3 sessions. They are credited here and marked as pre-completed in Phase 4.

| Component | Status | Details |
|-----------|--------|---------|
| **Event Template System** | COMPLETE | `PerspectiveRenderer` with 114 event templates in `perspective.py` |
| **Entity Name Cache** | COMPLETE | `EntityNameCache` for batch name resolution across templates |
| **Entity Link Renderer** | COMPLETE | `EntityLinkRenderer` for cross-linked entity names in event text |
| **Death Cause Renderer** | COMPLETE | `DeathCauseRenderer` in `death_cause.py` — 36 HF cause codes + 25 event cause codes |
| **Age at Death** | COMPLETE | `render_age_at_death()` with fractional precision (DF calendar ticks) |
| **Circumstance/Reason Rendering** | COMPLETE | 21 reason templates + 7 circumstance templates with JSON-object handling |
| **Annotated Schema** | COMPLETE | `annotated_schema.py` for storyteller system prompts |
| **Monitoring Dashboard** | COMPLETE | `/monitoring` route with interaction list, summary stats, detail view |

---

## Phase 3: Live Integration

**Goal**: Enhance the live bridge, implement worldgen monitoring, build the Knowledge Horizon system, and activate embedding pipelines for both batch and live data. Stabilize the DB schema before building the agentic storyteller.

**Entry State**: Bridge v6 (7 domains, polling only), no worldgen, no KH, embedding table empty (schema only)
**Exit State**: Bridge with eventful + enrichment, worldgen monitoring, KH Phase 1-3, embedding pipelines for batch + live data

**PRD**: `reports/phases/phase-3-live-integration.md` (renamed from phase-5)

> **Note on KH-Storyteller Integration**: The Knowledge Horizon storyteller integration (REQ-STR-032) requires the agentic storyteller from Phase 4. Stage 3.3 builds the KH data layer (tables, views, masking rules); the storyteller query integration is deferred to Phase 4 Stage 4.3.

### Stage 3.1: Bridge Enhancements

**Duration**: 1-2 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.1.1 | ETL-006 | Add eventful subscriptions (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, UNIT_NEW_ACTIVE, SYNDROME) | Lua script update |
| 3.1.2 | ETL-007 | Add death cause enrichment (incidents.all lookup) | Lua function |
| 3.1.3 | ETL-008 | Add family chain extraction (relationship_ids.Mother/Father) | Lua function |
| 3.1.4 | ETL-009 | Add book/written work detection (getBookTitle) | Lua function |
| 3.1.5 | ETL-010 | Add personality/soul data (50 facets, beliefs, goals, needs) | Lua section |
| 3.1.6 | ETL-011 | Add skill progression tracking per unit | Lua section + Python delta |

### Stage 3.2: Worldgen Monitoring

**Duration**: 1 week

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.2.1 | ETL-012 | Create `worldgen-bridge.lua` (poll worldgen_status every 30 frames) | Lua script |
| 3.2.2 | ETL-012 | Implement auto-start via `dfhack.onStateChange.worldgen_monitor` | State hook |
| 3.2.3 | ETL-012 | Build Python worldgen snapshot ingester | Python module |
| 3.2.4 | VIS-008 | Implement worldgen live map preview (WebSocket push) | Frontend component |
| 3.2.5 | ETL-012 | Build worldgen dashboard (phase progress, civilization counts, event curves) | Dashboard |

### Stage 3.3: Knowledge Horizon

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.3.1 | KH-011 | Create `knowledge_horizon` table + `visible_*` views | SQL migration |
| 3.3.2 | KH-012 | Phase 1: Denizen registry as starting point for visibility | Initialization logic |
| 3.3.3 | KH-003 | Phase 2: Individual scope masking (fortress inhabitants + direct family) | Masking rules |
| 3.3.4 | KH-001 | Phase 3: Geographic scope masking (fortress region + revealed regions) | Masking rules |
| 3.3.5 | KH-002 | Phase 3: Civilization scope masking (parent civ + contacted civs) | Masking rules |
| 3.3.6 | KH-009 | CAV-006: Event-based revelation (wars, caravans, migrants, raids) | Event handlers |
| 3.3.7 | KH-004 | CAV-001: Organization membership propagation | Propagation rules |
| 3.3.8 | KH-005 | CAV-002: Nobles always visible | Exception rule |
| 3.3.9 | KH-010 | CAV-007: LLM inference restrictions (system prompt) | Prompt update |
| 3.3.10 | — | Explorer KH toggle (on/off per session) | UI toggle |

### Stage 3.4: Embedding Pipelines

**Duration**: 1 week

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.4.1 | EMB-001 | Build entity text extractors for all entity types | Python module |
| 3.4.2 | EMB-002 | Implement chunking strategy with content_hash deduplication | Chunker class |
| 3.4.3 | EMB-003 | Add `chronicler embed` CLI command (batch embedding) | CLI command |
| 3.4.4 | EMB-004 | Build incremental live embedding via watcher (delta detection) | LiveEmbedder class |
| 3.4.5 | EMB-004 | Add reactive event embedding (immediate embed for deaths, invasions) | Event handler |
| 3.4.6 | EMB-005 | Implement hybrid search (ILIKE + pgvector with RRF ranking) | Search upgrade |
| 3.4.7 | EMB-006 | Build narrative context retrieval for storyteller prompts | Context retriever |

---

## Phase 4: Narrative Engine

**Goal**: Complete the event narrative system and upgrade the storyteller to agentic mode with autonomous SQL exploration. Build war, biography, and civilization narrative generators. Integrate Knowledge Horizon with the storyteller.

**Entry State**: 114 event templates (built in Phase 2), death cause renderer, circumstance/reason rendering, monitoring dashboard, keyword-routed storyteller with 23 routes, stable schema from Phase 3
**Exit State**: Agentic SQL storyteller, 132+ event templates (gap-fill), war/battle/biography narratives, KH-integrated storyteller

**PRD**: `reports/phases/phase-4-narrative-engine.md` (renamed from phase-3)

> **Reduced scope**: ~60% of the original Narrative Engine PRD was completed during Phase 2 enhancements. The remaining work focuses on: (a) gap-filling event templates to reach 132+, (b) the agentic storyteller with SQL tool use, (c) higher-order narrative generators, and (d) KH-storyteller integration.

### Stage 4.1: Event Template Gap-Fill

**Duration**: 0.5-1 week

**Pre-completed work** (from Phase 2 / early Phase 3):
- [x] Template system architecture (`PerspectiveRenderer`, `EntityLinkRenderer`, `EntityNameCache`)
- [x] 114 event type templates (covering all 102 DB event types + 12 dynamic overrides)
- [x] Death cause renderer (61 cause mappings across HF + event levels)
- [x] Circumstance/reason rendering (21 reason + 7 circumstance templates)
- [x] Age at death with fractional precision
- [x] Fallback template for uncovered types (generic with entity linking)

**Remaining work**:

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.1.1 | STR-016 | Audit 114 templates against LB2/weblegends for accuracy; fix mismatches | Template corrections |
| 4.1.2 | STR-016 | Add templates for any new event types introduced by Phase 3 schema changes | New templates |
| 4.1.3 | STR-020 | Implement temporal context rendering (year/season prefix, suppress repeats) | Event wrapper |

### Stage 4.2: Narrative Generators

**Duration**: 1-2 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.2.1 | STR-013 | Implement war narrative generation (collection -> battles -> events) | Narrative generator |
| 4.2.2 | STR-014 | Implement battle detail rendering | Narrative generator |
| 4.2.3 | STR-015 | Implement civilization rise-and-fall narratives | Narrative generator |
| 4.2.4 | STR-008 | Implement character profile/biography generation | Biography generator |

### Stage 4.3: Agentic Storyteller

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.3.1 | STR-007 | Update annotated schema summary for final schema (post-Phase 3 changes) | Schema generator |
| 4.3.2 | STR-007 | Implement SQL tool definition (read-only, 50 row max, 5s timeout) | Tool executor |
| 4.3.3 | STR-007 | Implement SQL safety layer (keyword blocklist, readonly transaction, LIMIT cap) | Safety module |
| 4.3.4 | STR-007 | Build agentic prompt with schema + tool + denizen summary + instructions | Prompt template |
| 4.3.5 | STR-007 | Implement multi-round SQL exploration (up to 5 rounds) | Agent loop |
| 4.3.6 | STR-007 | Filter tool calls from SSE stream (only narrative tokens to client) | Stream filter |
| 4.3.7 | STR-007 | Config toggle: keyword vs. agentic mode | Configuration |
| 4.3.8 | STR-030 | Implement template vs. LLM hybrid rendering | Mode selector |
| 4.3.9 | STR-032 | Integrate Knowledge Horizon with storyteller (query visible_* views) | Storyteller KH integration |

### Stage 4.4: Monitoring Enhancements

**Duration**: 0.5 weeks

**Pre-completed work** (from Phase 2):
- [x] Monitoring dashboard (`/monitoring`) with interaction list, summary stats, detail view
- [x] Per-interaction logging (`storyteller_log` table)

**Remaining work**:

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.4.1 | STR-028 | Enhance logging with four-phase latency tracking (context, TTFT, LLM, SSE) | Logging improvements |
| 4.4.2 | STR-029 | Add agentic-mode metrics (SQL query count, SQL total time, per-query stats) | Dashboard enhancements |

---

## Phase 5: Visualization

**Goal**: Build the interactive world map, charts, family trees, and all data visualizations.

**Entry State**: vis.js graph tab (partially built), no maps or charts
**Exit State**: Leaflet world map, Chart.js demographics, Cytoscape family trees, D3 war diagrams

**PRD**: `reports/phases/phase-5-visualization.md` (renamed from phase-4)

### Stage 5.1: World Map

**Duration**: 1-2 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.1.1 | VIS-001 | Implement Leaflet.js world map (CRS.Simple, image overlay, zoom/pan) | Map component |
| 5.1.2 | VIS-001 | Implement map image generation (Python Pillow, 3 cached sizes) | Image generator |
| 5.1.3 | VIS-002 | Implement toggleable layer groups (sites, regions, mountains, etc.) | Layer system |
| 5.1.4 | VIS-003 | Implement site marker shapes by type (circle/triangle/square/pentagon/hexagon/star) | Marker renderer |
| 5.1.5 | VIS-004 | Implement civilization color system (HSV rotation) | Color generator |
| 5.1.6 | VIS-009 | Implement map search and jump (autocomplete, camera centering) | Search overlay |
| 5.1.7 | VIS-010 | Implement site bounding box display | Rectangle overlay |

### Stage 5.2: Charts and Demographics

**Duration**: 1 week

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.2.1 | VIS-012 | Population doughnut/pie charts (by race, by biome area) | Chart components |
| 5.2.2 | VIS-013 | Event timeline line chart (events per year) | Chart component |
| 5.2.3 | VIS-014 | Event type breakdown bar chart | Chart component |
| 5.2.4 | VIS-020 | World Summary Dashboard (map thumbnail, charts, statistics) | Dashboard page |

### Stage 5.3: Genealogy and Network Graphs

**Duration**: 1-2 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.3.1 | VIS-017 | Family tree visualization (Cytoscape.js dagre, 3-gen depth, node classes) | Family tree component |
| 5.3.2 | VIS-019 | Polish ego-network graph (vis.js, performance guards, node info panel) | Graph improvements |
| 5.3.3 | VIS-005 | Per-object mini-maps (entity detail pages, highlighted tiles) | Mini-map generator |
| 5.3.4 | VIS-023 | Event collection hierarchy drill-down | Hierarchy component |

### Stage 5.4: Advanced Visualizations (P3)

**Duration**: 1-2 weeks (can be deferred)

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.4.1 | VIS-015 | War chord diagram (D3.js, inter-civ conflict web) | D3 component |
| 5.4.2 | VIS-016 | Warfare graph (Cytoscape.js cola, force-directed) | Graph component |
| 5.4.3 | VIS-018 | Curse lineage tree (vampire/werebeast chains) | Lineage component |
| 5.4.4 | VIS-006 | Map timeline scrubber (historical ownership state) | Timeline component |
| 5.4.5 | VIS-007 | Civilization territory overlays (convex hull) | Territory renderer |
| 5.4.6 | VIS-021 | Historical eras browser | Era browser |

---

## Phase 6: Advanced Components

**Goal**: Build the Mod Manager, Labor Manager, and AI Fortress Advisor as integrated Chronicler components.

**Entry State**: No mod management, no labor management, no advisor
**Exit State**: Core mod manager, labor grid with skill tracking, LLM-enhanced advisor

### Stage 6.1: Mod Manager Core

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 6.1.1 | MOD-001 | Filesystem mod discovery (scan DF directories, parse info.txt) | Mod scanner |
| 6.1.2 | MOD-003 | info.txt parser (all v50 fields) | Parser module |
| 6.1.3 | MOD-002 | DFHack live mod discovery via dfhack-run | Remote scanner |
| 6.1.4 | MOD-004 | Modpack CRUD (mod-manager.json read/write) | Profile manager |
| 6.1.5 | MOD-005 | Profile import/export | I/O functions |
| 6.1.6 | MOD-006 | Load order management (18 header types) | Order engine |
| 6.1.7 | MOD-007 | Level 1 conflict detection (metadata) | Conflict checker |
| 6.1.8 | MOD-010 | Visual conflict indicators | UI components |
| 6.1.9 | MOD-016 | Modpack snapshot at world creation | Worldgen hook |
| 6.1.10 | MOD-020 | CLI interface (chronicler mods) | CLI commands |

### Stage 6.2: Labor Manager Core

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 6.2.1 | LAB-012 | Citizen roster with configurable polling | Roster module |
| 6.2.2 | LAB-002 | Skill display and progression tracking | Skill display |
| 6.2.3 | LAB-004 | Happiness/stress monitoring (color-coded, trends) | Stress monitor |
| 6.2.4 | LAB-008 | Dwarf filtering/sorting (multi-criteria) | Filter system |
| 6.2.5 | LAB-009 | Thought/emotion display (80+ types) | Emotion display |
| 6.2.6 | LAB-015 | Population migration tracking | Migration tracker |
| 6.2.7 | LAB-025 | Deathwatch and casualty tracking (4 mechanisms) | Death tracker |
| 6.2.8 | LAB-001 | Labor toggle grid (Dwarf Therapist-style) | Grid component |
| 6.2.9 | LAB-003 | Personality trait visualization (50 facets) | Personality display |
| 6.2.10 | LAB-011 | Attribute display (6 physical + 12 mental) | Attribute display |

### Stage 6.3: AI Fortress Advisor Core

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 6.3.1 | ADV-005 | Advisor mode framework (recommend only vs. autonomous) | Mode selector |
| 6.3.2 | ADV-020 | Natural language fortress advice (LLM + fortress state) | Advisor LLM prompt |
| 6.3.3 | ADV-008 | Citizen arrival/departure tracking | Population tracker |
| 6.3.4 | ADV-007 | Event-driven reactive alerts (UNIT_DEATH, INVASION, etc.) | Alert system |
| 6.3.5 | ADV-011 | Military sizing advisor (25%-75% bounds) | Military module |
| 6.3.6 | ADV-013 | Stock threshold model (3-tier, ~100 categories) | Stock module |
| 6.3.7 | ADV-006 | Fortress health summary (daily/annual) | Summary generator |
| 6.3.8 | ADV-023 | Fortress post-mortem narrative | Post-mortem generator |

### Stage 6.4: Advanced Mod Management (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.4.1 | MOD-008 | Level 2 conflict detection (object ID) |
| 6.4.2 | MOD-012 | Raw file tokenizer |
| 6.4.3 | MOD-013 | Three-way file merge |
| 6.4.4 | MOD-015 | Full raw compiler |
| 6.4.5 | MOD-019 | Steam Workshop integration |

### Stage 6.5: Advanced Labor Management (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.5.1 | LAB-014 | Skill-based labor auto-assignment |
| 6.5.2 | LAB-023 | Labor optimization engine |
| 6.5.3 | LAB-013 | AI-powered labor advisor |
| 6.5.4 | LAB-021 | Stress trend analysis with prediction |

### Stage 6.6: Advanced Advisor (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.6.1 | ADV-017 | Construction planning (22 room types) |
| 6.6.2 | ADV-018 | Trade cycle management (9 steps) |
| 6.6.3 | ADV-024 | Embark site evaluation |
| 6.6.4 | ADV-025 | Random embark with auto-restart |

---

## Phase 7: Polish & Production

**Goal**: Performance optimization, comprehensive testing, packaging, deployment, and documentation.

### Stage 7.1: Performance

**Duration**: 1 week

| Task | Description | Deliverable |
|------|-------------|-------------|
| 7.1.1 | Index optimization for all heavy queries (entity detail pages, search, event filtering) | SQL indexes |
| 7.1.2 | Query performance profiling and optimization (< 500ms for paginated, < 2s for complex JOINs) | Performance report |
| 7.1.3 | Map image caching (avoid regeneration) | Caching layer |
| 7.1.4 | Graph rendering optimization (progressive loading for large graphs) | UI optimization |
| 7.1.5 | Storyteller response latency optimization | LLM tuning |

### Stage 7.2: Testing

**Duration**: 1 week

| Task | Description | Deliverable |
|------|-------------|-------------|
| 7.2.1 | Expand test suite for all new entity types and detail pages | pytest additions |
| 7.2.2 | Add integration tests for storyteller agentic mode | Integration tests |
| 7.2.3 | Add E2E tests for explorer navigation flows | E2E tests |
| 7.2.4 | Add tests for Knowledge Horizon masking rules | KH tests |
| 7.2.5 | Load testing with large worlds (500K+ events) | Load test results |

### Stage 7.3: Packaging and Deployment

**Duration**: 0.5 weeks

| Task | Description | Deliverable |
|------|-------------|-------------|
| 7.3.1 | Python package configuration (pyproject.toml) | Package config |
| 7.3.2 | Docker containerization | Dockerfile |
| 7.3.3 | VM deployment scripts (bridge, HTTP server, SSH setup) | Deploy scripts |
| 7.3.4 | User documentation (installation, configuration, usage) | Docs |

### Stage 7.4: Documentation

**Duration**: 0.5 weeks

| Task | Description | Deliverable |
|------|-------------|-------------|
| 7.4.1 | API documentation (all endpoints) | API docs |
| 7.4.2 | CDM schema documentation (all tables, columns, relationships) | Schema docs |
| 7.4.3 | User guide (getting started, features, FAQ) | User guide |
| 7.4.4 | Developer guide (architecture, contributing, extending) | Dev guide |

---

## Appendix A: Priority Mapping

| Priority | Meaning | Phases |
|----------|---------|--------|
| P1 | Critical / v1.0 | Phases 1-4 |
| P2 | High Value | Phases 3-5 |
| P3 | Important | Phases 5-6 |
| P4 | Stretch / Future | Phase 6 (deferred stages), beyond |

## Appendix B: Milestone Definitions

| Milestone | Phase | Definition of Done |
|-----------|-------|--------------------|
| **M1: Data Complete** | Phase 1 ✓ | All 14+ XML sections parsed, 40+ CDM tables, post-parse pipeline running, all worlds re-ingested |
| **M2: Explorer Complete** | Phase 2 ✓ | All entity detail pages, global search, cross-linking, hover popovers, 114 event templates |
| **M3: Live Complete** | Phase 3 | Enhanced bridge, worldgen monitoring, Knowledge Horizon Phase 3, embedding pipelines (batch + live) |
| **M4: Storyteller v1.0** | Phase 4 | Agentic SQL mode, 132+ event templates, war/biography narratives, KH-storyteller integration |
| **M5: Visualization** | Phase 5 | Leaflet map, Chart.js demographics, Cytoscape family trees |
| **M6: Full Suite** | Phase 6 | Mod manager, labor manager, AI advisor all functional |
| **M7: Release** | Phase 7 | Performance optimized, fully tested, packaged, documented |

## Appendix C: Phase PRD File Mapping

The individual phase PRD files should be renamed to match the new phase numbering:

| New Phase | PRD File | Old Phase |
|-----------|----------|-----------|
| Phase 1 | `phase-1-data-foundation.md` | Phase 1 (unchanged) |
| Phase 2 | `phase-2-explorer-core.md` | Phase 2 (unchanged) |
| Phase 3 | `phase-3-live-integration.md` | Was Phase 5 (`phase-5-live-integration.md`) |
| Phase 4 | `phase-4-narrative-engine.md` | Was Phase 3 (`phase-3-narrative-engine.md`) |
| Phase 5 | `phase-5-visualization.md` | Was Phase 4 (`phase-4-visualization.md`) |
| Phase 6 | `phase-6-advanced-components.md` | Phase 6 (unchanged) |
| Phase 7 | `phase-7-polish-production.md` | Phase 7 (unchanged) |

> **Note**: PRD file renames should be performed as a follow-up task to avoid breaking existing references in completion reports and validation walkthroughs.

## Appendix D: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| DFHack version incompatibility (new DF release) | High | Pin to DFHack 53.10-r1; test on new versions before upgrading |
| TCP RPC remains broken under Prism | Medium | Already mitigated: dfhack-run SSH transport is primary |
| Large world performance (1M+ events) | Medium | Pagination, index optimization, materialized views |
| LLM hallucination in agentic mode | High | Read-only SQL, evidence citations, confidence signaling |
| Knowledge Horizon complexity | Medium | Phased rollout (4 phases); start with simple denizen-based masking |
| Mod compiler complexity | Low | Deferred to P4; core mod manager does not require compiler |
| Live data schema changes breaking templates | Medium | Moved Live Integration before Narrative Engine (v2.0 reorder) |
| Bridge Lua changes require VM testing | Medium | Structured test protocol with `dfhack-run` validation |

## Appendix E: Completed Work Summary

| Phase | Completion Date | Checks Passed | Key Deliverables |
|-------|----------------|---------------|------------------|
| Phase 1 | 2026-02-25 | 64/64 | 40+ CDM tables, 15+ XML sections, post-parse pipeline, creature dictionary |
| Phase 2 | 2026-03-03 | 50/50 | 17 entity detail pages, global search, 114 event templates, death cause renderer, monitoring dashboard |

---

*Chronicler Full Project Roadmap v2.0 -- 2026-03-04*
*7 Phases, 26 Stages, ~150 Tasks (2 phases complete)*
*Remaining estimated: 16-28 weeks*
