#!/bin/bash
# ============================================================================
# jicm-actuate.sh — Unified per-session context actuator (JICM v9)
# ============================================================================
# The generalized successor to BOTH lineages of context actuation:
#   • jicm-self.sh:cmd_actuate     (dev-lane detached self-clear; clean control flow)
#   • jicm-watcher.sh:actuate_jicm_cycle steps 5.5–5.9  (W0's rich pre-clear memory
#                                     machinery: L4 RAG, scrollback, consolidation,
#                                     scratchpad rotation, L5 Graphiti)
#
# One tool, keyed by <key> (w0 | dev | protos | chain-<id> | …). All per-session
# paths come from jicm-config.sh:jicm_key_paths (JK_*); all session metadata comes
# from the registry (jicm_registry_get). NOTHING is hardcoded per-session — this is
# W0's machinery pulled FORWARD by generalization, not walled off on a legacy path.
# See projects/project-aion/designs/jicm-v9-multi-session-steward.md, decision 2,
# and [[feedback_fold_forward_not_parallel_legacy]].
#
# USAGE
#   jicm-actuate.sh <key>                    DRY-RUN — resolve + print the cycle plan; no action (default; safe)
#   jicm-actuate.sh <key> --fire             ARM the detached actuator. GATED (Phase 1): needs --canary.
#   jicm-actuate.sh <key> --fire --canary    ARM (canary): spawn the detached worker for a supervised run.
#   jicm-actuate.sh __run <key>              INTERNAL — the detached worker. preserve-restore REFUSES
#                                            unless JICM_ACTUATE_GATE_OK=1 (set by cmd_fire or a validated
#                                            supervisor); a bare __run can never live-/clear a session.
#
# RESET POLICIES (registry .reset_policy; overridable via JICM_ACTUATE_POLICY)
#   preserve-restore  full cycle: idle → prep checkpoint → 5.5–5.9 memory steps → /clear → resume.
#                     Shared-memory-mutating steps (5.7 consolidation, 5.8 scratchpad rotation) run
#                     ONLY for the shared-memory steward (default: key=w0) — a dev cycle must never
#                     rotate W0's shared .scratchpad.md (the contamination class the last review caught).
#   zero-state        Protos: kill+relaunch the Alfred seed, core-only reload (Phase-4 wiring; Phase-1
#                     skeleton ALERTS rather than faking a reset — No Silent Degradation).
#   monitor           chains: detect + HUD only, no clear (ephemeral; rare forced clear = preserve-restore).
#
# PARITY NOTE (Phase 3): the legacy W0 cycle also runs a HALT handshake (ask Claude to flush to
#   .scratchpad.md and reply "Understood") before prep. This actuator inherits cmd_actuate's cleaner
#   model — wait_for_idle (transcript terminal stop_reason) makes the interactive HALT redundant, since
#   prep reads the full transcript that already contains the in-progress work. The HALT-drop is a
#   DELIBERATE, DOCUMENTED parity checkpoint to validate when W0 is folded in (Phase 3), NOT a silent
#   omission. W0 stays on its legacy watcher (with HALT) until then.
#
# SAFETY: live-fire stays GATED behind --canary until a human-supervised canary run validates the
#   detached mechanism (Phase 2, Sir's hand). The gate is a circuit-breaker that ALERTS; un-gating is
#   a single-block deletion. preserve-restore refuses to /clear on a verified-busy head or without a
#   non-empty checkpoint, and refuses to guess a transcript (self-decapitation guard).
#
# Author: Jarvis (W11), 2026-07-18 — JICM v9 Phase 1.
# ============================================================================
set -o pipefail

# --- Resolve project root; unset ambient prep-overrides BEFORE sourcing config
#     (Bug-4 posture: a leaked JICM_COMPRESSED_FILE/… must never bleed into config
#     defaults or a step's env — every prep/step override here is COMMAND-scoped).
PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
export PROJECT_DIR
unset JICM_COMPRESSED_FILE JICM_COMPRESSION_SIGNAL JICM_METADATA_FILE \
      JICM_METRICS_FILE JICM_JSONL_STATS JICM_JSONL_PATH 2>/dev/null

CONFIG="$PROJECT_DIR/.claude/scripts/jicm-config.sh"
if [[ ! -f "$CONFIG" ]]; then
    echo "jicm-actuate: config not found: $CONFIG" >&2
    exit 66
fi
# shellcheck source=/dev/null
. "$CONFIG"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
INJECT_SCRIPT="$JICM_INJECT_SCRIPT"
PREP="$JICM_PREP_SCRIPT"
TMUX_BIN="$JICM_TMUX_BIN"
VENV_PY="$PROJECT_DIR/infrastructure/.venv/bin/python"
ACT_LOG="$PROJECT_DIR/.claude/logs/jicm-actuate.log"

