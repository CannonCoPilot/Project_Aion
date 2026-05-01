# Token-Compression Run Report — `phase-1-1-jeeves-brief` — 2026-05-01

**Intervention**: `phase-1-1-jeeves-brief`
**Deploy commit**: `75c9d97` on `CannonCoPilot/Jarvis`
**Deploy timestamp**: `2026-05-01T03:27:28Z`
**Run date**: `2026-05-01`
**Pre-registration**: `.claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml`

> **METHODOLOGICAL CAVEAT**: This is the *first run* of the experimental-design
> protocol on real data, applied retrospectively to a deploy that predates the
> protocol itself. The pre-registration was filed post-hoc from the design doc's
> §8.1 example. This run primarily validates the protocol's mechanics; it does
> NOT establish a clean per-class effect signal for Phase 1.1. See §9 for
> methodological notes uncovered by this run.

---

## §1 TL;DR

**Verdict**: `INCOMPLETE`

**Headline result**: All 3 post-deploy sessions are atypical (heavy-analysis prose); zero ordinary-session turns available, so per-class brevity verdicts are PARTIAL across the board. Cache stability passes; register passes after manual review of false positives.

**Decision**: Hold; do NOT promote to Phase 2. Sample-collection window remains open for 3 ordinary post-deploy sessions per pre-registration.

| Headline | Threshold | Observed | Verdict |
|---|---|---|---|
| Cache hit rate Δpp | within ±5pp | -1.93pp | **PASS** |
| Register violations / 100 blocks (raw) | ≤ 1 | 2.02 | **FAIL (raw)** |
| Register violations / 100 blocks (after manual review) | ≤ 1 | 0.00 | **PASS (post-review)** |
| Per-class brevity (PASS / total non-N/A) | all PASS | 0 / 6 (all PARTIAL) | **PARTIAL** |

---

## §2 Pre-Registration (verbatim)

```yaml
intervention_id: phase-1-1-jeeves-brief
deploy_commit: 75c9d97
deploy_timestamp: 2026-05-01T03:27:28Z
deploy_repo: CannonCoPilot/Jarvis
baseline_lineage: []

hypothesis:
  per_class_median_reduction:
    tool_only:    {expected: 0,    tolerance: 0,   reason: "no prose; no effect possible"}
    brief:        {expected: -25,  tolerance: 10,  reason: "filler-cutting most visible here"}
    interactive:  {expected: -20,  tolerance: 10,  reason: "filler-cutting effective on conversational answers"}
    analysis:     {expected: -10,  tolerance: 8,   reason: "less filler proportionally"}
    code_dump:    {expected: -2,   tolerance: 5,   reason: "code is mechanical"}
    structured:   {expected: -5,   tolerance: 6,   reason: "tables/lists mechanical, header prose only"}
  cache_stability:
    hit_rate_dip_pp:  {expected: -2, tolerance: 5}
    eph_1h_adoption:  {expected: 90, tolerance: 15}
  register:
    violations_per_100_blocks: {expected: 0, tolerance: 1}

sample_targets:
  ordinary_sessions: 3
  total_substantive_turns: 300
  collection_window_days: 14

gate_to_next_phase:
  description: "Phase 2 (CoD) opens when all classes are PASS or PASS-WEAK"
  required_classes: [brief, interactive, analysis]
```

---

## §3 Sample Composition

### Pre-deploy bucket

| Class | Turns | Sessions | Share |
|---|---|---|---|
| `tool_only` | 7,217 | 177 | 23.24% |
| `brief` | 10,806 | 177 | 34.79% |
| `interactive` | 8,388 | 177 | 27.01% |
| `analysis` | 3,955 | 177 | 12.73% |
| `code_dump` | 191 | 177 | 0.61% |
| `structured` | 501 | 177 | 1.61% |
| **Total** | **31,058** | **177** | |

Date range: 2026-02-17 → 2026-05-01 03:27Z. Source: `.claude/metrics/token-compression/cache-telemetry-v2-20260501.csv`.

These actual class shares replace the placeholder numbers in design doc §7.3. The `interactive` placeholder (~17%) was a substantial under-estimate — actual is 27.01%. The `code_dump` placeholder (~9%) was a substantial over-estimate — actual is 0.61%. Future runs should use the measured values.

### Post-deploy bucket — all 3 sessions tagged ATYPICAL

