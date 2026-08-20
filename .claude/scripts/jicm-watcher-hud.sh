#!/bin/bash
# ============================================================================
# jicm-watcher-hud.sh — the WATCHER CONSOLE (HUD v2)
# ============================================================================
#
# Read-only console for the JICM watcher daemon (jicm-watcher.sh, run by launchd as
# com.aion.jicm-watcher). Lives in tmux window aion:8 "Watcher". Touches nothing:
# no signals, no state writes, no actuation. If this process dies, JICM is unaffected.
#
# NAMING, because the words changed under this file (2026-08-20):
#   · "the watcher" now means the multi-session daemon that senses every lane and
#     fires jicm-actuate.sh at threshold. It was called jicm-supervisor.sh until
#     2026-08-20.
#   · The v7.9 singleton that used to own the name is RETIRED (2026-08-17) and sits,
#     unlaunchable, in scripts/retired/. Anything here saying "legacy" means that one.
#   · This file kept its name: it was always jicm-watcher-hud.sh, and it is now
#     literally the watcher's HUD.
#
# WHY v2 EXISTS — v1 had one fatal flaw and three bad habits:
#   · It probed the RETIRED singleton's pid file and rendered "Watcher: DOWN" in red,
#     permanently, while the real daemon ran fine and appeared nowhere on screen.
#   · W0's context/cache/cost took the top third; the five-lane table was 6th of 8.
#   · "Cycles completed (this log): 0" sat above a log showing three cycles that day.
#   · ~12 rows rendered "—" for data that was simply absent.
# v2 leads with the daemon's own health, makes LANES the primary object, and omits
# panels rather than printing empty ones. See the PRESENTATION LAYER banner below.
#
# Data sources (all read-only):
#   context/jicm/watcher.pid          — daemon liveness (NOT .jicm-watcher.pid, which
#                                       belongs to the retired singleton)
#   launchctl list                    — whether anything will restart it if it dies
#   logs/jicm-watcher.log             — log tail, alert counts, cycle history, and the
#                                       daemon's own start banner (authoritative for
#                                       the RUNNING config; our env describes us, not it)
#   context/jicm/registry/*.json      — the lane set
#   context/jicm/state/<key>.json     — per-lane tokens, thresholds, provenance
#   context/jicm/signals/actuating.*  — in-flight cycle locks
#   .memory-health-services.json      — service probes, MLX footprint, memory pressure
#   .jicm-state-hook.json             — w0 legacy state (quota/cache figures)
#   git status                        — branch + dirty/ahead counts
#
# Modes:
#   (default)             Live dashboard, 1s refresh
#   --once                Render a single frame then exit (testing)
#   --demo                Cycle through example states (interactive)
#   --demo-state=N        Render a single demo state and exit
#   --help                Usage
#   NOTE: demo mode synthesizes v1's HK_* state surface. v2's panels read the daemon
#   and registry directly, so demo frames exercise layout, not lane data.
#
# Layout target:  >=100 cols x >=40 rows. Optimized for full-screen tmux.
# Refresh:        1s default (HUD_REFRESH env var).
#
# Author: Jarvis (W11). v1 2026-05-03; v2 rebuild 2026-08-20.
# License: MIT
# ============================================================================

set -o pipefail

# ─── CONFIG ────────────────────────────────────────────────────────────────
HUD_REFRESH="${HUD_REFRESH:-1}"
HUD_MIN_COLS="${HUD_MIN_COLS:-100}"
HUD_MIN_ROWS="${HUD_MIN_ROWS:-40}"
HUD_VERSION="2.0.0"
HUD_LOG_TAIL="${HUD_LOG_TAIL:-12}"

# ─── PATHS ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"

# Source shared config (best-effort) — env vars set here may override below
[[ -f "$SCRIPT_DIR/jicm-config.sh" ]] && . "$SCRIPT_DIR/jicm-config.sh" 2>/dev/null

JICM_STATE_HOOK_FILE="${JICM_STATE_HOOK_FILE:-$PROJECT_DIR/.claude/context/.jicm-state-hook.json}"
JICM_STATE_FILE="${JICM_STATE_FILE:-$PROJECT_DIR/.claude/context/.jicm-state}"
JICM_LOG_FILE="${JICM_LOG_FILE:-$PROJECT_DIR/.claude/logs/jicm-watcher.log}"
# THE DAEMON'S LOG — single source for the log panel, the alert count, the cycle
# history and the runtime-config banner. One definition, because these four panels
# must never disagree about which process they are describing.
#
# HISTORY, twice corrected: this pointed at jicm-watcher-loop.log, DEAD since
# 2026-08-17 when the legacy singleton was retired, so the panel showed a two-day-old
# tombstone while every live event went unseen. It was then repointed at
# jicm-supervisor.log. The 2026-08-20 rename folded that file into jicm-watcher.log
# (the supervisor-era history was prepended, so the log is continuous across the
# rename and cycle counts still reach back before it).
HUD_WATCHER_LOG="${HUD_WATCHER_LOG:-$PROJECT_DIR/.claude/logs/jicm-watcher.log}"
JICM_HUD_LOG_FILE="$HUD_WATCHER_LOG"
JICM_HUD_LOG_LABEL="WATCHER LOG"
# The RETIRED singleton's pid file. Kept only so nothing that still reads the name
# breaks; v2 does NOT use it for liveness — see load_watcher_daemon, which reads
# $JICM_DIR/watcher.pid. Probing this file is what produced a permanent false
# "Watcher: DOWN" on the old dashboard.
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
COST_STATE_FILE="${COST_STATE_FILE:-$PROJECT_DIR/.claude/context/.cost-state.json}"
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

