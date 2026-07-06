# OriginalDR — Multi-Source Consensus Reconstruction (Modern + Archaic Diplomatic)

A single, scientifically rigorous, fully auditable reconstruction of the Original Douay-Rheims
Bible (New Testament, Rheims 1582; Old Testament, Douay 1609–1610) that draws on **every available
witness at once**, assembles a **spelling/typeset-neutral core basis database** by multi-source
consensus, and then renders that basis into **two gold works** — a modern-orthography edition
(idx 108) and an archaic diplomatic-facsimile edition (idx 109). Statistics and genome-browser-style
visualizations are first-class for both the *protocol* and the *product*, and every structural,
textual, and apparatus decision is grounded in — and validated against — the original page scans.

---

## 0 · Revision 2026-07-06 — course-correction (READ FIRST)

Sir's directive tightened the aims and reversed three premature closures. The plan's *design* (below)
was right; **execution took the cheap path and fell short of it.** What actually shipped (P0→P3,
commits through 3806656): the reconstruction consumed the existing archive.org **djvu.txt** OCR plus a
*sampled* print-validation OCR, so the OCR witness (`ocr_consensus`) is **scripture-only and
djvu-derived**; apparatus prose was **never OCR'd or stored** (it is render-time-sourced from the
modern janvier-s witness and shared by both editions); and the archaic edition carries **199
modern-fallback gaps** and a **modern apparatus**. That is exactly the "pick the best available and
flag the rest" behavior §1 forbids.

**Corrected aims (these override any conflicting text below):**

1. **Every feature of the text is user-facing, always.** Masking is only a *default import setting* in
   Palimpsest; the user masks/unmasks at will. Scripture, apparatus, and structure are all first-class
   product. Archival and analytic completeness of **both** the modern and archaic editions is a goal in
   itself.
2. **The 108↔109 diff must expose every spelling/typeset delta across the _whole_ work — apparatus
   included, not scripture-only.** The apparatus must therefore be rendered archaically in idx 109 (its
   own archaic surface), not shared from the modern witness.
3. **No terminal gaps; no modern-for-archaic fallbacks.** The union of sources — **Janvier (Sabates_A),
   s-dismas, archive.org hOCR/txt, archive.org scans + our own OCR, annas-archive EEBO scans + our own
   OCR** — covers 100% of the work (incl. all apparatus) at **≥2× depth**. The scans must be *processed*
   to realize that coverage: **fresh custom OCR of every scan page we hold** (the hard path), tuned and
   measured against the already-transcribed regions as ground truth. A missing surface comes from our
   OCR — never from a wrong-register substitute.
4. **Confidence variation is a feature, not a defect.** The basis DB is itself a primary deliverable: a
   **canonical error/confidence map** of the entire work (all components — scripture + apparatus +
   structure), showing per-region source coverage and cross-source agreement.
5. **Two new first-class report deliverables:** (a) a **whole-work source-overlay map** — every source a
   track across the entire work incl. apparatus, our-OCR contribution shown; (b) a **full per-source
   accounting** — for each source, how it was used, what parts it contributes, how it cross-validated
   (and was cross-validated by) the other sources and the basis DB. The report must stand alone as an
   academic-grade guide to the standard set by, and the state of, the produced OriginalDR documents.

