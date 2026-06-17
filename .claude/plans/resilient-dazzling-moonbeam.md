# Palimpsest Test-Suite Refactor — Speed, Coverage, Contextual Selection

## Context
The Palimpsest backend suite (`core/tests/`, 393 tests) runs in **231.95s single-process** and has three structural gaps that the user wants closed:
1. **Speed** — no parallelism (`pytest-xdist` not installed), and `segment_sentences` (segmenter.py:91-96) reloads the ~500 MB `en_core_web_lg` model on *every* call, uncached — unlike `syntax.py`/`entities.py` which already cache via `_NLP_CACHE`.
2. **Coverage** — `pytest-cov` is declared in the `dev` extra but **not installed**; the root `.coverage` is stale (Jun 6). Frontend (`browser/`, 21 vitest tests) has no coverage tooling.
3. **Contextual selection** — `--strict-markers` is on but **zero markers are registered or used**, so there is no way to run a meaningful subset.

Baseline profile (slowest, single-process): one `test_summarize_valid_request` = **33.78s** (15% of the run, real LLM call); `test_cli.py` analyze/export = ~70s (each shells out → full spaCy cold-start); `test_pipeline.py` setup = ~37s (function-scoped `analyzed_project` re-runs the whole pipeline for 4 read-only tests); `test_server.py` setup = ~27s. Host: 16 cores (12 perf). `core/.venv` is uv-managed (3.12.12).

**Decisions (confirmed with user):** coverage = gate + fill the top ~5-8 gaps; production source edits allowed (segmenter cache); bare `pytest`/`npm test` runs **everything** by default, with `fast` as an opt-in subset.

**Scope:** `core/` (backend) + `browser/` (frontend). The legacy root `tests/` (4 files testing the old `src/` package via `unittest`) is outside pre-commit's `^core/` boundary and already excluded by `norecursedirs` — left untouched (noted as optional future cleanup).

---

## Workstream 1 — Maximum execution speed

**1a. Parallelize (biggest lever).** Add `pytest-xdist` to the `dev` extra; set default `addopts` to include `-n auto`. Tests are isolation-safe (almost all use `tmp_path`). Note: each worker loads the model once (per-process cache); with 16 workers × ~500 MB that is ~8 GB peak — verify memory and fall back to `-n 8` (physical/halved) if it spikes. The 33.78s summarize test sets the parallel wall-floor, which is why 1d marks it `slow`.

**1b. Cache the spaCy load in `segment_sentences`** (`core/palimpsest/ingest/segmenter.py`). Mirror the existing `_NLP_CACHE` pattern from `tracks/syntax.py:13-26`: module-level dict keyed on `(model, frozenset(exclude))`; keep the per-call `nlp.max_length` assignment (it is a mutable runtime attr, not a load-time option). This benefits production ingest too and removes the dominant per-test setup cost. Audit the other uncached sites (`project.py:170-172`, `tracks/coreference.py:189-191`) and apply the same cache only where it is on a test-hot path.

**1c. Rescope the read-only heavyweight fixture.** `analyzed_project` (test_pipeline.py:12) runs the *entire* pipeline and all 4 consumers only read it → change to `scope="module"` using `tmp_path_factory` instead of function-scoped `tmp_path` (~28s saved serially). Leave `pp_project` (test_tracks.py) function-scoped — after 1b its re-ingest of a tiny text is cheap, and several tests mutate it (LitHMM/topics write tracks), so sharing would risk cross-test contamination. Re-measure `test_server.py`'s `workspace_with_project`; only rescope it if it still dominates after 1b *and* a read-only subset can be safely isolated.

**1d. Tag the outliers `slow`** (see 1e marker list): the one summarize test (test_server.py) and the `test_cli.py` analyze/export subprocess tests. Default still runs them (user choice); `fast` skips them.

## Workstream 2 — Maximum coverage (gate + fill top gaps)

**2a. Install + configure.** Add `pytest-cov` (already declared) to `core/.venv` via `uv pip install -e ".[dev]"`. Add to `core/pyproject.toml`: `[tool.coverage.run] source=["palimpsest"]`, `branch=true`, sensible `omit`; `[tool.coverage.report] show_missing=true`. Coverage is **not** in default `addopts` (it slows runs and muddies xdist timing) — it runs via the `cov` wrapper target. For frontend, add `@vitest/coverage-v8` to `browser/package.json` devDeps and a `test.coverage` block (provider `v8`, reporters) in `browser/vite.config.ts`.

