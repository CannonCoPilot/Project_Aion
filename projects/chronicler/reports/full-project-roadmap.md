# Chronicler -- Full Project Roadmap

**Version**: 4.0
**Date**: 2026-03-19
**Status**: Comprehensive end-to-end development outline (AI Storytelling Pipeline redesign + Autonomous Player Bot)
**Reference**: Product Requirements Document (product-requirements.md), Research Synthesis v2 (research-synthesis-v2.md), LVN Feature Comparison (lvn-comparison-and-enhancements.md)

---

## Roadmap Overview

The Chronicler project is organized into **7 development phases**, progressing from foundational data completeness through full application maturity. Each phase builds on the prior phase's deliverables. Within each phase, work is organized into stages that can be executed in parallel where dependencies allow.

### v4.0 Revision Notes (2026-03-19)

**AI Storytelling Pipeline & Autonomous Player Bot.** After firsthand observation of the fall of fortress Girderspriced (The Corridor of Heaven, Y250-251), fundamental insights about what makes DF stories compelling have driven a deep rearchitecture of Phases 3-7. Key changes:

- **Phase 3 gains 2 new stages** (3.5 Comprehensive Fortress State Capture, 3.6 Narrative Data Layer): The CDM must capture combat reports at full resolution, game announcements as narrative events, periodic fortress state snapshots (population, food, military, happiness, threats), and character development arcs. A new narrative data layer provides causal event linking, arc detection, and hierarchical summarization structures so downstream LLMs receive curated context rather than raw data dumps.

- **Phase 4 is significantly expanded** with a multi-model AI storytelling pipeline designed for local open-source LLMs (Qwen3 32B, GPT-OSS 120B) with limited context windows. New stages include: Fortress Saga Generator (multi-chapter narrative from fortress history), Narrative Quality & Tuning (evaluation framework, style presets, prompt optimization), and expanded agentic storyteller with hybrid structured+semantic context assembly.

- **Phase 6 gains Stage 6.8** (Autonomous Player Bot): A full decision-making framework for independent fortress management — strategic planning, tactical siege response, economy optimization, social management, and military deployment. Multiple autonomy modes from observe-only through full autonomous play.

- **Phase 7 gains Stage 7.5** (Multi-Platform Standalone Application): Electron/Tauri desktop wrapper, bundled local LLM management, embedded database option, DF auto-discovery, first-run wizard. Chronicler ships as a standalone app the user double-clicks and runs.

Total task count increases from ~200 to ~280. No time limits on development scope. The vision encompasses: history explorer, demographics tool, AI storyteller, mod manager, in-game advisor, and independent player bot.

### v3.0 Revision Notes (2026-03-18)

**LVN Comparison & Enhancement Integration.** After a comprehensive side-by-side comparison of Chronicler and Legends Viewer Next (see `lvn-comparison-and-enhancements.md`), **33 new enhancements** have been approved and integrated across Phases 3-6. Key additions include: interactive biome map with DFHack terrain data, army movement visualization, HF migration path tracking, territory animation, analytics dashboards (death stats, power rankings, world records), AI narrative generators, real-time event feed, and a fortress milestones tracker. Phase 5 gains a new Stage 5.5 (Map Enhancements) and Stage 5.6 (Analytics & Exploration). Quick Wins from the comparison are integrated as the first tasks within their respective phases. Phase durations updated to reflect expanded scope. Total task count increases from ~150 to ~200.

### v2.0 Revision Notes (2026-03-04)

**Phases 1-2 are COMPLETE.** Phase 3 (Narrative Engine) and Phase 5 (Live Integration) have been **swapped**. Live Integration is now Phase 3 because integrating live in-game data will likely introduce schema changes (new tables, modified columns for real-time state), which would cascade into narrative template and agentic schema rewrites. Stabilizing the schema with live data first avoids rework. Additionally, substantial narrative engine work was already completed during Phase 2 enhancements and early Phase 3 sessions (114 event templates, death cause renderer, circumstance/reason rendering, monitoring dashboard), reducing the remaining Narrative Engine scope.

```
Phase 1: Data Foundation — COMPLETE (2026-02-25, 64/64 checks)
Phase 2: Explorer Core — COMPLETE (2026-03-03, 50/50 checks)
Phase 3: Live Integration (bridge enhancements, worldgen, Knowledge Horizon, embedding pipelines, fortress state capture, narrative data layer)
Phase 4: Narrative Engine (multi-model AI storytelling pipeline, fortress saga generator, agentic SQL storyteller, war/biography generators, narrative quality & tuning)
Phase 5: Visualization (world map, charts, family trees, graphs, analytics dashboards, army/migration viz, fortress-centric visualizations)
Phase 6: Advanced Components (Mod Manager, Labor Manager, AI Advisor, achievements, milestones, autonomous player bot)
Phase 7: Polish & Production (performance, testing, standalone desktop app, multi-platform packaging, LLM management)
```

### Phase Dependencies

```
Phase 1 --> Phase 2 (explorer needs complete data) ✓ DONE
Phase 1 --> Phase 3 (live integration needs complete CDM) ✓ Phase 1 DONE
Phase 2 --> Phase 3 (KH needs entity detail pages for visibility toggle)
Phase 3 --> Phase 4 (narrative engine needs stable schema from live integration)
Phase 2 --> Phase 5 (visualizations sit on explorer pages)
Phase 3, Phase 4 --> Phase 6 (advanced components need live data + narrative)
Phase 3 (narrative data layer) --> Phase 4 (storytelling pipeline needs pre-processed narrative structures)
Phase 4 (storytelling pipeline) --> Phase 6.8 (autonomous player bot needs LLM integration patterns)
All --> Phase 7 (polish is last)
```

