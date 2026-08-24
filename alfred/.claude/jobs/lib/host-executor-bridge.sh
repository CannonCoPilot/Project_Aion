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
# Resolve the tmux session hosting the seed (Protos) window. Auto-detect when
# TMUX_SESSION is unset so oneshot invocations (e.g. from event-watcher.sh) do
# not inherit a stale default and fail ensure_seed with seed_unavailable.
if [ -z "${TMUX_SESSION:-}" ]; then
    TMUX_SESSION=$("${HOME}/bin/tmux" list-windows -a -F '#{session_name} #{window_name}' 2>/dev/null | awk '$2=="Protos"{print $1; exit}')
    TMUX_SESSION="${TMUX_SESSION:-aion}"
fi
ALFDEV_DIR="${ALFRED_LAUNCH_DIR:-${HOME}/Claude/Alfred-Dev}"
SEED_WINDOW="Protos"
SEED_SESSION_FILE="${STATE_DIR}/.chain-seed-session-id"
CHAIN_EXECUTOR="${SCRIPT_DIR}/chain-executor.sh"
CHAIN_MAP_DIR="${STATE_DIR}/.chain-windows"

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [host-bridge] $*" >&2
}

# Lowest free tmux window index >= 14. Indices 11, 12 and 13 are reserved for
# W11:Jarvis-dev, W12:Genie and W13:Jacques so those lanes and Alfred chain workers
# never collide (chains previously claimed the lowest free slot, grabbing 11 whenever
# the dev window was absent — and did in fact grab 12 during the Genie install,
# forking chain-31bcc85d onto Genie's pane).
#
# The floor must stay in lockstep with launch-aion.sh's window_target_index().
# A chain fork landing on Genie's pane would inject an Alfred task into a live
# research session — the same class of cross-lane mis-inject documented in
# jicm-actuate.sh's _step_prep.
#
# base-index 0 + renumber-windows off (set by launch-aion.sh) keep indices stable.
_next_chain_index() {
    local idx=14 used
    used=$("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_index}' 2>/dev/null)
    while printf '%s\n' "$used" | grep -qx "$idx"; do idx=$((idx + 1)); done
    echo "$idx"
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
            _refresh_seed_if_stale
            return 0
        fi
        log "Seed window exists but Claude not running — restarting"
        "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${SEED_WINDOW}" 2>/dev/null
    fi

    log "Starting seed session: ${SEED_WINDOW}"
    # Fallback only when AION_MODEL is unset (cron/direct invocation outside
    # launch-aion.sh). Keep the [1m] suffix — it selects the 1M beta window and a
    # bare ID silently yields 200K. Keep in step with launch-aion.sh's default.
    local seed_model="${AION_MODEL:-claude-opus-5[1m]}"
    # Publish the seed model so Python executors fork tasks on the SAME model
    # (prefix-cache match). Read by executor.py / pipeline-watcher.py.
    printf '%s' "$seed_model" > "${STATE_DIR}/seed-model" 2>/dev/null || true
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

_refresh_seed_if_stale() {
    # Re-point the seed id at the CURRENT live seed session.
    #
    # Fixes the frozen-stale-id bug: the seed id used to be captured only when
    # the state file was empty, so once the seed session changed (e.g. a new
    # seed was started by the launcher), forks kept resuming the OLD, dead,
    # minimal seed — a transcript whose only content was the priming exchange.
    # The forked child therefore booted believing it WAS the seed and never
    # executed its ticket.
    #
    # Guard: never re-capture while a chain-* worker is live. A worker's forked
    # jsonl can be the most-recently-modified file and would be mis-captured as
    # the seed. ensure_seed runs before this task's own fork, so a clean board
    # (no chain-* windows) means the newest jsonl is genuinely the seed.
    "$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null \
        | grep -q '^chain-' && return 0

    local stored stored_m=0 newest_m=0 d c m
    stored=$(cat "$SEED_SESSION_FILE" 2>/dev/null | tr -d '[:space:]')
    local dirs=(
        "${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion-alfred"
        "${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev"
    )
    for d in "${dirs[@]}"; do
        [ -d "$d" ] || continue
        c=$(ls -t "$d"/*.jsonl 2>/dev/null | head -1)
        [ -n "$c" ] && { m=$(stat -f %m "$c" 2>/dev/null || echo 0); [ "$m" -gt "$newest_m" ] && newest_m="$m"; }
        [ -n "$stored" ] && [ -f "$d/$stored.jsonl" ] && stored_m=$(stat -f %m "$d/$stored.jsonl" 2>/dev/null || echo 0)
    done

    # Re-capture when: no stored id, stored jsonl missing, or a newer seed
    # session exists (>120s newer than the stored one). 120s avoids churn from
    # normal interleaved writes while reliably catching a genuinely new seed.
    if [ -z "$stored" ] || [ "$stored_m" -eq 0 ] || [ "$((newest_m - stored_m))" -gt 120 ]; then
        log "Seed id stale (stored=${stored:0:12} m=${stored_m} newest_m=${newest_m}) — recapturing"
        _capture_seed_session_id
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

    # Remove any stale window with this name from a prior failed fork. The reuse
    # path above already returned if a live window existed, so anything matching
    # now is dead — and a duplicate window name breaks capture-pane targeting
    # (readiness reads the wrong pane → false timeout → retry pile-up, the
    # failure that trapped a reused chain_id in an infinite re-fork loop).
    while "$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$window_name"; do
        _stale_idx=$("$TMUX_BIN" list-windows -t "$TMUX_SESSION" -F '#{window_index} #{window_name}' 2>/dev/null | awk -v n="$window_name" '$2==n{print $1; exit}')
        [ -z "$_stale_idx" ] && break
        "$TMUX_BIN" kill-window -t "${TMUX_SESSION}:${_stale_idx}" 2>/dev/null
        log "Removed stale window ${window_name} (idx ${_stale_idx}) before fork"
    done

    # Secrets for the forked session's MCP servers. The persona mcp.json files
    # reference "${NEO4J_PASSWORD}", which Claude Code expands from the launched
    # process's environment (verified by probe 2026-08-24), so the config carries
    # no literal secret. This fork does NOT inherit the launcher's environment,
    # which is why the value has to be handed over explicitly here.
    #
    # ⚠️ PASSED VIA `tmux -e`, NOT an inline `export` in the command string.
    # An inline export would be recorded permanently in `pane_start_command`,
    # where `tmux list-windows -F '#{pane_start_command}'` would print the
    # password on demand. `-e` sets the pane environment and leaves that field
    # clean (verified both ways). Do not "simplify" this back into the string.
    local _tmux_env_args=()
    local _neo4j_pw
    _neo4j_pw="$(bash "${PROJECT_DIR:-$HOME/Claude/Project_Aion}/.claude/scripts/get-credential.sh" \
                 .database.neo4j.password --or-empty 2>/dev/null)"
    if [ -n "$_neo4j_pw" ]; then
        _tmux_env_args+=(-e "NEO4J_PASSWORD=${_neo4j_pw}")
    else
        log "WARNING: NEO4J_PASSWORD unresolved — graphiti MCP will fail auth in ${window_name}"
    fi

    # Same treatment for Anna's Archive — see the twin block in chain-executor.sh.
    # book-retriever's mcp.json held the key as a LITERAL in a PUBLIC repo; it now reads
    # "${ANNAS_SECRET_KEY}", which is only populated because of this passthrough.
    local _annas_key
    _annas_key="$(bash "${PROJECT_DIR:-$HOME/Claude/Project_Aion}/.claude/scripts/get-credential.sh" \
                 .annas_archive.secret_key --or-empty 2>/dev/null)"
    if [ -n "$_annas_key" ]; then
        _tmux_env_args+=(-e "ANNAS_SECRET_KEY=${_annas_key}")
    else
        log "WARNING: ANNAS_SECRET_KEY unresolved — annas-archive MCP will supply nothing in ${window_name}"
    fi

    log "Forking seed → ${window_name} for chain ${chain_id:0:12}"
    "$TMUX_BIN" new-window -d -t "${TMUX_SESSION}:$(_next_chain_index)" -n "${window_name}" \
        ${_tmux_env_args[@]+"${_tmux_env_args[@]}"} \
        "cd '${ALFDEV_DIR}' && export ANTHROPIC_BASE_URL=http://localhost:9800 && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: chain-${chain_id}' && claude --resume '${seed_sid}' --fork-session --dangerously-skip-permissions --permission-mode bypassPermissions ${mcp_flag}" 2>/dev/null
    unset _neo4j_pw

    local waited=0
    local fork_import_handled=false
    while [ "$waited" -lt 60 ]; do
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

        # Auto-dismiss a "Settings Warning" prompt (e.g. an invalid permission
        # rule in ~/.claude/settings.json). It blocks the TUI on a 1/2/3 menu
        # with "1. Continue" pre-selected, so Enter proceeds: the invalid rule
        # is skipped, the rest of settings applies, and forks run
        # bypassPermissions regardless. Without this the fork never reaches an
        # interactive prompt and the readiness gate times out.
        if "$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${window_name}" -p 2>/dev/null | grep -q "Settings Warning"; then
            log "Settings Warning in fork ${window_name} — selecting Continue"
            "$TMUX_BIN" send-keys -t "${TMUX_SESSION}:${window_name}" Enter 2>/dev/null
            sleep 2
        fi

        if _claude_running_in_window "$window_name"; then
            local fc
            fc=$("$TMUX_BIN" capture-pane -t "${TMUX_SESSION}:${window_name}" -p 2>/dev/null)
            if echo "$fc" | grep -q "Allow external CLAUDE.md"; then
                continue
            fi
            # The claude PROCESS starts within ~2s, but a fork resuming a large
            # seed session keeps loading its transcript for several more seconds
            # before the TUI accepts input. Injecting during that load silently
            # drops the paste — leaving the fork idle at an empty prompt while
            # the daemon blocks the full timeout waiting for a sentinel that
            # never comes. Gate on the interactive input footer, then settle.
            if ! echo "$fc" | grep -q "bypass permissions"; then
                continue
            fi
            sleep 2
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
    # Inject a prompt into a target window and wait for completion.
    # Args: window_name task_id prompt_file timeout_minutes [output_dir]
    # Completion is signalled by EITHER the explicit sentinel file (primary)
    # OR a freshly-written file in output_dir (secondary). Forked Claude
    # sessions reliably write their deliverable but do not always run the
    # trailing `echo DONE > sentinel` step, so output-detection prevents a
    # false timeout-and-reset loop on work that actually completed.
    local window="$1"
    local task_id="$2"
    local prompt_file="$3"
    local timeout_minutes="${4:-10}"
    local output_dir="${5:-}"
    local sentinel_file="${STATE_DIR}/.chain-done-${task_id}"
    local marker_file="${STATE_DIR}/.inject-marker-${task_id}"

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

    # Baseline marker: output files newer than this were written by THIS run.
    : > "$marker_file"

    # Wait for completion: sentinel (primary) OR fresh output file (secondary).
    local elapsed=0
    local timeout_secs=$((timeout_minutes * 60))
    local doc_grace=0
    while [ "$elapsed" -lt "$timeout_secs" ]; do
        sleep 5
        elapsed=$((elapsed + 5))
        if [ -f "$sentinel_file" ]; then
            rm -f "$sentinel_file" "$marker_file"
            log "Completed (sentinel): task=${task_id} (${elapsed}s)"
            return 0
        fi
        # Output-based completion: a deliverable appeared after injection.
        # Require a brief stability grace so we do not cut off mid-write.
        if [ -n "$output_dir" ] && [ -d "$output_dir" ] && \
           find "$output_dir" -type f -newer "$marker_file" 2>/dev/null | grep -q .; then
            doc_grace=$((doc_grace + 5))
            if [ "$doc_grace" -ge 20 ]; then
                rm -f "$marker_file"
                log "Completed (output-detected): task=${task_id} (${elapsed}s, no sentinel)"
                return 0
            fi
        fi
    done

    rm -f "$marker_file"
    log "TIMEOUT: task=${task_id} after ${timeout_minutes}m"
    return 1
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
    # R2: git baseline for code-ticket evidence — captured host-side because the
    # containerized reviewer has no git and cannot see project repos outside /workspace.
    local git_base=""
    if [ -n "$output_dir" ] && [ -d "$output_dir/.git" ]; then
        git_base=$(git -C "$output_dir" rev-parse HEAD 2>/dev/null)
    fi

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

    if inject_and_wait "$target_window" "$task_id" "$prompt_file" "${timeout_minutes:-10}" "$output_dir"; then
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
        # R2: capture git evidence (commits + diff since baseline) for the reviewer.
        if [ -n "$output_dir" ] && [ -d "$output_dir/.git" ]; then
            python3 - "$output_dir" "$git_base" "${STATE_DIR}/git-evidence-${task_id}.json" <<'PYEOF'
import json, os, subprocess, sys
repo, base, out = sys.argv[1], sys.argv[2], sys.argv[3]
def g(*a):
    try:
        return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""
ev = {}
if repo and os.path.isdir(os.path.join(repo, ".git")):
    head = g("rev-parse", "HEAD")
    rng = base + ".." + head if base and head and base != head else None
    diff = ((g("diff", base, head) if rng else "") + "\n" + g("diff")).strip()
    status = g("status", "--porcelain")
    files = set(l[3:].strip() for l in status.splitlines() if l[3:].strip())
    if rng:
        for f in g("diff", "--name-only", base, head).splitlines():
            if f.strip():
                files.add(f.strip())
    ev = {"base": base, "head": head, "committed": bool(head and base and head != base),
          "commits": g("log", rng, "--pretty=%h %s") if rng else "",
          "status": status, "files": sorted(files), "diff": diff[:12000]}
json.dump(ev, open(out, "w"), indent=2)
PYEOF
        fi
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

    # Daemon singleton — only ONE bridge daemon may run. Duplicates (auto-spawned by
    # the launchd watchdog) contend for the single seed session and make every chain
    # fork fail. A second daemon detects the live owner here and exits cleanly.
    DAEMON_PIDFILE="${STATE_DIR}/.styx-daemon.pid"
    if [ -f "$DAEMON_PIDFILE" ]; then
        _other=$(cat "$DAEMON_PIDFILE" 2>/dev/null)
        if [ -n "$_other" ] && [ "$_other" != "$$" ] && kill -0 "$_other" 2>/dev/null \
           && ps -p "$_other" -o command= 2>/dev/null | grep -q 'host-executor-bridge.sh --daemon'; then
            log "Singleton: another bridge daemon (pid $_other) already running — exiting"
            exit 0
        fi
    fi
    echo "$$" > "$DAEMON_PIDFILE"

    mkdir -p "$CHAIN_MAP_DIR" 2>/dev/null
    ensure_seed

    cleanup() {
        rm -f "$HEALTH_FILE" "$DAEMON_PIDFILE"
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
        if [ -f "${STATE_DIR}/.nexus-paused" ]; then
            log "PAUSED (.nexus-paused present) — skipping scan"
            sleep "$POLL_INTERVAL"; continue
        fi
        scan_once
        REAP_COUNTER=$((REAP_COUNTER + 1))
        if [ $((REAP_COUNTER % REAP_INTERVAL)) -eq 0 ]; then
            reap_dead_chain_windows
        fi
        sleep "$POLL_INTERVAL"
    done
else
    if [ -f "${STATE_DIR}/.nexus-paused" ]; then
        log "PAUSED (.nexus-paused present) — skipping oneshot scan"
    else
        scan_once
    fi
fi
