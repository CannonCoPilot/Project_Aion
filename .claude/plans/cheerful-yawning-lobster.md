# Enrich JICM Context Checkpoints

## Context

The auto-generated `.compressed-context-ready.md` files are thin and often broken — 28 lines of mostly empty sections ("no messages extracted", "No active tasks"), with only a single status line from session-state.md. Compare to manually written checkpoints which are 150+ lines with specific task progress, bug fix details, protocol documentation, exact next-step commands, and key file paths.

**Root causes identified:**
1. **Wrong JSONL after /clear** — `ls -t | head -1` picks the new empty post-clear JSONL, not the productive session
2. **Only 1 line of session-state.md** — `grep -m1` captures just the status line, missing priorities/next steps
3. **No TodoWrite dump** — `.active-tasks.txt` is a stale placeholder, no hook writes to it
4. **No git state** — uncommitted changes and recently modified files not included
5. **[IDLE-HANDS] messages pollute output** — no filter for `[IDLE-HANDS]` prefix
6. **Assistant messages disabled** — `INCLUDE_ASSISTANT=false` by default
7. **No narrative synthesis** — bash can only do structural extraction, not semantic summary

**LLM summarization is viable** — `qwen3-8b-nothink` via LiteLLM (localhost:4000) returns structured summaries in ~2s. This is the quality multiplier that bridges the gap.

## Architecture: Two-Tier Checkpoint

```
Tier 1: Enhanced Bash Extraction (~1s, always runs)
  ├── Fix JSONL selection (scan 3 most recent, find richest)
  ├── Include full session-state.md key sections
  ├── Extract TodoWrite tasks from JSONL
  ├── Add git status + recently modified files
  ├── Filter [IDLE-HANDS] messages
  ├── Enable assistant messages (INCLUDE_ASSISTANT=true)
  └── Increase message truncation (500 → 2000 chars)
       │
       ▼
Tier 2: Local LLM Narrative Pass (~2-5s, graceful fallback)
  ├── Feed Tier 1 raw extraction to qwen3-8b-nothink
  ├── LLM produces structured narrative checkpoint
  ├── Sections: Current Task, Progress, Critical Context, Key Paths, Next Step
  └── Falls back to Tier 1 output if LiteLLM unavailable
```

**Time budget**: ~3-6s total (vs current <1s). Acceptable for idle checkpoints (30s interval) and pre-/clear hooks.

## Implementation Steps

### Step 1: Fix JSONL Selection

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Replace `ls -t | head -1` (line 76) with a function that scans the 3 most recent JSONLs and picks the one with the most genuine user messages:

```bash
find_best_jsonl() {
    local dir="$1"
    local best="" best_count=0
    for f in $(ls -t "$dir"/*.jsonl 2>/dev/null | head -3); do
        local count
        count=$(tail -5000 "$f" | jq -c '
            select(.type == "user")
            | select(.toolUseResult == null)
            | .message.content
            | if type == "array" then
                [.[] | select(.type == "text") | .text] | join(" ")
              elif type == "string" then . else empty end
            | select(length > 30)
            | select(startswith("<") | not)
            | select(startswith("[JICM-") | not)
            | select(startswith("[IDLE-HANDS]") | not)
        ' 2>/dev/null | wc -l | tr -d ' ')
        if [[ $count -gt $best_count ]]; then
            best="$f"
            best_count=$count
        fi
    done
    echo "$best"
}
```

### Step 2: Include Key Session-State Sections

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Replace the single `grep -m1` (line 174) with extraction of multiple sections:
- Status line (existing)
- Current Priorities section (In Progress + Up Next)
- Notes section (if present)

Use `sed` to extract between section headers:
```bash
echo "## Session Status"
# Status line
grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null | sed 's/\*\*//g' || echo "Status: unknown"
echo ""
# Current Priorities (everything from "## Current Priorities" to next "## " or EOF)
sed -n '/^## Current Priorities/,/^## [^C]/p' "$SESSION_STATE" 2>/dev/null | head -30
```

