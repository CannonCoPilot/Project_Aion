---
title: M3 /pipeline approval-card consumer audit + Option A taxonomy ratification
date: 2026-05-11
status: APPROVED — Option A locked, implementation green-lit
project: AIFred-Pro-Dev
target_branch: nate-dev
ratifies: ../plans/aifred-pro-dev-dashboard-recleavage.md (§5.3 M3)
foundational_ref: aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md §11
predecessor_audit: decisions-to-reo-feature-parity-audit-2026-05-11.md (M2 pattern)
audience: Nate, future-Jarvis, future-David
---

# M3 /pipeline approval-card consumer audit + Option A taxonomy ratification

Mirror of the M2 audit pattern, applied to M3's higher-blast-radius consolidation. Where M2 was an **affordance-side** audit (35 visible UI elements in DecisionsPage.tsx), M3 is a **consumer-side** audit (which files read or write the approval state, and how should each react to the move). Output is the canonical "where does X live now?" decision log for the M3 portion of the release cycle.

## 1. Ratified decisions (locked 2026-05-11)

| ID | Decision | Source |
|---|---|---|
| **M3-D1** | Approvals become a **distinct board column**, not a sub-view of blocked (Option A). | Nate 2026-05-11 |
| **M3-D2** | `classifyTask` checks `pipeline:needs-approval` BEFORE `isBlocked`, so approvals don't fall through to `'blocked'`. | M3-D1 entailment |
| **M3-D3** | `'approvals'` added to `BoardColumn` type in `lib/board.ts`. | M3-D1 entailment |
| **M3-D4** | `/tasks?board=approvals` is the canonical URL for the approval index view. | M3-D1 + AppShell pattern |
| **M3-D5** | `PipelineApprovalCard.tsx` does NOT move. Only its mount sites change. | Component is already extracted at `components/pipeline/PipelineApprovalCard.tsx` (240 LOC). |
| **M3-D6** | M3 risk class **MEDIUM** (was HIGH). Surface change is React mount-location + taxonomy. No `pipeline-watcher.py` interaction, no Pulse mutation surface change. | This audit |
| **M3-D7** | `BlockedBanner.tsx` URL param normalized to `?board=blocked` (was `?status=blocked`). | Hygiene fix surfaced by this audit |

## 2. Consumer disposition table

Eight consumers identified (six pre-audit + two newly-discovered). Disposition column tracks IN_SCOPE / IN_SCOPE_NEW / OUT_OF_SCOPE / DEFER with the rationale.

| # | File | Role today | Disposition | Action in M3 |
|---|---|---|---|---|
| 1 | `dashboard/frontend/src/lib/board.ts` | `classifyTask` returns 8 board columns; approvals fall into `blocked` via `pipeline:needs-approval` in `HUMAN_REVIEW_REASONS` (line 59) | **IN_SCOPE_NEW** (load-bearing) | Add `'approvals'` to `BoardColumn` type. `classifyTask` returns `'approvals'` when `pipeline:needs-approval` present, BEFORE `isBlocked` check. Update `V2_DEFAULT_LABELS`? No — approvals are pipeline-state, not board-default. |
| 2 | `dashboard/frontend/src/components/layout/AppShell.tsx` | Approval banner (lines 328-345) routes to `/tasks?board=blocked` in both expanded + collapsed states | **IN_SCOPE** | Re-target to `/tasks?board=approvals`. Two link sites (expanded + collapsed). |
| 3 | `dashboard/frontend/src/pages/PipelinePage.tsx` | Imports + mounts `PipelineApprovalCard` (line 7 import, line 554 mount, line 519 empty-state) | **IN_SCOPE** | Drop import. Drop `<PipelineApprovalCard>` JSX. Drop "No tasks pending approval" empty-state. Net: ~4-line deletion. Monitoring widgets, stage metrics, dispatcher health, recent executions all remain. |
| 4 | `dashboard/frontend/src/pages/DashboardPage.tsx` | Already supports `?board=` filter (line 55 reads `boardFilter`, line 78 filters via `classifyTask`) | **IN_SCOPE** | No filter wiring change (classifyTask is the upstream change). Add approvals empty-state copy ("No pending approvals — clean slate, sir."). Verify BlockedBoardToolbar (line 168) doesn't fire for approvals (it's gated on `boardFilter === 'blocked'`). |
| 5 | `dashboard/frontend/src/components/board/BlockedBanner.tsx` | Routes to `/tasks?status=blocked` (line 53) — **inconsistent** with AppShell's `?board=blocked` | **IN_SCOPE_NEW** (hygiene) | Normalize to `/tasks?board=blocked`. M3-D7 fix. |
| 6 | `dashboard/frontend/src/components/tasks/TaskDetail.tsx` | Mounts `PipelineApprovalCard` at line 554 on per-task detail page | **OUT_OF_SCOPE (keep)** | Per-task action surface remains valid. Only index-page mount (PipelinePage) is the move target. |
| 7 | `dashboard/frontend/src/components/board/KanbanCard.tsx` | Renders task labels; uses `classifyTaskPipeline` (v2 pipeline classifier, NOT v1 `classifyTask`) | **OUT_OF_SCOPE** | v2 pipeline columns are `blocked/staging/evaluated/queued/active/completed`. Approvals not a v2 dimension. No change. |
| 8 | `dashboard/frontend/src/App.tsx` | Route `/approvals` already redirects to `/tasks?board=blocked` (line 67) | **IN_SCOPE_NEW** (additive) | Update redirect target to `/tasks?board=approvals` per M3-D4. One-line edit, complements M3-D1. |

