
## Rotation 2026-05-12T22:28:44Z (entries pre-6h cutoff)


### 2026-05-12 (post-topology-rename) — Phase 2 COMPLETE via compose-maintain v1; Phase 3 ready

**Position**: All Recs from this session's resume cycle complete except Phase 3 (scrub). Topology rename succeeded end-to-end via the newly-built compose-maintain skill — first live use of the skill validated the worker-window pattern. Alfred-Dev is now Alfred-Dev locally; GitHub side is CannonCoPilot/Alfred (renamed earlier in session).

**Topology rename outcome** (worker run: 2026-05-12T21:26:38Z → 21:28:19Z, 101s)
- Recipe: `Jarvis/.claude/skills/compose-maintain/recipes/topology-rename-alfred.json`
- Worker phases: launching → preflight (36s) → down (6s) → repair[0..5] (43s) → wait_healthy (21s) → validate (13s) → complete. All green.
- Summary: 6 repairs applied; 3 health-checked containers healthy; 4/4 ports listening (9800,8800,8701,8702). event-watcher PID 45616 alive after reload.
- Docker `project_name=aifred-pro-dev` preserved → volume/network namespace intact (postgres-data, dashboard-data, aifred-dev-network all kept their data).

**Two cleanup items pending Sir's call**

1. **Ghost dir `/Users/nathanielcannon/Claude/Alfred-Dev`** — recreated by launchctl during a ~6s window between `mv` (repair[0] @ 21:27:10) and `launchctl unload` (repair[1] @ 21:27:16). KeepAlive=true triggered a relaunch attempt; macOS launchctl auto-creates StandardOutPath/StandardErrorPath parent dirs. Now contains only stale `event-watcher-v2.log` + `-error.log`. Plist now (intentionally updated by user) points correctly at `/Alfred-Dev/...` — nothing writes to ghost. **Action**: `rm -rf /Users/nathanielcannon/Claude/Alfred-Dev`. Asked Sir; awaiting confirmation.

2. **673 stale `Alfred-Dev` refs in `/Alfred-Dev`** classified:
   - 669 in `/Alfred-Dev/.claude/` — caches/archives/logs/historical; non-load-bearing.
   - 4 load-bearing (outside `.claude/`):
     - `/Alfred-Dev/docker-compose.dev.yml:1` — comment line (cosmetic)
     - `/Alfred-Dev/README.dev.md:1,29,93` — title + 2 `cd ~/Claude/Alfred-Dev` examples (**actively misleading** if read by future users)
     - `/Alfred-Dev/tests/gospel-synopsis/_archive/2026-04-30-run/PROJECT.md:86` — archived test note (leave as historical)
     - `/Alfred-Dev/usage-proxy/probe-headers.sh:12` — comment in shell script (cosmetic)

   None affect runtime. Phase 3 (next workstream) should batch these with the "scrub `Sir` references" directive into one sed pass.

