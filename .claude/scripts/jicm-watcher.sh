#!/bin/bash
# ============================================================================
# JICM v7.9 WATCHER — Slim Signal-Driven Actuator
# ============================================================================
#
# Sole responsibility: when jicm-stop.sh writes .jicm-clear-now.signal,
# drive the canonical compression → /clear → resume cycle to completion
# via the pluggable injection backend (jicm-inject.sh).
#
# Sensing belongs to jicm-gate.sh (UserPromptSubmit). This script does NOT
# read transcripts, count tokens, parse status lines, or capture panes for
# state inference. All those concerns moved into the hook layer in v7.9.
#
# Replaces v7.1.1's 1559-line capture-pane parser. Legacy preserved at
# jicm-watcher-legacy.sh for fallback during the v7.9 transition.
#
# Design:  projects/project-aion/designs/jicm-roadmap-v7-9-to-v8.md §4.3
# Plan:    projects/project-aion/plans/jicm-implementation-plan-v7-9-to-v8.md §7.9.3
# ============================================================================

set -o pipefail

# --- Source shared configuration --------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"
. "$SCRIPT_DIR/jicm-config.sh"

# --- Logging ----------------------------------------------------------------
mkdir -p "$(dirname "$JICM_LOG_FILE")" "$(dirname "$JICM_PID_FILE")"
log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$JICM_LOG_FILE"; }

# --- Singleton guard --------------------------------------------------------
if [[ -f "$JICM_PID_FILE" ]]; then
    PRIOR_PID=$(cat "$JICM_PID_FILE" 2>/dev/null)
    if [[ -n "$PRIOR_PID" ]] && kill -0 "$PRIOR_PID" 2>/dev/null; then
        echo "jicm-watcher: another instance running (pid $PRIOR_PID); exiting" >&2
        log "abort: prior instance pid $PRIOR_PID still alive"
        exit 1
    fi
    log "stale PID file (pid $PRIOR_PID); reclaiming"
fi
echo "$$" > "$JICM_PID_FILE"
trap 'log "watcher exiting (pid $$)"; rm -f "$JICM_PID_FILE"; exit' EXIT INT TERM
log "watcher v7.9 started (pid $$, project $PROJECT_DIR)"

# --- Injection helper -------------------------------------------------------
inject() {
    JICM_INJECTION_TARGET="$JICM_TMUX_TARGET" \
    JICM_INJECTION_BACKEND="$JICM_INJECTION_BACKEND" \
    JICM_TMUX_BIN="$JICM_TMUX_BIN" \
        "$JICM_INJECT_SCRIPT" "$@"
}

# --- Idle detection: state file absent or mtime ≥ JICM_IDLE_GRACE_SEC -------
state_is_idle() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return 0
    local mtime now age
    mtime=$(stat -f %m "$JICM_STATE_HOOK_FILE" 2>/dev/null) || return 0
    now=$(date +%s)
    age=$(( now - mtime ))
    [[ "$age" -ge "$JICM_IDLE_GRACE_SEC" ]]
}

# --- Wait for an injected-capture pattern -----------------------------------
wait_for_capture_pattern() {
    local pattern="$1" timeout="$2" elapsed=0
    while [[ "$elapsed" -lt "$timeout" ]]; do
        if inject capture 15 2>/dev/null | grep -qF "$pattern"; then
            return 0
        fi
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done
    return 1
}

# --- Wait for signal file ---------------------------------------------------
wait_for_signal() {
    local signal="$1" timeout="$2" elapsed=0
    while [[ "$elapsed" -lt "$timeout" ]]; do
        [[ -f "$signal" ]] && return 0
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done
    return 1
}

