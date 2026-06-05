#!/bin/bash
# chain-executor.sh — Interactive-session chain executor for pipeline tasks
#
# Instead of launching ephemeral `claude -p` per child, this:
#   1. Maintains a warm "seed" interactive Claude Code session in tmux
#   2. Forks the seed into a chain-specific window when a parent dispatches
#   3. Injects child prompts sequentially into the forked session via tmux paste-buffer
#   4. Monitors sentinel files for completion between children
#
# Cache economics: seed pays one-time cache_write. Fork inherits cache_read.
# Children in the same session accumulate context — each turn is cache_read of
# the full prefix, not a fresh cache_write. This models a human sitting at a
# terminal pasting tasks into Claude Code.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="${JOBS_DIR}/state"
TMUX_BIN="${HOME}/bin/tmux"
TMUX_SESSION="${TMUX_SESSION:-jarvis}"
ALFDEV_DIR="${ALFRED_DIR:-${HOME}/Claude/Project_Aion/alfred}"
SEED_WINDOW="AlfDev-Seed"
SEED_SESSION_FILE="${STATE_DIR}/.chain-seed-session-id"
SENTINEL_DIR="${STATE_DIR}"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [chain-exec] $*"
}

# ── Seed Management ──────────────────────────────────────────────────

ensure_seed() {
    # Check if the seed window exists and has a running Claude process
    if "$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep -q "^${SEED_WINDOW}$"; then
        local pane_pid
        pane_pid=$("$TMUX_BIN" list-panes -t "${TMUX_SESSION}:${SEED_WINDOW}" -F '#{pane_pid}' 2>/dev/null)
        # Claude may BE the pane process (exec) or a child of it
        if [ -n "$pane_pid" ]; then
            local cmd
            cmd=$(ps -p "$pane_pid" -o command= 2>/dev/null)
            if echo "$cmd" | grep -q "claude"; then
                return 0  # seed alive — Claude is the pane process
            fi
            if pgrep -P "$pane_pid" -f "claude" >/dev/null 2>&1; then
                return 0  # seed alive — Claude is a child
            fi
        fi
        log "Seed window exists but Claude not running — restarting"
        "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${SEED_WINDOW}" 2>/dev/null
    fi

    log "Starting seed session in ${SEED_WINDOW}"
    "$TMUX_BIN" new-window -d -t "$TMUX_SESSION" -n "${SEED_WINDOW}" \
        "cd '${ALFDEV_DIR}' && export ANTHROPIC_BASE_URL=http://localhost:9800 && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: seed-session' && claude --dangerously-skip-permissions --permission-mode bypassPermissions" 2>/dev/null

    # Wait for Claude to become interactive (up to 30s)
    local waited=0
    while [ "$waited" -lt 30 ]; do
        sleep 2
        waited=$((waited + 2))
        local pane_pid
        pane_pid=$("$TMUX_BIN" list-panes -t "${TMUX_SESSION}:${SEED_WINDOW}" -F '#{pane_pid}' 2>/dev/null)
        if [ -n "$pane_pid" ]; then
            local cmd
            cmd=$(ps -p "$pane_pid" -o command= 2>/dev/null)
            if echo "$cmd" | grep -q "claude" || pgrep -P "$pane_pid" -f "claude" >/dev/null 2>&1; then
                sleep 3  # let CC finish initialization
                _capture_seed_session_id
                log "Seed ready (waited ${waited}s)"
                return 0
            fi
        fi
    done
    log "ERROR: seed failed to start within 30s"
    return 1
}

