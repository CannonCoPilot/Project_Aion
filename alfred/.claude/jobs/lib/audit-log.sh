#!/usr/bin/env bash
# audit-log.sh — Unified audit logging library for Nexus
#
# Replaces 7 scattered JSONL files with a single, consistent audit trail.
# Every mutation event — job lifecycle, task pipeline, label changes, budget,
# config, persona actions, system events, triggers — flows through log_audit().
#
# Source this from common.sh. All scripts get it automatically.
#
# API:
#   log_audit <actor> <action> <entity_type> <entity_id> [details_json] [correlation_id]
#
# Schema (one JSON line per call):
#   {ts, actor, action, entity_type, entity_id, details, correlation_id}
#
# Actor format:    job:<name>, user:<name>, system:<component>, persona:<name>
# Action format:   category.specific (e.g., job.started, label.added, task.claimed)
# Entity types:    task, job, persona, config, label, budget, message, service, lock
#
# Output:          .claude/data/audit-log.jsonl
# Rotation:        120 days (call _audit_rotate from cron/watchdog)
#
# Design ref:      .claude/agent-output/results/deep-research/2026-03-27_nexus-audit-action-taxonomy.md

# Guard against double-sourcing
[ -n "${_AUDIT_LOG_SH_LOADED:-}" ] && return 0
_AUDIT_LOG_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_AUDIT_PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
AUDIT_LOG_FILE="${AUDIT_LOG_FILE:-${_AUDIT_PROJECT_DIR}/.claude/data/audit-log.jsonl}"
_AUDIT_RETENTION_DAYS=120

# Phase 5.2: Pulse API dual-write target.
# PULSE_API_URL resolved canonically via lib/pulse-env.sh (accepts PULSE_API_URL > PULSE_API > PULSE_URL).
. "$(dirname "${BASH_SOURCE[0]}")/pulse-env.sh"
AUDIT_DUAL_WRITE="${AUDIT_DUAL_WRITE:-1}"
AUDIT_DUAL_WRITE_TIMEOUT="${AUDIT_DUAL_WRITE_TIMEOUT:-2}"
AUDIT_SWALLOWED_ERRORS_FILE="${AUDIT_SWALLOWED_ERRORS_FILE:-${_AUDIT_PROJECT_DIR}/.claude/logs/swallowed-errors.jsonl}"

# Ensure log directories exist
mkdir -p "$(dirname "$AUDIT_LOG_FILE")" 2>/dev/null || true
mkdir -p "$(dirname "$AUDIT_SWALLOWED_ERRORS_FILE")" 2>/dev/null || true

# ============================================================================
# Core Function
# ============================================================================