| Session | Turns | Class composition (vs band) | Atypicality verdict |
|---|---|---|---|
| `5f418261-15c6-414a-9b8b-1751e1855643` | 110 | analysis 89.1% (vs 12.7%±6); brief 0.9% (vs 34.8%±10); tool_only 0.0% (vs 23.2%±10); interactive 3.6% (vs 27.0%±8) | atypical_analysis, atypical_brief, atypical_tool_only, atypical_interactive |
| `1215e706-eaef-4924-884c-c8c56641d7e3` | 131 | analysis 88.5%; brief 2.3%; tool_only 0.0%; interactive 6.1% | atypical_analysis, atypical_brief, atypical_tool_only, atypical_interactive |
| `94c8971e-47f1-4a2c-a40c-527f1eeb87df` | 116 | analysis 64.7%; brief 0.9%; tool_only 0.0%; interactive 31.0% (in band) | atypical_analysis, atypical_brief, atypical_tool_only |

**Ordinary post-deploy sessions: 0**

Sample-target check vs pre-registration:
- ordinary_sessions: 0 / 3 — **NOT MET**
- total_substantive_turns (≥50 output_tokens): ~355 / 300 — MET in raw count, but irrelevant since no ordinary sessions exist
- per-class minimums (§7.2): all classes in ordinary bucket = 0 turns — **NOT MET on every class**

Why the post-deploy bucket is dominated by analysis sessions:
- `5f418261` was the git-topology migration commit-organization session.
- `1215e706` was the Phase 1.4 telemetry analysis session (the one that triggered the experimental-design doc rewrite).
- `94c8971e` is *this* session — building the experimental-design protocol, the four scaffolds, and writing this very report.

Three back-to-back heavy-prose work sessions is a session-mix anomaly. Ordinary debugging/feature/Q&A sessions are needed before the comparison becomes interpretable.

---

## §4 Cache Stability Result

| Metric | Pre-deploy | Post-deploy | Δ | Tolerance | Verdict |
|---|---|---|---|---|---|
| Token-weighted hit rate | 93.59% | 91.66% | **-1.93pp** | ±5pp | **PASS** |
| Per-turn mean hit rate | 88.72% | 91.49% | +2.77pp | (informational) | — |
| eph_1h adoption | 84.63% | 100.00% | +15.37pp | per pre-reg (90±15%) | **PASS** |

**Interpretation**: Cache prefix invalidated as predicted by the baseline doc §3 warning. Recovery to within tolerance held across all three post-deploy sessions. eph_1h adoption rose to 100% — every observed post-deploy turn carried the 1h-TTL marker, slightly exceeding the predicted 90%. This is robust to the population mismatch because it's a normalized fraction.

---

## §5 Per-Class Brevity Result

| Class | n_pre | n_post (ord) | median_pre | median_post | Δ% | tolerance | p (Mann-Whitney) | Cliff's δ | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `tool_only` | 7,217 | 0 | 1 | n/a | n/a | 0±0 | n/a | n/a | **PARTIAL** |
| `brief` | 10,806 | 0 | 8 | n/a | n/a | -25±10 | n/a | n/a | **PARTIAL** |
| `interactive` | 8,388 | 0 | 212 | n/a | n/a | -20±10 | n/a | n/a | **PARTIAL** |
| `analysis` | 3,955 | 0 | 883 | n/a | n/a | -10±8 | n/a | n/a | **PARTIAL** |
| `code_dump` | 191 | 0 | 1 | n/a | n/a | -2±5 | n/a | n/a | **PARTIAL** |
| `structured` | 501 | 0 | 470 | n/a | n/a | -5±6 | n/a | n/a | **PARTIAL** |

Statistical note:
- α = 0.05, Bonferroni-corrected for 6 classes → effective α = 0.0083
- All classes are PARTIAL because the ordinary post-deploy bucket has zero turns
- Pre-deploy medians ARE interpretable as the v2 baseline reference for future reruns:
  - `tool_only` median 1: as expected — these are bookkeeping-only turns
  - `brief` median 8: very short status/control turns dominate this class
  - `interactive` median 212: standard conversational answers
  - `analysis` median 883: substantive prose
  - `code_dump` median 1: surprising; possibly the heuristic is too strict (code_lines/prose_lines ≥ 0.5 AND code_lines ≥ 20 may be filtering too aggressively, leaving only edge cases)
  - `structured` median 470: tables/lists with moderate prose

