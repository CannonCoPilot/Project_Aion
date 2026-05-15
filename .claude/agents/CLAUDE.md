# Agents

**Purpose**: Custom agent definitions, memory, and execution state.

**Layer**: Pneuma (capabilities)

---

## Structure

| Directory | Contents |
|-----------|----------|
| `*.md` | Agent definition files |
| `_template-agent.md` | Template for new agents |
| `_archive/` | Archived agent definitions |
| `memory/` | Agent learning storage |
| `results/` | Agent output storage |
| `sessions/` | Agent session tracking |

## Available Agents

| Agent | Purpose | Model | Tools |
|-------|---------|-------|-------|
| `code-analyzer` | Pre-implementation codebase analysis | sonnet | Read, Glob, Grep, Bash, TodoWrite, WebFetch |
| `code-implementer` | Code writing with git workflow | sonnet | Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch |
| `code-review` | Technical quality review (AC-03 L1) | sonnet | Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch |
| `code-tester` | Testing + Playwright automation | sonnet | Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch |
| `compression-agent` | JICM v5.8 context compression | sonnet | Read, Write, Glob, Grep |
| `context-compressor` | Generic context compression (pre-JICM) | opus | Read, Write, Glob, TodoWrite |
| `deep-research` | Multi-source technical research | sonnet | Read, Grep, Glob, Bash, WebFetch, WebSearch, TodoWrite |
| `docker-deployer` | Docker service deployment | sonnet | Read, Grep, Glob, Bash, Write, Edit, TodoWrite |
| `jicm-agent` | Autonomous JICM monitoring (background) | haiku | Read, Write, Glob, Bash |
| `memory-bank-synchronizer` | Documentation sync with code | sonnet | Read, Grep, Glob, Bash, Write, Edit, TodoWrite |
| `project-manager` | Progress review (AC-03 L2) | sonnet | Read, Glob, Grep, Bash, TodoWrite, WebFetch |
| `service-troubleshooter` | Infrastructure issue diagnosis | sonnet | Read, Grep, Glob, Bash, WebFetch, WebSearch, TodoWrite |

> **Note**: `compression-agent` (JICM v5.8) supersedes `context-compressor` for JICM workflows.
> The `context-compressor` remains available for non-JICM compression scenarios.

## Creating New Agents

1. Copy `_template-agent.md`
2. Fill in YAML frontmatter — **must use canonical tool names** (see template); never write `tools: All tools`
3. Define agent behavior
4. **Run `bash .claude/scripts/validate-agent-schemas.sh`** to catch malformed YAML
5. Restart session to test invocation (Claude Code caches agent definitions at session start)

**Pattern reference**: See `.claude/context/patterns/agent-invocation-pattern.md` for invocation standards.

**Schema reliability**: See `.claude/context/patterns/subagent-output-fidelity.md` — documents the 2026-05-15 `tools: All tools` YAML bug that caused 8+ months of subagent fabrication failures.

## Agent Memory

Research artifacts stored in `memory/deep-research/`:
- `memory/deep-research/_index.md` — research memory index
- `memory/deep-research/learnings.json` — accumulated research learnings
- Analysis files: `afk-code-analysis.md`, `marvin-chief-of-staff-analysis.md`, `openclaw-analysis-2026-02-05.md`, etc.

## Memory System

Agents store learnings in `memory/<agent-name>/learnings.json`.
These persist across sessions and inform future behavior.

---

*Jarvis — Pneuma Layer (Capabilities)*
