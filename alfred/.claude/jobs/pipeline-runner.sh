#!/usr/bin/env bash
# pipeline-runner.sh — Event-driven dispatch loop for Nexus pipeline
#
# Polls the pipeline_triggers table every 5 seconds and dispatches handlers
# for pending triggers. Deduplicates batch handlers (evaluator, investigator,
# ai-david) so multiple triggers collapse into a single dispatch.
#
# This is the FAST PATH — tasks process within seconds of a stage transition.
# The cron-based dispatcher remains as the SAFETY NET sweep.
#
# Usage:
#   pipeline-runner.sh              # Run loop (foreground, for systemd)
#   pipeline-runner.sh --once       # Process pending triggers, exit
#   pipeline-runner.sh --status     # Show runner health
#   pipeline-runner.sh --drain      # Process all pending, then exit
#
# Part of the Nexus event-driven pipeline system.
# Last updated: 2026-03-15

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Phase 5.8 (8x3r): Set NEXUS_THREAD_ID for audit correlation.
# pipeline-runner runs independently (systemd/cron, not via dispatcher), so it must self-generate.
if [ -z "${NEXUS_THREAD_ID:-}" ]; then
    NEXUS_THREAD_ID="$(date -u +%s)-$$-${RANDOM}"
    export NEXUS_THREAD_ID
fi

STATE_DIR="$SCRIPT_DIR/state"
LOCKS_DIR="$STATE_DIR/locks"
DISPATCHER="$SCRIPT_DIR/dispatcher.sh"
PID_FILE="$STATE_DIR/pipeline-runner.pid"
HEARTBEAT_FILE="$STATE_DIR/pipeline-runner-heartbeat"
SETTINGS_FILE="$STATE_DIR/nexus-settings.json"

POLL_INTERVAL=5         # seconds between polls
MAX_CONCURRENT=3        # max concurrent dispatches
CLEANUP_INTERVAL=100    # cycles between cleanup runs
DEFAULT_MAX_DISPATCHES_PER_HOUR=20

# Ensure CWD is PROJECT_DIR
cd "$PROJECT_DIR"

