# Execute auto:ready infrastructure tasks — pipeline:approved bypasses risk gate

Run the infrastructure deployment workflow.

Step 0: Check for specific task_id parameter.
  If task_id provided, process ONLY that task (skip queries, go to Step 2).
  Verify it has auto:ready or pipeline:approved before executing.

Step 1: Query for executable infrastructure tasks (sweep mode)
  pulse list --status open --label auto:ready --label capability:infrastructure
Execute tasks that have risk:safe, risk:moderate, OR pipeline:approved.
Human-approved tasks bypass the risk gate entirely.
If NO tasks are found, write a minimal report and exit cleanly.

Step 2: For each task (max 5, oldest first):
  a. Claim: pulse update <id> --status in_progress --claim
  b. Read: pulse show <id>
  c. Validate eligibility (auto:ready + capability:infrastructure + (risk:safe|moderate OR pipeline:approved))
  d. Read any linked spec or deployment guide
  e. Execute the deployment as described
  f. Health check: docker ps, docker logs, curl endpoints
  g. Close on success (API auto-strips gating labels): pulse close <id> --reason "Deployed: <summary>"
  h. On failure: rollback, pulse update <id> --status open --add-label "parked"

Step 3: Write JSON report to .claude/agent-output/results/infrastructure-deployer/

Follow ALL safety constraints from your infrastructure-deployer persona:
- Max 5 tasks, 10-min timeout per task
- Always health check after deployment
- Rollback on failure (docker compose down + git checkout)
- Never modify Caddy, Authentik, DNS, or other services
- Never use docker system prune or destructive Docker commands
