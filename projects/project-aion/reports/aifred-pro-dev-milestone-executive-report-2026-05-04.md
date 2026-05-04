# Executive Milestone Report — AIFred-Pro-Dev `nate-dev` Milestone (2026-05-04)

**Generated**: 2026-05-04
**Branch under review**: `nate-dev` HEAD `af73a46` (45 commits ahead of `origin/main` `dfd40c5`; 0 behind; +1 unpushed)
**Companion artifact**: Milestone debrief at `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-pipeline-v2-milestone.md` (narrative-causal register; this document is the technical-implementation register)
**Source synthesis**: Phase 1 comprehensive review (330 lines) + Phase 3 pre-merge analysis (228 lines) + three parallel Explore agent reports (ProjectIntel comms catalog, nexus-sync 21-commit code-level deep diff, Pulse-Nexus rewiring assessment)
**Outcome decision**: REJECT-all the 21 commits on `origin/nexus-sync-2026-04`; milestone scope is the existing `nate-dev` HEAD `af73a46` as-is; gospel-synopsis E2E smoke-test gates the push. (Phase 1 and Phase 3 reports flagged a `dashboard/frontend/src/lib/board.ts` `waiting:human` BLOCKER_LABELS fix as milestone-pending; verification-on-read at `nate-dev` HEAD found `waiting:human` already present as the first entry in BLOCKER_LABELS at line 52 — the Phase 1 / Phase 3 claim reflected stale-state reading and is rescinded.)

---

## 1. Executive Summary

Two-and-a-half weeks of stacked work across two workspaces (Jarvis production + AIFred-Pro-Dev `nate-dev`) and two methodological tracks (Pipeline v2 architecture rebuild + token-compression initiative under pre-registration discipline) produced six shippable initiatives converging on a single architectural decision now staged for David O'Neil's review. The dominant deliverable is **Pipeline v2** — 45 commits on `nate-dev`, 19 of them direct pipeline rebuilds, implementing webhook-driven 6-dimensional Pulse orchestration with five dedicated Python services, end-to-end telemetry, and atomic label state transitions.

The supporting deliverables: (1) **Token-compression Phases 1.1–1.3.5** deployed on AIFred-Pro-Dev with pre-registration discipline imported from clinical-trial methodology; (2) **JICM v7.9** promoted to Jarvis production with Stage-1 CLEAR (slim watcher cutover, sensing-layer hooks); (3) **Two-Stage Validation Gating pattern** formalized as a first-class Jarvis pattern; (4) **Dashboard live panels** (Activity Timeline, Dependency Chain, Project Creator streaming, live execution telemetry); (5) **ProjectIntel collaboration cadence** — 4 substantive debriefs (~6,050 words), 2 questions resolved; (6) **Phase 1.3.5 reviewer Claude-CLI route** as the first clean pre-deploy pre-registration in the token-compression family.

The **REJECT-all decision on the 21 nexus-sync commits** rests on three convergent reasoning chains. First, Pipeline v2 architecturally deprecates the legacy `executor.sh` shell stack that 17 of the 21 commits extend; adopting Phase 5 observability into deprecated code contradicts the deprecation argument we are committing to in the milestone debrief. Second, the diff David evaluates should carry a clean authorship signal — "what Nate built since branching from main" — not a mixture of Nate's milestone work plus David's own experimental work cherry-picked back. Third, `nexus-sync-2026-04` has had zero new commits since 2026-04-22 and zero direct mentions in any debrief, question, or focus-areas file authored by David since then; the implicit signal is that David has not himself elected to merge his branch to `main`, and Nate cherry-picking from it would invert the review hierarchy.

The **honest scope statement on Pipeline v2** is the most consequential finding from the rewiring assessment: Pipeline v2 is a *reconceptualization* of Nexus, not an incremental enhancement. Three architectural tradeoffs were taken explicitly: scheduled cron-driven jobs were replaced with event-driven webhook dispatch (sub-second latency at the cost of registry-based scheduling flexibility); executor-level retry-with-backoff was replaced with the Review→Diagnose→Staging cycle (more intelligent recovery at the cost of executor-internal hedging); and the cron watchdog heartbeat was replaced with implicit progress tracking via Pulse label mutations (simpler, but no automatic killing of hung executor processes). All three tradeoffs work; they are not bugs. **Restoring v1 feature parity (Telegram routing, watchdog stuck-task detection, registry-based scheduling, v1→v2 task migration tooling, in-process retry) totals approximately 30-50 hours of additional work** — itemized in §7 below. David should decide whether v1's traits are essential to AIFred-Pro's production mission. If they are, the rewiring is straightforward and additive; if they are not, the tradeoffs stand.

---

## 2. Major Changes We've Made

The work in this 14-day window organizes into six initiatives, listed in order of architectural weight on AIFred-Pro-Dev.

### 2.1 Pipeline v2 — Webhook-Driven Service Mesh (Dominant)

**Scope**: Replace AIFred-Pro's prior orchestration (single dispatcher.sh + executor.sh shell loop running on a 5-minute cron grid) with a Python-first service mesh of five dedicated services governed by Pulse label mutations.

**Architecture** (per `.claude/context/designs/pipeline-redesign-v2.md`, 1100 lines):
- **`stage.py`** — classifier: assigns task to a stage based on label state and content type
- **`evaluate.py`** — risk/capability scorer: gates blocked tasks; identifies decomposition opportunities
- **`orchestrate.py`** — dependency + chain resolver: respects pre-assigned chain_id metadata; generates execution batches
- **`executor.py`** — Ollama + Claude-CLI router: per-task engine selection via metadata.execution_engine; structured telemetry capture; context chaining via `claude -r <session_id>` for cache reuse
- **`reviewer.py`** — approval + telemetry: filesystem verification; structured `{ passed, confidence, issues, summary }` JSON output; routes failures to Diagnose

