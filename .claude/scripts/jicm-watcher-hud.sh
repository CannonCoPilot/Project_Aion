#!/bin/bash
# ============================================================================
# Jarvis Watcher HUD v1.0 — Full-monitor dashboard for v7.9 slim watcher
# ============================================================================
#
# Sidecar reader. Renders an htop-style live dashboard over the v7.9 watcher's
# state surface. Does NOT touch jicm-watcher.sh, hooks, or signal protocol —
# read-only consumer. Preserves the architectural separation shipped in 7.9.6b
# (watcher actuates; HUD displays).
#
# Data sources (all read-only):
#   .jicm-state-hook.json      — primary; tokens, model, cache, thresholds, ETAs
#   .jicm-state                — legacy text shim (state machine: WATCHING/CLEARING/RESTORING)
#   .jicm-watcher.pid          — watcher PID (uptime via ps)
#   jicm-watcher.log           — log tail
#   .jicm-last-compression.json — last cycle metadata
#   .jicm-nlp-compression.json — NLP compression metrics
#   .compressed-context-ready.md — next checkpoint preview
#   .compression-done.signal etc. — transient signals (presence-only)
#   .command-signal            — pending slash-command injections
#   .ennoia-recommendation/.ennoia-status — Ennoia guidance
#   .virgil-tasks.json         — Virgil task tracking
#   ~/.ccusage-blocks.json     — ccusage block data (if installed)
#   ps + pgrep                 — Aion Quartet liveness
#   git status                 — current branch + commit ahead count
#
# Modes:
#   (default)             Live dashboard with 1s refresh
#   --once                Render a single frame then exit (testing)
#   --demo                Cycle through 5 example states (interactive)
#   --demo-state=N        Render a single demo state (1-5) and exit
#   --help                Usage
#
# Layout target:  ≥100 cols × ≥40 rows. Optimized for full-screen tmux.
# Performance:    Single-pass data load; render cycle <100ms typical.
# Refresh:        1s default (configurable via HUD_REFRESH env var).
#
# Usage:
#   bash .claude/scripts/jicm-watcher-hud.sh                  # live mode
#   bash .claude/scripts/jicm-watcher-hud.sh --once           # snapshot
#   bash .claude/scripts/jicm-watcher-hud.sh --demo           # interactive demo
#   bash .claude/scripts/jicm-watcher-hud.sh --demo-state=3   # single demo frame
#
# Author:         Jarvis (Project Aion overnight build, 2026-05-03)
# License:        MIT
# ============================================================================

set -o pipefail

# ─── CONFIG ────────────────────────────────────────────────────────────────
HUD_REFRESH="${HUD_REFRESH:-1}"
HUD_LOG_TAIL="${HUD_LOG_TAIL:-10}"
HUD_MIN_COLS="${HUD_MIN_COLS:-100}"
HUD_MIN_ROWS="${HUD_MIN_ROWS:-40}"
HUD_VERSION="1.0.0"

# ─── PATHS ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"

# Source shared config (best-effort) — env vars set here may override below
[[ -f "$SCRIPT_DIR/jicm-config.sh" ]] && . "$SCRIPT_DIR/jicm-config.sh" 2>/dev/null

JICM_STATE_HOOK_FILE="${JICM_STATE_HOOK_FILE:-$PROJECT_DIR/.claude/context/.jicm-state-hook.json}"
JICM_STATE_FILE="${JICM_STATE_FILE:-$PROJECT_DIR/.claude/context/.jicm-state}"
JICM_LOG_FILE="${JICM_LOG_FILE:-$PROJECT_DIR/.claude/logs/jicm-watcher.log}"
JICM_PID_FILE="${JICM_PID_FILE:-$PROJECT_DIR/.claude/context/.jicm-watcher.pid}"
JICM_METADATA_FILE="${JICM_METADATA_FILE:-$PROJECT_DIR/.claude/context/.jicm-last-compression.json}"
JICM_NLP_META="$PROJECT_DIR/.claude/context/.jicm-nlp-compression.json"
JICM_CLEAR_SIG="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
JICM_RESUME_SIG="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"
JICM_COMPRESSION_SIG="$PROJECT_DIR/.claude/context/.compression-done.signal"
JICM_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
JICM_COMMAND_SIG="$PROJECT_DIR/.claude/context/.command-signal"
JICM_EXIT_SIG="$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal"
JICM_SLEEP_SIG="$PROJECT_DIR/.claude/context/.jicm-sleep.signal"
JICM_COMPRESSED_FILE="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
JICM_ENNOIA_REC="$PROJECT_DIR/.claude/context/.ennoia-recommendation"
JICM_ENNOIA_STATUS="$PROJECT_DIR/.claude/context/.ennoia-status"
JICM_VIRGIL_TASKS="$PROJECT_DIR/.claude/context/.virgil-tasks.json"
JICM_SESSION_STATE_DOC="$PROJECT_DIR/.claude/context/session-state.md"
JICM_ACTIVE_PLAN_DOC="$PROJECT_DIR/.claude/context/.active-plan"
HUD_PULSE_CACHE="/tmp/jarvis-hud-pulse.cache"
HUD_PULSE_TTL=30
HUD_PULSE_URL_OPEN="${HUD_PULSE_URL_OPEN:-http://localhost:8700/api/v1/tasks?status=open}"
HUD_PULSE_URL_JARVIS="${HUD_PULSE_URL_JARVIS:-http://localhost:8700/api/v1/tasks?status=open&label=agent:jarvis}"
HUD_PULSE_URL_AIFRED="${HUD_PULSE_URL_AIFRED:-http://localhost:8700/api/v1/tasks?status=open&label=agent:aifred}"
CCUSAGE_FILE="$HOME/.ccusage-blocks.json"

# ─── COLORS (256-color ANSI) ───────────────────────────────────────────────
C_NC=$'\033[0m'
C_BOLD=$'\033[1m'
C_DIM=$'\033[2m'
C_ITALIC=$'\033[3m'
C_INV=$'\033[7m'

C_BLACK=$'\033[38;5;0m'
C_RED=$'\033[38;5;196m'
C_GREEN=$'\033[38;5;46m'
C_YELLOW=$'\033[38;5;226m'
C_ORANGE=$'\033[38;5;208m'
C_BLUE=$'\033[38;5;33m'
C_CYAN=$'\033[38;5;51m'
C_MAGENTA=$'\033[38;5;201m'
C_WHITE=$'\033[38;5;255m'
C_GRAY=$'\033[38;5;240m'
C_LGRAY=$'\033[38;5;250m'
C_DGRAY=$'\033[38;5;235m'
C_TEAL=$'\033[38;5;30m'
C_PINK=$'\033[38;5;213m'
C_LIME=$'\033[38;5;118m'
C_GOLD=$'\033[38;5;220m'
C_VIOLET=$'\033[38;5;141m'

C_OK=$C_LIME
C_WARN=$C_GOLD
C_ERR=$C_RED
C_INFO=$C_CYAN
C_HEADER=$C_VIOLET
C_LABEL=$C_GRAY
C_VALUE=$C_WHITE
C_ACCENT=$C_TEAL

# ─── BOX DRAWING ───────────────────────────────────────────────────────────
B_TL='┌' B_TR='┐' B_BL='└' B_BR='┘' B_H='─' B_V='│'
B_TD='┬' B_TU='┴' B_TR2='├' B_TL2='┤' B_X='┼'
B_DH='═' B_DV='║' B_DTL='╔' B_DTR='╗' B_DBL='╚' B_DBR='╝'
BLOCK_FULL='█' BLOCK_75='▓' BLOCK_50='▒' BLOCK_25='░'
TICK_SOFT='│' TICK_HARD='┃' TICK_AUTO='╿'
ARROW_UP='▲' ARROW_DOWN='▼' ARROW_RIGHT='▶'
DOT_FULL='●' DOT_EMPTY='○' DOT_SQUARE='■'
ICON_OK='✓' ICON_FAIL='✗' ICON_WARN='⚠' ICON_HALT='⛔' ICON_CLOCK='◴'

# ─── GLOBAL STATE (populated by load_data) ─────────────────────────────────
declare -i HUD_NOW_EPOCH=0
declare HUD_NOW_FMT=""

# State-hook fields
declare HK_VERSION="" HK_TS="" HK_SESSION="" HK_MODEL=""
declare -i HK_TOKENS=0 HK_INPUT=0 HK_CACHE_READ=0 HK_CACHE_CREATE=0
declare -i HK_CACHE_5M=0 HK_CACHE_1H=0 HK_OUTPUT_LAST=0
declare -i HK_WINDOW=1000000 HK_SOFT_TOKENS=250000 HK_HARD_TOKENS=300000
declare -i HK_BURN=0 HK_SOFT_ETA=0 HK_HARD_ETA=0 HK_USED_PCT=0
declare HK_CACHE_HIT="0.00" HK_COST="" HK_RATE5H="" HK_RATE7D=""
declare HK_ACTION="WATCHING" HK_PENDING="" HK_TRANSCRIPT=""

# Legacy state
declare LG_STATE="WATCHING" LG_TS="" LG_SHIM="false"

# Compression metadata
declare CM_TS="" CM_METHOD="" CM_LLM="" CM_JSONL=""
declare -i CM_DUR=0 CM_LINES=0 CM_BYTES=0 CM_USER_MSGS=0 CM_STALE_MIN=0
declare CM_NLP_APPLIED="false"
declare -i CM_NLP_BEFORE=0 CM_NLP_AFTER=0
declare CM_NLP_RATIO=""

