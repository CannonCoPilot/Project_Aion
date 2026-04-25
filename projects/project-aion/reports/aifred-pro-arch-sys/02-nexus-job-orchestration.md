# System 2: Nexus — Autonomous Job Orchestration Engine

**Purpose**: Headless AI job scheduling, dispatching, and execution. Nexus runs Claude Code sessions in the background on a cron schedule, using typed personas to constrain each job's capabilities, model tier, and budget.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  crontab (single entry):
    */5  dispatcher.sh  — check due jobs, fork executors

  dispatcher.sh
    ├── Sources: lib/common.sh, lib/nexus-settings.sh
    ├── Acquires flock on state/locks/dispatcher.lock
    ├── Reads registry.yaml → enabled jobs
    ├── Uses lib/jobsdb.py (Python) for SQLite state tracking
    ├── For each due job: records last_run, forks executor.sh
    └── Checks job_state.fail_count for retry backoff

  executor.sh (forked, one per job)
    ├── Sources: lib/common.sh, lib/label-ops.sh, lib/pulse-api.sh, lib/assertions.sh
    ├── Loads persona from personas/<name>/ (config.yaml, permissions.yaml, prompt.md)
    ├── Invokes: claude -p "$FULL_PROMPT" --model --allowedTools --max-turns
    │     --max-budget-usd --output-format json --no-session-persistence
    │     --allow-dangerously-skip-permissions --dangerously-skip-permissions
    ├── Supports multiple engines: claude-code (default), ollama
    ├── Records execution logs to .claude/logs/headless/executions/
    └── Sends notifications via lib/send-telegram.sh or lib/msgbus.sh

  lib/dispatcher-watchdog.sh
    └── Monitors dispatcher health (NOT a standalone watchdog.sh)
```

---

## Subsystem 2.1: Dispatcher

**File**: `.claude/jobs/dispatcher.sh`

### CLI Modes (from `show_help()`, lines 63-101)

| Flag | Purpose |
|------|---------|
| (none) | Normal cron execution — check due jobs, fork executors |
| `--list` | Show all registered jobs with schedule info |
| `--run <job-name>` | Force-run a specific job immediately |
| `--param key=value` | Pass parameters to job (repeatable, use with --run) |
| `--dry-run` | Show what would execute without running |
| `--check` | Check which jobs are due right now |
| `--status` | Show last run status for all jobs |
| `--dashboard` | Show observability dashboard (job status, costs, health) |
| `--history [N]` | Show last N notification records |
| `--ack <id>` | Acknowledge a notification by ID |

### Key Implementation Details

- **Sources**: `lib/common.sh` (colors, logging, `require_yq`, `reg_get`) and `lib/nexus-settings.sh`
- **Locking**: `flock -n` on `state/locks/dispatcher.lock` — exits immediately if held
- **Registry loading**: Via `reg_get` function from `lib/common.sh` (NOT `extract_yaml_field()`)
- **DB helper**: Python script `lib/jobsdb.py` — wrapper around SQLite for `job_state` table
- **State tracking**: `job_state` table with columns: `job` (PK), `last_run`, `fail_count`, `last_failure`
- **Due-time check**: `get_last_run()` queries `job_state`, compares against current epoch + interval
- **Failure handling**: `record_failure()` increments `fail_count`, `clear_failure()` resets on success
- **Retry backoff**: `is_retry_due()` checks `fail_count` and `last_failure` for exponential backoff

---

## Subsystem 2.2: Executor

**File**: `.claude/jobs/executor.sh`

### Claude CLI Invocation (actual flags, lines 998-1010)

```bash
timeout "${TIMEOUT_MINUTES}m" \
    claude -p "$FULL_PROMPT" \
    --model "$MODEL" \
    --allow-dangerously-skip-permissions \
    --dangerously-skip-permissions \
    --allowedTools "$ALLOWED_TOOLS" \
    --max-turns "$MAX_TURNS" \
    --max-budget-usd "$MAX_BUDGET" \
    --output-format json \
    --no-session-persistence \
    $EFFORT_FLAG \
    $ADD_DIR_FLAGS \
    < /dev/null
