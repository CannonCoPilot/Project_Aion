# Nexus Plumbing Map — Script-Level Architecture Reference

**Purpose**: Source of truth for what every Nexus script does, what it reads/writes, what calls what, and what breaks when you change something. Consult this BEFORE modifying any Nexus script.

**Companion**: Excalidraw diagram in Obsidian `05-AI/Projects/nexus-architecture.excalidraw.md`

---

## Call Graph

```
CRON (*/5 min)
  └── dispatcher.sh
        ├── sources: lib/common.sh
        ├── reads: registry.yaml (via yq), state/nexus.db (via nexusdb.py)
        ├── writes: state/locks/dispatcher.lock, state/locks/<job>.lock, state/dispatcher-heartbeat
        ├── calls: executor.sh --job <name> (or team-runner.py for team jobs)
        ├── post-cycle housekeeping:
        │     ├── msgbus.sh expire (question TTL cleanup)
        │     ├── msg-relay.sh (deliver pending notifications)
        │     ├── pipeline stall detection → msgbus.sh send (alert)
        │     ├── relay-stuck detection → msgbus.sh send (alert)
        │     └── messages.jsonl rotation (120-day archive)
        └── alerts on: job failure, stall, relay-stuck

DISPATCHER (every 5min, pre_check-only — zero LLM cost)
  └── pipeline-watchdog.sh
        ├── sources: lib/common.sh, lib/label-ops.sh
        ├── reads: pulse list --json (all open + in_progress tasks), label-taxonomy.yaml (gate rules)
        ├── checks: 15 integrity checks — missing stage, gate-stage misalignment, mutual exclusions,
        │           cross-group conflicts, deprecated labels, stuck tasks (type:parent aware),
        │           unclaimed in_progress revert, dispatch blocker conflicts, orphaned subtasks
        │           (gate-aware), waiting:subtasks auto-advance, research routing, blocked:dependency
        │           auto-clear, **blocked:<task-id> orphan clearing** (Check 10b — reverse dependency
        │           resolution), runner health, closed task cleanup, cross-ref integrity, search
        │           index staleness, completed-by signal handler
        │           approval-without-transition: removes auto:candidate + pipeline:needs-approval
        │           in addition to waiting:* / needs-input (matches canonical review.outcomes.queue)
        ├── auto-fixes: safe violations via label_add_validated/label_remove_safe (apply_fix wraps these)
        ├── writes: .claude/data/pipeline-health.jsonl (integrity check log)
        │          .claude/data/label-mutations.jsonl (mutation audit trail via label-ops)
        ├── metrics: curl localhost:9091 (Prometheus: violations, fixes, warnings, critical)
        └── alerts: msgbus.sh send (summary with 30min cooldown, critical = immediate)

DISPATCHER (every 12h, LLM reviewer)
  └── pipeline-review (persona: pipeline-reviewer)
        ├── reads: pipeline-health.jsonl, label-taxonomy.yaml, stage-lifecycle.md,
        │          routing-rules.yaml, workflow-inventory.md
        ├── analyzes: watchdog fix correctness, pattern detection, rule recommendations
        ├── writes: .claude/agent-output/results/pipeline-reviewer/<ts>.json
        └── escalates: QUESTION if watchdog making wrong fixes or infinite loops

SYSTEMD (pipeline-runner.service) — or foreground
  └── pipeline-runner.sh (5s poll loop)
        ├── sources: lib/common.sh, lib/trigger-ops.sh, lib/routing-helpers.sh, lib/nexus-settings.sh
        ├── reads: pulse.pipeline_triggers (via Pulse API), nexus-settings.json
        ├── writes: state/pipeline-runner.pid, state/pipeline-runner-heartbeat
        ├── on pending trigger:
        │     ├── batch handler (evaluator/investigator/ai-david): dedup, dispatch once
        │     └── single-task handler (executor/research/infra): dispatch per task_id
        ├── calls: dispatcher.sh --run <handler> [--param task_id=<id>]
        ├── guards: cost cap (20/hour configurable), enable/disable toggle, max 3 concurrent, per-job locks
        └── maintenance: trigger_reclaim_stale (every ~8min), trigger_cleanup_old (7-day retention)

TRIGGERS (emitted by label-ops.sh on every label_stage_transition)
  └── lib/trigger-ops.sh → Pulse API → INSERT INTO pulse.pipeline_triggers
        ├── resolves: stage → handler (via routing-helpers.sh)
        ├── dedup: batch handlers skip if pending trigger already exists
        └── consumed by: pipeline-runner.sh, nexus-dispatch

ON-DEMAND (CLI)
  └── nexus-dispatch <task-id>
        ├── sources: lib/trigger-ops.sh, lib/routing-helpers.sh
        ├── inserts: high-priority trigger into pipeline_triggers
        ├── if runner alive: "queued — runner picks up in ≤5s"
        └── if runner dead: direct dispatcher.sh --run fallback

CRON (*/2 min)
  └── event-watcher.sh
        ├── sources: lib/common.sh, lib/routing-helpers.sh
        ├── reads: pulse.task_events (via Pulse API), state/event-watcher-cursor
        ├── writes: state/event-watcher-cursor
        ├── on task created:
        │     ├── pulse label add <id> "stage:intake"
        │     └── dispatcher.sh --run task-evaluator (background)
        ├── on task closed:
        │     └── strip stale blocker labels (needs-input, waiting:*, parked)
        ├── on pipeline:approved label:
        │     ├── routes to correct executor via get_executor_for_capability()
        │     └── dispatcher.sh --run <executor> (background)
        ├── every cycle: POST localhost:8700/api/v1/projects/advance-all (Pulse)
        └── on project launch: POST localhost:8700/api/v1/projects/<id>/execute (Pulse)

CRON (*/5 min)
  └── telegram-callback-handler.sh
        ├── reads: .env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID), state/telegram-update-offset.txt
        ├── polls: api.telegram.org/getUpdates
        ├── routes callbacks: autofix:<action>, qid:<id>:<action>, job:action
        ├── calls: msgbus.sh reply (write answer), msgbus.sh send (reminders)
        └── writes: state/telegram-update-offset.txt, state/telegram-awaiting-text.tmp

CRON (*/15 min)
  └── dispatcher-watchdog.sh
        ├── reads: state/dispatcher-heartbeat (mtime check)
        ├── on stale: msgbus.sh send (critical), msg-relay.sh (force-deliver)
        └── throttle: state/watchdog-last-alert (4h cooldown)
```

