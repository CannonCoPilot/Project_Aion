#!/bin/bash
# ============================================================================
# jicm-self.sh v2 — Dev-lane deliberative self-management (Perception + Volition)
# ============================================================================
# Part of the JICM self-management rewire (Aion Evolution Roadmap, Phase 0.3).
# Gives the working (dev) session CONSCIOUS control over its own context
# lifecycle, complementing — never replacing — the autonomic Watcher reflex on
# W0. Governing law: preserve-the-reflex, add-the-volition.
#
#   sense       read my own context vitals (perception; read-only; safe)
#   prepare     deliberate save-gate over the DEV lane's own durable state (safe)
#   refresh     volition cycle: prepare -> build MY checkpoint -> /clear -> resume.
#                 (no flag)          DRY-RUN — prints the plan, takes no action.
#                 --fire             GATED — refuses to fire on a live head; prints
#                                    the canary instruction. Also refuses to guess
#                                    my transcript (self-decapitation guard).
#                 --fire --canary    ARM — spawns the DETACHED actuator (cmd_actuate)
#                                    that outlives this turn, waits for idle, builds
#                                    the dev checkpoint, /clears MY window, and
#                                    resumes. For DISPOSABLE canary sessions only,
#                                    until a clean run un-gates plain --fire.
#   __actuate   internal: the detached worker itself (never call directly).
#
# Dev-lane namespacing (never clobbers W0):
#   transcript  $JICM_SELF_TRANSCRIPT  ||  .current-dev-uuid  ||  (refuse to guess on --fire)
#   checkpoint  .compressed-context-ready.dev.md   (NOT W0's .compressed-context-ready.md)
#   scratchpad  .scratchpad.dev.md                 (NOT the shared OriginalDR scratchpad)
#
# Author: Jarvis, for Jarvis — 2026-07-16 (v2 2026-07-17)
# ============================================================================
set -o pipefail

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
SESSION="${TMUX_SESSION:-aion}"
SELF_WINDOW="${JICM_SELF_WINDOW:-11}"
CTX="$PROJECT_DIR/.claude/context"
DEV_SCRATCH="$CTX/.scratchpad.dev.md"
DEV_CKPT="$CTX/.compressed-context-ready.dev.md"
DEV_UUID_FILE="$CTX/.current-dev-uuid"
PROJECTS_DIR="$HOME/.claude/projects/-Users-nathanielcannon-Claude-Jarvis"
PREP="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
INJECT_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-inject.sh"

# Dev-namespaced signals (never collide with W0's shared JICM signals)
DEV_CLEAR_SIGNAL="$CTX/.jicm-clear-now.dev.signal"           # armed by actuator; read by session-start.sh
DEV_RESUME_SIGNAL="$CTX/.jicm-resume-complete.dev.signal"    # written by session-start.sh; awaited by actuator
DEV_COMPRESSION_SIGNAL="$CTX/.compression-done.dev.signal"   # prep-context completion signal (dev lane)
# Dev-namespaced prep telemetry — else prep's metadata/metrics/stats files (which
# jicm-watcher-hud.sh reads for its live display) would be overwritten with dev-run
# numbers mislabeled as W0's (the contamination the code review caught live).
DEV_METADATA="$CTX/.jicm-last-compression.dev.json"
DEV_METRICS="$PROJECT_DIR/.claude/logs/context-window-metrics.dev.jsonl"
DEV_JSONL_STATS="$CTX/.jsonl-compression-stats.dev.json"
ACTUATOR_LOG="$PROJECT_DIR/.claude/logs/jicm-self-actuator.log"

# Self-addressed resume nudge. Deliberately WITHOUT the "Watcher here. Context is
# getting heavy" marker so it can never false-match W0's HALT detection in
# jicm-prep-context.sh find_best_jsonl().
DEV_RESUME_PROMPT="Refresh complete — read .claude/context/.compressed-context-ready.dev.md for current state and .claude/context/.scratchpad.dev.md for transient working details, then resume work immediately. No greeting needed."

strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }
_bar_row() { "$TMUX_BIN" capture-pane -t "$SESSION:$SELF_WINDOW" -p 2>/dev/null | strip_ansi | grep -E '\] +[0-9]+%' | tail -1; }
_model()   { "$TMUX_BIN" capture-pane -t "$SESSION:$SELF_WINDOW" -p 2>/dev/null | strip_ansi | grep -oE '(opus|sonnet|haiku|fable)-[0-9]+-?[0-9]*' | head -1; }

