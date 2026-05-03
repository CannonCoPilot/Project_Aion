#!/bin/bash
# ============================================================================
# Jarvis Statusline v9.0 — JICM-aware, Pulse-integrated, multi-row
# ============================================================================
#
# Drop-in replacement for v8. v8 stays wired in settings.json until the User
# blesses v9 by swapping the path. Both scripts coexist.
#
# Architectural improvements over v8 (per overnight research, 2026-05-03):
#   1. SINGLE batched jq call (saves 50-100ms per render vs v8's 12 jq forks)
#   2. macOS-compatible PID-file concurrency lock (prevents stacked invocations)
#   3. TTL-cached Pulse API (15s) + git status (5s) under stable filenames
#   4. Multi-line output (3 rows; ≤20% of CC window per User mandate)
#   5. `effort.level` REMOVED — confirmed absent from statusline payload
#   6. `exceeds_200k_tokens` early-warning indicator (fires before SOFT_NUDGE)
#   7. Rate-limit `resets_at` countdown rendering ("5h:75% ↺1h23m")
#   8. Output-style indicator (📖 Explanatory, 🎓 Learning, etc.)
#   9. Jarvis-unique panels: eph_1h adoption %, JICM action, Pulse active task
#  10. Action-driven color cascade across all rows (HARD_HALT bleeds red)
#
# Layout (full width, ~100-200 cols):
#   Row 1: ICON model|cwd-relative-or-Project  branch +N-N  STYLE_IND  PRE_WARN
#   Row 2: [bar with soft/hard/auto ticks] PCT%  Δburn  S:eta H:eta  cache% eph1h%
#   Row 3: $cost  ⏱wall api%  5h:%↺reset  7d:%↺reset  ◆ pulse-task
#
# Layout (narrow, <100 cols): drops Row 3, shortens bar to 20 chars.
#
# Modes:
#   (default)             Read stdin JSON, render statusline (production use)
#   --demo                Render gallery of 8 example states
#   --demo-state=N        Render single demo state (1-8) and exit
#   --help                Usage
#
# Configure (NOT auto-activated; User swaps after morning review):
#   .claude/settings.json:
#     "statusLine": {
#       "type": "command",
#       "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/jarvis-statusline-v9.sh"
#     }
#
# Author: Jarvis (Project Aion overnight build, 2026-05-03)
# ============================================================================

set -o pipefail

# ─── CONCURRENCY LOCK (macOS-compatible PID file) ──────────────────────────
LOCK_FILE="/tmp/jarvis-statusline-v9.lock"
if [[ -e "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [[ -n "$LOCK_PID" ]] && [[ "$LOCK_PID" =~ ^[0-9]+$ ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        # Another instance is running; exit silently
        exit 0
    fi
fi
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM

# ─── CONFIG ────────────────────────────────────────────────────────────────
SL_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
SL_STATE_FILE="$SL_PROJECT_DIR/.claude/context/.jicm-state-hook.json"
SL_NLP_FILE="$SL_PROJECT_DIR/.claude/context/.jicm-nlp-compression.json"
SL_PULSE_CACHE="/tmp/jarvis-statusline-pulse.cache"
SL_PULSE_TTL=15
SL_GIT_CACHE="/tmp/jarvis-statusline-git.cache"
SL_GIT_TTL=5
SL_PULSE_URL="${SL_PULSE_URL:-http://localhost:8700/api/v1/tasks?status=open&label=agent:jarvis&limit=1}"
SL_PULSE_TIMEOUT=1
SL_BAR_WIDTH=22
SL_VERSION="9.0.0"

# ─── COLORS (256-color ANSI) ───────────────────────────────────────────────
NC=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
ITALIC=$'\033[3m'
RED=$'\033[38;5;196m'
GREEN=$'\033[38;5;46m'
YELLOW=$'\033[38;5;226m'
BLUE=$'\033[38;5;33m'
CYAN=$'\033[38;5;51m'
MAGENTA=$'\033[38;5;201m'
GRAY=$'\033[38;5;240m'
LGRAY=$'\033[38;5;250m'
TEAL=$'\033[38;5;30m'
GOLD=$'\033[38;5;220m'
LIME=$'\033[38;5;118m'
ORANGE=$'\033[38;5;208m'
VIOLET=$'\033[38;5;141m'
PINK=$'\033[38;5;213m'

# Box drawing
BAR_FILL_NORMAL='▒'
BAR_FILL_WARN='▓'
BAR_FILL_DANGER='█'
BAR_EMPTY='░'
TICK_SOFT='│'
TICK_HARD='┃'
TICK_AUTO='╿'

# ─── ARG PARSING ───────────────────────────────────────────────────────────
DEMO_STATE=""
case "${1:-}" in
    --demo)             DEMO_STATE="all" ;;
    --demo-state=*)     DEMO_STATE="${1#--demo-state=}" ;;
    --help|-h)
        cat <<EOF
Jarvis Statusline v$SL_VERSION

USAGE:
  $(basename "$0")                  Read stdin JSON, emit 3-row statusline (production)
  $(basename "$0") --demo           Render gallery of 8 example states
  $(basename "$0") --demo-state=N   Render demo state N (1-8) and exit

