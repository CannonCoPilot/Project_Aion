#!/bin/bash
# ============================================================================
# LiteLLM Exit Failsafe — evidence-first watchdog with a real circuit breaker
# ============================================================================
#
# WHY THIS EXISTS
# ---------------
# LiteLLM (:4000) has exited on its own at least twice (2026-08-11T03:49 and
# 2026-08-11T20:1x). Nothing surfaced either one. It is the LLM backend for
# graphiti-auto-ingest.py, so when it dies **L5 knowledge-graph ingestion stops
# for every Archon** — and because that step is async and non-blocking, no caller
# ever notices. The failure is invisible by construction: JICM cycles keep
# reporting success while the memory tier they feed silently stops accepting
# writes. Genie's first cycle only exposed it because someone went looking.
#
# WHAT THIS IS NOT
# ----------------
# It is NOT an auto-restarter. An unbounded restart loop is exactly the pattern
# the workspace guardrails forbid: it converts a broken approach into a pipeline
# that reports success while degraded. Restarts here are a CIRCUIT BREAKER with a
# budget. When the budget is exhausted the script STOPS restarting and ALERTS
# that the approach needs redesign. A crash-looping LiteLLM is a problem to
# diagnose, not a problem to paper over three times an hour forever.
#
# ORDER OF OPERATIONS MATTERS
# ---------------------------
# Evidence is captured BEFORE any remedy. Respawning the tmux window destroys the
# pane scrollback, which is currently the only record of why LiteLLM exited — the
# reason we still cannot answer that question is that the last two exits were
# restarted (once by hand, by me) before anyone read the pane.
#
# PROBE CORRECTNESS
# -----------------
# Use /health/liveliness. `/health` returns 000 EVEN WHEN LITELLM IS UP (it
# requires auth), so a naive health check reports a permanent outage and would
# make this script restart a perfectly healthy service in a loop. Verified
# 2026-08-11: up → /health 000, /health/liveliness 200, /v1/models 200.
#
# USAGE
#   litellm-failsafe.sh              Probe; restart if down and budget allows (cron entry)
#   litellm-failsafe.sh --check      Probe only. Never restarts. Exit 0 up / 1 down
#   litellm-failsafe.sh --status     Print health + incident summary
#   litellm-failsafe.sh --force      Restart regardless of health (still budgeted)
#   litellm-failsafe.sh --reset      Clear the restart budget and degraded flag
#
# EXIT CODES
#   0 healthy (or restarted and recovered)   1 down, restart not attempted
#   2 restarted but did NOT recover          3 budget exhausted — suppressed, alerted
#
# NOTE: no `set -euo pipefail` — a non-matching grep must not kill the watchdog.
# ============================================================================

# cron runs with a stripped PATH that omits /usr/sbin, where lsof lives. Without this
# the evidence file's "port 4000" section is silently blank in exactly the situation it
# exists for — a real unattended crash. Verified: `env -i PATH=<cron default>` cannot
# find lsof, but finds jq/curl/pgrep.
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
TMUX_BIN="${TMUX_BIN:-/Users/nathanielcannon/bin/tmux}"
TMUX_SESSION="${JICM_TMUX_SESSION:-aion}"
WINDOW="LiteLLM"

LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
PROBE_PATH="/health/liveliness"
PROBE_TIMEOUT=5

HEALTH_FILE="$PROJECT_DIR/.claude/context/.litellm-health.json"
LEDGER="$PROJECT_DIR/.claude/context/.litellm-incidents.jsonl"
LOG="$PROJECT_DIR/.claude/logs/litellm-failsafe.log"
CRASH_DIR="$PROJECT_DIR/.claude/logs"
LOCK="$PROJECT_DIR/.claude/context/.litellm-failsafe.lock"
TELEGRAM="$PROJECT_DIR/alfred/.claude/jobs/lib/send-telegram.sh"

# Circuit breaker: at most N restarts per rolling window. Exceed it and we stop
# and shout instead of continuing to restart.
BUDGET_MAX="${LITELLM_BUDGET_MAX:-3}"
BUDGET_WINDOW="${LITELLM_BUDGET_WINDOW:-3600}"   # seconds
STARTUP_GRACE="${LITELLM_STARTUP_GRACE:-120}"    # LiteLLM needs ~60s to bind :4000
# Creating a Pulse task auto-dispatches a Nexus chain worker (learned the hard way
# 2026-08-11: a throwaway verification task spent ~$2.50 before being closed).
# Off by default; Telegram + the health file are the alert path.
PULSE_ALERT="${LITELLM_PULSE_ALERT:-0}"

now()      { date +%s; }
now_iso()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()      { mkdir -p "$(dirname "$LOG")" 2>/dev/null; echo "$(now_iso) $*" >> "$LOG"; }

