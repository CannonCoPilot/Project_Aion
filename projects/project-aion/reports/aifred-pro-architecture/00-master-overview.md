# AIFred-Pro Architecture Analysis — Master Overview

**Date**: 2026-04-23
**Repository**: `/Users/nathanielcannon/Claude/AIFred-Pro/` (production, read-only for Jarvis)
**Development**: `/Users/nathanielcannon/Claude/Alfred-Dev/` (nate-dev branch)
**Version**: AIFred-Pro v3.2.0
**Total Source Files**: ~1,245 (excluding node_modules, .git, __pycache__)

---

## Purpose

This analysis documents the complete architecture of AIFred-Pro — the Operations Archon in the dual-Archon model. Jarvis (Master Archon) has one-way awareness of AIFred-Pro: Jarvis reads and adapts to AIFred-Pro's systems; AIFred-Pro is not customized for Jarvis.

The analysis was conducted to:
1. Understand AIFred-Pro's full codebase before contributing to `nate-dev`
2. Identify actionable issues and integration points
3. Plan the first feature work (dashboard `config.ts` fix)

---

## Report Index

| Report | File | Scope | Files Reviewed |
|--------|------|-------|----------------|
| **01** | [01-core-identity.md](01-core-identity.md) | Root files, CLAUDE.md, settings.json, config files | 21 |
| **02** | [02-context-and-knowledge.md](02-context-and-knowledge.md) | .claude/context/ (11 files), knowledge/ (5 files) | 16 |
| **03** | [03-pulse-and-dashboard.md](03-pulse-and-dashboard.md) | pulse/ (5 files), dashboard/ (~35 files) | ~40 |
| **04** | [04-nexus-hooks-commands.md](04-nexus-hooks-commands.md) | .claude/jobs/ (34), .claude/hooks/ (4), .claude/commands/ (7) | 45 |
| **05** | [05-supporting-infrastructure.md](05-supporting-infrastructure.md) | scripts/, setup-phases/, profiles/, docs/, tests/, monitoring/, infrastructure/, .claude/{skills,agents,registries,config,plans,orchestration,archive,data,logs}, .opencode/, .github/, commands/ | ~108 |

**Total coverage**: ~230 files across 5 reports covering all significant directories.

---

## System Architecture Summary

```
AIFred-Pro v3.2.0
├── Pulse API (:8700)          — FastAPI task management (canonical for ALL projects)
├── Dashboard (:3000/:5173)    — Express BFF + React frontend
├── Nexus                      — Cron-based job dispatcher (24 personas, SQLite state)
├── Telegram (@Keryx_Archon)   — Notification/command bot
└── Supporting Infrastructure  — Scripts, CI, monitoring, reverse proxy
```

### Core Data Flow

```
Tasks created via:
  Pulse MCP (mcp__jarvis-pulse) ─┐
  commands/pulse CLI ────────────┤
  Dashboard UI ──────────────────┤──> Pulse API (:8700) ──> SQLite DB
  Nexus persona output ─────────┘

Nexus automation:
  Cron (5min) ──> dispatcher.sh ──> executor.sh (per job)
                                      └──> claude --print (headless)
                                      └──> callback ──> Pulse/Telegram
```

---

## Critical Findings

### Blockers (must fix before dashboard works)

| ID | Finding | Report | Impact |
|----|---------|--------|--------|
| **B-1** | `dashboard/server/config.ts` MISSING | 03 | Dashboard server fails MODULE_NOT_FOUND on startup |

### High Priority (should fix for reliability)

| ID | Finding | Report | Impact |
|----|---------|--------|--------|
| H-1 | Integration tests require live services | 05 | Cannot run full test suite without stack running |
| H-2 | No launchd equivalents for systemd services | 05 | macOS: services must be started manually |
| H-3 | Nexus executor uses `claude --print` (may not match CC CLI) | 04 | Job execution may fail if CLI interface differs |

### Low Priority (cosmetic or deferred)

| ID | Finding | Report | Impact |
|----|---------|--------|--------|
| L-1 | `.opencode/` alternative config maintained in parallel | 05 | Maintenance burden if not used |
| L-2 | Log format is plain text, not JSONL | 05 | Harder to ingest into Grafana |
| L-3 | No `conftest.py` for shared test fixtures | 05 | Test isolation depends on inline setup |

