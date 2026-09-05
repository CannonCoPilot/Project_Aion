#!/bin/bash
# ============================================================================
# jicm-nudge.sh — JICM mid-turn context nudge (PreToolUse)
# ============================================================================
# Delivers the SOFT_NUDGE / HARD_HALT state to the model DURING a turn, so a long
# agentic turn can wrap itself up before it overshoots the hard threshold.
#
# WHY THIS EXISTS (2026-09-03 incident)
#   JICM actuation is raised by jicm-stop.sh, a Stop hook, which fires only at a TURN
#   BOUNDARY. A long agentic turn therefore blocks actuation for as long as it runs, and
#   overshoot = burn_rate x remaining_turn_duration is unbounded. Measured live: w0 was
#   over hard (330,000) by 18:53Z at 428,602 tokens, kept climbing, and only cleared at
#   19:15:38Z at 528,402 — a 198,402-token overshoot and ~22 minutes of lag, during which
#   nothing in the system could tell the lane it was over.
#
#   Raising the thresholds (jicm-config.sh, 550K/600K) buys headroom. It does not shorten
#   the wait. This hook closes that gap by making the lane itself aware mid-turn.
#
# WHY PreToolUse AND NOT PostToolUse
#   PostToolUse does NOT support hookSpecificOutput.additionalContext. Per the Claude Code
#   changelog, additionalContext is available on UserPromptSubmit, PreToolUse, and
#   Stop/SubagentStop only. jicm-gate.sh's own comment says the same, and it is correct —
#   emitting a UserPromptSubmit-shaped payload on a PostToolUse event would be a lie.
#   PreToolUse fires on the same mid-turn cadence and DOES carry additionalContext, so the
#   nudge rides the pre-tool edge instead.
#
# WHAT THIS HOOK IS NOT
#   It does NOT sample, does not compute tokens, does not write state, and NEVER actuates.
#   jicm-gate.sh remains the only sampler; jicm-stop.sh remains the only signal raiser.
#   This hook only READS the state file the gate already wrote and reports it. Keeping it
#   read-only is what makes it safe to run on every tool call.
#
#   It also never blocks. A PreToolUse hook can deny a tool call; this one must not — a
#   context warning that cancels the user's work is worse than the overshoot it prevents.
#
# RATE LIMITING
#   PreToolUse fires on EVERY tool call, which in an agentic turn can be dozens per minute.
#   Repeating the same warning that often would burn the very context it is trying to save
#   and would train the model to ignore it. So: at most one nudge per JICM_NUDGE_COOLDOWN
#   seconds per key, and the HARD tier is allowed to re-nudge sooner than the SOFT tier.
#
# OUTPUT: always JSON to stdout, always exit 0.
# ============================================================================

set -o pipefail   # NB: NOT -euo (per Jarvis MEMORY.md grep-exit-1 gotcha)

INPUT="$(cat)"

# Bare continue — the shape for "PreToolUse, nothing to add". Used for every early exit so
# a broken nudge can never interfere with a tool call.
_passthrough() { echo '{"continue":true}'; exit 0; }

command -v jq >/dev/null 2>&1 || _passthrough

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"

# ─── FAST PATH ──────────────────────────────────────────────────────────────
# This hook runs on EVERY tool call, so its cost in the common case is its real cost.
# Measured before this guard: 49ms/call, versus 29ms for the existing context-injector —
# i.e. it would have been the most expensive thing on the PreToolUse path, permanently,
# to say nothing in almost every invocation. Adding fixed overhead to a mechanism whose
# entire purpose is to stop wasting context is a bad trade.
#
# Almost all of that cost is sourcing jicm-config.sh (600+ lines) and the jq that follows,
# and in the overwhelmingly common case (no lane anywhere near threshold) both are pure
# waste. So: one grep over the handful of small state files FIRST. If not a single lane is
# at SOFT_NUDGE or HARD_HALT, this lane cannot be either, and we bail before paying for
# config or jq.
#
# The check is a deliberate SUPERSET — it asks "is ANY lane elevated?", not "is MY lane
# elevated?" — because identifying "my lane" is precisely the expensive step. A false
# positive costs one slow call that then exits correctly a few lines later. A false
# negative is impossible: this lane's own state file is one of the files being grepped.
#
# Uses /usr/bin/grep explicitly: a `grep` on PATH may be ugrep, which honours .gitignore
# and has silently returned zero matches where /usr/bin/grep returned many (see MEMORY.md).
# A silent zero here would disable the nudge permanently and invisibly.
_JICM_STATES="$PROJECT_DIR/.claude/context/jicm/state"
_JICM_LEGACY="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"

