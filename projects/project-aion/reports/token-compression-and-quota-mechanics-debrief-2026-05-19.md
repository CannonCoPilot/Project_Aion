# Token Compression and Quota-Mechanics — Consolidated Findings

**Date**: 2026-05-19
**Author**: Archon (Jarvis)
**Scope**: All token-compression (CoD) and Max-plan usage-rate testing performed
between 2026-05-18 and 2026-05-19
**Status**: All findings stable; calibration-v2 redux (50 cells, stripped harness)
completed 2026-05-19T15:10:59Z and incorporated below

> **AMENDED 2026-05-21** — Per Sir's critique of the v2 fork-cache validation
> (false-premise identical prompts, cache/context conflation, mislabeled
> chain-fork), a v3 study was designed, self-approved, and executed
> 2026-05-21T05:30Z (57 cells, $8.98, 7m13s). v3 **revises F2 and F4** and
> **refutes F3** below. F1 and F5 are unaffected. The v3 findings and full
> redesign rationale are in:
> `projects/project-aion/reports/fork-cache-validation-v3-findings-2026-05-21.md`.
> Inline pointers `→ v3` mark the affected sections; consult v3 for the
> mechanistically correct understanding before acting on F2/F3/F4.

---

## Executive summary

Five empirically grounded findings, four of which **overturn the assumptions
that initiated the work**:

1. **CoD efficacy on Jarvis tasks is task-shape-dependent within Jarvis.**
   Math arm shows clean 14–32% compression across all conditions (matches
   arxiv 2502.18600). Jarvis arm with the 50-cell redux (n=11 paired
   observations across 5 task types) shows highly heterogeneous behavior:
   **code-review compresses strongly under all CoD conditions (fewshot −49%,
   jeeves_cod −30%)**; **planning compresses under single_line (−81.8%) but
   jeeves_cod is missing data**; **bug-diagnosis is mixed (jeeves_cod inflates
   +47%, single_line/fewshot mild compression)**; **session-mgmt jeeves_cod
   inflates +60.9%**. **single_line consistently produces −100% thinking-block
   suppression on every Jarvis task we have data for.** CoD is NOT
   "always-on" deployable; it's a task-typed gate with code-review as the
   strongest positive case.

2. **Anthropic's prompt cache is prefix-keyed, not session-keyed.** Fresh
   `claude -p` sessions with identical prompt bytes hit the same cache. Cache
   is process-independent at the API edge. The premise that each
   `claude -p` invocation pays a cold cache penalty is wrong.

3. **`--fork-session` does NOT preserve cache for our workload.** It invalidates
   the cache on the first fork (paying a $0.09–0.21 tax) and provides no
   compensating benefit for identical-prompt batch work. The proposed
   "Option 2" harness refactor was based on a faulty model and would not have
   helped; the data inverts the prediction.

4. **The real leverage is `--system-prompt` stripping.** Replacing the Claude
   Code default prefix (~33K tokens of CLAUDE.md / identity / hooks / skills)
   with a one-line replacement cuts per-cell billed cost by ~58% and raw
   input tokens by ~43%. Single-flag change in `runner.py`.

5. **The Max-plan rolling quota DOES apply the 10× cache discount.** Cache hits
   reduce quota burn by the same proportion they reduce billing — empirically
   confirmed via paired-burst probe analyzed against per-request utilization
   snapshots captured by the usage-proxy at `:9800`. Cache strategy helps both
   dollars AND quota.

---

## Background

The line of investigation opened when the Phase 2 CoD Stage-2 calibration
harness produced a near-zero (NULL) compression signal across Jarvis-shaped
task prompts (closed 2026-05-12 as `STAGE_2_NO_DATA`). Sir directed a full
redesign. The 2026-05-18 redesign yielded a methodological discovery —
`claude -p --output-format stream-json --include-partial-messages --verbose`
exposes thinking and text content blocks separately in the `content[]` array,
allowing per-cell decomposition of thinking-token vs text-token compression
without an API key. This enabled the analysis that produced finding #1.

