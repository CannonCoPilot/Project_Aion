# Nexus Job Ecosystem Audit

**Date**: 2026-05-28
**Author**: Jarvis (Project Aion)
**Scope**: All scheduled, event-driven, recurring, and infrastructure jobs across the Alfred/Nexus/Jarvis ecosystem.

---

## Architecture Overview

The Nexus job ecosystem has four distinct layers:

1. **Infrastructure orchestrators** — pure bash, no LLM, $0. Scheduling, watchdog, relay, event loops.
2. **Recurring LLM jobs** — defined in `registry.yaml`, dispatched by the scheduler, executed by `executor.sh`.
3. **Event-driven V2 services** — Python microservices spawned by `pipeline-watcher.py` on Pulse webhook events.
4. **Dev-only agents** — launchd duplicates pointing to Alfred-Dev for testing.

---

## Layer 1: Infrastructure Orchestrators

Pure bash scripts that never call an LLM. They dispatch jobs, relay messages, or watch for stale state.

### Dispatcher (`dispatcher.sh`)

- **Schedule**: launchd `com.aion.nexus-dispatcher`, every 300s
- **Mechanism**: Reads `registry.yaml`, checks schedule vs last-run timestamps, launches due jobs via `executor.sh`. Touches `state/dispatcher-heartbeat` each cycle.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: `/nexus-ops` (timeline), `/jobs` (next-run times)
- **Launchd path**: `AIFred-Pro/.claude/jobs/dispatcher.sh`

### Event Watcher (`event-watcher.sh`)

- **Schedule**: launchd `com.aion.nexus-event-watcher`, every 120s
- **Mechanism**: Polls Pulse `/api/v1/events`, calls `/projects/advance-all` each cycle. Legacy JSONL event processing is vestigial (no new writes since Pulse migration). No LLM cost. ~100ms/run.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: `/nexus-ops` (timeline events)
- **Launchd path**: `AIFred-Pro/.claude/jobs/event-watcher.sh`

### Dispatcher Watchdog (`lib/dispatcher-watchdog.sh`)

- **Schedule**: launchd `com.aion.nexus-watchdog`, every 900s
- **Mechanism**: Checks if dispatcher heartbeat file is >20min stale. Tiered escalation: warning (dashboard) on first detection, critical (Telegram) after 3 consecutive stale checks (~50 min).
- **LLM**: None
- **Cost**: $0
- **Dashboard**: `/health` (component status)
- **Launchd path**: `AIFred-Pro/.claude/jobs/lib/dispatcher-watchdog.sh`

### Pipeline Watcher (`pipeline-watcher.py`)

- **Schedule**: Flask webhook server on port 8810 + 300s heartbeat poll (safety net)
- **Mechanism**: PRIMARY event path for V2 pipeline. Pulse fires webhooks on every label mutation and task creation; the webhook handler triggers the appropriate V2 service immediately. Heartbeat poll catches missed webhooks, resolves dependency unblocks, and collects executor telemetry. Spawns V2 services as subprocesses (`subprocess.Popen`).
- **LLM**: None (dispatches to services that may use LLMs)
- **Cost**: $0
- **Dashboard**: `/pipeline` (stage flow)
- **Path**: `Alfred-Dev/.claude/jobs/pipeline-watcher.py`

### Message Relay (`lib/msg-relay.sh`)

- **Schedule**: Called after each dispatcher cycle (not independently scheduled)
- **Mechanism**: DND-aware message delivery. Polls message bus for pending messages, checks quiet hours (configurable in `registry.yaml`), delivers via Telegram, marks delivered. Severity bypass for critical alerts.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: `/nexus-ops` (notifications)

### Telegram Callback Handler (`lib/telegram-callback-handler.sh`)

- **Schedule**: crontab every 5 minutes
- **Mechanism**: Handles Telegram bot callback replies (task approvals/rejections from mobile). No Claude auth needed.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not surfaced directly (effects visible on `/board` as task status changes)

### Execution Trace Observer (`observe-trace.sh`)

- **Schedule**: Background process after each `executor.sh` completion (non-blocking)
- **Mechanism**: CL-v2 Phase 1. Records execution traces to JSONL, performs lightweight pattern detection to surface instinct candidates.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: `/nexus-ops` (analytics tab)
- **Path**: `Alfred-Dev/.claude/jobs/observe-trace.sh` (dev-side only; not present in AIFred-Pro production)

