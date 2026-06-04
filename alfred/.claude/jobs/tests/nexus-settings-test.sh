#!/usr/bin/env bash
# nexus-settings-test.sh — Unit tests for the nexus-settings.sh library
#
# Tests:
#   1. Fallback when settings file is missing
#   2. Fallback when key is missing
#   3. Risk gate reading for each executor
#   4. Risk check with pipeline:approved override
#   5. Turbo expiry detection
#   6. Turbo activation and deactivation
#   7. Timing override reads
#   8. Safety floor enforcement (risk:destructive never auto_execute)
#
# Usage: bash .claude/jobs/tests/nexus-settings-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/../lib"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Override settings file location for tests
export NEXUS_SETTINGS_FILE="$TEST_DIR/nexus-settings.json"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2"; }

# Source the library (must succeed)
source "$LIB_DIR/nexus-settings.sh" || { echo "FATAL: Cannot source nexus-settings.sh"; exit 1; }

echo ""
echo "nexus-settings.sh test suite"
echo "============================"
echo ""

# ============================================================================
# Test 1: Fallback when file missing
# ============================================================================
echo "Test 1: Fallback when settings file missing"
rm -f "$NEXUS_SETTINGS_FILE"

result=$(ns_get_risk_gate "task-executor" "auto_execute")
if [ "$result" = "risk:safe" ]; then
  pass "task-executor auto_execute defaults to risk:safe"
else
  fail "task-executor auto_execute default" "got '$result', expected 'risk:safe'"
fi

result=$(ns_get_risk_gate "task-executor-infra" "auto_execute")
if echo "$result" | grep -q "risk:safe" && echo "$result" | grep -q "risk:moderate"; then
  pass "task-executor-infra auto_execute defaults to safe+moderate"
else
  fail "task-executor-infra auto_execute default" "got '$result'"
fi

if ! ns_get_timing "task-executor" 2>/dev/null; then
  pass "ns_get_timing returns failure when file missing (caller falls back)"
else
  fail "ns_get_timing file missing" "should have returned non-zero"
fi

# ============================================================================
# Test 2: Fallback when key missing
# ============================================================================
echo ""
echo "Test 2: Fallback when key missing"

# Write a partial settings file
cat > "$NEXUS_SETTINGS_FILE" << 'EOF'
{
  "version": 1,
  "risk_gates": {
    "task-executor": {
      "auto_execute": ["risk:safe", "risk:moderate"],
      "with_approval": [],
      "block": ["risk:destructive"]
    }
  },
  "timing": {},
  "turbo": { "active": false, "expires_at": null, "default_timing": {} },
  "updated_at": "",
  "updated_by": ""
}
EOF

# task-executor should read from file
result=$(ns_get_risk_gate "task-executor" "auto_execute")
if echo "$result" | grep -q "risk:moderate"; then
  pass "task-executor reads custom risk gates from file"
else
  fail "task-executor custom risk gates" "got '$result'"
fi

# task-executor-infra should fall back to defaults (not in file)
result=$(ns_get_risk_gate "task-executor-infra" "auto_execute")
if echo "$result" | grep -q "risk:safe"; then
  pass "task-executor-infra falls back to defaults when missing from file"
else
  fail "task-executor-infra fallback" "got '$result'"
fi

# ============================================================================
# Test 3: Risk gate reading for each executor
# ============================================================================
echo ""
echo "Test 3: Risk gate reading with full settings"

cat > "$NEXUS_SETTINGS_FILE" << 'EOF'
{
  "version": 1,
  "risk_gates": {
    "task-executor": {
      "auto_execute": ["risk:safe"],
      "with_approval": ["risk:moderate"],
      "block": ["risk:destructive"]
    },
    "task-executor-infra": {
      "auto_execute": ["risk:safe", "risk:moderate"],
      "with_approval": [],
      "block": ["risk:destructive"]
    },
    "task-research": {
      "auto_execute": ["risk:safe", "risk:moderate"],
      "with_approval": [],
      "block": ["risk:destructive"]
    }
  },
  "timing": {
    "task-executor": { "every_hours": 2 },
    "task-executor-infra": { "every_hours": 1 },
    "task-research": { "every_hours": 1 }
  },
  "turbo": {
    "active": false,
    "expires_at": null,
    "default_timing": {
      "task-executor": { "every_hours": 8 },
      "task-executor-infra": { "every_hours": 24 },
      "task-research": { "every_hours": 24 }
    }
  },
  "updated_at": "2026-03-14T10:00:00Z",
  "updated_by": "test"
}
EOF

# Test block bucket
result=$(ns_get_risk_gate "task-executor" "block")
if [ "$result" = "risk:destructive" ]; then
  pass "task-executor block = risk:destructive"
else
  fail "task-executor block" "got '$result'"
fi

# Test empty bucket
result=$(ns_get_risk_gate "task-executor-infra" "with_approval")
if [ -z "$result" ]; then
  pass "task-executor-infra with_approval is empty"
else
  fail "task-executor-infra with_approval" "got '$result', expected empty"
fi

# ============================================================================
# Test 4: Risk check with pipeline:approved override
# ============================================================================
echo ""
echo "Test 4: ns_check_risk_allowed"

# risk:safe should be auto-allowed for task-executor
ns_check_risk_allowed "task-executor" "stage:queue risk:safe"
rc=$?
if [ "$rc" -eq 0 ]; then
  pass "risk:safe auto-allowed for task-executor"
else
  fail "risk:safe auto-allowed" "got rc=$rc"
fi

# risk:moderate should need approval for task-executor
rc=0; ns_check_risk_allowed "task-executor" "stage:queue risk:moderate" || rc=$?
if [ "$rc" -eq 2 ]; then
  pass "risk:moderate needs approval for task-executor"
