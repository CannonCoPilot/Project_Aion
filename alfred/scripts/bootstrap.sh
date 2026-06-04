#!/usr/bin/env bash
# bootstrap.sh — Master entry point for AIFred-Pro self-bootstrapping setup
#
# Pure bash, no LLM dependency. Idempotent (re-running skips completed steps).
#
# Usage:
#   bash scripts/bootstrap.sh                  # Interactive setup
#   bash scripts/bootstrap.sh --non-interactive # Use defaults, no prompts
#   bash scripts/bootstrap.sh --check          # Validate only, exit 0/1
#   bash scripts/bootstrap.sh --reset          # Print cleanup instructions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIFRED_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$AIFRED_ROOT/.env"
MODE="${1:-}"

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

# Read a value from .env, stripping surrounding quotes
env_val() { local v; v=$(grep -oP "${1}=\K.*" "$ENV_FILE" 2>/dev/null || echo "${2:-}"); echo "${v//\"/}"; }

# ─── Section 0: Tool Prerequisites ───────────────────────────────────────────

check_tools() {
    local missing=0
    for tool in jq python3 curl; do
        if command -v "$tool" &>/dev/null; then
            success "$tool found: $(command -v "$tool")"
        else
            error "$tool not found — required by Nexus job system"
            missing=1
        fi
    done

    if ! command -v yq &>/dev/null && ! [ -x "$HOME/.local/bin/yq" ]; then
        error "yq not found — required by dispatcher/executor"
        echo "  Install: wget -qO ~/.local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && chmod +x ~/.local/bin/yq"
        missing=1
    else
        success "yq found"
    fi

    return $missing
}

# ─── Section 1: Pre-flight ───────────────────────────────────────────────────

check_docker() {
    if ! command -v docker &>/dev/null; then
        error "Docker not installed"
        echo "  Install: https://docs.docker.com/engine/install/"
        return 1
    fi

    if ! docker info &>/dev/null 2>&1; then
        error "Docker installed but daemon not running"
        echo "  Start: sudo systemctl start docker"
        return 1
    fi
    success "Docker Engine running: $(docker --version | head -1)"

    if ! docker compose version &>/dev/null 2>&1; then
        error "Docker Compose V2 not found"
        echo "  Install: sudo apt install docker-compose-plugin"
        return 1
    fi
    success "Docker Compose V2: $(docker compose version --short 2>/dev/null)"
    return 0
}

# ─── Section 1.5: Directory Scaffolding ──────────────────────────────────────

scaffold_dirs() {
    local dirs=(
        "$AIFRED_ROOT/.claude/data"
        "$AIFRED_ROOT/.claude/data/pulse-export"
        "$AIFRED_ROOT/.claude/logs/headless/executions"
        "$AIFRED_ROOT/.claude/jobs/state"
        "$AIFRED_ROOT/.claude/jobs/state/locks"
    )
    for d in "${dirs[@]}"; do
        mkdir -p "$d"
    done
    success "Directory scaffolding complete"
}

# ─── Section 2: Pulse Setup ─────────────────────────────────────────────────

