# Watcher HUD Design — v1.0

**Date**: 2026-05-03 (overnight build)
**Author**: Jarvis
**Script**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher-hud.sh` (~870 lines)
**Status**: Preview / Tier-2 polish; awaiting User morning review

---

## 1. Purpose

The v7.9 slim watcher's tmux W1 window currently displays a spartan log stream. The HUD turns that window into a live, htop-style operations dashboard surfacing JICM state, Aion Quartet liveness, signal protocol activity, compression history, and configuration — all in one glanceable canvas.

The HUD is a **sidecar reader**, not a replacement for the watcher. The slim watcher (`jicm-watcher.sh`, 187 lines) remains the sole actuator. The HUD reads state files and the log file; it does not modify, restart, or interfere with actuation. This preserves the architectural separation shipped in 7.9.6b.

## 2. Layout

The HUD targets a maximized terminal canvas (≥100 cols × ≥40 rows). Sections, top to bottom:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [HEADER] Title │ Action badge │ Session ID │ Watcher PID + uptime │ Datetime│
├──────────────────────────────── CONTEXT WINDOW ────────────────────────────┤
│ Model + window size + tokens used + percentage                              │
│ [stack bar with soft/hard/auto ticks, color-coded by zone]                  │
│ Tick legend (0% — soft 30% — hard 65% — auto 70% — 100%)                    │
│ Burn rate │ Soft ETA │ Hard ETA │ Last turn output                          │
├──────────────────────────────── CACHE & COST ──────────────────────────────┤
│ Hit rate │ Cache read │ Cache create (5m / 1h split)                       │
│ Cost │ 5h block │ 7d window │ eph_1h adoption                              │
├──────────────────────────────── JICM CYCLES ───────────────────────────────┤
│ Last compression: TS, age, method, LLM, output lines+bytes, duration       │
│ NLP applied + before/after tokens + ratio │ session-state staleness         │
├────────────── SIGNALS (left)  &  AION QUARTET (right) ─────────────────────┤
│ .jicm-clear-now.signal       │ Watcher  : ALIVE pid + uptime               │
│ .jicm-resume-complete        │ Ennoia   : alive/sleeping                   │
│ .compression-done.signal     │ Virgil   : alive/sleeping                   │
│ .compression-in-progress     │ Commands : alive + uptime                   │
│ .command-signal              │ Exit-mode/Sleep                             │
├──────────────────────────── THRESHOLDS & CONFIG ───────────────────────────┤
│ SOFT_TOKENS (pct) │ HARD_TOKENS (pct) │ AUTO_COMPACT │ WINDOW              │
│ POLL │ IDLE_GRACE │ HALT_ACK │ PREP │ RESUME timeouts                      │
│ BACKEND │ TARGET │ LEGACY_STATE (shim status)                              │
├─────────────────── WATCHER LOG (live tail, last 12 lines) ─────────────────┤
│ Color-coded by event type:                                                  │
│   green  = cycle complete / HALT acknowledged                               │
│   yellow = HALT prompt sent                                                 │
│   blue   = RESUME / resume signal observed                                  │
│   magenta= /clear sent                                                      │
│   cyan   = prep complete                                                    │
│   violet = cycle start                                                      │
│   red    = timeout / abort / error                                          │
├──────────────────────────────────────────────────────────────────────────── │
│ Footer: refresh interval │ q to quit │ HUD version │ log file path         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Data Sources (read-only)

| Source | Purpose | Cadence |
|---|---|---|
| `.jicm-state-hook.json` | Tokens, model, cache, thresholds, ETAs, action | Every UPS (rich JSON, primary) |
| `.jicm-state` | Legacy state machine (WATCHING/CLEARING/RESTORING) | Watcher transitions; v79_shim |
| `.jicm-watcher.pid` | Watcher PID for liveness check | Watcher start |
| `jicm-watcher.log` | Log tail (last 12 lines) | Watcher events |
| `.jicm-last-compression.json` | Last cycle metadata (timestamp, method, LLM, sizes) | Per cycle |
| `.jicm-nlp-compression.json` | NLP compression metrics (Phase 3.1) | Per cycle |
| Signal files (presence-only) | Pending injection / cycle state | Live |
| `.command-signal` | Pending slash-command injection | Set by skills, consumed by W4 |
| `pgrep` for Aion Quartet | Liveness of Watcher / Ennoia / Virgil / Commands | Live |
| `ps -o etime` | Watcher uptime | Live |

**Architectural invariant**: HUD is a pure consumer. No writes anywhere. Restart-safe. Crash-safe. If the HUD dies, the watcher continues unaffected.

## 4. Modes

```
bash .claude/scripts/jicm-watcher-hud.sh                 # Live (1s refresh)
bash .claude/scripts/jicm-watcher-hud.sh --once          # Single frame, exit
bash .claude/scripts/jicm-watcher-hud.sh --demo          # Interactive 5-state cycle
bash .claude/scripts/jicm-watcher-hud.sh --demo-state=N  # Static demo frame (1-5)
bash .claude/scripts/jicm-watcher-hud.sh --help          # Usage
```

Demo states: `1=idle | 2=soft_nudge | 3=hard_halt | 4=clearing | 5=restoring`.

## 5. Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Architecture | Sidecar (separate process) | Preserves slim-watcher principle (watcher does one thing — actuate) |
| Refresh model | Full clear + redraw 1s | Simpler than diff-render; modern terminals don't flicker |
| Color palette | 256-color ANSI | Reliable across iTerm2 / Terminal.app / tmux / WezTerm |
| Box drawing | Unicode (┌─┐│└─┘├┤) | All Jarvis terminals render Unicode |
| Width handling | Detect via `tput cols`; warn if <100 | Graceful degradation, but optimized for full-screen |
| Performance | jq per state file (cached for one render cycle) | Total render <100ms typical |
| Singleton | None (HUD is presentation-only; multiple instances OK) | No reason to enforce |
| Cursor | Hidden during live mode (`tput civis`) | Prevents blinking artifact during refresh |
| Trap | EXIT/INT/TERM restore cursor + clear | Clean exit on Ctrl+C |
| Demo data | Hardcoded synthetic states | Preview-quality, demonstrates all modes without driving system |

## 6. Visual Language

- **Color coding by JICM action** (header badge):
  - WATCHING — green 🟢
  - SOFT_NUDGE — bold yellow ⚠️
  - HARD_HALT — bold red ⛔
  - CLEARING — bold magenta 🌀
  - RESTORING — bold blue ♻️
- **Bar zones**: green fill (0–soft), yellow fill (soft–hard), red fill (hard–100), gray empty
- **Bar ticks**: yellow `│` at soft, red `┃` at hard, magenta `╿` at native compact (70%)
- **Cache hit rate** colored by goodness: 90+ green, 70–90 yellow, <70 red
- **Cost** colored by magnitude: <$1 green, $1–5 cyan, $5–15 yellow, >$15 red
- **Log tail** color-coded by event semantics (see layout diagram)

## 7. Integration (recommended; gated on User approval)

### Option A — Replace W1 watcher window output with HUD
Modify launcher (`launch-jarvis-tmux.sh`) to start the HUD instead of (or alongside) the watcher in W1:
```bash
tmux new-window -t jarvis:1 -n Watcher
tmux send-keys -t jarvis:1 "bash $JARVIS/.claude/scripts/jicm-watcher.sh > /dev/null 2>&1 &" C-m
sleep 1
tmux send-keys -t jarvis:1 "bash $JARVIS/.claude/scripts/jicm-watcher-hud.sh" C-m
```
Watcher still writes to `jicm-watcher.log`; HUD reads + displays. Watcher PID file ensures singleton; HUD is presentation only.

### Option B — Dedicated HUD window (W7)
Keep W1 watcher output as-is; add W7 for HUD. Less disruptive but takes another window slot.

### Option C — On-demand HUD
No tmux integration; user runs `bash .claude/scripts/jicm-watcher-hud.sh` manually when they want a status check.

**Recommendation**: Option A. The current W1 log stream is low-information; the HUD provides far more at the same screen real-estate.

## 8. Performance

| Operation | Typical latency | Cache strategy |
|---|---|---|
| Single jq parse of state-hook JSON | 5–15 ms | Per render |
| `pgrep` for 4 quartet processes | 10–20 ms | Per render |
| `ps` for watcher uptime | 5–10 ms | Per render |
| Log tail (`tail -n 12`) | 1–3 ms | Per render |
| Total render cycle | 30–80 ms | (1s refresh, well within budget) |

## 9. Future Enhancements (deferred)

- Compression history graph (last N cycles as ASCII sparkline)
- Token-compression Phase metrics integration (per-class brevity, register violations)
- Pulse open task count panel (already in statusline-v9; could mirror)
- AC component liveness panel (AC-01..AC-09 last-fire times)
- Interactive keyboard shortcuts (k=kill watcher, r=restart, c=force cycle)
- Remote/multi-project support (read state files from multiple Jarvis workspaces)

## 10. Testing

Verified during overnight build:
- ✓ `--demo-state=1` (idle) — green badge, 14% bar, healthy cache
- ✓ `--demo-state=3` (HARD_HALT) — red badge, 67% bar past hard tick, signal "present"
- ✓ `--once` against live production state — real PID 74731 (uptime 01:54), real Aion Quartet, real log tail
- Bug fixed: `date -j -f` was parsing Z-suffix as local instead of UTC (showed "-10036s ago"); changed to `-juf`
- Bug fixed: section header format had artifact `─ TITLE ─` doubling; cleaned to ` TITLE `

## 11. Files Touched

- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher-hud.sh` (NEW, executable)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/watcher-hud-design.md` (THIS FILE, NEW)
