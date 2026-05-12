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

## 5. Open questions for Nate's decision — RATIFIED 2026-05-12

### Q1 — RATIFIED: Plan B (subsume + drop `auto:*` from event-driven layer)

After running the audit-default approach into a wall (see §6 D-impl discovery: 60+ `auto:*` references in legacy shell layer with zero V2-service consumers), Nate ratified **Plan B** — drop `auto:*` emission from the event-driven layer entirely. `services/score.py` strips its `determine_auto_label` + `fix_contradictions` paths; emits `risk:*` only. `services/investigate.py` (D.6) is NOT BUILT — the `auto:candidate → auto:ready` promotion path it would have implemented now produces labels that no V2 service consumes. V2 pipeline drives task advancement via dimension labels (staging/evaluated/queued/active/completed/blocked) independently. Legacy shell layer (event-watcher.sh inline auto:ready additions, pipeline-watchdog.sh mutex rules, lib/routing-rules.yaml, persona configs) keeps its `auto:*` machinery untouched in this phase — those migrate in a separate post-Phase-D workstream.

**Variant of Q1 (subsumption)**: `services/executor.py` daemon subsumes legacy `task-executor` cron job; autofix-executor folded as persona-mode of v2 executor.

### Q2 — RATIFIED: extend Pulse with the events endpoint

D.4 already shipped extending `GET /api/v1/events` with `event_type` + `since` filters (commit `78693a3` on AIFred-Pro-Dev nate-dev). event-watcher.sh converts to a polling consumer.

**In-vivo discovery (informs D.7)**: Pulse emits `event_type="created"` on POST `/api/v1/tasks` (app.py:386), NOT `"task.created"` as audit §4.1 speculated. Webhook fires with `"task:created"` (line 388). The events table uses bare `"created"`. D.7 polling URL uses `event_type=created`.

### Q3 — RATIFIED: direct invocation, bypassing dispatcher

event-watcher.sh fires `python3 services/score.py --task-id=<id>` synchronously per polled `created` event. Score.py runs in ~13-21ms; sync invocation inside the cron-style outer loop is cheap enough. Failure non-fatal via `|| log "..."` (suppresses `set -e`).

### Q4 — RATIFIED: Plan B (parallel-write) for migration

Option B kept. `task-score`, `task-investigator`, `task-executor` all set `enabled: false` in registry.yaml (Phase D / Plan B comment block in registry.yaml lines 115-129 explains the disposition + replacements). Cron blocks retained for one observation cycle so rollout can be reverted by a single field flip if event-driven path regresses.

### Q-B (branch strategy) — RATIFIED: B2 (hold local until PR #3 merges)

Phase D commits stay local on AIFred-Pro-Dev `nate-dev` until `davidmoneil/AIFred-Pro#3` merges. After merge: pull main into nate-dev, push Phase D as separate PR. PR #3 itself unaffected — David reviews the re-cleave bundle on its merits without bundled Phase D scope-creep.

## 6. Refactor scope estimate + execution log

| Phase | Item | Effort | Status (2026-05-12) |
|---|---|---|---|
| D.1 | Architectural rule documented in workstream-arch §6.2 (this audit feeds it) | DONE 2026-05-12 (commit `c413e03` Jarvis main) | **SHIPPED** |
| D.2 | This audit (canonical decision log) | DONE 2026-05-12 (same commit) | **SHIPPED** |
| D.3 | Answer Q1-Q4 (Nate decision) | Ratified 2026-05-12 — see §5 above | **CLOSED** |
| D.4 | Pulse `/api/v1/events` extended with `event_type` + `since` filters | ~3-4 hr (actual ~2 hr) | **SHIPPED LOCAL** (commit `78693a3` on AIFred-Pro-Dev nate-dev; held per B2) |
| D.5 | `services/score.py` implementation + smoke test | ~3-4 hr (actual ~2 hr) | **SHIPPED LOCAL** (initial commit `eb6032f`; Plan-B-revised in this turn — `auto:*` stripped, `risk:*` only) |
| D.6 | `services/investigate.py` | — | **SKIPPED** under Plan B (auto:candidate path dropped from event-driven layer) |
| D.7 | event-watcher.sh refactor — new `created`-event polling block firing score.py | ~2-3 hr (actual ~1 hr + bugfix) | **SHIPPED LOCAL** (uncommitted this turn). Added `/api/v1/events?event_type=created&since=<encoded-cursor>` polling block before legacy JSONL handler; URL-encoded cursor's `+00:00` → `%2B00:00`; warning log on curl failure |
| D.8 | registry.yaml edits — 3 jobs `enabled: false` + Plan B replacement comment block | ~30 min (actual ~30 min) | **SHIPPED LOCAL** (uncommitted this turn) |
| D.9 | Validate dev-env: event-driven path fires risk:* (no auto:*); cursor advances; v2 state machine independent | ~half day (actual ~2 hr including bugfix) | **SHIPPED** — direct score.py: ✓ ; polling block 10 events captured + scored: ✓ ; PLAN B PASS verified (zero auto:*, risk:* applied); 11 smoke tasks cleaned |
| D.10 | Update v2 design doc + audit report (this section) | ~1-2 hr | **THIS TURN** |
| **Total** | | **~3-4 days estimate** | **~5 hr ACTUAL** through D.10 local (smaller than estimate because D.6 dropped) |

