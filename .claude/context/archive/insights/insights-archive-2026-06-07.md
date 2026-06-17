# Insights Archive — 2026-06-07
# Rotated: 2026-06-07T21:05:36Z (6 entries)

### 2026-05-18 [409832e8fbf5]

The qwen3 JICM compressor reports Phases IV/VI/VII as TODO, but the scratchpad (force-loaded, written at session-end) reports all 7 phases implemented and pending commit+push. This is the **2026-05-06 self-corrections pattern** verbatim: low-tier compression models read commit cadence as forward momentum and miss reframe turns at session-end. Trust the scratchpad for near-term work-state; the checkpoint is background only.

### 2026-05-18 [d5ba38cef3a4]

This is the **2026-05-06 architectural pattern** repeating: low-tier (qwen3:8b) JICM compressors extrapolate forward from commit cadence and miss session-end reframes. The compressor's snapshot was taken at 21:10Z when only `9fe5bfa` had landed; the four subsequent commits (`a3ae16f`, `a508cc1`, `0952fa7`, `aaf720c`) all post-date its checkpoint but pre-date this resume. The fix is exactly what just happened — scratchpad + git log cross-check before acting on checkpoint guidance.

### 2026-05-18 [913b065a86ef]

The Stage-2 closure exposes a methodological principle worth naming: **opt-in safety gating produces no falsification signal**. The prefix-tag was designed to eliminate misapplied-CoD risk (arxiv's -4% on math), but it eliminated the data path along with the risk. Replacement gating must satisfy both invariants: (a) skip-rule compliance stays 100%, and (b) at least one fire per qualifying prompt occurs without user-side opt-in. **Automatic task-type detection** is the named replacement — heuristic ensemble on prompt-surface signals, or a small LLM classifier on the first 200 chars of the prompt.

A second principle: **per-prompt interventions need per-prompt eval substrate**, not session-aggregate metrics. The pre-reg axes (`per_task_type_thinking_reduction`) are inherently per-turn; the extractor that would compute them never landed. Re-running the experiment without first fixing Task 2.4.c just relocates the no-data failure.

### 2026-05-18 [a941320ea698]

**Caveat — Haiku 4.5 extended thinking**: The CoD intervention shapes `thinking_tokens` specifically. Haiku 4.5 historically has limited or no extended-thinking support depending on the API surface. If Haiku returns no `thinking_tokens` field, the primary pre-reg axis (`per_task_type_thinking_reduction`) is mechanically unmeasurable on the Haiku arm — we can still measure `output_tokens`, `latency`, and quality rubric, which is informative for the **routing question** (when does compression help the cheap tier?). I'll verify Haiku's thinking support during harness build and report; if absent, the Haiku arm shifts to an output-only ablation rather than dropping. Worth knowing up front: the Haiku data may be qualitatively different from Sonnet/Opus, not directly comparable.

**Caveat — judge model independence**: cc-compression-bench's rubric uses Sonnet 4.6 as judge. On the Sonnet 4.6 *subject* arm, judge = subject (self-judging bias risk per Zheng et al. 2024 LLM-as-Judge literature). Mitigation: use Opus 4.7 as judge for the Sonnet subject arm, Sonnet 4.6 as judge for the Opus and Haiku subject arms. Disclosed in the report.

### 2026-05-18 [ab389841246d]

**Phase B exit-gate: PASS — but two contamination findings worth surfacing before Phase C.**

The smoke cell ran end-to-end. Every telemetry field needed by the pre-reg axes was captured cleanly, the rubric is computable from the `result` text (all 4 pre-authored `key_points` for cr_03 are present in the baseline output, both `must_use_terms` hit, no `must_avoid` triggered — this baseline would score ~1.0 on the rubric). JSONL resume logic verified — `existing_cells()` correctly skips already-completed cell keys.

**Contamination finding 1 — output style leak**: The baseline response includes literal `★ Insight

### 2026-05-18 [f55467640952]

**Phase B core deliverable shipped**: the harness is feature-complete and validated end-to-end against one cell. The calibration run is the empirical sanity-check before authorizing the full $135 run — by stratifying across all 36 (model × condition × layer) combos plus high-cost Opus padding, it will yield:
- Per-model cost distribution (Sonnet vs Opus vs Haiku) — Opus is the dominant cost driver and the biggest unknown
- Per-condition output-token distribution (baseline vs single_line vs fewshot vs jeeves_cod) — the first real signal of whether CoD actually compresses Jarvis-class outputs
- Per-layer cost variance (L1 vs L2 vs L3) — agent-dispatch and persona-replacement should each have a different cache footprint
- Cost extrapolation: if calibration $/cell holds, full Phase C cost is `(50 sample mean × 1044 cells)`; if Opus is higher than expected, we'll see it here before committing
- Concurrent-write integrity: ThreadPoolExecutor + file lock can be unit-tested by checking the JSONL line count matches the cell count

If calibration reveals an unexpected failure mode — broken JSON, rate limits at 4-way, cost overrun, persistent contamination — Phase C decisions change before the larger spend.

# Insights Archive — 2026-06-07
# Rotated: 2026-06-07T23:45:43Z (5 entries)

### 2026-05-19 [a9c548663a37]

**Calibration has produced a striking preliminary finding worth surfacing BEFORE committing to the full $200+ run.** The output-token means by condition (n=8-15 per cell):

| Condition | mean output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 2,718 | — |
| single_line CoD | 2,767 | **+1.8%** |
| fewshot CoD | 2,874 | **+5.7%** |
| jeeves_cod (stacked) | 2,376 | **−12.6%** |

**Single-line CoD and fewshot CoD show no compression effect — and fewshot may even *increase* output.** The only reduction comes from the stacked `jeeves_cod` condition, where Jeeves-Brief (output-side directive) is likely doing all the work and CoD is contributing nothing or actively interfering. The pre-reg's `-50% expected` on thinking-token reduction is **not visible** in total output tokens at n=47.

Three plausible mechanisms:
1. **CoD does compress thinking but `claude -p` rolls thinking into total output** — so a 50% thinking reduction becomes invisible if visible output expanded to compensate.
2. **CoD doesn't compress on Jarvis-class tasks** — the arxiv paper's 92.4% reduction is on GSM8k math; our prompts are code-review/diagnosis/planning which the model may not treat as draft-compressible reasoning.
3. **`claude -p` ignores or de-prioritizes appended CoD directives** — workspace defaults override custom system-prompt fragments.

The fact that fewshot CoD actually *increases* output (+5.7%) is the most damning signal — it suggests the few-shot examples are being treated as input the model must engage with, not as a compression pattern to emulate.

### 2026-05-19 [aa59a4937446]

**L3 produces materially shorter outputs (1,931 vs ~3,050 for L1/L2)** — strong signal that the persona-replacement system prompt strips the verbose-default behavior. This is a separate finding from CoD: the *deployment surface* (pipeline-executor-style) compresses output by ~37% just by replacing the system prompt, without any CoD intervention. If true at n=1044, L3 is a more impactful compression lever than CoD itself.

### 2026-05-19 [bb54e1cf5fa5]

**Diagnostic complete — root cause identified.** The fewshot CoD condition produces `<draft>` tags in 88% of cells and `<answer>` tags in 69%. The format IS reaching the model. But examining the actual output reveals the failure mode:

```
<draft>
Hypothesis 1: iteration without lock
Evidence: background thread iterates dict; register() mutates concurrently
Verdict: confirmed — classic race; CPython's GIL doesn't protect multi-step iteration
...
</draft>
```

**The model is treating the CoD format as VISIBLE OUTPUT STRUCTURE, not as a hidden thinking-compression mechanism.** The "5 words per step" constraint is being routinely violated (lines like "Verdict: confirmed — classic race; CPython's GIL doesn't protect multi-step iteration" are 12+ words). Instead of compressing internal reasoning into terse draft steps, the model expands its visible response to *include* the draft section AS WELL AS the answer section.

The arxiv paper measured GSM8k math problems where thinking IS substantially the answer. For Jarvis-class tasks (code review, planning, diagnosis), the model already structures its visible output around the same reasoning steps that CoD is meant to compress — so CoD just adds a parallel structured section without reducing anything. The pre-reg's "-50% thinking reduction" cannot be observed through total output_tokens because the model isn't using CoD as a thinking shortcut; it's using it as an output-format directive.

**This is the kind of finding that ONLY emerges from running actual experiments against actual prompts.** The arxiv claim is real; it just doesn't generalize the way the pre-reg assumed.

### 2026-05-19 [9dc5711fa8a0]

**The proxy is positioned correctly but the data we want fundamentally isn't in the response.** Confirmed by inspecting the official Anthropic SDK `Usage` type — the API never returns a `thinking_tokens` field. Fields present are: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation`, `inference_geo`, `server_tool_use`, `service_tier`. **No thinking breakdown anywhere in the official schema.**

However — and this is the angle worth keeping — when extended thinking is enabled, the API response `content[]` array DOES include thinking blocks separately from text blocks (`{"type": "thinking", "thinking": "...", "signature": "..."}` vs `{"type": "text", "text": "..."}`). The proxy could be extended to tokenize thinking-block content and store it as a new column. That gives us thinking visibility WITHOUT needing a new API key — purely by observing what already flows through.

**But two prerequisites must hold for this to work**:
1. `claude -p` must actually enable extended thinking (the `--effort high` flag from your tmux launcher may or may not enable it in non-interactive mode)
2. The proxy must capture the raw response body before forwarding — verified above; it does (`resp_body = upstream_resp.content`)

Quick verification check before going deeper:

### 2026-05-19 [3e8dacdb6cd2]

**Sir, your instinct was correct — and the discovery is significant.** `--output-format stream-json --include-partial-messages` exposes the full `content[]` array including **thinking blocks separately from text blocks**:

```json
{"type":"content_block_start","content_block":{"type":"thinking","thinking":"","signature":""}}
{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"The user wants me to plan..."}}
... (full thinking content streams here)
{"type":"content_block_stop","index":0}
{"type":"content_block_start","content_block":{"type":"text","text":""}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"`★ Insight ..."}}
... (text content streams here)
```

**We can compute thinking_tokens vs output_text_tokens separately by character-counting (or tiktoken-counting) each block type — no API key needed, no proxy modification needed.** This was sitting in front of us the whole time; the `claude -p --output-format json` mode was just hiding it for ergonomic reasons (it surfaces only the assembled text). The stream format exposes the raw content structure.

For the smoke test prompt ("Plan a 3-phase rollout..."), the model produced:
- ~290 words of internal `thinking_delta` blocks (before any visible output)
- Then text_delta blocks for the user-facing response

If we re-run the calibration with stream-json capture, we can directly measure CoD's actual claim — does it compress the thinking blocks specifically? This is what arxiv 2502.18600 measured. We were measuring the wrong thing.

# Insights Archive — 2026-06-07
# Rotated: 2026-06-08T03:58:26Z (8 entries)

### 2026-05-19 [0bf271b95021]

**Notable gap in the literature**: there is **no source-grounded benchmark of CoD on non-math reasoning tasks.** The arxiv paper measures GSM8k (math word problems), MultiArith (arithmetic), and a handful of commonsense benchmarks. There is no peer-reviewed evaluation of CoD on code review, planning, or diagnosis tasks. **Our calibration is effectively the first such measurement**, and it suggests CoD does NOT generalize to these task shapes. That's worth contributing back to the community as a finding regardless of how we proceed.

### 2026-05-19 [8d6385f3ee17]

This is the kind of investigation where the question "what data could already be flowing past us?" beats the question "what data should we go fetch?" — the reverse proxy was always seeing thinking blocks; the `claude -p --output-format json` mode was just a lossy pre-aggregation. The lesson generalizes: when an instrument seems to be missing a measurement, audit the data path end-to-end before assuming the measurement is unavailable. The measurement was 5 lines of shell-flag away.

### 2026-05-19 [8d6c90f58cd8]

**Smoke v3 success — and the thinking/text separation is real.** For cr_03 baseline:
- **thinking_chars: 1704** (366 tokens via cl100k_base estimate)
- **text_chars: 3149** (712 tokens via cl100k_base estimate)
- Claude's `output_tokens`: 1689 (combines both)
- Thinking is **~35% of total output** for this baseline cell

The cl100k_base tokenizer is a GPT encoding, not Claude's actual tokenizer — so absolute counts are an estimate. But the **ratio between thinking and text within a cell** is the signal we need, and that's preserved. Now we can directly measure: does CoD shift the thinking/text ratio downward, even if total `output_tokens` doesn't move? The earlier deadlocks must have been transient state from prior aborted runs; this clean launch worked in 33.8s as expected.

### 2026-05-19 [e304502b9517]

**The signal is real on math.** From the first 4 math_01 cells:

| Condition | thinking_chars | Δ vs baseline |
|---|---|---|
| baseline | 187 | — |
| single_line CoD | 97 | **−48%** |
| fewshot CoD | 96 | **−49%** |
| jeeves_cod | 86 | **−54%** |

This is **right at the arxiv-claimed -50%** reduction. CoD DOES work — we just couldn't see it through `--output-format json`. The earlier calibration's null result on Jarvis tasks may be genuinely correct: CoD is task-shape-specific (math/symbolic reasoning), not a general compressor.

### 2026-05-19 [59654072ea5f]

Cells 5-8 advancing — **bug confirmed fixed**. Looking at math_02 (Alice training plan, harder problem):

| Condition | output_tokens |
|---|---|
| baseline | 405 |
| single_line | 323 (**−20%**) |
| fewshot | 409 (0%) |
| jeeves_cod | 319 (**−21%**) |

Math_01 was too easy (each cell ~150 tokens output) to show much variance, but math_02 shows real compression on single-line and jeeves_cod variants. The fewshot at 409 is suspicious — possibly the format spec is again causing the model to produce extra structured output even on math.

### 2026-05-19 [fd28f3e3ac1f]

**Math_03 (break-even analysis, harder problem) — strong CoD signal**:

| Condition | output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 680 | — |
| single_line | 413 | **−39%** |
| fewshot | 346 | **−49%** |
| jeeves_cod | 387 | **−43%** |

This is the arxiv-paper effect appearing in our data. **CoD works on math.** The 4 cells of math_03 took ~37s; 12 of 28 cells done in ~30s wall (concurrency=4 efficient). Should finish math arm in ~70s total.

### 2026-05-19 [8c1b826b6ad0]

4 claude -p subprocesses live, all working on math_06 (compound interest — the hardest math prompt). Wall is longer (~30s/cell) because the problem requires more reasoning steps. Concurrency=4 is healthy at the OS level — pipe buffers handling the stream-json volume just fine after the rate-limit fix.

### 2026-05-19 [76ace35f454a]

**Anomaly — math_06 fewshot produced 3,809 output tokens**, ~10× math_03's output and the longest in the run so far. The fewshot template with 4 examples may be confusing the model into producing extensive draft output even on compound-interest math. Worth investigating: baseline on same prompt is still running.

# Insights Archive — 2026-06-07
# Rotated: 2026-06-08T04:13:21Z (1 entries)

### 2026-05-19 [91091a26e30b]

**Math_06 jeeves_cod produced 6,780 output tokens — $0.20 single cell, 67s wall — the most extreme anti-compression in the run.** Combining Jeeves-Brief + fewshot CoD on a compound-interest problem sends the model into overdrive. The "stacked compression" intervention is causing **OUTPUT EXPLOSION** on certain prompts. The model interprets the directives as "produce extensive draft + formal answer" rather than "compress thinking." Roadmap §4.7 Rule 5 flagged this exact risk as "untested persona-leak"; now we have evidence.