### Estimated Timeline

| Phase | Status | Estimated Duration | Actual/Cumulative |
|-------|--------|-------------------|-------------------|
| Phase 1 | **COMPLETE** | 3-4 weeks | Completed 2026-02-25 |
| Phase 2 | **COMPLETE** | 4-6 weeks | Completed 2026-03-03 |
| Phase 3 | Next | 6-8 weeks (+2 wk: fortress state capture, narrative data layer) | — |
| Phase 4 | Pending | 6-9 weeks (+3 wk: multi-model pipeline, saga generator, quality tuning) | — |
| Phase 5 | Pending | 6-9 weeks (+1 wk: fortress-centric visualizations) | — |
| Phase 6 | Pending | 10-15 weeks (+3 wk: autonomous player bot framework) | — |
| Phase 7 | Pending | 4-6 weeks (+2 wk: standalone desktop app, LLM management) | — |

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

#### Stage 3.1 Additions (LVN v3.0)

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.1.7 | LVN-P3-1 | Real-time event feed via WebSocket (eventful subscriptions → PerspectiveRenderer → SSE/WS push) | Event feed component |
| 3.1.8 | LVN-P3-2 | "Dwarf of the Day" highlight (random fortress dwarf with bio/stats/recent events) | Dashboard widget |
| 3.1.9 | LVN-P3-3 | Live army tracking placeholder (INVASION eventful → approaching army alert + composition sidebar) | Alert system |
| 3.1.10 | LVN-MAP | DFHack biome/terrain data extraction via bridge Lua (df.global.world.world_data.region_map elevation/rainfall/vegetation/temperature/evilness/drainage/biome per world tile) | Bridge function + JSON dump |

### Stage 3.2: Worldgen Monitoring — COMPLETE (2026-03-20)

**Duration**: 1 week

| Task | REQs | Description | Deliverable | Status |
|------|------|-------------|-------------|--------|
| 3.2.1 | ETL-012 | Create `worldgen-bridge.lua` (poll worldgen_status every 30 frames) | Lua script | DONE |
| 3.2.2 | ETL-012 | Implement auto-start via `dfhack.onStateChange.worldgen_monitor` | State hook | DONE |
| 3.2.3 | ETL-012 | Build Python worldgen snapshot ingester | Python module | DONE |
| 3.2.4 | VIS-008 | Implement worldgen live map preview (WebSocket push) | Frontend component | DEFERRED → Phase 5 (depends on Phase 4 map rendering; P3 priority) |
| 3.2.5 | ETL-012 | Build worldgen dashboard (phase progress, civilization counts, event curves) | Dashboard | DONE |

**Additional deliverables (beyond PRD)**: Historical backfill from Legends data (post-parse step 12), World Timeline page with interactive SVG chart, Year Detail drill-down API, CLI commands (`worldgen watch`, `worldgen backfill`, `worldgen history`), nav bar integration.

### Stage 3.3: Knowledge Horizon — COMPLETE (2026-03-20)

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable | Status |
|------|------|-------------|-------------|--------|
| 3.3.1 | KH-011 | Create `knowledge_horizon` table + `visible_*` views | SQL migration | DONE |
| 3.3.2 | KH-012 | Phase 1: Denizen registry as starting point for visibility | Initialization logic | DONE |
| 3.3.3 | KH-003 | Phase 2: Individual scope masking (fortress inhabitants + direct family) | Masking rules | DONE |
| 3.3.4 | KH-001 | Phase 3: Geographic scope masking (fortress region + revealed regions) | Masking rules | DONE |
| 3.3.5 | KH-002 | Phase 3: Civilization scope masking (parent civ + contacted civs) | Masking rules | DONE |
| 3.3.6 | KH-009 | CAV-006: Event-based revelation (wars, caravans, migrants, raids) | Event handlers | DONE |
| 3.3.7 | KH-004 | CAV-001: Organization membership propagation | Propagation rules | DONE |
| 3.3.8 | KH-005 | CAV-002: Nobles always visible | Exception rule | DONE |
| 3.3.9 | KH-010 | CAV-007: LLM inference restrictions (system prompt) | Prompt update | DONE (prompt defined; storyteller integration deferred to Phase 4) |
| 3.3.10 | — | Explorer KH toggle (on/off per session) | UI toggle | DONE |

**Additional deliverables**: CLI commands (`kh init/stats/clear`), API endpoints (`/api/kh/status`, `/api/kh/check`), search filtering via `_KH_VIEW_MAP`, detail page KH gate (5 entity types), watcher integration for live event revelation, popover KH passthrough.

### Stage 3.5: Comprehensive Fortress State Capture (v4.0)

**Duration**: 2 weeks

