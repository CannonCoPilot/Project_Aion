# AIfred Nexus Jobs

Autonomous job execution framework. Cron-driven dispatcher evaluates schedules every 5 minutes, launches persona-aware executor for due jobs.

## Architecture

```
cron (*/5 * * * *)
  └─ dispatcher.sh          # Schedule engine (pure bash, no LLM)
       ├─ registry.yaml     # Job definitions, schedules, budgets
       ├─ executor.sh       # Persona-aware claude CLI wrapper
       │    └─ personas/    # Permission profiles (prompt + config + permissions)
       ├─ workflows/        # Workflow instruction files (.md + n8n .json)
       ├─ lib/
       │    ├─ msgbus.sh    # Append-only event store (messages.jsonl)
       │    ├─ msg-relay.sh # Routes events: dashboard (all) + Telegram (critical only)
       │    ├─ send-telegram.sh       # Telegram pager (plain messages)
       │    ├─ dashboard.sh            # Terminal observability dashboard
       │    ├─ cost-report.sh          # Cost aggregation and alerting
       │    ├─ weekly-digest.sh        # Weekly summary generator
       │    ├─ gemini-api.sh           # Gemini model API wrapper
       │    ├─ persona-health-check.sh # Validate persona dirs and registry
       │    ├─ nexus-label             # Label state machine CLI
       │    ├─ routing-rules.yaml      # Task routing decision table
       │    └─ autofix-scoring-rules.md # Task automation scoring reference
       ├─ rules/
       │    └─ assertions.yaml         # Pre/post-execution assertions
       └─ state/
            ├─ last-run.json           # Per-job last execution timestamps
            ├─ nexus-settings.json     # Runtime settings (toggle jobs, adjust intervals)
            ├─ locks/                  # PID-based job locks
            └─ msgbus-cursor.txt       # Sequential message ID counter
```

## Single Cron Entry

```bash
*/5 * * * * /path/to/project/.claude/jobs/dispatcher.sh >> /path/to/project/.claude/logs/headless/dispatcher.log 2>&1
```

All scheduling logic lives in `registry.yaml` — no additional cron entries needed.

## Quick Commands

```bash
# Dispatcher operations
dispatcher.sh --list              # Show all jobs and next run times
dispatcher.sh --check             # Show what's due right now
dispatcher.sh --run <job>         # Force-run a specific job
dispatcher.sh --dry-run           # Show what would run without executing
dispatcher.sh --status            # Show last run status for all jobs
dispatcher.sh --dashboard         # Terminal dashboard

# Executor operations
executor.sh --job <name> --dry-run    # Preview execution (prompt + permissions)
executor.sh --job <name>              # Run a job directly

# Message bus
lib/msgbus.sh send --type <type> --source <src> --severity <sev> --data '<json>'
lib/msgbus.sh query --type <type> --status pending
lib/msgbus.sh pending                 # Show undelivered messages
lib/msgbus.sh thread <id>             # Show message thread

# Observability
lib/dashboard.sh                      # Full terminal dashboard
lib/dashboard.sh --summary            # One-line status
lib/cost-report.sh --today            # Today's costs
lib/cost-report.sh --alert-threshold 5.00  # Alert if today > $5
```

## Registry (registry.yaml)

Each job is defined in `registry.yaml` under `jobs:`:

```yaml
jobs:
  health-summary:
    enabled: true
    schedule: "0 6 * * *"            # Cron expression
    persona: investigator             # Permission profile
    engine: claude-code               # claude-code | ollama | gemini
    model: sonnet                     # Model to use
    max_turns: 5                      # Max agent turns
    max_budget: "1.00"                # USD budget cap
    timeout_minutes: 10               # Hard timeout
    pre_check: "python3 -c '...'"    # Gate before LLM invocation
    prompt: |                         # Or prompt_file: path/to/prompt.md
      Check infrastructure health...

defaults:
  engine: claude-code
  model: sonnet
  max_turns: 10
  max_budget: "3.00"
  timeout_minutes: 30
```

### Engines

| Engine | Cost | Speed | When to Use |
|--------|------|-------|-------------|
| `claude-code` | API pricing | Best quality | Complex analysis, multi-step tasks |
| `ollama` | $0 (local) | Fast, lower quality | Simple checks, summarization, triage |
| `gemini` | API pricing | Fast, good quality | Large context, YouTube analysis, economy tasks |

Engine resolution priority: job config > persona config > registry defaults > claude-code

### Pre-check Gates

Jobs can define a `pre_check` command that runs before the LLM is invoked. If the gate returns non-zero, the job is skipped (no LLM cost). Used for:
- Checking if prerequisite state exists (e.g., creative phase completion)
- Verifying external conditions before expensive operations

### Runtime Settings

`state/nexus-settings.json` allows toggling jobs and adjusting intervals without editing `registry.yaml`:
- Enable/disable individual jobs
- Override schedules temporarily
- Set global pause mode

