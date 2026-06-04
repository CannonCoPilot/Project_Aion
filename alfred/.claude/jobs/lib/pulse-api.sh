#!/usr/bin/env bash
# pulse-api.sh — Pulse HTTP API helpers for Nexus bash scripts.
#
# BEADS = DEAD. Replaces old bd CLI subprocess calls with direct curl to Pulse API.
# Source this file in any Nexus script that needs task operations.
#
# Usage:
#   source "$(dirname "$0")/lib/pulse-api.sh"
#   pulse_get_task "AIProjects-abc1"
#   pulse_update_task "AIProjects-abc1" '{"status":"in_progress","claim":true,"actor":"executor"}'
#   pulse_add_label "AIProjects-abc1" "stage:queue" "event-watcher"
#   pulse_transition "AIProjects-abc1" "approve" "dashboard"

# Build Pulse URL from PULSE_URL or PULSE_PORT, ensuring /api/v1 suffix.
# Supports both CLI convention (PULSE_URL=http://host:port) and
# direct convention (PULSE_URL=http://host:port/api/v1).
_PULSE_BASE="${PULSE_URL:-http://localhost:${PULSE_PORT:-8700}}"
case "$_PULSE_BASE" in
  */api/v1) PULSE_URL="$_PULSE_BASE" ;;
  */)       PULSE_URL="${_PULSE_BASE}api/v1" ;;
  *)        PULSE_URL="${_PULSE_BASE}/api/v1" ;;
esac

# Service authentication token — loaded from env or token file
PULSE_SERVICE_TOKEN="${PULSE_SERVICE_TOKEN:-${PULSE_NEXUS_TOKEN:-}}"
if [[ -z "$PULSE_SERVICE_TOKEN" && -f "$HOME/.config/automation/pulse-nexus-token" ]]; then
  PULSE_SERVICE_TOKEN="$(cat "$HOME/.config/automation/pulse-nexus-token")"
fi

# --- Core HTTP helpers ---

pulse_get() {
  local path="$1"
  curl -sf "${PULSE_URL}${path}" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN}" 2>/dev/null
}

pulse_post() {
  local path="$1"
  local data="$2"
  curl -sf -X POST "${PULSE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN}" \
    -d "$data" 2>/dev/null
}

pulse_patch() {
  local path="$1"
  local data="$2"
  curl -sf -X PATCH "${PULSE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN}" \
    -d "$data" 2>/dev/null
}

pulse_delete() {
  local path="$1"
  curl -sf -X DELETE "${PULSE_URL}${path}" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN}" 2>/dev/null
}

pulse_put() {
  local path="$1"
  local data="$2"
  curl -sf -X PUT "${PULSE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "X-Service-Token: ${PULSE_SERVICE_TOKEN}" \
    -d "$data" 2>/dev/null
}

# --- Task operations ---

# Get a task as JSON
pulse_get_task() {
  local task_id="$1"
  pulse_get "/tasks/${task_id}"
}

# Get task field via jq
pulse_get_task_field() {
  local task_id="$1"
  local field="$2"
  pulse_get_task "$task_id" | jq -r ".${field} // empty"
}

# Get task labels as newline-separated list
pulse_get_task_labels() {
  local task_id="$1"
  pulse_get_task "$task_id" | jq -r '.labels[]'
}

# List tasks with filters, returns JSON array
pulse_list_tasks() {
  local params="$1"  # e.g. "status=open&label=stage:queue&limit=100"
  pulse_get "/tasks?${params}" | jq '.tasks'
}

# List task IDs matching filters
pulse_list_task_ids() {
  local params="$1"
  pulse_get "/tasks?${params}" | jq -r '.tasks[].id'
}

# Update a task (pass JSON body)
pulse_update_task() {
  local task_id="$1"
  local data="$2"
  pulse_patch "/tasks/${task_id}" "$data"
}

# Close a task
pulse_close_task() {
  local task_id="$1"
  local reason="$2"
  local actor="${3:-system}"
  local body
  body=$(jq -nc --arg r "$reason" --arg a "$actor" '{reason:$r, actor:$a}')
  pulse_post "/tasks/${task_id}/close" "$body"
  log_audit "system:pulse-api" "task.closed" "task" "$task_id" \
      "$(jq -nc --arg reason "$reason" --arg actor "$actor" '{reason:$reason,actor:$actor}')" 2>/dev/null || true
}

# Create a task, returns the new task JSON
pulse_create_task() {
  local title="$1"
  local data="$2"  # JSON with priority, labels, description, etc.
  if [[ -z "$data" ]]; then
    data="{\"title\":$(echo "$title" | jq -Rs .),\"actor\":\"system\"}"
  else
    # Merge title into the provided data
    data=$(echo "$data" | jq --arg t "$title" '. + {title: $t}')
  fi
  pulse_post "/tasks" "$data"
}

# Claim a task (set in_progress + assign)
pulse_claim_task() {
  local task_id="$1"
  local actor="${2:-system}"
  pulse_patch "/tasks/${task_id}" \
    "{\"claim\":true,\"actor\":\"${actor}\"}"
}

# Append notes to a task
pulse_append_notes() {
  local task_id="$1"
  local notes="$2"
  local actor="${3:-system}"
  local body
  body=$(jq -nc --arg n "$notes" --arg a "$actor" '{append_notes:$n, actor:$a}')
  pulse_patch "/tasks/${task_id}" "$body"
}

# --- Label operations ---