> **Design rationale**: Watching Girderspriced fall revealed that the story isn't just events — it's the *progression of state over time*. Population dwindling from 15→6→0, undead growing 43→45, the fortress sliding from functional to doomed. The CDM must capture periodic fortress state snapshots, combat reports at full resolution, and game announcements as narrative events, so the AI storytelling pipeline has the raw material to construct compelling narratives.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.5.1 | ETL-017 | Create `fortress_state_snapshots` table (world_id, tick, year, season, population, military_count, food_stocks, drink_stocks, wealth, happiness_distribution JSONB, threats JSONB, captured_at) with periodic capture every 200 ticks | SQL migration + bridge function |
| 3.5.2 | ETL-018 | Combat report ingestion pipeline — parse all `df.global.world.status.reports` entries into `combat_reports` table (world_id, report_id, tick, year, type, attacker_unit_id, defender_unit_id, body_part, attack_type, weapon, result_text, raw_text) | Lua extraction + Python ingester |
| 3.5.3 | ETL-019 | Game announcement parsing — capture announcement bubbles and report text into `game_announcements` table (world_id, announcement_id, tick, year, category, text, related_unit_ids JSONB, related_site_id) | Lua extraction + Python ingester |
| 3.5.4 | ETL-020 | Hostile entity tracking — periodic snapshot of all hostile units into `threat_tracking` table (world_id, tick, hostile_count, undead_count, invader_count, megabeast_count, threat_details JSONB) | Bridge function + table |
| 3.5.5 | ETL-021 | Character development tracking — per-unit periodic snapshots into `character_arcs` table (world_id, unit_id, tick, year, stress_level, happiness, skill_snapshot JSONB, profession, squad_id, notable_events_since_last JSONB) | Bridge delta detection + table |
| 3.5.6 | ETL-022 | Environmental state capture — season, weather indicators, temperature, fortress depth, map features discovered, into `environmental_state` table | Bridge function + table |
| 3.5.7 | ETL-023 | Death circumstance enrichment — full incident chain for each death: combat reports leading to death, attacker identity, weapon used, body part struck, witness units, into enriched `death_narratives` table | Incident chain resolver |
| 3.5.8 | ETL-024 | Session boundary markers — track game save/load/pause events as narrative chapter boundaries in `session_markers` table (world_id, tick, event_type, fortress_state_at_marker JSONB) | State hook + table |

### Stage 3.6: Narrative Data Layer (v4.0)

**Duration**: 2 weeks

> **Design rationale**: A Qwen3 32B model has a ~128K token context window. A fortress like Girderspriced generates thousands of events. The narrative data layer pre-processes raw CDM data into structures optimized for LLM consumption: scored events, detected arcs, hierarchical summaries, and causal chains. This is the bridge between "database of facts" and "material for storytelling."

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 3.6.1 | STR-033 | Create `narrative_events` table — enriched event records with narrative_weight (float), drama_score (float), irony_flags JSONB, emotional_tone TEXT, computed from event type + character context + outcome | SQL migration + scoring engine |
| 3.6.2 | STR-034 | Causal event linking — `event_causal_links` table (world_id, cause_event_id, effect_event_id, link_type TEXT, confidence FLOAT). Detect chains: death→military_weakened→more_deaths, invasion→siege→casualties | Causal chain detector |
| 3.6.3 | STR-035 | Narrative arc detection framework — `narrative_arcs` table (world_id, arc_id, arc_type TEXT, title TEXT, start_tick, end_tick, key_events JSONB, characters JSONB, resolution TEXT, dramatic_weight FLOAT). Arc types: siege_defense, tantrum_spiral, rise_and_fall, last_stand, golden_age, exploration, trade_prosperity | Arc detection engine |
| 3.6.4 | STR-036 | Hierarchical event summarization — `event_summaries` table at multiple granularities (world_id, scope TEXT, scope_id, granularity TEXT [year/season/arc/chapter], summary_text TEXT, key_events JSONB, generated_at). Pre-compute summaries using local LLM | Summary generator |
| 3.6.5 | STR-037 | Fortress timeline builder — `fortress_timeline` view joining events + state snapshots + combat reports + announcements into a unified chronological stream with narrative weight, queryable by time range and minimum importance | Materialized view + API |
| 3.6.6 | STR-038 | Character narrative profiles — `character_narratives` table (world_id, unit_id/hf_id, character_name, role_description TEXT, arc_summary TEXT, key_moments JSONB, personality_voice TEXT, ironic_dimensions JSONB). Pre-computed from unit data + events + arcs | Character profile generator |
| 3.6.7 | STR-039 | Narrative context assembler — Python module that, given a query type and parameters, assembles an optimal context window (structured facts + semantic matches + relevant arcs + character profiles) within a configurable token budget (default 32K) | Context assembly module |
| 3.6.8 | STR-040 | Event clustering — group temporally and causally related events into `event_clusters` (world_id, cluster_id, cluster_type, start_tick, end_tick, event_ids JSONB, summary TEXT). E.g., "The Undead Siege of Winter 251" clusters 47 combat/death/announcement events | Clustering algorithm |

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

**Goal**: Build the complete AI storytelling pipeline — from event templates through multi-model narrative generation. The crown jewel: given "tell me the story of fortress Girderspriced," the system generates a marvelously told tale of its epic struggles using a local open-source LLM (Qwen3 32B or GPT-OSS 120B). Complete event narratives, upgrade to agentic SQL mode, build war/biography/civilization/fortress saga generators, integrate Knowledge Horizon, and implement narrative quality evaluation.

**Entry State**: 114 event templates (built in Phase 2), death cause renderer, circumstance/reason rendering, monitoring dashboard, keyword-routed storyteller with 23 routes, stable schema + narrative data layer from Phase 3
**Exit State**: Multi-model AI storytelling pipeline, fortress saga generator producing multi-chapter narratives, agentic SQL storyteller, 132+ event templates, war/battle/biography/civilization narratives, KH-integrated storyteller, narrative quality evaluation framework, support for local LLMs (Qwen3 32B, GPT-OSS 120B) and cloud (Claude)

**PRD**: `reports/phases/phase-4-narrative-engine.md` (renamed from phase-3)

