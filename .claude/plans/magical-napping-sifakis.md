# Project Aion Monorepo Migration Plan

## Context

Jarvis (Master Archon) and Alfred-Dev (Operations Archon) are currently separate repos at sibling paths under `~/Claude/`. This migration merges them into a single monorepo — `Project_Aion` — with Alfred nested as `alfred/`. The goals: eliminate all ties to David O'Neil's repos, remove personal references, create a fresh `CannonCoPilot/Project_Aion` GitHub repo, and build a unified Archon launcher that stands up and self-heals all services.

**Decisions**: Monorepo (flat copy, not submodule). Fresh GitHub repo. Archive all legacy dirs. DwarfCron stays separate; Project Aion gets a project-registration system for future enrollments.

---

## Phase 0: Pre-flight Snapshot (30 min)

1. Verify both repos clean and pushed (`git status`, `git push`)
2. Tag both: `pre-aion-migration-2026-06-04` and push tags
3. Record running services: `docker ps`, `launchctl list | grep com.aion`, port map

---

## Phase 1: Housekeeping (3-4 hours)

### 1A: Remove Personal References (~2 hrs)

**Strategy**: Batch by file type. Use subagents for bulk sed/grep work across the ~50 critical files.

| Category | Count | Action |
|---|---|---|
| "David" / "davidmoneil" | 150+ | Replace with "User"/"Sir" or remove section |
| "Nathaniel" / "nathanielcannon" (as names) | 40+ | Replace with "User" — keep filesystem paths as-is (they're machine-correct) |
| "nate-dev" branch refs | 15+ | Replace with "main" |
| `davidmoneil` GitHub URLs | 30+ | Remove or replace with `CannonCoPilot/Project_Aion` |
| Dead path refs (`AIFred-Pro-Dev`, `Jarvis-Dev`, `Shared_Projects`) | 20+ | Remove or update |

**Critical files** (must be hand-edited, not bulk-replaced):
- `CLAUDE.md` — remove "Operations Archon: AIFred-Pro" section, "Shared Workspace" section, rewrite workspace layout + git workflow table
- `.claude/context/psyche/jarvis-identity.md` — remove David collaborator, ProjectIntel naming convention
- `MEMORY.md` — remove AIFred-Pro section, Shared_Projects section
- `alfred/.claude/CLAUDE.md` — remove davidmoneil git refs

**Bulk-replaceable files** (pattern: `davidmoneil/AIFred-Pro` -> remove):
- `alfred/.claude/registries/egress-policy.yaml`
- `alfred/.claude/config/profile-config.json`, `active-profile.yaml`
- `alfred/scripts/aifred-update.sh`
- `alfred/README.md`, `alfred/README.dev.md`
- Design docs, reports, archive files (dozens — grep-driven)

### 1B: Remove Personal Pulsars (~15 min)

Delete from `alfred/.claude/jobs/pulsars.yaml`:
- `puppypals-monday-post`, `puppypals-friday-post`, `puppypals-link-validator`
- `email-ats-weekly`, `email-pakistan-weekly`

Delete persona: `alfred/.claude/jobs/personas/content-writer/`

### 1C: Credential Audit (~15 min)

Verify `Jarvis/.claude/secrets/credentials.yaml` contains all secrets from:
- `Alfred-Dev/.env` (PULSE_DB_PASSWORD, TELEGRAM_BOT_TOKEN, VAPID keys)
- `Alfred-Dev/.claude/jobs/.env` (TELEGRAM_BOT_TOKEN, PULSE_URL)
- `Jarvis/infrastructure/.env` (PG_PASSWORD, NEO4J_PASSWORD)

Store any missing credentials in the canonical file. No file moves needed.

### 1D: Clean Stale Memory (~15 min)

- Search Qdrant (`jarvis-rag`) for "davidmoneil", "AIFred-Pro", "Shared_Projects" — remove stale entries
- Search Graphiti (`jarvis-graphiti`) for same — prune stale nodes
- Clear relevant insights-log entries

### 1E: Remove Upstream Git Remotes (~5 min)

```
git -C ~/Claude/Jarvis remote remove upstream
git -C ~/Claude/Alfred-Dev remote remove upstream
git -C ~/Claude/Alfred-Dev remote remove prod-local
```

### 1F: Unload David-Specific Launchd Agents (~5 min)

Unload and archive `com.aion.david-nexus-sync-fetch` and `com.aion.david-nexus-sync-health-check`.

**Disable skills**: Move `projectintel-ops`, `sync-aifred-baseline`, `sync-aifred-pro-dev` to `_disabled/`.

---

## Phase 2: Filesystem Migration (2-3 hours)

### 2A: Stop All Services (~15 min)

Stop Docker stacks (both), launchd agents, tmux session, MLX/LiteLLM.

### 2B: Rename Jarvis -> Project_Aion (~5 min)

```
mv ~/Claude/Jarvis ~/Claude/Project_Aion
```

Preserves full git history in-place (594 commits, 3.1 GB).

### 2C: Import Alfred-Dev into Monorepo (~30 min)

```
cp -R ~/Claude/Alfred-Dev ~/Claude/Project_Aion/alfred
rm -rf ~/Claude/Project_Aion/alfred/.git
cd ~/Claude/Project_Aion
git add alfred/
git commit -m "merge: import Alfred-Dev as alfred/ subdirectory"
```

Simple flat copy — Alfred's 242 commits are preserved in the archived repo and in the `pre-aion-migration` tag on `CannonCoPilot/Alfred`.

### 2D: Merge .gitignore (~10 min)

Add Alfred-specific ignore patterns under `alfred/` prefix to the root `.gitignore`.

### 2E: Update Cross-References (~1.5 hrs)

**Docker compose** (critical — services won't start without these):
- `alfred/docker-compose.dev.yml`: update `JARVIS_PATH` fallback to `Project_Aion`, `AIFRED_PATH` fallback to `Project_Aion/alfred`
- `alfred/.env`: update `AIFRED_PATH`

**Claude Code settings** (`.claude/settings.json`):
- Rewrite `additionalDirectories`: remove dead paths, add `Project_Aion/alfred`
- Rewrite permissions: remove `AIFred-Pro-Dev`, `Jarvis-Dev`, `Shared_Projects` entries
- Update all absolute paths from `Jarvis` to `Project_Aion`

**Hooks** (`.claude/hooks/*.js`):
- `bash-safety-guard.js`: remove AIFred-Pro production guard, update path patterns
- `permission-gate.js`: remove AIFred-Pro regex
- Update any hardcoded `/Claude/Jarvis/` to `/Claude/Project_Aion/`

**MCP config** (`.mcp.json`): update all infrastructure paths

**paths-registry.yaml**: major rewrite — remove dead entries, add `alfred` section

### 2F: Archive Legacy Directories (~10 min)

```
mkdir -p ~/Claude/Archive/pre-aion-2026-06-04
mv ~/Claude/AIFred-Pro ~/Claude/Archive/pre-aion-2026-06-04/
mv ~/Claude/Jarvis-Dev ~/Claude/Archive/pre-aion-2026-06-04/
mv ~/Claude/Shared_Projects ~/Claude/Archive/pre-aion-2026-06-04/
mv ~/Claude/Alfred-Dev ~/Claude/Archive/pre-aion-2026-06-04/
```

---

## Phase 3: Git & GitHub (1 hour)

1. Create `CannonCoPilot/Project_Aion` on GitHub (`gh repo create`)
2. Rename local branch: `Project_Aion` -> `main`
3. Rename origin: old origin -> `jarvis-legacy`, new origin -> `CannonCoPilot/Project_Aion`
4. Push main + tags to new repo
5. Archive old repos: `gh repo archive CannonCoPilot/Jarvis`, `gh repo archive CannonCoPilot/Alfred`

**Session 1 breakpoint here** — repo is on GitHub, rollback is easy.

---

## Phase 4: Unified Archon Launcher (2-3 hours)

Copy `launch-jarvis-tmux.sh` to `launch-aion.sh` and rewrite:

| Change | Scope |
|---|---|
| Session name `jarvis` -> `aion` | Global |
| `PROJECT_DIR` -> `$HOME/Claude/Project_Aion` | Global |
| Add `ALFRED_DIR="$PROJECT_DIR/alfred"` | New variable |
| All `$HOME/Claude/Alfred-Dev` -> `$ALFRED_DIR` | ~20 occurrences |
| Window names: "Jarvis-dev" -> "Aion-dev" | W5 |
| Environment: `x-aion-agent-name: jarvis-w0` -> `aion-w0` | Headers |
| Add Alfred-specific health checks for nested path | Preflight |
| Self-repair: detect and restart failed services during runtime | New feature |

The launcher is 918 lines with clean structure — the rewrite is mechanical (path substitution) plus the new self-repair loop.

---

## Phase 5: Documentation & Memory (1.5-2 hours)

### 5A: Master README.md

New top-level README with:
- Project name, tagline, architecture overview
- Mermaid diagram showing Jarvis/Alfred nesting
- Quick start (`bash .claude/scripts/launch-aion.sh`)
- Service inventory (Docker, tmux windows, ports)
- Project registration system overview

### 5B: Rewrite CLAUDE.md

- Remove David/AIFred-Pro/Shared_Projects sections
- New workspace layout (Project_Aion at top, alfred/ nested)
- Simplified single-repo git workflow
- Updated filesystem policy (alfred/ is full-write)
- Alfred Archon description (replaces Operations Archon section)

### 5C: Update Alfred's CLAUDE.md

- Note nested operation within monorepo
- Update paths from standalone to `alfred/` relative
- Remove nate-dev, davidmoneil references

### 5D: Fresh Memory State

- `MEMORY.md`: remove dead sections, add Alfred-as-subdirectory fact
- `session-state.md`: fresh write reflecting post-migration state
- `.scratchpad.md`: clear, note migration complete

### 5E: Project Registration System

Design doc at `.claude/context/designs/project-registration.md`:
- Registration via `paths-registry.yaml` under `projects:` key
- Each project gets: path, branch, remote, status, optional memory partition (Qdrant collection), optional patterns dir, optional guardrails
- DwarfCron as first registrant example (code external, artifacts in `projects/chronicler/`)

### 5F: Codify Repo Maintenance Rules

Save to memory system:
- Monorepo hygiene: alfred/ is a subdirectory, not a submodule — commit atomically
- No upstream remotes (clean break from davidmoneil)
- Single branch (`main`), single remote (`CannonCoPilot/Project_Aion`)
- Credentials only in `.claude/secrets/credentials.yaml` (gitignored)

---

## Phase 6: Verification (1-1.5 hours)

1. **Docker**: Start both compose stacks, verify all 11+ containers healthy
2. **MCP**: Verify jarvis-rag, jarvis-graphiti, jarvis-pulse respond
3. **Pulse API**: `curl localhost:8800/api/v1/health`
4. **Claude Code**: Launch via `launch-aion.sh`, verify hooks fire, CLAUDE.md loads
5. **Cross-access**: Jarvis can read/write `alfred/` files
6. **Reference sweep**: `grep -rn "davidmoneil\|David O.Neil\|nate-dev\|AIFred-Pro-Dev\|Jarvis-Dev\|Shared_Projects"` — zero results
7. **Git**: Push final commit, verify on GitHub

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Docker volumes lost on compose path change | Named volumes survive — verify with `docker volume ls` |
| `.claude/` permission blocks on `alfred/.claude/` | Use `protected-edit.py` Layer 1 bypass (existing pattern) |
| Hooks reference old paths at runtime | Most use `$CLAUDE_PROJECT_DIR` (auto-updates). Only hardcoded absolutes need manual fix |
| launchd agents reference old paths | Update plist files in Phase 2E or disable entirely |
| Pulse container can't find bind-mounts | Only host paths change — container-internal paths unchanged |

## Effort Estimate

| Phase | Hours |
|---|---|
| 0: Snapshot | 0.5 |
| 1: Housekeeping | 3-4 |
| 2: Filesystem | 2-3 |
| 3: Git & GitHub | 1 |
| 4: Launcher | 2-3 |
| 5: Documentation | 1.5-2 |
| 6: Verification | 1-1.5 |
| **Total** | **11-15** |

Session 1: Phases 0-3 (~7 hrs). Session 2: Phases 4-6 (~6 hrs).