# Identify MY transcript. Returns "path|source". Refuses (empty) only when asked to be strict.
_self_transcript() {
    local strict="${1:-0}"
    if [[ -n "${JICM_SELF_TRANSCRIPT:-}" && -f "${JICM_SELF_TRANSCRIPT}" ]]; then
        echo "${JICM_SELF_TRANSCRIPT}|explicit-env"; return 0
    fi
    if [[ -f "$DEV_UUID_FILE" ]]; then
        local u; u="$(cat "$DEV_UUID_FILE" 2>/dev/null)"
        [[ -f "$PROJECTS_DIR/$u.jsonl" ]] && { echo "$PROJECTS_DIR/$u.jsonl|dev-uuid-file"; return 0; }
    fi
    # Best-effort only. NOTE: a dev transcript can falsely match W0's HALT marker
    # (I quote 'Watcher here' when discussing JICM), so guessing is UNSAFE for --fire.
    [[ "$strict" -eq 1 ]] && { echo "|none"; return 1; }
    local newest; newest="$(ls -t "$PROJECTS_DIR"/*.jsonl 2>/dev/null | head -1)"
    [[ -n "$newest" ]] && echo "${newest}|GUESS-newest-UNVERIFIED"
}

cmd_sense() {
    local row pct tokens model p
    row="$(_bar_row)"; model="$(_model)"
    pct="$(printf '%s' "$row" | grep -oE '[0-9]+%' | head -1)"
    tokens="$(printf '%s' "$row" | grep -oE '[0-9.]+[KM]' | head -1)"
    echo "self-sense · window $SELF_WINDOW · ${model:-?}"
    echo "  context : ${pct:-?} used  (${tokens:-?} tokens)"
    p="${pct%\%}"
    if [[ "$p" =~ ^[0-9]+$ ]]; then
        if   [[ "$p" -ge 85 ]]; then echo "  advice  : HIGH — refresh soon"
        elif [[ "$p" -ge 65 ]]; then echo "  advice  : MODERATE — plan a refresh at the next natural break"
        else                          echo "  advice  : AMPLE — continue working"; fi
    else echo "  advice  : (could not read statusline for window $SELF_WINDOW)"; fi
}

cmd_prepare() {
    local now scratch_age="" ready=1
    now="$(date +%s)"
    echo "self-prepare · deliberate save-gate over DEV lane (NO clear performed):"
    if [[ -f "$DEV_SCRATCH" ]]; then
        scratch_age=$(( (now - $(stat -f %m "$DEV_SCRATCH" 2>/dev/null)) / 60 ))
        echo "  dev-scratchpad : present, ${scratch_age}m ago  (.scratchpad.dev.md)"
        [[ "$scratch_age" -gt 30 ]] && ready=0
    else
        echo "  dev-scratchpad : MISSING — write my working state to .scratchpad.dev.md first"; ready=0
    fi
    if [[ -f "$DEV_CKPT" ]]; then
        echo "  dev-checkpoint : present, $(( (now - $(stat -f %m "$DEV_CKPT" 2>/dev/null)) / 60 ))m old"
    else
        echo "  dev-checkpoint : absent (refresh will build one from my transcript)"
    fi
    if [[ "$ready" -eq 1 ]]; then echo "  verdict        : READY"; else echo "  verdict        : NOT READY — save dev working-state (<=30m) first"; fi
}

# ---------------------------------------------------------------------------
# Actuator primitives (mirror the proven watcher mechanism, dev-targeted)
# ---------------------------------------------------------------------------
_log_act() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$ACTUATOR_LOG"; }

# Inject to MY window via the same pluggable backend the watcher uses for W0.
_dev_inject() {
    JICM_INJECTION_TARGET="$SESSION:$SELF_WINDOW" \
    JICM_INJECTION_BACKEND="tmux" \
    JICM_TMUX_BIN="$TMUX_BIN" \
        "$INJECT_SCRIPT" "$@"
}

# Wait until MY turn terminates cleanly. tmux send-keys cannot tell Claude-busy
# from Claude-idle; injecting /clear mid-stream ENQUEUES it as text instead of
# executing the slash command. Poll the transcript until the last assistant
# entry has a terminal stop_reason (identical guard to jicm-watcher wait_for_idle).
_wait_for_idle() {
    local ts="$1" timeout="${2:-180}" elapsed=0 stop_reason
    [[ -f "$ts" ]] || { sleep 3; return 0; }
    while [[ "$elapsed" -lt "$timeout" ]]; do
        stop_reason=$(jq -s -r '[.[] | select(.type=="assistant" and .message.stop_reason != null) | .message.stop_reason] | last // empty' "$ts" 2>/dev/null)
        case "$stop_reason" in
            end_turn|stop_sequence|max_tokens) return 0 ;;
        esac
        sleep 1; elapsed=$(( elapsed + 1 ))
    done
    _log_act "wait_for_idle: timeout (${timeout}s, last stop_reason='${stop_reason:-none}')"
    return 1
}

