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

DRY_RUN=0; FORCE=0; ASSUME_YES=0; IDLE_SEC=20; ALLOW_BG_KILL=0
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
        # Scoped override for the background-work refusal ONLY. Deliberately NOT folded into
        # --force: --force also disables the idle check, so requiring it here would make every
        # restart of a lane running a trivial poller silently drop an unrelated guard. A guard
        # that can only be bypassed by disabling a second guard is a guard that will collapse.
        --allow-bg-kill) ALLOW_BG_KILL=1; shift ;;
        -h|--help)  echo "usage: aion-lane-restart.sh <jaques|genie|dev|w0> [--dry-run] [--force] [--allow-bg-kill] [--idle-sec N] [--yes]"; exit 0 ;;
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

# --- 0. Guard: a lane may never restart ITSELF. This is protocol, enforced in code.
#
# It is not etiquette — self-restart cannot be done safely, for two independent reasons:
#   1. `respawn-window -k` (step 9) kills the process running THIS script, so steps 9-10 never
#      execute. The verification — did the pane pid change, is a process actually alive — is
#      exactly what distinguishes a restart from a silently dead window, and a dead window still
#      appears in `list-windows`. You would be trading a verified operation for an unverified one.
#   2. Nothing survives to report the outcome. A restart that half-failed would go unnoticed by
#      the only party who wanted it.
#
# Protocol: REQUEST -> EXTERNAL EXECUTOR -> VERIFY -> REPORT. A lane asks another lane (or the
# User) to restart it. The invariant is only "restarter != restartee" — no lane is privileged;
# W5:Jarvis-dev is merely the usual executor because it owns this tooling. If W5 needs restarting,
# another lane or the User runs it.
if [[ -n "$TMUX_PANE" ]]; then
    self_win="$("$TMUX_BIN" display -p -t "$TMUX_PANE" '#{window_name}' 2>/dev/null)"
    [[ "$self_win" == "$WIN" ]] && _die "a lane cannot restart itself ($WIN): the respawn would kill this very process before it could verify or report the result. Ask another lane (e.g. W5:Jarvis-dev) or the User to run: aion-lane-restart.sh $LANE"
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

# --- 6.5 Background-work check. AN IDLE HEAD IS NOT AN IDLE LANE.
#
# The idle check above reads the TRANSCRIPT, so it only sees the conversation. A lane that
# launched work in the background is idle by that measure while the work runs — and a respawn
# kills the whole pane process tree, taking it with it. Observed 2026-08-14: the 15:27 genie
# restart passed both the idle check and the scratchpad gate, and killed a 55-paper extraction
# at 17 papers. Nothing warned, and the loss surfaced only because Genie mentioned it later.
#
# Losing unfinished work to a convenience restart is not an acceptable degradation, so this
# REFUSES and names the processes rather than reporting success over a silent loss. --force
# still overrides, but now it means "I accept killing these named jobs", not "I didn't know".
_background_work() {   # echo one "pid etime command" line per agent-launched job
    local pane="$1" head
    [[ -n "$pane" ]] || return 0
    # THE WORK IS A GRANDCHILD, NOT A CHILD. The pane's only direct child is the claude head;
    # everything an agent starts hangs off the HEAD. A first version of this checked the pane's
    # direct children, found only claude, filtered it, and reported a confident "nothing to
    # lose" — the same false all-clear it was written to prevent.
    head="$(ps -eo pid,ppid,comm 2>/dev/null | awk -v p="$pane" '$2==p && $3 ~ /claude/ {print $1; exit}')"
    [[ -n "$head" ]] || return 0
    # Claude Code routes EVERY Bash tool call through a shell-snapshot wrapper, so that path is
    # an exact signature for agent-launched work. It is what separates a background job from the
    # MCP servers and language server that are also children of the head — those are started BY
    # the head and are meant to die with it (identical etime), whereas a job is not.
    ps -eo pid,ppid,etime,command 2>/dev/null \
        | awk -v h="$head" '$2==h && /shell-snapshots/ {print}' \
        | cut -c1-160
}
BG_WORK="$(_background_work "$("$TMUX_BIN" display -p -t "$SESSION_NAME:$WIN" '#{pane_pid}' 2>/dev/null)")"
if [[ -n "${BG_WORK//[[:space:]]/}" ]]; then
    _log "background work detected under the pane — a respawn would kill it:"
    printf '%s\n' "$BG_WORK" | while IFS= read -r l; do [[ -n "$l" ]] && _log "    $l"; done
    if [[ "$FORCE" -eq 1 || "$ALLOW_BG_KILL" -eq 1 ]]; then
        _log "WARNING: proceeding and killing the jobs listed above (override: $( [[ "$ALLOW_BG_KILL" -eq 1 ]] && echo --allow-bg-kill || echo --force ))"
    elif [[ "$DRY_RUN" -eq 1 ]]; then
        _log "WOULD REFUSE: background work is running; a live run would stop here"
    else
        _die "refusing: background work is running under this pane (listed above). Let it finish, stop it deliberately, or re-run with --allow-bg-kill to accept killing exactly those jobs (--force also works but additionally disables the idle check)"
    fi
else
    _log "no background work under the pane — nothing to lose beyond the head"
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
GATE_FAILED=0; GATE_REQUEST=0
_gate_fail() { [[ "$DRY_RUN" -eq 1 ]] && { GATE_FAILED=1; _log "WOULD REFUSE: $*"; return 0; }; _die "$*"; }

# Resolve the lane's canonical scratchpad from jicm-config (the single source of truth for that
# path — it moved once already). Subshell so its JICM_*/JK_* exports cannot clobber ours.
SCRATCHPAD="$(source "$PROJECT_DIR/.claude/scripts/jicm-config.sh" >/dev/null 2>&1; jicm_key_paths "$KEY" >/dev/null 2>&1; printf '%s' "$JK_SCRATCHPAD")"
[[ -n "$SCRATCHPAD" ]] || SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.$KEY.md"

