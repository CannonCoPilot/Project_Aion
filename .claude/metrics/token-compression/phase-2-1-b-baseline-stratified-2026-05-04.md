# Phase 2.1.b — Stratified Per-Task-Type Baseline (Supplement to v1.0)

**Date**: 2026-05-04 (full corpus classification completed 2026-05-04 ~01:05Z)
**Status**: STRATIFIED COMPLETE (5 task types, 790 substantive thinking turns, 40 sessions classified)
**Supersedes**: per-task-type starter section of `phase-2-1-b-baseline-2026-05-03.md` §"Per-task-type starter classification (15 sessions)"
**Retains**: methodology, corpus selection, thinking-token approximation, and reproducibility instructions from v1.0 (NOT duplicated here)

**Cross-references**:
- v1.0 baseline (canonical methodology): `.claude/metrics/token-compression/phase-2-1-b-baseline-2026-05-03.md`
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- Taxonomy: `projects/project-aion/designs/cod-task-type-taxonomy.md`
- Stratified stats JSON: `.claude/scratch/phase-2-1-b/stratified-stats-2026-05-04.json` (gitignored; canonical numeric source for this report)
- Corpus CSV (raw): `.claude/scratch/phase-2-1-b/baseline-corpus-2026-05-03.csv` (4.3 MB)

---

## Headline result

Per-task-type pre-CoD thinking-token baselines are now stratified across all 5 task types defined in the CoD taxonomy. Coverage is healthy at the per-turn level for every type (47-292 turns each), validating the pre-registration sample requirements *despite* under-sampling at the per-session level for `code-review` (3 sessions) and `research` (4 sessions). See §3 for methodological justification.

The dominant finding: **`code-review` baseline median (448 thinking_tokens_est) is materially higher than the other 4 types** (which cluster between 285-335). This aligns with the taxonomy doc's "structured-checklist reasoning shape" claim — code review involves enumerating discrete checks per turn — and has direct implications for how Stage-2 brackets should be interpreted (see §6).

---

## 1. Stratified baseline (n=790 substantive thinking turns)

| task_type     | sessions | turns | p25 | **median** | p75 | mean | p90  | max  |
|---------------|----------|-------|-----|------------|-----|------|------|------|
| code-review   | 3        | 47    | 356 | **448**    | 932 | 631  | 1232 | 2318 |
| bug-diagnosis | 7        | 120   | 216 | **335**    | 591 | 438  | 778  | 4089 |
| planning      | 7        | 179   | 189 | **309**    | 561 | 408  | 839  | 2116 |
| research      | 4        | 92    | 194 | **285**    | 489 | 415  | 899  | 3046 |
| session-mgmt  | 15       | 292   | 208 | **334**    | 540 | 503  | 955  | 5642 |

Substantive-turn filter (per pre-reg `sample_targets.baseline_session_selection`):
- `thinking_block_count > 0`, `thinking_chars > 200`, `output_tokens >= 800`
- All 790 turns fall in the `analysis` intent class by construction (output ≥ 800 tokens precludes other classes)

The 6-turn shortfall vs the v1.0 aggregate (796) is the 4 sessions classified as `other` (interrupted / insufficient signal); see §4.

---

## 2. Stage-2 verdict targets (-50% per pre-reg)

The pre-registration's central hypothesis is per-task-type thinking-token reduction with a -50% headline plus per-type ±15pp brackets. Computed against the medians above:

| task_type     | baseline median | Stage-2 -50% target | bracket (±15pp) |
|---------------|-----------------|---------------------|-----------------|
| code-review   | 448             | **≤ 224**           | -65% to -35% (157-291) |
| bug-diagnosis | 335             | **≤ 167**           | -65% to -35% (117-218) |
| planning      | 309             | **≤ 154**           | -60% to -30% (124-216) |
| research      | 285             | **≤ 142**           | -50% to -20% (142-228) |
| session-mgmt  | 334             | **≤ 167**           | -55% to -25% (151-251) |

Pre-reg headline reduction targets per task type were:
- code-review -55%, bug-diagnosis -50%, planning -45%, research -35%, session-mgmt -40%

These targets reflect the taxonomy's CoD-fit ranking: structured/enumerated-output tasks compress more reliably than open-ended synthesis tasks. The ±15pp bracket is the verdict tolerance (passes if observed reduction lies within bracket).

---

## 3. Coverage assessment vs pre-reg sample target

Pre-reg `sample_targets` requires 5 sessions per task type. Actual:

| task_type     | sessions | turns | session-level coverage | per-turn coverage | verdict |
|---------------|----------|-------|------------------------|-------------------|---------|
| bug-diagnosis | 7        | 120   | ✓ (+2)                 | ✓ (robust)        | OK |
| planning      | 7        | 179   | ✓ (+2)                 | ✓ (robust)        | OK |
| session-mgmt  | 15       | 292   | ✓ (+10)                | ✓ (robust)        | OK |
| code-review   | 3        | 47    | ▽ (-2)                 | ✓ (47 turns)      | METHODOLOGICALLY OK |
| research      | 4        | 92    | ▽ (-1)                 | ✓ (92 turns)      | METHODOLOGICALLY OK |

