# Scripts

**Purpose**: Operational scripts used during active sessions.

**Layer**: Pneuma (capabilities)

---

## Categories

### MCP Management
- `mcp-enable.sh`, `mcp-disable.sh`, `mcp-status.sh`
- `suggest-mcps.sh` — Keyword-to-MCP mapping

### JICM (Context Management)
- `jicm-config.sh` — Shared path configuration (sourced by watcher, actuator, hooks)
- `jicm-watcher.sh` — **THE WATCHER**: registry-driven multi-session daemon (JICM v9).
  Senses every registered lane, GCs dead sessions, fires `jicm-actuate.sh` at threshold.
  Runs under launchd as `com.aion.jicm-watcher` (KeepAlive), NOT from the launcher.
  Renamed from `jicm-supervisor.sh` on 2026-08-20.
- `jicm-watcher-hud.sh` — the Watcher CONSOLE (HUD v2), tmux window `aion:8`. Read-only.
- `jicm-actuate.sh` — per-key actuation cycle (preserve → HALT → prep → `/clear` → restore)
- `jicm-prep-context.sh` — Two-tier context preparation (Tier 1 bash + Tier 2 LLM)
- `retired/` — superseded scripts kept for reference. `jicm-watcher-legacy-retired-2026-08-17.sh`
  is the v7.9 W0-only singleton that used to be called "the watcher"; it is not launched by
  anything. Do not revive it: cycling, MAINTAIN and REST all moved to the daemon above.

### Launchers

- `launch-aion.sh` — **THE launcher.** 14 tmux windows, six Claude lanes. Owns the service
  pre-flight, which auto-starts what we control and now treats a dead usage proxy as a CRITICAL
  failure rather than a yellow line (a launcher that quietly drops `ANTHROPIC_BASE_URL` costs you
  every lane's telemetry while every lane keeps working — see `aebf9b0`).
- `retired/launch-jarvis-tmux-retired-2026-08-27.sh` — the pre-monorepo launcher, **RETIRED**.
  It built the old "Aion Quartet" layout and still points at `$HOME/Claude/Alfred-Dev` in 14
  places, including all of its `--restart` modes. Nothing invoked it at retirement. It refuses to
  run unless `AION_RUN_RETIRED_LAUNCHER=1`. **Do not revive it.**
  The reason it was retired rather than repaired is worth keeping: it carried the *same* silent
  telemetry-loss defect as `launch-aion.sh` and had to be fixed twice, once per launcher, on the
  same afternoon. **Two launchers kept in step by hand is how they diverged.** If a second
  launcher is ever genuinely needed, factor the shared pre-flight out rather than copying it.

### Status Line
- `jarvis-statusline-v9.sh` — **THE shared status line for every Archon lane.** One layout for
  all six Claude lanes (Jarvis, Protos, Urist, Jarvis-dev, Genie, Jacques); it contains no
  persona branching by design.
  Referenced by **ABSOLUTE path** from every `settings.json`, because `$CLAUDE_PROJECT_DIR`
  resolves to the satellite dir for lanes rooted outside `Project_Aion/` (`alfred/`,
  `Projects/DwarfCron/`, `Projects/WVU/`, `Projects/SnorkelTasks/`), none of which have
  `.claude/scripts/` — a relative path renders nothing, silently.
  **A lane that renders a different layout is drift, not configuration.** It means that lane's
  project `settings.json` omits `statusLine` and fell through to the user-level default. Fix by
  adding the key, not by editing the script.
  For `alfred/`, the key must be added to `alfred/scripts/profile-loader.js` — that script
  overwrites `alfred/.claude/settings.json` wholesale and never reads the existing file.
- `archived/jarvis-statusline-v8.sh` — superseded 2026-08-26. Do not revive.

### Signal-Based Automation
- `signal-helper.sh` — Signal utility functions
- `jarvis-watcher.sh` — Legacy v5 watcher (command signal execution only)

### Benchmarking & Scoring
- `benchmark-runner.js` — Execute benchmarks
- `scoring-engine.js` — Calculate scores
- `telemetry-collector.js`, `telemetry-analyzer.js`

### Setup & Validation
- `setup-*.sh` — Setup phase scripts
- `validate-*.sh` — Validation scripts

## What Does NOT Belong Here

- System-level utilities → `/Jarvis/scripts/`
- Weekly scheduled jobs → `/Jarvis/scripts/`

## Key Distinction

**Operational scripts** (here): Used during active sessions
**System scripts** (`/Jarvis/scripts/`): Setup, weekly health, system-level

---

*Jarvis — Pneuma Layer (Capabilities)*
