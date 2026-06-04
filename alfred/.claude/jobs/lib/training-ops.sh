#!/usr/bin/env bash
# training-ops.sh — Shared functions for Loom Phase 4: quality backfill, scoring, curation
#
# Source this in curate-training-data.sh, export-training-data.sh, generate-loom-nodes.sh.
# Requires: common.sh, pulse-api.sh already sourced. jq available.
#
# Provides:
#   tc_load_settings()          — Read training_capture + loom_nodes config
#   tc_get_capture_dir()        — Return capture data root path
#   tc_load_feedback_lookup()   — Build task_id -> feedback[] map
#   tc_correlate_feedback()     — Match capture to feedback entry
#   tc_load_persona_output()    — Read persona daily JSONL by date
#   tc_detect_signals()         — Identify quality signals from merged record
#   tc_compute_score()          — Calculate quality_score from signal list
#   tc_assign_tier()            — Map score to retention tier
#   tc_check_duplicate()        — Check if capture_id exists in curated index
#   tc_write_backfill_record()  — Append backfill record to daily file

# Guard against double-sourcing
[ -n "${_TRAINING_OPS_SH_LOADED:-}" ] && return 0
_TRAINING_OPS_SH_LOADED=1

# ============================================================================
# Configuration
# ============================================================================

# Signal weights from loom-quality-signals.md spec
# Positive signals
declare -A TC_SIGNAL_WEIGHTS=(
  [human_agreed]=0.40
  [task_closed_success]=0.25
  [correct_routing]=0.20
  [successful_deployment]=0.20
  [high_confidence]=0.10
  [clean_execution]=0.10
  [pattern_matched]=0.05
  # Negative signals
  [human_wrong]=-0.50
  [rollback_triggered]=-0.30
  [human_adjusted]=-0.25
  [task_failed]=-0.20
  [wrong_routing]=-0.20
  [error_execution]=-0.20
  [budget_exceeded]=-0.15
  [retry_required]=-0.10
  # Interactive session signals
  [session_continued]=0.15
  [deep_implementation]=0.20
  [commit_in_response]=0.25
  [long_session]=0.05
  [user_correction]=-0.15
)

TC_BASE_SCORE="0.50"

# Tier thresholds
TC_TIER_GOLDEN="0.85"
TC_TIER_SILVER="0.50"
TC_TIER_CORRECTION_LOW="0.30"

# Persona output paths (relative to AIPROJECTS_ROOT)
declare -A TC_PERSONA_OUTPUT_DIRS=(
  [ai-david]=".claude/agent-output/results/ai-david"
  [orchestrator]=".claude/agent-output/results/orchestrator"
  [task-evaluator]=".claude/agent-output/results/task-evaluator"
  [task-executor]=".claude/agent-output/results/task-executor"
  [infrastructure-deployer]=".claude/agent-output/results/infrastructure-deployer"
  [researcher]=".claude/agent-output/results/task-research"
)

# ============================================================================
# Settings
# ============================================================================

_TC_SETTINGS_LOADED=0
TC_CAPTURE_DIR=""
TC_FEEDBACK_FILE=""

tc_load_settings() {
  local settings_file="${AIPROJECTS_ROOT:-.}/.claude/jobs/state/nexus-settings.json"
  if [[ ! -f "$settings_file" ]]; then
    log_error "nexus-settings.json not found: $settings_file"
    return 1
  fi

  # Verify bc is available (required for float scoring)
  if ! command -v bc &>/dev/null; then
    log_error "bc is required for quality scoring but not found"
    return 1
  fi

  local capture_dir
  capture_dir=$(jq -r '.training_capture.capture_dir // ".claude/data/training"' "$settings_file")
  TC_CAPTURE_DIR="${AIPROJECTS_ROOT:-.}/${capture_dir}"

  TC_FEEDBACK_FILE="${AIPROJECTS_ROOT:-.}/.claude/agent-output/results/ai-david/feedback.jsonl"

  _TC_SETTINGS_LOADED=1
}

tc_get_capture_dir() {
  [[ "$_TC_SETTINGS_LOADED" -eq 0 ]] && tc_load_settings
  echo "$TC_CAPTURE_DIR"
}

# ============================================================================
# Feedback Correlation
# ============================================================================

# Global lookup table (populated by tc_load_feedback_lookup)
_TC_FEEDBACK_LOOKUP=""
_TC_FEEDBACK_LOADED=0

