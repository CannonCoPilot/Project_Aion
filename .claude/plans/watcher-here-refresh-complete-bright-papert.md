# P7 — Redesign `self_similarity` as an embedding-agnostic, fail-loud layer-consumer

**Repo:** `/Users/nathanielcannon/Claude/Projects/palimpsest` (branch `main`). Venv `core/.venv/bin/python`.
**Commit/push discipline:** HOLD all commits/push for explicit Sir approval (standing pattern). Code green per commit.

## Context

Wave-0 turned chunking, embedding, and repeat-masking into first-class **layer tracks** (P2) and shipped a flag-only `repeat_mask` layer (P8, on `origin/main` at `1728ac0`). `self_similarity.py` (~1311 lines) is the last holdout: it still **owns** chunking + embedding inline and runs its own multi-chunk-size sweep, with repeat-masking computed inline. P7 retires that — `self_similarity` becomes an **agnostic, fail-loud consumer** that reads pre-computed chunk / embedding / repeat_mask layers and *does not run* if they're absent, and does not dictate the embedding model. NFR-1 (byte-identical results) is formally retired; the four metrics become an extensible *family*. The win: self_similarity stops being a monolith with a private substrate, layer reuse becomes safe-by-construction, and `repeat_mask`'s flags get their first real consumer.

