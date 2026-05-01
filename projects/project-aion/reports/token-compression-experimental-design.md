# Token Compression — Experimental Design for Long-Term Benchmarking

**Purpose**: Standardized methodology for evaluating register, brevity, and compression interventions on Claude Code session telemetry. Replaces the ad-hoc median-output_tokens comparison in the implementation guide §3.3 with an intent-class-stratified protocol that produces interpretable, comparable, and pre-registered results across runs.

**Applicability**:
- Phase 1.x register directives (Jeeves-Brief, Alfred-Brief, future personas)
- Phase 2 Chain of Draft validation
- Phase 3 JICM compression effects
- Phase 4 pipeline COMPRESSION_MODE
- Any future intervention that modifies prose density without modifying information content

**Supersedes**: `token-compression-implementation-guide.md` §3.3 test protocol (kept for historical record; new runs follow this document).

**Companion docs**:
- `token-compression-implementation-guide.md` (per-phase deploy procedure)
- `token-compression-roadmap.md` (strategic phase planning)
- `.claude/metrics/token-compression/baseline-2026-04-30.md` (corpus baseline)
- `.claude/metrics/token-compression/phase-1-4-comparison-2026-04-30.md` (motivating case study)

---

## §1 Background — Why §3.3's Protocol Failed Open

The Phase 1.4 run on 2026-05-01 produced a result that was **uninterpretable, not informative**:

| Criterion | Threshold | Observed | Verdict |
|---|---|---|---|
| Hit rate within ±5pp baseline (93.6%) | within band | 89.74% | PASS |
| Median output_tokens 20-34% reduction | 20-34% ↓ | +72.6% to +653% (i.e., increased) | INCONCLUSIVE |
| Register spot-check clean | 0 / 5 violations | 0 / 91 violations | PASS |

The output_tokens regression was an artifact of population mismatch:
- Pre-deploy bucket: 177 sessions, 31,058 turns. Distribution bimodal: **56% of turns are 1-49 tokens** (tool-call-only or empty-text turns), heavy bottom skew, median 25.
- Post-deploy bucket: 2 sessions, 232 turns. **99.6% of turns are ≥50 tokens** (heavy commit/analysis prose only). Median 2,147.

The "20-34% reduction" target implicitly assumes matched content distributions. With unmatched distributions, the comparison measures *content type composition* not *register effect*. Even thresholding on output_tokens ≥1000 (keeping only the heaviest 6.2% of pre-deploy turns) leaves comparison contaminated by within-heavy content type differences (code dumps vs. commit summaries).

The fix: stratify the comparison by **intent class** so each test compares apples to apples.

---

## §2 The Question

Across all interventions in this benchmark family, the question is the same:

> **Holding content type constant, does the intervention reduce output tokens by amount X, with cache stability maintained within tolerance Y, and without introducing register violations?**

Three sub-questions, three measurement axes:

| Axis | Measures | Robust to population mismatch? |
|---|---|---|
| Cache stability | Cache hit rate, eph_1h adoption | Yes (token-weighted, normalized) |
| Brevity | Median output_tokens within intent class | Only when stratified |
| Register | Pattern matching against banned/preferred phrases | Yes (per-block classification) |

Cache and register are population-invariant. Brevity is not. Therefore brevity is where this design document earns its keep.

---

## §3 Variables

### 3.1 Independent variable
The intervention. Operationalized as a versioned commit hash (or hash pair when an intervention spans repos).

| Field | Example |
|---|---|
| `intervention_id` | `phase-1-1-jeeves-brief` |
| `deploy_commit` | `75c9d97` |
| `deploy_repo` | `CannonCoPilot/Jarvis` |
| `deploy_timestamp` | `2026-05-01T03:27:28Z` |

### 3.2 Dependent variables

| Variable | Source | Aggregation |
|---|---|---|
| `output_tokens` per turn | JSONL `usage.output_tokens` | Median per intent class per bucket |
| `cache_read_input_tokens` | JSONL `usage` | Token-weighted hit rate per bucket |
| `ephemeral_1h_input_tokens` | JSONL `usage` | Adoption rate per bucket |
| Register-marker hit count | Regex on assistant text blocks | Rate per substantive block |

### 3.3 Confounds and controls