# Watcher process
declare -i W_PID=0
declare W_UPTIME="-" W_CPU="-" W_RSS="-" W_ALIVE="false"

# Aion Quartet
declare Q_WATCHER_PID="" Q_WATCHER_UP=""
declare Q_ENNOIA_PID="" Q_ENNOIA_UP=""
declare Q_VIRGIL_PID="" Q_VIRGIL_UP=""
declare Q_COMMANDS_PID="" Q_COMMANDS_UP=""

# Signals
declare SIG_CLEAR="false" SIG_RESUME="false" SIG_COMP_DONE="false"
declare SIG_COMP_GUARD="false" SIG_COMMAND="" SIG_EXIT="false" SIG_SLEEP="false"

# Log tail
declare HUD_LOG_LINES=()

# Pulse + Project context
declare -i HUD_PULSE_OPEN_TOTAL=-1
declare -i HUD_PULSE_OPEN_JARVIS=-1
declare -i HUD_PULSE_OPEN_AIFRED=-1
declare HUD_PROJECT_STATUS=""
declare HUD_GIT_BRANCH=""
declare -i HUD_GIT_AHEAD=0
declare -i HUD_GIT_DIRTY=0
declare -i HUD_CYCLE_COUNT=0

# NLP compression
declare NLP_APPLIED="false" NLP_RATIO="" NLP_MODE=""
declare -i NLP_BEFORE=0 NLP_AFTER=0

# Demo override flag
declare HUD_DEMO_MODE="false"

# ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

# Repeat a character N times
repeat_char() {
    local char="$1" count="$2" out="" i=0
    while [[ "$i" -lt "$count" ]]; do
        out+="$char"
        i=$(( i + 1 ))
    done
    printf '%s' "$out"
}

# Pad string to width N (right-pad with spaces)
pad_right() {
    local str="$1" width="$2"
    local len="${#str}"
    if [[ "$len" -ge "$width" ]]; then
        printf '%s' "${str:0:$width}"
    else
        printf '%s%s' "$str" "$(repeat_char ' ' $(( width - len )))"
    fi
}

# Truncate string with ellipsis to width N
truncate_str() {
    local str="$1" width="$2"
    local len="${#str}"
    if [[ "$len" -le "$width" ]]; then
        printf '%s' "$str"
    elif [[ "$width" -lt 4 ]]; then
        printf '%s' "${str:0:$width}"
    else
        printf '%s…' "${str:0:$(( width - 1 ))}"
    fi
}

# Format integer with thousands separator
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

# Format minutes → "Xh Ym" or "Xm" or "—"
human_min() {
    local m="${1:-0}"
    [[ -z "$m" || "$m" == "null" || "$m" == "0" ]] && { printf '—'; return 0; }
    [[ "$m" =~ ^[0-9]+$ ]] || { printf '—'; return 0; }
    if [[ "$m" -ge 60 ]]; then
        local h=$(( m / 60 ))
        local r=$(( m % 60 ))
        if [[ "$r" -eq 0 ]]; then
            printf '%dh' "$h"
        else
            printf '%dh%dm' "$h" "$r"
        fi
    else
        printf '%dm' "$m"
    fi
    return 0
}

# Format dollar amount
human_cost() {
    local c="$1"
    if [[ -z "$c" || "$c" == "null" ]]; then
        printf '$—'
    else
        awk -v v="$c" 'BEGIN{printf "$%.2f", v}'
    fi
    return 0
}

# Color a percentage by threshold (0-30 green, 30-65 yellow, 65+ red)
color_pct() {
    local p="${1:-0}"
    [[ "$p" =~ ^[0-9]+$ ]] || p=0
    if   [[ "$p" -ge 65 ]]; then printf '%s' "$C_RED"
    elif [[ "$p" -ge 30 ]]; then printf '%s' "$C_YELLOW"
    else                          printf '%s' "$C_GREEN"
    fi
    return 0
}

# Color a hit rate by goodness (90+ green, 70-90 yellow, <70 red)
color_hit() {
    local p="${1:-0}"
    [[ "$p" =~ ^[0-9]+$ ]] || p=0
    if   [[ "$p" -ge 90 ]]; then printf '%s' "$C_GREEN"
    elif [[ "$p" -ge 70 ]]; then printf '%s' "$C_YELLOW"
    else                          printf '%s' "$C_RED"
    fi
    return 0
}

# Calculate elapsed seconds from epoch → human ("5m ago", "2h ago")
elapsed_since() {
    local ts="$1"
    local now=$HUD_NOW_EPOCH
    [[ -z "$ts" ]] && { printf '—'; return 0; }
    [[ "$ts" =~ ^[0-9]+$ ]] || ts=0
    local diff=$(( now - ts ))
    if   [[ "$diff" -lt 60 ]];   then printf '%ds ago' "$diff"
    elif [[ "$diff" -lt 3600 ]]; then printf '%dm ago' "$(( diff / 60 ))"
    elif [[ "$diff" -lt 86400 ]];then printf '%dh%dm ago' "$(( diff / 3600 ))" "$(( (diff % 3600) / 60 ))"
    else                              printf '%dd ago' "$(( diff / 86400 ))"
    fi
    return 0
}

# Get terminal width (cached)
term_cols() {
    local cols
    cols=$(tput cols 2>/dev/null) || cols=120
    printf '%d' "$cols"
    return 0
}
term_rows() {
    local rows
    rows=$(tput lines 2>/dev/null) || rows=40
    printf '%d' "$rows"
    return 0
}

# ─── DATA LOADERS ──────────────────────────────────────────────────────────

load_state_hook() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return 0
    local json
    json=$(cat "$JICM_STATE_HOOK_FILE" 2>/dev/null) || return 0
    [[ -z "$json" ]] && return 0
    HK_VERSION=$(jq -r '.version // ""' <<<"$json" 2>/dev/null)
    HK_TS=$(jq -r '.ts // ""' <<<"$json" 2>/dev/null)
    HK_SESSION=$(jq -r '.session_id // ""' <<<"$json" 2>/dev/null)
    HK_MODEL=$(jq -r '.model_id // ""' <<<"$json" 2>/dev/null)
    HK_TOKENS=$(jq -r '.tokens // 0' <<<"$json" 2>/dev/null)
    HK_INPUT=$(jq -r '.input_tokens // 0' <<<"$json" 2>/dev/null)
    HK_CACHE_READ=$(jq -r '.cache_read_tokens // 0' <<<"$json" 2>/dev/null)
    HK_CACHE_CREATE=$(jq -r '.cache_creation_tokens // 0' <<<"$json" 2>/dev/null)
    HK_CACHE_5M=$(jq -r '.cache_creation_5m_tokens // 0' <<<"$json" 2>/dev/null)
    HK_CACHE_1H=$(jq -r '.cache_creation_1h_tokens // 0' <<<"$json" 2>/dev/null)
    HK_CACHE_HIT=$(jq -r '.cache_hit_rate // 0' <<<"$json" 2>/dev/null)
    HK_OUTPUT_LAST=$(jq -r '.output_tokens_last // 0' <<<"$json" 2>/dev/null)
    HK_WINDOW=$(jq -r '.context_window_size // 1000000' <<<"$json" 2>/dev/null)
    HK_SOFT_TOKENS=$(jq -r '.soft_threshold_tokens // 250000' <<<"$json" 2>/dev/null)
    HK_HARD_TOKENS=$(jq -r '.hard_threshold_tokens // 300000' <<<"$json" 2>/dev/null)
    HK_BURN=$(jq -r '.burn_rate_tpm // 0' <<<"$json" 2>/dev/null)
    HK_SOFT_ETA=$(jq -r '.soft_eta_min // 0' <<<"$json" 2>/dev/null)
    HK_HARD_ETA=$(jq -r '.hard_eta_min // 0' <<<"$json" 2>/dev/null)
    HK_USED_PCT=$(jq -r '.used_percentage // 0' <<<"$json" 2>/dev/null)
    HK_COST=$(jq -r '.cost_usd // ""' <<<"$json" 2>/dev/null)
    HK_RATE5H=$(jq -r '.rate_5h_pct // ""' <<<"$json" 2>/dev/null)
    HK_RATE7D=$(jq -r '.rate_7d_pct // ""' <<<"$json" 2>/dev/null)
    HK_ACTION=$(jq -r '.action // "WATCHING"' <<<"$json" 2>/dev/null)
    HK_PENDING=$(jq -r '.pending_action // ""' <<<"$json" 2>/dev/null)
    HK_TRANSCRIPT=$(jq -r '.transcript_path // ""' <<<"$json" 2>/dev/null)
    refresh_tokens_from_jsonl
    return 0
}

