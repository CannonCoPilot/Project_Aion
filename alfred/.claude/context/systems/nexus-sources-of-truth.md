# Nexus Sources of Truth — Canonical File Registry

> **This file is the single reference for every authoritative file in the Nexus autonomous operations platform.**
> It must be loaded when working on Nexus jobs, validating rules, or modifying pipeline behavior.
> Protected by Document Guard — updates require explicit approval.
>
> **Full registry**: For ALL sources of truth across AIProjects (not just Nexus), see `.claude/registries/manifest.yaml`. This file is the Nexus-specific subset with cascade dependency rules.
>
> **Maintenance rule**: When any file listed here is created, renamed, moved, or deleted, this registry MUST be updated in the same session. When validating Nexus rules or jobs, cross-reference this registry to ensure all consumers are accounted for.

Last verified: 2026-04-09 (AIProjects-bk5x — pipeline-watchdog.sh Check 10b: orphaned blocked:\<task-id\> auto-clear. Fixes reverse dependency gap where dependents retained stale blocked:AIProjects-xxx labels after parent closed. Also fixed pre-existing Check 10 crash: grep pipefail + jq empty input + undefined STATE_DIR)

---

## Configuration Files

These define the rules. Changes here cascade to all consumers.

| File | Source of Truth For | Format | Runtime Mutable? |
|------|-------------------|--------|-----------------|
| `.claude/context/tools/label-taxonomy.yaml` | **All label definitions** — prefixes, values, functions, mutual exclusions, gate-stage rules, state transitions, board classification, blocker definitions. Includes `assigned:` (delegation routing to specific personas) and `completed-by:` (attribution) prefixes | YAML | No — manual edits only |
| `.claude/jobs/lib/routing-rules.yaml` | **Executor pickup criteria** — stage transitions, dispatch routing, authorization rules (incl. `approval:orchestration`), deny-list, source trust levels, fast-track rules, dispatch blockers | YAML | No — manual edits only |
| `.claude/jobs/lib/risk-policy.yaml` | **Default risk gate policy** — per-executor auto_execute/with_approval/block buckets and global pipeline:approved override. Policy defaults read by nexus-settings.sh when nexus-settings.json doesn't override | YAML | No — manual edits only (git-tracked policy) |
| `.claude/jobs/registry.yaml` | **Job definitions** — schedule, budget, persona, model, pre_checks, quiet hours, notification preferences, team configuration. Jobs reference workflow files via `workflow:` field | YAML | No — auto-read by dispatcher every 5 min. Dashboard can create/delete jobs via API |
| `.claude/jobs/workflows/<job>.md` | **Job execution instructions** — extracted from registry.yaml inline prompts (session 465). Each job has a standalone markdown file with its workflow steps. Editable via dashboard `/jobs` page or text editor | Markdown | Yes — dashboard API PUT + audit trail |
| `paths-registry.yaml` | **All external paths** — project locations, infrastructure hosts, service endpoints, NAS shares, symlinks | YAML | No — manual edits only |
| Pulse service (port 8700) | **Task management API** — tasks, labels, events, pipeline triggers, routing-rules.yaml reader | FastAPI | Yes — runtime service |
| `.claude/settings.json` | **Claude Code permissions** — hooks lifecycle, enabled plugins, MCP servers, spinner verbs | JSON | No — manual edits only (security-critical) |
| `.claude/jobs/state/nexus-settings.json` | **Runtime executor settings** — risk gates per executor, timing overrides, turbo mode state, pipeline runner enable/disable + cost cap, task-type gate overrides (per type:label risk gate precedence), AI David confidence thresholds (auto-execute/propose/escalate decision tuning), **job_overrides** (per-job enable/disable + schedule overrides, read by dispatcher `is_job_due()`) | JSON | Yes — dashboard UI, CLI, dispatcher auto-revert |
| `.claude/jobs/rules/safety.yaml` | **Hard safety rules + deny-list** — actions that are always blocked, deny-list rules with override classification (which can be relaxed by orchestration approval vs which are permanently hard-blocked) | YAML | No — manual edits only |
| `.claude/jobs/config/github-repos.yaml` | **GitHub repo monitoring config** — which repos to poll for issues, project label mapping, exclude filters | YAML | No — manual edits only |
| `.claude/registries/public-endpoints-allowlist.yaml` | **Public endpoint expected state** — per-hostname declared response codes for the nightly exposure-audit job. Defines `default_accepted_codes`, `all_paths_accepted` (SPA catchall), and per-path `expected` overrides. Every public hostname in the Caddyfile must have an entry; missing entries are flagged as `undeclared` | YAML | No — manual edits only (security-critical) |
| Pulse `llm-router-config` setting | **LLM provider registry** — model definitions, pricing, capabilities, routing rules. Read by Loom router (`~/Code/loom/determinism/providers.py`) via Pulse settings API. Executor.sh calls router before model selection (advisory — persona/job pins override) | JSON (Pulse settings) | Yes — Pulse settings API |
| `~/Code/loom/determinism/routing_data/routing-table.yaml` | **Empirical routing table** — per task-type, per-model determinism scores from 5,142+ experimental runs. Manual entries (num_runs: 0) for Anthropic/Gemini models. Regenerated via `python3 -m determinism generate-table` | YAML | No — regenerated from experiments |

---

## Chokepoint Scripts

These implement the rules. They MUST stay in sync with the configuration files above.