**Out-of-scope candidates (proposed pre-audit, ruled out)**:

| Original candidate | Why ruled out |
|---|---|
| `pulse/app.py` | Pulse's `/api/v1/pipeline/*` endpoints are read-only (active / integrity / stress-status / chain-test). Approval **mutations** route through dashboard-server `dashboard/server/routes/pipeline.ts` (lines 44, 99, 121, 143, 162, 204, 234). No Pulse code surface change. |
| `.claude/jobs/pipeline-watcher.py` | Watcher reads Pulse for retry-vs-give-up orchestration decisions only. Zero approval-flow code paths. Confirmed by grep — no `'pipeline:needs-approval'` or `'approve'` references in watcher source. |

## 3. Cross-mode link buttons — destination-route audit

Five buttons specified in plan §5.3. Each requires both a source-page UI add AND a destination-route that supports the deep-link param. Audit results:

| # | Source | Destination | Destination exists? | Deep-link param works? | Disposition |
|---|---|---|---|---|---|
| L1 | `/reo` case-file drawer | `/reviews?decision_id=N` | YES (ReviewPage.tsx, 1842 LOC, route at App.tsx:80) | UNKNOWN — needs spot-check on ReviewPage filter wiring | IN_SCOPE; verify filter wiring during impl |
| L2 | `/findings` entry with linked task | `/tasks/:id` | YES (TaskDetailPage, route at App.tsx:114) | YES (per-id dynamic route) | IN_SCOPE |
| L3 | `/health` failing job | **`/jobs/:id`** | **NO — route does not exist** in App.tsx. Only `/jobs` list (line 85). | N/A | **DEFER or REVISE**: see M3-D8 below |
| L4 | `/tasks/:id` with active decision | `/reo?decision_id=N` | YES (ReoPage, line 83) | YES (B6 ?decision_id= deep-link, scratchpad 2026-05-07) | IN_SCOPE |
| L5 | `/reviews` approved-action | `/tasks/:id` | YES (App.tsx:114) | YES | IN_SCOPE — verify not already present (plan §5.3 flags this with "if not already present") |

### M3-D8 ratification needed (L3 /jobs/:id)

**Surface**: `RecurringJobsPage` is the `/jobs` route — no `/jobs/:id` detail page exists.

**Three options**:
- **L3-Option α**: defer L3 entirely (4 cross-mode buttons, not 5). Cleanest.
- **L3-Option β**: revise to `/jobs?focus=<id>` semantics — RecurringJobsPage handles a focus param, scrolls/highlights the row. Adds focus-state handling to RecurringJobsPage (~10 LOC).
- **L3-Option γ**: add `/jobs/:id` JobDetailPage as part of M3. Out of scope for M3 — separate workstream.

**Recommendation**: L3-Option β. Cheap, satisfies the user intent (jump from a failing job in /health to its config), no new page required.