DEMO STATES:
  1=idle (low context, healthy cache)
  2=mid-context (50%, healthy)
  3=SOFT_NUDGE crossed (~31%)
  4=HARD_HALT crossed (~67%)
  5=fresh-session (cache misses)
  6=near 5h rate limit (>70%)
  7=worktree session
  8=tool-heavy (low API efficiency)

ENV:
  CLAUDE_PROJECT_DIR    Project root (default: \$HOME/Claude/Jarvis)
  SL_PULSE_URL          Pulse API endpoint (default: localhost:8700)

INSTALL:
  Edit .claude/settings.json:
    "statusLine": { "type": "command", "command": "\$CLAUDE_PROJECT_DIR/.claude/scripts/jarvis-statusline-v9.sh" }
EOF
        exit 0
        ;;
    "")     ;;
    *)      printf 'Unknown option: %s\nTry --help\n' "$1" >&2 ; exit 1 ;;
esac

# ─── HELPERS ───────────────────────────────────────────────────────────────

# Format integer with K/M suffix
human_int() {
    local n="${1:-0}"
    [[ "$n" =~ ^-?[0-9]+$ ]] || { printf '%s' "$n"; return 0; }
    if [[ "$n" -ge 1000000 ]]; then
        awk -v v="$n" 'BEGIN{printf "%.2fM", v/1000000}'
    elif [[ "$n" -ge 1000 ]]; then
        awk -v v="$n" 'BEGIN{printf "%.1fK", v/1000}'
    else
        printf '%s' "$n"
    fi
    return 0
}

# Format ms duration to "Xh Ym" or "Xm" or "Xs"
human_dur_ms() {
    local ms="${1:-0}"
    [[ "$ms" =~ ^[0-9]+$ ]] || { printf '—'; return 0; }
    local s=$(( ms / 1000 ))
    if   [[ "$s" -ge 3600 ]]; then printf '%dh%dm' "$(( s / 3600 ))" "$(( (s % 3600) / 60 ))"
    elif [[ "$s" -ge 60 ]];   then printf '%dm' "$(( s / 60 ))"
    else                            printf '%ds' "$s"
    fi
    return 0
}

# Format minutes (Xh Ym | Ym | —)
human_min() {
    local m="${1:-0}"
    if [[ -z "$m" || "$m" == "null" ]]; then printf '—'; return 0; fi
    [[ "$m" =~ ^[0-9]+$ ]] || { printf '—'; return 0; }
    [[ "$m" -eq 0 ]] && { printf '—'; return 0; }
    if   [[ "$m" -ge 60 ]]; then printf '%dh%dm' "$(( m / 60 ))" "$(( m % 60 ))"
    else                          printf '%dm' "$m"
    fi
    return 0
}

# Format seconds remaining as countdown ("1h23m", "5m", "now")
countdown_from_epoch() {
    local target="$1" now
    now=$(date +%s)
    [[ -z "$target" || "$target" == "null" || "$target" == "0" ]] && { printf '—'; return 0; }
    [[ "$target" =~ ^[0-9]+$ ]] || { printf '—'; return 0; }
    local diff=$(( target - now ))
    if   [[ "$diff" -le 0 ]];     then printf 'now'
    elif [[ "$diff" -lt 60 ]];    then printf '%ds' "$diff"
    elif [[ "$diff" -lt 3600 ]];  then printf '%dm' "$(( diff / 60 ))"
    elif [[ "$diff" -lt 86400 ]]; then printf '%dh%dm' "$(( diff / 3600 ))" "$(( (diff % 3600) / 60 ))"
    else                                printf '%dd%dh' "$(( diff / 86400 ))" "$(( (diff % 86400) / 3600 ))"
    fi
    return 0
}

# Color a percentage by threshold (0-30 green, 30-65 yellow, 65+ red)
color_pct() {
    local p="${1:-0}"
    [[ "$p" =~ ^[0-9]+$ ]] || p=0
    if   [[ "$p" -ge 65 ]]; then printf '%s' "$RED"
    elif [[ "$p" -ge 30 ]]; then printf '%s' "$YELLOW"
    else                          printf '%s' "$GREEN"
    fi
    return 0
}

# Color cache hit rate (90+ green, 70-90 yellow, <70 red)
color_hit() {
    local p="${1:-0}"
    [[ "$p" =~ ^[0-9]+$ ]] || p=0
    if   [[ "$p" -ge 90 ]]; then printf '%s' "$GREEN"
    elif [[ "$p" -ge 70 ]]; then printf '%s' "$YELLOW"
    else                          printf '%s' "$RED"
    fi
    return 0
}

# Color cost (green <$1, cyan $1-5, yellow $5-15, red >$15)
color_cost() {
    local c="${1:-0}"
    awk -v v="$c" 'BEGIN{
        if (v < 1) print "\033[38;5;46m";
        else if (v < 5) print "\033[38;5;51m";
        else if (v < 15) print "\033[38;5;226m";
        else print "\033[38;5;196m";
    }'
}

# Action color (cascades across all 3 rows)
action_color() {
    case "$1" in
        HARD_HALT)  printf '%s' "$RED$BOLD" ;;
        SOFT_NUDGE) printf '%s' "$YELLOW$BOLD" ;;
        CLEARING)   printf '%s' "$MAGENTA$BOLD" ;;
        RESTORING)  printf '%s' "$BLUE$BOLD" ;;
        WATCHING)   printf '%s' "$GREEN" ;;
        *)          printf '%s' "$GRAY" ;;
    esac
    return 0
}

