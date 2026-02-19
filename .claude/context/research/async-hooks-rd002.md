# Research Report: Claude Code Async Hooks & Hook Performance

**Date**: 2026-02-18
**Scope**: Hook execution model, async support, performance impact for Jarvis's 31-hook configuration
**Research ID**: RD-002

---

## Executive Summary

Claude Code added native `async: true` hook support in version 2.1.0 (released January 25, 2026). This is a first-class configuration field that allows `type: "command"` hooks to fire as background processes without blocking execution. This directly addresses Jarvis's latency concern for telemetry and logging hooks.

Jarvis currently has 31 registered hooks across 9 event categories. The dominant performance cost is **Node.js process spawn overhead** (estimated 30–150 ms per spawned process depending on module load), not network latency. The hooks that fire most frequently — PreToolUse (3 hooks) and PostToolUse (9 hooks) — fire on every tool call, and several of these are pure telemetry/logging hooks that have zero blocking need and are ideal candidates for `async: true`.

**The primary recommendation** is to add `"async": true` to all PostToolUse hooks that perform only logging (no blocking decisions), plus all observability hooks on UserPromptSubmit. This eliminates the synchronous blocking overhead for ~12–14 hooks that never need to control execution flow.

---

## Key Findings

### Finding 1: `async: true` Is a Native First-Class Field (Claude Code 2.1.0+)

On January 25, 2026, Claude Code creator Boris Cherny announced: "Hooks can now run in the background without blocking Claude Code's execution. Just add `async: true` to your hook config."

