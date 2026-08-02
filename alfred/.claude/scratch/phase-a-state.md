# Phase A — live orchestration state (crash-recovery)

**Seed session (re-pinned):** 72cec8c2-988d-46f8-9ea5-db39a6c7fef7 (Protos window, aion tmux)
**Stale pin backed up:** state/.chain-seed-session-id.crashed-7cd63cb9.bak (was 7cd63cb9, crashed)
**Daemon:** host-executor-bridge.sh --daemon, pid 96640
**Monitor:** persistent, task b5vjkrrvx, script .claude/scratch/phase-a-monitor.py (exits when all 7 closed)

## Tickets created (A1–A7), A8 NOT yet created (gated)

| # | Pulse ID | Output doc | status |
|---|----------|-----------|--------|
| A1 | AION-68254a10 | 00_corpus_inventory.md | open |
| A2 | AION-2c16c139 | 01_product_requirements.md | open |
| A3 | AION-0fe3fdbe | 02_architecture.md | open |
| A4 | AION-8fc84fbe | 03_status_and_roadmap.md | open |
| A5 | AION-7f2655df | 04_adversarial_review.md | open |
| A6 | AION-4de4411b | 05_comparative_research.md | open |
| A7 | AION-bc15722b | 06_credential_audit.md | open |
| A8 | (create after gate) | 07_revised_master_plan.md | not created |

## Resume after a crash
1. Re-verify seed pin == current session (re-pin if not; see procedure in phase-a-launch.md).
2. Check daemon alive (pgrep). Check tickets via curl http://localhost:8800/api/v1/tasks.
3. If monitor not running, re-arm it (Monitor → phase-a-monitor.py).
4. For any already-closed ticket, read its doc and sanity-check; don't re-create.
5. Gate A8 on A1–A7 all closed. A7 audit: scan for secret leakage before any commit.
