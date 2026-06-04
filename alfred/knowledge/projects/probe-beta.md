# probe-beta

**Path**: `/Users/nathanielcannon/Claude/Alfred-Dev` (AIfred project root)
**Type**: probe / test harness
**Status**: active
**Created/Registered**: 2026-05-29

---

## Overview

Test/probe project used to exercise the Nexus chain-executor and parent→child task decomposition flow with a deliberately trivial file-creation workload. The recurring pattern ("PROBE-B: Create beta file") spawns a small task tree — create `beta.txt`, verify its existence, verify its content — which lets the executor, dispatcher, and Pulse parent-link logic be validated without needing a real workload.

---

## Goal

Confirm that a top-level PROBE-B task decomposes into the expected child tasks (create + verify-existence + verify-content), each child runs under the correct persona/agent, and the parent closes only after all children resolve.

---

## Status

Active — used on demand to smoke-test the chain executor. All historical PROBE-B runs (10 tasks) are closed.

---

## Evaluator Brief

### Key File Paths

| Path | Purpose |
|------|---------|
| `.claude/jobs/executor.sh` | Main Nexus job executor — runs PROBE-B tasks |
| `.claude/jobs/dispatcher.sh` | Scheduler that picks up PROBE-B tasks from Pulse |
| `.claude/logs/headless/executions/` | Per-execution log files for PROBE-B runs (`v2-executor-<task-id>-*.log`) |
| `output/probe-beta/` (if used) | Conventional output directory for `beta.txt` artifacts |
| `knowledge/projects/probe-beta.md` | This evaluator brief |

### Models & Tools

| Model / Tool | Role |
|------|---------|
| claude-interactive (claude-sonnet-4-6) | Default engine for PROBE-B verify tasks |
| Pulse CLI (`pulse`) | Task tracking — parent PROBE-B + child create/verify tasks |
| executor.sh | Runs each task and writes execution logs |
| Filesystem (Bash) | Creates and reads `beta.txt` to satisfy verify steps |

### Decisions Made

| Date | Decision | Source |
|------|----------|--------|
| 2026-05-29 | PROBE-B pattern formalised as 3-child decomposition: create → verify-existence → verify-content | AION-2c64c8f6 (parent) |
| 2026-05-30 | Latest PROBE-B parent (TEST-6c670e6f / TEST-6a4bf28d) closed cleanly after all children resolved | Pulse history |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should `beta.txt` write under a standard `output/probe-beta/` path or a per-run directory? | [ ] open |
| 2 | Do PROBE-B runs need their own audit-log entry distinct from the generic executor log? | [ ] open |
| 3 | Should PROBE-B graduate from probe-only to a regression test fired on every executor change? | [ ] open |

### Related Tasks

| Task ID | Title | Status |
|---------|-------|--------|
| TEST-6c670e6f | PROBE-B: Create beta file | closed |
| TEST-6a4bf28d | PROBE-B: Create beta file | closed |
| AION-2c64c8f6 | PROBE-B: Create beta | closed |
| AION-0d675b98 | PROBE-B: Create beta file (agent:jarvis) | closed |
| AION-a11488e3 | Create beta.txt file (child of AION-2c64c8f6) | closed |
| AION-ddb50677 | Verify existence of beta.txt (child of AION-2c64c8f6) | closed |
| AION-c9a74736 | Verify content of beta.txt (child of AION-2c64c8f6) | closed |
| AION-63f980fb | Create beta.txt file (child of TEST-6a4bf28d) | closed |
| AION-59d7d2fc | Verify beta.txt file creation (child of TEST-6a4bf28d) | closed |
| AION-f37496c5 | Validate beta.txt file contents (child of TEST-6a4bf28d) | closed |

<!-- Bootstrapped: 2026-05-29 by AION-b5fbfe73 -->