_log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "${JK_KEY:-?}" "$*" >> "$ACT_LOG"; }

# ---------------------------------------------------------------------------
# Resolution helpers — registry is the source of truth; env overrides for the
# throwaway test harness; per-key defaults; then refuse (empty) on ambiguity.
# ---------------------------------------------------------------------------
_reg() { jicm_registry_get "$JK_KEY" "$1" 2>/dev/null; }   # _reg '.field'

_resolve_policy() {
    if [[ -n "${JICM_ACTUATE_POLICY:-}" ]]; then echo "$JICM_ACTUATE_POLICY"; return; fi
    local p; p="$(_reg '.reset_policy')"
    case "$p" in
        preserve-restore|zero-state|monitor) echo "$p" ;;
        *) echo "preserve-restore" ;;
    esac
}

# Only the lane that stewards Jarvis's shared memory runs the shared-mutating
# steps 5.7 (consolidation → rotates shared insights-log) and 5.8 (rotates the
# shared .scratchpad.md). Registry .steward_shared_memory wins; default = w0 only.
_owns_shared_memory() {
    local v; v="$(_reg '.steward_shared_memory')"
    [[ "$v" == "true"  ]] && return 0
    [[ "$v" == "false" ]] && return 1
    [[ "$JK_KEY" == "w0" ]]
}

_session_id() {
    local s; s="$(_reg '.session_id')"
    [[ -z "$s" || "$s" == "null" ]] && s="$JK_KEY"
    echo "$s"
}

# Identify the target session's transcript. registry.transcript_path → env →
# per-key uuid-file (glob by EXACT uuid across all persona projects dirs, so it
# is correct regardless of which .claude/ the session runs under) → refuse.
_resolve_transcript() {
    local t; t="$(_reg '.transcript_path')"
    [[ -n "${JICM_ACTUATE_TRANSCRIPT:-}" ]] && t="$JICM_ACTUATE_TRANSCRIPT"
    if [[ -z "$t" || "$t" == "null" || ! -f "$t" ]]; then
        local uuid_file="" u hit
        case "$JK_KEY" in
            w0)  uuid_file="$W0_UUID_FILE" ;;
            dev) uuid_file="$PROJECT_DIR/.claude/context/.current-dev-uuid" ;;
        esac
        if [[ -n "$uuid_file" && -f "$uuid_file" ]]; then
            u="$(cat "$uuid_file" 2>/dev/null)"
            if [[ -n "$u" ]]; then
                hit="$(ls "$HOME/.claude/projects/"*/"$u.jsonl" 2>/dev/null | head -1)"
                [[ -n "$hit" ]] && t="$hit"
            fi
        fi
    fi
    [[ -n "$t" && "$t" != "null" && -f "$t" ]] && echo "$t"
}

_resolve_target() {
    local tt; tt="$(_reg '.tmux_target')"
    [[ -n "${JICM_TMUX_TARGET_OVERRIDE:-}" ]] && tt="$JICM_TMUX_TARGET_OVERRIDE"
    if [[ -z "$tt" || "$tt" == "null" ]]; then
        case "$JK_KEY" in
            w0)  tt="$JICM_TMUX_SESSION:0"  ;;
            dev) tt="$JICM_TMUX_SESSION:11" ;;
            *)   tt="" ;;
        esac
    fi
    echo "$tt"
}

# Human-facing scratchpad hint for the resume nudge (dev keeps .scratchpad.dev.md).
_scratchpad_rel() {
    case "$JK_KEY" in
        w0)  echo ".claude/context/.scratchpad.md" ;;
        dev) echo ".claude/context/.scratchpad.dev.md" ;;
        *)   echo ".claude/context/.scratchpad.$JK_KEY.md" ;;
    esac
}
_resume_prompt() {
    # "Watcher here." prefix = filter parity: jicm-prep-context.sh's user-message
    # filter excludes startswith("Watcher here.") so this nudge never pollutes a
    # future checkpoint. SAFE vs the W0 watcher's HALT session-detection, which
    # matches the SPECIFIC phrase "Watcher here. Context is getting heavy" (prep
    # find_best_jsonl:139), never a bare prefix — so "Refresh complete" can't collide.
    local ck; ck="${JK_COMPRESSED#$PROJECT_DIR/}"
    echo "Watcher here. Refresh complete — read $ck for current state and $(_scratchpad_rel) for transient working details, then resume work immediately. No greeting needed."
}

