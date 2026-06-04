#!/bin/bash
# event-watcher.sh - Reactive event watcher for the task pipeline
#
# Part of the Nexus system. Two responsibilities:
# 1. Project advancement — calls Pulse API /projects/advance-all every cycle
# 2. Event processing — reads Pulse events from .beads/events.jsonl (legacy, no new writes)
#
# The JSONL event processing is vestigial — Pulse is the task backend.
# No new events are written to .beads/events.jsonl since the Pulse migration.
#
# Usage:
#   event-watcher.sh              # Normal run (check for new events since last run)
#   event-watcher.sh --status     # Show watcher state
#   event-watcher.sh --reset      # Reset cursor to current end of file
#
# Cron entry (every 2 minutes):
#   */2 * * * * ${PROJECT_DIR}/.claude/jobs/event-watcher.sh >> ${PROJECT_DIR}/.claude/logs/headless/event-watcher.log 2>&1
#
# Design: Lightweight bash — reads file offset, checks new lines, triggers jobs.
# No LLM cost. Typical run: <100ms.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Phase 5.8 (8x3r): Set NEXUS_THREAD_ID for audit correlation.
# event-watcher runs independently (cron, not via dispatcher), so it must self-generate.
if [ -z "${NEXUS_THREAD_ID:-}" ]; then
    NEXUS_THREAD_ID="$(date -u +%s)-$$-${RANDOM}"
    export NEXUS_THREAD_ID
fi

EVENTS_FILE="$PROJECT_DIR/.beads/events.jsonl"
STATE_DIR="$SCRIPT_DIR/state"
CURSOR_FILE="$STATE_DIR/event-watcher-cursor"
LOCK_FILE="$STATE_DIR/locks/event-watcher.lock"
DISPATCHER="$SCRIPT_DIR/dispatcher.sh"
MSGBUS="$SCRIPT_DIR/lib/msgbus.sh"
LOG_DIR="$PROJECT_DIR/.claude/logs/headless"

# Ensure user-local binaries and nvm/node tools are available in cron's minimal PATH
export PATH="$HOME/.local/bin:$PATH"

