# AIfred Baseline Sync Report

**Generated**: 2026-02-17 12:45 MST
**Baseline Commit**: c27ba27 (AIfred HEAD after pull)
**Previous Sync**: f531f32 (2026-01-21)
**Changes Since**: 220 files changed (+27,954/-2,712) across 18 commits

---

## Summary

| Classification | Count | Notes |
|----------------|-------|-------|
| ADOPT | 10 | Ready to port (document-guard, check-service, discover-docker, etc.) |
| ADAPT | 13 | Need Jarvis-specific modifications (docker-validator, msgbus, metrics, etc.) |
| REJECT | 16 | Already implemented differently or not applicable |
| DEFER | 12 | Complex systems, infrastructure prerequisites, or future phases |

**Delta scope**: 18 commits spanning AIfred v2.1 through v2.5.0. Major new systems: Headless Claude Jobs, Environment Profiles, Document Guard, Beads Task Management, Fabric AI integration, Stay Current update system.

---

## Commits Analyzed

| # | Hash | Description |
|---|------|-------------|
| 1 | b16c536 | AIfred Sync v2.1 — hooks, patterns, scripts, fresh-context |
| 2 | 6692fc5 | v2.2 — Environment Profile System |
| 3 | 2d2faf5 | Task metrics collection system |
| 4 | edd845f | Apache 2.0 license |
| 5 | 6cb725e | v2.2 public release documentation |
| 6 | 9e85b15 | Sanitize personal data for public release |
| 7 | 5fb0621 | Complete sanitization for public release |
| 8 | 7ed8c8e | Sanitize remaining infrastructure references |
| 9 | 4d4fd70 | Document Guard V1+V2 file protection hook |
| 10 | ae61bf1 | Document Guard V2 synced, session end |
| 11 | 747682b | Document Guard v2.1.0 — override path matching, Ollama parsing |
| 12 | 6c32ca3 | Stay Current update system — component registry with manifest tracking |
| 13 | 85b3667 | v2.4.0 — Beads task management, Headless Claude jobs, full sanitization |
| 14 | 2d4601b | AIfred v1.2.0 — Feature sync from AIProjects |
| 15 | a1eb220 | Status line, script updates, setup phase improvements |
| 16 | a693238 | VERSION bump to 2.5.0 |
| 17 | bbec16e | Cross-platform compatibility for all scripts |
| 18 | c27ba27 | Sync 148 components from AIProjects with full sanitization |

---

## Detailed Analysis

### ADOPT (Ready to Port)

#### 1. document-guard.js + document-guard.config.js
- **Change**: File protection hook — validates edits against protection policies (credential scan, structural checks, semantic relevance). V2.1.1, sophisticated with override mechanism and audit logging.
- **Rationale**: Critical for autonomous archon safety. Prevents destructive edits to CLAUDE.md, AC state files, session-state.md, patterns. Would have prevented the AC-01 state file overwrite bug (EVO-2026-02-005).
- **Priority**: HIGH
- **Action**: Copy both files, create Jarvis-specific config rules for AC state files, session-state.md, CLAUDE.md, patterns.

#### 2. skill-router.js
- **Change**: Detects slash commands, provides parent skill context from SKILL.md frontmatter.
- **Rationale**: Jarvis has 29 skills + capability-map.yaml routing. Skill-router injects parent skill context when commands are invoked, improving command execution coherence.
- **Priority**: MEDIUM
- **Action**: Port with capability-map.yaml integration.

#### 3. /check-service command + check-all-services.sh
- **Change**: Granular Docker service health checking — individual service + batch health checks.
- **Rationale**: Jarvis has `/health-report` for aggregate health but no individual service debugging. Useful for Docker infrastructure management.
- **Priority**: MEDIUM
- **Action**: Copy command + script, wire to Jarvis paths.

#### 4. /discover-docker command + script
- **Change**: Auto-discover Docker container, document in `.claude/context/systems/docker/`, check Watchtower labels.
- **Rationale**: Excellent infrastructure automation. Jarvis has Docker containers with manual documentation. Watchtower label checking particularly valuable.
- **Priority**: MEDIUM
- **Action**: Port command + script, update paths for Jarvis directory structure.

