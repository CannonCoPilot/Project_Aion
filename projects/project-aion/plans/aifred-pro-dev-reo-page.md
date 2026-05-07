---
title: REO Page — Plan of Record (Reviews, Executions, Orchestrations)
date: 2026-05-07
status: DRAFT (Phase 1 of draft→build→validate→MVP→harden→ship→debrief)
project: AIFred-Pro-Dev
target_branch: nate-dev
supersedes: aifred-pro-dev-reviewer-dash.md (factual errors corrected; framing rewritten)
related:
  - reviewer-foundational-reexamination-2026-05-07.md (Jarvis analysis, preserved intact)
  - pulse-nexus-boundary-audit-2026-05-05.md (boundary tagging Pulse vs Nexus)
parallel_workstreams:
  - Board v2 component-cards layer (separate plan, not yet drafted)
  - Watchdog W1-W3 (separate plan: aifred-pro-dev-pipeline-watcher-watchdog.md)
audience: Nate, David, future-Jarvis
---

# REO Page — Plan of Record

## 1. Vision

A **filing system** for pipeline decision-making across the entire Pulse-Nexus pipeline.

REO captures every gate or pathing decision made by core pipeline components — both **reasoning decisions** (LLM-driven judgments by personas: evaluate, reviewer, diagnose) and **mechanistic decisions** (deterministic gates: safety blocklists, retry caps, label rules, chain assembly).

The user can browse, search, retrieve case files, and provide right/wrong feedback that feeds back into the persona layer via a lessons-learned mechanism.

**Tagline**: review-reflect-decide-tag operators of the Pulse-Nexus pipeline.

## 2. IA position

| Surface | Route | Primitive | Status |
|---|---|---|---|
| **REO** | `/reo` | Filing system | NEW (this plan) |
| `/decisions` (P1.B1) | `/decisions` | Filing-subset (legacy) | Stays in place; functionally subsumed by REO |
| `/reviews` (human queue) | `/reviews` | Active work-queue | Stays distinct (different IA primitive) |
| `/reviewer-dash` (R1+R2) | `/reviewer-dash` | NA | Renamed to `/reo` in Build phase |
| Board v2 component-cards | TBD | Live ops dashboard | Parallel workstream, separate plan |

**Key distinctions**:
- REO is *archive* semantics (browse, search, retrieve). Board v2 is *live status* semantics (KPI cards, ops health). They are different IA primitives and should not share a page.
- REO is *passive recording + retrospective annotation*. `/reviews` is *active work queue*. REO answers "what was decided?"; `/reviews` answers "what needs my attention?"

## 3. Architecture

```
Pipeline components (decision emitters)
   │
   │ log_decision()
   ▼
pulse.decision_events ◄──── joined on thread_id ────┐
pulse.audit_log                                      │
pulse.cost_events                                    │
   │                                                 │
   │ Pulse READ API (P1.B1.1)                       │
   ▼                                                 │
Dashboard server (consumes Pulse API)                │
   │                                                 │
   ▼                                                 │
/reo page                                            │
   ├── Browse mode (default): chronological + grouped by thread
   ├── Live tail mode: real-time append-feed
   ├── Case-file drawer: full row + cost + audit + task state
   └── Feedback connector ──► pulse.decision_feedback
                                          │
                                          │ aggregation/distillation
                                          ▼
                                  Lessons-learned book
                                  (existing? new? — investigate)
                                          │
                                          │ system-prompt context injection
                                          ▼
                                  Personas at decision-time
```

## 4. Decision-emitter inventory

| Component | Decision type | Currently emits decision_events? | Wire priority |
|---|---|---|---|
| `executor.py` | budget_gate, task_claim, persona_selection, task_release | ✓ P1.6 commit `5720cdc` (30 sites) | done |
| `pipeline-watcher.py` | retry_decision, give_up | ✓ P1.6.x commit `4322469` | done |
| `diagnose.py` | diagnose_outcome (failure_mode classification) | ✓ | done |
| `reviewer.py` | review_outcome (PASS/FAIL + confidence + issues) | ✗ — emits log_activity only | **P0** — Build phase |
| `evaluate.py` | safety_gate, decompose_choice | ✗ | P1 — Harden phase |
| `orchestrate.py` | chain_assembly, dependency_block | ✗ | P1 — Harden phase |
| `watchdog` (label-fix loop) | label_correction | ✗ (probable; verify) | P2 — Harden phase |
| `stage.py` / intake | initial_gating | ✗ (probable; verify) | P2 — Harden phase |

