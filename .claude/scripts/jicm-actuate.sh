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
#   jicm-actuate.sh <key> --fire             ARM the detached actuator (un-gated 2026-08-12).
#   jicm-actuate.sh <key> --fire --canary    Same; --canary is accepted and ignored (legacy call sites).
#   jicm-actuate.sh __run <key>              INTERNAL — the detached worker. preserve-restore REFUSES
#                                            unless JICM_ACTUATE_GATE_OK=1 (set by cmd_fire or a validated
#                                            watcher); a bare __run can never live-/clear a session.
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
# SAFETY: the --canary gate was REMOVED 2026-08-12 after 7 validated cycles (see cmd_fire).
#   `--fire` is now live. What still guards it: M2 identity pinning (refuses on registry drift),
#   transcript + target verification, the __run worker's own JICM_ACTUATE_GATE_OK requirement, the
#   watcher's C2 occupancy checks, and its FIRE_MAX circuit breaker. preserve-restore still
#   refuses to /clear a verified-busy head, to proceed without a non-empty checkpoint, or to guess
#   a transcript (self-decapitation guard).
#   NOTE: `<key> --fire` with no other argument now ARMS A REAL CYCLE. The safe inspection command
#   is `<key>` alone (DRY-RUN) — do not reach for --fire to "check whether it works".
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

# Portable timeout binary. macOS ships neither `timeout` nor `setsid`; Homebrew coreutils
# supplies `timeout`, MacPorts `gtimeout`. Resolved once, empty if genuinely absent.
TIMEOUT_BIN="${JICM_TIMEOUT_BIN:-$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)}"
JICM_INGEST_TIMEOUT_RAG="${JICM_INGEST_TIMEOUT_RAG:-600}"
# 900 -> 5400. THIS IS THE SECOND OF TWO BOUNDS ON THE SAME INGEST, and it is the one that
# fires on every actuation cycle (step 5.9); jicm-watcher.sh's REST/R2 path has its own
# (GRAPHITI_OUTER_BOUND). They MUST move together — graphiti-auto-ingest.py no longer sends
# one truncated 8K episode, it chunks the whole checkpoint into 4000-char parts and sends
# them in sequence, so wall-clock is now (chunks x per-chunk). Real checkpoints plan 4-9
# chunks and a chunk against jarvis-core measures 271-719s, so 900 would SIGTERM nearly
# every cycle — and a killed multi-chunk run looks exactly like the truncation bug this
# replaced. I fixed the REST site first and missed this one; the running ingest showed
# `timeout ... 900` and gave it away.
# Safe because nothing waits on this: it is a detached `( ... ) &` and the per-chunk bound
# inside the Python is the real hang detector. Keep in step with JICM_GRAPHITI_OUTER_BOUND.
JICM_INGEST_TIMEOUT_GRAPHITI="${JICM_INGEST_TIMEOUT_GRAPHITI:-5400}"

