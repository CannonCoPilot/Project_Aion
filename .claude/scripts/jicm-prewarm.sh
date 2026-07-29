#!/bin/bash
# jicm-prewarm.sh — populate the digest model's KV cache at the SOFT threshold so the HARD
# threshold pays generation only.
#
# WHY
#   The session digest costs ~495s on a large transcript, and ~370s of that is PROMPT EVALUATION,
#   not generation. Prompt eval is cacheable: re-sending a prompt whose prefix is unchanged costs
#   ~10s instead. So we send the prompt EARLY (at soft) with num_predict=1, which pays the eval
#   and produces nothing; at hard, only generation remains. Measured on 01d1ae83: 495s -> 118s.
#
# WHAT INVALIDATES THE WARM (this is the whole design)
#   The cache survives only while the prompt's PREFIX is byte-identical. Under the `tx` layout the
#   transcript comes first, so a growing session merely EXTENDS the prefix — harmless. The prefix
#   breaks when the TRIM ANCHOR moves, i.e. when the transcript outgrows the context budget and a
#   different set of oldest turns gets dropped. `--trim-quantum` makes that anchor move in jumps
#   rather than continuously, but it still moves eventually.
#   Therefore the re-warm trigger is NOT "soft threshold crossed" and NOT a timer: it is
#   "the anchor moved". We compute the anchor cheaply (no LLM) every tick and compare.
#
# NO SILENT DEGRADATION
#   A failed or skipped warm is a PERFORMANCE loss only — the hard-threshold digest still runs and
#   still produces the same output, just slower. So this script never blocks anything and never
#   escalates. It logs. What it must NOT do is claim a warm it did not achieve, so the state file
#   records the anchor actually warmed, and a mismatch simply causes a re-warm.
#
# Bash 3.2 (macOS): no assoc arrays, no readarray, no `setsid`. Never `set -euo pipefail`.

PW_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$PW_SELF_DIR/jicm-config.sh" 2>/dev/null || { echo "jicm-prewarm: cannot source jicm-config.sh" >&2; exit 1; }

KEY="${1:?usage: jicm-prewarm.sh <key>}"
jicm_key_paths "$KEY"

DIGEST_DIR="$PW_SELF_DIR/jicm-digest"
PW_DIR="$JICM_DIR/prewarm"
PW_STATE="$PW_DIR/$KEY.json"
PW_LOCK="$PW_DIR/$KEY.lock"
PW_LOG="$PROJECT_DIR/.claude/logs/jicm-prewarm.log"

# SHIPPING CONFIG comes from jicm-config.sh — see the JICM_DIGEST_ARGS block there. It is defined
# ONCE precisely so the warm and the digest cannot drift apart; do not restate the flags here.
[[ -n "$JICM_DIGEST_ARGS" ]] || { echo "jicm-prewarm: JICM_DIGEST_ARGS unset — refusing to warm with ad-hoc flags (a mismatched prefix wastes the warm silently)" >&2; exit 1; }

_log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $KEY | $*" >> "$PW_LOG"; }

mkdir -p "$PW_DIR" "$(dirname "$PW_LOG")" 2>/dev/null

# --- Preconditions -----------------------------------------------------------------------
# Never contend with a cycle in flight: the actuator is about to /clear this session, and a
# warm launched now would burn GPU on a transcript that is seconds from being abandoned.
if [[ -f "$JICM_SIGNALS_DIR/actuating.$KEY" ]]; then
    _log "skip: actuation in flight"; exit 0
fi

[[ -f "$JK_STATE" ]] || { _log "skip: no state file"; exit 0; }
TOKENS="$(jq -r '.tokens // 0' "$JK_STATE" 2>/dev/null)"
SOFT="$(jq -r '.soft_threshold_tokens // 0' "$JK_STATE" 2>/dev/null)"
SID="$(jq -r '.session_id // empty' "$JK_STATE" 2>/dev/null)"
[[ "$TOKENS" =~ ^[0-9]+$ && "$SOFT" =~ ^[0-9]+$ && -n "$SID" ]] || { _log "skip: unusable state"; exit 0; }
[[ "$SOFT" -gt 0 && "$TOKENS" -ge "$SOFT" ]] || exit 0        # below soft: nothing to warm, quietly

