---
title: AIFred-Pro-Dev Dashboard Re-Cleave — Implementation Plan of Record
date: 2026-05-11
status: M1 SHIPPED (d001c75) / M2 SHIPPED (fc1546f) / M3 SHIPPED (fcf62df) — re-cleave PR complete on nate-dev; PR assembly pending
project: AIFred-Pro-Dev
target_branch: nate-dev
ratifies: ../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md (§11 Decisions captured 2026-05-11)
m3_audit: ../reports/m3-pipeline-approval-consumer-audit-2026-05-11.md (Option A + 8 consumer dispositions + M3-D1..D8 ratifications)
blocks:
  - aifred-pro-dev-reo-page.md (REO Validate is PAUSED until this lands)
related:
  - ../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md
  - ../reports/decisions-to-reo-feature-parity-audit-2026-05-11.md
  - ../reports/m3-pipeline-approval-consumer-audit-2026-05-11.md
  - aifred-pro-dev-reo-page.md
audience: Nate, future-Jarvis, future-David
estimated_effort: 3-5 days (single PR with 3 milestones for AC-03 review gates); M1 used ~0.5d, M2 used ~0.5d, M3 budgeted ~1d
---

# AIFred-Pro-Dev Dashboard Re-Cleave — Implementation Plan of Record

## 1. Vision

Re-cleave the AIFred-Pro-Dev dashboard's information architecture along a **PROD | OPS** top-level axis, with **4 sub-clusters** (PROD → Proj, Config ; OPS → Review, Monitor) replacing the current Main / Nexus / System sidebar grouping.

**Label refinement (2026-05-11, during M1 visual-validate)**: the underlying semantic dichotomy ratified in §11.2 (production-side doing vs operations-side observing) is preserved; only user-facing labels changed. WORK → PROD (producing/building/configuring), DIAGNOSE → OPS (reviewing/monitoring). Today → Projects (project-level artifacts), Direct → Config (direct configuration surfaces). Reflect → Review, Inspect → Monitor. Internal: `useActiveMode` hook, `ActiveMode` type (`'prod' | 'ops'`), `ModeToggle` component.

**Structural refinement (2026-05-11, during M1 visual-validate)**: Dashboard (`/`, OverviewPage) is now a **pinned item** above the PROJECTS expander in PROD mode, not an entry inside any sub-cluster. Reflects Dashboard's role as the global home rather than a project artifact. `/projects` (ProjectsListPage) moved to index 0 of PROJECTS sub-cluster — natural anchor for the cluster that bears its name. Dashboard remains the default landing page (App.tsx route at `/`).

Outcome: every page knows what user mode it serves; users know which side of the toggle to be on; the dashboard becomes the first concrete step toward the long-term Operations Center metaphor (foundational analysis §9.2).

**This is not a rebuild.** Most page implementations stay untouched. The work is sidebar regrouping, one redirect (/decisions → /reo), one page split (/pipeline approval cards), one feature audit (DecisionsPage.tsx parity), and a handful of cross-mode link buttons. Single shared PR per Nate's 2026-05-11 decision §11.5.

## 2. Scope

### In scope

- Top-level PROD | OPS shell toggle in `dashboard/frontend/src/components/layout/AppShell.tsx`
- Sidebar regrouping: every nav item placed into one of 4 sub-clusters (Proj / Config / Review / Monitor)
- `/decisions` → `/reo` Navigate redirect; DecisionsPage.tsx feature-parity audit; port-missing-features pass
- `/pipeline` split: approval-card affordance extracted into `/tasks?board=approvals` (or equivalent); monitoring widgets stay on /pipeline
- `/reo` added to sidebar (currently orphaned)
- `/notifications` removed from sidebar (top-bar bell remains)
- `/budget` + `/usage` moved from PROD side to OPS → Monitor
- Cross-mode link buttons (3-5): /reo decision → /reviews feedback; /findings issue → /tasks/:id; /health failing-job → /jobs/:id config
- Visual: PROD | OPS toggle should be a prominent primary-color UI affordance
- Tests: smoke checks for every old route still resolves (no 404s on existing bookmarks)

### Out of scope (deferred to long-term Operations Center vision §9.2)