---

## Executor Detail

```
executor.sh --job <name> [--param k=v] [--answer "..."]
  ├── sources: lib/common.sh, lib/sessions.sh (if --session)
  ├── reads: registry.yaml, personas/<name>/prompt.md, permissions.yaml, config.yaml
  ├── sets: PULSE_ACTOR=<job_name> (Pulse audit trail)
  ├── builds: --allowedTools from permissions.yaml (allowed_tools + allowed_bash → Bash() patterns)
  ├── builds: full_prompt = persona prompt + job prompt + params + answer
  ├── engine resolution: job.engine → persona config.yaml → registry defaults → "claude-code"
  ├── LLM router (advisory): python3 -m determinism nexus-route
  │     ├── reads: ~/Code/loom/determinism/routing_data/routing-table.yaml (empirical data)
  │     ├── reads: Pulse settings API → llm-router-config (3s timeout, fallback to defaults)
  │     ├── returns: {model, provider, engine, cost, determinism, is_empirical}
  │     └── override chain: CLI --model-override > job.model > persona.model > router > "sonnet"
  ├── runs: claude -p "<prompt>" --model <M> --allowedTools "..." --max-turns N --output-format json
  │         OR: ollama run <model> (if engine=ollama)
  ├── retries: transient API errors (500, 503, 529, ECONNRESET) → random 60-300s backoff × api_retries
  ├── post-processing:
  │     ├── extracts: .result, .total_cost_usd, .modelUsage from JSON output
  │     ├── parses signals: PAUSE:, SEVERITY:, REVIEW_REJECT:, REVIEW_APPROVE:
  │     ├── writes: .claude/logs/headless/executions/<job>-<ts>.json (raw output)
  │     ├── writes: .claude/logs/headless/executions/<job>-<ts>.log
  │     ├── symlinks: .claude/logs/headless/executions/latest-<job>.json
  │     ├── writes: cost-ledger.jsonl (includes router_model, router_overridden fields)
  │     ├── writes: Pulse task metadata (router_recommendation if task_id present)
  │     ├── msgbus.sh send --type job_completed (notification)
  │     ├── curl localhost:9091 (Prometheus pushgateway — duration, cost, success, count)
  │     └── on REVIEW_REJECT: dispatcher.sh --run task-executor (re-dispatch)
  ├── post-assertions (lib/assertions.sh — advisory, never blocks):
  │     ├── assert_task_resolved: task not still in_progress → critical alert if failed
  │     ├── assert_claim_released: assignee cleared → warning if orphaned
  │     └── assert_clean_workdir: no uncommitted changes → warning (currently disabled)
  └── on PAUSE: task marked waiting:david, notification sent via relay → dashboard (+ Telegram if critical)
```

