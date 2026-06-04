#!/usr/bin/env bash
# scan-interactive-sessions.sh — Scan completed Claude Code CLI sessions for Loom training captures
#
# Processes session JSONL files from ~/.claude/projects/, extracts prompt/response
# pairs via session-extractor.py, and writes them into the standard training capture
# format for curation by curate-training-data.sh.
#
# Usage:
#   scan-interactive-sessions.sh [OPTIONS]
#     --dry-run              Show what would be captured without writing
#     --session <uuid>       Process a single session by UUID
#     --all                  Process all sessions (ignore last-scan state)
#     --project <name>       Only scan sessions from this project directory name
#     --stale-minutes N      Min mtime age to consider session complete (default: 30)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIPROJECTS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export AIPROJECTS_ROOT
export JOBS_DIR="$SCRIPT_DIR"
export LOG_COMPONENT="scan-interactive"

# Source shared libraries
source "$SCRIPT_DIR/lib/common.sh"

# ============================================================================
# Configuration
# ============================================================================

CLAUDE_PROJECTS_DIR="${HOME}/.claude/projects"
TC_CAPTURE_DIR="${AIPROJECTS_ROOT}/.claude/data/training"
STATE_FILE="${TC_CAPTURE_DIR}/quality/interactive-scan-state.json"
EXTRACTOR="${SCRIPT_DIR}/lib/session-extractor.py"

DRY_RUN=0
SINGLE_SESSION=""
SCAN_ALL=0
PROJECT_FILTER=""
STALE_MINUTES=30

# ============================================================================
# CLI Parsing
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)       DRY_RUN=1; shift ;;
            --session)       SINGLE_SESSION="$2"; shift 2 ;;
            --all)           SCAN_ALL=1; shift ;;
            --project)       PROJECT_FILTER="$2"; shift 2 ;;
            --stale-minutes) STALE_MINUTES="$2"; shift 2 ;;
            *)
                log_error "Unknown argument: $1"
                exit 1
                ;;
        esac
    done
}

# ============================================================================
# State Management
# ============================================================================

load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        LAST_SCAN_AT=$(jq -r '.last_scan_at // "1970-01-01T00:00:00Z"' "$STATE_FILE" 2>/dev/null || echo "1970-01-01T00:00:00Z")
    else
        # shellcheck disable=SC2034
        LAST_SCAN_AT="1970-01-01T00:00:00Z"
    fi
}