# Run a detached ingest under a hard time bound.  _bounded <label> <seconds> <cmd...>
# These run as `( … ) &` children, and an unbounded hang in one is worse than it looks:
# a bash subshell inherits its parent's argv, so a stuck ingest impersonates a live
# actuator to anything matching on cmdline (this is what wedged key=dev 2026-08-12 —
# graphiti-auto-ingest.py has no timeout of its own and ran 15+ minutes past the cycle).
# Killing one costs MEMORY DEPTH only — the checkpoint is already on disk and resume is
# unaffected — so the kill is the right trade. It must never be silent, hence the ALERT:
# a repeated timeout means a degraded backend, which is a problem to fix, not absorb.
_bounded() {
    local label="$1" secs="$2" rc; shift 2
    if [[ -z "$TIMEOUT_BIN" ]]; then
        _log "$label running UNBOUNDED (no timeout binary found — install coreutils)"
        "$@"; return $?
    fi
    "$TIMEOUT_BIN" -s TERM -k 15 "$secs" "$@"; rc=$?
    if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
        # "LOST" was true before the Graphiti ingest chunked its checkpoint; it is not now.
        # Each chunk commits as its own episode, so a kill costs only the un-sent remainder.
        # Measured 2026-08-24: a run killed at 900s had already committed 31 net-new entities
        # to jarvis-core. This message is generic (it also guards the RAG ingest), so it states
        # the partial case without claiming which chunks landed — the ingest log has that.
        # Keep in step with jicm-watcher.sh's _ingest_outcome message.
        _log "ALERT ⚠️ $label exceeded ${secs}s and was KILLED — PARTIAL, not total: work already committed is retained, the remainder did NOT complete and nothing retries it (checkpoint + resume unaffected). See .claude/logs/graphiti-auto-ingest.log for the last 'INGESTED (part i/n)' line. Repeated hits = a degraded backend or a graph large enough that dedup dominates; check LiteLLM/Ollama/Neo4j/Qdrant."
    fi
    return "$rc"
}

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
        # Key-aware fallback, not a bare default. Protos must default to zero-state even before
        # anything writes its registry row — and it has had NO row at all (it launched without
        # JARVIS_WINDOW, so it derived w0-bg-* and no gate ever registered `protos`). Depending
        # on a registry field to select the policy would mean the very lane that needs
        # zero-state silently getting preserve-restore, i.e. a seed carrying its last
        # conversation into every fork taken from it.
        *) case "$JK_KEY" in
               protos|protos-bg-*) echo "zero-state" ;;
               *)                  echo "preserve-restore" ;;
           esac ;;
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
            w0)    uuid_file="$W0_UUID_FILE" ;;
            dev)   uuid_file="$PROJECT_DIR/.claude/context/.current-dev-uuid" ;;
            # genie runs from Projects/WVU, so its JSONL lives under a DIFFERENT
            # project slug. The glob below already searches all persona project dirs
            # by exact uuid, so this needs only the breadcrumb.
            genie) uuid_file="$PROJECT_DIR/.claude/context/.current-genie-uuid" ;;
            jaques) uuid_file="$PROJECT_DIR/.claude/context/.current-jaques-uuid" ;;
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
            w0)    tt="$JICM_TMUX_SESSION:0"  ;;
            dev)   tt="$JICM_TMUX_SESSION:11" ;;
            genie) tt="$JICM_TMUX_SESSION:12" ;;
            jaques) tt="$JICM_TMUX_SESSION:13" ;;
            *)     tt="" ;;
        esac
    fi
    echo "$tt"
}

