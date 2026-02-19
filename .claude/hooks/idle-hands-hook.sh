#!/bin/bash
# Idle-Hands Phase Continuation Hook (Stop hook)
# When an idle-hands maintenance cycle is running, chains phases:
#   commit → reflect → maintain → (re-evaluate or stop)
#
# Fires on every turn end. If .idle-hands-active.W{n} exists for this
# window, reads current phase, advances to next, and blocks with prompt.
# If cycle is complete (all maintenance done or cap reached), cleans up.
#
# Order in Stop hooks: 3rd (after Ralph, after exit-guard)
# Ralph = user-initiated, exit-guard = safety, idle-hands = lowest priority
#
# Created: 2026-02-18 (Idle-Hands System v1.0)

# NEVER use set -euo pipefail — grep pipeline failures cause silent crashes
set +e

HOOK_INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
WINDOW="${JARVIS_WINDOW:-0}"
IH_FILE="$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}"
LOG="$PROJECT_DIR/.claude/logs/idle-hands-debug.log"

mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null

# No idle-hands cycle → pass through silently
[[ ! -f "$IH_FILE" ]] && exit 0

# Read current state
CURRENT_PHASE=$(awk '/^phase:/{print $2}' "$IH_FILE" 2>/dev/null)
CURRENT_TYPE=$(awk '/^type:/{print $2}' "$IH_FILE" 2>/dev/null)
CURRENT_CYCLE=$(awk '/^cycle:/{print $2}' "$IH_FILE" 2>/dev/null)

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | type=$CURRENT_TYPE phase=$CURRENT_PHASE cycle=${CURRENT_CYCLE:-1}" >> "$LOG" 2>/dev/null

# "resume" type: work was resumed after ESC idle.
# Claude naturally finished → clean up (Ennoia re-evaluates on next cycle)
if [[ "$CURRENT_TYPE" == "resume" ]]; then
    rm -f "$IH_FILE"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | resume complete, cleaned up" >> "$LOG" 2>/dev/null
    exit 0
fi

# Maintenance type: advance to next phase
case "$CURRENT_PHASE" in
    commit)   NEXT_PHASE="reflect" ;;
    reflect)  NEXT_PHASE="maintain" ;;
    maintain)
        # Full cycle done — re-evaluate
        NEXT_CYCLE=$(( ${CURRENT_CYCLE:-1} + 1 ))
        # Cap at 3 cycles to prevent infinite loops
        if [[ $NEXT_CYCLE -gt 3 ]]; then
            rm -f "$IH_FILE"
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | cycle cap reached (3), cleaned up" >> "$LOG" 2>/dev/null
            exit 0
        fi
        # Re-evaluate: uncommitted changes?
        CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
        if [[ -n "$CHANGES" ]]; then
            NEXT_PHASE="commit"
        else
            NEXT_PHASE="reflect"
        fi
        # Update cycle counter
        sed -i '' "s/^cycle: .*/cycle: $NEXT_CYCLE/" "$IH_FILE" 2>/dev/null
        ;;
    *)
        # Unknown phase → clean up
        rm -f "$IH_FILE"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | unknown phase=$CURRENT_PHASE, cleaned up" >> "$LOG" 2>/dev/null
        exit 0
        ;;
esac

# Update phase in state file
sed -i '' "s/^phase: .*/phase: $NEXT_PHASE/" "$IH_FILE" 2>/dev/null

# Build next prompt
case "$NEXT_PHASE" in
    commit)  PROMPT="[IDLE-HANDS] Review and commit any uncommitted changes." ;;
    reflect) PROMPT="[IDLE-HANDS] Run /reflect — perform a self-reflection cycle." ;;
    maintain) PROMPT="[IDLE-HANDS] Run /maintain — perform a maintenance check." ;;
esac

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | advancing: $CURRENT_PHASE → $NEXT_PHASE (cycle ${CURRENT_CYCLE:-1})" >> "$LOG" 2>/dev/null

# Block and inject next phase as the prompt
jq -n --arg prompt "$PROMPT" '{
    "decision": "block",
    "reason": $prompt
}'
exit 0
