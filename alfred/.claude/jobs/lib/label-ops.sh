#!/usr/bin/env bash
# label-ops.sh — Centralized label mutation library for Nexus
#
# ALL scripts that mutate task labels MUST source this file and use these
# functions instead of calling Pulse API directly.
#
# Backend: Pulse API (http://localhost:8700/api/v1) handles mutex enforcement,
# deprecated rejection, gate-stage validation, and audit logging.
#
# Why: Prevents deprecated labels, enforces mutual exclusions at write-time,
# and provides a complete audit trail for every label change.
#
# API (for scripts that `source` this file):
#   label_transition <task_id> <scenario> <source>        # Named scenario (primary)
#   label_stage_transition <task_id> <stage> <source>     # Atomic stage change
#   label_add_validated <task_id> <label> <source>        # Validated single add
#   label_add_csv <task_id> <labels_csv> <source>         # Validated multi-add
#   label_remove_safe <task_id> <label> <source>          # Safe single remove
#   label_remove_csv <task_id> <labels_csv> <source>      # Safe multi-remove
#   label_validate_set <labels_csv> <source>              # Validate without applying
#
# CLI (for LLM personas via nexus-label wrapper):
#   nexus-label stage <task_id> <stage> <source>
#   nexus-label add <task_id> <labels_csv> <source>
#   nexus-label remove <task_id> <labels_csv> <source>
#   nexus-label transition <task_id> <scenario> <source>
#
# Scenarios (label_transition):
#   intake                    — Stamp stage:intake on new task
#   intake-research-route     — Mark as research + approve for headless routing
#   intake-add-research-type  — Add type:research (capability routing fix)
#   intake-stall-unknown-cap  — No executor found, send to Sir
#   close-strip-blockers      — Remove pipeline state labels from closed task
#   claim-for-execute         — Executor claims task: queue→execute
#   release-to-queue          — Executor releases task back: execute→queue
#   escalate-to-david         — Escalate to Sir (review/pause/3-cycle exhaustion)
#   watchdog-missing-stage    — Watchdog: add stage:intake to stageless task
#   watchdog-subtasks-done    — Watchdog: all subtasks closed, advance parent
#   watchdog-add-research-type — Watchdog: add missing type:research
#   watchdog-remove-from-queue — Watchdog: remove stage:queue (parked conflict)
#   watchdog-blocker-to-review — Watchdog: task has blocker at queue, move to review
#   dependency-resolved            — All deps closed, unblock + auto:ready for executor
#   defer-with-trigger        — Dashboard defers task to watch for file changes
#   trigger-satisfied          — Monitor confirms watched condition met
#   trigger-cancel             — Manual cancel, return to waiting:david
#
# Mutation Log:
#   .claude/data/label-mutations.jsonl
#   Format: {timestamp, task_id, scenario, source, action, label}
#
# Consumers:
#   Bash scripts (source this file): event-watcher.sh, executor.sh,
#     pipeline-watchdog.sh, directive-runner.sh
#   LLM personas (via nexus-label CLI): task-evaluator, task-investigator,
#     autofix-executor, researcher, infrastructure-deployer, ai-david,
#     aurora-action, aurora-feedback, aurora-presenter

# Guard against double-sourcing (only when sourced as library, not when run via nexus-label CLI)
if [ "${_LABEL_OPS_CLI_MODE:-}" != "1" ]; then
    [ -n "${_LABEL_OPS_SH_LOADED:-}" ] && return 0
fi
_LABEL_OPS_SH_LOADED=1

# Source Pulse API library for HTTP calls (BEADS = DEAD. Replaced by Pulse API)
source "${BASH_SOURCE[0]%/*}/pulse-api.sh" 2>/dev/null || true

# Source trigger-ops for event-driven pipeline dispatch (graceful — non-fatal if missing)
source "${BASH_SOURCE[0]%/*}/trigger-ops.sh" 2>/dev/null || true

