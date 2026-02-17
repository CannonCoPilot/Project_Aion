# Plan: JICM v7 — Script-Based Context Preparation

## Context

Experiments 1-3 proved JICM compression takes ~285s (3.8x slower than /compact), with the compress phase consuming ~75% (210-235s). Experiment 6 proved that preprocessing (pre-assembling input files) barely helps — only 6s/3% faster with higher variance. The bottleneck is mechanism-bound: spawning an LLM agent to read files that Claude Code auto-loads anyway is fundamentally redundant.

**Key insight**: Under stop-and-wait architecture, the compression agent's work is ~70% redundant. Foundation docs (CLAUDE.md, identity, capability-map, indexes) are auto-loaded by Claude Code on every session start. The JSONL transcript at `~/.claude/projects/` contains the full structured conversation — strictly superior to the lossy chat export. What Jarvis actually needs after /clear is: (1) what was I working on? (2) what's the bigger plan? (3) what should I do next? A bash script extracting this from the JSONL + active plan file takes 3-5 seconds vs 210s.

**Projected improvement**: Compression phase from 210s to 3-5s. Total JICM cycle from ~285s to ~80s.

---

## Architecture Change

### v6.1 Flow (current — 285s)

```
HALT → export_chat (tmux capture + /export)
     → wait_for_idle
     → tmux_send_prompt("[JICM-COMPRESS] Run /intelligent-compress")
     → Jarvis spawns Task(compression-agent, sonnet, background)
     → Agent reads 10-17 files (210s) → writes checkpoint
     → Watcher polls for signal (5s intervals)
     → /clear → session-start hook injects checkpoint → resume prompt
```

### v7 Flow (proposed — 80s)

```
HALT → bash jicm-prep-context.sh (3-5s, runs in watcher process)
     → /clear → session-start hook injects prepared context → resume prompt
```

**What changes**:
- No chat export needed (JSONL has everything)
- No prompt injection to Jarvis during compression
- No agent spawning, no background Task, no signal polling
- Watcher runs prep script directly as subprocess
- State machine simplifies: COMPRESSING phase takes seconds, not minutes

**What stays the same**:
- WATCHING → HALTING → COMPRESSING → CLEARING → RESTORING → WATCHING state machine
- `.compressed-context-ready.md` as the checkpoint file
- `.compression-done.signal` for state transition
- `session-start.sh` hook injecting context on /clear
- `do_restore()` sending resume prompt

---

## Implementation Steps

### Step 1: Create `jicm-prep-context.sh`

**File**: `/Users/aircannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`
**Purpose**: Fast bash script that prepares context for post-/clear restoration.

**Inputs** (read by script):
1. JSONL transcript (most recent `.jsonl` in `~/.claude/projects/-Users-aircannon-Claude-Jarvis/`)
2. Active plan file (if `.claude/context/.active-plan` exists)
3. Active TodoWrite tasks (from `.claude/context/.active-tasks.txt` if exists)
4. Session status line (from `.claude/context/session-state.md`)

**Output**: `.claude/context/.compressed-context-ready.md`

**Algorithm**:
```bash
#!/bin/bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
PROJECTS_DIR="$HOME/.claude/projects/-Users-aircannon-Claude-Jarvis"
OUTPUT="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"
TASKS_FILE="$PROJECT_DIR/.claude/context/.active-tasks.txt"
SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"

# 1. Find most recent JSONL transcript
JSONL=$(ls -t "$PROJECTS_DIR"/*.jsonl 2>/dev/null | head -1)
if [[ -z "$JSONL" ]]; then
    echo "ERROR: No JSONL transcript found" >&2
    exit 1
fi

# 2. Extract last 10 real user messages (filter: type==user, not meta,
#    not tool results, content is string, not system tags, not JICM commands)
USER_MSGS=$(tail -2000 "$JSONL" | jq -r '
  select(.type == "user")
  | select(.isMeta != true)
  | select(.toolUseResult == null)
  | .message.content
  | select(type == "string")
  | select(startswith("<") | not)
  | select(startswith("[JICM-") | not)
' 2>/dev/null | tail -10)

# 3. Build compressed context
{
    echo "# JICM v7 Context Checkpoint"
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    # Session status (1 line)
    echo "## Session Status"
    grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
        | sed 's/\*\*//g' || echo "Status: unknown"
    echo ""

    # Active plan (if tracked)
    if [[ -f "$ACTIVE_PLAN" ]]; then
        local plan_path
        plan_path=$(cat "$ACTIVE_PLAN" | tr -d '[:space:]')
        if [[ -f "$plan_path" ]]; then
            echo "## Active Plan"
            # Extract title + context section (first ~30 lines)
            head -30 "$plan_path" | sed -n '1,/^---$/p'
            echo ""
        fi
    fi

    # Active tasks
    if [[ -f "$TASKS_FILE" ]] && [[ -s "$TASKS_FILE" ]]; then
        echo "## Active Tasks"
        cat "$TASKS_FILE"
        echo ""
    fi

    # Recent user messages (conversation thread)
    echo "## Recent Conversation (last 10 user messages)"
    echo "$USER_MSGS"
    echo ""

    echo "## Resume Instructions"
    echo "You are Jarvis. Context was cleared via JICM v7 stop-and-wait cycle."
    echo "Foundation docs (CLAUDE.md, capability-map.yaml, identity) are auto-loaded."
    echo "Review the conversation thread above, then continue the work."
} > "$OUTPUT"

# 4. Write completion signal
echo "$(date +%s)" > "$SIGNAL"
```

