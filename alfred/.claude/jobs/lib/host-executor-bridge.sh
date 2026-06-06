#!/bin/bash
# host-executor-bridge.sh — Host-side executor using warm interactive Claude Code sessions
#
# Architecture (v2 — chain-executor):
#   - A warm "seed" interactive Claude Code CLI runs in tmux window Protos
#   - Tasks are injected as messages via tmux paste-buffer (simulates a user at a terminal)
#   - Sentinel files signal completion (Claude writes DONE to a file as its final action)
#   - Cache prefix is reused across turns — near-zero cache_write per task
#
# Phase 1: All tasks inject into the seed session directly
# Phase 2: Parent chains fork the seed into per-chain windows
#
# Scans .claude/jobs/state/ for execute-request-*.json signal files written by
# the Docker-based executor.py.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="${JOBS_DIR}/state"
TMUX_BIN="${HOME}/bin/tmux"
TMUX_SESSION="${TMUX_SESSION:-jarvis}"
ALFDEV_DIR="${ALFRED_LAUNCH_DIR:-${HOME}/Claude/Alfred-Dev}"
SEED_WINDOW="Protos"
SEED_SESSION_FILE="${STATE_DIR}/.chain-seed-session-id"
CHAIN_EXECUTOR="${SCRIPT_DIR}/chain-executor.sh"
CHAIN_MAP_DIR="${STATE_DIR}/.chain-windows"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [host-bridge] $*" >&2
}

# ── Seed Management ──────────────────────────────────────────────────

_claude_running_in_window() {
    local window="$1"
    local pane_pid
    pane_pid=$("$TMUX_BIN" list-panes -t "${TMUX_SESSION}:${window}" -F '#{pane_pid}' 2>/dev/null)
    if [ -z "$pane_pid" ]; then return 1; fi
    local cmd
    cmd=$(ps -p "$pane_pid" -o command= 2>/dev/null)
    if echo "$cmd" | grep -q "claude"; then return 0; fi
    if pgrep -P "$pane_pid" -f "claude" >/dev/null 2>&1; then return 0; fi
    return 1
}

ensure_seed() {
    if "$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep -q "^${SEED_WINDOW}$"; then
        if _claude_running_in_window "$SEED_WINDOW"; then
            [ ! -s "$SEED_SESSION_FILE" ] && _capture_seed_session_id
            return 0
        fi
        log "Seed window exists but Claude not running — restarting"
        "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${SEED_WINDOW}" 2>/dev/null
    fi

    log "Starting seed session: ${SEED_WINDOW}"
    local seed_model="${AION_MODEL:-claude-opus-4-6[1M]}"
    "$TMUX_BIN" new-window -d -t "$TMUX_SESSION" -n "${SEED_WINDOW}" \
        "cd '${ALFDEV_DIR}' && export ANTHROPIC_BASE_URL=http://localhost:9800 && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: seed-session' && claude --model '${seed_model}' --dangerously-skip-permissions --permission-mode bypassPermissions" 2>/dev/null

    local waited=0
    local import_prompt_handled=false
    while [ "$waited" -lt 45 ]; do
        sleep 2
        waited=$((waited + 2))

        # Check for the external CLAUDE.md import prompt and REJECT it.
        # Alfred lives inside Project_Aion so Claude discovers the parent
        # CLAUDE.md with @-imports (Jarvis psyche, api_aware, etc.).
        # These add ~23K tokens of irrelevant Jarvis context, pushing the
        # seed to 125K tokens — 62% of Sonnet's 200K context — which
        # triggers autocompact on forked sessions and eats task prompts.
        # Select option 2: "No, disable external imports".
        if [ "$import_prompt_handled" = "false" ]; then
            local pane_content
            pane_content=$("$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${SEED_WINDOW}" -p 2>/dev/null)
            if echo "$pane_content" | grep -q "Allow external CLAUDE.md"; then
                log "External import prompt detected — REJECTING (saves ~23K tokens)"
                "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${SEED_WINDOW}" Down 2>/dev/null
                sleep 0.3
                "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${SEED_WINDOW}" Enter 2>/dev/null
                import_prompt_handled=true
                sleep 3
            fi
        fi

        if _claude_running_in_window "$SEED_WINDOW"; then
            # Verify Claude is actually interactive, not stuck at another prompt
            local pane_check
            pane_check=$("$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${SEED_WINDOW}" -p 2>/dev/null)
            if echo "$pane_check" | grep -q "Allow external CLAUDE.md"; then
                continue  # still stuck at prompt
            fi
            sleep 3
            # Prime the seed so it caches initial context and is ready for forking
            "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${SEED_WINDOW}" 'You are the Alfred seed session. Acknowledge with: "Seed ready."' 2>/dev/null
            sleep 0.5
            "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${SEED_WINDOW}" Enter 2>/dev/null
            sleep 10
            _capture_seed_session_id
            log "Seed ready (waited ${waited}s, import_prompt=${import_prompt_handled})"
            return 0
        fi
    done
    log "ERROR: seed failed to start within 45s"
    return 1
}