_wait_for_signal() {
    local sig="$1" timeout="${2:-60}" elapsed=0
    while [[ "$elapsed" -lt "$timeout" ]]; do
        [[ -f "$sig" ]] && return 0
        sleep 1; elapsed=$(( elapsed + 1 ))
    done
    return 1
}

# ---------------------------------------------------------------------------
# cmd_actuate — the DETACHED worker. Invoked as `jicm-self.sh __actuate <ts>`
# by a nohup'd child so it OUTLIVES the turn that armed it. This detachment is
# the whole point: a self-clear cannot be synchronous (the script would be
# waiting for my turn to end while my turn waits for the script to return —
# deadlock). By detaching, my Bash call returns, I go idle, and this worker
# then drives prep -> /clear -> resume against my now-idle head.
# ---------------------------------------------------------------------------
cmd_actuate() {
    local ts="$1"
    _log_act "==== actuator start (transcript=$(basename "$ts"), target=$SESSION:$SELF_WINDOW) ===="

    # 1. Wait for MY session to go idle (I must finish my turn and stop).
    #    ENFORCED: never refresh a busy head. Abort the whole cycle on timeout —
    #    no /clear is sent, nothing is armed, the failure is loud in the log.
    if ! _wait_for_idle "$ts" 180; then
        _log_act "step1: ABORT — dev head still busy after 180s; NOT refreshing (no /clear sent)"
        return 3
    fi
    _log_act "step1: idle confirmed"

    # 2. Build MY dev checkpoint. prep-context's transcript auto-selection is
    #    bypassed via JICM_JSONL_PATH, so there is no HALT-marker false-match risk.
    _log_act "step2: building dev checkpoint via prep-context"
    JICM_JSONL_PATH="$ts" \
    JICM_COMPRESSED_FILE="$DEV_CKPT" \
    JICM_COMPRESSION_SIGNAL="$DEV_COMPRESSION_SIGNAL" \
    JICM_METADATA_FILE="$DEV_METADATA" \
    JICM_METRICS_FILE="$DEV_METRICS" \
    JICM_JSONL_STATS="$DEV_JSONL_STATS" \
        bash "$PREP" >> "$ACTUATOR_LOG" 2>&1
    if [[ -s "$DEV_CKPT" ]]; then
        _log_act "step2: dev checkpoint built ($(wc -c < "$DEV_CKPT" | tr -d ' ') bytes)"
    else
        _log_act "step2: ABORT — dev checkpoint empty/absent; refusing to /clear without a resume anchor"
        return 2
    fi

    # 3. Arm the dev clear-signal so session-start.sh takes the dev-lane branch.
    echo "$(date +%s)" > "$DEV_CLEAR_SIGNAL"
    rm -f "$DEV_RESUME_SIGNAL"   # clear any stale resume signal from a prior cycle

    # 4. /clear injection — defensive sequence. ENFORCED idle gate: if the head
    #    became busy again (I kept working, or a human interjected), DISARM and
    #    abort rather than fire /clear into a live stream — tmux would enqueue it
    #    as literal text (the documented corruption mode), and the resume nudge
    #    would concatenate behind it, submitting garbage into a still-live session
    #    while the log lies "cycle complete". A busy head fails loud, never garbled.
    if ! _wait_for_idle "$ts" 60; then
        _log_act "step4: ABORT — dev head busy again; disarming $DEV_CLEAR_SIGNAL, NOT sending /clear"
        rm -f "$DEV_CLEAR_SIGNAL"
        return 3
    fi
    _log_act "step4: idle re-confirmed; sending /clear"
    _dev_inject clear-input; sleep 0.3
    _dev_inject text "/clear"; sleep 0.3
    _dev_inject submit;       sleep 0.5
    _log_act "step4: /clear sent"

    # 5. Wait for session-start.sh to inject the dev checkpoint (writes DEV_RESUME_SIGNAL).
    if _wait_for_signal "$DEV_RESUME_SIGNAL" 60; then
        _log_act "step5: resume signal observed (session-start injected dev checkpoint)"
    else
        _log_act "step5: resume signal timeout — sending RESUME nudge anyway"
    fi
    sleep 1

    # 6. RESUME nudge into the fresh post-/clear session. The old transcript UUID
    #    no longer advances, so use a fixed settle rather than wait_for_idle here.
    _dev_inject clear-input; sleep 0.3
    _dev_inject text "$DEV_RESUME_PROMPT"; sleep 0.5
    _dev_inject submit;                    sleep 0.5
    _log_act "step6: RESUME nudge sent"

    # 7. Cleanup transient dev signals.
    rm -f "$DEV_CLEAR_SIGNAL" "$DEV_COMPRESSION_SIGNAL" "$DEV_RESUME_SIGNAL"
    _log_act "==== actuator cycle complete ===="
}

