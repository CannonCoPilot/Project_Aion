---
title: DecisionsPage.tsx → ReoPage.tsx Feature-Parity Audit
date: 2026-05-11
status: COMPLETE — feeds M2 of dashboard re-cleave PR
author: Jarvis (Claude Opus 4.7)
audience: Nate, future-Jarvis, future-David
context: Pre-redirect audit per plan §5.2 M2 acceptance criteria. Identifies which DecisionsPage affordances need porting before `/decisions` becomes a Navigate redirect to `/reo`.
inputs:
  - dashboard/frontend/src/pages/DecisionsPage.tsx (514 LOC, P1.B1 era 2026-05-04)
  - dashboard/frontend/src/pages/ReoPage.tsx (833 LOC, B4/B6/B7-UI/MVP era 2026-05-07)
  - dashboard/frontend/src/api/decisions.ts (143 LOC, direct PostgreSQL — superseded by P1.B1.1)
  - dashboard/frontend/src/api/reo.ts (Pulse READ API consumer)
---

# DecisionsPage.tsx → ReoPage.tsx Feature-Parity Audit

## Executive summary

DecisionsPage shipped 2026-05-04 (commit `042247b`) as the P1.B1-rich
cross-table storyline view. ReoPage replaced it in spirit on 2026-05-07
(commits `086f08d`, `54d890a`, `8fd2446`, `6f40b1b`, `0f17f73`), but the
URL `/decisions` was never redirected. M2 of the dashboard re-cleave PR
performs that redirect.

**Disposition counts**:

| Disposition | Count |
|---|---|
| PRESENT_IN_REO (no work) | 24 |
| PRESENT_IN_REO_BETTER (REO improves) | 3 |
| PRESENT_IN_REO_DIFFERENT (palette/format diverges, both valid) | 3 |
| MISSING_IN_REO_PORTABLE (port in M2) | **2** |
| MISSING_IN_REO_INTENTIONAL_DROP | 8 |

The portable load is small: only 2 affordances need code work. One is
**load-bearing** (URL search-param translation for deep-link safety);
the other is a **visual enhancement** (confidence-bar in the timeline
row, currently only in the drawer).

## Affordance-by-affordance table

