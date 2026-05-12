---
description: Sync and analyze Alfred-Dev nexus-sync-2026-04 (David's experimental Nexus refactor)
allowed-tools: Read, Write, Edit, Bash(git:*), Glob, Grep
---

# Sync Alfred-Dev (nexus-sync-2026-04)

You are running the deep-review workflow for David O'Neil's experimental Nexus refactor branch on `davidmoneil/AIFred-Pro:nexus-sync-2026-04`.

This is **Layer 2** of the three-layer review mechanism:
- **Layer 1** (passive): `com.aion.david-nexus-sync-fetch` writes a recent-commits summary every 6h to `Shared_Projects/Status/david/nexus-sync-2026-04-recent.md`. AC-01 surfaces it on session start.
- **Layer 2** (this command): on-demand deep review with classification.
- **Layer 3** (optional Pulse digest): only if 1+2 prove insufficient.

**CRITICAL CONSTRAINT**: `/Users/nathanielcannon/Claude/Alfred-Dev` is read-write for our `nate-dev` branch only. The `nexus-sync-2026-04` branch on `origin` (David's repo) is **read-only** for us — fetch only, never push, never edit, never delete.

## Arguments

- `$ARGUMENTS` — Optional: `dry-run` (report only, default) or `full` (also update `paths-registry.yaml:aifred_pro_dev.nexus_sync.last_reviewed_commit`)

## MANDATORY OUTPUTS

Every invocation MUST generate two report files:

1. **Formal Sync Report**: `projects/project-aion/evolution/aifred-pro-integration/sync-reports/sync-report-YYYY-MM-DD.md`
   - Structured ADOPT/ADAPT/REJECT/DEFER classifications
   - File-by-file analysis
   - Rationales for each decision

2. **Ad-Hoc Assessment**: `projects/project-aion/evolution/aifred-pro-integration/sync-reports/adhoc-assessment-YYYY-MM-DD.md`
   - Key discoveries (what was unexpected or important)
   - Implications for Alfred-Dev (`nate-dev` branch) work
   - Implications for Jarvis architecture (if any)
   - Recommended next steps
   - Blockers or concerns

## Phase 1: Fetch the branch

```bash
git -C /Users/nathanielcannon/Claude/Alfred-Dev fetch origin nexus-sync-2026-04
git -C /Users/nathanielcannon/Claude/Alfred-Dev rev-parse origin/nexus-sync-2026-04
```

## Phase 2: Identify the review window

Read `paths-registry.yaml:aifred_pro_dev.nexus_sync.last_reviewed_commit`. If absent, default to the merge-base with `nate-dev`.

```bash
git -C /Users/nathanielcannon/Claude/Alfred-Dev diff --name-status <last_reviewed>..origin/nexus-sync-2026-04
git -C /Users/nathanielcannon/Claude/Alfred-Dev log <last_reviewed>..origin/nexus-sync-2026-04 --pretty=format:"%h %ci %an: %s"
```

## Phase 3: Categorize changes

Group changed files by area. Alfred-Dev categories that matter:

| Category | Path patterns |
|----------|--------------|
| **Pulse API** | `pulse/`, `dashboard/server/api/` (Pulse routes) |
| **Nexus core** | `.claude/jobs/scripts/nexus-*`, `.claude/jobs/personas/`, `.claude/jobs/dispatcher.py` |
| **Pipeline v2** | `.claude/jobs/scripts/{stage,evaluate,orchestrate,review,executor}.py`, `pipeline-watcher.py` |
| **Dashboard** | `dashboard/` (React + API) |
| **Hooks** | `.claude/hooks/*` |
| **Skills/Commands** | `.claude/skills/`, `.claude/commands/` |
| **CLAUDE.md / docs** | `CLAUDE.md`, `docs/`, `README.md` |
| **Other** | Everything else |

## Phase 4: Classify each change

### ADOPT (port to `nate-dev` directly)
- Pure bug fixes that apply to our environment
- New Pulse routes / Nexus personas with no naming/path conflicts
- Documentation that documents our shared system

### ADAPT (port with modification)
- Changes that hardcode `/home/davidmoneil/...` paths → rewrite for `/Users/nathanielcannon/Claude/...`
- Personas that hardcode David's Telegram / project labels → adjust for our setup
- Hook logic that assumes David's machine layout

### REJECT (do not port)
- Changes that conflict with our Pipeline v2 work on `nate-dev`
- Experiments superseded by our completed sessions (54-57)
- Anything that reverts work David has already accepted from us

### DEFER (revisit later)
- Architectural changes too large for inline adoption
- Changes blocked on dependencies we don't yet have
- Anything ambiguous — better to flag than to pre-decide

## Phase 5: Write the formal report

Path: `projects/project-aion/evolution/aifred-pro-integration/sync-reports/sync-report-YYYY-MM-DD.md`

```markdown
# Alfred-Dev nexus-sync-2026-04 Sync Report

**Generated**: YYYY-MM-DD HH:MM UTC
**Branch HEAD**: <commit_hash>
**Previous review**: <last_reviewed_commit>
**Changes since**: N files, M commits

---

## Summary

| Classification | Count |
|----------------|-------|
| ADOPT | N |
| ADAPT | N |
| REJECT | N |
| DEFER | N |

---

## ADOPT (port directly)

### `<path>`
- **Change**: …
- **Rationale**: …
- **Action**: cherry-pick / manual port to `nate-dev`

## ADAPT (port with modification)

### `<path>`
- **Change**: …
- **Modification needed**: …
- **Rationale**: …

## REJECT

### `<path>`
- **Change**: …
- **Rationale**: conflicts with our work / superseded / unwanted

## DEFER

### `<path>`
- **Change**: …
- **Reason**: …
- **Revisit**: <next sync / when X lands>

---

## Recommended actions

1. …
2. …
```

## Phase 6: Write the ad-hoc assessment

Path: `projects/project-aion/evolution/aifred-pro-integration/sync-reports/adhoc-assessment-YYYY-MM-DD.md`

```markdown
# Alfred-Dev nexus-sync-2026-04 Ad-Hoc Assessment

**Generated**: YYYY-MM-DD HH:MM UTC
**Branch HEAD**: <commit_hash>

---

## Key discoveries

- …

## Implications for our `nate-dev` work

- Conflicts with Pipeline v2 work in sessions 54-57?
- Personas/dashboard work overlap?

## Implications for Jarvis architecture

- (Often none — this branch is AIFred-Pro-internal)

## Recommended next steps

1. …

## Blockers / concerns

- …
```

## Phase 7: Update tracking (only if `$ARGUMENTS == "full"`)

```bash
# Update paths-registry.yaml
yq -i '.aifred_pro_dev.nexus_sync.last_reviewed_commit = "<HEAD>" | .aifred_pro_dev.nexus_sync.last_reviewed_date = "YYYY-MM-DD"' /Users/nathanielcannon/Claude/Jarvis/paths-registry.yaml
```

In `dry-run` mode, do NOT update the registry — leave it pointing at the previous review so the next Layer-1 fetch will continue to surface the same window.

## Output

```
Alfred-Dev nexus-sync-2026-04 review complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch HEAD:       <short_hash>
Previous review:   <short_hash>
New commits:       N
Files changed:     M

Classifications:
├── ADOPT:  N
├── ADAPT:  N
├── REJECT: N
└── DEFER:  N

Reports:
├── projects/project-aion/evolution/aifred-pro-integration/sync-reports/sync-report-YYYY-MM-DD.md
└── projects/project-aion/evolution/aifred-pro-integration/sync-reports/adhoc-assessment-YYYY-MM-DD.md

Registry updated: <yes|no — dry-run>
```

---

## Quick reference

| Mode | Effect |
|------|--------|
| `/sync-aifred-pro-dev` | Dry-run: fetch, classify, write reports, do not update registry |
| `/sync-aifred-pro-dev full` | Same + update `paths-registry.yaml:aifred_pro_dev.nexus_sync.last_reviewed_commit` |

---

*Jarvis — Project Aion Master Archon*
