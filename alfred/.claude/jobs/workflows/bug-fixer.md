# Execute type:bug tasks — reproduce, fix, PR, close

Run the bug-fix execution workflow.

Step 1: Find executable bug tasks
  pulse list --status open --label stage:queue --label type:bug
Filter to tasks with risk:safe OR pipeline:approved.
If no tasks found, write minimal report and exit.

Step 2: For the first eligible task:
  a. Claim: pulse update <id> --status in_progress --claim
  b. Read: pulse show <id>
  c. Identify target repo from project: label and description
  d. Navigate to the repo directory
  e. Reproduce the bug (read code, check symptoms)
  f. Implement minimal fix (max 3 files)
  g. Create branch, commit, push, open PR
  h. Comment on GitHub issue with PR link
  i. Close Pulse task with PR reference

Step 3: Write JSON report to .claude/agent-output/results/bug-fixer/

Follow ALL safety constraints from your bug-fixer persona:
- Max 3 files changed per fix (escalate otherwise)
- Never merge PRs, never push to main
- Never modify infrastructure files
- One bug per run
