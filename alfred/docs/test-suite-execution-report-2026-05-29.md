# Test Suite Execution Report — 2026-05-29

**Suite**: Reviewer Pass/Fail Pair + Self-Healing Cycle + Sentinel Timeout
**Monitoring window**: 17:26:40Z – 17:30:42Z (4 min 2 sec, 8 polls @ 30s)
**API endpoint**: `http://localhost:8800/api/v1/tasks/{task_id}`
**Reviewer engine**: qwen3:32b via Ollama
**Executor engine**: signal-delegation (chain-executor via warm interactive sessions)
**Executor model**: claude-sonnet-4-6

---

## 1. Summary of Results

| Task ID | Probe Name | Expected Outcome | Actual Outcome | Match? |
|---------|-----------|-------------------|----------------|--------|
| TEST-169ee1c0 | PROBE-PASS | Pass review first try | **PASSED** review, closed | YES |
| TEST-cb914a23 | PROBE-FAIL | Fail review → diagnose → re-stage | **PASSED** review, closed (no diagnose) | **NO** |
| TEST-3e284952 | PROBE-HEAL | Fail → diagnose → retry → pass | **PASSED** review first try, closed | **NO** |
| TEST-7f039bc1 | PROBE-TIMEOUT | Timeout 3x → blocked | Timeout 1x → re-execute → **PASSED** review | **NO** |

**Pass rate vs expectations**: 1/4 (25%). Only PROBE-PASS matched its expected behavior. The other 3 probes exposed real issues in the test design and pipeline behavior.

---

## 2. Per-Task Detailed Timeline

### TEST-169ee1c0 — PROBE-PASS: Create reviewer-pass.txt correctly

**Final status**: `closed` | **Review verdict**: PASSED | **Executor attempts**: 1

| Time (UTC) | Stage Transition | Key Labels |
|------------|-----------------|------------|
| 17:25:48 | Created | `stage:staging`, `staging:processing` |
| 17:26:50 | Staging complete | `staging:done` |
| 17:27:07 | Evaluated (start) | `evaluated:processing` |
| 17:27:46 | Evaluated → queued | `evaluated:done`, `queued:done`, persona=`test-reviewer` |
| 17:28:07 | Orchestrated (chain order 2/2) | Chained behind TEST-cb914a23 (same `reviewer-test:test-reviewer` group) |
| 17:28:37 | Queued (waiting for chain slot) | `stage:queued` |
| 17:29:07 | Executing (attempt 1) | `active:running`, `stage:executing`, session `6f3c6bd7` |
| 17:29:27 | Executed (20016ms) | `active:done`, `completed:reviewing`, `stage:executed` |
| 17:29:37 | Under review | Reviewer found file at expected path (28 bytes) |
| 17:30:40 | **CLOSED** — review PASSED | `completed:done`, `review_passed=True` |

**Verdict**: Matched expectations. File created at correct path, reviewer confirmed.

---

### TEST-cb914a23 — PROBE-FAIL: Write file to wrong subdirectory

**Final status**: `closed` | **Review verdict**: PASSED (unexpected) | **Executor attempts**: 1

| Time (UTC) | Stage Transition | Key Labels |
|------------|-----------------|------------|
| 17:25:48 | Created | `stage:staging`, `staging:processing` |
| 17:26:41 | Staging complete | `staging:done` |
| 17:27:07 | Evaluating | `evaluated:processing` |
| 17:27:38 | Evaluated → queued | `evaluated:done`, persona=`test-reviewer` |
| 17:28:07 | Orchestrated (chain order 1/2) | First in `reviewer-test:test-reviewer` chain |
| 17:28:37 | Executing (attempt 1) | `active:running`, `stage:executing`, session `5d0494bf` |
| 17:29:02 | Executed (25014ms) | `active:done`, `completed:reviewing` |
| 17:29:07 | Under review | Reviewer found file at `wrong-place/reviewer-fail.txt` (73 bytes) |
| 17:29:46 | **CLOSED** — review PASSED | `completed:done`, `review_passed=True` |