The official documentation confirms this is a command hook field (`type: "command"` only):

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "/path/to/logger.sh",
        "async": true,
        "timeout": 120
      }]
    }]
  }
}
```

**Key behavior**: Claude Code starts the background process and immediately continues. The hook still receives the full JSON input via stdin. If the async hook produces a `systemMessage` or `additionalContext` JSON field in its stdout, that content is delivered to Claude on the next conversation turn. The `timeout` field still applies (defaults to the same 10-minute limit as sync hooks).

**Source**: [Claude Code Hooks Reference — Run hooks in the background](https://code.claude.com/docs/en/hooks)

### Finding 2: Async Hooks Have Strict Capability Constraints

Async hooks **cannot**:
- Block or deny tool calls (decision/permissionDecision fields are ignored)
- Return real-time decisions (the triggering action has already completed)
- Use prompt-based (`type: "prompt"`) or agent-based (`type: "agent"`) handlers — async is only available for `type: "command"`
- Deduplicate across rapid multiple firings (each fires a separate background process)

Async hooks **can**:
- Log to files, ship telemetry, send notifications
- Deliver a `systemMessage` or `additionalContext` to Claude on the next turn
- Run for up to `timeout` seconds without affecting the current tool call

This is a clean separation: async = side-effects only; sync = decision control.

**Source**: [Claude Code Hooks Reference — Async hook limitations](https://code.claude.com/docs/en/hooks)

### Finding 3: Sync Hooks Execute in Parallel by Default

A critical fact from the official docs: "All matching hooks run in parallel, and identical handlers are deduplicated automatically."

This means multiple hooks registered under the same event/matcher already run concurrently — the blocking wait is for the **slowest** hook to finish, not the sum of all hook durations. However, each hook still spawns a separate process, and the event-level wait is `max(all hook durations)` not `sum(all hook durations)`.

The practical implication: consolidating multiple fast hooks into one script does not improve latency if they already run in parallel. The benefit of consolidation is reducing process spawn count and system overhead, not reducing wall-clock blocking time.

**Source**: [Claude Code Hooks Reference — Configuration](https://code.claude.com/docs/en/hooks)

### Finding 4: Shell/Node Process Spawn Is the Dominant Cost

No official Anthropic benchmarks exist for per-hook overhead. Based on macOS process spawn research:

| Spawn Type | Typical Latency | Notes |
|------------|----------------|-------|
| Raw bash (empty `.bashrc`) | ~30 ms | Minimum baseline |
| zsh (minimal config) | ~38 ms | Per-spawn |
| zsh (Oh-My-Zsh loaded) | 420–3,000 ms | Config-dependent |
| Node.js cold start | 50–150 ms | Module-load dependent |
| Node.js (pre-loaded, no deps) | ~30–50 ms | Best case |
| Compiled binary (Go/Rust) | 5–15 ms | Near-minimal overhead |

For Jarvis's Node.js hooks, each hook spawn incurs approximately **50–150 ms** depending on how many modules the hook requires. Hooks that `require('fs')` only load quickly; hooks that chain multiple requires (e.g., pulling in yaml parsers, large utilities) add startup time.

The official documentation notes: "Command hooks add minimal overhead — typically milliseconds for simple scripts." This is the ideal case; real-world Node.js hooks with non-trivial requires fall in the 50–150 ms range.

**Source**: [Performance Tuning & Optimization — Developer Toolkit](https://developertoolkit.ai/en/claude-code/advanced-techniques/performance-tuning/), [zsh-bench benchmarks](https://github.com/romkatv/zsh-bench)

### Finding 5: Jarvis's Actual Hook Count and Per-Event Firing Profile

Actual count from `settings.json` as of 2026-02-18:

| Event | Hook Count | Fires When |
|-------|-----------|------------|
| Setup | 1 | Once at startup |
| SessionStart | 1 | Once per session |
| PreCompact | 2 | On compaction (rare) |
| Stop | 3 | End of each response |
| PreToolUse | 3 | Every tool call |
| UserPromptSubmit | 8 | Every user message |
| PostToolUse | 9 | Every tool call |
| Notification | 1 | On notifications (rare) |
| SubagentStop | 3 | On subagent completion |
| **Total** | **31** | |

**Hooks that fire on every single tool call**: PreToolUse (3) + PostToolUse (9) = **12 hooks**

**Hooks that fire on every user message**: UserPromptSubmit = **8 hooks**

**Worst case per tool call** (e.g., a Bash command):
- 3 PreToolUse hooks (bash-safety-guard, bash-safety-guard for Read/Write, context-injector)
- 4 PostToolUse hooks (cross-project-commit-tracker, docker-monitor, observation-tracker, ulfhedthnar-detector)
- Plus Stop hooks (3) fire after each response
= Up to **10 blocking process spawns** per Bash tool call, run as two parallel batches (Pre and Post)

At 50–150 ms per Node.js spawn, running in parallel, each batch costs roughly **50–150 ms** (the max of the batch). Two batches = **100–300 ms overhead per tool call** before accounting for the tool execution itself.

For a session with 100 Bash calls: **10–30 seconds of accumulated hook overhead**.

### Finding 6: Previous Optimization Work (hook-infrastructure-analysis.md)

A prior analysis (2026-02-08) already implemented matcher-based filtering that reduced hook spawn counts significantly. Results reported:

| Tool | Before Matchers | After Matchers | Reduction |
|------|----------------|---------------|-----------|
| Glob/Grep | 14 hooks | 1 hook | 93% |
| Read | 14 hooks | 3 hooks | 79% |
| Bash | 14 hooks | 12 hooks | 14% |
| Weighted average | — | — | ~70% |

The prior work also consolidated three logging hooks (selection-audit.js, file-access-tracker.js, memory-maintenance.js) into `usage-tracker.js`, and the settings.json reflects this consolidation. Three Docker hooks were also noted as consolidation candidates.

The remaining opportunity is **async conversion** for hooks that already have matchers but are pure telemetry with no blocking need.

### Finding 7: The `timeout` Field and Fast-Exit Hooks

The official timeout defaults are:
- `type: "command"`: 600 seconds (10 minutes)
- `type: "prompt"`: 30 seconds
- `type: "agent"`: 60 seconds

Setting an explicit short `timeout` (e.g., `"timeout": 5`) on a synchronous hook does **not** make it async — it only limits how long it can block. If the hook exits in 10 ms, that's all it blocks; if it hangs, it times out after 5 seconds. This is a safety net, not a performance optimization.

Fast-exiting synchronous hooks are effectively "fast enough" for hooks that complete in under 20 ms, but Node.js startup itself (~50 ms) means no Node.js hook can be faster than its spawn overhead regardless of how quickly the application code runs.

**Source**: [Claude Code Hooks Reference — Common fields](https://code.claude.com/docs/en/hooks)

---

## Jarvis Hook Classification: Sync vs Async Suitability

Based on each hook's function:

### Must Remain Synchronous (Control Execution)

| Hook | Event | Reason |
|------|-------|--------|
| `bash-safety-guard.js` | PreToolUse | Blocks dangerous Bash commands — must be sync |
| `context-injector.js` | PreToolUse | Injects additionalContext before tool runs — must be sync |
| `exit-guard.sh` | Stop | Detects `/exit` and blocks session end — must be sync |
| `stop-hook.sh` | Stop | Session state management at stop — must be sync |
| `idle-hands-hook.sh` | Stop | Controls idle continuation — must be sync |
| `permission-gate.js` | UserPromptSubmit | Blocks disallowed prompt patterns — must be sync |
| `orchestration-detector.js` | UserPromptSubmit | May inject guidance (MEDIUM context impact) — keep sync |
| `session-start.sh` | SessionStart | Loads context at startup — must complete before work begins |

### Safe to Convert to Async (Pure Telemetry/Logging)

| Hook | Event | Matcher | Why Async is Safe |
|------|-------|---------|-------------------|
| `observation-tracker.js` | PostToolUse | `^(Read\|Bash\|Grep\|Glob\|WebFetch\|WebSearch)$` | Pure logging to YAML/JSONL, no decision |
| `usage-tracker.js` | PostToolUse | `^(Task\|Skill\|WebSearch\|WebFetch\|EnterPlanMode\|Read)$\|^mcp__` | Consolidated logging hook, no decision |
| `cross-project-commit-tracker.js` | PostToolUse | `^Bash$\|^mcp__git__git_commit$` | Logs git commits, no decision |
| `docker-monitor.js` | PostToolUse | `^Bash$` | Docker status logging, no decision |
| `virgil-tracker.js` | PostToolUse | `^(Task\|TaskCreate\|TaskUpdate)$` | Logs task events, no decision |
| `memory-mirror.js` | PostToolUse | `^Write$` | Mirrors write events, no decision |
| `plan-tracker.js` | PostToolUse | `^ExitPlanMode$` | Logs plan exits, no decision |
| `session-tracker.js` | Notification | `""` | Session lifecycle logging, no decision |
| `self-correction-capture.js` | UserPromptSubmit | `""` | Captures corrections to JSONL, no decision |
| `wiggum-loop-tracker.js` | UserPromptSubmit | `""` | Loop state tracking, no decision |
| `milestone-coordinator.js` | PostToolUse/UserPromptSubmit | Various | Logs milestones; check if it ever injects context |
| `subagent-stop.js` | SubagentStop | `""` | Agent activity logging |

### Review Before Converting (May Have Control Functionality)

| Hook | Event | Concern |
|------|-------|---------|
| `milestone-coordinator.js` | UserPromptSubmit | Could potentially inject context or trigger orchestration |
| `ulfhedthnar-detector.js` | PostToolUse, SubagentStop | Detection hook — verify it never returns blocking decisions |
| `context-health-monitor.js` | UserPromptSubmit | Name suggests monitoring; verify no context injection |

---

## Performance Impact Estimates

### Current State (31 hooks, all sync)

For a typical 50-tool-call session with 20 Bash calls, 15 Read/Grep/Glob, 10 Write/Edit, 5 Task/WebSearch:

```
Bash call overhead:    20 × (50ms Pre + 100ms Post) = 3,000 ms
Read call overhead:    15 × (50ms Pre + 50ms Post)  = 1,500 ms
Write call overhead:   10 × (50ms Pre + 50ms Post)  = 1,000 ms
Task call overhead:    5  × (50ms Pre + 100ms Post)  =   750 ms
UserPromptSubmit:      10 × 150ms (8 hooks parallel) = 1,500 ms
Stop hooks:            10 × 150ms (3 hooks parallel) = 1,500 ms
────────────────────────────────────────────────────────────────
Estimated total hook overhead:                        ~9,250 ms
```

This is ~9 seconds of blocking overhead in a 50-tool-call session. For an intensive session with 100+ tool calls, this scales linearly to 15–25 seconds.

### After Async Conversion (12 logging hooks converted)

Converting the 9 PostToolUse logging hooks + 3 UserPromptSubmit telemetry hooks to async:

```
Bash call overhead:    20 × (50ms Pre + 0ms Post*) = 1,000 ms  (* async)
Read call overhead:    15 × (50ms Pre + 0ms Post*)   = 750 ms
Write call overhead:   10 × (50ms Pre + 0ms Post*)   = 500 ms
Task call overhead:    5  × (50ms Pre + 0ms Post*)    = 250 ms
UserPromptSubmit:      10 × 50ms (5 sync hooks left) =   500 ms
Stop hooks:            10 × 150ms (3 remain sync)    = 1,500 ms
────────────────────────────────────────────────────────────────
Estimated total hook overhead:                        ~4,500 ms
```

**Estimated reduction: ~51% less blocking latency** (~4.75 seconds saved per 50-tool session).

Note: The hooks still execute and consume system resources — they just no longer block Claude's execution path.

---

## Comparison Table

| Approach | Blocks Execution | Can Control Tool | Implementation Effort | Performance Gain |
|----------|-----------------|-----------------|----------------------|-----------------|
| Synchronous (current) | Yes | Yes | None (current state) | Baseline |
| `async: true` on logging hooks | No | No | Low (add one field) | ~50% latency reduction for converted hooks |
| Consolidate into one dispatcher | Yes (one process) | Can if needed | Medium (refactor) | Reduces spawn count, not blocking time |
| Compiled binary (Go/Rust) | Yes | Yes | High (rewrite) | 5–10x faster per spawn |
| Short `timeout` field | Yes (until timeout) | Yes | Low | Safety net only, not speed |

---

## Recommendations

### Recommendation 1: Convert All Pure-Logging PostToolUse Hooks to Async (Primary)

Add `"async": true` to these 7 PostToolUse hooks:

```json
// In .claude/settings.json — add "async": true to each:
{ "type": "command", "command": "node .../observation-tracker.js", "async": true }
{ "type": "command", "command": "node .../usage-tracker.js", "async": true }
{ "type": "command", "command": "node .../cross-project-commit-tracker.js", "async": true }
{ "type": "command", "command": "node .../docker-monitor.js", "async": true }
{ "type": "command", "command": "node .../virgil-tracker.js", "async": true }
{ "type": "command", "command": "node .../memory-mirror.js", "async": true }
{ "type": "command", "command": "node .../plan-tracker.js", "async": true }
```

**Rationale**: These hooks write to JSONL/JSON files only and never return blocking decisions. Converting them to async has zero risk to correctness and reduces PostToolUse blocking time to near-zero for all tool calls.

**Caveat**: After conversion, if any of these hooks need to surface information to Claude (e.g., a detected anomaly), they must use `systemMessage` in their stdout JSON, which Claude receives on the next turn rather than immediately.

### Recommendation 2: Convert 2 UserPromptSubmit Logging Hooks to Async

```json
{ "type": "command", "command": "node .../self-correction-capture.js", "async": true }
{ "type": "command", "command": "node .../wiggum-loop-tracker.js", "async": true }
```

These two capture state to files with no control behavior. The `milestone-coordinator.js` and `context-health-monitor.js` should be reviewed first — if they inject context, they must remain sync.

### Recommendation 3: Add `"async": true` to Notification and SubagentStop Logging Hooks

```json
// Notification
{ "type": "command", "command": "node .../session-tracker.js", "async": true }

