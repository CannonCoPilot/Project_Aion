#!/bin/bash
# ============================================================================
# jicm-supervisor.sh — Registry-driven multi-session context supervisor (JICM v9)
# ============================================================================
# The generalized successor to the singleton jicm-watcher.sh. Instead of one
# hard-wired target (aion:0), it loops the registry (.claude/context/jicm/registry/)
# and manages EVERY registered session: senses each key's state, garbage-collects
# dead sessions, and — at threshold — spawns a transient detached jicm-actuate.sh
# per key. One supervisor (PID singleton); actuators are transient (no PID).
#
# DATA FLOW (per key, reusing the Phase-1 hooks as the sensors):
#   jicm-gate (UserPromptSubmit) senses tokens → state/<key>.json (pending_action)
#   jicm-stop (Stop) at threshold → raises signals/clear-now.<key>.signal
#   THIS supervisor sees the clear-now signal → (GATED) spawns jicm-actuate.sh <key>
#   jicm-actuate runs the policy cycle → /clear → session-start re-injects the checkpoint
# For Alfred lanes (Protos/chains, Phase 4) there is no gate/stop; the supervisor will
# sense their transcripts directly. Phase 2 is signal-driven (consumes gate/stop output).
#
# ── THE GATE (staged) ───────────────────────────────────────────────────────
# Autonomous firing is STAGED GATED. Default (JICM_SUPERVISOR_ACTUATE unset/0) =
# SENSE + GC + LOG ONLY: the loop detects that a key wants a clear and logs
# "ACTUATE-PENDING", but sends NO /clear. This is safe to run right now.
#
# Firing is intentionally DOUBLE-gated — both must be open before any live /clear:
#   1. This supervisor's env gate: JICM_SUPERVISOR_ACTUATE=1  (autonomy enabled)
#   2. The actuator's code gate:   jicm-actuate.sh --fire un-gated (mechanism validated)
# The supervisor fires via `jicm-actuate.sh <key> --fire`; while the actuator's
# --canary block is still in place, that call is BLOCKED and the supervisor logs
# "ACTUATE-BLOCKED" (loud, never silent). Un-gate sequence (Phase 2 exit, human hand):
#   (a) canary the actuator on a DISPOSABLE session: jicm-actuate.sh <key> --fire --canary
#   (b) delete the --canary block in jicm-actuate.sh:cmd_fire   (mechanism trusted)
#   (c) launch the supervisor with JICM_SUPERVISOR_ACTUATE=1    (autonomy on)
# After (a)–(c) autonomous clearing is fully live — which IS the goal; the gate only
# forces one supervised live-fire before an unattended, session-destroying loop runs.
#
# W0 is EXCLUDED by default (the legacy watcher still owns aion:0 until Phase 3);
# set JICM_SUPERVISOR_INCLUDE_W0=1 to shadow/fold it in.
#
# MODES:
#   jicm-supervisor.sh            daemon loop (sense + GC + gated actuation)
#   jicm-supervisor.sh --once     one pass then exit (testing / cron tick)
#   jicm-supervisor.sh --status   print registry + sensed state + gate state; no action
#   jicm-supervisor.sh --stop     stop the running supervisor
#
# Author: Jarvis (W11), 2026-07-19 — JICM v9 Phase 2.
# ============================================================================
set -o pipefail

# Resolve project root; strip ambient prep-overrides before sourcing config so a
# stray export can never redirect a key's checkpoint/telemetry (Bug-4 posture).
PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
export PROJECT_DIR
unset JICM_COMPRESSED_FILE JICM_COMPRESSION_SIGNAL JICM_METADATA_FILE \
      JICM_METRICS_FILE JICM_JSONL_STATS JICM_JSONL_PATH 2>/dev/null

CONFIG="$PROJECT_DIR/.claude/scripts/jicm-config.sh"
[[ -r "$CONFIG" ]] && . "$CONFIG"
if ! command -v jicm_key_paths >/dev/null 2>&1 || ! command -v jicm_registry_keys >/dev/null 2>&1; then
    echo "jicm-supervisor: FATAL — jicm-config.sh failed to load (no registry helpers)" >&2
    exit 66