> **Reduced scope (templates)**: ~60% of the original template work was completed during Phase 2 enhancements. Remaining template work focuses on gap-fill to 132+.
>
> **Expanded scope (v4.0)**: The narrative engine now encompasses a full multi-model storytelling pipeline designed for local open-source LLMs with limited context windows. New stages: Fortress Saga Generator (multi-chapter fortress narratives), Narrative Quality & Tuning (evaluation, style presets, prompt optimization). The narrative data layer from Phase 3 Stage 3.6 provides pre-processed narrative structures (scored events, detected arcs, hierarchical summaries, causal chains) that the storytelling pipeline consumes.

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

### Stage 4.4: AI Narrative Generators (LVN v3.0)

**Duration**: 1-2 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.4.1 | LVN-P4-1 | AI-generated world summary on world load (aggregated stats + top events → LLM → cached 2-3 para overview) | World summary generator |
| 4.4.2 | LVN-P4-2 | Character obituary generator (newspaper-style obituary for dead HFs using template + optional LLM) | Obituary template |
| 4.4.3 | LVN-P4-3 | "This Year in History" summary (for any year: major events, births, deaths, wars, sites — template + optional LLM) | Year summary page |
| 4.4.4 | LVN-P4-4 | Notable events highlight reel (top 20 by importance score with AI prose) | Highlight reel page |

### Stage 4.5: Fortress Saga Generator (v4.0)

**Duration**: 2-3 weeks

> **Design rationale**: This is the crown jewel of the narrative engine. "Tell me the story of fortress Girderspriced" should produce a multi-chapter epic that captures the founding, the struggles, the personalities, the battles, and the fall — narrated with the emotional weight of watching it happen. The saga generator consumes pre-processed narrative structures from Phase 3 Stage 3.6 (arcs, clusters, character profiles, state snapshots) and feeds them chapter-by-chapter to a local LLM with carefully tuned prompts.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.5.1 | STR-041 | **Saga chapter planner** — Given a fortress, analyze narrative arcs and state snapshots to generate a chapter outline: founding, early days, first crisis, golden age, challenges, decline/triumph, epilogue. Each chapter has a focus (event cluster, character arc, or state transition), a narrative tone, and a token budget. | Chapter planner module |
| 4.5.2 | STR-042 | **Chapter context assembler** — For each chapter, assemble an optimal LLM context: relevant events (scored by narrative weight), character profiles for key figures, fortress state at chapter boundaries, combat report excerpts, announcement quotes, causal chains. Respects configurable token budget (default 24K per chapter for Qwen3 32B). | Per-chapter context builder |
| 4.5.3 | STR-043 | **Multi-model narrative generator** — Execute chapter generation against configurable LLM backends: local (Qwen3 32B via Ollama, GPT-OSS 120B via LiteLLM) or cloud (Claude). Each model gets tailored prompt templates optimized for its strengths. Stream chapters as they generate. | Model-agnostic generator |
| 4.5.4 | STR-044 | **Character voice generation** — For chapters focused on individual characters, generate prose in a voice informed by the character's personality (50 facets), profession, and history. A necromancer expedition leader narrates differently than a cheerful brewer. | Character voice module |
| 4.5.5 | STR-045 | **Combat scene generator** — Transform combat report chains into vivid prose: blow-by-blow action, weapon descriptions, injury details, the momentum of a fight. Uses raw combat report text as source material. | Combat prose generator |
| 4.5.6 | STR-046 | **Environmental/atmospheric prose** — Generate scene-setting prose from fortress state snapshots + environmental state: "The winter of Year 251 pressed down on the Corridor of Heaven like a funeral shroud. Outside, 45 shambling corpses circled the walls..." | Atmospheric prose module |
| 4.5.7 | STR-047 | **Saga compilation and formatting** — Assemble generated chapters into a complete saga document with table of contents, character index, timeline sidebar, and cross-links to entity detail pages. Output formats: HTML (for web display), Markdown, PDF. | Saga compiler |
| 4.5.8 | STR-048 | **Incremental saga updates** — For ongoing fortresses, generate new chapters as significant events occur. Detect when a new chapter is warranted (major battle, population milestone, leadership change, fortress fall). WebSocket push notification when new chapter is ready. | Live saga updater |

### Stage 4.6: Narrative Quality & Tuning (v4.0)

**Duration**: 1-2 weeks

> **Design rationale**: Different users want different narrative styles, and different LLMs produce different quality. This stage builds the framework for evaluating, tuning, and personalizing narrative output.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.6.1 | STR-049 | **Factual accuracy checker** — Post-generation validation that all named entities, dates, events, and relationships mentioned in generated narrative actually exist in the CDM. Flag hallucinations. Score: 0-100% factual accuracy. | Accuracy checker module |
| 4.6.2 | STR-050 | **Narrative coherence scorer** — Evaluate generated text for internal consistency, temporal ordering, character consistency, and logical flow. Uses a smaller local LLM (Qwen3 8B) as evaluator. | Coherence scorer |
| 4.6.3 | STR-051 | **Narrative style presets** — Library of prompt templates for different narrative styles: Epic Saga (Tolkien-esque), War Correspondent (journalistic), Personal Diary (first-person), Academic History (dry, factual), Bardic Tale (oral tradition), Dark Comedy (ironic). User selects per-query or per-fortress. | Style preset library |
| 4.6.4 | STR-052 | **Prompt optimization pipeline** — A/B testing framework for narrative prompts. Generate N variants, score each on factual accuracy + coherence + style adherence, select best-performing prompts per model per style. Store winning prompts in `narrative_prompts` table. | Prompt optimization framework |
| 4.6.5 | STR-053 | **User feedback integration** — Thumbs up/down on generated narratives stored in `narrative_feedback` table. Aggregate feedback to identify weak prompt templates, problematic event types, and model-specific failure modes. | Feedback system |
| 4.6.6 | STR-054 | **Narrative caching and versioning** — Cache generated narratives in `generated_narratives` table (world_id, scope, scope_id, style, model, narrative_text, quality_score, generated_at). Re-generate only when underlying data changes. Version history for iterative improvement. | Narrative cache |

