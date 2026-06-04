#!/usr/bin/env bash
# pipeline-watchdog.sh — Deterministic pipeline integrity monitor
#
# Runs every dispatcher cycle (5min). Zero LLM cost.
# Checks label integrity, stage consistency, stuck tasks, orphaned subtasks,
# mutual exclusion violations, and deprecated labels. Auto-fixes safe issues.
# Logs everything to pipeline-health.jsonl for LLM review.
#
# Usage:
#   pipeline-watchdog.sh                    # Normal mode (auto-fix + log)
#   pipeline-watchdog.sh --dry-run          # Report only, no fixes
#   pipeline-watchdog.sh --verbose          # Extra detail to stdout
#
# Subsumes Scripts/validate-label-gates.sh (deprecated)
# Metrics pushed to Prometheus Pushgateway for Grafana dashboards

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export JOBS_DIR="$SCRIPT_DIR"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Phase 5.8 (8x3r): Set NEXUS_THREAD_ID for audit correlation.
# pipeline-watchdog runs independently (called by dispatcher but also standalone cron), so it must self-generate.
if [ -z "${NEXUS_THREAD_ID:-}" ]; then
    NEXUS_THREAD_ID="$(date -u +%s)-$$-${RANDOM}"
    export NEXUS_THREAD_ID
fi

export LOG_COMPONENT="pipeline-watchdog"
export JOB_NAME="pipeline-watchdog"

# Source shared utilities
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/label-ops.sh" || { echo "ERROR: label-ops.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/pulse-api.sh" || { echo "ERROR: pulse-api.sh not found" >&2; exit 1; }

# --- Mutual exclusion (prevent concurrent watchdog runs) ---
FLOCK_FILE="${PROJECT_DIR}/.claude/jobs/state/locks/pipeline-watchdog.flock"
exec 200>"$FLOCK_FILE"
flock -n 200 || { log_info "Another watchdog instance running, exiting"; exit 0; }

# --- Configuration ---
DRY_RUN=false
VERBOSE=false
STATE_DIR="$SCRIPT_DIR/state"
HEALTH_LOG="$PROJECT_DIR/.claude/data/pipeline-health.jsonl"
PUSHGATEWAY_URL="${PUSHGATEWAY_URL:-http://localhost:9091}"
SUMMARY_COOLDOWN_FILE="$PROJECT_DIR/.claude/jobs/state/watchdog-last-summary"
SUMMARY_COOLDOWN_SECS=1800  # 30min between Telegram summaries

# Thresholds (seconds)
STUCK_INTAKE_SECS=1800       # 30 min at intake
STUCK_EVALUATE_SECS=3600     # 1 hour at evaluate
STUCK_EXECUTE_SECS=3600      # 1 hour at execute (tightened from 4h — catches crashed executors faster)
STUCK_QUEUE_SECS=7200        # 2 hours at queue (with no blockers)
STALE_IN_PROGRESS_SECS=172800  # 48 hours in_progress

# Parse args
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --verbose) VERBOSE=true ;;
    esac
done

# Ensure jq is available
if ! command -v jq &>/dev/null; then
    log_error "jq is required"
    exit 1
fi

# Ensure directories exist
mkdir -p "$(dirname "$HEALTH_LOG")"
mkdir -p "$PROJECT_DIR/.claude/jobs/state"

# --- Counters (use temp file to survive subshells) ---
COUNTER_FILE=$(mktemp)
echo "0 0 0 0 0" > "$COUNTER_FILE"  # violations fixes warnings critical info
trap 'rm -f "$COUNTER_FILE"' EXIT

inc_violation() { awk '{print $1+1, $2, $3, $4, $5}' "$COUNTER_FILE" > "${COUNTER_FILE}.tmp" && mv "${COUNTER_FILE}.tmp" "$COUNTER_FILE"; }
inc_fix()       { awk '{print $1, $2+1, $3, $4, $5}' "$COUNTER_FILE" > "${COUNTER_FILE}.tmp" && mv "${COUNTER_FILE}.tmp" "$COUNTER_FILE"; }
inc_warning()   { awk '{print $1, $2, $3+1, $4, $5}' "$COUNTER_FILE" > "${COUNTER_FILE}.tmp" && mv "${COUNTER_FILE}.tmp" "$COUNTER_FILE"; }
inc_critical()  { awk '{print $1, $2, $3, $4+1, $5}' "$COUNTER_FILE" > "${COUNTER_FILE}.tmp" && mv "${COUNTER_FILE}.tmp" "$COUNTER_FILE"; }
inc_info()      { awk '{print $1, $2, $3, $4, $5+1}' "$COUNTER_FILE" > "${COUNTER_FILE}.tmp" && mv "${COUNTER_FILE}.tmp" "$COUNTER_FILE"; }

get_violations() { awk '{print $1}' "$COUNTER_FILE"; }
get_fixes()      { awk '{print $2}' "$COUNTER_FILE"; }
get_warnings()   { awk '{print $3}' "$COUNTER_FILE"; }
get_critical()   { awk '{print $4}' "$COUNTER_FILE"; }
get_info()       { awk '{print $5}' "$COUNTER_FILE"; }

NOW_EPOCH=$(date +%s)

# --- JSONL Logging ---
log_health() {
    local severity="$1" check="$2" task_id="$3" message="$4" action="$5" rule="$6"
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    jq -nc \
        --arg ts "$ts" \
        --arg sev "$severity" \
        --arg check "$check" \
        --arg tid "$task_id" \
        --arg msg "$message" \
        --arg act "$action" \
        --arg rule "$rule" \
        --arg dry "$DRY_RUN" \
        '{
            timestamp: $ts,
            severity: $sev,
            check: $check,
            task_id: $tid,
            message: $msg,
            action_taken: $act,
            rule_reference: $rule,
            dry_run: ($dry == "true")
        }' >> "$HEALTH_LOG"

    # Unified audit log — captures both "what" and "why" in a single record.
    # An "action" starting with "none" (e.g., "none — logged for review") is an
    # informational check with no real fix applied, so we don't flag _fix_bool.
    local audit_action="system.healthcheck"
    local _fix_bool=false
    if [ -n "$action" ] && [[ "$action" != none* ]]; then
        audit_action="system.watchdog_fix"
        _fix_bool=true
    fi
    log_audit "system:watchdog" "$audit_action" "task" "$task_id" \
        "$(jq -nc --arg check "$check" --arg sev "$severity" --arg msg "$message" --argjson fix_applied "$_fix_bool" --arg fix_desc "$action" --arg rule "$rule" --argjson dry "$([ "$DRY_RUN" = "true" ] && echo true || echo false)" '{check:$check,severity:$sev,message:$msg,fix_applied:$fix_applied,fix_description:$fix_desc,rule_reference:$rule,dry_run:$dry}')" 2>/dev/null || true

    # Phase 5.5: emit decision_events for fix actions with post-action verification.
    # Only fires when a fix was actually applied (action != "none"), capturing
    # which check fired, why (rule_reference), and whether the label mutation
    # was verified (from apply_fix's _LAST_FIX_VERIFIED module variable).
    # Note: verification is best-effort — when log_health is called before apply_fix
    # (common pattern in some checks), _LAST_FIX_VERIFIED reflects the previous
    # apply_fix call rather than the current one. The check/rule/task_id/action
    # fields are always accurate.
    if [ "$_fix_bool" = "true" ] && [ "$DRY_RUN" != "true" ] && type log_decision &>/dev/null; then
        local _verified="${_LAST_FIX_VERIFIED:-unknown}"
        local _fix_label="${_LAST_FIX_LABEL:-}"
        local _fix_op="${_LAST_FIX_OP:-}"
        log_decision "system:pipeline-watchdog" "fix" "$action" \
            "$(jq -nc --arg check "$check" '[{option:"apply_fix",score:0.9},{option:"skip_and_warn",score:0.1}]')" \
            "$(jq -nc --arg check "$check" --arg sev "$severity" '[{signal:$check,weight:0.7},{signal:("severity_"+$sev),weight:0.3}]')" \
            "0.9" \
            "Watchdog check '$check' fired on task $task_id: $message. Rule: $rule" \
            "$(jq -nc --arg verified "$_verified" --arg label "$_fix_label" --arg op "$_fix_op" --arg check "$check" --arg rule "$rule" \
                '{verified:$verified,label:$label,op:$op,check:$check,rule_reference:$rule}')" \
            "$task_id" 2>/dev/null || true
    fi

    $VERBOSE && echo "  [$severity] $check: $task_id — $message (action: $action)"
    return 0
}