#### 5. /update-priorities command + scripts (update-priorities.sh, update-priorities-health.sh, priority-cleanup.sh)
- **Change**: Hybrid capability-layering approach — bash gathers evidence (git commits, services, files), AI judges priority changes. Auto-archives stale items >30d.
- **Rationale**: Matches Jarvis philosophy (bash + AI judgment). Current priority management is fully manual. Would significantly improve priority hygiene.
- **Priority**: HIGH
- **Action**: Port command + 3 scripts, adapt paths for Jarvis current-priorities.md format.

#### 6. statusline-command.sh
- **Change**: Dynamic statusline showing Model/Cost/Project/Branch/Docker/Memory/Context with cache-based updates.
- **Rationale**: Valuable dev workflow visibility. Shows context budget, Docker count, git branch at a glance.
- **Priority**: MEDIUM
- **Action**: Port script, configure for Jarvis tmux session.

#### 7. scripts/lib/platform.sh
- **Change**: Cross-platform compatibility layer for GNU/macOS/WSL — wraps stat, date, sed, find, timeout, xargs.
- **Rationale**: Even though Jarvis is macOS-only, this future-proofs scripts and resolves known bash 3.2 portability issues.
- **Priority**: LOW
- **Action**: Copy to .claude/scripts/lib/platform.sh.

#### 8. skill-testing-pattern.md
- **Change**: Systematic 6-phase testing checklist for skills with documentation template. Principle: "A skill is not complete until tested end-to-end."
- **Rationale**: Jarvis has 29 skills with variable testing quality. Wiggum Loop has 196 tests, but no formal skill testing standard.
- **Priority**: MEDIUM
- **Action**: Create pattern in .claude/context/patterns/, update skill-creator to reference it.

#### 9. external-tool-evaluation-pattern.md (partial)
- **Change**: 4-step framework with numeric scoring rubric (1-5 per criterion, 15-20 = YES, 10-14 = MAYBE).
- **Rationale**: Jarvis has tooling-evaluation-workflow.md (similar 5-phase). AIfred adds quantitative scoring rubric — merge into existing.
- **Priority**: LOW
- **Action**: Merge scoring rubric into existing tooling-evaluation-workflow.md.

#### 10. VERSION file
- **Change**: Explicit version file at project root.
- **Rationale**: Jarvis already has VERSION file (2.3.0) — confirm alignment with v5.10.0 architecture version.
- **Priority**: LOW
- **Action**: Already exists, verify consistency.

---

### ADAPT (Needs Modification)

#### 1. docker-validator.js
- **Change**: Comprehensive pre-deploy Docker validation (compose syntax, networks, env vars, security patterns). Consolidates 3 deprecated hooks.
- **Modification Needed**: Extract network + security validation logic, merge into Jarvis docker-monitor.js or create new pre-deploy hook.
- **Rationale**: Jarvis docker-monitor.js only monitors running containers, no pre-deploy safety. Dangerous pattern checks (privileged mode, host network, docker socket mounts) are valuable.
- **Priority**: HIGH

#### 2. metrics-collector.js
- **Change**: Collects per-agent task metrics (tokens, tool uses, duration) on SubagentStop → task-metrics.jsonl.
- **Modification Needed**: Merge with telemetry-emitter.js pattern, wire to benchmark-suite.yaml.
- **Rationale**: Jarvis telemetry only tracks AC commands, not general agent usage. Richer analytics for JICM optimization.
- **Priority**: MEDIUM

#### 3. planning-mode-detector.js
- **Change**: Auto-detects planning tasks (new_design, system_review, feature_planning), suggests/auto-invokes planning workflow with tiered scoring.
- **Modification Needed**: Merge patterns into existing orchestration-detector.js. Jarvis uses TodoWrite, not AIfred's planning skill.
- **Rationale**: Complementary to orchestration-detector. Would improve autonomous task decomposition.
- **Priority**: MEDIUM

#### 4. port-conflict-detector.js
- **Change**: Checks if ports are in use before docker run/compose up.
- **Modification Needed**: Integrate as lightweight addition to docker-validator.js port.
- **Rationale**: Prevents "port already in use" failures during autonomous Docker deployment.
- **Priority**: MEDIUM

