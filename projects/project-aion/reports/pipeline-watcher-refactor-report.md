# Pipeline Watcher Refactor — Observation Report

**Date**: 2026-04-30
**Test**: Gospel Synopsis master task (Mark 1 + Luke 4 synoptic comparison)
**Watcher**: `pipeline-watcher.py` (renamed from `event-watcher-v2.py`)
**Watcher mode**: webhook-primary, 60s heartbeat (test), default 300s
**Commit base**: `3ecb0ba` on nate-dev

---

## 1. Test Timeline

| Time | Cycle | Event | Duration |
|------|-------|-------|----------|
| 08:30:02 | #1 | Watcher started, stage(master) triggered | — |
| 08:30:38 | — | Stage done (qwen3:32b) | 36s |
| 08:31:02 | #2 | evaluate(master) triggered | — |
| 08:31:37 | — | Evaluate done → 5 subtasks created (decomposition) | 35s |
| 08:32:03 | #3 | orchestrate(master) + stage(5 children) | — |
| 08:32:17-50 | — | All 5 children staged | 14-47s |
| 08:33:02 | #4 | evaluate(5 children) — parallel Ollama calls | — |
| 08:33:18-53 | — | All 5 children evaluated | 15-51s |
| 08:34:03 | #5 | orchestrate(5 children) → chain a992c224, orders 0-4 | — |
| 08:35:03 | #6 | execute(chain #0) → Claude Code headless (Sonnet) | — |
| 08:36:16 | — | Execution done, chain_resume propagated to task #1 | 73s |
| 08:37:02 | #8 | review(chain #0) → passed, task closed | — |
| 08:38:02 | #9 | dependency_unblock(task #1) → `blocked:no` | — |
| 08:39:02 | #10 | execute(chain #1) expected | — |

**Time from import to first execution**: 5 min 1s (5 heartbeat cycles)
**Time from first execution to task #0 closed**: 2 min 14s (execute + review)
**Per-task pipeline overhead**: ~60s per transition (heartbeat latency)

---

## 2. Findings — Ranked by Priority

### P0: Webhook Delivery Broken (Container → Host Networking)

**Impact**: The entire pipeline runs on heartbeat polling only. Zero webhook-driven transitions observed.

