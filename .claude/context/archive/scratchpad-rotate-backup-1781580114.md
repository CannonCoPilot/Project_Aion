# Scratchpad — Short-Term Working Memory

**Purpose**: Transient details needed within this session or the next 1-2 sessions.

---

## Active Notes

### 2026-06-15 PM — Palimpsest track-toggle regression FIXED + full tsc cleanup (UNCOMMITTED)

**Working dir**: `/Users/nathanielcannon/Claude/Projects/palimpsest/` (repo `CannonCoPilot/palimpsest`, branch `main`).
**State**: 18 files modified + 1 new test, ALL UNCOMMITTED. Build GREEN. 315 backend + 21 frontend tests pass. NOT yet browser-verified live (user was doing visual review when refresh triggered).

#### What this session did (post-audit remediation):
Re-verified the Jun 12–15 sprint with a skeptical eye; found two prior "fully remediated" claims OVERSTATED, then fixed them + cleaned all tsc errors to green.

**1. Track-toggle regression — TWO root causes, both fixed:**
- **Number-key toggles crashed (functional):** `keyboard.ts:36` read `useProjectStore.getState().paragraphs` but multi-project refactor moved it under `getActiveProject(state)` → `undefined.length` threw on every plain keypress before reaching number cases. FIX: `getActiveProject(useProjectStore.getState()).paragraphs`. Same store-shape crash ALSO broke `TextSearch.tsx` (lines 22,45 — note line 45 had 4-space indent so the 6-space replace_all missed it; fixed separately) and `AnnotationContextMenu.tsx` (18,26,44 — copy/navigate/show-all-mentions). All fixed via `getActiveProject(...)`.
- **Mouse toggle slow (perf):** `AnnotationOverlay` was React.memo'd but subscribed internally to whole `tracks` map (defeats memo) AND every paragraph overlay got the FULL annotation array + re-filtered O(N×A) per toggle. FIX: trackStore now exports `useTrackVisibility(name)` (granular bool) + `useTrackManifests()` (useShallow — manifests preserve reference across toggle since `toggleTrack` does `{...track, visible:!v}` keeping manifest ref). AnnotationOverlay reads manifests only. TextLinearView added `bucketAnnotationsByParagraph(paragraphs, annotations)` (binary search on para.start; keyed by p.index for char-filter safety; EXPORTED + unit-tested 6 cases in TextLinearView.test.ts) + `annotationsByPara` memo in main component, passes per-para slices to all 3 overlay views (Virtualized/Simple/Sentence). Net O(N×A)→O(A) per toggle.