# Enforce proxy routing for all child claude -p calls
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://localhost:9800}"
if [ -d "$HOME/.nvm/versions/node" ]; then
    NODE_BIN=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name bin -type d 2>/dev/null | head -1)
    [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

# Shared utilities
# shellcheck disable=SC2034
LOG_COMPONENT="event-watcher"
source "$SCRIPT_DIR/lib/common.sh" || { echo "ERROR: common.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/label-ops.sh" || { echo "ERROR: label-ops.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/nexus-settings.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/pulse-api.sh" || { echo "ERROR: pulse-api.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/pulse-env.sh" || { echo "ERROR: pulse-env.sh not found" >&2; exit 1; }

# ============================================================================
# Functions
# ============================================================================

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
}

get_cursor() {
    if [ -f "$CURSOR_FILE" ]; then
        cat "$CURSOR_FILE"
    else
        echo "0"
    fi
}

set_cursor() {
    echo "$1" > "$CURSOR_FILE"
}

acquire_watcher_lock() {
    mkdir -p "$(dirname "$LOCK_FILE")"
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 1  # Still running
        fi
        rm -f "$LOCK_FILE"  # Stale lock
    fi
    echo $$ > "$LOCK_FILE"
    return 0
}

release_watcher_lock() {
    rm -f "$LOCK_FILE"
}

# Check if a line represents a task close event
is_task_closed() {
    local line="$1"
    echo "$line" | jq -e '.event_type == "closed"' >/dev/null 2>&1
}

# Strip stale blocker labels from a closed task
# These labels are pipeline state — meaningless once a task is done
strip_blocker_labels() {
    local task_id="$1"
    label_transition "$task_id" "close-strip-blockers" "event-watcher"
}

# Check if a line represents a task creation event
# Pulse events.jsonl format: {"id":N, "issue_id":"AIProjects-xxx", "event_type":"created", "actor":"...", "created_at":"..."}
is_task_created() {
    local line="$1"
    echo "$line" | jq -e '.event_type == "created"' >/dev/null 2>&1
}

# Check if a line represents a pipeline-relevant label change
is_pipeline_label_event() {
    local line="$1"
    echo "$line" | jq -e '
        .event_type == "label_added" and
        (.comment | test("pipeline:|auto:|waiting:david"))
    ' >/dev/null 2>&1
}

# Check if a line represents a pipeline:approved label being added
is_pipeline_approved() {
    local line="$1"
    echo "$line" | jq -e '
        .event_type == "label_added" and
        (.comment | test("pipeline:approved"))
    ' >/dev/null 2>&1
}

# Extract task ID from event line
get_task_id() {
    local line="$1"
    echo "$line" | jq -r '.issue_id // "unknown"' 2>/dev/null
}

# ============================================================================
# Commands
# ============================================================================

show_status() {
    echo ""
    echo "Event Watcher Status"
    echo "===================="
    local cursor
    cursor=$(get_cursor)
    local total_lines=0
    [ -f "$EVENTS_FILE" ] && total_lines=$(wc -l < "$EVENTS_FILE")
    local pending=$((total_lines - cursor))
    [ "$pending" -lt 0 ] && pending=0

    echo "  Events file: $EVENTS_FILE"
    echo "  Total events: $total_lines"
    echo "  Cursor position: $cursor"
    echo "  Unprocessed: $pending"

    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "  Status: RUNNING (PID $pid)"
        else
            echo "  Status: STALE LOCK"
        fi
    else
        echo "  Status: idle"
    fi
    echo ""
}

reset_cursor() {
    if [ -f "$EVENTS_FILE" ]; then
        local total_lines
        total_lines=$(wc -l < "$EVENTS_FILE")
        set_cursor "$total_lines"
        log "Cursor reset to line $total_lines (end of file)"
    else
        set_cursor "0"
        log "Cursor reset to 0 (no events file)"
    fi
}

# ============================================================================
# Main
# ============================================================================

# Handle flags
case "${1:-}" in
    --status)
        show_status
        exit 0
        ;;
    --reset)
        reset_cursor
        exit 0
        ;;
    --replay)
        # Replay a specific event by ID
        # Usage: event-watcher.sh --replay <event-id>
        EVENT_ID="${2:-}"
        if [ -z "$EVENT_ID" ]; then
            echo "Usage: event-watcher.sh --replay <event-id>"
            exit 1
        fi
        if [ ! -f "$EVENTS_FILE" ]; then
            echo "No events file found"
            exit 1
        fi
        # Find the event line
        EVENT_LINE=$(jq -c "select(.id == $EVENT_ID or .id == \"$EVENT_ID\")" "$EVENTS_FILE" 2>/dev/null | head -1)
        if [ -z "$EVENT_LINE" ]; then
            echo "Event $EVENT_ID not found"
            exit 1
        fi
        TASK_ID=$(echo "$EVENT_LINE" | jq -r '.issue_id // "unknown"')
        EVENT_TYPE=$(echo "$EVENT_LINE" | jq -r '.event_type // "unknown"')
        log "REPLAY: event $EVENT_ID (type: $EVENT_TYPE, task: $TASK_ID)"

        # Re-process as if it were a new event
        if is_task_created "$EVENT_LINE"; then
            log "REPLAY: triggering task-evaluator for $TASK_ID"
            "$DISPATCHER" --run task-evaluator >> "$LOG_DIR/event-watcher.log" 2>&1 &
        elif is_pipeline_approved "$EVENT_LINE"; then
            log "REPLAY: triggering execution for approved task $TASK_ID"
            PROJECT_JSON=$(curl -s "$PULSE_API_URL/projects?limit=200" \
                -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null || echo '{}')
            REPLAY_PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r ".projects[]? | select(.config.master_task_id == \"$TASK_ID\") | .id" 2>/dev/null | head -1)
            if [ -n "$REPLAY_PROJECT_ID" ] && [ "$REPLAY_PROJECT_ID" != "null" ]; then
                log "REPLAY: executing project $REPLAY_PROJECT_ID"
                curl -s -X POST "$PULSE_API_URL/projects/$REPLAY_PROJECT_ID/execute" \
                    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
                    >> "$LOG_DIR/event-watcher.log" 2>&1 || log_warning "Failed to execute project $REPLAY_PROJECT_ID"
            else
                TASK_LABELS=$(pulse_get_task_labels "$TASK_ID" 2>/dev/null || log_warning "Failed to read task $TASK_ID")
            TASK_LABELS=$(echo "$TASK_LABELS" | grep -o 'capability:[a-z-]*' | head -1 || true)
                case "$TASK_LABELS" in
                    capability:infrastructure)
                        label_add_validated "$TASK_ID" "auto:ready" "event-watcher" || log_warning "Failed to add auto:ready for $TASK_ID"
                        "$DISPATCHER" --run task-executor-infra >> "$LOG_DIR/event-watcher.log" 2>&1 &
                        log "REPLAY: task-executor-infra dispatched for $TASK_ID"
                        ;;
                    capability:research)
                        label_transition "$TASK_ID" "intake-research-route" "event-watcher" || log_warning "Failed to update labels for $TASK_ID"
                        label_add_validated "$TASK_ID" "auto:ready" "event-watcher" || log_warning "Failed to add auto:ready for $TASK_ID"
                        "$DISPATCHER" --run task-research --param "task_id=$TASK_ID" >> "$LOG_DIR/event-watcher.log" 2>&1 &
                        log "REPLAY: task-research dispatched for $TASK_ID"
                        ;;
                    *)
                        label_add_validated "$TASK_ID" "auto:ready" "event-watcher" || log_warning "Failed to add auto:ready for $TASK_ID"
                        "$DISPATCHER" --run task-executor --param "task_id=$TASK_ID" >> "$LOG_DIR/event-watcher.log" 2>&1 &
                        log "REPLAY: task-executor dispatched for $TASK_ID (${TASK_LABELS:-default})"
                        ;;
                esac
            fi
        else
            log "REPLAY: event type '$EVENT_TYPE' has no replay handler"
        fi
        log "REPLAY complete for event $EVENT_ID"
        exit 0
        ;;