| Confound | Mechanism | Control |
|---|---|---|
| Content-type composition | Migration sessions write more prose than debugging sessions | Stratify by intent class; use ordinary-session criterion (§7) |
| Task complexity | Complex tasks generate longer responses regardless of register | Within-class median is robust because complexity distribution is approximately matched within a class |
| Cache prefix invalidation on deploy | First post-deploy turn always misses | Token-weighted aggregate dilutes single-turn effect; baseline tolerance is ±5pp |
| Conversation length effects | Longer sessions accumulate more cache; more thinking blocks | Use per-turn measures; no per-session aggregation for brevity metric |
| Tooling-mix shift | New tool added between baseline and post-deploy changes turn distribution | Document tooling state at deploy_commit; tag any session-tooling change as a separate run |
| Time-of-day / fatigue effects | None expected (Claude is stateless across turns) | Not controlled |

---

## §4 Intent-Class Taxonomy

Six classes, ordered by typical token count and by expected register effect.

| Class | Definition | Heuristic | Expected register effect | Typical output_tokens |
|---|---|---|---|---|
| `tool_only` | Turn emitted only tool calls; no text or text < 5 tokens | `output_tokens < 5` AND `tool_use_count > 0` | None (no prose to shape) | 1-4 |
| `brief` | Short conversational turn; status, acknowledgment, terse answer | `5 ≤ output_tokens < 100` AND `code_blocks == 0` | **High** (cuts filler) | 5-99 |
| `interactive` | Standard conversational answer; one or two paragraphs | `100 ≤ output_tokens < 500` AND `code_lines / prose_lines < 0.5` | **High** | 100-499 |
| `analysis` | Explanatory prose with structure; insight blocks; multi-paragraph reasoning | `output_tokens ≥ 500` AND `code_lines / prose_lines < 0.5` | Medium (less filler proportionally) | 500-3000 |
| `code_dump` | Code-dominated turn; generated scripts, file contents | `code_lines / prose_lines ≥ 0.5` AND `code_lines ≥ 20` | Minimal (code is mechanical) | 200-5000 |
| `structured` | Table/list-dominated turn; minimal prose | `markdown_table_rows ≥ 5` OR (`bullet_lines / total_lines ≥ 0.6`) | Low | 100-1000 |

Order of evaluation when tagging (first match wins): `tool_only` → `code_dump` → `structured` → `analysis` → `interactive` → `brief`.

### 4.1 Class taxonomy notes

- The classes are mutually exclusive by construction (first-match ordering).
- Boundaries (output_tokens 100, 500; code_lines 20; bullet ratio 0.6) are calibrated against the 2026-04-30 baseline corpus (`baseline-2026-04-30.md`) and may be re-tuned once per fiscal quarter (document re-tunings in §13 changelog).
- New classes may be added when a workload shift creates a >5%-of-corpus bucket that doesn't fit existing classes. Adding a class invalidates prior intervention comparisons that overlap the new class boundary.

---

## §5 Tagging Procedure

### 5.1 Extractor v2 specification

Implementation: `.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py` (NEW — Phase 0.3 deliverable).

CSV schema additions over v1:

| Column | Source | Notes |
|---|---|---|
| `intent_class` | Computed per §4 | One of the six class names |
| `tool_use_count` | JSONL `message.content` (count of `tool_use` blocks) | |
| `code_lines` | Regex on text blocks: count of lines inside fenced code blocks | |
| `prose_lines` | Regex on text blocks: total lines minus code_lines minus blank | |
| `markdown_table_rows` | Regex: lines matching `^\s*\|.*\|\s*$` | |
| `bullet_lines` | Regex: lines matching `^\s*[-*]\s` | |
| `text_block_count` | Count of `text` blocks in `message.content` | |
| `register_violations` | Count of regex hits on §6 banned-pattern set | Per turn |

### 5.2 Tagging-pass quality check

Run on baseline corpus:

```bash
.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py \
    --emit-class-distribution
```

Required outputs (sanity check before any benchmark uses tagged data):
- Each class must have ≥1% of corpus turns or be flagged as too-rare.
- `tool_only` must capture between 20-40% of baseline turns (matches the bottom-heavy pre-deploy distribution observation).
- Manual review of 10 random turns per class to verify classifier agrees with human judgment. Any disagreement → re-tune heuristics → re-run quality check.

---

## §6 Register-Marker Patterns

Maintained as a versioned regex set in `.claude/skills/token-compression/templates/register-markers.yaml`.

### 6.1 Banned patterns (any hit = violation)