### Stage 4.8: Monitoring Enhancements

**Duration**: 0.5 weeks

**Pre-completed work** (from Phase 2):
- [x] Monitoring dashboard (`/monitoring`) with interaction list, summary stats, detail view
- [x] Per-interaction logging (`storyteller_log` table)

**Remaining work**:

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.8.1 | STR-028 | Enhance logging with four-phase latency tracking (context, TTFT, LLM, SSE) | Logging improvements |
| 4.8.2 | STR-029 | Add agentic-mode metrics (SQL query count, SQL total time, per-query stats) | Dashboard enhancements |
| 4.8.3 | STR-055 | Add saga generation metrics (chapters generated, avg quality score, model comparison, token usage per chapter) | Saga monitoring dashboard |
| 4.8.4 | STR-056 | Add narrative quality dashboard (accuracy scores over time, coherence trends, user feedback aggregation, prompt performance comparison) | Quality monitoring page |

---

## Phase 5: Visualization

**Goal**: Build the interactive world map, charts, family trees, analytics dashboards, army/migration visualizations, and all data visualizations. Incorporates 22 enhancements from the LVN comparison (v3.0).

**Entry State**: vis.js graph tab (partially built), no maps or charts
**Exit State**: Leaflet world map with biome terrain, Chart.js demographics + analytics dashboards, Cytoscape family trees, D3 war diagrams, army movement & HF migration path visualization, territory animation, power rankings

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
| 5.1.8 | LVN-P5-22 | Biome explorer layer (region terrain coloring from DFHack bridge data + click for biome details) | Map layer |
| 5.1.9 | LVN-MAP | Terrain base map generation from DFHack biome data (elevation/rainfall/vegetation/temperature → terrain-colored tiles) | Map generator |

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
| 5.4.7 | LVN-P5-7 | War chord diagram (D3.js ribbon, chord width ∝ war count between civs) | D3 component |
| 5.4.8 | LVN-P5-11 | Alliance network graph (Cytoscape.js force-directed, entity_entity_links) | Graph component |
| 5.4.9 | LVN-P5-17 | Curse lineage tree (vampire/werebeast infection chains, Patient Zero tracing) | Lineage component |
| 5.4.10 | LVN-P5-19 | HF relationship web (social network N-hop, extends ego-network with vague relationships) | Graph component |

### Stage 5.5: Map Enhancements (LVN v3.0)

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.5.1 | LVN-P5-8 | Territory animation over time (convex hull expansion/contraction, year slider, play button) | Animation system |
| 5.5.2 | LVN-P5-14 | HF migration path visualization ("Journey Map" tab on HF detail, numbered waypoints, 6 color-coded movement types, timeline scrubber) | Map + tab component |
| 5.5.3 | LVN-P5-21 | Army movement & war visualization (animated polylines on map — red attacker/blue defender, battle markers, campaign trails) | War map layer |
| 5.5.4 | LVN-P5-15 | Migration heatmap (Leaflet.heat plugin, HF concentration density over time) | Map overlay |
| 5.5.5 | LVN-P5-16 | Underground explorer (cavern depth layers, site filtering by depth tier) | Map mode |
| 5.5.6 | LVN-P5-18 | Religious spread map (animated overlay of religion geographic expansion via entity_entity_links RELIGIOUS + temple structures) | Map overlay |
| 5.5.7 | LVN-P5-20 | River system tracer (interactive polyline following river paths with tributary connections and site proximity) | Map layer |
| 5.5.8 | LVN-7.2 | Trade route inference (connect capital sites of trading civs, dashed lines, thickness ∝ trade event frequency) | Map layer |

### Stage 5.6: Analytics, Dashboards & Exploration (LVN v3.0)

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.6.1 | LVN-P5-10 | Power rankings dashboard (ranked civs by population/sites/military/culture, sparkline trends, configurable metrics) | Dashboard page |
| 5.6.2 | LVN-QW-2 | Death statistics dashboard (deaths by cause pie, by race bar, deadliest years line, deadliest sites, most prolific killers) | Dashboard page |
| 5.6.3 | LVN-QW-3 | World records & superlatives page (oldest HF, largest battle, longest war, most prolific author, etc.) | Page |
| 5.6.4 | LVN-QW-4 | "Most Interesting" rankings (top entities by prominence_score/salience_score with drill-down) | Page |
| 5.6.5 | LVN-QW-5 | Megabeast tracker (megabeasts/FBs/titans: status, kill count, location, associated events, map overlay) | Page |
| 5.6.6 | LVN-P5-9 | Population trend lines (multi-series line chart: civ pop over time derived from birth/death events, war period overlays) | Chart component |
| 5.6.7 | LVN-P5-12 | Civilization comparison view (side-by-side radar chart comparison of 2+ civs) | Comparison page |
| 5.6.8 | LVN-P5-13 | Rivalry tracker (identify intense rivalries via war/battle/casualty aggregation) | Analytics page |
| 5.6.9 | LVN-QW-1 | Dedicated event collection list views (wars, battles, raids, etc. with type-specific columns and filtering) | List pages |
| 5.6.10 | LVN-QW-6 | Art form gallery (card layout browser for dance/musical/poetic forms) | Gallery page |
| 5.6.11 | LVN-QW-7 | Written content library (browsable library with author, style, reference links) | Library page |
| 5.6.12 | LVN-QW-8 | Era browser with event density bars (horizontal era bars with event density heatmap) | Browser page |
| 5.6.13 | LVN-7.5 | World timeline browser (full-page chronological timeline, importance-sized event cards, filterable) | Timeline page |

