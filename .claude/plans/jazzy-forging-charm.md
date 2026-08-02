# OriginalDR Pilot — Version-Iterative Report & Pipeline Improvements

## Context

Sir reviewed the pilot report and it "did not at all look like an update from the last version."
Root cause (found empirically): the report opened in a **stale browser tab** — macOS `open`
re-focuses an already-open `file://` tab without reloading, so Sir saw a render (v3 or earlier)
that predates this session's v4/v5. Verified against the live v5 HTML, the current report
**already contains** several features Sir asked for:

- **V2 popout** — `zoomScatter()` wired exactly like V1 (`build_reocr_report.py` L823–845).
- **V3 modern/archaic coloring** — `cellFill()` colors transcribed refs archaic=`refarc`/modern=`ref` (L851).
- **V3 preeminence order** — `DATA.source_order` = archaic-refs → modern-refs → scans-by-strength (L864, L200–205).
- **Apparatus (approbatio + preface)** — `renderApparatus()` + populated `DATA.apparatus` (L1019–1057, L365).
- **Chapter-pass rule n ≥ max(1, m−1)** — already the code rule, set 2026-07-10 (`qc_audit.py` L398–402).
- **Janvier = modern apparatus ref** — already wired as `modern_ref` in `apparatus_audit.py` (L181, L214);
  no `conf-*`/Confraternity dir exists (that was a mislabel).

So a large part of the request is **verify + surface**, not **build**. The genuinely-missing work is:
a prominent version banner (which would have prevented this confusion), V3 per-book track-filtering,
expanded apparatus parsing, and the re-OCR ladder (incl. S2 full OCR) with a Jarvis visual-diagnosis step.

Sir's directive: address the list **version-iteratively**, in single or small batches, each a new report version.

## Current-state map

| Item | Status | Where |
|---|---|---|
| Version banner w/ "what changed" delta | header exists, **no delta** | `renderHead` L678-685; `build_data` meta L339-351 |
| V2 popout like V1 | **DONE** (stale tab hid it) | `zoomScatter` L823-845 |
| V3 color transcribed modern/archaic | **DONE** | `cellFill` L851 |
| V3 sort by preeminence | **DONE** | `source_order` L200-205, L864 |
| V3 per-book track-filtering | **MISSING** | `renderV3` L875 iterates all sources |
| Chapter-pass n≥(m−1) | **DONE** (2026-07-10) | `qc_audit.py` L398-402 |
| Move worklist to end | **MISSING** | `#s-wl` L638-642; `renderAll` L1058 |
| Apparatus pull-forward (approbatio+preface) | **DONE**; expand pending | `apparatus_audit.py` L62-75 |
| Janvier modern-ref correction | **DONE** in code; surface in report | `apparatus_audit.py` L181,214 |
| s_dismas Class-A defects (post-splice) | computed; surface accurately | `source_defects` in `coverage-audit-verse.json` |
| S2 broken (n=5) | **diagnosed**: 10/1135-page stub, front-matter only, not a raster/parse bug | `pdf-S02/` 10 JSONs vs 1135pp |
| Re-OCR ladder + visual-diagnosis step | **NOT built** (worklist only) | new `reocr_ladder.py` |

## Batches (recommended sequence; each = one report version bump)

### Batch v6 — "Make iteration legible" (quick, low-risk, presentation only)
- **Version banner** (prominent, top of report): version #, build timestamp, input sha256, scope, and a
  **"what changed vs prior"** line (Δn_verses, Δn_books, scope Δ, source-sha Δ). Load prior entry from
  `reports-archive/versions.json` history[-2]; compute deltas in `build_data`; render in `renderHead`.
- **Move worklist to END**: relocate `<section id="s-wl">` to after `#s-apparatus`/`#s-interp`; fix render order.
- **Surface the chapter-pass rule** in Methods + banner (state `n_pass ≥ max(1, m−1)`, "strict, ≤1 verse error";
  it is already the rule — this makes it visible).
- **Surface the two corrections** as report narrative: (a) janvier `reference/` = modern apparatus ref → every
  open apparatus slot is **needs-BUILD** (a governing ref exists), not needs-reference; (b) s_dismas Class-A
  defects post-splice: Gen 26 + Ps 52 **RECOVERED**, Acts 25 odr_com-covered, Gen 8 present-but-blob → P4,
  **Lev 3 + Prov 25 genuine OPEN** (odr_com carries neither).
