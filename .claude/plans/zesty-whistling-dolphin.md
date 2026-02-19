# Plan: Idle-Hands System — Ennoia-Managed Autonomous Maintenance

## Context

When Claude finishes a turn and the user doesn't type anything for 15 minutes, Jarvis currently just sits idle. The user wants an "idle-hands" system where Jarvis autonomously:
1. Resumes interrupted work (ESC idle case)
2. Runs a maintenance cycle: commit changes -> /maintenance -> /reflect -> repeat (natural idle case)

This system should be managed by Ennoia (the session orchestrator in W2) and must dynamically target the correct tmux window (W0 vs W5). The exit-guard's `/exit` interception and ceremony remain unchanged.

## Architecture

```
                       ENNOIA (brain, W2)
                    ┌──────────────────────┐
                    │ detect_window_idle()  │  ← .last-prompt-ts.W0, .last-prompt-ts.W5
                    │ evaluate_priority()   │  ← maintenance queue, active tasks
                    │ inject_prompt()       │  → tmux send-keys to target window
                    └──────┬───────────────┘
                           │ writes .idle-hands-active.W{n}
                           │ (first injection only)
                           ▼
              ┌────────────────────────────┐
              │   STOP HOOK (actuator)     │  ← .idle-hands-active.W{n}
              │   idle-hands-hook.sh       │  reads next phase, blocks with prompt
              │   fires on every turn end  │  chains phases: commit → maint → reflect
              └────────────────────────────┘
                           │
                           │ cleared by
                           ▼
              ┌────────────────────────────┐
              │  UserPromptSubmit hook      │  user types → clears .idle-hands-active.W{n}
              │  (user is back)             │  → writes fresh .last-prompt-ts.W{n}
              └────────────────────────────┘
```

**Key insight**: Ennoia handles the 15-minute detection + first injection. The Stop hook handles immediate phase chaining (no 15-min wait between phases). User typing at any point cancels everything.

## Changes

### 1. Launcher: Add JARVIS_WINDOW env var per window

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/launch-jarvis-tmux.sh`

**Line 200** — Add `JARVIS_WINDOW=0` to W0's CLAUDE_ENV:
```bash
CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0"
```

**Line 294** — Add `JARVIS_WINDOW=5` to W5's CLAUDE_ENV_DEV:
```bash
CLAUDE_ENV_DEV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 JARVIS_SESSION_ROLE=dev JARVIS_WINDOW=5"
```

### 2. UserPromptSubmit hook: Window-aware heartbeat + cancel idle-hands

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/settings.json` (line 102)

Replace the existing heartbeat command:
```json
"command": "W=${JARVIS_WINDOW:-0}; date +%s > $CLAUDE_PROJECT_DIR/.claude/context/.last-prompt-ts.W${W} && rm -f $CLAUDE_PROJECT_DIR/.claude/context/.idle-hands-active.W${W}"
```

This does two things atomically:
- Writes the heartbeat timestamp (per-window)
- Cancels any active idle-hands cycle (user is back)