esac

# Acquire lock (prevent parallel runs)
if ! acquire_watcher_lock; then
    exit 0
fi
trap release_watcher_lock EXIT

# --- Host executor bridge: process signal-file delegation from Docker pipeline ---
if [ -f "${SCRIPT_DIR}/lib/host-executor-bridge.sh" ]; then
    bash "${SCRIPT_DIR}/lib/host-executor-bridge.sh" 2>&1 | while IFS= read -r line; do log "$line"; done
fi

# --- Always run project advancement (even without new events) ---
# This is the feedback loop that makes projects self-driving.
# Runs every cycle regardless of new Pulse events.
# Uses Pulse project API directly (replaces old dashboard orchestration endpoint).
DASHBOARD_URL="http://localhost:8600"

# --- Burn-weight pre-flight gate (P2: Intelligent Scheduling) ---
# Query Pulse for current 5hr utilization before dispatching new work.
# Thresholds: 80%=warn, 85%=skip dispatch, 90%+=critical alert.
BURN_GATE_SKIP=false
BURN_WARN_PCT=${BURN_WARN_PCT:-80}
BURN_SKIP_PCT=${BURN_SKIP_PCT:-85}
BURN_CRIT_PCT=${BURN_CRIT_PCT:-90}
BURN_GATE_COOLDOWN_FILE="${STATE_DIR}/burn-gate-last-alert"
BURN_GATE_COOLDOWN_SECS=600

_burn_util_pct() {
    local raw
    raw=$(curl -s "$PULSE_API_URL/usage/session-window" 2>/dev/null)
    if [ -z "$raw" ]; then echo ""; return 1; fi
    echo "$raw" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    u = d.get('five_hour', {}).get('utilization')
    if u is not None: print(int(float(u) * 100))
    else: print('')
except: print('')
" 2>/dev/null
}

_burn_gate_alert_throttled() {
    local severity="$1" msg="$2"
    local now
    now=$(date +%s)
    if [ -f "$BURN_GATE_COOLDOWN_FILE" ]; then
        local last
        last=$(cat "$BURN_GATE_COOLDOWN_FILE" 2>/dev/null || echo 0)
        if [ $((now - last)) -lt "$BURN_GATE_COOLDOWN_SECS" ]; then
            return 0
        fi
    fi
    echo "$now" > "$BURN_GATE_COOLDOWN_FILE"
    bash "$MSGBUS" send --type "burn_gate" --source "system:event-watcher" \
        --severity "$severity" \
        --data "{\"message\":\"$msg\",\"severity\":\"$severity\"}" 2>/dev/null || true
}

