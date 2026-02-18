#!/bin/bash
# Exit Guard v3 — Interactive exit menu (Stop hook)
#
# When Claude Code stops (Stop event), this hook determines whether to
# allow silent pass-through or present an interactive exit ceremony menu.
#
# CRITICAL: This hook must NEVER crash (non-zero exit). A crash is treated
# as an error by Claude Code. Use defensive error handling throughout.
#
# Detection layers (evaluated in order):
#   1. stop_reason field in hook input JSON → skip non-exit stops
#   2. Transcript analysis → skip if last user message has no exit intent
#   3. Signal file bypasses → JICM, Ralph Loop, ceremony-done
#   4. Default: present exit ceremony menu
#
# Signal files:
#   .jicm-exit-mode.signal  — set by /end-session to suppress JICM
#   .jicm-state             — JICM watcher state machine
#   .exit-ceremony-done     — set by THIS hook after presenting menu
#   ralph-loop.local.md     — Ralph loop state file
#
# Created: 2026-02-17 (Session 23)
# Refactored: 2026-02-18 (Session 24) — interactive menu
# Fixed: 2026-02-18 (Session 26) — removed set -euo pipefail (caused crashes),
#        added transcript-based exit detection, diagnostic logging

# INTENTIONALLY no set -e or pipefail — this hook must never crash
set +e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
CEREMONY_DONE="$PROJECT_DIR/.claude/context/.exit-ceremony-done"
LOG_FILE="$PROJECT_DIR/.claude/logs/exit-guard-debug.log"

# Read hook input from stdin (required by Stop hook protocol)
HOOK_INPUT=$(cat)

# --- Debug logging ---
mkdir -p "$PROJECT_DIR/.claude/logs" 2>/dev/null
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | HOOK_INPUT: $HOOK_INPUT" >> "$LOG_FILE" 2>/dev/null

# --- Layer 1: Check stop_reason field ---
# Claude Code may include a stop_reason that distinguishes exit from turn-end.
STOP_REASON=$(echo "$HOOK_INPUT" | jq -r '.stop_reason // empty' 2>/dev/null || echo "")
if [[ -n "$STOP_REASON" ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | stop_reason=$STOP_REASON" >> "$LOG_FILE" 2>/dev/null
    case "$STOP_REASON" in
        end_turn|max_tokens|tool_use|stop_sequence)
            exit 0
            ;;
    esac
fi

# --- Layer 2: Transcript-based exit detection ---
# Check the user's last message. If no exit intent, this is a normal turn end.
# JSONL format: top-level "type":"user", message at .message.content[] with
# items of type "text" (user input) or "tool_result" (system-generated).
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
    # Extract last user text message from JSONL transcript
    # 1. Find lines with "type":"user"
    # 2. Extract text content items from .message.content[]
    # 3. Take the last one that has actual text
    LAST_USER_MSG=$(grep '"type":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | \
        python3 -c "
import json, sys
last_text = ''
for line in sys.stdin:
    try:
        data = json.loads(line)
        msg = data.get('message', {})
        if isinstance(msg, dict):
            for item in msg.get('content', []):
                if isinstance(item, dict) and item.get('type') == 'text':
                    t = item.get('text', '').strip()
                    if t:
                        last_text = t[:300]
    except:
        pass
print(last_text)
" 2>/dev/null || echo "")

    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | last_user_msg: ${LAST_USER_MSG:0:100}" >> "$LOG_FILE" 2>/dev/null

    if [[ -n "$LAST_USER_MSG" ]]; then
        # Only trigger on exact "/exit" — the actual Claude Code exit command.
        # Everything else (normal messages, tool results, embedded text) passes through.
        FIRST_LINE=$(echo "$LAST_USER_MSG" | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ "$FIRST_LINE" != "/exit" ]]; then
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | SKIPPED: last msg is not /exit" >> "$LOG_FILE" 2>/dev/null
            exit 0
        fi
    fi
fi

# --- Layer 3: Signal file bypasses ---

# 3a. JICM exit-mode signal → /end-session in progress
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# 3b. JICM watcher in active compression cycle
if [[ -f "$PROJECT_DIR/.claude/context/.jicm-state" ]]; then
    JICM_STATE=$(head -1 "$PROJECT_DIR/.claude/context/.jicm-state" 2>/dev/null | awk '{print $2}' || echo "")
    case "${JICM_STATE:-}" in
        HALTING|COMPRESSING|CLEARING|RESTORING)
            rm -f "$CEREMONY_DONE" 2>/dev/null
            exit 0
            ;;
    esac
fi

# 3c. Ralph loop active → stop-hook.sh handles its own blocking
if [[ -f "$PROJECT_DIR/.claude/ralph-loop.local.md" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# 3d. Exit ceremony already presented → allow through (second exit)
if [[ -f "$CEREMONY_DONE" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi

# --- Layer 4: Present exit ceremony menu ---

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | BLOCKING: presenting exit menu" >> "$LOG_FILE" 2>/dev/null

# Touch ceremony-done BEFORE blocking so the next Stop passes through
touch "$CEREMONY_DONE"

# Build context notes
CONTEXT_NOTES=""
CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' 2>/dev/null | head -1 || echo "")
if [[ -n "$CHANGES" ]]; then
    CONTEXT_NOTES="There are uncommitted changes in the working tree. "
fi

# Block with interactive exit menu prompt
jq -n --arg notes "$CONTEXT_NOTES" '{
  "decision": "block",
  "reason": ("The user has requested to exit the session. " + $notes + "Present an exit menu using AskUserQuestion with header \"Exit\" and these three options:\n\n1. **Run /end-session** (Recommended) — Full exit: save session state, commit changes, push to remote, then deliver a Jarvis farewell\n2. **Quick exit** — Deliver a brief Jarvis farewell, then exit immediately (no state saving)\n3. **Continue working** — Cancel the exit and resume the session\n\nBased on their choice:\n- Option 1: Run the /end-session skill. After it completes, deliver a warm Wodehouse-style Jarvis farewell (2-3 sentences, reference valedictions.yaml for tone). Then stop.\n- Option 2: Deliver a warm Wodehouse-style Jarvis farewell (2-3 sentences). Then stop.\n- Option 3: Delete the file .claude/context/.exit-ceremony-done using Bash, say \"Very good, sir. Shall we resume where we left off?\" and continue working normally.\n\nIMPORTANT: If user chose Option 3, you MUST run: rm -f .claude/context/.exit-ceremony-done — this resets the exit guard so the menu appears again next time they exit.")
}'

exit 0
