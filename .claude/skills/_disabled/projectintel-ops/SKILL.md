---
name: projectintel-ops
version: 1.1.0
description: >
  Shared collaboration layer with David O'Neil via Synology Drive.
  Use when: debrief, question for David, David's status, ProjectIntel, shared workspace,
  collaboration, focus areas, what is David working on, Loom, investigate, cross-reference.
category: collaboration
tags: [projectintel, collaboration, david, shared, debriefs, questions, status, loom]
---

# ProjectIntel Operations Skill

Manage the shared ProjectIntel workspace at `/Users/nathanielcannon/Claude/Shared_Projects/`.
Synology Drive syncs this folder between Archon and David's systems.

**Philosophy**: Code repos track *what* changed. ProjectIntel tracks *why*.

## Quick Reference

| Need | Action | Path |
|------|--------|------|
| See David's focus | Read | `Status/david/focus-areas.md` |
| See David's project counts | Read | `Status/david/projects-summary.md` |
| See Loom tasks | Read | `Status/david/loom-tasks.md` |
| See Loom roadmap | Read | `Status/david/loom-roadmap.md` |
| See Loom project YAML | Read | `Status/david/loom-project.yaml` |
| See recent debriefs | Read | `Debriefs/_latest.md` |
| See debrief index | Read | `Debriefs/_index.md` |
| Read a specific debrief | Read | `Debriefs/<Project>/YYYY-MM-DD-*.md` |
| Check open questions | Glob+Read | `Questions/*` where `to: Archon`, `status: open` |
| Ask David a question | Write | `Questions/YYYY-MM-DD-Archon-for-david-<topic>.md` |
| Write a session debrief | Write | `Debriefs/<Project>/YYYY-MM-DD-<slug>.md` |
| Update Archon's focus areas | Edit | `Status/Archon/focus-areas.md` |
| Update Archon's project summary | Edit | `Status/Archon/projects-summary.md` |

## Session Start Checks (AC-01)

Run these three checks at the start of every session:

1. **Questions**: `Glob("Questions/*.md")` → Read files where `to: Archon` and `status: open` → present to user or draft answers
2. **Latest debriefs**: Read `Debriefs/_latest.md` — scan for recent work from David
3. **David's focus**: Read `Status/david/focus-areas.md` — know what David is working on

## Session End Actions (AC-09)

On non-trivial session end:

1. **Write debrief** to `Debriefs/<Project>/YYYY-MM-DD-<slug>.md` using template
2. **Update status** — edit `Status/Archon/focus-areas.md` if priorities changed
3. **Update summary** — edit `Status/Archon/projects-summary.md` with current project state
4. Always set `author: Archon` in frontmatter

## Investigation Workflows

### Understanding David's Current Work
1. Read `Status/david/focus-areas.md` — high-level priorities and what he's NOT working on
2. Read `Status/david/projects-summary.md` — all projects with open task counts
3. Read `Status/david/loom-tasks.md` — task-level detail on shared Loom project
4. Cross-reference with `Debriefs/_latest.md` — the *why* behind the tasks

### Understanding a Shared Project (e.g., Loom)
1. Read `Status/david/<project>-roadmap.md` — human-readable phases, status, deliverables
2. Read `Status/david/<project>-project.yaml` — machine-readable orchestration (phases, tasks, deps, done criteria)
3. Read `Status/david/<project>-tasks.md` — current task state from Pulse
4. Read recent debriefs in `Debriefs/<Project>/` — design decisions and reasoning

### Reviewing Collaboration History
1. Read `Debriefs/_index.md` — full index with project counts and authors
2. Browse `Questions/` — historical Q&A (status: answered or closed)
3. Check for Synology conflict files (`*_Conflict.md`) — indicates simultaneous edits

## Writing a Debrief

Use the template at `Debriefs/_template.md`. Key rules:

- **Always set `author: Archon`** in frontmatter (shows "unknown" in feed without it)
- Title captures the **theme**, not the task ("Building a Development Journal" not "Updated session-stop.js")
- Five sections: What We're Building Toward → Why This Matters Now → Key Decisions → Where This Leads → Session Activity
- Vision first, activity last — the thinking matters more than the changelog
- Create project subdirectory if it doesn't exist (e.g., `Debriefs/Jarvis/`, `Debriefs/AIFred-Pro/`)

