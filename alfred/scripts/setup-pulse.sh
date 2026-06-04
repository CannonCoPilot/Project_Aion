#!/usr/bin/env bash
# setup-pulse.sh — Configure and deploy Pulse task service for AIFred-Pro
#
# This script:
#   1. Detects if a Pulse instance is already running (local or remote)
#   2. Offers to connect to an existing instance or deploy a bundled one
#   3. Generates .env from .env.template with user-supplied values
#   4. Validates the configuration before writing
#
# Usage:
#   bash scripts/setup-pulse.sh
#   bash scripts/setup-pulse.sh --non-interactive  # use defaults / env vars

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIFRED_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$AIFRED_ROOT/.env"
ENV_TEMPLATE="$AIFRED_ROOT/.env.template"
MODE="${1:-}"
NON_INTERACTIVE="$MODE"

# ─── --check mode: test Pulse health only ─────────────────────────────────────
if [[ "$MODE" == "--check" ]]; then
    port="${PULSE_PORT:-8700}"
    if curl -sf --max-time 3 "http://localhost:${port}/api/v1/health" >/dev/null 2>&1; then
        echo "Pulse healthy on port $port"
        exit 0
    else
        echo "Pulse not responding on port $port" >&2
        exit 1
    fi
fi

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}!${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; }

prompt() {
    local var="$1" prompt_text="$2" default="${3:-}"
    if [[ "$NON_INTERACTIVE" == "--non-interactive" ]]; then
        printf -v "$var" '%s' "${!var:-$default}"
        return
    fi
    local display_default=""
    [[ -n "$default" ]] && display_default=" [${default}]"
    printf "%s%s: " "$prompt_text" "$display_default"
    read -r value
    printf -v "$var" '%s' "${value:-$default}"
}

