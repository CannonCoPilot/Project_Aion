# Pipeline Test System Audit

**Date**: 2026-05-29
**Auditor**: Jarvis (Project Aion)
**Scope**: All test artifacts across Alfred-Dev, AIFred-Pro, and supporting infrastructure

---

## 1. Executive Summary

The Pulse-Nexus pipeline has **4 layers of testing** that evolved organically over 2 months. Coverage is uneven: the pre-refactor components (dispatcher, executor.sh, pipeline-runner.sh) have tests that target now-dead code. The post-refactor components (pipeline-watcher.py, signal-delegation bridge, chain-executor) have 6 integration tests but no ticket-based validation suites. No test has a formal validation record. No dashboard exists for test visibility.

**Verdict**: 60% of tests are outdated. The active 40% cover individual pipeline services but miss the chain-executor architecture, reviewer filesystem verification, HOST_PROJECT_DIR path translation, and multi-chain parallel execution. A new test suite catalog with validation tracking is needed.

---

## 2. Test Artifact Inventory

### 2.1 Ticket-Based Test Suites (YAML)

| Suite | Tasks | Status | Components Tested | Last Run | Validated? |
|-------|-------|--------|-------------------|----------|------------|
| `gospel-synopsis.yaml` | 1 (decomposes to ~6) | **ACTIVE** | Orchestrator decomposition, chain deps, persona routing, file creation, reviewer verification | 2026-05-04 | Partial (v2 fixes applied post-run) |
| `archive/aifred-pro-dev.yaml` | 23 | **DEPRECATED** | Pre-refactor executor.sh, stress tests, chain ordering | 2026-04-29 | Yes (at time of run) |
| `archive/token-compression.yaml` | 34 | **DEPRECATED** | Pre-refactor multi-persona, 8-phase decomposition | 2026-04-29 | Yes (at time of run) |
| `archive/unknown.yaml` | 12 | **DEPRECATED** | Concurrency stress, 15 parallel tasks | 2026-04-29 | No |

**Gap**: No suite tests the new chain-executor (warm seed + forked window + sentinel). No suite tests HOST_PROJECT_DIR path translation. No suite tests reviewer `_host_to_container_path()`.

### 2.2 Integration Tests (Python — `test_pipeline_lifecycle.py`)

| Test | Component | Status | Last Run | Result |
|------|-----------|--------|----------|--------|
| `test_create_task_has_initial_labels` | Pulse API, label dimensions | **ACTIVE** | 2026-05-28 | Pass (6/6) |
| `test_stage_produces_structured_output` | stage.py + Ollama | **ACTIVE** | 2026-05-28 | Pass |
| `test_evaluate_assigns_persona_and_evaluates` | evaluate.py + Ollama | **ACTIVE** | 2026-05-28 | Pass |
| `test_orchestrate_queues_standalone_task` | orchestrate.py | **ACTIVE** | 2026-05-28 | Pass |
| `test_executor_ollama_completes` | executor.py Ollama path | **ACTIVE** | 2026-05-28 | Pass |
| `test_lifecycle_exhausted_blocks_permanently` | diagnose.py lifecycle cap | **ACTIVE** | 2026-05-28 | Pass |

**Gap**: No test for signal-delegation path. No test for reviewer.py. No test for chain-executor bridge. No test for watchdog heal functions.

### 2.3 Shell-Based Tests

| Script | Component | Status | Last Run | Validated? |
|--------|-----------|--------|----------|------------|
| `pipeline-smoke-test.sh` | E2E pipeline (pre-refactor) | **DEPRECATED** | Pre-2026-05 | Unknown |
| `phase3-integration-test.sh` | Phase 3 Nexus features | **DEPRECATED** | Pre-2026-05 | Unknown |
| `nexus-settings-test.sh` | nexus-settings.sh library | **DEPRECATED** | Pre-2026-05 | Unknown |

**Verdict**: All 3 target `executor.sh` / `dispatcher.sh` / `pipeline-runner.sh` which are dead code post-refactor. Archive all.

### 2.4 BATS Functional Tests

| Test | Component | Status |
|------|-----------|--------|
| `dispatcher-parse.bats` | Dispatcher argument parsing | **DEPRECATED** (dispatcher.sh dead) |
| `hook-loading.bats` | Claude Code hook loading | **ACTIVE** (still relevant) |
| `skill-listing.bats` | Skill listing mechanism | **ACTIVE** (still relevant) |
| `profile-loader.bats` | Profile loader logic | **ACTIVE** (still relevant) |

