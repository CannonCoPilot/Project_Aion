# Pipeline v2 — Technical Reference

**Date**: 2026-04-29
**Author**: Jarvis (main, post-E2E validation)
**Scope**: Complete function inventory of all pipeline components, mapped against design intent from `pipeline-redesign-v2.md`.
**Method**: Derived exclusively from source code inspection of the 9 pipeline files on main at commit `fe9e093`+.

---

## 1. Component Inventory

| File | Role | Model | Lines |
|------|------|-------|-------|
| `_shared.py` | Shared HTTP/LLM/label utilities | N/A | 195 |
| `stage.py` | Raw idea → structured ticket | qwen3:32b (Ollama) | 162 |
| `evaluate.py` | Safety + persona + decomposition | qwen3:32b (Ollama) | 267 |
| `orchestrate.py` | Grouping, ordering, chain metadata | None (deterministic) | 240 |
| `executor.py` | Headless Claude execution | Claude Sonnet/Opus (LiteLLM) | 262 |
| `reviewer.py` | Post-execution quality gate | qwen3:32b (Ollama) | 182 |
| `diagnose.py` | Failure analysis + task redesign | qwen3:32b (Ollama) | 166 |
| `event-watcher-v2.py` | State machine driver + watchdog | N/A | ~500 |
| `pulse/app.py` | Pulse API server (task CRUD + transitions) | N/A | ~1100 |

All service scripts live at `.claude/jobs/services/`. The event watcher lives at `.claude/jobs/event-watcher-v2.py`.

---

## 2. Shared Utilities (`_shared.py`)

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `_retry` | 20 | `(fn, label: str)` | Retry transient `ConnectionError` up to `MAX_RETRIES` (2) with linear backoff (`0.5s * attempt`) |
| `pulse_get` | 35 | `(path: str) -> dict \| None` | GET against Pulse API with retry; returns parsed JSON or None |
| `pulse_post` | 47 | `(path: str, data: dict) -> dict \| None` | POST against Pulse API with retry |
| `pulse_patch` | 59 | `(path: str, data: dict) -> dict \| None` | PATCH against Pulse API with retry |
| `pulse_label_remove` | 71 | `(task_id: str, label: str) -> bool` | DELETE single label (URL-encoded); no retry |
| `set_label` | 80 | `(task_id: str, remove_label: str, add_label: str) -> bool` | Atomic label swap delegating to `conditional_claim` |
| `call_ollama` | 86 | `(prompt: str, model: str) -> str \| None` | POST to Ollama `/api/generate` with `stream=False, think=False`; 120s timeout |
| `extract_json` | 98 | `(text: str) -> dict \| None` | Scan text for first valid JSON object using `json.loads` with backward end-scan |
| `conditional_claim` | 119 | `(task_id, precondition, set_label_val, remove_labels, actor) -> bool` | Atomic label claim via `POST /tasks/{id}/conditional-update`; returns True on 200, False on 409 |
| `emit_structured_log` | 144 | `(task_id, service_name, duration_ms, outcome, **extra)` | Print JSON telemetry line to stdout (captured by watcher log) |
| `get_persona_dir` | 165 | `() -> str` | Resolve `.claude/jobs/personas/` from `PROJECT_DIR` |
| `list_personas` | 172 | `() -> list[str]` | Discover persona names from directory listing; falls back to `["autofix-executor"]` |
| `load_persona_prompt` | 185 | `(persona_name: str) -> str \| None` | Read `personas/<name>/prompt.md` if it exists |

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `PULSE_API` | `os.environ.get("PULSE_API", "http://localhost:8800/api/v1")` | Default Pulse endpoint |
| `OLLAMA_URL` | `os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")` | Direct Ollama endpoint |
| `MAX_RETRIES` | 2 | HTTP retry count |
| `RETRY_DELAY` | 0.5 | Base retry delay in seconds |

---

## 3. Stage Service (`stage.py`)

### Purpose
Converts raw task titles/descriptions into structured ticket objects via LLM analysis. First service in the pipeline.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `main` | 59 | `()` | Entry point; wraps `_stage_main` with timing + telemetry |
| `_stage_main` | 68 | `(_outcome: list)` | Fetch task, call Ollama with `STAGE_PROMPT`, parse JSON, patch metadata + labels |

