---
title: Reviewer Dashboard — Foundational Re-Examination
date: 2026-05-07
session: post-JICM-resume
status: ANALYSIS — SUPERSEDED by REO reframe (Sir, 2026-05-07)
supersedes: projects/project-aion/plans/aifred-pro-dev-reviewer-dash.md (factual errors corrected here)
superseded_by: (forthcoming) projects/project-aion/plans/aifred-pro-dev-reo-page.md
preserve_intact: true
audience: Sir, David, future-Jarvis
purpose: |
  Foundational re-examination of "what should the Reviewer Dashboard be?"
  Answers the seven basic questions (What is it? What does it do? Why? Where in
  framework? Why own dashboard? Why not Executor/Orchestrator? David's vision /
  Sir's vision / possible vision?) with critical pushback. Surfaces two factual
  corrections to the prior plan-of-record. Result: Reviewer-Dash framing was
  wrong; should be generalized to a persona-decision-stream pattern. Per Sir's
  2026-05-07 reframe, this is now superseded by REO (Reviews, Executions,
  Orchestrations) — a filing system for pipeline decision-making, distinct from
  the planned Board v2 component-cards ops layer.
---

# The Reviewer — Foundational Re-Examination

The Explore findings change the answer materially. I had two factual errors in the prior turn that the deep survey corrected, and the strategic picture is more coherent than I'd framed it.

## Two ground-truth corrections

1. **Reviewer service does NOT emit `decision_events`.** It emits `log_activity` entries only — diagnose.py is what calls `log_decision(actor="system:diagnose", decision_type="diagnose_outcome", ...)`. My prior scratchpad note ("Reviewer emits actor='reviewer' decision_events") was wrong. The "0 rows for actor='persona:reviewer'" wasn't a string-match error on my part — it was correct because reviewer.py never wrote that row in the first place. The actual missing wire is `reviewer.py` → `log_decision()`.

2. **The four "reviewer personas" are four entirely different things, not four flavors of the same review concept.** The plan-of-record I wrote conflated them:
   - `ai-reviewer/` is actually `persona: ai-david` — David's autonomous-approval proxy for `waiting:david` tasks
   - `pipeline-reviewer/` is a meta-reviewer of the **watchdog's** label-fixing actions (not task execution)
   - `security-reviewer/` is a Semgrep+manual security auditor
   - `test-reviewer/` is a quality-checklist verifier

   They share the suffix "-reviewer" but no schema, no data model, no domain. Treating them as a class is a category error.

---

## 1. What *is* the Reviewer?

The name is overloaded across three functionally unrelated surfaces:

| # | Surface | What it actually is | Where |
|---|---|---|---|
| 1 | **Reviewer Service** | Pipeline-v2 LLM verifier — PASS/FAIL gate after Executor finishes | `.claude/jobs/services/reviewer.py` |
| 2 | **"Reviewer" Personas** | Four unrelated Nexus headless agents that share a suffix | `.claude/jobs/personas/{ai,pipeline,security,test}-reviewer/` |
| 3 | **Human Review Queue** | Where you and David approve/reject AI proposals | `dashboard/.../routes/reviews.ts` + `pages/ReviewPage.tsx` (1842 LOC) |

When David's debriefs say "Reviewer," he means **#1**. When the existing dashboard nav says "Reviews," it means **#3**. **#2** is naming-coincidence noise.

## 2. What does it (the service) do?

Reviewer.py runs after a task's executor finishes. It:
1. Pulls the task from Pulse, reads `expected_output`, `stage_output`, `files_modified`
2. Walks the filesystem to verify claimed file changes actually exist (`_verify_filesystem`)
3. Asks an LLM — Ollama `qwen3:32b` by default, Claude-CLI if `metadata.review_engine="claude-cli"` — "did this task succeed?"
4. Parses `{passed, confidence, issues, summary}` from the response
5. **Pass**: archives task, sets `completed:done`, `status:closed`
6. **Fail**: increments retry_count; if ≥3 → `blocked:max-retries`; else launches `diagnose.py` subprocess which redesigns the task and resets it to `staging:wait`

**Critical observation**: it currently writes its decision *only* to `audit_log` via `log_activity()`. The `decision_events` table — which has fields like `confidence`, `outcome`, `details JSONB` purpose-built for exactly this kind of structured-decision capture — sees nothing from the reviewer service. That's a missing wire, not a missing service.

## 3. Why *is* the Reviewer?

It closes the autonomous-execution loop. Without it, the pipeline is:
```
intake → evaluate → execute → done(?)
```
The `(?)` is the gap reviewer fills. Executor's "I succeeded" claim is a self-report — and LLMs hallucinate success constantly. Reviewer is the second LLM looking at the artifact saying "actually, did you?" That's the difference between an autonomous pipeline that ships bugs at 4am and one that catches them.

**The structural symmetry of pipeline-v2's gating model**:
- `evaluate.py` is the **pre-execution gate** — safety, feasibility, decomposition
- `reviewer.py` is the **post-execution gate** — verification, confidence, issue capture

Both wrap LLM calls around structured task state. Both can route to retry. Both currently under-instrument their decisions (`evaluate.py` also doesn't emit `decision_events` cleanly). The "why does Reviewer get a dashboard" question has a structural counterpart: "why doesn't Evaluator?" That symmetry suggests the right answer is *neither does, in isolation* — they both feed a **persona decision-stream** view.

## 4. Where does it sit in Pulse–Nexus–Alfred-Dev?

It is firmly a **Nexus** service that talks to **Pulse** as the state-of-record:

```
              Pulse (state)
                ▲    ▲
        reads/  │    │ writes (audit_log, decision_events
        claims  │    │         once wired, cost_events)
                │    │
   Nexus pipeline-v2 services
   ───────────────────────────
   stage → evaluate → orchestrate → execute → REVIEWER → diagnose (loop) → done
```

Per the 2026-05-05 boundary audit, this is a clean Nexus citizen: the dashboard's job is to consume Pulse READ APIs, not to read Nexus state directly. Which means **the Reviewer Dashboard's data source is `pulse.decision_events` + `pulse.audit_log` + `pulse.cost_events`**, not `services/reviewer.py` directly.

## 5. Why does Reviewer need its own dashboard view? (the load-bearing question)

**Honest answer: it probably *doesn't*, in the form I shipped.**

**Arguments against a standalone Reviewer page:**
- Executor doesn't have one. Orchestrator doesn't. Evaluator doesn't. Why is Reviewer special?
- `DecisionsPage` (P1.B1, commit `042247b`) already shows `decision_events` with actor/decision_type breakdown + storyline drawer. That *is* the pattern.
- `ReviewPage` already covers the human-review queue (the user-facing surface most people would assume "Reviews" means).
- What I built at `/reviewer-dash` is filterable-by-persona; the persona filter populates *dynamically* — there is nothing structurally Reviewer-specific in the UI.
- Reviewer doesn't currently emit `decision_events` at all. Until we wire that, the page would render empty for the actor it's named after — which would be misleading UX.

**Arguments for:**
- Reviewer is the highest-stakes decision in the pipeline (does this artifact ship?). Highest-stakes warrants deepest instrumentation.
- Reviewer has unique signals other personas don't: confidence levels, engine choice (Ollama vs Claude-CLI), retry chains.
- Pass/fail rate over time is a system-health KPI (degrading reviewer = degrading pipeline trust).

**Judgment**: the "for" arguments are real but they argue for **specialized telemetry panels**, not a standalone page. A 600-LOC standalone page to display `pass/fail rate + confidence histogram + engine A/B` is over-investment. Those are 3-4 KPI cards on the Observability page, plus a persona filter on DecisionsPage.

## 6. Why not Executor or Orchestrator?

The honest answer has three parts:

1. **They should have observability too**. The reason they don't isn't architectural correctness — it's that `executor.py` only just got 30 observability sites this past Tuesday (P1.6 commit `5720cdc`), `orchestrate.py` doesn't emit `decision_events` at all, `evaluate.py` doesn't either. We're at the front of building this layer; Reviewer-first isn't because Reviewer is special, it's because David asked for it first.

2. **Reviewer has the cleanest data shape**. `passed: true|false + confidence: high|med|low + issues: [...]` is structurally simpler than executor's heterogeneous "did this bash invocation produce the expected effect?" That cleanness makes it the best candidate to **prove out the pattern**. Per David's debrief: *"schema template for §7.1 #4 Cortex↔AC-05/06 interop"*.

3. **Reviewer's failure mode is the worst**. False PASS is the most insidious failure in any autonomous pipeline — it ships bad work confidently. False FAIL just costs a retry; false PASS contaminates downstream. So observability on Reviewer pays back asymmetrically more than on Executor.

**Category error in my prior framing**: I treated "Reviewer's own dashboard" as a *product question* (what does the page show?) when it's actually an *infrastructure question* (we need observable decision-streams for every pipeline service, and Reviewer is the test case). Once you reframe it that way, the page isn't "Reviewer Dashboard" — it's "Persona Decision Stream Pattern, Reviewer Instance v1."

This is exactly what David said in his 2026-05-06 debrief: *"the vertical-timeline-with-drawer pattern proves out the UX for displaying any persona's decision-stream — when the Cortex (Jarvis-side AC-05/06 reflection consumer) needs to show its own decision timeline, it inherits this pattern."*

I missed the load-bearing word "*pattern*" in his writing. He's not building a Reviewer page; he's building a template, with Reviewer as the first instance.

## 7. The four candidate visions, with critique

| # | Vision | Subject | Cost | Why it works | Why it might not |
|---|---|---|---|---|---|
| **A** | **Pipeline Quality Gate Dashboard** (Reviewer-specific ops) | reviewer.py only | 2-3d | Highest-stakes gate; deepest instrumentation; pass/fail trends + engine A/B + confidence histograms | Asymmetric vs Executor/Evaluator; argues for separate page per pipeline service; doesn't scale |
| **B** | **Persona Decision Stream** (David's actual vision) | All personas with decision_events | 1-2d (refactor what's shipped) | Matches David's "schema template" framing; reusable pattern; reviewer is *first instance*, not the subject | "Reviewer" badge becomes legacy naming after rename; basically extends DecisionsPage |
| **C** | **Reviewer Operations Center** (everything review-related) | Service + 4 personas + human queue | 3-4d new + 1-2d Pulse aggregations | Single "is the review system healthy?" answer | Conflates four unrelated things (the category error); David hasn't asked for this; massive scope |
| **D** | **Embed everywhere, no standalone page** | Reviewer KPIs in Observability; timeline in DecisionsPage; per-task in TaskDetail | <1d | Lowest page-count tax; respects existing surfaces | Loses focused learning surface; harder to demo as "the Reviewer view" |

**Pushback on each:**

- **A** is what I'd build if Sir said "I want Reviewer ops." But it's *not* what David asked for in his debrief, and the scope grows fast (engine A/B requires Pulse aggregations that don't exist; confidence histograms require time-bucketed queries). Skeptical.
- **B** matches David's words exactly. Risk: it's basically "rename `/reviewer-dash` → `/decision-streams` and extend DecisionsPage with persona filtering." That's an honest 1-day refactor that makes the prior 2 commits not-wasted but also not-new-deliverable. Worth doing if true; not worth shipping under a misleading name.
- **C** is what I'd build if I were David and angry that no one was thinking holistically. But David didn't write this; I extrapolated it. Highest risk of building the wrong thing.
- **D** is the *engineering* answer (smallest delta to existing UX) but not the *learning* answer (no place to compare engines, see issue taxonomy). Also fails to satisfy David's "pattern" intent.

---

# Coherent plan (pre-REO-reframe)

The synthesis that survived the pushback at time of writing:

### Phase 0 — Validate framing with David (1d wall, 30min effort)
Draft `Shared_Projects/Questions/AIFred-Pro/2026-05-07-reviewer-dash-product-direction.md` with:
- The four visions above, neutrally presented
- The factual corrections (reviewer doesn't emit decision_events; the four "personas" aren't four reviewers)
- A direct question: "When you wrote 'schema template for §7.1 #4 Cortex↔AC-05/06 interop,' did you mean Vision B (generalize the page across all personas, Reviewer first) or Vision A (Reviewer is special and gets a deep ops page)?"

### Phase 1 — Wire `reviewer.py` to emit `decision_events` (3-4h)
This is **infrastructure that's needed regardless of which vision wins**. Add `log_decision()` calls in reviewer.py at the PASS/FAIL branch points: `actor="persona:reviewer"`, `decision_type="review_outcome"`, `outcome="passed"|"failed"`, `confidence`, `details={engine, model, issues, retry_count}`. Once this lands, reviewer rows populate the existing DecisionsPage automatically. **This makes the "0 rows" problem disappear** without any UI change.

### Phase 2A — If David picks Vision B: rename + generalize (4-6h)
- Rename `/reviewer-dash` → `/decision-streams` (or merge into DecisionsPage as a "Stream" tab)
- Remove all "Reviewer"-specific copy from the page (it's already structurally generic)
- Add persona-multiselect, decision-type filter, time-window controls
- Document the pattern in `dashboard/docs/persona-decision-stream-pattern.md` for Cortex/AC-05/06 to inherit

### Phase 2B — If David picks Vision A: build ops panels (2-3d)
- Add 4 KPI cards to Observability page (pass-rate-7d, confidence-distribution, engine-cost-A/B, diagnose-trigger-rate)
- Keep `/reviewer-dash` but pivot from timeline to ops dashboard
- Need 2 new Pulse READ aggregations (`/observability/reviewer-stats`, `/observability/engine-comparison`)

### Phase 2C — If David picks C: full ops center (5-6d, treat as separate workstream)
- Defer; this is its own multi-week project

### What gets discarded
- Watchdog stack (W1-W3) is unaffected — separate workstream, no naming collision.
- R3 (drawer) and R4 (live/frozen) of the original plan are absorbed into either 2A or 2B; they were always generic features.

---

## Deepest insight from this exercise

**The question "what should this page do?" was the wrong frame.** The right frame is "what infrastructure does the review system need, and which UI surfaces fall out of that?" Once you wire `reviewer.py → decision_events`, the *minimum-viable answer* becomes "DecisionsPage already does it, just filter for `actor='persona:reviewer'`." Anything beyond that is making a *deliberate UX bet* that Reviewer warrants more than DecisionsPage gives — and that bet should be conscious, not inherited from a plan-of-record that was written before we understood the data flow.

This is also a meta-lesson about plans-of-record: writing one before doing the deep investigation can lock in misconceptions. My `aifred-pro-dev-reviewer-dash.md` codified two factual errors (reviewer emits decision_events; "personas" share a schema) that then propagated through R1+R2 implementation and the prior compressor's checkpoint. The investigation should have come first.

---

## Recommendation (pre-REO reframe)

**Action sequence**, in order of confidence:

1. **Phase 0 now** — draft Question/ to David. Lowest cost; resolves the strategic ambiguity that's blocking everything else. ~30min.
2. **Phase 1 in parallel** — wire `reviewer.py` to emit `decision_events`. Pure infrastructure win regardless of vision; ~3-4h. Justifiable to ship before David replies.
3. **Phase 2 after David's reply** — execute whichever vision he picks (most likely B given his own writing).

What I'd ask Sir to confirm:
- (i) Do you want me to draft the Question/ now, or defer until you've reflected further?
- (ii) Is the Phase 1 reviewer.py wiring acceptable to ship pre-emptively (it's a non-controversial infrastructure win), or hold until vision is decided?
- (iii) Of the four visions, do *you* (Sir, distinct from David) lean toward one? Your prompt asked "what does Sir envision" — and I notice I haven't given you space to answer that yet, which itself was a flaw in my prior framing.

---

**End of report (preserved intact 2026-05-07 per Sir). Subsequent REO reframe builds on this analysis but supersedes the Vision A/B/C/D framing entirely — the page is now conceived as REO (Reviews, Executions, Orchestrations), a filing system for ALL pipeline decision-making, parallel to a planned Board v2 component-cards ops layer.**
