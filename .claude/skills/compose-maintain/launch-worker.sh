#!/bin/bash
# compose-maintain/launch-worker.sh — v1.0 (2026-05-12)
#
# Spawns an ephemeral Claude worker in a tmux window (with ANTHROPIC_BASE_URL
# unset) to execute compose down → repair → compose up sequences against the
# dev stack. Polls the worker's status JSON; tears down on completion or
# timeout.
#
# DO NOT `set -euo pipefail` — bash-gotchas: grep exit 1 kills the script.

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRATCH_DIR="/Users/nathanielcannon/Claude/Project_Aion/.claude/scratch"
TMUX_BIN="$HOME/bin/tmux"
LOCK_DIR="$SCRATCH_DIR/compose-maintain.lock"
POLL_INTERVAL=3

usage() {
  cat <<EOF
Usage: $(basename "$0") <recipe> [options]

Spawns an ephemeral Claude worker in a tmux window to execute a compose
maintenance recipe. The worker runs with ANTHROPIC_BASE_URL unset so it can
safely take :9800 (usage-proxy) offline.

Arguments:
  recipe          Recipe name in recipes/ (without .json) OR absolute path
                  to a recipe JSON file.

Options:
  --keep-alive          Don't auto-kill worker tmux window on exit
                        (useful for post-mortem inspection)
  --timeout <s>         Override recipe timeout (default: read from recipe,
                        fallback 600s)
  --dry-run             Validate recipe + render prompt; don't spawn worker
  --window-name <n>     Name the worker tmux window (default: maintain-<recipe>)
  --poll-interval <s>   Status polling cadence (default: 3s)

Exit codes:
  0  recipe completed successfully
  1  usage / recipe not found / invalid args
  2  lock acquisition failed (another worker active)
  3  worker reported failure (see status file)
  4  timeout (worker did not reach terminal phase within timeout)
EOF
}

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$LOCK_DIR/owner"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$LOCK_DIR/acquired_at"
    return 0
  fi
  return 1
}

release_lock() {
  rm -rf "$LOCK_DIR" 2>/dev/null
}

WORKER_WINDOW=""
KEEP_ALIVE=0

