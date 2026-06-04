#!/usr/bin/env bash
# decision-log.sh — Branching-decision rationale logging library for Nexus
#
# Phase 5.2 of Nexus Revamp. Counterpart to audit-log.sh — every persona/script that
# makes a branching decision (route, retry, gate, fix, approve) calls log_decision()
# with the alternatives considered, signals matched, confidence, and rationale.
#
# Source this from common.sh alongside audit-log.sh.
#
# API:
#   log_decision <actor> <decision_type> <outcome> [alternatives_json] \
#                [signals_matched_json] [confidence] [rationale] [downstream_effect_json] [task_id]
#
# Schema (one JSON line per call):
#   {ts, actor, decision_type, outcome, alternatives, signals_matched, confidence,
#    rationale, downstream_effect, task_id, thread_id, parent_id}
#
# Spec: .claude/context/systems/observability-platform.md §5.5

# Guard against double-sourcing
[ -n "${_DECISION_LOG_SH_LOADED:-}" ] && return 0
_DECISION_LOG_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_DECISION_PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DECISION_LOG_FILE="${DECISION_LOG_FILE:-${_DECISION_PROJECT_DIR}/.claude/data/decision-log.jsonl}"
_DECISION_RETENTION_DAYS=120

# Pulse API dual-write
# PULSE_API_URL resolved canonically via lib/pulse-env.sh (accepts PULSE_API_URL > PULSE_API > PULSE_URL).
. "$(dirname "${BASH_SOURCE[0]}")/pulse-env.sh"
DECISION_DUAL_WRITE="${DECISION_DUAL_WRITE:-1}"
DECISION_DUAL_WRITE_TIMEOUT="${DECISION_DUAL_WRITE_TIMEOUT:-2}"
DECISION_SWALLOWED_ERRORS_FILE="${DECISION_SWALLOWED_ERRORS_FILE:-${_DECISION_PROJECT_DIR}/.claude/logs/swallowed-errors.jsonl}"

mkdir -p "$(dirname "$DECISION_LOG_FILE")" 2>/dev/null || true
mkdir -p "$(dirname "$DECISION_SWALLOWED_ERRORS_FILE")" 2>/dev/null || true

# ============================================================================
# Core Function
# ============================================================================

# log_decision — Record a branching decision with rationale
#
# Usage:
#   log_decision <actor> <decision_type> <outcome> \
#                [alternatives_json] [signals_matched_json] [confidence] \
#                [rationale] [downstream_effect_json] [task_id]
#
# Parameters:
#   actor              — Who decided (format: persona:name, system:component, job:name)
#   decision_type      — What kind of decision (risk_assessment, route, retry, budget_gate, fix, gate_fire, action_select)
#   outcome            — The chosen path (e.g., "risk:destructive", "stage:review", "blocked")
#   alternatives_json  — JSON array of {option, score} (default: null)
#   signals_matched_json — JSON array of matched rule names or signal objects (default: null)
#   confidence         — Float 0..1, or empty (default: null)
#   rationale          — Human-readable reasoning string (default: null)
#   downstream_effect_json — JSON object describing what was changed (default: null)
#   task_id            — Optional task this decision is about (default: null)
log_decision() {
    local actor="${1:-}"
    local decision_type="${2:-}"
    local outcome="${3:-}"
    local alternatives="${4:-null}"
    local signals_matched="${5:-null}"
    local confidence="${6:-}"
    local rationale="${7:-}"
    local downstream_effect="${8:-null}"
    local task_id="${9:-}"

    # thread_id precedence (matches audit-log.sh)
    local thread_id
    if [[ -n "${NEXUS_THREAD_ID:-}" ]]; then
        thread_id="$NEXUS_THREAD_ID"
    elif [[ -n "${NEXUS_CORRELATION_ID:-}" ]]; then
        thread_id="$NEXUS_CORRELATION_ID"
    else
        thread_id="$(date +%s)-$$"
    fi
    local parent_id="${NEXUS_PARENT_ID:-}"
    local ts
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Guard: require the 3 mandatory fields
    if [[ -z "$actor" || -z "$decision_type" || -z "$outcome" ]]; then
        echo "[decision-log] WARN: log_decision called with missing params: actor=$actor decision_type=$decision_type outcome=$outcome" >&2
        return 1
    fi

    # Validate JSON args (fall back to null on parse failure to avoid corrupting the row)
    for var in alternatives signals_matched downstream_effect; do
        local val="${!var}"
        if [[ -n "$val" && "$val" != "null" ]] && ! jq -e '.' <<< "$val" >/dev/null 2>&1; then
            printf -v "$var" '%s' "null"
            echo "[decision-log] WARN: invalid JSON for $var, replaced with null" >&2
        fi
    done

    # Build the JSONL line
    jq -nc \
        --arg ts "$ts" \
        --arg actor "$actor" \
        --arg dtype "$decision_type" \
        --arg outcome "$outcome" \
        --argjson alternatives "$alternatives" \
        --argjson signals_matched "$signals_matched" \
        --arg confidence "$confidence" \
        --arg rationale "$rationale" \
        --argjson downstream_effect "$downstream_effect" \
        --arg task_id "$task_id" \
        --arg thread_id "$thread_id" \
        --arg parent_id "$parent_id" \
        '{
            ts: $ts,
            actor: $actor,
            decision_type: $dtype,
            outcome: $outcome,
            alternatives: $alternatives,
            signals_matched: $signals_matched,
            confidence: (if $confidence == "" then null else ($confidence | tonumber) end),
            rationale: (if $rationale == "" then null else $rationale end),
            downstream_effect: $downstream_effect,
            task_id: (if $task_id == "" then null else $task_id end),
            thread_id: $thread_id,
            parent_id: (if $parent_id == "" then null else $parent_id end)
        }' >> "$DECISION_LOG_FILE" 2>/dev/null

    # Pulse API dual-write (best effort)
    if [[ "$DECISION_DUAL_WRITE" == "1" ]]; then
        _decision_post_to_pulse "$ts" "$thread_id" "$parent_id" "$actor" "$decision_type" \
            "$outcome" "$alternatives" "$signals_matched" "$confidence" "$rationale" \
            "$downstream_effect" "$task_id"
    fi
}