### Stage 5.7: Fortress-Centric Visualizations (v4.0)

**Duration**: 2-3 weeks

> **Design rationale**: The fortress is the emotional center of a DF experience. These visualizations tell the fortress's story visually — complementing the AI-generated sagas from Phase 4 with interactive visual timelines, character arc charts, and combat replays that let the user *see* the narrative unfold.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.7.1 | VIS-025 | **Fortress timeline** — unified interactive timeline combining events, state snapshots, combat reports, and announcements on a zoomable time axis. Markers colored by event type (combat=red, social=blue, economic=green, death=black). Hover for detail, click for full event. Fortress state line overlay (population, food, military) | Timeline component |
| 5.7.2 | VIS-026 | **Character arc charts** — per-character interactive chart showing stress level, skill progression, and key life events over time. Sparkline mini-versions on labor manager roster. Full-page version on character detail. Overlay combat injuries, mood changes, and profession changes as markers. | Chart component |
| 5.7.3 | VIS-027 | **Fortress vital signs history** — multi-series area chart of population, food/drink stocks, military strength, average happiness, and wealth over the fortress's lifetime. War/siege periods highlighted as shaded bands. Annotated with major events (first death, first siege, population milestones). | Dashboard chart |
| 5.7.4 | VIS-028 | **Combat encounter replay** — step-through visualization of combat reports for a specific encounter. Shows attacker/defender, weapon, body part, injury result per report tick. Animated sequence with play/pause. Embedded in death detail and battle detail pages. | Combat replay component |
| 5.7.5 | VIS-029 | **Narrative arc visualization** — visual representation of detected narrative arcs (from Stage 3.6) as interweaving threads on a timeline. Each arc is a colored band; thickness represents dramatic intensity. Character involvement shown as dots on arc threads. Click arc to read AI-generated chapter. | Arc visualization |
| 5.7.6 | VIS-030 | **Fortress saga reader** — dedicated page for reading AI-generated fortress sagas (from Stage 4.5). Book-like interface with chapter navigation, inline entity links, embedded mini-visualizations (state charts at chapter boundaries), and "regenerate" button per chapter with style selector. | Saga reader page |
| 5.7.7 | VIS-031 | **Threat escalation timeline** — visualization of hostile entity counts over time (undead, invaders, megabeasts). Rising red bars during siege periods. Overlaid with fortress population for dramatic contrast (e.g., the scissors closing as threats rise and population falls). | Threat chart |

---

## Phase 6: Advanced Components

**Goal**: Build the Mod Manager, Labor Manager, AI Fortress Advisor, achievement system, fortress milestones, and autonomous player bot as integrated Chronicler components. The player bot represents the ultimate evolution: an AI that can independently manage a fortress, making strategic decisions, responding to crises, and creating stories worth telling.

**Entry State**: No mod management, no labor management, no advisor
**Exit State**: Core mod manager, labor grid with skill tracking, LLM-enhanced advisor, achievement/milestone tracking, fortress health dashboard, autonomous player bot with multi-mode operation (observe/advise/semi-auto/full-auto)

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

### Stage 6.4: Gamification & Live Analytics (LVN v3.0)

**Duration**: 2-3 weeks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 6.4.1 | LVN-P6-1 | Fortress health dashboard (vital signs: population, food, military, happiness, wealth — live bridge polling) | Dashboard page |
| 6.4.2 | LVN-P6-3 | Achievement system (world-level achievements with badges: "First Blood", "Master Smith", pattern detection across event tables; new `achievements` table) | Achievement engine |
| 6.4.3 | LVN-P6-4 | Fortress milestones tracker (first caravan, first siege, first noble, etc.; live event pattern matching; new `fortress_milestones` table) | Milestone tracker |
| 6.4.4 | LVN-P6-5 | Trade route inference visualization (connect trading civ capitals, map overlay with frequency-weighted lines) | Map + analytics |
| 6.4.5 | LVN-P6-2 | Prediction engine (forecast likely events from historical patterns + fortress metrics, statistical modeling) | Prediction module |

### Stage 6.5: Autonomous Player Bot (v4.0)

**Duration**: 4-6 weeks

