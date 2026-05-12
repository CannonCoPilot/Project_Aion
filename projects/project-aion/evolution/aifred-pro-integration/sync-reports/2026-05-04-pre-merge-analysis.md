# Pre-Merge Analysis — AIFred-Pro nate-dev Milestone (2026-05-04)

**Generated**: 2026-05-04, Phase 3 of milestone work
**Classification framework**: ADOPT / ADAPT / REJECT / DEFER (per `/sync-aifred-pro-dev` pattern)
**Source**: 21 historical commits on `origin/nexus-sync-2026-04` not present in `origin/main`
**Target branch**: `nate-dev @ af73a46` (local, ahead 1 of `origin/nate-dev a46806a`)
**Rollback anchor**: tag `pre-merge-baseline-2026-05-04` (pushed to origin)

---

## 1. Headline Recommendation

**REJECT all 21 nexus-sync commits for this milestone.** Push the existing `nate-dev` branch (45 commits ahead of `origin/main`, +1 unpushed local) as the milestone, with one small inline cleanup (`board.ts` BLOCKER_LABELS fix). The dashboard improvements and decision-rationale work in nexus-sync are real and worth considering, but they belong on a separate track David owns — adopting them through Sir would muddy the authorship signal of the architectural diff David is being asked to review.

This is a recommendation, not a decision. The User authorized the milestone work with "merging changes from the main and the nexus-sync branches"; the analysis below makes the case for why a leaner scope is more useful here, and surfaces the small ADOPT candidates if the User prefers to retain some of them.

---

## 2. What the Probes Found

### Diff topology

