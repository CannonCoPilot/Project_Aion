# Plan: On-Demand Masking, Subtexts & Collections

## Context

Palimpsest can mask text (exclude regions from analysis via the layout's
`mask_by_type` + per-section `masked` override + flat interval layers like verse
numbers). Today masking is **baked into the saved layout** and is only editable inside
the import wizard; the **Browser** grays masked text but the **Reader does not**; there
is **no way to derive a filtered "subtext"** from a project; and there is **no
"Collections"** concept to group related texts (only an ephemeral pairwise Compare tab).

We want the user to drive masking **on demand** from a control panel and to **materialize
the kept text as a new child "subtext" project** — the demo target being a *core-only
Douay-Rheims*: keep the `chapter` layer, drop headers/front-matter, optionally exclude the
appendix books. Derived subtexts auto-associate with their parent in a **Collection**;
users can also group projects manually and co-analyze them in the Compare tab.

### The unifying model (key realization)
Masking-selection and subtext-selection are the **same operation inverted**: the engine
already computes `masked_intervals` (excluded) and its complement (the analyzable core).
- **Stage 1** "keep/drop mask-type layers" ⇒ `mask_by_type`.
- **Stage 2** "deselect individual elements" ⇒ the existing per-section `masked` override.
- A **subtext** = the *kept extraction-layer element spans, verbatim*, with **every parent
  layer that overlaps them remapped onto the child and keeping its mask state** (per the
  user: a kept `chapter` inherits its overlapping `book`/`volume`/`body`; verse numbers
  stay masked exactly as in the parent). Headers/front-matter drop out because they don't
  overlap the kept spans.

So the whole feature is built on the masking engine optimized earlier this session — **no
parallel "selection" data model**. The core engineering piece is a **piecewise
offset-translation map** (parent→child) that both assembles the child text and re-anchors
all carried layers/annotations.

### Locked design decisions (from user)
1. **Non-destructive overlay** — panel keep/mask choices are a live session/derivation
   selection; they do **not** rewrite `layout_sections.json`. Analysis "respecting masking"
   uses the overlay at run time.
2. **Subtext = structural slice** — kept spans verbatim (incl. inner verse numbers); carry
   all overlapping layers + the verse layer, **masking preserved**.
3. **Remap everything possible** — remap the layout subset, verse index, segments, AND
   annotation tracks (entities/sentiment/…) for annotations fully within kept spans; drop
   heavy signal/embedding outputs (user re-runs on the clean core).
4. **Full build** — masking panel + subtext derivation + Collections CRUD UI +
   Compare-scoped-to-collection.

---

## Phase 1 — Non-destructive masking overlay + control panel

**Goal:** a session overlay store + a control panel (usable from Reader & Browser) to set
the master masking on/off, per-type-layer keep/mask, and per-element overrides.

- **New `browser/src/stores/maskOverlayStore.ts`:** per-project overlay
  `{ enabled: boolean; maskByType: Record<string,bool>; sectionOverrides: Record<sectionId, bool>; extractionTypes: Set<string> }`.
  Seeds from the project's persisted `mask_by_type` (via `sectionStore`) but edits stay in
  the overlay. Selectors compute the **effective** sections+maskByType to feed
  `computeMaskedIntervals` (clone sections applying `sectionOverrides`).
- **New `browser/src/components/MaskingPanel/MaskingPanel.tsx`:** collapsible panel.
  - Master "Masking" on/off (`enabled`).
  - Present mask-type layers (from `maskTypeGroups` present types) each with keep/mask
    toggle + an "extraction" marker (the layer(s) whose text defines a subtext).
  - Drill-in to elements of a type → per-element keep/mask (Stage 2), grouped by container
    (book) so the appendix branch toggles as a unit.
  - Reuse `sectionStore`/`maskMenu.tsx` editing patterns and `ElementGroupLane` per-type
    toggle UI; reuse the sweep-line `computeMaskedIntervals` (already supports `extraMasked`).
- Surface the panel in both Reader (`TextLinearView`) and Browser (`BrowserView`) via the
  existing right-panel/drawer pattern (`DetailPanel`/`TrackDrawer`).

## Phase 2 — Gray-out driven by the overlay (Reader + Browser)

**Goal:** masked text grays live from the overlay in both views.

- **Browser:** `BrowserView.tsx:329` `maskedIntervals` useMemo already calls
  `computeMaskedIntervals`; switch its inputs to the overlay's effective sections/maskByType
  (fall back to persisted when overlay disabled). TickerTape styling unchanged.
