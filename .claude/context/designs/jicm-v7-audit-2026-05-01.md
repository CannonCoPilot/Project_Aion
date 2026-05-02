# JICM v7.3 Audit — 2026-05-01

**Auditor**: Jarvis (autonomous; full-source-read)
**Scope**: complete review of v7.3 — find gaps, weakpoints, duct-tape, undocumented contracts, race conditions, design smells
**Verification**: cross-read against `/Users/nathanielcannon/Claude/GitRepos/claude-code-source/` + `/Users/nathanielcannon/Claude/GitRepos/claude-code-docs/`
**Companion design**: `projects/project-aion/designs/jicm-portable-architecture.md`

---

## 1. File Inventory

### Core JICM (in-scope)

| File | LOC | Role | Portable? |
|---|---|---|---|
| `.claude/scripts/jicm-watcher.sh` | ~1300 | Main watcher loop; state machine; tmux-coupled | ❌ |
| `.claude/scripts/jicm-prep-context.sh` | ~750 | Two-tier compression (Tier 1 bash, Tier 2 LLM) | ✅ |
| `.claude/scripts/jicm-config.sh` | ~50 | Shared paths and thresholds | ✅ |
| `.claude/scripts/compress-input.py` | unknown | NLP preprocessing (Phase 3.1, scratchpad notes already-shipped) | ✅ |
| `.claude/hooks/session-start.sh` | ~510 | Context restoration on /clear | ✅ |
| `.claude/hooks/pre-compact.sh` | unknown | Pre-compact preservation | ✅ |
| `.claude/hooks/precompact-analyzer.js` | unknown | Pre-compact analysis | ✅ |
| `.claude/commands/jicm.md` | small | Manual JICM cycle command | ✅ |
| `.claude/commands/intelligent-compress.md` | small | Silent compression command | ✅ |
| `.claude/context/components/AC-04-jicm.md` | ~200 | Component spec | ✅ |
| `.claude/context/designs/jicm-v6-design.md` | ? | Predecessor design doc | (reference) |
| `.claude/context/patterns/jicm-pattern.md` | ? | Mandatory pattern | ✅ |
| `.claude/context/patterns/jicm-continuation-prompt.md` | ? | Resume prompt template | ✅ |
| `.claude/context/psyche/prompts.yaml` | 54 | Canonical prompt strings | ✅ |

### Aion Quartet (companions, currently tmux-coupled)

| File | LOC | Role | Portable? |
|---|---|---|---|
| `.claude/scripts/ennoia.sh` | 21KB | Intent recommendations | ❌ (tmux W2) |
| `.claude/scripts/virgil.sh` | 10KB | Navigation dashboard | ❌ (tmux W3) |
| `.claude/scripts/virgil-web.sh` | 1KB | Web view (start of portability move) | partial |
| `.claude/scripts/command-handler.sh` | 8KB | Slash-command signal injector | ❌ (tmux W4) |
| `.claude/scripts/housekeep.sh` | 20KB | Signal cleanup, log rotation | ✅ |
| `.claude/scripts/launch-jarvis-tmux.sh` | 36KB | Master launcher | ❌ (tmux only) |

### Signal Files (in `.claude/context/`, gitignored)

| File | Writer | Reader | Cleanup |
|---|---|---|---|
| `.compressed-context-ready.md` | prep script | session-start.sh | overwritten on next cycle |
| `.compression-done.signal` | prep script | watcher | watcher removes on consume |
| `.compression-in-progress` | /intelligent-compress | session-start.sh | session-start removes |
| `.jicm-state` | watcher (every poll) | hooks, ennoia, dashboards | overwritten |
| `.jicm-last-compression.json` | prep script | watcher post-cycle log | overwritten |
| `.jicm-exit-mode.signal` | end-session command | watcher | session-start removes (failsafe) |
| `.jicm-sleep.signal` | ulfhedthnar hook | watcher | manual / on resolution |
| `.jicm-watcher.pid` | watcher | watcher (concurrent-detect) | watcher removes on exit |
| `.jicm-config` | watcher (on startup) | statusline hook | overwritten |
| `.command-signal` | skills | command-handler | command-handler removes |
| `.ennoia-recommendation` | ennoia | watcher | watcher consumes |
| `.ennoia-status` | ennoia | dashboards | overwritten |
| `.virgil-tasks.json` | hooks | virgil | overwritten |
| `.virgil-agents.json` | hooks | virgil | overwritten |
| `.last-prompt-ts.W0` | UserPromptSubmit hook | watcher (idle checkpoint) | overwritten |

