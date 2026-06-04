# pipeline-probe

**Path**: `/Users/nathanielcannon/Claude/Alfred-Dev` (AIfred project root)
**Type**: probe / test harness
**Status**: active
**Created/Registered**: 2026-05-29

---

## Overview

Test/probe project used to exercise the Nexus pipeline end-to-end — chain executor, parent→child decomposition, staging/evaluation/queue stages, sentinel handling, and Pulse parent-link logic — with deliberately trivial multi-step file-creation workloads (e.g. create `step1.txt` → `step2.txt` → `step3.txt`, then verify each). The probe lets the dispatcher, executor, audit log, and parent-close behaviour be validated without committing real work.

---

## Goal

Confirm that a top-level pipeline-probe PROBE task decomposes into the expected ordered child tasks, each child runs under the correct persona/agent, parent-link metadata is preserved across the chain, and the parent closes only after every child resolves.

---

## Status

Active — used on demand to smoke-test the pipeline. All historical pipeline-probe parent runs (TEST-f0657b69, TEST-0a2badbc, TEST-bc4a5186) and their children are closed.

---

## Evaluator Brief

### Key File Paths

| Path | Purpose |
|------|---------|
| `.claude/jobs/executor.sh` | Main Nexus job executor — runs pipeline-probe tasks |
| `.claude/jobs/dispatcher.sh` | Scheduler that picks up pipeline-probe tasks from Pulse |
| `.claude/jobs/state/` | Sentinel + chain summary files (`.chain-done-*`, `.chain-summary-*`) |
| `.claude/logs/headless/executions/` | Per-execution log files (`v2-executor-<task-id>-*.log`) |
| `.claude/logs/pipeline-validation/` | Aggregate pipeline-validation logs |
| `output/pipeline-probe/` (if used) | Conventional output directory for `stepN.txt` artifacts |
| `knowledge/projects/pipeline-probe.md` | This evaluator brief |

### Models & Tools

| Model / Tool | Role |
|------|---------|
| claude-interactive (claude-sonnet-4-6) | Default engine for pipeline-probe verify tasks |
| Pulse CLI (`pulse`) | Task tracking — parent PROBE + child create/verify tasks |
| executor.sh | Runs each task and writes execution logs |
| dispatcher.sh | Schedules tasks and enforces stage transitions |
| Filesystem (Bash) | Creates and reads `stepN.txt` to satisfy verify steps |

### Decisions Made

| Date | Decision | Source |
|------|----------|--------|
| 2026-05-29 | pipeline-probe formalised as a multi-step chain (create step1 → step2 → step3 → verify-all) to exercise ordered decomposition | TEST-f0657b69 |
| 2026-05-29 | Sentinel + chain-summary files in `.claude/jobs/state/` adopted as the canonical handoff mechanism between chain steps | Pulse history |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should `stepN.txt` artifacts write under a standard `output/pipeline-probe/` path or a per-run subdirectory? | [ ] open |
| 2 | Should pipeline-probe runs emit a dedicated audit-log entry distinct from the generic executor log? | [ ] open |
| 3 | Should pipeline-probe graduate from probe-only to a regression test fired on every executor / dispatcher change? | [ ] open |

### Related Tasks

| Task ID | Title | Status |
|---------|-------|--------|
| TEST-f0657b69 | PROBE: Multi-step file creation (parent) | closed |
| AION-0bd82768 | Create step1.txt (child of TEST-f0657b69) | closed |
| AION-91fb9ba0 | Create step2.txt (child of TEST-f0657b69) | closed |
| AION-4f26d17b | Create step3.txt (child of TEST-f0657b69) | closed |
| AION-a4c8e936 | Verify all files are created (child of TEST-f0657b69) | closed |
| TEST-0a2badbc | PROBE: File path verification | closed |
| TEST-bc4a5186 | PROBE: Create and verify test file | closed |

<!-- Bootstrapped: 2026-05-29 by AION-17a2bbe0 -->