| Comparison | Commits | Files | Insertions | Deletions |
|------------|---------|-------|------------|-----------|
| `origin/main` ← `nate-dev` | 45 | (Sir's Pipeline v2 + token-compression + dashboard) | substantial | substantial |
| `origin/main` ← `origin/nexus-sync-2026-04` | 21 | ~250 | substantial | minor |
| `nate-dev` ↔ `origin/nexus-sync-2026-04` | combined | **450** | **27,319** | **24,018** |

**Critical reading**: The 450-file diff between `nate-dev` and `nexus-sync` is largely structural — both branches reached "broadly similar dashboard + jobs scaffolding" via different commit lineages, then evolved in different directions. Only ~30-40 of those 450 files represent genuine overlapping modifications that would conflict on merge.

### Topology timeline

```
                              dfd40c5 (2026-04-22 "fix: post-sync cleanup")
                                  │
           ┌──────────────────────┼─────────────────────────────┐
           │                      │                             │
       (earlier)              origin/main                   nate-dev branched here
           │                      │                             │
           │                                                    ├── 45 commits (Pipeline v2,
           │                                                    │   token-compression Phase 1.x,
           │                                                    │   dashboard, telemetry)
           │                                                    │
           └─→ origin/nexus-sync-2026-04                        af73a46 (HEAD)
               (David's experimental track —
                21 commits 2026-04-09..2026-04-22)
               ee9b155 (HEAD; stable, no recent activity)
```

Both branches are "ahead of `origin/main`" but in completely different directions. They never share a non-merge-base ancestor.

---

## 3. Per-Commit Classification

### Category A — Nexus 4.0 rebrand + foundational sync (9 commits, 2026-04-09)

These are David's foundational commits creating the "Nexus" framework + bundling the dashboard. The work is architecturally substantial but predates Pipeline v2. Pipeline v2 supersedes the dispatcher-shell-loop model these commits established.

| Hash | Subject | Files | Verdict | Reasoning |
|------|---------|-------|---------|-----------|
| `0e6e1a2` | remove hardcoded paths and secrets for standalone operation | 7 (executor.sh, agent docs, scripts) | **REJECT** | Pipeline v2 has its own credential model via `.claude/secrets/credentials.yaml` and Pulse metadata; nexus-sync's hardcoded-path fixes target the legacy executor.sh path which Pipeline v2 deprecates |
| `7c4db38` | critical bug fixes — executor MODEL pin and watchdog improvements | 2 (executor.sh, dispatcher-watchdog.sh) | **REJECT** | Targets legacy executor; Pipeline v2 services (`executor.py`) have their own model pinning via `engine` metadata and routing rules |
| `3ada792` | rebrand Headless Claude Jobs Framework to Nexus | 65+ files | **REJECT** | Cosmetic + structural rebrand; nate-dev inherited the post-rebrand state via main at `dfd40c5`. Re-merging would re-introduce drift. |
| `a450f61` | bundle Pulse Dashboard as Docker service | **200+ files** (initial dashboard import) | **REJECT** | This is the dashboard's birth commit. nate-dev already has the dashboard (inherited via main); Sir's dashboard work builds on it. Re-merging would be a no-op at best, conflict-storm at worst. |
| `7bc1538` | comprehensive Nexus sync — libs, scripts, hooks, personas, workflows, docs | 130+ files | **REJECT** | Foundation sync; mostly already in nate-dev via main. Re-merging would conflict on the 50+ persona prompt files Sir has now further evolved for Pipeline v2. |
| `7f80e16` | bump version to 4.0.0 — Nexus sync complete | 1 (VERSION) | **REJECT** | Version-pinning a now-superseded architecture |
| `b0d4ff8` | flatten nested persona directories from cp -r | 40 (persona files) | **REJECT** | Cleanup of an artifact of David's local copy operation; not relevant to nate-dev which has clean directory structure |
| `16ed6d5` | complete executor.sh sync + missing workflows | 20 (executor.sh, systems docs, workflows) | **REJECT** | Targets legacy executor + adds David's `.claude/context/systems/` documentation. Pipeline v2 supersedes executor; systems docs belong on David's side. |
| `abee226` | sync gaps — templatize allowlist, missing libs, fix theklyx refs | 6 | **REJECT** | Cleanup of David's sync work; nate-dev not affected |

**Aggregate Category A verdict**: REJECT 9/9. Adopting any of these would contradict the Pipeline v2 deprecation narrative and re-introduce architectural debt the rebuild was specifically designed to remove.

### Category B — Phase 5.x observability (8 commits, 2026-04-10 → 2026-04-11)

David's Phase 5 observability work: dual-write logging, audit-ingest replay, decision rationale, TZ discipline.

| Hash | Subject | Files | Verdict | Reasoning |
|------|---------|-------|---------|-----------|
| `54dda47` | Phase 5.2 — dual-write Nexus libs + thread_id propagation | 5 (dispatcher.sh, executor.sh, audit/cost/decision-log.sh) | **REJECT** | Pipeline v2 has its own metadata.orchestration thread tracking; dual-write to a parallel logging schema would create maintenance burden |
| `4689195` | SC2155 fix in Phase 5.2 NEXUS_THREAD_ID block | 2 | **REJECT** | Defensive fix on legacy executor; not applicable |
| `ea298c2` | Phase 5.3 — audit-ingest.sh/py (JSONL → Postgres replay) | 2 NEW (684 lines) | **DEFER** | Substantial standalone infrastructure; could be valuable for Pipeline v2 too, but warrants its own evaluation and Pulse task. Not bundled into the milestone. |
| `93f5320` | Phase 5.5 — decision rationale rollout | 7 (incl. ai-reviewer/task-evaluator/task-investigator prompts) | **DEFER (with strong consider)** | Decision rationale is exactly what David flagged for AI Reviewer dashboard instrumentation. **However**: ai-reviewer/prompt.md has 188 lines of diff vs nate-dev (132 ins / 56 del). Adopting it conflicts with whatever Sir has done to that file for Pipeline v2. Cleaner to have David refresh the persona prompts in main, then Sir rebases. |
| `613a71e` | Phase 5.5 — shellcheck SC2038 fix | 1 (executor.sh) | **REJECT** | Defensive fix on legacy executor |
| `0641bc3` | Phase 5.5 hardening — audit-ingest ON CONFLICT + watchdog fix guard | 2 | **DEFER** | Hardening for the audit-ingest infrastructure that's already deferred |
| `c4058bf` | mirror observability Phases 5.0+5.8 from AIProjects | 8 (executor.sh, pulsar-runner, event-watcher, audit-log, cost-log, common.sh, pipeline-runner, pipeline-watchdog) | **REJECT** | Mirrors David's other-project observability into the legacy shell stack; Pipeline v2 has its own observability layer (Pulse metadata + dashboard) |
| `f933c72` | TZ discipline to msg-relay + telegram-callback | 2 | **REJECT** | Targets msg-relay/telegram-callback shell utilities, not part of Pipeline v2's communication path |

**Aggregate Category B verdict**: 6 REJECT, 2 DEFER (audit-ingest infrastructure + decision-rationale prompts). The decision-rationale work is the most interesting; deferring rather than rejecting acknowledges its potential value.

### Category C — Dashboard orchestration improvements (4 commits, 2026-04-14)

David's experimental work on the orchestration graph view. Small, focused, complementary.

| Hash | Subject | Files | Diff size | Verdict | Reasoning |
|------|---------|-------|-----------|---------|-----------|
| `40290c4` | visualize conditional execution, loops, retry, output flow | 4 (orchestrations.ts, OrchestrationGraphView, OrchestrationTaskNode, ProjectDetailPage) | ~95 lines net | **DEFER (with strong consider)** | Adds capabilities to OrchestrationGraphView that Pipeline v2's `DependencyChain.tsx` may or may not have. Without checking specific overlap, can't ADOPT cleanly. |
| `f5f98ea` | guard dangling edges + include hasOutput in badge guard | 2 (OrchestrationGraphView, OrchestrationTaskNode) | ~45 lines | **DEFER** | Followup hardening on `40290c4`; only meaningful if `40290c4` is ADOPT |
| `1e618ef` | remove dead has_retry badge, clean type references | 4 (orchestrations.ts, OrchestrationGraphView, OrchestrationTaskNode, ProjectDetailPage) | ~40 lines | **DEFER** | Cleanup follow-up to `40290c4` |
| `ee9b155` | refresh project overview + nexus-sync-2026-04 notes | 1 (README.md) | ~80 lines | **ADAPT** | Write our own README update reflecting milestone work; reference nexus-sync notes as appropriate |

**Aggregate Category C verdict**: 3 DEFER, 1 ADAPT. The dashboard improvements are real value but they target `OrchestrationGraphView.tsx` which has its own evolution path on nate-dev. A cherry-pick would conflict with Sir's Pipeline v2 dashboard work (which uses different visualization patterns). Better to evaluate post-milestone whether to port the conditional/loop/retry visualization concepts into Pipeline v2's dashboard idioms.

### Aggregate classification

| Verdict | Count | Notes |
|---------|-------|-------|
| ADOPT | 0 | None recommended |
| ADAPT | 1 | README.md (our own write, referencing David's notes) |
| REJECT | 17 | Nexus rebrand + Phase 5 observability + TZ discipline + executor.sh evolution |
| DEFER | 3 | Audit-ingest infrastructure (ea298c2, 0641bc3); decision-rationale prompts (93f5320); dashboard orchestration viz (40290c4 + 2 follow-ups) |

---

## 4. Why "REJECT All" Is the Right Stance

Three converging reasons to NOT bring nexus-sync work into the milestone:

### 4a. Authorship clarity for David's review

The milestone's purpose (per the User's framing) is "for David's review and merge." The diff David evaluates should be "what Sir built since branching from main" — a clear authorship signal. If the milestone includes commits David himself authored (cherry-picked or merged from nexus-sync), it muddles that signal:

- Did Sir review and adopt those commits, or just blindly include them?
- If David previously decided NOT to merge nexus-sync into main (it's been stable since 2026-04-22), why is Sir now arguing for those commits?
- Does Sir have higher conviction than David that those commits are ready for main?

A milestone that says "here's what Sir built — review it" is a cleaner ask than "here's what Sir built plus what you might want to revisit from your own experimental branch."

### 4b. Pipeline v2 deprecates the architecture nexus-sync extends

Per the User's answer (3) on `executor.sh`: surface deprecation in the debrief with strong reasoning. Most of nexus-sync's work targets `executor.sh` and the legacy shell stack. Adopting Phase 5 observability into that stack contradicts the deprecation argument — it's investment in code we're recommending be removed.

The strong reasoning chain is: Pipeline v2's Python services own dispatch now → `executor.sh` is duplicate code path → keeping it risks silently retrying via legacy when Python services fail (masking real failures) → it should be removed. Adopting Phase 5 observability into `executor.sh` would extend its life and weaken the deprecation case.

### 4c. nexus-sync is David's branch; he can merge it himself when ready

David's `nexus-sync-2026-04` branch shows zero new commits since 2026-04-22 (per Agent C's auto-fetch summary). He has not chosen to merge it to main. That's his prerogative. Sir cherry-picking from it implies Sir has decided when David's experimental work is ready — that's not the right hierarchy.

The cleanest model: nexus-sync stays as David's separate track. If David wants the dashboard orchestration improvements or audit-ingest infrastructure to land in main, he merges nexus-sync → main on his timeline. After that lands, Sir rebases nate-dev onto the new main.

---

## 5. Recommended Phase 4 Scope (REJECT-all variant)

Phase 4 simplifies dramatically under this recommendation:

1. **No merge of `origin/main`** — already 0 commits behind (verified V3b: count = 0)
2. **No merge of `origin/nexus-sync-2026-04`** — REJECT-all per this report
3. **Apply small inline cleanup**: `dashboard/frontend/src/lib/board.ts` BLOCKER_LABELS missing `waiting:human` (per User answer 2)
4. **Smoke-test**: pulse-watcher.py + dashboard + Pulse API still start cleanly
5. **Push existing nate-dev** — currently +1 (af73a46 Phase 1.3.5 Claude-CLI route is the unpushed commit) → push lands the work-in-progress reviewer route on `origin/nate-dev`
6. **Optionally update README.md** — write our own version reflecting milestone scope (per Category D ADAPT)

**Estimated duration**: 30-60 min total. Most of the time is the smoke-test gate and writing the milestone debrief (Phase 5).

---

## 6. Alternative Phase 4 Scopes (if User wants nexus-sync ADOPTs)

If the User prefers retaining some nexus-sync work, the smallest defensible additions are:

### Option B1: ADOPT `ee9b155` README only (~80 line patch)
- Smallest possible scope
- Shows acknowledgement of David's nexus-sync work without architectural commitment
- ADAPT might be cleaner — write our own README pulling David's notes in

### Option B2: Above + DEFER → ADOPT for `93f5320` decision-rationale persona prompts
- Adds ai-reviewer / task-evaluator / task-investigator prompt evolution
- Risk: 188-line diff on `ai-reviewer/prompt.md` likely conflicts with Pipeline v2 evolution
- Effort: 30-60 min conflict resolution
- Value: Aligns AI Reviewer prompt with David's latest thinking on the persona David flagged for first dashboard instrumentation

### Option B3: Above + cherry-pick Category C dashboard viz (`40290c4`, `f5f98ea`, `1e618ef`)
- Adds conditional/loop/retry visualization to `OrchestrationGraphView`
- Risk: probably conflicts with Pipeline v2's dashboard idioms
- Effort: 1-2 hr conflict resolution + visual integration testing
- Value: Richer orchestration visualization for the milestone demo

### Option B4: Wholesale `git merge origin/nexus-sync-2026-04`
- 450-file diff, ~30-40 genuine conflicts
- Effort: 4-8 hr conflict resolution + risk of silent semantic conflicts
- Value: Complete reconciliation; one canonical branch
- **Not recommended** — high cost, low marginal benefit, contradicts authorship signal

---

## 7. Critical Questions for User

Before authorizing Phase 4, please confirm:

1. **REJECT-all stance acceptable?** If yes, Phase 4 is the simplified scope above (~30-60 min). If you'd rather retain some nexus-sync work, choose one of B1-B4.

2. **Smoke-test scope**: minimum viable is "services start without errors." Maximum reasonable is "run gospel-synopsis test suite end-to-end." Preference?

3. **README update (Category D ADAPT)**: write our own README update reflecting milestone scope, or leave README untouched and let the milestone debrief carry the narrative?

4. **Push of `af73a46` (Phase 1.3.5 reviewer Claude-CLI)**: this is the unpushed commit currently sitting on local nate-dev. It's already deployed locally; the push just makes David visible to it. Push as part of the milestone, or push separately as a Phase 1.3.5 deploy commit?

5. **Phase 1.3.5 Stage-1 verdict timing**: per your answer 4, milestone first then verdict draft. Confirm: milestone push happens today, verdict draft tomorrow ~17:04 MDT?

---

## 8. Reference: Heaviest Diffs (for spot-verification if needed)

| File | nate-dev ↔ nexus-sync diff | Interpretation |
|------|----------------------------|----------------|
| `.claude/jobs/executor.sh` | 1338 lines (+1159 / -179) | nate-dev has near-original; nexus-sync has Phase 5.x evolution. Neither is "right" — Pipeline v2 supersedes both. |
| `.claude/jobs/personas/ai-reviewer/prompt.md` | 188 lines (+132 / -56) | nate-dev evolution + David's decision-rationale rollout diverge significantly |
| `.claude/jobs/audit-ingest.py` (NEW on nexus-sync) | +616 | David's audit-ingest infrastructure; not in nate-dev |
| `.claude/jobs/pipeline-watchdog.sh` | 224 lines | Both sides evolved; conflicts likely |
| `dashboard/frontend/src/components/orchestration/OrchestrationGraphView.tsx` | 81 lines | Small, mergeable in isolation but may conflict with Pipeline v2 dashboard work |
| `README.md` | 81 lines | Surface-level documentation drift |

---

## 9. Status

- ✅ Phase 1: Comprehensive review complete
- ✅ Phase 2: Pulled, baseline tagged + pushed to origin
- ✅ Phase 3: Codebase comparison + classification (this report)
- ⏸️  Phase 4: AWAITING USER GO-AHEAD on scope (REJECT-all recommended; alternatives B1-B4 available)
- ⏸️  Phase 5: Push milestone + write debrief (after Phase 4)

---

*Phase 3 pre-merge analysis v1.0 — 2026-05-04*
*Source: comprehensive review (`projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md`) + 21-commit nexus-sync triage*
