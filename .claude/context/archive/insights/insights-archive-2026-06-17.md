# Insights Archive — 2026-06-17
# Rotated: 2026-06-17T14:56:46Z (5 entries)

### 2026-05-23 [49d92a749378]

**This is a fundamentally different picture than what I assumed.** Three critical observations:

1. **Windows are NOT first-call-initiated.** Resets land on round timestamps (`:00`, `:10`, `:20`, `:30`, `:40`, `:50`). These are Anthropic-assigned time slots, not user-triggered.

2. **Multiple models share the same window.** The 05-23 11:20 reset has BOTH `claude-opus-4-6` (first call 09:18) AND `claude-sonnet-4-6` (first call 09:33). The window is account-level, not model-level or session-level.

3. **time-to-reset varies wildly** — from 1.67h to 5.00h. If the window were first-call-initiated (5h fixed), these would all be ~5.00h. Instead they range from ~1.7h to ~5.0h. The window is a **fixed server-assigned 5h slot**, and your first call can land anywhere within it.

This means my original fix was actually CORRECT — `reset - 5h` IS the true window start, and `first_request` is just when the user happened to make their first call within that slot. The dashboard should show the full 5h slot, not just the portion with activity.

But wait — Sir's pushback was that "5hr windows are initiated by first call." Let me verify this isn't partially true by checking if any window's first request exactly matches `reset - 5h`.

### 2026-05-23 [d86b52b80f8b]

**This is the smoking gun.** Consecutive windows are NOT always 5h apart. They range from exactly 5.00h to 39.17h. The pattern:

- **5.00h gaps**: active continuous usage (back-to-back windows)
- **5.17–5.67h gaps**: slight drift — window resets are on 10-minute boundaries, so if the next window's first call lands in a different 10-minute bucket, the reset shifts
- **13–39h gaps**: overnight/idle periods — no calls were made, so the window wasn't initiated

This confirms Sir's original understanding: **windows ARE first-call-initiated**, but they snap to Anthropic's 10-minute-granularity time slots. When you make your first call, Anthropic assigns you to the next available 5h slot boundary (rounded to 10-minute marks). That's why `first_request ≈ reset - 5h` for active windows (~4.9-5.0h gap) but `first_request << reset - 5h` when the window was already running from OTHER traffic (web UI, other Claude Code sessions not routed through our proxy).

### 2026-05-23 [d596c8f7eb23]

**The bug is on lines 305-320.** The comment says "Mirrors the BurnRatePanel pattern" but it does NOT. It uses **free-intercept OLS regression** (`y = slope * x + intercept`), while the BurnRatePanel (line 1838-1849) uses **through-origin regression** (`y = slope * x`, `slope = Σxy / Σx²`).

The free-intercept formula on line 319-320:
```
curveSlope = (n * sumXY - sumX * sumY) / denom
curveIntercept = (sumY - curveSlope * sumX) / n
```

This produces a non-zero `curveIntercept` which means the trendline does NOT pass through (0,0). The trendline at line 332 is rendered as `curveSlope * elapsed_h + curveIntercept`, and the phantom point at x=5 (line 338) also uses `curveSlope * 5 + curveIntercept`. **The slope visually doesn't anchor to the origin.**

### 2026-05-23 [7ff34522941c]

**What was actually wrong (corrected understanding):**

The "slopes not respecting (0,0)" bug was the `TimePanel` regression using **free-intercept OLS** (`y = slope * x + intercept`) instead of **through-origin** (`y = slope * x`). The BurnRatePanel already used through-origin correctly — the comment "Mirrors the BurnRatePanel pattern" was a lie in the code. With a nonzero intercept, the trendline visually missed the origin, making the projected burn rate look wrong.

The `elapsed_seconds` from true window start (reset - 5h) is correct because API headers are ground truth for window boundaries — they track account-level utilization, not per-session. The first proxied call may arrive after non-proxied traffic has already consumed some utilization, but the header values still correctly reflect the full window state from Anthropic's perspective.

### 2026-05-24 [e8029a1867a2]

The proxy returning HTTP 405 (Method Not Allowed) on a GET is correct behavior — the `/v1/messages` endpoint only accepts POST. A 405 confirms the proxy is listening and routing; a connection error or 502 would indicate a problem.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-17T17:15:01Z (4 entries)

### 2026-05-24 [ea16ef2d85dd]

Each `claude -p` call pays a ~40K cache-write tax for project context. At 1% utilization we have ample room. The prompt is deliberately trivial ("What is 2+2?") to minimize output tokens — the point is generating proxy-recorded traffic per model, not the responses.