---

## Data Flow Diagrams

### Job Execution Path
```
registry.yaml → dispatcher.sh → executor.sh → claude -p → JSON output
                                                              ↓
                                              ┌───────────────┼───────────────┐
                                              ↓               ↓               ↓
                                    logs/executions/   msgbus.sh send    Prometheus push
                                    <job>-<ts>.json    (job_completed)   (metrics)
                                                              ↓
                                                    nexus.db:events (pending)
                                                              ↓
                                                    msg-relay.sh (next cycle)
                                                       ↓              ↓
                                              dashboard POST    Telegram (critical only)
                                          (all events)          (pager format)
```

### Human Input Round-Trip (waiting:david)
```
Persona needs input:
  → pulse update <task_id> --append-notes "## Needs Input\n<details>"
  → pulse update <task_id> --add-label "waiting:david"
  → pulse update <task_id> --add-label "needs-input"
  → Exit cleanly
  → David responds via dashboard queue (updates task notes, removes waiting:david)
  → Next dispatch cycle picks up task with updated notes
```

### Task Pipeline
```
pulse create → pulse.task_events (event_type:created)
  → event-watcher.sh: pulse label add "stage:intake"
  → dispatcher.sh --run task-evaluator
  → task-evaluator: reads task, scores risk/capability
      ├── fast-track: stage:queue + risk:safe + auto:ready
      ├── needs routing: stage:route + auto:candidate
      └── needs human: stage:review + waiting:david
  → [if stage:queue] task-executor picks up (next interval or event-driven)
      → pulse update --status in_progress --claim
      → executes work
      → pulse close --reason "..."
  → [if waiting:david] ai-david reviews (every 2h)
      → approve → stage:queue + pipeline:approved + auto:ready
      → escalate → stays at stage:review
```

---

## Label State Machine

### Stage Labels (mutually exclusive)
```
stage:intake → stage:evaluate → stage:route → stage:review → stage:queue → stage:execute → [closed]
```

### Who Sets Each Stage

| Stage | Set by | Next step |
|-------|--------|-----------|
| `stage:intake` | event-watcher.sh (on task created) | task-evaluator runs |
| `stage:evaluate` | task-evaluator (re-evaluate) | task-evaluator scores |
| `stage:route` | task-evaluator (needs routing) | task-investigator decides |
| `stage:review` | task-evaluator/investigator (needs human) | ai-david or dashboard review |
| `stage:queue` | task-evaluator (fast-track) or ai-david (approved) | executor picks up |
| `stage:execute` | executor (claiming task) | executor works → close |

### Automation Labels

| Label | Set by | Meaning |
|-------|--------|---------|
| `auto:candidate` | task-evaluator | May be automatable, investigator will decide |
| `auto:ready` | task-evaluator or ai-david | Cleared for autonomous execution |
| `blocked:dependency` | project engine (Pulse) | Has unresolved project dependencies |
| `pipeline:approved` | ai-david or dashboard (via `pulse transition approve`) | Human explicitly approved, bypasses risk gate. **Must** be set via atomic transition — never add manually without also transitioning stage to `queue` and removing blocker labels |
| `pipeline:needs-approval` | task-evaluator | Flagged as needing explicit approval |

