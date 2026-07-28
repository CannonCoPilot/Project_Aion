# JICM session-digest — tuned configuration (2026-07-27)

Distils an ABANDONED pre-`/clear` transcript so the successor session inherits its history.

## Winning config (use this)
```
tdigest.py <sid> --model qwen3-32b-nothink:latest \
  --grounded --reason-cap 300 --temp 0 --npred 2200 \
  --style forensic --focus balanced --size 600
```
**131–142s · recovery 0.857 · hallucination 0.000 · echo 0.000 · no truncation · deterministic**

## Why each flag
- `--grounded` — Python pre-extracts every path/hash/metric into a FACT SHEET (~180 tok) and the
  system prompt restricts the model to it. This is what drove hallucination to zero: the model
  never has to *recall* an identifier. It killed the recurring `SESSION-HANDOFF-2026-07-26.md`
  fabrication (real file is `-07-25`).
- `--reason-cap 300` — trims each reasoning block to 300 chars. **Faster AND better**: 215s→131s
  (−39%) while recovery DOUBLED 0.429→0.857. Long deliberation dilutes signal; the first ~300
  chars carry the conclusion and its identifiers. Cliff edge is sharp: at 150 recovery collapses
  to 0.143.
- `--temp 0` — deterministic; two runs produced byte-identical output.
- `--npred 2200` — headroom so the model stops on its own rather than being cut off.

## Metrics the harness reports
`halluc` (identifiers absent from the whitelist) · `recovery` (share of top-15 salient files named)
· `echo` (Goodhart guard: share of output lines copied verbatim from the fact sheet) ·
`truncated` (hit cap or no terminal punctuation).

## Model verdict — use 32B, not 8B
| | 32B | 8B |
|---|---|---|
| hallucination (ungrounded) | ~2 in 9 runs | 0 |
| **truncation** | never | **runs to cap in most configs** |
| length/style control | obeys | ignores |
| grounded failure mode | — | **echoed the fact sheet verbatim** |
| recovery @ optimum | **0.857** | 0.429 (truncated) |
| time @ optimum | 131–142s | ~58s |
The 8B's apparent advantages were artifacts: its zero-hallucination record came from being cut off
before the synthesis sections where interpolation happens, and its "speed" was partly prompt-cache.

## Traps found while tuning (do not reintroduce)
1. Salience must be counted from CONVERSATION PROSE only. Counting raw records ranks hook files
   (`context-injector.js` 131×) above real work files.
2. The whitelist must be harvested from RAW records (incl. tool params) or legitimate paths are
   flagged as hallucinations.
3. "End with the line `## END`" made both models emit `## END` immediately at temp 0. Removed.
4. A purely prohibitive anti-echo rule scared the 32B off identifiers (recovery 0.571→0.071).
   The instruction must be POSITIVE — use identifiers richly, inside explanatory sentences.

---

# Cross-transcript validation (2026-07-27) — 12 runs, 5 transcripts

| transcript/order | M | time | in_tok | words | halluc | recovery |
|---|---|---|---|---|---|---|
| 91bcac6a/freq | 32B | 395s | 13864 | 689 | 0.000 | 0.786 |
| 91bcac6a/recency | 32B | 144s | 13815 | 539 | 0.000 | 0.357 |
| f56d4d98/freq | 32B | 145s | 17055 | 293 | 0.000 | 0.300 |
| f56d4d98/recency | 32B | 165s | 17014 | 405 | 0.000 | 0.400 |
| bc145f04/freq | 32B | 334s | 29702 | 527 | 0.000 | 0.474 |
| bc145f04/recency | 32B | 372s | 29540 | 710 | 0.000 | 0.842 |
| ca5d3fee/freq | 32B | 323s | 31868 | 325 | 0.000 | 0.450 |
| ca5d3fee/recency | 32B | 362s | 31737 | 665 | 0.000 | 0.550 |
| 01d1ae83/freq | 32B | 485s | **40960 CLIPPED** | 573 | 0.000 | 0.571 |
| 01d1ae83/recency | 32B | 485s | **40960 CLIPPED** | 584 | 0.000 | 0.571 |
| 91bcac6a/8B | 8B | 61s | 13815 | 769 | 0.000 | 0.857 |
| bc145f04/8B | 8B | 85s | 29540 | 441 | 0.000 | 0.474 |

## Conclusions
1. **Hallucination = 0.000 on ALL 12 runs.** Fact-sheet grounding eliminates fabrication across
   both models, both orderings, 13.8K–41K token inputs. This axis is SOLVED.
2. **Recovery is transcript-dominated** (0.300–0.857) — the spread between transcripts dwarfs any
   config effect (ordering means differ by 0.028: freq 0.516 / recency 0.544). Tuning knobs are
   second-order; WHICH session you digest is first-order.