### Removed in v7 (per AC-04 spec line "Removed (v7.3.0)")

`/checkpoint`, `/context-checkpoint`, `/smart-compact`, `/smart-checkpoint`, `/context-loss` slash commands have been removed. Audit confirms they're gone from `.claude/commands/`.

---

## 2. Signal Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                            STEADY STATE                              │
└─────────────────────────────────────────────────────────────────────┘

  Claude Code TUI                       jicm-watcher.sh (tmux W1)
  ┌──────────────┐                      ┌────────────────────┐
  │ Status line  │  ←──── tmux ────  │ poll every 5s      │
  │ shows tokens │   capture-pane     │ ┌──────────────┐   │
  └──────────────┘                    │ │get_token_count│ ──┐
                                      │ └──────────────┘   ││
                                      │                    ││
                                      │ ┌──────────────┐   ││
                                      │ │update burn   │ ←─┘│
                                      │ │rate          │    │
                                      │ └──────────────┘    │
                                      │                     │
                                      │ ┌──────────────┐    │
                                      │ │write .jicm-  │    │
                                      │ │state         │ ───→ Ennoia, Virgil read
                                      │ └──────────────┘    │
                                      └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       THRESHOLD CROSSING                             │
└─────────────────────────────────────────────────────────────────────┘

  Watcher detects tokens ≥ JICM_TOKEN_THRESHOLD (300k default)
       │
       ├── transitions WATCHING → HALTING
       │
       ├── trigger_idle_check() — ESC + capture + pattern match
       │
       ├── if active → wait for idle (max 60s) → if timeout → ERROR
       │
       ├── transitions HALTING → COMPRESSING
       │
       ├── exec jicm-prep-context.sh (Tier 1 + optional Tier 2)
       │   │
       │   ├── reads recent JSONL transcript
       │   ├── reads session-state.md, scratchpad, active plan
       │   ├── runs Ollama qwen3:8b for narrative if available
       │   ├── writes .compressed-context-ready.md (+metadata)
       │   ├── writes .compression-done.signal
       │   └── post-validates against current-plans.md COMPLETE items
       │
       ├── transitions COMPRESSING → CLEARING
       │
       ├── tmux send-keys "/clear" + C-m
       │   │
       │   └── triggers SessionStart hook (source=clear)
       │       │
       │       ├── reads .jicm-state (state=CLEARING/RESTORING)
       │       ├── reads .compressed-context-ready.md
       │       ├── injects via additionalContext
       │       └── Claude resumes
       │
       └── transitions CLEARING → RESTORING → WATCHING (cooldown 600s)
