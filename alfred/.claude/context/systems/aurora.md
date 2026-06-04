# Project Aurora — Autonomous Nightly Surprise System

**Status**: Active (since 2026-02-25)
**Spec**: `.claude/planning/specs/project-aurora.md`
**Pulse**: `pulse list --label project:aurora`

## Overview

Aurora is an autonomous creative agent that runs every night to build something surprising for Sir. It researches his interests, picks an idea, builds it in isolation, and presents it as a morning Obsidian note.

## Architecture

Three-phase nightly pipeline, each a separate headless Claude job:

| Phase | Job | Time | Persona | Purpose |
|-------|-----|------|---------|---------|
| Think | `aurora-think` | 12:00 AM | aurora-thinker | Research + ideate + select |
| Build | `aurora-build` | 2:00 AM | aurora-builder | Implement in isolation |
| Present | `aurora-present` | 6:00 AM | aurora-presenter | Obsidian note + Telegram |
| Action | `aurora-action` | On-demand + 6h sweep | aurora-action | Execute approved tasks |

Phase gating: each phase checks the state file before running. Build requires Think success. Present requires Build success (or creates a "planned not built" note).

## Key Paths

| What | Where |
|------|-------|
| Personas | `.claude/jobs/personas/aurora-{thinker,builder,presenter,feedback,action}/` |
| Phase output | `.claude/agent-output/aurora/` |
| State file | `.claude/agent-output/aurora/state-YYYYMMDD.json` |
| Interest profile | Obsidian `05-AI/Projects/Aurora/interest-profile.md` |
| Idea log | Obsidian `05-AI/Projects/Aurora/idea-log.md` |
| Surprise notes | Obsidian `05-AI/Projects/Aurora/surprises/YYYY-MM-DD-<slug>.md` |
| Journal (optional) | Obsidian `04-Personal/Journal/YYYY-MM-DD.md` |
| Feedback data | `aurora-data` Docker volume (feedback.jsonl, manifest.json) |
| Web gallery | `~/Docker/mydocker/aurora-web/html/index.html` |
| API sidecar | `~/Docker/mydocker/aurora-web/api/` (server.py, manifest.py) |
| Registry | `.claude/jobs/registry.yaml` (aurora-think, aurora-build, aurora-present, aurora-feedback, aurora-action) |

## Guardrails

- Build phase works exclusively in worktrees (`.claude/worktrees/aurora-YYYYMMDD/`) or temp dirs
- No `docker compose up`, `docker start`, `git push`, or SSH in build phase
- Backout plans required for anything touching existing services
- Hard budget caps per phase ($10/$30/$10)
- Rejected surprises: worktree auto-deleted after 14 days

## Feedback Loop

Two feedback paths — both converge on the same Obsidian frontmatter + Pulse state:

### Web Review (primary — frictionless)
1. Sir visits `aurora.example.com` — sees surprise gallery with review UI
2. Rates (1-5 stars), selects action (deploy/refine/backlog/not-interested/custom), adds notes
3. Feedback stored in `feedback.jsonl` via aurora-api sidecar
4. `aurora-feedback` headless job (9 PM) processes entries:
   - Updates Obsidian surprise note frontmatter
   - Routes actions to Pulse (labels, close, notes)
   - Updates interest profile
   - Rebuilds manifest so web reflects new state
5. Think phase reads updated notes/profile at midnight

### Manual (Obsidian editing — still works)
1. Sir edits frontmatter directly in surprise note (rating, accepted)
2. Think phase reads on next run

### Action Execution Loop

When Sir clicks "deploy" or "refine" in the web gallery, the approved work flows through:

1. **aurora-feedback** (9 PM daily) processes the review entry
2. Feedback adds `aurora:approved` label to the Pulse task (alongside `auto:ready` or `auto:candidate`)
3. Feedback chain-triggers `aurora-action` via `dispatcher.sh --run aurora-action`
4. **aurora-action** claims the task, reads context, executes the work, validates, and closes
5. Fallback: aurora-action also runs on a 6-hour interval sweep with a pre_check gate (no LLM cost when nothing is approved)

Label lifecycle: `aurora:delivered` (present) -> `aurora:approved` (feedback) -> `aurora:executing` (action) -> closed

## Web Infrastructure

| Component | Container | Port | Purpose |
|-----------|-----------|------|---------|
| aurora-web | nginx:alpine | 8350→80 | Serves gallery page, manifest.json, HTML artifacts |
| aurora-api | python:3.12-slim | 8001 (internal) | Feedback API, manifest generator |

**Volume**: `aurora-data` — shared between api (rw) and web (ro) for manifest.json + feedback.jsonl

**Networks**: `caddy-network` (external access via Caddy), `aurora-internal` (api ↔ nginx)

**Key files**:
- `~/Docker/mydocker/aurora-web/api/server.py` — Feedback API server
- `~/Docker/mydocker/aurora-web/api/manifest.py` — Manifest generator
- `~/Docker/mydocker/aurora-web/html/index.html` — Gallery + review UI

**Manifest rebuild triggers**:
1. After aurora-present creates a new surprise (nightly at 6 AM)
2. After aurora-feedback processes reviews (nightly at 9 PM)
3. On-demand via `POST /api/rebuild-manifest`

## Testing

```bash
# Dry run any phase
.claude/jobs/executor.sh --job aurora-think --dry-run
.claude/jobs/executor.sh --job aurora-build --dry-run
.claude/jobs/executor.sh --job aurora-present --dry-run

# Manual run (live)
.claude/jobs/executor.sh --job aurora-think
# Wait for output, then:
.claude/jobs/executor.sh --job aurora-build
# Wait for output, then:
.claude/jobs/executor.sh --job aurora-present
```

## Diary System (Phase 2 Enhancement)

Journal folder at `04-Personal/Journal/` with daily note template. Aurora reads last 7 days for inspiration. Currently placeholder — diary integration to be enhanced later.
