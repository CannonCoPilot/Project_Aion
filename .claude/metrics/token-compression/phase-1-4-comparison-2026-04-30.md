# Phase 1.4 Comparison — Jeeves-Brief Post-Deploy Telemetry

**Generated**: 2026-05-01 (after Jeeves-Brief deploy at commit `75c9d97`)
**Cutoff**: `2026-05-01T03:27:28Z` (Jeeves-Brief deploy time)
**Source**: `.claude/metrics/token-compression/cache-telemetry-20260430.csv` (31,290 rows, 179 sessions)
**Companion**: `token-compression-implementation-guide.md` §3.3 (test protocol)
**Baseline**: `.claude/metrics/token-compression/baseline-2026-04-30.md`

---

## TL;DR — Provisional PASS, sample insufficient for full sign-off

| §3.3 criterion | Threshold | Result | Status |
|---|---|---|---|
| Hit rate within ±5pp of baseline | 93.6% ± 5pp = [88.6%, 98.6%] | **89.74%** (token-weighted) | **PASS** |
| Median output_tokens 20-34% reduction | 20-34% ↓ | **+72.6% to +653.3%** (population mismatch — see §4) | **INCONCLUSIVE** |
| 5 spot-check responses clean of register violations | 0 hits in 5 samples | **0 hits in 91 assistant blocks** | **PASS (over-delivers)** |

**Decision**: Do **not** roll back. Do **not** advance to Phase 2 yet. Capture **3 ordinary sessions** before declaring full pass and proceeding to CoD validation.

---

## 1. Sample composition

| Bucket | Sessions | Turns | Date range |
|---|---|---|---|
| Pre-deploy | 177 | 31,058 | 2026-02-17 → 2026-05-01 03:27Z |
| Post-deploy | 2 | 232 | 2026-05-01 03:27Z → 04:59Z |

**Atypicality of post-deploy bucket**:
- `5f418261-15c6-414a-9b8b-1751e1855643` (110 turns) — git-topology migration commit-organization session.
- `1215e706-eaef-4924-884c-c8c56641d7e3` (122 turns) — this Phase 1.4 telemetry analysis session itself.

Neither is an "ordinary" interactive session as the guide assumed (§3.3 step 3 says "Run 3 ordinary sessions post-edit"). Both are heavy-prose, multi-commit, infrastructure-change sessions — exactly the kind of work that produces longer-than-normal assistant text. The output_tokens criterion is not interpretable on this sample.

---

## 2. Cache hit rate — PASS

| Metric | Pre-deploy | Post-deploy | Δ |
|---|---|---|---|
| Token-weighted hit rate (`Σcache_read / Σ(cache_read+eph_5m+eph_1h+input)`) | 93.59% | **89.74%** | -3.85pp |
| Per-turn mean hit rate | 88.72% | 90.16% | +1.44pp |
| eph_1h adoption (turns with non-zero) | 84.63% | **100.00%** | +15.37pp |

**Interpretation**:
- The 3.85pp dip in token-weighted hit rate is the predicted cache-prefix invalidation from inserting Jeeves-Brief at the top of `Jarvis/CLAUDE.md`. Baseline doc §3 explicitly anticipated this. The dip is well within the ±5pp tolerance band.
- Per-turn mean hit rate actually improved slightly. The token-weighted dip comes from a few large turns where the new prefix was being rebuilt; small turns continue to hit cache normally.
- `eph_1h` adoption rose to 100% post-deploy. Every observed turn carried the 1-hour TTL marker, which is the desired state per roadmap §3.0.1.

---

## 3. Register spot-check — PASS (zero violations)

Scanned all assistant text blocks in both post-deploy sessions for AI-assistant patois:

| Pattern | 1215e706 | 5f418261 | Total |
|---|---|---|---|
| "sure", "happy to help", "of course", "I'll just", "certainly", "gladly", "definitely", "great", "absolutely", "I'd be happy", "perfect", "awesome" | 0 / 34 blocks | 0 / 57 blocks | **0 / 91 blocks** |
| Trailing offers ("let me know if", "feel free", "just let me") | 0 / 34 | 0 / 57 | **0 / 91** |
| "sir" usage (positive signal — Jeeves register applied) | 2 / 34 (5.9%) | 0 / 57 (0.0%) | 2 / 91 (2.2%) |