> **Design rationale**: The autonomous player bot is the capstone of the Chronicler system — an AI that doesn't just observe and narrate, but actively plays Dwarf Fortress. It leverages every system built in prior phases: live data streaming (Phase 3), narrative intelligence (Phase 4), fortress visualization (Phase 5), and labor/military/advisor infrastructure (Phase 6.1-6.4). Multiple autonomy modes let the user choose their level of involvement, from passive observation to full AI control. The bot creates its own stories worth telling.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 6.5.1 | BOT-001 | **Autonomy mode framework** — Four modes: `observe` (watch + narrate only), `advise` (recommend actions, user executes), `semi-auto` (bot executes routine tasks, user handles crises), `full-auto` (bot handles everything, user watches). Mode switchable at any time. Safety constraints per mode. | Mode framework |
| 6.5.2 | BOT-002 | **World state perception layer** — Unified fortress perception model combining all bridge data streams into a single coherent world state: population, military, economy, threats, social dynamics, environmental conditions. Updated every 100 ticks. Detects state transitions (peace→siege, stable→crisis). | Perception model |
| 6.5.3 | BOT-003 | **Strategic planning engine** — Long-term goal management: establish food security, build military, expand living quarters, develop industry chains, prepare defenses. Goals have prerequisites, priorities, and completion criteria. LLM generates strategic plans from fortress state + game knowledge. | Strategic planner |
| 6.5.4 | BOT-004 | **Tactical response system** — Real-time crisis response: siege detected → activate military, seal fortress, assign civilians to burrows; tantrum spiral → identify cause, isolate dangerous dwarves, address needs; food shortage → prioritize farming, enable gathering, ration drinks. Response templates + LLM adaptation. | Tactical responder |
| 6.5.5 | BOT-005 | **Economy management module** — Production chain optimization: identify resource gaps, queue work orders, manage stockpiles, optimize workshop assignments. Track input→output chains (ore→bar→weapon). Balance production priorities against strategic goals. | Economy module |
| 6.5.6 | BOT-006 | **Social management module** — Happiness optimization: identify stressed dwarves, recommend need satisfaction (tavern, temple, library, artifact display), manage room assignments for quality, prevent tantrum spirals. Personality-aware recommendations. | Social module |
| 6.5.7 | BOT-007 | **Military management module** — Squad composition, training schedules, equipment assignment, deployment orders. Threat-proportional military sizing. XP-based draft selection. Patrol routes and guard posts. Siege defense deployment with fallback positions. | Military module |
| 6.5.8 | BOT-008 | **Action execution layer** — Translate high-level decisions into DFHack Lua commands. Action queue with priority, dependency tracking, and rollback capability. Safety checks before execution (never issue a command that could crash the game). Rate limiting to avoid overwhelming DFHack. | Action executor |
| 6.5.9 | BOT-009 | **Decision logging and explanation** — Every bot decision logged to `bot_decisions` table (world_id, tick, decision_type, reasoning TEXT, action_taken, outcome, confidence). User can review reasoning for any action. "Why did you do X?" query support. | Decision audit trail |
| 6.5.10 | BOT-010 | **Narrative self-awareness** — The bot is aware of the story it's creating. It can choose to take dramatically interesting actions over purely optimal ones (configurable: `pragmatic` vs `dramatic` personality). E.g., sending the legendary axedwarf on a solo mission rather than the optimal squad. | Narrative personality |
| 6.5.11 | BOT-011 | **Multi-fortress management** — Support running bot across multiple fortresses (e.g., auto-start new fortress on loss with REQ-ADV-025). Track fortress lineage and cross-fortress narrative continuity. | Multi-fortress support |
| 6.5.12 | BOT-012 | **Bot dashboard** — Real-time UI showing bot status: current goal, active tasks, recent decisions with reasoning, threat assessment, resource status. Manual override buttons for each subsystem. Emergency stop button. | Bot control panel |

### Stage 6.6: Advanced Mod Management (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.6.1 | MOD-008 | Level 2 conflict detection (object ID) |
| 6.6.2 | MOD-012 | Raw file tokenizer |
| 6.6.3 | MOD-013 | Three-way file merge |
| 6.6.4 | MOD-015 | Full raw compiler |
| 6.6.5 | MOD-019 | Steam Workshop integration |

### Stage 6.7: Advanced Labor Management (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.7.1 | LAB-014 | Skill-based labor auto-assignment |
| 6.7.2 | LAB-023 | Labor optimization engine |
| 6.7.3 | LAB-013 | AI-powered labor advisor |
| 6.7.4 | LAB-021 | Stress trend analysis with prediction |

### Stage 6.8: Advanced Advisor (Deferred/P4)

| Task | REQs | Description |
|------|------|-------------|
| 6.8.1 | ADV-017 | Construction planning (22 room types) |
| 6.8.2 | ADV-018 | Trade cycle management (9 steps) |
| 6.8.3 | ADV-024 | Embark site evaluation |
| 6.8.4 | ADV-025 | Random embark with auto-restart |

---

## Phase 7: Polish & Production

**Goal**: Performance optimization, comprehensive testing, multi-platform standalone desktop application packaging, local LLM model management, and comprehensive documentation. Chronicler ships as a double-click-and-run application that works across Windows, Linux, and macOS.

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

### Stage 7.5: Multi-Platform Standalone Application (v4.0)

**Duration**: 2-3 weeks