# --- Injection + idle/signal primitives (proven mechanism, key-targeted) -----
_inject() {
    JICM_INJECTION_TARGET="$TMUX_TARGET" \
    JICM_INJECTION_BACKEND="tmux" \
    JICM_TMUX_BIN="$TMUX_BIN" \
        "$INJECT_SCRIPT" "$@"
}

# tmux send-keys cannot tell Claude-busy from Claude-idle; a /clear injected
# mid-stream is ENQUEUED as literal text, not executed. Poll the transcript until
# the last assistant entry has a TERMINAL stop_reason. (Identical guard to
# jicm-watcher:wait_for_idle and jicm-self:_wait_for_idle.)
# NOTE: `elapsed` counts ITERATIONS, not wall-clock — on a large real transcript
# each `jq -s` slurp costs >1s, so the effective timeout runs LONGER than labelled.
# This errs SAFE (more patience before giving up on a busy head, never less), so
# the proven primitive is kept verbatim rather than risk regressing the idle gate.
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
    _log "wait_for_idle: timeout (${timeout}s, last='${stop_reason:-none}')"
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

# --- Perception primitives (statusline read; ported from jicm-self.sh) --------
# Read the target pane's Claude statusline to sense context fullness. Pane-based:
# a self-mode key (no tmux pane) has no statusline and reports honestly-unavailable
# rather than fabricating a number (No-Silent-Degradation). Consume TMUX_TARGET.
_strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }
_bar_row()   { [[ -n "$TMUX_TARGET" ]] || return 0; "$TMUX_BIN" capture-pane -t "$TMUX_TARGET" -p 2>/dev/null | _strip_ansi | grep -E '\] +[0-9]+%' | tail -1; }
_model_row() { [[ -n "$TMUX_TARGET" ]] || return 0; "$TMUX_BIN" capture-pane -t "$TMUX_TARGET" -p 2>/dev/null | _strip_ansi | grep -oE '(opus|sonnet|haiku|fable)-[0-9]+-?[0-9]*' | head -1; }

# ---------------------------------------------------------------------------
# Fold-forward memory steps (W0 watcher 5.5–5.9), per-key namespaced via JK_*.
# Each is defensive + non-fatal: a missing dependency logs + skips, never aborts
# the cycle (the /clear must still happen once the checkpoint exists).
# ---------------------------------------------------------------------------
_step_prep() {   # build the resume checkpoint into JK_COMPRESSED; return non-empty
    if [[ -f "$JK_COMPRESSION_SIGNAL" || -f "$JK_COMPRESSION_GUARD" ]]; then
        _log "prep: skipped (signal/guard already present)"
    else
        : > "$JK_COMPRESSION_GUARD"
        _log "prep: building checkpoint (transcript=$(basename "$TRANSCRIPT"))"
        JICM_JSONL_PATH="$TRANSCRIPT" \
        JICM_COMPRESSED_FILE="$JK_COMPRESSED" \
        JICM_COMPRESSION_SIGNAL="$JK_COMPRESSION_SIGNAL" \
        JICM_METADATA_FILE="$JK_METADATA" \
        JICM_METRICS_FILE="$JK_METRICS" \
        JICM_JSONL_STATS="$JK_JSONL_STATS" \
            bash "$PREP" >> "$ACT_LOG" 2>&1
    fi
    [[ -s "$JK_COMPRESSED" ]]
}

_step_rag_ingest() {   # 5.5 — checkpoint → L4 RAG (async, non-blocking)
    [[ "${JICM_RAG_ENABLED:-true}" == "true" ]] || return 0
    if [[ ! -f "$JICM_AUTO_INGEST_SCRIPT" || ! -x "$VENV_PY" ]]; then
        _log "5.5 RAG ingest skipped (deps missing)"; return 0
    fi
    local sid; sid="$(_session_id)"
    (
        export PROJECT_DIR JICM_RAG_COLLECTION JICM_RAG_DEDUP_THRESHOLD \
               JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
        export JICM_COMPRESSED_FILE="$JK_COMPRESSED" JICM_SESSION_ID="$sid"
        "$VENV_PY" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
    ) &
    _log "5.5 RAG ingest launched (pid $!)"
}

