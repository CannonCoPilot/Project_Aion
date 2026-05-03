#!/bin/bash
# ============================================================================
# Jarvis Statusline v7.9 / v8.0 — JICM-Aware, Single Source of Truth
# ============================================================================
#
# Reads the statusLine command's stdin JSON (which DOES include context_window —
# distinct from the UPS hook payload, which does NOT — see baseline doc §4.1
# correction) and the .jicm-state-hook.json written by jicm-gate.sh.
#
# Encoding directive: token thresholds are primary (state file: *_tokens);
# percentages here are derived for display only (Bar ticks, headline %).
#
# Renders a single-line status with nine panels:
#
#   [model]  ▓▓▓░│░░░│░░ 30%  Δ4.5K/m  Hard:65%/9m  Cache 92%  $4.23  5h:75 7d:89  WATCHING
#
#   1. Model            — short id + 1M-context indicator
#   2. Stack bar        — context fill, 20 chars, with soft (30%) and hard (65%) ticks
#   3. % used           — pre-calculated by Claude Code
#   4. Burn rate        — Δ tokens/min (from .jicm-state-hook.json)
#   5. Hard ETA         — minutes to hard threshold (from state file)
#   6. Cache hit ratio  — cache_read / (cache_read + cache_creation + input)
#   7. Session cost     — total_cost_usd
#   8. Rate-limit usage — 5h / 7d percentages
#   9. JICM state       — WATCHING / SOFT_NUDGE / HARD_HALT (from state file)
#
# DESIGN PER: projects/project-aion/designs/jicm-portable-architecture.md §3.5
#
# Token data source: stdin JSON, NOT tmux capture-pane.
# State data source: .jicm-state-hook.json written by jicm-gate.sh.
#
# Configure in .claude/settings.json:
#   "statusLine": {
#     "type": "command",
#     "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/jarvis-statusline-v8.sh"
#   }
# ============================================================================

set -o pipefail   # NOT -euo (per Jarvis MEMORY.md grep-exit-1 gotcha)

INPUT="$(cat)"

# ─── Paths ──────────────────────────────────────────────────────────────────
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis-Dev}"
STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"

# ─── Required tools ─────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    printf "[no-jq] statusline degraded"
    exit 0
fi