fi

ACTUATOR="$PROJECT_DIR/.claude/scripts/jicm-actuate.sh"
SUP_LOG="$PROJECT_DIR/.claude/logs/jicm-supervisor.log"
SUP_PID_FILE="$JICM_DIR/supervisor.pid"
POLL_SEC="${JICM_SUPERVISOR_POLL:-5}"
GC_STALE_SEC="${JICM_SUPERVISOR_GC_SEC:-7200}"        # last_seen older than this → GC (2h)
LOCK_TTL_SEC="${JICM_SUPERVISOR_LOCK_TTL:-1200}"      # SIGKILL backstop only; liveness is primary
# Circuit breaker (review finding 4): a key that fires too many times in a window is
# STUCK — an actuator aborting a structurally-unresolvable key (bad transcript / stale
# uuid) that retries every Stop, OR a session whose baseline sits over threshold. Back
# off + ALERT instead of hammering /clear at it forever. This is a circuit-breaker that
# ALERTS for human redesign, never a silent terminal acceptance (No Silent Degradation).
FIRE_MAX="${JICM_SUPERVISOR_FIRE_MAX:-3}"             # max arms per key per window before backoff
FIRE_WINDOW_SEC="${JICM_SUPERVISOR_FIRE_WINDOW:-3600}"  # rolling window (1h); self-resets when it rolls
ACTUATE_ENABLED="${JICM_SUPERVISOR_ACTUATE:-0}"       # THE GATE (0 = sense-only)
INCLUDE_W0="${JICM_SUPERVISOR_INCLUDE_W0:-0}"         # Phase 3 flag; default skip w0
SIGNAL_MAX_AGE_SEC="${JICM_SUPERVISOR_SIGNAL_MAX_AGE:-900}"  # C2 backstop: an unresolved clear-now older than this is reaped

mkdir -p "$JICM_DIR" "$JICM_SIGNALS_DIR" "$JICM_REGISTRY_DIR" "$(dirname "$SUP_LOG")" 2>/dev/null

_log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$SUP_LOG"; }
_now() { date +%s; }

# Parse an ISO-8601 UTC last_seen ("…Z") to epoch seconds. macOS BSD date; TZ=UTC so
# the Z timestamp isn't misread as local time. Returns 0 on empty/unparseable.
_iso_epoch() {
    local iso="$1"
    [[ -z "$iso" || "$iso" == "null" ]] && { echo 0; return; }
    TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null || echo 0
}

# Is a detached actuator worker for this key actually alive? (finding-1 fix — reclaim
# the lock by real process liveness, never a timeout guess, so a slow-but-healthy cycle
# can't be reclaimed + double-fired.) Matches the worker's cmdline; the key is anchored
# by ( |$) so "dev" can't match "dev2". pgrep is read-only (no pkill self-match risk).
_worker_alive() { pgrep -f "jicm-actuate\.sh __run ${1}( |\$)" >/dev/null 2>&1; }

# Is the key's transcript inactive? (finding-3 fix — corroborate GC liveness. Claude
# writes the transcript on every tool-use, so it stays fresh through a long tool-heavy
# turn even when no new prompt bumps last_seen.) Gone/absent → treated as stale.
_transcript_stale() {
    local tp mt; tp="$(jicm_registry_get "$1" '.transcript_path')"
    [[ -z "$tp" || "$tp" == "null" || ! -f "$tp" ]] && return 0
    mt=$(stat -f %m "$tp" 2>/dev/null || echo 0)
    [[ $(( $(_now) - mt )) -gt "$GC_STALE_SEC" ]]
}

# Does the supervisor manage this key in the current phase? (w0 stays on the watcher.)
_managed() {
    [[ "$1" == "w0" && "$INCLUDE_W0" != "1" ]] && return 1
    return 0
}

