# probe-alpha

**Path**: `/Users/nathanielcannon/Claude/Alfred-Dev` (AIfred project root)
**Type**: probe / test harness
**Status**: active
**Created/Registered**: 2026-05-28

---

## Overview

Test/probe project that mirrors `probe-beta` for the "A" side: exercises the Nexus chain-executor and parent→child decomposition using a trivial alpha.txt create-and-verify workload. The recurring pattern "PROBE-A: Create alpha file" spawns child tasks for create + verify-existence + verify-content, letting executor, dispatcher, and Pulse parent-link logic be smoke-tested without a real workload.

---

## Goal

Confirm that a PROBE-A parent task decomposes into create + verify-existence + verify-content children, each runs under the correct persona/agent, alpha.txt lands at the expected output path with expected content, and the parent closes only after all children resolve.

---

## Status

Active — used on demand as the A-half of the probe pair. All historical PROBE-A runs (10 tasks across 4 parents) closed. Latest fixture: `output/probe-alpha/alpha.txt` (15 B).

---

## Evaluator Brief

### Key File Paths

| Path | Purpose |
|------|---------|
| `output/probe-alpha/alpha.txt` | Step-1 artifact created by PROBE-A child tasks |
| `output/probe-alpha/probe-alpha/` | Stray nested subdirectory from an earlier run (see Open Questions) |
| `.claude/jobs/executor.sh` | Runs each PROBE-A child task |
| `.claude/jobs/dispatcher.sh` | Schedules and routes PROBE-A children in order |
| `.claude/jobs/state/.chain-done-<task-id>` | Per-child completion sentinel |
| `.claude/jobs/state/.chain-summary-<task-id>.json` | Per-child context summary handed to the next child |
| `.claude/logs/headless/executions/v2-executor-<task-id>-*.log` | Per-execution logs for PROBE-A children |
| `knowledge/projects/probe-alpha.md` | This evaluator brief |

### Models & Tools

| Model / Tool | Role |
|------|---------|
| claude-interactive (claude-sonnet-4-6) | Default engine for PROBE-A verify children |
| Pulse CLI (`pulse`) | Tracks parent PROBE-A task + create/verify-existence/verify-content children |
| executor.sh | Runs each task, writes sentinel + summary state |
| dispatcher.sh | Enforces parent→child ordering |
| Filesystem (Bash) | Creates and reads alpha.txt for the verify steps |

### Decisions Made

| Date | Decision | Source |
|------|----------|--------|
| 2026-05-28 | PROBE-A pattern formalised as 3-child decomposition: create → verify-existence → verify-content | TEST-fd6bb6f2 |
| 2026-05-28 | Variant agent:jarvis run executed against the same probe to validate cross-persona dispatch | AION-62babbe9 |
| 2026-05-29 | Latest PROBE-A parent (TEST-1a65693e) closed cleanly after all three children resolved | Pulse history |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Why does `output/probe-alpha/` contain a nested `probe-alpha/` subdirectory? Stray output path from an early run or intentional? | [ ] open |
| 2 | Should `alpha.txt` land under a per-run subdirectory or always overwrite the canonical `output/probe-alpha/alpha.txt`? | [ ] open |
| 3 | Should PROBE-A graduate from on-demand probe to a regression test fired on every executor/dispatcher change? | [ ] open |
| 4 | Should PROBE-A and PROBE-B be unified under a single PROBE harness, or kept as deliberately parallel A/B smoke tests? | [ ] open |

### Related Tasks

| Task ID | Title | Status |
|---------|-------|--------|
| TEST-1a65693e | PROBE-A: Create alpha file | closed |
| AION-b7ea6da6 | Create alpha.txt file (child of TEST-1a65693e) | closed |
| AION-32a9c312 | Verify alpha.txt file was created (child of TEST-1a65693e) | closed |
| AION-98d90fbd | Verify content of alpha.txt (child of TEST-1a65693e) | closed |
| TEST-fd6bb6f2 | PROBE-A: Create alpha file | closed |
| AION-ef70586d | Create alpha.txt file (child of TEST-fd6bb6f2) | closed |
| AION-6f2ee5b1 | Verify file existence (child of TEST-fd6bb6f2) | closed |
| AION-47185150 | Verify file content (child of TEST-fd6bb6f2) | closed |
| AION-62babbe9 | PROBE-A: Create alpha file (agent:jarvis) | closed |
| AION-5f9085a4 | PROBE-A: Create alpha | closed |

<!-- Bootstrapped: 2026-05-29 by AION-bc2a099b -->
