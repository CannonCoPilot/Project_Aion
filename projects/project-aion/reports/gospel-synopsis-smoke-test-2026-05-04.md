# Gospel-Synopsis Max-Depth Smoke-Test Run Report (2026-05-04)

**Pipeline**: AIFred-Pro-Dev `nate-dev` HEAD `af73a46` (dev Pulse :8800, dashboard :8701)
**Test suite**: `.claude/jobs/test-suites/gospel-synopsis.yaml` (1 master + 6 ordered objectives, ~15 min design runtime)
**Pre-flight cleanup**: 9 stale OPEN tasks from 2026-05-01 closed via Pulse API at `2026-05-04T03:36–03:37Z` (User-approved Option 2)
**Master imported**: `SETUP-e1c9f166` at `2026-05-04T03:38:22Z`
**Companion docs**: Executive milestone report (`aifred-pro-dev-milestone-executive-report-2026-05-04.md`); Phase 1.3.5 pre-registration (`pre-registration-phase-1-3-5-reviewer-claude-route.yaml`)

---

## 1. Verdict

**Status**: **PASS** — pipeline lifecycle integrity verified end-to-end across all 7 tasks (master + 6 children); all reviewer verdicts PASSED with `confidence: high`. Total wall-time 27 min (vs 15 min design estimate), 1,168s cumulative compute, 69 executor turns, **$2.58 total cost**, 50,524 output tokens written. Three architectural findings surfaced in §5 that do not invalidate the lifecycle PASS but reveal implementation refinements worth itemizing.