| File | Authoritative For | Must Mirror |
|------|-------------------|-------------|
| `.claude/jobs/lib/label-ops.sh` | **All label mutations** — single chokepoint for every label change. Enforces mutual exclusions, rejects deprecated labels, logs all changes. Delegates to Pulse API for label writes and trigger emission. **For multi-label state transitions (approve, claim, complete, etc.), prefer `pulse transition <id> <scenario> --source <source>`** which handles all adds/removes atomically with precondition validation | `label-taxonomy.yaml` (mutex arrays, deprecated list, transitions section), Pulse API |
| `.claude/jobs/lib/routing-helpers.sh` | **Bash routing logic** — eligibility checks (incl. task-type gate overrides), stage transitions, trust evaluation | `routing-rules.yaml` (must be exact mirror), `nexus-settings.sh` (risk gates + task-type overrides) |
| `.claude/jobs/dispatcher.sh` | **Master scheduler** — reads registry, manages job locking, invokes executor, post-cycle housekeeping (msgbus, relay, watchdog), turbo auto-revert. `is_job_due()` checks `job_overrides` for per-job enable/schedule overrides before registry defaults | `registry.yaml`, `nexus-settings.sh` (job_overrides) |
| `.claude/jobs/executor.sh` | **Persona-aware LLM runner** — loads persona config, calls Loom LLM router for advisory model selection (persona/job pins override), invokes claude or ollama, handles retries, logs execution + routing decisions, pushes metrics. Resolves `workflow:` field from registry → reads `.claude/jobs/workflows/<job>.md` for prompt content (falls back to inline prompt). Injects dynamic AI David confidence thresholds from nexus-settings.json into prompt | `registry.yaml`, `workflows/*.md`, persona configs, `nexus-settings.sh` (AI David thresholds), Loom router (`~/Code/loom/determinism/`) |
| `.claude/jobs/lib/nexus-settings.sh` | **Runtime settings reader** — risk gate queries, task-type gate overrides, AI David confidence thresholds, timing overrides, turbo mode detection/revert, **job override queries** (`ns_get_job_override`). Sourced by routing-helpers, event-watcher, dispatcher, executor | `nexus-settings.json` |
| `.claude/jobs/event-watcher.sh` | **Task event detection** — creation/closure detection, stage:intake stamping, project advancement (via Pulse `/projects/advance-all`), dispatch routing | `routing-helpers.sh`, `label-ops.sh`, `nexus-settings.sh`, Pulse project API |
| `.claude/jobs/pipeline-watchdog.sh` | **Label integrity enforcement** — gate-stage validation, mutex checks, deprecated cleanup, stuck detection (with type:parent awareness), orphaned-subtask detection (gate-aware), completed-by signal handler, auto-fixes (incl. approval-without-transition detection), **blocked:\<task-id\> orphan clearing** (Check 10b: detects `blocked:AIProjects-xxx` labels pointing at closed parents, clears them, promotes to auto:ready via `dependency-parent-closed` scenario). Uses flock for mutual exclusion | `label-taxonomy.yaml`, `routing-rules.yaml` |
| `.claude/skills/nexus-pipeline-ops/SKILL.md` | **Unified pipeline operations skill** — standard interface for health audits, task transitions, approval flows, label validation. All pipeline mutations should go through this skill, not raw CLI | `label-taxonomy.yaml` (transitions), `routing-rules.yaml`, `stage-lifecycle.md` |
| `.claude/jobs/team-runner.py` | **Multi-agent team orchestrator** — spawns parallel executor.sh processes, collects structured verdicts (VERDICT/CONFIDENCE/REASONING protocol), applies consensus rules (unanimous-approve, majority, any-deny-blocks), escalates conflicts to Telegram HITL with 60-min polling, enforces per-member + job-level budget guards. Test suite: `tests/test_team_runner.py` | `executor.sh` (invokes multiple), `registry.yaml` team configs, `msgbus.sh` (escalation) |
| `.claude/jobs/lib/trigger-ops.sh` | **Pipeline trigger queue** — emit/claim/complete triggers, dedup for batch handlers, handler resolution from stage+capability. Delegates to Pulse trigger API | `routing-helpers.sh`, Pulse API |
| `.claude/jobs/pipeline-runner.sh` | **Event-driven dispatch loop** — deployed as cron `--once` every 1min (also supports persistent loop mode via systemd for 5s polling). Reads `pulse.pipeline_triggers` table (PostgreSQL), dedup, cost cap, concurrency limits, dashboard-toggleable enable/disable | `trigger-ops.sh` (via Pulse API), `dispatcher.sh`, `nexus-settings.json` (reads pipeline_runner.enabled + max_dispatches_per_hour) |
| `.claude/jobs/nexus-dispatch` | **On-demand dispatch CLI** — manual task dispatch with high-priority triggers, runner fallback | `trigger-ops.sh`, `dispatcher.sh` |
| `.claude/jobs/lib/watch-trigger-ops.sh` | **Watch trigger API helpers** — bash wrappers for Pulse watch trigger endpoints (create, check-files, satisfy, cancel) | Pulse watch triggers API |
| `.claude/jobs/obsidian-watch-monitor.sh` | **Obsidian file change monitor** — checksum-based detection, pattern matching against active triggers, pipeline trigger emission for AI David evaluation. Zero LLM cost (runs as pre_check) | `watch-trigger-ops.sh`, `pulse-api.sh`, `label-ops.sh` |
| `.claude/jobs/github-issue-poller.sh` | **GitHub issue intake** — polls repos for bug issues, creates Pulse tasks, comments on GitHub. Zero LLM cost (runs as pre_check) | `github-ops.sh`, `github-repos.yaml`, Pulse CLI |
| `.claude/jobs/lib/github-ops.sh` | **GitHub operations library** — shared functions for `gh` CLI: list/get/comment issues, response templates | `github-repos.yaml` |
| `.claude/jobs/lib/pulse-api.sh` | **Pulse API bash layer** — wraps all Pulse REST calls (get/post/patch/delete tasks, labels, triggers). Single chokepoint for bash→Pulse communication. Sourced by: event-watcher, executor, label-ops, obsidian-watch-monitor, pipeline-watchdog, routing-helpers, trigger-ops | Pulse API (localhost:8700) |
| `.claude/jobs/lib/audit-log.sh` | **Unified audit log library** — `log_audit(actor, action, entity_type, entity_id, details, correlation_id)` writes to single `.claude/data/audit-log.jsonl`. 42 action taxonomy across 8 categories, 4 actor types, 9 entity types. Replaces 7 scattered JSONL files with consistent schema. Sourced via common.sh. 120-day rotation. Ingested by Promtail→Loki (job: nexus-audit) | None (foundational, sourced by common.sh) |
| `.claude/jobs/lib/common.sh` | **Base utility library** — logging (log, log_info, log_error, log_warning, log_success), path resolution, error handling, audit-log sourcing. Sourced by 10 scripts: dashboard, directive-runner, dispatcher, event-watcher, executor, msg-relay, obsidian-watch-monitor, persona-health-check, pipeline-runner, pipeline-watchdog | `audit-log.sh` |
| `.claude/jobs/lib/assertions.sh` | **Post-execution assertions** — modular, log-only checks run after LLM execution completes: task resolved (critical), claim released (warning), clean workdir (warning, currently disabled). Complements pipeline-watchdog's 5-min reactive cycle with immediate verification. Double-source guarded | `pulse-api.sh` (task queries), `msgbus.sh` (critical alerts) |
| `.claude/jobs/lib/directive-runner.sh` | **Structured effect executor** — runs JSON effect manifests from Claude output (label mutations, task updates). Sources `common.sh`, `label-ops.sh` | `label-ops.sh`, Pulse API |
| `.claude/jobs/persona-health-check.sh` | **Persona directory validator** — checks persona dirs have required files, validates registry references | `registry.yaml`, persona configs |
| `.claude/jobs/bin/exposure-audit.sh` | **Nightly public endpoint drift detector** — parses Caddyfile for public hostnames, curls sensitive paths unauthenticated, compares against allowlist, alerts via Telegram + creates waiting:david Pulse task on drift. Runs 03:00 daily as `engine: script` job. Zero LLM cost. Built in response to 2026-04-07 google-token-vault incident | `public-endpoints-allowlist.yaml`, `~/Docker/mydocker/caddy/Caddyfile`, `send-telegram.sh`, Pulse CLI |
| `.claude/jobs/lib/secret-scrub.py` | **Secret scrub library** — single chokepoint for redacting API keys, tokens, JWTs, private keys, and field-based secrets from text BEFORE it lands in `.claude/data/training/content/`. 22 rule types covering Anthropic/OpenAI/GitHub/GCP/Slack/AWS/Telegram/JWT/private-key/resend/perplexity/brave/cloudflare/secret-field patterns. Replaces matched values with `[REDACTED:rule-name]` markers. Logs every redaction (rule + length + masked prefix/suffix only) to `.claude/logs/secret-scrub.jsonl` for audit. Importable as Python lib OR usable as CLI filter (stdin → stdout). Test suite: `tests/test_secret_scrub.py` (26 tests). Built T3.2 / AIProjects-v523 in response to AIfred 3-month + loom-colab 2-day public-git capture-pipeline leaks | None (foundational, sourced by capture writers) |
| `.claude/jobs/lib/caddyfile-lint.py` | **Caddyfile pre-commit lint** — parses every `<host> { ... }` block in the Caddyfile, looks up the host's `auth_strategy` in `public-endpoints-allowlist.yaml`, and rejects commits where: (a) host is not in allowlist (default-deny for new public services), (b) `auth_strategy=forward_auth` but block lacks `import authentik_forward_auth` and no `# AUDITED` annotation, (c) `auth_strategy=ip_gated` but no `client_ip` matcher present. Catches the 2026-04 google-token-vault failure pattern at commit time, complementing the runtime exposure-audit job. Wired as a `repo: local` pre-commit hook in `~/Docker/mydocker/.pre-commit-config.yaml`. Built T3.5 / AIProjects-8dnh | `public-endpoints-allowlist.yaml`, `~/Docker/mydocker/caddy/Caddyfile` |
| `.claude/hooks/session-start.js` `getSecurityHealthCheck()` | **Session-start security hook smoke test** — invokes credential-guard.js, document-guard.js, and secret-scrub.py with benign inputs at every session start; surfaces a `🚨 SECURITY HOOK HEALTH CHECK FAILED` banner in the SessionStart context if any hook returns wrong response or fails to execute. Catches the silent fail-open mode where a security hook is broken/missing but every tool call proceeds anyway. Built T3.5 / AIProjects-8dnh | `credential-guard.js`, `document-guard.js`, `secret-scrub.py` |
| `~/Code/pulse/pulse/services/project_import.py` | **Project import service** — parses orchestration YAML, creates Pulse project + tasks, handles dedup by yaml_task_id/beads_id/label, validates approval blocks | Pulse models, `id_generator.py` |
| `~/Code/pulse/pulse/services/project_engine.py` | **Project execution engine** — dependency resolution (`get_unblocked_tasks`), gate handling (approval/label/timeout), project advancement, completion detection | Pulse models |
| `~/Code/pulse/pulse/routers/projects.py` | **Project API endpoints** — 11 endpoints: CRUD, import, execute, advance, advance-all, unblocked, approve-gate, project tasks | `project_engine.py`, `project_import.py` |

