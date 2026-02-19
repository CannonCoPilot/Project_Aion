#!/usr/bin/env bash
# ennoia.sh — Session Orchestrator Aion Script v0.3
# Runs in tmux jarvis:2, 30s refresh cycle
# Writes: .ennoia-status (dashboard state), .ennoia-recommendation (Watcher handoff)
#
# Design: .claude/plans/ennoia-aion-script-design.md (27 iterations)
# Architecture: Ennoia = intent layer (what should I do?)
#   - Watcher = defensive awareness (am I safe?)
#   - Virgil = navigational awareness (what am I looking at?)
#   - Ennoia = intentional awareness (what should I do next?)
#
# v0.1: Dashboard only (display). No scheduler, no auto-actions.
# v0.2: Writes .ennoia-recommendation signal file for Watcher consumption.
#        Watcher reads recommendation for wake-up prompt text (graceful fallback).
# v0.3: Idle-hands scheduler — detects per-window idle, injects maintenance prompts
#        via tmux send-keys. Stop hook chains phases (commit → reflect → maintain).

# NEVER use set -euo pipefail — grep pipeline failures cause silent crashes
set +e

PROJECT_DIR="${JARVIS_PROJECT_DIR:-/Users/nathanielcannon/Claude/Jarvis}"
TMUX_BIN="${TMUX_BIN:-/Users/nathanielcannon/bin/tmux}"
IDLE_THRESHOLD="${IDLE_THRESHOLD:-900}"  # 15 minutes in seconds
SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"
PRIORITIES="$PROJECT_DIR/.claude/context/current-priorities.md"
WATCHER_STATUS="$PROJECT_DIR/.claude/context/.jicm-state"
ENNOIA_STATE="$PROJECT_DIR/.claude/context/.ennoia-state"
ENNOIA_STATUS="$PROJECT_DIR/.claude/context/.ennoia-status"
ENNOIA_RECOMMENDATION="$PROJECT_DIR/.claude/context/.ennoia-recommendation"
ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"
LOG="$PROJECT_DIR/.claude/logs/ennoia-debug.log"
REFRESH=30

# --- Color Constants (ANSI-C quoting for reliable escape sequences) ---
C_RESET=$'\e[0m'
C_BOLD=$'\e[1m'
C_DIM=$'\e[2m'
C_GREEN=$'\e[32m'
C_YELLOW=$'\e[33m'
C_MAGENTA=$'\e[35m'

# Trap for clean exit
trap 'echo "Ennoia: shutting down."; exit 0' SIGTERM SIGINT

# Initialize state if first run
init_state() {
    if [[ ! -f "$ENNOIA_STATE" ]]; then
        cat > "$ENNOIA_STATE" <<EOF
version: 1
session_count: 1
last_session_end: null
maintenance:
  last_reflect: null
  last_maintain: null
  last_evolve: null
  last_research: null
EOF
    fi
}

# Paths for compressed context detection (Tier 2: Ennoia reads JICM artifacts)
COMPRESSED_CONTEXT="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
INPROGRESS_CONTEXT="$PROJECT_DIR/.claude/context/.in-progress-ready.md"

# Determine mode: arise, attend, idle, or resume
detect_mode() {
    local watcher_state
    watcher_state=$(awk '/^state:/{print $2}' "$WATCHER_STATUS" 2>/dev/null)

    # If watcher just cleared → resume mode (brief)
    if [[ "$watcher_state" == "cleared" ]]; then
        echo "resume"
        return 0
    fi

    # If compressed context files exist → also resume mode
    # (stronger signal than watcher state — files survive watcher restarts)
    if [[ -f "$COMPRESSED_CONTEXT" ]] || [[ -f "$INPROGRESS_CONTEXT" ]]; then
        echo "resume"
        return 0
    fi

    # Check if session just started (uptime < 2 min)
    local start_time now uptime_secs
    start_time=$(stat -f %m "$ENNOIA_STATUS" 2>/dev/null || echo 0)
    now=$(date +%s)
    uptime_secs=$(( now - start_time ))
    if [[ $uptime_secs -lt 120 ]]; then
        echo "arise"
        return 0
    fi

    # Check idle (no file-access.json updates for 5+ min)
    local fa_mtime idle_seconds
    fa_mtime=$(stat -f %m "$PROJECT_DIR/.claude/logs/file-access.json" 2>/dev/null || echo 0)
    idle_seconds=$(( now - fa_mtime ))
    if [[ $idle_seconds -gt 300 ]]; then
        echo "idle"
        return 0
    fi

    echo "attend"
    return 0
}

