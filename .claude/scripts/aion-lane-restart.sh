#!/bin/bash
# aion-lane-restart.sh — restart ONE Archon lane's Claude window in place.
#
# WHY THIS EXISTS
# ---------------
# Some Claude Code config is resolved once, at process launch, and cannot be picked up by a
# running session: workspace trust (~/.claude.json hasTrustDialogAccepted), project
# permissions.allow, hooks, MCP config, --permission-mode. A /clear does NOT reload any of it —
# /clear mints a new session inside the SAME process. So "edit settings.json, then /clear"
# silently changes nothing, which is exactly how W13 stayed stuck in auto mode on 2026-08-14.
# The only fix is a real process restart of that one lane.
#
# Before this script the only path was re-running launch-aion.sh, which is a whole-session
# operation — that is why lane restarts were framed as "it'll bounce the other windows".
# launch-aion.sh --restart covers ONLY docker/service windows (infra, pulse, proxy, dashboard,
# pipeline, styx, watcher, hud, ollama, mlx, litellm) and explicitly leaves Claude windows alone.
#
# THE LANDMINE THIS EXISTS TO AVOID
# ---------------------------------
# Every lane window wraps Claude in a loop that prints "Press Enter to --resume". That looks
# like the restart mechanism, and it is a TRAP: the uuid baked into that loop is the lane's
# SEED uuid, fixed at launch. But /clear MINTS A NEW SESSION, so after any clear the live
# session id has moved on while the loop still names the seed. Pressing Enter therefore resumes
# a stale session — and because the seed transcript still exists on disk, it SUCCEEDS silently
# and restores days-old context instead of erroring. Observed on jaques 2026-08-14: loop said
# 79e6488b (seed, transcript 2 days old), live session was f7389f86.
# So: we always resume the CURRENT session id, resolved from the registry, never the baked one.
#
# HOW IT RESTARTS
# ---------------
# We do NOT rebuild the launch command — duplicating it would drift from launch-aion.sh the
# moment Sir edits either copy (the same duplicated-derivation failure that let the [1m] token
# bug survive for weeks). Instead we read tmux's own `pane_start_command`, which retains the
# window's full original command including every env export and flag, rewrite ONLY the session
# uuid inside it, and respawn the window with that. The launcher stays the single source of
# truth and this script never has to know what flags a lane uses.
#
# Usage:
#   aion-lane-restart.sh <lane> [--dry-run] [--force] [--idle-sec N] [--yes]
#   lane: jaques|jacques|genie|dev|w0   (or the tmux window name)
#
# Exit: 0 restarted (or dry-run OK) · 1 refused/failed · 64 usage
# NOTE: bash 3.2 on macOS — no assoc arrays, no readarray. Never `set -euo pipefail` here.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/Users/nathanielcannon/Claude/Project_Aion}"
TMUX_BIN="${TMUX_BIN:-/Users/nathanielcannon/bin/tmux}"   # full path: $HOME/bin/tmux breaks under zsh
SESSION_NAME="${TMUX_SESSION:-aion}"
ACTUATE="$PROJECT_DIR/.claude/scripts/jicm-actuate.sh"
LOG="$PROJECT_DIR/.claude/logs/aion-lane-restart.log"

DRY_RUN=0; FORCE=0; ASSUME_YES=0; IDLE_SEC=20
# Overridable so the give-up branch is testable without sitting through the full wait — a guard
# that takes 3 minutes to exercise is a guard that never gets exercised.
IDLE_WAIT_MAX="${AION_RESTART_IDLE_WAIT_MAX:-180}"
LANE=""

_log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" | tee -a "$LOG"; }
_die() { _log "REFUSED: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)  DRY_RUN=1; shift ;;
        --force)    FORCE=1; shift ;;
        --yes|-y)   ASSUME_YES=1; shift ;;
        --idle-sec) IDLE_SEC="${2:-20}"; shift 2 ;;
        -h|--help)  echo "usage: aion-lane-restart.sh <jaques|genie|dev|w0> [--dry-run] [--force] [--idle-sec N] [--yes]"; exit 0 ;;
        -*)         echo "unknown flag: $1" >&2; exit 64 ;;
        *)          LANE="$1"; shift ;;
    esac