# ============================================================================
# Configuration
# ============================================================================

_LABEL_OPS_PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
LABEL_OPS_LOG="$_LABEL_OPS_PROJECT_DIR/.claude/data/label-mutations.jsonl"

# Ensure log directory exists
mkdir -p "$(dirname "$LABEL_OPS_LOG")" 2>/dev/null || true

# ============================================================================
# Taxonomy: Mutual Exclusion Groups
# These match label-taxonomy.yaml mutual_exclusion definitions exactly.
# ============================================================================

# Each group is a space-separated list. Adding any label from a group
# must remove conflicting members of that group.
_LABEL_MUTEX_GROUPS=(
    "stage:intake stage:evaluate stage:route stage:review stage:queue stage:execute stage:done"
    "auto:ready auto:candidate"
    "risk:safe risk:moderate risk:destructive"
    "parked waiting:david waiting:external waiting:subtasks waiting:session waiting:trigger"
    "review:pending review:escalated review:ready review:research"
    "pipeline:approved pipeline:needs-approval"
)
# Note: completed-by:* labels are NOT in mutex groups. They are write-once
# attribution stamps added at task close time (one per task, no conflicts).
# Defined in label-taxonomy.yaml, enforced by Pulse API.

# ============================================================================
# Taxonomy: Deprecated Labels
# Per label-taxonomy.yaml deprecated section. Rejected at write-time.
# ============================================================================

_LABEL_DEPRECATED=(
    "pipeline:evaluated"
    "pipeline:ai-david-approved"
    "pipeline:modified"
    "auto-approved"
    "auto:blocked"
    "gap:no-executor"
    "waiting:pipeline"
    "waiting:nexus"
    "capability:researcher"
    "capability:developer"
)

# ============================================================================
# Internal Helpers
# ============================================================================

# Log a label mutation to the audit trail
_lops_log() {
    local task_id="$1" scenario="$2" source="$3" action="$4" label="$5"
    jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg tid "$task_id" \
        --arg scen "$scenario" \
        --arg src "$source" \
        --arg act "$action" \
        --arg lbl "$label" \
        '{timestamp:$ts,task_id:$tid,scenario:$scen,source:$src,action:$act,label:$lbl}' \
        >> "$LABEL_OPS_LOG" 2>/dev/null || true

    # Unified audit log (additive — label-mutations.jsonl untouched)
    local audit_action="label.added"
    case "$action" in
        removed) audit_action="label.removed" ;;
        removed-conflict) audit_action="label.mutex_resolved" ;;
        rejected-deprecated|rejected-cross-group) audit_action="label.rejected" ;;
        stage-changed) audit_action="label.stage_changed" ;;
    esac
    # Map source to actor
    local actor="system:label-ops"
    case "$source" in
        executor*) actor="job:task-executor" ;;
        event-watcher) actor="system:event-watcher" ;;
        pipeline-watchdog) actor="system:watchdog" ;;
        directive-runner) actor="persona:${_ACTIVE_PERSONA:-unknown}" ;;
        dashboard) actor="user:david" ;;
        trigger-monitor) actor="system:trigger-ops" ;;
        orchestration-loader) actor="system:dispatcher" ;;
    esac
    log_audit "$actor" "$audit_action" "task" "$task_id" \
        "$(jq -nc --arg label "$label" --arg scenario "$scenario" --arg source "$source" '{label:$label,scenario:$scenario,source:$source}')" 2>/dev/null || true
}

