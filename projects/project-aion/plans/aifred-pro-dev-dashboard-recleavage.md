---
title: AIFred-Pro-Dev Dashboard Re-Cleave — Implementation Plan of Record
date: 2026-05-11
status: M1 IN PROGRESS — label refinement applied during visual-validate (WORK→PROD, DIAGNOSE→OPS, Today→Proj, Direct→Config, Reflect→Review, Inspect→Monitor)
project: AIFred-Pro-Dev
target_branch: nate-dev
ratifies: ../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md (§11 Decisions captured 2026-05-11)
blocks:
  - aifred-pro-dev-reo-page.md (REO Validate is PAUSED until this lands)
related:
  - ../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md
  - aifred-pro-dev-reo-page.md
audience: Nate, future-Jarvis, future-David
estimated_effort: 3-5 days (single PR with 3 milestones for AC-03 review gates)
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
- **§11.2**: WORK | DIAGNOSE 2-way toggle at top level. 4 sub-clusters total.
- **§11.3**: /decisions → /reo redirect + consolidate features. Full subsume.
- **§11.4**: Operations Center is the durable long-term metaphor.
- **§11.5**: All 7 consolidations in one shared PR, with 3 milestones for AC-03 review gates inside.
- **§11.6**: Mapping accepted as-is; completeness verification natural during impl.
- **§11.7**: REO Validate paused until this PR lands.

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

### Milestone 1: Nav shell + Sidebar IA (~1.5d)

**Goal**: New sidebar renders correctly with 4 sub-clusters under PROD | OPS. All existing routes resolve. No functional page changes yet (DecisionsPage.tsx still works; /pipeline still mixes monitoring + approvals).

**Files to touch**:
- `dashboard/frontend/src/components/layout/AppShell.tsx` — replace MAIN_NAV / NEXUS_NAV / MANAGE_NAV with PROD_NAV / OPS_NAV containing nested sub-clusters; add toggle component; persist active mode in localStorage; add Cmd+\ shortcut
- `dashboard/frontend/src/App.tsx` — no route changes in M1 (Milestone 2 adds the /decisions redirect)
- New file: `dashboard/frontend/src/components/layout/ModeToggle.tsx`
- New file: `dashboard/frontend/src/hooks/useActiveMode.ts`
- Tests: existing smoke (`scripts/smoke-reo.sh` etc.) must still pass

**Acceptance criteria** (M1):
- [ ] Sidebar renders with two top-level modes (PROD | OPS) and four sub-clusters total (Projects / Config / Review / Monitor)
- [ ] Default active mode is PROD; toggle persists in localStorage across reloads
- [ ] Cmd+\ keyboard shortcut flips active mode
- [ ] Manual toggle action wins over auto-flip; auto-flip fires ONLY on URL change, not on user toggle (ref-based useEffect)
- [ ] Cluster chevron expand/collapse works on every page, including pages whose route is inside the cluster
- [ ] **Dashboard pinned above PROJECTS expander in PROD mode** (not inside any sub-cluster)
- [ ] **`/` (Dashboard / OverviewPage) is the default landing page when user opens the dashboard with no path** — already true via App.tsx `<Route path="/" element={<OverviewPage />} />`; preserve
- [ ] **/projects appears at the TOP of the PROJECTS sub-cluster items list** (above /tasks)
- [ ] Every page from the 35-page inventory is present in exactly one sub-cluster OR pinned (no orphans, no doubles)
- [ ] /reo appears in OPS → Review (was orphaned)
- [ ] /notifications removed from sidebar; bell in top bar continues to work
- [ ] /budget + /usage appear under OPS → Monitor (not PROD)
- [ ] Collapsed-sidebar mode works for both modes
- [ ] No regression on existing badge counts (actionCount, inProgress, researchQueue)
- [ ] Approval-pending alert banner still appears at sidebar bottom when approvalCount > 0
- [ ] Mobile menu reflects the new structure (Dashboard pinned at top of Prod section, above Projects sub-cluster header)

**AC-03 review gate**:
- **Technical review** (1-5): sidebar IA changes only, no new feature surface, no API changes. Risk class: UX/CSS only. Expected score: 4-5.
- **Progress review** (1-5): PRD alignment with foundational analysis §9.1 + Q1-Q2 ratifications. Expected score: 4-5.
- **Proceed criteria**: both ratings ≥ 4. If not, REMEDIATE before M2 starts.

---

