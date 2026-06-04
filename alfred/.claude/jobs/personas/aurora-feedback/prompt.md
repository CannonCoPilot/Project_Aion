# Creative Feedback Processor

You process feedback submitted through the Creative Pipeline web review interface.
Feedback entries are stored in `/data/feedback.jsonl` (or the path configured
via the aurora-api sidecar's data volume).

## Workflow

1. **Read feedback**: Read the feedback file at the path provided. Look for
   entries where `"processed": false`.

2. **Skip if empty**: If no unprocessed entries, output "No new feedback to
   process" and exit.

3. **For each unprocessed entry**:

   a. Find the matching creative output note in documents at
      `${OUTPUT_DIR}/outputs/`. The `output_id` field matches
      the filename without `.md`.

   b. Read the creative output note and update its frontmatter:
      - Set `rating` to the submitted value
      - Set `status` to `reviewed`
      - Set `accepted` based on the action:
        - `deploy` or `refine` → `true`
        - `not-interested` → `false`
        - `backlog` or custom → leave as `null`

   c. Find the linked Pulse task. Search open AND closed tasks (presenter
      now closes tasks on delivery, so recent surprises will be closed):
      `pulse list --label project:creative`
      Match by title similarity to the creative output title.

      **If task is closed or no matching Pulse task exists**, create a new one:
      Use the `task_create` MCP tool with:
      - title: `Creative Pipeline: <surprise title>`
      - description: The surprise summary from the ${DOCS_ROOT} note + the user's feedback notes
      - priority: 3 (LOW) for refine/backlog, 4 (Backlog) for custom, 2 (MEDIUM) for deploy
      - labels: `project:creative,creative:delivered,source:session` plus the appropriate domain label

   d. Apply action mapping to the Pulse task (whether existing or newly created):

      | Action | Pulse Update |
      |--------|-------------|
      | `deploy` | `pulse update <id> --notes "Approved for deployment via Creative Pipeline review"` then add labels: `nexus-label add <id> "auto:ready,creative:approved,risk:moderate" aurora-feedback` then advance stage: `nexus-label stage <id> queue aurora-feedback` |
      | `refine` | `pulse update <id> --notes "Feedback: <notes>"` then add labels: `nexus-label add <id> "auto:candidate,creative:approved" aurora-feedback` then advance stage: `nexus-label stage <id> route aurora-feedback` |
      | `backlog` | No label change. Keep at current priority and stage. |
      | `not-interested` | `nexus-label remove <id> "stage:review" aurora-feedback` then `nexus-label add <id> "completed-by:aurora-feedback" aurora-feedback` then `pulse close <id> --reason "Declined via Creative Pipeline review"` |
      | custom | `pulse update <id> --notes "Creative Pipeline review feedback: <custom action>. Notes: <notes>"` |

   e. Mark the entry as processed. Read the ENTIRE feedback.jsonl file,
      parse each JSON line into a list, find the matching entry by
      `output_id` and set its `"processed"` field to `true`, then
      write ALL entries back as valid JSONL (one JSON object per line).
      **CRITICAL**: Every line in feedback.jsonl MUST be a valid JSON object.
      Do NOT append plain text like "Marked processed: ..." — only write
      JSON objects. Do NOT use `echo` to append text — rewrite the full file.

   f. **Append process-log event**: After processing, append one JSONL line to
      `${PROJECT_DIR}/.claude/agent-output/creative/process-log.jsonl`:
      ```jsonl
      {"timestamp":"<ISO-8601Z>","event":"feedback_received","output_id":"<output_id>","date":"<date from entry>","run":"<am or pm>","beads_task_id":"<task ID>","rating":<rating>,"action":"<action>","decision":"<label applied: auto:ready|auto:candidate|declined|backlog|custom>","decision_reason":"<one sentence why this label was chosen>","notes_summary":"<10-word summary of the user's notes, or null>"}
      ```
      - `output_id` is the ${DOCS_ROOT} note filename without `.md` (e.g., `2026-03-02-content-studio`)
      - `decision` captures which label path was taken from the action mapping in step 3d
      - `decision_reason` is a brief human-readable explanation (e.g., "High rating with deploy action — auto-ready for execution")
      - If the file doesn't exist yet, creating it with the first line is fine (append mode)
      - If writing fails, continue processing — this is non-critical telemetry

4. **Update interest profile**: Read `${OUTPUT_DIR}/interest-profile.md`
   and update the "Surprise Preferences" or ratings section with new ratings.
   Only update if there are rated entries.

5. **Rebuild manifest**: Run:
   `curl -s -X POST http://localhost:8350/api/rebuild-manifest -H "X-Creative Pipeline-Secret: $AURORA_API_SECRET"`
   The `AURORA_API_SECRET` env var is set by the executor. If the proxy
   is not reachable, skip this step and note it.

6. **Chain creative-action**: If any entries had `deploy` or `refine` actions
   (i.e., you added the `creative:approved` label to at least one task), trigger
   the action executor to pick up the approved work immediately:
   ```bash
   ${PROJECT_DIR}/.claude/jobs/dispatcher.sh --run creative-action
   ```
   If the dispatcher is not available or the command fails, skip silently —
   the 6-hour interval sweep will catch it.

## Important Notes

- The feedback file path depends on where the job runs. Read feedback via
  the web proxy API: `curl -s http://localhost:8350/api/feedback`
  Alternatively, check the Docker volume mount at
  `${HOME}/Docker/mydocker/creative-web/` for direct file access.

- When updating ${DOCS_ROOT} frontmatter, use the MCP knowledge server tools
  (read_file + create a new version). The frontmatter format is standard
  YAML between `---` delimiters.

- Always process ALL unprocessed entries in one run. Do not stop after the
  first entry.

- If a Pulse task cannot be found for a surprise, CREATE one using the
  task_create MCP tool, then apply the action mapping to it. Never skip
  a surprise just because it lacks a task — the feedback processor is
  responsible for ensuring every reviewed surprise has a tracked task.
