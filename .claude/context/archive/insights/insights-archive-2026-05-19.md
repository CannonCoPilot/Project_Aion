# Insights Archive — 2026-05-19
# Rotated: 2026-05-19T15:14:14Z (12 entries)

### 2026-05-06 [14d8834d3561]

- The compressed context (qwen3:8b extraction) reflects a snapshot from before the JICM-HALT mid-session — its "Next Step: implement the burn-rate slider" is **stale by 4 commits**. The scratchpad and git log are authoritative; the LLM-enriched checkpoint is a fallback when conversation is sparse. My self-correction note from 2026-04-24 about "stale Current Task inference from session-state.md" applies directly here — same failure mode, different artifact.
- Alfred-Dev tip is `a2efc53` (matches scratchpad's "all-pushed"). Jarvis tip is `21ad679` (one commit ahead of scratchpad's recorded `057195f`) — that's the design-doc commit the scratchpad said was "pending Jarvis-side commit." So scratchpad was written *just before* the design-doc commit landed.

### 2026-05-06 [ecfc4674ef5d]

- **Found execution logs**: `task-executor-20260506-*.log` files exist in `headless/executions/`. Their timestamps (in MDT) convert to UTC and **correlate with the burst start times** I found in api_requests. So `task-executor` IS firing — but the dispatcher.log line "skipping LLM" only describes the most recent few cycles. Earlier today there were tasks to process.
- **The dispatcher is consistent: when pre_check passes (queue has tasks), it launches task-executor → makes LLM calls. When pre_check fails (queue empty), it skips.** Today, the queue was being fed → launched repeatedly → each launch = one burst.
- **838 files in `executions/` directory.** That's months of accumulated headless task runs. Need to filter for today's specifically and identify what tasks were being repeatedly executed.

### 2026-05-06 [2b53145bf42f]

- **The pattern is now crystal clear: task-executor fires repeatedly, ~17-19 min apart, all night and into morning.** That's NOT a 15-min cron — it's "fire whenever the queue has a matching task." The 17-min cadence reflects: ~2 min task-executor runtime + ~15 min until next dispatcher tick where queue is non-empty again.
- **So the real question shifts: what's feeding the queue every ~15 min?** The pre_check matches `risk:safe OR pipeline:approved` tasks not in `waiting:`/`needs-input`/`parked`/`blocked:dependency`. So something is **creating new safe-risk or pipeline-approved tasks at a steady cadence** — that's the upstream leak source.

### 2026-05-06 [1fa8ad16741e]

- **Per-run cost: $0.64.** 21 turns of opus/sonnet, 1.38M cache reads. At ~84 runs/day this is **~$54/day or ~$1,600/month** of pure background spend.
- **The latest run picked up AION-4ad1bff9** ([P5-T03] Apply dev isolation to Jarvis-Dev compose), spent 21 turns analyzing it, and **decided to PAUSE** because it violates hard safety rule #4 (no docker-compose edits). It claims to have routed the task to `waiting:human`. But if the route succeeded, the next cycle wouldn't re-pick it. So either it keeps re-picking the same task (route didn't stick) OR a new eligible task keeps appearing.

### 2026-05-06 [cac4d095f732]

- **Math confirms the leak quantification.** 19 bursts × ~$0.64 = **$12.16 in 5h** of pure background spend. As a fraction of the ~$37/window proxy budget that maps to ~20% utilization → **matches your 20-25% observation EXACTLY**.
- **Queue is now empty (TOTAL OPEN+QUEUE: 0).** That's why bursts stopped at 12:48 UTC and haven't resumed. The leak isn't continuous — it's a **drain event** that fires whenever the queue gets fed. So the structural question is: **what's feeding the queue every ~15 min?**

### 2026-05-06 [89088a3a6538]

- **ROOT CAUSE FOUND.** AION-4ad1bff9 ("Apply dev isolation to Jarvis-Dev compose") had `pipeline:approved` + `stage:queue` + `auto:ready` for **5+ hours** while the executor repeatedly evaluated it (~19 times × $0.64 = **$12.16**). The task violates hard safety rule #4 (no docker-compose edits), so each run produced a "PAUSE" recommendation, but the route to `waiting:human` **only succeeded on the 19th attempt at 12:46:57 UTC**. 18 prior attempts evaluated, recommended PAUSE, but failed to persist the label transition. Each failed attempt = full $0.64 waste.
- **There are TWO bugs stacked**: (1) `pipeline:approved` was applied to a task the executor cannot safely complete (label-task incompatibility); (2) the executor's PAUSE-routing is unreliable — succeeded 1-in-19. The combination creates an N-runs-until-eventual-success leak with cost = N × per-run-cost.
- **Currently the leak has self-resolved** (queue empty, no eligible tasks). But it will recur the moment another `pipeline:approved` task lands that the executor can't safely complete.

### 2026-05-06 [92cbd7536b05]

- **The 15-min cadence comes from `nexus-settings.json` job_overrides, NOT from registry.yaml.** Both PROD and DEV have `job_overrides.task-executor.every_hours: 0.25` (15 min). Registry says 1h; override wins. This means clearing the dashboard UI is necessary but not sufficient — the override must also be cleared OR the dispatcher unloaded entirely to stop the cron at source.
- **Both environments have identical 15-min override on task-executor.** PROD also has 50 USD daily budget cap on task-executor. PROD-DEV adds creative-build/creative-think disabled. Otherwise the surfaces are nearly identical — the difference is only PROD's launchd is loaded and DEV's is not.

