#!/usr/bin/env bash
# virgil.sh — Codebase Guide Aion Script v0.2
# Runs in tmux jarvis:3, 15s refresh cycle
# Read-only, no LLM calls, deterministic heuristics
#
# Design: .claude/plans/virgil-angel-script-design.md (20 iterations)
# Architecture: Virgil = navigational awareness (what am I looking at?)
#   - Shows codebase through the AI's eyes
#   - Task and agent tracking via virgil-tracker.js signal files
#   - OSC 8 hyperlinks (clickable in iTerm2 tmux panes)
#   - "Virgil Says" heuristic recommendations
#
# Prerequisites:
#   tmux: set -g allow-passthrough on
#   tmux: set -as terminal-features ',xterm-256color:hyperlinks'
#
# v0.2 — F.2 MVP: TASKS, ACTIVE AGENTS, FILES TOUCHED panels

set -euo pipefail

PROJECT_DIR="${JARVIS_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
FILE_ACCESS="$PROJECT_DIR/.claude/logs/file-access.json"
# 🔴 DO NOT point this back at `.claude/context/.jicm-state` — the v7.3 → v7.9 shim,
# RETIRED at 7.9.6c, frozen at 2026-05-04, and it never carried `context_pct:` /
# `context_tokens:` at all. The old awk scrape rendered `Tokens: ? (?) | State: ?`,
# and `state:` was worse than the `?`s: it returned a plausible frozen `WATCHING`.
WATCHER_STATUS="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"

# Read canonical JICM state for w0 into JS_TOKENS / JS_PCT / JS_STATE.
# Fields stay EMPTY when unreadable, so a missing reading renders "?" (visible) rather
# than a stale number (believed). Percent is of the HARD threshold, matching the W8 console.
read_jicm_state() {
    JS_TOKENS=""; JS_PCT=""; JS_STATE=""
    [[ -r "$WATCHER_STATUS" ]] || return 0
    command -v jq >/dev/null 2>&1 || return 0
    local t h
    t=$(jq -r '.tokens // empty'                 "$WATCHER_STATUS" 2>/dev/null || true)
    h=$(jq -r '.hard_threshold_tokens // empty'  "$WATCHER_STATUS" 2>/dev/null || true)
    JS_STATE=$(jq -r '.action // empty'          "$WATCHER_STATUS" 2>/dev/null || true)
    JS_TOKENS="$t"
    # JS_PCT is a BARE INTEGER, no '%'. virgil_says does arithmetic on it
    # (`[[ "$pct" -ge 70 ]]`), and a "65%" string is an arithmetic syntax error there.
    # That comparison had never once run: under the dead shim pct was ALWAYS empty, so
    # `${pct:-0}` fed it 0 forever and Virgil's top-priority rule was silently unreachable.
    # Callers append the '%' at render time.
    if [[ "$t" =~ ^[0-9]+$ ]] && [[ "$h" =~ ^[0-9]+$ ]] && [[ "$h" -gt 0 ]]; then
        JS_PCT="$(( t * 100 / h ))"
    fi
    return 0
}
ENNOIA_STATUS="$PROJECT_DIR/.claude/context/.ennoia-status"
VIRGIL_TASKS="$PROJECT_DIR/.claude/context/.virgil-tasks.json"
VIRGIL_AGENTS="$PROJECT_DIR/.claude/context/.virgil-agents.json"
REFRESH=15  # seconds

# Trap for clean exit
trap 'echo "Virgil: shutting down."; exit 0' SIGTERM SIGINT

# --- Color Constants (ANSI-C quoting for reliable escape sequences) ---
C_RESET=$'\e[0m'
C_BOLD=$'\e[1m'
C_DIM=$'\e[2m'
C_GREEN=$'\e[32m'
C_YELLOW=$'\e[33m'
C_RED=$'\e[31m'
C_CYAN=$'\e[36m'
C_MAGENTA=$'\e[35m'