# Human-facing scratchpad hint for the resume nudge. DERIVED from JK_SCRATCHPAD rather
# than re-cased here: this used to be a second, independent definition, and it disagreed
# with jicm-config.sh's — the nudge sent the session to one file while prep read another.
# One source of truth; a path can no longer drift between the two sides of a cycle.
#
# ABSOLUTE, not PROJECT_DIR-relative (2026-08-27). The old form stripped "$PROJECT_DIR/"
# and emitted a relative path, which silently assumed the target lane's cwd IS the
# monorepo. That holds for w0/dev/protos and is false for every out-of-tree lane —
# urist (cwd=Projects/DwarfCron), genie (Projects/WVU), jaques — all of which set
# JICM_PROJECT_DIR precisely because they launch elsewhere. Observed live on urist:
# the resume nudge sent it to DwarfCron/.claude/context/jicm/checkpoints/urist.compressed.md,
# which does not exist, while its real 12.7KB checkpoint sat in the monorepo. The flush
# prompt (step 1.5) had the same defect in the WRITE direction — it asked an out-of-tree
# lane to save working state to a path nothing on the read side ever consults.
# An absolute path is correct from any cwd, so this needs no per-lane table to drift.
_scratchpad_path() { echo "$JK_SCRATCHPAD"; }
_resume_prompt() {
    # "Watcher here." prefix = filter parity: jicm-prep-context.sh's user-message
    # filter excludes startswith("Watcher here.") so this nudge never pollutes a
    # future checkpoint. SAFE vs the W0 legacy watcher's HALT session-detection, which
    # matches the SPECIFIC phrase "Watcher here. Context is getting heavy" (prep
    # find_best_jsonl:139), never a bare prefix — so "Refresh complete" can't collide.
    local ck; ck="$JK_COMPRESSED"
    echo "Watcher here. Refresh complete — read $ck for current state and $(_scratchpad_path) for transient working details, then resume work immediately. No greeting needed."
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
# Fold-forward memory steps (W0 legacy watcher 5.5–5.9), per-key namespaced via JK_*.
# Each is defensive + non-fatal: a missing dependency logs + skips, never aborts
# the cycle (the /clear must still happen once the checkpoint exists).
# ---------------------------------------------------------------------------
_step_flush() {   # 1.5 — ask the live session to flush working state before we take it away
    # PHASE 3 PARITY, RESOLVED 2026-08-12. The legacy W0 legacy watcher ran a HALT handshake
    # (flush to the scratchpad, reply "Understood") that this actuator dropped, on the
    # argument that wait_for_idle + a transcript-reading prep made it redundant. Checking
    # that argument against the record rather than accepting it:
    #
    #   - The handshake was never a guarantee: 41 of 164 recorded cycles (25%) hit the ack
    #     timeout and proceeded WITHOUT a flush.
    #   - But 75% is not 0%. Dropping it outright IS a regression, and it showed: the dev
    #     lane cycled HALT-less on 2026-08-12 and resumed onto a scratchpad 15 days stale
    #     that actively misdescribed the system's state.
    #
    # So the step is folded FORWARD for every lane rather than kept as a W0 special case.
    # Two deliberate improvements over the legacy version:
    #   - Completion is detected with _wait_for_idle (transcript terminal stop_reason)
    #     instead of grepping the pane for the literal string "Understood". Some of that
    #     25% was likely ack-DETECTION failure, not non-compliance.
    #   - The scratchpad named is this key's own (JK_SCRATCHPAD), so a lane can never be
    #     told to flush into another lane's working file.
    #
    # Failure policy matches step 3.4's: ALERT and PROCEED. Refusing to clear a session
    # already past its hard threshold is the worse failure, and prep still reads the full
    # transcript — a missed flush costs curation, not the resume path.
    [[ "${JICM_FLUSH_ENABLED:-true}" == "true" ]] || { _log "1.5 flush skipped (disabled)"; return 0; }
    if [[ -z "$TMUX_TARGET" || ! -x "$INJECT_SCRIPT" ]]; then
        _log "1.5 flush skipped (no pane to prompt — self/background key)"; return 0
    fi
    local rel; rel="$(_scratchpad_path)"
    # "Watcher here." prefix = the same filter parity the resume nudge relies on:
    # jicm-prep-context.sh drops user messages starting with it, so this instruction
    # never reads back as if the USER had asked for it.
    _inject clear-input; sleep 0.3
    _inject text "Watcher here. Context is heavy and a refresh is imminent — please save any in-progress working details to $rel (update it, don't append blindly; it is your resume doc), then stop. No need to reply at length."
    sleep 0.5
    _inject submit; sleep 0.5
    _log "1.5 flush prompt sent (-> $rel)"
    if _wait_for_idle "$TRANSCRIPT" "${JICM_FLUSH_TIMEOUT:-180}"; then
        _log "1.5 flush complete"
    else
        _log "ALERT ⚠️ 1.5 flush did NOT complete within ${JICM_FLUSH_TIMEOUT:-180}s — proceeding to /clear anyway (prep reads the full transcript, so this costs curation, not resume). Repeated occurrences mean the flush prompt is not landing: check the pane target and the inject script."
    fi
}

_step_prep() {   # build the resume checkpoint into JK_COMPRESSED; return non-empty
    if [[ -f "$JK_COMPRESSION_SIGNAL" || -f "$JK_COMPRESSION_GUARD" ]]; then
        _log "prep: skipped (signal/guard already present)"
    else
        : > "$JK_COMPRESSION_GUARD"
        _log "prep: building checkpoint (transcript=$(basename "$TRANSCRIPT"))"
        # CROSS-LANE CONTAMINATION FIX (2026-07-29). The six vars below were passed; the three
        # MEMORY inputs were not — so prep fell back to its defaults, which are W0's SHARED
        # session-state.md / .scratchpad.md / .active-plan. The per-key values existed in
        # jicm-config.sh all along and were simply never handed over.
        # Consequence, observed live: the protos checkpoint carried W0's session status
        # ("PALIMPSEST — POST-AUDIT VERIFICATION…", frozen 2026-06-15). The successor read
        # another lane's work as its own orders and launched a real 25-minute OCR pipeline
        # against a live project. Same class as the "generate a CV" mis-inject of 2026-07-18.
        # A key's checkpoint must be built ONLY from that key's own memory.
        JICM_JSONL_PATH="$TRANSCRIPT" \
        JICM_COMPRESSED_FILE="$JK_COMPRESSED" \
        JICM_COMPRESSION_SIGNAL="$JK_COMPRESSION_SIGNAL" \
        JICM_METADATA_FILE="$JK_METADATA" \
        JICM_METRICS_FILE="$JK_METRICS" \
        JICM_JSONL_STATS="$JK_JSONL_STATS" \
        JICM_SESSION_STATE="$JK_SESSION_STATE" \
        JICM_SCRATCHPAD="$JK_SCRATCHPAD" \
        JICM_ACTIVE_PLAN="$JK_ACTIVE_PLAN" \
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
        # JK_RAG_COLLECTION, not the ambient JICM_RAG_COLLECTION: the actuator is
        # detached and never inherits the lane's launcher env, so the ambient value is
        # whatever shell fired the cycle (in practice the global `sessions` default).
        export PROJECT_DIR JICM_RAG_DEDUP_THRESHOLD \
               JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
        export JICM_RAG_COLLECTION="$JK_RAG_COLLECTION"
        export JICM_COMPRESSED_FILE="$JK_COMPRESSED" JICM_SESSION_ID="$sid"
        _bounded "5.5 RAG ingest" "$JICM_INGEST_TIMEOUT_RAG" \
            "$VENV_PY" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
    ) &
    _log "5.5 RAG ingest launched (pid $!, collection=$JK_RAG_COLLECTION)"
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
            # Was hardcoded JICM_RAG_COLLECTION="sessions" — which sent EVERY lane's
            # scrollback into Jarvis's collection regardless of key, and would have
            # defeated the per-key routing even after it was fixed upstream.
            export PROJECT_DIR JICM_RAG_DEDUP_THRESHOLD \
                   JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
            export JICM_RAG_COLLECTION="$JK_RAG_COLLECTION"
            export JICM_COMPRESSED_FILE="$JK_SCROLLBACK_SUMMARY" JICM_SESSION_ID="$sid"
            _bounded "5.6c scrollback RAG ingest" "$JICM_INGEST_TIMEOUT_RAG" \
                "$VENV_PY" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
        ) &
        _log "5.6c scrollback → RAG ingest launched (pid $!, collection=$JK_RAG_COLLECTION)"
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