// SubagentStop
{ "type": "command", "command": "node .../subagent-stop.js", "async": true }
{ "type": "command", "command": "node .../virgil-tracker.js", "async": true }
```

The `ulfhedthnar-detector.js` on SubagentStop should be verified — if it ever returns `decision: "block"`, it must remain sync.

### Recommendation 4: Consider Consolidating the 3 Remaining Sync PreToolUse Hooks

The two `bash-safety-guard.js` entries (one for `^Bash$`, one for `^(Read|Write|Edit)$`) are two separate hook registrations calling the same script. A single registration with matcher `^(Bash|Read|Write|Edit)$` would reduce one process spawn per applicable tool call without any behavioral change.

### Recommendation 5: Set Explicit Timeouts on Async Hooks

Async hooks with runaway processes waste system resources. Set conservative timeouts:

```json
{ "type": "command", "command": "node .../observation-tracker.js", "async": true, "timeout": 10 }
```

10 seconds is generous for any logging hook. This prevents zombie processes from accumulating.

---

## Action Items

- [ ] Audit `milestone-coordinator.js` to confirm it never injects context or returns blocking decisions — then convert to async
- [ ] Audit `ulfhedthnar-detector.js` to confirm it only detects/logs and never blocks — then convert SubagentStop instance to async
- [ ] Audit `context-health-monitor.js` for whether it injects context — if pure logging, convert to async
- [ ] Add `"async": true` to the 7 confirmed pure-logging PostToolUse hooks
- [ ] Add `"async": true` to `self-correction-capture.js` and `wiggum-loop-tracker.js` in UserPromptSubmit
- [ ] Add `"timeout": 10` to all async hooks to prevent resource leaks
- [ ] Consolidate the duplicate `bash-safety-guard.js` PreToolUse registrations into one matcher
- [ ] Benchmark before/after with `claude --debug` to measure real-world hook timing

---

## Sources

1. [Claude Code Hooks Reference — Official Documentation](https://code.claude.com/docs/en/hooks)
2. [Boris Cherny — async: true announcement (Threads, Jan 25, 2026)](https://www.threads.com/@boris_cherny/post/DT8obEVkiRI/hooks-can-now-run-in-the-background-without-blocking-claude-codes-execution)
3. [Claude Code async hooks: what they are and when to use them (Dev Genius, Jan 2026)](https://blog.devgenius.io/claude-code-async-hooks-what-they-are-and-when-to-use-them-61b21cd71aad)
4. [Claude Code Hooks: Production Patterns Nobody Talks About (marc0.dev)](https://www.marc0.dev/en/blog/claude-code-hooks-production-patterns-async-setup-guide-1770480024093)
5. [feat(hooks): Add async: true support — claude-flow Issue #1017](https://github.com/ruvnet/claude-flow/issues/1017)
6. [Claude Code Hooks: Production Quality CI/CD Patterns (Pixelmojo)](https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns)
7. [Performance Tuning & Optimization — Developer Toolkit](https://developertoolkit.ai/en/claude-code/advanced-techniques/performance-tuning/)
8. [zsh-bench — Benchmark for interactive Zsh](https://github.com/romkatv/zsh-bench)
9. [Sequential Hook Execution Feature Request — claude-code Issue #21533](https://github.com/anthropics/claude-code/issues/21533)
10. [Windows async: true hang issue — claude-plugins-official Issue #351](https://github.com/anthropics/claude-plugins-official/issues/351)

---

## Uncertainties

- **Exact Node.js spawn overhead for Jarvis's hooks**: The 50–150 ms range is based on general macOS benchmarks, not Jarvis-specific measurement. Real numbers may differ. Use `claude --debug` to see actual hook timing in production.
- **`systemMessage` delivery timing**: The docs say async hook output delivers "on the next conversation turn." It is unclear whether this means the immediately next AI response or requires a new user prompt if Claude is idle.
- **`ulfhedthnar-detector.js` blocking behavior**: This hook fires on PostToolUse and SubagentStop. Its name suggests detection/alerting rather than blocking, but the code was not inspected for this report.
- **`milestone-coordinator.js` context injection**: This fires on both UserPromptSubmit and PostToolUse (TodoWrite). If it ever injects `additionalContext`, it must remain synchronous on UserPromptSubmit.
- **Parallel execution ceiling**: Hooks within the same event/matcher group run in parallel, but it is undocumented whether there is a concurrency limit on background async processes.

## Related Topics

- RD-001: Hook infrastructure analysis (`.claude/context/research/hook-infrastructure-analysis.md`)
- Claude Code plugin system for distributable hook bundles
- Go/Rust reimplementation of hot-path hooks for minimal spawn overhead
- Hook batching via a single dispatcher process that routes to multiple handlers internally
