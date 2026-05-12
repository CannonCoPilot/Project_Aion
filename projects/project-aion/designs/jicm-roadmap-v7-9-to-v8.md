# JICM Roadmap — v7.x → v7.9 → v8.0+ — Design Document

**Status**: Approved (per User direction 2026-05-02)
**Author**: Jarvis (autonomous design)
**Created**: 2026-05-02
**Supersedes**: `projects/project-aion/designs/jicm-portable-architecture.md` (v1.0, 2026-05-01) — that doc proposed an autonomy-regressing approach and is retained only for historical reference.
**Companion plan**: `projects/project-aion/plans/jicm-implementation-plan-v7-9-to-v8.md`

---

## 1. The Single Invariant That Defines Acceptance

Every stage in this roadmap MUST satisfy:

> **NO step in the compression → /clear → resume chain may require manual User action.**

Concretely: no User keystroke, no User-issued `/clear`, no User confirmation. The chain runs hands-free at every threshold, every cycle, in every supported environment. A version that improves portability or robustness but breaks this invariant is a regression and will be rejected.

This is the property v7.x already provides via `tmux send-keys`. It is the load-bearing feature. Everything else in this roadmap exists in service of preserving it while improving the surrounding architecture.

---

## 2. The Reframing: Why v7.9 Comes Before v8.0

The earlier v8 design (`jicm-portable-architecture.md`) attempted to remove tmux dependency in a single step. That approach failed the autonomy invariant — there is no in-process mechanism by which Claude Code hooks can submit `/clear` to their own host process. Any architecture that lacks an external keystroke-injection path lacks autonomous /clear.

The corrected approach decomposes the design into two independent value deliveries:

| Stage | What it delivers | What it does NOT change |
|---|---|---|
| **v7.9** | Robustness, observability, sensing reliability — within the existing tmux substrate | The tmux dependency itself |
| **v8.0+** | Portability — the keystroke-injection substrate becomes pluggable, with a custom Python PTY wrapper as the first non-tmux backend | The hook-sensing layer, the watcher protocol, the signal contract — all built and validated in v7.9 |

This serial decomposition has three properties the single-step approach lacked:
1. **Independent validation gates** — v7.9 ships and validates without v8.0 risk; v8.0 ships against an already-stable v7.9 baseline.
2. **Rollback safety** — a v8.0 issue does not invalidate the v7.9 hardening work.
3. **Smaller cognitive load per cycle** — each stage has one concern (robustness vs. portability), not two.

---

## 3. Version Timeline

```
v7.3 ────► v7.9 ─────────► v8.0 ───────► v8.1 ──► v8.2 ──► …
(today)   (hardening)     (PTY port)    (web)    (IDE)
          tmux retained   pluggable     browser  IDE-ext
                          backends      backend  backend
```

| Version | Codename | Scope | Estimated effort | Gate to next |
|---|---|---|---|---|
| **v7.3** | (current) | Production baseline | — | (in production) |
| **v7.9** | "Hardening" | Hook-based sensing; slim signal-driven watcher; retire fragile capture-pane parser; explicit signal protocol; observability surface (`.jicm-state-hook.json`); pluggable injection-backend interface (tmux backend only) | 4–6 sessions | Two-stage gate: Stage-1 harness pass on Jarvis-Dev (48h regression-catch); Stage-2 14d real-usage validation |
| **v8.0** | "Untether" | Custom Python PTY wrapper (`jarvis-pty`); second injection backend implemented against v7.9's pluggable interface; self-installer for cross-machine deployment | 6–8 sessions | Cross-OS smoke tests (macOS, Linux, WSL); Stage-1 PTY parity harness; Stage-2 14d on at least one non-tmux deployment |
| **v8.1** | "Web" | Browser-automation backend for `claude.ai/code` | TBD | Out of scope for this roadmap |
| **v8.2** | "IDE" | IDE-extension backend (VS Code, JetBrains) | TBD | Out of scope for this roadmap |

This roadmap covers **v7.3 → v7.9 → v8.0** in detail. v8.1 and v8.2 are listed for completeness; they will receive their own design docs when activated.

---

## 4. v7.9 — "Hardening" — Detailed Scope

### 4.1 Sensing layer (REPLACED)