**Standardization**: Define a consistent `decision_type` taxonomy across components. Proposed root types: `safety_gate`, `feasibility_gate`, `routing_choice`, `execution_gate`, `verification_outcome`, `failure_classification`, `correction_action`, `lifecycle_transition`. Subtypes per component.

## 5. Page IA detail

### Default mode: Browse
- Chronological list (newest first)
- Group-by-thread collapse (case-file rollup)
- Filter chips: actor (multi), decision_type (multi), outcome (pass/fail/blocked/etc.), time-range, free-text in `details JSONB`, task_id, thread_id
- Saved filter presets (3-4 default + user-saved)
- Pin/star primitive for noteworthy decisions
- Pagination + lazy-load for >1000 row sets

### Secondary mode: Live tail
- Real-time append-feed (10-30s polling; SSE if performance demands)
- Same filter UI applied to live stream
- Pause/resume controls
- Auto-scroll-to-bottom toggle

### Drill: Case-file drawer
- Click any row → right-side drawer
- Top: full decision_events row (actor, decision_type, outcome, confidence, details JSONB pretty-printed)
- Middle: linked cost_events for that thread (table)
- Middle: linked audit_log entries for that thread (timeline)
- Bottom: task state at decision time (snapshot if available)
- Action: **feedback connector** (see §6)
- Action: deep-link `?decision_id=<uuid>` for sharing

### Search
- Free-text against `details JSONB` (Postgres FTS or @> JSONB containment)
- task_id and thread_id direct lookup
- Quoted-phrase search for exact match

## 6. Feedback connector

### User input shape

```typescript
interface DecisionFeedback {
  decision_event_id: string  // FK to pulse.decision_events.id
  user: string               // 'nate' | 'david' | persona-id (future)
  verdict: 'right' | 'wrong' | 'partial'
  comment: string            // freeform, ~500 char limit
  suggested_correction?: {   // optional structured field
    correct_outcome?: string
    correct_decision_type?: string
    notes?: string
  }
  created_at: timestamp
}
```

### Storage

New table `pulse.decision_feedback` (migration in Harden phase) OR JSONB extension on `decision_events.feedback` (lower friction; less queryable).

**Recommendation**: separate table for queryability and to support multi-user feedback per decision.

### UI

In case-file drawer:
- 3-state radio (right/wrong/partial)
- Comment textarea
- Optional "suggest correction" expandable form
- Submit button → POST /api/reo/feedback
- After submit: show acknowledgment + log entry; allow edit/delete within 24h

## 7. Lessons-learned mechanism

**Status**: INVESTIGATION COMPLETE 2026-05-07. An existing mechanism was found and characterized; integration plan is now extension-not-greenfield.

### Existing mechanism (discovered)

**Primary**: `AIFred-Pro-Dev/.claude/jobs/personas/ai-reviewer/learned-patterns.yaml`
- 350 lines, fully operational, last updated 2026-04-09
- YAML schema: per-pattern entries with `description`, `conditions`, `action`, `confidence`, `risk`, `source` (citation back to session or David-quote)
- 32 named patterns; aggregate stats: 104 agreed, 3 wrong, 13 adjusted (120+ feedback round-trips over ~7 months)
- **Maintenance flow**: user feedback lands in `.claude/agent-output/results/ai-david/feedback.jsonl` → AI Reviewer persona reads feedback on next run → updates patterns in-place using three actions:
  - `agreed` — reinforce pattern weight
  - `wrong` — add negative rule
  - `adjusted` — refine conditions
- Loaded by ai-reviewer's `prompt.md` (lines 41-64) at start of every run; patterns matched during task evaluation (line 111)
- **This is a third curation pattern**: persona-self-curation. Not human-curated (no proposals queue); not fully autonomic (the persona, not a separate process, decides updates).