_capture_seed_session_id() {
    # Claude Code may resolve the Alfred-Dev symlink to the real path,
    # writing the session JSONL under either project slug. Check both.
    local dirs=(
        "${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion-alfred"
        "${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev"
    )
    local latest=""
    local latest_mtime=0
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            local candidate
            candidate=$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1)
            if [ -n "$candidate" ]; then
                local mtime
                mtime=$(stat -f %m "$candidate" 2>/dev/null || echo 0)
                if [ "$mtime" -gt "$latest_mtime" ]; then
                    latest="$candidate"
                    latest_mtime="$mtime"
                fi
            fi
        fi
    done
    if [ -n "$latest" ]; then
        basename "$latest" .jsonl > "$SEED_SESSION_FILE"
        log "Captured seed session: $(basename "$latest" .jsonl) from $(dirname "$latest")"
    fi
}

# ── Chain Window Management ───────────────────────────────────────────

get_or_create_chain_window() {
    # Returns the tmux window name for a given chain_id.
    # If the window doesn't exist or Claude isn't running, forks the seed.
    # $2 (optional): path to a persona-specific mcp.json for --mcp-config
    local chain_id="$1"
    local persona_mcp_config="${2:-}"
    mkdir -p "$CHAIN_MAP_DIR" 2>/dev/null

    local map_file="${CHAIN_MAP_DIR}/${chain_id}"
    if [ -f "$map_file" ]; then
        local existing_window
        existing_window=$(cat "$map_file" 2>/dev/null)
        if [ -n "$existing_window" ] && _claude_running_in_window "$existing_window"; then
            echo "$existing_window"
            return 0
        fi
        rm -f "$map_file"
    fi

    # Fork the seed into a new chain window
    local seed_sid
    seed_sid=$(cat "$SEED_SESSION_FILE" 2>/dev/null | tr -d '[:space:]')
    local window_name="chain-${chain_id:0:8}"

    if [ -z "$seed_sid" ]; then
        log "WARNING: no seed session ID — retrying capture"
        sleep 5
        _capture_seed_session_id
        seed_sid=$(cat "$SEED_SESSION_FILE" 2>/dev/null | tr -d '[:space:]')
        if [ -z "$seed_sid" ]; then
            log "ERROR: seed session ID unavailable after retry — cannot fork"
            return 1
        fi
    fi

    # Build --mcp-config flag if persona provides a config
    local mcp_flag=""
    if [ -n "$persona_mcp_config" ] && [ -f "$persona_mcp_config" ]; then
        mcp_flag="--mcp-config '${persona_mcp_config}'"
        log "Attaching persona MCP config: ${persona_mcp_config}"
    fi

    log "Forking seed → ${window_name} for chain ${chain_id:0:12}"
    "$TMUX_BIN" new-window -d -t "$TMUX_SESSION" -n "${window_name}" \
        "cd '${ALFDEV_DIR}' && export ANTHROPIC_BASE_URL=http://localhost:9800 && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: chain-${chain_id}' && claude --resume '${seed_sid}' --fork-session --dangerously-skip-permissions --permission-mode bypassPermissions ${mcp_flag}" 2>/dev/null

    local waited=0
    local fork_import_handled=false
    while [ "$waited" -lt 30 ]; do
        sleep 2
        waited=$((waited + 2))

        # Auto-confirm external import prompt on forked sessions too
        if [ "$fork_import_handled" = "false" ]; then
            local fork_content
            fork_content=$("$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${window_name}" -p 2>/dev/null)
            if echo "$fork_content" | grep -q "Allow external CLAUDE.md"; then
                log "External import prompt in fork ${window_name} — REJECTING (saves ~23K tokens)"
                "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${window_name}" Down 2>/dev/null
                sleep 0.3
                "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${window_name}" Enter 2>/dev/null
                fork_import_handled=true
                sleep 3
            fi
        fi

        if _claude_running_in_window "$window_name"; then
            local fc
            fc=$("$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${window_name}" -p 2>/dev/null)
            if echo "$fc" | grep -q "Allow external CLAUDE.md"; then
                continue
            fi
            echo "$window_name" > "$map_file"
            log "Chain window ready: ${window_name} (waited ${waited}s, import_prompt=${fork_import_handled})"
            echo "$window_name"
            return 0
        fi
    done

    log "ERROR: chain fork failed for ${chain_id} — refusing to pollute seed"
    return 1
}

