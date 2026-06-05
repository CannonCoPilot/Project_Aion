#!/bin/bash
# Idle-Hands Phase Continuation Hook (Stop hook)
# When an idle-hands maintenance cycle is running, chains phases:
#   commit → maintain → reflect → (re-evaluate or stop)
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
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
WINDOW="${JARVIS_WINDOW:-0}"
IH_FILE="$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}"
LOG="$PROJECT_DIR/.claude/logs/idle-hands-debug.log"

mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null

# No idle-hands cycle → pass through silently
[[ ! -f "$IH_FILE" ]] && exit 0

# Cooldown check: if recently completed a full cycle, don't restart
COOLDOWN_FILE="$PROJECT_DIR/.claude/context/.idle-hands-cooldown.W${WINDOW}"
if [[ -f "$COOLDOWN_FILE" ]]; then
    COOLDOWN_UNTIL=$(cat "$COOLDOWN_FILE" 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    if [[ -n "$COOLDOWN_UNTIL" ]] && [[ "$NOW_EPOCH" -lt "$COOLDOWN_UNTIL" ]]; then
        # Still in cooldown — remove the state file and pass through
        rm -f "$IH_FILE"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | cooldown active until $(date -r "$COOLDOWN_UNTIL" +%H:%M 2>/dev/null || echo $COOLDOWN_UNTIL), skipping" >> "$LOG" 2>/dev/null
        exit 0
    else
        # Cooldown expired — clean it up
        rm -f "$COOLDOWN_FILE"
    fi
fi

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
    commit)   NEXT_PHASE="maintain" ;;
    maintain) NEXT_PHASE="reflect" ;;
    reflect)
        # Full cycle done — re-evaluate
        NEXT_CYCLE=$(( ${CURRENT_CYCLE:-1} + 1 ))
        # Cap at 3 cycles to prevent infinite loops
        if [[ $NEXT_CYCLE -gt 3 ]]; then
            rm -f "$IH_FILE"
            # Set 2-hour cooldown to prevent repeated cycles when all maintenance is done
            COOLDOWN_EPOCH=$(( $(date +%s) + 7200 ))
            echo "$COOLDOWN_EPOCH" > "$PROJECT_DIR/.claude/context/.idle-hands-cooldown.W${WINDOW}"
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | cycle cap reached (3), cleaned up, cooldown until +2h" >> "$LOG" 2>/dev/null
            exit 0
        fi
        # Re-evaluate: uncommitted changes?
        CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
        if [[ -n "$CHANGES" ]]; then
            NEXT_PHASE="commit"
        else
            NEXT_PHASE="maintain"
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
    commit)  PROMPT="[IDLE-HANDS] Review and commit any uncommitted changes. Use descriptive commit messages." ;;
    maintain) PROMPT="[IDLE-HANDS] Run /housekeep — perform a quick infrastructure cleanup." ;;
    reflect) PROMPT="[IDLE-HANDS] Run /reflect — perform a self-reflection cycle." ;;
esac

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | W${WINDOW} | advancing: $CURRENT_PHASE → $NEXT_PHASE (cycle ${CURRENT_CYCLE:-1})" >> "$LOG" 2>/dev/null

# Block and inject next phase as the prompt
jq -n --arg prompt "$PROMPT" '{
    "decision": "block",
    "reason": $prompt
}'
exit 0
