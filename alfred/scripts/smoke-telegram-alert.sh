#!/bin/bash
# smoke-telegram-alert.sh — End-to-end smoke test for the pipeline-v2 Telegram alert chain.
#
# Validates: notify_msgbus pattern -> lib/msgbus.sh -> lib/msg-relay.sh ->
#            lib/send-telegram.sh -> Telegram API
#
# Surfaced 2026-05-06 by Jarvis post cd0aadd ("feat(notify): pipeline-v2 alert
# dispatch wire-up"). Originally validated dispatch via dry-run boundary, which
# missed the missing notification_preferences.channels.telegram block in
# registry.yaml — empty severity-filter loop made should_deliver_to_telegram()
# always return false. This script exercises the full live path so the gap
# cannot recur silently.
#
# Usage:
#   smoke-telegram-alert.sh                      # default: severity=warning, dry-run msg-relay
#   smoke-telegram-alert.sh --severity critical  # override severity
#   smoke-telegram-alert.sh --live               # actually deliver (fires Telegram + dashboard)
#   smoke-telegram-alert.sh --live --severity critical
#
# Exit codes:
#   0   smoke-test passed (event delivered with the expected channel routing)
#   1   smoke-test failed (event not delivered, or Telegram routing missing on --live)
#   2   pre-flight failed (missing yq/jq, missing .env, or filter config absent)
#
# Output: structured tail of relay.log line proving the per-channel routing decision.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
JOBS_DIR="$REPO_ROOT/.claude/jobs"
MSGBUS="$JOBS_DIR/lib/msgbus.sh"
MSG_RELAY="$JOBS_DIR/lib/msg-relay.sh"
REGISTRY="$JOBS_DIR/registry.yaml"
RELAY_LOG="$REPO_ROOT/.claude/logs/headless/relay.log"
ENV_FILE="$JOBS_DIR/.env"

SEVERITY="warning"
LIVE_MODE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --severity) SEVERITY="$2"; shift 2 ;;
        --live) LIVE_MODE="true"; shift ;;
        -h|--help)
            sed -n '2,30p' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *) echo "ERROR: Unknown option: $1" >&2; exit 2 ;;
    esac
done

# Pre-flight
command -v yq >/dev/null 2>&1 || { echo "ERROR: yq not on PATH" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not on PATH" >&2; exit 2; }
[ -x "$MSGBUS" ] || { echo "ERROR: $MSGBUS not executable" >&2; exit 2; }
[ -x "$MSG_RELAY" ] || { echo "ERROR: $MSG_RELAY not executable" >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE missing (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID expected)" >&2; exit 2; }

# Verify the registry config that gates Telegram delivery is present.
filter_count=$(yq eval '.notification_preferences.channels.telegram.filter.severity | length' "$REGISTRY" 2>/dev/null || echo "0")
if [ "$filter_count" = "0" ] || [ "$filter_count" = "null" ]; then
    echo "ERROR: registry.yaml is missing notification_preferences.channels.telegram.filter.severity" >&2
    echo "       msg-relay.sh:should_deliver_to_telegram will return false for every event." >&2
    exit 2
fi

# Fire the event.
TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SUMMARY="Smoke-test of cd0aadd Telegram chain at $TS_ISO (severity=$SEVERITY, live=$LIVE_MODE). Safe to ignore."
DATA=$(jq -nc --arg s "$SUMMARY" --arg t "$TS_ISO" --arg sev "$SEVERITY" '{summary:$s,test_phase:"smoke-telegram-alert.sh",ts:$t,severity:$sev,sender:"jarvis-smoke-test"}')

EVT_ID=$("$MSGBUS" send --type notification --source "smoke-telegram-alert" --severity "$SEVERITY" --data "$DATA" 2>/dev/null | tail -1)
echo "fired event_id=$EVT_ID severity=$SEVERITY"

# Run relay; capture stdout (works for both dry-run and live; live also tees to relay.log).
if [ "$LIVE_MODE" = "true" ]; then
    RELAY_OUT=$("$MSG_RELAY" 2>&1 || true)
else
    RELAY_OUT=$("$MSG_RELAY" --dry-run 2>&1 || true)
fi

EVENT_LINE=$(echo "$RELAY_OUT" | grep "\[$EVT_ID\]" | tail -1 || true)
if [ -z "$EVENT_LINE" ]; then
    echo "FAIL: msg-relay output did not reference event $EVT_ID" >&2
    echo "$RELAY_OUT" | tail -5 >&2
    exit 1
fi

echo "$EVENT_LINE"

# On --live, require the dashboard+telegram annotation for the test to pass.
if [ "$LIVE_MODE" = "true" ]; then
    if echo "$EVENT_LINE" | grep -q "dashboard+telegram"; then
        echo "PASS: event $EVT_ID delivered to dashboard+telegram"
        exit 0
    else
        echo "FAIL: event $EVT_ID processed but did NOT route to telegram" >&2
        echo "      check registry.yaml notification_preferences and severity filter" >&2
        exit 1
    fi
else
    echo "PASS (dry-run): event $EVT_ID would deliver; rerun with --live to validate Telegram dispatch"
    exit 0
fi