# Refresh tokens from JSONL latest assistant entry. State file lags because
# jicm-gate.sh writes only on UserPromptSubmit; tool-loops and assistant-only
# turns don't update it. JSONL has usage on every assistant entry, so the
# canonical sum (input + cache_read + cache_creation) tracks TUI more closely
# than the state-file snapshot.
# Streaming (tail -r | jq | head -n1) exits on first match for sub-10ms cost
# even on multi-MB transcripts.
refresh_tokens_from_jsonl() {
    [[ -z "$HK_TRANSCRIPT" || ! -f "$HK_TRANSCRIPT" ]] && return 0
    local usage_line
    usage_line=$(tail -r "$HK_TRANSCRIPT" 2>/dev/null \
        | jq -r 'select(.type=="assistant" and .message.usage != null) | "\(.message.usage.input_tokens // 0) \(.message.usage.cache_read_input_tokens // 0) \(.message.usage.cache_creation_input_tokens // 0)"' 2>/dev/null \
        | head -n1)
    [[ -z "$usage_line" ]] && return 0
    local lt_in lt_cr lt_cc
    read -r lt_in lt_cr lt_cc <<<"$usage_line"
    [[ -z "$lt_in" ]] && return 0
    local live_total=$(( lt_in + lt_cr + lt_cc ))
    # Prefer live total when it exceeds state-file snapshot (state file is the
    # last UPS snapshot; live JSONL reflects most recent assistant turn).
    if [[ "$live_total" -gt "$HK_TOKENS" ]]; then
        HK_TOKENS="$live_total"
        HK_INPUT="$lt_in"
        HK_CACHE_READ="$lt_cr"
        HK_CACHE_CREATE="$lt_cc"
        if [[ "$HK_WINDOW" -gt 0 ]]; then
            HK_USED_PCT=$(( live_total * 100 / HK_WINDOW ))
        fi
    fi
    return 0
}

load_state_legacy() {
    [[ -f "$JICM_STATE_FILE" ]] || return 0
    local txt
    txt=$(cat "$JICM_STATE_FILE" 2>/dev/null) || return 0
    LG_STATE=$(grep -E '^state:' <<<"$txt" | head -1 | awk -F': ' '{print $2}' | tr -d '\r' )
    LG_TS=$(grep -E '^timestamp:' <<<"$txt" | head -1 | awk -F': ' '{print $2}' | tr -d '\r')
    LG_SHIM=$(grep -E '^v79_shim:' <<<"$txt" | head -1 | awk -F': ' '{print $2}' | tr -d '\r')
    [[ -z "$LG_STATE" ]] && LG_STATE="WATCHING"
    return 0
}

load_compression_metadata() {
    [[ -f "$JICM_METADATA_FILE" ]] || return 0
    local json
    json=$(cat "$JICM_METADATA_FILE" 2>/dev/null) || return 0
    [[ -z "$json" ]] && return 0
    CM_TS=$(jq -r '.timestamp // ""' <<<"$json" 2>/dev/null)
    CM_DUR=$(jq -r '.duration_seconds // 0' <<<"$json" 2>/dev/null)
    CM_METHOD=$(jq -r '.method // ""' <<<"$json" 2>/dev/null)
    CM_LLM=$(jq -r '.llm_model // ""' <<<"$json" 2>/dev/null)
    CM_JSONL=$(jq -r '.jsonl_file // ""' <<<"$json" 2>/dev/null)
    CM_LINES=$(jq -r '.output_lines // 0' <<<"$json" 2>/dev/null)
    CM_BYTES=$(jq -r '.output_bytes // 0' <<<"$json" 2>/dev/null)
    CM_USER_MSGS=$(jq -r '.user_msg_count // 0' <<<"$json" 2>/dev/null)
    CM_STALE_MIN=$(jq -r '.session_state_stale_minutes // 0' <<<"$json" 2>/dev/null)
    CM_NLP_APPLIED=$(jq -r '.nlp_compression_applied // false' <<<"$json" 2>/dev/null)
    CM_NLP_BEFORE=$(jq -r '.nlp_tokens_before // 0' <<<"$json" 2>/dev/null)
    CM_NLP_AFTER=$(jq -r '.nlp_tokens_after // 0' <<<"$json" 2>/dev/null)
    CM_NLP_RATIO=$(jq -r '.nlp_compression_ratio // ""' <<<"$json" 2>/dev/null)
    return 0
}

load_watcher_proc() {
    if [[ -f "$JICM_PID_FILE" ]]; then
        W_PID=$(cat "$JICM_PID_FILE" 2>/dev/null | tr -d '[:space:]')
        if [[ -n "$W_PID" ]] && [[ "$W_PID" =~ ^[0-9]+$ ]] && kill -0 "$W_PID" 2>/dev/null; then
            W_ALIVE="true"
            local ps_line
            ps_line=$(ps -o pid=,etime=,%cpu=,rss= -p "$W_PID" 2>/dev/null | head -1 | awk '{$1=$1; print}')
            if [[ -n "$ps_line" ]]; then
                W_UPTIME=$(awk '{print $2}' <<<"$ps_line")
                W_CPU=$(awk '{print $3}' <<<"$ps_line")
                W_RSS=$(awk '{print $4}' <<<"$ps_line")
            fi
        fi
    fi
    return 0
}

load_aion_quartet() {
    # Watcher
    if [[ "$W_ALIVE" == "true" ]]; then
        Q_WATCHER_PID="$W_PID"
        Q_WATCHER_UP="$W_UPTIME"
    fi
    # Ennoia
    local enn
    enn=$(pgrep -f "ennoia.sh" | head -1 2>/dev/null)
    if [[ -n "$enn" ]]; then
        Q_ENNOIA_PID="$enn"
        Q_ENNOIA_UP=$(ps -o etime= -p "$enn" 2>/dev/null | tr -d '[:space:]')
    fi
    # Virgil
    local vir
    vir=$(pgrep -f "virgil.sh" | head -1 2>/dev/null)
    if [[ -n "$vir" ]]; then
        Q_VIRGIL_PID="$vir"
        Q_VIRGIL_UP=$(ps -o etime= -p "$vir" 2>/dev/null | tr -d '[:space:]')
    fi
    # Commands
    local cmd
    cmd=$(pgrep -f "command-handler.sh" | head -1 2>/dev/null)
    if [[ -n "$cmd" ]]; then
        Q_COMMANDS_PID="$cmd"
        Q_COMMANDS_UP=$(ps -o etime= -p "$cmd" 2>/dev/null | tr -d '[:space:]')
    fi
    return 0
}

load_signals() {
    [[ -f "$JICM_CLEAR_SIG"      ]] && SIG_CLEAR="true"      || SIG_CLEAR="false"
    [[ -f "$JICM_RESUME_SIG"     ]] && SIG_RESUME="true"     || SIG_RESUME="false"
    [[ -f "$JICM_COMPRESSION_SIG" ]] && SIG_COMP_DONE="true" || SIG_COMP_DONE="false"
    [[ -f "$JICM_COMPRESSION_GUARD" ]] && SIG_COMP_GUARD="true" || SIG_COMP_GUARD="false"
    [[ -f "$JICM_EXIT_SIG"       ]] && SIG_EXIT="true"       || SIG_EXIT="false"
    [[ -f "$JICM_SLEEP_SIG"      ]] && SIG_SLEEP="true"      || SIG_SLEEP="false"
    if [[ -f "$JICM_COMMAND_SIG" ]]; then
        SIG_COMMAND=$(cat "$JICM_COMMAND_SIG" 2>/dev/null | jq -r '.command // ""' 2>/dev/null)
        [[ -z "$SIG_COMMAND" ]] && SIG_COMMAND="(unparseable)"
    else
        SIG_COMMAND=""
    fi
    return 0
}

load_log_tail() {
    HUD_LOG_LINES=()
    [[ -f "$JICM_LOG_FILE" ]] || return 0
    local line
    while IFS= read -r line; do
        HUD_LOG_LINES+=("$line")
    done < <(tail -n "$HUD_LOG_TAIL" "$JICM_LOG_FILE" 2>/dev/null)
    # Cycle count via grep
    HUD_CYCLE_COUNT=$(grep -c "cycle: complete" "$JICM_LOG_FILE" 2>/dev/null || echo 0)
    return 0
}

load_nlp_metadata() {
    NLP_APPLIED="false"; NLP_RATIO=""; NLP_MODE=""
    NLP_BEFORE=0; NLP_AFTER=0
    [[ -f "$JICM_NLP_META" ]] || return 0
    local json
    json=$(cat "$JICM_NLP_META" 2>/dev/null) || return 0
    [[ -z "$json" ]] && return 0
    NLP_APPLIED=$(jq -r '.nlp_compression_applied // false' <<<"$json" 2>/dev/null)
    NLP_BEFORE=$(jq -r '.nlp_tokens_before // 0' <<<"$json" 2>/dev/null)
    NLP_AFTER=$(jq -r '.nlp_tokens_after // 0' <<<"$json" 2>/dev/null)
    NLP_RATIO=$(jq -r '.nlp_compression_ratio // ""' <<<"$json" 2>/dev/null)
    NLP_MODE=$(jq -r '.nlp_mode // ""' <<<"$json" 2>/dev/null)
    return 0
}

