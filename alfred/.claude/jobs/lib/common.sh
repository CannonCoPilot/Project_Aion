#!/usr/bin/env bash
# common.sh — Shared utilities for the headless job engine
#
# Source this at the top of any script that needs registry access,
# colored logging, or yq. Expects JOBS_DIR to be set by the caller.
#
# Provides:
#   Colors: RED, GREEN, YELLOW, BLUE, CYAN, NC (auto-disabled when not a tty)
#   Logging: log(), log_info(), log_success(), log_warning(), log_error()
#   Registry: require_yq(), reg_get()
#   Variables: YQ (set after require_yq), REGISTRY (set from JOBS_DIR)

# Guard against double-sourcing
[ -n "${_COMMON_SH_LOADED:-}" ] && return 0
_COMMON_SH_LOADED=1

# ============================================================================
# Pulse service authentication
# ============================================================================

# Load Nexus service token for Pulse API auth (used by pulse-api.sh and direct curl calls)
if [[ -z "${PULSE_SERVICE_TOKEN:-}" ]]; then
  PULSE_SERVICE_TOKEN="${PULSE_NEXUS_TOKEN:-}"
  if [[ -z "$PULSE_SERVICE_TOKEN" && -f "$HOME/.config/automation/pulse-nexus-token" ]]; then
    PULSE_SERVICE_TOKEN="$(cat "$HOME/.config/automation/pulse-nexus-token")"
  fi
  export PULSE_SERVICE_TOKEN
fi

# ============================================================================
# Colors (auto-disable when piped)
# ============================================================================

# shellcheck disable=SC2034 # Colors exported for use by sourcing scripts
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' NC=''
fi

# ============================================================================
# Logging
# ============================================================================

# Structured JSON log file (Loki-compatible)
# Set LOG_COMPONENT before sourcing to identify the script (e.g., LOG_COMPONENT="dispatcher")
# Set LOG_JSON_FILE to override the default log path
_LOG_COMPONENT="${LOG_COMPONENT:-nexus}"
_LOG_JSON_DIR="${JOBS_DIR:+${JOBS_DIR}/../../.claude/logs/headless}"
_LOG_JSON_FILE="${LOG_JSON_FILE:-${_LOG_JSON_DIR:+${_LOG_JSON_DIR}/nexus.jsonl}}"

# Write a structured JSON log line (Loki-compatible)
# Usage: _log_json "info" "message text" [extra_key=extra_val ...]
_log_json() {
    [ -z "$_LOG_JSON_FILE" ] && return 0
    local level="$1" msg="$2"
    shift 2
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Build extra fields
    local extra=""
    for kv in "$@"; do
        local k="${kv%%=*}" v="${kv#*=}"
        extra="${extra},\"${k}\":\"${v}\""
    done
    printf '{"ts":"%s","level":"%s","component":"%s","job":"%s","msg":"%s"%s}\n' \
        "$ts" "$level" "$_LOG_COMPONENT" "${JOB_NAME:-$_LOG_COMPONENT}" \
        "$(echo "$msg" | sed 's/"/\\"/g' | head -c 500)" \
        "$extra" >> "$_LOG_JSON_FILE" 2>/dev/null
}

# Base log — callers can override for tee-to-file behavior
# Now dual-writes: human-readable to stdout + JSON to log file
log() {
    [ "${QUIET:-false}" = "true" ] || echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
    # Strip ANSI codes for JSON
    local clean_msg
    clean_msg=$(echo "$1" | sed 's/\x1b\[[0-9;]*m//g')
    _log_json "info" "$clean_msg"
}
log_info() {
    [ "${QUIET:-false}" = "true" ] || echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${BLUE}INFO${NC}: $1"
    _log_json "info" "$1"
}
log_success() {
    [ "${QUIET:-false}" = "true" ] || echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${GREEN}OK${NC}: $1"
    _log_json "info" "$1" "status=ok"
}
log_warning() {
    [ "${QUIET:-false}" = "true" ] || echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${YELLOW}WARN${NC}: $1"
    _log_json "warn" "$1"
}
log_error() {
    echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${RED}ERROR${NC}: $1" >&2
    _log_json "error" "$1"
}
log_debug() {
    # Only emits when LOG_LEVEL=debug (or NEXUS_DEBUG=1). Writes to stdout + JSONL.
    if [[ "${LOG_LEVEL:-}" == "debug" || "${NEXUS_DEBUG:-0}" == "1" ]]; then
        [ "${QUIET:-false}" = "true" ] || echo -e "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${CYAN}DEBUG${NC}: $1"
        _log_json "debug" "$1"
    fi
}

# Run a command and log on failure without aborting.
# Usage: try_or_warn "description" command arg1 arg2 ...
# Replaces `command ... || true` — makes failures visible in logs.
try_or_warn() {
    local desc="$1"; shift
    local err_output
    if ! err_output=$("$@" 2>&1); then
        log_warning "Failed: $desc — ${err_output:-(no output)}"
        return 0
    fi
}

# ============================================================================
# yq dependency
# ============================================================================

require_yq() {
    for yq_path in "yq" "$HOME/.local/bin/yq" "/usr/local/bin/yq" "/snap/bin/yq"; do
        if command -v "$yq_path" &>/dev/null 2>&1 || [ -x "$yq_path" ]; then
            echo "$yq_path"
            return 0
        fi
    done
    log_error "yq is required. Install: wget -qO ~/.local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && chmod +x ~/.local/bin/yq"
    exit 1
}

# ============================================================================
# Registry access
# ============================================================================

# Read a value from registry.yaml for a given job, with fallback to defaults.
# Uses explicit null check instead of yq's // operator because // treats
# 'false' as falsy and skips it.
reg_get() {
    local job="$1" key="$2" default="${3:-}"
    local val
    val=$("$YQ" ".jobs.${job}.${key}" "$REGISTRY" 2>/dev/null)
    if [ -z "$val" ] || [ "$val" = "null" ]; then
        val=$("$YQ" ".defaults.${key}" "$REGISTRY" 2>/dev/null)
    fi
    if [ -z "$val" ] || [ "$val" = "null" ]; then
        echo "$default"
    else
        echo "$val"
    fi
}

# ============================================================================
# Unified Audit Log
# ============================================================================

# Source audit-log.sh — provides log_audit() for structured event tracking
# All scripts that source common.sh get audit logging automatically.
source "${BASH_SOURCE[0]%/*}/audit-log.sh" 2>/dev/null || true

# Source decision-log.sh — provides log_decision() for branching-decision rationale.
# Phase 5.5 of nexus observability. Dual-writes JSONL + POST /audit/decisions.
source "${BASH_SOURCE[0]%/*}/decision-log.sh" 2>/dev/null || true
