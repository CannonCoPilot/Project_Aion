# NEXUS Governance Model v1

**Status**: Approved Design
**Date**: 2026-03-28
**Approved By**: Sir (session 575)

---

## Design Principles

1. **Separation of responsibility**: Routing, approval, and execution are distinct roles. No persona does more than one.
2. **Single routing brain**: One Orchestrator makes all routing decisions. No split-brain routing across multiple files/personas.
3. **Pull model**: Personas check their queue for work. They don't decide what to work on — the Orchestrator decided that already.
4. **Hybrid intelligence**: Deterministic rules handle known patterns (90%). LLM handles classification and edge cases (10%).
5. **Labels are the queue**: Pulse labels (`persona:<name>` + `stage:<step>`) are the queueing mechanism. No new infrastructure needed.

---

## Three Roles

### 1. AI David — Approval Proxy

**Purpose**: Learn Sir's decision patterns. Approve or reject on Sir's behalf. Nothing else.

**Does**:
- Process `waiting:david` queue
- Apply learned patterns to approve/reject/defer
- Add feedback to learned-patterns.yaml when Sir corrects a decision
- Escalate to Sir (human) when confidence is below threshold

**Does NOT**:
- Route tasks to personas
- Decide which persona should execute
- Move tasks through pipeline stages
- Create subtasks or follow-ups (that's the Orchestrator's job)

**When invoked**: Orchestrator routes a task to AI David's queue when approval is needed. AI David processes it and returns a decision. Orchestrator picks up the decision and routes accordingly.

**Model**: Opus (unchanged — needs high-quality judgment)

### 2. Orchestrator — Single Routing Brain

**Purpose**: Own ALL routing decisions. Classify tasks, determine next steps, assign to personas, validate routing, move tasks through the pipeline.

**Does**:
- Pull from intake queue (new tasks with `stage:intake`)
- Classify tasks (type, domain, risk, complexity) — LLM-based
- Apply routing rules (deterministic, from `routing-rules.yaml`)
- Assign to personas via `persona:<name>` label
- Sequence multi-step work (e.g., security review before deploy)
- Create subtasks and follow-ups when needed
- Validate that tasks are in the right place (replaces parts of pipeline-watchdog)
- Check budget before routing to expensive personas
- Route to AI David when approval is needed
- Pick up AI David's decision and route accordingly

