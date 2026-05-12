# Comprehensive Review — Alfred-Dev + Jarvis Work (2026-04-21 → 2026-05-04)

**Generated**: 2026-05-04
**Window**: 14 days (workspace reorganization through HEAD on both sides)
**Scope**: All Jarvis (Project_Aion + Jarvis-Dev branches), all Alfred-Dev (`nate-dev`), all ProjectIntel debriefs and questions
**Source reports** (preserved verbatim in `.claude/scratch/aifred-pro-dev-review/`):
- `jarvis-side-2026-05-04.md` (435 lines, Agent A)
- `aifred-pro-dev-side-2026-05-04.md` (365 lines, Agent B)
- `projectintel-collaboration-2026-05-04.md` (181 lines, Agent C)

This document is the canonical synthesis. The next phases (2-5) operate from this baseline.

---

## 1. Executive Summary

Two-and-a-half weeks of stacked work across two workspaces (Jarvis + Alfred-Dev) and two-tier methodology (token-compression initiative + JICM v7.9 architecture) have produced four shippable initiatives that converge on a single architectural decision now awaiting David O'Neil. **The dominant deliverable is Pipeline v2** (45 commits on `nate-dev`, 19 of them direct pipeline rebuilds), implementing webhook-driven 6-dimensional Pulse orchestration with 5 dedicated Python services and end-to-end telemetry. **The supporting deliverables**: (1) Token-compression Phases 1.1–1.3.5 deployed on Alfred-Dev with full pre-registration discipline; (2) JICM v7.9 promoted to Jarvis production with Stage-1 CLEAR (slim watcher, Approach C cutover, sensing-layer hooks); (3) Two-Stage Validation Gating pattern formalized as a first-class Jarvis pattern; (4) ProjectIntel collaboration structure operational and exercised through 4 substantive debriefs. **The architectural decision** the milestone commit is now staging: David picks Path A (Replace), Path B (Selective adoption), or Path C (Park as experimental) — the 2026-05-02 strategic debrief framed all three. Both workspaces are in clean, near-shippable state: Jarvis production is 1 commit ahead of `origin/main`, `nate-dev` HEAD `af73a46` is clean. **Critical timing**: Phase 1.3.5 Stage-1 verdict draft is due tomorrow night MDT (2026-05-04 ~17:04 MDT) — this lands during or just after the milestone work and is the gate David's debrief was waiting on.

---

## 2. Timeline at a Glance

| Week | Jarvis-side milestones | Alfred-Dev milestones | Collaboration |
|------|------------------------|---------------------------|---------------|
| **W1: 2026-04-21 → 2026-04-27** | Workspace reorg complete; ProjectIntel-ops skill v1.1; v7.3 JICM in production; Token-compression scaffolding (roadmap v3, multi-pass architecture) | `nate-dev` branched from `main` at `dfd40c5` (2026-04-22); workspace setup, hooks, context docs imported; Pipeline-redesign-v2 design doc (1100 lines) + foundation commit `fdc8466`; Dashboard dev overlay on port 8701 | Debrief 2026-04-23 (workspace + usage metrics vision); Question 2026-04-21 answered 2026-04-22 (workspace, branch workflow) |
| **W2: 2026-04-28 → 2026-05-04** | Token-compression Phases 0.2–0.5 (telemetry, register filter, pipeline-extractor); Phase 1.1 deploy + Phase 1.4 result; Two-stage gating pattern formalized (e3fdc6d); Git topology migration to CannonCoPilot/Jarvis (4b69b2b); JICM v7.9 hook layer + Stage-1 harness (Jarvis-Dev); JICM v7.9 hooks+sensing deployed to production (57cb3ed, Stage-1 CLEAR); slim watcher promoted (2a559b5, Approach C); Phase 2 CoD architecture frozen (313df6f, fe61041); Stage-1 deploy of `cod-inject.sh` (2de41e5); Phase 2.1.b stratified baseline (ea2488a) | Pipeline v2 hardening (atomicity, crash recovery, chain dependencies, telemetry, filesystem verification, path validation) — 16 commits; Dashboard live monitoring (b86b46c), Activity Timeline + Dependency Chain (811734d, d45e943); Project Creator chat UI + streaming v2 (a1b648a, a4ff87e); Token-compression deploys: Phase 1.5 Alfred-Brief (c31b2bd), Phase 1.2/1.3 brief epilogues (f15f6a2), Phase 1.3.5 reviewer Claude-CLI route (af73a46) | Debriefs 2026-04-24 (usage tracking phase 3, telemetry vision); Question 2026-04-25 answered directly by David (dashboard priority, AI Reviewer first); Comprehensive strategic debrief 2026-05-02 (Pipeline v2 + token-compression + JICM v8 + two-stage gating + replace-or-evolve framing) |

