#!/bin/bash
# Exit Guard v4 — Interactive exit menu (Stop hook)
#
# When Claude Code stops (Stop event), this hook determines whether to
# allow silent pass-through or present an interactive exit ceremony menu.
#
# CRITICAL: This hook must NEVER crash (non-zero exit). A crash is treated
# as an error by Claude Code. Use defensive error handling throughout.
#
# Detection layers (evaluated in order):
#   0. stop_hook_active check → if true, a hook already blocked; allow through
#   1. stop_reason field in hook input JSON → skip non-exit stops
#   2. Transcript analysis → POSITIVE MATCH: only proceed if "/exit" confirmed
#      (empty, missing, error, non-/exit → all pass through silently)
#   3. Signal file bypasses → JICM, Ralph Loop, ceremony-done
#   4. Present exit ceremony menu (only reachable if /exit confirmed in Layer 2)
#
# Transcript format notes (Claude Code JSONL):
#   - User-typed text is stored as individual character strings in content array
#     e.g. {"type":"user","message":{"content":["h","e","l","l","o"]}}
#   - Built-in commands like /exit are stored as:
#     {"type":"user","message":{"content":["<","c","o","m","m","a","n","d",...]}}
#     which joins to: <command-name>/exit</command-name>...
#   - System text uses {"type":"text","text":"..."} dicts (e.g. skill expansions)
#   - The Python parser must handle BOTH raw strings and text dicts
#
# Signal files:
#   .jicm-exit-mode.signal  — set by /end-session to suppress JICM
#   .jicm-state             — JICM watcher state machine
#   .exit-ceremony-done     — set by THIS hook after presenting menu
#   ralph-loop.local.md     — Ralph loop state file
#
# Created: 2026-02-17 (Session 23)
# Refactored: 2026-02-18 (Session 24) — interactive menu
# Fixed: 2026-02-18 (Session 26c) — positive-match logic, crash-proof
# Fixed: 2026-02-19 (Session 26c) — v4: parse raw char strings + command tags

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

# --- Layer 0: stop_hook_active re-entry guard ---
# Per Claude Code docs: if stop_hook_active is true, a Stop hook already blocked
# on a previous attempt. Allow through to prevent infinite loops.
STOP_HOOK_ACTIVE=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | PASS-THROUGH: stop_hook_active=true (re-entry)" >> "$LOG_FILE" 2>/dev/null
    exit 0
fi

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

# --- Layer 2: Transcript-based exit detection (POSITIVE MATCH REQUIRED) ---
# DEFAULT: pass through (exit 0). Only proceed to ceremony if we POSITIVELY
# confirm "/exit" as the last user text. All ambiguity → exit 0.
#
# Why positive match? After /clear, JICM cycles, or session start, the
# transcript often has NO text-type user messages (only tool_result entries).
# A negative-match approach ("skip if not /exit") falls through on empty,
# causing false ceremony triggers on every post-clear turn end.
EXIT_DETECTED=false

TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
    # Extract last user input from JSONL transcript
    # Claude Code stores content in two formats:
    #   1. Raw strings: user-typed text as individual chars ["h","e","l","l","o"]
    #      Built-in commands appear as <command-name>/exit</command-name>
    #   2. Dict items: {"type":"text","text":"..."} for system-generated text
    # We check BOTH formats and look for /exit in the most recent user message.
    LAST_USER_MSG=$(grep '"type":"user"' "$TRANSCRIPT_PATH" 2>/dev/null | \
        python3 -c "
import json, sys, re
last_text = ''
last_command = ''
for line in sys.stdin:
    try:
        data = json.loads(line)
        msg = data.get('message', {})
        if not isinstance(msg, dict):
            continue
        content = msg.get('content', [])
        # Join raw string chars (user-typed text and built-in commands)
        raw_chars = [x for x in content if isinstance(x, str)]
        if raw_chars:
            joined = ''.join(raw_chars).strip()
            # Check for built-in command tag
            m = re.search(r'<command-name>(.*?)</command-name>', joined)
            if m:
                last_command = m.group(1).strip()
            elif not joined.startswith('<'):
                # Real user text (not XML system injection)
                last_text = joined[:300]
                last_command = ''
        # Check dict text items (system-generated: skill expansions, interrupts)
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'text':
                t = item.get('text', '').strip()
                if t:
                    last_text = t[:300]
                    last_command = ''
    except:
        pass
# Output the command if it was the last thing, otherwise the last text
if last_command:
    print(last_command)
else:
    print(last_text)
" 2>/dev/null || echo "")

    if [[ -n "$LAST_USER_MSG" ]]; then
        FIRST_LINE=$(echo "$LAST_USER_MSG" | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ "$FIRST_LINE" == "/exit" ]]; then
            EXIT_DETECTED=true
        fi
    fi

    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | exit_detected=$EXIT_DETECTED last_user_msg: ${LAST_USER_MSG:0:100}" >> "$LOG_FILE" 2>/dev/null
else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | exit_detected=false (no transcript)" >> "$LOG_FILE" 2>/dev/null
fi

# Gate: if /exit was NOT positively detected, pass through silently
if [[ "$EXIT_DETECTED" != "true" ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | PASS-THROUGH: /exit not positively detected" >> "$LOG_FILE" 2>/dev/null
    exit 0
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

# 3c-bis. Idle-hands cycle active → idle-hands-hook.sh handles continuation
WINDOW="${JARVIS_WINDOW:-0}"
if [[ -f "$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}" ]]; then
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

# Zero heartbeat timestamp so Ennoia won't inject into this exiting session
echo "0" > "$PROJECT_DIR/.claude/context/.last-prompt-ts.W${WINDOW}" 2>/dev/null

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
