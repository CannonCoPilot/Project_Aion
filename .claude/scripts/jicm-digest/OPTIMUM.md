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