# Apply a label fix via label-ops (respects dry-run mode, routes all mutations through central library)
# Usage: apply_fix <task_id> label add|remove <label>
#
# Phase 5.5: Sets module-level _LAST_FIX_VERIFIED after each call so log_health
# can capture post-action verification status in the decision_events downstream_effect.
# Values: "true"=fix succeeded, "false"=fix failed, "dryrun"=no-op in dry-run mode.
_LAST_FIX_VERIFIED=""
_LAST_FIX_LABEL=""
_LAST_FIX_OP=""
apply_fix() {
    local task_id="$1"; shift
    local _subcommand="$1"  # must be "label" (consumed by shift pattern)
    local action="$2"      # "add" or "remove"
    local label="$3"       # e.g., "stage:intake"
    _LAST_FIX_LABEL="$label"
    _LAST_FIX_OP="$action"

    if $DRY_RUN; then
        log_info "[DRY-RUN] Would run: pulse label $action $task_id $label"
        _LAST_FIX_VERIFIED="dryrun"
        return 0
    fi

    if [ "$action" = "add" ]; then
        if label_add_validated "$task_id" "$label" "pipeline-watchdog"; then
            _LAST_FIX_VERIFIED="true"
        else
            log_warning "apply_fix failed: pulse label add $task_id $label (continuing)"
            _LAST_FIX_VERIFIED="false"
            return 0
        fi
    elif [ "$action" = "remove" ]; then
        if label_remove_safe "$task_id" "$label" "pipeline-watchdog"; then
            _LAST_FIX_VERIFIED="true"
        else
            log_warning "apply_fix failed: pulse label remove $task_id $label (continuing)"
            _LAST_FIX_VERIFIED="false"
            return 0
        fi
    else
        log_warning "apply_fix called with unexpected action: $action (expected add/remove)"
        _LAST_FIX_VERIFIED="false"
        return 1
    fi
}

# ============================================================================
# Data Collection — Single pass to get all open tasks
# ============================================================================

log_info "Pipeline watchdog starting..."

# Get all open/in_progress tasks as JSON → temp files
OPEN_JSON_FILE=$(mktemp)
IP_JSON_FILE=$(mktemp)
TASK_DATA_FILE=$(mktemp)
trap 'rm -f "$COUNTER_FILE" "$TASK_DATA_FILE" "$OPEN_JSON_FILE" "$IP_JSON_FILE"' EXIT

pulse_list_tasks "status=open&limit=500" > "$OPEN_JSON_FILE" 2>/dev/null || echo "[]" > "$OPEN_JSON_FILE"
pulse_list_tasks "status=in_progress&limit=500" > "$IP_JSON_FILE" 2>/dev/null || echo "[]" > "$IP_JSON_FILE"

# Merge into single array and extract TSV for efficient iteration
# Each line: id\tstatus\tlabels_csv\tupdated_at
jq -s '(.[0] // []) + (.[1] // [])' "$OPEN_JSON_FILE" "$IP_JSON_FILE" | \
    jq -r '.[] | [.id, .status, (.labels // [] | join(",")), (.updated_at // .created_at // "")] | @tsv' > "$TASK_DATA_FILE"

TASK_COUNT=$(wc -l < "$TASK_DATA_FILE")

if [ "$TASK_COUNT" -eq 0 ]; then
    log_info "No open tasks found. Watchdog complete."
    exit 0
fi

log_info "Checking $TASK_COUNT tasks..."

