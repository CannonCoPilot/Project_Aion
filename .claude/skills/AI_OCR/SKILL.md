---
name: AI_OCR
model: opus
version: 1.0.0
description: >
  AI-assisted OCR for historical / early-modern printed books — the SOTA method map for the
  OriginalDR (Douay-Rheims) re-OCR ladder. Use when: OCR, re-OCR, OCR improvement, transcription,
  layout analysis, historical OCR, archaic text, long-s / long-ſ, ligatures, vision-LLM OCR,
  post-OCR correction, multi-witness consensus, P3/P4 re-OCR, diplomatic transcription, CER/WER.
---

## When to invoke

INVOKE THIS SKILL before starting ANY OCR-improvement task in the OriginalDR / Palimpsest re-OCR
work (P3 QC harness, P4 whole-work re-OCR, P5 apparatus scoring). It encodes the current state of
the art (2025–2026) mapped onto the project's own re-OCR ladder, so a method is chosen from evidence
rather than guessed. The full distilled research (with citations) is in `reference/sota-findings.md`.

## The one non-negotiable: rung-0 visual gate FIRST

`ocr-spike/reocr_ladder.py` implements rung 0 — it rasterizes the worst-scoring pages to PNGs for
**Jarvis to visually inspect** before any method is chosen. NEVER redesign an OCR method from a score
alone: the score says a page FAILED, never WHY. The eye distinguishes "bad OCR of the right page"
from "good OCR of the WRONG page" (already caught one false localization this way — S14 Psalms-only
scan matched the whole-Bible approbatio). No higher rung fires without a rung-0 sign-off for the locus.

## Ladder × method map (what each rung reaches for)

| Rung | Purpose | SOTA tools (verify before use) |
|------|---------|--------------------------------|
| **0 diagnostic** | rasterize worst pages → visual inspection (MANDATORY GATE) | `reocr_ladder.py` (fitz, content-anchored page resolution) |
| **1 layout-aware** | fix SEGMENTATION errors (columns, marginalia, headers, drop-caps) | **Surya** (layout + reading-order, Apple-Silicon), **YOLOv11-OBB** region typing, **XY-Cut++** column reading order |
| **2 region-targeted** | fix GLYPH errors at higher DPI (ſ/f, ligatures, u/v) | **Kraken v5 + `reichenau_lat`** (VERIFIED ſ-faithful here) · ⚠ local **`catmus-print-large` MODERNIZES ſ→s** (see Verified findings) · **Calamari** ensemble, Tesseract/eMOP |
| **3 vision-LLM** | last-resort transcription of a rasterized region | **CHURRO 3B** / **olmOCR-2-7B** (local MLX), **Gemini 2.5 Pro** (cloud reserve) |

Diagnose the failure class at rung 0, then pick the rung: layout error → rung 1; glyph error → rung 2;
OCR-intractable → rung 3. Do not skip rungs — a vision-LLM on a mis-segmented column still transposes.

## Archaic-faithful vision-LLM recipe (rung 3)

The target is a DIPLOMATIC surface (long-ſ, u/v, "vv"=w, original spelling) at ≥0.90 normalized-
Levenshtein. Vision-LLMs default to *silently modernizing* it. Guard with prompt discipline:
1. Frame as **diplomatic transcription, NOT modernization**: "treat all orthographic choices as intentional."
2. **Name the glyphs** symmetrically: reproduce ſ vs s exactly as printed; **do NOT insert** archaic
   characters that are not visibly present (GPT-4o over-historicizes 59% of files — avoid it here).
3. **Context-enhance**: state document (1582/1609 Douay-Rheims), era, typeface, two-column layout.
4. **Column-crop before the call** — never make the model infer reading order across the gutter.
5. **Reference-ground for CONTENT only**: give the modern DR verse as a content anchor to detect
   dropped/duplicated lines — NEVER as a spelling oracle (the reference must not leak modern forms).
6. Temperature 0; scan output for line-looping and header/marginalia bleed.

## The load-bearing evaluation rule: DUAL-TRACK CER

Any correction/transcription step is judged on TWO metrics, always:
- **Content CER** — NFKC-normalized (ſ→s, etc.) vs the reference — did it get the right words?
- **Surface CER** — raw, no normalization, vs the archaic ground truth — did it keep the period surface?