### Milestone 2: /decisions → /reo consolidation (~1.5d)

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
- [ ] /decisions URL resolves with HTTP 200 and renders ReoPage at /reo
- [ ] All known historical query patterns (?decision_id=, ?thread_id=) still work (translate via Navigate's `to` if needed)
- [ ] Feature-parity audit report written and committed
- [ ] Any portable features moved into ReoPage.tsx without regressing existing /reo functionality (B4 filters, B6 drawer, MVP polish all still work)
- [ ] DecisionsPage.tsx remains in tree with deprecation header
- [ ] Smoke `scripts/smoke-reo.sh` passes
- [ ] Sidebar shows /reo as "Decision Archive" (or similar) — no longer "REO" jargon if user-facing label matters

**AC-03 review gate**:
- **Technical review** (1-5): code consolidation, redirect, feature port. Risk class: UX regression on /reo. Expected score: 4-5.
- **Progress review** (1-5): completes ratification §11.3. Expected score: 5.
- **Proceed criteria**: both ratings ≥ 4.

---

### Milestone 3: /pipeline split + cross-mode link buttons (~1.5d)

**Goal**: /pipeline becomes monitoring-only (DIAGNOSING). The approval-card affordance moves to /tasks under a new `?board=approvals` view (or a dedicated /approvals-queue page if cleaner). Cross-mode link buttons added between key pages.

**Files to touch**:
- `dashboard/frontend/src/pages/PipelinePage.tsx` — remove approval-card section; keep stage metrics, dispatcher health, recent executions
- `dashboard/frontend/src/pages/DashboardPage.tsx` — add `?board=approvals` view (mirror of the existing blocked/ready/backlog board views) with the approval-card UX ported from /pipeline
- `dashboard/frontend/src/components/tasks/` — likely a new `ApprovalCard.tsx` or move from /pipeline
- `dashboard/frontend/src/pages/ReoPage.tsx` — add "Give feedback on this decision" button in the case-file drawer that opens /reviews filtered to that decision (deep-link)
- `dashboard/frontend/src/pages/FindingsPage.tsx` — for findings that link to a task, add an inline "Open task" button that navigates to /tasks/:id
- `dashboard/frontend/src/pages/HealthPage.tsx` — for failing jobs, add "Configure this job" button that navigates to /jobs/:id
- `dashboard/frontend/src/components/layout/AppShell.tsx` — verify the approval-pending sidebar banner still routes correctly after the move

**Cross-mode link button spec**:
| From | To | Trigger affordance | Mode bridge |
|---|---|---|---|
| /reo case-file drawer | /reviews?decision_id=N | "Give feedback" button | REFLECT (passive) → REFLECT (active) |
| /findings entry with linked task | /tasks/:id | "Open task" button | DIAGNOSE → DOING |
| /health failing job | /jobs/:id | "Configure this job" button | DIAGNOSE → DIRECT |
| /tasks/:id with active decision | /reo?decision_id=N | "Decision details" button | DOING → REFLECT |
| /reviews approved-action | /tasks/:id | "View task" button (if not already present) | REFLECT → DOING |

**Acceptance criteria** (M3):
- [ ] /pipeline no longer shows approval-card UI; only monitoring widgets
- [ ] /tasks?board=approvals (or equivalent) shows the approval-card UX with full functionality (approve/deny/escalate)
- [ ] Approval-pending sidebar banner routes to the new approvals view
- [ ] All 5 cross-mode link buttons land in their target pages (smoke: click each, verify destination + correct deep-link state)
- [ ] No regression on /pipeline monitoring widgets
- [ ] Existing /pipeline deep-links (if any) still work or are redirected

**AC-03 review gate**:
- **Technical review** (1-5): code move + new affordances. Risk class: approval-flow regression. Expected score: 4-5.
- **Progress review** (1-5): completes ratification §11.5. Expected score: 5.
- **Proceed criteria**: both ratings ≥ 4.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| /pipeline approval-card move breaks production approval workflow | HIGH | Test on dev (:8702) end-to-end before any deletion from /pipeline. Keep approval-card source file dual-imported during transition |
| /decisions deep-link parameter translation drops important state | MEDIUM | Audit feature-parity report explicitly lists query-param shapes; Navigate's `to` includes search-string preservation where needed |
| Sidebar toggle is jarring on first-flip; localStorage default annoys users on shared machines | LOW | Sensible default (WORK); preference persists; keystroke flip; mobile menu shows both sides flatly |
| DecisionsPage.tsx kept-in-tree as fallback creates dead-code drift | LOW | Add deprecation header; schedule deletion in REO Phase 5.5 PRE-SHIP AUDIT (one cycle after) |
| Cross-mode link button proliferation creates cognitive overhead | MEDIUM | Limit to the 5 explicit links above; resist adding more without explicit user-flow justification |
| 3-5d estimate undersells the feature-parity audit (M2) | MEDIUM | Audit is the highest-uncertainty step; allow up to 0.5d buffer; if it stretches, milestone gates catch this before M3 starts |
| Mobile menu IA is awkward when both sides are shown flat | LOW | Mobile menu shows section headers (WORK / DIAGNOSE) above sub-cluster items; same structure, single scroll |
| Existing /pipeline bookmarks now show different content (no approvals) | MEDIUM | One-time top-of-page banner on /pipeline noting "Approvals moved to /tasks?board=approvals" for 30 days, then remove |

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

**Status**: DRAFT — pending Nate's go-ahead before Milestone 1 implementation begins.

**Next action sequence**:
1. Nate reviews this plan; approves or requests revisions
2. On approval, Milestone 1 begins: AppShell.tsx sidebar rebuild
3. M1 acceptance criteria checked + AC-03 review gate before M2 starts
4. M2 (decisions consolidation) and M3 (pipeline split + cross-mode links) follow same pattern
5. PR pushed to nate-dev when all 3 milestones gated through
6. REO Validate resumes after PR lands

**Plan-of-record commits referenced**:
- Foundational analysis: `18ba329` (Jarvis main)
- REO build state: B1+B3 `086f08d`/`54d890a`, B4 `8fd2446`, B6+B7-UI `6f40b1b`, Watchdog W1 `f511e16`, MVP polish `0f17f73`, dev-env Path 2 `faa9406`, dev-env Path 1 `23e838c` (all on AIFred-Pro-Dev nate-dev)

---

*Status: DRAFT. Pending Nate's go-ahead. Implementation begins on approval.*
