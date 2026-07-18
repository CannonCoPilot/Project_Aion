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
# before sourcing (defaults to $CLAUDE_PROJECT_DIR or $HOME/Claude/Project_Aion).
# ============================================================================

# Project root
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"

# --- v7.9 signal protocol (per roadmap §4.2) --------------------------------
JICM_STATE_HOOK_FILE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
JICM_CLEAR_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
JICM_RESUME_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"

# --- Active state files -------------------------------------------------------
# COMPRESSED_FILE / COMPRESSION_SIGNAL are DEFAULT-guarded (not clobbered) so a
# consumer may override the output target per-invocation before sourcing — e.g.
# the dev-lane self-refresh actuator (jicm-self.sh) redirects them to
# .compressed-context-ready.dev.md / .compression-done.dev.signal so its prep run
# never overwrites W0's shared checkpoint. Unset → identical W0 default (no-op).
# This also makes jicm-prep-context.sh's `OUTPUT="${JICM_COMPRESSED_FILE:-…}"`
# override actually take effect (previously dead — clobbered by this source).
JICM_COMPRESSED_FILE="${JICM_COMPRESSED_FILE:-$PROJECT_DIR/.claude/context/.compressed-context-ready.md}"
JICM_COMPRESSION_SIGNAL="${JICM_COMPRESSION_SIGNAL:-$PROJECT_DIR/.claude/context/.compression-done.signal}"
JICM_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
JICM_EXIT_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-exit-mode.signal"
JICM_SLEEP_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-sleep.signal"   # written by AC-10 Ulfhedthnar to suppress JICM
JICM_PID_FILE="$PROJECT_DIR/.claude/context/.jicm-watcher.pid"
JICM_STATE_FILE="$PROJECT_DIR/.claude/context/.jicm-state"            # read by HUD (jicm-watcher-hud.sh)
W0_UUID_FILE="$PROJECT_DIR/.claude/context/.current-w0-uuid"          # current W0 session UUID (launcher reads, session-start writes)

# --- Multi-session (JICM v9) — registry + per-key namespaced paths ------------
# v9 manages N sessions, each with a stable <key> (w0, dev, protos, chain-<id>…).
# `jicm_key_paths <key>` populates JK_* for that session:
#   key=w0  → the LEGACY single-session paths above, BYTE-IDENTICAL (back-compat
#             during migration — the v7.9 watcher keeps working until Phase 3).
#   else    → namespaced under jicm/ so no two sessions ever collide.
JICM_DIR="$PROJECT_DIR/.claude/context/jicm"
JICM_REGISTRY_DIR="$JICM_DIR/registry"
JICM_SIGNALS_DIR="$JICM_DIR/signals"
JICM_STATES_DIR="$JICM_DIR/state"
JICM_CHECKPOINTS_DIR="$JICM_DIR/checkpoints"

jicm_key_paths() {
    local key="${1:?jicm_key_paths: key required}"
    JK_KEY="$key"
    JK_REGISTRY="$JICM_REGISTRY_DIR/$key.json"
    if [[ "$key" == "w0" ]]; then
        # Byte-identical legacy paths — DO NOT change (W0 back-compat).
        JK_STATE="$PROJECT_DIR/.claude/context/.jicm-state-hook.json"
        JK_CLEAR_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-clear-now.signal"
        JK_RESUME_SIGNAL="$PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"
        JK_COMPRESSION_SIGNAL="$PROJECT_DIR/.claude/context/.compression-done.signal"
        JK_COMPRESSED="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
        JK_COMPRESSION_GUARD="$PROJECT_DIR/.claude/context/.compression-in-progress"
        JK_METADATA="$PROJECT_DIR/.claude/context/.jicm-last-compression.json"
        JK_METRICS="$PROJECT_DIR/.claude/logs/context-window-metrics.jsonl"
        JK_JSONL_STATS="$PROJECT_DIR/.claude/context/.jsonl-compression-stats.json"
        JK_SCROLLBACK="$PROJECT_DIR/.claude/context/.pre-clear-scrollback.md"
        JK_SCROLLBACK_SUMMARY="$PROJECT_DIR/.claude/context/.pre-clear-scrollback-summary.md"
    else
        JK_STATE="$JICM_STATES_DIR/$key.json"
        JK_CLEAR_SIGNAL="$JICM_SIGNALS_DIR/clear-now.$key.signal"
        JK_RESUME_SIGNAL="$JICM_SIGNALS_DIR/resume-complete.$key.signal"
        JK_COMPRESSION_SIGNAL="$JICM_SIGNALS_DIR/compression-done.$key.signal"
        JK_COMPRESSED="$JICM_CHECKPOINTS_DIR/$key.compressed.md"
        JK_COMPRESSION_GUARD="$JICM_SIGNALS_DIR/compression-in-progress.$key"
        JK_METADATA="$JICM_STATES_DIR/$key.last-compression.json"
        JK_METRICS="$PROJECT_DIR/.claude/logs/context-window-metrics.$key.jsonl"
        JK_JSONL_STATS="$JICM_STATES_DIR/$key.jsonl-compression-stats.json"
        JK_SCROLLBACK="$JICM_CHECKPOINTS_DIR/$key.scrollback.md"
        JK_SCROLLBACK_SUMMARY="$JICM_CHECKPOINTS_DIR/$key.scrollback-summary.md"
    fi
}