# Single-flight. A second warm would queue behind the first on the GPU and finish against a
# staler anchor than the one already in progress.
if [[ -f "$PW_LOCK" ]]; then
    LOCK_PID="$(cat "$PW_LOCK" 2>/dev/null)"
    if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        _log "skip: warm already running (pid $LOCK_PID)"; exit 0
    fi
    rm -f "$PW_LOCK" 2>/dev/null                              # stale lock, holder is gone
fi

# --- Has the prefix moved? ---------------------------------------------------------------
# Cheap: --anchor-only computes the trim anchor through the SAME assemble() the real prompt
# uses, without contacting the model. Costs a transcript read, not a GPU second.
# --- COST GATE (found by live testing, 2026-07-29) ----------------------------------------
# --anchor-only re-reads and re-parses the ENTIRE transcript. On a small session that is 0.29s;
# on an 88MB W0 transcript it is 55 SECONDS. Running that every watcher tick would pin a core
# for no reason, so gate it on a stat(): the anchor cannot possibly have moved if the transcript
# has not GROWN. Below a growth threshold it is very unlikely to have moved, and being wrong
# costs only a missed warm — the digest still runs, just cold. That is why a heuristic is
# acceptable HERE and would not be acceptable in the digest itself.
TX_PATH="$(jq -r '.transcript_path // empty' "$JK_STATE" 2>/dev/null)"
[[ -n "$TX_PATH" && -f "$TX_PATH" ]] || TX_PATH="$(ls -S "$HOME/.claude/projects"/*/"$SID"*.jsonl 2>/dev/null | head -1)"
TX_SIZE=0
[[ -f "$TX_PATH" ]] && TX_SIZE="$(stat -f %z "$TX_PATH" 2>/dev/null || echo 0)"
LAST_SIZE="$(jq -r '.tx_size // 0' "$PW_STATE" 2>/dev/null)"
[[ "$LAST_SIZE" =~ ^[0-9]+$ ]] || LAST_SIZE=0
MIN_GROWTH="${JICM_PREWARM_MIN_GROWTH_BYTES:-2000000}"
WARM_SID_PRE="$(jq -r '.sid // empty' "$PW_STATE" 2>/dev/null)"
if [[ "$WARM_SID_PRE" == "$SID" && "$TX_SIZE" -gt 0 && $((TX_SIZE - LAST_SIZE)) -lt "$MIN_GROWTH" ]]; then
    exit 0        # same session, negligible growth → the anchor cannot have moved meaningfully
fi

# stderr is CAPTURED, not appended: this runs on EVERY watcher tick, and tdigest emits a routine
# budget ALERT on any trimmed session. Appending it each tick would bury the real events under
# thousands of identical lines within a day — a log nobody can read is a log nobody reads. It is
# surfaced only when the anchor computation actually fails, which is when it means something.
PW_ERRF="$PW_DIR/.$KEY.anchor.err"
ANCHOR_T0="$(date +%s)"
ANCHOR_JSON="$(cd "$DIGEST_DIR" && python3 tdigest.py "$SID" $JICM_DIGEST_ARGS --anchor-only 2>"$PW_ERRF")"
ANCHOR="$(printf '%s' "$ANCHOR_JSON" | jq -r '.trim_anchor // empty' 2>/dev/null)"
if [[ -z "$ANCHOR" ]]; then
    _log "ALERT: could not compute anchor for ${SID:0:8} — no warm this tick (digest still works, just cold)"
    [[ -s "$PW_ERRF" ]] && sed 's/^/    /' "$PW_ERRF" >> "$PW_LOG"
    rm -f "$PW_ERRF" 2>/dev/null
    exit 0
fi
rm -f "$PW_ERRF" 2>/dev/null