3. **Recency wins 3 of 4 un-clipped transcripts** (+0.10, +0.37, +0.10) and loses only on
   91bcac6a (−0.43) — which is the transcript the config was TUNED on. Beware that outlier.
4. **The 32B-over-8B verdict did NOT survive grounding.** 8B: recovery 0.665 mean in 73s vs 32B
   0.516–0.544 in 305–336s. Better AND ~4x faster, zero hallucination. n=2 only, one truncation
   flag — needs a full sweep before switching, but the earlier verdict rested on UNGROUNDED
   behaviour and grounding appears to close the gap that justified the big model.

## BLOCKERS before ship
- **B1 — SILENT INPUT CLIPPING (critical).** 01d1ae83 (158KB prose) hit num_ctx exactly (40960);
  the runtime clipped the TAIL — the most recent turns, i.e. what a handoff needs most — and the
  run reported halluc 0.000 / trunc False, looking healthy. Both orderings then scored an identical
  0.571 because the same content was missing. FIX: count prompt tokens BEFORE the call; on
  overflow ALERT + escalate num_ctx or trim explicitly with a recorded note. Add `input_truncated`
  alongside the output-side `truncated`. NEVER let the runtime clip silently.
- **B2 — prompt layout.** Fact sheet is currently FIRST, transcript after, so overflow eats the
  newest turns. Put transcript FIRST and fact sheet LAST: fixes truncation semantics AND enables
  prefix-cache reuse (see B4).
- **B3 — output-truncation detector is false-positive prone.** It flags any digest not ending in
  terminal punctuation (leftover from the removed "## END" instruction). Genuine truncation is
  `out_tok >= npred`; loosen the rest.
- **B4 — ordering test is CONFOUNDED.** The recency sheet dropped the "(N×)" mention counts while
  the freq sheet kept them, so ordering and format varied together. Re-run with counts in BOTH,
  varying only order.

## Pre-warm / rolling-digest (measured)
Prompt KV caching is real and large: identical prompt re-run went 142.3s -> 53.1s with
prompt_eval 89.3s -> 0.1s. Two architectures follow:
- **Pre-warm at SOFT threshold**: send the prompt with num_predict=1 to populate the KV cache;
  at HARD threshold only generation remains (~50s instead of ~140s). Requires B2's layout so the
  growing transcript extends a cached prefix instead of invalidating it.
- **Rolling digest (preferred)**: digest incrementally every N turns and merge at clear time.
  In-cycle cost approaches zero, no cache dependency, degrades gracefully, and never assembles a
  giant prompt — which also dissolves B1.

## Further traps found while validating (do not repeat)
5. `sed`/`str.replace` patching FAILS SILENTLY. An earlier sed rewrote `if n>1]`->`if n>=1]`, so a
   later replace on the files block never matched and recency ordering was never applied to FILES —
   invalidating a whole arm of results. Rewrite whole functions; never patch-by-regex a file under
   active iteration.
6. `pkill validate.sh` kills the shell but NOT its in-flight python child, which then appended a
   stale result to the truncated results file. Contaminated line looked legitimate. Kill the
   process group, and stamp result rows with a run id.
7. The recovery metric originally scored against frequency-top-K, giving the freq ordering a
   home-field advantage. Now scored against the UNION of freq-top-K and recency-top-K.

---

# B1 FIXED + full grounded 8B-vs-32B sweep (2026-07-27)

## B1 — silent input clipping: FIXED
Budget is computed BEFORE the call (`num_ctx − num_predict − factsheet − 400`). On overflow the
prose is trimmed **oldest-first** (newest turns survive — they are what a handoff needs), an ALERT
goes to stderr with exact numbers, and the row records `input_trimmed_tok` + `runtime_clipped`.
The FACT SHEET is built from the WHOLE session before trimming, so identifier coverage stays
complete, and a marker tells the model earlier turns were dropped rather than letting it assume it
saw everything. Verified: 01d1ae83 trimmed 2559 tok explicitly; **runtime_clipped=0/10 across the
whole sweep.**

## Sweep — 5 transcripts × 2 models, all grounded, recency, rcap300, temp 0
| transcript/model | time | in_tok | words | halluc | recovery | trim |
|---|---|---|---|---|---|---|
| 91bcac6a/32B | 147s | 13815 | 539 | 0.000 | 0.357 | 0 |
| 91bcac6a/8B | 61s | 13815 | 769 | 0.000 | **0.857** | 0 |
| f56d4d98/32B | 166s | 17014 | 405 | 0.000 | 0.400 | 0 |
| f56d4d98/8B | 50s | 17014 | 711 | **0.125** | 0.700 | 0 |
| bc145f04/32B | 367s | 29540 | 710 | 0.000 | **0.842** | 0 |
| bc145f04/8B | 95s | 29540 | 441 | 0.000 | 0.474 | 0 |
| ca5d3fee/32B | 356s | 31737 | 665 | 0.000 | **0.550** | 0 |
| ca5d3fee/8B | 102s | 31737 | 702 | 0.000 | **0.050** | 0 |
| 01d1ae83/32B | 508s | 39402 | 1061 | 0.000 | 0.333 | 2559 |
| 01d1ae83/8B | 128s | 39402 | 779 | **0.250** | 0.095 | 2559 |

