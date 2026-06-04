#!/usr/bin/env bash
# nexus-settings.sh — Runtime settings reader for Nexus executors
#
# Reads .claude/jobs/state/nexus-settings.json for risk gates, timing
# overrides, and turbo mode state.
#
# Fallback chain for risk gate defaults:
#   1. nexus-settings.json  — runtime overrides (dashboard-mutable)
#   2. risk-policy.yaml     — canonical policy defaults (git-tracked)
#   3. Hardcoded bash       — last resort if python3 unavailable
#
# Policy defaults live in risk-policy.yaml. Edit that file to change defaults.
# Edit nexus-settings.json (via dashboard) for temporary runtime overrides.
#
# Usage:
#   source "$(dirname "$0")/lib/nexus-settings.sh"
#   ns_get_risk_gate task-executor auto_execute   # → "risk:safe"
#   ns_get_timing task-executor                    # → "2"
#   ns_is_turbo_active && echo "turbo!"
#
# Requires: jq
# Last updated: 2026-03-15

# Guard against double-sourcing
[ -n "${_NEXUS_SETTINGS_SH_LOADED:-}" ] && return 0
_NEXUS_SETTINGS_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_NS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_NS_SETTINGS_FILE="${NEXUS_SETTINGS_FILE:-${_NS_SCRIPT_DIR}/../state/nexus-settings.json}"
_NS_POLICY_FILE="${NEXUS_POLICY_FILE:-${_NS_SCRIPT_DIR}/risk-policy.yaml}"
_NS_AUDIT_FILE="${_NS_SCRIPT_DIR}/../../data/nexus-settings-audit.jsonl"

# Check jq availability once at source time
_NS_HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
  _NS_HAS_JQ=true
fi

# Check python3 availability once at source time (for YAML policy reads)
_NS_HAS_PYTHON=false
if command -v python3 >/dev/null 2>&1; then
  _NS_HAS_PYTHON=true
fi

# ============================================================================
# Internal helpers
# ============================================================================

# Read risk gate values from risk-policy.yaml.
# Usage: _ns_read_policy <executor> <bucket>
# Outputs one label per line. Returns 1 if unavailable.
_ns_read_policy() {
  local executor="$1" bucket="$2"
  if [ "$_NS_HAS_PYTHON" = "false" ]; then
    return 1
  fi
  if [ ! -f "$_NS_POLICY_FILE" ]; then
    return 1
  fi
  python3 - "$_NS_POLICY_FILE" "$executor" "$bucket" 2>/dev/null <<'PYEOF'
import sys, yaml
policy_file, executor, bucket = sys.argv[1], sys.argv[2], sys.argv[3]
with open(policy_file) as f:
    policy = yaml.safe_load(f)
executors = (policy or {}).get("executors", {})
exe_config = executors.get(executor, {})
bucket_values = exe_config.get(bucket, [])
for v in (bucket_values or []):
    print(v)
PYEOF
}

# Read a jq expression from the settings file.
# Returns empty string on any failure (missing file, bad JSON, jq error).
_ns_read() {
  local expr="$1"
  if [ "$_NS_HAS_JQ" = "false" ]; then
    return 1
  fi
  if [ ! -f "$_NS_SETTINGS_FILE" ]; then
    return 1
  fi
  jq -r "$expr // empty" "$_NS_SETTINGS_FILE" 2>/dev/null
}

# Read a jq expression, returning raw output (for arrays).
_ns_read_raw() {
  local expr="$1"
  if [ "$_NS_HAS_JQ" = "false" ]; then
    return 1
  fi
  if [ ! -f "$_NS_SETTINGS_FILE" ]; then
    return 1
  fi
  jq -r "$expr" "$_NS_SETTINGS_FILE" 2>/dev/null
}

# Log a warning (uses log_warning if available, else stderr)
_ns_warn() {
  if type log_warning &>/dev/null; then
    log_warning "[nexus-settings] $1"
  else
    echo "[nexus-settings] WARNING: $1" >&2
  fi
}