**2. tsc cleanup 44→0 (build green):**
- Removed sprint-introduced TS6133 dead code: DotplotView (loadSignal import, FixedTextPanel `palette` prop+call site, `metricInfo` binding→`const [, setMetricInfo]`), AnnotationOverlay (`text` param of buildSegments + call site, whole `buildAnnotationTitle` fn), TextLinearView (`ZoomLevel` import), BrowserView (`charWidth`), CooccurrenceHeatmap (`v`→`_v`), CircosView (removed `totalCharsB`+`charToAngleB`), CoordinateRuler (unused `referenceText`).
- React-19 JSX namespace: `JSX.Element`→`ReactElement` (added `type ReactElement` to react import) across BrowserView, HelpOverlay, ImportDialog, ProjectPicker, SectionNav, LLMSummary, StateExplainer, DotplotView, AnnotationOverlay, TextLinearView, TextSearch. DetailPanel uses UMD-global React (no react import) → used `React.JSX.Element` there.
- ProjectStoreState drift fixed via getActiveProject (see #1 — TextSearch, AnnotationContextMenu, keyboard.ts).

#### Verify commands:
```bash
cd palimpsest && .venv/bin/python -m pytest core/tests/   # 315 pass
cd palimpsest/browser && npm test                          # 21 pass (15 + 6 new bucketing)
cd palimpsest/browser && npm run build                     # tsc -b && vite build → GREEN
```

#### Servers RUNNING (background, started this session for user's visual review):
- Backend: `.venv/bin/palimpsest serve .scratch/demo --port 8080` (PID ~96461)
- Vite: `cd browser && npx vite` → http://localhost:5173/  (proxies /api,/data → :8080)
- Open: http://localhost:5173/?project=dr-jekyll-and-mr-hyde  (KJV Matthew: ?project=gospel-of-matthew-kjv)
- Cleared 6 stale vite servers (Sat/Wed/Mon) at session start.
- NOTE: these background bash tasks likely die on context refresh — may need relaunch.

#### NEXT STEPS (pick up here):
1. User was doing visual review of: Reading-tab track toggle responsiveness, number-key 1-9 toggles, Ctrl+F search, right-click annotation context menu, KJV-Matthew "hesaid" parsing, Jekyll drop-cap over-insertion edge case ("T he"/"I t").
2. AWAIT user's visual-review feedback; fix anything off.
3. THEN COMMIT (user said "I'll commit once you're satisfied" — get explicit go-ahead). Changes uncommitted in palimpsest repo.
4. Untracked & intentionally excluded: `.claude/`, `browser/self-similarity-test.mjs`, `research/UI/screenshots/Screenshot 2026-06-15...png`. New test `browser/src/components/TextLinearView/TextLinearView.test.ts` SHOULD be committed.

#### Known OPEN items (not fixed, flagged to user):
- B3 epub concatenation fix (epub_parser.py:245-248) is real but UNTESTED + drop-cap over-insertion risk.
- Multi-resolution view-switching, 4-dir alignment, chapter gridlines, alignments panel: code-present but NOT behavior-verified this session.

#### Self-correction this session: accidentally wiped session-state.md by misusing `protected-edit.py --write` WITH `--old/--new` (—write reads stdin → wrote empty). RESTORED from session-start Read + corrections (142 lines). LESSON: `--write` = overwrite-from-stdin (pipe full content via heredoc); for in-place edits use `--old/--new` WITHOUT `--write`.

---

#### Prior context (2026-06-15 AM — superseded, kept for reference):
- 4 commits PUSHED to origin/main: `03f7fde` (4 critical), `fb69e6c` (W1-W9), `9731e52` (route fix+tests), `61e332a` (Vitest scaffold). Those remain valid; this session's work is ON TOP and uncommitted.
- App run: `cd palimpsest && .venv/bin/palimpsest serve .scratch/demo --port 8080`; `cd browser && npx vite`.

---

### 2026-06-15 PM (late) — Palimpsest landing-page overhaul + Book Store (COMMITTED + PUSHED @ 12c9df4)

**Working dir**: `/Users/nathanielcannon/Claude/Projects/palimpsest/` (repo `CannonCoPilot/palimpsest`, branch `main`). Separate repo from Project_Aion.

**COMMITTED this session (2 commits, NOT pushed — `main` ahead of origin/main by 2):**
- `86763d5` fix: track-toggle regression + tsc cleanup to green build (18 files — the PRIOR session's work, finally committed).
- `5907866` feat: macOS Books-style landing page with launchpad + EPUB cover support (6 files: ProjectPicker.tsx, AppLayout.tsx, core/palimpsest/ingest/epub_parser.py, project.py, server.py, core/tests/test_cover.py).
- User chose "two logical commits" via AskUserQuestion. Author identity already correct (CannonCoPilot noreply).

**UNCOMMITTED (in-progress — the Book Store work):**
- Modified `browser/src/components/common/ProjectPicker.tsx` (Book Store view added).
- 3 NEW binary assets: `browser/public/store/{early-christian-writings,sacred-texts,annas-archive}.png` (1200x675 header screenshots, ~150-500KB each).
- Build GREEN, browser-verified (3 tiles render, thumbnails load 200/image-png, links target=_blank rel=noopener, nav works, 0 console errors).
- RESOLVED 2026-06-15 PM: committed 12c9df4 (code only); PNGs gitignored (browser/public/store/*.png); pushed origin/main (61e332a..12c9df4). Gate CLOSED.

**ProjectPicker.tsx is now the full landing page — 3 views via local `page` state ('home'|'library'|'store'):**
- Home (default): launchpad — hero, "Your texts" covers, "Analysis tools" 6-card grid (reading/browser/texthic/characters/analysis/compare). Tool click → sets pendingTab → routes to library → picking a text opens it directly in that viewStore tab (or import wizard if library empty).
- Library ("All"): cover grid; gradient covers for art-less texts; real EPUB cover img preferred (onError→gradient).
- Book Store: launchpad of external sites (StoreTile = screenshot thumb + name/desc/domain, onError→tinted gradient fallback). Sites: earlychristianwritings.com, sacred-texts.com/cat/index.htm, annas-archive.gl.
- Sidebar: Home / Book Store / LIBRARY(All, Started, Finished, Novels, Translations, Papers, Scholars) / MY COLLECTIONS(New Collection→import) / user. Removed: Audiobook Store, Audiobooks, PDFs. Library filter items below "All" are still decorative (not wired to real filters).
- Import wizard = accessible modal (role=dialog, aria-modal, Escape-to-close, focus trap + restore).

**Backend (committed in 5907866):** EPUB cover extraction `_extract_cover` (3 strategies: ITEM_COVER → OPF meta name=cover → name-based; name-based is the one that works on real files) in epub_parser.py; `cover_extension()`; ingest writes `cover.<ext>` + metadata.cover; `/api/projects` returns `cover` URL via `_find_cover_url` (metadata field or glob cover.*), served by existing `/data` route. Full backend suite = 322 passing (315 + 7 new cover tests).

**Servers (background, may die on refresh):** backend `:8080` = `.venv/bin/palimpsest serve .scratch/demo --port 8080` (bg task brt5ys26z); vite `:5173`. NOTE: I restarted backend this session to pick up new server.py. Library is currently EMPTY (`.scratch/demo` has no project dirs — user cleared all 7 earlier; I imported pride-prejudice-ch1 to test then removed it).

**Excluded untracked (intentional, do NOT commit unless asked):** `.claude/`, `browser/self-similarity-test.mjs`, `research/UI/screenshots/Screenshot 2026-06-15 at 2.34.48*.png` (the macOS Books reference the user pasted).

**Verify commands:** `cd palimpsest/browser && npm run build` (tsc -b + vite build, GREEN) · `npm test` (21 pass) · `cd palimpsest/core && .venv/bin/python -m pytest -q` (322 pass).

**NEXT STEPS (pick up here):** 1) DONE — Book Store committed 12c9df4 (code only) + PNGs gitignored + pushed origin/main (61e332a..12c9df4). 3) Note: site thumbnails are point-in-time screenshots — may go stale if sites redesign; offered to re-capture. 4) Optional: wire the decorative Library filter items (Started/Novels/Translations/etc.) to a real metadata `category` field.

---

### 2026-06-15 PM (import pipeline) — Palimpsest 5-step staged import + masking (IN PROGRESS, UNCOMMITTED)

Working dir: /Users/nathanielcannon/Claude/Projects/palimpsest (repo CannonCoPilot/palimpsest, main). Tasks #1-#10 in session task list.

DONE + TESTED (uncommitted; Phase A held uncommitted per user "hold, keep building"):
- #1 B3 drop-cap: epub_parser.py _needs_separating_space() suppresses space when lone UPPER+lower across element boundary. test_epub_parser.py (6).
- #2 Import dialog dark restyle: ImportDialog.tsx full rewrite (Tailwind dark) + ImportModal close moved INSIDE panel + dark bg (ProjectPicker.tsx).
- #3 imports/ browser: server.py GET /api/imports + POST /api/import/local (path-based, traversal-safe), _default_imports_dir() (env PALIMPSEST_IMPORTS_DIR else <repo>/imports), create_app(workspace, imports_dir=None). test_import_local.py (4).
- #5 staged import: _ingest_and_compute split into _ingest_only (Step1) + _compute_tracks (Step5, mask-gated). import endpoints take process flag (False=staged).
- #6 detection: layout.py detect_layout_sections() (front_matter pre-1st-chapter; chapter/book/volume by heading regex+levels; endnotes from coordinates endnote_separator).
- #8 backend mask: layout.py LayoutSection/LayoutConfig -> layout_sections.json; deepest-section-wins masked_intervals(); DEFAULT_MASK_BY_TYPE (all True except chapter); Project.masked_intervals(); central annotation gating in _compute_tracks. test_layout.py (9) test_sections_api.py (5).
- Endpoints: POST /projects/{id}/sections/detect, GET/PUT /sections, POST /sections/apply.
- GOTCHA: `from __future__ import annotations` makes nested Pydantic BaseModel unresolvable by FastAPI -> request models MUST be module-level.

DESIGN (user-approved): masking = deepest/smallest-span section wins, uncovered=unmasked, nesting via parent_id (chapter<book<volume<work), default mask=yes all except chapter. 12 fixed types in layout.SECTION_TYPES/COLORS. Masked render #f5f5f5 on #3a3a3d. Bird's-eye: VERTICAL minimap=default+editable; HORIZONTAL depth-lanes=view-only.

REMAINING: #4 parser hardening (audit .scratch/epub_audit.py: skip bs4 Comment nodes; read_epub crash-tolerance; TOC/CSS heading fallbacks; Geneva/KJV profiles; OceanofPDF watermark). #7 frontend bird's-eye map. #9 Browser masked rendering. #10 5-step wizard wiring (replace ImportDialog). #8 wire self_similarity chunk masking to layout masks.

Verify: cd browser && npm run build (GREEN) + npm test (21). pytest core/tests/test_layout.py test_sections_api.py test_import_local.py test_epub_parser.py (all green, 24). NOT browser-verified.
UPDATE (same session, later): FRONTEND + parser P0 DONE (build GREEN, NOT browser-verified; servers up :8080/:5173).
- #7 SectionMinimap.tsx: vertical editable workbench (drag boundary handles, click-select, right-click add/change-type/delete, mask gutter, paragraph snap) + horizontal view-only depth-lanes. #10 ImportWizard.tsx: 5-step (Scan/Detect/Map/Mask/Apply) replaces ImportDialog (deleted); ProjectPicker renders ImportWizard. sectionStore.ts + utils/sectionMasking.ts (TS port of deepest-section masking).
- #9 BrowserView TickerTape renders masked ranges near-white(#f5f5f5)/dark-gray(#3a3a3d); projectStore.loadProject fires sectionStore.load so masks show on direct open.
- #4 P0: epub_parser skip bs4 Comment nodes + read_epub try/except retry; layout regex fix for 'Chapter1'/'Part'. 70 backend tests pass across changed areas.
- LIVE-VERIFIED backend via curl: staged import Emma (158k words, staged=True, 2 tracks) -> detect -> 59 sections (1 front_matter/3 volumes/55 chapters, nested), masked 787/879918 chars.
- REMAINING: #4 P1/P2 (TOC/CSS heading fallbacks, Geneva/KJV profiles, watermark); #8 self_similarity chunk masking. Phase A + all this UNCOMMITTED. Apply (Step5) runs full analysis — not live-run (heavy).
RESUME POINTER (context refresh): Palimpsest 5-step import pipeline — 8/10 tasks done, 2 partial (#4 parser P1/P2, #8 self_sim gating). ALL UNCOMMITTED in /Users/nathanielcannon/Claude/Projects/palimpsest (branch main). Phase A also uncommitted.
- Servers WERE running (backend PID was 86131 :8080 via `.venv/bin/palimpsest serve .scratch/demo --port 8080`; vite :5173 via `cd browser && npx vite`) — likely die on refresh, relaunch if needed. Logs: .scratch/backend.log, .scratch/vite.log.
- Emma is staged in .scratch/demo (project id emma-jane-austen-1816-60e8e3cd954f267861dbb8e8ffd094cd-anna-s-archive) WITH layout_sections.json already detected (59 sections) — good for visually testing masked rendering in Browser view.
- VERIFY: cd palimpsest/browser && npm run build (GREEN); npm test (21); cd palimpsest && .venv/bin/python -m pytest core/tests/test_epub_parser.py core/tests/test_import_local.py core/tests/test_layout.py core/tests/test_sections_api.py (all green; 70 across changed areas incl test_server/test_cover/test_content_filters).
- PENDING USER DECISION (asked, unanswered): continue remaining #4 P1/P2 parser fallbacks + #8 self_similarity chunk masking, OR pause for user to click through the wizard at :5173 first. NOT browser-verified: wizard drag/right-click interactions; Step-5 Apply (heavy analysis) not live-run.
- Files added: core/palimpsest/layout.py; browser/src/{stores/sectionStore.ts, utils/sectionMasking.ts, components/import/ImportWizard.tsx, components/import/SectionMinimap.tsx}. Deleted: browser/src/components/common/ImportDialog.tsx. Edited: server.py, project.py, epub_parser.py, ProjectPicker.tsx, BrowserView/BrowserView.tsx, projectStore.ts. New tests: test_epub_parser.py, test_import_local.py, test_layout.py, test_sections_api.py.