Per-class commentary: not applicable — no comparisons performable. Future reruns will populate these.

---

## §6 Register Result

### Raw scan

| Pattern group | Hits | Blocks scanned | Rate per 100 | Tolerance | Verdict |
|---|---|---|---|---|---|
| `ai_assistant_patois` | 1 | 99 | 1.01 | per pre-reg (0±1) | (combined below) |
| `trailing_offers` | 1 | 99 | 1.01 | per pre-reg | (combined below) |
| `excessive_hedging` | 0 | 99 | 0.00 | per pre-reg | (combined below) |
| **Total banned** | **2** | **99** | **2.02** | **0±1** | **FAIL (raw)** |

### Manual review of all 2 hits

Both raw hits are in session `94c8971e` (this session), turn 182, in the assistant message that explained Phase 1.4's population-mismatch finding (§5 of that explanation):

| # | Pattern | Match text | Context | Verdict |
|---|---|---|---|---|
| 1 | `\bcertainly,?\b` | `certainly` | `'Yes, that's well within the tolerance band, certainly!'` (illustrative example of bad register, in double quotes) | **FALSE POSITIVE** — meta-mention |
| 2 | `\blet me know if\b` | `let me know if` | `'I've completed that for you, let me know if you need anything else!'` (illustrative example of bad register, in double quotes) | **FALSE POSITIVE** — meta-mention |

Both hits are inside double-quoted illustrative examples in a methodology document section about register patterns. The assistant was *talking about* what bad register would look like, not actually using it.

### Effective register verdict (post-review)

| Metric | Value | Verdict |
|---|---|---|
| Genuine register violations | 0 | — |
| Genuine rate per 100 | 0.00 | **PASS** |

Positive signal (informational):

| Pattern group | Hits | Rate per 100 |
|---|---|---|
| `butler_register` | (not reported in this run; defer to Phase 0.5 instrumentation) | — |

### Post-Phase-0.4 re-scan (2026-05-01, after `strip_quoted_for_register()` shipped)

The quote-aware filter described in §9.3 was implemented and merged the same day this report was written. Re-running extractor v2 against the same corpus with the filter active:

| Metric | Pre-filter | Post-filter | Δ |
|---|---|---|---|
| Total register violations (corpus-wide) | 636 | 608 | -28 |
| Turns with ≥ 1 violation | 625 | 604 | -21 |
| Session `94c8971e` turn 182 violations | 2 | 0 | -2 (target case) |
| Class-share distribution | (reference) | identical (within 0.01pp) | unchanged |
| Row count | 31,415 | 31,485 | +70 (corpus growth between runs) |

The filter eliminated all false positives identified in the manual review. The two illustrative-quotation hits in turn 182 (`"...certainly!"` and `"...let me know if..."`) are now correctly suppressed. Net of the +70 new turns at the prior rate (~1.4 expected new hits), the filter is suppressing ≈30 false positives across the corpus.

**Implication for this report's verdict**: `register` axis remains PASS. The post-review manual reconciliation in §6 is no longer needed for future Phase 1.x runs — pattern matching is now meta-mention-safe. Single quotes and blockquotes are intentionally preserved.

---

## §7 Decision Matrix Application

Per design doc §10.2:

| Axis | Verdict |
|---|---|
| All classes PASS or N/A | **No** — all 6 classes PARTIAL |
| Cache stability PASS | **Yes** |
| Register PASS (post-review) | **Yes** |
| Sample sufficient for promotion | **No** — 0 ordinary sessions vs 3 required |

**Overall**: `INCOMPLETE` — per §10.2, "Any class PARTIAL → INCOMPLETE — collect more samples; do NOT promote to next phase."

---

## §8 Decision and Next Action

**Decision**: HOLD. Do NOT promote to Phase 2.

**Rationale**: The protocol surfaced exactly what should be surfaced — the post-deploy sample is currently inadequate to evaluate brevity effects. Cache stability and register both indicate the directive is operationally healthy. Sample-window remains open.

