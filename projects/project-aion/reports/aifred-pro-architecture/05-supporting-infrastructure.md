# AIFred-Pro Architecture Analysis — Report 05: Supporting Infrastructure

**Date**: 2026-04-23
**Scope**: scripts/, setup-phases/, profiles/, docs/, tests/, monitoring/, infrastructure/, .claude/skills/, .claude/agents/, .claude/registries/, .claude/config/, .claude/plans/, .claude/orchestration/, .claude/archive/, .claude/data/, .claude/logs/, .opencode/, .github/, commands/

---

## 1. scripts/ — System Operations Layer

**File count**: 22 shell scripts + systemd/ subdirectory (3 files)

| Script | Purpose |
|--------|---------|
| `setup-aifred.sh` | Full system bootstrap (installs deps, creates venv, runs setup-phases) |
| `start-services.sh` | Starts all services: Pulse, Nexus dispatcher, Telegram bot, dashboard |
| `health-check.sh` | Polls Pulse API, Nexus DB, dashboard port, Telegram webhook |
| `deploy-nexus.sh` | Copies Nexus files, registers cron jobs, validates dispatcher |
| `migrate-db.sh` | SQLite schema migrations for jobs.db and Pulse DB |
| `backup.sh` | Backs up jobs.db, Pulse SQLite, .env files to timestamped archive |
| `rotate-logs.sh` | Truncates logs in `.claude/logs/` over configurable size threshold |
| `scan-secrets.sh` | Searches for hardcoded tokens/passwords; outputs report |
| `update-aifred.sh` | `git pull` + pip install + service restart sequence |
| `check-env.sh` | Validates required env vars exist in `.env`; exits 1 if missing |
| + ~12 others | Supporting utilities (db-shell, service-status, nuke-reset, etc.) |

**systemd/ (3 files)**: `aifred-pulse.service`, `aifred-nexus.service`, `aifred-monitor.service`. Linux-only — no macOS launchd equivalents exist. On macOS, services are started manually via `start-services.sh`.

**macOS compatibility**: All shebangs are `#!/usr/bin/env bash`. No `declare -A`, `grep -P`, or `mapfile` found. Scripts with `systemctl` calls have conditional blocks that skip on Darwin. Largely clean.

**Integration**: `setup-aifred.sh` orchestrates `setup-phases/` scripts. `start-services.sh` is the canonical post-setup entry point. `health-check.sh` is consumed by the monitoring watchdog.

---

## 2. setup-phases/ — Phased Bootstrap Orchestration

**File count**: 5 shell scripts

| Phase | Script | Purpose |
|-------|--------|---------|
| 1 | `phase-1-dependencies.sh` | `apt`/`brew` package install (detects Darwin → uses brew) |
| 2 | `phase-2-python-env.sh` | Creates venv, installs requirements from pyproject.toml |
| 3 | `phase-3-database.sh` | Initializes SQLite jobs.db and Pulse DB schemas |
| 4 | `phase-4-services.sh` | Configures Pulse, Nexus, Telegram bot settings |
| 5 | `phase-5-validation.sh` | Runs health-check.sh and validates end-to-end connectivity |

Each phase is idempotent (checks sentinel file `~/.aifred/phase-N-complete`). Phase 1 detects OS via `uname -s`, uses `/opt/homebrew/bin/brew` (Apple Silicon) with fallback to `/usr/local/bin/brew` (Intel).

---

## 3. profiles/ — Environment Configuration

**File count**: 4 files

| File | Purpose |
|------|---------|
| `development.env` | Dev: debug logging, local DB paths, test API key placeholders |
| `production.env` | Production: stricter logging, real service URLs |
| `testing.env` | Test isolation: in-memory SQLite, mock Telegram |
| `local.env.example` | Template for actual secrets (gitignored copy becomes `.env`) |

Active profile controlled by `AIFRED_ENV` env var (default: `development`). Scripts source via `source profiles/${AIFRED_ENV:-development}.env`.

---

## 4. docs/ — Documentation

**File count**: 13 Markdown files + 3 SVG architecture diagrams

| File | Lines | Purpose |
|------|-------|---------|
| `architecture.md` | ~200 | System overview, component relationships, data flows |
| `setup-guide.md` | ~300 | End-to-end setup instructions (Linux + macOS) |
| `nexus-automation.md` | ~250 | Nexus job framework deep-dive (personas, lifecycle, dispatcher) |
| `pulse-api.md` | ~180 | Pulse REST API reference (all endpoints, shapes) |
| `development.md` | ~150 | Contributor guide (branching, testing, conventions) |
| `troubleshooting.md` | ~120 | Common issues and resolutions |
| `dashboard-guide.md` | ~100 | Dashboard UI usage guide |
| + 6 others | varies | MCP integration, Telegram setup, backup/restore, etc. |

**SVGs** (3): Architecture overview, Nexus job flow, Pulse data model.

**Key reference**: `nexus-automation.md` documents the 24-persona system, job state machine (pending -> running -> complete/failed/retry), and dispatcher cron behavior. Referenced from Jarvis's CLAUDE.md.

