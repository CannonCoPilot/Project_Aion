# Plan: AIfred-Pro + Jarvis Cooperative Archon Deployment

## Context

**Why**: Project Aion is shifting from "Jarvis keeps up with AIfred" to "Jarvis and AIfred work as cooperative peers." AIfred-Pro (v3.2.0) brings Nexus (headless job orchestration with 24 personas), Pulse (PostgreSQL task management with 60+ labels), and eventually Loom (local LLM content generation). Jarvis brings deep coding sessions, JICM context management, 4-tier memory hierarchy, and the Chronicler project. Together they form a two-Archon system: Jarvis (Master Archon — deep work) and AIfred (Operations Archon — always-on infrastructure).

**Pulse source**: NOT bundled in AIfred-Pro. The `./pulse/` directory doesn't exist. Scripts reference `git clone <pulse-repo>` (placeholder) and `pip install pulse-tasks`. Pulse is Dave's proprietary service. **Resolution**: Ask Dave for the Pulse repo. In the meantime, the Nexus jobs system can operate via the `pulse-api.sh` curl wrapper against any Pulse-compatible REST API — including one we build ourselves if needed.

**Telegram**: User has @Keryx_Archon bot ready at `https://t.me/Keryx_Archon`. Integrate into Nexus msg-relay.

**Bash**: `#!/usr/bin/env bash` already resolves to 5.3.9. AIfred-Pro v3.2.0 adds 24 personas, pipeline-runner.sh, pipeline-watchdog.sh, Gemini API support, and GitHub ops.

---

## Phase 1: Environment Preparation

### 1.1 Register bash 5.3 in /etc/shells
- `sudo sh -c 'echo /opt/local/bin/bash >> /etc/shells'`
- **Requires**: User confirmation (sudo)
- **Done**: `grep '/opt/local/bin/bash' /etc/shells` succeeds

### 1.2 Fix shebangs in AIfred-Pro scripts
- Change `#!/bin/bash` → `#!/usr/bin/env bash` in all .sh files
- ~44 files across `scripts/`, `.claude/jobs/`, `tests/`
- **Batch command**: `find /Users/nathanielcannon/Claude/AIFred-Pro -name '*.sh' -exec grep -l '#!/bin/bash' {} \; | xargs sed -i '' '1s|^#!/bin/bash|#!/usr/bin/env bash|'`
- **Done**: `grep -r '#!/bin/bash' /Users/nathanielcannon/Claude/AIFred-Pro/ --include='*.sh'` returns empty

### 1.3 Fix `grep -oP` (GNU Perl regex → POSIX)
- 14 occurrences in 5 files. macOS grep doesn't support `-P`.
- Replace each with `sed` equivalent:
  - `bootstrap.sh:32` — `grep -oP "${1}=\K.*"` → `sed -n "s/^${1}=//p"`
  - `executor.sh:953-1001` — `grep -oP 'QUESTION:\s*\K.*'` → `sed -n 's/.*QUESTION:[[:space:]]*/\1/p'`
  - `check-gateway.sh` — `grep -oP 'inet \K[\d.]+'` → `sed -n 's/.*inet \([0-9.]*\).*/\1/p'`
  - `telegram-callback-handler.sh` — `grep -oP '\d+'` → `sed 's/[^0-9]//g'`
- **Done**: `grep -rn 'grep.*-oP\|grep.*-P' --include='*.sh'` returns empty

### 1.4 Audit `set -euo pipefail` in critical scripts
- dispatcher.sh and executor.sh both use it. This is fine for standalone scripts (not hooks).
- Verify all `grep` calls have `|| true` guards where empty match is possible.
- **Done**: dispatcher.sh and executor.sh run `--dry-run` without errors

---

## Phase 2: Infrastructure Integration

### 2.1 Add `pulse` database to Jarvis PostgreSQL
- **File**: `/Users/nathanielcannon/Claude/Jarvis/infrastructure/init-scripts/01-create-databases.sql`
- Add: `CREATE DATABASE pulse; CREATE USER pulse WITH PASSWORD '<password>'; GRANT ALL ON DATABASE pulse TO pulse;`
- For running container: execute via `docker exec -u postgres jarvis-postgres psql`
- **Done**: `docker exec jarvis-postgres psql -U jarvis -d pulse -c 'SELECT 1'` succeeds

