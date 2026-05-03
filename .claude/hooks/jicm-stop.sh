#!/bin/bash
# ============================================================================
# JICM v7.9 — Stop Hook
# ============================================================================
#
# Phase 7.9.1 task #3 — actuator-trigger signal writer.
#
# Fires after every Claude turn completes (Stop event). Reads the state file
# written by jicm-gate.sh; if pending_action == HALT_AFTER_RESPONSE, writes
# .jicm-clear-now.signal which the slim watcher (Phase 7.9.3) consumes.
#
# This is the natural idle moment: Claude has just finished responding and
# the next turn hasn't started. The watcher polls the signal on a 1s tick.
#
# ARCHITECTURE:
#   1. jicm-gate.sh (UPS) reads JSONL → updates state → flags pending if over threshold
#   2. Claude generates response → Stop fires
#   3. jicm-stop.sh (this) reads state → if pending → writes .jicm-clear-now.signal
#   4. Watcher (slim, signal-driven) sees signal → injects /clear via tmux backend
#   5. SessionStart hook restores compressed context → writes .jicm-resume-complete.signal
#   6. Watcher injects RESUME prompt via tmux backend
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

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis-Dev}}"
STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
SIGNAL_FILE="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
STATE_UPDATE="$PROJECT_DIR/.claude/scripts/jicm-state-update.sh"
LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-stop.log"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─── Recursion guard ─────────────────────────────────────────────────────────
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [[ "$STOP_ACTIVE" == "true" ]]; then
    echo "$NOW_ISO | SKIP | stop_hook_active=true (recursion guard)" >> "$LOG_FILE"
    exit 0
fi

# ─── Disable check ───────────────────────────────────────────────────────────
if [[ "${JICM_DISABLED:-false}" == "true" ]] || [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    echo "$NOW_ISO | SKIP | JICM disabled (env or exit-mode signal)" >> "$LOG_FILE"
    exit 0
fi

# ─── Read state file ─────────────────────────────────────────────────────────
if [[ ! -f "$STATE_FILE" ]]; then
    echo "$NOW_ISO | SKIP | no state file at $STATE_FILE" >> "$LOG_FILE"
    exit 0
fi

PENDING=$(jq -r '.pending_action // ""' "$STATE_FILE" 2>/dev/null)
[[ "$PENDING" == "null" ]] && PENDING=""

if [[ "$PENDING" != "HALT_AFTER_RESPONSE" ]]; then
    # Below threshold — quiet pass-through (most common case)
    exit 0
fi

# ─── Threshold tripped: write signal ─────────────────────────────────────────
TOKENS=$(jq -r '.tokens // 0' "$STATE_FILE" 2>/dev/null)
ACTION=$(jq -r '.action // "unknown"' "$STATE_FILE" 2>/dev/null)
SESSION_ID=$(jq -r '.session_id // "unknown"' "$STATE_FILE" 2>/dev/null)
THRESHOLD_TOKENS=$(jq -r '.hard_threshold_tokens // 0' "$STATE_FILE" 2>/dev/null)

cat > "$SIGNAL_FILE" <<JSON
{"threshold_type":"$ACTION","tokens":$TOKENS,"threshold_tokens":$THRESHOLD_TOKENS,"session_id":"$SESSION_ID","ts":"$NOW_ISO"}
JSON

echo "$NOW_ISO | SIGNAL | wrote .jicm-clear-now.signal | tokens=$TOKENS action=$ACTION session=$SESSION_ID" >> "$LOG_FILE"

# ─── Clear pending_action atomically ─────────────────────────────────────────
if [[ -x "$STATE_UPDATE" ]]; then
    "$STATE_UPDATE" --clear-pending
fi

# Rotate log if > 100KB
LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [[ "$LOG_SIZE" -gt 102400 ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1" 2>/dev/null
fi

exit 0
