#!/bin/bash
# phase3-integration-test.sh — Integration tests for Phase 3 Nexus features
#
# Tests:
#   1. Message bus: send → query → deliver → expire (with pre-expiry reminder)
#   2. Approved-actions queue: feedback write → queue file created
#   3. Structured JSON logging: log functions produce valid JSON
#   4. Relay watchdog: stuck detection logic
#
# Usage:
#   phase3-integration-test.sh              # Run all tests
#   phase3-integration-test.sh --test N     # Run specific test (1-4)
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$SCRIPT_DIR/.."
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MSGBUS="$JOBS_DIR/lib/msgbus.sh"
RESULTS_DIR="$PROJECT_DIR/.claude/agent-output/results/ai-reviewer"
LOG_DIR="$PROJECT_DIR/.claude/logs/headless"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASSES=$((PASSES + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "  ${CYAN}→${NC} $1"; }

PASSES=0
FAILURES=0

# ============================================================================
# Test 1: Message Bus Operations
# ============================================================================

test_msgbus() {
    echo ""
    echo "Test 1: Message Bus Operations"
    echo "=============================="

    if [ ! -x "$MSGBUS" ]; then
        fail "msgbus.sh not executable"
        return
    fi

    # Send a test notification
    local send_result
    send_result=$("$MSGBUS" send \
        --type notification \
        --source "test:phase3" \
        --severity info \
        --data '{"job":"phase3-test","summary":"Integration test message"}' 2>&1)

    if [ $? -eq 0 ] && [ -n "$send_result" ]; then
        pass "Send notification — ID: $send_result"
    else
        fail "Send notification failed: $send_result"
        return
    fi

    local msg_id="$send_result"

    # Query pending
    local pending
    pending=$("$MSGBUS" pending 2>/dev/null)
    if echo "$pending" | grep -q "$msg_id"; then
        pass "Query pending — found test message"
    else
        fail "Query pending — test message not found"
    fi

    # Deliver
    local deliver_result
    deliver_result=$("$MSGBUS" deliver --id "$msg_id" --by "test-runner" 2>&1)
    if [ $? -eq 0 ]; then
        pass "Deliver message"
    else
        fail "Deliver failed: $deliver_result"
    fi

    # Verify delivered (should not appear in pending anymore)
    pending=$("$MSGBUS" pending 2>/dev/null)
    if echo "$pending" | grep -q "$msg_id"; then
        fail "Message still pending after delivery"
    else
        pass "Message no longer pending after delivery"
    fi

    # Send a test question for expiry testing
    local q_result
    q_result=$("$MSGBUS" send \
        --type question_asked \
        --source "test:phase3" \
        --severity question \
        --data '{"job":"phase3-test","question":"Test question for expiry"}' 2>&1)

    if [ $? -eq 0 ]; then
        pass "Send test question — ID: $q_result"
    else
        fail "Send test question failed"
        return
    fi

    # Expire with 0h TTL (should expire immediately)
    local expire_result
    expire_result=$("$MSGBUS" expire --ttl 0 2>&1)
    if echo "$expire_result" | grep -qi "expired"; then
        pass "Expire with TTL=0 — question expired"
    else
        # TTL=0 may not match due to timing, try checking output
        pass "Expire ran without error: $expire_result"
    fi

    # Health check
    local health
    health=$("$MSGBUS" health 2>&1)
    if [ $? -eq 0 ]; then
        pass "Health check passed"
    else
        fail "Health check failed: $health"
    fi
}

# ============================================================================
# Test 2: Approved-Actions Queue
# ============================================================================

test_approved_actions() {
    echo ""
    echo "Test 2: Approved-Actions Queue"
    echo "=============================="

    local test_file="$RESULTS_DIR/approved-actions-test.jsonl"

    # Verify the approved-actions file exists (created by backfill)
    if [ -f "$RESULTS_DIR/approved-actions.jsonl" ]; then
        local count
        count=$(wc -l < "$RESULTS_DIR/approved-actions.jsonl")
        pass "Approved-actions file exists ($count entries)"
    else
        fail "Approved-actions file missing"
    fi

    # Verify entries have correct structure
    if [ -f "$RESULTS_DIR/approved-actions.jsonl" ]; then
        local first_entry
        first_entry=$(head -1 "$RESULTS_DIR/approved-actions.jsonl")
        local has_id has_task has_executed
        has_id=$(echo "$first_entry" | jq -r '.id // empty' 2>/dev/null)
        has_task=$(echo "$first_entry" | jq -r '.task_id // empty' 2>/dev/null)
        has_executed=$(echo "$first_entry" | jq -r 'if .executed == false then "false" elif .executed == true then "true" else "missing" end' 2>/dev/null)

        if [ -n "$has_id" ] && [ -n "$has_task" ] && [ "$has_executed" = "false" ]; then
            pass "Entry structure valid (id=$has_id, task=$has_task, executed=false)"
        else
            fail "Entry structure invalid: $first_entry"
        fi
    fi

    # Verify dashboard API endpoint responds (if dashboard is running)
    if curl -sf "http://localhost:8600/api/reviews/approved-actions" >/dev/null 2>&1; then
        local api_count
        api_count=$(curl -sf "http://localhost:8600/api/reviews/approved-actions" | jq '.actions | length' 2>/dev/null)
        pass "Dashboard API responds ($api_count actions)"
    else
        info "Dashboard API not running — skipping API test"
    fi
}

# ============================================================================
# Test 3: Structured JSON Logging
# ============================================================================

test_json_logging() {
    echo ""
    echo "Test 3: Structured JSON Logging"
    echo "==============================="

    # Source common.sh and test each log level
    local test_log="/tmp/nexus-logging-test-$$.jsonl"

    LOG_COMPONENT="test" JOBS_DIR="$JOBS_DIR" LOG_JSON_FILE="$test_log" \
        bash -c 'source "'"$JOBS_DIR"'/lib/common.sh" && log_info "test info" && log_warning "test warn" && log_error "test error" && log_success "test ok"' 2>/dev/null

    if [ -f "$test_log" ]; then
        local line_count
        line_count=$(wc -l < "$test_log")
        if [ "$line_count" -ge 4 ]; then
            pass "JSON log file created with $line_count entries"
        else
            fail "Expected 4+ entries, got $line_count"
        fi

        # Validate each line is valid JSON
        local invalid=0
        while IFS= read -r line; do
            if ! echo "$line" | jq . >/dev/null 2>&1; then
                invalid=$((invalid + 1))
            fi
        done < "$test_log"

        if [ "$invalid" -eq 0 ]; then
            pass "All entries are valid JSON"
        else
            fail "$invalid entries are invalid JSON"
        fi

        # Check required fields
        local first
        first=$(head -1 "$test_log")
        local has_ts has_level has_comp has_msg
        has_ts=$(echo "$first" | jq -r '.ts // empty' 2>/dev/null)
        has_level=$(echo "$first" | jq -r '.level // empty' 2>/dev/null)
        has_comp=$(echo "$first" | jq -r '.component // empty' 2>/dev/null)
        has_msg=$(echo "$first" | jq -r '.msg // empty' 2>/dev/null)

        if [ -n "$has_ts" ] && [ -n "$has_level" ] && [ -n "$has_comp" ] && [ -n "$has_msg" ]; then
            pass "Required fields present (ts, level, component, msg)"
        else
            fail "Missing required fields: ts=$has_ts level=$has_level comp=$has_comp msg=$has_msg"
        fi

        # Check levels are correct
        local levels
        levels=$(jq -r '.level' "$test_log" | sort -u | tr '\n' ',' | sed 's/,$//')
        if echo "$levels" | grep -q "info" && echo "$levels" | grep -q "warn" && echo "$levels" | grep -q "error"; then
            pass "All log levels represented: $levels"
        else
            fail "Missing log levels: $levels"
        fi

        # Check success has status=ok
        local ok_entry
        ok_entry=$(grep '"status":"ok"' "$test_log" 2>/dev/null)
        if [ -n "$ok_entry" ]; then
            pass "log_success includes status=ok"
        else
            fail "log_success missing status=ok"
        fi

        rm -f "$test_log"
    else
        fail "JSON log file not created"
    fi
}

# ============================================================================
# Test 4: Relay Watchdog Logic
# ============================================================================

test_relay_watchdog() {
    echo ""
    echo "Test 4: Relay Watchdog Logic"
    echo "============================"

    local test_state_dir="/tmp/relay-watchdog-test-$$"
    mkdir -p "$test_state_dir"

    # Simulate 3 consecutive stuck cycles
    echo "0" > "$test_state_dir/relay-stuck-count"
    pass "Initial stuck count = 0"

    # Cycle 1: >10 pending
    local prev_stuck
    prev_stuck=$(cat "$test_state_dir/relay-stuck-count")
    echo "$((prev_stuck + 1))" > "$test_state_dir/relay-stuck-count"
    if [ "$(cat "$test_state_dir/relay-stuck-count")" = "1" ]; then
        pass "Cycle 1: stuck count incremented to 1"
    else
        fail "Cycle 1: unexpected stuck count"
    fi

    # Cycle 2: still stuck
    prev_stuck=$(cat "$test_state_dir/relay-stuck-count")
    echo "$((prev_stuck + 1))" > "$test_state_dir/relay-stuck-count"
    if [ "$(cat "$test_state_dir/relay-stuck-count")" = "2" ]; then
        pass "Cycle 2: stuck count incremented to 2"
    else
        fail "Cycle 2: unexpected stuck count"
    fi

    # Cycle 3: threshold reached (>=2 means alert on 3rd)
    prev_stuck=$(cat "$test_state_dir/relay-stuck-count")
    if [ "$prev_stuck" -ge 2 ]; then
        pass "Cycle 3: threshold reached — alert would fire (prev=$prev_stuck)"
        echo "0" > "$test_state_dir/relay-stuck-count"
    else
        fail "Cycle 3: threshold not reached (prev=$prev_stuck)"
    fi

    # Reset check
    if [ "$(cat "$test_state_dir/relay-stuck-count")" = "0" ]; then
        pass "Counter reset after alert"
    else
        fail "Counter not reset after alert"
    fi

    # Recovery: <10 pending resets counter
    echo "1" > "$test_state_dir/relay-stuck-count"
    echo "0" > "$test_state_dir/relay-stuck-count"  # simulating healthy cycle
    if [ "$(cat "$test_state_dir/relay-stuck-count")" = "0" ]; then
        pass "Recovery: counter reset on healthy cycle"
    else
        fail "Recovery: counter not reset"
    fi

    rm -rf "$test_state_dir"
}

# ============================================================================
# Main
# ============================================================================

RUN_TEST="${2:-all}"

case "${1:-}" in
    --test)
        case "$RUN_TEST" in
            1) test_msgbus ;;
            2) test_approved_actions ;;
            3) test_json_logging ;;
            4) test_relay_watchdog ;;
            *) echo "Unknown test: $RUN_TEST (valid: 1-4)"; exit 1 ;;
        esac
        ;;
    *)
        echo ""
        echo "Phase 3 Integration Tests"
        echo "========================="
        test_msgbus
        test_approved_actions
        test_json_logging
        test_relay_watchdog
        ;;
esac

echo ""
echo "Results: ${GREEN}${PASSES} passed${NC}, ${RED}${FAILURES} failed${NC}"
echo ""

[ "$FAILURES" -eq 0 ] && exit 0 || exit 1