**Retired**:
- `tmux capture-pane` parser (60-line regex inside `jicm-watcher.sh` for token-count detection from rendered status line).
- Status-line format coupling (any format change breaks the parser).
- Burn-rate tracking inside the watcher (computed from polled samples).
- ESC-trigger idle detection (heuristic-based; brittle).
- Pane scroll-back contamination workaround (restrict to last 5 lines).

**Replaced by**:
- `UserPromptSubmit` hook reading `transcript_path` from stdin, parsing the JSONL transcript's most recent assistant `message.usage` object, and computing `current_context_tokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (structured, authoritative, within ~3-4% of TUI value as a conservative lower bound).
- Burn rate computed inside the hook by comparing successive `current_context_tokens` readings written to `.jicm-state-hook.json`.
- Pending-action flagging via `.jicm-state-hook.json.pending_action` consumed by `Stop` hook (which fires after Claude finishes a turn — the natural idle moment).

> **CORRECTION 2026-05-02 (Phase 7.9.0 audit)**: The original §4.1 draft specified the UPS hook reading `context_window` JSON from stdin. **That field is not present in any Claude Code hook event's stdin payload** — verified empirically (`.jicm-stdin-debug.json`) and via official docs (`code.claude.com/docs/en/hooks.md`). The original source citations to `StatusLine.tsx:90` and `statuslineSetup.ts:54` describe the **statusLine command** payload contract, NOT the UPS hook contract — those are different events with different schemas. **JSONL transcript parsing is the corrected canonical sensing source**, verified within ~3.6% of v7 capture-pane reading and approved per User this session. See `.claude/metrics/jicm/v7-9-baseline-2026-05-02.md` §2-3 for the full evidence trail. **Encoding directive**: token counts strictly preferred over percentages — thresholds, ETAs, and state-file primary fields all carry exact token integers; percentages are display-derived only.

### 4.2 Signal protocol (FORMALIZED)

The hook layer and the watcher layer communicate exclusively through signal files. No shared memory, no IPC, no in-process callbacks. This is the contract that v8.0+ will preserve verbatim across PTY backends.

| Signal file | Writer | Reader | Payload | Purpose |
|---|---|---|---|---|
| `.jicm-state-hook.json` | `jicm-gate.sh` (UserPromptSubmit) | watcher, status-line, dashboards | full state object (see §4.4) | Single source of truth for context state |
| `.jicm-clear-now.signal` | `jicm-stop.sh` (Stop hook) | watcher | `{threshold_type, tokens, pct, ts}` JSON line | Triggers actuator chain |
| `.compression-in-progress` | watcher (or prep script) | watcher | empty marker | Singleton guard |
| `.compression-done.signal` | prep script | watcher | empty marker | Tier 1 + 2 prep complete |
| `.compressed-context-ready.md` | prep script | SessionStart hook | full checkpoint markdown | Restored on /clear |
| `.jicm-resume-complete.signal` | SessionStart hook | watcher | empty marker | Resume injection succeeded |
| `.jicm-exit-mode.signal` | end-session command | watcher | empty marker | Suppress JICM during exit |
| `.jicm-sleep.signal` | Ulfhedthnar hook | watcher | empty marker | Suppress JICM during AC-10 |

All paths under `.claude/context/`. All gitignored.

### 4.3 Watcher (REWRITTEN AS SLIM ACTUATOR)

The `jicm-watcher.sh` file shrinks from ~57KB / ~1100 lines / 6+ helpers to a target of ≤ 8KB / ~200 lines / no helpers. Its sole responsibilities become:

1. **Singleton guard** — PID file, refuses to start if another instance is running.
2. **Signal poll** — polls `.jicm-clear-now.signal` on a 1s interval (no parsing, just file existence + read).
3. **Idle wait** — when signal seen, waits for the most recent `.jicm-state-hook.json` update to be ≥ 3s old (Claude is idle between turns).
4. **HALT injection** — `tmux send-keys` the canonical HALT prompt (single-line, asks Claude to write working details to scratchpad and acknowledge).
5. **HALT acknowledgment wait** — polls capture-pane briefly for "Understood" acknowledgment OR timeout (60s).
6. **Prep launch** — runs `jicm-prep-context.sh` if `.compression-done.signal` not already present.
7. **Prep wait** — polls `.compression-done.signal` (timeout 300s).
8. **/clear injection** — Escape + literal `/clear` + C-m via send-keys (the v7 canonical sequence, unchanged).
9. **Resume wait** — polls `.jicm-resume-complete.signal` (written by SessionStart hook after restoration).
10. **RESUME injection** — `tmux send-keys` the canonical RESUME prompt + Enter.
11. **Cleanup** — clears all transient signal files; returns to step 2.

