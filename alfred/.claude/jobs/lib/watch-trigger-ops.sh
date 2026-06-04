#!/usr/bin/env bash
# watch-trigger-ops.sh — Bash helpers for Pulse Watch Trigger API
#
# Usage: source this file from obsidian-watch-monitor.sh
#
# Requires: PULSE_URL set (defaults to http://localhost:8700/api/v1)
#           PULSE_SERVICE_TOKEN set (via common.sh or pulse-api.sh)

PULSE_URL="${PULSE_URL:-http://localhost:8700/api/v1}"

# Get active watch triggers for a source type
# Usage: wt_get_active [source_type]
wt_get_active() {
    local source_type="${1:-obsidian}"
    curl -sf "${PULSE_URL}/watch-triggers/active?source_type=${source_type}" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" 2>/dev/null
}

# Check changed files against active triggers
# Usage: wt_check_files <json_array_of_files>
# Input: JSON array string, e.g., '["01-DnD/KLYX/notes.md","01-DnD/KLYX/orbs.md"]'
wt_check_files() {
    local changed_files_json="$1"
    curl -sf -X POST "${PULSE_URL}/watch-triggers/check-files" \
        -H "Content-Type: application/json" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
        -d "{\"changed_files\": ${changed_files_json}}" 2>/dev/null
}

# Satisfy a watch trigger
# Usage: wt_satisfy <trigger_id> <file_path>
wt_satisfy() {
    local trigger_id="$1" file_path="$2"
    curl -sf -X POST "${PULSE_URL}/watch-triggers/${trigger_id}/satisfy" \
        -H "Content-Type: application/json" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
        -d "{\"satisfied_by\": \"${file_path}\"}" 2>/dev/null
}

# Create a watch trigger
# Usage: wt_create <task_id> <condition> <file_patterns_json> [source_type] [expires_days] [created_by]
wt_create() {
    local task_id="$1" condition="$2" file_patterns="$3"
    local source_type="${4:-obsidian}" expires_days="${5:-30}" created_by="${6:-cli}"
    curl -sf -X POST "${PULSE_URL}/watch-triggers" \
        -H "Content-Type: application/json" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
        -d "{
            \"task_id\": \"${task_id}\",
            \"condition\": $(echo "$condition" | jq -Rs .),
            \"file_patterns\": ${file_patterns},
            \"source_type\": \"${source_type}\",
            \"expires_days\": ${expires_days},
            \"created_by\": \"${created_by}\"
        }" 2>/dev/null
}

# Cancel a watch trigger
# Usage: wt_cancel <trigger_id>
wt_cancel() {
    local trigger_id="$1"
    curl -sf -X PATCH "${PULSE_URL}/watch-triggers/${trigger_id}" \
        -H "Content-Type: application/json" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
        -d '{"status": "cancelled"}' 2>/dev/null
}