# Sense a key from the gate-written state file. Echoes "tokens|pending|hard".
_sense() {
    jicm_key_paths "$1"
    [[ -f "$JK_STATE" ]] || { echo "0|none|0"; return; }
    jq -r '[(.tokens // 0), (.pending_action // "none"), (.hard_threshold_tokens // 0)] | join("|")' "$JK_STATE" 2>/dev/null || echo "0|none|0"
}

# GC a dead session: remove its registry entry, state, and transient signals/markers.
_gc_key() {
    jicm_key_paths "$1"
    rm -f "$JK_REGISTRY" "$JK_STATE" "$JK_CLEAR_SIGNAL" "$JK_RESUME_SIGNAL" \
          "$JK_COMPRESSION_SIGNAL" "$JK_COMPRESSION_GUARD" \
          "$JICM_SIGNALS_DIR/actuating.$1" "$JICM_SIGNALS_DIR/pending-noted.$1" \
          "$JICM_SIGNALS_DIR/fire-log.$1" "$JICM_SIGNALS_DIR/fire-log.$1.alerted" 2>/dev/null
    _log "GC: removed dead key=$1 (stale last_seen; registry + state + signals)"
}

# Release the actuating lock once the actuator has finished (its clear-now signal gone).
_reap_lock() {
    jicm_key_paths "$1"
    local lock="$JICM_SIGNALS_DIR/actuating.$1"
    [[ -f "$lock" ]] || return 0
    if ! _worker_alive "$1" && [[ ! -f "$JK_CLEAR_SIGNAL" ]]; then
        rm -f "$lock"; _log "reap: key=$1 actuation cycle complete (lock released)"
    fi
}

# Circuit breaker (finding 4): count actual arm attempts per key in a rolling window.
# Returns 1 (BACK OFF — do not fire) once a key exceeds FIRE_MAX within FIRE_WINDOW_SEC,
# ALERTing once per breach. Self-resets when the window rolls (a key that stops needing
# clears decays back to healthy). Marker: signals/fire-log.<key> = "count|window_start".
_fire_ok() {
    local key="$1" f="$JICM_SIGNALS_DIR/fire-log.$1" now count wstart
    now="$(_now)"
    [[ -f "$f" ]] && IFS='|' read -r count wstart < "$f"
    [[ "$count" =~ ^[0-9]+$ ]] || count=0
    [[ "$wstart" =~ ^[0-9]+$ ]] || wstart="$now"
    if [[ $(( now - wstart )) -gt "$FIRE_WINDOW_SEC" ]]; then   # window rolled → reset
        count=0; wstart="$now"; rm -f "$f.alerted" 2>/dev/null
    fi
    count=$(( count + 1 ))
    echo "$count|$wstart" > "$f"
    if [[ "$count" -gt "$FIRE_MAX" ]]; then
        if [[ ! -f "$f.alerted" ]]; then
            _log "ALERT ⚠️ CIRCUIT-BREAKER key=$key — armed $count× in <$(( FIRE_WINDOW_SEC/60 ))m; a clear that never resolves = a STUCK key (unresolvable transcript, or a resume baseline already over threshold). BACKING OFF until the window resets. NEEDS A HUMAN: check the actuator log + this key's thresholds vs its baseline."
            echo "$now" > "$f.alerted"
        fi
        return 1
    fi
    return 0
}

