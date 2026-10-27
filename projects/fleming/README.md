# Fleming: Archon home

**Purpose**: Fleming's home inside Project Aion: plans, reports, research notes and the audit trail.
**Layer**: Soma (Archon home), per `.claude/context/patterns/archon-architecture-pattern.md`.

Fleming is W6, a Contract Archon (micro1; Snorkel AI on the User's directive, split with Jacques).

| What | Where |
|---|---|
| Persona (loaded via `--add-dir`) | `.claude/personas/fleming/CLAUDE.md` |
| Identity (psyche) | `.claude/context/psyche/fleming-identity.md` |
| Working folder (cwd) | `/Users/nathanielcannon/Claude/Projects/micro1` (micro1 law: its `CLAUDE.md`) |
| Snorkel work | `/Users/nathanielcannon/Claude/Projects/SnorkelTasks` (shared tree with Jacques) |
| arXiv / papers downloads | `arxiv/`, `papers/`: symlinks into `Staging/verified/fleming/scholarly/` (gitignored; Bulk Download Policy). The launcher's ARXIV_STORAGE_PATH / SCHOLAR_DOWNLOAD_PATH point here. |
| Scratchpad (L1) | `.claude/context/.scratchpad.fleming.md` |
| Memory (L2) | `~/.claude/projects/-Users-nathanielcannon-Claude-Projects-micro1/memory/` |
| JICM checkpoint (L3) | `.claude/context/jicm/checkpoints/fleming.compressed.md` |
| Inbox | `.claude/context/inbox/fleming.md` (`aion-inbox.sh`) |

## What belongs here
- `plans/`, `reports/`: plans and audits about Fleming as an Archon (client deliverables never live here).
- `research/`: method research that is Fleming's own, not a client's.

## What does not belong here
- Client material or deliverables: they live in the client repos (micro1, SnorkelTasks).
- Downloaded files of any size: they live in Staging.
