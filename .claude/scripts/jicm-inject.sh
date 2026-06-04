#!/bin/bash
# ============================================================================
# jicm-inject.sh — Pluggable Injection-Backend Dispatcher
# ============================================================================
#
# Phase 7.9.2 — backend abstraction. The slim watcher (Phase 7.9.3) calls
# this dispatcher; this dispatcher routes to the configured backend.
#
# v7.9 ships with the tmux backend. v8.0 adds the PTY backend (jarvis-pty)
# and switches via env var without changing any other component.
#
# CONTRACT (every backend MUST implement these four entry points):
#   $0 escape             — send Escape to target
#   $0 text "<literal>"   — send literal text (no interpretation)
#   $0 submit             — send Enter (C-m / \r)
#   $0 capture [N]        — capture last N lines of target output (default 50)
#
# BACKEND SELECTION:
#   JICM_INJECTION_BACKEND=tmux (default)
#   JICM_INJECTION_BACKEND=pty  (v8.0; placeholder in v7.9)
#
# TARGET (backend-specific):
#   JICM_INJECTION_TARGET=jarvis:0   (tmux: session:window)
#   (PTY backend reads its socket path from JARVIS_PTY_SOCKET in v8.0)
#
# EXIT CODES:
#   0 — success
#   1 — backend error
#   2 — backend not implemented (e.g., PTY in v7.9)
#   3 — bad arguments / unknown backend
# ============================================================================

set -o pipefail

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
BACKEND="${JICM_INJECTION_BACKEND:-tmux}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$BACKEND" in
    tmux)  BACKEND_SCRIPT="$SCRIPT_DIR/jicm-inject-tmux.sh" ;;
    pty)   BACKEND_SCRIPT="$SCRIPT_DIR/jicm-inject-pty.sh"  ;;
    *)
        echo "jicm-inject: unknown backend '$BACKEND' (expected tmux|pty)" >&2
        exit 3
        ;;
esac

if [[ ! -x "$BACKEND_SCRIPT" ]]; then
    echo "jicm-inject: backend script missing or not executable: $BACKEND_SCRIPT" >&2
    exit 1
fi

exec "$BACKEND_SCRIPT" "$@"