## Personas

Each persona is a directory in `personas/` with:

```
personas/<name>/
  ├─ prompt.md         # System prompt injected into executor
  ├─ config.yaml       # Engine, model, max_turns, max_budget
  └─ permissions.yaml  # allowed_tools, denied_tools lists
```

### Included Personas

| Persona | Access Level | Use Case |
|---------|-------------|----------|
| `investigator` | Read-only, task read | Health checks, monitoring, reports |
| `analyst` | Read + Write, task CRUD | Upgrade discovery, task scoring |
| `troubleshooter` | Read + Write + SSH + restart | Service troubleshooting, safe fixes |
| `creative-think` | Read + limited Write | Creative brainstorming phase |
| `creative-build` | Full build access | Creative implementation phase |
| `creative-present` | Read + docs write | Creative presentation phase |
| `aurora-feedback` | Read + docs write | Creative rating/feedback phase |
| `creative-action` | Read + Write + tasks | Process creative feedback into actions |
| `task-investigator` | Read-only + task labels | Evaluate auto:candidate tasks |
| `task-executor` | Scoped write + tasks | Execute auto:ready + risk:safe tasks |
| `autofix-executor` | Scoped write + tasks | Execute approved autofix tasks |
| `researcher` | Read + Web + docs write | Research tasks dispatched headlessly |
| `pipeline-reviewer` | Read-only + analysis | Review watchdog actions for patterns |

## Workflows

Workflow instruction files live in `workflows/`. Two types:

**Markdown workflows** (`.md`) — instructions for the LLM executor:
- `health-summary.md` — Infrastructure health check
- `task-executor.md` — Autonomous task execution
- `task-investigator.md` — Promote/block candidate tasks
- `task-score.md` — Score unlabeled tasks with auto:/risk: labels
- `task-evaluator.md` — Pipeline routing for new tasks
- `doc-sync-check.md` — Documentation drift detection
- `pipeline-review.md` — Watchdog pattern analysis
- `pipeline-watchdog.md` — Deterministic label/stuck task monitor
- `persona-health-check.md` — Validate persona directories
- `upgrade-discover.md` — Claude Code/MCP update discovery
- `sync-discovery.md` — Component sync drift detection
- `creative-think.md` — Creative pipeline: brainstorm phase
- `creative-build.md` — Creative pipeline: build phase
- `creative-present.md` — Creative pipeline: presentation phase
- `aurora-feedback.md` — Creative pipeline: feedback processing
- `creative-action.md` — Creative pipeline: execute approved actions

**n8n trigger workflows** (`.json`) — import into n8n for remote execution:
- `claude-agent-executor.json` — Sub-workflow: SSH → executor.sh
- `claude-agent-mcp.json` — MCP server exposing agent capabilities
- `claude-agent-chat-trigger.json` — Chat UI with keyword routing

## Message Bus (messages.jsonl)

Append-only event store with sequential IDs, threading, and delivery tracking.

```json
{
  "id": 42,
  "event_type": "job_completed",
  "source": "headless:health-summary",
  "severity": "info",
  "data": {"job": "health-summary", "cost_usd": "0.30", "summary": "All healthy"},
  "created_at": "2026-03-03T06:00:23Z",
  "status": "pending"
}
```

Event types: `job_completed`, `question_asked`, `question_answered`, `cost_alert`, `notification_delivered`

## Task Automation Pipeline

```
task-score (on-demand)
  └─ Labels tasks with auto:/risk:
task-investigator (daily)
  └─ Promotes auto:candidate → auto:ready (or blocks)
task-executor (every 6h)
  └─ Self-queries task service for auto:ready + risk:safe
       └─ Executes each task, closes on success, marks blocked on failure
```

Scoring rules: `lib/autofix-scoring-rules.md`

## Creative Pipeline

Four-phase creative system (schedule to taste):

```
creative-think   → Brainstorm surprises
creative-build   → Implement chosen surprise (gated on think completion)
creative-present → Write to docs (gated on think completion)
aurora-feedback → Rate previous builds
creative-action  → Process feedback into tasks
```

State tracked in `.claude/agent-output/creative/state-YYYYMMDD.json`.

## Pipeline Watchdog

Deterministic integrity monitor (runs in `pre_check`, zero LLM cost):
- Validates label mutual exclusion rules
- Detects stuck tasks (in_progress too long)
- Enforces stage-gate alignment
- Writes findings to `.claude/data/pipeline-health.jsonl`
- The `pipeline-review` job does LLM analysis of watchdog patterns

## Notifications (Telegram)

### Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot)
3. Copy `.env.template` to `.env` and fill in:

```bash
cp .claude/jobs/.env.template .claude/jobs/.env
# Edit with your bot token and chat ID
```

### Quiet Hours (DND)