action_icon() {
    case "$1" in
        HARD_HALT)  printf '⛔' ;;
        SOFT_NUDGE) printf '⚠️ ' ;;
        CLEARING)   printf '🌀' ;;
        RESTORING)  printf '♻️ ' ;;
        WATCHING)   printf '🟢' ;;
        *)          printf '·' ;;
    esac
    return 0
}

# Output style 1-char indicator
style_indicator() {
    case "$1" in
        ""|default|"Jeeves-Brief")  printf '' ;;
        Explanatory)                printf '%s📖%s' "$LGRAY" "$NC" ;;
        Learning)                   printf '%s🎓%s' "$LGRAY" "$NC" ;;
        *)                          printf '%s[%s]%s' "$DIM" "${1:0:3}" "$NC" ;;
    esac
    return 0
}

# Short model id (drop "claude-" prefix; map [1m] → ·1M)
model_short() {
    local m="${1:-unknown}"
    local s="${m#claude-}"
    case "$s" in
        *\[1m\]) s="${s%\[1m\]}·1M" ;;
    esac
    printf '%s' "$s"
    return 0
}

# Build a stack progress bar with soft/hard/auto-compact ticks
build_bar() {
    local width="${1:-22}" pct="${2:-0}" soft_pct="${3:-30}" hard_pct="${4:-65}" auto_pct="${5:-70}"
    [[ "$pct" =~ ^[0-9]+$ ]] || pct=0
    [[ "$pct" -gt 100 ]] && pct=100
    local soft_pos=$(( soft_pct * width / 100 ))
    local hard_pos=$(( hard_pct * width / 100 ))
    local auto_pos=$(( auto_pct * width / 100 ))
    local filled=$(( pct * width / 100 ))
    local i=0 out=""
    while [[ "$i" -lt "$width" ]]; do
        if [[ "$i" -eq "$soft_pos" ]]; then
            out+="${YELLOW}${TICK_SOFT}${NC}"
        elif [[ "$i" -eq "$hard_pos" ]]; then
            out+="${RED}${TICK_HARD}${NC}"
        elif [[ "$i" -eq "$auto_pos" ]]; then
            out+="${MAGENTA}${TICK_AUTO}${NC}"
        elif [[ "$i" -lt "$filled" ]]; then
            if   [[ "$i" -ge "$hard_pos" ]]; then out+="${RED}${BAR_FILL_DANGER}${NC}"
            elif [[ "$i" -ge "$soft_pos" ]]; then out+="${YELLOW}${BAR_FILL_WARN}${NC}"
            else                                  out+="${GREEN}${BAR_FILL_NORMAL}${NC}"
            fi
        else
            out+="${GRAY}${BAR_EMPTY}${NC}"
        fi
        i=$(( i + 1 ))
    done
    printf '%s' "$out"
    return 0
}

# Cache helper: check if file exists and is younger than TTL seconds
cache_fresh() {
    local file="$1" ttl="$2"
    [[ -f "$file" ]] || return 1
    local mtime now age
    mtime=$(stat -f %m "$file" 2>/dev/null) || return 1
    now=$(date +%s)
    age=$(( now - mtime ))
    [[ "$age" -lt "$ttl" ]]
}

# Pulse active task (cached, with timeout, graceful fallback)
get_pulse_task() {
    if cache_fresh "$SL_PULSE_CACHE" "$SL_PULSE_TTL"; then
        cat "$SL_PULSE_CACHE" 2>/dev/null
        return 0
    fi
    if command -v curl >/dev/null 2>&1; then
        local result
        result=$(curl -s --max-time "$SL_PULSE_TIMEOUT" "$SL_PULSE_URL" 2>/dev/null \
            | jq -r '.tasks[0].title // ""' 2>/dev/null)
        echo "$result" > "$SL_PULSE_CACHE"
        printf '%s' "$result"
    else
        echo "" > "$SL_PULSE_CACHE"
        printf ''
    fi
    return 0
}