### 2.5 Unit Tests (Python)

| Module | Component | Status |
|--------|-----------|--------|
| `test_team_runner.py` | team-runner.py | **DEPRECATED** (team-runner dead code) |
| `test_secret_scrub.py` | Secret scrubbing | **ACTIVE** |
| `test_pipeline_v2.py` | Pipeline v2 services | **ACTIVE** but pre-refactor |
| `test_pulse_dimensions.py` | Pulse dimension labels | **ACTIVE** |
| `test_chain_endpoint.py` | Pulse chain API | **ACTIVE** |
| `test_proxy.py` | Usage proxy | **ACTIVE** |
| `test_usage_endpoints.py` | Usage endpoints | **ACTIVE** |

### 2.6 Ad-Hoc Test Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `test-ollama-audit-log.sh` | Ollama audit logging | **ONE-OFF** — no reuse value |
| `probe-headers.sh` | Usage proxy header probing | **DEPRECATED** (headers removed in refactor) |

---

## 3. Component Coverage Matrix (updated 2026-05-29 session 2)

| Pipeline Component | Ticket Suite | Integration Test | Shell Test | Unit Test | **Coverage** |
|-------------------|:---:|:---:|:---:|:---:|:---:|
| **Pulse API (task CRUD, labels)** | label-fsm | Yes | - | Yes | **Good** |
| **stage.py** (scope extraction) | probe-*, gospel | Yes | - | - | **Good** |
| **evaluate.py** (risk/persona) | probe-*, gospel | Yes | - | - | **Good** |
| **orchestrate.py** (decomposition) | chain-decomp, chain-order | Yes | - | - | **Good** |
| **executor.py** (Ollama path) | - | Yes | - | Yes | **Good** |
| **executor.py** (signal-delegation) | probe-*, reviewer-pf, heal | - | - | - | **Good** |
| **reviewer.py** (filesystem verify) | reviewer-pass-fail | - | - | - | **Good** |
| **reviewer.py** (host↔container path) | probe-file-verify | - | - | - | **Good** |
| **diagnose.py** (failure recovery) | reviewer-pf, self-heal | Yes | - | - | **Good** |
| **pipeline-watcher.py** (FSM dispatch) | label-fsm, all probes | - | - | - | **Good** |
| **pipeline-watcher.py** (watchdog heal) | self-healing-cycle | - | - | - | **Good** |
| **pipeline-watcher.py** (self-healing) | self-healing-cycle | - | - | - | **Good** |
| **host-executor-bridge.sh** (chain-exec) | probe-*, sentinel-timeout | - | - | - | **Good** |
| **chain-executor.sh** (seed/fork) | multi-chain-parallel | - | - | - | **Good** |
| **Sentinel mechanism** (DONE file) | probe-*, sentinel-timeout | - | - | - | **Good** |
| **Context summary capture** | probe-*, reviewer-pf | - | - | - | **Good** |
| **Multi-chain parallel** | multi-chain-parallel | - | - | - | **Good** |
| **Chain predecessor ordering** | chain-predecessor-ordering | - | - | - | **Good** |
| **Pulsar (scheduled task emitters)** | - | - | - | - | **NONE** |
| **Usage proxy** | - | - | - | Yes | **Good** |
| **Auth circuit breaker** | - | - | - | - | **NONE** |

---

## 4. Gap Analysis (updated 2026-05-29 session 2)

### Critical Gaps — ALL RESOLVED

1. ~~No test for signal-delegation execution path~~ → **probe-simple, probe-file-verify, all probes**
2. ~~No test for reviewer.py~~ → **reviewer-pass-fail suite**
3. ~~No test for chain-executor (warm seed)~~ → **probe-simple, multi-chain-parallel**
4. ~~No test for pipeline-watcher FSM~~ → **label-fsm-transitions suite + implicit via all probes**
5. ~~No test for sentinel mechanism~~ → **probe-simple, sentinel-timeout**

### Secondary Gaps — MOSTLY RESOLVED

6. ~~No test for watchdog heal functions~~ → **self-healing-cycle suite**
7. ~~No test for multi-chain parallel dispatch~~ → **multi-chain-parallel suite**
8. **No test for auth circuit breaker** — fail_fast logic untested (requires simulating auth failure; deferred)
9. **No test for pulsar scheduled emitters** — recurring job system untested (out of scope for pipeline testing)