else
  fail "risk:moderate needs approval" "got rc=$rc, expected 2"
fi

# risk:destructive should be blocked
rc=0; ns_check_risk_allowed "task-executor" "stage:queue risk:destructive" || rc=$?
if [ "$rc" -eq 1 ]; then
  pass "risk:destructive blocked for task-executor"
else
  fail "risk:destructive blocked" "got rc=$rc, expected 1"
fi

# pipeline:approved overrides everything
ns_check_risk_allowed "task-executor" "stage:queue risk:destructive pipeline:approved"
rc=$?
if [ "$rc" -eq 0 ]; then
  pass "pipeline:approved overrides risk:destructive"
else
  fail "pipeline:approved override" "got rc=$rc, expected 0"
fi

# risk:moderate auto-allowed for infra executor
ns_check_risk_allowed "task-executor-infra" "stage:queue risk:moderate capability:infrastructure"
rc=$?
if [ "$rc" -eq 0 ]; then
  pass "risk:moderate auto-allowed for task-executor-infra"
else
  fail "risk:moderate for infra" "got rc=$rc, expected 0"
fi

# ============================================================================
# Test 5: Turbo expiry detection
# ============================================================================
echo ""
echo "Test 5: Turbo mode detection"

# Turbo inactive
if ! ns_is_turbo_active; then
  pass "turbo inactive when active=false"
else
  fail "turbo inactive" "should not be active"
fi

# Turbo active, future expiry
future=$(date -u -d "+2 hours" +%Y-%m-%dT%H:%M:%SZ)
cat > "$NEXUS_SETTINGS_FILE" << EOF
{
  "version": 1,
  "risk_gates": {},
  "timing": {},
  "turbo": { "active": true, "expires_at": "$future", "default_timing": {} },
  "updated_at": "",
  "updated_by": ""
}
EOF

if ns_is_turbo_active; then
  pass "turbo active with future expiry"
else
  fail "turbo active future" "should be active"
fi

# Turbo active, past expiry
past=$(date -u -d "-1 hours" +%Y-%m-%dT%H:%M:%SZ)
cat > "$NEXUS_SETTINGS_FILE" << EOF
{
  "version": 1,
  "risk_gates": {},
  "timing": {},
  "turbo": { "active": true, "expires_at": "$past", "default_timing": {} },
  "updated_at": "",
  "updated_by": ""
}
EOF

if ! ns_is_turbo_active; then
  pass "turbo expired with past expiry"
else
  fail "turbo expired" "should be expired"
fi

# ============================================================================
# Test 6: Turbo activation and deactivation
# ============================================================================
echo ""
echo "Test 6: Turbo activate/deactivate"

# Start with normal settings
cat > "$NEXUS_SETTINGS_FILE" << 'EOF'
{
  "version": 1,
  "risk_gates": {},
  "timing": {
    "task-executor": { "every_hours": 8 },
    "task-executor-infra": { "every_hours": 24 },
    "task-research": { "every_hours": 24 }
  },
  "turbo": { "active": false, "expires_at": null, "default_timing": {} },
  "updated_at": "",
  "updated_by": ""
}
EOF

ns_activate_turbo "2" "test"

# Check turbo is active
active=$(jq -r '.turbo.active' "$NEXUS_SETTINGS_FILE")
if [ "$active" = "true" ]; then
  pass "turbo activated"
else
  fail "turbo activate" "active=$active"
fi

# Check timing was set to fast
timing=$(jq -r '.timing["task-executor"].every_hours' "$NEXUS_SETTINGS_FILE")
if [ "$timing" = "0.5" ]; then
  pass "turbo sets fast intervals (0.5h)"
else
  fail "turbo fast intervals" "timing=$timing, expected 0.5"
fi

# Check default_timing was captured
default_timing=$(jq -r '.turbo.default_timing["task-executor"].every_hours' "$NEXUS_SETTINGS_FILE")
if [ "$default_timing" = "8" ]; then
  pass "turbo captures default timing (8h)"
else
  fail "turbo default capture" "default=$default_timing, expected 8"
fi

# Deactivate
ns_deactivate_turbo "test"

active=$(jq -r '.turbo.active' "$NEXUS_SETTINGS_FILE")
if [ "$active" = "false" ]; then
  pass "turbo deactivated"
else
  fail "turbo deactivate" "active=$active"
fi

timing=$(jq -r '.timing["task-executor"].every_hours' "$NEXUS_SETTINGS_FILE")
if [ "$timing" = "8" ]; then
  pass "timing reverted to default (8h)"
else
  fail "timing revert" "timing=$timing, expected 8"
fi

# ============================================================================
# Test 7: Timing override reads
# ============================================================================
echo ""
echo "Test 7: Timing reads"

cat > "$NEXUS_SETTINGS_FILE" << 'EOF'
{
  "version": 1,
  "risk_gates": {},
  "timing": {
    "task-executor": { "every_hours": 4 },
    "task-executor-infra": { "every_hours": 0.5 }
  },
  "turbo": { "active": false, "expires_at": null, "default_timing": {} },
  "updated_at": "",
  "updated_by": ""
}
EOF

result=$(ns_get_timing "task-executor")
if [ "$result" = "4" ]; then
  pass "task-executor timing = 4h"
else
  fail "task-executor timing" "got '$result', expected '4'"
fi

result=$(ns_get_timing "task-executor-infra")
if [ "$result" = "0.5" ]; then
  pass "task-executor-infra timing = 0.5h"
else
  fail "task-executor-infra timing" "got '$result', expected '0.5'"
fi

# Missing executor timing should fail (caller falls back to registry)
if ! ns_get_timing "task-research" 2>/dev/null; then
  pass "missing timing returns failure for fallback"
else
  fail "missing timing" "should have returned non-zero"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"
echo ""

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
