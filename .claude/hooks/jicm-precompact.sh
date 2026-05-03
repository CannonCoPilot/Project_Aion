#!/bin/bash
# ============================================================================
# JICM v8.0 — PreCompact Hook Adjunct
# ============================================================================
#
# Fires when Claude Code is about to auto-compact (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
# threshold reached) OR when user runs /compact manually.
#
# Purpose: write our crisp two-tier checkpoint to .compressed-context-ready.md
# BEFORE Claude Code's native compact dilutes the conversation. After this hook
# returns, native compact runs; even if it inflates context with summary text,
# our checkpoint is the canonical resume source — the SessionStart(compact)
# hook reads it.
#
# This is the FALLBACK trigger after jicm-gate.sh's soft+hard thresholds.
# Three layers of defense in depth:
#   1. Soft nudge (jicm-gate.sh, ~30%)
#   2. Hard halt (jicm-gate.sh, ~65%)
#   3. PreCompact prep (this hook, ~70% native auto-compact)
#
# CONTRACT:
#   - Receives stdin JSON with `trigger` field ("manual" or "auto")
#   - Output: empty JSON or empty body (PreCompact does not require output)
#   - Always exits 0 (failure must not block native compact)
# ============================================================================

set -o pipefail

INPUT="$(cat)"

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis-Dev}}"
LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-precompact.log"
PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
COMPRESSED_FILE="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Skip if disabled
if [[ "${JICM_DISABLED:-false}" == "true" ]] || [[ -f "$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal" ]]; then
    echo "$NOW_ISO | SKIP | JICM disabled" >> "$LOG_FILE"
    exit 0
fi

TRIGGER="auto"
if command -v jq >/dev/null 2>&1; then
    TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "auto"' 2>/dev/null)
    [[ "$TRIGGER" == "null" ]] && TRIGGER="auto"
fi

echo "$NOW_ISO | START | trigger=$TRIGGER | calling prep" >> "$LOG_FILE"

# Run prep synchronously. Cap at 60s.
if [[ -x "$PREP_SCRIPT" ]]; then
    if command -v timeout >/dev/null 2>&1; then
        timeout 60 "$PREP_SCRIPT" >>"$LOG_FILE" 2>&1 || echo "$NOW_ISO | WARN | prep exited non-zero or timed out" >> "$LOG_FILE"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout 60 "$PREP_SCRIPT" >>"$LOG_FILE" 2>&1 || echo "$NOW_ISO | WARN | prep exited non-zero or timed out" >> "$LOG_FILE"
    else
        "$PREP_SCRIPT" >>"$LOG_FILE" 2>&1 || echo "$NOW_ISO | WARN | prep exited non-zero" >> "$LOG_FILE"
    fi
else
    echo "$NOW_ISO | ERROR | prep script not executable: $PREP_SCRIPT" >> "$LOG_FILE"
fi

# Verify checkpoint
if [[ -f "$COMPRESSED_FILE" ]]; then
    CHECKPOINT_BYTES=$(wc -c < "$COMPRESSED_FILE" 2>/dev/null | tr -d ' ' || echo 0)
    echo "$NOW_ISO | DONE | checkpoint bytes=$CHECKPOINT_BYTES" >> "$LOG_FILE"
else
    echo "$NOW_ISO | WARN | checkpoint missing post-prep" >> "$LOG_FILE"
fi

# PreCompact does not require output JSON
exit 0