### Outdated / To Archive

- `pipeline-smoke-test.sh` — targets dead `pipeline-runner.sh`
- `phase3-integration-test.sh` — targets dead `dispatcher.sh`
- `nexus-settings-test.sh` — targets `nexus-settings.sh` (still alive but low-value)
- `dispatcher-parse.bats` — targets dead `dispatcher.sh`
- `test_team_runner.py` — targets dead `team-runner.py`
- `archive/aifred-pro-dev.yaml` — already archived, no action needed
- `archive/token-compression.yaml` — already archived
- `archive/unknown.yaml` — already archived
- `probe-headers.sh` — removed in Phase E refactor
- `test-ollama-audit-log.sh` — one-off, no suite value

### Redundant

- `test_pipeline_v2.py` overlaps significantly with `test_pipeline_lifecycle.py` — consolidate

### Poorly Designed

- `gospel-synopsis.yaml` is a good functional test but too complex for quick iteration (6+ tasks, Word doc generation, 15+ min runtime). Needs a lightweight variant.
- `import-suite.py` uses `/projects/import` endpoint which may not exist in current Pulse — needs verification.
- No test defines **expected completion time** — timeout detection is implicit.

---

## 5. Validation Status

**No test has a formal validation record.** The 6 integration tests in `test_pipeline_lifecycle.py` were written and run on 2026-05-28 (all passed), but there is no persistent record of that run. The gospel-synopsis suite was run on 2026-05-04 with findings documented in `Jarvis/projects/project-aion/reports/gospel-synopsis-smoke-test-2026-05-04.md`, but the suite was modified post-run (v2 changes) and the v2 version has never been formally run.

**Recommendation**: Each test suite and test module should have a `_validation.json` sidecar recording:
- Last run date/time
- Result (pass/fail/partial)
- Commit hash at time of run
- Runner (human/pipeline/CI)
- Notes on any known issues

---

## 6. Storage Organization

### Current (inconsistent)

```
Alfred-Dev/
  .claude/jobs/test-suites/          # YAML ticket suites
  .claude/jobs/tests/                # Python/shell integration tests
  tests/functional/                  # BATS functional tests
  tests/gospel-synopsis/             # Test source data
  pulse/tests/                       # Pulse service tests
  usage-proxy/test_*.py              # Proxy tests
  output/                            # Test execution outputs (mixed with real)
```

### Proposed (consolidated)

```
Alfred-Dev/
  .claude/jobs/test-suites/          # YAML ticket suites (keep)
    _catalog.yaml                    # NEW: master catalog with metadata
    _validation/                     # NEW: per-suite validation records
  .claude/jobs/tests/                # Integration tests (keep, consolidate)
    _archive/                        # Deprecated tests moved here
  tests/                             # Functional + source data (keep)
  output/_test-runs/                 # NEW: timestamped test output dirs
```

---

## 7. Recommended New Test Suites

| Suite Name | Tasks | Components Covered | Priority |
|-----------|-------|-------------------|----------|
| `probe-simple.yaml` | 1 | Full lifecycle: stage→eval→orchestrate→execute→review→close | P0 |
| `probe-file-verify.yaml` | 1 | File creation + reviewer filesystem verification + HOST_PROJECT_DIR | P0 |
| `chain-decomposition.yaml` | 1 (→3) | Orchestrator decomposition, chain ordering, parent auto-close | P0 |
| `reviewer-pass-fail.yaml` | 2 | One task that passes review, one that intentionally fails | P1 |
| `sentinel-timeout.yaml` | 1 | Task that exceeds timeout → verify timeout handling | P1 |
| `self-healing-cycle.yaml` | 1 | Task that fails review → diagnose → retry → pass | P1 |
| `multi-chain-parallel.yaml` | 2 | Two independent tasks executing in parallel chain windows | P2 |
| `pulsar-emit-test.yaml` | 1 | Scheduled task emitter creates ticket on schedule | P2 |

---

## 8. Dashboard Requirements

A **Test Cockpit** page in the OPS menu should display:

1. **Suite Catalog** — all registered suites with status badges (active/deprecated/archived)
2. **Last Run** — date, result, duration, commit hash per suite
3. **Coverage Matrix** — which components each suite covers (visual grid)
4. **Run Button** — manual trigger to import + execute a suite on the dev board
5. **Validation History** — timeline of test runs with pass/fail trends

---

*This audit should be reviewed and updated after each pipeline refactor or new suite addition.*
