#!/usr/bin/env bash
# session-reap.sh — diagnose live Claude Code processes by ORIGIN, and (optionally,
# cautiously) reap ONLY truly-orphaned idle ones. NEVER touches transcripts.
#
# WHY (see projects/project-aion/reports/jicm-v9-session-identity-diagnosis-2026-07-20.md):
# Session confusion/pollution is a LIVE-PROCESS + registry problem, not a transcript
# problem. Transcripts are preserved artifacts. Three process origins exist:
#   WINDOW    — launcher tmux windows (W0/dev/Protos): healthy, never touch.
#   HOSTED    — nested/background jobs + subagents under a live claude host: may be
#               active work; never auto-kill (leave to their host's lifecycle).
#   ORPHANED  — claude whose tmux window is gone AND whose parent chain is dead:
#               the Reaper gap (kill-window left the process alive). Kill candidate.
#
# SAFETY: dry-run by default. --execute --yes kills ONLY ORPHANED + idle processes.
# Never kills WINDOW/HOSTED/busy. Never deletes or archives any transcript.
# bash 3.2 compatible. Do NOT `set -e`.

set -u

TMUX_BIN="${TMUX_BIN:-/Users/nathanielcannon/bin/tmux}"
SESSION_NAME="aion"
SESSIONS_DIR="$HOME/.claude/sessions"

MODE="dryrun"; CONFIRM_KILL="no"
for a in "$@"; do
  case "$a" in
    --execute) MODE="execute" ;;
    --yes)     CONFIRM_KILL="yes" ;;
    -h|--help) echo "usage: session-reap.sh [--execute --yes]   (dry-run default; kills ONLY orphaned+idle; never touches transcripts)"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 64 ;;
  esac
done

say() { printf '%s\n' "$*"; }
hr()  { printf '%s\n' "──────────────────────────────────────────────────────────────"; }

# Classify a pid by walking its ancestry:
#   prints "WINDOW" | "HOSTED:<hostpid>" | "ORPHANED" | "GONE" | "UNVERIFIABLE"
#
# FAIL CLOSED (fixed 2026-07-25): only ORPHANED is ever a kill candidate. An absent ps
# entry previously fell through to ORPHANED, which meant an UNVERIFIABLE process was a
# kill target — a transient ps hiccup on a live session could select it. That is the
# inverse of the discipline used everywhere else in JICM v9 (C2/F3 fail-closed on an
# unresolvable pane; reconciliation refuses to act on a blind probe). A process we
# cannot see is never proof of an orphan:
#   GONE         — the pid does not exist (already exited) → a stale registry row, not a reap.
#   UNVERIFIABLE — the pid exists but its ancestry could not be walked → report, never kill.
classify() {
  local p="$1" n=0 cmd pp top=""
  ps -o pid= -p "$p" >/dev/null 2>&1 || { echo "GONE"; return; }
  while [ -n "$p" ] && [ "$p" -gt 1 ] && [ $n -lt 12 ]; do
    cmd="$(ps -o command= -p "$p" 2>/dev/null)"
    pp="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
    case "$cmd" in *tmux*new-session*) echo "WINDOW"; return;; esac
    if [ -z "$pp" ]; then
      # Chain broke. Distinguish "it died under us" from "we could not see it".
      if ps -o pid= -p "$1" >/dev/null 2>&1; then echo "UNVERIFIABLE"; else echo "GONE"; fi
      return
    fi
    if [ "$pp" -eq 1 ]; then top="$p"; break; fi               # reached a detached top
    p="$pp"; n=$((n+1))
  done
  if [ -n "$top" ]; then
    # top is a detached ancestor; if it's a live claude host, we're hosted under it.
    case "$(ps -o command= -p "$top" 2>/dev/null)" in
      *claude-code*|*claude*) echo "HOSTED:$top"; return;;
    esac
  fi
  echo "ORPHANED"
}

# Enumerate live claude (pid sid status ppid)
LIVE="$(python3 - "$SESSIONS_DIR" <<'PY'
import json, glob, os, sys, subprocess
for f in glob.glob(os.path.join(sys.argv[1], "*.json")):
    try: j = json.load(open(f))
    except Exception: continue
    pid = j.get("pid"); sid = j.get("sessionId") or ""; st = j.get("status") or ""
    if not pid: continue
    print("%s\t%s\t%s" % (pid, sid, st))
PY
)"

WINLINES=""; HOSTLINES=""; ORPHLINES=""; SKIPLINES=""; ORPHAN_KILL=""
while IFS="$(printf '\t')" read -r pid sid status; do
  [ -n "${pid:-}" ] || continue
  klass="$(classify "$pid")"
  short="${sid%%-*}"
  case "$klass" in
    WINDOW)  WINLINES="${WINLINES}  WINDOW    pid=$pid sid=$short status=$status
";;
    HOSTED:*) HOSTLINES="${HOSTLINES}  ${klass} pid=$pid sid=$short status=$status
";;
    ORPHANED)
      ORPHLINES="${ORPHLINES}  ORPHANED  pid=$pid sid=$short status=$status
"
      [ "$status" != "busy" ] && ORPHAN_KILL="$ORPHAN_KILL $pid"
      ;;
    GONE|UNVERIFIABLE)
      # Never a kill candidate — see classify(). GONE is registry hygiene; UNVERIFIABLE
      # is a probe we could not trust, and an untrusted probe authorizes nothing.
      SKIPLINES="${SKIPLINES}  ${klass}  pid=$pid sid=$short status=$status
";;
  esac
done <<EOF
$LIVE
EOF

hr; say "SESSION PROCESS DIAGNOSIS  —  mode=$MODE  kill=$CONFIRM_KILL"; hr
say "WINDOW (launcher panes — never touch):"; printf '%s' "$WINLINES"
say ""; say "HOSTED (background jobs/subagents under a live host — leave to host lifecycle):"; printf '%s' "$HOSTLINES"
say ""; say "ORPHANED (window gone + parent dead — the Reaper gap):"; printf '%s' "$ORPHLINES"
if [ -n "$SKIPLINES" ]; then
  say ""; say "NOT CLASSIFIABLE (never killed — GONE = stale registry row, UNVERIFIABLE = untrusted probe):"
  printf '%s' "$SKIPLINES"
fi
N_KILL=$(printf '%s\n' $ORPHAN_KILL | grep -c . 2>/dev/null); N_KILL=${N_KILL:-0}
hr
say "NOTE: transcripts are NEVER touched by this tool — they are preserved artifacts."

if [ "$MODE" = "dryrun" ]; then
  say ""; say "DRY-RUN — nothing changed."
  [ "$N_KILL" -gt 0 ] && say "Would kill $N_KILL orphaned+idle pids (with --execute --yes): $(printf '%s ' $ORPHAN_KILL)"
  say "Re-run with --execute --yes to kill ONLY the orphaned+idle processes above."
  exit 0
fi

if [ "$CONFIRM_KILL" = "yes" ] && [ "$N_KILL" -gt 0 ]; then
  for p in $ORPHAN_KILL; do
    if kill "$p" 2>/dev/null; then say "✓ killed orphaned pid $p"; else say "✗ could not kill pid $p"; fi
  done
elif [ "$N_KILL" -gt 0 ]; then
  say "(orphaned processes left alive — add --yes to kill them)"
fi
say "Done."
