# Two-Stage Validation Gating Pattern

**Version**: 1.0.0
**Created**: 2026-05-01
**Strictness**: **Recommended**
**Status**: Active
**Canonical reference**: `projects/project-aion/reports/token-compression-experimental-design.md` §10.4
**Related components**: AC-03 (Milestone Review), AC-06 (Self-Evolution), AC-08 (Maintenance)

---

## 1. Purpose

Validate any Jarvis development change that produces a **measurable behavioral effect** (output content, performance, register, cache behavior, error rate, latency) using two distinct validation windows with different goals and verdict semantics:

- **Stage 1 (short-term)**: Regression-catch only. Does the deploy break what was already working? If yes, roll back.
- **Stage 2 (long-term)**: Formal effect verification with edge-case coverage and rigorous metrics. Does the deploy actually deliver the intended improvement?

**Window durations scale with the scope and instrumentation of the dev work, NOT with calendar time.** Automation-testable deterministic changes can run Stage 1 in minutes and Stage 2 in hours. Workflow-bound human-in-loop interventions (e.g., creative output register, multi-day pipeline behavior) may warrant Stage 1 of days and Stage 2 of weeks. The structural separation is what matters; the clock is set by the data.

This pattern resolves the structural conflict between **methodological purity** (long collection windows protect against premature promotion) and **dev velocity** (long windows block orthogonal work that has no causal coupling to the intervention under test).

---

## 2. Core Principle

> **Stage 1 can HALT but cannot CLEAR for promotion. Stage 2 is the only promotion gate.**

This asymmetry is the load-bearing design choice. It prevents short-circuiting the formal verdict at 48h while still unlocking parallel work on independent token streams or codepaths.

A second principle: **Stage 1 evaluates only regression-catch axes. Stage 2 evaluates effect axes.** Stage 1's metrics MUST NOT include any axis named in the pre-registered effect prediction, because doing so would let Stage 1 hindsight-calibrate the formal verdict.

---

## 3. When to Apply

Apply this pattern when the change introduces:

| Signal | Examples | Apply? |
|---|---|---|
| Measurable output change | Directive change, prompt rewrite, model swap | **Yes** |
| Performance change | Caching, batching, algorithm swap, infra migration | **Yes** |
| Register / style change | Persona update, identity revision, communication rules | **Yes** |
| Stability change | Retry logic, circuit breakers, error-handling rewrite | **Yes** |
| New functionality with quantifiable success criteria | New skill, new agent, new compression mode | **Yes** |
| Refactor with no behavioral delta | Variable rename, file move, comment cleanup | No |
| Bug fix with regression test pinning the fix | Single-incident fix verified by added test | No (test is the gate) |
| Documentation, type annotations, formatting | Markdown edits, mypy hints, prettier passes | No |

**Heuristic**: if there is no measurable axis you would *track* to know whether the change worked, the pattern does not apply. The pattern requires a signal to gate on.

---

## 4. Stage 1 — Interim Safety Check

### Purpose
A non-promotion smoke test. Catch obviously broken deploys (regression on baseline metrics) within the chosen Stage-1 window so orthogonal-stream work can proceed without waiting for Stage 2.

### Window — scale to scope, not calendar
Stage-1 duration MUST be calibrated to **signal volume and effort class**, not a fixed clock. The cardinal rule: pick the shortest window that yields a statistically defensible regression-catch verdict.

| Effort class | Example interventions | Typical Stage-1 window | Driver |
|---|---|---|---|
| **Automation-testable, deterministic** | Pure-function refactor with property tests, schema-validated parser swap, deterministic prompt tweak | minutes-to-hours | Test suite execution time |
| **Service-level, high-traffic** | Caching strategy, retry policy, infra config | hours-to-1d | Request volume to fill sample minimum |
| **Per-session telemetry** | Token-compression directives, agent-routing changes | 24-48h | Sessions-per-day arrival rate |
| **Per-deploy / per-cycle** | JICM compression replays, end-of-session reflection changes | 48h-1w | Cycle frequency |
| **Workflow-bound, human-in-loop** | Persona / register changes, multi-day-driven creative outputs | 3-7d | Human task frequency |

**Heuristic**: if Stage 1 can be answered by automation in N minutes, do not extend the window beyond N×3 (multiplier covers flake variance). If Stage 1 requires human-driven workload to accumulate, multiply the typical-task-arrival-rate by the pre-registered sample minimum to get a floor.

### Axes (canonical examples)