# Log a handoff event — records persona-to-persona routing decisions.
# Usage: lops_log_handoff <task_id> <from_persona> <to_persona> <routing_method> <reason>
#   routing_method: "assigned" | "capability" | "type" | "escalation" | "decompose"
lops_log_handoff() {
    local task_id="$1" from_persona="$2" to_persona="$3" routing_method="$4" reason="$5"
    jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg tid "$task_id" \
        --arg from "$from_persona" \
        --arg to "$to_persona" \
        --arg method "$routing_method" \
        --arg reason "$reason" \
        '{timestamp:$ts,event:"handoff",task_id:$tid,from_persona:$from,to_persona:$to,routing_method:$method,reason:$reason}' \
        >> "$LABEL_OPS_LOG" 2>/dev/null || true

    # Unified audit log
    log_audit "persona:${from_persona}" "task.delegated" "task" "$task_id" \
        "$(jq -nc --arg from "$from_persona" --arg to "$to_persona" --arg method "$routing_method" --arg reason "$reason" '{from_persona:$from,to_persona:$to,routing_method:$method,reason:$reason}')" 2>/dev/null || true
}

# Check if a label is deprecated
_lops_is_deprecated() {
    local label="$1"
    for dep in "${_LABEL_DEPRECATED[@]}"; do
        [ "$dep" = "$label" ] && return 0
    done
    return 1
}

# Find which mutex group a label belongs to (returns group string or empty)
_lops_find_mutex_group() {
    local label="$1"
    for group in "${_LABEL_MUTEX_GROUPS[@]}"; do
        if [[ " $group " == *" $label "* ]]; then
            echo "$group"
            return 0
        fi
    done
    echo ""
}

# Remove conflicting labels from same mutex group before adding a new label.
# Uses cached current_labels if provided (avoids extra pulse show call).
# Usage: _lops_auto_remove_mutex <task_id> <adding_label> <source> [current_labels_csv]
_lops_auto_remove_mutex() {
    local task_id="$1" adding_label="$2" source="$3" current_labels="${4:-}"

    local group
    group=$(_lops_find_mutex_group "$adding_label")
    [ -z "$group" ] && return 0

    # If current labels not provided, fetch them
    if [ -z "$current_labels" ]; then
        current_labels=$(pulse_get_task "$task_id" \
            | jq -r '(.labels // []) | join(",")' 2>/dev/null || echo "")
    fi

    for existing_label in $group; do
        [ "$existing_label" = "$adding_label" ] && continue
        if echo ",$current_labels," | grep -q ",$existing_label,"; then
            pulse_remove_label "$task_id" "$existing_label" "label-ops" >/dev/null 2>&1 || true
            _lops_log "$task_id" "mutex-auto-remove" "$source" "removed-conflict" "$existing_label"
        fi
    done
}

# ============================================================================
# Public API
# ============================================================================

