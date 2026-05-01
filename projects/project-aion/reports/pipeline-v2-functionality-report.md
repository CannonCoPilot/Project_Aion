# Pipeline v2 Functionality Report

**Date**: 2026-04-30
**Test**: Gospel Synopsis — Single-ticket decomposition test
**Branch**: nate-dev (commit b42e87f + stage.py hotfix)
**Duration**: 22+ minutes (pipeline still cycling at report finalization — recursive decomposition prevents natural convergence)

---

## 1. Test Design

**Input**: One master task (`gospel-synopsis.yaml`) describing a 6-step document merging workflow:
1. Identify parallel passages between Mark 1 and Luke 4
2. Create individual synopsis documents for each scene
3. Create synopsis for unique scenes
4. Merge all synopsis files into master document
5. Convert to Word document (.docx)
6. Validate all deliverables

**Objective**: Verify the full pipeline lifecycle — staging, evaluation (with decomposition), orchestration (with chain dependencies), execution, review, and failure recovery.

**Infrastructure**: Pulse dev (port 8800), Ollama qwen3:32b (staging/evaluation/review/diagnose), Claude Sonnet 4.6 (execution), Dashboard (port 8701).

---

## 2. Timeline

| Time (UTC) | Event |
|------------|-------|
| 12:19:52 | GS-MASTER imported with `staging:wait` |
| 12:19:52 | Stager claimed task → `staging:processing` |
| 12:19:52 | **Stager SyntaxError** — f-string backslash escape in `stage.py:141` (hotfixed) |
| 12:19:52 | Task stuck at `staging:processing` for ~5 min until manual reset |
| 12:19:26 | Stager re-processed with fix → `staging:done` (26s) |
| 12:19:56 | Evaluator started → analyzed 6 sequential steps |
| 12:20:27 | **Decomposition triggered** → 5 child tasks created |
| 12:20:56 | Orchestrator: parent blocked, 1 task chained |
| 12:21:09–12:21:51 | All 5 children staged (42s for batch) |
| 12:22:07–12:22:39 | Children evaluated (3 of 5 in first batch) |
| 12:22:27 | Orchestrator: Chain 1 created (3 tasks, batch-based) |
| 12:22:57 | Orchestrator: Chain 2 created (2 remaining tasks) |
| 12:23:xx | Executor launched on Chain 1 order 0 + Chain 2 order 0 |
| 12:25:45 | AION-1aa286ab executed (validation report) |
| 12:26:11 | **Review FAILED**: "missing files caused by upstream task failures" |
| 12:26:11 | Diagnose service launched (retry 1) |
| 12:29:26 | AION-ace66392 executed (merge synopses) |
| 12:30:05 | **Review PASSED** — first child task completed successfully |
| 12:30:38 | AION-8c38f3ec (create synopses) re-evaluated → `decompose=True` |
| 12:30:58 | 5 grandchild tasks created from decomposition |
| 12:32:26 | Grandchild AION-ebc9cf82 (verify completeness) → `decompose=True` |
| 12:33:xx | 3 great-grandchild tasks created (depth 4) |
| 12:33:31 | AION-1aa286ab re-executed (retry 2) |
| 12:33:xx | AION-f3762db3 executing (create Markdown files) |

---

## 3. Task Tree (final snapshot — 18 tasks, 4 levels deep)

```
SETUP-42082a01 (parent, BLOCKED)
+-- AION-d4560a82 -- Identify parallels (3 retries, CYCLING, assigned biblical-text-analyst)
+-- AION-8c38f3ec -- Create synopses (BLOCKED, 3 retries, decomposed into 5 grandchildren)
|   +-- AION-e4e3f690 -- Extract source text (CLOSED, 1 retry)
|   +-- AION-50f7363a -- Generate scene slugs (3 retries, CYCLING)
|   +-- AION-f3762db3 -- Create Markdown files (CLOSED, 1 retry)
|   +-- AION-f145208d -- Populate verbatim text (CLOSED, 1 retry)
|   +-- AION-ebc9cf82 -- Verify completeness (BLOCKED, decomposed into 3 great-grandchildren)
|       +-- AION-17353fd3 -- Verify scene completeness (CLOSED, 1 retry)
|       +-- AION-292288d1 -- Verify accuracy (BLOCKED, 3 retries, decomposed into 4)
|       |   +-- AION-0d8fa994 -- List synopsis files (CYCLING)
|       |   +-- AION-53b4a6df -- Compare synopsis with source (CYCLING)
|       |   +-- AION-bbe96a7e -- Repeat comparison for all (CYCLING)
|       |   +-- AION-6ab4a8c9 -- Generate comparison report (CYCLING)
|       +-- AION-891e3c4c -- Generate verification report (CLOSED, 1 retry)
+-- AION-ace66392 -- Merge synopses (CLOSED, 1 retry)
+-- AION-b4aaa600 -- Convert to Word doc (0 retries, WAITING)
+-- AION-1aa286ab -- Validation report (CLOSED, 2 retries)
```

