# Soma Layer Topology (v1.1.0) — `/Jarvis/`

Soma = how Jarvis INTERACTS (bridge to external world).

Tree:
- `/Jarvis/.claude/` (Pneuma)
- `/Jarvis/docker/` container infra (mcp-gateway service: docker-compose.yaml, Dockerfile, config/)
- `/Jarvis/scripts/` system scripts (setup-readiness.sh, validate-hooks.sh, bump-version.sh, weekly-* health/restart/context-analysis/update-priorities, config.sh.template; + systemd/ timers)
- `/Jarvis/models/` local model files
- `/Jarvis/lancedb/` vector DB files
- `/Jarvis/docs/` user docs (`user-guide.md`, reports/, archive/)
- `/Jarvis/projects/` workspaces:
  - project-aion/ (Jarvis meta-project; roadmap.md, versioning-policy.md, archon-identity.md; analysis/, designs/current+archive, plans/current+archive, progress/current/sessions+milestones + archive, evolution/aifred-integration/* + self-improvement, ideas/current+archive, reports/current+archive, experiments/current+archive, external/)
  - mtg-card-sales/ (external workspace)
- `/Jarvis/paths-registry.yaml` (master registry of infra paths; update after major changes)
- `/Jarvis/CHANGELOG.md` version history
- `/Jarvis/.gitignore`

Design principle (separation):
- Planning/progress → `/Jarvis/projects/`
- Actual code → `/Users/nathanielcannon/Claude/<ProjectName>/`
- Jarvis context → `/.claude/context/`

Neuro connections:
- Soma→Nous: project-aion/designs ↔ context/designs; progress ↔ lessons; evolution ↔ research.
- Soma→Pneuma: docker ↔ docker-* scripts; scripts ↔ `.claude/scripts/`; models used by agents.

Key distinctions table: Soma scripts=system-level; Pneuma scripts=session-level; reports/designs/state differ accordingly.