---

## 3. Workstream Inventory

### 3.1 Pipeline-Redesign-v2 (Alfred-Dev) — DOMINANT

**Scope**: Replace AIFred-Pro's prior orchestration (single dispatcher + executor.sh shell loop) with a Python-first service mesh. Six-stage state machine (`intake → evaluate → route → queue → execute → review`) governed by webhook-driven Pulse label transitions.

**Architecture** (per `.claude/context/designs/pipeline-redesign-v2.md`):
- 5 services: `stage.py` (classifier), `evaluate.py` (risk/capability scorer), `orchestrate.py` (dependency + chain resolver), `executor.py` (Ollama + Claude-CLI router), `reviewer.py` (approval + telemetry)
- 6 Pulse metadata dimensions: `status`, `stage`, `labels`, `metadata.telemetry`, `metadata.review_telemetry`, `metadata.orchestration`
- Atomic label operations; PID locking; per-stage ownership
- 77 hardening tests passing as of 7731920

**Status**: Functionally complete + hardened. All 16 sections of `Observed-issues.txt` audit closed. Stress test (220 cycles, 118 triggers) passed. Smoke-tested across happy-path, decomposition, safety-block, unclear, deliberate-fail, and chain-parent/child cases. Stable HEAD at `af73a46`.

**Outstanding items** (will be re-tested in Phase 2):
- `dashboard/frontend/src/lib/board.ts` BLOCKER_LABELS still missing `waiting:human` — UI correctness defect noted in pipeline-redesign-v2.md §1
- `executor.sh` (46KB shell, dispatcher.sh now thin wrapper around Python services) — deprecation status unclear; possibly removable

### 3.2 Token-Compression Initiative (Cross-cut)

The most methodologically mature workstream. Pre-registration discipline imported from clinical-trial methodology; Stage-1/Stage-2 gating prevents premature promotion.

**Phase 0 — Instrumentation** (Jarvis side):
- 0.2: Cache telemetry capture canonical formula (`9e3afea`)
- 0.3: Extractor v2 (`2de70c2`)
- 0.4: Quote-aware register filter (`43adc5d`)
- 0.5: Pipeline-telemetry extractor for cross-workspace metric flow (`bf912f4`)

**Phase 1 — Persona Brief Cascade**:
| Phase | Brief | Deploy | Status | Pre-reg |
|-------|-------|--------|--------|---------|
| 1.1 | Jeeves-Brief (Jarvis output style) | Jarvis `75c9d97` 2026-04-30 | Stage-1 INCOMPLETE under new protocol; Stage-2 sample-sufficiency check 2026-05-15 | Filed post-hoc |
| 1.2 | Pipeline Executor-Brief | Alfred-Dev `f15f6a2` 2026-04-30 | Pre-reg filed (post-hoc); Stage-1/2 unblocked via Phase 0.5 | Filed |
| 1.3 | Pipeline Reviewer-Brief | Alfred-Dev `f15f6a2` 2026-04-30 | Pre-reg filed (post-hoc); Stage-1/2 unblocked via Phase 0.5 | Filed |
| 1.3.5 | Reviewer Claude-CLI route | Alfred-Dev `af73a46` 2026-05-02 | **First clean pre-deploy pre-reg**; Stage-1 verdict draft due 2026-05-04 ~17:04 MDT; Stage-2 due 2026-05-16 | Pre-reg sealed `2026-05-02T23:04:12Z` |
| 1.5 | Alfred-Brief (Alfred-Dev system prompt) | Alfred-Dev `c31b2bd` 2026-04-30 | First clean pre-reg in family; Stage-1 interim 2026-05-03; Stage-2 formal 2026-05-15 | Filed pre-deploy |