# Find MY state file by the session id in the hook payload, rather than deriving the key.
# This is not a reimplementation of jicm_derive_key — it is a more direct question. The
# state file that NAMES my session IS my state file, by construction: jicm-gate.sh writes
# session_id into every state it writes. Looking it up costs one grep; deriving the key
# costs sourcing jicm-config.sh (600+ lines) plus a tmux pane query for the occupancy gate.
#
# Rejected alternative: grep all state files for any elevated action, as a cheap superset.
# It looked correct and was useless in practice — an IDLE lane's state file keeps whatever
# action it last had, so urist sat at HARD_HALT and protos at SOFT_NUDGE from hours earlier
# and the "fast" path matched on every single call. Measured: 50.5ms, i.e. no improvement
# at all. A staleness bound would have patched that, but keying on session id removes the
# whole class of problem instead: a stale file for another lane simply is not mine.
#
# /usr/bin/grep explicitly — `grep` on PATH may be ugrep, which honours .gitignore and has
# silently returned zero matches where /usr/bin/grep returned many (see MEMORY.md). A silent
# zero here would disable the nudge permanently and invisibly.
SESSION_ID_IN="$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)"
[[ "$SESSION_ID_IN" == "null" ]] && SESSION_ID_IN=""
[[ -z "$SESSION_ID_IN" ]] && _passthrough

