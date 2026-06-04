# Quick infrastructure health check

## Step 1: Load Prior Log Context

Run this command to load previously investigated findings:

  python3 ${PROJECT_DIR}/.claude/scripts/health-log.py load-recent

Review the output. Any entry with disposition "not-an-issue" is a SUPPRESSED finding —
do NOT re-alert on it unless the conditions_hash changes (i.e., the condition has worsened
or changed in a meaningful way). Keep these entries in mind as you run the health check.

## Step 2: Check Infrastructure Health

Run `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.State}}'` to get all container
statuses in one command. Verify critical services are running: n8n, grafana, prometheus,
caddy, mcp-gateway. If any service is down, unhealthy, or missing, use docker inspect
for details.

## Step 3: Output Health Summary

Output a brief health summary listing each critical service and its status. For any
finding that matches a suppressed entry (same finding_key), note it as:
"[SUPPRESSED — previously investigated]" and skip re-alerting. If conditions changed
(e.g., error count grew significantly), re-elevate with note "Previously dismissed —
conditions changed".

Include a summary line: "Suppressed N known non-issues" (or "No prior context" if log
is empty).

## Step 4: Append Findings to Log

After completing the health check, for each finding (issue, watch, or confirmed
non-issue), append a log entry using:

  python3 ${PROJECT_DIR}/.claude/scripts/health-log.py append \
    "<finding_key>" "<service>" "<1-2 line summary>" "<investigation notes>" \
    "<disposition: issue|not-an-issue|watch>"

Use normalized finding keys (e.g., "caddy:error-log-loss", "prometheus:container-missing").
Finding key format: "<service>:<finding-category>" — lowercase, hyphenated, stable.
Omit entries for services that are healthy with no findings.

Reference: ${PROJECT_DIR}/.claude/context/health-check-log-schema.md

## Note: Stuck task detection moved to pipeline-watchdog.sh
## The watchdog runs every 5 minutes and catches stuck tasks, label violations,
## and gate-stage misalignment deterministically (zero LLM cost).
## See pipeline-watchdog and pipeline-review jobs in this registry.