_step_scrollback() {   # 5.6 capture + 5.6b NLP compress + 5.6c summary → RAG
    [[ -x "$TMUX_BIN" ]] || { _log "5.6 scrollback skipped (no tmux)"; return 0; }
    local sid; sid="$(_session_id)"
    {
        echo "# Pre-/clear Scrollback Capture"
        echo "# Captured: $(date -u +%Y-%m-%dT%H:%M:%SZ) | key: $JK_KEY | session: $sid"
        echo ""
        "$TMUX_BIN" capture-pane -t "$TMUX_TARGET" -p -S -"${JICM_SCROLLBACK_LINES:-1000}" 2>/dev/null
    } > "$JK_SCROLLBACK"
    _log "5.6 scrollback captured ($(wc -l < "$JK_SCROLLBACK" | tr -d ' ') lines)"

    if [[ -f "$JICM_NLP_SCRIPT" ]]; then
        if python3 "$JICM_NLP_SCRIPT" --mode "${JICM_NLP_SCROLLBACK_MODE:-aggressive}" --input "$JK_SCROLLBACK" > "$JK_SCROLLBACK_SUMMARY" 2>/dev/null; then
            _log "5.6b scrollback NLP-compressed ($(wc -c < "$JK_SCROLLBACK" | tr -d ' ') → $(wc -c < "$JK_SCROLLBACK_SUMMARY" | tr -d ' ') bytes)"
        else
            cp "$JK_SCROLLBACK" "$JK_SCROLLBACK_SUMMARY"
            _log "5.6b scrollback NLP compression failed — using raw"
        fi
    else
        cp "$JK_SCROLLBACK" "$JK_SCROLLBACK_SUMMARY" 2>/dev/null
    fi

    if [[ "${JICM_RAG_ENABLED:-true}" == "true" && -f "$JK_SCROLLBACK_SUMMARY" && -f "$JICM_AUTO_INGEST_SCRIPT" && -x "$VENV_PY" ]]; then
        (
            export PROJECT_DIR JICM_RAG_COLLECTION="sessions" JICM_RAG_DEDUP_THRESHOLD \
                   JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
            export JICM_COMPRESSED_FILE="$JK_SCROLLBACK_SUMMARY" JICM_SESSION_ID="$sid"
            "$VENV_PY" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
        ) &
        _log "5.6c scrollback → RAG ingest launched (pid $!)"
    fi
}

_step_consolidate() {   # 5.7 — rotate insights-log + consolidate corrections (SHARED)
    if ! _owns_shared_memory; then _log "5.7 consolidation skipped (not shared-memory steward)"; return 0; fi
    local s="$PROJECT_DIR/.claude/scripts/memory-consolidation.sh"
    [[ -x "$s" ]] || { _log "5.7 consolidation skipped (script missing)"; return 0; }
    CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$s" >> "$JICM_LOG_FILE" 2>&1 &
    _log "5.7 memory consolidation launched (pid $!)"
}

_step_scratchpad_rotate() {   # 5.8 — rotate the shared .scratchpad.md (SHARED)
    if ! _owns_shared_memory; then _log "5.8 scratchpad-rotate skipped (not shared-memory steward)"; return 0; fi
    local s="$PROJECT_DIR/.claude/hooks/scratchpad-rotate.sh"
    [[ -x "$s" ]] || { _log "5.8 scratchpad-rotate skipped (script missing)"; return 0; }
    CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$s" >> "$JICM_LOG_FILE" 2>&1
    _log "5.8 scratchpad rotated"
}

_step_graphiti() {   # 5.9 — checkpoint → L5 Graphiti episode (async, non-blocking)
    [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]] || return 0
    [[ -x "$VENV_PY" ]] || { _log "5.9 graphiti skipped (no venv)"; return 0; }
    local g="$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py"
    if [[ -f "$g" ]]; then
        ( export PROJECT_DIR JICM_COMPRESSED_FILE="$JK_COMPRESSED"
          "$VENV_PY" "$g" >> "$JICM_LOG_FILE" 2>&1 ) &
        _log "5.9 Graphiti episode ingest launched (pid $!)"
    elif [[ -f "$JICM_GRAPHITI_INGEST_SCRIPT" ]]; then
        ( "$VENV_PY" "$JICM_GRAPHITI_INGEST_SCRIPT" --file "$JK_COMPRESSED" >> "$JICM_LOG_FILE" 2>&1 ) &
        _log "5.9 Graphiti via prepopulate fallback (pid $!)"
    else
        _log "5.9 graphiti skipped (no ingest script)"
    fi
}