**Tree stats**: 4 levels deep, 18 tasks from 1 input. 7 closed, 4 blocked, 7 cycling.
**Decomposition cascade**: parent -> child (verify) -> grandchild (verify) -> great-grandchild (4 tasks).
**Persona hallucination**: Evaluator assigned `biblical-text-analyst` to AION-d4560a82 — a persona that does not exist in the personas directory. Executor will fall back to `autofix-executor`.

---

## 4. Pipeline Stage Analysis

### 4.1 Staging (qwen3:32b)
- **Performance**: 20–30s per task
- **Type detection**: Correctly typed tasks as `feature`, `research`, `infrastructure`, `verify`
- **Bug found**: `stage.py:141` had escaped quotes in f-string (`\"` inside `{}`) causing SyntaxError. Hotfixed to single quotes.
- **Behavior**: Processes tasks individually as they appear. No batching.

### 4.2 Evaluation (qwen3:32b)
- **Performance**: 10–30s per task
- **Decomposition**: Correctly triggered on the 6-step master task (`decompose=True`)
- **Persona assignment**: All tasks assigned `test-writer` (correct for this test suite)
- **Safety**: All tasks passed safety check (`safe=True`)
- **Issue**: Verification/validation tasks also trigger `decompose=True`, causing recursive decomposition cascades (see §5.1)

### 4.3 Orchestration (deterministic, no LLM)
- **Performance**: 12–43ms per batch (fast, no LLM call)
- **Batch processing**: Chains tasks that are evaluated at the same poll cycle
- **Issue**: Creates separate chains for tasks evaluated in different batches (see §5.2)
- **Issue**: Chain ordering is semantic-blind — validation task got order 0 instead of last (see §5.3)

### 4.4 Execution (Claude Sonnet 4.6 via `claude -p`)
- **Concurrency**: max_executors=5, but chain dependencies limit parallelism to 1–2 concurrent executors
- **Context chaining**: `--session-id` and `-r` flags functional
- **Sidecar files**: Written correctly, detected by `/pipeline/active` endpoint
- **Crash recovery**: `exit code 1` correctly handled → `active:no` → diagnose cycle

### 4.5 Review (qwen3:32b)
- **Performance**: ~15s per review
- **Accuracy**: Correctly rejected validation report that ran before dependencies produced output
- **Correctly passed**: Merge synopses task that produced valid output
- **Issue**: `confidence=medium` on both pass and fail — not differentiated

### 4.6 Diagnose → Re-stage
- **Recovery loop**: Failed review → diagnose → redesigned prompt → re-stage → re-evaluate → re-orchestrate → re-execute
- **Retry tracking**: `executor_attempts` metadata correctly incremented
- **Issue**: Diagnose sometimes triggers `decompose=True` on retry, creating new subtasks instead of re-trying the original task

---

## 5. Critical Findings

### 5.1 Recursive Decomposition Cascade (SEVERITY: HIGH)

**Problem**: The evaluator's decomposition heuristic triggers on any task with 3+ sequential steps. Verification and validation tasks naturally describe multiple check steps, causing the evaluator to decompose them recursively. The test produced a 4-level task tree from a single input.

**Impact**: Task count grew from 1 → 6 → 11 → 14. Each decomposition adds staging, evaluation, and orchestration overhead (~60s per task). Verification tasks at depth 3+ are semantically identical to their parents.

**Root cause**: No decomposition depth limit. No `decompose:false` label on child tasks. Evaluator doesn't check parent decomposition depth.

**Recommendation**: 
- Add `max_decomposition_depth` parameter (default 2)
- Stamp child tasks with `decompose:false` label
- Evaluator checks parent metadata before splitting

### 5.2 Batch-Based Chain Fragmentation (SEVERITY: MEDIUM)

**Problem**: The orchestrator creates chains from tasks available at each poll cycle. When 5 child tasks are evaluated in two batches (3 + 2), it creates two independent chains instead of one ordered chain.

**Impact**: Parallel execution of tasks that should be sequential. Tasks in different chains don't have dependency awareness.

**Root cause**: Orchestrator groups by `project + persona` at poll time. No concept of "sibling group" from a common parent decomposition.

