#!/bin/bash
# ============================================================================
# jicm-prep-context.sh — JICM v7 Fast Context Preparation
# ============================================================================
#
# Replaces the LLM compression agent (210s) with a fast bash script (3-5s).
# Extracts what Jarvis actually needs after /clear:
#   1. Session status (what am I doing?)
#   2. Active plan context (why am I doing it?)
#   3. Active tasks (what's on my todo list?)
#   4. Recent user messages from JSONL (what was the conversation about?)
#
# Foundation docs (CLAUDE.md, identity, capability-map, indexes) are NOT
# included — Claude Code auto-loads them on every session start.
#
# Called by: jicm-watcher.sh do_compress() as a synchronous subprocess
# Output:   .claude/context/.compressed-context-ready.md
#            .claude/context/.compression-done.signal
#
# ============================================================================

set -eu
# Note: pipefail intentionally omitted. This script uses head/tail in
# pipelines which close pipes early, causing SIGPIPE (exit 141) on the
# upstream command. This is normal pipe behavior, not an error.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
PROJECTS_DIR="$HOME/.claude/projects/-Users-aircannon-Claude-Jarvis"
OUTPUT="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
ACTIVE_PLAN_FILE="$PROJECT_DIR/.claude/context/.active-plan"
TASKS_FILE="$PROJECT_DIR/.claude/context/.active-tasks.txt"
SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"

# Configuration
JSONL_TAIL_LINES=5000    # Scan last N JSONL entries for user messages
USER_MSG_COUNT=10        # Number of recent user messages to include
MSG_TRUNCATE_CHARS=500   # Max chars per user message

# ============================================================================
# Step 1: Find most recent JSONL transcript
# ============================================================================

JSONL=""
if [[ -d "$PROJECTS_DIR" ]]; then
    JSONL=$(ls -t "$PROJECTS_DIR"/*.jsonl 2>/dev/null | head -1)
fi

if [[ -z "$JSONL" ]]; then
    echo "WARN: No JSONL transcript found — writing minimal checkpoint" >&2
    # Graceful fallback: minimal checkpoint with just session status
    {
        echo "# JICM v7 Context Checkpoint (minimal)"
        echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo ""
        echo "## Session Status"
        grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
            | sed 's/\*\*//g' || echo "Status: unknown"
        echo ""
        echo "## Resume Instructions"
        echo "Context cleared via JICM v7. No JSONL transcript found."
        echo "Read session-state.md and current-priorities.md to orient."
    } > "$OUTPUT"
    echo "$(date +%s)" > "$SIGNAL"
    exit 0
fi

# ============================================================================
# Step 2: Extract recent user messages from JSONL transcript
# ============================================================================
# Filter chain:
#   - type == "user" (not assistant, progress, system)
#   - content is string (not array — arrays are tool results)
#   - not starting with "<" (system tags: <command-name>, <local-command-*>)
#   - not starting with "[JICM-" (watcher commands: [JICM-HALT], [JICM-RESUME])
#   - length > 10 (skip empty/trivial entries)
#   - truncate to MSG_TRUNCATE_CHARS chars per message
#   - take last USER_MSG_COUNT messages
# Output: one JSON string per line (compact mode), then decode to raw text

USER_MSGS=$(tail -"$JSONL_TAIL_LINES" "$JSONL" \
    | jq -c "
        select(.type == \"user\")
        | .message.content
        | select(type == \"string\")
        | select(startswith(\"<\") | not)
        | select(startswith(\"[JICM-\") | not)
        | select(length > 10)
        | .[0:${MSG_TRUNCATE_CHARS}]
    " 2>/dev/null \
    | tail -"$USER_MSG_COUNT" \
    | jq -r '.' 2>/dev/null \
    || echo "(no user messages extracted)")

# ============================================================================
# Step 3: Build compressed context checkpoint
# ============================================================================

{
    echo "# JICM v7 Context Checkpoint"
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    # --- Session status (1 line from session-state.md) ---
    echo "## Session Status"
    grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
        | sed 's/\*\*//g' || echo "Status: unknown"
    echo ""

    # --- Active plan (title + context section from tracked plan file) ---
    if [[ -f "$ACTIVE_PLAN_FILE" ]]; then
        plan_path=$(tr -d '[:space:]' < "$ACTIVE_PLAN_FILE")
        if [[ -n "$plan_path" ]] && [[ -f "$plan_path" ]]; then
            echo "## Active Plan"
            # Extract title + context section (up to first ---)
            head -30 "$plan_path" | sed -n '1,/^---$/p'
            echo ""
        fi
    fi

    # --- Active tasks (if TodoWrite tasks were dumped) ---
    if [[ -f "$TASKS_FILE" ]] && [[ -s "$TASKS_FILE" ]]; then
        echo "## Active Tasks"
        cat "$TASKS_FILE"
        echo ""
    fi

    # --- Recent user messages (conversation thread for continuity) ---
    echo "## Recent Conversation (last ${USER_MSG_COUNT} user messages)"
    if [[ -n "$USER_MSGS" ]]; then
        echo "$USER_MSGS"
    else
        echo "(no messages extracted)"
    fi
    echo ""

    # --- Resume instructions ---
    echo "## Resume Instructions"
    echo "You are Jarvis. Context was cleared via JICM v7 stop-and-wait cycle."
    echo "Foundation docs (CLAUDE.md, capability-map.yaml, identity) are auto-loaded."
    echo "Review the conversation thread above, then continue the work."

} > "$OUTPUT"

# ============================================================================
# Step 4: Write completion signal
# ============================================================================

echo "$(date +%s)" > "$SIGNAL"

# Report output size
OUTPUT_LINES=$(wc -l < "$OUTPUT" | tr -d ' ')
OUTPUT_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
echo "Context prepared: ${OUTPUT_LINES} lines, ${OUTPUT_BYTES} bytes" >&2