### Step 3: Extract TodoWrite Tasks from JSONL

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Instead of reading the stale `.active-tasks.txt`, extract the most recent `.todos` array from JSONL entries:

```bash
TODOS=$(tail -2000 "$JSONL" | jq -c '
    select(.todos != null and (.todos | length > 0))
    | .todos
' 2>/dev/null | tail -1)  # Last entry with todos = most recent state

if [[ -n "$TODOS" ]] && [[ "$TODOS" != "[]" ]]; then
    echo "## Active Tasks"
    echo "$TODOS" | jq -r '.[] | "- [\(.status)] \(.subject)"' 2>/dev/null
    echo ""
fi
```

### Step 4: Add Git State Section

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Add after the session status section:
```bash
echo "## Git State"
echo "Branch: $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo unknown)"
UNCOMMITTED=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | grep -v '^??' | head -10)
if [[ -n "$UNCOMMITTED" ]]; then
    echo "Uncommitted changes:"
    echo "$UNCOMMITTED" | while read -r line; do echo "  $line"; done
fi
RECENT_FILES=$(git -C "$PROJECT_DIR" diff --stat HEAD~3..HEAD 2>/dev/null | tail -5)
if [[ -n "$RECENT_FILES" ]]; then
    echo "Recent commits touched:"
    echo "$RECENT_FILES" | while read -r line; do echo "  $line"; done
fi
echo ""
```

### Step 5: Filter [IDLE-HANDS] and Enable Assistant Messages

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Two changes to the jq filter chain (line 116-136):
1. Add `| select(startswith("[IDLE-HANDS]") | not)` to the user message filter
2. Change `INCLUDE_ASSISTANT=false` default to `INCLUDE_ASSISTANT=true` (line 40)
3. Increase `MSG_TRUNCATE_CHARS=500` to `MSG_TRUNCATE_CHARS=2000` (line 38)

### Step 6: Add LLM Narrative Summarization (Tier 2)

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Add new configuration variables:
```bash
LLM_SUMMARIZE=true           # Enable local LLM narrative pass
LLM_ENDPOINT="http://localhost:4000/v1/chat/completions"
LLM_MODEL="qwen3-8b-nothink"
LLM_TIMEOUT=15               # Max seconds for LLM call
LLM_MAX_TOKENS=800           # Output cap
```

After writing the Tier 1 output to `$OUTPUT`, attempt the LLM pass:
```bash
if [[ "$LLM_SUMMARIZE" == "true" ]]; then
    TIER1_CONTENT=$(cat "$OUTPUT")

    # Check LiteLLM availability (fast health check)
    if curl -sf --max-time 2 "$LLM_ENDPOINT" >/dev/null 2>&1 || \
       curl -sf --max-time 2 "http://localhost:4000/health" >/dev/null 2>&1; then

        SYSTEM_PROMPT="You are Jarvis's context preservation system. Given raw session data, produce a structured checkpoint for resuming work after context is cleared. Include these sections:
1. **Current Task**: What is Jarvis working on? Be specific about the project and immediate goal.
2. **Progress**: Numbered steps — what's done (DONE) vs remaining (TODO/IN PROGRESS).
3. **Critical Context**: Protocols, configurations, bug fixes, or discoveries that must not be lost. Include exact commands, code, credentials where relevant.
4. **Key Paths**: Important files and directories for the current work.
5. **Next Step**: The exact next action to take — ideally a runnable command.
6. **Resume Instructions**: Specific guidance for picking up where we left off.
Be thorough but concise. Preserve exact file paths, commands, and technical details."

        # Build payload — escape the content for JSON embedding
        ESCAPED_CONTENT=$(echo "$TIER1_CONTENT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
        ESCAPED_SYSTEM=$(echo "$SYSTEM_PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

        LLM_RESPONSE=$(curl -sf --max-time "$LLM_TIMEOUT" \
            "$LLM_ENDPOINT" \
            -H "Content-Type: application/json" \
            -d "{\"model\":\"$LLM_MODEL\",\"messages\":[
                {\"role\":\"system\",\"content\":$ESCAPED_SYSTEM},
                {\"role\":\"user\",\"content\":$ESCAPED_CONTENT}
            ],\"stream\":false,\"max_tokens\":$LLM_MAX_TOKENS}" 2>/dev/null)

        if [[ -n "$LLM_RESPONSE" ]]; then
            NARRATIVE=$(echo "$LLM_RESPONSE" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r['choices'][0]['message']['content'])
except: pass" 2>/dev/null)

            if [[ -n "$NARRATIVE" ]] && [[ ${#NARRATIVE} -gt 100 ]]; then
                # Prepend LLM narrative, keep Tier 1 as raw appendix
                {
                    echo "# JICM v7 Context Checkpoint"
                    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
                    echo "Method: LLM-enriched (qwen3-8b-nothink)"
                    echo ""
                    echo "$NARRATIVE"
                    echo ""
                    echo "---"
                    echo ""
                    echo "## Raw Session Data (Tier 1 extraction)"
                    echo ""
                    echo "$TIER1_CONTENT" | tail -n +3  # Skip duplicate header
                } > "$OUTPUT"
                echo "LLM enrichment applied ($(echo "$NARRATIVE" | wc -l | tr -d ' ') lines)" >&2
            else
                echo "LLM response too short or empty — keeping Tier 1 output" >&2
            fi
        else
            echo "LLM call failed — keeping Tier 1 output" >&2
        fi
    else
        echo "LiteLLM unavailable — keeping Tier 1 output" >&2
    fi
fi
```