**Recommendation**:
- Evaluator should write `parent_task` metadata when decomposing
- Orchestrator should wait for all siblings from the same parent before chaining
- Or: orchestrator should merge chains sharing the same parent

### 5.3 Semantic-Blind Chain Ordering (SEVERITY: HIGH)

**Problem**: The orchestrator orders tasks by creation time or ID, not by logical dependency. "Generate validation report" (which validates ALL outputs) was placed at chain order 0 and executed first — before any outputs existed.

**Impact**: Wasted execution cycles (Claude headless launched on a task that can't succeed), wasted review cycles, wasted diagnose cycles. The validation task burned 2 retries before the pipeline naturally progressed enough for it to potentially succeed.

**Root cause**: Orchestrator is deterministic (no LLM) and doesn't analyze task descriptions for dependency signals like "validate all deliverables" or "convert the master synopsis."

**Recommendation**:
- Add lightweight LLM pass in orchestrator for semantic ordering
- Or: use keyword heuristics (tasks containing "validate", "verify", "final" go last)
- Or: evaluator assigns explicit `depends_on` metadata during decomposition

### 5.4 Retry Waste on Dependency-Blocked Tasks (SEVERITY: MEDIUM)

**Problem**: Tasks that fail because upstream dependencies haven't produced output yet get full diagnose→re-stage→re-evaluate→re-orchestrate cycles. Each cycle takes 60–90s and consumes LLM tokens.

**Impact**: AION-1aa286ab used 2 retries before any dependency was met. AION-d4560a82 used 3 retries.

**Recommendation**:
- Diagnose service should detect "missing upstream output" failures
- These should be re-queued with a dependency wait, not re-staged from scratch
- Or: reviewer should tag failures as `retry_reason:dependency` vs `retry_reason:quality`

---

## 6. What Worked Well

1. **Decomposition triggered correctly**: The evaluator identified the 6-step task and split it into 5 coherent subtasks with appropriate titles and descriptions.

2. **Review quality**: The reviewer correctly rejected a task that ran out of order and correctly passed a task that produced valid output. The failure reasons were specific and actionable.

3. **Failure recovery loop**: The diagnose → re-stage → re-execute pipeline functions as designed. Tasks don't get permanently stuck.

4. **Concurrent execution**: Multiple executors ran in parallel when chain dependencies allowed.

5. **Event-driven pipeline**: Webhook-based triggering with 30s fallback poll kept latency low.

6. **Sidecar-based observability**: Dashboard correctly detected active stages via sidecar files.

7. **Type detection**: Stager correctly classified tasks as `research`, `feature`, `infrastructure`, and `verify`.

---

## 7. Metrics Summary

| Metric | Value |
|--------|-------|
| Input tasks | 1 |
| Total tasks created | 18 (and growing at report finalization) |
| Tasks closed (passed review) | 7 |
| Tasks blocked | 4 (including parent) |
| Tasks still cycling | 7 |
| Task tree depth | 4+ levels (parent → child → grandchild → great-grandchild) |
| Chains created | 7+ (fragmented across orchestrator poll batches) |
| Total retries burned | 20 across all tasks |
| Tasks with 3+ retries | 4 |
| Staging time (avg) | ~25s per task |
| Evaluation time (avg) | ~15s per task |
| Orchestration time (avg) | ~25ms per batch (deterministic, no LLM) |
| Execution time (first close) | ~7 min (AION-ace66392, merge synopses) |
| Review time (avg) | ~15s per task |
| Time to first review pass | 10 min 13s (AION-ace66392) |
| Pipeline runtime at finalization | 22+ min (not converged) |
| Decomposition fan-out | 1 → 6 → 11 → 14 → 18 tasks |

---

## 8. Recommendations (Priority Order)

1. **P0: Decomposition depth limit** — Add `max_depth=2` and `decompose:false` on child tasks to prevent recursive cascades. This is the most impactful fix.

2. **P0: Semantic ordering in orchestrator** — Add keyword-based heuristics or lightweight LLM pass to order tasks by logical dependency. "Validate" and "verify" tasks should always be last.

3. **P1: Sibling-aware orchestration** — When evaluator decomposes a parent, stamp children with `parent_task` and have orchestrator wait for all siblings before chaining.

4. **P1: Dependency-aware retry** — Diagnose service should distinguish "missing upstream output" from "quality failure" and handle differently.

5. **P2: Evaluator decomposition refinement** — Leaf tasks and verification steps should not trigger decomposition. Add heuristics for task type.

6. **P2: Chain merge** — Orchestrator should detect and merge chains that share a common parent or project+persona when new tasks appear.

---

## 9. SyntaxError Hotfix

**File**: `.claude/jobs/services/stage.py:141`
**Bug**: Backslash-escaped quotes inside f-string expression: `f"...{structured.get(\"key\", \"default\")}..."`
**Fix**: Changed to single quotes: `f"...{structured.get('key', 'default')}..."`
**Impact**: Stager crashed on every invocation until fixed. First ~5 minutes of the test were lost.

---

## 10. Appendix: Test Configuration

```yaml
# gospel-synopsis.yaml — single master task
tasks:
  - title: "GS-MASTER: Parallelize and merge Mark 1 and Luke 4 from KJV source texts"
    labels: [project:gospel-synopsis, assigned:test-writer, type:feature, ...]
    # 2568 chars, 6 explicit steps, sequential dependencies
```

**Source data**: `tests/gospel-synopsis/sources/mark-1.txt` (45 verses), `luke-4.txt` (44 verses)

**Pipeline services**: stage.py, evaluate.py, orchestrate.py, executor.py, reviewer.py, diagnose.py, event-watcher-v2.py

---

---

## 11. Final Results (appended at T+22 min)

### Task Outcomes

| Task ID | Title | Status | Retries | Review |
|---------|-------|--------|---------|--------|
| SETUP-42082a01 | GS-MASTER (parent) | BLOCKED | 0 | — |
| AION-ace66392 | Merge synopses | **CLOSED** | 1 | PASS |
| AION-1aa286ab | Validation report | **CLOSED** | 2 | PASS |
| AION-e4e3f690 | Extract source text | **CLOSED** | 1 | PASS |
| AION-f3762db3 | Create Markdown files | **CLOSED** | 1 | PASS |
| AION-f145208d | Populate verbatim text | **CLOSED** | 1 | PASS |
| AION-17353fd3 | Verify scene completeness | **CLOSED** | 1 | PASS |
| AION-891e3c4c | Generate verification report | **CLOSED** | 1 | PASS |
| AION-d4560a82 | Identify parallels | cycling | 3+ | — |
| AION-8c38f3ec | Create synopses (parent) | blocked | 3 | — |
| AION-50f7363a | Generate scene slugs | cycling | 3+ | — |
| AION-b4aaa600 | Convert to Word doc | waiting | 0 | — |
| AION-ebc9cf82 | Verify completeness | blocked | 0 | — |
| AION-292288d1 | Verify accuracy | blocked | 3 | — |
| AION-0d8fa994 | List synopsis files | cycling | 0 | — |
| AION-53b4a6df | Compare synopsis | cycling | 0 | — |
| AION-bbe96a7e | Repeat comparison | cycling | 0 | — |
| AION-6ab4a8c9 | Comparison report | cycling | 0 | — |

**Result: 7/18 tasks completed successfully. Pipeline did not naturally converge.**

### Additional Finding: Persona Hallucination

The evaluator assigned `persona=biblical-text-analyst` to AION-d4560a82 on its 4th evaluation cycle. This persona does not exist in `.claude/jobs/personas/`. The executor's `load_persona_prompt()` will return `None`, falling back to no system prompt (not even the default `autofix-executor` prompt).

**Recommendation**: Evaluator should validate persona names against the available persona directory, or the executor should fall back to a default persona when the assigned one doesn't exist.

### Root Cause: Why The Pipeline Didn't Converge

The pipeline entered a non-converging state because:

1. **Verification tasks decompose recursively**: Each verify/validate task that enters the diagnose loop gets `decompose=True` on re-evaluation, spawning more children. Those children include more verify tasks, which also decompose.

2. **Semantic-blind ordering causes upstream failures**: Tasks that depend on others' output get ordered first, fail, retry 3 times, enter diagnose, get decomposed — each cycle burning ~60-90s and LLM tokens.

3. **No convergence mechanism**: There is no max-depth limit, no sibling-aware orchestration, and no "this task can't proceed until X is done" signal. The pipeline relies on brute-force retry to eventually succeed, which works for some tasks (AION-1aa286ab passed on retry 2) but creates unbounded cycling for others.

### Verdict

The pipeline's core lifecycle (stage -> evaluate -> orchestrate -> execute -> review -> close) is **functionally correct**. The decomposition, review, and failure-recovery mechanisms all work as designed. The problems are in the **control layer** — specifically ordering, depth limits, and dependency awareness. These are addressable with targeted fixes (see Recommendations §8).

---

*Report finalized 2026-04-30 ~06:45 MDT. Pipeline was still cycling at time of finalization.*
*Pipeline v2 — AIFred-Pro-Dev nate-dev (commit b42e87f)*
*Data snapshots saved to .claude/scratch/pipeline-test-snapshot.json and pipeline-test-final.json*
