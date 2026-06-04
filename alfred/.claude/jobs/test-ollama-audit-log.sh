#!/usr/bin/env bash
# test-ollama-audit-log.sh
# Exercises _ollama_chat_audit_log for all 5 required event types and
# writes a sample JSONL audit log demonstrating full coverage.
#
# Usage:
#   PROJECT_DIR=/path/to/project bash test-ollama-audit-log.sh [output_file]
#
# Output: JSONL file at $OLLAMA_CHAT_AUDIT_LOG (or default path)

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SAMPLE_LOG="${1:-${PROJECT_DIR}/.claude/agent-output/results/pipeline-validation/sample-ollama-chat-audit.jsonl}"
export OLLAMA_CHAT_AUDIT_LOG="$SAMPLE_LOG"
export JOB_NAME="test-context-maintenance"
export NEXUS_THREAD_ID="test-thread-$(date +%s)"

# ── Stub dependencies ────────────────────────────────────────────────────────
# Provide minimal stubs so executor.sh functions load without the full env.
YQ="${YQ:-yq}"
LOG_FILE="/dev/null"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

# ── Extract only the audit logger from executor.sh ───────────────────────────
EXECUTOR="${PROJECT_DIR}/.claude/jobs/executor.sh"
if [ ! -f "$EXECUTOR" ]; then
    echo "ERROR: executor.sh not found at $EXECUTOR" >&2
    exit 1
fi

# Source just the _ollama_chat_audit_log function block (lines 750-774)
eval "$(sed -n '750,774p' "$EXECUTOR")"

# ── Reset output file ────────────────────────────────────────────────────────
mkdir -p "$(dirname "$SAMPLE_LOG")"
> "$SAMPLE_LOG"

echo "[TEST] Writing sample audit events to: $SAMPLE_LOG"

# ── Event 1: session_start ───────────────────────────────────────────────────
_ollama_chat_audit_log "session_start" \
    "model=qwen3:32b" \
    "max_rounds=8" \
    "ollama_url=${OLLAMA_URL}" \
    "prompt_chars=1482"

echo "[TEST] ✓ session_start written"

# ── Event 2: request ─────────────────────────────────────────────────────────
_ollama_chat_audit_log "request" \
    "round=1" \
    "endpoint=${OLLAMA_URL}/api/chat" \
    "model=qwen3:32b" \
    "messages_in_context=1"

echo "[TEST] ✓ request written"

# ── Event 3: response (with tool calls) ──────────────────────────────────────
_ollama_chat_audit_log "response" \
    "round=1" \
    "status=ok" \
    "has_tool_calls=true" \
    "tool_calls_count=1" \
    "content_chars=0" \
    "eval_count=47"

echo "[TEST] ✓ response (with tool_calls) written"

# ── Event 4: tool_call ────────────────────────────────────────────────────────
_ollama_chat_audit_log "tool_call" \
    "round=1" \
    "call_index=0" \
    "function=run_command" \
    "command=pulse list --status open --json" \
    "exit_code=0" \
    "duration_ms=124" \
    "output_chars=1830" \
    "truncated=false"

echo "[TEST] ✓ tool_call written"

# ── Event 5: request (round 2) ────────────────────────────────────────────────
_ollama_chat_audit_log "request" \
    "round=2" \
    "endpoint=${OLLAMA_URL}/api/chat" \
    "model=qwen3:32b" \
    "messages_in_context=3"

echo "[TEST] ✓ request (round 2) written"

# ── Event 6: response (final, no tool calls) ──────────────────────────────────
_ollama_chat_audit_log "response" \
    "round=2" \
    "status=ok" \
    "has_tool_calls=false" \
    "tool_calls_count=0" \
    "content_chars=312" \
    "eval_count=89"

echo "[TEST] ✓ response (final, no tool_calls) written"

# ── Event 7: session_end ──────────────────────────────────────────────────────
_ollama_chat_audit_log "session_end" \
    "stop_reason=model_done" \
    "rounds_used=2" \
    "total_tool_calls=1" \
    "result_chars=312"

echo "[TEST] ✓ session_end written"

# ── Verify coverage ────────────────────────────────────────────────────────
echo ""
echo "[TEST] Verifying event type coverage..."
REQUIRED_EVENTS="session_start request response tool_call session_end"
ALL_PASS=true
for event in $REQUIRED_EVENTS; do
    count=$(grep -c "\"event\":\"${event}\"" "$SAMPLE_LOG" 2>/dev/null || echo 0)
    if [ "$count" -gt 0 ]; then
        echo "[TEST] ✅ PASS  $event ($count occurrence(s))"
    else
        echo "[TEST] ❌ FAIL  $event — not found in output"
        ALL_PASS=false
    fi
done

# ── Validate JSONL (each line must be valid JSON) ─────────────────────────
echo ""
echo "[TEST] Validating JSONL format..."
line_num=0
json_errors=0
while IFS= read -r line; do
    line_num=$((line_num + 1))
    if ! echo "$line" | jq empty 2>/dev/null; then
        echo "[TEST] ❌ Invalid JSON on line $line_num: $line" >&2
        json_errors=$((json_errors + 1))
    fi
done < "$SAMPLE_LOG"

if [ "$json_errors" -eq 0 ]; then
    echo "[TEST] ✅ PASS  All $line_num lines are valid JSON"
else
    echo "[TEST] ❌ FAIL  $json_errors invalid JSON lines"
    ALL_PASS=false
fi

echo ""
if [ "$ALL_PASS" = "true" ]; then
    echo "[TEST] ✅ All checks passed. Sample log: $SAMPLE_LOG"
    exit 0
else
    echo "[TEST] ❌ One or more checks failed."
    exit 1
fi
