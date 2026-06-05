# Filesystem Policy Pattern

**Category**: Safety / Organization
**Strictness**: **ALWAYS** (mandatory)
**Created**: 2026-03-22
**Source**: User correction — project files dumped to /tmp

---

## Problem

Without explicit filesystem boundaries, Jarvis defaults to writing temp files, diagrams, logs, and scratch data to `/tmp/` or other system directories. This creates:
1. File sprawl across system directories
2. Files lost on reboot (macOS cleans `/tmp/`)
3. No audit trail of what was created where
4. Violation of user's workspace organization

## Rule

**All file writes MUST go to authorized locations within `/Users/nathanielcannon/Claude/`.**

### Write Zones (No Confirmation)

| Zone | Path | Use For |
|------|------|---------|
| Project_Aion workspace | `~/Claude/Project_Aion/` | Jarvis config, context, plans, project artifacts |
| Project code | `~/Claude/Projects/<Name>/` | Deliverable source code, tests, data |
| Reference repos | `~/Claude/GitRepos/` | Cloned references (prefer read-only) |
| Claude hidden | `~/.claude/` | Hooks, scripts, state, logs (judicious) |

### Write Zones (Session Confirmation Required)

| Zone | Path | Use For |
|------|------|---------|
| Documents | `~/Documents/` | User-facing documents, exports |
| Desktop | `~/Desktop/` | Quick-access files for user |
| Downloads | `~/Downloads/` | Downloaded content |
| Pictures | `~/Pictures/` | Generated images, screenshots |
| Public | `~/Public/` | Shared files |

### No-Write Zones (Read Only)

- `/tmp/`, `/var/`, `/etc/`, `/usr/`, `/Applications/`
- Any path outside `/Users/nathanielcannon/`
- AIfred baseline repo (`main` branch)

### Temp File Alternatives

Instead of `/tmp/`, use project-local scratch directories:

| Need | Use Instead |
|------|-------------|
| Jarvis scratch files | `Jarvis/.claude/scratch/` (gitignored) |
| Project temp data | `Projects/<Name>/*/data/tmp/` (gitignored) |
| Diagram/report artifacts | `Jarvis/projects/<project>/reports/` |
| Mermaid sources | Same directory as the rendered output |
| Service logs | `Projects/<Name>/*/data/logs/` or `.claude/logs/` |
| PID files | `.claude/state/` or project `data/` dir |

## Implementation

1. Before any file write, check: is the target path under `~/Claude/`?
2. If not, find the appropriate project-local alternative
3. If writing to `~/Documents/Desktop/Downloads/Pictures/Public`, confirm with user first
4. Create the target directory if it doesn't exist (`mkdir -p`)
5. Never assume `/tmp/` is acceptable — it is not

## Why

- `/tmp/` is cleaned by macOS on reboot — work products are lost
- Files scattered across system dirs are invisible to git, hard to audit
- Project-local storage keeps artifacts discoverable and organized
- User's system directories are their domain — Jarvis doesn't dump there

---

*Filesystem Policy Pattern — Mandatory Safety Guardrail*