**Secondary**: `AIFred-Pro-Dev/.claude/context/lessons/corrections.md`
- Placeholder/template (~25 lines, empty body)
- Designed for unimplemented `self-correction-capture` hook (referenced line 4)
- Pipeline-wide rather than persona-scoped
- Human-authored entries (table: Date | Topic | Mistake | Correction | Lesson)
- Intended for cross-persona patterns (e.g., "always defer destructive ops on `tag:experimental` regardless of persona")

**Tangential (not lessons-learned)**:
- `personas/cortex/` — Meta-Learning Advisor; monitors pattern health system-wide; writes only to `.claude/agent-output/results/cortex/recommendations.jsonl`; NEVER edits patterns directly (constraint at prompt.md lines 19-21)
- `personas/creative-feedback/` — different domain (creative outputs review workflow)

### Integration plan (revised from green-field to extension)

REO's feedback connector integrates with the existing mechanism by:

1. **Writing feedback to persona-specific JSONL files** routed by `decision_event.actor`:
   - `actor='persona:reviewer'` → `personas/<reviewer-persona-id>/feedback.jsonl`
   - `actor='persona:executor'` → `personas/<executor-persona-id>/feedback.jsonl`
   - etc.
   - Each persona processes its own feedback file on next run and updates its own learned-patterns.yaml — no central feedback router needed

2. **Bootstrapping learned-patterns.yaml templates** for personas that don't have one yet:
   - 5 new templates following the ai-reviewer schema: executor, evaluate, orchestrate, diagnose, reviewer-service
   - Each persona's prompt.md gets the load+process workflow added (mirror of ai-reviewer prompt.md lines 41-90)
   - Bootstrap with empty patterns; populate organically through feedback (same way ai-reviewer started)

3. **Wiring the unimplemented `self-correction-capture` hook** for cross-cutting pipeline lessons:
   - Implement the hook → writes to `.claude/context/lessons/corrections.md`
   - Cross-persona patterns go here (architectural rules that apply regardless of which persona handles a task)
   - Optional / Harden+ scope; defer if Build/MVP/Validate phases run long

4. **Schema alignment**: REO's feedback verdict shape (`right | wrong | partial` + comment + suggested-correction) maps to the discovered three-action vocabulary:
   - REO `right` → existing `agreed` (reinforce)
   - REO `wrong` → existing `wrong` (add negative rule)
   - REO `partial` → existing `adjusted` (refine conditions; `suggested_correction` populates the refinement)

### Curation flow (revised)

Adopt the discovered **AI-mediated curation** pattern for REO MVP. Validation: ai-reviewer's 7-month accumulation history (104 agreed pattern reinforcements with 0 collapses or major regressions) demonstrates this works at sustained scale without human curation overhead.

Optional human-override layer: the unimplemented `self-correction-capture` hook for high-impact cross-persona lessons. Worth implementing in Harden+ if pipeline-wide patterns emerge that don't fit any single persona's scope.

## 8. Phases

### Phase 1: DRAFT (~0.5d, in progress)
- ✓ This plan-of-record
- ✓ Question/ to David (`Shared_Projects/Questions/AIFred-Pro/2026-05-07-reo-page-direction.md`)
- Lessons-learned investigation (parallel; report to integrate before Harden phase)

### Phase 2: BUILD (~2d)
- **B1**: Wire `reviewer.py` → `log_decision()` calls (PASS/FAIL/retry/diagnose-trigger; ~1h, pure addition, isolated)
  - actor: `persona:reviewer`
  - decision_type: `review_outcome`
  - outcome: `passed | failed | retrying | blocked_max_retries`
  - confidence: from review_output
  - details: {engine, model, issues, retry_count, files_modified_verified, telemetry}
- **B2**: Smoke-verify reviewer rows appear on existing /decisions
- **B3**: Rename `/reviewer-dash` → `/reo` (route + page filename + nav entry + reviewer-dash.ts proxy → reo.ts)
- **B4**: Generalize R1 backend filters (persona → actor; add decision_type multiselect; task_id/thread_id search; free-text in details)
- **B5**: Generalize R2 frontend (drop "Reviewer" copy; add browse-default/live-tail toggle)
- **B6**: Implement case-file drawer (replaces R3 from old plan)
- **B7**: Stub feedback connector UI (no backend yet — front-end captures + console.logs in this phase)

