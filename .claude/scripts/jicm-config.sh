#!/bin/bash
# ============================================================================
# jicm-config.sh — Shared JICM Path Configuration (v7.9)
# ============================================================================
#
# Single source of truth for all JICM file paths and thresholds.
# Sourced by: jicm-watcher.sh, jicm-prep-context.sh, jicm-gate.sh,
#             jicm-stop.sh, jicm-state-update.sh, session-start.sh
#
# v7.9 additions (signal-driven actuator architecture):
#   - JICM_STATE_HOOK_FILE: written by jicm-gate.sh on every UserPromptSubmit
#   - JICM_CLEAR_SIGNAL:    written by jicm-stop.sh; consumed by watcher
#   - JICM_RESUME_SIGNAL:   written by session-start.sh on resume injection
#
# All paths are relative to PROJECT_DIR which each consumer may override
# before sourcing (defaults to $CLAUDE_PROJECT_DIR or $HOME/Claude/Jarvis).
# ============================================================================

# Project root
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}}"

# --- v7.9 signal protocol (per roadmap §4.2) --------------------------------
JICM_STATE_HOOK_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
JICM_CLEAR_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
JICM_RESUME_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"

# --- Active state files -------------------------------------------------------
JICM_COMPRESSED_FILE="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
JICM_COMPRESSION_SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
JICM_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
JICM_EXIT_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal"
JICM_SLEEP_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-sleep.signal"   # written by AC-10 Ulfhedthnar to suppress JICM
JICM_PID_FILE="$PROJECT_DIR/.claude/context/.jicm-watcher.pid"
JICM_STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state"            # read by HUD (jicm-watcher-hud.sh)

# --- Session state files (read by prep script) -------------------------------
JICM_SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"
JICM_SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.md"
JICM_ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"

# --- Scripts -----------------------------------------------------------------
JICM_PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
JICM_INJECT_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-inject.sh"

# --- Logs, archives, metadata -----------------------------------------------
JICM_LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-watcher.log"
JICM_ARCHIVE_DIR="$PROJECT_DIR/.claude/logs/jicm/archive"
JICM_METADATA_FILE="$PROJECT_DIR/.claude/context/.jicm-last-compression.json"

# --- JSONL transcript directory ---------------------------------------------
JICM_PROJECT_SLUG=$(echo "$PROJECT_DIR" | tr '/' '-')
JICM_PROJECTS_DIR="$HOME/.claude/projects/${JICM_PROJECT_SLUG}"

# --- Thresholds (token-primary per User encoding directive) -----------------
# Token thresholds preferred over percentages; pct fields display-only.
JICM_SOFT_TOKENS=${JICM_SOFT_TOKENS:-250000}    # ~25% of 1M
JICM_HARD_TOKENS=${JICM_HARD_TOKENS:-300000}    # ~30% of 1M
JICM_TOKEN_THRESHOLD=${JICM_TOKEN_THRESHOLD:-300000}   # legacy v7.x alias (= new hard)
JICM_POLL_INTERVAL=${JICM_POLL_INTERVAL:-1}     # 1s in v7.9 (was 5s in v7.x)
JICM_IDLE_GRACE_SEC=${JICM_IDLE_GRACE_SEC:-3}   # state-file mtime age = idle
JICM_HALT_ACK_TIMEOUT=${JICM_HALT_ACK_TIMEOUT:-60}
JICM_PREP_TIMEOUT=${JICM_PREP_TIMEOUT:-300}
JICM_RESUME_TIMEOUT=${JICM_RESUME_TIMEOUT:-60}

# --- tmux (overridable) -----------------------------------------------------
JICM_TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
JICM_TMUX_SESSION="${TMUX_SESSION:-jarvis}"
JICM_TMUX_TARGET="${JICM_TMUX_TARGET:-${JICM_TMUX_SESSION}:0}"

# --- Injection backend -------------------------------------------------------
# tmux:  v7.9 default — send-keys via $HOME/bin/tmux
# pty:   v8.0 planned — Unix socket injection via pty-wrapper.py
#        Validated 2026-05-15 (6/6 tests PASS). See .claude/scratch/pty-tests/
JICM_INJECTION_BACKEND="${JICM_INJECTION_BACKEND:-tmux}"
JICM_PTY_SOCKET="${JICM_PTY_SOCKET:-$PROJECT_DIR/.claude/context/.pty-inject.sock}"

# --- Memory System: L4 Auto-Consolidation (Phase 2B) --------------------------
# After each JICM compression, auto-ingest the checkpoint to RAG (sessions
# collection) for long-term semantic retrieval. Graphiti extracts entities.
#
# SIMILARITY DIAL: Controls deduplication threshold. Range [0.0, 1.0].
#   0.0  = always ingest (no dedup, risks Hyperthymesia)
#   0.92 = default — skip if a very similar checkpoint already exists
#   1.0  = only skip exact duplicates (aggressive ingestion)
# Tune this based on observed collection growth vs retrieval quality.
# Monitor via: curl localhost:6333/collections/sessions | jq .result.points_count
JICM_RAG_ENABLED="${JICM_RAG_ENABLED:-true}"
JICM_RAG_COLLECTION="${JICM_RAG_COLLECTION:-sessions}"
JICM_RAG_DEDUP_THRESHOLD="${JICM_RAG_DEDUP_THRESHOLD:-0.92}"
JICM_RAG_QDRANT_URL="${JICM_RAG_QDRANT_URL:-http://localhost:6333}"
JICM_RAG_EMBED_URL="${JICM_RAG_EMBED_URL:-http://localhost:8000}"
JICM_GRAPHITI_ENABLED="${JICM_GRAPHITI_ENABLED:-false}"
JICM_AUTO_INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-auto-ingest.py"
JICM_INGEST_LOG="$PROJECT_DIR/.claude/logs/jicm-auto-ingest.log"
