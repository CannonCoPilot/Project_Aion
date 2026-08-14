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

# Age of a key's actuating lock, in seconds. Absent lock → 0.
_lock_age() {
    local lock="$JICM_SIGNALS_DIR/actuating.$1" born
    [[ -f "$lock" ]] || { echo 0; return; }
    born="$(cut -d'|' -f1 "$lock" 2>/dev/null)"
    [[ "$born" =~ ^[0-9]+$ ]] || born=0
    echo $(( $(_now) - born ))
}

# Is a detached actuator worker for this key actually alive? (finding-1 fix — reclaim the
# lock by real process liveness, never a timeout guess, so a slow-but-healthy cycle can't
# be reclaimed + double-fired.) That principle stands; what changed is WHICH process is
# measured. Liveness now resolves through the lock's OWNER TOKEN — the worker PID written
# by `--fire` — because argv cannot identify the cycle: the worker detaches its RAG /
# scrollback / Graphiti ingests as `( ... ) &` subshells, and a bash subshell INHERITS its
# parent's argv verbatim. So `pgrep -f "…__run dev"` matched a hung fire-and-forget child
# long after the cycle finished, wedging the key (observed on key=dev 2026-08-12: a
# 10-minute graphiti-auto-ingest held the lock past `preserve-restore complete`).
# `kill -0` alone would be fooled by PID reuse, so the argv match is retained — demoted
# from primary signal to CORROBORATOR of the token.
# A tokenless (pre-2026-08-12) lock has no owner to check, so it degrades to the old argv
# match, but only while it is younger than the TTL — that way the transitional case is
# still guarded yet cannot wedge a lane permanently the way the unbounded version did.
_worker_alive() {
    local lock="$JICM_SIGNALS_DIR/actuating.$1" pid
    [[ -f "$lock" ]] || return 1
    pid="$(cut -d'|' -f2 -s "$lock" 2>/dev/null)"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
        kill -0 "$pid" 2>/dev/null || return 1
        ps -p "$pid" -o command= 2>/dev/null | grep -qE "jicm-actuate\.sh __run ${1}( |$)"
        return $?
    fi
    [[ "$(_lock_age "$1")" -lt "$LOCK_TTL_SEC" ]] || return 1   # legacy lock: expires
    pgrep -f "jicm-actuate\.sh __run ${1}( |\$)" >/dev/null 2>&1
}

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

# --- R3 — W0 SHADOW MODE ------------------------------------------------------
# While the legacy v7.9 watcher still owns w0, the supervisor may only OBSERVE it.
# The two share ONE signal file: for key=w0, JK_CLEAR_SIGNAL IS the watcher's
# .jicm-clear-now.signal. So INCLUDE_W0=1 is NOT "sense-only" by itself — _signal_valid
# reaps, and a supervisor reap would delete the request the watcher is acting on
# (two managers, one file). Shadow mode suppresses every w0 mutation and logs what it
# WOULD have done — which is precisely the parity evidence R3 needs before cutover.
# Shadow ends by itself: retire the watcher process and w0 becomes fully managed.
_legacy_watcher_alive() { pgrep -f 'jicm-watcher\.sh' >/dev/null 2>&1; }

# Does the legacy watcher still OWN w0 cycling? Process-liveness was the old test, and it
# is now wrong: after the 2026-08-12 cutover the watcher keeps running (REST, MAINTAIN,
# identity) while ceding cycling, so "alive" no longer implies "owns the signal". It
# publishes the claim as a marker file instead.
# BOTH conditions required, deliberately: a marker left behind by a dead watcher must not
# shadow w0 forever, and a live watcher that ceded must not keep w0 shadowed either. The
# conjunction fails safe in both directions.
_legacy_owns_cycling() {
    [[ -f "$JICM_DIR/watcher-owns-cycling" ]] && _legacy_watcher_alive
}
_w0_shadow() { [[ "$1" == "w0" ]] && _legacy_owns_cycling; }