load_pulse_counts() {
    HUD_PULSE_OPEN_TOTAL=-1
    HUD_PULSE_OPEN_JARVIS=-1
    HUD_PULSE_OPEN_AIFRED=-1
    if cache_fresh "$HUD_PULSE_CACHE" "$HUD_PULSE_TTL" 2>/dev/null; then
        IFS='|' read -r HUD_PULSE_OPEN_TOTAL HUD_PULSE_OPEN_JARVIS HUD_PULSE_OPEN_AIFRED < "$HUD_PULSE_CACHE" 2>/dev/null
        return 0
    fi
    if command -v curl >/dev/null 2>&1; then
        local total jarvis aifred
        total=$(curl -s --max-time 1 "$HUD_PULSE_URL_OPEN" 2>/dev/null | jq -r '.tasks | length // 0' 2>/dev/null)
        jarvis=$(curl -s --max-time 1 "$HUD_PULSE_URL_JARVIS" 2>/dev/null | jq -r '.tasks | length // 0' 2>/dev/null)
        aifred=$(curl -s --max-time 1 "$HUD_PULSE_URL_AIFRED" 2>/dev/null | jq -r '.tasks | length // 0' 2>/dev/null)
        [[ -z "$total" ]] && total=-1
        [[ -z "$jarvis" ]] && jarvis=-1
        [[ -z "$aifred" ]] && aifred=-1
        echo "${total}|${jarvis}|${aifred}" > "$HUD_PULSE_CACHE"
        HUD_PULSE_OPEN_TOTAL=$total
        HUD_PULSE_OPEN_JARVIS=$jarvis
        HUD_PULSE_OPEN_AIFRED=$aifred
    fi
    return 0
}

load_project_status() {
    HUD_PROJECT_STATUS=""
    [[ -f "$JICM_SESSION_STATE_DOC" ]] || return 0
    HUD_PROJECT_STATUS=$(grep -m1 -E '^\*\*Status\*\*:' "$JICM_SESSION_STATE_DOC" 2>/dev/null \
        | sed -E 's/^\*\*Status\*\*:[[:space:]]*//; s/\*\*//g' | head -c 180)
    return 0
}

load_git_state() {
    HUD_GIT_BRANCH=""
    HUD_GIT_AHEAD=0
    HUD_GIT_DIRTY=0
    HUD_GIT_BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null)
    if [[ -n "$HUD_GIT_BRANCH" ]]; then
        HUD_GIT_AHEAD=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-list --count "@{upstream}..HEAD" 2>/dev/null || echo 0)
        local dirty
        dirty=$(cd "$PROJECT_DIR" 2>/dev/null && git status --porcelain 2>/dev/null | wc -l | tr -d '[:space:]')
        HUD_GIT_DIRTY=${dirty:-0}
    fi
    return 0
}

# Cache freshness helper (used by load_pulse_counts)
cache_fresh() {
    local file="$1" ttl="$2"
    [[ -f "$file" ]] || return 1
    local mtime now age
    mtime=$(stat -f %m "$file" 2>/dev/null) || return 1
    now=$(date +%s)
    age=$(( now - mtime ))
    [[ "$age" -lt "$ttl" ]]
}

load_all() {
    HUD_NOW_EPOCH=$(date +%s)
    HUD_NOW_FMT=$(date '+%Y-%m-%d %H:%M:%S %Z')
    if [[ "$HUD_DEMO_MODE" != "true" ]]; then
        load_state_hook
        load_state_legacy
        load_compression_metadata
        load_nlp_metadata
        load_watcher_proc
        load_aion_quartet
        load_signals
        load_log_tail
        load_pulse_counts
        load_project_status
        load_git_state
    fi
    return 0
}

# ─── RENDER PRIMITIVES ─────────────────────────────────────────────────────

# Clear screen + cursor home
# In live/interactive-demo loops we set HUD_IN_ALT_SCREEN=true and use cursor-home
# only (no \033[2J) plus synchronized-output (DEC mode 2026) so the entire
# frame draws atomically — eliminates the mid-frame blank that produces
# visible flicker on terminals that emit between writes. The 2026h/2026l
# sequences are no-ops on terminals that don't support them (xterm minimal),
# so this is forward-compatible. One-shot modes still get a full clear.
clear_screen() {
    if [[ "${HUD_IN_ALT_SCREEN:-false}" == "true" ]]; then
        printf '\033[?2026h\033[H'
    else
        printf '\033[H\033[2J'
    fi
}

# Render a horizontal divider line of width N with optional title
hr_line() {
    local width="${1:-80}" title="${2:-}" left="${3:-$B_TR2}" right="${4:-$B_TL2}"
    if [[ -z "$title" ]]; then
        printf '%s%s%s' "$left" "$(repeat_char "$B_H" $(( width - 2 )))" "$right"
    else
        local title_padded=" $title "
        local title_len=${#title_padded}
        local total_pad=$(( width - 2 - title_len ))
        [[ "$total_pad" -lt 2 ]] && total_pad=2
        local pad_left=$(( total_pad / 2 ))
        local pad_right=$(( total_pad - pad_left ))
        printf '%s%s%s%s%s' \
            "$left" \
            "$(repeat_char "$B_H" "$pad_left")" \
            "$title_padded" \
            "$(repeat_char "$B_H" "$pad_right")" \
            "$right"
    fi
    return 0
}

# Top of dashboard
top_bar() {
    local width="${1:-80}"
    printf '%s%s%s%s%s%s\n' "$C_HEADER$C_BOLD" "$B_TL" \
        "$(repeat_char "$B_H" $(( width - 2 )))" "$B_TR" "$C_NC" ""
}

# Bottom of dashboard
bot_bar() {
    local width="${1:-80}"
    printf '%s%s%s%s%s\n' "$C_HEADER$C_BOLD" "$B_BL" \
        "$(repeat_char "$B_H" $(( width - 2 )))" "$B_BR" "$C_NC"
}

# Section divider (├─ TITLE ─┤)
section_hr() {
    local width="${1:-80}" title="${2:-}"
    printf '%s' "$C_HEADER"
    hr_line "$width" "$title" "$B_TR2" "$B_TL2"
    printf '%s\n' "$C_NC"
    return 0
}

# Render a vertical-bordered content row with given left + right column content
content_row() {
    local width="${1:-80}" content="${2:-}"
    local visible_len plain
    plain=$(printf '%b' "$content" | sed -E 's/\x1b\[[0-9;]*m//g')
    visible_len=${#plain}
    local pad=$(( width - 2 - visible_len ))
    [[ "$pad" -lt 0 ]] && pad=0
    printf '%s%s%s%b%s%s%s%s\n' \
        "$C_HEADER" "$B_V" "$C_NC" \
        "$content" \
        "$(repeat_char ' ' "$pad")" \
        "$C_HEADER" "$B_V" "$C_NC"
    return 0
}

# Build a progress bar at given pct, with soft/hard/auto tick markers
build_bar() {
    local width="${1:-40}" used_pct="${2:-0}" soft_pct="${3:-30}" hard_pct="${4:-65}" auto_pct="${5:-70}"
    [[ "$used_pct" =~ ^[0-9]+$ ]] || used_pct=0
    [[ "$used_pct" -gt 100 ]] && used_pct=100
    local soft_pos=$(( soft_pct * width / 100 ))
    local hard_pos=$(( hard_pct * width / 100 ))
    local auto_pos=$(( auto_pct * width / 100 ))
    local filled=$(( used_pct * width / 100 ))
    local i=0
    local out=""
    while [[ "$i" -lt "$width" ]]; do
        if [[ "$i" -eq "$soft_pos" ]]; then
            out+="${C_YELLOW}${TICK_SOFT}${C_NC}"
        elif [[ "$i" -eq "$hard_pos" ]]; then
            out+="${C_RED}${TICK_HARD}${C_NC}"
        elif [[ "$i" -eq "$auto_pos" ]]; then
            out+="${C_MAGENTA}${TICK_AUTO}${C_NC}"
        elif [[ "$i" -lt "$filled" ]]; then
            if [[ "$i" -ge "$hard_pos" ]]; then
                out+="${C_RED}${BLOCK_FULL}${C_NC}"
            elif [[ "$i" -ge "$soft_pos" ]]; then
                out+="${C_YELLOW}${BLOCK_75}${C_NC}"
            else
                out+="${C_GREEN}${BLOCK_50}${C_NC}"
            fi
        else
            out+="${C_DGRAY}${BLOCK_25}${C_NC}"
        fi
        i=$(( i + 1 ))
    done
    printf '%s' "$out"
    return 0
}

# Format model id short (drop "claude-" prefix; keep 1M marker)
model_short() {
    local m="${HK_MODEL:-unknown}"
    local s="${m#claude-}"
    case "$s" in
        *\[1m\]) s="${s%\[1m\]}·1M" ;;
    esac
    printf '%s' "$s"
    return 0
}

# Action color map
action_color() {
    case "$1" in
        HARD_HALT)  printf '%s' "$C_RED$C_BOLD" ;;
        SOFT_NUDGE) printf '%s' "$C_YELLOW$C_BOLD" ;;
        CLEARING)   printf '%s' "$C_MAGENTA$C_BOLD" ;;
        RESTORING)  printf '%s' "$C_BLUE$C_BOLD" ;;
        WATCHING)   printf '%s' "$C_GREEN$C_BOLD" ;;
        *)          printf '%s' "$C_GRAY" ;;
    esac
    return 0
}

action_icon() {
    case "$1" in
        HARD_HALT)  printf '%s' "⛔" ;;
        SOFT_NUDGE) printf '%s' "⚠️ " ;;
        CLEARING)   printf '%s' "🌀" ;;
        RESTORING)  printf '%s' "♻️ " ;;
        WATCHING)   printf '%s' "🟢" ;;
        *)          printf '%s' "·" ;;
    esac
    return 0
}

# ─── RENDER SECTIONS ───────────────────────────────────────────────────────

