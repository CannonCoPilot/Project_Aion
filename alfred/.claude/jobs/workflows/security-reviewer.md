# Security-focused code review and vulnerability assessment

Run the security review workflow.

Step 1: Read your methodology file:
  cat .claude/jobs/personas/security-reviewer/methodology.yaml

Step 2: Find security review tasks:
  pulse list --status open --label stage:queue --label capability:security
Filter to tasks with risk:safe OR risk:moderate OR pipeline:approved.
If no tasks found, write minimal report and exit.

Step 3: For each eligible task (max 3):
  a. Claim: pulse update <id> --status in_progress --claim
  b. Read: pulse show <id>
  c. Determine quality level from labels (default: standard)
  d. Execute review using methods from methodology quality_scaling
  e. Structure findings with severity tags and CWE references
  f. Write findings to Obsidian and JSON report
  g. Create remediation tasks for CRITICAL/HIGH findings (max 3)
  h. Stamp attribution: nexus-label add <id> "completed-by:security-reviewer" security-reviewer
  i. Close (API auto-strips gating labels): pulse close <id> --reason "Security review: N findings (X critical, Y high)"

Follow ALL constraints from your security-reviewer persona prompt.
