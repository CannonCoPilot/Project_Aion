# Current Plans

## Project Vision

**Chronicler** is a standalone, installable, multi-platform desktop application that runs alongside a player's local Dwarf Fortress game on **Windows**, **Linux**, or **macOS** (via emulators like UTM). It is a living record and AI storyteller that transforms raw game data into browsable, cross-linked, narratively rich histories. The ultimate deliverable is a packaged application the User can run hands-off with no special handling by Jarvis.

**Product Code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Dev Artifacts**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/`

---

## Canonical Planning Documents

Single source of truth for all Chronicler development. Consult in this order:

| Document | Path | Purpose |
|----------|------|---------|
| **Product Requirements** | `projects/chronicler/reports/product-requirements.md` | ~200+ requirements, REQ-IDs, priorities, DFHack reference |
| **Full Project Roadmap** | `projects/chronicler/reports/full-project-roadmap.md` | 7 phases, 26 stages, ~150 tasks, milestones, risk register |
| **Phase PRDs** (7 docs) | `projects/chronicler/reports/phases/phase-{1-7}-*.md` | Detailed per-phase PRD/Roadmap with code examples |
| **Research Synthesis** | `projects/chronicler/reports/research-synthesis-v2.md` | All repo research, event taxonomy, implementation patterns |
| **Planning History** | `projects/chronicler/reports/planning-history.md` | Consolidated history of all design decisions |
| **Dev Environment** | `projects/chronicler/reports/dev-environment-reference.md` | UTM VM, DFHack, SSH, deployment procedures |
| **Skill Review** | `projects/chronicler/reports/skill-review.md` | Relevant Jarvis skills and patterns for this project |

---

## Phase Progress

| Phase | Name | Status | Milestone |
|-------|------|--------|-----------|
| 1 | Data Foundation | COMPLETE (64/64 checks) | M1 -- Data Complete |
| **2** | **Explorer Core** | **COMPLETE (30/30 checks)** | **M2 -- Explorer Complete** |
| 3 | Narrative Engine | Pending | M3 -- Narrative Complete |
| 4 | Visualization | Pending | M4 -- Visualization Complete |
| 5 | Live Integration | Pending | M5 -- Live Complete |
| 6 | Advanced Components | Pending | M6 -- Full Suite |
| 7 | Polish & Production | Pending | M7 -- Release |

### Phase 1 Summary (Completed)

- 39 CDM tables, 19 XML sections parsed, 10-step post-parse pipeline
- 1.94M records for test world "Tar Thran" (250 years, post-embark)
- 190 unit tests, 0% referential integrity issues
- Standalone CLI: `chronicler` with 11 commands
- Reports: `phase-1-completion-report.md`, `phase-1-validation-walkthrough.md`

---

## Current Phase: Phase 2 -- Explorer Core

**PRD**: `projects/chronicler/reports/phases/phase-2-explorer-core.md`
**Duration**: 4-6 weeks
**Entry State**: 6 tabs (People, Civilizations, Geography, Schema, Data, Graph), basic data grid
**Exit State**: 15+ entity detail pages, global search with autocomplete, perspective-aware cross-linking, hover popovers, prev-next navigation

### Stage Breakdown

#### Stage 2.1: Entity Detail Page Framework
- Generic detail page template system (base, header, tabs, events, sidebar)
- Cross-linking infrastructure (`EntityLinkRenderer` + `EntityNameCache`)
- Perspective-aware event rendering (`PerspectiveRenderer`)
- DF Calendar utility (months, seasons, ordinals)

#### Stage 2.2: Primary Entity Detail Pages (8 types)
- Historical Figure (24 sections -- most complex page)
- Entity/Civilization (5 tabs: Leaders, Sites, Members, Groups, Wars)
- Site (3 tabs: Structures, Properties, History)
- Artifact (chain-of-custody timeline)
- Region (biome + evilness badges)
- Structure (12+ type badges, deity link for temples)
- Written Content (author, referenced entities, form type)
- Event Collection (hierarchy: War > Battles > Events)

#### Stage 2.3: Secondary Entity Detail Pages + Chronological Browser
- Underground Region, Landmass, Mountain Peak, River, World Construction
- Art Form (3 types), Identity, Historical Era
- Years and Events browser (chronological index)

#### Stage 2.4: Search and Navigation
- Global search with live autocomplete (accent-insensitive, 200ms debounce)
- HF filtering by type flags (vampire, necromancer, deity, etc.)
- Hover popovers on all entity links (Tippy.js, AJAX-loaded)
- Breadcrumb + Prev/Next navigation
- URL hash tab persistence
- JSONB field inventory in schema browser
- Row detail overlay in data browser
- Query results export (CSV/JSON)

### Phase 2 Definition of Done (30 items)

See `phase-2-explorer-core.md` Section 6 for the complete checklist:
- 17 entity detail pages (all types including years browser)
- 8 search/navigation features
- 5 cross-cutting requirements (linking, perspective, calendar, caching, performance)

---

## Development Rules (MANDATORY)

1. **Phase-linear execution**: Complete Phase N before starting Phase N+1. Complete Stage N.M before N.(M+1). No skipping.
2. **Scope fidelity**: Every requirement in the Phase PRD must be implemented. Only the User may defer or remove requirements. Default: "when in doubt, put it in."
3. **No drift**: Do not add features not in the PRD. Do not remove features from the PRD.
4. **Autonomous development**: Develop autonomously -- assess, decide, act. Do not wait for instructions between tasks within a stage.
5. **Self-testing**: Perform your own testing and validation after each stage. Run the test suite, verify UI functionality, check database queries, confirm performance targets.
6. **User validation at phase end**: Before signing off on Phase 2, provide the User with:
   - A completion report (summary of all implemented features)
   - A validation walkthrough (step-by-step manual verification tutorial)
   - Wait for User confirmation before declaring Phase 2 complete
7. **Standalone executable**: No phase is complete unless the application runs hands-off with no special handling by Jarvis. The `chronicler` CLI and web UI must work from a standard `pip install`.
8. **Consult Phase PRD before coding**: Read the relevant Phase PRD section before starting any task.

---

## Infrastructure (Lower Priority)

- [Mac Studio Roadmap](.claude/plans/mac-studio-db-ai-roadmap.md) -- long-term infrastructure roadmap
- UTM VM operational (DF-Windows / 192.168.64.3)
- Docker stack stable (PostgreSQL, Qdrant, Neo4j, Redis, n8n)

## Archived Plans

Previous Chronicler-related plan files have been superseded by the canonical documents above.
- `.claude/plans/` -- various phase-specific plans (now archived)
- `projects/chronicler/plans/archive/` -- consolidated planning source material
