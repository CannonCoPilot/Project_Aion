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

## Service Inventory

| Service | Port | Stack | Purpose |
|---|---|---|---|
| PostgreSQL (Jarvis) | 5432 | infrastructure | Knowledge DB, Chronicler, n8n |
| Qdrant | 6333 | infrastructure | Vector search (RAG) |
| Neo4j | 7687 | infrastructure | Knowledge graph (Graphiti) |
| Redis | 6379 | infrastructure | Cache, queues |
| n8n | 5678 | infrastructure | Workflow automation |
| Pulse API (prod) | 8700 | alfred | Task management API |
| Pulse API (dev) | 8800 | alfred | Dev task management |
| Nexus Dashboard | 8701/8702 | alfred | Operations dashboard |
| Usage Proxy | 9800 | alfred | API telemetry + cost tracking |
| MLX Embed | 8000 | infrastructure | Qwen3 embedding server |
| LiteLLM | 4000 | infrastructure | Multi-model proxy |
| Ollama | 11434 | system | Local LLM inference |

## tmux Windows

| Window | Name | Role |
|---|---|---|
| W0 | Aion | Primary Claude Code session |
| W1 | Watcher | JICM context management |
| W2 | Ennoia | Session orchestration |
| W3 | Virgil | Codebase guide |
| W4 | Commands | Signal file handler |
| W5 | Aion-dev | Dev/test session (--dev mode) |
| W6+ | MLX-Embed, LiteLLM, HUD, Bridge | Auto-started services |

---

## Git Workflow

- **Repo**: `CannonCoPilot/Project_Aion` (private)
- **Branch**: `main`
- **Push**: `git push origin main`
- **Credentials**: `.claude/secrets/credentials.yaml` (gitignored)

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