**Action**: present this ratification question to Nate at the visual-validate gate; default to L3-Option β on a "go" signal.

## 4. Implementation specs (per file)

### 4.1 `lib/board.ts` (~5 LOC change)

```ts
// Before:
export type BoardColumn = 'archived' | 'done' | 'deferred' | 'review' | 'blocked' | 'in_progress' | 'ready' | 'backlog';

export function classifyTask(task: Task): BoardColumn {
  const labels = task.labels ?? [];
  if (task.status === 'closed') { /* ... */ }
  if (isDeferred(task)) return 'deferred';
  if (labels.includes('review:research')) return 'review';
  if (isBlocked(labels)) return 'blocked';  // ← pipeline:needs-approval falls here
  // ...
}

// After:
export type BoardColumn = 'archived' | 'done' | 'deferred' | 'review' | 'approvals' | 'blocked' | 'in_progress' | 'ready' | 'backlog';

export function classifyTask(task: Task): BoardColumn {
  const labels = task.labels ?? [];
  if (task.status === 'closed') { /* ... */ }
  if (isDeferred(task)) return 'deferred';
  if (labels.includes('review:research')) return 'review';
  if (labels.includes('pipeline:needs-approval')) return 'approvals';  // ← NEW: catch BEFORE isBlocked
  if (isBlocked(labels)) return 'blocked';
  // ...
}
```

**Verify**: `HUMAN_REVIEW_REASONS` (line 59) keeps `'pipeline:needs-approval'` — the BlockedBanner's human-vs-auto counting logic still works for any approval that ALSO has `blocked:yes`. (Edge case: a task with both `pipeline:needs-approval` and `blocked:yes` — classifyTask now returns `'approvals'`, but BlockedBanner counts it as human. That's correct — approval awaiting human review counts as human-blocked from the banner's perspective.)

### 4.2 `AppShell.tsx` (2 link sites)

Lines 330, 341: `to="/tasks?board=blocked"` → `to="/tasks?board=approvals"` (both expanded + collapsed banner variants).

### 4.3 `PipelinePage.tsx` (~4-line removal)

Drop:
- Line 7: `import { PipelineApprovalCard } from '../components/pipeline/PipelineApprovalCard';`
- Line 519: "No tasks pending approval" empty-state block (verify surrounding heading is also removed if it becomes orphaned)
- Line 554: `<PipelineApprovalCard task={t} key={t.id} />` mount + surrounding loop if dedicated

Keep everything else (stage metrics, dispatcher health, recent executions monitoring widgets).

### 4.4 `DashboardPage.tsx` (empty-state copy + verify toolbar)

Add empty-state for `boardFilter === 'approvals'`. Verify `BlockedBoardToolbar` (line 168) doesn't fire for approvals view — it should remain gated on `boardFilter === 'blocked'`. If a similar approvals toolbar is wanted, defer to a follow-up (out of M3 scope).

### 4.5 `BlockedBanner.tsx` (1-line URL normalization)

Line 53: `navigate('/tasks?status=blocked')` → `navigate('/tasks?board=blocked')`. Matches AppShell convention.

### 4.6 `App.tsx` (1-line redirect target update)

Line 67: `<Route path="/approvals" element={<Navigate to="/tasks?board=blocked" replace />} />` → `to="/tasks?board=approvals"`.

### 4.7 Cross-mode link buttons (L1-L5)

Per §3 destination-audit. L1, L2, L4, L5 land cleanly. L3 deferred or β-routed per M3-D8 ratification.

## 5. Risk register (updated, supersedes plan §6 entries for M3)