**2b. Measure baseline, then gate.** Run `--cov` once to get the package %; set `--cov-fail-under=<measured-baseline>` in the `cov` target so coverage cannot regress. Add a `[tool.coverage.report] fail_under` for frontend thresholds likewise.

**2c. Fill the top gaps.** From the `--cov` `show_missing` report, write new tests for the worst ~5-8 modules (bounded). Likely candidates by inspection (confirm against the report): `server.py` error paths, `cli.py` (only 11 tests for a large surface), `project.py` re-import/edge cases. Raise `--cov-fail-under` to the new level once added.

## Workstream 3 — Contextual subset selection

**3a. Register markers** in `core/pyproject.toml` `[tool.pytest.ini_options] markers = [...]`: `unit`, `integration`, `nlp`, `api`, `cli`, `slow`, `external`, `embeddings`.

**3b. Auto-mark** in `core/tests/conftest.py` via `pytest_collection_modifyitems`, keyed on `item.fixturenames` + module name (so new tests self-classify, no hand-tagging 375 functions):
- requests `pp_project` / `analyzed_project` / `workspace_with_project` / `client` → `nlp` + `integration`
- module `test_server` / `test_sections_api` → `api`; module `test_cli` → `cli`
- pure-function modules (`test_self_similarity`, `test_annotation`, `test_signals`, `test_content_filters`) → `unit`
Hand-mark only the ~6 `slow` outliers with `@pytest.mark.slow` (static, not duration-derived).

**3c. Changed-files subset.** Add `pytest-testmon` to the `dev` extra for the `changed` subcommand (reruns only tests affected by the working-tree diff) — directly the "contextual subset" ask. Verify testmon+xdist; if they conflict, run `changed` serially.

**3d. Selection entrypoint.** Rewrite the dead root `run_tests.sh` (currently broken `unittest discover`) into a subcommand dispatcher that `cd core` and runs:
- `all` (default) → `pytest -n auto`
- `fast` → `pytest -m "not slow" -n auto`
- `unit` / `nlp` / `api` / `cli` → `pytest -m <marker>`
- `changed` → `pytest --testmon`
- `cov` → `pytest --cov=palimpsest --cov-report=term-missing --cov-fail-under=<gate>`
- `serial` → `pytest -n0` (debug)
Add matching `browser/package.json` scripts: `test:coverage`, `test:fast` (vitest already supports name/file filters).

---

## Files to modify
- `core/pyproject.toml` — `dev` extra (+xdist, +testmon), `[tool.pytest.ini_options]` (markers, `-n auto`), `[tool.coverage.*]`
- `core/palimpsest/ingest/segmenter.py` — `_NLP_CACHE` for `segment_sentences` (+ audit project.py / coreference.py)
- `core/tests/conftest.py` — `pytest_collection_modifyitems` auto-marking
- `core/tests/test_pipeline.py` — module-scope `analyzed_project` via `tmp_path_factory`
- `core/tests/test_server.py`, `core/tests/test_cli.py` — `@pytest.mark.slow` on outliers
- `run_tests.sh` — rewrite as subcommand dispatcher
- `browser/package.json`, `browser/vite.config.ts` — coverage dep + config + scripts
- New tests under `core/tests/` for the top coverage gaps (2c)

## Verification
1. **Speed:** `bash run_tests.sh all` → 393 pass; compare wall-clock vs the 231.95s baseline (target: large reduction, expect ~40-60s). `bash run_tests.sh fast` skips slow → should be well under that.
2. **Correctness:** full suite stays green serial (`run_tests.sh serial`) and parallel — confirms no xdist isolation bug from fixture rescoping/caching. Run twice to confirm determinism (no shared-state contamination from module-scoping).
3. **Coverage:** `bash run_tests.sh cov` prints the package %, the gate passes, and post-2c % is higher than baseline. `cd browser && npm run test:coverage` emits a frontend report.
4. **Selection:** `run_tests.sh unit|nlp|api|cli` each collect the expected subset (`--collect-only -q` to eyeball); `run_tests.sh changed` after editing one source file reruns only affected tests.
5. **Lint/types:** `pre-commit run --files core/...` stays clean (ruff + mypy on `^core/`).

## Out of scope / notes
- Legacy root `tests/` + `src/` package — dead relative to `core/palimpsest`; recommend a separate cleanup decision, not touched here.
- Scratch artifacts `core/.scratch_baseline.{log,xml}` created during profiling will be removed before any commit.
- Per the workspace push policy, the 9 existing unpushed commits + these changes stay **local** until you authorize a push.
