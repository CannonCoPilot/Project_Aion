#!/usr/bin/env bash
# trigger-ops.sh — Pipeline trigger queue library for Nexus
#
# Manages the pipeline_triggers table in nexus.db. Provides emit/claim/complete
# operations used by label-ops.sh (emit on stage transition) and
# pipeline-runner.sh (claim + dispatch).
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/trigger-ops.sh"
#   trigger_emit "AIProjects-abc1" "route" "label-ops"
#   trigger_pending
#   trigger_claim 42
#   trigger_complete 42 "dispatched"
#
# Requires: nexusdb.py (in same directory)
# Last updated: 2026-03-15

# Guard against double-sourcing
[ -n "${_TRIGGER_OPS_SH_LOADED:-}" ] && return 0
_TRIGGER_OPS_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_TRIGGER_OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_TRIGGER_NEXUSDB="$_TRIGGER_OPS_DIR/nexusdb.py"

# Source Pulse API and routing helpers
source "$_TRIGGER_OPS_DIR/pulse-api.sh" 2>/dev/null || true
source "$_TRIGGER_OPS_DIR/routing-helpers.sh" 2>/dev/null || true

# SQLite helper
_trig_db() { python3 "$_TRIGGER_NEXUSDB" "$@"; }

# ============================================================================
# Handler Resolution
# ============================================================================

# Batch handlers: one dispatch handles all eligible tasks (no task_id param needed)
_TRIGGER_BATCH_HANDLERS="task-evaluator task-investigator ai-david orchestrator"

_trigger_is_batch_handler() {
    local handler="$1"
    case " $_TRIGGER_BATCH_HANDLERS " in
        *" $handler "*) return 0 ;;
        *) return 1 ;;
    esac
}

# Map stage → handler job name
# For queue stage, resolves via capability labels on the task
trigger_resolve_handler() {
    local stage="$1" task_id="$2"

    case "$stage" in
        intake)
            echo "task-evaluator"
            ;;
        evaluate)
            # Transient — evaluator handles inline, no separate dispatch
            echo ""
            ;;
        route)
            echo "task-investigator"
            ;;
        review)
            echo "ai-david"
            ;;
        queue)
            # Resolve by capability label on the task
            local cap
            cap=$(pulse_get_task "$task_id" 2>/dev/null \
                | jq -r '(.labels // [])[] | select(startswith("capability:"))' 2>/dev/null \
                | head -1)
            if type get_executor_for_capability &>/dev/null; then
                get_executor_for_capability "$cap"
            else
                # Fallback if routing-helpers not loaded
                case "$cap" in
                    capability:infrastructure)  echo "task-executor-infra" ;;
                    capability:research)        echo "task-research" ;;
                    *)                          echo "task-executor" ;;
                esac
            fi
            ;;
        execute)
            # Already executing — no dispatch needed
            echo ""
            ;;
        done)
            # Persona completed work — Orchestrator picks up for next-step routing
            # Guard: only dispatch if orchestrator job exists in registry
            if reg_get "orchestrator" "persona" "" &>/dev/null && [ -n "$(reg_get "orchestrator" "persona" "" 2>/dev/null)" ]; then
                echo "orchestrator"
            else
                echo ""  # Orchestrator not yet registered — skip trigger, fallback to scheduled sweep
            fi
            ;;
        *)
            echo ""
            ;;
    esac
}

# ============================================================================
# Public API
# ============================================================================

# trigger_emit <task_id> <stage> <source> — Emit a trigger for a stage transition
# Resolves handler, applies dedup for batch handlers, inserts pending trigger.
trigger_emit() {
    local task_id="$1" stage="$2" source="$3"

    [ -z "$task_id" ] || [ -z "$stage" ] || [ -z "$source" ] && return 1

    local handler
    handler=$(trigger_resolve_handler "$stage" "$task_id")
    [ -z "$handler" ] && return 0  # No handler for this stage (e.g., evaluate, execute)

    # Dedup: for batch handlers, skip if a pending trigger already exists for this handler
    if _trigger_is_batch_handler "$handler"; then
        local existing
        existing=$(_trig_db exec-scalar \
            "SELECT COUNT(*) FROM pipeline_triggers WHERE handler = ? AND status = 'pending'" \
            "$handler" 2>/dev/null)
        if [ "${existing:-0}" -gt 0 ]; then
            return 0  # Already queued — the dispatched job will query all eligible tasks
        fi
    fi

    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    _trig_db exec \
        "INSERT INTO pipeline_triggers (task_id, stage, source, handler, priority, status, created_at) VALUES (?, ?, ?, ?, 'normal', 'pending', ?)" \
        "$task_id" "$stage" "$source" "$handler" "$now" >/dev/null 2>&1
    log_audit "system:trigger-ops" "trigger.fired" "trigger" "${task_id}:${handler}" \
        "$(jq -nc --arg task_id "$task_id" --arg stage "$stage" --arg handler "$handler" --arg source "$source" --arg priority "normal" \
        '{task_id:$task_id,stage:$stage,handler:$handler,source:$source,priority:$priority}')" 2>/dev/null || true
}