- Verify: rebuild → v6, open a FRESH-named copy; confirm banner delta; visually confirm V2 popout, V3 recolor,
  apparatus already render (closing out those "missing" items).

### Batch v7 — V3 per-book track-filtering (small, contained)
- Show only source tracks that a book **should** contain; a source that legitimately lacks a book must not
  appear as a gray "missing" row (e.g. OT-only S2 under NT books).
- Data already exists: `source-index.json` → `loci_ev.scripture_books[<book>].expected_witnesses`
  (from `source_index.py` `SCAN_COVERAGE` L36-51; `qc_audit.py` already filters on it L257).
- Change: add per-book `expected_witnesses` into `DATA` (`build_data`); in `renderV3` (L875) iterate the
  book's expected list instead of the full `source_order` (always keep transcribed refs).
- Verify: OT-only sources vanish from NT-book tracks and vice versa; no spurious "missing" rows.

### Batch v8 — Apparatus pull-forward (expand front-matter)
- Extend `parse_ot_frontmatter` (L62-75) to the remaining OT-front slots (censura, privilege, title-page);
  add `parse_nt_frontmatter` for NT `01-front-matter.pdf` (preface, title-page, censure). Score against the
  already-wired janvier modern ref + archaic s_dismas; re-run → `coverage-audit-apparatus.json` (report already
  renders it). Rationale (Sir): more apparatus input now → the bulk lands softer at P5.
- Verify: apparatus section shows the expanded OT-front + NT-front elements with per-scan archaic bars and
  modern-ref availability; open slots shrink toward needs-build.

### Batch v9 — Re-OCR ladder + S2, with mandatory Jarvis visual-diagnosis (the meaty one)
- Addresses both "prioritize the S2 fix" and "the re-OCR ladder must pull + visualize low-scoring pages before
  redesigning OCR methods."
- **S2** (confirmed): `S02.pdf` = 1135 pages hi-res (2262×3116), image-only; only 10 pages OCR'd, and those are
  **front-matter** (title/approbatio/preface) — its 5 Genesis "attestations" are spurious front-matter misfires,
  **not** a raster/parse bug. Fix = full diplomatic OCR of the scripture pages. Interim quick guard: flag S2 as a
  stub in the report so its garbage Genesis scores don't pollute scoring.
- **Ladder design** (`reocr_ladder.py`, worst-first from the audit worklist), rungs: layout-aware → region-typed
  → vision-LLM. **Mandatory rung-0 diagnostic**: for a low-scoring locus, rasterize the source page(s) to PNG and
  **Jarvis visually inspects** (Read the image) to name the failure mode (columnar/poetic, drop-cap stream-order,
  blackletter, damage, running-header interleave) **before** choosing/redesigning the OCR method.
- **S2 = first ladder target**: pull + visually inspect representative S02 Genesis pages, run the chosen method,
  ground-truth score vs held-out transcription (§6.4 → `ocr-eval.json`), fold real attestations into the audit.
- Heavy/gated (GBs, hours of OCR) — its own sustained batch; likely multiple sub-iterations.

## Cross-cutting
- Each batch bumps one report version (v6, v7, …); **confirm-each-iteration** pause after each.
- §11 commit/push **HOLD** stays until Sir lifts.
- **Durable record**: after v6, fold this batch roadmap into the existing spine doc
  `sparkling-petting-gosling.md` (§12 / §0′) — do **not** keep this plan file as a competing planning doc.

## Recommended first step
Batch **v6** first: ~one iteration, resolves the stale-tab confusion, makes every future render
self-identifying, and lets Sir see that V2/V3/apparatus already work — then Sir picks the next batch.
(If Sir prefers to honor "prioritize S2" literally, v9 can lead instead; noted as a fork.)

## Verification (per batch)
- pyright 0/0 on touched `.py`; `node --check` on the emitted `<script>`; open a FRESH-named HTML copy
  (avoid stale-tab); faithfulness recompute (report counts == audit JSON); then pause for Sir.