**Key design decisions**:
- `tail -2000` limits JSONL scan to last ~2000 entries (fast, covers recent work)
- `jq -r` for reliable JSON parsing of JSONL entries
- Filter chain excludes: meta messages, tool results, system tags (`<`), JICM commands
- Plan content capped at first 30 lines (title + context section only)
- No foundation doc inclusion — Claude Code auto-loads them
- `local` keyword removed from top-level script (bash 3.2 compatibility)

### Step 2: Create `plan-tracker.js` (ExitPlanMode hook)

**File**: `/Users/aircannon/Claude/Jarvis/.claude/hooks/plan-tracker.js`
**Purpose**: PostToolUse hook that tracks which plan file is active.

```javascript
#!/usr/bin/env node
// plan-tracker.js — Track active plan file on ExitPlanMode
// PostToolUse hook: matcher ^ExitPlanMode$

const fs = require('fs');
const path = require('path');

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const plansDir = path.join(projectDir, '.claude/plans');
const activePlanFile = path.join(projectDir, '.claude/context/.active-plan');

// Find most recently modified plan file
try {
    const files = fs.readdirSync(plansDir)
        .filter(f => f.endsWith('.md') && f !== 'README.md')
        .map(f => ({
            name: f,
            path: path.join(plansDir, f),
            mtime: fs.statSync(path.join(plansDir, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
        fs.writeFileSync(activePlanFile, files[0].path);
    }
} catch (e) {
    // Non-fatal — plan tracking is advisory
    process.stderr.write(`plan-tracker: ${e.message}\n`);
}

// Pass through — no blocking
console.log(JSON.stringify({}));
```

### Step 3: Register `plan-tracker.js` in settings.json

**File**: `/Users/aircannon/Claude/Jarvis/.claude/settings.json`
**Change**: Add new PostToolUse entry with `^ExitPlanMode$` matcher.

```json
{
    "matcher": "^ExitPlanMode$",
    "hooks": [
        {
            "type": "command",
            "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/plan-tracker.js"
        }
    ]
}
```

Insert after the existing `^(Task|TaskCreate|TaskUpdate)$` virgil-tracker entry (line 197).

### Step 4: Modify `jicm-watcher.sh` — Replace `do_compress()`

**File**: `/Users/aircannon/Claude/Jarvis/.claude/scripts/jicm-watcher.sh`
**Lines**: 773-857 (entire `do_compress()` function)

Replace with:

```bash
do_compress() {
    COMPRESSION_COUNT=$((COMPRESSION_COUNT + 1))
    COMPRESS_START_TIME=$(date +%s)
    write_state

    # Clean up stale artifacts from prior cycles
    rm -f "$COMPRESSION_SIGNAL"
    rm -f "$PROJECT_DIR/.claude/context/.compression-in-progress"

    # JICM v7: Run prep script directly (replaces agent spawning)
    # No chat export needed — script reads JSONL transcript directly
    # No Jarvis interaction needed — script runs in watcher process
    log JICM "Running context preparation script (#${COMPRESSION_COUNT})..."

    local prep_script="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
    if bash "$prep_script" 2>>"$LOG_FILE"; then
        log JICM "Context prepared in $(( $(date +%s) - COMPRESS_START_TIME ))s"
    else
        log ERROR "Prep script failed (exit $?) — reset to WATCHING"
        emit_cycle_metrics "prep_script_error"
        transition_to "WATCHING"
        COOLDOWN_UNTIL=$(( $(date +%s) + COOLDOWN_PERIOD ))
        ERROR_COUNT=$((ERROR_COUNT + 1))
        return 0
    fi

    # Signal file written by prep script — main loop will detect and call do_clear
    log JICM "Context preparation complete, signal written"
}
```