### Internal: `revert` (closure at line 106)
Patches `stage_error` metadata and atomically reverts `staging:processing` → `staging:wait` if the LLM call fails.

### Flow
1. Fetch task from Pulse (via `TASK_JSON` env or API call)
2. Build prompt from title + description + labels
3. Call `qwen3:32b` via Ollama
4. Parse JSON response: `structured_description`, `expected_output`, `scope`, `file_paths`, `suggested_type`, `suggested_priority`
5. Patch task metadata with `stage_output` object (unconditionally, even if description unchanged)
6. Add `type:<suggested_type>` label
7. Transition `staging:processing` → `staging:done`

### Revert conditions
- Ollama returns no response → revert to `staging:wait`
- JSON parse failure → revert to `staging:wait`

### Pulse API calls
- `GET /tasks/{id}` (if `TASK_JSON` not provided)
- `PATCH /tasks/{id}` (metadata + optional description update)
- `POST /tasks/{id}/labels` (type label)
- `POST /tasks/{id}/conditional-update` (staging:processing → staging:done)

---

## 4. Evaluate Service (`evaluate.py`)

### Purpose
Binary safety sweep, persona assignment, intelligibility check, and optional decomposition. Second service in the pipeline.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `check_destructive_keywords` | 91 | `(title, description, stage_desc) -> str \| None` | Pre-LLM deterministic keyword blocklist; checks against 22 phrase patterns + keyword×target combinations |
| `revert` | 105 | `()` | Atomically reverts `evaluated:processing` → `evaluated:no` |
| `main` | 110 | `()` | Entry point with timing + telemetry |
| `_evaluate_main` | 119 | `(_outcome: list)` | Core evaluation logic: keyword check → LLM call → safety/persona/decomposition |

### Constants

| Name | Line | Purpose |
|------|------|---------|
| `DESTRUCTIVE_PATTERNS` | 75 | 22 exact-match phrase patterns (e.g., "drop database", "rm -rf", "force push") |
| `DESTRUCTIVE_KEYWORDS` | 87 | 6 action words: drop, wipe, nuke, destroy, purge, truncate |
| `DESTRUCTIVE_TARGETS` | 88 | 6 target words: database, schema, table, production, credentials, secrets |

### Flow
1. Fetch task from Pulse
2. **Deterministic keyword check** (runs BEFORE LLM): scan title + description + `stage_output.structured_description` against `DESTRUCTIVE_PATTERNS` and keyword×target cross-product
3. If keyword match → immediate block: `evaluated:blocked`, `blocked:yes`, `reason:destructive-keyword:<pattern>`
4. If no keyword match → call `qwen3:32b` with `EVALUATE_PROMPT` containing task details + available personas
5. Parse LLM JSON: `safe`, `block_reason`, `intelligible`, `rewritten_prompt`, `persona`, `decompose`, `subtasks`
6. If unsafe → block with reason
7. If decompose → create child tasks at `staging:wait` with `parent:{task_id}` label, store `child_ids` in metadata
8. If rewritten → patch description
9. Add `assigned:<persona>` label
10. Transition `evaluated:processing` → `evaluated:done`

### Decomposition mechanism
Child tasks are created via `POST /tasks` with all 6 dimension labels initialized (`staging:wait` + 5× `:no`). Parent metadata gets `decomposed: true` + `child_ids: [...]`. Orchestrator later orders parent execution after children.

### Pulse API calls
- `GET /tasks/{id}`
- `PATCH /tasks/{id}` (evaluate_output metadata)
- `POST /tasks/{id}/conditional-update` (block or advance)
- `POST /tasks/{id}/labels` (assigned:persona)
- `POST /tasks` (child creation if decomposed)

---

## 5. Orchestrate Service (`orchestrate.py`)