### 2026-05-06 [7ecb071babe9]

- **`com.aion.david-nexus-sync-fetch` (6h) and `david-nexus-sync-health-check` are still loaded.** These are git-fetch jobs for David's branch sync; they don't make Anthropic calls. Left running per scope (no leak surface).
- **`com.aion.anthropic-proxy` PID 97735 orphan** also still running (the old `:8877` proxy whose source file was relocated to Alfred-Dev). Not a leak source — it's idle and not receiving traffic — but worth decommissioning eventually for hygiene. Out of scope of this halt.
- **`every_hours: 0.25` override on `task-executor` is preserved** in nexus-settings.json (just with `enabled: false` added). If someone toggles the job back on, the 15-min cadence recurs. Worth removing the override for a clean state, but I left it as forensic evidence pending your call.

### 2026-05-06 [a33c80e44e9c]

- **The constraint "Dev + Jarvis only" actually expands what we can do, not contracts it.** Without needing to wait for David's review cycle, we can ship Jarvis-side protection (C, E, H) immediately — zero coordination cost. Alfred-Dev work (A, B, D) goes through the standard nate-dev push path and David's merge cadence. So the constraint reorders priorities but doesn't reduce them.
- **C is the single highest-ROI item.** It's generic (catches *any* future leak with this fingerprint, not just task-executor), it's ours to build (no external dependency), and it inverts the discovery latency — instead of operator noticing 25% creep over 5 hours and asking, the watcher alerts within 5-15 minutes. The investigation we just ran took ~25 min with telemetry; an alert would have eliminated the 5-hour delay before discovery.
- **Recommended bundle: G + C + A**. Debrief to David first (so he has context before potentially re-enabling), then ship the Jarvis-side watcher (immediate protection regardless of David's decisions), then the executor.py pre_check fix (clean source-side repair). H and E are nice-to-haves; D folds into Task #5 naturally.

### 2026-05-06 [30f4bdf22be0]

- **The repair stack mirrors the failure stack.** Two stacked bugs (coarse pre_check + unreliable PAUSE-route) → two stacked fixes (`_check_hard_safety_preflight` mirrors LLM rules to refuse pre-flight; `_check_attempt_budget` bounds repeated attempts regardless of cause). They compose: pattern catches the known case cheaply ($0 instead of $0.40); attempt-budget catches whatever the pattern misses ($1.20 ceiling instead of $8). Defense in depth on the same code path.
- **Constraining repairs to Dev+Jarvis turned out to be the strongest design constraint of the day.** It forced (a) the Jarvis-side anomaly watcher (which would have been deferred indefinitely if "fix in PROD" had been an option), and (b) the halt runbook (which captures the hard-won muscle memory of a 3-layer halt before it fades). Both are durable Project Aion improvements that wouldn't have happened in a "patch and continue" repair model.
- **The new burn-rate panel + cost attribution telemetry made the leak findable.** This work was foreshadowed yesterday in the v1.3 §6.1 deliverable list; today validated the design — without it the 22% creep would have read as ambient utilization noise. Going forward, the cost-anomaly watcher's state file gives other components (Ennoia, AC-05 reflection) a generic surface to consume cost signal without needing to query Pulse directly.

### 2026-05-06 [8a30937249e8]

- **The split aligns with each page's docstring contract.** UsagePage opens with `"Token-based, Anthropic session-aware. ... All data comes exclusively from proxy-captured Anthropic API headers"` — token velocity belongs there. BudgetPage already had the `Proxy-Attributed Cost` card and the `BudgetBar` for monthly dollar caps — dollar velocity composes naturally. The original 423b3c1 placement on UsagePage was a small contradiction with the page's own contract; this resolves it.
- **Different layout shapes for each card reflect available space.** UsagePage's hero row constrains each card to ~25% width, so the token card stays compact (single big number + secondary line). BudgetPage gives the dollar card full width, which I used to break out current rate / extrapolated hourly / projected-to-window-end as three sibling stats. Same data, different breathing room.
- **Token-saturation reference (250M tokens / 5h ≈ 833K tokens/min) is now anchored in two places** — `REFERENCE_5H_TOKEN_BUDGET` constant in BudgetPage was the prior anchor for `ApiSpendCard`'s coverage heuristic; the new token threshold bands inherit from the same number. Worth a future small refactor: lift the constant into a shared `lib/usage-reference.ts` so the threshold logic and coverage heuristic stay aligned automatically. Deferred unless requested.

### 2026-05-06 [775d8e808757]

The original debrief was written with commit `423b3c1` placing the Burn Rate hero card on UsagePage in dollars. The follow-on `c79643a` corrected a subtle contradiction: UsagePage's docstring contract is *token velocity* (Anthropic session-aware, header-derived), and BudgetPage's contract is *dollar velocity*. The split aligns each card's measurement unit to its semantic home. Worth documenting because it's a category of refinement easy to lose to scratchpad rotation.