| # | DecisionsPage affordance | Disposition | ReoPage equivalent | Notes |
|---|---|---|---|---|
| 1 | Page title "Decisions" | INTENTIONAL_DROP | "REO" + sidebar label "Decision Archive" (M1) | Rename absorbs the page title. |
| 2 | Description mentioning storyline | INTENTIONAL_DROP | REO's own description | "Reviews, Executions, Orchestrations" framing supersedes. |
| 3 | StatCard: Decisions (24h) + per-hour subtitle | PRESENT_IN_REO | StatCard "Decisions" | Per-hour subtitle dropped (low-value polish; covered by time-window awareness). |
| 4 | StatCard: Unique threads | PRESENT_IN_REO | StatCard "Threads" | Same metric. |
| 5 | StatCard: Top actor + count | INTENTIONAL_DROP | Aggregates panel actor chips show counts | Actor chips in FilterChipRow display `actor (decision_count)` — covers the "who's most active" question with more granularity than a single top-N card. |
| 6 | StatCard: Top decision_type + count | INTENTIONAL_DROP | Decision-type chips show counts implicitly | Same rationale as #5. |
| 7 | Filter input: actor (text) | PRESENT_IN_REO_BETTER | FilterChipRow multi-select chips with counts | Multi-select beats free-text. |
| 8 | Filter input: decision_type (text) | PRESENT_IN_REO_BETTER | FilterChipRow multi-select | Same. |
| 9 | Filter input: outcome (text) | PRESENT_IN_REO_BETTER | FilterChipRow multi-select (color-coded) | Same. |
| 10 | Filter input: thread_id (mono text) | PRESENT_IN_REO | SearchInput "Thread ID" | Equivalent. |
| 11 | "Clear" filters button | PRESENT_IN_REO | "Clear filters (N)" button | REO shows count of active filters. |
| 12 | URL search params: `?actor=X&decision_type=Y&outcome=Z&thread_id=T` | **MISSING_IN_REO_PORTABLE (load-bearing)** | ReoPage uses local state for filters; only `?decision_id=` is URL-synced | **PORT-A**: redirect wrapper preserves search; ReoPage reads on mount to pre-populate filters. Single-value mapping (each query param → single-entry array for chip-multi-selects). |
| 13 | URL param `?drawer=<thread_id>` | INTENTIONAL_DROP | `?decision_id=<event_id>` (B6) | Drawer model fundamentally changed (thread_id → event_id). No clean translation; drop with the redirect. Old links to `?drawer=` will land on /reo with no drawer open. |
| 14 | "Recent threads" section header | INTENTIONAL_DROP | — | Thread-level aggregation not adopted by REO. |
| 15 | Threads table (thread_id, first, last, count) | INTENTIONAL_DROP | — | Same. Could be added later as a separate aggregation view if Nate finds it missed; not load-bearing. |
| 16 | Click thread row → drawer | INTENTIONAL_DROP | — | Drawer model changed. |
| 17 | Threads loading state | INTENTIONAL_DROP | — | Section removed. |
| 18 | Threads empty state | INTENTIONAL_DROP | — | Section removed. |
| 19 | "Recent decisions (N)" header | PRESENT_IN_REO | "N decision(s)" header | Equivalent. |
| 20 | Decisions table: When (relative timeAgo + tooltip with absolute ts) | PRESENT_IN_REO_DIFFERENT | TimelineList row shows full absolute timestamp | Both valid. Could change REO to relative-with-tooltip later if Nate prefers; out of M2 scope. |
| 20a | Decisions table: thread_id (truncated mono) | PRESENT_IN_REO_DIFFERENT | Not in row directly; shown in drawer DefList | REO's filter-by-thread-id covers the "filter by this thread" intent. |
| 20b | Decisions table: Actor (colored text) | PRESENT_IN_REO_DIFFERENT | Actor chip (colored, palette by service: executor/diagnose/reviewer) | REO's palette is service-aware (more useful than prefix-only). |
| 20c | Decisions table: Decision (decision_type) | PRESENT_IN_REO | Decision-type column | Equivalent. |
| 20d | Decisions table: Outcome (colored badge) | PRESENT_IN_REO | Outcome column (colored text + chip in filter row) | Equivalent. |
| 20e | Decisions table: Confidence (visual bar with %) | **MISSING_IN_REO_PORTABLE** | Only in drawer Decision section | **PORT-B**: add confidence bar to TimelineList row. `TimelineEvent.confidence` is already on the API response (api/reo.ts:12), so trivial to render. Tradeoff: adds visual noise to busy rows; threshold-color (≥85% green / ≥60% amber / <60% red) keeps signal-to-noise reasonable. |
| 20f | Decisions table: cost (NOT in DecisionsPage; REO ADDS) | REO-NEW | `nearest_cost_usd` column | REO's superset. |
| 21 | Click decision row → drawer | PRESENT_IN_REO | Yes (case-file drawer) | Equivalent. |
| 22 | Decisions loading state | PRESENT_IN_REO | TimelineSkeleton | REO has animate-pulse skeleton (B4 polish). |
| 23 | Decisions empty state | PRESENT_IN_REO | "No decisions match the current filters" + widen-window suggestion | REO's copy is filter-aware. |
| 24 | Drawer backdrop click closes | PRESENT_IN_REO | Yes | Equivalent. |
| 25 | Drawer header: title + thread_id + audit/cost/decision counts | INTENTIONAL_DROP | Header shows "Decision #N"; section titles include counts: `Linked costs (N · $X total)`, `Linked audit (N)` | Counts are still visible, just relocated to section headers. |
| 26 | Drawer close × button | PRESENT_IN_REO | "Close (esc)" button | Plus Escape-key handler. |
| 27a | DEC storyline row (badge + actor/type/outcome + rationale + collapsible alt/signals/confidence/downstream) | PRESENT_IN_REO_BETTER | Drawer "Decision" section with DefList (Timestamp/Thread/Task/Parent decision), rationale, JsonBlock for downstream_effect / alternatives / signals_matched | REO is more structured (DefList) and exposes parent_id which DecisionsPage didn't. |
| 27b | AUDIT storyline row | PRESENT_IN_REO | AuditTimeline section | Equivalent. |
| 27c | COST storyline row (persona/job + model + cost + tokens) | PRESENT_IN_REO_BETTER | CostsTable section (Time / Persona / Engine/Model / Cost / Tokens in/out / Duration) | REO adds Engine + Duration. |
| 28 | Drawer loading state | PRESENT_IN_REO | Yes | Equivalent. |
| 29 | Drawer error state | PRESENT_IN_REO | Yes | Equivalent. |
| 30 | Drawer empty state | PRESENT_IN_REO | Per-section empty states ("No cost rows for this thread") | More granular. |
| 31 | Actor color coding: purple/blue/amber/emerald by prefix (persona/system/job/source) | PRESENT_IN_REO_DIFFERENT | cyan/amber/emerald/tertiary by service (executor/diagnose/reviewer/other) | Both arbitrary; REO's is service-aware. Keep REO's. |
| 32 | Outcome color coding: red (block/fail/reject/lost), amber (warn/retry), faint (skip/release), emerald (default) | PRESENT_IN_REO_DIFFERENT | emerald (success/completed/claimed/passed), red (failed/race_lost/give_up/blocked_max_retries), amber (retry/retrying/released_to_queue), tertiary (default) | REO uses explicit outcome-value matching (less brittle than substring-includes). |
| 33 | Confidence-bar visual treatment (≥85% green / ≥60% amber / <60% red) | **MISSING_IN_REO_PORTABLE** | Drawer only (as text `confidence X%`) | Same as #20e — porting handles both row + drawer reference. |
| 34 | OfflineBanner with PULSE_DB_* env hint | INTENTIONAL_DROP STALE | REO has its own error state | The PULSE_DB_* env-var hint is stale post-P1.B1.1 (Pulse READ API replaced direct DB access). Dropping this on redirect prevents misleading the user toward irrelevant diagnostics. |
| 35 | Hardcoded 24h hours window (no UI control) | PRESENT_IN_REO_BETTER | Time-window select (6h / 24h / 7d / 30d) | REO adds the affordance. |