# Reap a clear-now signal — unless we are only shadowing this key.
_reap_signal() {   # <key> <reason>
    if _w0_shadow "$1"; then
        _log "SHADOW-W0: would reap signal ($2) — legacy watcher owns w0; observing only"
        return 0
    fi
    jicm_key_paths "$1"
    rm -f "$JK_CLEAR_SIGNAL"
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
          "$JICM_SIGNALS_DIR/actuating.$1" "$JICM_SIGNALS_DIR/actuating.$1.alerted" \
          "$JICM_SIGNALS_DIR/pending-noted.$1" \
          "$JICM_SIGNALS_DIR/fire-log.$1" "$JICM_SIGNALS_DIR/fire-log.$1.alerted" 2>/dev/null
    _log "GC: removed dead key=$1 (stale last_seen; registry + state + signals)"
}

# Release the actuating lock once the actuator has finished (its clear-now signal gone).
_reap_lock() {
    jicm_key_paths "$1"
    local lock="$JICM_SIGNALS_DIR/actuating.$1"
    [[ -f "$lock" ]] || return 0
    if ! _worker_alive "$1" && [[ ! -f "$JK_CLEAR_SIGNAL" ]]; then
        local held; held="$(_lock_age "$1")"   # read BEFORE the rm, or it always reports 0
        rm -f "$lock" "$lock.alerted"
        _log "reap: key=$1 actuation cycle complete (lock released after ${held}s)"
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
        age="$(_lock_age "$1")"     # NOT `cat $lock`: the lock is "epoch|pid", not a bare epoch
        if _worker_alive "$1"; then
            # Cycle genuinely in flight — NEVER double-fire. But a cycle that outlives the
            # TTL is a fault, not a healthy slow run, and must not be waited on in silence
            # (No Silent Degradation): the lane is un-actuatable for as long as it hangs,
            # and this used to `return 0` with no age check at all, which is what made the
            # stale-lock backstop below UNREACHABLE. Alerting rather than killing is
            # deliberate — SIGKILLing a worker sitting between `/clear` and the resume
            # nudge would strand the session mid-cycle, a strictly worse failure.
            if [[ "$age" -ge "$LOCK_TTL_SEC" && ! -f "$lock.alerted" ]]; then
                _log "ALERT ⚠️ OVERDUE actuation key=$1 — worker pid $(cut -d'|' -f2 -s "$lock" 2>/dev/null) is alive but has held the lock ${age}s (TTL ${LOCK_TTL_SEC}s). This lane is BLOCKED until it exits. NEEDS A HUMAN: check the actuator log for the step it is stuck on."
                echo "$(_now)" > "$lock.alerted"
            fi
            return 0
        fi
        [[ "$age" -lt "$LOCK_TTL_SEC" ]] && return 0           # young lock, worker not yet visible (starting) — wait
        _log "ALERT: stale actuating lock key=$1 (${age}s, no live worker) — clearing + re-evaluating"
        rm -f "$lock" "$lock.alerted"
    fi
    # R3 — never actuate w0 while the legacy watcher still owns it. Belt-and-braces
    # behind the two existing gates: shadow mode must be observe-only even if a future
    # change opens them. Logged so the shadow run shows what cutover WOULD have done.
    if _w0_shadow "$1"; then
        _log "SHADOW-W0: would ARM the actuator now — suppressed (legacy watcher owns w0)"
        return 0
    fi
    _fire_ok "$1" || return 0    # circuit breaker: a stuck key is backed off (ALERTed), not hammered
    # M2 — pin the actuator to the identity _signal_valid just PROVED, so a registry
    # move between validation and arming aborts the cycle instead of redirecting it at
    # whoever now holds the key. Unset pins (nothing proven) omit the flags entirely.
    local pin=()
    [[ -n "${SIGVALID_SID:-}"    ]] && pin+=("--expect-sid=${SIGVALID_SID}")
    [[ -n "${SIGVALID_TARGET:-}" ]] && pin+=("--expect-target=${SIGVALID_TARGET}")
    if bash "$ACTUATOR" "$1" --fire ${pin[@]+"${pin[@]}"} >> "$SUP_LOG" 2>&1; then
        # The lock is written by `--fire` itself, which is the only side that knows the
        # worker's PID (the owner token _worker_alive needs). We only verify it landed —
        # a missing lock means an unguarded cycle, so say so loudly rather than assume.
        if [[ -f "$lock" ]]; then
            _log "ACTUATE: armed detached actuator for key=$1 via --fire (lock set by worker, owner=$(cut -d'|' -f2 -s "$lock" 2>/dev/null))${SIGVALID_SID:+ · pinned sid=${SIGVALID_SID}}"
        else
            _log "ALERT ⚠️ key=$1 armed but NO actuating lock appeared — the cycle is running UNGUARDED (a second arm could double-fire it). NEEDS A HUMAN: check that jicm-actuate.sh cmd_fire still writes signals/actuating.<key>."
        fi
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
        _reap_signal "$key" "stale: dead raiser"; return 1
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
            _reap_signal "$key" "misdirected: raiser not the pane occupant"; return 1
        fi
    fi
    # (c) edge-persisted — re-sense no longer over threshold
    IFS='|' read -r tokens _ hard < <(_sense "$key")
    [[ "$hard"   =~ ^[0-9]+$ ]] || hard=0
    [[ "$tokens" =~ ^[0-9]+$ ]] || tokens=0
    if [[ "$hard" -gt 0 && "$tokens" -lt "$hard" ]]; then
        _log "SIGNAL-EDGE key=$key tokens=$tokens < hard=$hard — no longer over threshold; reaping."
        _reap_signal "$key" "edge: no longer over threshold"; return 1
    fi
    # (d) aged backstop
    now="$(_now)"; sig_mt="$(stat -f %m "$JK_CLEAR_SIGNAL" 2>/dev/null || echo "$now")"
    age=$(( now - sig_mt ))
    if [[ "$age" -gt "$SIGNAL_MAX_AGE_SEC" ]]; then
        _log "SIGNAL-AGED key=$key (${age}s > ${SIGNAL_MAX_AGE_SEC}s, unresolved) — reaping backstop."
        _reap_signal "$key" "aged backstop"; return 1
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
# ---------------------------------------------------------------------------
# MAINTAIN — ported from jicm-watcher.sh (2026-08-13), Phase VII M2/M3/M4.
#
# These were the last things keeping the legacy watcher alive after the W0 cutover.
# They are GLOBAL, not per-lane: service health and identity-file drift are properties
# of the machine, not of any one session — which is exactly why they belong in the
# one process that outlives every lane rather than in a single-target watcher.
#
# Cadence is wall-clock (MAINT_EVERY_SEC), not a poll counter. The watcher used
# "every 100 polls", which silently means a different period whenever the poll
# interval changes — and it did change (1s vs the 3s the launcher asked for).
# ---------------------------------------------------------------------------
MAINT_EVERY_SEC="${JICM_SUPERVISOR_MAINT_SEC:-100}"
declare -i LAST_MAINT=0
TIMEOUT_BIN="${JICM_TIMEOUT_BIN:-}"   # resolved once in jicm-config.sh; empty = unbounded
# Overridable so the DOWN path can actually be exercised. The watcher hardcoded these,
# which meant the branch that writes the alert file could only ever be tested by taking
# a real service down — so in practice it never was.
MAINT_QDRANT_URL="${JICM_HEALTH_QDRANT_URL:-http://localhost:6333}"
MAINT_MLX_URL="${JICM_HEALTH_MLX_URL:-http://localhost:8000/health}"
MAINT_NEO4J_URL="${JICM_HEALTH_NEO4J_URL:-http://localhost:7474}"
# Probe budget. Overridable so the timeout branch is testable without saturating the
# box. Steady-state latency is 1-13ms, so 2s is ~150x headroom — a probe that exceeds
# it is reporting LOAD, and is now classified as `timeout` rather than as "down".
MAINT_PROBE_TIMEOUT="${JICM_HEALTH_PROBE_TIMEOUT:-2}"

# Probe a URL. Echoes "<up>|<ms>|<cause>". Latency comes from curl's own
# %{time_total} rather than bracketing the call with two python3 clock reads (the
# watcher's approach, 6 interpreter launches per pass): it measures the REQUEST
# instead of the request plus shell overhead, and costs nothing.
#
# The CAUSE is the point. `curl -sf` fails identically for three unrelated things,
# and the old boolean collapsed all of them into the word "down":
#   rc 7  connection refused  (~0.0002s) — genuinely down
#   rc 28 timed out           (= max-time) — ALIVE but saturated; NOT down
#   rc 22 HTTP >= 400         (~0.004s)  — ALIVE, wrong endpoint/contract
# A saturated machine therefore reported three simultaneous outages, and a renamed
# Qdrant endpoint would report Qdrant "down" while it served every other request.
# Absence of a successful response is not evidence of a dead service — same defect
# class as the confident zeros in the gate and the anonymous `len=0` checkpoints.
_probe() {
    local url="$1" t rc cause
    t="$(curl -sf --max-time "$MAINT_PROBE_TIMEOUT" -o /dev/null -w '%{time_total}' "$url" 2>/dev/null)"; rc=$?
    [[ "$rc" -eq 0 ]] && { awk -v t="$t" 'BEGIN{printf "true|%d|ok\n", t*1000}'; return; }
    case "$rc" in
        7)  cause="refused" ;;      # nothing listening — the only true "down"
        28) cause="timeout" ;;      # alive but slower than the probe budget
        22) cause="http-error" ;;   # alive, responded, status >= 400
        6)  cause="dns" ;;
        *)  cause="curl-rc-$rc" ;;
    esac
    awk -v t="${t:-0}" -v c="$cause" 'BEGIN{printf "false|%d|%s\n", t*1000, c}'
}

