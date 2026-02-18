#!/bin/bash
# Exit Guard v2 — Interactive exit menu (Stop hook)
#
# When Claude Code exits (Stop event), this hook determines whether to
# allow silent exit or present an interactive exit ceremony menu.
#
# Behavior:
#   JICM cycle active (state file) → Allow: automated context management
#   JICM exit-mode signal          → Allow: /end-session protocol in progress
#   Ralph loop active              → Allow: stop-hook.sh handles Ralph
#   Exit ceremony done             → Allow: menu already presented, let user leave
#   Otherwise                      → Block: present exit options menu
#
# Signal files:
#   .jicm-exit-mode.signal  — set by /end-session to suppress JICM
#   .jicm-state             — JICM watcher state machine (HALTING/COMPRESSING/etc.)
#   .exit-ceremony-done     — set by THIS hook after presenting menu
#   ralph-loop.local.md     — Ralph loop state file
#
# IMPORTANT: This hook uses .exit-ceremony-done (NOT .exit-guard-passed)
# because .exit-guard-passed was cleared by UserPromptSubmit hooks,
# defeating the second-exit pass-through mechanism and causing loops.
#
# Created: 2026-02-17 (Session 23)
# Refactored: 2026-02-18 (Session 24) — removed timing heuristic, interactive menu

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
CEREMONY_DONE="$PROJECT_DIR/.claude/context/.exit-ceremony-done"

# Read hook input from stdin (required by Stop hook protocol)
HOOK_INPUT=$(cat)

# --- Bypass checks (automated/known exits) ---

# 1. JICM exit-mode signal → /end-session is running, allow silently
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# 2. JICM watcher in active compression cycle → allow silently
#    State file format: "state: WATCHING\ntimestamp: ...\n..."
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-state" ]]; then
    JICM_STATE=$(head -1 "$PROJECT_DIR/.claude/context/.jicm-state" 2>/dev/null | awk '{print $2}')
    case "${JICM_STATE:-}" in
        HALTING|COMPRESSING|CLEARING|RESTORING)
            rm -f "$CEREMONY_DONE" 2>/dev/null
            exit 0
            ;;
    esac
fi

# 3. Ralph loop active → stop-hook.sh handles its own blocking
if [[ -f "$PROJECT_DIR/.claude/ralph-loop.local.md" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# 4. Exit ceremony already presented → allow through (second exit)
if [[ -f "$CEREMONY_DONE" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# --- First exit: present interactive menu ---

# Touch ceremony-done BEFORE blocking so the next Stop passes through.
# This file is NOT cleared by UserPromptSubmit hooks (unlike .exit-guard-passed).
touch "$CEREMONY_DONE"

# Build context notes
CONTEXT_NOTES=""
CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
if [[ -n "$CHANGES" ]]; then
    CONTEXT_NOTES="There are uncommitted changes in the working tree. "
fi

# Block with interactive exit menu prompt
jq -n --arg notes "$CONTEXT_NOTES" '{
  "decision": "block",
  "reason": ("The user has requested to exit the session. " + $notes + "Present an exit menu using AskUserQuestion with header \"Exit\" and these three options:\n\n1. **Run /end-session** (Recommended) — Full exit: save session state, commit changes, push to remote, then deliver a Jarvis farewell\n2. **Quick exit** — Deliver a brief Jarvis farewell, then exit immediately (no state saving)\n3. **Continue working** — Cancel the exit and resume the session\n\nBased on their choice:\n- Option 1: Run the /end-session skill. After it completes, deliver a warm Wodehouse-style Jarvis farewell (2-3 sentences, reference valedictions.yaml for tone). Then stop.\n- Option 2: Deliver a warm Wodehouse-style Jarvis farewell (2-3 sentences). Then stop.\n- Option 3: Delete the file .claude/context/.exit-ceremony-done using Bash, say \"Very good, sir. Shall we resume where we left off?\" and continue working normally.\n\nIMPORTANT: If user chose Option 3, you MUST run: rm -f .claude/context/.exit-ceremony-done — this resets the exit guard so the menu appears again next time they exit.")
}'

exit 0
