# Insights Archive — 2026-06-20
# Rotated: 2026-06-21T05:33:28Z (6 entries)

### 2026-06-06 [f7fbb3d93979]

The window layout reorder confirms the launcher refactor: `WINDOW_ORDER="Jarvis-dev Styx Commands Watcher Virgil Ennoia MLX-Embed Ollama LiteLLM HUD Protos Jarvis"` — Jarvis-dev and Styx are now explicit named entries. The window indices shifted because the order changed, but JICM correctly targets by name (`aion:0` = Jarvis window) not index.

### 2026-06-06 [aa27db58e227]

- **66K vs the predicted 20-30K**: The difference is Alfred's `session-start.js` hook injecting `additionalContext` (compaction essentials, session state, etc.) plus Alfred's own hooks CLAUDE.md content and tool schemas. Still well under any autocompact threshold at 7% of the 1M context.
- **The `Enter` key race**: `send-keys 'text' Enter` in a single call concatenates the text and Enter — but Claude Code's input handler may buffer the paste and not treat the trailing Enter as a submission. Splitting into `send-keys 'text'` then `send-keys Enter` is more reliable. The launch script should use this two-step pattern.
- **Session UUID capture**: Now that Protos responded, the JSONL file exists under `~/.claude/projects/`. The bridge's `_capture_seed_session_id()` will find it on its next `ensure_seed()` call.

### 2026-06-06 [e0bbf1bdbb0f]

- **The research corpus forms three concentric rings**: the inner ring is the alignment paradigm (genome → protein → text alignment algorithms), the middle ring is visualization (Circos, genome browsers, Swinehart's narrative visualizations), and the outer ring is the NLP/literary analysis methods that generate the data to be aligned and visualized. Palimpsest sits at the center where all three rings intersect.
- **Moretti's honest failure is instructive**: his "Network Theory, Plot Analysis" concluded that visualization alone was "difficult to interpret" — the Stanford Literary Lab pivoted toward computable metrics. Palimpsest should learn from this and always pair visual representations with quantifiable measures (degree centrality, clustering coefficient, cosine similarity scores).
- **The "structural alphabet" concept from Foldseek** is the single most transferable idea: just as Foldseek encodes 3D protein folds as 1D sequences enabling fast search, Palimpsest could encode narrative structure (scene types, dialog density, POV shifts, tense changes) as a "narrative alphabet" enabling structural comparison across texts at scale.

### 2026-06-06 [ae404b3535b4]

- **The narrative alphabet immediately reveals structural fingerprints.** Moretti's "Distant Reading" shows `CCHCL` at the start (short preamble + copyright segments) followed by dense `EFDFFFHDFHI` blocks — the analytical essays that make up the core. The trailing `PPPG` marks the index/bibliography. This is a "structural barcode" you can compare across books without reading them.
- **Chapter detection accuracy vs. paragraph-level for PDFs**: The 249 segments vs. 253 pages means the chapter detector found almost one heading per page — which is actually _wrong_ for a book PDF. That's because PDF text lacks semantic structure; the heading regex matches figure labels, numbered references, etc. For PDFs, **paragraph-level segmentation is more reliable** than chapter-level. EPUB preserves actual document structure (each `<body>` section) and is the preferred format for chapter-level analysis.
- **The pipeline's composability is the key design win**: you can re-segment at different granularities without re-extracting or re-cleaning. `extract → clean → segment:sentence → signal → encode` and `extract → clean → segment:chapter → signal → encode` share the first two stages. This is why JSON intermediate output matters.

### 2026-06-06 [47927452ecb3]

- **The 5-layer architecture** (Data Handling → Analysis → Alignment → Visualization → Annotation) mirrors the flow of information in biology: raw sequence → functional annotation → comparative genomics → genome browser → manual curation. Each layer depends on the ones below it but produces outputs that the layers above consume.
- **The MVP scope intentionally excludes alignment** — because single-text analysis is independently useful and testable without the complexity of pairwise operations. This mirrors how genome annotation projects (GENCODE, ENCODE) first built single-genome tools before tackling comparative analysis.
- **Phase 2 (pairwise alignment) is where Palimpsest becomes genuinely novel.** Most digital humanities tools do either close reading support (annotation tools) OR distant reading (corpus statistics). Palimpsest's alignment layer bridges them — it's the computational equivalent of what textual scholars do manually when comparing editions, but scaled to arbitrary pairs and with statistical significance testing.

### 2026-06-06 [b640c72cf400]

- **49 papers/books** on disk now across 5 categories, up from 44. New additions: Bamman coreference dataset, Kim Story Curves, Mann-Thompson RST, Jänicke close/distant reading survey.
- **7 domain synthesis documents** produced, totaling ~162KB of structured analysis. The four deep-read reports cover all 37+ sources from unique analytical angles — genomics as architectural metaphor, NLP as algorithmic toolkit, literary studies as methodological framework, visualization as UI specification.
- The only papers we couldn't obtain are **Tanahashi & Ma (2012)** (IEEE paywall, no preprint) and **Krautter (2023)** (upstream unavailable). Both are lower priority — Tanahashi's key ideas are already incorporated into the ILP crossing minimization paper we have, and Krautter's "scalable reading" concept is discussed in several of the books we do have.

