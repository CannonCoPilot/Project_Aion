#!/bin/bash
# send-telegram.sh - Send Telegram pager messages for Headless Claude
#
# Telegram is a dumb pager — critical alerts only, with a link to the dashboard.
# All interactive features (buttons, callbacks) have been removed.
# Dashboard is the primary interaction surface.
#
# Usage:
#   send-telegram.sh --message "text"
#   send-telegram.sh --message "text" --parse-mode HTML
#
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from .env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$JOBS_DIR/.env"

# Load .env
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in $ENV_FILE" >&2
    exit 1
fi

API_BASE="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

# Parse arguments
MESSAGE=""
PARSE_MODE="HTML"

while [[ $# -gt 0 ]]; do
    case $1 in
        --message|-m) MESSAGE="$2"; shift 2 ;;
        --parse-mode) PARSE_MODE="$2"; shift 2 ;;
        # Deprecated flags — silently ignored for backward compatibility
        --severity|-s|--job|-j|--question|-q|--options|-o|--question-id) shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [ -z "$MESSAGE" ]; then
    echo "ERROR: --message is required" >&2
    exit 1
fi

# ============================================================================
# Egress payload scan — block secrets from leaving via Telegram
# Patterns sourced from secret-scanner.js and credential-governance.yaml
# Ref: nexus-security-standards.md
# ============================================================================

_EGRESS_PATTERNS=(
    'sk-ant-[a-zA-Z0-9_-]{20,}'          # Anthropic API key
    'sk-[a-zA-Z0-9_-]{40,}'              # OpenAI API key
    'AKIA[A-Z0-9]{16}'                    # AWS access key
    'ghp_[a-zA-Z0-9]{36}'                # GitHub PAT
    'gho_[a-zA-Z0-9]{36}'                # GitHub OAuth
    'glpat-[a-zA-Z0-9_-]{20}'            # GitLab PAT
    'xoxb-[0-9]+-[a-zA-Z0-9]+'           # Slack bot token
    'eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.' # JWT (3-part, 20+ chars per segment)
    'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'       # Private keys (avoid leading dashes parsed as grep flag)
    'TELEGRAM_BOT_TOKEN=[0-9]+:'          # Telegram token assignment
    'MYSQL_ROOT_PASSWORD='                # Database credentials
    'CLIENT_SECRET=[a-zA-Z0-9~_-]{20,}'  # OAuth client secrets (uppercase)
    'client_secret:\s*[a-zA-Z0-9~_-]{20,}' # OAuth client secrets (lowercase YAML)
)

_egress_blocked=false
_egress_matched=""
for _pat in "${_EGRESS_PATTERNS[@]}"; do
    if printf '%s\n' "$MESSAGE" | grep -qP "$_pat" 2>/dev/null; then
        _egress_blocked=true
        _egress_matched="$_pat"
        break
    fi
done

if [ "$_egress_blocked" = "true" ]; then
    # Log the block
    _log_dir="$(dirname "$JOBS_DIR")/logs"
    if [ -d "$_log_dir" ]; then
        printf '{"timestamp":"%s","event":"egress_blocked","channel":"telegram","pattern":"%s","message_preview":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            "$_egress_matched" \
            "$(printf '%s' "$MESSAGE" | head -c 200 | tr '"' "'" | tr '\n' ' ')" \
            >> "$_log_dir/egress-guard.jsonl" 2>/dev/null || true
    fi

    echo "[EGRESS-GUARD] BLOCKED: Telegram message contains sensitive data matching pattern: $_egress_matched" >&2
    echo "[EGRESS-GUARD] Message NOT sent. Review .claude/logs/egress-guard.jsonl" >&2
    exit 1
fi

# Build payload once
PAYLOAD=$(jq -nc \
    --arg chat_id "$TELEGRAM_CHAT_ID" \
    --arg text "$MESSAGE" \
    --arg parse_mode "$PARSE_MODE" \
    '{chat_id: $chat_id, text: $text, parse_mode: $parse_mode}')

# Send message and capture HTTP status
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "${API_BASE}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
    echo "WARNING: Telegram delivery failed (HTTP $HTTP_CODE)" >&2
    exit 1
fi
