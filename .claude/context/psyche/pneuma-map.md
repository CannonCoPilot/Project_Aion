# Pneuma Layer Topology (v1.0.0) — `.claude/`

Pneuma = what Jarvis CAN DO.

Tree (key):
- `CLAUDE.md` identity (autonomic focus)
- `settings.json` hooks/project config (persona now in context/psyche/)
- `planning-tracker.yaml`
- `context/` (Nous)
- dirs: `agents/`, `commands/`, `skills/`, `hooks/`, `scripts/`, `plugins/`, `state/`, `config/`, `secrets/` (gitignored), `metrics/`, `reports/`, `logs/`, `test/`, `review-criteria/`, `legal/`, `archive/`.

agents/ (12 active) structure:
- `<agent>.md`, `_template-agent.md`, `_archive/`, `memory/`, `results/`, `sessions/`.
Active agents list (purpose):
- code-analyzer, code-implementer, code-review, code-tester, compression-agent, context-compressor, deep-research, docker-deployer, jicm-agent, memory-bank-synchronizer, project-manager, service-troubleshooter.

commands/:
- Categories: session (setup/end-session/checkpoint), self-improvement (reflect/evolve/research/maintain), validation (tooling-health/design-review/validate-selection), autonomous (via autonomous-commands skill), orchestration (orchestration/plan/status/resume).
Structure: `commands/<cmd>.md`, `commands/commits/`, `commands/orchestration/`.

skills/:
- Index: `.claude/skills/README.md`, `.claude/skills/_index.md`
- Includes filesystem-ops, git-ops, web-fetch, weather, research-ops, knowledge-ops, context-management, session-management, self-improvement, validation, autonomous-commands, jarvis-status, ralph-loop, docx/xlsx/pdf/pptx, mcp-builder, mcp-validation, skill-creator, plugin-decompose, example-skill.
Structure: `skills/<skill>/SKILL.md`, `scripts/`, `templates/`, `reference/`, plus `_shared/`.

hooks/:
- Categories: security (credential-guard, branch-protection, amend-validator), docker (health monitor, restart loop detector, post-op health), session (session-start-hook, user-prompt-submit), context (precompact-analyzer).
Registered in `settings.json`.

scripts/ (session-level):
- MCP mgmt: mcp-enable.sh/mcp-disable.sh/mcp-status.sh
- signals: signal-helper.sh/jarvis-watcher.sh
- context: context-checkpoint.sh/restore-context.sh
- benchmarking: benchmark-runner.js/scoring-engine.js

state/:
- `state/components/AC-01-launch.json`, `AC-02-wiggum.json`, ...
- `state/queues/evolution-queue.yaml`, `research-agenda.yaml`

config/: autonomy-config.yaml, workspace-allowlist.yaml.
Telemetry dirs: metrics/baselines+benchmarks+scores+aggregates; reports/reflections+maintenance+evolutions+research+reviews; logs/mcp-validation + jarvis-watcher.log.

Neuro connections:
- Pneuma←Nous patterns/references; Pneuma→Soma system scripts/docker/models usage.