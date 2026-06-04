#!/usr/bin/env bash
# Dispatcher Watchdog
#
# Checks if the dispatcher heartbeat file is stale (>20 minutes old).
# Uses tiered escalation: warning (dashboard) on first detection,
# critical (Telegram) after 3 consecutive stale checks (~50 min).
#
# The dispatcher touches state/dispatcher-heartbeat every 5-minute cycle.
# If this file is missing or older than 20 minutes, something is wrong.
#
# Created: 2026-03-04
# Updated: 2026-04-01 — tiered escalation to reduce mobile alert noise

set -euo pipefail

# Ensure user-local binaries are available in cron's minimal PATH
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEARTBEAT_FILE="$SCRIPT_DIR/state/dispatcher-heartbeat"
ALERT_THROTTLE_FILE="$SCRIPT_DIR/state/watchdog-last-alert"
STALE_COUNT_FILE="$SCRIPT_DIR/state/watchdog-stale-count"
STALE_THRESHOLD_MINUTES=20
ALERT_THROTTLE_HOURS=4
CRITICAL_ESCALATION_COUNT=3  # consecutive stale checks before critical (3 x 15min = ~45min)

# Portable mtime: macOS uses stat -f %m, GNU/Linux uses stat -c %Y
file_mtime() {
    stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

# Check if heartbeat file exists
if [ ! -f "$HEARTBEAT_FILE" ]; then
    echo "[watchdog] Heartbeat file missing: $HEARTBEAT_FILE"
    STALE=true
else
    # Check age of heartbeat file
    NOW=$(date +%s)
    HEARTBEAT_AGE=$(file_mtime "$HEARTBEAT_FILE")
    AGE_MINUTES=$(( (NOW - HEARTBEAT_AGE) / 60 ))

    if [ "$AGE_MINUTES" -gt "$STALE_THRESHOLD_MINUTES" ]; then
        echo "[watchdog] Dispatcher heartbeat stale: ${AGE_MINUTES}m old (threshold: ${STALE_THRESHOLD_MINUTES}m)"
        STALE=true
    else
        echo "[watchdog] OK: Heartbeat age ${AGE_MINUTES}m (threshold: ${STALE_THRESHOLD_MINUTES}m)"
        STALE=false
    fi
fi

MSGBUS="$SCRIPT_DIR/lib/msgbus.sh"

if [ "$STALE" = "true" ]; then
    # Increment consecutive stale counter
    STALE_COUNT=$(cat "$STALE_COUNT_FILE" 2>/dev/null || echo 0)
    STALE_COUNT=$((STALE_COUNT + 1))
    echo "$STALE_COUNT" > "$STALE_COUNT_FILE"

    # Determine severity and whether to alert
    SHOULD_ALERT=false
    SEVERITY="warning"

    if [ "$STALE_COUNT" -eq 1 ]; then
        # First detection: warning (dashboard only)
        SEVERITY="warning"
        SHOULD_ALERT=true
    elif [ "$STALE_COUNT" -eq "$CRITICAL_ESCALATION_COUNT" ]; then
        # Sustained staleness: escalate to critical (Telegram)
        SEVERITY="critical"
        SHOULD_ALERT=true
    elif [ "$STALE_COUNT" -gt "$CRITICAL_ESCALATION_COUNT" ]; then
        # Extended outage: critical with throttle
        SEVERITY="critical"
        SHOULD_ALERT=true
        if [ -f "$ALERT_THROTTLE_FILE" ]; then
            LAST_ALERT=$(file_mtime "$ALERT_THROTTLE_FILE")
            NOW=$(date +%s)
            HOURS_SINCE=$(( (NOW - LAST_ALERT) / 3600 ))
            if [ "$HOURS_SINCE" -lt "$ALERT_THROTTLE_HOURS" ]; then
                echo "[watchdog] Critical alert throttled (last sent ${HOURS_SINCE}h ago, threshold: ${ALERT_THROTTLE_HOURS}h)"
                SHOULD_ALERT=false
            fi
        fi
    fi

    if [ "$SHOULD_ALERT" = "true" ]; then
        # Send alert via message bus
        if [ -x "$MSGBUS" ]; then
            "$MSGBUS" send \
                --type notification \
                --source dispatcher-watchdog \
                --severity "$SEVERITY" \
                --data "{\"summary\":\"Nexus dispatcher heartbeat stale (${STALE_COUNT} consecutive checks). Check cron and dispatcher.sh.\",\"stale_count\":$STALE_COUNT}" \
                2>/dev/null || echo "[watchdog] WARNING: Failed to send alert to message bus"
        fi

        # Direct relay fallback only for critical (bus may not relay if dispatcher is down)
        if [ "$SEVERITY" = "critical" ]; then
            RELAY="$SCRIPT_DIR/lib/msg-relay.sh"
            if [ -x "$RELAY" ]; then
                "$RELAY" 2>/dev/null || echo "[watchdog] WARNING: Failed to run msg-relay"
            fi
            touch "$ALERT_THROTTLE_FILE" 2>/dev/null || echo "[watchdog] WARNING: Failed to update throttle file"
        fi

        echo "[watchdog] ALERT ($SEVERITY): Dispatcher stale, check #${STALE_COUNT}, notification sent"
    else
        echo "[watchdog] Dispatcher stale (check #${STALE_COUNT}), no alert needed"
    fi
else
    # Heartbeat is fresh — check if we're recovering from a stale period
    PREV_COUNT=$(cat "$STALE_COUNT_FILE" 2>/dev/null || echo 0)
    if [ "$PREV_COUNT" -gt 0 ]; then
        echo "[watchdog] Dispatcher recovered after ${PREV_COUNT} stale checks"
        if [ -x "$MSGBUS" ]; then
            "$MSGBUS" send \
                --type notification \
                --source dispatcher-watchdog \
                --severity info \
                --data "{\"summary\":\"Nexus dispatcher recovered after ${PREV_COUNT} consecutive stale checks.\",\"stale_count\":0}" \
                2>/dev/null || echo "[watchdog] WARNING: Failed to send recovery notification"
        fi
        rm -f "$STALE_COUNT_FILE"
        rm -f "$ALERT_THROTTLE_FILE"
    fi
    echo "[watchdog] OK: Dispatcher heartbeat is fresh"
fi
