# JICM Portable Architecture — Design Doc v1.0

**Status**: Proposed
**Author**: Jarvis (autonomous design)
**Created**: 2026-05-01
**Target**: JICM v8.0 (replaces v7.3)
**Predecessor design**: `.claude/context/designs/jicm-v6-design.md`
**Companion audit**: `.claude/context/designs/jicm-v7-audit-2026-05-01.md` (separate file)

---

## 1. Problem Statement

Current JICM v7.3 is functionally correct but **structurally tied to iTerm2 + tmux + a Claude-Code-in-window-0 layout**. This coupling has three measured costs:

| Cost | Why it matters |
|---|---|
| **Portability**: JICM cannot run in plain `claude` CLI (no tmux), Claude Code on the web, or any environment without `$HOME/bin/tmux` and a `jarvis:0` target. | Blocks Aion deployment to non-tmux hosts and Pulse-Nexus dashboard integration. |
| **Failure surface**: tmux capture-pane parsing of the rendered status line is fragile to status-line format changes (we already maintain a 60-line pane regex for token detection). | Bug surface. Status-line format changes break JICM silently. |
| **Operational overhead**: a long-running watcher process (jicm-watcher.sh, ~57KB, 6+ helpers) must be supervised, restarted on crash, has a PID file, log rotation, idle-checkpoint, burn-rate tracking, etc. | Cognitive load. Most of the watcher's complexity exists to compensate for the polling-via-tmux design. |

The user wants JICM preserved **conceptually** — fast compression, local-LLM-backed review, full /clear-to-zero, hook-triggered resume — but redesigned to be portable, transparent, fail-safe, and data-rich without a constantly-monitoring script.

---

## 2. Key Discoveries from Source-Code Audit

These three discoveries change the design space. They were verified against the local Claude Code source repo at `/Users/nathanielcannon/Claude/GitRepos/claude-code-source/`.

### 2.1 The status-line JSON contains everything the watcher needs

`src/components/StatusLine.tsx:90` and `src/tools/AgentTool/built-in/statuslineSetup.ts:54` confirm Claude Code passes a `context_window` object as part of the JSON it pipes to the status-line script's stdin:

```json
{
  "context_window": {
    "total_input_tokens": 257897,
    "total_output_tokens": 1697411,
    "context_window_size": 1000000,
    "current_usage": {
      "input_tokens": 6,
      "cache_creation_input_tokens": 7671,
      "cache_read_input_tokens": 194930
    },
    "used_percentage": 20,
    "remaining_percentage": 80
  }
}
```

This is the **single source of truth** for context fill. It is structured, current, and authoritative. No regex parsing is required.

### 2.2 The same `context_window` object is available to hooks

Per the docs at `claude-code__hooks.md` and source `src/utils/hooks.ts`, hook events including `UserPromptSubmit`, `PostToolUse`, `PreCompact`, `SessionStart`, `Stop` all receive their event payload as JSON on stdin. The payload includes the full session context.

For our purposes: **a hook firing on UserPromptSubmit can read the token count and decide whether to halt.** No external watcher needed.

### 2.3 Hooks can inject context AND nudge or block the user prompt

Hook return JSON supports:

| Field | Effect |
|---|---|
| `hookSpecificOutput.additionalContext` (string) | Appended to Claude's view of the conversation. Soft nudge. |
| `decision: "block"` + `systemMessage: ...` | Hard intercept. The user's prompt is blocked, the message is shown, the user must take corrective action. |
| `hookSpecificOutput.initialUserMessage` (SessionStart only) | Pre-populates a user prompt for Claude to execute. |

This is the **lever** that replaces tmux-keystroke injection. A hook can observably steer Claude's behavior at threshold without an external process.

### 2.4 What the Claude Code source explicitly does NOT support

These were ruled out by reading the source:

- ❌ A hook cannot directly invoke a slash command (no `runSlashCommand` field in hook output).
- ❌ A hook cannot trigger /clear programmatically. The user (or Claude in compliance with a strong nudge) must run /clear.
- ❌ There is no `context_window` field on the `Stop` event to hook auto-compact ourselves; we rely on the per-hook stdin payload.
- ❌ `CLAUDE_CONTEXT_JSON` env var (mentioned by an earlier draft) does NOT exist; payload is on stdin only.

---

## 3. Proposed Architecture (JICM v8)

### 3.1 Concept

**JICM becomes a thin layer of three hooks plus the prep script. No daemon. No watcher process. No tmux dependency.**

```
            ┌──────────────────────────────────────────────────────┐
            │  Claude Code Runtime (fires hook events on stdin)   │
            └──────────────────────────────────────────────────────┘
                       │                │                  │
                       ▼                ▼                  ▼
       ┌───────────────────┐  ┌──────────────────┐  ┌────────────────┐
       │ UserPromptSubmit  │  │ PreCompact       │  │ SessionStart   │
       │  jicm-gate.sh    │  │  (existing)     │  │  (existing)   │
       │                   │  │                  │  │                │
       │ Reads             │  │ Reads            │  │ Reads          │
       │  .total_input_    │  │  payload         │  │  source=clear  │
       │  tokens           │  │                  │  │                │
       │                   │  │                  │  │                │
       │ If ≥ soft thresh: │  │ Run prep         │  │ If state file  │
       │   run prep async  │  │ synchronously    │  │  is fresh:     │
       │   inject nudge    │  │ (Tier 1 + 2)    │  │   inject       │
       │                   │  │                  │  │   compressed   │
       │ If ≥ hard thresh: │  │                  │  │   context      │
       │   run prep sync   │  │                  │  │                │
       │   block + nudge   │  │                  │  │                │
       │   to /clear       │  │                  │  │                │
       └───────────────────┘  └──────────────────┘  └────────────────┘
                       │                │                  │
                       └────────────────┼──────────────────┘
                                        ▼
                            ┌────────────────────────┐
                            │  jicm-prep-context.sh  │
                            │  (Tier 1 bash + Tier 2 │
                            │  Ollama qwen3:8b)      │
                            │  Writes:               │
                            │   .compressed-context- │
                            │    ready.md            │
                            │   .jicm-state          │
                            └────────────────────────┘
```

### 3.2 The three hooks

#### Hook 1: `UserPromptSubmit` → `jicm-gate.sh` (NEW)

Fires on every user prompt. Reads `context_window.total_input_tokens` from the stdin JSON, compares against thresholds, returns one of three decisions:

| Threshold reached | Action | Decision JSON |
|---|---|---|
| **None** (tokens < soft) | Pass-through; record current tokens to state file. | `exit 0` |
| **Soft** (300k ≤ tokens < hard) | Kick off prep in background; inject nudge. | `{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "JICM-NUDGE: context at 312k/300k threshold. Prep is running. After your next reply, please run /clear." } }` |
| **Hard** (tokens ≥ hard, e.g. 730k = 73% of 1M) | Run prep synchronously (block until done). Block the user prompt. Tell user to /clear. | `{ "decision": "block", "systemMessage": "JICM-HALT: context at 745k/730k. Compressed checkpoint written to .compressed-context-ready.md. Please run /clear now to resume." }` |

Soft threshold: nudge Claude to wrap up + clear. Hard threshold: forced halt — context is too tight to proceed safely.

#### Hook 2: `PreCompact` → `jicm-precompact.sh` (REPURPOSED)

Fires when Claude Code is about to auto-compact (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70 means this fires at 70% of window). Currently runs `precompact-analyzer.js` and `pre-compact.sh`. These are kept; we add `jicm-precompact.sh` as a peer that runs `jicm-prep-context.sh` synchronously to write our crisp checkpoint BEFORE the native compact dilutes the context. After this hook returns, Claude Code's native compact runs — which preserves SOME of the conversation, but our checkpoint is the canonical resume source.

Native compact remains as the third-tier fallback (after soft nudge and hard block both somehow fail to fire).