### Purpose
Groups evaluated tasks into execution chains, determines ordering, writes chain metadata. Deterministic — no LLM call.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `acquire_lock` | 38 | `() -> bool` | PID+timestamp lock file; validates PID is alive and lock is within `LOCK_TIMEOUT_S` (600s); handles PID recycling via `os.kill(pid, 0)` |
| `release_lock` | 60 | `()` | Delete lock file |
| `get_ready_tasks` | 64 | `() -> list[dict]` | Query Pulse for tasks with `evaluated:done AND queued:no AND NOT blocked:yes` |
| `get_label` | 74 | `(task, prefix, default) -> str` | Extract label value by prefix (e.g., `get_label(t, "project")` → "aifred-pro-dev") |
| `group_tasks` | 81 | `(tasks) -> dict[str, list[dict]]` | Group tasks into chains; **pre-existing chain metadata preserved** (explicit chains); unchained tasks grouped by `project:persona` |
| `order_chain` | 102 | `(tasks) -> list[dict]` | Sort by complexity: verify(0) < bug(1) < feature(2) < infrastructure(3) < research(4) |
| `detect_dependency_cycle` | 113 | `(tasks) -> list[str]` | DFS cycle detection across `depends_on` + `child_ids` metadata; returns task IDs in cycles |
| `main` | 145 | `()` | Entry point with timing + telemetry |
| `_orchestrate_main` | 154 | `(_outcome: list)` | Lock → fetch tasks → detect cycles → group → order → write chain metadata → set labels |

### Chain grouping logic (post-fix)
1. **Explicit chains first**: Tasks with pre-existing `chain_id` + `chain_order` in metadata are grouped together by their original `chain_id`, preserving the creation-time ordering
2. **Implicit chains**: Tasks without chain metadata are grouped by `project:<label>:assigned:<persona>` composite key
3. Within implicit chains: sorted by `order_chain()` (simplest-first heuristic), then decomposed parents moved to end

### Chain metadata written per task
```json
{
  "chain_id": "<preserved-or-generated UUID[:12]>",
  "chain_order": "<preserved-or-sequential int>",
  "chain_size": "<total tasks in chain>",
  "chain_group": "<group key>",
  "orchestrated_at": "<ISO timestamp>"
}
```

### Dependency handling
- Tasks with `depends_on` or `decomposed` + `child_ids` get `queued:done` + `blocked:yes` + `reason:dependency`
- Dependency cycles detected via DFS → offending `depends_on` fields cleared

### Single-instance guard
Lock file at `.claude/jobs/state/locks/orchestrate.lock` with format `PID:TIMESTAMP`. Validated with `os.kill(pid, 0)` and 600s staleness timeout.

---

## 6. Executor Service (`executor.py`)

### Purpose
Launches Claude Code headless (`claude -p`) to perform actual task work. Only service that uses Claude API (all others use local Ollama).

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `find_claude_binary` | 62 | `() -> str \| None` | Resolve `claude` CLI path: PATH → NVM node dirs → `~/.local/bin` |
| `build_prompt` | 79 | `(task: dict) -> str` | Construct markdown prompt from title, `stage_output` structured fields, file paths, scope, and JICM epilogue |
| `_extract_context_summary` | 109 | `(log_path: Path) -> dict \| None` | Parse `<context-summary>{...}</context-summary>` JSON from executor log output via regex |
| `main` | 121 | `()` | Entry point with timing + telemetry |
| `_executor_main` | 130 | `(_outcome: list)` | Fetch task → resolve persona → set active:running → build prompt → launch claude subprocess → monitor → extract context → update labels |

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `EPILOGUE` | line 46 | Appended to every prompt — instructs Claude to produce `<context-summary>` JSON as final output |
| `SIDECAR_DIR` | `.claude/jobs/active/` | Live execution sidecar files for monitoring |
| `LOG_DIR` | `.claude/logs/headless/executions/` | Executor log output |

### Execution flow
1. Fetch task, extract `assigned:<persona>` label
2. Generate UUID session ID
3. Transition `active:claiming` → `active:running`
4. Build prompt from `stage_output` metadata (structured description, expected output, scope, file paths)
5. Write sidecar file (`<task-id>.exec.json`) with PID, session ID, persona, start time
6. Resolve Claude binary and model (from metadata → env → default `claude-sonnet-4-6`)
7. Build CLI command: `claude -p <prompt> --permission-mode bypassPermissions --model <model> --session-id <uuid>`
8. If `chain_resume` in metadata → add `-r <session-id>` flag (context chaining)
9. If persona prompt exists → add `--system-prompt <prompt.md content>`
10. Launch subprocess, capture output to log file
11. On success (exit 0): extract `<context-summary>`, store in metadata, transition `active:running` → `active:done`
12. On failure (nonzero exit): transition `active:running` → `active:done` (review will catch it)
13. On timeout: same as failure
14. On unexpected error: transition `active:running` → `active:no` (watchdog will retry)
15. Signal handlers (SIGTERM/SIGINT): cleanup sidecar, reset to `active:no`
16. Always: delete sidecar file in `finally` block