# Get session intent from session-state.md
get_intent() {
    grep '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null | head -1 | sed 's/\*\*Status\*\*:[[:space:]]*//'
}

# Get current work description from session-state.md (for recommendations)
# Strips markdown bold, emoji, leading whitespace. Truncates to 80 chars.
get_current_work() {
    local status_line
    status_line=$(grep -m1 '^\*\*Status\*\*' "$SESSION_STATE" 2>/dev/null \
        | sed 's/\*\*Status\*\*:[[:space:]]*//' \
        | LC_ALL=C sed 's/[^[:print:][:space:]]//g' \
        | sed 's/^[[:space:]]*//' || echo "")
    if [[ -n "$status_line" ]]; then
        echo "${status_line:0:80}"
    else
        echo "unknown"
    fi
    return 0
}

# Get next priority from current-priorities.md
# Looks for **Next**: lines or first ### heading under ## Up Next
get_next_priority() {
    local next_line
    # Try explicit **Next**: field first
    next_line=$(grep -m1 '\*\*Next\*\*' "$PRIORITIES" 2>/dev/null \
        | sed 's/.*\*\*Next\*\*:[[:space:]]*//' \
        | sed 's/\*\*//g' || echo "")
    if [[ -n "$next_line" ]]; then
        echo "${next_line:0:60}"
        return 0
    fi
    # Fallback: first ### under ## Up Next
    next_line=$(awk '/^## Up Next/{found=1; next} found && /^### /{print; exit}' "$PRIORITIES" 2>/dev/null \
        | sed 's/^### //' || echo "")
    if [[ -n "$next_line" ]]; then
        echo "${next_line:0:60}"
        return 0
    fi
    echo ""
    return 0
}

# Get active plan title (if .active-plan pointer exists)
# Written by plan-tracker.js PostToolUse hook on ExitPlanMode
resolve_active_plan() {
    if [[ -f "$ACTIVE_PLAN" ]]; then
        local plan_path
        plan_path=$(tr -d '[:space:]' < "$ACTIVE_PLAN")
        if [[ -n "$plan_path" ]] && [[ -f "$plan_path" ]]; then
            # Extract plan title from first line (# Plan: ...)
            head -1 "$plan_path" | sed 's/^# Plan: //' | head -c 60
            return 0
        fi
    fi
    echo ""
    return 0
}

# Write .ennoia-recommendation signal file for Watcher consumption
# Atomic write: tmp file → mv (prevents Watcher reading partial content)
# Only writes for arise and resume modes (attend/idle = no recommendation)
write_recommendation() {
    local mode="$1"
    local recommendation=""

    case "$mode" in
        arise)
            local current_work next_priority active_plan plan_clause
            current_work=$(get_current_work)
            next_priority=$(get_next_priority)
            active_plan=$(resolve_active_plan)
            plan_clause=""
            [[ -n "$active_plan" ]] && plan_clause=" Active plan: ${active_plan}."
            if [[ -n "$next_priority" ]]; then
                recommendation="[SESSION-START] New session. Current: ${current_work}.${plan_clause} Next: ${next_priority}. Read .claude/context/session-state.md + .claude/context/current-priorities.md, begin work. Do NOT just greet."
            else
                recommendation="[SESSION-START] New session. Current: ${current_work}.${plan_clause} Read .claude/context/session-state.md + .claude/context/current-priorities.md, begin work. Do NOT just greet."
            fi
            ;;
        resume)
            # Tier 2: Read compressed context files for context-aware recommendation
            local work_hint="" files_hint=""
            if [[ -f "$COMPRESSED_CONTEXT" ]]; then
                # Extract first Status/Current Work line for task awareness
                work_hint=$(grep -m1 -E '(Status|Current Work|## Current|In Progress)' \
                    "$COMPRESSED_CONTEXT" 2>/dev/null \
                    | sed 's/^##* //' | sed 's/\*\*//g' | sed 's/^[[:space:]]*//' \
                    | head -c 80 || echo "")
                files_hint=".compressed-context-ready.md"
            fi
            if [[ -f "$INPROGRESS_CONTEXT" ]]; then
                [[ -n "$files_hint" ]] && files_hint="${files_hint}, " || true
                files_hint="${files_hint}.in-progress-ready.md"
            fi
            local task_clause=""
            [[ -n "$work_hint" ]] && task_clause=" Task: ${work_hint}."
            recommendation="[JICM-RESUME] Context compressed and cleared.${task_clause} Read ${files_hint:-.compressed-context-ready.md}, and session-state.md — resume work immediately. Do NOT greet."
            ;;
        attend|idle)
            # No recommendation for attend (working) or idle (Phase J scope)
            return 0
            ;;
    esac

    if [[ -n "$recommendation" ]]; then
        # Atomic write: write to tmp, then mv
        echo "$recommendation" > "${ENNOIA_RECOMMENDATION}.tmp"
        mv "${ENNOIA_RECOMMENDATION}.tmp" "$ENNOIA_RECOMMENDATION"
    fi

    return 0
}