> **Design rationale**: The overriding rule from CLAUDE.md: "No Phase complete unless a fully stand-alone executable exists, packaged to run hands-off, user-controlled." Chronicler must ship as a desktop application the user can download and run without terminal commands, Docker knowledge, or database administration. This stage wraps the entire system in a cross-platform desktop shell with bundled services.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 7.5.1 | **Desktop application shell** — Tauri (Rust) or Electron wrapper around Chronicler's web UI. System tray icon, native window management, auto-start capability. Tauri preferred for smaller bundle size (~10MB vs ~150MB Electron). | Desktop app shell |
| 7.5.2 | **Bundled PostgreSQL** — Embedded PostgreSQL (pg_embed or embedded-postgres) that starts with the app and stores data in `~/.chronicler/data/`. No external database installation required. Migration runner on first launch and upgrades. | Embedded database |
| 7.5.3 | **Local LLM model manager** — UI for downloading, selecting, and running local LLM models. Supported backends: Ollama (auto-install + model pull), llama.cpp (GGUF files), MLX (Apple Silicon). Model recommendations based on user's hardware (RAM, GPU). Default: Qwen3 32B Q4 for 32GB+ RAM systems, Qwen3 8B for 16GB systems. | Model manager UI |
| 7.5.4 | **DF installation auto-discovery** — Scan common DF installation paths per platform (Steam default, GOG, manual install). Windows: Program Files, Steam library folders. Linux: ~/.steam, ~/.local/share. macOS: UTM VM detection. Configuration wizard if auto-discovery fails. | DF finder module |
| 7.5.5 | **First-run wizard** — Guided setup on first launch: (1) detect DF installation, (2) choose or download LLM model, (3) initial world ingestion from legends XML, (4) optional bridge deployment to DF/DFHack. Progress indicators for each step. | Setup wizard |
| 7.5.6 | **Auto-update system** — Check for new Chronicler versions on startup. Download and apply updates without losing user data. Semantic versioning with migration support. | Update system |
| 7.5.7 | **Platform-specific installers** — Windows: MSI/NSIS installer with Start Menu shortcut. macOS: DMG with drag-to-Applications. Linux: AppImage + .deb + .rpm. All include bundled Python runtime, PostgreSQL, and default configuration. | Platform installers |
| 7.5.8 | **Cloud LLM integration** — Optional connection to cloud LLM APIs (Claude, OpenAI) for users who prefer cloud inference. API key management in settings. Automatic fallback to cloud when local model produces low-quality output. | Cloud LLM connector |

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
| **M3: Live Complete** | Phase 3 | Enhanced bridge, worldgen monitoring, Knowledge Horizon Phase 3, embedding pipelines, real-time event feed, biome data extraction, fortress state capture (snapshots, combat reports, announcements, threat tracking), narrative data layer (scored events, causal chains, arc detection, hierarchical summaries, character profiles, context assembler) |
| **M4: Storyteller v1.0** | Phase 4 | Multi-model AI storytelling pipeline, fortress saga generator (multi-chapter narratives), agentic SQL mode, 132+ event templates, war/biography/civilization narratives, KH-storyteller integration, AI world summary, obituary generator, narrative quality evaluation, style presets (6+ styles), prompt optimization, local LLM support (Qwen3 32B, GPT-OSS 120B) |
| **M5: Visualization** | Phase 5 | Leaflet map with biome terrain, Chart.js demographics, Cytoscape family trees, army movement viz, HF migration paths, territory animation, analytics dashboards, fortress timeline, character arc charts, vital signs history, combat encounter replay, narrative arc visualization, saga reader, threat escalation timeline |
| **M6: Full Suite** | Phase 6 | Mod manager, labor manager, AI advisor, achievement system, fortress milestones, fortress health dashboard, autonomous player bot (4 autonomy modes: observe/advise/semi-auto/full-auto, strategic planning, tactical response, economy/social/military management, decision audit trail, narrative self-awareness) |
| **M7: Release** | Phase 7 | Performance optimized, fully tested, multi-platform standalone desktop application (Windows/Linux/macOS), bundled PostgreSQL, local LLM model manager, DF auto-discovery, first-run wizard, platform-specific installers, comprehensive documentation |

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
| DFHack biome data access via SSH bridge | Low | df.global.world.world_data accessible via Lua; fallback to region-type proxy if unavailable |
| Phase 5 scope expansion (33 enhancements) | Medium | Staged delivery: core P1/P2 first, then P3 optional enhancements; Quick Wins interleaved for morale |
| Local LLM quality for fortress sagas | High | Multi-model support with cloud fallback; narrative quality evaluation auto-selects best model; prompt optimization pipeline improves over time |
| Autonomous player bot safety | High | Four-mode framework with emergency stop; action execution has safety checks and rate limiting; decision audit trail for debugging; never issue commands that could crash DF |
| Context window limitations for narrative | Medium | Narrative data layer pre-processes events into curated context; hierarchical summarization at multiple granularities; configurable token budgets per chapter; hybrid structured+semantic retrieval |
| Desktop app packaging complexity | Medium | Tauri preferred over Electron for size; bundled PostgreSQL via pg_embed; platform-specific installers with CI/CD automation |
| Combat report volume | Low | Combat reports can be very numerous; sampling + importance scoring prevents table bloat; archive old reports to compressed storage |
| Multi-fortress bot management | Medium | State machine per fortress; shared strategic knowledge but independent tactical decisions; fortress lineage tracking |

## Appendix E: Completed Work Summary

| Phase | Completion Date | Checks Passed | Key Deliverables |
|-------|----------------|---------------|------------------|
| Phase 1 | 2026-02-25 | 64/64 | 40+ CDM tables, 15+ XML sections, post-parse pipeline, creature dictionary |
| Phase 2 | 2026-03-03 | 50/50 | 17 entity detail pages, global search, 114 event templates, death cause renderer, monitoring dashboard |

---

*Chronicler Full Project Roadmap v4.0 -- 2026-03-19*
*7 Phases, 38 Stages, ~280 Tasks (2 phases complete, 33 LVN enhancements + AI Storytelling Pipeline + Autonomous Player Bot + Standalone App)*
*Vision: History explorer, demographics tool, AI storyteller, mod manager, in-game advisor, independent player bot*
*No time limits on development scope*
