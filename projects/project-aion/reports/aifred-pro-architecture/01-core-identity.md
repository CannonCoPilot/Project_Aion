# AIFred-Pro Architecture Report: Core Identity & Root Files

**Report**: 01 of 10
**Scope**: All root-level files + `.claude/CLAUDE.md`, `settings.json`
**Files Reviewed**: 21
**Date**: 2026-04-23

---

## File Inventory

| # | File | Size | Lines | Purpose |
|---|------|------|-------|---------|
| 1 | `README.md` | 8,850 B | 235 | Project overview, architecture diagram, quick start |
| 2 | `AGENTS.md` | 7,375 B | 202 | Multi-agent architecture (AIFred/Jarvis/Nexus roles) |
| 3 | `CHANGELOG-standardization-sync.md` | 4,946 B | 117 | Version history (v2.x → v3.2.0) |
| 4 | `LICENSE` | 1,074 B | 21 | MIT License, (c) 2024 David O'Neil |
| 5 | `VERSION` | 6 B | 1 | `3.2.0` — programmatic version file |
| 6 | `.env` | 1,547 B | 46 | Environment variables (secrets, DB, ports, paths) |
| 7 | `.env.template` | 1,563 B | 46 | Template with placeholder values |
| 8 | `.gitignore` | 620 B | 31 | Ignores: .env, logs, state, pycache, node_modules, IDE |
| 9 | `.aifred.yaml` | 2,459 B | 78 | Master config: plugins, Nexus, logging, integrations |
| 10 | `.aifred-ignore` | 176 B | 11 | AIFred operation ignore list (secrets, binaries) |
| 11 | `.aifred-ignore.template` | 219 B | 14 | Template with example custom ignores |
| 12 | `.shellcheckrc` | 63 B | 3 | Disables SC2034 (unused variable warnings) |
| 13 | `.yamllint` | 283 B | 14 | YAML lint: max 120 chars, 2-space indent, no doc-start |
| 14 | `.mcp.json` | 574 B | 12 | MCP server: jarvis-pulse (Pulse API at :8700) |
| 15 | `opencode.json` | 458 B | 20 | OpenCode config: anthropic/claude-sonnet-4, same MCP |
| 16 | `docker-compose.yml` | 2,076 B | 62 | pulse-api service on :8700, nexus-runner (commented) |
| 17 | `paths-registry.yaml` | 1,503 B | 40 | Centralized paths: aifred, jarvis, infra, tools |
| 18 | `paths-registry.yaml.template` | 1,384 B | 40 | Template with placeholder paths |
| 19 | `.claude/CLAUDE.md` | 3,816 B | 122 | **CRITICAL**: Claude Code identity & boundaries |
| 20 | `.claude/settings.json` | 438 B | 21 | Permissions: read-heavy, conservative write |
| 21 | `.claude/settings.local.json` | 49 B | 6 | Empty local overrides |

---

## Detailed Analysis

### 1. README.md

The project README for AIFred-Pro v3.2.0. Describes it as an "AI-powered development assistant with a modular plugin architecture."

**Architecture diagram** shows the full directory tree:
- `bin/` — CLI entry points (`aifred`, `aifred-nexus`)
- `lib/` — Shared libraries (`common.sh`, `plugin-loader.sh`, `shared.js`)
- `plugins/` — 12 self-contained plugin modules
- `hooks/` — Git hook templates
- `scripts/` — Utility scripts
- `templates/` — Project templates
- `tests/` — Test suite
- `cron/` — Scheduled job definitions
- `docs/` — Documentation
- `pulse/` — Pulse API (task management)
- `docker-compose.yml` — Container services

**Quick Start**: clone → copy `.env.template` → copy `paths-registry.yaml.template` → edit `.env` → run `./bin/aifred <plugin> <command>`.

**Plugin interface**: every plugin implements `plugin_init()`, `plugin_run()`, `plugin_cleanup()`, `plugin_help()`.

**Standards**: POSIX-compliant bash 3.2+, ShellCheck for `.sh`, yamllint for `.yaml`, kebab-case files, snake_case functions, `#!/usr/bin/env bash` shebangs, structured logging via `lib/common.sh`.

---

### 2. AGENTS.md — Multi-Agent Architecture

Defines three agents in Project Aion:

**AIFred (Operations Archon)**:
- Role: Infrastructure ops, health monitoring, maintenance
- Tools: health-monitor, env-checker, dep-scanner, metrics-dash plugins
- Does NOT: write app code, make architecture decisions, manage planning