# ============================================================================
# Check 1: Missing stage labels
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    # Count stage labels
    STAGE_COUNT=$(echo "$LABELS" | grep -c 'stage:[a-z]*' 2>/dev/null || echo "0")
    STAGE_COUNT=${STAGE_COUNT//[^0-9]/}

    # Skip parked/deferred tasks (legitimately have no stage)
    echo ",$LABELS," | grep -q ',parked,' && continue

    if [ "$STAGE_COUNT" -eq 0 ]; then
        inc_violation
        log_health "warning" "missing-stage" "$TID" "Open task has no stage: label" "added stage:intake" "stage-lifecycle.md: every open task must have exactly one stage label"
        apply_fix "$TID" label add "stage:intake"
        inc_fix
    elif [ "$STAGE_COUNT" -gt 1 ]; then
        inc_violation
        STAGES=$(echo "$LABELS" | grep -o 'stage:[a-z]*' | tr '\n' ' ' || true)
        # Auto-fix: determine correct stage from highest-priority gate label
        CORRECT_STAGE="intake"
        echo ",$LABELS," | grep -qE ',waiting:david,|,waiting:external,|,waiting:subtasks,|,waiting:session,|,needs-input,|,manual-action,|,pipeline:needs-approval,|,review:pending,|,review:escalated,|,review:ready,' && CORRECT_STAGE="review"
        echo ",$LABELS," | grep -q ',blocked:dependency,' && CORRECT_STAGE="queue"
        echo ",$LABELS," | grep -q ',auto:ready,' && [ "$CORRECT_STAGE" = "intake" ] && CORRECT_STAGE="queue"
        echo ",$LABELS," | grep -q ',auto:candidate,' && [ "$CORRECT_STAGE" = "intake" ] && CORRECT_STAGE="route"
        log_health "warning" "multiple-stages" "$TID" "Task has $STAGES — auto-fixing to stage:$CORRECT_STAGE" "fixed to stage:$CORRECT_STAGE" "label-taxonomy.yaml: mutual_exclusions stage set"
        for s in $STAGES; do
            apply_fix "$TID" label remove "$s"
        done
        apply_fix "$TID" label add "stage:$CORRECT_STAGE"
        inc_fix
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 2: Gate-stage misalignment
# ============================================================================

# Gate → valid stage mappings (pipe-delimited for simple parsing)
GATE_RULES="waiting:david|review
waiting:external|review
waiting:subtasks|review
waiting:session|review
needs-input|review
manual-action|review
pipeline:needs-approval|review
auto:candidate|route
review:pending|review
review:escalated|review
review:ready|review
blocked:dependency|queue
blocked:budget|queue
aurora:executing|execute
needs:decomposition|review"
# Note: orchestrator:managed is NOT a gate rule — it's a governance signal
# meaning "Orchestrator owns this task's routing, watchdog should not auto-fix."
# Handled separately in the skip logic below, not as a gate→stage mapping.

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    CURRENT_STAGE=$(echo "$LABELS" | grep -o 'stage:[a-z]*' | head -1 | sed 's/stage://' || true)
    [ -z "$CURRENT_STAGE" ] && continue

    # Skip gate-stage enforcement for Orchestrator-managed tasks (governance model v1)
    if echo ",$LABELS," | grep -q ',orchestrator:managed,'; then
        continue
    fi

    # Check each gate rule
    # Priority: review-bound gates supersede route-bound gates when both present.
    # If task has review-bound gate (e.g. pipeline:needs-approval) AND route-bound gate
    # (e.g. auto:candidate), review wins and auto:candidate gets stripped.
    HAS_REVIEW_GATE=false
    if echo ",$LABELS," | grep -qE ',waiting:david,|,waiting:external,|,waiting:subtasks,|,waiting:session,|,needs-input,|,manual-action,|,pipeline:needs-approval,|,review:pending,|,review:escalated,|,review:ready,'; then
        HAS_REVIEW_GATE=true
    fi

    while IFS='|' read -r GATE VALID_STAGE; do
        if echo ",$LABELS," | grep -q ",$GATE,"; then
            # Skip review-bound gates if blocked:dependency is present (it takes priority)
            if [ "$VALID_STAGE" = "review" ] && echo ",$LABELS," | grep -q ",blocked:dependency,"; then
                continue
            fi
            # Skip route-bound gates if blocked:dependency is present (blocked > route)
            if [ "$VALID_STAGE" = "route" ] && echo ",$LABELS," | grep -q ",blocked:dependency,"; then
                log_health "info" "gate-conflict-resolved" "$TID" "Removing $GATE (blocked:dependency takes priority over route)" "removed $GATE" "pipeline-watchdog: blocked > route precedence"
                apply_fix "$TID" label remove "$GATE"
                inc_fix
                continue
            fi
            # Skip route-bound gates if a review-bound gate is also present (review wins)
            if [ "$VALID_STAGE" = "route" ] && [ "$HAS_REVIEW_GATE" = "true" ]; then
                # Strip the conflicting route-bound gate label
                log_health "info" "gate-conflict-resolved" "$TID" "Removing $GATE (review gate takes priority)" "removed $GATE" "pipeline-watchdog: review > route precedence"
                apply_fix "$TID" label remove "$GATE"
                inc_fix
                continue
            fi
            if [ "$CURRENT_STAGE" != "$VALID_STAGE" ]; then
                inc_violation
                log_health "warning" "gate-stage-misalign" "$TID" "Has $GATE at stage:$CURRENT_STAGE (expected stage:$VALID_STAGE)" "moved to stage:$VALID_STAGE" "label-taxonomy.yaml: gate_stage_rules"
                apply_fix "$TID" label remove "stage:$CURRENT_STAGE"
                apply_fix "$TID" label add "stage:$VALID_STAGE"
                inc_fix
                CURRENT_STAGE="$VALID_STAGE"  # Update for subsequent checks
            fi
        fi
    done <<< "$GATE_RULES"

    # Check auto:ready (valid at queue or execute)
    # Skip if a higher-priority gate is present — they take precedence over auto:ready
    if echo ",$LABELS," | grep -q ",auto:ready,"; then
        if ! echo ",$LABELS," | grep -qE ",pipeline:needs-approval,|,blocked:dependency,|,waiting:david,|,waiting:external,|,waiting:subtasks,|,waiting:session,|,needs-input,|,manual-action,|,review:pending,|,review:escalated,"; then
            if [ "$CURRENT_STAGE" != "queue" ] && [ "$CURRENT_STAGE" != "execute" ]; then
                inc_violation
                log_health "warning" "gate-stage-misalign" "$TID" "Has auto:ready at stage:$CURRENT_STAGE (expected queue or execute)" "moved to stage:queue" "label-taxonomy.yaml: gate_stage_rules auto:ready"
                apply_fix "$TID" label remove "stage:$CURRENT_STAGE"
                apply_fix "$TID" label add "stage:queue"
                inc_fix
            fi
        fi
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 3: Mutual exclusion violations
# ============================================================================

# Format: preferred_keep|label1,label2,label3,...
MUTEX_RULES="auto:ready|auto:ready,auto:candidate
pipeline:approved|pipeline:approved,pipeline:needs-approval
|risk:safe,risk:moderate,risk:destructive
|waiting:david,waiting:external,waiting:subtasks
|review:pending,review:escalated,review:ready"

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    while IFS='|' read -r KEEP_PREF SET_CSV; do
        IFS=',' read -ra SET_LABELS <<< "$SET_CSV"
        FOUND=()
        for LBL in "${SET_LABELS[@]}"; do
            echo ",$LABELS," | grep -q ",$LBL," && FOUND+=("$LBL")
        done

        if [ "${#FOUND[@]}" -gt 1 ]; then
            inc_violation
            FOUND_STR=$(IFS=','; echo "${FOUND[*]}")

            # Determine which to keep
            KEEP=""
            if [ -n "$KEEP_PREF" ]; then
                for F in "${FOUND[@]}"; do
                    [ "$F" = "$KEEP_PREF" ] && KEEP="$F" && break
                done
            fi
            [ -z "$KEEP" ] && KEEP="${FOUND[0]}"

            REMOVED=()
            for LBL in "${FOUND[@]}"; do
                if [ "$LBL" != "$KEEP" ]; then
                    apply_fix "$TID" label remove "$LBL"
                    REMOVED+=("$LBL")
                fi
            done
            REMOVED_STR=$(IFS=','; echo "${REMOVED[*]}")

            log_health "warning" "mutual-exclusion" "$TID" "Multiple labels from exclusive set: $FOUND_STR" "kept $KEEP, removed $REMOVED_STR" "label-taxonomy.yaml: mutual_exclusions"
            inc_fix
        fi
    done <<< "$MUTEX_RULES"

    # Special: parked + any waiting:* or auto:*
    if echo ",$LABELS," | grep -q ",parked,"; then
        for CONFLICT in waiting:david waiting:external waiting:subtasks waiting:session auto:ready auto:candidate blocked:dependency; do
            if echo ",$LABELS," | grep -q ",$CONFLICT,"; then
                inc_violation
                log_health "warning" "parked-conflict" "$TID" "Parked task has $CONFLICT (conflicting)" "removed $CONFLICT" "label-taxonomy.yaml: mutual_exclusions parked set"
                apply_fix "$TID" label remove "$CONFLICT"
                inc_fix
            fi
        done
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 3.5: Cross-group conflict detection
# ============================================================================
# These label pairs are semantically incompatible but live in different mutex
# groups, so within-group enforcement doesn't catch them.

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    # pipeline:needs-approval + auto:ready → remove auto:ready (approval hasn't happened)
    if echo ",$LABELS," | grep -q ",pipeline:needs-approval," && echo ",$LABELS," | grep -q ",auto:ready,"; then
        inc_violation
        log_health "error" "cross-group-conflict" "$TID" "Has pipeline:needs-approval + auto:ready (semantically incompatible)" "removed auto:ready" "label-taxonomy.yaml: cross_group_exclusions"
        apply_fix "$TID" label remove "auto:ready"
        inc_fix
    fi

    # pipeline:needs-approval + blocked:dependency → remove pipeline:needs-approval (deps first)
    if echo ",$LABELS," | grep -q ",pipeline:needs-approval," && echo ",$LABELS," | grep -q ",blocked:dependency,"; then
        inc_violation
        log_health "error" "cross-group-conflict" "$TID" "Has pipeline:needs-approval + blocked:dependency (deps must resolve first)" "removed pipeline:needs-approval" "label-taxonomy.yaml: cross_group_exclusions"
        apply_fix "$TID" label remove "pipeline:needs-approval"
        inc_fix
    fi

    # needs-input + blocked:dependency → remove needs-input (deps first)
    if echo ",$LABELS," | grep -q ",needs-input," && echo ",$LABELS," | grep -q ",blocked:dependency,"; then
        inc_violation
        log_health "error" "cross-group-conflict" "$TID" "Has needs-input + blocked:dependency (deps must resolve first)" "removed needs-input" "label-taxonomy.yaml: cross_group_exclusions"
        apply_fix "$TID" label remove "needs-input"
        inc_fix
    fi

    # auto:ready + any review-bound gate → remove auto:ready (review gates take priority)
    if echo ",$LABELS," | grep -q ",auto:ready,"; then
        for review_gate in waiting:david waiting:external waiting:subtasks waiting:session needs-input manual-action review:pending review:escalated; do
            if echo ",$LABELS," | grep -q ",$review_gate,"; then
                inc_violation
                log_health "error" "cross-group-conflict" "$TID" "Has auto:ready + $review_gate (review gates take priority)" "removed auto:ready" "label-taxonomy.yaml: cross_group_exclusions"
                apply_fix "$TID" label remove "auto:ready"
                inc_fix
                break
            fi
        done
    fi
    # pipeline:approved + blocker label + stage:review → approval without transition
    # AI David or dashboard approved but the full transition didn't fire.
    # Fix: remove stale blocker labels so executors can pick up the task.
    if echo ",$LABELS," | grep -q ",pipeline:approved," && echo ",$LABELS," | grep -q ",stage:review,"; then
        _found_blocker=0
        for blocker in waiting:david waiting:external waiting:session needs-input manual-action auto:candidate; do
            if echo ",$LABELS," | grep -q ",$blocker,"; then
                _found_blocker=1
                apply_fix "$TID" label remove "$blocker"
            fi
        done
        if [ "$_found_blocker" -eq 1 ]; then
            inc_violation
            log_health "error" "approval-without-transition" "$TID" "Has pipeline:approved + stage:review + blocker labels (approval didn't complete transition)" "removed blocker labels + stage:review; added stage:queue, auto:ready" "routing-rules.yaml: review.outcomes.queue"
            apply_fix "$TID" label remove "pipeline:needs-approval"
            apply_fix "$TID" label remove "stage:review"
            apply_fix "$TID" label add "stage:queue"
            apply_fix "$TID" label add "auto:ready"
            inc_fix
        fi
    fi

done < "$TASK_DATA_FILE"

# ============================================================================
# Check 4: Deprecated labels
# ============================================================================

# Format: deprecated_label|action (remove or migrate:new_label)
DEPRECATED_RULES="pipeline:evaluated|remove
pipeline:ai-david-approved|migrate:pipeline:approved
pipeline:modified|remove
auto-approved|migrate:pipeline:approved
auto:blocked|remove
gap:no-executor|migrate:blocked:dependency
waiting:pipeline|migrate:blocked:dependency"

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    while IFS='|' read -r DEP_LABEL ACTION; do
        if echo ",$LABELS," | grep -q ",$DEP_LABEL,"; then
            inc_violation
            apply_fix "$TID" label remove "$DEP_LABEL"

            if [[ "$ACTION" == migrate:* ]]; then
                NEW_LABEL="${ACTION#migrate:}"
                apply_fix "$TID" label add "$NEW_LABEL"
                log_health "info" "deprecated-label" "$TID" "Migrated deprecated $DEP_LABEL to $NEW_LABEL" "removed $DEP_LABEL, added $NEW_LABEL" "label-taxonomy.yaml: deprecated section"
            else
                log_health "info" "deprecated-label" "$TID" "Removed deprecated label $DEP_LABEL" "removed $DEP_LABEL" "label-taxonomy.yaml: deprecated section"
            fi
            inc_fix
        fi
    done <<< "$DEPRECATED_RULES"
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 5: Stuck tasks (time-based)
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ -z "$UPDATED" ] && continue

    UPDATED_EPOCH=$(date -d "$UPDATED" +%s 2>/dev/null || echo "0")
    [ "$UPDATED_EPOCH" -eq 0 ] && continue
    AGE_SECS=$((NOW_EPOCH - UPDATED_EPOCH))
    AGE_HOURS=$((AGE_SECS / 3600))

    CURRENT_STAGE=$(echo "$LABELS" | grep -o 'stage:[a-z]*' | head -1 | sed 's/stage://' || true)

    if [ "$CURRENT_STAGE" = "intake" ] && [ "$AGE_SECS" -gt "$STUCK_INTAKE_SECS" ]; then
        inc_info
        log_health "info" "stuck-intake" "$TID" "Task stuck at stage:intake for ${AGE_HOURS}h (threshold: $((STUCK_INTAKE_SECS/60))min)" "none — logged for review" "workflow-inventory: intake should be ~2min"
    fi

    if [ "$CURRENT_STAGE" = "evaluate" ] && [ "$AGE_SECS" -gt "$STUCK_EVALUATE_SECS" ]; then
        inc_info
        log_health "info" "stuck-evaluate" "$TID" "Task stuck at stage:evaluate for ${AGE_HOURS}h (threshold: $((STUCK_EVALUATE_SECS/3600))h)" "none — logged for review" "workflow-inventory: evaluate should be ~10min"
    fi

    if [ "$CURRENT_STAGE" = "execute" ] && [ "$AGE_SECS" -gt "$STUCK_EXECUTE_SECS" ]; then
        inc_critical
        log_health "error" "stuck-execute" "$TID" "Task stuck at stage:execute for ${AGE_HOURS}h (threshold: $((STUCK_EXECUTE_SECS/3600))h)" "none — needs manual review" "workflow-inventory: execute should be ~3min"
    fi

    if [ "$CURRENT_STAGE" = "queue" ] && [ "$AGE_SECS" -gt "$STUCK_QUEUE_SECS" ]; then
        # type:parent tasks don't execute directly — skip stuck-queue diagnosis
        if echo ",$LABELS," | grep -q ",type:parent,"; then
            # Parent tasks should not have auto:ready (they wait for subtasks)
            if echo ",$LABELS," | grep -q ",auto:ready,"; then
                inc_violation
                log_health "warning" "parent-has-auto-ready" "$TID" "type:parent task has auto:ready — parents don't execute directly" "removed auto:ready" "label-taxonomy: type:parent waits for subtasks"
                apply_fix "$TID" label remove "auto:ready"
                inc_fix
            fi
            continue
        fi
        if ! echo "$LABELS" | grep -qE 'waiting:david|waiting:session|needs-input|parked|blocked:dependency'; then
            # Check if missing auto:ready — the most common cause of stuck-queue
            if echo ",$LABELS," | grep -q ",pipeline:approved," && ! echo ",$LABELS," | grep -q ",auto:ready,"; then
                inc_violation
                log_health "warning" "missing-auto-ready" "$TID" "Task at stage:queue for ${AGE_HOURS}h has pipeline:approved but missing auto:ready — executor will never pick it up" "added auto:ready" "registry.yaml: executor Step 1 requires auto:ready"
                apply_fix "$TID" label add "auto:ready"
                inc_fix
            else
                inc_info
                log_health "info" "stuck-queue" "$TID" "Task at stage:queue for ${AGE_HOURS}h with no dispatch blockers" "none — may be missing executor pickup" "routing-rules.yaml: pickup_criteria"
            fi
        fi
    fi

    if [ "$STATUS" = "in_progress" ] && [ "$AGE_SECS" -gt "$STALE_IN_PROGRESS_SECS" ]; then
        inc_info
        log_health "info" "stale-in-progress" "$TID" "Task in_progress for ${AGE_HOURS}h with no update (threshold: $((STALE_IN_PROGRESS_SECS/3600))h)" "none — logged for review" "health-summary: stale in_progress detection"
    fi