done
[[ -n "$LANE" ]] || { echo "usage: aion-lane-restart.sh <jaques|genie|dev|w0> [--dry-run] [--force]" >&2; exit 64; }

# --- lane -> (registry key, tmux window). Jacques is spelled `jaques` everywhere in the
# --- codebase (registry key, uuid file, graph namespace); accept both spellings as input.
case "$LANE" in
    jaques|jacques|Jacques|13) KEY="jaques"; WIN="Jacques" ;;
    genie|Genie|12)            KEY="genie";  WIN="Genie" ;;
    dev|Jarvis-dev|11)         KEY="dev";    WIN="Jarvis-dev" ;;
    w0|jarvis|Jarvis|0)        KEY="w0";     WIN="Jarvis" ;;
    *) _die "unknown lane '$LANE' (expected jaques|genie|dev|w0)" ;;
esac

_log "==== lane-restart requested: lane=$KEY window=$WIN dry_run=$DRY_RUN force=$FORCE ===="

# --- 0. Guard: never restart the window we are running inside. Killing your own pane mid-script
# --- leaves the restart half-done with no one to finish it or report what happened.
if [[ -n "$TMUX_PANE" ]]; then
    self_win="$("$TMUX_BIN" display -p -t "$TMUX_PANE" '#{window_name}' 2>/dev/null)"
    [[ "$self_win" == "$WIN" ]] && _die "refusing to restart the window this script is running in ($WIN)"
fi

# --- 1. Window must exist.
"$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null | grep -qx "$WIN" \
    || _die "tmux window '$SESSION_NAME:$WIN' not found"

# --- 2. Refuse while a JICM actuation holds the lane. Both would drive the same pane, and a
# --- respawn mid-cycle would kill Claude between the /clear and the resume nudge — the exact
# --- state that strands a session with no context and no one restoring it.
LOCK="$PROJECT_DIR/.claude/context/jicm/signals/actuating.$KEY"
[[ -f "$LOCK" ]] && _die "JICM actuation in flight for $KEY (lock: $LOCK) — retry after it reaps"

# --- 3. Resolve the CURRENT session id. Registry first (the gate keeps it fresh), then the
# --- uuid file. We deliberately do NOT trust the uuid inside pane_start_command (see header).
REG="$PROJECT_DIR/.claude/context/jicm/registry/$KEY.json"
SID=""
[[ -f "$REG" ]] && SID="$(jq -r '.session_id // empty' "$REG" 2>/dev/null)"
if [[ -z "$SID" ]]; then
    UUID_FILE="$PROJECT_DIR/.claude/context/.current-$KEY-uuid"
    [[ -s "$UUID_FILE" ]] && SID="$(tr -d '[:space:]' < "$UUID_FILE")"
    [[ -n "$SID" ]] && _log "session id from uuid-file fallback (registry had none): $SID"
fi
[[ -n "$SID" ]] || _die "cannot resolve current session id for $KEY — refusing to guess (a wrong resume silently restores stale context)"

# Transcript must exist, or --resume starts an empty session while claiming to resume one.
TDIR="$(jq -r '.transcript_path // empty' "$REG" 2>/dev/null | sed 's|/[^/]*$||')"
[[ -n "$TDIR" && -d "$TDIR" ]] || TDIR="$HOME/.claude/projects"
TRANSCRIPT="$(find "$TDIR" -maxdepth 1 -name "$SID.jsonl" 2>/dev/null | head -1)"
[[ -n "$TRANSCRIPT" ]] || _die "no transcript found for session $SID — resuming it would start an empty session"
_log "resolved live session: $SID ($(wc -c <"$TRANSCRIPT" | tr -d ' ') bytes)"

# --- 4. Capture the window's real launch command (single source of truth: the launcher wrote it).
START_CMD="$("$TMUX_BIN" display -p -t "$SESSION_NAME:$WIN" '#{pane_start_command}' 2>/dev/null)"
[[ -n "$START_CMD" ]] || _die "tmux retained no pane_start_command for $WIN — cannot reconstruct the launch without duplicating launch-aion.sh"
# tmux wraps the whole thing in literal double quotes; strip the outer pair only.
START_CMD="${START_CMD#\"}"; START_CMD="${START_CMD%\"}"
case "$START_CMD" in *claude*) : ;; *) _die "pane_start_command does not launch claude — wrong window?" ;; esac

