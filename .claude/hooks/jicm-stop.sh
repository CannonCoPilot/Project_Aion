#!/bin/bash
# ============================================================================
# JICM v7.9 — Stop Hook
# ============================================================================
#
# Phase 7.9.1 task #3 — actuator-trigger signal writer.
#
# Fires after every Claude turn completes (Stop event). Reads the state file
# written by jicm-gate.sh; if pending_action == HALT_AFTER_RESPONSE, writes
# .jicm-clear-now.signal which the slim legacy watcher (Phase 7.9.3) consumes.
#
# This is the natural idle moment: Claude has just finished responding and
# the next turn hasn't started. The legacy watcher polls the signal on a 1s tick.
#
# ARCHITECTURE:
#   1. jicm-gate.sh (UPS) reads JSONL → updates state → flags pending if over threshold
#   2. Claude generates response → Stop fires
#   3. jicm-stop.sh (this) reads state → if pending → writes .jicm-clear-now.signal
#   4. Legacy watcher (slim, signal-driven) sees signal → injects /clear via tmux backend
#   5. SessionStart hook restores compressed context → writes .jicm-resume-complete.signal
#   6. Legacy watcher injects RESUME prompt via tmux backend
#
# RECURSION GUARD: stop_hook_active==true → skip (avoid loops)
#
# EXIT CODES: always 0 (no JSON output expected from Stop hook)
# ============================================================================

set -o pipefail

INPUT="$(cat)"

if ! command -v jq >/dev/null 2>&1; then
    exit 0
fi

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
STATE_UPDATE="$PROJECT_DIR/.claude/scripts/jicm-state-update.sh"
LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-stop.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# JICM v9: shared config provides jicm_derive_key / jicm_key_paths (JK_*). GUARD the
# load: if config is missing/broken the key resolves to "" and (via jicm-state-update)
# state could collapse onto W0's legacy file. Fail SAFE: log loud + exit 0 (no signal).
# Key derivation itself is deferred until after the recursion/disable short-circuits.
JICM_CONFIG="$PROJECT_DIR/.claude/scripts/jicm-config.sh"
[[ -r "$JICM_CONFIG" ]] && . "$JICM_CONFIG"
if ! command -v jicm_key_paths >/dev/null 2>&1 || ! command -v jicm_derive_key >/dev/null 2>&1; then
    echo "$NOW_ISO | FATAL | jicm-config.sh failed to load — skipping (no signal written)" >> "$LOG_FILE"
    exit 0
fi

# ─── Recursion guard ─────────────────────────────────────────────────────────
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [[ "$STOP_ACTIVE" == "true" ]]; then
    echo "$NOW_ISO | SKIP | stop_hook_active=true (recursion guard)" >> "$LOG_FILE"
    exit 0
fi

# ─── JICM v9: W11/dev exclusion DELETED ──────────────────────────────────────
# Was needed because gate/stop shared ONE state+signal file, so a dev Stop would
# fire W0's pending clear. Now each key reads its OWN JK_STATE and writes its OWN
# JK_CLEAR_SIGNAL (derived below) — a dev Stop can only ever raise dev's signal,
# never W0's. So dev participates (its clear-signal feeds the v9 watcher).

# ─── Disable check ───────────────────────────────────────────────────────────
if [[ "${JICM_DISABLED:-false}" == "true" ]] || [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    echo "$NOW_ISO | SKIP | JICM disabled (env or exit-mode signal)" >> "$LOG_FILE"
    exit 0
fi

# ─── JICM v9: derive key + per-key paths (JK_STATE, JK_CLEAR_SIGNAL) ─────────
SESSION_ID_IN=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[[ "$SESSION_ID_IN" == "null" ]] && SESSION_ID_IN=""
JICM_KEY="$(jicm_derive_key "$SESSION_ID_IN")"
jicm_key_paths "$JICM_KEY"

# ─── Read state file ─────────────────────────────────────────────────────────
if [[ ! -f "$JK_STATE" ]]; then
    echo "$NOW_ISO | SKIP | key=$JICM_KEY no state file at $JK_STATE" >> "$LOG_FILE"
    exit 0
fi

PENDING=$(jq -r '.pending_action // ""' "$JK_STATE" 2>/dev/null)
[[ "$PENDING" == "null" ]] && PENDING=""

if [[ "$PENDING" != "HALT_AFTER_RESPONSE" ]]; then
    # Below threshold — quiet pass-through (most common case).
    #
    # OPT-IN TRACE. Silence here is indistinguishable from "this hook is not registered
    # at all", which is exactly how Protos ran to 663,980 tokens against a 160,000 hard
    # threshold: the gate was registered in alfred's settings.json but the SIGNAL RAISER
    # was not, so pending_action was set every turn and nothing ever acted on it. There
    # was no way to tell a healthy quiet lane from an unmanaged one without waiting for a
    # threshold crossing that could never fire. `touch .claude/context/.jicm-stop-trace`
    # to make registration observable on ANY turn, then remove it.
    [[ -f "$PROJECT_DIR/.claude/context/.jicm-stop-trace" ]] && \
        echo "$NOW_ISO | TRACE | key=$JICM_KEY registered + invoked, below threshold (pending='$PENDING')" >> "$LOG_FILE"
    exit 0
fi

# ─── Threshold tripped: write signal ─────────────────────────────────────────
TOKENS=$(jq -r '.tokens // 0' "$JK_STATE" 2>/dev/null)
ACTION=$(jq -r '.action // "unknown"' "$JK_STATE" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // "unknown"' "$JK_STATE" 2>/dev/null)
THRESHOLD_TOKENS=$(jq -r '.hard_threshold_tokens // 0' "$JK_STATE" 2>/dev/null)

# Signal JSON schema UNCHANGED (byte-identical for w0 — the legacy watcher parses these exact
# fields; the key is encoded in the signal's PATH, so no extra field is added).
mkdir -p "$(dirname "$JK_CLEAR_SIGNAL")" 2>/dev/null
cat > "$JK_CLEAR_SIGNAL" <<JSON
{"threshold_type":"$ACTION","tokens":$TOKENS,"threshold_tokens":$THRESHOLD_TOKENS,"session_id":"$SESSION_ID","ts":"$NOW_ISO"}
JSON

echo "$NOW_ISO | SIGNAL | key=$JICM_KEY wrote $(basename "$JK_CLEAR_SIGNAL") | tokens=$TOKENS action=$ACTION session=$SESSION_ID" >> "$LOG_FILE"

# ─── Clear pending_action atomically (per-key state file) ────────────────────
if [[ -x "$STATE_UPDATE" ]]; then
    JICM_HOOK_STATE_FILE="$JK_STATE" "$STATE_UPDATE" --clear-pending
fi

# Rotate log if > 100KB
LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [[ "$LOG_SIZE" -gt 102400 ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1" 2>/dev/null
fi

exit 0
