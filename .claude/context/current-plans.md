# Current Plans

## Project Vision

**Chronicler** is a standalone, installable, multi-platform desktop application that runs alongside a player's local Dwarf Fortress game on **Windows**, **Linux**, or **macOS** (via emulators like UTM). It is a living record and AI storyteller that transforms raw game data into browsable, cross-linked, narratively rich histories -- plus fortress management, advising, and autonomous play. The ultimate deliverable is a packaged application the User can run hands-off.

**Product Code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Dev Artifacts**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/`

### Runtime
- **Web UI**: `http://localhost:8080/` (ALWAYS use `--reload` flag for auto-reload on code changes)
- **Start command**: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`
- **CLI**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler`

### Database
- **Host**: `localhost:5432`
- **Database**: `chronicler`
- **User**: `jarvis`
- **Password**: `OSDbeydP6TOBGoJUym6rTBfULKJYqqPE`
- **DSN**: `postgresql://jarvis:OSDbeydP6TOBGoJUym6rTBfULKJYqqPE@localhost:5432/chronicler`
- **Config**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py`

---

## Canonical Planning Documents

Single source of truth. Consult in this order:

| Document | Path | Purpose |
|----------|------|---------|
| **Product Requirements** | `projects/chronicler/reports/product-requirements.md` | ~200+ REQ-IDs, priorities, DFHack ref |
| **Full Project Roadmap** | `projects/chronicler/reports/full-project-roadmap.md` | 7 phases, 38 stages, ~280 tasks (v4.0) |
| **Phase 3 Completion PRD** | `projects/chronicler/reports/phases/phase-3-completion-prd.md` | **ACTIVE** -- v3.0, Stages 3.4-3.6 remaining |
| **Phase PRDs** (7 docs) | `projects/chronicler/reports/phases/phase-{1-7}-*.md` | Per-phase PRD/Roadmap with code examples |
| **Research Synthesis** | `projects/chronicler/reports/research-synthesis-v2.md` | All repo research, event taxonomy, patterns |
| **Planning History** | `projects/chronicler/reports/planning-history.md` | Consolidated history of all design decisions |
| **Dev Environment** | `projects/chronicler/reports/dev-environment-reference.md` | UTM VM, DFHack, SSH, deploy procedures |
| **Skill Review** | `projects/chronicler/reports/skill-review.md` | Relevant Jarvis skills for this project |

---

## Phase Progress

| Phase | Name | Status | Milestone |
|-------|------|--------|-----------|
| 1 | Data Foundation | **COMPLETE** (64/64, 2026-02-25) | M1 |
| 2 | Explorer Core | **COMPLETE** (50/50 DoD, 2026-03-03) | M2 |
| **3** | **Live Integration** | **IN PROGRESS** -- Stages 3.0-3.3 complete; 3.4-3.6 remaining | **M3** |
| 4 | Narrative Engine | Pending (~60% pre-built) | M4 |
| 5 | Visualization | Pending (+LVN: 22 enhancements) | M5 |
| 6 | Advanced Components | Pending (+LVN: achievements, prediction, bot) | M6 |
| 7 | Polish & Production | Pending | M7 |

> **Roadmap v4.0 (2026-03-19)**: AI Storytelling Pipeline. Phase 3 gains 3.5-3.6. Phase 4 gains 4.5-4.7. Total: 38 stages, ~280 tasks. Full vision: history explorer, AI storyteller, mod manager, advisor, player bot.
> **v3.0 LVN (2026-03-18)**: 33 enhancements from Legends Viewer Next integrated across Phases 3-6.
> **v2.0 Reorder (2026-03-04)**: Live Integration moved from Phase 5 -> Phase 3.

---

## Current Phase: Phase 3 -- Live Integration

**Active PRD**: `projects/chronicler/reports/phases/phase-3-completion-prd.md` (v3.0)
**Live fortress**: Girderpriced

### Stage Status

| Stage | Name | Status |
|-------|------|--------|
| 3.0 | CDM Schema Fixes | **COMPLETE** (2026-03-09) |
| 3.1 | CDM Expansion + ETL | **COMPLETE** (2026-03-17) -- 7 tables, bridge v9, 14 ETL functions |
| 3.2 | Worldgen Monitoring | **COMPLETE** (deferred scope per PRD v3.0) |
| 3.3 | Knowledge Horizon | **COMPLETE** (deferred scope per PRD v3.0) |
| **3.4** | **Embedding Pipelines** | **NEXT** |
| 3.5 | Fortress State Capture | Pending |
| 3.6 | Narrative Data Layer | Pending |

---

## Phase 3 Working Documents

| Document | Path |
|----------|------|
| Phase 3 ETL Plan | `projects/chronicler/reports/phase-3-etl-plan.md` |
| Phase 3 Memory->CDM Mapping | `projects/chronicler/reports/phase-3-memory-cdm-mapping.md` |
| Comprehensive Validation | `projects/chronicler/reports/comprehensive-validation-2026-03-17.md` |
| Game Control Validation | `projects/chronicler/reports/game-control-validation-report.md` |

## DF Reference Documents

| Document | Path |
|----------|------|
| DF Gameplay Mechanics | `projects/chronicler/reports/df-gameplay-mechanics-reference.md` |
| DF Hands-On Verified | `projects/chronicler/reports/df-gameplay-hands-on-verified.md` |
| DF Live Data Systems | `projects/chronicler/reports/df-live-data-systems-reference.md` |
| DF Map Coordinates | `projects/chronicler/reports/df-map-coordinate-research.md` |
| DF Quickfort Reference | `projects/chronicler/reports/df-quickfort-reference.md` |
| DFHack Command Catalog | `projects/chronicler/reports/dfhack-command-catalog.md` |
| Girderpriced Gameplay Plan | `projects/chronicler/reports/girderpriced-gameplay-plan.md` |
| LVN Comparison & Enhancements | `projects/chronicler/reports/lvn-comparison-and-enhancements.md` |
| LVN Feature Audit | `projects/chronicler/reports/lvn-feature-audit.md` |

## Active Implementation Plans (`.claude/plans/`)

| Plan | Purpose |
|------|---------|
| `lazy-riding-stonebraker.md` | Stage 3.4: Embedding Pipelines |
| `cheerful-knitting-whisper.md` | Phase 3 Realignment: Chronicler as Living Game Mirror |
| `modular-mapping-sparkle.md` | Unified CDM Expansion: Map All In-Game Memory |
| `rustling-singing-lake.md` | Unified CDM Expansion Plan -- Memory-to-CDM Full Mapping |
| `pure-stargazing-cerf.md` | Stage 3.2: Worldgen Monitoring |

---

## Development Rules (MANDATORY)

1. **Phase-linear execution**: Complete Phase N before N+1. Complete Stage N.M before N.(M+1).
2. **Scope fidelity**: Every PRD requirement implemented. Only User may defer/remove.
3. **No drift**: No extra features; no skipping.
4. **Autonomous development**: Assess, decide, act. Don't wait between tasks within a stage.
5. **Self-testing**: Test after each stage. Run test suite, verify UI, check DB, confirm perf.
6. **User validation at phase end**: Completion report + validation walkthrough + wait for confirmation.
7. **Standalone executable**: `chronicler` CLI and web UI must work from `pip install`.
8. **Consult Phase PRD before coding**.

---

## Infrastructure

- [Mac Studio Roadmap](.claude/plans/mac-studio-db-ai-roadmap.md) -- long-term infra
- UTM VM operational (DF-Windows / 192.168.64.3)
- Docker stack stable (PostgreSQL, Qdrant, Neo4j, Redis, n8n)
- LegendsViewer-Next running at `http://localhost:8081` (tmux W8, .NET 8 + Vue 3)