```yaml
ai_assistant_patois:
  - "\\bsure!?\\b"
  - "\\bhappy to help\\b"
  - "\\bof course!?\\b"
  - "\\bI'?ll just\\b"
  - "\\bcertainly,?\\b"
  - "\\bgladly\\b"
  - "\\bdefinitely!?\\b"
  - "\\bgreat!?\\b"
  - "\\babsolutely!?\\b"
  - "\\bI'?d be happy\\b"
  - "\\bperfect!?\\b"
  - "\\bawesome!?\\b"

trailing_offers:
  - "\\blet me know if\\b"
  - "\\blet me know when\\b"
  - "\\bjust let me\\b"
  - "\\bfeel free to\\b"
  - "\\bdon'?t hesitate\\b"

excessive_hedging:
  - "\\bI think (maybe|perhaps|possibly)\\b"
  - "\\bit might be that\\b"
  - "\\bI'?m not entirely sure\\b"
```

### 6.2 Preferred patterns (positive signal)

```yaml
butler_register:
  - "\\bsir[,.\\s]"
  - "\\bvery good\\b"
  - "\\bquite so\\b"
  - "\\bone moment\\b"
```

Note: butler-register hits are reported but do **not** affect pass/fail. They're an indicator that the persona is being applied, not a requirement.

### 6.3 Per-intervention overrides

Each register directive may add or override patterns. Example for `phase-1-5-alfred-brief`:

```yaml
overrides:
  butler_register:
    - "\\bMaster Nathaniel\\b"   # Alfred uses Master, not sir
```

Stored at `.claude/skills/token-compression/templates/register-markers-<intervention_id>.yaml`.

---

## §7 Sample Plan

### 7.1 Pre-deploy (baseline) bucket

For first-time interventions: use the full historical corpus filtered to ts < deploy_timestamp.
For subsequent reruns of an already-deployed intervention: rebuild baseline from the most recent 90 days of pre-deploy sessions to avoid drift from older tooling/workflow patterns.

Document at run time:
- Session count
- Turn count per intent class
- Date range
- Tooling state (MCP list, capability-map.yaml hash, CLAUDE.md hash)

### 7.2 Post-deploy bucket

Minimum sample requirements:

| Class | Minimum turns required | Minimum distinct sessions |
|---|---|---|
| `tool_only` | 100 | 3 |
| `brief` | 100 | 3 |
| `interactive` | 30 | 3 |
| `analysis` | 30 | 3 |
| `code_dump` | 20 | 2 |
| `structured` | 20 | 2 |

A run with insufficient samples in any class is reported as **partial** for that class. Cross-class deductions (e.g., "register effect is uniform") require all classes to meet minimums.

### 7.3 Ordinary-session criterion

A post-deploy session counts as "ordinary" only if its class composition is within the ordinariness band (computed from the baseline corpus):

| Class | Baseline share | Ordinariness band (±) |
|---|---|---|
| `tool_only` | 23.24% | ±10pp |
| `brief` | 34.79% | ±10pp |
| `interactive` | 27.01% | ±8pp |
| `analysis` | 12.73% | ±6pp |
| `code_dump` | 0.61% | ±5pp |
| `structured` | 1.61% | ±5pp |

Measured values from extractor v2 baseline run on 2026-05-01 against the 31,058-turn / 177-session pre-deploy corpus. See `phase-1-1-jeeves-brief-result-2026-05-01.md` §3 for source data and §9.2 for note on placeholder revisions.

Sessions outside the band are tagged as `atypical_<class>` (e.g., `atypical_analysis` for migration/telemetry-heavy sessions). They contribute to per-class comparisons but are excluded from the headline aggregate.

---

## §8 Pre-Registered Hypotheses

For each intervention, a pre-registration block is filled in **before** the post-deploy window opens (i.e., immediately after the deploy commit lands). Stored at `.claude/metrics/token-compression/pre-registration-<intervention_id>.yaml`.

### 8.1 Required pre-registration fields

