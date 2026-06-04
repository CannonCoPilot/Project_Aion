#!/usr/bin/env bash
# cost-log.sh — Cost / token / model economics logging library for Nexus
#
# Phase 5.2 of Nexus Revamp. Wraps the executor.sh cost-ledger.jsonl append with
# parallel dual-write to pulse.cost_events via POST /api/v1/costs/events.
#
# API:
#   log_cost <jsonl_row>             # row matches existing cost-ledger.jsonl schema
#   log_cost <jsonl_row> <task_id>   # optional task association for Postgres row
#
# The library does NOT build the row — caller (executor.sh) constructs it via the
# existing jq pipeline so cost-ledger.jsonl writers are the source of truth for
# field semantics. The library appends to JSONL (durable) then transforms for the
# Postgres schema (rename cost → cost_usd, enrich with thread_id) and POSTs.
#
# Spec: .claude/context/systems/observability-platform.md §5.2 / §5.4

# Guard against double-sourcing
[ -n "${_COST_LOG_SH_LOADED:-}" ] && return 0
_COST_LOG_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

_COST_PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
COST_LEDGER_FILE="${COST_LEDGER_FILE:-${_COST_PROJECT_DIR}/.claude/data/cost-ledger.jsonl}"

# PULSE_API_URL resolved canonically via lib/pulse-env.sh (accepts PULSE_API_URL > PULSE_API > PULSE_URL).
. "$(dirname "${BASH_SOURCE[0]}")/pulse-env.sh"
COST_DUAL_WRITE="${COST_DUAL_WRITE:-1}"
COST_DUAL_WRITE_TIMEOUT="${COST_DUAL_WRITE_TIMEOUT:-2}"
COST_SWALLOWED_ERRORS_FILE="${COST_SWALLOWED_ERRORS_FILE:-${_COST_PROJECT_DIR}/.claude/logs/swallowed-errors.jsonl}"

mkdir -p "$(dirname "$COST_LEDGER_FILE")" 2>/dev/null || true
mkdir -p "$(dirname "$COST_SWALLOWED_ERRORS_FILE")" 2>/dev/null || true

# ============================================================================
# Core Function
# ============================================================================

# log_cost — Append a cost ledger row + POST to Pulse cost_events
#
# Usage:
#   log_cost '<jsonl_row>'              — JSONL only path active when COST_DUAL_WRITE=0
#   log_cost '<jsonl_row>' '<task_id>'  — also denormalize task_id into Postgres row
#
# The JSONL row is expected to already match the cost-ledger schema:
#   {ts, job, persona, model, engine, cost, input_tokens, output_tokens,
#    cache_read_tokens, cache_creation_tokens, cache_hit_ratio, duration_s,
#    success, router_model, router_overridden, company}
log_cost() {
    local row="$1"
    local task_id="${2:-}"

    if [[ -z "$row" ]]; then
        echo "[cost-log] WARN: log_cost called with empty row" >&2
        return 1
    fi

    if ! jq -e '.' <<< "$row" >/dev/null 2>&1; then
        echo "[cost-log] WARN: log_cost called with invalid JSON, skipping" >&2
        return 1
    fi

    # JSONL spool — durable. Enrich with thread_id so audit-ingest.py can dedup
    # against the hot-path POST (which carries thread_id in the Postgres payload).
    local thread_id="${NEXUS_THREAD_ID:-${NEXUS_CORRELATION_ID:-}}"
    if [[ -n "$thread_id" ]]; then
        row=$(jq -c --arg tid "$thread_id" '. + {correlation_id: $tid}' <<< "$row")
    fi
    printf '%s\n' "$row" >> "$COST_LEDGER_FILE" 2>/dev/null

    # Pulse POST (best effort)
    if [[ "$COST_DUAL_WRITE" == "1" ]]; then
        _cost_post_to_pulse "$row" "$task_id"
    fi
}

# Internal — transform cost-ledger row to cost_events payload and POST
_cost_post_to_pulse() {
    local row="$1"
    local task_id="$2"
    local thread_id="${NEXUS_THREAD_ID:-${NEXUS_CORRELATION_ID:-}}"
    local session_id="${NEXUS_SESSION_ID:-${CLAUDE_SESSION_ID:-}}"

    # Build Pulse payload from JSONL row. Field renames:
    #   cost → cost_usd
    # Field additions (not in JSONL today):
    #   thread_id, task_id, session_id, project_id
    local payload
    payload=$(jq -nc \
        --argjson row "$row" \
        --arg thread_id "$thread_id" \
        --arg task_id "$task_id" \
        --arg session_id "$session_id" \
        '{
            ts: $row.ts,
            thread_id: (if $thread_id == "" then null else $thread_id end),
            task_id: (if $task_id == "" then null else $task_id end),
            session_id: (if $session_id == "" then null else $session_id end),
            job: $row.job,
            persona: $row.persona,
            model: $row.model,
            engine: $row.engine,
            cost_usd: $row.cost,
            input_tokens: $row.input_tokens,
            output_tokens: $row.output_tokens,
            cache_read_tokens: $row.cache_read_tokens,
            cache_creation_tokens: $row.cache_creation_tokens,
            cache_hit_ratio: $row.cache_hit_ratio,
            duration_s: $row.duration_s,
            success: $row.success,
            router_model: $row.router_model,
            router_overridden: $row.router_overridden,
            company: $row.company,
            project_id: null
        }')

    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --max-time "$COST_DUAL_WRITE_TIMEOUT" \
        -X POST "${PULSE_API_URL}/costs/events" \
        -H 'Content-Type: application/json' \
        -d "$payload" 2>/dev/null) || http_code="000"

    if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
        jq -nc \
            --arg failed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg http_code "$http_code" \
            --arg target "${PULSE_API_URL}/costs/events" \
            --argjson payload "$payload" \
            '{
                failed_at: $failed_at,
                target: $target,
                http_code: $http_code,
                payload: $payload
            }' >> "$COST_SWALLOWED_ERRORS_FILE" 2>/dev/null
    fi
}

# ============================================================================
# Self-Test
# ============================================================================

_cost_self_test() {
    local test_file="/tmp/cost-log-test-$$.jsonl"
    local orig="$COST_LEDGER_FILE"
    COST_LEDGER_FILE="$test_file"
    COST_DUAL_WRITE=0

    echo "=== cost-log.sh self-test ==="

    local row
    row=$(jq -nc \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{ts:$ts,job:"self-test",persona:null,model:"sonnet",engine:"claude",cost:0.123456,input_tokens:1000,output_tokens:200,cache_read_tokens:800,cache_creation_tokens:0,cache_hit_ratio:0.80,duration_s:5,success:true,router_model:"sonnet",router_overridden:false,company:null}')

    log_cost "$row"

    local count
    count=$(jq -c '.' "$test_file" 2>/dev/null | wc -l)
    if [ "$count" -eq 1 ]; then
        echo "PASS: row written"
    else
        echo "FAIL: expected 1 row, got $count"
    fi

    if log_cost "" 2>/dev/null; then
        echo "FAIL: empty row should have errored"
    else
        echo "PASS: empty row rejected"
    fi
    if log_cost "not-json" 2>/dev/null; then
        echo "FAIL: invalid JSON should have errored"
    else
        echo "PASS: invalid JSON rejected"
    fi

    echo "=== Done ==="
    cat "$test_file"
    COST_LEDGER_FILE="$orig"
    rm -f "$test_file"
}

if [[ "${1:-}" == "--test" ]]; then
    _cost_self_test
fi
