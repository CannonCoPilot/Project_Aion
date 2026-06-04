# Nexus + Pulse Workflow Inventory

> Canonical reference for every path a task can travel through the system.
> Keep current — update when new paths, labels, or UI actions are added.

**Last Updated**: 2026-03-19 (Session 417)

---

## Table of Contents

1. [Entry Points](#1-entry-points) — How tasks are created
2. [Pipeline Stages](#2-pipeline-stages) — The stage state machine
3. [Label System](#3-label-system) — Labels, functions, mutual exclusions
4. [Workflow Paths](#4-workflow-paths) — Every distinct path a task can travel
5. [User Actions](#5-user-actions) — Dashboard buttons and their effects
6. [System Reactions](#6-system-reactions) — What triggers what
7. [Error & Edge Cases](#7-error--edge-cases) — Failures, timeouts, no-ops

---

## 1. Entry Points

Every task enters the system through one of these creation paths. Each path sets different initial labels and triggers different downstream behavior.

### EP-1: Human CLI (`pulse create`)

| Field | Value |
|-------|-------|
| **Who** | Sir, session agents |
| **Command** | `pulse create "Title" -t task -p <0-4> -l "domain:*,project:*,source:session" -d "..."` |
| **Required labels** | `domain:*`, `project:*`, `source:session` |
| **Optional labels** | `auto:ready`, `risk:*`, `waiting:david`, `parent:<id>` |
| **Has parent?** | Only if explicitly set via `-l "parent:<id>"` |
| **Has orchestration?** | No (use EP-3 for orchestration-linked tasks) |
| **Next step** | Event-watcher detects creation (~2min) → stamps `stage:intake` |

### EP-2: MCP Server (Claude App / n8n)

| Field | Value |
|-------|-------|
| **Who** | Claude App, Claude.ai web, iOS, n8n workflows |
| **Tool** | `task_create(title, priority?, labels?, description?, workspace?)` |
| **Required labels** | `source:claude-app` (auto-set by MCP convention) |
| **Auto-inferred** | `project:*` from title keywords (aurora, ciso-expert, aifred, etc.) |
| **Has parent?** | No (MCP doesn't support parent linking) |
| **Has orchestration?** | No |
| **Next step** | Event-watcher detects creation → stamps `stage:intake` |

### EP-3: Orchestration Loader (YAML decomposition)

| Field | Value |
|-------|-------|
| **Who** | Manual invocation or event-watcher detecting `pipeline:has-orchestration` |
| **Source** | `.claude/orchestration/*.yaml` phase definitions |
| **Labels set** | `source:orchestration`, `orchestration:<slug>`, `phase:<id>`, `risk:*`, `capability:*`, `parent:<parent-id>` |
| **Has parent?** | Yes — linked to parent orchestration task |
| **Has orchestration?** | Yes — `orchestration:<slug>` + `phase:<id>` |
| **Dedup** | Checks existing tasks by orchestration label + yaml_task_id |
| **Next step** | Subtasks enter pipeline at `stage:intake`; parent gets `waiting:subtasks` |

### EP-4: Directive Manifest (Persona structured effects)

| Field | Value |
|-------|-------|
| **Who** | Any persona emitting `<!-- DIRECTIVES {...} -->` with `type: task_create` |
| **Labels set** | `source:headless`, domain/project from directive |
| **Has parent?** | Optional — directive can specify parent |
| **Next step** | Event-watcher detects creation → normal pipeline |

### EP-5: Task-Investigator (Decomposition)

| Field | Value |
|-------|-------|
| **Who** | Task-investigator persona during route stage |
| **Trigger** | Parent task too complex for single execution |
| **Labels set** | `source:headless`, `parent:<parent-id>`, `capability:*` |
| **Parent effect** | Parent gets `waiting:subtasks` + stays at `stage:review` |
| **Next step** | Each subtask enters at `stage:intake` independently |

### EP-6: Researcher Persona (Follow-ups)

| Field | Value |
|-------|-------|
| **Who** | Researcher persona after completing research |
| **Limit** | Max 2 follow-up tasks per parent |
| **Labels set** | `source:headless`, `parent:<id>`, `type:research`, `auto:candidate` |
| **Next step** | Event-watcher → task-evaluator verifies scope |

### EP-7: Librarian Persona (ABS audiobook maintenance)

| Field | Value |
|-------|-------|
| **Who** | Librarian scanning audiobook library |
| **Labels set** | `source:headless`, `action:<type>`, `auto:candidate` |
| **Special** | May auto-create AND auto-close in same run (deterministic fixes) |
| **Next step** | Auto-closed items skip pipeline; queued items enter normally |

### EP-8: Aurora (Creative surprises)

| Field | Value |
|-------|-------|
| **Who** | Aurora action persona after Sir approves surprise |
| **Labels set** | `project:aurora`, `domain:creative`, `source:headless`, `auto:ready` |
| **Next step** | Event-watcher → pipeline, but follows Aurora-specific lifecycle |

### EP-9: AI David (Approved proposal execution)

| Field | Value |
|-------|-------|
| **Who** | AI David executing approved proposals from dashboard |
| **Trigger** | Sir clicks "Approve" on ReviewPage → `approved-actions.jsonl` |
| **Labels set** | Removes `waiting:david`, adds `pipeline:approved`, `auto:ready`, `stage:queue` |
| **Next step** | Task-executor picks up from queue |

---

## 2. Pipeline Stages

### Stage State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    │  ┌──────────┐    ┌──────────┐              │
             ┌──────┤  │ evaluate │───→│  route   │──────────┐   │
             │      │  └──────────┘    └──────────┘          │   │
             │      │       │               │                │   │
  ┌────────┐ │      │       │ fast-track    │ promote        │   │
  │ intake │─┘      │       ▼               ▼                │   │
  └────────┘        │  ┌──────────┐    ┌──────────┐          │   │
                    │  │  queue   │◄───│  review  │◄─────────┘   │
                    │  └──────────┘    └──────────┘              │
                    │       │               ▲                    │
                    │       ▼               │ failure            │
                    │  ┌──────────┐         │                    │
                    │  │ execute  │─────────┘                    │
                    │  └──────────┘                              │
                    │       │                                    │
                    │       ▼                                    │
                    │   CLOSED                                   │
                    │                                            │
                    │   ┌──────────┐                             │
                    │   │  parked  │ (exits pipeline)            │
                    │   └──────────┘                             │
                    └─────────────────────────────────────────────┘
```

### Stage Details

| Stage | Label | Owner | What Happens | Typical Duration |
|-------|-------|-------|-------------|-----------------|
| **Intake** | `stage:intake` | event-watcher | Task stamped, awaits evaluation | ~2 min |
| **Evaluate** | `stage:evaluate` | task-evaluator | Risk/capability/automation scoring | ~5-10 min |
| **Route** | `stage:route` | task-investigator | Verify paths, check determinism, promote or block | ~1-4 hours |
| **Review** | `stage:review` | AI David / David | Human decision point — approve, propose, escalate, defer, close | 2h-days |
| **Queue** | `stage:queue` | passive | Waiting for executor to claim | ~5-20 min |
| **Execute** | `stage:execute` | task-executor(s) | Work performed, validated, closed or parked | ~1-3 min |

### Stage Transitions

| From | To | Trigger | Labels Added | Labels Removed |
|------|----|---------|-------------|---------------|
| *(created)* | `intake` | event-watcher detects creation | `stage:intake` | — |
| `intake` | `evaluate` | task-evaluator picks up | `stage:evaluate` | `stage:intake` |
| `evaluate` | `route` | scored, needs investigation | `stage:route`, `auto:candidate` | `stage:evaluate` |
| `evaluate` | `queue` | **fast-track**: `risk:safe` + `auto:ready` | `stage:queue`, `auto:ready` | `stage:evaluate` |
| `evaluate` | `review` | needs human decision | `stage:review`, `waiting:david` | `stage:evaluate` |
| `route` | `queue` | investigator promotes | `stage:queue`, `auto:ready` | `stage:route`, `auto:candidate` |
| `route` | `review` | investigator blocks/escalates | `stage:review`, `waiting:david` | `stage:route` |
| `review` | `queue` | **approve** (Sir or AI David) | `stage:queue`, `pipeline:approved`, `auto:ready` | `stage:review`, `waiting:david`, `needs-input`, `pipeline:needs-approval` |
| `review` | `evaluate` | **modify** (Sir sends back) | `stage:evaluate` | `stage:review`, `pipeline:needs-approval` |
| `review` | *(parked)* | **pause** (Sir shelves) | `parked` | all `stage:*`, `waiting:*`, `pipeline:needs-approval` |
| `review` | *(closed)* | **cancel** (Sir cancels) | — | all labels (task closed) |
| `queue` | `execute` | executor claims | `stage:execute` | `stage:queue`, `auto:ready` |
| `execute` | *(closed)* | success | — | `stage:execute` (task closed) |
| `execute` | `review` | failure/park | `stage:review`, `waiting:david` | `stage:execute` |

---

## 3. Label System

### Label Functions

| Function | Purpose | Cardinality | Examples |
|----------|---------|-------------|---------|
| **Position** | Pipeline stage | Exactly 1 | `stage:intake`, `stage:queue`, etc. |
| **Authorization** | Permission grants | 0-1 | `pipeline:approved` |
| **Gate** | Stage-specific control | 0-many | `waiting:david`, `needs-input`, `auto:ready` |
| **Attribute** | Task properties | 0-many | `risk:safe`, `capability:code`, `action:rename-safe` |
| **Metadata** | Classification | 0-many | `domain:coding`, `project:aurora`, `source:session` |

### Mutual Exclusions

When adding a label from any of these sets, all others in the set must be removed:

| Set | Labels |
|-----|--------|
| **Stage** | `stage:intake`, `stage:evaluate`, `stage:route`, `stage:review`, `stage:queue`, `stage:execute` |
| **Risk** | `risk:safe`, `risk:moderate`, `risk:destructive` |
| **Automation** | `auto:ready`, `auto:candidate` |
| **Approval** | `pipeline:approved`, `pipeline:needs-approval` |
| **Waiting** | `waiting:david`, `waiting:external`, `waiting:subtasks`, `waiting:session`, `parked` |
| **Review** | `review:pending`, `review:escalated`, `review:ready` |

### Gate-Stage Validation

Gate labels are only valid at specific stages. Presence at wrong stage = data integrity issue.

| Gate Label | Valid Stage(s) |
|-----------|---------------|
| `waiting:david` | `review` |
| `waiting:external` | `review` |
| `waiting:subtasks` | `review` |
| `needs-input` | `review` |
| `manual-action` | `review` |
| `pipeline:needs-approval` | `review` |
| `auto:candidate` | `route` |
| `auto:ready` | `queue`, `execute` |
| `blocked:dependency` | `queue` |
| `aurora:executing` | `execute` |
| `waiting:session` | `review` |
| `review:pending` | `review` |
| `review:escalated` | `review` |
| `review:ready` | `review` |

### Blocker Labels

A task is "blocked" if it has ANY of these. Executors will not pick up blocked tasks.

```
waiting:david, waiting:external, waiting:subtasks, waiting:session,
needs-input, manual-action, pipeline:needs-approval, blocked:*
```

**NOT blockers**: `parked` (deferred, not blocked), `risk:destructive` (classification, not blocker)

### Execution Eligibility

| Executor | Stage | Risk Gate | Capability Filter | Skip If |
|----------|-------|-----------|-------------------|---------|
| task-executor | `queue` | `risk:safe` OR `pipeline:approved` | NOT `capability:infrastructure`, NOT `type:research` | any blocker, `parked` |
| task-executor-infra | `queue` | `risk:safe` OR `risk:moderate` | `capability:infrastructure` | any blocker, `risk:destructive` |
| task-research | `queue` | `pipeline:approved` | `type:research` | any blocker |

### Source Trust Levels

| Trust | Sources | Auto-Approve At |
|-------|---------|----------------|
| High | `claude-code`, `priority`, `orchestration` | `risk:safe` |
| Medium | `session`, `claude-app` | `risk:safe` |
| System | `headless` | `risk:safe` |
| Low | `ad-hoc` | *(none — always requires review)* |

---

## 4. Workflow Paths

Every distinct path a task can travel, from creation to terminal state.

### Path Status Legend

| Status | Meaning |
|--------|---------|
| **CORE** | Primary intended flow — optimize for this |
| **SUPPORTED** | Valid path, works as designed |
| **EDGE** | Rare/situational — don't optimize for but keep working |
| **OBSERVED** | Emerged in practice, may need formalization or elimination |

### PATH A: Fast-Track Autonomous (Zero Human Interaction) `CORE`

```
Created (any EP) → intake → evaluate → [risk:safe + auto:ready] → queue → execute → CLOSED
```

| Step | Actor | Time | Labels After |
|------|-------|------|-------------|
| Created | human/system | T+0 | `source:*`, `domain:*`, `project:*` |
| Intake | event-watcher | T+2min | + `stage:intake` |
| Evaluate | task-evaluator | T+10min | + `stage:evaluate`, `risk:safe`, `auto:ready`, `capability:*` |
| Fast-track to Queue | task-evaluator | T+10min | `stage:queue`, `auto:ready`, `risk:safe` |
| Execute | task-executor | T+20min | `stage:execute` |
| Close | task-executor | T+23min | *(closed with reason)* |

**Total time**: ~20 minutes. **Human involvement**: None.

**Example**: Settings cleanup (AIProjects-olmv), ABS safe renames

---

### PATH B: Investigate → Promote → Execute `SUPPORTED`

```
Created → intake → evaluate → route → [investigator promotes] → queue → execute → CLOSED
```

| Step | Actor | Time | Labels After |
|------|-------|------|-------------|
| Evaluate | task-evaluator | T+10min | `stage:route`, `auto:candidate`, `risk:safe`, `capability:*` |
| Investigate | task-investigator | T+1-4h | Verifies paths, checks determinism |
| Promote | task-investigator | T+4h | `stage:queue`, `auto:ready`, removes `auto:candidate` |
| Execute | task-executor | T+4.5h | `stage:execute` → closed |

**Total time**: ~4-5 hours. **Human involvement**: None.

---

### PATH C: Evaluate → Review → Human Approve → Execute `CORE`

```
Created → intake → evaluate → review [waiting:david] → [Sir approves on dashboard] → queue → execute → CLOSED
```

| Step | Actor | Labels After |
|------|-------|-------------|
| Evaluate | task-evaluator | `stage:review`, `waiting:david`, `risk:moderate`, `pipeline:needs-approval` |
| AI David proposes | AI David | + `review:pending` (proposal card on dashboard) |
| Sir approves | Dashboard click | `stage:queue`, `pipeline:approved`, `auto:ready`; removes `waiting:david`, `pipeline:needs-approval`, `review:pending` |
| Execute | task-executor | `stage:execute` → closed |

**Total time**: 2h-days (waiting for Sir). **Human involvement**: Dashboard approve button.

**Example**: Claude App tasks with moderate risk (AIProjects-u870)

---

### PATH D: AI David Auto-Approve (Pattern Match) `CORE`

```
Created → intake → evaluate → review [waiting:david] → [AI David matches pattern, high confidence] → queue → execute → CLOSED
```

| Step | Actor | Labels After |
|------|-------|-------------|
| Evaluate | task-evaluator | `stage:review`, `waiting:david` |
| AI David decides | AI David | Matches `learned-patterns.yaml`, high confidence + safe |
| AI David approves | AI David | `stage:queue`, `pipeline:approved`, `auto:ready`; removes `waiting:david` |
| Execute | task-executor | closed |

**Total time**: ~2-4 hours. **Human involvement**: None (pattern-learned from prior feedback).

**Example**: ABS naming convention tasks, documentation updates, config-matching-pattern

---

### PATH E: AI David Propose → Dashboard Review → Execute `CORE`

```
Created → intake → evaluate → review → [AI David proposes] → [Sir reviews on ReviewPage] → execute → CLOSED
```

| Step | Actor | Action |
|------|-------|--------|
| AI David | AI David | `action:propose`, adds `review:pending`, writes proposal card |
| Sir reviews | ReviewPage | Sees card with reasoning, risks, alternatives |
| Sir clicks "Approve" | ReviewPage | Writes to `approved-actions.jsonl` |
| AI David executes | AI David (next run) | Reads approved action, routes to executor |
| Executor | task-executor | Closed |

**Human involvement**: ReviewPage "Approve" button.

---

### PATH F: AI David Propose → Dashboard "Wrong" → Pattern Update `CORE`

```
Created → intake → evaluate → review → [AI David proposes] → [Sir marks "Wrong"] → pattern updated, task re-routed
```

| Step | Actor | Action |
|------|-------|--------|
| AI David proposes | AI David | `review:pending` |
| Sir clicks "Wrong" | ReviewPage | Provides comment: "What should it never do?" |
| Feedback saved | ReviewPage | Written to `feedback.jsonl` |
| AI David learns | AI David (next run) | Reads feedback → adds negative rule to `learned-patterns.yaml` |
| Task re-routed | AI David | Based on new understanding — may re-propose, escalate, or defer |

**Human involvement**: ReviewPage "Wrong" button + comment.

---

### PATH G: AI David Propose → Dashboard "Adjust" → Re-Execute `SUPPORTED`

```
Created → intake → evaluate → review → [AI David proposes] → [Sir marks "Adjust"] → re-routed with refinement
```

| Step | Actor | Action |
|------|-------|--------|
| Sir clicks "Adjust" | ReviewPage | Provides note: "Right direction, but tweak..." |
| Dashboard re-routes | ReviewPage API | Adds `auto:ready`, `risk:safe`; removes `auto:candidate` |
| Task re-enters | Executor | Re-evaluated with Sir's guidance |

**Human involvement**: ReviewPage "Adjust" button + note.

---

### PATH H: Escalation (High Risk, Low Confidence) `SUPPORTED`

```
Created → intake → evaluate → review → [AI David escalates] → [Sir handles in session]
```

| Step | Actor | Labels After |
|------|-------|-------------|
| Evaluate | task-evaluator | `stage:review`, `risk:destructive`, `waiting:david` |
| AI David | AI David | `action:escalate`, adds `review:escalated` |
| Sir handles | Interactive session | Sir works on task manually, closes when done |

**Human involvement**: Full manual handling.

**Example**: Security-sensitive tasks, nexus infrastructure changes (AIProjects-38jh)

---

### PATH I: Defer (Valid But Not Priority) `SUPPORTED`

```
Created → intake → evaluate → review → [AI David defers] → parked (re-enters later)
```

| Step | Actor | Labels After |
|------|-------|-------------|
| AI David decides | AI David | `action:defer`, removes `waiting:david`, adds `parked` |
| Deferred | system | Task exits pipeline; P3 = +2 weeks, P4 = +4 weeks |
| Re-entry | system (at defer date) | Removes `parked`, re-enters at `stage:intake` |

**Human involvement**: None at defer time. Future re-evaluation.

**Example**: Parked P4 tasks (AIProjects-9y22, AIProjects-anb)

---

### PATH J: Close (Stale/Duplicate) `SUPPORTED`

```
Created → intake → evaluate → review → [AI David closes] → CLOSED
```

| Step | Actor | Action |
|------|-------|--------|
| AI David decides | AI David | `action:close`, closes with reason (stale/duplicate) |
| Dashboard shows | ReviewPage | Card with close decision, Sir can feedback |

**Example**: 30+ day old tasks with no activity, exact duplicates

---

### PATH K: Pipeline Approve (Dashboard PipelineApprovalCard) `CORE`

```
Task at review → [Sir clicks "Approve" on PipelineApprovalCard] → queue → execute → CLOSED
```

| Step | Labels Added | Labels Removed |
|------|-------------|---------------|
| Approve | `pipeline:approved`, `auto:ready`, `stage:queue` | `pipeline:needs-approval`, `waiting:david`, `needs-input`, `auto:candidate`, `parked`, `stage:review`, `stage:route` |

**Downstream**: Executor triggered immediately (not waiting for schedule).

---

### PATH L: Pipeline Modify (Send Back to Evaluate) `SUPPORTED`

```
Task at review → [Sir clicks "Modify"] → evaluate → (re-scored) → route/review/queue
```

| Step | Labels Added | Labels Removed |
|------|-------------|---------------|
| Modify | `stage:evaluate` | `pipeline:needs-approval`, `stage:review` |

**Requires**: Comment (mandatory). Task re-enters evaluation with Sir's guidance.

---

### PATH M: Pipeline Pause (Shelve Indefinitely) `SUPPORTED`

```
Task at review → [Sir clicks "Pause"] → PARKED (exits pipeline)
```

| Step | Labels Added | Labels Removed |
|------|-------------|---------------|
| Pause | `parked` | ALL `stage:*`, `pipeline:needs-approval`, `waiting:david` |

Task exits pipeline entirely. No automatic re-entry unless manually un-parked.

---

### PATH N: Pipeline Cancel (Close Task) `SUPPORTED`

```
Task at review → [Sir clicks "Cancel"] → CLOSED
```

| Step | Action |
|------|--------|
| First click | Confirmation dialog appears |
| Second click | Task closed with reason: "Cancelled at pipeline approval: {comment}" |

Terminal state. No re-entry.

---

### PATH O: Orchestration Cascade `CORE`

```
Parent task created → orchestration YAML loaded → subtasks created → subtasks flow independently → parent auto-advances
```

| Step | Actor | Action |
|------|-------|--------|
| Parent created | human/system | `pipeline:has-orchestration` label |
| YAML detected | event-watcher | Triggers orchestration-loader |
| Subtasks created | orchestration-loader | Each gets `source:orchestration`, `orchestration:<slug>`, `phase:<id>`, `parent:<id>` |
| Parent waits | system | `waiting:subtasks` + `stage:review` |
| Subtasks execute | independent pipeline | Each follows PATH A-D based on risk/capability |
| Phase complete | event-watcher | Advances orchestration, unblocks next phase |
| All phases done | event-watcher | Parent task auto-advances to `stage:queue` |

**Example**: nexus-ops-connected-view orchestration

---

### PATH P: Orchestration Verification (Already Done) `ELIMINATED`

> **Eliminated 2026-03-12** — Session exit procedure (Step 2) now explicitly requires closing completed orchestration subtasks before ending a session. Executors should not encounter already-done work at stage:queue.

~~Subtasks in queue → executor verifies work already completed → batch close~~

**Was**: Executor claimed tasks, verified files existed, batch-closed with verification reason.

**Replaced by**: Session lifecycle Step 1 — human closes completed subtasks at session end by cross-referencing orchestration with actual deliverables. See session-exit-procedure.md.

**Example**: 10 tasks batch-closed in single executor run (2026-03-11) — this should not recur.

---

### PATH Q: Infrastructure Prerequisite Block `SUPPORTED`

```
Task at execute → executor finds unmet dependencies → PAUSED with questions
```

| Step | Actor | Action |
|------|-------|--------|
| Executor claims | task-executor-infra | Reads task |
| Dependency check | task-executor-infra | Prerequisite tasks not complete |
| Pause | task-executor-infra | `status:paused`, `pause_reason` + `pause_questions` documented |
| Route back | system | `stage:review`, `waiting:david` |

**Example**: Data migration blocked by missing backup + unified postgres (AIProjects-db5j)

---

### PATH R: Research → Follow-Up Review `SUPPORTED`

```
Research task → researcher completes → creates review task → Sir evaluates findings
```

| Step | Actor | Action |
|------|-------|--------|
| Research | researcher persona | Writes findings to Obsidian |
| Follow-up | researcher | Creates review task with `parent:<research-id>` |
| Sir reviews | interactive session | Evaluates research, decides on implementation |

---

### PATH R2: Sequential Research Project (Project-Managed Dependencies) `CORE`

```
Orchestration YAML → Pulse project import → Phase 1 task unblocked → completes → Phase 2 auto-unblocked → ... → final synthesis
```

| Step | Actor | Action |
|------|-------|--------|
| YAML created | human/session | Orchestration YAML with phases + `depends_on` chains |
| Import | `POST /projects/import` | Creates Pulse project + tasks with `project_id` FK and `metadata.depends_on` |
| Advance | event-watcher (`advance-all`) | `project_engine.get_unblocked_tasks()` finds Phase 1 task (no deps) |
| Phase 1 dispatched | pipeline | Task enters normal pipeline (PATH A-D) |
| Phase 1 closes | executor | Task closed with reason |
| Phase 2 unblocked | event-watcher (`advance-all`) | `get_unblocked_tasks()` sees Phase 1 closed, Phase 2 deps satisfied |
| Phase 2 dispatched | pipeline | Repeats until all phases done |
| Project complete | project_engine | All tasks closed → project marked completed |

**Key**: Dependencies MUST be managed via Pulse projects, not standalone `blocked:dependency` labels. Two mechanisms exist:

| Mechanism | How | When To Use |
|-----------|-----|-------------|
| **Pulse project** (recommended) | Orchestration YAML → `POST /projects/import`. Deps in `metadata.depends_on`. `advance-all` auto-resolves every 2 min. | Multi-task sequences, phased work, any task group with dependencies |
| **Label-based** (Check 10) | `blocked:dependency` + `depends:<task-id>` labels on standalone tasks. Pipeline-watchdog Check 10 auto-clears when dep tasks close. | Simple 1-to-1 dependency between standalone tasks (rare) |

**Anti-pattern**: `blocked:dependency` label WITHOUT `depends:<task-id>` labels = dead-end. The watchdog treats these as stale and removes the blocker, but doesn't track the actual dependency. Always use one of the two mechanisms above.

**Example**: Nexus Persona Evolution research project (5 sequential phases, each reading prior output)

---

### PATH S: Health Check Finding Lifecycle `EDGE`

```
Health check detects issue → finding logged → disposition assessed → watch/escalate/suppress
```

| Disposition | Meaning | Next Step |
|-------------|---------|-----------|
| `issue` | Active problem | May create Pulse task |
| `not-an-issue` | Resolved or false positive | Suppressed |
| `watch` | Persistent, not critical | Continues monitoring, no escalation |

**Not a Pulse task path** — tracked in `health-check-log.jsonl` separately.

---

### PATH T: Pre-Check Gate Skip (No Execution) `CORE`

```
Dispatcher runs → pre_check gate fails → job skipped → zero LLM cost
```

Every job in `registry.yaml` has an optional `pre_check` bash gate. If it exits non-zero, the job is skipped entirely. No LLM invocation, no token spend.

**Example**: "no changes detected, skipping LLM" logged 40%+ of cycles.

---

### PATH U: Manual Session Work (Sir Works Directly) `CORE`

```
Task at review → Sir works on it in interactive Claude Code session → closes manually
```

| Step | Actor | Action |
|------|-------|--------|
| Sir claims | CLI | `pulse update <id> --status in_progress --claim` |
| Works | interactive session | Code changes, config updates, etc. |
| Closes | CLI | `pulse close <id> --reason "Completed: ..."` |

**Example**: AIProjects-1nv3 (nexus-ops page triage)

---

### PATH V: Duplicate Detection → Needs Input `OBSERVED`

```
Task re-evaluated → evaluator finds duplicate of completed work → needs-input → Sir decides
```

| Step | Actor | Action |
|------|-------|--------|
| Re-evaluation | task-evaluator | Finds task overlaps completed orchestration work |
| Flag | task-evaluator | `needs-input`, `outcome:needs-input` |
| Sir decides | dashboard/CLI | Close as duplicate OR keep separate |

**Example**: AIProjects-2p30 (duplicate of completed orchestration phase)

---

### PATH W: Aurora Creative Lifecycle `SUPPORTED`

```
Aurora idea → feedback approval → building → action execution → delivery
```

| Stage | Label | Actor |
|-------|-------|-------|
| Approved | `aurora:approved` | aurora-feedback persona |
| Building | `aurora:building` | aurora-builder persona |
| Executing | `aurora:executing` | aurora-action persona |
| Delivered | `aurora:delivered` | aurora-presenter persona |
| *(stalled)* | `aurora:stalled` | watchdog detection |

Separate from main pipeline — uses Aurora-specific labels and personas.

---

### PATH X: Feedback Learning Loop (No Task Movement) `CORE`

```
AI David makes decision → David reviews → feedback written → AI David reads feedback → patterns updated
```

| Feedback | Effect on `learned-patterns.yaml` |
|----------|----------------------------------|
| **Agreed** | Reinforce pattern confidence |
| **Wrong** + comment | Add negative rule: "never do X unless Y" |
| **Adjust** + note | Refine condition or add exception |

This path doesn't move tasks — it trains the system for future decisions.

---

## 5. User Actions

### ReviewPage Actions

| Button | Appears When | API Call | Transition | Downstream |
|--------|-------------|---------|-----------|-----------|
| **Approve** (proposal) | `action === 'propose'` | `POST /reviews/feedback` (`agreed`) | `approve` | Approved action + task queued for execution |
| **Looks Good** | `action === 'execute'/'close'` | `POST /reviews/feedback` (`agreed`) | *(none)* | Reinforces pattern |
| **Wrong** | any decision | `POST /reviews/feedback` (`wrong` + comment) | *(none)* | Negative rule added to learned-patterns |
| **Adjust** | any decision | `POST /reviews/feedback` (`adjust` + note) | `approve` | Task re-queued with feedback as notes, **preserves existing risk level** |

### PipelineApprovalCard Actions

All pipeline actions use **named transitions** via `POST /tasks/:id/transition`:

| Button | Transition | Effect | Downstream |
|--------|-----------|--------|-----------|
| **Approve** | `approve` | Adds `pipeline:approved`, `auto:ready`, `stage:queue`; removes `pipeline:needs-approval`, `waiting:david`, `auto:candidate`, `needs-input`, `stage:review` | Executor picks up |
| **Modify** | `modify` | Adds `stage:evaluate`; removes `pipeline:needs-approval`, `waiting:david`, `auto:candidate`, `stage:review`, `stage:route` | Re-evaluated |
| **Pause** | `pause` | Adds `parked`; removes all `stage:*`, `pipeline:needs-approval`, `waiting:david` | Exits pipeline |
| **Cancel** | `cancel` | Closes task; removes `stage:*`, `pipeline:needs-approval`, `waiting:david`, `blocked:dependency` | Terminal state |

### TaskDetailPage Routing Buttons

All routing buttons use **named transitions** via `POST /tasks/:id/transition`:

| Button | Transition | Effect |
|--------|-----------|--------|
| **Unrouted** | *(manual label removal)* | Removes all routing/gate labels — task becomes uncategorized |
| **Waiting on Me** | `route-to-david` | Sets `waiting:david`, `stage:review`, `pipeline:needs-approval`; strips `auto:candidate`, routing labels |
| **Send to Nexus** | `route-to-queue` | Sets `auto:candidate`; strips `waiting:david`, `waiting:external` |
| **Route to Session** | `route-to-session` | Sets `waiting:session`, `stage:review`; strips `auto:candidate`, routing labels |
| **Park** | `pause` | Sets `parked`; strips all stage, pipeline, waiting labels |

### TaskActions Menu (Quick Actions)

All actions use **named transitions** via `POST /tasks/:id/transition`:

| Action | Transition | Effect |
|--------|-----------|--------|
| **Approve → Queue** | `approve` | Full approve transition (requires `pipeline:needs-approval`) |
| **Approve** (quick) | *(remove `waiting:david`)* | Only removes `waiting:david` (non-review context) |
| **Route to Session** | `route-to-session` | Marks for interactive CLI session |
| **Release** | *(status: open)* | Returns in_progress task to open |
| **Close** | `complete` | Appends close reason as notes, then strips all execution labels + closes |
| **Priority 0-4** | *(PATCH priority)* | Updates priority |

### Bulk Actions

| Action | API | Effect |
|--------|-----|--------|
| **Close All** | `POST /tasks/:id/close` (parallel, reason required) | Closes all selected |
| **Change Priority** | `PATCH /tasks/:id` (parallel) | Updates priority on all selected |

### Other Actions

| Action | Location | API | Effect |
|--------|----------|-----|--------|
| **Add Label** | TaskDetailPage | `POST /tasks/:id/labels` | Free-form label added |
| **Remove Label** | TaskDetailPage (per-chip X) | `DELETE /tasks/:id/labels/:label` | Label removed |
| **Generate Summary** | TaskDetailPage | `POST /tasks/:id/summarize` (`save:false`) | AI summary preview |
| **Save Summary** | TaskDetailPage | `POST /tasks/:id/summarize` (`save:true`) | Summary → notes |
| **Edit/Save Notes** | TaskDetailPage | `PATCH /tasks/:id` (`notes`) | Free-form notes |
| **View Full Evaluation** | PipelineApprovalCard | *(none — UI toggle)* | Shows evaluation details |

---

## 6. System Reactions

### What Triggers What

| Event | System Reaction | Timing |
|-------|----------------|--------|
| Task created (any EP) | Event-watcher stamps `stage:intake` | ~2 min |
| New `stage:intake` task | Event-watcher triggers task-evaluator | ~2 min |
| Task scored at `stage:evaluate` | Evaluator advances to route/queue/review | Immediate |
| Task at `stage:route` | Task-investigator picks up (next cycle) | Daily @9pm |
| Task gets `waiting:david` | AI David processes on next run | ~2h |
| `pipeline:approved` added | Event-watcher dispatches to executor | ~2-5 min |
| Approved action in `approved-actions.jsonl` | AI David picks up next run | ~2h |
| Task at `stage:queue` | Executor polls and claims | ~5-20 min |
| Executor success | Task closed, metrics pushed, notification sent | Immediate |
| Executor failure | Task parked, `stage:review`, `waiting:david` | Immediate |
| All subtasks closed | Parent advances from `waiting:subtasks` | ~2 min (event-watcher) |
| Orchestration phase complete | Next phase unblocked | ~2 min (event-watcher) |
| Dashboard feedback submitted | Written to `feedback.jsonl` | Immediate |
| AI David reads feedback | Updates `learned-patterns.yaml` | Next AI David run |
| msgbus message pending | Relay delivers via Telegram/Ntfy/dashboard | ~5 min (relay cycle) |
| Critical severity | Relay delivers immediately (bypasses DND) | Immediate |
| msgbus pending >10 for 3 cycles | Dispatcher sends critical alert (relay stuck) | ~15 min |

### Quiet Hours (DND)

| Day | Quiet Start | Quiet End | Bypass |
|-----|-----------|----------|--------|
| Weekday | 22:00 MT | 07:00 MT | `severity:critical` |
| Weekend | 23:00 MT | 09:00 MT | `severity:critical` |

Queued messages batch-release when DND ends.

---

## 7. Error & Edge Cases

### Executor Failure → Review Loop

When execution fails, the task doesn't disappear — it returns to review:
1. Executor sets `status:paused` or parks task
2. Adds `stage:review`, `waiting:david`
3. Adds failure notes with `pause_reason` and `pause_questions`
4. Sir investigates and either re-routes or handles manually

### Already-Completed No-Op

If AI David finds an approved action for an already-closed task:
- Marks action as `executed` (no-op)
- Logs pattern: `already-completed-task`
- No task state change

### Duplicate Detection

Task-evaluator may flag tasks that overlap completed orchestration work:
- Sets `needs-input`
- Sir decides: close as duplicate vs. keep separate

### Pre-Check Gate Skip

40%+ of dispatcher cycles result in no LLM invocation due to pre-check gates:
- Gate checks for new events, changed files, pending tasks
- If nothing changed → skip entirely (zero cost)

### Stale Question Expiry

Unanswered msgbus questions have a 24h TTL:
- At 80% TTL: pre-expiry reminder sent
- At 100% TTL: question marked expired
- Expired questions visible in dashboard but no longer escalate

### Label Integrity Violations

`Scripts/validate-label-gates.sh` catches:
- Missing `stage:*` label on open task
- Gate label at wrong stage (e.g., `waiting:david` at `stage:queue`)
- Deprecated labels still present
- `--fix` mode auto-corrects violations

---

## Appendix: Job Schedule

*Updated 2026-03-13 — canonical source: `.claude/jobs/registry.yaml`*

| Job | Interval | Pre-Check | Budget |
|-----|----------|-----------|--------|
| dispatcher | */5 min (cron) | — | — |
| event-watcher | */2 min (cron) | — | — |
| msg-relay | */5 min (cron) | — | — |
| dispatcher-watchdog | 15 min | — | — |
| pipeline-watchdog | ~5 min | — | — |
| task-evaluator | 1h | new intake tasks exist | $2/run |
| task-investigator | Daily @9pm | candidates at stage:route | $2/run |
| task-scoring | Daily @8pm | unscored tasks exist | $1/run |
| ai-david | 2h | waiting:david queue non-empty | $2/run |
| pipeline-review | 12h | pipeline health items | $2/run |
| task-executor | 2h | eligible tasks at stage:queue | $2/run |
| task-executor-infra | 1h (temp) | infra tasks at stage:queue | $2/run |
| task-research | 1h | pipeline:approved research tasks | $2/run |
| health-summary | 6h | — | $1/run |
| aurora-think | Daily @12am | — | $1/run |
| aurora-build | Daily @2am | approved Aurora tasks | $2/run |
| aurora-action | 6h | executing Aurora tasks | $2/run |
| aurora-present | Daily @6am | delivered Aurora tasks | $1/run |
| aurora-feedback | Daily @9pm | — | $1/run |

---

## Appendix: Known Issues & Optimization Notes

*Captured 2026-03-11 Session 263 audit.*

### Issues Fixed This Session

| Task | Issue | Fix Applied |
|------|-------|------------|
| AIProjects-3m55 | `parked` + `waiting:david` + `auto:ready` + `pipeline:approved` + `review:pending` — 5 mutual exclusion violations | Cleaned to `parked` + `stage:review` only |
| AIProjects-yx8 | `parked` + `waiting:david` + `needs-input` + `manual-action` | Cleaned to `parked` + `manual-action` |
| AIProjects-cjwt | `needs-input` at `stage:queue` + both `auto:candidate` + `auto:ready` | Moved to `stage:review` + `waiting:david` |
| AIProjects-5qh | `parked` at `stage:queue` | Moved to `stage:review` |
| AIProjects-qk4c | Deprecated `gap:no-executor`, `waiting:pipeline`, `pipeline:evaluated` | Cleaned to proper `stage:queue` |
| AIProjects-x383 | Deprecated `pipeline:ai-david-approved` + dual stages | Cleaned to `stage:queue` |
| AIProjects-0gko | Deprecated `pipeline:evaluated` | Removed |
| 4 tasks | Missing `stage:*` label entirely | Added `stage:intake` |

### Root Causes (Historical — Most Now Fixed)

1. **~~Label add doesn't enforce mutual exclusion~~** — **FIXED (Session 325+)**: All label mutations now flow through `lib/label-ops.sh`, which enforces mutex groups, rejects deprecated labels, and logs all changes to `label-mutations.jsonl`. Direct `pulse label add` from personas is no longer used.

2. **~~Deprecated labels accumulate~~** — **FIXED (Session 325+)**: `pipeline-watchdog.sh` runs every ~5 min and auto-removes/migrates deprecated labels. `label-ops.sh` rejects deprecated labels at write-time. Both are active.

3. **~~Parked tasks not fully cleaned~~** — **FIXED (Session 332)**: Pipeline-watchdog Check validates parked mutex — detects and removes conflicting `waiting:*`, `auto:*`, `blocked:*` labels on parked tasks.

### Remaining Optimization Notes

1. **PATH V (Duplicate Detection) needs resolution** — Currently just flags `needs-input` and waits. Should auto-close if the duplicate is confirmed (same orchestration phase, already closed).

2. **Queue throughput** — Executor runs every 2h, processes up to 10 tasks per run. Two dependency resolution mechanisms exist: (a) **Pulse projects** (recommended) — `project_engine.get_unblocked_tasks()` called via `advance-all` every 2 min, resolves `metadata.depends_on` chains automatically; (b) **Label-based** — standalone tasks with `blocked:dependency` + `depends:<task-id>` labels are auto-cleared by pipeline-watchdog Check 10 when dep tasks close. Note: `blocked:dependency` WITHOUT `depends:` labels is a stale blocker — watchdog removes it but doesn't track the dependency. See PATH R2 for details.