Removed entirely:
- Burn-rate tracking
- Idle-checkpoint logic
- ESC-trigger detection
- Status-line parsing
- Stale-pane handling
- All v5/v6 dead code paths

### 4.4 Observability surface

Every UserPromptSubmit writes `.jicm-state-hook.json`:

```json
{
  "ts": "2026-05-02T17:30:00Z",
  "session_id": "<uuid>",
  "model_id": "claude-opus-4-7[1m]",
  "tokens": 257897,
  "context_window_size": 1000000,
  "used_percentage": 25.79,
  "soft_threshold_pct": 30,
  "hard_threshold_pct": 65,
  "burn_rate_tpm": 4500,
  "soft_eta_minutes": 9.4,
  "hard_eta_minutes": 105.0,
  "cache_read_input_tokens": 194930,
  "cache_creation_input_tokens": 7671,
  "total_cost_usd": 4.21,
  "rate_limit_5h_pct": 33,
  "rate_limit_7d_pct": 12,
  "last_action": "WATCHING",
  "last_action_ts": "2026-05-02T17:29:55Z",
  "pending_action": null
}
```

Single source of truth for: status line, watcher idle check, future Pulse-Nexus dashboards, token-compression Phase 1.x analysis, and any external diagnostic.

### 4.5 Pluggable injection-backend interface (NEW; foundation for v8.0)

Even though v7.9 ships with only the tmux backend, the abstraction is introduced now. The watcher invokes injection through a single helper file:

```
.claude/scripts/jicm-inject-tmux.sh         # default backend (v7.9)
.claude/scripts/jicm-inject-pty.sh          # placeholder; implemented in v8.0
```

Backend interface (sh contract — every backend MUST implement these four entry points):

```
jicm-inject-<backend>.sh escape             # send Escape to target
jicm-inject-<backend>.sh text "<literal>"   # send literal text (no interpretation)
jicm-inject-<backend>.sh submit             # send Enter (C-m / \r)
jicm-inject-<backend>.sh capture            # capture last N lines of target output
```

Watcher selects backend via `JICM_INJECTION_BACKEND` env var (default: `tmux`). This is a one-line change in v8.0 to switch substrates.

### 4.6 Acceptance criteria

v7.9 promotes to Jarvis production when ALL of the following hold:

| Criterion | Verification |
|---|---|
| Stage-1 harness passes 5/5 tests on Jarvis-Dev | Autonomous harness — see implementation plan §7.9.5 |
| End-to-end JICM cycle is hands-free | Harness drives a full cycle without User intervention |
| Watcher source ≤ 8KB | `wc -c .claude/scripts/jicm-watcher.sh` |
| Zero capture-pane regex calls remain | `grep -c capture-pane jicm-watcher.sh` returns 0 |
| All five v7 fragile mechanisms retired | Audit checklist in implementation plan §7.9.0 |
| Observability surface populated on every prompt | Hook test verifies file appears + has all 18 fields |
| Stage-2 14-day usage shows zero JICM-related failures | Track via `.jicm-last-compression.json` log entries |

---

## 5. v8.0 — "Untether" — Detailed Scope

### 5.1 The PTY wrapper (`jarvis-pty`)

A self-contained Python tool that owns a child process's PTY and exposes a control interface over a Unix domain socket.

**Single-file Python program**, target ≤ 500 lines, dependencies: stdlib only (`pty`, `select`, `socket`, `os`, `signal`, `json`). Optional fallback to `ptyprocess` only if stdlib pty proves insufficient on a given OS.

**CLI**:
```
jarvis-pty launch <cmd> [<args>...]    # spawns cmd in PTY; daemonizes; listens on socket
jarvis-pty escape                       # writes 0x1b to PTY
jarvis-pty text "<literal>"             # writes literal bytes to PTY (no interpretation)
jarvis-pty submit                       # writes \r to PTY
jarvis-pty capture [--lines N]          # returns last N lines from PTY's terminal buffer
jarvis-pty status                       # JSON: pid, uptime, last activity ts
jarvis-pty kill                         # SIGTERM the launched process; clean exit
```

