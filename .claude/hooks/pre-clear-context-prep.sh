#!/bin/bash
# Pre-Clear Context Preparation Hook
# Event: UserPromptSubmit
# Purpose: Detect /clear (or /compact) before execution and run
#          jicm-prep-context.sh to ensure .compressed-context-ready.md
#          is fresh on disk BEFORE the context window is emptied.
#
# This is the "safety net" — guarantees context preservation on every /clear.
# Complemented by the idle checkpoint timer in jicm-watcher.sh which keeps
# the file fresh during normal operation.
#
# Execution time: ~0.06s (transparent to user)
# Created: 2026-02-19

INPUT=$(cat)

# Extract prompt text — handle both string and object formats
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

if [ -z "$PROMPT" ]; then
    echo '{"proceed":true}'
    exit 0
fi

# Detect /clear or /compact commands (case-insensitive, trimmed)
TRIMMED=$(echo "$PROMPT" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

case "$TRIMMED" in
    /clear|/compact|/clear*|/compact*)
        # Run context preparation script synchronously
        PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
        PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
        LOG_DIR="$PROJECT_DIR/.claude/logs"

        if [ -x "$PREP_SCRIPT" ]; then
            bash "$PREP_SCRIPT" 2>>"$LOG_DIR/session-start-diagnostic.log"
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | PreClear | Context prepared before /clear" >> "$LOG_DIR/session-start-diagnostic.log"
        fi
        ;;
esac

# Always proceed — never block the command
echo '{"proceed":true}'