# log_audit — Write a unified audit log entry
#
# Usage: log_audit <actor> <action> <entity_type> <entity_id> [details_json] [correlation_id]
#
# Parameters:
#   actor          — Who performed the action (format: type:name)
#   action         — What happened (format: category.specific_action)
#   entity_type    — What was acted upon (task, job, persona, config, label, budget, message, service, lock)
#   entity_id      — Identifier of the entity
#   details_json   — Optional JSON object with action-specific context (default: "{}")
#   correlation_id — Optional ID linking related events (default: auto-generated)
log_audit() {
    local actor="${1:-}"
    local action="${2:-}"
    local entity_type="${3:-}"
    local entity_id="${4:-}"
    local details="$5"
    [[ -z "$details" ]] && details='{}'
    # Phase 5.2→5.8: thread_id is the lifecycle correlation primitive. Precedence:
    # 1) NEXUS_THREAD_ID env var (set by dispatcher at cycle entry, inherited by all children)
    # 2) Explicit 6th arg (legacy correlation_id call sites)
    # 3) NEXUS_CORRELATION_ID env (legacy fallback)
    # 4) FAIL-CLOSED (Phase 5.8, 8x3r): refuse to write uncorrelated events.
    #    All known callers now set NEXUS_THREAD_ID. If this fires, a new caller was
    #    added without the required setup — fix the caller, not this guard.
    #    Emergency bypass: AUDIT_THREAD_ENFORCE=0 (e.g., for one-off replay scripts).
    local thread_id
    if [[ -n "${NEXUS_THREAD_ID:-}" ]]; then
        thread_id="$NEXUS_THREAD_ID"
    elif [[ -n "${6:-}" ]]; then
        thread_id="$6"
    elif [[ -n "${NEXUS_CORRELATION_ID:-}" ]]; then
        thread_id="$NEXUS_CORRELATION_ID"
    elif [[ "${AUDIT_THREAD_ENFORCE:-1}" == "0" ]]; then
        # Emergency bypass: generate a synthetic thread_id but warn
        thread_id="$(date +%s)-$$-$RANDOM"
        echo "[audit-log] WARN: NEXUS_THREAD_ID missing (enforcement bypassed via AUDIT_THREAD_ENFORCE=0), generated $thread_id (action=$action actor=$actor)" >&2
    else
        echo "[audit-log] FATAL: NEXUS_THREAD_ID not set. All callers must export NEXUS_THREAD_ID before calling log_audit. Refusing to write uncorrelated event (action=$action actor=$actor). Set AUDIT_THREAD_ENFORCE=0 to bypass." >&2
        return 1
    fi
    local ts
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Guard: require the 4 mandatory fields
    if [[ -z "$actor" || -z "$action" || -z "$entity_type" || -z "$entity_id" ]]; then
        echo "[audit-log] WARN: log_audit called with missing params: actor=$actor action=$action entity_type=$entity_type entity_id=$entity_id" >&2
        return 1
    fi

    # Validate details is valid JSON (fall back to wrapping as string)
    if ! jq -e '.' <<< "$details" >/dev/null 2>&1; then
        details=$(jq -nc --arg d "$details" '{raw: $d}')
    fi

    # JSONL spool — durable, never blocked by Postgres availability
    jq -nc \
        --arg ts "$ts" \
        --arg actor "$actor" \
        --arg action "$action" \
        --arg etype "$entity_type" \
        --arg eid "$entity_id" \
        --argjson details "$details" \
        --arg cid "$thread_id" \
        '{
            ts: $ts,
            actor: $actor,
            action: $action,
            entity_type: $etype,
            entity_id: $eid,
            details: $details,
            correlation_id: $cid
        }' >> "$AUDIT_LOG_FILE" 2>/dev/null

    # Phase 5.2: Pulse API dual-write. JSONL is the durable path; Postgres is best-effort.
    # On failure, append to swallowed-errors.jsonl so audit-ingest.sh (Phase 5.3) can replay.
    if [[ "$AUDIT_DUAL_WRITE" == "1" ]]; then
        _audit_post_to_pulse "$ts" "$thread_id" "$actor" "$action" "$entity_type" "$entity_id" "$details"
    fi

    # Phase 5.8: thread_id enforcement is now fail-closed (see guard above).
    # The old thread_id_missing warning block (Phase 5.2) has been removed —
    # uncorrelated events are rejected at the gate, not logged with synthetic IDs.
}

# Internal — POST one audit event to Pulse, fail-quiet with swallowed-errors.jsonl spool.
# Runs in the foreground with a 2s timeout cap so callers see at most a 2s tail latency
# even when Postgres is down. The spool writer is the safety net.
_audit_post_to_pulse() {
    local ts="$1" thread_id="$2" actor="$3" action="$4" etype="$5" eid="$6" details="$7"

    # task_id denormalization: when entity_type=task, mirror entity_id into task_id for fast joins
    local task_id_arg='null'
    if [[ "$etype" == "task" ]]; then
        task_id_arg="\"$eid\""
    fi

    local payload
    payload=$(jq -nc \
        --arg ts "$ts" \
        --arg thread_id "$thread_id" \
        --arg actor "$actor" \
        --arg action "$action" \
        --arg etype "$etype" \
        --arg eid "$eid" \
        --argjson details "$details" \
        --argjson task_id "$task_id_arg" \
        '{
            ts: $ts,
            thread_id: $thread_id,
            actor: $actor,
            action: $action,
            entity_type: $etype,
            entity_id: $eid,
            task_id: $task_id,
            details: $details
        }')

    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time "$AUDIT_DUAL_WRITE_TIMEOUT" \
        -X POST "${PULSE_API_URL}/audit/events" \
        -H 'Content-Type: application/json' \
        -d "$payload" 2>/dev/null) || http_code="000"

    if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
        # Spool the failed POST so audit-ingest.sh can replay it later
        jq -nc \
            --arg failed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg http_code "$http_code" \
            --arg target "${PULSE_API_URL}/audit/events" \
            --argjson payload "$payload" \
            '{
                failed_at: $failed_at,
                target: $target,
                http_code: $http_code,
                payload: $payload
            }' >> "$AUDIT_SWALLOWED_ERRORS_FILE" 2>/dev/null
    fi
}

# ============================================================================
# Convenience Helpers
# ============================================================================