```yaml
intervention_id: phase-1-1-jeeves-brief
deploy_commit: 75c9d97
deploy_timestamp: 2026-05-01T03:27:28Z
deploy_repo: CannonCoPilot/Jarvis
hypothesis:
  per_class_median_reduction:
    tool_only:    {expected: 0,    tolerance: 0,   reason: "no prose; no effect possible"}
    brief:        {expected: -25,  tolerance: 10,  reason: "filler-cutting most visible here"}
    interactive:  {expected: -20,  tolerance: 10,  reason: "filler-cutting effective on conversational answers"}
    analysis:     {expected: -10,  tolerance: 8,   reason: "less filler proportionally; effect smaller"}
    code_dump:    {expected: -2,   tolerance: 5,   reason: "code length is mechanical; minimal effect"}
    structured:   {expected: -5,   tolerance: 6,   reason: "tables/lists are mechanical; small effect via header prose"}
  cache_stability:
    hit_rate_dip_pp:  {expected: -2, tolerance: 5}
    eph_1h_adoption:  {expected: 90, tolerance: 15}
  register:
    violations_per_100_blocks: {expected: 0, tolerance: 1}
sample_targets:
  ordinary_sessions: 3
  total_substantive_turns: 300
gate_to_next_phase:
  description: "Phase 2 (CoD) opens when all classes are PASS or N/A"
  required_classes: [brief, interactive, analysis]
```

### 8.2 Why pre-registration

Pre-registration prevents two failure modes:
- **Hindsight calibration**: discovering the actual reduction was 12% and retroactively claiming "we expected ~10-15%."
- **Class cherry-picking**: looking at six classes, picking the two that pass, ignoring the four that didn't.

Filing the pre-registration into git on the same commit as the deploy makes the prediction immutable.

---

## §9 Statistical Methodology

### 9.1 Per-class brevity test

For each intent class, compare pre-deploy and post-deploy `output_tokens` distributions.

| Step | Method | Output |
|---|---|---|
| Distribution summary | Median + IQR + n | Reported in result table |
| Distribution comparison | Mann-Whitney U test (non-parametric, robust to outliers) | p-value |
| Effect size | Cliff's delta | Magnitude-of-difference, range [-1, 1] |
| Significance threshold | α = 0.05, Bonferroni-corrected for 6 classes (effective α = 0.0083) | PASS if p < α AND median reduction within tolerance |

### 9.2 Cache stability test

| Step | Method | Output |
|---|---|---|
| Token-weighted hit rate | `Σ cache_read / Σ (cache_read + eph_5m + eph_1h + input)` per bucket | Two scalars |
| Difference | post - pre, in percentage points | Δpp |
| Pass criterion | Δpp ∈ [-5, +5] | PASS / FAIL |

### 9.3 Register test

| Step | Method | Output |
|---|---|---|
| Block-level scan | Apply §6 banned-pattern regex to every assistant text block in post-deploy bucket | violations / total_blocks |
| Pass criterion | violations / 100 blocks ≤ pre-registered tolerance | PASS / FAIL |

### 9.4 Why these particular tests

- **Mann-Whitney over t-test**: output_tokens distributions are heavy-tailed and non-normal. Non-parametric ranks-based tests are appropriate.
- **Cliff's delta over Cohen's d**: same heavy-tail reason; Cliff's delta doesn't assume normality and reports interpretable magnitude (-1 = post fully below pre, 0 = same, +1 = post fully above pre).
- **Bonferroni over no correction**: six simultaneous class tests inflate family-wise error rate. Bonferroni is conservative but defensible; alternatives (Holm, Benjamini-Hochberg) are also acceptable if pre-registered.
- **Token-weighted over per-turn-mean for hit rate**: per-turn mean weights small turns equal to large turns. Token-weighted reflects actual cost reduction.

---

## §10 Pass/Fail Decision Matrix

A run produces a verdict at three levels: per-class, per-axis, overall.

### 10.1 Per-class verdict

For each intent class:

| Condition | Verdict |
|---|---|
| Median reduction within tolerance AND p < α | **PASS** |
| Median reduction within tolerance AND p ≥ α | **PASS-WEAK** (effect direction correct but underpowered) |
| Median reduction outside tolerance, in expected direction | **MIXED** (effect smaller or larger than predicted) |
| Median reduction in opposite direction AND p < α | **FAIL** |
| Insufficient sample (below §7.2 minimums) | **PARTIAL** |

### 10.2 Overall verdict

| All classes | Cache | Register | Verdict |
|---|---|---|---|
| All PASS or N/A | PASS | PASS | **FULL PASS** — proceed to next phase |
| Most PASS, ≤2 PASS-WEAK | PASS | PASS | **PROVISIONAL PASS** — collect more samples and re-evaluate |
| Any FAIL | * | * | **FAIL** — investigate; consider rollback |
| Any class PARTIAL | * | * | **INCOMPLETE** — collect more samples; do NOT promote to next phase |
| * | FAIL | * | **CACHE REGRESSION** — investigate prefix change; possible rollback |
| * | * | FAIL | **REGISTER REGRESSION** — directive not effective; rollback or revise |

