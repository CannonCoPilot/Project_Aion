# Current Plans

## Chronicler Development (Primary Focus)

**Project**: Chronicler -- Dwarf Fortress Living Record & AI Storyteller
**Product Code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Dev Artifacts**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/`

### Canonical Planning Documents

These documents are the single source of truth for all Chronicler development. They supersede all prior plan files in `.claude/plans/`. When making implementation decisions, consult these documents in this order:

| Document | Path | Purpose |
|----------|------|---------|
| **Product Requirements** | `projects/chronicler/reports/product-requirements.md` | ~200+ requirements, REQ-IDs, priorities, DFHack reference |
| **Full Project Roadmap** | `projects/chronicler/reports/full-project-roadmap.md` | 7 phases, 26 stages, ~150 tasks, milestones, risk register |
| **Phase PRDs** (7 docs) | `projects/chronicler/reports/phases/phase-{1-7}-*.md` | Detailed per-phase PRD/Roadmap with code examples |
| **Research Synthesis** | `projects/chronicler/reports/research-synthesis-v2.md` | All repo research, event taxonomy, implementation patterns |
| **Planning History** | `projects/chronicler/reports/planning-history.md` | Consolidated history of all design decisions |
| **Dev Environment** | `projects/chronicler/reports/dev-environment-reference.md` | UTM VM, DFHack, SSH, deployment procedures |
| **Skill Review** | `projects/chronicler/reports/skill-review.md` | Relevant Jarvis skills and patterns for this project |

### Current Phase

**Phase 1: Data Foundation** (3-4 weeks estimated)
- Milestone: M1 -- Data Complete
- Status: Not yet started (documentation consolidation just completed)
- Detailed plan: `projects/chronicler/reports/phases/phase-1-data-foundation.md`

### Development Discipline

1. **Linear progression**: Complete each Phase before starting the next. Complete each Stage within a Phase before the next Stage. No skipping ahead.
2. **Scope fidelity**: Every feature in the PRD must be implemented unless the User explicitly defers it. Default: "when in doubt, put it in."
3. **Phase gates**: A Phase is complete only when ALL items in its "Definition of Done" checklist pass.
4. **No drift**: Do not introduce features not in the PRD. Do not remove features from the PRD without User approval.
5. **Verify before advancing**: After completing a Phase, verify the milestone criteria against the Definition of Done in the phase document.

### Phase Sequence

| Phase | Name | Duration | Dependencies |
|-------|------|----------|-------------|
| 1 | Data Foundation | 3-4 weeks | None |
| 2 | Explorer Core | 4-6 weeks | Phase 1 |
| 3 | Narrative Engine | 4-6 weeks | Phase 1, Phase 2 |
| 4 | Visualization | 3-4 weeks | Phase 1, Phase 2 |
| 5 | Live Integration | 3-4 weeks | Phase 1, Phase 3 |
| 6 | Advanced Components | 6-10 weeks | Phase 2, Phase 3 |
| 7 | Polish & Production | 2-3 weeks | All prior |

## Infrastructure (Lower Priority)

- [Mac Studio Roadmap](.claude/plans/mac-studio-db-ai-roadmap.md) -- long-term infrastructure roadmap
- UTM VM infrastructure operational (DF-Windows / 192.168.64.3)
- Docker stack stable (PostgreSQL, Qdrant, Neo4j, Redis, n8n)

## Archived Plans

Previous Chronicler-related plan files have been superseded by the canonical documents above. Historical references:
- `.claude/plans/` -- various phase-specific plans (now archived)
- `projects/chronicler/plans/archive/` -- consolidated planning source material