render_header() {
    local width="$1"
    local action_c
    action_c=$(action_color "$HK_ACTION")
    local icon
    icon=$(action_icon "$HK_ACTION")
    local sess_short="${HK_SESSION:0:8}"
    [[ -z "$sess_short" ]] && sess_short="—"

    top_bar "$width"

    # Title row
    local title="JARVIS WATCHER HUD v$HUD_VERSION"
    local right=" $HUD_NOW_FMT "
    local mid=" ${icon} ${action_c}${HK_ACTION}${C_NC}${C_HEADER} | session ${sess_short} | watcher PID ${W_PID:-?} (${W_UPTIME}) "

    local title_len=${#title}
    local right_len=${#HUD_NOW_FMT}
    right_len=$(( right_len + 2 ))
    local mid_plain=" ${HK_ACTION} | session ${sess_short} | watcher PID ${W_PID:-?} (${W_UPTIME}) "
    local mid_len=${#mid_plain}
    mid_len=$(( mid_len + 2 ))   # icon space

    local pad_total=$(( width - 2 - title_len - mid_len - right_len ))
    [[ "$pad_total" -lt 2 ]] && pad_total=2
    local pad_l=$(( pad_total / 2 ))
    local pad_r=$(( pad_total - pad_l ))

    printf '%s%s%s %s%s%s%b%s%s%s%s%s%s%s\n' \
        "$C_HEADER$C_BOLD" "$B_V" "$C_NC" \
        "$C_VIOLET$C_BOLD$title$C_NC" \
        "$(repeat_char ' ' "$pad_l")" \
        "$C_HEADER" \
        "$mid" \
        "$C_NC" \
        "$(repeat_char ' ' "$pad_r")" \
        "$C_LGRAY$right$C_NC" \
        "$C_HEADER$C_BOLD" "$B_V" "$C_NC" "$C_NC"
    return 0
}

render_context_section() {
    local width="$1"
    local inner=$(( width - 4 ))
    local bar_width=$(( width - 14 ))
    [[ "$bar_width" -lt 30 ]] && bar_width=30

    local soft_pct hard_pct
    if [[ "$HK_WINDOW" -gt 0 ]]; then
        soft_pct=$(( HK_SOFT_TOKENS * 100 / HK_WINDOW ))
        hard_pct=$(( HK_HARD_TOKENS * 100 / HK_WINDOW ))
    else
        soft_pct=30; hard_pct=65
    fi

    local pct_color
    pct_color=$(color_pct "$HK_USED_PCT")
    local bar
    bar=$(build_bar "$bar_width" "$HK_USED_PCT" "$soft_pct" "$hard_pct" 70)

    section_hr "$width" "CONTEXT WINDOW"

    local model
    model=$(model_short)
    content_row "$width" "  ${C_LABEL}Model:${C_NC} ${C_BOLD}${model}${C_NC}    ${C_LABEL}Window:${C_NC} $(human_int "$HK_WINDOW")    ${C_LABEL}Tokens used:${C_NC} ${pct_color}${C_BOLD}$(human_int "$HK_TOKENS")${C_NC} ${C_LABEL}(${HK_USED_PCT}%)${C_NC}"
    content_row "$width" ""
    content_row "$width" "  [${bar}]"
    content_row "$width" "  ${C_GRAY}0%${C_NC}                                ${C_YELLOW}${TICK_SOFT} soft ${soft_pct}%${C_NC}    ${C_RED}${TICK_HARD} hard ${hard_pct}%${C_NC}    ${C_MAGENTA}${TICK_AUTO} auto 70%${C_NC}                              ${C_GRAY}100%${C_NC}"
    content_row "$width" ""
    content_row "$width" "  ${C_LABEL}Burn rate:${C_NC} ${C_VALUE}$(human_int "$HK_BURN")${C_NC}/min   ${C_LABEL}Soft ETA:${C_NC} ${C_VALUE}$(human_min "$HK_SOFT_ETA")${C_NC}   ${C_LABEL}Hard ETA:${C_NC} ${C_VALUE}$(human_min "$HK_HARD_ETA")${C_NC}   ${C_LABEL}Last turn out:${C_NC} ${C_VALUE}$(human_int "$HK_OUTPUT_LAST")${C_NC} tok"
    return 0
}

render_cache_cost_row() {
    local width="$1"
    local half=$(( (width - 3) / 2 ))
    section_hr "$width" "CACHE & COST"

    # Cache hit ratio as percent integer
    local hit_pct
    hit_pct=$(awk -v h="$HK_CACHE_HIT" 'BEGIN{printf "%d", h*100}')
    local hit_color
    hit_color=$(color_hit "$hit_pct")

    local cost_disp rate5_disp rate7_disp
    if [[ -z "$HK_COST" || "$HK_COST" == "null" ]]; then cost_disp="${C_DIM}—${C_NC}"; else cost_disp="${C_VALUE}$(human_cost "$HK_COST")${C_NC}"; fi
    if [[ -z "$HK_RATE5H" || "$HK_RATE5H" == "null" ]]; then rate5_disp="${C_DIM}—${C_NC}"; else rate5_disp="$(color_pct "$HK_RATE5H")${HK_RATE5H}%${C_NC}"; fi
    if [[ -z "$HK_RATE7D" || "$HK_RATE7D" == "null" ]]; then rate7_disp="${C_DIM}—${C_NC}"; else rate7_disp="$(color_pct "$HK_RATE7D")${HK_RATE7D}%${C_NC}"; fi

    content_row "$width" "  ${C_LABEL}Hit rate:${C_NC} ${hit_color}${C_BOLD}${hit_pct}%${C_NC}   ${C_LABEL}Read:${C_NC} ${C_VALUE}$(human_int "$HK_CACHE_READ")${C_NC}   ${C_LABEL}Create:${C_NC} ${C_VALUE}$(human_int "$HK_CACHE_CREATE")${C_NC} ${C_DIM}(5m: $(human_int "$HK_CACHE_5M") / 1h: $(human_int "$HK_CACHE_1H"))${C_NC}"
    content_row "$width" "  ${C_LABEL}Cost:${C_NC} ${cost_disp}   ${C_LABEL}5h block:${C_NC} ${rate5_disp}   ${C_LABEL}7d window:${C_NC} ${rate7_disp}   ${C_LABEL}eph_1h adoption:${C_NC} ${C_GREEN}100%${C_NC} ${C_DIM}(derived)${C_NC}"
    return 0
}

render_cycles_section() {
    local width="$1"
    section_hr "$width" "JICM CYCLES"

    # Last cycle line
    local last_cycle="—"
    if [[ -n "$CM_TS" ]]; then
        local cm_epoch
        cm_epoch=$(date -juf '%Y-%m-%dT%H:%M:%SZ' "$CM_TS" '+%s' 2>/dev/null) || cm_epoch=0
        local ago
        ago=$(elapsed_since "$cm_epoch")
        last_cycle="${C_VALUE}${CM_TS}${C_NC} ${C_DIM}(${ago})${C_NC}  ${C_LABEL}method:${C_NC} ${C_BOLD}${CM_METHOD}${C_NC}"
        [[ -n "$CM_LLM" && "$CM_LLM" != "null" ]] && last_cycle+="  ${C_LABEL}llm:${C_NC} ${CM_LLM}"
        last_cycle+="  ${C_LABEL}out:${C_NC} ${CM_LINES} lines / $(human_int "$CM_BYTES")B  ${C_LABEL}dur:${C_NC} ${CM_DUR}s"
    fi

    local nlp_line="—"
    if [[ "$CM_NLP_APPLIED" == "true" ]]; then
        nlp_line="${C_LABEL}NLP:${C_NC} ${C_GREEN}applied${C_NC}  ${C_LABEL}before:${C_NC} $(human_int "$CM_NLP_BEFORE") tok  ${C_LABEL}after:${C_NC} $(human_int "$CM_NLP_AFTER") tok  ${C_LABEL}ratio:${C_NC} ${CM_NLP_RATIO}"
    fi

    local user_msgs_disp="—"
    [[ "$CM_USER_MSGS" -gt 0 ]] && user_msgs_disp="${CM_USER_MSGS} user msgs captured"

    content_row "$width" "  ${C_LABEL}Last compression:${C_NC} ${last_cycle}"
    content_row "$width" "  ${nlp_line}    ${C_LABEL}session-state staleness:${C_NC} ${CM_STALE_MIN}m    ${user_msgs_disp}"
    content_row "$width" "  ${C_LABEL}Cycles completed (this log):${C_NC} ${C_BOLD}${HUD_CYCLE_COUNT}${C_NC}    ${C_LABEL}NLP standalone:${C_NC} ${NLP_APPLIED}/${NLP_MODE:-—}   ratio ${NLP_RATIO:-—}   $(human_int "$NLP_BEFORE") → $(human_int "$NLP_AFTER") tok"
    return 0
}

render_signals_quartet_row() {
    local width="$1"
    local half=$(( width / 2 - 1 ))
    section_hr "$width" "SIGNALS (left)  &  AION QUARTET (right)"

    local sig_clear sig_resume sig_comp sig_guard sig_exit sig_sleep sig_cmd
    sig_clear=$([ "$SIG_CLEAR" = "true" ] && printf '%s' "${C_RED}${ICON_HALT} present${C_NC}" || printf '%s' "${C_DIM}absent${C_NC}")
    sig_resume=$([ "$SIG_RESUME" = "true" ] && printf '%s' "${C_BLUE}${ICON_OK} present${C_NC}" || printf '%s' "${C_DIM}absent${C_NC}")
    sig_comp=$([ "$SIG_COMP_DONE" = "true" ] && printf '%s' "${C_GREEN}${ICON_OK} ready${C_NC}" || printf '%s' "${C_DIM}absent${C_NC}")
    sig_guard=$([ "$SIG_COMP_GUARD" = "true" ] && printf '%s' "${C_YELLOW}${C_BOLD}IN PROGRESS${C_NC}" || printf '%s' "${C_DIM}clear${C_NC}")
    sig_exit=$([ "$SIG_EXIT" = "true" ] && printf '%s' "${C_MAGENTA}exit-mode${C_NC}" || printf '%s' "${C_DIM}—${C_NC}")
    sig_sleep=$([ "$SIG_SLEEP" = "true" ] && printf '%s' "${C_VIOLET}sleep${C_NC}" || printf '%s' "${C_DIM}—${C_NC}")
    if [[ -n "$SIG_COMMAND" ]]; then
        sig_cmd="${C_CYAN}${C_BOLD}${SIG_COMMAND}${C_NC}"
    else
        sig_cmd="${C_DIM}—${C_NC}"
    fi

    # Quartet liveness
    local q_w q_e q_v q_c
    if [[ -n "$Q_WATCHER_PID" ]]; then
        q_w="${C_GREEN}${ICON_OK} ALIVE${C_NC} pid ${Q_WATCHER_PID} ${C_DIM}(${Q_WATCHER_UP})${C_NC}"
    else
        q_w="${C_RED}${ICON_FAIL} DOWN${C_NC}"
    fi
    if [[ -n "$Q_ENNOIA_PID" ]]; then
        q_e="${C_GREEN}${ICON_OK} alive${C_NC} pid ${Q_ENNOIA_PID} ${C_DIM}(${Q_ENNOIA_UP})${C_NC}"
    else
        q_e="${C_DIM}sleeping${C_NC}"
    fi
    if [[ -n "$Q_VIRGIL_PID" ]]; then
        q_v="${C_GREEN}${ICON_OK} alive${C_NC} pid ${Q_VIRGIL_PID} ${C_DIM}(${Q_VIRGIL_UP})${C_NC}"
    else
        q_v="${C_DIM}sleeping${C_NC}"
    fi
    if [[ -n "$Q_COMMANDS_PID" ]]; then
        q_c="${C_GREEN}${ICON_OK} alive${C_NC} pid ${Q_COMMANDS_PID} ${C_DIM}(${Q_COMMANDS_UP})${C_NC}"
    else
        q_c="${C_DIM}sleeping${C_NC}"
    fi

    content_row "$width" "  ${C_LABEL}.jicm-clear-now.signal:${C_NC} ${sig_clear}        ${C_LABEL}Watcher:${C_NC}  ${q_w}"
    content_row "$width" "  ${C_LABEL}.jicm-resume-complete:${C_NC}  ${sig_resume}       ${C_LABEL}Ennoia:${C_NC}   ${q_e}"
    content_row "$width" "  ${C_LABEL}.compression-done.signal:${C_NC} ${sig_comp}        ${C_LABEL}Virgil:${C_NC}   ${q_v}"
    content_row "$width" "  ${C_LABEL}.compression-in-progress:${C_NC} ${sig_guard}      ${C_LABEL}Commands:${C_NC} ${q_c}"
    content_row "$width" "  ${C_LABEL}.command-signal:${C_NC} ${sig_cmd}                ${C_LABEL}Exit-mode:${C_NC} ${sig_exit}     ${C_LABEL}Sleep:${C_NC} ${sig_sleep}"
    return 0
}

render_project_pulse_section() {
    local width="$1"
    section_hr "$width" "PROJECT FOCUS  &  PULSE TASKS  &  GIT"

    # Status line — truncated to width-6
    local status_disp
    if [[ -n "$HUD_PROJECT_STATUS" ]]; then
        status_disp=$(truncate_str "$HUD_PROJECT_STATUS" $(( width - 14 )))
    else
        status_disp="${DIM}(no session-state.md status)${NC}"
    fi
    content_row "$width" "  ${C_LABEL}Focus:${C_NC} ${C_VALUE}${status_disp}${C_NC}"

    # Pulse counts (with --/dim if API offline)
    local pulse_disp git_disp
    if [[ "$HUD_PULSE_OPEN_TOTAL" -ge 0 ]]; then
        pulse_disp="${C_LABEL}Pulse open:${C_NC} ${C_BOLD}${HUD_PULSE_OPEN_TOTAL}${C_NC} ${C_DIM}total${C_NC}   ${C_LABEL}agent:jarvis:${C_NC} ${C_VIOLET}${HUD_PULSE_OPEN_JARVIS}${C_NC}   ${C_LABEL}agent:aifred:${C_NC} ${C_PINK}${HUD_PULSE_OPEN_AIFRED}${C_NC}"
    else
        pulse_disp="${C_LABEL}Pulse:${C_NC} ${C_DIM}offline (localhost:8700 unreachable)${C_NC}"
    fi

    if [[ -n "$HUD_GIT_BRANCH" ]]; then
        local ahead_disp=""
        if [[ "$HUD_GIT_AHEAD" -gt 0 ]]; then
            ahead_disp=" ${C_CYAN}↑${HUD_GIT_AHEAD}${C_NC}"
        fi
        local dirty_disp=""
        if [[ "$HUD_GIT_DIRTY" -gt 0 ]]; then
            dirty_disp=" ${C_YELLOW}*${HUD_GIT_DIRTY}${C_NC}"
        fi
        git_disp="${C_LABEL}Git:${C_NC} ${C_TEAL}${HUD_GIT_BRANCH}${C_NC}${ahead_disp}${dirty_disp}"
    else
        git_disp="${C_LABEL}Git:${C_NC} ${C_DIM}—${C_NC}"
    fi

    content_row "$width" "  ${pulse_disp}     ${git_disp}"
    return 0
}

render_thresholds_section() {
    local width="$1"
    section_hr "$width" "THRESHOLDS & CONFIG"
    local soft_p hard_p
    if [[ "$HK_WINDOW" -gt 0 ]]; then
        soft_p=$(( HK_SOFT_TOKENS * 100 / HK_WINDOW ))
        hard_p=$(( HK_HARD_TOKENS * 100 / HK_WINDOW ))
    else
        soft_p=30; hard_p=65
    fi
    content_row "$width" "  ${C_LABEL}SOFT_TOKENS:${C_NC} ${C_VALUE}$(human_int "$HK_SOFT_TOKENS")${C_NC} (${soft_p}%)   ${C_LABEL}HARD_TOKENS:${C_NC} ${C_VALUE}$(human_int "$HK_HARD_TOKENS")${C_NC} (${hard_p}%)   ${C_LABEL}AUTO_COMPACT:${C_NC} ${C_VALUE}70%${C_NC}   ${C_LABEL}WINDOW:${C_NC} ${C_VALUE}$(human_int "$HK_WINDOW")${C_NC}"
    content_row "$width" "  ${C_LABEL}POLL:${C_NC} ${JICM_POLL_INTERVAL:-1}s   ${C_LABEL}IDLE_GRACE:${C_NC} ${JICM_IDLE_GRACE_SEC:-3}s   ${C_LABEL}HALT_ACK:${C_NC} ${JICM_HALT_ACK_TIMEOUT:-60}s   ${C_LABEL}PREP:${C_NC} ${JICM_PREP_TIMEOUT:-300}s   ${C_LABEL}RESUME:${C_NC} ${JICM_RESUME_TIMEOUT:-60}s"
    content_row "$width" "  ${C_LABEL}BACKEND:${C_NC} ${C_VALUE}${JICM_INJECTION_BACKEND:-tmux}${C_NC}   ${C_LABEL}TARGET:${C_NC} ${C_VALUE}${JICM_TMUX_TARGET:-jarvis:0}${C_NC}   ${C_LABEL}LEGACY_STATE:${C_NC} ${C_VALUE}${LG_STATE}${C_NC} ${C_DIM}(shim: ${LG_SHIM})${C_NC}"
    return 0
}

render_log_tail() {
    local width="$1"
    section_hr "$width" "WATCHER LOG (live tail, last $HUD_LOG_TAIL lines)"
    if [[ "${#HUD_LOG_LINES[@]}" -eq 0 ]]; then
        content_row "$width" "  ${C_DIM}(no log entries)${C_NC}"
        return 0
    fi
    local line color
    for line in "${HUD_LOG_LINES[@]}"; do
        # Color-code by content
        case "$line" in
            *"cycle: start"*)            color="$C_VIOLET" ;;
            *"cycle: complete"*)         color="$C_GREEN" ;;
            *"HALT prompt sent"*)        color="$C_YELLOW" ;;
            *"HALT acknowledged"*)       color="$C_GREEN" ;;
            *"prep launching"*|*"prep complete"*) color="$C_CYAN" ;;
            *"/clear sent"*)             color="$C_MAGENTA" ;;
            *"RESUME prompt sent"*)      color="$C_BLUE" ;;
            *"resume signal observed"*)  color="$C_BLUE" ;;
            *"timeout"*|*"abort"*|*"error"*) color="$C_RED" ;;
            *"watcher exiting"*|*"watcher v7.9 started"*) color="$C_BOLD" ;;
            *) color="$C_LGRAY" ;;
        esac
        local truncated
        truncated=$(truncate_str "$line" $(( width - 6 )))
        content_row "$width" "  ${color}${truncated}${C_NC}"
    done
    return 0
}