**32B: recovery 0.496 mean, 309s, hallucination 0.000 — 0 of 5 runs affected.**
**8B: recovery 0.435 mean, 87s, hallucination 0.075 — 2 of 5 runs affected.**

## VERDICT: use the 32B. Size-dependent crossover.
| in_tok | 32B rec | 8B rec | winner |
|---|---|---|---|
| 13.8K | 0.357 | 0.857 | 8B +0.50 |
| 17.0K | 0.400 | 0.700 | 8B +0.30 (but halluc 0.125) |
| 29.5K | 0.842 | 0.474 | 32B +0.37 |
| 31.7K | 0.550 | 0.050 | 32B +0.50 |
| 39.4K | 0.333 | 0.095 | 32B +0.24 |

The 8B wins BELOW ~20K tokens and degrades sharply above it — recovery 0.050 on a 31.7K input
(702 words naming almost nothing), and both of its fabrications were on the two largest inputs.
**Abandoned sessions are large BY DEFINITION** — that is why they hit the clear threshold — so the
operating regime that matters is exactly where the 8B fails. Both 8B fabrications were plausible
near-misses of REAL files (`compressed-context-ready.md` for `.compressed-context-ready.md`;
`memory.md`), the failure mode that is hardest for a reader to detect.

Optional: route by size — 8B under ~20K tokens, 32B above. Only worth it if the ~200s saving on
small transcripts matters; the 32B is never wrong, which is the property the ledger depends on.

## Still open
- **B2** prompt layout (transcript first, fact sheet last) — enables prefix-cache reuse. Not done.
- **B3** output-truncation detector still false-positive prone.
- **B4** ordering test still confounded (recency sheet drops the (N×) counts; freq keeps them).
- Recovery ceiling ~0.85; no config reached 1.0 under the neutral metric.

---

# B2 + B3 + B4 resolved — 2×2×5 factorial (2026-07-28)

`sweep-b2b4-2026-07-28.jsonl` — 20 runs, 32B, grounded, rcap 300, temp 0, npred 2200.
Layout {tx,fs} × order {recency,freq} × 5 transcripts. Both factors now vary INDEPENDENTLY.

## B2 — prompt layout: FIXED, and the win is time, not quality
`--layout tx` (default) puts the TRANSCRIPT first and the FACT SHEET last; `fs` is the old layout.

**Prefix-cache reuse is real and enormous.** Within a transcript the two orderings differ only in
the appendix under `tx`, so the second run reuses the cached transcript prefix:

| transcript | tx prompt_eval | fs prompt_eval (control) |
|---|---|---|
| 91bcac6a | 90.7s → **3.5s** | 92.6s → 87.1s |
| f56d4d98 | 124.5s → **2.8s** | 113.3s → 113.3s |
| bc145f04 | 241.1s → **8.5s** | 241.2s → 241.8s |
| ca5d3fee | 269.4s → **7.4s** | 279.0s → 279.0s |
| 01d1ae83 | 388.3s → 389.1s | 388.3s → 370.1s |

Under `fs` the sheet sits at token 0, so changing it voids the entire cache — the control shows
NO reuse in any of the 5. Mean elapsed **tx 236s vs fs 288s**.

**Quality is a wash**: layout marginal 0.446 tx vs 0.408 fs, paired 5 wins / 4 losses / 1 tie.
Adopt `tx` for the time and the truncation semantics, not for recovery.