cleanup() {
  release_lock
  if [[ -n "$WORKER_WINDOW" ]] && [[ "$KEEP_ALIVE" != "1" ]]; then
    "$TMUX_BIN" kill-window -t "$WORKER_WINDOW" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# Worker prompt template — substituted with recipe and status paths at runtime.
render_prompt() {
  local recipe_path="$1" status_path="$2"
  cat <<EOPROMPT
You are an ephemeral Jarvis maintenance worker (claude --print mode).

ROUTING: You launched with ANTHROPIC_BASE_URL unset; you route direct to
api.anthropic.com. Cost telemetry is skipped for this run — accepted trade-off
because the dev usage-proxy at :9800 may be offline during your work.

TASK: Execute the compose-maintain recipe end-to-end.

RECIPE_PATH: $recipe_path
STATUS_PATH: $status_path

PROTOCOL (sequential; write status after each phase):

1. Read the recipe at RECIPE_PATH (valid JSON, absolute paths only). If
   malformed, write status {phase:"failed", error:"recipe-parse: <reason>"};
   exit.

2. Write status: {phase:"preflight", started_at:"<ISO-UTC>"}

3. Preflight checks from recipe.preflight:
   - For each path in expected_dir / no_dir_exists, check existence
   - For each container in expected_containers_up: run
     \`/usr/local/bin/docker inspect -f '{{.State.Health.Status}}' <name>\`
     (or /opt/homebrew/bin/docker if /usr/local/bin missing). Must be "healthy".
   - If any check fails: status {phase:"failed", error:"preflight: <which>"};
     exit. Do NOT proceed.

4. Write status: {phase:"down"}.
   Run from recipe.down.project_dir:
   \`docker compose -f <each compose_file> down\`
   (use absolute path to docker; compose project name derives from cwd).
   On failure: write {phase:"failed", error:"down: <stderr>"}; exit.

5. For each repair in recipe.repairs[] (sequential, index from 0):
   Write status: {phase:"repair", step:<i>, action:"<type>"}.
   Execute by type:
   - "shell": run cmd via /bin/bash -c "<cmd>"; check exit code
   - "sed-in-place": for each file in files[], run
     \`sed -i '' "s|<pattern>|<replacement>|g" <file>\`
   - "audit-paths": run \`grep -rln "<pattern>" <in>\` — if
     expect_zero_matches is true and matches > 0, fail this step.
   On any repair failure:
   - Write {phase:"failed", step:<i>, error:"<details>"}.
   - If recipe.rollback.on_repair_failure exists, execute it via bash -c.
   - exit.

6. Write status: {phase:"up"}.
   Run from recipe.up.project_dir:
   \`docker compose -f <each compose_file> up -d\`
   On failure: write {phase:"failed", error:"up: <stderr>"};
   if recipe.rollback.on_up_failure exists, execute it; exit.

7. Write status: {phase:"wait_healthy"}.
   For each container in recipe.up.wait_for_healthy[]:
   - Poll \`docker inspect -f '{{.State.Health.Status}}' <name>\` every 5s
   - Wait up to 120s per container
   - On timeout: write {phase:"failed", error:"healthy-wait: <name>"}; exit.

8. Write status: {phase:"validate"}.
   - For each port in recipe.validate.ports_listening[]: run
     \`/usr/sbin/lsof -iTCP:<port> -sTCP:LISTEN -P -n | grep -q LISTEN\`
     — must return 0.
   - For each (name,status) in recipe.validate.container_status: run
     \`docker inspect -f '{{.State.Health.Status}}' <name>\` — must match.
   On any validate failure: write {phase:"failed", error:"validate: <which>"};
   exit. Do NOT attempt rollback (stack is up; just flagged).

9. Write status: {phase:"complete", finished_at:"<ISO-UTC>",
     summary:"<n_repairs> repairs; <n_containers> healthy"}.

CONSTRAINTS:
- ALL paths absolute. Never construct relative paths.
- Use $HOME/bin/tmux for any tmux ops (never bare "tmux").
- Use absolute docker path. Try /usr/local/bin/docker first, fall back to
  /opt/homebrew/bin/docker.
- DO NOT prompt the user (you are unattended, no stdin).
- DO NOT modify files outside the recipe's project_dir.
- DO NOT push to any git remote.
- Write each status update as the SOLE content of STATUS_PATH (overwrite,
  don't append). Use Write tool.

REPAIR DETAILS:
- "shell": cmd field is bash; quote carefully. Caller is responsible for safety.
- "sed-in-place": uses BSD sed (macOS); the empty '' arg after -i is correct.
- "audit-paths": expect_zero_matches=true means the grep should find nothing
  after repairs (use to verify a sed pass was complete).

Begin executing now.
EOPROMPT
}

# --- Main ---

[[ $# -lt 1 ]] && { usage; exit 1; }

RECIPE_ARG="$1"; shift
TIMEOUT_OVERRIDE=""
DRY_RUN=0
WINDOW_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-alive)      KEEP_ALIVE=1; shift ;;
    --timeout)         TIMEOUT_OVERRIDE="$2"; shift 2 ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --window-name)     WINDOW_NAME="$2"; shift 2 ;;
    --poll-interval)   POLL_INTERVAL="$2"; shift 2 ;;
    -h|--help)         usage; exit 0 ;;
    *)                 echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

# Resolve recipe path
if [[ "$RECIPE_ARG" == /* ]]; then
  RECIPE_PATH="$RECIPE_ARG"
elif [[ -f "$SKILL_DIR/recipes/$RECIPE_ARG.json" ]]; then
  RECIPE_PATH="$SKILL_DIR/recipes/$RECIPE_ARG.json"
else
  echo "Error: recipe not found: $RECIPE_ARG" >&2
  echo "       Looked at: $SKILL_DIR/recipes/$RECIPE_ARG.json" >&2
  exit 1
fi
[[ -f "$RECIPE_PATH" ]] || { echo "Error: recipe file missing: $RECIPE_PATH" >&2; exit 1; }

# Validate JSON
if ! python3 -c "import json; json.load(open('$RECIPE_PATH'))" 2>/dev/null; then
  echo "Error: recipe is not valid JSON: $RECIPE_PATH" >&2
  exit 1
fi

RECIPE_NAME="$(basename "$RECIPE_PATH" .json)"
[[ -z "$WINDOW_NAME" ]] && WINDOW_NAME="maintain-$RECIPE_NAME"

STATUS_PATH="$SCRATCH_DIR/compose-maintain-$RECIPE_NAME.status.json"
LOG_PATH="$SCRATCH_DIR/compose-maintain-$RECIPE_NAME.log"
PROMPT_PATH="$SCRATCH_DIR/compose-maintain-$RECIPE_NAME.prompt.txt"

mkdir -p "$SCRATCH_DIR"

# Render prompt
render_prompt "$RECIPE_PATH" "$STATUS_PATH" > "$PROMPT_PATH"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY-RUN — recipe: $RECIPE_PATH"
  echo "         status:  $STATUS_PATH"
  echo "         log:     $LOG_PATH"
  echo "         prompt:  $PROMPT_PATH ($(wc -l < "$PROMPT_PATH") lines)"
  echo "         window:  $WINDOW_NAME (would be: jarvis:$WINDOW_NAME)"
  exit 0
fi

# Acquire lock
if ! acquire_lock; then
  echo "Error: another worker is active." >&2
  echo "       Lock: $LOCK_DIR" >&2
  echo "       Owner PID: $(cat $LOCK_DIR/owner 2>/dev/null)" >&2
  echo "       Acquired: $(cat $LOCK_DIR/acquired_at 2>/dev/null)" >&2
  echo "       If stuck: rm -rf $LOCK_DIR" >&2
  exit 2
fi

# Initialize status file
cat > "$STATUS_PATH" <<EOF
{"phase": "launching", "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "recipe": "$RECIPE_NAME"}
EOF

# Determine timeout
TIMEOUT="$TIMEOUT_OVERRIDE"
if [[ -z "$TIMEOUT" ]]; then
  TIMEOUT=$(python3 -c "import json; r=json.load(open('$RECIPE_PATH')); print(r.get('timeout_seconds', 600))" 2>/dev/null)
  [[ -z "$TIMEOUT" ]] && TIMEOUT=600
fi

# Build worker command. Worker finish command: kill the window unless --keep-alive.
if [[ "$KEEP_ALIVE" == "1" ]]; then
  WORKER_FINISH="echo '--- worker exited; window kept alive (--keep-alive) ---'"
else
  WORKER_FINISH="$TMUX_BIN kill-window"
fi

WORKER_CMD="cd /Users/nathanielcannon/Claude/Project_Aion && env -u ANTHROPIC_BASE_URL claude --print \"\$(cat $PROMPT_PATH)\" > $LOG_PATH 2>&1; $WORKER_FINISH"

# Spawn worker tmux window. New window in jarvis session, detached.
echo "Spawning worker window: jarvis:$WINDOW_NAME"
echo "  Recipe:  $RECIPE_PATH"
echo "  Status:  $STATUS_PATH"
echo "  Log:     $LOG_PATH"
echo "  Timeout: ${TIMEOUT}s"

"$TMUX_BIN" new-window -t jarvis: -n "$WINDOW_NAME" -d "$WORKER_CMD" 2>&1
SPAWN_EC=$?
if [[ $SPAWN_EC -ne 0 ]]; then
  echo "Error: tmux new-window failed (exit $SPAWN_EC). Is jarvis session running?" >&2
  exit 1
fi

WORKER_WINDOW="jarvis:$WINDOW_NAME"

# Poll status file
DEADLINE=$(($(date +%s) + TIMEOUT))
LAST_PHASE=""
LAST_REPAIR_STEP=""

while [[ $(date +%s) -lt $DEADLINE ]]; do
  if [[ -f "$STATUS_PATH" ]]; then
    PHASE=$(python3 -c "import json; d=json.load(open('$STATUS_PATH')); print(d.get('phase',''))" 2>/dev/null)
    STEP=$(python3 -c "import json; d=json.load(open('$STATUS_PATH')); print(d.get('step',''))" 2>/dev/null)
    if [[ "$PHASE" != "$LAST_PHASE" ]] || [[ "$STEP" != "$LAST_REPAIR_STEP" ]]; then
      if [[ "$PHASE" == "repair" ]] && [[ -n "$STEP" ]]; then
        echo "[$(date +%H:%M:%S)] phase=$PHASE step=$STEP"
      else
        echo "[$(date +%H:%M:%S)] phase=$PHASE"
      fi
      LAST_PHASE="$PHASE"
      LAST_REPAIR_STEP="$STEP"
    fi
    case "$PHASE" in
      complete)
        echo "Worker reported complete."
        cat "$STATUS_PATH"
        exit 0
        ;;
      failed)
        echo "Worker reported failure:" >&2
        cat "$STATUS_PATH" >&2
        echo "" >&2
        echo "Worker log tail:" >&2
        tail -30 "$LOG_PATH" 2>&1 | sed 's/^/  | /' >&2
        exit 3
        ;;
    esac
  fi
  sleep "$POLL_INTERVAL"
done

echo "Timeout after ${TIMEOUT}s. Last phase: $LAST_PHASE" >&2
echo "  Status: $STATUS_PATH" >&2
echo "  Log:    $LOG_PATH" >&2
exit 4
