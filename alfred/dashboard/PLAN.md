# Beads Dashboard Enhancement Plan

**Goal**: Transform tasks.example.com from a basic task viewer into an actionable task management interface that handles 86+ tasks efficiently.

**Codebase**: ~45 files, ~3,100 lines TypeScript. React 19 + Fastify + Tailwind v4.

---

## Completed Phases

### Phase 1: Bug Fixes & Quick Wins — DONE (f8f21b0)
- Fixed Ready page to filter out blocked/needs-input/manual-action tasks
- Fixed LabelChip bare-label rendering
- Fixed filter bar default sync (Open + In Progress highlights on load)
- Fixed back button fallback when no browser history
- Added task IDs (AIProjects-xxxx) to table, cards, and detail view
- Added loading/error states to dashboard and ready pages
- Expanded search to include notes and labels
- Fixed stats to exclude closed tasks from filter dropdown counts
- Reduced polling intervals (5s -> 15s tasks, 30s stats)
- Removed dead code (_view state)
- Added ready, excludeLabel server filter params

### Phase 2: Inline Quick Actions — DONE (c67ce4c)
- New TaskActions component: three-dot menu per row
- Actions: Claim & Start, Close (with inline reason), Change Priority
- Wired into TaskRow (desktop) and TaskCard (mobile)
- Added assignee support to bd-cli updateTask backend
- Improved TaskDetail: prominent Claim & Start button, clearer status flow

### Phase 3: Smart Views & Navigation — DONE (b6e47df)
- Sidebar smart views: My Tasks, Needs Input, Recent
- Reference moved to sidebar bottom
- New ActiveFilters component: task count, filter pills with remove, clear-all
- Expandable row context: chevron toggle reveals description, notes, all labels inline

### Phase 4: Keyboard Navigation — DONE (8ed636d)
- useKeyboardNav hook: j/k focus, Enter open, c claim, x close, / search, ? help
- Focused row gets blue ring highlight
- KeyboardHelp overlay with all shortcuts
- SearchInput targeted by / shortcut

### Phase 5: Task Relationships — DONE (6dac32b)
- RelatedTasks component: parses parent/follow-up/blocks/related labels
- Renders clickable links with live priority, status, and title
- Displayed on task detail page between labels and notes

### Phase 6: Actionability & Workflow — DONE (3f1418d)
- Triage mode: full-screen one-task-at-a-time flow with keyboard shortcuts (1-4, c/d/x/s, arrows)
- Today's Focus widget on dashboard landing (in-progress + top 3 ready)
- Bulk actions: multi-select with Close All and Change Priority
- Inline notes editing on task detail (click-to-edit) and quick-note in expanded rows
- Notification badges in sidebar (ready, needs-input, waiting:david counts)
- Staleness indicators: 14-day amber badge on rows, cards, and detail
- My Queue responsibility page: waiting:david (quick/session), waiting:nexus, parked buckets
- Routing buttons on task detail and task creation form (one-click waiting:david/nexus/parked)
- Tooltips on all action buttons across all pages
- Server-side stats for responsibility labels (waitingDavid, waitingNexus, parked)

---

### Phase 7: Data & Performance (future)
**Scope**: Prepare for scale beyond 100+ tasks.

#### 7.1 Server-side pagination
- Add `page` and `limit` query params to `/api/tasks`
- Frontend pagination controls or infinite scroll
- **Done when**: Dashboard handles 500+ tasks without jank

#### 7.2 Server-Sent Events for live updates
- Replace polling with SSE — server watches JSONL mtime and pushes changes
- Frontend subscribes and updates React Query cache
- **Done when**: Changes from `bd` CLI appear instantly without polling

#### 7.3 Task archival view
- Separate `/archive` page for closed tasks with search
- Main dashboard no longer loads closed tasks unless explicitly filtered
- **Done when**: Closed tasks don't slow down active task management

#### 7.4 Dark/light mode toggle
- Add theme toggle, persist in localStorage
- Light mode palette for daytime use
- **Done when**: Users can switch themes

---

### Phase 8: Integration (future)
**Scope**: Connect the dashboard to the broader ecosystem.

#### 8.1 Telegram deep links
- Task detail page generates a shareable link
- Telegram bot messages link directly to task detail
- **Done when**: Clicking a Telegram task notification opens the dashboard

#### 8.2 Obsidian backlinks
- Show related Obsidian notes on task detail (via homelab MCP or API)
- Link to open notes in Obsidian
- **Done when**: Task context includes knowledge base references

#### 8.3 Git commit links
- Parse `external_ref` field and render as clickable GitHub/commit links
- Show recent commits related to a task
- **Done when**: Development tasks link to their implementation

---

## Execution Summary

```
Phase 1 (Bug Fixes)      ████████████  DONE  — 13 files, 234 lines
Phase 2 (Quick Actions)   ████████████  DONE  — 6 files, 165 lines
Phase 3 (Smart Views)     ████████████  DONE  — 4 files, 230 lines
Phase 4 (Keyboard Nav)    ████████████  DONE  — 6 files, 161 lines
Phase 5 (Relationships)   ████████████  DONE  — 2 files, 60 lines
Phase 6 (Workflow)        ████████████  DONE  — 19 files, 1285 lines
Phase 7 (Performance)     ░░░░░░░░░░░░  LATER — scale prep
Phase 8 (Integration)     ░░░░░░░░░░░░  LATER — ecosystem connections
```

**Recommended next session**: Phase 7.1 (Server-side pagination) or 8.1 (Telegram deep links).
