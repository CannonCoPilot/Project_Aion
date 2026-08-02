# Palimpsest — Browser-tab tweaks + gold `section` element + A3 re-base

## Context
After splitting `chapter` masks into verse-runs (to carve inline footnotes), the user is reviewing the Douay-Rheims gold map in the Browser tab and wants a batch of UI/UX fixes plus two backend changes. Two design forks were resolved with the user:
- **Chapter spans (item 2)** → add a *real* per-chapter `section` mask element to the gold map, spanning **chapter-heading start → chapter end**; `section` is the structural analog (goes in the **Structure** group), while `chapter` now means verse content *within* the span.
- **work-5.json counts (item 1)** → **overwrite** the canonical `expected_count`s with full-map counts and **re-base** the A3 evaluator (its baseline is data-driven from `work-5.json`).

Repo: `/Users/nathanielcannon/Claude/Projects/palimpsest`. Frontend `browser/src`; core `core/palimpsest`; gold engine `core/tests/fixtures/gold`. Dev servers already up: API `:8080`, Vite `:5173`, embed `:8000`. Branch `main`.

---

## A. Backend / gold map

### Item 2 — new `section` mask-type = per-chapter span container
- **`core/palimpsest/layout.py`**: add `"section"` to `SECTION_TYPES` (structural, between `book`/`part` and `chapter`), `SECTION_LABELS["section"]="Section"`, `SECTION_COLORS["section"]` (a structural hue, e.g. teal `#5ac8a0`), add to `_UNMASKED_TYPES` (analyzable container) and `_STRUCTURAL`; add `_TYPE_LEVEL["section"]` between book(2) and chapter(3) (e.g. 2 or 3 — used only by the detector/auto-layout, not the gold import path).
- **`core/tests/fixtures/gold/mask_engine/masking_map.py`**: add `"section"` to `ALL_TYPES` and to `GENERIC` (it's a container, so it provides generic coverage; keeps the 100% two-layer gate satisfied without altering SPECIFIC depth).
- **`core/tests/fixtures/gold/mask_engine/bible_structure.py`**: in the canonical chapter loop and both apocrypha builders (`chaptered_book`, `single_chapter_book`), emit one `section` element per chapter spanning `[cs, ch_end]` (chapter-heading start → chapter end), carrying the same `metadata`/`label` as the chapter ("Genesis Chapter 1"). It overlaps `chapter_heading` + the `chapter`/`footnotes` segments; because masking is "deepest (smallest) wins", the large `section` never changes `masked_intervals` — only adds a structural element.
- **`browser/src/utils/maskTypeGroups.ts`**: add `"section"` to the Structure group (see item 10).
- Regenerate + re-import + verify (see Verification). Expected `section` count ≈ 1363 (one per chapter incl. apocrypha); element total grows ~1363.

### Item 1 — overwrite `work-5.json` counts + re-base A3
- **`core/tests/fixtures/gold/work-5.json`**: set `chapter_heading.expected_count` (and its `instance_rule.expected_count`) `1334→1363`; `book.expected_count` `73→78`; refresh both `count_cue` strings to full-map (incl. apocrypha) wording. Add a `section` annotation (repeating, secondary/primary, `expected_count` = chapter count) and optionally a `footnotes` annotation reflecting the new 1758 layer. Update `map_status` to dated note: 2026-06-21 inline-note carve + footnotes layer + section spans.
- **Re-base A3**: `a3_score.py` reads `expected_count` from `work-5.json` directly (no hardcoded baseline), so the overwrite re-bases recall automatically. Grep `gold_verify.py`, `gold_ratify.py`, `a3_score.py` for any hardcoded `1334`/`73`; update if present. Re-run `a3_score.py` to regenerate `a3_scores.json` (requires `.scratch/mask-eval/diagnostics/work-5.json`; if absent, note that recall re-scoring needs the harness run — the contract itself is the evaluator input and is updated regardless).

---

## B. Frontend — Browser tab

### Item 10 — merge Front+Back Matter into Structure (`maskTypeGroups.ts`)
Remove the `front_matter` and `back_matter` groups; fold all their types (+ new `section`) into **Structure**. Final groups: **Structure** (body, section, volume, book, part, front_matter, title_page, copyright, contents, dedication, foreword, back_matter, afterword, acknowledgments, about_author, glossary, index, bibliography, appendix, addendum, insert, colophon), **Content** (chapter, letter, poetry, translation), **Headings** (header, chapter_heading, epigraph), **Notes** (footnotes, endnotes, commentary, preface, introduction, discussion).

### Item 9 — add `Expanded` display mode (~3× Detail)
- **`browser/src/stores/browserStore.ts`**: add `'expanded'` to `LaneDisplayMode`; `LANE_HEIGHTS.expanded = 168` (3×56).
- **`BrowserView.tsx`** `DISPLAY_MODE_OPTIONS` + **`ElementGroupLane.tsx`** `GROUP_MODE_OPTIONS`: add `{mode:'expanded',label:'Expanded',icon:'▥'}`. In `ElementGroupLane`, treat `expanded` like `detail` but with a larger per-row height (`ROW_H≈48`); in `TrackLane`, render `expanded` like `detail` with the taller height.

### Item 8 — repoint hamburger "Tracks" drawer to browser track groups
- **`browserStore.ts`**: add `hiddenGroups: Set<string>` + `toggleGroup(key)`.
- **`BrowserView.tsx`**: filter `elementGroups` by `!hiddenGroups.has(g.key)`.
- **`TrackDrawer.tsx`**: replace the overview-bar-barcode toggles with toggles for (a) the element group lanes (`hiddenGroups`) and (b) the real analysis-track lanes (`trackStore.tracks[name].visible`). Retitle "Overview Bar Tracks" → "Browser Tracks".

### Item 7 — drop `sections` barcode (bottom overview)
- **`OverviewBar.tsx`** (~line 179): `Object.keys(tracks).filter(n => n!=='segments' && n!=='sections')`.

### Item 3 — `Book : Chapter` breadcrumb (replace "Zoom in to see text")
- **`BrowserView.tsx`** TickerTape / a thin header line: compute the current location from the viewport center by finding the `chapter`/`chapter_heading` element (in `tracks['elements']`) covering `(viewStart+viewEnd)/2`, reading its `body['palimpsest:chapterTitle']` ("Genesis Chapter 1"). Render persistently and update reactively on pan/zoom; keep a "(zoom in to read text)" hint when `charsPerPixel>2` but always show the breadcrumb.

### Items 4 & 5 — cross-tab focus (Browser ↔ Reader)
- **4 (Browser→Reader)**: in `handleAnnotationClick` (`BrowserView.tsx:355`), after `selectAnnotation(ann)` also `setActiveTab('reading')` and request a scroll to the paragraph containing `sel.start` (map offset→paragraph via `projectStore` `paragraphs`; use viewStore's scroll-to-paragraph request field).
- **5 (Reader→Browser)**: add a `useEffect` in `BrowserView` watching `viewStore.selectedAnnotation`; when it changes to an annotation not currently centered, `zoomToRange(sel.start, sel.end)` + `setHighlightedAnnotation`. Guard against the 4↔5 feedback loop with a `useRef` holding the last-handled annotation id.

### Item 6 — double-click element → details popup
- Add `onDoubleClick` to the element rects in **`ElementGroupLane.tsx`** (and `TrackLane` in `BrowserView.tsx`) → set a local `popupAnn` state in `BrowserView`. Render a floating panel reusing **`AnnotationDetail`** from `components/DetailPanel/DetailPanel.tsx` (type, offsets, excerpt, metadata), dismissable on outside-click/Esc.

### Item 11 — stats text → mask-type count
- **`browser/src/components/Layout/AppLayout.tsx:78`**: replace `{trackCount} tracks` with the count of distinct `body['palimpsest:elementType']` in `tracks['elements']`, e.g. `15 mask types`.

---

## Verification
- **Backend gold**: `core/.venv/bin/python core/tests/fixtures/gold/mask_engine/gen_gold_maps.py 5` (gates: 0 unresolved + 100% two-layer must pass); `import_all_gold.py 5` → WYSIWYG PASS (live==stored, new `section` count shows); confirm `masked_intervals` unchanged from pre-section (section is unmasked, deepest-wins). Run `gold_verify.py` + `a3_score.py 5`.
- **Frontend**: `cd browser && npx tsc -b` (0 errors) and `npm test` (suite green). Reload `:5173` Browser tab for idx5 and visually confirm: 4 groups (matter merged into Structure) incl. a `section` chapter-span lane; Expanded mode ~3× Detail; hamburger toggles group lanes; no `sections` barcode at bottom; Book:Chapter breadcrumb updates on pan/zoom; click in Browser jumps Reader to the element and vice-versa; double-click opens the details popup; header shows "N mask types".
- Visual confirmation is the user's (no Playwright MCP connected); I'll report exactly what I verified programmatically vs. what needs their eye.

## Notes / sequencing
- Do backend (items 2 then 1) first so the regenerated map carries `section`, then `maskTypeGroups.ts` (items 10 + 2), then the remaining frontend items.
- Commit is **not** included here — will ask before committing.