load_cost_state() {
    [[ -f "$COST_STATE_FILE" ]] || return 0
    local json
    json=$(cat "$COST_STATE_FILE" 2>/dev/null) || return 0
    [[ -z "$json" ]] && return 0
    CA_TS=$(jq -r '.timestamp // ""' <<<"$json" 2>/dev/null)
    CA_5H_COST=$(jq -r '.window_5h.cost_usd // 0' <<<"$json" 2>/dev/null)
    CA_5H_RATE=$(jq -r '.window_5h.rate_usd_per_h // 0' <<<"$json" 2>/dev/null)
    CA_5H_REQS=$(jq -r '.window_5h.request_count // 0' <<<"$json" 2>/dev/null)
    CA_5M_COST=$(jq -r '.rate_5min.cost_usd // 0' <<<"$json" 2>/dev/null)
    CA_5M_RATE=$(jq -r '.rate_5min.rate_usd_per_h // 0' <<<"$json" 2>/dev/null)
    CA_ALERT=$(jq -r '.alert_level // "ok"' <<<"$json" 2>/dev/null)
    CA_ANOMALY_COUNT=$(jq -r '.anomalies | length' <<<"$json" 2>/dev/null)
    CA_ANOMALY_TYPE=$(jq -r '.anomalies[0].type // ""' <<<"$json" 2>/dev/null)
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
    # HUD-OWNED var, deliberately NOT JICM_WATCHER_LOOP_LOG: jicm-config.sh assigns that one
    # UNCONDITIONALLY (no :- default), so it silently clobbers anything this script sets before
    # sourcing the config — that mismatch once changed the panel TITLE while leaving the CONTENT
    # on the old file, which read as a caching bug. Naming the target here keeps the HUD's
    # choice authoritative.
    #
    # 2026-08-20: JICM_WATCHER_LOOP_LOG is the RETIRED singleton's log, dead since 2026-08-17.
    # Pointing here by default made every live event invisible behind two-day-old
    # "watcher exiting" lines. The default is now the live daemon's own log.
    local target_log="$HUD_WATCHER_LOG"
    [[ -f "$target_log" ]] || target_log="$JICM_LOG_FILE"   # last-resort fallback
    [[ -f "$target_log" ]] || return 0
    local line
    while IFS= read -r line; do
        HUD_LOG_LINES+=("$line")
    done < <(tail -n "$HUD_LOG_TAIL" "$target_log" 2>/dev/null)
    # Cycle count via grep — also from loop log
    # Note: drop "|| echo 0" — grep -c always emits a number, so the fallback
    # only fires when grep exits 1 (no matches), producing "0\n0" which breaks
    # later arithmetic. ${VAR:-0} handles the file-missing case safely.
    HUD_CYCLE_COUNT=$(grep -c "cycle: complete" "$target_log" 2>/dev/null)
    HUD_CYCLE_COUNT=${HUD_CYCLE_COUNT:-0}
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
        load_watcher_daemon
        load_watcher_alerts
        load_cycle_history
        load_resources
        load_signals
        load_sessions
        load_log_tail
        load_git_state
        load_cost_state
        # load_aion_quartet / load_pulse_counts / load_project_status are NOT called:
        # v2 does not render the quartet (its "Watcher" entry probed the retired process
        # and reported a permanent false DOWN), Pulse tasks, or session-state focus.
        # Those are workspace concerns, not watcher concerns, and all three rendered
        # empty or offline in practice. The loaders are retained so restoring a panel
        # is a one-line change.
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

# ═══════════════════════════════════════════════════════════════════════════
# PRESENTATION LAYER — rebuilt 2026-08-20 (HUD v2)
#
# WHAT WAS WRONG WITH v1, since the rebuild is otherwise unexplainable:
#   1. WRONG SUBJECT. The dashboard is the console for a MULTI-LANE watcher, but
#      W0's context/cache/cost occupied the top third and the five-lane table was
#      6th of 8 sections. The primary object was a single lane.
#   2. IT REPORTED ITS OWN SUBJECT AS DOWN. The health panel probed the RETIRED
#      v7.9 singleton's pid file and rendered "Watcher: ✗ DOWN" in red, while the
#      daemon actually doing the work appeared nowhere on screen.
#   3. IT CONTRADICTED ITSELF. "Cycles completed (this log): 0" sat directly above
#      a log tail showing three completed cycles that day.
#   4. LOW DENSITY. ~12 rows rendered "—" for absent data (Pulse offline, no focus,
#      four "absent" signal lines, empty NLP metadata).
#
# DESIGN RULES for v2:
#   · The daemon's own health is the FIRST thing on screen. A monitor that cannot
#     tell you whether it is monitoring is worthless.
#   · Lanes are the primary object, one dense row each, sorted most-loaded first.
#   · Every number carries its scope. Per-key thresholds, never a global claim.
#   · Absent data is OMITTED, not rendered as "—". Rows earn their space.
#   · Nothing is asserted that another panel contradicts.
# ═══════════════════════════════════════════════════════════════════════════

# ─── LOOKUP HELPER (bash 3.2 — NO associative arrays on macOS) ─────────────
# Values are carried in "key:value|key:value" strings rather than a hash.
_kv_get() {
    local want="$1" blob="$2" pair
    local IFS='|'
    for pair in $blob; do
        [[ "${pair%%:*}" == "$want" ]] && { printf '%s' "${pair#*:}"; return 0; }
    done
    printf '%s' "${3:-}"
}

# ─── DAEMON HEALTH ─────────────────────────────────────────────────────────
# 🔴 REPLACES v1's load_watcher_proc, which read $JICM_PID_FILE — the RETIRED
# singleton's pid file (.claude/context/.jicm-watcher.pid). Nothing has written that
# since 2026-08-17, so the panel showed a red "DOWN" for the wrong process for three
# days. The live daemon writes $JICM_DIR/watcher.pid.
#
# launchd state is read SEPARATELY from process liveness on purpose: a live pid whose
# job is unloaded means someone hand-started it and NOTHING will restart it when it
# dies. Those are different failures and the panel must not merge them into one "UP".
load_watcher_daemon() {
    WD_PID=""; WD_ALIVE="false"; WD_UPTIME="?"; WD_CPU=""; WD_RSS=""
    WD_LAUNCHD="unloaded"; WD_LAST_RC=""
    WD_POLL=""; WD_ACTUATE=""; WD_W0=""

    local pidfile="${JICM_DIR:-$PROJECT_DIR/.claude/context/jicm}/watcher.pid"
    [[ -f "$pidfile" ]] && WD_PID=$(tr -d '[:space:]' < "$pidfile" 2>/dev/null)
    if [[ -n "$WD_PID" && "$WD_PID" =~ ^[0-9]+$ ]] && kill -0 "$WD_PID" 2>/dev/null; then
        WD_ALIVE="true"
        local l
        l=$(ps -o etime=,%cpu=,rss= -p "$WD_PID" 2>/dev/null | awk '{$1=$1; print}')
        WD_UPTIME=$(awk '{print $1}' <<<"$l")
        WD_CPU=$(awk '{print $2}' <<<"$l")
        WD_RSS=$(awk '{print $3}' <<<"$l")
    fi

    local ll
    ll=$(launchctl list 2>/dev/null | awk '$3 ~ /com\.aion\.jicm-watcher$/ {print $1" "$2}')
    if [[ -n "$ll" ]]; then
        WD_LAUNCHD="loaded"
        WD_LAST_RC=$(awk '{print $2}' <<<"$ll")
    fi

    # Runtime config is read from the daemon's OWN start banner, not from our env.
    # This process does not inherit the launchd job's environment, so echoing our own
    # JICM_WATCHER_* would describe the wrong process — the "settings file contrast"
    # failure that has burned this lane repeatedly. The banner is what is RUNNING.
    local banner
    banner=$(grep -E '==== watcher start' "$HUD_WATCHER_LOG" 2>/dev/null | tail -1)
    if [[ -n "$banner" ]]; then
        WD_POLL=$(sed -nE 's/.*poll=([0-9]+s).*/\1/p'      <<<"$banner")
        WD_ACTUATE=$(sed -nE 's/.*actuate=([0-9]+).*/\1/p'  <<<"$banner")
        WD_W0=$(sed -nE 's/.*include_w0=([0-9]+).*/\1/p'    <<<"$banner")
    fi
    return 0
}

# ─── ALERTS + LOCKS ────────────────────────────────────────────────────────
# The FROZEN STATE / SAMPLER GAP net is the reason this daemon can be trusted, so its
# state is headline data. Counting is BY TIMESTAMP, never by line count: the log holds
# 46 historical alerts and `grep -c` on it reads like an active alarm.
load_watcher_alerts() {
    WA_24H=0; WA_LAST=""; WA_LAST_AGE=""; WA_LOCKS=""
    [[ -f "$HUD_WATCHER_LOG" ]] || return 0
    local cutoff line ts
    cutoff=$(( $(date +%s) - 86400 ))
    while IFS= read -r line; do
        ts=$(awk '{print $1}' <<<"$line")
        local e; e=$(_iso_local_epoch "$ts")
        [[ "$e" -gt "$cutoff" ]] && WA_24H=$(( WA_24H + 1 ))
        WA_LAST="$line"
    done < <(grep -E 'ALERT|FROZEN STATE|SAMPLER GAP' "$HUD_WATCHER_LOG" 2>/dev/null | tail -200)
    if [[ -n "$WA_LAST" ]]; then
        local lts le now
        lts=$(awk '{print $1}' <<<"$WA_LAST"); le=$(_iso_local_epoch "$lts"); now=$(date +%s)
        [[ "$le" -gt 0 ]] && WA_LAST_AGE=$(( now - le ))
    fi
    local lk
    for lk in "${JICM_SIGNALS_DIR:-$PROJECT_DIR/.claude/context/jicm/signals}"/actuating.*; do
        [[ -e "$lk" ]] || continue
        WA_LOCKS="${WA_LOCKS}${WA_LOCKS:+ }$(basename "$lk" | sed 's/^actuating\.//')"
    done
    return 0
}

# Parse "2026-08-20T16:44:14-0600" (the daemon's local-offset stamp) to epoch.
_iso_local_epoch() {
    local s="${1%%.*}"
    [[ -z "$s" ]] && { echo 0; return; }
    date -j -f "%Y-%m-%dT%H:%M:%S%z" "$s" +%s 2>/dev/null || echo 0
}

# ─── CYCLE HISTORY + DRIVE COUNTS ──────────────────────────────────────────
# Drive count answers a question the old HUD could not: has this lane's actuation path
# EVER run end-to-end? protos reads 0 — it has never crossed its 160K hard threshold, so
# its drive path is the one unproven one in the system. That is a standing risk and it
# now has a permanent place on screen instead of living only in a scratchpad note.
load_cycle_history() {
    HUD_CYCLES=(); WC_DRIVES=""
    HUD_TODAY=$(date '+%Y-%m-%d')
    [[ -f "$HUD_WATCHER_LOG" ]] || return 0
    WC_DRIVES=$(grep -oE 'ACTUATE: armed detached actuator for key=[A-Za-z0-9_-]+' "$HUD_WATCHER_LOG" 2>/dev/null \
        | awk -F= '{print $2}' | sort | uniq -c \
        | awk '{printf "%s:%s|", $2, $1}')
    local line t k d
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local stamp day
        stamp=$(awk '{print $1}' <<<"$line")
        day="${stamp%%T*}"
        t="${stamp#*T}"; t="${t%%-*}"; t="${t%%+*}"; t="${t:0:5}"
        [[ "$day" != "$HUD_TODAY" ]] && t="${day:5}·${t}"   # MM-DD·HH:MM for older days
        k=$(sed -nE 's/.*key=([A-Za-z0-9_-]+).*/\1/p' <<<"$line")
        d=$(sed -nE 's/.*after ([0-9]+)s.*/\1/p' <<<"$line")
        HUD_CYCLES+=("${t}|${k}|${d}")
    done < <(grep -E 'reap: key=.*actuation cycle complete' "$HUD_WATCHER_LOG" 2>/dev/null | tail -8)
    return 0
}

# ─── SERVICES / RESOURCES ──────────────────────────────────────────────────
# Sourced from .memory-health-services.json, which the daemon itself writes on its
# MAINTAIN pass — so this panel is also indirect evidence the daemon's maintenance
# loop is running, not just its poll loop.
load_resources() {
    RS_JSON=""; RS_MLX_GB=""; RS_MLX_MAX=""; RS_MEM_FREE=""; RS_SERVICES=""; RS_AGE=""
    local f="$PROJECT_DIR/.claude/context/.memory-health-services.json"
    [[ -f "$f" ]] || return 0
    RS_MLX_GB=$(jq -r '.memory.mlx_embed_footprint_gb // ""' "$f" 2>/dev/null)
    RS_MLX_MAX=$(jq -r '.memory.mlx_embed_threshold_gb // ""' "$f" 2>/dev/null)
    RS_MEM_FREE=$(jq -r '.memory.mem_free_pct // ""' "$f" 2>/dev/null)
    RS_SERVICES=$(jq -r '.services | to_entries[] | "\(.key):\(if .value.up then "up" else "DOWN" end):\(.value.latency_ms // "?")"' "$f" 2>/dev/null | tr '\n' '|')
    local ts; ts=$(jq -r '.timestamp // ""' "$f" 2>/dev/null)
    if [[ -n "$ts" ]]; then
        local e; e=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s 2>/dev/null || echo 0)
        [[ "$e" -gt 0 ]] && RS_AGE=$(( $(date +%s) - e ))
    fi
    return 0
}