The §3.3 criterion required 5 random samples to be clean. The post-deploy corpus is **comprehensively clean** at 91/91 — far stronger evidence than the criterion required.

`sir` appears organically (sparingly, contextually — not pasted in every response). Identity spec §"Address protocol" says "formal requests / important warnings: add 'sir'; casual: no honorific." The 2 hits in the analytical session both fall in completion-summary positions, which is correct usage.

---

## 4. Output token reduction — INCONCLUSIVE

The §3.3 criterion calls for "20-34% reduction" in median output_tokens. Direct comparison fails:

| Threshold (output_tokens ≥) | Pre median | Post median | Δ |
|---|---|---|---|
| ≥ 0 (all turns) | 25 | 2,147 | +8,488% |
| ≥ 50 | 285 | 2,147 | +653.3% |
| ≥ 100 | 310 | 2,147 | +592.6% |
| ≥ 250 | 562 | 2,147 | +282.0% |
| ≥ 500 | 909 | 2,300 | +153.0% |
| ≥ 1000 | 1,769 | 3,053 | +72.6% |

**Why this is uninterpretable, not a regression**:

1. **Pre-deploy distribution is bimodal**: 56% of pre-deploy turns are 1-49 tokens (likely tool-call-only with empty/short text). Median 25 is dominated by no-text turns, not assistant prose.
2. **Post-deploy turns are all substantive**: 99.6% of post-deploy turns are ≥ 50 tokens. Both sessions are commit-organization and Phase 1.4 analysis — content that requires lengthy prose (commit plans, decision tables, diff explanations, telemetry reasoning).
3. **The populations being compared have different content profiles**, not different verbosity-per-content.

Even at the ≥1000 threshold (where pre-deploy keeps only the heaviest 6.2% of turns), post-deploy is still 72.6% larger — but those are commit-summary and analysis-narrative turns, not "ordinary interactive responses."

**What's needed**: 3 sessions of ordinary interactive work (single questions, small tasks, reactive debugging) post-deploy. With matched-content samples, the brevity directive's effect on prose-per-response can be measured.

---

## 5. Decision (per scratchpad resume sequence step 5)

**Scratchpad rule**:
> If hit rate within ±5pp baseline AND median output_tokens dropped ≥20% → propose Phase 2 (CoD validation).
> If hit rate dropped >10pp → investigate cache-prefix change.

**Actual state**:
- Hit rate: -3.85pp ⇒ within ±5pp band. ✅
- Hit rate: <10pp drop ⇒ no investigation needed. ✅
- Median output_tokens: indeterminate, not a fail.

**Action**:
- ✅ Do **not** roll back Jeeves-Brief.
- ⏸ Do **not** advance to Phase 2 (CoD validation) yet.
- 📋 Schedule a Phase 1.4 rerun once 3 ordinary post-deploy sessions exist.
- 🔁 Until then, treat Phase 1.4 as "Provisional Pass / Insufficient Sample".

---

## 6. Methodological note for next rerun

The output_tokens criterion in the implementation guide assumes matched populations. The rerun follows the new methodology in `projects/project-aion/reports/token-compression-experimental-design.md`:

- Six intent classes (`tool_only`, `brief`, `interactive`, `analysis`, `code_dump`, `structured`) — see design doc §4.
- Per-class median comparison with Mann-Whitney U test and Cliff's delta — see §9.1.
- Pre-registered predictions filed at deploy time — see §8.
- Ordinary-session criterion based on class composition — see §7.3.
- Extractor v2 (Phase 0.3 deliverable) tags turns at telemetry time.

The hit-rate criterion is robust to population differences and remains the primary cache-stability signal in the new protocol as well (see design doc §9.2).

Implementation guide §3.3 is now formally **deprecated** in favor of the experimental-design doc.

---

## 7. Files referenced

- `.claude/metrics/token-compression/cache-telemetry-20260430.csv` (telemetry source)
- `.claude/metrics/token-compression/baseline-2026-04-30.md` (baseline reference)
- `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/1215e706-eaef-4924-884c-c8c56641d7e3.jsonl` (post-deploy session 1)
- `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/5f418261-15c6-414a-9b8b-1751e1855643.jsonl` (post-deploy session 2)
- `projects/project-aion/reports/token-compression-implementation-guide.md` §3.3 (test protocol)

---

*Phase 1.4 Comparison Report v1 — Provisional Pass, awaiting 3 ordinary post-deploy sessions for full sign-off.*
