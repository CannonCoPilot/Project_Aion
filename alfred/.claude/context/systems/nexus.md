# Nexus — Autonomous Operations Platform

**Status**: Active
**Named**: 2026-03-03

## What Is Nexus?

Nexus is the name for the entire autonomous operations platform that powers AIProjects. It is the scheduling, execution, communication, and observability layer that runs headless AI jobs, manages task lifecycles, and coordinates between human and machine.

**Aurora** (the creative surprise system) is a tenant of Nexus — it runs on Nexus infrastructure but is its own project. Everything else that makes headless automation work **is** Nexus.

## Component Map

```
Nexus
├── Scheduling Layer
│   ├── dispatcher.sh              — Master scheduler (cron */5, pure bash)
│   ├── registry.yaml              — Job definitions (schedule, budget, persona, pre_check)
│   ├── state/nexus-settings.json  — Runtime settings (risk gates, timing, turbo mode)
│   ├── lib/nexus-settings.sh      — Settings reader library (sourced by scripts)
│   ├── bin/nexus-turbo            — CLI for turbo mode and timing control
│   └── state/last-run.json        — Per-job execution timestamps
│
├── Execution Layer
│   ├── executor.sh                — Persona-aware Claude Code / Ollama runner
│   ├── team-runner.py             — Multi-agent team orchestrator (parallel verdicts + consensus)
│   ├── personas/                  — Permission profiles (prompt + config + permissions)
│   ├── engine routing             — claude-code | ollama, with API retry logic
│   └── LLM router                — advisory model selection via Loom routing engine
│
├── Task Automation Pipeline
│   ├── Pulse (FastAPI, port 8700)  — Task management (PostgreSQL, labels, dependencies)
│   ├── event-watcher.sh           — Detects task events, stamps stage:intake (cron */2)
│   ├── task-evaluator             — intake → route/queue: risk/capability scoring (1h)
│   ├── task-investigator          — route → queue or review (daily @9pm)
│   ├── task-executor              — Executes stage:queue + risk:safe tasks (2h)
│   ├── task-executor-infra        — Infrastructure deployments (1h, temp)
│   ├── task-research              — Executes pipeline:approved + type:research tasks (1h). Three-tier completion: signal→Action Required, no-signal+human→FYI, no-signal+auto→close
│   ├── pipeline-watchdog.sh       — Label integrity, gate validation, stuck detection (~5 min)
│   ├── lib/label-ops.sh           — Mutation gateway: all label changes flow through here
│   └── autofix-scoring-rules.md   — Shared deterministic scoring reference
│
├── Communication Layer
│   ├── msgbus.sh                  — Append-only event store (messages.jsonl)
│   ├── msg-relay.sh               — DND-aware notification delivery
│   ├── send-telegram.sh           — Telegram Bot API (messages + inline keyboards)
│   └── telegram-callback-handler  — Two-way Telegram (button taps → job triggers)
│
├── Job Management (Dashboard UI)
│   ├── RecurringJobsPage          — Web UI at /jobs (view, toggle, create, edit, run)
│   ├── recurring-jobs service     — SLA health, cron/systemd aggregation, workflow CRUD
│   ├── workflows/*.md             — Standalone workflow instruction files (41 files)
│   ├── job_overrides              — Per-job enable/schedule overrides (nexus-settings.json)
│   └── Alert rules                — missed_schedule, sla_degradation, cost_anomaly
│
├── Observability
│   ├── dashboard.sh               — Terminal dashboard (job grid, costs, msgbus health)
│   ├── cost-report.sh             — Per-job and total USD cost tracking
│   ├── weekly-digest.sh           — Week-in-review summary
│   ├── dispatcher-watchdog.sh     — External cron watchdog (alerts if dispatcher stalls)
│   ├── Prometheus Pushgateway     — Metrics (duration, cost, success, run count)
│   └── logs/headless/             — Structured execution logs (JSON + plaintext)
│
├── Interactive Layer (Claude Code sessions)
│   ├── hooks/                     — 16+ lifecycle hooks (security, tracking, routing)
│   ├── orchestration/             — YAML plan specs (import format; runtime in Pulse projects)
│   └── sessions.sh                — Conversation continuity for agent jobs
│
└── Tenants (systems that run ON Nexus)
    ├── Aurora                     — Creative surprise pipeline (see aurora.md)
    ├── ABS Librarian              — AudioBookShelf naming enforcement
    ├── Health Summary             — Docker container health checks
    ├── Threat Intel               — Weekly threat intelligence reports
    ├── Backup Validate            — Backup system validation
    ├── Upgrade Discover           — Claude Code / MCP update detection
    └── (all jobs in registry.yaml)
```

## Guiding Principle

**Nexus exists to reduce Sir's workload — securely and cost-effectively.** Every automation should eliminate manual effort, not create it. If a process generates work Sir has to clean up (duplicate tasks, false positives, unnecessary approvals), that process is broken and must be fixed.

## Key Design Principles

