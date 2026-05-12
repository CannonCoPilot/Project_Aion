---
type: reference
version: "1.0"
date: 2026-05-04
author: Jarvis
project: AIFred-Pro
workstream: P1.A1 — AI Reviewer persona dashboard instrumentation
status: living document
related:
  - projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md
  - .claude/context/.active-plan
  - .claude/context/session-state.md
---

# A1 Source Documents — Reference

Annotated bibliography for **P1 / A1** (AI Reviewer persona dashboard instrumentation, Alfred-Dev `nate-dev` branch). Consult this while implementing A1 to anchor design decisions back to authoritative inputs.

This is a *working reference*, not a plan. The implementation plan, when written, lives in `projects/project-aion/plans/`.

---

## Critical framing — A1 is NOT UsagePage.tsx

A common misread: A1 looks adjacent to the existing `UsagePage.tsx` and the Phase 3 usage-tracking work. The two are **distinct**:

| Concern | UsagePage.tsx (Phase 3, shipped) | A1 (this workstream) |
|---|---|---|
| **What it tracks** | Anthropic API token consumption (input/output tokens, cache effectiveness, 5h session windows) | AI Reviewer *persona* execution telemetry (review outcomes, security findings, latency) |
| **Data source** | Proxy-captured Anthropic API headers → `usage-proxy` on `:9800` → Pulse PostgreSQL | `.claude/jobs/personas/ai-reviewer/` definition + `.claude/logs/headless/executions/` runtime data |
| **Pulse endpoints** | 9× `/usage/*` routes (already shipped, +632 lines in `pulse/app.py`) | New `/personas/ai-reviewer/*` routes (to be designed) |
| **Frontend** | `UsagePage.tsx` (38,969 bytes, lives at `dashboard/frontend/src/pages/UsagePage.tsx`) | New persona panel/page (not yet scaffolded) |
| **Status** | Code complete, awaiting dashboard container rebuild | Directive only; no code, no design doc |

A1 *shares* the dashboard container with UsagePage — that's why "rebuild the dashboard" is a shared prerequisite. They live in the same React app and use the same React Query + Recharts pattern. But they are independent panels reading independent data.

---

## Source Document Tree (causal layers)

| # | Layer | Path | Size / Status | Role for A1 |
|---|---|---|---|---|
| 1 | Origin | `Shared_Projects/Questions/david-2026-04-14.md` | 7 lines | David's open invitation — conversation seed |
| 2 | Vision | `Shared_Projects/Debriefs/AIFred-Pro/2026-04-23-dev-workspace-and-usage-metrics-vision.md` | 71 lines | First "dashboard is highest priority" articulation |
| 3 | Phase 3 evidence | `Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-usage-tracking-phase3-complete.md` | 66 lines | Confirms Phase 1-3 shipped; flags dashboard rebuild as the unblock |
| 4 | **DECISION** | `Shared_Projects/Questions/Archon-2026-04-25-reply-to-checkin.md` | 89 lines, **answered by David directly** | The mandate — selects AI Reviewer first, locks UI stack, resolves `bd` binary FUD |
| 5 | Synthesis | `projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md` | 331 lines | Bundles A1+B1 into P1; surfaces audit-ingest dedup gap connection |
| 6 | Pattern artifact | `Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx` | 38,969 bytes | Pattern reference — A1's panel will live alongside, share visual grammar, NOT replace |
| 7 | Target artifact | `Alfred-Dev/.claude/jobs/personas/ai-reviewer/` | 5 files (config.yaml, learned-patterns.yaml, methodology.yaml, permissions.yaml, prompt.md) | Persona being instrumented; defines what a "review" is |
| 8 | Data artifact | `Alfred-Dev/.claude/logs/headless/executions/` | 826 dated execution dirs (latest 2026-05-04) | Live runtime data; A1's read source |

**Document hierarchy when in conflict**: Doc 4 (David's direct answer) trumps Doc 5 (Jarvis's synthesis). Both are current; no known conflict between them.

---

## Per-Document Detailed Review

### Doc 4 — David's 2026-04-25 reply (THE decision document)

`Shared_Projects/Questions/Archon-2026-04-25-reply-to-checkin.md`

The load-bearing document for A1. Six material decisions David committed in writing:

| Decision | Verbatim | Implication for A1 |
|---|---|---|
| `bd` binary status | "dead weight now... should be able to build the container fine" | Build path unblocked; no need to chase binary |
| Build directory | "make sure you're building from the `dashboard/` directory, not the project root" | `cd /Users/nathanielcannon/Claude/Alfred-Dev/dashboard` is the canonical location |
| Build command | `docker build -t aifred-dashboard:latest .` | Direct command; no improvisation |
| Run command | `docker run -it -p 8600:8600 aifred-dashboard:latest` | Port `:8600` is canonical (prod); `:8701` in dev override per `docker-compose.dev.yml` |
| UI stack | "stick with React + React Query + Recharts" | No framework decision; mirror UsagePage.tsx pattern |
| First persona | "start with the **AI Reviewer**" + "one persona done well rather than a broad tiered rollout" | A1 scope is single-persona, deep — not multi-persona, shallow |

**The four AI Reviewer signal classes** David enumerated:
1. **What's being reviewed and when** (input volume, timing)
2. **Review outcomes** (pass / fail / flagged)
3. **Security findings and risk classifications**
4. **Review latency and coverage gaps**

These map to the natural panel structure for A1's UI. Not yet ranked by David — see Open Question #3 below.

**Authority note**: the answer block carries a header — *"My automation (Liaison persona) drafted an initial response to this. I've reviewed it and replaced it with my direct answers below. — David"*. Liaison is David's auto-answer persona. He explicitly overrode it. Every word in this answer is David's actual position, not an algorithmically-routed reply.

`★ Insight ─────────────────────────────────────`
- The "one persona done well" instruction is a **methodology lock**, not aesthetic preference. It rules out the tempting "scaffold a generic Personas page, fill in AI Reviewer first" alternative — cheaper per LOC but produces worse first iteration. The document's narrative supplies the *why*: signal density per engineering hour.
- David's "directly, reviewed Liaison draft" provenance note is uncommon in our Q&A flow — most answers come through Liaison without override. That David broke routine here suggests the dashboard direction matters to him personally, not just structurally.
`─────────────────────────────────────────────────`

---

### Doc 3 — Phase 3 complete debrief

`Shared_Projects/Debriefs/AIFred-Pro/2026-04-24-usage-tracking-phase3-complete.md`

Critical for A1 because it establishes existing dashboard infrastructure — A1 plugs in, doesn't greenfield. Key extracts:

- **Proxy architecture**: usage-proxy on `:9800`, transparent reverse proxy. Pattern for backend instrumentation if A1 needs runtime data capture.
- **Pulse endpoints exist**: 9 `/usage/*` routes shipped (+632 lines in `pulse/app.py`). A1 will likely add `/personas/ai-reviewer/*` routes alongside.
- **React Query pattern**: "Each analytics panel has its own React Query hook hitting its own Pulse endpoint." A1 inherits this; UsagePage.tsx demonstrates it (lines 27-36 import 8 such hooks from `../api/usage`).
- **Dashboard rebuild needed**: explicitly flagged here. David's 04-25 reply resolves it.
- **Test discipline**: 107 tests passing (55 proxy + 52 endpoint). A1 should add parity coverage.

**Architecture extract worth memorizing**:
> "A comprehensive token usage analytics system... The end goal is intelligent scheduling — knowing when budget is available, how fast it's being consumed, and automatically gating work to stay within allotment windows."

This frames A1's place in the larger arc: A1 provides *persona-level observability*, the layer above API-level observability, both feeding the eventual intelligent-scheduling layer (P2 / C1).

---

### Doc 2 — Vision debrief

`Shared_Projects/Debriefs/AIFred-Pro/2026-04-23-dev-workspace-and-usage-metrics-vision.md`

The genesis. Key insight: **A1 is not the original vision** — Phase 3's UsagePage was. A1 is the *next thread* David's 04-25 answer redirected toward, building on Phase 3's operational infrastructure.

Architectural facts established:
- Dashboard runs on `:8701` in dev (vs `:8600` prod — dev override in `docker-compose.dev.yml`)
- 24 dashboard pages, 120+ components — A1's panel slots in, doesn't restructure
- "ProjectIntel skill is live" — collaboration tooling already in place

`★ Insight ─────────────────────────────────────`
- Read this debrief to understand *why the question was asked*. The vision was Anthropic-API observability (UsagePage). David's 04-25 answer accepted that vision then *added* persona-level observability as the next layer. A1 is a vertical extension of the same observability ladder — not a side quest. That framing matters when scoping: A1 should *feel like* a sibling to UsagePage, sharing visual language and panel grammar.
`─────────────────────────────────────────────────`

---

### Doc 5 — Comprehensive review (the synthesis)

`projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md`

Most recent and most opinionated. Passages directly relevant to A1:

- **§3.5 "Decision points David has confirmed"** — bullets 2 and 4 codify the A1 mandate
- **§5.2 outstanding items** — flags `dashboard/frontend/src/lib/board.ts` BLOCKER_LABELS missing `waiting:human` as "FIX before milestone." Small, in-the-dashboard, could fold into A1's first commit as cleanup-while-here
- **§9 discussion topic 3** — "AI Reviewer persona instrumentation scope... clarify which metrics matter most" — flags signal-class ranking as a debrief topic