tc_load_feedback_lookup() {
  [[ "$_TC_SETTINGS_LOADED" -eq 0 ]] && tc_load_settings

  if [[ ! -f "$TC_FEEDBACK_FILE" ]]; then
    log_warning "feedback.jsonl not found: $TC_FEEDBACK_FILE"
    _TC_FEEDBACK_LOOKUP="{}"
    _TC_FEEDBACK_LOADED=1
    return 0
  fi

  # Build lookup: { "task_id": [ {feedback_entry}, ... ], ... }
  _TC_FEEDBACK_LOOKUP=$(jq -s '
    group_by(.task_id)
    | map({key: .[0].task_id, value: .})
    | from_entries
  ' "$TC_FEEDBACK_FILE" 2>/dev/null) || _TC_FEEDBACK_LOOKUP="{}"

  _TC_FEEDBACK_LOADED=1
}

# tc_correlate_feedback <capture_json>
# Outputs the matching feedback entry (or "null") on stdout
tc_correlate_feedback() {
  local capture_json="$1"
  [[ "$_TC_FEEDBACK_LOADED" -eq 0 ]] && tc_load_feedback_lookup

  # Extract task_ids array and capture timestamp
  local task_ids capture_ts
  task_ids=$(echo "$capture_json" | jq -r '.input.task_ids[]' 2>/dev/null)
  capture_ts=$(echo "$capture_json" | jq -r '.timestamp' 2>/dev/null)

  if [[ -z "$task_ids" || "$capture_ts" == "null" ]]; then
    echo "null"
    return 0
  fi

  # For each task_id, find feedback within 7-day window, pick closest
  local best_match="null"
  local best_delta=999999999

  while IFS= read -r tid; do
    [[ -z "$tid" ]] && continue

    local matches
    matches=$(echo "$_TC_FEEDBACK_LOOKUP" | jq --arg tid "$tid" --arg cts "$capture_ts" '
      .[$tid] // []
      | map(select(
          .decision_timestamp != null
          and (.decision_timestamp >= $cts)
          and ((.decision_timestamp | fromdateiso8601) - ($cts | fromdateiso8601) <= 604800)
        ))
      | sort_by((.decision_timestamp | fromdateiso8601) - ($cts | fromdateiso8601))
      | first // null
    ' 2>/dev/null)

    if [[ "$matches" != "null" && -n "$matches" ]]; then
      local delta
      delta=$(echo "$matches" | jq --arg cts "$capture_ts" '
        ((.decision_timestamp | fromdateiso8601) - ($cts | fromdateiso8601))
        | if . < 0 then -. else . end | floor
      ' 2>/dev/null) || delta=999999999

      if (( $(echo "$delta < $best_delta" | bc -l 2>/dev/null || echo 0) )); then
        best_match="$matches"
        best_delta="$delta"
      fi
    fi
  done <<< "$task_ids"

  echo "$best_match"
}

# ============================================================================
# Persona Output Loading
# ============================================================================

# tc_load_persona_output <persona> <date_str>
# Reads the persona's daily output file and outputs it on stdout
tc_load_persona_output() {
  local persona="$1"
  local date_str="$2"  # YYYY-MM-DD format
  local base_dir="${AIPROJECTS_ROOT:-.}/${TC_PERSONA_OUTPUT_DIRS[$persona]:-}"

  if [[ -z "$base_dir" || ! -d "$base_dir" ]]; then
    echo "[]"
    return 0
  fi

  case "$persona" in
    ai-david)
      # Daily JSONL: YYYY-MM-DD.jsonl
      local f="$base_dir/${date_str}.jsonl"
      if [[ -f "$f" ]]; then
        jq -s '.' "$f" 2>/dev/null || echo "[]"
      else
        echo "[]"
      fi
      ;;
    orchestrator)
      # Daily JSONL: decisions-YYYY-MM-DD.jsonl
      local f="$base_dir/decisions-${date_str}.jsonl"
      if [[ -f "$f" ]]; then
        jq -s '.' "$f" 2>/dev/null || echo "[]"
      else
        echo "[]"
      fi
      ;;
    task-evaluator|infrastructure-deployer)
      # Individual JSON files: YYYY-MM-DD-HHMMSS.json — collect all for the date
      local files
      files=$(find "$base_dir" -name "${date_str}-*.json" -type f 2>/dev/null)
      if [[ -n "$files" ]]; then
        local combined="["
        local first=1
        while IFS= read -r f; do
          [[ "$first" -eq 0 ]] && combined+=","
          combined+=$(cat "$f" 2>/dev/null || echo "{}")
          first=0
        done <<< "$files"
        combined+="]"
        echo "$combined" | jq '.' 2>/dev/null || echo "[]"
      else
        echo "[]"
      fi
      ;;
    *)
      echo "[]"
      ;;
  esac
}

