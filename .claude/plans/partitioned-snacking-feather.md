> **⚠ SUPERSEDED 2026-07-08 by `partitioned-watching-dijkstra.md`** (folded into sparkling-petting-gosling.md §0′).
> The locus-level QC contract replaces this 4R mirror: coverage = realized-quality per locus, double-bind
> forward/backward gating, char-level identity, contiguity localization, book-level gates removed. Retained for
> evidence trail only — do NOT execute from this file.
> **Where the two still-live 4R items landed:** **R3** (two-stage MSA: scan-consensus → cross-register) → **P6**;
> **R10** (per-coord witness-usage / denominator) → **P0** provenance spine (`master-source-list.json` + `source_index.py`).

# OriginalDR — Phase 4 Course-Correction (2026-07-07): Two-Stage Consensus, Apparatus-First, Full Depth

> **Merge target:** this plan folds into `/Users/nathanielcannon/Claude/Jarvis/.claude/plans/sparkling-petting-gosling.md`
> as **"Revision 2026-07-07"** + a rewrite of **§12 (Phase 4 — the hard path)** sub-phases. It does not fork a
> standalone effort; it re-sequences and sharpens the existing hard-path plan against concrete gaps found on review.

---

## Context — why this revision

The whole-Bible consensus v2 is **built and verified** (`consensus-full/`, 76 books, 37,130 verses):
modern **0.9542** (74/76 gate), archaic **0.8968** (52 scored / 29 gate), conservation **0.8739**. But Sir's
review surfaced that execution again took a cheaper path than the master plan's stated standard (§0 aims 2–3:
apparatus first-class, no fallbacks, **every** witness at ≥2× depth). Empirical investigation this session
confirmed the gaps are real, and several are **my prior claims being wrong**:

- **Architecture is a flat MSA** — every OCR'd scan dir is a co-equal witness voted alongside the 5 transcribed
  texts; there is **no OCR-consensus stage**. Sir wants scans consolidated into one weighted scan-witness.
- **Apparatus is not in the consensus at all** (`consensus_v2.run_book` iterates `scripture/` coords only) —
  directly contra §0 aim 2 / §4.5 / §12.2.
- **The hi-res sources Sir supplied were benched**: `S02` (1609 OT hi-res, 652 MB) OCR'd only **10 pages**;
  `S08` (1582 NT hi-res, 725 MB) OCR'd **0 pages** — the low-res archive scans are used *instead of* them
  (deprioritized for ~35 s/page decode). The "old/weak" scans were **not** replaced.
- **Sabates has all 76 books** incl. 3/4-Esdras + Manasses (madueke 73, s_dismas 52) — so the apocrypha
  "modern fails" are versification/depth, **not** a missing reference.
- **Madueke is modernized** (0 long-s marks) — it *cannot* extend the archaic reference (I earlier implied it
  might). True ſ-diplomatic reference (s_dismas) covers **0/24** later-OT books; odr_com (ſ-normalized) 7/24.
- `modernize()` only folds ſ/æ/œ/⁊/ꝫ — not u/v, i/j, vv/w, capitals → a modern-layer fallback token can read
  "Heauen". Per-source `coverage_recall` is only 0.65–0.88 → 12–35% of each scan's verses silently don't contribute.
- **The "every source is used" check was validated against the wrong denominator.** "No available-but-unused
  gaps" was measured against `tome-map.json`, which is *built from* the OCR output — so it structurally cannot see
  sources never OCR'd (S02/S08). That is why "every known source used at the OCR level" and "S02 got 10 pages, S08
  got zero" are both true yet appear contradictory: they measure different universes. **Fix: build a canonical
  MASTER SOURCE LIST from the files/data on disk and tally every witness's usage against *that*, not the derived
  tome-map.** Against the master list the gaps (S02, S08, holiebible-ot2, per-verse recall shortfalls) are visible.

**Intended outcome:** a two-stage weighted consensus over **all** sources (scans consolidated, hi-res included),
covering **scripture + apparatus + matter** within every book/chapter/section, with an archaic layer built from
archaic witnesses and cleaned by the modern consensus, honest+measurable quality everywhere, and a whole-work
source-overlay map. Hold commit/push per §11.

---

## Part 1 — Conceptual resolutions (fold into the work below)

**R1 · Typography fold = comparison-key canonicalization, NOT text recasting (confirmed; keep).**
`archaic_tok` folds v→u, j→i, vv→w *only inside the metric*; the stored `archaic_reading` is the verbatim
winning surface (ſ/u/v/j intact). Both sides of the difflib comparison get the same symmetric fold, so it counts
u≡v / i≡j as synonymous substitutions for % identity without editing either text. Action: **document only.**

