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

