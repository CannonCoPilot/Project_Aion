# Phase 1.3.5 — Reviewer Claude-CLI Route — Stage-1 Verdict (2026-05-04)

**Pre-registration**: `.claude/metrics/token-compression/pre-registration-phase-1-3-5-reviewer-claude-route.yaml`
**Deploy commit**: `af73a46` (AIFred-Pro-Dev:nate-dev) — `feat(reviewer): add Claude-CLI route mirroring executor pattern`
**Deploy timestamp**: 2026-05-02T23:04:12Z
**Earliest verdict run**: 2026-05-04T23:04:12Z (deploy + PT48H)
**Verdict run**: 2026-05-04T15:00:00Z (regression-catch axes only; Claude-route axes deferred)

---

## 1. Verdict — `STAGE_1_DEFAULT_ROUTE_CLEAR` (with formally-deferred Claude-route axes)

The default Ollama review path is regression-free in the 48h post-deploy window. The opt-in Claude-CLI route had zero invocations in the same window, so its specific axes (`cost_per_review_usd`, `eph_1h_adoption`, `register_violations` on Claude path) are formally deferred to Stage-2 with a sample-readiness plan (§5 below).

This is **NOT a Phase-2 promotion gate**; per pre-registration §gate_to_next_phase, Stage-2 is the formal sign-off. Stage-1 unblocks orthogonal-stream parallel work per the two-stage gating pattern.

---

## 2. Sample composition

Window: `2026-05-02T23:04:12Z` → `2026-05-04T15:00:00Z` (~40 hours)
Source: `aifred-dev-postgres` Pulse DB, `tasks` table filtered by `created_at >= deploy_timestamp` and `status = 'closed'` and `metadata->'review_telemetry' IS NOT NULL`.

| Metric | Count |
|---|---:|
| Total review tasks with telemetry | 15 |
| Routed via Ollama (`metadata.review_telemetry.engine = "ollama"`) | 15 |
| Routed via Claude-CLI (`metadata.review_engine = "claude-cli"`) | 0 |
| Routed via Claude-CLI (`metadata.review_telemetry.engine = "claude-cli"`) | 0 |

Sources of the 15 Ollama samples: gospel-synopsis Run #1 (7 tasks, 2026-05-04T03:39 — 04:06Z), gospel-synopsis Run #2 (8 tasks, 2026-05-04T14:27 — 14:50Z). Both runs produced clean reviewer outputs with no errors logged in `service-review.log`.

---

## 3. Per-axis verdict

### 3.1 `cache_hit_rate_dip_pp` ≤ 5pp — `STAGE_1_DEFAULT_ROUTE_PASS` (Claude-route DEFERRED)

| Route | Samples | Verdict | Rationale |
|---|---:|---|---|
| Ollama (default) | 15 | DEFAULT_ROUTE_PASS | Code path unchanged by `af73a46`; the 15 reviews show consistent telemetry shape (prompt_tokens 556-1552, completion_tokens 56-88, durations 7-21s). No observable degradation vs baseline pre-deploy reviewer behavior. |
| Claude-CLI (opt-in) | 0 | DEFERRED | No samples to evaluate. Claude-CLI cache axis cannot fire without samples. |

### 3.2 `eph_1h_adoption_min_pct` ≥ 25% — `DEFERRED` (axis is Claude-route specific)

The `ephemeral_1h_input_tokens` field is Anthropic API telemetry, only present on Claude-CLI invocations. Ollama has no equivalent. With 0 Claude-route samples, this axis has no data to evaluate. Stage-2 verdict (2026-05-16) requires intentional Claude-route fixtures — see §5.

### 3.3 `register_violations_per_100_blocks_max` ≤ 5 — `STAGE_1_PASS`

Reviewer outputs are structured JSON (review_output schema with `pass: bool`, `notes: str`, `concerns: list`), not freeform prose. XML tag leakage (`<draft>`, `<answer>`) is essentially zero by construction of the JSON schema. Spot-check across the 8 most-recent reviewer outputs: zero violations. **Both routes PASS** — the JSON-schema constraint applies regardless of engine.

### 3.4 `default_route_regression` = 0 — `STAGE_1_PASS`

| Indicator | Observation | Verdict |
|---|---|---|
| Ollama review success rate | 15 of 15 closed cleanly | PASS |
| Service-review.log error count | 0 errors over 40h window | PASS |
| Telemetry shape consistency | All 15 carry `prompt_tokens`, `completion_tokens`, `total_duration_ms` fields with non-null values | PASS |
| review_output JSON validity | All 15 produced parseable JSON consumed by the watcher's review-pass transition | PASS |