# Fire the detached actuator for a key — via `--fire` so the actuator's own gate +
# safety checks (idle-wait, transcript verification, checkpoint non-empty) all apply.
# Writes an actuating lock ONLY on a successful arm, so a --canary-blocked call never
# wedges the key. No-op if already actuating (unless the lock is stale) or backed off.
_fire() {
    jicm_key_paths "$1"
    local lock="$JICM_SIGNALS_DIR/actuating.$1" age
    if [[ -f "$lock" ]]; then
        _worker_alive "$1" && return 0                         # cycle genuinely in flight — never double-fire
        age=$(( $(_now) - $(cat "$lock" 2>/dev/null || echo 0) ))
        [[ "$age" -lt "$LOCK_TTL_SEC" ]] && return 0           # young lock, worker not yet visible (starting) — wait
        _log "ALERT: stale actuating lock key=$1 (${age}s, no live worker) — clearing + re-evaluating"
        rm -f "$lock"
    fi
    _fire_ok "$1" || return 0    # circuit breaker: a stuck key is backed off (ALERTed), not hammered
    # M2 — pin the actuator to the identity _signal_valid just PROVED, so a registry
    # move between validation and arming aborts the cycle instead of redirecting it at
    # whoever now holds the key. Unset pins (nothing proven) omit the flags entirely.
    local pin=()
    [[ -n "${SIGVALID_SID:-}"    ]] && pin+=("--expect-sid=${SIGVALID_SID}")
    [[ -n "${SIGVALID_TARGET:-}" ]] && pin+=("--expect-target=${SIGVALID_TARGET}")
    if bash "$ACTUATOR" "$1" --fire ${pin[@]+"${pin[@]}"} >> "$SUP_LOG" 2>&1; then
        echo "$(_now)" > "$lock"
        _log "ACTUATE: armed detached actuator for key=$1 via --fire (lock set)${SIGVALID_SID:+ · pinned sid=${SIGVALID_SID}}"
    else
        _log "ACTUATE-BLOCKED key=$1 (--fire rc≠0 — identity drift (M2), --canary gate, or unresolved transcript/target; see the actuator log for the exact cause)"
    fi
}

# C2 — validate a clear-now signal BEFORE honoring it. Returns 0 = fire-worthy; 1 = refused
# (and reaps the offending signal). Guards, in order:
#   (a) DEAD raiser   — the session that raised it is gone → nothing to clear.
#   (b) MISDIRECTED   — the raiser is NOT the live occupant of the key's pane (e.g. a
#                       background /fork wrote the pane key's signal). Firing would clear
#                       the WRONG session. The pane-occupancy anchor is sound even while
#                       the registry is last-writer-wins polluted (pre-R1).
#   (c) EDGE-PERSISTED— a live re-sense shows it's no longer over threshold.
#   (d) AGED backstop — an unresolved signal older than SIGNAL_MAX_AGE_SEC.
# A valid signal is left in place (so a GATED supervisor still logs ACTUATE-PENDING).
_signal_valid() {
    local key="$1" sid target pane_sid tokens hard now sig_mt age
    # M2: the identity this pass PROVES, published for _fire to pin the actuator to.
    # Reset per call so a later pass can never inherit an earlier pass's proof.
    SIGVALID_SID=""; SIGVALID_TARGET=""
    jicm_key_paths "$key"
    [[ -f "$JK_CLEAR_SIGNAL" ]] || return 1
    sid="$(jq -r '.session_id // empty' "$JK_CLEAR_SIGNAL" 2>/dev/null)"

    # (a) dead raiser
    if [[ -n "$sid" ]] && ! jicm_session_alive "$sid"; then
        _log "SIGNAL-STALE key=$key raiser=$sid not alive — reaping (no live session to clear)"
        rm -f "$JK_CLEAR_SIGNAL"; return 1
    fi
    # (b) misdirected — raiser ≠ live pane occupant
    target="$(jicm_registry_get "$key" '.tmux_target')"
    [[ -z "$target" || "$target" == "null" ]] && target="$(jicm_default_target "$key")"
    if [[ -n "$target" ]]; then
        pane_sid="$(jicm_pane_session "$target")"
        # Fail CLOSED on an unverifiable pane (review F3): if the key HAS a pane but its
        # occupant can't be resolved (tmux hiccup / probe race), we cannot prove the signal
        # is correctly directed — so do NOT fire this pass. Retain the signal (no reap) and
        # ALERT; a later pass re-checks once tmux recovers. (Self-keys have no target and
        # never reach here.)
        if [[ -z "$pane_sid" ]]; then
            _log "SIGNAL-UNVERIFIABLE key=$key pane=$target occupancy unresolvable — NOT firing this pass (signal retained for retry)"
            return 1
        fi
        if [[ -n "$sid" && "$pane_sid" != "$sid" ]]; then
            _log "SIGNAL-MISDIRECTED key=$key raiser=$sid but pane $target runs $pane_sid — REFUSING (would clear the wrong session); reaping. [pre-R1 keying pollution]"
            rm -f "$JK_CLEAR_SIGNAL"; return 1
        fi
    fi
    # (c) edge-persisted — re-sense no longer over threshold
    IFS='|' read -r tokens _ hard < <(_sense "$key")
    [[ "$hard"   =~ ^[0-9]+$ ]] || hard=0
    [[ "$tokens" =~ ^[0-9]+$ ]] || tokens=0
    if [[ "$hard" -gt 0 && "$tokens" -lt "$hard" ]]; then
        _log "SIGNAL-EDGE key=$key tokens=$tokens < hard=$hard — no longer over threshold; reaping."
        rm -f "$JK_CLEAR_SIGNAL"; return 1
    fi
    # (d) aged backstop
    now="$(_now)"; sig_mt="$(stat -f %m "$JK_CLEAR_SIGNAL" 2>/dev/null || echo "$now")"
    age=$(( now - sig_mt ))
    if [[ "$age" -gt "$SIGNAL_MAX_AGE_SEC" ]]; then
        _log "SIGNAL-AGED key=$key (${age}s > ${SIGNAL_MAX_AGE_SEC}s, unresolved) — reaping backstop."
        rm -f "$JK_CLEAR_SIGNAL"; return 1
    fi
    # M2 — publish the proven identity for _fire. Prefer the live pane occupant: guard
    # (b) has just established pane_sid == sid, and occupancy is the anchor (C3), sound
    # even when the registry is last-writer-wins polluted. Self-keys (no pane) fall back
    # to the raiser's own sid. Empty => nothing proven => _fire leaves the pin off.
    SIGVALID_SID="${pane_sid:-$sid}"
    SIGVALID_TARGET="$target"
    return 0
}

