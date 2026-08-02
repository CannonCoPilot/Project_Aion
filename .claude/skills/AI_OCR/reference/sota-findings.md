# AI-OCR SOTA findings (2025–2026) — distilled research for the OriginalDR re-OCR ladder

Compiled 2026-07-11 from four parallel deep-research passes (vision-LLM OCR, historical OCR engines,
layout analysis, post-OCR correction/consensus). **Every model / paper / dataset / URL below is
RESEARCH-SURFACED, not first-hand verified.** Per project policy ([[feedback_verify_citations_before_attributing]]),
resolve a URL/DOI before building on any specific claim. Where a source could not be verified by the
research agent it is flagged.

---

## 1. Vision-LLM transcription (rung 3)

**Ranking (CER on 18th-c. historical print benchmark, arXiv:2510.06743):** Gemini 2.5 Pro 3.36% <
Gemini 2.5 Flash 4.94% < Qwen2.5-VL-72B 5.81% < Claude 3.5 Sonnet 6.79% < GPT-4o 9.23%.
- **GPT-4o over-historicizes 59% of files** (inserts archaic chars not present) — do NOT use as
  primary for diplomatic targets. Claude 3.5 Sonnet has lower hallucination + good CER = safer when
  surface fidelity is the constraint.
- Multimodal post-correction (image + text) reached sub-1% CER (Gemini 2.0 Flash on Transkribus
  output, arXiv:2504.00414): the image gives visual grounding, turning correction into mismatch-finding.

**Self-hostable (Apple Silicon / MLX):**
- **CHURRO 3B** (Stanford OVAL, EMNLP 2025, arXiv:2509.19768) — purpose-built for historical print,
  155 corpora / 22 centuries, NLS 82.3% printed, 15.5× cheaper than Gemini 2.5 Pro. Best local bulk model.
- **olmOCR-2-7B** (arXiv:2510.19817) — MLX 6-bit (6.4GB) / 8-bit (8.4GB); needs 1288px render + toolkit
  metadata prompt for headline scores. Good dual-model agreement partner.
- **Qwen2.5-VL-7B / Qwen3-VL-8B** via mlx-community — general fallback / third reading.

**Prompting recipe (evidence-backed):** verbatim diplomatic framing ("respond ONLY with extracted
text"); name preserved glyphs symmetrically (preserve ſ/s as printed AND don't insert absent archaic
chars); context-enhanced prompt (doc/date/typeface/layout) gives significant CER gains; full-page >
sliding-window, but column-crop two-column pages first; reference-ground for content only
(arXiv:2410.13305). AVOID unconstrained LLM post-correction ("No Free Lunches" arXiv:2502.01205;
arXiv:2510.06743 both found it degrades) — only reference-grounded/multimodal correction is safe.

**Failure modes → detection:** silent modernization (Qwen: "Antient"→"Ancient") → dual-track CER +
per-character freq audit; over-historicization → diff vs conservative reference; plausible fabrication
on degraded glyphs (arXiv:2605.27750) → dual-model disagreement + perturbation test; column transpose
→ pre-crop; header/marginalia bleed → pre-mask; drop-cap out-of-order → separate crop; looping → temp 0.

Sources: arXiv:2510.06743, 2504.00414, 2509.19768, 2510.19817, 2602.14524, 2410.13305, 2502.01205,
2605.27750, 2601.14490 (GutenOCR region-reading), 2502.13923 (Qwen2.5-VL).

---

## 2. Specialized (non-LLM) OCR engines (rung 2)

- **Kraken 5 + eScriptorium** (ICDAR 2025) — PRIMARY. Trainable segmentation + recognition for
  historical scripts. `ketos train` fine-tunes from a period base on a few hundred GT lines.
- **CATMuS-Print** (Zenodo 2024: records 10592716 / 10602307 / 10602357) — the only broadly-available
  Kraken model documented to **preserve long-ſ, u/v, i/j** and not resolve abbreviations. Best cold-start.
  Also **McCATMuS** (Zenodo 13788177, incl. English 16th c.+).
- **Calamari / OCR4all** — strongest ensemble accuracy (0.114% CER w/ voting on antiqua); LAREX gives
  interactive two-column + marginalia segmentation. `antiqua_historical_ligs` variant handles ligatures.
- **Tesseract 5 + eMOP** — `Early-Modern-OCR/TesseractTraining` (GitHub) has EEBO/ECCO-era typeface
  training assets (Tesseract-3 era format; may need conversion). eMOP EEBO accuracy 68% was scan-quality-limited.
- **Transkribus** (Text Titan I ~2.95% CER multilingual) — SERVICE only, weights proprietary; use for a
  first benchmark pass, not a locally-owned solution.