**Root cause**: Pulse API runs inside Docker container `aifred-dev-pulse`. The watcher registers webhook URL `http://localhost:8810/webhook`. From inside the container, `localhost` resolves to the container itself, not the host machine. Pulse fires webhooks — they silently fail (the `fire_webhooks` function logs warnings but they're inside the container).

**Fix**: The webhook registration URL must use the host-reachable address. Two options:
1. `http://host.docker.internal:8810/webhook` — works on macOS Docker, standard convention
2. Pass the host IP via env var and use it in registration

**Verification**: Manual `curl -X POST http://localhost:8810/webhook` from the host succeeded — the watcher's Flask server IS listening. Only the container can't reach it.

**Impact on test**: Pipeline worked correctly via heartbeat polling at 60s intervals. With webhooks working, transitions would be near-instant (50-100ms webhook delivery + service launch).

### P1: Reviewer Too Lenient — Passed Incorrect Output

**Impact**: The reviewer accepted task #0's output despite two objective quality failures.

**Failures not caught**:
1. **Wrong file path**: Output file `mark1-luke4-parallels.md` written to project root (`/Users/nathanielcannon/Claude/AIFred-Pro-Dev/`) instead of `tests/gospel-synopsis/` as specified in the task description
2. **Source texts not read**: Claude Code used training knowledge instead of reading the actual KJV text files at `tests/gospel-synopsis/sources/mark-1.txt` and `luke-4.txt`. The executor's own context summary noted: "No source text files were provided; analysis drawn from standard Gospel knowledge"

**Root cause**: The reviewer calls Ollama with the context summary and expected output description, but doesn't verify actual file system state. It can only judge what the executor REPORTED doing, not what actually happened.

**Recommendation**: Enhance the review prompt to include:
- File existence verification instructions ("check if expected output files exist at the specified paths")
- Cross-reference the context summary's `files_modified` against the task's expected output paths
- Flag when `gotchas` in the context summary mention missing source data

### P2: Watcher Log Buffering — Silent Heartbeats

**Impact**: Only heartbeat #1 appeared in the log file despite 9+ cycles executing correctly (confirmed via health endpoint metrics).

**Root cause**: Python's `logging` module writes to stderr via `StreamHandler`. When the watcher runs with `> file 2>&1 &`, stderr is redirected through stdout to the file. Python may buffer this when detecting a non-TTY destination. Flask's Werkzeug logs DID appear (they write directly to stderr with their own flushing).

**Fix**: Add `flush=True` or use `PYTHONUNBUFFERED=1` env var when launching the watcher. Or add explicit `sys.stderr.flush()` after the heartbeat log line.

### P3: Stage Service Doesn't Enforce Output Paths

**Impact**: The executor wrote files to the project root instead of the specified subdirectory.

**Root cause**: The stage service's `structured_description` reformulates the task but may not emphasize the exact output file paths from the original description. The executor then makes assumptions about where to write.

**Recommendation**: The stage service should extract explicit file paths from the description and include them in a `file_paths` or `output_paths` field in `stage_output` metadata. The executor prompt should surface these paths prominently (e.g., "You MUST write output to: `tests/gospel-synopsis/mark1-luke4-parallels.md`").

### P4: Chain Dependency Unblock Latency

**Impact**: After task #0 closed, task #1 waited 60s (one full heartbeat cycle) before being unblocked.

**Root cause**: Webhooks broken (P0). With working webhooks, `check_unblocks_for()` would fire immediately on `status:changed → closed`.

**Fix**: Resolves automatically when P0 is fixed.

---

## 3. What Worked Well

| Feature | Observation |
|---------|-------------|
| **Decomposition** | Master task correctly split into 5 ordered subtasks with `suggested_order` metadata |
| **Chain ordering** | Orchestrator chained tasks 0-4 in correct sequence, respecting `suggested_order` |
| **Dependency blocking** | Tasks 1-4 blocked with `reason:dependency`, master blocked on all 5 children |
| **Atomic claims** | 0 claim conflicts across 16+ triggers — no double-dispatch |
| **Chain resume propagation** | Session ID + log size correctly propagated from task #0 to task #1 |
| **Context summary (JICM epilogue)** | Claude produced valid `<context-summary>` JSON with all required fields |
| **Watchdog** | 0 resets needed — all state transitions clean |
| **Parallel service launches** | 5 stage and 5 evaluate calls ran concurrently via parallel Ollama |

---

## 4. Metrics Summary (at cycle 9)

| Metric | Value |
|--------|-------|
| Poll cycles | 9 |
| Webhook events received | 1 (manual test only) |
| Webhook-driven transitions | 0 |
| Stage triggers | 6 (1 master + 5 children) |
| Evaluate triggers | 6 (1 master + 5 children) |
| Orchestrate triggers | 2 (1 for master, 1 for children batch) |
| Execute triggers | 1 (chain #0) |
| Review triggers | 1 (chain #0 — passed) |
| Diagnose triggers | 0 |
| Watchdog resets | 0 |
| Claim conflicts | 0 |
| Chain blocks | 0 |

---

## 5. Recommended Fix Order

1. **P0 — Webhook URL**: Change `register_webhook()` to use `host.docker.internal:8810` when Pulse is in a Docker container. This unblocks event-driven operation and fixes P4.
2. **P2 — Log buffering**: Add `PYTHONUNBUFFERED=1` to watcher launch or flush after heartbeat log.
3. **P1 — Reviewer leniency**: Enhance review prompt with file verification instructions.
4. **P3 — Stage paths**: Extract and surface explicit output paths in stage metadata.

---

## 6. V1 Artifact Cleanup (Still Pending)

The following v1 pipeline files remain in the codebase and should be archived:

| File | Purpose (v1) | Replaced By (v2) |
|------|-------------|------------------|
| `.claude/jobs/event-watcher.sh` | Polled for new tasks | `pipeline-watcher.py` |
| `.claude/jobs/dispatcher.sh` | Cron-based job launcher | `pipeline-watcher.py` (launch_service) |
| `.claude/jobs/pipeline-watchdog.sh` | Stuck task detection | `pipeline-watcher.py` (watchdog_check) |
| `.claude/jobs/executor.sh` | Claude Code launcher | `services/executor.py` |
| `.claude/jobs/workflows/task-score.md` | Risk scoring workflow | `services/evaluate.py` |
| `.claude/jobs/workflows/task-investigator.md` | Routing workflow | `services/evaluate.py` + `orchestrate.py` |
| `.claude/jobs/workflows/task-executor.md` | Execution workflow | `services/executor.py` |
| `.claude/jobs/registry.yaml` | Cron schedule config | Webhook + heartbeat |
| `.claude/jobs/lib/routing-rules.yaml` | Stage routing rules | Label state machine in `pipeline-watcher.py` |

---

*Report generated during live pipeline test. Pipeline still executing (tasks #1-4 + master pending). Full completion data will be appended.*