# One supervision pass over the registry.
_pass() {
    local key tokens pending hard now ls_epoch age noted ck rc
    now="$(_now)"
    # R2 — reconcile pane-actuated keys to the session ACTUALLY in the pane BEFORE any
    # GC/sense/fire decision reads the registry. Ordering matters: reconciling first
    # promotes a startup-race-demoted occupant back to its canonical key, so GC cannot
    # collect the key out from under a live session and the pass senses the right head.
    for ck in w0 dev; do
        jicm_reconcile_pane_key "$ck"; rc=$?
        if [[ -n "${JICM_RECONCILE_NOTE:-}" ]]; then
            if [[ "$rc" -eq 2 ]]; then _log "RECONCILE-$JICM_RECONCILE_NOTE"
            else                       _log "RECONCILE: $JICM_RECONCILE_NOTE"; fi
        fi
    done
    for key in $(jicm_registry_keys); do
        # 1. GC dead sessions first. NEVER GC w0 (watcher owns it), and never a key
        #    with a live actuating lock (a cycle is in flight — don't yank its files).
        if [[ "$key" != "w0" ]] && [[ ! -f "$JICM_SIGNALS_DIR/actuating.$key" ]]; then
            ls_epoch="$(_iso_epoch "$(jicm_registry_get "$key" '.last_seen')")"
            age=$(( now - ls_epoch ))
            # ls_epoch==0 means empty/unparseable last_seen → do NOT GC (fail safe:
            # a malformed timestamp must never delete a possibly-live session). AND
            # require the transcript to be inactive (finding 3) so a long tool-heavy
            # turn (fresh transcript, stale last_seen) is never GC'd out from under.
            if [[ "$ls_epoch" -gt 0 && "$age" -gt "$GC_STALE_SEC" ]] && _transcript_stale "$key"; then
                _gc_key "$key"; continue
            fi
        fi
        # 2. Only manage keys this phase owns.
        _managed "$key" || continue
        # 3. Release a completed cycle's lock.
        _reap_lock "$key"
        jicm_key_paths "$key"
        noted="$JICM_SIGNALS_DIR/pending-noted.$key"
        # 4. Trigger = the stop hook raised this key's clear-now signal — but VALIDATE it
        #    (C2) before honoring: live raiser, correctly directed (raiser occupies the
        #    pane), still over threshold. _signal_valid reaps a bad signal + returns 1.
        #    NOT while a cycle is genuinely in flight for this key: the actuator re-arms
        #    JK_CLEAR_SIGNAL as an internal marker, and _signal_valid's parse/age checks
        #    must not race it (review F5). The actuating lock + a live worker = in flight.
        if [[ -f "$JICM_SIGNALS_DIR/actuating.$key" ]] && _worker_alive "$key"; then
            :   # actuation in flight — leave its signal untouched
        elif [[ -f "$JK_CLEAR_SIGNAL" ]]; then
            if _signal_valid "$key"; then
                if [[ "$ACTUATE_ENABLED" == "1" ]]; then
                    _fire "$key"
                elif [[ ! -f "$noted" ]]; then
                    IFS='|' read -r tokens pending hard < <(_sense "$key")
                    _log "ACTUATE-PENDING key=$key tokens=$tokens pending=$pending (clear-now raised + VALIDATED; supervisor GATED — set JICM_SUPERVISOR_ACTUATE=1 after canary to fire)"
                    echo "$now" > "$noted"
                fi
            else
                # signal was reaped as invalid → reset the once-per-episode marker
                rm -f "$noted" 2>/dev/null
            fi
        else
            # Signal gone → clear the once-per-episode marker so a new signal re-logs.
            rm -f "$noted" 2>/dev/null
        fi
    done
}