- Datasets: **GT4HistOCR** (Zenodo 1344132, 313k lines German Fraktur + Early Modern Latin — antiqua
  subcorpora typographically comparable to 16th–17th c. English roman type).

**Preprocessing impact order:** deskew (5° = −10–15% acc) > 300–400 DPI > adaptive binarization
(Sauvola/Wolf for bleed-through) > despeckle > drop-cap masking. PreP-OCR (arXiv:2505.20429): Tesseract
CER 5.87%→1.99% after restoration. All runnable on Apple-Silicon CPU/MPS except Transkribus (cloud).

Sources: MDPI Electronics 2025 (Kraken+ByT5), Kraken v5 ICDAR 2025, arXiv:1807.02004 (Calamari),
1809.05501 (GT4HistOCR), eMOP DocEng 2013, 2505.20429 (PreP-OCR).

---

## 3. Layout analysis + reading order (rung 1)

- **Surya** (datalab-to/surya) — all-in-one layout + **first-class reading-order** field + OCR; runs
  on Apple Silicon (Surya 2 via llama.cpp Metal). Caveat: MPS kernel bug on long docs (issue #490) —
  process pages singly (fine for our per-page ladder).
- **YALTAi / YOLOv11-OBB** (arXiv:2506.20326) — best on COMPLEX historical layouts; OBB is "a
  fundamental requirement" for non-Cartesian pages. `magistermilitum/YOLO_manuscripts` (HF) has an
  `Initial` class for drop-caps + Paratext for headers/marginalia. Fine-tune on ~30–50 DR pages. Native MPS.
- **XY-Cut++** (arXiv:2504.10258) — reading order for two-column body; handles L-shaped/bridging content
  (chapter arguments spanning columns at page bottom = our exact failure mode). Run on body-column boxes
  ONLY (suppress non-body regions first so drop-caps/arguments don't mask the gutter).
- **Marginalia anchoring**: no model assigns marginal notes to verse anchors; use a proximity heuristic
  (marginalia box vertical centre → nearest body baseline in same column). Transkribus "Marginalia
  Monarch" detects boxes (mAP 68%). **Drop-cap re-attach**: YOLO emits `Initial` box → send to a
  single-char classifier/VLM (NOT full OCR — engines fail on 10× glyphs) → prepend to the adjacent line.
- Dataset for fine-tuning: **LADaS 2.0** (arXiv:2411.10068, 7254 pages 1600–2024, TEI categories).
- **CHURRO** doubles as a full-page reading-order-correct fallback when layout confidence is low.

Two-stage recipe: (1) YOLOv11-OBB region typing → (2) XY-Cut++ reading order within body → per-region
OCR/VLM with headers suppressed. RT-DocLayout (arXiv:2606.23344) is the emerging unified SOTA (watch;
not yet stable-released).

Sources: surya GitHub + issue #490, arXiv:2506.20326, 2504.10258, 2411.10068, 2509.19768, 2601.07483
(FocalOrder), 2405.11757 (DLAFormer).

---

## 4. Post-OCR correction + multi-witness consensus

- **Multi-witness voting** is the safest error reducer (44–70% CER cut, orthography-agnostic). Align
  differently-paginated witnesses via **RETAS/OCTO** (shared-anchor recursion; Wemhoener/Yalniz/Manmatha
  ICDAR 2013, UMass CIIR) or per-verse **CollateX** (PyPI). Vote char-by-char with a **period-lexicon
  anchor** (EEBO-TCP / VARD) so ties break to the archaic form. Neural variants: multi-input attention
  (ACL 2018 P18-1220), perplexity-selection (EMNLP 2021 2021.emnlp-main.680 — selects among candidates,
  can't do worse than best input), ROVER voting (arXiv:2607.00250, 70% CER cut).
- **Reference-anchoring without leak** (arXiv:2410.13305): reference = CONTENT anchor (what it should
  say), never a spelling oracle; fix only words present in the OCR, keep period orthography. Derive the
  correction lexicon from period sources ONLY — mixing modern + historical spellings pulls toward modern.
- **DUAL-TRACK CER (critical):** content CER (NFKC-normalized) for word-correctness; surface CER (raw)
  for period fidelity. Our ≥0.90 = surface CER ≤0.10. Any step that lowers content CER while raising
  surface CER is modernizing → reject. Without normalization, LLM correction inflated English CER by
  ~23 pts (No Free Lunches). TrOCR errors (visual ſ→s/f) are more recoverable than Qwen's silent
  lexical normalization (arXiv:2602.14524).
- **QA**: ISRI confidence intervals (arXiv:1701.07395) — route pages whose CI crosses 0.90 to human
  review. Track correction provenance per stage (arXiv:2603.00884) to locate where a below-bar loci fails.
- **Diplomatic guideline first** (RIDGES arXiv:1608.02153; GT4HistOCR): fix which graphemes are
  preserved vs collapsed BEFORE annotating; the ≥0.90 reference must be built under that guideline.

Recommended passage pipeline: recognize per witness (Kraken/eMOP) → RETAS voting w/ period-lexicon →
conditional multimodal LLM correction (image + archaic-preservation prompt) only if still above bar,
reject if surface CER worsens → verse-level reference alignment for completeness → dual-track accept.

Sources: arXiv:2502.01205, 2504.00414, 2602.14524, 2410.13305, 2607.00250, ICDAR 2013 (OCTO/RETAS),
ACL 2018 P18-1220, EMNLP 2021, TACL Neural OCR Post-Hoc, 2603.25761 (metrics survey), 1701.07395,
2603.00884, 1608.02153, 1809.05501.

---

## Action items surfaced (for P4 planning, not yet executed)

- [ ] Build a calibration set of 20–30 DR pages w/ known ground truth (EEBO-TCP is public domain) to
      measure ACTUAL CER/NLS per model before committing a pipeline.
- [ ] Cold-eval CATMuS-Print Large + CHURRO + olmOCR-2 on that set; compare to current archive.org OCR.
- [ ] Confirm archive.org scan DPI per witness before assuming 300 DPI for region re-OCR.
- [ ] Write the diplomatic transcription guideline (grapheme preserve/collapse table).
- [ ] Implement per-character (ſ, u/v, ligature) frequency audit to catch silent normalization.

---

## 2026-07-21 UPDATE — per-SOURCE redesign (consensus removed from the ladder, Sir)

Deep-research pass (13 claims adversarially verified 3-0; synthesis step hit session limit, merged by hand).
Full output: session task `wckpo8fq3.output`. Report Artifact: https://claude.ai/code/artifact/6f8cccac-cacd-44d7-a0cd-5d89b51bc8ee

**Reframe:** the ladder improves ONE source's OCR vs gold, per page — NOT an aggregate/consensus (Sir ruled
consensus/voting-across-sources OUT of the ladder). Metric must be per-source and honest.

**THE decisive finding — recognizer fine-tuning is the provable workhorse (redesigns "Rung 2"):**
- OCRopus LSTM on period GT → CER **0.02–0.05**, BELOW the 0.10 target (arXiv:1809.05501, 3-0).
- Fine-tune from a historical-Latin BASE → Early-Modern Latin **CER 1.47%** (arXiv:2106.07881, 3-0).
- Transfer from Latin mixed model → **−43% err @60 gold lines, −26% @150** (arXiv:1712.05586, 3-0).
- Calamari book-specific on **~50 lines → ~10% CER** vs ~50% generic (arXiv:1807.02004, 3-0).
- Run WITHOUT dictionary/LM → archaic surface (ſ,u/v) preserved by construction (1807.02004). We HAVE gold lines.

**Within-image voting (in-scope, NOT cross-source):** 5-fold confidence vote on the SAME image cuts Calamari
CER 0.155→0.114% (1807.02004, 3-0). Surface-safe. = new "Rung 2.5".

**Preprocessing/SR:** naive distortion/perceptual SR is char-error-blind → won't reliably lower CER; must be
TEXT-AWARE (arXiv:2510.26339, 3-0). PreP-OCR −64–70% but on DEGRADED docs, compound, no surface CER (2505.20429).
Our pages are clean → SR is a lever for the ~800px scans ONLY.

**Local vision-LLMs:** CHURRO 3B open-weight, 82.3% NLS printed (~0.18 CER avg) fine-tunable (2509.19768, 3-0);
olmOCR-2 = 7B Qwen2.5-VL, MLX-runnable (allenai, 2-0). Both ABOVE 0.10 alone → bulk/base, not drop-in. Claude
vision (0.95–0.99 surface, this project) stays the reserve ceiling.

**Redesigned per-source ladder:** 0 diagnostic (keep) · 1 targeted preprocessing (800px-only, text-aware) ·
**2 transfer-learned recognizer fine-tuning (THE lift to ≤0.10, local, surface-safe)** · 2.5 within-image voting ·
3 vision-LLM gated (CHURRO/olmOCR-2 bulk, Claude residual). Build order: fix metric → Rung 2 → Rung 1(800px) →
2.5 → 3. CAVEAT: most fine-tune numbers are on gothic incunabula/Latin, not DR roman+italic — measure on our type.
