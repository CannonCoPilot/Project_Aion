# P7 — `self_similarity` redesign as a layer-consumer (Wave-0)

> STATUS: PLAN COMPLETE, awaiting refresh + approval. Repo: /Users/nathanielcannon/Claude/Projects/palimpsest (branch main). Venv: core/.venv/bin/python. P8 already COMMITTED+PUSHED (origin/main=1728ac0). This plan is the durable record of the P7 design produced 2026-06-28 (in plan mode, interrupted by JICM refresh).

## Context
P7 turns `self_similarity` from an inline chunk/embed PRODUCER into a fail-loud LAYER CONSUMER, the foundation for a family of similarity methods. NFR-1 (byte-identical-at-defaults) is RETIRED; the honest invariant is **same bound chunk layer + same embedding vectors → identical matrix**. Plan doc: docs/development/design/wave0-analysis-suite-plan.md §P7 (lines ~361-391). It consumes P8's `repeat_mask` layer instead of masking inline.

## Sir's decisions (AskUserQuestion, 2026-06-28) — MUST honor
1. **Scope = MAXIMAL**: "Track + server + UI dialog". Redesign the track + update server.py run-handler + rewire frontend `SelfSimilarityParamDialog` to layer-pickers + Playwright verify. (Pulls some P5/P6 UI into P7.)
2. **Chunk size = PRESERVE MULTI-SIZE**: keep per-metric chunk sizes; bind N chunk layers (+N embedding layers for cosine/jaccard) across distinct sizes; keep writing cs{N}/ subdirs + flat .bin + `available_chunk_sizes`.
3. **repeat_mask = REQUIRED** for masking metrics (word_overlap/edit_distance): bind a repeat_mask layer (capability.chunk_layer_id == bound chunk label), fail-loud if absent. cosine/jaccard IGNORE masking (no repeat_mask needed for them).

## Key empirical facts (verified this session)
- Masking only affects `_word_overlap_matrix`(:153)/`_edit_distance_matrix`(:208) (skip masked → cells 0). `_cosine_matrix`(:136)/`_jaccard_matrix`(:145) operate on embeddings, IGNORE masked.
- P8 `repeat_mask` layer's metadata.masked bools are byte-identical to inline mask_repeats (proven: test_repeat_mask_track.py test_matches_self_similarity_inline_at_default) → equivalence holds.
- Frontend DotplotView reads master manifest: `dimensions`, `data_file`, `segment_offsets`, `metadata.{available_metrics, available_chunk_sizes, chunk_size, similarity_metric, metric_info[m].{dimensions,alignment_refinement,unit_type,n_units,chunk_size}}`. Loads matrices via `/api/projects/{id}/self_similarity/cs/{N}/{metric}` (fallback flat `self_similarity_{metric}.bin`). `formulaic_patterns`/`exact_repeats` are backend-only (NOT read by FE).
- Server read endpoints (server.py:1145-1199) just read disk: `/self_similarity/chunk_sizes` scans `self_similarity_cs{N}` dirs; `/cs/{N}/{metric}` reads `self_similarity_cs{N}/{metric}.bin`; alignments endpoints read `self_similarity_cs{N}/alignments*.json`. PRESERVE this on-disk layout and they keep working.
- Server run-handler (server.py:978-1095) forwards generic params (chunk_mode/chunk_size/chunk_size_{metric}/smart_unit/delimiters/grow_factor/remainder_ratio/embed_provider/embed_endpoint/embed_model/embed_batch_size) → set_params → validate_params (400) → extract_masked (thread) → persist_track_outputs.
- Existing infra: requirements.py resolve_layers (binds ONE per kind per call, newest-mtime wins, raises LayerResolutionError); ChunkingTrack/EmbeddingTrack/RepeatMaskTrack capabilities; SqliteVecStore.open_existing(db).get_all_vectors() returns vectors in chunk order; runner._is_signal_consumer (non-`_` depends_on → full project, no remap).

## Design (recommended approach)

### Output contract to PRESERVE (do not break)
Redesigned `extract()` must still write: master `signals/self_similarity.json` (same field shape), per-cs `signals/self_similarity_cs{N}/{metric}.bin` + `alignments.json` + `alignments_{metric}.json`, flat `signals/self_similarity_{metric}.bin` + `self_similarity_alignments.json`. Keep stage-then-commit (.partial) + `_discover_chunk_sizes`(:107) + `available_chunk_sizes`. Change WHERE chunks/embeds/masks come from (bound layers), not WHAT is written.