# --- Wait for Claude turn to terminate cleanly ------------------------------
# Critical for HALT/clear concatenation prevention. tmux send-keys does NOT
# distinguish Claude-busy from Claude-idle. When Claude is mid-stream, /clear
# (or any text) arriving via send-keys gets ENQUEUED as a future text prompt
# rather than executed as a slash command. Symptom in JSONL transcript:
# `{type:"queue-operation", operation:"enqueue", content:"/clear"}` followed
# later by a concatenated user prompt.
#
# Fix: poll JSONL transcript and only proceed when most recent assistant entry
# has a TERMINAL stop_reason (end_turn / stop_sequence / max_tokens). Tool-use
# entries are non-terminal (Claude is mid-tool-loop).
wait_for_idle() {
    local timeout="${1:-180}" elapsed=0
    local transcript stop_reason
    transcript=$(jq -r '.transcript_path // empty' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
    if [[ -z "$transcript" ]] || [[ ! -f "$transcript" ]]; then
        log "wait_for_idle: no transcript path in state file — fallback sleep 3s"
        sleep 3
        return 0
    fi
    while [[ "$elapsed" -lt "$timeout" ]]; do
        stop_reason=$(jq -s -r '[.[] | select(.type=="assistant" and .message.stop_reason != null) | .message.stop_reason] | last // empty' "$transcript" 2>/dev/null)
        case "$stop_reason" in
            end_turn|stop_sequence|max_tokens)
                return 0
                ;;
        esac
        sleep 1
        elapsed=$(( elapsed + 1 ))
    done
    log "wait_for_idle: timeout (${timeout}s) — proceeding (last stop_reason='${stop_reason:-none}')"
    return 1
}

# --- Canonical prompts (single-line per tmux constraint) --------------------
# Phrased as natural collaborator-to-collaborator requests rather than tagged
# control signals. The "Watcher here. <distinctive phrase>" prefix is the
# stable greppable marker used by jicm-prep-context.sh to identify the active
# session JSONL and to filter these prompts out of message-extraction summaries.
HALT_PROMPT="Watcher here. Context is getting heavy - please save any in-progress details to .claude/context/.scratchpad.md, then reply Understood and stop. I'll handle the refresh."
RESUME_PROMPT="Watcher here. Refresh complete - please read .claude/context/.compressed-context-ready.md for current state and .claude/context/.scratchpad.md for transient working details, then resume work immediately. No greeting needed."