JK_STATE="$(/usr/bin/grep -lF "\"session_id\": \"$SESSION_ID_IN\"" \
              "$_JICM_STATES"/*.json "$_JICM_LEGACY" 2>/dev/null | head -1)"
[[ -n "$JK_STATE" && -f "$JK_STATE" ]] || _passthrough

# Key = the state file's own name; the legacy path is w0 by definition. Used only to
# namespace the cooldown stamp, so an approximation here cannot affect what is reported.
if [[ "$JK_STATE" == "$_JICM_LEGACY" ]]; then
    JICM_KEY="w0"
else
    JICM_KEY="$(basename "$JK_STATE" .json)"
fi

# Read what the gate already measured. Never recompute — two writers of one number is how
# the action/pending_action split becomes possible in the first place.
read -r ACTION TOKENS HARD SOFT RATE5 < <(
    jq -r '[(.action // "WATCHING"), (.tokens // 0), (.hard_threshold_tokens // 0), (.soft_threshold_tokens // 0), (.rate_5h_pct // 0)] | @tsv' \
        "$JK_STATE" 2>/dev/null | tr '\t' ' '
)
[[ "$TOKENS" =~ ^[0-9]+$ ]] || _passthrough
[[ "$HARD"   =~ ^[0-9]+$ ]] || HARD=0
# rate_5h_pct may be a float (e.g. 91.4) or absent; keep the integer part only.
RATE5="${RATE5%%.*}"
[[ "$RATE5" =~ ^[0-9]+$ ]] || RATE5=0

# ─── Two-axis gate ──────────────────────────────────────────────────────────
# CRITICAL: quota pressure is ORTHOGONAL to context pressure. A lane can sit at 10% context
# and 95% quota. The original gate returned early unless ACTION was SOFT_NUDGE/HARD_HALT, so
# a quota tier placed AFTER it could never fire — it would be dead code that looks installed.
# Both axes are therefore evaluated here, and we bail only if NEITHER is hot.
QUOTA_WARN="${JICM_QUOTA_WARN_PCT:-90}"
[[ "$QUOTA_WARN" =~ ^[0-9]+$ ]] || QUOTA_WARN=90

CONTEXT_HOT=0
case "$ACTION" in SOFT_NUDGE|HARD_HALT) CONTEXT_HOT=1 ;; esac

QUOTA_HOT=0
[[ "$RATE5" -ge "$QUOTA_WARN" ]] && QUOTA_HOT=1

[[ "$CONTEXT_HOT" -eq 1 || "$QUOTA_HOT" -eq 1 ]] || _passthrough

# Composite tier: part of the cooldown stamp so the two axes cannot suppress each other and
# any escalation (QUOTA -> SOFT_NUDGE+QUOTA, SOFT -> HARD) is delivered immediately.
TIER=""
[[ "$CONTEXT_HOT" -eq 1 ]] && TIER="$ACTION"
[[ "$QUOTA_HOT"   -eq 1 ]] && TIER="${TIER:+$TIER+}QUOTA"

# ─── Rate limit ─────────────────────────────────────────────────────────────
# Separate cooldowns per tier: a lane over HARD is burning headroom that no longer exists,
# so it may be reminded more often than one merely over SOFT.
# A quota-only nudge is advice about pacing, not about an imminent clear, so it repeats far
# less often. When context is ALSO hot the context cadence wins — it is the more urgent clock.
if [[ "$CONTEXT_HOT" -eq 1 ]]; then
    COOLDOWN="${JICM_NUDGE_COOLDOWN:-300}"
    [[ "$ACTION" == "HARD_HALT" ]] && COOLDOWN="${JICM_NUDGE_COOLDOWN_HARD:-120}"
else
    COOLDOWN="${JICM_QUOTA_COOLDOWN:-600}"
fi

STAMP_DIR="$PROJECT_DIR/.claude/context/jicm/signals"
mkdir -p "$STAMP_DIR" 2>/dev/null
STAMP="$STAMP_DIR/nudged.$JICM_KEY"
NOW_EPOCH="$(date +%s)"

# Tier is part of the stamp so a SOFT->HARD escalation is delivered immediately rather than
# being swallowed by a cooldown started at the lower tier.
LAST_EPOCH=0; LAST_TIER=""
if [[ -f "$STAMP" ]]; then
    LAST_EPOCH="$(cut -d'|' -f1 "$STAMP" 2>/dev/null)"
    LAST_TIER="$(cut -d'|' -f2 "$STAMP" 2>/dev/null)"
    [[ "$LAST_EPOCH" =~ ^[0-9]+$ ]] || LAST_EPOCH=0
fi
if [[ "$LAST_TIER" == "$TIER" && $(( NOW_EPOCH - LAST_EPOCH )) -lt "$COOLDOWN" ]]; then
    _passthrough
fi
printf '%s|%s\n' "$NOW_EPOCH" "$TIER" > "$STAMP"

# ─── Compose ────────────────────────────────────────────────────────────────
PCT=""
[[ "$HARD" -gt 0 ]] && PCT=" ($(( TOKENS * 100 / HARD ))% of the hard threshold)"

QUOTA_MSG="[JICM] 5-HOUR QUOTA AT ${RATE5}% — do not launch any new subagents or parallel background work. If subagents are already running, WAIT for them to return their results and fold them in before starting any next step of your own. Sequential work from here; parallel fan-out at this level risks exhausting the window mid-task and stranding whatever is in flight."

if [[ "$CONTEXT_HOT" -eq 1 && "$ACTION" == "HARD_HALT" ]]; then
    MSG="[JICM] CONTEXT OVER HARD THRESHOLD — ${TOKENS} tokens vs hard ${HARD}${PCT}. A JICM cycle (checkpoint + /clear + resume) is queued and fires at the END of this turn; it cannot interrupt you mid-turn, so you are safe to finish cleanly — but every tool call from here adds to the overshoot the checkpoint must carry. Land the current step, write state to your scratchpad, and hand back. Do not open new work, and do not spawn anything whose result would only come back AFTER the clear: the clear mints a NEW session, so a subagent report, background-task notification, artifact watch, monitor or session-scoped cron started now may have nowhere to return to. Work already in flight: let it return before you hand back."
elif [[ "$CONTEXT_HOT" -eq 1 ]]; then
    MSG="[JICM] CONTEXT NEARING THRESHOLD — ${TOKENS} tokens vs hard ${HARD}${PCT}. A /clear WILL happen at the end of one of the next few turns. Keep going on what you are doing; finishing the current step is exactly right. Two things to avoid until after the cycle: (1) do not START subagents, background tasks, artifact watches, monitors or session-scoped crons — the clear mints a NEW session, so their results may return to a session that no longer exists, and that work is spent for nothing; (2) do not leave findings only in this conversation — the files survive, the conversation does not, so anything you would be annoyed to re-derive belongs in your scratchpad NOW. Work already in flight: let it return before you hand back."
else
    MSG=""
fi

# ONE message, never two. When both axes are hot the quota line is appended to the context
# message rather than emitted separately: two stacked [JICM] blocks on a single tool call
# read as spam and train the model to skip them.
if [[ "$QUOTA_HOT" -eq 1 ]]; then
    if [[ -n "$MSG" ]]; then
        MSG="$MSG

ALSO — 5-HOUR QUOTA AT ${RATE5}%. On top of the above: launch no new subagents or parallel background work at all. Let anything already running return before you take another step of your own."
    else
        MSG="$QUOTA_MSG"
    fi
fi

jq -nc --arg m "$MSG" \
  '{continue:true, hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$m}}' \
  2>/dev/null || _passthrough

# Log (best effort; never fatal).
LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-nudge.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | NUDGE | key=$JICM_KEY | $TIER | tokens=$TOKENS hard=$HARD rate5h=${RATE5}%" >> "$LOG_FILE" 2>/dev/null

LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [[ "$LOG_SIZE" -gt 102400 ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1" 2>/dev/null
fi

exit 0