#### 5. msgbus.sh (from Headless Jobs)
- **Change**: Append-only event store with sequential IDs, threading, status tracking. Far superior to ad-hoc signal files.
- **Modification Needed**: Extract from Headless Jobs, replace Jarvis signal files (.session-command, .watcher-signal, .jicm-state).
- **Rationale**: Event sourcing + queryable history is architecturally superior to polling signal files. Would unify AC component communication.
- **Priority**: HIGH (but complex — see DEFER note)

#### 6. Observability tools (dashboard.sh, cost-report.sh)
- **Change**: Terminal dashboard for job status + daily/weekly cost aggregation.
- **Modification Needed**: Adapt to Jarvis telemetry system (`.claude/state/telemetry/`).
- **Rationale**: Jarvis has telemetry-dashboard.sh but could benefit from cost tracking and richer dashboard.
- **Priority**: MEDIUM

#### 7. /check-health + /check-services (command pattern)
- **Change**: Service registry + detected-issues.yaml pattern for persistent health tracking.
- **Modification Needed**: Merge with existing /health-report, add service registry concept.
- **Rationale**: Jarvis health-report is ad-hoc; persistent issue tracking adds value.
- **Priority**: LOW

#### 8. /metrics command
- **Change**: Query task-metrics.jsonl for agent performance analytics.
- **Modification Needed**: Integrate with Jarvis telemetry system rather than standalone JSONL.
- **Rationale**: Pairs with metrics-collector.js hook. Valuable for JICM + experiment analysis.
- **Priority**: MEDIUM

#### 9. fresh-context-pattern.md
- **Change**: Pattern for executing tasks in isolated Claude instances — no context pollution.
- **Modification Needed**: Document as design pattern. Defer implementation (JICM v7 solved core problem differently).
- **Rationale**: Complementary to JICM compression. Useful for batch tasks where isolation > continuity.
- **Priority**: LOW

#### 10. orchestration/SKILL.md (schema enhancement)
- **Change**: Mature YAML-based phase/task/dependency tracking, done_criteria, fresh-context execution mode.
- **Modification Needed**: Adopt YAML schema improvements into Jarvis orchestration commands.
- **Rationale**: AIfred orchestration skill is more mature than Jarvis's basic commands.
- **Priority**: LOW

#### 11. system-utilities/SKILL.md
- **Change**: Unified CLI-backed utilities skill (link-external, backup-status, sync-git, register-service).
- **Modification Needed**: Could consolidate scattered Jarvis utilities under single skill umbrella.
- **Rationale**: Clean skill abstraction pattern. Jarvis has scattered utilities without unified access.
- **Priority**: LOW

#### 12. Telegram integration (send-telegram.sh)
- **Change**: Two-way Telegram communication with approval buttons, DND scheduling.
- **Modification Needed**: Wire to telemetry-emitter.js for out-of-band alerts only.
- **Rationale**: Useful for notifications when Jarvis is NOT active. NOT for primary interaction (keep tmux W0).
- **Priority**: LOW (infrastructure prerequisite: Telegram bot token)

#### 13. Agent updates (deep-research.md, docker-deployer.md, service-troubleshooter.md)
- **Change**: Significantly expanded agent prompts with more detailed instructions.
- **Modification Needed**: Review Jarvis agents for improvements, selectively merge valuable additions.
- **Rationale**: Jarvis agents diverged significantly. Cherry-pick useful improvements.
- **Priority**: LOW

---

### REJECT (Skip)

#### 1. context-usage-tracker.js
- **Change**: Estimates token usage per tool call.
- **Rationale**: Jarvis has superior JICM v7 + context-health-monitor.js.
- **Jarvis Alternative**: JICM watcher + telemetry system.

#### 2. env-validator.js / network-validator.js / compose-validator.js
- **Change**: Docker pre-deploy validation (deprecated individually).
- **Rationale**: All consolidated into docker-validator.js. Adopt that instead.

#### 3. fabric-suggester.js
- **Change**: Suggests Fabric AI patterns for log analysis.
- **Rationale**: Jarvis doesn't use Fabric AI. Not applicable to autonomous archon workflow.

