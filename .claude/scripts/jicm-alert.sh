#!/bin/bash
# ============================================================================
# jicm-alert.sh — deliver a JICM ALERT to a durable, human-read sink (sourced)
# ============================================================================
# One delivery path for every JICM logger. Until 2026-10-12 only the watcher's _log delivered;
# jicm-actuate.sh, jicm-retry-drain.sh and jicm-gpu-queue.sh each had their own printf logger
# whose ALERTs went to a log file and nowhere else. The GPU queue then ALERTed 40+ times over
# 2.5 days that NO job could acquire the GPU, and nobody saw one. Hook a logger like this:
#
#     case "$*" in *ALERT*) jicm_deliver_alert "$*" ;; esac
#
# Moved here unchanged in behaviour from jicm-watcher.sh's _deliver_alert:
# - Sink is the w0 inbox (proven bidirectional), not a new channel nobody reads.
# - --no-nudge is REQUIRED: the nudge types into a live pane, and W0 is Sir's session. An alert
#   storm would inject text over his work and could destroy an unsent line (TRAP 16).
# - Deduped by a hash of the message with digits stripped, so "605s behind" and "612s behind"
#   are one condition, not one delivery per poll.
# - Best-effort and bounded: delivery must never wedge or fail its caller.
# ============================================================================

jicm_deliver_alert() {
    local msg="$1"
    local pd="${PROJECT_DIR:-$HOME/Claude/Project_Aion}"
    local inbox="$pd/.claude/scripts/aion-inbox.sh"
    local to="${JICM_ALERT_INBOX_KEY:-w0}" dedup="${JICM_ALERT_DEDUP_SEC:-21600}"
    local tbin="${JICM_TIMEOUT_BIN:-${TIMEOUT_BIN:-}}"
    [[ -f "$inbox" ]] || return 0
    local dir="${JICM_SIGNALS_DIR:-$pd/.claude/context/jicm/signals}/alert-delivered"
    mkdir -p "$dir" 2>/dev/null || return 0
    local key; key=$(printf '%s' "$msg" | sed 's/[0-9]\{1,\}//g' | shasum | cut -c1-16)
    local marker="$dir/$key"
    if [[ -f "$marker" ]]; then
        local age=$(( $(date +%s) - $(stat -f %m "$marker" 2>/dev/null || echo 0) ))
        [[ "$age" -lt "$dedup" ]] && return 0
    fi
    # Marker BEFORE sending: two loggers raising the same ALERT in the same second send once.
    : > "$marker"
    printf '%s\n\n_(raised by %s; deduped for %sh)_\n' "$msg" "${JICM_ALERT_SOURCE:-JICM}" "$(( dedup / 3600 ))" \
      | ${tbin:+"$tbin" 20} bash "$inbox" send "$to" \
          --from "${JICM_ALERT_FROM:-watcher}" --subject "JICM alert" --no-nudge >/dev/null 2>&1 || true
    return 0
}
