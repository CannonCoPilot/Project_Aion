#!/bin/bash
# ============================================================================
# jicm-self.sh — Dev-lane deliberative self-management (Perception + Volition)
# ============================================================================
# Part of the JICM self-management rewire (Aion Evolution Roadmap, Phase 0).
# Gives the working (dev / non-master) session CONSCIOUS control over its own
# context lifecycle — complementing, never replacing, the autonomic Watcher
# reflex that guards W0. Governing law: preserve-the-reflex, add-the-volition.
#
#   sense    read my own context vitals (perception; read-only; safe)
#   prepare  deliberate save-gate: verify durable state before any refresh (safe)
#   refresh  full volition cycle (prepare -> /clear self -> inject resume)
#            DRY-RUN by default; --fire is GATED pending controlled validation.
#
# Author: Jarvis, for Jarvis — 2026-07-16
# ============================================================================
set -o pipefail

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
SESSION="${TMUX_SESSION:-aion}"
SELF_WINDOW="${JICM_SELF_WINDOW:-11}"      # Jarvis-dev window index
SCRATCH="$PROJECT_DIR/.claude/context/.scratchpad.md"
CKPT="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"

strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }

_bar_row() { "$TMUX_BIN" capture-pane -t "$SESSION:$SELF_WINDOW" -p 2>/dev/null | strip_ansi | grep -E '\] +[0-9]+%' | tail -1; }
_model()   { "$TMUX_BIN" capture-pane -t "$SESSION:$SELF_WINDOW" -p 2>/dev/null | strip_ansi | grep -oE '(opus|sonnet|haiku|fable)-[0-9]+-?[0-9]*' | head -1; }

cmd_sense() {
    local row pct tokens model p
    row="$(_bar_row)"; model="$(_model)"
    pct="$(printf '%s' "$row" | grep -oE '[0-9]+%' | head -1)"
    tokens="$(printf '%s' "$row" | grep -oE '[0-9.]+[KM]' | head -1)"
    echo "self-sense · window $SELF_WINDOW · ${model:-?}"
    echo "  context : ${pct:-?} used  (${tokens:-?} tokens)"
    p="${pct%\%}"
    if [[ "$p" =~ ^[0-9]+$ ]]; then
        if   [[ "$p" -ge 85 ]]; then echo "  advice  : HIGH — refresh soon (deliberate save-clear-restore)"
        elif [[ "$p" -ge 65 ]]; then echo "  advice  : MODERATE — plan a refresh at the next natural break"
        else                          echo "  advice  : AMPLE — continue working"
        fi
    else
        echo "  advice  : (could not read statusline; is window $SELF_WINDOW a live Claude pane?)"
    fi
}

cmd_prepare() {
    local now scratch_age="" ckpt_age="" ready=1
    now="$(date +%s)"
    echo "self-prepare · deliberate save-gate (NO clear performed):"
    if [[ -f "$SCRATCH" ]]; then
        scratch_age=$(( (now - $(stat -f %m "$SCRATCH" 2>/dev/null)) / 60 ))
        echo "  scratchpad : present, ${scratch_age}m ago"
        [[ "$scratch_age" -gt 30 ]] && ready=0
    else
        echo "  scratchpad : MISSING — write working state first"; ready=0
    fi
    if [[ -f "$CKPT" ]]; then
        ckpt_age=$(( (now - $(stat -f %m "$CKPT" 2>/dev/null)) / 60 ))
        echo "  checkpoint : present, ${ckpt_age}m old"
    else
        echo "  checkpoint : absent (a refresh will need to build one)"
    fi
    if [[ "$ready" -eq 1 ]]; then
        echo "  verdict    : READY — durable state fresh; safe to refresh"
    else
        echo "  verdict    : NOT READY — update scratchpad (<=30m) before refresh"
    fi
    return 0
}

cmd_refresh() {
    local fire=0
    [[ "${1:-}" == "--fire" ]] && fire=1
    cmd_prepare
    echo "self-refresh · cycle plan:"
    echo "  1. (prepare verified above)"
    echo "  2. send '/clear' -> $SESSION:$SELF_WINDOW"
    echo "  3. inject resume prompt (read checkpoint + scratchpad, continue)"
    if [[ "$fire" -eq 0 ]]; then
        echo "  [DRY-RUN] no action taken. Pass --fire to execute."
        return 0
    fi
    # No-Silent-Degradation: refuse to pretend an unvalidated self-clear is safe.
    echo "  [BLOCKED] live-fire is gated: self-clear cycle not yet validated in a"
    echo "           controlled session (Aion Evolution Roadmap, Phase 0). Arming"
    echo "           it before validation could strand this session. Not firing."
    return 2
}

case "${1:-sense}" in
    sense)   cmd_sense ;;
    prepare) cmd_prepare ;;
    refresh) shift; cmd_refresh "$@" ;;
    -h|--help|*) echo "usage: jicm-self.sh {sense|prepare|refresh [--fire]}" ;;
esac
