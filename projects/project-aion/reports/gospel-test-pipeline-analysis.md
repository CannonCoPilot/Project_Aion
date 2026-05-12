# Gospel Synopsis Pipeline Analysis Report

**Test Run**: 2026-04-30 08:30–09:05 (local time)
**Pipeline**: Pulse-Nexus Pipeline v2 (pipeline-watcher.py)
**Test Project**: Gospel Synopsis — Mark 1 ∥ Luke 4 (KJV)
**Result**: 6/6 tasks closed, clean sweep

---

## 1. Timeline Reconstruction

All times local (CDT, UTC-6). Timestamps from service logs + task metadata.

### Phase 1: Setup (08:30:00 — 08:34:03) — 4 min

| Time | Event | Duration |
|------|-------|----------|
| 08:30:02 | Watcher started, webhook registered (broken localhost URL) | — |
| 08:30:02 | Stage SETUP-199f651f (master) | — |
| 08:30:38 | Master staged (type=feature) | 36s |
| 08:31:03 | Evaluate master | — |
| 08:31:37 | Master decomposed → 5 subtasks created | 34s |
| 08:32:03 | Orchestrate cycle 1 (master only) | — |
| 08:32:03 | Stage 5 subtasks (batch) | — |
| 08:32:17–08:33:00 | Subtasks staged individually | 57s |
| 08:33:03–08:33:53 | Subtasks evaluated individually | 50s |
| 08:34:03 | Orchestrate cycle 2 (5 subtasks, 1 chain) | — |

### Phase 2: Chain Execution (08:35:03 — 09:04:15) — 29 min

| Time | Task | Event | Duration |
|------|------|-------|----------|
| 08:35:03 | #0 c502298e | Execute (identify passages) | — |
| 08:36:16 | #0 | Completed, chain propagated (2577 B) | **73s** |
| 08:37:03 | #0 | Review | — |
| 08:37:12 | #0 | PASSED (qwen3:32b, 9s) | — |
| *08:37–08:39* | — | *IDLE (poll latency)* | *111s* |
| 08:39:03 | #1 bc4fa7ab | Execute attempt 1 — **FAILED** (--fork-session) | instant |
| *08:39–08:40* | — | *IDLE (poll latency)* | *60s* |
| 08:40:03 | #1 | Execute attempt 2 — **FAILED** (same bug) | instant |
| *08:40–08:41* | — | *IDLE (poll latency)* | *60s* |
| 08:41:03 | #1 | Execute attempt 3 (with fix, forking) | — |
| 08:43:32 | #1 | Completed, chain propagated (2900 B) | **149s** |
| 08:44:03 | #1 | PASSED review (22s) | — |
| 08:45:03 | #2 ee69c9f8 | Execute (merge synopsis), forking | — |
| 08:47:32 | #2 | Completed, chain propagated (2584 B) | **149s** |
| 08:47:44 | #2 | PASSED review (12s) | — |
| 08:48:03 | #3 8d2fdb08 | Execute (docx generation), forking | — |
| 08:54:09 | #3 | Completed, chain propagated (2690 B) | **366s** |
| 08:54:27 | #3 | PASSED review (18s) | — |
| 08:55:03 | #4 90077c54 | Execute (validation report), forking | — |
| 08:56:46 | #4 | Completed | **103s** |
| 08:57:03 | #4 | PASSED review (17s) | — |
| 08:57:03 | MASTER | Execute (re-did ALL work from scratch) | — |
| 09:04:03 | MASTER | Completed | **420s** |
| 09:04:15 | MASTER | PASSED review (12s) | — |

---

## 2. Watcher Metrics (Final)

| Metric | Value |
|--------|-------|
| Poll cycles | 67 |
| Total triggers | 28 |
| Stage triggers | 6 |
| Evaluate triggers | 6 |
| Orchestrate triggers | 2 |
| Execute triggers | 8 (6 tasks + 2 failed) |
| Review triggers | 6 |
| Diagnose triggers | **0** |
| Watchdog resets | **0** |
| Claim conflicts | **0** |
| Chain blocks | **0** |
| Webhook events | 13 (12 deduped) |

---

## 3. LLM Call Inventory

| Service | Model | Calls | Wasted | Avg Duration |
|---------|-------|-------|--------|--------------|
| Stage | qwen3:32b (local) | 6 | 0 | ~10s |
| Evaluate | qwen3:32b (local) | 6 | 0 | ~10s |
| Review | qwen3:32b (local) | 6 | 0 | ~14s |
| Execute | Claude Sonnet (API) | 8 | **3** | ~175s |
| **Total** | — | **26** | **3** | — |