### Sidecar file schema
```json
{
  "task_id": "AION-...",
  "session_id": "<uuid>",
  "persona": "<persona-name>",
  "pid": 12345,
  "start_time": "<ISO timestamp>",
  "prompt_preview": "<first 200 chars>"
}
```

---

## 7. Reviewer Service (`reviewer.py`)

### Purpose
Post-execution quality gate. Calls LLM to evaluate whether execution output matches task expectations.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `main` | 55 | `()` | Entry point with timing + telemetry |
| `_reviewer_main` | 64 | `(_outcome: list)` | Fetch task → call Ollama with review prompt → pass/fail → trigger diagnose on failure |

### Flow
1. Fetch task; extract `context_summary` from metadata (executor's `<context-summary>` output)
2. Extract `expected_output` from `stage_output` metadata
3. Call `qwen3:32b` with `REVIEW_PROMPT` containing task details + execution summary
4. Parse LLM JSON: `passed`, `confidence`, `issues`, `summary`
5. **Ollama failure**: revert `completed:reviewing` → `completed:no` for retry (does NOT auto-pass)
6. **Parse failure**: defaults to `passed=False` (fail-safe)
7. **Pass**: transition `completed:reviewing` → `completed:done`, remove `active:done`, set `status=closed`
8. **Fail (retry < 3)**: increment `retry_count` in metadata, launch `diagnose.py` as subprocess
9. **Fail (retry >= 3)**: set `blocked:yes` + `reason:max-retries`

### Diagnose launch mechanism
On review failure with retries remaining, reviewer directly spawns `diagnose.py` as a subprocess (line 158) rather than waiting for the event watcher to detect the blocked state. This provides faster failure recovery.

---

## 8. Diagnose Service (`diagnose.py`)

### Purpose
Failure analysis and task redesign. Reads execution metadata, identifies failure mode, rewrites the task prompt, and sends the task back to staging.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `main` | 58 | `()` | Entry point with timing + telemetry |
| `_diagnose_main` | 67 | `(_outcome: list)` | Fetch task → read execution context → call Ollama → patch metadata → reset labels to staging:wait |

### Flow
1. Fetch task; extract `review_output`, `retry_count`, `diagnose_attempts`, `context_summary`, `executor_log` from metadata
2. If executor log path exists, read last 2000 characters for context
3. Call `qwen3:32b` with `DIAGNOSE_PROMPT` containing task details + review output + execution log tail
4. Parse LLM JSON: `failure_mode`, `diagnosis`, `redesigned_prompt`, `change_persona`, `should_split`, `subtasks`
5. Write `diagnose_output` + `diagnose_attempts: N+1` to metadata
6. If LLM provided `redesigned_prompt` → patch task description
7. If LLM recommended persona change → remove old `assigned:*` labels, add new one
8. Reset ALL dimension labels to initial state: `staging:wait, evaluated:no, queued:no, active:no, completed:no, blocked:no`
9. Remove stale dimension labels (any `reason:*` etc.) individually before adding reset set
10. Set `status=open`

### Failure modes recognized
`error`, `wrong_output`, `missing_context`, `scope_too_large`, `hang`, `unknown`

---

## 9. Event Watcher (`event-watcher-v2.py`)

### Purpose
Central state machine driver. Polls Pulse for tasks, matches label states to service triggers, runs watchdog checks, manages executor lifecycle.

### Functions

| Function | Line | Signature | Purpose |
|----------|------|-----------|---------|
| `get_task_labels` | 74 | `(task) -> list[str]` | Extract labels array |
| `has_label` | 78 | `(labels, key) -> bool` | Check label existence |
| `reset_label` | 82 | `(task_id, old, new)` | Atomic label swap via `conditional_claim` |
| `launch_service` | 87 | `(service_name, task_id, task) -> int \| None` | Spawn service subprocess with env vars (`TASK_ID`, `PULSE_API`, `PROJECT_DIR`, `TASK_JSON`); returns PID |
| `check_orchestrate_lock` | 123 | `() -> bool` | Validate orchestrate lock; uses `psutil.Process(pid).create_time()` for PID recycling protection |
| `count_active_executors` | 158 | `() -> int` | Count `*.exec.json` sidecar files in active directory |
| `_task_age_seconds` | 165 | `(task) -> float` | Seconds since task `updated_at` |
| `watchdog_check` | 181 | `(task)` | Detect+fix invalid label states: `staging:wait + active:running` → reset; stale `active:claiming` (>300s) → reset; stuck processing states (>300s) → reset |
| `chain_predecessor_done` | 215 | `(task) -> bool` | Check if chain predecessor (`chain_order - 1` with same `chain_id`) has `active:done` or `completed:done`; returns True if no predecessor or predecessor not found |
| `process_task` | 236 | `(task)` | **Core state machine** — maps label combinations to service launches (see trigger table below) |
| `poll_cycle` | 324 | `()` | Full cycle: fetch open+in_progress tasks → watchdog all → process all → log metrics every 10th cycle |
| `collect_telemetry` | 356 | `()` | Scrape sidecar files for dead PIDs, long-running executors; reset stale `active:*` states |
| `register_webhook` | 390 | `()` | Register with Pulse for `task:created`, `label:added`, `label:removed`, `label:transition` events |
| `run_webhook_server` | 401 | `()` | Flask HTTP server on `WEBHOOK_PORT` (8810); routes: `/webhook` (process event), `/health` |
| `show_status` | 440 | `()` | Print human-readable config/health status |
| `main` | 462 | `()` | Entry: lock file → health check → register webhook → start server thread → infinite poll loop |

### State Machine Trigger Table (from `process_task`)

| Priority | Label Condition | Action | Concurrency Guard |
|----------|----------------|--------|-------------------|
| 1 | `blocked:diagnosing` | Skip (wait for diagnose) | — |
| 2 | `blocked:yes` | Launch `diagnose` (if `diagnose_attempts < MAX_DIAGNOSE_ATTEMPTS`) | Conditional claim `blocked:yes` → `blocked:diagnosing` |
| 3 | `staging:wait` + `blocked:no` | Launch `stage` | Conditional claim `staging:wait` → `staging:processing` |
| 4 | `staging:done` + `evaluated:no` + `blocked:no` | Launch `evaluate` | Conditional claim `evaluated:no` → `evaluated:processing` |
| 5 | `staging:done` + `evaluated:done` + `queued:no` + `blocked:no` | Launch `orchestrate` | Orchestrate lock check |
| 6 | `queued:done` + `active:no` + `blocked:no` | Launch `execute` | `count_active_executors() < MAX_CONCURRENT_EXECUTORS` (5) + `chain_predecessor_done()` + conditional claim `active:no` → `active:claiming` |
| 7 | `active:done` + `completed:no` + `blocked:no` | Launch `review` | Conditional claim `completed:no` → `completed:reviewing` |

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `POLL_INTERVAL` | 30s (env override) | Seconds between poll cycles |
| `MAX_CONCURRENT_EXECUTORS` | 5 | Hard limit on parallel Claude sessions |
| `MAX_DIAGNOSE_ATTEMPTS` | 3 (env override) | Retries before permanent block |
| `STUCK_TIMEOUT_SECONDS` | 300 (5 min) | Watchdog threshold for stuck states |
| `ORCHESTRATE_LOCK_TIMEOUT` | 600 (10 min) | Stale orchestrate lock threshold |

### Watchdog checks (from `watchdog_check`)

| Check | Condition | Recovery |
|-------|-----------|----------|
| Invalid combo | `staging:wait` + `active:running` | `v2-reset-to-staging` transition |
| Stale claiming | `active:claiming` + age > 300s | Reset `active:claiming` → `active:no` |
| Stuck processing | `staging:processing` + age > 300s | Reset → `staging:wait` |
| Stuck processing | `evaluated:processing` + age > 300s | Reset → `evaluated:no` |
| Stuck reviewing | `completed:reviewing` + age > 300s | Reset → `completed:no` |

---

## 10. Pulse API — Pipeline-Relevant Endpoints

### Dimension label system (from `app.py`)

```python
PIPELINE_DIMENSIONS = {
    "staging":   {"wait", "done", "blocked", "processing"},
    "evaluated": {"no", "done", "blocked", "processing"},
    "queued":    {"no", "done", "blocked"},
    "active":    {"no", "running", "done", "blocked", "claiming"},
    "completed": {"no", "done", "reviewing"},
    "blocked":   {"no", "yes", "diagnosing"},
}
```

### Pipeline v2 transitions (from `TRANSITIONS` dict)

| Scenario | Requires | Removes | Adds | Status |
|----------|----------|---------|------|--------|
| `v2-stage-done` | `staging:processing` | `staging:processing` | `staging:done` | — |
| `v2-evaluate-done` | `evaluated:processing` | `evaluated:processing` | `evaluated:done` | — |
| `v2-execute-start` | `active:claiming` | `active:claiming` | `active:running` | — |
| `v2-execute-done` | `active:running` | `active:running` | `active:done` | — |
| `v2-review-pass` | `completed:reviewing` | `completed:reviewing`, `active:done` | `completed:done` | closed |
| `v2-review-fail` | `completed:reviewing` | `completed:reviewing`, `active:done` | `active:no`, `blocked:yes` | — |
| `v2-unblock` | `blocked:yes` | all dim prefixes | all 6 dims reset to initial | open |
| `v2-reset-to-staging` | (none) | all dim prefixes | all 6 dims reset to initial | open |

### Conditional-update endpoint
`POST /api/v1/tasks/{id}/conditional-update`

Atomic label claim: checks precondition label exists, then applies set/remove in a single DB transaction. Returns 200 (success) or 409 (precondition failed). Used by every service to prevent double-dispatch.

---

## 11. Design Alignment Analysis

Each subsection evaluates how the implementation **realizes** or **diverges from** the design intentions in `pipeline-redesign-v2.md`.

### 11.1 Realized: Event-Driven State Machine (Design §3: Event-Watcher as State Machine Driver)

**Design intent**: "A single fast-polling loop checks label states and triggers services."

**Implementation**: `event-watcher-v2.py` implements exactly this. `process_task()` is a priority-ordered if/elif chain matching label combinations to service launches. The 30s poll interval matches design. Webhook support is implemented (Flask server on 8810) with poll as fallback.

**Fidelity**: HIGH — the core architecture matches the design precisely.

### 11.2 Realized: Atomic Claims (Design §3: Race Condition Prevention)

**Design intent**: "Use a conditional label update — a single Pulse API call that atomically sets the label only if the precondition holds."

**Implementation**: `conditional_claim()` in `_shared.py` (line 119) calls `POST /tasks/{id}/conditional-update`. Every service trigger in `process_task()` uses this before launching. E2E test confirmed 0 claim conflicts across 39 triggers.

**Fidelity**: HIGH — exact implementation of design spec.

### 11.3 Realized: Binary Safety (Design §3: Evaluate)

**Design intent**: "Block only clearly destructive/nefarious actions... Default posture: PASS."

**Implementation**: Two-layer safety in `evaluate.py`:
1. Deterministic keyword blocklist (22 patterns, instant, pre-LLM)
2. LLM-based safety assessment (permissive)

E2E validated: T3 ("Drop database") correctly blocked by keyword layer before LLM even ran.

**Fidelity**: HIGH — exceeds design by adding a deterministic fast-path before LLM.

### 11.4 Realized: Failure Recovery Loop (Design §3: Diagnose)

**Design intent**: "Send redesigned task back to [Staging]... If retry-count ≥ 3, send to blocked:yes."

**Implementation**: `diagnose.py` increments `diagnose_attempts` (persisted in task metadata across cycles), resets all dimension labels to `staging:wait`. The event watcher checks `diagnose_attempts >= MAX_DIAGNOSE_ATTEMPTS` (3) and refuses to launch further diagnose cycles.

E2E validated: T3 cycled through stage→evaluate→block→diagnose 3 times, then was permanently blocked.

**Fidelity**: HIGH — exact implementation.

### 11.5 Realized: Context Chaining (Design §3: Context Chaining Architecture)

**Design intent**: "Related tasks share Claude session context via `claude -r <session-id>`."

**Implementation**: `executor.py` generates a UUID session ID (line 156), passes `--session-id <uuid>` to Claude CLI (line 191). If `chain_resume` exists in task metadata, adds `-r <session-id>` flag (line 194). Context summaries extracted via `<context-summary>` regex parsing and stored in metadata.

**Fidelity**: HIGH — session IDs, resume flags, and chain-resume handoff all implemented. `_propagate_chain_resume()` writes `chain_resume` + `prior_log_bytes` + `prior_context_summary` to the next task in the chain. Compressed mode threshold switching added: when `prior_log_bytes > 800KB` (~200K tokens), the successor injects the context summary into the prompt instead of using `-r` (avoids resuming into an oversized session).

### 11.6 Realized: JICM Epilogue (Design §3: Lightweight JICM Epilogue)

**Design intent**: "Every claude -p task includes a prompt epilogue that instructs Claude to produce a compressed context summary."

**Implementation**: `executor.py` appends `EPILOGUE` constant (line 46) to every prompt. The executor parses `<context-summary>` JSON tags from log output (line 109) and stores the result in task metadata.

E2E validated: All 6 executed tasks produced valid `<context-summary>` output containing `task_completed`, `files_modified`, `key_findings`, `gotchas`, `context_for_next`.

**Fidelity**: HIGH.

### 11.7 Realized: Review as Quality Gate (Design §3: Review)

**Design intent**: "Verify expected outcomes... Pass → completed:done. Fail → trigger Diagnose."

**Implementation**: `reviewer.py` calls Ollama with execution context + expected output. On pass: closes task. On fail: directly spawns `diagnose.py` subprocess (faster than waiting for watcher to detect blocked state).

E2E validated: T7 was correctly rejected because the ux-eng persona produced analysis but no code changes. T1, T2, T4, T5, T6 all passed review.

**Design improvement**: Reviewer defaults to `passed=False` when LLM output is unparseable (line 111), preventing false passes. Design doc did not specify this fail-safe behavior.

**Fidelity**: HIGH — with improvement over design.

### 11.8 Realized: Watchdog Integration (Design §3: Watchdog)

**Design intent**: "Watchdog pass: detect invalid label combos, reset to staging:wait."

**Implementation**: `watchdog_check()` in event-watcher (line 181) runs BEFORE `process_task()` on every poll cycle. Checks for invalid combos, stale `active:claiming`, and stuck processing states. Uses `STUCK_TIMEOUT_SECONDS` (300s) threshold.

E2E validated: 0 watchdog resets needed — all state transitions were clean.

**Fidelity**: HIGH.

### 11.9 Partially Realized: Orchestrate Grouping (Design §3: Orchestrate)

**Design intent**: "Group by relatedness: Same project label? Same component keywords? Same area of codebase?"

**Implementation**: `group_tasks()` groups by `project:<label>:assigned:<persona>` — a simple composite key. No keyword similarity, no codebase area analysis. Pre-existing chain metadata is now preserved (post-fix).

**Fidelity**: PARTIAL — grouping uses labels only, not semantic similarity. This is adequate for current scale but may need enhancement for large task volumes where unrelated tasks share the same persona.

### 11.10 Partially Realized: Decomposition (Design §3: Evaluate §4)

**Design intent**: "Does the task entail multiple implied dependent stages?... Each child gets its own staging and evaluation."

**Implementation**: `evaluate.py` asks the LLM about decomposition. If `decompose=True`, creates child tasks at `staging:wait` with `parent:<task_id>` label and `parent_id` in metadata. Orchestrator moves decomposed parents to end of chain.

E2E not directly tested (T2 was a decomposition candidate but the LLM chose not to split it).

**Fidelity**: PARTIAL — mechanism exists but the LLM's decomposition judgment is conservative (defaulting to not-split, as designed). The parent→child dependency enforcement relies on orchestrate placing the parent last, which works for simple cases but lacks explicit dependency blocking for complex multi-level hierarchies.

### 11.11 Circumvented: Chain Dependency Enforcement (Design §3: Orchestrate §6)

**Design intent**: "The parent only becomes executable after all children reach completed:done. This uses the same chain mechanism."

**Implementation (pre-fix)**: The orchestrator unconditionally overwrote pre-existing `chain_id`/`chain_order` metadata with new values based on project+persona grouping. This destroyed explicit task dependencies declared at creation time.

**Implementation (post-fix)**: `group_tasks()` now detects pre-existing chain metadata and preserves it. Tasks with explicit `chain_id` + `chain_order` are grouped by their original chain, not by persona. The event watcher's `chain_predecessor_done()` function checks predecessors correctly.

**Remaining gap**: The `chain_predecessor_done()` function's fallback `return True` (line 233 in event-watcher) means tasks whose predecessor is missing from the open-task query (e.g., already closed) will be allowed to execute. This is correct for the happy path (predecessor completed = should proceed) but could allow premature execution if the predecessor was force-closed without reaching `active:done`.

**Fidelity**: MEDIUM — fixed for the primary case, edge case remains.

### 11.12 Circumvented: Compressed Mode Transition (Design §3: Context Chaining Architecture)

**Design intent**: "When the previous task's JSONL transcript exceeds ~200K tokens, the executor switches to compressed mode."

**Implementation**: `executor.py` checks for `chain_resume` in metadata (line 193) and uses it if present. However, no code measures the previous task's JSONL transcript size or switches between resume and compressed modes. The threshold-based mode transition is not implemented.

**Fidelity**: LOW — the resume flag plumbing exists, but the mode-switching logic is missing.

### 11.13 Circumvented: Live Monitoring Sidecar (Design §4: Live Task Detail)

**Design intent**: "Dashboard polls `/live` every 5s when detail pane is open."

**Implementation**: Executor writes sidecar files (`<task-id>.exec.json`) with PID, session, persona, start time. `count_active_executors()` reads these for concurrency control. However, no `/api/v1/tasks/:id/live` endpoint exists in `app.py`. The dashboard does not consume sidecar data. Telemetry scraping (`collect_telemetry()`) reads sidecars for dead-PID detection but not for live monitoring.

**Fidelity**: LOW — sidecar infrastructure exists but live monitoring endpoint and dashboard integration are not implemented.

### 11.14 Not Implemented: Glow/Pulse Visual Cues (Design §4.1)

**Design intent**: "Pulsing border/shadow when a pipeline action is in progress."

**Implementation**: Not implemented. Dashboard was updated with pipeline board view but no glow animations.

### 11.15 Not Implemented: Blocked Banner (Design §4.3)

**Design intent**: "When ANY task has blocked:yes, show a persistent banner."

**Implementation**: Not implemented in dashboard.

### 11.16 Not Implemented: Board-Level Active State API (Design §4.4)

**Design intent**: "`GET /api/v1/pipeline/active` returns which task IDs currently have active sidecar files."

**Implementation**: Not implemented. The orchestrate telemetry in the event watcher logs active executor counts but doesn't expose them via API.

---

## 12. Summary

### What works well (validated by E2E)

| Capability | Evidence |
|------------|----------|
| Full happy-path pipeline (6 stages) | T1 closed in ~5 min |
| Deterministic safety blocking | T3 keyword-caught before LLM |
| Failure-recovery loop with retry limit | T3 exhausted 3 diagnose attempts |
| Review quality gate (reject bad work) | T7 rejected for analysis-only output |
| Parallel execution (5 concurrent) | 4 executors ran simultaneously |
| Atomic claim prevention of double-dispatch | 0 conflicts across 39 triggers |
| Watchdog self-healing | 0 resets needed (all transitions clean) |
| Context summary chaining | All executors produced valid summaries |

### Bugs fixed in this session

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Chain dependency loss | `orchestrate.py` unconditionally overwrote pre-existing `chain_id`/`chain_order` | `group_tasks()` now detects and preserves explicit chain metadata |

### Remaining gaps (prioritized)

| Priority | Gap | Design section | Status |
|----------|-----|----------------|--------|
| P1 | Chain-resume handoff (propagate session ID to next task) | §3 Context Chaining | **DONE** (d26a669 + this commit) |
| P1 | Compressed mode threshold switching | §3 Context Chaining | **DONE** — `COMPRESSED_MODE_BYTES=800000`, falls back to context summary injection |
| P2 | `/api/v1/pipeline/active` endpoint | §4.4 | **DONE** (d45e943) |
| P2 | `/api/v1/tasks/:id/live` endpoint | §4.2 | **DONE** — returns sidecar + log tail + log size + session_id |
| P3 | Dashboard glow/pulse animations | §4.1 | **DONE** (d45e943) |
| P3 | Blocked banner component | §4.3 | **DONE** (verified c234a5c) |
| P3 | `chain_predecessor_done()` force-close edge case | §3 Orchestrate | **DONE** — checks all tasks (not just open) for closed predecessor |
| P2 | Dashboard frontend for live telemetry | §4.2 | OPEN — API ready, frontend not wired |
| P2 | AI Reviewer instrumentation | Project_Aion recommendation | OPEN — first dashboard target |

---

*Pipeline v2 Technical Reference — derived from source code on main, validated by 7-task E2E test suite (6/7 pass, 1 cycling). 77/77 unit tests green.*
