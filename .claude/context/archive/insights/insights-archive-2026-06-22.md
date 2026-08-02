# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T16:21:04Z (4 entries)

### 2026-06-06 [8c61fff5815a]

The Swinehart data reveals something profound about text annotation: **it's not one thing, it's at least five fundamentally different information types coexisting on the same text**:
1. **Coordinate systems** — `pos` (narrative order) vs `seq` (chronological order) in chapters.csv are two independent coordinate frames for the same events, analogous to how genomics has physical position vs genetic map distance
2. **Entity markup** — `<gately>Gately</>` tagged inline in plotlines.csv, structurally identical to GFF3 feature annotations on a reference sequence
3. **Categorical overlays** — plotline groupings (`AA&R`, `E.T.A.`, `A.F.R.`) and theme tags (`Recur`, `Cycles`, `Fear/Obsess`) are independent classification systems applied per-passage
4. **Cross-references** — endnotes.csv maps ref_page → note_page ranges, creating a directed graph of textual links
5. **Free-text summaries** — capsule descriptions that compress a passage into a human-readable summary

CPudney's independent annotation of the same text uses different granularity (scenes vs sections) and different category systems, proving that annotation is inherently perspectival — exactly like how ENCODE vs Roadmap annotate the same genome differently.

### 2026-06-06 [cf9058f28ecd]

The genome annotation agent produced the most conceptually rich document in the entire corpus. Three standout insights:

1. **AllusionMasker (RepeatMasker analogue)**: Just as genome annotation must first mask transposable elements to prevent them from corrupting gene predictions, literary annotation should first detect and mask borrowed language (clichés, quotations, formulaic phrases) so that downstream analysis can distinguish original expression from intertextual material. The proposed **AllusioDB** — a hierarchical library of stock phrases classified like TE families (biblical allusions = LTR retrotransposons, clichés = SINEs, sustained classical allusions = DNA transposons) — is a genuinely novel research contribution.

2. **NarrativePseudofinder**: Detecting "literary decay" — narrative threads introduced but abandoned, arguments missing their warrants, motifs present without their traditional function. The dN/dS ratio analogue (structural vs. functional changes across drafts) could be applied to manuscript studies and editorial scholarship.

3. **ModeHMM with Roadmap-style joint training**: The proposal to train a rhetorical mode model by virtually concatenating 60+ texts — so that "Mode 4 = Free Indirect Discourse" means the same thing across all texts — is the single most powerful technical proposal in the entire research. This enables genuine quantitative cross-text comparison, which is the core scientific value proposition of Palimpsest.

### 2026-06-06 [baf43335e9b8]

**The annotation research corpus is complete.** 11 documents totaling **366KB** of structured analysis — roughly equivalent to a 120-page research monograph. The annotation-specific research (documents 07-10) produced three transformative architectural insights that reshape the PRD:

1. **The W3C Web Annotation Data Model** replaces any custom annotation format. It's JSON-LD, handles overlapping annotations natively, has real implementations (Hypothes.is, INCEpTION, Recogito), and the DHQ intertextuality ontology (Horstmann et al. 2023) provides a ready-made schema extension for book references. This means Palimpsest's data layer is a standards-based ecosystem, not a proprietary format.

2. **JBrowse 2's Adapter → Track → Display → Renderer architecture** is the correct foundation for the text browser. It separates data retrieval from visualization, supports multiple simultaneous view types (linear text view + chord diagram + contact map) from the same underlying data, and is React/TypeScript-native. The genome browser community already solved the multi-track overlapping annotation display problem.

3. **The genome annotation tool taxonomy maps 1:1 to literary analysis needs.** The 18 proposed Palimpsest tools (NarrativeMAKER, StyleBRAKER, AllusionMasker, ModeHMM, EchoFinder, etc.) aren't metaphors — they're concrete algorithmic specifications with defined inputs, outputs, and validation strategies. Each has a genomics proof-of-concept showing the algorithm works on analogous data.

### 2026-06-06 [f5fc1cf1f1bb]

The vision synthesis reveals that Palimpsest is not one product but a **platform-with-instances** architecture — more like WordPress (core + themes + plugins) than like a monolithic application. The key architectural decisions that enable this:

1. **Separation of Base (universal) from X (per-text)**: Base tracks are computed once and never require human input. X tracks emerge from reader-AI dialogue and accumulate intelligence. This means the platform gets smarter with every text analyzed — the library of X components grows, and transfer learning makes each subsequent analysis faster.

2. **LLMs as the "BRAKER" for every text type**: The fundamental challenge — that each text has unique features — is addressed by using LLMs as unsupervised feature discoverers. Instead of pre-engineering detectors for every possible literary structure, the platform uses LLMs to propose detection strategies that humans refine. This is the computational equivalent of a graduate student who can read any text and start generating hypotheses, but needs a professor to confirm which ones are sound.

3. **W3C Web Annotations as the universal connector**: By committing to a standard annotation format rather than a proprietary one, every X component automatically interoperates with every other component, with external tools (Hypothes.is, INCEpTION), and with the broader digital humanities ecosystem. The platform's data layer is an open standard, even as its analytical capabilities are proprietary intelligence.

# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T18:17:43Z (3 entries)

### 2026-06-06 [f8628133df8e]

A critical review of a roadmap should examine it on five dimensions:
1. **Completeness**: Does it cover everything the vision document promises?
2. **Ordering**: Are dependencies correctly sequenced? Are there hidden coupling points?
3. **Realism**: Are the time estimates honest? Are acceptance criteria testable?
4. **Fidelity to vision**: Does it actually build what the vision describes, or does it subtly drift toward a simpler, less interesting product?
5. **Structural integrity**: Are principles stated in the preamble actually followed in the milestones?

### 2026-06-06 [d6dd78a0ebe4]

The v2.0 roadmap addresses all 15 critical review findings. The most significant structural changes:

1. **Phase 0 eliminated.** Specs are defined by building them — the PAF format is defined by the first track that produces it, the LFO is defined by the first annotations that use it. No more waterfall-disguised-as-agile.

2. **LLM integrated from Week 3.** The AI assistant appears in Milestone 1.2 as a passage summarizer — the first touch of the "intelligent collaborator" experience. By the time the full X scaffold arrives in Phase 2, the user already expects AI-powered features.

3. **Cross-text comparison moved to Phase 1.** Milestone 1.4 includes a basic embedding-similarity dotplot between two texts. The *experience* of palimpsest — seeing hidden correspondence between texts — is present from the first release, even before the full alignment engine.

4. **Early X validation in Phase 2.** The custom "character presence" track for IJ tests the extension mechanism at week 16, not week 35. If the plugin architecture is fundamentally flawed, you find out 4 months in instead of 8.

5. **Active learning mechanism specified precisely.** It's few-shot prompt updating + logistic regression on embeddings, not LLM fine-tuning. With a regression guard: if retraining is worse, roll back.

6. **ModeHMM training corpus fully specified.** 60 Project Gutenberg novels, 6 genres × 10 each, 8 named binarized features, BIC model selection for state count.

### 2026-06-07 [75fb57ad0ed5]

The second critical review (12b) caught issues the first review couldn't see because they're about **implementation specifics rather than architectural choices**:

1. **PAF can't represent matrices and vectors** — the GFF3 span model doesn't fit self-similarity matrices, narrative arcs, or topic distributions. The fix: two format variants (PAF-Span for annotations, signals/ directory for non-span data). This is analogous to how genomics uses GFF3 for features and BigWig for continuous signals.

2. **The browser can't naively render 300 pages** — virtualized scrolling is architecturally necessary, not a polish item. It must be planned from Milestone 1.4, not discovered when the browser crashes on a full novel.

3. **Static file serving is correct for Phase 1** — a full REST API is premature when all data is read-only and there's a single local user. Static serving is three lines of FastAPI, fully debuggable, and the React PAF parsing code built for it transfers directly to Phase 2's REST API.

The Phase 1 plan specifies **every deliverable down to the day level** (50 working days across 10 weeks), with:
- Exact file paths for every component
- Exact Python and Node dependencies with version constraints
- A smoke test per milestone (not just at the end)
- A 70-test test plan across 5 testing levels
- 8 named benchmarks with specific performance targets
- A 17-item definition-of-done checklist

# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T21:05:10Z (3 entries)

### 2026-06-07 [7835b144d1ab]

This third review found a different class of issues than the first two. Reviews 1 and 2 caught **structural problems** (wrong phase ordering, missing sections, overloaded milestones). This review catches **protocol and forward-compatibility problems** — things that are invisible in Phase 1 but become expensive to fix in Phase 2+:

1. **The TrackRegistry gap is the most dangerous finding.** The entire project thesis is "X extends Base without modifying Base code." But Phase 1 hardcodes all tracks, which means Phase 2 will immediately violate this principle unless a registry/plugin pattern is established NOW. This is 50 lines of code but it's architecturally load-bearing.

2. **npz files can't load in browsers.** This is a straightforward technical error that would burn a day of debugging in Milestone 1.3b when the DotplotView tries to `fetch()` a NumPy archive. Storing raw Float32 binary with dimensions in the JSON manifest is simpler and faster.

3. **No relation support in PAF** means Phase 2's relationship annotations (character X knows character Y, passage X foreshadows passage Y) would require a PAF format break. Adding reserved `Target` and `Relation` attributes now costs nothing and prevents a v1.0→v2.0 migration.

4. **Copyright risk with IJ test fixtures** could block open-sourcing the project. Using Pride and Prejudice (public domain, similar length, well-studied) as the primary test text is strictly better.

The review also surfaces softer but important protocol gaps: no git workflow, no code quality tooling, no keyboard navigation, no search, no progress indicators. These are the difference between a research prototype and a tool someone would actually use.

### 2026-06-07 [48e6e92efcf3]

The revision strategy here follows a principle from software architecture review: **fix structural issues first, then correctness, then quality-of-life**. The 7 critical findings all concern forward-compatibility or correctness (TrackRegistry, signal format, PAF relations, provenance, metadata schema, public domain fixtures, determinism). Getting these right in Phase 1 prevents expensive refactoring in Phases 2-5 — the "cost of change" curve is steepest for format and extensibility decisions.

### 2026-06-07 [324ed0c37456]

The revised plan (document 14) resolves all 20 findings through three structural categories:

1. **Extensibility protocols** (§3): The `TrackExtractor` protocol + `TrackRegistry` is the most architecturally significant addition — it enforces the Base/X boundary that the entire project thesis depends on. Without it, Phase 2 would require editing Base code in 4 places to add a custom track. With it, a new track is a single Python class that auto-registers. The browser-side `TrackManifest` is the mirror image — new tracks specify their own rendering without touching React source.