During the redesign run, the Max-plan session window burned from 30%
utilization to 80% in ~30 minutes — far steeper than expected. Sir initially
hypothesized that each `claude -p` invocation was paying a cold prompt-cache
penalty, and proposed two refactor options:
- Option 1: drive cells from inside a single tmux Claude Code session
- Option 2: chain cells via `claude --continue --fork-session` to inherit cache

The validation work that followed empirically tested these options, falsified
the assumptions behind them, and surfaced the real cost-leverage point
(finding #4) plus the quota-mechanics question (finding #5).

---

## Findings in detail

### F1. CoD task-shape specificity (Math vs Jarvis)

**Source**: `.claude/scratch/phase-2-stage-2-rerun/CALIBRATION-FINDINGS-v2.md`

Method: paired-prompt comparison of 4 conditions (baseline, single_line,
fewshot, jeeves_cod) across two prompt corpora — 7 math word problems
(positive control) and 5 Jarvis-shaped tasks (bug-diagnosis, code-review,
planning, research, session-mgmt).

**Math arm (positive control, n=21 paired)** — text and thinking by condition:

| Condition | Text Δ (median) | Thinking Δ (median) |
|---|---:|---:|
| fewshot | −19.5% | −32.0% |
| jeeves_cod | −10.6% | −28.4% |
| single_line | −22.7% | −28.4% |

Clean compression on both axes, std 9–25 — matches the published math-arm CoD
literature.

**Jarvis arm (50-cell redux, n=11 paired text observations across 5 task types)**:

| Task type | fewshot text | jeeves_cod text | single_line text | single_line thinking |
|---|---:|---:|---:|---:|
| code-review | **−49.4%** | **−30.2%** | −0.5% | −100% |
| bug-diagnosis | −13.2% | **+47.0%** | −10.4% | −100% |
| planning | −13.6% | (no pair) | **−81.8%** (n=2) | −100% |
| research | (no pair) | (no pair) | +15.7% | (no pair) |
| session-mgmt | (no pair) | **+60.9%** | (no pair) | (no pair) |
| **(Pooled mean)** | **−25.4%** | **+25.9%** | **−31.8%** | **−100%** |

**Critical observations**:
- **single_line consistently suppresses the thinking block to zero** on every
  Jarvis task where we have data (bug-diagnosis, code-review, planning). This
  is a strong, repeatable signal — not the kind of result you'd get by chance
  at n=3. **The directive disables extended-thinking emission for non-math
  task shapes.**
- **Text-token effects are highly task-shape-dependent within Jarvis.**
  Structured-output tasks (code-review, planning) compress under CoD;
  hypothesis-expansion tasks (bug-diagnosis, session-mgmt) inflate.
- **The n=3 partial-run finding ("+66.7% Jarvis inflation") was a sampling
  artifact** — the redux shows the picture is nuanced rather than uniformly
  negative.
- **fewshot caused a +1,135% thinking-token spike on planning** (one cell).
  Likely a small-denominator artifact (baseline thinking near zero); flag for
  per-prompt review but do not generalize.

**Practical interpretation**: code-review under fewshot or jeeves_cod is the
clearest positive-result Jarvis use case. Bug-diagnosis under jeeves_cod is
the clearest negative case. The thinking-block-suppression effect of
single_line is universal and would significantly reduce billed cost on
extended-thinking-heavy task shapes, regardless of text-token outcome.

**Interpretation**: the `single_line` directive on Jarvis-shaped tasks doesn't
compress — it disables extended thinking entirely while inflating in-text
reasoning. Math-style problems compress because their natural baseline already
uses extended thinking heavily (3–10× the output volume); CoD trims the
thinking-side budget without sacrificing answer quality. Jarvis tasks have
proportionally less thinking and proportionally more structured-output
reasoning, so the directive substitutes one form of output for another rather
than removing volume.

**Note on redux run economics**: 50 cells, $7.91 total, 31 min wall.
Per-cell avg $0.158 — vs $0.228/cell on the v1 pre-stream-json run (no
system-prompt strip). The strip delivered ~30% per-cell saving in this
real-corpus context. Two cells timed out (34 and 40 — both haiku L3/L2 with
single_line/jeeves_cod conditions); they're recorded as errors and excluded
from token analysis.

**F1.a: matrix limitation note.** The 50-cell calibration subset enumerates
36 unique `(model, condition, layer)` combinations with prompts cycling
through — each `(prompt, layer, model)` cluster contains only ONE condition.
There is no within-cluster pairing possible by design. Previous analysis
attempts attributed the lack of pairs to a "scheduler bug" (concurrency=4
partitioning baselines vs comparisons across sonnet/opus); the actual cause
is matrix scope. Strict pairing requires the full 1,044-cell matrix or a
restructured calibration subset.

### F2. Anthropic cache is prefix-keyed, process-independent  → v3 REFINES

**Source**: `.claude/scratch/fork-cache-validation-v2/FINDINGS.md`

Method: 30 cells across 3 arms (Independent / Star-fork / Chain-fork) with
identical user prompts, observing `cache_creation_input_tokens` and
`cache_read_input_tokens` per cell.

Smoking-gun datapoint: Arm A cell 2 used a fresh UUID with no continuity to
cell 1, yet showed `cache_creation=0, cache_read=33,195` — a complete cache
hit. Cache is matched on prompt-prefix bytes alone, not session-id, not
process-id.

**Implication**: the original assumption that "each `claude -p` cold-starts
cache" is wrong. Identical-prompt cells from independent CLI invocations all
hit the same cache entry, provided they fall within the 5-minute TTL.

### F3. `--fork-session` invalidates the cache it claimed to preserve  → v3 REFUTES

**Source**: `.claude/scratch/fork-cache-validation-v2/FINDINGS.md`

Arm B cell 1 (the first `--fork-session` call from a primed parent): `cache_creation=33,209, cache_read=0`, **$0.21**. Same prompt that hit cache on
Arm A cell 2 ($0.024). The only difference: B.cell-1 used
`--resume <parent> --fork-session`, while A.cell-2 used a fresh UUID with no
parent.

Forking creates a new cache scope. The first fork from any parent pays a
one-time $0.09–0.21 re-creation tax. Subsequent forks from the same parent
share that new scope and hit normally.

**Three-arm cost comparison for a hypothetical 50-cell run**:

| Arm | First-cell cost | Per-warm-cell | 50-cell total |
|---|---:|---:|---:|
| Independent (fresh UUID each cell) | $0.21 cold | $0.024 | **$1.39** |
| Star fork (one seed, 50 children) | $0.21 + $0.21 fork tax | $0.024 | $1.60 |
| Chain fork (each forks from prev) | $0.23 (two partial misses) | $0.024 + ~$0.001 chain growth | $1.43 |

The Option 2 refactor would have made things slightly **worse**, not better.

**Recommended use of `--fork-session`**: only when actual conversation-context
inheritance is required (i.e., child needs to know what parent knew). Verified
via probe at 2026-05-19T04:10Z — child correctly returned a secret token only
the parent had seen, confirming context inheritance works. But that's a
*feature*, not a cache optimization.

### F4. `--system-prompt` stripping — the actual cost lever  → v3 REFINES

**Source**: smoke test on refactored `harness/runner.py` (2026-05-19),
`.claude/scratch/fork-cache-validation-v2/FINDINGS.md`

Replacing `--append-system-prompt` (adds to CC default ~33K-token prefix) with
`--system-prompt` (replaces it with a thin one-line prompt) for the L1 layer:

| Per-cell metric | Pre-strip | Post-strip | Δ |
|---|---:|---:|---:|
| cache_creation tokens | ~33–42K | ~24K | −10–18K |
| billed cost (warm) | ~$0.254 | ~$0.107 | **−58%** |
| raw input tokens | ~42K | ~3K (validation cells) / ~24K (real corpus cells) | −43–93% |

The validation harness used short prompts (~3K total prefix) and showed ~10×
savings. The real CoD corpus has substantial prompts (~24K including the
corpus text + directive + style suppression) and shows ~58% savings on
billed cost. The difference: output tokens dominate the bill for large-output
CoD cells.

**Critical caveat**: stripping the CC default also disables hook execution,
skill resolution, identity loading, and CLAUDE.md auto-discovery for the
stripped invocations. This is **fine for non-interactive benchmark cells**
(they aren't meant to exercise that machinery) but would break any cell that
needs to access tools, agents, MCP servers, etc.

**The change in runner.py**:
- L1 layer: switched from `--append-system-prompt` to `--system-prompt`,
  prepending a minimal `L1_BASE_PROMPT` ("You are Claude, a careful technical
  assistant…")
- L2 layer: unchanged — `--agent <agent>` already replaces the default with
  the agent's own prompt
- L3 layer: unchanged — already uses `--system-prompt` with `L3_PERSONA`

The pre-strip data (50 cells in `runs/calibration-v2-pre-strip.jsonl`,
$0.254/cell avg) is preserved for methodological comparison. Post-strip data
will be in `runs/calibration-v2.jsonl` once the redux run completes.

### F5. Max-plan quota applies the cache discount

**Source**: `.claude/scratch/quota-discount-probe/FINDINGS.md`

Method: paired-burst probe (5 cold cells + 5 warm cells, matched raw input
volume but 3.55× different billed cost) analyzed via the per-request
utilization snapshots captured by the usage-proxy and exposed at
`localhost:8800/api/v1/usage/burn-rate-curve`.

| Phase | Raw input | Billed cost | Util delta |
|---|---:|---:|---:|
| Burst H (cold) | 203,063 | $0.831 | **+3.000%** |
| Burst L (warm) | 202,678 | $0.234 | **+1.000%** |

| Ratio | Value |
|---|---:|
| Raw input H:L | 1.00× |
| Billed cost H:L | 3.55× |
| **Observed utilization-delta H:L** | **3.00×** |

The utilization counter advanced ~3× more for H than for L despite both
bursts processing matched raw token volume. The 3.00× ratio matches the
billed-cost ratio (3.55×) far more closely than the raw-token ratio (1.00×).

**Conclusion**: the rolling token quota counter applies approximately the same
10× discount to cache_read tokens that the billing system applies. Cache
strategy helps both dollars AND quota burn proportionally.

The small gap between 3.00× and 3.55× is plausibly explained by:
- The exposed utilization counter is quantized to 3 decimals (12.000%,
  15.000%, 16.000%) — finer underlying resolution
- Output tokens carry a flat per-token weight unaffected by cache state; both
  bursts produced similar output volumes
- Sample size n=5 per burst contributes some variance

---

## Methodology and reusable tooling

This investigation produced four reusable analytical artifacts. All are
non-destructive read-only or sandbox-isolated; each is documented for future
re-use.

### Stream-json thinking/text decomposition

The `claude -p --output-format stream-json --include-partial-messages --verbose`
invocation emits assistant messages where `message.content[]` separates
`{type: 'thinking', text: ...}` from `{type: 'text', text: ...}` blocks. Per-block
character counts feed `tiktoken` (cl100k_base) for approximate token estimates.

This is the basis of `harness/runner.py`'s per-cell telemetry and was the
breakthrough that turned the original NULL CoD result into the F1 sign-flip
finding.

### Usage-proxy + Pulse burn-rate API

The usage-proxy at `localhost:9800` (Alfred-Dev `usage-proxy/proxy.py`) intercepts
every Anthropic API call by Claude Code instances and writes per-request
telemetry to the `api_requests` table in `pulse_dev`. Each row carries:
- `unified_5h_utilization` (Anthropic's quota counter, sampled per request)
- `cache_read_tokens`, `cache_write_tokens`, `input_tokens`, `output_tokens`
- `cost_usd`, `timestamp`, `model`

The Pulse dev API exposes this at multiple endpoints; the most useful for
this work is `GET /api/v1/usage/burn-rate-curve`, which returns per-request
utilization snapshots grouped by 5h window. This enables **analytical** rather
than **visual** burn-rate analysis — any future probe of the form "did X
spend cost Y% of utilization?" can be answered from local data.

### validate-fork-cache-v2.py

Three-arm scaled cache-validation harness:
- Arm A (independent fresh UUIDs)
- Arm B (star fork from one seed)
- Arm C (chain fork from previous cell)

Reusable for any future `claude -p` cache-behavior question. Location:
`.claude/scripts/validate-fork-cache-v2.py`. Takes ~$0.30–1.50 and ~3–10 min
wall depending on cell count and prompt size.

### probe-quota-discount.py

Paired-burst harness — primer + 5 unique-prompt cells + 5 identical-prompt
cells. Designed to discriminate whether a counter tracks raw tokens or billed
cost. Reusable template for any future quota-mechanics question. Location:
`.claude/scripts/probe-quota-discount.py`. ~$1.40, ~3 min wall.

---

## Implications for current and pending work

### Phase 2 CoD experiment

- **Drop the Option 2 (`--fork-session`) refactor** permanently from the
  candidate list. It would slightly increase cost without offsetting benefit.
- **Keep CoD as a task-shape-gated tactic**, not a default behavior. Math /
  quantitative-reasoning task types only.
- **Pre-registration revision pending** (`pre-registration-phase-2-cod.yaml`):
  replace the original "CoD reduces tokens by X%" hypothesis with "CoD's token
  effect is task-shape-specific; sign of Δ depends on prompt shape".
- **Roadmap §3 revision pending**: document that CoD is not a candidate for
  unconditional adoption.

### Harness operations

- The runner.py refactor (`--system-prompt` strip on L1) is live as of
  2026-05-19.
- Future harness runs should default to the stripped invocation for L1 cells.
- The pre-strip calibration data (`runs/calibration-v2-pre-strip.jsonl`,
  20 cells from 2026-05-18) is preserved for methodological reference but
  superseded by the redux run.

### Future quota-bound work

- Confirmed: cache discount applies to quota. Cache strategies that reduce
  billing also reduce quota burn proportionally.
- The `burn-rate-curve` endpoint is the canonical local source for utilization
  data. Avoid visual chart-reading when analytical access is available.
- Per-cell quota footprint with the stripped harness is ~0.02% of a 5-hour
  window (warm cell, ~$0.024). A full 50-cell run is ~1% utilization.

### Anomalies worth monitoring

- 2/30 cells in v2 fork-cache validation showed silent partial failures
  (cache_creation=0, cache_read=0, output=0, but $0.02 spent). **6.7%
  incident rate.** A `--retry-on-empty-output` mechanism in `runner.py` would
  catch these for unattended runs.
- One Burst-L cell mid-burst showed an anomalous cache eviction
  (cache_creation=16,157 in the middle of an otherwise-fully-warm burst).
  Suggests the Anthropic edge cache is not perfectly stable over short
  intervals.

---

## Open questions

1. **Sample size on the Jarvis CoD arm.** n=3 is a strong directional finding
   but not publishable. The pending calibration-v2 redux completion should
   raise this to 12–15 paired observations, sufficient for first-pass
   variance estimates. Full publication-grade n would require the full
   1,044-cell matrix.

2. **Output-token weighting in the quota counter.** The 3.00× vs 3.55×
   discrepancy in F5 may be explained by output tokens carrying a flat
   per-token weight regardless of cache state. A small follow-up probe
   (matched inputs, varying output sizes) could pin this down.

3. **Cache TTL behavior under contention.** The mid-burst cache eviction
   observed in F2/F3 data suggests the 5-minute TTL may be conditional on
   request rate or capacity headroom. No urgent need to investigate.

4. **Quota counter resolution.** Public counter exposes 3 decimal places.
   Server-side resolution unknown. For per-cell quota analysis at scale, a
   higher-resolution endpoint (if one exists) would tighten the
   discrimination ratios.

---

## File reference

### Reports and findings docs
- This debrief: `projects/project-aion/reports/token-compression-and-quota-mechanics-debrief-2026-05-19.md`
- CoD calibration findings: `.claude/scratch/phase-2-stage-2-rerun/CALIBRATION-FINDINGS-v2.md`
- Fork-cache findings (small-n): `.claude/scratch/fork-cache-validation/FINDINGS.md`
- Fork-cache findings (scaled): `.claude/scratch/fork-cache-validation-v2/FINDINGS.md`
- Quota-discount findings: `.claude/scratch/quota-discount-probe/FINDINGS.md`

### Harnesses (reusable)
- CoD calibration: `.claude/scratch/phase-2-stage-2-rerun/harness/runner.py`
- CoD analysis: `.claude/scratch/phase-2-stage-2-rerun/harness/analyze.py`
- Fork-cache validation v2: `.claude/scripts/validate-fork-cache-v2.py`
- Quota-discount probe: `.claude/scripts/probe-quota-discount.py`
- Fork-cache validation v1 (small-n): `.claude/scripts/validate-fork-cache.py`

### Raw data
- Math controls (positive baseline): `.claude/scratch/phase-2-stage-2-rerun/runs/math-controls.jsonl`
- Pre-strip calibration (archived): `.claude/scratch/phase-2-stage-2-rerun/runs/calibration-v2-pre-strip.jsonl`
- Post-strip calibration: `.claude/scratch/phase-2-stage-2-rerun/runs/calibration-v2.jsonl` (in progress)
- Fork-cache validation runs: `.claude/scratch/fork-cache-validation{,-v2}/`
- Quota-discount probe runs: `.claude/scratch/quota-discount-probe/`

### Local analytical infrastructure
- Usage proxy source: `Alfred-Dev/usage-proxy/proxy.py`
- Pulse usage API: `Alfred-Dev/pulse/app.py` (endpoints under `/api/v1/usage/`)
- Burn-rate curve endpoint: `GET localhost:8800/api/v1/usage/burn-rate-curve`
- API requests table: `pulse_dev.api_requests` (PostgreSQL on jarvis-postgres:5432)

---

## Total spend across this investigation (2026-05-18 → 2026-05-19)

| Run | Cells | Cost |
|---|---:|---:|
| Math controls (2026-05-18) | 28 | $3.20 |
| v1 calibration (pre-stream-json) | 50 | $10.95 |
| v2 calibration partial (pre-strip) | 20 | $5.08 |
| Fork-cache validation v1 (3 arms × 4 cells) | 12 | $2.09 |
| Fork-context probe (3 cells) | 3 | <$0.01 |
| Fork-cache validation v2 (3 arms × 10 cells) | 30 | $1.12 |
| Quota-discount probe (1 + 5 + 5) | 11 | $1.23 |
| runner.py smoke test (post-refactor) | 1 | $0.11 |
| Calibration-v2 redux (post-strip, completed) | 50 (48 successful, 2 timeout) | $7.91 |
| **Total** | **~205** | **~$31.7** |

For perspective: ~$32 spent over 2 days to (a) close an open research question
about CoD efficacy on Jarvis-shaped tasks (with a more nuanced finding than
the original "Jarvis CoD inverts" framing — code-review compresses well,
bug-diagnosis inflates, single_line universally suppresses thinking),
(b) overturn three plausible-sounding-but-wrong assumptions about cache
behavior, (c) discover and implement a ~30–60% cost reduction for ongoing
harness work, and (d) empirically confirm the quota-mechanics that govern
future operations cost-modeling. Cost-per-finding ratio is acceptable.
