# Insights Archive — 2026-08-18
# Rotated: 2026-08-19T04:32:18Z (5 entries)

### 2026-07-12 [12a23354115a]

- **Alignment-free, the OCR body is 0.8171 identical** to Genesis 24:12–31 (ſ 55/60 preserved) — vs the 0.5704 "per-verse" mean. The recognizer is doing ~0.82, not ~0.55.
- The per-read drift proves it: OCR of Genesis 24:13 got assigned to the `26/17` slot (oracle best-match 24/13); 24:24 content landed in `30/21`; etc. My **single-page `detect_book` had no neighbouring pages to localize with, so it scattered good OCR across wrong-chapter verse slots** — fabricating the low scores.
- So "recognition-bound / need consensus or vision-LLM" was **my measurement harness failing**, not the model. Real gap on this page is 0.82→0.90, and the user's instinct (adapt per-page, iterate configs) is exactly the right lever to close it.

### 2026-07-12 [2bbc60357f50]

- The user's "take the best config per page" is powerful but needs a *selection signal*. On gold/pilot pages we can select by score against the reference; on the **full work** (no reference) we'd need a reference-free proxy — dictionary-word rate, LM perplexity, or **multi-config agreement** (run N configs as pseudo-witnesses, per-line majority vote). That last option unifies per-page adaptation *and* the consensus lever.

### 2026-07-12 [806e64c8fbc9]

- **Removing every space changes the score by +0.0013 (nil).** So the 0.82→0.90 gap is *not* word-fusion/missing-spaces — and since `fold_archaic` already folds ſ/u-v/i-j/æ/vv, it's not a typography-fold artifact either. **The last "it's just a scoring artifact" hypothesis (a) is refuted.**
- The residual gap is **genuine recognition loss**: glyph substitutions plus a **162-char (~6%) length deficit** — dropped short words / partial lines. That points at recognizer + segmentation levers (rung-2/3), not more normalization tuning.

### 2026-07-12 [8631e692219a]

- I'll transcribe *line-by-line as printed* (not verse-by-verse) so the segmentation ground truth is usable to fine-tune the line splitter. Verse boundaries are marked with the printed `†` glyph the edition uses.
- I'll flag ANY glyph I'm not 100% sure of with a `⟨?⟩` marker rather than silently guess — that's the whole point of a "perfect" reference (uncertain-flagged is honest; silently-guessed pollutes the training set).
- The right-margin has a small annotation (marked with `‖` in body, expanded in margin). I'll transcribe both and preserve the linkage.

### 2026-07-12 [9af613026e0f]

- **Existing OCR is 0.8955 (fold-archaic) / 0.8819 (raw surface) against my perfect transcription** — near the 0.90 bar! The sweep reported 0.8163 vs s_dismas, but that was mostly measuring **s_dismas-vs-printed-page divergence**, not OCR-vs-page accuracy.
- **s_dismas itself only agrees with the actual printed page at 0.8670** — the reference we've been chasing 0.90 against is only 87% faithful to the 1609 print. **The 0.90 bar was structurally unreachable against s_dismas** by ANY recognizer, because s_dismas isn't the printed page.
- **This vindicates your entire ask.** The reason to bench against MY perfect transcription is exactly this: the "reference" (s_dismas) has its own ~13% divergence from what's actually printed. That divergence was being falsely attributed to the recognizer.