---

## Layer 1b: Jarvis-Side Infrastructure

Scripts that run on the Jarvis side (not Alfred-Dev), mostly long-running in tmux or launchd. No LLM calls.

### Cost Anomaly Watcher (`cost-anomaly-watcher.sh`)

- **Schedule**: launchd `com.aion.jarvis-cost-watcher` (long-running)
- **Mechanism**: Reads proxy DB (`api_requests`), detects anomalous spend patterns, writes `.cost-state.json` for HUD consumption.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Jarvis HUD (tmux W8), indirectly `/usage`
- **Path**: `Jarvis/.claude/scripts/cost-anomaly-watcher.sh`

### JICM Watcher (`jicm-watcher.sh`)

- **Schedule**: tmux W1 (long-running, session lifetime)
- **Mechanism**: Monitors context window size via CC stdin, triggers compression cycles when threshold reached. Writes `.jicm-state-hook.json`. Coordinates stop-and-wait JICM cycles with Jarvis W0.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Jarvis HUD (tmux W8)
- **Path**: `Jarvis/.claude/scripts/jicm-watcher.sh`

### JICM HUD (`jicm-watcher-hud.sh`)

- **Schedule**: tmux W8 (long-running, session lifetime)
- **Mechanism**: Renders terminal-based status display with token counts, rate limits, cost state. Reads `.jicm-state-hook.json` + `.cost-state.json`.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Itself IS the visual dashboard (tmux W8)
- **Path**: `Jarvis/.claude/scripts/jicm-watcher-hud.sh`

### Ennoia (`ennoia.sh`)

- **Schedule**: tmux W2 (long-running, session lifetime)
- **Mechanism**: Intent-driven orchestration assistant. Monitors signals, writes `.ennoia-recommendation` and `.ennoia-status` files.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not in web dashboard
- **Path**: `Jarvis/.claude/scripts/ennoia.sh`

### Virgil (`virgil.sh`)

- **Schedule**: tmux W3 (long-running, session lifetime)
- **Mechanism**: Task/agent/file tracking. Writes `.virgil-tasks.json`, `.virgil-agents.json` for consumption by other components.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not in web dashboard
- **Path**: `Jarvis/.claude/scripts/virgil.sh`

### Nexus Sync Fetch (`fetch-david-nexus-sync.sh`)

- **Schedule**: launchd `com.aion.david-nexus-sync-fetch`, every 21600s (6h)
- **Mechanism**: Fetches the `nexus-sync-2026-04` branch, writes recent changes to `Shared_Projects/Status/david/nexus-sync-2026-04-recent.md`.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not surfaced
- **Path**: `Jarvis/.claude/scripts/fetch-david-nexus-sync.sh`

### Nexus Sync Health Check (`verify-david-nexus-sync-health.sh`)

- **Schedule**: launchd `com.aion.david-nexus-sync-health-check` (on-demand)
- **Mechanism**: Verifies sync health after fetch. Companion to the fetch agent.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not surfaced
- **Path**: `Jarvis/.claude/scripts/verify-david-nexus-sync-health.sh`

### Token Compression Reminder (`token-compression-reminder.sh`)

- **Schedule**: launchd `com.aion.token-compression-reminder` (on-demand)
- **Mechanism**: Monitors token usage patterns and reminds about JICM compression thresholds.
- **LLM**: None
- **Cost**: $0
- **Dashboard**: Not surfaced
- **Path**: `Jarvis/.claude/scripts/token-compression-reminder.sh`

### Probe Headers (`usage-proxy/probe-headers.sh`)

- **Schedule**: crontab every 2h
- **Mechanism**: Fires a minimal API call through the reverse proxy (:9800) to capture fresh rate-limit headers. Ensures the dashboard's burn-rate curves have data points even during idle periods.
- **LLM**: Anthropic (minimal — single API call to capture headers)
- **Cost**: ~$0.01/call (cache_write of project context)
- **Dashboard**: `/usage` (burn-rate curve data points)
- **Path**: `Alfred-Dev/usage-proxy/probe-headers.sh`

---

## Layer 2: Recurring LLM Jobs

