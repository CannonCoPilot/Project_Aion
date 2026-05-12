# Runbook: Halt AIFred-Pro Production Dispatcher + Jobs + Tasks

**When to use**: Detected leak / runaway cost / suspected misconfiguration in PROD AIFred-Pro that requires immediate cessation of all autonomous activity. Reversible — closing tasks does not delete history; disabling jobs is a config change; unloading the dispatcher is a launchctl operation.

**Authorized by**: explicit user instruction (destructive ops require explicit permission per Jarvis CLAUDE.md guardrails). Do NOT execute proactively.

**Scope**: AIFred-Pro production only. Does NOT touch Alfred-Dev, Jarvis, or any of David's machine. Coordinate via Shared_Projects/Debriefs/AIFred-Pro/ before / after.

---

## Three layers (execute in order)

### Layer 1: Unload the dispatcher cron (hard stop on the firing source)

```bash
launchctl bootout gui/$(id -u)/com.aion.nexus-dispatcher
# Verify
launchctl list | grep -E 'aion.*dispatcher' && echo 'STILL LOADED' || echo 'GONE'
ps -ef | grep dispatcher.sh | grep -v grep || echo 'no dispatcher.sh process running'
```

Expected: dispatcher absent from `launchctl list`; no `dispatcher.sh` PID in `ps`. The 5-minute `StartInterval` is now stopped — no further job evaluations until reloaded.

### Layer 2: Disable all 13 jobs in `nexus-settings.json` (defense in depth)

The dispatcher reads per-job overrides from `/Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/state/nexus-settings.json`. Setting `enabled: false` on each job ensures: even if the dispatcher is reloaded, `is_job_due()` returns false for every job.

```bash
for job in health-summary persona-health-check task-score task-investigator task-executor doc-sync-check pipeline-review context-maintenance creative-think creative-build creative-present weekly-digest ollama-test; do
  curl -sf -X PATCH "http://localhost:8600/api/nexus-settings/job-overrides/$job" \
    -H 'content-type: application/json' \
    -d '{"enabled": false}' \
    -o /dev/null -w "$job: HTTP %{http_code}\n"
done
```

Note: dashboard returns HTTP 400 on response-schema mismatch despite a successful write. Verify the file directly:

```bash
python3 -c "import json; d=json.load(open('/Users/nathanielcannon/Claude/AIFred-Pro/.claude/jobs/state/nexus-settings.json')); print([k for k,v in d['job_overrides'].items() if v.get('enabled') is False])"
```

Expected: list of 13 job names.

### Layer 3: Close all open tasks via Pulse API (drain the queue)

```bash
docker exec aifred-postgres psql -U pulse -d pulse -A -t -c "SELECT id FROM tasks WHERE status='open';" | while read tid; do
  if [ -n "$tid" ]; then
    curl -sf -X POST "http://localhost:8700/api/v1/tasks/$tid/close" \
      -H 'content-type: application/json' \
      -d '{"close_reason":"halted-by-operator-YYYY-MM-DD: <reason>"}' \
      -o /dev/null -w "$tid HTTP %{http_code}\n"
  fi
done
```

Verify: `curl -sf http://localhost:8600/api/health | python3 -m json.tool` shows `tasks.openCount: 0`. Total task count preserved (closed != deleted).

---

## Reversal procedure

To restore PROD operation:

```bash
# Layer 1 reverse: load dispatcher
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.aion.nexus-dispatcher.plist

# Layer 2 reverse: re-enable jobs (PATCH each with {"enabled": true} or DELETE the override)
for job in <list of jobs>; do
  curl -sf -X PATCH "http://localhost:8600/api/nexus-settings/job-overrides/$job" \
    -H 'content-type: application/json' -d '{"enabled": true}'
done

# Layer 3 reverse: closed tasks can be reopened individually via the dashboard UI
# or via PATCH /api/v1/tasks/{id} with {"status":"open"}.
```

Reversal must be coordinated with: (a) David, since AIFred-Pro is his primary archon; (b) verification that the underlying cause of the halt has been repaired.

---

## What this runbook does NOT do

- Does NOT touch Alfred-Dev launchd plists (those weren't loaded — `com.aion.nexus-dev-*` are inert)
- Does NOT touch David's separate machine (his launchd is independent of ours)
- Does NOT decommission `com.aion.anthropic-proxy` (PID 97735, orphan from old `:8877` proxy) — separate hygiene matter
- Does NOT touch `com.aion.david-nexus-sync-fetch` (6h git fetch, no LLM calls — not a leak source)
- Does NOT delete tasks (only closes them; full history preserved in `tasks` table)

---

## Provenance

This runbook codifies the halt sequence executed on **2026-05-06** during the task-executor baseline-creep investigation. Root cause: pre_check filter too coarse + `every_hours: 0.25` runtime override on `task-executor` (set by dashboard 2026-04-23) caused 19 wasted evaluations × $0.35-$0.64 ≈ ~$8 / 5h-window of background spend (~22% of session budget).

Investigation artifact: `Shared_Projects/Debriefs/AIFred-Pro/2026-05-06-task-executor-leak-investigation.md`.

Repair fixes applied subsequently: A (pre_check mirror) + B (per-task attempt budget) in Alfred-Dev `executor.py`; C (Jarvis cost-anomaly watcher) in Jarvis. See debrief for full detail.
