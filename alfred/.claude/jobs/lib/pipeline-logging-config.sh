#!/usr/bin/env bash
# pipeline-logging-config.sh — Detailed logging configuration for pipeline tasks
#
# Sources on top of common.sh to add:
#   - LOG_LEVEL support (debug, info, warn, error)
#   - log_debug() for trace-level events
#   - Timestamped log file output via PIPELINE_LOG_FILE
#   - tee-to-file for all log levels when PIPELINE_LOG_FILE is set
#
# Usage:
#   source "$JOBS_DIR/lib/common.sh"
#   source "$JOBS_DIR/lib/pipeline-logging-config.sh"
#
#   PIPELINE_LOG_FILE="/path/to/run-YYYYMMDD-HHMMSS.log"
#   LOG_LEVEL=debug
#
# Created: 2026-05-29 (Task AION-1807da9f)
# Scope: Does NOT modify common.sh — additive extension only.

# Guard against double-sourcing
[ -n "${_PIPELINE_LOGGING_CONFIG_LOADED:-}" ] && return 0
_PIPELINE_LOGGING_CONFIG_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

# Log level: debug < info < warn < error (default: info)
# Set via env: LOG_LEVEL=debug source pipeline-logging-config.sh
LOG_LEVEL="${LOG_LEVEL:-info}"

# When set, all log output is tee'd to this file in addition to stdout/stderr.
# Set before sourcing, e.g.:
#   PIPELINE_LOG_FILE="${LOG_DIR}/run-$(date -u +%Y%m%d-%H%M%S).log"
PIPELINE_LOG_FILE="${PIPELINE_LOG_FILE:-}"

# ============================================================================
# Internal helpers
# ============================================================================

# Numeric level mapping for comparison
_log_level_num() {
    case "${1:-info}" in
        debug) echo 0 ;;
        info)  echo 1 ;;
        warn)  echo 2 ;;
        error) echo 3 ;;
        *)     echo 1 ;;
    esac
}

# Write a line to PIPELINE_LOG_FILE if configured (strips ANSI)
_pipeline_log_file() {
    [ -z "$PIPELINE_LOG_FILE" ] && return 0
    local clean
    clean=$(echo "$1" | sed 's/\x1b\[[0-9;]*m//g')
    echo "$clean" >> "$PIPELINE_LOG_FILE" 2>/dev/null
}

# ============================================================================
# Extended log functions
# ============================================================================

# log_debug — trace-level; only emits when LOG_LEVEL=debug
log_debug() {
    local current_level
    current_level=$(_log_level_num "$LOG_LEVEL")
    [ "$current_level" -gt 0 ] && return 0   # suppress unless debug

    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${CYAN:-}DEBUG${NC:-}: $1"
    [ "${QUIET:-false}" = "true" ] || echo -e "$msg"
    _pipeline_log_file "$msg"
    # Structured JSON (mirrors common.sh _log_json pattern)
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"debug","component":"%s","job":"%s","msg":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            "${_LOG_COMPONENT:-nexus}" \
            "${JOB_NAME:-pipeline}" \
            "$(echo "$1" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

# Override existing log functions to additionally write to PIPELINE_LOG_FILE
# (non-destructive: original function behaviour preserved, file write appended)

_orig_log=$(declare -f log)
log() {
    [ "${QUIET:-false}" = "true" ] || {
        local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
        echo -e "$msg"
        _pipeline_log_file "$msg"
    }
    local clean_msg
    clean_msg=$(echo "$1" | sed 's/\x1b\[[0-9;]*m//g')
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"info","component":"%s","job":"%s","msg":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_LOG_COMPONENT:-nexus}" "${JOB_NAME:-pipeline}" \
            "$(echo "$clean_msg" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

_orig_log_info=$(declare -f log_info)
log_info() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${BLUE:-}INFO${NC:-}: $1"
    [ "${QUIET:-false}" = "true" ] || echo -e "$msg"
    _pipeline_log_file "$msg"
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"info","component":"%s","job":"%s","msg":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_LOG_COMPONENT:-nexus}" "${JOB_NAME:-pipeline}" \
            "$(echo "$1" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

_orig_log_success=$(declare -f log_success)
log_success() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${GREEN:-}OK${NC:-}: $1"
    [ "${QUIET:-false}" = "true" ] || echo -e "$msg"
    _pipeline_log_file "$msg"
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"info","component":"%s","job":"%s","msg":"%s","status":"ok"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_LOG_COMPONENT:-nexus}" "${JOB_NAME:-pipeline}" \
            "$(echo "$1" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

_orig_log_warning=$(declare -f log_warning)
log_warning() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${YELLOW:-}WARN${NC:-}: $1"
    [ "${QUIET:-false}" = "true" ] || echo -e "$msg"
    _pipeline_log_file "$msg"
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"warn","component":"%s","job":"%s","msg":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_LOG_COMPONENT:-nexus}" "${JOB_NAME:-pipeline}" \
            "$(echo "$1" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

_orig_log_error=$(declare -f log_error)
log_error() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ${RED:-}ERROR${NC:-}: $1"
    echo -e "$msg" >&2
    _pipeline_log_file "$msg"
    [ -n "${_LOG_JSON_FILE:-}" ] && \
        printf '{"ts":"%s","level":"error","component":"%s","job":"%s","msg":"%s"}\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${_LOG_COMPONENT:-nexus}" "${JOB_NAME:-pipeline}" \
            "$(echo "$1" | sed 's/"/\\"/g' | head -c 500)" \
            >> "$_LOG_JSON_FILE" 2>/dev/null
}

# ============================================================================
# Startup banner (written to file when PIPELINE_LOG_FILE is set)
# ============================================================================

if [ -n "$PIPELINE_LOG_FILE" ]; then
    mkdir -p "$(dirname "$PIPELINE_LOG_FILE")" 2>/dev/null || true
    {
        echo "=== Pipeline Logging Initialized ==="
        echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "Log file: $PIPELINE_LOG_FILE"
        echo "Log level: $LOG_LEVEL"
        echo "JSONL sink: ${_LOG_JSON_FILE:-(not configured)}"
        echo "Component: ${_LOG_COMPONENT:-nexus}"
        echo "======================================"
    } >> "$PIPELINE_LOG_FILE" 2>/dev/null
fi
