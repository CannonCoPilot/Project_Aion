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
PROJECTS_DIR="$HOME/.claude/projects/-Users-nathanielcannon-Claude-Jarvis"
OUTPUT="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
ACTIVE_PLAN_FILE="$PROJECT_DIR/.claude/context/.active-plan"
TASKS_FILE="$PROJECT_DIR/.claude/context/.active-tasks.txt"
SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"

# Configuration (defaults — can be overridden via .prep-override file)
JSONL_TAIL_LINES=5000    # Scan last N JSONL entries for user messages
USER_MSG_COUNT=10        # Number of recent user messages to include
MSG_TRUNCATE_CHARS=500   # Max chars per user message
INCLUDE_PLAN=true        # Include active plan context in checkpoint
INCLUDE_ASSISTANT=false  # Include assistant messages (for v7-mixed treatment)
JSONL_PATH=""            # Override JSONL path (for experiments with clean transcripts)

# ============================================================================
# Override support (for experiments / treatment variations)
# ============================================================================
# If .prep-override exists, read KEY=VALUE pairs to override defaults.
# Used by Experiment 7 to test different prep configurations.
OVERRIDE_FILE="$PROJECT_DIR/.claude/context/.prep-override"

if [[ -f "$OVERRIDE_FILE" ]]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" == \#* ]] && continue
        key=$(echo "$key" | tr -d '[:space:]')
        value=$(echo "$value" | tr -d '[:space:]')
        case "$key" in
            USER_MSG_COUNT)     USER_MSG_COUNT="$value" ;;
            MSG_TRUNCATE_CHARS) MSG_TRUNCATE_CHARS="$value" ;;
            INCLUDE_PLAN)       INCLUDE_PLAN="$value" ;;
            INCLUDE_ASSISTANT)  INCLUDE_ASSISTANT="$value" ;;
            JSONL_TAIL_LINES)   JSONL_TAIL_LINES="$value" ;;
            JSONL_PATH)         JSONL_PATH="$value" ;;
        esac
    done < "$OVERRIDE_FILE"
    echo "Override applied: msgs=$USER_MSG_COUNT trunc=$MSG_TRUNCATE_CHARS plan=$INCLUDE_PLAN asst=$INCLUDE_ASSISTANT" >&2
fi

# ============================================================================
# Step 1: Find most recent JSONL transcript
# ============================================================================

JSONL=""
if [[ -n "$JSONL_PATH" ]] && [[ -f "$JSONL_PATH" ]]; then
    JSONL="$JSONL_PATH"
    echo "Using override JSONL: $JSONL" >&2
elif [[ -d "$PROJECTS_DIR" ]]; then
    JSONL=$(ls -t "$PROJECTS_DIR"/*.jsonl 2>/dev/null | head -1)
fi

if [[ -z "$JSONL" ]]; then
    echo "WARN: No JSONL transcript found (checked $PROJECTS_DIR) — writing minimal checkpoint" >&2
    echo "WARN: This usually means PROJECTS_DIR is wrong. Current: $PROJECTS_DIR" >&2
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
#   - type == "user", no tool results, not meta
#   - content: handle both string and array formats
#     - string: use as-is
#     - array: extract text blocks, join them
#   - not starting with "<" (system tags: <command-name>, <local-command-*>)
#   - not starting with "[JICM-" (watcher commands: [JICM-HALT], [JICM-RESUME])
#   - not "[Request interrupted" (user interrupts)
#   - not "This session is being continued" (context restoration preambles)
#   - length > 30 (skip empty/trivial entries)
#   - truncate to MSG_TRUNCATE_CHARS chars per message
#   - take last USER_MSG_COUNT messages
# Output: one JSON string per line (compact mode), then decode to raw text

USER_MSGS=$(tail -"$JSONL_TAIL_LINES" "$JSONL" \
    | jq -c "
        select(.type == \"user\")
        | select(.toolUseResult == null)
        | .message.content
        | if type == \"array\" then
            [.[] | select(.type == \"text\") | .text] | join(\" \")
          elif type == \"string\" then .
          else empty end
        | select(type == \"string\")
        | select(length > 30)
        | select(startswith(\"<\") | not)
        | select(startswith(\"[JICM-\") | not)
        | select(startswith(\"[Request interrupted\") | not)
        | select(startswith(\"This session is being continued\") | not)
        | select(startswith(\"# End Session\") | not)
        | .[0:${MSG_TRUNCATE_CHARS}]
    " 2>/dev/null \
    | tail -"$USER_MSG_COUNT" \
    | jq -r '.' 2>/dev/null \
    || echo "(no user messages extracted)")

# ============================================================================
# Step 2b: Extract assistant messages (if INCLUDE_ASSISTANT=true)
# ============================================================================
# For v7-mixed treatment: also capture assistant text responses.
# Assistant messages have content as string OR array of content blocks.
# We extract only text blocks, skip tool_use/tool_result.

ASST_MSGS=""
if [[ "$INCLUDE_ASSISTANT" == "true" ]]; then
    ASST_MSGS=$(tail -"$JSONL_TAIL_LINES" "$JSONL" \
        | jq -c "
            select(.type == \"assistant\")
            | .message.content
            | if type == \"array\" then
                [.[] | select(.type == \"text\") | .text] | join(\" \")
              else . end
            | select(type == \"string\")
            | select(length > 10)
            | .[0:${MSG_TRUNCATE_CHARS}]
        " 2>/dev/null \
        | tail -"$USER_MSG_COUNT" \
        | jq -r '.' 2>/dev/null \
        || echo "")
fi

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
    if [[ "$INCLUDE_PLAN" == "true" ]] && [[ -f "$ACTIVE_PLAN_FILE" ]]; then
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

    # --- Recent messages (conversation thread for continuity) ---
    if [[ "$INCLUDE_ASSISTANT" == "true" ]]; then
        echo "## Recent Conversation (last ${USER_MSG_COUNT} user + assistant messages)"
    else
        echo "## Recent Conversation (last ${USER_MSG_COUNT} user messages)"
    fi
    if [[ -n "$USER_MSGS" ]]; then
        echo "$USER_MSGS"
    else
        echo "(no messages extracted)"
    fi
    if [[ "$INCLUDE_ASSISTANT" == "true" ]] && [[ -n "$ASST_MSGS" ]]; then
        echo ""
        echo "### Assistant Responses"
        echo "$ASST_MSGS"
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
