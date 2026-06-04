#!/usr/bin/env bash
# scripts/archon/test.sh
# Integration test for Archon utilities (register.sh, task-create.sh).
#
# Lifecycle tested:
#   1. Register a test Archon  → registration task auto-closes
#   2. Emit 3 test tasks       → all open
#   3. Claim one               → status = in_progress, others remain open
#   4. Close all               → all closed
#
# Idempotent: pre-flight cleanup ensures clean state on every run.
#
# Usage: test.sh [--verbose]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

ARCHON="archon-test"
TEST_TAG="archon-test:integration"
TMPTEST=$(mktemp -d)
MANIFEST="$TMPTEST/manifest.yaml"
PASS=0
FAIL=0
TASK_IDS=()

# ─── helpers ──────────────────────────────────────────────────────────────────

log()  { $VERBOSE && printf "  [dbg] %s\n" "$*" >&2 || true; }
pass() { PASS=$((PASS+1)); printf "  PASS  %s\n" "$*"; }
fail() { FAIL=$((FAIL+1)); printf "  FAIL  %s\n" "$*" >&2; }
die()  { printf "FATAL: %s\n" "$*" >&2; exit 1; }

get_status() {
    # pulse show prints a blank line then: "AION-xxx  [status]  Priority"
    pulse show "$1" 2>/dev/null | grep -m1 '\[' | sed 's/.*\[//;s/\].*//' || echo "unknown"
}

assert_status() {
    local id="$1" expected="$2" label="$3"
    local actual
    actual=$(get_status "$id")
    if [[ "$actual" == "$expected" ]]; then
        pass "$label (status=$actual)"
    else
        fail "$label: expected=$expected got=$actual"
    fi
}

cleanup_test_tasks() {
    local st ids id
    for st in open in_progress; do
        ids=$(pulse list --status "$st" --label "$TEST_TAG" --json 2>/dev/null \
            | jq -r '.tasks[].id' 2>/dev/null) || true
        [[ -n "$ids" ]] || continue
        while IFS= read -r id; do
            [[ -n "$id" ]] || continue
            pulse update "$id" --status open >/dev/null 2>&1 || true
            pulse close "$id" --reason "test-cleanup" >/dev/null 2>&1 || true
        done <<< "$ids"
    done
}

cleanup() {
    cleanup_test_tasks
    rm -rf "$TMPTEST"
}
trap cleanup EXIT

# ─── pre-flight (idempotency) ─────────────────────────────────────────────────

echo "==> Archon utilities integration test"
echo "--- pre-flight: cleaning up leftover test tasks"
cleanup_test_tasks

# ─── step 1: register archon ──────────────────────────────────────────────────

echo "--- step 1: register Archon"

cat > "$MANIFEST" <<YAML
name: ${ARCHON}
version: "0.0.1"
source: archon-test-runner
capabilities: [testing]
domains: [testing]
emits_kinds: [test-task]
YAML

reg_id=$("$SCRIPT_DIR/register.sh" "$MANIFEST") \
    || die "register.sh failed"
log "registration task: $reg_id"
[[ "$reg_id" =~ ^AION-[0-9a-f]+$ ]] \
    || die "unexpected task ID format from register.sh: $reg_id"

assert_status "$reg_id" "closed" "registration task auto-closes"

# ─── step 2: emit 3 test tasks ────────────────────────────────────────────────

echo "--- step 2: emit 3 test tasks"

for i in 1 2 3; do
    tid=$("$SCRIPT_DIR/task-create.sh" \
        --archon "$ARCHON" \
        --label "$TEST_TAG" \
        --domain "testing" \
        --risk "safe" \
        --priority 4 \
        "Test task $i (archon integration test)") \
        || die "task-create.sh failed for task $i"
    log "emitted task $i: $tid"
    [[ "$tid" =~ ^AION-[0-9a-f]+$ ]] \
        || die "unexpected task ID format from task-create.sh: $tid"
    TASK_IDS+=("$tid")
done

echo "--- asserting all 3 tasks open"
for i in 0 1 2; do
    assert_status "${TASK_IDS[$i]}" "open" "task $((i+1)) open after emission"
done

# ─── step 3: claim task 1 ─────────────────────────────────────────────────────

echo "--- step 3: claim task 1"
pulse update "${TASK_IDS[0]}" --status in_progress --claim >/dev/null 2>&1 \
    || die "claim failed for ${TASK_IDS[0]}"

assert_status "${TASK_IDS[0]}" "in_progress" "task 1 claimed → in_progress"
assert_status "${TASK_IDS[1]}" "open" "task 2 unaffected by claim"
assert_status "${TASK_IDS[2]}" "open" "task 3 unaffected by claim"

# ─── step 4: close all ────────────────────────────────────────────────────────

echo "--- step 4: close all 3 tasks"
for i in 0 1 2; do
    # reset to open first in case task is in_progress (pulse close may require open state)
    pulse update "${TASK_IDS[$i]}" --status open >/dev/null 2>&1 || true
    pulse close "${TASK_IDS[$i]}" --reason "archon integration test complete" >/dev/null 2>&1 \
        || die "close failed for ${TASK_IDS[$i]}"
    assert_status "${TASK_IDS[$i]}" "closed" "task $((i+1)) closed"
done

# ─── summary ──────────────────────────────────────────────────────────────────

echo ""
printf "Results: %d passed, %d failed\n" "$PASS" "$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
echo "All tests passed."