# --- Cycle: idle → HALT → prep → /clear → resume → RESUME -------------------
# 7.9.6c: Approach C back-compat shim (v73_shim_write_state) removed.
# session-start.sh JICM v7 branch now gates on .jicm-clear-now.signal directly;
# legacy .jicm-state file is no longer written or read.
actuate_jicm_cycle() {
    log "cycle: start"

    # 1. Wait for Claude idle (state-file mtime older than grace window)
    local elapsed=0
    while ! state_is_idle && [[ "$elapsed" -lt 60 ]]; do
        sleep 1; elapsed=$(( elapsed + 1 ))
    done
    log "cycle: idle confirmed (waited ${elapsed}s)"

    # 2. HALT injection (text + submit as separate ops per tmux constraint)
    #    Defensive: clear-input first to prevent any stale buffer carrying over
    #    from prior cycle / aborted prompt; verify after submit that HALT
    #    actually landed in the conversation (not just the input field).
    inject clear-input
    sleep 0.3
    inject text "$HALT_PROMPT"
    sleep 0.5
    inject submit
    sleep 0.5
    if ! wait_for_capture_pattern "Watcher here. Context" 5; then
        log "cycle: HALT not visible after submit — retrying submit once"
        inject submit
        sleep 1
    fi
    log "cycle: HALT prompt sent"

    # 3. Wait for "Understood" acknowledgment
    if wait_for_capture_pattern "Understood" "$JICM_HALT_ACK_TIMEOUT"; then
        log "cycle: HALT acknowledged"
    else
        log "cycle: HALT ack timeout (${JICM_HALT_ACK_TIMEOUT}s) — proceeding"
    fi

    # 4. Prep launch (idempotent: skip if compression signal/guard already exist)
    if [[ ! -f "$JICM_COMPRESSION_SIGNAL" ]] && [[ ! -f "$JICM_COMPRESSION_GUARD" ]]; then
        : > "$JICM_COMPRESSION_GUARD"
        log "cycle: launching prep script"
        ( "$JICM_PREP_SCRIPT" >> "$JICM_LOG_FILE" 2>&1 ) &
    else
        log "cycle: prep skipped (signal/guard already present)"
    fi

    # 5. Wait for prep completion
    if wait_for_signal "$JICM_COMPRESSION_SIGNAL" "$JICM_PREP_TIMEOUT"; then
        log "cycle: prep complete"
    else
        log "cycle: prep timeout (${JICM_PREP_TIMEOUT}s) — proceeding with possibly stale checkpoint"
    fi

    # 5.5. L4 Auto-consolidation: ingest checkpoint to RAG (async, non-blocking)
    if [[ "${JICM_RAG_ENABLED:-true}" == "true" ]] && [[ -f "$JICM_AUTO_INGEST_SCRIPT" ]]; then
        local ingest_python="$PROJECT_DIR/infrastructure/.venv/bin/python"
        if [[ -x "$ingest_python" ]]; then
            (
                export PROJECT_DIR JICM_COMPRESSED_FILE JICM_RAG_COLLECTION \
                       JICM_RAG_DEDUP_THRESHOLD JICM_RAG_QDRANT_URL \
                       JICM_RAG_EMBED_URL JICM_INGEST_LOG
                export JICM_SESSION_ID=$(jq -r '.session_id // "unknown"' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
                "$ingest_python" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "cycle: L4 auto-ingest launched (PID $!)"
        else
            log "cycle: L4 auto-ingest skipped (venv python not found)"
        fi
    fi

    # 5.6. L1 Sensory capture: preserve tmux scrollback before /clear erases it
    #      Phase 2C: expanded to 1000 lines (was 200) for richer context recovery
    local scrollback_raw="$PROJECT_DIR/.claude/context/.pre-clear-scrollback.md"
    local scrollback_summary="$PROJECT_DIR/.claude/context/.pre-clear-scrollback-summary.md"
    if [[ -x "$JICM_TMUX_BIN" ]]; then
        {
            echo "# Pre-/clear Scrollback Capture"
            echo "# Captured: $(date -u +%Y-%m-%dT%H:%M:%SZ) | Session: $(jq -r '.session_id // "unknown"' "$JICM_STATE_HOOK_FILE" 2>/dev/null)"
            echo ""
            "$JICM_TMUX_BIN" capture-pane -t "$JICM_TMUX_TARGET" -p -S -1000 2>/dev/null
        } > "$scrollback_raw"
        log "cycle: scrollback captured ($(wc -l < "$scrollback_raw" | tr -d ' ') lines)"
    fi

    # 5.6b. NLP-compress scrollback → dense summary for BOOT injection
    local nlp_script="$PROJECT_DIR/.claude/scripts/compress-input.py"
    if [[ -f "$scrollback_raw" ]] && [[ -f "$nlp_script" ]]; then
        if python3 "$nlp_script" --mode aggressive --input "$scrollback_raw" > "$scrollback_summary" 2>/dev/null; then
            local raw_bytes=$(wc -c < "$scrollback_raw" | tr -d ' ')
            local sum_bytes=$(wc -c < "$scrollback_summary" | tr -d ' ')
            log "cycle: scrollback NLP-compressed ($raw_bytes → $sum_bytes bytes)"
        else
            cp "$scrollback_raw" "$scrollback_summary"
            log "cycle: scrollback NLP compression failed — using raw"
        fi
    else
        [[ -f "$scrollback_raw" ]] && cp "$scrollback_raw" "$scrollback_summary"
    fi

    # 5.6c. Scrollback summary → RAG ingest (async, non-blocking)
    if [[ "${JICM_RAG_ENABLED:-true}" == "true" ]] && [[ -f "$scrollback_summary" ]] && [[ -f "$JICM_AUTO_INGEST_SCRIPT" ]]; then
        local ingest_python="$PROJECT_DIR/infrastructure/.venv/bin/python"
        if [[ -x "$ingest_python" ]]; then
            (
                export PROJECT_DIR JICM_RAG_COLLECTION="sessions" \
                       JICM_RAG_DEDUP_THRESHOLD JICM_RAG_QDRANT_URL JICM_RAG_EMBED_URL JICM_INGEST_LOG
                export JICM_COMPRESSED_FILE="$scrollback_summary"
                export JICM_SESSION_ID=$(jq -r '.session_id // "unknown"' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
                "$ingest_python" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "cycle: scrollback → RAG ingest launched (PID $!)"
        fi
    fi

    # 5.7. L1→L4 Consolidation: rotate insights-log + consolidate corrections
    #      Phase 2C: MOVED here from session-start.sh (fire BEFORE /clear)
    local consolidate_script="$PROJECT_DIR/.claude/scripts/memory-consolidation.sh"
    if [[ -x "$consolidate_script" ]]; then
        CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$consolidate_script" >> "$JICM_LOG_FILE" 2>&1 &
        log "cycle: memory consolidation launched (PID $!)"
    fi

    # 5.8. L2 Anti-Hyperthymesia: rotate scratchpad (moved from session-start.sh)
    local rotate_script="$PROJECT_DIR/.claude/hooks/scratchpad-rotate.sh"
    if [[ -x "$rotate_script" ]]; then
        CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$rotate_script" >> "$JICM_LOG_FILE" 2>&1
        log "cycle: scratchpad rotated"
    fi

    # 5.9. L3→L5 Graphiti episode: ingest checkpoint to knowledge graph (async)
    local graphiti_script="$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py"
    if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]]; then
        local ingest_python="$PROJECT_DIR/infrastructure/.venv/bin/python"
        if [[ -x "$ingest_python" ]] && [[ -f "$graphiti_script" ]]; then
            (
                export PROJECT_DIR JICM_COMPRESSED_FILE
                "$ingest_python" "$graphiti_script" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "cycle: Graphiti episode ingest launched (PID $!)"
        elif [[ -x "$ingest_python" ]] && [[ -f "$JICM_AUTO_INGEST_SCRIPT" ]]; then
            # Fallback: use prepopulate script in single-file mode
            (
                "$ingest_python" "$PROJECT_DIR/.claude/scripts/graphiti-prepopulate.py" \
                    --file "$JICM_COMPRESSED_FILE" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "cycle: Graphiti episode via prepopulate fallback (PID $!)"
        fi
    fi

    # 6. /clear injection — defensive sequence to prevent HALT/clear concatenation:
    #    PRE-STEP: wait_for_idle. tmux send-keys does NOT distinguish Claude-busy
    #       from Claude-idle. If we inject /clear while Claude is still streaming
    #       a response (or mid-tool-loop), the TUI ENQUEUES /clear as a text
    #       prompt rather than executing it as a slash command — the documented
    #       failure mode (queue-operation visible in JSONL transcript). Polling
    #       JSONL until last assistant has terminal stop_reason guarantees the
    #       input buffer is in a state to accept slash commands.
    #    a. clear-input: empty the input buffer (Ctrl+U) — defense-in-depth in
    #       case any residual text is in the input field. Should be a no-op when
    #       wait_for_idle confirms idle (input field empty post-acknowledgment).
    #    b. text /clear + submit: types into verified-empty input + idle TUI so
    #       the slash command executes inline.
    #    REMOVED: inject escape. ESC in Claude Code TUI does NOT harmlessly
    #       interrupt when there's no stream — it triggers "edit last prompt"
    #       recall mode, reloading HALT_PROMPT into the input buffer. Combined
    #       with subsequent Ctrl+U (which behaves as delete-word in the recalled
    #       state, not delete-line) and inject text "/clear", the result is the
    #       documented concatenated prompt "Watcher here. Context ... /clear /clear".
    #       wait_for_idle obsoletes the original stream-interrupt purpose.
    wait_for_idle "$JICM_HALT_ACK_TIMEOUT"
    log "cycle: claude idle confirmed (pre /clear)"
    inject clear-input
    sleep 0.3
    inject text "/clear"
    sleep 0.3
    inject submit
    sleep 0.5
    log "cycle: /clear sent"

    # 7. Wait for resume signal (session-start hook writes after restoration)
    if wait_for_signal "$JICM_RESUME_SIGNAL" "$JICM_RESUME_TIMEOUT"; then
        log "cycle: resume signal observed"
    else
        log "cycle: resume signal timeout — sending RESUME anyway"
    fi
    sleep 1

    # 8. RESUME injection — same defensive pattern as HALT/clear, including
    #    wait_for_idle to prevent RESUME being enqueued behind any active stream
    #    in the post-/clear new session (e.g., session-start hook injection still
    #    being processed).
    wait_for_idle "$JICM_HALT_ACK_TIMEOUT"
    log "cycle: claude idle confirmed (pre RESUME)"
    inject clear-input
    sleep 0.3
    inject text "$RESUME_PROMPT"
    sleep 0.5
    inject submit
    sleep 0.5
    log "cycle: RESUME prompt sent"

    # 9. Cleanup transient signals
    rm -f "$JICM_CLEAR_SIGNAL" "$JICM_COMPRESSION_SIGNAL" \
          "$JICM_COMPRESSION_GUARD" "$JICM_RESUME_SIGNAL"
    log "cycle: complete"
}

# --- Periodic state refresh (fixes HUD/Statusline staleness during long turns) ---
# jicm-gate.sh writes .jicm-state-hook.json only on UserPromptSubmit. During a
# long turn with heavy tool use, context grows but the displayed value stays at
# turn-start. This function re-parses the JSONL transcript and patches just the
# token-counter fields, so HUD + Statusline reflect mid-turn growth.
# Cadence: every 5 polls (~5s with default interval) to bound jq cost.
refresh_state_from_jsonl() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return 0
    local transcript window
    transcript=$(jq -r '.transcript_path // empty' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
    [[ -n "$transcript" && -f "$transcript" ]] || return 0
    window=$(jq -r '.context_window_size // 1000000' "$JICM_STATE_HOOK_FILE" 2>/dev/null)

    local usage input_t cache_r cache_c cache_5m cache_1h tokens used_pct now_iso now_epoch
    usage=$(jq -c 'select(.type=="assistant") | .message.usage' "$transcript" 2>/dev/null | tail -1)
    [[ -n "$usage" && "$usage" != "null" ]] || return 0

    input_t=$(echo "$usage" | jq -r '.input_tokens // 0' 2>/dev/null)
    cache_r=$(echo "$usage" | jq -r '.cache_read_input_tokens // 0' 2>/dev/null)
    cache_c=$(echo "$usage" | jq -r '.cache_creation_input_tokens // 0' 2>/dev/null)
    cache_5m=$(echo "$usage" | jq -r '.cache_creation.ephemeral_5m_input_tokens // 0' 2>/dev/null)
    cache_1h=$(echo "$usage" | jq -r '.cache_creation.ephemeral_1h_input_tokens // 0' 2>/dev/null)
    tokens=$(( input_t + cache_r + cache_c ))
    used_pct=$(( window > 0 ? (tokens * 100 / window) : 0 ))
    now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    now_epoch=$(date +%s)

    local tmpfile="${JICM_STATE_HOOK_FILE}.tmp.$$"
    if jq --argjson tokens "$tokens" \
          --argjson input "$input_t" \
          --argjson cr "$cache_r" \
          --argjson cc "$cache_c" \
          --argjson c5m "$cache_5m" \
          --argjson c1h "$cache_1h" \
          --argjson upct "$used_pct" \
          --arg ts "$now_iso" \
          --argjson tse "$now_epoch" \
          '.tokens = $tokens
           | .input_tokens = $input
           | .cache_read_tokens = $cr
           | .cache_creation_tokens = $cc
           | .cache_creation_5m_tokens = $c5m
           | .cache_creation_1h_tokens = $c1h
           | .used_percentage = $upct
           | .ts = $ts
           | .ts_epoch = $tse
           | ._refreshed_by = "watcher_poll"' \
          "$JICM_STATE_HOOK_FILE" > "$tmpfile" 2>/dev/null; then
        mv "$tmpfile" "$JICM_STATE_HOOK_FILE"
    else
        rm -f "$tmpfile"
    fi
}

# --- Phase IV: REST stage — idle/high-activity triggered micro-meditation -----
# Fires once per day when session has been idle for REST_IDLE_THRESHOLD seconds
# or when tool activity exceeds REST_TOOL_THRESHOLD since last REST cycle.
# Runs Store + Curate functions autonomically (no Claude involvement for R1/R2/R4).
# R3/R5 inject prompts via tmux (require LLM judgment).
REST_LAST_PROMPT_EPOCH=0
REST_TOOL_COUNT=0
REST_TOOLS_AT_LAST_REST=0

get_last_prompt_epoch() {
    [[ -f "$JICM_STATE_HOOK_FILE" ]] || return
    jq -r '.ts_epoch // 0' "$JICM_STATE_HOOK_FILE" 2>/dev/null
}

get_tool_count_from_jsonl() {
    local transcript
    transcript=$(jq -r '.transcript_path // empty' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
    [[ -n "$transcript" && -f "$transcript" ]] || { echo 0; return; }
    jq -s '[.[] | select(.type=="assistant" and .message.stop_reason=="tool_use")] | length' "$transcript" 2>/dev/null || echo 0
}

rest_should_trigger() {
    local rest_marker="${JICM_REST_MARKER_DIR:-$PROJECT_DIR/.claude/context}/.rest-ran-$(date +%Y-%m-%d)"
    [[ -f "$rest_marker" ]] && return 1

    local now last_prompt idle_sec tool_delta
    now=$(date +%s)
    last_prompt=$(get_last_prompt_epoch)
    last_prompt=${last_prompt:-$now}
    idle_sec=$(( now - last_prompt ))

    if [[ "$idle_sec" -ge "${JICM_REST_IDLE_THRESHOLD:-1800}" ]]; then
        return 0
    fi

    REST_TOOL_COUNT=$(get_tool_count_from_jsonl)
    tool_delta=$(( REST_TOOL_COUNT - REST_TOOLS_AT_LAST_REST ))
    if [[ "$tool_delta" -ge "${JICM_REST_TOOL_THRESHOLD:-50}" ]]; then
        return 0
    fi

    return 1
}

actuate_rest_stage() {
    log "rest: start (idle detection triggered)"
    local ingest_python="$PROJECT_DIR/infrastructure/.venv/bin/python"
    local rest_marker="${JICM_REST_MARKER_DIR:-$PROJECT_DIR/.claude/context}/.rest-ran-$(date +%Y-%m-%d)"

    # R1: Session summary → RAG ingest (async, no Claude)
    if [[ "${JICM_RAG_ENABLED:-true}" == "true" ]] && [[ -x "$ingest_python" ]] && [[ -f "$JICM_AUTO_INGEST_SCRIPT" ]]; then
        if [[ -f "$JICM_COMPRESSED_FILE" ]]; then
            (
                export PROJECT_DIR JICM_COMPRESSED_FILE JICM_RAG_COLLECTION \
                       JICM_RAG_DEDUP_THRESHOLD JICM_RAG_QDRANT_URL \
                       JICM_RAG_EMBED_URL JICM_INGEST_LOG
                export JICM_SESSION_ID=$(jq -r '.session_id // "unknown"' "$JICM_STATE_HOOK_FILE" 2>/dev/null)
                "$ingest_python" "$JICM_AUTO_INGEST_SCRIPT" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "rest: R1 checkpoint → RAG ingest launched (PID $!)"
        fi
    fi

    # R2: Session episode → Graphiti (async, no Claude)
    local graphiti_script="$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py"
    if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]] && [[ -x "$ingest_python" ]] && [[ -f "$graphiti_script" ]]; then
        if [[ -f "$JICM_COMPRESSED_FILE" ]]; then
            (
                export PROJECT_DIR JICM_COMPRESSED_FILE
                "$ingest_python" "$graphiti_script" >> "$JICM_LOG_FILE" 2>&1
            ) &
            log "rest: R2 checkpoint → Graphiti ingest launched (PID $!)"
        fi
    fi

    # R2b: M4 queue consumer — re-ingest changed identity files (async, no Claude)
    local reindex_queue="$PROJECT_DIR/.claude/context/.graphiti-reindex-queue"
    if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]] && [[ -f "$reindex_queue" ]] && [[ -x "$ingest_python" ]]; then
        local prepop_script="$PROJECT_DIR/.claude/scripts/graphiti-prepopulate.py"
        if [[ -f "$prepop_script" ]]; then
            local changed_file
            while read -r changed_file; do
                [[ -z "$changed_file" ]] && continue
                local full_path="$PROJECT_DIR/.claude/context/psyche/$changed_file"
                [[ -f "$full_path" ]] || continue
                (
                    "$ingest_python" "$prepop_script" --file "$full_path" >> "$JICM_LOG_FILE" 2>&1
                ) &
                log "rest: R2b re-ingesting changed identity file: $changed_file (PID $!)"
            done < "$reindex_queue"
            rm -f "$reindex_queue"
        fi
    fi

    # R4: Log rotation if logs exceed 100MB — du -sk returns KB (async, no Claude)
    local rotate_script="$PROJECT_DIR/.claude/scripts/log-rotation.sh"
    local total_log_bytes=0
    if [[ -d "$PROJECT_DIR/.claude/logs" ]]; then
        total_log_bytes=$(du -sk "$PROJECT_DIR/.claude/logs" 2>/dev/null | awk '{print $1}')
        total_log_bytes=${total_log_bytes:-0}
    fi
    if [[ "$total_log_bytes" -gt 102400 ]] && [[ -x "$rotate_script" ]]; then
        CLAUDE_PROJECT_DIR="$PROJECT_DIR" "$rotate_script" >> "$JICM_LOG_FILE" 2>&1 &
        log "rest: R4 log rotation launched (logs=${total_log_bytes}KB, PID $!)"
    fi

    # R3: MEMORY.md micro-audit — prompt injection (requires LLM judgment)
    #     Guard: wait_for_idle ensures Claude isn't mid-conversation
    local today_commits
    today_commits=$(git -C "$PROJECT_DIR" log --since="midnight" --oneline 2>/dev/null | wc -l | tr -d ' ')
    if [[ "${today_commits:-0}" -gt 0 ]]; then
        wait_for_idle 30
        local r3_prompt="Watcher here. Session has been idle for a while. Please review MEMORY.md for entries that may be stale given today's work, update if needed, then reply Done."
        inject clear-input
        sleep 0.3
        inject text "$r3_prompt"
        sleep 0.5
        inject submit
        log "rest: R3 MEMORY.md micro-audit prompt injected (${today_commits} commits today)"
        sleep 3
    fi

    # R5: Scratchpad prune — prompt injection (requires LLM judgment)
    local sp_lines=0
    if [[ -f "$JICM_SCRATCHPAD" ]]; then
        sp_lines=$(wc -l < "$JICM_SCRATCHPAD" | tr -d ' ')
    fi
    if [[ "$sp_lines" -gt 60 ]]; then
        wait_for_idle 30
        local r5_prompt="Watcher here. Scratchpad is at ${sp_lines} lines (limit 80). Please prune stale entries, then reply Done."
        inject clear-input
        sleep 0.3
        inject text "$r5_prompt"
        sleep 0.5
        inject submit
        log "rest: R5 scratchpad prune prompt injected (${sp_lines} lines)"
    fi

    REST_TOOLS_AT_LAST_REST=$REST_TOOL_COUNT
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$rest_marker"
    log "rest: complete (marker written)"
}

# --- Phase VII: MAINTAIN stage — periodic health pings + monitoring -----------
# Fires every MAINTAIN_EVERY polls (~100s). Lightweight meta-memory operations:
# M2: service health pings, M3: RAG collection size, M4: identity file changes.
MAINTAIN_EVERY=100
MAINTAIN_COUNTER=0
LAST_PSYCHE_CHECK_EPOCH=0

check_service_health() {
    local health_file="$PROJECT_DIR/.claude/context/.memory-health.json"
    local alert_file="$PROJECT_DIR/.claude/context/.memory-health-alert"
    local qdrant_ok="false" mlx_ok="false" neo4j_ok="false"
    local qdrant_ms=0 mlx_ms=0 neo4j_ms=0

    local start_ms end_ms

    # M2: Qdrant
    start_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    if curl -sf --max-time 2 "http://localhost:6333/collections" >/dev/null 2>&1; then
        qdrant_ok="true"
    fi
    end_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    qdrant_ms=$(( end_ms - start_ms ))

    # M2: MLX Embed
    start_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    if curl -sf --max-time 2 "http://localhost:8000/health" >/dev/null 2>&1; then
        mlx_ok="true"
    fi
    end_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    mlx_ms=$(( end_ms - start_ms ))

    # M2: Neo4j
    start_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    if curl -sf --max-time 2 "http://localhost:7474" >/dev/null 2>&1; then
        neo4j_ok="true"
    fi
    end_ms=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
    neo4j_ms=$(( end_ms - start_ms ))

    # M3: RAG collection size monitoring
    local sessions_count=0
    sessions_count=$(curl -sf --max-time 2 "http://localhost:6333/collections/sessions" 2>/dev/null \
        | jq -r '.result.points_count // 0' 2>/dev/null || echo 0)

    local rag_warning=""
    if [[ "${sessions_count:-0}" -gt 10000 ]]; then
        rag_warning="sessions collection exceeds 10000 points (${sessions_count}) — consider decay pruning"
    fi

    # Write health JSON
    cat > "$health_file" <<HEALTH_EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "services": {
    "qdrant": {"up": $qdrant_ok, "latency_ms": $qdrant_ms},
    "mlx_embed": {"up": $mlx_ok, "latency_ms": $mlx_ms},
    "neo4j": {"up": $neo4j_ok, "latency_ms": $neo4j_ms}
  },
  "collections": {
    "sessions_points": $sessions_count
  },
  "warnings": $(if [[ -n "$rag_warning" ]]; then echo "\"$rag_warning\""; else echo "null"; fi)
}
HEALTH_EOF

    # Write alert file if any service is down (consumed by context-health-monitor.js)
    if [[ "$qdrant_ok" != "true" ]] || [[ "$mlx_ok" != "true" ]] || [[ "$neo4j_ok" != "true" ]]; then
        local down_services=""
        [[ "$qdrant_ok" != "true" ]] && down_services="${down_services}Qdrant "
        [[ "$mlx_ok" != "true" ]] && down_services="${down_services}MLX-Embed "
        [[ "$neo4j_ok" != "true" ]] && down_services="${down_services}Neo4j "
        echo "Memory services DOWN: ${down_services}— L4/L5 operations may fail" > "$alert_file"
        log "maintain: health alert — services down: ${down_services}"
    else
        rm -f "$alert_file"
    fi
}

check_identity_changes() {
    # M4: Detect psyche/ file modifications since last Graphiti ingestion
    local marker="$PROJECT_DIR/.claude/context/.graphiti-prepopulate-ran"
    [[ -f "$marker" ]] || return 0
    local marker_mtime
    marker_mtime=$(stat -f %m "$marker" 2>/dev/null) || return 0

    local changed_files=""
    local psyche_dir="$PROJECT_DIR/.claude/context/psyche"
    [[ -d "$psyche_dir" ]] || return 0

    while IFS= read -r f; do
        local fmtime
        fmtime=$(stat -f %m "$f" 2>/dev/null) || continue
        if [[ "$fmtime" -gt "$marker_mtime" ]]; then
            changed_files="${changed_files}$(basename "$f") "
        fi
    done < <(find "$psyche_dir" -name "*.md" -o -name "*.yaml" 2>/dev/null)

    if [[ -n "$changed_files" ]]; then
        local queue_file="$PROJECT_DIR/.claude/context/.graphiti-reindex-queue"
        echo "$changed_files" > "$queue_file"
        log "maintain: M4 identity changes detected: ${changed_files}— queued for re-ingestion"
    fi
}

# --- Main loop --------------------------------------------------------------
log "main loop (poll ${JICM_POLL_INTERVAL}s, target $JICM_TMUX_TARGET, backend $JICM_INJECTION_BACKEND)"
declare -i REFRESH_COUNTER=0
REFRESH_EVERY=5   # poll-iterations between state-file refreshes
while true; do
    if [[ -f "$JICM_EXIT_SIGNAL" ]] || [[ -f "$JICM_SLEEP_SIGNAL" ]]; then
        sleep "$JICM_POLL_INTERVAL"
        continue
    fi
    if [[ -f "$JICM_CLEAR_SIGNAL" ]]; then
        actuate_jicm_cycle
    fi

    # Periodic state refresh (every 5 polls ≈ 5s)
    REFRESH_COUNTER=$(( REFRESH_COUNTER + 1 ))
    if [[ "$REFRESH_COUNTER" -ge "$REFRESH_EVERY" ]]; then
        refresh_state_from_jsonl
        REFRESH_COUNTER=0
    fi

    # Phase VII: MAINTAIN health pings (every 100 polls ≈ 100s)
    MAINTAIN_COUNTER=$(( MAINTAIN_COUNTER + 1 ))
    if [[ "$MAINTAIN_COUNTER" -ge "$MAINTAIN_EVERY" ]]; then
        check_service_health
        check_identity_changes
        MAINTAIN_COUNTER=0
    fi

    # Phase IV: REST stage detection (idle or high-activity threshold)
    if rest_should_trigger; then
        actuate_rest_stage
    fi

    sleep "$JICM_POLL_INTERVAL"
done