### 10.3 What "the next phase" means

Each intervention sits at a specific position in the roadmap. Promotion gates:

| Current intervention | Gates promotion of |
|---|---|
| Phase 1.1 Jeeves-Brief | Phase 2 (CoD validation) on Jarvis |
| Phase 1.5 Alfred-Brief | Phase 2 on AIFred-Pro |
| Phase 1.2-1.4 pipeline epilogues | Phase 4 pipeline COMPRESSION_MODE |
| Phase 2 CoD | Phase 3 JICM compression |
| Phase 3 JICM | Phase 5 dashboard router wiring |

A FAIL at any gate stops downstream promotion until resolved.

---

## §11 Rollback Triggers

Automatic rollback recommended when:

| Trigger | Threshold | Action |
|---|---|---|
| Cache hit rate dropped beyond tolerance | post < (pre - 5pp) | Investigate prefix change; revert deploy commit if no fix |
| Register violations per 100 blocks | > 5 | Revise directive text or revert |
| Any class median moved opposite to prediction by > 50% of tolerance | (e.g., predicted -25% ±10%, observed +5%) | Investigate; likely revert |
| Sustained user corrections targeting register | > 3 in a single session | Revise directive |

Rollback procedure:

```bash
git -C <deploy_repo> revert <deploy_commit>
git -C <deploy_repo> commit -m "revert: <intervention_id> per experimental-design §11"
```

Or, if the rollback is immediate (within hours of deploy):

```bash
git -C <deploy_repo> checkout HEAD~1 -- <directive_file>
git -C <deploy_repo> commit -m "revert: <intervention_id> immediate rollback"
```

Rollback closes the run with verdict FAIL and updates `pre-registration-<intervention_id>.yaml` with `outcome: rolled_back, reason: <reason>`.

---

## §12 Operational Procedure

The full run sequence, end to end.

### 12.1 Pre-deploy

1. Confirm extractor v2 is current; run baseline tagging.
2. Open pre-registration draft at `.claude/metrics/token-compression/pre-registration-<intervention_id>.yaml`.
3. Fill in hypothesis fields per §8.1 from intervention design.
4. Compute pre-deploy class shares from baseline; note ordinariness bands.
5. Stage the deploy commit; do NOT push yet.

### 12.2 Deploy

1. Push deploy commit; record exact `deploy_timestamp` (UTC, second precision) from server reflog.
2. Commit pre-registration file with deploy_commit hash filled in. Push to lock the prediction.
3. Create launchd reminder for first eligibility check (typically 7 days post-deploy to accumulate samples).

### 12.3 Sample collection

1. Resume normal work. Do NOT artificially construct sessions to test the directive — that biases the sample.
2. The launchd reminder fires when minimum samples are likely available.
3. Run extractor v2 against the post-deploy window.
4. Classify post-deploy sessions as `ordinary` or `atypical_<class>` per §7.3.
5. Verify minimum samples (§7.2). If insufficient, push reminder out by 7-14 days; do NOT close the run.

### 12.4 Analysis

1. Run per-class statistical tests (§9.1).
2. Run cache stability test (§9.2).
3. Run register test (§9.3).
4. Build verdict matrix (§10).
5. Write run report to `.claude/metrics/token-compression/<intervention_id>-result-<YYYY-MM-DD>.md` using the template at §14.

### 12.5 Decision

1. If FULL PASS: promote to next phase per §10.3.
2. If PROVISIONAL PASS: schedule rerun with larger sample.
3. If FAIL: rollback per §11 OR revise directive and re-deploy as a new `intervention_id`.
4. Update `.active-plan` with current state.
5. Commit run report and decision; push.

---

## §13 Long-Term Application

This protocol is intentionally generic. To apply to a new intervention, only the following pieces change:

| What changes | What stays the same |
|---|---|
| Pre-registered per-class predictions | Intent-class taxonomy |
| Register-marker overrides (per-persona) | Statistical methodology |
| Deploy repo and commit hash | Pass/fail decision matrix |
| Rollback specifics | Sample requirements |
| Per-intervention companion docs | Operational procedure |

### 13.1 Examples