render_footer() {
    local width="$1"
    local left=" Refresh ${HUD_REFRESH}s  |  Press q to quit  |  HUD v${HUD_VERSION}"
    local right="$JICM_LOG_FILE "
    local r_short
    r_short=$(truncate_str "$right" $(( width / 2 - 4 )))
    local pad=$(( width - 2 - ${#left} - ${#r_short} ))
    [[ "$pad" -lt 1 ]] && pad=1
    printf '%s%s%s%s%s%s%s%s%s%s%s\n' \
        "$C_HEADER" "$B_V" "$C_NC" \
        "$C_DIM" "$left" "$C_NC" \
        "$(repeat_char ' ' "$pad")" \
        "$C_DIM" "$r_short" "$C_NC" \
        "$C_HEADER$B_V$C_NC"
    bot_bar "$width"
    return 0
}

# ─── DASHBOARD ASSEMBLY ────────────────────────────────────────────────────

render_dashboard() {
    local width
    width=$(term_cols)
    [[ "$width" -gt 220 ]] && width=220   # cap for readability

    clear_screen
    render_header "$width"
    render_context_section "$width"
    render_cache_cost_row "$width"
    render_cycles_section "$width"
    render_signals_quartet_row "$width"
    render_project_pulse_section "$width"
    render_thresholds_section "$width"
    render_log_tail "$width"
    render_footer "$width"
    # Erase any rows below the new frame (handles shrinking content from prior frame).
    printf '\033[J'
    # End synchronized-output (DEC mode 2026) — flush the atomic frame.
    # Paired with begin in clear_screen; forms the htop-style render barrier.
    if [[ "${HUD_IN_ALT_SCREEN:-false}" == "true" ]]; then
        printf '\033[?2026l'
    fi
    return 0
}

# ─── DEMO MODE ─────────────────────────────────────────────────────────────

# Set synthetic state values for a given demo state name
synthesize_demo_state() {
    local state="$1"
    HUD_DEMO_MODE="true"
    HUD_NOW_EPOCH=$(date +%s)
    HUD_NOW_FMT=$(date '+%Y-%m-%d %H:%M:%S %Z')
    # Common fields
    HK_VERSION="7.9"
    HK_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    HK_SESSION="demo$(printf '%07d' $(( RANDOM * 7 )))-2999-4a90-99ab-83c0abe719e6"
    HK_MODEL="claude-opus-4-7[1m]"
    HK_WINDOW=1000000
    HK_SOFT_TOKENS=250000
    HK_HARD_TOKENS=300000
    HK_TRANSCRIPT="/Users/nathanielcannon/.claude/projects/.../demo.jsonl"
    LG_SHIM="true"
    Q_WATCHER_PID="74731"; Q_WATCHER_UP="01:42:03"
    Q_ENNOIA_PID=""; Q_ENNOIA_UP=""
    Q_VIRGIL_PID="78601"; Q_VIRGIL_UP="01:41:55"
    Q_COMMANDS_PID="78611"; Q_COMMANDS_UP="01:41:50"
    W_PID="74731"; W_ALIVE="true"; W_UPTIME="01:42:03"; W_CPU="0.1"; W_RSS="2544"

    # State-specific synthesis
    case "$state" in
        idle|1)
            HK_TOKENS=145200; HK_USED_PCT=14
            HK_INPUT=8; HK_CACHE_READ=139800; HK_CACHE_CREATE=5400
            HK_CACHE_5M=0; HK_CACHE_1H=5400
            HK_CACHE_HIT="0.9627"; HK_OUTPUT_LAST=4231
            HK_BURN=620; HK_SOFT_ETA=250; HK_HARD_ETA=816
            HK_COST="3.42"; HK_RATE5H=18; HK_RATE7D=42
            HK_ACTION="WATCHING"; HK_PENDING=""
            LG_STATE="WATCHING"
            CM_TS="2026-05-03T03:25:13Z"; CM_DUR=11; CM_METHOD="llm-enriched"
            CM_LLM="qwen3:8b"; CM_LINES=212; CM_BYTES=18143
            CM_USER_MSGS=10; CM_STALE_MIN=42
            CM_NLP_APPLIED="true"; CM_NLP_BEFORE=4012; CM_NLP_AFTER=4012; CM_NLP_RATIO="1.00"
            SIG_CLEAR="false"; SIG_RESUME="false"; SIG_COMP_DONE="false"
            SIG_COMP_GUARD="false"; SIG_COMMAND=""; SIG_EXIT="false"; SIG_SLEEP="false"
            HUD_LOG_LINES=(
                "2026-05-03T06:22:19Z idle checkpoint #218"
                "2026-05-03T06:22:18Z state-hook write: tokens=145200, action=WATCHING"
                "2026-05-03T06:21:18Z state-hook write: tokens=144980, action=WATCHING"
                "2026-05-03T06:20:17Z idle checkpoint #217"
                "2026-05-03T03:25:13Z cycle: complete (legacy state: WATCHING)"
                "2026-05-03T03:25:13Z cycle: RESUME prompt sent (legacy state: RESTORING)"
                "2026-05-03T03:25:13Z cycle: resume signal observed"
                "2026-05-03T03:25:08Z cycle: /clear sent (legacy state: CLEARING)"
                "2026-05-03T03:25:07Z cycle: prep complete"
                "2026-05-03T03:24:56Z cycle: launching prep script"
                "2026-05-03T03:24:55Z cycle: HALT acknowledged"
                "2026-05-03T03:24:50Z cycle: HALT prompt sent"
            )
            ;;
        soft|soft_nudge|2)
            HK_TOKENS=312800; HK_USED_PCT=31
            HK_INPUT=2400; HK_CACHE_READ=300100; HK_CACHE_CREATE=10300
            HK_CACHE_5M=2100; HK_CACHE_1H=10300
            HK_CACHE_HIT="0.9596"; HK_OUTPUT_LAST=8920
            HK_BURN=1840; HK_SOFT_ETA=0; HK_HARD_ETA=183
            HK_COST="6.18"; HK_RATE5H=44; HK_RATE7D=51
            HK_ACTION="SOFT_NUDGE"; HK_PENDING=""
            LG_STATE="WATCHING"
            CM_TS="2026-05-03T03:25:13Z"; CM_DUR=11; CM_METHOD="llm-enriched"
            CM_LLM="qwen3:8b"; CM_LINES=212; CM_BYTES=18143
            CM_USER_MSGS=14; CM_STALE_MIN=180
            CM_NLP_APPLIED="true"; CM_NLP_BEFORE=4012; CM_NLP_AFTER=4012; CM_NLP_RATIO="1.00"
            SIG_CLEAR="false"; SIG_RESUME="false"; SIG_COMP_DONE="false"
            SIG_COMP_GUARD="false"; SIG_COMMAND=""; SIG_EXIT="false"; SIG_SLEEP="false"
            HUD_LOG_LINES=(
                "2026-05-03T06:22:19Z state-hook write: tokens=312800, action=SOFT_NUDGE"
                "2026-05-03T06:22:18Z gate: SOFT_NUDGE crossed at tokens=312800 (threshold 250000)"
                "2026-05-03T06:21:18Z state-hook write: tokens=298400, action=WATCHING"
                "2026-05-03T06:20:17Z idle checkpoint #217"
                "2026-05-03T03:25:13Z cycle: complete (legacy state: WATCHING)"
            )
            ;;
        hard|hard_halt|3)
            HK_TOKENS=678200; HK_USED_PCT=67
            HK_INPUT=14200; HK_CACHE_READ=650400; HK_CACHE_CREATE=13600
            HK_CACHE_5M=3200; HK_CACHE_1H=13600
            HK_CACHE_HIT="0.9590"; HK_OUTPUT_LAST=12044
            HK_BURN=2840; HK_SOFT_ETA=0; HK_HARD_ETA=0
            HK_COST="14.92"; HK_RATE5H=72; HK_RATE7D=68
            HK_ACTION="HARD_HALT"; HK_PENDING="HALT_AFTER_RESPONSE"
            LG_STATE="WATCHING"
            CM_TS="2026-05-03T03:25:13Z"; CM_DUR=11; CM_METHOD="llm-enriched"
            CM_LLM="qwen3:8b"; CM_LINES=212; CM_BYTES=18143
            CM_USER_MSGS=42; CM_STALE_MIN=420
            CM_NLP_APPLIED="true"; CM_NLP_BEFORE=4012; CM_NLP_AFTER=3812; CM_NLP_RATIO="0.95"
            SIG_CLEAR="true"; SIG_RESUME="false"; SIG_COMP_DONE="false"
            SIG_COMP_GUARD="false"; SIG_COMMAND=""; SIG_EXIT="false"; SIG_SLEEP="false"
            HUD_LOG_LINES=(
                "2026-05-03T06:22:19Z stop: HARD_HALT signal written (.jicm-clear-now.signal)"
                "2026-05-03T06:22:18Z state-hook write: tokens=678200, action=HARD_HALT"
                "2026-05-03T06:22:18Z gate: HARD_HALT crossed at tokens=678200 (threshold 300000)"
                "2026-05-03T06:21:18Z state-hook write: tokens=664500, action=HARD_HALT"
                "2026-05-03T06:20:17Z state-hook write: tokens=655100, action=HARD_HALT"
                "2026-05-03T06:19:14Z state-hook write: tokens=648400, action=SOFT_NUDGE"
                "2026-05-03T06:18:11Z state-hook write: tokens=635800, action=SOFT_NUDGE"
            )
            ;;
        clearing|4)
            HK_TOKENS=689400; HK_USED_PCT=68
            HK_INPUT=8200; HK_CACHE_READ=668000; HK_CACHE_CREATE=13200
            HK_CACHE_5M=2600; HK_CACHE_1H=13200
            HK_CACHE_HIT="0.9700"; HK_OUTPUT_LAST=7220
            HK_BURN=2840; HK_SOFT_ETA=0; HK_HARD_ETA=0
            HK_COST="15.34"; HK_RATE5H=74; HK_RATE7D=68
            HK_ACTION="HARD_HALT"; HK_PENDING=""
            LG_STATE="CLEARING"
            CM_TS="2026-05-03T06:23:01Z"; CM_DUR=14; CM_METHOD="llm-enriched"
            CM_LLM="qwen3:8b"; CM_LINES=234; CM_BYTES=19712
            CM_USER_MSGS=42; CM_STALE_MIN=2
            CM_NLP_APPLIED="true"; CM_NLP_BEFORE=4180; CM_NLP_AFTER=3940; CM_NLP_RATIO="0.94"
            SIG_CLEAR="true"; SIG_RESUME="false"; SIG_COMP_DONE="true"
            SIG_COMP_GUARD="true"; SIG_COMMAND="/clear"; SIG_EXIT="false"; SIG_SLEEP="false"
            HUD_LOG_LINES=(
                "2026-05-03T06:23:14Z cycle: /clear sent (legacy state: CLEARING)"
                "2026-05-03T06:23:13Z cycle: prep complete"
                "2026-05-03T06:23:01Z cycle: launching prep script"
                "2026-05-03T06:22:55Z cycle: HALT acknowledged"
                "2026-05-03T06:22:50Z cycle: HALT prompt sent"
                "2026-05-03T06:22:47Z cycle: idle confirmed (waited 3s)"
                "2026-05-03T06:22:44Z cycle: start"
                "2026-05-03T06:22:19Z stop: HARD_HALT signal written (.jicm-clear-now.signal)"
            )
            ;;
        restoring|5)
            HK_TOKENS=18420; HK_USED_PCT=2
            HK_INPUT=18420; HK_CACHE_READ=0; HK_CACHE_CREATE=0
            HK_CACHE_5M=0; HK_CACHE_1H=0
            HK_CACHE_HIT="0.0000"; HK_OUTPUT_LAST=0
            HK_BURN=0; HK_SOFT_ETA=0; HK_HARD_ETA=0
            HK_COST="0.04"; HK_RATE5H=74; HK_RATE7D=68
            HK_ACTION="WATCHING"; HK_PENDING=""
            LG_STATE="RESTORING"
            CM_TS="2026-05-03T06:23:01Z"; CM_DUR=14; CM_METHOD="llm-enriched"
            CM_LLM="qwen3:8b"; CM_LINES=234; CM_BYTES=19712
            CM_USER_MSGS=0; CM_STALE_MIN=0
            CM_NLP_APPLIED="true"; CM_NLP_BEFORE=4180; CM_NLP_AFTER=3940; CM_NLP_RATIO="0.94"
            SIG_CLEAR="false"; SIG_RESUME="true"; SIG_COMP_DONE="false"
            SIG_COMP_GUARD="false"; SIG_COMMAND=""; SIG_EXIT="false"; SIG_SLEEP="false"
            HUD_LOG_LINES=(
                "2026-05-03T06:23:55Z cycle: RESUME prompt sent (legacy state: RESTORING)"
                "2026-05-03T06:23:54Z cycle: resume signal observed"
                "2026-05-03T06:23:14Z cycle: /clear sent (legacy state: CLEARING)"
                "2026-05-03T06:23:13Z cycle: prep complete"
                "2026-05-03T06:23:01Z cycle: launching prep script"
                "2026-05-03T06:22:55Z cycle: HALT acknowledged"
                "2026-05-03T06:22:50Z cycle: HALT prompt sent"
            )
            ;;
        *)
            return 1
            ;;
    esac
    return 0
}