# --- OSC 8 Hyperlink Helpers ---
hyperlink() { printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$2"; }
file_link() {
    local abs="$PROJECT_DIR/$1" display="${2:-$1}"
    hyperlink "vscode://file${abs}" "$display"
}

# --- Data Extraction ---
get_recent_files() {
    # Top 8 files by last_read within 10 min, using python3 for JSON
    python3 -c "
import json, sys
from datetime import datetime, timedelta, timezone
try:
    d = json.load(open(sys.argv[1]))
except (FileNotFoundError, json.JSONDecodeError):
    sys.exit(0)
cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
recent = []
for path, info in d.get('files', {}).items():
    try:
        lr = datetime.fromisoformat(info['last_read'].replace('Z','+00:00'))
        if lr > cutoff:
            recent.append((lr, path, info.get('read_count', 1)))
    except (KeyError, ValueError):
        continue
recent.sort(reverse=True)
for lr, path, count in recent[:8]:
    print(f'{count}\t{path}')
" "$FILE_ACCESS" 2>/dev/null
}

# Unpushed-commit count, or the string `na` when it CANNOT be measured.
#
# Two dead revspecs preceded this. `origin/Project_Aion` was never a ref (the remote is
# `origin`, the branch is `main`). `@{upstream}` alone was no better here: `main` had no
# tracking branch configured, so it fataled too. BOTH returned an empty count that `wc -l`
# turned into a confident `0`, and this rule could never fire.
#
# ⚠️ A COUNT OF 0 AND AN UNMEASURABLE REVSPEC ARE INDISTINGUISHABLE BY VALUE. That is why
# both bugs survived: `0 unpushed` is the healthy reading, so the failure rendered as good
# news. Resolve the ref EXPLICITLY and return `na` when it does not exist — never a number.
# The sentinel is a string on purpose: it must sit outside the value domain it guards
# (a numeric sentinel collided with real negative lag in `_state_lag_sec`).
#
# Verify a change here with `git rev-parse --verify <revspec>`, NOT by eyeballing the count.
get_unpushed() {
    local base
    # Prefer the configured tracking branch; fall back to origin/<current-branch>.
    base=$(git -C "$PROJECT_DIR" rev-parse --verify --quiet '@{upstream}' 2>/dev/null) \
        || base=""
    if [[ -z "$base" ]]; then
        local br
        br=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)
        [[ -n "$br" ]] && base=$(git -C "$PROJECT_DIR" rev-parse --verify --quiet "origin/$br" 2>/dev/null)
    fi
    [[ -z "$base" ]] && { echo "na"; return; }
    git -C "$PROJECT_DIR" log --oneline "$base..HEAD" 2>/dev/null | wc -l | tr -d ' '
}

# --- Tasks Section (reads .virgil-tasks.json) ---
render_tasks_section() {
    echo; echo "${C_BOLD} TASKS${C_RESET}"
    if [[ ! -f "$VIRGIL_TASKS" ]]; then
        echo "  ${C_DIM}(no active tasks)${C_RESET}"
        return
    fi
    local output
    output=$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except (FileNotFoundError, json.JSONDecodeError):
    sys.exit(0)
tasks = d.get('tasks', [])
if not tasks:
    print('  (no active tasks)')
    sys.exit(0)
icons = {'completed': '[x]', 'in_progress': '[>]', 'pending': '[ ]', 'deleted': '[-]'}
colors = {'completed': '\\033[32m', 'in_progress': '\\033[33m', 'pending': '\\033[0m', 'deleted': '\\033[2m'}
reset = '\\033[0m'
for t in tasks[:8]:
    s = t.get('status', 'pending')
    icon = icons.get(s, '[ ]')
    color = colors.get(s, '')
    subj = t.get('subject', '?')[:50]
    tid = t.get('id', '?')
    extra = ''
    if s == 'in_progress':
        af = t.get('activeForm', '')
        if af:
            extra = f' ({af})'
    print(f'  {color}{icon} #{tid} {subj}{extra}{reset}')
" "$VIRGIL_TASKS" 2>/dev/null)
    if [[ -n "$output" ]]; then
        echo "$output"
    else
        echo "  ${C_DIM}(no active tasks)${C_RESET}"
    fi
}

