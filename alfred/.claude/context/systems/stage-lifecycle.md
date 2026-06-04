# Nexus Stage Lifecycle

**Status**: Active
**Created**: 2026-03-11
**Orchestration**: `2026-03-11-nexus-stage-lifecycle.yaml`
**Task**: AIProjects-6d0q

## Overview

Every Nexus task moves through a pipeline of explicit stages, tracked by the `stage:` label prefix. The stage label answers one question: **"Where is this task right now?"**

Existing labels (`auto:`, `risk:`, `waiting:`) remain as **attributes** — they describe properties of the task. The `stage:` label describes its **position** in the pipeline.

### Why `stage:` and not `phase:`?

The orchestration system already uses `phase:` for multi-phase plan stages (e.g., `phase:phase-1-postgresql-consolidation`). Using `stage:` avoids ambiguity. The dashboard's `StageStepper` component already uses "stage" terminology.

---

## The Pipeline

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  INTAKE  │──▶│ EVALUATE │──▶│  ROUTE   │──▶│  REVIEW  │──▶│  QUEUE   │──▶│ EXECUTE  │──▶ CLOSED
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

## Stage Definitions

| Stage | Label | What Happens | Input | Output | Owner |
|-------|-------|-------------|-------|--------|-------|
| **Intake** | `stage:intake` | Task enters the system, awaits evaluation | User request, headless discovery, Claude App | Task with `source:*`, `domain:*`, `project:*` | System |
| **Evaluate** | `stage:evaluate` | Assess automation readiness and risk | Unscored task | `auto:*` + `risk:*` + `capability:*` labels stamped | `task-evaluator` |
| **Route** | `stage:route` | Decide who/what handles it next | Scored task | Assigned to: auto pipeline, human review, research, parked, or decomposed | `task-investigator`, AI David |
| **Review** | `stage:review` | Human validates routing, proposal, or escalation | Proposal or escalation | Approved, rejected, adjusted | Sir (dashboard), AI David (auto-approve) |
| **Queue** | `stage:queue` | Approved and waiting for next execution slot | Approved task | Execution-ready in next cycle | System (passive) |
| **Execute** | `stage:execute` | Work gets done | Claimed task | Work artifact, code change, research output | `task-executor`, `task-research`, manual |
| *(Closed)* | *(no stage label)* | Task complete, stage label removed | Evidence of completion | Closed with reason + optional follow-ups | Executor or human |

## Transition Rules

### Standard Flow

```
task.created          → stage:intake     (event-watcher stamps on creation)
task-evaluator runs   → stage:evaluate   (brief — transitions to route/queue on completion)
  scored              → stage:route      (needs routing decision)
  fast-track          → stage:queue      (auto:ready + risk:safe, skip route/review)
task-investigator     → stage:route → stage:queue (promoted) or stage:review (blocked)
AI David              → stage:review → stage:queue (approved) or stays (proposal/escalated)
Sir (dashboard)       → stage:review → stage:queue (approved) or stage:evaluate (modify)
task-executor claims  → stage:execute
task closed           → stage label removed
task fails/parks      → stage:review     (needs human decision)
```

### Fast-Track Rules (Stages Can Be Skipped)

| Condition | Skips To | Rationale |
|-----------|----------|-----------|
| `auto:ready` + `risk:safe` | `stage:queue` | Safe, reversible, pre-assessed — no human needed |
| `pipeline:approved` (legacy, during migration) | `stage:queue` | Already human-approved |
| Manual creation with explicit `auto:ready` | `stage:queue` | Creator pre-assessed |

### Stage Mutation Pattern

A task has exactly ONE `stage:` label at any time. Transitions must remove the old and add the new:

```bash
pulse label remove <id> stage:intake
pulse label add <id> stage:evaluate
```

When a task is closed, the stage label is simply removed (no "completed" stage).

---

## Decomposition (Routing Action)

When the Route stage determines a task is too complex or requires multiple capabilities (e.g., `capability:code` + `capability:infrastructure`), it decomposes:

```
Task enters Route
  ├── Simple (single capability) → advance to Queue or Review
  └── Complex (multi-capability / multi-step detected)
        ├── Create subtasks with parent:<id> link
        ├── Each subtask enters pipeline at stage:intake
        ├── Parent task → stage:review + waiting:subtasks
        ├── Log task.decomposed event with parent/child IDs
        └── When all subtasks complete → parent auto-advances to stage:queue
```

### Decomposition Triggers

- Task requires multiple `capability:*` labels
- Task description contains multiple distinct work items
- Estimated effort exceeds single-session threshold
- Task-investigator or task-evaluator flags complexity

### Decomposition Is NOT a Stage

Decomposition is an **action taken during routing**, not a pipeline position. The parent task stays at `stage:review` (waiting for children), and each child independently traverses the full pipeline.

---

## Relationship to Existing Labels

### Attributes (Stay — Describe Properties)

| Prefix | Purpose | Coexists with stage? |
|--------|---------|---------------------|
| `auto:` | Automation readiness | Yes — `auto:ready` + `stage:queue` |
| `risk:` | Reversibility | Yes — `risk:safe` + `stage:execute` |
| `waiting:` | Who is blocking | Yes — `waiting:david` + `stage:review` |
| `domain:` | Work category | Yes — always present |
| `project:` | Which project | Yes — always present |
| `source:` | How created | Yes — always present |
| `type:` | Task type | Yes — always present |
| `action:` | Required operation | Yes — always present |
| `capability:` | Required tooling | Yes — always present |

