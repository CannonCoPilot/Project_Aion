#!/usr/bin/env bash
# Nexus Routing Helpers — Bash functions for pipeline routing decisions
#
# Sourced by event-watcher.sh and registry.yaml pre_checks.
# Mirrors routing-rules.yaml — change both when updating routing logic.
#
# Usage:
#   source "$(dirname "$0")/lib/routing-helpers.sh"
#   executor=$(get_executor_for_capability "$cap_label")
#   is_eligible_task_executor "$labels" && echo "eligible"
#   bd_list_exclude "parked,waiting:human" --status open --label stage:queue
#
# Last updated: 2026-03-14

source "$(dirname "${BASH_SOURCE[0]}")/nexus-settings.sh" 2>/dev/null || true
source "$(dirname "${BASH_SOURCE[0]}")/pulse-api.sh" || { echo "ERROR: pulse-api.sh not found" >&2; exit 1; }

# =============================================================================
# BD LIST WITH EXCLUSION — Filter out tasks by label at query time
# =============================================================================
# Wraps pulse_list_tasks to exclude tasks that have any of the specified labels.
# Fetches JSON, filters with jq, then re-formats to human-readable output.
#
# Usage (new — Pulse query params):
#   bd_list_exclude "parked,waiting:human,blocked:dependency" "status=open&label=stage:queue"
#   bd_list_exclude "parked" "status=open&label=waiting:human&limit=500"
#
# Usage (legacy — bd-style flags, auto-converted):
#   bd_list_exclude "parked,waiting:human" --status open --label stage:queue
#
# First arg: comma-separated labels to exclude (tasks with ANY of these are dropped)
# Remaining args: Pulse query params string OR legacy bd-style flags (auto-detected)
#
# Output: human-readable format, one task per line
# Exit code: 0 (even if no tasks match — empty output is valid)

bd_list_exclude() {
  local exclude_csv="$1"; shift

  local query_params=""
  if [[ "${1:-}" == --* ]]; then
    # Legacy bd-style flags: convert --status X --label Y --limit N to query params
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status)  query_params+="status=$2&"; shift 2 ;;
        --label)   query_params+="label=$2&"; shift 2 ;;
        --limit)   query_params+="limit=$2&"; shift 2 ;;
        --json)    shift ;;  # ignored, Pulse always returns JSON
        *)         shift ;;
      esac
    done
    query_params="${query_params%&}"  # strip trailing &
    [ -z "$query_params" ] && query_params="status=open&limit=500"
  else
    query_params="${1:-status=open&limit=500}"
  fi

  pulse_list_tasks "$query_params" 2>/dev/null | jq -r --arg exc "$exclude_csv" '
    ($exc | split(",")) as $excluded |
    [.[] | select(
      (.labels // []) as $labels |
      ($excluded | map(. as $e | $labels | index($e)) | any) | not
    )] |
    .[] |
    "\(if .status == "closed" then "●" elif .status == "in_progress" then "◉" else "○" end) \(.id) [● P\(.priority // 2)] [\(.issue_type // "task")] [\(.labels // [] | join(" "))] - \(.title)"
  '
}

# =============================================================================
# DISPATCH ROUTING — Capability → Executor
# =============================================================================

get_executor_for_assigned() {
  local assigned="$1"
  case "$assigned" in
    assigned:researcher)              echo "task-research" ;;
    assigned:security-reviewer)       echo "security-reviewer" ;;
    assigned:infrastructure-deployer) echo "task-executor-infra" ;;
    assigned:bug-fixer)               echo "bug-fixer" ;;
    assigned:autofix-executor)        echo "task-executor" ;;
    assigned:troubleshooter)          echo "troubleshooter" ;;
    assigned:backend-eng)             echo "backend-eng" ;;
    assigned:db-eng)                  echo "db-eng" ;;
    assigned:ux-eng)                  echo "ux-eng" ;;
    assigned:project-manager)         echo "project-manager" ;;
    assigned:ai-david)                echo "ai-david" ;;
    assigned:task-evaluator)          echo "task-evaluator" ;;
    assigned:task-investigator)       echo "task-investigator" ;;
    *)                                echo "" ;;  # unknown assigned → fall through to capability
  esac
}

