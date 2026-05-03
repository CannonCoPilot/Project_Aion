#!/bin/bash
# ============================================================================
# jicm-state-update.sh — Atomic writer for .jicm-state-hook.json
# ============================================================================
#
# Phase 7.9.1 task #1 — Foundation primitive for the hook layer.
#
# Writes are atomic via temp-file + rename (POSIX rename(2) is atomic on the
# same filesystem). Eliminates torn-JSON reads when the watcher polls
# concurrently with the gate hook's writes.
#
# USAGE:
#   echo '<json-blob>' | jicm-state-update.sh --write
#     Atomically replaces .jicm-state-hook.json with the JSON from stdin.
#     The blob must be valid JSON (validated via jq before commit).
#
#   jicm-state-update.sh --clear-pending
#     Atomically deletes .pending_action from the state file (read-modify-write).
#     No-op if state file does not exist.
#
# EXIT CODES:
#   0 — success
#   1 — write/parse error
#   2 — bad arguments
# ============================================================================

set -o pipefail

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis-Dev}}"
STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
TMP_FILE="${STATE_FILE}.tmp.$$"

trap 'rm -f "$TMP_FILE" 2>/dev/null' EXIT

case "${1:-}" in
  --write)
    if ! command -v jq >/dev/null 2>&1; then
      echo "jicm-state-update: jq required for --write validation" >&2
      exit 1
    fi
    cat > "$TMP_FILE" || exit 1
    if ! jq empty "$TMP_FILE" 2>/dev/null; then
      echo "jicm-state-update: invalid JSON in stdin payload" >&2
      exit 1
    fi
    mv "$TMP_FILE" "$STATE_FILE" || exit 1
    ;;

  --clear-pending)
    if [[ ! -f "$STATE_FILE" ]]; then
      exit 0
    fi
    if ! command -v jq >/dev/null 2>&1; then
      echo "jicm-state-update: jq required for --clear-pending" >&2
      exit 1
    fi
    if ! jq 'del(.pending_action)' "$STATE_FILE" > "$TMP_FILE" 2>/dev/null; then
      echo "jicm-state-update: jq mutation failed" >&2
      exit 1
    fi
    mv "$TMP_FILE" "$STATE_FILE" || exit 1
    ;;

  *)
    echo "Usage: $0 [--write | --clear-pending]" >&2
    echo "  --write           Read JSON from stdin, atomically write to state file" >&2
    echo "  --clear-pending   Atomically delete .pending_action from state file" >&2
    exit 2
    ;;
esac

exit 0
