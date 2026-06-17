# M3: Two Texts — Implementation Plan

## Context

Palimpsest currently analyzes a single text. M3 introduces pairwise comparison: align two texts, compute diffs, and visualize correspondence across multiple views. This is the "BLAST" of computational literary analysis — the first comparative operation.

**Demo data**: `dr-jekyll-and-mr-hyde` + `pride-and-prejudice` in `.scratch/demo/`
**Prerequisite**: All M1+M2 code is shipped and pushed (commit `864bd72`).
**No alignment code exists** — this is entirely new.

---

## Architecture Decisions

1. **Multi-project**: Refactor `projectStore` to `Record<string, SingleProjectState>` with `activeProjectId` + `secondaryProjectId`. Backward-compat via convenience selectors.
2. **Alignment engine**: New `core/palimpsest/alignment/` module (not a track extractor — alignment is cross-project, doesn't fit the single-project `extract(project)` protocol).
3. **Compare tab**: New tab (Alt+6) with sub-views: Alignment | Dotplot | Synteny | Circos | Diff.
4. **Comparative dotplot**: Generalize existing `DotplotView` from NxN to NxM, reusing all zoom/pan/scrollbar/export infrastructure.
5. **Storage**: `{workspace}/.comparisons/{queryId}_vs_{targetId}/` with alignment.jsonl + cross_similarity.bin/.json.

---

## Phase 0: Foundation (projectStore refactor + Compare tab)

**Goal**: Multi-project loading works, Compare tab appears, no new features yet.

### 0.1 Refactor projectStore for multi-project
- `browser/src/stores/projectStore.ts` — restructure: `projects: Record<string, SingleProjectState>`, `activeProjectId`, `secondaryProjectId`
- Create `useActiveProject()` convenience hook so existing components need minimal changes
- Update all consumers (mechanical: `s.metadata` → `useActiveProject().metadata`)

### 0.2 Create comparisonStore
- New `browser/src/stores/comparisonStore.ts` — alignment records, cross-similarity matrix, comparison mode, loading state

### 0.3 Add Compare tab
- `viewStore.ts` — extend `TabId` with `'compare'`, add `compareSubView` state
- `TabBar.tsx` — add "Compare" entry (Alt+6)
- `AppLayout.tsx` — route Compare tab to new `CompareView` container
- New `browser/src/components/CompareView/CompareView.tsx` — sub-nav (Alignment | Dotplot | Synteny | Circos | Diff) + secondary project picker

---

## Phase 1: Alignment Engine (backend)

**Goal**: Given two project IDs, compute pairwise alignment and return records.

### 1.1 AlignmentRecord data model
- New `core/palimpsest/alignment/records.py`
- Fields: query_id, query_start/end, target_id, target_start/end, score, p_value, method, strand, identity

### 1.2 Cross-similarity matrix
- New `core/palimpsest/alignment/cross_similarity.py`
- Reuse pattern from `tracks/self_similarity.py` lines 46-83 (load embeddings via SqliteVecStore, L2-normalize, matrix multiply)
- Instead of `A @ A.T` (NxN), compute `A @ B.T` (NxM)

### 1.3 Smith-Waterman local alignment
- New `core/palimpsest/alignment/smith_waterman.py`
- Score function: cell values from cross-similarity matrix
- Affine gap penalty (open=-2, extend=-0.5)
- Traceback → AlignmentRecord list
- NumPy vectorized DP for performance (~6M cells for 2500x2500 is fine)

### 1.4 Gumbel significance testing
- New `core/palimpsest/alignment/gumbel.py`
- Shuffle one sequence 100x, compute SW score each time
- Fit Gumbel(mu, beta), compute p-value for actual score

### 1.5 Narrative alphabet alignment
- New `core/palimpsest/alignment/alphabet_align.py`
- Read alphabet sequences from `signals/alphabet.json` → `metadata.sequence`
- SW on discrete symbols (match=+2, mismatch=-1)
- Extremely fast (milliseconds)

### 1.6 API endpoints
- `POST /api/alignment/run` — body: {query_id, target_id, method} → background job
- `GET /api/alignment/{q}/{t}/status`
- `GET /api/alignment/{q}/{t}/records` → JSON
- `GET /api/alignment/{q}/{t}/matrix` → serve binary + manifest
- Storage: `{workspace}/.comparisons/{q}_vs_{t}/`

---

## Phase 2: Alignment Visualization (ribbon view)

**Goal**: Select two projects, see aligned passages connected by ribbons.

### 2.1 CompareProjectPicker
- New `browser/src/components/CompareView/CompareProjectPicker.tsx`
- Lists projects (excluding active), triggers secondary load + alignment run

### 2.2 AlignmentView (ribbon visualization)
- New `browser/src/components/CompareView/AlignmentView.tsx`
- Split panel: left = project A text, right = project B text
- Center SVG ribbon layer connecting aligned paragraph ranges
- Ribbons colored by score; click → scroll both panes to aligned passages

### 2.3 Alignment method selector + run controls
- Dropdown: Semantic | Alphabet | Word
- "Run Alignment" button → triggers `/api/alignment/run`
- Progress indicator + stats display (record count, top score, median p-value)

---

## Phase 3: Edition Comparison

**Goal**: Character-level diff between two editions.

### 3.1 Diff engine
- New `core/palimpsest/alignment/edition_diff.py`
- Paragraph-level LCS alignment, then per-paragraph `difflib.SequenceMatcher`
- Output: DiffRecord list + DiffSummary (counts, density per section)

### 3.2 Diff API
- `POST /api/alignment/diff` + `GET /api/alignment/{q}/{t}/diff`

### 3.3 DiffView component
- New `browser/src/components/CompareView/DiffView.tsx`
- Inline color-coded changes (green=insert, red=delete, yellow=substitute)
- Diff statistics panel; toggle unified vs side-by-side

---

## Phase 4: Comparative Dotplot

**Goal**: NxM heatmap showing cross-text similarity.

### 4.1 Generalize DotplotView
- Modify `DotplotView.tsx` — accept `mode: 'self' | 'comparative'` prop
- Split `span` into `spanX`/`spanY` for non-square matrices
- Comparative mode loads from `/api/alignment/{q}/{t}/matrix`
- Axis labels from different projects on X vs Y
- Overlay alignment records as colored rectangles

---

## Phase 5: Synteny View

**Goal**: Two stacked linear views with connecting ribbons.

### 5.1 SyntenyView component
- New `browser/src/components/CompareView/SyntenyView.tsx`
- Top: linear view of project A (reuse TrackLane rendering from BrowserView)
- Bottom: linear view of project B
- Middle: SVG ribbons from alignment records; crossed ribbons = inversions

### 5.2 Coordinated selection
- New `browser/src/stores/coordinationStore.ts`
- Selection in any view propagates: {projectId, paragraphRange}
- Views subscribe and highlight corresponding regions

---

## Phase 6: Circos View

**Goal**: Circular arc diagram for relationship visualization.

### 6.1 CircosView component
- New `browser/src/components/CompareView/CircosView.tsx`
- SVG circular layout: text positions → angles (0-360)
- Single-project mode: arcs from endnote cross-references
- Comparative mode: two concentric arcs, ribbons between aligned regions
- Click arc → navigate to passage pair

---

## New Files (26 total)

**Backend** (10): `alignment/__init__.py`, `records.py`, `cross_similarity.py`, `smith_waterman.py`, `gumbel.py`, `alphabet_align.py`, `scoring.py`, `edition_diff.py`; tests: `test_alignment.py`, `test_edition_diff.py`

**Frontend** (8): `comparisonStore.ts`, `coordinationStore.ts`, `CompareView.tsx`, `CompareProjectPicker.tsx`, `AlignmentView.tsx`, `DiffView.tsx`, `SyntenyView.tsx`, `CircosView.tsx`

**Modified** (6): `projectStore.ts`, `viewStore.ts`, `TabBar.tsx`, `AppLayout.tsx`, `DotplotView.tsx`, `server.py`

---

## Verification

After each phase:
1. `npx tsc --noEmit` — TypeScript clean
2. `.venv/bin/python -m pytest core/` — 214+ tests passing
3. `npx vite build` — production build succeeds
4. Screenshot regression across all tabs via Playwright
5. Phase 1 specifically: unit test SW alignment on small synthetic texts, verify Gumbel p-values against known distribution
6. Vision gate (Phase 6): "Load Jekyll, open Circos, see endnote arcs, click arc → navigate to passage pair"
