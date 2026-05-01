# Nous Layer Topology (v1.0.0) — `.claude/context/`

Nous = what Jarvis KNOWS (knowledge shaping decisions).

Tree (key):
- `_index.md` navigation hub
- `session-state.md` current work status (update frequently)
- `current-priorities.md` active task queue
- `configuration-summary.md`
- dirs: `patterns/` (52), `standards/`, `workflows/`, `designs/`, `components/` (AC specs), `integrations/`, `reference/`, `psyche/`, `troubleshooting/`, `lessons/`, `guides/`, `research/`, `systems/`, `infrastructure/`, `plans/`, `archive/`.

patterns/:
- 52 patterns; categories: Mandatory (wiggum-loop/startup-protocol/jicm/selection-intelligence-guide), Selection (agent-selection/tool-selection-intelligence/mcp-loading-strategy), Self-Improvement (reflection/evolution/rd/maintenance), Development (branching/milestone-review/project-reporting), Infrastructure (service-lifecycle/docker-operations/mcp-design-patterns), Validation (tdd-enforcement-pattern, two-stage-validation-gating).
- Index: `patterns/_index.md`; strictness: ALWAYS > Recommended > Optional.
- Notable: `two-stage-validation-gating` (v1.0.0, 2026-05-01) — universal Jarvis pattern for any dev change with measurable behavioral effect. Stage 1 = regression-catch (hours-48h, halt only); Stage 2 = formal pre-reg sign-off (days-14d, the promotion gate). Generalized from token-compression-experimental-design.md §10.4 per User directive.

standards/: includes readme-standard, severity-status-system, model-selection.

components/: AC-01..AC-09 specs; orchestration diagram: `orchestration-overview.md`; lifecycle: `.claude/context/components/context-lifecycle-diagram.md`.

integrations/: `capability-map.yaml`, overlap-analysis, mcp-installation, memory-usage, skills-selection-guide.

reference/: glossary, mcp-decision-map, mcp-decomposition-registry, tool-reconstruction-backlog, commands-quick-ref, workflow-patterns (PARC/DDLA/COSA), project-management.

psyche/: `_index.md`, `nous-map.md` (this), `pneuma-map.md`, `soma-map.md`, `capability-map.yaml`, `autopoietic-paradigm.md`, `prompts.yaml`, self-knowledge files (strengths/weaknesses/patterns-observed).

research/: context-engineering quick ref, hook infra analysis, phase-6 readiness, serena mcp analysis.
reflections/: `session-reflection-20260207.md`.

troubleshooting/: `_index.md`, agent-format-migration, hookify-import-fix.
systems/: host env docs (README + template).
lessons/: corrections, self-corrections, patterns, problems, solutions.

Key files: `session-state.md` (every session), `current-priorities.md` (on completion), `_index.md` (rare), `patterns/_index.md` (on new patterns).

Neuro connections:
- To Pneuma: patterns→agents/commands/skills; components→scripts.
- To Soma: designs/lessons/research map to `/Jarvis/projects/...` areas.
- Internal: indices link to contents; troubleshooting→lessons.

Hierarchy: Standards > Patterns > Workflows > Designs > Plans > Lessons.