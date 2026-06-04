# chain-order-test

**Path**: `/Users/nathanielcannon/Claude/Alfred-Dev` (AIfred project root)
**Type**: probe / test harness
**Status**: active
**Created/Registered**: 2026-05-29

---

## Overview

Test/probe project for validating ordered execution of dependent child tasks in the Nexus chain executor. The recurring pattern "PROBE-CHAIN-ORDER: Two ordered steps" decomposes a parent into a two-step chain — write `chain-step1.txt` (Step 1), then read it and append "- Step 2 complete" to produce `chain-step2.txt`. The second step must wait for the first to land its artifact before running.

---

## Goal

Confirm that (a) child tasks fire in the declared dependency order, (b) the second child sees the first child's filesystem output, and (c) the parent closes only when both children resolve. Verify variant exists (TEST-f769fc22) that adds a third "Verify Output Files" child.

---

## Status

Active — all three historical PROBE-CHAIN-ORDER parent runs (TEST-e3c9e633, TEST-a0edbf56, TEST-f769fc22) and their 7 child tasks are closed. Latest fixture in `output/chain-order-test/`: chain-step1.txt (15 B), chain-step2.txt (34 B).

---

## Evaluator Brief

### Key File Paths

| Path | Purpose |
|------|---------|
| `output/chain-order-test/chain-step1.txt` | Step-1 artifact (~"Step 1 complete") |
| `output/chain-order-test/chain-step2.txt` | Step-2 artifact (Step 1 + "- Step 2 complete") |
| `.claude/jobs/executor.sh` | Runs each chain step |
| `.claude/jobs/dispatcher.sh` | Schedules and routes chain children in dependency order |
| `.claude/jobs/state/.chain-done-<task-id>` | Sentinel file written by each child on completion |
| `.claude/jobs/state/.chain-summary-<task-id>.json` | Per-child context summary handed to the next child |
| `.claude/logs/headless/executions/v2-executor-<task-id>-*.log` | Per-execution logs for chain children |
| `knowledge/projects/chain-order-test.md` | This evaluator brief |

### Models & Tools

| Model / Tool | Role |
|------|---------|
| claude-interactive (claude-sonnet-4-6) | Default engine for both chain steps |
| Pulse CLI (`pulse`) | Tracks parent PROBE-CHAIN-ORDER task + its child chain steps |
| executor.sh | Runs each child task, writes sentinel + summary state files |
| dispatcher.sh | Enforces parent→child + child→child ordering |
| Filesystem (Bash) | Reads chain-step1.txt and writes chain-step2.txt |

### Decisions Made

| Date | Decision | Source |
|------|----------|--------|
| 2026-05-29 | PROBE-CHAIN-ORDER formalised as two-step chain: write step1 file → read+append → write step2 file | TEST-a0edbf56 |
| 2026-05-29 | Variant TEST-f769fc22 adds a third "Verify Output Files" child to assert both artifacts exist with expected content | TEST-f769fc22 |
| 2026-05-29 | Per-step handoff uses `.chain-summary-<task-id>.json` + `.chain-done-<task-id>` sentinel in `.claude/jobs/state/` | Executor convention |
| 2026-05-29 | Step-2 appends literal "- Step 2 complete" (hyphen-space prefix) to step-1 content rather than a newline-separated entry | Latest fixture (chain-step2.txt: "Step 1 complete - Step 2 complete") |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should step-2 append on a new line or inline? Current fixture is inline; earlier runs used newline separation. | [ ] open |
| 2 | Does the dispatcher block step-2 dispatch until step-1's sentinel is written, or only until step-1's Pulse status flips to closed? | [ ] open |
| 3 | Should PROBE-CHAIN-ORDER become a regression test fired on every chain-executor change? | [ ] open |
| 4 | Are the `.chain-summary-*.json` files cleaned up after a parent closes, or do they accumulate in `.claude/jobs/state/`? | [ ] open |

### Related Tasks

| Task ID | Title | Status |
|---------|-------|--------|
| TEST-e3c9e633 | PROBE-CHAIN-ORDER: Two ordered steps | closed |
| AION-7e02b1c7 | Write Completion Message to First File (child of TEST-e3c9e633) | closed |
| AION-3f7856a5 | Read First File and Append to Second File (child of TEST-e3c9e633) | closed |
| TEST-a0edbf56 | PROBE-CHAIN-ORDER: Two ordered steps | closed |
| AION-15949134 | Create chain-step1.txt with content "Step 1 complete" (child of TEST-a0edbf56) | closed |
| AION-614c72b8 | Create chain-step2.txt by appending " - Step 2 complete" (child of TEST-a0edbf56) | closed |
| TEST-f769fc22 | PROBE-CHAIN-ORDER: Two ordered steps (3-child variant) | closed |
| AION-946fd8c1 | Generate Step 1 File (child of TEST-f769fc22) | closed |
| AION-cdecc0f7 | Generate Step 2 File (child of TEST-f769fc22) | closed |
| AION-74b2b6fd | Verify Output Files (child of TEST-f769fc22) | closed |

<!-- Bootstrapped: 2026-05-29 by AION-991a1bfb -->
