#!/usr/bin/env bash
# generate-loom-nodes.sh — Loom Phase 4: Content node generation from curated golden records
#
# Usage:
#   generate-loom-nodes.sh [OPTIONS]
#     --max-per-persona <n>    Cap nodes per persona (default: 1000)
#     --dry-run                Show what would happen
#
# Reads curated-index.jsonl, generates per-persona content nodes for few-shot retrieval.
# Scheduled daily at 07:00 UTC (after curation at 06:00).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIPROJECTS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export AIPROJECTS_ROOT
JOBS_DIR="$SCRIPT_DIR"
export JOBS_DIR
export LOG_COMPONENT="generate-loom-nodes"

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/pulse-api.sh"
source "$SCRIPT_DIR/lib/training-ops.sh"

# ============================================================================
# CLI Parsing
# ============================================================================

MAX_PER_PERSONA=1000
DRY_RUN=0

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --max-per-persona) MAX_PER_PERSONA="$2"; shift 2 ;;
      --dry-run)         DRY_RUN=1; shift ;;
      *)
        log_error "Unknown argument: $1"
        exit 1
        ;;
    esac
  done
}

# ============================================================================
# Node Generation
# ============================================================================

do_generate() {
  tc_load_settings

  local capture_dir
  capture_dir=$(tc_get_capture_dir)
  local curated_file="${capture_dir}/golden/curated-index.jsonl"
  local node_dir="${AIPROJECTS_ROOT}/.claude/data/loom/nodes"
  local index_dir="${node_dir}/index"

  # Create directories
  mkdir -p "$node_dir" "$index_dir"

  if [[ ! -f "$curated_file" ]] || [[ ! -s "$curated_file" ]]; then
    log_warning "No curated records — nothing to generate"
    return 0
  fi

  local total_curated
  total_curated=$(wc -l < "$curated_file")
  log_info "Curated records: $total_curated"

  local generated=0
  local skipped=0
  declare -A persona_node_counts

  # Pre-count existing nodes per persona
  for f in "$node_dir"/*.jsonl; do
    [[ -f "$f" ]] || continue
    local pname
    pname=$(basename "$f" .jsonl)
    persona_node_counts[$pname]=$(wc -l < "$f")
  done

  while IFS= read -r rec; do
    [[ -z "$rec" ]] && continue

    local capture_id persona
    capture_id=$(echo "$rec" | jq -r '.capture_id')
    persona=$(echo "$rec" | jq -r '.persona')
    local node_file="${node_dir}/${persona}.jsonl"

    # Skip if already in node file (dedup by source_capture_id)
    if [[ -f "$node_file" ]] && grep -qF "\"source_capture_id\":\"${capture_id}\"" "$node_file" 2>/dev/null; then
      (( skipped++ )) || true
      continue
    fi

    # Check per-persona cap
    local current_count="${persona_node_counts[$persona]:-0}"
    if [[ "$current_count" -ge "$MAX_PER_PERSONA" ]]; then
      (( skipped++ )) || true
      continue
    fi

    # Build content node
    local node_id
    node_id="ln-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"

    local node
    node=$(echo "$rec" | jq -c \
      --arg nid "$node_id" \
      --arg gen_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{
        node_id: $nid,
        source_capture_id: .capture_id,
        persona: .persona,
        job_name: .job_name,
        timestamp: .timestamp,
        quality_score: .quality_score,
        quality_tier: .quality_tier,
        prompt_file: .prompt_file,
        response_file: .response_file,
        response_length: .response_length,
        model: .model_actual,
        cost_usd: .cost_usd,
        task_ids: .task_ids,
        signals: .signals,
        generated_at: $gen_at
      }')

    if [[ "$DRY_RUN" -eq 1 ]]; then
      log_info "[DRY-RUN] Would generate node $node_id for $persona ($capture_id)"
    else
      # Append to persona node file
      echo "$node" >> "$node_file"

      # Append to cross-persona index
      echo "$node" | jq -c '{node_id, source_capture_id, persona, quality_tier, quality_score, timestamp}' \
        >> "${index_dir}/node-index.jsonl"

      # Only count actual writes for cap enforcement
      persona_node_counts[$persona]=$(( ${persona_node_counts[$persona]:-0} + 1 ))
    fi
    (( generated++ )) || true

  done < "$curated_file"

  log_success "Generated $generated nodes, skipped $skipped"

  # Summary
  for p in "${!persona_node_counts[@]}"; do
    log_info "  $p: ${persona_node_counts[$p]} nodes"
  done
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"
  [[ "$DRY_RUN" -eq 1 ]] && log_warning "DRY RUN MODE"
  log_info "Loom node generation (max $MAX_PER_PERSONA per persona)"
  do_generate
}

main "$@"