_capture_seed_session_id() {
    # Extract session ID from the seed's CC process — look for the JSONL file
    # that was most recently modified in the Alfred-Dev project scope
    local project_dir="${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev"
    if [ -d "$project_dir" ]; then
        local latest
        latest=$(ls -t "$project_dir"/*.jsonl 2>/dev/null | head -1)
        if [ -n "$latest" ]; then
            local sid
            sid=$(basename "$latest" .jsonl)
            echo "$sid" > "$SEED_SESSION_FILE"
            log "Seed session ID: ${sid:0:12}..."
            return 0
        fi
    fi
    log "WARNING: could not capture seed session ID"
    return 1
}

get_seed_session_id() {
    if [ -f "$SEED_SESSION_FILE" ]; then
        cat "$SEED_SESSION_FILE" 2>/dev/null | tr -d '[:space:]'
    fi
}

# ── Chain Execution ──────────────────────────────────────────────────

fork_chain_window() {
    # Fork the seed into a new interactive window for this chain
    local chain_id="$1"
    local window_name="chain-${chain_id:0:10}"
    local seed_sid
    seed_sid=$(get_seed_session_id)

    if [ -z "$seed_sid" ]; then
        log "ERROR: no seed session ID — cannot fork"
        return 1
    fi

    log "Forking seed ${seed_sid:0:12} → ${window_name}"
    "$TMUX_BIN" new-window -d -t "$TMUX_SESSION" -n "${window_name}" \
        "cd '${ALFDEV_DIR}' && export ANTHROPIC_BASE_URL=http://localhost:9800 && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: chain-${chain_id}' && claude --resume '${seed_sid}' --fork-session --dangerously-skip-permissions --permission-mode bypassPermissions" 2>/dev/null

    # Wait for the fork to become interactive
    local waited=0
    while [ "$waited" -lt 20 ]; do
        sleep 2
        waited=$((waited + 2))
        local pane_pid
        pane_pid=$("$TMUX_BIN" list-panes -t "${TMUX_SESSION}:${window_name}" -F '#{pane_pid}' 2>/dev/null)
        if [ -n "$pane_pid" ]; then
            local cmd
            cmd=$(ps -p "$pane_pid" -o command= 2>/dev/null)
            if echo "$cmd" | grep -q "claude" || pgrep -P "$pane_pid" -f "claude" >/dev/null 2>&1; then
                log "Fork ready: ${window_name} (waited ${waited}s)"
                echo "$window_name"
                return 0
            fi
        fi
    done
    log "ERROR: fork failed to start within 20s"
    return 1
}

inject_prompt() {
    # Inject a prompt into an interactive Claude Code session via tmux paste-buffer
    local window_name="$1"
    local task_id="$2"
    local prompt_file="$3"
    local sentinel_file="${SENTINEL_DIR}/.chain-done-${task_id}"

    rm -f "$sentinel_file"

    # Append sentinel instruction to the prompt
    local augmented_prompt="${STATE_DIR}/.chain-prompt-${task_id}.txt"
    cat "$prompt_file" > "$augmented_prompt"
    printf '\n\nWhen you have completed ALL work for this task, write the word DONE to the file %s using the Write tool or Bash. This is your final action.\n' "$sentinel_file" >> "$augmented_prompt"

    # Inject via tmux paste-buffer
    "$TMUX_BIN" load-buffer "$augmented_prompt" 2>/dev/null
    "$TMUX_BIN" paste-buffer -t "${TMUX_SESSION}:${window_name}" 2>/dev/null
    sleep 0.5
    "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${window_name}" Enter 2>/dev/null

    log "Injected prompt for ${task_id} into ${window_name}"
    rm -f "$augmented_prompt"
}

wait_for_sentinel() {
    # Wait for the sentinel file to appear (with timeout)
    local task_id="$1"
    local timeout_minutes="${2:-10}"
    local sentinel_file="${SENTINEL_DIR}/.chain-done-${task_id}"
    local elapsed=0
    local timeout_secs=$((timeout_minutes * 60))

    while [ ! -f "$sentinel_file" ] && [ "$elapsed" -lt "$timeout_secs" ]; do
        sleep 5
        elapsed=$((elapsed + 5))
    done

    if [ -f "$sentinel_file" ]; then
        rm -f "$sentinel_file"
        log "Sentinel received for ${task_id} (${elapsed}s)"
        return 0
    else
        log "TIMEOUT waiting for ${task_id} after ${timeout_minutes}m"
        return 1
    fi
}

# ── Main: Execute a chain of children in a single interactive session ──

execute_chain() {
    # Args: chain_id child1_request.json child2_request.json ...
    local chain_id="$1"
    shift
    local request_files=("$@")

    if [ ${#request_files[@]} -eq 0 ]; then
        log "ERROR: no request files for chain ${chain_id}"
        return 1
    fi

    log "Chain ${chain_id}: ${#request_files[@]} children to execute"

    # Ensure seed is warm
    ensure_seed || return 1

    # Fork seed into chain window
    local window_name
    window_name=$(fork_chain_window "$chain_id")
    if [ -z "$window_name" ]; then
        return 1
    fi

    # Execute children sequentially in the forked session
    local child_idx=0
    for request_file in "${request_files[@]}"; do
        child_idx=$((child_idx + 1))
        local task_id
        task_id=$(python3 -c "import json; print(json.load(open('$request_file'))['task_id'])" 2>/dev/null)
        if [ -z "$task_id" ]; then
            log "ERROR: cannot read task_id from ${request_file}"
            continue
        fi

        # Extract prompt to temp file
        local prompt_file="${STATE_DIR}/.chain-raw-${task_id}.txt"
        python3 -c "
import json
d = json.load(open('$request_file'))
with open('$prompt_file', 'w') as f:
    f.write(d.get('prompt', ''))
" 2>/dev/null

        log "Child ${child_idx}/${#request_files[@]}: ${task_id}"
        inject_prompt "$window_name" "$task_id" "$prompt_file"

        if wait_for_sentinel "$task_id" 10; then
            # Write success result for the bridge to pick up
            local result_file="${STATE_DIR}/execute-result-${task_id}.json"
            python3 -c "
import json
json.dump({
    'returncode': 0,
    'result_text': 'Completed via chain-executor (interactive session)',
    'cli_data': {'execution_mode': 'chain-interactive', 'chain_position': ${child_idx}},
    'stderr': ''
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
            log "Child ${task_id} completed successfully"
        else
            local result_file="${STATE_DIR}/execute-result-${task_id}.json"
            python3 -c "
import json
json.dump({
    'returncode': 124,
    'result_text': 'Timeout in chain-executor after 10m',
    'cli_data': {'execution_mode': 'chain-interactive', 'chain_position': ${child_idx}},
    'stderr': 'sentinel_timeout'
}, open('$result_file', 'w'), indent=2)
" 2>/dev/null
            log "Child ${task_id} timed out — aborting chain"
            break
        fi

        rm -f "$prompt_file"
    done

    # Kill the chain window
    log "Chain ${chain_id} complete — cleaning up ${window_name}"
    "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${window_name}" 2>/dev/null
}

# ── Entry points ──

case "${1:-}" in
    --ensure-seed)
        ensure_seed
        ;;
    --execute-chain)
        shift
        execute_chain "$@"
        ;;
    --status)
        echo "Seed window: $("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep "${SEED_WINDOW}" || echo "NOT RUNNING")"
        echo "Seed session: $(get_seed_session_id || echo "unknown")"
        echo "Active chains: $("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep '^chain-' | wc -l | tr -d ' ')"
        ;;
    *)
        echo "Usage: $0 {--ensure-seed|--execute-chain <chain_id> <request1.json> [request2.json ...]|--status}"
        ;;
esac