run_demo_interactive() {
    local states=(idle soft hard clearing restoring)
    local labels=("Watching (idle, low context)" "Soft-nudge crossed (~31%)" "Hard-halt crossed (~67%)" "Mid-compression (CLEARING)" "Post-clear (RESTORING)")
    tput civis 2>/dev/null
    # Enter alternate screen buffer + flicker-free render mode.
    printf '\033[?1049h\033[2J\033[H'
    HUD_IN_ALT_SCREEN=true
    trap 'tput cnorm 2>/dev/null; printf "\033[?1049l"; HUD_IN_ALT_SCREEN=false; exit 0' INT TERM EXIT
    local i=0
    while [[ "$i" -lt "${#states[@]}" ]]; do
        synthesize_demo_state "${states[$i]}"
        render_dashboard
        printf '\n%s── DEMO STATE %d/%d: %s%s\n' "$C_VIOLET$C_BOLD" "$(( i + 1 ))" "${#states[@]}" "${labels[$i]}" "$C_NC"
        printf '%sPress ENTER for next state, q to quit:%s ' "$C_DIM" "$C_NC"
        read -r key
        [[ "$key" == "q" ]] && break
        i=$(( i + 1 ))
    done
    tput cnorm 2>/dev/null
    printf '\033[?1049l'
    HUD_IN_ALT_SCREEN=false
    return 0
}

