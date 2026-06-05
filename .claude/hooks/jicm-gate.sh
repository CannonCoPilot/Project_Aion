#!/bin/bash
# ============================================================================
# JICM v7.9 — Gate Hook (UserPromptSubmit)
# ============================================================================
#
# Phase 7.9.1 task #2 — sensing + state update.
#
# SENSING SOURCE: JSONL transcript parsing (per baseline doc §3).
#   The roadmap's original §4.1 plan to read context_window from UPS hook
#   stdin was incorrect — that field is NOT in any hook event's stdin.
#   JSONL transcript at $transcript_path is the canonical source.
#
# Formula: current_context_tokens = input_tokens
#                                 + cache_read_input_tokens
#                                 + cache_creation_input_tokens
#
# Verified within ~3.6% of v7 capture-pane reading; conservative lower bound.
#
# DOES NOT actuate. State write only. Watcher (slim) does actuation after
# Stop hook writes .jicm-clear-now.signal.
#
# PHASE 0.2 REFACTOR (2026-05-03): state-hook now carries cache_creation
# breakdown so token-compression metrics (eph_1h adoption, cache hit rate)
# can read directly from .jicm-state-hook.json without re-parsing JSONL.
#   cache_creation_tokens     — flat scalar (sum, all ephemerals combined)
#   cache_creation_5m_tokens  — usage.cache_creation.ephemeral_5m_input_tokens
#   cache_creation_1h_tokens  — usage.cache_creation.ephemeral_1h_input_tokens
#   cache_hit_rate            — cache_read / (cache_read + cache_creation + input)
# Canonical formulas shared with cache-telemetry-extractor-v2.py per
# .claude/context/reference/jicm-token-formulas.md.
#
# ENCODING: token counts strictly preferred over percentages (User directive
# 2026-05-02). Thresholds, ETAs, and primary state fields are token integers;
# percentages are computed for display only.
#
# ENV OVERRIDES:
#   JICM_DISABLED=true        Skip the hook entirely (e.g., during /end-session)
#   JICM_SOFT_TOKENS=250000   Soft threshold in TOKENS (default 250K = 25% of 1M)
#   JICM_HARD_TOKENS=300000   Hard threshold in TOKENS (default 300K = 30% of 1M)
#   JICM_PROJECT_DIR=...      Override CLAUDE_PROJECT_DIR (rare)
#
# OUTPUT (always JSON to stdout, exit 0):
#   {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}
#
# EXIT CODES: always 0 unless catastrophic (missing jq).
# ============================================================================

set -o pipefail   # NB: NOT -euo (per Jarvis MEMORY.md grep-exit-1 gotcha)

INPUT="$(cat)"

# ─── Required tools ─────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Config ─────────────────────────────────────────────────────────────────
PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-gate.log"
STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
STATE_UPDATE="$PROJECT_DIR/.claude/scripts/jicm-state-update.sh"

# Default thresholds in TOKENS (User encoding directive: not percentages)
JICM_SOFT_TOKENS="${JICM_SOFT_TOKENS:-250000}"   # 25% of 1M default
JICM_HARD_TOKENS="${JICM_HARD_TOKENS:-300000}"   # 30% of 1M default

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$STATE_FILE")" 2>/dev/null