# ---------------------------------------------------------------------------
# Policy cycles
# ---------------------------------------------------------------------------
_cycle_preserve_restore() {
    _log "==== preserve-restore start (key=$JK_KEY target=$TMUX_TARGET transcript=$(basename "$TRANSCRIPT")) ===="

    # 1. Wait for the target session to go idle. ENFORCED: never /clear a busy head.
    if ! _wait_for_idle "$TRANSCRIPT" 180; then
        _log "step1: ABORT — head still busy after 180s; NOT refreshing (no /clear sent)"
        return 3
    fi
    _log "step1: idle confirmed"

    # 2. Build the resume checkpoint; refuse to /clear without a non-empty anchor.
    if ! _step_prep; then
        _log "step2: ABORT — checkpoint empty/absent; refusing to /clear without a resume anchor"
        return 2
    fi
    _log "step2: checkpoint ready ($(wc -c < "$JK_COMPRESSED" | tr -d ' ') bytes)"

    # 3. Fold-forward memory machinery (W0 watcher 5.5–5.9), per-key namespaced.
    _step_rag_ingest          # 5.5  L4 RAG (async)
    _step_scrollback          # 5.6/5.6b/5.6c  scrollback capture + NLP + RAG (async)
    _step_consolidate         # 5.7  insights-log + corrections (SHARED; async)
    _step_scratchpad_rotate   # 5.8  scratchpad rotation (SHARED)
    _step_graphiti            # 5.9  L5 Graphiti episode (async)

    # 4. Arm the per-key clear-signal (session-start branches on it), then /clear.
    echo "$(date +%s)" > "$JK_CLEAR_SIGNAL"
    rm -f "$JK_RESUME_SIGNAL"
    if ! _wait_for_idle "$TRANSCRIPT" 60; then
        _log "step4: ABORT — head busy again; disarming $JK_CLEAR_SIGNAL, NOT sending /clear"
        rm -f "$JK_CLEAR_SIGNAL"
        return 3
    fi
    _log "step4: idle re-confirmed; sending /clear"
    _inject clear-input; sleep 0.3
    _inject text "/clear"; sleep 0.3
    _inject submit;       sleep 0.5
    _log "step4: /clear sent"

    # 5. Wait for session-start to inject the checkpoint (writes JK_RESUME_SIGNAL).
    if _wait_for_signal "$JK_RESUME_SIGNAL" 60; then
        _log "step5: resume signal observed (session-start injected checkpoint)"
    else
        _log "step5: resume-signal timeout — sending RESUME nudge anyway"
    fi
    sleep 1

    # 6. RESUME nudge into the fresh post-/clear session.
    _inject clear-input; sleep 0.3
    _inject text "$(_resume_prompt)"; sleep 0.5
    _inject submit;                   sleep 0.5
    _log "step6: RESUME nudge sent"

    # 7. Cleanup transient per-key signals.
    rm -f "$JK_CLEAR_SIGNAL" "$JK_COMPRESSION_SIGNAL" "$JK_COMPRESSION_GUARD" "$JK_RESUME_SIGNAL"
    _log "==== preserve-restore complete ===="
}

_cycle_zero_state() {
    _log "==== zero-state (key=$JK_KEY) ===="
    # Protos zero-state = kill+relaunch the Alfred seed via the chain bridge's
    # ensure_seed (reuse), suppressing the work-state injection so ONLY the core
    # (alfred/.claude/CLAUDE.md + compaction-essentials.md) reloads. The bridge
    # (alfred/.claude/jobs/lib/host-executor-bridge.sh) is the seam — its exact CLI
    # is introspected + wired in Phase 4. Until then this ALERTS and refuses to
    # pretend a reset happened (No Silent Degradation).
    _log "zero-state ALERT: Phase-1 skeleton — Protos reset is wired in Phase 4 (host-executor-bridge ensure_seed, core-only reload). No reset performed; not faking success."
    return 4
}