### Dispatch Blockers (prevent execution even at stage:queue)
- `waiting:david` — Waiting for human decision
- `waiting:session` — Requires interactive Claude Code session
- `waiting:external` — Waiting on external dependency
- `waiting:subtasks` — Waiting for child tasks to complete
- `needs-input` — Missing required information
- `blocked:dependency` — Orchestration dependency unresolved
- `blocked:AIProjects-xxx` — Specific parent-task blocker (cleared by Check 10b when parent closes)
- `manual-action` — Requires manual intervention
- `pipeline:needs-approval` — Awaiting pipeline approval
- `blocked:*` — Any blocked: prefix label

**Auto-cleanup on close**: event-watcher strips all dispatch blocker labels when a task is closed. These labels are pipeline state and have no meaning on completed tasks.

### Trait Labels (advisory — inferred by task-evaluator)

| Label | Meaning | Context Signal |
|-------|---------|---------------|
| `trait:skeptical` | Challenge assumptions, verify claims | Unfamiliar code area, no existing tests |
| `trait:security` | Apply security lens, consider redteam | Auth/crypto paths, domain:security |
| `trait:thorough` | Multi-pass analysis, no shortcuts | Major feature, architecture change |
| `trait:research-first` | Research before implementing | New external dependency/integration |
| `trait:rapid` | Direct implementation, minimal ceremony | Quick fix, well-defined bug |
| `trait:creative` | Explore alternatives, prioritize elegance | Creative/content work |

Traits are 0-2 per task. Most tasks get none. `trait:rapid` is mutually exclusive with `trait:thorough`. Traits guide executor approach but do not change permissions or routing.

### Capability → Executor Routing

| Label | Executor | Persona |
|-------|----------|---------|
| `capability:infrastructure` | task-executor-infra | infrastructure-deployer |
| `capability:research` | task-research | researcher |
| `capability:code` | task-executor | autofix-executor |
| `capability:file-ops` | task-executor | autofix-executor |
| *(none)* | task-executor | autofix-executor (default) |

### Risk Gate

| Risk | task-executor | task-executor-infra | task-research |
|------|--------------|--------------------|----|
| `risk:safe` | Execute | Execute | n/a |
| `risk:moderate` | Block (unless pipeline:approved) | Execute | n/a |
| `risk:destructive` | Block (unless pipeline:approved) | Hard block | n/a |

---

## Script Dependency Map

**If you change this script... check these consumers:**

| Script changed | Consumers / dependents |
|---------------|----------------------|
| `lib/common.sh` | dispatcher, executor, event-watcher, msg-relay, dashboard, directive-runner, pipeline-watchdog |
| `lib/msgbus.sh` | dispatcher, executor, event-watcher, msg-relay, callback-handler, cost-report, watchdog, pipeline-watchdog |
| `lib/nexusdb.py` | msgbus.sh, dispatcher, dashboard, cost-report (ALL DB access) |
| `lib/routing-helpers.sh` | event-watcher, pre_check expressions in registry.yaml |
| `lib/routing-rules.yaml` | routing-helpers.sh (bash mirror), persona prompts (referenced directly) |
| `lib/send-telegram.sh` | msg-relay, callback-handler, team-runner |
| `lib/msg-relay.sh` | dispatcher (post-cycle), watchdog (force-relay) |
| `executor.sh` | dispatcher (main path), event-watcher (--run dispatch), team-runner (parallel) |
| `registry.yaml` | dispatcher (schedule/config), executor (job fields), pre_check gates |
| `personas/<name>/permissions.yaml` | executor.sh (builds --allowedTools) |
| `personas/<name>/config.yaml` | executor.sh (engine/model/limits), dashboard (display) |
| `personas/<name>/prompt.md` | executor.sh (prepended to job prompt) |
| `event-watcher.sh` | standalone (cron), but drives pipeline — changes affect all task flow |
| `lib/orchestration-loader.sh` | ARCHIVED — replaced by Pulse project import API |
| `pipeline-watchdog.sh` | dispatcher (pre_check), pipeline-reviewer (reads JSONL output) |
| `label-taxonomy.yaml` | routing-helpers.sh, pipeline-watchdog (gate rules, mutex sets, deprecated list), persona prompts, dashboard |
| `lib/label-ops.sh` | **ALL scripts that mutate labels** (event-watcher, executor, pipeline-watchdog, directive-runner). Single chokepoint: validates mutex, rejects deprecated, logs all mutations to `label-mutations.jsonl`. Now also emits pipeline triggers via `trigger-ops.sh` on stage transitions. |
| `lib/trigger-ops.sh` | pipeline-runner.sh (poll+dispatch), nexus-dispatch (on-demand), label-ops.sh (emit) |
| `pipeline-runner.sh` | standalone (systemd service), dispatcher.sh (shared locks), pipeline-watchdog.sh (health check) |
| `nexus-dispatch` | standalone CLI tool (manual trigger) |

