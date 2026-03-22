#!/bin/bash
# ============================================================================
# jicm-prep-context.sh — JICM v7 Rich Context Preparation
# ============================================================================
#
# Two-tier checkpoint system:
#   Tier 1: Fast bash extraction (~1s) — structured data from JSONL, git, plans
#   Tier 2: Local LLM narrative pass (~2-5s) — qwen3-8b-nothink synthesizes
#           a rich, resumable checkpoint from the Tier 1 data
#
# Extracts what Jarvis actually needs after /clear:
#   1. Session status + priorities (what am I doing, what's next?)
#   2. Active plan context (why am I doing it?)
#   3. Active tasks from TodoWrite (what's on my todo list?)
#   4. Git state (what files changed, what's uncommitted?)
#   5. Recent user + assistant messages (what was the conversation about?)
#   6. LLM narrative summary (structured checkpoint for seamless resumption)
#
# Foundation docs (CLAUDE.md, identity, capability-map, indexes) are NOT
# included — Claude Code auto-loads them on every session start.
#
# Called by: jicm-watcher.sh do_compress(), idle checkpoint, pre-clear hook
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
SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"

# Configuration (defaults — can be overridden via .prep-override file)
JSONL_TAIL_LINES=5000    # Scan last N JSONL entries for user messages
USER_MSG_COUNT=10         # Number of recent user messages to include
MSG_TRUNCATE_CHARS=2000   # Max chars per user message (was 500)
INCLUDE_PLAN=true         # Include active plan context in checkpoint
INCLUDE_ASSISTANT=true    # Include assistant messages for richer context
JSONL_PATH=""             # Override JSONL path (for experiments)
LLM_SUMMARIZE=true        # Enable local LLM narrative pass (Tier 2)
LLM_ENDPOINT="http://localhost:11434/api/chat"  # Ollama direct (LiteLLM adds 13s overhead)
LLM_MODEL="qwen3:8b"
LLM_TIMEOUT=20            # Max seconds for LLM call
LLM_MAX_TOKENS=2000       # Output token cap (was 400 — caused truncation)

# ============================================================================
# Override support (for experiments / treatment variations)
# ============================================================================
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
            LLM_SUMMARIZE)      LLM_SUMMARIZE="$value" ;;
            LLM_ENDPOINT)       LLM_ENDPOINT="$value" ;;
            LLM_MODEL)          LLM_MODEL="$value" ;;
            LLM_TIMEOUT)        LLM_TIMEOUT="$value" ;;
            LLM_MAX_TOKENS)     LLM_MAX_TOKENS="$value" ;;
        esac
    done < "$OVERRIDE_FILE"
    echo "Override applied: msgs=$USER_MSG_COUNT trunc=$MSG_TRUNCATE_CHARS plan=$INCLUDE_PLAN asst=$INCLUDE_ASSISTANT llm=$LLM_SUMMARIZE" >&2
fi

# ============================================================================
# Shared jq filter for genuine user messages
# ============================================================================
# Reused by both find_best_jsonl() and the main extraction.
# Filters out: tool results, system tags, JICM commands, IDLE-HANDS,
# interrupts, session continuations, end-session commands.

JQ_USER_FILTER='
    select(.type == "user")
    | select(.toolUseResult == null)
    | .message.content
    | if type == "array" then
        [.[] | select(.type == "text") | .text] | join(" ")
      elif type == "string" then .
      else empty end
    | select(type == "string")
    | select(length > 30)
    | select(startswith("<") | not)
    | select(startswith("[JICM-") | not)
    | select(startswith("[IDLE-HANDS]") | not)
    | select(startswith("[Request interrupted") | not)
    | select(startswith("This session is being continued") | not)
    | select(startswith("# End Session") | not)
'

# ============================================================================
# Step 1: Find best JSONL transcript
# ============================================================================
# After /clear, the newest JSONL is often the new empty post-clear session.
# Scan the 3 most recent and pick the one with the most genuine user messages.