# ─── LANES ─────────────────────────────────────────────────────────────────
HUD_SESSION_ROWS=()
load_sessions() {
    HUD_SESSION_ROWS=()
    command -v jicm_registry_keys >/dev/null 2>&1 || return 0
    local key sid target st tokens pending hard alive occ pane prov age now soft
    now=$(date +%s)
    for key in $(jicm_registry_keys 2>/dev/null); do
        sid="$(jicm_registry_get "$key" '.session_id' 2>/dev/null)"
        target="$(jicm_registry_get "$key" '.tmux_target' 2>/dev/null)"
        [[ "$target" == "null" || -z "$target" ]] && target="-"
        # Same sensor the watcher uses: the gate-written per-key state file.
        jicm_key_paths "$key" 2>/dev/null
        prov="?"; age=""
        if [[ -f "$JK_STATE" ]]; then
            st="$(jq -r '[(.tokens // 0), (.pending_action // "none"), (.hard_threshold_tokens // 0), (._refreshed_by // "?"), (.soft_threshold_tokens // 0)] | join("|")' "$JK_STATE" 2>/dev/null)"
            local mt; mt=$(stat -f %m "$JK_STATE" 2>/dev/null)
            [[ "$mt" =~ ^[0-9]+$ ]] && age=$(( now - mt ))
        fi
        [[ -z "${st:-}" ]] && st="0|none|0|?|0"
        IFS='|' read -r tokens pending hard prov soft <<< "$st"
        alive="stale"; jicm_session_alive "$sid" 2>/dev/null && alive="live"
        occ="-"
        if [[ "$target" != "-" ]]; then
            pane="$(jicm_pane_session "$target" 2>/dev/null)"
            if   [[ -z "$pane" ]];        then occ="?"
            elif [[ "$pane" == "$sid" ]]; then occ="ok"
            else                               occ="DRIFT"; fi
        fi
        HUD_SESSION_ROWS+=("${key}|${sid}|${target}|${tokens}|${hard}|${pending}|${alive}|${occ}|${prov}|${age}|${soft}")
    done
    return 0
}