| Axis class | What to measure | Threshold pattern |
|---|---|---|
| **Stability regression** | Error rate, crash count, exception type distribution | Within ±N% of pre-deploy baseline |
| **Performance regression** | p50 / p95 latency, throughput, resource consumption | Within ±Npp of pre-deploy baseline (token-weighted if relevant) |
| **Cache / efficiency regression** | Cache hit rate, memoization rate, request dedup | Within ±5pp of pre-deploy baseline |
| **Surface-level correctness** | Schema validation pass rate, type-check pass rate | ≥ pre-deploy rate |
| **Register / persona regression** | Banned-phrase frequency per N units of output | At or below the published rollback trigger |

### Verdict states

- `STAGE_1_CLEAR` — no breach. Orthogonal-stream work may proceed in parallel under Stage-1 clearance.
- `STAGE_1_HALT` — breach detected. Halt downstream work. Investigate. Downstream remains halted until either Stage 1 re-clears (after a fix or a directive revision and re-deploy) or Stage 2 closes with FAIL and the deploy is reverted.
- `STAGE_1_DEFERRED` — insufficient signal volume to evaluate (pre-registered minimum sample count not met). Extend Stage-1 window OR explicitly accept the orthogonal-stream risk and document the acceptance.

### Stage 1 is NOT a promotion gate
Phases or work items that are *directly gated* on the change under test (same token stream, same codepath, same effect axis) **MUST NOT** advance on Stage-1 clearance alone. They wait for Stage 2.

---

## 5. Stage 2 — Formal Sign-off

### Purpose
The full pre-registered evaluation. This IS the promotion gate.

### Window — scale to scope, not calendar
Stage-2 duration calibrates to the **minimum sample size required for the pre-registered statistical test**, ALWAYS at least N× the corresponding Stage-1 window (typical N: 5-10) so the long window genuinely covers edge-case discovery rather than retreading Stage-1 sampling.

| Effort class | Example interventions | Typical Stage-2 window | Driver |
|---|---|---|---|
| **Automation-testable, deterministic** | Same as Stage 1 above | hours-to-1d | Coverage of edge-case input space (fuzzing, property-test extension) |
| **Service-level, high-traffic** | Same | 1-7d | Diurnal cycle coverage; rare-input prevalence |
| **Per-session telemetry** | Same | 7-14d | Workload-class distribution stability |
| **Per-deploy / per-cycle** | Same | 1-4w | Multi-cycle behavior under varying upstream state |
| **Workflow-bound, human-in-loop** | Same | 2-6w | Style-shift detection across diverse tasks |

**Heuristic**: Stage 2 is where edge cases and rigorous metrics are pursued. If your test framework already exhaustively covers the input space (e.g., property tests + fuzzers + integration tests), Stage 2 can compress to the time it takes to run the full suite plus a soak buffer. If validation depends on observing varied human workloads, the pre-registered sample minimum dictates the window.

### Axes
The full set defined in the pre-registration:
- All effect predictions (the axes named in `expected_effect`).
- All sample-sufficiency checks (per class, per cohort).
- Stability + cache + register thresholds at the formal (Stage-2) values, which are typically stricter than Stage-1 values.

### Verdict states
- `STAGE_2_PASS` — all pre-registered predictions met within tolerance. **Promotion authorized.**
- `STAGE_2_PARTIAL` — some predictions met, some not. Document which. Decision: investigate, revise, or reject promotion. Pattern: do not promote on partial without an explicit revision-and-re-deploy cycle.
- `STAGE_2_FAIL` — predictions not met. Rollback recommended.
- `STAGE_2_REGRESSION_CATCH` — Stage-1-style regression detected at Stage 2 even though Stage 1 cleared. Treat as Stage-1 HALT escalated. Roll back.

---

## 6. Orthogonality and Stacking

Parallel work proceeding under Stage-1 clearance survives a Stage-2 FAIL **if and only if** the parallel work is on an **orthogonal stream** — i.e., it does not depend on the change under test for its causal mechanism.

### Orthogonality test

Ask three questions:

1. Does the parallel work touch the **same effect axis** as the change under test? (e.g., both modify `output_tokens` — NOT orthogonal.)
2. Does the parallel work depend on the change being merged for its own correctness? (e.g., Phase 5 dashboard depends on Phase 4 plumbing — NOT orthogonal.)
3. Would rolling back the change under test invalidate the parallel work's measurements? (e.g., second register directive shares baseline with first — NOT orthogonal.)

If any answer is yes, the streams are **coupled**. Coupled work must wait for Stage 2.