**Root cause of mismatch**: The reviewer evaluated the task description literally: "Create reviewer-fail.txt and write it to a subdirectory called 'wrong-place'". Since the executor did exactly that, the reviewer correctly judged the task as completed. The test design flaw is that the task description instructs the executor to put the file in the wrong place — the reviewer has no separate "expected correct path" to compare against. The reviewer's summary: "The file 'reviewer-fail.txt' was correctly created in the 'wrong-place' subdirectory, as intended by the task."

**Design fix needed**: The PROBE-FAIL test should have a task description that asks for the file at the correct path, with a separate mechanism to force the executor to put it in the wrong place (e.g., a pre-existing file conflict, a symlink trap, or an executor-side fault injection).

---

### TEST-3e284952 — PROBE-HEAL: Create healing-test.txt (initially wrong path)

**Final status**: `closed` | **Review verdict**: PASSED (unexpected) | **Executor attempts**: 1

| Time (UTC) | Stage Transition | Key Labels |
|------------|-----------------|------------|
| 17:25:55 | Created | `stage:staging`, `staging:processing` |
| 17:26:29 | Staging complete | `staging:done`, stage_output.unverified_paths=`[output/heal-test/scratch/healing-test.txt]` |
| 17:26:37 | Evaluating | `evaluated:processing` |
| 17:27:15 | Evaluated → queued | `evaluated:done`, persona=`autofix-executor` |
| 17:27:37 | Orchestrated (order 1/1) | Standalone chain (`heal-test:autofix-executor`) |
| 17:28:07 | Executing (attempt 1) | `active:running`, `stage:executing`, session `324bf757` |
| 17:28:27 | Executed (20007ms) | `active:done`, `completed:reviewing` |
| 17:28:37 | Under review | Reviewer found file at `output/heal-test/scratch/healing-test.txt` (25 bytes) |
| 17:29:03 | **CLOSED** — review PASSED | `completed:done`, `review_passed=True` |

**Root cause of mismatch**: Same as PROBE-FAIL — the task description explicitly says "create file in subdirectory named 'scratch' inside 'output/heal-test/'". The executor followed instructions and put the file at `output/heal-test/scratch/healing-test.txt`. The reviewer correctly judged this as task completion. The test was supposed to produce a wrong-path output, but the task description already specifies the "wrong" path as the correct instruction. No self-healing cycle was triggered because the task never failed.

**Design fix needed**: The PROBE-HEAL test should have the task description specify the correct final path (e.g., `output/heal-test/healing-test.txt`), but inject a fault that causes the executor to write to the wrong location on first attempt (e.g., via a misleading prior context, or a filesystem-level trap).

---

### TEST-7f039bc1 — PROBE-TIMEOUT: Deliberate sentinel timeout test

**Final status**: `closed` | **Review verdict**: PASSED (unexpected) | **Executor attempts**: 2

| Time (UTC) | Stage Transition | Key Labels |
|------------|-----------------|------------|
| 17:25:55 | Created | `stage:staging`, `staging:processing` |
| 17:26:18 | Staging complete | `staging:done`, `timeout_minutes=1` |
| 17:26:37 | Evaluating | `evaluated:processing` |
| 17:27:07 | Evaluated → queued | `evaluated:done`, persona=`test-reviewer` |
| 17:27:07 | Orchestrated (order 1/1) | Standalone chain (`timeout-test:test-reviewer`) |
| 17:27:37 | **Executing (attempt 1)** | `active:running`, `stage:executing`, session `aeac095e` |
| 17:28:37 | **TIMED OUT (60s)** | `last_error=host executor timeout`, `executor_attempts=1` |
| 17:28:37 | Re-queued | `active:no`, `stage:queued` |
| 17:29:07 | **Executing (attempt 2)** | `active:running`, `stage:executing`, session `d3e8d0ec` |
| 17:29:32 | Executed (25012ms) | `active:done`, `completed:reviewing` |
| 17:29:37 | Under review | Reviewer found file at `output/timeout-test/timeout-test.txt` (0 bytes) |
| 17:30:36 | **CLOSED** — review PASSED | `completed:done`, `review_passed=True`, `executor_attempts=2` |