# ─── Disable check ──────────────────────────────────────────────────────────
if [[ "${JICM_DISABLED:-false}" == "true" ]] || [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Extract identifiers from stdin ─────────────────────────────────────────
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
[[ "$SESSION_ID" == "null" ]] && SESSION_ID="unknown"
[[ "$TRANSCRIPT" == "null" ]] && TRANSCRIPT=""

# ─── Parse JSONL for latest assistant usage (CANONICAL SOURCE) ──────────────
# Phase 0.2 refactor: extract ephemeral cache breakdown so .jicm-state-hook.json
# carries the data token-compression Phase 1.x metrics need (eph_1h adoption,
# cache hit rate). See .claude/context/reference/jicm-token-formulas.md for the
# canonical formulas shared between this hook and cache-telemetry-extractor-v2.py.
TOKENS=0
INPUT_T=0
CACHE_R=0
CACHE_C=0
CACHE_5M=0
CACHE_1H=0
OUTPUT_T=0
HIT_RATE="0.0000"
MODEL=""

if [[ -f "$TRANSCRIPT" ]]; then
    # Latest assistant message's usage object
    USAGE=$(tail -n 200 "$TRANSCRIPT" 2>/dev/null | jq -s 'last(.[] | select(.type=="assistant") | .message.usage)' 2>/dev/null)
    if [[ -n "$USAGE" ]] && [[ "$USAGE" != "null" ]]; then
        INPUT_T=$(echo "$USAGE" | jq -r '.input_tokens // 0' 2>/dev/null)
        CACHE_R=$(echo "$USAGE" | jq -r '.cache_read_input_tokens // 0' 2>/dev/null)
        CACHE_C=$(echo "$USAGE" | jq -r '.cache_creation_input_tokens // 0' 2>/dev/null)
        CACHE_5M=$(echo "$USAGE" | jq -r '.cache_creation.ephemeral_5m_input_tokens // 0' 2>/dev/null)
        CACHE_1H=$(echo "$USAGE" | jq -r '.cache_creation.ephemeral_1h_input_tokens // 0' 2>/dev/null)
        OUTPUT_T=$(echo "$USAGE" | jq -r '.output_tokens // 0' 2>/dev/null)
        [[ "$INPUT_T" == "null" || -z "$INPUT_T" ]] && INPUT_T=0
        [[ "$CACHE_R" == "null" || -z "$CACHE_R" ]] && CACHE_R=0
        [[ "$CACHE_C" == "null" || -z "$CACHE_C" ]] && CACHE_C=0
        [[ "$CACHE_5M" == "null" || -z "$CACHE_5M" ]] && CACHE_5M=0
        [[ "$CACHE_1H" == "null" || -z "$CACHE_1H" ]] && CACHE_1H=0
        [[ "$OUTPUT_T" == "null" || -z "$OUTPUT_T" ]] && OUTPUT_T=0
        TOKENS=$((INPUT_T + CACHE_R + CACHE_C))
        # Cache hit rate: cache_read / (cache_read + cache_creation_total + input_tokens)
        # awk used because bash integer arithmetic truncates; 4-decimal-place precision.
        DENOM=$((CACHE_R + CACHE_C + INPUT_T))
        if [[ "$DENOM" -gt 0 ]]; then
            HIT_RATE=$(awk -v r="$CACHE_R" -v d="$DENOM" 'BEGIN { printf "%.4f", r/d }')
        fi
    fi
    # Latest assistant message's model id
    MODEL=$(tail -n 200 "$TRANSCRIPT" 2>/dev/null | jq -rs 'last(.[] | select(.type=="assistant") | .message.model)' 2>/dev/null)
    [[ "$MODEL" == "null" || -z "$MODEL" ]] && MODEL=""
fi

# ─── Window-size lookup (from model id) ─────────────────────────────────────
case "$MODEL" in
    *opus-4-7*1m*)  WINDOW=1000000 ;;
    *opus-4-7*)     WINDOW=1000000 ;;  # Jarvis exclusively runs opus-4-7 1M variant
    *sonnet-4-6*)   WINDOW=200000  ;;
    *haiku-4-5*)    WINDOW=200000  ;;
    *)              WINDOW=1000000 ;;  # safe upper bound (Jarvis runs 1M opus)
esac

# ─── Burn-rate tracking (delta vs. previous state) ──────────────────────────
PREV_TOKENS=0
PREV_TS=0
if [[ -f "$STATE_FILE" ]]; then
    PREV_TOKENS=$(jq -r '.tokens // 0' "$STATE_FILE" 2>/dev/null)
    PREV_TS=$(jq -r '.ts_epoch // 0' "$STATE_FILE" 2>/dev/null)
    [[ "$PREV_TOKENS" == "null" ]] && PREV_TOKENS=0
    [[ "$PREV_TS" == "null" ]] && PREV_TS=0
fi
NOW_TS=$(date +%s)
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BURN_RATE_TPM=0
SOFT_ETA_MIN=0
HARD_ETA_MIN=0