## Portable items — implementation specifications

### PORT-A: URL search-param translation (load-bearing)

**Scope**: When user lands at `/decisions?actor=X&decision_type=Y&outcome=Z&thread_id=T`,
they should land at `/reo` with those filters pre-applied.

**Implementation**:

1. Add a `DecisionsRedirect` wrapper component in `App.tsx`:
   ```jsx
   function DecisionsRedirect() {
     const location = useLocation();
     return <Navigate to={{ pathname: '/reo', search: location.search }} replace />;
   }
   ```
   This preserves search params through the redirect (React Router v7's
   bare `<Navigate to="/reo">` strips search).

2. Update App.tsx route:
   ```diff
   - <Route path="/decisions" element={<DecisionsPage />} />
   + <Route path="/decisions" element={<DecisionsRedirect />} />
   ```

3. Extend ReoPage.tsx initial state to read URL params on mount:
   - `?actor=X` → `setActorFilter([X])` (single-entry array — chips support multi but single entry is valid initial state)
   - `?decision_type=Y` → `setDecisionTypeFilter([Y])`
   - `?outcome=Z` → `setOutcomeFilter([Z])`
   - `?thread_id=T` → `setThreadId(T)` (string state, exact match)

4. Use the existing `readDeepLinkId()` / `writeDeepLinkId()` pattern as
   the template for `readFilterParams()`. Run on initial mount only;
   subsequent filter changes stay in local state (no URL write-back) to
   avoid scope creep. If Nate wants full URL sync later, separate
   workstream.

**Cost**: ~20 LOC in ReoPage.tsx + 4 LOC in App.tsx.

**Done criteria**:
- `/decisions?actor=system:executor` → /reo with actor chip "system:executor" pre-selected
- `/decisions?thread_id=some-thread-id` → /reo with Thread ID search input pre-filled
- `/decisions?actor=X&outcome=failed` → /reo with both filters applied
- Unknown params (e.g., `?drawer=`) are silently ignored
- Smoke validates each shape resolves cleanly

### PORT-B: Confidence bar in TimelineList row (visual enhancement)

**Scope**: Add a small confidence-bar (matching the DecisionsPage treatment)
to the TimelineList row in ReoPage. Currently confidence is only visible
in the drawer (as text `confidence X%`).

**Implementation**:

1. Add `confidenceBar(c: number | null)` helper to ReoPage.tsx (extracted
   from DecisionsPage's helper, lines 61-73):
   ```tsx
   function confidenceBar(c: number | null): ReactNode {
     if (c == null) return null;  // omit silently for null confidence (not all decisions have it)
     const pct = Math.round(c * 100);
     const color = c >= 0.85 ? 'bg-emerald-500' : c >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
     return (
       <span className="inline-flex items-center gap-1.5 text-[10px] tabular-nums text-faint">
         <span className="w-10 h-1 rounded-full bg-surface-3 overflow-hidden">
           <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
         </span>
         {pct}%
       </span>
     );
   }
   ```

2. Insert into TimelineList row layout — between rationale and cost:
   ```jsx
   <span className="text-xs text-faint flex-1 truncate">{e.rationale ?? ...}</span>
   {confidenceBar(e.confidence)}  // NEW
   <span className="text-xs text-tertiary font-mono shrink-0 w-20 text-right">{fmtCost(e.nearest_cost_usd)}</span>
   ```

3. Adjust truncate behavior on rationale span if visual crowding occurs
   (rationale already has `flex-1 truncate`; confidence bar is `shrink-0`
   so should coexist fine).

**Cost**: ~15 LOC in ReoPage.tsx.

**Done criteria**:
- Rows with confidence ≥85% show green bar
- Rows with confidence 60-84% show amber bar
- Rows with confidence <60% show red bar
- Rows with null confidence show no bar (not "—") — keeps visual quiet for system decisions that don't carry confidence
- TypeScript compiles
- Visual: doesn't break existing row layout in either expanded or selected state

## Items explicitly NOT ported (intentional drops with rationale)

| Item | Why dropped |
|---|---|
| StatCard "per-hour" subtitle on Decisions count | Cosmetic detail. Time-window awareness of the page header replaces it. |
| StatCard "Top actor" / "Top decision_type" | Aggregates panel chips already convey ranked-by-count info with more granularity. |
| Recent threads section (table) | Thread-level aggregation isn't part of REO's mental model. If Nate misses it after the redirect lands, file a follow-up — easy to add as a sub-page or tab. |
| `?drawer=<thread_id>` URL param | Drawer indexing changed from thread_id to event_id (decision_id) when B6 case-file landed. No clean 1:1 translation. Old `?drawer=` links will simply land on /reo with no drawer (graceful degradation). |
| OfflineBanner PULSE_DB_* env hint | Stale advice — Pulse READ API (P1.B1.1, commit 66885bb) replaced direct DB access; PULSE_DB_* env vars no longer exist in dashboard server. Dropping this prevents the user being misled toward irrelevant diagnostics. |

## DecisionsPage.tsx + api/decisions.ts disposition

Per Nate's 2026-05-11 "keep-one-cycle" decision:

- **DecisionsPage.tsx**: kept in tree, unreferenced from App.tsx after M2.
  Add deprecation header comment. Scheduled deletion: REO Phase 5.5
  PRE-SHIP AUDIT (after one release cycle of fallback).
- **api/decisions.ts**: kept in tree, unreferenced from ReoPage.tsx.
  Add deprecation header comment. ReoPage uses `api/reo.ts` exclusively.
  Same deletion schedule.

This preserves rollback safety (if any unforeseen ReoPage gap is found,
re-enable the route as a quick fix while we port the missing affordance).

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Deep-link `/decisions?actor=X` translation loses meaningful state | LOW | Port-A handles all 4 known query patterns. Unknown params silently ignored (graceful). |
| Users miss the "Top actor" stat card | LOW | Aggregates panel chips show the same info with more granularity. If feedback, easy to add stat card back. |
| Confidence bar visual crowding the timeline row | LOW | 10rem-wide row, confidence bar is `shrink-0 w-12`. Should fit comfortably; smoke validates. |
| DecisionsPage.tsx kept-in-tree creates dead-code drift over the release cycle | LOW | Deprecation header + scheduled deletion at Phase 5.5 PRE-SHIP AUDIT. |

## Test plan

Post-port smoke (M2.6):

- [ ] `tsc -b --noEmit` strict clean
- [ ] Vite HMR clean (no compile errors)
- [ ] `/decisions` resolves with HTTP redirect to `/reo`
- [ ] `/decisions?actor=system:executor` → `/reo?actor=system:executor` → actor chip "system:executor" pre-selected
- [ ] `/decisions?decision_type=task_release` → `/reo?decision_type=task_release` → decision-type chip pre-selected
- [ ] `/decisions?outcome=failed` → `/reo?outcome=failed` → outcome chip "failed" pre-selected
- [ ] `/decisions?thread_id=some-real-thread` → `/reo?thread_id=some-real-thread` → Thread ID search filled
- [ ] `/decisions?actor=X&outcome=failed` (combined) → both pre-selected
- [ ] `/decisions?drawer=anything` (unknown param) → /reo with no drawer, no error
- [ ] Confidence bar renders correctly: ≥85% green / 60-84% amber / <60% red / null = absent
- [ ] B4 filter chips still toggle correctly post-port
- [ ] B6 case-file drawer still opens (`/reo?decision_id=N` direct nav)
- [ ] MVP polish: preset chips still apply correctly, TimelineSkeleton still shows during load
- [ ] `scripts/smoke-reo.sh` 9/9 pass
- [ ] DecisionsPage.tsx deprecation header present; file no longer imported by App.tsx

## References

- Plan-of-record: `Jarvis/projects/project-aion/plans/aifred-pro-dev-dashboard-recleavage.md` §5.2 (Milestone 2)
- Foundational analysis ratification §11.3: "/decisions → /reo redirect + consolidate features"
- DecisionsPage origin: P1.B1 commit `042247b` on AIFred-Pro-Dev nate-dev (2026-05-04)
- ReoPage build: B1+B3+B4+B6+B7-UI+MVP commits `086f08d` / `54d890a` / `8fd2446` / `6f40b1b` / `0f17f73`
- M1 (nav re-cleave) ship: commit `d001c75` on AIFred-Pro-Dev nate-dev (2026-05-11)