**Owner decisions (this session):**
1. **Inputs = fully explicit references** (not auto-discovery): the user names `chunk_label`, `repeat_mask_label`, and (for embedding metrics) `embedding_label` per size. Binding validates coherence + fails loud.
2. **Retire** DotplotView's one-click "Recompute at chunk-size N"; route new sizes through the Analysis panel. Keep the slider for *viewing* cached sizes only.
3. **`exact_repeats` / `formulaic_patterns` sourced from the `repeats` layer** (via `repeat_mask`'s `repeat_layer_id`), accepting the phrase-set shift (inline ceiling was `chunk_size`; repeats-layer default `max_phrase_len=15`). Document it.

**Hard constraint — the frozen OUTPUT contract.** `DotplotView.tsx` is hard-wired to `signals/self_similarity.json` (`metadata.available_metrics` / `metric_info[*].{dimensions,chunk_size,alignment_refinement}` / `available_chunk_sizes`, top-level `segment_offsets` / `dimensions`) and fetches matrices from `/self_similarity/cs/{N}/{metric}` (flat `.bin` fallback). The on-disk layout (`self_similarity_cs{N}/{metric}.bin`, `alignments*.json`, flat files) and all READ endpoints (`server.py:1145-1199`, file server `:1973`) MUST be reproduced byte-for-byte from layer data. Only the **input** path (the run dialog's `chunk_mode`/`chunk_size`/`embed_*` params) is being torn out.

## Design

### New track shape (`tracks/self_similarity.py`)
Inherit `ParameterizedTrack` (drop the bespoke `ACCEPTED_PARAMS`/`set_params`/`validate_params`):
- `name="self_similarity"`, `output_type="signal"`, `depends_on=["chunking","embedding","repeat_mask"]` (real names → topo-orders after producers AND flips `runner._is_signal_consumer` true → runs on full project, **no remap**, since layer offsets are already original).
- `PARAMS`: `metrics` (csv list), `metric` (primary selector, default `"cosine"`), `inputs` (required; JSON list of explicit triples `{chunk_label, repeat_mask_label, embedding_label?}`, one per chunk size).
- **Keep unchanged:** the four matrix builders `_cosine_matrix`/`_jaccard_matrix`/`_word_overlap_matrix`/`_edit_distance_matrix` (`:136/:145/:153/:208`), the entire LASTZ block (`:241-723`), `_derive_formulaic_patterns` (`:566`), `_stage_array`/`_stage_text` + atomic commit (`:1100/:1267`), `_discover_chunk_sizes`, `LOCKED_CONSTANTS` (`:80`), and module export `METRICS` (imported by `server.py:1178/1192` + frontend).
- **Delete:** `_chunking_config`, `_embedding_config`, `_embed_chunks`/`_embed_cache_label`, `_get_chunks`/`_get_embeddings`, and the inline `find_exact_repeats`+`mask_repeats` calls (`:1046-1047`).

### Similarity-method family (minimal, extensible — no new methods this phase)
A frozen dataclass + module dict in `self_similarity.py`:
```
SimilarityMethod(name, requires_embedding: bool, build: Callable)
_METHODS = {cosine→(True,_cosine_matrix), jaccard→(True,_jaccard_matrix),
            word_overlap→(False,_word_overlap_matrix), edit_distance→(False,_edit_distance_matrix)}
METRICS = tuple(_METHODS)        # preserve canonical, cosine-first order
resolve_methods(selected) -> [SimilarityMethod]   # unknown → ValueError (fail-loud, mirrors :914)
```
`requires_embedding` is the single switch tying a method to whether each bundle needs an embedding layer. The four `_*_matrix` fns stay byte-identical (their masked-skip-then-`fill_diagonal(1.0)` behavior is preserved because `chunk["masked"]` now comes from the repeat_mask flag).

### Explicit bundle binding (new helper)
New `LayerBundle` + `resolve_explicit_bundle(project, chunk_label, repeat_mask_label, *, need_embedding, embedding_label=None)` (put in a new `tracks/bundles.py`, or extend `tracks/requirements.py`). It **loads each layer file by path** (the `EmbeddingTrack.extract` pattern, `embedding_track.py:149`), and **validates coherence, fail-loud**:
- `signals/chunking_{chunk_label}.json` exists → `chunk` BoundLayer (reuse `BoundLayer` from `requirements.py:55`).
- `signals/repeat_mask_{repeat_mask_label}.json` exists; `capability.chunk_layer_id == chunk_label` and `capability.chunk_analyzable_digest == chunk.capability["analyzable_digest"]` (same project view). REQUIRED — missing/incoherent → `LayerResolutionError`.
- if `need_embedding`: `signals/embedding_{embedding_label}.json` exists; same two coherence checks. Missing → `LayerResolutionError`. (Embedding may be `None` only when no embedding-metric is selected.)
- Also load `signals/repeats_{repeat_mask.capability["repeat_layer_id"]}.json` → expose `bundle.repeat_phrases = metadata.phrases` (for `exact_repeats`, decision 3).
- `bundle.embedding.vectorstore_path` (`requirements.py:66`) → `cache/embeddings_{label}.db`.

No need to extend the resolver's `LayerKind` enum — explicit path-loading covers P7. (Note in code that auto-discovery would need the `repeat-mask` kind added to `_KIND_PREFIX`/`_KIND_DIGEST_FIELD`; out of scope.)

### New `extract()` control flow
```
methods = resolve_methods(metrics or [metric])
needs_embed = any(m.requires_embedding for m in methods)
bundles = [resolve_explicit_bundle(project, i["chunk_label"], i["repeat_mask_label"],
            need_embedding=needs_embed, embedding_label=i.get("embedding_label")) for i in inputs]   # fail-loud up front
for method in methods:                          # canonical order; cosine first → coherent primary fields
  for b in bundles:
    chunks = reconstruct_chunks(b)              # {text, start, end, words=text.split(), masked} from layers
    matrix = method.build(chunks, embeddings=load_embeddings(project,b) if method.requires_embedding else None)
    np.fill_diagonal(matrix, 1.0)
    cs = b.chunk.capability["size"]
    _stage_array(signals/self_similarity_cs{cs}/{method.name}.bin, matrix)   # per-size
    _stage_array(signals/self_similarity_{method.name}.bin, matrix)          # legacy flat
    lastz_chunks = [{**c,"masked":False} for c in chunks]                    # PRESERVE unmasked LASTZ (:1160)
    alns = _lastz_align(project.reference_text(), lastz_chunks, matrix, cs)
    refinement = "approximate" if b.chunk.capability["mode"] in ("slide","smart") else "exact"
    stage/accumulate alignments tagged {metric, refinement}; record metric_info[method.name]
    if method.name=="cosine" or primary is None: primary=(chunks, cs, b)     # exact_repeats from b.repeat_phrases
write combined+per-cs alignments; available_chunk_sizes = distinct cs ∪ _discover_chunk_sizes
write master manifest (shape preserved); commit staged files (os.replace)
```
`reconstruct_chunks(b)`: `chunk_texts = b.chunk.manifest["metadata"]["chunk_texts"]`, `offsets = b.chunk.manifest["segment_offsets"]`, `masked = b.repeat_mask.manifest["metadata"]["masked"]`; assert equal lengths; `words=t.split()` (proven byte-identical to the chunker in P8, `test_repeat_mask_track.py:112`). `load_embeddings(b)`: `SqliteVecStore.open_existing(vectorstore_path).get_all_vectors()`, assert count == n_chunks.

### Manifest field provenance (all from layer data)
`available_metrics`/`metric_info`/`dimensions` ← accumulators + matrix shape; `metric_info[*].{chunk_size,chunk_mode}` ← chunk `capability.size`/`mode`; `segment_offsets` ← primary chunk layer's `segment_offsets` (already original — simpler/more correct than inline); `available_chunk_sizes` ← bound sizes ∪ `_discover_chunk_sizes`; `exact_repeats` ← `sorted(primary bundle.repeat_phrases)` (decision 3); `formulaic_patterns` ← `_derive_formulaic_patterns(primary_chunks, set(exact_repeats))` unchanged (input provenance shifts); `locked_constants` ← module constant (LASTZ-calibration half still self-owned) **plus** record the bound repeat_mask/embedding provenance per bundle for honest reconstructibility; `embedding` meta ← primary bundle's embedding manifest (`None` if no embedding metric).

### Server (`server.py` `run_analysis` :966)
Stop treating `chunk_mode`/`chunk_size`/`chunk_size_{metric}`/`smart_*`/`embed_*` as self_similarity inputs (they remain valid for chunking/embedding tracks via the shared handler; `ParameterizedTrack.resolved_params` now 400s if any are posted to self_similarity — desired fail-loud). Forward new `inputs` (JSON). Add a thin read-only convenience endpoint `GET /api/projects/{id}/self_similarity/inputs` that pre-joins, per chunk layer: `{chunk_label, size, mode, repeat_masks:[label], embeddings:[{label,model}]}` (server-side join from the `layer_keyed` `/analysis/status` data, `_layer_status_entries:189`) so the dialog presents coherent explicit choices. **READ endpoints unchanged.** `runner.extract_masked` needs no change — the consumer branch already runs on the full project without remap; `LayerResolutionError` (subclasses `ValueError`) surfaces via the existing failed-job path.

### Frontend (`browser/`)
- `AnalysisPanel.tsx` `SelfSimilarityParamDialog` (`:252`): replace chunk/embed param collection with **explicit layer rows** — fetch `/self_similarity/inputs`, let the user add N rows each selecting `{chunk_label, repeat_mask_label, embedding_label?}`; keep the metric checkboxes (drive `metrics` + whether embedding is required); gate run (mirror `canRun` `:299`) if a selected size lacks its repeat_mask or a needed embedding. POST `metrics` + `inputs=[...]`. Drop the `/chunk_sizes` fetch from the dialog.
- `DotplotView.tsx`: **unchanged manifest/matrix reads.** Retire the "Recompute" button (`:834-855`) → a hint routing to the Analysis panel; keep the size slider for cached `available_chunk_sizes` viewing only.

## Critical files
- `core/palimpsest/tracks/self_similarity.py` — the rewrite (method family, consumer `extract`, `reconstruct_chunks`, `load_embeddings`).
- `core/palimpsest/tracks/bundles.py` *(new)* or `tracks/requirements.py` — `LayerBundle` + `resolve_explicit_bundle` (reuse `BoundLayer`, `LayerResolutionError`).
- `core/palimpsest/server.py` — forward `inputs`; new `/self_similarity/inputs` endpoint; READ endpoints untouched.
- `browser/src/components/AnalysisPanel/AnalysisPanel.tsx` — dialog rework.
- `browser/src/components/DotplotView/DotplotView.tsx` — retire Recompute, keep cached-size slider.
- Tests: `core/tests/test_self_similarity*.py` (update + new resolution/method/equivalence/manifest-contract tests); new Playwright spec under `browser/`.

## Reuse (don't reinvent)
- `BoundLayer` / `LayerResolutionError` / `_enumerate_layers` (`requirements.py:55/37/78`).
- Layer file-load + coherence pattern from `embedding_track.py:149-160`; `chunk_texts` + `segment_offsets` + capability from `chunking_track.py:207-251`; `masked[]` from `repeat_mask_track.py:91/122`.
- `SqliteVecStore.open_existing` / `get_all_vectors` (`vectorstore/sqlite_vec.py`).
- `repeats.py` phrases live in the `repeats` layer (`repeat_track.py` `metadata.phrases`) — read, don't recompute.

## Commit sequence (each independently green)
1. Method registry (`SimilarityMethod`/`_METHODS`/`resolve_methods`) wrapping the 4 builders unchanged + `test_self_similarity_methods.py`; legacy `extract` still in place.
2. `LayerBundle` + `resolve_explicit_bundle` + `test_self_similarity_resolution.py` (coherence pass; fail-loud on missing/mismatched repeat_mask or embedding).
3. Rewrite `SelfSimilarityTrack` to the consumer model; delete inline substrate; + text-only **equivalence guard** + **manifest-contract** test; update `test_self_similarity.py`.
4. Server: forward `inputs`; add `/self_similarity/inputs`; confirm READ endpoints untouched.
5. Frontend dialog rework + retire Recompute (vitest green).
6. Playwright golden-path (+ minimal `playwright.config.ts` if absent).

## Verification
**Backend (per commit):**
```
cd /Users/nathanielcannon/Claude/Projects/palimpsest && \
core/.venv/bin/python -m pytest core/tests/ -q -p no:cacheprovider -m "not external" \
  --junitxml=core/.tr.xml >/dev/null 2>&1; echo exit=$?
```
then parse `core/.tr.xml` `<testsuite>` attrs (RTK drops the pytest summary line through pipes). Baseline at `1728ac0` = **717 green**; expect net-positive with new tests.
- **Equivalence guard** (cheap, high-value): on a planted fixture (reuse `test_repeat_mask_track.py`'s), assert layer-sourced `_word_overlap_matrix`/`_edit_distance_matrix` (text-only — no embedding service) `np.array_equal` to the legacy inline matrices. Embedding metrics: stub fixed vectors into both paths only if trivial, else skip per retired NFR-1.
- **Manifest-contract test**: end-to-end on a fixture asserts `self_similarity.json` carries `available_metrics`/`metric_info`/`available_chunk_sizes`/`segment_offsets`/`dimensions`/`exact_repeats`/`formulaic_patterns`/`locked_constants` and `cs/{N}/{metric}.bin` exist.

**Frontend:** `cd browser && npm test` (vitest). Then the **Playwright golden-path**: seed a project, run `chunking → embedding → repeats → repeat_mask → self_similarity` (via API or the new dialog), open DotplotView, assert the heatmap canvas renders non-empty and the metric `<select>` populates from `available_metrics`.

**Manual (dev stack):** bring up API `:8080`, Vite `:5173`, MLX embed `:8000` (`mlx-community/Qwen3-Embedding-4B-4bit-DWQ`, dim 2560). In the UI: produce the four layers, open the self_similarity dialog, add explicit-reference rows for two chunk sizes, run, and confirm DotplotView renders both sizes via the cached-size slider. Verify a masked-project fixture's LASTZ alignments land on sane original-coordinate spans (consumer model runs LASTZ on `project.reference_text()` original coords, no remap — a deliberate behavioral change).

## Risks
- **R-provenance:** `exact_repeats`/`formulaic_patterns` shift (decision 3) — accepted; documented in manifest provenance + the wave0 plan doc's P7 section.
- **R-LASTZ-coords:** alignments now computed on original (full) text, not the analysis view — more correct, but a change for masked projects; covered by the manual masked-fixture check above.
- **R-dialog-coherence:** explicit references can be mis-paired; mitigated by server-side coherence validation (fail-loud) + dialog gating that only offers coherent `repeat_mask`/`embedding` per chunk layer.
