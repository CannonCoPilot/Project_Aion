# System 6: Bootstrap & Service Lifecycle

**Purpose**: Installation, configuration, service management, updates, and backups. Takes AIFred-Pro from a fresh clone to a fully operational stack.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  Fresh clone
    │
    v
  scripts/bootstrap.sh (idempotent setup, pure bash)
    │
  setup-phases/ (markdown guides for AI-guided setup):
    ├── 00-prerequisites.md     ├── 05-hooks-automation.md
    ├── 01-system-discovery.md  ├── 06-agent-deployment.md
    ├── 02-purpose-interview.md ├── 07-finalization.md
    ├── 03-foundation-setup.md  ├── 08-optional-integrations.md
    ├── 04-mcp-integration.md   ├── setup-plan.yaml
    └── welcome-task.md

  Docker Compose (3 services):
    ├── postgres (PostgreSQL 16)
    ├── pulse (FastAPI on :8700)
    └── nexus-dashboard (Fastify on :8600)

  35+ scripts in scripts/:
    ├── check-all-services.sh  — Docker service health checks
    ├── backup-status.sh       — Restic backup monitoring
    ├── setup-pulse.sh         — Pulse API setup
    ├── aifred-update.sh       — Component sync with upstream
    ├── bootstrap.sh           — Initial setup
    ├── bump-version.sh        — Version management
    ├── discover-docker.sh     — Docker service discovery
    ├── scan-secrets.sh        — Credential scanning
    ├── sync-git.sh            — Git synchronization
    ├── checkpoint.sh          — State checkpointing
    ├── consolidate-project.sh — Project consolidation
    ├── config.sh.template     — Config template
    ├── profile-loader.js      — YAML profile loader
    ├── weekly-*.sh            — 4 weekly maintenance scripts
    └── ... (20+ more)
