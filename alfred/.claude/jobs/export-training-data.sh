#!/usr/bin/env bash
# export-training-data.sh — Loom Phase 4: Per-persona LoRA training dataset export
#
# Usage:
#   export-training-data.sh [OPTIONS]
#     --persona <name>         Filter by persona (default: all, separate files)
#     --quality <tier>         golden | correction | silver (default: golden)
#     --date-from YYYY-MM-DD   Start date (default: 90 days ago)
#     --date-to YYYY-MM-DD     End date (default: today)
#     --include-corrections    Include negative examples
#     --correction-ratio <pct> Target negative % (default: 15)
#     --max-records <n>        Cap total records (for testing)
#     --eval-split <pct>       Hold-out eval % (default: 10)
#     --output-dir <path>      Default: .claude/data/training/exports/
#     --dry-run                Show counts only
#
# Output: Chat-style JSONL for fine-tuning (Llama 3.1 / Qwen 2.5 compatible)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIPROJECTS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export AIPROJECTS_ROOT
JOBS_DIR="$SCRIPT_DIR"
export JOBS_DIR
export LOG_COMPONENT="export-training-data"

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/pulse-api.sh"
source "$SCRIPT_DIR/lib/training-ops.sh"

# ============================================================================
# CLI Parsing
# ============================================================================

PERSONA_FILTER=""
QUALITY_FILTER="golden"
DATE_FROM=""
DATE_TO=""
INCLUDE_CORRECTIONS=0
CORRECTION_RATIO=15
MAX_RECORDS=0
EVAL_SPLIT=10
OUTPUT_DIR=""
DRY_RUN=0

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --persona)              PERSONA_FILTER="$2"; shift 2 ;;
      --quality)              QUALITY_FILTER="$2"; shift 2 ;;
      --date-from)            DATE_FROM="$2"; shift 2 ;;
      --date-to)              DATE_TO="$2"; shift 2 ;;
      --include-corrections)  INCLUDE_CORRECTIONS=1; shift ;;
      --correction-ratio)     export CORRECTION_RATIO="$2"; shift 2 ;;
      --max-records)          MAX_RECORDS="$2"; shift 2 ;;
      --eval-split)           EVAL_SPLIT="$2"; shift 2 ;;
      --output-dir)           OUTPUT_DIR="$2"; shift 2 ;;
      --dry-run)              DRY_RUN=1; shift ;;
      *)
        log_error "Unknown argument: $1"
        exit 1
        ;;
    esac
  done

  # Defaults
  [[ -z "$DATE_FROM" ]] && DATE_FROM=$(date -u -d "90 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-90d +%Y-%m-%d)
  [[ -z "$DATE_TO" ]] && DATE_TO=$(date -u +%Y-%m-%d)
}

# ============================================================================
# Persona → Dataset Mapping
# ============================================================================

declare -A PERSONA_DATASET=(
  [ai-david]="ai-david-decisions"
  [orchestrator]="orchestrator-routing"
  [task-executor]="executor-commands"
  [autofix-executor]="executor-commands"
  [task-evaluator]="evaluator-scoring"
  [researcher]="researcher-summaries"
  [infrastructure-deployer]="infra-deployments"
)

# ============================================================================
# System Message Construction
# ============================================================================

# Cache persona summaries
declare -A _PERSONA_SUMMARIES

get_persona_summary() {
  local persona="$1"

  if [[ -n "${_PERSONA_SUMMARIES[$persona]:-}" ]]; then
    echo "${_PERSONA_SUMMARIES[$persona]}"
    return
  fi

  local prompt_file="$AIPROJECTS_ROOT/.claude/jobs/personas/${persona}/prompt.md"
  if [[ -f "$prompt_file" ]]; then
    # Take first 500 chars as summary
    local summary
    summary=$(head -c 500 "$prompt_file" | tr '\n' ' ' | sed 's/  */ /g')
    _PERSONA_SUMMARIES[$persona]="$summary"
    echo "$summary"
  else
    local fallback="You are ${persona}, an autonomous agent in the NEXUS operations platform."
    _PERSONA_SUMMARIES[$persona]="$fallback"
    echo "$fallback"
  fi
}

# ============================================================================
# Export Logic
# ============================================================================

