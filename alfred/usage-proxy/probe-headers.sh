#!/usr/bin/env bash
# Headless Claude probe — captures fresh Anthropic rate-limit headers.
#
# Sends a minimal Haiku query through the usage proxy to populate
# the api_requests table with current unified window state.
#
# Usage:
#   ./probe-headers.sh              # Run once
#   ./probe-headers.sh --startup    # Run once + schedule 2h cron
#
# Called by:
#   - Alfred-Dev stack startup (docker compose up post-hook)
#   - Cron every 2 hours for freshness between active sessions

PROXY_URL="${ANTHROPIC_BASE_URL:-http://localhost:9800}"

# Verify proxy is reachable
if ! curl -sf "$PROXY_URL/health" > /dev/null 2>&1; then
    echo "[probe] Proxy at $PROXY_URL not reachable — skipping"
    exit 0
fi

echo "[probe] Sending minimal Haiku query through proxy at $PROXY_URL..."
ANTHROPIC_BASE_URL="$PROXY_URL" claude -p "pong" --model claude-haiku-4-5-20251001 > /dev/null 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[probe] Success — Anthropic headers captured at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
    echo "[probe] Claude exited with code $EXIT_CODE"
fi

# --startup: register 2-hour cron if not already present
if [ "$1" = "--startup" ]; then
    CRON_CMD="ANTHROPIC_BASE_URL=$PROXY_URL $(cd "$(dirname "$0")" && pwd)/probe-headers.sh"
    if ! crontab -l 2>/dev/null | grep -q "probe-headers.sh"; then
        (crontab -l 2>/dev/null; echo "0 */2 * * * $CRON_CMD >> /tmp/probe-headers.log 2>&1") | crontab -
        echo "[probe] Registered 2-hour cron job"
    else
        echo "[probe] Cron already registered"
    fi
fi