**Partial match**: The timeout mechanism worked correctly on attempt 1 — the sentinel timed out after 60s as expected. However:
1. **Only 1 timeout instead of expected 3**: The chain executor's second attempt succeeded because the `sleep 90` was launched in the background by the first attempt's Claude session. When attempt 2 arrived in the same chain window, the file had already been created by the background sleep completing. The 25s execution time on attempt 2 confirms the task was trivially completed (just verifying the file exists).
2. **No blocking**: The task was expected to reach `blocked:yes` after 3 timeouts, but it passed on attempt 2 instead.

**Design fix needed**: The timeout test needs a task that genuinely cannot complete within the timeout on any retry — not a sleep-then-write pattern where the background process persists across attempts. A better design: require the executor to call an external API endpoint that deliberately responds slowly (> timeout), with no caching or persistence.

---

## 3. Pipeline Stage Flow (observed for all tasks)

```
Created → staging:processing → staging:done → evaluated:processing → evaluated:done →
  queued:done → stage:queued → stage:executing (active:running) →
    [timeout? → stage:queued → re-execute] →
  stage:executed (active:done, completed:reviewing) →
  completed:done → closed
```

All 4 tasks traversed this exact pipeline. The label state machine behaved consistently:
- `staging:` labels transition: `processing` → `done`
- `evaluated:` labels transition: `processing` → `done`
- `active:` labels transition: `no` → `running` → `done`
- `completed:` labels transition: `no` → `reviewing` → `done`
- `stage:` labels transition: `staging` → `staged` → `evaluated` → `queued` → `executing` → `executed`

---

## 4. Chain Executor Behavior

| Chain Group | Tasks | Chain ID | Windows |
|------------|-------|----------|---------|
| `timeout-test:test-reviewer` | TEST-7f039bc1 (1/1) | `fbc2762c-a36` | W14: chain-fbc2762c |
| `heal-test:autofix-executor` | TEST-3e284952 (1/1) | `f742bb09-85c` | W15: chain-f742bb09 |
| `reviewer-test:test-reviewer` | TEST-cb914a23 (1/2), TEST-169ee1c0 (2/2) | `650e6db7-09a` | W16: chain-650e6db7 |

Chain grouping by `project:persona` worked correctly. TEST-cb914a23 and TEST-169ee1c0 were batched into the same chain (same project `reviewer-test`, same persona `test-reviewer`), with cb914a23 executing first (order 0) and propagating its session context (`chain_resume=5d0494bf`) to 169ee1c0.

---

## 5. Timing Summary

| Task | Created → Staged | Staged → Evaluated | Evaluated → Executed | Executed → Reviewed | **Total** |
|------|-----------------|--------------------|-----------------------|--------------------|-----------|
| TEST-169ee1c0 | 62s | 56s | 101s | 73s | **4m 52s** |
| TEST-cb914a23 | 53s | 57s | 84s | 44s | **3m 58s** |
| TEST-3e284952 | 34s | 48s | 72s | 36s | **3m 8s** |
| TEST-7f039bc1 | 23s | 49s | 145s (incl. 1 timeout) | 64s | **4m 41s** |

Average end-to-end: ~4 min per task. Staging LLM calls (qwen3:32b): 11-13s. Evaluation LLM calls: 30-38s. Review LLM calls: 26-63s. Execution via chain-executor: 20-35s per attempt.

---

## 6. Unexpected Behaviors

### UB-1: Reviewer does not compare against expected output path
The Ollama reviewer (qwen3:32b) evaluates whether the executor followed the task description, not whether the output is at a canonical "correct" location. If the task description says "put file in wrong-place/", the reviewer judges success when the file is in wrong-place/. This means reviewer-failure tests must be designed so the task description specifies the correct path, and the executor is forced to deviate by some external mechanism.

### UB-2: No diagnose cycles triggered
None of the 4 tasks entered the diagnose path. The diagnose service was active (verified via logs showing AION-264689d9 diagnosed earlier at 17:00:50), but no test task review returned `passed=false`, so no diagnose was ever invoked.