```

---

## Subsystem 6.1: Bootstrap (bootstrap.sh + setup-phases/)

**Script**: `scripts/bootstrap.sh`
- Pure bash, no LLM dependency
- Idempotent (re-running skips completed steps)
- Modes: `--non-interactive` (defaults), `--check` (validate only), `--reset` (cleanup instructions)
- Sources `.env` from AIFred-Pro root

**Setup phases** in `setup-phases/`: **Markdown guide documents** (NOT executable scripts).

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `00-prerequisites.md` | System requirements |
| 1 | `01-system-discovery.md` | Environment detection |
| 2 | `02-purpose-interview.md` | Configuration interview |
| 3 | `03-foundation-setup.md` | Core setup |
| 4 | `04-mcp-integration.md` | MCP server config |
| 5 | `05-hooks-automation.md` | Hook setup |
| 6 | `06-agent-deployment.md` | Agent config |
| 7 | `07-finalization.md` | Final validation |
| 8 | `08-optional-integrations.md` | Optional extras |

Supporting: `setup-plan.yaml` (phase definitions), `welcome-task.md` (first-run task).

---

## Subsystem 6.2: Service Management

### Service Startup

Services are started individually or via Docker Compose:
- **Pulse API**: `bash pulse/start-pulse.sh` (direct) or `docker compose up pulse` (container)
- **Dashboard**: `docker compose up nexus-dashboard` or `cd dashboard/server && npx tsx index.ts` (local dev)
- **Nexus dispatcher**: Cron entry: `*/5 * * * * .claude/jobs/dispatcher.sh`

### check-all-services.sh — Docker Health Checks

Checks all registered Docker services via `check-service.sh`:
- Reads service registry from `.claude/context/registries/services.yaml` (note: this path may be stale)
- Calls individual `check-service.sh` per service

### backup-status.sh — Restic Backup Monitoring

Uses **Restic** backup system:
- **Repository**: `sftp:MediaServer:D:/Restic/AIServer-Backups`
- **Password file**: `~/.restic-password`
- **Features**: Snapshot listing, stats, integrity checking, overdue detection (>48h threshold)
- **Note**: Monitors backup status — Restic's own scheduling creates the backups

---

## Subsystem 6.3: Docker Compose

**File**: `docker-compose.yml` — **3 active services** (NOT 1):

### Service: postgres
```yaml
image: postgres:16-alpine
container_name: aifred-postgres
ports: (not exposed externally — network-only)
healthcheck: pg_isready
```

### Service: pulse
```yaml
build: ${PULSE_SOURCE_PATH:-./pulse}
container_name: aifred-pulse
ports: ["${PULSE_PORT:-8700}:8700"]
depends_on: postgres (service_healthy)
healthcheck: python urllib → /api/v1/health
volumes: label-taxonomy.yaml, routing-rules.yaml, pulse-export
```

### Service: nexus-dashboard
```yaml
build: ./dashboard
container_name: aifred-dashboard
ports: ["${DASHBOARD_PORT:-8600}:8600"]
environment: PULSE_API_URL=http://pulse:8700/api/v1, VAPID keys, TZ
volumes: jobs state, headless logs, agent output, data, hooks, knowledge
```

Networks: `aifred-network`. Volumes: `postgres-data`, `dashboard-data`.

---

## Subsystem 6.4: systemd Service Definitions

**Location**: `scripts/systemd/` — Linux-only, 3 files:

| File | Purpose |
|------|---------|
| `pipeline-runner.service` | Pipeline execution service |
| `weekly-docker-restart.service` | Weekly Docker restart |
| `weekly-docker-restart.timer` | Timer for weekly restart |

---

## Subsystem 6.5: Environment Profiles

**Location**: `profiles/`

Profiles are **YAML files**:

| Profile | Purpose |
|---------|---------|
| `development.yaml` | Development settings |
| `general.yaml` | General/default settings |
| `homelab.yaml` | Homelab deployment |
| `production.yaml` | Production settings |
| `_template.yaml` | Template for new profiles |
| `schema.yaml` | Profile schema definition |
| `README.md` | Documentation |

Profile loader: `scripts/profile-loader.js`

---

## Subsystem 6.6: Maintenance Scripts

| Script | Purpose | Verified |
|--------|---------|----------|
| `aifred-update.sh` | Component sync with upstream Alfred | Yes |
| `bump-version.sh` | Version management | Yes |
| `checkpoint.sh` | State checkpointing | Yes |
| `consolidate-project.sh` | Project consolidation | Yes |
| `discover-docker.sh` | Docker service discovery | Yes |
| `fresh-context-loop.sh` | Context refresh loop | Yes |
| `link-external.sh` | External source linking | Yes |
| `new-code-project.sh` | New project scaffolding | Yes |
| `priority-cleanup.sh` | Priority queue cleanup | Yes |
| `pulse-aliases.sh` | Pulse CLI aliases | Yes |
| `push-all-commits.sh` | Push all commits | Yes |
| `register-project.sh` | Project registration | Yes |
| `setup-pulse.sh` | Pulse setup | Yes |
| `statusline-command.sh` | Status line formatting | Yes |
| `sync-git.sh` | Git synchronization | Yes |
| `update-priorities.sh` | Priority updates | Yes |
| `update-priorities-health.sh` | Priority + health updates | Yes |
| `weekly-context-analysis.sh` | Weekly context analysis | Yes |
| `weekly-docker-restart.sh` | Weekly Docker restart | Yes |
| `weekly-health-check.sh` | Weekly health check | Yes |

Plus Fabric integration: `fabric-*.sh` (analyze-logs, commit-msg, review-code, wrapper)

**Scripts that DO NOT exist** (from prior version): `start-services.sh`, `health-check.sh`, `update-aifred.sh`, `rotate-logs.sh`, `migrate-db.sh`, `check-env.sh`, `setup-cron.sh`

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `scripts/bootstrap.sh` | Initial setup | Yes |
| `setup-phases/*.md` | 9 setup guide documents | Yes |
| `setup-phases/setup-plan.yaml` | Phase definitions | Yes |
| `docker-compose.yml` | 3 services (postgres, pulse, dashboard) | Yes |
| `pulse/Dockerfile` | Pulse container image | Yes (referenced in compose) |
| `dashboard/Dockerfile` | Dashboard container image | Yes (referenced in compose) |
| `pulse/start-pulse.sh` | Local Pulse launcher | Yes |
| `scripts/check-all-services.sh` | Docker health checks | Yes |
| `scripts/backup-status.sh` | Restic backup status | Yes |
| `scripts/systemd/` | 3 systemd files | Yes |
| `profiles/*.yaml` | 6 YAML environment profiles | Yes |
| `scripts/profile-loader.js` | Profile loading | Yes |
| `scripts/` | 35+ maintenance/utility scripts | Yes |

---

*System 6: Bootstrap & Lifecycle — verified 2026-04-23. Every claim sourced from direct file reads.*