# label_add_validated — Add a single label with full validation.
# Pulse handles deprecated rejection + mutex enforcement server-side.
# Client-side deprecated check kept as early-exit optimization.
# Usage: label_add_validated <task_id> <label> <source>
label_add_validated() {
    local task_id="$1" label="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$label" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_add_validated requires task_id, label, source" >&2
        return 1
    fi

    # Early-exit for deprecated labels (Pulse also rejects these with 422)
    if _lops_is_deprecated "$label"; then
        echo "[label-ops] REJECTED deprecated label '$label' on $task_id (source: $source)" >&2
        _lops_log "$task_id" "direct-add" "$source" "rejected-deprecated" "$label"
        return 1
    fi

    # Cross-group conflict guards (see label-taxonomy.yaml cross_group_exclusions)
    if [ "$label" = "auto:ready" ] || [ "$label" = "pipeline:needs-approval" ]; then
        local current
        current=$(pulse_get_task "$task_id" | jq -r '(.labels // []) | join(",")' 2>/dev/null || echo "")
        # auto:ready cannot coexist with pipeline:needs-approval or any review-bound gate
        if [ "$label" = "auto:ready" ]; then
            for review_gate in pipeline:needs-approval blocked:dependency waiting:david waiting:external waiting:subtasks waiting:session needs-input manual-action review:pending review:escalated; do
                if echo ",$current," | grep -q ",$review_gate,"; then
                    echo "[label-ops] REJECTED auto:ready on $task_id — $review_gate present (source: $source)" >&2
                    _lops_log "$task_id" "direct-add" "$source" "rejected-cross-group" "$label"
                    return 1
                fi
            done
        fi
        # pipeline:needs-approval cannot coexist with blocked:dependency (deps must resolve first)
        if [ "$label" = "pipeline:needs-approval" ] && echo ",$current," | grep -q ",blocked:dependency,"; then
            echo "[label-ops] REJECTED pipeline:needs-approval on $task_id — blocked:dependency present, deps must resolve first (source: $source)" >&2
            _lops_log "$task_id" "direct-add" "$source" "rejected-cross-group" "$label"
            return 1
        fi
    fi

    # blocked:dependency supersedes review-stage gates (deps must resolve first)
    if [ "$label" = "blocked:dependency" ]; then
        local current
        current=$(pulse_get_task "$task_id" | jq -r '(.labels // []) | join(",")' 2>/dev/null || echo "")
        for gate_label in pipeline:needs-approval needs-input; do
            if echo ",$current," | grep -q ",$gate_label,"; then
                echo "[label-ops] AUTO-REMOVE $gate_label on $task_id — blocked:dependency supersedes (source: $source)" >&2
                pulse_remove_label "$task_id" "$gate_label" "$source" >/dev/null 2>&1 || true
                _lops_log "$task_id" "direct-remove" "$source" "auto-removed-superseded" "$gate_label"
            fi
        done
    fi

    # Pulse handles mutex enforcement atomically — no client-side removal needed
    pulse_add_label "$task_id" "$label" "$source" >/dev/null 2>&1 || return 1
    _lops_log "$task_id" "direct-add" "$source" "added" "$label"
    return 0
}

# label_remove_safe — Remove a label with audit logging.
# Usage: label_remove_safe <task_id> <label> <source>
label_remove_safe() {
    local task_id="$1" label="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$label" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_remove_safe requires task_id, label, source" >&2
        return 1
    fi

    pulse_remove_label "$task_id" "$label" "$source" >/dev/null 2>&1 || true
    _lops_log "$task_id" "direct-remove" "$source" "removed" "$label"
    return 0
}

# label_validate_set — Validate a comma-separated list of labels.
# Returns 0 if all valid, 1 if any are deprecated. Prints warnings.
# Used by directive-runner.sh for LLM-generated label sets.
# Usage: label_validate_set <labels_csv> <source>
label_validate_set() {
    local labels_csv="$1" source="$2"
    local has_error=0

    IFS=',' read -ra label_list <<< "$labels_csv"
    for label in "${label_list[@]}"; do
        label=$(echo "$label" | xargs)  # trim whitespace
        [ -z "$label" ] && continue
        if _lops_is_deprecated "$label"; then
            echo "[label-ops] WARN: deprecated label '$label' in set from $source" >&2
            has_error=1
        fi
    done

    return $has_error
}

# label_stage_transition — Atomic stage change with auto-detection.
# Detects the current stage:* label, removes it, and adds the new one.
# Handles mutual exclusion automatically (only one stage at a time).
# Usage: label_stage_transition <task_id> <new_stage> <source>
#   new_stage: intake|evaluate|route|review|queue|execute|done (no "stage:" prefix needed)
label_stage_transition() {
    local task_id="$1" new_stage="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$new_stage" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_stage_transition requires task_id, new_stage, source" >&2
        return 1
    fi

    # Normalize: strip "stage:" prefix if provided
    new_stage="${new_stage#stage:}"

    # Validate stage name
    case "$new_stage" in
        intake|evaluate|route|review|queue|execute|done) ;;
        *)
            echo "[label-ops] ERROR: invalid stage '$new_stage' — must be intake|evaluate|route|review|queue|execute|done" >&2
            return 1
            ;;
    esac

    # Pulse handles atomic stage transition + trigger emit in one call
    pulse_stage_transition "$task_id" "$new_stage" "$source" "label-ops" >/dev/null 2>&1 || return 1
    _lops_log "$task_id" "stage-transition" "$source" "stage-changed" "stage:$new_stage"

    return 0
}