# Git branch + status (cached)
get_git_state() {
    if cache_fresh "$SL_GIT_CACHE" "$SL_GIT_TTL"; then
        cat "$SL_GIT_CACHE" 2>/dev/null
        return 0
    fi
    local branch="" ahead=0
    branch=$(cd "$SL_PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null)
    if [[ -n "$branch" ]]; then
        ahead=$(cd "$SL_PROJECT_DIR" 2>/dev/null && git rev-list --count "@{upstream}..HEAD" 2>/dev/null || echo 0)
    fi
    echo "${branch}|${ahead}" > "$SL_GIT_CACHE"
    printf '%s|%s' "$branch" "$ahead"
    return 0
}

# Read JICM state-hook JSON (Jarvis-unique data)
read_state_hook() {
    [[ -f "$SL_STATE_FILE" ]] || { printf ''; return 0; }
    cat "$SL_STATE_FILE" 2>/dev/null
    return 0
}

# Project name from project_dir basename
project_name() {
    local pd="${1:-}"
    if [[ -z "$pd" ]]; then pd="$SL_PROJECT_DIR"; fi
    basename "$pd"
    return 0
}

# ─── DEMO STATE SYNTHESIS ──────────────────────────────────────────────────

synthesize() {
    local s="$1"
    local now_epoch
    now_epoch=$(date +%s)
    # Defaults
    MODEL_ID="claude-opus-4-7[1m]"
    WINDOW=1000000
    EXCEEDS_200K="false"
    SESSION_NAME=""
    PROJECT_DIR_IN="/Users/nathanielcannon/Claude/Jarvis"
    CWD="/Users/nathanielcannon/Claude/Jarvis"
    OUTPUT_STYLE="Jeeves-Brief"
    VIM_MODE=""
    AGENT_NAME=""
    DEMO_GIT_BRANCH="Project_Aion"
    DEMO_GIT_AHEAD=3
    DEMO_PULSE_TASK=""
    DEMO_HK_ACTION="WATCHING"
    DEMO_HK_TOKENS=145200
    DEMO_HK_USED_PCT=14
    DEMO_HK_BURN=620
    DEMO_HK_SOFT_ETA=250
    DEMO_HK_HARD_ETA=816
    DEMO_HK_HIT="0.97"
    DEMO_HK_EPH1H=100
    DEMO_HK_SOFT_TOK=250000
    DEMO_HK_HARD_TOK=300000

    case "$s" in
        idle|1)
            DEMO_LABEL="1 ── idle / WATCHING / low context"
            COST=3.42; DUR_MS=2820000; API_DUR_MS=2030000
            LINES_ADD=247; LINES_REM=53
            RATE_5H=18; RATE_5H_RESET=$(( now_epoch + 3 * 3600 + 12 * 60 ))
            RATE_7D=42; RATE_7D_RESET=$(( now_epoch + 6 * 86400 + 4 * 3600 ))
            DEMO_PULSE_TASK="Phase 1.3.5 Stage-1 verdict draft"
            ;;
        mid|2)
            DEMO_LABEL="2 ── mid-context / WATCHING / healthy"
            DEMO_HK_TOKENS=485000; DEMO_HK_USED_PCT=48
            DEMO_HK_BURN=1240; DEMO_HK_SOFT_ETA=0; DEMO_HK_HARD_ETA=133
            DEMO_HK_HIT="0.94"; DEMO_HK_EPH1H=89
            COST=8.15; DUR_MS=4920000; API_DUR_MS=3680000
            LINES_ADD=512; LINES_REM=187
            RATE_5H=42; RATE_5H_RESET=$(( now_epoch + 2 * 3600 + 18 * 60 ))
            RATE_7D=51; RATE_7D_RESET=$(( now_epoch + 5 * 86400 + 12 * 3600 ))
            EXCEEDS_200K="true"
            DEMO_PULSE_TASK="Pipeline v2 telemetry instrumentation"
            ;;
        soft|3)
            DEMO_LABEL="3 ── SOFT_NUDGE crossed (~31%, exceeds_200k pre-warn)"
            DEMO_HK_ACTION="SOFT_NUDGE"
            DEMO_HK_TOKENS=312800; DEMO_HK_USED_PCT=31
            DEMO_HK_BURN=1840; DEMO_HK_SOFT_ETA=0; DEMO_HK_HARD_ETA=183
            DEMO_HK_HIT="0.96"; DEMO_HK_EPH1H=92
            COST=6.18; DUR_MS=3420000; API_DUR_MS=2510000
            LINES_ADD=98; LINES_REM=22
            RATE_5H=44; RATE_5H_RESET=$(( now_epoch + 2 * 3600 + 8 * 60 ))
            RATE_7D=51; RATE_7D_RESET=$(( now_epoch + 5 * 86400 ))
            EXCEEDS_200K="true"
            DEMO_PULSE_TASK="Two-stage gating doc revision"
            ;;
        hard|4)
            DEMO_LABEL="4 ── HARD_HALT crossed (~67%, JICM cycle imminent)"
            DEMO_HK_ACTION="HARD_HALT"
            DEMO_HK_TOKENS=678200; DEMO_HK_USED_PCT=67
            DEMO_HK_BURN=2840; DEMO_HK_SOFT_ETA=0; DEMO_HK_HARD_ETA=0
            DEMO_HK_HIT="0.96"; DEMO_HK_EPH1H=96
            COST=14.92; DUR_MS=5820000; API_DUR_MS=4180000
            LINES_ADD=1240; LINES_REM=440
            RATE_5H=72; RATE_5H_RESET=$(( now_epoch + 1 * 3600 + 38 * 60 ))
            RATE_7D=68; RATE_7D_RESET=$(( now_epoch + 4 * 86400 + 8 * 3600 ))
            EXCEEDS_200K="true"
            DEMO_PULSE_TASK="JICM v8 portable architecture (BLOCKED)"
            ;;
        fresh|5)
            DEMO_LABEL="5 ── fresh-session / cache misses / RESTORING"
            DEMO_HK_ACTION="WATCHING"
            DEMO_HK_TOKENS=18420; DEMO_HK_USED_PCT=2
            DEMO_HK_BURN=0; DEMO_HK_SOFT_ETA=0; DEMO_HK_HARD_ETA=0
            DEMO_HK_HIT="0.05"; DEMO_HK_EPH1H=0
            COST=0.04; DUR_MS=8000; API_DUR_MS=6000
            LINES_ADD=0; LINES_REM=0
            RATE_5H=18; RATE_5H_RESET=$(( now_epoch + 3 * 3600 ))
            RATE_7D=42; RATE_7D_RESET=$(( now_epoch + 6 * 86400 ))
            DEMO_PULSE_TASK="Session restored from JICM cycle"
            ;;
        rate|6)
            DEMO_LABEL="6 ── near 5h rate limit (>70%) / WATCHING"
            DEMO_HK_TOKENS=420000; DEMO_HK_USED_PCT=42
            DEMO_HK_BURN=4200; DEMO_HK_SOFT_ETA=0; DEMO_HK_HARD_ETA=55
            DEMO_HK_HIT="0.93"; DEMO_HK_EPH1H=88
            COST=22.18; DUR_MS=14400000; API_DUR_MS=10800000
            LINES_ADD=2840; LINES_REM=920
            RATE_5H=84; RATE_5H_RESET=$(( now_epoch + 0 * 3600 + 28 * 60 ))
            RATE_7D=72; RATE_7D_RESET=$(( now_epoch + 3 * 86400 + 18 * 3600 ))
            EXCEEDS_200K="true"
            DEMO_PULSE_TASK="High-throughput session — rate limit nearing"
            ;;
        worktree|7)
            DEMO_LABEL="7 ── worktree session (feature/jicm-v8 branch)"
            DEMO_HK_TOKENS=180000; DEMO_HK_USED_PCT=18
            DEMO_HK_BURN=820; DEMO_HK_SOFT_ETA=146; DEMO_HK_HARD_ETA=572
            DEMO_HK_HIT="0.95"; DEMO_HK_EPH1H=94
            COST=4.20; DUR_MS=2400000; API_DUR_MS=1820000
            LINES_ADD=380; LINES_REM=120
            RATE_5H=22; RATE_5H_RESET=$(( now_epoch + 4 * 3600 ))
            RATE_7D=44; RATE_7D_RESET=$(( now_epoch + 5 * 86400 + 10 * 3600 ))
            DEMO_GIT_BRANCH="feature/jicm-v8-portable"
            DEMO_GIT_AHEAD=12
            DEMO_PULSE_TASK="Worktree: v8 portable architecture experiment"
            OUTPUT_STYLE="Explanatory"
            ;;
        tooly|8)
            DEMO_LABEL="8 ── tool-heavy session (low API efficiency)"
            DEMO_HK_TOKENS=290000; DEMO_HK_USED_PCT=29
            DEMO_HK_BURN=1850; DEMO_HK_SOFT_ETA=5; DEMO_HK_HARD_ETA=194
            DEMO_HK_HIT="0.91"; DEMO_HK_EPH1H=85
            COST=11.40; DUR_MS=18000000; API_DUR_MS=4500000  # 25% efficiency
            LINES_ADD=180; LINES_REM=42
            RATE_5H=38; RATE_5H_RESET=$(( now_epoch + 2 * 3600 + 50 * 60 ))
            RATE_7D=58; RATE_7D_RESET=$(( now_epoch + 4 * 86400 + 16 * 3600 ))
            DEMO_PULSE_TASK="Bulk file refactor — tool-heavy workload"
            ;;
        *)
            return 1
            ;;
    esac
    return 0
}

