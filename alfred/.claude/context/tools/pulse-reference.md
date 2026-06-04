# Pulse — Task Service Reference

**Pulse** is the unified task management API (replaces legacy Beads). It provides task CRUD, label enforcement (mutex, deprecated, gate-stage), named transitions, pipeline triggers, message bus, job state, and settings — all backed by PostgreSQL.

## Quick Reference

| What | Where |
|------|-------|
| API | `${PULSE_URL:-http://localhost:8700}/api/v1` (host) or `http://pulse:8700/api/v1` (Docker) |
| CLI | `pulse` command (Python, wraps HTTP API) |
| Database | PostgreSQL `pulse` schema in `postgres-unified` |
| Container | `pulse` (port 8700) |
| Code | Your Pulse installation |
| Config files | `label-taxonomy.yaml` + `routing-rules.yaml` (mounted read-only) |

## CLI Commands

```bash
pulse list [--status S] [--label L] [--json] [--limit N] [--workspace W]
pulse show TASK_ID [--json]
pulse create TITLE [-p PRIORITY] [-l LABELS] [-d DESC] [-t TYPE] [--workspace W]
pulse update TASK_ID [--status S] [--priority N] [--claim] [--notes TEXT] [--append-notes TEXT] [--assignee A]
pulse close TASK_ID --reason REASON
pulse label add TASK_ID LABEL
pulse label remove TASK_ID LABEL
pulse transition TASK_ID SCENARIO --source SOURCE
pulse stage TASK_ID NEW_STAGE --source SOURCE
pulse ready [--json]
pulse comments add TASK_ID COMMENT
pulse defer TASK_ID --until DATE
```

All CLI commands accept `--json` for machine-readable output and `--actor` for audit trail attribution.

**Workspace parameter**: `--workspace` (alias: `--project`) selects the task namespace. This is distinct from `project:*` labels which identify the specific initiative. See label-taxonomy.yaml for the naming convention.

## API Endpoints

### Tasks
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/tasks` | Create task |
| `GET` | `/tasks` | List with filters: status, priority, label, stage, workspace (alias: project), search, sort, limit, offset |
| `GET` | `/tasks/{id}` | Get single task with labels |
| `PATCH` | `/tasks/{id}` | Update fields (status, priority, assignee, notes, append_notes, claim, defer_until) |
| `POST` | `/tasks/{id}/close` | Close with reason |
| `GET` | `/tasks/ready` | Ready queue (stage:queue + auto:ready + no blockers) |
| `GET` | `/tasks/stats` | Aggregates by status, priority, domain, workspace (by_workspace + legacy by_project), stage |

### Labels & Transitions
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/tasks/{id}/labels` | Add label(s) — validates deprecated, enforces mutex |
| `DELETE` | `/tasks/{id}/labels/{label}` | Remove label |
| `POST` | `/tasks/{id}/transition` | Named transition (approve, modify, pause, claim, etc.) |
| `POST` | `/tasks/{id}/stage` | Atomic stage transition + trigger emit |

### Comments
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/tasks/{id}/comments` | List comments |
| `POST` | `/tasks/{id}/comments` | Add comment |

### Events
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/events` | Query by task_id, event_type, since_id, actor, limit |
| `GET` | `/events/stream` | SSE real-time event stream |

### Pipeline Triggers
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/triggers/emit` | Emit trigger (handler resolution + batch dedup) |
| `POST` | `/triggers/{id}/claim` | Claim trigger |
| `POST` | `/triggers/{id}/complete` | Mark completed |
| `POST` | `/triggers/{id}/fail` | Mark failed |
| `POST` | `/triggers/claim-handler` | Claim all pending for handler |
| `GET` | `/triggers/pending` | Pending summary |

### Messages, Jobs, Settings
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/messages` | Send message |
| `GET` | `/messages/pending` | Ready for delivery |
| `GET/PATCH` | `/jobs/{name}` | Job state |
| `GET/PUT` | `/settings/{key}` | Settings with audit trail |

### System
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + DB connectivity |
| `GET` | `/taxonomy` | Label taxonomy as JSON |
| `POST` | `/export/jsonl` | JSONL export for git backup |

## Label System

Labels are defined in `label-taxonomy.yaml`. Pulse enforces:

- **Deprecated rejection**: Deprecated labels return 422 with replacement info
- **Mutex enforcement**: Adding a label auto-removes conflicting labels from the same mutex group
- **Gate-stage validation**: Warns when gate labels appear at wrong pipeline stage
- **Audit trail**: Every label mutation logged to `task_events` table

### Named Transitions

Use `POST /tasks/{id}/transition` with `scenario` field:

| Scenario | Effect |
|----------|--------|
| `approve` | Add pipeline:approved + auto:ready + stage:queue; remove blocking labels |
| `modify` | Send back to stage:evaluate for re-evaluation |
| `pause` | Add parked; remove all pipeline labels |
| `cancel` | Close task |
| `claim` | Set status=in_progress; add stage:execute |
| `complete` | Close task; remove stage labels |
| `dispatch` | Add stage:execute; remove stage:queue + auto:ready |
| `evaluate` | Add stage:evaluate; remove stage:intake |
| `executor-fail` | Add parked + stage:review; remove stage:execute |

All transitions are atomic (single DB transaction) with full mutex enforcement.

## Workspace vs Project

The API uses "workspace" for the task namespace and "project" for the `project:*` label (initiative/product). Both `?workspace=` and `?project=` query params are accepted (project is a legacy alias). The response includes both `workspace` and `project` fields (identical values). See `label-taxonomy.yaml` for the full naming convention.

## Migration from Beads

Pulse replaces: `bd` CLI, `.beads/` data files, `nexus.db` (triggers/messages/jobs), `label-ops.sh` mutex logic, `feedback.jsonl`, `approved-actions.jsonl`, `nexus-settings.json`.

Pulse does NOT replace: dispatcher.sh, executor.sh, persona system, registry.yaml, dashboard frontend, orchestration YAML files.