Configure in `registry.yaml` under `quiet_hours`:
- Weekday: 10 PM - 7 AM (default)
- Weekend: 11 PM - 9 AM (default)
- Critical severity bypasses DND

### Delivery Behavior

| Severity | DND Active | DND Inactive |
|----------|-----------|--------------|
| critical | Delivers (bypass) | Delivers |
| warning | Queued until DND ends | Delivers |
| info | Silent (recorded, not sent) | Silent |
| question | Always delivers | Delivers |

## Prometheus Metrics

If you have a Pushgateway running, executor.sh automatically pushes metrics:

```bash
# Metrics pushed per job execution:
headless_job_duration_seconds{engine, model, severity}
headless_job_cost_usd{engine, model}
headless_job_success{engine, model}
headless_job_last_run_timestamp_seconds{engine, model}
headless_job_runs_total{engine, model, status}
```

Configure: `PUSHGATEWAY_URL` environment variable (default: `http://localhost:9091`)

## Cron Setup

Single cron entry runs the dispatcher every 5 minutes:

```bash
crontab -e
# Add:
*/5 * * * * /path/to/project/.claude/jobs/dispatcher.sh >> /path/to/project/.claude/logs/headless/dispatcher.log 2>&1
```

The dispatcher handles all scheduling logic — individual jobs don't need their own cron entries.

## Adding a New Job

1. **Choose or create persona** in `personas/` with appropriate permissions
2. **Add job entry** to `registry.yaml` with schedule, persona, budget, and prompt
3. **Optionally** create a workflow file in `workflows/` for complex instructions
4. **Test**: `executor.sh --job <name> --dry-run` to preview
5. **Done** — dispatcher picks it up automatically on next cycle

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Job didn't run | `dispatcher.sh --list` to verify schedule. Check `state/last-run.json` |
| Job stuck | Check `state/locks/<job>.lock` for stale PID. Delete if process dead |
| Budget exceeded | Check `lib/cost-report.sh --today`. Adjust `max_budget` in registry |
| Telegram not sent | Check `lib/msg-relay.sh` output in `relay.log`. Verify `.env` has tokens |
| Pre-check blocking | Run the `pre_check` command manually to debug |
| Persona permissions | Read `personas/<name>/permissions.yaml`. Test with `--dry-run` |
| Runtime settings | Check `state/nexus-settings.json` for disabled jobs or pause mode |

## File Structure

```
.claude/jobs/
├── dispatcher.sh          # Master scheduler (cron entry point)
├── executor.sh            # Per-job execution engine
├── registry.yaml          # Job definitions and schedules
├── .env.template          # Telegram credentials template
├── .gitignore             # Runtime files exclusion
├── README.md              # This file
├── workflows/             # Workflow instruction files
│   ├── health-summary.md
│   ├── task-executor.md
│   ├── task-investigator.md
│   ├── task-score.md
│   ├── task-evaluator.md
│   ├── doc-sync-check.md
│   ├── pipeline-review.md
│   ├── pipeline-watchdog.md
│   ├── persona-health-check.md
│   ├── upgrade-discover.md
│   ├── sync-discovery.md
│   ├── creative-think.md
│   ├── creative-build.md
│   ├── creative-present.md
│   ├── aurora-feedback.md
│   ├── creative-action.md
│   ├── claude-agent-executor.json
│   ├── claude-agent-mcp.json
│   └── claude-agent-chat-trigger.json
├── lib/
│   ├── msgbus.sh          # Message bus CLI
│   ├── msg-relay.sh       # DND-aware delivery relay
│   ├── send-telegram.sh   # Telegram sender
│   ├── dashboard.sh       # Observability dashboard
│   ├── cost-report.sh     # Cost aggregation
│   ├── weekly-digest.sh   # Weekly summary generator
│   ├── gemini-api.sh      # Gemini model API wrapper
│   ├── persona-health-check.sh  # Persona validation
│   ├── nexus-label        # Label state machine CLI
│   └── routing-rules.yaml # Task routing decisions
├── rules/
│   └── assertions.yaml    # Pre/post-execution assertions
├── config/
│   └── github-repos.yaml  # GitHub repo monitoring config
├── personas/              # 13+ persona directories
│   ├── investigator/
│   ├── analyst/
│   ├── troubleshooter/
│   ├── creative-think/
│   ├── creative-build/
│   ├── creative-present/
│   ├── aurora-feedback/
│   ├── creative-action/
│   ├── task-investigator/
│   ├── task-executor/
│   ├── autofix-executor/
│   ├── researcher/
│   └── pipeline-reviewer/
├── state/                 # Runtime state (gitignored)
│   ├── last-run.json
│   ├── nexus-settings.json
│   └── locks/
├── memory-prune.sh        # Legacy standalone script
└── context-staleness.sh   # Legacy standalone script
```

---

*AIfred Nexus v3.0 (2026-03-28)*