# ─── Detect existing Pulse instance ───────────────────────────────────────────
detect_pulse() {
    local port="${PULSE_PORT:-8700}"
    if curl -sf --max-time 2 "http://localhost:${port}/api/v1/health" > /dev/null 2>&1; then
        echo "local:${port}"
    elif [[ -n "${PULSE_URL:-}" ]] && curl -sf --max-time 2 "${PULSE_URL}/api/v1/health" > /dev/null 2>&1; then
        echo "remote:${PULSE_URL}"
    else
        echo ""
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo "  AIFred-Pro — Pulse Setup"
    echo "  ─────────────────────────"
    echo ""

    # Check if .env already exists
    if [[ -f "$ENV_FILE" ]]; then
        warn ".env already exists at $ENV_FILE"
        if [[ "$NON_INTERACTIVE" != "--non-interactive" ]]; then
            printf "Overwrite it? [y/N]: "
            read -r answer
            if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
                info "Keeping existing .env. Run 'docker compose up -d' to start services."
                exit 0
            fi
        fi
    fi

    # Detect existing Pulse
    info "Checking for existing Pulse instance..."
    existing=$(detect_pulse)

    if [[ -n "$existing" ]]; then
        local kind="${existing%%:*}"
        local addr="${existing#*:}"
        success "Found existing Pulse instance ($kind: $addr)"
        echo ""
        if [[ "$NON_INTERACTIVE" != "--non-interactive" ]]; then
            printf "Connect to existing instance instead of deploying? [Y/n]: "
            read -r answer
            if [[ "$answer" != "n" && "$answer" != "N" ]]; then
                info "Recording existing Pulse URL in .env..."
                {
                    echo "# Connected to existing Pulse instance"
                    echo "PULSE_URL=${addr}"
                } > "$ENV_FILE"
                success ".env written. AIFred-Pro will use Pulse at ${addr}."
                return
            fi
        fi
    else
        info "No existing Pulse instance found — will configure bundled deployment."
    fi

    echo ""
    info "Configuring bundled Pulse + PostgreSQL deployment..."
    echo ""

    # Collect values
    local PULSE_DB_PASSWORD PULSE_DB_NAME PULSE_DB_USER PULSE_PORT PULSE_LOG_LEVEL AIFRED_PATH PULSE_SOURCE_PATH

    prompt PULSE_DB_PASSWORD "PostgreSQL password for Pulse DB (required)" ""
    if [[ "$NON_INTERACTIVE" == "--non-interactive" && -z "${PULSE_DB_PASSWORD:-}" ]]; then
        PULSE_DB_PASSWORD=$(openssl rand -base64 24)
        warn "Auto-generated PULSE_DB_PASSWORD (non-interactive mode)"
    fi
    while [[ -z "${PULSE_DB_PASSWORD:-}" ]]; do
        error "PULSE_DB_PASSWORD is required."
        prompt PULSE_DB_PASSWORD "PostgreSQL password for Pulse DB" ""
    done

    prompt PULSE_DB_NAME  "Database name"    "pulse"
    prompt PULSE_DB_USER  "Database user"    "pulse"
    prompt PULSE_PORT     "Pulse port"       "8700"
    prompt PULSE_LOG_LEVEL "Log level"       "info"
    prompt AIFRED_PATH    "Absolute path to AIFred-Pro directory" "$AIFRED_ROOT"
    prompt PULSE_SOURCE_PATH "Path to Pulse source (for Docker build)" "./pulse"

    # Write .env
    cat > "$ENV_FILE" <<EOF
# AIFred-Pro — Pulse Configuration
# Generated by scripts/setup-pulse.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Edit this file directly or re-run the setup script to regenerate.

PULSE_DB_PASSWORD="${PULSE_DB_PASSWORD}"
PULSE_DB_NAME="${PULSE_DB_NAME}"
PULSE_DB_USER="${PULSE_DB_USER}"
PULSE_PORT="${PULSE_PORT}"
PULSE_LOG_LEVEL="${PULSE_LOG_LEVEL}"
AIFRED_PATH="${AIFRED_PATH}"
PULSE_SOURCE_PATH="${PULSE_SOURCE_PATH}"
EOF

    chmod 600 "$ENV_FILE"
    success ".env written (permissions: 600)"

    # Validate Pulse source path
    local resolved_source="$PULSE_SOURCE_PATH"
    if [[ "$resolved_source" != /* ]]; then
        resolved_source="$AIFRED_ROOT/$resolved_source"
    fi
    if [[ ! -d "$resolved_source" ]]; then
        warn "Pulse source not found at $resolved_source"
        echo "  Option A: git clone <pulse-repo> $AIFRED_ROOT/pulse"
        echo "  Option B: Set PULSE_SOURCE_PATH in .env to your existing Pulse checkout"
        echo ""
        if [[ "$NON_INTERACTIVE" == "--non-interactive" ]]; then
            error "Cannot proceed without Pulse source in non-interactive mode"
            exit 1
        fi
    fi

    # Offer to start services
    echo ""
    if [[ "$NON_INTERACTIVE" == "--non-interactive" ]]; then
        info "Starting services..."
        (cd "$AIFRED_ROOT" && docker compose up -d)
        info "Waiting for Pulse..."
        local elapsed=0
        local healthy=0
        while [[ $elapsed -lt 60 ]]; do
            if curl -sf --max-time 2 "http://localhost:${PULSE_PORT}/api/v1/health" >/dev/null 2>&1; then
                success "Pulse is healthy"
                healthy=1
                break
            fi
            sleep 3
            elapsed=$((elapsed + 3))
        done
        if [[ $healthy -eq 0 ]]; then
            error "Pulse did not become healthy within 60s"
            exit 1
        fi
    else
        printf "Start services now? [Y/n]: "
        read -r answer
        if [[ "$answer" != "n" && "$answer" != "N" ]]; then
            info "Starting services..."
            (cd "$AIFRED_ROOT" && docker compose up -d)
            info "Waiting for Pulse to become healthy..."
            local elapsed=0
            while [[ $elapsed -lt 60 ]]; do
                if curl -sf --max-time 2 "http://localhost:${PULSE_PORT}/api/v1/health" >/dev/null 2>&1; then
                    success "Pulse is healthy"
                    break
                fi
                sleep 3
                elapsed=$((elapsed + 3))
            done
        else
            info "Skipped. Start manually: docker compose up -d"
        fi
    fi

    # Check pulse CLI
    if command -v pulse &>/dev/null; then
        success "pulse CLI found: $(command -v pulse)"
    else
        warn "pulse CLI not found on PATH"
        echo "  Install: pip install pulse-tasks (or add to PATH)"
        echo "  Note: scripts use curl API directly, but CLI is needed for task management"
    fi
    echo ""
}

main "$@"
