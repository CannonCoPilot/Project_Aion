#!/bin/bash
# restart-watcher.sh — DISARMED 2026-08-24. Does not restart anything; explains what does.
#
# WHAT THIS USED TO DO
#   Kill a tmux-hosted, self-managed JICM watcher in W1 and respawn it with a lower
#   threshold, for fast JICM cycle testing from W11:Jarvis-dev.
#
# WHY IT IS DISARMED — every assumption it encoded is now false:
#   1. W1 IS NOT THE WATCHER. W1 is Protos, a LIVE Claude session (Alfred seed / fork
#      cache). The old code ran `tmux respawn-window -k -t "${SESSION}:1"`, which would
#      have destroyed that session's context outright. Measured 2026-08-24: W1 held
#      105,150 tokens and a running agent. There is no recovery from -k.
#   2. THE ONLY THING THAT PREVENTED THAT was a stale default, SESSION="${TMUX_SESSION:-jarvis}".
#      The session is `aion`; `has-session -t jarvis` failed and the script exited 1 before
#      reaching the respawn. That is an accident, not a safety property — one `TMUX_SESSION=aion`
#      in the environment and it fires.
#   3. THE WATCHER TAKES NO SUCH FLAGS. jicm-watcher.sh (v9) has no --threshold and no
#      --interval. The script's whole interface was inert.
#   4. THERE IS NO PID FILE. It killed by $CONTEXT_DIR/.jicm-watcher.pid, which does not exist.
#   5. IT IS LAUNCHD-MANAGED. com.aion.jicm-watcher runs under launchd with KeepAlive, so
#      killing the process by PID only causes launchd to respawn it — with the plist's
#      settings, not yours. A hand-started copy would ALSO be a second, competing watcher.
#   6. IT DELETED LIVE STATE. It rm'd .jicm-state and the compression signal files, which
#      now belong to the running daemon and to every registered lane, not to a test rig.
#
# THE NEED IS STILL REAL — fast-cycle testing wants low thresholds — but it must be
# re-expressed against the v9 daemon. That is a DESIGN DECISION (per-lane vs global;
# plist edit vs `launchctl setenv` vs a registry override), deliberately NOT guessed here.
# Until it is made, this script refuses rather than pretending.
#
# CORRECT REMEDIES TODAY
#   Restart the watcher:   launchctl kickstart -k gui/$UID/com.aion.jicm-watcher
#   Is it alive?           launchctl list | grep com.aion.jicm-watcher
#   Watch it:              tail -f .claude/logs/jicm-watcher.log      (console: tmux aion:8)
#   Thresholds:            JICM_SOFT_TOKENS / JICM_HARD_TOKENS (see .claude/scripts/jicm-config.sh);
#                          the DAEMON reads them from its plist environment, NOT from your shell.
#
# Restore from git history if you are rebuilding the testing path — do not un-disarm in place.

cat >&2 <<'DISARMED'
restart-watcher.sh is DISARMED and performs no action.

It targeted tmux W1 with `respawn-window -k`. W1 is now Protos — a LIVE Claude session.
Running the old logic would have destroyed it. The watcher it meant to restart is now
the launchd job com.aion.jicm-watcher (jicm-watcher.sh, JICM v9), which takes none of
this script's flags and writes no PID file.

Use instead:
  restart      launchctl kickstart -k gui/$UID/com.aion.jicm-watcher
  status       launchctl list | grep com.aion.jicm-watcher
  logs         tail -f .claude/logs/jicm-watcher.log   (console: tmux window aion:8)
  thresholds   JICM_SOFT_TOKENS / JICM_HARD_TOKENS, set in the job's plist environment
               (see .claude/scripts/jicm-config.sh) — shell env does not reach the daemon.

See the header of this file for the full reasoning.
DISARMED
exit 64   # EX_USAGE — a caller that ignores this and continues is a bug worth surfacing