_step_digest() {   # STAGE ③ — distil the OUTGOING transcript, then fold it into the checkpoint
    # WHY HERE (before the /clear, blocking): the digest's whole purpose is to reach the SUCCESSOR,
    # and the successor is fed from JK_COMPRESSED at session-start. Running it after the clear
    # would produce a fine artifact that arrives one cycle too late. The pre-warm exists precisely
    # to make this blocking step affordable: ~170s warm vs ~495s cold, paid while the session sits
    # idle awaiting its own clear.
    #
    # This step is ADVISORY: a missing digest costs the successor context, but a session stuck
    # above its hard threshold costs it everything. So every failure path here logs and returns 0.
    [[ "${JICM_DIGEST_ENABLED:-true}" == "true" ]] || { _log "3.5 digest disabled"; return 0; }
    local sid td out row degen trunc words
    sid="$(basename "$TRANSCRIPT" .jsonl)"
    td="$SCRIPT_DIR/jicm-digest/tdigest.py"
    [[ -f "$td" ]] || { _log "3.5 digest skipped (no tdigest.py)"; return 0; }
    [[ -n "$JICM_DIGEST_ARGS" ]] || { _log "3.5 digest skipped (JICM_DIGEST_ARGS unset)"; return 0; }

    mkdir -p "$JICM_DIGESTS_DIR" 2>/dev/null
    out="$JICM_DIGESTS_DIR/${JK_KEY}-${sid:0:8}.md"
    _log "3.5 digest: distilling ${sid:0:8} (pre-warm makes this ~170s; cold ~495s)"
    row="$(cd "$SCRIPT_DIR/jicm-digest" && python3 tdigest.py "$sid" $JICM_DIGEST_ARGS \
             --out "$out" --tag "cycle|$JK_KEY" 2>>"$JICM_LOG_FILE")"
    if [[ -z "$row" || ! -s "$out" ]]; then
        _log "3.5 ALERT: digest produced nothing — successor resumes WITHOUT session history"
        return 0
    fi

    # Honour the harness's own verdict fields rather than re-deriving them. `degenerate` exists
    # because a 26-word continuation-mode reply once passed every other guard and would have been
    # shipped as a handoff; shipping a known-bad digest is worse than shipping none, because the
    # successor cannot tell it is reading a failure.
    degen="$(printf '%s' "$row" | jq -r '.degenerate // false' 2>/dev/null)"
    trunc="$(printf '%s' "$row" | jq -r '.truncated  // false' 2>/dev/null)"
    words="$(printf '%s' "$row" | jq -r '.words // 0' 2>/dev/null)"
    if [[ "$degen" == "true" ]]; then
        _log "3.5 ALERT: digest DEGENERATE (${words} words — continuation-mode) — NOT folding into the checkpoint; kept at $out for inspection"
        return 0
    fi
    [[ "$trunc" == "true" ]] && _log "3.5 WARN: digest hit the generation cap (${words} words) — folding it in anyway, it is truncated not wrong"

    # Fold INTO the existing checkpoint rather than adding a second injection path: the resume
    # route already carries JK_COMPRESSED, and a parallel channel would be one more thing to keep
    # in sync (and to forget). Appended, never overwriting what prep built.
    {
        echo
        echo "---"
        echo
        echo "## Session History Digest (previous session ${sid:0:8})"
        echo
        echo "*What actually happened in the session before this one — distilled from its full"
        echo "transcript. The checkpoint above is curated working state; this is the record.*"
        echo
        cat "$out"
    } >> "$JK_COMPRESSED"
    _log "3.5 digest folded into checkpoint (${words} words, $out)"

    # Record it against the chain row, so the succession carries a pointer to its own history.
    "$SCRIPT_DIR/jicm-chain.sh" digest "$JK_KEY" "$sid" "$out" 2>>"$JICM_LOG_FILE" \
        || _log "3.5 note: chain digest attach failed (digest itself is fine)"
    return 0
}