# Build a details JSON object from key=value pairs
# Usage: audit_details "model=sonnet" "cost=0.52" "duration_s=274"
# Returns: {"model":"sonnet","cost":"0.52","duration_s":"274"}
audit_details() {
    local json="{}"
    for kv in "$@"; do
        local k="${kv%%=*}" v="${kv#*=}"
        json=$(echo "$json" | jq -c --arg k "$k" --arg v "$v" '. + {($k): $v}')
    done
    echo "$json"
}

# ============================================================================
# Log Rotation
# ============================================================================

# Archive entries older than retention period
# Call from pipeline-watchdog or cron
_audit_rotate() {
    [ ! -f "$AUDIT_LOG_FILE" ] && return 0
    local cutoff_ts
    cutoff_ts=$(date -u -d "${_AUDIT_RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null) || return 0

    local archive_dir
    archive_dir="$(dirname "$AUDIT_LOG_FILE")/archive"
    mkdir -p "$archive_dir" 2>/dev/null || true

    local archive_file
    archive_file="${archive_dir}/audit-log-$(date +%Y%m%d).jsonl"
    local tmp_file="${AUDIT_LOG_FILE}.tmp.$$"

    # Split: old entries → archive, recent → keep
    while IFS= read -r line; do
        local ts
        ts=$(echo "$line" | jq -r '.ts // empty' 2>/dev/null) || continue
        if [[ -n "$ts" && "$ts" < "$cutoff_ts" ]]; then
            echo "$line" >> "$archive_file"
        else
            echo "$line" >> "$tmp_file"
        fi
    done < "$AUDIT_LOG_FILE"

    # Atomic swap
    if [ -f "$tmp_file" ]; then
        mv "$tmp_file" "$AUDIT_LOG_FILE"
    else
        true > "$AUDIT_LOG_FILE"
    fi
}

# ============================================================================
# Self-Test
# ============================================================================

# Run with: source audit-log.sh && _audit_self_test
# Or:       bash audit-log.sh --test
_audit_self_test() {
    local test_file="/tmp/audit-log-test-$$.jsonl"
    local orig_file="$AUDIT_LOG_FILE"
    AUDIT_LOG_FILE="$test_file"

    echo "=== audit-log.sh self-test ==="

    # Test 1: Basic write
    log_audit "job:test-runner" "job.started" "job" "test-runner" '{"trigger":"self-test"}'
    log_audit "system:dispatcher" "task.claimed" "task" "AIProjects-test1" '{"persona":"researcher","from_stage":"queue","to_stage":"execute"}'
    log_audit "persona:ai-david" "persona.approved" "task" "AIProjects-test2" '{"decision":"close","confidence":0.92}'

    # Test 2: Validate all 3 records are valid JSON
    local count
    count=$(jq -c '.' "$test_file" 2>/dev/null | wc -l)
    if [ "$count" -eq 3 ]; then
        echo "PASS: 3 valid JSON records written"
    else
        echo "FAIL: Expected 3 records, got $count"
        AUDIT_LOG_FILE="$orig_file"
        rm -f "$test_file"
        return 1
    fi

    # Test 3: Verify schema fields present on all records
    local schema_ok=true
    for field in ts actor action entity_type entity_id details correlation_id; do
        local nulls
        nulls=$(jq -r "select(.${field} == null) | .ts" "$test_file" 2>/dev/null | wc -l)
        if [ "$nulls" -gt 0 ]; then
            echo "FAIL: Field '$field' missing in $nulls records"
            schema_ok=false
        fi
    done
    if $schema_ok; then
        echo "PASS: All schema fields present"
    fi

    # Test 4: Missing params guard
    if log_audit "" "job.started" "job" "test" 2>/dev/null; then
        echo "FAIL: Should reject missing actor"
    else
        echo "PASS: Missing params rejected"
    fi

    # Test 5: Invalid JSON details fallback
    log_audit "job:test" "job.started" "job" "test" "not-json-at-all"
    local wrapped
    wrapped=$(tail -1 "$test_file" | jq -r '.details.raw // empty')
    if [ "$wrapped" = "not-json-at-all" ]; then
        echo "PASS: Invalid JSON details wrapped safely"
    else
        echo "FAIL: Invalid JSON details not handled"
    fi

    echo "=== All tests complete ==="
    jq -c '.' "$test_file"

    AUDIT_LOG_FILE="$orig_file"
    rm -f "$test_file"
}

# Allow running self-test directly
if [[ "${1:-}" == "--test" ]]; then
    _audit_self_test
fi