setup_pulse() {
    # Generate .env if missing
    if [[ ! -f "$ENV_FILE" ]]; then
        info "No .env found — running Pulse setup..."
        if [[ "$MODE" == "--non-interactive" ]]; then
            bash "$SCRIPT_DIR/setup-pulse.sh" --non-interactive
        else
            bash "$SCRIPT_DIR/setup-pulse.sh"
        fi
    else
        success ".env exists"
    fi

    # Check PULSE_SOURCE_PATH
    if [[ -f "$ENV_FILE" ]]; then
        local pulse_source
        pulse_source=$(env_val PULSE_SOURCE_PATH "./pulse")
        # Resolve relative path
        if [[ "$pulse_source" != /* ]]; then
            pulse_source="$AIFRED_ROOT/$pulse_source"
        fi
        if [[ ! -d "$pulse_source" ]]; then
            error "Pulse source not found at $pulse_source"
            echo "  Option A: git clone <pulse-repo> $AIFRED_ROOT/pulse"
            echo "  Option B: Set PULSE_SOURCE_PATH in .env to your existing Pulse checkout"
            return 1
        fi
        success "Pulse source found at $pulse_source"
    fi

    # Start Pulse if not running
    local port
    port=$(env_val PULSE_PORT "8700")

    if ! curl -sf --max-time 2 "http://localhost:${port}/api/v1/health" &>/dev/null; then
        info "Starting Pulse services..."
        (cd "$AIFRED_ROOT" && docker compose up -d)

        # Wait loop (max 90s)
        info "Waiting for Pulse to become healthy..."
        local elapsed=0
        while [[ $elapsed -lt 90 ]]; do
            if curl -sf --max-time 2 "http://localhost:${port}/api/v1/health" &>/dev/null; then
                success "Pulse is healthy"
                return 0
            fi
            sleep 3
            elapsed=$((elapsed + 3))
            printf "."
        done
        echo ""
        error "Pulse did not become healthy within 90 seconds"
        echo "  Check logs: docker compose logs pulse"
        return 1
    fi

    success "Pulse is running on port $port"
}

# ─── Section 3: Verify Pulse Health ─────────────────────────────────────────

verify_pulse() {
    local port
    port=$(env_val PULSE_PORT "8700")
    local health
    health=$(curl -sf "http://localhost:${port}/api/v1/health" 2>/dev/null || echo "")
    if [[ -z "$health" ]]; then
        error "Cannot reach Pulse health endpoint"
        return 1
    fi
    local status
    status=$(echo "$health" | jq -r '.status' 2>/dev/null || echo "")
    if [[ "$status" == "ok" ]]; then
        success "Pulse health: ok"
        return 0
    else
        error "Pulse health status: $status"
        echo "  Response: $health"
        return 1
    fi
}

# ─── Section 4: Import Setup Plan ───────────────────────────────────────────

import_plan() {
    local port
    port=$(env_val PULSE_PORT "8700")
    local plan_file="$AIFRED_ROOT/setup-phases/setup-plan.yaml"
    local api="http://localhost:${port}/api/v1"

    if [[ ! -f "$plan_file" ]]; then
        error "Setup plan not found at $plan_file"
        return 1
    fi

    # Check if already imported (search for orchestration-tagged tasks)
    local existing
    existing=$(curl -sf "${api}/tasks?labels=source:orchestration&limit=1" 2>/dev/null || echo "")
    local count
    count=$(echo "$existing" | jq -r '.total // 0' 2>/dev/null || echo "0")

    if [[ "$count" -gt 0 ]]; then
        success "Setup plan already imported ($count tasks found)"
        return 0
    fi

    info "Importing setup plan into Pulse..."
    local yaml_content response
    yaml_content=$(cat "$plan_file")
    response=$(curl -sf -X POST "${api}/projects/import" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg yaml "$yaml_content" \
            --arg actor "bootstrap" \
            --arg filename "setup-plan.yaml" \
            '{yaml_content: $yaml, actor: $actor, source_filename: $filename}')" \
        2>/dev/null || echo "")

    if [[ -z "$response" ]]; then
        error "Failed to import setup plan — no response from Pulse"
        return 1
    fi

    local created linked errors
    created=$(echo "$response" | jq -r '.tasks_created // 0' 2>/dev/null || echo "0")
    linked=$(echo "$response" | jq -r '.tasks_linked // 0' 2>/dev/null || echo "0")
    errors=$(echo "$response" | jq -r 'if (.errors | type) == "array" then (.errors | length) else (.errors // 0) end' 2>/dev/null || echo "0")

    if [[ "$errors" -gt 0 ]]; then
        warn "Import completed with errors: created=$created, linked=$linked, errors=$errors"
        echo "  Response: $response"
    else
        success "Setup plan imported: $created tasks created, $linked linked"
    fi
}

# ─── Section 5: Create Welcome Task ─────────────────────────────────────────

create_welcome_task() {
    local port
    port=$(env_val PULSE_PORT "8700")
    local api="http://localhost:${port}/api/v1"
    local welcome_file="$AIFRED_ROOT/setup-phases/welcome-task.md"

    if [[ ! -f "$welcome_file" ]]; then
        warn "Welcome task file not found at $welcome_file — skipping"
        return 0
    fi

    # Check if already exists (dedup by title)
    local title="Welcome to AIFred Pro — Getting Started"
    local existing
    local encoded_title
    encoded_title=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$title")
    existing=$(curl -sf "${api}/tasks?search=${encoded_title}&limit=1" 2>/dev/null || echo "")
    local count
    count=$(echo "$existing" | jq -r '.total // 0' 2>/dev/null || echo "0")

    if [[ "$count" -gt 0 ]]; then
        success "Welcome task already exists"
        return 0
    fi

    local description
    description=$(cat "$welcome_file")

    local payload
    payload=$(jq -n \
        --arg title "$title" \
        --arg desc "$description" \
        '{title: $title, description: $desc, priority: 1, labels: ["domain:infrastructure", "source:bootstrap"]}')

    local response
    response=$(curl -sf -X POST "${api}/tasks" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null || echo "")

    if [[ -n "$response" ]]; then
        success "Welcome task created"
    else
        warn "Could not create welcome task (Pulse may not support this endpoint)"
    fi
}

# ─── Section 4.5: Gitignore Safety ──────────────────────────────────────────

ensure_gitignore() {
    local gitignore="$AIFRED_ROOT/.gitignore"
    local entries=(".env" ".env.local" "*.secret" ".claude/jobs/.env")
    local added=0

    for entry in "${entries[@]}"; do
        if ! grep -qxF "$entry" "$gitignore" 2>/dev/null; then
            echo "$entry" >> "$gitignore"
            added=1
        fi
    done

    if [[ $added -eq 1 ]]; then
        success "Added credential entries to .gitignore"
    else
        success ".gitignore already has credential entries"
    fi
}

# ─── Section 6: Register Dispatcher Cron ─────────────────────────────────────

register_cron() {
    local cron_entry="*/5 * * * * ${AIFRED_ROOT}/.claude/jobs/dispatcher.sh >> ${AIFRED_ROOT}/.claude/logs/headless/dispatcher.log 2>&1"

    if crontab -l 2>/dev/null | grep -qF "dispatcher.sh"; then
        success "Dispatcher cron already registered"
        return 0
    fi

    if [[ "$MODE" == "--non-interactive" ]]; then
        (crontab -l 2>/dev/null || true; echo "$cron_entry") | crontab -
        success "Dispatcher cron registered (every 5 min)"
    else
        echo ""
        info "Register dispatcher cron job?"
        echo "  Entry: $cron_entry"
        printf "  Add to crontab? [Y/n]: "
        read -r answer
        if [[ "$answer" != "n" && "$answer" != "N" ]]; then
            (crontab -l 2>/dev/null || true; echo "$cron_entry") | crontab -
            success "Dispatcher cron registered"
        else
            warn "Skipped cron registration — add manually later"
        fi
    fi
}

# ─── Section 7: Enable setup-monitor job ─────────────────────────────────────

enable_setup_monitor() {
    local registry="$AIFRED_ROOT/.claude/jobs/registry.yaml"
    if [[ -f "$registry" ]] && grep -q "setup-monitor:" "$registry"; then
        local yq_bin
        yq_bin=$(command -v yq || echo "$HOME/.local/bin/yq")
        if [[ -x "$yq_bin" ]]; then
            "$yq_bin" e '.jobs["setup-monitor"].enabled = true' -i "$registry"
            success "setup-monitor job enabled in registry"
        else
            warn "yq not found — manually set setup-monitor.enabled: true in registry.yaml"
        fi
    fi
}

# ─── --check Mode ─────────────────────────────────────────────────────────────

run_check() {
    echo ""
    echo "  AIFred-Pro — Bootstrap Check"
    echo "  ─────────────────────────────"
    echo ""

    local failures=0

    check_tools || failures=$((failures + 1))
    check_docker || failures=$((failures + 1))

    if [[ -f "$ENV_FILE" ]]; then
        success ".env exists"
    else
        error ".env missing"
        failures=$((failures + 1))
    fi

    local port
    port=$(env_val PULSE_PORT "8700")
    if curl -sf --max-time 2 "http://localhost:${port}/api/v1/health" &>/dev/null; then
        success "Pulse healthy on port $port"
    else
        error "Pulse not responding on port $port"
        failures=$((failures + 1))
    fi

    echo ""
    if [[ $failures -eq 0 ]]; then
        success "All checks passed"
        exit 0
    else
        error "$failures check(s) failed"
        exit 1
    fi
}

# ─── --reset Mode ────────────────────────────────────────────────────────────

run_reset() {
    echo ""
    echo "  AIFred-Pro — Cleanup Instructions"
    echo "  ──────────────────────────────────"
    echo ""
    echo "  To fully remove the bootstrapped setup, run these manually:"
    echo ""
    echo "  1. Stop services:"
    echo "     cd $AIFRED_ROOT && docker compose down -v"
    echo ""
    echo "  2. Remove cron entries:"
    echo "     crontab -l | grep -v 'dispatcher.sh' | grep -v 'event-watcher.sh' | crontab -"
    echo ""
    echo "  3. Remove generated files:"
    echo "     rm -f $ENV_FILE"
    echo ""
    echo "  4. Delete setup tasks from Pulse (if Pulse is running):"
    echo "     curl -X DELETE http://localhost:8700/api/v1/projects/aifred-pro-setup"
    echo ""
    echo "  These instructions are printed only — nothing was executed."
    exit 0
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    case "${MODE}" in
        --check) run_check ;;
        --reset) run_reset ;;
        --non-interactive) ;;  # handled by individual sections
        "") ;;                 # interactive mode
        *) error "Unknown flag: $MODE"; echo "  Usage: bootstrap.sh [--check|--non-interactive|--reset]"; exit 1 ;;
    esac

    echo ""
    echo "  AIFred-Pro — Bootstrap"
    echo "  ───────────────────────"
    echo ""

    # Section 0: Tool prerequisites
    info "Checking tool prerequisites..."
    if ! check_tools; then
        error "Missing required tools — install them and re-run"
        exit 1
    fi
    echo ""

    # Section 1: Docker pre-flight
    info "Checking Docker..."
    if ! check_docker; then
        error "Docker prerequisites not met — install/start Docker and re-run"
        exit 1
    fi
    echo ""

    # Section 1.5: Directory scaffolding
    scaffold_dirs

    # Section 2: Pulse setup
    info "Setting up Pulse..."
    if ! setup_pulse; then
        error "Pulse setup failed"
        exit 1
    fi
    echo ""

    # Section 3: Verify health
    if ! verify_pulse; then
        error "Pulse health check failed"
        exit 1
    fi

    # Section 4: Import plan (non-critical — Pulse is up, tasks can be imported later)
    import_plan || warn "Setup plan import failed — you can import manually later"

    # Section 4.5: Gitignore safety (always run regardless of import result)
    ensure_gitignore

    # Section 5: Welcome task
    create_welcome_task || warn "Welcome task creation skipped"

    # Section 6: Dispatcher cron
    register_cron

    # Section 7: Enable setup-monitor
    enable_setup_monitor || warn "Could not enable setup-monitor job"

    # Summary
    echo ""
    echo "  ─────────────────────────────────────────────"
    echo ""
    success "Bootstrap complete!"
    echo ""
    local port
    port=$(env_val PULSE_PORT "8700")
    echo "  Pulse:      http://localhost:${port}"
    echo "  Tasks:      pulse list --label source:orchestration"
    echo "  Next:       Run 'pulse list' to see your setup tasks"
    echo ""
}

main "$@"
