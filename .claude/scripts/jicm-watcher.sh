#!/bin/bash
# ============================================================================
# JICM v7.9 WATCHER — Slim Signal-Driven Actuator
# ============================================================================
#
# Sole responsibility: when jicm-stop.sh writes .jicm-clear-now.signal,
# drive the canonical compression → /clear → resume cycle to completion
# via the pluggable injection backend (jicm-inject.sh).
#
# Sensing belongs to jicm-gate.sh (UserPromptSubmit). This script does NOT
# read transcripts, count tokens, parse status lines, or capture panes for
# state inference. All those concerns moved into the hook layer in v7.9.
#
# Replaces v7.1.1's 1559-line capture-pane parser. Legacy preserved at
# jicm-watcher-legacy.sh for fallback during the v7.9 transition.
#
# Design:  projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md §4.3
# Plan:    projects/project-aion/plans/jicm-implementation-plan-v7-9-to-v8.md §7.9.3
# ============================================================================

set -o pipefail

# --- Source shared configuration --------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"
. "$SCRIPT_DIR/jicm-config.sh"

# --- Logging ----------------------------------------------------------------
mkdir -p "$(dirname "$JICM_LOG_FILE")" "$(dirname "$JICM_PID_FILE")"
log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$JICM_LOG_FILE"; }

# --- Singleton guard --------------------------------------------------------
if [[ -f "$JICM_PID_FILE" ]]; then
    PRIOR_PID=$(cat "$JICM_PID_FILE" 2>/dev/null)
    if [[ -n "$PRIOR_PID" ]] && kill -0 "$PRIOR_PID" 2>/dev/null; then
        echo "jicm-watcher: another instance running (pid $PRIOR_PID); exiting" >&2
        log "abort: prior instance pid $PRIOR_PID still alive"
        exit 1
    fi
    log "stale PID file (pid $PRIOR_PID); reclaiming"
fi
echo "$$" > "$JICM_PID_FILE"
trap 'log "watcher exiting (pid $$)"; rm -f "$JICM_PID_FILE"; exit' EXIT INT TERM
log "watcher v7.9 started (pid $$, project $PROJECT_DIR)"

# --- Injection helper -------------------------------------------------------
inject() {
    JICM_INJECTION_TARGET="$JICM_TMUX_TARGET" \
    JICM_INJECTION_BACKEND="$JICM_INJECTION_BACKEND" \
    JICM_TMUX_BIN="$JICM_TMUX_BIN" \
        "$JICM_INJECT_SCRIPT" "$@"
}

# --- Idle detection: state file absent or mtime ≥ JICM_IDLE_GRACE_SEC -------
state_is_idle() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return 0
    local mtime now age
    mtime=$(stat -f %m "$JICM_STATE_HOOK_FILE" 2>/dev/null) || return 0
    now=$(date +%s)
    age=$(( now - mtime ))
    [[ "$age" -ge "$JICM_IDLE_GRACE_SEC" ]]
}

# --- Wait for an injected-capture pattern -----------------------------------
wait_for_capture_pattern() {
    local pattern="$1" timeout="$2" elapsed=0
    while [[ "$elapsed" -lt "$timeout" ]]; do
        if inject capture 15 2>/dev/null | grep -qF "$pattern"; then
            return 0
        fi
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done
    return 1
}

# --- Wait for signal file ---------------------------------------------------
wait_for_signal() {
    local signal="$1" timeout="$2" elapsed=0
    while [[ "$elapsed" -lt "$timeout" ]]; do
        [[ -f "$signal" ]] && return 0
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done
    return 1
}

# --- Canonical prompts (single-line per tmux constraint) --------------------
HALT_PROMPT="[JICM-HALT] Context approaching threshold. Save in-progress details to .claude/context/.scratchpad.md, acknowledge with the single word Understood, and stop work. Compression and /clear will follow."
RESUME_PROMPT="[JICM-RESUME] Context compressed and cleared. Read .claude/context/.compressed-context-ready.md for current state and .claude/context/.scratchpad.md for transient working details. Resume work immediately. Do NOT greet."