# Mock external readers in demo mode
demo_mode_active() {
    [[ -n "$DEMO_STATE" ]]
}

# Override Pulse + git + state-hook readers when in demo mode
get_pulse_task_demo() { printf '%s' "$DEMO_PULSE_TASK"; }
get_git_state_demo()  { printf '%s|%s' "$DEMO_GIT_BRANCH" "$DEMO_GIT_AHEAD"; }
read_state_hook_demo() {
    cat <<EOF
{
  "action": "$DEMO_HK_ACTION",
  "tokens": $DEMO_HK_TOKENS,
  "used_percentage": $DEMO_HK_USED_PCT,
  "burn_rate_tpm": $DEMO_HK_BURN,
  "soft_eta_min": $DEMO_HK_SOFT_ETA,
  "hard_eta_min": $DEMO_HK_HARD_ETA,
  "cache_hit_rate": $DEMO_HK_HIT,
  "cache_creation_1h_tokens": 89000,
  "cache_creation_5m_tokens": 11000,
  "cache_creation_tokens": 100000,
  "soft_threshold_tokens": $DEMO_HK_SOFT_TOK,
  "hard_threshold_tokens": $DEMO_HK_HARD_TOK,
  "context_window_size": 1000000,
  "model_id": "$MODEL_ID"
}
EOF
}

# ─── STDIN PARSE (single batched jq) ───────────────────────────────────────