**Retired** (archived to `.claude/jobs/lib/archive/`):
- `orchestration-loader.sh` — replaced by `project_import.py` + Pulse import API
- `orchestration-sync.sh` + `orchestration-status-sync.sh` — no longer needed (Pulse is source of truth)

---

## Persona System

Each persona lives at `.claude/jobs/personas/<name>/` with these files:

| File | Authoritative For |
|------|-------------------|
| `prompt.md` | System prompt prepended to every job execution |
| `config.yaml` | Engine, model, limits (max_turns, max_budget_usd, timeout), output path |
| `permissions.yaml` | Tool allowlist/denylist for the persona |
| `methodology.yaml` | Persona identity (goal, value_driver), perspective (lens, concerns, blindspots), voice (signature_patterns), decision heuristics, context scope, quality scaling (quick/standard/deep methods + time budgets). All 22 active personas have this file. |

### Special: AI David

| File | Authoritative For |
|------|-------------------|
| `.claude/jobs/personas/ai-david/learned-patterns.yaml` | Decision patterns built from feedback loop (12+ seeded rules, grows over time) |
| `.claude/agent-output/results/ai-david/feedback.jsonl` | Feedback learning data — agreed/wrong/adjust verdicts with comments |

Active personas (23): `ai-david`, `analyst`, `aurora-action`, `aurora-builder`, `aurora-feedback`, `aurora-presenter`, `aurora-thinker`, `autofix-executor`, `backend-eng`, `bug-fixer`, `db-eng`, `infrastructure-deployer`, `investigator`, `librarian`, `pipeline-reviewer`, `project-manager`, `researcher`, `security-reviewer`, `task-evaluator`, `task-investigator`, `team-verdict`, `troubleshooter`, `ux-eng`