**Wasted API calls**: 2 failed --fork-session attempts (instant fail, minimal cost) + 1 master re-execution (420s of redundant Claude Sonnet time — the most expensive waste item).

---

## 4. Output Assessment

### File Inventory

| File | Lines | Size | Location | Quality |
|------|-------|------|----------|---------|
| mark1-luke4-parallels.md | 43 | 1.6K | tests/gospel-synopsis/ | Good — 6 scenes correctly identified |
| temptation-synopsis.md | 30 | 2.5K | tests/gospel-synopsis/ | Good — KJV text included |
| galilee-return-synopsis.md | 19 | 1.0K | tests/gospel-synopsis/ | Good |
| unclean-spirit-synopsis.md | 26 | 2.6K | tests/gospel-synopsis/ | Good |
| simons-mother-synopsis.md | 20 | 1.3K | tests/gospel-synopsis/ | Good |
| healing-many-synopsis.md | 21 | 1.5K | tests/gospel-synopsis/ | Good |
| preaching-galilee-synopsis.md | 23 | 1.7K | tests/gospel-synopsis/ | Good |
| mark1-luke4-master.md | 286 | 25K | tests/gospel-synopsis/ | Good — comprehensive merge |
| mark1-luke4-synopsis.docx | — | 44K | tests/gospel-synopsis/ | Good — professional formatting |
| validation-report.md | 97 | 3.9K | tests/gospel-synopsis/ | Good — programmatic checks |
| build_docx.py | — | 33K | tests/gospel-synopsis/ | Artifact — python-docx builder |

### Orphan Files at Project Root (10 files, untracked)

The subtask executors wrote their outputs to the **project root** instead of `tests/gospel-synopsis/`. These are abandoned outputs that were superseded by the master task's correct outputs:

```
Alfred-Dev/mark1-luke4-parallels.md          (3.9K, from task #0)
Alfred-Dev/wilderness-temptation-synopsis.md  (from task #1)
Alfred-Dev/return-to-galilee-synopsis.md      (from task #1)
Alfred-Dev/capernaum-synagogue-exorcism-synopsis.md (from task #1)
Alfred-Dev/healing-simons-mother-in-law-synopsis.md (from task #1)
Alfred-Dev/evening-mass-healing-synopsis.md   (from task #1)
Alfred-Dev/withdrawal-and-preaching-synopsis.md (from task #1)
Alfred-Dev/mark1-luke4-master.md              (22.6K, from task #2)
Alfred-Dev/mark1-luke4-synopsis.docx          (46.8K, from task #3)
Alfred-Dev/validation-report.md               (8.5K, from task #4)
```

### Source Text Usage

Pre-provisioned KJV source files existed at `tests/gospel-synopsis/sources/`:
- `mark-1.txt` (5.3K) — full KJV Mark chapter 1
- `luke-4.txt` (5.6K) — full KJV Luke chapter 4

**Finding**: Subtask #0's executor log explicitly states: *"No source text files were provided; analysis drawn from standard Gospel knowledge."* The source texts were never read by the subtask chain. KJV quotations were reproduced from model training data.

The master task's executor log states it "copied verbatim from the source files" — the master likely read the sources correctly since it wrote to the proper directory.

**Impact**: KJV quotes in the subtask outputs may not be perfectly accurate. The reviewer (qwen3:32b) did not verify quote accuracy against source files.

---

## 5. Waste & Inefficiency Analysis

### Time Budget Breakdown (34 min 15s total)

