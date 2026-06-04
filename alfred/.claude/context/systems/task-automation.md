# Task Automation Readiness System

**Purpose**: Classify Pulse tasks for autonomous execution and auto-execute approved safe tasks.
**Status**: Active
**Spec**: `.claude/planning/specs/task-automation-readiness.md`
**Pulse Task**: AIProjects-32b

---

## How It Works

1. **Scoring** — Every task gets `auto:` and `risk:` labels at creation time (or retroactively via `task-score`)
2. **Investigation** — `task-investigator` evaluates `auto:candidate` tasks and promotes to `auto:ready` or blocks
3. **Execution** — `task-executor` self-queries for `auto:ready + risk:safe` tasks and executes them autonomously
4. **Aurora** — Aurora Think phase checks `auto:ready` tasks as potential build candidates
5. **Research** — `task-research` executes approved `type:research` tasks, writes output to Obsidian

## Label Taxonomy

**Full label definitions, execution matrix, and deferral docs**: See `.claude/context/tools/beads-reference.md` (single source of truth).

Quick summary: `auto:ready` (execute), `auto:candidate` (investigate), `risk:safe/moderate/destructive` (reversibility), `waiting:david/external` (blocked on input), `parked` (on hold), `--defer` (time-based scheduling).

## Jobs

| Job | Schedule | Budget | Purpose |
|-----|----------|--------|---------|
| `task-score` | Daily @8PM | $1.50 | Score unlabeled open tasks with auto:/risk: labels, fix contradictions |
| `task-evaluator` | Every 1h | $2.00 | intake → route (or queue fast-track): risk/capability/automation scoring |
| `task-investigator` | Daily @9PM | $1.50 | Single-persona candidate evaluation (pre-check: candidates exist) |
| `task-triage-team` | Every 4h | $5.00 | Multi-investigator triage: 3 members (feasibility, risk, effort) + coordinator with consensus voting (DISABLED — enable for Agent SDK) |
| `task-executor` | Every 2h | $4.00 | Self-query: executes `auto:ready` tasks — `risk:safe` autonomously, `pipeline:approved` regardless of risk (pre-check: ready tasks exist) |
| `task-executor-infra` | Every 1h (temp) | $2.00 | Infrastructure deployments: capability:infrastructure + risk:safe/moderate (pre-check: infra tasks at stage:queue) |
| `task-research` | Every 1h | $10.00 | Executes `pipeline:approved + type:research` tasks, writes to Obsidian (pre-check: research tasks exist) |
| `pipeline-watchdog` | Every ~5 min | — | Label integrity: gate-stage validation, mutex checks, deprecated cleanup, stuck-queue detection |

**Note**: `task-digest` and `task-autofix` were originally planned (see spec) but replaced by `task-executor` which self-queries for `auto:ready + risk:safe` tasks directly — no Telegram approval step needed for safe tasks. `risk:moderate` tasks currently have no notification pathway — tracked as AIProjects-52um.

### Task Triage Team (Phase 4)

Replaces the single `task-investigator` with a 3-member triage team that evaluates candidates from different angles. Uses `team-runner.py` to spawn parallel executor.sh processes, collect structured verdicts (approve/deny/uncertain), and apply consensus rules.

**Members**: feasibility (sonnet), risk-assessor (sonnet), effort-estimator (haiku)
**Coordinator**: Synthesizes member outputs into unified assessment (sonnet)
**Consensus rule**: unanimous-approve (all must agree to promote)
**Escalation**: Telegram HITL on conflict or all-uncertain

Reports saved to `.claude/agent-output/results/teams/`.

## Components

| File | Purpose |
|------|---------|
| `.claude/jobs/lib/autofix-scoring-rules.md` | Deterministic scoring rules reference |
| `.claude/jobs/team-runner.py` | Multi-agent team orchestrator (parallel verdicts + consensus) |
| `.claude/agent-output/results/teams/` | Team execution reports (JSON) |
| `.claude/jobs/personas/autofix-executor/` | Executor persona (prompt, config, permissions) |
| `.claude/jobs/personas/task-investigator/` | Investigator persona (promotes/blocks candidates) |
| `.claude/jobs/lib/send-telegram.sh` | Telegram Bot API with `--keyboard-json` for inline buttons |
| `.claude/jobs/lib/telegram-callback-handler.sh` | Two-way Telegram (button taps, text replies, autofix triggers) |
| `.claude/agent-output/results/task-investigator/` | Investigation reports (JSON) |
| `.claude/agent-output/results/task-executor/` | Execution reports (JSON) |
| `.claude/agent-output/results/task-research/` | Research execution reports (JSON) |

## Telegram Approval Flow

```
task-executor (self-query mode, every 2h)
  └── Queries Pulse for auto:ready + risk:safe tasks
      └── Executes each task, closes on success, marks blocked on failure

Note: The original plan included a task-digest (Telegram approval) → task-autofix
(execution) flow. This was replaced by the simpler task-executor self-query model.
The Telegram callback handler still has dormant autofix routing code from the
original design — safe to remove when convenient.
```

Buttons disappear after tapping (replaced by confirmation text).

## Integrated Jobs & Safety

See `.claude/context/tools/beads-reference.md` for the full auto-label assignment table (which jobs stamp which labels) and `.claude/jobs/lib/autofix-scoring-rules.md` for executor safety hard rules.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Digest sends but no buttons | Telegram no longer uses buttons — it's a pager only (link to dashboard) |
| Autofix skips a task | Check executor report at `.claude/agent-output/results/autofix/YYYY-MM-DD.json` |
| No auto:ready tasks | Normal — scoring is conservative. Tasks come from librarian rename/delete-junk actions |
| Executor persona not found | Recreate `.claude/jobs/personas/autofix-executor/` (prompt.md, config.yaml, permissions.yaml) |
