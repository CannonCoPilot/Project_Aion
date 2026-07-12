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
| **2 region-targeted** | fix GLYPH errors at higher DPI (ſ/f, ligatures, u/v) | **Kraken v5 + CATMuS-Print** (preserves long-ſ), **Calamari** ensemble, Tesseract/eMOP |
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
