# Phase 2.1.b — Pre-CoD Thinking-Token Baseline

**Date**: 2026-05-03 (collection); reproduced from corpus mtime ≤ 14 days from 2026-05-03 UTC
**Status**: STARTER baseline (per-class aggregate complete; per-task-type stratification under-sampled)
**Scope**: Pre-CoD distribution measurement for the Phase 2 CoD pre-registration's `baseline_session_selection` block. NOT a verdict; provides the denominator for Stage-2's post-CoD comparison.
**Cross-references**:
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- Extractor: `.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py` (v2.1, Phase 2.4.c extension)
- Taxonomy: `projects/project-aion/designs/cod-task-type-taxonomy.md`
- Corpus CSV (raw): `.claude/scratch/phase-2-1-b/baseline-corpus-2026-05-03.csv` (4.3 MB, 34,335 rows)

---

## Methodology

### Corpus selection

| Filter | Value |
|--------|-------|
| Source | `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/*.jsonl` |
| Window | `find -mtime -14` (rolling 14-day; 2026-04-20 → 2026-05-03) |
| File count | 54 sessions |
| Turn count | 34,334 assistant turns |

### Substantive thinking-turn filter

Per pre-registration `sample_targets.baseline_session_selection`:
- `thinking_block_count > 0` (turn contains at least one thinking content block)
- `thinking_chars > 200` (excludes trivially short thinking)
- `output_tokens >= 800` (matches pre-reg substantive_thinking_turns criterion)

Result: **796 substantive thinking turns** (2.3% of corpus).

### Thinking-token approximation

`usage.thinking_tokens` is **not exposed** by the Anthropic API for Opus 4.X 1M (verified 2026-05-03 via JSONL inspection — `usage` keys are: input_tokens, cache_read_input_tokens, cache_creation, cache_creation_input_tokens, output_tokens, server_tool_use, service_tier, speed, inference_geo, iterations).