# Hook-staleness self-check (review F2). A live claude session whose <pid>.json was created
# BEFORE the current jicm-config.sh mtime is running hooks cached from before the last edit —
# it will NOT honor the current keying/validation until relaunched. Surface loudly so drift
# is visible before a relaunch.
cmd_staleness() {
    local cfg="$PROJECT_DIR/.claude/scripts/jicm-config.sh" cfg_mt f pid sid birth stale=0 total=0
    cfg_mt="$(stat -f %m "$cfg" 2>/dev/null || echo 0)"
    echo "jicm hook-staleness · jicm-config.sh edited $(date -r "$cfg_mt" '+%Y-%m-%d %H:%M' 2>/dev/null)"
    for f in "$HOME"/.claude/sessions/*.json; do
        [[ -f "$f" ]] || continue
        pid="$(basename "$f" .json)"
        [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null || continue
        case "$(ps -o command= -p "$pid" 2>/dev/null)" in *[Cc]laude*) ;; *) continue ;; esac
        total=$((total+1))
        sid="$(jq -r '.sessionId // "?"' "$f" 2>/dev/null)"
        birth="$(stat -f %B "$f" 2>/dev/null || echo 0)"
        if [[ "$birth" -gt 0 && "$cfg_mt" -gt "$birth" ]]; then
            echo "  ⚠️ STALE  ${sid:0:8} (pid $pid) — started before the config edit; RELAUNCH to load current JICM hooks"
            stale=$((stale+1))
        else
            echo "  ✓ fresh  ${sid:0:8} (pid $pid)"
        fi
    done
    if [[ "$stale" -gt 0 ]]; then echo "⚠️  $stale/$total live session(s) need relaunch to activate the current hooks."
    else echo "✓ all $total live session(s) post-date the current config."; fi
}

cmd_status() {
    local gate; [[ "$ACTUATE_ENABLED" == "1" ]] && gate="ENABLED (live firing)" || gate="GATED (sense-only)"
    echo "jicm-supervisor · actuate=$gate · include_w0=$INCLUDE_W0 · poll=${POLL_SEC}s"
    local running="stopped"
    if [[ -f "$SUP_PID_FILE" ]]; then
        local p; p="$(cat "$SUP_PID_FILE" 2>/dev/null)"
        kill -0 "$p" 2>/dev/null && running="running (pid $p)" || running="stale pid ($p)"
    fi
    echo "  daemon: $running"
    local key tokens pending hard
    local keys; keys="$(jicm_registry_keys)"
    [[ -z "$keys" ]] && { echo "  (registry empty — no managed sessions)"; return; }
    for key in $keys; do
        IFS='|' read -r tokens pending hard < <(_sense "$key")
        jicm_key_paths "$key"
        printf '  %-14s policy=%-16s tokens=%-8s pending=%-20s clear-now=%-3s managed=%s\n' \
            "$key" "$(jicm_registry_get "$key" '.reset_policy')" "$tokens" "$pending" \
            "$([[ -f "$JK_CLEAR_SIGNAL" ]] && echo yes || echo no)" \
            "$(_managed "$key" && echo yes || echo no)"
    done
}

_daemon() {
    # Atomic singleton via mkdir (atomic create — exactly one process wins the race;
    # replaces the check-then-write that let two near-simultaneous starts both run).
    if ! mkdir "$SUP_PID_FILE.lock" 2>/dev/null; then
        local old; old="$(cat "$SUP_PID_FILE" 2>/dev/null)"
        if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
            echo "jicm-supervisor: already running (pid $old)"; exit 0
        fi
        # lock present but owner dead → reclaim atomically (the loser of a tie exits).
        rmdir "$SUP_PID_FILE.lock" 2>/dev/null
        mkdir "$SUP_PID_FILE.lock" 2>/dev/null || { echo "jicm-supervisor: lost singleton race"; exit 0; }
    fi
    echo "$$" > "$SUP_PID_FILE"
    trap 'rm -f "$SUP_PID_FILE"; rmdir "$SUP_PID_FILE.lock" 2>/dev/null; _log "==== supervisor stopped (pid $$) ===="' EXIT
    _log "==== supervisor start (pid $$, poll=${POLL_SEC}s, actuate=$ACTUATE_ENABLED, include_w0=$INCLUDE_W0) ===="
    while true; do
        _pass
        sleep "$POLL_SEC"
    done
}

cmd_stop() {
    [[ -f "$SUP_PID_FILE" ]] || { rmdir "$SUP_PID_FILE.lock" 2>/dev/null; echo "jicm-supervisor: not running"; return 0; }
    local pid; pid="$(cat "$SUP_PID_FILE" 2>/dev/null)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null; echo "jicm-supervisor: stopped (pid $pid)"   # daemon EXIT trap clears pid + lock
    else
        rm -f "$SUP_PID_FILE"; rmdir "$SUP_PID_FILE.lock" 2>/dev/null; echo "jicm-supervisor: cleared stale pid"
    fi
}

# Only run the CLI dispatcher when executed directly. Sourcing (e.g. the R0 unit-test
# harness) loads the functions without starting the daemon.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
case "${1:-}" in
    --once)
        # Defer to a live daemon: if one owns the singleton it will actuate, so this
        # tick does sense + GC ONLY (no _fire) — a cron --once can't double-arm the daemon.
        if [[ -f "$SUP_PID_FILE" ]] && kill -0 "$(cat "$SUP_PID_FILE" 2>/dev/null)" 2>/dev/null; then
            ACTUATE_ENABLED=0
            _log "--once: a daemon owns the singleton — sensing + GC only (no actuation)"
        fi
        _pass ;;
    --status)     cmd_status ;;
    --staleness)  cmd_staleness ;;
    --stop)       cmd_stop ;;
    -h|--help) echo "usage: jicm-supervisor.sh [--once | --status | --stop]   (no arg = daemon loop)"
               echo "  GATE: default is sense-only. JICM_SUPERVISOR_ACTUATE=1 enables live firing"
               echo "        (also needs jicm-actuate.sh --fire un-gated). JICM_SUPERVISOR_INCLUDE_W0=1 folds w0 in." ;;
    "")        _daemon ;;
    *)         echo "jicm-supervisor: unknown arg '$1'" >&2; exit 64 ;;
esac
fi
