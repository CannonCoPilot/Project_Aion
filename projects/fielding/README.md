# Fielding: Archon home

**Purpose**: Fielding's home inside Project Aion: identity pointers, plans, reports, research notes and the audit trail.
**Layer**: Soma (Archon home), per `.claude/context/patterns/archon-architecture-pattern.md`.

Fielding is W12, the Literary and Theological Archon.

| What | Where |
|---|---|
| Persona (loaded via `--add-dir`) | `.claude/personas/fielding/CLAUDE.md` |
| Identity (psyche) | `.claude/context/psyche/fielding-identity.md` |
| Working repository (code, registers, tests) | `/Users/nathanielcannon/Claude/Projects/Fielding` (see `plans/port-and-audit-2026-10-27.md` for the location ruling) |
| Bulk data | `~/Claude/Staging/verified/fielding` (via the repo's `data` symlink) and `~/Claude/Staging/incoming/fielding` (`data-incoming`) |
| arXiv / papers downloads | `arxiv/`, `papers/`: symlinks into `Staging/verified/fielding/scholarly/` (gitignored; Bulk Download Policy) |
| Scratchpad (L1) | `.claude/context/.scratchpad.fielding.md` |
| Memory (L2) | `~/.claude/projects/-Users-nathanielcannon-Claude-Projects-Fielding/memory/` |
| JICM checkpoint (L3) | `.claude/context/jicm/checkpoints/fielding.compressed.md` |
| Inbox | `.claude/context/inbox/fielding.md` (`aion-inbox.sh`) |

## What belongs here
- `plans/`: plans of record for Fielding's projects and lane (port, handoffs).
- `reports/`: audits and status reports about Fielding as an Archon.
- `research/`: source surveys and acquisition lists for Fielding's corpora (e.g. the LDS leaders' words source map).

## What does not belong here
- Code, registers, tests: they live in the working repository.
- Downloaded files of any size: they live in Staging (never an indexed tree).