Defined in `.claude/jobs/registry.yaml`. The dispatcher checks every 5-minute cycle, compares schedule against last-run timestamps, and launches due jobs via `executor.sh`.

### Engine Types

| Engine | Endpoint | Tool Support | Cost | Fallback |
|--------|----------|-------------|------|----------|
| `ollama` (no tools) | `/api/generate` | None — data pre-gathered | $0 | `claude-interactive` |
| `ollama` (tools) | `/api/chat` | `run_command` tool, multi-turn dispatch loop | $0 | `claude-interactive` |
| `claude-interactive` | Managed tmux window via proxy :9800 | Full Claude Code tool access | Anthropic $/call | None |
| `claude-code` | `claude -p` headless (DEPRECATED) | Full Claude Code tool access | Anthropic $/call | None |

### Job Inventory

#### health-summary
- **Purpose**: Quick infrastructure health check — docker containers, disk, error logs
- **Engine**: ollama (no tools) | **Model**: qwen3:32b
- **Schedule**: every 12h | **Enabled**: Yes
- **Pre-gather**: `lib/gather-health-data.sh` (docker ps, disk usage, container error logs, health-check-log history)
- **Pre-check**: `docker ps >/dev/null 2>&1` (skip if Docker not running)
- **Persona**: investigator (read-only)
- **Tags**: monitoring
- **Dashboard**: `/jobs`, `/health`
- **Cost**: $0

#### persona-health-check
- **Purpose**: Validate persona directories, config files, and registry references
- **Engine**: ollama (no tools) | **Model**: qwen3:32b
- **Schedule**: weekly Sunday 5:00 | **Enabled**: Yes
- **Pre-gather**: `lib/persona-health-check.sh` output injected into prompt
- **Persona**: investigator (read-only)
- **Tags**: monitoring
- **Dashboard**: `/jobs`
- **Cost**: $0

#### doc-sync-check
- **Purpose**: Check if documentation needs sync with recent code changes
- **Engine**: ollama (no tools) | **Model**: qwen3:32b
- **Schedule**: every 24h | **Enabled**: Yes
- **Pre-check**: Requires `.doc-sync-state.json` with 5+ changes
- **Pre-gather**: `.doc-sync-state.json` contents injected into prompt
- **Persona**: investigator (read-only)
- **Tags**: maintenance
- **Dashboard**: `/jobs`
- **Cost**: $0

#### context-maintenance
- **Purpose**: Maintain Evaluator Brief sections in project context docs — validate paths, archive stale decisions, resolve questions
- **Engine**: ollama (tools) | **Model**: qwen3:32b
- **Tools**: `run_command` (max 8 rounds) — reads files, runs `pulse list`, checks paths
- **Schedule**: every 12h | **Enabled**: Yes
- **Pre-check**: Requires open Pulse tasks with `project:*` labels
- **Persona**: context-maintainer
- **Tags**: maintenance, context
- **Dashboard**: `/jobs`
- **Cost**: $0

#### creative-think
- **Purpose**: Creative Pipeline Phase 1 — research interests, generate ideas, select tonight's surprise
- **Engine**: ollama (tools) | **Model**: qwen3:32b
- **Tools**: `run_command` (max 10 rounds) — reads Obsidian files, journal entries, idea logs, writes state JSON
- **Schedule**: daily 0:00 (midnight) | **Enabled**: Yes
- **Pre-check**: `lib/creative-activity-digest.sh` (generates activity context, always exits 0)
- **Persona**: creative-thinker
- **Tags**: creative
- **Dashboard**: `/jobs`, `/reference` (architecture diagram)
- **Cost**: $0

#### creative-build
- **Purpose**: Creative Pipeline Phase 2 — build tonight's surprise in isolation
- **Engine**: ollama (tools) | **Model**: qwen3:32b
- **Tools**: `run_command` (max 10 rounds) — creates files, writes output
- **Schedule**: daily 2:00 AM | **Enabled**: Yes
- **Pre-check**: Gate — only runs if Think phase completed today (reads state file)
- **Persona**: creative-builder
- **Tags**: creative
- **Dashboard**: `/jobs`, `/reference`
- **Cost**: $0