# ─── RENDERERS ─────────────────────────────────────────────────────────────

# Compact provenance: "gate:PostToolUse" -> "gate:PTU". The full string costs 12
# columns per row and the distinction that matters is only which event fired.
_prov_short() {
    case "$1" in
        gate:PostToolUse)     printf 'gate:PTU'  ;;
        gate:UserPromptSubmit) printf 'gate:UPS' ;;
        watcher_poll)         printf 'poll'      ;;
        ""|"?"|null)          printf '?'         ;;
        *)                    printf '%s' "$(truncate_str "$1" 9)" ;;
    esac
}

# ps etime is [[DD-]HH:]MM:SS. Rendered raw, "07:49" reads as seven HOURS when it is
# seven minutes — an uptime that misreads by 60x on the one panel that certifies the
# daemon is healthy. Always convert before display.
_fmt_etime() {
    local e="$1" d=0 h=0 m=0 sec=0
    [[ -z "$e" || "$e" == "?" ]] && { printf '?'; return; }
    case "$e" in
        *-*) d="${e%%-*}"; e="${e#*-}" ;;
    esac
    local n; n=$(awk -F: '{print NF}' <<<"$e")
    if [[ "$n" -eq 3 ]]; then IFS=: read -r h m sec <<< "$e"
    else IFS=: read -r m sec <<< "$e"; fi
    d=$((10#${d:-0})); h=$((10#${h:-0})); m=$((10#${m:-0})); sec=$((10#${sec:-0}))
    if   [[ "$d" -gt 0 ]]; then printf '%dd%dh' "$d" "$h"
    elif [[ "$h" -gt 0 ]]; then printf '%dh%02dm' "$h" "$m"
    elif [[ "$m" -gt 0 ]]; then printf '%dm%02ds' "$m" "$sec"
    else printf '%ds' "$sec"; fi
}

_fmt_age() {
    local s="$1"
    [[ -z "$s" || ! "$s" =~ ^[0-9]+$ ]] && { printf '?'; return; }
    if   [[ "$s" -lt 60    ]]; then printf '%ds' "$s"
    elif [[ "$s" -lt 3600  ]]; then printf '%dm' $(( s / 60 ))
    else                            printf '%dh' $(( s / 3600 )); fi
}

render_header() {
    local width="$1"
    top_bar "$width"
    local dot dotc state
    if [[ "$WD_ALIVE" == "true" ]]; then
        dot="●"; dotc="$C_LIME"; state="RUNNING"
    else
        dot="●"; dotc="$C_RED";  state="DOWN"
    fi
    local title="AION WATCHER"
    local ver="v$HUD_VERSION"
    local mid="${dotc}${dot}${C_NC} ${C_BOLD}${state}${C_NC}${C_HEADER}  pid ${WD_PID:-—}  up $(_fmt_etime "$WD_UPTIME")"
    local mid_plain="${dot} ${state}  pid ${WD_PID:-—}  up $(_fmt_etime "$WD_UPTIME")"
    local right="$HUD_NOW_FMT "
    local pad_total=$(( width - 4 - ${#title} - ${#ver} - 2 - ${#mid_plain} - ${#right} ))
    [[ "$pad_total" -lt 2 ]] && pad_total=2
    local pad_l=$(( pad_total / 2 )) pad_r
    pad_r=$(( pad_total - pad_l ))
    printf '%s%s%s %s%s %s%s%s%b%s%s%s%s%s%s\n' \
        "$C_HEADER$C_BOLD" "$B_V" "$C_NC" \
        "$C_VIOLET$C_BOLD$title$C_NC " "$C_DIM$ver$C_NC" \
        "$(repeat_char ' ' "$pad_l")" "$C_HEADER" "" \
        "$mid" \
        "$C_NC" "$(repeat_char ' ' "$pad_r")" \
        "$C_LGRAY" "$right" "$C_NC" \
        "$C_HEADER$C_BOLD$B_V$C_NC"
    return 0
}

# The daemon panel. FIRST on screen, deliberately: this is the console for that
# process, and its liveness qualifies every other number here.
render_daemon_section() {
    local width="$1"
    section_hr "$width" "WATCHER DAEMON"

    local jl_c jl_txt
    if [[ "$WD_LAUNCHD" == "loaded" ]]; then
        jl_c="$C_LIME"; jl_txt="loaded"
        [[ -n "$WD_LAST_RC" && "$WD_LAST_RC" != "0" ]] && { jl_c="$C_ORANGE"; jl_txt="loaded (last rc=$WD_LAST_RC)"; }
    else
        jl_c="$C_RED"; jl_txt="UNLOADED — nothing will restart this process"
    fi

    local act_c act_t
    if [[ "$WD_ACTUATE" == "1" ]]; then act_c="$C_LIME"; act_t="ON"
    else act_c="$C_ORANGE"; act_t="OFF (sense-only)"; fi
    local w0_t; [[ "$WD_W0" == "1" ]] && w0_t="ON" || w0_t="OFF"

    content_row "$width" "  ${C_LABEL}launchd:${C_NC} ${C_DIM}com.aion.jicm-watcher${C_NC} ${jl_c}${jl_txt}${C_NC}   ${C_LABEL}poll:${C_NC} ${C_VALUE}${WD_POLL:-?}${C_NC}   ${C_LABEL}actuate:${C_NC} ${act_c}${act_t}${C_NC}   ${C_LABEL}w0:${C_NC} ${C_VALUE}${w0_t}${C_NC}   ${C_LABEL}cpu:${C_NC} ${C_VALUE}${WD_CPU:-?}%${C_NC}"

    # Alerts. Silence is only meaningful if the age of the last alert is shown next
    # to it — "0 in 24h" with a 20-minute-old alert would be a very different picture.
    local a_c a_t
    if [[ "$WA_24H" -eq 0 ]]; then a_c="$C_LIME"; a_t="none in 24h"
    elif [[ "$WA_24H" -le 2 ]]; then a_c="$C_GOLD"; a_t="${WA_24H} in 24h"
    else a_c="$C_RED"; a_t="${WA_24H} in 24h"; fi
    local last_t="${C_DIM}(no alerts on record)${C_NC}"
    if [[ -n "$WA_LAST" ]]; then
        local kind; kind=$(sed -nE 's/.*(FROZEN STATE|SAMPLER GAP).*/\1/p' <<<"$WA_LAST")
        [[ -z "$kind" ]] && kind="ALERT"
        local lkey; lkey=$(sed -nE 's/.*key=([A-Za-z0-9_-]+).*/\1/p' <<<"$WA_LAST")
        last_t="${C_DIM}last:${C_NC} ${C_LGRAY}${kind}${lkey:+ key=$lkey}${C_NC} ${C_DIM}($(_fmt_age "$WA_LAST_AGE") ago)${C_NC}"
    fi
    local lock_t
    if [[ -z "$WA_LOCKS" ]]; then lock_t="${C_DIM}none${C_NC}"
    else lock_t="${C_MAGENTA}${WA_LOCKS}${C_NC} ${C_DIM}(cycle in flight)${C_NC}"; fi
    content_row "$width" "  ${C_LABEL}alerts:${C_NC} ${a_c}${a_t}${C_NC}   ${last_t}   ${C_LABEL}locks:${C_NC} ${lock_t}"
    return 0
}

# Lanes — the primary object. One dense row each, most-loaded first, every number
# scoped to that lane's OWN threshold.
render_lanes_section() {
    local width="$1"
    section_hr "$width" "LANES — registry (${#HUD_SESSION_ROWS[@]})"
    if [[ "${#HUD_SESSION_ROWS[@]}" -eq 0 ]]; then
        content_row "$width" "  ${C_DIM}(no registered lanes — is jicm-config.sh loadable?)${C_NC}"
        return 0
    fi
    content_row "$width" "  ${C_DIM}$(printf '%-8s %-8s %-9s %15s %5s  %-26s %-9s %5s %5s %4s' \
        KEY WIN SID 'TOKENS / HARD' USE 'LOAD' PROV AGE OCC DRV)${C_NC}"

    # Sort by utilisation descending — the lane closest to a cycle reads first.
    local sorted row
    sorted=$(for row in "${HUD_SESSION_ROWS[@]}"; do
        local t h p
        t=$(cut -d'|' -f4 <<<"$row"); h=$(cut -d'|' -f5 <<<"$row")
        if [[ "$h" =~ ^[0-9]+$ ]] && [[ "$h" -gt 0 ]]; then p=$(( t * 100 / h )); else p=0; fi
        printf '%03d|%s\n' "$p" "$row"
    done | sort -rn)

    local key sid target tokens hard pending alive occ prov age pct
    while IFS= read -r row; do
        [[ -z "$row" ]] && continue
        pct="${row%%|*}"; pct=$(( 10#$pct ))
        row="${row#*|}"
        IFS='|' read -r key sid target tokens hard pending alive occ prov age soft <<< "$row"
        local sid8="${sid:0:8}"; [[ -z "$sid8" ]] && sid8="-"

        local pc
        if   [[ "$pct" -ge 90 ]]; then pc="$C_RED"
        elif [[ "$pct" -ge 70 ]]; then pc="$C_ORANGE"
        elif [[ "$pct" -ge 50 ]]; then pc="$C_GOLD"
        else                           pc="$C_LIME"; fi

        # 26-cell load bar, scaled to THIS lane's own hard threshold, so the right
        # edge always means "a cycle fires here" whether the budget is 160K or 330K.
        # The tick marks the lane's OWN soft threshold, read from its state file — v1
        # drew ticks at fixed columns, which asserted a soft/hard ratio the lane may
        # not have. If soft is unset the tick is simply omitted rather than guessed.
        local bar="" i filled softpos=-1
        filled=$(( pct * 26 / 100 )); [[ "$filled" -gt 26 ]] && filled=26
        if [[ "$soft" =~ ^[0-9]+$ ]] && [[ "$soft" -gt 0 ]] && [[ "$hard" -gt 0 ]]; then
            softpos=$(( soft * 26 / hard ))
            [[ "$softpos" -ge 26 ]] && softpos=25
        fi
        i=0
        while [[ "$i" -lt 26 ]]; do
            if [[ "$i" -eq "$softpos" ]]; then
                # keep the tick legible whether or not the fill has reached it
                if [[ "$i" -lt "$filled" ]]; then bar+="${pc}${TICK_HARD}${C_NC}"
                else bar+="${C_GRAY}${TICK_SOFT}${C_NC}"; fi
            elif [[ "$i" -lt "$filled" ]]; then bar+="${pc}${BLOCK_FULL}${C_NC}"
            else bar+="${C_DGRAY}${BLOCK_25}${C_NC}"; fi
            i=$(( i + 1 ))
        done

        local occ_c
        case "$occ" in
            DRIFT) occ_c="$C_RED"   ;;
            ok)    occ_c="$C_LIME"  ;;
            \?)    occ_c="$C_GOLD"  ;;
            *)     occ_c="$C_DIM"   ;;
        esac
        # A stale session is dimmed wholesale — the row is about a lane that is gone.
        local kc="$C_VALUE"; [[ "$alive" != "live" ]] && kc="$C_DIM"

        local drv; drv=$(_kv_get "$key" "$WC_DRIVES" "0")
        local drv_c="$C_DIM"
        # 0 drives = an actuation path never proven end-to-end. Worth a colour.
        [[ "$drv" == "0" ]] && drv_c="$C_GOLD"

        local pend_disp=""
        [[ "$pending" != "none" && -n "$pending" ]] && pend_disp=" ${C_MAGENTA}${pending}${C_NC}"

        content_row "$width" "$(printf '  %s%-8s%s %-8s %-9s %6s/%-7s %s%4s%%%s  %s %s%-9s%s %5s %s%5s%s %s%4s%s%b' \
            "$kc" "$(truncate_str "$key" 8)" "$C_NC" \
            "$(truncate_str "$target" 8)" "$sid8" \
            "$(human_int "$tokens")" "$(human_int "$hard")" \
            "$pc" "$pct" "$C_NC" \
            "$bar" \
            "$C_DIM" "$(_prov_short "$prov")" "$C_NC" \
            "$(_fmt_age "$age")" \
            "$occ_c" "$occ" "$C_NC" \
            "$drv_c" "$drv" "$C_NC" \
            "$pend_disp")"
    done <<< "$sorted"
    return 0
}

render_cycles_section() {
    local width="$1"
    section_hr "$width" "RECENT CYCLES"
    if [[ "${#HUD_CYCLES[@]}" -eq 0 ]]; then
        content_row "$width" "  ${C_DIM}(no completed cycles in the log)${C_NC}"
        return 0
    fi
    local out="  " c t k d
    for c in "${HUD_CYCLES[@]}"; do
        IFS='|' read -r t k d <<< "$c"
        local dc="$C_LIME"
        [[ "$d" =~ ^[0-9]+$ ]] && [[ "$d" -gt 400 ]] && dc="$C_GOLD"
        out+="${C_DIM}${t}${C_NC} ${C_VALUE}${k}${C_NC} ${dc}${d}s${C_NC}${C_LIME}✓${C_NC}   "
    done
    content_row "$width" "$out"
    return 0
}

render_services_section() {
    local width="$1"
    section_hr "$width" "SERVICES  ·  RESOURCES  ·  QUOTA"
    local svc="" s name up lat
    local IFS='|'
    for s in $RS_SERVICES; do
        [[ -z "$s" ]] && continue
        name="${s%%:*}"; up=$(cut -d: -f2 <<<"$s"); lat=$(cut -d: -f3 <<<"$s")
        if [[ "$up" == "up" ]]; then svc+="${C_LIME}●${C_NC} ${C_LGRAY}${name}${C_NC} ${C_DIM}${lat}ms${C_NC}   "
        else svc+="${C_RED}● ${name} DOWN${C_NC}   "; fi
    done
    unset IFS
    [[ -z "$svc" ]] && svc="${C_DIM}(no probe data)${C_NC}"

    # MLX footprint is on the dashboard because it is a KNOWN leak with a live
    # watchdog: shape-diverse embedding requests grow the allocator's cache, and it
    # has reached 59 GB before. Threshold is the daemon's own auto-restart trigger.
    local mlx="${C_DIM}mlx —${C_NC}"
    if [[ -n "$RS_MLX_GB" ]]; then
        local mc="$C_LIME"
        [[ -n "$RS_MLX_MAX" ]] && [[ "$RS_MLX_GB" -ge $(( RS_MLX_MAX / 2 )) ]] && mc="$C_GOLD"
        [[ -n "$RS_MLX_MAX" ]] && [[ "$RS_MLX_GB" -ge "$RS_MLX_MAX" ]] && mc="$C_RED"
        mlx="${C_LABEL}MLX:${C_NC} ${mc}${RS_MLX_GB}${C_NC}${C_DIM}/${RS_MLX_MAX}GB${C_NC}"
    fi
    local mem=""
    if [[ -n "$RS_MEM_FREE" ]]; then
        local fc="$C_LIME"
        [[ "$RS_MEM_FREE" -lt 30 ]] && fc="$C_GOLD"
        [[ "$RS_MEM_FREE" -lt 15 ]] && fc="$C_RED"
        mem="   ${C_LABEL}mem free:${C_NC} ${fc}${RS_MEM_FREE}%${C_NC}"
    fi
    content_row "$width" "  ${svc}${C_DIM}│${C_NC}  ${mlx}${mem}   ${C_DIM}(probe $(_fmt_age "$RS_AGE") ago)${C_NC}"

    # Quota, compact. %Usage is the metric that matters; dollars are the least
    # relevant figure and the proxy reports cost_usd NULL by design, so it is omitted
    # rather than rendered as an authoritative-looking "$0.000".
    local q="  "
    local r5="${HK_RATE5H%\%}" r7="${HK_RATE7D%\%}"
    [[ -n "$r5" && "$r5" != "—" ]] && q+="${C_LABEL}5h block:${C_NC} $(color_pct "$r5")${r5}%${C_NC}   "
    [[ -n "$r7" && "$r7" != "—" ]] && q+="${C_LABEL}7d window:${C_NC} $(color_pct "$r7")${r7}%${C_NC}   "
    # cache_hit_rate is a RATIO (0.9904), not a percentage. v1 printed "0.9904%".
    if [[ -n "$HK_CACHE_HIT" ]]; then
        local ch; ch=$(awk -v v="$HK_CACHE_HIT" 'BEGIN{ if (v<=1) printf "%d", v*100+0.5; else printf "%d", v+0.5 }')
        q+="${C_LABEL}cache hit:${C_NC} ${C_VALUE}${ch}%${C_NC}   "
    fi
    [[ -n "$HUD_GIT_BRANCH" ]] && q+="${C_LABEL}git:${C_NC} ${C_TEAL}${HUD_GIT_BRANCH}${C_NC}"
    [[ "${HUD_GIT_DIRTY:-0}" -gt 0 ]] && q+=" ${C_GOLD}*${HUD_GIT_DIRTY}${C_NC}"
    [[ "${HUD_GIT_AHEAD:-0}" -gt 0 ]] && q+=" ${C_CYAN}↑${HUD_GIT_AHEAD}${C_NC}"
    [[ "$q" != "  " ]] && content_row "$width" "$q"
    return 0
}

render_log_tail() {
    local width="$1"
    section_hr "$width" "WATCHER LOG — live tail"
    if [[ "${#HUD_LOG_LINES[@]}" -eq 0 ]]; then
        content_row "$width" "  ${C_DIM}(no log entries)${C_NC}"
        return 0
    fi
    local line color disp
    for line in "${HUD_LOG_LINES[@]}"; do
        # v1 wasted 6 of 10 rows on CANARY-FIRE continuation lines carrying an absolute
        # log path and a stock instruction. Strip the noise so the tail shows EVENTS.
        case "$line" in
            *"policy=preserve-restore · target="*) continue ;;
            *"Reply ONCE and STOP"*)               continue ;;
            *"[CANARY-FIRE] detached actuator armed"*) continue ;;
        esac
        disp="$line"
        disp="${disp//$PROJECT_DIR\//}"
        # Collapse the ISO stamp to HH:MM:SS — the date is in the header.
        disp=$(sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T([0-9:]{8})[+-][0-9]{4}/\1/' <<<"$disp")
        case "$line" in
            *"FROZEN STATE"*|*"SAMPLER GAP"*|*ALERT*) color="$C_RED"    ;;
            *"cycle complete"*|*"reap:"*)             color="$C_LIME"   ;;
            *"ACTUATE"*|*"CANARY-FIRE"*)              color="$C_MAGENTA";;
            *"SIGNAL-EDGE"*)                          color="$C_GOLD"   ;;
            *"MAINTAIN"*|*"REST"*)                    color="$C_CYAN"   ;;
            *"watcher start"*)                        color="$C_VIOLET" ;;
            *timeout*|*abort*|*error*|*FAILED*)       color="$C_RED"    ;;
            *)                                        color="$C_LGRAY"  ;;
        esac
        content_row "$width" "  ${color}$(truncate_str "$disp" $(( width - 6 )))${C_NC}"
    done
    return 0
}

render_footer() {
    local width="$1"
    local left=" ${HUD_REFRESH}s refresh  ·  q to quit  ·  console for launchd com.aion.jicm-watcher"
    local right="${HUD_WATCHER_LOG#$PROJECT_DIR/} "
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
# Order encodes priority: is the watcher alive → what is it managing → what has it
# done → what is it standing on → the raw event stream.
render_dashboard() {
    local width
    width=$(term_cols)
    [[ "$width" -gt 220 ]] && width=220

    clear_screen
    render_header "$width"
    render_daemon_section "$width"
    render_lanes_section "$width"
    render_cycles_section "$width"
    render_services_section "$width"
    render_log_tail "$width"
    render_footer "$width"
    printf '\033[J'
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
    HK_MODEL="claude-opus-5[1m]"
    HK_WINDOW=1000000
    HK_SOFT_TOKENS=300000
    HK_HARD_TOKENS=330000
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
