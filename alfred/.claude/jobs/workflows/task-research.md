# Execute pipeline:approved type:research tasks and write findings to Obsidian

Run the autonomous research execution workflow.

Step 1: Check for specific task_id parameter.
  If task_id provided, process ONLY that task.
  Otherwise: pulse list --status open --label pipeline:approved --label type:research
  If no tasks found, write minimal report and exit.

Step 2: For each task (max 3, oldest first):
  a. Claim: pulse update <id> --status in_progress --claim
  b. Read: pulse show <id>
  c. Extract research brief, output path, domain from labels
     - Route to topic subdirectory per domain mapping (see researcher persona step d)
     - Project-specific research (project:<name> label) → 05-AI/Projects/<name>/
     - Include canonical frontmatter with reviewed:false (see schema at .claude/context/standards/research-frontmatter-schema.yaml)
  d. Research using WebSearch, WebFetch, local file reads
  e. Write to Obsidian via MCP create_file
  f. Route based on signal + source (three-tier completion):
     - SIGNAL (actionable findings) → add review:research + waiting:david, keep open (Action Required)
     - NO SIGNAL + human-requested (source:session/claude-app) → add review:research only, keep open (FYI)
     - NO SIGNAL + automated (source:headless/pulsar) → close silently
     Note: review:research is preserved on closure by the Pulse API for dashboard filtering.
  g. Create follow-ups if gaps found (max 2, with correct labels)

Step 3: Write JSON report to .claude/agent-output/results/task-research/

Notifications are handled automatically by the executor and relay.
Do NOT call send-telegram.sh directly.

Follow ALL researcher persona constraints.