### NEW BLOCKER — B5: trimming destroys prefix stability
01d1ae83 is the one transcript that got NO reuse, and it is exactly the one that was TRIMMED
(2559 tok). The trim budget is `nctx − npred − len(factsheet) − 400`, so a DIFFERENT fact sheet
gives a different budget, a different trim point, and therefore a different FIRST token — the
prefix diverges and the cache is void. Trimming and prefix-caching are in direct conflict as
built. FIX: compute the budget from a FIXED fact-sheet allowance (a constant reservation, not the
sheet's actual length) so the trim point depends only on the transcript. **This blocks the
soft-threshold pre-warm on exactly the large sessions the pre-warm exists for.**

## B3 — output-truncation detector: FIXED
`truncated` is now solely `out_tok >= npred−2`; the "must end in terminal punctuation" clause moved
to a separate non-verdict `soft_end` field. Across 20 runs: **truncated 0/20, soft_end 1/20** —
that single run (f56d4d98 tx/recency, 478 words, complete) is precisely the false positive the old
detector would have reported as truncation.

## B4 — ordering: DECONFOUNDED, recency retained
The recency sheet now carries the `(N×)` counts the freq sheet always had, so the two differ ONLY
in order. Recency still wins, but weakly: marginal **0.442 vs 0.412** (+0.031), paired **5 wins /
2 losses / 3 ties**. Conclusion unchanged from the validation run — ordering is second-order and
recovery stays transcript-dominated (0.100–0.947 across cells). The earlier confound was not
masking a large effect.

## Best cell — new shipping config
`tx` + `recency` = **recovery 0.527 mean**, the best of the four cells and above the previous
32B best of 0.496. (tx/freq 0.364 · fs/recency 0.358 · fs/freq 0.459.)
```
tdigest.py <sid> --model qwen3-32b-nothink:latest \
  --grounded --reason-cap 300 --temp 0 --npred 2200 --order recency --layout tx
```

## HONEST REGRESSION — grounding is not absolute
`bc145f04 tx/recency` produced **halluc 0.048** — the first non-zero on the 32B in 27 grounded
runs. The invented identifier was `page_NN.json`, a SCHEMA PATTERN rather than a claimed real
file, and it appeared in the run with the highest recovery (0.947) and most identifiers (42 of
them). It is not being exempted from the metric: the standing claim "hallucination = 0.000, this
axis is SOLVED" is now **overstated** and should read *0 fabrications of real-looking specific
files; 1 schematic name in 27 runs*. The correlation worth watching is that it happened in the
run that named the MOST identifiers — richer naming buys recovery and appears to cost a little
precision.

---

# B5 FIXED — fixed fact-sheet allowance (2026-07-28)

`--fs-allowance` (default **900 tok**) replaces `len(factsheet)` in the input budget. The trim
point now depends ONLY on the transcript, so sheet variants — and a session that has GROWN since
the last run — share a byte-identical prefix.

## Root cause, restated precisely
B1's fix and B2's fix were coupled through a variable neither considered. B1 budgeted as
`nctx − npred − len(factsheet) − 400`: correct arithmetic, but it made the transcript's FIRST
token a function of the APPENDIX. On 01d1ae83 the two sheets differ by 14 tokens (354 vs 368),
which gave budgets 37992 vs 38006, different trim points, divergent prefixes, and a void cache.
The trim marker compounded it by interpolating the dropped-token count into the prompt's opening
line — that number ALSO varies with the budget, so it would have re-broken the prefix on its own
even with the trim point fixed. The count now lives only in the result row.

## Verification — `b5-verify-2026-07-28.jsonl`, the transcript that previously defeated the cache
Budget and trim are now IDENTICAL across orders (was 37992/38006 and 2559/2559):
```
ALERT input-budget: 01d1ae83 needed 40472 tok > budget 37460; trimmed 3087 tok oldest-first
ALERT input-budget: 01d1ae83 needed 40472 tok > budget 37460; trimmed 3087 tok oldest-first
```
| | prompt_eval run1 → run2 | elapsed run1 → run2 | recovery |
|---|---|---|---|
| before (factorial) | 388.3s → 389.1s (NO reuse) | 512.2s → 480.5s | 0.381 / 0.333 |
| **after** | 364.4s → **10.4s** | 495.4s → **118.4s** (−76%) | 0.381 / 0.333 |

Recovery is UNCHANGED to three decimals — the cache reuse cost nothing in quality.
**All 5 transcripts now exhibit prefix reuse; pre-warm is no longer blocked on large sessions.**

## The trade this makes, stated plainly
Reserving a constant 900 where the sheet actually needs 354–368 spends ~530 tokens of transcript
window. On 01d1ae83 that trimmed 3087 tok instead of 2559 — ~530 more of the OLDEST turns
dropped. That is the honest price of prefix stability, and it is the right side of the trade: the
lost turns are the least relevant ones, while the cache reuse is worth ~380s on every subsequent
run of a growing session. Measured sheet sizes across all 5 transcripts: 136–368 tok, so 900
carries ~2.4x headroom.

## Guard (No Silent Degradation)
If a sheet ever exceeds the allowance, budgeting against the too-small reservation would overflow
num_ctx and hand clipping back to the RUNTIME — the exact silent failure B1 removed. Instead the
run falls back to actual-size budgeting (correct and safe), records `prefix_stable: false`, and
ALERTs. A recurring alert means the allowance is mis-sized and must be RAISED; it never means the
run is acceptable as-is. New row fields: `factsheet_tok`, `prefix_stable`.