**Six-dimensional label state machine** (replaces v1's loose status+label+stage combination): each dimension owned by exactly one service.
- `staging` — owned by stage.py: `wait` / `done` / `blocked`
- `evaluated` — owned by evaluate.py: `no` / `done` / `blocked`
- `queued` — owned by orchestrate.py: `no` / `done` / `blocked`
- `active` — owned by executor.py: `no` / `running` / `done` / `failed`
- `completed` — owned by reviewer.py: `no` / `done`
- `blocked` — orthogonal to lifecycle: `no` / `yes`

**Dispatch model**: webhook-driven event loop with 60s fallback poll. End-to-end latency for a scored task: 0-30 sec (vs 0-60 min in v1's 5-min cron + 20-min job-cycle batching).

**Status as of 2026-05-04**: functionally complete + hardened. All 16 sections of the `Observed-issues.txt` audit closed. Stress-tested at 220 cycles / 118 triggers. Smoke-tested across happy-path / decomposition / safety-block / unclear / deliberate-fail / chain-parent / chain-child cases. 77 hardening tests passing.

### 2.2 Token-Compression Initiative — Pre-Registration Discipline (Cross-cut)

The most methodologically mature workstream. Pre-registration discipline imported from clinical-trial methodology; Stage-1 / Stage-2 gating prevents premature promotion of changes with measurable behavioral effect.

**Phase 0 — Instrumentation** (Jarvis side, all shipped):
- `0.2` Cache telemetry capture canonical formula (`9e3afea`)
- `0.3` Extractor v2 (`2de70c2`)
- `0.4` Quote-aware register filter (`43adc5d`) — eliminated false-positive register violations from meta-mentions in quoted illustrative examples
- `0.5` Pipeline-telemetry extractor for cross-workspace metric flow (`bf912f4`) — unblocks Phase 1.2/1.3 evaluation

**Phase 1 — Persona Brief Cascade**:

| Phase | Brief | Deploy | Status | Pre-registration |
|-------|-------|--------|--------|-------------------|
| 1.1 | Jeeves-Brief (Jarvis output style) | `75c9d97` 2026-04-30 | Stage-1 INCOMPLETE under new protocol; sample-sufficiency check 2026-05-15 | Filed post-hoc |
| 1.2 | Pipeline Executor-Brief | `f15f6a2` 2026-04-30 | Pre-reg filed (post-hoc); now unblocked | Filed |
| 1.3 | Pipeline Reviewer-Brief | `f15f6a2` 2026-04-30 | Pre-reg filed (post-hoc); now unblocked | Filed |
| 1.3.5 | Reviewer Claude-CLI route | `af73a46` 2026-05-02 | **First clean pre-deploy pre-registration**; Stage-1 verdict 2026-05-04 ~17:04 MDT; Stage-2 2026-05-16 | Sealed `2026-05-02T23:04:12Z` |
| 1.5 | Alfred-Brief (system prompt) | `c31b2bd` 2026-04-30 | First clean pre-reg in family; Stage-1 interim 2026-05-03; Stage-2 formal 2026-05-15 | Filed pre-deploy |

**Phase 2 — Chain-of-Draft Codification** (Jarvis-side; deployed Stage-1 2026-05-04T00:09:29Z):
- Stratified baseline complete across 40 sessions / 5 task types / 790 substantive turns
- 5 per-task-type fewshot files
- `apply-cod.sh` v1.1.0 with `--task-type` / `--variant` flags + skip-rule enforcement
- `cod-inject.sh` UPS hook with prefix-tag opt-in (`[task: <type>]`) and `JICM_COD_DISABLED=1` kill switch
- Stage-1 verdict due 2026-05-06T00:09:29Z; Stage-2 verdict due 2026-05-18T00:09:29Z

**Methodological trajectory**: Phase 1.1 was post-hoc; Phase 1.3.5 and Phase 2 are first-clean pre-deploy. The maturation of pre-registration discipline is itself a deliverable.

### 2.3 JICM v7.9 (Jarvis Side, Cross-Cut)

Sensing layer + slim watcher cutover, completed across two days on Jarvis production with Stage-1 CLEAR (5/5 PASS).

- `v7.9.0–7.9.5`: Hook layer (UserPromptSubmit gate sensing, Stop hook signal emission, PreCompact adjunct), backend abstraction (tmux + PTY placeholder), slim watcher rewrite (1559 lines / 55 KB → 171 lines / 6.7 KB), status line v8, Stage-1 harness with three iterative fix passes (warmup-prompt, `wait_for_idle` for AC-01 prompt-queueing race)
- `v7.9.6a` (`57cb3ed` 2026-05-03T03:25Z): Production deploy of sensing layer (Approach B — hooks + statusline + session-start.sh patch; v7.3 watcher untouched)
- `v7.9.6b` (`2a559b5` 2026-05-03T04:46Z): Watcher swap (v7.3 → v7.9 slim) with Approach C back-compat shim
- `v7.9.6c` (DEFERRED): Remove back-compat shim once operational confidence accumulates (~6 clean cycles)

Demoted Stage-2 to passive data-gathering (informs v8.x design rather than gating shim removal). v8.0 roadmap published targeting portable architecture (decouple tmux), async hooks, native thinking-token support, local-model-suite for offline compression.

### 2.4 Two-Stage Validation Gating Pattern (Cross-cut)

Generalized from token-compression methodology to a first-class Jarvis pattern at `.claude/context/patterns/two-stage-validation-gating.md` (commit `e3fdc6d`, 2026-05-01). Indexed in `patterns/_index.md`, `psyche/capability-map.yaml`, `psyche/nous-map.md`. Composition references in `milestone-review-pattern.md` v1.3.1, `self-evolution-pattern.md` step 6.

Core insight: Stage 1 (regression-catch axes only, short window) cannot promote; only Stage 2 (formal pre-registered sign-off, longer window) gates promotion. Window duration scales with **scope** (effort class) not calendar — automation-testable changes run Stage 1 in minutes; per-deploy / per-session telemetry runs in days/weeks. Currently applied to: Token-compression Phase 1.1, 1.5, 1.2, 1.3, 1.3.5, 2.4; JICM v7.9.

### 2.5 Dashboard Live Panels and Telemetry

Front-end work targeting the AI Reviewer-first instrumentation strategy David endorsed on 2026-04-25.
- **Activity Timeline** — chronological event stream with structured `pipeline:*` events emitted by all 6 services; POST `/events` endpoint; ActivityTimeline component
- **Dependency Chain** component — visualization of multi-task chains with pipeline state badges; only renders for chains > 1 member
- **Live Execution Panel** — 4-column grid showing in-flight token usage / turn count / elapsed time; reads `/tasks/:id/live` endpoint with `log_bytes`, `log_lines`, `activity_tail`, `session_id`, `prompt_preview`
- **Project Creator** — chat UI for local-LLM ticket generation; v2 streaming SSE rewrite at `/api/project-creator/generate-stream`; sessionStorage persistence
- **`blocked:no` fix** — root cause was prefix matching `blocked:*` in 4 locations (classify.ts, board.ts, labels.ts ×2); all fixed; `pipeline` blocked reason added for `blocked:yes`

### 2.6 ProjectIntel Collaboration Cadence

Operational structure exercised over the window: 4 substantive debriefs (~6,050 words across `Debriefs/AIFred-Pro/`), 2 questions resolved (one directly by David on 2026-04-25 — high engagement signal). The 2026-05-02 strategic debrief framed Replace / Selective-Adoption / Park-as-Experimental decision context for the milestone now staged. David's status file `Status/david/focus-areas.md` is 22 days stale (minor data hygiene; not blocking).

---

## 3. Most Impactful QoL Changes

Quality-of-life changes — the differences a daily operator notices first — ranked roughly by experiential weight.

1. **Sub-second pipeline latency** — the single largest QoL improvement. Pipeline v2's webhook-driven dispatch replaces v1's 5-minute cron grid plus 20-minute job-cycle batching. End-to-end latency for a task moving through `intake → evaluate → route → queue → execute → review` drops from 0-60 minutes (worst case in v1) to 0-30 seconds (v2 Ollama-scored stages, ~20-60s for Claude-executed tasks). Subjectively, the dashboard now feels live rather than spectator.

2. **Live execution panel** — in-flight tasks display token usage / turn count / elapsed time in real time. v1 only showed completed-task history. The execution panel is the single most important transparency improvement for understanding *what is happening right now* in the pipeline.

3. **`waiting:human` BLOCKER_LABELS — already correct on `nate-dev`** — production AIFred-Pro v1's `dashboard/frontend/src/lib/board.ts` historically omitted `waiting:human` despite task-investigator setting it (tasks with `waiting:human` fell through to Backlog instead of Blocked, becoming invisible in the UI). Pipeline v2's `nate-dev` includes `waiting:human` as the first entry in BLOCKER_LABELS at `dashboard/frontend/src/lib/board.ts:52`, verified on read at HEAD `af73a46`. Phase 1 and Phase 3 reports flagged this as a milestone-pending fix; that flag was based on stale-state reading and is rescinded — no edit needed.

4. **Engine routing per service** — Ollama vs Claude-CLI selectable per service via metadata. Ollama (default) for fast/free scoring; Claude-CLI (opt-in) for accuracy-bound stages. Deployed at the reviewer in Phase 1.3.5 (`af73a46`); evaluator and stager already engine-routable via the same pattern.

5. **Filesystem verification in reviewer** — `reviewer.py._verify_filesystem()` checks claimed `files_modified` actually exist; validates expected paths; reports executor log + telemetry. Catches false-success claims that would otherwise pass review.

6. **Executor crash recovery** — type coercion, crash guard, failure routing, `v2-execute-fail` transition. Failed executions no longer silently appear successful; they route to Diagnose for redesign.

7. **Decomposition guard** — evaluator now triggers split when 3+ sequential steps are detected; respects pre-assigned chain_id / chain_order metadata (preventing the orchestrator from regrouping explicitly-chained tasks).

8. **Activity Timeline + Dependency Chain dashboard components** — two dedicated React components for navigating multi-task chains and event streams; replaces the ad-hoc table-only view of v1.

9. **Stager path validation** — `stage.py` validates LLM-generated `file_paths` against PROJECT_DIR; drops nonexistent paths instead of hallucinating them downstream.

10. **Task archival summary** — `archive_task()` in `_shared.py` writes a lifecycle summary to `archive/` on task close; provides post-hoc analysis surface that did not previously exist.

11. **Decomposed parent guard** — `pipeline-watcher.py` auto-closes parents when all children done. v1 left orphan parents indefinitely.

12. **P0 telemetry rollout** — every service emits structured telemetry (`prompt_tokens`, `completion_tokens`, `duration_ms`, `tool_calls`, `files_touched`); enables the live execution panel and feeds the pipeline-telemetry extractor for token-compression analysis.

13. **AC-03 milestone-review pattern composition** — Two-Stage Validation Gating now explicitly composes with milestone-review (v1.3.1); the gate enforces the regression-catch / formal-signoff split that AC-03 was previously implicit about.

---

## 4. Mutually Exclusive Conflicts (Irreconcilable)

These are the architectural boundaries where Pipeline v2 and David's nexus-sync experimental work cannot both be true. Cherry-picking from nexus-sync into nate-dev would either contradict v2's architecture or require non-trivial reconciliation that erases the experimental branch's distinctive signal.

### 4.1 `executor.sh` Deprecation vs Phase 5.x Extension

Pipeline v2's `executor.py` (21.7 KB Python) replaces `executor.sh` (46 KB shell) entirely. Of the 21 nexus-sync commits, **17 directly target `executor.sh` or its surrounding shell stack** — model pin fix, watchdog improvements, MODEL routing, NEXUS_THREAD_ID propagation, dual-write logging, audit-log integration, decision-rationale emission, shellcheck SC2155/SC2038 fixes, TZ discipline. Adopting any of them re-invests in code v2 is removing.

The deprecation reasoning chain (per User direction for the milestone debrief): Pipeline v2's Python services own dispatch → `executor.sh` is now a duplicate code path → keeping it risks silently retrying via legacy when Python services fail (masking real failures from Diagnose) → it should be removed. Adopting Phase 5 observability into `executor.sh` would extend its life and weaken the deprecation case.

### 4.2 Pulsars vs Webhook-Driven Event Loop

v1's five registered cron jobs (20-min for scoring/investigation/execution; 12-hr for health checks) are replaced by a single event-watcher loop with webhook dispatch and 60s fallback poll. nexus-sync extends the cron model with TZ discipline (`c4058bf`), additional thread_id propagation in `pulsar-runner.sh`, and watchdog hardening. These commits are well-engineered for the v1 model but architecturally incompatible with v2's webhook dispatch.

### 4.3 v1 `stage:*` Labels vs v2 6-Dimensional State Machine

v1 uses `stage:intake`, `stage:evaluate`, `stage:route`, `stage:queue`, `stage:execute`, `stage:review` as a linear pipeline. v2 introduces explicit per-service-owned dimensions (staging, evaluated, queued, active, completed, blocked). The label taxonomies are not interchangeable — a task in the v2 system never carries `stage:*` labels. Adopting nexus-sync persona prompts that emit decisions referencing stage names would conflict with v2's task lifecycle.

### 4.4 `NEXUS_THREAD_ID` Dual-Write vs `metadata.orchestration` Native Tracking

nexus-sync's Phase 5.2 (`54dda47`) introduces `NEXUS_THREAD_ID` as a process-tree-inherited correlation primitive, with dual-write to `pulse.audit_log`, `pulse.cost_events`, `pulse.decision_events` tables via `lib/audit-log.sh`, `lib/decision-log.sh`, `lib/cost-log.sh`. v2 instead uses Pulse-native `metadata.orchestration` and `metadata.telemetry` fields per task, with audit captured server-side in `pulse.task_events`. Both models can be made to work, but maintaining both creates schema-sync burden every time the audit shape evolves.

### 4.5 Cron-Driven Retry vs Review→Diagnose→Staging Cycle

v1's `dispatcher-watchdog.sh` runs every 15 min, detects stuck jobs (no progress beyond `timeout_minutes` from registry.yaml), increments retry count, and re-queues with exponential backoff (1hr → 2hr → 4hr, max 5 retries). nexus-sync hardens this watchdog (`7c4db38` adds tiered escalation, stale counter, msgbus integration, throttled alerts). v2 replaces blind retry with the Review→Diagnose→Staging cycle: failed executions trigger Review, which routes to Diagnose, which redesigns or decomposes the task and returns it to Staging. Adopting cron-driven retry into v2 would create two mechanisms competing to handle the same failure class.

### 4.6 Bash Personas with Inline Decision Logging vs Python Personas with Structured `decisions[]` Output

nexus-sync's Phase 5.5 (`93f5320`) adds 9 inline `log_decision` call sites in `executor.sh` (budget_gate, task_claim, retry, task_release) and a `decisions[]` array convention in three persona prompts (task-evaluator, task-investigator, ai-reviewer; 188-line diff on ai-reviewer/prompt.md). v2's persona system loads prompts from disk via `_shared.py.load_persona_prompt()` but the persona prompts themselves have evolved on `nate-dev` for Pipeline v2. The 188-line diff represents direct conflict between Nate's Pipeline-v2-aware prompt evolution and David's Phase 5.5 decision-rationale rollout. The two cannot be merged file-by-file without manual reconciliation.

### 4.7 Dashboard Birth Commit vs Independent Dashboard Evolution

nexus-sync's `a450f61` (200+ files) is the dashboard's birth commit on that branch — David's initial import from `nexus-dashboard/`. nate-dev inherits the dashboard via merge-base `dfd40c5` and has evolved it independently (live execution panel, Activity Timeline, Dependency Chain, Project Creator streaming). Re-merging `a450f61` would not be a cherry-pick; it would be a destructive overwrite of Nate's dashboard evolution with a 4-week-old snapshot.

---

## 5. Comparative Differences — Mergeable Directly or in Concept

These are the items where some form of integration is genuinely possible — either as a direct cherry-pick (small subset) or as conceptual port via additional development on the v2 side. None of them are recommended for inclusion in *this* milestone, but each warrants future evaluation.

### 5.1 Audit-Ingest Infrastructure (`ea298c2` + `0641bc3`) — DIRECT MERGE POSSIBLE

David's audit-ingest is the most architecturally independent piece of nexus-sync. 684 lines of Python (`audit-ingest.sh` shell wrapper + `audit-ingest.py` core logic) implementing idempotent JSONL → Postgres replay: byte-offset tracking in `.claude/jobs/state/audit-ingest-state.json`, rotation detection via inode comparison, batched INSERTs (200 rows/txn), ON CONFLICT DO NOTHING for idempotency keyed to alembic 013 unique indexes.

**Merge mechanism**: direct cherry-pick possible if v2 commits to maintaining the `pulse.audit_log` / `pulse.cost_events` / `pulse.decision_events` schema and chooses Postgres-backed event storage as the durable fallback when Pulse is unreachable.

**Effort if adopted**: ~2-4 hours to integrate into the v2 deployment topology + 1-2 hours testing.

**Decision input**: does Pipeline v2 want a JSONL spool durable-fallback for events when Pulse API is unreachable, or does it prefer to rely entirely on Pulse's own durability? If yes to spool fallback, audit-ingest is immediately ADOPTable.

### 5.2 Decision-Rationale Persona Output Pattern (Phase 5.5, `93f5320`) — CONCEPTUAL PORT

The pattern is valuable: SDK-based personas emit `decisions[]` arrays in their report JSON (alongside primary report content); the executor post-processes those arrays into `pulse.decision_events`. This separates *decision content* (what the persona thought) from *decision mechanics* (how those thoughts get logged). Aligns directly with David's stated AI-Reviewer dashboard instrumentation priority.

**Merge mechanism**: cannot direct-cherry-pick due to 188-line conflict on `ai-reviewer/prompt.md` between David's Phase 5.5 evolution and Nate's Pipeline-v2 evolution. Recommended path: David refreshes the persona prompts in main when ready; Nate rebases nate-dev onto the new main.

**Effort if conceptual port instead**: ~6-12 hours to implement `decisions[]` output convention in v2's persona prompt templates + executor.py post-processing + dashboard surface for the decision_events.

### 5.3 Dashboard Orchestration Visualization (Category C — `40290c4`, `f5f98ea`, `1e618ef`) — CONCEPTUAL PORT

David's three Category C commits add visual indicators on `OrchestrationGraphView.tsx`: loop badges (↻ N) for execution_mode=loop personas, conditional badges (⊃) for tasks with `when` expressions, retry badges, output flow edges (green dotted for `$taskId.output` references), conditional edges (dashed purple), dangling-edge guards.

**Merge mechanism**: nate-dev's `DependencyChain.tsx` is a different component with different visualization patterns. Cannot direct-cherry-pick. The *concepts* (conditional/loop/retry/output-flow indicators) are port-able into v2's dashboard idioms.

**Effort if conceptual port**: ~4-8 hours to add equivalent visual indicators to `DependencyChain.tsx` + integration testing.

**Decision input**: is v2's dashboard the new authoritative orchestration visualization, or does v2 retain `OrchestrationGraphView.tsx` for backward compatibility? If retain, the v2 evolution path may eventually converge with David's enhancements; if replace, the concepts port to `DependencyChain.tsx`.

### 5.4 README Refresh (`ee9b155`) — ADAPT (Write Our Own)

Direct merge contradicts authorship signal. Recommendation: write a milestone-reflective README update separately on nate-dev, optionally referencing nexus-sync notes as historical context. Per User direction (Q3), this is deferred — milestone debrief carries the narrative.

### 5.5 Persona Prompt Evolution (`task-evaluator`, `task-investigator`) — REBASE-AFTER

David's nexus-sync evolution of `task-evaluator/prompt.md` and `task-investigator/prompt.md` (decision-rationale rollout) conflicts file-by-file with nate-dev's Pipeline-v2-aware evolution of the same files. The cleanest reconciliation is sequential: David merges nexus-sync to main when he chooses; Nate rebases nate-dev onto the new main; conflicts resolve in one focused session.

---

## 6. Key Components Not Yet Implemented

The intersection of "what David has signaled as priority" (Agent A) and "what is missing from Pipeline v2" (Agent C) produces the following gap inventory.

### 6.1 David-Stated Priorities Not Yet Built (from 2026-04-25 direct answer)

David's stated ordering: **AI Reviewer instrumentation > Dashboard live panel > Orchestrator > Liaison metrics**.

| # | Component | Status | Blocker |
|---|-----------|--------|---------|
| 1 | AI Reviewer persona dashboard instrumentation | **PARTIAL** — telemetry captured at `metadata.review_telemetry`; live panel reads `/tasks/:id/live` for the executor; reviewer-specific live view not yet built | Need a `/reviewer/:id/live` route + dashboard component |
| 2 | Orchestrator instrumentation | **NOT STARTED** beyond structured event emission | Dashboard component for `metadata.orchestration` lifecycle visualization |
| 3 | Liaison metrics | **NOT STARTED** | David's liaison persona is on his side; cross-Archon collaboration metrics not yet defined |

### 6.2 Pipeline v2 Components Not Yet Provided

Inventory of capabilities David's v1 production AIFred-Pro provides that v2 currently does not (per Agent C's Pulse-Nexus rewiring assessment, §7 below has effort estimates).

1. **Telegram notifications** — v1 services routed lifecycle events through `msgbus.sh` → `send-telegram.sh`. v2 services run silently. Operators do not receive notifications of stuck tasks, completion, or failures.
2. **Scheduled jobs** — v1's `registry.yaml` defined cron schedules (every 20 min for scoring/investigation/execution; 12 hr for health). v2 is purely webhook-driven; cannot trigger time-based jobs like `health-summary every 12 hours`.
3. **Watchdog stuck-task detection** — v1's `dispatcher-watchdog.sh` killed hung executors after `timeout_minutes` from registry. v2 has no equivalent; tasks hang indefinitely if Claude API stalls.
4. **V1-to-V2 task migration tooling** — v1 tasks in Pulse with `stage:*` labels are not auto-converted to v2's 6-dim model. If David ever migrates production AIFred-Pro from v1 to v2 in-place, a one-time migration script is needed.
5. **In-process retry within executor** — v1 had Claude-CLI failure retry-with-backoff (1s → 2s → 4s, max 3 retries) inside `executor.sh`. v2 relies on Review→Diagnose→Staging cycle; transient failures incur full review cycle overhead instead of inline retry.

### 6.3 Cross-Archon Integration Gaps

Identified from Agent A's catalog of David's actual Q2 2026 priorities (Loom Phase 8 / Phase 9 / Phase 10).

1. **Loom-Pipeline shared context** — David's Loom is building keyword-enriched embeddings, temporal retrieval, T2 compression. Pipeline v2 produces structured execution telemetry per task. The two could feed each other: Loom retrieves prior-task context for incoming tasks; Pipeline contributes execution outcomes back to Loom's training corpus. Not yet wired.
2. **API gateway integration** — David's `:8888` API gateway captures full Anthropic API request/response with NEXUS correlation fields. Pipeline v2 calls Claude CLI directly; capture happens at executor output level, not at API boundary. Migrating Pipeline v2's executor to route through `:8888` would unify the capture surface.
3. **Decision-rationale schema convergence** — David's emerging `decisions[]` pattern (§5.2) and Pipeline v2's `metadata.orchestration` decision tracking are conceptually similar but schema-incompatible. Convergence requires explicit design work.

### 6.4 Token-Compression Pre-Registered Phases Not Yet Verdicted

These are not gaps; they are open Stage-1 / Stage-2 verdict windows that the milestone documents are heading toward, listed for completeness:
- Phase 1.3.5 Stage-1 verdict: 2026-05-04 ~17:04 MDT (today/tomorrow)
- Phase 1.1 sample-sufficiency check: 2026-05-15
- Phase 2 CoD Stage-1 verdict: 2026-05-06T00:09:29Z
- Phase 1.3.5 Stage-2 formal sign-off: 2026-05-16
- JICM v7.9 Stage-2 14d window close: 2026-05-17T03:25Z (data-gathering, not gating)
- Phase 2 CoD Stage-2 formal verdict: 2026-05-18T00:09:29Z

---

## 7. Pulse-Nexus Rewiring Map

The actionable summary of what would be required to restore v1 feature parity to Pipeline v2. Synthesized from Agent C's component-by-component assessment.

### 7.1 Component Classification Table

| Component | v1 Intent | v2 Mechanism | Classification | Effort to Restore v1 |
|-----------|-----------|--------------|-----------------|----------------------|
| **Pulsars** (5 cron jobs, 20-min cycles) | Scheduled dispatch | Webhook-driven event loop + 60s fallback poll | REPLACED-SUPERIOR | N/A (sub-second latency vs 20-min batching) |
| **Board mechanics** (label classification) | Heuristic status+label+stage; bug: `waiting:human` invisible | Deterministic 6-dim state machine; `waiting:human` in BLOCKER_LABELS | REWIRED-RETAINED + BUG FIX | N/A (improved) |
| **Metrics / telemetry** (JSONL audit + Prometheus exporters) | File-archive + dashboard activity timeline | Pulse `task_events` + activity timeline + live execution panel | PRESERVED + ENHANCED | N/A (live transparency added) |
| **Persona dispatch** (`agent:*` + Telegram routing) | Labels + Telegram messaging | Labels preserved; **Telegram disconnected** | REWIRED-RETAINED / AMBIGUOUS | **Small (4-8 hr)** — see §7.2.A |
| **Audit-ingest** (audit.jsonl file archive) | Custom JSONL + label-ops mutex | Pulse `task_events` table | PRESERVED | N/A (sufficient) |
| **Decision-rationale prompts** (ad-hoc in personas) | Unclear / ad-hoc | Explicit `<context-summary>` + reviewer JSON output | REWIRED-SUPERIOR | N/A (structured output > ad-hoc) |
| **Executor patterns** (`executor.sh` + cron retry) | Bash, retry via watchdog | Python (`executor.py`), engine-routable, context chaining, retry via Diagnose cycle | REPLACED-SUPERIOR | N/A (superior; in-process retry is **Small (2-4 hr)** if explicitly wanted — see §7.2.G) |
| **Reviewer flow** (manual gate at stage:review) | Human review + waiting:human gate | Automated review (Ollama/Claude-CLI) + Diagnose+Staging cycle | REPLACED-SUPERIOR | N/A (atomic review > manual gate) |
| **Cron backbone** (5-min dispatcher grid) | Scheduled dispatch | Webhook + 60s poll fallback | REPLACED-SUPERIOR | N/A (event-driven) — see §7.2.B if scheduled jobs are wanted |

### 7.2 Detailed Rewiring Items (Effort-Itemized)

#### A. Telegram Routing (SMALL, 4-8 hours, **HIGH PRIORITY**)

**What's missing**: Pipeline v2 services do not emit Telegram notifications on task lifecycle events (start, success, failure, stuck-task alerts).

**Rewiring scope**:
- `_shared.py`: Add `send_telegram()` wrapper (calls `send-telegram.sh` or Telegram HTTP API directly)
- `executor.py`: Insert `send_telegram("task started")` / `send_telegram("task failed")` call sites
- `reviewer.py`: Insert `send_telegram("review failed, diagnose triggered")`
- `orchestrate.py`: Insert `send_telegram("batch queued, N tasks")`
- Optional: `diagnose.py`: `send_telegram("task redesigned, re-queueing")`

**Architectural conflict**: None. Additive side-effect; does not affect control flow.

**Recommendation**: This is the most impactful single addition. Operators currently have no signal when tasks are running, stuck, or failed. Restore as an early follow-up after milestone push.

#### B. Registry Scheduling (MEDIUM, 8-16 hours, OPTIONAL)

**What's missing**: Time-based scheduled jobs (e.g., `health-summary every 12 hours`).

**Rewiring scope**:
- Copy `registry.yaml` from production AIFred-Pro
- Create `dispatcher.py` (Python rewrite of `dispatcher.sh`): reads registry, evaluates schedules and pre-checks, triggers services via synthetic webhook to event-watcher
- Add cron entry for `dispatcher.py` to run every 5 minutes
- Schema validation for registry.yaml (not strictly required if registry is hand-edited)

**Architectural conflict**: None. Cron scheduler is additive on top of event-driven core.

**Recommendation**: Defer. Pipeline v2 is task-driven, not schedule-driven; this is a nice-to-have for feature parity, not a v2 requirement. Reassess if specific scheduled jobs become operationally necessary.

#### C. Label-Ops Mutex Enforcement (NONE NEEDED)

**Status**: Pulse handles mutex enforcement server-side natively (per `pulse-reference.md` §Label System). Adding a label via Pulse API automatically removes conflicting mutex-group members. No rewiring required.

**Audit task** (just to be safe): `grep -r "label-ops.sh" AIFred-Pro-Dev/.claude/` — if any v2 code path invokes the legacy wrapper, replace with direct Pulse API call. Likely returns zero hits.

#### D. V1-to-V2 Task Migration Tool (SMALL, 2-4 hours, ONE-TIME)

**What's missing**: Conversion of v1 `stage:*` labels to v2 6-dimensional state machine for legacy tasks in Pulse.

**Rewiring scope**:
- Create one-time script `scripts/migrate-v1-stages-to-v2.py`
- For each task with v1 `stage:*` label, map to v2 dimensions (e.g., `stage:execute → staging:done, evaluated:done, queued:done, active:running`)
- Remove v1 `stage:*` labels post-migration
- Backup + dry-run + execute

**Architectural conflict**: None. Pure data migration.

**Recommendation**: Required only if AIFred-Pro production migrates from v1 to v2 in-place. If David maintains AIFred-Pro production on v1 indefinitely while Nate's Pipeline v2 lives separately, this script is not needed.

#### E. Specialized Executors (LARGE or N/A)

**What's missing**: v1's `routing-rules.yaml` defined four specialized executors (`task-research`, `task-executor-infra`, `bug-fixer`, `security-reviewer`). Only `task-executor` was actually implemented in v1; the others were design-stage placeholders. v2's unified `executor.py` runs all task types via engine routing.

**Recommendation**: N/A as restoration. If specialized executors become operationally desired, they would be added as v2 personas (different prompts for research vs infrastructure vs bug-fix vs security-review tasks) — feature work, not parity restoration.

#### F. Watchdog Stuck-Task Detection (MEDIUM, 6-12 hours, MEDIUM PRIORITY)

**What's missing**: Pipeline v2 has no automatic killing of hung executor processes. If Claude API stalls or executor.py hangs, the task remains in `active:running` indefinitely.

**Rewiring scope**:
- Create `services/watchdog.py`: queries Pulse for `active:running` tasks, checks last_activity_time from sidecar files, alerts/kills if stale beyond timeout
- Add heartbeat logic in `executor.py`: write sidecar file with last_activity_time on every Claude response chunk
- Cron entry to run watchdog every 5-10 minutes
- Configurable per-task timeout via metadata

**Architectural conflict**: Slight. v2 assumes services are fast (Ollama 2-5s, Claude-CLI 20-60s); long-running legitimate tasks need explicit per-task timeout metadata to avoid being killed.

**Real-world demonstration (observed during this milestone preparation, 2026-05-04)**: A test-suite run hit max-retries on subtask `AION-13dc7b96` ("Generate Metadata for Each Chunk") and was marked `blocked:yes reason:max-retries`. The master `AION-f65a0933` plus 7 sibling subtasks remained `blocked:yes reason:dependency` for the next 4 days, idle and unattended. Compounding: `pipeline-watcher.py` threw `'>=' not supported between instances of 'NoneType' and 'int'` on this task on every poll cycle, accumulating **4,466 error lines in `pipeline-watcher.log`** between `2026-04-30 19:00:17` and `2026-05-03 21:36:35` (74 hours / ~1 error per minute, consistent with watcher polling cadence). **Zero alerts, zero escalations, zero operator notifications.** Pattern surfaced only when the chain was manually inspected during this milestone's smoke-test pre-flight; closing the task via Pulse API resolved both the watcher exception loop and the chain-block within seconds. Two compounding gaps were observable in this single artifact: (a) absence of watchdog stuck-task escalation (the primary §7.2.F gap), AND (b) silent absorption of watcher-cycle exceptions. **Recommended scope augmentation**: a watcher-cycle error counter (exposed via `/health` or sidecar telemetry) with threshold-based alerting parallel to watchdog stuck-task detection. The two signals catch different failure classes — task-side hang versus watcher-side exception loop — and either alone would have surfaced this incident within hours rather than days.

**Recommendation**: Restore after Telegram routing. Stuck-task detection is the second-most-impactful resilience addition (operators need to know when tasks hang; system needs to recover hung resources). The 2026-04-30 → 2026-05-03 demonstration above strengthens the priority case: this is not hypothetical — the gap has already produced a 4-day silent-failure incident in the dev environment, which would have been a measurable operator-experience problem in production.

#### G. Executor Internal Retry (SMALL, 2-4 hours, LOW PRIORITY)

**What's missing**: Inline retry-with-backoff in `executor.py` for transient Claude API failures (timeout, rate-limit, connection errors).

**Rewiring scope**:
- Wrap `claude -p` invocation in `executor.py` with retry loop: 1s → 2s → 4s → 8s, max 3 retries on transient errors
- Error classification (transient vs permanent) — only retry transient

**Architectural conflict**: None. Pipeline v2 currently relies on Review→Diagnose→Staging cycle for retry; in-process retry is additive (catches transient failures before they incur Review overhead).

**Recommendation**: Defer until measurement shows transient Claude failures are non-trivial. The Review→Diagnose cycle is sufficient for most failure classes.

### 7.3 Effort Summary and Critical Path

| Priority | Item | Effort | Cumulative |
|----------|------|--------|------------|
| 1 (HIGH) | Telegram routing | 4-8 hr | 4-8 hr |
| 2 (MEDIUM) | Watchdog stuck-task detection | 6-12 hr | 10-20 hr |
| 3 (LOW) | Executor internal retry | 2-4 hr | 12-24 hr |
| 4 (OPTIONAL) | Registry scheduling | 8-16 hr | 20-40 hr |
| 5 (CONDITIONAL) | V1-to-V2 task migration | 2-4 hr | 22-44 hr |

**Total to full v1 feature parity**: ~30-50 hours.

**Critical path for production readiness** (Telegram + Watchdog only): ~10-20 hours. Everything else is optional.

---

## 8. Honest Scope Statement

**Pipeline v2 explicitly does not currently provide:**

1. Human notification of pipeline activity (Telegram routing removed)
2. Scheduled job execution (registry-driven cron jobs)
3. Automatic timeout + kill of hung executors (no watchdog equivalent)
4. V1-to-V2 task migration tooling (legacy `stage:*` labels not auto-converted)
5. Explicit retry logic within executor (relies on Review→Diagnose cycle)

**These are not bugs; they are architectural choices.** Pipeline v2 trades:
- **Scheduled jobs** for **event-driven dispatch** (lower latency; better cost efficiency via local Ollama scoring; no scheduled-job flexibility)
- **Executor-level retry** for **service-level recovery** via Diagnose (more intelligent — can redesign tasks; no inline transient-failure hedging)
- **Cron watchdog heartbeat** for **implicit progress tracking** via Pulse label mutations (simpler; relies on Pulse reliability)

**The honest assessment**: Pipeline v2 is a *reconceptualization* of Nexus, not an incremental enhancement. It abandons v1's "5 scheduled jobs + cron watchdog + bash executor" model in favor of "event-driven services + local Ollama scoring + context chaining." Both models work; they make different tradeoffs. v2 is optimized for *speed, cost, and transparency* at the cost of *scheduled-job flexibility* and *explicit retry hedging*. David should decide whether this tradeoff suits AIFred-Pro production's mission. If v1 traits are essential, the rewiring is itemized and bounded (~30-50 hours, additive); if not, the tradeoffs stand.

The **REJECT-all decision on the 21 nexus-sync commits** is downstream of this honest scope: David's Phase 5 observability extends the legacy stack v2 deprecates. Adopting it would weaken the deprecation case and contradict the architectural statement the milestone is making. The extension work is worth understanding (Agent B's three forward-looking patterns are conceptually adoptable into v2), but cherry-picking the commits themselves is the wrong mechanism.