# tc_match_persona_output <persona_outputs_json> <task_id> <capture_ts>
# Find the output entry matching a task_id within a reasonable time window
tc_match_persona_output() {
  local outputs="$1"
  local task_id="$2"
  local capture_ts="$3"

  echo "$outputs" | jq --arg tid "$task_id" --arg cts "$capture_ts" '
    map(select(.task_id == $tid))
    | sort_by(
        ((.timestamp // "2099-01-01T00:00:00Z") | fromdateiso8601)
        - ($cts | fromdateiso8601)
        | if . < 0 then -. else . end
      )
    | first // null
  ' 2>/dev/null || echo "null"
}

# ============================================================================
# Signal Detection
# ============================================================================

# tc_detect_signals <capture_json> <backfill_json>
# Outputs a JSON array of detected signal names
tc_detect_signals() {
  local capture="$1"
  local backfill="$2"

  # Merge capture + backfill into a single assessment
  local signals="[]"

  # --- Execution-based signals (from capture record itself) ---

  local exit_code is_failure is_error output_subtype
  exit_code=$(echo "$capture" | jq -r '.result.exit_code // 0')
  is_failure=$(echo "$capture" | jq -r '.result.is_failure // false')
  is_error=$(echo "$capture" | jq -r '.output.is_error // false')
  output_subtype=$(echo "$capture" | jq -r '.output.subtype // ""')

  # clean_execution: exit_code == 0, not failure, not error
  if [[ "$exit_code" == "0" && "$is_failure" == "false" && "$is_error" == "false" ]]; then
    signals=$(echo "$signals" | jq '. + ["clean_execution"]')
  fi

  # error_execution: is_failure or is_error
  if [[ "$is_failure" == "true" || "$is_error" == "true" ]]; then
    signals=$(echo "$signals" | jq '. + ["error_execution"]')
  fi

  # retry_required: attempt > 1
  local attempt
  attempt=$(echo "$capture" | jq -r '.result.attempt // 1')
  if [[ "$attempt" -gt 1 ]]; then
    signals=$(echo "$signals" | jq '. + ["retry_required"]')
  fi

  # budget_exceeded: output.subtype indicates max_budget or max_turns hit (per spec)
  case "$output_subtype" in
    error_max_budget|error_max_turns)
      signals=$(echo "$signals" | jq '. + ["budget_exceeded"]')
      ;;
  esac

  # --- Immediate signals from capture persona_data (available at capture time) ---

  # high_confidence from capture (immediate, before backfill)
  local cap_confidence
  cap_confidence=$(echo "$capture" | jq -r '.persona_data.confidence // ""')
  if [[ "$cap_confidence" == "high" ]]; then
    signals=$(echo "$signals" | jq '. + ["high_confidence"]')
  fi

  # pattern_matched from capture (immediate)
  local cap_pattern
  cap_pattern=$(echo "$capture" | jq -r '.persona_data.pattern_matched // ""')
  if [[ -n "$cap_pattern" && "$cap_pattern" != "null" ]]; then
    signals=$(echo "$signals" | jq '. + ["pattern_matched"]')
  fi

  # rollback_triggered from capture persona_data (infra deployer)
  local rollback
  rollback=$(echo "$capture" | jq -r '
    .persona_data.results // [] | map(select(.rollback_triggered == true)) | length
  ' 2>/dev/null)
  if [[ "${rollback:-0}" -gt 0 ]]; then
    signals=$(echo "$signals" | jq '. + ["rollback_triggered"]')
  fi

  # successful_deployment from capture persona_data (infra deployer)
  local deploy_pass
  deploy_pass=$(echo "$capture" | jq -r '
    .persona_data.results // [] | map(select(.health_check == "pass")) | length
  ' 2>/dev/null)
  if [[ "${deploy_pass:-0}" -gt 0 ]]; then
    signals=$(echo "$signals" | jq '. + ["successful_deployment"]')
  fi

  # --- Backfill-based signals (async, from feedback + Pulse + persona daily logs) ---

  if [[ "$backfill" != "null" && -n "$backfill" ]]; then

    # Human feedback signals
    local human_fb
    human_fb=$(echo "$backfill" | jq -r '.human_feedback // ""')
    case "$human_fb" in
      agreed)  signals=$(echo "$signals" | jq '. + ["human_agreed"]') ;;
      wrong)   signals=$(echo "$signals" | jq '. + ["human_wrong"]') ;;
      adjust)  signals=$(echo "$signals" | jq '. + ["human_adjusted"]') ;;
    esac

    # Confidence signal from backfill (if not already detected from capture)
    if ! echo "$signals" | jq -e 'index("high_confidence")' &>/dev/null; then
      local bf_confidence
      bf_confidence=$(echo "$backfill" | jq -r '.confidence // ""')
      if [[ "$bf_confidence" == "high" ]]; then
        signals=$(echo "$signals" | jq '. + ["high_confidence"]')
      fi
    fi

    # Pattern matched from backfill (if not already detected from capture)
    if ! echo "$signals" | jq -e 'index("pattern_matched")' &>/dev/null; then
      local bf_pattern
      bf_pattern=$(echo "$backfill" | jq -r '.pattern_matched // ""')
      if [[ -n "$bf_pattern" && "$bf_pattern" != "null" ]]; then
        signals=$(echo "$signals" | jq '. + ["pattern_matched"]')
      fi
    fi

    # Task closure signal
    local task_status
    task_status=$(echo "$backfill" | jq -r '.task_status // ""')
    case "$task_status" in
      closed|completed|done) signals=$(echo "$signals" | jq '. + ["task_closed_success"]') ;;
      failed)                signals=$(echo "$signals" | jq '. + ["task_failed"]') ;;
    esac

    # Routing correctness (orchestrator — inferred from task outcome)
    # If orchestrator routed a task and it was closed successfully → correct_routing
    # If task failed after routing → wrong_routing
    local route_action
    route_action=$(echo "$backfill" | jq -r '.route_action // ""')
    if [[ "$route_action" == "route-to-persona" ]]; then
      case "$task_status" in
        closed|completed|done) signals=$(echo "$signals" | jq '. + ["correct_routing"]') ;;
        failed)                signals=$(echo "$signals" | jq '. + ["wrong_routing"]') ;;
      esac
    fi
  fi

  # --- Interactive session signals (pre-computed by session-extractor.py) ---
  local source
  source=$(echo "$capture" | jq -r '.source // ""')
  if [[ "$source" == "interactive" ]]; then
    local interactive_signals
    interactive_signals=$(echo "$capture" | jq -r '.persona_data.signals // [] | .[]' 2>/dev/null)
    while IFS= read -r isig; do
      [[ -z "$isig" ]] && continue
      # Only add if not already present and is a known interactive signal
      case "$isig" in
        session_continued|deep_implementation|commit_in_response|long_session|user_correction)
          if ! echo "$signals" | jq -e --arg s "$isig" 'index($s) != null' &>/dev/null; then
            signals=$(echo "$signals" | jq --arg s "$isig" '. + [$s]')
          fi
          ;;
      esac
    done <<< "$interactive_signals"
  fi

  echo "$signals"
}

