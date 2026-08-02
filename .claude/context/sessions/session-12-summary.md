# Session 12 — 2026-08-01 · Palimpsest OriginalDR Genesis campaign

**Lane**: `dev-bg-c3014d75` (background) · **Repo**: `Projects/palimpsest` · **Branch**: main
**Board**: 0.8314 → **0.8576** (5,245 / 6,116 achievable) · **Tests**: 202 → **216** green
**Commits**: 5 (`ae385c3`, `5e30f00`, `7d12b48`, `c278634`, `f67479e`) — all unpushed, hold stands at 49

## What was accomplished

**Both background recognizer passes were found already complete** (R2 wrote `R2 PASS COMPLETE` at 23:15 on
07-31; R3 had logged `no chapter ready` every five minutes since 02:44). A full 50-chapter re-measure landed
the board at 0.8543 — the two passes were worth **+139 cells** against **+3** for the same session's
hand-attributed geometry work.

**ch41 was diagnosed by elimination.** It was the last chapter under 0.70, carried as "S1 is a recognizer
problem". Its S1 leaves do carry a real defect the label missed — the patristic margin merged into body rows
— and word-level geometry separates it where row-level analysis (`gutter_probe`, correctly) says OVERLAP,
because `_page_words` has always filtered per word. Eight `PAGE_OVERRIDE` entries added, corroborated by
three independent witnesses of the same opening deriving cuts separately (1749/1753/1733) and removing the
same apparatus fragments. **But the delta against the bound already in force was 18 tokens and +1 cell**, and
S1 did not move at all — so ch41/S1 *is* a recognizer problem, now established rather than assumed.

**`CHAPTER-WORKFLOW.md` was extended with a ROUND TEMPLATE**, synthesized from the ten chapters that crossed
0.90 after Genesis 1 and 16. The document had been distilled from the only two chapters closed by hand-craft,
which is why per-chapter workload had not fallen. From `progression.jsonl`: autonomous passes bought **69%**
of +265 cells, systemic defect fixes **25%**, per-chapter hand work **6%** — for the largest share of the
hours. The governing rule: *hand-work's return is the generalizable defect it exposes, not the cells it
closes.* Added a round loop, a 6-signal router with historical yields, a scope-to-the-defect-class rule
(+41 with 9 regressions vs +38 with zero), and the finding that the passes **hardened** their own residue
(MISREAD fell only 14% and rose to 51.5% of S6's opens).

**Then the template was adversarially reviewed at Sir's instruction, and one of its own rules was wrong.**
See below. Five reference defects were recovered as a direct result: **+20 cells, zero regressions**, no
chapter below 0.70 any more.

## Key insights and error patterns

**The signal-6 self-defeat (the session's most valuable finding).** The router classified "all four sources
fail the same verse" as edition divergence — *"a ceiling, never chase it"*. Both halves were wrong. The
reasoning ("divergence is a property of the page all four photographed, so it cannot fail in one source
alone") is false for S6, which is the **1635 second edition** against 1609 references. And the instruction
binned a bucket containing **five reference defects worth 20 cells**. A taxonomy error would have been cheap;
encoding it as a suppression rule made it self-sealing.

The fix was a discriminator rather than a better label — **the split test**: *if exactly one reference binds
across all four sources while all four pass the other three, the fault is in the reference.* All five found
are `s_dismas` with infixed marginal apparatus that `trim_apparatus` structurally cannot reach (it is
suffix-only and its 1.4× length ratio cannot see a short gloss; 29:15 is 1.10×). Each corroborated twice —
removing the listed phrases yields exactly the other witnesses' token count, and the residue matches
`odr_com` word for word. genesis 41:52 is the archetype: all four sources read it nearly perfectly (S6 at
0.99 on three references) and every one failed on s_dismas alone, which had spliced in Ephraim's name gloss
`Fruitful or` / `Grovving.` and lost the verse tail behind it.

**Two negatives pinned, deliberately.** (1) `reocr_core.MAXW = 2200` hard-downsamples every page — natives
run to 5100×6601, an 81% areal discard, and it is the one constant in the project never swept. Tested at
2200 vs 3400: **flat** (+0.3pp, +0.8pp), because kraken normalizes each line to the model's fixed input
height. (2) The ch8 "modern passes / archaic fails" signature is **not** enriched in S6 (8.4% vs S9's 12.9%)
— `modern_id` is simply a looser fold, so it is not a divergence detector. §13 Q21's detector remains unbuilt.

**Measurement-design failure family (5 instances, all self-caught but one).** A detector whose statistic was
derived from the thing under test (every input returned SEPARABLE); an audit run against an empty baseline
rather than the incumbent (65 tokens → really 18); a board figure re-derived as `n_cells - n_open` instead of
read from `n_pass`, which credits BLOCKED cells as passing — **that one reached Sir as a wrong headline and
had to be retracted**, caught by `build_reocr_report.py` disagreeing. Recorded as SC-A…SC-E.

## Current state and next steps

The board's floor is now set by an **acquisition task, not a reading failure**: the worst chapter is ch23 at
0.700, blocked by `ref_gaps: odr_com` (genesis 23:20 absent). ch26 and ch47 left the worst-seven list.

1. **Hold** — instructed after encoding the five excisions.
2. Next round: the 0.85–0.90 band is one problem wearing sixteen chapter numbers (**S6 worst in 15 of 16**;
   ch12 has S1/S3/S9 at 1.000 and S6 at 0.500). Route through recognition, not chapter-by-chapter.
3. Do **not** re-run the same passes — the residue is a confusion set (f/t, u/v, n/u, s/i, e/o), which is
   R2 fine-tune territory.
4. **Escalate to Sir**: acquire a 1635 reference so S6 is scored against the edition it prints (REFL-033).
   ch8/8:14 has been an unasked policy question for three sessions.
5. One **idle v1 `r3-runner`** survives (pid 85490) — `kill -9` was denied; harmless, documented at the top
   of `CAMPAIGN-STATUS.md`.
