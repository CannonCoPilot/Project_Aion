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
#   JICM_SOFT_TOKENS=550000   Soft threshold in TOKENS (default 550K = 55% of 1M)
#   JICM_HARD_TOKENS=600000   Hard threshold in TOKENS (default 600K = 60% of 1M)
#     Both are CLAMPED per detected window: for windows < 1M — including the
#     conservative 250K default used for an UNIDENTIFIED model — hard=window*0.80
#     and soft=window*0.66. So an unknown model gets a 250K window with a 200K
#     reset; on a 1M window the clamp is a no-op (250K/300K stand).
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
STATE_UPDATE="$PROJECT_DIR/.claude/scripts/jicm-state-update.sh"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

# JICM v9: shared config provides jicm_derive_key, jicm_key_paths (JK_*), and
# jicm_registry_upsert. GUARD the load: if config is missing/broken, the key would
# resolve to "" → state silently collapses onto W0's legacy file (dev data corrupting
# W0). Fail SAFE: log loud + pass through WITHOUT writing any state.
JICM_CONFIG="$PROJECT_DIR/.claude/scripts/jicm-config.sh"
[[ -r "$JICM_CONFIG" ]] && . "$JICM_CONFIG"
if ! command -v jicm_key_paths >/dev/null 2>&1 || ! command -v jicm_derive_key >/dev/null 2>&1; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | FATAL | jicm-config.sh failed to load — NOT writing state (would corrupt W0's shared file)" >> "$LOG_FILE"
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# Default thresholds in TOKENS (User encoding directive: not percentages)
JICM_SOFT_TOKENS="${JICM_SOFT_TOKENS:-550000}"   # 55% of 1M (config sets this; inline = fail-safe default)
JICM_HARD_TOKENS="${JICM_HARD_TOKENS:-600000}"   # 60% of 1M — above W0's ~380K resume baseline

# ─── Disable check ──────────────────────────────────────────────────────────
if [[ "${JICM_DISABLED:-false}" == "true" ]] || [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── JICM v9: W5/dev exclusion DELETED ──────────────────────────────────────
# The exclusion existed ONLY because dev + W0 shared one .jicm-state-hook.json, so
# dev prompts clobbered W0's state (Sonnet/200K masking Opus/1M) and blinded the
# watcher. Now that state is namespaced per <key> (JK_STATE below), dev writes its
# OWN file and can no longer touch W0's — so dev is SENSED (required for the v9
# supervisor + registry), not excluded. Key derivation replaces the guard.

# ─── Extract identifiers from stdin ─────────────────────────────────────────
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
[[ "$SESSION_ID" == "null" ]] && SESSION_ID="unknown"
[[ "$TRANSCRIPT" == "null" ]] && TRANSCRIPT=""

# ─── JICM v9: derive session key + per-key paths (replaces the exclusion) ────
JICM_KEY="$(jicm_derive_key "$SESSION_ID")"
KEY_TARGET="$(jicm_default_target "$JICM_KEY")"
jicm_key_paths "$JICM_KEY"
mkdir -p "$(dirname "$JK_STATE")" 2>/dev/null

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
    # Skip assistant entries with no usage object (e.g. "<synthetic>" hook/system
    # messages). Taking the last assistant message unconditionally would read a
    # synthetic tail's absent usage as 0 tokens — blinding JICM to the real
    # context size. Take the last assistant message that actually carries usage.
    USAGE=$(tail -n 200 "$TRANSCRIPT" 2>/dev/null | jq -s 'last(.[] | select(.type=="assistant" and .message.usage != null) | .message.usage)' 2>/dev/null)
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
    # Latest assistant message's REAL model id. Skip entries whose model is
    # "<synthetic>" or null (hook-injected / system messages) so a synthetic tail
    # message can't mask the deployed model and drop us to the conservative
    # default window.
    MODEL=$(tail -n 200 "$TRANSCRIPT" 2>/dev/null | jq -rs 'last(.[] | select(.type=="assistant") | .message.model | select(. != null and . != "<synthetic>" and . != ""))' 2>/dev/null)
    [[ "$MODEL" == "null" || -z "$MODEL" ]] && MODEL=""
fi

# Fallback: when the transcript has no real model yet (a brand-new session's
# first prompt), use the launcher's declared model so JICM still "expects" the
# correct window for this lane rather than defaulting conservatively. Empty if
# AION_MODEL isn't inherited — then TOKENS is ~0 anyway, so the default is safe.
[[ -z "$MODEL" ]] && MODEL="${AION_MODEL:-}"

# ─── Window-size lookup (from model id) ─────────────────────────────────────
case "$MODEL" in
    # NOTE: match the SPECIFIC 200K tiers before any broad family glob, and keep every
    # shipping model listed. A model absent from this map is not "safe by default" — it
    # silently lands on the 250K unknown branch, whose 200K clamp then reads a real 1M
    # session as permanently over-threshold (see R4/R5 finding, 2026-07-27).
    *opus-5*)                          WINDOW=1000000 ;;  # Opus 5 = 1M — the current launcher default
    *opus-4-8*)                        WINDOW=1000000 ;;  # Opus 4.8 1M
    *opus-4-7*|*opus-4-6*|*opus-4-5*)  WINDOW=1000000 ;;  # legacy 1M opus (resumed sessions)
    *fable-5*|*mythos-5*)              WINDOW=1000000 ;;  # Fable 5 / Mythos 5 = 1M
    *sonnet-5*)                        WINDOW=1000000 ;;  # Sonnet 5 = 1M
    *sonnet-4-6*)                      WINDOW=200000  ;;  # launched as the 200K tier
    *haiku-4-5*)                       WINDOW=200000  ;;  # Haiku 4.5 = 200K
    *)                                 WINDOW=250000  ;;  # UNKNOWN model → conservative 250K default (User directive)