**Phase 2 — Chain-of-Draft Codification** (Jarvis side):
- 2.1.b: Stratified baseline complete (40 sessions, 5 task types, frozen Stage-2 targets) — `ea2488a` 2026-05-03
- 2.2: 5 per-task-type fewshot files shipped — `5e7111d`
- 2.3: `apply-cod.sh` v1.1.0 with `--task-type`/`--variant` flags + skip-rule enforcement — `fe61041`
- 2.4.a: `cod-inject.sh` UPS hook authored + 14/14 smoke tests pass
- 2.4.b: Stage-1 deploy registered in `settings.json` — `2de41e5` 2026-05-04T00:09:29Z; Stage-1 verdict 2026-05-06; Stage-2 verdict 2026-05-18
- 2.4.c: `cache-telemetry-extractor` extended for thinking-token columns — `5e7111d`
- 2.4-bis: Subagent CoD (deferred, gated on STAGE_1_CLEAR for main-session)
- 2.5: Benchmark (deferred, gated on Phase 1.1 Stage-2 PASS at 2026-05-15)

**Notable**: Pre-registration discipline matured during this window. Phase 1.1 was post-hoc; Phase 1.3.5 and Phase 2 are first-clean pre-deploy. The methodological trajectory is itself a deliverable.

### 3.3 JICM v7.9 (Jarvis-side) — Production-deployed

Sensing layer + slim watcher cutover, completed across two days.

**Trajectory**:
- v7.9.0–7.9.5: Hook layer, backend abstraction, slim watcher rewrite (1559→171 lines, 55KB→6.7KB), status line v8, Stage-1 harness with three iterative fix passes (warmup-prompt, wait_for_idle for AC-01 prompt-queueing race) — Jarvis-Dev side complete, Stage-1 5/5 PASS confirmed 2026-05-03 ~02:00Z
- v7.9.6a: Production deploy of sensing layer (Approach B — hooks + statusline + session-start.sh patch; v7.3 watcher untouched) — `57cb3ed` 2026-05-03T03:25Z
- v7.9.6b: Watcher swap (v7.3 → v7.9 slim) with Approach C back-compat shim — `2a559b5` 2026-05-03T04:46Z
- v7.9.6c (DEFERRED): Remove back-compat shim once operational confidence accumulates (~6 clean cycles)

**Stage-2 status**: 14d passive observation window 2026-05-03T03:25Z → 2026-05-17T03:25Z. **Demoted to data-gathering** (informs v8.x design); does NOT gate 7.9.6c shim removal.

**v8.0 roadmap published** (`projects/project-aion/designs/jicm-portable-architecture.md` superseded by `jicm-roadmap-v7-9-to-v8.md`): Portable architecture (decouple tmux), async hooks, native thinking-token support, local-model-suite v1.0 for offline compression.

### 3.4 Two-Stage Validation Gating Pattern (Cross-cut, formalized)

Generalized from token-compression methodology to a first-class Jarvis pattern.

**Promoted** at `e3fdc6d` (2026-05-01):
- Primary doc: `.claude/context/patterns/two-stage-validation-gating.md`
- Indexed in `patterns/_index.md`, `psyche/capability-map.yaml`, `psyche/nous-map.md`
- Composition references in `milestone-review-pattern.md` v1.3.1, `self-evolution-pattern.md` step 6

**Core insight**: Stage 1 (regression-catch, short window) cannot promote; only Stage 2 (formal pre-registered sign-off, longer window) gates promotion. Window duration scales with **scope** (not calendar) — automation-testable changes run Stage 1 in minutes; per-deploy / per-session telemetry runs in days/weeks.

**Currently applied to**: Token-compression Phase 1.1, 1.5, 1.2, 1.3, 1.3.5, 2.4; JICM v7.9.

### 3.5 ProjectIntel Collaboration

Cadence: 1 debrief per ~3.5 days (4 total in window, 398 lines / ~6,050 words). Two questions, both resolved (one directly by David on 2026-04-25 — high engagement signal). David's `nexus-sync-2026-04` branch is stable at `ee9b155` since auto-fetch baseline (zero new commits in window). David's status file `Status/david/focus-areas.md` is 22 days stale (minor weakness, not blocking).