---

## State Files Reference

| File | Format | Writer | Reader | Purpose |
|------|--------|--------|--------|---------|
| `state/nexus.db` | SQLite (WAL) | nexusdb.py | all scripts | Primary state: events + job_state tables |
| `state/locks/dispatcher.lock` | PID | dispatcher | dispatcher | Singleton lock |
| `state/locks/<job>.lock` | PID | dispatcher | dispatcher | Per-job concurrency lock |
| `state/locks/event-watcher.lock` | PID | event-watcher | event-watcher | Singleton lock |
| `state/event-watcher-cursor` | integer | event-watcher | event-watcher | Cursor position for Pulse task event polling |
| `state/dispatcher-heartbeat` | touch | dispatcher | watchdog | Liveness proof (mtime) |
| `state/watchdog-last-alert` | touch | watchdog | watchdog | 4h alert throttle |
| `state/last-stall-alert` | epoch | dispatcher | dispatcher | 24h stall alert throttle |
| `state/relay-stuck-count` | integer | dispatcher | dispatcher | Consecutive stuck-relay cycles |
| `state/relay-dnd-state` | "true"/"false" | msg-relay | msg-relay | DND transition tracking |
| `state/telegram-update-offset.txt` | integer | callback-handler | callback-handler | Telegram getUpdates pagination |
| `state/telegram-awaiting-text.tmp` | "qid ts" | callback-handler | callback-handler | Free-text reply expected (30min TTL) |
| `state/watchdog-last-summary` | epoch | pipeline-watchdog | pipeline-watchdog | 30min summary notification cooldown |
| `state/pipeline-runner.pid` | PID | pipeline-runner | nexus-dispatch, watchdog | Runner liveness check |
| `state/pipeline-runner-heartbeat` | touch | pipeline-runner | pipeline-watchdog | Liveness proof (mtime) |
| `.claude/data/pipeline-health.jsonl` | JSONL | pipeline-watchdog | pipeline-reviewer | Full audit trail of watchdog integrity checks, violations, and fix actions |
| `.claude/data/label-mutations.jsonl` | JSONL | lib/label-ops.sh | pipeline-reviewer, analysis | Complete log of every label mutation: task_id, scenario, source, action, label |

---

## Registry.yaml Field Reference

### Global Config

```yaml
quiet_hours:
  timezone: "America/Denver"
  weekday: {start: 22, end: 7}    # DND window
  weekend: {start: 23, end: 9}
  severity_bypass: [critical]      # Bypass DND
  batch_release: true              # Digest mode when DND ends

defaults:
  engine: claude-code
  model: sonnet
  max_turns: 10
  max_budget_usd: 2.00
  timeout_minutes: 10
  max_retries: 1
  retry_backoff_hours: 1
```

### Per-Job Fields