| Risk | Severity | Mitigation |
|---|---|---|
| `classifyTask` taxonomy change breaks existing /tasks?board=blocked semantics | LOW | Approvals already counted in BlockedBanner's HUMAN_REVIEW_REASONS — that logic is unchanged. Only the index URL routing splits. |
| Existing /pipeline bookmarks expect approvals — users go to /pipeline and see no approval card | LOW | Banner at top of /pipeline noting "Approvals moved to /tasks?board=approvals" for one cycle (mirrors plan §6 row 7). |
| AppShell banner re-target lands users on empty page if no pending approvals | LOW | DashboardPage empty-state copy is the mitigation; same UX as existing /tasks?board=blocked when no blocked tasks. |
| L3 (Health → Jobs) deep-link target doesn't exist | MEDIUM | Resolved by M3-D8 ratification — defer or use focus-param. |
| BlockedBanner URL normalization breaks deep-bookmarks from `?status=blocked` users | NEGLIGIBLE | Both `?status=` and `?board=` resolve via DashboardPage's URLSearchParams reader; the page filters by `?board=`, so `?status=` was a no-op anyway. Hygiene fix has no user-visible effect. |
| **DEMOTED from plan §6**: "approval-flow regression touches pipeline-watcher.py" — HIGH | **REMOVED** | Audit confirmed zero pipeline-watcher.py interaction. |
| **DEMOTED from plan §6**: "keep approval-card source file dual-imported during transition" | **REMOVED** | File doesn't move. Only mount sites change. Dual-import language doesn't apply. |

## 6. Smoke checklist (M3-specific, beyond plan §8)

- [ ] A task with `pipeline:needs-approval` label appears on `/tasks?board=approvals`, NOT on `/tasks?board=blocked`
- [ ] A task with both `pipeline:needs-approval` AND `blocked:yes` appears on `/tasks?board=approvals` (approvals takes precedence)
- [ ] AppShell approval banner click lands on `/tasks?board=approvals` with the correct count
- [ ] /pipeline page no longer shows approval cards; monitoring widgets remain intact
- [ ] Approve button on /tasks/:id (TaskDetail mount) still mutates state (per-task action surface preserved)
- [ ] Approve button on /tasks?board=approvals (new DashboardPage mount via classifyTask) mutates state (same component, same `/api/pipeline/:id/:action` call)
- [ ] L1: /reo drawer "Give feedback" button navigates to /reviews with the decision filter pre-populated
- [ ] L2: /findings → /tasks/:id button navigates correctly
- [ ] L3: routed per M3-D8 ratification (deferred or β-target)
- [ ] L4: /tasks/:id → /reo decision drawer opens correctly
- [ ] L5: /reviews → /tasks/:id (verify not already present in current UI before adding)
- [ ] BlockedBanner clicks land on `?board=blocked` (M3-D7 hygiene)

## 7. Resume-from-context guidance

**This document is the canonical decision log for M3.** If future-Jarvis loses session context mid-M3, re-read §1 (ratifications) and §2 (consumer table) to recover the work plan. §4 has the per-file specs; §5 the updated risk register; §6 the smoke checklist that gates AC-03.

**Sibling audit**: `decisions-to-reo-feature-parity-audit-2026-05-11.md` is the M2 equivalent. Together they constitute the canonical release-cycle decision log: M2 = "where did /decisions affordances go?"; M3 = "where did /pipeline approval-cards go?".

**Next action**: confirm Nate's L3 disposition (M3-D8), apply plan §5.3 + §6 edits, then commit Jarvis planning artifacts + push, then begin AIFred-Pro-Dev code per §4.

---

## Appendix A. Findings surfaced during visual-validate (M3-orthogonal)

Three findings discovered during the 2026-05-11 visual-validate session. None are M3-introduced; all pre-existed. Captured here so they don't get lost — file as separate workstreams.

### F-1 — `pipeline:needs-approval` does NOT halt the v2 pipeline state machine

**Symptom**: A synthetic test task (`AION-ac1e41de`) created with `pipeline:needs-approval` + `waiting:david` autonomously progressed through `staging:wait` → `evaluated:done` → `queued:done` → `active:running` without human approval. PipelineApprovalCard kept rendering throughout (per its label-check) but the executor did not honor the approval-gate semantics.

**Diagnosis**: The v2 pipeline classifier `classifyTaskPipeline` (`lib/board.ts:107`) only inspects `staging:|evaluated:|queued:|active:|completed:|blocked:` labels. It does NOT check `pipeline:needs-approval`. The approval gate is supposed to be enforced at the executor/dispatcher layer — that enforcement appears to be missing or broken.

**Evidence**: pipeline-watcher.py running as PID 15622 since 2026-05-09 21:00 (~4 days). Test task progressed within minutes of creation.

**Severity**: HIGH — human approval gates are advisory in practice, not enforcing. Tasks marked needs-approval will run anyway.