Workaround: count characters in `message.content[].type=="thinking"` blocks; estimate tokens as `chars // 4`. The constant is irrelevant for relative comparison (Stage-2's `post_chars / pre_chars` is the same as `post_tokens_est / pre_tokens_est`).

The extractor emits both raw `thinking_chars` and the derived `thinking_tokens_est`; downstream analysis can use either.

---

## Aggregate baseline (analysis-class pooled, n=796)

All 796 substantive thinking turns fall in the `analysis` intent class — by construction, since `output_tokens >= 800` is incompatible with `brief / interactive / tool_only / structured / code_dump` classification rules. The aggregate IS the analysis-class baseline.

| Stat | thinking_tokens_est |
|------|---------------------|
| p10 | 120 |
| p25 | 204 |
| **median** | **328** |
| mean | 457 |
| p75 | 555 |
| p90 | 915 |
| max | 5,642 |
| total | 364,450 |

The distribution is right-skewed (mean > median, p90 > 2.5× median, max ≈ 17× median). Stage-2's per-task-type comparison should use median rather than mean as the central tendency, with IQR as the dispersion measure.

---

## Per-task-type starter classification (15 sessions)

Top-15 sessions by aggregate `thinking_tokens_est` were manually classified by reading their first organic user prompt (skipping JICM-RESUME caveats and tool-result envelopes).

| session_id (12c) | task type (manual) | thinking_turns | total thinking_tokens_est |
|------------------|--------------------|----|----|
| c2c5252a-cb1 | session-mgmt | 17 | 26,802 |
| d0ec414a-299 | session-mgmt | 44 | 20,794 |
| 83cc471c-63c | session-mgmt | 25 | 18,371 |
| 7db026d2-b6b | planning | 47 | 17,722 |
| 5f418261-15c | planning | 43 | 16,742 |
| 2f1639c8-843 | planning | 23 | 14,718 |
| 41a7fb63-26c | code-review | 26 | 11,641 |
| 94c8971e-47f | research/bug-diagnosis (mixed) | 34 | 11,613 |
| a2393198-c45 | code-review | 13 | 11,422 |
| 1d0d10cd-3d1 | bug-diagnosis | 29 | 11,063 |
| cc38903e-6cb | (interrupted; skip) | 24 | 10,580 |
| c6a5953b-9d0 | session-mgmt | 25 | 10,366 |
| d36afa29-f44 | session-mgmt | 26 | 10,136 |
| 5f264b99-3b6 | session-mgmt | 36 | 10,108 |
| 1215e706-eae | research | 25 | 9,658 |

### Coverage against pre-reg target (5 sessions per task type)

| Task type | Sessions identified | Pre-reg target | Gap |
|-----------|---------------------|----------------|-----|
| code-review | 2 | 5 | -3 |
| bug-diagnosis | 1-2 | 5 | -3 to -4 |
| planning | 3 | 5 | -2 |
| research | 1-2 | 5 | -3 to -4 |
| session-mgmt | 6 | 5 | +1 (over-sampled) |

**Verdict**: starter sample sufficient for `session-mgmt` and `planning`; under-sampled for `code-review`, `bug-diagnosis`, `research`. Broader sampling needed before Stage-2 verdict computation.

### Bias note

The selection ordering by aggregate `thinking_tokens_est` biases toward verbose work and long sessions. This bias correlates with task type: planning and session-mgmt produce more aggregate thinking per session because they involve multi-turn deliberation; code-review and bug-diagnosis can resolve in fewer turns. To get balanced per-task-type samples, filter by **mean thinking-tokens-per-substantive-turn** rather than aggregate, and sample across the full 14d window without ordering by total.

---

## Per-session statistics (selected; from CSV)

For Stage-2 comparison, the relevant unit is **per-substantive-turn**, not per-session aggregate. Per-session means below are derived from the CSV directly.

```
session_id      thinking_turns  mean_thinking_tokens_est_per_turn
c2c5252a-cb1     17              1,576
d0ec414a-299     44              473
83cc471c-63c     25              735
7db026d2-b6b     47              377
5f418261-15c     43              389
2f1639c8-843     23              640
41a7fb63-26c     26              448
1d0d10cd-3d1     29              381
1215e706-eae     25              386
```

The variance across sessions (377 → 1,576 mean per substantive turn) suggests strong per-task variability. Stage-2's median-of-substantive-turns within task type should be more stable than per-session aggregate.

---

## Implications for Stage-2 verdict computation

**Methodologically usable today**: the analysis-class pooled baseline (median 328, IQR 204-555) provides a defensible PROVISIONAL central tendency for thinking_tokens_est. Stage-2's hypothesis ("≥3 of 5 task types meet -50% reduction") can be tested against this pooled baseline if per-task-type stratification remains under-sampled by 2026-05-18.

**Cleaner if available**: per-task-type baselines stratified across 5 sessions each. To collect this, broader sampling across the 14d corpus is needed (not just top-15-by-thinking).

**Open follow-up** (autonomous-schedule item): broaden the manual classification across all 40 qualified sessions; produce per-task-type median/IQR. Best done before 2026-05-15 (Stage-2 sample-eligibility cutoff for many cohorts).

---

## Reproducibility

```bash
# Re-run extraction
python3 .claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py \
  /Users/nathanielcannon/.claude/projects/-Users-nathanielcannon-Claude-Jarvis \
  --out .claude/scratch/phase-2-1-b/baseline-corpus-2026-05-03.csv \
  --emit-class-distribution

# Re-aggregate (substantive thinking turns)
python3 -c "
import csv, statistics
from collections import defaultdict
by_class = defaultdict(list)
with open('.claude/scratch/phase-2-1-b/baseline-corpus-2026-05-03.csv') as f:
    for row in csv.DictReader(f):
        if int(row['thinking_block_count']) > 0 \
           and int(row['thinking_chars']) > 200 \
           and int(row['output_tokens']) >= 800:
            by_class[row['intent_class']].append(int(row['thinking_tokens_est']))
for c, v in by_class.items():
    print(c, len(v), 'median:', int(statistics.median(v)))
"
```

---

## Status summary

- ✅ Extractor extended (Phase 2.4.c) — `thinking_block_count`, `thinking_chars`, `thinking_tokens_est`, `output_tokens_visible_est` columns present
- ✅ Corpus extracted — 54 sessions, 34,334 turns, 796 substantive thinking turns
- ✅ Aggregate baseline computed — analysis-class pooled (n=796): median 328, mean 457
- ⚠️ Per-task-type stratification — STARTER ONLY (3-of-5 task types under-sampled; broader manual classification queued)
- ✅ Reproducibility documented — CSV + commands preserved

Stage-2 verdict computation has a defensible PROVISIONAL baseline. Cleaner per-task-type baselines remain a backlog item before 2026-05-18 verdict draft.

---

*Phase 2.1.b baseline report v1.0 — 2026-05-03*