_maint_service_health() {   # M2 + M3
    # Writes .memory-health-SERVICES.json, NOT .memory-health.json.
    #
    # Both this and context-health-monitor.js (a UserPromptSubmit hook) used to
    # writeFileSync the SAME .memory-health.json with DISJOINT, incompatible schemas —
    # the hook's session-scoped {layers:{L1..L6}}, ours the machine-scoped {services}.
    # Neither read before writing, so each pass destroyed the other's data and the
    # /jarvis-memory dashboard (which spreads the file and expects `layers`) rendered
    # empty whenever the supervisor happened to write last. A lock would not have
    # fixed it: serialising two writers of incompatible schemas still yields a file
    # that is one schema or the other at random.
    # So: one writer per file. We own the machine-scoped probe results; the hook owns
    # the canonical file and folds ours in on read (it is deliberately network-free,
    # <200ms, so it cannot do these probes itself). The alert file is unchanged — it
    # is a one-line fast path the hook already surfaces into context.
    local health_file="$PROJECT_DIR/.claude/context/.memory-health-services.json"
    local alert_file="$PROJECT_DIR/.claude/context/.memory-health-alert"
    local qdrant mlx neo4j qok qms qc mok mms mc nok nms nc sessions_count warn
    local unreachable degraded detail svc sname sok scause sms

    qdrant="$(_probe "$MAINT_QDRANT_URL/collections")"; IFS='|' read -r qok qms qc <<<"$qdrant"
    mlx="$(_probe "$MAINT_MLX_URL")";                   IFS='|' read -r mok mms mc <<<"$mlx"
    neo4j="$(_probe "$MAINT_NEO4J_URL")";               IFS='|' read -r nok nms nc <<<"$neo4j"

    sessions_count="$(curl -sf --max-time "$MAINT_PROBE_TIMEOUT" "$MAINT_QDRANT_URL/collections/sessions" 2>/dev/null \
        | jq -r '.result.points_count // 0' 2>/dev/null || echo 0)"
    [[ "$sessions_count" =~ ^[0-9]+$ ]] || sessions_count=0
    warn=null
    [[ "$sessions_count" -gt 10000 ]] && \
        warn="\"sessions collection exceeds 10000 points ($sessions_count) — consider decay pruning\""

    cat > "$health_file" <<HEALTH
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "jicm-supervisor",
  "probe_timeout_s": $MAINT_PROBE_TIMEOUT,
  "services": {
    "qdrant": {"up": $qok, "latency_ms": $qms, "cause": "$qc"},
    "mlx_embed": {"up": $mok, "latency_ms": $mms, "cause": "$mc"},
    "neo4j": {"up": $nok, "latency_ms": $nms, "cause": "$nc"}
  },
  "collections": { "sessions_points": $sessions_count },
  "warnings": $warn
}
HEALTH

    # Split by cause, because the remedies are opposite: `refused`/`dns` means start
    # the service; `timeout`/`http-error` means the service is RUNNING and the fault
    # is load or contract. Both still ALERT — a degraded service is not an accepted
    # state — but an alert that cannot name which one is not actionable.
    unreachable=""; degraded=""; detail=""
    for svc in "Qdrant|$qok|$qc|$qms" "MLX-Embed|$mok|$mc|$mms" "Neo4j|$nok|$nc|$nms"; do
        IFS='|' read -r sname sok scause sms <<<"$svc"
        [[ "$sok" == "true" ]] && continue
        detail="${detail}${sname}(${scause},${sms}ms) "
        case "$scause" in
            refused|dns) unreachable="${unreachable}${sname} " ;;
            *)           degraded="${degraded}${sname} " ;;
        esac
    done

    if [[ -n "$unreachable" || -n "$degraded" ]]; then
        # Consumed by context-health-monitor.js — keep it a single line of prose.
        { [[ -n "$unreachable" ]] && printf 'Memory services UNREACHABLE: %s— L4/L5 operations will fail. ' "$unreachable"
          [[ -n "$degraded"    ]] && printf 'Memory services DEGRADED (alive, not serving): %s— L4/L5 may be slow or erroring. ' "$degraded"
          printf '[%s]\n' "${detail% }"
        } > "$alert_file"
        _log "MAINTAIN: health alert — ${unreachable:+unreachable: $unreachable}${degraded:+degraded: $degraded}· ${detail% }"
    else
        rm -f "$alert_file"
    fi
}