**Scope**: out of M3. File as separate workstream: "pipeline approval-gate enforcement" — investigate executor.py / pipeline-watcher.py code paths that should consume `pipeline:needs-approval` and halt progression; add the missing check.

**Mitigation while unresolved**: for synthetic / non-destructive test tasks, pair `pipeline:needs-approval` with `blocked:yes` to prevent auto-progression.

### F-2 — BlockedBanner human-count is page-scope, not global

**Symptom**: Red banner on /tasks shows "1 task blocked — awaiting your review" even when multiple human-blocked tasks exist in the wider system. Nate observed the banner reporting count=1 while many other blocked tasks existed in earlier test data.

**Diagnosis**: `BlockedBanner.tsx` iterates over a `tasks` prop passed by the parent page's filtered list. The banner counts blocked tasks visible in the current view, not in the global system. When the user is on a filtered view (any `?board=`, `?status=`, search filter, etc.), the banner reports only what's in scope.

**Severity**: LOW — cosmetic accuracy issue. The banner still alerts; it just under-counts on filtered views.

**Scope**: out of M3. File as a small UX fix: BlockedBanner should query a global "blocked tasks pending review" endpoint or use the parent's unfiltered task data.

### F-3 — Approval banner position (M3-internal, FIXED)

**Symptom**: Approval banner rendered at the bottom of the sidebar, below all clusters. On a long sidebar (4 sub-clusters + many items), the banner falls below the fold and users miss it.

**Fix**: Relocated banner to render between PROD_PINNED_TOP (Dashboard) and the cluster list. Now visible immediately on sidebar open, regardless of cluster expansion state. Both expanded + collapsed banner variants moved together.

**Severity**: was MEDIUM (visibility); now resolved.

**Scope**: M3-internal — fixed in same commit as core M3 work.

## Appendix B. M3 validation rig (clean board + curated synthetic tasks)

Visual-validate-only artifacts created on pulse_dev 2026-05-11 to give Nate a clean systematic-validation surface. Should be closed after M3 PR lands.

### Pre-validation state

- Bulk-closed all 37 open pulse_dev tasks at 2026-05-11T03:18Z via POST /api/v1/tasks/{id}/close.
- Closed tasks classify to `done` (closed_at < 7d) or `archived` (closed_at >= 7d) — neither appears on the M3-relevant boards.

### Curated 3-task validation set

| Key | Task ID | Critical labels | Expected board | Expected red banner | Expected sidebar badge |
|---|---|---|---|---|---|
| T1 | `AION-9427962a` | `pipeline:needs-approval` + `waiting:david` (no blocked:yes) | `?board=approvals` | NO | +1 |
| T2 | `AION-5812157e` | `blocked:yes` + `waiting:david` + `reason:max-retries` | `?board=blocked` | YES (count ≥ 1) | 0 (no pipeline:needs-approval) |
| T3 | `AION-767c6618` | `pipeline:needs-approval` AND `blocked:yes` + `waiting:david` | `?board=approvals` (M3-D2 precedence) | NO (approvals precedence) | +1 |

Expected aggregate state:
- Sidebar approval badge: **2 pending approvals** (T1 + T3)
- `/tasks?board=approvals`: shows T1 + T3 (NOT T2)
- `/tasks?board=blocked`: shows T2 only (NOT T1, NOT T3)
- BlockedBanner red banner on /tasks: "1 task blocked" (counts T2's `waiting:david` in HUMAN_REVIEW_REASONS)
- `/pipeline` page: no "Needs Approval" section anywhere; KPI top row is 3 cards (Queued / Executing / Blocked)
- `/approvals` URL: redirects to `/tasks?board=approvals`

### Caveat: T1 may auto-progress (F-1)

T1 lacks `blocked:yes` so the pipeline executor may advance its v2 labels (`staging:wait` → `evaluated:done` etc.) within minutes. As long as the task's `status` stays `open` AND `pipeline:needs-approval` stays present, classifyTask continues returning `'approvals'`. If T1 progresses to status=closed before validation finishes, regenerate it.

### Cleanup after validation

After M3 commit lands, close all three test tasks (T1, T2, T3) via `/api/v1/tasks/{id}/close` to keep pulse_dev clean.