# Append an audit entry
_ns_audit() {
  local action="$1" actor="$2" detail="$3"
  if [ "$_NS_HAS_JQ" = "true" ]; then
    mkdir -p "$(dirname "$_NS_AUDIT_FILE")"
    jq -nc \
      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg action "$action" \
      --arg actor "$actor" \
      --arg detail "$detail" \
      '{timestamp: $ts, action: $action, actor: $actor, detail: $detail}' \
      >> "$_NS_AUDIT_FILE" 2>/dev/null
  fi

  # Unified audit log (lazy-source guard — nexus-settings.sh may be loaded without common.sh)
  if ! declare -f log_audit >/dev/null 2>&1; then
    source "${_NS_SCRIPT_DIR}/audit-log.sh" 2>/dev/null || return 0
  fi
  local audit_action="config.changed"
  case "$action" in
    turbo_activate) audit_action="config.turbo_activated" ;;
    turbo_deactivate|turbo_revert) audit_action="config.turbo_deactivated" ;;
    timing_update) audit_action="config.changed" ;;
  esac
  local audit_entity_id="$action"
  case "$action" in
    turbo_activate|turbo_deactivate|turbo_revert) audit_entity_id="turbo.mode" ;;
    timing_update) audit_entity_id="timing.overrides" ;;
  esac
  local audit_actor="user:${actor}"
  [ "$actor" = "dispatcher" ] && audit_actor="system:dispatcher"
  log_audit "$audit_actor" "$audit_action" "config" "$audit_entity_id" \
      "$(jq -nc --arg detail "$detail" '{detail:$detail}' 2>/dev/null || echo '{}')" 2>/dev/null || true
}

# ============================================================================
# Job Override API
# ============================================================================

# ns_get_job_override <job_name> <key>
# Read a per-job override from job_overrides section.
# Keys: enabled, every_hours, hour, day, max_turns, max_budget_usd, max_daily_budget_usd, timeout_minutes
# Returns the override value or exits 1 if not set.
ns_get_job_override() {
  local job="$1" key="$2"
  _ns_read ".job_overrides[\"$job\"][\"$key\"]"
}

# ============================================================================
# Public API
# ============================================================================

# ns_get_risk_gate <executor> <bucket>
# Returns one risk label per line for the given bucket.
# Buckets: auto_execute, with_approval, block
#
# Fallback chain:
#   1. nexus-settings.json  — runtime overrides (dashboard-mutable)
#   2. risk-policy.yaml     — canonical policy defaults (git-tracked)
#   3. Hardcoded bash       — last resort if python3 unavailable
#
# Example: ns_get_risk_gate task-executor auto_execute → "risk:safe"
ns_get_risk_gate() {
  local executor="$1" bucket="$2"
  local result

  # 1. Try runtime settings (nexus-settings.json)
  result=$(_ns_read_raw ".risk_gates[\"$executor\"][\"$bucket\"] // [] | .[]" 2>/dev/null)
  if [ -n "$result" ]; then
    echo "$result"
    return 0
  fi

  # 2. Try policy file (risk-policy.yaml)
  result=$(_ns_read_policy "$executor" "$bucket")
  if [ -n "$result" ]; then
    echo "$result"
    return 0
  fi

  # 3. Hardcoded last-resort defaults (when python3 is unavailable)
  case "$executor" in
    task-executor)
      case "$bucket" in
        auto_execute)   echo "risk:safe" ;;
        with_approval)  echo "risk:moderate" ;;
        block)          echo "risk:destructive" ;;
      esac
      ;;
    task-executor-infra)
      case "$bucket" in
        auto_execute)   printf "risk:safe\nrisk:moderate\n" ;;
        with_approval)  ;;
        block)          echo "risk:destructive" ;;
      esac
      ;;
    task-research)
      case "$bucket" in
        auto_execute)   printf "risk:safe\nrisk:moderate\n" ;;
        with_approval)  ;;
        block)          echo "risk:destructive" ;;
      esac
      ;;
    security-reviewer)
      case "$bucket" in
        auto_execute)   printf "risk:safe\nrisk:moderate\n" ;;
        with_approval)  ;;
        block)          echo "risk:destructive" ;;
      esac
      ;;
  esac
}