get_executor_for_capability() {
  local capability="$1"
  case "$capability" in
    capability:infrastructure)  echo "task-executor-infra" ;;
    capability:research)        echo "task-research" ;;
    capability:security)        echo "security-reviewer" ;;
    capability:code)            echo "task-executor" ;;
    capability:file-ops)        echo "task-executor" ;;
    "")                         echo "task-executor" ;;  # no capability → default
    *)                          echo "" ;;               # unknown → stall
  esac
}

# =============================================================================
# TASK-TYPE GATE OVERRIDES — Type-level risk gate precedence
# =============================================================================

# Ordinal risk comparison: returns 0 if risk_a > risk_b
_risk_exceeds() {
  local risk_a="$1" risk_b="$2"
  local -A rank=( [risk:safe]=1 [risk:moderate]=2 [risk:destructive]=3 )
  local a=${rank[$risk_a]:-0}
  local b=${rank[$risk_b]:-0}
  [ "$a" -gt "$b" ]
}

# Check task-type override. Returns:
#   0 = auto_execute (allowed)
#   1 = blocked or with_approval (not auto-eligible)
#   2 = no override (fall through to executor gates)
_check_task_type_override() {
  local labels="$1"
  type ns_get_task_type_override &>/dev/null || return 2

  local type_label
  type_label=$(echo "$labels" | grep -o 'type:[a-z]*' | head -1)
  [ -z "$type_label" ] && return 2

  local override_gate
  override_gate=$(ns_get_task_type_override "$type_label")
  [ -z "$override_gate" ] && return 2

  local max_risk risk_label
  max_risk=$(ns_get_task_type_max_risk "$type_label")
  risk_label=$(echo "$labels" | grep -o 'risk:[a-z]*' | head -1)

  # If task risk exceeds the type override's max_risk, fall through to executor gates
  if [ -n "$risk_label" ] && [ -n "$max_risk" ] && _risk_exceeds "$risk_label" "$max_risk"; then
    return 2
  fi

  case "$override_gate" in
    auto_execute) return 0 ;;
    with_approval|block) return 1 ;;
    *) return 2 ;;
  esac
}

# =============================================================================
# DISPATCH BLOCKERS — Labels that prevent dispatch even if at stage:queue
# =============================================================================

has_dispatch_blocker() {
  local labels="$1"
  echo "$labels" | grep -qE 'waiting:human|waiting:session|waiting:external|needs-input|parked|blocked:dependency' && return 0
  return 1
}

# =============================================================================
# RISK GATE — Risk-based dispatch blocks
# =============================================================================

is_risk_blocked_for_dispatch() {
  local labels="$1" capability="$2"
  # risk:destructive + infrastructure → blocked (infra-deployer rejects it)
  if echo "$labels" | grep -q 'risk:destructive'; then
    [ "$capability" = "capability:infrastructure" ] && return 0
  fi
  return 1
}

# =============================================================================
# EXECUTOR ELIGIBILITY — Per-executor pickup checks
# =============================================================================
# These mirror the execution_eligibility section in label-taxonomy.yaml
# and the pickup_criteria section in routing-rules.yaml.

# General task executor (file-ops, code)
# Eligible: stage:queue AND risk allowed by nexus-settings (fallback: risk:safe OR pipeline:approved)
# Skip: waiting:human, needs-input, type:research, parked, capability:infrastructure
is_eligible_task_executor() {
  local labels="$1"
  echo "$labels" | grep -q 'stage:queue' || return 1
  # Task-type override takes precedence over executor-level gates
  _check_task_type_override "$labels"
  local _tto=$?
  [ "$_tto" -eq 1 ] && return 1   # type override says blocked/approval
  # If no type override (2), check executor-level risk gates
  if [ "$_tto" -eq 2 ]; then
    if type ns_check_risk_allowed &>/dev/null; then
      ns_check_risk_allowed "task-executor" "$labels"
      local risk_rc=$?
      [ "$risk_rc" -eq 1 ] && return 1  # blocked
      [ "$risk_rc" -eq 2 ] && return 1  # needs approval — not eligible for auto
    else
      echo "$labels" | grep -qE 'risk:safe|pipeline:approved' || return 1
    fi
  fi
  echo "$labels" | grep -q 'capability:infrastructure' && return 1
  echo "$labels" | grep -q 'type:research' && return 1
  has_dispatch_blocker "$labels" && return 1
  return 0
}

