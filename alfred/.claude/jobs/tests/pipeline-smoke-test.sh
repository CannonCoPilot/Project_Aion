#!/bin/bash
# pipeline-smoke-test.sh — End-to-end pipeline validation
#
# Creates a test Pulse task and watches it flow through the pipeline:
#   create → event-watcher detects → evaluator classifies → labels applied
#
# Usage:
#   pipeline-smoke-test.sh              # Full smoke test
#   pipeline-smoke-test.sh --check-only # Just check pipeline component health
#   pipeline-smoke-test.sh --watch <id> # Watch an existing task through pipeline
#
# Exit codes:
#   0 — pipeline working correctly
#   1 — pipeline failure (with diagnostics)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
JOBS_DIR="$SCRIPT_DIR/.."
DASHBOARD_URL="http://localhost:8600"
# BEADS = DEAD — Pulse API is the task backend now
EVENTS_FILE="$PROJECT_DIR/.claude/jobs/messages.jsonl"
WATCHER_LOG="$PROJECT_DIR/.claude/logs/headless/event-watcher.log"

# Ensure pulse is available
if ! command -v pulse &>/dev/null; then
    NODE_BIN=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name bin -type d 2>/dev/null | head -1)
    [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

FAILURES=0

# ============================================================================
# Component Health Check
# ============================================================================

check_components() {
    echo ""
    echo "Pipeline Component Health"
    echo "========================="

    # Dashboard API
    if curl -sf "$DASHBOARD_URL/api/health" >/dev/null 2>&1; then
        pass "Dashboard API responding"
    else
        fail "Dashboard API not responding at $DASHBOARD_URL"
        FAILURES=$((FAILURES + 1))
    fi

    # Events file
    if [ -f "$EVENTS_FILE" ]; then
        EVENT_COUNT=$(wc -l < "$EVENTS_FILE")
        pass "Events file exists ($EVENT_COUNT events)"
    else
        fail "Events file missing: $EVENTS_FILE"
        FAILURES=$((FAILURES + 1))
    fi

    # Event-watcher cursor
    CURSOR_FILE="$JOBS_DIR/state/event-watcher-cursor"
    if [ -f "$CURSOR_FILE" ]; then
        CURSOR=$(cat "$CURSOR_FILE")
        TOTAL=$(wc -l < "$EVENTS_FILE" 2>/dev/null || echo 0)
        BEHIND=$((TOTAL - CURSOR))
        if [ "$BEHIND" -le 0 ]; then
            pass "Event-watcher cursor current (at $CURSOR)"
        else
            warn "Event-watcher $BEHIND events behind (cursor: $CURSOR, total: $TOTAL)"
        fi
    else
        fail "Event-watcher cursor file missing"
        FAILURES=$((FAILURES + 1))
    fi

    # Dispatcher
    HEALTH=$(curl -sf "$DASHBOARD_URL/api/health" 2>/dev/null || echo "{}")
    DISP_STATUS=$(echo "$HEALTH" | jq -r '.dispatcher.status // "unknown"' 2>/dev/null)
    if [ "$DISP_STATUS" = "ok" ]; then
        pass "Dispatcher heartbeat OK"
    else
        warn "Dispatcher status: $DISP_STATUS"
    fi

    # Evaluator job
    EVAL_LAST=$(echo "$HEALTH" | jq -r '.jobs[] | select(.name == "task-evaluator") | .lastRun // "never"' 2>/dev/null)
    if [ -n "$EVAL_LAST" ] && [ "$EVAL_LAST" != "never" ]; then
        pass "Task evaluator last ran: $EVAL_LAST"
    else
        warn "Task evaluator: no recent runs found"
    fi

    # WebSocket
    WS_CHECK=$(curl -sf "$DASHBOARD_URL/api/health" 2>/dev/null | jq -r '.status' 2>/dev/null)
    if [ "$WS_CHECK" = "ok" ]; then
        pass "Server health OK"
    else
        fail "Server health check failed"
        FAILURES=$((FAILURES + 1))
    fi

    echo ""
    if [ "$FAILURES" -gt 0 ]; then
        fail "$FAILURES component(s) unhealthy"
        return 1
    else
        pass "All components healthy"
        return 0
    fi
}

# ============================================================================
# Watch Task Through Pipeline
# ============================================================================

watch_task() {
    local TASK_ID="$1"
    local TIMEOUT="${2:-300}"  # 5 minutes default
    local POLL_INTERVAL=10
    local ELAPSED=0

    echo ""
    echo "Watching $TASK_ID Through Pipeline"
    echo "==================================="
    info "Timeout: ${TIMEOUT}s, polling every ${POLL_INTERVAL}s"

    # Track which stages we've seen
    local SAW_EVALUATED=false
    local SAW_APPROVED=false
    local SAW_ROUTED=false
    local SAW_CAPABILITY=false
    local LAST_LABELS=""

    while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
        # Get current task state
        TASK_DATA=$(pulse show "$TASK_ID" 2>/dev/null || true)
        CURRENT_LABELS=$(echo "$TASK_DATA" | grep "^LABELS:" | sed 's/LABELS: //' || true)

        # Check for new labels
        if [ "$CURRENT_LABELS" != "$LAST_LABELS" ]; then
            if echo "$CURRENT_LABELS" | grep -q "stage:evaluate" && [ "$SAW_EVALUATED" = false ]; then
                pass "Stage 1: Evaluated (${ELAPSED}s)"
                SAW_EVALUATED=true
            fi
            if echo "$CURRENT_LABELS" | grep -q "capability:" && [ "$SAW_CAPABILITY" = false ]; then
                CAP=$(echo "$CURRENT_LABELS" | grep -o 'capability:[a-z-]*' || true)
                pass "Stage 2: Capability classified — $CAP (${ELAPSED}s)"
                SAW_CAPABILITY=true
            fi
            if echo "$CURRENT_LABELS" | grep -q "pipeline:approved" && [ "$SAW_APPROVED" = false ]; then
                pass "Stage 3: Approved (${ELAPSED}s)"
                SAW_APPROVED=true
            fi
            if echo "$CURRENT_LABELS" | grep -q "type:research\|pipeline:approved" && [ "$SAW_ROUTED" = false ]; then
                pass "Stage 4: Routed to executor (${ELAPSED}s)"
                SAW_ROUTED=true
            fi
            LAST_LABELS="$CURRENT_LABELS"
        fi

        # Check task status
        TASK_STATUS=$(echo "$TASK_DATA" | grep -oP '\[● P\d · \K[A-Z_]+' | head -1 || true)
        if [ "$TASK_STATUS" = "IN_PROGRESS" ] || [ "$TASK_STATUS" = "CLOSED" ]; then
            pass "Stage 5: Execution started — status: $TASK_STATUS (${ELAPSED}s)"
            SAW_ROUTED=true
            break
        fi

        # All stages complete?
        if [ "$SAW_EVALUATED" = true ] && [ "$SAW_APPROVED" = true ] && [ "$SAW_ROUTED" = true ]; then
            break
        fi

        sleep "$POLL_INTERVAL"
        ELAPSED=$((ELAPSED + POLL_INTERVAL))
        printf "\r  → Waiting... %ds / %ds" "$ELAPSED" "$TIMEOUT"
    done
    echo ""

    # Summary
    echo ""
    echo "Pipeline Stage Summary"
    echo "======================"
    [ "$SAW_EVALUATED" = true ] && pass "Evaluated" || fail "Evaluated"
    [ "$SAW_CAPABILITY" = true ] && pass "Capability classified" || warn "Capability not yet classified"
    [ "$SAW_APPROVED" = true ] && pass "Approved" || fail "Approved"
    [ "$SAW_ROUTED" = true ] && pass "Routed to executor" || fail "Routed to executor"
    echo ""
    info "Final labels: $CURRENT_LABELS"

    if [ "$SAW_EVALUATED" = false ]; then
        echo ""
        echo "Diagnostics"
        echo "==========="
        warn "Task was not evaluated. Checking event-watcher..."
        CREATION_EVENT=$(grep "$TASK_ID" "$EVENTS_FILE" 2>/dev/null | jq -c 'select(.event_type == "created")' 2>/dev/null | head -1)
        if [ -z "$CREATION_EVENT" ]; then
            fail "No creation event found in events.jsonl — Pulse event logging may be broken"
        else
            EVENT_ID=$(echo "$CREATION_EVENT" | jq -r '.id')
            pass "Creation event exists (id: $EVENT_ID)"
            if grep -q "$TASK_ID" "$WATCHER_LOG" 2>/dev/null; then
                pass "Event-watcher saw the task"
                warn "Evaluator may have hit max-per-run limit or errored"
            else
                fail "Event-watcher never logged this task — check cron and cursor"
            fi
        fi
    fi

    if [ "$SAW_EVALUATED" = true ] && [ "$SAW_APPROVED" = false ]; then
        echo ""
        echo "Diagnostics"
        echo "==========="
        if echo "$CURRENT_LABELS" | grep -q "waiting:human"; then
            info "Task needs your input — check notes for questions"
        elif echo "$CURRENT_LABELS" | grep -q "capability:research"; then
            info "Task routed to research first — approval comes after"
        else
            warn "Task evaluated but not approved — check evaluator notes"
        fi
    fi

    [ "$ELAPSED" -ge "$TIMEOUT" ] && warn "Timed out after ${TIMEOUT}s"

    if [ "$SAW_EVALUATED" = true ] && [ "$SAW_ROUTED" = true ]; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Full Smoke Test
# ============================================================================

run_smoke_test() {
    echo ""
    echo "Pipeline End-to-End Smoke Test"
    echo "=============================="
    echo ""

    # Step 1: Component health
    info "Step 1: Component health check"
    if ! check_components; then
        fail "Component health check failed — fix issues before running smoke test"
        return 1
    fi

    # Step 2: Create test task
    info "Step 2: Creating test task..."
    TEST_OUTPUT=$(pulse create \
        --title "Pipeline Smoke Test — $(date +%Y-%m-%d-%H%M)" \
        --description "Automated pipeline smoke test. This task validates the create→evaluate→route flow. Safe to close immediately after evaluation. Auto-generated by pipeline-smoke-test.sh." \
        --priority 4 \
        --label "domain:coding,source:smoke-test,test:pipeline" 2>&1)

    TASK_ID=$(echo "$TEST_OUTPUT" | grep -oP '[A-Za-z]+-[a-z0-9]+' | head -1)
    if [ -z "$TASK_ID" ]; then
        fail "Failed to create test task"
        echo "$TEST_OUTPUT"
        return 1
    fi
    pass "Created test task: $TASK_ID"

    # Step 3: Watch it flow
    info "Step 3: Watching task through pipeline..."
    if watch_task "$TASK_ID" 300; then
        pass "Pipeline smoke test PASSED"

        # Cleanup
        info "Cleaning up test task..."
        pulse close "$TASK_ID" --reason "Smoke test passed — auto-cleanup" 2>/dev/null || true
        pass "Test task closed"
        return 0
    else
        fail "Pipeline smoke test FAILED"
        info "Test task $TASK_ID left open for investigation"
        return 1
    fi
}

# ============================================================================
# Main
# ============================================================================

case "${1:-}" in
    --check-only)
        check_components
        exit $?
        ;;
    --watch)
        WATCH_ID="${2:-}"
        if [ -z "$WATCH_ID" ]; then
            echo "Usage: pipeline-smoke-test.sh --watch <task-id>"
            exit 1
        fi
        watch_task "$WATCH_ID" "${3:-300}"
        exit $?
        ;;
    *)
        run_smoke_test
        exit $?
        ;;
esac