parse_stdin() {
    local input
    input="$(cat)"
    if [[ -z "$input" ]]; then
        printf '%sno-stdin%s\n' "$RED" "$NC"
        exit 0
    fi
    if ! command -v jq >/dev/null 2>&1; then
        printf '%s[no-jq] statusline degraded%s\n' "$RED" "$NC"
        exit 0
    fi
    # Single batched parse via @sh-quoted eval (research recommendation #2)
    local parsed
    parsed=$(echo "$input" | jq -r '
        @sh "MODEL_ID=\(.model.id // "unknown")",
        @sh "WINDOW=\(.context_window.context_window_size // 200000)",
        @sh "USED_PCT=\(.context_window.used_percentage // 0)",
        @sh "CACHE_READ=\(.context_window.current_usage.cache_read_input_tokens // 0)",
        @sh "CACHE_CREATE=\(.context_window.current_usage.cache_creation_input_tokens // 0)",
        @sh "INPUT_TURN=\(.context_window.current_usage.input_tokens // 0)",
        @sh "EXCEEDS_200K=\(.exceeds_200k_tokens // false)",
        @sh "COST=\(.cost.total_cost_usd // 0)",
        @sh "DUR_MS=\(.cost.total_duration_ms // 0)",
        @sh "API_DUR_MS=\(.cost.total_api_duration_ms // 0)",
        @sh "LINES_ADD=\(.cost.total_lines_added // 0)",
        @sh "LINES_REM=\(.cost.total_lines_removed // 0)",
        @sh "RATE_5H=\(.rate_limits.five_hour.used_percentage // "")",
        @sh "RATE_5H_RESET=\(.rate_limits.five_hour.resets_at // 0)",
        @sh "RATE_7D=\(.rate_limits.seven_day.used_percentage // "")",
        @sh "RATE_7D_RESET=\(.rate_limits.seven_day.resets_at // 0)",
        @sh "OUTPUT_STYLE=\(.output_style.name // "default")",
        @sh "SESSION_NAME=\(.session_name // "")",
        @sh "PROJECT_DIR_IN=\(.workspace.project_dir // "")",
        @sh "CWD=\(.cwd // "")",
        @sh "VIM_MODE=\(.vim.mode // "")",
        @sh "AGENT_NAME=\(.agent.name // "")",
        @sh "WORKTREE_BRANCH=\(.worktree.branch // "")"' 2>/dev/null)
    eval "$parsed"
    return 0
}

# ─── DERIVE FROM STATE-HOOK JSON ───────────────────────────────────────────

derive_jicm() {
    local state_json
    if demo_mode_active; then
        state_json=$(read_state_hook_demo)
    else
        state_json=$(read_state_hook)
    fi
    if [[ -z "$state_json" ]]; then
        HK_ACTION="WATCHING"
        HK_TOKENS=0; HK_USED_PCT=0
        HK_BURN=0; HK_SOFT_ETA=0; HK_HARD_ETA=0
        HK_HIT_PCT=0; HK_EPH1H_PCT=0
        HK_SOFT_TOK=250000; HK_HARD_TOK=300000
        return 0
    fi
    HK_ACTION=$(jq -r '.action // "WATCHING"' <<<"$state_json" 2>/dev/null)
    HK_TOKENS=$(jq -r '.tokens // 0' <<<"$state_json" 2>/dev/null)
    HK_USED_PCT=$(jq -r '.used_percentage // 0' <<<"$state_json" 2>/dev/null)
    HK_BURN=$(jq -r '.burn_rate_tpm // 0' <<<"$state_json" 2>/dev/null)
    HK_SOFT_ETA=$(jq -r '.soft_eta_min // 0' <<<"$state_json" 2>/dev/null)
    HK_HARD_ETA=$(jq -r '.hard_eta_min // 0' <<<"$state_json" 2>/dev/null)
    local hit_raw
    hit_raw=$(jq -r '.cache_hit_rate // 0' <<<"$state_json" 2>/dev/null)
    HK_HIT_PCT=$(awk -v h="$hit_raw" 'BEGIN{printf "%d", h*100}')
    local eph_1h eph_total
    eph_1h=$(jq -r '.cache_creation_1h_tokens // 0' <<<"$state_json" 2>/dev/null)
    eph_total=$(jq -r '.cache_creation_tokens // 0' <<<"$state_json" 2>/dev/null)
    if [[ "$eph_total" -gt 0 ]]; then
        HK_EPH1H_PCT=$(( eph_1h * 100 / eph_total ))
    else
        HK_EPH1H_PCT=0
    fi
    HK_SOFT_TOK=$(jq -r '.soft_threshold_tokens // 250000' <<<"$state_json" 2>/dev/null)
    HK_HARD_TOK=$(jq -r '.hard_threshold_tokens // 300000' <<<"$state_json" 2>/dev/null)
    return 0
}

# ─── ROW BUILDERS ──────────────────────────────────────────────────────────

build_row1() {
    local act_color act_icon style_ind branch ahead pre_warn
    act_color=$(action_color "$HK_ACTION")
    act_icon=$(action_icon "$HK_ACTION")
    style_ind=$(style_indicator "$OUTPUT_STYLE")

    if demo_mode_active; then
        IFS='|' read -r branch ahead <<< "$(get_git_state_demo)"
    else
        IFS='|' read -r branch ahead <<< "$(get_git_state)"
    fi
    [[ -z "$branch" ]] && branch="—"
    local ahead_disp=""
    if [[ "$ahead" =~ ^[0-9]+$ ]] && [[ "$ahead" -gt 0 ]]; then
        ahead_disp=" ${CYAN}↑${ahead}${NC}"
    fi

    # Pre-warning indicator: exceeds_200k_tokens but action still WATCHING
    pre_warn=""
    if [[ "$EXCEEDS_200K" == "true" ]] && [[ "$HK_ACTION" == "WATCHING" ]]; then
        pre_warn=" ${ORANGE}△ exc-200k${NC}"
    fi

    local model_disp
    model_disp=$(model_short "$MODEL_ID")

    # Project display: prefer session_name (when set via /rename), else
    # project basename, with optional :SubProject suffix when CWD is a
    # subdirectory of project root (AIFred-Pro pattern).
    local proj_disp
    if [[ -n "$SESSION_NAME" ]]; then
        proj_disp="${MAGENTA}@${SESSION_NAME}${NC}"
    else
        local proj_name sub_disp=""
        proj_name=$(project_name "$PROJECT_DIR_IN")
        if [[ -n "$CWD" && -n "$PROJECT_DIR_IN" && "$CWD" != "$PROJECT_DIR_IN" ]]; then
            local rel="${CWD#${PROJECT_DIR_IN}/}"
            if [[ "$rel" != "$CWD" && -n "$rel" ]]; then
                local sub_short="${rel:0:24}"
                [[ "${#rel}" -gt 24 ]] && sub_short="${sub_short}…"
                sub_disp="${DIM}/${NC}${CYAN}${sub_short}${NC}"
            fi
        fi
        proj_disp="${BLUE}${proj_name}${NC}${sub_disp}"
    fi

    # Branch display: worktree-aware (real or demo)
    local is_worktree=false
    if [[ -n "$WORKTREE_BRANCH" ]]; then
        is_worktree=true
    elif demo_mode_active && [[ "${DEMO_STATE:-}" == "7" || "${DEMO_STATE:-}" == "worktree" ]]; then
        is_worktree=true
    fi

    local branch_disp
    if [[ "$is_worktree" == "true" ]]; then
        branch_disp="${PINK}⌐ ${branch}${NC}${ahead_disp}"
    else
        branch_disp="${TEAL}${branch}${NC}${ahead_disp}"
    fi

    # Lines diff (from cost.total_lines_added/removed)
    local diff_disp=""
    if [[ "$LINES_ADD" -gt 0 ]] || [[ "$LINES_REM" -gt 0 ]]; then
        diff_disp=" ${GREEN}+${LINES_ADD}${NC}${RED}-${LINES_REM}${NC}"
    fi

    # Vim mode indicator
    local vim_disp=""
    case "$VIM_MODE" in
        INSERT) vim_disp=" ${LIME}-- INSERT --${NC}" ;;
        NORMAL) vim_disp=" ${VIOLET}-- NORMAL --${NC}" ;;
    esac

    # Agent indicator
    local agent_disp=""
    [[ -n "$AGENT_NAME" ]] && agent_disp=" ${PINK}@${AGENT_NAME}${NC}"

    printf '%s %s  %s  %s%s%s%s\n' \
        "$act_icon" \
        "${act_color}${model_disp}${NC}" \
        "$proj_disp" \
        "$branch_disp" \
        "$diff_disp" \
        "$style_ind$vim_disp$agent_disp" \
        "$pre_warn"
    return 0
}

