#!/bin/bash
# Exit Guard — Stop hook that preempts Claude Code's default exit message
#
# Purpose: Replace "Catch you later!" with a Jarvis-persona farewell.
# On first exit, blocks and feeds a farewell prompt so Jarvis can sign off
# in character. On second exit (or if /end-session was run), allows exit.
#
# Behavior:
#   Recent prompt (<30s) → Allow: likely accidental cancel, not deliberate exit
#   1st /exit → Block: Jarvis delivers farewell + /end-session reminder
#   2nd /exit → Allow: user explicitly wants out, let them go
#   /end-session running (.jicm-exit-mode.signal) → Allow immediately
#
# Requires: .last-prompt-ts heartbeat (written by UserPromptSubmit hook)
#
# This hook runs alongside stop-hook.sh (Ralph Loop). Ralph takes priority
# when active; this hook handles the normal exit path.
#
# Created: 2026-02-17 (Session 23)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
PASS_FILE="$PROJECT_DIR/.claude/context/.exit-guard-passed"
HEARTBEAT_FILE="$PROJECT_DIR/.claude/context/.last-prompt-ts"

# Read hook input from stdin (required by Stop hook protocol)
HOOK_INPUT=$(cat)

# 1. If JICM exit-mode signal exists, /end-session is in progress — allow exit
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    rm -f "$PASS_FILE" 2>/dev/null
    exit 0
fi

# 2. Recency check — if a user prompt was submitted recently, the Stop event
#    is likely an accidental cancel (e.g., Escape during a long-running tool),
#    not a deliberate exit. Allow it through without the farewell ceremony.
if [[ -f "$HEARTBEAT_FILE" ]]; then
    LAST_TS=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    AGE=$(( NOW - LAST_TS ))
    if [[ $AGE -lt 30 ]]; then
        rm -f "$PASS_FILE" 2>/dev/null
        exit 0
    fi
fi

# 3. If pass file exists, this is the second exit — allow it
if [[ -f "$PASS_FILE" ]]; then
    rm -f "$PASS_FILE" 2>/dev/null
    exit 0
fi

# 4. First exit — set pass file and block with farewell prompt
touch "$PASS_FILE"

# Build context-aware farewell prompt
REMINDER=""
CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
if [[ -n "$CHANGES" ]]; then
    REMINDER="Note: there are uncommitted changes. Consider running /end-session next time to save state and push before exiting."
fi

# Block with a Jarvis farewell prompt
jq -n --arg reminder "$REMINDER" '{
  "decision": "block",
  "reason": ("You are Jarvis. The user is leaving. Give a brief, warm Wodehouse-style farewell (2-3 sentences). Reference the valedictions.yaml phrase bank for tone. " + $reminder + " After your farewell, do not continue working — just sign off.")
}'

exit 0