Note: `researcher` has an extra file `quality-standards.md`. `_template` is a scaffold, not an active persona. `security-reviewer`, `backend-eng`, `db-eng`, `ux-eng`, `project-manager` were created methodology-first (Persona Evolution project, 2026-03-20).

**Researcher three-tier routing** (2026-04-09): On completion, the researcher routes based on signal + source:
- **SIGNAL** (actionable findings) → `review:research + waiting:david` (Action Required — David decides: Plan It / Execute / Noted)
- **NO SIGNAL + human-requested** (`source:session`/`source:claude-app`) → `review:research` only (FYI — visible in Research Queue, no blocker)
- **NO SIGNAL + automated** (`source:headless`/`source:pulsar`) → closes silently (awareness via weekly digest)

### Persona Categories

Personas fall into three categories based on how they're invoked:

- **Job-backed**: Have a `registry.yaml` entry, can be scheduled by the dispatcher (e.g., `ai-david`, `task-evaluator`, `task-research`, `pipeline-reviewer`, `infrastructure-deployer`, `bug-fixer`, `security-reviewer`)
- **Assigned-only**: No registry entry — invoked only via `assigned:<persona>` label routing or as team members (e.g., `backend-eng`, `db-eng`, `ux-eng`, `project-manager`)
- **Team-only**: Lightweight verdict personas used exclusively by team-runner.py for parallel member evaluation (e.g., `team-verdict`). No independent registry entry — referenced in team member configs within job definitions.

### Dispatch Precedence

When dispatching a task at `stage:queue`, the routing system checks labels in this order (per `routing-rules.yaml`):

1. `assigned:<persona>` — direct persona assignment, bypasses all other routing
2. `type:<type>` — type-specific routing (e.g., `type:research` → task-research)
3. `capability:<cap>` — capability-based routing (e.g., `capability:security` → security-reviewer)
4. Default — falls through to task-executor

The `assigned:` label enables AI David to delegate work to specific specialists, cross-persona consultation, and review handoff patterns.

### Verdict Protocol (Team Jobs)

Team members MUST end their response with this structured format:

```
VERDICT: approve|deny|uncertain
CONFIDENCE: high|medium|low
REASONING: <explanation>
```

Parsing rules (team-runner.py): last occurrence wins, markdown-bold tolerant (`**VERDICT**:`), missing verdict → `UNCERTAIN`. Consensus engine evaluates collected verdicts against the configured rule.

---

## Runtime State

These files are mutated at runtime by Nexus scripts. Do NOT edit manually.

