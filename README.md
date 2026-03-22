# Jarvis -- Project Aion Master Archon

**Version 5.11.0** | Derived from [AIfred baseline](https://github.com/davidmoneil/AIfred) commit `2ea4e8b`

Jarvis is the master Archon of **Project Aion** -- a highly autonomous, self-improving AI infrastructure and software-development assistant. Currently focused on **Dwarven Chronicler**, a Dwarf Fortress companion app (Phase 3: Live Integration).

---

## Quick Start

```bash
# Launch Jarvis (creates tmux session with all services)
bash .claude/scripts/launch-jarvis-tmux.sh

# Or with dev window
bash .claude/scripts/launch-jarvis-tmux.sh --dev
```

For returning users, Jarvis automatically loads session state and resumes.

---

## Git Workflow (CRITICAL)

### Jarvis Repository (this repo)
- **Remote**: `https://github.com/davidmoneil/AIfred.git`
- **Branch**: `Project_Aion` (ALL development)
- **NEVER push to `main`** -- main is read-only AIfred baseline at `2ea4e8b`
- Push pattern:
  ```bash
  PAT=$(yq -r '.github.aifred_token' .claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
  git remote set-url origin "https://CannonCoPilot:${PAT}@github.com/davidmoneil/AIfred.git"
  git push origin Project_Aion
  ```

### DwarfCron / Chronicler Repository
- **Remote**: `https://github.com/CannonCoPilot/DwarfCron.git`
- **Branch**: `Dev` (all development)
- **Code location**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
- Push pattern:
  ```bash
  cd /Users/nathanielcannon/Claude/Projects/DwarfCron
  git push origin Dev
  ```

---

## Architecture

```
Jarvis/
  .claude/              # Pneuma (capabilities): agents, hooks, skills, commands, scripts
    context/            # Nous (knowledge): patterns, state, priorities, psyche, components
    plans/              # Implementation plans (adjective-animal-name convention)
  infrastructure/       # Docker, MLX embed, LiteLLM, RAG/Graphiti servers
  projects/             # Dev artifacts (chronicler/, project-aion/)
  scripts/              # System-level utilities, health checks
```

See `CLAUDE.md` for full operational instructions, guardrails, and force-loaded docs.

---

## Active Project: Dwarven Chronicler

A standalone desktop app that transforms Dwarf Fortress game data into browsable, AI-narrated histories.

- **Phase 3** (Live Integration) in progress -- Stages 3.0-3.3 complete, 3.4-3.6 remaining
- **Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
- **Web UI**: `http://localhost:8080/` (run with `--reload`)
- **Live fortress**: Silveryclasps (Girderpriced), Y250+

See `.claude/context/current-plans.md` for full project status.

---

## Requirements

- **Claude Code** (primary interface)
- **tmux** at `$HOME/bin/tmux`
- **Docker** (PostgreSQL, Qdrant, Neo4j, Redis, n8n)
- **.NET 8 SDK** (for LegendsViewer-Next reference app)
- **macOS ARM64** (Apple Silicon)

---

## License

MIT License -- see LICENSE file.

**Acknowledgments**: [AIfred](https://github.com/davidmoneil/AIfred) by David O'Neil, Anthropic for Claude Code.

*Jarvis v5.11.0 -- Project Aion Master Archon*