| Category | Duration | % of Total | Notes |
|----------|----------|------------|-------|
| **Productive execution** (tasks #0-#4) | ~14 min | 41% | Actual Claude work on subtasks |
| **Master re-execution** | 7 min | 20% | **Redundant** — redid all subtask work |
| **Poll latency gaps** | ~8 min | 23% | Unavoidable at 60s interval |
| **Setup** (stage/evaluate/orchestrate) | 4 min | 12% | Necessary but optimizable |
| **Failed attempts** | 2 min | 6% | --fork-session bug (now fixed) |
| **Reviews** | ~1.5 min | 4% | Fast, local LLM |

### Root Causes of Waste

**W1: Master task re-execution (HIGH — 7 min, ~20% of total)**

The master task (SETUP-199f651f) was decomposed into 5 subtasks but then ALSO executed itself after all subtasks completed. The master's executor re-created every file from scratch in the correct directory (`tests/gospel-synopsis/`), making all 5 subtask executions effectively redundant.

This is a **design flaw in the orchestrator/executor interaction**:
- The evaluator correctly decomposed the master into subtasks
- The orchestrator correctly chained them with dependencies
- But when the master became unblocked (all children closed), the watcher treated it as a normal task and dispatched it for execution
- The executor gave it a full Claude session which redid everything

**Fix options**:
1. Master tasks with subtasks should auto-close when all children close (orchestration-only, no execution)
2. Or: master execution prompt should say "verify subtask outputs" not "do the work"
3. Or: master should be marked `type:orchestration` and skip the execute phase

**W2: Subtask file location (HIGH — all subtask outputs orphaned)**

All 5 subtasks wrote outputs to the **project root** instead of `tests/gospel-synopsis/`. The stage service provided `file_paths` in the stage_output metadata but without directory context. The executor prompts didn't include the project's base directory.

Root cause: `stage.py` analyzes the task description and suggests file paths but doesn't anchor them to the project's working directory from `PROJECT.md`.

**Fix**: Stage service should read `PROJECT.md` and include the project's base path in the structured description.

**W3: Source texts not read by subtasks (MEDIUM — quality impact)**

The subtask chain didn't read the pre-provisioned source files (`sources/mark-1.txt`, `sources/luke-4.txt`). Instead, it reproduced KJV text from model knowledge. This worked because KJV is well-represented in training data, but for less common source materials, this would produce incorrect outputs.

Root cause: The executor prompt doesn't instruct Claude to inventory available files before starting work.

**Fix**: Executor should include a "read PROJECT.md and inventory available files" instruction in the prompt.

**W4: Poll latency (MEDIUM — 8 min overhead, structural)**

With a 60s poll interval, each state transition incurs up to 60s of idle time. For a 6-task chain, this accumulates to ~8 minutes of pure waiting.

The webhook fix (host.docker.internal) was applied mid-test but 92% of webhooks were deduped because the poll had already processed the transition. This confirms the poll is the faster path at 60s intervals.

**Fix**: For chain execution, reduce poll interval to 15-30s during active chains, or have the webhook handler trigger immediate processing.

**W5: --fork-session bug (LOW — fixed, 2 min one-time cost)**

Two instant failures on task #1 due to missing `--fork-session` flag when combining `--session-id` with `-r`. Fixed in executor.py. Will not recur.

---

## 6. Pipeline Efficiency Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Correctness** | 9/10 | All tasks completed, correct decomposition, chain deps correct. -1 for source text skip |
| **Completeness** | 10/10 | 6/6 closed, all outputs present and valid |
| **Efficiency** | 5/10 | 20% redundant master execution, 23% poll latency, orphan files |
| **Quality gate** | 6/10 | Reviewer passed everything but didn't verify file locations or source text usage |
| **Resilience** | 8/10 | Recovered from --fork-session bug, chain propagation worked, no watchdog needed |
| **Observability** | 4/10 | Watcher log buffered, no structured telemetry, orphans undetected |

**Overall: 7/10** — Functionally correct, structurally wasteful.

---

## 7. Prioritized Improvements

| # | Priority | Issue | Fix | Impact |
|---|----------|-------|-----|--------|
| 1 | **P0** | Master re-execution wastes 20% of total time | Auto-close master when all children close, OR change master prompt to "verify only" | Saves 7 min per test |
| 2 | **P0** | Subtask files written to wrong directory | Stage service reads PROJECT.md for base path; include in executor prompt | Eliminates orphan files |
| 3 | **P1** | Source texts not read by executor | Executor prompt includes "inventory and read available project files" | Correct source usage |
| 4 | **P1** | Webhook self-registers with localhost | Add `WEBHOOK_CALLBACK_HOST` env var, default `host.docker.internal` | Prevents regression |
| 5 | **P1** | Reviewer doesn't check file locations | Review criteria should verify outputs are in expected directory | Catch location errors |
| 6 | **P2** | Watcher log buffered | Launch with `PYTHONUNBUFFERED=1` | Debugging visibility |
| 7 | **P2** | Poll latency during active chains | Reduce interval to 15-30s during chain execution | Saves ~5 min per chain |
| 8 | **P3** | No orphan file cleanup | Post-chain cleanup step removes root-level artifacts | Repo hygiene |

---

## 8. Comparison with Previous Test Runs

| Metric | Stress Test (Apr 29) | Gospel Test (Apr 30) |
|--------|---------------------|---------------------|
| Tasks | 15 | 6 |
| Duration | ~45 min | ~34 min |
| Closed | 10 (67%) | 6 (100%) |
| Cycling | 3 | 0 |
| Blocked | 2 | 0 |
| Diagnose | yes | 0 |
| Retries | multiple | 2 (bug-related) |
| Chain breaks | yes | 0 |

The gospel test shows significant improvement in chain handling and completion rate. The `--fork-session` fix and webhook URL fix directly addressed issues from prior runs.

---

*Report generated 2026-04-30 by Jarvis — Pipeline v2 monitoring session*