_step_graphiti() {   # 5.9 — checkpoint → L5 Graphiti episode (async, non-blocking)
    [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]] || return 0
    [[ -x "$VENV_PY" ]] || { _log "5.9 graphiti skipped (no venv)"; return 0; }
    local g="$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py"
    if [[ -f "$g" ]]; then
        # GRAPHITI_GROUP_ID was never exported here, so every lane's episodes went to
        # graphiti-auto-ingest.py's default group. Same detached-process blind spot as
        # the RAG steps above.
        ( export PROJECT_DIR JICM_COMPRESSED_FILE="$JK_COMPRESSED"
          export GRAPHITI_GROUP_ID="$JK_GRAPHITI_GROUP"
          _bounded "5.9 Graphiti ingest" "$JICM_INGEST_TIMEOUT_GRAPHITI" \
              "$VENV_PY" "$g" >> "$JICM_LOG_FILE" 2>&1 ) &
        _log "5.9 Graphiti episode ingest launched (pid $!, group=$JK_GRAPHITI_GROUP)"
    elif [[ -f "$JICM_GRAPHITI_INGEST_SCRIPT" ]]; then
        ( export GRAPHITI_GROUP_ID="$JK_GRAPHITI_GROUP"
          _bounded "5.9 Graphiti ingest (prepopulate fallback)" "$JICM_INGEST_TIMEOUT_GRAPHITI" \
              "$VENV_PY" "$JICM_GRAPHITI_INGEST_SCRIPT" --file "$JK_COMPRESSED" >> "$JICM_LOG_FILE" 2>&1 ) &
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

    # 1.5 FLUSH — the W0 HALT handshake, folded forward (Phase 3 parity checkpoint).
    _step_flush

    # 2. Build the resume checkpoint; refuse to /clear without a non-empty anchor.
    if ! _step_prep; then
        _log "step2: ABORT — checkpoint empty/absent; refusing to /clear without a resume anchor"
        return 2
    fi
    _log "step2: checkpoint ready ($(wc -c < "$JK_COMPRESSED" | tr -d ' ') bytes)"

    # 3. Fold-forward memory machinery (W0 legacy watcher 5.5–5.9), per-key namespaced.
    _step_rag_ingest          # 5.5  L4 RAG (async)
    _step_scrollback          # 5.6/5.6b/5.6c  scrollback capture + NLP + RAG (async)
    _step_consolidate         # 5.7  insights-log + corrections (SHARED; async)
    _step_scratchpad_rotate   # 5.8  scratchpad rotation (SHARED)
    _step_graphiti            # 5.9  L5 Graphiti episode (async)

    # 3.4 STAGE ① — write the lineage edge. `/clear` mints a new session with no inherited history
    # and records the edge NOWHERE, so we write it ourselves. Placed BEFORE the digest for two
    # reasons: the digest attaches to this row (it cannot attach to a row that does not exist),
    # and the edge is cheap while the digest is minutes long — recording it first means a digest
    # failure cannot also cost us the succession.
    # Failure policy: ALERT and PROCEED. A missing ledger row is detectable afterwards (the
    # successor's bind finds no unbound capture); refusing to clear a session already past its
    # hard threshold is the WORSE failure, and step 2's checkpoint is already on disk. This
    # degrades BOOKKEEPING only, never the resume path.
    _outgoing_sid="$(basename "$TRANSCRIPT" .jsonl)"
    if ! "$SCRIPT_DIR/jicm-chain.sh" capture "$JK_KEY" "$_outgoing_sid" 2>>"$JICM_LOG_FILE"; then
        _log "step3.4: ALERT — continuity capture FAILED for ${_outgoing_sid:0:8}; proceeding, this cycle's lineage edge is UNRECORDED"
    else
        _log "step3.4: continuity edge captured (${_outgoing_sid:0:8})"
    fi

    _step_digest              # 3.5  STAGE ③ — distil the outgoing transcript into the checkpoint

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
    #
    # WIRED 2026-08-15. The reset is a RESPAWN, not a /clear, and that choice is the whole point.
    # Sir's requirement: on reset Protos must come back with "all of the MCP servers available,
    # task management awareness, and all of the permissions and other tool call options" — and
    # every one of those is a LAUNCH-TIME property (--mcp-config, --permission-mode, --add-dir,
    # --model, the system prompt). A /clear mints a new session but REUSES the process, so it
    # restores none of them (the same reason a /clear can never clear hook staleness). Only a
    # respawn from the pane's own start command can, so zero-state delegates to
    # aion-lane-restart.sh --fresh, which strips --resume and verifies the strip took effect.
    #
    # It also deliberately does NOT preserve the session's work: for a lane whose priority role
    # is to be forked from, carrying a one-off interactive conversation forward is contamination,
    # not continuity.
    local restart="$PROJECT_DIR/.claude/scripts/aion-lane-restart.sh" rc
    if [[ ! -x "$restart" ]]; then
        _log "zero-state ALERT: aion-lane-restart.sh missing/not executable at $restart — NO reset performed (not faking success)."
        return 4
    fi
    # --yes: this path is already gated upstream (threshold + watcher validation); an
    # interactive confirm here would hang a detached worker forever.
    "$restart" "$JK_KEY" --fresh --yes; rc=$?
    if [[ "$rc" -ne 0 ]]; then
        # Refusals are legitimate outcomes (busy lane, background work) and must surface as
        # NOT-RESET rather than be smoothed into success.
        _log "zero-state ALERT: aion-lane-restart.sh --fresh refused or failed (rc=$rc) — Protos NOT reset. See aion-lane-restart.log for the named cause."
        return 4
    fi
    _log "==== zero-state complete (key=$JK_KEY): respawned on a NEW session with the full launch-time surface (MCP servers, permissions, add-dirs); prior session work deliberately discarded ===="
    return 0
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
# validated watcher) — a bare __run never live-/clears.
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
            # passed the gate and set this sentinel, or a validated watcher asserts
            # it deliberately. A bare `__run <key>` — a human, a wiring bug, or a
            # misread of "do not call directly" — refuses rather than decapitating a
            # live head with zero canary validation.
            if [[ "${JICM_ACTUATE_GATE_OK:-0}" != "1" ]]; then
                _log "ABORT: preserve-restore __run without gate sentinel (JICM_ACTUATE_GATE_OK=1) — refusing live /clear. Route through cmd_fire, or set the sentinel deliberately (watcher)."
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
# <key> nudge  — inject a prompt into the key's pane once it is idle.
# Text comes from JICM_NUDGE_TEXT (env, not a positional) so the arg parser stays a
# simple order-independent for-loop and arbitrary prose never has to survive it.
#
# Exists so REST can live in the watcher without duplicating pane interaction: this
# script already owns _inject, _resolve_target and _wait_for_idle, along with every tmux
# quirk they encode (text and Enter must be separate ops; clear-input first, or a stale
# buffer concatenates with the new text).
#
# POLICY — opposite of _step_flush's, deliberately. A flush precedes a /clear that is
# already going to happen, so it proceeds on timeout. A nudge is OPTIONAL housekeeping,
# so a busy head means SKIP: interrupting real work to ask for a scratchpad prune is a
# bad trade. Returns 3 on a busy head so the caller can tell "skipped" from "failed".
cmd_nudge() {
    local key="$1" text="${JICM_NUDGE_TEXT:-}"
    [[ -n "$text" ]] || { echo "jicm-actuate: nudge requires JICM_NUDGE_TEXT" >&2; return 64; }
    jicm_key_paths "$key"
    TMUX_TARGET="$(_resolve_target)"
    [[ -n "$TMUX_TARGET" ]] || { echo "jicm-actuate: nudge needs a pane for '$key'" >&2; return 2; }
    TRANSCRIPT="$(_resolve_transcript)"
    if [[ -n "$TRANSCRIPT" ]] && ! _wait_for_idle "$TRANSCRIPT" "${JICM_NUDGE_IDLE_TIMEOUT:-30}"; then
        _log "nudge: SKIPPED for $key — head busy (optional work never interrupts a turn)"
        return 3
    fi
    # DELIVERY IS A TURN, NOT KEYSTROKES. Injecting text proves the PANE received it —
    # not that a turn was created. An unsent line sits in the input box indefinitely, and
    # the next nudge's clear-input silently discards it. Observed 2026-08-14: a nudge to
    # jaques logged "sent", the retrier reported DELIVERED on attempt 10, and the target's
    # transcript never grew a user record — the message was never read, for 30+ minutes,
    # while every layer above reported success. Verify against the only artifact that can
    # falsify it (a new "type":"user" record) and say UNVERIFIED rather than claim a
    # delivery we cannot see. rc 4 = unverified, distinct from 3 (skipped) and 0 (real).
    local before=0
    if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
        before=$(wc -c < "$TRANSCRIPT" 2>/dev/null | tr -d ' ')
        [[ "$before" =~ ^[0-9]+$ ]] || before=0
    fi

    # clear-input is REQUIRED (a stale buffer concatenates with the new text) but it is
    # destructive, and the buffer is not always junk: a HUMAN's unsent line lives in the
    # same place. Snapshot the pane first so a discarded line is always recoverable from
    # the log rather than lost silently. Cheap, and the only way to un-ring that bell.
    #
    # 2026-08-24, TWO defects fixed in this safety net itself:
    #   1. The path was FIXED (nudge-preclear.<key>.txt), so every nudge OVERWROTE the
    #      previous snapshot. Two nudges and the first discarded human line was gone —
    #      the bell this code exists to un-ring rang again, silently. Now timestamped,
    #      with a stable `.latest` pointer for anything that wants the most recent one.
    #   2. `capture-pane -p` with no -S captures only the VISIBLE pane. Measured on
    #      aion:13 the same day: visible ~4KB versus ~138KB with -S -2000. Content
    #      scrolled above the fold was never in the "recoverable" snapshot, so the
    #      guarantee in this comment was wider than the implementation delivered.
    local _snapdir="${JICM_LOG_DIR:-$PROJECT_DIR/.claude/logs}"
    local snap="${_snapdir}/nudge-preclear.${key}.$(date +%Y%m%d-%H%M%S).txt"
    if "$TMUX_BIN" capture-pane -p -S -2000 -t "$TMUX_TARGET" > "$snap" 2>/dev/null; then
        cp -f "$snap" "${_snapdir}/nudge-preclear.${key}.latest.txt" 2>/dev/null
        _log "nudge: pane snapshot before clear-input -> $snap ($(wc -c < "$snap" | tr -d ' ') bytes)"
    fi

    _inject clear-input; sleep 0.3
    _inject text "$text";  sleep 0.5
    _inject submit

    # ABSENT IS NOT CONFIRMED: with no transcript we cannot verify, so we must not claim.
    if [[ -z "$TRANSCRIPT" || ! -f "$TRANSCRIPT" ]]; then
        _log "nudge: UNVERIFIED for $key (${#text} chars) — keystrokes sent, no transcript to confirm a turn"
        return 4
    fi

    local waited=0 max="${JICM_NUDGE_VERIFY_TIMEOUT:-20}"
    while [[ "$waited" -lt "$max" ]]; do
        if tail -c "+$(( before + 1 ))" "$TRANSCRIPT" 2>/dev/null | grep -q '"type":"user"'; then
            _log "nudge: DELIVERED to $key (${#text} chars) — user turn observed after ${waited}s"
            return 0
        fi
        sleep 2; waited=$(( waited + 2 ))
    done
    _log "nudge: UNVERIFIED for $key (${#text} chars) — keystrokes sent but NO user turn in ${max}s; text is probably sitting unsent in the input box (a human line already there blocks submit)"
    return 4
}

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
# Ported + generalized from jicm-self.sh:cmd_prepare (per-key scratchpad via _scratchpad_path).
cmd_prepare() {
    local key="$1"
    jicm_key_paths "$key"
    local scratch; scratch="$(_scratchpad_path)"
    local now age ready=1
    now="$(date +%s)"
    echo "jicm-actuate · prepare · key=$key · deliberate save-gate (NO clear performed):"
    if [[ -f "$scratch" ]]; then
        age=$(( (now - $(stat -f %m "$scratch" 2>/dev/null || echo "$now")) / 60 ))
        echo "  scratchpad : present, ${age}m ago  ($(_scratchpad_path))"
        [[ "$age" -gt 30 ]] && ready=0
    else
        echo "  scratchpad : MISSING — write working state to $(_scratchpad_path) first"; ready=0
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
        preserve-restore) echo "  steps        : idle → prep → [5.5 RAG, 5.6 scrollback, 5.6c RAG, ${shared_steps}5.9 graphiti] → 3.4 chain-capture → 3.5 digest → /clear → resume" ;;
        zero-state)       echo "  steps        : kill+relaunch seed, core-only reload (Phase-4 wiring; Phase-1 ALERTs)" ;;
        monitor)          echo "  steps        : detect + HUD only (no clear)" ;;
    esac
    echo "  [DRY-RUN] no action taken. To actuate: jicm-actuate.sh $key --fire --canary"
}