done < "$TASK_DATA_FILE"

# ---- Check 5b: Unclaimed in_progress auto-revert ----
# Tasks that are in_progress but have no assignee (i.e., never properly claimed)
# are likely corruption from project advance-all or event-watcher bypassing the
# transition engine. Auto-revert to open after 10 minutes.
UNCLAIMED_IP_SECS=1800  # 30 minutes — generous to avoid racing with slow executor startups

log_info "Check 5b: Unclaimed in_progress auto-revert"

# Reuse $IP_JSON_FILE already fetched at top of script (line 146) — no redundant API call
while IFS='|' read -r TID ASSIGNEE UPDATED_AT; do
    [ -z "$TID" ] && continue

    # Skip tasks that have a proper assignee (legitimately claimed)
    if [ -n "$ASSIGNEE" ] && [ "$ASSIGNEE" != "null" ]; then
        continue
    fi

    # Check age — only revert if unclaimed for >30 minutes
    UPDATED_EPOCH=$(date -d "$UPDATED_AT" +%s 2>/dev/null || echo "0")
    [ "$UPDATED_EPOCH" -eq 0 ] && continue
    AGE_SECS=$((NOW_EPOCH - UPDATED_EPOCH))

    if [ "$AGE_SECS" -gt "$UNCLAIMED_IP_SECS" ]; then
        AGE_MINS=$((AGE_SECS / 60))
        inc_violation
        log_health "warning" "unclaimed-in-progress" "$TID" "Task in_progress for ${AGE_MINS}min with no assignee (unclaimed) — reverting to open" "reverted to status:open" "status-hygiene: only executors should set in_progress via claim"

        if ! $DRY_RUN; then
            pulse_update_task "$TID" '{"status":"open","actor":"pipeline-watchdog"}' >/dev/null 2>&1 || log_warning "Failed to revert $TID to open"
            log_audit "system:watchdog" "task.status_reverted" "task" "$TID" \
                "$(jq -nc --argjson age_mins "$AGE_MINS" '{from_status:"in_progress",to_status:"open",reason:"unclaimed for too long",age_minutes:$age_mins}')" 2>/dev/null || true
        fi
        inc_fix
    fi