CURRENT_BURN_PCT=$(_burn_util_pct)
if [ -n "$CURRENT_BURN_PCT" ]; then
    if [ "$CURRENT_BURN_PCT" -ge "$BURN_CRIT_PCT" ]; then
        log "BURN GATE: ${CURRENT_BURN_PCT}% util — CRITICAL. Skipping ALL dispatch."
        _burn_gate_alert_throttled "critical" "5hr utilization at ${CURRENT_BURN_PCT}% — all dispatch suspended"
        BURN_GATE_SKIP=true
    elif [ "$CURRENT_BURN_PCT" -ge "$BURN_SKIP_PCT" ]; then
        log "BURN GATE: ${CURRENT_BURN_PCT}% util — above ${BURN_SKIP_PCT}% threshold. Skipping dispatch."
        _burn_gate_alert_throttled "warning" "5hr utilization at ${CURRENT_BURN_PCT}% — dispatch paused"
        BURN_GATE_SKIP=true
    elif [ "$CURRENT_BURN_PCT" -ge "$BURN_WARN_PCT" ]; then
        log "BURN GATE: ${CURRENT_BURN_PCT}% util — approaching threshold (warn at ${BURN_WARN_PCT}%)"
    fi
fi

ADVANCE_RESULT=$(curl -s -X POST "$PULSE_API_URL/projects/advance-all" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null || echo '{"error":"pulse unreachable"}')

if ! echo "$ADVANCE_RESULT" | jq -e '.error' >/dev/null 2>&1; then
    COMPLETED_COUNT=$(echo "$ADVANCE_RESULT" | jq '[.projects[]? | select(.completed == true)] | length' 2>/dev/null || echo 0)
    if [ "$COMPLETED_COUNT" -gt 0 ]; then
        log "Project advance: $COMPLETED_COUNT project(s) completed"
    fi

    # Map persona to dispatcher job name
    persona_to_job() {
        case "$1" in
            infrastructure|infrastructure-deployer) echo "task-executor-infra" ;;
            researcher|research) echo "task-research" ;;
            security|security-reviewer) echo "security-reviewer" ;;
            backend-eng) echo "backend-eng" ;;
            db-eng) echo "db-eng" ;;
            ux-eng) echo "ux-eng" ;;
            project-manager) echo "project-manager" ;;
            security-researcher|developer|*) echo "task-executor" ;;
        esac
    }

    # Dispatch each unblocked task on the host
    DISPATCH_COUNT=0

    if [ "$BURN_GATE_SKIP" = true ]; then
        log "BURN GATE: dispatch suspended at ${CURRENT_BURN_PCT}% util — tasks will queue until headroom returns"
    fi

    while IFS= read -r TASK_JSON; do
        [ -z "$TASK_JSON" ] && continue

        if [ "$BURN_GATE_SKIP" = true ]; then
            continue
        fi

        if [ "$DISPATCH_COUNT" -ge 5 ]; then
            log "Rate limit: max 5 parallel dispatches per cycle reached, deferring remaining"
            break
        fi

        PULSE_TASK_ID=$(echo "$TASK_JSON" | jq -r '.pulse_task_id')
        TITLE=$(echo "$TASK_JSON" | jq -r '.title')
        PERSONA=$(echo "$TASK_JSON" | jq -r '.persona')
        PHASE_ID=$(echo "$TASK_JSON" | jq -r '.phase_id')
        YAML_TASK_ID=$(echo "$TASK_JSON" | jq -r '.yaml_task_id')

        JOB_NAME=$(persona_to_job "$PERSONA")

        log "Project dispatch: $YAML_TASK_ID ($TITLE) via $JOB_NAME [task=$PULSE_TASK_ID]"

        "$DISPATCHER" --run "$JOB_NAME" \
            --param "phase=$PHASE_ID" \
            --param "task_id=$YAML_TASK_ID" \
            --param "pulse_task_id=$PULSE_TASK_ID" \
            --param "task_title=$TITLE" \
            --param "persona=$PERSONA" \
            >> "$LOG_DIR/event-watcher.log" 2>&1 &

        # Mark as ready for executor pickup — do NOT set in_progress here.
        # Only executors (task-executor, task-research, infrastructure-deployer)
        # should set in_progress when they actually claim and start work.
        label_add_validated "$PULSE_TASK_ID" "auto:ready" "event-watcher" || log_warning "Failed to add auto:ready label for $PULSE_TASK_ID"

        DISPATCH_COUNT=$((DISPATCH_COUNT + 1))
    done < <(echo "$ADVANCE_RESULT" | jq -c '.projects[]?.dispatchable[]?' 2>/dev/null)

    if [ "$DISPATCH_COUNT" -gt 0 ]; then
        log "Project advance: dispatched $DISPATCH_COUNT task(s)"
    fi
