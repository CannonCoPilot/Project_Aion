---
title: Alfred-Dev Dashboard — Foundational Analysis
date: 2026-05-07
project: Alfred-Dev
audience: Sir, future-Jarvis
status: APPROVED-PENDING-IMPL (decisions captured 2026-05-11; see §11)
context: Captured from a 2026-05-07 session conversation immediately following dev-env Path 1 (vite hot-reload sidecar, commit 23e838c) and Path 2 (cross-contamination fix, commit faa9406). Sir paused REO Validate to ask the foundational IA question — "what are we actually building, and how should /decisions, /reo, /reviews, /tasks, /board, /nexus-ops, /findings, /personas, /report, /observability, /pipeline, /health (and the rest) come together?" Decisions returned 2026-05-11; ratified positions recorded in §11. Implementation plan: ../plans/aifred-pro-dev-dashboard-recleavage.md.
related:
  - reviewer-foundational-reexamination-2026-05-07.md (precedent — session-10 reframe used the same approach)
  - ../plans/aifred-pro-dev-reo-page.md (REO plan-of-record; revised 2026-05-11 — Validate paused, /decisions subsumes into /reo per §11.3)
  - ../plans/aifred-pro-dev-dashboard-recleavage.md (implementation plan-of-record for the re-cleave PR, drafted 2026-05-11)
  - aifred-nexus-deep-analysis-2026-03-28.md (architectural antecedent)
investigation_artifacts:
  - 6 task phases (route inventory → impl-depth audit → /decisions vs /reo vs /reviews compare → design-intent docs → persona/job system → synthesis)
  - 2 Explore subagents in parallel (page audit + design-intent walk)
  - direct reads: App.tsx, AppShell.tsx (sidebar IA), reviews.ts (feedback persistence), .claude/CLAUDE.md, registry.yaml
---

# Alfred-Dev Dashboard — Foundational Analysis

> **Reading guide.** Sections 1–3 are inventory and findings; sections 4–7 are the synthesis (the "5 questions" Sir posed); section 8 is the prioritized take-next list. Insights flagged with `★ Insight` are intended as standalone takeaways — they're the most surprising or load-bearing conclusions and worth re-reading independently.

## Table of contents