# Infrastructure executor
# Eligible: stage:queue AND capability:infrastructure AND risk allowed by nexus-settings
# Skip: waiting:human, needs-input, parked, blocked:dependency
is_eligible_task_executor_infra() {
  local labels="$1"
  echo "$labels" | grep -q 'stage:queue' || return 1
  echo "$labels" | grep -q 'capability:infrastructure' || return 1
  # Task-type override takes precedence over executor-level gates
  _check_task_type_override "$labels"
  local _tto=$?
  [ "$_tto" -eq 1 ] && return 1
  if [ "$_tto" -eq 2 ]; then
    if type ns_check_risk_allowed &>/dev/null; then
      ns_check_risk_allowed "task-executor-infra" "$labels"
      local risk_rc=$?
      [ "$risk_rc" -eq 1 ] && return 1  # blocked
      [ "$risk_rc" -eq 2 ] && return 1  # needs approval — not eligible for auto
    else
      echo "$labels" | grep -qE 'risk:safe|risk:moderate|pipeline:approved' || return 1
      echo "$labels" | grep -q 'risk:destructive' && return 1
    fi
  fi
  has_dispatch_blocker "$labels" && return 1
  return 0
}

# Research executor
# Eligible: stage:queue AND risk allowed by nexus-settings AND type:research
# Skip: waiting:human, needs-input, parked
is_eligible_task_research() {
  local labels="$1"
  echo "$labels" | grep -q 'stage:queue' || return 1
  # Task-type override takes precedence over executor-level gates
  _check_task_type_override "$labels"
  local _tto=$?
  [ "$_tto" -eq 1 ] && return 1
  if [ "$_tto" -eq 2 ]; then
    if type ns_check_risk_allowed &>/dev/null; then
      ns_check_risk_allowed "task-research" "$labels"
      local risk_rc=$?
      [ "$risk_rc" -eq 1 ] && return 1  # blocked
      [ "$risk_rc" -eq 2 ] && return 1  # needs approval — not eligible for auto
    else
      echo "$labels" | grep -q 'pipeline:approved' || return 1
    fi
  fi
  echo "$labels" | grep -q 'type:research' || return 1
  has_dispatch_blocker "$labels" && return 1
  return 0
}

# =============================================================================
# STAGE HELPERS — Stage label management
# =============================================================================

# Get current stage from labels string
get_current_stage() {
  local labels="$1"
  echo "$labels" | grep -o 'stage:[a-z]*' | head -1
}

# Check if task is at a specific stage
is_at_stage() {
  local labels="$1" expected_stage="$2"
  echo "$labels" | grep -q "stage:$expected_stage"
}

# =============================================================================
# FAST-TRACK — Check if a task can skip stages
# =============================================================================

can_fast_track_to_queue() {
  local labels="$1"
  # risk:safe + auto:ready → skip route/review
  if echo "$labels" | grep -q 'risk:safe' && echo "$labels" | grep -q 'auto:ready'; then
    return 0
  fi
  # Already pipeline:approved → skip to queue
  if echo "$labels" | grep -q 'pipeline:approved'; then
    return 0
  fi
  return 1
}

# =============================================================================
# ORCHESTRATION APPROVAL — Check orchestration-level pre-approval
# =============================================================================

# Check if task has project/orchestration-level approval (label-based, fast)
# Accepts both approval:project (new) and approval:orchestration (legacy)
has_orchestration_approval() {
  local labels="$1"
  echo "$labels" | grep -qE 'approval:(project|orchestration)' && return 0
  return 1
}

# Check if a specific deny-list rule is overridden for this task
# Requires task description (not just labels) — call pulse show first
is_deny_rule_overridden() {
  local description="$1" rule_id="$2"
  echo "$description" | grep -qi "Deny-list overrides:.*${rule_id}" && return 0
  return 1
}

# Check if a specific deny-list rule is enforced (hard-blocked) for this task
is_deny_rule_enforced() {
  local description="$1" rule_id="$2"
  echo "$description" | grep -qi "Deny-list enforced:.*${rule_id}" && return 0
  return 1
}

# Get the risk override ceiling from orchestration approval metadata
get_orchestration_risk_override() {
  local description="$1"
  echo "$description" | grep -oP '(?<=\*\*Risk override\*\*: )\S+' | head -1
}