_maint_identity_changes() {   # M4
    local marker="$PROJECT_DIR/.claude/context/.graphiti-prepopulate-ran"
    local psyche="$PROJECT_DIR/.claude/context/psyche"
    [[ -f "$marker" && -d "$psyche" ]] || return 0
    local mmt changed="" f fmt
    mmt="$(stat -f %m "$marker" 2>/dev/null)" || return 0
    while IFS= read -r f; do
        fmt="$(stat -f %m "$f" 2>/dev/null)" || continue
        [[ "$fmt" -gt "$mmt" ]] && changed="${changed}$(basename "$f") "
    done < <(find "$psyche" -name "*.md" -o -name "*.yaml" 2>/dev/null)
    if [[ -n "$changed" ]]; then
        echo "$changed" > "$PROJECT_DIR/.claude/context/.graphiti-reindex-queue"
        _log "MAINTAIN: M4 identity changes queued for re-ingestion: $changed"
        # Advance the marker or every pass re-detects the same files until REST drains
        # the queue — and REST runs at most once a day.
        touch "$marker"
    fi
}

_maintenance_pass() {
    local now; now="$(_now)"
    [[ $(( now - LAST_MAINT )) -lt "$MAINT_EVERY_SEC" ]] && return 0
    LAST_MAINT="$now"
    _maint_service_health
    _maint_identity_changes
}

