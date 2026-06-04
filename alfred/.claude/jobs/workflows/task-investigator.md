# Fallback: evaluate auto:candidate tasks, promote to auto:ready or block

Run the task investigation workflow.

Step 1: Query candidates
  pulse list --status open --label auto:candidate
Skip any that also have waiting:david or parked.

Step 2: For each candidate (max 5, oldest first):
  - pulse show <id> to read full details
  - Verify all file paths mentioned in the description exist (ls, stat)
  - Check if the action is deterministic (specific paths + specific action)
  - Score against promotion criteria in your persona prompt

Step 3: For promotable tasks:
  - Remove auto:candidate, add auto:ready and risk:<level>
  - Append investigation notes to the description

Step 4: For non-promotable tasks:
  - If needs human input: add waiting:david label
  - If not automatable: add parked label
  - Append blocking reason to the description

Step 5: Write JSON report to .claude/agent-output/results/task-investigator/

If no candidates found, write a minimal report and exit.
When in doubt, block rather than promote.