#### 4. mcp-enforcer.js
- **Change**: Suggests MCP tools over bash equivalents.
- **Rationale**: Jarvis intentionally uses Bash for git operations (git-ops skill). Would conflict with existing workflow.

#### 5. paths-registry-sync.js
- **Change**: Detects external path references, suggests adding to paths-registry.yaml.
- **Rationale**: Jarvis doesn't have paths-registry.yaml. Not applicable.

#### 6. service-registration-detector.js
- **Change**: Detects new Docker services, suggests registering in service-registry.yaml.
- **Rationale**: Jarvis doesn't have service-registry.yaml.

#### 7. _profile-check.js
- **Change**: Shared utility for profile-aware hook behavior.
- **Rationale**: Profile system deferred. Not needed.

#### 8. Headless Jobs scheduling (dispatcher.sh, executor.sh, registry.yaml)
- **Change**: Cron-based autonomous AI agent scheduler.
- **Rationale**: Conflicts with Jarvis tmux-based orchestration. Jarvis is stateful + interactive, not cron + stateless. Would create parallel orchestration layer.
- **Jarvis Alternative**: AC-01 through AC-10 autonomic components, tmux W0-W5.

#### 9. /code, /create-project, /new-code-project, /register-project commands
- **Change**: Project lifecycle management for user-facing PM.
- **Rationale**: Jarvis is infrastructure/dev-focused autonomous agent. Not a user PM tool.
- **Jarvis Alternative**: `/create-project` (simpler, Aion-internal).

#### 10. /stay-current + aifred-update.sh
- **Change**: Component registry with manifest tracking for self-updates.
- **Rationale**: Jarvis has superior `/sync-aifred-baseline` with ADOPT/ADAPT/REJECT/DEFER classification.
- **Jarvis Alternative**: This command.

#### 11. /profile command
- **Change**: Manage environment profile layers.
- **Rationale**: Profile system deferred. Jarvis is single-purpose autonomous agent.

#### 12. Beads task management (.beads/)
- **Change**: CLI-based task management with labels.
- **Rationale**: Jarvis uses TodoWrite + orchestration commands. Different paradigm.
- **Jarvis Alternative**: TodoWrite + orchestration-detector.js.

#### 13. .aifred-ignore.template
- **Change**: Template for ignoring AIfred files.
- **Rationale**: Jarvis doesn't use .aifred-ignore pattern.

#### 14. LICENSE (Apache 2.0)
- **Change**: License file added.
- **Rationale**: Jarvis is a private fork. License not applicable.

#### 15. Sanitization commits (3)
- **Change**: Removed personal data for public release.
- **Rationale**: AIfred-specific sanitization. Jarvis is private.

#### 16. Fabric commands (fabric/*.md) + scripts
- **Change**: Fabric AI integration commands.
- **Rationale**: Jarvis doesn't use Fabric. Not applicable.

---

### DEFER (Review Later)

#### 1. Environment Profile System (profiles/, profile-loader.js)
- **Change**: Composable YAML profiles that generate settings.json. 4 default profiles (general, homelab, development, production).
- **Reason for Deferral**: Significant architectural change. Jarvis uses monolithic settings.json with 23 hooks. Profile system would require hook refactoring to be profile-aware.
- **Review By**: Phase C (Mac Studio) or when dev vs production hook config becomes blocking.

#### 2. Secret management pattern (SOPS + age)
- **Change**: Encrypt secrets at rest, commit encrypted files.
- **Reason for Deferral**: Jarvis secrets are gitignored (sufficient for single machine). No multi-machine needs yet.
- **Review By**: Phase C (Mac Studio Infrastructure).

#### 3. /browser command
- **Change**: Spawns isolated Playwright browser session.
- **Reason for Deferral**: Jarvis doesn't use Playwright MCP for web automation.
- **Review By**: If web scraping becomes needed.

#### 4. /ollama command + ollama-manager.md agent
- **Change**: Manage local Ollama LLM service.
- **Reason for Deferral**: Ollama not installed. Mac Studio could host local LLM.
- **Review By**: Phase C (Mac Studio Infrastructure).

#### 5. /ssh-connect command
- **Change**: SSH to remote system with health check.
- **Reason for Deferral**: No remote systems yet.
- **Review By**: Phase C (Mac Studio remote management).