# ============== IDLE-HANDS SCHEDULER (v0.3) ==============

# Per-window idle detection
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
    pane_content=$("$TMUX_BIN" capture-pane -t "jarvis:${win}" -p 2>/dev/null | tail -15)

    # Guard: dialog modal open (AskUserQuestion) → not injectable
    if echo "$pane_content" | grep -q "Enter to select"; then
        echo "active"  # treat as active — can't inject into a dialog
        return 0
    fi

    # Guard: no Claude Code prompt visible → session not ready for input
    # The ❯ prompt indicates Claude Code is waiting for user input
    if ! echo "$pane_content" | grep -q "❯"; then
        echo "active"  # no prompt visible — Claude may be processing
        return 0
    fi

    # ESC idle: "Interrupted" banner visible
    if echo "$pane_content" | grep -q "Interrupted"; then
        echo "idle_esc"
    else
        echo "idle_natural"
    fi
}

# Maintenance priority queue — returns the next action to take
evaluate_priority() {
    local now reflect_dir maint_dir

    now=$(date +%s)
    reflect_dir="$PROJECT_DIR/.claude/reports/reflections"
    maint_dir="$PROJECT_DIR/.claude/reports/maintenance"

    # Priority 1: Uncommitted changes → commit
    local changes
    changes=$(cd "$PROJECT_DIR" && git status --porcelain 2>/dev/null | grep -v '^??' | head -1)
    [[ -n "$changes" ]] && echo "commit" && return 0

    # Priority 2: /reflect (if last run > 1 day)
    if [[ -d "$reflect_dir" ]]; then
        local latest mtime days
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
        local latest mtime days
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

# Activate idle-hands for a window
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
        # Dismiss "Interrupted" banner then inject resume prompt
        "$TMUX_BIN" send-keys -t "jarvis:${win}" "" 2>/dev/null
        sleep 1
        "$TMUX_BIN" send-keys -t "jarvis:${win}" -l "Continue the work you were doing before the interruption. Pick up where you left off." 2>/dev/null
        sleep 0.5
        "$TMUX_BIN" send-keys -t "jarvis:${win}" C-m 2>/dev/null
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | idle-hands: injected resume into W${win}" >> "$LOG" 2>/dev/null
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
        "$TMUX_BIN" send-keys -t "jarvis:${win}" -l "$prompt" 2>/dev/null
        sleep 0.5
        "$TMUX_BIN" send-keys -t "jarvis:${win}" C-m 2>/dev/null
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | idle-hands: injected $action into W${win}" >> "$LOG" 2>/dev/null
    fi
}

# Check idle-hands for all Claude windows
check_idle_hands() {
    for win in 0 5; do
        # Only check if the window exists
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
}