fi

# --- Pulse event polling for v2 event-driven pipeline (Phase D, Plan B, 2026-05-12) ---
# Polls /api/v1/events?event_type=task.created for new tasks; fires services/score.py
# per task. Replaces the legacy `task-score` cron job (registry.yaml) with event-driven
# risk:* labeling. score.py emits risk:* only — auto:* is intentionally absent under
# Plan B (auto:* labels are V1 routing primitives consumed only by the legacy shell
# layer; V2 services drive task advancement via dimension labels independently).
# Cursor (ISO timestamp): $STATE_DIR/pulse-events-cursor.
# Idempotency: score.py is safe under duplicate fire (re-scoring a classified task no-ops).

PULSE_EVENTS_CURSOR_FILE="$STATE_DIR/pulse-events-cursor"
PE_CURSOR=$(cat "$PULSE_EVENTS_CURSOR_FILE" 2>/dev/null || echo "1970-01-01T00:00:00Z")
# URL-encode literal '+' in cursor (e.g. '+00:00' offset in ISO timestamps).
# Bare '+' in a query string decodes to space, which would corrupt the since= filter.
PE_CURSOR_ENC="${PE_CURSOR//+/%2B}"
PE_RESPONSE=$(curl -sf "$PULSE_API_URL/events?event_type=created&since=${PE_CURSOR_ENC}&limit=200" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null)
PE_CURL_EXIT=$?
if [ $PE_CURL_EXIT -ne 0 ]; then
    log "WARNING: Pulse /events poll failed (curl exit $PE_CURL_EXIT, cursor=$PE_CURSOR) — skipping cycle"
    PE_RESPONSE='{"events":[]}'
fi

PE_COUNT=0
PE_MAX_TS="$PE_CURSOR"
while IFS= read -r PE_JSON; do
    [ -z "$PE_JSON" ] && continue
    PE_TASK_ID=$(echo "$PE_JSON" | jq -r '.task_id // empty')
    PE_TS=$(echo "$PE_JSON" | jq -r '.created_at // empty')
    [ -z "$PE_TASK_ID" ] && continue
    PE_COUNT=$((PE_COUNT + 1))

    log "EVENT: pulse task.created — $PE_TASK_ID @ $PE_TS"
    log_audit "system:event-watcher" "task.scored.dispatched" "task" "$PE_TASK_ID" \
        '{"source":"pulse-events","via":"event-watcher-D.7"}' 2>/dev/null || true

    # Fire score.py (Plan B: risk:* only). Failure non-fatal — log + continue.
    python3 "$SCRIPT_DIR/services/score.py" --task-id "$PE_TASK_ID" \
        >> "$LOG_DIR/event-watcher.log" 2>&1 \
        || log "WARNING: score.py failed for $PE_TASK_ID — continuing"

    # Track most-recent timestamp (ISO-8601 lexicographic compare = chronological)
    if [ -n "$PE_TS" ] && [ "$PE_TS" \> "$PE_MAX_TS" ]; then
        PE_MAX_TS="$PE_TS"
    fi
done < <(echo "$PE_RESPONSE" | jq -c '.events[]?' 2>/dev/null)

