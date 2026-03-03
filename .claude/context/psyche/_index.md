# Psyche — Master Archon Topology (v1.0.0) — "You are here" map

Purpose: structural navigation map of Jarvis Archon stack: Nous→Pneuma→Soma, connected by Neuro pathways.

## Archon structure (paths + key dirs)
- NOUS (Knowledge): `/.claude/context/`
  - dirs: `patterns/` (51), `standards/` (5), `workflows/` (1), `designs/` (arch), `components/` (AC-*), `integrations/`, `lessons/` (memory), `reference/` (on-demand), `psyche/` (topology), `troubleshooting/`
  - session files (as diagram): `session-state.md` | `current-priorities.md` | `_index.md`
- PNEUMA (Capabilities): `/.claude/`
  - dirs+counts: `agents/` (12), `commands/` (40), `skills/` (28), `hooks/` (28), `scripts/` (session)
  - ops dirs: `state/` (runtime), `config/` (settings), `metrics/` (telemetry), `reports/` (AC output), `logs/` (telemetry)
  - identity files: `CLAUDE.md` | `psyche/jarvis-identity.md` | `settings.json`
- SOMA (Infrastructure): `/Jarvis/`
  - dirs: `docker/` (services), `scripts/` (system), `models/` (local), `lancedb/` (vector), `docs/` (user)
  - workspace: `projects/project-aion/` (designs|plans|progress|evolution|ideas|reports)
  - config: `paths-registry.yaml` | `CHANGELOG.md`

## Layer summaries (what/where)
### Nous = what Jarvis KNOWS
- `patterns/`: behavioral rules (wiggum-loop, selection-intelligence, etc.)
- `standards/`: conventions (readme-standard, model-selection)
- `components/`: AC-01..AC-09 specs
- `integrations/`: tool knowledge; key: `capability-map.yaml` (manifest router)
- `reference/`: glossary, mcp-decision-map, etc.
- `psyche/`: topology maps (this file)
- `psyche/self-knowledge/`: strengths, weaknesses, patterns-observed
Detail pointer: `nous-map.md`

### Pneuma = what Jarvis CAN DO
- `agents/` (12), `commands/` (40), `skills/` (28; includes absorbed/example/_shared), `hooks/` (28), `scripts/` (~20)
Detail pointer: `pneuma-map.md`

### Soma = how Jarvis INTERACTS
- `docker/`, `scripts/`, `models/`, `projects/`, `docs/`
Detail pointer: `soma-map.md`

## Neuro pathways (key connections)
Primary nav from `CLAUDE.md`:
- `patterns/_index.md` → individual patterns
- `context/_index.md` → all Nous directories
- `session-state.md` → current work status
- `current-priorities.md` → task queue

Pattern → implementation linking:
- pattern references: other patterns (prereqs) + components (AC specs) + Pneuma capabilities (agents/scripts)

Selection intelligence routing:
- task arrives → `patterns/selection-intelligence-guide.md` (quick)
- → `psyche/capability-map.yaml` (manifest router)
- → `patterns/agent-selection-pattern.md` (agents)

## Quick navigation table (intent → path)
- structure: this file
- find pattern: `patterns/_index.md`
- select tool: `psyche/capability-map.yaml`
- current work: `session-state.md`
- next tasks: `current-priorities.md`
- agent: `.claude/agents/README.md`
- skill: `.claude/skills/_index.md`
- troubleshoot: `troubleshooting/_index.md`
- term lookup: `reference/glossary.md`

## Cross-refs
- glossary: `reference/glossary.md`
- orchestration: `components/orchestration-overview.md`
- selection intel: `patterns/selection-intelligence-guide.md`
- orchestration philosophy: `designs/orchestration-philosophy.md`

Psyche v1.0.0 — Master Archon Topology