Socket path: `${JARVIS_PTY_SOCKET:-$HOME/.jarvis/pty.sock}`.

**Operational profile**:
- Daemonized via `os.fork()` + `os.setsid()`.
- Logs to `$HOME/.jarvis/pty.log`.
- One PTY wrapper per Claude Code session (multiple wrappers can run concurrently with distinct socket paths).
- Auto-cleans socket on shutdown.

### 5.2 The PTY backend (`jicm-inject-pty.sh`)

Trivial sh shim implementing the four-entry contract from §4.5:

```sh
#!/bin/bash
# jicm-inject-pty.sh — PTY backend for v8.0
SOCK="${JARVIS_PTY_SOCKET:-$HOME/.jarvis/pty.sock}"
case "$1" in
  escape)  jarvis-pty --socket "$SOCK" escape ;;
  text)    jarvis-pty --socket "$SOCK" text "$2" ;;
  submit)  jarvis-pty --socket "$SOCK" submit ;;
  capture) jarvis-pty --socket "$SOCK" capture --lines "${2:-50}" ;;
esac
```

Watcher set to `JICM_INJECTION_BACKEND=pty` and the entire actuation chain works against the PTY wrapper instead of tmux.

### 5.3 Self-installer (`jarvis-install`)

Single-file Python installer for cross-machine deployment. Target ≤ 600 lines, deps: stdlib only.

**Installation flow**:

```
jarvis-install --target $HOME/Claude/Jarvis [--profile {production|dev}]
```

Steps performed:

| Step | Action | Failure handling |
|---|---|---|
| 1 | Detect OS (`uname -s` → macOS/Linux/Windows-WSL) | Abort with clear error if unsupported |
| 2 | Verify Python ≥ 3.10 | Abort with version message |
| 3 | Verify Claude Code CLI installed and on PATH | Abort with install instructions |
| 4 | Create target directory tree (`.claude/`, `infrastructure/`, `projects/`, etc.) | Idempotent — skips if exists |
| 5 | Copy / link Jarvis core files | From bundled archive or from a source clone |
| 6 | Initialize venv at `infrastructure/.venv/` and install (zero deps required for v8.0 core; only token-compression analysis tools need extras) | Skip if venv exists |
| 7 | Install `jarvis-pty` to `$HOME/.local/bin/` | Idempotent |
| 8 | Install `jarvis-install` to `$HOME/.local/bin/` (self-update path) | Idempotent |
| 9 | Configure `$HOME/.jarvis/config.toml` with paths and chosen backend | Skip if exists; `--reconfigure` to override |
| 10 | Generate launchctl (.plist) on macOS or systemd unit on Linux for `jarvis-pty launch claude` + watcher | Optional; `--no-service` flag skips |
| 11 | Smoke test: launch Claude under PTY backend, send `/help`, verify TUI responds, submit Enter, kill | Abort install if smoke test fails |
| 12 | Print summary: paths, service status, next-step commands | Always |

**Bundled artifact**: `jarvis-bundle-vX.Y.Z.tar.gz` containing the Jarvis tree minus runtime state, secrets, and gitignored content. Generated by a separate `jarvis-bundle.py` script (also written in v8.0).

### 5.4 Cross-OS support matrix

| OS | Backend | Python `pty` works | tmux available | Tested |
|---|---|---|---|---|
| macOS 14+ ARM | tmux **and** pty | ✅ | ✅ | Primary dev environment |
| Linux (Ubuntu 22.04+) | tmux **and** pty | ✅ | ✅ | Stage-2 validation target |
| Windows 11 + WSL2 (Ubuntu) | tmux **and** pty | ✅ | ✅ | Stage-2 validation target |
| Windows 11 native | pty only | Limited (winpty needed) | ❌ | Out of scope for v8.0 |

WSL is treated as Linux for v8.0; native Windows support deferred to a later version.

### 5.5 Acceptance criteria

v8.0 promotes when ALL of the following hold:

| Criterion | Verification |
|---|---|
| `jarvis-pty` PTY wrapper passes parity test against tmux backend | Stage-1 harness runs against both backends; results identical |
| `jarvis-install` succeeds on macOS, Linux (Ubuntu), WSL2 from clean machine | Three smoke installs |
| End-to-end JICM cycle works under PTY backend | Stage-1 harness with `JICM_INJECTION_BACKEND=pty` |
| Stage-2 14d on at least one non-tmux deployment | Track `.jicm-last-compression.json` from a Linux/WSL Jarvis |
| Self-update path works (`jarvis-install --target $existing --upgrade`) | Smoke test on a v7.9 installation |
| Documentation: install guide, OS notes, troubleshooting | Three docs under `docs/install/` |

