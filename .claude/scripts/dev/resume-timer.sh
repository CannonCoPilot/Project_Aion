#!/bin/bash
# resume-timer.sh — Redundant bash-based timed resume trigger (JICM-Watcher-style).
#
# Sleeps until TARGET_EPOCH, then (1) writes an on-disk signal file and (2) injects a
# resume prompt into the Jarvis tmux window using the established send-keys idiom.
# Companion / redundant partner to a durable CronCreate one-shot scheduled for the same
# time, so a resume is triggered even if one mechanism fails.
#
# Usage: resume-timer.sh <target_epoch> [target_window]
#
# NOTE: deliberately does NOT use `set -e` — a single failed probe must not abort the
# timer (macOS bash 3.2; grep/test non-zero exits are normal).

TMUX_BIN="/Users/nathanielcannon/bin/tmux"
TARGET_WINDOW="${2:-aion:0.0}"
PROJECT_DIR="/Users/nathanielcannon/Claude/Project_Aion"
SIGNAL_FILE="$PROJECT_DIR/.claude/context/.resume-work.signal"
LOG_FILE="$PROJECT_DIR/.claude/context/.resume-timer.log"
TARGET_EPOCH="${1:?usage: resume-timer.sh <target_epoch> [target_window]}"

PROMPT='Resume timer fired (4-hour mark). No greeting, no questions. Resume the autonomous Palimpsest mask-detection protocol immediately: read .claude/context/.scratchpad.md (top block) and /Users/nathanielcannon/Claude/Projects/palimpsest/.scratch/mask-eval/PROGRESS.md for current state, then continue under the full-autonomy mandate — next target is idx 42 scholarly-anthology under-segmentation, then idx 34, idx 38, the flagged sparse-track epubs, then PDF imports, then the UI import pipeline.'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*" >> "$LOG_FILE"; }

log "START pid=$$ target_epoch=$TARGET_EPOCH ($(date -r "$TARGET_EPOCH" '+%F %T %Z')) window=$TARGET_WINDOW"

# Sleep until target, recomputing each pass so a laptop-sleep gap can't overshoot badly.
while :; do
    now=$(date +%s)
    remain=$(( TARGET_EPOCH - now ))
    [ "$remain" -le 0 ] && break
    [ "$remain" -gt 300 ] && remain=300
    sleep "$remain"
done

log "TARGET REACHED — writing signal + injecting resume prompt"

# (1) On-disk signal (JICM-Watcher principle: durable marker a watcher/hook can also read).
{
    echo "resume_requested_at=$(date '+%FT%T%z')"
    echo "trigger=bash-resume-timer"
    echo "target_window=$TARGET_WINDOW"
    echo "reason=4-hour resume timer"
} > "$SIGNAL_FILE"

# (2) tmux injection — established idiom: Escape, C-u, literal text, C-m as SEPARATE calls.
session="${TARGET_WINDOW%%:*}"
if "$TMUX_BIN" has-session -t "$session" 2>/dev/null; then
    "$TMUX_BIN" send-keys -t "$TARGET_WINDOW" Escape; sleep 1
    "$TMUX_BIN" send-keys -t "$TARGET_WINDOW" C-u;    sleep 1
    "$TMUX_BIN" send-keys -t "$TARGET_WINDOW" -l "$PROMPT"; sleep 1
    "$TMUX_BIN" send-keys -t "$TARGET_WINDOW" C-m
    log "INJECTED resume prompt into $TARGET_WINDOW"
else
    log "WARN tmux session '$session' not found — relied on signal file + cron"
fi

log "DONE pid=$$"