Our ≥0.90 bar is a SURFACE bar (surface CER ≤ 0.10). A step that lowers content CER while RAISING
surface CER is *modernizing, not correcting* — reject it. (LLM post-correction inflated English CER
by ~23 points purely from modernization; "No Free Lunches." Always compare pre/post surface CER and
discard corrections that worsen it — this is the No-Silent-Degradation guardrail in metric form.)

**Implementation caveat (verified 2026-07-12):** this project's gate metric `char_identity.edit_ratio` runs under `fold_archaic`, which collapses ſ→s BEFORE comparing — so edit_ratio is effectively the CONTENT track and is BLIND to ſ loss. A recognizer that erases every long-ſ can RAISE edit_ratio while destroying the surface. You MUST run a separate ſ check every time: `output.count('ſ')` vs `reference.count('ſ')` plus `long_s_rule`. Near-zero ſ against a ſ-rich reference = modernization = REJECT regardless of edit_ratio.

## Verified on THIS project (empirical, 2026-07-12 — first live rung-1/2 run)

These SUPERSEDE the research claims above where they conflict (verify-before-use, in action):

- **Recognizer: use `reichenau_lat.mlmodel` for the archaic surface; `catmus-print-large.mlmodel`
  MODERNIZES ſ→s.** On Genesis 24 (S1) the reference carries 54 long-ſ; reichenau output 55 (faithful),
  catmus output **0** — every ſ destroyed, despite the research claim that CATMuS-Print preserves long-ſ.
  catmus scored a *higher* edit_ratio (0.889 vs 0.863) ONLY because the archaic fold hides ſ loss. Reject
  catmus for the surface bar; it is content-only here.
- **edit_ratio is ſ-blind — always run the companion ſ-count check** (see DUAL-TRACK caveat above).
- **Rung-1 region suppression is GEOMETRIC, not from kraken labels.** `blla.segment` types only generic
  "text" regions (2 on a scripture page) — it does NOT separate marginalia / running-header / verse-rail.
  Geometry on the recognized lines (running header `y_center < ~0.065`, left signature column
  `x_center < 0.11`, right-margin footnote `x_center > ~0.80`, watermark `y_center > ~0.965`) raised ONE
  isolated page (Genesis 24 S1 p99: 0.846 -> 0.862, +0.016) but DID NOT generalise — see next bullet.
- **⚠ SCORER-VALIDATED — the authoritative result (2026-07-12): uniform geometric suppression is NOT a
  net win; do NOT adopt it.** Folded into `detect_our_ocr.load_stream` and run across the whole pilot
  through `qc_audit`'s per-verse content-anchored scorer (`coverage-audit-verse-rung1.json` vs baseline),
  a SINGLE fixed threshold set helps the polluted layout it was tuned on (genesis S1 +0.067, john S1
  +0.044) but REGRESSES cleaner scans of the SAME locus (genesis S6 -0.048, psalms/77 S6 -0.048,
  matthew/27 S10 -0.066) and dropped Psalms S1/S3 to no-output. Aggregate gate did not move: **6438/6438
  verses still short in both runs; nothing approaches 0.90** (best single-scan archaic ~0.78). Rung-1 was
  REVERTED (`detect_our_ocr.py.rung1-attempt` kept as artifact). Lesson: a uniform x/y band is the wrong
  tool — region typing must be PER-LAYOUT, and re-filtering EXISTING OCR cannot cross the bar.
- **Redesign direction (what CAN reach 0.90):** (1) real re-OCR (segment->recognize) with a per-layout
  region model (Surya / YOLOv11-OBB), not re-filtering old OCR; (2) multi-witness CONSENSUS across the
  4-9 scans per locus — NO single scan clears 0.90, so a reconstructed per-verse consensus
  (`consensus_v2.py`) is the only architecturally-plausible path over the bar. 0.78->0.90 on the surface
  is a recognition + line-segmentation problem, not a body-region-selection one.
