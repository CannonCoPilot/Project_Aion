# Insights Archive — 2026-08-17
# Rotated: 2026-08-17T20:29:24Z (9 entries)

### 2026-07-12 [9493d40707d1]

- A single git diff *hunk* can contain multiple independent logical changes. Here the `@@ -50,13 +53,14 @@` hunk holds three: the P2-envelope edit, the AI_OCR line, and the execution-envelope edit. "Commit the P3 wiring" means committing *one added line* out of that hunk.
- `git add -p` needs interactive stdin (unavailable here), so the clean non-interactive tool is `git apply --cached` with a hand-built patch whose context lines match HEAD. The context lines I'll use (P3-harness line, P4 line) are unchanged vs HEAD, so the patch applies to the index without pulling in the neighboring edits.

### 2026-07-12 [2fb99341f84b]

- **Full verify contract green**: pyright 0/0, `node --check` rc=0 on the 2 MB inline script, faithfulness recompute shows the HTML embedded rung-0 summary EXACTLY equals `diag-reocr/index.json` (5 counts + 9 records + gate string all match). The v9 → v8.1 empirical comparator correctly flagged this as "NO EMPIRICAL CHANGE (PRESENTATION-ONLY)" — v9 adds a sign-off surface, no rescoring.
- The empirical version-compare module Sir installed in v8.1 is now paying off: it says the plain truth about what changed, so a presentation-only v9 can't masquerade as an empirical gain.

### 2026-07-12 [4045ffa5fdfb]

- Kraken's default `blla` found only **2 generic "text" regions** — it does NOT type marginalia/header/verse-rail separately. So region suppression can't come from kraken's region labels; it has to come from geometry.
- The current x-band heuristic (0.11–0.88) correctly kicks out the left signature word `Abralam.` (x=0.07) but **fails on the running header** `GEN ES 1s.` (x=0.46, horizontally centered → wrongly kept as body). The header is distinguishable by *y-position* (top of page), not x. That's the concrete rung-1 fix.
- One coremltools warning fired on model load, yet recognition produced clean text — so inference used a working path. I'll verify the recognizer isn't silently degrading before trusting a score.

### 2026-07-12 [99b3620eaf42]

- On **Genesis** (1667×2342), Surya typed all 3 running-header fragments as `PageHeader` — *including the centered "GENESIS" at xc 0.46* that the fixed x-band (0.11–0.88) structurally could not suppress — and it boxed the **right-margin apparatus** ("Her father hauing perhaps...") as a *separate* Text region from the main body column (xc 0.45), plus the bottom watermark as `Picture`/`PageFooter`.
- On **Psalms** it cleanly typed header/footer/watermark; on the **degraded Matthew** scan it found body blocks + a `SectionHeader` but no header/footer (degradation-limited).
- The key shift: Surya groups *lines into regions*, so body-vs-margin becomes "pick the body region among ~3 boxes" (robust) instead of "which of 50 lines by x-position" (the band that failed). Body and marginalia share the `Text` label, so selection among Text boxes is still geometric — but now by region area/centrality, which is exactly the per-layout fix.

### 2026-07-12 [f9cf398bd694]

- **The layout lever is real**: on the same image with the same recognizer, Surya body-region selection beats the fixed x-band by **+0.0205** (0.5499 → 0.5704), measured through the audit's own `detect_book` scorer. Surya dropped 9/50 lines (running header + right-margin apparatus + watermark) and preserved ſ. The redesign direction is validated.
- **But it's small, and resolution bites**: my re-OCR of the *downscaled 1667w diag raster* scores 0.55–0.57, which is **below the existing full-res OCR's 0.6153** for the same Genesis S1. So re-OCR only pays off at *full resolution* — and even then, the layout lever (+0.02) can't close a 0.62→0.90 gap that is **recognition-dominated**, not layout-dominated.

### 2026-07-12 [fb1edcba56e5]

- At 300 DPI: baseline 0.5228, surya 0.5177 (Δ **−0.005**). Higher DPI did **not** help, and the layout lever flipped sign — so on a single page the ±0.02 "lever" is within noise, not robust.
- More important: my kraken+reichenau re-OCR scores ~0.52–0.57 *content identity* regardless of DPI. The **recognizer is the ceiling**, not layout or resolution.
- But I've been comparing kraken-vs-kraken — I never scored the **existing diplomatic OCR** through this same single-page path. The "existing = 0.6153" figure is from the full audit (all pages, different verse set), so it's not a clean comparison. I must fix that before concluding.

### 2026-07-12 [8f97b87e501a]

- The earlier "0.6153 existing" was a *different verse set* (full audit, all pages). On the actual page, existing OCR is 0.5506 — so Surya re-OCR genuinely **beats existing by +0.020**, measured apples-to-apples. The layout lever is real and positive.
- **But it's ~0.02 against a 0.35 gap to the bar.** Existing≈0.55, re-OCR≈0.57, bar=0.90. The gap is **recognition-dominated**; the reichenau recognizer ceilings ~0.55 content regardless of DPI (300 DPI was *worse*). Layout and DPI are not the levers to 0.90 — a stronger recognizer and/or multi-witness consensus are.

### 2026-07-12 [ef7856660071]

- **Wrong recognizer for the language**: `reichenau_lat` is a *medieval Latin* model, but this text is *early-modern English* ("I beseech thee, and doe mercifully with my maister Abraham"). A Latin language-model/letterform prior on English is a systematic error source — not an intrinsic ceiling.
- **Likely input mismatch**: kraken warns these are *legacy* models (expect binarized, fixed line-height ~48px input). I feed un-binarized grayscale, and 300 DPI being *worse* than 150 is the classic signature of line-height/scale mismatch, not a recognition limit. Both are fixable pipeline faults, not ceilings.

### 2026-07-12 [026ff70a34fe]

- The **well-aligned verses recognize beautifully**: v18=0.980, v24=0.976, v21=0.955, v16=0.917, v14=0.907. Example v18 OCR "Vho anſwered Drinke my lord And quickly she let dovne the tankard vpon her arme and gaue him drinke" vs REF — near-perfect, ſ intact. **reichenau is NOT the ceiling.**
- The **low-ratio "verses" are a measurement artifact**: e.g. `[v17] ratio=0.224` pairs OCR about "the daughters of the inhabiters" (real Genesis 24:13 content) against a REF "againe he digged other welles" — which is **Genesis 26:18**, a different chapter. My single-page `detect_book` hack has no surrounding pages to localize with, so it smears the page's OCR across verse slots in chapters 24/25/26/30/11 and scores good OCR against unrelated refs.
- So "~0.55, recognition-bound" was **my harness mis-aligning**, not the recognizer. On correct alignment this page is ~0.85–0.98 — near/above the 0.90 bar.