# ---------------------------------------------------------------------------
# REST (idle-hands) — ported from jicm-watcher.sh (2026-08-13), Phase IV.
#
# SCOPE, stated rather than assumed: REST runs for the SHARED-MEMORY STEWARD only
# (w0), exactly as it did in the watcher. Its stages operate on shared artefacts
# (MEMORY.md, the reindex queue, the log dir) and two of them INJECT PROMPTS into a
# live session. Quietly widening that to all four lanes as part of a "port" would
# start unprompted conversations in three sessions that never had them — a behaviour
# change for Sir to choose, not a side effect of moving code. JICM_REST_KEYS makes
# widening a one-variable decision when he wants it.
#
# Trigger and the once-a-day marker are the watcher's, unchanged: idle >= 30min OR
# >= 50 tool-uses since the last REST.
# ---------------------------------------------------------------------------
REST_KEYS="${JICM_REST_KEYS:-w0}"
REST_IDLE_THRESHOLD="${JICM_REST_IDLE_THRESHOLD:-1800}"
REST_TOOL_THRESHOLD="${JICM_REST_TOOL_THRESHOLD:-50}"
REST_ENABLED="${JICM_SUPERVISOR_REST:-1}"

_rest_marker()  { echo "$PROJECT_DIR/.claude/context/.rest-ran-$(date +%Y-%m-%d)"; }
_rest_toolfile(){ echo "$JICM_DIR/rest-tools.$1"; }

