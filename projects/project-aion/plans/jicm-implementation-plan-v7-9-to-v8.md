# JICM Implementation Plan — v7.x → v7.9 → v8.0+

**Status**: Approved (User direction 2026-05-02)
**Companion design**: `projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md`
**Plan owner**: Jarvis (autonomous execution)
**Branching**: `Project_Aion` (Jarvis main); v7.9 lands in production after Stage-1 + Stage-2; v8.0 dev work mirrored in `Jarvis-Dev/dev` branch first.

---

## How To Read This Plan

Phases are numbered `<version>.<phase>.<task>`. Tasks within a phase may run in parallel; phases run in series. Each phase has:
- **Files** — exhaustive list of touched paths.
- **Tasks** — ordered atomic work items.
- **Validation** — what must pass before the phase is "done."
- **Two-stage gate** — Stage-1 regression-catch and Stage-2 promotion criterion (per `.claude/context/patterns/two-stage-validation-gating.md`).

The single invariant from the roadmap §1 — full autonomy — is verified at every phase that touches the actuation chain.

---

## v7.9 — Hardening (within tmux substrate)

### Phase 7.9.0 — Foundations

**Files**:
- `projects/project-aion/designs/jicm-v7-audit-2026-05-01.md` (read-only — already exists, drives this phase)
- `.claude/context/patterns/two-stage-validation-gating.md` (read-only — gating reference)
- (creates) `.claude/metrics/jicm/v7-9-baseline-2026-05-02.md` — current state snapshot

**Tasks**:
1. Audit current `.claude/scripts/jicm-watcher.sh`. Classify each helper / function as KEEP, RETIRE, or REWRITE. Output: section 1 of `v7-9-baseline-2026-05-02.md`.
2. Inventory current state files used by JICM v7. Identify which carry forward to v7.9 (per roadmap §4.2).
3. Inventory all hooks currently registered (`.claude/settings.json` UserPromptSubmit chain; PreCompact chain; SessionStart chain). Note ordering and any conflicts with new hooks.
4. Capture current cycle metrics from `.jicm-last-compression.json` history — average compression time, average HALT-to-CLEAR latency, success rate. Output: section 2 of baseline doc.
5. Verify Claude Code Stop hook fires reliably for current model (claude-opus-4-7) — write a 5-line probe script, register temporarily, send 3 prompts, confirm Stop fires 3× with payload. Output: section 3 of baseline doc.

**Validation**:
- Baseline doc exists and is complete.
- Stop hook probe results documented (this is a precondition for the new triggering model).

**Gate**: phase complete; v7.9.1 begins.

---

### Phase 7.9.1 — Hook layer

**Files**:
- `.claude/hooks/jicm-gate.sh` — UserPromptSubmit hook (NEW)
- `.claude/hooks/jicm-stop.sh` — Stop hook (NEW)
- `.claude/hooks/jicm-precompact.sh` — PreCompact hook adjunct (NEW; peer to existing precompact-analyzer)
- `.claude/hooks/session-start.sh` — SessionStart hook (UPDATED to write `.jicm-resume-complete.signal`)
- `.claude/scripts/jicm-state-update.sh` — shared library for atomic JSON update (NEW)
- `.claude/settings.json` — register new hooks; update existing entries

