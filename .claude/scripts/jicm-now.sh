#!/bin/bash
# jicm-now.sh — operator-triggered JICM cycle, fired NOW instead of signalled and waited on.
#
# WHY THIS EXISTS
#   /jicm and /intelligent-compress write a signal and wait for the watcher daemon to notice
#   it (10s poll), then wait through prepare -> clear -> resume, each with unpredictable
#   latency. The 2026-09-03 incident measured ~22 minutes end to end. At the keyboard that is
#   unusable.
#
# WHAT THIS IS *NOT*
#   It is NOT a second implementation of the cycle. jicm-actuate.sh --fire already drives the
#   whole thing (prep -> clear -> resume) in a detached worker, already takes the
#   actuating.<key> lock with a PID owner token, and already carries the M2 identity pinning,
#   transcript verification and self-decapitation guards. Reimplementing any of that here
#   would make TWO writers of one cycle -- exactly the class of bug the action/pending_action
#   split came from. This script is a GUARDED OPERATOR FRONT-END over --fire:
#       * derive the caller's own key (never assume w0)
#       * refuse -- loudly, without racing -- if a cycle is already in flight
#       * run the save-gate first and abort if it says NOT READY
#       * clear the stale watcher-visible signals that would otherwise cause a DOUBLE FIRE
#       * print progress with elapsed seconds so the operator sees motion, not a hang
#
# TRAP (recorded: reference_trap_term_unkillable)
#   Every trap here ends in an explicit `exit`. A bare `trap ... TERM` without one survives
#   SIGTERM and then strips its own lock on the way out, leaving the key unlocked while the
#   worker is still running.

set -o pipefail   # NB: NOT -euo (grep exit 1 kills the script -- MEMORY.md)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
ACTUATE="$SCRIPT_DIR/jicm-actuate.sh"
CONFIG="$SCRIPT_DIR/jicm-config.sh"

DRY_RUN=0; FORCE=0; KEY=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --key)     KEY="${2:-}"; shift 2 ;;
        --key=*)   KEY="${1#*=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --force)   FORCE=1; shift ;;
        -h|--help)
            echo "usage: jicm-now.sh [--key <k>] [--dry-run] [--force]"
            echo "  --dry-run  print the plan and touch nothing"
            echo "  --force    skip only the IDLE wait. NEVER skips the save-gate."
            exit 0 ;;
        *) echo "jicm-now: unknown arg '$1'" >&2; exit 64 ;;
    esac
done

_t0=$(date +%s)
_say() { printf '[jicm-now %3ss] %s\n' "$(( $(date +%s) - _t0 ))" "$*"; }
_die() { printf '[jicm-now] ABORT: %s\n' "$*" >&2; exit 1; }

[[ -x "$ACTUATE" || -f "$ACTUATE" ]] || _die "jicm-actuate.sh not found at $ACTUATE"
# shellcheck source=/dev/null
source "$CONFIG" 2>/dev/null || _die "cannot source jicm-config.sh"

# --- 1. Resolve the caller's OWN key. Never assume w0. -----------------------
if [[ -z "$KEY" ]]; then
    _sid="${CLAUDE_SESSION_ID:-}"
    if [[ -n "$_sid" ]] && declare -F jicm_derive_key >/dev/null 2>&1; then
        KEY="$(jicm_derive_key "$_sid" 2>/dev/null)"
    fi
    [[ -z "$KEY" ]] && KEY="$(jicm_derive_key "" 2>/dev/null)"
fi
[[ -n "$KEY" ]] || _die "could not derive a JICM key; pass --key explicitly"
_say "key = $KEY"

jicm_key_paths "$KEY" 2>/dev/null

# --- 2. Refuse if a cycle is already in flight. Do not race the daemon. ------
# The lock is "epoch|pid": the pid is an OWNER TOKEN, so liveness is a real check and not
# an argv guess (recorded: reference_argv_is_not_process_identity -- every `( ... ) &`
# ingest the worker detaches inherits the worker's argv).
LOCK="$JICM_SIGNALS_DIR/actuating.$KEY"
if [[ -f "$LOCK" ]]; then
    _lpid="$(cut -d'|' -f2 "$LOCK" 2>/dev/null)"
    _lepoch="$(cut -d'|' -f1 "$LOCK" 2>/dev/null)"
    if [[ "$_lpid" =~ ^[0-9]+$ ]] && kill -0 "$_lpid" 2>/dev/null; then
        _die "a JICM cycle is ALREADY actuating key=$KEY (pid $_lpid, started $(( $(date +%s) - ${_lepoch:-0} ))s ago).
    Refusing rather than racing it. Watch it with: tail -f $PROJECT_DIR/.claude/logs/jicm-actuate.log"
    fi
    _say "stale lock for $KEY (pid ${_lpid:-?} not alive) — the actuator will reclaim it"
fi

# --- 3. Save-gate. NEVER overridden, not even by --force. --------------------
# This is the gate that protected Jacques on 2026-09-04. --force skips the IDLE wait only.
_say "running save-gate (jicm-actuate.sh $KEY prepare)…"
PREP_OUT="$("$ACTUATE" "$KEY" prepare 2>&1)"
PREP_RC=$?
printf '%s\n' "$PREP_OUT" | sed 's/^/    | /'
if [[ $PREP_RC -ne 0 ]] || printf '%s' "$PREP_OUT" | /usr/bin/grep -q 'NOT READY'; then
    _die "save-gate says NOT READY (rc=$PREP_RC). NOT firing. This gate is never overridden --
    fix what it is complaining about, then re-run. --force does not bypass it."
fi
_say "save-gate PASSED"

if [[ "$DRY_RUN" -eq 1 ]]; then
    _say "DRY-RUN — the plan below is what would run. Nothing was touched."
    "$ACTUATE" "$KEY" 2>&1 | sed 's/^/    | /'
    _say "DRY-RUN complete. To actuate for real: jicm-now.sh --key $KEY"
    exit 0
fi

# --- 4. Clear the watcher-visible signals that would cause a DOUBLE FIRE. ----
# Without this the daemon sees a still-raised clear-now on its next poll and arms a SECOND
# actuator into a lane that was just cleared. The over-threshold marker must go too, or the
# lane logs a spurious OVER-THRESHOLD-CLEARED with a nonsense duration.
for _stale in "$JK_CLEAR_SIGNAL" \
              "$JICM_SIGNALS_DIR/clear-now.$KEY.signal" \
              "$JICM_SIGNALS_DIR/over-threshold.$KEY"; do
    [[ -n "$_stale" && -f "$_stale" ]] && rm -f "$_stale" && _say "cleared stale signal: $(basename "$_stale")"
done

# --- 5. Hand off to the ONE implementation of the cycle. ---------------------
_say "arming the actuator (jicm-actuate.sh $KEY --fire)…"
"$ACTUATE" "$KEY" --fire 2>&1 | sed 's/^/    | /'
FIRE_RC=${PIPESTATUS[0]}
[[ $FIRE_RC -eq 0 ]] || _die "--fire refused (rc=$FIRE_RC). Nothing is in flight; see the output above."

_say "actuator armed. It drives prep -> /clear -> resume from here."
_say "REPLY ONCE AND STOP so the actuator observes idle and can clear this session."
exit 0