if [ "$PE_COUNT" -gt 0 ]; then
    log "Pulse events: processed $PE_COUNT task.created (Phase D / Plan B / risk:*-only), cursor → $PE_MAX_TS"
    echo "$PE_MAX_TS" > "$PULSE_EVENTS_CURSOR_FILE"
fi

# --- Legacy JSONL event processing (no new events written since Pulse migration) ---
# Skip entirely if events file doesn't exist
if [ ! -f "$EVENTS_FILE" ]; then
    exit 0
fi

CURSOR=$(get_cursor)
TOTAL_LINES=$(wc -l < "$EVENTS_FILE")

# Nothing new (events-wise)
if [ "$TOTAL_LINES" -le "$CURSOR" ]; then
    exit 0
fi

# Read new lines (from cursor+1 to end)
NEW_START=$((CURSOR + 1))
TRIGGER_EVALUATOR=false
APPROVED_TASKS=()
EVENTS_FOUND=0

while IFS= read -r line; do
    [ -z "$line" ] && continue
    EVENTS_FOUND=$((EVENTS_FOUND + 1))

    if is_task_created "$line"; then
        TASK_ID=$(get_task_id "$line")
        log "EVENT: task.created — $TASK_ID"
        log_audit "system:event-watcher" "task.created" "task" "$TASK_ID" '{"source":"pulse-events"}' 2>/dev/null || true
        # Stamp stage:intake for new tasks entering the pipeline (retry up to 3 times)
        intake_ok=false
        for attempt in 1 2 3; do
            if label_transition "$TASK_ID" "intake" "event-watcher" 2>/dev/null; then
                intake_ok=true
                break
            fi
            [ "$attempt" -lt 3 ] && sleep 2
        done
        if [ "$intake_ok" = "false" ]; then
            log "WARNING: Failed to stamp stage:intake on $TASK_ID after 3 attempts"
        fi
        TRIGGER_EVALUATOR=true
    fi

    # Strip stale blocker labels when a task is closed
    if is_task_closed "$line"; then
        TASK_ID=$(get_task_id "$line")
        log_audit "system:event-watcher" "task.closed" "task" "$TASK_ID" \
            "$(jq -nc '{source:"pulse_event_stream",action:"strip_blocker_labels"}')" 2>/dev/null || true
        strip_blocker_labels "$TASK_ID"
    fi

    # Detect pipeline:approved label being added
    if is_pipeline_approved "$line"; then
        TASK_ID=$(get_task_id "$line")
        log "EVENT: pipeline.approved — $TASK_ID"
        APPROVED_TASKS+=("$TASK_ID")
    fi

done < <(sed -n "${NEW_START},${TOTAL_LINES}p" "$EVENTS_FILE")

# Update cursor
set_cursor "$TOTAL_LINES"

# Trigger task-evaluator if new tasks were created
if [ "$TRIGGER_EVALUATOR" = "true" ]; then
    log "Triggering task-evaluator (new task creation detected)"

    # Check if evaluator is already running
    if [ -f "$STATE_DIR/locks/task-evaluator.lock" ]; then
        local_pid=$(cat "$STATE_DIR/locks/task-evaluator.lock" 2>/dev/null || echo "")
        if [ -n "$local_pid" ] && kill -0 "$local_pid" 2>/dev/null; then
            log "task-evaluator already running (PID $local_pid), skipping trigger"
        fi
    else
        "$DISPATCHER" --run task-evaluator >> "$LOG_DIR/event-watcher.log" 2>&1 &
        EVAL_PID=$!
        log "task-evaluator dispatched (PID $EVAL_PID)"
    fi
fi

