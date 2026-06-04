# Execute auto:ready tasks — risk:safe autonomously, pipeline:approved regardless of risk

Run the autonomous task execution workflow.

Step 0: Check for specific task_id parameter.
  If task_id provided, process ONLY that task (skip queries, go to Step 3).
  Verify it has auto:ready or pipeline:approved before executing.

Step 0.5: Stale claim cleanup
  pulse list --status in_progress --label auto:ready
  For any task that has been in_progress with no active executor (check updated_at
  is >2 hours old), revert it: pulse update <id> --status open
  This prevents tasks from getting stuck when a previous executor hit max_turns.

Step 1: Query for executable tasks (sweep mode)
  PRIORITY ORDER — process approved tasks first, then safe tasks:
  A. pulse list --status open --label auto:ready --label pipeline:approved
  B. pulse list --status open --label auto:ready --label risk:safe
Combine both lists (deduplicate). Process list A before list B.
Human-approved tasks (pipeline:approved) execute regardless of risk label
and may perform destructive actions including audio file deletion.
IMPORTANT: Skip any task that has `waiting:david`, `needs-input`, or `type:research` labels,
even if it has `pipeline:approved`. Research tasks are handled by task-research, not task-executor.
FAST SKIP: In Step 1, filter out ineligible tasks immediately by label. Do NOT
claim or pulse show tasks you will skip — that wastes turns.
If NO tasks are found, write a minimal report and exit cleanly.

Step 2: Query for moderate tasks (notification only)
  pulse list --status open --label auto:ready --label risk:moderate
Do NOT execute these UNLESS they also have pipeline:approved.

Step 3: For each executable task (max 10, approved first, then oldest first):
  a. Claim: pulse update <id> --status in_progress --claim
  b. Read: pulse show <id>
  c. Validate eligibility (auto:ready + (risk:safe OR pipeline:approved))
  d. Execute the fix described in the task
  f. Validate the result
  g. Close on success (API auto-strips gating labels): nexus-label add <id> "completed-by:autofix-executor" autofix-executor then pulse close <id> --reason "Auto-executed: <summary>"
  h. On failure: pulse update <id> --status open --add-label "parked"

Step 4: Write JSON report to .claude/agent-output/results/task-executor/

If no ready tasks found, write a minimal report and exit cleanly.

Follow ALL safety constraints from your autofix-executor persona:
- Max 10 tasks, 3-min timeout per task
- pipeline:approved tasks MAY delete audio files (human approval overrides)
- Never touch Docker, SSH, git push
- Never modify files outside explicitly listed paths