---

## macOS Compatibility Summary

| Check | Status | Notes |
|-------|--------|-------|
| Shebangs (`#!/usr/bin/env bash`) | PASS | All 47 scripts fixed in Session 49 |
| No `declare -A` (bash 4+) | PASS | Zero occurrences |
| No `grep -P/-oP` (Perl regex) | PASS | Fixed in Session 49 (25 occurrences -> POSIX sed) |
| No `mapfile`/`readarray` | PASS | Zero occurrences |
| Darwin detection in setup | PASS | Phase 1 uses `brew` on macOS |
| systemd conditional bypass | PASS | Scripts skip `systemctl` on Darwin |
| **Dashboard config.ts** | **FAIL** | Missing file — server won't start |

---

## Directory Coverage Matrix

| Directory | Report | Files | Status |
|-----------|--------|-------|--------|
| Root files (README, config, etc.) | 01 | 21 | Covered |
| `.claude/CLAUDE.md` + settings | 01 | 2 | Covered |
| `.claude/context/` | 02 | 11 | Covered |
| `knowledge/` | 02 | 5 | Covered |
| `pulse/` | 03 | 5 | Covered |
| `dashboard/` | 03 | ~35 | Covered |
| `.claude/jobs/` (Nexus) | 04 | 34 | Covered |
| `.claude/hooks/` | 04 | 4 | Covered |
| `.claude/commands/` | 04 | 7 | Covered |
| `.claude/templates/` | 04 | varies | Covered |
| `scripts/` | 05 | 25 | Covered |
| `setup-phases/` | 05 | 5 | Covered |
| `profiles/` | 05 | 4 | Covered |
| `docs/` | 05 | 16 | Covered |
| `tests/` | 05 | 11 | Covered |
| `monitoring/` | 05 | 2 | Covered |
| `infrastructure/` | 05 | 4 | Covered |
| `.claude/skills/` | 05 | 5 | Covered |
| `.claude/agents/` | 05 | 5 | Covered |
| `.claude/registries/` | 05 | 3 | Covered |
| `.claude/config/` | 05 | 2 | Covered |
| `.claude/plans/` | 05 | 3 | Covered |
| `.claude/orchestration/` | 05 | 2 | Covered |
| `.claude/archive/` | 05 | 1 | Covered |
| `.claude/data/` | 05 | 2 | Covered |
| `.claude/logs/` | 05 | 3 | Covered |
| `.opencode/` | 05 | 3 | Covered |
| `.github/` | 05 | 6 | Covered |
| `commands/` (top-level) | 05 | 3 | Covered |

---

## Integration Points (Jarvis -> AIFred-Pro)

| Interface | Method | Endpoint/Path |
|-----------|--------|---------------|
| **Task management** | Pulse MCP (`mcp__jarvis-pulse`) | `http://localhost:8700` |
| **Task management (CLI)** | `commands/pulse` | Shell, hits `:8700` |
| **Cross-archon questions** | File-based | `Shared_Projects/Questions/` |
| **Cross-archon protocol** | Docs | `.claude/orchestration/inter-archon-protocol.md` |
| **Nexus job submission** | `commands/nexus` | Shell, hits jobs.db |
| **CI/CD** | GitHub Actions | Auto on push to `nate-dev` |
| **Service health** | `scripts/health-check.sh` | Polls all services |

---

## Recommended First Actions (for `nate-dev` development)

1. **Fix B-1**: Create `dashboard/server/config.ts` per plan in `.claude/plans/eager-sunrise-falcon.md`
2. **Run unit tests**: `cd Alfred-Dev && pytest tests/unit/ -v` to establish baseline
3. **Start Pulse**: `bash pulse/start-pulse.sh --background` (already running on Jarvis infra)
4. **Review David's liaison response**: `Shared_Projects/Questions/2026-04-21-Archon-for-david-workspace-setup.md`

---

## File Inventory

Full file listing: [.file-inventory.txt](.file-inventory.txt) (1,245 source files)

---

*AIFred-Pro Architecture Analysis — Master Overview*
*2026-04-23*