# Trigger project auto-launch for approved tasks
for TASK_ID in "${APPROVED_TASKS[@]}"; do
    # Wrap entire loop body in subshell to prevent set -e from aborting the loop
    # on transient errors (grep failures, API timeouts, etc.)
    (
        log "Checking for project linked to $TASK_ID"

        # Check if this task is a master_task_id for any Pulse project
        PROJECT_JSON=$(curl -s "$PULSE_API_URL/projects?limit=200" \
            -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null || echo '{}')
        PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r ".projects[]? | select(.config.master_task_id == \"$TASK_ID\") | .id" 2>/dev/null | head -1)

        if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
            log "Found project: $PROJECT_ID — triggering auto-execute via Pulse"

            # Execute project via Pulse API
            curl -s -X POST "$PULSE_API_URL/projects/$PROJECT_ID/execute" \
                -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
                >> "$LOG_DIR/event-watcher.log" 2>&1 || log_warning "Failed to execute project $PROJECT_ID"

            # Send push notification
            curl -s -X POST "$DASHBOARD_URL/api/pipeline/notify" \
                --header 'content-type: application/json' \
                --data-raw "{\"title\":\"Project Launched\",\"body\":\"$PROJECT_ID is now executing\",\"category\":\"pipeline\",\"taskId\":\"$TASK_ID\"}" \
                >> "$LOG_DIR/event-watcher.log" 2>&1 || log_warning "Failed to send notification for $TASK_ID"

            log "Project $PROJECT_ID launch triggered for $TASK_ID"
        else
            log "No project found for $TASK_ID — single-task execution"

            # Gate: skip tasks that are blocked or need input, even if approved
            # Routing logic mirrors .claude/jobs/lib/routing-rules.yaml (dispatch_blockers)
            TASK_LABELS_RAW=$(pulse_get_task_labels "$TASK_ID" 2>/dev/null || log_warning "Failed to read task $TASK_ID")
            if echo "$TASK_LABELS_RAW" | grep -qE 'waiting:|needs-input|parked|blocked:|manual-action|pipeline:needs-approval'; then
                log "SKIP: $TASK_ID has dispatch blocker — not dispatching despite approval"
                pulse_append_notes "$TASK_ID" "## Dispatch Skipped ($(date +%Y-%m-%d))
- Task approved but has a dispatch blocker label
- Requires manual session or label update before autonomous execution
- Detected by: event-watcher" "event-watcher" 2>/dev/null || log_warning "Failed to update task $TASK_ID"
                exit 0  # exit subshell (acts like continue)
            fi

            # Route to correct executor — check assigned: FIRST, then capability:
            # Precedence: assigned:<persona> > type:<type> > capability:<cap> > default
            # See routing-rules.yaml "DISPATCH ROUTING PRECEDENCE" section
            TASK_ASSIGNED=$(echo "$TASK_LABELS_RAW" | grep -o 'assigned:[a-z-]*' | head -1 || true)
            TASK_CAP=$(echo "$TASK_LABELS_RAW" | grep -o 'capability:[a-z-]*' | head -1 || true)

            # Risk gate: check settings-driven risk eligibility
            executor_name=""
            if [ -n "$TASK_ASSIGNED" ]; then
                # Direct persona assignment — bypass capability routing
                case "$TASK_ASSIGNED" in
                    assigned:researcher)                executor_name="task-research" ;;
                    assigned:security-reviewer)         executor_name="security-reviewer" ;;
                    assigned:infrastructure-deployer)   executor_name="task-executor-infra" ;;
                    assigned:bug-fixer)                 executor_name="bug-fixer" ;;
                    assigned:autofix-executor)          executor_name="task-executor" ;;
                    assigned:troubleshooter)            executor_name="troubleshooter" ;;
                    assigned:backend-eng)              executor_name="backend-eng" ;;
                    assigned:db-eng)                   executor_name="db-eng" ;;
                    assigned:ux-eng)                   executor_name="ux-eng" ;;
                    assigned:project-manager)          executor_name="project-manager" ;;
                    *)                                  executor_name="task-executor" ;;
                esac
                log "ASSIGNED routing: $TASK_ID → $executor_name (via $TASK_ASSIGNED)"
                lops_log_handoff "$TASK_ID" "event-watcher" "$executor_name" "assigned" "Direct assignment via $TASK_ASSIGNED"
            else
                # Standard capability-based routing
                case "$TASK_CAP" in
                    capability:infrastructure) executor_name="task-executor-infra" ;;
                    capability:research)       executor_name="task-research" ;;
                    capability:security)       executor_name="security-reviewer" ;;
                    *)                         executor_name="task-executor" ;;
                esac
                lops_log_handoff "$TASK_ID" "event-watcher" "$executor_name" "capability" "Routed via ${TASK_CAP:-default}"
            fi
            risk_result=0
            ns_check_risk_allowed "$executor_name" "$TASK_LABELS_RAW" || risk_result=$?
            if [ "$risk_result" -eq 1 ]; then
                log "SKIP: $TASK_ID is risk-blocked for $executor_name — needs manual pickup"
                pulse_append_notes "$TASK_ID" "## Dispatch Skipped ($(date +%Y-%m-%d))