esac

# ─── Suffix audit against the launcher's declared intent ────────────────────
# The case map above is a HEURISTIC standing in for a fact it cannot observe.
# 1M is not a property of a model family — it is an opt-in beta window selected
# by the `[1m]` ID suffix, and the CLI STRIPS that suffix before the request goes
# out. So the transcript's .message.model reads `claude-opus-5` for a 1M session
# and for a 200K session alike: the real window is UNRECOVERABLE from the
# transcript. AION_MODEL, however, is the launcher's declared intent and DOES
# carry the suffix — it is the only authoritative signal we have.
#
# This is not hypothetical. On 2026-08-01 launch-aion.sh was found seeding a bare
# `claude-opus-5` (the suffix was lost in the 4.7->5 migration). Every lane ran at
# 200K while this map asserted 1M, so JICM's hard threshold sat ABOVE the entire
# real window and could not fire once. Native autocompact took every cycle
# instead. The map agreeing with the INTENT while disagreeing with REALITY is
# exactly what made it silent for weeks — nothing that only consults the map can
# ever catch it.
#
# So when AION_MODEL is available, audit it. A 1M-family model declared WITHOUT
# the suffix means the session really is 200K: use the truth and ALERT. Do NOT
# "helpfully" assume 1M — that assumption IS the bug.
if [[ -n "${AION_MODEL:-}" && "$WINDOW" -eq 1000000 ]]; then
    case "$AION_MODEL" in
        *\[1m\]|*\[1M\]) : ;;   # suffix present — the 1M mapping is genuine
        *)
            WINDOW=200000
            # NOTE: NOW_ISO is not assigned until later in this script, so stamp inline.
            echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | ALERT | key=$JICM_KEY | AION_MODEL='$AION_MODEL' declares a 1M-family model WITHOUT the [1m] suffix — real window is 200K, not 1M. JICM thresholds clamped to 200K. FIX THE LAUNCHER (launch-aion.sh AION_MODEL default); do not tune around this." >> "$LOG_FILE"
            ;;
    esac
fi

# ─── Per-window threshold clamp ─────────────────────────────────────────────
# Global soft/hard thresholds (250K/300K) are tuned for a 1M window. For any
# smaller window — including the conservative 250K default used for an
# unidentified model — clamp the reset (hard) threshold to 80% of the window and
# the soft nudge to 66%, so we always clear well before overflow. On a 1M window
# the clamp is a no-op (250K/300K unchanged). Per User directive: an unknown
# model gets a 250K window with a 200K reset (250K x 0.80 = 200K).
WIN_HARD=$(( WINDOW * 80 / 100 ))
WIN_SOFT=$(( WINDOW * 66 / 100 ))
[[ "$WIN_HARD" -lt "$JICM_HARD_TOKENS" ]] && JICM_HARD_TOKENS="$WIN_HARD"
[[ "$WIN_SOFT" -lt "$JICM_SOFT_TOKENS" ]] && JICM_SOFT_TOKENS="$WIN_SOFT"

# ─── Burn-rate tracking (delta vs. previous state) ──────────────────────────
PREV_TOKENS=0
PREV_TS=0
if [[ -f "$JK_STATE" ]]; then
    PREV_TOKENS=$(jq -r '.tokens // 0' "$JK_STATE" 2>/dev/null)
    PREV_TS=$(jq -r '.ts_epoch // 0' "$JK_STATE" 2>/dev/null)
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