_prep_verdict() {   # echo READY / NOT READY / (empty if unparseable)
    local out; out="$("$ACTUATE" "$KEY" prepare 2>&1)"
    printf '%s\n' "$out" >> "$LOG"
    printf '%s' "$out" | grep -E '^[[:space:]]*verdict' | head -1 | sed 's/.*: *//'
}

# Ask the lane to save its own working state, then WAIT for it to actually do so.
# Rationale: a stale scratchpad is not a reason to refuse a restart the lane itself requested —
# it is a reason to ask for a fresh one. The lane is running and can comply; refusing just makes
# a human relay the request. We still never proceed on stale state, so nothing is degraded: the
# wait either ends in a genuinely fresh save or in a refusal.
_request_and_wait_for_save() {
    local before after waited=0 nudged=0 rc
    local poll="${AION_RESTART_SAVE_POLL:-5}" max="${AION_RESTART_SAVE_WAIT:-300}"
    # ABSENT IS NOT ZERO: a missing scratchpad must not read as "mtime 0, therefore any file is
    # newer". Track existence separately so we require a real write either way.
    if [[ -f "$SCRATCHPAD" ]]; then before="$(stat -f %m "$SCRATCHPAD" 2>/dev/null || echo 0)"
    else before=""; _log "save-request: scratchpad does not exist yet ($SCRATCHPAD)"; fi

    while :; do
        # (Re)send the request. nudge rc=3 means the head was busy — that is fine and expected
        # while it works; retry on the next tick rather than giving up.
        if [[ "$nudged" -eq 0 ]]; then
            JICM_NUDGE_TEXT="${AION_RESTART_SAVE_MSG:+$AION_RESTART_SAVE_MSG

}Restart requested for your lane ($KEY). Before it runs, SAVE YOUR WORKING STATE to $SCRATCHPAD now (what you are mid-way through, next step, anything not yet committed). The restart resumes this same session, so the conversation survives — this is the fallback if the resume misbehaves. Reply briefly once saved; the restart fires automatically when the file updates." \
                "$ACTUATE" "$KEY" nudge >>"$LOG" 2>&1; rc=$?
            case "$rc" in
                0) nudged=1; _log "save-request: asked $KEY to update $(basename "$SCRATCHPAD")" ;;
                3) _log "save-request: lane busy, will retry the ask (rc=3)" ;;
                *) _log "save-request: nudge failed rc=$rc — will retry" ;;
            esac
        fi
        if [[ -f "$SCRATCHPAD" ]]; then
            after="$(stat -f %m "$SCRATCHPAD" 2>/dev/null || echo 0)"
            if [[ -z "$before" || "$after" -gt "$before" ]]; then
                _log "save-request: scratchpad updated ($(( $(date +%s) - after ))s ago) — re-checking verdict"
                return 0
            fi
        fi
        [[ "$waited" -ge "$max" ]] && return 1
        sleep "$poll"; waited=$(( waited + poll ))
        # Re-ask once at the halfway mark in case the first injection landed while it was mid-turn.
        [[ "$waited" -ge $(( max / 2 )) ]] && nudged=0
    done
}

if true; then
    [[ -x "$ACTUATE" ]] || _gate_fail "jicm-actuate.sh not executable at $ACTUATE — cannot check working state"
    _log "working-state gate: jicm-actuate.sh $KEY prepare (advisory; verdict parsed from stdout)"
    PREP_VERDICT="$(_prep_verdict)"
    case "$PREP_VERDICT" in
        READY*) _log "working-state gate: READY" ;;
        *)
            if [[ "$FORCE" -eq 1 ]]; then
                _log "WARNING: working state not READY (${PREP_VERDICT:-unparseable}) — proceeding under --force"
            elif [[ "$DRY_RUN" -eq 1 ]]; then
                GATE_REQUEST=1
                _log "WOULD REQUEST: working state not READY (${PREP_VERDICT:-unparseable}) — a live run would ask $KEY to save its scratchpad and wait up to ${AION_RESTART_SAVE_WAIT:-300}s"
            else
                _log "working state not READY (${PREP_VERDICT:-unparseable}) — asking the lane to save rather than refusing"
                if _request_and_wait_for_save; then
                    PREP_VERDICT="$(_prep_verdict)"
                    case "$PREP_VERDICT" in
                        READY*) _log "working-state gate: READY after save" ;;
                        *) _die "scratchpad was updated but the verdict is still '${PREP_VERDICT:-unparseable}' — not restarting on state the gate still rejects" ;;
                    esac
                    # The nudge made the lane busy. Re-wait for idle or we would kill it mid-write.
                    if [[ "$FORCE" -eq 0 ]]; then
                        rewait=0
                        while [[ "$(_idle_for)" -lt "$IDLE_SEC" ]]; do
                            [[ "$rewait" -ge "$IDLE_WAIT_MAX" ]] && _die "lane busy again after saving and did not settle in ${IDLE_WAIT_MAX}s"
                            sleep 5; rewait=$(( rewait + 5 ))
                        done
                        _log "lane idle again after save — proceeding"
                    fi
                else
                    _die "asked $KEY to save its working state but $(basename "$SCRATCHPAD") did not change within ${AION_RESTART_SAVE_WAIT:-300}s — not restarting on stale state (retry, or --force to accept it)"
                fi
            fi ;;
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
    elif [[ "$GATE_REQUEST" -eq 1 ]]; then
        _log "DRY RUN VERDICT: would ASK the lane to save, wait for a fresh scratchpad, then proceed (refusing only if it never saves). Command it would use:"
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