### 3. Ennoia v0.3: Idle scheduler + tmux injection

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/ennoia.sh`

Add these new functions and modify the main loop:

#### 3a. `detect_window_idle(window_index)` — Per-window idle detection

```bash
# Returns: "active", "idle_natural", "idle_esc", or "idle_hands_running"
detect_window_idle() {
    local win="$1"
    local ts_file="$PROJECT_DIR/.claude/context/.last-prompt-ts.W${win}"
    local ih_file="$PROJECT_DIR/.claude/context/.idle-hands-active.W${win}"

    # Already running idle-hands → skip
    [[ -f "$ih_file" ]] && echo "idle_hands_running" && return 0

    # Read heartbeat
    local last_ts now idle_secs
    last_ts=$(cat "$ts_file" 2>/dev/null || echo 0)
    now=$(date +%s)
    idle_secs=$(( now - last_ts ))

    # Under threshold → active
    [[ $idle_secs -lt $IDLE_THRESHOLD ]] && echo "active" && return 0

    # Over threshold → check tmux pane for idle type
    local pane_content
    pane_content=$("$TMUX_BIN" capture-pane -t "jarvis:${win}" -p 2>/dev/null | tail -10)

    # ESC idle: "Interrupted" banner visible
    if echo "$pane_content" | grep -q "Interrupted"; then
        echo "idle_esc"
    else
        echo "idle_natural"
    fi
}
```

#### 3b. `evaluate_priority()` — Maintenance priority queue

```bash
# Returns the next maintenance action to take
evaluate_priority() {
    local now maint_dir reflect_dir latest mtime days

    now=$(date +%s)
    reflect_dir="$PROJECT_DIR/.claude/reports/reflections"
    maint_dir="$PROJECT_DIR/.claude/reports/maintenance"

    # Priority 1: Uncommitted changes → commit
    local changes
    changes=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
    [[ -n "$changes" ]] && echo "commit" && return 0

    # Priority 2: /reflect (if last run > 1 day)
    if [[ -d "$reflect_dir" ]]; then
        latest=$(ls -t "$reflect_dir"/*.md 2>/dev/null | head -1)
        if [[ -n "$latest" ]]; then
            mtime=$(stat -f %m "$latest")
            days=$(( (now - mtime) / 86400 ))
            [[ $days -ge 1 ]] && echo "reflect" && return 0
        else
            echo "reflect" && return 0  # never reflected
        fi
    else
        echo "reflect" && return 0
    fi

    # Priority 3: /maintain (if last run > 7 days)
    if [[ -d "$maint_dir" ]]; then
        latest=$(ls -t "$maint_dir"/*.md 2>/dev/null | head -1)
        if [[ -n "$latest" ]]; then
            mtime=$(stat -f %m "$latest")
            days=$(( (now - mtime) / 86400 ))
            [[ $days -ge 7 ]] && echo "maintain" && return 0
        else
            echo "maintain" && return 0
        fi
    else
        echo "maintain" && return 0
    fi

    # All current → nothing to do
    echo "none"
}
```

#### 3c. `inject_idle_hands(window_index, idle_type)` — Activate idle-hands

```bash
inject_idle_hands() {
    local win="$1" idle_type="$2"
    local ih_file="$PROJECT_DIR/.claude/context/.idle-hands-active.W${win}"

    if [[ "$idle_type" == "idle_esc" ]]; then
        # ESC idle: resume interrupted work
        cat > "$ih_file" <<EOF
activated: $(date +%s)
window: $win
type: resume
phase: resume
cycle: 1
EOF
        # Inject resume prompt
        "$TMUX_BIN" send-keys -t "jarvis:${win}" "" 2>/dev/null  # dismiss "Interrupted" banner
        sleep 1
        "$TMUX_BIN" send-keys -t "jarvis:${win}" "Continue the work you were doing before the interruption. Pick up where you left off." 2>/dev/null
        sleep 0.5
        "$TMUX_BIN" send-keys -t "jarvis:${win}" C-m 2>/dev/null
    else
        # Natural idle: start maintenance cycle
        local action
        action=$(evaluate_priority)
        [[ "$action" == "none" ]] && return 0  # nothing to do

        cat > "$ih_file" <<EOF
activated: $(date +%s)
window: $win
type: maintenance
phase: $action
cycle: 1
EOF
        # Inject first maintenance action
        local prompt
        case "$action" in
            commit)  prompt="[IDLE-HANDS] Review and commit any uncommitted changes. Use descriptive commit messages." ;;
            reflect) prompt="[IDLE-HANDS] Run /reflect — perform a self-reflection cycle." ;;
            maintain) prompt="[IDLE-HANDS] Run /maintain — perform a maintenance check." ;;
        esac
        "$TMUX_BIN" send-keys -t "jarvis:${win}" "$prompt" 2>/dev/null
        sleep 0.5
        "$TMUX_BIN" send-keys -t "jarvis:${win}" C-m 2>/dev/null
    fi
}
```

#### 3d. Modify main loop

Add idle-hands check after `render()`:
```bash
# Check idle-hands for each Claude window
for win in 0 5; do
    # Only check if the window exists and has a Claude process
    if "$TMUX_BIN" list-windows -t jarvis 2>/dev/null | grep -q "^${win}:"; then
        local state
        state=$(detect_window_idle "$win")
        case "$state" in
            idle_esc|idle_natural)
                inject_idle_hands "$win" "$state"
                ;;
        esac
    fi
done
```

#### 3e. New constants at top of file

```bash
TMUX_BIN="${TMUX_BIN:-/Users/nathanielcannon/bin/tmux}"
IDLE_THRESHOLD="${IDLE_THRESHOLD:-900}"  # 15 minutes in seconds
```

### 4. Stop Hook: Idle-hands phase continuation

**New file**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/idle-hands-hook.sh`

This hook fires on every turn end. If an idle-hands cycle is active for this window, it reads the current phase, advances to the next phase, and blocks the stop to inject the next prompt. If the cycle is complete (all maintenance done), it cleans up.

```bash
#!/bin/bash
# Idle-Hands Phase Continuation Hook (Stop hook)
# When an idle-hands maintenance cycle is running, chains phases:
#   commit → reflect → maintain → (re-evaluate or stop)
set +e

HOOK_INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
WINDOW="${JARVIS_WINDOW:-0}"
IH_FILE="$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}"
LOG="$PROJECT_DIR/.claude/logs/idle-hands-debug.log"

# No idle-hands cycle → pass through
[[ ! -f "$IH_FILE" ]] && exit 0

# Read current phase
CURRENT_PHASE=$(awk '/^phase:/{print $2}' "$IH_FILE" 2>/dev/null)
CURRENT_TYPE=$(awk '/^type:/{print $2}' "$IH_FILE" 2>/dev/null)
CURRENT_CYCLE=$(awk '/^cycle:/{print $2}' "$IH_FILE" 2>/dev/null)

# "resume" type: after resuming interrupted work, check if more to do
# If Claude naturally finished, evaluate maintenance queue
if [[ "$CURRENT_TYPE" == "resume" ]]; then
    # Work resumed and completed — switch to maintenance if needed
    # (Ennoia will re-evaluate on next cycle if user stays idle)
    rm -f "$IH_FILE"
    exit 0
fi

# Maintenance type: advance to next phase
case "$CURRENT_PHASE" in
    commit)   NEXT_PHASE="reflect" ;;
    reflect)  NEXT_PHASE="maintain" ;;
    maintain)
        # Full cycle done — re-evaluate
        NEXT_CYCLE=$(( ${CURRENT_CYCLE:-1} + 1 ))
        # Cap at 3 cycles to prevent infinite loops
        if [[ $NEXT_CYCLE -gt 3 ]]; then
            rm -f "$IH_FILE"
            exit 0
        fi
        # Re-evaluate: anything else to do?
        CHANGES=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
        if [[ -n "$CHANGES" ]]; then
            NEXT_PHASE="commit"
        else
            NEXT_PHASE="reflect"
        fi
        # Update cycle counter
        sed -i '' "s/^cycle: .*/cycle: $NEXT_CYCLE/" "$IH_FILE" 2>/dev/null
        ;;
    *)
        # Unknown phase → clean up
        rm -f "$IH_FILE"
        exit 0
        ;;
esac

# Update phase
sed -i '' "s/^phase: .*/phase: $NEXT_PHASE/" "$IH_FILE" 2>/dev/null

# Build next prompt
case "$NEXT_PHASE" in
    commit)  PROMPT="[IDLE-HANDS] Review and commit any uncommitted changes." ;;
    reflect) PROMPT="[IDLE-HANDS] Run /reflect — perform a self-reflection cycle." ;;
    maintain) PROMPT="[IDLE-HANDS] Run /maintain — perform a maintenance check." ;;