# ─── Extract from stdin payload (canonical) ─────────────────────────────────
MODEL_DISPLAY=$(echo "$INPUT" | jq -r '.model.display_name // "Unknown"' 2>/dev/null)
MODEL_ID=$(echo "$INPUT" | jq -r '.model.id // "unknown"' 2>/dev/null)
TOKENS=$(echo "$INPUT" | jq -r '.context_window.total_input_tokens // 0' 2>/dev/null)
WINDOW=$(echo "$INPUT" | jq -r '.context_window.context_window_size // 200000' 2>/dev/null)
USED_PCT=$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0' 2>/dev/null)
CACHE_READ=$(echo "$INPUT" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0' 2>/dev/null)
CACHE_CREATE=$(echo "$INPUT" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0' 2>/dev/null)
INPUT_TURN=$(echo "$INPUT" | jq -r '.context_window.current_usage.input_tokens // 0' 2>/dev/null)
COST=$(echo "$INPUT" | jq -r '.cost.total_cost_usd // 0' 2>/dev/null)
RATE_5H=$(echo "$INPUT" | jq -r '.rate_limits.five_hour.used_percentage // 0' 2>/dev/null)
RATE_7D=$(echo "$INPUT" | jq -r '.rate_limits.seven_day.used_percentage // 0' 2>/dev/null)
EFFORT=$(echo "$INPUT" | jq -r '.effort.level // ""' 2>/dev/null)

# Sanitize potential null/missing values
[[ "$TOKENS" == "null" || -z "$TOKENS" ]] && TOKENS=0
[[ "$WINDOW" == "null" || -z "$WINDOW" ]] && WINDOW=200000
[[ "$USED_PCT" == "null" || -z "$USED_PCT" ]] && USED_PCT=0
[[ "$CACHE_READ" == "null" ]] && CACHE_READ=0
[[ "$CACHE_CREATE" == "null" ]] && CACHE_CREATE=0
[[ "$INPUT_TURN" == "null" ]] && INPUT_TURN=0
[[ "$COST" == "null" ]] && COST=0
[[ "$RATE_5H" == "null" ]] && RATE_5H=0
[[ "$RATE_7D" == "null" ]] && RATE_7D=0
[[ "$EFFORT" == "null" ]] && EFFORT=""

# ─── Read JICM state (action, burn rate, ETA, token thresholds) ───────────
# v7.9 state file uses token integers (per User encoding directive); pct
# values are derived here from tokens / WINDOW for display only.
ACTION="WATCHING"
BURN_RATE_TPM=0
HARD_ETA_MIN=0
SOFT_TOKENS=250000
HARD_TOKENS=300000
if [[ -f "$STATE_FILE" ]]; then
    ACTION=$(jq -r '.action // "WATCHING"' "$STATE_FILE" 2>/dev/null)
    BURN_RATE_TPM=$(jq -r '.burn_rate_tpm // 0' "$STATE_FILE" 2>/dev/null)
    HARD_ETA_MIN=$(jq -r '.hard_eta_min // 0' "$STATE_FILE" 2>/dev/null)
    SOFT_TOKENS=$(jq -r '.soft_threshold_tokens // 250000' "$STATE_FILE" 2>/dev/null)
    HARD_TOKENS=$(jq -r '.hard_threshold_tokens // 300000' "$STATE_FILE" 2>/dev/null)
    [[ "$ACTION" == "null" ]] && ACTION="WATCHING"
    [[ "$BURN_RATE_TPM" == "null" ]] && BURN_RATE_TPM=0
    [[ "$HARD_ETA_MIN" == "null" ]] && HARD_ETA_MIN=0
    [[ "$SOFT_TOKENS" == "null" ]] && SOFT_TOKENS=250000
    [[ "$HARD_TOKENS" == "null" ]] && HARD_TOKENS=300000
fi
# Derive pct ticks for the bar (display-only)
if [[ "$WINDOW" -gt 0 ]]; then
    SOFT_PCT=$(( SOFT_TOKENS * 100 / WINDOW ))
    HARD_PCT=$(( HARD_TOKENS * 100 / WINDOW ))
else
    SOFT_PCT=30
    HARD_PCT=65
fi

# ─── Compute cache hit ratio (current turn only) ───────────────────────────
# Hit = cache_read / (cache_read + cache_creation + new input)
CACHE_HIT_PCT=0
CACHE_DENOM=$(( CACHE_READ + CACHE_CREATE + INPUT_TURN ))
if [[ "$CACHE_DENOM" -gt 0 ]]; then
    CACHE_HIT_PCT=$(( CACHE_READ * 100 / CACHE_DENOM ))
fi

# ─── Build stack bar (20 chars; ticks at soft + hard thresholds) ───────────
BAR_WIDTH=20
SOFT_POS=$(( SOFT_PCT * BAR_WIDTH / 100 ))
HARD_POS=$(( HARD_PCT * BAR_WIDTH / 100 ))
NATIVE_POS=$(( 70 * BAR_WIDTH / 100 ))   # native auto-compact at 70%
FILLED=$(( USED_PCT * BAR_WIDTH / 100 ))

BAR=""
for ((i=0; i<BAR_WIDTH; i++)); do
    # Threshold ticks take visual priority over fill
    if [[ "$i" -eq "$SOFT_POS" ]]; then
        BAR+="│"
        continue
    fi
    if [[ "$i" -eq "$HARD_POS" ]]; then
        BAR+="┃"
        continue
    fi
    if [[ "$i" -eq "$NATIVE_POS" ]]; then
        BAR+="╿"
        continue
    fi
    if [[ "$i" -lt "$FILLED" ]]; then
        if [[ "$i" -ge "$HARD_POS" ]]; then
            BAR+="█"   # past hard — danger zone fill
        elif [[ "$i" -ge "$SOFT_POS" ]]; then
            BAR+="▓"   # past soft — warn zone fill
        else
            BAR+="▒"   # normal fill
        fi
    else
        BAR+="░"       # empty
    fi
done

# ─── Color selection ───────────────────────────────────────────────────────
# Tied to JICM action so users see the same signal the gate is acting on.
NC="\033[0m"
case "$ACTION" in
    HARD_HALT)
        COLOR="\033[1;31m"   # bold red
        ICON="⛔"
        ;;
    SOFT_NUDGE)
        COLOR="\033[1;33m"   # bold yellow
        ICON="⚠️ "
        ;;
    WATCHING)
        # Sub-grade by raw % even when watching, so user sees ramp-up
        if [[ "$USED_PCT" -ge 50 ]]; then
            COLOR="\033[0;33m"   # yellow
            ICON="🟡"
        else
            COLOR="\033[0;32m"   # green
            ICON="🟢"
        fi
        ;;
    *)
        COLOR="\033[0;37m"
        ICON="·"
        ;;