# Ensure nvm/node tools and user-local binaries (pulse, etc.) are available in cron's minimal PATH
export PATH="$HOME/.local/bin:$PATH"
if [ -d "$HOME/.nvm/versions/node" ]; then
    NODE_BIN=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name bin -type d 2>/dev/null | head -1)
    [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

# Source shared utilities
# shellcheck disable=SC2034
LOG_COMPONENT="pipeline-runner"
# shellcheck disable=SC2034
JOB_NAME="pipeline-runner"
source "$SCRIPT_DIR/lib/common.sh" || { echo "ERROR: common.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/trigger-ops.sh" || { echo "ERROR: trigger-ops.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/routing-helpers.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/nexus-settings.sh" 2>/dev/null || true

# Bypass daemon to prevent export→import feedback loop
export BD_NO_DAEMON=true

# ============================================================================
# State
# ============================================================================

# Track child PIDs: associative array of PID → handler
declare -A CHILD_PIDS=()
# Track dispatch timestamps for cost guard (array of epoch seconds)
DISPATCH_TIMESTAMPS=()
CYCLE_COUNT=0

# ============================================================================
# Functions
# ============================================================================

show_help() {
    cat << 'EOF'
pipeline-runner.sh — Event-driven dispatch loop

USAGE:
    pipeline-runner.sh              # Run loop (foreground, for systemd)
    pipeline-runner.sh --once       # Process pending triggers, exit
    pipeline-runner.sh --status     # Show runner health
    pipeline-runner.sh --drain      # Process all pending, then exit

EOF
}

show_status() {
    echo ""
    echo "Pipeline Runner Status"
    echo "======================"

    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "  Status: RUNNING (PID $pid)"
        else
            echo "  Status: NOT RUNNING (stale PID file)"
        fi
    else
        echo "  Status: NOT RUNNING"
    fi

    if [ -f "$HEARTBEAT_FILE" ]; then
        local hb_age
        hb_age=$(( $(date +%s) - $(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || echo "$(date +%s)") ))
        echo "  Heartbeat: ${hb_age}s ago"
    else
        echo "  Heartbeat: never"
    fi

    if is_runner_enabled; then
        echo "  Enabled: YES"
    else
        echo "  Enabled: NO (disabled in nexus-settings.json)"
    fi

    local max_dph
    max_dph=$(get_max_dispatches_per_hour)
    echo "  Cost cap: $max_dph dispatches/hour"

    local pending
    pending=$(trigger_pending_count 2>/dev/null || echo "0")
    echo "  Pending triggers: $pending"

    echo ""
    echo "  Recent triggers:"
    python3 "$SCRIPT_DIR/lib/nexusdb.py" exec \
        "SELECT id, task_id, handler, status, priority, created_at FROM pipeline_triggers ORDER BY id DESC LIMIT 10" 2>/dev/null \
        | jq -r '"    \(.id) | \(.status) | \(.handler) | \(.task_id) | \(.priority) | \(.created_at)"' 2>/dev/null || echo "    (none)"
    echo ""
}

# Check if pipeline runner is enabled in nexus-settings.json
is_runner_enabled() {
    if [ -f "$SETTINGS_FILE" ] && command -v jq >/dev/null 2>&1; then
        local val
        val=$(jq -r '.pipeline_runner.enabled // true' "$SETTINGS_FILE" 2>/dev/null)
        [ "$val" = "false" ] && return 1
    fi
    return 0  # Default: enabled
}

get_max_dispatches_per_hour() {
    if [ -f "$SETTINGS_FILE" ] && command -v jq >/dev/null 2>&1; then
        local val
        val=$(jq -r '.pipeline_runner.max_dispatches_per_hour // .max_dispatches_per_hour // empty' "$SETTINGS_FILE" 2>/dev/null)
        if [ -n "$val" ] && [ "$val" != "null" ]; then
            echo "$val"
            return
        fi
    fi
    echo "$DEFAULT_MAX_DISPATCHES_PER_HOUR"
}

# Check if we're within the cost cap
check_cost_cap() {
    local max_per_hour
    max_per_hour=$(get_max_dispatches_per_hour)
    local now
    now=$(date +%s)
    local one_hour_ago=$((now - 3600))

    # Prune old timestamps
    local new_timestamps=()
    for ts in "${DISPATCH_TIMESTAMPS[@]}"; do
        if [ "$ts" -gt "$one_hour_ago" ]; then
            new_timestamps+=("$ts")
        fi
    done
    DISPATCH_TIMESTAMPS=("${new_timestamps[@]}")

    local count=${#DISPATCH_TIMESTAMPS[@]}
    if [ "$count" -ge "$max_per_hour" ]; then
        return 1  # Cap hit
    fi
    return 0
}

record_dispatch() {
    DISPATCH_TIMESTAMPS+=("$(date +%s)")
}

# Count live child processes
count_children() {
    local count=0
    for pid in "${!CHILD_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            count=$((count + 1))
        fi
    done
    echo "$count"
}

# Reap completed child processes
reap_children() {
    for pid in "${!CHILD_PIDS[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            # Process completed — check exit code
            wait "$pid" 2>/dev/null
            local exit_code=$?
            local entry="${CHILD_PIDS[$pid]}"

            # Parse handler:task_id or plain handler
            local handler task_id=""
            if [[ "$entry" == *:* ]]; then
                handler="${entry%%:*}"
                task_id="${entry#*:}"
            else
                handler="$entry"
            fi

            if [ "$exit_code" -eq 0 ]; then
                log_info "Dispatch completed: $handler (PID $pid)"
                if [ -n "$task_id" ]; then
                    trigger_complete_for_task "$handler" "$task_id" "$$" "exit_code=$exit_code" 2>/dev/null || true
                else
                    trigger_complete_handler "$handler" "$$" "exit_code=$exit_code" 2>/dev/null || true
                fi
            else
                log_warning "Dispatch failed: $handler (PID $pid, exit $exit_code)"
                log_audit "system:pipeline-runner" "trigger.error" "trigger" "${handler}:${task_id:-batch}" \
                    "$(jq -nc --arg handler "$handler" --arg exit_code "$exit_code" --arg pid "$pid" \
                    '{handler:$handler,exit_code:($exit_code|tonumber),pid:($pid|tonumber)}')" 2>/dev/null || true
                if [ -n "$task_id" ]; then
                    trigger_fail_for_task "$handler" "$task_id" "$$" "exit_code=$exit_code" 2>/dev/null || true
                else
                    trigger_fail_handler "$handler" "$$" "exit_code=$exit_code" 2>/dev/null || true
                fi
            fi

            unset "CHILD_PIDS[$pid]"
        fi
    done
}

# Dispatch a handler job
dispatch_handler() {
    local handler="$1"
    shift
    local extra_params=("$@")

    # Acquire lock check (dispatcher.sh handles locking internally, but we check here
    # to avoid spawning a process that will immediately exit)
    local lock_file="$LOCKS_DIR/${handler}.lock"
    if [ -f "$lock_file" ]; then
        local lock_pid
        lock_pid=$(cat "$lock_file" 2>/dev/null || echo "")
        if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
            log_info "Handler $handler already running (PID $lock_pid), skipping"
            return 0
        fi
    fi

    # Build param args
    local param_args=()
    for p in "${extra_params[@]}"; do
        [ -n "$p" ] && param_args+=("--param" "$p")
    done

    log_info "Dispatching: $handler ${param_args[*]:-}"

    "$DISPATCHER" --run "$handler" ${param_args[@]+"${param_args[@]}"} \
        >> "$PROJECT_DIR/.claude/logs/headless/pipeline-runner.log" 2>&1 &
    local child_pid=$!

    # Store handler or handler:task_id for per-task tracking
    local task_id_tag=""
    for p in "${extra_params[@]}"; do
        if [[ "$p" == task_id=* ]]; then
            task_id_tag="${p#task_id=}"
            break
        fi
    done
    if [ -n "$task_id_tag" ]; then
        CHILD_PIDS[$child_pid]="$handler:$task_id_tag"
    else
        CHILD_PIDS[$child_pid]="$handler"
    fi
    record_dispatch

    log_info "Dispatched $handler (PID $child_pid)"
}

# Process pending triggers
process_triggers() {
    # Reap any completed children first
    reap_children

    # Check concurrent limit
    local active
    active=$(count_children)
    if [ "$active" -ge "$MAX_CONCURRENT" ]; then
        return 0  # At capacity
    fi

    # Check if runner is enabled (dashboard toggle)
    if ! is_runner_enabled; then
        return 0  # Disabled via nexus-settings.json
    fi

    # Check cost cap
    if ! check_cost_cap; then
        log_warning "Cost cap reached ($(get_max_dispatches_per_hour) dispatches/hour) — pausing"
        return 0
    fi

    # Get unique handlers with pending triggers
    local handlers
    handlers=$(trigger_pending_handlers 2>/dev/null)
    [ -z "$handlers" ] && return 0

    local slots_available=$((MAX_CONCURRENT - active))

    while IFS= read -r handler; do
        [ -z "$handler" ] && continue
        [ "$slots_available" -le 0 ] && break

        if ! check_cost_cap; then
            log_warning "Cost cap reached mid-cycle — stopping dispatches"
            break
        fi

        if _trigger_is_batch_handler "$handler"; then
            # Batch handler: claim all triggers, dispatch once (no task_id)
            local claimed_ids
            # shellcheck disable=SC2034
            claimed_ids=$(trigger_claim_handler "$handler" "$$" 2>/dev/null)

            # Check dispatch blockers — batch handlers query all eligible, so just dispatch
            dispatch_handler "$handler"
            slots_available=$((slots_available - 1))
        else
            # Single-task handler: dispatch per task_id
            local task_ids
            task_ids=$(trigger_task_ids_for_handler "$handler" 2>/dev/null)
            [ -z "$task_ids" ] && continue

            while IFS= read -r task_id; do
                [ -z "$task_id" ] && continue
                [ "$slots_available" -le 0 ] && break

                if ! check_cost_cap; then
                    break
                fi

                # Check dispatch blockers on individual task
                if type has_dispatch_blocker &>/dev/null; then
                    local task_labels
                    task_labels=$(pulse_get_task "$task_id" 2>/dev/null \
                        | jq -r '(.labels // []) | join(" ")' 2>/dev/null || echo "")
                    if has_dispatch_blocker "$task_labels"; then
                        log_info "Skipping $task_id — has dispatch blocker"
                        log_audit "system:pipeline-runner" "trigger.skipped" "trigger" "${task_id}:${handler}" \
                            "$(jq -nc --arg task_id "$task_id" --arg handler "$handler" --arg reason 'dispatch_blocker' \
                            '{task_id:$task_id,handler:$handler,reason:$reason}')" 2>/dev/null || true
                        # Claim and fail only this task's trigger
                        trigger_claim_for_task "$handler" "$task_id" "$$" 2>/dev/null || true
                        trigger_fail_for_task "$handler" "$task_id" "$$" "dispatch_blocker" 2>/dev/null || true
                        continue
                    fi

                    # Check risk gate
                    if type ns_check_risk_allowed &>/dev/null; then
                        ns_check_risk_allowed "$handler" "$task_labels"
                        local risk_rc=$?
                        if [ "$risk_rc" -ne 0 ]; then
                            log_info "Skipping $task_id — risk gate blocked (rc=$risk_rc)"
                            log_audit "system:pipeline-runner" "trigger.skipped" "trigger" "${task_id}:${handler}" \
                                "$(jq -nc --arg task_id "$task_id" --arg handler "$handler" --arg reason "risk_blocked" --arg rc "$risk_rc" \
                                '{task_id:$task_id,handler:$handler,reason:$reason,risk_rc:($rc|tonumber)}')" 2>/dev/null || true
                            trigger_claim_for_task "$handler" "$task_id" "$$" 2>/dev/null || true
                            trigger_fail_for_task "$handler" "$task_id" "$$" "risk_blocked" 2>/dev/null || true
                            continue
                        fi
                    fi
                fi

                # Claim only this task's trigger and dispatch
                trigger_claim_for_task "$handler" "$task_id" "$$" 2>/dev/null || true
                dispatch_handler "$handler" "task_id=$task_id"
                slots_available=$((slots_available - 1))
                break  # One dispatch per handler per cycle for single-task (they share a lock)

            done <<< "$task_ids"
        fi

    done <<< "$handlers"

    # Log backpressure warnings
    local pending_count
    pending_count=$(trigger_pending_count 2>/dev/null || echo "0")
    if [ "${pending_count:-0}" -ge 100 ]; then
        log_error "Backpressure: $pending_count pending triggers"
    elif [ "${pending_count:-0}" -ge 50 ]; then
        log_warning "Backpressure: $pending_count pending triggers"
    fi
}

cleanup() {
    log_info "Pipeline runner shutting down (PID $$)"
    rm -f "$PID_FILE"
    # Wait for children
    for pid in "${!CHILD_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Waiting for child PID $pid (${CHILD_PIDS[$pid]})"
            wait "$pid" 2>/dev/null || true
        fi
    done
    exit 0
}

# ============================================================================
# Main
# ============================================================================

MODE="loop"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)  show_help; exit 0 ;;
        --once)     MODE="once"; shift ;;
        --drain)    MODE="drain"; shift ;;
        --status)   show_status; exit 0 ;;
        *)          echo "Unknown option: $1" >&2; show_help; exit 1 ;;
    esac