# Tool-use count for a key, from its own transcript (the watcher read W0's global
# state file; per-key state makes this lane-correct for free).
_rest_tool_count() {
    local tp; tp="$(jicm_registry_get "$1" '.transcript_path')"
    [[ -n "$tp" && "$tp" != "null" && -f "$tp" ]] || { echo 0; return; }
    jq -s '[.[] | select(.type=="assistant" and .message.stop_reason=="tool_use")] | length' "$tp" 2>/dev/null || echo 0
}

_rest_should_trigger() {
    local key="$1" now last idle count prev
    [[ -f "$(_rest_marker)" ]] && return 1        # once per day, all keys
    jicm_key_paths "$key"
    [[ -f "$JK_STATE" ]] || return 1
    now="$(_now)"
    last="$(jq -r '.ts_epoch // 0' "$JK_STATE" 2>/dev/null)"
    [[ "$last" =~ ^[0-9]+$ ]] || last=0
    # A state file we have never seen updated is not evidence of idleness — treat an
    # unreadable timestamp as "not idle" rather than inventing a 55-year idle window.
    [[ "$last" -gt 0 ]] || return 1
    idle=$(( now - last ))
    [[ "$idle" -ge "$REST_IDLE_THRESHOLD" ]] && return 0
    count="$(_rest_tool_count "$key")"
    prev="$(cat "$(_rest_toolfile "$key")" 2>/dev/null)"
    # NO BASELINE IS NOT A BASELINE OF ZERO. The watcher initialised its counter to 0 in
    # memory, so after any restart the first pass compared a full transcript's tool count
    # against 0 and "crossed" the delta threshold instantly. Verified live before this
    # guard existed: w0 was 3 SECONDS idle, mid-conversation, with 74 tool-uses and no
    # stored baseline — REST would have fired and injected prompts into an active session.
    # Absence of a measurement is not a measurement of zero (same class as the gate's
    # confident-zero fix). Seed it and wait for the NEXT interval to judge a delta.
    if [[ ! "$prev" =~ ^[0-9]+$ ]]; then
        echo "$count" > "$(_rest_toolfile "$key")"
        _log "REST: seeded tool baseline for $key at $count (no trigger — a first observation cannot be a delta)"
        return 1
    fi
    [[ $(( count - prev )) -ge "$REST_TOOL_THRESHOLD" ]]
}

# Fire a nudge through the actuator, which owns pane interaction. Never blocks the
# pass: a busy head returns 3 and we simply move on (see cmd_nudge's policy note).
_rest_nudge() {
    local key="$1" text="$2" rc
    JICM_NUDGE_TEXT="$text" bash "$ACTUATOR" "$key" nudge >> "$SUP_LOG" 2>&1; rc=$?
    [[ "$rc" -eq 0 ]] || _log "REST: nudge for $key returned rc=$rc (3 = head busy, skipped)"
}