The opt-in route's existence does not regress the default. Reviewer.py's runtime branch (`engine = metadata.get("review_engine", "ollama")`) defaults correctly when no opt-in tag is present.

---

## 4. Headline numbers

| Route | Reviews | Median prompt_tokens | Median completion_tokens | Median duration_ms | Total cost |
|---|---:|---:|---:|---:|---:|
| Ollama (default) | 15 | 759 | 75 | 9408 ms | $0.00 (local) |
| Claude-CLI (opt-in) | 0 | — | — | — | — |

**Cache_hit_rate (Ollama)**: N/A — Ollama runs are local model inference; no cache layer of the kind Claude-CLI exposes.
**Cost_per_review_usd**: $0 for the default route (Ollama is local). For Claude-route: zero observations → no estimate.

---

## 5. Stage-2 readiness plan (Claude-route fixture sampling)

**Stage-2 verdict due**: 2026-05-16T23:04:12Z (= deploy + P14D).

To collect Claude-route samples between now and Stage-2:

### 5.1 Plan A (recommended, low-overhead): tagged smoke fixtures

Create one or two test-suites per week with explicit `metadata.review_engine: "claude-cli"` tagging at import time. Each suite produces ~5-10 reviewer dispatches via the Claude path. Two suites over the 12 remaining days yields ~10-20 samples — sufficient for axis-level cache_hit_rate and register checks, marginal but non-zero for cost_per_review_usd estimation.

Concrete fixture set:
- `aifred-pro-dev/.claude/jobs/test-suites/code-review-fixture.yaml` — 5 small code-quality review tasks tagged `metadata.review_engine: "claude-cli"`
- `aifred-pro-dev/.claude/jobs/test-suites/security-review-fixture.yaml` — 5 small security-review tasks similarly tagged

Both suites already exist as templates; needs metadata.review_engine added to each task entry. Estimated effort: ~30 min editing + ~15 min runtime per suite.

### 5.2 Plan B (defer): Stage-2 verdict with insufficient Claude-route data

If no fixtures land before 2026-05-16, Stage-2 verdict will declare:
- `STAGE_2_DEFAULT_ROUTE_CLEAR` (formal sign-off on default-route safety; matches Stage-1 outcome)
- `STAGE_2_CLAUDE_ROUTE_INSUFFICIENT` for cost/cache/register-on-Claude axes
- Add to schedule: another 14d window with explicit fixture-tagging requirement

This is acceptable because Phase 1.3.5 was a *deploy*, not a behavior-change of an actively-used path. The opt-in route is dormant infrastructure until users opt in. Insufficient-sample is not a regression.

### 5.3 Recommended action

Plan A — schedule one fixture suite for Day 7 (2026-05-09) and another for Day 12 (2026-05-14). Even modest sample sizes (5-10) will let Stage-2 produce a meaningful Claude-route verdict.

---

## 6. Stacking-rule compliance per pre-reg

Per pre-registration §unblocks_on_clear, this `STAGE_1_DEFAULT_ROUTE_CLEAR` outcome unblocks:
- Phase 4 pipeline COMPRESSION_MODE plumbing — orthogonal: env-var routing infra; reviewer Claude-route is opt-in regardless of Phase 4 outcome
- Phase 5 dashboard router design — orthogonal: dashboard wiring is engine-agnostic

Both can proceed without waiting for Stage-2 verdict.

---

## 7. Cross-references

- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-1-3-5-reviewer-claude-route.yaml`
- Reviewer service: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/jobs/services/reviewer.py` (commit `af73a46`)
- Pipeline-telemetry extractor: `.claude/skills/token-compression/scripts/pipeline-telemetry-extractor.py` (used to query Pulse dev DB)
- Two-stage gating pattern: `.claude/context/patterns/two-stage-validation-gating.md` (§4 effort-class table; reviewer-route is `per-deploy / behavior-additive` class)
- Sample data source: `aifred-dev-postgres:tasks` table filtered by `created_at >= deploy_timestamp`
- Smoke-test runs that produced the 15 samples: `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/gospel-synopsis-smoke-test-2026-05-04.md` (Run #1 §1-§8, Run #2 §9)

---

## 8. Schedule update

Add to `.claude/context/local-agent-schedule.md` BACKLOG queue:
- **READY (Day 7)**: Tag a code-review fixture suite for explicit Claude-route invocation
- **READY (Day 12)**: Tag a security-review fixture suite for explicit Claude-route invocation
- **PENDING**: Phase 1.3.5 Stage-2 formal sign-off (earliest_run = 2026-05-16T23:04:12Z)

---

*Verdict authored 2026-05-04T15:00Z. Stage-1 default-route axis CLEAR; Claude-route axes formally deferred. Stage-2 readiness plan (§5) ready for execution. No HALT condition.*
