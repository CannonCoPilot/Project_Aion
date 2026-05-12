# Reviewer Dash — Implementation Plan

**Status**: drafted, not started
**Target repo**: Alfred-Dev (`nate-dev` branch)
**Effort**: 2 days across 4 phases
**Created**: 2026-05-06
**Tag**: `[Boundary]` (adds Pulse READ endpoints + new dashboard tab)

---

## 1. Motivation

The dashboard's `/board` page has a "Classic" tab (`KanbanPage.tsx:405`) that surfaces only task-state — it shows what's queued/in-flight/done but tells you nothing about the *reasoning* behind those states. When debugging "why did the executor pick THIS task and reject THAT one?", you currently have to:

1. Pull thread_id from logs by hand
2. Manually `psql` join `decision_events`, `cost_events`, `audit_log` on thread_id
3. Mentally reconstruct the timeline

Reviewer Dash collapses this to one click. Vertical timeline grouped by thread_id, with cost overlay and full reasoning text in a drawer.

## 2. Current Schema State (verified 2026-05-06)

The dashboard's underlying tables already have the data needed:

| Table | Rows (today) | Key actor values |
|---|---|---|
| `pulse.decision_events` | populated | `actor='persona:executor'` (19), `actor='persona:diagnose'` (8), `actor='persona:reviewer'` (**0**) |
| `pulse.cost_events` | populated | indexed on thread_id |
| `pulse.audit_log` | populated | indexed on thread_id |

**Critical**: the reviewer persona has zero rows today because the reviewer service hasn't been built yet (architecture doc §7.1 #4). Reviewer Dash will display empty state for `actor='persona:reviewer'` until that service goes live. **Recommendation**: build the dashboard now anyway — it serves executor + diagnose timelines immediately, and will auto-populate reviewer rows when the service starts.

The naming "Reviewer Dash" is forward-looking. Today the page is most useful as an "Executor Dash" but the schema and UX generalize to any persona.

## 3. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Frontend: ReviewerDashTab.tsx (replaces Classic tab)       │
│   ├─ Vertical timeline (sorted by event_ts asc)           │
│   ├─ Per-event row: timestamp | actor | decision | cost   │
│   ├─ Drawer on click: full reasoning text from JSONB      │
│   └─ Filter chips: persona | thread_id | date range       │
└────────────────────────────────────────────────────────────┘
                       │ fetch
                       ▼
┌────────────────────────────────────────────────────────────┐
│ Dashboard server: /api/reviewer-dash/{timeline,            │
│                   persona-aggregates,decision/:id}         │
│   - Proxies to Pulse READ API                              │
│   - No direct DB access (boundary discipline per audit)    │
└────────────────────────────────────────────────────────────┘
                       │ HTTP
                       ▼
┌────────────────────────────────────────────────────────────┐
│ Pulse: GET /api/v1/observability/storyline/{thread_id}     │
│        GET /api/v1/observability/persona-aggregates        │
│        GET /api/v1/decisions/:id                           │
│   - SQL: JOIN decision_events + cost_events + audit_log    │
│   - GROUP BY thread_id, ORDER BY event_ts                  │
└────────────────────────────────────────────────────────────┘
                       │ SQL
                       ▼
              pulse.{decision_events, cost_events, audit_log}