| File | Authoritative For | Written By |
|------|-------------------|-----------|
| `.claude/jobs/state/nexus.db` | **Primary state database** — events table (all system events), job_state table (per-job execution state). SQLite with WAL | `nexusdb.py` |
| `pulse.projects` table (PostgreSQL) | **Project management** — project metadata, phases JSONB, approval JSONB, config, source_yaml reference. Tasks linked via `project_id` FK | Pulse API / `project_import.py` / `project_engine.py` |
| `pulse.pipeline_triggers` table (PostgreSQL) | **Pipeline trigger queue** — event-driven dispatch queue (previously in nexus.db) | Pulse API / `trigger-ops.sh` (via Pulse API) |
| `pulse.watch_triggers` table (PostgreSQL) | **Watch trigger definitions** — long-lived file-watch conditions linked to tasks. Status: active/satisfied/cancelled/expired. File patterns for Obsidian monitoring | Pulse API / dashboard / `obsidian-watch-monitor.sh` |
| `pulse.tasks` table (PostgreSQL) | **Task database** — all task records, metadata, labels, audit trail. Note: the `project` column stores the **workspace** namespace (AIProjects/CreativeProjects); the API exposes it as both `workspace` (preferred) and `project` (legacy). The `project:*` label (initiative/product) is a separate concept stored in `task_labels`. | Pulse API / `pulse` CLI |
| `pulse.task_events` table (PostgreSQL) | **Task event audit trail** — creation, mutation, closure events | Pulse API / `pulse` CLI |
| `.claude/jobs/state/dispatcher-heartbeat` | Dispatcher liveness proof (mtime checked by watchdog every 15 min) | `dispatcher.sh` |
| `.claude/jobs/state/pipeline-runner.pid` | Pipeline runner PID file (liveness check) | `pipeline-runner.sh` |
| `.claude/jobs/state/pipeline-runner-heartbeat` | Pipeline runner liveness proof (mtime checked by watchdog) | `pipeline-runner.sh` |
| `.claude/jobs/state/event-watcher-cursor` | Event cursor position for incremental task event processing | `event-watcher.sh` |
| `.claude/jobs/state/obsidian-watch-checksums.json` | Obsidian file checksums for change detection (sha256 per watched file) | `obsidian-watch-monitor.sh` |
| `.claude/jobs/state/telegram-update-offset.txt` | Telegram polling pagination offset | `telegram-callback-handler.sh` |
| `.claude/jobs/state/locks/pipeline-watchdog.flock` | flock mutex — prevents concurrent watchdog runs | `pipeline-watchdog.sh` |
| `.claude/jobs/state/last-stall-alert` | Stall alert throttle timestamp | `pipeline-watchdog.sh` |
| `.claude/jobs/state/relay-dnd-state` | DND tracking state | `msg-relay.sh` |
| `.claude/jobs/state/relay-stuck-count` | Relay health counter | `msg-relay.sh` |
| `.claude/jobs/state/nexus-settings.json` | **Runtime executor settings** — risk gates, timing, turbo mode, pipeline runner enable + cost cap | `nexus-settings.sh`, dashboard API, `nexus-turbo` CLI. Read by: `pipeline-runner.sh` (pipeline_runner.enabled + max_dispatches_per_hour) |

---

## Audit Trails

Append-only logs. Never truncate or overwrite — these are the system's memory.

| File | Records | Written By |
|------|---------|-----------|
| `.claude/data/audit-log.jsonl` | **Unified audit trail** — every NEXUS mutation (job lifecycle, task pipeline, labels, budget, config, watchdog fixes). Schema: `{ts, actor, action, entity_type, entity_id, details, correlation_id}`. Ingested by Promtail→Loki (job: nexus-audit, 120d retention). Grafana dashboard: nexus-operations | `audit-log.sh` (via all scripts that source common.sh) |
| `.claude/data/label-mutations.jsonl` | **Every label change** — task_id, scenario, source, action, label, timestamp. **Legacy**: audit-log.jsonl now dual-writes these events | `label-ops.sh` |
| `.claude/data/pipeline-health.jsonl` | Watchdog integrity check results — violations, fixes, warnings, metrics | `pipeline-watchdog.sh` |
| `.claude/data/health-check-log.jsonl` | Health check execution results and timestamps | health-summary job |
| `.claude/data/cost-ledger.jsonl` | **Per-run cost & cache metrics** — job, model, cost_usd, input/output/cache_read/cache_creation tokens, cache_hit_ratio, duration, success | `executor.sh` |
| `.claude/logs/headless/nexus.jsonl` | **Structured JSON logging** (Loki-compatible) — {ts, level, component, job, msg} | All Nexus scripts |
| `.claude/logs/headless/executions/` | Per-job execution logs — JSON output + plaintext + `latest-*` symlinks | `executor.sh`, `team-runner.py` |
| `.claude/agent-output/results/ai-david/*.jsonl` | AI David decision logs — decision, confidence, pattern_matched, reasoning, risk, action | ai-david job |
| `.claude/data/nexus-settings-audit.jsonl` | **Settings change audit** — every risk gate, timing, turbo, and **job override** change with actor + timestamp. Also records **workflow edits**, **job creation**, and **job deletion** from the dashboard | `nexus-settings.sh`, dashboard API (recurring-jobs routes) |

---

## Agent Output

Job outputs produced by Nexus personas and on-demand agents. These contain analysis, decisions, and findings that are the operational results of autonomous work.