# Internal — POST one decision event to Pulse, fail-quiet to swallowed-errors.jsonl
_decision_post_to_pulse() {
    local ts="$1" thread_id="$2" parent_id="$3" actor="$4" dtype="$5" outcome="$6"
    local alternatives="$7" signals_matched="$8" confidence="$9" rationale="${10}"
    local downstream_effect="${11}" task_id="${12}"

    local payload
    payload=$(jq -nc \
        --arg ts "$ts" \
        --arg thread_id "$thread_id" \
        --arg parent_id "$parent_id" \
        --arg actor "$actor" \
        --arg dtype "$dtype" \
        --arg outcome "$outcome" \
        --argjson alternatives "$alternatives" \
        --argjson signals_matched "$signals_matched" \
        --arg confidence "$confidence" \
        --arg rationale "$rationale" \
        --argjson downstream_effect "$downstream_effect" \
        --arg task_id "$task_id" \
        '{
            ts: $ts,
            thread_id: $thread_id,
            parent_id: (if $parent_id == "" then null else $parent_id end),
            actor: $actor,
            decision_type: $dtype,
            outcome: $outcome,
            alternatives: $alternatives,
            signals_matched: $signals_matched,
            confidence: (if $confidence == "" then null else ($confidence | tonumber) end),
            rationale: (if $rationale == "" then null else $rationale end),
            downstream_effect: $downstream_effect,
            task_id: (if $task_id == "" then null else $task_id end)
        }')

    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time "$DECISION_DUAL_WRITE_TIMEOUT" \
        -X POST "${PULSE_API_URL}/audit/decisions" \
        -H 'Content-Type: application/json' \
        -d "$payload" 2>/dev/null) || http_code="000"

    if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
        jq -nc \
            --arg failed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg http_code "$http_code" \
            --arg target "${PULSE_API_URL}/audit/decisions" \
            --argjson payload "$payload" \
            '{
                failed_at: $failed_at,
                target: $target,
                http_code: $http_code,
                payload: $payload
            }' >> "$DECISION_SWALLOWED_ERRORS_FILE" 2>/dev/null
    fi
}

# ============================================================================
# Self-Test
# ============================================================================

_decision_self_test() {
    local test_file="/tmp/decision-log-test-$$.jsonl"
    local orig="$DECISION_LOG_FILE"
    DECISION_LOG_FILE="$test_file"
    DECISION_DUAL_WRITE=0  # JSONL only for the self-test

    echo "=== decision-log.sh self-test ==="
    NEXUS_THREAD_ID="self-test-$$" \
        log_decision "persona:task-evaluator" "risk_assessment" "risk:destructive" \
        '[{"option":"risk:safe","score":0.1},{"option":"risk:destructive","score":0.9}]' \
        '["rule:rm_rf","rule:no_confirm_flag"]' \
        "0.92" \
        "Detected rm -rf without explicit confirmation flag" \
        '{"labels_added":["risk:destructive"]}' \
        "AIProjects-test1"

    NEXUS_THREAD_ID="self-test-$$" \
        log_decision "system:executor" "budget_gate" "blocked" \
        "null" \
        '["rule:daily_budget_exceeded"]' \
        "1.0" \
        "Daily budget hit \$15.00 cap, deferring task" \
        '{"deferred":true,"resume_at":"2026-04-11T00:00:00Z"}' \
        "AIProjects-test2"

    local count
    count=$(jq -c '.' "$test_file" 2>/dev/null | wc -l)
    if [ "$count" -eq 2 ]; then
        echo "PASS: 2 valid JSON records written"
    else
        echo "FAIL: Expected 2, got $count"
        DECISION_LOG_FILE="$orig"
        rm -f "$test_file"
        return 1
    fi

    # Validate confidence is numeric (not string)
    local conf_type
    conf_type=$(jq -r '.confidence | type' < <(head -1 "$test_file"))
    if [ "$conf_type" = "number" ]; then
        echo "PASS: confidence is numeric"
    else
        echo "FAIL: confidence is $conf_type, expected number"
    fi

    # Missing-params guard
    if log_decision "" "test" "test" 2>/dev/null; then
        echo "FAIL: Should reject missing actor"
    else
        echo "PASS: Missing params rejected"
    fi

    echo "=== All tests complete ==="
    jq -c '.' "$test_file"
    DECISION_LOG_FILE="$orig"
    rm -f "$test_file"
}

if [[ "${1:-}" == "--test" ]]; then
    _decision_self_test
fi