if [[ "$PREV_TOKENS" -gt 0 ]] && [[ "$PREV_TS" -gt 0 ]] && [[ "$TOKENS" -gt "$PREV_TOKENS" ]]; then
    DELTA_T=$((TOKENS - PREV_TOKENS))
    DELTA_S=$((NOW_TS - PREV_TS))
    if [[ "$DELTA_S" -gt 0 ]]; then
        BURN_RATE_TPM=$((DELTA_T * 60 / DELTA_S))
        if [[ "$BURN_RATE_TPM" -gt 0 ]]; then
            SOFT_REM=$((JICM_SOFT_TOKENS - TOKENS))
            HARD_REM=$((JICM_HARD_TOKENS - TOKENS))
            [[ "$SOFT_REM" -gt 0 ]] && SOFT_ETA_MIN=$((SOFT_REM / BURN_RATE_TPM)) || SOFT_ETA_MIN=0
            [[ "$HARD_REM" -gt 0 ]] && HARD_ETA_MIN=$((HARD_REM / BURN_RATE_TPM)) || HARD_ETA_MIN=0
        fi
    fi
fi

# ─── Determine action + pending_action ──────────────────────────────────────
ACTION="WATCHING"
PENDING_ACTION="null"
if [[ "$TOKENS" -ge "$JICM_HARD_TOKENS" ]]; then
    ACTION="HARD_HALT"
    PENDING_ACTION='"HALT_AFTER_RESPONSE"'
elif [[ "$TOKENS" -ge "$JICM_SOFT_TOKENS" ]]; then
    ACTION="SOFT_NUDGE"
    PENDING_ACTION='"HALT_AFTER_RESPONSE"'
fi

# ─── Used percentage (display-only; derived from tokens) ────────────────────
USED_PCT=0
if [[ "$WINDOW" -gt 0 ]]; then
    USED_PCT=$((TOKENS * 100 / WINDOW))
fi

# ─── Atomic state write via helper ──────────────────────────────────────────
if [[ -x "$STATE_UPDATE" ]]; then
    cat <<JSON | "$STATE_UPDATE" --write
{
  "version": "7.9",
  "ts": "$NOW_ISO",
  "ts_epoch": $NOW_TS,
  "session_id": "$SESSION_ID",
  "model_id": "$MODEL",
  "tokens": $TOKENS,
  "input_tokens": $INPUT_T,
  "cache_read_tokens": $CACHE_R,
  "cache_creation_tokens": $CACHE_C,
  "cache_creation_5m_tokens": $CACHE_5M,
  "cache_creation_1h_tokens": $CACHE_1H,
  "cache_hit_rate": $HIT_RATE,
  "output_tokens_last": $OUTPUT_T,
  "context_window_size": $WINDOW,
  "soft_threshold_tokens": $JICM_SOFT_TOKENS,
  "hard_threshold_tokens": $JICM_HARD_TOKENS,
  "burn_rate_tpm": $BURN_RATE_TPM,
  "soft_eta_min": $SOFT_ETA_MIN,
  "hard_eta_min": $HARD_ETA_MIN,
  "used_percentage": $USED_PCT,
  "cost_usd": null,
  "rate_5h_pct": null,
  "rate_7d_pct": null,
  "action": "$ACTION",
  "pending_action": $PENDING_ACTION,
  "transcript_path": "$TRANSCRIPT"
}
JSON
fi

# ─── Log ────────────────────────────────────────────────────────────────────
echo "$NOW_ISO | $ACTION | tokens=$TOKENS/$WINDOW (${USED_PCT}%) | thresholds soft=$JICM_SOFT_TOKENS hard=$JICM_HARD_TOKENS | burn=${BURN_RATE_TPM}tpm | model=$MODEL | session=$SESSION_ID" >> "$LOG_FILE"

# Rotate log if > 100KB
LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [[ "$LOG_SIZE" -gt 102400 ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1" 2>/dev/null
fi

# ─── Always pass through ─────────────────────────────────────────────────────
# Per v7.9 spec: hook ONLY updates state. NO additionalContext, NO decision:block.
# Actuation belongs to the watcher, triggered by jicm-stop.sh writing .jicm-clear-now.signal.
echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
exit 0