If all answers are no, the streams are **orthogonal**. Orthogonal work may proceed under Stage-1 clearance.

### Audit trail requirement

Document orthogonality in the parallel work's own pre-registration / plan: name the upstream change, cite its Stage-1 verdict, name the §10.4-equivalent rule, explain the independence rationale.

### Examples (from token-compression family)

| Parallel work | Stream | Orthogonal? | Survives upstream rollback? |
|---|---|---|---|
| Phase 2 CoD | thinking_tokens | Yes (Phase 1.x is output_tokens) | Yes |
| Phase 3 JICM compression | checkpoint files at session-start replay time | Yes | Yes |
| Phase 5 dashboard | frontend visualization | Yes (no token-stream interaction) | Yes |
| Second register directive on the same Archon | output_tokens, same axis | No | No — must roll back together |

---

## 7. Rollback Semantics

### Rollback triggers (in priority order)

1. `STAGE_1_HALT` not resolved within the Stage-1 window → revert deploy commit.
2. `STAGE_2_FAIL` or `STAGE_2_REGRESSION_CATCH` → revert deploy commit.
3. User correction count targeting the changed surface exceeds the pre-registered threshold (typical: > 3 in a session) → revise directive and re-deploy as a new intervention id.

### Rollback procedure

```bash
git -C <deploy_repo> revert <deploy_commit>
git -C <deploy_repo> commit -m "revert: <intervention_id> per two-stage-validation-gating §7"
```

If the rollback is immediate (within hours of deploy and before Stage-1 sample minimum), prefer:

```bash
git -C <deploy_repo> revert <deploy_commit>
git -C <deploy_repo> commit -m "revert: <intervention_id> immediate rollback (Stage-1 catastrophic)"
```

### What survives a rollback

- All orthogonal-stream work that proceeded under Stage-1 clearance (per §6).
- All work in upstream commits unaffected by the revert.
- Pattern lessons captured in `.claude/context/lessons/` — these are *records*, not artifacts of the reverted code.

---

## 8. Pre-registration Requirements

When applying this pattern, file a pre-registration document **before** the deploy lands. Required fields:

| Field | Purpose |
|---|---|
| `intervention_id` | Unique identifier for the change |
| `deploy_commit` | The git SHA being gated (placeholder until deploy) |
| `effect_predictions` | Named axes + expected direction + tolerance (Stage-2 axes only) |
| `stage_1_axes` | Named regression-catch axes + thresholds (must NOT overlap effect_predictions) |
| `stage_1_window` | Calendar duration AND/OR sample minimum |
| `stage_2_axes` | Named effect axes (mirror of effect_predictions) |
| `stage_2_window` | Calendar duration AND/OR sample minimum |
| `rollback_triggers` | Specific thresholds that automatically trigger revert |
| `orthogonality_notes` | Which streams are independent and why (see §6) |
| `gate_to_next_phase` | What downstream phase this change gates — and the wording must say "Stage-2 sign-off", not "Stage-1 clearance" |

The pre-registration must be filed **at zero post-deploy turns** (i.e., before any post-deploy data is observed). Post-hoc pre-registrations are permitted but must be flagged as such and lose the methodological purity guarantee for the current cycle.

---

## 9. Decision Flow

```
Change introduces measurable behavioral effect?
├── No → pattern does not apply; proceed normally
└── Yes
    ├── File pre-registration (§8) BEFORE deploy
    ├── Deploy
    ├── Stage 1 window opens
    │   ├── Sample minimum reached?
    │   │   ├── No → STAGE_1_DEFERRED (extend window OR accept risk)
    │   │   └── Yes → evaluate regression-catch axes
    │   ├── Within thresholds?
    │   │   ├── No → STAGE_1_HALT → investigate → revert OR fix-and-redeploy
    │   │   └── Yes → STAGE_1_CLEAR → orthogonal work may proceed
    │   └── (Stage 1 does NOT promote anything)
    ├── Stage 2 window opens (concurrent with Stage 1)
    │   ├── Sample minimum reached?
    │   │   ├── No → extend window
    │   │   └── Yes → evaluate effect axes
    │   ├── All predictions met?
    │   │   ├── Yes → STAGE_2_PASS → promote
    │   │   ├── Some → STAGE_2_PARTIAL → revise OR reject
    │   │   └── No → STAGE_2_FAIL → revert → orthogonal work survives if §6 satisfied
    │   └── Regression-catch breach at Stage 2?
    │       └── Yes → STAGE_2_REGRESSION_CATCH → revert
```