### 2.2 Resolve Pulse source code
- `./pulse/` directory does not exist in AIfred-Pro. `setup-pulse.sh` references `git clone <pulse-repo>` (placeholder) and `pip install pulse-tasks`.
- **Action**: Ask Dave O'Neil for the Pulse repo URL. Clone to `AIFred-Pro/pulse/`.
- **Fallback**: If Pulse repo unavailable, build a Pulse-compatible REST API ourselves using FastAPI + PostgreSQL (~200 lines), implementing the endpoints that `pulse-api.sh` calls (GET/POST/PUT tasks, health, labels, transitions).
- **Interim**: Nexus scripts can be tested with `pulse-api.sh` mocked against a stub server.

### 2.3 Create Docker Compose override for Mac Studio
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/docker-compose.mac-studio.yml` (new)
- Removes `postgres` service (uses Jarvis's), connects `pulse` to `jarvis-net` external network
- Overrides `PULSE_DB_HOST=jarvis-postgres`
- **Usage**: `docker compose -f docker-compose.yml -f docker-compose.mac-studio.yml up -d pulse`

### 2.4 Create `.env` for Mac Studio
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.env` (new, gitignored)
- Generated password matching what we created in 2.1
- `PULSE_PORT=8700`, `AIFRED_PATH=/Users/nathanielcannon/Claude/AIFred-Pro`

### 2.5 Store Pulse credentials in Jarvis secrets
- **File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/secrets/credentials.yaml`
- Add `pulse:` section with db credentials and API URL

### 2.6 Start and validate Pulse
- Start: `docker compose -f docker-compose.yml -f docker-compose.mac-studio.yml up -d pulse`
- Validate: `curl -sf http://localhost:8700/api/v1/health | jq .` returns `{"status":"ok"}`

---

## Phase 3: AIfred-Pro Activation

### 3.1 Run adapted bootstrap
- After Phase 1+2, run `bash scripts/bootstrap.sh` from AIFred-Pro root
- Bootstrap will: verify tools, detect Pulse running, import 27-task setup plan, register cron

### 3.2 Register Nexus cron jobs
- Three entries via `crontab -e`:
  ```
  PATH=/opt/local/bin:/usr/local/bin:/usr/bin:/bin
  */5 * * * * /Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/dispatcher.sh >> ...dispatcher.log 2>&1
  */5 * * * * /Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/lib/telegram-callback-handler.sh >> ...callback.log 2>&1
  */15 * * * * /Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/lib/dispatcher-watchdog.sh >> ...watchdog.log 2>&1
  ```
- **Critical**: `PATH=` line at top ensures cron finds bash 5.3, yq, jq
- **Requires**: User confirmation

### 3.2b Configure Telegram (@Keryx_Archon)
- **Bot**: @Keryx_Archon (`https://t.me/Keryx_Archon`)
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/.env`
- **Action**: Set `TELEGRAM_BOT_TOKEN=<token-from-BotFather>` and `TELEGRAM_CHAT_ID=<user-chat-id>`
- Get chat ID by messaging the bot and querying `https://api.telegram.org/bot<TOKEN>/getUpdates`
- **Done**: `curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" -d "chat_id=${CHAT_ID}&text=Keryx online"` delivers message

### 3.3 Initialize Nexus job database
- `python3 /Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/lib/jobsdb.py init`

### 3.4 Configure job registry for Mac Studio
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/registry.yaml`
- Adapt health-check job to monitor `jarvis-postgres`, `jarvis-qdrant`, `jarvis-neo4j`, `jarvis-redis`, `aifred-pulse`
- Disable Linux-specific jobs initially
- Set timezone to user's local timezone

### 3.5 Adapt CLAUDE.md hard gate
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/CLAUDE.md`
- Update health checks to reference `jarvis-postgres` (not `aifred-postgres`)
- Pulse check remains: `curl -sf http://localhost:8700/api/v1/health`