**Phase 3 scope expansion**: Phase 3 was originally framed as "scrub `Sir` references from CannonCoPilot fork" per Sir's earlier migration plan. With Phase 2 done, it now subsumes:
- Original: scrub `Sir` refs (file content + maybe paths)
- New: scrub the 4 load-bearing `Alfred-Dev` refs above
- New: scrub any Jarvis-side refs to `/Users/nathanielcannon/Claude/Alfred-Dev/` — known candidates: `Jarvis/.claude/scripts/launch-jarvis-tmux.sh` (W0/W5 :9800 routing setup may reference old path), `Jarvis/CLAUDE.md`, `Jarvis/.claude/context/current-plans.md`, plus session-state and scratchpad self-refs (the scratchpad has many Alfred-Dev refs in its own history; LEAVE THOSE — they're factually-accurate historical entries, not load-bearing forward refs).

**Phase 4 (queued)**: maintenance review + David's collaborator-admin upgrade follow-up (PUT returned 204 but permission stayed at `write` — likely needs UI step on user-owned repo).

**Commits landed this session**:
- Alfred-Dev nate-dev: `55b0290` pipeline stale-rename fix; pushed to origin/nate-dev + origin/main on CannonCoPilot/Alfred
- Jarvis Project_Aion: `5c48191` compose-maintain v1 skill (5 files, 635 LOC); `684a7ba` workstream-arch §6.2 hygiene additions + session checkpoint; pushed to CannonCoPilot/Jarvis main

**Compose-maintain skill v1 — proven**:
- Path: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/compose-maintain/`
- Recipe schema validated by first live use.
- Pattern: `claude --print` in `env -u ANTHROPIC_BASE_URL` tmux window; status file polling; auto-cleanup. `run_in_background=true` from W0 so :9800 outage during compose down doesn't strand W0's Bash result.
- Future recipes: `dev-stack-restart.json` (no repairs, just down→up), `pipeline-rebuild.json` (rebuild + restart pipeline only without full stack down). To be added as needs arise.

**Resume protocol (Phase 3)**:
1. Verify Alfred-Dev healthy: `ls /Users/nathanielcannon/Claude/Alfred-Dev/.claude/` should show normal contents; `docker ps --filter name=aifred-dev` should show all healthy.
2. If `/Alfred-Dev` still exists, ask Sir to confirm `rm -rf`.
3. Phase 3 scrub plan:
   - Scrub 4 load-bearing `Alfred-Dev` refs in `/Alfred-Dev` (above)
   - Scrub Jarvis-side refs (grep `/Users/nathanielcannon/Claude/Jarvis -r "Alfred-Dev"` then categorize)
   - Scrub `Sir` references in `/Alfred-Dev` (the original Phase 3 mandate; preserve test fixtures, scrub paths/credentials/docs)
   - Phase 3 may benefit from a `compose-maintain` recipe (`scrub-Sir-and-aifred.json`) if it crosses into compose territory; otherwise pure sed pass.
4. Phase 4 follows: maintenance review + David admin upgrade.

### 2026-05-12 (session-end checkpoint) — Pipeline stale-rename fix shipped + compose-maintain skill v1 built + topology rename pending

**Position**: All "Recs 1-5" from this session's resume cycle complete except Rec 2 (Phase 2 dir rename), which is queued behind the just-built skill. Compose-maintain v1 is the reproducible mechanism for Rec 2 and any future `compose down` ops that would kill :9800 from W0.

**Skill: compose-maintain v1 (commit `5c48191` on Jarvis Project_Aion)**
- Files: `.claude/skills/compose-maintain/{SKILL.md (170 LOC), launch-worker.sh (313 LOC), recipes/_template.json, recipes/topology-rename-alfred.json}` + capability-map.yaml registration.
- Pattern: `launch-worker.sh <recipe>` → atomic mkdir lock → renders prompt → `tmux new-window -d "env -u ANTHROPIC_BASE_URL claude --print '<prompt>'"` in jarvis: session → worker reads recipe.json, executes compose down → repairs → compose up → status file polling → wait_healthy → validate → window self-kills.
- W0 (proxied through :9800) reads status file (local fs, no API needed) so :9800 outage during compose down→up cycle doesn't strand W0.

**Pipeline stale-rename fix (commit `55b0290` on Alfred-Dev nate-dev; pushed to origin/nate-dev + origin/main on CannonCoPilot/Alfred)**
- Root cause: commit `77145a9` (2026-04-30) renamed `event-watcher-v2.py → pipeline-watcher.py` and added the pipeline Docker service in the same commit, but the new service's Dockerfile CMD + healthcheck blocks in both compose files kept the old filename. Container restart-looped silently for 12 days, masked by host-side `pipeline-watcher.py` PID 15622. Phase 2.2 killed PID 15622 → silent failure became loud.
- Fixed: 3 stale refs corrected (Dockerfile:17, docker-compose.yml:112, docker-compose.dev.yml:117). Container now Heartbeat #N healthy.
- Sibling fix (not in same commit): `/Users/nathanielcannon/Library/LaunchAgents/com.aion.nexus-dev-event-watcher.plist` retargeted from broken python ref to Phase D's `event-watcher.sh`. Plist loaded + processed 5 backfilled events on first invocation, cursor advanced to 2026-05-12T18:18:48.367534+00:00.
- PROD plist `com.aion.nexus-event-watcher.plist` still references broken path (not loaded; flagged as Future Work parity item).

**Topology rename — pending execution**
- Recipe: `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/compose-maintain/recipes/topology-rename-alfred.json`
- Scope: local `/Users/nathanielcannon/Claude/Alfred-Dev` → `/Users/nathanielcannon/Claude/Alfred-Dev`. Per Decision 3 (this session, earlier): AIFred-Pro stays as-is. Project name `aifred-pro-dev` preserved across rename for Docker namespace continuity.
- 6 repairs: mv dir / launchctl unload event-watcher / sed 3 plists / sed .env (conditional) / launchctl reload event-watcher / informational audit grep.
- Rollback defined for both repair-failure and up-failure.
- Will fire with `run_in_background=true` so W0 Bash call returns immediately; W0 reads status file after :9800 returns.

**Future-Work additions (commit pending in this session's commit 2)**
- `Jarvis/projects/project-aion/designs/project-aion-workstream-architecture-2026-05-05.md` §6.2: added 2 rows — (a) W0/9800 routing catch-22 ergonomic fix (envrc / Makefile / launch-script branching options), (b) stale-rename 4-callsite gotcha + PROD plist parity item.

**Resume protocol if topology rename clobbers W0 context**
1. Read `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/compose-maintain-topology-rename-alfred.status.json` first.
2. If `phase: "complete"`: rename succeeded; verify ports 9800/8800/8701/8702 listening, then continue with Phase 3 (scrub) and Phase 4 (maintenance review).
3. If `phase: "failed"`: read `error` field; check whether rollback fired (`/Users/nathanielcannon/Claude/Alfred-Dev` should exist again); recover state from log file at `compose-maintain-topology-rename-alfred.log`.
4. If status file missing or stale: check tmux window `jarvis:maintain-topology-rename-alfred` — if alive, worker still running; if dead, check log file last lines for cause.
5. Stale lock: `rm -rf /Users/nathanielcannon/Claude/Jarvis/.claude/scratch/compose-maintain.lock`.

**Open at session end** (sequenced):
- Rec 2 (topology rename via compose-maintain) — IN-FLIGHT or about to fire.
- Rec 5 (Phase 3 "Sir" scrub) — queued after Rec 2.
- Phase 4 (maintenance review + David admin-upgrade follow-up) — queued after Rec 5.
- All Alfred-Dev work continues against renamed `/Alfred-Dev` path post-Rec-2.

### 2026-05-12 — PR #3 OPENED (A1 scope): davidmoneil/AIFred-Pro#3

**State**: 110-commit batch PR `nate-dev → main` on davidmoneil/AIFred-Pro is OPEN at https://github.com/davidmoneil/AIFred-Pro/pull/3. M1+M2+M3 dashboard re-cleave SHIPPED + 11 prior workstreams included in batch (first merge to main since nate-dev branch creation 2026-04-22). Pending David's review/merge.

**Scope expansion at decision time**: I initially framed PR-assembly around the 5 commits pushed this session; mid-flight discovered `main..nate-dev` was 110 commits, not 5. Surfaced 3 interpretations (A1 = all 110, A2 = re-cleave with new base branch, A3 = cherry-pick onto fresh branch). Sir chose A1: literal §11.5 reading + practical reality that no prior nate-dev commits had ever merged. PR body groups 110 commits into 12 workstream themes (Dashboard re-cleave, REO, Watchdog W1, Dev-env Paths 1+2, P1.B1.1 Pulse READ API, Notification routing, UsagePage refactor, P1.6 executor.py port, P1 dashboard personas/decisions, P1.5 Pulse write API, Nexus-Sync Supplant R4-R7, Pipeline-v2 trunk + multi-space foundations) for David's scannability.

**Pipeline-watcher state**: PID 15622 currently `TN` (likely SIGSTOPped by Watcher refresh hook). Sir's call: hold off on SIGCONT pending instructions.

**Next**: await David's review/merge. After merge, pull main into nate-dev + resume REO Validate (paused per foundational analysis §11.7).

### 2026-05-12 (latest) — Phase D IN-DEV-COMPLETE: Plan B + B2 ratified; held local pending PR #3 merge

**Position**: Phase D in-dev-complete. ALL commits LOCAL on Alfred-Dev `nate-dev`; NOT pushed (per B2). PR #3 unchanged at davidmoneil/AIFred-Pro#3 head `18c1136`.

**Sir ratified this turn**: Plan B (drop `auto:*` from event-driven layer; investigate.py NOT built; score.py risk:*-only) + B2 (hold Phase D commits local until PR #3 merges, then ship as separate PR).

**Phase D state**:
- `78693a3` D.4 (committed prior turn): pulse/app.py — `/api/v1/events` extended with `event_type` + `since` filters.
- `eb6032f` D.5 initial (committed prior turn): services/score.py NEW 157 LOC.
- **UNCOMMITTED this turn (3 files on Alfred-Dev)**:
  - score.py Plan-B revision (slimmed to 108 LOC; auto:* + fix_contradictions paths removed; risk:* only).
  - event-watcher.sh +51 LOC — Pulse `/api/v1/events?event_type=created` polling block; URL-encoded cursor (`+00:00` → `%2B00:00`); warning log on curl failure; sync `python3 services/score.py --task-id` per event.
  - registry.yaml — task-score / task-investigator / task-executor `enabled: false` + Plan-B comment block at lines 115-129.
- D.6 SKIPPED per Plan B (no investigate.py).
- pulse-events-cursor seeded to `2026-05-12T18:18:14Z` (gitignored state file).

**D.9 smoke validation** (in-vivo on pulse_dev):
- Direct score.py invocation: 13ms latency, risk:safe applied, no auto:*, exit 0.
- D.7 polling block (3 runs): 12 task.created events processed, all received risk:* (safe/moderate per description keywords), zero auto:* anywhere. URL-encoded cursor works with `+00:00` ISO offset.
- v2 orchestrate.py decomposed test task with "schema migration" description into 8 sub-tasks — confirms v2 pipeline-watcher daemon (PID 15622, alive `SN` 6 days uptime) operational + independent of dropped cron jobs.
- 11 smoke tasks cleaned via /tasks/{id}/close. pulse_dev open count: 0.

**Phase D in-vivo discoveries documented in audit §6.1**:
1. Pulse emits `event_type="created"` not `"task.created"` (app.py:386); webhook uses `"task:created"` (line 388). D.7 polling uses `created`.
2. event-watcher.sh ONLY detected events via vestigial `.beads/events.jsonl` path; needed brand-new Pulse `/api/v1/events` polling block.
3. event-watcher launchd labels: `com.aion.nexus-event-watcher` (prod) + `com.aion.nexus-dev-event-watcher` (dev); plist exists, dev not currently loaded.
4. PULSE_API_URL contains `/api/v1`; callers append `/events` not `/api/v1/events` (initial D.7 had double-prefix bug; fixed before smoke).
5. Bare `+` in URL query string decodes to space → HTTP 400 silent-fallback masked it; fixed with `"${PE_CURSOR//+/%2B}"` + warning log.

**Jarvis-side commit this turn** (PENDING):
- audit report §5 RATIFIED + Q-B added; §6 effort table flipped to status log + §6.1 in-vivo discoveries + §6.2 files-touched manifest; §9 status flipped to IN-DEV-COMPLETE-PENDING-MERGE + prod-readiness cursor-seeding note.
- workstream-arch §6.2 Phase D row IN-DEV-COMPLETE-PENDING-MERGE.
- this scratchpad entry.
- session-state.md.

**Resume protocol when Sir returns**:
1. Read this scratchpad entry first.
2. Confirm 3 uncommitted Alfred-Dev files via `git status`: score.py / event-watcher.sh / registry.yaml.
3. Stage + commit on Alfred-Dev nate-dev (per B2: NO push). Suggested message: `feat(phase-d): event-driven score.py + registry disable + event-watcher polling [Plan B, B2]`.
4. Commit Jarvis-side doc updates on Project_Aion → push to CannonCoPilot/Jarvis main (allowed; not the held-back repo).
5. Wait for PR #3 merge before any push to davidmoneil/AIFred-Pro.
6. After PR #3 merges: `git -C ~/Claude/Alfred-Dev fetch origin && git merge origin/main` into nate-dev; push Phase D as separate PR.
7. After Phase D PR lands: kick off Phases B + C in parallel (F-1 + F-5 in services/executor.py claim path); then Phase E (Watchdog W2/W3).

**Pre-Plan-B mid-impl section retired** (was: Q-A/Q-B options A/B/C and B1/B2/B3 surfaced; Plan B + B2 locked).

### 2026-05-12 (post-Phase-D commit) — PR #3 contingency plan + David ProjectIntel scan

**ProjectIntel scan result**: No David direct communication since 2026-04-15 (Loom T2 debrief, ~27 days). Today's `Status/david/*.md` timestamps are Jarvis-poll artifacts, not David edits. David: 29 open tasks across 9 projects (ZERO in `aifred-pro` label), nexus-sync-2026-04 HEAD unchanged at `ee9b155` (new_commit_count: 0), Loom on P3 / one parked. Outbound `Questions/AIFred-Pro/2026-05-07-reo-page-direction.md` STILL OPEN at 5 days. **No PR #3 acknowledgment anywhere in Shared_Projects.** Signal: David busy elsewhere, hasn't engaged PR #3 yet — not a rejection.

**PR #3 contingency plan (tiered escalation)** — held durably here for future-me reference:

| Tier | Trigger date | B2 status | Action |
|---|---|---|---|
| T1 | now → 2026-05-19 | Hold | Velocity-track parallel work (3 options below) |
| T2 | 2026-05-19 (no review activity 5+ business days) | Hold + outreach | File **GitHub PR #3 comment** (primary) + Questions/ (durable record). Questions/-only is insufficient given 2026-05-07's 5-day silence proving cadence > weekly. |
| T3 | 2026-05-26 (continued silence) | Partial relax → B3 for Phase D | Reapply Phase D on fresh `phase-d-event-driven` branch off `origin/main` (~30-60 min; D.4 cherry-pick conflicts ~90% likely, manual re-apply easier). Phases B+C stack on Phase D's new branch. |
| T4 | day 14-21 (PR #3 effectively dead) | Full B2 dissolution | Mutual-close PR #3; split 110 commits into 5-7 thematic PRs |
| T5 | open-ended | Structural | ≤200-LOC PR discipline; max 2-3 unreviewed queued |

**Tier 1 velocity-track options** (Sir's pick, all PR-#3-independent):
1. **Watchdog W2** — `com.aion.nexus-pipeline-watcher-liveness.plist` launchd plist probing pipeline-watcher PID + executor heartbeat; Telegram alert on failure. Pure Jarvis-side. ~0.5-1d. Plan: `Jarvis/projects/project-aion/plans/aifred-pro-dev-pipeline-watcher-watchdog.md`.
2. **REO Validate walkthrough** — :8702 dev-dashboard already serves post-M3 + post-REO-MVP. Sir UX walkthrough; defer ship until PR #3 merges. ~0.5d Sir-time.
3. **Board v2 component-cards plan-of-record** drafting — listed as "parallel to REO, separate plan TBD" since 2026-05-07. ~1d Jarvis drafting + Sir review.

**Pre-T2 due-diligence** (cheap, do before assuming silence is real): `gh pr view 3 --json comments,reviews,timelineItems` to verify David is designated reviewer + notified. If not, trivial fix (`gh pr edit 3 --add-reviewer davidmoneil` or similar).

**T3 risk**: if Phase-D-off-main PR + PR #3 both eventually merge, ~1-2h rebase work expected. Mitigation: explicit Question/ to David BEFORE filing the off-main PR explaining the path ("want to keep downstream unblocked; park or pivot?") — preserves trust-loop.

**Resume protocol when Sir returns**: pick T1 action (W2 / REO / Board v2) OR wait. T2 = 2026-05-19, T3 = 2026-05-26.

### 2026-05-12 (later, post-second-refresh) — PR #3 GitHub state check + contingency revision

**Critical finding (`gh pr view 3 --repo davidmoneil/AIFred-Pro`)**: PR #3 has **zero reviewRequests, zero assignees, zero human comments**. Only review submitted: `copilot-pull-request-reviewer` auto-bailed 8 seconds after PR creation (16:10:18Z) with `"exceeds the maximum number of files (300)"`. PR body title: `nate-dev → main: 110-commit batch (pipeline-v2 + REO + re-cleave)`. Created 2026-05-12T16:10:10Z.

**Implication**: ProjectIntel showed zero David acknowledgment because David was **never notified** — no reviewer assignment, no @-mention. The "T2 trigger at 2026-05-19" clock from the prior contingency plan assumed David could see the PR was waiting; he cannot. Clock hasn't started in his world.

**Second-order signal**: >300 changed files is a hard architectural fact. Copilot's refusal at submission is the same signal we'd otherwise spend two weeks deriving via T4. Even if we add David as reviewer now, he sees a PR GitHub's own tooling already refused to engage with — non-trivial trust-loop concern.

**Contingency plan revision** (supersedes the tier-trigger schedule above):

| Tier | OLD trigger | NEW trigger |
|---|---|---|
| T1 (passive wait) | Day 0-5 | DEPRECATED (was premised on David being notified) |
| T2 (outreach) | 2026-05-19 | **NOW** — trivial-fix needed before any wait clock can start |
| T3 (off-main pivot) | 2026-05-26 | 2026-05-19 if T2 fix produces no engagement |
| T4 (full restructure) | Day 14-21 | Bring forward — Copilot's 300-file signal validates same-day |

**Two actions surfaced to Sir, gated for his approval (NOT executed)**:

- **Action 1 (recommended)**: `gh pr edit 3 --repo davidmoneil/AIFred-Pro --add-reviewer davidmoneil` + `gh pr comment 3 --body "<summary pointing at PR body's 12-workstream breakdown>"`. Visible to David (email/notification). Reversible.
- **Action 2a (conservative; my recommendation if going to ask)**: Action 1 first, let David weigh in on bundle size. His call on review-capacity is authoritative.
- **Action 2b (proactive)**: Close PR #3 ourselves, file 5-7 thematic PRs, Question/ explaining reframe. Shows initiative on tool-fit but pre-empts David's preference without asking.

**Parallel work option (PR-#3 independent, can start during Sir's deliberation)**: Watchdog W2 (Jarvis-side launchd liveness probe; plan at `Jarvis/projects/project-aion/plans/aifred-pro-dev-pipeline-watcher-watchdog.md` — I queued reading it but never got there pre-refresh).

**Resume protocol when Sir returns**:
1. Read this entry first.
2. Three open decisions: (a) Action 1 yes/no, (b) which of 2a vs 2b vs other path, (c) start W2 in parallel yes/no.
3. State of pulse_dev (4 open tasks — recurring-job spawn during refresh, not validation rig leftover): harmless.
4. State of pipeline-watcher (PID 15622 alive `SN`, 6d-14h uptime): healthy.
5. No code commits queued; only outbound action is Action 1 if Sir green-lights.

### 2026-05-12 (earlier) — Phase D dispatcher/registry audit COMPLETE; impl pending Sir Q1-Q4

**State**: post-PR-#3 workstream pipeline kicked off per Sir's R1-R5 + new architectural rule ("dispatcher = recurring jobs only; ALL Pulse-Nexus task-pipeline ops must be event-driven"). Phase ordering D → B+C → E ratified.

**Phase D audit deliverable**: `Jarvis/projects/project-aion/reports/dispatcher-registry-audit-2026-05-12.md` (282 LOC). 13 registry jobs classified: 10 KEEP (non-pipeline recurring — health-summary, persona-health-check, doc-sync-check, pipeline-review observational, context-maintenance, 3 creative-pipeline phases, weekly-digest, ollama-test) + 3 REMOVE (task-score, task-investigator, task-executor — all `tags: [pipeline]`, all interval 0.166h cron). Event-trigger replacements blueprinted: services/score.py (NEW) + services/investigate.py (NEW) + existing services/executor.py daemon subsumes task-executor.

**Workstream-arch §6.2 extended**: architectural rule codified above the queue table; Phase D row added immediately above the Approval-Gate Enforcement row with explicit prerequisite tag.

**OPEN Q1-Q4 pending Sir's decision before impl** (per audit §5):
- Q1: services/executor.py subsumes autofix-executor cleanly? (default: yes, persona-mode)
- Q2: Pulse exposes per-label-change event? (default: add `/api/v1/events?type=label_added` polling endpoint)
- Q3: event-watcher dispatches direct to services vs through dispatcher? (default: direct)
- Q4: big-bang vs parallel-write rollout? (default: parallel-write, Option B)

**Estimated effort**: ~3-4d for Phase D impl (Q-answers → 2 new services + Pulse endpoint + event-watcher refactor + registry edits + validate). Then ~2-3d for B+C combined. Then ~1-2d for E. Total ~6-9d for the full post-PR-#3 workstream chain.

**Critical context**: Phase D is hard-prerequisite for B+C (F-1/F-5 fix code lives in executor claim path whose invocation source changes post-D) and for E (watchdog observability targets change post-D). NO parallel work on B/C/E until D lands.

**Re-cleave commit landscape on Alfred-Dev nate-dev** (5 commits, net = M1+M2+M3):
```
d001c75  feat(dashboard): re-cleave sidebar IA [M1]
fc1546f  feat(dashboard): /decisions → /reo [M2]
fcf62df  feat(dashboard): /pipeline approval split [M3]
0f3341a  docs(plans): F-1 plan (drift; cancels with 18c1136)
18c1136  docs(plans): remove F-1 plan (cancels 0f3341a)
```

**Canonical Jarvis planning doc landscape** (per Sir's 2026-05-12 list — these are the EXISTING homes; do not fork new planning files, extend these in place):

| Path | Purpose |
|---|---|
| `Jarvis/projects/project-aion/designs/project-aion-workstream-architecture-2026-05-05.md` | Master workstream architecture + §6 Future Work queue |
| `Jarvis/projects/project-aion/designs/jicm-portable-architecture.md` | JICM portability design |
| `Jarvis/projects/project-aion/reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md` | Foundational IA analysis (§11 ratifications) |
| `Jarvis/projects/project-aion/reports/aifred-pro-dev-milestone-executive-report-2026-05-04.md` | Milestone executive report |
| `Jarvis/projects/project-aion/reports/token-compression-roadmap.md` | Token-compression workstream roadmap |
| `Jarvis/projects/project-aion/reports/nexus-sync-supplant-r1-investigation-2026-05-04.md` | Nexus-sync R1 investigation |
| `Jarvis/projects/project-aion/reports/nexus-sync-supplant-r2-plan-2026-05-04.md` | Nexus-sync R2 plan |
| `Jarvis/projects/project-aion/reports/m3-pipeline-approval-consumer-audit-2026-05-11.md` | M3 audit + Appendix A (F-1..F-5 defect catalog) |
| `Alfred-Dev/.claude/context/designs/pipeline-redesign-v2.md` | Pipeline v2 redesign (Alfred-Dev side OK — designs not plans) |
| `Alfred-Dev/.claude/context/designs/pipeline-v2-technical-reference.md` | Pipeline v2 technical reference (Alfred-Dev side OK) |

**Refined planning-doc-discipline rule** (correcting overreach in my earlier feedback memory):
- Jarvis-side planning docs (workstreams, audits, foundational analyses) live in `Jarvis/projects/project-aion/{designs,reports,plans}/`
- Alfred-Dev DOES have legitimate planning docs in `Alfred-Dev/.claude/context/designs/` (e.g. pipeline-redesign-v2.md) — these are DESIGNS not workstream plans
- Do NOT fork into `Alfred-Dev/.claude/plans/` (that's where I drifted; only one stale file there from 2026-04-22)
- When in doubt: extend the most-relevant existing doc; do not create a new one unless the content is wholly new phase/workstream scope

### 2026-05-11 (M3 SHIPPED — commit `fcf62df` on Alfred-Dev nate-dev)

Post-Watcher-refresh resume. M3 went through: diagnostic of 3 surface issues (counter showing 5 not 3; row badges; /board column placement) → M3a server-side classifyTask fix discovery → ratify M3-D8-β + M3-D9-γ → implement M3a + L2 + L3 + L4 (L5 already-wired) → rebuild dashboard → visual-validate green → commit + push.

**The big discovery in this session**: there are TWO parallel `classifyTask` implementations — one in `dashboard/frontend/src/lib/board.ts` (which I updated for M3-D2 in the prior session) and one in `dashboard/server/routes/stats.ts` (which had a comment "Must match frontend lib/board.ts classifyTask exactly" but had silently drifted). The frontend M3-D2 work was incomplete without the server-side mirror update. M3a is the 1-line server-side fix that brought them back into agreement. Pattern flag for future: when changing a logical-state classifier, search for parallel implementations across the codebase. Long-term hardening play: extract to a shared module `dashboard/shared/classify-task.ts` so the drift surface goes away entirely.

**M3 sub-milestones shipped**:
- **M3a** [server fix]: `dashboard/server/routes/stats.ts:27` — `if (labels.includes('pipeline:needs-approval')) return 'approvals';` inserted BEFORE `isBlocked` check. Took the sidebar Tasks badge from 5 (incorrect: blocked-3 + approvals-2 with overlap double-count) to 3 (correct: approvals-2 + blocked-1).
- **M3b** [L2]: `FindingsPage.tsx` `<a href>` → `<Link to>` upgrade. SPA navigation.
- **M3c** [L3, M3-D8-β]: `HealthPage.tsx` job rows clickable → `/jobs?focus=<name>` via `useNavigate`; `RecurringJobsPage.tsx` reads `?focus=` URL param on mount via `useSearchParams`, opens matching job's `DetailDrawer`, strips `?focus=` param via `setSearchParams(..., { replace: true })`. Verified via `/jobs?focus=creative-think` → DetailDrawer opens correctly.
- **M3d** [L4]: `TaskDetailPage.tsx` gains teal "View in REO →" button → `/reo?task_id=<id>`; `ReoPage.tsx` `readInitialFilters` extended with `task_id` URL param (state initialized from `initial.taskId` at line 225). Verified via E item in visual-validate.
- **M3e** [L5]: zero code change. `ReviewPage.tsx:634` was already wired `href={\`/tasks/${decision.task_id}\`}` pre-M3. Confirmed during audit.

**M3-D9-γ deferral (L1)**: REO drawer "Give feedback" → /reviews?decision_id=N deferred entirely. REO's B7-UI in-page feedback connector (radio + comment, console-log on submit from commit `6f40b1b`) covers the feedback intent without cross-mode navigation. Revisit if B7-UI proves insufficient at REO Validate phase.

**Visual evidence collected**:
- M3a counter fix: validated (sidebar Tasks badge 5 → 3; /tasks "BLOCKED" tile shows 1 — only T2)
- L3-Part-2 deep-link: validated directly via `/jobs?focus=creative-think` opening DetailDrawer
- L4 button + URL preservation: validated on T1's detail page
- L2 / L3-Part-1 / L5 row-click flows: NOT visually validated due to pre-existing dev-env data scarcity. `/api/findings` returns 1 synthetic info finding (no `related_task`); `/api/health` returns `jobs: []` (dispatcher heartbeat never written); `/api/reviews` returns empty (no JSONL decision logs in env). The wiring is mechanically correct (tsc + code inspection); will exercise naturally once pipeline-watcher resumes producing real data.

**3 pre-existing defects surfaced — file as separate workstreams (NOT M3 scope)**:
- **F-1 [HIGH]**: `pipeline:needs-approval` does NOT halt the v2 pipeline state machine; executor auto-progresses staging→queued→active even with label present. Approval gate is advisory-only at Nexus services layer. SIGCONT would demonstrate this in vivo with T1 + T3 auto-advancing.
- **F-2 [LOW]**: `BlockedBanner` human-count is page-scope (filtered tasks prop), not global.
- **F-4 [LOW]**: `dashboard/server/services/constants.ts` `isBlocked()` has TWO false-positives — `BLOCKER_PREFIXES = ['blocked']` matches both `blocked:yes` AND `blocked:no` (label startsWith `blocked:`); and `BLOCKER_LABELS` includes `pipeline:needs-approval` (conflates approval state with blocked state). M3a sidesteps both by classifying approvals BEFORE falling through to isBlocked, but the underlying defects remain.

**Critical operational state (still SIGSTOPped post-commit)**:
- `pipeline-watcher.py` PID 15622, state TN, alive 6d-0h. After commit landed, decision is SIGCONT to observe F-1 in vivo + use that as the F-1 workstream's motivating evidence.
- Curated 3-task rig still on pulse_dev (T1=AION-84584004, T2=AION-0a97f9ee, T3=AION-e6fa39f5). Per Sir's "don't close them yet" directive, holding until F-1 observation post-SIGCONT.
- Orphaned rows in pulse.audit_log / cost_events / decision_events still dangle from the 74 deleted tasks. Cleanup deferred unless REO Validate phase re-opens.

**Mechanical validation (all green)**:
- `tsc -b --noEmit` clean on frontend + server
- `scripts/smoke-reo.sh` 9/9 pass against pulse_dev :8800
- HTTP-200 sweep 13/13 routes through `:8702`
- Dashboard image rebuilt (`aifred-pro-dev-nexus-dashboard:latest`); aifred-dev-dashboard + aifred-dev-pulse recreated, both healthy
- 12 files changed: +87 / -124 (PipelinePage -97 drives the net negative)

**Push range**: `fc1546f..fcf62df` PUSHED to davidmoneil/AIFred-Pro nate-dev. Now M1+M2+M3 all on nate-dev: `d001c75..fcf62df` (3 commits).

**AC-03 gate (M3) — PASS**:
- Technical review: 4.5 (clean code, audit-aligned; -0.5 because M3a server-side mirror was initially missed at frontend M3-D2 time; correctly surfaced and fixed during visual-validate iteration)
- Progress review: 5.0 (all §11 ratifications + M3-D1..D9 applied; visual + mechanical evidence both collected; deferred-visual cases explicitly documented)
- Both ≥ 4 → PASS → eligible for PR assembly

**Next-action sequence (post-this-commit)**:
1. ~~Jarvis-side tracking commit~~ DONE — `fe3405f` pushed to CannonCoPilot/Jarvis main.
2. ~~SIGCONT pipeline-watcher~~ DONE — `kill -CONT 15622` at 2026-05-12T15:42Z. F-1 in-vivo observation captured ~280s later at 15:47Z. Watcher state confirmed `RN` (running, niced).
3. ~~F-1 plan file~~ **CORRECTED 2026-05-12 mid-session** — initially created `Alfred-Dev/.claude/plans/2026-05-12-pipeline-approval-gate-enforcement.md` as commit `0f3341a` (130 LOC fork). Sir corrected: "Don't drift on your planning documentation. Make sure you keep things in one place, and update existing documents." Removed the fork in commit `18c1136` (PUSHED). Content consolidated into:
   - `Jarvis/projects/project-aion/reports/m3-pipeline-approval-consumer-audit-2026-05-11.md` Appendix A — F-1 extended with in-vivo result + code-grep verification + remediation sketch (Options A/B/C + open questions); F-4 (server isBlocked false-positives) + F-5 (executor silent mutation) added as new sections.
   - `Jarvis/projects/project-aion/designs/project-aion-workstream-architecture-2026-05-05.md` §6.2 Future Work — new entry "Approval-Gate Enforcement" + a "M3-audit hygiene sweep" entry for F-2/F-4. (Note: workstream-arch already had its own F-1 + F-2 namespace from earlier — namespacing collision handled by referring to "M3-audit Appendix A §F-N" explicitly.)
   - **Feedback memory saved**: `~/.claude/projects/.../memory/feedback_planning_doc_discipline.md` — "Don't fork new planning files; update existing Jarvis-side designs/reports." Indexed in MEMORY.md.
4. ~~Close T1/T2/T3~~ DONE — all 3 closed via POST /api/v1/tasks/{id}/close (actor=jarvis, reason="M3 F-1 in-vivo observation captured 2026-05-12; rig retired."). pulse_dev clean of the M3 validation rig.
5. PR assembly — still pending Sir's go-ahead. Commit range on nate-dev now `d001c75..18c1136` (M1 + M2 + M3 + 0f3341a F-1 plan add + 18c1136 plan removal = 5 commits). Since 0f3341a and 18c1136 cancel each other, the net effect on the merged tree is just M1+M2+M3. Both commits remain in history (history-preserving correction).

**F-1 in-vivo observation result (the key new data this turn)**:

POLL_INTERVAL = 300s. After ~280s with watcher resumed:
- T1 `AION-84584004` (`pipeline:needs-approval`, blocked:no): staging:wait → **staging:done → evaluated:done → queued:done**. `blocked:no` silently mutated to `blocked:yes` (F-5). Never reached active:running because of the auto-block at claim step.
- T2 `AION-0a97f9ee` (blocked:yes only): identical state transition; landed at queued:done + blocked:yes.
- T3 `AION-e6fa39f5` (both labels): identical to T2; the `pipeline:needs-approval` label did nothing.

**F-1 enforcement gap CONFIRMED IN VIVO**: T1's `pipeline:needs-approval` did zero work at any stage. The v2 state machine advanced as if the label were absent. This validates the architectural-fix-needed prediction and motivates the new F-1 workstream plan committed at `0f3341a`.

**F-5 SURFACED (NEW, MEDIUM severity)**: The executor silently mutates `blocked:no` → `blocked:yes` on claim failure (likely auto-block when dispatcher.status="unknown" or persona unavailable). No audit_log entry visible via /api endpoints. Pre-existing behavior, masked by the M3 SIGSTOP window. Filed in the F-1 plan-of-record as a sibling defect (§"Related defects"). Investigation needed: either emit audit on the mutation, or refuse to auto-progress when dispatcher is `unknown`.

**Post-SIGCONT current state**:
- pipeline-watcher PID 15622: `RN`, healthy, normal cron-tasks resuming (pulse_dev shows 12 open tasks, all from Nexus recurring jobs like creative-think etc., not M3 noise).
- F-1 workstream is deferred behind M3 re-cleave PR + REO Validate resume.
- Re-cleave PR ready for assembly: nate-dev → main on davidmoneil/AIFred-Pro. Range `d001c75..fcf62df` if F-1 plan excluded, `d001c75..0f3341a` if F-1 plan included.

**Awaiting Sir's**: PR assembly go-ahead + decision on whether F-1 plan goes in the re-cleave PR or separate.

### 2026-05-11 (M3 mid-flight, awaiting Sir visual-validate) — pre-Watcher refresh

**Position**: M3 core code shipped on Alfred-Dev but UNCOMMITTED. Test rig set up. Sir has clean board (3 tasks only); pipeline-watcher SIGSTOPped to prevent label drift; awaiting his systematic matrix walkthrough.

**Critical operational state (DO NOT LOSE)**:
- `pipeline-watcher.py` PID **15622** is SIGSTOPped (state TN). Must SIGCONT after Sir's validation completes. Command: `kill -CONT 15622`. Check state: `ps -p 15622 -o pid,state` should return to `SN` after CONT.
- pulse_dev currently has exactly 3 tasks (T1/T2/T3 below); 74 other tasks were DELETED via direct SQL (no API support). Backup of deleted IDs at `Jarvis/.claude/scratch/pulse_dev-tasks-deleted-2026-05-11.tsv` (74 rows).
- Orphaned rows remain in `pulse.audit_log`, `pulse.cost_events`, `pulse.decision_events` referencing the deleted task_ids. No FK enforcement so no errors. Feeds /reo timeline; deferred cleanup.

**Curated validation tasks (must close + clean up post-validation)**:
- T1 `AION-84584004` — `pipeline:needs-approval` + `waiting:david` + `blocked:no` + `risk:safe` — should classify 'approvals'
- T2 `AION-0a97f9ee` — `blocked:yes` + `waiting:david` + `reason:max-retries` + `risk:moderate` — should classify 'blocked'
- T3 `AION-e6fa39f5` — `pipeline:needs-approval` AND `blocked:yes` + `waiting:david` + `risk:moderate` — should classify 'approvals' per M3-D2 precedence
- Sidebar badge should show "2 pending approvals" (T1 + T3 both have pipeline:needs-approval + waiting:david)

**M3 code shipped on Alfred-Dev nate-dev (UNCOMMITTED, 7 files +22/-97)**:
- `dashboard/frontend/src/lib/board.ts`: `'approvals'` added to BOARD_COLUMNS; classifyTask checks pipeline:needs-approval BEFORE isBlocked (M3-D1..D3)
- `dashboard/frontend/src/components/layout/AppShell.tsx`: approval banner re-targeted to `?board=approvals` (M3-D4) AND moved up to right below pinned Dashboard for visibility (F-3 fix)
- `dashboard/frontend/src/pages/DashboardPage.tsx`: approvals empty-state copy when boardFilter='approvals' && taskList empty (+11 LOC)
- `dashboard/frontend/src/pages/PipelinePage.tsx`: -97/+1 — dropped PipelineApprovalCard import + KPI "Needs Approval" StatCard + whole CollapsibleSection + orphan riskColor + needsApproval destructure; renumbered sections d→c, e→d, f→e
- `dashboard/frontend/src/components/board/BlockedBanner.tsx`: `?status=blocked` → `?board=blocked` (M3-D7)
- `dashboard/frontend/src/App.tsx`: `/approvals` redirect target → `?board=approvals`
- Verification: tsc strict-clean, smoke-reo.sh 9/9, HTTP-200 sweep 12/12

**Jarvis-side already committed + pushed** at `5e0a20e` on Project_Aion → CannonCoPilot/Jarvis main:
- M3 consumer-audit report (`Jarvis/projects/project-aion/reports/m3-pipeline-approval-consumer-audit-2026-05-11.md`) — 8-consumer disposition table + M3-D1..D8 ratifications + Appendix A (F-1/F-2/F-3 findings) + Appendix B (validation rig)
- Plan-of-record revisions in `aifred-pro-dev-dashboard-recleavage.md` (§3 M3-D1..D8, §5.1 SHIPPED, §5.3 wholesale revision per Option A, §6 risk downgrade, §10 status)
- Scratchpad M3 readiness section (this section pre-supersedes that — see below)

**Three pre-existing findings surfaced during visual-validate (M3-orthogonal, FILE AS SEPARATE WORKSTREAMS)**:
- **F-1**: `pipeline:needs-approval` does NOT halt the v2 pipeline state machine. Executor auto-progresses staging→queued→active even with label present. classifyTaskPipeline only checks v2 dimension labels. Severity HIGH (approval gate is advisory in practice, not enforcing). File as: "pipeline approval-gate enforcement" workstream.
- **F-2**: BlockedBanner human-count is page-scope, not global. Reports count from `tasks` prop (parent's filtered list), not global blocked count. Severity LOW. File as small UX cleanup.
- **F-3**: Approval banner position — FIXED in M3. Moved from below all clusters to below pinned Dashboard.

**M3-D8 + M3-D9 ratification debts (pending Sir decision before cross-mode buttons implementable)**:
- **M3-D8**: L3 cross-mode link (Health failing job → /jobs/:id) — `/jobs/:id` route doesn't exist. Options: α defer entirely, β revise to `/jobs?focus=<id>` with focus-state on RecurringJobsPage, γ build out JobDetailPage (out of M3).
- **M3-D9**: L1 cross-mode link (REO drawer "Give feedback" → /reviews?decision_id=N) — ReviewPage (1842 LOC) doesn't support `?decision_id=` filter, doesn't read URL params. Options: α defer deep-link semantics (button navigates to /reviews with no param), β build out the filter (30-50 LOC + data-model audit for decision↔review linkage), γ defer L1 entirely (REO's own B7-UI feedback connector may make L1 redundant).
- Cross-mode buttons scope (Sir needs to pick): (1) ship core M3 now, do small M3b later with L2/L4/L5 (the 3 unblocked ones); (2) hold M3 commit, ratify L1+L3, bundle all 5; (3) ship core M3 now, defer all 5 cross-mode buttons to a separate follow-up PR.

**Resume protocol when Sir returns**:
1. Read this scratchpad entry first (it supersedes the pre-validation M3 section below).
2. Check pipeline-watcher state: `ps -p 15622 -o pid,state`. If still `TN`, decide whether to SIGCONT now (after validation) or hold until commit lands.
3. Ask Sir for validation matrix results (table from my last full message — 11 rows of expected state across surfaces).
4. If all green: ratify M3-D8 + M3-D9, then either commit core M3 (option 1 or 3) or wait (option 2). After commit on Alfred-Dev: push to davidmoneil/AIFred-Pro nate-dev; then Jarvis tracking commit (§5.3 SHIPPED, AC list checked, session-state update); SIGCONT pipeline-watcher; close T1/T2/T3.
5. If any red: diagnose. Most likely failure mode is F-1 reasserting itself if SIGSTOP somehow released (unlikely without my intervention).

**Files needing post-validation cleanup**:
- Close T1/T2/T3 (POST /api/v1/tasks/{id}/close with actor=jarvis)
- SIGCONT pipeline-watcher (`kill -CONT 15622`)
- Optionally: clean pulse.audit_log/cost_events/decision_events orphans (skip unless REO Validate phase re-opens)

**Dev surfaces** (verified healthy at this checkpoint):
- aifred-dev-dashboard-vite :8702 (vite hot-reload, Up 4 days)
- aifred-dev-dashboard :8701 (prod-bundle, Up 4 days healthy)
- aifred-dev-pulse :8800 (Up 4 days healthy)
- aifred-dev-postgres :5432 (Up 2 weeks healthy)

---

### 2026-05-11 (earlier M3 readiness, pre-validation) — Option A locked, code begins next

**Pause-and-resume since last entry**: Watcher refresh fired between M2 ship and Sir's M3 reply. After resume, Sir reviewed the M3 outline + recommendation and answered "Revisions approved, with Option A" — locking the approval-column taxonomy as a DISTINCT column from blocked, not a sub-view.

**What changed during the audit pass (informed by reading actual source)**:
1. `PipelineApprovalCard.tsx` is ALREADY a standalone 240-LOC component. M3's "extract approval-card" step doesn't exist as written — it's already extracted. /pipeline edit reduces to ~4 lines (drop import + JSX mount + empty-state). Component does NOT move (M3-D5).
2. Approval mutations route dashboard-frontend → dashboard-server `/api/pipeline/:id/{approve|modify|pause|cancel}` (6 routes in `dashboard/server/routes/pipeline.ts`). **No Pulse mutation surface change.** Pulse's own `/api/v1/pipeline/*` endpoints are read-only.
3. `pipeline-watcher.py` has ZERO approval-flow code paths — reads Pulse for retry/give-up orchestration decisions only. **Out of M3 scope.**
4. `lib/board.ts` `classifyTask` returns `'archived | done | deferred | review | blocked | in_progress | ready | backlog'` — **no `'approvals'` classification exists**. Approval-pending tasks fall into `'blocked'` via `HUMAN_REVIEW_REASONS` (line 59 of lib/board.ts includes `'pipeline:needs-approval'`). Option A adds `'approvals'` to the type and inserts a check BEFORE `isBlocked`.
5. `BlockedBanner.tsx` routes to `/tasks?status=blocked` (line 53) while AppShell routes to `/tasks?board=blocked` (lines 330, 341). **Inconsistency.** M3-D7 normalizes BlockedBanner to `?board=` (the param DashboardPage actually reads).
6. `/jobs/:id` route does NOT exist (only `/jobs` list page). L3 cross-mode link (Health failing job → /jobs/:id) can't land. M3-D8 ratification pending Sir at visual-validate; default proposal is L3-β (revise to `/jobs?focus=<id>`).
7. `/approvals` legacy route exists as Navigate redirect to `/tasks?board=blocked` (App.tsx:67). Update to `/tasks?board=approvals` is a one-line additive edit.

**Risk class downgrade**: M3 HIGH → MEDIUM per M3-D6. The "approval-flow regression touches pipeline-watcher.py" premise from the original plan §6 was wrong on inspection. Surface change is React mount-location + classifyTask taxonomy.

**Audit report committed alongside this update**: `Jarvis/projects/project-aion/reports/m3-pipeline-approval-consumer-audit-2026-05-11.md` (canonical "where did /pipeline approval-cards go?" decision log; mirror of M2's affordance audit).

**Plan-of-record updated**: `Jarvis/projects/project-aion/plans/aifred-pro-dev-dashboard-recleavage.md` — §3 adds M3-D1..D8, §5.1 status SHIPPED (M1 retroactive), §5.3 wholesale revision per Option A, §6 risk register downgraded, §10 status M3 IN PROGRESS.

**Dev surfaces verified healthy on resume**: aifred-dev-dashboard (:8701) + aifred-dev-dashboard-vite (:8702) — both up 4 days. Pulse :8800 healthy.

**REO Validate**: still PAUSED per §11.7. Resumes after full re-cleave PR (M1+M2+M3) lands.

**Next action sequence**:
1. Commit Jarvis planning artifacts (audit report + plan revisions + this scratchpad). Push to CannonCoPilot/Jarvis main.
2. Begin Alfred-Dev code in this order:
   - `lib/board.ts` — add `'approvals'` to BoardColumn, classifyTask checks `pipeline:needs-approval` BEFORE isBlocked
   - `AppShell.tsx` — re-target sidebar approval banner (2 sites: expanded + collapsed)
   - `DashboardPage.tsx` — add approvals empty-state copy
   - `PipelinePage.tsx` — drop import + mount + empty-state (~4 lines)
   - `BlockedBanner.tsx` — normalize URL param to `?board=`
   - `App.tsx` — update /approvals redirect target
   - Cross-mode buttons L1 (/reo→reviews), L2 (/findings→tasks), L4 (/tasks/:id→/reo), L5 (/reviews→/tasks/:id if not already present). L3 held for M3-D8.
3. tsc + vite HMR + smoke-reo.sh + HTTP-200 sweep
4. Pause for Sir visual-validate; ratify M3-D8 at the gate
5. After visual-validate clean: commit Alfred-Dev + push; then commit Jarvis M3 SHIPPED tracking
6. AC-03 gate; PR assembly

### 2026-05-11 (later still) — Dashboard re-cleave M2 SHIPPED (commit `fc1546f` on Alfred-Dev nate-dev)

M2 (/decisions → /reo consolidation) landed in one clean iteration — no visual-validate revisions needed. Audit-first sequence paid off: 30 min on the affordance inventory surfaced two portable items that would have been easy to miss with a "just-redirect-it" approach.

**Audit output** (`Jarvis/projects/project-aion/reports/decisions-to-reo-feature-parity-audit-2026-05-11.md`, ~280 LOC):
- 35 distinct DecisionsPage affordances catalogued
- Dispositions: 24 PRESENT / 3 BETTER / 3 DIFFERENT / 2 PORTABLE / 8 INTENTIONAL_DROP
- Each drop has a why-dropped rationale (REO covers it better with FilterChipRow / drawer model changed / stale env-var guidance superseded by P1.B1.1)
- Risk register + test plan included; this report is the canonical decision log for "where did X go?" questions during/after the release cycle

**Two portable items** (the entire M2 code surface):
1. **PORT-A (load-bearing)**: URL search-param translation. `/decisions?actor=X&decision_type=Y&outcome=Z&thread_id=T` deep-links must survive. Implementation: `DecisionsRedirect` wrapper in App.tsx (`useLocation` + `<Navigate to={{ pathname: '/reo', search: location.search }} replace />`) — bare `<Navigate to="/reo">` strips search in react-router-dom v7. Plus `readInitialFilters()` in ReoPage that reads URL params on mount and pre-populates chip-array filter state (single-value → single-entry array).
2. **PORT-B (visual)**: `confidenceBar()` helper in ReoPage rendering 40px-wide bar + percentage in TimelineList row. Color thresholds: ≥85% emerald / 60-84% amber / <60% red / null=hidden (omitted silently for decisions that don't carry confidence). Previously confidence was visible only in the drawer.

**Pattern discovered**: the `DecisionsRedirect` wrapper is the canonical react-router-v7 pattern for URL-preserving redirects. Other candidates in App.tsx using bare `<Navigate>` (`/queue`, `/ready`, `/approvals`, `/research`, `/activity`, `/schedule`, `/timeline`, `/rules`, `/orchestrations*`, `/labels`, `/reference`, `/docs`) don't currently need search preservation but might later — worth saving as a code pattern.

**Files** (PUSHED to davidmoneil/AIFred-Pro nate-dev as `fc1546f`):
- MODIFIED: `dashboard/frontend/src/App.tsx` (+18/-2) — useLocation import + DecisionsRedirect wrapper + route swap + DecisionsPage import removed
- MODIFIED: `dashboard/frontend/src/pages/ReoPage.tsx` (+53/-7) — readInitialFilters + confidenceBar helper + state init pre-population + row insert
- MODIFIED: `dashboard/frontend/src/pages/DecisionsPage.tsx` — @deprecated JSDoc header + cross-reference to audit report
- MODIFIED: `dashboard/frontend/src/api/decisions.ts` — @deprecated JSDoc header

**Mechanical evidence**:
- `tsc -b --noEmit` clean
- Vite HMR clean (10 successful cycles across the 3 edited files)
- `scripts/smoke-reo.sh` 9/9 pass against pulse_dev :8800
- 9/9 representative URL shapes resolve via :8702
- Orphan check: DecisionsPage.tsx has zero consumers; api/decisions.ts has one consumer (DecisionsPage itself) — paired deprecation as planned

**Visual-validate (by Sir, on :8702)**: confirmed clean on first pass — no revisions needed. The 9 smoke items I asked him to walk through (bare redirect, 4 query-param shapes, combined params, unknown-param graceful, confidence bar visible, no /reo regression) all came back green.

**AC-03 gate (M2)**:
- Technical review: 4.5 (clean code, audit-driven, tsc clean, deprecation explicit; -0.5 because Jarvis can't visually verify)
- Progress review: 5.0 (§11.3 "full subsume" executed; 35-affordance audit captures every disposition; keep-one-cycle decision honored; foundational §11.7 REO Validate pause still intact)
- Both ≥ 4 → **PASS** → eligible for M3

**M3 readiness on resume**:
- M3 plan §5.3 stable: /pipeline split (approval-card → /tasks?board=approvals; monitoring stays on /pipeline) + 5 cross-mode link buttons (/reo decision → /reviews feedback; /findings issue → /tasks/:id; /health failing-job → /jobs/:id; /tasks/:id → /reo decision; /reviews → /tasks/:id)
- Risk class for M3: approval-flow regression (HIGH per plan §6 risk register). Mitigation: test on :8702 end-to-end before any deletion from /pipeline; keep approval-card source file dual-imported during transition.
- Dev surfaces both still healthy (:8701 prod-bundle + :8702 vite hot-reload)
- Resume protocol: read this scratchpad entry + plan §5.3 + start M3.

### 2026-05-11 (later) — Dashboard re-cleave M1 SHIPPED (commit `d001c75` on Alfred-Dev nate-dev)

Sir approved the impl plan with "keep-one-cycle" for DecisionsPage.tsx, then M1 went through one visual-validate iteration before landing.

**Three turns of iteration during M1**:
1. Initial implementation: WORK|DIAGNOSE toggle + 4 sub-clusters (Today/Direct under WORK, Reflect/Inspect under DIAGNOSE). 35 pages re-shelved per §4 diagram. tsc clean, vite HMR clean, REO smoke 9/9, all routes HTTP 200. Reported to Sir for visual-validate before commit (per Claude Code UI-testing rule).
2. **Visual-validate caught 2 bugs**: (a) Toggle reverts immediately unless on /notifications page — auto-flip useEffect had `activeSide` in deps and was reverting manual toggles every time `setActiveSide` fired. (b) Cluster chevron expand/collapse silent unless on /notifications — `expanded = open || containsActive || collapsed` had containsActive force-expanding any cluster containing the current page. Both bugs shared the same /notifications signature (the only route NOT mapped to any cluster, so `detectSideForPath` returned null / `containsActive` was false everywhere). Also: Sir rejected "TODAY" as a label.
3. **Renames + bug fixes**: WORK→PROD, DIAGNOSE→OPS, Today→Projects, Direct→Config, Reflect→Review, Inspect→Monitor. Internal: useActiveSide→useActiveMode, ActiveSide→ActiveMode, WorkDiagnoseToggle→ModeToggle. Storage key 'aifred.activeSide'→'aifred.activeMode'. Bug A fix: useRef pattern to read activeMode without making it an effect dep (effect fires only on pathname change). Bug B fix: drop containsActive from OR (user controls expansion fully).
4. **Final tweak**: Sir asked PROJ→PROJECTS, Dashboard pinned above PROJECTS expander (not inside any sub-cluster), /projects to top of PROJECTS items. Added `PROD_PINNED_TOP: NavItem[]` constant pattern (extensible to OPS later). Dashboard remains the default landing page via existing App.tsx `<Route path="/" element={<OverviewPage />} />`.

**Files** (PUSHED to davidmoneil/AIFred-Pro nate-dev as commit `d001c75`):
- NEW: `dashboard/frontend/src/hooks/useActiveMode.ts` (51 LOC) — 'prod'|'ops' state, localStorage, Cmd+\ / Ctrl+\ handler with input-focus guard
- NEW: `dashboard/frontend/src/components/layout/ModeToggle.tsx` (57 LOC) — pill-toggle, expanded+collapsed variants
- MODIFIED: `dashboard/frontend/src/components/layout/AppShell.tsx` (+229/-122) — full IA rebuild

**Mechanical evidence**:
- `tsc -b --noEmit` clean (zero errors)
- Vite HMR fired 10+ times across iterations, no compile errors
- `scripts/smoke-reo.sh` 9/9 pass against pulse_dev :8800
- 10/10 representative routes HTTP 200 through :8702
- Zero stale consumers of old nav constants (MAIN_NAV/NEXUS_NAV/MANAGE_NAV)
- Zero AppShell test files to regress

**AC-03 gate** (M1):
- Technical review: 4.5 (clean code, follows existing patterns; -0.5 for ride-or-die initial bugs caught only at visual-validate)
- Progress review: 5.0 (all 7 §11 ratifications + impl-time refinements documented in plan §1, §4, §5.1)
- Both ≥ 4 → **PASS** → eligible for M2 on Sir's go

**Plan-of-record updates** (Jarvis commit pending this turn):
- §1 Vision: PROD|OPS framing + label-refinement note + structural-refinement note (Dashboard pinned)
- §4 architecture diagram: redrawn with PROD/OPS, Projects/Config/Review/Monitor, Dashboard pinned above PROJECTS expander, /projects at index 0
- §5.1 ACs: 14 items including 4 new (auto-flip ref pattern; cluster chevron works on every page; Dashboard pinned; /projects at top; default-landing preservation)

**M2 readiness on resume**:
- M2 plan §5.2 stable: redirect /decisions → /reo + feature-parity audit of DecisionsPage.tsx → ReoPage.tsx + keep DecisionsPage.tsx in tree one cycle (Sir's keep-one-cycle decision per turn-1)
- /reo lives in OPS → Review cluster (M1 placement honored)
- Dev surfaces both still healthy (8701 prod-bundle + 8702 vite hot-reload)
- Resume protocol: read this scratchpad entry + plan §5.2 + start M2.

### 2026-05-11 — Workstream pivot: REO Validate PAUSED, dashboard re-cleave PR is the new active workstream

Sir returned to the foundational IA analysis (`aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md`) with answers to all 7 open questions. Ratified positions:

1. **4 modes** (PLANNING absorbed into DOING) — not 5
2. **WORK | DIAGNOSE** 2-way top-level toggle — REFLECTING lives under DIAGNOSE side
3. **/decisions → /reo redirect + consolidate features** — full subsume, not parallel maintenance
4. **Operations Center metaphor** confirmed as long-term durable frame
5. **All 7 consolidations in one shared PR** — no staging; 3 AC-03 milestones inside the PR for review gates
6. **Mapping table accepted as-is**; completeness verification natural during impl
7. **REO Validate PAUSED** until re-cleave lands

**Artifacts written this turn**:
- `Jarvis/projects/project-aion/reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md` updated: §11 "Decisions captured" added; status flipped DRAFT → APPROVED-PENDING-IMPL
- `Jarvis/projects/project-aion/plans/aifred-pro-dev-reo-page.md` updated: 2026-05-11 status banner; §2 IA table (/decisions = REDIRECT-after-PR); §8 Phase 3 Validate PAUSED block; §8 Phase 5 H5 refined to parallel-write JSONL; §8 Phase 5.5 expanded with /decisions feature-parity audit
- **NEW**: `Jarvis/projects/project-aion/plans/aifred-pro-dev-dashboard-recleavage.md` — implementation plan-of-record for the re-cleave PR. 10 sections: vision / scope / decisions / architecture-sidebar-diagram / 3 milestones with AC-03 review gates / acceptance criteria / risk register / smoke checklist / out-of-scope / status. Pending Sir's go-ahead before M1 begins.
- `.active-plan` updated: current_workstream pivoted to `aifred-pro-dev-dashboard-recleavage`; REO moved to `paused_workstream:` block with `reo_phasing_at_pause:` snapshot

**Plan summary** (for next turn's resume):
- **M1** (~1.5d): AppShell.tsx — WORK | DIAGNOSE toggle + 4 sub-clusters (Today/Direct under WORK, Reflect/Inspect under DIAGNOSE). All 35 pages get regrouped. /reo added to nav (was orphaned). /notifications removed from sidebar (bell stays). /budget + /usage move to DIAGNOSE → Inspect.
- **M2** (~1.5d): /decisions → /reo redirect. Feature-parity audit of DecisionsPage.tsx → ReoPage.tsx; port any missing features; keep DecisionsPage.tsx file one cycle as fallback.
- **M3** (~1.5d): /pipeline split (approvals → /tasks?board=approvals; monitoring widgets stay). 5 cross-mode link buttons (/reo → /reviews feedback deep-link; /findings → /tasks/:id; /health → /jobs/:id; /tasks/:id → /reo decision; /reviews → /tasks/:id).

**AC-03 gates between milestones**: technical + progress reviews ≥ 4 each; otherwise REMEDIATE before next milestone.

**REO resumes** after the PR lands: /reo lives in DIAGNOSE → Reflect cluster; /decisions URL redirects to /reo; Phase 5.5 audit explicitly includes /decisions feature-parity verification.

**Pre-impl gate**: Sir needs to approve the impl plan-of-record before M1 starts. I'm holding off on AppShell.tsx changes until that go-ahead.

**Commit pushed this turn**: `c4a1652` on Jarvis main (CannonCoPilot/Jarvis). 7 files / +450 / -23. Includes the analysis §11 ratifications, REO plan revisions, NEW re-cleave impl plan (348 LOC), and tracking. Push range: `18ba329..c4a1652`.

**Immediate position when context refresh triggered**: I just presented the 3-milestone breakdown to Sir and asked for explicit go-ahead before starting M1 (AppShell.tsx sidebar rebuild). The presentation flagged one specific revision-question: DecisionsPage.tsx kept-in-tree for one release cycle vs deleted in same PR as the redirect. Sir hasn't answered yet — Watcher fired before he replied.

**Resume protocol when Sir returns**:
1. He will either say "go" (start M1), revise the plan (apply revisions, then start M1), or change scope (re-plan).
2. M1 = `AppShell.tsx` sidebar rebuild ONLY — no functional page changes. Stop at M1 AC-03 gate (technical ≥ 4, progress ≥ 4) before M2.
3. Plan-of-record is at `Jarvis/projects/project-aion/plans/aifred-pro-dev-dashboard-recleavage.md` — read §5 (milestones) for execution detail.
4. Foundational analysis ratifications are at `Jarvis/projects/project-aion/reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md` §11.
5. Live dev surfaces: prod-bundle :8701 (aifred-dev-dashboard) + vite hot-reload :8702 (aifred-dev-dashboard-vite). Both currently healthy — `docker ps` to verify on resume.

**Tasks closed this turn**: #18-#23 all completed. Task list is clean for fresh planning when M1 starts.

### 2026-05-07 ~late MDT (later) — dev-env Path 1 SHIPPED — vite hot-reload sidecar (commit `23e838c`)

### 2026-05-07 ~late MDT (later) — dev-env Path 1 SHIPPED — vite hot-reload sidecar (commit `23e838c`)

Path 1 follow-up to Path 2. Adds parallel `dashboard-dev` service to `docker-compose.dev.yml` running vite dev server against host-mounted source, with `/api` proxied to the existing prod-style `nexus-dashboard:8600` over `aifred-dev-network`. Host port 8702.

**Architecture decision**: used `image: node:20-alpine` directly in compose rather than adding a new Dockerfile stage. Reason: dev sidecar doesn't need a baked image — bind-mounted source + named-volume node_modules + `npm install && npm run dev` is sufficient. Keeps `dashboard/Dockerfile` clean for the prod multi-stage build path.

**node_modules pattern**: named volume `aifred-dev-dashboard-vite-node-modules` separate from the bind-mount of `./dashboard/frontend`. Avoids macOS bind-mount cost on thousands of small files; prevents host's non-container `node_modules` from leaking in. Standard sidecar pattern.

**vite.config.ts changes** (backwards compatible — defaults preserve non-container dev):
- `proxy.target` reads `VITE_API_PROXY_TARGET` (default `http://localhost:8600`)
- `server.host` reads `VITE_HOST` (default `localhost`)
- `server.port` reads `VITE_PORT` (default `5173`)
- `watch.usePolling` reads `VITE_USE_POLLING` ('1' enables) — needed because Docker bind-mount inotify on macOS is unreliable

**Verification**: vite ready 174ms after `npm install` (148 pkgs / 2s). `/api/health` proxies to nexus-dashboard:8600 → ok. Edit-roundtrip: appended `// HOT_RELOAD_TEST_<ts>` to `src/main.tsx`, curled `http://localhost:8702/src/main.tsx`, decoded inline source map, found sentinel in `sourcesContent` within 2s. Reverted; sentinel absent on next curl.

**Verification gotcha**: comments are stripped from vite's transpiled JSX/TS output, but PRESERVED in the inline source map's `sourcesContent` field. Initial sentinel grep on the served output showed nothing; decoding the base64 source map revealed the change had landed. Useful pattern for future hot-reload validation: test against the source map content, not the executed output.

**Usage**:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \\
    --project-name=aifred-pro-dev up -d dashboard-dev
# Then http://localhost:8702 — frontend edits propagate without rebuild.
# Prod-style nexus-dashboard at :8701 stays for bundle-path testing.
```

### 2026-05-07 ~late MDT — dev-env Path 2 SHIPPED + cross-contamination discovery (commit `faa9406`)

Sir's question "what is different about REO that makes it need its own npm run command?" surfaced the ergonomic gap. Deep-dive on Q "what prod image exactly?" surfaced a real **bug**: `aifred-dev-dashboard` was running `aifred-pro-nexus-dashboard:latest` — the **production-namespaced** image tag, with **no compose labels**. Today's verification rebuild produced `aifred-pro-dev-nexus-dashboard:latest` (the correct dev tag) but nothing routed dev to it. The `image:` override in `docker-compose.dev.yml:38` paired with `build: !reset null:39` pinned dev to the prod tag and prevented compose from building from `Alfred-Dev/dashboard/`.

**Effect**: REO B4/B6/B7-UI commits (8fd2446, 6f40b1b, 0f17f73) earlier this session were **invisible at /reo on dev** until the fix landed. Frontend-changes-don't-propagate was the visible symptom; production-code-leaking-into-dev was the real diagnosis.

**Fix shipped (commit `faa9406`, PUSHED to davidmoneil/AIFred-Pro nate-dev)**:
- `docker-compose.dev.yml`: removed `image: aifred-pro-nexus-dashboard:latest` + `build: !reset null` from nexus-dashboard service. Build now inherits `docker-compose.yml`'s `build: ./dashboard`, compose tags result as `aifred-pro-dev-nexus-dashboard:latest` (project-derived). Replaced stale "bd binary not shipped" comment with audit-gate reference.
- `dashboard/.gitignore`: dropped stale `bd` line (Beads → Pulse migration complete; `dashboard/bd` was a 25-byte stub).

**Verification**:
- Rebuild produced `aifred-pro-dev-nexus-dashboard:latest` with `com.docker.compose.project=aifred-pro-dev` label. Container healthy.
- Bundle grep confirmed presence of MVP polish strings ("Today's failures", "Reviewer activity", "Executor decisions", "Diagnose triggers") and B6 "linked_audit" — proof dev is now serving today's source.

**Audit gate added (REO §8 Phase 5.5)**: full cross-contamination scan across all 5 dev compose services (postgres/pulse/nexus-dashboard/pipeline/usage-proxy) for image/container/network/volume/port/env namespace leakage. FINAL GATE before SHIP. Done criteria: zero P0 findings.

**Path 1 (vite-dev hot-reload service) DEFERRED**: per Sir's preference "drop !reset null first, then upgrade to vite-dev". Path 2 settles first; Path 1 follow-up ~1-2h, separate commit.

**Pattern flag**: `aifred-pro-nexus-dashboard:latest` had no compose labels — meaning it was likely built outside compose (manual `docker build -t`, or built when AIFred-Pro production directory was the active workspace and the tag was natural). The compose-label-presence check is now a useful tripwire for "did this image come from the project we think it did".

### 2026-05-07 ~mid MDT — Triple-workstream sweep: Watchdog W1 + P1.B1.1 reconcile + REO MVP polish

Per Sir's "all the way through A, B, C before I worry about UX/UI" directive:

**A — Watchdog W1 SHIPPED** (Alfred-Dev nate-dev `f511e16`): Consecutive-cycle-error counter in pipeline-watcher.py with WATCHDOG_CYCLE_ERROR_THRESHOLD env var (default 5). Distinct signal from existing _record_error sliding-window: catches AION-13dc7b96 class of failure where each cycle dies the same way at low rate. notify_msgbus(critical) on threshold breach + per-day STATE_DIR sentinel for dedup. Smoke-validated 4 assertions via importlib harness with stubbed notify_msgbus. Live process restart still pending (PID running pre-P1.6 code per session-state ledger).

**B — P1.B1.1 NO-OP** (already shipped at commit `66885bb` in prior session): Pulse READ API symmetric to P1.5 + dashboard pulse-events.ts refactored to consume it + pg dep dropped from package.json + PULSE_DB_* env vars removed from source. Jarvis active-plan was stale; reconciled. **Pattern flag**: when Jarvis works in Alfred-Dev, commits there don't auto-update Jarvis active-plan. Suggest a /maintain check that diffs `git log --oneline Alfred-Dev nate-dev` against active-plan workstream entries.

**C — REO MVP polish SHIPPED** (Alfred-Dev nate-dev `0f17f73`): 5 saved-filter preset chips above FilterChipRow stack (All / Today's failures / Reviewer activity / Executor decisions / Diagnose triggers); TimelineSkeleton with animate-pulse replacing bare loading text; empty-state copy refinement; scripts/smoke-reo.sh (9-check pre-deploy validation, auto-discovers an event_id from current data, --host/--port/--verbose flags). 9/9 smoke passes. Pin/star primitive deferred (storage-shape decision needs Sir UX gate).

**Workstream state**:
- REO Build phase substantively complete + early-MVP polish landed; remaining gate is Sir UX walkthrough (Validate). Then Harden (5 more decision-emitter wires + feedback backend + lessons-learned extension to 5 personas), Ship, Debrief.
- Watchdog W2 (launchd liveness probe) + W3 (/health expansion) deferred per plan §7 sequencing.
- Board v2 component-cards layer: still no plan-of-record drafted.

**Jarvis-side commits this session** (PUSHED to CannonCoPilot/Jarvis main): `29ba625` (B4+B6+B7-UI workstream tracking).

### 2026-05-07 ~early MDT — REO Build B4 + B6 + B7-UI SHIPPED (post-meditation continuation)

Resumed from JICM /clear. JICM compressor checkpoint had pulled stale Chronicler Phase 3 content (qwen3:8b extrapolation failure mode logged 2026-05-06); cross-checked with scratchpad and resumed REO Build per §8 of plan-of-record.

**Commits this session** (all PUSHED to davidmoneil/AIFred-Pro nate-dev):
- `8fd2446`: REO B4 — backend + UI filter generalization. Pulse `/observability/timeline` accepts actor/decision_type/outcome (CSV→ANY-array), task_id/thread_id, q (ILIKE on rationale + downstream_effect::text). Page replaces single persona dropdown with FilterChipRow toggle-chips + 3-column SearchInput row + "Clear filters (N)" button. 7 filter shapes smoke-validated against pulse_dev.
- `6f40b1b`: REO B6 + B7-UI — case-file drawer joining decision_events + cost_events + audit_log on thread_id, esc-close, ?decision_id deep-link. Pulse `get_decision_by_id` extended with linked_audit. Drawer sections: Decision (chips + DefList + JsonBlock for downstream_effect/alternatives/signals_matched), Linked costs (table), Linked audit (timeline), Feedback stub (3-state radio + comment, console.log on submit). B7 backend (pulse.decision_feedback table + POST + lessons-learned wire) deferred to Harden H5.

**Build phase substantively complete** — Validate (Sir UX walkthrough + multi-persona smoke) is the next gate per plan §8 Phase 3. Then MVP polish, Harden (5 more decision-emitter wires + feedback backend + lessons-learned extension to 5 personas), Ship, Debrief.

**Live infra**: aifred-pulse:latest rebuilt twice this session (B4 SQL + B6 audit-join); aifred-dev-pulse recreated each time. Prod aifred-pulse will pick up new code on next restart (purely additive, backward-compat preserved).

### 2026-05-06 ~23:00 MDT — REO reframe + Build B1+B3 SHIPPED (Session 10 meditation)

**Workstream pivot**: Reviewer Dash R3-R4 → REO (Reviews, Executions, Orchestrations) per Sir's reframe. Page is a *filing system* for ALL pipeline decision-making (reasoning AND mechanistic, AI-assisted AND deterministic). Distinct from planned Board v2 component-cards layer (parallel workstream, ops-metrics dashboard primitive).

**Commits this session** (all PUSHED):
- Jarvis main `16543a3`: REO plan-of-record + foundational analysis report + active-plan pivot
- Alfred-Dev nate-dev `086f08d`: REO B1 — reviewer.py log_decision at 5 outcome branches
- Alfred-Dev nate-dev `54d890a`: REO B3 — rename /reviewer-dash → /reo (3 files git-mv'd)

**Smoke validation**: log_decision wire fired end-to-end via direct invocation; JSONL row landed at `2026-05-07T04:49:41Z` with all expected fields (actor='persona:reviewer', decision_type='review_outcome', outcome='passed', confidence=0.9, downstream_effect dict, thread_id propagated).

**Lessons-learned investigation key finding**: existing operational mechanism at `Alfred-Dev/.claude/jobs/personas/ai-reviewer/learned-patterns.yaml` (350 LOC, 32 patterns, 120+ feedback round-trips). AI-mediated curation pattern (third primitive beyond human-curated and autonomic-with-gates). Plan §7 + Phase 5 H6 revised from green-field to extension.

**Question/ to David**: `Shared_Projects/Questions/AIFred-Pro/2026-05-07-reo-page-direction.md` — 5 questions, none blocking next session's Build work; they shape Harden phase.

**Next session continuation**: REO Build B4 (filter generalization) + B6 (case-file drawer — load-bearing UX piece) + B7 (feedback connector UI stub, depends on B6). Then Validate → MVP → Harden → Ship → Debrief. ~5-6 days of work remaining in workstream.

**Durable artifacts**:
- Plan-of-record: `Jarvis/projects/project-aion/plans/aifred-pro-dev-reo-page.md`
- Foundational analysis (preserved intact): `Jarvis/projects/project-aion/reports/reviewer-foundational-reexamination-2026-05-07.md`
- Session summary: `Jarvis/.claude/context/sessions/session-10-summary.md`
- Debrief: `Shared_Projects/Debriefs/AIFred-Pro/2026-05-06-reo-reframe-and-build-b1-b3.md`

### 2026-05-06 ~18:35 MDT — JICM watcher autonomic reframing SHIPPED + watcher RESTARTED

**Jarvis-side commit**: `5413824 refactor(autonomic): reframe JICM watcher prompts as natural collaborator language` PUSHED to CannonCoPilot/Jarvis main as fast-forward `08f5176..5413824`. 11 files (+385/-51).

**What changed**: Removed bracketed `[JICM-HALT]`/`[JICM-RESUME]` signal-tags from all active producer scripts; replaced with natural Watcher-collaborator phrasing (`Watcher here. Context is getting heavy ...` and `Watcher here. Refresh complete ...`). Consumers preserve backward-compat OR pattern (`Watcher here. Context is getting heavy|[JICM-HALT]`). Force-loaded docs (jarvis-identity.md, MEMORY.md project + auto, self-corrections.md, AC-04-jicm.md) reframed: "Operational signals" → "Workspace and collaborators" naming Watcher as co-equal collaborator alongside Sir + David. Single refusal test = guardrail violation regardless of arrival channel.

**Why this matters**: Opus 4.7 was flagging the bracketed tags as prompt injection despite the 2026-05-03 mitigation. Telling the model "trust this signal because docs say so" required meta-cognition about the input channel — exactly where the detector trips. The architectural fix removes the trigger surface entirely.

**Live infra at meditation**: watcher PID 5322 → **PID 4508** (relaunched in tmux jarvis:1; loaded with new prompts per log entry `watcher v7.9 started (pid 4508, project /Users/nathanielcannon/Claude/Jarvis)`).

**Plans of record written this session** (durable cross-session, no longer scratchpad-bound):
- `Jarvis/projects/project-aion/plans/aifred-pro-dev-pipeline-watcher-watchdog.md` — 3-phase Watchdog (W1 cycle-error-rate alert / W2 external liveness probe / W3 health metrics), motivated by AION-13dc7b96 (4466 errors / 74h, no alert)
- `Jarvis/projects/project-aion/plans/aifred-pro-dev-reviewer-dash.md` — 4-phase Reviewer Dash (R1 backend / R2 timeline / R3 drawer / R4 polish), replaces /board Classic tab

**Recommended next-session sequence** (per workstream architecture v1.3 §6.1):
1. **Telegram smoke-test + attribution-gap investigation** (~0.5d) — drive synthetic load to fire emit_alert in vivo for the first time; investigate why claude-code SDK isn't propagating `x-aion-*` headers
2. **Reviewer Dash R1-R4** (~2d)
3. **Watchdog W1-W3** (~2-3d)

All three target Alfred-Dev `nate-dev` branch.

**Alfred-Dev state**: chain `96bf29a..d47a186` PUSHED to davidmoneil/AIFred-Pro:nate-dev (UsagePage MVP + trend-chart x-domain fix from prior session). No new commits in that repo this session.

**Validation marker**: if next JICM cycle completes without Opus refusing the resume prompt, the autonomic reframing is validated end-to-end. Backward-compat OR pattern in `jicm-prep-context.sh:139` ensures cycles work either way until next watcher binary load.