done < <(jq -r '.[] | "\(.id)|\(.assignee // "null")|\(.updated_at // .created_at // "")"' "$IP_JSON_FILE")

# ============================================================================
# Check 6: Dispatch blocker conflicts at queue
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    CURRENT_STAGE=$(echo "$LABELS" | grep -o 'stage:[a-z]*' | head -1 | sed 's/stage://' || true)

    if [ "$CURRENT_STAGE" = "queue" ]; then
        for BLOCKER in waiting:david waiting:session needs-input; do
            if echo ",$LABELS," | grep -q ",$BLOCKER,"; then
                inc_violation
                log_health "warning" "queue-with-blocker" "$TID" "Task at stage:queue has dispatch blocker $BLOCKER — will never be picked up" "moved to stage:review" "routing-rules.yaml: dispatch_blockers"
                apply_fix "$TID" label remove "stage:queue"
                apply_fix "$TID" label add "stage:review"
                inc_fix
                break  # Only move once
            fi
        done
        # Parked at queue → move to review (parked tasks shouldn't have stage:queue)
        if echo ",$LABELS," | grep -q ",parked,"; then
            inc_violation
            log_health "warning" "queue-with-parked" "$TID" "Parked task at stage:queue — parked tasks should have no stage" "removed stage:queue" "label-taxonomy.yaml: parked tasks outside pipeline"
            apply_fix "$TID" label remove "stage:queue"
            inc_fix
        fi
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 7: Orphaned subtasks (parent closed, children still open)
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    PARENT_ID=$(echo "$LABELS" | grep -o 'parent:[A-Za-z0-9-]*' | head -1 | sed 's/parent://' || true)
    [ -z "$PARENT_ID" ] && continue

    # Check parent status via Pulse API
    PARENT_DATA=$(pulse_get_task "$PARENT_ID" 2>/dev/null || echo "")
    [ -z "$PARENT_DATA" ] && continue
    PARENT_STATUS=$(echo "$PARENT_DATA" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    if [ "$PARENT_STATUS" = "closed" ]; then
        # Skip if subtask is actively gated (in review, escalated, or awaiting input) — not truly orphaned
        if echo ",$LABELS," | grep -qE ",stage:review,|,review:escalated,|,review:pending,|,waiting:david,|,waiting:session,|,waiting:external,|,needs-input,|,manual-action,"; then
            continue
        fi
        inc_warning
        log_health "warning" "orphaned-subtask" "$TID" "Parent $PARENT_ID is closed but this subtask is still open" "none — logged for review" "workflow-inventory: PATH O orchestration cascade"
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 8: waiting:subtasks with all subtasks closed
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    if echo ",$LABELS," | grep -q ",waiting:subtasks,"; then
        OPEN_CHILDREN=$(pulse_list_tasks "status=open&label=parent:$TID&limit=500" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
        OPEN_CHILDREN=${OPEN_CHILDREN//[^0-9]/}

        if [ "$OPEN_CHILDREN" -eq 0 ]; then
            inc_violation
            log_health "info" "subtasks-complete" "$TID" "Has waiting:subtasks but all subtasks are closed — should advance" "removed waiting:subtasks, moved to stage:queue" "workflow-inventory: parent auto-advances when children complete"
            if $DRY_RUN; then
                log_info "[DRY-RUN] Would run: label_transition $TID watchdog-subtasks-done"
            else
                label_transition "$TID" "watchdog-subtasks-done" "pipeline-watchdog"
            fi
            inc_fix
        fi
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 9: Research tasks missing type:research (executor routing bug C5)
# ============================================================================

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue

    if echo ",$LABELS," | grep -q ",capability:research," && ! echo ",$LABELS," | grep -q ",type:research,"; then
        inc_warning
        log_health "info" "missing-type-research" "$TID" "Has capability:research but missing type:research — may be picked up by wrong executor" "added type:research" "nexus-pipeline-audit C5: research tasks need type:research for routing"
        apply_fix "$TID" label add "type:research"
        inc_fix
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 10: blocked:dependency auto-clear
# ============================================================================
# Tasks with blocked:dependency — check if all depends:* tasks are now closed

log_info "Check 10: blocked:dependency auto-clear"
BLOCKED_DEP_TASKS=$(pulse_list_tasks "status=open&label=blocked:dependency&limit=500" 2>/dev/null || echo "[]")
BLOCKED_DEP_COUNT=$(echo "$BLOCKED_DEP_TASKS" | jq 'length')

if [ "$BLOCKED_DEP_COUNT" -gt 0 ]; then
  while IFS='|' read -r TASK_ID TASK_LABELS; do
    # Extract depends:* labels
    DEP_IDS=$(echo "$TASK_LABELS" | tr ',' '\n' | grep '^depends:' | sed 's/^depends://') || true
    if [ -z "$DEP_IDS" ]; then
      # No depends: labels but has blocked:dependency — stale blocker
      inc_violation
      log_health "warning" "stale-blocked-dependency" "$TASK_ID" "blocked:dependency with no depends:* labels — stale blocker" "removed blocked:dependency" "label-ops: blocked:dependency requires depends:* labels"
      if ! $DRY_RUN; then
        apply_fix "$TASK_ID" label remove "blocked:dependency"
      fi
      inc_fix
      continue
    fi

    ALL_RESOLVED=true
    while IFS= read -r DEP_ID; do
      DEP_STATUS=$(pulse_get_task "$DEP_ID" 2>/dev/null | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
      if [ "$DEP_STATUS" != "closed" ]; then
        ALL_RESOLVED=false
        break
      fi
    done <<< "$DEP_IDS"

    if $ALL_RESOLVED; then
      inc_violation
      log_health "info" "deps-resolved" "$TASK_ID" "All dependencies resolved — deps-resolved → added auto:ready for executor pickup" "removed blocked:dependency + depends:* labels, added auto:ready" "orchestration-loader: dependency auto-clear"
      if ! $DRY_RUN; then
        label_transition "$TASK_ID" "dependency-resolved" "pipeline-watchdog"
        # Also remove the depends:* labels since they're resolved
        while read -r DEP_LABEL; do
          label_remove_safe "$TASK_ID" "$DEP_LABEL" "pipeline-watchdog"
        done < <(echo "$TASK_LABELS" | tr ',' '\n' | grep '^depends:')
      fi
      inc_fix
    fi
  done < <(echo "$BLOCKED_DEP_TASKS" | jq -r '.[] | "\(.id)|\(.labels // [] | join(","))"')
fi

# ============================================================================
# Check 10b: Orphaned blocked:<task-id> auto-clear
# ============================================================================
# Tasks with blocked:AIProjects-xxx labels where the referenced task is closed.
# This catches the reverse-dependency gap: when a parent closes, its dependents
# retain blocked:<parent-id> indefinitely because nothing clears them.
# See AIProjects-bk5x for the root-cause analysis.

log_info "Check 10b: orphaned blocked:<task-id> auto-clear"

# Query ALL open tasks and filter client-side for blocked:AIProjects-* labels
# (Pulse label search doesn't support prefix matching)
ALL_OPEN_TASKS=$(pulse_list_tasks "status=open&limit=500" 2>/dev/null || echo "[]")
ORPHAN_CANDIDATES=$(echo "$ALL_OPEN_TASKS" | jq -c '[.[] | select(.labels[]? | startswith("blocked:AIProjects-"))]')
ORPHAN_COUNT=$(echo "$ORPHAN_CANDIDATES" | jq 'length')

if [ "$ORPHAN_COUNT" -gt 0 ]; then
  while IFS='|' read -r TASK_ID TASK_LABELS; do
    # Extract all blocked:AIProjects-* labels
    BLOCKER_LABELS=$(echo "$TASK_LABELS" | tr ',' '\n' | grep '^blocked:AIProjects-')
    UNRESOLVED=false

    while IFS= read -r BLOCKER_LABEL; do
      PARENT_ID="${BLOCKER_LABEL#blocked:}"
      PARENT_STATUS=$(pulse_get_task "$PARENT_ID" 2>/dev/null | jq -r '.status // "unknown"')

      if [ "$PARENT_STATUS" = "closed" ]; then
        # Parent is closed — remove orphaned blocker label
        inc_violation
        log_health "info" "orphaned-blocker-cleared" "$TASK_ID" \
          "blocked:$PARENT_ID but $PARENT_ID is closed — clearing orphaned blocker" \
          "removed blocked:$PARENT_ID" \
          "bk5x: reverse dependency resolution on parent close"
        if ! $DRY_RUN; then
          label_remove_safe "$TASK_ID" "$BLOCKER_LABEL" "pipeline-watchdog"
        fi
        inc_fix
      else
        UNRESOLVED=true
      fi
    done <<< "$BLOCKER_LABELS"

    # If all blocked:AIProjects-* labels were cleared, promote to auto:ready
    if [ "$UNRESOLVED" = "false" ] && ! $DRY_RUN; then
      # Re-check: are there any remaining blocked:* labels after our removals?
      REMAINING_BLOCKERS=$(pulse_get_task_labels "$TASK_ID" 2>/dev/null | grep '^blocked:' || true)
      if [ -z "$REMAINING_BLOCKERS" ]; then
        log_health "info" "dependency-fully-resolved" "$TASK_ID" \
          "All blockers cleared — promoting to auto:ready" \
          "dependency-parent-closed transition" \
          "bk5x: full dependency chain resolution"
        label_transition "$TASK_ID" "dependency-parent-closed" "pipeline-watchdog"
        # Also clear depends:* labels (resolved)
        while IFS= read -r DEP_LABEL; do
          label_remove_safe "$TASK_ID" "$DEP_LABEL" "pipeline-watchdog"
        done < <(echo "$TASK_LABELS" | tr ',' '\n' | grep '^depends:')
      fi
    fi
  done < <(echo "$ORPHAN_CANDIDATES" | jq -r '.[] | "\(.id)|\(.labels // [] | join(","))"')
fi

# ============================================================================
# Check 11: Pipeline runner health
# ============================================================================
# Only check if the systemd service is installed and enabled

RUNNER_SERVICE_ACTIVE=false
if systemctl is-enabled pipeline-runner.service >/dev/null 2>&1; then
    RUNNER_SERVICE_ACTIVE=true
fi

if [ "$RUNNER_SERVICE_ACTIVE" = "true" ]; then
    RUNNER_PID_FILE="$STATE_DIR/pipeline-runner.pid"
    RUNNER_HEARTBEAT="$STATE_DIR/pipeline-runner-heartbeat"

    if [ -f "$RUNNER_PID_FILE" ]; then
        RUNNER_PID=$(cat "$RUNNER_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$RUNNER_PID" ] && ! kill -0 "$RUNNER_PID" 2>/dev/null; then
            inc_warning
            log_health "warning" "runner-crashed" "" "Pipeline runner PID $RUNNER_PID is dead but PID file exists" "none — service should auto-restart" "pipeline-runner.service: Restart=on-failure"
        fi
    fi

    if [ -f "$RUNNER_HEARTBEAT" ]; then
        RUNNER_HB_AGE=$(( NOW_EPOCH - $(stat -c %Y "$RUNNER_HEARTBEAT" 2>/dev/null || echo "$NOW_EPOCH") ))
        if [ "$RUNNER_HB_AGE" -gt 60 ]; then
            inc_warning
            log_health "warning" "runner-stale" "" "Pipeline runner heartbeat is ${RUNNER_HB_AGE}s old (threshold: 60s)" "none — check service status" "pipeline-runner: heartbeat expected every 5s"
        fi
    fi
fi

# ============================================================================
# Check 12: Closed tasks with stale execution labels
# ============================================================================
# Closed tasks should not have execution/gate labels — these are pipeline state
# that becomes meaningless after closure. Runs on a sample (limit 100) per cycle.

log_info "Check 12: Closed task label cleanup"
CLOSED_JSON=$(pulse_list_tasks "status=closed&limit=100" 2>/dev/null || echo "[]")
CLOSED_CLEANUP_COUNT=0

# Execution labels that should not exist on closed tasks
# Keep: pipeline:approved, pipeline:has-orchestration, risk:*, capability:*, all metadata
# NOTE: review:research is intentionally EXCLUDED from cleanup — it's a human
# review gate that must survive closure for dashboard visibility and audit trail.
STALE_PREFIXES="stage: auto: waiting: blocked:"
STALE_EXACT="needs-input manual-action parked pipeline:needs-approval pipeline:evaluated aurora:executing aurora:building review:pending review:escalated review:ready"

while IFS='|' read -r TASK_ID TASK_LABELS; do
    [ -z "$TASK_ID" ] && continue
    IFS=',' read -ra LABEL_ARRAY <<< "$TASK_LABELS"
    for LABEL in "${LABEL_ARRAY[@]}"; do
        LABEL=$(echo "$LABEL" | xargs)  # trim whitespace
        [ -z "$LABEL" ] && continue
        SHOULD_REMOVE=false

        # Check prefix match
        for PREFIX in $STALE_PREFIXES; do
            if [[ "$LABEL" == ${PREFIX}* ]]; then
                SHOULD_REMOVE=true
                break
            fi
        done

        # Check exact match
        if ! $SHOULD_REMOVE; then
            for EXACT in $STALE_EXACT; do
                if [ "$LABEL" = "$EXACT" ]; then
                    SHOULD_REMOVE=true
                    break
                fi
            done
        fi

        if $SHOULD_REMOVE; then
            CLOSED_CLEANUP_COUNT=$((CLOSED_CLEANUP_COUNT + 1))
            if $DRY_RUN; then
                log_info "[DRY-RUN] Would remove stale label '$LABEL' from closed task $TASK_ID"
            else
                label_remove_safe "$TASK_ID" "$LABEL" "pipeline-watchdog" 2>/dev/null || true
            fi
        fi
    done
done < <(echo "$CLOSED_JSON" | jq -r '.[] | [.id, (.labels // [] | join(","))] | join("|")')

if [ "$CLOSED_CLEANUP_COUNT" -gt 0 ]; then
    inc_fix
    log_health "info" "closed-label-cleanup" "" "Removed $CLOSED_CLEANUP_COUNT stale execution labels from closed tasks" "labels removed" "label-taxonomy.yaml: complete transition strips execution labels"
    log_info "Check 12: cleaned $CLOSED_CLEANUP_COUNT stale labels from closed tasks"
else
    log_info "Check 12: no stale labels on closed tasks (sample of 100)"
fi

# ============================================================================
# Check 13: Cross-reference integrity (daily)
# ============================================================================
# Validates @-imports, nexus-sources-of-truth paths, and manifest consumer paths.
# Only runs once per day to avoid excessive I/O — checks last-run timestamp.

CROSSREF_SCRIPT="$SCRIPT_DIR/../../../Scripts/validate-cross-refs.js"
CROSSREF_LAST_RUN="$STATE_DIR/crossref-last-check"
CROSSREF_INTERVAL=$((24 * 3600))  # 24 hours

if [ -f "$CROSSREF_SCRIPT" ]; then
    LAST_CROSSREF=0
    [ -f "$CROSSREF_LAST_RUN" ] && LAST_CROSSREF=$(stat -c %Y "$CROSSREF_LAST_RUN" 2>/dev/null || echo 0)
    CROSSREF_AGE=$(( NOW_EPOCH - LAST_CROSSREF ))

    if [ "$CROSSREF_AGE" -gt "$CROSSREF_INTERVAL" ]; then
        log_info "Check 13: Running cross-reference integrity check"
        CROSSREF_OUTPUT=$(node "$CROSSREF_SCRIPT" 2>&1) || true
        CROSSREF_BROKEN=$(echo "$CROSSREF_OUTPUT" | grep -c "BROKEN:" || true)

        if [ "$CROSSREF_BROKEN" -gt 0 ]; then
            inc_warning
            log_health "warning" "cross-ref-integrity" "" "$CROSSREF_BROKEN broken cross-references detected" "none — logged for review" "Scripts/validate-cross-refs.js"
            log_info "Check 13: $CROSSREF_BROKEN broken references found"
        else
            log_info "Check 13: all cross-references valid"
        fi

        touch "$CROSSREF_LAST_RUN"
    else
        log_info "Check 13: skipped (last run $(( CROSSREF_AGE / 3600 ))h ago, threshold 24h)"
    fi
else
    log_info "Check 13: skipped (validate-cross-refs.js not found)"
fi

# ============================================================================
# Check 14: Search index staleness (weekly)
# ============================================================================
# Checks if _search-index.md has been regenerated within the last 7 days.
# Looks for the last_full_regen timestamp in the file header.

SEARCH_INDEX="$SCRIPT_DIR/../../../.claude/context/_search-index.md"
SEARCH_INDEX_MAX_AGE=$((7 * 24 * 3600))  # 7 days

if [ -f "$SEARCH_INDEX" ]; then
    # Extract last_full_regen timestamp from header
    LAST_REGEN_LINE=$(grep "last_full_regen:" "$SEARCH_INDEX" 2>/dev/null | head -1)
    if [ -n "$LAST_REGEN_LINE" ]; then
        LAST_REGEN_TS=$(echo "$LAST_REGEN_LINE" | sed 's/.*last_full_regen: //')
        LAST_REGEN_EPOCH=$(date -d "$LAST_REGEN_TS" +%s 2>/dev/null || echo 0)
        REGEN_AGE=$(( NOW_EPOCH - LAST_REGEN_EPOCH ))

        if [ "$REGEN_AGE" -gt "$SEARCH_INDEX_MAX_AGE" ]; then
            inc_warning
            log_health "warning" "search-index-stale" "" "Search index last regenerated $(( REGEN_AGE / 86400 )) days ago (threshold: 7 days)" "none — run: node Scripts/generate-search-index.js" "reactive-search-index-pattern.md"
            log_info "Check 14: search index is stale ($(( REGEN_AGE / 86400 )) days old)"
        else
            log_info "Check 14: search index fresh ($(( REGEN_AGE / 86400 )) days old)"
        fi
    else
        # No timestamp header — index predates the reactive pattern
        inc_warning
        log_health "warning" "search-index-no-timestamp" "" "Search index has no last_full_regen timestamp — needs regeneration" "none — run: node Scripts/generate-search-index.js" "reactive-search-index-pattern.md"
        log_info "Check 14: search index missing timestamp header"
    fi
else
    log_info "Check 14: skipped (_search-index.md not found)"
fi

# ============================================================================
# Check 15: Tasks with completed-by:* signal but still open
# ============================================================================
# Executors stamp completed-by:<persona> then pulse close. If close fails
# silently, the task gets stuck with a "done" signal but open status.

log_info "Check 15: completed-by signal without close"

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" = "closed" ] && continue

    if echo ",$LABELS," | grep -qE ",completed-by:[^,]+,"; then
        completed_by=$(echo ",$LABELS," | grep -oE "completed-by:[^,]+" | head -1)

        # Skip auto-close for tasks with review:research — they're intentionally
        # left open for Sir's human review (researcher adds completed-by + review:research
        # on human-requested research tasks)
        if echo ",$LABELS," | grep -q ",review:research,"; then
            log_info "Check 15: $TID has $completed_by + review:research — skipping auto-close (human review gate)"
            continue
        fi

        inc_violation
        log_health "warning" "completed-without-close" "$TID" "Has $completed_by but status=$STATUS — executor completed work but didn't close" "auto-closing" "persona-prompts: completed-by should precede pulse close"
        if ! $DRY_RUN; then
            pulse close "$TID" --reason "Auto-closed: $completed_by signal detected by watchdog (executor missed close step)" 2>/dev/null || log_warning "Failed to auto-close $TID"
            log_audit "system:watchdog" "task.closed" "task" "$TID" \
                "$(jq -nc --arg completed_by "$completed_by" --arg reason 'auto_closed_watchdog' \
                '{completed_by:$completed_by,reason:$reason,source:"completed-by-signal"}')" 2>/dev/null || true
        fi
        inc_fix
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Check 16: Invalid stage values (Check 1 handles missing/multiple — this catches typos)
# ============================================================================

VALID_STAGES="intake evaluate route review queue execute backlog"
log_info "Check 16: invalid stage values"

while IFS=$'\t' read -r TID STATUS LABELS UPDATED; do
    [ "$STATUS" != "open" ] && continue
    echo ",$LABELS," | grep -q ',parked,' && continue

    STAGE_VAL=$(echo "$LABELS" | grep -o 'stage:[a-z]*' | head -1)
    [ -z "$STAGE_VAL" ] && continue  # Check 1 handles missing stages

    STAGE_NAME="${STAGE_VAL#stage:}"
    VALID=false
    for VS in $VALID_STAGES; do
        [ "$STAGE_NAME" = "$VS" ] && VALID=true && break
    done
    if ! $VALID; then
        inc_violation
        log_health "warning" "invalid-stage" "$TID" "Invalid stage value '$STAGE_VAL' (valid: $VALID_STAGES)" "needs manual fix" "stage-lifecycle.md: valid stage values"
    fi
done < "$TASK_DATA_FILE"

# ============================================================================
# Read final counters
# ============================================================================

VIOLATIONS=$(get_violations)
FIXES=$(get_fixes)
WARNINGS=$(get_warnings)
CRITICAL=$(get_critical)
INFOS=$(get_info)

# ============================================================================
# Metrics — Push to Prometheus Pushgateway
# ============================================================================

if curl -s --max-time 2 "$PUSHGATEWAY_URL/-/healthy" >/dev/null 2>&1; then
    cat <<METRICS_EOF | curl -s --max-time 5 --data-binary @- "$PUSHGATEWAY_URL/metrics/job/pipeline_watchdog/instance/nexus" >/dev/null 2>&1 || log_warning "Failed to push watchdog metrics"
# HELP pipeline_watchdog_violations_total Total label/stage violations found
# TYPE pipeline_watchdog_violations_total gauge
pipeline_watchdog_violations_total $VIOLATIONS
# HELP pipeline_watchdog_fixes_total Total auto-fixes applied
# TYPE pipeline_watchdog_fixes_total gauge
pipeline_watchdog_fixes_total $FIXES
# HELP pipeline_watchdog_warnings_total Total warnings (non-fixable issues)
# TYPE pipeline_watchdog_warnings_total gauge
pipeline_watchdog_warnings_total $WARNINGS
# HELP pipeline_watchdog_critical_total Critical issues requiring attention
# TYPE pipeline_watchdog_critical_total gauge
pipeline_watchdog_critical_total $CRITICAL
# HELP pipeline_watchdog_tasks_checked Total tasks checked this cycle
# TYPE pipeline_watchdog_tasks_checked gauge
pipeline_watchdog_tasks_checked $TASK_COUNT
# HELP pipeline_watchdog_last_run_timestamp_seconds Unix timestamp of last watchdog run
# TYPE pipeline_watchdog_last_run_timestamp_seconds gauge
pipeline_watchdog_last_run_timestamp_seconds $NOW_EPOCH
METRICS_EOF
fi

# ============================================================================
# Summary — msgbus notification if issues found (with cooldown)
# ============================================================================

TOTAL_ISSUES=$((VIOLATIONS + WARNINGS + CRITICAL))

if [ "$TOTAL_ISSUES" -gt 0 ]; then
    SHOULD_NOTIFY=false
    if [ -f "$SUMMARY_COOLDOWN_FILE" ]; then
        LAST_SUMMARY=$(cat "$SUMMARY_COOLDOWN_FILE" 2>/dev/null || echo "0")
        COOLDOWN_AGE=$((NOW_EPOCH - LAST_SUMMARY))
        [ "$COOLDOWN_AGE" -gt "$SUMMARY_COOLDOWN_SECS" ] && SHOULD_NOTIFY=true
    else
        SHOULD_NOTIFY=true
    fi

    # Always notify on critical issues
    [ "$CRITICAL" -gt 0 ] && SHOULD_NOTIFY=true

    if $SHOULD_NOTIFY; then
        MSGBUS="$SCRIPT_DIR/lib/msgbus.sh"
        if [ -x "$MSGBUS" ]; then
            SEVERITY="info"
            [ "$CRITICAL" -gt 0 ] && SEVERITY="warning"

            SUMMARY_TEXT="Pipeline watchdog: $VIOLATIONS violations ($FIXES auto-fixed), $WARNINGS warnings, $CRITICAL critical, $INFOS info. Tasks checked: $TASK_COUNT."

            "$MSGBUS" send --type "job_completed" \
                --source "headless:pipeline-watchdog" \
                --severity "$SEVERITY" \
                --data "$(jq -nc \
                    --arg job "pipeline-watchdog" \
                    --arg title "Pipeline Watchdog Report" \
                    --arg sum "$SUMMARY_TEXT" \
                    --argjson violations "$VIOLATIONS" \
                    --argjson fixes "$FIXES" \
                    --argjson warnings "$WARNINGS" \
                    --argjson critical "$CRITICAL" \
                    '{job:$job,title:$title,summary:$sum,violations:$violations,fixes:$fixes,warnings:$warnings,critical:$critical,cost_usd:"0",duration_secs:0}')" \
                > /dev/null 2>&1 || log_warning "Failed to send watchdog summary to msgbus"

            echo "$NOW_EPOCH" > "$SUMMARY_COOLDOWN_FILE"
        fi
    fi
fi

# ============================================================================
# Final Output
# ============================================================================

if [ "$TOTAL_ISSUES" -eq 0 ]; then
    log_info "Pipeline watchdog: all clear ($TASK_COUNT tasks checked)"
else
    log_info "Pipeline watchdog: $VIOLATIONS violations ($FIXES fixed), $WARNINGS warnings, $CRITICAL critical, $INFOS info ($TASK_COUNT tasks checked)"
fi

# Exit with non-zero if critical issues exist (allows dispatcher to track failures)
[ "$CRITICAL" -gt 0 ] && exit 1
exit 0