cleanup_chain_window() {
    local chain_id="$1"
    local map_file="${CHAIN_MAP_DIR}/${chain_id}"
    if [ -f "$map_file" ]; then
        local window_name
        window_name=$(cat "$map_file" 2>/dev/null)
        if [ -n "$window_name" ] && [ "$window_name" != "$SEED_WINDOW" ]; then
            "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${window_name}" 2>/dev/null
            log "Cleaned up chain window: ${window_name}"
        fi
        rm -f "$map_file"
    fi
}

# ── Prompt Injection ─────────────────────────────────────────────────

inject_and_wait() {
    # Inject a prompt into a target window and wait for sentinel completion.
    # Args: window_name task_id prompt_file timeout_minutes
    local window="$1"
    local task_id="$2"
    local prompt_file="$3"
    local timeout_minutes="${4:-10}"
    local sentinel_file="${STATE_DIR}/.chain-done-${task_id}"

    rm -f "$sentinel_file"

    # Build augmented prompt with sentinel
    local inject_file="${STATE_DIR}/.inject-${task_id}.txt"
    local summary_file="${STATE_DIR}/.chain-summary-${task_id}.json"
    cat "$prompt_file" > "$inject_file"
    printf '\n\nFINAL STEPS after completing all work:\n1. Write a context summary JSON to %s with: echo '"'"'{"task_completed":"<what you did>","files_modified":["<path1>","<path2>"],"key_findings":[],"gotchas":[]}'"'"' > %s\n   (Replace placeholders with actual values)\n2. Write the sentinel: echo DONE > %s\n' "$summary_file" "$summary_file" "$sentinel_file" >> "$inject_file"

    # Inject via tmux paste-buffer → Enter
    "$TMUX_BIN" load-buffer "$inject_file" 2>/dev/null
    "$TMUX_BIN" paste-buffer -t "${TMUX_SESSION}:${window}" 2>/dev/null
    sleep 0.5
    "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${window}" Enter 2>/dev/null

    log "Injected: task=${task_id} window=${window}"
    rm -f "$inject_file"

    # Wait for sentinel
    local elapsed=0
    local timeout_secs=$((timeout_minutes * 60))
    while [ ! -f "$sentinel_file" ] && [ "$elapsed" -lt "$timeout_secs" ]; do
        sleep 5
        elapsed=$((elapsed + 5))
    done

    if [ -f "$sentinel_file" ]; then
        rm -f "$sentinel_file"
        log "Completed: task=${task_id} (${elapsed}s)"
        return 0
    else
        log "TIMEOUT: task=${task_id} after ${timeout_minutes}m"
        return 1
    fi
}

