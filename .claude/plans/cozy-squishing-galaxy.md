# Plan: Pipeline Infrastructure Overhaul

## Context

The Nexus/Pulse pipeline (pipeline-watcher.py + 6 services) is not functioning as a hands-free system. Tasks stall in Evaluated/Queued states. The dashboard Stage column is blank. Executor windows steal focus from W0. There is no end-to-end test suite. The system requires manual intervention, violating the core principle of autonomous operation.

**Root causes identified from full code audit:**

1. **tmux `new-window` lacks `-d` flag** (host-executor-bridge.sh:105) — every executor window steals focus from W0:Jarvis.
2. **Dashboard expects `stage:*` labels** (TaskRow.tsx:45) that the pipeline never sets — Stage column always blank.
3. **300s heartbeat is the only reliable dispatch path** — webhooks fire but tasks wait because rapid label changes get deduped (2s window).
4. **No global lifecycle circuit breaker** — diagnose resets tasks to `staging:wait`, enabling infinite loops.
5. **No end-to-end tests** — zero automated validation that the lifecycle works.
6. **No cache topology leverage** — executor spawns cold `claude -p` processes. Per api_aware.md §9, extend-then-fork from a warm session yields 6.2x cost reduction.
7. **Executor doesn't fork from Jarvis session** — misses the opportunity for the user to manually inject context that subsequent tasks would inherit.

## Architecture: Model Router + Cache Topology

### Execution Model (revised per user directive)

The pipeline has TWO model tiers by design:

| Tier | Services | Model | Why |
|------|----------|-------|-----|
| **Triage** | stage, evaluate, orchestrate, review, diagnose | Ollama qwen3:32b | No tool use needed. Classification/routing only. Already correct. |
| **Execution** | executor | Claude (via bridge) | Needs tools (file read/write, bash). Leverages cache topology. |

**Claude remains the executor default.** The change is HOW it's invoked:

### Extend-Then-Fork from Jarvis Session

Per api_aware.md §9.1: "One `--resume` extension on the parent → N `--fork-session` children. v5 H measured 6.2× per-child cost reduction."

**New execution flow:**
1. Pipeline-watcher writes the Jarvis session ID to a well-known file (`.claude/jobs/state/jarvis-session-id`)
2. Executor.py reads this file and passes it as `jarvis_session_id` in the signal-file request
3. **Parent tasks** (no `chain_resume`): bridge invokes `claude -r <jarvis-session-id> --fork-session -p "..."`
   - Inherits Jarvis's warm ~200K token cache prefix
   - User can manually inject context into the Jarvis session that subsequent forks see
4. **Child tasks** (have `chain_resume`): bridge invokes `claude -r <chain_resume_session> --fork-session -p "..."`
   - Inherits the prior task's context (already implemented)
5. **Fallback**: If no Jarvis session ID available, cold `claude -p` (current behavior)

**Benefits:**
- 6.2x cost reduction on first-in-chain tasks (from ~$0.30 to ~$0.05 per child)
- User can `! echo "important context"` in W0 → gets picked up by next fork
- Project CLAUDE.md, MEMORY.md, psyche/ all in warm cache — no fresh cache_write tax

### Session ID Propagation

```
Jarvis W0 session (a2cfa54c-...)
  │
  ├── writes session ID to .claude/jobs/state/jarvis-session-id
  │
  ├──fork──► AION-task-1 (parent, chain_order=0)
  │            │
  │            └──fork──► AION-task-2 (chain_order=1, chain_resume=task-1-session)
  │                         │
  │                         └──fork──► AION-task-3 (chain_order=2, chain_resume=task-2-session)
  │
  └──fork──► AION-task-4 (different chain, parent, chain_order=0)
```

## Approach: 6 Phases

### Phase 1: Immediate Fixes

**1a. Fix tmux focus steal**
- `host-executor-bridge.sh:105` — add `-d` flag to `$TMUX_BIN new-window`

**1b. Reduce heartbeat to 30s**
- `pipeline-watcher.py` — change POLL_INTERVAL default from 300 to 30
- Docker compose `PIPELINE_POLL_INTERVAL` env var still overrides

**1c. Write Jarvis session ID on launch**
- `launch-jarvis-tmux.sh` — after session creation, write W0 session ID to `Alfred-Dev/.claude/jobs/state/jarvis-session-id`
- Also write it now (one-time) so the current session is available immediately

### Phase 2: Extend-Then-Fork Execution

**2a. Executor.py: read Jarvis session ID**
- Read `jarvis-session-id` file at startup
- For parent tasks (no chain_resume): add `jarvis_session_id` to signal-file request payload
- For child tasks: use existing `chain_resume` path (already works)