_cycle_monitor() {
    # Chains are ephemeral (≤10 min, reaped ~120s); persistent accumulation lives in
    # Protos. Monitor = detect + HUD only; a rare forced clear would use preserve-restore.
    _log "monitor (key=$JK_KEY): no clear performed (chain is ephemeral; detect + HUD only)."
    return 0
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
# EXIT-trap handler (set in cmd_run). Cleans ONLY the ephemeral per-key markers so a
# crashed/aborted cycle can never wedge the next one. NEVER touches JK_COMPRESSED (the
# resume anchor + async-ingest input). Returns 0 without disturbing the worker's exit code.
_cleanup_transient() {
    local f
    for f in "$JK_COMPRESSION_GUARD" "$JK_COMPRESSION_SIGNAL" "$JK_CLEAR_SIGNAL"; do
        [[ -n "$f" ]] && rm -f "$f" 2>/dev/null
    done
    return 0
}

# Detached worker. Invoked as `jicm-actuate.sh __run <key>` by a nohup'd child so
# it OUTLIVES the arming turn — a self-clear cannot be synchronous (the arming
# script would block on the very turn it is trying to end). By detaching, the
# arming Bash call returns, the head goes idle, and this worker drives the cycle.
# preserve-restore REFUSES unless JICM_ACTUATE_GATE_OK=1 (set by cmd_fire or a
# validated supervisor) — a bare __run never live-/clears.
cmd_run() {
    local key="${1:-}"
    [[ -n "$key" ]] || { echo "jicm-actuate __run: key required" >&2; return 64; }
    jicm_key_paths "$key"
    mkdir -p "$JICM_SIGNALS_DIR" "$JICM_STATES_DIR" "$JICM_CHECKPOINTS_DIR" \
             "$JICM_REGISTRY_DIR" "$(dirname "$ACT_LOG")" 2>/dev/null
    # Finding-2 fix: clean transient guard/signals on EVERY worker exit (abort OR
    # success OR crash). A leaked JK_COMPRESSION_GUARD would wedge the next cycle into
    # the "skip prep" branch forever (stuck) or silently /clear on a STALE checkpoint —
    # a silent-degradation vector. The trap supersedes per-path rm (covers future edits).
    trap '_cleanup_transient' EXIT

    # Globals consumed by the cycle + step functions.
    TRANSCRIPT="$(_resolve_transcript)"
    TMUX_TARGET="$(_resolve_target)"
    local policy; policy="$(_resolve_policy)"
    local tdisp="<none>"; [[ -n "$TRANSCRIPT" ]] && tdisp="$(basename "$TRANSCRIPT")"
    _log "run: policy=$policy target=${TMUX_TARGET:-<none>} transcript=$tdisp"

    case "$policy" in
        preserve-restore)
            # Finding-1 fix: the actuation SUBSYSTEM (not just the CLI) enforces the
            # gate. A live /clear cycle runs ONLY when the arming entrypoint (cmd_fire)
            # passed the gate and set this sentinel, or a validated supervisor asserts
            # it deliberately. A bare `__run <key>` — a human, a wiring bug, or a
            # misread of "do not call directly" — refuses rather than decapitating a
            # live head with zero canary validation.
            if [[ "${JICM_ACTUATE_GATE_OK:-0}" != "1" ]]; then
                _log "ABORT: preserve-restore __run without gate sentinel (JICM_ACTUATE_GATE_OK=1) — refusing live /clear. Route through cmd_fire, or set the sentinel deliberately (supervisor)."
                return 2
            fi
            if [[ -z "$TRANSCRIPT" ]]; then
                _log "ABORT: no verified transcript for '$key' — refusing to guess (self-decapitation guard)"; return 2
            fi
            if [[ -z "$TMUX_TARGET" ]]; then
                _log "ABORT: no tmux target for '$key'"; return 2
            fi
            _cycle_preserve_restore ;;
        zero-state) _cycle_zero_state ;;
        monitor)    _cycle_monitor ;;
        *) _log "ABORT: unknown policy '$policy'"; return 65 ;;
    esac
}

# DELIBERATIVE PERCEPTION (sense) — read the key's own context vitals; advice only,
# NO action. The "add-the-volition" half, ported + generalized from jicm-self.sh:cmd_sense.
# Pane keys (w0/dev) read the tmux statusline; a self-mode key reports honestly-unavailable.
cmd_sense() {
    local key="$1"
    jicm_key_paths "$key"
    TMUX_TARGET="$(_resolve_target)"
    local row pct tokens model p
    row="$(_bar_row)"; model="$(_model_row)"
    pct="$(printf '%s' "$row" | grep -oE '[0-9]+%' | head -1)"
    tokens="$(printf '%s' "$row" | grep -oE '[0-9.]+[KM]' | head -1)"
    echo "jicm-actuate · sense · key=$key · target=${TMUX_TARGET:-<none>} · ${model:-?}"
    if [[ -z "$TMUX_TARGET" ]]; then
        echo "  context : (self-mode key — no tmux pane; pane-based sense unavailable)"
        echo "  advice  : this session judges its own fullness; cycle with 'jicm-actuate.sh $key --fire --canary' when heavy"
        return 0
    fi
    echo "  context : ${pct:-?} used  (${tokens:-?} tokens)"
    p="${pct%\%}"
    if [[ "$p" =~ ^[0-9]+$ ]]; then
        if   [[ "$p" -ge 85 ]]; then echo "  advice  : HIGH — refresh soon"
        elif [[ "$p" -ge 65 ]]; then echo "  advice  : MODERATE — plan a refresh at the next natural break"
        else                          echo "  advice  : AMPLE — continue working"; fi
    else echo "  advice  : (could not read statusline for $TMUX_TARGET)"; fi
}