do_export() {
  tc_load_settings

  local capture_dir
  capture_dir=$(tc_get_capture_dir)
  local golden_dir="${capture_dir}/golden"
  local curated_file="${golden_dir}/curated-index.jsonl"
  local negatives_file="${golden_dir}/curated-negatives.jsonl"

  [[ -z "$OUTPUT_DIR" ]] && OUTPUT_DIR="${capture_dir}/exports"
  mkdir -p "$OUTPUT_DIR"

  # Check inputs exist
  if [[ ! -f "$curated_file" ]]; then
    log_warning "No curated index found at $curated_file — run curate-training-data.sh --all first"
    echo '{"total":0,"exported":0,"reason":"no curated data"}'
    return 0
  fi

  local total_available
  total_available=$(wc -l < "$curated_file")
  log_info "Curated records available: $total_available"

  # Collect matching records using --arg for safe string injection (no jq injection)
  local jq_args=()
  local jq_prog='.'

  if [[ "$QUALITY_FILTER" != "all" ]]; then
    jq_args+=(--arg qt "$QUALITY_FILTER")
    jq_prog="$jq_prog | select(.quality_tier == \$qt)"
  fi

  jq_args+=(--arg df "$DATE_FROM" --arg dt "${DATE_TO}T23:59:59Z")
  jq_prog="$jq_prog | select(.timestamp >= \$df and .timestamp <= \$dt)"

  if [[ -n "$PERSONA_FILTER" ]]; then
    jq_args+=(--arg pf "$PERSONA_FILTER")
    jq_prog="$jq_prog | select(.persona == \$pf)"
  fi

  local records
  records=$(jq -c "${jq_args[@]}" "$jq_prog" "$curated_file") || {
    log_error "jq filter failed on curated index"
    return 1
  }

  # Add corrections if requested
  if [[ "$INCLUDE_CORRECTIONS" -eq 1 && -f "$negatives_file" ]]; then
    local neg_records
    neg_records=$(jq -c "${jq_args[@]}" "$jq_prog" "$negatives_file" 2>/dev/null)
    if [[ -n "$neg_records" ]]; then
      records=$(printf '%s\n%s' "$records" "$neg_records")
    fi
  fi

  # Count by persona
  local total_count=0
  declare -A persona_counts
  while IFS= read -r rec; do
    [[ -z "$rec" ]] && continue
    local p
    p=$(echo "$rec" | jq -r '.persona')
    persona_counts[$p]=$(( ${persona_counts[$p]:-0} + 1 ))
    (( total_count++ )) || true

    # Cap check
    if [[ "$MAX_RECORDS" -gt 0 && "$total_count" -ge "$MAX_RECORDS" ]]; then
      break
    fi
  done <<< "$records"

  log_info "Records matching filters: $total_count"
  for p in "${!persona_counts[@]}"; do
    log_info "  $p: ${persona_counts[$p]}"
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log_info "[DRY-RUN] Would export $total_count records"
    return 0
  fi

  if [[ "$total_count" -eq 0 ]]; then
    log_warning "No records match filters"
    return 0
  fi

  # Process records and write per-persona output files
  local exported=0
  local eval_count=0
  declare -A train_files eval_files

  while IFS= read -r rec; do
    [[ -z "$rec" ]] && continue

    local persona capture_id prompt_file response_file
    persona=$(echo "$rec" | jq -r '.persona')
    capture_id=$(echo "$rec" | jq -r '.capture_id')
    prompt_file="${capture_dir}/$(echo "$rec" | jq -r '.prompt_file')"
    response_file="${capture_dir}/$(echo "$rec" | jq -r '.response_file')"

    # Skip if content files missing
    if [[ ! -f "$prompt_file" || ! -f "$response_file" ]]; then
      log_warning "Missing content files for $capture_id"
      continue
    fi

    # Determine dataset name
    local dataset="${PERSONA_DATASET[$persona]:-other}"

    # Build output file paths
    if [[ -z "${train_files[$dataset]:-}" ]]; then
      train_files[$dataset]="${OUTPUT_DIR}/${dataset}.jsonl"
      eval_files[$dataset]="${OUTPUT_DIR}/${dataset}-eval.jsonl"
      # Clear existing files
      true > "${train_files[$dataset]}"
      true > "${eval_files[$dataset]}"
    fi

    # Read content
    local prompt_text response_text system_msg
    prompt_text=$(cat "$prompt_file")
    response_text=$(cat "$response_file")
    system_msg=$(get_persona_summary "$persona")

    # Determine if this goes to eval split (simple modular hash)
    local is_eval=0
    local hash_val
    hash_val=$(echo -n "$capture_id" | cksum | cut -d' ' -f1)
    if [[ $(( hash_val % 100 )) -lt "$EVAL_SPLIT" ]]; then
      is_eval=1
      (( eval_count++ )) || true
    fi

    # Build chat-style record
    local quality_tier quality_score model_actual
    quality_tier=$(echo "$rec" | jq -r '.quality_tier // "unknown"')
    quality_score=$(echo "$rec" | jq -r '.quality_score // 0')
    model_actual=$(echo "$rec" | jq -r '.model_actual // "unknown"')

    # For correction records, wrap response with [INCORRECT]/[CORRECTION] markers
    local assistant_content="$response_text"
    if [[ "$quality_tier" == "correction" ]]; then
      assistant_content="[INCORRECT]
${response_text}

[CORRECTION]
This response was flagged as incorrect during quality review."
    fi

    local chat_record
    chat_record=$(jq -n -c \
      --arg sys "$system_msg" \
      --arg user "$prompt_text" \
      --arg asst "$assistant_content" \
      --arg cid "$capture_id" \
      --arg tier "$quality_tier" \
      --arg persona "$persona" \
      --arg score "$quality_score" \
      --arg ts "$(echo "$rec" | jq -r '.timestamp')" \
      --arg model "$model_actual" \
      --arg job "$(echo "$rec" | jq -r '.job_name // ""')" \
      '{
        messages: [
          {role: "system", content: $sys},
          {role: "user", content: $user},
          {role: "assistant", content: $asst}
        ],
        metadata: {
          capture_id: $cid,
          quality_tier: $tier,
          quality_score: (if $score == "" or $score == "null" then 0 else ($score | tonumber) end),
          persona: $persona,
          timestamp: $ts,
          model_source: $model,
          job_name: $job
        }
      }')

    # Write to appropriate file
    if [[ "$is_eval" -eq 1 ]]; then
      echo "$chat_record" >> "${eval_files[$dataset]}"
    else
      echo "$chat_record" >> "${train_files[$dataset]}"
    fi

    (( exported++ )) || true

    # Cap check
    if [[ "$MAX_RECORDS" -gt 0 && "$exported" -ge "$MAX_RECORDS" ]]; then
      break
    fi
  done <<< "$records"

  # Write export manifest
  local manifest="${OUTPUT_DIR}/export-manifest.json"
  local datasets_json="[]"
  for ds in "${!train_files[@]}"; do
    local train_count=0 eval_count_ds=0
    [[ -f "${train_files[$ds]}" ]] && train_count=$(wc -l < "${train_files[$ds]}")
    [[ -f "${eval_files[$ds]}" ]] && eval_count_ds=$(wc -l < "${eval_files[$ds]}")
    datasets_json=$(echo "$datasets_json" | jq --arg ds "$ds" \
      --argjson tc "$train_count" --argjson ec "$eval_count_ds" \
      '. + [{dataset: $ds, train_count: $tc, eval_count: $ec}]')
  done

  jq -n \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg df "$DATE_FROM" \
    --arg dt "$DATE_TO" \
    --arg quality "$QUALITY_FILTER" \
    --argjson exported "$exported" \
    --argjson eval "$eval_count" \
    --argjson datasets "$datasets_json" \
    '{
      exported_at: $ts,
      date_range: {from: $df, to: $dt},
      quality_filter: $quality,
      total_exported: $exported,
      total_eval: $eval,
      datasets: $datasets
    }' > "$manifest"

  log_success "Exported $exported records ($eval_count eval) to $OUTPUT_DIR"
  cat "$manifest" | jq -c '{total_exported, total_eval, datasets: [.datasets[] | {dataset, train_count, eval_count}]}'
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"
  [[ "$DRY_RUN" -eq 1 ]] && log_warning "DRY RUN MODE"
  log_info "Export: persona=${PERSONA_FILTER:-all} quality=$QUALITY_FILTER dates=$DATE_FROM→$DATE_TO"
  do_export
}

main "$@"