```

**Key differences from prior report**:
- Uses `-p` with inline prompt string (NOT `--prompt-file`)
- No `--system-prompt` — persona prompt is integrated into `$FULL_PROMPT`
- No `--no-interactive` — uses `--no-session-persistence` instead
- Has `--allow-dangerously-skip-permissions` and `--dangerously-skip-permissions`
- Has `--allowedTools` for persona-specific tool restrictions
- Has `--max-budget-usd` for cost control
- Has `--max-turns` for execution limits
- Wrapped in `timeout` for time-based safety
- `< /dev/null` for headless stdin

### Sources (lines 40-51)

| Source File | Purpose |
|-------------|---------|
| `lib/common.sh` | Shared utilities (colors, logging, `require_yq`, `reg_get`) |
| `lib/label-ops.sh` | Pulse label operations |
| `lib/pulse-api.sh` | Pulse REST API wrapper |
| `lib/assertions.sh` | Post-execution assertions (advisory, non-fatal) |

### Additional Features

- `--session <id>` for conversation continuity
- `--dry-run` mode shows what would execute
- `--persona <name>` override (used by team-runner)
- `--model-override`, `--max-budget-override`, `--max-turns-override`, `--timeout-override`
- Multiple engines: `claude-code` (default) and `ollama` (local, free)
- Execution logs written to `.claude/logs/headless/executions/`

---

## Subsystem 2.3: Library Layer

**Location**: `.claude/jobs/lib/` — 30+ files

### Key Libraries

| File | Purpose |
|------|---------|
| `common.sh` | Shared utilities: colors, logging, `require_yq`, `reg_get`, `reg_list` |
| `jobsdb.py` | Python SQLite helper for `job_state` tracking (init, exec, exec-scalar, exec-raw) |
| `send-telegram.sh` | Telegram Bot API notifications |
| `msgbus.sh` | Message bus for event notifications |
| `pulse-api.sh` | Pulse REST API wrapper |
| `label-ops.sh` | Pulse label management |
| `assertions.sh` | Post-execution assertion checks |
| `nexus-settings.sh` | Runtime settings loader |
| `cost-report.sh` | Token cost aggregation and reporting |
| `dispatcher-watchdog.sh` | Dispatcher health monitoring |
| `directive-runner.sh` | Directive execution |
| `sessions.sh` | Session management |
| `routing-helpers.sh` | Job routing logic |
| `trigger-ops.sh` | Trigger operations |
| `persona-health-check.sh` | Persona validation |
| `telegram-callback-handler.sh` | DEPRECATED (2026-03-12) |

**Files that DO NOT exist** (claimed in prior report): `shared.sh`, `logging.sh`, `callback.sh`

---

## Subsystem 2.4: Registry (registry.yaml)

**File**: `.claude/jobs/registry.yaml`

### Structure

- `version: 1`
- `quiet_hours:` — notification suppression (timezone: America/Denver, weekday 22-07, weekend 23-09)
- `defaults:` — engine: claude-code, model: sonnet, max_turns: 10, max_budget_usd: 2.00, timeout_minutes: 10
- `jobs:` — 12+ job definitions

### Registered Jobs

| Job Name | Purpose |
|----------|---------|
| `health-summary` | System health reporting |
| `persona-health-check` | Persona validation |
| `task-score` | Task scoring/prioritization |
| `task-investigator` | Task investigation |
| `task-executor` | Task execution |
| `doc-sync-check` | Documentation sync validation |
| `pipeline-review` | CI/CD pipeline review |
| `context-maintenance` | Context file maintenance |
| `creative-think` | Creative ideation |
| `creative-build` | Creative development |
| `creative-present` | Creative presentation |
| `weekly-digest` | Weekly summary |
| `ollama-test` | Local LLM testing |

### Schedule Types (from registry header comments)

| Type | Example |
|------|---------|
| `interval` | `every_hours: 6` |
| `daily` | `hour: 14` |
| `weekly` | `day: monday, hour: 9` |
| `on-demand` | Manual trigger only |

---

## Subsystem 2.5: Personas (24 directories)

**Location**: `.claude/jobs/personas/`

### Directory Structure (per persona)

```
personas/<name>/
├── config.yaml         # Engine, model, limits, output, session config
├── methodology.yaml    # Approach patterns and constraints
├── permissions.yaml    # Allowed/denied operations
└── prompt.md           # Task prompt template
```

### Example: analyst/config.yaml

```yaml
persona: analyst
engine:
  default: claude-code
  model: sonnet
  fallback: null