# ns_check_risk_allowed <executor> <labels>
# Returns 0 if the task's risk level is in auto_execute (or pipeline:approved overrides).
# Returns 1 if blocked, 2 if needs approval.
ns_check_risk_allowed() {
  local executor="$1" labels="$2"

  # pipeline:approved always overrides risk gates
  if echo "$labels" | grep -q 'pipeline:approved'; then
    return 0
  fi

  # Get the risk label from the task
  local risk_label
  risk_label=$(echo "$labels" | grep -o 'risk:[a-z]*' | head -1)
  [ -z "$risk_label" ] && return 0  # no risk label = allow

  # Safety floor: risk:destructive can NEVER be in auto_execute
  if [ "$risk_label" = "risk:destructive" ]; then
    local blocked
    blocked=$(ns_get_risk_gate "$executor" "block")
    if echo "$blocked" | grep -q "$risk_label"; then
      return 1
    fi
  fi

  # Check auto_execute bucket
  local auto
  auto=$(ns_get_risk_gate "$executor" "auto_execute")
  if echo "$auto" | grep -q "$risk_label"; then
    return 0
  fi

  # Check with_approval bucket
  local approval
  approval=$(ns_get_risk_gate "$executor" "with_approval")
  if echo "$approval" | grep -q "$risk_label"; then
    return 2
  fi

  # Check block bucket
  local block
  block=$(ns_get_risk_gate "$executor" "block")
  if echo "$block" | grep -q "$risk_label"; then
    return 1
  fi

  # Unknown risk level — default to needs approval
  return 2
}

# ns_get_timing <executor>
# Returns the every_hours value for the executor. Empty if not set.
ns_get_timing() {
  local executor="$1"
  local result
  result=$(_ns_read ".timing[\"$executor\"].every_hours")
  if [ -n "$result" ] && [ "$result" != "null" ]; then
    echo "$result"
    return 0
  fi
  # No fallback — caller should fall back to registry.yaml
  return 1
}

# ns_is_turbo_active
# Returns 0 if turbo mode is active and not expired, 1 otherwise.
ns_is_turbo_active() {
  local active
  active=$(_ns_read ".turbo.active")
  if [ "$active" != "true" ]; then
    return 1
  fi

  # Check expiry
  local expires_at
  expires_at=$(_ns_read ".turbo.expires_at")
  if [ -n "$expires_at" ] && [ "$expires_at" != "null" ]; then
    local expires_epoch now_epoch
    expires_epoch=$(date -d "$expires_at" +%s 2>/dev/null || echo 0)
    now_epoch=$(date +%s)
    if [ "$now_epoch" -ge "$expires_epoch" ]; then
      return 1  # Expired
    fi
  fi

  return 0
}