# ── Request Processing ───────────────────────────────────────────────

process_request() {
    local request_file="$1"
    local claimed_file="${request_file}.claimed"

    mv "$request_file" "$claimed_file" 2>/dev/null || return 0
    request_file="$claimed_file"

    local task_id
    task_id=$(python3 -c "import json; print(json.load(open('$request_file'))['task_id'])" 2>/dev/null)
    if [ -z "$task_id" ]; then
        log "ERROR: cannot read task_id from $request_file"
        rm -f "$request_file"
        return 1
    fi

    # Extract prompt, output_dir, chain_id, model, mcp_config from request
    local prompt_file="${STATE_DIR}/.bridge-prompt-${task_id}.txt"
    local timeout_minutes output_dir chain_id requested_model mcp_config
    eval "$(python3 -c "
import json, shlex
d = json.load(open('$request_file'))
with open('$prompt_file', 'w') as f:
    f.write(d.get('prompt', ''))
print(f'timeout_minutes={d.get(\"timeout_minutes\", 10)}')
print(f'output_dir={shlex.quote(d.get(\"output_dir\", \"\"))}')
print(f'chain_id={shlex.quote(d.get(\"chain_id\", \"\"))}')
print(f'requested_model={shlex.quote(d.get(\"model\", \"\"))}')
print(f'mcp_config={shlex.quote(d.get(\"mcp_config\", \"\"))}')
" 2>/dev/null)"

    local result_file="${STATE_DIR}/execute-result-${task_id}.json"

    # Ensure seed is warm
    if ! ensure_seed; then
        log "ERROR: seed not available for task ${task_id}"
        python3 -c "
import json
json.dump({
    'returncode': 1,
    'result_text': 'Seed session not available',
    'cli_data': {'execution_mode': 'chain-interactive'},
    'stderr': 'seed_unavailable'
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
        rm -f "$request_file" "$prompt_file"
        return 1
    fi

    # Route to chain-specific forked window.
    # NEVER inject directly into the seed — it's a fork source only.
    # Tasks without chain_id get a unique ephemeral chain.
    # Pass persona MCP config so the fork loads required MCP servers.
    local effective_chain="${chain_id:-ephemeral-${task_id}}"
    local target_window
    target_window=$(get_or_create_chain_window "$effective_chain" "$mcp_config")

    if [ -z "$target_window" ]; then
        log "ERROR: fork failed for task ${task_id} — writing error result (seed NOT polluted)"
        python3 -c "
import json
json.dump({
    'returncode': 1,
    'result_text': 'Chain fork failed — could not create isolated session',
    'cli_data': {'execution_mode': 'chain-interactive'},
    'stderr': 'fork_failed_no_seed_fallback'
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
        rm -f "$request_file" "$prompt_file"
        return 1
    fi

    local actual_model="claude-code-interactive"
    log "Dispatching: task=${task_id} → ${target_window} (requested_model=${requested_model:-unset})"

    local summary_file="${STATE_DIR}/.chain-summary-${task_id}.json"

    if inject_and_wait "$target_window" "$task_id" "$prompt_file" "${timeout_minutes:-10}"; then
        python3 -c "
import json, os, time

summary = {}
sf = '$summary_file'
if os.path.exists(sf):
    try:
        summary = json.load(open(sf))
    except: pass

# Fallback: scan output directory for recently modified files
if not summary.get('files_modified'):
    out_dir = '$output_dir'
    if out_dir and os.path.isdir(out_dir):
        recent = []
        for f in os.listdir(out_dir):
            fp = os.path.join(out_dir, f)
            if os.path.isfile(fp) and time.time() - os.path.getmtime(fp) < 120:
                recent.append(fp)
        if recent:
            summary.setdefault('files_modified', recent)
            summary.setdefault('task_completed', 'Task completed via chain-executor')

result_text = 'Completed via chain-executor (interactive session)'
if summary:
    result_text += '\n\n<context-summary>\n' + json.dumps(summary) + '\n</context-summary>'

json.dump({
    'returncode': 0,
    'result_text': result_text,
    'cli_data': {
        'execution_mode': 'chain-interactive',
        'requested_model': '$requested_model',
        'actual_model': '$actual_model',
        'provider': 'anthropic-interactive',
    },
    'stderr': ''
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
    else
        python3 -c "
import json
json.dump({
    'returncode': 124,
    'result_text': 'Timeout in chain-executor after ${timeout_minutes}m',
    'cli_data': {
        'execution_mode': 'chain-interactive',
        'requested_model': '$requested_model',
        'actual_model': '$actual_model',
        'provider': 'anthropic-interactive',
    },
    'stderr': 'sentinel_timeout'
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
    fi

    rm -f "$prompt_file" "$request_file" "$summary_file"

    # Clean up ephemeral chain windows (tasks that aren't part of a real chain)
    if [ -z "$chain_id" ]; then
        cleanup_chain_window "ephemeral-${task_id}"
    else
        # Mark this chain's last-activity time so the reaper knows when it went idle
        mkdir -p "$IDLE_STATE_DIR" 2>/dev/null
        date +%s > "${IDLE_STATE_DIR}/last-activity-chain-${effective_chain:0:8}"
    fi
}

# ── Chain Window Reaper ──────────────────────────────────────────────
#
# Two-signal reaper for chain windows:
#
#   Signal A — "Claude exited" (process check):
#     Three-strike idle counter. If Claude is not running in the window for
#     3 consecutive reaper passes (~90s), reap it. Catches crashed sessions.
#
#   Signal B — "No new work dispatched" (last-activity timestamp):
#     When process_request() completes a task in a chain window, it writes
#     a last-activity timestamp. If REAP_ACTIVITY_TIMEOUT_S elapses with no
#     new task dispatched to that chain, reap it — even if Claude is still
#     running at its idle prompt.
#
# Either signal alone triggers a reap. Together they cover:
#   - Claude crashed/exited → Signal A (3 strikes)
#   - Claude alive but no more work coming → Signal B (activity timeout)

REAP_IDLE_THRESHOLD=3
REAP_ACTIVITY_TIMEOUT_S=120  # 2 minutes since last task completed
IDLE_STATE_DIR="${STATE_DIR}/.chain-idle-counters"

reap_dead_chain_windows() {
    mkdir -p "$IDLE_STATE_DIR" 2>/dev/null
    local reaped=0
    local now
    now=$(date +%s)

    # Collect all current chain windows
    local chain_windows
    chain_windows=$("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep '^chain-')

    for win in $chain_windows; do
        local counter_file="${IDLE_STATE_DIR}/${win}"
        local activity_file="${IDLE_STATE_DIR}/last-activity-${win}"
        local should_reap=false
        local reason=""

        # ── Signal A: Claude process check (three-strike) ──
        if _claude_running_in_window "$win"; then
            # Claude alive — reset strike counter
            rm -f "$counter_file"
        else
            local strikes=0
            [ -f "$counter_file" ] && strikes=$(cat "$counter_file" 2>/dev/null)
            strikes=$((strikes + 1))
            echo "$strikes" > "$counter_file"
            if [ "$strikes" -ge "$REAP_IDLE_THRESHOLD" ]; then
                should_reap=true
                reason="claude exited (${strikes} consecutive idle checks)"
            fi
        fi

        # ── Signal B: Activity timeout ──
        if [ -f "$activity_file" ] && [ "$should_reap" = false ]; then
            local last_active
            last_active=$(cat "$activity_file" 2>/dev/null)
            if [ -n "$last_active" ]; then
                local idle_secs=$((now - last_active))
                if [ "$idle_secs" -ge "$REAP_ACTIVITY_TIMEOUT_S" ]; then
                    should_reap=true
                    reason="no new tasks for ${idle_secs}s (timeout ${REAP_ACTIVITY_TIMEOUT_S}s)"
                fi
            fi
        fi

        # ── Reap ──
        if [ "$should_reap" = true ]; then
            log "Reaping ${win}: ${reason}"
            "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${win}" 2>/dev/null
            rm -f "$counter_file" "$activity_file"
            reaped=$((reaped + 1))
        fi
    done

    # Clean up: map entries for windows that no longer exist
    if [ -d "$CHAIN_MAP_DIR" ]; then
        local existing_windows
        existing_windows=$("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null)
        for map_file in "$CHAIN_MAP_DIR"/*; do
            [ -f "$map_file" ] || continue
            local mapped_win
            mapped_win=$(cat "$map_file" 2>/dev/null)
            if [ -n "$mapped_win" ] && ! echo "$existing_windows" | grep -q "^${mapped_win}$"; then
                rm -f "$map_file"
            fi
        done
    fi

    # Clean up: state files for windows that no longer exist
    for state_file in "$IDLE_STATE_DIR"/*; do
        [ -f "$state_file" ] || continue
        local fname
        fname=$(basename "$state_file")
        # Extract window name from either "chain-xxx" or "last-activity-chain-xxx"
        local check_win="${fname#last-activity-}"
        if [ -n "$chain_windows" ]; then
            echo "$chain_windows" | grep -q "^${check_win}$" || rm -f "$state_file"
        else
            rm -f "$state_file"
        fi
    done

    if [ "$reaped" -gt 0 ]; then
        log "Reaped ${reaped} dead chain window(s)"
    fi
}

# ── Scan + Daemon ────────────────────────────────────────────────────

scan_once() {
    local count=0
    for REQUEST_FILE in "${STATE_DIR}"/execute-request-*.json; do
        [ -f "$REQUEST_FILE" ] || continue
        # Serialize: one task at a time to avoid seed fork race conditions.
        # Pipeline-watcher dispatches tasks one at a time per poll cycle anyway,
        # so concurrent requests are rare.
        process_request "$REQUEST_FILE"
        count=$((count + 1))
    done
    if [ "$count" -gt 0 ]; then
        log "Processed $count execution requests"
    fi
    echo "$count"
}

if [ "${1:-}" = "--daemon" ]; then
    POLL_INTERVAL="${BRIDGE_POLL_INTERVAL:-5}"
    HEALTH_FILE="${STATE_DIR}/.bridge-heartbeat"
    log "Starting host-executor-bridge v2 (chain-interactive, poll=${POLL_INTERVAL}s)"

    mkdir -p "$CHAIN_MAP_DIR" 2>/dev/null
    ensure_seed

    cleanup() {
        rm -f "$HEALTH_FILE"
        # Clean up all chain windows
        if [ -d "$CHAIN_MAP_DIR" ]; then
            for f in "$CHAIN_MAP_DIR"/*; do
                [ -f "$f" ] || continue
                local wn
                wn=$(cat "$f" 2>/dev/null)
                [ -n "$wn" ] && [ "$wn" != "$SEED_WINDOW" ] && "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${wn}" 2>/dev/null
            done
            rm -rf "$CHAIN_MAP_DIR"
        fi
        rm -rf "$IDLE_STATE_DIR" 2>/dev/null
        log "Bridge daemon shutting down"
        exit 0
    }
    trap cleanup SIGTERM SIGINT

    REAP_COUNTER=0
    REAP_INTERVAL=6  # reap every 6th cycle (30s at default 5s poll)
    while true; do
        date -u +%Y-%m-%dT%H:%M:%SZ > "$HEALTH_FILE"
        scan_once
        REAP_COUNTER=$((REAP_COUNTER + 1))
        if [ $((REAP_COUNTER % REAP_INTERVAL)) -eq 0 ]; then
            reap_dead_chain_windows
        fi
        sleep "$POLL_INTERVAL"
    done
else
    scan_once
fi