---

## 5. tests/ — Test Suite

**File count**: 11 Python files across 3 subdirectories

### Unit Tests (`tests/unit/`, 6 files)

| File | ~Tests | Subject |
|------|--------|---------|
| `test_pulse.py` | 20 | Pulse task CRUD, state transitions, label filtering |
| `test_nexus.py` | 18 | Job lifecycle, dispatcher logic, persona routing |
| `test_jobs_db.py` | 12 | SQLite jobs.db schema, migrations |
| `test_telegram.py` | 10 | Telegram bot message parsing, command dispatch |
| `test_hooks.py` | 8 | Hook event parsing, payload validation |
| `test_skills.py` | 8 | Skill invocation patterns, output parsing |

### Integration Tests (`tests/integration/`, 3 files)

| File | ~Tests | Subject |
|------|--------|---------|
| `test_nexus.py` | 15 | Full Nexus dispatcher cycle (requires running DB) |
| `test_pulse_api.py` | 12 | Full Pulse API (requires uvicorn on test port) |
| `test_dashboard.py` | 8 | Dashboard API endpoints (requires dashboard server) |

### Performance Tests (`tests/performance/`, 2 files)

| File | ~Tests | Subject |
|------|--------|---------|
| `test_load.py` | 10 | Pulse API throughput under concurrent requests |
| `test_db_performance.py` | 6 | SQLite query latency for job queue operations |

**Important**: Integration tests hit live services (`localhost:8700`, `localhost:3000`). No mock server fixtures exist. `pytest tests/unit/` is safe standalone; `pytest tests/integration/` requires the full stack running.

---

## 6. monitoring/ — Grafana Dashboards

**File count**: 2 JSON files

| File | Purpose |
|------|---------|
| `aifred-overview.json` | Pulse task counts, Nexus job throughput, API latency |
| `nexus-jobs.json` | Per-persona job metrics, error rates, queue depth |

Expect a Prometheus datasource named `aifred-metrics`. The monitoring stack is optional (see infrastructure/).

---

## 7. infrastructure/ — Supplementary Compose and Reverse Proxy

**File count**: 4 files

| File | Purpose |
|------|---------|
| `Caddyfile` | Reverse proxy: `aifred.local` -> dashboard :3000, `/api` -> Pulse :8700 |
| `Caddyfile.dev` | Dev variant: no TLS, all localhost plain HTTP |
| `authentik-compose.yml` | Authentik SSO for dashboard auth (optional, heavyweight) |
| `monitoring-compose.yml` | Prometheus + Grafana + Alertmanager compose stack |

These are opt-in overlays. Base system runs without any of them. On macOS, use `Caddyfile.dev` (services run as local processes, not Docker networked).

---

## 8. .claude/skills/ — AIFred Skill Definitions

**File count**: 5 skills

| Skill | Purpose | Key Tools |
|-------|---------|-----------|
| `pulse-ops` | Task CRUD via Pulse — canonical task interface | `mcp__jarvis-pulse`, API calls |
| `nexus-ops` | Submit/check Nexus jobs | `Bash(curl)`, jobs.db queries |
| `dashboard-ops` | Navigate dashboard, extract metrics | `WebFetch`, `Bash(curl)` |
| `git-ops` | Branch management for AIFred-Pro-Dev | `Bash(git *)` |
| `telegram-ops` | Send messages via @Keryx_Archon | `Bash(curl)` Telegram API |

Skills are prompt+tool-call specs (no companion .sh scripts). `pulse-ops` is the most developed — includes label conventions and the `agent:aifred`/`agent:jarvis`/`agent:shared` taxonomy. David recommends using this skill for all task mutations.

---

## 9. .claude/agents/ — AIFred Agent Definitions

**File count**: 5 agents

| Agent | Purpose | Model |
|-------|---------|-------|
| `liaison.md` | Inter-archon comms; monitors Shared_Projects/Questions/ | Sonnet |
| `code-reviewer.md` | Reviews PRs against AIFred-Pro coding standards | Sonnet |
| `nexus-tester.md` | Submits test jobs, validates persona outputs | Sonnet |
| `dashboard-auditor.md` | Audits dashboard for stale data, inconsistencies | Haiku |
| `incident-responder.md` | Diagnoses failures, escalates via Telegram, logs to Pulse | Sonnet |

`liaison.md` is the agent behind the Nexus "Liaison" persona that monitors `Shared_Projects/Questions/` hourly.

---

## 10. .claude/registries/ — Service and Capability Registries

**File count**: 3 YAML files

| File | Purpose |
|------|---------|
| `services.yaml` | Maps service names to ports, health endpoints, start commands |
| `personas.yaml` | All 24 Nexus personas with job types and schedules |
| `skills.yaml` | Capability manifest: available skills, model tier, when-to-use |

**`personas.yaml`**: Authoritative reference for Nexus capabilities. Key personas: `liaison` (hourly, Shared_Projects), `pulse-reporter` (daily, task summaries), `code-health` (weekly, repo checks), `incident-responder` (continuous, alert polling).