### Phase 3: VALIDATE (~0.5d)
- Smoke test against pulse_dev with reviewer + executor + diagnose decisions
- Verify case-file drawer joins (decision + cost + audit) correctly
- Confirm browse + live-tail toggle works under real load
- Manual UX walkthrough (Nate); identify gaps and capture in scratchpad

### Phase 4: MVP (~0.5d)
- Polish: copy, empty states, error handling, loading skeletons
- Saved-filter presets (e.g., "Today's failures", "All reviewer FAIL", "Cost > $0.50 per decision")
- Pin/annotate primitive (local-storage first; persistence in Harden)
- Smoke script (`smoke-reo.sh`) for pre-deploy validation

### Phase 5: HARDEN (~3-4d)
- **H1**: Wire `evaluate.py` → decision_events (~2h)
- **H2**: Wire `orchestrate.py` → decision_events (~2h)
- **H3**: Wire `watchdog` → decision_events (~1h, after watchdog implementation review)
- **H4**: Wire `stage.py` / intake → decision_events (~1h)
- **H5**: Build feedback connector backend (`pulse.decision_feedback` table + POST endpoint + GET for case-file drawer)
- **H6**: Wire feedback into lessons-learned mechanism (per investigation findings — see §7):
  - Bootstrap 5 new `learned-patterns.yaml` templates for executor / evaluate / orchestrate / diagnose / reviewer-service following ai-reviewer's schema
  - Add load+process workflow to each persona's prompt.md (mirror of ai-reviewer lines 41-90)
  - REO feedback connector backend writes to per-persona `feedback.jsonl` routed by `decision_event.actor`
  - Map REO verdict shape (right/wrong/partial) to existing action vocabulary (agreed/wrong/adjusted)
  - (Optional / Harden+) Implement `self-correction-capture` hook for cross-persona pipeline lessons (`corrections.md`); defer if scope tight
- **H7**: Add Pulse READ aggregations for cross-persona stats (counts, outcome distribution per actor)
- **H8**: Deep-link, export (CSV/JSON), saved-search persistence

### Phase 5.5: PRE-SHIP AUDIT (~0.5d) — FINAL GATE before SHIP
**Trigger**: discovery 2026-05-07 that AIFred-Pro-Dev `aifred-dev-dashboard` was running `aifred-pro-nexus-dashboard:latest` (a production-derived image tag with no compose labels), pinned via `image:` override + `build: !reset null` in `docker-compose.dev.yml`. Frontend dev work was not reaching the dev container; dev was effectively running prod-frontend code.

**Scope**: full audit across all 5 dev compose services (`postgres`, `pulse`, `nexus-dashboard`, `pipeline`, `usage-proxy`) for any other dev/prod cross-contamination:
- Image tags: every dev container's image must come from a build of AIFred-Pro-Dev source, with project label `com.docker.compose.project=aifred-pro-dev`. Flag any image tagged `aifred-pro-*` (production-derived).
- Container names: confirm `aifred-dev-*` convention is universal; flag any leak to `aifred-*` (prod) names.
- Network attachments: dev should be on `aifred-dev-network` exclusively; flag any join to `aifred-network` (prod).
- Volume mounts: dev volumes named `aifred-dev-*-data`; flag any reuse of `aifred-*-data` (prod) volumes that could leak state.
- Port bindings: dev uses prod+100 convention per `dev-space-isolation.md`; flag drift.
- Environment variables: any reference to prod database hosts / Pulse URLs / API keys that point at production endpoints.

**Deliverable**: `Jarvis/projects/project-aion/reports/aifred-pro-dev-cross-contamination-audit-YYYY-MM-DD.md` with findings + remediation per finding. Each finding gets one of: FIXED (in same PR), DEFERRED (with justification + ticket), ACCEPTED-RISK (with justification).