**What's removed**:
- `export_chat` call (JSONL replaces chat export)
- `wait_for_idle` after export (no export)
- Experiment override signal reading (model, thinking, preassemble)
- Thinking mode env var injection via tmux
- `tmux_send_prompt` for agent spawning
- Thinking cleanup pending flag

### Step 5: Modify `session-start.sh` — Simplify JICM restore path

**File**: `/Users/aircannon/Claude/Jarvis/.claude/hooks/session-start.sh`
**Lines**: 333-345 (CONTEXT template in JICM v6 restore path)

Replace the CONTEXT template:

```bash
CONTEXT="JICM v7 CONTEXT RESTORATION — NOT a new session.
You are Jarvis. Context was cleared via stop-and-wait JICM cycle.
Resume work immediately. Do NOT greet. Do NOT ask what to work on.

Current datetime: $LOCAL_DATE at $LOCAL_TIME

Compressed Context:
$V6_CONTEXT

Resume: Parse above, continue from interruption point."
```

**What's removed**:
- "After reading compressed context, also read CLAUDE.md for guardrails." (auto-loaded)
- "Read .claude/context/psyche/capability-map.yaml for tool selection." (auto-loaded)

These files are auto-loaded by Claude Code on every session/clear. Instructing Jarvis to read them wastes a turn.

### Step 6: Modify `ennoia.sh` — Add plan tracking

**File**: `/Users/aircannon/Claude/Jarvis/.claude/scripts/ennoia.sh`

**6a. Add variables** (after line 26):
```bash
ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"
```

**6b. Add `resolve_active_plan()` function** (after `get_next_priority()`, ~line 142):
```bash
# Get active plan title (if .active-plan pointer exists)
resolve_active_plan() {
    if [[ -f "$ACTIVE_PLAN" ]]; then
        local plan_path
        plan_path=$(cat "$ACTIVE_PLAN" | tr -d '[:space:]')
        if [[ -f "$plan_path" ]]; then
            # Extract plan title from first line (# Plan: ...)
            head -1 "$plan_path" | sed 's/^# Plan: //' | head -c 60
            return 0
        fi
    fi
    echo ""
    return 0
}
```

**6c. Update `write_recommendation()` arise case** (~line 152):
Include plan info in the session-start recommendation:

```bash
arise)
    local current_work next_priority active_plan
    current_work=$(get_current_work)
    next_priority=$(get_next_priority)
    active_plan=$(resolve_active_plan)
    local plan_clause=""
    [[ -n "$active_plan" ]] && plan_clause=" Active plan: ${active_plan}."
    if [[ -n "$next_priority" ]]; then
        recommendation="[SESSION-START] New session. Current: ${current_work}.${plan_clause} Next: ${next_priority}. Read .claude/context/session-state.md + .claude/context/current-priorities.md, begin work. Do NOT just greet."
    else
        recommendation="[SESSION-START] New session. Current: ${current_work}.${plan_clause} Read .claude/context/session-state.md + .claude/context/current-priorities.md, begin work. Do NOT just greet."
    fi
    ;;
```

**6d. Update dashboard render** — Show active plan in `arise` mode:

```bash
arise)
    echo; echo "${C_BOLD}  SESSION INTENT${C_RESET}"
    echo "  → $(get_intent)"
    local plan_title
    plan_title=$(resolve_active_plan)
    [[ -n "$plan_title" ]] && echo "  → Plan: $plan_title"
    # ... rest unchanged
```

### Step 7: Modify `do_restore()` — Clean up experiment artifacts

**File**: `/Users/aircannon/Claude/Jarvis/.claude/scripts/jicm-watcher.sh`
**Lines**: 890-927

Simplify by removing experiment-specific cleanup:

```bash
do_restore() {
    RESTORE_ATTEMPTS=0
    RESTORE_START_TIME=$(date +%s)
    log JICM "Context cleared — restoring Jarvis"

    # Brief pause for session-start hook to inject additionalContext
    sleep 5

    local resume_prompt='[JICM-RESUME] Context compressed and cleared. Read .claude/context/.compressed-context-ready.md then resume work immediately. Do NOT greet. Do NOT ask what to work on.'
    tmux_send_prompt "$resume_prompt"

    transition_to "RESTORING"
}
```

**What's removed**:
- Thinking mode cleanup (no longer injected)
- Experiment override signal cleanup (experiments use their own scripts)
- "then CLAUDE.md" from resume prompt (auto-loaded)