### UB-3: Timeout task succeeded on retry due to persistent background process
The chain-executor's interactive session ran `sleep 90 && touch timeout-test.txt` as a background process. When the sentinel timed out after 60s, the background process continued running in the tmux window. When attempt 2 dispatched to the same chain window 30s later, the sleep had completed and the file existed. The executor on attempt 2 simply verified the file and declared success.

### UB-4: Pipeline-watcher log sparse for test tasks
The pipeline-watcher container log shows only 1 relevant entry: "Launching stage for task TEST-7f039bc1". The event-watcher-v2 (running on the host) handled the actual service dispatching via webhooks. The pipeline-watcher container appears to have been restarted 3 times (3 "Starting pipeline watcher" entries in the log window), suggesting container instability.

### UB-5: Reviewer model upgraded to qwen3:32b
All reviews used `qwen3:32b` (per `review_telemetry.model` in metadata), not the smaller qwen3:8b referenced elsewhere. This larger model may explain the longer review times (up to 63s) but also the more thorough evaluations.

---

## 7. Infrastructure State

### tmux Windows (at monitoring end)
```
0:Jarvis  1:Watcher  2:Ennoia  3:Virgil  4:Commands  5:AlfDev-Seed
6:MLX-Embed  7:LiteLLM  8:HUD  9:Bridge
10:chain-cdb8b38c  11:chain-71326aac  12:chain-ce31518d  (pre-existing chains)
13:job-context-maintenance
14:chain-fbc2762c  (PROBE-TIMEOUT)
15:chain-f742bb09  (PROBE-HEAL)
16:chain-650e6db7  (PROBE-FAIL + PROBE-PASS)
```

### Service Logs Consulted
- `service-stage.log` — all 4 tasks staged between 17:26:07–17:26:50
- `service-evaluate.log` — all 4 tasks evaluated between 17:26:37–17:27:46
- `service-execute.log` — all 4 tasks executed; 1 timeout on TEST-7f039bc1
- `service-review.log` — all 4 tasks reviewed by qwen3:32b; all PASSED
- `service-orchestrate.log` — chain grouping and ordering confirmed
- `service-diagnose.log` — no entries for TEST-* tasks (no failures to diagnose)
- `docker logs aifred-dev-pipeline` — webhook-primary mode, 3 restarts in window

---

## 8. Recommendations

1. **PROBE-FAIL redesign**: Task description should specify the correct output path. Use a separate fault-injection mechanism (e.g., a pre-seeded bad file, a misleading `prior_context_summary`, or a custom executor persona prompt that deliberately misplaces files) to cause the executor to deviate.

2. **PROBE-HEAL redesign**: Same issue as PROBE-FAIL. The self-healing cycle requires a genuine review failure to trigger the diagnose service. Consider using a two-phase approach: Phase 1 executor writes to wrong path (via fault injection); reviewer correctly fails it; Phase 2 diagnose identifies the error; Phase 3 re-execution with corrected instructions succeeds.

3. **PROBE-TIMEOUT redesign**: Use a task that cannot succeed within the timeout regardless of retries (e.g., "curl a deliberately slow endpoint that takes 120s to respond" with `timeout_minutes=1`). Ensure the timeout mechanism doesn't leave background processes that satisfy the next retry.

4. **Reviewer calibration**: Consider adding a `expected_output_path` field to task metadata that the reviewer must verify against, independent of the task description. This would enable the reviewer to catch "completed the wrong thing correctly" failures.

5. **max_retries enforcement**: PROBE-TIMEOUT was expected to timeout 3 times then get blocked. The pipeline needs a `max_executor_attempts` field (defaulting to 3) that transitions to `blocked:yes` when exhausted.

---

*Report generated 2026-05-29T17:31Z by Jarvis monitoring agent. Data sources: Pulse API polling (8 polls, 30s interval), service logs (stage/evaluate/execute/review/orchestrate/diagnose), pipeline-watcher container logs, tmux chain window captures.*