**Integration**: `health-check.sh` reads `services.yaml` for endpoint polling. Orchestration scripts reference `personas.yaml` for cron configuration.

---

## 11. .claude/config/ — Runtime Configuration

**File count**: 2 YAML files

| File | Purpose |
|------|---------|
| `autonomy.yaml` | Gates auto-execute vs. confirmation-required operations |
| `mcp-config.yaml` | MCP server definitions for AIFred Claude Code sessions |

`autonomy.yaml` auto-executes `pulse_create`, `pulse_update`, `nexus_job_submit`; requires confirmation for `pulse_delete`, `system_restart`, `git_force_push`.

---

## 12. .claude/plans/ — Active Implementation Plans

**File count**: 3 Markdown files

| File | Subject | Status |
|------|---------|--------|
| `eager-sunrise-falcon.md` | Dashboard `config.ts` gap fix | **NOT IMPLEMENTED** (blocker) |
| `gentle-morning-cedar.md` | Nexus persona expansion (4 new personas for v3.3.0) | Planning |
| `swift-ocean-harbor.md` | Pulse MCP v2 — bulk operations extension | Planning |

**Critical**: `eager-sunrise-falcon.md` documents the missing `dashboard/server/config.ts` file. The plan exists but the file has not been created. Dashboard server startup will fail with MODULE_NOT_FOUND.

---

## 13. .claude/orchestration/ — Orchestration Specifications

**File count**: 2 files

| File | Purpose |
|------|---------|
| `session-flow.md` | AIFred session lifecycle (AC-01 equivalent startup, task routing) |
| `inter-archon-protocol.md` | Jarvis<->AIFred communication protocol via Shared_Projects |

**`inter-archon-protocol.md`** defines: Questions format (YAML frontmatter), response SLA (1 hour during business hours), escalation via Telegram, `agent:shared` label for shared task ownership. This is the architectural contract for cross-archon coordination.

---

## 14. Remaining Directories

### .claude/archive/ (1 file)
`old-commands.md` — legacy slash commands superseded by current structure. Nothing actionable.

### .claude/data/ (2 files)
- `bootstrap-state.json` — tracks completed setup phases (safe to delete for re-bootstrap)
- `skill-usage.jsonl` — append-only skill invocation log (feeds daily summaries)

### .claude/logs/ (3 files at runtime)
- `nexus-dispatcher.log`, `pulse-api.log`, `session-events.log`
- Plain text, line-per-event. `rotate-logs.sh` truncates at 10MB. No structured JSONL yet.

### .opencode/ (3 files)
OpenCode (open-source Claude Code alternative) configuration. Mirrors AIFred identity in OpenCode format. Irrelevant if only using Claude Code.

### .github/ (6 files)
- `workflows/ci.yml` — Unit tests on push to `main`/`nate-dev` (pytest tests/unit/)
- `workflows/lint.yml` — Ruff + black + shellcheck on changed files
- `workflows/release.yml` — Tag-triggered: version bump, CHANGELOG, GitHub release
- `PULL_REQUEST_TEMPLATE.md`, bug/feature issue templates

CI runs automatically on `nate-dev` pushes — Jarvis's contributions are auto-tested and linted.

### commands/ (3 shell scripts, top-level)
- `aifred` — Main CLI: `aifred start|stop|status|health`
- `pulse` — CLI wrapper: `pulse create "task" --label agent:jarvis`
- `nexus` — CLI wrapper: `nexus submit <persona> <payload>`

Intended for `$PATH` (symlinked during setup). All macOS-compatible.

---

## macOS Compatibility Summary

| Category | Status | Notes |
|----------|--------|-------|
| Shebangs | CLEAN | All `#!/usr/bin/env bash` |
| `declare -A` | NONE | No associative arrays |
| `grep -P/-oP` | NONE | Basic/extended regex only |
| `mapfile`/`readarray` | NONE | No bash 4+ array reading |
| `systemd` | BYPASSED | Conditional Darwin detection skips systemctl |
| `apt` install | BYPASSED | Phase 1 uses `brew` on Darwin |
| `dashboard/server/config.ts` | **MISSING** | Server will fail MODULE_NOT_FOUND on start |

---

## Key Integration Points for Jarvis

1. **Task interface**: `commands/pulse` CLI or `mcp__jarvis-pulse` MCP (6 tools) — both hit Pulse at `:8700`
2. **Cross-archon comms**: `Shared_Projects/Questions/` — read by `liaison` persona hourly; contract in `inter-archon-protocol.md`
3. **Nexus jobs**: `commands/nexus submit <persona> <payload>` or API directly
4. **CI gate**: Push to `nate-dev` triggers unit tests + shellcheck automatically
5. **First feature target**: Fix `dashboard/server/config.ts` (plan at `.claude/plans/eager-sunrise-falcon.md`)

---

*Report 05 — AIFred-Pro Architecture Analysis*
*2026-04-23*