# Spawn cmd_actuate fully detached so it survives the arming turn ending.
_spawn_actuator() {
    local ts="$1"
    local self_path
    self_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
    mkdir -p "$(dirname "$ACTUATOR_LOG")"
    nohup bash "$self_path" __actuate "$ts" >> "$ACTUATOR_LOG" 2>&1 &
    disown 2>/dev/null || true
    _log_act "actuator spawned (pid $!) by arming turn"
}

cmd_refresh() {
    local fire=0 canary=0 a
    for a in "$@"; do
        case "$a" in
            --fire)   fire=1 ;;
            --canary) canary=1 ;;
        esac
    done
    cmd_prepare
    local ts src; IFS='|' read -r ts src < <(_self_transcript "$fire")
    echo "self-refresh · cycle plan:"
    if [[ -z "$ts" ]]; then
        echo "  [ABORT] cannot identify MY transcript strictly (need \$JICM_SELF_TRANSCRIPT or .current-dev-uuid)."
        echo "          refusing to guess — rebuilding from the wrong transcript is self-decapitation."
        return 2
    fi
    echo "  transcript : $(basename "$ts")   [source: $src]"
    echo "  1. build MY checkpoint  ->  JICM_JSONL_PATH=$(basename "$ts") JICM_COMPRESSED_FILE=.compressed-context-ready.dev.md $PREP"
    echo "  2. send '/clear'        ->  $SESSION:$SELF_WINDOW"
    echo "  3. inject resume        ->  read .compressed-context-ready.dev.md + .scratchpad.dev.md, continue"

    if [[ "$fire" -eq 0 ]]; then
        echo "  [DRY-RUN] no action taken. (source '$src')"
        [[ "$src" == GUESS* ]] && echo "  [WARN] transcript is an UNVERIFIED guess — do not --fire until dev-uuid is wired."
        return 0
    fi

    # --fire requested. Refuse to fire on an unverified guessed transcript.
    if [[ "$src" == GUESS* ]]; then
        echo "  [ABORT] refusing to --fire on an UNVERIFIED guessed transcript (self-decapitation risk)."
        echo "          set \$JICM_SELF_TRANSCRIPT or ensure .current-dev-uuid resolves first."
        return 2
    fi

    # Live-fire on a working head stays GATED. The detached actuator is real and
    # ready, but per the roadmap it must be validated on a DISPOSABLE canary
    # first — hence --canary is the arming key. This gate ALERTS (it is a
    # circuit-breaker, not a silent terminal acceptance): the mechanism is built;
    # what remains is one human-supervised canary run before un-gating --fire.
    if [[ "$canary" -eq 0 ]]; then
        echo "  [BLOCKED] live-fire gated (Aion Evolution Roadmap, Phase 0.3(d))."
        echo "           The detached actuator is BUILT and ready. To validate it, re-run on a"
        echo "           DISPOSABLE session with:  jicm-self.sh refresh --fire --canary"
        echo "           Un-gate --fire only AFTER a clean canary cycle. Not firing on a live head."
        return 2
    fi

    # --fire --canary: arm the detached actuator.
    echo "  [CANARY-FIRE] arming detached actuator — it survives this turn and drives"
    echo "                wait-for-idle -> prep -> /clear($SESSION:$SELF_WINDOW) -> resume."
    echo "                actuator log: $ACTUATOR_LOG"
    echo "                IMPORTANT: after this returns, reply ONCE and STOP so the actuator"
    echo "                observes idle and can /clear you. Do not keep issuing tool calls."
    _spawn_actuator "$ts"
    echo "  [ARMED] actuator detached. Tail the log to watch the cycle."
    return 0
}

case "${1:-sense}" in
    sense)     cmd_sense ;;
    prepare)   cmd_prepare ;;
    refresh)   shift; cmd_refresh "$@" ;;
    __actuate) shift; cmd_actuate "$@" ;;   # internal: detached worker (do not call directly)
    -h|--help|*) echo "usage: jicm-self.sh {sense|prepare|refresh [--fire [--canary]]}" ;;
esac