**Jarvis (Master Archon)**:
- Role: Master orchestrator, project planning, code development, architecture
- Personality: Calm, precise, Wodehouse-flavored butler
- Does NOT: run health checks, execute scheduled maintenance, monitor uptime

**Nexus (Orchestrator)**:
- Role: Job scheduling, plugin chaining, event routing
- Personality: None (pure automation)
- Does NOT: make decisions, interact with users, modify configs

**Task Routing**:
```
User Request
  ├── Infrastructure/Ops → AIFred (direct)
  ├── Development/Planning → Jarvis (direct)
  └── Scheduled/Automated → Nexus (cron)
```

**Communication**: Pulse API (:8700), signal files in `.claude/context/`, shared PostgreSQL `pulse` DB.

**Boundary Table**:
| Action | AIFred | Jarvis | Nexus |
|--------|--------|--------|-------|
| Write app code | NO | YES | NO |
| Health monitoring | YES | NO | triggers |
| Architecture decisions | NO | YES | NO |
| Run scheduled jobs | NO | NO | YES |
| Modify configs | YES (own) | YES (own) | NO |
| Access Pulse API | YES | YES | read-only |

**Deployment**: Jarvis in tmux W0, AIFred as separate Claude session, Nexus as cron. All share Pulse API.

---

### 3. CHANGELOG-standardization-sync.md

Version history:

- **v3.2.0 (2026-03-28)**: Jarvis Integration Sync — 47 shebang fixes, 25 grep -oP → sed replacements, Pulse API created (FastAPI on :8700, 6 MCP tools), AGENTS.md, pulse-api.md, nexus-architecture.md docs.
- **v3.1.0 (2026-03-15)**: Plugin Standardization — unified 4-function interface, plugin.yaml metadata, plugin-loader.
- **v3.0.0 (2026-03-01)**: Architecture Overhaul — monolith → plugin system, CLI dispatcher, Nexus orchestrator, 12 plugins, test suite, Docker, path registry.
- **v2.x**: Legacy single-file scripts.

**Remaining items from v3.2.0**: Telegram bot token config, Nexus dispatcher test, `lib/shared.js`, `scripts/scan-secrets.sh`, `docs/clarification-pattern.md`.

---

### 4-5. LICENSE & VERSION

- **LICENSE**: MIT, (c) 2024 David O'Neil
- **VERSION**: `3.2.0` (single line, matches all other version references)

---

### 6-7. .env & .env.template

**Structure** (7 sections, 15 keys):

| Section | Keys | Notes |
|---------|------|-------|
| GitHub | `GITHUB_TOKEN`, `GITHUB_USERNAME`, `GITHUB_DEFAULT_ORG` | Token populated, username=CannonCoPilot |
| AI Providers | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_HOST` | Only Ollama populated (localhost:11434) |
| Notifications | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SLACK_WEBHOOK_URL` | All empty |
| Database | `PULSE_DB_HOST/PORT/NAME/USER/PASS` | localhost:5432/pulse/pulse, password set |
| Service Ports | `PULSE_API_PORT`, `NEXUS_PORT` | 8700, 8701 |
| Feature Flags | `AIFRED_DEBUG`, `AIFRED_DRY_RUN`, `AIFRED_VERBOSE` | All false |
| Path Overrides | `AIFRED_HOME`, `JARVIS_HOME` | Both populated with actual paths |

---

### 8. .gitignore

Ignores: `.env`, `*.pem/*.key`, `log/**/*.log`, `*.pid/*.lock`, `state/`, `.nexus-state/`, Python artifacts, OS files, IDE dirs, `tests/output/`, `node_modules/`, `pulse/*.db`, `pulse/data/`.

---

### 9. .aifred.yaml — Master Configuration

**Plugins** (12 enabled):
git-manager, doc-manager, env-checker, pr-reviewer, dep-scanner, health-monitor, changelog-gen, metrics-dash, test-runner, code-quality, security-scan, backup-manager

**Plugin-specific settings**:
- git-manager: `auto_commit: false`, `branch_prefix: "feature/"`, protected: main, master
- health-monitor: check every 300s, alerts via telegram + log
- dep-scanner: no auto-update, severity threshold "high"
- metrics-dash: 30-day retention, JSON export

**Nexus**: enabled, dispatcher every 5 min, max 3 concurrent jobs, 10 min timeout, watchdog every 15 min.

**Logging**: info level, structured format, 10MB rotation keeping 5 files.