# ─── Rate limits (out-of-band) ──────────────────────────────────────────────
# UserPromptSubmit stdin carries no `rate_limits` (nor cost, nor context_window)
# — see .claude/metrics/jicm/v7-9-baseline-2026-05-02.md. These two fields were
# therefore hardcoded `null`, which left jicm-watcher-hud.sh's 5h/7d columns
# permanently blank while the data sat in the usage-proxy DB the whole time.
# Read the cache refresh-ratelimit-cache.sh maintains. Stale-window values are
# dropped rather than shown: a utilisation for a window that already reset is
# not stale, it is wrong.
RATE_5H_PCT=null
RATE_7D_PCT=null
_RL_CACHE="$PROJECT_DIR/.claude/context/.ratelimit-cache.json"
if [[ -f "$_RL_CACHE" ]] && command -v jq >/dev/null 2>&1; then
    _rl=$(cat "$_RL_CACHE" 2>/dev/null)
    if [[ -n "$_rl" ]]; then
        _u5=$(jq -r '.five_hour.utilization // ""' <<<"$_rl" 2>/dev/null)
        _r5=$(jq -r '.five_hour.reset_epoch // 0' <<<"$_rl" 2>/dev/null)
        _u7=$(jq -r '.seven_day.utilization // ""' <<<"$_rl" 2>/dev/null)
        _r7=$(jq -r '.seven_day.reset_epoch // 0' <<<"$_rl" 2>/dev/null)
        [[ -n "$_u5" && "$_u5" != "null" && "$_r5" -gt "$NOW_TS" ]] && \
            RATE_5H_PCT=$(awk -v v="$_u5" 'BEGIN{printf "%d", v*100}')
        [[ -n "$_u7" && "$_u7" != "null" && "$_r7" -gt "$NOW_TS" ]] && \
            RATE_7D_PCT=$(awk -v v="$_u7" 'BEGIN{printf "%d", v*100}')
    fi
fi

# ─── Atomic state write via helper ──────────────────────────────────────────
if [[ -x "$STATE_UPDATE" ]]; then
    cat <<JSON | JICM_HOOK_STATE_FILE="$JK_STATE" "$STATE_UPDATE" --write
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
  "rate_5h_pct": $RATE_5H_PCT,
  "rate_7d_pct": $RATE_7D_PCT,
  "action": "$ACTION",
  "pending_action": $PENDING_ACTION,
  "transcript_path": "$TRANSCRIPT"
}
JSON
fi

# ─── JICM v9: registry heartbeat (supervisor reads this; last_seen = liveness) ───
# Additive — never read by the legacy watcher, so W0 stays byte-identical. Refreshes
# the LIVE transcript_path every prompt (each session = a new UUID) so the supervisor
# always has the current transcript. steward_shared_memory=true only for w0.

# ─── JICM v9 STAGE ②: continuity bind ────────────────────────────────────────
# Close the lineage edge that stage ① opened just before the /clear. Only worth attempting on
# this session's FIRST gate write — detected by the registry still naming a DIFFERENT session_id.
# (jicm-chain.sh bind is idempotent regardless; this guard just avoids a jq on every prompt.)
# Failure is non-fatal by design: the gate's contract is to update state and always pass through,
# so a bookkeeping problem must never block the user's turn. It ALERTs into the JICM log instead.
if [[ "$(jicm_registry_get "$JICM_KEY" '.session_id')" != "$SESSION_ID" ]]; then
    if ! "$(dirname "${BASH_SOURCE[0]}")/../scripts/jicm-chain.sh" bind "$JICM_KEY" "$SESSION_ID" 2>>"$LOG_FILE"; then
        echo "$NOW_ISO | ALERT | key=$JICM_KEY | continuity bind FAILED for ${SESSION_ID:0:8} — succession edge unrecorded" >> "$LOG_FILE"
    fi
fi

REG_EXTRA=""
[[ "$JICM_KEY" == "w0" ]] && REG_EXTRA="steward_shared_memory=true"
ACTUATION_MODE="$(jicm_actuation_mode "$JICM_KEY")"   # pane (w0/dev occupant) | self (background /fork)
jicm_registry_upsert "$JICM_KEY" \
    session_id="$SESSION_ID" transcript_path="$TRANSCRIPT" tmux_target="$KEY_TARGET" \
    actuation_mode="$ACTUATION_MODE" \
    class=interactive reset_policy=preserve-restore owner=jarvis $REG_EXTRA

# ─── Log ────────────────────────────────────────────────────────────────────
echo "$NOW_ISO | $ACTION | key=$JICM_KEY | tokens=$TOKENS/$WINDOW (${USED_PCT}%) | thresholds soft=$JICM_SOFT_TOKENS hard=$JICM_HARD_TOKENS | burn=${BURN_RATE_TPM}tpm | model=$MODEL | session=$SESSION_ID" >> "$LOG_FILE"

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