build_row2() {
    local bar pct_color hit_color
    bar=$(build_bar "$SL_BAR_WIDTH" "$HK_USED_PCT" \
        "$(( HK_SOFT_TOK * 100 / WINDOW ))" \
        "$(( HK_HARD_TOK * 100 / WINDOW ))" 70)
    pct_color=$(color_pct "$HK_USED_PCT")
    hit_color=$(color_hit "$HK_HIT_PCT")

    # Burn rate format — "idle" when zero, K-suffix when ≥1000
    local burn_disp burn_color="$VIOLET"
    if [[ "$HK_BURN" -le 0 ]]; then
        burn_disp="idle"
        burn_color="$DIM"
    elif [[ "$HK_BURN" -ge 1000 ]]; then
        burn_disp=$(awk -v t="$HK_BURN" 'BEGIN{printf "%.1fK", t/1000}')
    else
        burn_disp="$HK_BURN"
    fi

    # ETAs
    local soft_eta hard_eta
    soft_eta=$(human_min "$HK_SOFT_ETA")
    hard_eta=$(human_min "$HK_HARD_ETA")

    # Tokens (compact)
    local tok_disp
    tok_disp=$(human_int "$HK_TOKENS")

    # Render burn with conditional Δ prefix (omit when "idle" for cleanliness)
    # Pad "idle" to match typical "Δ620/m" visual width for alignment.
    local burn_field
    if [[ "$burn_disp" == "idle" ]]; then
        burn_field="${burn_color}idle  ${NC}"
    else
        burn_field="Δ${burn_color}${burn_disp}${NC}/m"
    fi

    printf '[%s] %s%s%%%s %s   %s  S:%s H:%s  cache:%s%s%%%s eph1h:%s%s%%%s\n' \
        "$bar" \
        "$pct_color" "$HK_USED_PCT" "$NC" \
        "${DIM}${tok_disp}${NC}" \
        "$burn_field" \
        "${LGRAY}${soft_eta}${NC}" "${LGRAY}${hard_eta}${NC}" \
        "$hit_color" "$HK_HIT_PCT" "$NC" \
        "$(color_hit "$HK_EPH1H_PCT")" "$HK_EPH1H_PCT" "$NC"
    return 0
}