**Genome-assembly framing (Sir's model).** Each source is a **de-novo assembly from a different
sequencing technology**: Janvier (modern polished transcription), s-dismas (archaic diplomatic
transcription, partial), archive.org hOCR/txt (existing 3rd-party OCR), archive.org scans + our OCR
(fresh reads), annas-archive EEBO scans + our OCR (a second physical copy, fresh reads). Reconciled by
independence-weighted consensus, they yield the basis DB (the reference assembly + variant/confidence
annotation) with no unfilled interval.

**Reopened decisions (closed prematurely; now inputs to Phase 4 §12, not dispositions):**
- **#5 — the 199 archaic coverage-gaps.** Was "genuine gaps; modern-fallback honest; re-OCR would
  fabricate noise." REVERSED: the "same OCR family" objection applies only to *re-consuming* the
  archive.org djvu — it does **not** excuse skipping **fresh custom OCR of the page images**
  (archive.org + annas-archive) with a ground-truth-tuned pipeline. These 199 are **OCR work-targets**,
  filled to an attested archaic surface + confidence.
- **#6 — archaic apparatus.** Was "keep modern-shared; defer as reader-invisible opt-in." REVERSED:
  archaic apparatus is **required** (aim 2). Source it from odr-com where present + s-dismas /
  archive.org / annas-archive **OCR everywhere else** → full archaic apparatus with confidence, no
  modern substitute.
- **#4 — the 55 archaic-only coords.** Classification stands as evidence but is reframed: these are
  **versification-variance signals** feeding the confidence/error map, not an "exclude-and-done" set.

The committed follow-up artifacts (`versification-adjudication.json`, `archaic-apparatus-sourcing.json`)
are retained as **evidence/inputs** to Phase 4, not final answers. Detailed reopened work: **§12 (Phase
4 — the hard path).**

---

## 1 · Paradigm

> **Detect in every source → generate from every source → re-detect in the final document as confirmation.**

This replaces the earlier "generate, don't detect." The reconstruction does **not** pick the single
best source for each part. Instead, for **every** element — every verse, every apparatus item, every
structural/layout decision — it gathers corroborating evidence from **all** sources that attest it
(including our own fresh OCR of the scans), builds the element from that combined evidence, and then
re-maps the emitted document back onto the sources to confirm it round-trips.

### 1.1 · Genomic framing (the working mental model)

The method is a **multiple-sequence alignment + consensus-assembly** pipeline applied to textual
scholarship. Each source is a set of **reads** over the canonical text; the reconstruction is the
**consensus assembly**; and validation is **re-mapping the assembly back to the reads**.

| Genomics | This project |
|---|---|
| Reference genome / coordinate system | Canonical element skeleton (tome → testament → matter → book → chapter → verse; apparatus channels) |
| Sequencing reads from N libraries | Detected elements from the 8 witness families + our OCR |
| Read alignment to reference | Per-source detection aligned to skeleton coordinates |
| Per-base read depth | Support depth = # sources attesting an element |
| Consensus base call + variant pileup | Consensus reading + recorded per-source variants |
| Phred/independence-weighted quality | Confidence = independent-witness depth × post-normalization agreement |
| Assembly | The core **basis database** |
| Re-mapping reads to the assembly (validation) | **Re-detection** of the emitted documents against every source |
| Two haplotype tracks off one assembly | **Modern** and **archaic** renderings off one basis DB |

The report visualizes this exactly like a **genome browser**: a consensus track over aligned
per-source tracks, coverage-depth histograms, contributor heatmaps, chromosome-style ideograms of
confidence, and variant pileups at disagreement loci (see §5).

### 1.2 · Why one basis, two renderings

The **content, structure, apparatus set, and layout** of the Original Douay-Rheims are *invariant*
across editions — only **spelling** (modern vs archaic) and **typesetting** (modern type vs
diplomatic facsimile with long-ſ, æ/œ, u/v, i/j, vv, &) differ. Therefore spelling/typeset is a
**final rendering layer**, not a source-selection criterion. The basis database captures the
edition-invariant truth (with per-source surface forms in both orthographies); **both** the modern
and archaic works consume **all** sources and differ only in the last conversion step. There is no
"modern phase" and "archaic phase" — there is one reconstruction and two renderings.

**This applies to _every_ element, not just scripture.** Apparatus prose (book/chapter arguments,
verse annotations, cross-references, sidecar notes, and the ~26 reference documents) and structural
labels are reconstructed into the basis DB with **both** a modern and an archaic surface per element —
consensus-called from all attesting sources exactly like scripture — so idx 108 renders them modern
and idx 109 renders them archaic. A diff of 108 vs 109 then exposes **every** spelling/typeset delta
across the whole work (scripture + apparatus + structure), which is the point. (The prior execution
stored apparatus prose nowhere and shared a single modern apparatus across both editions; that is the
gap Phase 4 closes.)

**Masking is orthogonal to reconstruction.** Palimpsest lets the user mask/unmask any layer at will;
the mask map that ships with each gold work is only a *default* view. Nothing about a feature's default
mask state lowers its reconstruction standard — apparatus is reconstructed and rendered to the same
completeness and fidelity bar as scripture.

**The basis DB is a deliverable in its own right.** Beyond feeding the two renderings, it is the
**canonical error/confidence map** of the entire work: every component, in canonical layout and order,
annotated with source coverage, cross-source agreement, and independence-weighted confidence — a map of
where the reconstruction is strong and where it is thin (a feature, not a defect; §4.3, §7).

---

## 2 · Sources (8 witness families + derived OCR)

All grounded by local inventory (2026-07-04). Spelling ∈ {modern, archaic}; Typeset ∈ {modern,
archaic}. "Independent" marks lineage-independence used in confidence weighting (§4.3).

| Alias | Provenance | Form | Spelling | Typeset | Coverage | Role | Local status |
|---|---|---|---|---|---|---|---|
| **Madueke_A** | codeberg `olprint/Augmented-Bible` | 1334 chapter HTML | modern | modern | full (73 books) | Scripture backbone (verse-structured) | ✅ present (1334 HTML) |
| **Madueke_B** | gitlab `simple-gui/xml2gui-bible` | 2 PDFs (+ merged/small txt) | modern | modern | full + apparatus | Scripture + apparatus (supersedes janvier PDFs) | ✅ present — **re-pull latest** (updated ~2 mo ago) |
| **Sabates_A** | github `janvier-s/original-douay-rheims` | structured JSON (`bible`, `annotations`, `reference/{ot,nt}`, `usfm`) | modern | modern | full + apparatus + appendix | Apparatus (notes/xrefs/annotations) + **26 reference docs** (front/back matter) + apocryphal appendix | ✅ present (incl. `reference/ot`=14, `reference/nt`=12) |
| **s-dismas** | github `s-dismas/Pdf` | PDFs (frontmatter = scanned images) | **archaic** | **archaic** | NT complete + OT Gen→Wisdom + frontmatter + epistles-argument | Archaic diplomatic backbone (type + spelling) | ✅ 55 PDFs — **re-pull** to confirm 57-book set |
| **originaldouayrheims.com** | `originaldouayrheims.com` | website HTML | **archaic** | modern | entire NT + Gen, Exod, Psalms, Ruth, Wisdom, Lam, Baruch, Daniel, Jonas, Sophonias, I/II Machabees | Archaic-spelling scripture (independent of Madueke lineage) | ⚠️ **scrape required** (only 4 probe HTML present) |
| **archive.org — 3 main** | `1609 OT (1/3)`, `1610 OT (2/3)`, `1582 NT (3/3)` | scans: page images, djvu.txt, hOCR, text-PDF, epub | **archaic** | **archaic** | full tome | **LAYOUT AUTHORITY**: contents, organization, front/back matter, marginalia; fresh-OCR raw data | ⚠️ djvu.txt ✅ (`ot1-1609`, `ot2-1610`, `nt-1582`); **page images + hOCR + text-PDF required** |
| **archive.org — 3 suppl.** | `newtestamentofie00engl`, `holiebiblefaithf00mart_0`, `holiebiblefaithf00mart` | scans + OCR layers | archaic | archaic | NT / OT-1 / OT-2 | Independent print scans for **majority-consensus OCR** + scan verification | ⚠️ djvu.txt ✅ (`newtestament`, `holiebible-ot1`, `holiebible-ot2`); **images + hOCR required** |
| **Original scan PDFs** | Anna's Archive EEBO (imports/) | image-scan PDFs vol 1–5 + NT | archaic | archaic | full tome | High-res page images for **apparatus/layout placement grounding** + fresh OCR + LLM visual reading | ✅ present (`imports/Scripture/Bibles/DouayRheims_DR/Original/`) |
| **our fresh OCR** | derived (tesseract 5.5.2 + pdftoppm) | text from rendered page images | archaic | archaic | on demand | Independent OCR witness feeding majority-consensus | ⚙️ tooling present |

**Provenance lineage (for independence weighting):** Madueke_A and Madueke_B are the **same edition,
two formats** (extraction-fidelity relationship, not independence). Sabates_A **derives from
Madueke**. Therefore the genuinely independent modern witness is Sabates-vs-Madueke at best a
fidelity check; **true independence** comes from the archaic print line — s-dismas, odr-com, and the
archive.org scans (three physically distinct scan sets) — plus our own OCR. Confidence must weight by
independence, not raw source count (§4.3).

**Coverage guarantee (the reason to OCR everything).** Transcribed sources are partial and
register-limited: Janvier/Madueke are modern-only; s-dismas is archaic but stops at OT Wisdom; odr-com
is archaic-spelling (ſ-normalised, not diplomatic) over ~39 books; the pre-existing archive.org
djvu/hOCR is a single noisy OCR family. **No transcribed source covers the whole work in the archaic
register, and none covers the apparatus prose as extractable text.** The image scans, however, *do*
cover 100% of the work — including all apparatus and marginalia — in genuine archaic typesetting, in at
least two physically distinct copies (archive.org's six items + the annas-archive EEBO volumes). The
**only** way to convert that latent 100% coverage into usable per-element surfaces is to **OCR the
scans ourselves**. Our custom OCR is thus not a "fill where convenient" witness but the mechanism that
guarantees ≥2× archaic depth over every interval — scripture and apparatus alike — with the transcribed
sources serving as ground truth to tune and score it (§3 P0.4, §12).

---

## 3 · Phase 0 — Acquisition, verification, provenance registry

Fill the gaps the inventory exposed; pin everything. No reconstruction step may read a source that is
not registered and sha-pinned.

- **P0.1 Refresh the digital witnesses.** Re-pull Madueke_A (codeberg), Madueke_B (gitlab — the two
  PDFs that supersede the janvier release PDFs), Sabates_A (github, incl. `reference/{ot,nt}` and
  `annotations`), s-dismas (github — confirm the full 57-book + frontmatter + epistles-argument set;
  we currently have 55 PDFs). Record commit hashes / release tags + file sha256s.
- **P0.2 Scrape originaldouayrheims.com.** Build `scrape_odr_com.py` honoring the site's navigation
  (`/matthew`, `/mat28`, `/old/psalms`, `/old/psalms/psalms128`, `/old/genesis/genesis25`, …). Scrape
  **every completed book** (entire NT + the 12 completed OT books). Parse HTML → structured
  markdown/JSON (verse-addressable). **HTML-parse accuracy is validated** by aligning the scrape to
  Madueke at verse granularity where they overlap (mismatch rate reported, not assumed). Output pinned
  `odr-com/*.json` + a scrape manifest (URL → sha256, fetch date).
- **P0.3 Acquire archive.org scan assets — FULL TOME (decision 2026-07-04).** For all 6 items (3 main
  + 3 supplementary), download **every page image** plus **hOCR** (word bounding boxes) and `_text.pdf`
  — the djvu.txt is already local. Full page-image coverage gives complete visual layout authority +
  raw data for whole-Bible fresh OCR + LLM visual reading. Large binaries stay local under `imports/`
  (preserve-don't-push), pinned by sha256; fetch incrementally but to completeness (GBs expected).
- **P0.4 Fresh-OCR pipeline — WHOLE TOME, ALL COMPONENTS (decision 2026-07-04; expanded 2026-07-06).**
  `ocr_pipeline.py`: `pdftoppm 300dpi → tesseract` over **every** scan page of **both** scan lines
  (archive.org's six items **and** the annas-archive EEBO volumes), producing our own OCR witness across
  the entire Bible. Scope is **scripture _and_ apparatus/marginalia** — arguments, annotations,
  footnotes, cross-references and the ~26 reference documents are OCR'd from the same pages, region-typed
  via the hOCR/marginalia geometry (§4.4), not skipped. Fuse, per page/line, the archive.org djvu layers
  + archive.org hOCR + our tesseract (+ annas-archive OCR) into a **majority-consensus OCR** with
  per-token agreement — an independent print witness with **full-tome depth at every element**, not a
  sample. The OCR is **diplomatic-aware** (configured/evaluated to preserve long-ſ, æ/œ, u/v, i/j, vv, &
  rather than collapsing ſ→f) and **ground-truth-tuned**: the s-dismas / odr-com / Janvier transcribed
  regions are held out as ground truth to score and iterate the pipeline, and the resulting per-region
  accuracy becomes part of the per-source accounting (§7). Per-element OCR confidence is recorded.
  (Heaviest step: GBs local + hours of OCR; accepted — this is the hard path, and it is the point.)
  > **STATUS 2026-07-06: under-executed.** P0.3/P0.4 were only partially carried out — the pipeline
  > leaned on the pre-existing archive.org **djvu.txt** plus a *sampled* validation OCR, so `ocr_consensus`
  > is scripture-only and djvu-derived, apparatus was never OCR'd, and annas-archive scans were used only
  > for placement grounding, never OCR'd. **Phase 4 (§12) executes P0.4 as written.**
- **P0.5 Source registry.** Emit committed `sources-registry.json`: for each source — alias, URL/commit,
  form, spelling, typeset, coverage map (which books/apparatus it contains), lineage group,
  independence flag, acquisition date, file sha256(s). This is the single provenance index every later
  phase cites.

**Gate P0:** every source in §2 is present, registered, sha-pinned; odr-com scrape validated against
Madueke overlap; archive.org page images + hOCR present for all six items.

---

## 4 · Phase 1 — Total multi-source reconstruction → core basis database

The heart of the project: assemble the edition-invariant truth from all witnesses.

### 4.1 · P1.1 — Canonical element skeleton (the reference coordinate system)

Define a **source-neutral** element model — the "reference genome" onto which all sources align:

- **Structure:** tome → testament (OT/NT) → front-matter slots → book → chapter → verse → back-matter
  slots; plus the apocryphal appendix (Prayer of Manasses, 3 & 4 Esdras).
- **Apparatus channels** (per book/chapter where applicable): book argument, chapter argument/summary,
  verse footnotes, cross-references, marginal sidecar notes, and the standalone **reference documents**
  (the ~26 front/back-matter items).
- **Canonical IDs:** Catholic/Clementine book order + chapter/verse numbering (reuse the existing
  Catholic oracle as the identity check).

Output: `skeleton.json` — the fixed coordinate space (every possible element slot, unfilled).

### 4.2 · P1.2 — Per-source detection & alignment (map every read to the skeleton)

For **each** source independently, detect and extract every element it contains and align it to
skeleton coordinates. This is the "align all reads" step.

- **Scripture** (Madueke_A/B, Sabates, s-dismas, odr-com, archive.org OCR, our OCR): verse-level
  detection. Structured sources (Madueke_A HTML, Sabates JSON, odr-com scrape) parse directly;
  image/OCR sources (s-dismas frontmatter, archive.org, our OCR) detect via content-anchored alignment
  to skeleton verses.
- **Apparatus** (Sabates `reference/` + `annotations`, Madueke_B merged, s-dismas frontmatter,
  odr-com where present, archive.org OCR/scans): item-level detection — which apparatus items and
  which per-chapter channels each source carries.
- **Layout markers:** where each element sits physically in each source (page/leaf/position).
- Per detected element, record a **read record**: `{source, skeleton_id, present, surface_form
  (with modern/archaic tag), locus, detection_method, local_confidence, evidence_ptr}`.
- **Fresh OCR** is run wherever a source is image-only or where the digital text needs an independent
  print check.

Output: `reads/<source>.json` — per-source aligned detections (the pileup inputs).

### 4.3 · P1.3 — Multi-source consensus calling (assemble)

At each skeleton element, align all source reads and **call a consensus** with rigorous, non-circular
statistics.

- **Normalization for comparison:** a documented bidirectional spelling/glyph model (§6.1) folds
  archaic↔modern surface differences (ſ↔s, æ↔ae, œ↔oe, u↔v, i↔j, vv↔w, &↔and, period spellings) so
  that agreement is measured on *content*, not orthography.
- **Consensus reading:** the agreed content, stored **neutrally** (a normalized lemma) with **both**
  the modern and archaic surface forms attached (from the modern-spelling and archaic-spelling
  witnesses respectively), enabling deterministic rendering later.
- **Support depth & agreement:** per element, # attesting sources and post-normalization agreement
  fraction; disagreements retained as a **variant pileup** (per-source readings), never silently
  dropped.
- **Independence-weighted confidence (§ non-circular):** weight witnesses by *lineage independence* —
  Madueke_A/B count as one lineage; Sabates is Madueke-derived; s-dismas, odr-com, each archive.org
  scan set, and our OCR are independent. Confidence tier = f(independent-witness depth, agreement).
  The consensus never *defines* the truth it is then measured against; per-source readings are always
  reported alongside the consensus.

Output: `consensus/*.json` — per-element consensus + pileup + confidence.

### 4.4 · P1.4 — Layout & organization grounding from the scans

Determine the **arrangement, layout, and organization of ALL scripture and ALL apparatus** by **visual
inspection of and adherence to the original archive.org page scans** — the layout authority. Nothing
about placement rests on inference.

- **Scripture layout:** book order, chapter order, testament partition, appendix placement — each
  confirmed against the scanned tome structure (cited page/leaf).
- **Apparatus placement map** (generalizes the ~26 front/back-matter items — title pages, approbatio,
  preface(s), privilege, censura/censure, the 7 historical/chronology tables, glossary, epistles/
  gospels tables, tables of S. Peter / S. Paul / corruptions / Catholic-truths, Apostles' Creed,
  evangelical-history, scripture-authority, explication-of-words). For **every** item, **belt-and-
  suspenders** proof:
  - render the leaf from the original image-scan PDFs (`pdftoppm 300dpi`), **visually locate** it, and
    commit a cropped header image `placement-crops/<slot>.png`;
  - record `page/leaf/signature`, transcribed `identifying_text`, source-PDF sha256;
  - **and** an `ocr-offset` + quoted text wherever the header survives archive.org OCR (second,
    independent proof);
  - derive `tome_position` (front/back · testament · ordinal) from physical page ordering.
  - **No item may rest on bare "structural" inference or unsupported "manual-visual" assertion.** Any
    item whose page is genuinely absent from the scans is flagged `unlocatable` with its reason —
    never asserted.
- **Marginalia geometry:** where verse-notes/sidecars sit relative to the text column (from hOCR word
  boxes + visual check), so the reconstruction reproduces the print's spatial organization.

Output: `layout-map.json` + committed `placement-crops/` (header images) + marginalia geometry.

### 4.5 · P1.5 — Apparatus inclusion/exclusion & contributor matrix

For **every** apparatus item and **every** book's channels, transparently record presence/absence in
**each** source (Sabates, Madueke_B, s-dismas, odr-com, archive.org OCR/scans) plus the scan-grounded
placement, and the **consensus include/exclude decision with rationale**. Apparatus contributors are
**all** document sources, not one. This is the evidence base for "why is this apparatus here / why is
it omitted."

Output: `apparatus-attestation.json` (source × item presence + placement + decision), the input to the
contributor heatmaps (§5).

> **CORRECTION 2026-07-06 — apparatus prose is first-class.** Attestation/placement is necessary but
> **not sufficient**: every apparatus item must also carry its **modern _and_ archaic surface prose**
> in the basis DB, consensus-called from all attesting sources (Janvier modern; odr-com archaic where
> present; s-dismas / archive.org / annas-archive **OCR** everywhere else), exactly like a scripture
> verse — see the §4.6 element schema (`attestation.surface_modern/surface_archaic`,
> `render.modern_form/archaic_form`). The prior execution populated apparatus *placement* only and
> sourced the prose at render time from modern Janvier alone; Phase 4 (§12) reconstructs the apparatus
> prose into the basis DB so idx 109 can render it archaically.

### 4.6 · P1.6 — Basis database emission

Emit the **core basis database** — the single source of truth for both renderings. Per element:

```
element {
  id:            skeleton coordinate  (e.g. scripture/genesis/1/1 | apparatus/ot-front/preface)
  type:          scripture-verse | apparatus-item | structural-node
  canonical_ref: book/chapter/verse | apparatus slot
  attestation:   [ {source, present, surface_modern, surface_archaic, locus, method,
                    local_confidence, evidence_ptr}, ... ]     # every witness's read
  consensus:     { lemma_neutral, agreement, support_depth, independent_depth,
                   confidence_tier, variant_pileup:[...] }
  placement:     { tome_position, scan_page, crop, identifying_text, ocr_offset, sha256 }
  render:        { modern_form, archaic_form }                 # resolved surfaces for §6
}
```

Output: committed **`basis-db.sqlite`** — a queryable database (decision 2026-07-04), tables:
`elements(id, type, canonical_ref, …)` · `attestation(element_id, source, present, surface_modern,
surface_archaic, locus, method, confidence, evidence)` · `consensus(element_id, lemma, agreement,
depth, indep_depth, tier, variant_pileup)` · `placement(element_id, tome_position, page, crop,
identifying_text, ocr_offset, sha256)`. The cross-source joins the confidence heatmaps/ideograms need
fall out of SQL. Also emit a committed JSON snapshot (`basis-db.json`) for diff-review + CI-safe
artifact tests.

### 4.7 · P1.7 — Re-detection confirmation (validate by re-mapping)

The third leg of the paradigm. Re-run detection on the emitted basis DB and confirm **every** element
round-trips and cross-checks against **every** source that attests it. This is the assembly-vs-reads
re-mapping. **Gate:** 100% of basis elements re-detect to their skeleton coordinate; every attestation
pointer still resolves; zero orphaned or unplaced elements.

**Gate P1:** basis DB complete; every element carries ≥1 attestation + confidence + (for placed items)
a scan citation; re-detection 100%; apparatus-attestation and layout-map fully populated with zero
un-grounded placements.

---

## 5 · Phase 2 — Rendering the two gold works

Both works are deterministic projections of the **same** basis DB; they differ only in the final
orthographic/typographic layer.

### 5.1 · P2.0 — Agreed-corrected modern spelling/typeset standard

Define the **reconciled Madueke↔Sabates modern standard** — resolve the ligature/case/punctuation
divergences between the two modern witnesses into one documented rule set (the "agreed-corrected
janvier-madueke spelling-typeset"). Committed as `modern-standard.json` (a normalization spec with
worked examples), so the modern rendering is reproducible and reviewable.

### 5.2 · P2a — Modern OriginalDR (idx 108)

Render `basis-db → modern` using `render.modern_form` per element under `modern-standard.json`. Emit
the reference `.txt` + `work-108.map.json` (generate-and-record-offsets, exact by construction). Gates:
`verify_map(108)==[]`, Catholic oracle 76/76, `reference_sha256` reproduces via ingest, apply via
**CLI and API** (`sha_verified=True`), full pytest green.

### 5.3 · P2b — Archaic OriginalDR (idx 109)

Render `basis-db → archaic` using `render.archaic_form` — a **diplomatic facsimile** preserving long-ſ,
æ/œ, u/v, i/j, vv, &, and period spellings — for **every** element: scripture **and** apparatus **and**
structural labels. Archaic surfaces come from the archaic witnesses (s-dismas primary; odr-com where
present; **our diplomatic OCR of the scans everywhere else**, incl. the OT Ecclesiasticus→Machabees /
prophets scripture and the whole apparatus). Record per element the archaic source + method + glyphs
preserved + confidence tier. **No modern-for-archaic fallback:** every element renders from an *attested
archaic* surface; an element with no archaic attestation is a **P0.4 OCR work-target**, not a
modern-substitute (Fallbacks-Are-Failures). Emit the archaic `.txt` + `work-109.map.json`. Gates:
`verify_map(109)==[]`, oracle 76/76, **structural parity vs 108** (same skeleton, differing only in
surface), sha reproduces, apply CLI+API, full suite green (the gold-map glob auto-parametrizes work-109).

**Both:** share skeleton + basis DB + apparatus placement; a diff of 108 vs 109 isolates exactly the
spelling/typeset delta — across the **whole** work (scripture, apparatus, structure) and nothing else.
Because the apparatus renders modern in 108 and archaic in 109, that diff includes the apparatus
spelling/typeset deltas; a 108-vs-109 diff that shows *no* apparatus change is a bug (the pre-2026-07-06
state).

---

## 6 · Conversion & diplomatic-fidelity model

### 6.1 · Bidirectional spelling/glyph model

A documented, reversible mapping between archaic and modern surface forms — long-ſ↔s, æ↔ae, œ↔oe,
u↔v, i↔j, vv↔w, &↔and, and catalogued period spellings — used both for *comparison* (§4.3) and for
*rendering* (§5). Committed with a test set proving round-trip stability where reversible and
documenting the non-reversible cases (e.g. modern normalization that loses a period spelling is
recorded so archaic rendering restores it from the archaic witness, not from a lossy back-transform).

### 6.2 · Diplomatic-fidelity validation (archaic)

- **Glyph inventory:** per-book counts of retained ſ, æ, œ, vv, u/v, i/j (evidence the type is
  genuinely archaic), visualized — computed over **both** scripture and apparatus surfaces.
- **Word-for-word correspondence:** confirm archaic↔modern correspond after the documented fold;
  spelling/type diffs are expected and **not** errors — only post-fold residual wording diffs count.
  Run over scripture **and** apparatus (each apparatus element's archaic surface vs its modern surface),
  so the apparatus is held to the same fidelity bar as scripture.

### 6.3 · Independent print validation (both editions)

Stratified-random sampling with bootstrap 95% CIs against the archive.org print scans (extending the
existing seeded protocol to **all** archaic witnesses + majority-consensus OCR). Report per-stratum and
aggregate recall with CIs, cross-source agreement, and the distinctive-content-word miss count (the
genuine-discrepancy signal). Seeded and reproducible.

### 6.4 · OCR pipeline evaluation against ground truth

The custom OCR (§3 P0.4) is a first-class witness, so it is measured, not trusted. Hold out the
transcribed regions — s-dismas (archaic diplomatic), odr-com (archaic-spelling), Janvier/Madueke
(modern) — as **ground truth**, and score our OCR on them: character/word accuracy overall and per
glyph class (the ſ/æ/œ/u-v/i-j/vv discrimination that separates diplomatic OCR from ſ→f collapse), by
page-quality stratum and by region type (body vs marginalia/apparatus). Iterate the pipeline
(binarization, PSM, language/char-whitelist, per-copy tuning) against these scores; report the final
per-source, per-region accuracy. This both validates the gap-fill (P0.4 targets rendered only when OCR
clears a confidence bar) and yields the OCR-accuracy numbers the per-source accounting (§7) needs.
Seeded, reproducible, deterministic.

---

## 7 · Phase 3 — Academic brief + genome-browser visualizations

The report is restructured from a marketing-style dashboard into an **academic brief**.

### 7.1 · Structure (Methods/Results)

**Abstract · Introduction · Sources & provenance · Methods** (paradigm; skeleton; per-source
detection; **custom OCR pipeline + ground-truth evaluation, §6.4**; layout grounding from scans;
consensus calling + confidence model; conversion model) **· Results** (source coverage & attestation
statistics; consensus agreement & depth; the **canonical confidence/error map of the whole work**;
apparatus inclusion/exclusion matrix **and apparatus reconstruction outcomes**; scan-grounded placement
map; modern & archaic rendering outcomes; diplomatic-fidelity + print-validation CIs; OCR-pipeline
accuracy) **· Per-source accounting (§7.4) · Discussion · Limitations · Reproducibility & audit trail ·
References**. Every figure computed from committed artifacts; every headline number traces to a
committed JSON + a source sha256.

### 7.2 · Genome-browser-style visualizations (first-class)

Built to read like a genome browser (the intended audience is fluent in them):

- **Whole-work source-overlay map (headline deliverable).** x-axis = canonical position across the
  **entire** work — scripture **and** apparatus **and** structural components, in canonical layout/order;
  one lane per source (Janvier, s-dismas, odr-com, archive.org hOCR/txt, **our OCR of archive.org**,
  **our OCR of annas-archive**); per-element presence + post-normalization agreement (color); a
  **consensus track** on top and **variant pileups** where sources disagree. This is the textual analog
  of aligned reads over a reference, and it must span apparatus lanes, not just scripture — our-OCR
  contribution is explicitly visible as the layer that fills what the transcriptions miss.
- **Coverage-depth histogram / karyotype.** Per element (or binned), the number of attesting sources
  (read depth) and independent depth — the "how many witnesses cover this base" view; annotate the ≥2×
  depth floor and highlight any interval below it (there should be none after P0.4).
- **Contributor heatmaps (book × source, book × apparatus-channel × source).** Coverage %, colored and
  **tabulated**, so the contribution of each source to each book and each apparatus channel is explicit.
- **Canonical confidence/error map (headline deliverable).** The whole work as a chromosome-style
  ideogram over the canonical layout of **all** components (scripture + apparatus + structure), banded by
  independence-weighted confidence and coloured by error/uncertainty (low coverage or low agreement) —
  book-by-book and item-by-item, visualized **and** tabulated. This is the standalone "map of where the
  reconstruction is strong vs thin" deliverable (§1.2, aim 4); regions of lower confidence are surfaced
  as a feature, with their driving cause (few witnesses / disagreement / OCR-only).
- **Variant pileup panels.** At disagreement loci, the per-source surface readings side by side (the
  SNP-pileup analog).
- **Apparatus placement map.** Tome diagram (front matter → testament → back matter) with each slot's
  scan page citation + committed header crop + per-source attestation — the visual proof that every
  apparatus item's placement is grounded in the original print.
- **Diplomatic-fidelity glyph charts + print-validation CI whiskers** (per-stratum, bootstrap).

### 7.3 · Reports emitted

A primary **academic brief** covering the shared methodology + both products, plus per-work gold-set
report views generated from the same basis DB + validation artifacts. Reuse and extend the existing
SVG primitives; add the browser-track, pileup, heatmap, ideogram, and CI-whisker helpers.

### 7.4 · Per-source accounting (full, one section per source)

A dedicated report section giving **each** source (Janvier/Sabates_A, Madueke_A/B, s-dismas, odr-com,
archive.org hOCR/txt, our OCR of archive.org, our OCR of annas-archive EEBO) a complete accounting:
- **What it is** — provenance, form, spelling/typeset register, lineage group, independence status, sha256.
- **What it contributes** — which components (books/chapters/verses + apparatus channels) it attests,
  as coverage %, mapped onto the canonical layout (its lane in the source-overlay map, §7.2).
- **How it was used** — as backbone / corroborator / archaic surface / OCR gap-fill / placement grounding;
  for OCR sources, the §6.4 accuracy by glyph class and region type.
- **How it cross-validated (and was cross-validated by) the others and the basis DB** — where it agreed
  vs where it was the minority read in a pileup; where it *uniquely* supplied a surface (single-witness
  intervals it is solely responsible for) and how confidence reflects that; whether it changed a
  consensus call and why.
This turns the contributor heatmaps into a narrative + tabular audit, so a reader can trace every
source's exact role in — and every source's exact reliability across — the reconstruction.
Backed by a committed `source-accounting.json` (materialized from the basis DB) that the section renders.

---

## 8 · Files

**Create (tracked)** under `core/tests/fixtures/gold/mask_engine/originaldr_reconstruction/`:
- Acquisition: `scrape_odr_com.py`, `ocr_pipeline.py`, `sources-registry.json`, scrape/OCR manifests.
- Detection: `skeleton.json`, per-source detectors, `reads/<source>.json`.
- Consensus & grounding: `build_consensus.py` + `consensus/*.json`; `build_layout_map.py` +
  `layout-map.json` + `placement-crops/*.png`; `apparatus-attestation.json`.
- Basis: **`basis-db.sqlite`** (queryable, committed) + `basis-db.json` snapshot (diff/CI) + `build_basis_db.py`.
- Conversion: `spelling-glyph-model.json`, `modern-standard.json`.
- Renderers: `render_modern.py` → `work-108.map.json` + reference `.txt`; `render_archaic.py` →
  `work-109.map.json` + archaic reference `.txt`.
- Reports: `gen_originaldr_brief.py` (academic brief) + per-work report generators + HTML.
- Validation: seeded stratified-OCR + bootstrap CI scripts + result JSONs; glyph-inventory + word-
  correspondence + re-detection guards (CI-safe, corpus-free artifact-integrity tests).

**Modify:** `gen_sources_manifest.py` (idx 108 modern + new idx 109 archaic entries).

**Not committed (pinned by sha256):** full scan PDFs + downloaded archive.org page images + raw OCR
dumps (`imports/`, preserve-don't-push). **The per-item apparatus header crops ARE committed** (small
images — the belt-and-suspenders visual proof).

---

## 9 · Verification (end-to-end)

- **P0:** all 8 witness families acquired + sha-pinned; odr-com scraped and verified against Madueke
  overlap (mismatch rate reported); archive.org page images + hOCR present for all six items.
- **P1:** basis DB complete — every element ≥1 attestation + confidence; re-detection 100% round-trip;
  apparatus-attestation + layout-map fully populated; **every apparatus item and every book/chapter
  ordering resolves to a cited scan page (+ committed crop for the ~26 items); zero un-grounded
  placements; `unlocatable` items flagged with reason.**
- **P2:** `verify_map(108)==[]` and `verify_map(109)==[]`; Catholic oracle 76/76 for both; both
  `reference_sha256` reproduce via ingest; both apply via **CLI and API** (`sha_verified=True`);
  archaic ↔ modern **structural parity** asserted; full pytest green (parse junitxml: failures==0 &&
  errors==0; work-109 auto-parametrized).
- **Statistics/repro:** seeded OCR sampling reproducible (same seed → identical sample set); consensus
  deterministic; every report figure traces to a committed artifact + source sha256; spelling/glyph
  model round-trips on its test set.
- **Report:** academic-brief structure present (Methods + Results); genome-browser visualizations
  render; visual QA of each figure (zoom to where the property is resolvable, per the UI-verification
  standard).
- **P4 (the hard path, §12):** custom OCR run over every page of both scan lines (scripture **and**
  apparatus), diplomatic-aware + ground-truth-scored (`ocr-eval.json`); **≥2× archaic depth over 100% of
  the work** with any thin interval explicitly listed; apparatus prose reconstructed into the basis DB
  with modern **and** archaic surfaces (re-detection 100% over the enlarged element set); **no
  modern-for-archaic fallbacks** — the 199 gaps OCR-filled or evidenced `unrecoverable`; idx 109
  re-rendered archaic **everywhere incl. apparatus** (sha re-mint recorded); a 108-vs-109 diff shows
  apparatus deltas; the whole-work source-overlay map, canonical confidence/error map, and full
  per-source accounting (`source-accounting.json`) emitted; academic report stands alone.

---

## 10 · Guiding principles

1. **Detect-everywhere → consensus-generate → re-detect-to-confirm.** Corroborate every element across
   all witnesses; never single-source when more attest; surface disagreements as pileups.
2. **Scans are the layout authority.** Arrangement, organization, and apparatus placement of all
   scripture and all apparatus are determined by visual inspection of and adherence to the original
   archive.org page images — never by inference.
3. **One basis, two renderings.** Spelling/typeset is a final rendering layer; both works use all
   sources.
4. **Durable, non-circular audit trail.** Scripts + seeds + result JSONs + evidence (offsets, crops)
   committed; big binaries pinned by sha256; consensus weighted by independence so it never validates
   itself.
5. **Statistics + visualizations first-class**, for both protocol and product — book-by-book,
   item-by-item, visualized and tabulated.
6. **Generate-and-record-offsets** for the emitted works: offsets exact by construction, masks free.
7. **No unfilled intervals; process, don't skip.** Every element gets an attested surface in *both*
   registers. Where transcriptions don't reach, do the hard-path OCR to reach it — a gap is a
   work-target, never a terminal state, and never a wrong-register substitute.
8. **Confidence, not fallback.** When a region is thin (few witnesses / low agreement / OCR-only),
   record and *show* the reduced confidence; never paper over it with a modern surface in the archaic
   edition (or vice versa). Confidence variation is a first-class product (the error map).
9. **Every feature is user-facing; masking is a default, not a class.** Scripture, apparatus, and
   structure are reconstructed and rendered to the same completeness/fidelity bar regardless of default
   mask state.
10. **Account for every source.** Each source's exact contribution, cross-validation role, and
    reliability is reported (§7.4) — nothing is used silently or left unexplained.

---

## 11 · Sequence & risks

**Sequence:** Phase 0 → Phase 1 → Phase 2 → Phase 3, sequential at the phase level. Within P1.2,
per-source detection is parallelizable (one detector per source). Commits are staged per sub-phase
(git-reversible); commit/push follows the conventional-commit + suite-green gate; **hold commit/push
for explicit approval**.

**Risks & mitigations:**
- *Archaic OCR ≈ noise.* Diplomatic type and OCR garble are hard to separate → majority-consensus OCR
  across three independent scan sets + our tesseract + scan verification + bootstrap-CI reporting.
- *odr-com scrape fragility.* HTML structure may vary by book → validate every scraped book against
  Madueke at verse granularity; report parse mismatch rate; never trust silently.
- *Consensus circularity.* A lineage-inflated "consensus" could self-confirm → independence weighting;
  always report per-source readings beside the consensus.
- *Scan↔edition mapping ambiguity.* archive.org upload naming is inconsistent → resolve and record each
  physical scan's identity + sha256 in `sources-registry.json` before citing it for placement.
- *Volume of scan imagery.* Page-image downloads are large → keep local under `imports/`, pin by
  sha256, fetch incrementally per book/section as needed.
- *Basis DB size.* May exceed a single JSON → shard by book, keep a schema + index.

---

## 12 · Phase 4 — The hard path (full custom OCR · apparatus first-class · whole-work completeness)

**Why this phase exists.** §0 documented that P0→P3 shipped the design's *outputs* but not its
*standard*: djvu-derived scripture-only OCR, apparatus prose stored nowhere, 199 archaic scripture
gaps, a modern-shared apparatus. Phase 4 executes the plan **as written** — the custom-OCR hard path
(§3 P0.4), apparatus as a first-class reconstructed element (§4.5 correction), no-fallback archaic
rendering (§5.3), and the new whole-work deliverables (§7). This **supersedes** the earlier
"opt-in / reader-invisible archaic apparatus" framing entirely: archaic apparatus is neither optional
nor reader-invisible — it is part of *completing* idx 109. Sub-phases are ordered highest-leverage-first
(OCR unlocks everything downstream); each is independently green-gated and git-reversible.

**Inputs (evidence, not dispositions).** `versification-adjudication.json` (the 199 gaps + 55
archaic-only coords, now OCR work-targets) and `archaic-apparatus-sourcing.json` (odr-com carries the
archaic-spelling apparatus twin for ~39 books; everything else needs our OCR).

### 12.1 · P4.1 — Acquire + OCR every scan (the unlock)
- Complete **P0.3** acquisition: all page images + hOCR + text-PDF for the six archive.org items **and**
  the annas-archive EEBO volumes; sha-pin in `sources-registry.json`.
- Build/finish `ocr_pipeline.py` per **P0.4**: diplomatic-aware OCR (ſ/æ/œ/u-v/i-j/vv preserved, not
  ſ→f), over **every** page of **both** scan lines, **scripture and apparatus/marginalia** (region-typed
  via hOCR + marginalia geometry §4.4).
- Ground-truth tune + score per **§6.4** (hold out s-dismas / odr-com / Janvier); iterate to a
  diplomatic accuracy bar; emit `ocr-eval.json` (accuracy per source, per glyph class, per region type).
- Emit fresh witness layers `reads/our_ocr_archive.json` + `reads/our_ocr_annas.json` (scripture **and**
  apparatus), replacing the djvu-derived `ocr_consensus` scaffold with real reads.
- **Gate:** ≥2× archaic depth over 100% of the work (scripture + apparatus); every interval below the
  floor explicitly listed + explained (target: none).

### 12.2 · P4.2 — Reconstruct apparatus prose into the basis DB (first-class)
- Extend detection/consensus (§4.2/§4.3) to apparatus prose: parse odr-com book arguments + chapter
  annotations (the archaic twin; chapter-note blobs split on the verse-marker + `]` lemma delimiters,
  whole-blob fallback), Janvier modern arguments/annotations/xrefs/refdocs, and the new OCR reads, into
  apparatus channel coordinates; consensus-call each with **modern + archaic surfaces + confidence**.
- Grow the apparatus element set from the current 102 placeholders to per-item/per-channel prose
  granularity; populate `attestation.surface_modern/surface_archaic` + `render.modern_form/archaic_form`
  in `basis-db.sqlite`; re-run the **P1.7 re-detection gate** over the enlarged set.
- **Gate:** every apparatus element carries an archaic surface (attested or OCR'd — never
  modern-substituted); re-detection 100%; counts + apparatus tests updated.

### 12.3 · P4.3 — Fill the 199 (and any remaining) scripture gaps
- For every archaic scripture element lacking an attested archaic surface (reopened **#5**), render from
  the P4.1 OCR consensus + confidence and **drop the modern-fallback flag**. A coord whose page is
  genuinely illegible becomes an explicitly-evidenced `unrecoverable` (with the scan cited) — still not a
  modern substitute.
- Re-fold the 55 archaic-only coords (**#4**) into the versification / confidence map at the new depth.

### 12.4 · P4.4 — Re-render both editions from the completed basis DB
- Re-run `render_modern.py` / `render_archaic.py`: idx 108 modern throughout (intent unchanged); idx 109
  **archaic everywhere, incl. apparatus, no fallbacks**. idx 109 sha **re-mints** (`08b75de16a84 → …`) —
  record it. Gates: verify_map(108/109), oracle 76/76, structural parity, CLI+API apply sha-verified,
  full suite green.
- **§5.3 acceptance check:** a 108-vs-109 diff now exhibits apparatus spelling/typeset deltas (absent
  pre-2026-07-06) as well as scripture — the whole-work delta.

### 12.5 · P4.5 — Whole-work deliverables + standalone academic report
- Emit `source-accounting.json` + the **§7.4 per-source accounting**; the **whole-work source-overlay
  map** and the **canonical confidence/error map** (§7.2) spanning apparatus; the OCR-eval figures (§6.4).
- Rebuild the academic brief to stand alone as a guide to the standard set by, and state of, the
  OriginalDR documents (§7.1) — every number traced to a committed artifact + source sha256.

**Effort / risk.** The largest phase: GBs of image acquisition + hours of OCR + a tuned diplomatic
pipeline + apparatus reconstruction + basis-DB element growth + re-render + report. Risks & mitigations:
*diplomatic OCR accuracy on degraded blackletter/roman* → ground-truth tuning (§6.4) + multi-copy
consensus + honest per-region confidence (never a silent fallback); *basis-DB element-count growth
ripples through P1.7 + every apparatus test* → stage per sub-phase, keep gates green each step;
*annas-archive EEBO page↔edition mapping ambiguity* → resolve + sha-pin in the registry before citing.
Sequence P4.1 → P4.5; **hold commit/push for approval** per §11.
