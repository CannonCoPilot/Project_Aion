---
title: Dispatcher / Registry.yaml Audit — Phase D of post-PR-#3 workstream
date: 2026-05-12
author: Jarvis (Nate's dev session)
status: AUDIT-COMPLETE (impl plan pending Nate's answers to §5 open questions)
project: AIFred-Pro-Dev
target_branch: nate-dev
ratifies: Nate's 2026-05-12 architectural rule — see §1
related:
  - ../designs/project-aion-workstream-architecture-2026-05-05.md (§6.2 Future Work — to be extended)
  - ../reports/m3-pipeline-approval-consumer-audit-2026-05-11.md (F-1/F-5 defect catalog this audit feeds)
  - ../../AIFred-Pro-Dev/.claude/jobs/registry.yaml (the inventory)
  - ../../AIFred-Pro-Dev/.claude/jobs/dispatcher.sh (the executor of these jobs)
  - ../../AIFred-Pro-Dev/.claude/context/designs/pipeline-redesign-v2.md (v2 design + designed-vs-running gaps)
audience: Nate, future-Jarvis, David (post-PR-#3 merge)
---

# Dispatcher / Registry.yaml Audit — Phase D of post-PR-#3 workstream

## 1. Architectural rule (Nate's 2026-05-12 directive)

> Dispatcher should be reconceived as handling the cycle of recurring jobs, but NO recurring jobs should be in place to handle the task-ticket pipeline-nexus operations. All Pulse-Nexus task pipeline operations must function in an event-driven manner.

Operational decomposition:

| Tier | Owner | Triggering | Examples |
|---|---|---|---|
| **Recurring jobs** | `dispatcher.sh` (cron-style scheduler) | Wall-clock schedule (every Nh / daily Hr / weekly DayHr) | Infra health checks, doc-sync, context maintenance, creative pipeline, weekly digests |
| **Pipeline-nexus ops** | v2 services (`services/*.py`) + event-watcher | Pulse event (task.created, label.added, status.changed) | Score, investigate, queue-promote, claim, execute, review, diagnose |

The two tiers coexist; they do NOT compete. Recurring jobs may produce tasks that enter the pipeline (e.g. weekly-digest could file follow-up tasks), but recurring jobs MUST NOT advance pipeline state — that's the pipeline's job, fired by events.

## 2. Current registry inventory (13 jobs)

| # | Job | Tags | Schedule | Persona / Engine | Current behavior |
|---|---|---|---|---|---|
| 1 | `health-summary` | monitoring | interval 12h | investigator / claude-code | Docker + infra health snapshot |
| 2 | `persona-health-check` | monitoring | weekly Sun 5am | investigator / claude-code | Validate persona configs + registry refs |
| 3 | **`task-score`** | **pipeline** | interval 0.166h (~10min) | autofix-executor / claude-code | Scan unlabeled open tasks; add `auto:candidate` + `risk:*` labels |
| 4 | **`task-investigator`** | **pipeline** | interval 0.166h (~10min) | task-investigator / claude-code | Promote `auto:candidate` → `auto:ready` + `stage:queue`, or send to `waiting:human` |
| 5 | **`task-executor`** | **pipeline** | interval 0.166h (~10min) + webhook | autofix-executor / claude-code | Claim + execute `auto:ready risk:safe` or `pipeline:approved` tasks |
| 6 | `doc-sync-check` | maintenance | interval 24h | investigator / claude-code | Audit docs vs code drift |
| 7 | `pipeline-review` | monitoring | interval 12h | pipeline-reviewer / claude-code | LLM review of `pipeline-health.jsonl` (read-only observational) |
| 8 | `context-maintenance` | maintenance, context | interval 12h | context-maintainer / claude-code | Refresh Evaluator Brief sections |
| 9 | `creative-think` | creative | daily midnight | creative-thinker / claude-code | Phase 1 of creative pipeline |
| 10 | `creative-build` | creative | daily 2am | creative-builder / claude-code | Phase 2 (gated on Think) |
| 11 | `creative-present` | creative | daily 6am | creative-presenter / claude-code | Phase 3 (gated on Build) |
| 12 | `weekly-digest` | reporting | weekly Mon 9am | investigator / claude-code | Aggregate job results + costs + health |
| 13 | `ollama-test` | (testing) | on-demand | investigator / ollama | Manual smoke-test for Ollama engine routing |

Of the 13: **3 are pipeline-ops on cron** (task-score / task-investigator / task-executor) — explicit `tags: [pipeline]` and registry.yaml comment line 116 calls them "Task Pipeline — Evaluate → Investigate → Execute. These jobs form an autonomous task processing pipeline."

## 3. Classification per new architectural rule

### KEEP in dispatcher (10 jobs)

| Job | Why KEEP |
|---|---|
| `health-summary` | Infra observability snapshot — not pipeline |
| `persona-health-check` | Config validation — system maintenance, not pipeline |
| `doc-sync-check` | Docs maintenance — not pipeline |
| `pipeline-review` | LLM review of pipeline health — **observational only** (reads `pipeline-health.jsonl`, doesn't drive state). Permitted under the rule because it observes, doesn't act. |
| `context-maintenance` | Project context maintenance — not pipeline |
| `creative-think` / `creative-build` / `creative-present` | Creative pipeline is a separate domain (not the task-ticket pipeline-nexus) |
| `weekly-digest` | Reporting aggregation — not pipeline |
| `ollama-test` | Engine smoke-test, on-demand only — not pipeline |

### REMOVE from dispatcher (3 jobs)

| Job | Why REMOVE | Event-trigger replacement (see §4) |
|---|---|---|
| `task-score` | Operates on pipeline tasks (adds routing labels) | Fire on `task.created` Pulse event |
| `task-investigator` | Operates on pipeline tasks (promotes / blocks) | Fire on `label.added(auto:candidate)` Pulse event |
| `task-executor` | Operates on pipeline tasks (claims + executes) | Fire on `label.added(stage:queue)` Pulse event (already has webhook trigger; cron fallback to be removed) |

## 4. Event-trigger replacements for the 3 REMOVE jobs

### 4.1 `task-score` → `services/score.py` (NEW service) + event-watcher route

**Trigger**: `task.created` Pulse event (already detected by `.claude/jobs/event-watcher.sh`)

**Function**: scan a single new task; assign `auto:candidate` + `risk:*` labels based on title/body/labels heuristics. Same logic as current `task-score.md` workflow but operating on ONE task per fire instead of bulk scan.

**Why NEW service (not folded into existing)**: scoring operates on UNCLASSIFIED tasks (no stage yet); existing `services/evaluate.py` operates on `staging:done` tasks (already routed). Different input shape → different service.

**Persona**: autofix-executor (unchanged) or potentially a lighter-weight scorer model.

### 4.2 `task-investigator` → `services/investigate.py` (NEW service) + event-watcher route

**Trigger**: `label.added(auto:candidate)` Pulse event — requires Pulse to emit a per-label-change event OR event-watcher polls for new `auto:candidate` labels.

**Function**: evaluate ONE task with `auto:candidate`; promote to `auto:ready` + `stage:queue`, or send to `waiting:human`. Same logic as current `task-investigator.md` workflow.

**Why NEW service**: separates from `services/orchestrate.py` (which groups queued tasks for execution chain). Different lifecycle phase.

**Persona**: task-investigator (unchanged).

### 4.3 `task-executor` → use existing `services/executor.py` daemon (already running)

**Status**: `services/executor.py` (PID 24951 currently `SNs`) ALREADY polls Pulse for `stage:queue` tasks. It's the v2 generalization of the autofix-executor.

**Open question (Q3 in §5)**: does the autofix-executor persona's behavior (`task-executor.md` workflow) overlap with what `services/executor.py` already does, or is there unique autofix logic that v2 executor doesn't cover?

**Tentative disposition**: REMOVE cron `task-executor` from registry.yaml; let `services/executor.py` daemon handle all queue-execution. If `task-executor.md` workflow has unique value, port it into a persona option for v2 executor.

## 5. Open questions for Nate's decision (BEFORE refactor begins)

### Q1: Does `services/executor.py` (v2) fully subsume `task-executor` (legacy cron)?

The legacy `task-executor` uses the `autofix-executor` persona and is restricted to `risk:safe` + `auto:ready`. The v2 `services/executor.py` is more general (handles all queue tasks across personas). If subsumption is clean, we just delete the legacy job. If autofix-executor has unique logic, we either keep it as an event-driven service (separate from `services/executor.py`) or fold it as a persona-mode of the v2 executor.

**Recommended default**: Subsume into v2. Autofix-executor becomes a *persona* (one of many) that v2 executor can select. Cleaner architecture.

### Q2: Does Pulse already emit per-label-change events that `event-watcher.sh` can subscribe to?

The current event-watcher polls for new tasks via client-side ID tracking (per v2 design doc line 81). It does NOT poll for label-changes. If Pulse doesn't expose a label-change event stream, we need either: (a) extend Pulse to emit them, or (b) have event-watcher poll for label-change diffs (more expensive, eventually-consistent).

**Recommended default**: Extend Pulse with a `/api/v1/events?type=label_added&since=<ts>` polling endpoint. Pure additive; no breaking changes. event-watcher converts to a polling consumer.

### Q3: Should event-watcher dispatch directly to v2 services, or stay routed through dispatcher.sh?

Currently event-watcher triggers `dispatcher.sh --run task-score` to fire the score job. Under the new rule, dispatcher is for cron-recurring jobs only. So event-watcher should call `python3 services/score.py --task-id=<id>` directly, bypassing dispatcher.

**Recommended default**: Direct invocation. event-watcher gains 3 new code paths (score, investigate, execute) that call services directly.

### Q4: Migration plan — big-bang or feature-flag?

Option A: drop the 3 pipeline jobs from registry.yaml in one commit; new event-driven services land in same commit. 5-min-cron silence; if event-driven path is broken, no fallback.

Option B: keep the 3 cron jobs but disable (`enabled: false`); add event-driven services; both paths "live" for one observation cycle; remove cron jobs after event-driven verified in vivo.

**Recommended default**: Option B (parallel-write pattern). Lower-risk; familiar from the P1.5 + P1.B1.1 dual-write rollout. ~1 day cost for the extra verification window.

## 6. Refactor scope estimate

| Phase | Item | Effort |
|---|---|---|
| D.1 | Architectural rule documented in workstream-arch §6.2 (this audit feeds it) | DONE this turn |
| D.2 | This audit (canonical decision log) | DONE this turn |
| D.3 | Answer Q1-Q4 (Nate decision) | NEXT — pending |
| D.4 | Pulse `/api/v1/events?type=label_added` endpoint (if Q2 chooses extend-Pulse path) | ~3-4 hr |
| D.5 | `services/score.py` implementation + smoke test | ~3-4 hr |
| D.6 | `services/investigate.py` implementation + smoke test | ~3-4 hr |
| D.7 | event-watcher.sh refactor (3 new event-route handlers) | ~2-3 hr |
| D.8 | registry.yaml edits (3 jobs disabled OR removed depending on Q4) | ~30 min |
| D.9 | Validate dev-env: no pipeline-state-change comes from dispatcher | ~half day |
| D.10 | Update v2 design doc with the two-tier rule + new event topology | ~1-2 hr |
| **Total** | | **~3-4 days** assuming Option B parallel-write rollout |

## 7. Dependencies for Phases B + C + E

### Phase B (F-1 enforcement) — depends on D

F-1 fix sketch needs to know WHICH event/state to gate on. Under the new architecture, the answer is unambiguous: gate at `label.added(stage:queue)` — when a task with `pipeline:needs-approval` tries to enter queue, reject the queue-entry until an approval event fires.

If D doesn't land first, F-1 fix has to make a guess about whether to gate at cron (executor.sh) or event (services/executor.py) — and the answer depends on the new architecture.

**Verdict**: D is hard-prerequisite for B.

### Phase C (F-5 silent-mutation audit) — depends on D

F-5's root is in the executor's claim path — same code F-1 touches. Same dependency.

**Verdict**: D is hard-prerequisite for C.

### Phase E (Watchdog W2/W3) — depends on D

The new event topology determines what to monitor. Pre-D, /health UI would surface `task-score` / `task-investigator` / `task-executor` cron states (which won't exist post-D). Post-D, it surfaces `services/score.py` / `services/investigate.py` daemon health + event-watcher event throughput.

**Verdict**: D is hard-prerequisite for E.

## 8. Next-action sequence

1. **PAUSE for Nate's answers to Q1-Q4** in §5. Default recommendations stated. No code changes yet.
2. **After answers**: kick off D.4-D.8 (event-driven services + Pulse endpoint + event-watcher refactor + registry edits).
3. **After D verified in dev**: kick off **B + C in parallel** (F-1 enforcement + F-5 silent-mutation fix — both in `services/executor.py` claim path).
4. **After B + C**: kick off **E** (Watchdog W2/W3 — observability surfaces for the new event topology).
5. Each phase capstone: AC-03 gate + Jarvis-side tracking commit + AIFred-Pro-Dev `nate-dev` commit + PR-to-David once a logical group lands.

## 9. Status

**Audit phase**: COMPLETE 2026-05-12.

**Phase D impl**: AWAITING Nate's answers to §5 Q1-Q4.

**Subsequent phases**: not started; queued behind D's completion.

---

*Filed under `Jarvis/projects/project-aion/reports/` per the planning-doc-discipline rule (feedback memory `feedback_planning_doc_discipline.md`). Extending the workstream-arch §6.2 Future Work in the same commit.*