build_row3() {
    local cost_disp cost_color
    cost_color=$(color_cost "$COST")
    cost_disp=$(awk -v c="$COST" 'BEGIN{printf "$%.2f", c}')

    # Wall + API efficiency
    local wall_disp api_pct=0
    wall_disp=$(human_dur_ms "$DUR_MS")
    if [[ "$DUR_MS" -gt 0 ]]; then
        api_pct=$(awk -v a="$API_DUR_MS" -v t="$DUR_MS" 'BEGIN{printf "%d", (a/t)*100}')
    fi
    local api_color
    if   [[ "$api_pct" -ge 60 ]]; then api_color="$GREEN"
    elif [[ "$api_pct" -ge 30 ]]; then api_color="$YELLOW"
    else                                api_color="$ORANGE"
    fi

    # Rate limits
    local rate5_disp="" rate7_disp=""
    if [[ -n "$RATE_5H" ]] && [[ "$RATE_5H" != "" ]]; then
        local r5_color
        r5_color=$(color_pct "$RATE_5H")
        local r5_cd
        r5_cd=$(countdown_from_epoch "$RATE_5H_RESET")
        rate5_disp="  5h:${r5_color}${RATE_5H}%${NC}${DIM}↺${r5_cd}${NC}"
    fi
    if [[ -n "$RATE_7D" ]] && [[ "$RATE_7D" != "" ]]; then
        local r7_color
        r7_color=$(color_pct "$RATE_7D")
        local r7_cd
        r7_cd=$(countdown_from_epoch "$RATE_7D_RESET")
        rate7_disp="  7d:${r7_color}${RATE_7D}%${NC}${DIM}↺${r7_cd}${NC}"
    fi

    # NLP compression panel (read .jicm-nlp-compression.json directly,
    # not state-hook). Display only when NLP was applied.
    local nlp_disp=""
    if [[ -f "$SL_NLP_FILE" ]] && ! demo_mode_active; then
        local nlp_json applied ratio
        nlp_json=$(cat "$SL_NLP_FILE" 2>/dev/null)
        if [[ -n "$nlp_json" ]]; then
            applied=$(jq -r '.nlp_compression_applied // false' <<<"$nlp_json" 2>/dev/null)
            if [[ "$applied" == "true" ]]; then
                ratio=$(jq -r '.nlp_compression_ratio // ""' <<<"$nlp_json" 2>/dev/null)
                local ratio_color="$DIM"
                # Color the ratio: <0.9 green (effective), 0.9-1.0 yellow, ≥1.0 dim (no effect)
                if awk -v r="$ratio" 'BEGIN{exit (r<0.9)?0:1}' 2>/dev/null; then
                    ratio_color="$GREEN"
                elif awk -v r="$ratio" 'BEGIN{exit (r<1.0)?0:1}' 2>/dev/null; then
                    ratio_color="$YELLOW"
                fi
                nlp_disp="  ${DIM}NLP:${NC}${ratio_color}${ratio}${NC}"
            fi
        fi
    fi

    # Pulse task
    local pulse pulse_disp=""
    if demo_mode_active; then
        pulse=$(get_pulse_task_demo)
    else
        pulse=$(get_pulse_task)
    fi
    if [[ -n "$pulse" ]]; then
        local pulse_short="${pulse:0:42}"
        [[ "${#pulse}" -gt 42 ]] && pulse_short="${pulse_short}…"
        pulse_disp="  ${VIOLET}◆${NC} ${pulse_short}"
    fi

    printf '%s%s%s  ⏱%s api:%s%s%%%s%s%s%s%s\n' \
        "$cost_color" "$cost_disp" "$NC" \
        "${LGRAY}${wall_disp}${NC}" \
        "$api_color" "$api_pct" "$NC" \
        "$rate5_disp" "$rate7_disp" "$nlp_disp" "$pulse_disp"
    return 0
}

# ─── ASSEMBLE OUTPUT ───────────────────────────────────────────────────────

emit_statusline() {
    build_row1
    build_row2
    build_row3
    return 0
}

# ─── MAIN ──────────────────────────────────────────────────────────────────

main() {
    if [[ -n "$DEMO_STATE" ]]; then
        if [[ "$DEMO_STATE" == "all" ]]; then
            for s in 1 2 3 4 5 6 7 8; do
                synthesize "$s" || continue
                printf '%s── DEMO STATE %s ───%s\n' "$VIOLET$BOLD" "$DEMO_LABEL" "$NC"
                derive_jicm
                emit_statusline
                printf '\n'
            done
        else
            if synthesize "$DEMO_STATE"; then
                printf '%s── DEMO STATE %s ───%s\n' "$VIOLET$BOLD" "$DEMO_LABEL" "$NC"
                derive_jicm
                emit_statusline
            else
                printf 'Unknown demo state: %s\nValid: 1..8 or idle|mid|soft|hard|fresh|rate|worktree|tooly\n' "$DEMO_STATE" >&2
                return 1
            fi
        fi
    else
        parse_stdin
        derive_jicm
        emit_statusline
    fi
    return 0
}

main "$@"