# Registry helpers (shared by gate upsert, supervisor read/GC, chain bridge).
# One JSON file per key under registry/. Merge-upsert keeps registered_at, stamps last_seen.
jicm_registry_upsert() {   # jicm_registry_upsert <key> [field=value ...]
    local key="${1:?jicm_registry_upsert: key required}"; shift
    mkdir -p "$JICM_REGISTRY_DIR" 2>/dev/null
    local f="$JICM_REGISTRY_DIR/$key.json" now base filter kv k v
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    base='{}'; [[ -f "$f" ]] && base="$(cat "$f" 2>/dev/null || echo '{}')"
    local jqargs=(--arg key "$key" --arg ls "$now")
    filter='.key=$key | .last_seen=$ls | (.registered_at //= $ls)'
    for kv in "$@"; do
        k="${kv%%=*}"; v="${kv#*=}"
        jqargs+=(--arg "f_$k" "$v"); filter="$filter | .[\"$k\"]=\$f_$k"
    done
    printf '%s' "$base" | jq "${jqargs[@]}" "$filter" > "$f.tmp.$$" 2>/dev/null && mv "$f.tmp.$$" "$f" || rm -f "$f.tmp.$$" 2>/dev/null
}
jicm_registry_keys() { ls -1 "$JICM_REGISTRY_DIR"/*.json 2>/dev/null | sed 's|.*/||; s|\.json$||'; }
jicm_registry_get()  { jq -r "${2:?field}" "$JICM_REGISTRY_DIR/${1:?key}.json" 2>/dev/null; }  # get <key> <jq-filter>

# Identity derivation — shared by jicm-gate.sh + jicm-stop.sh so they ALWAYS agree on
# the key. ROLE=dev → dev; JARVIS_WINDOW=0 → w0; else the given session_id ($1). This
# Jarvis hook domain only ever sees w0 + dev (Protos/chains run Alfred's hooks and
# register via the bridge). launch-aion.sh exports JARVIS_WINDOW=0 for W0 and
# JARVIS_SESSION_ROLE=dev for the dev lane; both propagate to hook child processes.
# Precedence (order is load-bearing):
#   1. JARVIS_WINDOW==0 → w0 FIRST (a per-pane value W0 always sets), so a leaked
#      ambient JARVIS_SESSION_ROLE=dev in W0's env can NEVER misroute W0's state into
#      dev's namespace ([[reference_dev_lane_hook_testing_role_leak]] class).
#   2. ROLE==dev → dev. dev sets JARVIS_WINDOW=5 OR leaves it unset; either way the
#      role arm (checked before the unset-window arm) claims it.
#   3. JARVIS_WINDOW UNSET (and not dev) → w0. A W0 session resumed OUTSIDE the
#      launcher wrapper (`claude --resume <w0-uuid>`) has no JARVIS_WINDOW; it is still
#      W0 and must land on the legacy state/signal the watcher polls — NOT a stray
#      session_id namespace (which would silently blind the watcher + exclude it from
#      its own session-start injection).
#   4. else → the session_id (a genuine non-w0/non-dev lane; routes to safety paths).
jicm_derive_key() {
    if   [[ "${JARVIS_WINDOW:-}" == "0" ]];         then echo "w0"
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "dev" ]]; then echo "dev"
    elif [[ -z "${JARVIS_WINDOW:-}" ]];             then echo "w0"
    else echo "${1:-unknown}"; fi
}
# Canonical tmux window per key (w0→:0, dev→:11). Resolved at CALL time (JICM_TMUX_SESSION
# is defined later in this file). Empty for unknown keys — registry/actuator handle that.
jicm_default_target() {
    case "${1:-}" in
        w0)  echo "${JICM_TMUX_SESSION}:0"  ;;
        dev) echo "${JICM_TMUX_SESSION}:11" ;;
        *)   echo "" ;;
    esac
}