# ─── Lock (owner token; only remove a lock we own) ──────────────────────────
OWNER="$$-$(now)"
acquire_lock() {
    if [[ -f "$LOCK" ]]; then
        local age pid
        age=$(( $(now) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
        pid=$(cut -d- -f1 "$LOCK" 2>/dev/null)
        # A run can legitimately take STARTUP_GRACE+; only break a truly stale lock.
        if [[ "$age" -gt $(( STARTUP_GRACE + 120 )) ]] || { [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; }; then
            rm -f "$LOCK"
        else
            exit 0
        fi
    fi
    mkdir -p "$(dirname "$LOCK")" 2>/dev/null
    echo "$OWNER" > "$LOCK"
    trap '[[ "$(cat "$LOCK" 2>/dev/null)" == "$OWNER" ]] && rm -f "$LOCK"' EXIT
}

# ─── Probe ─────────────────────────────────────────────────────────────────
probe() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
           "${LITELLM_URL}${PROBE_PATH}" 2>/dev/null)
    [[ "$code" == "200" ]] && return 0
    # Second opinion before declaring an outage: /v1/models is a real request path,
    # so a pass here means the proxy is serving even if liveliness misbehaves.
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
           "${LITELLM_URL}/v1/models" 2>/dev/null)
    [[ "$code" == "200" ]]
}

write_health() {   # write_health <status> <detail>
    local status="$1" detail="$2" restarts
    restarts=$(restarts_in_window)
    mkdir -p "$(dirname "$HEALTH_FILE")" 2>/dev/null
    cat > "$HEALTH_FILE" <<EOF
{
  "service": "litellm",
  "url": "$LITELLM_URL",
  "status": "$status",
  "detail": "$detail",
  "checked_at": "$(now_iso)",
  "checked_epoch": $(now),
  "restarts_in_window": $restarts,
  "budget_max": $BUDGET_MAX,
  "budget_window_sec": $BUDGET_WINDOW,
  "degraded": $([[ "$status" == "degraded" ]] && echo true || echo false)
}
EOF
}

record_incident() {   # record_incident <event> <detail> [crashlog]
    mkdir -p "$(dirname "$LEDGER")" 2>/dev/null
    printf '{"ts":"%s","epoch":%s,"event":"%s","detail":"%s","crash_log":"%s"}\n' \
        "$(now_iso)" "$(now)" "$1" "$2" "${3:-}" >> "$LEDGER"
}

restarts_in_window() {
    [[ -f "$LEDGER" ]] || { echo 0; return; }
    local cutoff; cutoff=$(( $(now) - BUDGET_WINDOW ))
    grep '"event":"restart"' "$LEDGER" 2>/dev/null \
      | jq -r --argjson c "$cutoff" 'select(.epoch >= $c) | .epoch' 2>/dev/null \
      | wc -l | tr -d ' '
}

# ─── Evidence capture — ALWAYS before any remedy ────────────────────────────
capture_evidence() {
    local stamp crash
    stamp=$(date +%Y%m%d-%H%M%S)
    crash="$CRASH_DIR/litellm-crash-$stamp.log"
    mkdir -p "$CRASH_DIR" 2>/dev/null
    {
        echo "# LiteLLM crash evidence — captured $(now_iso)"
        echo "# Captured BEFORE any restart; respawning the window destroys this scrollback."
        echo
        echo "## probe"
        echo "liveliness: $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${LITELLM_URL}${PROBE_PATH}" 2>/dev/null)"
        echo "v1/models : $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${LITELLM_URL}/v1/models" 2>/dev/null)"
        echo
        echo "## port 4000"
        lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null || echo "(not listening)"
        echo
        echo "## litellm processes"
        pgrep -fl litellm 2>/dev/null || echo "(none)"
        echo
        echo "## tmux pane scrollback (last 400 lines) — THE reason we do this first"
        if [[ -x "$TMUX_BIN" ]]; then
            "$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${WINDOW}" -p -S -400 2>/dev/null \
                || echo "(pane unavailable)"
        else
            echo "(no tmux binary at $TMUX_BIN)"
        fi
        echo
        echo "## system"
        echo "load: $(sysctl -n vm.loadavg 2>/dev/null)"
        echo "swap: $(sysctl -n vm.swapusage 2>/dev/null)"
    } > "$crash" 2>&1
    echo "$crash"
}

alert() {   # alert <subject> <body>
    log "ALERT: $1 — $2"
    if [[ -x "$TELEGRAM" ]]; then
        "$TELEGRAM" --message "🔴 $1
$2
host: $(hostname -s) · $(now_iso)
health: $HEALTH_FILE" >/dev/null 2>&1 \
          && log "alert: telegram sent" || log "alert: telegram FAILED"
    else
        log "alert: telegram helper not executable at $TELEGRAM"
    fi
    if [[ "$PULSE_ALERT" == "1" ]] && command -v curl >/dev/null 2>&1; then
        curl -s -X POST "${PULSE_URL:-http://localhost:8800/api/v1}/tasks" \
          -H 'Content-Type: application/json' \
          -d "{\"title\":\"$1\",\"description\":\"$2\",\"labels\":[\"agent:shared\"],\"priority\":\"high\",\"created_by\":\"litellm-failsafe\"}" \
          >/dev/null 2>&1 && log "alert: pulse task created"
    fi
}

