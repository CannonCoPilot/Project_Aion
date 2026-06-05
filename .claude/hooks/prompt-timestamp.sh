#!/bin/bash
# Prompt Timestamp + Idle-Hands Gate (UserPromptSubmit hook)
#
# On every user prompt submission:
#   1. ALWAYS update .last-prompt-ts.W{n} (for idle detection)
#   2. Only cancel idle-hands if the prompt is NOT from idle-hands itself
#
# The original inline command unconditionally deleted .idle-hands-active,
# which broke the Stop hook's phase-cycling mechanism. Idle-hands' own
# injected prompts (prefixed "[IDLE-HANDS]") would kill their own state
# file before the Stop hook could advance to the next phase.
#
# Created: 2026-02-19 (fixes idle-hands infinite-commit bug)

INPUT=$(cat)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
WINDOW="${JARVIS_WINDOW:-0}"
TS_FILE="$PROJECT_DIR/.claude/context/.last-prompt-ts.W${WINDOW}"
IH_FILE="$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}"

# 1. Always update prompt timestamp
date +%s > "$TS_FILE"

# 2. Check if this is an idle-hands injection
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

if echo "$PROMPT" | grep -q '^\[IDLE-HANDS\]'; then
    # Idle-hands prompt — preserve state file so Stop hook can advance phases
    :
else
    # Genuine user activity — cancel any running idle-hands cycle
    rm -f "$IH_FILE"
fi

echo '{"proceed":true}'
