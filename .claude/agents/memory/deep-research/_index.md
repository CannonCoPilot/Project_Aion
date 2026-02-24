
## OpenClaw Design Philosophy Analysis (2026-02-05)

**Research Scope**: Comprehensive analysis of OpenClaw's architectural excellence, reliability engineering, and automation philosophy.

**Key Findings**:

1. **Default Serial, Explicit Parallel**: OpenClaw's lane-based concurrency prevents state corruption through serial execution by default
2. **Gateway Pattern**: Single WebSocket server acts as control plane for all channels (WhatsApp, Telegram, etc.)
3. **Hybrid Memory**: JSONL audit trails + Markdown long-term knowledge for transparency and auditability
4. **Fail-Safe Config**: Gateway refuses to start on invalid configuration (schema validation)
5. **Pre-Compaction Memory Flush**: Key facts written to disk before context compression

**Critical Anti-Patterns Observed**:
- Vibe coding (shipping unreviewed AI-generated code) → security vulnerabilities
- Shared session state (dmScope="main") → catastrophic for multi-user
- Race conditions despite serial-default (async I/O still creates races)

**Jarvis Applications**:
- Enhance JICM to flush to Memory MCP before `/intelligent-compress`
- Add config schema validation for `session-state.md`
- Implement lane-based execution for main/cron/R&D queues
- Add token/cost tracking per session
- Formalize session state machine

**Reports**:
- Full analysis: `.claude/reports/research/openclaw-design-philosophy-2026-02-05.md`
- Key takeaways: `.claude/reports/research/openclaw-key-takeaways.md`

**Sources**: 29 references including official docs, GitHub issues, architecture analyses, and founder interviews.


## [chronicler-df-memory-audit-2026-02-23](chronicler-df-memory-audit-2026-02-23.md)
**Date**: 2026-02-23
**Topic**: Chronicler/DF Memory System Audit — Qdrant + Graphiti comprehensive query
**Key Finding**: DwarfCron product code NOT indexed in any memory system; Graphiti has high-level Session 32 validation facts; 14 Qdrant collections queried with full gap inventory
**Status**: Complete

## [legendsviewer-next-research-2026-02-23](../../../../../../projects/chronicler/reports/research/legendsviewer-next-research.md)
**Date**: 2026-02-23
**Topic**: LegendsViewer-Next — .NET 8 + Vue 3 DF legends viewer — full code-level analysis
**Key Findings**:
- 70 routes (35 list + 35 detail views), 8 navigation groups
- 115 distinct WorldEvent types + 19 EventCollection types (complete taxonomy extracted)
- Streaming async XmlReader with FilteredStream (non-printable char removal)
- XmlPlusParser merges legends_plus.xml by id-matching properties
- Leaflet.js map with L.CRS.Simple, civilization-colored polygon markers, layer control per owner
- Cytoscape.js dagre family tree (3-ancestor depth limit, 5 HF-type node classes)
- Cytoscape.js cola warfare graph with tippy.js edge tooltips
- Chart.js line/bar (event timelines) + doughnut (population/area) charts
- Pervasive server-generated HTML anchor cross-linking via v-html
- Vuetify 3 + Pinia stores, server-side paginated search
**Status**: Complete
**Report**: `projects/chronicler/reports/research/legendsviewer-next-research.md`

## [narrator-weblegends-research-2026-02-23](narrator-weblegends-research-2026-02-23.md)
**Date**: 2026-02-23
**Topic**: df-narrator + weblegends deep source analysis for Chronicler product requirements
**Key Findings**:
- df-narrator scoring formulas (figure/site/conflict/artifact) are production-ready and should be adopted verbatim
- weblegends handles 94 distinct DF event types, each with specific field rendering — gold standard event taxonomy
- hist_figure_died handles 40+ death cause variants with precise prose
- weblegends uses direct DFHack memory access (no XML), shows live game state not available in exports
- HF_FIELDS set (19 field names) is the canonical list of event fields referencing historical figure IDs
- circumstance/reason rendering adds 6+4 context types to events (dreamed of, prayed to, in order to glorify, etc.)
- Event context suppresses self-links when rendering an entity's own history page
**Report**: `projects/chronicler/reports/research/narrator-weblegends-research.md` (638 lines)
**Status**: Complete

## [legends-browsers-research-2026-02-23](../../../../../../projects/chronicler/reports/research/legends-browsers-research.md)
**Date**: 2026-02-23
**Topic**: LegendsBrowser (Java, DF 0.44) + LegendsBrowser2 (Go, DF 0.47) — full source code analysis
**Key Findings**:
- LegendsBrowser2 handles 132 event types (complete list extracted), each with Html(*Context) narrative rendering
- Custom byte-level Go XML tokenizer (not encoding/xml) for performance; model.go is code-generated (1.3MB)
- 35+ distinct page routes with popover system (synchronous Ajax /popover/{type}/{id})
- EventList factory + RelatedTo* interface enables any entity to list all events mentioning it
- Perspective-aware rendering via Context{HfId} (pronoun/relational text changes based on viewer)
- LegendsBrowser v1 (Java) has unique features: SVG family tree with layout algorithm, curse lineage tree, D3 population donut, D3 war chord diagram
- Processing pipeline: 6-stage post-parse (vampire/werebeast marking, entity sites, ruin status, kill lists, collection summaries, race inference)
- Leaflet.js map with L.CRS.Simple, entity-colored site polygons, region outlines, evilness color fill
- Collection types: 19 types (war, battle, beast_attack, abduction, duel, entity_overthrown, insurrection, journey, occasion, ceremony, competition, performance, procession, persecution, purge, raid, site_conquered, theft)
**Status**: Complete
**Report**: `projects/chronicler/reports/research/legends-browsers-research.md` (1023 lines, 45KB)

## [dfhack-infrastructure-research-2026-02-23](../../../../../../projects/chronicler/reports/research/dfhack-infrastructure-research.md)
**Date**: 2026-02-23
**Topic**: DFHack infrastructure repos (dfhack-client-python, DwarfFortressLogger, df-structures, DwarvenSurveyor, myDFHackScripts) — complete source analysis
**Key Findings**:
- RPC protocol: binary TCP port 5000, 8-byte frames (int16 ID + int32 size), protobuf payload; requires CoreBindRequest before each method
- RemoteFortressReader NOT available on HomeServer — only core DFHack RPC + Lua execution viable
- Memory reading (Dwarf Therapist) requires same-machine OS access — not viable for remote HomeServer
- df-structures XML: complete field definitions for historical_figure (50+ fields), 144 history_event_type values, unit_soul, unit_personality
- myDFHackScripts demonstrates: eventful plugin event subscriptions (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, INVASION), dfhack.timeout polling (500 ticks), df.global.world.incidents.all for death cause/killer lookup
- DwarvenSurveyor: Unity3D reads standard legends.xml + legends_plus.xml (exportlegends); same XML format Chronicler parses
- Key Lua paths: df.global.world.units.active, .status.reports, .agreements.all, .incidents.all, .history.figures, .history.events
- HF profile is lazy-loaded: hf.info pointer may be nil; check before accessing skills/personality/kills/whereabouts
- During worldgen: hf.worldgen_site/region/relationships pointers are non-null; histfig_flags.worldgen_acted tracks activity
**Status**: Complete
**Report**: `projects/chronicler/reports/research/dfhack-infrastructure-research.md`