**Does NOT**:
- Approve or reject tasks (that's AI David)
- Execute any work (that's personas)
- Learn David's preferences (that's AI David)

**Hybrid model**:
- **Deterministic layer**: Known routing rules from `routing-rules.yaml` — if task has `type:research` + `pipeline:approved`, route to `persona:researcher`. If `risk:destructive`, route to AI David. These rules are fast, free, and predictable.
- **LLM layer**: For tasks that don't match any rule, or need classification (what type is this? what domain? which persona has the right skills?). Also handles sequencing decisions (does this need security review first?).

**Model**: Sonnet (good balance of capability and cost for routing decisions)

**Schedule**: Runs frequently (every 30min or on-demand via webhook) since it's the routing bottleneck.

### 3. Personas — Execute, Don't Route

**Purpose**: Pull work from their queue, execute it, return results.

**Queue check**: Each persona filters Pulse tasks by:
```
stage:execute + persona:<my-name> + status:open
```

**Does**:
- Execute assigned work (research, code, review, deploy, etc.)
- Report results (close task, add notes, create output artifacts)
- Flag blockers (add `blocked:*` label if stuck — Orchestrator picks it up)

**Does NOT**:
- Decide what to work on (Orchestrator decided)
- Route tasks to other personas
- Approve or reject (Orchestrator routes to AI David for that)
- Create follow-up tasks (report the need — Orchestrator creates them)

---

## Pipeline Flow

```
Task Created
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR                                            │
│                                                          │
│  1. Pull from stage:intake queue                         │
│  2. Classify (LLM if needed, rules if known pattern)     │
│  3. Apply labels: domain:*, type:*, risk:*, persona:*    │
│  4. Set stage:evaluate                                   │
│                                                          │
│  Decision tree:                                          │
│  ├─ risk:safe + known pattern → stage:execute            │
│  │   (skip approval, route directly to persona)          │
│  │                                                       │
│  ├─ risk:moderate → route to AI David queue              │
│  │   AI David approves → Orchestrator → stage:execute    │
│  │   AI David rejects → stage:closed                     │
│  │                                                       │
│  ├─ risk:destructive → waiting:david                     │
│  │   Sir (human) approves → Orchestrator → execute     │
│  │                                                       │
│  ├─ needs pre-work (e.g., security review) →             │
│  │   Create subtask → persona:security-reviewer          │
│  │   When done → Orchestrator picks up → continues       │
│  │                                                       │
│  └─ unknown/ambiguous → LLM classification               │
│      Orchestrator uses LLM to determine routing          │
│                                                          │
│  5. Set persona:<name> + stage:execute                   │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────┐
│  PERSONA QUEUE       │
│                      │
│  Persona pulls:      │
│  stage:execute +     │
│  persona:<my-name>   │
│                      │
│  Executes work       │
│  Returns result      │
│  Sets stage:done     │
└─────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (picks up stage:done)                      │
│                                                          │
│  - Task complete? → close                                │
│  - Needs follow-up? → create subtask, route              │
│  - Needs review? → route to AI David or Sir            │
│  - Output needs to go somewhere? → route to next persona │
└─────────────────────────────────────────────────────────┘
```

---

## Label Schema Changes

### New Labels

| Label | Purpose | Set By | Notes |
|-------|---------|--------|-------|
| `persona:<name>` | Indicates which persona should pick up this task | Orchestrator only | Net-new prefix. Must be added to `label-taxonomy.yaml` with all valid persona names. |
| `stage:done` | Persona completed execution, Orchestrator picks up | Persona | Must be added to: `label-ops.sh` stage mutex group, `label_stage_transition()` valid list, Pulse API allowed stages, watchdog gate rules. |
| `blocked:budget` | Task blocked because target persona's budget is depleted | Orchestrator | Must be added to `label-taxonomy.yaml` and `dispatch_blockers` in routing-rules.yaml. Reset mechanism: Orchestrator checks on Monday 00:00 cycle and removes from tasks where budget has reset. |
| `needs:decomposition` | Task is too complex for single execution — Orchestrator should break it down | AI David | Used when AI David determines a task needs splitting but no longer does it himself. Orchestrator picks up and creates subtasks. |
| `orchestrator:managed` | Signals watchdog to NOT auto-fix this task's routing | Orchestrator | Prevents watchdog from overriding Orchestrator decisions during Phase 2-3 transition. |

### Coexistence with `assigned:<name>`

The existing `assigned:<persona>` label (used by AI David's CONSULT workflow and human-directed routing) coexists with `persona:<name>`:
- `persona:<name>` = Orchestrator-assigned (automated routing)
- `assigned:<name>` = Human or AI David-directed (manual routing)
- If both exist on a task, `assigned:` takes precedence (human intent overrides automation)
- `assigned:<name>` is NOT deprecated — it remains for direct human/AI David assignment

### Modified Labels

| Label | Change | Reason |
|-------|--------|--------|
| `stage:evaluate` | Now set by Orchestrator, not task-evaluator | Orchestrator owns all stage transitions |
| `stage:queue` | Renamed concept → `stage:execute` with `persona:*` | More explicit — "execute" means a persona is assigned |
| `auto:ready` | Becomes a routing hint for Orchestrator, not a pickup trigger | Orchestrator decides, not the label alone |

### Phase 2 Transition: Dual-Label Period

During Phase 2, the Orchestrator sets BOTH old and new labels to maintain backward compatibility:
- Sets `persona:<name>` (new routing) AND `pipeline:approved` (old pre_check compatibility)
- Sets `orchestrator:managed` to prevent watchdog interference
- Old executor pre_checks still filter on `pipeline:approved` — they continue to work
- Phase 3 removes the dual-labeling once executor pre_checks are updated

### Removed Concepts (Phase 3+)

| Concept | Replaced By | When |
|---------|-------------|------|
| `auto-approved` / `pipeline:approved` as routing triggers | `persona:<name>` label | Phase 3 (after pre_check migration) |
| Multiple `stage:` transitions by different personas | Orchestrator owns ALL stage transitions | Phase 3 |
| Persona-specific pre_check scripts in registry.yaml | Simplified: `pulse list --label persona:<name>` | Phase 3 |
| Executor self-query pickup logic in prompts | Simple queue check: `stage:execute + persona:<name>` | Phase 3 |

---

## Where Routing Logic Consolidates

### Before (10+ places — review audit found 3 more than initially documented)

| # | File | What it decided |
|---|------|----------------|
| 1 | `routing-rules.yaml` | Pickup criteria, dispatch precedence, stage transitions, fast-track rules |
| 2 | `routing-helpers.sh` | Bash-executable routing functions (eligibility, capability mapping, risk gates) |
| 3 | `label-ops.sh` | Stage transitions, named scenario handoffs, mutex enforcement |
| 4 | `dispatcher.sh` | Schedule evaluation, pre_check gate execution |
| 5 | `registry.yaml` pre_check fields | Per-executor pickup queries embedding routing criteria |
| 6 | `event-watcher.sh` | **Full parallel routing implementation** (lines 461-549) — largest split-brain source |
| 7 | `pipeline-watchdog.sh` | Auto-fix routing corrections, gate→stage enforcement |
| 8 | `nexus-settings.sh` + `risk-policy.yaml` | Runtime-mutable risk gate overrides |
| 9 | `task-evaluator` prompt | Classification, risk scoring, capability assignment, decomposition |
| 10 | `AI David` prompt | EXECUTE/DECOMPOSE/CONSULT/CREATE-FOLLOWUP — all are routing actions |
| 11 | Executor self-query prompts | `autofix-executor`, `infrastructure-deployer` run own pickup logic |
| 12 | `task-investigator` prompt | `auto:candidate` promotion, orchestration decomposition, stale recovery |

### After (1 place + tools)

| Component | Role |
|-----------|------|
| **Orchestrator persona** | ALL routing decisions |
| `routing-rules.yaml` | Rules the Orchestrator reads (tool, not decision-maker) |
| `label-ops.sh` | Label mutations the Orchestrator calls (tool, not decision-maker) |
| `dispatcher.sh` | Cron scheduler — runs the Orchestrator job + persona jobs (unchanged role) |
| `pipeline-watchdog.sh` | Monitors for anomalies, alerts Orchestrator (observer, not fixer) |

AI David's prompt is stripped of all routing logic. task-evaluator's classification role is absorbed by the Orchestrator.

---

## Dispatcher Relationship

The dispatcher stays as-is — it's the cron scheduler that runs jobs. The Orchestrator is just another job the dispatcher runs:

```yaml
# In registry.yaml
orchestrator:
  description: "Single routing brain — classifies, routes, and sequences all tasks"
  schedule: "*/30 * * * *"  # Every 30 minutes (fallback sweep)
  persona: orchestrator
  engine: claude-code
  model: sonnet
  limits:
    max_turns: 50
    max_budget_usd: 5.00
    timeout_minutes: 15
  trigger:
    webhook: true  # Primary path: event-driven via trigger-ops.sh
  pre_check: "pulse list --status open --label stage:intake 2>/dev/null | head -1 | grep -q . || pulse list --status open --label stage:done 2>/dev/null | head -1 | grep -q ."
```

**Event-driven primary path**: The Orchestrator should primarily be triggered reactively (via `trigger-ops.sh` on `stage:intake` and `stage:done` events), not by 30-minute polling. The 30-minute schedule is a fallback sweep to catch anything missed. This matches the existing `pipeline-runner.sh` reactive trigger pattern and avoids the 29-minute worst-case latency identified in review.

Other personas still run on their own schedules via the dispatcher. The difference: they now check their `persona:<name>` queue instead of running their own pickup logic.

---

## Approval Flow

| Risk | Route | Mechanism |
|------|-------|-----------|
| `risk:safe` + known pattern | Orchestrator → persona directly | No approval needed. Deterministic rules. |
| `risk:safe` + unknown pattern | Orchestrator classifies via LLM → persona | LLM classification, but no approval gate. |
| `risk:moderate` | Orchestrator → AI David queue → AI David decides → Orchestrator routes | AI David applies learned patterns. |
| `risk:destructive` | Orchestrator → `waiting:david` → Sir (human) decides → Orchestrator routes | Telegram notification. Human approval required. |

---

## Budget Enforcement

The Orchestrator checks budget AFTER classification but BEFORE routing to a persona:

1. Orchestrator classifies task (determines target persona) — this LLM cost is the Orchestrator's own budget, not the persona's
2. Read target persona's current spend from `cost-ledger.jsonl` — **note: cost-ledger currently stores by `job` name, not `persona` name. Multiple jobs share personas (e.g., `investigator` runs in 6+ jobs). Phase 2 prereq: add `persona` field to cost-ledger schema (one-line change in executor.sh).**
3. Compare against `max_budget_usd` in persona config
4. If >= 80%: route task but add warning to Orchestrator log output + Telegram
5. If >= 100%: do NOT route. Add `blocked:budget` label. Alert via Telegram.
6. Budget resets weekly (Monday 00:00) — Orchestrator's Monday cycle removes `blocked:budget` from tasks where target persona's budget has reset

This means budget enforcement is a routing decision, not an execution concern. The Orchestrator blocks the task before it ever reaches the persona.

**Integration with AIProjects-axj3**: The budget enforcement task designs the detailed implementation. This governance model defines WHERE the check happens (Orchestrator, after classification). The task designs HOW (thresholds, ledger queries, alerting).

---

## Escalation Path

```
Persona hits a blocker
    → adds blocked:* label
    → Orchestrator picks up on next cycle
    → Orchestrator decides: re-route, create subtask, or escalate

Orchestrator can't classify a task
    → Invokes task-evaluator as a specialist (kept as callable persona, not absorbed)
    → task-evaluator provides classification
    → Orchestrator routes based on classification
    → If task-evaluator also can't classify → escalate to Sir (human) via waiting:david

AI David's confidence is below threshold
    → AI David adds waiting:david
    → Sir (human) decides via Telegram or dashboard
    → Orchestrator picks up Sir's decision and routes

Cross-domain work needed (e.g., security review before deploy)
    → Orchestrator creates sequenced subtasks
    → Routes security review first (persona:security-reviewer)
    → When done, Orchestrator picks up result
    → Routes deploy (persona:infrastructure-deployer) with security assessment attached
```

---

## What Changes for Each Existing Persona

### AI David
- **Remove**: EXECUTE routing (stage advancement, `pipeline:approved` setting), DECOMPOSE (subtask creation), CONSULT (`assigned:<persona>` routing), CREATE-FOLLOWUP (follow-up task creation)
- **Keep**: APPROVE/REJECT/DEFER/ESCALATE decisions, learned patterns, confidence matrix, human escalation
- **Add**: `needs:decomposition` label — when AI David determines a task is too complex, it signals the Orchestrator to break it down instead of doing it directly
- **Note**: AI David's `approved-actions.jsonl` execution loop (where approved proposals flow to execution) must be replaced — Orchestrator handles the approved→execute transition

### task-evaluator
- **Becomes**: A callable specialist the Orchestrator invokes for complex classification (DECIDED — not absorbed)
- **Rationale**: Classification logic is too complex to absorb into Orchestrator prompt (risk scoring table, decomposition triggers, orchestration affinity checks, project cascade rules). Keeping it focused produces better results.
- **Phase 2**: task-evaluator keeps `stage:intake` handling. Orchestrator starts at `stage:evaluate`. No race condition.
- **Phase 3**: Orchestrator handles intake directly, invokes task-evaluator only for edge cases

### All execution personas (researcher, infrastructure-deployer, bug-fixer, etc.)
- **Remove**: Pickup logic (pre_check, queue filtering, self-querying)
- **Add**: Simple queue check: `stage:execute + persona:<my-name>`
- **Keep**: All execution logic unchanged

### pipeline-watchdog
- **Remove (Phase 3)**: Stage-reassignment auto-fixes (the Orchestrator owns stage transitions)
- **Keep always**: Label integrity fixes (deprecated labels, mutex violations) — these are infrastructure-level, not routing decisions
- **Keep always**: Anomaly detection, health reporting, metrics
- **Add**: Respect `orchestrator:managed` label — if present, skip all auto-fixes except label integrity
- **Add**: Write anomalies to a well-known location the Orchestrator polls (e.g., `pipeline-health.jsonl` with `severity:routing-anomaly`)

### event-watcher.sh (CRITICAL MIGRATION TARGET)
- **Remove (Phase 3)**: Full routing case statements (lines 461-549) — this is the largest source of split-brain routing
- **Keep**: `stage:intake` stamping on task creation (lines 363-379)
- **Add**: Trigger Orchestrator on `stage:intake` and `pipeline:approved` events via trigger-ops.sh
- **Priority**: This file's routing logic is the #1 migration target

### Dispatcher
- **No changes** to dispatcher.sh itself
- **Add**: Orchestrator job to registry.yaml
- **Modify**: Persona job pre_checks simplified (just check if queue has work)

---

## Implementation Phases

### Phase 1: Foundation (1 session)
**Prerequisites before any code changes:**
- Add `stage:done` to `label-ops.sh` stage mutex group, `label_stage_transition()` valid list, Pulse API allowed stages, watchdog gate rules
- Add `persona:<name>` to `label-taxonomy.yaml` with all valid persona names
- Add `blocked:budget`, `needs:decomposition`, `orchestrator:managed` to label taxonomy
- Wire trigger in `trigger-ops.sh` for `stage:done` → Orchestrator handler
- Wire trigger in `trigger-ops.sh` for `stage:intake` → Orchestrator handler
- Add `persona` field to cost-ledger.jsonl schema (executor.sh write)

**Then:**
- Create `personas/orchestrator/` with prompt, config, permissions
- Extract deterministic routing rules from all 12 sources into Orchestrator prompt
- Register in registry.yaml with 30-min schedule + webhook trigger
- Test with dry-run mode (classify and log decisions, don't actually move tasks)

### Phase 2: Migrate routing (1-2 sessions)
**Sequencing: task-evaluator keeps `stage:intake`, Orchestrator starts at `stage:evaluate`**
- Orchestrator sets BOTH `persona:<name>` AND `pipeline:approved` (dual-label for backward compatibility)
- Orchestrator sets `orchestrator:managed` on every task it routes (watchdog respects this)
- Migration script: stamp `persona:<name>` labels onto existing in-flight tasks at `stage:queue`
- Modify persona prompts to check `persona:<name>` queue (alongside old pickup logic as fallback)
- Old routing logic still active — executors still filter on `pipeline:approved`

**Phase 2 exit criterion**: 50+ tasks routed by Orchestrator with zero routing errors over 7 days. Measured by: watchdog reports zero stage-reassignment fixes on `orchestrator:managed` tasks.

### Phase 3: Strip old routing (1 session)
- Update executor pre_checks to `pulse list --label persona:<name>` (drop `pipeline:approved` filtering)
- Remove routing case statements from `event-watcher.sh` (lines 461-549) — #1 priority
- Remove executor self-query logic from `autofix-executor`, `infrastructure-deployer` prompts
- Strip watchdog stage-reassignment auto-fixes (keep label integrity fixes)
- Orchestrator stops dual-labeling — `persona:<name>` only, no more `pipeline:approved`
- Remove classification from task-evaluator self-initiated runs (keep as Orchestrator-callable specialist)

### Phase 4: AI David focus (1 session)
- Strip EXECUTE, DECOMPOSE, CONSULT, CREATE-FOLLOWUP from AI David prompt
- Replace `approved-actions.jsonl` execution loop — Orchestrator owns the approved→execute transition
- AI David returns structured decisions: `{action: "approve"|"reject"|"defer"|"escalate"|"needs_decomposition", reason: "...", confidence: 0.85}`
- Orchestrator reads AI David's decision and acts on it
- Validate learned-patterns still apply in narrower role
- End-to-end test: task → Orchestrator → AI David approval → Orchestrator → persona execution → Orchestrator → close

---

## Migration Safety

During transition (Phases 2-3), both old and new routing run simultaneously:
- Orchestrator routes via `persona:<name>` labels + sets `pipeline:approved` for backward compat
- Orchestrator sets `orchestrator:managed` — watchdog won't override its routing
- Old pre_check scripts still filter on `pipeline:approved` — they continue to work
- If Orchestrator misses a task, old system catches it (no `persona:` label → old routing fires)
- Once Phase 2 exit criterion met (50 tasks, 7 days, zero routing errors), proceed to Phase 3

**Rollback procedure**: If Orchestrator produces systematically bad routing:
1. Disable Orchestrator job in `nexus-settings.json` (`job_overrides.orchestrator.enabled: false`)
2. Old routing is still active (Phase 2) or was just active (Phase 3 — re-enable old pre_checks)
3. Remove `orchestrator:managed` labels from affected tasks
4. Investigate and fix before re-enabling

---

## Success Criteria

1. All tasks flow through Orchestrator (no task bypasses it)
2. AI David only sees tasks that need approval (not everything)
3. Routing logic lives in ONE place (Orchestrator + routing-rules.yaml)
4. No split-brain routing (no two components making conflicting routing decisions)
5. Pipeline watchdog reports fewer violations (routing is correct the first time)
6. Average task latency decreases (faster routing, fewer wasted cycles)