#### creative-present
- **Purpose**: Creative Pipeline Phase 3 — create morning surprise note
- **Engine**: ollama (tools) | **Model**: qwen3:32b
- **Tools**: `run_command` (max 5 rounds) — reads state, writes surprise note
- **Schedule**: daily 6:00 AM | **Enabled**: Yes
- **Pre-check**: Gate — requires Build completed + Present not yet completed (checks today + yesterday state files)
- **Persona**: creative-presenter
- **Tags**: creative
- **Dashboard**: `/jobs`, `/reference`
- **Cost**: $0

#### weekly-digest
- **Purpose**: Weekly summary report — job results, costs, pipeline health, anomalies
- **Engine**: ollama (no tools) | **Model**: qwen3:32b
- **Schedule**: weekly Monday 9:00 | **Enabled**: Yes
- **Pre-gather**: `lib/gather-weekly-data.sh` (cost ledger summary, failure list, daily trends from last 7 days)
- **Persona**: investigator (read-only)
- **Tags**: reporting
- **Dashboard**: `/jobs`, `/digest`
- **Cost**: $0

#### pipeline-review (DISABLED)
- **Purpose**: LLM review of pipeline health — pattern analysis, rule recommendations
- **Engine**: claude-code (inherited from defaults, DEPRECATED) | **Model**: sonnet (inherited from defaults)
- **Schedule**: every 12h | **Enabled**: No (disabled 2026-05-13)
- **Replaced by**: `services/pipeline_reviewer.py` (event-driven, Phase 1.1 commit 5481f5c)
- **Persona**: pipeline-reviewer
- **Tags**: monitoring
- **Dashboard**: `/jobs` (greyed out)
- **Cost**: N/A (disabled)

#### ollama-test
- **Purpose**: Test Ollama engine routing — lightweight summary for validation
- **Engine**: ollama (no tools) | **Model**: qwen3:8b
- **Schedule**: on-demand only | **Enabled**: Yes
- **Persona**: investigator
- **Dashboard**: `/jobs`
- **Cost**: $0

---

## Layer 3: Event-Driven V2 Pipeline Services

Python microservices in `.claude/jobs/services/`. NOT scheduled — they fire reactively when `pipeline-watcher.py` receives Pulse webhooks on label mutations. Each implements a specific pipeline stage.

### score.py — Score Service
- **Purpose**: Phase D event-driven replacement for task-score cron job. Applies `risk:*` labels to new tasks.
- **Trigger**: `task.created` Pulse event via event-watcher
- **LLM**: None (rule-based scoring)
- **Cost**: $0
- **Dashboard**: `/pipeline` (score stage), `/reo`

### stage.py — Stage Service
- **Purpose**: Manages label-dimension state machine transitions. Maps task label combinations to pipeline stages.
- **Trigger**: Label mutation webhook from Pulse
- **LLM**: Ollama (qwen3:32b references for evaluation)
- **Cost**: $0
- **Dashboard**: `/pipeline` (stage transitions)

### evaluate.py — Evaluate Service
- **Purpose**: Runs dimension-label evaluations on tasks advancing through pipeline stages.
- **Trigger**: Label advancement (post-score)
- **LLM**: Both Ollama and Claude (model selected per evaluation type)
- **Cost**: $0 (Ollama path) or Anthropic (Claude path)
- **Dashboard**: `/pipeline`, `/reo`

### orchestrate.py — Orchestrate Service
- **Purpose**: Manages multi-task orchestration sequences — dependency tracking, phase gating, parallel execution.
- **Trigger**: Orchestration trigger from approved task sets
- **LLM**: Claude (sonnet) for orchestration planning
- **Cost**: Anthropic $/call
- **Dashboard**: `/pipeline`, `/reo`, `/nexus-ops`

### executor.py (V2) — Execute Service
- **Purpose**: Runs approved tasks. Autofix-executor persona mode folded in. Handles the actual work — file creation, git ops, Pulse mutations.
- **Trigger**: `pipeline:approved` label on task
- **LLM**: Both Ollama (23 refs) and Claude (38 refs) — Claude for unrestricted tool access
- **Cost**: Anthropic $/call for Claude-routed tasks
- **Dashboard**: `/pipeline` (execute stage), `/reo`, `/nexus-ops`