run_demo_state() {
    local n="$1"
    if synthesize_demo_state "$n"; then
        render_dashboard
        printf '\n%sDEMO STATE %s%s\n' "$C_VIOLET$C_BOLD" "$n" "$C_NC"
    else
        printf 'Unknown demo state: %s\nValid: 1..5 or idle|soft|hard|clearing|restoring\n' "$n" >&2
        return 1
    fi
    return 0
}

# ─── LIVE MODE ─────────────────────────────────────────────────────────────

run_live() {
    if ! command -v jq >/dev/null 2>&1; then
        printf 'ERROR: jq required.\n' >&2
        return 1
    fi
    local cols rows
    cols=$(term_cols); rows=$(term_rows)
    if [[ "$cols" -lt "$HUD_MIN_COLS" ]] || [[ "$rows" -lt "$HUD_MIN_ROWS" ]]; then
        printf '%sWARNING:%s Terminal %dx%d below recommended %dx%d. Layout may degrade.\n' \
            "$C_YELLOW$C_BOLD" "$C_NC" "$cols" "$rows" "$HUD_MIN_COLS" "$HUD_MIN_ROWS"
        sleep 1
    fi
    tput civis 2>/dev/null
    # Enter alternate screen buffer + flicker-free render mode.
    printf '\033[?1049h\033[2J\033[H'
    HUD_IN_ALT_SCREEN=true
    trap 'tput cnorm 2>/dev/null; printf "\033[?1049l"; HUD_IN_ALT_SCREEN=false; exit 0' INT TERM EXIT
    while true; do
        load_all
        render_dashboard
        # Non-blocking key check (1s timeout)
        local key=""
        read -r -s -n 1 -t "$HUD_REFRESH" key 2>/dev/null
        case "$key" in
            q|Q) break ;;
        esac
    done
    tput cnorm 2>/dev/null
    printf '\033[?1049l'
    HUD_IN_ALT_SCREEN=false
    return 0
}

run_once() {
    if ! command -v jq >/dev/null 2>&1; then
        printf 'ERROR: jq required.\n' >&2
        return 1
    fi
    load_all
    render_dashboard
    return 0
}

# ─── ENTRY ─────────────────────────────────────────────────────────────────

print_help() {
    cat <<EOF
Jarvis Watcher HUD v$HUD_VERSION

USAGE:
  $(basename "$0")                  Live dashboard (refresh ${HUD_REFRESH}s)
  $(basename "$0") --once           Render single frame and exit
  $(basename "$0") --demo           Interactive demo (5 states, ENTER advances)
  $(basename "$0") --demo-state=N   Render demo state N (1-5) and exit
                                    1=idle | 2=soft | 3=hard | 4=clearing | 5=restoring
  $(basename "$0") --help           This help

ENV VARS:
  HUD_REFRESH       Live refresh interval in seconds (default: 1)
  HUD_LOG_TAIL      Log lines to display in tail panel (default: 12)
  HUD_MIN_COLS      Minimum terminal width before warning (default: 100)
  HUD_MIN_ROWS      Minimum terminal height before warning (default: 40)
  PROJECT_DIR       Override project root (default: auto-detected)

DATA SOURCES (read-only):
  .jicm-state-hook.json, .jicm-state, .jicm-watcher.pid, jicm-watcher.log,
  .jicm-last-compression.json, signal files, ps for Aion Quartet.

ARCHITECTURAL NOTE:
  HUD is a sidecar reader. It does NOT modify, restart, or interfere with the
  v7.9 slim watcher (jicm-watcher.sh). Read-only consumer of the state surface.
EOF
    return 0
}

main() {
    case "${1:-}" in
        --help|-h)              print_help ;;
        --demo)                 run_demo_interactive ;;
        --demo-state=*)         run_demo_state "${1#--demo-state=}" ;;
        --once)                 run_once ;;
        "")                     run_live ;;
        *)
            printf 'Unknown option: %s\n' "$1" >&2
            print_help
            return 1
            ;;
    esac
    return 0
}

main "$@"