### 2026-05-28 [4b207b217754]

Three scheduling surfaces coexist on this machine, often conflated:
- **launchd** (macOS-native, `~/Library/LaunchAgents/*.plist`) — survives reboot, has Keychain access. This is where AIFred-Pro's Nexus agents live.
- **crontab** (legacy Unix, `crontab -l`) — survives reboot, but no GUI/Keychain context. Currently holds 1 Telegram callback + 1 stale `probe-headers` (the one your scratchpad flagged as failing).
- **CronCreate** (Claude Code session-local) — in-memory only, dies with this REPL unless `durable:true`. Useful for "remind me in an hour" within a session.

The phantom-traffic forensic in scratchpad is about the **launchd** layer, not crontab — `com.aion.nexus-event-watcher` is the 2-min poller burning the windows.

### 2026-05-28 [2cb48c3ad24f]

The Ollama qwen3:32b output is structurally different from Claude's — it generated a bash script-style plan rather than executing tools and producing JSON. This is expected: Ollama runs a raw prompt/response, not a Claude Code session with tool access. For pipeline scoring/routing jobs this is acceptable since they produce structured labels, not code changes. The `task-executor` (the one that actually modifies code) correctly stays on `claude-interactive` with full tool access.

The jq notification failure is because the executor tries to parse `.total_cost_usd` from the JSON output, but Ollama responses use a different schema. Non-blocking — the job still completes.

### 2026-05-28 [cfe5baac0a15]

**The pipeline validation revealed an important architectural lesson**: Ollama (`/api/generate`) is suitable only for jobs that *analyze and report* — it generates text but cannot execute tools. Jobs that *mutate state* (apply Pulse labels, write files, run commands) need `claude-interactive` because they require the Claude Code harness with tool access. The final engine split:
- **5 analyzer jobs → Ollama qwen3:32b** ($0/run): health-summary, persona-health-check, doc-sync-check, pipeline-review, weekly-digest
- **7 mutator jobs → claude-interactive** (Anthropic via proxy): task-score, task-investigator, task-executor, context-maintenance, creative-think, creative-build, creative-present

The `claude-interactive` engine launches each job in a temporary tmux window with a file-based prompt, polls a sentinel file for completion, and kills the window on exit. This is architecturally equivalent to `claude -p` but visible to the Watcher and properly proxied.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-17T18:01:51Z (1 entries)

### 2026-05-28 [9a4f7fa93efe]

**The "tool use gap" is not a Qwen 3 limitation — it's an integration architecture gap.** Three compounding issues:

1. **Wrong endpoint**: `/api/generate` has no `tools` parameter. It's a raw text completion endpoint. `/api/chat` is the only tool-capable endpoint.
2. **No tool definitions passed**: Without a `tools` array, the model has no schema to signal tool invocations against.
3. **No dispatch loop**: Even with correct tools, the LLM only *names* the function and arguments. The calling application must *execute* the command and feed results back. Our executor had no such loop.

The live test just proved it: `/api/chat` with a `tools` array → Qwen 3 32b correctly returned `tool_calls: [{function: {name: "calculator", arguments: {expression: "2+2"}}}]` with empty `content`. The model knows exactly how to signal tool use — we just weren't speaking the right protocol.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-17T18:53:53Z (1 entries)

### 2026-05-28 [06c544d380ee]