# Add label(s) to a task
pulse_add_label() {
  local task_id="$1"
  local label="$2"
  local actor="${3:-system}"
  local body
  body=$(jq -nc --arg l "$label" --arg a "$actor" '{labels:[$l], actor:$a}')
  pulse_post "/tasks/${task_id}/labels" "$body"
}

# Add multiple labels at once
pulse_add_labels() {
  local task_id="$1"
  local labels_json="$2"  # JSON array: '["stage:queue","auto:ready"]'
  local actor="${3:-system}"
  pulse_post "/tasks/${task_id}/labels" \
    "{\"labels\":${labels_json},\"actor\":\"${actor}\"}"
}

# Remove a label from a task
pulse_remove_label() {
  local task_id="$1"
  local label="$2"
  local actor="${3:-system}"
  local encoded_label
  # Encode label for URL path — colons are safe in path segments per RFC 3986
  encoded_label=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=':'))" "$label" 2>/dev/null || echo "$label")
  pulse_delete "/tasks/${task_id}/labels/${encoded_label}?actor=${actor}"
}

# --- Transitions ---

# Execute a named transition (approve, modify, pause, claim, etc.)
pulse_transition() {
  local task_id="$1"
  local scenario="$2"
  local source="${3:-system}"
  local actor="${4:-system}"
  pulse_post "/tasks/${task_id}/transition" \
    "{\"scenario\":\"${scenario}\",\"source\":\"${source}\",\"actor\":\"${actor}\"}"
}

# Stage transition (atomic stage change + trigger emit)
pulse_stage_transition() {
  local task_id="$1"
  local new_stage="$2"
  local source="${3:-system}"
  local actor="${4:-system}"
  pulse_post "/tasks/${task_id}/stage" \
    "{\"new_stage\":\"${new_stage}\",\"source\":\"${source}\",\"actor\":\"${actor}\"}"
}

# --- Triggers ---

# Emit a pipeline trigger
pulse_emit_trigger() {
  local task_id="$1"
  local stage="$2"
  local source="${3:-system}"
  pulse_post "/triggers/emit" \
    "{\"task_id\":\"${task_id}\",\"stage\":\"${stage}\",\"source\":\"${source}\"}"
}

# Claim triggers for a handler (batch)
pulse_claim_triggers() {
  local handler="$1"
  local claimed_by="${2:-$handler}"
  pulse_post "/triggers/claim-handler" \
    "{\"handler\":\"${handler}\",\"claimed_by\":\"${claimed_by}\"}"
}

# Complete a trigger
pulse_complete_trigger() {
  local trigger_id="$1"
  local result="${2:-}"
  pulse_post "/triggers/${trigger_id}/complete" \
    "{\"result\":$(echo "${result:-completed}" | jq -Rs .)}"
}

# Fail a trigger
pulse_fail_trigger() {
  local trigger_id="$1"
  local error="$2"
  pulse_post "/triggers/${trigger_id}/fail" \
    "{\"error\":$(echo "$error" | jq -Rs .)}"
}

# Get pending triggers summary
pulse_pending_triggers() {
  pulse_get "/triggers/pending"
}

# --- Messages ---

# Send a message to the bus
pulse_send_message() {
  local event_type="$1"
  local source="$2"
  local data="$3"  # JSON object
  local actor="${4:-system}"
  local severity="${5:-info}"
  local job_name="${6:-}"
  local body="{\"event_type\":\"${event_type}\",\"source\":\"${source}\",\"actor\":\"${actor}\",\"severity\":\"${severity}\",\"data\":${data:-\{\}}}"
  if [[ -n "$job_name" ]]; then
    body=$(echo "$body" | jq --arg j "$job_name" '. + {job_name: $j}')
  fi
  pulse_post "/messages" "$body"
}

# Get pending messages
pulse_pending_messages() {
  pulse_get "/messages/pending"
}

# Mark a message as delivered
pulse_deliver_message() {
  local message_id="$1"
  pulse_post "/messages/${message_id}/deliver"
}

# --- Jobs ---

# Update job state (last_run, fail_count)
pulse_update_job() {
  local job_name="$1"
  local data="$2"  # JSON: '{"last_run":"2026-03-17T15:00:00Z","fail_count":0}'
  pulse_patch "/jobs/${job_name}" "$data"
}

# --- Settings ---

# Get a setting value
pulse_get_setting() {
  local key="$1"
  pulse_get "/settings/${key}" | jq -r '.value'
}

# Get all settings
pulse_get_all_settings() {
  pulse_get "/settings"
}

# Update a setting
pulse_update_setting() {
  local key="$1"
  local value="$2"  # JSON value
  local actor="${3:-system}"
  pulse_put "/settings/${key}" "{\"value\":${value},\"actor\":\"${actor}\"}"
}

# --- Events ---

# Get recent events
pulse_get_events() {
  local params="${1:-limit=50}"
  pulse_get "/events?${params}"
}

# Get events for a task
pulse_get_task_events() {
  local task_id="$1"
  local limit="${2:-50}"
  pulse_get "/events?task_id=${task_id}&limit=${limit}"
}

# --- Ready queue ---

# Get ready tasks
pulse_ready_tasks() {
  local limit="${1:-10}"
  pulse_get "/tasks/ready?limit=${limit}"
}

# --- Health ---

pulse_health() {
  pulse_get "/health"
}

# --- Compatibility helpers ---

# Check if Pulse is reachable
pulse_check() {
  if pulse_health > /dev/null 2>&1; then
    return 0
  else
    echo "WARNING: Pulse API not reachable at ${PULSE_URL}" >&2
    return 1
  fi
}
