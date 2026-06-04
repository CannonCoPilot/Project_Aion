#!/usr/bin/env bash
# audit-ingest.sh — cron-safe bash wrapper around audit-ingest.py
#
# Phase 5.3 of Nexus Revamp. Invoked by cron every 15 minutes (T5.3.5 registers
# this as a Nexus job). Replays JSONL spool files into the Postgres audit plane,
# idempotent via byte-offset state tracking. See audit-ingest.py for full docs.
#
# Usage:
#   audit-ingest.sh [python-args...]
#
# Env:
#   PROJECT_DIR         — defaults to parent-of-script/.. (i.e. AIProjects root)
#   PULSE_DB_URL        — full connection string (overrides decomposed vars below)
#   PULSE_DB_PASSWORD   — used if PULSE_DB_URL is unset
#   AUDIT_INGEST_PYTHON — python interpreter (default: /usr/bin/env python3)
#
# Exit codes from audit-ingest.py propagate. Also logs to
# .claude/logs/audit-ingest.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PROJECT_DIR = parent-of-jobs directory (i.e. .claude/..)
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export PROJECT_DIR

PYTHON_BIN="${AUDIT_INGEST_PYTHON:-}"
# Auto-discover a python interpreter that has psycopg2 installed.
# Prefer Pulse's venv (already has psycopg2-binary), fall back to system python3.
if [ -z "$PYTHON_BIN" ]; then
    if [ -x "$HOME/Code/pulse/.venv/bin/python" ]; then
        PYTHON_BIN="$HOME/Code/pulse/.venv/bin/python"
    elif [ -x "/home/user/Code/pulse/.venv/bin/python" ]; then
        PYTHON_BIN="/home/user/Code/pulse/.venv/bin/python"
    else
        PYTHON_BIN="python3"
    fi
fi
INGEST_PY="$SCRIPT_DIR/audit-ingest.py"

# Source Pulse .env for DB credentials (avoids putting PULSE_DB_PASSWORD in crontab).
# The .env file lives alongside the Pulse repo; set PULSE_ENV_FILE to override.
PULSE_ENV_FILE="${PULSE_ENV_FILE:-$HOME/Code/pulse/.env}"
if [ -z "${PULSE_DB_PASSWORD:-}" ] && [ -r "$PULSE_ENV_FILE" ]; then
    # Only export the three DB vars we care about; ignore everything else in .env
    while IFS='=' read -r key val; do
        case "$key" in
            PULSE_DB_PASSWORD|PULSE_DB_HOST|PULSE_DB_PORT|PULSE_DB_NAME|PULSE_DB_USER)
                # Strip surrounding quotes if present
                val="${val%\"}"; val="${val#\"}"
                val="${val%\'}"; val="${val#\'}"
                export "$key=$val"
                ;;
        esac
    done < <(grep -E '^PULSE_DB_(PASSWORD|HOST|PORT|NAME|USER)=' "$PULSE_ENV_FILE")
fi

if [ ! -f "$INGEST_PY" ]; then
    echo "[audit-ingest.sh] ERROR: $INGEST_PY not found" >&2
    exit 1
fi

# Pass through all args; default to --all when no args given
if [ "$#" -eq 0 ]; then
    set -- --all
fi

exec "$PYTHON_BIN" "$INGEST_PY" "$@"