**Ollama version 0.16.2** — below the 0.17.6 threshold where the research says Qwen3 tool template bugs were fixed. Despite this, our live test shows tool calling works correctly for simple single-tool scenarios. The serialization bug (issue #14601) may only manifest with complex multi-parameter tools or multi-turn conversations. For our pipeline use case (single `run_command` tool), the current version is functional.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-17T21:03:38Z (5 entries)

### 2026-05-28 [7a413632def0]

**What the verification pass caught**: The code-review agent cross-referenced every claim against the filesystem and found 8 issues — from a simple off-by-one (33 vs 32 personas) to a structurally incomplete dashboard table (the original covered only 55% of actual routes). The most subtle finding was the dev event-watcher's launchd config: the document said "on-demand" but the plist uses `KeepAlive: true` — a persistent daemon, not an on-demand trigger. These are exactly the kinds of errors that look plausible in text but break trust when someone acts on the document.

### 2026-05-28 [907c8a491599]

**The board is now surgically clean**: 6 focused tasks, all open, ordered by priority. The two Pulse databases were in different states — production (:8700) had 91 tasks (all closed, from the Multi-Space Setup plan era), and dev (:8800) had 63 tasks (mix of closed + orphaned subtasks from personas-rebuild work). Both are now cleared with JSON archives preserved. The dev board had 2,655 events and 1,341 event records referencing deleted tasks — all cleaned.

### 2026-05-28 [7e6a00b20d73]

**The pipeline is alive and already working.** Two things happened:
1. **Dispatcher** is cycling every 5 min (19:30, 19:35, 19:40, 19:45, 19:49) — "10 not due" means all 10 registry jobs exist but none have hit their schedule trigger yet. The PIPE tasks on the board are *not* registry-scheduled jobs — they're Pulse task tickets that need the event-watcher → score → stage pipeline to advance them.
2. **Event-watcher** already scored our new tasks — the log shows `risk:safe` and `risk:moderate` labels being applied to the auto-decomposed subtasks. The score service is running and processing events.

### 2026-05-28 [d2366d0e247e]

**The data pipeline is intact**: proxy captures headers → writes to `pulse_dev.api_requests` → Pulse API reads and returns structured JSON → dashboard proxy passes through unchanged. 233 requests in the current window, 15% utilization, 38M cache_read tokens. The `?company=platform` URL parameter has no effect — there's no company filter in the UsagePage frontend code.

### 2026-05-28 [0e693de5145e]

**Now the picture is clear.** The V2 pipeline IS running and has been actively processing our PIPE tasks. PIPE-02 (weekly-digest) has progressed through `staging:done → evaluated:done → queued:done` but hit `reason:max-executor-retries` — the executor tried to run it 3 times and failed. The subtask AION-c74965b9 ("Trigger pre_check activity-digest script") is at `staging:done, evaluated:done` and cycling through the orchestrate service. The pipeline services are functional — the tasks are being scored, staged, evaluated, and queued. The blockage is at the **execution** stage, where the executor service tries to actually run the task and fails.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-18T03:24:37Z (25 entries)

### 2026-05-28 [dc362707bc6f]

This is a design tension: the V2 executor (`executor.py`) calls `claude -p` which requires either (a) a logged-in Claude Code session (`~/.claude/` auth config), or (b) an `ANTHROPIC_API_KEY` env var. Inside Docker, neither exists. The container was designed to run `pipeline-watcher.py` (which calls Pulse API + Ollama), but `executor.py` spawns Claude Code subprocesses — a completely different auth model.

The cleanest fix: pass the API key from the host's credentials to the container. But first, let me check if the executor.py supports an API key env var path.

### 2026-05-28 [dc95eb14d44d]

**Root cause chain (3 layers deep)**:
1. **Surface**: All pipeline tasks fail at execution stage
2. **Layer 1** (fixed): Docker container ran as root → Claude Code refused `--dangerously-skip-permissions`
3. **Layer 2** (fixed): Task labels `blocked:yes` + metadata `executor_attempts: 3` prevented retry → both cleared
4. **Layer 3** (current): Claude Code inside Docker container is not authenticated. On Max plan, auth is OAuth-based (stored in macOS keychain), not API-key-based. Can't mount keychain into Docker.

**The design tension**: executor.py (V2 pipeline, runs IN Docker) calls `claude -p` which needs auth. executor.sh (V1 pipeline, runs ON HOST) has the `claude-interactive` engine that uses tmux + file-based prompts, where Claude Code is already authenticated. Phase 4's migration moved recurring jobs to Ollama but left event-driven tasks to `claude-interactive` — which runs on the HOST, not in Docker.

### 2026-05-28 [b6a2f09f9ddd]

**What changed architecturally**: The system moved from an organic accretion of 3 execution layers with 9 overlapping responsibilities to a principled design with clear boundaries. Docker handles stateless services (data stores, APIs, pipeline orchestration). The host handles authenticated operations (Claude Code CLI, tmux, launchd scheduling). The bridge pattern (signal files on a shared volume) connects them cleanly without requiring Docker to access macOS Keychain.

**The self-healing mechanism** is the most operationally significant change. The exact bug sequence that required 45 minutes of manual intervention today (label removal without replacement → task invisible → permanent block) will now auto-heal in under 30 seconds on the next watchdog cycle. The startup audit also means container restarts — previously a source of stuck-state accumulation — now trigger a full label reconciliation.

### 2026-05-28 [52e5012173e9]

**Root cause of ghost windows**: The host-executor-bridge doesn't clean up signal files on failure — if the Claude CLI fails quickly, the request file persists, and the next event-watcher cycle (2 min) picks it up again, creating an infinite spawn loop. The fix: the bridge must always delete the request file after processing, regardless of success or failure.

**Root cause of task failures**: `max_turns: 10` in the bridge script is insufficient for most pipeline tasks. The executor.py sets `--max-turns 10` which isn't enough for tasks that require tool use (each tool call = 1 turn). These PIPE test tasks involve file reads, command execution, and verification — easily exceeding 10 turns.

### 2026-05-28 [4b1b834a937e]

**The deadlock mechanism**: The orchestrator on line 69-72 filters for tasks that are `evaluated:done`, `queued:no`, and NOT `blocked:yes`. That's correct. But the sibling-gating on lines 88-94 then counts how many of those *filtered* candidates share a parent. If some siblings are `blocked:yes`, they were excluded by the filter on line 72 — so the count is always less than `expected`, and the group is held forever. It's a set-theoretic bug: the denominator includes blocked siblings, but the numerator excludes them.

**Three groups are deadlocked** (AION-66a90eeb, AION-af351119, AION-3fed0284): each has blocked siblings that will never pass the filter, permanently gating the unblocked ones.

**Additionally**, many tasks have `queued:no` when they should have `queued:done` — the orchestrator only picks up `queued:no` tasks (line 71), but looking at the board, some unblocked tasks already have `queued:done` meaning they passed through orchestration previously but never made it to execution.

### 2026-05-29 [f20ab3ffb520]

**A second deadlock pattern**: 13 tasks are chain-blocked because their predecessor in the chain is `blocked:yes`. The `chain_predecessor_done()` function (line 415) only lets a task execute if its predecessor has `active:done` or `completed:done`. A blocked predecessor satisfies neither condition — so the entire chain downstream is permanently frozen.

This is the chain-ordering equivalent of the sibling deadlock we just fixed: a blocked task prevents ALL subsequent tasks in its chain from ever executing.

### 2026-05-29 [515fb374fbc7]

**What changed architecturally:**

1. **Bridge daemon (NEW)**: `host-executor-bridge.sh --daemon` runs as a standalone tmux window, polling every 5s for signal files. This replaces the dead `event-watcher.sh` as the host-side signal file processor. The bridge has a heartbeat file for health monitoring.

2. **Sibling deadlock (FIXED)**: `orchestrate.py` now counts ALL evaluated siblings (including blocked ones) against the sibling_count threshold. Previously, blocked siblings were excluded from the filter, causing the count to always fall short.

3. **Chain predecessor deadlock (FIXED)**: `chain_predecessor_done()` now treats a blocked predecessor as "done" — if it's permanently blocked, downstream tasks can execute independently.

4. **Self-healing additions**: Two new TTL mechanisms:
   - Diagnose exhaustion TTL (2h): tasks that exhaust `max_diagnose_attempts` auto-heal after 2h
   - Decomposed parent staleness (1h): parents with all-terminal children auto-close after 1h

5. **Flask bind fix**: Webhook server now binds to `0.0.0.0` (was `127.0.0.1`), allowing Pulse container to deliver webhooks via Docker network.

6. **Score.py absorbed**: Pipeline-watcher now fires `score.py` on `task:created` webhooks, eliminating event-watcher as the intermediary.

7. **Launch script unified**: Bridge daemon auto-starts with the Jarvis tmux session, has `--restart bridge` support, and appears in health checks.

**What's still separate (by design)**: `dispatcher.sh` handles registry.yaml scheduled jobs (analytics, health checks, digests) — a completely different job population from the Pulse task FSM. It stays as a launchd agent.

### 2026-05-29 [014bccb70321]

**Why the windows look empty**: Claude CLI with `--output-format json` redirects all output to stdout (piped to a file), so the tmux pane shows nothing. The `capture-pane` command sees a blank screen, but the process tree reveals active Claude processes with full argument lists. The diagnostic signal is `ps` on `pane_pid` children, not `capture-pane` content.

**Chain topology visible**: Parent tasks get `--session-id` (cold start), children get `-r <parent-session> --fork-session` (cache-efficient per api_aware.md §9.1). The extend-then-fork pattern from Phase 2 is live.

### 2026-05-29 [76147260e6be]

**The reviewer's perspective mismatch**: The executor runs on the host (Claude CLI via signal delegation) and creates files at host paths. The reviewer runs inside Docker (qwen3:32b via Ollama) and checks the filesystem from the container's perspective. The file at `/Users/nathanielcannon/Claude/Alfred-Dev/output/pipeline-probe/probe-test.txt` is visible on the host but inside the container it's at `/workspace/output/pipeline-probe/probe-test.txt`. The reviewer doesn't know to translate.

This is the same `/workspace` ↔ host path duality but in reverse — the executor prompt was fixed, but the reviewer's filesystem verification still uses Docker-internal paths.

### 2026-05-29 [8e7a984cdd15]

- **Two-source cross-check is critical here**: the force-loaded `session-state.md` P-block still names P1.5/P1.6 as live, but those completed weeks ago — the *actual* current work lives in `.scratchpad.md` (2026-05-29 entry) and `.claude/plans/cozy-squishing-galaxy.md`. This is the exact failure mode self-corrections logs on 2026-04-24 and 2026-05-06: trust scratchpad + recent conversation over the older `session-state.md` paragraph.
- **Empirical grounding paid off**: scratchpad claimed "6 active Claude CLI processes confirmed via pgrep" — that was true *hours ago*. Live `pgrep` shows zero `claude -p` processes now; the burst completed. The pipeline container itself is `Up 19 minutes (healthy)`, so it restarted recently. Per `api_aware.md §10.1`, trusting the snapshot would have produced a wrong report.
- **The "sessions" prompt is ambiguous** — could be a stray fragment, or could be requesting the prior-session RAG roll-up. I executed both the protocol queries and a focused RAG `sessions` lookup so the answer covers either reading.

### 2026-05-29 [d191c17532a7]

**Fork-from-Jarvis: mixed results — cache sharing works but model inheritance is the wrong trade-off.**

| Metric | v3 (cold Sonnet ×3) | v4 (fork Opus ×1) | Winner |
|--------|

### 2026-05-29 [52d056550856]

**Fork-from-Jarvis with forced Sonnet: $0.30 vs $0.20 cold — 50% more expensive, but 3× faster and simpler.**

The cache sharing partially worked: the fork inherited 72K cache_read from the Jarvis prefix. But it also wrote 73K cache_write — the Sonnet model's project-context registration is different from Opus's, so the prefix didn't fully transfer. This is the model-switch cache penalty the user predicted.

**The critical finding**: when you fork a session and switch models (`--resume opus-session --fork-session --model sonnet`), the cache prefix from the parent is NOT reusable by the child because the model change invalidates the cache. The child pays the full cache_write tax again. The 72K cache_read seen here is likely the CC harness boilerplate (system prompt, tool catalog) that IS model-independent, not the project context.

**The optimal configuration** would be: maintain a warm Sonnet session in the Alfred-Dev project specifically for pipeline forks (same model, same project = full cache reuse). The Jarvis Opus session is the wrong fork parent because of the model mismatch.

### 2026-05-29 [8d74783c3602]

**The test system evolved organically alongside the pipeline but never got its own architecture.** The result: 150+ files spanning 6 directories with no index, no validation tracking, and no visibility layer. 60% of tests target code that was replaced in the 2026-05-28 refactor (dispatcher.sh, executor.sh, pipeline-runner.sh, team-runner.py). The remaining 40% covers individual pipeline services but has zero coverage of the chain-executor architecture that now runs all executions.

**The catalog + dashboard closes the visibility gap.** `_catalog.yaml` is both human-readable documentation and machine-readable API source. The Test Cockpit page gives operators a single view of what's tested, what's passing, what's stale, and a button to run any suite. This is the foundation for the battery of tests that will finalize the pipeline.

### 2026-05-29 [022bd77ca975]

**Test Suite System — Final State:**

The pipeline test infrastructure went from "60% dead tests, zero visibility" to a formalized, API-driven, dashboard-visible system:

| Metric | Before | After |
|--------|--------|-------|
| Active suites | 1 (gospel-synopsis) | **10** |
| Components covered | 7/19 (37%) | **17/19 (89%)** |
| Validation records | 0 | **10** (all with timestamps + notes) |
| Dashboard visibility | None | **Test Cockpit** (suite cards, coverage matrix, run buttons) |
| Deprecated/archived | Mixed with active | **6 deprecated**, cataloged with reasons |

**Three key findings from test execution:**
1. **Claude instances are too smart to fail intentionally** — tasks designed to produce wrong output were corrected by the executor. Testing reviewer failure paths requires deterministic (non-LLM) fault injection, not misleading task descriptions.
2. **The sentinel timeout mechanism works correctly** — 1-minute timeout override via `metadata.timeout_minutes` propagated through executor → bridge → sentinel wait loop. First attempt timed out, diagnose corrected, second attempt succeeded.
3. **Chain predecessor ordering is validated** — 3-child decomposition executed sequentially (Child 1 → unblock → Child 2 → unblock → Child 3), with correct `blocked:yes/reason:dependency` labels and automatic unblocking after predecessor closure.

### 2026-05-29 [06eeafb0f0a4]

**Per §0 of api_aware.md**: burn weight (61%) is the primary metric. We have ~39pp of headroom before `allowed_warning` at 90%. Each probe task exercised through the pipeline costs approximately 1-2 API calls from the pipeline side (Ollama handles staging/evaluate/review), but the chain-executor forks a full Claude Code session which does use Anthropic API for execution. The baseline measurement from these manual runs will quantify the per-task burn weight delta.

**For accurate baselining**: note the 61% util mark right now. After each suite run, query `unified_5h_utilization` again and take the delta. That delta — not dollars or tokens — is the meaningful cost signal for pipeline task estimation.

### 2026-05-29 [cc76200db6fb]

**Why only +1pp for a full pipeline run?** Most of the pipeline work (staging, evaluation, orchestration) runs through Ollama locally — zero Anthropic API cost. Only the chain-executor phase uses Claude (via the forked seed session), and with the warm-seed architecture it hits cache heavily (571K cache_read vs only 12.8K cache_write). The 9 API calls are the executor's tool-use loop (Read/Write/Bash calls), each reusing the cached conversation prefix.

**Token signature**: `input_tokens: 18` confirms near-perfect cache hits — the seed session's prefix is fully cached and each continuation adds essentially nothing new to the input.

### 2026-05-29 [15b37b192076]

The `lifecycle-exhausted` edge case reveals a gap in the pipeline FSM: when a child task exhausts its diagnose/retry budget, it gets labeled `blocked:yes, reason:lifecycle-exhausted` but stays `status: open`. The pipeline-watcher correctly refuses to re-process it but logs about it every cycle (30s). A cleaner design would auto-close lifecycle-exhausted tasks with a terminal status, or at minimum suppress repeated logging for tasks it's already declined. Worth a ticket if this pattern recurs.

### 2026-05-29 [8dd42208ca21]

**Why this pattern exists and why it's common**: In event-sourced or label-based state machines, the "terminal state" is often modeled as just another state transition, not as a fundamentally different kind of operation. But terminal states ARE different — they represent the end of the entity's lifecycle. Labels that encode "where in the pipeline am I?" become noise once the answer is "nowhere — I'm done." The fix treats close as a lifecycle boundary that strips process-state labels while preserving identity-state labels. This is the same distinction as "transient vs intrinsic attributes" in entity modeling.

**The `_sync_stage_label` gap was a clue**: The pipeline-watcher already had code at line 915 that *skipped* syncing `stage:*` labels for closed tasks — it knew they were irrelevant. But instead of cleaning them up, it just ignored them. The dashboard then faithfully rendered labels that the pipeline-watcher had decided not to maintain.

### 2026-05-29 [b02e8ce2fc01]

**The lifecycle gap is clear now.** Here's how tasks flow and where cleanup breaks:

1. **executor.py** writes `execute-request-*.json` → bridge picks it up
2. **host-executor-bridge** creates/reuses a chain window → injects prompt → waits for sentinel
3. **Claude in the chain window** does the work → writes sentinel → bridge captures result
4. **Bridge** writes `execute-result-*.json` → executor.py picks it up → executor sets labels
5. **Cleanup only happens in two places:**
   - `cleanup_chain_window()` is called for ephemeral chains (no chain_id) at line 303-304
   - The bridge daemon's SIGTERM trap cleans all windows on shutdown at lines 334-348

**What's missing**: For tasks WITH a `chain_id` (decomposed subtasks), the bridge intentionally keeps the window alive because siblings may need it. But once all siblings complete and the parent closes, nobody calls `cleanup_chain_window()`. The pipeline-watcher auto-closes the parent but doesn't signal the bridge to clean up the window.

### 2026-05-29 [7bd06a8d347d]

**Why a reaper is better than event-driven cleanup here**: The alternative was to have the pipeline-watcher notify the bridge when a parent task closes. But that couples two independent systems and doesn't catch all failure modes (crashed Claude, killed processes, bridge restart). The reaper operates on ground truth — "is Claude running in this window?" — and catches every scenario. It's the same pattern as process supervisors: don't trust state machines to track process lifecycle, just check if the process is alive.

**The three completion signals and their relationship**: 
- **Claude's sentinel** (file on disk) → signals the bridge that work is done
- **Bridge's result file** (`execute-result-*.json`) → signals executor.py that output is ready
- **Pulse labels** (`completed:done`, `status: closed`) → signals the pipeline-watcher that the task is terminal

These are a relay chain, not parallel signals. Each depends on the previous. The gap was that the relay stopped at label transition — nobody relayed back to the tmux layer. The reaper short-circuits this by checking the tmux layer directly.

### 2026-05-29 [6903a7d16e4d]

**Timing analysis of the three-strike reaper:**

| Cycle | Interval | Idle state | Action |
|-------|

### 2026-05-29 [522a4cfdcb86]

**Root cause of the reaper bypass**: Claude Code hasn't actually exited. The process (PID 53571/5956) is still alive in state `Ss+` (sleeping, session leader, foreground). It has a child Docker MCP gateway container running. Claude completed the task, wrote the sentinel, and returned to its **interactive prompt** — it's sitting there waiting for the next user message. This is by design: `claude --resume --fork-session` creates an interactive session, not a one-shot.

The earlier "NO CLAUDE" detection during the stale window cleanup was against windows where Claude had truly crashed or the session was much older. These fresh sessions are healthy — Claude is idle at its prompt, not dead.

**This means the reaper's detection heuristic is correct**: `_claude_running_in_window` properly returns true because Claude IS running. The sessions aren't dead — they're idle but alive. The three-strike idle counter would never fire because Claude never stops running.

### 2026-05-29 [5bf7ff9fbb80]

**The conditional-update path was the actual production close path all along.** The reviewer uses `conditional-update` with `status: "closed"` rather than `POST /close` or a named transition. This is architecturally sound — the reviewer needs the CAS (compare-and-swap) semantics of `conditional-update` to avoid racing with the diagnose service. But it meant the close path most heavily used in production was the last one to get label cleanup. The lesson: when adding cross-cutting behavior to an API, search for ALL callers of the underlying database mutation (`status = 'closed'`), not just the endpoints that look like they should be responsible for closing.

### 2026-05-29 [de20fb97276a]

**Only 2 API calls** this time vs 9 earlier — the chain window forked from a warmer seed session, so the cache prefix was nearly fully reused. Cache write is just 653 tokens (vs 12.8K earlier), meaning almost everything matched cache. The +2pp burn weight delta is a cleaner baseline than the earlier +1pp reading, since that one was confounded by JICM cycle overhead.

**All three fixes validated in one run**: FSM labels stripped on close (via `conditional-update`), chain window reaped by activity-timeout signal, and dashboard correctly shows the task in Completed.

### 2026-05-30 [54d648b0e6d1]

**The `useRef` + `useEffect` pattern for prop-driven state**: React's `useState(initialValue)` only reads the initial value on mount — subsequent prop changes are ignored. For a "default that can be overridden by user interaction but also responds to prop changes," you need to track the previous prop value via `useRef` and sync via `useEffect`. This avoids the anti-pattern of putting the prop directly in state deps (which would override user clicks). The ref tracks what the *system* last told us; the state tracks what the *user* chose. When the system changes its mind (recent-close window expires), we re-assert the default.

**The 60-second window**: The dashboard refetches every 10 seconds (React Query default). After 60 seconds, the `closed_at` timestamp falls outside the threshold, `recentlyClosedGroupNames` drops the group name, `defaultCollapsed` flips to `true`, and the effect collapses the group. The user sees: task closes → group expands → ~60s passes → group quietly collapses back.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-18T04:24:09Z (4 entries)

### 2026-05-30 [90a9d2470537]

**First call in a new window paid the cold-cache tax.** The first API call shows `cache_read: 0, cache_write: 222,677` — the full project context written to cache from scratch. Subsequent calls then hit cache normally (222K+ cache_read). This is the pattern described in `api_aware.md §7.1`: a fresh subprocess pays the cache-registration tax. Cost is $4.22 for that first call alone vs $0.35-0.41 for the follow-ups.

**The $5.37 total is inflated by window position**, not suite complexity. The same suite mid-window (warm cache) would cost ~$1-2. This is why burn weight (not dollars) is the meaningful metric — the +1pp delta is the true resource cost.

**No decomposition is actually a positive signal**: the orchestrator evaluated the task and determined that creating three files sequentially didn't require subtask decomposition — a single executor could handle it. This is the orchestrator working correctly for simple multi-step tasks.

### 2026-05-30 [45264fcfbdc6]

**Why this gap existed**: The pipeline was designed as a Docker-first system where the executor ran `claude -p` subprocesses with explicit `--model` flags. The signal-delegation architecture (bridge + chain-executor) was added later as a cost optimization — it reuses warm interactive sessions instead of cold subprocesses. But the telemetry layer was never updated to account for the indirection: executor.py still recorded what it *would have* run, not what the bridge *actually* ran. The bridge was a transparent proxy that returned results without attribution.

**The structural issue remains**: there's no centralized model registry. Five services each resolve their model independently. A future improvement would be a `models.yaml` or per-task `model` field in Pulse that all services read — but that's a larger design change. Today's fix ensures the observability layer accurately reflects what happened, even if the configuration is scattered.

### 2026-05-30 [4bb45e50851a]

**What changed**: The metrics endpoint now cross-references `api_requests` with `tasks` by time bracketing — for each closed test task, it finds the `unified_5h_utilization` immediately before and after the task's execution window, computes the delta as burn weight in percentage points, and sums cost/token volumes from API calls within that window. The frontend displays this as a second stats row (Avg Burn Weight, Total Burn Weight, Avg Cost, Total Cost) plus per-run inline details (burn delta, API calls, cost, token breakdown).

**Important caveat**: The burn weight attribution is approximate because concurrent Jarvis IDE traffic shares the same util ramp. The per-run `burn_weight_pp` of 0pp for the latest self-healing-cycle run means the suite itself was lightweight enough that the util reading didn't move between pre/post readings at 1pp granularity. The earlier run (8pp, signal-delegation engine) included heavier cold-start overhead.

### 2026-05-30 [7e9a865f7d77]

**Root cause**: `tmux new-window` spawns a new shell that sources `~/.zshrc` but gets NO inherited environment from the parent process that called `tmux new-window`. The bridge script (`host-executor-bridge.sh`) never exports `ANTHROPIC_BASE_URL` before launching — and even if it did, `tmux new-window` with a command string runs in a fresh shell, not a child process of the bridge. The only ways to propagate are: (1) set it in the command string itself, (2) set it in `tmux set-environment`, or (3) set it in `~/.zshrc`.

**Impact**: Every chain-executor and seed session run is invisible to the usage proxy. Token counts, cost, and request metadata are lost. Burn weight deltas are still observable (the Anthropic API itself tracks utilization regardless of proxy), but granular attribution is impossible.

# Insights Archive — 2026-06-17
# Rotated: 2026-06-18T05:59:14Z (4 entries)

### 2026-05-30 [66b4d6c278ad]

**The breach**: `tmux new-window "cd /path && claude ..."` spawns a fresh shell. Environment variables from the calling process do NOT propagate — `tmux new-window` is not `fork()`, it's a new login shell. The old `executor.sh` explicitly set `export ANTHROPIC_BASE_URL` at the top of its script (lines 22 and 1098), but when the chain-executor and bridge were written as replacements, that pattern wasn't carried forward. Every pipeline execution since the chain-executor was introduced has been invisible to the proxy.

**The fix**: Inject `export ANTHROPIC_BASE_URL=http://localhost:9800 &&` into the command string passed to `tmux new-window` at all 4 launch points (2 in `chain-executor.sh`, 2 in `host-executor-bridge.sh`). The existing seed session will need to be killed and re-created to pick up the change — existing tmux windows won't retroactively gain the env var.

### 2026-05-30 [36d1182bdef5]

**Why the multi-chain-parallel run still showed 0 api_calls**: The bridge daemon (PID 12771) was launched before the fix and was running old code from memory. Bash reads the script once at launch — disk edits to a running daemon have no effect. The seed window WAS correctly proxy-routed (we launched it manually with the env var), but the bridge forked new chain windows from the seed using the OLD code path that omitted `ANTHROPIC_BASE_URL`. So the forked sessions went direct. Classic "daemon must be restarted after code changes" scenario.

### 2026-05-30 [633d284aa821]

YAML's colon-as-mapping rule is subtle: `- foo:bar` parses as the string `"foo:bar"`, but `- foo: bar` (with space after colon) parses as the mapping `{foo: "bar"}`. The FSM label entries like `staging:wait → staging:processing` survive because the colon has no trailing space before the next word. Only `stage: label progression` had the `key: value` pattern.

### 2026-05-30 [5b012572bd03]

**Two compounding issues**:
1. **Executor timeout too short**: The Gospel Synopsis task involves reading multiple source files, identifying parallel passages, merging 5+ synopsis documents, and generating a master document. The 10-minute default timeout (`timeout_minutes` in executor.py) is insufficient. The chain window is actively producing output but can't finish within the deadline.
2. **DNS loss after Pulse restart**: When I restarted the Pulse container via `docker run` (instead of compose), the pipeline container lost DNS resolution for `pulse` because Docker DNS aliases aren't retroactive — the pipeline container cached the old IP. The pipeline-watcher crashed in a DNS-failure loop at 03:00 UTC and stayed dead until I just restarted it.

**The task is still executing** in `chain-eb7a573d` and should finish. Once the sentinel lands, I'll manually close the task since the pipeline has already given up on it.

