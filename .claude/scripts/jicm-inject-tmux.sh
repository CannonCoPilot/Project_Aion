#!/bin/bash
# ============================================================================
# jicm-inject-tmux.sh — tmux Backend (v7.9 default)
# ============================================================================
#
# Implements the four-entry contract from jicm-inject.sh against tmux.
# Sequences mirror current v7 jicm-watcher.sh:307-322 verbatim.
#
# TARGET: $JICM_INJECTION_TARGET (default "jarvis:0")
# TMUX BIN: $JICM_TMUX_BIN (default "$HOME/bin/tmux" per Jarvis convention)
#
# CRITICAL RULES (Jarvis MEMORY.md):
#   - NEVER combine text+Enter in one send-keys call (input buffer corruption)
#   - NEVER multi-line `-l` strings (input buffer corruption)
#   - Always use absolute tmux path (PATH may not have it under launchctl)
# ============================================================================

set -o pipefail

TMUX_BIN="${JICM_TMUX_BIN:-$HOME/bin/tmux}"
TARGET="${JICM_INJECTION_TARGET:-jarvis:0}"

if [[ ! -x "$TMUX_BIN" ]]; then
    echo "jicm-inject-tmux: tmux binary not found at $TMUX_BIN" >&2
    exit 1
fi

# Verify session exists (every operation needs it)
SESSION="${TARGET%%:*}"
if ! "$TMUX_BIN" has-session -t "$SESSION" 2>/dev/null; then
    echo "jicm-inject-tmux: tmux session '$SESSION' not found" >&2
    exit 1
fi

ACTION="${1:-}"
shift 2>/dev/null || true

case "$ACTION" in
    escape)
        "$TMUX_BIN" send-keys -t "$TARGET" Escape
        ;;

    clear-input)
        # Ctrl+U = kill-line-backward in most TUI input handlers (incl. Claude Code).
        # Fixes the HALT/clear concatenation bug: when HALT-submit fails to register
        # (e.g., during active stream), HALT text remains in input buffer. ESC only
        # interrupts the stream, it does NOT clear the input field. This action does.
        "$TMUX_BIN" send-keys -t "$TARGET" C-u
        ;;

    text)
        TEXT="${1:-}"
        if [[ -z "$TEXT" ]]; then
            echo "jicm-inject-tmux: text requires a literal argument" >&2
            exit 3
        fi
        # Single-line send only (multi-line corrupts buffer per MEMORY.md)
        if [[ "$TEXT" == *$'\n'* ]]; then
            echo "jicm-inject-tmux: REFUSED — text contains newline (would corrupt input buffer)" >&2
            exit 3
        fi
        "$TMUX_BIN" send-keys -t "$TARGET" -l "$TEXT"
        ;;

    submit)
        "$TMUX_BIN" send-keys -t "$TARGET" C-m
        ;;

    capture)
        LINES="${1:-50}"
        if ! [[ "$LINES" =~ ^[0-9]+$ ]]; then
            echo "jicm-inject-tmux: capture LINES must be integer (got '$LINES')" >&2
            exit 3
        fi
        # capture-pane -p emits the full pane buffer (padded with blank rows
        # below the prompt). Strip trailing blank lines before tail -N so the
        # caller sees actual content rather than viewport padding.
        "$TMUX_BIN" capture-pane -t "$TARGET" -p \
            | awk 'NF{last=NR} {a[NR]=$0} END{for(i=1;i<=last;i++) print a[i]}' \
            | tail -n "$LINES"
        ;;

    *)
        echo "Usage: $0 {escape | clear-input | text <literal> | submit | capture [LINES]}" >&2
        echo "  Target: $TARGET   (override via JICM_INJECTION_TARGET)" >&2
        exit 3
        ;;
esac

exit 0