### Legacy Labels — Cleanup Status

| Label | Status | Notes |
|-------|--------|-------|
| `pipeline:evaluated` | **REMOVED** | No active code sets it. Write-guard retained in `label-ops.sh` to prevent re-introduction. |
| `pipeline:ai-david-approved` | **REMOVED** | Consolidated into `pipeline:approved`. Migration rule retained in watchdog as safety net. |
| `pipeline:needs-approval` | **KEPT** | Active blocker/gate (`is_blocker: true`). Dashboard approval flow, executor routing, and 50+ code refs depend on it. Not a stage indicator — it's an authorization gate. |
| `pipeline:approved` | **KEPT** | Authorization token — grants risk gate bypass for executors. All executor routing helpers check it. Essential for `risk:moderate`/destructive task execution. |
| `pipeline:has-orchestration` | **KEPT** | Metadata attribute — marks tasks with orchestration YAML plans. Informational, not a stage. |

> **Note**: Dashboard inference migration (T6.4) deferred — `classify.ts`, `tasks.ts`, `board.ts`, and `pipeline-dag-builder.ts` still infer pipeline position from `auto:`, `waiting:`, `pipeline:` label combos. These must be migrated to stage-primary reads before old inference logic can be removed. Tracked as separate scope.

### Labels That Stay Despite Overlap

| Label | Why It Stays |
|-------|-------------|
| `parked` | Deliberate shelf — a routing *decision*, not a pipeline position. Task at `stage:review` + `parked` means "Sir decided to shelve this" |
| `waiting:david` | *Who* is blocking — `stage:review` says where, `waiting:david` says who |
| `needs-input` | *What* is needed — `stage:review` says where, `needs-input` says what's missing |

---

## Event-Driven Dispatch

As of 2026-03-15, the pipeline has two dispatch paths that coexist:

### Fast Path — Pipeline Runner

The **pipeline runner** (`pipeline-runner.sh --once`) runs via cron every minute and checks the `pulse.pipeline_triggers` PostgreSQL table for pending dispatches. Triggers are emitted by `label-ops.sh` via `trigger-ops.sh` (which calls the Pulse trigger API) on every stage transition (both `label_stage_transition()` and scenario-based `label_transition()` calls). Can be enabled/disabled from the dashboard Settings page.

```
label_stage_transition() → trigger_emit() → Pulse API → pulse.pipeline_triggers table → pipeline-runner.sh (1min cron) → dispatcher.sh --run <handler>
```

**Stage → Handler mapping**:

| Stage | Handler | Dispatch Mode |
|-------|---------|---------------|
| `intake` | `task-evaluator` | Batch (no task_id) |
| `route` | `task-investigator` | Batch (no task_id) |
| `review` | `ai-david` | Batch (no task_id) |
| `queue` | Resolved by capability | Single-task (`--param task_id=<id>`) |

**Deduplication**: Batch handlers (evaluator, investigator, ai-david) are deduplicated — if a pending trigger exists for the same handler, new triggers are skipped because the dispatched job queries all eligible tasks.

**Cost guard**: Max 20 LLM dispatches per hour (configurable in `nexus-settings.json` → `max_dispatches_per_hour`).

### Safety Net — Cron Dispatcher

The existing cron-based dispatcher (every 5 min) remains unchanged. It serves as the guaranteed sweep — if the pipeline runner is down or a trigger is missed, cron picks up the work on its next cycle. The two paths share per-job lock files, so duplicate dispatches are prevented.

### On-Demand — `nexus-dispatch`

Manual dispatch via CLI: `nexus-dispatch <task-id>` inserts a high-priority trigger that the runner picks up within 60 seconds (next cron cycle), or falls back to direct `dispatcher.sh --run` if the runner is not active.

## Operational Tools

- **`Scripts/validate-label-gates.sh`** — Validates gate-stage alignment on all open tasks. Checks: every task has exactly one `stage:` label, gate labels appear at correct stages, no deprecated labels. Supports `--fix` mode for auto-remediation.
- **`.claude/jobs/lib/routing-rules.yaml`** — Centralized routing decisions: pickup criteria per executor, stage transition table, dispatch routing, authorization rules. LLM-readable reference.
- **`.claude/jobs/lib/routing-helpers.sh`** — Bash helper functions sourced by event-watcher and registry pre_checks. Mirrors routing-rules.yaml.
- **`.claude/jobs/pipeline-runner.sh`** — Event-driven dispatch loop. Runs via cron every 1min (`--once`), deduplicates batch handlers, respects cost cap (configurable), toggleable via dashboard.
- **`.claude/jobs/nexus-dispatch`** — On-demand CLI for immediate task dispatch.
- **`.claude/jobs/lib/trigger-ops.sh`** — Trigger queue library: emit, claim, complete, dedup, cleanup.

## Related Documentation

- @.claude/context/tools/pulse-reference.md — Label taxonomy (includes stage:)
- @.claude/context/tools/label-taxonomy.yaml — Canonical label definitions with function categories
- @.claude/jobs/lib/routing-rules.yaml — Centralized routing and pickup criteria
- @.claude/context/systems/nexus.md — Nexus component map
- @.claude/context/systems/nexus-revamp-spec.md — Revamp phases 1-4
- @.claude/context/systems/task-automation.md — Task automation pipeline details