| Directory | Written By | Format | Content |
|-----------|-----------|--------|---------|
| `agent-output/aurora/` | aurora-action, aurora-build, aurora-present, aurora-think | JSON, JSONL | Creative pipeline state (think, build, action, process-log) |
| `agent-output/results/ai-david/` | ai-david job | JSONL + JSON | Decision logs (daily), summaries, approved-actions, feedback |
| `agent-output/results/task-evaluator/` | task-evaluator job | JSON | Per-task readiness evaluations |
| `agent-output/results/task-research/` | task-research job | JSON | Research findings per task |
| `agent-output/results/task-executor/` | task-executor job | JSON | Execution logs |
| `agent-output/results/task-investigator/` | task-investigator job | JSON | Investigation results |
| `agent-output/results/task-score/` | task-score job | JSON | Scoring/contradiction results |
| `agent-output/results/pipeline-reviewer/` | pipeline-review job | JSON | Pipeline integrity reviews |
| `agent-output/results/infrastructure-deployer/` | task-executor-infra job | JSON | Deployment logs |
| `agent-output/results/deep-research/` | agent-research job | MD | Research reports |
| `agent-output/results/autofix/` | autofix job | JSON | Autofix digests |
| `agent-output/results/teams/` | task-triage-team job | JSON | Team coordination results |
| `agent-output/results/code-analyzer/` | on-demand | MD | Codebase analysis reports |
| `agent-output/results/code-implementer/` | on-demand | MD + files | Implementation artifacts |
| `agent-output/results/media-normalize/` | media jobs | JSON | Media metadata |
| `agent-output/results/ollama-manager/` | ollama-test job | MD | Ollama status reports |
| `agent-output/results/plex-troubleshoot/` | plex-troubleshoot job | MD | Plex health checks |
| `agent-output/results/repo-watch/` | repo-watch job | MD | Repository monitoring |
| `agent-output/results/research/` | on-demand | MD | Investigation reports |
| `agent-output/results/project-plan-validator/` | on-demand | MD | Plan validation reports |
| `agent-output/results/memory-bank-synchronizer/` | on-demand | (empty) | Memory sync output |
| `agent-output/sessions/` | session artifacts | MD | Per-session markdown artifacts |

---

## Skill Data

| File | Source of Truth For | Written By |
|------|-------------------|-----------|
| `.claude/skills/upgrade/data/pending-upgrades.json` | **All tracked upgrades** — UP-001 through UP-048, status, findings, blockers | upgrade-discover job |
| `.claude/skills/upgrade/data/baselines.json` | **Current component versions** — ROCm, kernel, Claude Code, MCP servers | upgrade-discover job |
| `.claude/skills/upgrade/data/upgrade-history.jsonl` | **Upgrade audit trail** — all discoveries and actions over time | upgrade-discover job |
| `.claude/skills/upgrade/config.json` | **Upgrade source definitions** — what to monitor, keywords, target versions | Manual edits |
| `.claude/skills/thinking/SKILL.md` | **Thinking frameworks** — council, redteam, first-principles, science, depth | Manual edits |
| `.claude/skills/extract-wisdom/SKILL.md` | **Content extraction** — adaptive wisdom extraction from videos/podcasts/articles | Manual edits |
| `.claude/skills/osint/SKILL.md` | **OSINT investigations** — people, company, domain, org research | Manual edits |
| `.claude/skills/evals/SKILL.md` | **Agent evaluation** — graders, pass@k scoring, capability/regression testing | Manual edits |

---

## Message Bus & Communication

| File | Authoritative For |
|------|-------------------|
| `.claude/jobs/lib/msgbus.sh` | Message bus operations — send, query, deliver, expire, TTL cleanup, append-only event store |
| `.claude/jobs/lib/msg-relay.sh` | Notification delivery — DND-aware, Telegram integration, dashboard push, batching |
| `.claude/jobs/lib/send-telegram.sh` | Telegram Bot API wrapper — messages, inline keyboards, callback handling |
| `.claude/jobs/lib/telegram-callback-handler.sh` | Two-way Telegram — polls for updates, routes callbacks, manages awaiting-text state |

---

## Projects (formerly Orchestration)

Projects are first-class Pulse entities. YAML files in `.claude/orchestration/` are **import specs** — they define plans that get imported into Pulse via `POST /api/v1/projects/import`. Once imported, Pulse owns all state (project metadata, task linkage, phase tracking, advancement).

| File | Authoritative For |
|------|-------------------|
| `pulse.projects` table | **Project state** — phases, approval, config, status, completion tracking |
| `pulse.tasks` (project_id FK) | **Project tasks** — linked to projects via project_id, phase_id, yaml_task_id columns |
| `.claude/orchestration/*.yaml` | **Import specs** — YAML plan templates imported into Pulse (write-once, not live state) |
| `.claude/orchestration/README.md` | Orchestration/project system documentation and conventions |
| `~/Code/pulse/alembic/versions/004_add_projects.py` | **Schema migration** — projects table + task FK columns |
| `~/Code/pulse/alembic/versions/005_add_watch_triggers.py` | **Schema migration** — watch_triggers table for reactive task management |

---

## Reference Documentation

Human-maintained docs that describe the system. These don't govern behavior but must stay accurate.

| File | Documents |
|------|-----------|
| `.claude/context/systems/nexus.md` | Overall Nexus architecture and component map |
| `.claude/context/systems/nexus-plumbing-map.md` | Script-level architecture — call graphs, data flows, label state machine |
| `.claude/context/systems/stage-lifecycle.md` | Pipeline stage definitions, transition rules, fast-track conditions |
| `.claude/context/systems/workflow-inventory.md` | All 7 task entry points, user/system actions, error cases |
| `.claude/context/systems/task-automation.md` | Task automation pipeline overview — jobs, schedules, budgets |
| `.claude/context/tools/pulse-reference.md` | Pulse CLI/API reference — commands (use `--workspace` not `--project`), label quick-ref, task creation checklist |
| `.claude/jobs/lib/autofix-scoring-rules.md` | Deterministic promotion criteria (candidate → ready) |
| `.claude/context/systems/cost-management-policy.md` | Cost governance — budget philosophy (monitoring ceilings not optimization targets), cap tiers, headroom audit cadence, anomaly detection thresholds |
| `.claude/context/patterns/long-running-agent-harness-patterns.md` | Anthropic harness pattern gap analysis — 8 patterns mapped against NEXUS with validated metrics and recommendations |
| `.claude/context/patterns/follow-up-creation-standard.md` | Follow-up task template, persona permissions matrix, delegation patterns |
| `.claude/context/patterns/workflow-template-guide.md` | Persona assignment, quality propagation, failure policies (212 lines) |
| `knowledge/projects/*.md` | Project context + Evaluator Brief — file paths, models, decisions, open questions. Used by task-evaluator (Step 2a) and maintained by AI David (Step 6a) + context-maintainer persona. Relocated from `.claude/context/projects/` for headless Edit access (AIProjects-6gsj) |
| `.claude/CLAUDE.md` | Project conventions, workflow patterns, Nexus overview |

