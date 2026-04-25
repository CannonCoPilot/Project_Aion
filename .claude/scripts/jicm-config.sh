#!/bin/bash
# ============================================================================
# jicm-config.sh — Shared JICM Path Configuration
# ============================================================================
#
# Single source of truth for all JICM file paths and thresholds.
# Sourced by: jicm-watcher.sh, jicm-prep-context.sh, session-start.sh
#
# All paths are relative to PROJECT_DIR which each consumer must set
# before sourcing this file (defaults to $CLAUDE_PROJECT_DIR or ~/Claude/Jarvis).
#
# ============================================================================

# Project root (consumers may override before sourcing)
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}}"

# --- Context files (read/written during JICM cycles) ---
JICM_COMPRESSED_FILE="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
JICM_COMPRESSION_SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
JICM_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
JICM_STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state"
JICM_EXIT_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal"
JICM_SLEEP_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-sleep.signal"
JICM_PID_FILE="$PROJECT_DIR/.claude/context/.jicm-watcher.pid"

# --- Session state files (read by prep script) ---
JICM_SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"
JICM_SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.md"
JICM_ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"
JICM_ACTIVE_TASKS="$PROJECT_DIR/.claude/context/.active-tasks.txt"

# --- Scripts ---
JICM_PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"

# --- Logs, archives, metadata ---
JICM_LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-watcher.log"
JICM_ARCHIVE_DIR="$PROJECT_DIR/.claude/logs/jicm/archive"
JICM_METADATA_FILE="$PROJECT_DIR/.claude/context/.jicm-last-compression.json"

# --- JSONL transcript directory ---
JICM_PROJECT_SLUG=$(echo "$PROJECT_DIR" | tr '/' '-')
JICM_PROJECTS_DIR="$HOME/.claude/projects/${JICM_PROJECT_SLUG}"

# --- Thresholds (overridable via env or CLI flags) ---
JICM_TOKEN_THRESHOLD=${JICM_TOKEN_THRESHOLD:-300000}
JICM_POLL_INTERVAL=${JICM_POLL_INTERVAL:-5}

# --- tmux (overridable) ---
JICM_TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
JICM_TMUX_SESSION="${TMUX_SESSION:-jarvis}"
