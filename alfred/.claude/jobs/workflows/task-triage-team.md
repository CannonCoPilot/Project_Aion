# Multi-investigator task triage (replaces single task-investigator)

Run the task triage workflow.
Step 1: pulse list --status open --label auto:candidate (skip waiting:david, parked)
Step 2: For each candidate (max 5, oldest first), pulse show <id> and analyze
Step 3: Return structured verdict per task