_rest_run() {
    local key="$1" py="$PROJECT_DIR/infrastructure/.venv/bin/python" sid n
    jicm_key_paths "$key"
    _log "REST: start key=$key"

    # R1/R2 — this key's checkpoint into L4/L5. Bounded, unlike the watcher's version:
    # an unbounded ingest here is the same defect that wedged a lane on 2026-08-12.
    if [[ -x "$py" && -f "$JK_COMPRESSED" ]]; then
        sid="$(jq -r '.session_id // "unknown"' "$JK_STATE" 2>/dev/null)"
        if [[ "${JICM_RAG_ENABLED:-true}" == "true" && -f "$JICM_AUTO_INGEST_SCRIPT" ]]; then
            ( export PROJECT_DIR JICM_RAG_DEDUP_THRESHOLD JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
              export JICM_RAG_COLLECTION="$JK_RAG_COLLECTION" JICM_COMPRESSED_FILE="$JK_COMPRESSED" JICM_SESSION_ID="$sid"
              ${TIMEOUT_BIN:+"$TIMEOUT_BIN" -s TERM -k 15 600} "$py" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1 ) &
            _log "REST: R1 checkpoint → RAG launched (pid $!, collection=$JK_RAG_COLLECTION)"
        fi
        if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" && -f "$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py" ]]; then
            ( export PROJECT_DIR JICM_COMPRESSED_FILE="$JK_COMPRESSED" GRAPHITI_GROUP_ID="$JK_GRAPHITI_GROUP"
              ${TIMEOUT_BIN:+"$TIMEOUT_BIN" -s TERM -k 15 900} "$py" "$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py" >> "$JICM_LOG_FILE" 2>&1 ) &
            _log "REST: R2 checkpoint → Graphiti launched (pid $!, group=$JK_GRAPHITI_GROUP)"
        fi
    fi

    # R2b — drain the M4 reindex queue (GLOBAL artefact; steward only, or two lanes
    # would race to consume and delete the same file).
    local q="$PROJECT_DIR/.claude/context/.graphiti-reindex-queue"
    local prepop="$PROJECT_DIR/.claude/scripts/graphiti-prepopulate.py"
    if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" && -f "$q" && -x "$py" && -f "$prepop" ]] && _owns_shared "$key"; then
        local cf full
        while read -r cf; do
            for cf in $cf; do
                full="$PROJECT_DIR/.claude/context/psyche/$cf"
                [[ -f "$full" ]] || continue
                ( ${TIMEOUT_BIN:+"$TIMEOUT_BIN" -s TERM -k 15 900} "$py" "$prepop" --file "$full" >> "$JICM_LOG_FILE" 2>&1 ) &
                _log "REST: R2b re-ingesting identity file $cf (pid $!)"
            done
        done < "$q"
        rm -f "$q"
    fi

    # R4 — log rotation (GLOBAL; steward only).
    local rot="$PROJECT_DIR/.claude/scripts/log-rotation.sh" kb=0
    if _owns_shared "$key" && [[ -d "$PROJECT_DIR/.claude/logs" ]]; then
        kb="$(du -sk "$PROJECT_DIR/.claude/logs" 2>/dev/null | awk '{print $1}')"; kb="${kb:-0}"
        if [[ "$kb" -gt 102400 && -x "$rot" ]]; then
            ( CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$rot" >> "$JICM_LOG_FILE" 2>&1 ) &
            _log "REST: R4 log rotation launched (logs=${kb}KB, pid $!)"
        fi
    fi

    # R3 — MEMORY.md micro-audit, only if today actually produced work.
    if _owns_shared "$key"; then
        n="$(git -C "$PROJECT_DIR" log --since=midnight --oneline 2>/dev/null | wc -l | tr -d ' ')"
        if [[ "${n:-0}" -gt 0 ]]; then
            _rest_nudge "$key" "Watcher here. Session has been idle for a while. Please review MEMORY.md for entries that may be stale given today's work, update if needed, then reply Done."
            _log "REST: R3 MEMORY.md micro-audit nudged (${n} commits today)"
        fi
    fi

    # R5 — scratchpad prune. Per-key now that JK_SCRATCHPAD is per-key and correct.
    if [[ -f "$JK_SCRATCHPAD" ]]; then
        n="$(wc -l < "$JK_SCRATCHPAD" | tr -d ' ')"
        if [[ "${n:-0}" -gt 60 ]]; then
            _rest_nudge "$key" "Watcher here. Scratchpad ${JK_SCRATCHPAD#$PROJECT_DIR/} is at ${n} lines (limit 80). Please prune stale entries, then reply Done."
            _log "REST: R5 scratchpad prune nudged (${n} lines)"
        fi
    fi

    _rest_tool_count "$key" > "$(_rest_toolfile "$key")"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$(_rest_marker)"
    _log "REST: complete key=$key (marker written)"
}

# Is this key the shared-memory steward? Mirrors the actuator's _owns_shared_memory.
_owns_shared() { [[ "$(jicm_registry_get "$1" '.steward_shared_memory')" == "true" || "$1" == "w0" ]]; }

_rest_pass() {
    [[ "$REST_ENABLED" == "1" ]] || return 0
    local k
    for k in $REST_KEYS; do
        _managed "$k" || continue
        [[ -f "$JICM_SIGNALS_DIR/actuating.$k" ]] && continue   # never REST mid-cycle
        _rest_should_trigger "$k" && _rest_run "$k"
    done
}

_pass() {
    local key tokens pending hard now ls_epoch age noted ck rc
    now="$(_now)"
    _maintenance_pass
    _rest_pass
    # R2 — reconcile pane-actuated keys to the session ACTUALLY in the pane BEFORE any
    # GC/sense/fire decision reads the registry. Ordering matters: reconciling first
    # promotes a startup-race-demoted occupant back to its canonical key, so GC cannot
    # collect the key out from under a live session and the pass senses the right head.
    # genie added with the Research Archon install: it is pane-actuated (aion:12), so
    # without reconciliation a startup-race demotion to genie-bg-* would never be
    # promoted back and the lane would silently run second-class forever. Any key with
    # a jicm_default_target() pane belongs in this list.
    for ck in w0 dev genie jaques; do
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
    # Report the DAEMON's effective config, not this invocation's env (see _daemon).
    local act="$ACTUATE_ENABLED" iw0="$INCLUDE_W0" poll="$POLL_SEC" src="this shell (no daemon running)"
    local running="stopped" p=""
    if [[ -f "$SUP_PID_FILE" ]]; then
        p="$(cat "$SUP_PID_FILE" 2>/dev/null)"
        kill -0 "$p" 2>/dev/null && running="running (pid $p)" || running="stale pid ($p)"
    fi
    if [[ "$running" == running* && -f "$SUP_PID_FILE.runtime" ]]; then
        IFS='|' read -r act iw0 poll < "$SUP_PID_FILE.runtime"
        src="live daemon"
    elif [[ "$running" == running* ]]; then
        src="UNKNOWN — daemon predates runtime publishing; restart it to get a true reading"
    fi
    local gate; [[ "$act" == "1" ]] && gate="ENABLED (live firing)" || gate="GATED (sense-only)"
    echo "jicm-supervisor · actuate=$gate · include_w0=$iw0 · poll=${poll}s   [config source: $src]"
    # Adopt the daemon's setting for the per-key rows too. Reporting the header from the
    # daemon while computing `managed=` from THIS shell's env is the same misreport in a
    # subtler place: it showed "include_w0=1" and "w0 managed=no" in one breath.
    INCLUDE_W0="$iw0"
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
    # Publish the EFFECTIVE config so `--status` can report the daemon instead of itself.
    # These come from the launchd plist, so a hand-run `--status` inherits none of them and
    # used to print its own defaults over the daemon's — announcing "GATED (sense-only)"
    # one line above "daemon: running" while that daemon was firing live. A safety gate
    # that misreports as OFF while it is ON is worse than no status command at all.
    printf '%s|%s|%s\n' "$ACTUATE_ENABLED" "$INCLUDE_W0" "$POLL_SEC" > "$SUP_PID_FILE.runtime"
    trap 'rm -f "$SUP_PID_FILE" "$SUP_PID_FILE.runtime"; rmdir "$SUP_PID_FILE.lock" 2>/dev/null; _log "==== supervisor stopped (pid $$) ===="' EXIT
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