find_best_jsonl() {
    local dir="$1"

    # Priority 1: Find JSONL with most recent [JICM-HALT] marker.
    # This text appears ONLY in W0's JSONL (watcher sends HALT only to W0).
    # Guaranteed correct targeting during compression cycles.
    local halt_match=""
    for f in $(ls -t "$dir"/*.jsonl 2>/dev/null | head -5); do
        if tail -200 "$f" 2>/dev/null | grep -q '\[JICM-HALT\]' 2>/dev/null; then
            halt_match="$f"
            break  # Most recently modified file with HALT wins
        fi
    done
    if [[ -n "$halt_match" ]]; then
        echo "JSONL targeted via [JICM-HALT] marker: $(basename "$halt_match")" >&2
        echo "$halt_match"
        return 0
    fi

    # Priority 2: Message count, but only files modified in the last 10 minutes.
    # This prevents stale, large W5 sessions from being selected during idle checkpoints.
    local best="" best_count=0
    local cutoff=$(( $(date +%s) - 600 ))

    for f in $(ls -t "$dir"/*.jsonl 2>/dev/null | head -5); do
        local fmtime
        fmtime=$(stat -f %m "$f" 2>/dev/null || echo 0)
        if [[ $fmtime -lt $cutoff ]]; then
            continue  # Skip files not modified in last 10 min
        fi

        local count
        count=$(tail -5000 "$f" 2>/dev/null \
            | jq -c "$JQ_USER_FILTER" 2>/dev/null \
            | wc -l | tr -d ' ')
        if [[ $count -gt $best_count ]]; then
            best="$f"
            best_count=$count
        fi
    done

    if [[ -n "$best" ]]; then
        echo "JSONL selected via message count (${best_count} msgs, <10min): $(basename "$best")" >&2
        echo "$best"
    else
        # Last resort: newest file (no recency filter)
        ls -t "$dir"/*.jsonl 2>/dev/null | head -1
    fi
}

JSONL=""
if [[ -n "$JSONL_PATH" ]] && [[ -f "$JSONL_PATH" ]]; then
    JSONL="$JSONL_PATH"
    echo "Using override JSONL: $JSONL" >&2
elif [[ -d "$PROJECTS_DIR" ]]; then
    JSONL=$(find_best_jsonl "$PROJECTS_DIR")
    if [[ -n "$JSONL" ]]; then
        echo "Selected JSONL: $(basename "$JSONL")" >&2
    fi
fi

if [[ -z "$JSONL" ]]; then
    echo "WARN: No JSONL transcript found (checked $PROJECTS_DIR) — writing minimal checkpoint" >&2
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
        echo "Read session-state.md (includes priorities) to orient."
    } > "$OUTPUT"
    echo "$(date +%s)" > "$SIGNAL"
    exit 0
fi

# ============================================================================
# Step 2: Extract recent user messages from JSONL transcript
# ============================================================================

USER_MSGS=$(tail -"$JSONL_TAIL_LINES" "$JSONL" \
    | jq -c "${JQ_USER_FILTER} | .[0:${MSG_TRUNCATE_CHARS}]" 2>/dev/null \
    | tail -"$USER_MSG_COUNT" \
    | jq -r '.' 2>/dev/null \
    || echo "")

# ============================================================================
# Step 2b: Extract assistant messages
# ============================================================================

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
            | select(length > 50)
            | select(startswith(\"Context restored\") | not)
            | select(contains(\"JICM\") | not)
            | select(contains(\"compressed-context-ready\") | not)
            | select(startswith(\"Resuming from JICM\") | not)
            | .[0:${MSG_TRUNCATE_CHARS}]
        " 2>/dev/null \
        | tail -"$USER_MSG_COUNT" \
        | jq -r '.' 2>/dev/null \
        || echo "")
fi

# ============================================================================
# Step 2c: Extract TodoWrite tasks from JSONL
# ============================================================================
# The .todos array on JSONL entries contains the live task list state.
# Take the most recent entry that has a non-empty todos array.

TODOS=""
TODOS_RAW=$(tail -2000 "$JSONL" \
    | jq -c 'select(.todos != null and (.todos | length > 0)) | .todos' 2>/dev/null \
    | tail -1)

if [[ -n "$TODOS_RAW" ]] && [[ "$TODOS_RAW" != "[]" ]]; then
    TODOS=$(echo "$TODOS_RAW" | jq -r '.[] | "- [\(.status // "?")] \(.subject // "untitled")"' 2>/dev/null || echo "")
fi

# ============================================================================
# Step 3: Build Tier 1 compressed context checkpoint
# ============================================================================

{
    echo "# JICM v7 Context Checkpoint"
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    # --- Session status + priorities ---
    echo "## Session Status"
    grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
        | sed 's/\*\*//g' || echo "Status: unknown"

    # Staleness indicator — helps LLM know if session-state is outdated
    if [[ -f "$SESSION_STATE" ]]; then
        STATE_MTIME=$(stat -f %m "$SESSION_STATE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        STALE_MINS=$(( (NOW - STATE_MTIME) / 60 ))
        if [[ $STALE_MINS -gt 60 ]]; then
            echo "(session-state.md last updated ${STALE_MINS}m ago — may be stale, prefer conversation for current task)"
        fi
    fi
    echo ""

    # Current Priorities section (multi-line extraction)
    if [[ -f "$SESSION_STATE" ]]; then
        PRIORITIES=$(sed -n '/^## Current Priorities/,/^## [^C]/p' "$SESSION_STATE" 2>/dev/null \
            | grep -v '^## [^C]' | head -40)
        if [[ -n "$PRIORITIES" ]]; then
            echo "$PRIORITIES"
            echo ""
        fi
    fi

    # --- Git state ---
    echo "## Git State"
    echo "Branch: $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo unknown)"
    UNCOMMITTED=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | grep -v '^??' | head -15)
    if [[ -n "$UNCOMMITTED" ]]; then
        echo "### Uncommitted Changes"
        echo '```'
        echo "$UNCOMMITTED"
        echo '```'
    else
        echo "Working tree clean."
    fi
    RECENT_DIFF=$(git -C "$PROJECT_DIR" diff --stat HEAD~3..HEAD 2>/dev/null | tail -8)
    if [[ -n "$RECENT_DIFF" ]]; then
        echo "### Recent Commits"
        echo '```'
        echo "$RECENT_DIFF"
        echo '```'
    fi
    echo ""

    # --- Active plans (from current-plans.md, falling back to .active-plan) ---
    CURRENT_PLANS_FILE="$PROJECT_DIR/.claude/context/current-plans.md"
    if [[ "$INCLUDE_PLAN" == "true" ]]; then
        if [[ -f "$CURRENT_PLANS_FILE" ]]; then
            echo "## Active Plans"
            # Extract the Active section entries
            sed -n '/^## Active/,/^## /p' "$CURRENT_PLANS_FILE" 2>/dev/null \
                | grep -v '^## [^A]' | head -10
            echo ""

            # Include body of first active plan (title + context section)
            FIRST_PLAN_REL=$(sed -n '/^## Active/,/^## /p' "$CURRENT_PLANS_FILE" 2>/dev/null \
                | grep -oE '\([^)]+\.md\)' | head -1 | tr -d '()')
            if [[ -n "$FIRST_PLAN_REL" ]]; then
                FIRST_PLAN_FULL="$PROJECT_DIR/$FIRST_PLAN_REL"
                if [[ -f "$FIRST_PLAN_FULL" ]]; then
                    echo "### Plan Details"
                    head -40 "$FIRST_PLAN_FULL" | sed -n '1,/^---$/p'
                    echo ""
                fi
            fi
        elif [[ -f "$ACTIVE_PLAN_FILE" ]]; then
            # Fallback to single .active-plan tracker
            plan_path=$(tr -d '[:space:]' < "$ACTIVE_PLAN_FILE")
            if [[ -n "$plan_path" ]] && [[ -f "$plan_path" ]]; then
                echo "## Active Plan"
                head -40 "$plan_path" | sed -n '1,/^---$/p'
                echo ""
            fi
        fi
    fi

    # --- Active tasks (from TodoWrite via JSONL) ---
    if [[ -n "$TODOS" ]]; then
        echo "## Active Tasks (TodoWrite)"
        echo "$TODOS"
        echo ""
    fi

    # --- Recent conversation ---
    echo "## Recent Conversation (last ${USER_MSG_COUNT} messages)"
    if [[ -n "$USER_MSGS" ]]; then
        echo ""
        echo "### User Messages"
        echo "$USER_MSGS"
    else
        echo "(no user messages extracted)"
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
    echo "Review the session status, active plan, and conversation above, then continue the work."
    echo "If the conversation is sparse, read session-state.md for full priorities."

} > "$OUTPUT"

# ============================================================================
# Step 4: Tier 2 — Local LLM narrative summarization
# ============================================================================
# Feed Tier 1 extraction to qwen3-8b-nothink for a rich narrative checkpoint.
# Falls back gracefully to Tier 1 output if LiteLLM is unavailable.

if [[ "$LLM_SUMMARIZE" == "true" ]]; then
    TIER1_CONTENT=$(cat "$OUTPUT")

    # Quick health check — Ollama /api/tags is fast and reliable
    LLM_AVAILABLE=false
    if curl -sf --max-time 2 "http://localhost:11434/api/tags" >/dev/null 2>&1; then
        LLM_AVAILABLE=true
    fi

    if [[ "$LLM_AVAILABLE" == "true" ]]; then
        # Build CONDENSED input for LLM — structured data + truncated messages
        # Full data stays in Tier 1 raw appendix. This cuts input tokens ~60%.
        LLM_INPUT_FILE=$(mktemp)
        {
            # Session status + priorities (high-value structured data)
            echo "## Session Status"
            grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
                | sed 's/\*\*//g' || echo "Status: unknown"
            if [[ -f "$SESSION_STATE" ]]; then
                STATE_MTIME=$(stat -f %m "$SESSION_STATE" 2>/dev/null || echo 0)
                NOW=$(date +%s)
                STALE_MINS=$(( (NOW - STATE_MTIME) / 60 ))
                if [[ $STALE_MINS -gt 60 ]]; then
                    echo "WARNING: session-state.md is ${STALE_MINS}m stale. Derive current task from conversation, not this status."
                fi
            fi
            echo ""
            if [[ -f "$SESSION_STATE" ]]; then
                sed -n '/^## Current Priorities/,/^## [^C]/p' "$SESSION_STATE" 2>/dev/null \
                    | grep -v '^## [^C]' | head -15
                echo ""
            fi

            # Git state (compact)
            echo "## Git State"
            echo "Branch: $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo unknown)"
            git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | grep -v '^??' | head -10
            echo ""

            # Active tasks
            if [[ -n "$TODOS" ]]; then
                echo "## Active Tasks"
                echo "$TODOS"
                echo ""
            fi

            # Plan status (current-plans.md shows Active vs Recently Completed)
            CURRENT_PLANS_FILE="$PROJECT_DIR/.claude/context/current-plans.md"
            if [[ "$INCLUDE_PLAN" == "true" ]] && [[ -f "$CURRENT_PLANS_FILE" ]]; then
                echo "## Plan Status"
                cat "$CURRENT_PLANS_FILE"
                echo ""
            fi

            # Previous checkpoint inclusion REMOVED (2026-02-22).
            # It created a feedback loop: LLM copied stale "Current Task" and
            # "Critical Context" from prior checkpoints, propagating indefinitely.
            # Tier 1 already provides session-state, git, tasks, conversation,
            # and plans — sufficient for resumption without prior checkpoint echo.

            # Condensed conversation — last 8 messages, first 300 chars each
            # Full messages are in the Tier 1 raw appendix; LLM needs enough to derive current task
            echo "## Recent Conversation (condensed)"
            if [[ -n "$USER_MSGS" ]]; then
                echo "### User Messages (last 8)"
                echo "$USER_MSGS" | tail -5000 | python3 -c '
import sys
msgs = sys.stdin.read().strip().split("\n")
seen = []
for m in msgs[-50:]:
    m = m.strip()
    if len(m) > 30 and m not in seen:
        seen.append(m[:300])
for m in seen[-8:]:
    print(m)
' 2>/dev/null
            fi
            if [[ "$INCLUDE_ASSISTANT" == "true" ]] && [[ -n "$ASST_MSGS" ]]; then
                echo "### Assistant Responses (last 5)"
                echo "$ASST_MSGS" | python3 -c '
import sys
msgs = [m.strip() for m in sys.stdin.read().strip().split("\n") if len(m.strip()) > 30]
for m in msgs[-5:]:
    print(m[:300])
' 2>/dev/null
            fi
        } > "$LLM_INPUT_FILE"

        LLM_INPUT_SIZE=$(wc -c < "$LLM_INPUT_FILE" | tr -d ' ')
        echo "LLM condensed input: ${LLM_INPUT_SIZE} bytes" >&2

        # Call Ollama via python3 for safe JSON escaping
        LLM_RESPONSE=$(PREP_INPUT="$LLM_INPUT_FILE" \
            PREP_MODEL="$LLM_MODEL" \
            PREP_TIMEOUT="$LLM_TIMEOUT" \
            PREP_MAX_TOKENS="$LLM_MAX_TOKENS" \
            PREP_ENDPOINT="$LLM_ENDPOINT" \
            python3 -c '
import json, subprocess, sys, os

SYSTEM_PROMPT = """You are Jarvis context preservation system. Given raw session data, produce a structured checkpoint for resuming work after context is cleared. Include ONLY these sections:

## Current Task
What is Jarvis working on RIGHT NOW? Be specific about the project and immediate goal. Derive this from the conversation and active tasks, NOT from stale session-state.

## Progress
Numbered steps — what is done (DONE) vs remaining (TODO/IN PROGRESS). Include items from BOTH the session-state priorities AND any new work visible in the conversation.

## Critical Context
Protocols, configurations, bug fixes, or discoveries that must not be lost. Include exact commands, file paths, code snippets where relevant.

## Key Paths
Important files and directories for the current work. Use full absolute paths.

## Next Step
The exact next action to take — ideally a runnable command or clear instruction.

## Resume Instructions
Specific guidance for picking up where we left off.

Rules:
- Be concise but thorough. Preserve exact file paths and commands.
- ALWAYS preserve the Current Priorities section from session-state verbatim — do not paraphrase or omit items.
- Derive the Current Task from the MOST RECENT conversation messages, not from stale session status.
- CRITICAL: If Plan Status is provided, ONLY report tasks as IN PROGRESS if they appear under "## Active" in Plan Status. Plans under "## Recently Completed" are DONE — do not report them as in-progress.
- CRITICAL: The "Previous Checkpoint Reference" section is from a PRIOR compression cycle. Do NOT copy its Current Task or Next Step. Derive Current Task ONLY from Recent Conversation and Active Tasks. If conversation is empty, say "No active conversation — check session-state.md for priorities."
- The project root is: {project_dir}. Use this for all file paths — do NOT guess or use generic paths like /home/user.
- Do NOT hallucinate. If uncertain, say so."""

input_file = os.environ["PREP_INPUT"]
model = os.environ["PREP_MODEL"]
timeout = os.environ["PREP_TIMEOUT"]
max_tokens = int(os.environ["PREP_MAX_TOKENS"])
endpoint = os.environ["PREP_ENDPOINT"]
project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.path.expanduser("~/Claude/Jarvis"))

try:
    content = open(input_file).read()
except FileNotFoundError:
    sys.exit(1)

system_prompt = SYSTEM_PROMPT.replace("{project_dir}", project_dir)

payload = json.dumps({
    "model": model,
    "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content}
    ],
    "stream": False,
    "think": False,
    "options": {"num_predict": max_tokens}
})