# DELIBERATIVE PRE-FLIGHT (prepare) — save-gate over the key's durable state; NO clear.
# Ported + generalized from jicm-self.sh:cmd_prepare (per-key scratchpad via _scratchpad_rel).
cmd_prepare() {
    local key="$1"
    jicm_key_paths "$key"
    local scratch="$PROJECT_DIR/$(_scratchpad_rel)" now age ready=1
    now="$(date +%s)"
    echo "jicm-actuate · prepare · key=$key · deliberate save-gate (NO clear performed):"
    if [[ -f "$scratch" ]]; then
        age=$(( (now - $(stat -f %m "$scratch" 2>/dev/null || echo "$now")) / 60 ))
        echo "  scratchpad : present, ${age}m ago  ($(_scratchpad_rel))"
        [[ "$age" -gt 30 ]] && ready=0
    else
        echo "  scratchpad : MISSING — write working state to $(_scratchpad_rel) first"; ready=0
    fi
    if [[ -f "$JK_COMPRESSED" ]]; then
        echo "  checkpoint : present, $(( (now - $(stat -f %m "$JK_COMPRESSED" 2>/dev/null || echo "$now")) / 60 ))m old"
    else
        echo "  checkpoint : absent (a --fire cycle will build one from the transcript)"
    fi
    if [[ "$ready" -eq 1 ]]; then echo "  verdict    : READY"; else echo "  verdict    : NOT READY — save working-state (<=30m) first"; fi
}

# DRY-RUN: resolve + print the plan, take NO action. Safe; the default no-flag path.
cmd_plan() {
    local key="$1"
    jicm_key_paths "$key"
    local policy transcript target shared_steps=""
    policy="$(_resolve_policy)"
    transcript="$(_resolve_transcript)"
    target="$(_resolve_target)"
    _owns_shared_memory && shared_steps="5.7 consolidate, 5.8 rotate, "

    echo "jicm-actuate · DRY-RUN · key=$key"
    echo "  policy       : $policy"
    local tdisp="<unresolved — --fire would refuse>"
    [[ -n "$transcript" ]] && tdisp="$(basename "$transcript")"
    echo "  tmux target  : ${target:-<unresolved>}"
    echo "  transcript   : $tdisp"
    echo "  checkpoint   : $JK_COMPRESSED"
    echo "  clear-signal : $JK_CLEAR_SIGNAL"
    if _owns_shared_memory; then
        echo "  shared-mem   : YES — this key stewards shared memory (runs 5.7 + 5.8)"
    else
        echo "  shared-mem   : no — skips shared-memory mutation (5.7/5.8)"
    fi
    case "$policy" in
        preserve-restore) echo "  steps        : idle → prep → [5.5 RAG, 5.6 scrollback, 5.6c RAG, ${shared_steps}5.9 graphiti] → /clear → resume" ;;
        zero-state)       echo "  steps        : kill+relaunch seed, core-only reload (Phase-4 wiring; Phase-1 ALERTs)" ;;
        monitor)          echo "  steps        : detect + HUD only (no clear)" ;;
    esac
    echo "  [DRY-RUN] no action taken. To actuate: jicm-actuate.sh $key --fire --canary"
}

# ARM the detached actuator. GATED behind --canary in Phase 1 (see SAFETY header).
cmd_fire() {
    local key="$1" canary="$2" expect_sid="${3:-}" expect_target="${4:-}"
    # ---- SAFETY GATE (JICM v9 Phase 1). Un-gate = delete this block (Phase 2, Sir's hand). ----
    if [[ "$canary" != "1" ]]; then
        echo "  [BLOCKED] live-fire gated (JICM v9 Phase 2 canary pending)."
        echo "           The detached actuator is BUILT and ready. Validate on a DISPOSABLE session:"
        echo "             jicm-actuate.sh $key --fire --canary"
        echo "           Un-gate plain --fire only AFTER a clean canary cycle. Not firing on a live head."
        return 2
    fi
    # ---- end gate ----
    jicm_key_paths "$key"
    local policy transcript target
    policy="$(_resolve_policy)"
    transcript="$(_resolve_transcript)"
    target="$(_resolve_target)"
    # ---- M2 (JICM v9 R2): IDENTITY PINNING — refuse on registry drift ------------
    # The caller (supervisor) PROVED which session it validated: raiser alive, and
    # raiser == live pane occupant (C2 guards a/b). That proof is about a specific
    # session_id at a specific instant. Between that validation and this arming turn
    # the registry can move (a relaunch re-claims the key), and re-resolving here
    # would then actuate a session that never asked to be cleared. So when the caller
    # states its expectation, it must still hold. Silence (empty) = unpinned legacy
    # caller / operator, which keeps the old behaviour.
    if [[ -n "$expect_sid" ]]; then
        local actual_sid; actual_sid="$(_session_id)"
        if [[ "$actual_sid" != "$expect_sid" ]]; then
            echo "  [ABORT] registry drift for '$key': caller validated session=$expect_sid but the registry now resolves $actual_sid — refusing (would clear the wrong session)."
            return 2
        fi
    fi
    if [[ -n "$expect_target" && -n "$target" && "$expect_target" != "$target" ]]; then
        echo "  [ABORT] target drift for '$key': caller validated target=$expect_target but the registry now resolves $target — refusing (would clear the wrong pane)."
        return 2
    fi
    # ---- end M2 -----------------------------------------------------------------
    if [[ "$policy" == "preserve-restore" ]]; then
        [[ -n "$transcript" ]] || { echo "  [ABORT] no verified transcript for '$key' — refusing to guess (self-decapitation guard)."; return 2; }
        [[ -n "$target"     ]] || { echo "  [ABORT] no tmux target for '$key'."; return 2; }
    fi
    mkdir -p "$(dirname "$ACT_LOG")" 2>/dev/null
    # Finding-1/4 fix: hand the worker (a) proof it passed the gate, so preserve-restore
    # will actually run, and (b) the EXACT transcript/target this arming turn validated
    # (via the existing override env), so it does not re-resolve into a possibly-changed
    # value between spawn and use (TOCTOU). Empty values simply fall through to registry.
    JICM_ACTUATE_GATE_OK=1 \
    JICM_ACTUATE_TRANSCRIPT="$transcript" \
    JICM_TMUX_TARGET_OVERRIDE="$target" \
        nohup bash "$SELF_PATH" __run "$key" >> "$ACT_LOG" 2>&1 &
    disown 2>/dev/null || true
    echo "  [CANARY-FIRE] detached actuator armed for key=$key (pid $!)."
    echo "                policy=$policy · target=${target:-n/a} · log: $ACT_LOG"
    echo "                Reply ONCE and STOP so the actuator observes idle and can /clear you."
    return 0
}