# ============================================================================
# Scoring
# ============================================================================

# tc_compute_score <signals_json_array>
# Outputs a float score clamped to [0.0, 1.0]
tc_compute_score() {
  local signals_json="$1"

  local score="$TC_BASE_SCORE"

  # Extract signal names and sum weights
  local signal_names
  signal_names=$(echo "$signals_json" | jq -r '.[]' 2>/dev/null)

  while IFS= read -r sig; do
    [[ -z "$sig" ]] && continue
    local weight="${TC_SIGNAL_WEIGHTS[$sig]:-0}"
    score=$(echo "$score + $weight" | bc -l 2>/dev/null || echo "$score")
  done <<< "$signal_names"

  # Clamp to [0.0, 1.0]
  if (( $(echo "$score > 1.0" | bc -l 2>/dev/null || echo 0) )); then
    score="1.00"
  elif (( $(echo "$score < 0.0" | bc -l 2>/dev/null || echo 0) )); then
    score="0.00"
  fi

  # Format to 2 decimal places
  printf "%.2f" "$score"
}

# tc_assign_tier <score>
# Outputs: golden | silver | correction | noise
tc_assign_tier() {
  local score="$1"

  if (( $(echo "$score >= $TC_TIER_GOLDEN" | bc -l 2>/dev/null || echo 0) )); then
    echo "golden"
  elif (( $(echo "$score >= $TC_TIER_SILVER" | bc -l 2>/dev/null || echo 0) )); then
    echo "silver"
  elif (( $(echo "$score >= $TC_TIER_CORRECTION_LOW" | bc -l 2>/dev/null || echo 0) )); then
    echo "correction"
  else
    echo "noise"
  fi
}

# ============================================================================
# Deduplication
# ============================================================================