restart_service() {
    [[ -x "$TMUX_BIN" ]] || { log "restart: no tmux binary"; return 1; }
    "$TMUX_BIN" has-session -t "$TMUX_SESSION" 2>/dev/null || { log "restart: no '$TMUX_SESSION' session"; return 1; }
    local cmd="cd '$PROJECT_DIR/infrastructure' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
    if "$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$WINDOW"; then
        "$TMUX_BIN" respawn-window -k -t "${TMUX_SESSION}:${WINDOW}" "$cmd" 2>/dev/null
    else
        "$TMUX_BIN" new-window -d -t "$TMUX_SESSION" -n "$WINDOW" "$cmd" 2>/dev/null
    fi
}

wait_for_health() {
    local waited=0
    while [[ "$waited" -lt "$STARTUP_GRACE" ]]; do
        sleep 5; waited=$(( waited + 5 ))
        probe && { echo "$waited"; return 0; }
    done
    echo "$waited"; return 1
}

# ─── Modes ─────────────────────────────────────────────────────────────────
case "${1:-}" in
    --check)
        if probe; then echo "litellm: UP"; exit 0; else echo "litellm: DOWN"; exit 1; fi
        ;;
    --status)
        echo "── LiteLLM failsafe status ──"
        [[ -f "$HEALTH_FILE" ]] && jq . "$HEALTH_FILE" || echo "(no health file yet)"
        echo "── restarts in last $((BUDGET_WINDOW/60))m: $(restarts_in_window)/$BUDGET_MAX ──"
        [[ -f "$LEDGER" ]] && { echo "── last 5 incidents ──"; tail -5 "$LEDGER"; }
        exit 0
        ;;
    --reset)
        acquire_lock
        [[ -f "$LEDGER" ]] && mv "$LEDGER" "$LEDGER.$(date +%Y%m%d-%H%M%S).bak"
        write_health "unknown" "budget reset by operator"
        log "budget reset by operator"
        echo "budget + degraded flag cleared"
        exit 0
        ;;
    --force) FORCE=1 ;;
    "")      FORCE=0 ;;
    -h|--help) sed -n '1,45p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 64 ;;
esac

acquire_lock

if [[ "${FORCE:-0}" != "1" ]] && probe; then
    write_health "up" "liveliness ok"
    exit 0
fi

# ── DOWN ───────────────────────────────────────────────────────────────────
log "DOWN: probe failed at $LITELLM_URL$PROBE_PATH"
CRASH=$(capture_evidence)                       # evidence FIRST, always
log "evidence captured → $CRASH"
record_incident "down" "probe failed" "$CRASH"

USED=$(restarts_in_window)
if [[ "$USED" -ge "$BUDGET_MAX" ]]; then
    # CIRCUIT BREAK. Deliberately does NOT restart. Restarting a service that has
    # already died $BUDGET_MAX times in $BUDGET_WINDOW seconds would keep the
    # pipeline nominally green while the real fault goes undiagnosed — the exact
    # laundering the guardrails prohibit. The approach needs redesign, not another
    # respawn.
    write_health "degraded" "restart budget exhausted ($USED/$BUDGET_MAX in $((BUDGET_WINDOW/60))m) — NOT restarting"
    record_incident "circuit_break" "budget exhausted: $USED restarts in $((BUDGET_WINDOW/60))m" "$CRASH"
    alert "LiteLLM crash-looping — failsafe STOPPED restarting" \
          "$USED restarts in $((BUDGET_WINDOW/60))m. L5 Graphiti ingestion is DOWN for all Archons until this is diagnosed. Evidence: $CRASH"
    log "CIRCUIT BREAK — suppressed restart, alerted"
    exit 3
fi

log "restarting (budget $((USED+1))/$BUDGET_MAX)"
record_incident "restart" "attempt $((USED+1))/$BUDGET_MAX" "$CRASH"
if ! restart_service; then
    write_health "restart_failed" "could not respawn tmux window"
    alert "LiteLLM restart FAILED" "Could not respawn ${TMUX_SESSION}:${WINDOW}. Evidence: $CRASH"
    exit 2
fi

WAITED=$(wait_for_health)
if [[ $? -eq 0 ]]; then
    write_health "up" "recovered after restart in ${WAITED}s"
    record_incident "recovered" "healthy after ${WAITED}s"
    log "recovered after ${WAITED}s"
    exit 0
fi

write_health "restart_failed" "did not become healthy within ${STARTUP_GRACE}s"
record_incident "restart_failed" "no health within ${STARTUP_GRACE}s" "$CRASH"
alert "LiteLLM restarted but did not recover" \
      "No health within ${STARTUP_GRACE}s. L5 Graphiti ingestion is DOWN for all Archons. Evidence: $CRASH"
exit 2
