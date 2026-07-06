# OriginalDR — Multi-Source Consensus Reconstruction (Modern + Archaic Diplomatic)

A single, scientifically rigorous, fully auditable reconstruction of the Original Douay-Rheims
Bible (New Testament, Rheims 1582; Old Testament, Douay 1609–1610) that draws on **every available
witness at once**, assembles a **spelling/typeset-neutral core basis database** by multi-source
consensus, and then renders that basis into **two gold works** — a modern-orthography edition
(idx 108) and an archaic diplomatic-facsimile edition (idx 109). Statistics and genome-browser-style
visualizations are first-class for both the *protocol* and the *product*, and every structural,
textual, and apparatus decision is grounded in — and validated against — the original page scans.

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
- **P0.4 Fresh-OCR pipeline — WHOLE TOME (decision 2026-07-04).** `ocr_pipeline.py`: `pdftoppm 300dpi →
  tesseract` over **every** scan page, producing our own OCR witness across the entire Bible. Build the
  **majority-consensus OCR** that fuses, per page/line, the three archive.org djvu layers + archive.org
  hOCR + our tesseract into a consensus OCR with per-token agreement — an independent print witness with
  **full-tome depth at every verse**, not a sample. (Heaviest step: GBs local + hours of OCR; accepted.)
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
æ/œ, u/v, i/j, vv, &, and period spellings, sourced from the archaic witnesses (s-dismas primary;
odr-com and archive.org fresh-OCR fill where s-dismas is absent — e.g. OT Ecclesiasticus→Machabees,
prophets). Record per element the archaic source + method + glyphs preserved + coverage tier. Emit the
archaic `.txt` + `work-109.map.json`. Gates: `verify_map(109)==[]`, oracle 76/76, **structural parity
vs 108** (same skeleton, differing only in surface), sha reproduces, apply CLI+API, full suite green
(the gold-map glob auto-parametrizes work-109).

**Both:** share skeleton + basis DB + apparatus placement; a diff of 108 vs 109 isolates exactly the
spelling/typeset delta and nothing else.

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
  genuinely archaic), visualized.
- **Word-for-word correspondence:** confirm archaic↔modern correspond after the documented fold;
  spelling/type diffs are expected and **not** errors — only post-fold residual wording diffs count.

### 6.3 · Independent print validation (both editions)

Stratified-random sampling with bootstrap 95% CIs against the archive.org print scans (extending the
existing seeded protocol to **all** archaic witnesses + majority-consensus OCR). Report per-stratum and
aggregate recall with CIs, cross-source agreement, and the distinctive-content-word miss count (the
genuine-discrepancy signal). Seeded and reproducible.

---

## 7 · Phase 3 — Academic brief + genome-browser visualizations

The report is restructured from a marketing-style dashboard into an **academic brief**.

### 7.1 · Structure (Methods/Results)

**Abstract · Introduction · Sources & provenance · Methods** (paradigm; skeleton; per-source
detection; layout grounding from scans; consensus calling + confidence model; conversion model)
**· Results** (source coverage & attestation statistics; consensus agreement & depth; apparatus
inclusion/exclusion matrix; scan-grounded placement map; modern & archaic rendering outcomes;
diplomatic-fidelity + print-validation CIs) **· Discussion · Limitations · Reproducibility & audit
trail · References**. Every figure computed from committed artifacts; every headline number traces to a
committed JSON + a source sha256.

### 7.2 · Genome-browser-style visualizations (first-class)

Built to read like a genome browser (the intended audience is fluent in them):

- **Source-track browser.** x-axis = canonical position (book→chapter→verse index, or char offset);
  one lane per source; per-element presence + post-normalization agreement (color); a **consensus
  track** on top and **variant pileups** where sources disagree. The textual analog of aligned reads
  over a reference.
- **Coverage-depth histogram / karyotype.** Per element (or binned), the number of attesting sources
  (read depth) and independent depth — the "how many witnesses cover this base" view.
- **Contributor heatmaps (book × source, book × apparatus-channel × source).** Coverage %, colored and
  **tabulated**, so the contribution of each source to each book and each apparatus channel is explicit.
- **Confidence ideogram.** The whole Bible as a chromosome-style ideogram, banded by confidence/coverage
  tier — book-by-book and item-by-item, visualized **and** tabulated (the "full schematics of
  contributors to the confidence" deliverable).
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
```