- **Reader (net-new):** `TextLinearView` currently renders no masking. Add a masked-range
  overlay: compute the same `maskedIntervals`, and gray the intersecting character runs
  using the server-provided `masked_style` (`#3a3a3d`/`#f5f5f5`). Mirror the span-splitting
  approach TickerTape uses (`BrowserView.tsx:70-100`).

## Phase 3 — Analysis respects the overlay (backend override)

**Goal:** running an analysis with the overlay excludes the currently-masked text without
mutating the saved layout.

- **Backend:** add an optional override to the masked-set computation.
  `Project.masked_intervals(self, override: MaskOverride | None = None)` (project.py:197) —
  when given, merge `override.mask_by_type` over the saved config and apply
  `override.section_masked` per-id before calling `layout.masked_intervals`.
- Thread it through the analyze path: `POST /api/projects/{id}/analyze/{track}`
  (server.py:791) gains an optional JSON body `mask_override`; the extractor entrypoints that
  call `project.masked_intervals()` (e.g. `tracks/self_similarity.py:1001`) accept and pass
  it. `range_is_masked` is unchanged.
- **Frontend:** `AnalysisPanel` run calls include the overlay as `mask_override` when
  `enabled`.

## Phase 4 — Subtext derivation (headline)

**Goal:** two-stage filter → "Generate subtext" → new child project (remapped layers/tracks,
masking preserved, parent link).