# ns_revert_turbo
# Deactivates turbo mode and restores default timing.
ns_revert_turbo() {
  if [ "$_NS_HAS_JQ" = "false" ] || [ ! -f "$_NS_SETTINGS_FILE" ]; then
    _ns_warn "Cannot revert turbo — settings file unavailable"
    return 1
  fi

  local tmp_file="${_NS_SETTINGS_FILE}.tmp"

  # Read default_timing and write it back to timing, deactivate turbo
  jq '
    .timing = (.turbo.default_timing // .timing) |
    .turbo.active = false |
    .turbo.expires_at = null |
    .turbo.mode = null |
    .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ")) |
    .updated_by = "dispatcher-auto-revert"
  ' "$_NS_SETTINGS_FILE" > "$tmp_file" 2>/dev/null && mv "$tmp_file" "$_NS_SETTINGS_FILE"

  _ns_audit "turbo_revert" "dispatcher" "Turbo expired, reverted to default timing"
  _ns_warn "Turbo mode expired — reverted to default timing"
}

# ns_activate_turbo <duration_hours> [actor] [interval_hours]
# Captures current timing as default, sets fast intervals, activates turbo.
# interval_hours defaults to 0.5 (30min). Use 0.25 for turbo+ (15min).
ns_activate_turbo() {
  local duration_hours="$1"
  local actor="${2:-cli}"
  local interval_hours="${3:-0.5}"

  if [ "$_NS_HAS_JQ" = "false" ] || [ ! -f "$_NS_SETTINGS_FILE" ]; then
    _ns_warn "Cannot activate turbo — settings file unavailable"
    return 1
  fi

  local expires_at
  expires_at=$(date -u -d "+${duration_hours} hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
  if [ -z "$expires_at" ]; then
    _ns_warn "Failed to calculate expiry time"
    return 1
  fi

  # Determine mode based on interval
  local mode="turbo"
  if [ "$(echo "$interval_hours <= 0.25" | bc -l 2>/dev/null)" = "1" ]; then
    mode="turbo+"
  fi

  local tmp_file="${_NS_SETTINGS_FILE}.tmp"

  jq \
    --arg expires "$expires_at" \
    --arg actor "$actor" \
    --arg mode "$mode" \
    --argjson interval "$interval_hours" \
    '
    # Only capture default_timing if not already in turbo
    (if .turbo.active != true then .timing else .turbo.default_timing end) as $defaults |
    .turbo.default_timing = $defaults |
    .turbo.active = true |
    .turbo.expires_at = $expires |
    .turbo.mode = $mode |
    .timing = {
      "task-executor": { "every_hours": $interval },
      "task-executor-infra": { "every_hours": $interval },
      "task-research": { "every_hours": $interval }
    } |
    .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ")) |
    .updated_by = $actor
    ' "$_NS_SETTINGS_FILE" > "$tmp_file" 2>/dev/null && mv "$tmp_file" "$_NS_SETTINGS_FILE"

  _ns_audit "turbo_activate" "$actor" "Mode: ${mode}, interval: ${interval_hours}h, duration: ${duration_hours}h, expires: ${expires_at}"
}

# ns_deactivate_turbo [actor]
# Immediately reverts turbo mode.
ns_deactivate_turbo() {
  local actor="${1:-cli}"

  if [ "$_NS_HAS_JQ" = "false" ] || [ ! -f "$_NS_SETTINGS_FILE" ]; then
    _ns_warn "Cannot deactivate turbo — settings file unavailable"
    return 1
  fi

  local tmp_file="${_NS_SETTINGS_FILE}.tmp"

  jq \
    --arg actor "$actor" \
    '
    .timing = (.turbo.default_timing // .timing) |
    .turbo.active = false |
    .turbo.expires_at = null |
    .turbo.mode = null |
    .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ")) |
    .updated_by = $actor
    ' "$_NS_SETTINGS_FILE" > "$tmp_file" 2>/dev/null && mv "$tmp_file" "$_NS_SETTINGS_FILE"

  _ns_audit "turbo_deactivate" "$actor" "Immediate deactivation"
}

# ns_update_timing <executor> <every_hours> [actor]
# Updates timing for a single executor.
ns_update_timing() {
  local executor="$1" every_hours="$2" actor="${3:-cli}"

  if [ "$_NS_HAS_JQ" = "false" ] || [ ! -f "$_NS_SETTINGS_FILE" ]; then
    return 1
  fi

  local tmp_file="${_NS_SETTINGS_FILE}.tmp"

  jq \
    --arg exe "$executor" \
    --argjson hours "$every_hours" \
    --arg actor "$actor" \
    '
    .timing[$exe].every_hours = $hours |
    .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%SZ")) |
    .updated_by = $actor
    ' "$_NS_SETTINGS_FILE" > "$tmp_file" 2>/dev/null && mv "$tmp_file" "$_NS_SETTINGS_FILE"

  _ns_audit "timing_update" "$actor" "$executor → ${every_hours}h"
}

# ============================================================================
# Task-Type Gate Overrides
# ============================================================================

# ns_get_task_type_override <type_label>
# Returns gate action (auto_execute/with_approval/block) or empty if no override.
# Example: ns_get_task_type_override "type:research" → "auto_execute"
ns_get_task_type_override() {
  local type_label="$1"
  local type_name="${type_label#type:}"
  _ns_read ".task_type_overrides[\"$type_name\"].gate"
}

# ns_get_task_type_max_risk <type_label>
# Returns max risk for the type override, or empty.
ns_get_task_type_max_risk() {
  local type_label="$1"
  local type_name="${type_label#type:}"
  _ns_read ".task_type_overrides[\"$type_name\"].max_risk"
}

# ============================================================================
# AI David Confidence Thresholds
# ============================================================================

# ns_get_ai_david_thresholds
# Returns the full thresholds JSON block for prompt injection.
# Empty output if no thresholds configured.
ns_get_ai_david_thresholds() {
  _ns_read_raw ".ai_david_thresholds // empty"
}