# --- 5. Rewrite the session id, and normalise --session-id to --resume. A first-ever launch
# --- uses `--session-id <uuid>` (create); replaying that verbatim against an id that now exists
# --- is a different operation than resuming it.
NEW_CMD="$(printf '%s' "$START_CMD" \
    | sed -E "s/--session-id[[:space:]]+[0-9a-fA-F-]{36}/--resume $SID/g; s/--resume[[:space:]]+[0-9a-fA-F-]{36}/--resume $SID/g")"
OLD_IDS="$(printf '%s' "$START_CMD" | grep -oE '(--resume|--session-id)[[:space:]]+[0-9a-fA-F-]{36}' | awk '{print $2}' | sort -u | tr '\n' ' ')"
printf '%s' "$NEW_CMD" | grep -q -- "--resume $SID" || _die "uuid rewrite failed — refusing to respawn with an unverified command"
_log "uuid rewrite: [$OLD_IDS] -> $SID"
if [[ "$OLD_IDS" != *"$SID"* ]]; then
    _log "NOTE: the window's baked uuid was STALE (the 'Press Enter to --resume' path would have resumed the wrong session)"
fi

# --- 6. Idle check. A respawn is a kill: whatever the lane is mid-turn is lost, and unlike a
# --- threshold clear there is no urgency forcing our hand, so we wait rather than interrupt.
_idle_for() {   # echo seconds since the transcript last grew
    local m now; m="$(stat -f %m "$TRANSCRIPT" 2>/dev/null)" || { echo 0; return; }
    now="$(date +%s)"; echo $(( now - m ))
}
if [[ "$FORCE" -eq 0 ]]; then
    waited=0
    while :; do
        idle="$(_idle_for)"
        [[ "$idle" -ge "$IDLE_SEC" ]] && { _log "lane idle ${idle}s (>= ${IDLE_SEC}s) — proceeding"; break; }
        [[ "$waited" -ge "$IDLE_WAIT_MAX" ]] && _die "lane still busy after ${IDLE_WAIT_MAX}s (idle ${idle}s) — use --force only if you accept losing the in-flight turn"
        sleep 5; waited=$(( waited + 5 ))
    done
else
    _log "WARNING: --force — skipping the idle check; an in-flight turn will be lost"
fi

# --- 7. Working-state gate BEFORE the kill.
#
# What actually preserves continuity here is `--resume`: the restarted process re-attaches to the
# same transcript, so the conversation survives in full. That is NOT true of a JICM clear, and the
# distinction matters — do not "improve" this by adding a compression cycle. The checkpoint and
# scratchpad are the FALLBACK, for when the resume itself misbehaves.
#
# `jicm-actuate.sh <key> prepare` is a READ-ONLY ADVISORY gate: it inspects the scratchpad and
# checkpoint and prints "verdict : READY|NOT READY". It writes no checkpoint, and it ALWAYS
# EXITS 0 — the verdict exists only in stdout. An earlier version of this script tested its exit
# status, which meant the guard could never fire for any lane under any condition: it reported
# "preserve" in the log while verifying nothing. Parse the verdict, never the exit code.
# The gate runs in DRY-RUN too. A preview that skips the checks cannot tell you the run would be
# refused — which is the single most useful thing a preview can say.
GATE_FAILED=0
_gate_fail() { [[ "$DRY_RUN" -eq 1 ]] && { GATE_FAILED=1; _log "WOULD REFUSE: $*"; return 0; }; _die "$*"; }
if true; then
    [[ -x "$ACTUATE" ]] || _gate_fail "jicm-actuate.sh not executable at $ACTUATE — cannot check working state"
    _log "working-state gate: jicm-actuate.sh $KEY prepare (advisory; verdict parsed from stdout)"
    PREP_OUT="$("$ACTUATE" "$KEY" prepare 2>&1)"
    printf '%s\n' "$PREP_OUT" >> "$LOG"
    PREP_VERDICT="$(printf '%s' "$PREP_OUT" | grep -E '^\s*verdict' | head -1 | sed 's/.*: *//')"
    case "$PREP_VERDICT" in
        READY*)
            _log "working-state gate: READY" ;;
        NOT\ READY*)
            # Diverges from jicm-actuate.sh, which ALERTs and PROCEEDS: there, refusing to clear a
            # session already at its token threshold is the worse failure. Here nothing forces the
            # restart, so stale working state is a pure avoidable risk. Same reasoning, opposite
            # answer, because the urgency is absent.
            [[ "$FORCE" -eq 1 ]] && _log "WARNING: working state NOT READY ($PREP_VERDICT) — proceeding under --force" \
                || _gate_fail "working state NOT READY for $KEY ($PREP_VERDICT). Have the lane save its scratchpad (<=30m old), then retry — or --force if you accept the risk." ;;
        *)
            # An unparseable verdict means prepare changed shape; treat as unknown, not as pass.
            [[ "$FORCE" -eq 1 ]] && _log "WARNING: could not parse prepare verdict — proceeding under --force" \
                || _gate_fail "could not parse a verdict from 'jicm-actuate.sh $KEY prepare' — refusing to assume it passed (see $LOG)" ;;
    esac
