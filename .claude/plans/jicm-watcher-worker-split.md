# JICM v7.9 → v8: Watcher / Worker Architectural Split

**Status:** PLAN — not started
**Author:** Jarvis-dev (W11)
**Date:** 2026-06-23
**Predecessor work:** Fix #3 (log splitting) shipped this session; latent `grep -c | echo` bug also fixed.

---

## 1. Problem statement

The current JICM watcher (`.claude/scripts/jicm-watcher.sh`) is doing two jobs of fundamentally different latency profiles inside one process:

| Job | Latency budget | Failure consequence |
|---|---|---|
| **Polling** (read state-hook file, check thresholds, write signal at hard threshold) | < 50 ms per poll (3 s cadence) | Missed thresholds → JICM doesn't fire → context overflow |
| **Worker** (compression, Graphiti ingest, RAG ingest, scratchpad rotation, memory consolidation, /clear injection) | seconds to **minutes** (one Graphiti ingest observed taking 7.5 min) | Slower cycles; one slow job can't really hurt polling because the calls are already backgrounded via `( ... ) &` — but they share a process, share a log, and share lifecycle |

The 7.5-minute Graphiti ingest from earlier this session showed that **the current architecture is technically correct** — subprocess calls are already backgrounded with `( ... ) &` — but the architecture is *brittle* in three subtler ways:

1. **Shared lifecycle**: restarting the watcher (to pick up a polling-logic change) kills any in-flight Graphiti / RAG ingest. A 7-minute ingest restarted at 6 min wastes 6 min of LLM calls.
2. **Shared log file** (Fix #3 addressed this for the *display* side, but the underlying writes still interleave). Per-job debugging requires `grep`-ing through interleaved chatter.
3. **Untestable in isolation**: there's no way to unit-test "does the threshold check fire correctly" without spinning up the full daemon. The polling logic is entangled with the cycle-execution logic.
4. **No retry semantics**: if a Graphiti ingest fails (network blip, Neo4j restart), there's no mechanism to retry. The cycle just logged "PID $! launched" and moved on.

## 2. Target architecture

Split into two long-running processes plus an explicit job queue / IPC layer between them.

```
┌──────────────────────────────────────────────────────────────────────┐
│  jicm-watcher (v8) — pure poller                                     │
│  - reads .jicm-state-hook.json every POLL_INTERVAL_S (3s)            │
│  - checks soft / hard / auto thresholds                              │
│  - writes signal files (.jicm-clear-now.signal)                      │
│  - logs to .claude/logs/jicm-watcher-loop.log (split per Fix #3)     │
│  - emits jobs to queue on threshold transitions                      │
│  - NEVER runs subprocesses other than `jq`/`stat`/`date`             │
└────────────────────┬─────────────────────────────────────────────────┘
                     │  jobs (JSON, file-based queue OR named pipe)
                     ▼
        ┌─────────────────────────────────┐
        │  .claude/queue/jicm-jobs/       │
        │    NNNNNNN-<jobtype>.json       │
        │    NNNNNNN-<jobtype>.json.lock  │  ← worker claims a job by renaming
        │    NNNNNNN-<jobtype>.json.done  │  ← worker writes result + retains
        │    NNNNNNN-<jobtype>.json.fail  │  ← failure with retry counter
        └────────────────────┬────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  jicm-worker (v8) — job consumer                                     │
│  - polls .claude/queue/jicm-jobs/ every WORKER_POLL_S (1s)           │
│  - claims via atomic rename, runs job, writes .done or .fail         │
│  - each job is one of:                                               │
│       compression, rag_ingest, graphiti_ingest, scratchpad_rotate,   │
│       memory_consolidate, clear_inject, resume_prompt                │
│  - per-job log: .claude/logs/jicm-jobs/NNNNNNN-<jobtype>.log         │
│  - max N concurrent jobs (configurable, default 2; graphiti gets     │
│    its own slot so RAG ingest doesn't block it)                      │
│  - automatic retry on .fail with exponential backoff (max 3 tries)   │
│  - sends completion notification back via .done file                 │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. Component specifications

### 3.1 `jicm-watcher` (v8)

**Responsibilities (only these):**
- Singleton enforcement via PID file (already exists)
- Poll `.jicm-state-hook.json` every 3 s
- Compute action: `WATCHING` / `SOFT_NUDGE` / `HARD_FIRE` / `AUTO_COMPACT`
- On `HARD_FIRE` transition: write signal file `.jicm-clear-now.signal`
- On `HARD_FIRE` transition: enqueue jobs (in order: `compression`, `rag_ingest`, `scratchpad_rotate`, `memory_consolidate`, `graphiti_ingest`, `clear_inject`, `resume_prompt`)
- Log to `JICM_WATCHER_LOOP_LOG` exclusively
- Cooldown / state-age / signal-presence guards (already in patch from this morning)

**Explicitly NOT responsible for:**
- Running any of the cycle subprocesses (compression, ingest, etc.)
- Managing subprocess lifecycle / PID tracking of cycle work
- Writing to the shared log (only writes its own loop log)

**Code size estimate:** ~300 lines (down from current ~750 lines). Most of the cycle-execution logic in lines 170–280 and 430–490 moves to the worker.

### 3.2 `jicm-worker` (v8) — NEW

**Responsibilities:**
- Singleton enforcement (separate PID file: `.jicm-worker.pid`)
- Poll job queue directory every 1 s
- Sort jobs by sequence number, claim oldest via atomic rename (`mv NNNNN-job.json NNNNN-job.json.lock`)
- Dispatch to job handler based on `jobtype` field in job JSON
- Capture stdout/stderr to per-job log file
- On success: rename to `.done`, log timing, optionally notify (write signal)
- On failure: rename to `.fail.N` where N is attempt count; respawn job up to 3 times with exponential backoff (1 s, 5 s, 30 s)
- After 3 failures: rename to `.fail.final` and log alert

**Concurrency model:**
- Up to N concurrent jobs (default 2)
- Per-jobtype concurrency cap: e.g. `graphiti_ingest` max 1 (Neo4j single-writer), `rag_ingest` max 1 (Qdrant write-batching)
- Implemented as a simple slot counter, not a thread pool

**Code size estimate:** ~400 lines (new). Bulk is job dispatch + retry/backoff machinery.

### 3.3 Job format

```json
{
  "version": "1.0",
  "id": "NNNNNNN",
  "jobtype": "compression | rag_ingest | graphiti_ingest | scratchpad_rotate | memory_consolidate | clear_inject | resume_prompt",
  "enqueued_at": "2026-06-23T22:30:00Z",
  "session_id": "5cf19b7d-...",
  "args": {
    "compressed_file": "/path/to/...",
    "tokens_at_fire": 305432
  },
  "depends_on": ["NNNNNNN-1", "NNNNNNN-2"],
  "max_attempts": 3,
  "timeout_seconds": 900
}
```

`depends_on` allows enforcing job order (e.g. `clear_inject` waits for `compression` AND `scratchpad_rotate` to complete). Worker checks dependency `.done` files exist before claiming.

### 3.4 IPC choice: filesystem queue vs named pipe vs SQLite

| Option | Pros | Cons |
|---|---|---|
| **Filesystem queue** (recommended) | Inspectable (`ls .claude/queue/jicm-jobs/`); survives crashes; atomic via rename; no new deps | More disk I/O; polling latency (1 s) |
| Named pipe (FIFO) | Lower latency | Volatile (jobs lost on crash); harder to debug; no dependency tracking |
| SQLite | ACID; rich querying | Adds dep (already have sqlite3 via Alfred); more code |

**Recommendation: filesystem queue.** Mirrors the existing signal-file pattern, easy to debug by `ls`, survives daemon restarts, atomic via POSIX rename.

## 4. Migration plan (phased, non-breaking)

Each phase is independently shippable and reversible.

### Phase 0: Foundation (already done)
- ✅ Log file split (Fix #3, this session)
- ✅ Autonomous threshold trigger (this morning's patch, commit 645b00f)
- ✅ Latent `grep -c | echo` bug fix (this session)

### Phase 1: Job queue infrastructure
- Create `.claude/queue/jicm-jobs/` directory (gitignored, transient)
- Define job JSON schema; commit a JSON Schema validator at `.claude/scripts/jicm/job-schema.json`
- Write `jicm-worker.sh` skeleton with poll loop + atomic claim + per-job log writing
- Implement **ONE job type only**: `scratchpad_rotate` (currently synchronous in watcher line 256). Smallest, fastest, easiest to validate.
- Modify watcher line 256 to enqueue instead of run synchronously
- Run both daemons in parallel for 1 week; verify scratchpad_rotate jobs flow through queue correctly

### Phase 2: Migrate async jobs
- Migrate `memory_consolidate` (current line 249), `rag_ingest` (lines 193, 239, 467), `graphiti_ingest` (lines 267, 274) to job queue
- Watcher's main cycle function shrinks to: write signal → enqueue jobs in dependency order
- Worker handles the actual subprocess calls and their `( ... ) &` lifecycle

### Phase 3: Migrate /clear injection
- `clear_inject` and `resume_prompt` are tmux-side operations with timing dependencies
- This is the highest-risk migration because failure modes (TUI ENQUEUES /clear vs EXECUTES /clear) are subtle
- Add `depends_on` chain so `clear_inject` only fires after `compression` and `scratchpad_rotate` are `.done`
- Add the existing `wait_for_idle` logic as a `precondition` field in the job spec

### Phase 4: Remove worker code from watcher
- Once all jobs migrated, delete the cycle-execution functions from `jicm-watcher.sh`
- Watcher v8 is pure poller; v7.9 path retired
- Update `jicm-watcher-hud.sh` to also show **worker** PID, job queue depth, last job completion, and per-job log link

### Phase 5: Observability
- HUD: add a "JOB QUEUE" section showing:
  - Queue depth by jobtype
  - Last 5 completed jobs with elapsed time
  - Any `.fail` jobs (with retry count)
  - Worker process status (PID, uptime)
- Alfred integration: surface JICM job failures to Alfred Pulse dashboard

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Queue corruption** (partial JSON write during enqueue) | Write to `NNNNNNN-jobtype.json.tmp` then atomic rename to `NNNNNNN-jobtype.json`. Worker only claims fully-named files. |
| **Worker crashes mid-job** (.lock file orphaned) | On worker startup, scan for `.lock` files older than `worker_pid_max_age` (5 min); restore to claimable state with attempt counter incremented |
| **Dependency cycle** (job A depends on job B depends on A) | At enqueue time, walk the depends_on graph; reject cycles. Watcher should never produce cycles, but defensive check is cheap. |
| **Disk fills with `.done` files** | Periodic GC: worker deletes `.done` files older than `JICM_JOB_RETENTION_DAYS` (default 7) |
| **Race between watcher restart and in-flight jobs** | Jobs are owned by worker, not watcher. Watcher restart doesn't touch the queue. |
| **Atomic rename across mount points** | All queue files live in same dir → same filesystem. POSIX `rename(2)` atomicity guaranteed. |
| **Job dispatch latency** (1 s queue poll) | Acceptable for current cadence; if pressure grows, drop to 200 ms or switch to inotify (Linux) / FSEvents (macOS) |

## 6. Testability story

The split enables real unit tests for the first time:

| Component | Test approach |
|---|---|
| Watcher polling | Inject test `.jicm-state-hook.json` with synthetic tokens; assert correct action / signal-write behavior. Run in <50 ms. |
| Job queue | Enqueue synthetic jobs; assert atomic claim / dependency ordering / retry counter increment. |
| Individual jobs | Each job is now a standalone script invokable independently. Can be unit-tested without daemon. |
| Worker dispatch | Mock job handlers; assert worker calls correct handler per jobtype, captures output to correct log, handles failure correctly. |

Compare to current state where the only "test" is "spin up the daemon and watch what happens."

## 7. Effort estimate

| Phase | Effort | Risk |
|---|---|---|
| Phase 1 (queue infra + 1 job type) | ~6 hours | Low |
| Phase 2 (migrate async jobs) | ~4 hours | Low-medium |
| Phase 3 (migrate /clear injection) | ~6 hours | **High** (tmux timing) |
| Phase 4 (cleanup watcher) | ~2 hours | Low |
| Phase 5 (HUD observability) | ~4 hours | Low |
| **Total** | **~22 hours** | — |

Concentrated over 3-4 sessions, this is shippable in a week of evenings.

## 8. What this plan deliberately does NOT propose

- **Replacing the daemon model with a true workflow engine** (Dagster, Prefect, Airflow). Overkill for JICM's scale; introduces a heavy dependency. The filesystem queue gives us 80% of the benefit at 5% of the cost.
- **Rewriting in Python.** The current bash daemon works fine; Python rewrite would be a side quest. Keep bash, just split it.
- **Adding a REST API for job submission.** Watcher is the only producer; no need for external producers. If that changes, can add a `curl`-able endpoint to worker later.
- **Persistence across reboots.** Filesystem queue *is* persistent. If the Mac restarts, queue survives; worker resumes on restart. No additional work needed.

## 9. Decision needed before Phase 1 starts

- **Confirm filesystem queue** (vs SQLite). I lean filesystem; it matches existing signal-file pattern.
- **Confirm concurrency cap default** (I propose: 2 total, 1 per jobtype for graphiti/rag).
- **Confirm retention policy** (I propose: 7 days for `.done`, 30 days for `.fail.final`).
- **Confirm naming**: keep `jicm-` prefix for both `jicm-watcher` and `jicm-worker`; both live in `.claude/scripts/`.

---

*End of plan.*