1. **Single entry point**: The dispatcher is the only cron job (plus watchdog and callback handler). Everything triggers through it or through Telegram callbacks.
2. **Persona isolation**: Every job runs with explicit permissions. No job gets more access than it needs.
3. **Pre-check gates (REQUIRED)**: Every scheduled job MUST have a `pre_check` bash gate before LLM invocation. If nothing changed, no LLM cost. The only exception is jobs whose purpose is to detect problems (e.g., `health-summary`). When adding new jobs, always ask: "Can I gate this with a cheap bash check?"
4. **Human-in-the-loop**: Critical/destructive actions require Telegram approval. The system proposes, Sir disposes.
5. **Label-driven lifecycle**: Tasks move through `stage:intake` → `stage:evaluate` → `stage:route` → `stage:review` → `stage:queue` → `stage:execute` → closed. Gate labels (`auto:`, `waiting:`, `risk:`) control routing at each stage.
6. **External watchdog**: The dispatcher touches a heartbeat file every cycle. The `dispatcher-watchdog.sh` cron (every 15min) alerts via Telegram if the heartbeat goes stale.
7. **Pulse projects are source of truth for multi-phase work**: YAML specs in `.claude/orchestration/` are the authoring/import format. Once imported, Pulse owns all project state — phases, dependencies, gates, and task advancement. Never duplicated at multiple granularities (see task-evaluator prompt, Step 5).

## Key Paths

| What | Where |
|------|-------|
| Dispatcher | `.claude/jobs/dispatcher.sh` |
| Executor | `.claude/jobs/executor.sh` |
| Team Runner | `.claude/jobs/team-runner.py` |
| Registry | `.claude/jobs/registry.yaml` |
| Personas | `.claude/jobs/personas/<name>/` |
| Message bus | `.claude/jobs/lib/msgbus.sh` |
| Message relay | `.claude/jobs/lib/msg-relay.sh` |
| Telegram | `.claude/jobs/lib/send-telegram.sh` |
| Callback handler | `.claude/jobs/lib/telegram-callback-handler.sh` |
| Dashboard | `.claude/jobs/lib/dashboard.sh` |
| Scoring rules | `.claude/jobs/lib/autofix-scoring-rules.md` |
| Workflow files | `.claude/jobs/workflows/<job>.md` |
| Job management UI | `~/Code/nexus-dashboard` → `/jobs` page |
| Job management API | `~/Code/nexus-dashboard/server/routes/recurring-jobs.ts` |
| Execution logs | `.claude/logs/headless/executions/` |
| State files | `.claude/jobs/state/` |
| Agent output | `.claude/agent-output/` |
| LLM Router (Loom) | `~/Code/loom/determinism/routing.py`, `providers.py` |
| Router config | Pulse setting `llm-router-config` (port 8700) |
| Routing table | `~/Code/loom/determinism/routing_data/routing-table.yaml` |

## Model Router Behavior (post-AIProjects-u6uh, 2026-04-08)

The LLM router is **advisory by default**. Persona configs can opt into authoritative pinning via an explicit flag in `config.yaml`:

```yaml
engine:
  model: sonnet
  router_override: true   # persona pin wins; router suggestion is logged but ignored
```

Without `router_override: true`, the router's suggestion is honored and any `engine.model` value in the persona config is **ignored**. This is the new default — most personas should not pin a model.

Currently flagged with `router_override: true`: `ai-david`, `orchestrator` (quality-critical personas where sonnet is non-negotiable). `researcher` was initially pinned in session 701 but un-pinned in session 702 Phase 2 to trial haiku — re-pin if quality regression appears.

**Pre-fix behavior (bug, 2026-03-30 → 2026-04-08):** `PERSONA_MODEL` was read from config but never assigned to `MODEL`, so every job ran on the registry default `sonnet` regardless of pin. Router suggestions were silently discarded — 542/542 jobs overridden over 9 days, $251.93 spent, ~$28/day. Cost-ledger entries with `router_overridden: true` from this window are evidence of the bug, not intent.

**Post-fix delta (session 702 interim, 5.92h window, 34 jobs, 0 failures):** non-pinned personas dropped 27-100% per-job (mean ~55%) — analyst -100% (gemma3:12b free local), librarian -74%, infrastructure-deployer -61%, aurora-action -59%, cortex -57%, task-evaluator -37%, investigator -28%, bug-fixer -27%. Aggregate daily projection (mix-adjusted): **~$22/day vs $28.82/day baseline** (~24% reduction) — lower than the original ~$5-10/day estimate because pinned personas account for ~57% of pre-fix spend and stay on sonnet by design. Full delta: `.claude/context/systems/model-router-phase2-delta.md`. 24h re-check pending after 2026-04-09T20:40Z.

Code reference: `.claude/jobs/executor.sh:1247-1293`.

## Related Documentation

- **@.claude/context/systems/nexus-plumbing-map.md** — **Script-level architecture reference** (dependencies, data flows, state files, label state machine). **Read this BEFORE modifying any Nexus script.**
- Excalidraw diagram: Obsidian `05-AI/Projects/nexus-architecture.excalidraw`
- @.claude/context/systems/aurora.md — Aurora surprise system (Nexus tenant)
- **@.claude/context/systems/stage-lifecycle.md** — Formalized stage lifecycle: stage definitions, transition rules, label cleanup status, event-driven dispatch
- @.claude/context/systems/task-automation.md — Task automation pipeline details
- **@.claude/context/systems/workflow-inventory.md** — **Every path a task can travel**: entry points, stage transitions, label mutations, user actions, system reactions. Canonical workflow reference.
- @.claude/context/systems/agent-system.md — Custom agent architecture
- @.claude/jobs/registry.yaml — All registered jobs