**Done criteria**: zero P0 findings (silent prod data leak, prod-image cross-contamination, prod-DB write from dev). P1+P2 findings may be deferred with explicit acknowledgement.

**Why a final gate**: REO is the first dashboard surface where Jarvis is the primary builder of dashboard frontend code. Prior cross-contamination wasn't load-bearing because dev frontend wasn't being iterated on. Now it is. Other contamination patterns may exist that haven't surfaced yet because no current workstream stresses them.

### Phase 6: SHIP (~0.25d)
- **GATED** on Phase 5.5 PRE-SHIP AUDIT zero-P0 sign-off
- Push nate-dev
- Verify dashboard build green
- Update AIFred-Pro-Dev `.claude/CLAUDE.md` if architectural change touches docs
- Update Jarvis force-loaded if any
- Coordinate Telegram announcement to David if appropriate

### Phase 7: DEBRIEF (~0.25d)
- Write debrief: `Shared_Projects/Debriefs/AIFred-Pro/YYYY-MM-DD-reo-page-shipped.md`
- Update `Status/nate/focus-areas.md`
- Capture lessons in `psyche/self-knowledge/self-corrections.md` if any
- Close out workstream in `.active-plan`

## 9. Salvage from R1+R2

| Artifact | Salvage % | Effort to repurpose |
|---|---|---|
| R1 backend endpoints (commit `fcb282a`) | ~80% | Generalize filters; ~2h |
| R2 frontend (commit `abebfc0`) | ~70% | Rename, drop Reviewer copy, add browse/live-tail toggle, case-file drawer; ~3h |
| Pulse READ API pattern | 100% | 0h |
| Cost overlay logic | 100% | 0h |
| Persona-filter UI primitive | 90% (generalize) | ~1h |

Total salvage migration effort: ~6h. Net new code: case-file drawer, feedback connector UI + backend, lessons-learned wire, additional decision-emitter wiring.

## 10. Open questions (for David)

See: `Shared_Projects/Questions/AIFred-Pro/2026-05-07-reo-page-direction.md`

1. Decision-emitter inventory completeness
2. Lessons-learned book existence + integration shape
3. `/reviews` fate (stays distinct vs folds in)
4. Feedback verdict shape (3-state vs 2-state)
5. Lesson update flow (human-curated vs autonomic with gates)
6. Schema-template framing alignment

## 11. Out of scope

- Board v2 component-cards layer (parallel workstream; separate plan)
- Persona prompt system architecture changes beyond context injection
- Human-review queue rework (`/reviews` stays as-is)
- Backfilling decision_events for historical pre-P1.6 data
- Multi-tenant feedback (single-user assumption: Nate or David)

## 12. Success criteria

- All pipeline-v2 services emit decision_events for every gate/pathing decision they make
- /reo browse + live-tail + case-file drawer functional with real production data
- Feedback connector captures user verdicts; persists to pulse.decision_feedback
- Lessons-learned wire updates persona context at decision time (closed loop verified by at least one round-trip: feedback → lesson → improved-decision)
- /reviewer-dash retired; /decisions deferred (subset view kept for compatibility, not actively maintained)
- Debrief shipped; Nate confirms the page is the surface he reaches for when investigating "why did the pipeline make this choice?"

## 13. Risk register

| Risk | Mitigation |
|---|---|
| Lessons-learned book turns out to be incompatible with REO architecture | Investigation in Draft phase before commit; align with David before Harden |
| Decision-event volume overwhelms UI (>10K rows/day) | Pagination + indexes + saved-filter shortcuts; consider archiving in Harden |
| Feedback connector becomes spam vector if used carelessly | Rate-limit; require comment for "wrong" verdicts; soft-delete for revisions |
| `/decisions` (P1.B1) deprecation breaks downstream consumers | Audit dashboard for /decisions deep-links before retiring; keep route for 30d transition |
| Build phase reviewer.py wiring breaks the Live process | Wire is purely additive (log_decision is a fresh call, no state mutation); test against pulse_dev first |

---

**End of plan-of-record. Status: DRAFT. Updates expected after David's response to Question/ and after lessons-learned investigation completes.**