### 4a. Two-stage filter UI
- Full-screen flow modeled on `ImportWizard.tsx`:
  - **Stage 1:** choose extraction type-layer(s) (e.g. `chapter`) + which other present
    layers are kept-vs-masked (drives carryover + masking).
  - **Stage 2:** element tree of the extraction layer grouped by container (book); deselect
    individual elements (e.g. the appendix books' chapters). Live preview: kept char count,
    element count, a `SectionMinimap` of kept spans.
- This is the same overlay state from Phase 1; the wizard just focuses it and adds the
  generate action.

### 4b. Derive endpoint + offset remap (the core algorithm)
- **`POST /api/projects/{parent_id}/derive`** (server.py) body:
  `{ extraction_types: [...], kept_mask_by_type: {...}, section_overrides: {id: masked}, title, author, collection_id? }`.
- **Algorithm (new `core/palimpsest/derive.py`):**
  1. Load parent: text, `LayoutConfig`, `verses.jsonl`, segment/annotation tracks.
  2. **Kept spans** = merged, ordered spans of extraction-layer elements minus Stage-2
     deselected ids.
  3. **Build piecewise offset map** `translate(parent_off)->child_off`: walk kept spans in
     order, accumulating child offset + a `"\n\n"` separator between spans; record
     `(parent_start, parent_end, child_start)` segments.
  4. **Assemble child `reference.txt`** = separator-joined `parent_text[ps:pe]`.
  5. **Materialize the project** by reusing the ingest pipeline:
     `project.ingest_file(virtual_path, workspace, source_name="<slug>.txt", text_extractor=lambda _: child_text, title=...)`
     — gets segmentation, coordinates, metadata, sha for free.
  6. **Remap & write the layout:** for every parent layout element overlapping a kept span,
     clip to the overlap and remap via the map (an element spanning several *adjacent* kept
     spans merges into one child element; gaps split it). Preserve `type`, `metadata`,
     `mask_as`, and **`masked` state**. Carry `mask_by_type`. Write as `layout_sections.json`
     (reuse the `_apply_gold_map` write path / `_write_elements_track` + `_write_verses_track`,
     server.py:154-263).
  7. **Remap the verse index:** filter `verses.jsonl` records within kept spans, remap
     `ns/s/e`; the verse-number mask layer thus stays masked in the child.
  8. **Remap annotation tracks** (entities/sentiment/dialogue/segments): keep annotations
     **fully inside** a kept span, remap offsets, write to child `tracks/`. Drop heavy signal
     outputs (`signals/`, embeddings) — re-derived on demand.
  9. **Metadata:** add `parent_project_id`, `parent_reference_sha256`, `derivation`
     (extraction types, excluded ids, separator), `ingest_method:"subtext_derivation"`.
  10. Add the child to the chosen/auto Collection (Phase 5). Return the child summary.

## Phase 5 — Collections

**Goal:** group related projects; auto-link parent↔subtext; manage from the Library.

- **Storage:** workspace-root `collections.json`:
  `{ collections: [{ id, label, description, project_ids: [...], created, kind: "manual"|"derived" }] }`.
- **Backend (server.py):** `GET/POST /api/collections`, `GET/PUT/DELETE /api/collections/{id}`,
  `POST/DELETE /api/collections/{id}/projects/{project_id}`. Derive auto-creates/uses a
  `"{Parent Title} + subtexts"` derived collection and adds parent+child. `GET /api/projects`
  gains `parent_project_id`/membership so the Library can group.
- **Frontend:** `ProjectPicker.tsx` gains a Collections sidebar (groups + member counts);
  derivatives nest under their parent. New `collectionStore.ts` (CRUD + membership).

## Phase 6 — Compare scoped to a Collection

**Goal:** co-analyze collection members in the existing Compare tab.

- `CompareView.tsx` project picker gains a "from Collection" scope so the secondary picker
  is pre-populated with members; reuse the existing `/api/alignment/*` pipeline +
  `comparisonStore`. (N-way aggregate co-analysis remains a future extension; this phase
  delivers member-scoped pairwise compare + the Collection context.)

---

## Key files
- **Engine (reuse):** `core/palimpsest/layout.py` (`masked_intervals`, `range_is_masked`,
  `LayoutSection/LayoutConfig`), `core/palimpsest/verses.py`,
  `browser/src/utils/sectionMasking.ts` (`computeMaskedIntervals`).
- **New backend:** `core/palimpsest/derive.py` (offset map + remap); derive/collections
  routes in `core/palimpsest/server.py`; `mask_override` on `project.py:masked_intervals` +
  analyze path; reuse `ingest_file` (project.py:295) and `_apply_gold_map`/`_write_*_track`.
- **New frontend:** `stores/maskOverlayStore.ts`, `stores/collectionStore.ts`,
  `components/MaskingPanel/`, a subtext wizard (modeled on `import/ImportWizard.tsx`);
  edits to `TextLinearView`, `BrowserView.tsx`, `AnalysisPanel`, `common/ProjectPicker.tsx`,
  `CompareView/CompareView.tsx`.

## The offset-translation map (precise)
Given ordered, disjoint kept spans `K = [(p0s,p0e),(p1s,p1e),…]` and separator `SEP="\n\n"`:
- `child_text = SEP.join(text[ps:pe] for (ps,pe) in K)`.
- Segment table: child start of span *i* = `sum(len + len(SEP) for prior spans)`.
- `translate(off)` = `child_start_i + (off - p_i_s)` for the span containing `off`, else
  undefined. For a carried element `[as,ae]`: emit a child fragment per overlapping kept span
  `(max(as,p_i_s), min(ae,p_i_e))`; **merge** fragments that land on child-adjacent spans
  into one element. This single map drives text assembly, layout remap, verse remap, and
  track remap — keeping all coordinate systems consistent.

## Verification
- **Backend unit:** new `core/tests/test_derive.py` — offset-map round-trip; a kept-`chapter`
  DR slice has 0 header/front-matter chars; verse records remap and stay masked; carried
  containers (book/volume) clip+merge correctly; child `reference_sha256` recomputed.
- **Masking parity:** the child's `masked_intervals` over remapped layers equals the parent's
  masked set restricted+translated to kept spans (assert byte-exact like the sweep-line check).
- **End-to-end (demo):** derive *core-only DR* from idx5 keeping `chapter`, excluding
  appendix; confirm child project loads, Reader+Browser gray verse numbers, child appears in
  an auto Collection with the parent, and an analysis run on the child (e.g. self_similarity)
  excludes the carried-masked verse tokens.
- **Suites/UI:** `pytest` (core) + `vitest` + `tsc -b` green; **Playwright** the masking panel
  toggles (gray-out live in both views), the two-stage wizard, and the Library Collections
  sidebar.
- Keep all temp artifacts in `core/.scratch/` (gitignored). Commits per phase, pushed only on
  explicit approval (per project pattern).

## Risks / notes
- **Offset remap edge cases** (elements spanning excluded gaps, sentence/paragraph splits at
  span seams) are the main risk — covered by `test_derive.py` and the parity check.
- **Analyze override threading** touches several extractors; start with `self_similarity`
  (the one that already consumes `masked_intervals`) and generalize.
- The non-destructive overlay must clearly distinguish "view/derive selection" from the saved
  layout in the UI to avoid confusion (a "Save to layout" affordance can come later).