2. **Format corrections** (§1.4, §2.1, §2.4, §2.5, §3.3): The npz→Float32 binary change is a correctness fix (browsers can't parse npz), but the metadata schema, pipeline provenance, reserved PAF attributes, and determinism policy are all about **preventing format breaks in Phase 2-5**. The cost of adding a `Target` attribute to the PAF spec now is zero; the cost of a breaking change to PAF v1.0 later is a migration for every existing project.

3. **Quality-of-life** (§7, §9): Layout wireframe, keyboard navigation, text search, and progress indicators aren't architectural — but they're the difference between a research prototype and a tool someone would actually use. Establishing the keyboard vocabulary now means Phase 2's annotation shortcuts extend a familiar system rather than retrofitting one.

# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T21:15:39Z (1 entries)

### 2026-06-07 [f9c319a85325]

The gap between "architecture validated" and "smoke test passes" is the rendering layer — specifically `AnnotationOverlay.tsx` and `DetailPanel.tsx`. These are ~200 lines of React code total. The stores already hold the right data; the adapters already parse it correctly; the keyboard handler already dispatches the right actions. The missing piece is the React components that subscribe to that state and paint `<mark>` elements over text. This is a relatively small amount of work compared to what's been built, but it's the difference between "infrastructure works" and "user-facing feature works."

The more systemic issue is the ABC-vs-Protocol deviation. This is a design decision that affects Phase 2's extensibility story — whether X tracks need to import from `palimpsest.tracks.base` (ABC) or can simply implement the right methods (Protocol). The plan chose Protocol deliberately for decoupling. This should be corrected before more extractors are built on the ABC pattern.

# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T21:37:05Z (1 entries)

### 2026-06-07 [52658d693643]

**The most interesting Round 2 finding** is I-1: the "track discovery" fix was illusory. The server returns 404 for directory listings, so `discoverTracks()` always falls through to the hardcoded list. The fix looked correct in isolation but failed at the integration boundary — exactly the kind of bug that adversarial reviews are designed to catch.

# Insights Archive — 2026-06-22
# Rotated: 2026-06-22T23:01:02Z (3 entries)

### 2026-06-07 [a569cb7ba98f]

**M1.2 Implementation Summary:**
- **4 new track extractors**: sentiment (VADER per-sentence), lexical (TTR/hapax/Yule's K per-paragraph), dialogue (regex quote detection with attribution), topics (LDA 10-topic with distribution signal)
- **Pipeline**: CLI writes manifests, explicit type guard on extract() return
- **Services**: OllamaManager, EmbeddingClient, LLMClient — all with graceful None-on-failure
- **Server**: `/api/projects/{id}/tracks` for discovery, `/api/summarize` POST for LLM
- **Browser**: TrackPanel, OverviewBar (density barcodes + search ticks), TextSearch (Ctrl+F, type-ahead, navigation), LLMSummary, LoadingOverlay
- **Tests**: 149 pass, ruff clean, tsc clean

### 2026-06-07 [c93e9e0e6225]

**FastAPI body parsing gotcha**: When a Pydantic model is defined inside the route function's enclosing scope (like `create_app()`), FastAPI sometimes can't resolve it as a request body parameter and treats the function argument as a query parameter instead. Moving the model to module scope fixes this — FastAPI's OpenAPI schema generation requires the models to be inspectable at import time.

### 2026-06-07 [80d6a5d6b7a4]

**M1.2 Review Cycle Complete — Summary of all changes:**

**Round 2 Python Fixes (13 items):**
- TopicsExtractor empty vocabulary crash → `try/except ValueError`
- Sentiment confidence formula → `0.5 + |v| * 0.4` (range 0.5–0.9)
- Dialogue per-pattern confidence → curly=0.92, straight=0.85, single=0.60, em-dash=0.70
- Registry double-instantiation → cached `_instances` dict
- Yule's K naming → `vocabulary_richness` → `yules_k` / `palimpsest:yulesK`
- Em-dash span/body mismatch → selector uses capture group offsets
- Summarize endpoint async → `asyncio.to_thread` wrapping
- Model field validation → Pydantic `Field(pattern=...)`
- Pydantic models moved to module scope (was causing 422 in tests)
- W3C export `@id` field → `urn:palimpsest:{project}:collection:{track}`
- CSV export → fully implemented (dynamic per-track columns)

**Round 2 Browser/TypeScript Fixes (10 items):**
- TrackPanel toggle → wired to `trackStore.toggleTrack`
- TextLinearView → filters by track visibility AND confidence threshold
- OverviewBar → click-to-navigate + visibility opacity
- DetailPanel → hook selectors instead of `getState()` in render
- Keyboard shortcuts → `1-9`, `0`, `[`, `]`, `?`, `Enter/Shift+Enter`
- Shared `TRACK_COLORS` → extracted to `utils/trackColors.ts`
- Evidence badges → in TrackPanel rows (not just DetailPanel)
- HelpOverlay → `?` now shows a keyboard shortcut reference modal
- ProjectPicker → dropdown populated by `/api/projects` on the welcome screen
- Confidence threshold → `collectVisibleAnnotations` respects `trackStore.confidenceThreshold`

**New Tests (+10):** Topics edge cases (2), sentiment confidence range (1), dialogue confidence (1), topics determinism (1), summarize endpoint (3), CSV export (1), W3C @id field (1)

**Final Score: 159 tests, ruff clean, tsc clean**

# Insights Archive — 2026-06-22
# Rotated: 2026-06-23T00:37:21Z (3 entries)

### 2026-06-07 [9054ad377286]

**The `re.IGNORECASE` bug**: When applied to a regex with multiple alternations via `|`, `IGNORECASE` affects ALL branches — including `[A-Z][A-Z\s]{5,}` which was specifically meant to match only uppercase. The fix uses Python 3.6+ inline flags `(?i:...)` to scope case-insensitivity to only the "chapter" branch, leaving the ALL-CAPS and Roman numeral branches case-sensitive as intended.

### 2026-06-07 [5ee434f4ceca]

**Critical fixes applied this round:**
1. **C-1 (Section detector)**: `re.IGNORECASE` removed from the combined pattern; only the `chapter` branch uses inline `(?i:...)` — the ALL-CAPS and Roman numeral branches are now case-sensitive as intended. This eliminates hundreds of false section annotations per real document.
2. **I-1 (CSV crash)**: `getattr(sel, "start", "")` guards against selectors without positional attributes.
3. **I-2 (Manifest loading)**: `projectStore` now fetches `manifests/{name}.manifest.json` and uses real color schemes + evidence levels. TrackPanel reads from manifests with fallback to static dict.
4. **I-3 (d3)**: Removed unused 600KB dependency from production bundle.
5. **Per-extractor error handling**: Each extractor in `analyze` is wrapped in try/except — a crash skips that track with a warning instead of aborting the entire pipeline.

### 2026-06-07 [6b4bd400872b]

**Root cause of unresponsiveness**: The current architecture does O(paragraphs × annotations) = **48 million comparisons per render**. All 18,760 annotations exist as individual JS objects (~50-75MB heap). All 2,569 paragraphs are live DOM nodes. Every track toggle triggers a full re-render of the entire tree. This fundamentally cannot be fixed within the React+browser model at the scale you need.

**Recommended stack**: **Tauri 2.0 + Rust core engine + WebGPU-accelerated frontend**
- 300KB packed annotations instead of 75MB JS objects (250x memory reduction)
- SIMD-filtered range queries in <50μs instead of 48M comparisons
- Virtual scroll: 50 DOM nodes instead of 50,000+
- GPU density plots via compute shaders
- Python NLP runs as managed subprocess — UI never blocks

# Insights Archive — 2026-06-22
# Rotated: 2026-06-23T03:44:46Z (2 entries)

### 2026-06-07 [7c7c8243dc92]

**Benchmark Results — Rust Core Engine on M4 Max:**

| Operation | Time | vs. Target | vs. React |
|

### 2026-06-07 [b19d47d83170]

**M1.3a + M1.3b Implementation Summary:**

**M1.3a completed items:**
- `/api/search` similarity endpoint — queries VectorStore via Ollama embedding, returns scored paragraph hits with text snippets. Gracefully returns `embedding_available: false` when no embeddings or Ollama.
- `topics_dist` now tracked in `pipeline_run.json` `signals_computed` — fixed via post-extraction signal directory scan in `cli.py`.

**M1.3b completed items:**
- **CoreferenceExtractor** (`tracks/coreference.py`) — BookNLP integration with graceful `FileNotFoundError` fallback. Parses BookNLP `.tokens` output for coref chains, produces `CoreferenceAnnotation` W3C objects. Reports availability in `parameters()`.
- **DotplotView** (`browser/src/components/DotplotView/DotplotView.tsx`) — Canvas-rendered N×N self-similarity heatmap with:
  - 5-stop blue color ramp interpolation
  - Hover crosshair with cell value tooltip
  - Click → navigate to row paragraph; Shift+click → column paragraph
  - Loading/error states for missing embeddings
  - Integrated into AppLayout as collapsible bottom panel (`d` key toggle)
- **Linked views** — DotplotView click triggers `requestScrollToParagraph()` via Zustand; TextLinearView subscribes and scrolls to target. Zero additional wiring needed — architecture was already in place.

**Architecture note:** The `d` keyboard shortcut, `dotplotOpen` state, and `scrollToParagraphRequest` mechanism were already scaffolded in viewStore/keyboard.ts from M1.2. The DotplotView just plugs into the existing reactive pipeline.