# --- Dispatch ---------------------------------------------------------------
case "${1:-}" in
    __run) shift; cmd_run "$@"; exit $? ;;
esac

# Grammar:  <key>                 → DRY-RUN plan (safe default)
#           <key> sense           → perception (statusline read; no action)
#           <key> prepare         → deliberative save-gate (no action)
#           <key> --fire [--canary] → ARM the detached actuator (gated)
# A verb (sense|prepare) and a key are both positional + order-independent. Keys are
# never literally "sense"/"prepare" (w0|dev|protos|chain-*|*-bg-*), so no collision.
KEY=""; VERB=""; FIRE=0; CANARY=0; EXPECT_SID=""; EXPECT_TARGET=""
for a in "$@"; do
    case "$a" in
        --fire)             FIRE=1 ;;
        --canary)           CANARY=1 ;;
        # M2 identity pinning: the caller states the session/pane it validated. Uses the
        # `=` form so the positional parser stays a simple for-loop. Visible in ps/logs
        # (deliberately a flag, not an env var — a safety interlock should be greppable).
        --expect-sid=*)     EXPECT_SID="${a#*=}" ;;
        --expect-target=*)  EXPECT_TARGET="${a#*=}" ;;
        --expect-sid|--expect-target)
                            echo "jicm-actuate: $a requires the '=' form, e.g. ${a}=<value>" >&2; exit 64 ;;
        -h|--help)      echo "usage: jicm-actuate.sh <key> [sense|prepare]  |  <key> [--fire [--canary]] [--expect-sid=<sid>] [--expect-target=<pane>]  |  __run <key>"; exit 0 ;;
        sense|prepare)  [[ -z "$VERB" ]] && VERB="$a" || { echo "jicm-actuate: one verb at a time" >&2; exit 64; } ;;
        -*)             echo "jicm-actuate: unknown flag '$a'" >&2; exit 64 ;;
        *)              [[ -z "$KEY" ]] && KEY="$a" || { echo "jicm-actuate: unexpected arg '$a'" >&2; exit 64; } ;;
    esac
done
# An --expect-* pin is only meaningful when arming; silently honouring it on a
# dry-run/verb would imply a check that never ran.
if [[ -n "$EXPECT_SID$EXPECT_TARGET" && "$FIRE" -ne 1 ]]; then
    echo "jicm-actuate: --expect-sid/--expect-target are only valid with --fire" >&2; exit 64
fi
[[ -n "$KEY" ]] || { echo "usage: jicm-actuate.sh <key> [sense|prepare]  |  <key> [--fire [--canary]]  |  __run <key>" >&2; exit 64; }

case "$VERB" in
    sense)   cmd_sense   "$KEY" ;;
    prepare) cmd_prepare "$KEY" ;;
    "")      if [[ "$FIRE" -eq 1 ]]; then cmd_fire "$KEY" "$CANARY" "$EXPECT_SID" "$EXPECT_TARGET"; else cmd_plan "$KEY"; fi ;;
esac
