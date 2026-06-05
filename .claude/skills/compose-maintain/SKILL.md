---
name: compose-maintain
description: |
  Spawn an ephemeral Claude worker in an isolated tmux window to execute compose down → repair → compose up sequences against the dev stack. Use when maintenance requires `docker compose down` against the dev stack AND the current window routes through :9800 (W0/W5 export ANTHROPIC_BASE_URL=http://localhost:9800 for cost telemetry; bringing :9800 down from W0 blinds W0). Worker runs with ANTHROPIC_BASE_URL unset, routes direct to api.anthropic.com (no telemetry), tears down its own tmux window on exit.
when_to_invoke: |
  - dev-stack maintenance, "compose down", "rebuild dev stack"
  - topology migrations (directory rename + sed across compose / plist / .env)
  - multi-container restart cycles or volume/network recreate sequences
  - any time docker compose down would take :9800 with it and you're routed through it
when_not_to_invoke: |
  - single-container ops (use `docker compose up -d --no-deps --force-recreate <svc>` directly from W0)
  - prod stack ops (PROD containers don't run through :9800)
  - one-off shell commands
---

# compose-maintain — Dev Stack Maintenance via Ephemeral Claude Worker

## Why this skill exists

W0 (Jarvis tmux pane) and W5 (Jarvis-dev) launch with `ANTHROPIC_BASE_URL=http://localhost:9800` per `launch-jarvis-tmux.sh:467` so all Claude API traffic routes through `aifred-dev-usage-proxy` for cost telemetry attribution to Pulse. **Side effect**: any `docker compose down` of the dev stack from W0 kills its own API path — Claude can't reach the API to continue, and you lose mid-command state.

This skill spawns an ephemeral Claude worker in a fresh tmux window with `ANTHROPIC_BASE_URL` unset. The worker can take :9800 offline, do its work, bring it back, and self-cleanup — all without affecting W0's session.

## Architecture

```
W0 (you)                          worker tmux window (ephemeral)
  │
  │  bash launch-worker.sh <recipe>
  │      │
  │      ├─ acquire lock (mkdir scratch/compose-maintain.lock)
  │      ├─ render prompt template + recipe path
  │      ├─ spawn:  tmux new-window -d -n maintain-<recipe> \
  │      │           "cd ~/Claude/Project_Aion && \
  │      │            env -u ANTHROPIC_BASE_URL \
  │      │            claude --print '<prompt>' > <log>; \
  │      │            tmux kill-window"
  │      │                                            ╭──────────────────────╮
  │      │                                            │ Claude worker:        │
  │      │                                            │  1. Read recipe.json  │
  │      │                                            │  2. Preflight checks  │
  │      │                                            │  3. compose down      │
  │      │                                            │  4. apply repairs[]   │
  │      │                                            │  5. compose up        │
  │      │                                            │  6. health-wait       │
  │      │                                            │  7. validate          │
  │      │                                            │  8. write status      │
  │      │                                            │  9. exit              │
  │      │                                            ╰──────────────────────╯
  │      │                                                      │
  │      ├─ poll status.json every 3s                          ↓
  │      │   ←──────── status.json phase updates ────────────────
  │      │
  │      ├─ on complete/failed: release lock, report
  │      └─ on timeout: release lock, report stale phase
  │
  └─ exit code propagates worker outcome
```

## Invocation

### Direct invocation (works any time)
```bash
bash /Users/nathanielcannon/Claude/Project_Aion/.claude/skills/compose-maintain/launch-worker.sh <recipe>
```

### Via Skill tool (after capability-map registration + session restart)
```
Skill compose-maintain <recipe>
```

## Recipe schema

Recipes live in `recipes/<name>.json`. Schema:

```json
{
  "name": "human-readable-name",
  "preflight": {
    "expected_dir": "/absolute/path/that/must/exist",
    "no_dir_exists": "/absolute/path/that/must/NOT/exist",
    "expected_containers_up": ["container-name-1", "container-name-2"]
  },
  "down": {
    "project_dir": "/absolute/path/to/compose/dir",
    "compose_files": ["docker-compose.yml", "docker-compose.dev.yml"]
  },
  "repairs": [
    {"type": "shell",         "cmd": "<bash command>"},
    {"type": "sed-in-place",  "files": ["/abs/path"], "pattern": "AIFred", "replacement": "Alfred"},
    {"type": "audit-paths",   "in": "/abs/path", "pattern": "AIFred", "expect_zero_matches": true}
  ],
  "up": {
    "project_dir": "/absolute/path/to/compose/dir",
    "compose_files": ["docker-compose.yml", "docker-compose.dev.yml"],
    "wait_for_healthy": ["container-name-1", "container-name-2"]
  },
  "validate": {
    "ports_listening": [9800, 8800, 8701],
    "container_status": {"container-name": "healthy"}
  },
  "timeout_seconds": 600,
  "rollback": {
    "on_repair_failure": "<bash command to revert to pre-down state>",
    "on_up_failure": "<bash command if compose up fails>"
  }
}
```

## Status protocol

The worker writes JSON to `scratch/compose-maintain-<recipe>.status.json`. Phases:

| Phase | Meaning |
|---|---|
| `launching` | W0 has acquired lock; worker hasn't started yet |
| `preflight` | Worker validating pre-conditions |
| `down` | Running `docker compose down` |
| `repair` | Applying repair step N |
| `up` | Running `docker compose up -d` |
| `wait_healthy` | Polling container health |
| `validate` | Running validate checks |
| `complete` | All steps successful; W0 can release lock |
| `failed` | A step failed; worker may have rolled back; W0 must investigate |

## Recovery

If the worker hangs or crashes mid-flight:

```bash
# 1. Check status
cat /Users/nathanielcannon/Claude/Project_Aion/.claude/scratch/compose-maintain-<recipe>.status.json

# 2. Check worker log
tail -50 /Users/nathanielcannon/Claude/Project_Aion/.claude/scratch/compose-maintain-<recipe>.log

# 3. Force-release the lock (last resort)
rm -rf /Users/nathanielcannon/Claude/Project_Aion/.claude/scratch/compose-maintain.lock

# 4. Manually restore the stack
cd <project_dir>
/usr/local/bin/docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Recipes (catalog)

| Recipe | Purpose | Typical runtime |
|---|---|---|
| `topology-rename-alfred` | Topology migration: `Alfred-Dev` → `Alfred-Dev` directory rename + path sed | ~3-5 min |
| (add more as needed) | | |

## Safety

- **Single-worker invariant**: `mkdir`-based atomic lock prevents concurrent workers; second invocation fails fast with exit 2.
- **Pre-flight gates**: recipe-declared expected state must match actual state before `down` fires. Mismatches abort early.
- **Rollback semantics**: recipes can declare `rollback.on_repair_failure` and `rollback.on_up_failure` — worker executes these on failure.
- **Trap cleanup**: launch-worker.sh `trap cleanup EXIT` releases lock and (unless `--keep-alive`) kills worker window.
- **Worker isolation**: worker has unset `ANTHROPIC_BASE_URL` only; all other env (HOME, PATH, etc.) is inherited.

## Cost note

Worker runs with `ANTHROPIC_BASE_URL` unset → cost telemetry **does NOT** flow into `aifred-dev-usage-proxy` for this run. Accepted trade-off: maintenance runs are infrequent; usage data on them is not load-bearing. If telemetry parity becomes important, route worker through PROD's `:8877` (currently flagged as orphaned in `Jarvis/projects/project-aion/designs/project-aion-workstream-architecture-2026-05-05.md` §6.2).

## Future extensions

- **Bash-mode worker**: for recipes with no judgment branches, swap `claude --print` for a bash script in the same window. ~10x faster, $0 cost. Recipe schema field: `"mode": "bash" | "claude"`.
- **Multi-stack support**: recipes currently target one project_dir; could batch multiple projects.
- **Recipe linting**: pre-flight JSON schema validation before spawning.
- **Auto-rollback verification**: confirm post-rollback state matches pre-flight state.