- Risk gate blocked by nexus-settings for $executor_name
- Needs manual execution in interactive session
- Detected by: event-watcher" "event-watcher" 2>/dev/null || log_warning "Failed to update task $TASK_ID"
                exit 0  # exit subshell (acts like continue)
            fi

            # Burn-weight gate: skip execution dispatch if utilization is too high
            if [ "$BURN_GATE_SKIP" = true ]; then
                log "BURN GATE: skipping event-driven dispatch for $TASK_ID at ${CURRENT_BURN_PCT}% util"
                exit 0  # exit subshell
            fi

            # Add auto:ready before dispatching — signals executor pickup readiness
            label_add_validated "$TASK_ID" "auto:ready" "event-watcher" || log_warning "Failed to add auto:ready for $TASK_ID"

            case "$TASK_CAP" in
                capability:infrastructure)
                    "$DISPATCHER" --run task-executor-infra >> "$LOG_DIR/event-watcher.log" 2>&1 &
                    log "task-executor-infra dispatched for $TASK_ID (infrastructure)"
                    ;;
                capability:research)
                    label_transition "$TASK_ID" "intake-add-research-type" "event-watcher" || log_warning "Failed to update labels for $TASK_ID"
                    "$DISPATCHER" --run task-research --param "task_id=$TASK_ID" >> "$LOG_DIR/event-watcher.log" 2>&1 &
                    log "task-research dispatched for $TASK_ID (research)"
                    ;;
                capability:file-ops|capability:code|"")
                    "$DISPATCHER" --run task-executor --param "task_id=$TASK_ID" >> "$LOG_DIR/event-watcher.log" 2>&1 &
                    log "task-executor dispatched for $TASK_ID (${TASK_CAP:-default})"
                    ;;
                *)
                    # Unknown capability — stall detection
                    log "WARNING: No executor for $TASK_CAP on $TASK_ID — marking stalled"
                    label_transition "$TASK_ID" "intake-stall-unknown-cap" "event-watcher" || log_warning "Failed to update labels for $TASK_ID"
                    pulse_append_notes "$TASK_ID" "## Pipeline Stalled ($(date +%Y-%m-%d))
- Reason: No executor registered for $TASK_CAP
- Task was approved but cannot auto-execute
- Action needed: manual execution or build executor persona
- Detected by: event-watcher" "event-watcher" 2>/dev/null || log_warning "Failed to update task $TASK_ID"
                    # Send to message bus for Telegram relay
                    if [ -x "$MSGBUS" ]; then
                        "$MSGBUS" send --type notification \
                            --source "event-watcher" \
                            --severity warning \
                            --data "$(jq -nc \
                                --arg job "event-watcher" \
                                --arg tid "$TASK_ID" \
                                --arg cap "$TASK_CAP" \
                                '{job: $job, summary: ("Task stalled: no executor for " + $cap), task_id: $tid}')" \
                            > /dev/null 2>&1 || log_warning "Failed to send stalled task to msgbus for $TASK_ID"
                    fi
                    # Also send push notification
                    curl -s -X POST "$DASHBOARD_URL/api/pipeline/notify" \
                        --header 'content-type: application/json' \
                        --data-raw "{\"title\":\"Task Stalled\",\"body\":\"No executor for $TASK_CAP — needs manual routing\",\"category\":\"pipeline\",\"taskId\":\"$TASK_ID\"}" \
                        >> "$LOG_DIR/event-watcher.log" 2>&1 || log_warning "Failed to send notification for $TASK_ID"
                    log "Notifications sent for stalled task $TASK_ID"
                    ;;
            esac
        fi
    ) || log "ERROR: Dispatch failed for approved task $TASK_ID — continuing with remaining tasks"
done

if [ "$EVENTS_FOUND" -gt 0 ]; then
    log "Processed $EVENTS_FOUND new event(s), cursor now at $TOTAL_LINES"
fi

exit 0