---

## Dangerous Update Cascades

When you change one of these files, you MUST update all dependents:

| If You Change | Must Also Update | Why |
|--------------|-----------------|-----|
| `label-taxonomy.yaml` | `label-ops.sh` (_LABEL_MUTEX_GROUPS + _LABEL_DEPRECATED arrays), `pulse-reference.md`, dashboard `labels.ts` (PREFIX_FUNCTION, PREFIX_META), dashboard `board.ts` (isDeferred, BLOCKER_LABELS) | Label definitions must sync across all consumers |
| `routing-rules.yaml` | `routing-helpers.sh`, relevant persona prompts, `registry.yaml` pre_checks | Routing logic must be identical in YAML and bash |
| `registry.yaml` | Documentation files, persona configs (if override fields change), workflow files (if job renamed) | Job config drives scheduling and execution |
| `workflows/<job>.md` | `registry.yaml` (workflow: field must match filename), executor.sh (reads file at runtime) | Workflow content is the actual job instructions — stale/empty workflow = broken job |
| `nexus-settings.json` `job_overrides` | `dispatcher.sh` (is_job_due checks overrides), dashboard recurring-jobs API (reads/writes overrides) | Override changes take effect on next dispatcher cycle (~5 min) |
| `label-ops.sh` | Test: all scripts that source it (event-watcher, executor, watchdog, obsidian-watch-monitor, directive-runner, nexus-label). Also: `trigger-ops.sh` (sourced by label-ops), `pipeline-runner.sh` (consumes triggers) | Single chokepoint — breakage cascades everywhere. Trigger emission failure is graceful (|| true) but would disable fast-path dispatch |
| `pulse-api.sh` | All scripts that source it: event-watcher, executor, label-ops, obsidian-watch-monitor, pipeline-watchdog, routing-helpers, trigger-ops | Bash→Pulse communication layer — breakage silently disables task mutations, label writes, and trigger emission |
| `common.sh` | All 10 scripts that source it: dashboard, directive-runner, dispatcher, event-watcher, executor, msg-relay, obsidian-watch-monitor, persona-health-check, pipeline-runner, pipeline-watchdog | Base utility library — breakage cascades to every Nexus script (logging, path resolution, error handling). Now sources `audit-log.sh` |
| `audit-log.sh` | All scripts via `common.sh`. Promtail config (`promtail-v3.yml` job: nexus-audit). Grafana dashboard (`nexus-operations.json`) | Unified audit trail — breakage is graceful (`|| true` on all log_audit calls), no script will fail if audit-log.sh is missing |
| `paths-registry.yaml` | External tool references, documentation | Single source for all external paths |
| `.claude/settings.json` | Hook scripts, MCP server lists | Permission and lifecycle configuration |
| `nexus-settings.json` | `routing-helpers.sh`, `event-watcher.sh`, `dispatcher.sh`, `pipeline-runner.sh`, dashboard API | Risk gates drive executor eligibility; timing overrides drive scheduling; turbo mode accelerates all executors; pipeline_runner.enabled toggles fast-path dispatch |
| `risk-policy.yaml` | `nexus-settings.sh` (fallback defaults in `ns_get_risk_gate`), `routing-rules.yaml` (references defaults), documentation | Policy defaults — when nexus-settings.json is missing or doesn't override a bucket, nexus-settings.sh reads this file |
| `agent-output/` directory structure | This registry, dashboard findings API (`/api/findings`) | Output paths are consumed by dashboard aggregation |
| `methodology.yaml` (schema) | All 22 persona `methodology.yaml` files + `_template/methodology.yaml` + executor logic that reads methodology | Voice tiers and quality scaling must be consistent across all personas |
| `team-runner.py` | `tests/test_team_runner.py`, `registry.yaml` team configs, persona prompts (VERDICT/CONFIDENCE/REASONING format) | Consensus rules and verdict parsing must match team member output format |
| `assigned:` routing (new persona) | `label-taxonomy.yaml` (assigned: values), `routing-helpers.sh` (get_executor_for_assigned), `routing-rules.yaml` (comment block), `completed-by:` values in taxonomy | 4-file cascade — all must list the new persona for routing to work |
| `assertions.sh` | `executor.sh` (sources at runtime, calls `run_post_assertions`), `nexus-plumbing-map.md` (executor detail) | Post-execution assertions — changes to assertion logic or function signatures cascade to executor integration and plumbing docs |

### Known Gap