# --- Session state files (read by prep script) -------------------------------
JICM_SESSION_STATE="$PROJECT_DIR/.claude/context/session-state.md"
JICM_SCRATCHPAD="$PROJECT_DIR/.claude/context/.scratchpad.md"
JICM_ACTIVE_PLAN="$PROJECT_DIR/.claude/context/.active-plan"

# --- Scripts -----------------------------------------------------------------
JICM_PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
JICM_INJECT_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-inject.sh"

# --- Logs, archives, metadata -----------------------------------------------
JICM_LOG_FILE="$PROJECT_DIR/.claude/logs/jicm-watcher.log"
JICM_WATCHER_LOOP_LOG="$PROJECT_DIR/.claude/logs/jicm-watcher-loop.log"
JICM_ARCHIVE_DIR="$PROJECT_DIR/.claude/logs/jicm/archive"
JICM_METADATA_FILE="${JICM_METADATA_FILE:-$PROJECT_DIR/.claude/context/.jicm-last-compression.json}"

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
# Default changed from 'jarvis' to 'aion' after monorepo migration (2026-06-05).
# Session was renamed jarvis→aion in launch-aion.sh v3.1; the old default caused
# every JICM inject attempt to fail with "tmux session 'jarvis' not found".
JICM_TMUX_SESSION="${TMUX_SESSION:-aion}"
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
JICM_GRAPHITI_ENABLED="${JICM_GRAPHITI_ENABLED:-true}"
JICM_AUTO_INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-auto-ingest.py"
JICM_GRAPHITI_INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/graphiti-prepopulate.py"
JICM_INGEST_LOG="$PROJECT_DIR/.claude/logs/jicm-auto-ingest.log"

# --- Memory System: NLP Compression (Phase 2C — repaired pipeline position) ----
# NLP compression processes RAW inputs (scrollback, JSONL messages) BEFORE
# Tier 1 structuring. Was disabled in Phase 2B (0.99 ratio on structured output);
# repositioned in 2C to process naturally-redundant raw data (30-50% reduction).
JICM_NLP_ENABLED="${JICM_NLP_ENABLED:-true}"
JICM_NLP_SCROLLBACK_MODE="${JICM_NLP_SCROLLBACK_MODE:-aggressive}"
JICM_NLP_MESSAGES_MODE="${JICM_NLP_MESSAGES_MODE:-standard}"
JICM_NLP_SCRIPT="$PROJECT_DIR/.claude/scripts/compress-input.py"

# --- Memory System: Scrollback Capture (Phase 2C — expanded) -------------------
# Capture 1000 lines of tmux scrollback (was 200). At ~80 chars/line ≈ 80KB raw.
# NLP compression reduces to ~40KB; LLM summarization further to 2-5KB.
JICM_SCROLLBACK_LINES="${JICM_SCROLLBACK_LINES:-1000}"

# --- Memory System: REST Stage (Phase 2C — idle/high-activity triggers) --------
# REST functions fire when session is idle (no user prompt for threshold seconds)
# OR when tool activity exceeds threshold since last REST cycle.
JICM_REST_IDLE_THRESHOLD="${JICM_REST_IDLE_THRESHOLD:-1800}"     # 30 minutes
JICM_REST_TOOL_THRESHOLD="${JICM_REST_TOOL_THRESHOLD:-50}"       # 50 tool uses
JICM_REST_MARKER_DIR="$PROJECT_DIR/.claude/context"
