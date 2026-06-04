# Project Aion — Unified AI Assistant Platform

**Jarvis** (Master Archon) + **Alfred** (Operations Archon) in a single monorepo.

A highly autonomous, self-improving AI infrastructure and software-development platform. Two Archons working in symbiosis: Jarvis handles deep collaborative work (persistent sessions, context management, memory hierarchy) while Alfred handles headless operations (cron-driven pipelines, task orchestration, personas, dashboards).

---

## Quick Start

```bash
bash .claude/scripts/launch-aion.sh
```

---

## Architecture

```
Project_Aion/
  .claude/              # Jarvis Archon — capabilities, context, hooks, skills, agents
    context/            # Knowledge layer: patterns, state, psyche, components
    plans/              # Implementation plans (adjective-animal-name convention)
  alfred/               # Alfred Archon — operations, Nexus, Pulse, dashboard
    .claude/            # Alfred-specific hooks, commands, personas, skills
    pulse/              # Pulse task API (FastAPI + PostgreSQL)
    dashboard/          # Nexus dashboard (React frontend)
    usage-proxy/        # Anthropic API telemetry proxy
    pipeline/           # Pipeline watcher for autonomous job execution
  infrastructure/       # Shared Docker stack (PostgreSQL, Qdrant, Neo4j, Redis, n8n)
  projects/             # Dev artifacts (chronicler/, project-aion/)
  scripts/              # System-level utilities
```

See `CLAUDE.md` for full operational instructions, guardrails, and force-loaded docs.

---

## Git Workflow

- **Repo**: `CannonCoPilot/Project_Aion`
- **Branch**: `main`
- **Push**: `git push origin main`

---

## Requirements

- **Claude Code** (primary interface)
- **tmux** at `$HOME/bin/tmux`
- **Docker** (PostgreSQL, Qdrant, Neo4j, Redis, n8n, Pulse, Dashboard)
- **macOS ARM64** (Apple Silicon)

---

## License

MIT License — see LICENSE file.

*Project Aion — Jarvis + Alfred, unified.*