**Tasks**:
1. Build `jicm-state-update.sh` — atomic update helper for `.jicm-state-hook.json` using temp file + rename. Avoids torn writes when watcher reads concurrently.
2. Build `jicm-gate.sh` (UserPromptSubmit hook):
    - Read `context_window` + `cost` + `rate_limits` + `model` + `session_id` from stdin JSON.
    - Compute burn_rate_tpm by comparing against last-state's tokens / ts.
    - Compute soft/hard ETA minutes.
    - Determine threshold state: `none`, `soft`, `hard`.
    - Atomically update `.jicm-state-hook.json` (all 18 fields per roadmap §4.4).
    - If threshold is `soft` or `hard`: set `pending_action: HALT_AFTER_RESPONSE`.
    - Exit 0 with empty stdout (no `additionalContext`, no `decision: "block"` — actuation is the watcher's job).
3. Build `jicm-stop.sh` (Stop hook):
    - Read `.jicm-state-hook.json`.
    - If `pending_action == "HALT_AFTER_RESPONSE"`: write `.jicm-clear-now.signal` with `{threshold_type, tokens, pct, ts}`.
    - Clear `pending_action` field via atomic update.
    - Exit 0.
4. Build `jicm-precompact.sh` (PreCompact hook adjunct):
    - Run `jicm-prep-context.sh` synchronously (Tier 1 + Tier 2).
    - Exit 0 even on prep failure (do not block Claude Code's native compact path).
5. Update `session-start.sh`:
    - On `source=clear` (or `compact`): existing logic restores compressed context via `additionalContext`.
    - After successful injection: write `.jicm-resume-complete.signal`.
6. Wire all four hooks in `.claude/settings.json`:
    - `jicm-gate.sh` registered FIRST in UserPromptSubmit chain.
    - `jicm-stop.sh` registered FIRST in Stop chain.
    - `jicm-precompact.sh` registered as peer in PreCompact chain (after existing analyzer).
    - `session-start.sh` already registered; verify ordering.

**Validation**:
- Each hook returns valid JSON (or empty) and exit 0 in all paths.
- Atomic update helper survives concurrent read/write (tested with parallel invocation).
- `.jicm-state-hook.json` schema matches roadmap §4.4 exactly (18 fields).

**Gate**: hook layer ships independently of watcher rewrite — old v7 watcher still works, ignores new state file. Safe checkpoint.

---

### Phase 7.9.2 — Pluggable injection-backend interface

**Files**:
- `.claude/scripts/jicm-inject-tmux.sh` — tmux backend (NEW; extracts current send-keys logic)
- `.claude/scripts/jicm-inject-pty.sh` — placeholder; returns "not implemented" exit 2 (NEW; v8.0 fills this in)
- `.claude/scripts/jicm-inject.sh` — dispatcher (NEW); reads `JICM_INJECTION_BACKEND` env var (default `tmux`); execs the chosen backend

**Tasks**:
1. Build `jicm-inject-tmux.sh` implementing the four-entry contract (escape / text / submit / capture). Reuses the canonical v7 send-keys sequences verbatim from `jicm-watcher.sh:307-322`.
2. Build `jicm-inject-pty.sh` placeholder — exits 2 with message "PTY backend not implemented in v7.9; available in v8.0+."
3. Build `jicm-inject.sh` dispatcher.
4. Add unit-style tests: `.claude/scripts/dev/test-inject-backend.sh` runs all four entries against tmux backend in a throwaway tmux window and verifies effect.

**Validation**:
- All four entry points work against tmux backend in dispatcher test.
- Default-to-tmux behavior verified (no env var set).
- Failure modes (target window missing, target session missing) produce clear errors.

**Gate**: backend abstraction exists; v8.0 has a clean substitution point.

---

### Phase 7.9.3 — Slim watcher

**Files**:
- `.claude/scripts/jicm-watcher.sh` — REWRITE in place; old version preserved as `jicm-watcher-legacy.sh`
- `.claude/scripts/jicm-watcher-legacy.sh` — copy of v7 watcher (kept for fallback during transition)
- `.claude/scripts/jicm-config.sh` — UPDATED with new signal paths; existing config preserved

**Tasks**:
1. Copy current `jicm-watcher.sh` → `jicm-watcher-legacy.sh`. Add header comment marking it superseded.
2. Rewrite `jicm-watcher.sh` per roadmap §4.3:
    - Singleton guard via `.jicm-watcher.pid` (refuse start if PID alive).
    - Main loop: poll `.jicm-clear-now.signal` every 1s.
    - On signal: `actuate_jicm_cycle` function (steps 3-11 from roadmap §4.3).
    - Use `jicm-inject.sh` for all keystroke injection (no direct `tmux send-keys` calls).
    - Use `.jicm-state-hook.json` for idle detection (last update ≥ 3s old = idle).
    - Logs to `.claude/logs/jicm-watcher.log` with rotation at 10MB.
    - Trap SIGTERM / SIGINT for graceful shutdown (clears `.jicm-watcher.pid`).
3. Update `jicm-config.sh` to declare new signal paths.
4. Verify watcher source ≤ 8KB (per roadmap §4.6 acceptance criterion).

**Validation**:
- `wc -c .claude/scripts/jicm-watcher.sh` ≤ 8192.
- `grep -c capture-pane .claude/scripts/jicm-watcher.sh` returns 0 (no direct capture-pane parsing; capture is delegated to backend).
- `grep -c "tmux send-keys" .claude/scripts/jicm-watcher.sh` returns 0 (no direct send-keys; all via backend).
- Singleton guard prevents two instances starting (manual test: launch twice, second exits with clear message).

**Gate**: new watcher exists alongside legacy; production runs legacy until Stage-1 passes.

---

### Phase 7.9.4 — Status line update

**Files**:
- `.claude/scripts/jarvis-statusline.sh` — REPLACE with v7.9 version that reads `.jicm-state-hook.json`
- `.claude/scripts/jarvis-statusline-legacy.sh` — copy of current status line (preserved for rollback)

**Tasks**:
1. Copy current status line → legacy.
2. Build new status line that reads `.jicm-state-hook.json` and renders:
    - Model id (short form)
    - Stack bar of context fill (existing widget; ported)
    - % filled
    - Burn rate (tpm)
    - ETA to soft threshold (if < 30 min)
    - Cache hit rate (most recent turn)
    - Cost ($)
    - 5h / 7d rate-limit usage (% bars)
    - JICM action state (WATCHING / NUDGED / HALTING / CLEARING / RESUMING)
3. Single-line output. ANSI color OK (terminal renders).
4. `.claude/settings.json` `statusLine` block points to new script.

**Validation**:
- Status line renders in fresh Jarvis session.
- All 9 panels populated when `.jicm-state-hook.json` present.
- Falls back gracefully (e.g. `WATCHING -` placeholder) when state file absent.

**Gate**: cosmetic; can be promoted independently. No autonomy impact.

---

### Phase 7.9.5 — Stage-1 autonomous validation harness

**Files**:
- `.claude/scripts/dev/jicm-v7-9-stage-1-harness.sh` — NEW; the autonomous harness
- `.claude/metrics/jicm/v7-9-stage-1-result-template.md` — NEW; verdict template
- `.claude/scratch/jicm-v7-9-test-runs/` — NEW directory; per-run logs and captures

**Tasks**:
1. Build the harness script. It MUST run end-to-end without User intervention. Harness pseudocode:

    ```
    for each test in (T1, T2, T3, T4, T5):
        TARGET_WINDOW="jarvis:jicm-test-$test"
        $TMUX_BIN new-window -t jarvis -n "jicm-test-$test"
        $TMUX_BIN send-keys -t "$TARGET_WINDOW" -l \
            "cd /Users/nathanielcannon/Claude/Jarvis-Dev && \
             JICM_SOFT_PCT=$soft JICM_HARD_PCT=$hard \
             claude --dangerously-skip-permissions"
        $TMUX_BIN send-keys -t "$TARGET_WINDOW" C-m
        wait_for_claude_ready "$TARGET_WINDOW" 60
        # send test prompt(s)
        # capture state file, signal files, pane output at known points
        # write per-test verdict to .claude/scratch/jicm-v7-9-test-runs/$test.json
        $TMUX_BIN kill-window -t "$TARGET_WINDOW"
    aggregate verdicts → .claude/metrics/jicm/v7-9-stage-1-result-YYYY-MM-DD.md
    ```

2. Define the five tests:

    | Test | Setup | Prompt | Pass criterion |
    |---|---|---|---|
    | T1 | default thresholds | "say hello" | `.jicm-state-hook.json` exists with all 18 fields, `last_action: WATCHING`, no signal files |
    | T2 | `JICM_SOFT_PCT=1` | "say hello" | `.jicm-state-hook.json.pending_action: HALT_AFTER_RESPONSE`; no `.jicm-clear-now.signal` until Stop fires |
    | T3 | `JICM_SOFT_PCT=1` | "say hello" then wait for response complete | `.jicm-clear-now.signal` written by Stop hook; watcher picks up; HALT prompt visible in pane; "Understood" eventually appears; `.compression-done.signal` written; `/clear` injected; `.compressed-context-ready.md` exists; `[JICM-RESUME]` injected |
    | T4 | `JICM_HARD_PCT=1` | "say hello" | Same as T3 but threshold_type=hard in signal |
    | T5 | invalid Claude payload (mock stdin) | (direct hook invocation) | Hook exits 0; state file unchanged or marked degraded; no spurious signal |

3. Build the verdict template — one heading per test, pass/fail line, captured artifact paths, observed timing.

4. Stage-1 harness invocation: `bash .claude/scripts/dev/jicm-v7-9-stage-1-harness.sh`. Should complete in ≤ 15 minutes total.

**Validation**:
- Harness completes without User input.
- All 5 tests have explicit pass/fail verdicts.
- Verdict report committed to `.claude/metrics/jicm/`.
- Harness is re-runnable (idempotent cleanup).

**Stage-1 gate (per two-stage pattern)**:
- 5/5 tests PASS → STAGE_1_CLEAR. Proceed to Stage-2 deployment.
- Any test FAIL → STAGE_1_HALT. Triage; do not promote.
- Any test DEFER (e.g. Stop hook unreliability blocks T3): STAGE_1_DEFERRED, escalate to design review.

---

### Phase 7.9.6 — Stage-2 deployment to Jarvis production

**Files**:
- `.claude/settings.json` (Jarvis) — register new hooks
- `.claude/scripts/jicm-watcher.sh` (Jarvis) — replace with v7.9 version
- (related — see plan §7.9.1-4)
- `projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md` — update version table to mark v7.9 deployed

**Tasks**:
1. Stop legacy watcher (if running): `pkill -f jicm-watcher-legacy.sh` or kill via PID file.
2. Verify `.jicm-watcher.pid` cleared.
3. Copy v7.9 hook + script + state files from Jarvis-Dev → Jarvis (use protected-edit.py per dev-ops skill for `.claude/` paths).
4. Restart launcher: `bash .claude/scripts/launch-jarvis-tmux.sh` (will start new watcher).
5. Verify in Jarvis-Production session: `cat .claude/context/.jicm-state-hook.json` — should populate within seconds of first prompt.
6. Tag commit: `feat(jicm): v7.9 hardening — hook-based sensing, slim watcher, pluggable backend interface`.
7. Track Stage-2 metrics for 14 days. Source: `.claude/logs/jicm-watcher.log` + `.jicm-last-compression.json` history.

**Stage-2 gate (14d post-deploy)**:
- Cycle success rate ≥ 99% (failure = manual /clear required, or watcher crash, or restoration failure).
- Median compression time within 20% of v7.3 baseline.
- Zero "rendered status line ate the parser" failures (this class is structurally impossible now; verifies the architecture).
- Zero double-watcher incidents (singleton guard works in real conditions).
- User can identify zero JICM-related friction events.

If gate met: archive legacy watcher to `.claude/scripts/archive/`. v7.9 is the production baseline. Begin v8.0.

If gate failed: STAGE_2_HALT. Roll back to legacy watcher. Triage. Do not begin v8.0.

---

## v8.0 — Untether (PTY wrapper + self-installer)

### Phase 8.0.0 — Spec freeze

**Files**:
- `projects/project-aion/designs/jarvis-pty-spec.md` — NEW; CLI contract + protocol + socket schema
- `projects/project-aion/designs/jarvis-install-spec.md` — NEW; installer flow + bundle format

**Tasks**:
1. Write `jarvis-pty-spec.md`:
    - Six-command CLI contract (launch, escape, text, submit, capture, status, kill).
    - Socket protocol (length-prefixed JSON messages or simple newline framing — pick one and document).
    - PTY size handling (default 200×50; override via env).
    - Graceful shutdown semantics.
    - Logging format and rotation.
2. Write `jarvis-install-spec.md`:
    - Bundle layout (`jarvis-bundle-vX.Y.Z.tar.gz` contents).
    - Installer step list with idempotency notes.
    - Configuration file schema (`$HOME/.jarvis/config.toml`).
    - Service unit templates (launchd plist, systemd .service).
    - Smoke-test definition.

**Validation**:
- Both spec docs reviewed (User sign-off recommended).
- All decisions resolved before code is written.

**Gate**: spec freeze. Code matches spec or spec is updated; no drift.

---

### Phase 8.0.1 — `jarvis-pty` implementation

**Files**:
- `infrastructure/jarvis-pty/jarvis_pty.py` — single-file Python implementation
- `infrastructure/jarvis-pty/setup.py` — minimal packaging (or `pyproject.toml`)
- `infrastructure/jarvis-pty/test_jarvis_pty.py` — pytest suite
- `infrastructure/jarvis-pty/README.md` — usage doc

**Tasks**:
1. Implement `jarvis_pty.py` per spec:
    - `launch <cmd>` → fork/exec child in PTY via `pty.fork()`; daemonize parent; bind unix socket; relay PTY output to in-memory ring buffer (last 10000 lines); accept commands on socket.
    - `escape` / `text` / `submit` → connect to socket; send command; receive ack; exit.
    - `capture --lines N` → returns last N lines from ring buffer.
    - `status` → returns JSON: pid, uptime, last activity ts, command, socket path.
    - `kill` → SIGTERM to launched child; cleanup socket.
2. Write pytest suite covering:
    - Spawn-and-control of a known TUI (`bash` is fine; or `top -n 1` for non-interactive).
    - Round-trip text injection.
    - Capture returns expected lines.
    - Daemon exits cleanly on `kill`.
    - Socket path collision handling.
3. Manual smoke test: `jarvis-pty launch claude --dangerously-skip-permissions; jarvis-pty text "say hi"; jarvis-pty submit; jarvis-pty capture` — should show Claude responding.

**Validation**:
- pytest suite passes.
- Smoke test produces expected Claude output.
- Daemon survives 1h idle (no leak, no crash).

**Gate**: PTY wrapper works as a standalone tool, independent of JICM.

---

### Phase 8.0.2 — PTY backend for JICM

**Files**:
- `.claude/scripts/jicm-inject-pty.sh` — REPLACE placeholder with real implementation
- `.claude/scripts/dev/test-inject-backend.sh` — UPDATE to test both backends

**Tasks**:
1. Implement `jicm-inject-pty.sh` per roadmap §5.2 (4-line dispatcher to `jarvis-pty` CLI).
2. Update backend test script to run identical sequence against tmux and pty backends; verify identical observable effect.
3. Document switching procedure in `.claude/scripts/jicm-config.sh` comments.

**Validation**:
- Backend test passes for both backends.
- Switching `JICM_INJECTION_BACKEND` from `tmux` to `pty` mid-config works (after watcher restart).

**Gate**: PTY backend is functionally equivalent to tmux backend.

---

### Phase 8.0.3 — Stage-1 PTY parity harness

**Files**:
- `.claude/scripts/dev/jicm-v8-0-stage-1-harness.sh` — NEW
- `.claude/metrics/jicm/v8-0-stage-1-result-template.md` — NEW

**Tasks**:
1. Adapt v7.9 harness (Phase 7.9.5) to run identical 5-test suite under PTY backend instead of tmux.
2. Run both tmux and pty harness back-to-back; produce side-by-side comparison report.
3. Specifically test cross-OS: clone Jarvis-Dev to a Linux box (or run in a Docker container with full Claude Code install), run harness there.

**Validation**:
- 5/5 tests PASS under PTY backend (same as v7.9 baseline).
- 5/5 PASS on at least one Linux environment in addition to macOS.
- No behavioral divergence between backends in the verdict report.

**Stage-1 gate**: PTY backend ships with parity to tmux backend.

---

### Phase 8.0.4 — Self-installer

**Files**:
- `infrastructure/jarvis-install/jarvis_install.py` — single-file installer
- `infrastructure/jarvis-install/jarvis_bundle.py` — bundler (creates the tarball)
- `infrastructure/jarvis-install/templates/launchd.plist.template` — macOS service unit template
- `infrastructure/jarvis-install/templates/systemd.service.template` — Linux service unit template
- `infrastructure/jarvis-install/README.md` — install guide
- `docs/install/macos.md`, `docs/install/linux.md`, `docs/install/wsl.md` — per-OS notes

**Tasks**:
1. Implement `jarvis_bundle.py`:
    - `python jarvis_bundle.py --version 8.0.0 --output ./dist/`
    - Reads `.gitignore` and a `bundle-exclude.txt` to skip secrets/state/large infra files.
    - Produces `jarvis-bundle-v8.0.0.tar.gz` and a SHA256 sidecar.
2. Implement `jarvis_install.py` per roadmap §5.3 (12 steps).
    - `--target` (required), `--profile {production,dev}`, `--upgrade`, `--reconfigure`, `--no-service`, `--dry-run`.
    - Each step idempotent. `--dry-run` prints the plan without execution.
    - Smoke test in step 11 launches `claude --version` under PTY wrapper, confirms output, kills.
3. Write per-OS install docs.
4. Test on macOS Studio (current dev box).
5. Test on a clean Linux Ubuntu 22.04 VM (e.g. UTM Ubuntu image; provision specifically for this test).
6. Test on Windows 11 + WSL2 Ubuntu (use existing DF-Windows VM as a borrowed test bed if practical, or provision a separate WSL host).

**Validation**:
- Installer produces a working Jarvis on each target OS.
- `--upgrade` from v7.9 to v8.0 succeeds without losing state (`.claude/context/`, `.jicm-state-hook.json`, etc.).
- `--reconfigure` resets paths cleanly.
- Smoke test catches install corruption (manually break a path, verify install fails fast).

**Gate**: installer ships. Self-update path works.

---

### Phase 8.0.5 — Stage-2 deployment

**Tasks**:
1. Tag release: `v8.0.0`. Generate `jarvis-bundle-v8.0.0.tar.gz`.
2. Deploy on at least one non-tmux Jarvis instance (Linux VM is the test target; "deploy" = run `jarvis-install` and live with it).
3. Track Stage-2 metrics for 14 days from non-tmux deployment:
    - Cycle success rate ≥ 99% under PTY backend.
    - PTY wrapper uptime ≥ 99.5% (no spontaneous crashes).
    - No backend fallback events (or at most 1, with documented cause).
4. Write Stage-2 verdict in `.claude/metrics/jicm/v8-0-stage-2-result-YYYY-MM-DD.md`.
5. If gate met: v8.0 promotes to default for new installs; existing tmux users can opt in via `JICM_INJECTION_BACKEND=pty`.

**Stage-2 gate**: PTY-backend Jarvis runs hands-free for 14d. Self-installer reproducibly stands up Jarvis on at least 2 OSes.

---

## Cross-Phase Operations

### Branch + commit strategy

| Work | Branch | Commit pattern |
|---|---|---|
| v7.9 hooks (7.9.1) | Jarvis-Dev `dev`, then Jarvis `Project_Aion` after Stage-1 | `feat(jicm): hook layer for v7.9 — gate, stop, precompact, restore-signal` |
| v7.9 backend abstraction (7.9.2) | Same | `feat(jicm): pluggable injection-backend interface (tmux backend)` |
| v7.9 slim watcher (7.9.3) | Same | `feat(jicm): rewrite watcher as slim signal-driven actuator (~5KB)` |
| v7.9 status line (7.9.4) | Same | `feat(jicm): v7.9 status line reading .jicm-state-hook.json` |
| v7.9 harness (7.9.5) | Jarvis only | `test(jicm): v7.9 stage-1 autonomous harness + verdict template` |
| v7.9 production deploy (7.9.6) | Jarvis only | `feat(jicm): promote v7.9 — hook-sensing + slim watcher + pluggable backend` |
| v8.0 specs (8.0.0) | Jarvis | `docs(jicm): jarvis-pty + jarvis-install specs for v8.0` |
| v8.0 PTY wrapper (8.0.1) | Jarvis-Dev → Jarvis | `feat(jarvis-pty): single-file PTY wrapper with unix-socket control` |
| v8.0 PTY backend (8.0.2) | Same | `feat(jicm): pty injection backend (parity with tmux backend)` |
| v8.0 harness (8.0.3) | Jarvis | `test(jicm): v8.0 stage-1 PTY parity harness + cross-OS run` |
| v8.0 installer (8.0.4) | Jarvis | `feat(jarvis-install): self-installer with launchd/systemd unit generation` |
| v8.0 production deploy (8.0.5) | Tag `v8.0.0` | `release(jarvis): v8.0.0 — PTY backend + self-installer + cross-OS support` |

### Two-stage gate boundaries

Per `.claude/context/patterns/two-stage-validation-gating.md`:

| Stage gate | Effort class | Stage-1 window | Stage-2 window |
|---|---|---|---|
| v7.9 production promotion | per-deploy | 48h regression-catch on Jarvis | 14d real-usage validation |
| v8.0 production promotion | per-deploy + cross-OS | 48h Stage-1 PTY parity + cross-OS smoke | 14d non-tmux deployment validation |

A failure in v7.9 Stage-1 halts v7.9 work; v8.0 work cannot start. A failure in v8.0 Stage-1 halts v8.0 only — v7.9 is unaffected (orthogonal stream per the gating pattern §10.4).

### Risks specific to this plan

| Risk | Phase | Mitigation |
|---|---|---|
| Stop hook does not fire reliably across model changes | 7.9.0 baseline | Phase 7.9.0 task #5 verifies; if unreliable, fall back to UserPromptSubmit-only triggering with "next-prompt-actuates" semantics (one extra prompt of latency, but no Stop dependency) |
| Two watchers run concurrently during transition | 7.9.6 | Migration step 1 explicitly stops legacy watcher before starting new |
| `jarvis-pty` daemon crashes unnoticed during 14d Stage-2 | 8.0.5 | `jicm-watcher.sh` checks `jarvis-pty status` on each cycle; on failure writes `.jicm-state-hook.json.last_action: BACKEND_DOWN` and (if available) falls back to tmux backend |
| Self-installer leaves a partial install | 8.0.4 | All steps idempotent; `--reconfigure` clean; explicit FAILURE state never destroys existing data |
| Stage-2 metrics insufficient on non-tmux instance (low usage) | 8.0.5 | Use Linux VM as automated traffic generator: scheduled `claude -p "..."` invocations to drive cycles |

### Rollback procedures

| Rollback | Mechanism |
|---|---|
| v7.9 → v7.x | Stop new watcher; copy `jicm-watcher-legacy.sh` → `jicm-watcher.sh`; restart launcher; revert `.claude/settings.json` hook registrations |
| v8.0 → v7.9 | Set `JICM_INJECTION_BACKEND=tmux` in environment; restart watcher; PTY backend dormant but harmless |
| Failed install | `jarvis-install --target $X --uninstall` removes Jarvis files but preserves user state (`.jicm-state-hook.json`, scratch, secrets) |

---

## Plan Lifecycle

This plan is the work contract for v7.9 and v8.0. As phases ship:

1. Mark each phase **DONE** in this file (inline checkbox or status header).
2. Link to the merge commit / verdict report from the phase header.
3. When v7.9 ships: archive Stage-1 + Stage-2 verdicts under `.claude/metrics/jicm/`; tag commit; update roadmap doc.
4. When v8.0 ships: same; archive this plan to `projects/project-aion/plans/archive/` with completion date suffix.

Future planning (v8.1 web, v8.2 IDE, multi-session JICM, dashboard widgets) gets a NEW plan doc; do not extend this one.

---

*JICM Implementation Plan v7.9 → v8.0 — 2026-05-02 — Approved per User direction*
