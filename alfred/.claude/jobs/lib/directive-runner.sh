#!/bin/bash
# directive-runner.sh - Execute structured effect manifests from Claude output
#
# Part of the Directive pattern (originated from AIProjects-w5jl).
# Reads a JSON manifest and executes each directive sequentially.
#
# Usage:
#   echo '{"version":1,"directives":[...]}' | directive-runner.sh
#   directive-runner.sh --file /path/to/manifest.json
#   directive-runner.sh --manifest '{"version":1,"directives":[...]}'
#
# Returns JSON summary of execution results.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/label-ops.sh" || { echo "ERROR: label-ops.sh not found" >&2; exit 1; }

# ============================================================================
# Input
# ============================================================================

MANIFEST=""
INPUT_FILE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --file) INPUT_FILE="$2"; shift 2 ;;
        --manifest) MANIFEST="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# Read from file, argument, or stdin
if [ -n "$INPUT_FILE" ]; then
    MANIFEST=$(cat "$INPUT_FILE")
elif [ -z "$MANIFEST" ]; then
    MANIFEST=$(cat)
fi

if [ -z "$MANIFEST" ]; then
    echo '{"ok":false,"error":"empty manifest"}' >&2
    exit 1
fi

# ============================================================================
# Validation
# ============================================================================

VERSION=$(echo "$MANIFEST" | jq -r '.version // 0' 2>/dev/null)
if [ "$VERSION" != "1" ]; then
    echo "{\"ok\":false,\"error\":\"unsupported manifest version: $VERSION\"}" >&2
    exit 1
fi

DIRECTIVE_COUNT=$(echo "$MANIFEST" | jq '.directives | length' 2>/dev/null || echo 0)
if [ "$DIRECTIVE_COUNT" -eq 0 ]; then
    echo '{"ok":true,"executed":0,"results":[]}'
    exit 0
fi

# ============================================================================
# Execution
# ============================================================================

RESULTS="[]"
EXECUTED=0
FAILED=0

for ((i=0; i<DIRECTIVE_COUNT; i++)); do
    DIRECTIVE=$(echo "$MANIFEST" | jq -c ".directives[$i]")
    DTYPE=$(echo "$DIRECTIVE" | jq -r '.type')

    RESULT_STATUS="success"
    RESULT_MSG=""

    case "$DTYPE" in
        task_close)
            TASK_ID=$(echo "$DIRECTIVE" | jq -r '.task_id')
            REASON=$(echo "$DIRECTIVE" | jq -r '.reason // "Completed"')

            if [ "$DRY_RUN" = "true" ]; then
                RESULT_MSG="[dry-run] pulse close $TASK_ID"
            else
                if pulse_close_task "$TASK_ID" "$REASON" "directive-runner" >/dev/null 2>&1; then
                    RESULT_MSG="Closed $TASK_ID"
                else
                    RESULT_STATUS="failed"
                    RESULT_MSG="Failed to close $TASK_ID"
                    FAILED=$((FAILED + 1))
                fi
            fi
            ;;

        task_create)
            TITLE=$(echo "$DIRECTIVE" | jq -r '.title')
            PRIORITY=$(echo "$DIRECTIVE" | jq -r '.priority // "P3"')
            LABELS=$(echo "$DIRECTIVE" | jq -r '.labels // ""')
            DESC=$(echo "$DIRECTIVE" | jq -r '.description // ""')

            if [ "$DRY_RUN" = "true" ]; then
                RESULT_MSG="[dry-run] pulse create \"$TITLE\" -p $PRIORITY"
            else
                LABELS_JSON="[]"
                if [ -n "$LABELS" ]; then
                    LABELS_JSON=$(echo "$LABELS" | jq -R 'split(",") | map(ltrimstr(" ") | rtrimstr(" ")) | map(select(length > 0))')
                fi
                CREATE_DATA=$(jq -n --arg t "$TITLE" --arg p "$PRIORITY" --arg d "$DESC" --argjson l "$LABELS_JSON" \
                    '{title:$t, priority:($p|tonumber), labels:$l, description:$d, actor:"directive-runner"}')
                if CREATE_OUT=$(pulse_create_task "$TITLE" "$CREATE_DATA" 2>&1); then
                    NEW_ID=$(echo "$CREATE_OUT" | jq -r '.id // "unknown"' 2>/dev/null || echo "unknown")
                    RESULT_MSG="Created $NEW_ID: $TITLE"
                else
                    RESULT_STATUS="failed"
                    RESULT_MSG="Failed to create: $TITLE — $CREATE_OUT"
                    FAILED=$((FAILED + 1))
                fi
            fi
            ;;

        task_update)
            TASK_ID=$(echo "$DIRECTIVE" | jq -r '.task_id')
            ADD_LABELS=$(echo "$DIRECTIVE" | jq -r '.add_labels // ""')
            NOTES=$(echo "$DIRECTIVE" | jq -r '.notes // ""')

            if [ "$DRY_RUN" = "true" ]; then
                RESULT_MSG="[dry-run] pulse update $TASK_ID"
            else
                UPDATE_OK=true
                if [ -n "$ADD_LABELS" ]; then
                    # Validate labels via label-ops before applying (catches deprecated labels from LLM output)
                    label_validate_set "$ADD_LABELS" "directive-runner" || true  # warn only, don't block
                    # Apply each label individually through label_add_validated for mutex enforcement
                    IFS=',' read -ra _DLABEL_LIST <<< "$ADD_LABELS"
                    for _DLABEL in "${_DLABEL_LIST[@]}"; do
                        _DLABEL=$(echo "$_DLABEL" | xargs)
                        [ -z "$_DLABEL" ] && continue
                        label_add_validated "$TASK_ID" "$_DLABEL" "directive-runner" 2>&1 || UPDATE_OK=false
                    done
                fi
                if [ -n "$NOTES" ]; then
                    pulse_append_notes "$TASK_ID" "$NOTES" "directive-runner" >/dev/null 2>&1 || UPDATE_OK=false
                fi
                if [ "$UPDATE_OK" = "true" ]; then
                    RESULT_MSG="Updated $TASK_ID"
                else
                    RESULT_STATUS="failed"
                    RESULT_MSG="Failed to update $TASK_ID"
                    FAILED=$((FAILED + 1))
                fi
            fi
            ;;

        notify)
            # Notify directives are informational — consumed by executor.sh
            # The runner just records them; executor uses them for severity/summary
            SEVERITY=$(echo "$DIRECTIVE" | jq -r '.severity // "info"')
            SUMMARY=$(echo "$DIRECTIVE" | jq -r '.summary // "Job completed"')
            RESULT_MSG="Notify: [$SEVERITY] $SUMMARY"
            ;;

        *)
            RESULT_STATUS="skipped"
            RESULT_MSG="Unknown directive type: $DTYPE"
            ;;
    esac

    EXECUTED=$((EXECUTED + 1))
    RESULTS=$(echo "$RESULTS" | jq -c --arg type "$DTYPE" --arg status "$RESULT_STATUS" --arg msg "$RESULT_MSG" \
        '. + [{"type":$type,"status":$status,"message":$msg}]')
done

# ============================================================================
# Output
# ============================================================================

jq -nc \
    --argjson ok "$([ "$FAILED" -eq 0 ] && echo true || echo false)" \
    --argjson executed "$EXECUTED" \
    --argjson failed "$FAILED" \
    --argjson results "$RESULTS" \
    '{ok:$ok, executed:$executed, failed:$failed, results:$results}'