done

# Ensure state directories
mkdir -p "$STATE_DIR" "$LOCKS_DIR" "$PROJECT_DIR/.claude/logs/headless"

# Initialize DB (ensures pipeline_triggers table exists)
python3 "$SCRIPT_DIR/lib/nexusdb.py" init >/dev/null 2>&1

# Recover stale triggers from prior crash
reclaimed=$(trigger_reclaim_stale 2>/dev/null || echo "0")
[ "${reclaimed:-0}" -gt 0 ] && log_info "Reclaimed $reclaimed stale triggers"

pending=$(trigger_pending_count 2>/dev/null || echo "0")
log_info "Pipeline runner starting (PID $$, mode=$MODE, $pending pending triggers)"

case "$MODE" in
    once)
        process_triggers
        # Poll until all children complete (reap_children handles wait + exit codes)
        while [ ${#CHILD_PIDS[@]} -gt 0 ]; do
            sleep 1
            reap_children
        done
        exit 0
        ;;

    drain)
        while true; do
            process_triggers
            # Wait for children to complete
            for pid in "${!CHILD_PIDS[@]}"; do
                if kill -0 "$pid" 2>/dev/null; then
                    wait "$pid" 2>/dev/null || true
                fi
            done
            reap_children
            # Check if anything still pending
            remaining=$(trigger_pending_count 2>/dev/null || echo "0")
            [ "${remaining:-0}" -eq 0 ] && break
            sleep 1
        done
        log_info "Drain complete — all triggers processed"
        exit 0
        ;;

    loop)
        # Write PID file
        echo $$ > "$PID_FILE"
        trap cleanup SIGTERM SIGINT

        while true; do
            process_triggers

            # Heartbeat
            touch "$HEARTBEAT_FILE" 2>/dev/null || true

            # Periodic maintenance
            CYCLE_COUNT=$((CYCLE_COUNT + 1))
            if [ $((CYCLE_COUNT % CLEANUP_INTERVAL)) -eq 0 ]; then
                reclaimed=$(trigger_reclaim_stale 2>/dev/null || echo "0")
                [ "${reclaimed:-0}" -gt 0 ] && log_info "Reclaimed $reclaimed stale triggers"
                trigger_cleanup_old 7 2>/dev/null || true
            fi

            sleep "$POLL_INTERVAL"
        done
        ;;
esac