```

The endpoint surface is partially drafted in the P1.B1.1 boundary follow-up (active-plan §NEXT WORKSTREAMS). Reviewer Dash work overlaps with P1.B1.1; either ship them together or sequence Reviewer Dash to consume P1.B1.1's outputs.

## 4. Phases

### R1 — Backend endpoints (0.5d)

**Deliverables**:
- `pulse/app.py`: 3 new GET endpoints
  - `GET /api/v1/observability/timeline?since_hours=N&persona=X` → flat list of decision events ordered by ts, joined with cost row per event_id when available
  - `GET /api/v1/observability/persona-aggregates?since_hours=N` → grouped sums: count, total_cost_usd, avg_latency_ms by persona
  - `GET /api/v1/decisions/:event_id` → full decision row including `details` JSONB (the reasoning text)
- `dashboard/server/routes/reviewer-dash.ts`: passthrough proxy to those 3 endpoints, dropping any direct pg dependency
- 24h in-process cache on aggregates endpoint (matches existing pattern in `pulse/app.py`)

**Done-criteria**:
- `curl :8800/api/v1/observability/timeline?since_hours=24 | jq 'length'` returns positive integer
- `curl :8701/api/reviewer-dash/timeline?since_hours=24` returns same data via dashboard proxy
- `curl :8800/api/v1/observability/persona-aggregates | jq '.[]|.persona'` returns `["persona:executor", "persona:diagnose"]` (and `persona:reviewer` once that service exists)
- All 3 endpoints return 200 with empty arrays when no data exists (graceful empty state)

**Files touched**:
- `Alfred-Dev/pulse/app.py` (~120 LOC added)
- `Alfred-Dev/dashboard/server/routes/reviewer-dash.ts` (NEW, ~50 LOC)

### R2 — Frontend timeline (0.75d)

**Deliverables**:
- `dashboard/frontend/src/pages/ReviewerDashTab.tsx` (NEW)
- Vertical timeline component, one row per event:
  - Left: ISO timestamp (UTC, hover shows local)
  - Center: persona icon + actor name + brief decision summary (first 80 chars of reasoning)
  - Right: cost cell (USD, color-coded by threshold from existing `lib/usage-reference.ts`)
- Filter bar at top: persona dropdown (multi-select), date-range picker (default last 24h), thread_id search
- Tab integration into `KanbanPage.tsx:405` — new "Reviewer Dash" tab alongside Classic
- 30s refetch via existing useSessionTokens-style hook pattern

**Done-criteria**:
- Tab renders without errors at `:8701/board` even with empty data (empty state shows "No decisions in selected window")
- Filter changes update URL search params (deep-linkable)
- 100+ events render at 60fps (virtualized via existing react-virtuoso pattern if needed)

**Files touched**:
- `Alfred-Dev/dashboard/frontend/src/pages/ReviewerDashTab.tsx` (NEW, ~250 LOC)
- `Alfred-Dev/dashboard/frontend/src/pages/KanbanPage.tsx` (~10 LOC tab wiring)
- `Alfred-Dev/dashboard/frontend/src/api/reviewer-dash.ts` (NEW, ~40 LOC types + hooks)

### R3 — Reasoning drawer (0.5d)

**Deliverables**:
- Click on any timeline row opens a right-side drawer
- Drawer content:
  - Header: persona, ts, decision, total cost
  - Body: full `details` JSONB pretty-printed (the reasoning text + structured fields)
  - Sub-section: linked cost events for this thread_id (so you can see "this decision cost $0.42 across these 3 LLM calls")
  - Sub-section: linked audit_log rows for this thread_id (operational events around the decision)
- Drawer closes on ESC, click-outside, or X button
- Deep-link supported: `?event_id=<uuid>` opens drawer on page load

**Done-criteria**:
- Drawer opens within 200ms of click
- All JSONB fields render without errors (defensive against schema evolution)
- Deep-link refresh works (drawer state survives page reload)

**Files touched**:
- `Alfred-Dev/dashboard/frontend/src/pages/ReviewerDashTab.tsx` (drawer component, ~150 LOC added)

### R4 — Live-data switch + empty-state smoke (0.25d)

**Deliverables**:
- Toggle in filter bar: "Live" (10s refetch) / "Frozen" (no refetch, snapshot for analysis)
- Empty-state message tailored per filter:
  - No persona selected: "Select a persona above to see decisions"
  - All filters but no results: "No decisions match these filters in the selected window"
  - All-time empty (no rows in DB): "No decisions recorded yet — reviewer service may not be running"
- Smoke-test script at `Alfred-Dev/.claude/scripts/smoke-reviewer-dash.sh`:
  - Inject one synthetic decision_event via Pulse API
  - Assert dashboard `/api/reviewer-dash/timeline` returns it within 30s
  - Cleanup: delete the synthetic row

**Done-criteria**:
- Live toggle reflects in 10s data refresh visibly
- Empty states show appropriate messages (no "undefined" or React error boundary triggers)
- Smoke script passes in CI

**Files touched**:
- `Alfred-Dev/dashboard/frontend/src/pages/ReviewerDashTab.tsx` (~40 LOC additions)
- `Alfred-Dev/.claude/scripts/smoke-reviewer-dash.sh` (NEW, ~60 LOC)

## 5. Risks / Open Questions

- **`actor='persona:reviewer'` rows = 0 today**: building UI for a persona that doesn't yet emit data is a normal scaffolding move — but stakeholders should know the dashboard will look "executor-only" until the reviewer service is wired. Recommend prefixing the page subtitle with "Active personas: executor, diagnose. Reviewer service pending — see architecture doc §7.1 #4".
- **Boundary overlap with P1.B1.1**: that workstream also adds Pulse READ endpoints (storyline, audit/events, costs/events, observability/stats). If both ship in the same week, ensure endpoint URLs don't collide and that R1 reuses any helpers from P1.B1.1's Pulse-side work.
- **Thread-id cardinality**: if `decision_events.thread_id` ever exceeds ~10K distinct values in the default 24h window, the timeline-aggregate endpoint will need pagination. Today the count is well under 100. Reconsider if this changes.

## 6. Out of Scope (deferred)

- Reviewer-specific scoring metrics (would need reviewer service to define them first)
- Cross-thread correlation (showing how executor decision X led to diagnose decision Y) — interesting but adds graph-traversal complexity
- Export to CSV / JSON (low-frequency need; can use `psql -c COPY ... TO STDOUT` until proven necessary)
- Mobile responsive layout (Reviewer Dash is a deep-debug tool; desktop-first is fine)

## 7. Sequencing Notes

- R1 first (backend; everything else depends on it)
- R2 second (timeline; the user-visible deliverable)
- R3 third (drawer; the depth deliverable that justifies the page existing)
- R4 last (polish; can be done piecemeal between other work)
- Total wall-clock: 2 days if focused, 3 days with normal interruption

## 8. Connection to Larger Architecture

Per workstream architecture v1.3 §7.2, Reviewer Dash is the **schema template for §7.1 #4 Cortex↔AC-05/06 interop**. The vertical-timeline-with-drawer pattern proves out the UX for displaying any persona's decision-stream — when the Cortex (Jarvis-side AC-05/06 reflection consumer) needs to show its own decision timeline, it inherits this pattern.

This is also the first dashboard page that consumes Pulse READ API exclusively (no direct pg.Pool). It serves as the migration template for refactoring the existing DecisionsPage (commit `042247b`) once P1.B1.1 ships.