# tc_check_duplicate <capture_id> <curated_index_file>
# Returns 0 if duplicate found, 1 if not
tc_check_duplicate() {
  local capture_id="$1"
  local curated_file="$2"

  if [[ ! -f "$curated_file" ]]; then
    return 1  # No curated file = no duplicates
  fi

  grep -qF "\"capture_id\":\"${capture_id}\"" "$curated_file" 2>/dev/null
}

# tc_check_prompt_hash_duplicate <prompt_hash> <curated_index_file>
# Returns 0 if duplicate found, 1 if not
tc_check_prompt_hash_duplicate() {
  local prompt_hash="$1"
  local curated_file="$2"

  if [[ ! -f "$curated_file" ]]; then
    return 1
  fi

  grep -qF "\"prompt_hash\":\"${prompt_hash}\"" "$curated_file" 2>/dev/null
}

# ============================================================================
# Backfill Record Writing
# ============================================================================

# tc_write_backfill_record <capture_id> <backfill_json> <date_str>
# Appends to quality/backfill-YYYY-MM-DD.jsonl
tc_write_backfill_record() {
  local capture_id="$1"
  local backfill_json="$2"
  local date_str="$3"

  [[ "$_TC_SETTINGS_LOADED" -eq 0 ]] && tc_load_settings

  local quality_dir="${TC_CAPTURE_DIR}/quality"
  mkdir -p "$quality_dir"

  local backfill_file="${quality_dir}/backfill-${date_str}.jsonl"

  # Check if already backfilled
  if [[ -f "$backfill_file" ]] && grep -qF "\"capture_id\":\"${capture_id}\"" "$backfill_file" 2>/dev/null; then
    return 0  # Already exists, skip
  fi

  # Add capture_id and timestamp to backfill record
  echo "$backfill_json" | jq -c --arg cid "$capture_id" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    . + {capture_id: $cid, backfilled_at: $ts}
  ' >> "$backfill_file"
}

# ============================================================================
# Filtering
# ============================================================================

# tc_should_exclude <capture_json>
# Returns 0 if record should be excluded, 1 if it should be kept
tc_should_exclude() {
  local capture="$1"

  # Empty response
  local resp_len
  resp_len=$(echo "$capture" | jq -r '.output.response_length // 0')
  [[ "$resp_len" -eq 0 ]] && return 0

  # Error response
  local is_error
  is_error=$(echo "$capture" | jq -r '.output.is_error // false')
  [[ "$is_error" == "true" ]] && return 0

  # Auth failure
  local error_class
  error_class=$(echo "$capture" | jq -r '.result.error_class // ""')
  [[ "$error_class" == "auth" ]] && return 0

  # Budget exceeded with short response (truncated output, no training value)
  local subtype
  subtype=$(echo "$capture" | jq -r '.output.subtype // ""')
  if [[ "$subtype" == "error_max_budget" || "$subtype" == "error_max_turns" ]]; then
    [[ "$resp_len" -lt 500 ]] && return 0
  fi

  # Record type: only keep "execution" records (skip "failure")
  local record_type
  record_type=$(echo "$capture" | jq -r '.record_type // "execution"')
  [[ "$record_type" == "failure" ]] && return 0

  # Test/debug runs
  local job_name
  job_name=$(echo "$capture" | jq -r '.job_name // ""')
  [[ "$job_name" == test-* || "$job_name" == debug-* ]] && return 0

  # Pre-check only (no LLM interaction)
  local num_turns
  num_turns=$(echo "$capture" | jq -r '.output.num_turns // 1')
  [[ "$num_turns" -eq 0 ]] && return 0

  return 1  # Keep
}

# ============================================================================
# Pulse Task Status Query
# ============================================================================

# tc_get_task_status <task_id>
# Outputs: open | in_progress | closed | failed | unknown
tc_get_task_status() {
  local task_id="$1"

  if [[ -z "$task_id" || "$task_id" == "null" ]]; then
    echo "unknown"
    return 0
  fi

  local task_json
  task_json=$(pulse_get_task "$task_id" 2>/dev/null)

  if [[ -z "$task_json" || "$task_json" == "null" ]]; then
    echo "unknown"
    return 0
  fi

  local status
  status=$(echo "$task_json" | jq -r '.status // "unknown"')
  echo "$status"
}

# tc_get_task_closure_status <task_id>
# Returns "closed" if task is closed/completed, "failed" if failed, empty otherwise
tc_get_task_closure_status() {
  local task_id="$1"
  local status
  status=$(tc_get_task_status "$task_id")

  case "$status" in
    closed|completed|done) echo "closed" ;;
    failed)                echo "failed" ;;
    *)                     echo "" ;;
  esac
}
