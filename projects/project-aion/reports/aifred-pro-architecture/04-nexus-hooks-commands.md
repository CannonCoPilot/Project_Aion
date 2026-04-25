# AIFred-Pro Architecture Report: Nexus Jobs, Hooks & Commands

**Report**: 04 of 10
**Scope**: `.claude/jobs/` (34 files), `.claude/hooks/` (4 files), `.claude/commands/` (7 files) = 45 files
**Date**: 2026-04-23

---

## 1. Nexus Job System

Architecture: Cron (5 min) -> `dispatcher.sh` -> `executor.sh` (per job, backgrounded), using `registry.yaml` for definitions, `personas/*.yaml` for role configs, `state/jobs.db` for SQLite state tracking, `lib/{shared,logging,callback}.sh` for utilities.

```
cron (5 min)
  |
  v
dispatcher.sh
  |-- reads registry.yaml (regex parser, no yq dep)
  |-- checks state/{job-id}.last_run vs interval
  |-- dispatches due jobs:
  v
executor.sh (backgrounded, one per job)
  |-- resolves persona YAML -> system_prompt, allowed_tools, model
  |-- builds `claude --print` command
  |-- captures output to tempfile
  |-- updates SQLite state
  |-- sends callback if configured
```

### 1.1 executor.sh -- Job Runner

Parses args: `--job-id`, `--persona`, `--prompt`, `--project-dir`, `--max-turns` (default 10), `--timeout` (default 300s), `--dry-run`, `--callback`. Resolves persona YAML, extracts `system_prompt` / `allowed_tools` / `model`. Builds `claude --print` command with `--model`, `--system-prompt`, `--max-turns`, per-tool `--allowedTools` flags. Pipes prompt via stdin. Captures output to tempfile. Updates SQLite state. Sends callback if configured. Uses `set -euo pipefail` with `set +e` wrapper around execution.

### 1.2 dispatcher.sh -- Scheduler

Lock file with PID-based stale detection. Reads `registry.yaml` line-by-line with regex YAML parsing (no `yq` dependency). Checks `state/{job-id}.last_run` against parsed interval. Dispatches due jobs via `executor.sh` in background. Interval parsing: `15m`=900s, `6h`=21600s, `24h`=86400s, default=300s.

### 1.3 Library Files

**lib/shared.sh**:
- `extract_yaml_field()` -- regex YAML parser, handles single-line and block scalars
- `parse_interval()` -- converts human-readable intervals to seconds
- `init_db()` -- creates SQLite tables if absent
- `update_job_status()` -- upsert `jobs` table + append `job_history`
- `get_job_status()` -- query current job state

**lib/logging.sh**:
- 4 levels: `DEBUG` / `INFO` / `WARN` / `ERROR`
- Colorized console output
- File output to `logs/nexus.log`
- `DEBUG` gated by `AIFRED_LOG_LEVEL`

**lib/callback.sh**:
- `send_callback()` -- HTTP POST JSON with `job_id` / `status` / `exit_code` / `result` / `timestamp`
- `send_telegram()` -- Telegram Bot API with Markdown formatting
- Sources `.env` for credentials

### 1.4 Registry (registry.yaml) -- 7 Jobs, 3 Enabled

| Job | Persona | Schedule | Enabled | Timeout |
|-----|---------|----------|---------|---------|
| health-sweep | healthcheck | 15m | **YES** | 120s |
| security-scan | securityanalyst | 6h | **YES** | 300s |
| doc-freshness | auditor | 24h | **YES** | 180s |
| dependency-check | scout | 24h | no | 180s |
| test-suite | tester | 12h | no | 600s |
| code-quality | codereviewer | 24h | no | 300s |
| performance-check | optimizer | 12h | no | 180s |

### 1.5 Pulsars (pulsars.yaml) -- ALL Disabled, Aspirational

5 event-driven triggers defined. No implementation exists for processing pulsars.

| Pulsar | Event | Target Persona | Status |
|--------|-------|----------------|--------|
| on-push | `git_push` | reviewer | disabled |
| on-error | `error_log` | debugger | disabled |
| on-deploy | `deploy_complete` | healthcheck | disabled |
| on-alert | `monitoring_alert` | triager | disabled |
| on-task-created | `pulse_task` (webhook) | taskmaster | disabled |

### 1.6 Environment (.env)

| Variable | Value | Notes |
|----------|-------|-------|
| `AIFRED_LOG_LEVEL` | `info` | |
| `AIFRED_STATE_DIR` | `./state` | |
| `AIFRED_CALLBACK_URL` | `http://localhost:8700/api/callback` | |
| `AIFRED_MAX_CONCURRENT` | `3` | **Not enforced** |
| `TELEGRAM_BOT_TOKEN` | (empty) | Not configured |
| `TELEGRAM_CHAT_ID` | (empty) | Not configured |
| `PULSE_API_URL` | `http://localhost:8700` | |
| `DEFAULT_PROJECT_DIR` | `/Users/nathanielcannon/Claude/AIFred-Pro` | |

### 1.7 Persona System -- 24 Personas

**Model distribution**:

| Tier | Model | Count | Personas |
|------|-------|-------|----------|
| Opus | claude-opus | 3 | architect, researcher, strategist |
| Sonnet | claude-sonnet | 17 | (most operational roles) |
| Haiku | claude-haiku | 4 | healthcheck, monitor, communicator, scheduler |

**Tool permission tiers**:

| Tier | Tools | Personas |
|------|-------|----------|
| Read-only | Read, Glob, Grep, Bash, List | communicator, healthcheck, monitor, scheduler, auditor, codereviewer, debugger, optimizer, reviewer, securityanalyst, triager |
| Read-write | +Write | architect, dataengineer, devops, documenter, integrator, learner, planner, strategist, taskmaster, tester |
| Full mutate | +Write, +Edit | fixer only |
| Web access | +WebSearch, +WebFetch | researcher, scout only |

Each persona YAML contains: `name`, `model`, `system_prompt` (multi-line block scalar), `allowed_tools` (comma-separated string).

### 1.8 State (jobs.db)

SQLite database with two tables:

| Table | Columns | Purpose |
|-------|---------|---------|
| `jobs` | `job_id` PK, `status`, `result`, `created_at`, `updated_at` | Current state per job |
| `job_history` | `id` auto, `job_id`, `status`, `result`, `timestamp` | Append-only audit trail |

---

## 2. Hooks System -- 4 Files, 3 Registered

Registration in `settings.json`:

| Hook | Event | Tool Filter | Behavior |
|------|-------|-------------|----------|
| `block-secrets.js` | PreToolUse | Write, Edit | **BLOCKING** |
| `pre-commit-check.js` | PreToolUse | Bash | **BLOCKING/ASK** |
| `enforce-style.js` | PostToolUse | Write | Advisory |
| `scan-secrets.sh` | -- | -- | Standalone utility (not a hook) |

### 2.1 block-secrets.js (BLOCKING)

PreToolUse on Write/Edit. Checks file content against 7 regex patterns:
- API keys (`[Aa]pi[_-]?[Kk]ey`)
- Secrets / passwords
- AWS access keys (`AKIA`)
- PEM headers (`BEGIN.*PRIVATE KEY`)
- GitHub PATs (`ghp_`, `gho_`, `ghs_`)
- OpenAI keys (`sk-`)
- Slack tokens (`xoxb-`, `xoxp-`)

Blocks the tool call with an explanation if any pattern matches.

### 2.2 pre-commit-check.js (BLOCKING/ASK)

PreToolUse on Bash when command contains `git commit` or `git push`.

| Condition | Action |
|-----------|--------|
| Force push to main/master/production | **BLOCK** |
| Commit without `-m` flag | **WARN** |
| Adding binary/archive files | **ASK** user for confirmation |

### 2.3 enforce-style.js (Advisory)

PostToolUse on Write. Never blocks. Issues warnings for:
- Wrong shebang in `.sh` files (expects `#!/usr/bin/env bash`)
- Excessive `console.log` in `.js` files
- Missing return type hints in `.py` files
- `TODO` / `FIXME` / `HACK` markers in any file

### 2.4 scan-secrets.sh (Utility, Not a Hook)

Standalone scanner invoked by the `security-scan` Nexus job. 9 regex patterns. Scans `.py` / `.js` / `.ts` / `.yaml` / `.json` / `.env` / `.sh` files, excludes `node_modules/` and `.git/`. Outputs a report file. Exits 1 if secrets found.

---

## 3. Commands -- 7 Slash Commands

### 3.1 /deploy

Full deployment workflow with pre-checks, build, deploy, and post-deploy health verification. Production deployments require explicit user confirmation before proceeding.

### 3.2 /healthcheck

Comprehensive health check covering: Docker containers, PostgreSQL connectivity, API endpoints, system resources (disk/memory/CPU), and Nexus job states.

### 3.3 /improve

Self-improvement cycle analyzing: code quality, documentation freshness, test coverage, security posture, and performance. Supports `--auto-fix` flag to apply fixes without confirmation.

### 3.4 /nexus

Job management interface: `status` (current state), `run <job>` (immediate execution), `list` (all jobs), `history <job>` (execution log), `enable`/`disable` (toggle jobs).

### 3.5 /onboard

New project setup: detect tech stack, create `.claude/` directory structure, configure hooks, register Nexus jobs, generate initial documentation.

### 3.6 /review

Code review workflow: quality analysis, security scanning, architecture assessment. Findings categorized as Critical / Warning / Info.

### 3.7 /status

One-screen system dashboard: service health, Nexus job status, git branch/commit state, system resource utilization.

---

## 4. Issues and Gaps

### 4.1 Functional Gaps

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | Pulsar trigger engine missing | Medium | `pulsars.yaml` defines 5 event-driven triggers but no code exists to process them. The entire event-driven layer is aspirational. |
| 2 | MAX_CONCURRENT not enforced | Low | `.env` defines `AIFRED_MAX_CONCURRENT=3` but `dispatcher.sh` launches all due jobs unconditionally without checking running count. |
| 3 | Telegram not configured | Low | `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are empty in `.env`. `send_telegram()` will silently fail. |
| 4 | Callback endpoint unverified | Medium | `http://localhost:8700/api/callback` is referenced but may not be implemented in the Pulse API. Dead callbacks are silently discarded. |

### 4.2 Robustness Risks

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 5 | SQL injection risk | High | `update_job_status()` in `lib/shared.sh` interpolates `$result` directly into SQL with only single-quote escaping (`${result//\'/\'\'}`). Crafted job output could escape this. |
| 6 | `set -euo pipefail` on macOS | Medium | `executor.sh` and `dispatcher.sh` use `set -euo pipefail`. On macOS bash 3.2, `grep` returning no matches (exit 1) or unset variables in conditionals will kill the script unexpectedly. |
| 7 | YAML parsing fragility | Medium | Regex-based YAML parsing in `extract_yaml_field()` handles single-line values and block scalars but will break on: flow mappings (`{key: val}`), multi-line quoted strings, anchors/aliases, or nested structures beyond one level. |

---

*AIFred-Pro Architecture Report 04/10 -- Nexus Jobs, Hooks & Commands*