**2b. Bridge: fork from Jarvis session**
- Read `jarvis_session_id` from request payload
- If present and no `chain_resume`: use `-r <jarvis_session_id> --fork-session`
- If `chain_resume` present: use existing `-r <chain_resume> --fork-session` path
- If neither: cold `claude -p` (fallback)

**2c. Add `--max-budget-usd` circuit breaker**
- Per api_aware.md §9.2: pass `--max-budget-usd 1.50` to every headless cell
- Configurable via `EXECUTOR_MAX_BUDGET_USD` env var

### Phase 3: Dashboard Stage Labels

**3a. Emit `stage:*` labels from pipeline-watcher**
- After each service triggers in process_task, set a `stage:<current>` label
- Map: staging:done → `stage:staged`, evaluated:done → `stage:evaluated`, queued:done → `stage:queued`, active:running → `stage:executing`, active:done → `stage:executed`, completed:done → `stage:completed`
- Remove previous `stage:*` label on each transition
- Feeds dashboard's existing `_stage` column with zero dashboard changes

### Phase 4: Lifecycle Circuit Breakers

**4a. Global lifecycle counter**
- `metadata.lifecycle_resets` — incremented by diagnose.py on each reset to staging:wait
- Cap at 3 (`MAX_LIFECYCLE_RESETS`). After 3 full cycles, block with `reason:lifecycle-exhausted`

**4b. Consolidate retry/attempt counters**
- `executor_attempts` resets on each new lifecycle
- `lifecycle_resets` never resets (global cap)
- `retry_count` stays as reviewer-specific

### Phase 5: End-to-End Test Suite

**5a. Create `tests/test_pipeline_lifecycle.py`**
- Test 1: Create task → verify initial labels
- Test 2: Stage → verify staging:done + stage_output
- Test 3: Evaluate → verify evaluated:done + persona
- Test 4: Orchestrate → verify queued:done
- Test 5: Executor (Ollama path) → verify active:done
- Test 6: Full lifecycle → task created to closed
- Test 7: Lifecycle circuit breaker → verify permanent block at 3

**5b. Integration test infrastructure**
- Real Pulse API (localhost:8800), real Ollama (localhost:11434)
- Each test creates unique task, runs service as subprocess, verifies state
- Cleanup: close test tasks after each test

### Phase 6: Streamline

**6a. Remove dead code paths**
- `_review_claude_cli()` in reviewer.py — deprecated `claude -p` path. Remove; review is always Ollama.
- `find_claude_binary()` in executor.py — unused since signal-file delegation. Remove.

**6b. Clean up observability verbosity**
- Reduce inline log_decision/log_audit calls in executor.py — extract common patterns to helpers

## Files to Modify

| File | Changes |
|------|---------|
| `lib/host-executor-bridge.sh` | Add `-d` to new-window, read jarvis_session_id for fork, add --max-budget-usd |
| `pipeline-watcher.py` | POLL_INTERVAL→30, emit stage:* labels |
| `services/executor.py` | Read jarvis-session-id, pass in signal payload, remove dead code |
| `services/diagnose.py` | Increment lifecycle_resets, check cap |
| `services/reviewer.py` | Remove claude-cli review path |
| `services/_shared.py` | Add stage label helper, add session-id reader |
| `launch-jarvis-tmux.sh` | Write jarvis-session-id on launch |
| `tests/test_pipeline_lifecycle.py` | NEW — full e2e test suite |

## Verification

1. Run test suite: `python -m pytest .claude/jobs/tests/test_pipeline_lifecycle.py -v`
2. Create test task via Pulse API → watch it flow through all stages to closed
3. Verify dashboard Stage column populates at `http://localhost:8702/tasks`
4. Verify no focus steal: executor windows appear without switching active window
5. Verify fork topology: executor log shows `chain_resume=<jarvis-session-id>` for parent tasks
6. Verify `--max-budget-usd` in bridge runner scripts
7. Verify lifecycle circuit breaker: task blocked after 3 full cycles

## Principles Enforced

| Principle | How |
|-----------|-----|
| Always-on | 30s heartbeat, webhook-primary, Docker restart:unless-stopped |
| Event-driven | Webhooks fire on every label change; heartbeat is safety net only |
| Local models | Ollama for triage (stage/eval/review/diagnose). Claude for execution (needs tools). |
| Cache topology | Extend-then-fork from Jarvis session. 6.2x cost reduction per api_aware.md §9.1 |
| User context injection | Jarvis session is the root fork — user can inject context via W0 that forks inherit |
| Hands-free | Self-healing watchdog, no manual label fixes needed |
| Self-healing | TTLs on all stuck states + lifecycle circuit breaker |
| Non-runaway | lifecycle_resets cap (3), --max-budget-usd per cell, executor_attempts cap (3), daily budget gate |