# --- Active Agents Section (reads .virgil-agents.json) ---
render_agents_section() {
    echo; echo "${C_BOLD} AGENTS${C_RESET}"
    if [[ ! -f "$VIRGIL_AGENTS" ]]; then
        echo "  ${C_DIM}(no active agents)${C_RESET}"
        return
    fi
    local output
    output=$(python3 -c "
import json, sys, os
from datetime import datetime, timezone
try:
    d = json.load(open(sys.argv[1]))
except (FileNotFoundError, json.JSONDecodeError):
    sys.exit(0)
agents = d.get('agents', [])
if not agents:
    print('  (no active agents)')
    sys.exit(0)
SLOW_SEC = int(os.environ.get('VIRGIL_AGENT_SLOW_SEC', '1800'))
now = datetime.now(timezone.utc)
for a in agents:
    atype = a.get('type', '?')
    desc = a.get('description', '')[:40]
    status = a.get('status', 'running')
    started = a.get('started', '')
    elapsed = ''
    stale = ''
    if started:
        try:
            st = datetime.fromisoformat(started.replace('Z','+00:00'))
            secs = int((now - st).total_seconds())
            # Always carry the largest unit. A minutes-only format rendered a 173-day
            # fossil as '248882m01s', which reads as a number rather than as 'this is
            # obviously not a live agent' — it hid the very thing it was reporting.
            if secs < 60:
                elapsed = f'{secs}s'
            elif secs < 3600:
                elapsed = f'{secs // 60}m{secs % 60:02d}s'
            elif secs < 86400:
                elapsed = f'{secs // 3600}h{(secs % 3600) // 60:02d}m'
            else:
                elapsed = f'{secs // 86400}d{(secs % 86400) // 3600:02d}h'
            # We have NO liveness signal for a subagent, so 'stalled' is an inference we
            # cannot support. Report the observation (it has been running a long time)
            # and let the reader judge. The old 10-minute red 'possibly stalled' fired on
            # every ordinary long agent, which is how a real warning gets tuned out.
            if secs > SLOW_SEC and status == 'running':
                stale = ' \\033[33m(long-running)\\033[0m'
        except (ValueError, TypeError):
            pass
    icon = '\\033[33m*' if status == 'running' else '\\033[32mv'
    reset = '\\033[0m'
    print(f'  {icon}{reset} {atype}: {desc} [{elapsed}]{stale}')
" "$VIRGIL_AGENTS" 2>/dev/null)
    if [[ -n "$output" ]]; then
        echo "$output"
    else
        echo "  ${C_DIM}(no active agents)${C_RESET}"
    fi
}

# --- Files Touched Section (enhanced git changes) ---
render_files_touched() {
    echo; echo "${C_BOLD} FILES TOUCHED${C_RESET}"
    local changes
    changes=$(git -C "$PROJECT_DIR" status --short 2>/dev/null)
    if [[ -z "$changes" ]]; then
        echo "  ${C_DIM}(clean working tree)${C_RESET}"
        return
    fi
    # Group and color by status
    echo "$changes" | head -12 | while IFS= read -r line; do
        local status="${line:0:2}"
        local file="${line:3}"
        case "$status" in
            "M "| " M"|"MM") printf "  ${C_YELLOW}M${C_RESET}  %s\n" "$file" ;;
            "A "| " A")      printf "  ${C_GREEN}A${C_RESET}  %s\n" "$file" ;;
            "D "| " D")      printf "  ${C_RED}D${C_RESET}  %s\n" "$file" ;;
            "??")            printf "  ${C_DIM}?  %s${C_RESET}\n" "$file" ;;
            "R ")            printf "  ${C_MAGENTA}R${C_RESET}  %s\n" "$file" ;;
            *)               printf "  %s  %s\n" "$status" "$file" ;;
        esac
    done
    local total
    total=$(echo "$changes" | wc -l | tr -d ' ')
    if [[ "$total" -gt 12 ]]; then
        echo "  ${C_DIM}... and $((total - 12)) more${C_RESET}"
    fi
}