**The A1+B1 bundling rationale**: §3.2 / §5 connect them via the audit-ingest dedup gap. B1's `93f5320` decision-rationale rollout writes `pulse.decision_events` with a known double-write defect; A1's AI Reviewer dashboard is a natural consumer of those events. Doing them together means A1's panel design can anticipate B1's data shape.

---

### Doc 6 — UsagePage.tsx (pattern reference)

`Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx` (38,969 bytes)

What to copy from this for A1:

- **File-level docstring pattern** (lines 1-9): plain comment establishing scope and data-source discipline. A1's file should similarly state "Reads exclusively from `.claude/logs/headless/executions/` and persona definition files. No estimation, no fallback."
- **Empty-state component** (`NoProxyData`, lines 70-82): graceful degradation when data source is offline. A1 needs equivalent (e.g. `NoExecutionData` for when AI Reviewer hasn't run recently).
- **Panel composition pattern** (e.g. `TimePanel`, lines 86+): one component per panel, owns its query hook + loading state + empty state + render.
- **React Query hook conventions**: imports from `../api/usage` (e.g. `useSessionWindow`, `useSessionTokens`). A1 will have `../api/personas` (or similar) exporting `useAIReviewerOutcomes`, `useAIReviewerSecurityFindings`, etc.
- **Shared visual primitives**: `TOOLTIP_STYLE` constant, color palette (`DAY_COLORS`), formatters (`formatTokens`, `formatDuration`). A1 should reuse these for visual consistency.

---

### Doc 7 — AI Reviewer persona definition (the target)

`Alfred-Dev/.claude/jobs/personas/ai-reviewer/`

Five files defining what AI Reviewer *is*. A1 must read these to know what to surface:

| File | Likely contents (per persona convention) |
|---|---|
| `config.yaml` | Persona metadata, model, label triggers, output schema |
| `prompt.md` | Reviewer instructions (per `93f5320` commit message: "Step 7 retrofit — thread_id in daily JSONL — + new Step 7b — decisions-*.json companion with review_verdict") |
| `methodology.yaml` | How the persona reasons — review categories, severity scales |
| `learned-patterns.yaml` | Accumulated heuristics (likely populated by self-evolution) |
| `permissions.yaml` | What systems/labels the persona can mutate |

**B1 dependency**: David's `93f5320` (B1) **modifies** `personas/ai-reviewer/prompt.md` to add Step 7 (thread_id in daily JSONL) + Step 7b (decisions-*.json companion). After cherry-pick, A1's panel can rely on those new artifacts existing — they're the cleanest data source for the dashboard. Without B1, A1 reads raw execution dirs and refactors when B1 lands.

**Status**: file names confirmed, contents not yet sampled in reference work. Read these before serious A1 design.

---

### Doc 8 — Headless logs (the data)

`Alfred-Dev/.claude/logs/headless/`

Live evidence the AI Reviewer is producing data right now:

| Path | Last touched | Notes |
|---|---|---|
| `aifred-jobs.jsonl` | 2026-04-26 16:59 | 756 KB — historical jobs roll |
| `executions/` | 2026-05-04 08:50 | 826 dated execution directories (today's most recent) |
| `service-evaluate.log` | 2026-05-04 08:32 | 94 KB — pipeline-v2 evaluate service |
| `service-execute.log` | 2026-05-04 08:50 | 80 KB — pipeline-v2 execute service |

A1 reads from `executions/<date>/<job-id>/` per execution. The daily-JSONL pattern from `93f5320` would aggregate these into per-day rolls.

---

## Document Freshness Audit

| Doc | Last touched | Stale risk | Notes |
|---|---|---|---|
| 1 | 2026-04-14 | None — historical seed | Just the question's origin |
| 2 | 2026-04-23 | LOW — vision still valid | Architecture facts (ports, stack) hold |
| 3 | 2026-04-24 | LOW — Phase 3 status unchanged | Test counts, endpoint counts current |
| 4 | 2026-04-25 (answered same day) | **NONE — explicit David position** | Most authoritative input |
| 5 | 2026-05-04 (today) | NONE — current synthesis | Today's comprehensive review |
| 6 | 2026-04-25 08:57 | LOW — stable code | UsagePage hasn't changed since David's reply |
| 7 | Variable per file | UNKNOWN until sampled | Contents not yet read |
| 8 | Today (2026-05-04 08:50) | NONE — live | Executions actively writing |

---

## Open Questions / Gaps This Reference Surfaces

1. **A1 has no design document.** Unlike usage-proxy work (explicit Phase 1-3-4 staging), A1 exists only as David's directive + a synthesis bullet. Recommendation: write a 1-page A1 design doc at `projects/project-aion/plans/<adjective-animal>.md` before significant coding.

2. **Port discrepancy `:8600` vs `:8701`** between Doc 4 and Doc 2. Almost certainly dev-vs-prod port mapping (`:8701` is dev override per `docker-compose.dev.yml`); confirm on first build attempt.

3. **The four signal classes are unranked.** David listed them but didn't prioritize. Doc 5 §9.3 flags this as a debrief topic. Two options: (a) ship v1 with all four equal-weight panels and let David rank in feedback, (b) ask before coding.

4. **Persona files (Doc 7) unsampled.** Have file names + David's reference but haven't read contents. Reading `config.yaml` + `prompt.md` would tell us the persona's *output schema* — which IS the input schema for A1's panels.

5. **B1 sequencing question: cherry-pick before or after A1?** Cherry-pick first → A1's panel targets clean `decisions-*.json` (better data shape). A1 first → must read raw execution dirs and refactor when B1 lands. Doc 5 prefers bundle-together. Open for tactical decision.

6. **No acceptance criteria specified** anywhere in source material. There is no "A1 is done when..." statement. Before significant coding, propose acceptance criteria framed against David's four signal classes — either send via Questions/ for explicit sign-off, or proceed with first cut and ask for feedback (faster, risks rework).

---

## Implementation Pre-flight Checklist

Concrete checks before opening an editor on A1 code:

- [ ] **Dashboard build clears** — `cd /Users/nathanielcannon/Claude/Alfred-Dev/dashboard && docker build -t aifred-dashboard:latest .` exits 0
- [ ] **UsagePage renders** — `docker run -it -p 8600:8600 aifred-dashboard:latest` then visit `http://localhost:8600/usage`
- [ ] **Persona files sampled** — read all 5 files in `.claude/jobs/personas/ai-reviewer/`
- [ ] **Execution data shape understood** — sample `.claude/logs/headless/executions/<recent-date>/<one-job>/` to know what fields exist
- [ ] **B1 cherry-pick decision made** — pick before A1 or after? (See Open Q #5)
- [ ] **A1 design doc drafted** — `projects/project-aion/plans/<adjective-animal>.md` covering panel layout, endpoint shape, B1 dependency surface
- [ ] **Acceptance criteria proposed** — either via Questions/ to David, or in the design doc with intent to validate later

---

## Cross-Reference Index

**For each open question, the authoritative source**:

| Question | Authoritative source |
|---|---|
| Why AI Reviewer first? | Doc 4 (David's direct answer) |
| What signal classes? | Doc 4 (4-bullet list) |
| What dashboard framework? | Doc 4 ("React + React Query + Recharts") |
| What ports? | Doc 4 (prod `:8600`) + Doc 2 (dev `:8701`) |
| Where does data come from? | Doc 4 (`.claude/jobs/personas/*/` + `.claude/logs/headless/`) + Doc 8 (live confirmation) |
| What pattern to follow? | Doc 6 (UsagePage.tsx) |
| What is B1's surface area? | Doc 5 §3 + B1 commit `93f5320` (read directly) |
| Why bundle A1+B1? | Doc 5 §3.2, §5 (audit-ingest dedup gap connection) |

**For each implementation choice, the supporting documents**:

| Choice | Supporting docs |
|---|---|
| Build directory `dashboard/` | Doc 4 |
| Use existing `pulse/app.py` for endpoints | Doc 3 (pattern), Doc 4 (data location) |
| One panel = one React Query hook | Doc 3 (pattern), Doc 6 (concrete example) |
| Empty-state graceful degradation | Doc 6 (`NoProxyData` template) |
| Reuse formatters/colors/tooltip styles | Doc 6 (lines 40-68) |
| Single-persona deep, not multi shallow | Doc 4 (explicit instruction) |

---

## Provenance

- Generated 2026-05-04 from a session-internal review of Docs 1-8.
- Compiled in conversation following P0 (context-budget optimization) ship.
- Not yet validated against Docs 7 contents (persona files unread at compile time — flagged in pre-flight checklist).
- Insights blocks reflect Jarvis's session interpretation and are non-authoritative; they help reasoning but do not override Doc 4 if conflict arises.

*Update this document if/when:*
- Doc 7 persona files are sampled (replace "likely contents" with actuals).
- David provides explicit signal-class ranking (close Open Q #3).
- A1 design doc is drafted (link from §"Cross-reference index").
- B1 cherry-pick lands (note in §"Source Document Tree" that Doc 7's `prompt.md` now includes Step 7/7b artifacts).