fi

# --- 8. Confirm (a restart is destructive to the live process).
if [[ "$DRY_RUN" -eq 0 && "$ASSUME_YES" -eq 0 && -t 0 ]]; then
    echo
    echo "About to restart $SESSION_NAME:$WIN  (lane=$KEY)"
    echo "  resume session : $SID"
    echo "  other windows  : UNTOUCHED"
    printf 'Proceed? [y/N] '
    read -r ans
    case "$ans" in y|Y|yes) : ;; *) _log "aborted by user"; exit 1 ;; esac
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$GATE_FAILED" -eq 1 ]]; then
        _log "DRY RUN VERDICT: would REFUSE (see WOULD REFUSE above) — no respawn. Command it would otherwise use:"
    else
        _log "DRY RUN VERDICT: would proceed."
    fi
    _log "DRY RUN — would respawn $SESSION_NAME:$WIN with:"
    printf '%s\n' "$NEW_CMD" | fold -w 160 | sed 's/^/    /'
    exit 0
fi

# --- 9. Respawn just this window. -k kills the existing process; scoped to one window, so no
# --- other lane is affected (that is the entire point of this script).
OLD_PID="$("$TMUX_BIN" display -p -t "$SESSION_NAME:$WIN" '#{pane_pid}' 2>/dev/null)"
_log "respawning $SESSION_NAME:$WIN (old pane pid $OLD_PID)"
if ! "$TMUX_BIN" respawn-window -k -t "$SESSION_NAME:$WIN" "$NEW_CMD" 2>>"$LOG"; then
    _die "tmux respawn-window FAILED — window may be dead; inspect '$SESSION_NAME:$WIN' by hand"
fi

# --- 10. Verify. A restart that silently produced a dead pane is worse than no restart, because
# --- the lane looks present in the window list while running nothing.
sleep 6
NEW_PID="$("$TMUX_BIN" display -p -t "$SESSION_NAME:$WIN" '#{pane_pid}' 2>/dev/null)"
[[ -n "$NEW_PID" && "$NEW_PID" != "$OLD_PID" ]] || _die "pane pid did not change ($OLD_PID -> $NEW_PID) — respawn did not take"
if pgrep -P "$NEW_PID" >/dev/null 2>&1 || ps -p "$NEW_PID" >/dev/null 2>&1; then
    _log "OK: $WIN respawned (pane pid $OLD_PID -> $NEW_PID), resuming $SID"
else
    _die "no live process under the new pane pid $NEW_PID"
fi

cat <<EOF

✅ Restarted $SESSION_NAME:$WIN
   lane           : $KEY
   resumed session: $SID
   pane pid       : $OLD_PID -> $NEW_PID
   other windows  : untouched

   Launch-time config (workspace trust, permissions.allow, hooks, MCP) is now reloaded.
   Give it ~10s to finish loading, then verify in that lane.
   Log: $LOG
EOF