#### 6. claude-history-archiver.sh
- **Change**: Archive old/large conversation JSONL files with keyword-rich filenames.
- **Reason for Deferral**: Jarvis uses JICM for session continuity. Low priority for archival.
- **Review By**: When disk space or history analysis becomes needed.

#### 7. fabric/SKILL.md
- **Change**: AI-powered text processing via local Ollama.
- **Reason for Deferral**: Requires Ollama deployment.
- **Review By**: Phase C.

#### 8. Telegram infrastructure (telegram-callback-handler.sh, msg-relay.sh)
- **Change**: Full two-way Telegram communication with DND.
- **Reason for Deferral**: Requires Telegram bot token + infrastructure setup.
- **Review By**: When out-of-band alerting becomes priority.

#### 9. index-sync.js hook
- **Change**: Detects new files, reminds to update _index.md.
- **Reason for Deferral**: Low priority. Jarvis uses capability-map.yaml router.
- **Review By**: If index drift becomes a problem.

#### 10. priority-validator.js hook
- **Change**: Tracks work evidence, suggests /update-priorities.
- **Reason for Deferral**: Lower priority than /update-priorities command itself. Evaluate after adopting the command.
- **Review By**: After /update-priorities adoption.

#### 11. msgbus.sh full implementation
- **Change**: Event sourcing message bus.
- **Reason for Deferral**: Architecturally excellent but requires significant refactoring of Jarvis signal files. Design study needed first.
- **Review By**: Phase D or E.

#### 12. Ollama engine integration (executor.sh Ollama logic)
- **Change**: Dual engine support for free local LLM execution.
- **Reason for Deferral**: Requires Ollama installation.
- **Review By**: Phase C.

---

## File Category Summary

| Category | Changed | New | ADOPT | ADAPT | REJECT | DEFER |
|----------|---------|-----|-------|-------|--------|-------|
| **Hooks** | 14 | 18 | 2 | 4 | 8 | 3 |
| **Commands** | 8 | 15 | 3 | 2 | 7 | 3 |
| **Scripts** | 12 | 15 | 4 | 2 | 1 | 2 |
| **Patterns** | 6 | 5 | 2 | 2 | 0 | 1 |
| **Skills** | 4 | 3 | 0 | 2 | 0 | 1 |
| **Agents** | 6 | 5 | 0 | 1 | 0 | 0 |
| **Jobs System** | 0 | 18 | 0 | 2 | 3 | 2 |
| **Profiles** | 0 | 8 | 0 | 0 | 0 | 1 |
| **Config/Docs** | 15 | 10 | 0 | 0 | 3 | 0 |
| **Other** | 5 | 5 | 0 | 0 | 2 | 0 |

---

## Recommended Actions

### Immediate (High Priority)
1. **Port document-guard.js + config** — Critical autonomous safety. Prevents AC state file overwrites.
2. **Port /update-priorities + scripts** — Automates priority hygiene with capability-layering pattern.
3. **Port /check-service + check-all-services.sh** — Granular Docker debugging capability.

### Near-Term (Medium Priority)
4. **Port skill-router.js** — Enhances command execution with parent skill context.
5. **Adapt docker-validator.js** — Pre-deploy safety checks for Docker operations.
6. **Port statusline-command.sh** — Dev workflow visibility.
7. **Port /discover-docker** — Automate container documentation.
8. **Create skill-testing-pattern.md** — Formalize skill testing standards.

### Future (Low Priority / Deferred)
9. **Design study: msgbus.sh** — Evaluate replacing signal files with event sourcing.
10. **Adapt metrics-collector.js** — Enhance telemetry with per-agent metrics.
11. **Evaluate profile system** — When dev vs production config becomes blocking.
12. **Telegram alerts** — When out-of-band notification becomes priority.

---

## Update Port Log?

If proceeding with any ports, update `projects/project-aion/evolution/aifred-integration/port-log.md`.

**Last synced commit**: f531f32 → **New baseline**: c27ba27

---

*Sync report generated during /sync-aifred-baseline — 2026-02-17*
*Analyzed by 4 parallel exploration agents covering hooks, jobs, profiles+patterns, scripts+commands*
