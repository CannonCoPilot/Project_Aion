#!/bin/bash
# ============================================================================
# jicm-retry-drain.sh — re-send post-cycle memory ingests that failed (single instance)
# ============================================================================
# Option 2 of the 2026-10-10 context-cycle fix. jicm-actuate.sh queues a RAG ingest that was
# killed, failed, or never got the GPU; graphiti-auto-ingest.py queues each Graphiti PART that
# timed out or failed. This drains that queue, one item at a time, each under the shared GPU
# queue at PRIORITY 3, so a live cycle's own work (prio 1-2) always goes first.
#
# Launched by jicm-watcher.sh (_maint_retry_drain) when the queue is non-empty. Safe to run by
# hand. An item that fails JICM_RETRY_MAX_ATTEMPTS times moves to retry/dead/ with an ALERT:
# a part of memory that cannot be written is a finding for a human, never a silent drop.
# NO `set -e`: a grep that finds nothing is not an error here (bash-gotchas).
# ============================================================================

PROJECT_DIR="${JICM_PROJECT_DIR:-${PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
_CALLER_LOG="${JICM_DRAIN_LOG:-}"   # jicm-config.sh sets JICM_LOG_FILE unconditionally; keep an override
SCRIPT_DIR="$PROJECT_DIR/.claude/scripts"
export PROJECT_DIR
source "$SCRIPT_DIR/jicm-config.sh" >/dev/null 2>&1
RETRY_DIR="${JICM_RETRY_DIR:-$PROJECT_DIR/.claude/context/jicm/retry}"
MAX_ATTEMPTS="${JICM_RETRY_MAX_ATTEMPTS:-3}"
VENV_PY="${VENV_PY:-$PROJECT_DIR/infrastructure/.venv/bin/python}"
LOG="${_CALLER_LOG:-${JICM_LOG_FILE:-$PROJECT_DIR/.claude/logs/jicm-watcher.log}}"
TIMEOUT_BIN="${JICM_TIMEOUT_BIN:-$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)}"
export JICM_LOG_FILE="$LOG" JICM_RETRY_DIR="$RETRY_DIR"

source "$SCRIPT_DIR/jicm-alert.sh"
_log() {
    printf '%s [retry-drain] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*" >> "$LOG"
    case "$*" in *ALERT*) JICM_ALERT_SOURCE="jicm-retry-drain" jicm_deliver_alert "$*" ;; esac
}

# ── single instance: mkdir lock + pid token; a dead owner's lock is reaped ──
LOCK="$RETRY_DIR/.drain.lock"
mkdir -p "$RETRY_DIR" 2>/dev/null
if ! mkdir "$LOCK" 2>/dev/null; then
    owner="$(cat "$LOCK/pid" 2>/dev/null)"
    if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
        exit 0                                  # another drain is running; nothing to do
    fi
    rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || exit 0
    _log "reaped a stale drain lock (owner ${owner:-?} dead)"
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
trap 'exit 143' TERM INT                        # a TERM trap must EXIT (reference_trap_term_unkillable)

source "$SCRIPT_DIR/jicm-gpu-queue.sh"

_bump_or_bury() {   # <item> <cause>   (RAG items; Graphiti items do this in Python)
    local item="$1" cause="$2" n
    n="$(jq -r '.attempts // 0' "$item" 2>/dev/null)"; n=$(( n + 1 ))
    if [[ "$n" -ge "$MAX_ATTEMPTS" ]]; then
        mkdir -p "$RETRY_DIR/dead"
        jq --argjson n "$n" --arg c "$cause" '.attempts=$n | .last_error=$c' "$item" > "$RETRY_DIR/dead/$(basename "$item")" 2>/dev/null
        rm -f "$item"
        _log "ALERT RETRY EXHAUSTED: $(basename "$item") failed ${n}x ($cause); moved to dead/. NEEDS A HUMAN: that ingest is NOT in memory."
    else
        # BACKOFF: the watcher launches a drain every ~100s; without this a degraded backend would
        # burn all attempts in minutes and bury the item before the backend recovers.
        jq --argjson n "$n" --arg c "$cause" --argjson nb "$(( $(date +%s) + ${JICM_RETRY_BACKOFF:-600} * n ))" \
            '.attempts=$n | .last_error=$c | .not_before=$nb' "$item" > "$item.tmp" 2>/dev/null && mv "$item.tmp" "$item"
        _log "retry FAILED $(basename "$item") attempt $n/$MAX_ATTEMPTS: $cause"
    fi
}

n_ok=0; n_fail=0
for item in "$RETRY_DIR"/*.json; do
    [[ -f "$item" ]] || continue
    kind="$(jq -r '.kind // ""' "$item" 2>/dev/null)"
    nb="$(jq -r '.not_before // 0' "$item" 2>/dev/null)"
    [[ "$nb" =~ ^[0-9]+$ && "$nb" -gt "$(date +%s)" ]] && continue      # still backing off
    if ! gpu_acquire 3 "retry $(basename "$item")" "${JICM_GPU_WAIT_RETRY:-3600}"; then
        _log "GPU busy for ${JICM_GPU_WAIT_RETRY:-3600}s; leaving the rest of the queue for the next pass"
        break
    fi
    case "$kind" in
        rag)
            file="$(jq -r .file "$item")"; coll="$(jq -r .collection "$item")"; sid="$(jq -r .session_id "$item")"
            if [[ ! -s "$file" ]]; then
                _bump_or_bury "$item" "snapshot missing: $file"; rc=1
            else
                JICM_RAG_COLLECTION="$coll" JICM_COMPRESSED_FILE="$file" JICM_SESSION_ID="$sid" \
                    ${TIMEOUT_BIN:+"$TIMEOUT_BIN" -s TERM -k 15 "${JICM_INGEST_TIMEOUT_RAG:-600}"} \
                    "$VENV_PY" "$SCRIPT_DIR/jicm-auto-ingest.py" >> "$LOG" 2>&1; rc=$?
                if [[ "$rc" -eq 0 ]]; then
                    _log "retry INGESTED $(basename "$item") ($(jq -r .label "$item"), collection=$coll)"
                    rm -f "$item" "$file"
                else
                    _bump_or_bury "$item" "rc=$rc"
                fi
            fi ;;
        graphiti)
            ${TIMEOUT_BIN:+"$TIMEOUT_BIN" -s TERM -k 15 "${JICM_GRAPHITI_RETRY_BOUND:-1800}"} \
                "$VENV_PY" "$SCRIPT_DIR/graphiti-auto-ingest.py" --drain-one "$item" >> "$LOG" 2>&1; rc=$?
            # Killed by the outer bound: the Python never recorded the attempt, so record it here.
            [[ "$rc" -eq 124 || "$rc" -eq 137 ]] && [[ -f "$item" ]] && _bump_or_bury "$item" "killed at outer bound"
            ;;
        *)
            _log "ALERT unknown retry kind '$kind' in $(basename "$item"); moved to dead/"
            mkdir -p "$RETRY_DIR/dead"; mv "$item" "$RETRY_DIR/dead/"; rc=1 ;;
    esac
    gpu_release
    [[ "$rc" -eq 0 ]] && n_ok=$(( n_ok + 1 )) || n_fail=$(( n_fail + 1 ))
done
[[ $(( n_ok + n_fail )) -gt 0 ]] && _log "drain pass done: $n_ok ingested, $n_fail failed (left queued or dead)"
exit 0
