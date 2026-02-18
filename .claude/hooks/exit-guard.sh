#!/bin/bash
# Exit Guard — Stop hook that intercepts exit when /end-session hasn't been run
#
# Prevents Claude Code's "Catch you later!" exit from bypassing the session
# exit protocol (AC-09). Blocks exit and suggests /end-session when uncommitted
# work is detected.
#
# This hook runs alongside stop-hook.sh (Ralph Loop). If Ralph Loop blocks first,
# this hook's result is moot. If Ralph Loop allows exit, this hook gates it.
#
# Created: 2026-02-17 (Session 23)

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"

# Read hook input from stdin (required by Stop hook protocol)
HOOK_INPUT=$(cat)

# 1. If JICM exit-mode signal exists, /end-session is in progress — allow exit
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    exit 0
fi

# 2. Check for uncommitted changes (the primary indicator of un-saved work)
CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)

if [[ -z "$CHANGES" ]]; then
    # No uncommitted tracked changes — safe to exit
    exit 0
fi

# 3. Uncommitted work detected — block exit and suggest /end-session
jq -n '{
  "decision": "block",
  "reason": "You have uncommitted changes. Please run /end-session to save session state, commit, and push before exiting."
}'

exit 0