### Coordinate decision (highest risk)
Redesigned track is a CONSUMER → runs on FULL project, NOT auto-remapped. But LASTZ (`_lastz_align`:670 → `_extend_alignment`:444 → `_sliding_window_refine`) needs `text[start:end]==chunk.text` (char-identity scoring). Bound chunk layer stores ORIGINAL segment_offsets but ANALYZABLE chunk_texts. So:
- Reconstruct analyzable text: `atext, omap = project.analyzable_text(sep="")`; sha256(atext) == chunk layer capability.analyzable_digest.
- Map layer's ORIGINAL segment_offsets → analyzable via `omap.remap_element(orig_s,orig_e)` (same call analyzable_verse_spans uses, project.py:393). Assert `atext[a_s:a_e]==chunk_texts[i]` (fail-loud).
- Run matrices on `chunk_texts[i].split()` + bound vectors; `_lastz_align(atext, analyzable_chunks, matrix, cs)`.
- Remap alignment char_* analyzable→original via `palimpsest.derive.inverse_remap_alignments(records, omap)` (derive.py ~285) BEFORE staging. Master segment_offsets = bound chunk layer's already-original offsets directly.
- Moot for unmasked projects (analyzable==original).

### A. Param → resolution mapping (recommend: keep param NAMES, resolve from VALUES)
Keep existing param names → zero server-forwarding churn. Per metric, size cs:
- chunk (all): `LayerRequirement("chunk", {"mode":chunk_mode,"size":cs}, digest_match=True)`; add `"unit":smart_unit` for smart mode.
- embedding (cosine/jaccard): SECOND resolve after chunk bound: `LayerRequirement("embedding", {"chunk_layer_id":chunk.label,"provider":embed_provider,"model":embed_model})`.
- repeat_mask (word_overlap/edit_distance): `LayerRequirement("repeat-mask", {"chunk_layer_id":chunk.label})`.
`embed_endpoint`/`embed_batch_size` accepted but inert (don't affect vectors). `chunk_label`/`embed_label` NOT used (kept-names approach).

### B. Binding loop (replaces _get_chunks/_get_embeddings, :1039-1057)
Group selected metrics by chunk size → for each distinct size: resolve chunk layer; reconstruct analyzable chunks (remap+assert); if any embedding metric, resolve embedding layer + read vectors from SqliteVecStore (assert count==len(chunk_texts)), capture model_fingerprint; if any masking metric, resolve repeat_mask layer + apply metadata.masked to chunks. Per-metric loop (:1114-1195) looks up bound-by-size; everything below (matrix build, fill_diagonal, LASTZ on analyzable basis, refinement label, staging) reused. DELETE `_get_chunks`,`_get_embeddings`,`_embed_chunks`(:751),`_embed_cache_label`(:730), inline find/mask calls. KEEP pure matrix/LASTZ/formulaic fns.

### C. Reconstruct chunks `{index,start,end,text,words,masked}`
words=chunk_texts[i].split() (byte-identical to inline). masked from repeat_mask metadata.masked[i] (False for cosine/jaccard). start/end=analyzable spans; text=chunk_texts[i].

### D. Method seam (minimal) + resolver extension
- NEW core/palimpsest/tracks/similarity_methods.py: `SimilarityMethod` Protocol (name, metrics(), needs_embeddings(metric), needs_mask(metric), compute(metric,*,achunks,embeddings)->ndarray) + one member `MatrixMethod` wrapping the existing :1132-1143 dispatch. Don't over-build.
- BLOCKING prereq: extend requirements.py for "repeat-mask" kind: LayerKind(:24) += "repeat-mask"; _KIND_PREFIX(:27)["repeat-mask"]="repeat_mask_"; _KIND_DIGEST_FIELD(:30)["repeat-mask"]="chunk_analyzable_digest". (3-line additive.)

### E. Equivalence tests
Anchor = pure matrix fns (unchanged). E1: build achunks two ways (inline chunk_text(atext) vs from persisted layer chunk_texts) → np.array_equal for word_overlap/edit_distance; same fake vectors → identical cosine/jaccard. E2 (load-bearing): produce Chunk+Repeat+RepeatMask layers via extract_masked, run redesigned self_sim, load cs{N}/word_overlap.bin, compare to direct chunk_text+find/mask+_word_overlap_matrix. E3: remapped alignment char_* index original text. E4: masked chunk → zero word_overlap/edit_distance cells; cosine identical with/without mask. Keep existing pure-fn tests (test_self_similarity.py:82-305).

### F. Params → ParameterizedTrack
Move base→ParameterizedTrack; keep OVERRIDDEN validate_params for conditional rules (embedding params required only for cosine/jaccard; per-metric size requiredness; ≥1 metric; reject size-less modes). PARAMS mirror chunking/embedding vocab so server unchanged. Provenance: bound layer labels per size (chunk_layer_id, embedding_layer_id, repeat_mask_layer_id) + embedding model_fingerprint in master.metadata.embedding (null for non-embedding runs). Keep locked_constants echo.

### G. depends_on → ["chunking","embedding","repeat_mask"]
Makes it a consumer (full project, no remap; alignments remapped in-track). Topo: chunking→embedding/repeat_mask→self_similarity. Remove virtual ["_embeddings"]. Keep NON-layer-keyed (single self_similarity.json) so analysis_status check works.

### Frontend (Sir's scope #1) — SEPARATE STAGE
SelfSimilarityParamDialog + run path (browser/src/components/AnalysisPanel/AnalysisPanel.tsx, DotplotView.tsx:839 single-POST "Compute"). Must become layer-pickers (select produced chunk/embedding/repeat_mask layers) since one-click compute now 400s without layers. Playwright verify. Files to study next: AnalysisPanel.tsx, DotplotView.tsx, the self_sim param dialog component (NOT a dedicated file — likely inline in AnalysisPanel; grep "SelfSimilarityParamDialog"). NOT yet read in detail — do this in the frontend stage.

## Critical files
- core/palimpsest/tracks/self_similarity.py (1311 ln — main rewrite)
- core/palimpsest/tracks/requirements.py (add repeat-mask kind)
- core/palimpsest/tracks/similarity_methods.py (NEW — method seam)
- core/palimpsest/server.py (run-handler ~978-1095; read endpoints 1145-1199 unchanged)
- core/tests/test_self_similarity.py (rework TestTransactionalOutputs + TestAlignmentRefinementHonesty :468-588 to produce layers first; add equivalence/fail-loud/agnosticism/multi-size)
- browser/src/components/AnalysisPanel/AnalysisPanel.tsx + DotplotView.tsx (frontend stage)

## Staged implementation
- Stage 0: requirements.py repeat-mask kind + test.
- Stage 1: similarity_methods.py + unit test.
- Stage 2: rewrite self_similarity.py (ParameterizedTrack, PARAMS+validate_params, depends_on, extract per A-G, preserve output layout). Delete inline producers; keep pure fns.
- Stage 3: server run-handler (likely NO structural change; verify LayerResolutionError→400; chunk_label never forwarded).
- Stage 4: backend tests (equivalence E1-E4, fail-loud, agnosticism, multi-size). Rework legacy inline-assuming tests.
- Stage 5 (frontend): SelfSimilarityParamDialog → layer-pickers; Playwright golden path.

## Verification
Backend: `cd /Users/nathanielcannon/Claude/Projects/palimpsest && core/.venv/bin/python -m pytest core/tests/ -q -p no:cacheprovider -m "not external" --junitxml=core/.tr.xml >/dev/null 2>&1; echo exit=$?` then parse .tr.xml testsuite attrs (RTK drops summary thru pipes). Baseline 717 GREEN at P8 tip. Frontend: vite build + Playwright golden path (produce chunk+embed+repeat+repeat_mask layers → run self_sim → dotplot renders; missing-layer → clear error).

## Risks
- R1 coordinate basis: LASTZ MUST run on reconstructed analyzable text + analyzable offsets, then remap. Mandatory assertion atext[a_s:a_e]==chunk_texts[i].
- R2 resolver: repeat-mask kind unsupported today; Stage 0 first.
- R3 one-click compute UX breaks (self_sim 400s until layers exist) — addressed by frontend stage (layer-pickers).
- R4 exact_repeats/formulaic_patterns: cosine-only runs lose them unless a `repeats` layer is soft-bound; recommend soft-degrade + manifest note, do NOT inline-recompute.
- R5 embed_endpoint/batch_size inert; keep declared, document.
- R6 multi-size+embedding: user must produce an embedding layer for EACH size used by cosine/jaccard else fail-loud (correct).
- HOLD commit/push for explicit Sir approval (standing pattern). Plan's commit cadence: stage commits (Sir approved "3 commits + push" style for P8; confirm for P7).