| Field | Consumed by | Effect |
|-------|-------------|--------|
| `persona` | executor.sh | Loads personas/<value>/ directory |
| `schedule.type` | dispatcher.sh | `interval`, `daily`, `weekly`, `on-demand` |
| `schedule.every_hours` | dispatcher.sh | Interval jobs: run every N hours |
| `schedule.hour` | dispatcher.sh | Daily/weekly: hour to run (0-23) |
| `schedule.day` | dispatcher.sh | Weekly: day name (e.g., `sunday`) |
| `enabled` | dispatcher.sh | `false` = skip auto-schedule, still `--run`-able |
| `max_turns` | executor.sh | `--max-turns` for claude |
| `max_budget_usd` | executor.sh | `--max-budget-usd` for claude |
| `model` | executor.sh | `--model` for claude |
| `effort` | executor.sh | `--effort` flag |
| `timeout_minutes` | executor.sh | `timeout` wrapper |
| `api_retries` | executor.sh | Retry count for transient errors |
| `engine` | executor.sh | `claude-code` or `ollama` |
| `pre_check` | dispatcher.sh | Bash gate — non-zero = skip LLM |
| `prompt` | executor.sh | Appended to persona prompt |
| `team` | dispatcher.sh | Routes to team-runner.py instead of executor.sh |
| `max_retries` | dispatcher.sh | Retry attempts after failure |
| `retry_backoff_hours` | dispatcher.sh | Hours between retries |

Engine resolution: `job.engine` → `persona config.yaml:engine.default` → `registry defaults.engine` → `"claude-code"`

---

## Persona System

### Directory Structure
```
personas/<name>/
  prompt.md          — System prompt (prepended to every job execution)
  permissions.yaml   — Tool allowlist: allowed_tools, allowed_bash, denied_tools
  config.yaml        — Engine, model, limits, output path, add_dirs, env_files
```

### How executor.sh uses personas
1. Reads `prompt.md` → becomes first part of `full_prompt`
2. Reads `permissions.yaml` → `allowed_tools` list + `allowed_bash` patterns → converted to `--allowedTools` flag
3. Reads `config.yaml` → engine, model, max_turns, budget, timeout (overridden by registry.yaml job-level fields if present)
4. Sets `PULSE_ACTOR=<job_name>` for Pulse audit trail

### Active Personas

| Persona | Used by | Access tier |
|---------|---------|------------|
| investigator | health-summary, backup-validate, doc-sync-check, etc. | Read-only analysis |
| analyst | upgrade-discover, creative-sync-check, etc. | Research + report writing |
| troubleshooter | plex-troubleshoot, agent-troubleshoot | Diagnosis + fixes (SSH, Docker) |
| librarian | abs-librarian | File management + ABS API |
| task-evaluator | task-evaluator | Broadest access (classification pipeline) |
| task-investigator | task-investigator | Routing decisions |
| autofix-executor | task-executor | Code/file task execution (no Docker/SSH/git) |
| infrastructure-deployer | task-executor-infra | Docker compose, infrastructure work |
| researcher | task-research | Deep research + Obsidian write. Three-tier completion routing: SIGNAL → `review:research + waiting:david` (Action Required); NO SIGNAL + human → `review:research` (FYI); NO SIGNAL + automated → close |
| ai-david | ai-david | Decision proxy (read-heavy, write to logs only) |
| pipeline-reviewer | pipeline-review | Read + write reports (analyze watchdog JSONL) |
| aurora-* | aurora jobs | Creative pipeline stages |

---

## Key Integration Points

| System | How Nexus connects | Scripts involved |
|--------|-------------------|-----------------|
| Pulse (port 8700) | Task management, label mutations drive pipeline state machine | event-watcher, executor, evaluator, all personas |
| Dashboard (localhost:8600) | Project views, Nexus-Ops, reviews, reports | event-watcher (via Pulse project API) |
| Telegram | Two-way via bot API | send-telegram, msg-relay, callback-handler |
| Prometheus (localhost:9091) | Pushgateway for job metrics | executor.sh |
| Ollama (localhost:11434) | Alternative LLM engine | executor.sh (currently disabled) |
| Obsidian (via MCP) | Research/report writing | researcher, aurora-presenter personas |
