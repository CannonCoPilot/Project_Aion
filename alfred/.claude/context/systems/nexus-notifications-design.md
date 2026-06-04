# Nexus Notifications — First-Class Event Design

**Task**: AIProjects-fyer
**Research date**: 2026-03-09
**Status**: Design research (not implemented)

---

## Current Architecture (Observed)

### Notification Flow
```
executor.sh → write_notification() → msgbus.sh send → nexusdb.py (SQLite)
                                                              ↓
                                                    relay.sh → Telegram
```

- `write_notification()` writes `job_completed` or `job_failed` events to the message bus
- Event payload: `{ job, title, summary, details, exit_code, cost_usd, duration_secs, output_file, engine, model_usage }`
- **Missing**: `task_id` / `beads_task_id` — notifications don't know which Pulse task was being processed
- Relay subscribes to the bus and delivers to Telegram; event-watcher.sh watches `.beads/events.jsonl` separately

### max_turns Failure (The Root Problem)
- `executor.sh:912-923`: detects `error_max_turns` subtype in Claude output
- Logs "hit max turns limit" locally, updates `RESPONSE` with a fallback message
- **Does NOT**: update the Pulse task, include task_id in notification, or emit a distinct event type
- The downstream notification just says `"task-executor completed"` with no hint of which task failed

### quiet_hours Config (in `registry.yaml`)
```yaml
quiet_hours:
  timezone: "America/Denver"
  weekday: { start: 22, end: 7 }
  weekend: { start: 23, end: 9 }
  severity_bypass: [critical]
  batch_release: true
```
Preference data lives in `registry.yaml`. Relay reads it at delivery time.

---

## Key Questions — Answers

### 1. Right event schema for notification events?

Add `task_id` and `event_subtype` fields to the existing `job_completed`/`job_failed` schema:

```json
{
  "job": "task-executor",
  "task_id": "AIProjects-hctr",        // NEW: Pulse task being processed
  "event_subtype": "max_turns",         // NEW: refinement of job_failed
  "title": "task-executor: max_turns",
  "summary": "AIProjects-hctr hit max turns (12). Marked waiting:david.",
  "exit_code": 1,
  "cost_usd": "1.23",
  "duration_secs": 180
}
```

**New event subtypes to add**:
- `pipeline.max_turns` — executor hit max turns on a specific task
- `pipeline.failed` — executor explicitly failed/errored on a task
- `pipeline.paused` — executor emitted PAUSE signal
- `pipeline.completed` — executor closed a task successfully (optional, could stay as job_completed)

### 2. How should delivery channels subscribe?

**Short answer**: Relay remains the single delivery layer. Channels subscribe via relay config, not independently.

The current relay → Telegram flow is correct architecturally. The problem is that relay doesn't know *which task* failed. Fix: pass `task_id` in the event data. Relay can then include it in the Telegram message template.

**Future channels** (email, dashboard): add routing rules in relay config that filter by `event_type` or `severity`. Don't make Telegram a special-cased subscriber — keep relay as the single routing layer.

### 3. Interaction with existing quiet_hours?

`quiet_hours` lives in `registry.yaml` and is read by relay. No changes needed to the config structure. The new event types (`pipeline.max_turns`, `pipeline.failed`) should default to `severity: warning` so they respect quiet hours. Use `severity: critical` only for infrastructure failures.

**Recommendation**: keep `quiet_hours` in `registry.yaml`. It's the right place — it's a delivery preference, not a pipeline concern.

### 4. Notification preferences — registry.yaml or separate config?

**Keep in `registry.yaml`**. Rationale:
- It's already the single source of truth for Nexus config
- Adding a separate file increases cognitive overhead without benefit
- Future: add `notification_preferences:` section to registry.yaml for per-channel routing rules (e.g., `channel: telegram, filter_severity: [warning, critical]`)

### 5. Minimum viable version?

**Phase 1 (quick win, minimal code)**:
1. Add `task_id` param to `write_notification()` in `executor.sh`
2. Pass `BEADS_TASK_ID` (already set during PAUSE/review flows) into max_turns and failure notifications
3. Update `write_notification()` data payload to include `task_id` field
4. Update relay's Telegram template to include task_id when present
5. In `executor.sh` max_turns handler: `pulse update "$TASK_ID" --add-label "waiting:david"` and append note

**Phase 2 (event bus integration)**:
6. Add `pipeline.max_turns` and `pipeline.failed` event types to msgbus schema
7. event-watcher.sh (or a new pipeline-watcher) subscribes to these bus events and auto-updates Pulse
8. This closes the loop: executor → bus → watcher → Pulse (no more manual `pulse update` scattered in executor)

**Phase 3 (full notification-as-event)**:
9. Relay becomes a pure subscriber: reads event bus, applies routing rules, delivers to channels
10. Quiet hours, batching, channel routing all live in registry.yaml `notification_preferences:`
11. Telegram, dashboard, email are interchangeable delivery plugins

---

## Implementation Roadmap

### Phase 1 — Quick Win (1-2 hrs, low risk)

Files to modify:
- `executor.sh`: add `task_id` param to `write_notification()`; pass it in failure/max_turns/PAUSE paths
- `executor.sh`: in max_turns handler, add `pulse update "$BEADS_TASK"` call (similar to existing PAUSE handler at line ~1002)
- relay delivery template: include task_id in Telegram message if present

The executor already has `PAUSE_TASK_ID` handling (line 1002-1003) as a pattern to follow.

### Phase 2 — Pipeline Event Types (2-3 hrs, medium)

New msgbus event types:
```bash
msgbus.sh send --type pipeline.max_turns --source "headless:task-executor" \
  --severity warning \
  --data '{"task_id": "AIProjects-xxx", "turns": 12, "job": "task-executor"}'
```

Add pipeline-watcher component (or extend event-watcher.sh) to:
- Subscribe to `pipeline.max_turns` events
- Automatically run `pulse update <task_id> --add-label "waiting:david" --append-notes "..."

### Phase 3 — Full Model (4-6 hrs, architectural)

Registry.yaml addition:
```yaml
notification_preferences:
  channels:
    - name: telegram
      filter: { severity: [warning, critical] }
      template: "{{ title }}\n{{ summary }}\nTask: {{ task_id }}"
    - name: dashboard
      filter: { severity: [info, warning, critical] }
  routing:
    pipeline.max_turns: [telegram, dashboard]
    pipeline.failed: [telegram]
    job_completed: [dashboard]
```

---

## Prerequisite Check

Task notes: "Don't implement until Nexus foundation work is complete."

Current Nexus stability indicators:
- msgbus.sh and nexusdb.py are the stable SQLite-backed bus ✓
- Relay has migrated from dual-write to single-bus read ✓
- Phase 1 (quick win) is safe to implement now — only modifies executor notification calls, not core bus schema
- Phase 2+ should wait for Nexus foundation review

**Recommendation**: Implement Phase 1 immediately as a safe quick win. Schedule Phase 2 as a follow-up task after confirming Nexus foundation is stable.

---

## Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `.claude/jobs/executor.sh` | Add `task_id` param to `write_notification()` (line 187); pass in failure paths; `pulse update` on max_turns |
| `.claude/jobs/lib/` (relay) | Update Telegram message template to include task_id |

Estimated Phase 1 effort: ~1.5 hours