| Intervention | What's per-intervention | What's standard |
|---|---|---|
| Phase 1.1 Jeeves-Brief | Predictions weighted toward `brief`/`interactive`; "sir" as positive signal | All else |
| Phase 1.5 Alfred-Brief | "Master Nathaniel" as positive signal; predictions calibrated for AIFred's content mix | All else |
| Phase 2 CoD | Predicted reductions concentrated in `analysis` class (CoD targets reasoning prose); `brief`/`interactive` predictions ≈ 0 | All else |
| Phase 3 JICM | Independent variable is the *checkpoint* prose, not normal-turn prose; secondary effect on `analysis` if context restoration produces shorter recap turns | All else |
| Phase 4 pipeline COMPRESSION_MODE | Telemetry source is pipeline executor logs, not Claude Code session JSONLs; need parallel extractor for that source | Methodology and pass/fail logic |

### 13.2 Cross-intervention comparisons

When two interventions are deployed in sequence, the second uses the first's post-deploy state as its baseline. Document this lineage explicitly in the second intervention's pre-registration:

```yaml
intervention_id: phase-2-cod
baseline_lineage:
  - phase-1-1-jeeves-brief (deployed 2026-05-01)
  - phase-1-5-alfred-brief (deployed 2026-05-01)
```

A composite intervention's predicted effect is **not** the sum of components — interactions between register and reasoning compression are non-trivial. Pre-register conservatively.

### 13.3 Changelog protocol

Significant methodology changes (boundary recalibration, new intent class, new statistical test) are logged in §14. A change in methodology invalidates direct comparison to prior runs that used the older methodology; document this in the rerun's report.

---

## §14 Templates and Reference

### 14.1 Run report template

Stored at `.claude/metrics/token-compression/templates/run-report-template.md` (TBD).

Structure:
1. Header (intervention_id, deploy commit, run date)
2. TL;DR verdict
3. Pre-registration (cited verbatim from yaml)
4. Sample composition (pre and post buckets, by class)
5. Cache stability result
6. Per-class brevity table (median, IQR, n, p, Cliff's delta, vs. tolerance, verdict)
7. Register result
8. Decision + next action

### 14.2 Pre-registration template

Stored at `.claude/metrics/token-compression/templates/pre-registration-template.yaml` (TBD; contents per §8.1).

### 14.3 Methodology changelog

| Date | Change | Reason |
|---|---|---|
| 2026-05-01 | Document created | Phase 1.4 INCONCLUSIVE result on §3.3 protocol revealed need for stratified comparison |
| 2026-05-01 | §7.3 ordinariness placeholders replaced with measured values | First v2 baseline run produced actual class shares; placeholders for `interactive` (~17% → 27.01%) and `code_dump` (~9% → 0.61%) were materially off |
| 2026-05-01 | Phase 0.4 backlog item added: quote-aware register filter | First register evaluation surfaced false positives on meta-mentions of register patterns inside double-quoted illustrative examples in methodology prose |
| 2026-05-01 | Phase 0.4 SHIPPED: `strip_quoted_for_register()` added to extractor v2; `count_register_violations()` now strips fenced code, inline backticks, ASCII double quotes, and smart double quotes before pattern matching. Validated on Jarvis corpus: row count and class shares unchanged; register-violation total dropped 636 → 608 (28 fewer raw hits across 70 additional turns) | Closes the manual-review burden surfaced by the Phase 1.1 rerun. Single quotes (apostrophes) and blockquotes intentionally preserved to avoid cascading false negatives. Targeted check: session `94c8971e` turn 182 dropped from 2 to 0 violations (both meta-mentions inside illustrative quotations) |

---

## §15 Quick Reference

For routine reruns, follow this short loop:

1. Pre-register hypothesis at deploy time, push to lock.
2. Wait for sufficient samples per §7.2 (launchd reminder).
3. Run extractor v2; classify sessions (§7.3).
4. Run per-class tests (§9), cache test, register test.
5. Build verdict (§10).
6. Write report; commit; decide.

Files always involved:
- `.claude/metrics/token-compression/cache-telemetry-<YYYYMMDD>.csv` — extractor output
- `.claude/metrics/token-compression/pre-registration-<intervention_id>.yaml` — hypothesis
- `.claude/metrics/token-compression/<intervention_id>-result-<YYYY-MM-DD>.md` — run report
- `.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py` — extractor v2 (Phase 0.3 deliverable)
- `.claude/skills/token-compression/templates/register-markers.yaml` — register patterns

---

*Token Compression Experimental Design v1.0 — 2026-05-01.*
*Supersedes implementation guide §3.3. Applies to all current and future register, brevity, and compression interventions.*
