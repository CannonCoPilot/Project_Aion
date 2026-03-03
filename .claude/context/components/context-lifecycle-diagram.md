# Context Lifecycle & Session Management — Component Diagram (v1.0.0, 2026-02-10)

Scope: active components for session start, JICM compression, context restoration (post pruning).

## 1) Active component inventory
HOOKS (Claude Code events):
- `session-start.sh` [SessionStart]
  - AC-01 protocol, context injection (Mechanism 1), idle-hands flag, debounce/checkpoint load
- `pre-compact.sh` [PreCompact] soft-restart checkpoint
- `precompact-analyzer.js` [PreCompact] preservation manifest
- `context-injector.js` [PreToolUse] tool hints + budget (reads `.jicm-state`)
- `context-health-monitor.js` [UserPromptSubmit] poisoning detection (reads `.jicm-state`)
- `stop-hook.sh` [Stop] cleanup
- `update-context-cache.js` [Stop] context snapshot on stop

SCRIPTS (tmux background):
- `jarvis-watcher.sh` [tmux W1]
  - JICM state machine; context monitoring; compression trigger; `/clear` orchestration; idle-hands wake-up; emergency `/compact`
- `ennoia.sh` [tmux W2]
  - mode detect (arise/attend/idle/resume); context-aware recommendations; dashboard
- `virgil.sh` [tmux W3]
  - task/agent/file tracking
- `housekeep.sh` (on-demand): signal cleanup, log rotation

AGENTS:
- `compression-agent.md`
  - Reads: foundation docs, session-state, chat export
  - Writes: `.compressed-context-ready.md` (5–15k tokens), `.compression-done.signal`

COMMANDS:
- `/intelligent-compress` spawns compression-agent
- `/clear` builtin
- `/export` chat export file

Canonical reference: `prompts.yaml` (prompt templates for keystroke injection).

## 2) Signal file map (active signals only)
- `.compressed-context-ready.md` writer: compression-agent; readers: session-start.sh, jarvis-watcher.sh; archived by housekeep; consumed by session-start.
- `.in-progress-ready.md` created by Jarvis dump on watcher request; readers: session-start.sh, jarvis-watcher.sh; archived by housekeep.
- `.compression-done.signal` writer: compression-agent; reader: jarvis-watcher.sh S1.5; created→detected→cleared.
- `.clear-sent.signal` writer: jarvis-watcher.sh; reader: session-start.sh debounce; epoch timestamp; cleaned by watcher.
- `.continuation-injected.signal` writer: session-start.sh; informational; cleaned by watcher.
- `.jicm-complete.signal` writer/reader: jarvis-watcher.sh; lifecycle create→check→clear.
- `.idle-hands-active` writer: session-start.sh; reader: jarvis-watcher.sh S1.1; YAML mode/attempts; deleted after success.
- `.ennoia-recommendation` writer: ennoia.sh; reader: jarvis-watcher.sh; 30s refresh, 120s stale; cached.
- `.jicm-state` writer: jicm-watcher.sh v6; readers: context-injector.js, ennoia.sh, virgil.sh, context-health-monitor.js, ulfhedthnar-detector.js, housekeep.sh; continuous.
- `.compression-in-progress` flag from /intelligent-compress; read by session-start.sh + watcher; cleaned on startup.
- `.ennoia-status` writer: ennoia.sh; reader: virgil.sh.

## 3) Event flows
Flow A Session Start:
- Claude Code SessionStart → `session-start.sh` builds/injects additionalContext + writes `.idle-hands-active`.
- `jarvis-watcher.sh` detects `.idle-hands-active` → reads Ennoia rec → sends tmux keystrokes + submit.
- `ennoia.sh` detect_mode()=arise → write `[SESSION-START]` rec.
Mechanism 1: hook injects JSON ctx; Mechanism 2: watcher forces response via keystroke; both needed.

Flow B JICM Compression:
- watcher monitoring state machine: at 55% threshold triggers:
  - export chat history pre-compress (/export)
  - send `/intelligent-compress`
- watcher S1.5 waits `.compression-done.signal` then:
  - export pre-clear
  - request JICM dump `.in-progress-ready.md`
  - send `/clear`
  - write `.clear-sent.signal` (epoch)
  - state→cleared
- SessionStart after /clear: session-start.sh reads `.compressed-context-ready.md` + `.in-progress-ready.md`, injects, writes `.idle-hands-active` + `.continuation-injected.signal`.
- Ennoia resume rec: reads context files, writes `[JICM-RESUME] Task:<hint>`.

Flow C Emergency fallback:
- 73% emergency threshold: if compression stuck 180s+ and near lockout → send `/compact` builtin.
- PreCompact hooks last defense: pre-compact.sh writes `.soft-restart-checkpoint.md`; precompact-analyzer writes manifest.
- Failsafe timeout 300s: reset state; 600s cooldown; 3 consecutive failures → standdown.
- Critical post-clear no idle-hands flag → inject emergency restore prompt.

## 4) Ownership matrix
- Session start: session-start.sh + Ennoia; backup watcher idle-hands + hardcoded prompt fallback.
- Compression trigger: watcher; fallback emergency /compact.
- Compression execution: compression-agent; fallback pre-compact checkpoint.
- /clear orchestration: watcher; fallback timeout.
- Context restoration: session-start.sh + Ennoia; backup watcher keystroke + hardcoded JICM-RESUME.
- Monitoring: watcher `.jicm-state` single source.
- Prompt generation: Ennoia; backup watcher fallbacks in prompts.yaml.
- Signal cleanup: watcher + housekeep.

## 5) Pruned/removed (2026-02-10)
- stop-auto-clear.sh (blocks stops) unregistered
- jicm-continuation-verifier.js redundant unregistered
- session-trigger.js duplicates AC-01 unregistered
- context-estimate.json write removed (replaced by `.jicm-state`)
- JICM v2 legacy path removed
- JICM agent spawn signal removed (unused)
- context-injector.js budget warns removed (thresholds=200%)

## 6) Single-page data flow summary
- CLAUDE CODE events → hooks/scripts/agents
- session-start injects + flags
- watcher reads flags + sends keystrokes; writes `.jicm-state`, `.clear-sent`, `.jicm-complete`
- compression-agent writes compressed context + done signal
- ennoia/virgil read state and write rec/status/tasks
- housekeep cleans stale signals