# --- Virgil Says (highest priority rule wins) ---
virgil_says() {
    local pct unpushed tasks_count agents_running
    read_jicm_state
    pct="$JS_PCT"
    unpushed=$(get_unpushed)
    # Check for stalled agents
    agents_running=$(python3 -c "
import json, sys, os
from datetime import datetime, timezone
try:
    d = json.load(open(sys.argv[1]))
    agents = [a for a in d.get('agents', []) if a.get('status') == 'running']
    SLOW_SEC = int(os.environ.get('VIRGIL_AGENT_SLOW_SEC', '1800'))
    slow = 0
    now = datetime.now(timezone.utc)
    for a in agents:
        try:
            st = datetime.fromisoformat(a['started'].replace('Z','+00:00'))
            if (now - st).total_seconds() > SLOW_SEC:
                slow += 1
        except (KeyError, ValueError, TypeError):
            pass
    if slow > 0:
        print(f'slow:{slow}')
    elif agents:
        print(f'running:{len(agents)}')
except Exception:
    pass
" "$VIRGIL_AGENTS" 2>/dev/null)

    if [[ "${pct:-0}" -ge 70 ]]; then
        echo "Context at ${pct}%. Compression imminent."
    elif [[ "$agents_running" == slow:* ]]; then
        local n="${agents_running#slow:}"
        echo "${n} agent(s) running over $(( ${VIRGIL_AGENT_SLOW_SEC:-1800} / 60 )) min."
    elif [[ "$unpushed" != "na" && "${unpushed:-0}" -gt 0 ]]; then
        echo "${unpushed} commit(s) unpushed to remote."
    elif [[ "$unpushed" == "na" ]]; then
        # Ranked BELOW real conditions but never silent: an unmeasurable push state must not
        # render as "All systems nominal", which is what the two dead revspecs did for months.
        echo "Cannot measure unpushed commits — no upstream for this branch."
    elif [[ "$agents_running" == running:* ]]; then
        local n="${agents_running#running:}"
        echo "${n} agent(s) actively working."
    else
        echo "All systems nominal."
    fi
}

# --- Ennoia Section (reads .ennoia-status if available) ---
render_ennoia_section() {
    if [[ -f "$ENNOIA_STATUS" ]]; then
        local mode intent
        mode=$(awk '/^mode:/{print $2}' "$ENNOIA_STATUS" 2>/dev/null)
        intent=$(sed -n 's/^intent: //p' "$ENNOIA_STATUS" 2>/dev/null | head -1)
        echo; echo "${C_BOLD} ENNOIA${C_RESET}"
        echo "  Mode: ${mode:-?} | Intent: ${intent:-?}"
    fi
}

# --- Render ---
render() {
    clear
    local cols
    cols=$(tput cols 2>/dev/null || echo 60)
    printf "${C_BOLD}${C_CYAN} VIRGIL${C_RESET} — Codebase Guide"
    printf '%*s' $((cols - 30)) "$(date '+%H:%M %Z')"
    echo; printf '%.0s─' $(seq 1 "$cols"); echo

    # Panels: Tasks → Agents → Files Touched → Recent Files → Context → Ennoia
    render_tasks_section
    render_agents_section
    render_files_touched

    echo; echo "${C_BOLD} RECENT FILES (last 10 min)${C_RESET}"
    local files
    files=$(get_recent_files)
    if [[ -n "$files" ]]; then
        while IFS=$'\t' read -r count path; do
            printf '  %3dx  ' "$count"
            file_link "$path" "$path"
            echo
        done <<< "$files"
    else
        echo "  ${C_DIM}(no recent file activity)${C_RESET}"
    fi

    echo; echo "${C_BOLD} CONTEXT${C_RESET}"
    read_jicm_state
    local pct_d="?"; [[ -n "$JS_PCT" ]] && pct_d="${JS_PCT}%"
    echo "  W0 tokens: ${JS_TOKENS:-?} (${pct_d} of hard) | State: ${JS_STATE:-?}"

    render_ennoia_section

    printf '\n%.0s─' $(seq 1 "$cols"); echo
    printf '\e[33m ☞ Virgil says:\e[0m %s\n' "$(virgil_says)"
}

# --- Main Loop ---
while true; do
    render
    sleep "$REFRESH"
done