# trigger_emit_high <task_id> <stage> <source> — Same as emit but high priority
trigger_emit_high() {
    local task_id="$1" stage="$2" source="$3"

    [ -z "$task_id" ] || [ -z "$stage" ] || [ -z "$source" ] && return 1

    local handler
    handler=$(trigger_resolve_handler "$stage" "$task_id")
    [ -z "$handler" ] && return 0

    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    _trig_db exec \
        "INSERT INTO pipeline_triggers (task_id, stage, source, handler, priority, status, created_at) VALUES (?, ?, ?, ?, 'high', 'pending', ?)" \
        "$task_id" "$stage" "$source" "$handler" "$now" >/dev/null 2>&1
    log_audit "system:trigger-ops" "trigger.fired" "trigger" "${task_id}:${handler}" \
        "$(jq -nc --arg task_id "$task_id" --arg stage "$stage" --arg handler "$handler" --arg source "$source" --arg priority "high" \
        '{task_id:$task_id,stage:$stage,handler:$handler,source:$source,priority:$priority}')" 2>/dev/null || true
}

# trigger_has_pending <handler> — Check if pending trigger exists for this handler
trigger_has_pending() {
    local handler="$1"
    local count
    count=$(_trig_db exec-scalar \
        "SELECT COUNT(*) FROM pipeline_triggers WHERE handler = ? AND status = 'pending'" \
        "$handler" 2>/dev/null)
    [ "${count:-0}" -gt 0 ]
}

# trigger_claim <trigger_id> — Atomically claim a trigger for processing
trigger_claim() {
    local trigger_id="$1" pid="${2:-$$}"
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'processing', claimed_by = ? WHERE id = ? AND status = 'pending'" \
        "$pid" "$trigger_id" >/dev/null 2>&1
}

# trigger_claim_handler <handler> <pid> — Claim all pending triggers for a handler
# Returns claimed trigger IDs (one per line)
trigger_claim_handler() {
    local handler="$1" pid="${2:-$$}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Get IDs first, then claim them
    local ids
    ids=$(_trig_db exec-raw \
        "SELECT id FROM pipeline_triggers WHERE handler = ? AND status = 'pending' ORDER BY priority DESC, created_at ASC" \
        "$handler" 2>/dev/null)
    [ -z "$ids" ] && return 0

    # Claim all at once
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'processing', claimed_by = ? WHERE handler = ? AND status = 'pending'" \
        "$pid" "$handler" >/dev/null 2>&1

    echo "$ids"
}

# trigger_complete <trigger_id> <result> — Mark trigger as completed
trigger_complete() {
    local trigger_id="$1" result="${2:-ok}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'completed', processed_at = ?, result = ? WHERE id = ?" \
        "$now" "$result" "$trigger_id" >/dev/null 2>&1
}

# trigger_complete_handler <handler> <pid> <result> — Mark all processing triggers for handler+pid
trigger_complete_handler() {
    local handler="$1" pid="$2" result="${3:-ok}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'completed', processed_at = ?, result = ? WHERE handler = ? AND claimed_by = ? AND status = 'processing'" \
        "$now" "$result" "$handler" "$pid" >/dev/null 2>&1
}

# trigger_fail <trigger_id> <error> — Mark trigger as failed
trigger_fail() {
    local trigger_id="$1" error="${2:-unknown}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'failed', processed_at = ?, error = ? WHERE id = ?" \
        "$now" "$error" "$trigger_id" >/dev/null 2>&1
}