# label_add_csv — Add multiple comma-separated labels with full validation.
# Each label is validated individually (deprecated check, mutex enforcement).
# Usage: label_add_csv <task_id> <labels_csv> <source>
label_add_csv() {
    local task_id="$1" labels_csv="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$labels_csv" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_add_csv requires task_id, labels_csv, source" >&2
        return 1
    fi

    IFS=',' read -ra label_list <<< "$labels_csv"
    for label in "${label_list[@]}"; do
        label=$(echo "$label" | xargs)  # trim whitespace
        [ -z "$label" ] && continue
        label_add_validated "$task_id" "$label" "$source"
    done
    return 0
}

# label_remove_csv — Remove multiple comma-separated labels with audit logging.
# Usage: label_remove_csv <task_id> <labels_csv> <source>
label_remove_csv() {
    local task_id="$1" labels_csv="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$labels_csv" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_remove_csv requires task_id, labels_csv, source" >&2
        return 1
    fi

    IFS=',' read -ra label_list <<< "$labels_csv"
    for label in "${label_list[@]}"; do
        label=$(echo "$label" | xargs)  # trim whitespace
        [ -z "$label" ] && continue
        label_remove_safe "$task_id" "$label" "$source"
    done
    return 0
}

# label_transition — Apply a named scenario transition.
# This is the PRIMARY function all scripts should use for state changes.
# Scenarios encode pre-validated sets of adds and removes.
# Usage: label_transition <task_id> <scenario> <source>
label_transition() {
    local task_id="$1" scenario="$2" source="$3"

    if [ -z "$task_id" ] || [ -z "$scenario" ] || [ -z "$source" ]; then
        echo "[label-ops] ERROR: label_transition requires task_id, scenario, source" >&2
        return 1
    fi

    local adds="" removes=""

    # -----------------------------------------------------------------------
    # Transition Table
    # Every entry is pre-validated against label-taxonomy.yaml.
    # adds: comma-separated labels to add
    # removes: comma-separated labels to remove
    # -----------------------------------------------------------------------
    case "$scenario" in

        # --- event-watcher.sh scenarios ---

        "intake")
            # New task enters pipeline: stamp stage:intake
            adds="stage:intake"
            removes=""
            ;;

        "intake-research-route")
            # Task has capability:research and auto-approved routing:
            # use pipeline:approved (auto-approved is deprecated)
            adds="type:research,pipeline:approved"
            removes=""
            ;;

        "intake-add-research-type")
            # Late-detected research task missing type:research
            adds="type:research"
            removes=""
            ;;

        "intake-stall-unknown-cap")
            # Unknown capability — no executor — escalate to Sir
            adds="waiting:david"
            removes=""
            ;;

        "close-strip-blockers")
            # Task closed: strip all pipeline state labels (meaningless after close)
            adds=""
            removes="needs-input,waiting:david,waiting:external,waiting:subtasks,waiting:session,waiting:trigger,parked,blocked:dependency"
            ;;

        # --- executor.sh scenarios ---

        "claim-for-execute"|"release-to-queue"|"escalate-to-david")
            # These map to Pulse taxonomy transitions — delegate for atomicity
            local pulse_scenario="$scenario"
            case "$scenario" in
                "claim-for-execute") pulse_scenario="dispatch" ;;
                "release-to-queue") pulse_scenario="executor-fail" ;;
                "escalate-to-david") pulse_scenario="route-to-david" ;;
            esac
            if pulse_transition "$task_id" "$pulse_scenario" "$source" "label-ops" >/dev/null 2>&1; then
                _lops_log "$task_id" "$scenario" "$source" "transition" "$pulse_scenario"
            else
                _lops_log "$task_id" "$scenario" "$source" "transition-failed" "$pulse_scenario"
                return 1
            fi
            return 0
            ;;

        # --- task-investigator scenarios ---

        "re-evaluate")
            # Task was misclassified — send back to evaluator for re-assessment.
            # Maps to taxonomy "modify" transition.
            adds="stage:evaluate"
            removes="auto:candidate,stage:route"
            ;;

        # --- pipeline-watchdog.sh correction scenarios ---

        "watchdog-missing-stage")
            # Open task has no stage: label — stamp intake
            adds="stage:intake"
            removes=""
            ;;

        "watchdog-subtasks-done")
            # Parent has waiting:subtasks but all children closed — advance to queue
            adds="stage:queue,auto:ready"
            removes="waiting:subtasks,stage:review"
            ;;

        "watchdog-add-research-type")
            # capability:research task missing type:research routing label
            adds="type:research"
            removes=""
            ;;

        "watchdog-remove-from-queue")
            # Parked task has stage:queue — parked tasks should have no stage
            adds=""
            removes="stage:queue"
            ;;

        "watchdog-blocker-to-review")
            # Task at stage:queue has a dispatch blocker — move to review
            adds="stage:review"
            removes="stage:queue"
            ;;

        # --- project dependency scenarios (formerly orchestration-loader.sh) ---

        "orchestration-block-unresolved")
            # Dependency unresolved — blocked until depends:* tasks complete
            # NOTE: depends:* labels are dynamic — use label_add_validated directly
            adds="blocked:dependency"
            removes=""
            ;;

        "dependency-resolved")
            # All depends:* tasks closed — unblock and queue for executor pickup
            adds="auto:ready"
            removes="blocked:dependency"
            ;;

        "dependency-parent-closed")
            # A parent task closed — clear blocked:dependency if no blocked:AIProjects-* remain
            # The specific blocked:<parent-id> labels are removed individually by the caller;
            # this scenario handles the generic blocker + promotion to auto:ready
            adds="auto:ready,stage:queue"
            removes="blocked:dependency,stage:review"
            ;;

        # --- watch trigger scenarios ---

        "defer-with-trigger")
            # Dashboard: defer task to watch for Obsidian file changes
            adds="waiting:trigger,stage:review"
            removes="waiting:david,review:pending,review:escalated,needs-input,stage:queue"
            ;;

        "trigger-satisfied")
            # Monitor: watched file change satisfied the trigger condition
            adds="auto:ready,pipeline:approved,stage:queue"
            removes="waiting:trigger,stage:review"
            ;;

        "trigger-cancel")
            # Manual: cancel watch trigger, return to Sir's queue
            adds="waiting:david"
            removes="waiting:trigger"
            ;;

        *)
            echo "[label-ops] ERROR: unknown scenario '$scenario' for $task_id (source: $source)" >&2
            _lops_log "$task_id" "$scenario" "$source" "rejected-unknown-scenario" ""
            return 1
            ;;
    esac

    # Apply removes
    if [ -n "$removes" ]; then
        IFS=',' read -ra remove_list <<< "$removes"
        for lbl in "${remove_list[@]}"; do
            [ -z "$lbl" ] && continue
            if pulse_remove_label "$task_id" "$lbl" "$source" >/dev/null 2>&1; then
                _lops_log "$task_id" "$scenario" "$source" "removed" "$lbl"
            else
                _lops_log "$task_id" "$scenario" "$source" "remove-failed" "$lbl"
            fi
        done
    fi

    # Apply adds — Pulse handles mutex enforcement + deprecated rejection + audit
    if [ -n "$adds" ]; then
        IFS=',' read -ra add_list <<< "$adds"
        for lbl in "${add_list[@]}"; do
            [ -z "$lbl" ] && continue
            if pulse_add_label "$task_id" "$lbl" "$source" >/dev/null 2>&1; then
                _lops_log "$task_id" "$scenario" "$source" "added" "$lbl"
            else
                _lops_log "$task_id" "$scenario" "$source" "add-failed" "$lbl"
            fi
        done
    fi

    return 0
}