# Get maintenance status from report directories
get_maintenance_status() {
    local reflect_log="$PROJECT_DIR/.claude/reports/reflections"
    local maintain_log="$PROJECT_DIR/.claude/reports/maintenance"

    local now reflect_age maintain_age
    now=$(date +%s)
    reflect_age="never"
    maintain_age="never"

    if [[ -d "$reflect_log" ]]; then
        local latest
        latest=$(ls -t "$reflect_log"/*.md 2>/dev/null | head -1)
        if [[ -n "$latest" ]]; then
            local mtime days
            mtime=$(stat -f %m "$latest")
            days=$(( (now - mtime) / 86400 ))
            reflect_age="${days}d ago"
        fi
    fi

    if [[ -d "$maintain_log" ]]; then
        local latest
        latest=$(ls -t "$maintain_log"/*.md 2>/dev/null | head -1)
        if [[ -n "$latest" ]]; then
            local mtime days
            mtime=$(stat -f %m "$latest")
            days=$(( (now - mtime) / 86400 ))
            maintain_age="${days}d ago"
        fi
    fi

    echo "reflect:$reflect_age maintain:$maintain_age"
}

# Render dashboard
render() {
    local mode
    mode=$(detect_mode)
    local cols
    cols=$(tput cols 2>/dev/null || echo 55)

    tput cup 0 0 2>/dev/null
    tput ed 2>/dev/null

    # Header
    printf "${C_BOLD}${C_MAGENTA} ENNOIA${C_RESET} — Session Orchestrator"
    printf '%*s\n' $((cols - 35)) "$(date '+%H:%M %Z')"
    printf '%.0s─' $(seq 1 "$cols"); echo

    case "$mode" in
        arise)
            echo; echo "${C_BOLD}  SESSION INTENT${C_RESET}"
            echo "  → $(get_intent)"
            local plan_title
            plan_title=$(resolve_active_plan)
            [[ -n "$plan_title" ]] && echo "  → Plan: $plan_title"
            local unpushed
            unpushed=$(git -C "$PROJECT_DIR" log --oneline origin/Project_Aion..HEAD 2>/dev/null | wc -l | tr -d ' ')
            [[ $unpushed -gt 0 ]] && echo "  → $unpushed commits unpushed"
            local branch
            branch=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)
            echo "  → Branch: ${branch:-unknown}"

            echo; echo "${C_BOLD}  MAINTENANCE QUEUE${C_RESET}"
            local maint
            maint=$(get_maintenance_status)
            echo "  ▪ /reflect — last: $(echo "$maint" | grep -o 'reflect:[^ ]*' | cut -d: -f2)"
            echo "  ▪ /maintain — last: $(echo "$maint" | grep -o 'maintain:[^ ]*' | cut -d: -f2)"
            ;;

        attend)
            echo; echo "  CURRENT: $(get_intent)"
            local pct
            pct=$(awk '/^context_pct:/{print $2}' "$WATCHER_STATUS" 2>/dev/null)
            echo "  Context: ${pct:-?}"
            ;;

        idle)
            echo; echo "${C_YELLOW}  IDLE${C_RESET} — Evaluating maintenance queue..."
            local maint
            maint=$(get_maintenance_status)
            echo "  ▪ /reflect — last: $(echo "$maint" | grep -o 'reflect:[^ ]*' | cut -d: -f2)"
            echo "  ▪ /maintain — last: $(echo "$maint" | grep -o 'maintain:[^ ]*' | cut -d: -f2)"
            # Show idle-hands status per window
            for win in 0 5; do
                local ih_file="$PROJECT_DIR/.claude/context/.idle-hands-active.W${win}"
                if [[ -f "$ih_file" ]]; then
                    local ih_phase
                    ih_phase=$(awk '/^phase:/{print $2}' "$ih_file" 2>/dev/null)
                    echo "  ${C_GREEN}▶ W${win}: idle-hands active (phase: ${ih_phase:-?})${C_RESET}"
                fi
            done
            ;;

        resume)
            echo; echo "  Resuming after context compression..."
            echo "  Reading compressed context..."
            ;;
    esac

    # Write recommendation signal file for Watcher
    write_recommendation "$mode"

    # Idle-hands scheduler: check each Claude window for idle state
    check_idle_hands

    # Footer
    printf '\n%.0s─' $(seq 1 "$cols"); echo
    local tokens pct rec_indicator
    tokens=$(awk '/^context_tokens:/{print $2}' "$WATCHER_STATUS" 2>/dev/null)
    pct=$(awk '/^context_pct:/{print $2}' "$WATCHER_STATUS" 2>/dev/null)
    rec_indicator=""
    [[ -f "$ENNOIA_RECOMMENDATION" ]] && rec_indicator=" | REC: ready"
    printf '  Mode: %s | Context: %s (%s)%s\n' "$mode" "${pct:-?}" "${tokens:-?}" "$rec_indicator"

    # Update status file
    local has_rec="false"
    [[ -f "$ENNOIA_RECOMMENDATION" ]] && has_rec="true"
    # Idle-hands state per window
    local ih_w0="inactive" ih_w5="inactive"
    [[ -f "$PROJECT_DIR/.claude/context/.idle-hands-active.W0" ]] && ih_w0="active"
    [[ -f "$PROJECT_DIR/.claude/context/.idle-hands-active.W5" ]] && ih_w5="active"
    cat > "$ENNOIA_STATUS" <<EOF
timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
version: 0.3
mode: $mode
intent: $(get_intent)
recommendation_active: $has_rec
idle_hands_w0: $ih_w0
idle_hands_w5: $ih_w5
EOF
}

# Main
init_state
while true; do
    render 2>/dev/null || true
    sleep "$REFRESH"
done
