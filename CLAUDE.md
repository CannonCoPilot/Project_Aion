# Project Aion — Shared Workspace Configuration

Monorepo for the Aion AI development platform. Two Archon personas operate here:
- **Jarvis** (Master Archon): deep collaborative development, loaded via `--add-dir .claude/personas/jarvis`
- **Alfred** (Operations Archon): headless pipelines and task automation, lives at `alfred/`

Persona-specific instructions, `@`-imports, and identity files are NOT in this file.
They live in `.claude/personas/jarvis/CLAUDE.md` (Jarvis) and `alfred/.claude/CLAUDE.md` (Alfred).

## Workspace layout

```
/Users/nathanielcannon/Claude/
├── Project_Aion/        # MONOREPO (this repo)
│   ├── .claude/         # Jarvis Archon capabilities
│   │   └── personas/jarvis/CLAUDE.md  # Jarvis identity (loaded via --add-dir)
│   ├── alfred/          # Alfred Archon (operations, Nexus, Pulse)
│   │   └── .claude/CLAUDE.md          # Alfred identity (auto-discovered)
│   ├── infrastructure/  # Shared Docker services
│   └── projects/        # Dev artifacts
├── Projects/            # Deliverable code (DwarfCron, AnnasTools, etc.)
├── GitRepos/            # Read-only reference repos
└── Archive/             # Retired items (read-only)
```

## Alfred Archon (Operations — nested at `alfred/`)

| Property | Value |
|---|---|
| Path | `alfred/` (subdirectory of this repo) |
| Pulse API (dev) | `http://localhost:8800` |
| Pulse MCP | `jarvis-pulse` (6 tools) |
| Dashboard | `http://localhost:8701` (Nexus), `http://localhost:8702` (Vite dev) |
| Usage Proxy | `http://localhost:9800` |

**Task labels**: `agent:jarvis` / `agent:aifred` / `agent:shared`.

## Guardrails (shared)

### NEVER
- Store secrets in tracked files (use `.claude/secrets/credentials.yaml`, gitignored)
- Force-push to main/master
- Skip confirmation for destructive ops
- Over-engineer or wait passively
- Write to `/tmp`, `/var`, or system dirs (see Filesystem Policy)
- **Convert a below-threshold result into a terminal "accepted" state so a pipeline can report success (see No Silent Degradation below)**

### No Silent Degradation (MANDATORY — all projects, at all times)
NEVER let any code, design, architecture, component, or aim convert a below-threshold result into a terminal "accepted" state so that a pipeline can report success while degraded. The aim is absolute: **iterate the algorithm until every unit reaches its targeted threshold against the *correct* standard.** No strategic back-off, cap, ceiling, "parked/unreachable" terminal state, or graceful-degradation fallback may quietly accept sub-threshold output.
- Safeguards are permitted **only** as circuit-breakers that keep *trial / preliminary / calibration* runs from failing infinitely.
- When a safeguard fires it must **ALERT** (Sir + Jarvis) that the current **approach** needs redesign — it is never a terminal acceptance. A below-threshold unit stays **OPEN** and **blocks the deliverable**.
- Escalation to human review carries the **implicit expectation of further retooling/adaptation to re-approach bar-passing automation** — not a request to accept a gap. We hold the threshold precisely to expose real limits and then exhaust every avenue to meet them.
- "The method can't reach it" always means **"redesign the method,"** never "lower the aim." Same anti-laundering posture as the extirpated book-level gates.

### Overriding rule
Do NOT short-cut Chronicler app functionality with ad-hoc commands/scripts. No Phase complete unless a stand-alone executable exists, packaged hands-off, user-controlled.

### Filesystem Policy (MANDATORY)
- **Full write**: `Project_Aion/` (including `alfred/`), `Projects/<Name>/`, `GitRepos/`, `~/.claude/`
- **Session-confirm before first write**: `~/Documents/`, `~/Desktop/`, `~/Downloads/`, `~/Pictures/`, `~/Public/`
- **NEVER write**: `/tmp`, `/var`, `/etc`, `/usr`, `/Applications/`, anywhere outside `~/`, `Archive/`
- **Temp files**: project-local `.claude/scratch/` (gitignored), NOT `/tmp`

## Git workflow

| Repo | Local branch | Remote | Push |
|---|---|---|---|
| Project_Aion (this) | `main` | origin → `CannonCoPilot/Project_Aion` | `git push origin main` |

**PAT injection**: `PAT=$(yq -r '.github.aifred_token' .claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')`

Project Aion v5.12.0 -- Persona-Isolated Shared Workspace