1. [Investigation surface — what's actually there](#1-investigation-surface--whats-actually-there)
2. [Critical finding: /reviews persists feedback to JSONL, not a database](#2-critical-finding-reviews-persists-feedback-to-jsonl-not-a-database)
3. [The current sidebar IA — and why it half-works](#3-the-current-sidebar-ia--and-why-it-half-works)
4. [Q1: What are the essential end-user modes?](#4-q1-what-are-the-essential-end-user-modes)
5. [Q2: Mapping current pages onto the 4+1 mode model](#5-q2-mapping-current-pages-onto-the-41-mode-model)
6. [Q3: Critical assessment of "get work done" vs "monitor/diagnose"](#6-q3-critical-assessment-of-get-work-done-vs-monitordiagnose)
7. [Q3.5: The /decisions vs /reo vs /reviews question, finally](#7-q35-the-decisions-vs-reo-vs-reviews-question-finally)
8. [Q4: What does Alfred-Dev seem designed to provide?](#8-q4-what-does-aifred-pro-dev-seem-designed-to-provide)
9. [Q5: The envisioned optimal version](#9-q5-the-envisioned-optimal-version)
10. [What I'd take next (prioritized)](#10-what-id-take-next-prioritized)
11. [Decisions captured 2026-05-11](#11-decisions-captured-2026-05-11) — ratified positions on all 7 open questions

---

## 1. Investigation surface — what's actually there

Before any opinion, the mechanical facts. So we're working from the same map:

- **40 routes** in `App.tsx` resolving to **35 page components**, with **43 backend route files** and **25 backend services**
- **Three nav groups** in the sidebar today (`AppShell.tsx:20-54`): **Main** (8 items), **Nexus** (11 items), **System** (8 items)
- **Notable orphan**: `/reo` is wired in `App.tsx` but is **NOT in the sidebar** — only `/decisions` is currently linked. This session's REO work has been live but nav-invisible.
- **30 personas** registered (`.claude/jobs/personas/`), with **13 active scheduled jobs** in `registry.yaml` ranging from every-10-min (`task-score`, `task-investigator`, `task-executor`) through every-12h (health, pipeline-review) to weekly (digest)
- **Of 35 pages**, the audit found 31 OPERATIONAL, 1 PARTIAL (ProjectCreatorPage), 0 STUB, 0 MISSING. **Almost everything is wired.** The problem is not implementation depth — it's that nothing has ever been *consolidated*.

## 2. Critical finding: /reviews persists feedback to JSONL, not a database

The single most architecturally surprising finding: **`/reviews` feedback persists to a JSONL file, not a database.** `dashboard/server/routes/reviews.ts:29` writes to `RESULTS_DIR/feedback.jsonl`. So "Training AI Reviewer through feedback. Every click improves future decisions." is true in spirit — but the "training" is *file-based pattern accumulation* read by AI-mediated curation scripts (the `learned-patterns.yaml` mechanism we discovered in REO Session 10), **not** a structured database write to `pulse.decision_feedback` (which doesn't exist yet — that's REO Harden H5).

This matters for everything below.

> **★ Insight**
>
> The "/reviews JSONL" finding reframes the whole REO Harden H5 conversation. We've been planning to build `pulse.decision_feedback` from scratch (database table + POST + lessons-learned wire), but the production feedback path already exists at the filesystem layer with a working AI-mediated curation loop on top. The optimal Harden play may be: write the DB table, BUT have the POST endpoint *also* append to the existing JSONL so existing curation scripts keep working unchanged — a parallel-write, not a cutover. Saves rewriting `learned-patterns.yaml` ingestion.

## 3. The current sidebar IA — and why it half-works

The sidebar groups everything into three sections:

**MAIN_NAV** (workspace primary):
- `/` Dashboard (Overview), `/create` Create, `/tasks` Tasks, `/board` Board, `/triage` Triage, `/projects` Projects, `/budget` Budget, `/usage` Usage

**NEXUS_NAV** (Nexus = orchestration platform):
- `/nexus-ops` Operations, `/jobs` Jobs, `/reviews` AI Review, `/patterns` Patterns, `/cortex` Cortex, `/pulsars` Pulsars, `/research` Research Queue, `/report` Reports, `/findings` Findings, `/personas` Personas, `/decisions` Decisions

**MANAGE_NAV** ("System"):
- `/observability` Observability, `/pipeline` Pipeline, `/token-compression` Token Compression, `/health` Health, `/document-guard` Doc Guard, `/documentation` Documentation, `/settings` Settings, `/account` Account

The visible pattern: **the current sidebar grouping is a half-correct attempt at the same cleavage Sir proposed.** "Main" approximately = DOING + PLANNING. "System" approximately = DIRECTING + DIAGNOSING. "Nexus" is the messy bucket where everything-related-to-the-AI-machine got dumped — and it contains all four modes mixed together (`/reviews` REFLECTING, `/jobs` DIRECTING, `/findings` DIAGNOSING, `/decisions` REFLECTING, etc.).

> **★ Insight**
>
> The "Nexus" sidebar group is where IA collapsed. The label suggests "the orchestration platform's pages" — and that's a *technical* boundary, not a user-mode boundary. So everything Nexus-touching landed there regardless of what the user is *doing* on each page. This is exactly the "code organization leaking into UX organization" anti-pattern. The fix isn't to rename Nexus — it's to dissolve the Nexus group entirely and re-shelve every page by user mode.

---

## 4. Q1: What are the essential end-user modes?

**The two-mode framing isn't quite right.** "Get work done" vs "monitor/diagnose" is a useful first cut — but it conflates two genuinely distinct activities on the "work" side, and one on the "diagnostic" side. The honest answer is **four modes**, not two:

| Mode | What the user is actually doing | Core question being answered |
|---|---|---|
| **DOING** | Acting on individual tasks: claim, edit, advance through stages, close | *"What's next? What's done? What needs me?"* |
| **DIRECTING** | Shaping how the autonomous system will behave on its next runs: persona prompts, recurring jobs, rules, document-guard, settings | *"What should the system do (or stop doing)?"* |
| **REFLECTING** | Looking back at AI-originated decisions, providing feedback, surfacing patterns | *"Did the AI get this right? How do I tell it when it didn't?"* |
| **DIAGNOSING** | Watching the machine itself: pipeline health, hook execution, costs, container/job health | *"Is the system working? If not, where's the fault?"* |

Why this matters more than 2 buckets:

- **DIRECTING is ergonomically distinct from DOING.** Editing a persona's prompt or toggling a recurring job is configuration work, not task work. It happens at different cadences (rarely vs constantly), at different stakes (system-wide vs per-ticket), and warrants different UX (long-form forms vs quick-action buttons).
- **REFLECTING is ergonomically distinct from DIAGNOSING.** A user looking at decision rationale to give feedback is doing something fundamentally different from a user looking at dispatcher heartbeat to check if cron fired. Conflating them produces pages that try to be both and serve neither well — exactly what `/decisions` and `/reo` risk becoming.
- **REFLECTING is also distinct from DOING.** Reviewing a *decision* (the AI's judgment) is not the same as reviewing a *task* (the unit of work). They cross paths, but the entry point and the action vocabulary differ.

There's a fifth mode worth naming but lower-traffic: **PLANNING** — multi-task, multi-phase project work in `/projects`, `/projects/:id`, `/cross-project`, `/create`. This is sufficiently distinct from per-ticket DOING that it probably wants its own zone, though it overlaps DOING heavily.

So: **4 primary modes + 1 secondary mode**. Sir's "get-work-done vs monitor" axis is real — it's the cleavage between {DOING, DIRECTING, PLANNING} and {REFLECTING, DIAGNOSING} — but the sub-modes within each side are themselves distinct surfaces.

---

## 5. Q2: Mapping current pages onto the 4+1 mode model

Within Sir's specified investigation domain (not expanding to the entirety of Pulse), here is what each page actually *is*, regardless of where the sidebar puts it today:

| Page | Sidebar group today | What it actually does | True mode |
|---|---|---|---|
| `/` Dashboard (Overview) | Main | At-a-glance landing: action items, throughput, status breakdown | DOING (with DIAGNOSING flavor) |
| `/tasks` (DashboardPage) | Main | Filter-rich table, multi-board (ready/blocked/backlog), bulk-action affordances | **DOING** (canonical) |
| `/board` (KanbanPage) | Main | Visual columns, drag-drop, status/stage/pipeline view modes, group-by | **DOING** (visual variant) |
| `/triage` | Main | Single-card focus mode for rapid triage | **DOING** (focus variant) |
| `/tasks/:id` (TaskDetailPage) | (deep-link) | Full task with live execution panel, event timeline, approval card | **DOING** (drill) |
| `/digest` | _not in sidebar_ | Today's prioritized digest by research/pipeline-stage | DOING + REFLECTING |
| `/jobs` (RecurringJobsPage) | Nexus | Job list with toggle/run/edit/logs/create | **DIRECTING** |
| `/personas` | Nexus | Persona prompt edit, model/budget config | **DIRECTING** |
| `/automation` (RulesPage) | Nexus → System? | Rules, corrections, severity, enable/disable | **DIRECTING** + REFLECTING (corrections) |
| `/document-guard` | System | Doc-write protection rules, audit, stats | **DIRECTING** + DIAGNOSING |
| `/settings` | System | Notification prefs, risk gates, AI provider | **DIRECTING** |
| `/account` | System | Auth, session countdown | **DIRECTING** |
| `/pulsars` | Nexus | Gates/monitors/external triggers, toggle, last-fired | DIRECTING + DIAGNOSING |
| `/decisions` | Nexus | Forensic per-decision drill (storyline, rationale, alternatives) | **REFLECTING** (passive) |
| `/reo` (this session's work) | _not in sidebar_ | Filing system over all decision_events with feedback connector planned | **REFLECTING** (broader scope, planned active) |
| `/reviews` | Nexus | Active feedback queue: agreed/wrong/adjust + comment, persists to JSONL, "agreed" auto-executes | **REFLECTING** (canonical, active) |
| `/patterns` | Nexus | Pattern entries, confidence/risk, feedback summary, toggle | REFLECTING (over time) |
| `/cortex` | Nexus | Knowledge freshness, training, patterns, recommendations | REFLECTING (meta-level) |
| `/findings` | Nexus | Tabbed findings (overview, health, upgrades, pipeline) | DIAGNOSING + REFLECTING |
| `/notifications` | _bell only_ | Notification history, mark-read | DIAGNOSING |
| `/observability` | System | PAI hooks + Nexus logs, session IDs, recent issues | **DIAGNOSING** (canonical) |
| `/health` | System | Dispatcher status + job heartbeat list | **DIAGNOSING** (status-only) |
| `/pipeline` | System | Dispatcher health + approval cards + recent executions + stage metrics | DIAGNOSING + DOING (approvals) |
| `/nexus-ops` | Nexus | Unified timeline + graph + analytics + schedule, WebSocket live | DIAGNOSING + REFLECTING |
| `/token-compression` | System | Compression stats, events, phases | DIAGNOSING (specific) |
| `/usage` | Main | Burn rate, model tokens, cache, sessions | DIAGNOSING + cost |
| `/budget` | Main | Company/tier spend with thresholds | DIAGNOSING + DIRECTING (limits) |
| `/report` | Nexus | Multi-chart analytics, throughput, stage transitions | REFLECTING (aggregate) |
| `/projects` + `/projects/:id` + `/cross-project` | Main | Pulse projects, phases, Gantt, gate approval | **PLANNING** |
| `/create` | Main | Streaming chat for project-to-task conversion | PLANNING (PARTIAL) |

---

## 6. Q3: Critical assessment of "get work done" vs "monitor/diagnose"

Sir's proposed top-level cleavage **is the right primary axis**, but worth refining in three ways:

**1. It captures the most important distinction.** When a user opens the dashboard, the first decision is "am I trying to do something *with the system* or am I trying to know something *about the system*?" That is a real cleavage and pages that confuse it (e.g., `/pipeline` mixing approve-work with monitor-dispatcher) feel awkward to use because they're answering two questions at once.

**2. But within "get work done", DOING ≠ DIRECTING.** Editing a persona prompt or adding a recurring job is "shaping future system behavior" — that's work, but it's not the same work as advancing a task through its stages. They warrant different IA placement.

**3. "Monitor/diagnose" undersells REFLECTING.** Reviewing AI decisions to provide feedback isn't "monitoring" — it's an active loop where the user's judgment is the input. It deserves its own primary surface, not to be hidden under a diagnostics shelf.

**Where the axis breaks down for specific pages**:

- `/pipeline` — currently classified as "monitor", but it has **approval cards** that the user clicks to advance work. That's DOING. The page is currently fused incorrectly. The fix isn't to choose one — it's to **split the page**: monitoring widgets to /diagnostics-shell, approval-card surface to /tasks (or a dedicated approvals queue).
- `/budget` — currently under "Main" but it's at least 70% diagnostic (visualization of spend) with a thin sliver of DIRECTING (set limits). Probably wants to move.
- `/cortex` — labeled diagnostic but it has actionable "recommendations" that, when clicked, should DO something. Today they don't (per the audit, the recommendations panel is read-only).
- `/document-guard` — also straddles. Rules editing is DIRECTING; audit log is DIAGNOSING.

**Recommendation for refining the axis**: keep the cleavage as the **top-level shell metaphor** (e.g., a left-side toggle "Work / Diagnose" or two tabs at the top), but **within each side, sub-organize by the mode model above**:

```
WORK SIDE                              DIAGNOSE SIDE
├─ DOING                               ├─ DIAGNOSING
│  ├─ /tasks (table)                   │  ├─ /health
│  ├─ /board (kanban)                  │  ├─ /pipeline (monitoring widgets only)
│  ├─ /triage (focus)                  │  ├─ /observability
│  └─ /tasks/:id (drill)               │  ├─ /token-compression
├─ PLANNING                            │  ├─ /usage
│  ├─ /projects, /projects/:id         │  └─ /findings
│  ├─ /create                          ├─ REFLECTING
│  └─ /cross-project                   │  ├─ /reviews (active feedback)
└─ DIRECTING                           │  ├─ /reo (filing/archive — formerly /decisions)
   ├─ /jobs                            │  ├─ /patterns
   ├─ /personas                        │  ├─ /cortex
   ├─ /automation                      │  └─ /report
   ├─ /pulsars                         └─ NOTIFICATIONS (top bar bell, not a page)
   ├─ /document-guard
   ├─ /settings
   └─ /account
```

**For the investigation domain (decisions/reo/reviews)**: this groups them all under REFLECTING, which is correct — but it also forces the right next question, which is the consolidation question.

---

## 7. Q3.5: The /decisions vs /reo vs /reviews question, finally

With the mode model in hand, the answer becomes clear:

| Page | What it is today | What it should be |
|---|---|---|
| **/reviews** | The *only* working feedback loop. AI Reviewer's decisions only. JSONL persistence. Right/wrong/adjust + comment + bulk + auto-exec. 1842 LOC of UX. | **Keep as the canonical "active feedback queue"**. Rename to `/feedback` to make purpose obvious. Generalize to other personas in REO Harden H5 — but the page UX should stay. |
| **/decisions** | Forensic drill-down per decision with cross-table storyline. 514 LOC. No feedback affordance. Built P1.B1 (commit `042247b`). | **Subsume into /reo**. /reo's case-file drawer (B6) already does exactly this with broader scope. The /decisions page is a strict subset. |
| **/reo** | Filing system over all decision_events with filters, presets, case-file drawer, feedback stub. 833 LOC. Built this session. | **Promote to canonical decision archive** — rename to `/archive` or `/decisions` (deprecating the old route to a redirect). REO is the broader, better-engineered version of what /decisions tried to be. |

The problem we keep tripping over is that **/reviews and /reo solve different problems**:

- `/reviews` is a **work queue** (active, time-sensitive, one-at-a-time review) — REFLECTING-as-DOING
- `/reo` is an **archive** (passive, browsable, long-tail search) — REFLECTING-as-RECALL

These are different IA primitives — the original REO plan-of-record (§2 IA position) correctly noted this. The pages **should** stay distinct. The thing to consolidate is `/decisions` → `/reo`, not `/reo` → `/reviews`.

**Concrete recommendation for next REO move**:

1. **REO Validate** (the next gate per plan §8 Phase 3) should explicitly include a UX walkthrough of `/reviews` to validate the "feedback queue vs filing archive" distinction holds with Sir holding the mouse
2. **REO Harden H5 (feedback connector backend)** should write to BOTH `pulse.decision_feedback` (new structured table) AND the existing `RESULTS_DIR/feedback.jsonl` so existing learned-patterns curation keeps working — parallel-write, not cutover
3. **Add a `/decisions → /reo` redirect** in App.tsx during REO Ship phase. Don't immediately delete DecisionsPage.tsx — keep it as fallback for one release cycle, then remove
4. **Add `/reo` to the sidebar Nexus group** before Sir's UX walkthrough (currently invisible)
5. **Bigger reframing question deferred**: do we eventually adopt the 4-mode IA across the whole sidebar? That's the "ultimate version" question (§9)

---

## 8. Q4: What does Alfred-Dev seem designed to provide?

Reading the README, CLAUDE.md, registry.yaml, archon-architecture.md, and the dashboard PLAN.md together, here is the most honest characterization:

**Alfred-Dev is a single-operator console for running an autonomous AI organization.**

The system is trying to be three things simultaneously, and **the dashboard's IA confusion comes from the fact that it has never explicitly named which of the three a given page serves**:

1. **A task system** (Pulse, /tasks, /board) — the human's daily work surface
2. **An autonomous AI orchestrator** (Nexus, dispatcher, 30 personas, 13 scheduled jobs) — runs without supervision, claims tasks, executes
3. **An introspection toolkit** (decisions, reviews, reo, observability, pipeline, nexus-ops, health, findings, patterns, cortex, report) — the interface through which a human stays in the loop on the AI

The implementation drift the design-intent walk surfaced is real and load-bearing:

- **No documented IA exists.** The dashboard was built iteratively over 6 phases without a pre-architecture. Each new feature added a page; nothing was ever merged. This is exactly the pattern that produces 35 routes and a sidebar nobody can defend.
- **Archon bidirectional comms deferred to v1.** Today the dashboard *displays* what Archons emit; it can't *direct* them. So "directing" mode for cross-Archon work doesn't exist yet — every DIRECTING page is config-of-AIFred-itself.
- **Profile system invisible in UI.** YAML profiles (general/homelab/development/production) gate which hooks fire, but the dashboard doesn't show the active profile or filter by it. So the user can't see "what's the system's current operating mode?"
- **No "task source" / "by-Archon" view.** Tasks come from many sources (Jarvis, creative pipeline, task-investigator, manual, recurring jobs, Archons) but there's no surface that groups by source. So "what's Jarvis asking me about today?" requires manual filtering.

> **★ Insight**
>
> The honest read of the dashboard's *intent* is in `dashboard/PLAN.md:1-3`: "Transform tasks.example.com from a basic task viewer into an actionable task management interface that handles 86+ tasks efficiently." That's a TASK MANAGEMENT INTERFACE — not the operations console for an AI organization. Everything beyond that primary intent (Nexus, Cortex, decision streams, persona configuration, observability) was bolted on later because the underlying system grew faster than the UX vocabulary to describe it. The current dashboard is a task manager that *also* shows you the AI org's internals because the AI org's internals are increasingly important. It's not an integrated console; it's a task manager + 27 ops/diagnostics/feedback pages.

---

## 9. Q5: The envisioned optimal version

I want to be careful here because "rebuild it from scratch" is rarely the right answer. Two versions: a **near-term consolidation** (achievable in 1-2 weeks) and a **long-term vision** (where I'd take it given a clean sheet).

### 9.1 Near-term: re-cleave the existing surfaces, don't rebuild

**Top-level shell**: explicit two-mode toggle at the top of the sidebar — **WORK** | **DIAGNOSE** — Sir's original axis. Default to WORK. Single keystroke to flip.

**Within WORK**, three subsections:
- **Today** (`/`, `/tasks`, `/board`, `/triage`, `/digest`)
- **Plan** (`/projects`, `/create`)
- **Direct** (`/jobs`, `/personas`, `/automation`, `/pulsars`, `/document-guard`, `/settings`, `/account`)

**Within DIAGNOSE**, two subsections:
- **Reflect** (`/reviews`, `/reo` *replacing* `/decisions`, `/patterns`, `/cortex`, `/report`)
- **Inspect** (`/health`, `/observability`, `/pipeline`-monitoring-only, `/nexus-ops`, `/token-compression`, `/usage`, `/findings`, `/budget`-monitoring-mostly)

**Specific consolidations**:

1. `/decisions` → redirect to `/reo` (DecisionsPage.tsx kept one cycle as fallback, then deleted)
2. `/pipeline` split: approval-card affordance moves into `/tasks?board=approvals`; rest stays under DIAGNOSE → Inspect
3. `/budget` move from Main → DIAGNOSE → Inspect (it's mostly read-only spend visualization)
4. `/usage` move from Main → DIAGNOSE → Inspect (same logic)
5. `/timeline`, `/activity`, `/queue`, `/ready`, `/approvals`, `/research`, `/schedule` — already redirects, leave them
6. `/reo` add to sidebar (currently orphaned)
7. `/notifications` becomes top-bar-only (remove from sidebar; the bell is enough)

**Cross-mode workflow paths**:

- From a `/reo` decision drill, click a "Submit feedback on this" button that opens `/reviews` filtered to that decision (cross-mode REFLECT-active path)
- From `/findings` "issue detected", click into the relevant `/tasks/:id` if the issue spawned a task (cross-mode DIAGNOSE → DOING path)
- From a `/health` failing job, click into `/jobs/:id` config (cross-mode DIAGNOSE → DIRECT path)

This is **achievable in ~3-5 days of work** if we're disciplined. Most of it is moving existing pages between sidebar groups + adding 3-4 redirect routes + 4-5 cross-mode link buttons. No new page implementations required.

### 9.2 Long-term: the integrated console

If designing Alfred-Dev's dashboard from a clean sheet, I'd start with this premise: **the user is operating an AI organization. The dashboard is their command-and-control interface. Every page should be visibly *of* that frame.**

That means:

1. **Dashboard frame: the "Operations Center" metaphor.** Top-bar shows: active profile, dispatcher heartbeat, current $ burn rate, open approvals count, last 5 critical events. Always visible. (Today's `ObservabilityBar` already does some of this — it's a good seed.)
2. **Mode toggle is a primary-color UI affordance**, not a hidden sidebar grouping. The user *knows* whether they're working or diagnosing.
3. **Every page has a consistent header**: page title, page mode (badge), "as of" timestamp, refresh control, and a "what is this for?" tooltip explaining the user mode it serves. No "what does this page do?" mystery.
4. **Decision archive (formerly /decisions + /reo) is the primary REFLECTING surface.** The case-file drawer is the primary affordance — every other surface that mentions a decision (a /reviews row, a /findings entry, a `/tasks/:id` event, a `/nexus-ops` event) deep-links to that drawer. ONE place to drill into a decision, accessed from many places.
5. **Feedback queue (/reviews) is the primary ACTIVE-REFLECTING surface.** It pulls from all personas (REO Harden H5), not just AI Reviewer. The user's daily flow is: open queue, batch through 5-10 decisions, give feedback, the system adjusts.
6. **Task surface uses responsibility tracking as the primary axis**, not status. "What's mine?" / "What's waiting on me?" / "What's the AI doing?" / "What's stuck?" are the four dominant modes. Filtering by status comes second.
7. **Persona/Job surfaces are mode-aware**: when in DIRECTING mode, show the "edit this prompt" affordance prominently. When in DIAGNOSING mode, show the same persona's recent decisions and outcomes inline. Same data, different framings.
8. **Pipeline visualization is first-class**: when a task moves through pipeline stages (intake → score → investigate → execute → review → close), I see the stages in real time on the task detail page, with timing per stage. Today's pipeline-stage visibility is buried in `/nexus-ops` topology view; it should be inline on every task.
9. **Profile-aware dashboards**: switching profile (e.g., from `homelab` to `development`) visibly changes the dashboard — different default filters, different subset of pages enabled, different sidebar shape. The dashboard mirrors the system's current operating context.
10. **The "AI organization roster" page**: a single surface showing every persona, every active job, every Archon, with their last activity, current state, and aggregate cost/decision/approval rate. This is the missing "who's working for me right now?" surface that today is split across `/personas`, `/jobs`, `/findings`, and `/cross-project`.

The point is **not to rebuild** — most of these pieces exist. The work is *recomposing* them into a coherent operator's console where every surface knows its role.

---

## 10. What I'd take next (prioritized)

In priority order, given this analysis:

| # | Effort | What |
|---|---|---|
| 1 | (no impl) | Discuss this analysis with Sir. Identify which pieces resonate, which don't, where to push back. The wrong move is to start refactoring before alignment. |
| 2 | ~0.5d | Write this foundational analysis doc to `Jarvis/projects/project-aion/reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md`. **(This document.)** |
| 3 | ~0.5d | Revise `aifred-pro-dev-reo-page.md` plan with the refined positioning — `/reo` is the canonical Decision Archive (subsumes /decisions), `/reviews` stays as canonical Feedback Queue (gets generalized), the parallel-write JSONL approach for H5. |
| 4 | ~3-5d | Near-term sidebar re-cleave: implement WORK/DIAGNOSE shell + 5 sidebar moves + /decisions → /reo redirect + cross-mode link buttons. Big perceived improvement, contained blast radius. |
| 5 | (existing plan) | REO Harden H5 with parallel JSONL write — the most concrete revision to existing plans. |
| 6 | months | Long-term vision items: Operations Center frame, profile-awareness, AI org roster page — these are R&D-scale rebuilds, not next-week work. |

---

## Open questions for Sir (returning brainstorm)

When Sir returns to this doc with edits, the conversations that matter most:

1. **Does the 4-mode model (DOING / DIRECTING / REFLECTING / DIAGNOSING) feel right, or is there a fifth I'm missing?**
2. **Is "WORK | DIAGNOSE" the right top-level toggle, or would a 3-way (WORK | REFLECT | DIAGNOSE) be more honest about REFLECTING's distinct status?**
3. **The /decisions → /reo consolidation: agree to redirect, or keep both with clear cross-links?**
4. **The "Operations Center" long-term framing — is that the metaphor, or is there a different frame closer to how Sir actually uses the system?**
5. **What's the MVP cut for the near-term re-cleave? Are all 7 specific consolidations worth doing in one PR, or stage them?**
6. **Any pages I've miscategorized in the mapping table?**
7. **How does this analysis bear on the in-flight REO Validate gate — should we proceed with Validate as planned, or pause Validate pending IA decision?**

---

## 11. Decisions captured 2026-05-11

Sir returned with answers to all 7 open questions (§ above). Ratified positions:

### 11.1 The mode model (Q1)
**Bundle PLANNING into DOING.** The /projects, /projects/:id, /cross-project, /create surfaces stay where they are functionally but are not a separate top-level mode — they are absorbed under DOING in the IA. The mode model going forward is **4 modes**: DOING (incl. planning), DIRECTING, REFLECTING, DIAGNOSING.

### 11.2 Top-level toggle (Q2)
**WORK | DIAGNOSE** confirmed as the top-level shell metaphor.
- **WORK side** contains DOING + DIRECTING (planning absorbed into DOING).
- **DIAGNOSE side** contains REFLECTING + DIAGNOSING — Sir's rationale: "DIAGNOSE implies and includes REFLECTING," i.e., looking-back-at-decisions and looking-at-system-internals are both forms of inspecting-after-the-fact and belong on the same side of the toggle.

This collapses §6's recommended 5-cluster sidebar (Today / Plan / Direct / Reflect / Inspect) to **4 clusters**:
- **WORK side**: Today, Direct
- **DIAGNOSE side**: Reflect, Inspect

### 11.3 /decisions vs /reo (Q3)
**Redirect /decisions → /reo and consolidate features.** Full subsume, not parallel maintenance. Audit DecisionsPage.tsx for any features ReoPage.tsx doesn't have, port them into ReoPage.tsx, then make /decisions a Navigate redirect. Implementation milestone 2 of the re-cleave PR (see ../plans/aifred-pro-dev-dashboard-recleavage.md).

### 11.4 Operations Center metaphor (Q4)
**Confirmed.** "Ops Center is the metaphor, and reflects user purposes of the AIfred UI." The long-term framing in §9.2 (Operations Center: top-bar shows active profile, dispatcher heartbeat, $ burn rate, open approvals, last 5 critical events) is the durable design target. Near-term re-cleave is the first concrete step toward that framing.

### 11.5 MVP cut + staging (Q5)
**All 7 consolidations in one shared PR.** No staging — single coherent re-cleave. Implementation plan-of-record decomposes the work into 3 AC-03 milestones for review checkpoints within the PR, but the milestones land together.

### 11.6 Mapping completeness (Q6)
**Mapping accepted as-is.** Completeness verification deferred to a later pass (likely during the re-cleave implementation, when each page gets touched and a final audit naturally occurs).

### 11.7 REO Validate gate (Q7)
**PAUSE Validate.** The REO Build is substantively complete (B4/B6/B7-UI shipped + MVP polish), but the Validate UX walkthrough is paused pending the re-cleave. After the re-cleave lands, REO resumes with:
- /decisions URL is a redirect to /reo (no UX confusion)
- /reo lives in the new DIAGNOSE → Reflect sidebar cluster (no longer orphaned in nav)
- REO Phase 5.5 PRE-SHIP AUDIT expanded to include /decisions-feature-parity verification
- Validate UX walkthrough then proceeds on the re-cleaved surface

REO Harden H5 (feedback connector backend) still recommended as parallel-write to existing JSONL per §2 of this analysis — separate from re-cleave; can resume after re-cleave + Validate.

### 11.8 Resulting near-term sequence

| # | Workstream | Effort | Status |
|---|---|---|---|
| 1 | **Dashboard re-cleave PR** (this artifact's §9.1 fully ratified) | ~3-5d | NOW (M1 begins after Sir approves impl plan) |
| 2 | REO Validate (paused — resumes after re-cleave lands) | ~0.5d | PAUSED |
| 3 | REO Harden H5 (parallel-write feedback) | ~2-3h | QUEUED (after Validate) |
| 4 | REO Harden H1-H4, H6-H8 (other emitters, lessons-learned extension) | ~3-4d | QUEUED |
| 5 | Long-term: Operations Center frame, profile-awareness, AI org roster | months | DEFERRED |

### 11.9 What this analysis becomes now

Status flips from DRAFT to **APPROVED-PENDING-IMPL**. The implementation plan-of-record (`../plans/aifred-pro-dev-dashboard-recleavage.md`) is the next thing to read for execution detail. Once the re-cleave PR lands, status flips to **APPROVED-IMPLEMENTED**, and this document becomes the durable IA reference for Alfred-Dev's dashboard.

---

*Status: APPROVED-PENDING-IMPL. Implementation plan: `../plans/aifred-pro-dev-dashboard-recleavage.md`.*