esac

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | phase=$CURRENT_PHASE→$NEXT_PHASE cycle=${CURRENT_CYCLE:-1}" >> "$LOG" 2>/dev/null

# Block and inject next phase
jq -n --arg prompt "$PROMPT" '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": "Idle-hands maintenance cycle in progress. User can interrupt at any time."
}'
exit 0
```

### 5. Register new Stop hook

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/settings.json`

Add `idle-hands-hook.sh` as the THIRD Stop hook (after Ralph, after exit-guard):
```json
"Stop": [
    { ... stop-hook.sh (Ralph) ... },
    { ... exit-guard.sh ... },
    {
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/idle-hands-hook.sh"
        }]
    }
]
```

Order matters: Ralph takes priority (it's user-initiated), then exit-guard (safety), then idle-hands (lowest priority).

### 6. Exit-guard: Add idle-hands bypass

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/exit-guard.sh`

Add after Layer 3c (Ralph bypass), before 3d:
```bash
# 3c-bis. Idle-hands cycle active → idle-hands-hook.sh handles continuation
WINDOW="${JARVIS_WINDOW:-0}"
if [[ -f "$PROJECT_DIR/.claude/context/.idle-hands-active.W${WINDOW}" ]]; then
    rm -f "$CEREMONY_DONE" 2>/dev/null
    exit 0
fi
```

### 7. Signal file cleanup

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/session-start.sh`

Add to the cleanup section (where `.exit-ceremony-done` is cleaned):
```bash
# Clean up stale idle-hands state from previous sessions
rm -f "$PROJECT_DIR/.claude/context/.idle-hands-active.W"* 2>/dev/null
```

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/.gitignore`

Add:
```
.idle-hands-active.*
.last-prompt-ts.*
```

## Execution Order on Turn End

```
Claude finishes turn → Stop hooks fire in order:

1. stop-hook.sh (Ralph Loop)
   - Ralph active? → block + re-feed prompt → DONE
   - Not active? → exit 0 → next hook

2. exit-guard.sh
   - /exit detected? → ceremony menu → DONE
   - JICM active? → pass through → next hook
   - Ralph active? → pass through → next hook
   - Idle-hands active? → pass through → next hook   ← NEW
   - Not /exit? → exit 0 → next hook

3. idle-hands-hook.sh                                  ← NEW
   - .idle-hands-active.W{n} exists? → advance phase → block → DONE
   - Not active? → exit 0 → Claude goes idle
   - (Ennoia will inject after 15 min if user stays away)
```

## Migration of Existing Heartbeat

The old `.last-prompt-ts` (no window suffix) needs backward compatibility during transition:
- Ennoia: check both `.last-prompt-ts.W0` and legacy `.last-prompt-ts`, use whichever is newer
- After one full session cycle, the legacy file stops being written

## Verification

1. **Unit test: heartbeat per-window** — Send prompt in W0, verify `.last-prompt-ts.W0` is written, `.idle-hands-active.W0` is cleared
2. **Integration test: idle detection** — Set `IDLE_THRESHOLD=30` (30s for testing), verify Ennoia detects idle after 30s of no input
3. **Integration test: maintenance cycle** — Trigger idle → verify commit phase → reflect phase → maintain phase chain
4. **Integration test: user interruption** — Start idle-hands cycle → type in W0 → verify `.idle-hands-active.W0` is removed and cycle stops
5. **Integration test: ESC resume** — Press ESC in W0 → wait for threshold → verify Ennoia sends resume prompt
6. **Integration test: exit-guard unchanged** — Type `/exit` → verify ceremony still works
7. **Regression test: Ralph Loop** — Start `/ralph-loop` → verify Ralph still works (has priority over idle-hands)

## Files Touched

| File | Action |
|------|--------|
| `.claude/scripts/ennoia.sh` | Modify (v0.3 upgrade: idle scheduler + injection) |
| `.claude/scripts/launch-jarvis-tmux.sh` | Modify (add JARVIS_WINDOW env per window) |
| `.claude/hooks/idle-hands-hook.sh` | **Create** (Stop hook for phase continuation) |
| `.claude/hooks/exit-guard.sh` | Modify (add idle-hands bypass) |
| `.claude/hooks/session-start.sh` | Modify (cleanup stale idle-hands signals) |
| `.claude/settings.json` | Modify (register new hook, update heartbeat command) |
| `.claude/.gitignore` | Modify (add idle-hands signal patterns) |
