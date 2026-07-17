# Project Aion — Full-Platform Review: Subsystem Reports (2026-07-15/16)

**Method**: 8 parallel deep-review agents + 1 plans-triage sub-agent, each strictly read-only, each verifying claims against actual file contents (file:line cited) and live system state (ps/launchctl/docker/curl/sqlite read-only probes). Coordinated by Jarvis-dev (W5). All findings severity-tagged: P0 broken/blocking/exposed · P1 major · P2 minor · P3 polish.

**Companion document**: `projects/project-aion/production-readiness-roadmap.md` (the synthesized program).

---

## SUBSYSTEM 1 — JICM & CONTEXT AUTOMATION

### Inventory

| Component | Path (`.claude/` = repo `.claude/`) | Purpose | Invoked by | State |
|---|---|---|---|---|
| jicm-config.sh | `.claude/scripts/jicm-config.sh` | Shared paths/thresholds (v7.9) | sourced by watcher, hooks, prep | WORKING |
| jicm-gate.sh | `.claude/hooks/jicm-gate.sh` | Sensing: JSONL→`.jicm-state-hook.json` | settings.json UPS:161 | **PARTIAL** (P0 window table) |
| jicm-stop.sh | `.claude/hooks/jicm-stop.sh` | Writes `.jicm-clear-now.signal` on pending | settings.json Stop:85 | WORKING |
| jicm-watcher.sh (v7.9) | `.claude/scripts/jicm-watcher.sh` | Signal-driven actuator + refresh/REST/MAINTAIN | launch-aion.sh (live PID 10627, aion:8) | **PARTIAL** |
| jicm-watcher-hud.sh | `.claude/scripts/jicm-watcher-hud.sh` | Live dashboard (aion:2, PID 11003) | launch-aion.sh | PARTIAL |
| jicm-inject.sh / -tmux.sh | `.claude/scripts/` | Injection dispatcher + tmux backend | watcher | WORKING |
| jicm-inject-pty.sh | `.claude/scripts/jicm-inject-pty.sh` | v8 PTY backend | dispatcher | STUB (exit 2 by design) |
| jicm-prep-context.sh | `.claude/scripts/jicm-prep-context.sh` | Two-tier checkpoint builder | watcher, 2 hooks, 2 commands, session-start | **PARTIAL** (session targeting) |
| jicm-state-update.sh | `.claude/scripts/jicm-state-update.sh` | Atomic state writes | gate, stop | WORKING |
| jicm-auto-ingest.py / compress-input.py / compress-jsonl.py | `.claude/scripts/` | L4 RAG ingest; NLP + JSONL stage-1 compression | watcher / prep | WORKING (fresh logs/stats Jul 15) |
| session-start.sh (JICM branch) | `.claude/hooks/session-start.sh:365-469` | Resume injection + `.jicm-resume-complete.signal` | settings.json SessionStart | WORKING |
| pre-clear-context-prep.sh | `.claude/hooks/pre-clear-context-prep.sh` | Prep before user /clear | settings.json UPS:165 | PARTIAL (no W5 guard) |
| jicm-precompact.sh | `.claude/hooks/jicm-precompact.sh` | Prep before native compact | settings.json PreCompact:70 | WORKING (stale header) |
| `/jicm`, `/intelligent-compress` | `.claude/commands/` | Manual cycle triggers | user | WORKING (stale "jarvis:1" refs) |
| `/context-analyze,-budget`, `/autocompact-threshold`, `/idle-hands` | `.claude/commands/` | Analysis/config/toggles | user | WORKING (unverified depth) |
| token-compression skill | `.claude/skills/token-compression/` | Benchmark harness | user | WORKING |
| jarvis-statusline-v9.sh | `.claude/scripts/` | Live statusline (settings.json:39); prefers stdin `context_window` — shows truth | Claude Code | WORKING |
| jarvis-statusline-v8.sh | `.claude/scripts/` | Superseded | nothing | DEPRECATED-REMNANT |
| jarvis-statusline.sh, statusline-debug-capture.sh, update-context-cache.sh | `.claude/scripts/` (symlinks) | → `/Users/aircannon/...` (user doesn't exist) | nothing | **BROKEN** |
| jarvis-watcher.sh (v5.8.5, 86KB), jicm-watcher-legacy-v7-3.sh (57KB) | `.claude/scripts/` | Prior watchers | nothing | DEPRECATED-REMNANT |
| context-monitor.sh, downtime-detector.sh, background-context-capture.sh, capture-token-count.sh, archive-session-state.sh, launch-watcher.sh, stop-watcher.sh, signal-with-capture.sh, statusline-context-capture.sh, token-compression-reminder.sh | `.claude/scripts/` | v5/v6-era mechanisms | nothing live | UNWIRED |
| cache-mechanics-v4/v5*.py (6 files, ~126KB) | `.claude/scripts/` | May-2026 cache experiments; findings archived in reports | nothing | UNWIRED (dead weight) |
| cost-anomaly-watcher.sh | `.claude/scripts/` | Writes `.cost-state.json` for HUD | launchd (PID 2878) | WORKING |
| compression-agent, context-compressor, jicm-agent, compression-agent-preassembled | `.claude/agents/_archive/`, `_disabled/` | v6 LLM-compression path | still **registered** as agent types (subdirs scanned) | DEPRECATED-REMNANT |
| Orphan state files | `.claude/context/.jicm-config`, `.jicm-status.json`, `.jicm-state` | v7.2/v7.3 leftovers | legacy readers only | DEPRECATED-REMNANT |

Repo-rule compliance: all JICM scripts use `set -o pipefail` only (no `-euo`) — compliant. No secrets found in scope.

### Findings

**[P0] JICM failed its core mission on the live W0 session — window model stale for Fable 5.** W0's pane (aion:0) reads "257503 tokens / **100% context used**" while `.jicm-state-hook.json` says `used_percentage: 25, action: WATCHING`. Root: `jicm-gate.sh:140-148` window lookup knows only opus/sonnet/haiku and defaults to 1,000,000; launcher now defaults to `claude-fable-5` (commit 3949579). With hard threshold 300K (`jicm-config.sh:59`) above the model's real ceiling (~257K), `check_autonomous_threshold` (`jicm-watcher.sh:697`) is mathematically unreachable. Loop log proves it: `soft-threshold (no fire): tokens=255204` every 10 min from 14:54 to 22:21 while W0 sat saturated. The v7.3 TUI failsafes ("Context limit reached" → auto-/clear; emergency compact ≥73%) that would have caught this were dropped in the v7.9 slim rewrite (`jicm-watcher.sh:10-12` — no pane parsing) yet are still documented as live in `AC-04-jicm.md:63-67`. Failure scenario: exactly what is on screen now — Jarvis locked out, autonomic layer reporting all-clear.

**[P1] Cross-session checkpoint contamination (W5→W0).** `.jicm-last-compression.json` shows the current checkpoint was built at 03:33Z from the **W5 dev session's** transcript. `jicm-prep-context.sh:128-185` (`find_best_jsonl`) never consults `.current-w0-uuid` (defined `jicm-config.sh:35`); its message-count path picks whichever session was recently active. Gate/stop hooks exclude W5 (`jicm-gate.sh:84`, `jicm-stop.sh:56`) but `pre-clear-context-prep.sh:29-38` and `jicm-precompact.sh` have **no** role guard, so W5-side /clear or compact rebuilds W0's checkpoint from W5 content. Scenario: W0's next JICM resume injects the dev session's context into the master session.

**[P1] Stale `.compression-done.signal` makes the next autonomous cycle skip fresh compression.** Prep writes the signal unconditionally (`jicm-prep-context.sh:692`); only cycle step 9 removes it (`jicm-watcher.sh:337`). A signal from the 21:33 non-cycle prep run is on disk now; the next autonomous cycle's step 4 (`jicm-watcher.sh:173`) will log "prep skipped (signal/guard already present)" and /clear against an hours-old (and here W5-contaminated) checkpoint. Manual commands defend themselves (`commands/jicm.md` Step 3 clears stale signals); the autonomous path lacks the same hygiene.

**[P1] REST stage triggers are broken in both directions.** Idle path is dead: the watcher's own `refresh_state_from_jsonl` rewrites `.ts_epoch` every ~5s (`jicm-watcher.sh:386-387`), and `rest_should_trigger` reads that same field as "last prompt time" (`jicm-watcher.sh:423-426,443`) → idle_sec ≈ 0 forever. Actual firing is by date-marker rollover: `.rest-ran-2026-07-15` mtime is **00:00:01** — REST fires at midnight via accumulated tool-delta, then R3/R5 inject prompts into W0 (`jicm-watcher.sh:526-549`) regardless of user presence or context saturation. Also spurious-fires on every watcher restart (`REST_TOOLS_AT_LAST_REST=0` at `jicm-watcher.sh:421`).

**[P1] No watchdog for the watcher.** Singleton PID guard exists (`jicm-watcher.sh:37-47`), but nothing restarts a dead daemon; `session-start.sh:256-265` only appends a warning note, and the HUD shows DEAD only if window 2 is looked at (`jicm-watcher-hud.sh:442-444`). Scenario: watcher dies mid-day → all autonomic context management silently stops until next launch.

**[P2] Cycle degradations terminate as success without alerting** — contra the No-Silent-Degradation guardrail's ALERT requirement: HALT-ack timeout → proceed (`jicm-watcher.sh:169`), prep timeout → "proceeding with possibly stale checkpoint" (`:185`), resume timeout → "sending RESUME anyway" (`:318`); step 9 then wipes all signals (`:337-338`) leaving no pending evidence. Log-only, no Sir/Jarvis notification.

**[P2] State-file read-modify-write race.** Gate writes atomically (`jicm-state-update.sh:41-46`), but the watcher's refresh does read→patch→mv (`jicm-watcher.sh:369-390`); a gate write landing in between is clobbered (can lose `pending_action`/`session_id`). Partially backstopped by the autonomous check; still a lost-trigger window every 5s.

**[P2] HUD context gauge wrong-by-inheritance.** HUD recomputes pct against the state file's 1M window (`jicm-watcher-hud.sh:343,385-387`) → shows 25% while the TUI shows 100%. Process/signal/quartet panels are truthful. `LEGACY_STATE` row reads `.jicm-state` (last written 2026-05-04; retired at 7.9.6c per `jicm-watcher.sh:135-137`) — cosmetic staleness.

**[P2] Brittle negative-only session identification.** W5 exclusion rests entirely on env `JARVIS_SESSION_ROLE=dev` propagation; hardcoded `JARVIS_W5_UUID` at `jicm-gate.sh:83` is dead code (never referenced). `.current-w0-uuid` (fresh, correct) is written by `session-start.sh:50-56` (gated on `JARVIS_WINDOW` defaulting to "0" — any manually launched session without the env clobbers it) but is **read by no JICM sensing/prep component**. Positive UUID matching would close both the contamination and this fragility.

**[P2] `cache_hit_rate` in state is wrong** (0.0000 vs ~0.996 truth): watcher refresh patches token fields but never recomputes hit-rate (`jicm-watcher.sh:379-388`), preserving a zero from a gate run that saw no usage in `tail -200`. Token-compression metrics consuming this field read garbage.

**[P2] Deprecated v6 agents still registered**: `_archive/`/`_disabled/` under `.claude/agents/` are scanned, so compression-agent/context-compressor/jicm-agent remain spawnable. No hook/command invokes them (grep clean) — dormant but discoverable.

**[P3]** Broken pre-migration symlinks to nonexistent `/Users/aircannon/` (3 files in scripts dir). Stale "tmux **jarvis**:1" instructions in `/jicm` and `/intelligent-compress` (session renamed `aion`; watcher lives at window 8); `jicm-inject-tmux.sh:21` default target `jarvis:0` (masked by watcher env). HALT-ack check can false-positive on the prompt's own echo (`jicm-watcher.sh:131,158,166`). `jicm-precompact.sh:3,17-19` claims "v8.0" and 30%/65% thresholds. Double "watcher exiting" trap lines (`jicm-watcher.sh:47`). `session-start.sh:383` vestigial `if true; then`. AC-04 documents an "Idle checkpoint 30s" trigger (`AC-04-jicm.md:67`) that v7.9 no longer implements. Only test artifact is v6-era `.claude/tests/test-jicm-v6.sh` — zero v7.9 tests.

### Unbuilt register

| Item | Source | Bucket |
|---|---|---|
| Watcher/worker split: job queue, atomic claim, retry+backoff, per-job logs | `.claude/plans/jicm-watcher-worker-split.md` ("PLAN — not started") | designed |
| v8.0 PTY injection backend (`jarvis-pty` daemon, socket protocol) | `jicm-inject-pty.sh` placeholder; prototype validated 6/6 per AC-04 §10 | started |
| Ingest retry semantics (Graphiti/RAG failures currently fire-and-forget) | worker-split plan §1.4 | designed |
| HUD job-queue panel + Alfred Pulse failure surfacing | worker-split plan Phase 5 | designed |
| Unit-test harness for threshold/polling logic | worker-split plan §6 | ideated |
| Model-window auto-detection (fable-aware sensing) | nowhere — the P0 gap has no design doc | absent |
| REST as genuinely idle-triggered micro-meditation | implemented but both triggers defeated | built-not-hardened |
| Autonomous threshold on %-of-real-window (not absolute tokens only) | partially implied | ideated |

### Verdict

Sensing: **NOT-READY** (window model stale for deployed model; the one job — fire before lockout — demonstrably failed on live W0). Watcher actuator: NEEDS-WORK. Prep pipeline: NEEDS-WORK (session targeting unsafe). Resume path: READY. HUD: NEEDS-WORK. Injection (tmux): READY. Hygiene: NEEDS-WORK (~15 unwired scripts ~350KB, 3 broken symlinks, spec drift).

Top 5: (1) fix window sensing for live model + %-of-real-window trigger + restore TUI-saturation failsafe; (2) positively scope sensing/prep to W0 via `.current-w0-uuid`, add role/UUID guards to pre-clear/precompact hooks; (3) stale-signal hygiene in autonomous cycle; (4) repair REST triggers + route cycle degradations to a real alert channel; (5) watchdog for the watcher + purge dead scripts/symlinks/docs.

---

## SUBSYSTEM 2 — HOOKS & SETTINGS WIRING

### Wiring map

**Jarvis — `.claude/settings.json`** (tracked, v1.2; 23 matcher groups / 26 commands). All scripts exist and are executable; all `$CLAUDE_PROJECT_DIR`-relative.

| Event | Matcher | Script | State |
|---|---|---|---|
| Setup | "" | setup-hook.sh | WORKING (bash-3.2 safe) |
| SessionStart | "" | session-start.sh | WORKING (caveat: `curl wttr.in` :113, 3s cap) |
| PreCompact | "" | jicm-precompact.sh + scratchpad-rotate.sh | WORKING |
| Stop | ""×5 | jicm-stop.sh | WORKING (recursion+W5 guards; logs) |
| | | stop-hook.sh (Ralph) | **PARTIAL — forbidden `set -euo pipefail` :7** |
| | | exit-guard.sh | WORKING (crash-proof by design) |
| | | insight-capture.js | **BROKEN — scans pre-migration transcript dir** :20 |
| | | refresh-ccusage-cache.sh & | WORKING |
| PreToolUse | `^Bash$` | bash-safety-guard.js | **BROKEN (P0) — total no-op** :486 |
| | `^(Read\|Write\|Edit)$` | bash-safety-guard.js | **BROKEN — same no-op** |
| | "" (all tools) | context-injector.js | **BROKEN — same `tool` vs `tool_name` bug** :166 |
| UserPromptSubmit | "" ×11 | jicm-gate.sh; pre-clear-context-prep.sh; prompt-timestamp.sh | WORKING (bounded; fail-open) |
| | | orchestration-detector.js | PARTIAL — no provenance filter; mixed stdout |
| | | self-correction-capture.js; wiggum-loop-tracker.js (async) | WORKING |
| | | permission-gate.js | **BROKEN — invalid `messages` output field** :196-199 |
| | | milestone-coordinator.js; context-health-monitor.js; relevance-retrieval.js | PARTIAL (see F7, F9) |
| | | ulfhedthnar-detector.js | WORKING |
| PostToolUse | 9 matchers | usage-tracker.js, observation-tracker.js, milestone-coordinator.js, virgil-tracker.js, plan-tracker.js, ulfhedthnar-detector.js | WORKING (usage-tracker handles both schemas :215-216) |
| | `^Bash$`/commit | cross-project-commit-tracker.js, docker-monitor.js | **BROKEN — `context.tool` bug; also watches archived `~/Claude/AIfred`** :41 |
| | `^Write$` | memory-mirror.js | **BROKEN — pre-migration slug** :14-15 |
| Notification | "" | session-tracker.js (async) | WORKING |
| SubagentStop | "" | subagent-stop.js, ulfhedthnar-detector.js, virgil-tracker.js | WORKING |

**Alfred — `alfred/.claude/settings.json`** (v2.2, generated by profile-loader.js; 12 matcher groups / 37 commands, all synchronous; 16 of 37 resolve via valid symlinks into `hooks/archive/`). Notables: PreToolUse `Bash` → 8 guards (secret-scanner, branch-protection, credential-guard, mcp-enforcer, compose-validator, docker-validator, port-conflict-detector, amend-validator — WORKING, correct `tool_name` usage); **PreToolUse `"Edit,Write,mcp__filesystem__edit_file,mcp__filesystem__write_file"` → document-guard.js — BROKEN MATCHER** (comma list matches no tool → the 31KB flagship content guard never fires).

**Global (`~/.claude/settings.json`)**: hooks empty. `~/.claude/hooks/rtk-rewrite.sh` and `update-context-cache.js` exist but are UNWIRED → RTK.md's "commands are automatically rewritten by the hook" is currently false.

### Findings

**[P0] F1 — The entire Jarvis PreToolUse safety layer is a silent no-op.** `bash-safety-guard.js:486` destructures `const { tool, tool_input } = context` but Claude Code sends `tool_name`. `tool` is always undefined → none of the 6 checks (credentials, dangerous-ops, branch protection, workspace bounds, amend safety, secret scanner) ever execute. **Empirically proven read-only**: `{"tool_name":"Bash","tool_input":{"command":"sudo rm -rf /"}}` → `{"continue":true}`; the legacy `{"tool":...}` schema correctly blocks. With `defaultMode: bypassPermissions` (settings.json:333), the only remaining rails are the 8-pattern `permissions.deny` list (:355-368) and the Edit-tool's built-in `.claude/` check. Every Bash/Read/Write/Edit call still pays the node spawn for zero protection.

**[P1] F2 — Forbidden `set -euo pipefail` in a registered Stop hook.** `stop-hook.sh:7`. When a Ralph loop is active and the state file lacks a field, `grep '^iteration:'` exits 1 inside `$( )` (:22-23) → set -e kills the script before its own corruption handlers (:28-48