```yaml
# Debrief frontmatter:
type: debrief
version: "1.0"
date: YYYY-MM-DD          # Today's date
author: Archon              # ALWAYS "Archon"
session: <session-slug>   # Matches filename slug
project: <project-name>   # Primary project
commits:                  # Optional
  - <hash>: "<message>"
tasks_closed:             # Optional
  - <task-id>: "<title>"
tags: [<domain>, <project>, <topic>]
```

## Asking David a Question

Use the template at `Questions/_template.md`. David's Nexus liaison persona auto-answers within ~1 hour.

- Filename: `YYYY-MM-DD-Archon-for-david-<topic>.md`
- Liaison access: can read AIProjects knowledge, Pulse tasks (shared projects), CodeGraph, Obsidian vault
- Liaison CANNOT access: secrets, credentials, .env files, security audits, hook internals
- For urgent questions, set `priority: urgent`

```yaml
# Question frontmatter:
type: question
version: "1.0"
date: YYYY-MM-DD
from: Archon
to: David
status: open              # open -> answered -> closed
priority: normal          # normal | urgent
project: <project or "general">
tags: []
```

## Answering a Question from David

When a question file has `to: Archon` and `status: open`:

1. Read the question and context sections
2. Present to user for review/approval
3. Write the answer in the `## Answer` section
4. Update frontmatter: `status: answered`, add `answered_date: YYYY-MM-DD`, `answered_by: Archon`

## Read-Only Files (NEVER modify)

These are auto-generated by David's sync scripts:

| File | Generated By |
|------|-------------|
| `Debriefs/_index.md` | session-stop hook |
| `Debriefs/_latest.md` | session-stop hook |
| `Status/david/projects-summary.md` | Pulse API export |
| `Status/david/loom-tasks.md` | Pulse API export |
| `Status/david/*-project.yaml` | orchestration sync |
| `Status/david/*-roadmap.md` | roadmap sync |

## Conventions

- **File sharing**: Only via `Shared_Projects/` — never copy files into other project directories
- **Sync direction**: Archon → Shared is manual or Jarvis-automated; David auto-syncs via NAS scripts
- **Extended Q&A**: For back-and-forth, create a new question file rather than threading replies
- **Debrief frequency**: After meaningful sessions (not trivial fixes)
- **Debrief whitelist** (projects David shares): AIProjects, Loom, Nexus, Pulse, Dashboard, Cortex, AIFred, AIFred Pro
- **Conflict files**: `*_Conflict.md` files indicate Synology Drive detected simultaneous edits — review and resolve
- **Shared GitHub repo**: `davidmoneil/context-structure-research` (private, NateC is collaborator) — research code/data lives there, not in ProjectIntel

## Reference Scripts (at `Setup/reference/`)

| Script | Purpose |
|--------|---------|
| `sync-debriefs-to-nas.sh` | Debrief sync with project whitelist filter |
| `sync-status-to-nas.py` | Pulse API → status markdown export |
| `liaison-persona-prompt.md` | Liaison AI persona instructions |
| `liaison-persona-permissions.yaml` | Liaison access controls (scoped reads, denied paths) |

## Paths (Absolute)

```
/Users/nathanielcannon/Claude/Shared_Projects/
  README.md                 # Master conventions doc (v3.2)
  Debriefs/
    _template.md            # Debrief template
    _latest.md              # Auto-generated: 10 most recent (READ-ONLY)
    _index.md               # Auto-generated: full index (READ-ONLY)
    AIProjects/             # David's AIProjects debriefs
    loom/                   # David's Loom debriefs
    <NewProject>/           # Create as needed for Archon's debriefs
  Questions/
    _template.md            # Question template
  Status/
    david/                  # David's status (READ-ONLY for Archon)
      focus-areas.md        # Manual: current goals and priorities
      projects-summary.md   # Auto: all projects + open task counts
      loom-tasks.md         # Auto: Loom task detail
      loom-roadmap.md       # Auto: Loom 13-phase roadmap
      loom-project.yaml     # Auto: machine-readable project orchestration
    Archon/                   # Archon's status (WE maintain these)
      focus-areas.md        # Manual: update when priorities change
      projects-summary.md   # Manual: project table
  Setup/
    Archon-setup-guide.md     # Setup walkthrough
    reference/              # David's sync scripts (reference copies)
```
