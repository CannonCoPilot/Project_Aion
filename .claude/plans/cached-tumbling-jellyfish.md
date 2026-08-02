# Plan: Durable, complete Gold Set masking maps + one-call Palimpsest import

## Context

The Gold Set masking maps are **not durably stored**. Each gold contract (`core/tests/fixtures/gold/work-*.json`) stores only a subset of annotation types (e.g. idx5 stores 2 of its 8 types: `chapter_heading`, `book`). The *complete* map — all 8 types, 2,746 elements for idx5; **29,079 elements across the 20 works** — exists only when the engine in the gitignored `.scratch/mask-eval/` runs `build_elements()`. The other types (`body`, `chapter` body-spans, front/back matter) are **materialized on the fly, not stored**.

For visual verification this is unworkable: the user "can't assess what doesn't exist," and if a displayed element is wrong, there's no stored artifact to trace it to. The user requires: (1) the *complete* materialized map for all 20 works generated and **stored as durable resources**; (2) a format **directly importable into Palimpsest via the API** with no transformation; (3) an enforced rule that **what Palimpsest shows == what the stored map contains** (WYSIWYG), so corrections can be made to the generation process correctly.

Confirmed decisions: maps are **engine-generated outputs** (errors fixed in engine/contract, then regenerated); roll out on **idx5 first**, then the other 19; **commit the generation engine** into the tracked tree.

Grounding facts (verified this session): all 33 types used across the 20 maps are **already in Palimpsest's `SECTION_TYPES`** — no vocabulary changes needed. The frontend is **fully data-driven** (no hardcoded type lists, caps, or dedup), so all types already render. `_ingest_only` writes no layout and runs no detection, so a map applied right after ingest is not clobbered. Offset integrity is guaranteed by a `reference_sha256` match (idx5 verified: `accb5437…`).

## Design

**Storage format = Palimpsest `LayoutConfig` JSON + header** (directly importable; `LayoutConfig.from_dict` ignores extra header keys):
```
core/tests/fixtures/gold/maps/work-NNN.map.json
{ schema, idx, source_file, reference_sha256, element_count,   # header (integrity + provenance)
  mask_by_type{<all types in map>}, applied:true, extra_types:[],
  sections:[ {id,type,start,end,label,name,source:"gold",masked:null,mask_as:null,metadata{gold_source}} ] }
```
- Every element from `build_elements(idx)` becomes a section; `masked` left `null` (inherit) with an explicit full `mask_by_type` so masking is deterministic **and** still toggleable in the UI.
- The header `reference_sha256` is the integrity key the import verifies against the freshly-ingested text.

**Engine relocation (committed, decision 3):** move the generator into `core/tests/fixtures/gold/mask_engine/`:
- `masking_map.py` (build_elements, SUPPLEMENT, GENERIC, audit) and `instance_edges.py` (RULES, materialize) — moved intact; these encode the per-work gold materialization decisions.
- `text_source.py` — minimal shim replacing the `from harness import project_for` coupling: idx → ingested reference text (via the existing work-order map + workspace ingest). Commit the work-order map (`order.json`).
- `gen_gold_maps.py` — driver: for each idx, `build_elements` → run `gold_verify` + coverage audit as a gate → write `work-NNN.map.json`. Refuses to write a map that isn't `gold_verify`-GREEN / 100% two-layer.

**Core API change = one-call import** (`core/palimpsest/server.py`):
- Add `layout_path: str | None = None` to `LocalImportRequest` (server.py:71).
- In `import_local` / `import_local_stream`, after `_ingest_only`: if `layout_path` set →
  1. `_safe_gold_map_path()` (new helper; restrict to the repo `maps/` dir, path-traversal guard mirroring `_safe_project_dir`).
  2. Load JSON; compare header `reference_sha256` to the ingested project's `metadata.reference_sha256`. **Hard 409 on mismatch** — refuse to apply a map whose offsets don't match the text (this is the integrity gate).
  3. `LayoutConfig.from_dict(map)`, `applied=True`, `save_layout(project.path, cfg)`, `_write_elements_track(...)`.
  4. Return `_ingest_summary(..., staged=False)` + a `gold_map` block (element_count, masked-span count, `sha_verified:true`).
- Net: `POST /api/import/local {path, layout_path, process:false, overwrite:true}` → fully gold-masked project in one call.

**Visible rendering / WYSIWYG:** confirm `_write_elements_track`'s manifest (`manifests/elements.manifest.json`) uses a visible render mode (color-band/highlight), not `none`; tweak if needed so typed spans show inline. Masks shade in the **Browser/character view** (`BrowserView.tsx`, consumes `masked_intervals`) + the **elements-track per-type toggles** + the **section minimap** — document these as the verification surfaces.

**WYSIWYG enforcement:** `mask_engine/verify_map_wysiwyg.py <idx>` — diffs the stored `work-NNN.map.json` sections against the **live** `GET /api/projects/{id}/sections`, asserting exact `(type,start,end,masked)` equality + identical `masked_intervals`. Run after every import; this *is* the enforced rule.

## Files

- **New**: `core/tests/fixtures/gold/mask_engine/{masking_map.py, instance_edges.py, text_source.py, gen_gold_maps.py, verify_map_wysiwyg.py, order.json}` (engine moved from `.scratch/mask-eval/`, harness coupling refactored).
- **New**: `core/tests/fixtures/gold/maps/work-NNN.map.json` × 20 (idx5 first).
- **Edit**: `core/palimpsest/server.py` — `LocalImportRequest` (+`layout_path`), `import_local`/`import_local_stream` (+ apply-gold branch + `_safe_gold_map_path`), and the `_write_elements_track` manifest render-mode check.
- **Reuse (no change)**: `core/palimpsest/layout.py` (`LayoutConfig.from_dict`, `save_layout`, `masked_intervals`, `DEFAULT_MASK_BY_TYPE`), `core/palimpsest/project.py` (`ingest_file`, `reference_sha256`).

## Execution — idx5 vertical slice, then fan out

1. Relocate engine → `mask_engine/`; refactor harness coupling to `text_source.py`; confirm `build_elements(5)` still yields 2,746 elements, 0 unresolved.
2. Write `gen_gold_maps.py`; generate `maps/work-005.map.json` (gated on `gold_verify 5` GREEN + 100% two-layer).
3. Implement the `layout_path` import option + SHA gate + manifest render-mode fix in `server.py`.
4. Restart the `:8080` server (reload new code), then one-call import idx5 with `overwrite:true`.
5. **Verify (must all pass):** `verify_map_wysiwyg.py 5` exact; SHA gate rejects a deliberately-wrong map; `GET /sections` shows all 8 types; masked_intervals == 1,335 / 4.50%; elements track = 2,745.
6. **Hand to user** for visual WYSIWYG check at `http://localhost:5173/?project=<idx5-id>`.
7. **Fan out:** `gen_gold_maps.py all` → 20 maps (each gated); batch one-call import each into `.scratch/demo`; run `verify_map_wysiwyg.py` per work.
8. **Commit** (palimpsest repo): engine relocation + 20 maps + server.py change, after the full set verifies.

## Verification

- Per-work gate at generation: `gold_verify <idx>` GREEN + `masking_map audit <idx>` = 100% COVERED, 0 sparse.
- Per-import gate: `verify_map_wysiwyg.py <idx>` exact section + masked_intervals match against the live server.
- Integrity: confirm import returns 409 when `reference_sha256` mismatches (e.g. feed idx5's map to a different text).
- Visual: user confirms in the Browser view + elements toggles that on-screen mask elements match the stored map.