---

## 6. Cross-Version Invariants

These properties hold at every version from v7.3 forward. Any change that violates one is a regression.

| Invariant | Why it matters |
|---|---|
| **Full autonomy** — no User /clear, ever | The defining JICM property |
| **Two-stage validation** — Stage-1 regression-catch + Stage-2 effect verification before promotion | Per `.claude/context/patterns/two-stage-validation-gating.md` |
| **Single source of truth for state** — `.jicm-state-hook.json` | Avoid the v7 polling-via-rendered-surface trap |
| **External actuator** — keystroke injection always lives outside the Claude process | Architectural fact of TUI input model |
| **Idempotent signals** — every signal file is safe to re-write or re-read | Robustness across crashes |
| **Singleton watcher** — exactly one actuator per Claude session | Race condition prevention |
| **Graceful degradation** — Tier 2 LLM optional; Tier 1 bash always works | Local-LLM availability is not a hard dependency |

---

## 7. Risks and Mitigations

| Risk | Severity | Stage | Mitigation |
|---|---|---|---|
| Stop hook unavailability or unreliable firing across model versions | High | v7.9 | Verify Stop hook fires reliably across opus-4-7, sonnet-4-6, haiku-4-5 in Stage-1 harness; fall back to UserPromptSubmit-only triggering with delayed-actuation if Stop is unreliable |
| Slim watcher misses signal during a brief race (signal written between polls) | Low | v7.9 | 1s poll interval × idempotent signal handling; watcher re-checks signal on each loop |
| HALT acknowledgment timeout under heavy load | Medium | v7.9 | 60s timeout matches v7 default; on timeout, force-proceed with prep + /clear (matches v7 fallback) |
| Python `pty` stdlib has subtle behavioral differences across macOS/Linux | Medium | v8.0 | Stage-1 harness runs identical test sequence on each OS; differences flagged before promotion |
| `jarvis-pty` daemon crashes silently | High | v8.0 | Watcher detects via `jarvis-pty status`; falls back to tmux backend if available; logs ERROR; alerts via `.jicm-state-hook.json.last_action: BACKEND_DOWN` |
| Self-installer leaves a partial install on failure | Medium | v8.0 | Installer is fully idempotent; `--reconfigure` and `--upgrade` flags clean up; FAILURE state always recoverable by re-running |
| User runs both v7.x watcher and v7.9 watcher concurrently | High | v7.9 transition | Singleton PID file at `.jicm-watcher.pid`; new watcher refuses to start if existing PID alive; documented migration step kills old watcher first |

---

## 8. Out-of-Scope (For Later Roadmap Cycles)

These are real gaps but explicitly NOT addressed by v7.9 or v8.0:

- **v8.1 — Web client backend** for `claude.ai/code`. Different injection class (browser automation via Playwright). Separate design.
- **v8.2 — IDE-extension backend** for VS Code / JetBrains. Depends on Claude Code IDE APIs that may or may not expose slash-command invocation.
- **Multi-session JICM** — concurrent Jarvis sessions on different projects with shared state. Requires session-id-scoped signal files and per-session watcher instances.
- **Pulse-Nexus dashboard widget** — consume `.jicm-state-hook.json` and visualize cycles. Independent track in Alfred-Dev.
- **Aion Quartet (Ennoia / Virgil) decoupling** — currently tmux-windowed; will be repositioned as `.jicm-state-hook.json` consumers (no longer JICM-coupled). Independent of v7.9 / v8.0.

---

## 9. Document Lifecycle

This roadmap is the contract. Both the implementation plan and the per-stage deliverables reference back to it. When a version ships:

1. Move this doc to `projects/project-aion/designs/archive/jicm-roadmap-v7-9-to-v8-COMPLETE-YYYY-MM-DD.md`.
2. Generate a post-mortem section at the end documenting actual vs planned, deviations, and lessons.
3. If v8.1 / v8.2 / multi-session work activates, create a new roadmap doc that supersedes this one.

---

*JICM Roadmap v7.9 → v8.0 — Approved 2026-05-02 — Companion to implementation plan*
