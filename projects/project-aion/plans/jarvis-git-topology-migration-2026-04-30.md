# Jarvis Git Topology Migration — Plan

**Date**: 2026-04-30
**Author**: Jarvis (with user direction)
**Status**: Approved-pending-execution
**Scope**: Re-point Jarvis origin from `davidmoneil/AIfred` to `CannonCoPilot/Jarvis`; align docs; add review mechanism for David's `nexus-sync-2026-04` branch on `davidmoneil/AIFred-Pro`.

---

## 1. Intended topology (source of truth)

| Repo | Local path | Branch | Remote (intended) | Purpose |
|---|---|---|---|---|
| AIfred (legacy/archived) | `/Users/nathanielcannon/Claude/Archive/AIfred` | main | `davidmoneil/AIfred` (read-only) | Public AIfred baseline; pull occasionally |
| AIFred-Pro (production reference) | `/Users/nathanielcannon/Claude/AIFred-Pro` | main | `davidmoneil/AIFred-Pro` as `upstream` | Read-only baseline of David's main |
| Alfred-Dev (collab dev) | `/Users/nathanielcannon/Claude/Alfred-Dev` | nate-dev | `davidmoneil/AIFred-Pro` as `origin`; CannonCoPilot/AIFred-Pro as `my-fork` | Push nate-dev to David's repo; fetch David's `nexus-sync-2026-04` for review |
| Jarvis (master Archon) | `/Users/nathanielcannon/Claude/Jarvis` | Project_Aion (local) → main (remote) | `CannonCoPilot/Jarvis` as `origin`; `davidmoneil/AIfred` as `upstream` (baseline) | Jarvis canonical |
| Jarvis-Dev | `/Users/nathanielcannon/Claude/Jarvis-Dev` | dev (local) → dev (remote) | `CannonCoPilot/Jarvis` as `origin` (push to `dev` branch) | Jarvis development workspace |

### Deprecation note

