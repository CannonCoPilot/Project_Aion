#!/usr/bin/env bash
# pipeline-logging-config.sh
# Source this to configure detailed (debug-level) logging for pipeline runs.
# Overrides LOG_LEVEL and sets PIPELINE_LOG_FILE for tee-to-file capture.
#
# Usage:
#   source /path/to/pipeline-logging-config.sh
#   JOBS_DIR=/path/to/jobs source /path/to/lib/common.sh
#
# Environment variables honoured:
#   LOG_LEVEL         — set to "debug" for trace output (default: info)
#   NEXUS_DEBUG       — set to "1" as alias for LOG_LEVEL=debug
#   PIPELINE_LOG_FILE — explicit log file path (default: auto-timestamped)
#   QUIET             — set "true" to suppress stdout (file logging continues)

export LOG_LEVEL="${LOG_LEVEL:-debug}"
export NEXUS_DEBUG="${NEXUS_DEBUG:-1}"

# Resolve writable output dir: prefer /workspace, fall back to local logs
if [[ -w "/workspace/output/pipeline-validation" ]]; then
  _PIPE_LOG_BASE="/workspace/output/pipeline-validation"
else
  _PIPE_LOG_BASE="${HOME}/Claude/Alfred-Dev/.claude/logs/pipeline-validation"
fi
mkdir -p "$_PIPE_LOG_BASE"

export PIPELINE_LOG_FILE="${PIPELINE_LOG_FILE:-${_PIPE_LOG_BASE}/pipeline-logging-$(date -u +%Y%m%d-%H%M%S).log}"

# Tee stdout + stderr to log file when sourced from an interactive pipeline
if [[ "${_PIPELINE_LOGGING_TEE_ACTIVE:-0}" != "1" ]]; then
  export _PIPELINE_LOGGING_TEE_ACTIVE=1
  exec > >(tee -a "$PIPELINE_LOG_FILE") 2>&1
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] INFO: pipeline-logging-config.sh loaded — LOG_LEVEL=${LOG_LEVEL} log=${PIPELINE_LOG_FILE}"