- **⚠ RUNG-1 REAL RE-OCR — rigorous single-page result (2026-07-12, Genesis 24 S1 p99, via detect_book):**
  Built Surya `fast_layout` (torch/MPS, NO llama-server; the default `surya.layout` needs llama.cpp) for
  per-layout region typing + kraken/reichenau recognize (`ocr-spike/rung1_surya.py`). Surya correctly types
  the centered running-header (`PageHeader`) and right-margin apparatus (a separate `Text` box) the fixed
  x-band could NOT. Scored through the audit's OWN detect_book on the SAME page/verses: EXISTING diplomatic
  OCR 0.5506 -> Surya re-OCR **0.5704 (+0.020)**, ſ preserved. So the layout lever is REAL and beats existing
  OCR — but small. **300 DPI did NOT help** (0.52 < the 150-DPI 0.57): naive DPI scaling is not a lever, the
  reichenau RECOGNIZER is the ceiling (~0.55 content, DPI-invariant). The 0.55->0.90 gap is
  RECOGNITION-dominated (~0.35); layout contributes only ~0.02. Path to the bar = attack RECOGNITION
  (multi-witness CONSENSUS across the 4-9 scans, and/or a stronger / fine-tuned or vision-LLM recognizer),
  NOT more re-OCR with the same engine. Surya body/margin share the `Text` label -> body = largest-area
  central Text region (works cleanly on Genesis; retune area-fraction for columnar Psalms / degraded scans).
- **Residual gap to 0.90 is (a) footnote text FUSED into body lines** (needs finer LINE segmentation, not a
  geometric line-drop) **and (b) genuine recognition misses** — NOT a ſ problem. Do not reach for a
  modernizing recognizer to close it.
- **Engine reality:** kraken loads `.mlmodel` via **coremltools** (NOT mlx); working venv is
  `originaldr-project/ocr-venv`; models in `ocr-spike/models/`; driver is `ocr-spike/rung1_reocr.py`
  (segment → recognize → geometric suppression → dual-track score).

## Multi-witness consensus (we have several scans of the same text — use it)

Independent scans' OCR errors are UNCORRELATED, so aligned majority voting removes 44–70% of errors
and is orthography-safe. Align differently-paginated witnesses by shared-anchor recursion (RETAS/OCTO
pattern) or per-verse chunks (CollateX), then vote character-by-character with a **period-lexicon
anchor** (EEBO-TCP / VARD) so ties break to the attested archaic form, never the modern one. Do this
BEFORE any LLM pass — it's the safest error-reduction step.

## Local-first stack (Mac Studio, MLX) vs cloud reserve

- **Local bulk**: CHURRO 3B (historical-specialist) + olmOCR-2-7B MLX (dual-model agreement check).
- **Cloud reserve**: route only pages that fail the local quality check to Gemini 2.5 Pro; use
  Claude for lower-hallucination surface-faithful passes. Expect a 2–5pt CER gap local→cloud.
- Layout: Surya + YOLOv11 (Ultralytics) run on Apple-Silicon MPS; no MLX ports yet.

## Preprocessing (do this before ANY rung 1–3)

Deskew (highest single leverage) → 300+ DPI (upsample if lower) → adaptive binarization (Sauvola/Wolf
for bleed-through, else Otsu) → despeckle. Detect + mask drop-caps and running headers before line seg.

## Project bindings

- Ladder tool: `/Users/nathanielcannon/Claude/Projects/palimpsest/core/.scratch/originaldr-project/ocr-spike/reocr_ladder.py` (absolute — `Projects/` is a sibling of `Project_Aion`, so a repo-relative path does NOT resolve from the Jarvis cwd).
- Metric gate: archaic-preeminent, normalized-Levenshtein ≥0.90 (`char_identity.py`).
- Ground truth must be produced under a WRITTEN diplomatic guideline (which glyphs preserved vs
  collapsed) — "an undocumented reference is an undefined target."
- Honor No Silent Degradation: below-bar loci stay OPEN and block the deliverable; a fired safeguard
  ALERTS for approach-redesign, it never accepts the gap.

## Citations & verification

`reference/sota-findings.md` holds the full distilled research with source URLs. Per project policy,
TREAT EVERY CITED MODEL / PAPER / DATASET AS UNVERIFIED until its URL or DOI resolves cleanly — the
pointers came from research agents, not first-hand use. Verify before you build on any specific claim.
