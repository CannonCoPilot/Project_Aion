#!/bin/bash
# assertions.sh — Post-execution assertion library for executor.sh
#
# Provides modular, log-only assertions that run after LLM execution completes.
# Assertions are immediate checks (0s delay) that complement the pipeline-watchdog's
# reactive 5-minute cycle. They do NOT auto-fix — the watchdog handles remediation.
#
# Sourced by executor.sh after common.sh, label-ops.sh, pulse-api.sh.
# All functions assume those libraries are already in scope.
#
# Created: 2026-03-26 (Harness Evolution Phase 2)
# Reference: .claude/context/patterns/long-running-agent-harness-patterns.md

# Guard against double-sourcing
[[ -n "${_ASSERTIONS_LOADED:-}" ]] && return 0
_ASSERTIONS_LOADED=1

# ============================================================================
# Individual Assertions
# ============================================================================

# Assert that a claimed task reached a resolved state (closed or explicitly parked).
# Severity: critical — task left in_progress after execution indicates executor bug.
#
# Args: $1 = task_id, $2 = job_name
assert_task_resolved() {
    local task_id="$1"
    local job_name="$2"

    [ -z "$task_id" ] && return 0  # No task claimed — nothing to assert

    local task_json
    task_json=$(pulse_get_task "$task_id" 2>/dev/null) || return 0  # API failure — skip gracefully

    local status
    status=$(echo "$task_json" | jq -r '.status // empty' 2>/dev/null) || true

    if [ "$status" = "in_progress" ]; then
        log_warning "ASSERTION FAILED: Task $task_id still in_progress after $job_name execution — expected closed or waiting"

        # Write notification for visibility (critical — this indicates a bug).
        # MSGBUS is a standalone script (not a function library) — invoke as executable.
        if [ -x "${MSGBUS:-}" ]; then
            "$MSGBUS" send \
                --type "assertion_failed" \
                --source "executor:$job_name" \
                --severity "critical" \
                --job "$job_name" \
                --data "$(jq -nc --arg tid "$task_id" --arg jn "$job_name" \
                    '{task_id:$tid,message:"task not resolved after execution",job:$jn}')" \
                2>/dev/null || true
        fi
        return 1
    fi

    return 0
}

# Assert that the executor's claim (assignee field) was properly released.
# Severity: warning — orphaned claims are caught by watchdog at 30min but this is immediate.
#
# Args: $1 = task_id, $2 = job_name
assert_claim_released() {
    local task_id="$1"
    local job_name="$2"

    [ -z "$task_id" ] && return 0

    local task_json
    task_json=$(pulse_get_task "$task_id" 2>/dev/null) || return 0

    local assignee
    assignee=$(echo "$task_json" | jq -r '.assignee // empty' 2>/dev/null) || true

    if [ -n "$assignee" ]; then
        log_warning "ASSERTION: Task $task_id still has assignee '$assignee' after $job_name execution"
        return 1
    fi

    return 0
}

# Assert no uncommitted git changes were left behind by the executor.
# Severity: warning — clean state invariant (Anthropic Pattern 6).
#
# Args: $1 = job_name
assert_clean_workdir() {
    local job_name="$1"
    local project_dir="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

    # Only check if we're in a git repo
    if ! git -C "$project_dir" rev-parse --is-inside-work-tree &>/dev/null; then
        return 0
    fi

    local dirty_output
    dirty_output=$(git -C "$project_dir" status --porcelain 2>/dev/null) || true

    local dirty
    dirty=$(echo "$dirty_output" | head -5)

    if [ -n "$dirty" ]; then
        local count
        count=$(echo "$dirty_output" | wc -l)
        log_warning "ASSERTION: $count uncommitted changes in working directory after $job_name execution"
        return 1
    fi

    return 0
}

# ============================================================================
# Runner — called from executor.sh post-execution block
# ============================================================================

# Run all post-execution assertions. Failures are logged but never block execution.
# The executor has already completed successfully at this point — assertions are
# observability, not control flow.
#
# Args: $1 = task_id (may be empty), $2 = job_name
# Returns: 0 always (assertions are advisory)
run_post_assertions() {
    local task_id="$1"
    local job_name="$2"
    local failures=0

    # Use $((failures + 1)) instead of ((failures++)) to avoid set -e abort.
    # ((0)) returns exit code 1 in bash, which kills the executor under set -euo pipefail.
    assert_task_resolved "$task_id" "$job_name" || failures=$((failures + 1))
    assert_claim_released "$task_id" "$job_name" || failures=$((failures + 1))
    # Note: assert_clean_workdir is intentionally commented out for now.
    # AIProjects has 1400+ uncommitted files (agent output, logs, etc.) that would
    # trigger this on every run. Enable when the repo's gitignore covers agent output.
    # assert_clean_workdir "$job_name" || failures=$((failures + 1))

    if [ "$failures" -gt 0 ]; then
        log_warning "Post-execution assertions: $failures failed for $job_name (task: ${task_id:-none})"
    fi

    return 0  # Always succeed — assertions are advisory
}