# trigger_fail_handler <handler> <pid> <error> — Mark all processing triggers for handler+pid as failed
trigger_fail_handler() {
    local handler="$1" pid="$2" error="${3:-unknown}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'failed', processed_at = ?, error = ? WHERE handler = ? AND claimed_by = ? AND status = 'processing'" \
        "$now" "$error" "$handler" "$pid" >/dev/null 2>&1
}

# trigger_claim_for_task <handler> <task_id> <pid> — Claim pending trigger for a specific task
trigger_claim_for_task() {
    local handler="$1" task_id="$2" pid="${3:-$$}"
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'processing', claimed_by = ? WHERE handler = ? AND task_id = ? AND status = 'pending'" \
        "$pid" "$handler" "$task_id" >/dev/null 2>&1
}

# trigger_complete_for_task <handler> <task_id> <pid> <result> — Complete trigger for a specific task
trigger_complete_for_task() {
    local handler="$1" task_id="$2" pid="$3" result="${4:-ok}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'completed', processed_at = ?, result = ? WHERE handler = ? AND task_id = ? AND claimed_by = ? AND status = 'processing'" \
        "$now" "$result" "$handler" "$task_id" "$pid" >/dev/null 2>&1
}

# trigger_fail_for_task <handler> <task_id> <pid> <error> — Fail trigger for a specific task
trigger_fail_for_task() {
    local handler="$1" task_id="$2" pid="$3" error="${4:-unknown}"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'failed', processed_at = ?, error = ? WHERE handler = ? AND task_id = ? AND claimed_by = ? AND status = 'processing'" \
        "$now" "$error" "$handler" "$task_id" "$pid" >/dev/null 2>&1
}

# trigger_pending — List pending triggers as JSON lines
trigger_pending() {
    _trig_db exec \
        "SELECT * FROM pipeline_triggers WHERE status = 'pending' ORDER BY priority DESC, created_at ASC"
}

# trigger_pending_count — Count pending triggers
trigger_pending_count() {
    _trig_db exec-scalar \
        "SELECT COUNT(*) FROM pipeline_triggers WHERE status = 'pending'"
}

# trigger_pending_handlers — List unique handlers with pending triggers
trigger_pending_handlers() {
    _trig_db exec-raw \
        "SELECT handler FROM pipeline_triggers WHERE status = 'pending' GROUP BY handler ORDER BY MIN(CASE WHEN priority='high' THEN 0 ELSE 1 END), MIN(created_at)" 2>/dev/null
}

# trigger_task_ids_for_handler <handler> — Get task_ids for pending triggers of a handler
trigger_task_ids_for_handler() {
    local handler="$1"
    _trig_db exec-raw \
        "SELECT DISTINCT task_id FROM pipeline_triggers WHERE handler = ? AND status = 'pending'" \
        "$handler" 2>/dev/null
}

# trigger_cleanup_old <days> — Purge completed/failed triggers older than N days
trigger_cleanup_old() {
    local days="${1:-7}"
    _trig_db exec \
        "DELETE FROM pipeline_triggers WHERE status IN ('completed', 'failed') AND created_at < datetime('now', '-' || ? || ' days')" \
        "$days" >/dev/null 2>&1
}

# trigger_reclaim_stale — Reclaim triggers stuck in 'processing' where claimed_by PID is dead
trigger_reclaim_stale() {
    local stale_ids
    stale_ids=$(_trig_db exec-raw \
        "SELECT id, claimed_by FROM pipeline_triggers WHERE status = 'processing'" 2>/dev/null)
    [ -z "$stale_ids" ] && return 0

    local reclaimed=0
    while IFS=$'\t' read -r tid claimed_pid; do
        [ -z "$tid" ] && continue
        # Check if the claiming process is still alive
        if [ -n "$claimed_pid" ] && kill -0 "$claimed_pid" 2>/dev/null; then
            continue  # Still running
        fi
        # Process is dead — reclaim
        _trig_db exec \
            "UPDATE pipeline_triggers SET status = 'pending', claimed_by = NULL WHERE id = ?" \
            "$tid" >/dev/null 2>&1
        reclaimed=$((reclaimed + 1))
    done <<< "$stale_ids"

    # TTL safety net: expire triggers stuck pending > 24h
    _trig_db exec \
        "UPDATE pipeline_triggers SET status = 'failed', error = 'ttl_expired' WHERE status = 'pending' AND created_at < datetime('now', '-24 hours')" \
        >/dev/null 2>&1

    [ "$reclaimed" -gt 0 ] && echo "$reclaimed"
}