**R2 · Archaic layer redesign — archaic-consensus-then-modern-clean.** Current archaic = `max(archaic_score)`
among fold-winners (a single pick that can select a garbled high-ſ surface). New: (a) build an **archaic
sub-consensus** column-by-column from ſ-bearing witnesses only (scan-consensus + s_dismas + odr_com); (b) **error-
correct it with the modern consensus** — where the archaic sub-consensus letter-stream disagrees with a high-
confidence modern fold, correct the letters while **preserving archaic orthography** (ſ/æ/œ and positional u-v/i-j).
Implement as a spelling-preserving projection modern→archaic driven by the R4 rule table run in reverse.

**R3 · Source vs Witness — two-stage hierarchical MSA (Sir's core directive).**
- *Definitions:* **SOURCE** = one physical printing/transcription (an S1 volume, S02, an EEBO vol, sabates, …).
  **WITNESS** = an aligned reading stream entering a consensus vote.
- *Stage 1 — scan consolidation:* MSA **all** original-printing scans at each coord → **one** ſ-preserving
  **scan-consensus** reading + a **per-scan variant catalog** + a scan-agreement score. Variants-by-witness are
  cataloged **here** (we do not need per-individual-scan variants in the final record).
- *Stage 2 — cross-register consensus:* MSA the single scan-consensus witness against the transcribed witnesses
  (sabates=modern, s_dismas=archaic, madueke, odr_com) → final two-layer consensus + conservation.
- *Weighting:* scan-consensus enters Stage 2 with a **deliberate weight** (function of scan depth/agreement),
  not N incidental equal votes — fixes "how many scans happen to cover a book" silently setting the scan/text
  balance.

**R4 · Robust `modernize()` ruleset.** Extend beyond ſ/æ/œ/⁊/ꝫ to a **position-aware** table: vv→w; vocalic-u
vs consonantal-v ("haue"→"have", "vpon"→"upon"); i/j ("Iesus"→"Jesus"); capital V/I/J; and a cataloged set of
residual archaic spellings not normalized by Sabates. **Derive** the table empirically from aligned
(sabates ↔ archaic) token pairs; apply as a **surgical post-pass only on fallback tokens** (columns with no
modern witness). Validate the pass against Sabates (must not regress modern % identity).

**R5 · Apparatus into the consensus (Sir's "uh oh").** *Terminology (Sir):* **"apparatus" is the umbrella for
ALL non-scripture text** — used both plurally (the individual apparatus) and singularly (the whole apparatus
group). It includes **frontmatter and backmatter sections** (title pages, censura, approbatio, prefaces, "To the
Right Welbeloved", "The Summe / Significance of Numbers", tables, glossaries/indices, running heads) **as well as**
book arguments, chapter arguments/annotations, footnotes/marginal notes, chapter headers, and cross-references.
**Every apparatus must be included in this revision** — the matter-region content is not a separate track, it is
apparatus. The master plan already requires this (§0 aim 2, §4.5, §12.2); execution skipped it. Extend
MSA/consensus/%id/conservation to **all apparatus channels** *within each book/chapter/section and each
frontmatter/backmatter component*, sourced from:
apparatus-cross-map (madueke_b transcribed apparatus ↔ scan marginalia, **1333/1334** already cross-attested),
odr_com apparatus (**not** in `odr_com.json` → ingest from the raw originaldouayrheims.com scrape), **Sabates
modern apparatus** as the modern %-identity baseline, and region-typed OCR'd scan marginalia. Same two-layer +
conservation output per apparatus block.

**R6 · Use the cross-map to align+clean apparatus** (yes) — it drives the apparatus MSA the same way the
skeleton drives scripture.

**R7 · Layout-aware re-OCR (Sir's "B").** Poetic/wisdom books (Psalms/Proverbs/Job/Canticle/Ecclesiastes) and
any columnar / verse-per-line / marginal-heavy / tabular (genealogies, title pages) layouts are mis-segmented by
kraken baseline. Visual-audit → column detection + verse-line handling + marginal separation → **targeted
re-OCR** of affected pages/sections across **all** scan sources; re-tune region-typing.

**R8 · Un-bench the hi-res sources.** OCR **S02** (hi-res 1609 OT) and **S08** (hi-res 1582 NT) fully; optimize
decode (pre-extract embedded images, single downscale, parallelize) to tame the 35 s/page cost. They become the
**primary** (highest-quality) witnesses for their coverage; low-res archive scans stay as added depth.

**R9 · EEBO + file reorganization.** EEBO = *Early English Books Online* (ProQuest facsimiles via Anna's Archive)
= sources **S10–S15** ("Original Douay-Rheims Bible" NT + vol_1..5). Reorg on disk (**archive, never delete**):
one `sources/` tree grouped by source — S1(3 vols), S2, S3, S4, S5, S6, S7(→ archive as byte-dup of S6), S8, S9,
**EEBO-NT** (S10 own group), **EEBO-OT** (S11–S15 one group) — plus transcribed source folders: **Madueke** (a+b),
**Janvier/Sabates**, **s-dismas**, **odr_com**. *Correction (Sir):* the two `Original-Douay-Rheims-Bible*.pdf`
files in `Original/` are **NOT** unknown provenance — they are the **Madueke source documents**
(`…-Merged.pdf` → Madueke_b, bare `…-Bible.pdf` → Madueke_a); group them under the **Madueke** source folder.
Archive genuine dups (S07=S06 sha-dup; `_3093`=S12 dup). **Exclude Haydock AND Challoner entirely** — no Haydock
or Challoner edition is a source for this work (Haydock = 2014 annotated edition; remove from `sources/`, do not
treat as a witness). Rewrite the manifest with sha256 + group + provenance + role, keyed to the master source list.

**R10 · Are all covering witnesses used everywhere? (Sir's "C/D") — VERY HIGH PRIORITY.** The prior "zero
available-but-unused gaps" was validated against the tome-map (a derived, OCR-only universe) and is therefore
**not trustworthy**. Re-validate against the **master source list on disk** (per the Context reconciliation). Real
leaks: (a) per-source `coverage_recall` 0.65–0.88 → many verses fail locate/attest and silently don't contribute;
(b) upstream un-OCR'd/under-OCR'd sources (S02/S08 hi-res, holiebible-ot2, any missed pages) never enter at all.
Fix: raise locate/attest recall so **every covering witness contributes at every coord it truly attests**; OCR the
missing sources; emit a **per-coord witness-usage map**; assert the tally against the master source list and drive
coverage toward completeness. Sir flagged this as **very high priority.**

**R11 · Apocrypha modern "fails" have a reference.** Sabates covers 3/4-Esdras + Manasses. 3-Esdras 0.880 /
4-Esdras 0.877 are versification drift and/or thin-noisy scans (only ot2-1610/S03b/S06 cover them). Diagnose
versification vs Sabates, add depth, re-score → expect modern pass.

**R12 · Archaic measurement for the 24 unmeasurable books (no fabrication).** No ſ-diplomatic reference exists
past Wisdom. Solution: (a) score archaic vs **odr_com where present** (7 books), ſ-folded so we measure spelling
(u/v, æ) not ſ-placement; (b) validate **ſ-placement everywhere by the deterministic long-s typographic rule**
(ſ initial/medial, s final, digraph exceptions) → rule-conformance is a measurable archaic-quality signal needing
no reference; (c) report the remainder as "archaic produced · ſ rule-validated · spelling-reference-capped."

**R13 · Apparatus pass bar (concur).** Sabates supplies modern apparatus for most components → %-identity baseline;
conservation via the same MSA math on apparatus spans; per-block agreement threshold anchored to the **reference-
copy (S1 three-volume set)** matter placement (Q2 — agreed authority; each volume's own frontmatter = its own
section slot).

**R14 · Additional gaps found on reflection.** (i) `coverage_recall` per-source is a hidden depth leak (R10a).
(ii) Reference-copy authority (S1 3-vol) must become the Tier-2 matter-placement ground truth in `build_tome_map`.
(iii) **Source-overlay visualization** (Sir wants, three tiers): (1) a source × book/section **matrix** showing
where each source is leveraged for consensus / correction / quality-estimate — quick win now as text/HTML;
(2) a **genome-browser-like figure in the report** — each source a track across the whole work, showing
alignment/overlap/coverage depth (per §7.2); (3) *future* — an **interactive browser-track group** in the product
so the user can visually investigate source reference alignment/overlap of reconstructed texts (Sir's model: a
KJV-1611-style multi-witness track viewer). Build (1)+(2) this revision; scope (3) as a follow-on deliverable.

---

## Part 2 — Work sequence (Sir's order: First → B → A → C/D)

**Phase 4R·0 — First (design + safe prep, low risk):**
- Build the **canonical MASTER SOURCE LIST** from disk (every scan printing + every transcription + their files,
  sha-pinned) — the authoritative denominator for all usage tallies (reconciles the R10 contradiction). Excludes
  Haydock/Challoner categorically; maps the two `Original-DR*.pdf` to Madueke a/b.
- Lock the two-stage MSA (R3), archaic-clean (R2), `modernize` rule table design (R4), apparatus-consensus design
  (R5/R6/R13), and measurement approach (R11/R12) as concrete specs.
- **File reorg + manifest rewrite** (R9) — archive-not-delete; keyed to the master source list; do now for a clean base.
- Emit the **source-overlay leverage matrix** (R14iii-1) for immediate visibility.

**Phase 4R·B — layout-aware re-OCR (the unlock):**
- Visual audit of columnar/poetic + unusual-layout pages across sources.
- Layout-aware segmentation (columns, verse-lines, marginal separation) + region-typing tune.
- **OCR hi-res S02 + S08** (R8) and any un-OCR'd sources (holiebible-ot2, missed pages); re-OCR affected pages.
- Ground-truth score vs held-out transcriptions (§6.4); emit `ocr-eval.json`.

**Phase 4R·A — apparatus into the basis (first-class):**
- Ingest odr_com apparatus scrape; wire Sabates apparatus; consume region-typed scan marginalia from B.
- Extend `consensus_v2` to apparatus channels: MSA + two-layer + conservation + %id-vs-Sabates per apparatus
  block, within each book/chapter/section.
- Reference-copy (S1) Tier-2 matter placement in `build_tome_map`.

**Phase 4R·C/D — depth completeness + full re-score:**
- Implement the consolidated **scan-consensus** stage (R3 Stage 1) + weighted Stage 2.
- Raise locate/attest recall (R10a); guarantee every covering witness contributes per coord; emit witness-usage map.
- Diagnose+fix apocrypha modern (R11); apply archaic measurement for the 24 (R12).
- **Re-run whole-Bible** (scripture + apparatus); re-score all gates; regenerate deliverables.

**Cross-cutting deliverables:** master source list; source-overlay matrix + **genome-browser-like report figure**
(R14iii-2) + per-source accounting + confidence/error map (§7); the `modernize` rule table; updated manifest;
long-s rule validator; per-coord witness-usage map. *Follow-on:* interactive browser-track group (R14iii-3).

---

## Part 3 — Critical files (reuse-first; representative, not exhaustive)

- `ocr-spike/consensus_v2.py` — two-stage MSA (`consensus()` → split into `scan_consensus()` + `cross_consensus()`),
  archaic-clean projection, apparatus channel driver, R11/R12 measurement. Reuse existing `conservation()`,
  `align_to_anchor()`, `ref_chapter_tokens()`, `fold_tok`/`archaic_tok`.
- `.../acquisition/ocr_pipeline.py` — hi-res decode path (S02/S08), layout-aware segmentation, un-OCR'd sources.
- `ocr-spike/build_tome_map.py` — designate S1 three-volume set as reference-copy Tier-2 authority (`matter_regions`).
- `ocr-spike/apparatus_crossmap.py` — odr_com scrape ingest, Sabates apparatus arm, feed apparatus consensus.
- `.../reconstruction/detect_our_ocr.py` — locate/attest recall improvements (R10a).
- **New:** `modernize_rules.py` (R4 table + long-s validator), `source_overlay_map.py` (R14iii),
  `odr_com_apparatus_ingest.py` (R5).
- Data: `sources/dr-sources-manifest.json` (rewrite), `reads/*.json`, `tome-map.json`, `apparatus-cross-map.json`.

---

## Part 4 — Verification

- Anchors (**genesis**, **matthew**) re-pass both gates after each phase (regression guard).
- Whole-Bible re-score: **modern ≥ 0.90** targeting 76/76 (incl. apocrypha after R11); **archaic ≥ 0.85** where
  measurable **+ ſ-rule-conformance** elsewhere (R12); **apparatus** per-block bar (R13).
- `pyright --outputjson` 0/0 on every touched module; QC sample book + apparatus files by eye.
- Source-overlay map shows **100%** of the work covered with **no unleveraged covering witness** at any coord.
- **HOLD commit/push per §11** until proven; then one conventional commit set (Co-Authored-By Claude Opus 4.8 (1M)).

---

## Part 5 — Merge + state updates (executed after approval)

1. **Merge** this into `Jarvis/.claude/plans/sparkling-petting-gosling.md`: add "Revision 2026-07-07" atop §0 and
   rewrite §12.1–§12.5 to the 4R·0/B/A/C-D sequence above (per Planning-Doc-Discipline: update the existing plan,
   don't fork).
2. **`.active-plan`** (both `Jarvis/.claude/context/` and `Project_Aion/.claude/context/`) → point at the merged plan.
3. **Scratchpad** (`Project_Aion/.claude/context/.scratchpad.md`) → new top block: consensus v2 verified-complete +
   this revision's next-step (Phase 4R·0).
4. **Compressed context** (`.claude/context/.compressed-context-ready.md`) → refresh to the 4R state.
