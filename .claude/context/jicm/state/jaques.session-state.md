# Jaques — Session State

**Lane:** `jaques` (`aion:13`) · **cwd:** `/Users/nathanielcannon/Claude/Projects/SnorkelTasks`
**Purpose:** Compact status for this lane only. W0's `session-state.md` is another lane's memory and
is neither read nor written from here.

---

## ACTIVE (2026-08-12) — Establishing Jaques

Plan: `/Users/nathanielcannon/Claude/Project_Aion/.claude/plans/eager-plotting-umbrella.md`

Phase 1 (Archon install) in progress. No Snorkel work started.

## Project states — they are not comparable

| Project | Drive | State |
|---|---|---|
| **ec-beech** | 204 files · 8.4 MB, already mirrored to `source-materials/` | `taxprofiler-execution-audit-001` revised 2026-08-06 after 10 review findings; **staged to resubmit**. Gate 1 21/21, Gate 2 6/6 baselines fail |
| **ecs-otter** | 4 files · **321 MB**, unread | Guide + Reviewer Quick Guide (docx), Example Task + Task Skeleton (zips). Public task board at `snorkel-ai.github.io/otter-harbor-task-claims/` |
| **ec-starfish** | 8 files · **2 KB** | Bare Harbor skeleton, no data. Unstarted |

## Next

1. **Reorganize** SnorkelTasks for three projects (`git mv`, history preserved). The repo currently
   knows only Beech — zero references to starfish or otter anywhere in the tree.
   **Constraint:** `submissions/taxprofiler-execution-audit-001.tar.gz` must stay byte-identical and
   uploadable; re-verify both gates from the moved tree.
2. **Driveline** → shared package; three rclone remotes; mirror + manifest all three folders.
3. **Monitors** — Otter task board first (public, pollable, needs nothing); then the authenticated
   surfaces via the Chrome bridge.

## Verified facts (2026-08-12)

- All three Drive folders are reachable from the **existing** `wvu` rclone token — same Google
  account, no new consent needed.
- `experts.snorkel-ai.com` and both `expertdocs.snorkel-ai.com` GitBooks return **403** unauthenticated.
  `snorkel-ai.github.io/otter-harbor-task-claims/` returns **200** — public.
- Chrome extension bridge is live (1 local browser).

## Standing constraints

- **Submission is the User's action.** Jaques packages, verifies and drafts; the User submits.
- The domain law is `SnorkelTasks/CLAUDE.md`, auto-discovered from cwd. It is authoritative and was
  written from real review findings — do not restate it from memory.

## Open — needs the User

- Can an app be installed in Snorkel's Slack workspace, or does it need admin approval?
- Which Slack channels to watch.
- Per-site Chrome permission for `experts.snorkel-ai.com` and `expertdocs.snorkel-ai.com`.

## Known risk

`rclone`'s shared Google `client_id` is being retired during 2026. When it goes, both Jaques' and
Genie's Drive pipelines stop. Minting an own OAuth client id is small and overdue.

---

*Jaques lane established 2026-08-12.*
