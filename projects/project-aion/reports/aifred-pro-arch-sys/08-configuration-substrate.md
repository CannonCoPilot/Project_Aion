# System 8: Configuration Substrate — The Foundation Layer

**Purpose**: Environment variables, paths, profiles, master configuration, and version management. The foundation that every other system reads from.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  Configuration Hierarchy (precedence: top overrides bottom)
  
  ┌─────────────────────────┐
  │ Environment variables   │  ← Set in shell, highest priority
  ├─────────────────────────┤
  │ .env (root)             │  ← DB, ports, tokens, paths
  ├─────────────────────────┤
  │ profiles/*.yaml         │  ← YAML environment profiles
  ├─────────────────────────┤
  │ .aifred.yaml            │  ← Component sync manifest (1120 lines)
  ├─────────────────────────┤
  │ paths-registry.yaml     │  ← Hosts, Docker, services, paths
  ├─────────────────────────┤
  │ .mcp.json               │  ← MCP server config (mcp-gateway Docker)
  └─────────────────────────┘
```

---

## Subsystem 8.1: Environment Variables (.env)

**Files**: `.env` (active, gitignored, 600 permissions) + `.env.template` (committed)

### Verified Keys (from .env)

| Variable | Purpose |
|----------|---------|
| `PULSE_DB_NAME` | PostgreSQL database name |
| `PULSE_DB_USER` | PostgreSQL user |
| `PULSE_DB_PASSWORD` | PostgreSQL password |
| `PULSE_PORT` | Pulse API port |
| `PULSE_LOG_LEVEL` | Pulse logging level |
| `DASHBOARD_PORT` | Dashboard port |
| `PULSE_DASHBOARD_TOKEN` | Dashboard ↔ Pulse auth |
| `PULSE_SOURCE_PATH` | Path to Pulse source |
| `DEFAULT_WORKSPACE` | Default workspace name |
| `AIFRED_PATH` | AIFred-Pro root path |
| `OLLAMA_URL` | Ollama endpoint |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | Web Push subject |
| `TZ` | Timezone |

### Template→Customize Pattern (3 file pairs, verified)

| Template | Active File |
|----------|-------------|
| `.env.template` | `.env` |
| `paths-registry.yaml.template` | `paths-registry.yaml` |
| `.aifred-ignore.template` | `.aifred-ignore` |

### Pulse Database Resolution (start-pulse.sh)

`pulse/start-pulse.sh` sources `.env` from AIFred-Pro root, then exports individual `PULSE_DB_*` variables:
```bash
source "$AIFRED_ROOT/.env"
export PULSE_DB_HOST="${PULSE_DB_HOST:-localhost}"
export PULSE_DB_PORT="${PULSE_DB_PORT:-5432}"
export PULSE_DB_NAME="${PULSE_DB_NAME:-pulse}"
export PULSE_DB_USER="${PULSE_DB_USER:-pulse}"
export PULSE_DB_PASSWORD="${PULSE_DB_PASSWORD}"
```

**Note**: No `DATABASE_URL` construction. No `pulse/.env` fallback. Individual vars passed directly.

---

## Subsystem 8.2: Component Manifest (.aifred.yaml)

**1120 lines.** Component sync manifest (NOT runtime config). Tracks upstream Alfred baseline synchronization.

```yaml
aifred_version: "v3.2.0"
upstream_url: "git@github.com:CannonCoPilot/Alfred.git"
last_check: "2026-04-22T22:11:09Z"
last_update: "2026-04-22T22:11:09Z"
notify: true

components:
  hooks/_profile-check.js:
    source_version: "v3.2.0"
    source_sha: "92b90a..."
    local_sha: "92b90a..."
    status: current
  # ... 100+ component entries
```

Managed by `scripts/aifred-update.sh init`. **Does NOT define plugins, Nexus settings, or logging.**

---

## Subsystem 8.3: Path Registry (paths-registry.yaml)

Comprehensive path and host registry (version 2.0, updated 2026-04-22). Sections include:

| Section | Content |
|---------|---------|
| `hosts` | Local machine identity (hostname, IPs, Tailscale, role, OS, cores, RAM) |
| `docker` | Docker socket, compose directory |
| (additional sections) | Service paths, infrastructure paths, etc. |

Template: `paths-registry.yaml.template` for new installations.

---

## Subsystem 8.4: AI Tool Configuration

### .mcp.json (verified)

```json
{
  "mcpServers": {
    "mcp-gateway": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", "aifred-mcp-memory:/data/memory",
        "docker/mcp-gateway:latest"],
      "env": {"MCP_SERVERS": "memory,fetch"}
    }
  }
}
```

**Note**: Registers `mcp-gateway` Docker container (memory + fetch servers). Does NOT register `jarvis-pulse` — that's a Jarvis-side configuration.

### opencode.json (verified)

OpenCode configuration. Sets default agent to "build", loads `.claude/context/_index.md` as instructions.

---

## Subsystem 8.5: Docker Compose

**File**: `docker-compose.yml` — **3 active services** (see Report 06 for details):

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:16-alpine | (internal) | Database |
| `pulse` | aifred-pulse:latest | 8700 | Task API |
| `nexus-dashboard` | ./dashboard | 8600 | Dashboard |

---

## Subsystem 8.6: Version Management

| File | Content | Verified |
|------|---------|----------|
| `VERSION` | `3.2.0` | Yes |
| `CHANGELOG-standardization-sync.md` | Version history | Yes |

---

## Subsystem 8.7: Environment Profiles

**Location**: `profiles/` — **YAML files** (NOT .env):

| File | Purpose |
|------|---------|
| `development.yaml` | Development settings |
| `general.yaml` | General/default |
| `homelab.yaml` | Homelab deployment |
| `production.yaml` | Production settings |
| `_template.yaml` | Template for new profiles |
| `schema.yaml` | Profile schema definition |
| `README.md` | Documentation |

Loaded by `scripts/profile-loader.js`.

---

## Subsystem 8.8: Nexus-Specific Config

**File**: `.claude/jobs/.env` (separate from root `.env`)

Verified contents (3 lines):
```
TELEGRAM_BOT_TOKEN=<populated>
TELEGRAM_CHAT_ID=<populated>
```

**Note**: Only Telegram credentials. The prior report's claimed 10 variables (`JOBS_DB`, `LOG_LEVEL`, `MAX_CONCURRENT`, etc.) are NOT present in this file.

---

## Subsystem 8.9: Plans

**Location**: `.claude/plans/` — 2 files:

| File | Subject |
|------|---------|
| `2026-04-22-multi-space-setup.md` | Multi-workspace setup plan |
| `2026-04-22-pulse-task-mapping.json` | Pulse task mapping data |

---

## Subsystem 8.10: Registries

**Location**: `.claude/registries/`

| File | Purpose |
|------|---------|
| `credential-governance.yaml` | Credential access policies (consumed by credential-guard.js) |
| `manifest.yaml` | Registry manifest (tracks all registries) |
| `schemas/` | Schema definitions |

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `.env` | Active secrets and settings | Yes |
| `.env.template` | Template with placeholders | Yes |
| `profiles/*.yaml` | 6 YAML environment profiles | Yes |
| `scripts/profile-loader.js` | Profile loading | Yes |
| `.aifred.yaml` | Component sync manifest (1120 lines) | Yes |
| `paths-registry.yaml` | Host/path registry (v2.0) | Yes |
| `paths-registry.yaml.template` | Path registry template | Yes |
| `.mcp.json` | MCP config (mcp-gateway Docker) | Yes |
| `opencode.json` | OpenCode AI config | Yes |
| `docker-compose.yml` | 3 container services | Yes |
| `VERSION` | `3.2.0` | Yes |
| `CHANGELOG-standardization-sync.md` | Version history | Yes |
| `.claude/jobs/.env` | Nexus Telegram credentials | Yes |
| `.claude/config/` | 4 config files (active-profile, feature-registry, profile-config) | Yes |
| `.claude/registries/` | 3 entries (credential-governance, manifest, schemas) | Yes |
| `.claude/plans/` | 2 plan files | Yes |
| `.aifred-ignore` | Operation ignore patterns | Yes |
| `.aifred-ignore.template` | Ignore patterns template | Yes |

---

*System 8: Configuration Substrate — verified 2026-04-23. Every claim sourced from direct file reads.*