- Operations Center top-bar redesign (active profile, $ burn rate, last 5 critical events)
- Per-page consistent headers with mode badges and "what is this for?" tooltips
- Responsibility-tracking as primary task-axis (replacing status)
- Profile-aware dashboard reshaping
- AI organization roster page
- Pipeline visualization on every task detail page
- DecisionsPage.tsx file deletion (defer one release cycle per Phase 5.5 audit policy)

## 3. Decisions ratified (anchors)

From `../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md` §11:

- **§11.1**: 4 modes (DOING incl. planning / DIRECTING / REFLECTING / DIAGNOSING). PLANNING absorbed into DOING.
- **§11.2**: WORK | DIAGNOSE 2-way toggle at top level. 4 sub-clusters total. *(Label-refined during M1 visual-validate: PROD | OPS at user surface.)*
- **§11.3**: /decisions → /reo redirect + consolidate features. Full subsume. *(SHIPPED in M2 with 35-affordance audit.)*
- **§11.4**: Operations Center is the durable long-term metaphor.
- **§11.5**: All 7 consolidations in one shared PR, with 3 milestones for AC-03 review gates inside.
- **§11.6**: Mapping accepted as-is; completeness verification natural during impl.
- **§11.7**: REO Validate paused until this PR lands.

### M3-specific ratifications (2026-05-11, audit-locked)

From `../reports/m3-pipeline-approval-consumer-audit-2026-05-11.md` §1:

- **M3-D1**: Approvals become a **distinct board column** (Option A), not a sub-view of blocked.
- **M3-D2**: `classifyTask` checks `pipeline:needs-approval` BEFORE `isBlocked`.
- **M3-D3**: `'approvals'` added to `BoardColumn` type in `lib/board.ts`.
- **M3-D4**: `/tasks?board=approvals` is the canonical URL for the approval index.
- **M3-D5**: `PipelineApprovalCard.tsx` does NOT move; only mount sites change. (Component is already extracted at `components/pipeline/PipelineApprovalCard.tsx`.)
- **M3-D6**: M3 risk class **MEDIUM** (was HIGH). No `pipeline-watcher.py` interaction, no Pulse mutation surface change.
- **M3-D7**: `BlockedBanner.tsx` URL param normalized from `?status=blocked` to `?board=blocked` (hygiene fix).
- **M3-D8** *(pending Nate ratification at visual-validate gate)*: L3 cross-mode link (Health failing job → /jobs/:id) — `/jobs/:id` route does not exist. Default proposal: L3-Option β (revise to `/jobs?focus=<id>` semantics with focus-state handling on RecurringJobsPage). Alternative: defer L3 entirely.

## 4. Architecture: the new sidebar IA

```
┌─ TOP-OF-SIDEBAR: PROD | OPS TOGGLE ──────┐
│                                          │
│  PROD MODE (default)                     │
│  ────────────────                        │
│  ◈ /  Dashboard (pinned — default home)  │
│                                          │
│  ▼ PROJECTS                              │
│    /projects  Projects                   │
│    /projects/:id          (deep-link)    │
│    /tasks  Tasks                         │
│    /board  Board                         │
│    /triage  Triage                       │
│    /digest  Digest                       │
│    /cross-project  Cross-Project         │
│    /create  Create                       │
│                                          │
│  ▼ Config                                │
│    /jobs  Recurring Jobs                 │
│    /personas  Personas                   │
│    /automation  Rules                    │
│    /pulsars  Pulsars                     │
│    /document-guard  Doc Guard            │
│    /settings  Settings                   │
│    /account  Account                     │
│                                          │
│  OPS MODE                                │
│  ──────────────                          │
│  ▼ Review                                │
│    /reviews  AI Reviews (feedback queue) │
│    /reo  Decision Archive (was /decisions)│
│    /patterns  Patterns                   │
│    /cortex  Cortex                       │
│    /report  Reports                      │
│                                          │
│  ▼ Monitor                               │
│    /health  Health                       │
│    /pipeline  Pipeline (monitoring only) │
│    /observability  Observability         │
│    /nexus-ops  Nexus Operations          │
│    /token-compression  Compression       │
│    /usage  Usage                         │
│    /findings  Findings                   │
│    /budget  Budget                       │
│                                          │
│  TOP BAR                                 │
│  ────────                                │
│    NotificationBell (was /notifications) │
│    SessionCountdown                      │
│    ObservabilityBar                      │
│  /documentation  (footer / collapsed)    │
└──────────────────────────────────────────┘
```