---

## 9. Cross-References

### 9.1 Source Synthesis Documents

- **Phase 1 comprehensive review** — `projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md` (330 lines, agent-synthesized)
- **Phase 3 pre-merge analysis** — `projects/project-aion/evolution/aifred-pro-integration/sync-reports/2026-05-04-pre-merge-analysis.md` (228 lines, REJECT/ADAPT/DEFER classification of 21 nexus-sync commits)
- **Companion debrief (David's audience)** — `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-pipeline-v2-milestone.md` (narrative-causal frame)

### 9.2 Architectural Source Material

- Pipeline v2 design — `AIFred-Pro-Dev/.claude/context/designs/pipeline-redesign-v2.md` (1100 lines)
- Pipeline v2 technical reference — `AIFred-Pro-Dev/.claude/context/designs/pipeline-v2-technical-reference.md` (577 lines)
- Pipeline v2 services — `AIFred-Pro-Dev/.claude/jobs/services/{stage,evaluate,orchestrate,executor,reviewer,_shared}.py`
- AIFred-Pro production master — `AIFred-Pro/.claude/CLAUDE.md`, `AIFred-Pro/docs/nexus-automation.md`, `AIFred-Pro/.claude/context/tools/pulse-reference.md`

### 9.3 Token-Compression Initiative Artifacts

- Roadmap — `projects/project-aion/reports/token-compression-roadmap.md` (v3)
- Implementation guide — `projects/project-aion/reports/token-compression-implementation-guide.md`
- Experimental design — `projects/project-aion/reports/token-compression-experimental-design.md`
- Phase 1.3.5 pre-registration — `.claude/metrics/token-compression/pre-registration-phase-1-3-5-reviewer-claude-route.yaml`
- Phase 2 CoD pre-registration — `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- Phase 2.1.b stratified baseline — `.claude/metrics/token-compression/phase-2-1-b-baseline-stratified-2026-05-04.md`
- CoD task-type taxonomy — `projects/project-aion/designs/cod-task-type-taxonomy.md`
- CoD injection architecture — `projects/project-aion/designs/cod-injection-architecture.md` (v1.1.0, decisions frozen)

### 9.4 JICM v7.9 Artifacts

- Roadmap (v7.9 → v8.0) — `projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md`
- v7 audit — `.claude/context/designs/jicm-v7-audit-2026-05-01.md`
- Stage-2 baseline doc — `.claude/metrics/jicm/v7-9-stage-2-baseline-2026-05-03.md`

### 9.5 Patterns and Cross-Cutting Frameworks

- Two-Stage Validation Gating — `.claude/context/patterns/two-stage-validation-gating.md` (v1.0.0)
- Milestone Review pattern — `.claude/context/patterns/milestone-review-pattern.md` (v1.3.1)
- Self-Evolution pattern — `.claude/context/patterns/self-evolution-pattern.md`

### 9.6 ProjectIntel Debriefs (Synology-synced, not in git)

- 2026-04-23 — `Shared_Projects/Debriefs/AIFred-Pro/2026-04-23-dev-workspace-and-usage-metrics-vision.md`
- 2026-04-24 — `Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-usage-tracking-phase3-complete.md`
- 2026-04-24 — `Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-token-telemetry-and-allotment-tracking.md`
- 2026-05-02 (strategic) — `Shared_Projects/Debriefs/AIFred-Pro/2026-05-02-pipeline-v2-and-token-compression-progress.md` (~3,200 words)
- 2026-05-04 (this milestone, pending) — `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-pipeline-v2-milestone.md`

### 9.7 Resolved Questions

- 2026-04-21 — `Shared_Projects/Questions/2026-04-21-nate-for-david-workspace-setup.md` (answered 2026-04-22 by Liaison persona)
- 2026-04-25 — `Shared_Projects/Questions/nate-2026-04-25-reply-to-checkin.md` (answered 2026-04-25 directly by David — `bd` binary dead, React+RQ+Recharts confirmed, AI Reviewer first instrumentation target)

---

*Executive Milestone Report v1.0 — 2026-05-04*
*Synthesized from three parallel Explore agent reports (ProjectIntel comms catalog, nexus-sync 21-commit code-level deep diff, Pulse-Nexus rewiring assessment) extending Phase 1 comprehensive review and Phase 3 pre-merge analysis. This is the technical-implementation register; the milestone debrief is the narrative-causal companion.*