**Decision points David has confirmed**:
1. Feature branch workflow: `feature/*` off `nate-dev`, PRs to `nate-dev`, David merges `nate-dev` → `main`
2. Dashboard is highest priority; AI Reviewer persona first instrumentation target
3. UI stack: React + React Query + Recharts (matches David's own work)
4. `bd` binary is legacy dead-weight; container should build without invocation
5. `nate-dev` workspace fully operational on isolated ports (Pulse :8800, Dashboard :8701, zero conflicts)

**Decision pending**: Architectural diff session for Replace-or-Evolve choice (Path A / B / C). Materials queued; the milestone commit this work is heading toward IS the diff materials artifact.

---

## 4. Branch Topology Snapshot at 2026-05-04

| Repo | Branch | HEAD | Tracking | Ahead | Behind | Uncommitted | Pending push |
|------|--------|------|----------|-------|--------|-------------|--------------|
| `Jarvis/` (production) | `Project_Aion` | `ea2488a` | `origin/main` (CannonCoPilot/Jarvis) | 1 | 0 | 2 modified (insights), 8 untracked (intentional .pre-* backups + launchd logs) | YES — 1 commit |
| `Jarvis-Dev/` | `dev` | `1cddeda` | `origin/dev` (CannonCoPilot/Jarvis) | 4 | 0 | 2 modified (insights) | YES — 4 commits |
| `Alfred-Dev/` | `nate-dev` | `af73a46` | `origin/nate-dev` (davidmoneil/AIFred-Pro) | **VERIFY** | 0 | clean | **VERIFY** (see §6) |

**Cross-checks needed in Phase 2**:
- Verify `nate-dev` push state (Agent B reported "1 ahead" but scratchpad notes `af73a46` was pushed 2026-05-02 in same session as commit). Run `git ls-remote origin nate-dev` to confirm.
- Confirm `nexus-sync-2026-04` branch state: 21 historical commits behind nate-dev per Agent B; 0 recent commits per Agent C. Both can be true (cumulative vs. recent).

---

## 5. Outstanding Items — Consolidated

Merged from all three source reports, deduplicated, prioritized.

### 5.1 Time-bound (clock-driven, NOT this milestone's blocker)
| Item | Window | Action | Owner |
|------|--------|--------|-------|
| **Phase 1.3.5 Stage-1 verdict draft** | Earliest run 2026-05-04 ~17:04 MDT (today/tomorrow) | Run pipeline-telemetry-extractor against dev DB filtered to `service=review`; write verdict report | Jarvis side; Independent of milestone work |
| **Phase 2 CoD Stage-1 verdict** | Earliest run 2026-05-06T00:09:29Z | Regression-catch axes only (cache_hit_rate_dip_pp ≤ 5; eph_1h_adoption ≥ 80%; register_violations ≤ 5/100; skip_rule_compliance = 100%) | Jarvis side |
| **Phase 1.1 sample-sufficiency check** | 2026-05-15 09:00 MDT | Check whether 3+ ordinary post-deploy sessions accumulated; gate Phase 2 promotion | Jarvis side |
| **Phase 1.3.5 Stage-2 formal sign-off** | Earliest run 2026-05-16 ~17:04 MDT | Cost / cache / per-class brevity verdict | Jarvis side |
| **JICM v7.9 Stage-2 14d window close** | 2026-05-17T03:25Z | Passive data-gathering verdict; informs v8.x | Jarvis side |
| **Phase 2 CoD Stage-2 formal verdict** | 2026-05-18T00:09:29Z | ≥3 of 5 task types meet -50% reduction; quality ≥ 0.95 | Jarvis side |

### 5.2 Carry-over for milestone commit consideration
| Item | Source report | Action category |
|------|---------------|-----------------|
| `dashboard/frontend/src/lib/board.ts` BLOCKER_LABELS missing `waiting:human` | AIFred §Open items #1 | **FIX before milestone**: small UI correctness defect; David flagged this kind of thing as dashboard-priority |
| `executor.sh` (46KB shell) deprecation status | AIFred §Open items #2 | **DOCUMENT in milestone debrief**: ask David explicitly whether to remove or retain |
| Gospel-synopsis test suite CI/CD integration | AIFred §Open items #4 | **DEFER**: post-milestone work; not part of Pipeline v2 architectural diff |
| Project Creator v2 conversation state persistence | AIFred §Open items #5 | **DEFER**: feature-level, not architectural |
| Ollama + Claude-CLI router load-test | AIFred §Open items #7 | **DOCUMENT**: known follow-up; surface in debrief |
| Phase 1.1 INCOMPLETE rerun verdict | Jarvis §Open items #1 | **REFERENCE in debrief**: token-compression methodology working correctly (caught insufficient sample) |
| Pulse task filing workflow not yet integrated | Jarvis §Open items #7 | **DEFER**: opportunity, not blocker |
| Alfred-Dev baseline integration ongoing | Jarvis §Open items #8 | **REFERENCE in debrief**: cross-workspace metric flow validated |
| `Status/david/focus-areas.md` 22 days stale | ProjectIntel §weakness | **NOT OUR TO FIX**: David's discipline; surface gently if at all |

### 5.3 Pre-merge verifications (Phase 2)
| Verification | Why |
|--------------|-----|
| `git ls-remote origin nate-dev` | Confirm `af73a46` is or isn't already at `origin/nate-dev` |
| `git log origin/nexus-sync-2026-04 ^origin/main` | Enumerate the 21 historical David commits on nexus-sync that aren't in main |
| `git log origin/nexus-sync-2026-04 ^nate-dev` | Same 21 commits relative to nate-dev (likely identical set) |
| `git log origin/main ^nate-dev` | Verify 0 commits — confirm nate-dev contains everything in main |
| `git log nate-dev ^origin/main` | Confirm 45 nate-dev-only commits |
| `git fetch origin --prune` first | Ensure local view of all upstream branches is current |

---

## 6. Replace-or-Evolve Decision Context

Per the 2026-05-02 strategic debrief, three honest paths face David:

| Path | What it means | Risk profile | Time investment for David |
|------|---------------|--------------|---------------------------|
| **A — Replace** | Cherry-pick `nate-dev` HEAD onto `main` after Stage-2 PASS on token-compression Phase 1.x | Single canonical implementation, no divergence. Large diff to absorb at once; breaks production contract. | High (full review of 45 commits + Pipeline v2 architecture) |
| **B — Selective adoption** | Cherry-pick specific commits (telemetry standardization, retry caps, dashboard live panel) without full Pipeline v2 | Low-risk, incremental, David keeps authorial control. Divergence accumulates; some commits have hidden dependencies. | Medium (commit-by-commit triage) |
| **C — Park as experimental** | Keep `nate-dev` as research branch; cross-pollinate via documented patterns (not code) | Fastest, lowest cognitive load. AIFred-Pro main misses real improvements. | Low (review patterns, not code) |

**The milestone commit this work is staging toward**: the artifact that makes Path A *possible to evaluate*. Even if David ultimately chooses B or C, the milestone is what enables the commit-by-commit diff session.

**No urgency stated** by Sir in 2026-05-02 debrief: "the question of whether AIFred-Pro absorbs Pipeline v2 wholesale, selectively, or not at all is yours to decide on your timeline — there's no urgency from my side."

---

## 7. Phase 2-5 Plan with Risk Assessment

### Phase 2: Pull AIFred-Pro main + nexus-sync-2026-04; tag baseline

**Operations** (in `/Users/nathanielcannon/Claude/Alfred-Dev/`):
1. `git fetch origin --prune --tags` (refresh all upstream refs)
2. Run all the verifications in §5.3 above; note results
3. `git tag pre-merge-baseline-2026-05-04 nate-dev` (rollback anchor)
4. `git push origin pre-merge-baseline-2026-05-04` (preserve tag remotely; David can see it too)
5. Report current divergence to User; await go/no-go for Phase 3

**Risk**: LOW. Read-only operations + one annotated tag (reversible by `git tag -d`). No branch state changes.

**Estimated duration**: 5-10 minutes.

### Phase 3: Codebase comparison + compatibility analysis

**Operations**:
1. Three-way diff: `git diff origin/main..nate-dev`, `git diff origin/nexus-sync-2026-04..nate-dev`, `git diff origin/main..origin/nexus-sync-2026-04`
2. Per-file change matrix: who touched what (nate-dev / main / nexus-sync / multiple)
3. Conflict prediction: files modified in >1 branch
4. Per the 21 nexus-sync historical commits, classify each ADOPT / ADAPT / REJECT / DEFER (using `/sync-aifred-pro-dev` style framework)
5. Cross-reference with §5.2 outstanding items
6. Write conflict-prediction report to `projects/project-aion/evolution/aifred-pro-integration/sync-reports/2026-05-04-pre-merge-analysis.md`

**Risk**: LOW. All read-only + report writing. No branch state changes.

**Estimated duration**: 30-60 minutes (requires careful per-commit review for the 21 nexus-sync commits).

**Critical decision gate**: After Phase 3 report is written, present to User. **Do NOT proceed to Phase 4 without explicit go-ahead** — the Phase 4 merge is the first irreversible action.

### Phase 4: Merge main + nexus-sync into nate-dev; resolve conflicts

**Operations**:
1. Merge `origin/main` into `nate-dev` first (likely 0-conflict per Agent B's analysis: no commits on origin/main since merge-base `dfd40c5`)
2. For each ADOPT/ADAPT-classified nexus-sync commit, cherry-pick or merge with conflict resolution per Phase 3 report
3. For each REJECT-classified commit, document why in commit message
4. For DEFER-classified, leave for future window
5. Smoke-test: ensure `pulse-watcher.py` + `dashboard` + Pulse API still start; run gospel-synopsis test suite if practical
6. Fix `dashboard/frontend/src/lib/board.ts` BLOCKER_LABELS while we're in there (small inline cleanup per §5.2)

**Risk**: MEDIUM. First write-action on `nate-dev`. Mitigated by:
- Pre-merge baseline tag from Phase 2 (rollback in one `git reset --hard`)
- All conflicts resolved deliberately per Phase 3 plan
- Smoke-test gate before push

**Estimated duration**: 1-3 hours depending on conflict density.

**Critical decision gate**: After merge complete + smoke-test pass, present diff summary to User. **Do NOT push to David's repo without explicit go-ahead.**

### Phase 5: Commit milestone to nate-dev; push for David's review

**Operations**:
1. Compose comprehensive milestone commit message (multi-paragraph, summarizing Pipeline v2 + token-compression + dashboard + merge decisions)
2. `git push origin nate-dev`
3. Write milestone debrief: `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-milestone-merge-and-pipeline-v2-completion.md`
   - Topic: completed milestone, summary of merged content, link to comprehensive review, surface deferred items, restate Path A/B/C framing
   - Include explicit ask: when does David want the diff session?
4. Update `Shared_Projects/Status/Archon/focus-areas.md` if priorities shifted
5. Update Jarvis `session-state.md` and `current-priorities.md` with milestone completion
6. Optional: file Pulse task `agent:shared` flagging the milestone for David

**Risk**: HIGH (one push to David's repo is visible immediately). Mitigated by:
- All upstream verification done in Phase 2
- All conflicts deliberate per Phase 3
- Smoke-test gate from Phase 4
- User has approved every gate

**Estimated duration**: 30-45 minutes.

**No automatic next phase**: After Phase 5, the work is in David's court. Future phases (his merge to main, or selective adoption) are HIS decisions, not ours.

---

## 8. Critical Unknowns to Resolve in Phase 2

Surfacing these explicitly because Phase 3-5 planning depends on them:

1. **Is `af73a46` already at `origin/nate-dev`?** Agent B says +1 ahead, scratchpad says pushed. `git ls-remote` will tell.
2. **What are the 21 nexus-sync historical commits?** Need to enumerate to plan Phase 4. Likely David's older experimental work that he may or may not want propagated.
3. **Has David's `origin/main` advanced since merge-base `dfd40c5` (2026-04-22)?** Agent B says no. Verify with `git log origin/main..nate-dev` returning all 45 nate-dev commits AND `git log nate-dev..origin/main` returning empty.
4. **Are there any uncommitted changes Agent B missed?** Agent B reports `git status --porcelain` empty; verify before Phase 4.
5. **Does the dashboard build cleanly from current `nate-dev` HEAD?** This is what David asked about on 2026-04-25; we should confirm before adding it as a milestone artifact.

---

## 9. Recommended Discussion Topics for Milestone Debrief to David

Drawn from Agent C's recommendations + Agent B's open items + the milestone commit's natural surface area:

1. **Phase 1.3.5 Stage-1 PASS confirmation** (independent of milestone, but lands in same window) — debrief should include the verdict if available
2. **Replace-or-Evolve diff session timing** — propose a 2-week window, ask David to push back if needed
3. **AI Reviewer persona instrumentation scope** — David's stated first dashboard target; clarify which metrics matter most
4. **`executor.sh` deprecation** — explicit ask: remove or retain?
5. **Dashboard build state** — confirm clean build (or surface if not)
6. **Phase 4 (intelligent scheduling) Kanban readiness** — has David set up the board to receive these items?
7. **Cross-instance cost attribution** — does David want per-instance cost breakdown in shared dashboard, or aggregate?

---

## 10. Appendices: References to Source Material

### Agent reports (gitignored, in `.claude/scratch/aifred-pro-dev-review/`)
- `jarvis-side-2026-05-04.md` — 435 lines, 32 KB — Jarvis-side commit timeline, design docs, JICM v7.9 evolution, two-stage gating
- `aifred-pro-dev-side-2026-05-04.md` — 365 lines, 23 KB — `nate-dev` commit timeline, Pipeline v2 architecture, dashboard, telemetry, conflict zones
- `projectintel-collaboration-2026-05-04.md` — 181 lines, 20 KB — debrief inventory, David's focus areas, resolved questions, replace-or-evolve framing

### Canonical Jarvis-side artifacts (committed)
- `projects/project-aion/reports/token-compression-roadmap.md` (v3)
- `projects/project-aion/reports/token-compression-implementation-guide.md`
- `projects/project-aion/designs/cod-task-type-taxonomy.md`
- `projects/project-aion/designs/cod-injection-architecture.md` (v1.1.0, decisions frozen)
- `projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md`
- `projects/project-aion/designs/local-model-suite-2026-q2.md`
- `.claude/context/patterns/two-stage-validation-gating.md` (v1.0.0)
- `.claude/context/designs/jicm-v7-audit-2026-05-01.md`
- `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- `.claude/metrics/token-compression/phase-2-1-b-baseline-stratified-2026-05-04.md`

### Canonical Alfred-Dev artifacts (committed on `nate-dev`)
- `.claude/context/designs/pipeline-redesign-v2.md` (1100 lines)
- `.claude/context/designs/pipeline-v2-technical-reference.md` (577 lines)
- `.claude/jobs/services/{stage,evaluate,orchestrate,executor,reviewer,_shared}.py`
- `tests/gospel-synopsis/` (test fixture suite)
- `dashboard/frontend/src/components/tasks/{ActivityTimeline,DependencyChain}.tsx`
- `dashboard/frontend/src/pages/{ProjectCreatorPage,TimelinePage,TokenCompressionPage}.tsx`

### ProjectIntel debriefs (Synology-synced, not in git)
- `Shared_Projects/Debriefs/AIFred-Pro/2026-04-23-dev-workspace-and-usage-metrics-vision.md`
- `Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-usage-tracking-phase3-complete.md`
- `Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-token-telemetry-and-allotment-tracking.md`
- `Shared_Projects/Debriefs/AIFred-Pro/2026-05-02-pipeline-v2-and-token-compression-progress.md` (~3,200 words, the strategic debrief)

### Resolved questions
- `Shared_Projects/Questions/2026-04-21-Archon-for-david-workspace-setup.md` (answered 2026-04-22 by Liaison)
- `Shared_Projects/Questions/Archon-2026-04-25-reply-to-checkin.md` (answered 2026-04-25 directly by David)

---

*Comprehensive review v1.0 — 2026-05-04*
*Synthesized from three parallel Explore agent reports. Source reports preserved in `.claude/scratch/aifred-pro-dev-review/` (gitignored).*