`davidmoneil/AIfred:Project_Aion` (the branch on David's repo, currently at `7d0e9f5`) is **deprecated as a push target**. It will be left as-is — a historical record of pre-migration Jarvis development that David may keep or delete at his discretion. We do not push to it again, do not pull from it, do not reference it from automation.

---

## 2. Inconsistencies found vs intent (2026-04-30 snapshot)

| File / Setting | Current state | Intended state | Action |
|---|---|---|---|
| `Jarvis/.git/config` `origin` URL | `https://CannonCoPilot:<PAT>@github.com/davidmoneil/AIfred.git` | `git@github.com:CannonCoPilot/Jarvis.git` | Stage A |
| `Jarvis/.git/config` `Project_Aion` upstream tracking | `origin/main` (= davidmoneil/AIfred:main, post-cleanup template) | `origin/main` (= CannonCoPilot/Jarvis:main) | Resolved automatically once origin URL changes |
| `CLAUDE.md` Git workflow → "Jarvis (Production)" → Remote line | Says origin = CannonCoPilot/Jarvis (aspirational) | Will be true after Stage A | Stage B (verify text matches reality) |
| `README.md` "Jarvis Repository → Remote" | `https://github.com/davidmoneil/AIfred.git` | `git@github.com:CannonCoPilot/Jarvis.git` | Stage B |
| `.claude/commands/sync-aifred-baseline.md` paths | Hardcodes `/Users/nathanielcannon/Claude/AIfred` (no longer exists) | Should reference `/Users/nathanielcannon/Claude/Archive/AIfred` | Stage B |
| `paths-registry.yaml` AIfred baseline path | (assumed similarly stale — verify) | `Archive/AIfred` | Stage B |
| `paths-registry.yaml` Alfred-Dev nexus-sync tracking | Not present | Add `nexus_sync.last_reviewed_commit` | Stage B |
| Review mechanism for David's `nexus-sync-2026-04` | None — purely manual | Daily fetch + change summary surfaced via Shared_Projects/Status/david/ | Stage C |

---

## 3. Mechanism for `nexus-sync-2026-04` review (3 layers)

### Layer 1 — Daily fetch + change summary (deterministic, no LLM)

- launchd job (mirrors the token-compression-reminder pattern)
- Fires every 6 hours
- Fetches `davidmoneil/AIFred-Pro:nexus-sync-2026-04`
- Computes new commits since `paths-registry.yaml:nexus_sync.last_reviewed_commit`
- Writes `Shared_Projects/Status/david/nexus-sync-2026-04-recent.md` with the last 14 days of commit titles + 1-line stats
- AC-01 already reads `Shared_Projects/Status/david/` on session start → Jarvis surfaces this passively

### Layer 2 — On-demand deep review (slash command)

- Clone of `/sync-aifred-baseline.md` retargeted at Alfred-Dev
- New command: `/sync-aifred-pro-dev`
- Fetches latest `nexus-sync-2026-04`, classifies new commits ADOPT/ADAPT/REJECT/DEFER
- Writes report to `projects/project-aion/evolution/aifred-pro-integration/sync-reports/sync-report-YYYY-MM-DD.md`
- Updates `paths-registry.yaml:nexus_sync.last_reviewed_commit`

### Layer 3 — Optional remote agent (only if Layers 1+2 insufficient)

- RemoteTrigger routine, weekly, posts a digest as a Pulse task labeled `agent:Sir review:david-nexus-sync`
- Skipped unless layers 1 & 2 prove inadequate

---

## 4. Action plan

### Stage A — Re-point Jarvis origin and push the 9 backed-up commits

```bash
# 1. Change the URL of the origin remote
#    BEFORE: origin = davidmoneil/AIfred (HTTPS+PAT)
#    AFTER:  origin = CannonCoPilot/Jarvis (SSH, no embedded PAT)
git -C /Users/nathanielcannon/Claude/Jarvis remote set-url origin git@github.com:CannonCoPilot/Jarvis.git

# 2. Push the LOCAL branch Project_Aion to the REMOTE branch main on CannonCoPilot/Jarvis.
#    Syntax is `local-name:remote-name`. The colon is FROM:TO.
#    This is a fast-forward — CannonCoPilot/Jarvis:main is at 3d9de92,
#    which is in our local history; we just add 9 commits on top.
git -C /Users/nathanielcannon/Claude/Jarvis push origin Project_Aion:main

# 3. Set the local branch Project_Aion to track origin/main
#    so that future `git push` / `git pull` (no args) target main on CannonCoPilot/Jarvis.
git -C /Users/nathanielcannon/Claude/Jarvis branch --set-upstream-to=origin/main Project_Aion
```

**What is NOT touched by Stage A**:

- `davidmoneil/AIfred:Project_Aion` (the branch on David's repo) — left at `7d0e9f5` as a fossil. We do not delete it remotely (David may want to keep or delete at his discretion). We do not push to it again.
- `davidmoneil/AIfred:main` — David's cleanup state at `1c5dce5`, untouched. Our `upstream` remote still tracks it for AIfred baseline syncing via `/sync-aifred-baseline`.
- The local branch named `Project_Aion` — keeps its name. It is now a local-only label that maps to remote `main` on CannonCoPilot/Jarvis. We could rename to `main` later, but doing so would conflict with the existing local `main` branch (which currently tracks the AIfred baseline upstream). Renaming is out of scope for this plan.

### Stage B — Doc cleanup (one commit on Project_Aion after Stage A)

- `CLAUDE.md` Git workflow section: confirm origin/upstream descriptions are accurate post-Stage-A; add a "Reviewing David's nexus-sync-2026-04" subsection under "Alfred-Dev"
- `README.md` Jarvis Repository remote: change `https://github.com/davidmoneil/AIfred.git` → `git@github.com:CannonCoPilot/Jarvis.git`
- `.claude/commands/sync-aifred-baseline.md`: change `/Users/nathanielcannon/Claude/AIfred` → `/Users/nathanielcannon/Claude/Archive/AIfred`
- `paths-registry.yaml`: confirm or add `aifred_baseline.path = Archive/AIfred`; add `aifred_pro_dev.nexus_sync.last_reviewed_commit = ee9b155` (current head of David's branch)

### Stage C — Wire up Layer 1 review for nexus-sync-2026-04

- New script: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/fetch-david-nexus-sync.sh`
- New launchd plist: `~/Library/LaunchAgents/com.aion.david-nexus-sync-fetch.plist` (every 6h)
- New file the script writes: `Shared_Projects/Status/david/nexus-sync-2026-04-recent.md`
- Read by: AC-01 session start (already inspects `Shared_Projects/Status/david/`)

### Stage D — (Optional) Layer 2 sync command

- Clone `sync-aifred-baseline.md` → `sync-aifred-pro-dev.md`, retarget paths and branch name
- Add to `.claude/commands/CLAUDE.md` index

### Stage E — Verify Jarvis-Dev push target

- Spot-check: `git -C /Users/nathanielcannon/Claude/Jarvis-Dev remote -v`
- Expected: `origin git@github.com:CannonCoPilot/Jarvis.git` (or HTTPS variant), and the `dev` branch tracks `origin/dev`
- If drifted: `git remote set-url origin git@github.com:CannonCoPilot/Jarvis.git` and `git branch --set-upstream-to=origin/dev dev`

---

## 5. Why we are not deleting `davidmoneil/AIfred:Project_Aion` remotely

A `git push --delete upstream Project_Aion` is technically possible but:

1. **It's David's repo, not ours.** Deleting his branches with our credentials is a courtesy he extended for collaboration, not for unilateral cleanup.
2. **Branch is harmless idle.** It costs nothing for him to keep; deletion is one click in his GitHub UI when he wants to.
3. **Audit trail value.** The branch is the only public-ish record of pre-migration Jarvis history. Until CannonCoPilot/Jarvis is fully populated and verified, that fossil has nonzero archival value.

A polite path: open a PR or issue on `davidmoneil/AIfred` titled "Branch `Project_Aion` is now deprecated — delete at your discretion" with a short note. Out of scope for this plan; noted as optional follow-up.

---

## 6. Risks and rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stage A push fails (auth) | Low | Low | SSH key already works for `upstream` (proves key/agent OK). If keychain hiccup: re-test with `ssh -T git@github.com`. |
| `--set-upstream-to=origin/main` fails because `origin/main` not yet fetched after re-point | Low | Low | Insert `git fetch origin` between steps 1 and 3 |
| Doc-update commit (Stage B) accidentally pushes to wrong branch | Low | Medium | Stage B runs only after Stage A confirms origin = CannonCoPilot/Jarvis; verify with `git remote -v` before pushing |
| launchd job (Stage C) writes conflicting versions of the recent.md file | Low | Low | File is fully overwritten each run; no append, no merge |

**Rollback for Stage A** (if something goes wrong before push):

```bash
# Revert origin to its prior URL (PAT-embedded; recover from credentials.yaml)
PAT=$(yq -r '.github.aifred_token' .claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
git -C /Users/nathanielcannon/Claude/Jarvis remote set-url origin "https://CannonCoPilot:${PAT}@github.com/davidmoneil/AIfred.git"
```

After the push has succeeded, no rollback is needed — CannonCoPilot/Jarvis:main is now the source of truth and contains all history.

---

## 7. Approval gate

User said: "Review and advise" → "First save this all to a plan doc."

This plan saved at: `projects/project-aion/plans/jarvis-git-topology-migration-2026-04-30.md`

Awaiting confirmation before executing Stages A–E (or any subset).