### 3.6 Configure paths-registry.yaml
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/paths-registry.yaml`
- Point to Mac Studio infrastructure (Jarvis containers), project paths

---

## Phase 4: Cooperation Layer

### 4.1 Define cross-Archon label conventions
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/context/tools/label-taxonomy.yaml`
- Add: `agent:jarvis`, `agent:aifred`, `agent:shared` to metadata category
- Convention: owning Archon creates with its label; both can read all tasks

### 4.2 Build Pulse MCP server for Jarvis
- **File**: `/Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/pulse_mcp_server.py` (new)
- FastMCP 3.0 with 6 tools: `pulse_list`, `pulse_show`, `pulse_create`, `pulse_update`, `pulse_close`, `pulse_stats`
- HTTP client to `http://localhost:8700/api/v1`
- Register in `.mcp.json` as `jarvis-pulse`

### 4.3 Create Pulse skill for Jarvis
- **File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/pulse-ops/SKILL.md` (new)
- Lean skill doc (<100 lines) with tool reference, label conventions, task workflows

### 4.4 Update Jarvis capability map
- **File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/psyche/capability-map.yaml`
- Add `skill.pulse-ops` entry

### 4.5 Add Pulse health check to Jarvis launch script
- **File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/launch-jarvis-tmux.sh`
- Add Pulse health check in pre-flight section (informational, not blocking)

### 4.6 Configure Nexus jobs to use agent labels
- **File**: `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/registry.yaml`
- All job prompts: tag created tasks with `agent:aifred`
- task-executor filters on `agent:aifred` to avoid executing Jarvis tasks

### 4.7 Update Jarvis MEMORY.md with AIFred-Pro info
- Add AIFred-Pro location, Pulse API URL, label conventions, MCP registration

---

## Phase 5: Validation

### 5.1 Infrastructure health
- All Jarvis Docker containers healthy
- Pulse API responds on :8700
- Pulse can query its PostgreSQL database

### 5.2 Cross-Archon task CRUD
- Create task from AIFred (CLI): `pulse create "Test" -l agent:aifred`
- Create task from Jarvis (MCP): `pulse_create(title="Test", labels=["agent:jarvis"])`
- Both see each other's tasks

### 5.3 Nexus dispatcher dry-run
- `dispatcher.sh --dry-run` completes without errors
- `executor.sh --job health-check --dry-run` completes

### 5.4 Cron execution test
- Force-run health check: `dispatcher.sh --run health-check`
- Verify output in `.claude/logs/headless/executions/`

---

## Critical Files

| File | Action | Phase |
|------|--------|-------|
| AIFred-Pro `scripts/*.sh` (44 files) | Fix shebangs | 1.2 |
| AIFred-Pro `executor.sh`, `bootstrap.sh` | Fix grep -oP | 1.3 |
| Jarvis `infrastructure/init-scripts/01-create-databases.sql` | Add pulse DB | 2.1 |
| AIFred-Pro `docker-compose.mac-studio.yml` | New — override for shared PG | 2.3 |
| AIFred-Pro `.env` | New — Mac Studio config | 2.4 |
| Jarvis `infrastructure/rag-service/pulse_mcp_server.py` | New — Pulse MCP | 4.2 |
| Jarvis `.claude/skills/pulse-ops/SKILL.md` | New — Pulse skill | 4.3 |
| Jarvis `capability-map.yaml` | Add pulse-ops | 4.4 |
| Jarvis `launch-jarvis-tmux.sh` | Add Pulse health check | 4.5 |

## Decisions Needed From User

1. **Pulse source code**: Clone URL, or connect to Dave's hosted instance, or build our own?
2. **Telegram bot**: Set up now or defer? (Needed for async notifications)
3. **Cron registration**: Approve dispatcher cron entries?
4. **sudo**: Approve `/etc/shells` modification?

---

## Verification

After all phases complete:
- `bash 5.3` available via `#!/usr/bin/env bash`
- Pulse healthy on :8700, database in Jarvis PostgreSQL
- Nexus dispatcher running via cron (every 5 min)
- Jarvis can create/list Pulse tasks via MCP
- AIFred Nexus jobs tag tasks with `agent:aifred`
- Both Archons see all tasks in shared Pulse instance