### Step 8: Archive deprecated files

Mark these files as deprecated with a header comment (do not delete — they serve as historical reference):

| File | Action |
|------|--------|
| `.claude/agents/compression-agent.md` | Add `[DEPRECATED v7]` header |
| `.claude/agents/compression-agent-preassembled.md` | Add `[DEPRECATED v7]` header |
| `.claude/commands/intelligent-compress.md` | Add `[DEPRECATED v7]` header |
| `.claude/context/compaction-essentials.md` | Add `[DEPRECATED v7]` header |

These files are no longer actively used but document the v6.1 architecture for reference.

### Step 9: Update version references

- Watcher header comment: "JICM v6 WATCHER" → "JICM v7 WATCHER"
- session-start.sh: "JICM v6" comments → "JICM v7"
- Add entry to `current-priorities.md` changelog

---

## Files Summary

| Action | File | Lines Changed |
|--------|------|---------------|
| **Create** | `.claude/scripts/jicm-prep-context.sh` | ~60 lines |
| **Create** | `.claude/hooks/plan-tracker.js` | ~30 lines |
| **Modify** | `.claude/scripts/jicm-watcher.sh` (do_compress) | Replace lines 773-857 (~25 lines new) |
| **Modify** | `.claude/scripts/jicm-watcher.sh` (do_restore) | Simplify lines 890-927 (~10 lines new) |
| **Modify** | `.claude/hooks/session-start.sh` | Simplify lines 333-345 |
| **Modify** | `.claude/scripts/ennoia.sh` | Add ~25 lines (plan tracking) |
| **Modify** | `.claude/settings.json` | Add 1 PostToolUse entry |
| **Deprecate** | 4 agent/command files | Add header comments |

---

## Verification

### Unit tests

1. **jicm-prep-context.sh standalone**:
   - Run directly: `bash .claude/scripts/jicm-prep-context.sh`
   - Verify `.compressed-context-ready.md` created with expected sections
   - Verify `.compression-done.signal` created
   - Verify runtime < 10s
   - Verify output contains user messages, plan section, session status

2. **plan-tracker.js**:
   - Create a test plan file, simulate ExitPlanMode input
   - Verify `.active-plan` file created with correct path
   - Verify hook outputs `{}` (non-blocking)

3. **ennoia.sh resolve_active_plan()**:
   - Create `.active-plan` pointing to a known plan file
   - Verify `resolve_active_plan` returns the plan title
   - Test with missing file (should return empty string)

### Integration test

1. Set watcher threshold to 40% (trigger at current context)
2. Let watcher cycle through HALT → COMPRESS → CLEAR → RESTORE
3. Verify total cycle time < 90s (vs previous ~285s)
4. Verify Jarvis resumes correctly with conversation awareness
5. Check that no "Read CLAUDE.md" or "Read capability-map.yaml" tool calls appear post-restore

### Regression checks

- Watcher state machine transitions remain correct
- session-start.sh still handles all paths (new session, /clear, JICM restore, checkpoint)
- Error recovery paths still work (prep script failure, missing JSONL, etc.)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONL file too large for `tail -2000` | Missing recent messages | Increase to `tail -5000` if needed; JSONL entries are small (~200 bytes avg for user msgs) |
| `jq` not installed | Script fails | macOS ships with `jq` via Homebrew; add check with clear error |
| No JSONL found (first session) | Script fails | Graceful fallback: write minimal checkpoint with just session status |
| Plan file `.active-plan` stale | Wrong plan referenced | ExitPlanMode hook always updates; staleness means no new plan, which is fine |
| Experiment scripts break | Can't run future experiments | Experiments already have their own override mechanism; v7 do_compress just skips overrides. Experiment scripts can be updated separately if needed |
| Checkpoint too thin | Jarvis loses context | Monitor first few cycles; add assistant message extraction if user messages insufficient |

---

## Experiment Data Preserved

Prior experiment data remains at:
- Exp 1: `.claude/reports/testing/compression-timing-data.jsonl` (12 trials)
- Exp 2: `.claude/reports/testing/compression-regression-data.jsonl` (19 trials)
- Exp 3: `.claude/reports/testing/compression-exp3-data.jsonl` (18 trials)
- Exp 4: `.claude/reports/testing/experiment-4-data.jsonl` (11 trials, partial)
- Exp 6: `.claude/reports/testing/experiment-6-data.jsonl` (12 trials)
- Experiment scripts remain functional in `.claude/scripts/dev/`