**Coverage axis verdicts**:
- Service-mesh lifecycle (stage→evaluate→orchestrate→execute→review→archival): **PASS** (all 7 tasks)
- Decomposition (1 master → 6 ordered children with `parent:` linkage + `chain_id` + `chain_order 0..5`): **PASS**
- Chain-dependency serialization: **PASS** — children ran strictly in `chain_order 0..5`, `blocked:dependency` correctly enforced; predecessor-must-close-before-successor-runs invariant held
- Executor `claude-cli` route + cache-prefix discipline: **PASS** — heavy `cache_read_tokens` reuse across turns (e.g., child #1 had 32,794 cache_read + 25,352 cache_creation in a single turn)
- Chain-resume / context propagation between siblings: **PASS** — every child after #1 used `Resume mode: chain session <prev_session_id>, forking` with 1.4-2.9KB of session log carried forward
- Reviewer filesystem verification + structured JSON output + archival: **PASS** (all 7 tasks)
- Watcher webhook handling (`POST /webhook 200` across decomposition burst + per-task transitions): **PASS**
- Telemetry capture (executor + reviewer JSON in task metadata): **PASS** — full per-turn cost, cache, model_usage, files_modified, context_summary captured
- Phase 1.3.5 reviewer Claude-CLI route: **NOT EXERCISED** — none of the gospel-synopsis tasks tagged `metadata.review_engine: claude-cli`; all reviewer calls used Ollama default. **Implication for tomorrow's Stage-1 verdict**: must rely on regression-catch axes only; cost_per_review_usd has zero observations from this run
- Executor work-coverage (fresh deliverable production at YAML-specified paths): **PARTIAL** — see §5.3 (executor wrote to `output/<project>/` instead of `tests/<project>/`); §5.4 (master ran redundant work after children completed)

---

## 2. Lifecycle Timeline (UTC)

| T+ | Event | Wall Clock |
|----|-------|------------|
| 0:00 | Master `SETUP-e1c9f166` imported via `import-suite.py` (Jarvis venv; system Python lacked PyYAML) | 03:38:22Z |
| 0:33 | Stage service classified master, set `staging:done` | 03:38:55Z |
| 1:17 | Evaluator decomposed master into 6 children (single 44s pass) — `decompose=True`, `safe=True`, `persona=test-writer` | 03:39:39Z |
| 1:43 | Child #0 (`AION-c357e13c`) evaluator started | 03:40:05Z |
| 3:27 | All 6 children evaluated; child #0 queued | 03:41:49Z |
| 4:13 | Child #0 `active:running` (claude-sonnet-4-6 executor) | 03:41:49Z |
| 4:21 | Child #0 PASSED review (39s execute, $0.14, files_modified=[] — short-circuit) | 03:42:43Z |
| 5:32 | Child #1 (`AION-75eeb60a`) PASSED review (77s, $0.19, 7 comparison files written) | 03:45:06Z |
| 9:24 | Child #2 (`AION-c9d35141`) PASSED review (149s, $0.26, 6 unique-scene files) | 03:48:19Z |
| 14:09 | Child #3 (`AION-36d6c081`) PASSED review (258s, $0.43, master synopsis md) | 03:53:04Z |
| 17:00 | Child #4 (`AION-745ce81b`) PASSED review (127s, $0.37, **51KB .docx file**) | 03:55:55Z |
| 20:08 | Child #5 (`AION-23abe8f9`) PASSED review (138s, $0.43, validation-report-final.md) | 03:59:03Z |
| 27:23 | **Master `SETUP-e1c9f166` PASSED review** (381s execute, 27 turns, $0.75, 18 files in subdirectories) | 04:06:18Z |
| 27:23 | All tasks closed. Total: 7 PASSED, 0 FAILED, $2.58 total cost. | 04:06:18Z |

---

## 3. Per-Task Telemetry

### 3.1 AION-c357e13c — order 0/6 — "Identify and extract parallel scenes"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 39,062 ms (~39s) |
| Executor tokens | input=5, output=2,414, cache_read=32,794, cache_creation=25,352 |
| Executor cost | $0.1419 (Sonnet) + $0.0008 (Haiku tool prep) = $0.1427 |
| Executor turns | 4 |
| Reviewer engine | `qwen3:32b` (Ollama, default route) |
| Reviewer duration | ~8s (estimated from 03:42:35 → 03:42:43) |
| Reviewer tokens | prompt=740, completion=77 |
| Files modified | _none — short-circuit on existing files in scope_ |
| Review verdict | PASSED, confidence=high |
| Archival | `.claude/jobs/archive/AION-c357e13c-20260504-034243.json` |

### 3.2 AION-75eeb60a — order 1/6 — "Side-by-side markdown comparisons"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 77,153 ms (~77s) |
| Executor tokens | input=10, output=5,835 |
| Executor cost | $0.1926 |
| Executor turns | 8 |
| Reviewer engine | `qwen3:32b` (Ollama) |
| Reviewer duration | ~12s (03:44:54 → 03:45:06) |
| Files modified | 7 — `output/gospel-synopsis/comparison-{scene-01..06}-*.md` + `comparison-index.md` |
| Review verdict | PASSED, "Six comparison files and an index were created, with verbatim text from the source. Filesystem checks confirm the files were created." |
| Chain handoff | `chain_resume=4cd0c169...` propagated to AION-c9d35141 (2,182-byte session log forked) |

### 3.3 AION-c9d35141 — order 2/6 — "Unique scene synopses for non-parallel content"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 149,055 ms (~149s) |
| Executor tokens | input=10, output=8,438 |
| Executor cost | $0.2585 |
| Executor turns | 8 |
| Reviewer engine | `qwen3:32b` (Ollama) |
| Reviewer duration | ~12s (03:48:07 → 03:48:19) |
| Files modified | 6 — `output/gospel-synopsis/unique-{mark1,luke4}-*.md` + `unique-scenes-index.md` |
| Review verdict | PASSED |
| Chain handoff | `chain_resume=afa4a7ba...` propagated to AION-36d6c081 (2,055-byte session log forked) |

### 3.4 AION-36d6c081 — order 3/6 — "Compile master synopsis document"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 261,612 ms (~262s = 4 min 22s) |
| Reviewer engine | `qwen3:32b` (Ollama) |
| Reviewer duration | ~7s (03:52:57 → 03:53:04) |
| Files modified | 1 — `output/gospel-synopsis/master-synopsis-mark1-luke4.md` |
| Review verdict | PASSED |
| Chain handoff | `chain_resume=0db2cf0c...` propagated to AION-745ce81b (1,421-byte session log forked) |

### 3.5 AION-745ce81b — order 4/6 — "Generate Word document"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 126,647 ms (~127s) |
| Executor tokens | input=8, output=9,802 |
| Executor cost | $0.3713 |
| Executor turns | 6 |
| Reviewer engine | `qwen3:32b` (Ollama) — in flight at writeup time |
| Files modified | 1 — `output/gospel-synopsis/master-synopsis-mark1-luke4.docx` (50,963 bytes, valid Word document) |
| Chain handoff | `chain_resume=f6dd4195...` propagated to AION-23abe8f9 (1,923-byte session log forked) |

**Architectural note**: This was the **highest-complexity child task**. The executor required writing and running a Python script (likely python-docx) to produce a `.docx` file with headings, body text, and table-of-contents structure. Completion in 127s with a valid 51KB output document confirms the executor's Bash/Python tool-use chain works end-to-end via the claude-cli route — including any required `pip install python-docx`. This is the most architecturally interesting positive signal of the run: tool-orchestration via persona prompt + Sonnet's Code Interpreter equivalent through the executor wrapper completes within reasonable wall-time and cost budgets.

### 3.6 AION-23abe8f9 — order 5/6 — "Generate validation report"

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 138,075 ms (~138s) |
| Executor tokens | input=10, output=9,558 |
| Executor cost | $0.4330 |
| Executor turns | 8 |
| Reviewer engine | `qwen3:32b` (Ollama) |
| Reviewer duration | ~7s (03:58:56 → 03:59:03) |
| Files modified | 1 — `output/gospel-synopsis/validation-report-final.md` (11,281 bytes; new filename to avoid pre-existing `validation-report.md` from Apr 30) |
| Review verdict | PASSED |

### 3.7 AION-36d6c081 — order 3/6 — "Master synopsis document" (telemetry update)

| Field | Value |
|-------|-------|
| Executor duration | 257,738 ms (~258s = 4 min 18s; corrects earlier estimate) |
| Executor turns | 8 |
| Executor cost | $0.4310 |
| Output tokens | 16,846 (largest of the children) |
| Files modified | 1 — `output/gospel-synopsis/master-synopsis-mark1-luke4.md` |

### 3.8 SETUP-e1c9f166 — Master Task

| Field | Value |
|-------|-------|
| Executor engine | `claude-cli` (claude-sonnet-4-6) |
| Executor duration | 380,784 ms (~381s = 6 min 21s) |
| Executor turns | **27** (highest of the run) |
| Executor cost | **$0.7531** (highest of the run) |
| Executor tokens | input=789, output=25, cache reuse heavy |
| Reviewer engine | `qwen3:32b` (Ollama) |
| Reviewer duration | ~14s (04:06:04 → 04:06:18) |
| Files modified | **18** files including: 7 in `output/gospel-synopsis/scenes/parallel/01-07-*.md`, 7 in `output/gospel-synopsis/scenes/unique/{mark-01..05,luke-01..02}-*.md`, plus `master-synopsis.md`, `gospel-synopsis.docx`, `validation-report.md` (overwrote child #6's `-final` variant naming pattern by renaming back), `build_docx.py` |
| Review verdict | PASSED — "All expected files were created or modified in the correct directory structure" |
| Archival | `.claude/jobs/archive/SETUP-e1c9f166-20260504-040618.json` |

### 3.9 Run Aggregates

| Aggregate | Value |
|-----------|-------|
| Wall-clock runtime | 27 min 23s (03:38:55 → 04:06:18 UTC) |
| Cumulative executor compute | 1,168.5s (~19.5 min summed; remainder is review/queue/handoff lag) |
| Total executor turns | 69 |
| Total executor cost | **$2.58** |
| Total output tokens | 50,524 |
| Files in `output/gospel-synopsis/` after run | 31+ (including 18 written by master, 7 by child #2, 6 by child #3, 1 by child #4, 1 by child #5, 1 by child #6) |
| Reviewer engine across all 7 tasks | Ollama `qwen3:32b` (default route — Phase 1.3.5 claude-cli reviewer route not exercised) |

---

## 4. Filesystem Deliverables

### 4.1 Files Written by THIS Run (in `output/gospel-synopsis/`)

**Child #1 (`AION-75eeb60a` "comparisons", 7 files)**:
- `comparison-scene-01-wilderness-temptation.md`, `comparison-scene-02-return-to-galilee.md`, `comparison-scene-03-capernaum-synagogue.md`, `comparison-scene-04-simons-mother-in-law.md`, `comparison-scene-05-evening-mass-healing.md`, `comparison-scene-06-withdrawal-preaching.md`, `comparison-index.md`

**Child #2 (`AION-c9d35141` "unique scenes", 6 files)**:
- `unique-mark1-baptism-of-jesus.md`, `unique-mark1-calling-of-first-disciples.md`, `unique-mark1-healing-of-leper.md`, `unique-mark1-john-baptist-ministry.md`, `unique-luke4-rejection-at-nazareth.md`, `unique-scenes-index.md`

**Child #3 (`AION-36d6c081` "master synopsis", 1 file)**:
- `master-synopsis-mark1-luke4.md`

**Child #4 (`AION-745ce81b` ".docx", 1 file)**:
- `master-synopsis-mark1-luke4.docx` (50,963 bytes — valid Word document, includes ToC + headings + body)

**Child #5 (`AION-23abe8f9` "validation report", 1 file)**:
- `validation-report-final.md` (11,281 bytes — distinct filename to avoid pre-existing `validation-report.md` from Apr 30)

**Master `SETUP-e1c9f166` (18 files, in `scenes/parallel/` + `scenes/unique/` subdirectories + top-level)**:
- `scenes/parallel/01-temptation-wilderness.md`, `02-return-to-galilee.md`, `03-teaching-synagogue-capernaum.md`, `04-man-with-unclean-spirit.md`, `05-simons-mother-in-law.md`, `06-evening-healings.md`, `07-departure-and-preaching.md`
- `scenes/unique/mark-01-prologue.md`, `mark-02-john-the-baptist.md`, `mark-03-baptism-of-jesus.md`, `mark-04-calling-of-disciples.md`, `mark-05-cleansing-of-leper.md`, `luke-01-detailed-temptation.md`, `luke-02-rejection-at-nazareth.md`
- `master-synopsis.md`, `gospel-synopsis.docx`, `validation-report.md` (overwrote child #5's `-final` variant by writing back to original filename), `build_docx.py`

**Total new file count**: 34 files written into `output/gospel-synopsis/` over the 27-min run.

### 4.2 Files Preserved Untouched

- `tests/gospel-synopsis/_archive/2026-04-30-run/` — 14 files from prior PASS run (mtime preserved May 3 20:21Z)
- `output/gospel-synopsis/validation-report.md` — Apr 30 version (8,541 bytes) preserved unchanged by children #1-5; **overwritten by master's run** (now 11,258 bytes, mtime 22:05:41 MDT)
- All Apr 30 prior artifacts in `output/gospel-synopsis/` — child #1 short-circuited on these (read-only)

### 4.3 Key Observation: Same Logical Content, Multiple Naming Conventions

Three distinct naming conventions produced for what amounts to the same logical content (Mark 1 / Luke 4 parallel scene analysis):
1. **Apr 30 prior run**: `*-synopsis.md` (e.g., `temptation-synopsis.md`)
2. **This run children #1+#2**: `comparison-scene-NN-*.md` and `unique-{mark1,luke4}-*.md`
3. **This run master**: `scenes/parallel/NN-*.md` and `scenes/unique/{mark,luke}-NN-*.md`

This naming-convention divergence is downstream of the §5.4 finding (master ran redundant work).

---

## 5. Architectural Findings

### 5.1 Pre-Existing Watcher Bug Surfaced (Pre-Cleanup)

**Finding**: `pipeline-watcher.py` accumulated **4,466 error log lines** for `AION-13dc7b96` between `2026-04-30 19:00:17` and `2026-05-03 21:36:35` — exactly one error per minute matching watcher poll cadence. Error: `'>=' not supported between instances of 'NoneType' and 'int'` (defensive comparison with retry-count NoneType when task is in `blocked:yes reason:max-retries`).

**Cause**: Closing the task via Pulse API at `21:36:35` removed it from the watcher's polling loop; the error stream stopped immediately.

**Architectural implication**: Two compounding gaps from a single artifact —
1. **Watchdog stuck-task escalation absence** (already documented as executive report §7.2.F)
2. **NEW** — silent absorption of watcher-cycle exceptions; no error-rate alerting; an exception-loop spamming 1/min for 74 hours produced zero operator notifications

**Recommendation captured in executive report §7.2.F augmentation** (delivered this session): add watcher-cycle error counter exposed via `/health` or sidecar telemetry, with threshold-based alerting parallel to watchdog stuck-task detection.

### 5.2 Phase 1.3.5 Reviewer Claude-CLI Route — Not Exercised by This Test

**Finding**: The Phase 1.3.5 deploy (`af73a46`) added an opt-in claude-cli route to `reviewer.py` (mirroring executor pattern). Activation requires `metadata.review_engine == "claude-cli"`. None of the gospel-synopsis tasks (master or 6 children) carry this metadata; all are reviewed via Ollama `qwen3:32b` (the default route).

**Implication for Phase 1.3.5 Stage-1 verdict** (due 2026-05-04 ~17:04 MDT, deploy + PT48H):
- Regression-catch axes (cache_hit_rate_dip, eph_1h_adoption, register_violations, default_route_unbroken) — measurable from telemetry capture in this and other dev sessions
- New axis `cost_per_review_usd` — zero observations on the Claude-route side from this smoke test
- Verdict approach: confirm Stage-1 regression-catch axes pass, defer cost axis to Stage-2 with intentionally-tagged fixtures

**Recommendation**: Phase 1.3.5 Stage-2 sample collection should include synthetic fixtures with `metadata.review_engine: claude-cli` so the formal sign-off can compute cost_per_review_usd against a real workload sample. Add to scheduled local agent backlog before 2026-05-16 verdict.

### 5.3 Three Compounding Path-Handling Findings (Executor → Reviewer → Test Methodology)

**Finding A — Executor uses `output/gospel-synopsis/` instead of YAML-specified `tests/gospel-synopsis/`**: The YAML spec instructs the executor to write `tests/gospel-synopsis/<scene-slug>-synopsis.md` etc. The executor instead writes to `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/output/gospel-synopsis/` — a **workspace-root deliverable directory** that pre-existed (created Apr 30 19:29Z, 17 files from earlier test sessions). For example, child #2's `files_modified` (verbatim from telemetry):

```
/Users/nathanielcannon/Claude/AIFred-Pro-Dev/output/gospel-synopsis/comparison-scene-01-wilderness-temptation.md
... (5 more comparison-scene-NN-*.md)
/Users/nathanielcannon/Claude/AIFred-Pro-Dev/output/gospel-synopsis/comparison-index.md
```

The executor's persona training (or prompt template) treats `output/<project>/` as the canonical deliverable path, overriding YAML-specified paths. This is **convention-over-spec behavior**, not a bug per se, but it makes YAML path instructions advisory rather than authoritative.

**Finding B — Executor short-circuits on pre-existing output files (correct behavior, wrong assumption for smoke testing)**: Child #1 (`AION-c357e13c`, "Identify parallel scenes") reported `gotchas: ["Output directory already had 17 files from prior pipeline runs — no duplicate work needed"]` and produced `files_modified: []`. The 17 files were in `output/gospel-synopsis/` from prior Apr 30 testing (NOT in `_archive/` as I initially hypothesized; `_archive/` was untouched, mtime preserved). Specifically, `output/gospel-synopsis/mark1-luke4-parallels.md` already existed from Apr 30 08:36 — the executor read it as ground truth and reported the task complete.

This is **correct executor behavior** (avoid redundant work on pre-existing artifacts) but breaks the smoke-test assumption that all children produce fresh deliverables. Children #2 onward did real work because their target files used new naming conventions (`comparison-scene-*` for child #2, `unique-mark1-*` for child #3) that didn't pre-exist.

**Finding C — Reviewer accepts files-exist without verifying files-at-spec-path**: The reviewer for child #1 PASSED the task with `confidence: high` and verdict "files_modified: [] but expected outputs already exist and are accurate." For child #2, reviewer PASSED with verdict "Six comparison files and an index were created" — even though those files are in `output/` not `tests/` per the YAML instruction. The filesystem-verification step in `reviewer.py` checks **existence** but not **path-vs-spec conformance**.

**Architectural recommendations** (in priority order):
1. **(MEDIUM, ~3-6 hr)** Reviewer should verify expected paths against task `stage_output.file_paths` and report a violation when files are written to non-spec locations. Either fail review or surface as a warning visible in dashboard.
2. **(MEDIUM, ~4-8 hr)** Executor should prefer YAML-specified paths over its `output/` convention; fall back to `output/` only when no path is specified. This is a persona-prompt or executor.py-side fix, not a Pulse-API-side fix.
3. **(LOW, ~2-4 hr)** Add per-task `metadata.work_dir_scope` constraint and pre-clean enforcement to support test-environment isolation: tests should be able to declare "treat `output/<project>/` as fresh; clear before run."

**Test-methodology workaround for max-depth smoke testing**: Clean BOTH `tests/<project>/` AND `output/<project>/` before importing the YAML. The current archival of `tests/gospel-synopsis/` was incomplete because `output/gospel-synopsis/` contained pre-populated artifacts that pre-empted child #1's work.

### 5.4 Master Task Ran Redundant Work After Children Closed

**Finding**: The orchestrator's `auto-close-decomposed-parent` guard at `pipeline-watcher.py:339-352` did NOT auto-close the master `SETUP-e1c9f166` after the 6 children completed. Instead, the master entered its own `active:running` state at `2026-05-04T03:59:35Z` (queued after child #6 finished) and **ran its own end-to-end execution for 380s / 27 turns / $0.7531** — by far the highest-cost single task in the run. The master's `files_modified` list (18 files) overlaps substantially with the children's outputs but uses a *different* directory organization (`output/gospel-synopsis/scenes/parallel/01-07-*.md` and `scenes/unique/{mark-01..05,luke-01..02}-*.md`) and a *different* set of top-level filenames (`master-synopsis.md` vs child #3's `master-synopsis-mark1-luke4.md`; `gospel-synopsis.docx` vs child #4's `master-synopsis-mark1-luke4.docx`).

**Why this happened**: Either (a) `auto-close-decomposed-parent` requires a label not present on this master (e.g., specific `metadata.auto_close_on_children_done`), OR (b) the master's `decompose=True` evaluator verdict marks it as decomposed BUT also queues it for execution, OR (c) the orchestrator is conservative and runs the master as a final-check pass after children to validate the chain's collective output. None of these are documented in the YAML or visible in the executor's prompt template; behavior was implicit.

**Impact**:
1. **Cost duplication**: The master's $0.75 is essentially redundant — the children already produced the deliverables. Total run cost was $2.58; without the master pass it would have been $1.83 (29% savings).
2. **Filesystem confusion**: Three coexisting naming conventions for the same logical content (see §4.3) makes downstream consumers unsure which is canonical.
3. **Reviewer accepted the duplication**: The master's reviewer PASSED with `confidence: high` because all expected files existed; the duplication-vs-children was not flagged.

**Architectural recommendation** (in priority order):
1. **(MEDIUM, ~2-4 hr)** Make `auto-close-decomposed-parent` always-fire when `decompose=True` and all children closed-PASS. The master should NOT execute its own work in this case — it's already been decomposed into the children's scope.
2. **(LOW, ~1-2 hr)** If the master MUST run for validation purposes, give it a distinct prompt template ("verify children's outputs against original spec") that explicitly forbids re-creating files that already exist from children.
3. **(LOW, ~1 hr)** Reviewer should detect master-vs-children file overlap and surface as warning ("master created N files that overlap with children's deliverables — possible redundant work").

**Why this matters for production**: At $0.75/master pass on Sonnet 4.6, a high-volume production load with frequent decomposed tasks would accumulate substantial redundant cost. For a daily run-rate of even 50 decomposed master tasks, this is ~$37/day in unnecessary compute. The fix is small (a label-state-machine check in the orchestrator); the savings compound.

---

## 6. Phase 1.3.5 Stage-1 Verdict Implications

This smoke run produced (final):
- **0 Claude-route reviewer invocations** (all 7 reviewer calls used Ollama `qwen3:32b`)
- **7 Claude-route executor invocations** on `claude-sonnet-4-6` (master + 6 children); 1,168s cumulative compute, 69 turns, $2.58 total cost, 50,524 output tokens
- **Cache discipline**: confirmed correct — child #1 alone had 32,794 cache_read_tokens + 25,352 cache_creation_tokens in a single turn; subsequent children inherited cache via `claude -r <session_id> --forking` resume mechanism
- **Register violations**: zero observed in executor output deliverables (no `<draft>` / `<answer>` XML tags in spot-check of master synopsis + comparison files; would need `register_violations_per_100_blocks` extractor pass against post-deploy session corpus to formally verify)

**Phase 1.3.5 deploy** at `af73a46` / `2026-05-02T23:04:12Z` — Stage-1 earliest_run = `2026-05-04T23:04:12Z` UTC ≈ today ~17:04 MDT. Stage-1 verdict (regression-catch axes only):
- `cache_hit_rate_dip_pp ≤ 5pp`: needs full corpus measurement; this single run does not establish it but observes healthy cache discipline
- `eph_1h_adoption_min_pct ≥ 80%`: needs broader sample across last 48h
- `register_violations_per_100_blocks ≤ 5`: zero observed in this run; corpus extraction needed for formal axis check
- `default_route_unbroken`: PASS — all 7 reviewer calls correctly defaulted to Ollama with no errors; the opt-in route's existence does not regress the default

**Verdict approach for tomorrow ~17:04 MDT**: assert default-route safety + cache stability based on aggregate corpus + this smoke run's observations. **Defer `cost_per_review_usd` axis to Stage-2** with intentionally-tagged fixtures (`metadata.review_engine: claude-cli` set by import). Add to scheduled local-agent backlog for the 14d Stage-2 window.

---

## 7. Pre-Registration Compliance Note

This run report is methodologically distinct from the Phase 1.3.5 verdict drafts:
- This report describes a single smoke-test run (one data point) for milestone validation
- The Phase 1.3.5 Stage-1 verdict (due tomorrow) operates on aggregate session corpus filtered to service=review across the full PT48H window
- The two should not be conflated; cite this report from the verdict where useful but maintain register separation

---

## 8. Cross-References

- Executive milestone report: `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/aifred-pro-dev-milestone-executive-report-2026-05-04.md`
- Pipeline v2 design doc: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/context/designs/pipeline-redesign-v2.md`
- Phase 1.3.5 pre-registration: `/Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression/pre-registration-phase-1-3-5-reviewer-claude-route.yaml`
- Test suite: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/jobs/test-suites/gospel-synopsis.yaml`
- Importer: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/jobs/test-suites/import-suite.py`
- Pipeline-watcher: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/jobs/pipeline-watcher.py`
- Service logs:
  - `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/logs/headless/pipeline-watcher.log`
  - `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/logs/headless/service-{stage,evaluate,orchestrate,execute,review}.log`
- Monitor log: `/tmp/gs-monitor.log` (transient, smoke-test session only)

---

*Run report final — completed 2026-05-04 22:06:18 MDT (04:06:18Z). All 7 tasks PASSED. Three architectural findings (§5.1-§5.4) documented for follow-up.*