**Integration**: Jarvis enabled (Pulse at :8700, shared DB). Telegram disabled (awaiting token).

---

### 10-11. .aifred-ignore & Template

AIFred's own ignore list for plugin operations. Skips: `.env`, certs, PDFs, zips, tarballs, `tests/fixtures/large/`.

---

### 12-13. .shellcheckrc & .yamllint

- ShellCheck: disables SC2034 (unused variable warnings — needed for sourced/exported vars)
- yamllint: max 120 chars, 2-space indent, no document-start required, truthy values restricted to true/false/yes/no

---

### 14-15. .mcp.json & opencode.json

Both register `jarvis-pulse` MCP server pointing to Jarvis infrastructure venv:
- Python: `/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/bin/python`
- Script: `infrastructure/rag-service/pulse_mcp_server.py`
- Env: `PULSE_API_URL=http://localhost:8700`

`opencode.json` additionally sets provider to `anthropic/claude-sonnet-4-20250514` for both default and reasoning.

---

### 16. docker-compose.yml

**Active service**: `pulse-api` — builds from `./pulse/Dockerfile`, port 8700, health check via curl, `unless-stopped` restart, on `aifred-net` bridge network.

**Commented out**: `nexus-runner` on port 8701 (not yet implemented).

Note: Most infrastructure (PostgreSQL, Qdrant, Neo4j, Redis) runs on Jarvis's docker-compose, not here.

---

### 17-18. paths-registry.yaml & Template

Centralized path management (4 sections):
- **aifred**: 12 paths (home, bin, lib, plugins, scripts, templates, tests, logs, docs, hooks, cron, pulse)
- **jarvis**: home, context, scripts, secrets
- **infrastructure**: docker_compose, venv, pulse_mcp
- **tools**: tmux (`~/bin/tmux`), shellcheck, yamllint, jq, yq (all `/opt/homebrew/bin/`)

---

### 19. .claude/CLAUDE.md (CRITICAL — Claude Code Identity)

This is the file Claude Code loads as system instructions when operating in AIFred-Pro.

**Identity**: "You are AIFred, the Operations Archon of Project Aion. You are NOT Jarvis."

**Role boundaries** (hard):
- DO: health checks, env validation, dep scanning, operational reports, scheduled maintenance, metrics/alerting, Pulse API management
- DO NOT: write app code, make architecture decisions, manage planning, handle Chronicler, modify Jarvis config

**Key paths**: AIFred-Pro repo, Jarvis repo (read-only for AIFred), Pulse at :8700.

**Communication**: Pulse API labels `agent:aifred/jarvis/shared`. Jarvis reads AIFred as reference. AIFred reads Jarvis infrastructure for health checks. Neither modifies the other.

**Standards**: `#!/usr/bin/env bash`, no `grep -oP`, ShellCheck + yamllint, kebab-case files, snake_case functions.

**Pulse API endpoints**: POST/GET/PATCH/DELETE `/tasks`, GET `/tasks/{id}`, GET `/tasks/search`, GET `/health`.

**Nexus**: dispatcher 5min, callback 5min, watchdog 15min, jobs.db in `.claude/jobs/state/`.

---

### 20-21. .claude/settings.json & settings.local.json

**Permissions** (conservative, read-heavy):
- Allowed without confirmation: ls, cat, find, grep, head, tail, wc, stat, file, shellcheck, yamllint, git status/log/diff, docker ps/logs, curl
- No explicit denies
- No hooks registered
- Local overrides: empty

This is much more restrictive than Jarvis's settings.json — AIFred can inspect but most write operations require confirmation.

---

## Cross-File Relationships

**Version consistency**: VERSION, .aifred.yaml, opencode.json, README.md, CHANGELOG all read `3.2.0`.

**Pulse API is the central integration point**: Referenced by .mcp.json, opencode.json, .env, docker-compose.yml, .aifred.yaml, CLAUDE.md, AGENTS.md, paths-registry.yaml.

**Template pattern**: Three pairs use template-then-customize: `.env`/`.env.template`, `paths-registry.yaml`/`.yaml.template`, `.aifred-ignore`/`.template`.

**Agent boundary enforcement**: CLAUDE.md (auto-loaded) and AGENTS.md (reference) both enforce the same role boundaries.

**Jarvis dependency**: AIFred-Pro depends heavily on Jarvis infrastructure — Pulse MCP server Python binary in Jarvis's venv, database on Jarvis's PostgreSQL, paths-registry maps Jarvis paths.