### reviewer.py — Review Service
- **Purpose**: AI code/task review. Structured accept/reject with feedback loop (max 2 review cycles before escalation to Sir).
- **Trigger**: Post-execution review trigger
- **LLM**: Both Ollama (8 refs) and Claude (19 refs)
- **Cost**: Variable
- **Dashboard**: `/pipeline` (review stage), `/reo`, `/reviews`

### diagnose.py — Diagnose Service
- **Purpose**: Investigates failed or stuck tasks. Analyzes error patterns, proposes remediation.
- **Trigger**: Failure/stuck detection by watchdog
- **LLM**: Ollama (qwen3 references)
- **Cost**: $0
- **Dashboard**: `/pipeline`, `/reo`

### pipeline_reviewer.py — Pipeline Reviewer Service Stub
- **Purpose**: Phase 1.1 replacement for the disabled `pipeline-review` cron job. Reactive pipeline health analysis.
- **Trigger**: `pipeline.health` events
- **LLM**: Both Ollama (5 refs) and Claude (3 refs)
- **Cost**: Variable
- **Dashboard**: `/pipeline`, `/health`

### observation_tunnel.py — Observation Tunnel
- **Purpose**: Phase 1.1 design section 6.5. Funnels observability data between services — audit events, decision events, cost events.
- **Trigger**: Service events (internal)
- **LLM**: None (data relay only)
- **Cost**: $0
- **Dashboard**: `/observability`

### Shared Components (not services, but used by all services)

- **`_shared.py`** — Shared utilities module imported by all V2 services (logging, Pulse API helpers, common types).
- **`observability/` package** — Python package (`audit_log.py`, `cost_log.py`, `decision_log.py`, `notify.py`, `thread.py`) providing structured observability logging. Wired into 6 pipeline services during Phase 5.5.

---

## Layer 4: Dev-Only Infrastructure

Launchd agents mirroring production but pointing to Alfred-Dev for testing:

| Agent | Launchd ID | Script Path | Interval |
|-------|------------|-------------|----------|
| Dev Dispatcher | `com.aion.nexus-dev-dispatcher` | `Alfred-Dev/.claude/jobs/dispatcher.sh` | 300s |
| Dev Event Watcher | `com.aion.nexus-dev-event-watcher` | `Alfred-Dev/.claude/jobs/event-watcher.sh` | KeepAlive (persistent) |
| Dev Watchdog | `com.aion.nexus-dev-watchdog` | `Alfred-Dev/.claude/jobs/lib/dispatcher-watchdog.sh` | 900s |

All currently stopped (PID `-`). Used for testing pipeline changes before promoting to production.

### Additional Launchd Agents (infrastructure services, not Nexus orchestrators)

| Agent | Launchd ID | Purpose | Status |
|-------|------------|---------|--------|
| Anthropic Reverse Proxy | `com.aion.anthropic-proxy` | Usage-tracking proxy on :9800 | Stopped (exit 1) |
| Pulse Task System | `com.aion.pulse` | Pulse API server on :8700 | Stopped (exit 1; currently runs via Docker) |

These are foundational infrastructure that other layers depend on, but they don't orchestrate or execute jobs themselves.

---

## Personas (Capability Library)

32 personas in `.claude/jobs/personas/`. Each provides a prompt, permissions set, and optional config (model pinning, env files, tool restrictions).

### Active via Registry Jobs
| Persona | Used By | Tier |
|---------|---------|------|
| investigator | health-summary, persona-health-check, doc-sync-check, weekly-digest, ollama-test | Read-only |
| context-maintainer | context-maintenance | Write (scoped) |
| creative-thinker | creative-think | Write |
| creative-builder | creative-build | Write |
| creative-presenter | creative-present | Write |
| pipeline-reviewer | pipeline-review (disabled) | Read-only |

### Active via V2 Services
| Persona | Used By | Tier |
|---------|---------|------|
| task-evaluator | evaluate.py, score.py | Evaluation |
| task-investigator | diagnose.py | Investigation |
| autofix-executor | executor.py (V2) | Full execution |
| ai-reviewer | reviewer.py | Review |
| orchestrator | orchestrate.py | Orchestration |