### Step 7: Skip Post-Clear Idle Checkpoints

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher.sh` (in `do_idle_checkpoint()`)

If the most recent JSONL has <5 genuine user messages, skip the idle checkpoint — there's nothing new to capture:
```bash
# Quick check: does the current JSONL have real content?
local msg_count
msg_count=$(tail -1000 "$BEST_JSONL" | jq -c 'select(.type == "user") | ...' | wc -l)
if [[ $msg_count -lt 3 ]]; then
    log INFO "Idle checkpoint skipped — session too fresh (${msg_count} messages)"
    return 0
fi
```

## Files Modified

| File | Change |
|------|--------|
| `.claude/scripts/jicm-prep-context.sh` | All 6 extraction improvements + LLM pass |
| `.claude/scripts/jicm-watcher.sh` | Skip post-clear idle checkpoints |

## Verification

1. **Tier 1 only**: Set `LLM_SUMMARIZE=false` in `.prep-override`, trigger idle checkpoint, verify output has git state, session priorities, todos, assistant messages
2. **Tier 2**: Set `LLM_SUMMARIZE=true` (default), trigger idle checkpoint, verify LLM narrative is prepended with structured sections
3. **Fallback**: Stop LiteLLM (`kill` the process), trigger checkpoint, verify graceful fallback to Tier 1
4. **JSONL selection**: After a /clear, verify the script picks the previous session's JSONL (with real messages) instead of the new empty one
5. **Timing**: Measure total prep time — target <6s with LLM, <1s without
6. **Compare**: Run checkpoint, compare output quality to the manual `manual-checkpoint-20260220-152500.md`

## Design Decisions

- **LLM default ON**: The 2-5s cost is acceptable for idle checkpoints (30s interval) and pre-/clear. Quality improvement is dramatic.
- **qwen3-8b-nothink**: Best balance of speed (~2s) and quality. The `-nothink` variant is essential — with thinking enabled, Qwen3 burns all tokens on internal COT.
- **Tier 1 preserved as appendix**: The raw extraction stays in the output as a fallback reference, even when LLM enriches. This ensures no data is lost.
- **python3 for JSON escaping**: Bash JSON escaping is brittle. python3 is always available on macOS and handles unicode/newlines correctly.
- **15s timeout**: Generous but bounded. If the LLM is under heavy load, we fall back gracefully.
- **No `.active-tasks.txt` writer**: Instead of adding a hook to write this file, we extract TodoWrite state directly from JSONL. This follows the computed-state pattern (derive from source data, don't maintain separate state).