save_state() {
    local processed_json="$1"
    local now
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    if [[ -f "$STATE_FILE" ]]; then
        # Merge new processed sessions into existing state
        jq --arg now "$now" --argjson new "$processed_json" '
            .last_scan_at = $now |
            .processed_sessions = ((.processed_sessions // []) + $new | unique)
        ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    else
        jq -n --arg now "$now" --argjson sessions "$processed_json" '{
            last_scan_at: $now,
            processed_sessions: $sessions
        }' > "$STATE_FILE"
    fi
}

is_session_processed() {
    local session_id="$1"
    if [[ ! -f "$STATE_FILE" ]]; then
        return 1
    fi
    jq -e --arg sid "$session_id" '.processed_sessions // [] | index($sid) != null' "$STATE_FILE" >/dev/null 2>&1
}

# ============================================================================
# Session Discovery
# ============================================================================

find_sessions() {
    local sessions=()

    # Find all project directories
    local project_dirs=()
    if [[ -n "$PROJECT_FILTER" ]]; then
        project_dirs=("${CLAUDE_PROJECTS_DIR}/"*"${PROJECT_FILTER}"*)
    else
        for d in "${CLAUDE_PROJECTS_DIR}"/*/; do
            [[ -d "$d" ]] && project_dirs+=("$d")
        done
    fi

    for pdir in "${project_dirs[@]}"; do
        [[ -d "$pdir" ]] || continue

        for jsonl in "$pdir"/*.jsonl; do
            [[ -f "$jsonl" ]] || continue
            local basename
            basename=$(basename "$jsonl" .jsonl)

            # Skip non-UUID files (like sessions-index.json)
            if ! [[ "$basename" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
                continue
            fi

            # Single session mode
            if [[ -n "$SINGLE_SESSION" ]]; then
                if [[ "$basename" == "$SINGLE_SESSION" ]]; then
                    sessions+=("$jsonl")
                fi
                continue
            fi

            # Skip if already processed (unless --all)
            if [[ "$SCAN_ALL" -eq 0 ]] && is_session_processed "$basename"; then
                continue
            fi

            # Skip active sessions (mtime too recent)
            local mtime_seconds
            mtime_seconds=$(stat -c %Y "$jsonl" 2>/dev/null || stat -f %m "$jsonl" 2>/dev/null || echo 0)
            local now_seconds
            now_seconds=$(date +%s)
            local age_minutes=$(( (now_seconds - mtime_seconds) / 60 ))

            if [[ "$age_minutes" -lt "$STALE_MINUTES" ]]; then
                continue
            fi

            sessions+=("$jsonl")
        done
    done

    printf '%s\n' "${sessions[@]}"
}

# ============================================================================
# Capture Writing
# ============================================================================

write_capture() {
    local segment_json="$1"
    local capture_id="$2"
    local today="$3"

    local prompt_text response_text
    prompt_text=$(echo "$segment_json" | jq -r '.prompt_text')
    response_text=$(echo "$segment_json" | jq -r '.response_text')

    # Write content files — scrubbed through secret-scrub.py before landing
    # on disk. Root-cause fix for the 2026-04 capture-pipeline leaks (T3.2 /
    # AIProjects-v523). Every secret pattern (API keys, JWTs, Telegram tokens,
    # webhook secrets, etc.) gets replaced with [REDACTED:rule-name] and
    # logged to .claude/logs/secret-scrub.jsonl for audit.
    local prompt_file="${TC_CAPTURE_DIR}/content/${capture_id}-prompt.txt"
    local response_file="${TC_CAPTURE_DIR}/content/${capture_id}-response.txt"
    local scrub_lib="${SCRIPT_DIR}/lib/secret-scrub.py"
    echo "$prompt_text"   | python3 "$scrub_lib" --source "interactive:${capture_id}:prompt"   --quiet > "$prompt_file"
    echo "$response_text" | python3 "$scrub_lib" --source "interactive:${capture_id}:response" --quiet > "$response_file"

    # Compute prompt hash
    local prompt_hash
    prompt_hash=$(echo -n "$prompt_text" | sha256sum | cut -d' ' -f1)

    # Build index record
    local index_record
    index_record=$(echo "$segment_json" | jq -c \
        --arg cid "$capture_id" \
        --arg ts "$(echo "$segment_json" | jq -r '.timestamp')" \
        --arg sid "$(echo "$segment_json" | jq -r '.session_id')" \
        --arg project "$(echo "$segment_json" | jq -r '.project')" \
        --arg prompt_hash "$prompt_hash" \
        --arg prompt_f "content/${capture_id}-prompt.txt" \
        --argjson prompt_len "$(echo "$segment_json" | jq '.metrics.prompt_length')" \
        --arg response_f "content/${capture_id}-response.txt" \
        --argjson response_len "$(echo "$segment_json" | jq '.metrics.response_length')" \
        --argjson output_tok "$(echo "$segment_json" | jq '.metrics.output_tokens')" \
        --argjson num_turns "$(echo "$segment_json" | jq '.metrics.num_assistant_turns')" \
        --argjson tool_count "$(echo "$segment_json" | jq '.metrics.tool_call_count')" \
        --argjson seg_idx "$(echo "$segment_json" | jq '.segment_index')" \
        --argjson total_prompts "$(echo "$segment_json" | jq '.total_session_prompts')" \
        '{
            capture_id: $cid,
            version: "1.2",
            timestamp: $ts,
            duration_s: 0,
            job_name: "interactive-session",
            persona: "interactive-david",
            persona_tier: "unknown",
            engine: "claude-code-interactive",
            session_id: $sid,
            model_requested: "unknown",
            model_actual: null,
            router_model: null,
            router_overridden: false,
            tokens: {
                input: null,
                output: $output_tok,
                cache_read: null,
                cache_creation: null,
                cache_hit_ratio: null
            },
            cost_usd: 0,
            source: "interactive",
            input: {
                prompt_hash: ("sha256:" + $prompt_hash),
                prompt_file: $prompt_f,
                prompt_length: $prompt_len,
                task_ids: [],
                allowed_tools: []
            },
            output: {
                response_file: $response_f,
                response_length: $response_len,
                stop_reason: "end_turn",
                is_error: false,
                subtype: "success",
                num_turns: $num_turns
            },
            result: {
                exit_code: 0,
                error_class: null,
                attempt: 1,
                attempts_total: 1,
                is_failure: false
            },
            tool_calls_file: null,
            tool_calls_summary: {total: $tool_count},
            quality: {
                quality_filled_at: null,
                human_feedback: null,
                feedback_comment: null,
                execution_outcome: null,
                tasks_closed: null,
                confidence: null
            },
            persona_data: {
                signals: .signals,
                project: $project,
                segment_index: $seg_idx,
                total_session_prompts: $total_prompts,
                tool_names: .metrics.tool_names,
                has_writes: .metrics.has_writes,
                has_commits: .metrics.has_commits
            }
        }')

    # Append to index
    local index_file="${TC_CAPTURE_DIR}/index/captures-${today}.jsonl"
    echo "$index_record" >> "$index_file"
}

# ============================================================================
# Main
# ============================================================================

main() {
    parse_args "$@"

    # Verify extractor exists
    if [[ ! -f "$EXTRACTOR" ]]; then
        log_error "session-extractor.py not found at $EXTRACTOR"
        exit 1
    fi

    # Ensure directories exist
    mkdir -p "${TC_CAPTURE_DIR}/content" "${TC_CAPTURE_DIR}/index" "${TC_CAPTURE_DIR}/quality"

    load_state

    [[ "$DRY_RUN" -eq 1 ]] && log_warning "DRY RUN MODE — no files will be written"

    # Find sessions to process
    local sessions
    sessions=$(find_sessions)
    local session_count
    session_count=$(echo "$sessions" | grep -c '.' || echo 0)

    if [[ "$session_count" -eq 0 ]]; then
        log_info "No new sessions to process"
        exit 0
    fi

    log_info "Found $session_count sessions to process"

    local total_captures=0
    local total_sessions_processed=0
    local processed_ids="[]"
    local today
    today=$(date -u +%Y-%m-%d)

    while IFS= read -r session_file; do
        [[ -z "$session_file" ]] && continue
        local session_uuid
        session_uuid=$(basename "$session_file" .jsonl)

        # Run extractor
        local output
        output=$(python3 "$EXTRACTOR" "$session_file" 2>/dev/null) || {
            log_warning "Extractor failed for $session_uuid"
            continue
        }

        local segment_count
        segment_count=$(echo "$output" | grep -c '^{' || echo 0)

        if [[ "$segment_count" -eq 0 ]]; then
            # Track as processed even if no captures (avoid re-scanning)
            processed_ids=$(echo "$processed_ids" | jq --arg sid "$session_uuid" '. + [$sid]')
            continue
        fi

        if [[ "$DRY_RUN" -eq 1 ]]; then
            log_info "[DRY-RUN] $session_uuid: would capture $segment_count segments"
            total_captures=$((total_captures + segment_count))
        else
            local seg_num=0
            while IFS= read -r segment_json; do
                [[ -z "$segment_json" ]] && continue
                local capture_id
                capture_id="cap-int-$(uuidgen | tr '[:upper:]' '[:lower:]')"

                write_capture "$segment_json" "$capture_id" "$today"
                ((seg_num++))
            done <<< "$output"

            total_captures=$((total_captures + seg_num))
            log_info "$session_uuid: captured $seg_num segments"
        fi

        processed_ids=$(echo "$processed_ids" | jq --arg sid "$session_uuid" '. + [$sid]')
        ((total_sessions_processed++))
    done <<< "$sessions"

    # Save state
    if [[ "$DRY_RUN" -eq 0 ]]; then
        save_state "$processed_ids"
    fi

    log_success "Scan complete: $total_sessions_processed sessions, $total_captures captures"
}

main "$@"