limits:
  max_turns: 15
  max_budget_usd: 3.00
  timeout_minutes: 15
output:
  format: json
  save_to: .claude/logs/headless/executions/
session:
  persist: false
```

### All 24 Personas

| Persona | Purpose |
|---------|---------|
| `ai-reviewer` | AI-powered code review |
| `analyst` | Research and discovery |
| `autofix-executor` | Automated fix execution |
| `backend-eng` | Backend development |
| `bug-fixer` | Bug triage and fixes |
| `context-maintainer` | Context/docs maintenance |
| `creative-action` | Creative execution |
| `creative-builder` | Creative development |
| `creative-feedback` | Creative review |
| `creative-presenter` | Creative presentation |
| `creative-thinker` | Creative ideation |
| `db-eng` | Database engineering |
| `infrastructure-deployer` | Infrastructure work |
| `investigator` | Issue investigation |
| `librarian` | Knowledge management |
| `pipeline-reviewer` | CI/CD review |
| `project-manager` | Project coordination |
| `researcher` | Research tasks |
| `security-reviewer` | Security auditing |
| `task-evaluator` | Task evaluation |
| `task-investigator` | Task investigation |
| `team-verdict` | Multi-agent consensus |
| `troubleshooter` | Problem diagnosis |
| `ux-eng` | UX engineering |

---

## Subsystem 2.6: Pulsars (pulsars.yaml)

**File**: `.claude/jobs/pulsars.yaml`

Event-driven job triggers. Each pulsar defines trigger events, persona, and prompt template. Trigger operations handled by `lib/trigger-ops.sh` and `lib/watch-trigger-ops.sh`. Dashboard config references pulsars at `config.ts:54-59`.

---

## Subsystem 2.7: Notification System

### Telegram (lib/send-telegram.sh)

- Bot: `@KeryxArchon_bot`
- **Credentials configured** in `.claude/jobs/.env`: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are populated
- Sends via Telegram Bot API `sendMessage` endpoint

### Message Bus (lib/msgbus.sh)

Event store for notifications:
- Written by executor on job completion/failure
- Read by Dashboard via WebSocket or polling
- Rotation handled by `lib/msgbus-rotate.sh`

### Quiet Hours (registry.yaml)

- Timezone: America/Denver
- Weekday: 22:00–07:00 suppressed
- Weekend: 23:00–09:00 suppressed
- `critical` severity bypasses quiet hours
- Batch release when DND ends

---

## Configuration (.claude/jobs/.env)

| Variable | Status | Notes |
|----------|--------|-------|
| `TELEGRAM_BOT_TOKEN` | **Set** | @KeryxArchon_bot token |
| `TELEGRAM_CHAT_ID` | **Set** | Target chat ID |

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `.claude/jobs/dispatcher.sh` | Master scheduler (cron, flock, registry reader) | Yes |
| `.claude/jobs/executor.sh` | Persona-aware Claude execution | Yes |
| `.claude/jobs/registry.yaml` | Job definitions (12+ jobs) | Yes |
| `.claude/jobs/lib/common.sh` | Shared utilities | Yes |
| `.claude/jobs/lib/jobsdb.py` | SQLite helper (job_state) | Yes |
| `.claude/jobs/lib/send-telegram.sh` | Telegram notifications | Yes |
| `.claude/jobs/lib/msgbus.sh` | Message bus | Yes |
| `.claude/jobs/lib/pulse-api.sh` | Pulse REST wrapper | Yes |
| `.claude/jobs/lib/label-ops.sh` | Label operations | Yes |
| `.claude/jobs/lib/assertions.sh` | Post-execution checks | Yes |
| `.claude/jobs/lib/dispatcher-watchdog.sh` | Dispatcher health | Yes |
| `.claude/jobs/lib/nexus-settings.sh` | Settings loader | Yes |
| `.claude/jobs/personas/` | 24 persona directories | Yes |
| `.claude/jobs/pulsars.yaml` | Event-driven triggers | Yes |
| `.claude/jobs/.env` | Telegram credentials (populated) | Yes |

---

*System 2: Nexus — verified 2026-04-23. Every claim sourced from direct file reads.*
