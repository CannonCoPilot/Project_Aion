# Bible EPUB Support + Gospel Demo Texts

## Context

Palimpsest M3 comparative alignment is complete but needs real test data to validate. We have 4 Bible epubs (KJV+Strongs, Tyndale, Geneva 1599, Douay-Rheims) from which to extract 5 Gospel texts for comparison demos. The current epub parser treats all inline markup as text — verse numbers, footnote anchors, cross-references all pollute the output. We need to expand the parser with content filters and extract clean Gospel texts.

**Targets:**
1. `matthew-kjv` — from KJV+Strongs epub
2. `mark-kjv` — from KJV+Strongs epub
3. `matthew-geneva` — from 1599 Geneva epub
4. `matthew-tyndale` — from Tyndale epub (Theospace 2012)
5. `matthew-douay-rheims` — from Douay-Rheims epub

**Comparison pairs for M3 validation:**
- Matt(KJV) vs Mark(KJV) — cross-book structural alignment
- Matt(KJV) vs Matt(Geneva) — KJV's direct predecessor
- Matt(KJV) vs Matt(Tyndale) — 85-year evolution
- Matt(KJV) vs Matt(Douay-Rheims) — Protestant vs Catholic

---

## Phase 1: Content Filter Module

**New file: `core/palimpsest/ingest/content_filters.py`**

Create `ContentProfile` dataclass with:
- `name: str` — profile identifier
- `strip_selectors: list[ElementSelector]` — elements to decompose (remove tag AND text)
- `promote_selectors: list[ElementSelector]` — elements to convert to `<h2>` headings
- `skip_file_patterns: list[str]` — spine items to skip (e.g., footnote-only files)
- `text_cleaners: list[Callable[[str], str]]` — regex post-processors on assembled text

`ElementSelector` dataclass with: `tag`, `classes` (set), `id_pattern` (regex), `text_pattern` (regex).

Core functions:
- `detect_content_profile(book) -> ContentProfile` — inspect metadata + sample HTML classes to auto-detect format
- `apply_content_filters(soup, profile) -> None` — decompose matching elements in-place
- `should_skip_spine_item(item, profile) -> bool` — check filename against skip patterns

**Predefined profiles:**

| Profile | Strip (decompose) | Keep (unwrap) | Text Cleaners |
|---------|-------------------|---------------|---------------|
| `literary` | nothing | everything | none |
| `bible-kjv` | `span.verses` | `span.red`, `small` | none |
| `bible-tyndale` | `span.versejump`, `span.displayReference`, `a.verse` | text spans | none |
| `bible-geneva` | `a[id*=FOOTNOTE]`, `a[id*=MIDDLENOTE]`, `sup.calibre5` (numeric-only text) | `span.ital` | skip `split_003` files |
| `bible-douay-rheims` | nothing (verse refs are plain text) | div content | `r"(?m)^\d+:\d+\.\s*"` strip |

Key insight: the parser's `NavigableString` walk already unwraps inline tags (keeps text, strips markup). The filter only needs to **decompose** elements whose text content is noise (verse numbers, footnote anchor characters).

---

## Phase 2: Integrate into epub_parser.py

**Modify `core/palimpsest/ingest/epub_parser.py`** (~15 lines):

1. Add `content_profile: ContentProfile | None = None` param to `parse_epub()`
2. Auto-detect if None: `profile = detect_content_profile(book)`
3. Pass profile to `_assemble_text(book, profile)`
4. In `_assemble_text()`, 3 insertion points:
   - Before spine loop: skip check via `should_skip_spine_item(item, profile)`
   - After `soup = BeautifulSoup(...)`: call `apply_content_filters(soup, profile)`
   - After `raw = _clean_assembled_text(raw)`: apply `profile.text_cleaners`

Existing literary epub behavior is unchanged — `literary` profile is a no-op.

---

## Phase 3: Thread Through Pipeline

**`core/palimpsest/project.py`** — add `content_profile` param to `ingest_file()`, pass to `parse_epub()` (~3 lines)

**`core/palimpsest/cli.py`** — add `--content-profile` option to `ingest` command (~8 lines)

**`core/palimpsest/server.py`** — no changes needed; auto-detection handles UI uploads

---

## Phase 4: Bible Book Extraction Script

**New file: `scripts/extract_bible_demo.py`**

Strategy: parse full Bible with correct profile, then slice by section boundaries.

```
for each target (book_name, epub_path, profile_name):
    result = parse_epub(epub_path, profile)
    book_start, book_end = find_book_boundaries(result.text, result.sections, book_name)
    book_text = result.text[book_start:book_end]
    save as temp .txt → ingest_file() → project in .scratch/demo/
```

Book boundary detection: find section heading containing book name, end at next book's heading. Book order list for NT provides the "next book" lookup.

Output: 5 project directories under `.scratch/demo/` ready for the Palimpsest browser.

---

## Phase 5: Tests

**New file: `core/tests/test_content_filters.py`**

- Filter correctness: KJV verse stripped, red-letter preserved, Geneva footnotes stripped, Tyndale versejump stripped, Douay-Rheims verse refs stripped
- Auto-detection: KJV metadata → `bible-kjv`, literary epub → `literary`
- Regression: literary epub through filter produces identical output

Use inline HTML fragments with BeautifulSoup, not full epub files.

---

## Verification

1. `pytest core/` — all existing + new tests pass
2. `tsc --noEmit` + `vite build` — frontend unchanged
3. Spot-check extracted texts:
   - Matt KJV 1:1: "The book of the generation of Jesus Christ..."
   - Mark KJV 1:1: "The beginning of the gospel of Jesus Christ..."
   - Matt Geneva 1:1: "The book of the generation of Jesus Christ..." (1599 spelling)
   - Matt Tyndale 1:1: "This is the boke of the generacion of Jesus Christ..."
   - Matt Douay-Rheims 1:1: "The book of the generation of Jesus Christ..."
4. No verse numbers, footnote markers, or cross-ref characters in any output
5. Upload a Bible epub via browser ImportDialog — clean text renders

---

## Files Changed

| File | Action |
|------|--------|
| `core/palimpsest/ingest/content_filters.py` | CREATE — profiles, filters, auto-detection |
| `core/palimpsest/ingest/epub_parser.py` | MODIFY — thread profile, 3 filter insertion points |
| `core/palimpsest/project.py` | MODIFY — add content_profile param |
| `core/palimpsest/cli.py` | MODIFY — add --content-profile option |
| `core/tests/test_content_filters.py` | CREATE — 10+ filter tests |
| `scripts/extract_bible_demo.py` | CREATE — extraction + ingestion script |
