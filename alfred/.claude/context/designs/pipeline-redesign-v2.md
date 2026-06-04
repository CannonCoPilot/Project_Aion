# Pulse Pipeline v2 — Analysis & Redesign Plan

**Date**: 2026-04-25
**Author**: Jarvis (Sir's dev session)
**Status**: DESIGN PROPOSAL — awaiting review

---

## Part 1: Current Pipeline Architecture (How It Works Today)

### The Two Parallel Tracking Systems

The current system has **two overlapping axes** for tracking task state — and this is the root of most confusion:

| Axis | Values | Mechanism |
|------|--------|-----------|
| **Status** (Pulse native) | `open`, `in_progress`, `closed` (free-text column, `pulse/app.py:66`) | Set via `pulse update --status` |
| **Board Column** (dashboard-computed) | `backlog`, `ready`, `in_progress`, `review`, `done`, `blocked`, `deferred`, `archived` | Computed by `classifyTask()` in `dashboard/frontend/src/lib/board.ts` |
| **Pipeline Stage** (label-based) | `stage:intake`, `stage:evaluate`, `stage:route`, `stage:review`, `stage:queue`, `stage:execute` | Set via label add/remove |

**How `classifyTask()` maps tickets to board columns** (evaluated in this priority order):
1. `task.status === 'closed'` → **done** (or **archived** if older than threshold)
2. `parked` or `waiting:trigger` label → **deferred**
3. `review:research` label → **review**
4. Blocker labels (`waiting:david`, `waiting:external`, `waiting:subtasks`, `waiting:session`, `needs-input`, `manual-action`, `pipeline:needs-approval`, or `blocked:*`) → **blocked**
5. `task.status === 'in_progress'` → **in_progress**
6. `stage:queue` label → **ready**
7. Everything else → **backlog**

**Critical bug**: `waiting:human` is NOT in the dashboard's BLOCKER_LABELS list — only `waiting:david` is. Tasks with `waiting:human` fall through to **backlog**, making them invisible as needing attention. This is the single biggest UI gap.

**The problem**: Three tracking systems overlap without clear mapping. Pulse stores a simple status (`open`/`in_progress`/`closed`). The dashboard computes board columns from a mix of status + labels. Pipeline jobs operate on stage labels. The Kanban board defaults to the computed Status view, but most pipeline-moving tasks sit at `status:open` and land in "Backlog" — which tells you nothing about where the ticket is in the automation pipeline. The board has a Stage toggle (`viewMode` in `KanbanPage.tsx:94`), but it's not the default.

### Current Pipeline Flow (as designed in routing-rules.yaml)

> **Note**: This diagram shows the **designed** flow from `routing-rules.yaml`. The **actual running** flow is simpler: event-watcher detects new tasks → triggers task-score → task-score adds `auto:candidate` + `risk:*` (no stage change) → task-investigator promotes `auto:candidate` tasks to `stage:queue` + `auto:ready`. Stage labels INTAKE, EVALUATE, and ROUTE are largely unused.

```
                                    ┌─────────────────────────────────────────┐
                                    │        FAST TRACK                       │
                                    │  (risk:safe + auto:ready at creation)   │
                                    └────────────────┬────────────────────────┘
                                                     │
                                                     ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│          │    │          │    │          │    │          │    │          │
│  INTAKE  ├───►│ EVALUATE ├──┬►│  ROUTE   ├──┬►│  QUEUE   ├───►│ EXECUTE  │
│          │    │ (no job) │  │ │(mismatch)│  │ │          │    │          │
└──────────┘    └────┬─────┘  │ └────┬─────┘  │ └──────────┘    └────┬─────┘
                     │        │      │        │                      │
                     │        │      │        │                      ├─► COMPLETE (close)
                     ▼        │      ▼        │                      │
               ┌──────────┐   │ ┌──────────┐  │                     └─► FAIL (park + review)
               │  REVIEW   │◄─┘ │ DECOMPOSE│  │
               │(human/AI) │     │(subtasks)│  │
               └─────┬─────┘     └──────────┘  │
                     │                          │
                     ├─► Approve ───────────────┘
                     ├─► Park (defer)
                     ├─► Re-evaluate (send back)
                     └─► Cancel (close)
```

### What Each Nexus Component Does

**Registry jobs** (scheduled by dispatcher via `registry.yaml`):

| Job | Fires Every | What It Does | Pre-v2 Turns | Pre-v2 Budget |
|-----|-------------|--------------|--------------|---------------|
| **task-score** | 20 min | Finds tasks with NO routing labels. Adds `auto:candidate`/`waiting:*` + `risk:*`. Does NOT change stage. Max 20 tasks/run per workflow. | 40 | $3 |
| **task-investigator** | 20 min | Picks up `auto:candidate` tasks. Evaluates them. Promotes to `auto:ready` + `stage:queue`, or sends to `stage:review` + `waiting:human`. Max 5 tasks/run per workflow. | 40 | $3 |
| **task-executor** | 20 min | Picks up `stage:queue` + `risk:safe` (or `pipeline:approved`) tasks. Claims, executes, closes. Skips `type:research` and `capability:infrastructure`. | 60 | $6 |
| **health-summary** | 12 hr | Infrastructure health check. Not pipeline-related. | 10 | $1 |
| **context-maintenance** | 12 hr | Evaluator Brief maintenance. Not pipeline-related. | 20 | $2 |
| **pipeline-review** | 12 hr | LLM reviews pipeline health. Advisory only. | 15 | $1.50 |

**Launchd agents** (always-running scripts, not in registry):

| Component | Script | What It Does |
|-----------|--------|--------------|
| **event-watcher** | `.claude/jobs/event-watcher.sh` | Polls Pulse for newly created tasks (via client-side ID tracking). When new tasks appear, triggers the `task-score` job via dispatcher. Does **not** stamp `stage:intake`, does **not** handle fast-track routing, does **not** dispatch executors on approval. Simpler than `routing-rules.yaml` implies. |
| **pipeline-watchdog** | `.claude/jobs/pipeline-watchdog.sh` | Detects stuck tasks, cleans contradictory labels, advances resolved dependencies. Runs every 5 min. |
| **dispatcher** | `.claude/jobs/dispatcher.sh` | Reads `registry.yaml`, checks schedules and pre_checks, launches executor.sh for due jobs. |

**Note**: `routing-rules.yaml` defines a `task-evaluator` pickup criteria for `stage:intake` → `stage:evaluate` tasks, and a `task-evaluator` persona exists, but **no `task-evaluator` job is registered in `registry.yaml`**. The EVALUATE stage may be vestigial — in practice, task-score handles scoring and task-investigator handles routing. Similarly, `task-research`, `task-executor-infra`, `bug-fixer`, and `security-reviewer` are defined in routing rules but have no registry jobs in the dev environment.

### The 6 Pipeline Stages (as designed in routing-rules.yaml)

> **Implementation gap**: Not all stages have registered jobs. The EVALUATE stage has a persona but no scheduled job. The ROUTE stage is handled by task-investigator which actually picks up `auto:candidate` tasks, not `stage:route` tasks. See the "Designed vs Running" table below.

1. **INTAKE** (`stage:intake`): *Designed* for event-watcher to stamp when a task is created. **In practice, the event-watcher only triggers task-score — it does not stamp `stage:intake`.** No component currently stamps this label. Fast-track routing (pre-assessed `risk:safe` + `auto:ready`) is defined in routing-rules.yaml but not implemented in the event-watcher code.

2. **EVALUATE** (`stage:evaluate`): *Designed* to score risk, capability, and automation readiness via `task-evaluator` persona. **In practice, no job picks up `stage:evaluate` tasks.** Scoring is done by task-score (which operates on unlabeled tasks, not `stage:evaluate` tasks).

3. **ROUTE** (`stage:route`): *Designed* for the task-investigator to decide *who/what* handles the task. **In practice, task-investigator picks up `auto:candidate` tasks (from task-score), not `stage:route` tasks.** It promotes to `auto:ready` + `stage:queue`, or sends to `waiting:human`.

4. **REVIEW** (`stage:review`): Human or AI-proxy (AI David) makes a decision. The ticket sits here with `waiting:human` or `pipeline:needs-approval`. Options: approve → QUEUE, modify → re-EVALUATE, park, cancel.

5. **QUEUE** (`stage:queue`): Passive holding pen. Executors poll this stage for eligible tasks. Task sits here until an executor's next cycle picks it up.

6. **EXECUTE** (`stage:execute`): Active work. The executor claims the task, does the work, then either closes it or fails it back to REVIEW.

**Designed vs Actually Running**:

| Stage | Designed Handler (routing-rules.yaml) | Actual Handler (registry.yaml) | Gap |
|-------|--------------------------------------|-------------------------------|-----|
| INTAKE | event-watcher (stamps stage:intake) | event-watcher (only triggers task-score, no stage stamp) | **event-watcher doesn't implement designed behavior** |
| EVALUATE | task-evaluator | (none) | **No job registered** |
| ROUTE | task-investigator | task-investigator (picks up `auto:candidate`, not `stage:route`) | **Mismatch** |
| REVIEW | ai-david / dashboard | (manual only in dev) | No ai-david job in dev |
| QUEUE | (passive) | (passive) | None |
| EXECUTE | task-executor + variants | task-executor only | **No task-research, task-executor-infra, bug-fixer, security-reviewer** |

### Gates (What Blocks a Ticket)

**Dispatch blockers** (from `routing-rules.yaml` — prevent executor pickup even at `stage:queue`):

| Gate | Mechanism |
|------|-----------|
| `waiting:human` | In dispatch_blockers list; executors skip |
| `waiting:session` | In dispatch_blockers list; executors skip |
| `needs-input` | In dispatch_blockers list; executors skip |
| `parked` | In dispatch_blockers list; executors skip |
| `blocked:dependency` | In dispatch_blockers list; executors skip |

**Label mutex group blockers** (from `label-ops.sh` — in the same mutex group as `parked`, so mutually exclusive):

| Gate | Mechanism |
|------|-----------|
| `waiting:external` | Mutex group member (not in dispatch_blockers but in executor skip_if_any) |
| `waiting:subtasks` | Mutex group member |
| `waiting:trigger` | Handled by `isDeferred()` in dashboard → deferred column |

**Dashboard blocker labels** (from `board.ts` BLOCKER_LABELS — determines Blocked column):
`waiting:david`, `waiting:external`, `waiting:subtasks`, `waiting:session`, `needs-input`, `manual-action`, `pipeline:needs-approval`, `blocked:*`

**BUG: `waiting:human` is NOT in the dashboard BLOCKER_LABELS.** Tasks with `waiting:human` appear in Backlog, not Blocked.

**Indirect gates**:

| Gate | Mechanism |
|------|-----------|
| `agent:human` | Not a direct blocker — task-score converts `agent:human` → `waiting:*`, which then blocks indirectly |
| `type:research` | Causes task-executor to skip (in skip_if_any); requires task-research executor which has no registry job in dev |
| `capability:infrastructure` | Causes task-executor to skip; requires task-executor-infra which has no registry job in dev |

### Throughput (measured 2026-04-25, pre-v2 limits)

| Job | Observed Tickets/Run | Workflow Cap | Runs/Hour (20-min cycle) | Bottleneck |
|-----|---------------------|-------------|--------------------------|------------|
| task-score | 8 (of 12 eligible) | 20/run | 3 | Fast — label-only ops |
| task-investigator | 5 evaluated, 1 promoted (at 40-turn limit) | 5/run | 3 | CLAUDE.md context load; judgment calls on each ticket |
| task-executor | 4 closed + 3 skipped (at 60-turn limit) | no cap | 3 | Execution time per ticket (1-5 min each) |

**After v2 limit removal** (200 turns, $50, 10-min cycles — measured same session):

| Job | Observed Tickets/Run | Runs/Hour (10-min cycle) |
|-----|---------------------|--------------------------|
| task-investigator | 5 in 37 turns | 6 |
| task-executor | 7 processed (4 closed, 3 skipped) in 50 turns / $1.27 | 6 |

**End-to-end time for a single ticket** (worst case, no fast-track):
- Created → scored (next task-score cycle): 0-20 min (pre-v2) / 0-10 min (post-v2)
- Scored → investigated (next investigator cycle): 0-20 min / 0-10 min
- Investigated → executed (next executor cycle): 0-20 min / 0-10 min
- **Pre-v2 total: 0-60 min. Post-v2 total: 0-30 min.**

With fast-track (risk:safe + auto:ready at creation): as fast as the next executor cycle (0-10 min post-v2).

**Caveat**: These measurements are from a single test session with 12 tickets. Throughput with larger ticket volumes or more complex tasks will differ.

---

## Part 2: Current Problems

### P1: Three-System Confusion (Pulse Status vs Board Column vs Stage Label)
Three tracking systems overlap: Pulse stores a simple status (`open`/`in_progress`/`closed`), the dashboard computes board columns from a mix of status + labels via `classifyTask()`, and the pipeline operates on `stage:*` labels. A ticket at `stage:review` with `waiting:human` lands in the **Backlog** board column because `classifyTask()` doesn't recognize `waiting:human` as a blocker (see P2). The board has a Stage toggle (`KanbanPage.tsx:94`, default `'status'`), but even in stage view there's no explanation of *why* a ticket is at a given stage.

### P2: `waiting:human` is Not Recognized by the Dashboard (BUG)
The dashboard's BLOCKER_LABELS list (`board.ts`) includes `waiting:david` but **not `waiting:human`**. This means:
- Tasks with `waiting:human` appear in **Backlog**, not **Blocked**
- There's no banner, badge, or alert indicating tickets need human attention
- You have to manually read label lists to discover review-needed tickets
- 5 of the 12 test tickets had `waiting:human` and were invisible as needing action

This is a code bug, not just a UI gap. Either `waiting:human` should be added to BLOCKER_LABELS, or the pipeline should use `waiting:david` instead of `waiting:human`.

### P3: Activity is Opaque
When a ticket sits at `stage:queue`, there's no indication of *when* the executor will pick it up, *what* the executor will do with it, or *whether* it was already attempted and failed. The pipeline looks frozen to the observer. Activity data exists in `label-mutations.jsonl` and `cost-ledger.jsonl` but no UI reads it.

### P4: Investigator Context Overhead
At the pre-v2 40-turn limit, the investigator processed 5 tickets in 37 turns but only promoted 1 (the other 4 were sent to `waiting:human` due to conservative judgment). A previous run processed only 1 ticket in 41 turns before hitting the cap. The CLAUDE.md context load (~15-20 turns of reading) leaves limited turns for actual evaluation. After v2 limit removal (200 turns), this bottleneck should be substantially reduced — untested at scale.

### P5: Budget/Turn Limits Prevented Pipeline Operation
Pre-v2 limits (10-60 turns, $1-6 budgets) actively prevented the pipeline from working. Observed failures:
- **health-summary**: Hit max_turns (10) without completing
- **task-investigator**: 41 turns consumed evaluating 1 ticket, leaving no room for more
- **task-executor**: Successfully closed tickets but couldn't reach Pulse to finalize (PULSE_URL bug, separate issue)

No direct evidence of executor budget-limit failures was observed — the executor's failure was the PULSE_URL 404, not budget exhaustion.

### P6: Score → Investigate → Execute is Redundant for Simple Tasks
A `[VERIFY]` task with `risk:safe` goes through three separate LLM invocations (score, investigate, execute) when a single pass could score it AND execute the verification in one shot. Measured: 3 cycles × 10-20 min wait = up to 60 min for work that takes 2 min to execute.

### P7: Designed Architecture vs Running Architecture (NEW)
`routing-rules.yaml` defines a comprehensive pipeline with 6 stages, 5 specialized executors, and event-driven routing. The actual running system implements a fraction of this:
- **Stage labels**: INTAKE is never stamped (event-watcher doesn't do it). EVALUATE has no job. ROUTE's job picks up different criteria than designed.
- **Executors**: Only task-executor exists. task-research, task-executor-infra, bug-fixer, and security-reviewer have no registry entries. Tickets labeled for these specialists get stuck.
- **Event-watcher**: Only triggers task-score on new tasks. Doesn't implement intake stamping, fast-track routing, or approval-triggered dispatch.
- **Implication**: routing-rules.yaml is aspirational documentation, not a description of the running system. The v2 redesign should start from what actually runs, not from what routing-rules.yaml describes.

### P8: `type:research` Routing Dead-End (NEW)
task-score labels investigation tasks with `type:research`. task-executor's `skip_if_any` excludes `type:research`. But no `task-research` job exists in the dev registry. Result: tasks with `type:research` are permanently stuck at `stage:queue` — scored, approved, but no executor will ever pick them up.

---


## Part 3: Redesign Proposal — Pipeline v2.1

> **Revision note (2026-04-25)**: Incorporates user feedback on pipeline simplification, event-based progression, context chaining, zero limits, and live transparency. The original v2 proposal (triage/approved/active/done) is superseded by this Evaluate→Orchestrate→Execute model.

### Design Principles

1. **Three services, three concerns**: Evaluate (is it safe? who does it? does it need splitting?), Orchestrate (how do tasks relate? what order? chain contexts?), Execute (do the work). Happy path is 3 steps.
2. **Event-based progression**: Label state changes drive pipeline actions — NOT timers. Pulse fires webhooks on every label mutation; the event-watcher receives them and immediately triggers the appropriate service (with 60s fallback poll for reliability). No more independent cron intervals for each job.
3. **Context chaining via session IDs**: Related tasks share Claude session context via `claude -r <session-id> -p "prompt"`. The Orchestrate service groups tasks, determines execution order, and chains session IDs so sequential tasks inherit cached context — eliminating redundant CLAUDE.md reads and leveraging Anthropic's 5-minute prompt cache TTL.
4. **Zero limits**: Budget checks, turn limits, and timeout caps are REMOVED entirely. The Evaluate + Orchestrate pipeline handles right-sizing through intelligent decomposition. Watchdog collects telemetry (runtime, tokens, turns) from active `claude -p` processes but does NOT kill them. Watchdog CAN reset label states on tickets that stop advancing (returning stuck tickets to Staging for re-evaluation).
5. **Transparency**: Every ticket shows LIVE execution data — token usage, turn count, elapsed time, prompt, persona, model. Users can click a ticket and peek at the active Claude session's message buffer. Glowing/pulsing visual cues indicate which pipeline action is in progress.
6. **Binary safety, not risk scoring**: No fine-grained `risk:safe/moderate/destructive` levels. Evaluate performs a common-sense sweep: block only clearly destructive/nefarious actions (wiping databases, force-pushing to shared repos, modifying credentials). Everything else passes. Blocked tasks are surfaced prominently in the UI for human review.
7. **Local models for pipeline management**: Stage, Evaluate, Orchestrate, and Review/Diagnose run on local models (qwen3:32b via Ollama HTTP API at `localhost:11434/api/generate`) for speed and zero cost. Latency TBD during testing (~2-5s estimated for 32b model). Only Execute uses Claude (sonnet/opus via LiteLLM).
8. **Standardized intake**: Every task enters the pipeline through a Stage service that converts raw ideas/prompts into fully configured ticket objects. This applies whether the task comes from a human (via dashboard UI template), an agent (via API), or a CLI command. The Stage service ensures consistent ticket structure, telemetry emission, and audit logging.

### Pipeline Flow

```
[Staging:wait] → (Stage) → [Staging:done] → (Evaluate) → [Evaluated] → (Orchestrate) → [Queued] → (Execute) → [Active] → (Review) → [Completed]
                                                                                                        ↓
                                                                                                  (Diagnose)
                                                                                                        ↓
                                                                                                  [Staging:wait] retry
                                                                                                  OR [Blocked]
```

**Intake path**: Raw idea/prompt → ticket created at `staging:wait` → Stage service configures → `staging:done`
**Happy path**: Staging → Evaluated → Queued → Active → Completed (4 services, 6 board columns)
**Block path**: Evaluate blocks → [Blocked] (surfaced in UI, human clicks Unblock → back to `staging:wait`)
**Fail path**: Review fails → Diagnose reads logs → redesigns task → back to `staging:wait` for re-staging
**Decompose path**: Evaluate splits task → children created at `staging:wait` → parent re-enters pipeline after all children complete (Orchestrate orders parent execution after children via chain metadata)

### Label State Machine

Every task carries 6 label dimensions, always present. Each dimension maps to exactly one pipeline service's output. The combination of values determines board column placement and which service should act next.

| Dimension | Values | Service Owner | Meaning |
|-----------|--------|---------------|---------|
| `staging` | `wait` / `done` / `blocked` | Stage | Has the raw idea been configured into a structured ticket? `wait` = awaiting configuration |
| `evaluated` | `no` / `done` / `blocked` | Evaluate | Has the ticket passed safety, persona assignment, and decomposition checks? |
| `queued` | `no` / `done` / `blocked` | Orchestrate | Has the ticket been grouped, ordered, and chain-linked? |
| `active` | `no` / `running` / `done` / `blocked` | Execute | Is the ticket being executed? `running` = Claude working, `done` = execution finished |
| `completed` | `no` / `done` | Review | Has the execution output been verified? `done` = terminal success |
| `blocked` | `no` / `yes` | Any (+ human unblock) | Is the ticket blocked? Overrides all other dimensions for board placement |

**Board column mapping** (replaces `classifyTask()`):

| Board Column | Label Condition | Visual Cue |
|--------------|----------------|------------|
| **Staging** | `staging:wait` OR (`staging:done AND evaluated:no`) | Glows when Stage or Evaluate is actively processing |
| **Evaluated** | `staging:done AND evaluated:done AND queued:no` | Static — waiting for Orchestrate batch |
| **Queued** | `queued:done AND active:no` | Glows when Orchestrate is processing this batch |
| **Active** | `active:running OR active:done` | Glows when `active:running` (executing); dim glow when `active:done` (review in progress) |
| **Completed** | `completed:done` | Static — terminal state (swept after 36h, 5 most recent shown) |
| **Blocked** | `blocked:yes` (any other labels) | Red badge, always prominent. Shows `reason:*`. **Unblock button** visible per ticket. |

**Task creation default labels**: When a ticket is created (via UI, API, or CLI), all dimensions initialize:
```
staging:wait, evaluated:no, queued:no, active:no, completed:no, blocked:no
```

### Event-Watcher as State Machine Driver

The event-watcher becomes the central pipeline driver. Instead of multiple independent cron jobs, a single fast-polling loop (30s interval) checks label states and triggers services:

```
Event-watcher (webhook-driven + 60s fallback poll):
  On webhook received OR poll tick:
  1. Read affected task's labels (webhook provides task_id; poll queries all open tasks)
  2. Atomic claim via conditional-update, then trigger:
     ┌───────────────────────────────────────────────────────────┬──────────────────────────────┐
     │ Label Condition                                           │ Action                       │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ staging:wait AND blocked:no                               │ → trigger Stage              │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ staging:done AND evaluated:no AND blocked:no              │ → trigger Evaluate           │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ staging:done AND evaluated:done AND queued:no AND blocked:no │ → trigger Orchestrate (batch, single-instance guarded) │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ queued:done AND active:no AND blocked:no                  │ → trigger Execute            │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ active:done AND completed:no AND blocked:no               │ → trigger Review             │
     ├───────────────────────────────────────────────────────────┼──────────────────────────────┤
     │ Invalid combination (e.g., staging:wait AND active:running)│ Watchdog: reset to staging:wait + log │
     └───────────────────────────────────────────────────────────┴──────────────────────────────┘
  3. Watchdog pass: detect invalid label combos, reset to staging:wait, log event
  4. Watchdog telemetry: scrape active claude -p process metadata (PID, runtime, token counts from JSONL)
  5. Metrics: log trigger counts, reset counts, label state distribution, process telemetry
```

**Orchestrate single-instance guard**: Orchestrate is a batch operation that reads multiple tasks. To prevent concurrent Orchestrate instances from producing conflicting chain assignments, the event-watcher uses a simple lock file (`.claude/jobs/state/orchestrate.lock`). If the lock exists and the PID inside is still alive → skip. If PID is dead → remove stale lock and proceed. The lock is created before launch and removed on completion. This is simpler and more robust than distributed locking.

**Architecture**: Pulse emits webhooks on every label mutation and task creation. The event-watcher runs a lightweight HTTP server (Flask, ~30 lines on port 8810) that receives webhook POSTs and immediately triggers the appropriate service. A 60s background poll runs as a safety net in case a webhook delivery fails.

**Pulse webhook implementation** (in `app.py`):
- New table: `webhooks` (url TEXT, events TEXT[])
- On label add/remove/transition: `POST` to all registered webhook URLs with `{task_id, event_type, label, timestamp}`
- On task creation: `POST` with `{task_id, event_type: "task:created"}`
- Async delivery via `threading.Thread` (don't block the API response)
- Event-watcher registers itself on startup: `POST /api/v1/webhooks {url: "http://localhost:8810/webhook", events: ["label:change", "task:create"]}`

**Race condition prevention** (atomic claim): The event-watcher MUST NOT use read-then-write for label transitions. Instead, use a **conditional label update** — a single Pulse API call that atomically sets the label only if the precondition holds:
```
POST /api/v1/tasks/{id}/conditional-update
{
  "precondition": {"label_value": "staging:wait"},
  "set_label": "staging:done"
}
→ 200 OK (claimed) or 409 Conflict (already claimed by another event)
```
If 409 → skip. The label mutation IS the lock. This prevents duplicate Evaluate/Orchestrate/Execute launches when rapid webhook events arrive for the same task. Pulse's single-process DB guarantees serialization.

**Fallback**: 60s background poll catches any missed webhook events. This is insurance, not the primary mechanism.

**Pulse metadata**: Tasks already have a `metadata JSONB DEFAULT '{}'` column (`app.py:70`). Chain data, session IDs, compressed summaries, and telemetry are stored here — no schema changes needed for metadata support.

### Service Definitions

#### Stage (new — standardized pipeline intake)

**Model**: Local (qwen3:32b via Ollama HTTP API at `localhost:11434/api/generate`)
**Trigger**: Webhook → event-watcher detects `staging:wait AND blocked:no`
**Duration**: 15-30s per ticket
**Purpose**: Convert raw ideas/prompts into fully configured ticket objects

**Entrypoints** (all produce tickets at `staging:wait`):
- **Dashboard UI**: User fills in a ticket template (title + raw prompt), hits "Stage" button → creates ticket at `staging:wait`
- **Pulse API**: Agent or CLI creates ticket via `POST /api/v1/tasks` → auto-initialized at `staging:wait`
- **Jarvis/AIFred CLI**: User types a command, agent calls Pulse API → `staging:wait`

What Stage does:
1. **Read raw input**: Title and user-provided prompt/description
2. **Structure the prompt**: Convert raw idea into a well-formed task prompt — clear objective, expected output, relevant file paths, scope boundaries
3. **Populate metadata**: Set priority (from keywords or explicit), project label, initial type classification (`type:verify`, `type:bug`, `type:feature`, etc.)
4. **Emit telemetry**: Log ticket creation event to `label-mutations.jsonl` with source (UI/API/CLI)
5. **Set labels**: `staging:done` (ticket is now a fully configured object, ready for evaluation)

**Note**: Stage does NOT assess safety, assign personas, or check for decomposition — that's Evaluate's job. Stage is purely about converting unstructured input into structured ticket format.

#### Evaluate (replaces task-score + task-investigator)

**Model**: Local (qwen3:32b via Ollama HTTP API at `localhost:11434/api/generate` — NOT through claude CLI. Direct curl call for speed + zero API cost.)
**Trigger**: Webhook → event-watcher detects `staging:done AND evaluated:no` (via conditional claim)
**Duration**: 30-60s per ticket
**NOT conservative** — default posture is "pass unless clearly dangerous"

What Evaluate does:
1. **Safety sweep** (binary pass/block): Is this destructive? Would it wipe a database, force-push, modify credentials, bork a project? If yes → `blocked:yes` with reason. If no → pass. No fine-grained risk scoring.
2. **Intelligibility check**: Is the prompt clear, efficient, sufficient? If vague or malformed, can Evaluate rewrite it for clarity? If unsalvageable → `blocked:yes` with `reason:unclear-prompt`.
3. **Persona assignment**: Read available personas. Match task signals (type, capability, domain, keywords) to the best persona. Store as `assigned:<persona>` label.
4. **Decomposition check**: Does the task entail multiple implied dependent stages? Good clue: if it strongly recommends two or more different personas, split. Does it ask for something HUGE (read entire codebase, analyze 100 files)? Split into smaller batched tasks with dependency links. Each child gets its own staging and evaluation.
5. **Set labels**: `evaluated:done`. If decomposed: parent gets metadata `decomposed:true` + `depends-on:[child-ids]`; children created at `staging:wait`. Orchestrate will order the parent's execution AFTER all children complete (via chain metadata).

#### Orchestrate (new service)

**Model**: Local (qwen3:32b via Ollama HTTP API (`localhost:11434/api/generate`))
**Trigger**: Event-watcher detects batch of tasks at `ready:done AND queued:no` (runs when ≥1 task ready)
**Duration**: 1-3 min per batch

What Orchestrate does:
1. **Survey the board**: Read ALL evaluated tasks (`evaluated:done AND queued:no`) plus tasks already in progress (`active:running`) and recently completed (<60 min, `completed:done`).
2. **Group by relatedness**: Same `project:` label? Same component keywords? Same area of codebase? Group them.
3. **Order for context efficiency**: Within each group, simplest/fastest tasks first (warm up the context), context-dependent tasks later.
4. **Session chaining**: Write chain metadata to Pulse task `metadata` JSONB field: `{chain_id, chain_order, chain_size}`. The first task in a chain gets no resume flag. Subsequent tasks get `chain_resume: <session-id>` populated after the previous task completes.
5. **Dependency analysis**: Check for tasks that absolutely require another task completed first. Write `depends_on: [task-ids]` to metadata. Check for dependency loops — break them if found.
6. **Decomposed parent handling**: When a parent task has `decomposed:true` in metadata, Orchestrate places the parent at the END of its children's chain (chain_order = last). The parent only becomes executable after all children reach `completed:done`. This uses the same chain mechanism — no special infrastructure needed.
7. **Set labels**: `queued:done` on all orchestrated tasks. Tasks with unresolved dependencies get `queued:done` but also `blocked:yes, reason:dependency` until dependencies resolve.

**All chain/dependency data stored in task `metadata` JSONB** (not labels). Machine-readable and human-intelligible. Labels remain clean for pipeline state only.

**Context chaining architecture**:
```
Chain A (3 dashboard UI tasks):
  AION-001 "Fix sidebar button"
    → claude -p "prompt + epilogue" --session-id <uuid-1>    (fresh session)
    → produces compressed-context summary as final output
  AION-002 "Fix navbar alignment"
    → claude -r <uuid-1> -p "prompt + epilogue" --session-id <uuid-2>
    → resumes AION-001's session (CLAUDE.md already cached)
    → produces compressed-context summary
  AION-003 "Fix footer links"
    → claude -r <uuid-2> -p "prompt + epilogue"
    → resumes chain, inherits all prior context
    ...
  AION-008 "Fix modal z-index"  (deep in chain, context getting heavy)
    → executor detects JSONL transcript > threshold
    → switches to COMPRESSED MODE: fresh session, injects summary from AION-007
    → claude -p "Context from prior work: [compressed summary]. New task: ..."
    → cache miss on switch, but context is light and chain continues indefinitely
```

**Two chaining modes** (executor auto-selects):
- **Resume mode** (default): `claude -r <prev-session> -p "prompt"` — full conversation + cache warmth
- **Compressed mode** (when context heavy): Fresh session with compressed summary injected — lighter, unlimited chain length

**Lightweight JICM epilogue** (built into every task prompt):
Every `claude -p` task includes a prompt epilogue that instructs Claude to produce a compressed context summary as its final output:
```
After completing all task work, produce a context summary as the LAST thing you output.
Format as JSON in <context-summary> tags:
<context-summary>
{
  "task_completed": "brief description of what was done",
  "files_modified": ["path1", "path2"],
  "key_findings": ["finding about codebase"],
  "gotchas": ["issues encountered"],
  "context_for_next": "relevant context for the next related task"
}
</context-summary>
```
The executor parses this from the JSONL output and stores it in Pulse task metadata. The next task in the chain always has this summary available — either as supplemental context (in resume mode) or as primary context (in compressed mode).

**Mode transition threshold**: When the previous task's JSONL transcript exceeds ~200K tokens (estimated from file size), the executor switches to compressed mode for the next task. Resume mode is always preferred when context window allows it.

**Edge case — missing epilogue**: If a task fails early (timeout, crash, error before epilogue), the `<context-summary>` won't be present in the JSONL. In this case: skip compressed summary for the next task in the chain. The next task uses resume mode if within size threshold, or starts a fresh session with no inherited context. The Review/Diagnose cycle handles the failed task separately.

**Constraints on chaining**:
- Chain tasks within a chain are serialized (sequential execution preserves cache)
- Unrelated chains execute in parallel (no artificial concurrency limit)
- If a task fails mid-chain, subsequent tasks can still proceed (they inherit compressed context from the last successful task)
- No chain length limit — compressed mode transition makes chains unlimited

#### Execute (enhanced)

**Model**: Claude (sonnet/opus via LiteLLM, selected by persona config)
**Trigger**: Event-watcher detects `queued:done AND active:no`
**Duration**: 1-30 min per task

What Execute does:
1. **Read chain metadata**: Check Pulse task metadata for `chain-resume`. If present AND previous JSONL < 200K tokens → **resume mode**: `claude -r <session-id> -p "prompt + epilogue"`. If present but context heavy → **compressed mode**: `claude -p "Context: [summary]. Task: [prompt] + epilogue"`. If no chain → fresh session.
2. **Pre-assign session ID**: Generate UUID, pass `--session-id <uuid>` to claude. Store UUID in Pulse metadata for chaining.
3. **Append JICM epilogue**: The prompt template always includes the compressed-context epilogue instruction (see Context Chaining section above). This ensures every task produces a summary for the next task in the chain.
4. **Set labels**: `active:running` when claude process starts.
5. **Write sidecar file**: `<task-id>.exec.json` to `.claude/jobs/active/` with: `{session_id, transcript_path, pid, start_time, prompt, persona, model}`. This powers live monitoring.
6. **Execute**: Run the task with assigned persona. No turn limits. No budget limits. No concurrency limits — parallel unrelated chains run simultaneously.
7. **On completion**: Parse `<context-summary>` from JSONL output. Store compressed summary in Pulse task metadata. Set `active:done`. Write session ID to task metadata. Propagate session ID + compressed summary to next task in chain (if any). Delete sidecar file.
8. **On process death**: Watchdog detects via PID check. Resets to `queued:done, active:no` for retry. Logs telemetry (runtime, tokens consumed).

#### Review (new, post-execution verification)

**Model**: Local (qwen3:32b via Ollama HTTP API (`localhost:11434/api/generate`))
**Trigger**: Event-watcher detects `active:done AND completed:no`
**Duration**: 30-60s per ticket

What Review does:
1. **Read execution output**: Check the task's execution log/results.
2. **Verify expected outcomes**: Did the files change as expected? Does the build pass? Were the right files touched?
3. **Pass**: Set `completed:done`. Task moves to Completed column.
4. **Fail**: Trigger Diagnose.

#### Diagnose (triggered by Review failure, not independently)

**Model**: Local (qwen3:32b via Ollama direct) — same model as Review. If local proves insufficient after testing, fall back to Sonnet.
**Trigger**: Review failure
**Duration**: 1-5 min

What Diagnose does:
1. **Read logs and message history**: Parse the JSONL transcript from the failed execution.
2. **Identify failure mode**: Hang? Error? Wrong output? Missing context?
3. **Redesign the task**: Rewrite the prompt, adjust persona, split if needed.
4. **Route**: Send redesigned task back to [Staging] (`staging:wait, evaluated:no, queued:no, active:no, completed:no, blocked:no`) for re-staging and re-evaluation. Increment `retry-count:<N>`. If `retry-count` ≥ 3, send to `blocked:yes, reason:max-retries`.

### Zero Limits Policy

**Removed entirely** (not raised — GONE):
- ~~`max_turns`~~: Deleted from registry.yaml. Claude runs until done.
- ~~`max_budget_usd`~~: Deleted from registry.yaml. Cost tracking continues as pure observability.
- ~~Budget pre-flight (`executor.sh:900-939`)~~: Disabled via `AIFRED_DISABLE_BUDGET_CHECK=true` in .env.
- ~~Per-job turn/budget overrides~~: Deleted.

**Why this is safe**: The Evaluate service handles right-sizing. A task like "read 100 books and find commonalities" gets decomposed into 20 smaller tasks by Evaluate. If Evaluate and Orchestrate aren't decomposing the task, then the task is appropriately scoped and safe to run uncapped.

**No hard-stop enforced**: Even the process watchdog does NOT kill long-running tasks. Instead, Watchdog collects telemetry:
- Runtime duration per `claude -p` process (PID tracking)
- Token usage scraped from JSONL transcript metadata (input/output counts)
- Turn count per session
- Cost per execution (from cost-ledger.jsonl)
After sufficient telemetry data is collected, we can empirically derive an optimal hard-stop threshold based on real-world task distributions — not an arbitrary guess.

**Observability continues** (never gates, only reports):
- Cost ledger (`cost-ledger.jsonl`) still records per-run token costs
- Session metadata tracks input/output tokens per task
- Dashboard shows cost/token data for transparency
- Watchdog metrics track per-process runtime, tokens, turns, cost
- Telemetry data feeds future decision on whether a hard-stop is warranted

### Components Summary

| Component | Type | Replaces | Model | Trigger |
|-----------|------|----------|-------|---------|
| **event-watcher** | Python service (HTTP webhook receiver + 60s fallback poll) | event-watcher + dispatcher schedule logic + pipeline-watchdog | N/A | Webhook-driven |
| **stage** | service (launched by event-watcher) | (new — pipeline intake) | Local (qwen3:32b) | Label: `staging:wait` |
| **evaluate** | service (launched by event-watcher) | task-score + task-investigator | Local (qwen3:32b) | Label: `staging:done AND evaluated:no` |
| **orchestrate** | service (launched by event-watcher, single-instance guarded) | (new) | Local (qwen3:32b) | Label: `evaluated:done AND queued:no` batch |
| **executor** | service (launched via dispatcher) | task-executor (enhanced) | Claude (sonnet/opus) | Label: `queued:done AND active:no` |
| **reviewer** | service (launched by event-watcher) | (new) | Local (qwen3:32b) | Label: `active:done AND completed:no` |
| **watchdog** | integrated into event-watcher | pipeline-watchdog (absorbed) | N/A | Every poll cycle + PID telemetry scraping |

**Current system**: 3 registry jobs + 3 launchd agents = 6 components, timer-driven.
**Proposed**: 1 event-watcher (Python, drives everything) + 5 services (Stage, Evaluate, Orchestrate, Execute, Review/Diagnose) = 6 logical components, event-driven.

**Language decision (H7)**: The event-watcher is rewritten as a **Python script** (not bash). It needs an HTTP server for webhooks (Flask), JSON parsing for label state logic, and process management for launching services. Python is more robust, transparent, and maintainable than bash for this complexity level. The existing bash event-watcher.sh (~40 lines) is archived. Stage, Evaluate, Orchestrate, and Review are also Python scripts calling Ollama's HTTP API. The dispatcher (bash) remains for launching executor.sh (Claude -p invocations).

**Non-pipeline jobs** (health-summary, context-maintenance, pipeline-review) remain timer-based via `registry.yaml` and dispatcher. They are NOT affected by the event-driven pipeline redesign. Their settings are surfaced at `http://localhost:8701/jobs`. Pipeline service settings are surfaced at `http://localhost:8701/nexus-ops` (separate page).

---

## Part 4: Dashboard Redesign — Transparency + Live Monitoring

### 4.1 Board Page (`/board`) — Pipeline View Default

Default view becomes the 6 pipeline columns: **Staging → Ready → Queued → Active → Completed → Blocked**.

No more Status/Stage toggle confusion — the pipeline IS the default. A "Classic View" toggle is available for backward compatibility but secondary.

Each card shows:
- **Title** (truncated)
- **Priority stripe** (color-coded left border)
- **Assigned persona badge** (e.g., `researcher`, `bug-fixer`)
- **Time in stage** ("3m ago", "2h ago")
- **Chain badge**: `🔗 2/5` if part of an orchestrated chain (position/total)
- **Glow effect**: Pulsing border/shadow when a pipeline action is in progress for this task's current column:
  - Staging + glow = Evaluator running on this ticket
  - Queued + glow = Orchestrator processing this batch
  - Active + glow = Claude -p instance running
  - Completed + glow = Reviewer checking results

**Implementation**: Glow state determined by in-progress sidecar files (`.claude/jobs/active/<task-id>.exec.json` for Execute, `<task-id>.eval.json` for Evaluate, etc.). Dashboard polls sidecar directory every 5s. File exists = action in progress = glow.

The **Blocked** column gets a prominent red badge count in the header and is always visible:
```
BLOCKED (3)  ← red badge
├── [P1] Projects page empty — reason: destructive (2h)
├── [P2] Wipe staging DB — reason: destructive (45m)
└── [P3] Unclear task desc — reason: unclear-prompt (1h)
```

### 4.2 Live Task Detail (click-to-peek)

When a user clicks a ticket on the board, a detail pane opens showing execution state:

**For tasks in [Active] stage** (claude -p running):
```
┌──────────────────────────────────────────────────────────────┐
│ AION-90d3f5da — "Fix dispatcher heartbeat alert"             │
│ Status: ACTIVE (executing)                                    │
│                                                              │
│ ┌──── Execution Info ───────────────────────────────────────┐│
│ │ Persona:  autofix-executor                                 ││
│ │ Model:    claude-sonnet-4-6                                ││
│ │ Prompt:   "Fix the dispatcher heartbeat alert level from   ││
│ │           warning to info when no stuck tasks detected..." ││
│ │ Session:  550e8400-e29b-41d4-a716-446655440000            ││
│ └───────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──── Live Metrics ─────────────────────────────────────────┐│
│ │ Elapsed:  2m 38s                                           ││
│ │ Turns:    14                                               ││
│ │ Tokens:   45,230 input / 12,450 output                    ││
│ └───────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──── Session Chain ────────────────────────────────────────┐│
│ │ AION-508ca9a8 (session abc123) ──► AION-90d3f5da (def456)││
│ │                                    ▲ YOU ARE HERE         ││
│ │ ──► AION-c41725e1 (pending)                               ││
│ └───────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──── Activity Peek ────────────────────────────────────────┐│
│ │ [17:32:05] 🔧 Read dashboard/frontend/src/lib/board.ts   ││
│ │ [17:32:08] 🔧 Edit KanbanPage.tsx (line 45-52)           ││
│ │ [17:32:12] 💬 "I'll update the alert severity from..."   ││
│ │ [17:32:15] 🔧 Bash: npm run build                        ││
│ │ [17:32:22] ✅ Build succeeded                             ││
│ │ [17:32:23] 🔧 Bash: git diff --stat                      ││
│ │            ▼ auto-scrolling...                             ││
│ └───────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──── Pipeline History ─────────────────────────────────────┐│
│ │ 17:05  Created (agent:jarvis)                              ││
│ │ 17:06  staging:staged — Evaluate started                   ││
│ │ 17:06  staging:done, ready:done — passed, autofix-executor ││
│ │ 17:10  queued:done — Orchestrated: chain-A, pos 2/3       ││
│ │ 17:30  active:running — Execute started                    ││
│ └───────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Data sources for live metrics**:
- **Token counts**: Parsed from Claude Code JSONL transcript (each message includes token metadata)
- **Turn count**: Count of user/assistant message pairs in transcript
- **Elapsed time**: Sidecar file `start_time` vs current time
- **Prompt**: The `-p` argument stored in sidecar file
- **Session chain**: `chain:*` and `chain-resume:*` labels on related tasks
- **Activity Peek**: Tail the JSONL transcript. Extract tool calls (`name` + abbreviated `parameters`) and assistant text (truncated ~80 chars/line). Show last 10 entries with auto-scroll.

**Implementation**:
1. Executor writes sidecar file on claim: `.claude/jobs/active/<task-id>.exec.json`
2. New API endpoint `/api/v1/tasks/:id/live` reads sidecar + tails transcript JSONL
3. Dashboard polls `/live` every 5s when detail pane is open
4. When task completes, sidecar deleted; endpoint returns historical data from label-mutations.jsonl

**For tasks in other stages**: Detail pane shows Pipeline History only (no live metrics).

**Pushback on full message buffer**: Rendering complete assistant messages with markdown formatting in a real-time inset window is significant frontend work. The Activity Peek above (tool calls + truncated text) captures ~90% of the observability value at ~20% of the effort. Full message rendering is a Phase 2 stretch goal (requires WebSocket streaming + markdown renderer).

### 4.3 Blocked Banner + Unblock Mechanism

When ANY task has `blocked:yes`, show a persistent banner at top of Board and Tasks pages:
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ 3 tasks blocked — awaiting your review                   │
│ [View Blocked →]                                 [Dismiss]  │
└─────────────────────────────────────────────────────────────┘
```

**Unblock button**: Each blocked ticket in the Blocked column has an **[Unblock]** button. Clicking it:
1. Removes `blocked:yes` and `reason:*` labels
2. Resets ALL dimension labels to `staging:wait, evaluated:no, queued:no, active:no, completed:no, blocked:no`
3. The ticket re-enters the pipeline from the beginning (Stage → Evaluate → ...)
4. Webhook fires → event-watcher picks it up immediately

Future enhancement: AI Unblocker service that uses Review/Diagnose to auto-evaluate blocked tickets and determine if they can be safely unblocked (deferred to post-v2.1).

### 4.4 Board-Level Active State API

New endpoint `GET /api/v1/pipeline/active` returns which task IDs currently have active sidecar files (needed for board-level glow effects). Response:
```json
{
  "staging": ["AION-abc123"],
  "evaluating": ["AION-def456"],
  "executing": ["AION-ghi789", "AION-jkl012"],
  "reviewing": ["AION-mno345"]
}
```
Dashboard polls this every 5s. Determines glow state per card on the board without opening individual task details.

### 4.4 Activity Timeline on Task Detail (historical)

Every task gets a full pipeline history timeline (from label-mutations.jsonl):
```
17:05  Created (agent:jarvis)
17:06  Evaluate: passed — safe, persona:autofix-executor
17:10  Orchestrate: chain-A position 2/3, chained to AION-508ca9a8
17:30  Execute: started — sonnet, session def456
17:32  Execute: completed — 2m 38s, 57,680 tokens, $0.18
17:33  Review: passed — output verified
17:33  → Completed
```

### 4.5 Job Settings Pane (`/jobs`)

Simplified — limits removed:
- **Enable/disable**: toggle (fix currently broken state persistence)
- **Last run**: timestamp + duration + tokens + outcome
- **Next trigger**: "event-based" indicator (not a countdown timer)
- ~~**Max turns**~~: removed
- ~~**Max budget**~~: removed
- ~~**Process timeout**~~: removed (Watchdog collects telemetry only, no enforcement)

---

## Part 5: Implementation Plan (Revised for v2.1)

### Phase 1: Quick Wins (DONE — 2026-04-25)
1. ~~Removed artificial limits (200 turns / $50 / 30min)~~ DONE
2. ~~Fixed PULSE_URL for dev environment~~ DONE
3. ~~Board: showClosed defaults true, "Hide Closed" button~~ DONE

### Phase 2: Immediate Fixes (~30 min)
1. Add `waiting:human` to BLOCKER_LABELS in `board.ts` (1 line — interim fix before label refactor)
2. Change KanbanPage default viewMode to `'stage'` (1 line)
3. Add `AIFRED_DISABLE_BUDGET_CHECK=true` to dev .env (kills budget pre-flight)
4. Remove all per-job `max_turns` and `max_budget_usd` from `registry.yaml`

### Phase 3: Pulse Server Enhancements (~3h)
1. Add `webhooks` table to Pulse DB schema (url, events[], created_at)
2. Add `POST /api/v1/webhooks` registration endpoint
3. Add webhook firing to label mutation code path in `app.py` (async via threading)
4. Add webhook firing to task creation endpoint
5. Add `POST /api/v1/tasks/{id}/conditional-update` endpoint — atomic label claim with precondition check (supports multi-label preconditions). Returns 200 OK or 409 Conflict.
6. Add `GET /api/v1/pipeline/active` endpoint — returns task IDs with active sidecar files (for board glow)
7. Verify metadata JSONB field is fully exposed in API responses and writable via `pulse update --metadata`
8. Update Pulse `TRANSITIONS` dict to support new label dimensions (staging/evaluated/queued/active/completed/blocked)
9. Deprecate old transitions referencing `stage:*` / `auto:*` labels
10. Test: register webhook, create task, verify POST received + conditional-update works

### Phase 4: Label State Machine + Dashboard (~3h)
1. Define new label dimensions in `label-ops.sh` (staging/evaluated/queued/active/completed/blocked)
2. Add `initializeTaskLabels()` to Pulse server — stamp all 6 dimensions on task creation (staging:wait + 5× no)
3. Rewrite `classifyTask()` in `board.ts` to map label states → board columns (replaces current 7-step cascade)
4. Update PIPELINE_STAGE_COLUMNS to: Staging, Evaluated, Queued, Active, Completed, Blocked
5. Add Unblock button to Blocked column cards (resets all labels to staging:wait)
6. Add label state validation to watchdog (detect/fix invalid combinations)
7. Wipe dev Pulse DB for clean testing (new comprehensive test tickets created in Phase 12)
8. Generate new `routing-rules-v2.yaml` documenting the v2.1 label system. Archive old `routing-rules.yaml`.
9. Deprecate old pipeline jobs (task-score, task-investigator) — disable in registry, archive code.
10. Separate pipeline job settings to `/nexus-ops` page. Non-pipeline jobs remain at `/jobs`.

### Phase 5: Event-Driven Pipeline (~3h)
1. Rewrite `event-watcher.sh` as webhook receiver + label state machine driver
2. Add lightweight HTTP server (Flask, port 8810) to receive Pulse webhooks
3. Implement trigger rules table (label combo → service launch)
4. Absorb watchdog logic (invalid combo detection + fix + log + telemetry collection)
5. Add 60s fallback poll as webhook safety net
6. Retire `registry.yaml` schedule for pipeline jobs (now webhook-triggered)
7. Remove `MAX_CONCURRENT` from dispatcher (no concurrency limit)

### Phase 6: Stage Service (~1.5h)
1. Create `stage.py` — Python script calling Ollama (qwen3:32b) to convert raw prompts to structured tickets
2. Write staging prompt: extract objective, scope, file paths, expected output from raw user input
3. Wire event-watcher to launch `stage.py` on `staging:wait` detection
4. Add ticket creation template to dashboard UI (title + raw prompt + "Stage" button)
5. Test: create raw ticket via UI, verify auto-staging within 15-30s

### Phase 7: Evaluate Service (~2h)
1. Create `evaluate.py` — Python script calling Ollama (qwen3:32b)
2. Write evaluation prompt: safety sweep + intelligibility + persona pick + decomposition
3. Wire event-watcher to launch `evaluate.py` on `staging:done AND evaluated:no`
4. Test: create tasks, verify auto-evaluation within 30-60s

### Phase 8: Orchestrate Service (~3h)
1. Create `orchestrate.py` — Python script calling Ollama (qwen3:32b) with board context
2. Implement task grouping (project labels, keyword similarity, persona match)
3. Implement chain ordering (simplest first, context-dependent later)
4. Write chain metadata to Pulse task metadata fields (`chain:*`, `chain-order:*`, `chain-size:*`)
5. Implement dependency detection, loop-breaking, and decomposed-parent ordering
6. Add single-instance lock file guard (`.claude/jobs/state/orchestrate.lock`)
7. Wire event-watcher to trigger on `evaluated:done AND queued:no` batch

### Phase 9: Context Chaining + JICM Epilogue in Executor (~3h)
1. Executor generates UUID session ID before launching `claude` (`--session-id <uuid>`)
2. Append JICM epilogue to every task prompt (compressed-context-summary instruction)
3. Read `chain-resume:<session-id>` from task metadata → pass `-r <session-id>` flag
4. Implement resume vs compressed mode transition (check previous JSONL size > 200K tokens threshold)
5. Parse `<context-summary>` from JSONL output, store in Pulse task metadata
6. Propagate session ID + compressed summary to next task in chain
7. Dispatcher reads `assigned:<persona>` label, passes `--persona` to executor.sh

### Phase 10: Review/Diagnose Service (~2h)
1. Create `reviewer.py` — Python script calling Ollama (qwen3:32b) to verify execution output
2. Create `diagnose.py` — reads JSONL transcript, identifies failure, redesigns task
3. Wire event-watcher to trigger Review on `active:done AND completed:no`
4. Wire Review failure → Diagnose → back to `staging:wait` with `retry-count` increment in metadata

### Phase 11: Metadata API Validation (~1h)
1. Verify Pulse API exposes metadata in GET responses and accepts metadata in PUT/PATCH
2. Test: write chain metadata via API, read it back, verify round-trip
3. If API gaps found: add missing endpoints/parameters to `app.py`

### Phase 12: Test Ticket Suite + Stress Test (~2h)
1. Design comprehensive test ticket set (simple verifications, multi-file refactors, research tasks, decomposition candidates, dependency chains, unsafe tasks)
2. Create tickets on clean dev Pulse DB
3. Run full pipeline end-to-end, verify all stages fire correctly
4. Collect Watchdog telemetry baseline

### Phase 13: Live Monitoring Dashboard (~4h)
1. Executor writes sidecar files to `.claude/jobs/active/` on claim
2. Add `/api/v1/tasks/:id/live` endpoint (reads sidecar + tails JSONL transcript)
3. Add live metrics panel to task detail view (tokens, turns, elapsed, prompt, persona, model)
4. Add Activity Peek panel (tail transcript for tool calls + truncated text)
5. Add session chain diagram to detail view (chain metadata → visual graph)
6. Dashboard polls `/live` every 5s when detail pane is open

### Phase 14: Visual Cues (~1h)
1. Add glow/pulse CSS animation for in-progress actions
2. Webhook-driven glow state (sidecar file exists = action in progress = glow)
3. Blocked banner at top of Board and Tasks pages

### Phase 15: Full Message Buffer (stretch, ~4h)
1. Parse JSONL transcript for full assistant messages
2. Render markdown in inset window on task detail page
3. WebSocket for real-time streaming (replaces polling)

### Priority Ordering

| Phase | Task | Effort | Impact | Dependencies |
|-------|------|--------|--------|--------------|
| 2 | Interim fixes (BLOCKER_LABELS, stage view, kill limits) | 30 min | High | None |
| 3 | Pulse server enhancements (webhooks, conditional-update, active API, transitions) | 3h | Critical | None |
| 4 | Label state machine + dashboard (6 dimensions, classifyTask, unblock, nexus-ops, routing-rules-v2) | 3h | Critical | None |
| 5 | Event-driven pipeline (Python webhook receiver, state machine, watchdog telemetry) | 3h | Critical | Phase 3, 4 |
| 6 | Stage service (raw → configured ticket, UI template) | 1.5h | High | Phase 5 |
| 7 | Evaluate service (safety, persona, decomposition via qwen3:32b) | 2h | High | Phase 5 |
| 8 | Orchestrate service (grouping, ordering, chaining, dependency, lock guard) | 3h | High | Phase 5, 7 |
| 9 | Context chaining + JICM epilogue in executor (session IDs, resume/compressed) | 3h | High | Phase 8 |
| 10 | Review/Diagnose service (post-execution verification + auto-retry) | 2h | Medium | Phase 5 |
| 11 | Metadata API validation (verify round-trip, fix gaps) | 1h | Medium | Phase 3 |
| 12 | Test ticket suite + end-to-end stress test | 2h | Critical | Phase 6-10 |
| 13 | Live monitoring dashboard (sidecar, /live endpoint, Activity Peek, chain diagram) | 4h | High | Phase 9 |
| 14 | Visual cues (glow/pulse animations, blocked banner) | 1h | Medium | Phase 13 |
| 15 | Full message buffer (WebSocket streaming, markdown rendering) | 4h | Nice-to-have | Phase 13 |

**Estimated total**: ~33h of implementation (15 phases).
**Critical path**: Phases 2-7 (~13h) → working event-driven pipeline with Stage + Evaluate.
**Context chaining**: Phases 8-9 (~6h) → orchestration + session daisy-chaining with JICM epilogue.
**Quality + transparency**: Phases 10-14 (~10h) → Review/Diagnose + live monitoring + visual cues.
**Stretch**: Phase 15 (~4h) → full message buffer with WebSocket.

---

## Part 6: Ticket State Snapshots

### Snapshot 1: Pre-fix state (2026-04-25 14:15 UTC, 12 tickets)

| ID | Title | Labels of Interest | Issue |
|----|-------|--------------------|-------|
| AION-90d3f5da | Dispatcher heartbeat downgraded | `auto:ready`, `stage:queue` | Stuck — executor ran but couldn't close (PULSE_URL bug) |
| AION-c958e5f6 | Nexus Model Router visibility | `waiting:human` | Legitimately needs human verify |
| AION-62f27d7a | Jobs toggle switches | `waiting:human` | Legitimately needs human verify |
| AION-22be6721 | Sidebar collapse button | `waiting:human` | Legitimately needs human verify |
| AION-2e36bc38 | Nexus Status tile | `waiting:human` | Legitimately needs human verify |
| AION-613f6a3c | Nexus health endpoint | `waiting:human`, `stage:review` | Legitimately needs human verify |
| AION-74517bf9 | Personas page edit links | `auto:candidate`, `pipeline:approved` | Stuck — approved but investigator sent to `waiting:human` instead of queue |
| AION-d4376584 | Jobs history missed alerts | `auto:candidate`, `pipeline:approved` | Stuck — same misrouting |
| AION-862e0cbe | Projects page empty | `auto:candidate`, `pipeline:approved` | Stuck — same misrouting |
| AION-a2e9d700 | AI David renamed | `auto:candidate` | Waiting for investigator cycle |
| AION-508ca9a8 | Usage page terminology | `auto:candidate` | Waiting for investigator cycle |
| AION-c41725e1 | YAML line-length fixes | `auto:candidate` | Waiting for investigator cycle |

**6 tickets at `auto:candidate`** waiting for the investigator to process them. 3 of these also had `pipeline:approved` but were incorrectly routed to `waiting:human` by the investigator (contradictory labels: `auto:candidate` + `waiting:human` in same mutex group).

**5 tickets at `waiting:human`** with no dashboard indication they need attention (P2 — `waiting:human` not in BLOCKER_LABELS).

### Snapshot 2: Post-fix state (2026-04-25 14:35 UTC, after manual corrections + executor run)

| ID | Title | Result |
|----|-------|--------|
| AION-a2e9d700 | AI David renamed | **CLOSED** by autofix-executor |
| AION-90d3f5da | Dispatcher heartbeat downgraded | **CLOSED** by autofix-executor |
| AION-508ca9a8 | Usage page terminology | **CLOSED** by autofix-executor |
| AION-c41725e1 | YAML line-length fixes | **CLOSED** by autofix-executor |
| AION-74517bf9 | Personas page edit links | Manually promoted to `stage:queue`; `type:research` removed; awaiting executor |
| AION-d4376584 | Jobs history missed alerts | Same |
| AION-862e0cbe | Projects page empty | Same |
| 5 others | Various VERIFY tasks | Still at `waiting:human` |

---

## Part 7: Design Analysis — Logic Gaps & Misalignments

### Gap 1: Triage Agent Must Absorb Stage Label Management
The current task-score operates on **unlabeled tasks** (no `auto:*`, no `waiting:*`) and does NOT manage `stage:*` labels. The task-investigator operates on **`auto:candidate` tasks** and DOES manage stage labels (adds `stage:queue` when promoting). The event-watcher does NOT stamp `stage:intake` — it only triggers task-score. No component currently manages the INTAKE stage. The proposed triage agent would need to absorb: scoring (from task-score), routing + stage transitions (from task-investigator), AND intake detection (currently a gap — event-watcher only triggers, doesn't stamp). If triage doesn't own the full lifecycle from detection to stage assignment, the simplification is limited to merging score+investigate — still valuable but not the clean single-owner model described in the proposal.

### Gap 2: APPROVED State vs stage:queue Backward Compatibility
The v2 proposal renames `stage:queue` to APPROVED. But `classifyTask()` in `board.ts` maps `stage:queue` → **ready** column. Renaming the stage label breaks this mapping and all pre_check queries in registry.yaml that grep for `stage:queue`. Either the rename requires updating all consumers simultaneously, or APPROVED should be implemented as an alias/addition rather than a replacement.

### Gap 3: ACTIVE State Has No Existing Mechanism — **RESOLVED**
~~The proposal says ACTIVE shows "persona, start time, turn count live." But there's no current mechanism for this.~~
**Fix**: Executor writes sidecar files (`{task_id}.exec.json`) with persona, model, session_id, pid, start_time, log_file path. `/api/v1/tasks/:id/live` endpoint reads sidecar + tails executor log for activity_tail, log_bytes, log_lines, elapsed_seconds. Dashboard glow animations detect active sidecars via `/api/v1/pipeline/active`.

### Gap 4: FAILED State Recovery Path Is Manual — **PARTIALLY RESOLVED**
~~The proposal says FAILED tasks can "retry (re-enter APPROVED)" but doesn't specify WHO triggers the retry.~~
**Fix**: Automatic retry loop implemented: failed execution → `active:no` → diagnose service → `blocked:diagnosing` → redesign prompt → re-stage → up to 3 executor attempts (tracked in `executor_attempts` metadata). After 3 diagnose retries, task goes `blocked:yes` + `blocked:pipeline` (requires human intervention). Backoff is implicit (each cycle takes 30-60s through the pipeline).

### Gap 5: Single Executor for All Persona Types — **RESOLVED**
~~The dispatcher reads `persona` from registry.yaml, not task labels.~~
**Fix**: v2 pipeline bypasses the dispatcher entirely. `event-watcher-v2.py` reads `assigned:<persona>` labels directly and passes `PERSONA` env var to `executor.py`. Executor loads persona prompt from `.claude/jobs/personas/<name>/prompt.md`.

### Gap 6: Event-Watcher Doesn't Implement Designed Behavior — **RESOLVED (v2 replacement)**
~~The v1 `event-watcher.sh` only polls for new task IDs and triggers task-score.~~
**Fix**: `event-watcher-v2.py` fully replaces v1 behavior. Implements webhook-driven state machine with 6-dimension label system, triggers all 6 services (stage, evaluate, orchestrate, execute, review, diagnose), and handles chain dependency gating. V1 `event-watcher.sh` and `routing-rules.yaml` are deprecated.

### Gap 7: waiting:human vs waiting:david — **RESOLVED (v2 label system)**
~~Both `waiting:human` and `waiting:david` exist in different parts of the system.~~
**Fix**: v2 pipeline uses `blocked:yes` + `blocked:<reason>` labels (e.g., `blocked:safety`, `blocked:pipeline`). Dashboard recognizes both v1 (`waiting:*`) and v2 (`blocked:*`) labels. `blocked:no` is correctly excluded from blocked classification.

---

## Part 8: Code Reference Index

Every functional claim in this document maps to one of these source files. Line numbers are approximate (files may shift with edits).

### Pipeline Job Scheduling

| Claim | Source | Code |
|-------|--------|------|
| Dispatcher reads `registry.yaml` schedules | `dispatcher.sh:6` | `# Reads registry.yaml, checks schedules vs last-run timestamps` |
| Interval jobs use fractional hours | `dispatcher.sh:is_interval_due()` | `interval_secs=$(printf '%.0f' "$(echo "$every_hours * 3600" \| bc -l)")` |
| `nexus-settings.json` provides runtime overrides | `dispatcher.sh:371-393` | `override_enabled=$(ns_get_job_override "$job" "enabled")` then `every_hours=$(ns_get_job_override "$job" "every_hours")` |
| Pre-check gates job execution | `registry.yaml` per-job `pre_check` field | Shell command that must exit 0 for job to run |

### Event-Watcher Behavior

| Claim | Source | Code |
|-------|--------|------|
| Only polls for new task IDs | `event-watcher.sh:check_new_tasks()` | `current_ids=$(echo "$response" \| jq -r '.tasks[]?.id' \| sort)` then `new_ids=$(comm -13 <(echo "$known_ids") <(echo "$current_ids"))` |
| Triggers task-score on new tasks | `event-watcher.sh:121-123` | `"$DISPATCHER" --run task-score 2>/dev/null` |
| Does NOT stamp stage:intake | `event-watcher.sh` (entire file) | No call to `label_add`, `label_transition`, `pulse_add_label`, or any stage mutation |
| Uses PULSE_PORT for API URL | `event-watcher.sh:31` | `PULSE_API="http://localhost:${PULSE_PORT}/api/v1"` |

### Task-Score Workflow

| Claim | Source | Code |
|-------|--------|------|
| Operates on unlabeled tasks | `workflows/task-score.md:Step 1` | `Filter to tasks missing ALL of: auto:*, waiting:*, parked labels` |
| Max 20 tasks per run | `workflows/task-score.md:Step 2` | `Score each task (max 20 per run)` |
| agent:human → waiting:* | `workflows/task-score.md:Step 2, rule 1` | `agent:human → waiting:*` |
| Does NOT change stage labels | `workflows/task-score.md:Step 4` | Only `pulse label add <id> "auto:<level>"` and `pulse label add <id> "risk:<level>"` |
| Fixes contradictions | `workflows/task-score.md:Step 3` | `Find tasks with BOTH auto:ready AND waiting:* → remove auto:ready` |

### Task-Investigator Workflow

| Claim | Source | Code |
|-------|--------|------|
| Picks up `auto:candidate` tasks | `workflows/task-investigator.md:Step 1` | `pulse list --status open --label auto:candidate` |
| Max 5 per run | `workflows/task-investigator.md:Step 2` | `For each candidate (max 5, oldest first)` |
| Promotes to `auto:ready` + `stage:queue` | `workflows/task-investigator.md:Step 3` | `Remove auto:candidate, add auto:ready and risk:<level>` |
| Blocks to `waiting:*` | `workflows/task-investigator.md:Step 4` | `If needs human input: add waiting:* label` |
| Verifies file paths | `workflows/task-investigator.md:Step 2` | `Verify all file paths mentioned in the description exist (ls, stat)` |

### Task-Executor Workflow

| Claim | Source | Code |
|-------|--------|------|
| Picks up `auto:ready` + `risk:safe` or `pipeline:approved` | `workflows/task-executor.md:Step 1` | `pulse list --status open --label auto:ready --label pipeline:approved` then `pulse list --status open --label auto:ready --label risk:safe` |
| Skips `type:research` | `workflows/task-executor.md:Step 1` | `Skip any task that has waiting:*, needs-input, or type:research labels` |
| Claims before executing | `workflows/task-executor.md:Step 3a` | `Claim: pulse update <id> --status in_progress --claim` |
| Closes on success | `workflows/task-executor.md:Step 3g` | `Close on success: pulse close <id> --reason "Auto-executed: <summary>"` |
| Parks on failure | `workflows/task-executor.md:Step 3h` | `On failure: pulse update <id> --status open && pulse label add <id> "parked"` |
| Stale claim cleanup | `workflows/task-executor.md:Step 0.5` | `For any task that has been in_progress with no active executor (check updated_at is >2 hours old), revert it` |
| Max 10 tasks per sweep | `workflows/task-executor.md:Step 3` | `For each executable task (max 10, approved first, then oldest first)` |

### Executor Infrastructure (executor.sh)

| Claim | Source | Code |
|-------|--------|------|
| Pre-execution task claiming | `executor.sh:973-982` | `pulse_claim_task "$EXEC_TASK_ID" "executor"` with label_transition `claim-for-execute` |
| EXIT trap releases claim | `executor.sh:965-971` | `trap '_release_claim_on_exit' EXIT` — releases assignee if process dies |
| PULSE_URL passed to claude subprocess | `executor.sh:1000-1001` | `PULSE_URL="${PULSE_URL:-http://localhost:8700}" PULSE_PORT="${PULSE_PORT:-8700}" timeout ...` |
| Persona override via --persona flag | `executor.sh:734` | `[ -n "${PERSONA_OVERRIDE:-}" ] && PERSONA_NAME="$PERSONA_OVERRIDE"` |
| Env files sourced with auto-export | `executor.sh:811-815` | `set -a; source "$ENV_FILE"; set +a` |
| LLM Router fires when no model pin | `executor.sh:757-786` | Router only fires `if { [ -z "$JOB_MODEL_PIN" ] \|\| [ "$JOB_MODEL_PIN" = "null" ]; } && [ -z "${MODEL_OVERRIDE:-}" ]` |
| Cost ledger appended per run | `executor.sh:1346-1365` | `jq -nc ... >> "$COST_LEDGER"` |
| Budget pre-flight check | `executor.sh:900-939` | Reads `cost-ledger.jsonl`, sums today's spend, hard-stop at 100% of `MAX_BUDGET` |

### Pulse Server Transitions (pulse/app.py)

| Claim | Source | Code |
|-------|--------|------|
| Status is free-text column | `app.py:66` | `status TEXT DEFAULT 'open'` |
| Approve transition → queue | `app.py:TRANSITIONS["approve"]` | `remove: ["pipeline:needs-approval"], add: ["pipeline:approved", "auto:ready", "stage:queue"]` |
| Claim transition → execute | `app.py:TRANSITIONS["claim"]` | `remove: ["stage:queue"], add: ["stage:execute"], status: "in_progress"` |
| Complete strips all pipeline labels | `app.py:TRANSITIONS["complete"]` | `remove_prefix: ["stage:", "auto:", "pipeline:", "risk:"], status: "closed"` |
| Executor-fail → parked + review | `app.py:TRANSITIONS["executor-fail"]` | `remove: ["auto:ready"], add: ["parked", "stage:review", "pipeline:needs-approval"]` |
| Pause → deferred | `app.py:TRANSITIONS["pause"]` | `remove: [auto/stage/pipeline], add: ["parked"], status: "deferred"` |
| 6 transition scenarios total | `app.py:TRANSITIONS` | `approve`, `modify`, `pause`, `claim`, `complete`, `executor-fail` |

### Dashboard Classification (board.ts)

| Claim | Source | Code |
|-------|--------|------|
| `classifyTask()` priority order | `board.ts:classifyTask()` | 7-step cascade: closed→deferred→review:research→blocked→in_progress→stage:queue→backlog |
| BLOCKER_LABELS excludes `waiting:human` | `board.ts:BLOCKER_LABELS` | `['waiting:david', 'waiting:external', 'waiting:subtasks', 'waiting:session', 'needs-input', 'manual-action', 'pipeline:needs-approval']` |
| `stage:queue` → ready column | `board.ts:classifyTask()` step 6 | `if (labels.includes('stage:queue')) return 'ready'` |
| Default view is status | `KanbanPage.tsx:94` | `const [viewMode, setViewMode] = useState<ViewMode>('status')` |
| Stage view uses PIPELINE_STAGE_COLUMNS | `KanbanPage.tsx:46-65` | 8 columns: intake, evaluate, route, review, queue, execute, completed, unstaged |

### Pipeline Watchdog

| Claim | Source | Code |
|-------|--------|------|
| Check 1: Missing stage labels | `pipeline-watchdog.sh:~180-210` | Finds open tasks with 0 stage labels → adds `stage:intake` |
| Check 2: Multiple stage labels | `pipeline-watchdog.sh:~195-215` | Finds tasks with >1 stage label → resolves to highest-priority gate |
| Gate-stage misalignment check | `pipeline-watchdog.sh:~220+` | Cross-references gate labels (waiting:human, auto:candidate, etc.) against expected stage |
| Uses `label_add_validated` not raw pulse calls | `pipeline-watchdog.sh:apply_fix()` | `label_add_validated "$task_id" "$label" "pipeline-watchdog"` |

### Label Ops (label-ops.sh)

| Claim | Source | Code |
|-------|--------|------|
| Mutex groups defined | `label-ops.sh:_LABEL_MUTEX_GROUPS` | 5 groups: stage, auto, risk, blockers, review, pipeline |
| Deprecated labels rejected | `label-ops.sh:_LABEL_DEPRECATED` | 10 deprecated labels including `auto:blocked`, `gap:no-executor`, `waiting:pipeline` |
| `claim-for-execute` delegates to Pulse transition | `label-ops.sh:label_transition("claim-for-execute")` | Maps to `pulse_transition "$task_id" "dispatch"` |
| Mutation audit trail | `label-ops.sh:_lops_log()` | Appends JSON to `.claude/data/label-mutations.jsonl` |
| Handoff logging | `label-ops.sh:lops_log_handoff()` | Records persona-to-persona routing decisions |

---

## Part 9: Gap Resolution Matrix (v2.1)

The code audit in Parts 7-8 identified 7 design gaps. Here's how v2.1 addresses each:

| Gap | Problem (from Part 7) | v2.1 Resolution |
|-----|----------------------|-----------------|
| **Gap 1**: Stage label management | No component owned full lifecycle from intake to stage assignment | **Evaluate** owns initial label transitions (`staging:done`, `ready:done`). Event-watcher drives all subsequent transitions via label state machine. Single owner per transition. |
| **Gap 2**: Backward compatibility | Renaming `stage:queue` breaks `classifyTask()`, pre_checks, Pulse TRANSITIONS | **New label system replaces stage labels entirely.** `classifyTask()` rewritten to map 6 label dimensions → board columns. Old `stage:*` labels deprecated and removed. Clean break — no backward-compat tax. |
| **Gap 3**: ACTIVE state mechanism | No existing mechanism for live turn count, start time, persona display | **Sidecar files** (`<task-id>.exec.json` in `.claude/jobs/active/`) provide live execution data. New `/api/v1/tasks/:id/live` endpoint reads sidecar + tails JSONL transcript. Label `active:running` provides board column placement. |
| **Gap 4**: FAILED recovery path | Failed tasks manually triaged, no auto-retry | **Review/Diagnose services** provide automatic quality gate. Review checks outputs. Diagnose reads logs, identifies failure mode, redesigns task. Auto-retry up to 3x with incrementing `retry-count`. Escalates to `blocked:yes` after max retries. |
| **Gap 5**: Single executor for all personas | Dispatcher reads persona from `registry.yaml`, not from task labels | **Evaluate assigns `assigned:<persona>` label**. Dispatcher reads this label and passes `--persona` to executor.sh. Executor.sh gets `--session-id` and optional `--resume` for chaining. |
| **Gap 6**: Event-watcher vs designed behavior | Event-watcher only polls for new tasks, doesn't implement routing-rules.yaml | **Event-watcher rewritten as webhook receiver + label state machine driver.** Pulse fires webhooks on label changes; event-watcher receives them and immediately triggers appropriate service. 60s fallback poll for reliability. Absorbs watchdog logic. Replaces timer-based dispatching. |
| **Gap 7**: waiting:human vs waiting:david | Two blocking labels in different subsystems | **Replaced by `blocked:yes`** with a `reason:*` label. Single blocking mechanism, always visible in UI. No ambiguity. `waiting:human` and `waiting:david` deprecated. |

### Code Changes Required (mapped to executor.sh, dispatcher.sh, event-watcher.sh)

Based on the dev codebase audit:

**pulse/app.py** (Pulse server):
- Add `webhooks` table to DB schema
- Add `POST /api/v1/webhooks` registration endpoint
- Add webhook firing in label mutation + task creation code paths
- Async delivery via `threading.Thread` (non-blocking)
- Add task metadata fields support (for chain data, compressed context, session IDs)

**executor.sh** (currently ~100 lines, simple):
- Add `--session-id <uuid>` generation + flag passing
- Add `-r <chain-session>` flag when chain metadata present on task
- Append JICM epilogue to every task prompt (compressed-context-summary instruction)
- Implement resume vs compressed mode transition (check JSONL size threshold)
- Parse `<context-summary>` from JSONL output, store in Pulse metadata
- Remove hardcoded `--max-turns 25` (zero limits)
- Read `assigned:<persona>` label for model selection (currently hardcoded `--model sonnet`)
- Write sidecar file on start, delete on completion
- Write session ID + compressed summary to Pulse task metadata on completion

**dispatcher.sh** (currently ~90 lines):
- Read `assigned:<persona>` label from task before launching executor
- Pass persona as argument to executor.sh (already does this)
- Read chain metadata to determine execution order within chains
- Remove `MAX_CONCURRENT=2` limit entirely (no concurrency caps)

**event-watcher.sh** (currently ~40 lines — major rewrite):
- Add Flask HTTP server (port 8810) to receive Pulse webhooks
- Implement label state machine trigger rules
- Absorb watchdog logic (invalid label detection + reset + log)
- Add Watchdog telemetry collection (PID tracking, runtime, token scraping from JSONL)
- Launch services directly for local model services (evaluate, orchestrate, review)
- Launch via dispatcher for Claude services (execute)
- 60s background poll as webhook safety net

**New scripts**:
- `evaluate.sh` (~50 lines): Call Ollama direct (qwen3:32b) with evaluation prompt, update labels
- `orchestrate.sh` (~80 lines): Call Ollama with board context, write chain metadata to Pulse, update labels
- `reviewer.sh` (~40 lines): Call Ollama to verify execution output, update labels
- `diagnose.sh` (~60 lines): Parse JSONL transcript, identify failure, redesign task prompt

**board.ts**:
- Rewrite `classifyTask()` to map 6 label dimensions → board columns
- Remove old `BLOCKER_LABELS` list (replaced by `blocked:yes`)
- Update `PIPELINE_STAGE_COLUMNS` to: Staging, Ready, Queued, Active, Completed, Blocked

**KanbanPage.tsx**:
- Default viewMode to pipeline
- Add glow/pulse CSS for in-progress actions
- Add live metrics panel to task detail
- Add session chain diagram
- Add blocked banner component

---

## Part 10: Implementation Priority (v2.1)

Reordered by ROI and critical path (matches Part 5 phases):

| Priority | Phase | Task | Effort | Impact | Risk |
|----------|-------|------|--------|--------|------|
| **1** | 2 | Interim fixes (BLOCKER_LABELS, stage view, kill limits) | 30 min | High | Zero |
| **2** | 3 | Pulse server enhancements (webhooks, conditional-update, active API) | 3h | Critical | Low |
| **3** | 4 | Label state machine + dashboard (6 dims, classifyTask, unblock, nexus-ops) | 3h | Critical | Medium |
| **4** | 5 | Event-driven pipeline (Python webhook receiver, state machine driver) | 3h | Critical | Medium |
| **5** | 6 | Stage service (raw → configured, UI template) | 1.5h | High | Low |
| **6** | 7 | Evaluate service (qwen3:32b, safety + persona + decomposition) | 2h | High | Low |
| **7** | 8 | Orchestrate service (grouping, ordering, chaining, dependency, lock) | 3h | High | Medium |
| **8** | 9 | Context chaining + JICM epilogue (session IDs, resume/compressed modes) | 3h | High | Medium |
| **9** | 10 | Review/Diagnose (qwen3:32b post-execution verification + auto-retry) | 2h | Medium | Low |
| **10** | 11 | Metadata API validation (round-trip, gap fixes) | 1h | Medium | Zero |
| **11** | 12 | Test ticket suite + end-to-end stress test | 2h | Critical | Zero |
| **12** | 13 | Live monitoring dashboard (sidecar, /live, Activity Peek, chain diagram) | 4h | High | Low |
| **13** | 14 | Visual cues (glow/pulse, blocked banner) | 1h | Medium | Zero |
| **14** | 15 | Full message buffer (WebSocket, markdown) | 4h | Nice-to-have | Medium |

**Critical path**: Phases 2 → 3 → 4 → 5 → 6 → 7 (~13h to working webhook-driven pipeline with Stage + Evaluate)
**Context chaining**: Phases 8 → 9 (~6h, can parallel with Phase 10)
**Full pipeline validation**: Phase 12 (~2h, requires Phases 6-10 complete)
**Full implementation**: ~33h total (15 phases)

**Risk mitigation**: Old pipeline components (task-score, task-investigator, task-executor, dispatcher cron) are disabled but retained for rollback. New event-watcher can fall back to triggering old jobs if new services fail. Dev Pulse DB wiped for clean testing — no migration of old tickets. Old `routing-rules.yaml` archived; new `routing-rules-v2.yaml` generated.

---

*Pipeline v2.2 Design — webhook-driven, context-chained, zero limits, live transparency, standardized intake.*
*Revised 2026-04-26 per critical review (3 iterations, 18 issues resolved). All claims verified against dev codebase.*
*Services: Stage + Evaluate + Orchestrate (local qwen3:32b), Execute (Claude sonnet/opus), Review/Diagnose (local qwen3:32b).*
*Event-watcher: Python (webhook receiver + label state machine driver + watchdog telemetry).*