# --- Cycle: idle → HALT → prep → /clear → resume → RESUME -------------------
# 7.9.6c: Approach C back-compat shim (v73_shim_write_state) removed.
# session-start.sh JICM v7 branch now gates on .jicm-clear-now.signal directly;
# legacy .jicm-state file is no longer written or read.
actuate_jicm_cycle() {
    log "cycle: start"

    # 1. Wait for Claude idle (state-file mtime older than grace window)
    local elapsed=0
    while ! state_is_idle && [[ "$elapsed" -lt 60 ]]; do
        sleep 1; elapsed=$(( elapsed + 1 ))
    done
    log "cycle: idle confirmed (waited ${elapsed}s)"

    # 2. HALT injection (text + submit as separate ops per tmux constraint)
    #    Defensive: clear-input first to prevent any stale buffer carrying over
    #    from prior cycle / aborted prompt; verify after submit that HALT
    #    actually landed in the conversation (not just the input field).
    inject clear-input
    sleep 0.3
    inject text "$HALT_PROMPT"
    sleep 0.5
    inject submit
    sleep 0.5
    if ! wait_for_capture_pattern "JICM-HALT" 5; then
        log "cycle: HALT not visible after submit — retrying submit once"
        inject submit
        sleep 1
    fi
    log "cycle: HALT prompt sent"

    # 3. Wait for "Understood" acknowledgment
    if wait_for_capture_pattern "Understood" "$JICM_HALT_ACK_TIMEOUT"; then
        log "cycle: HALT acknowledged"
    else
        log "cycle: HALT ack timeout (${JICM_HALT_ACK_TIMEOUT}s) — proceeding"
    fi

    # 4. Prep launch (idempotent: skip if compression signal/guard already exist)
    if [[ ! -f "$JICM_COMPRESSION_SIGNAL" ]] && [[ ! -f "$JICM_COMPRESSION_GUARD" ]]; then
        : > "$JICM_COMPRESSION_GUARD"
        log "cycle: launching prep script"
        ( "$JICM_PREP_SCRIPT" >> "$JICM_LOG_FILE" 2>&1 ) &
    else
        log "cycle: prep skipped (signal/guard already present)"
    fi

    # 5. Wait for prep completion
    if wait_for_signal "$JICM_COMPRESSION_SIGNAL" "$JICM_PREP_TIMEOUT"; then
        log "cycle: prep complete"
    else
        log "cycle: prep timeout (${JICM_PREP_TIMEOUT}s) — proceeding with possibly stale checkpoint"
    fi

    # 6. /clear injection — defensive sequence to prevent HALT/clear concatenation:
    #    a. escape: interrupt any in-flight assistant stream
    #    b. clear-input: empty the input buffer (Ctrl+U) — critical, since ESC
    #       does NOT clear input in Claude Code TUI; if HALT submit had failed
    #       silently, HALT text still sits in the input field and /clear text
    #       would append to it (the documented bug pattern).
    #    c. text /clear + submit: now goes into a verified-empty input buffer.
    inject escape
    sleep 0.3
    inject clear-input
    sleep 0.3
    inject text "/clear"
    sleep 0.3
    inject submit
    sleep 0.5
    log "cycle: /clear sent"

    # 7. Wait for resume signal (session-start hook writes after restoration)
    if wait_for_signal "$JICM_RESUME_SIGNAL" "$JICM_RESUME_TIMEOUT"; then
        log "cycle: resume signal observed"
    else
        log "cycle: resume signal timeout — sending RESUME anyway"
    fi
    sleep 1

    # 8. RESUME injection — same defensive pattern as HALT/clear
    inject clear-input
    sleep 0.3
    inject text "$RESUME_PROMPT"
    sleep 0.5
    inject submit
    sleep 0.5
    log "cycle: RESUME prompt sent"

    # 9. Cleanup transient signals
    rm -f "$JICM_CLEAR_SIGNAL" "$JICM_COMPRESSION_SIGNAL" \
          "$JICM_COMPRESSION_GUARD" "$JICM_RESUME_SIGNAL"
    log "cycle: complete"
}