~~There is **no automated check** that validates `routing-rules.yaml` and `routing-helpers.sh` stay in sync.~~ **CLOSED**: Pulse reads `routing-rules.yaml` directly in Python, eliminating the bash mirror requirement. The bash `routing-helpers.sh` remains for legacy scripts but is no longer the primary consumer.

Job outputs in `.claude/agent-output/` are not fully surfaced in Pulse or the dashboard. Jobs like task-evaluator, task-research, health-summary, and Aurora produce rich analysis that stays in JSON files with no front door. The Nexus Findings Dashboard page (`/findings`) aggregates these into a single visibility surface.

---

## Validation & Integrity Checks

| Check | Authority File | Runner | Frequency |
|-------|---------------|--------|-----------|
| Label gate-stage validation | `label-taxonomy.yaml` gate_stage_rules | `pipeline-watchdog.sh` | Every ~5 min |
| Mutual exclusion enforcement | `label-taxonomy.yaml` + `label-ops.sh` | `label-ops.sh` (on every write) | Runtime |
| Cross-group conflict enforcement | `label-taxonomy.yaml` cross_group_exclusions | `label-ops.sh` (write-time guard) + `pipeline-watchdog.sh` (Check 3.5) | Runtime + every ~5 min |
| Deprecated label detection | `label-taxonomy.yaml` + `label-ops.sh` | `label-ops.sh` + `pipeline-watchdog.sh` | Runtime + every ~5 min |
| Routing rule consistency | `routing-rules.yaml` vs `routing-helpers.sh` | Manual code review | On change |
| Stage transition validity | `label-taxonomy.yaml` state_transitions | `pipeline-watchdog.sh` | Every ~5 min |
| Job pre_check conditions | `registry.yaml` pre_checks | `dispatcher.sh` | Every 5 min |
| Dispatcher liveness | `state/dispatcher-heartbeat` mtime | `pipeline-watchdog.sh` | Every 15 min |
| Pipeline runner liveness | `state/pipeline-runner-heartbeat` mtime + PID check | `pipeline-watchdog.sh` (Check 11) | Every ~5 min (only if systemd service enabled) |
| Persona health check | Persona dirs have required files, registry references valid | `persona-health-check.sh` | On schedule (registry) |
| Post-execution assertions | Task resolved, claim released, clean workdir | `lib/assertions.sh` (called by `executor.sh`) | Every execution (immediate, post-LLM) |
| Cost headroom audit | Budget utilization, anomalies, cache efficiency, router overrides | `headroom-audit` job (analyst persona) | Weekly (Sunday 6 AM) |
| Assigned routing consistency | `assigned:` values in taxonomy match `routing-helpers.sh` mappings and `routing-rules.yaml` comment block | Manual code review | On change (new persona) |
| Cross-reference integrity | Manifest consumer paths + `@` imports + SoT file paths | `Scripts/validate-cross-refs.js` (future) | Daily |
| type:parent stuck-queue suppression | `type:parent` label + `auto:ready` strip | `pipeline-watchdog.sh` (Check 5) | Every ~5 min |
| Orphaned-subtask gate filter | Active gates (stage:review, waiting:*, review:*) suppress false positives | `pipeline-watchdog.sh` (Check 7) | Every ~5 min |
| completed-by signal handler | `completed-by:*` on non-closed tasks → auto-close | `pipeline-watchdog.sh` (Check 15) | Every ~5 min |
| Registry manifest freshness | `manifest.yaml` `last_verified` dates | `pipeline-watchdog.sh` (future) | Weekly |

---

## Dashboard API (Job Management)

The Pulse Dashboard (port 8600) provides a web UI and API for managing recurring jobs. Added in session 465.

| File | Authoritative For |
|------|-------------------|
| `~/Code/nexus-dashboard/server/services/recurring-jobs.ts` | **Recurring jobs service** — aggregates Nexus registry + cron + systemd jobs, computes SLA health metrics, manages workflow CRUD, triggers manual runs |
| `~/Code/nexus-dashboard/server/routes/recurring-jobs.ts` | **Recurring jobs API** — 12 REST endpoints at `/api/recurring-jobs/*` for job CRUD, toggles, workflow editing, manual triggers, health summary |
| `~/Code/nexus-dashboard/server/services/registry.ts` | **Registry parser** — `parseRegistry()`, `writeJobToRegistry()`, `removeJobFromRegistry()`, `readWorkflow()`, `writeWorkflow()`, `listPersonaDirs()`. Uses atomic writes for registry modifications |
| `~/Code/nexus-dashboard/frontend/src/pages/RecurringJobsPage.tsx` | **Job management UI** — table with SLA health, source filters, detail drawer (schedule editor, workflow editor, execution history), create dialog |
| `~/Code/nexus-dashboard/frontend/src/api/recurring-jobs.ts` | **Frontend API hooks** — React Query hooks for all recurring-jobs endpoints |

---

## Testing

Test files for Nexus components. Not exhaustive — most validation is via pipeline-watchdog runtime checks.

| File | Tests | Covers |
|------|-------|--------|
| `.claude/jobs/tests/test_team_runner.py` | Verdict parsing, ConsensusEngine rules, MemberResult serialization | `team-runner.py` consensus logic |
| `.claude/jobs/tests/nexus-settings-test.sh` | Settings reader validation | `nexus-settings.sh` |
| `.claude/jobs/tests/phase3-integration-test.sh` | Delegation flow integration | Persona routing, assigned: labels |
| `.claude/jobs/tests/pipeline-smoke-test.sh` | Pipeline end-to-end smoke test | Full dispatch path |
