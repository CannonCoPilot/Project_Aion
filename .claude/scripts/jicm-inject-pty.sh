#!/bin/bash
# ============================================================================
# jicm-inject-pty.sh — PTY Backend (v8.0 placeholder)
# ============================================================================
#
# Phase 7.9.2 — PLACEHOLDER. Real implementation lands in v8.0 with the
# jarvis-pty wrapper (see projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md §5).
#
# When implemented in v8.0, this 4-line shim dispatches to the jarvis-pty CLI:
#   case "$1" in
#     escape)  jarvis-pty --socket "$SOCK" escape ;;
#     text)    jarvis-pty --socket "$SOCK" text "$2" ;;
#     submit)  jarvis-pty --socket "$SOCK" submit ;;
#     capture) jarvis-pty --socket "$SOCK" capture --lines "${2:-50}" ;;
#   esac
#
# In v7.9, exit 2 ("not implemented") to signal callers that PTY backend
# is selected but not yet built. Watcher will refuse to start with this backend
# in v7.9 because of this exit code; pipeline is unchanged.
# ============================================================================

echo "jicm-inject-pty: PTY backend not implemented in v7.9 (planned for v8.0)" >&2
echo "  See: projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md §5" >&2
exit 2