**Sidebar collapsed state**: PROD | OPS toggle is icons-only; sub-clusters collapse to flat icon lists. Toggle persists in localStorage.

**Default**: PROD mode active on first load. Keystroke shortcut to flip (`Cmd+\` / `Ctrl+\`).

## 5. Milestones

### Milestone 1: Nav shell + Sidebar IA — SHIPPED 2026-05-11

**Status**: SHIPPED on AIFred-Pro-Dev `nate-dev` as commit `d001c75` (2026-05-11). All AC items checked. AC-03 gate technical 4.5 / progress 5.0 → PASS. One visual-validate iteration caught 2 bugs (toggle revert on non-/notifications pages, cluster-chevron silent expand) — both fixed and re-validated before commit.

**Goal**: New sidebar renders correctly with 4 sub-clusters under PROD | OPS. All existing routes resolve. No functional page changes yet (DecisionsPage.tsx still works; /pipeline still mixes monitoring + approvals).

**Files touched** (committed in `d001c75`):
- NEW: `dashboard/frontend/src/hooks/useActiveMode.ts` (51 LOC) — `'prod' | 'ops'` state, localStorage, Cmd+\ / Ctrl+\ handler with input-focus guard
- NEW: `dashboard/frontend/src/components/layout/ModeToggle.tsx` (57 LOC) — pill-toggle, expanded + collapsed variants
- MODIFIED: `dashboard/frontend/src/components/layout/AppShell.tsx` (+229/-122) — full IA rebuild with `PROD_PINNED_TOP` constant for Dashboard pin

**Acceptance criteria** (M1):
- [x] Sidebar renders with two top-level modes (PROD | OPS) and four sub-clusters total (Projects / Config / Review / Monitor)
- [x] Default active mode is PROD; toggle persists in localStorage across reloads
- [x] Cmd+\ keyboard shortcut flips active mode
- [x] Manual toggle action wins over auto-flip; auto-flip fires ONLY on URL change, not on user toggle (ref-based useEffect)
- [x] Cluster chevron expand/collapse works on every page, including pages whose route is inside the cluster
- [x] **Dashboard pinned above PROJECTS expander in PROD mode** (not inside any sub-cluster)
- [x] **`/` (Dashboard / OverviewPage) is the default landing page** — preserved via App.tsx route
- [x] **/projects appears at the TOP of the PROJECTS sub-cluster items list** (above /tasks)
- [x] Every page from the 35-page inventory is present in exactly one sub-cluster OR pinned (no orphans, no doubles)
- [x] /reo appears in OPS → Review (was orphaned)
- [x] /notifications removed from sidebar; bell in top bar continues to work
- [x] /budget + /usage appear under OPS → Monitor (not PROD)
- [x] Collapsed-sidebar mode works for both modes
- [x] No regression on existing badge counts (actionCount, inProgress, researchQueue)
- [x] Approval-pending alert banner still appears at sidebar bottom when approvalCount > 0
- [x] Mobile menu reflects the new structure (Dashboard pinned at top of Prod section, above Projects sub-cluster header)

**AC-03 review gate**: PASS 2026-05-11
- **Technical review**: 4.5 — clean code, follows existing patterns; -0.5 for ride-or-die initial bugs caught only at visual-validate.
- **Progress review**: 5.0 — all 7 §11 ratifications + impl-time refinements documented.

---

### Milestone 2: /decisions → /reo consolidation — SHIPPED 2026-05-11

**Status**: SHIPPED on AIFred-Pro-Dev `nate-dev` as commit `fc1546f` (2026-05-11). All AC items checked; AC-03 gate technical 4.5 / progress 5.0 → PASS. Visual-validate confirmed by Nate before commit. Plan §5.2 ACs detailed below for reference.

**Audit report**: `Jarvis/projects/project-aion/reports/decisions-to-reo-feature-parity-audit-2026-05-11.md` — 35-item affordance table, 24 already-present / 3 improved / 3 different-but-valid / 2 ported / 8 intentional drops with rationale.

**Goal**: /decisions URL is a redirect to /reo with parameter-mapping where useful. DecisionsPage.tsx feature-parity audit complete; missing features ported to ReoPage.tsx. DecisionsPage.tsx file kept (unreferenced) for one release cycle as fallback.

**Files to touch**:
- `dashboard/frontend/src/App.tsx` — replace `<Route path="/decisions" element={<DecisionsPage />} />` with `<Route path="/decisions" element={<Navigate to="/reo" replace />} />` (with optional query-param translation if needed)
- `dashboard/frontend/src/pages/DecisionsPage.tsx` — keep file in tree, unreferenced. Add deprecation comment header.
- `dashboard/frontend/src/pages/ReoPage.tsx` — port any features identified in feature-parity audit (likely: any storyline-cross-table-join affordances not yet in REO's case-file drawer; specific filter shapes; export formats)
- `dashboard/frontend/src/api/decisions.ts` — keep file; mark deprecated; ReoPage shouldn't import from it
- Tests: existing `/decisions` deep-links resolve to `/reo` with reasonable filter state

**Feature-parity audit** (must precede the redirect):
1. Read both pages side-by-side
2. List every visible affordance in DecisionsPage.tsx
3. For each, mark: PRESENT_IN_REO / MISSING_IN_REO_PORTABLE / MISSING_IN_REO_INTENTIONAL_DROP
4. Port the MISSING_IN_REO_PORTABLE items into ReoPage.tsx
5. Document the audit in a short report under `Jarvis/projects/project-aion/reports/` for posterity

**Acceptance criteria** (M2):
- [x] /decisions URL resolves with HTTP 200 and renders ReoPage at /reo (via DecisionsRedirect wrapper)
- [x] All known historical query patterns (?actor=, ?decision_type=, ?outcome=, ?thread_id=) preserved through redirect; ReoPage `readInitialFilters()` pre-populates filter state on mount
- [x] ?drawer= (legacy thread_id-based drawer) silently ignored — drawer model changed to event_id; graceful degradation
- [x] Feature-parity audit report written and committed (Jarvis side)
- [x] PORT-A (load-bearing): URL search-param translation
- [x] PORT-B (visual enhancement): confidence bar in TimelineList row (≥85% green / 60-84% amber / <60% red / null=hidden)
- [x] No regression on existing /reo functionality (B4 filters, B6 drawer, MVP polish all still work — verified by 9/9 smoke-reo.sh pass)
- [x] DecisionsPage.tsx remains in tree with @deprecated JSDoc header + cross-reference to audit report
- [x] api/decisions.ts marked @deprecated; only consumer is DecisionsPage (paired deletion at Phase 5.5)
- [x] DecisionsPage import removed from App.tsx (file orphan in tree per keep-one-cycle)
- [x] Sidebar shows /reo as "Decision Archive" (M1 placement honored)

**AC-03 review gate**: PASS 2026-05-11
- **Technical review**: 4.5 — clean code, audit-driven implementation, tsc strict-clean, no API changes needed, deprecation headers explicit, orphan-check passes. -0.5 because runtime interaction unverified by Jarvis (verified by Nate visual-validate before commit).
- **Progress review**: 5.0 — ratification §11.3 ("full subsume") executed; 35-affordance audit captures every disposition; keep-one-cycle decision honored.

---

### Milestone 3: /pipeline approval-column split + cross-mode link buttons (~1d, MEDIUM risk)

**Status**: SHIPPED 2026-05-11 (commit `fcf62df` on AIFred-Pro-Dev nate-dev). +87/-124 across 12 files. AC-03 PASS 4.5/5.0.

**M3-D8 + M3-D9 ratifications (made at visual-validate gate)**:
- **M3-D8** (L3): **β-revise** — `/health` job rows clickable → `/jobs?focus=<name>`. RecurringJobsPage reads `?focus=` URL param on mount via `useSearchParams`, opens matching job's `DetailDrawer`, strips param via `setSearchParams({ replace: true })`. Verified end-to-end via `/jobs?focus=creative-think` → DetailDrawer opens correctly.
- **M3-D9** (L1): **γ-defer entirely** — REO drawer → `/reviews?decision_id=N` deferred. REO's B7-UI in-page feedback connector (3-state radio + comment, console.log on submit) covers the feedback intent without cross-mode navigation. Revisit if B7-UI proves insufficient at REO Validate phase.

**Sub-milestones shipped**:
- **M3a (server fix)**: `dashboard/server/routes/stats.ts` `classifyTask` now checks `pipeline:needs-approval` BEFORE `isBlocked`, mirroring frontend M3-D2. Fixes sidebar Tasks badge over-count (was 5 for 3 tasks; now correctly 3). Surfaced during visual-validate; uncovered the parallel classifyTask drift between server and frontend.
- **M3b (L2)**: `FindingsPage.tsx` related-task link upgraded `<a href>` → `<Link to>` (SPA navigation).
- **M3c (L3, M3-D8-β)**: `HealthPage.tsx` job rows clickable → `/jobs?focus=<name>`; `RecurringJobsPage.tsx` reads `?focus=` and opens matching job's `DetailDrawer`.
- **M3d (L4)**: `TaskDetailPage.tsx` gains teal "View in REO →" button → `/reo?task_id=<id>`; `ReoPage.tsx` `readInitialFilters` extended to read `task_id` URL param.
- **M3e (L5)**: `ReviewPage.tsx:634` already linked to `/tasks/:id` — verified pre-existing wiring, no code change.

**Goal**: /pipeline becomes monitoring-only. Approvals become a **distinct board column** (Option A, M3-D1) at `/tasks?board=approvals`, no longer subsumed into `?board=blocked`. Cross-mode link buttons (L1-L5) connect the 4 modes.

**Audit-locked surface** (from `../reports/m3-pipeline-approval-consumer-audit-2026-05-11.md`):

| File | Disposition | Net change |
|---|---|---|
| `dashboard/frontend/src/lib/board.ts` | IN_SCOPE_NEW (load-bearing) | Add `'approvals'` to `BoardColumn` type; `classifyTask` returns `'approvals'` for `pipeline:needs-approval` BEFORE `isBlocked` check |
| `dashboard/frontend/src/components/layout/AppShell.tsx` | IN_SCOPE | Two-link re-target: approval banner `/tasks?board=blocked` → `/tasks?board=approvals` (expanded + collapsed) |
| `dashboard/frontend/src/pages/PipelinePage.tsx` | IN_SCOPE | ~4-line removal: drop import, drop JSX mount, drop empty-state. Monitoring widgets unchanged. |
| `dashboard/frontend/src/pages/DashboardPage.tsx` | IN_SCOPE | Add approvals empty-state copy. classifyTask filter wiring inherits from §lib/board.ts change. |
| `dashboard/frontend/src/components/board/BlockedBanner.tsx` | IN_SCOPE_NEW (hygiene) | Normalize `/tasks?status=blocked` → `/tasks?board=blocked` (M3-D7) |
| `dashboard/frontend/src/App.tsx` | IN_SCOPE_NEW (additive) | `/approvals` redirect target: `/tasks?board=blocked` → `/tasks?board=approvals` (one-line) |
| `dashboard/frontend/src/components/pipeline/PipelineApprovalCard.tsx` | OUT_OF_SCOPE | File does NOT move (M3-D5). 240 LOC, already extracted. |
| `dashboard/frontend/src/components/tasks/TaskDetail.tsx` | OUT_OF_SCOPE | Per-task action surface preserved. No edit. |
| `dashboard/frontend/src/components/board/KanbanCard.tsx` | OUT_OF_SCOPE | Uses `classifyTaskPipeline` (v2 columns), not `classifyTask`. No change. |
| `pulse/app.py` | OUT_OF_SCOPE | Read-only `/api/v1/pipeline/*` endpoints. Mutations go through dashboard-server. |
| `.claude/jobs/pipeline-watcher.py` | OUT_OF_SCOPE | Zero approval-flow code paths. No change. |

**Cross-mode link buttons** (M3-D8 pending Nate ratification at visual-validate):

| ID | From | To | Status |
|---|---|---|---|
| L1 | /reo case-file drawer | /reviews?decision_id=N | IN_SCOPE — verify ReviewPage filter wiring |
| L2 | /findings entry with linked task | /tasks/:id | IN_SCOPE |
| L3 | /health failing job | /jobs/:id | **DEFER or β-revise** — `/jobs/:id` route does not exist. Default proposal: revise to `/jobs?focus=<id>` with focus-state handling on RecurringJobsPage. Ratify at visual-validate. |
| L4 | /tasks/:id with active decision | /reo?decision_id=N | IN_SCOPE — uses existing B6 deep-link |
| L5 | /reviews approved-action | /tasks/:id | IN_SCOPE — verify not already present before adding |

**Acceptance criteria** (M3):
- [ ] `lib/board.ts`: `'approvals'` added to `BoardColumn`; `classifyTask` returns `'approvals'` for `pipeline:needs-approval`
- [ ] AppShell approval banner routes to `/tasks?board=approvals` in expanded + collapsed variants
- [ ] /pipeline page no longer shows approval-card UI; monitoring widgets (stage metrics, dispatcher health, recent executions) intact
- [ ] /tasks?board=approvals shows approval-pending tasks with full PipelineApprovalCard UX (approve/modify/pause/cancel)
- [ ] A task with both `pipeline:needs-approval` AND `blocked:yes` lands on `?board=approvals` (precedence per M3-D2)
- [ ] BlockedBanner clicks land on `/tasks?board=blocked` (M3-D7 hygiene)
- [ ] /approvals legacy route redirects to `/tasks?board=approvals` (was `?board=blocked`)
- [ ] L1, L2, L4 cross-mode buttons land on their target pages with correct deep-link state
- [ ] L5 button only added if not already present on /reviews
- [ ] L3 resolved per M3-D8 ratification
- [ ] No regression on existing `?board=blocked` semantics (still routes blocked-not-pending-approval tasks)
- [ ] DashboardPage approvals empty-state copy renders when no pending approvals
- [ ] tsc strict-clean, vite HMR clean, smoke-reo.sh 9/9, HTTP-200 sweep on key routes

**AC-03 review gate**:
- **Technical review** (1-5): code move + classifyTask taxonomy + cross-mode buttons. Risk class: MEDIUM (per M3-D6). Expected score: 4-5.
- **Progress review** (1-5): completes ratification §11.5 + M3-D1..D7. Expected score: 5.
- **Proceed criteria**: both ratings ≥ 4 → PR assembly.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| ~~/pipeline approval-card move breaks production approval workflow~~ | ~~HIGH~~ | **REMOVED** by M3-D6 audit: PipelineApprovalCard.tsx already extracted, no Pulse mutation surface change, no pipeline-watcher.py interaction. Replaced by row below. |
| `classifyTask` taxonomy change accidentally re-routes existing blocked tasks | LOW | `pipeline:needs-approval` check ordered BEFORE `isBlocked` so approvals split out cleanly; blocked-without-approval semantics unchanged. Test: a task with `blocked:yes` AND NO `pipeline:needs-approval` still lands on `?board=blocked`. |
| /decisions deep-link parameter translation drops important state | MEDIUM | **MITIGATED in M2** — DecisionsRedirect wrapper preserves search; ReoPage readInitialFilters pre-populates state. |
| Sidebar toggle is jarring on first-flip; localStorage default annoys users on shared machines | LOW | **MITIGATED in M1** — sensible default (PROD); persists; keystroke flip; mobile menu shows both sides. |
| DecisionsPage.tsx kept-in-tree as fallback creates dead-code drift | LOW | @deprecated header in place; paired deletion (with api/decisions.ts) scheduled in REO Phase 5.5 PRE-SHIP AUDIT. |
| Cross-mode link button proliferation creates cognitive overhead | MEDIUM | Capped at 5 (L1-L5); 1 is conditionally added (L5 only if not already present); resist adding more without explicit user-flow justification. |
| L3 (/health → /jobs/:id) deep-link target route doesn't exist | MEDIUM | Resolved by M3-D8 ratification — defer or β-route to `/jobs?focus=<id>`. |
| ~~3-5d estimate undersells the feature-parity audit (M2)~~ | ~~MEDIUM~~ | **RETIRED** — M2 used 0.5d incl. audit; audit-first sequence paid off. |
| Mobile menu IA is awkward when both sides are shown flat | LOW | **MITIGATED in M1** — section headers (PROD / OPS) above sub-cluster items; same structure, single scroll. |
| Existing /pipeline bookmarks now show different content (no approvals) | MEDIUM | One-time top-of-page banner on /pipeline noting "Approvals moved to /tasks?board=approvals" for one release cycle, then remove. |
| BlockedBanner URL normalization breaks deep-bookmarks from `?status=blocked` users | NEGLIGIBLE | Both params resolve via DashboardPage URLSearchParams reader; the page only filters by `?board=`, so `?status=` was a silent no-op. Hygiene fix has no user-visible effect. |

## 7. Acceptance criteria (PR-level, all milestones)

- [ ] M1, M2, M3 acceptance criteria all checked
- [ ] AC-03 review gates passed for all 3 milestones (technical ≥ 4 AND progress ≥ 4)
- [ ] No regression on any other page (verify by smoke walk through all 35 routes)
- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev.yml --project-name=aifred-pro-dev up -d` brings up clean
- [ ] Vite hot-reload (`:8702`) and prod-bundle (`:8701`) both serve correctly
- [ ] PR description summarizes user-visible changes + IA rationale + links to foundational analysis §11
- [ ] PR pushed to davidmoneil/AIFred-Pro nate-dev
- [ ] Coordinated Telegram notice to David if appropriate

## 8. Smoke checklist (run after each milestone, before next)

- [ ] Sidebar renders both desktop + mobile
- [ ] WORK | DIAGNOSE toggle flips correctly; persists; keystroke works
- [ ] Every route in App.tsx resolves with HTTP 200 (or correct redirect)
- [ ] `/health` shows dispatcher heartbeat
- [ ] `/tasks` shows task table with badge counts
- [ ] `/reo` shows REO timeline with B4 filters, B6 drawer
- [ ] `/reviews` shows feedback queue with right/wrong/adjust working
- [ ] `/decisions` redirects to `/reo` (M2 onward)
- [ ] `/pipeline` shows monitoring only (M3 onward); approvals on `/tasks?board=approvals`
- [ ] Cross-mode link buttons land in target pages with correct deep-link state (M3 only)
- [ ] No console errors on any page load
- [ ] Vite hot-reload (`:8702`) still propagates edits in <2s

## 9. Out of scope (explicitly deferred)

| Item | Why deferred | When |
|---|---|---|
| Operations Center top-bar redesign | R&D-scale; analysis §9.2 long-term vision | Months |
| Per-page mode-badge + "what is this for?" tooltip | UX polish; can come after IA cleavage settles | After PR lands |
| Responsibility-tracking as primary task axis | Schema-level change; separate workstream | Months |
| Profile-aware dashboard | YAML profile UI surface; separate workstream | Months |
| AI organization roster page | New page; analysis §9.2 long-term vision | Months |
| Pipeline visualization on task detail | Schema-level change; separate workstream | Months |
| DecisionsPage.tsx file deletion | One release cycle of fallback per policy | After REO Phase 5.5 audit confirms parity |
| REO Validate UX walkthrough | Blocked by this PR | After this PR lands |
| REO Harden H1-H8 | Blocked by REO Validate | After Validate |

## 10. Status / next action

**Status**: M1 SHIPPED 2026-05-11 (`d001c75`) / M2 SHIPPED 2026-05-11 (`fc1546f`) / M3 SHIPPED 2026-05-11 (`fcf62df`) — re-cleave PR complete on nate-dev. PR assembly pending Nate's go-ahead.

**Completed milestones**:
- **M1** (commit `d001c75`): AppShell PROD|OPS toggle + 4 sub-clusters + pinned Dashboard. AC-03 PASS 4.5/5.0.
- **M2** (commit `fc1546f`): /decisions → /reo redirect via DecisionsRedirect + 2 ported affordances. AC-03 PASS 4.5/5.0.
- **M3** (commit `fcf62df`): /pipeline approval-card split + M3a server-side classifyTask alignment fix (sidebar counter 5→3) + 4 of 5 cross-mode link buttons (L2, L3-β, L4, L5). L1 deferred per M3-D9-γ. AC-03 PASS 4.5/5.0.

**Pending next-action sequence**:
1. SIGCONT `pipeline-watcher.py` PID 15622; observe T1/T2/T3 behavior (expected: T1+T3 auto-advance per F-1; T2 stays blocked).
2. Close T1/T2/T3 via POST `/api/v1/tasks/{id}/close` (actor=jarvis).
3. **PR assembly** — single shared PR `nate-dev → main` on davidmoneil/AIFred-Pro per §11.5. Range: `d001c75..fcf62df` (3 commits). PR description summarizes M1+M2+M3 collectively per plan §7.
4. REO Validate workstream resumes after PR lands.

**Plan-of-record commits referenced**:
- Foundational analysis: `18ba329` (Jarvis main)
- M2 audit + plan revisions: `a3bcdcc` (Jarvis main)
- M3 audit + plan revisions: this commit (Jarvis main)
- M1 ship: `d001c75` (AIFred-Pro-Dev nate-dev)
- M2 ship: `fc1546f` (AIFred-Pro-Dev nate-dev)
- M3 ship: pending

---

*Status: M1 + M2 SHIPPED, M3 IN PROGRESS (post-audit). Code begins immediately after planning-artifact commit lands.*