result = subprocess.run(
    ["curl", "-sf", "--max-time", timeout,
     endpoint,
     "-H", "Content-Type: application/json",
     "-d", payload],
    capture_output=True, text=True
)

if result.returncode == 0 and result.stdout:
    try:
        r = json.loads(result.stdout)
        print(r["message"]["content"])
    except (KeyError, json.JSONDecodeError):
        sys.exit(1)
else:
    sys.exit(1)
' 2>/dev/null)
        rm -f "$LLM_INPUT_FILE"

        LLM_EXIT=$?

        if [[ $LLM_EXIT -eq 0 ]] && [[ -n "$LLM_RESPONSE" ]] && [[ ${#LLM_RESPONSE} -gt 100 ]]; then
            # Prepend LLM narrative, keep Tier 1 as raw appendix
            {
                echo "# JICM v7 Context Checkpoint"
                echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
                echo "Method: LLM-enriched ($LLM_MODEL)"
                echo ""
                echo "$LLM_RESPONSE"
                echo ""
                echo "---"
                echo ""
                echo "## Raw Session Data (Tier 1 extraction)"
                echo ""
                # Skip the first 2 lines of Tier 1 (duplicate header + timestamp)
                echo "$TIER1_CONTENT" | tail -n +3
            } > "$OUTPUT"
            NARRATIVE_LINES=$(echo "$LLM_RESPONSE" | wc -l | tr -d ' ')
            echo "LLM enrichment applied (${NARRATIVE_LINES} lines)" >&2
        else
            echo "LLM response insufficient (exit=$LLM_EXIT len=${#LLM_RESPONSE:-0}) — keeping Tier 1" >&2
        fi
    else
        echo "LiteLLM unavailable — keeping Tier 1 output" >&2
    fi
fi

# ============================================================================
# Step 4b: Validate checkpoint — detect LLM hallucination (REFL-022)
# ============================================================================
# Compare checkpoint's "Current Task" against current-plans.md Active section.
# If the LLM inferred a stale or wrong task, log a self-correction.

SELF_CORRECTIONS="$PROJECT_DIR/.claude/context/psyche/self-knowledge/self-corrections.md"
CURRENT_PLANS="$PROJECT_DIR/.claude/context/current-plans.md"

if [[ -f "$OUTPUT" ]] && [[ -f "$CURRENT_PLANS" ]]; then
    # Extract "Current Task" line from checkpoint (case-insensitive)
    CHECKPOINT_TASK=$(grep -i 'current task\|currently working\|in progress' "$OUTPUT" | head -1 | sed 's/^[#*: -]*//' | tr -d '\n' || true)

    if [[ -n "$CHECKPOINT_TASK" ]] && [[ ${#CHECKPOINT_TASK} -gt 10 ]]; then
        # Check if checkpoint references something marked COMPLETE in current-plans
        STALE_MATCH=$(echo "$CHECKPOINT_TASK" | grep -iE 'Stage 3\.[0-3]|CDM Schema Fixes|CDM Expansion|Worldgen Monitoring|Knowledge Horizon' || true)
        if [[ -n "$STALE_MATCH" ]]; then
            echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) | judgment | JICM checkpoint inferred stale task: '${CHECKPOINT_TASK:0:100}' — stages 3.0-3.3 are COMPLETE per current-plans.md | Should derive current task from recent conversation only | Lesson: LLM enrichment continues to hallucinate completed tasks as active" >> "$SELF_CORRECTIONS"
            echo "WARN: Checkpoint task validation detected stale reference — logged to self-corrections.md" >&2
        fi
    fi
fi

# ============================================================================
# Step 5: Write completion signal
# ============================================================================

echo "$(date +%s)" > "$SIGNAL"

# Report output size
OUTPUT_LINES=$(wc -l < "$OUTPUT" | tr -d ' ')
OUTPUT_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
echo "Context prepared: ${OUTPUT_LINES} lines, ${OUTPUT_BYTES} bytes" >&2