---

## 10. Relationship to Other Components

### AC-03 Milestone Review
Milestone review is a **point-in-time** quality gate run by reviewer agents (`code-review` + `project-manager`) at PR / phase boundaries. Two-stage validation gating is a **windowed** quality gate run by data collection over hours-to-weeks. They compose:

- AC-03 evaluates the deploy artifact (code quality, deliverable completeness) at the moment of merge.
- Two-stage gating evaluates the deploy *behavior* (regression catch, then effect verification) over the post-deploy windows.
- Both must clear before promotion to next phase or stage.

For changes with measurable behavioral effect, the milestone review pattern's "Did the work meet the requirement?" question is answered by Stage 2's verdict, not by inspection alone.

### AC-06 Self-Evolution
AC-06 implements queued self-improvements. Per the AC-06 risk-gating table (low=auto, medium=notify, high=approval), any medium- or high-risk improvement that introduces measurable behavioral effect SHOULD apply two-stage validation gating. Low-risk improvements (e.g., cosmetic, internal-only) are exempt under §3.

### AC-08 Maintenance
Health checks and freshness audits run by AC-08 are themselves the regression-catch surface for many Stage-1 windows (e.g., MCP responsiveness checks catch performance regressions in deployed MCPs).

### Self-improvement / R&D loops
Pattern `self-improvement-pattern.md` and the AC-07 R&D cycle should reference two-stage gating when the proposed improvement has measurable behavioral effect. The R&D cycle's "evaluate alternatives" step is approximately Stage 2 framed as a comparison rather than a single-arm verdict.

---

## 11. Operational Templates

### Pre-registration skeleton (YAML)

```yaml
intervention_id: <unique-id>
deploy_commit: <git-sha>
deploy_date: <ISO-8601>
effect_predictions:
  - axis: <name>
    direction: <up|down|neutral>
    magnitude: <expected change>
    tolerance: <bounds>
stage_1:
  effort_class: <automation-testable|service-level|per-session|per-deploy|human-in-loop>
  window: <ISO-8601 duration; e.g., PT2H or P2D — sized to effort class>
  sample_minimum: <int>
  axes:
    - name: <name>
      threshold: <bounds>
      action_on_breach: <halt|revert|investigate>
stage_2:
  window: <ISO-8601 duration; ALWAYS ≥ 5× stage_1.window>
  sample_minimum: <int>
  axes: [mirror of effect_predictions]
rollback_triggers:
  - condition: <description>
    threshold: <value>
orthogonality_notes:
  - parallel_work: <name>
    stream: <axis or codepath>
    independence_rationale: <why orthogonal>
gate_to_next_phase: |
  <Phase X> is gated on Stage-2 sign-off of <intervention_id>.
  Stage-1 clearance unblocks orthogonal-stream work only.
```

### Verdict log line (markdown)

```markdown
**[Stage N verdict]** intervention=<id> commit=<sha> verdict=<STAGE_N_*> sample_size=<n>
Notes: <one-line summary; link to detailed report>
```

---

## 12. Anti-patterns

| Anti-pattern | Why it breaks the gate |
|---|---|
| Stage 1 includes effect axes | Lets Stage 1 hindsight-calibrate Stage 2; pre-registration is compromised |
| Promote on Stage 1 clearance | Bypasses the formal verdict; loses long-window edge-case coverage |
| Skip pre-registration ("we'll write it after we see the data") | Eliminates the methodological purity benefit; verdict becomes hindsight |
| Treat Stage-1 DEFERRED as Stage-1 CLEAR | Hides insufficient-sample risk; orthogonal work proceeds without justification |
| Apply pattern to every change including no-behavior refactors | Ceremony without signal; trains the team to ignore the gate |
| Roll back orthogonal-stream work along with the failed change | Loses valid independent work; pattern's velocity benefit is destroyed |

---

## 13. Canonical Example

The token-compression family (Phase 1.1 / 1.2 / 1.3 / 1.5) is the first application of this pattern. See:

- `projects/project-aion/reports/token-compression-experimental-design.md` §4.7 (stacking rules), §10.4 (two-stage gate), §11 (rollback triggers)
- `.claude/metrics/token-compression/pre-registration-phase-1-*.yaml` (per-phase pre-registrations)
- `.claude/context/.active-plan` (Phase status with Stage-1 / Stage-2 dates)

---

*Two-Stage Validation Gating Pattern v1.0.0 — Generalized from token-compression §10.4 per User directive 2026-05-01.*