### Available (On-Demand / Team Compositions)
analyst, aurora-feedback, backend-eng, bug-fixer, content-writer, cortex, creative-action, db-eng, infrastructure-deployer, librarian, project-manager, researcher, researcher-readonly, security-reviewer, skill-experimenter, team-verdict, test-researcher, test-reviewer, test-writer, troubleshooter, ux-eng

---

## Dashboard Page Map

### Key Operational Pages (most relevant to this audit)

| Route | Page | Data Source |
|-------|------|-------------|
| `/jobs` | RecurringJobsPage | `registry.yaml` + cost-ledger.jsonl + execution logs |
| `/pipeline` | PipelinePage | Pulse API (task labels, stage metrics, recent executions) |
| `/nexus-ops` | NexusOpsPage | Unified timeline (audit events, job events, pipeline events), alerts, graph, analytics |
| `/health` | HealthPage | Component health (heartbeat files, service status) |
| `/usage` | UsagePage | Proxy DB `api_requests` table (Anthropic rate-limit headers) |
| `/reo` | ReoPage | Reviews, Executions, Orchestrations (decision_events table) |
| `/digest` | DigestPage | Weekly digest job output |
| `/personas` | PersonasPage | Persona directory scan + Pulse API persona metadata |
| `/documentation` | ReferencePage | Static architecture diagram (job/pipeline/aurora topology) |
| `/observability` | ObservabilityPage | audit_events, decision_events, cost_events tables |

### Task Management Pages

| Route | Page | Data Source |
|-------|------|-------------|
| `/` | OverviewPage | Aggregate dashboard |
| `/board` | KanbanPage | Pulse tasks (kanban view) |
| `/tasks` | DashboardPage | Pulse tasks (list/filter view) |
| `/triage` | TriagePage | Pulse tasks needing triage |
| `/cross-project` | ProjectsPage | Cross-project task rollup |
| `/projects` | ProjectsListPage | Project list and detail views |
| `/findings` | FindingsPage | Investigation findings |

### Configuration and Analytics Pages

| Route | Page | Data Source |
|-------|------|-------------|
| `/automation` | RulesPage | Automation rules configuration |
| `/settings` | SettingsPage | Nexus settings (nexus-settings.json) |
| `/budget` | BudgetPage | Budget management (company-registry.yaml) |
| `/notifications` | NotificationsPage | Notification history |
| `/patterns` | PatternsPage | Detected execution patterns |
| `/cortex` | CortexPage | Cortex AI assistant interface |
| `/jarvis-memory` | JarvisMemoryPage | Jarvis memory tier visualization |
| `/token-compression` | TokenCompressionPage | Token compression benchmark data |
| `/reviews` | ReviewPage | Code/task review history |
| `/pulsars` | PulsarsPage | Pulsar metrics |
| `/report` | ReportPage | Report generation |
| `/document-guard` | DocumentGuardPage | Document protection rules |
| `/account` | AccountPage | Account settings |
| `/create` | ProjectCreatorPage | Project creation wizard |

### Redirect Aliases

| Route | Redirects To |
|-------|-------------|
| `/decisions` | `/reo` |
| `/reference` | `/documentation` |
| `/queue` | `/tasks?board=blocked` |
| `/ready` | `/tasks?board=ready` |
| `/approvals` | `/tasks?board=approvals` |
| `/activity` | `/nexus-ops` |
| `/schedule` | `/nexus-ops?tab=schedule` |
| `/timeline` | `/nexus-ops?tab=schedule` |
| `/rules` | `/automation` |

---

## Summary Statistics

| Category | Count | LLM Cost |
|----------|-------|----------|
| Infrastructure orchestrators (bash) | 7 | $0 |
| Jarvis-side infrastructure scripts | 8 (+ probe-headers ~$0.01/2h) | ~$0 |
| Recurring LLM jobs (enabled) | 9 | $0 (all Ollama) |
| Recurring LLM jobs (disabled) | 1 | N/A |
| V2 pipeline services | 9 (+2 shared modules) | Variable (most Ollama, some Claude) |
| Dev-only agents | 3 | $0 (stopped) |
| Additional launchd agents | 2 | $0 (infrastructure) |
| Personas (total) | 32 | — |
| Dashboard routes (pages) | 24 | — |
| Dashboard routes (redirects) | 9 | — |
| **Total executable components** | **39** | — |