#### Hook 3: `SessionStart` (source=clear OR compact) → `session-start.sh` (REUSED)

The existing hook already does the right thing: reads `.compressed-context-ready.md` and injects via `additionalContext`. No changes needed for the v8 transition. Internal cleanup (remove v5/v6 dead code paths, simplify the state-file shape match) is part of the v8 audit fixes.

### 3.3 What gets removed in v8

- **`jicm-watcher.sh` (57KB)**: deleted from default flow. Optionally retained as `jicm-watcher-legacy.sh` for environments where users want continuous burn-rate monitoring (a TUI feature, not a JICM mechanism).
- **All tmux capture-pane parsing**: removed. Token counts come from hook payloads.
- **All tmux send-keys injection**: removed. /clear is invoked by the user (after soft nudge) or forced (after hard block).
- **`.jicm-watcher.pid`**: no daemon, no PID file.
- **Burn-rate tracking, idle checkpoints, ESC-trigger idle detection**: all watcher-specific; gone.
- **Aion Quartet companions** (Ennoia, Virgil): repositioned. They keep running as standalone tmux helpers for users who want the TUI dashboards, but JICM no longer depends on them. Long-term: relocate to localhost dashboards or Pulse-Nexus, per User's roadmap.

### 3.4 What stays the same

- **Two-tier compression** (`jicm-prep-context.sh`): unchanged. Tier 1 bash extraction (~1s) + optional Tier 2 LLM enrichment (~5-20s via Ollama qwen3:8b direct). Already portable.
- **Compressed checkpoint format** (`.compressed-context-ready.md`): unchanged.
- **Resume mechanism** (SessionStart hook reads checkpoint, injects via additionalContext): unchanged.
- **Two-stage validation gating**: still applies. v8 deploy is a measurable behavioral change; gate per `.claude/context/patterns/two-stage-validation-gating.md` (Stage 1: regression-catch on JICM cycle success; Stage 2: full effect verification including resume-quality across diverse session types).

### 3.5 Status line

Status line is **decorative**, not load-bearing. With token counts now in hook payloads, the rendered status line no longer feeds JICM logic. We can redesign it freely.

The new status line (`jarvis-statusline.sh` v8.0) reads the same JSON that hooks read, and emphasizes:

1. **Context fill** as a structured stack bar (already implemented in v7.4 statusline — this part survives).
2. **Threshold proximity** with explicit ETA from observed burn rate (NEW; replaces the watcher's burn-rate display).
3. **Cache hit rate** for the most recent turn (NEW — exposes `cache_read_input_tokens` / total).
4. **Cost + 5h/7d rate-limit usage** (NEW — fields are in stdin payload but currently unsurfaced).
5. **JICM state** (`WATCHING` / `HALT_PENDING` / `RESUME`) — read from `.jicm-state-hook.json` written by jicm-gate.sh.

Status line preserves existing JICM-readable markers (the `tmux capture-pane` parser is gone, so format is no longer load-bearing on any consumer). Free design space.

---

## 4. Operational Properties

### 4.1 Portability

| Environment | v7.3 | v8 |
|---|---|---|
| iTerm2 + tmux | ✅ | ✅ |
| Plain `claude` CLI (no tmux) | ❌ | ✅ |
| Claude Code on the web | ❌ | ✅ |
| Claude Code IDE extension | ❌ | ✅ |
| SSH session in any terminal | ❌ | ✅ |
| Headless (CI, automation) | ❌ | ✅ |

### 4.2 Failure surface

| Failure mode | v7.3 | v8 |
|---|---|---|
| Status-line format change breaks token parser | Yes — bug surface | No — uses structured JSON |
| Watcher process crashes silently | Yes — no JICM until restart | N/A — no watcher |
| Two watchers running concurrently | Yes — race conditions | N/A |
| tmux pane scroll-back contamination | Yes — restricted to last 5 lines as workaround | N/A |
| Soft threshold missed (Claude continues past) | N/A — watcher forces halt | Possible if Claude ignores nudge → hard threshold catches |
| Hard threshold missed | Yes — watcher always catches | Possible if PreCompact hook also fails → native auto-compact catches |

The v8 failure modes are different but not worse: Claude is highly compliant with explicit instructions, and the three independent triggers (soft / hard / native) provide defense in depth.

### 4.3 Observability

v8 writes structured JSON state to `.jicm-state-hook.json` on every UserPromptSubmit. Schema:

```json
{
  "ts": "2026-05-01T19:00:00Z",
  "session_id": "<uuid>",
  "model_id": "claude-opus-4-7[1m]",
  "tokens": 257897,
  "context_window_size": 1000000,
  "used_percentage": 26,
  "soft_threshold": 300000,
  "hard_threshold": 730000,
  "burn_rate_tpm": 4500,
  "soft_eta_minutes": 9.4,
  "hard_eta_minutes": 105,
  "last_action": "WATCHING",
  "last_action_ts": "2026-05-01T18:59:55Z"
}
```

This file is the **single observability surface** for JICM. Status line reads it. Pulse-Nexus dashboard (when wired) reads it. Future Watcher/Ennoia/Virgil web UIs read it. No tmux capture, no hidden state.

### 4.4 Data richness

The hook stdin payload includes more than tokens. v8 captures and surfaces:

- `context_window.current_usage.cache_read_input_tokens` — for per-turn cache hit rate
- `context_window.current_usage.cache_creation_input_tokens` — for cache write activity
- `cost.total_cost_usd` and `cost.total_duration_ms` — for cost-per-token efficiency
- `rate_limits.five_hour.used_percentage` and `rate_limits.seven_day.used_percentage` — for downstream rate-limit-aware planning
- `model.id` and `effort.level` — for cross-model behavior comparison

All written to `.jicm-state-hook.json` on every prompt. Token-compression Phase 1.x analysis benefits directly: the cache telemetry extractor can consume this state file instead of (or in addition to) JSONL transcripts.

---

## 5. Migration Path

### 5.1 Stage 0 — Build prototype in Jarvis-Dev (this session)

- Create `Jarvis-Dev/.claude/hooks/jicm-gate.sh` (UserPromptSubmit hook)
- Create `Jarvis-Dev/.claude/hooks/jicm-precompact.sh` (PreCompact hook adjunct)
- Update `Jarvis-Dev/.claude/scripts/jarvis-statusline-v8.sh` (read `.jicm-state-hook.json`, redesigned layout)
- Update `Jarvis-Dev/.claude/settings.json` to register new hooks
- Validate: launch Claude Code in Jarvis-Dev, hit soft + hard thresholds, observe behavior
- **No production deploy.** Per Q1=B: Jarvis-Dev only, review-then-promote.

### 5.2 Stage 1 — User review

User reviews the prototype. Open questions for review:
- Soft threshold value (default 300k, configurable via env)
- Hard threshold value (default 730k = 73% of 1M)
- Whether soft nudge should happen once per session or every prompt past threshold (proposal: once per session, sticky; reset only on /clear)
- Behavior of `decision: "block"` if user has already seen the nudge but is mid-task (proposal: still block; user is expected to /clear)

### 5.3 Stage 2 — Two-stage validation gating

Per `.claude/context/patterns/two-stage-validation-gating.md`:

- Stage 1 (deploy + 24-48h on Jarvis-Dev): regression-catch axes only — does the prep script still write valid checkpoints? Does the SessionStart hook restore correctly? Does Claude comply with soft nudge? Does hard block actually block?
- Stage 2 (deploy + 7-14d): formal effect verification — quality of resumed work compared to v7.3, frequency of falling-through to native compact (failure mode), user-perceived friction.

### 5.4 Stage 3 — Promote to Jarvis production

After Stage 2 sign-off, promote v8 hooks + prep script to `Jarvis/.claude/`. Move `jicm-watcher.sh` to `archive/`. Update CLAUDE.md JICM section. Bump AC-04 spec to v8.0.

### 5.5 Stage 4 — Deprecate Aion Quartet tmux dependency

Independent stream (orthogonal per §4.7-equivalent). Watcher / Ennoia / Virgil become localhost dashboards or Pulse-Nexus widgets. They still exist; they just don't run in tmux windows by default.

---

## 6. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Claude ignores soft nudge and runs out of context | Medium | Hard threshold catches at 73%. PreCompact hook catches at 70% (native compact). Three layers. |
| Hook script crashes / times out | High if it bricks the prompt path | Timeout: 600s default for command hooks (v7.3 prep script runs in <30s typical, <60s with Tier 2 LLM). Hook script wraps everything in `|| true` so failure does not block the prompt. |
| User wants to disable JICM mid-session | Low | `JICM_DISABLED=true` env var checked at top of jicm-gate.sh; existing `.jicm-exit-mode.signal` for end-session compat. |
| Multiple Claude Code sessions on same project share state files | Medium | session_id field in `.jicm-state-hook.json`; per-session state files via session_id suffix (e.g. `.jicm-state-hook.<session_id>.json`). |
| Hook fires for non-Jarvis projects when settings.json is shared | Low | Hook checks `$CLAUDE_PROJECT_DIR` and only acts in Jarvis or registered projects. |
| LLM Tier 2 prep is slow under load on hard threshold | Medium | Hard-threshold path falls back to Tier 1 only (skip Tier 2) if prep takes > 30s. |
| Native auto-compact at 70% pre-empts our hard threshold at 73% | Low | Reorder: hard threshold should be < native auto-compact. Set hard threshold to 65% (650k of 1M) to leave native compact as final fallback. Update §3.2 accordingly. |

### Threshold calibration (final)

After §6 risk review:

| Threshold | Tokens (1M window) | % | Trigger | Action |
|---|---|---|---|---|
| Soft | 300,000 | 30% | UserPromptSubmit | Async prep + nudge |
| Hard | 650,000 | 65% | UserPromptSubmit | Sync prep + block + force /clear |
| Native auto-compact | 700,000 | 70% | PreCompact | Sync prep, then native compact runs |
| Lockout ceiling | ~785,000 | ~78.5% | Claude Code internal | Refuses new prompts |

---

## 7. Open Questions for User Review

1. **Soft-threshold tokens vs percent**: should the threshold be a fixed token count (300k) or a fixed percentage (30% of `context_window_size`)? Percent adapts to model changes (200k vs 1M context windows); tokens are easier to reason about. Recommendation: **percent**, with override via env.
2. **Sticky nudge or repeating nudge**: see §5.2.
3. **Block on hard threshold or auto-execute /clear via initialUserMessage**: SessionStart hook supports `initialUserMessage`. UserPromptSubmit hook does NOT (verified per source). Therefore hard threshold can only block with a message; user must run /clear. Acceptable?
4. **Aion Quartet relocation timeline**: §5.4 is a separate stream. Ranked priority?

---

## 8. Deliverables of this Design Cycle

This design doc + the prototype in Jarvis-Dev. No production deploy until user review.

- `[design]` `projects/project-aion/designs/jicm-portable-architecture.md` — this file
- `[audit]` `.claude/context/designs/jicm-v7-audit-2026-05-01.md` — companion audit (separate file)
- `[prototype]` `Jarvis-Dev/.claude/hooks/jicm-gate.sh` — new UserPromptSubmit hook
- `[prototype]` `Jarvis-Dev/.claude/hooks/jicm-precompact.sh` — new PreCompact hook adjunct
- `[prototype]` `Jarvis-Dev/.claude/scripts/jarvis-statusline-v8.sh` — redesigned status line
- `[prototype]` `Jarvis-Dev/.claude/settings.json` — wires the new hooks
- `[note]` Updated `.active-plan` recording v8 work and pending review

---

*JICM Portable Architecture v1.0 — 2026-05-01 — pending user review and Stage 1 validation*
