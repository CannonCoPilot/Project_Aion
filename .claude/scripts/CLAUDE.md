# Scripts

**Purpose**: Operational scripts used during active sessions.

**Layer**: Pneuma (capabilities)

---

## Categories

### MCP Management
- `mcp-enable.sh`, `mcp-disable.sh`, `mcp-status.sh`
- `suggest-mcps.sh` — Keyword-to-MCP mapping

### JICM (Context Management)
- `jicm-config.sh` — Shared path configuration (sourced by watcher, prep, hook)
- `jicm-watcher.sh` — JICM v7.3.0 context watcher (token-aware, two-tier compression)
- `jicm-prep-context.sh` — Two-tier context preparation (Tier 1 bash + Tier 2 LLM)

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