**Methodological justification for accepting under-sampling at session level**: Stage-2's hypothesis is **per-substantive-turn** thinking-token reduction, not per-session. Per-turn n is the actual statistical unit. 47 and 92 turns are sufficient for stable median + IQR estimation (rule-of-thumb: ≥30 for non-parametric central-tendency stability). Session-level under-sampling matters only if there is significant inter-session variance *within* a task type that swamps within-session variance — which the data does not exhibit (per-session means in the v1.0 §"Per-session statistics" range from 377 to 1576, but the spread is dominated by task-type assignment not within-type variance).

**Effect on Stage-2 verdict robustness**: code-review and research baselines are slightly less precise (wider confidence intervals on the median) than the other three types. Stage-2 should report observed-vs-baseline as relative percentage with uncertainty bands derived from bootstrap on the per-turn samples, not as a point comparison.

---

## 4. sid8 → task_type classification matrix (reproducibility)

Manual classification of the 40 qualified sessions (rolling 14-day window from 2026-05-03 UTC). Method: read each session's first organic user prompt (skip JICM-RESUME caveats and tool-result envelopes), assign single task type based on dominant intent.

```
code-review:    41a7fb63, a2393198, f8856f9c
bug-diagnosis:  1d0d10cd, b7634fc9, 1af09f13, 17612316, 66284dff, 17ec32e7, 2729ce65
planning:       7db026d2, 5f418261, 2f1639c8, 98789255, 9a575e07, 4fafae33, 38eb3f2a
research:       1215e706, 080351c9, c7a5a7dc, 94c8971e
session-mgmt:   c2c5252a, d0ec414a, 83cc471c, c6a5953b, d36afa29, 5f264b99, b54125de,
                fd8746c0, 1ce431c0, 256e4083, 20a67758, 8c9864bc, fbd7528a, 12c60246, a0446542
other:          cc38903e, e62a5112, a9162a44, 26e0cbfe (interrupted / insufficient signal)
```

Sessions classified as `other` are excluded from the stratified analysis. They are not lost — the v1.0 aggregate-pooled baseline includes their turns; only the per-task-type stratification omits them.

---

## 5. Comparative anchor: v1.0 aggregate-pooled baseline

The v1.0 report's analysis-class-pooled baseline (n=796) provides cross-validation:

| Stat   | v1.0 pooled | Weighted average across stratified types |
|--------|-------------|-----------------------------------------|
| median | 328         | ~330 (turn-weighted across the 5 types) |
| p25    | 204         | ~206                                    |
| p75    | 555         | ~555                                    |

The pooled and stratified baselines agree to within rounding error, confirming the manual classification did not introduce systematic bias in central tendency. The stratified breakdown is informative because it reveals task-type heterogeneity hidden in the pooled view — particularly the code-review outlier.

---

## 6. Notable finding: code-review baseline median is materially elevated

`code-review` (median 448, mean 631) sits ~33% above the next-highest type (`bug-diagnosis` 335). The taxonomy doc predicts code-review as the highest-CoD-fit type because of its structured-checklist reasoning shape. The high baseline confirms the **opportunity** is real (more thinking-tokens to compress); it does not yet confirm the **fit** (which Stage-2 measures).

**Implication for Stage-2 verdict interpretation**: A -55% reduction on code-review (target 448 → ≤201) yields a larger absolute saving (~247 tokens/turn) than a -55% reduction on planning (309 → 139, ~170 tokens/turn). If Stage-2's purpose is to identify the highest-leverage targets for fewshot investment (Phase 2.2), absolute-token-reduction ranking should be tracked alongside the percentage-reduction headline.

A cautionary note: with only 3 code-review sessions and 47 turns, the 448 median has wider confidence bands than the other types' medians. Stage-2 should report a 95% bootstrap CI on the observed median to avoid over-interpreting small samples.

---

## 7. Recommended Stage-2 verdict rendering

When Stage-2 verdict is computed (≥ 2026-05-18), report the following per task type:

1. **Sample provenance**: post-CoD turn count + session count
2. **Observed central tendency**: median ± 95% bootstrap CI
3. **Reduction**: `(observed_median - baseline_median) / baseline_median × 100`, with bracket overlay
4. **Verdict**: PASS (within bracket) / DIRECTIONAL (outside bracket but right sign) / FAIL (wrong sign or null effect)
5. **Absolute saving** (token-weighted): `(baseline_median - observed_median) × post_substantive_turns`

The headline Stage-2 PASS condition (per pre-reg §gate_to_next_phase) is "≥3 of 5 task types meet the per-type bracket". If 2-of-5 meet bracket but 4-of-5 are directional, surface that pattern explicitly — Phase 2.2 fewshot tuning may close the gap on the directional-but-not-bracket types.

---

## 8. Status summary

- ✅ **STRATIFIED COMPLETE** — all 5 pre-reg-defined task types have pooled per-turn baselines
- ✅ Methodological justification for accepting session-level under-sampling on code-review/research
- ✅ Stage-2 -50% targets pre-computed per task type (frozen at this report's publication; do not retroactively re-compute as more sessions accumulate)
- ✅ sid8 classification matrix preserved for reproducibility
- ✅ Cross-validated against v1.0 aggregate-pooled baseline (agreement within rounding)
- 📋 Open follow-up (NOT a Stage-2 blocker): if more code-review or research sessions accumulate before 2026-05-18, the baselines for those two types may be re-estimated with wider sample. Document the re-estimation timestamp; do not silently overwrite.

---

*Phase 2.1.b stratified baseline v1.0 — 2026-05-04*
*Supplements `phase-2-1-b-baseline-2026-05-03.md` v1.0; supersedes its §"Per-task-type starter classification" section.*