**Next steps**:
1. Continue normal work; resist the temptation to engineer a "test session" — that would bias the sample. Authentic ordinary sessions are required.
2. When the launchd reminder fires (2026-05-03 09:00 MDT) or the remote routine fires (2026-05-04T03:00:00Z), check post-deploy session count: re-run extractor v2, recount ordinary sessions, decide whether to extend window or run final analysis.
3. If 3 ordinary sessions accumulate within 14 days, run final Phase 1.4 analysis under this same protocol. If not, push the window by 7-14 days and check again.
4. Address Phase 0.4 backlog item before next register evaluation: extractor v2 needs quote-aware filtering to avoid the false-positive class identified in §6.

**Files updated**:
- `.claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml` → `outcome.status: INCOMPLETE`, reason and closed_at filled in
- `.claude/context/.active-plan` → reflects this rerun result; Phase 0.4 backlog item added

---

## §9 Methodological Notes

This rerun surfaced four protocol-level findings worth documenting for future runs.

### 9.1 Post-hoc pre-registration is a methodological compromise, not a clean run

This run filed pre-registration after the post-deploy data already existed. That means it tests the protocol's mechanics on real data but does not constitute a clean Phase 1.1 result. The first clean pre-registered run in this benchmark family will be either Phase 1.5 (Alfred-Brief, deployable now under the new protocol) or a Phase 1.1 re-run after a meaningful directive revision creates a new deploy_commit.

### 9.2 §7.3 ordinariness placeholders were significantly off in two classes

The design doc said:
- `interactive`: ~17% (placeholder)
- `code_dump`: ~9% (placeholder)

Actual measured shares:
- `interactive`: 27.01%
- `code_dump`: 0.61%

The `interactive` placeholder undershoots by 10pp — real workload has substantially more conversational answers than the design doc anticipated. The `code_dump` placeholder overshoots by ~8.4pp — real workload has very few turns dominated by code blocks (most code appears as small embedded snippets in `analysis` or `interactive` turns).

**Action — DONE in this commit**: design doc §7.3 placeholders replaced with measured values; §14 changelog updated.

### 9.3 Register classifier produces false positives on meta-mentions

Both raw violations in this run were inside double-quoted illustrative examples in methodology prose. The classifier has no way to distinguish:
- Actual register violations (assistant uses bad register)
- Meta-mentions (assistant talks about bad register, e.g., in design docs, run reports, tutorials)

Since this benchmark family explicitly produces methodology prose that *quotes* register violations to discuss them, this false-positive class will recur on every register evaluation.

**Action**: extractor v2 needs a quote-aware filter (Phase 0.4 backlog item, logged in design doc §14 changelog). Candidate heuristics:
- Skip text inside double-quoted strings (`"..."`)
- Skip text inside backticks (already in code-block stripping)
- Skip text matching `^.* vs .*$` patterns (tutorial comparison lines)
- Add a pre-filter that strips code blocks AND quoted illustrative examples before pattern matching

Until the fix lands, register evaluations require manual review of all hits.

### 9.4 Heavy-prose sessions cluster — sample collection takes longer than expected

The first three post-deploy sessions are all heavy-prose work (migration, Phase 1.4 analysis, this protocol build). This is a sampling-rate problem: the 14-day collection window assumes a representative session mix, but the actual rate of "ordinary" interactive sessions is workload-dependent and may be slower than the cadence assumed in `sample_targets.collection_window_days`.

**Action**: the collection-window reminder should also report ordinary-session count, not just total session count. If after 14 days there are still 0 ordinary sessions, the right move is to extend the window, not to relax the ordinariness criterion. Add to design doc §12.3 ("Sample collection") as an explicit rule.

---

## §10 Files Referenced

- Telemetry CSV: `.claude/metrics/token-compression/cache-telemetry-v2-20260501.csv`
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml`
- Baseline reference: `.claude/metrics/token-compression/baseline-2026-04-30.md`
- Session JSONLs: `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/{5f418261,1215e706,94c8971e}*.jsonl`
- Design doc: `projects/project-aion/reports/token-compression-experimental-design.md`
- Companion (original v1 run): `.claude/metrics/token-compression/phase-1-4-comparison-2026-04-30.md`
- Results JSON (machine-readable): `.claude/metrics/token-compression/phase-1-1-jeeves-brief-results.json`

---

*Run Report v1 — phase-1-1-jeeves-brief — 2026-05-01.*
*Status: INCOMPLETE. Sample-collection window open. Phase 0.4 quote-aware filter blocks clean register evaluations on methodology-prose sessions.*
