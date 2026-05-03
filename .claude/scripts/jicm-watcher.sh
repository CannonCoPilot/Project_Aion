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

# --- Approach C back-compat shim (7.9.6b → removal at 7.9.6c) ---------------
# Production session-start.sh JICM v7 branch gates on .jicm-state containing
# `state: CLEARING` or `state: RESTORING`. The v7.9 native signal protocol
# uses .jicm-clear-now.signal / .jicm-resume-complete.signal, but until
# session-start.sh is re-gated (7.9.6c), we mirror the state transitions
# into the legacy file so the existing hook chain continues to fire.
# v79_shim: true field marks the file as shim-written, distinguishing from
# pre-v7.9 watcher writes for downstream auditing.
v73_shim_write_state() {
    printf 'state: %s\ntimestamp: %s\nv79_shim: true\n' \
        "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$JICM_STATE_FILE"
}

# --- Cycle: idle → HALT → prep → /clear → resume → RESUME -------------------
actuate_jicm_cycle() {
    log "cycle: start"

    # 1. Wait for Claude idle (state-file mtime older than grace window)
    local elapsed=0
    while ! state_is_idle && [[ "$elapsed" -lt 60 ]]; do
        sleep 1; elapsed=$(( elapsed + 1 ))
    done
    log "cycle: idle confirmed (waited ${elapsed}s)"

    # 2. HALT injection (text + submit as separate ops per tmux constraint)
    inject text "$HALT_PROMPT"
    sleep 0.2
    inject submit
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

    # 6. /clear injection (escape + literal + submit, all via inject backend)
    v73_shim_write_state CLEARING   # Approach C back-compat for session-start.sh JICM v7 branch
    inject escape
    sleep 0.2
    inject text "/clear"
    sleep 0.2
    inject submit
    log "cycle: /clear sent (legacy state: CLEARING)"

    # 7. Wait for resume signal (session-start hook writes after restoration)
    if wait_for_signal "$JICM_RESUME_SIGNAL" "$JICM_RESUME_TIMEOUT"; then
        log "cycle: resume signal observed"
    else
        log "cycle: resume signal timeout — sending RESUME anyway"
    fi
    sleep 1

    # 8. RESUME injection
    v73_shim_write_state RESTORING   # Approach C back-compat: signal post-/clear restoration
    inject text "$RESUME_PROMPT"
    sleep 0.2
    inject submit
    log "cycle: RESUME prompt sent (legacy state: RESTORING)"

    # 9. Cleanup transient signals
    rm -f "$JICM_CLEAR_SIGNAL" "$JICM_COMPRESSION_SIGNAL" \
          "$JICM_COMPRESSION_GUARD" "$JICM_RESUME_SIGNAL"
    v73_shim_write_state WATCHING    # Approach C back-compat: return to baseline state
    log "cycle: complete (legacy state: WATCHING)"
}

# --- Main loop --------------------------------------------------------------
log "main loop (poll ${JICM_POLL_INTERVAL}s, target $JICM_TMUX_TARGET, backend $JICM_INJECTION_BACKEND)"
while true; do
    if [[ -f "$JICM_EXIT_SIGNAL" ]] || [[ -f "$JICM_SLEEP_SIGNAL" ]]; then
        sleep "$JICM_POLL_INTERVAL"
        continue
    fi
    if [[ -f "$JICM_CLEAR_SIGNAL" ]]; then
        actuate_jicm_cycle
    fi
    sleep "$JICM_POLL_INTERVAL"
done