esac

# ─── Format short model id (drop "claude-" prefix; keep 1M marker) ────────
# NB: in glob patterns, [1m] is a character class. To strip a literal trailing
# "[1m]" we escape the brackets with backslashes.
MODEL_SHORT="${MODEL_ID#claude-}"
case "$MODEL_SHORT" in
    *\[1m\]) MODEL_SHORT="${MODEL_SHORT%\[1m\]}·1M" ;;
esac

# ─── Format burn rate compactly (K=1000) ──────────────────────────────────
if [[ "$BURN_RATE_TPM" -ge 1000 ]]; then
    BURN_FMT=$(awk -v t="$BURN_RATE_TPM" 'BEGIN{printf "%.1fK", t/1000}')
else
    BURN_FMT="${BURN_RATE_TPM}"
fi

# ─── Format cost ─────────────────────────────────────────────────────────────
COST_FMT=$(awk -v c="$COST" 'BEGIN{printf "%.2f", c}')

# ─── Format hard ETA (∞ if no burn rate yet) ────────────────────────────────
if [[ "$BURN_RATE_TPM" -le 0 ]]; then
    ETA_FMT="—"
elif [[ "$HARD_ETA_MIN" -ge 60 ]]; then
    ETA_FMT=$(awk -v m="$HARD_ETA_MIN" 'BEGIN{printf "%.1fh", m/60}')
else
    ETA_FMT="${HARD_ETA_MIN}m"
fi

# ─── Effort indicator (xhigh → 'x' suffix) ─────────────────────────────────
EFFORT_SUFFIX=""
case "$EFFORT" in
    xhigh) EFFORT_SUFFIX="·x" ;;
    high)  EFFORT_SUFFIX="·H" ;;
    *)     EFFORT_SUFFIX="" ;;
esac

# ─── Render ─────────────────────────────────────────────────────────────────
# Format:
#   ICON MODEL  [BAR] PCT%  Δburn  HardETA  Cache%  $cost  5h/7d  ACTION
printf "${COLOR}%s${NC} %s%s [%s] %s%%  Δ%s/m  H:%s  C:%s%%  \$%s  RL:%s/%s  ${COLOR}%s${NC}" \
    "$ICON" \
    "$MODEL_SHORT" \
    "$EFFORT_SUFFIX" \
    "$BAR" \
    "$USED_PCT" \
    "$BURN_FMT" \
    "$ETA_FMT" \
    "$CACHE_HIT_PCT" \
    "$COST_FMT" \
    "$RATE_5H" \
    "$RATE_7D" \
    "$ACTION"