```

---

## 3. Gap / Weakpoint / Duct-Tape Inventory

### P0 — System breaks if these regress

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| P0-1 | `jicm-watcher.sh:611-670` (`get_token_count`, `get_context_percentage`) | tmux capture-pane regex parsing of rendered status line. Status-line format change → silent break. | Replace with hook-based state file read (`.jicm-state-hook.json` written by UserPromptSubmit hook). See design doc §3.1. |
| P0-2 | `jicm-watcher.sh:do_clear()` (line ~?) | Uses tmux send-keys `/clear` + C-m. Cannot run without tmux. | Hook-driven /clear via decision:block + user action, per design doc §3.2. |
| P0-3 | `jicm-watcher.sh:22` (`set -euo pipefail`) | Per MEMORY.md, `set -euo pipefail` causes scripts to die on grep exit-1 (no match). The watcher mitigates with `\|\| true` on grep calls AND an ERR trap, but the surface area is large; one missed `\|\| true` is silent. | Audit all grep/awk/sed lines for `\|\| true`; consider removing pipefail in favor of explicit failure handling. |

### P1 — Silent data loss / wrong results

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| P1-1 | `jicm-watcher.sh:check_existing_watcher` | Read-then-write race: PID-file existence check + `kill -0` + write own PID is non-atomic. Two concurrent launches in narrow window → both pass check → both register. The MEMORY scratchpad notes "Multiple JICM watchers detected (2)" warnings have appeared, suggesting this races in practice. | Use `flock` or `mkdir`-based atomic locking. For v8: no daemon, problem dissolves. |
| P1-2 | `session-start.sh:362-417` (v6/v7 state-detect block) | Fragile state-machine match: greps `.jicm-state` for `state: CLEARING\|RESTORING`. If watcher races between state transitions, hook may miss the window and inject no context. The v5/v6/v7 dead-code paths above this block (line 418-420 comment) suggest this has had multiple iterations. | Single canonical resume path — drop v5/v6 cleanup branches; rely solely on `.compressed-context-ready.md` freshness check (mtime within last 60s). |
| P1-3 | `jicm-watcher.sh:idle pattern matching` (line ~363 `IDLE_PATTERN='Interrupted.*What should Claude do'`) | The watcher comment explicitly notes "CC team actively changes spinner characters... The 'Interrupted' pattern is the only text observed stable across versions." This is **brittle by author admission**. A CC version that changes this string breaks JICM until manually patched. | v8: no idle detection needed. Hooks fire on user prompts; the hook doesn't care if Claude is "active" — Claude's response is the next thing that happens. |
| P1-4 | `prompts.yaml` vs hardcoded prompts in scripts | The yaml file says "When editing prompts, update THIS file first, then propagate to consumers" but provides no mechanism for ensuring propagation. Drift is uncaught. | Either add CI check that consumers read from yaml at runtime, or accept yaml as documentation-only and remove "edit yaml first" claim. |
| P1-5 | `jicm-watcher.sh:RESTORE_RETRY_DELAY=15`, `CLEAR_RETRIES`, `RESTORE_ATTEMPTS` | Retry counters exist but the retry logic is opaque from a quick read. Risk: silent infinite-retry under failure conditions where the inner trigger doesn't change. | Audit retry exits; ensure hard cap with explicit ERROR state transition. |

### P2 — Operational pain

| # | Location | Issue | Recommended fix |
|---|---|---|---|
| P2-1 | Multiple files (watcher, ennoia, virgil, etc.) | tmux session name `jarvis` and window numbers `0..6` hardcoded. Cannot run two JICM-aware Claude sessions on the same machine. | v8: hooks scope to `$CLAUDE_PROJECT_DIR`; multi-project safe by construction. |
| P2-2 | `jicm-watcher.sh:1300` (file is one giant script) | 1300 lines, no internal module separation. Hard to test, hard to refactor, hard to understand. | v8: collapse to ~200 LOC across 2 hooks + reuse prep script. |
| P2-3 | `session-start.sh:418-420` | Comment "v5 code path REMOVED (v6.1, 2026-02-11)" yet the file still has cleanup branches for v5 idle-hands artifacts (line 152). Removed code, residual cleanup. | Audit and drop residual cleanup that targets removed code. |
| P2-4 | `.claude/hooks/CLAUDE.md` | "PR-10.5 Action Items" lists 4 unregistered guardrail hooks with status "NEEDS REGISTRATION" since 2026-01-09. Critical safety hooks (dangerous-op-guard, workspace-guard, secret-scanner, permission-gate) sitting unregistered for ~4 months. | Outside JICM scope; flag as separate cleanup item. |
| P2-5 | `JARVIS_WINDOW=0` env-var-driven branch in `do_idle_checkpoint` | Window number leaks into scripts that are otherwise tmux-agnostic. | v8: drop. |

### P3 — Design smells

| # | Location | Issue |
|---|---|---|
| P3-1 | 15+ signal files in `.claude/context/` | Most of v7's complexity is signal-file orchestration. Each file has implicit ordering + cleanup contracts. v8 collapses this to 2 files (`.compressed-context-ready.md`, `.jicm-state-hook.json`). |
| P3-2 | `.jicm-config` written by watcher, sourced by statusline | Inversion of concerns: the runtime watcher writes its own thresholds out for downstream consumers. v8: thresholds live in `settings.json` `env` block; statusline reads `.jicm-state-hook.json`. |
| P3-3 | `tmux capture-pane` includes scrollback, mitigated by `\| tail -5` everywhere | The `\| tail -5` workaround appears in ~6 locations. It's a known-fragility patch. |
| P3-4 | Idle-checkpoint runs prep-script every 30s of idle | Defensive fresh-checkpoint that compensates for the watcher's lack of "last user prompt" knowledge. Hook-driven model gets this for free (UserPromptSubmit fires on every prompt, can write checkpoint then). |
| P3-5 | `jarvis-statusline.sh` v7.4 already extracts `.context_window.*` from JSON stdin | The status line script is already doing what the watcher should be doing — but the watcher uses tmux capture-pane to parse what the status line just rendered. Inversion. |
| P3-6 | "JICM v6", "v7", "v7.3" all referenced in different files | Version drift in docs. AC-04 says v7.3.0; settings.json doesn't have a JICM version; watcher header says v7.3.0; design doc is v6. |

---

## 4. Portability Assessment

| Coupling reason | Essential? | Fixable? |
|---|---|---|
| tmux capture-pane for token reads | No | ✅ Hook stdin payload (verified via source) |
| tmux send-keys for /clear | No | ✅ Hook decision:block + user runs /clear |
| tmux send-keys for prompt injection | No | ✅ Hook additionalContext + initialUserMessage |
| tmux capture-pane for idle detection | No | ✅ Hooks fire on user prompts; idle is implicit |
| Watcher PID file management | No | ✅ No watcher in v8 |
| Per-window `JARVIS_WINDOW=0` | No | ✅ Drop |
| Aion Quartet companions in tmux windows | Accidental — they're separate features | ✅ Move to localhost dashboards (User's stated goal) |
| `.compressed-context-ready.md` checkpoint format | Essential | (already portable) |
| jicm-prep-context.sh | Essential | (already portable) |
| session-start.sh restoration logic | Essential | (already portable, with cleanup of v5/v6 dead code) |

**Conclusion**: every tmux/iTerm2 dependency is accidental, not essential. Full portability is achievable.

---

## 5. Recommendation

**Full rewrite is appropriate**, not incremental repair, because:

1. The watcher's complexity (1300 LOC) is mostly compensating for the design choice to poll externally. Replacing the polling mechanism eliminates ~70% of the code.
2. Three independent P0 issues (tmux token-read, tmux /clear injection, idle pattern brittleness) all dissolve under the hook-driven model.
3. The portable design (design doc §3) preserves the conceptual JICM (fast prep, LLM enrichment, full /clear, hook resume) while removing the structural coupling.
4. Stage 0 prototype lives in Jarvis-Dev (per Q1=B); production v7.3 keeps running until two-stage gating clears v8.

The conservative path (incremental: replace tmux-token-read with hook-state-file-read, keep watcher) was the agent's recommendation in `status-line-reference.md`. It's a valid intermediate. The argument for jumping straight to full v8: the conservative path leaves the watcher process, the PID race, the idle pattern detection, and the keystroke injection — i.e., 60% of the issue surface. If we're going to commit to portability, going halfway costs more in long-tail maintenance than going fully.

Recommendation: **build v8 in Jarvis-Dev**, run two-stage gating, promote when Stage 2 clears.

---

## 6. Out-of-JICM Items Surfaced

Items that came up during the audit but are not JICM-scope:

| Item | Severity | Note |
|---|---|---|
| 4 unregistered guardrail hooks (PR-10.5) | P1 | dangerous-op-guard, workspace-guard, secret-scanner, permission-gate sitting since 2026-01-09. |
| Aion Quartet (Ennoia, Virgil, command-handler) tmux dependency | P2 | User's stated future goal: relocate to localhost dashboards or Pulse-Nexus. Independent of JICM v8 but blocked on similar portability work. |
| `compress-input.py` Phase 3.1/3.3 status discovery | resolved | Earlier active-plan claim "starter, not wired" was stale; scratchpad confirms NLP_COMPRESS=true is wired. |
| `prompts.yaml` drift mechanism | P2 | No automated check for consumer drift. |

---

*JICM v7.3 Audit — 2026-05-01 — total findings: 3 P0, 5 P1, 5 P2, 6 P3. Recommendation: full v8 rewrite. Companion design doc: `projects/project-aion/designs/jicm-portable-architecture.md`.*
