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
