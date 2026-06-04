#!/usr/bin/env bash
# start-pulse.sh — Start the Pulse API server
# Usage: bash pulse/start-pulse.sh [--background]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIFRED_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env from AIfred-Pro root
if [[ -f "$AIFRED_ROOT/.env" ]]; then
    set -a
    source "$AIFRED_ROOT/.env"
    set +a
fi

export PULSE_DB_HOST="${PULSE_DB_HOST:-localhost}"
export PULSE_DB_PORT="${PULSE_DB_PORT:-5432}"
export PULSE_DB_NAME="${PULSE_DB_NAME:-pulse}"
export PULSE_DB_USER="${PULSE_DB_USER:-pulse}"
export PULSE_DB_PASSWORD="${PULSE_DB_PASSWORD}"
export PULSE_PORT="${PULSE_PORT:-8700}"

VENV="$SCRIPT_DIR/.venv/bin"
cd "$SCRIPT_DIR"

if [[ "$1" == "--background" ]]; then
    nohup "$VENV/uvicorn" app:app --host 0.0.0.0 --port "$PULSE_PORT" \
        >> "$AIFRED_ROOT/.claude/logs/pulse.log" 2>&1 &
    echo $! > "$SCRIPT_DIR/.pulse.pid"
    echo "Pulse started in background (PID: $(cat "$SCRIPT_DIR/.pulse.pid"), port: $PULSE_PORT)"
else
    exec "$VENV/uvicorn" app:app --host 0.0.0.0 --port "$PULSE_PORT"
fi