# Surface a scheduler that has become too expensive for the transcript it watches, rather than
# quietly burning a core every tick. This is a redesign signal (incremental parsing, or a
# cheaper anchor proxy), never something to accept as normal.
ANCHOR_SECS=$(( $(date +%s) - ANCHOR_T0 ))
if [[ "$ANCHOR_SECS" -ge 10 ]]; then
    _log "ALERT anchor computation took ${ANCHOR_SECS}s (transcript $(( TX_SIZE / 1048576 ))MB) — the per-tick cost gate is holding, but this scales with transcript size and needs a cheaper anchor"
fi

WARM_SID="$(jq -r '.sid // empty'    "$PW_STATE" 2>/dev/null)"
WARM_ANCHOR="$(jq -r '.anchor // empty' "$PW_STATE" 2>/dev/null)"
if [[ "$WARM_SID" == "$SID" && "$WARM_ANCHOR" == "$ANCHOR" ]]; then
    exit 0                                                    # cache still valid — the common case
fi

# --- Warm ---------------------------------------------------------------------------------
# Detached: this takes minutes and the watcher tick must not block on it. `setsid` DOES NOT
# EXIST on macOS (a trap that has cost two debugging cycles) — nohup + & is the portable form,
# and the launch is verified by PID rather than by an unconditional echo.
_log "warm needed: sid=${SID:0:8} anchor=$ANCHOR (was sid=${WARM_SID:0:8} anchor=${WARM_ANCHOR:-none})"
(
    cd "$DIGEST_DIR" || exit 1
    echo $$ > "$PW_LOCK"
    OUT="$(python3 tdigest.py "$SID" $JICM_DIGEST_ARGS --prewarm --tag "prewarm|$KEY" 2>>"$PW_LOG")"
    RC=$?
    if [[ $RC -eq 0 && -n "$OUT" ]]; then
        P_S="$(printf '%s' "$OUT" | jq -r '.prompt_s // "?"')"
        IN_T="$(printf '%s' "$OUT" | jq -r '.in_tok // "?"')"
        # Record the anchor ACTUALLY warmed — not the one we intended. If the transcript moved
        # under us mid-run, the next tick sees the mismatch and re-warms, which is correct.
        A_OUT="$(printf '%s' "$OUT" | jq -r '.trim_anchor // empty')"
        jq -nc --arg sid "$SID" --argjson anchor "${A_OUT:-$ANCHOR}" \
               --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg p "$P_S" --arg i "$IN_T" \
               --argjson txs "${TX_SIZE:-0}" \
            '{sid:$sid,anchor:$anchor,ts:$ts,tx_size:$txs,prompt_s:($p|tonumber?),in_tok:($i|tonumber?)}' \
            > "$PW_STATE" 2>/dev/null
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $KEY | warmed sid=${SID:0:8} anchor=${A_OUT:-$ANCHOR} prompt_s=${P_S} in_tok=${IN_T}" >> "$PW_LOG"
    else
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $KEY | ALERT warm FAILED rc=$RC — hard-threshold digest will run COLD (correct, just ~4x slower)" >> "$PW_LOG"
    fi
    rm -f "$PW_LOCK" 2>/dev/null
) >/dev/null 2>&1 &
PW_PID=$!
sleep 1
if kill -0 "$PW_PID" 2>/dev/null; then
    _log "warm launched (pid $PW_PID)"
else
    # Gone after 1s. That is AMBIGUOUS: a warm that hit an already-valid cache finishes in
    # well under a second, and so does one that crashed on startup. Distinguishing them by
    # liveness alone reports a success as a failure — so ask the RESULT, not the process.
    NOW_SID="$(jq -r '.sid // empty'    "$PW_STATE" 2>/dev/null)"
    NOW_ANCHOR="$(jq -r '.anchor // empty' "$PW_STATE" 2>/dev/null)"
    if [[ "$NOW_SID" == "$SID" && "$NOW_ANCHOR" == "$ANCHOR" ]]; then
        _log "warm completed immediately (cache already valid for anchor $ANCHOR)"
    else
        _log "ALERT warm exited without recording a result — digest will run COLD (correct, ~4x slower); see $PW_LOG"
    fi
fi
exit 0