# --- Periodic state refresh (fixes HUD/Statusline staleness during long turns) ---
# jicm-gate.sh writes .jicm-state-hook.json only on UserPromptSubmit. During a
# long turn with heavy tool use, context grows but the displayed value stays at
# turn-start. This function re-parses the JSONL transcript and patches just the
# token-counter fields, so HUD + Statusline reflect mid-turn growth.
# Cadence: every 5 polls (~5s with default interval) to bound jq cost.
refresh_state_from_jsonl() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return 0
    local transcript window
    transcript=$(jq -r '.transcript_path // empty' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
    [[ -n "$transcript" && -f "$transcript" ]] || return 0
    window=$(jq -r '.context_window_size // 1000000' "$JICM_STATE_HOOK_FILE" 2>/dev/null)

    local usage input_t cache_r cache_c cache_5m cache_1h tokens used_pct now_iso now_epoch
    usage=$(jq -c 'select(.type=="assistant") | .message.usage' "$transcript" 2>/dev/null | tail -1)
    [[ -n "$usage" && "$usage" != "null" ]] || return 0

    input_t=$(echo "$usage" | jq -r '.input_tokens // 0' 2>/dev/null)
    cache_r=$(echo "$usage" | jq -r '.cache_read_input_tokens // 0' 2>/dev/null)
    cache_c=$(echo "$usage" | jq -r '.cache_creation_input_tokens // 0' 2>/dev/null)
    cache_5m=$(echo "$usage" | jq -r '.cache_creation.ephemeral_5m_input_tokens // 0' 2>/dev/null)
    cache_1h=$(echo "$usage" | jq -r '.cache_creation.ephemeral_1h_input_tokens // 0' 2>/dev/null)
    tokens=$(( input_t + cache_r + cache_c ))
    used_pct=$(( window > 0 ? (tokens * 100 / window) : 0 ))
    now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    now_epoch=$(date +%s)

    local tmpfile="${JICM_STATE_HOOK_FILE}.tmp.$$"
    if jq --argjson tokens "$tokens" \
          --argjson input "$input_t" \
          --argjson cr "$cache_r" \
          --argjson cc "$cache_c" \
          --argjson c5m "$cache_5m" \
          --argjson c1h "$cache_1h" \
          --argjson upct "$used_pct" \
          --arg ts "$now_iso" \
          --argjson tse "$now_epoch" \
          '.tokens = $tokens
           | .input_tokens = $input
           | .cache_read_tokens = $cr
           | .cache_creation_tokens = $cc
           | .cache_creation_5m_tokens = $c5m
           | .cache_creation_1h_tokens = $c1h
           | .used_percentage = $upct
           | .ts = $ts
           | .ts_epoch = $tse
           | ._refreshed_by = "watcher_poll"' \
          "$JICM_STATE_HOOK_FILE" > "$tmpfile" 2>/dev/null; then
        mv "$tmpfile" "$JICM_STATE_HOOK_FILE"
    else
        rm -f "$tmpfile"
    fi
}

# --- Main loop --------------------------------------------------------------
log "main loop (poll ${JICM_POLL_INTERVAL}s, target $JICM_TMUX_TARGET, backend $JICM_INJECTION_BACKEND)"
declare -i REFRESH_COUNTER=0
REFRESH_EVERY=5   # poll-iterations between state-file refreshes
while true; do
    if [[ -f "$JICM_EXIT_SIGNAL" ]] || [[ -f "$JICM_SLEEP_SIGNAL" ]]; then
        sleep "$JICM_POLL_INTERVAL"
        continue
    fi
    if [[ -f "$JICM_CLEAR_SIGNAL" ]]; then
        actuate_jicm_cycle
    fi
    REFRESH_COUNTER=$(( REFRESH_COUNTER + 1 ))
    if [[ "$REFRESH_COUNTER" -ge "$REFRESH_EVERY" ]]; then
        refresh_state_from_jsonl
        REFRESH_COUNTER=0
    fi
    sleep "$JICM_POLL_INTERVAL"
done