# ARM the detached actuator. GATED behind --canary in Phase 1 (see SAFETY header).
cmd_fire() {
    local key="$1" canary="$2" expect_sid="${3:-}" expect_target="${4:-}"
    # ---- SAFETY GATE REMOVED 2026-08-12, by Sir's instruction, after the canary
    #      requirement was satisfied SEVEN times across three lanes:
    #        5 × protos, 1 × genie (2026-08-11), 1 × jaques (2026-08-12)
    #      The jaques cycle was the decisive one: 18 steps, 75s, full lane isolation
    #      verified (W0 shared memory + genie's own lane files byte-unchanged), and it
    #      was the first cycle to prove the per-key L4/L5 routing through the DETACHED
    #      actuator — jaques-sessions 0→19, jaques-core 0→21, every other namespace
    #      unmoved. The mechanism is validated; the gate had become the only thing
    #      standing between a raised clear-now signal and the cycle that answers it.
    #
    #      `--canary` is now accepted and ignored, so existing call sites keep working.
    #
    #      WHAT STILL GUARDS THIS PATH — none of it was part of the gate:
    #        · M2 identity pinning below: refuses if the registry moved between the
    #          caller's validation and this arming turn (would clear the wrong session)
    #        · transcript verification (self-decapitation guard) and target verification
    #        · the __run worker independently refuses without JICM_ACTUATE_GATE_OK=1
    #        · the watcher's own C2 checks: raiser alive AND raiser == pane occupant
    #        · the watcher's circuit breaker: FIRE_MAX per key per rolling window,
    #          which ALERTS rather than accepting a stuck lane
    #      Re-gating is a one-line `[[ "$canary" != "1" ]] && return 2` if ever needed.
    # ---- end note ----
    jicm_key_paths "$key"
    local policy transcript target
    policy="$(_resolve_policy)"
    transcript="$(_resolve_transcript)"
    target="$(_resolve_target)"
    # ---- M2 (JICM v9 R2): IDENTITY PINNING — refuse on registry drift ------------
    # The caller (watcher) PROVED which session it validated: raiser alive, and
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
    _worker_pid=$!
    disown 2>/dev/null || true
    # The ARMING side owns the lock, because it is the only place that knows the worker's
    # PID. Format is "epoch|pid": the epoch drives the watcher's TTL backstop, the PID
    # is an OWNER TOKEN. Without it, liveness has to be inferred from argv — and every
    # `( ... ) &` ingest this worker detaches inherits that same argv, so a hung ingest
    # reads as a live cycle and wedges the key forever (observed on key=dev 2026-08-12).
    # Writing it here also closes a second hole: a human running `--fire` by hand used to
    # leave no lock at all, so the watcher could arm a SECOND actuator over the top.
    mkdir -p "$JICM_SIGNALS_DIR" 2>/dev/null
    echo "$(date +%s)|${_worker_pid}" > "$JICM_SIGNALS_DIR/actuating.$key"
    echo "  [CANARY-FIRE] detached actuator armed for key=$key (pid ${_worker_pid})."
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
        -h|--help)      echo "usage: jicm-actuate.sh <key> [sense|prepare]  |  <key> nudge  (text via JICM_NUDGE_TEXT)  |  <key> [--fire [--canary]] [--expect-sid=<sid>] [--expect-target=<pane>]  |  __run <key>"; exit 0 ;;
        sense|prepare|nudge)  [[ -z "$VERB" ]] && VERB="$a" || { echo "jicm-actuate: one verb at a time" >&2; exit 64; } ;;
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
    nudge)   cmd_nudge   "$KEY" ;;
    "")      if [[ "$FIRE" -eq 1 ]]; then cmd_fire "$KEY" "$CANARY" "$EXPECT_SID" "$EXPECT_TARGET"; else cmd_plan "$KEY"; fi ;;
esac