**Saved effort from Plan B (~3-4 hr)**: D.6 services/investigate.py not implemented, eliminating ~3-4 hr of build + smoke + design-doc time. Plan B also lowers cognitive load on future readers who would otherwise have to trace why a service emits labels nothing consumes.

### 6.1 Phase D in-vivo discoveries (audit-doc vs reality)

Captured during D.7-D.9 implementation, surfaces these mismatches between the audit's pre-impl model and the actual codebase. None changed scope materially but each required a small course-correction:

| # | Audit assumption | Reality | Fix |
|---|---|---|---|
| 1 | event_type is `task.created` | event_type is bare `created` (Pulse app.py:386) | URL filter uses `event_type=created` |
| 2 | event-watcher already detects task.created (audit §4.1) | event-watcher only detects events via `.beads/events.jsonl` legacy path (vestigial post-Pulse-migration; line 9 comment) | D.7 added a brand-new Pulse `/api/v1/events` polling block |
| 3 | event-watcher.sh launchd label is `event-watcher` | actual labels: `com.aion.nexus-event-watcher` (prod) + `com.aion.nexus-dev-event-watcher` (dev); dev plist exists but not loaded | n/a for impl; documented for ops |
| 4 | PULSE_API_URL convention | already contains `/api/v1`; callers append `/events` not `/api/v1/events` | corrected D.7 polling URL |
| 5 | Bare bash variable interpolation safe for ISO timestamps in URLs | `+00:00` decodes to space in URL query string → HTTP 400 → silent fail-open | URL-encode cursor: `"${PE_CURSOR//+/%2B}"`; warning log on curl exit non-zero |

### 6.2 Files touched (Phase D total)

**On AIFred-Pro-Dev nate-dev (3 commits local, NOT pushed per B2 ratification)**:
- `pulse/app.py` — D.4 events endpoint extension (+29/-10 lines) — commit `78693a3`
- `.claude/jobs/services/score.py` — D.5 NEW (157 LOC) — initial commit `eb6032f`; Plan-B revision (-49 LOC stripping auto:* paths) folded into combined commit `65e2eef`
- `.claude/jobs/event-watcher.sh` — D.7 polling block (+51 LOC) — combined commit `65e2eef`
- `.claude/jobs/registry.yaml` — D.8 (3 jobs disabled + Plan-B comment block; +21/-13 net) — combined commit `65e2eef`
- `.claude/jobs/state/pulse-events-cursor` — NEW state file (cursor seeded to 2026-05-12T18:18:14Z post-smoke); gitignored

**Combined Phase D commit `65e2eef`** (D.5-revision + D.7 + D.8): "feat(phase-d): event-driven score.py + event-watcher polling + registry disable [Plan B, B2] [Nexus]". 3 files, +95/-70.

**On Jarvis Project_Aion (this commit)**:
- `projects/project-aion/reports/dispatcher-registry-audit-2026-05-12.md` (this update; §5 + §6 + §9 rewritten)
- `projects/project-aion/designs/project-aion-workstream-architecture-2026-05-05.md` (§6.2 Phase D row flipped to IN-DEV-COMPLETE-PENDING-MERGE)
- `.claude/context/.scratchpad.md` (Phase D state captured)
- `.claude/context/session-state.md` (status updated)

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

## 9. Status (2026-05-12 end-of-day)

**Audit phase**: COMPLETE 2026-05-12.

**Phase D impl**: IN-DEV-COMPLETE 2026-05-12. D.4 + D.5 + D.7 + D.8 + D.9 SHIPPED LOCAL. D.6 SKIPPED per Plan B. D.10 THIS TURN. All commits HELD on AIFred-Pro-Dev `nate-dev` per B2 ratification — NOT pushed to davidmoneil/AIFred-Pro until PR #3 merges. After PR #3 merge: pull main into nate-dev, push Phase D as separate PR.

**Subsequent phases**: still queued behind D's completion + PR #3 merge.
- Phase B + C (F-1 enforcement + F-5 silent-mutation fix): both live in `services/executor.py` claim path. Estimated ~2-3 day combined after Phase D ships to David.
- Phase E (Watchdog W2/W3): observability surfaces for new event topology. ~1-2 day after B+C.
- Total remaining post-PR-#3-merge workstream: ~3-5 days.

**Production-readiness note for cursor file**: when the prod event-watcher (com.aion.nexus-event-watcher) picks up the new polling block, the `pulse-events-cursor` file will not exist on its first run and default to `1970-01-01T00:00:00Z`. With LIMIT=200, only the 200 most-recent `created` events will be processed; older events will be silently skipped. Score.py idempotency means this is benign on dev (re-scoring an already-classified task no-ops), but on first prod cutover the operator should `date -u +'%Y-%m-%dT%H:%M:%SZ' > .claude/jobs/state/pulse-events-cursor` to seed cursor to "now" before the first cron fire. Dev cursor was seeded post-smoke at 2026-05-12T18:18:14Z.

---

*Filed under `Jarvis/projects/project-aion/reports/` per the planning-doc-discipline rule (feedback memory `feedback_planning_doc_discipline.md`). Extending the workstream-arch §6.2 Future Work in the same commit.*
