#!/usr/bin/env bash
# curate-training-data.sh — Loom Phase 4: Quality backfill, scoring, promotion, stats, retention
#
# Usage:
#   curate-training-data.sh [OPTIONS]
#     --date YYYY-MM-DD         Process single date (default: yesterday)
#     --range START END         Process date range
#     --all                     Full pipeline: backfill → score → promote → stats
#     --backfill-only           Only run quality backfill
#     --score                   Score backfilled records
#     --promote                 Move scored records above threshold to curated index
#     --stats                   Output quality statistics
#     --retention-cleanup       Enforce tier-based retention policy
#     --dry-run                 Show what would happen without writing
#
# Cron schedule:
#   Backfill: every 6 hours      (--backfill-only)
#   Full curation: daily 06:00   (--all)
#   Retention: weekly Sun 04:00  (--retention-cleanup)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIPROJECTS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export AIPROJECTS_ROOT
JOBS_DIR="$SCRIPT_DIR"
export JOBS_DIR
export LOG_COMPONENT="curate-training-data"

# Source shared libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/pulse-api.sh"
source "$SCRIPT_DIR/lib/training-ops.sh"

# ============================================================================
# CLI Parsing
# ============================================================================

ACTION=""
DATE_START=""
DATE_END=""
DRY_RUN=0

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --date)       DATE_START="$2"; DATE_END="$2"; shift 2 ;;
      --range)      DATE_START="$2"; DATE_END="$3"; shift 3 ;;
      --all)        ACTION="all"; shift ;;
      --backfill-only) ACTION="backfill"; shift ;;
      --score)      ACTION="score"; shift ;;
      --promote)    ACTION="promote"; shift ;;
      --stats)      ACTION="stats"; shift ;;
      --retention-cleanup) ACTION="retention"; shift ;;
      --repair-task-ids) ACTION="repair-task-ids"; shift ;;
      --dry-run)    DRY_RUN=1; shift ;;
      *)
        log_error "Unknown argument: $1"
        exit 1
        ;;
    esac
  done

  # Default action
  [[ -z "$ACTION" ]] && ACTION="all"

  # Default date: yesterday (most captures will have had time for feedback)
  if [[ -z "$DATE_START" ]]; then
    DATE_START=$(date -u -d "yesterday" +%Y-%m-%d 2>/dev/null || date -u -v-1d +%Y-%m-%d)
    DATE_END="$DATE_START"
  fi
  [[ -z "$DATE_END" ]] && DATE_END="$DATE_START"
}

# ============================================================================
# Date Iteration Helper
# ============================================================================

# Iterate dates from START to END (inclusive), calling the given function for each
iterate_dates() {
  local callback="$1"
  local current="$DATE_START"

  while [[ ! "$current" > "$DATE_END" ]]; do
    "$callback" "$current"
    current=$(date -u -d "$current + 1 day" +%Y-%m-%d 2>/dev/null || date -u -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d 2>/dev/null)
    if [[ -z "$current" ]]; then
      log_error "Date iteration failed — breaking loop"
      break
    fi
  done
}

# ============================================================================
# Phase 1: BACKFILL
# ============================================================================

_backfill_counts_processed=0
_backfill_counts_skipped=0
_backfill_counts_no_signals=0

do_backfill_date() {
  local date_str="$1"
  local captures_file="${TC_CAPTURE_DIR}/index/captures-${date_str}.jsonl"

  if [[ ! -f "$captures_file" ]]; then
    log_info "No captures for $date_str"
    return 0
  fi

  local backfill_file="${TC_CAPTURE_DIR}/quality/backfill-${date_str}.jsonl"
  local total
  total=$(wc -l < "$captures_file")
  log_info "Processing $total captures for $date_str"

  # Pre-load persona outputs for this date
  local aid_outputs orch_outputs
  aid_outputs=$(tc_load_persona_output "ai-david" "$date_str")
  orch_outputs=$(tc_load_persona_output "orchestrator" "$date_str")

  while IFS= read -r capture; do
    local capture_id persona
    capture_id=$(echo "$capture" | jq -r '.capture_id')
    persona=$(echo "$capture" | jq -r '.persona')

    # Skip if already backfilled
    if [[ -f "$backfill_file" ]] && grep -q "\"capture_id\":\"${capture_id}\"" "$backfill_file" 2>/dev/null; then
      (( _backfill_counts_skipped++ )) || true
      continue
    fi

    # Skip excluded records
    if tc_should_exclude "$capture"; then
      (( _backfill_counts_skipped++ )) || true
      continue
    fi

    # Build backfill record
    local backfill="{}"
    local task_ids capture_ts
    task_ids=$(echo "$capture" | jq -r '.input.task_ids[]' 2>/dev/null || true)
    capture_ts=$(echo "$capture" | jq -r '.timestamp')

    # --- Human feedback (AI David only) ---
    if [[ "$persona" == "ai-david" ]]; then
      local fb_match
      fb_match=$(tc_correlate_feedback "$capture")
      if [[ "$fb_match" != "null" && -n "$fb_match" ]]; then
        backfill=$(echo "$backfill" | jq --argjson fb "$fb_match" '
          . + {
            human_feedback: $fb.feedback,
            feedback_comment: ($fb.comment // ""),
            feedback_action: ($fb.action // "")
          }
        ')
      fi

      # Extract confidence/pattern from AI David daily output
      if [[ -n "$task_ids" ]]; then
        while IFS= read -r tid; do
          [[ -z "$tid" ]] && continue
          local po_match
          po_match=$(tc_match_persona_output "$aid_outputs" "$tid" "$capture_ts")
          if [[ "$po_match" != "null" && -n "$po_match" ]]; then
            backfill=$(echo "$backfill" | jq --argjson po "$po_match" '
              . + {
                confidence: ($po.confidence // null),
                pattern_matched: ($po.pattern_matched // null),
                risk: ($po.risk // null)
              }
            ')
            break  # Use first match
          fi
        done <<< "$task_ids"
      fi
    fi

    # --- Orchestrator signals ---
    if [[ "$persona" == "orchestrator" && -n "$task_ids" ]]; then
      while IFS= read -r tid; do
        [[ -z "$tid" ]] && continue
        local orch_match
        orch_match=$(tc_match_persona_output "$orch_outputs" "$tid" "$capture_ts")
        if [[ "$orch_match" != "null" && -n "$orch_match" ]]; then
          backfill=$(echo "$backfill" | jq --argjson om "$orch_match" '
            . + {
              confidence: ($om.confidence // null),
              routing_method: ($om.method // null),
              rule_matched: ($om.rule_matched // null),
              route_action: ($om.route.action // null)
            }
          ')
          break
        fi
      done <<< "$task_ids"
    fi

    # --- Task closure status (all personas) ---
    if [[ -n "$task_ids" ]]; then
      local first_tid
      first_tid=$(echo "$capture" | jq -r '.input.task_ids[0] // ""')
      if [[ -n "$first_tid" ]]; then
        local task_status
        task_status=$(tc_get_task_closure_status "$first_tid")
        if [[ -n "$task_status" ]]; then
          backfill=$(echo "$backfill" | jq --arg ts "$task_status" '. + {task_status: $ts}')
        fi
      fi
    fi

    # Write backfill record
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log_info "[DRY-RUN] Would backfill $capture_id ($persona)"
    else
      tc_write_backfill_record "$capture_id" "$backfill" "$date_str" || log_warning "Failed to write backfill for $capture_id"
    fi
    (( _backfill_counts_processed++ )) || true

  done < "$captures_file"
}

do_backfill() {
  log_info "=== BACKFILL Phase ==="
  tc_load_feedback_lookup
  iterate_dates do_backfill_date
  log_success "Backfill: processed=$_backfill_counts_processed skipped=$_backfill_counts_skipped"
}

# ============================================================================
# Phase 2: SCORE + PROMOTE
# ============================================================================

_score_counts_golden=0
_score_counts_silver=0
_score_counts_correction=0
_score_counts_noise=0
_score_counts_excluded=0

do_score_and_promote_date() {
  local date_str="$1"
  local captures_file="${TC_CAPTURE_DIR}/index/captures-${date_str}.jsonl"
  local backfill_file="${TC_CAPTURE_DIR}/quality/backfill-${date_str}.jsonl"

  if [[ ! -f "$captures_file" ]]; then
    return 0
  fi

  local golden_dir="${TC_CAPTURE_DIR}/golden"
  mkdir -p "$golden_dir"

  local curated_file="${golden_dir}/curated-index.jsonl"
  local negatives_file="${golden_dir}/curated-negatives.jsonl"

  # Build backfill lookup by capture_id
  local backfill_lookup="{}"
  if [[ -f "$backfill_file" ]]; then
    backfill_lookup=$(jq -s '
      map({key: .capture_id, value: .})
      | from_entries
    ' "$backfill_file" 2>/dev/null) || backfill_lookup="{}"
  fi

  while IFS= read -r capture; do
    local capture_id prompt_hash
    capture_id=$(echo "$capture" | jq -r '.capture_id')
    prompt_hash=$(echo "$capture" | jq -r '.input.prompt_hash // ""')

    # Skip excluded records
    if tc_should_exclude "$capture"; then
      (( _score_counts_excluded++ )) || true
      continue
    fi

    # Skip if already in curated index
    if tc_check_duplicate "$capture_id" "$curated_file"; then
      continue
    fi
    if tc_check_duplicate "$capture_id" "$negatives_file"; then
      continue
    fi

    # Skip duplicate prompt hashes
    if [[ -n "$prompt_hash" ]] && tc_check_prompt_hash_duplicate "$prompt_hash" "$curated_file"; then
      (( _score_counts_excluded++ )) || true
      continue
    fi

    # Get backfill data
    local backfill
    backfill=$(echo "$backfill_lookup" | jq --arg cid "$capture_id" '.[$cid] // null' 2>/dev/null)

    # Detect signals and compute score
    local signals score tier
    signals=$(tc_detect_signals "$capture" "$backfill")
    score=$(tc_compute_score "$signals")
    tier=$(tc_assign_tier "$score")

    # Check if score is partial (no backfill data)
    local score_partial="false"
    [[ "$backfill" == "null" || -z "$backfill" ]] && score_partial="true"

    # Build curated record
    local curated_record
    curated_record=$(echo "$capture" | jq -c \
      --arg score "$score" \
      --arg tier "$tier" \
      --arg sp "$score_partial" \
      --argjson signals "$signals" \
      --arg scored_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{
        capture_id: .capture_id,
        timestamp: .timestamp,
        persona: .persona,
        job_name: .job_name,
        model_actual: .model_actual,
        prompt_hash: .input.prompt_hash,
        prompt_file: .input.prompt_file,
        response_file: .output.response_file,
        response_length: .output.response_length,
        task_ids: .input.task_ids,
        cost_usd: .cost_usd,
        duration_s: .duration_s,
        quality_score: ($score | tonumber),
        quality_tier: $tier,
        score_partial: ($sp == "true"),
        signals: $signals,
        scored_at: $scored_at
      }')

    case "$tier" in
      golden)
        if [[ "$DRY_RUN" -eq 1 ]]; then
          log_info "[DRY-RUN] Would promote $capture_id → golden (score=$score)"
        else
          echo "$curated_record" >> "$curated_file"
        fi
        (( _score_counts_golden++ )) || true
        ;;
      silver)
        (( _score_counts_silver++ )) || true
        # Silver records are not promoted — they stay in backfill for later re-scoring
        ;;
      correction)
        if [[ "$DRY_RUN" -eq 1 ]]; then
          log_info "[DRY-RUN] Would add $capture_id → negatives (score=$score)"
        else
          echo "$curated_record" >> "$negatives_file"
        fi
        (( _score_counts_correction++ )) || true
        ;;
      noise)
        (( _score_counts_noise++ )) || true
        ;;
    esac

  done < "$captures_file"
}

do_score_and_promote() {
  log_info "=== SCORE + PROMOTE Phase ==="
  iterate_dates do_score_and_promote_date
  log_success "Score: golden=$_score_counts_golden silver=$_score_counts_silver correction=$_score_counts_correction noise=$_score_counts_noise excluded=$_score_counts_excluded"
}

# ============================================================================
# Phase 3: STATS
# ============================================================================

do_stats() {
  log_info "=== STATS Phase ==="

  local golden_dir="${TC_CAPTURE_DIR}/golden"
  local curated_file="${golden_dir}/curated-index.jsonl"
  local negatives_file="${golden_dir}/curated-negatives.jsonl"
  local stats_file="${golden_dir}/stats.json"

  mkdir -p "$golden_dir"

  local total_golden=0 total_negatives=0
  [[ -f "$curated_file" ]] && total_golden=$(wc -l < "$curated_file")
  [[ -f "$negatives_file" ]] && total_negatives=$(wc -l < "$negatives_file")

  # Per-persona breakdown
  local persona_stats="{}"
  if [[ -f "$curated_file" && "$total_golden" -gt 0 ]]; then
    persona_stats=$(jq -s '
      group_by(.persona)
      | map({
          key: .[0].persona,
          value: {
            count: length,
            avg_score: ([.[].quality_score] | add / length | . * 100 | floor / 100),
            partial_count: [.[] | select(.score_partial == true)] | length
          }
        })
      | from_entries
    ' "$curated_file" 2>/dev/null) || persona_stats="{}"
  fi

  # Score distribution
  local score_dist="{}"
  if [[ -f "$curated_file" && "$total_golden" -gt 0 ]]; then
    score_dist=$(jq -s '
      {
        "0.85-1.00": [.[] | select(.quality_score >= 0.85)] | length,
        "0.70-0.84": [.[] | select(.quality_score >= 0.70 and .quality_score < 0.85)] | length,
        "0.50-0.69": [.[] | select(.quality_score >= 0.50 and .quality_score < 0.70)] | length
      }
    ' "$curated_file" 2>/dev/null) || score_dist="{}"
  fi

  local stats
  stats=$(jq -n \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson golden "$total_golden" \
    --argjson negatives "$total_negatives" \
    --argjson personas "$persona_stats" \
    --argjson dist "$score_dist" \
    '{
      generated_at: $ts,
      golden_count: $golden,
      negatives_count: $negatives,
      total_curated: ($golden + $negatives),
      per_persona: $personas,
      score_distribution: $dist,
      readiness: {
        ai_david_lora: (($personas["ai-david"].count // 0) >= 200),
        orchestrator_lora: (($personas["orchestrator"].count // 0) >= 100),
        min_viable: ($golden >= 50)
      }
    }')

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log_info "[DRY-RUN] Stats:"
    echo "$stats" | jq '.'
  else
    echo "$stats" | jq '.' > "$stats_file"
    log_success "Stats written to $stats_file"
    echo "$stats" | jq -c '{golden_count, negatives_count, readiness}'
  fi
}

# ============================================================================
# Phase 4: RETENTION CLEANUP
# ============================================================================

do_retention() {
  log_info "=== RETENTION CLEANUP Phase ==="

  local now_epoch
  now_epoch=$(date -u +%s)
  local days_90=$(( 90 * 86400 ))
  # days_30 reserved for future noise-tier 30-day retention
  local _days_30=$(( 30 * 86400 )); : "$_days_30"
  local cleaned=0

  # Clean backfill files older than 90 days
  local quality_dir="${TC_CAPTURE_DIR}/quality"
  if [[ -d "$quality_dir" ]]; then
    while IFS= read -r f; do
      local fname
      fname=$(basename "$f")
      # Extract date from filename: backfill-YYYY-MM-DD.jsonl
      local fdate
      fdate=$(echo "$fname" | sed 's/backfill-\(.*\)\.jsonl/\1/')
      local fepoch
      fepoch=$(date -u -d "$fdate" +%s 2>/dev/null || echo 0)

      if [[ "$fepoch" -gt 0 ]]; then
        local age=$(( now_epoch - fepoch ))
        if [[ "$age" -gt "$days_90" ]]; then
          if [[ "$DRY_RUN" -eq 1 ]]; then
            log_info "[DRY-RUN] Would archive $fname (age: $((age / 86400)) days)"
          else
            mv "$f" "${TC_CAPTURE_DIR}/archive/" 2>/dev/null && (( cleaned++ )) || true
          fi
        fi
      fi
    done < <(find "$quality_dir" -name "backfill-*.jsonl" -type f 2>/dev/null)
  fi

  # Clean old capture index files (noise tier, >30 days) — move to archive
  local index_dir="${TC_CAPTURE_DIR}/index"
  if [[ -d "$index_dir" ]]; then
    while IFS= read -r f; do
      local fname
      fname=$(basename "$f")
      local fdate
      fdate=$(echo "$fname" | sed 's/captures-\(.*\)\.jsonl/\1/')
      local fepoch
      fepoch=$(date -u -d "$fdate" +%s 2>/dev/null || echo 0)

      if [[ "$fepoch" -gt 0 ]]; then
        local age=$(( now_epoch - fepoch ))
        if [[ "$age" -gt "$days_90" ]]; then
          if [[ "$DRY_RUN" -eq 1 ]]; then
            log_info "[DRY-RUN] Would archive capture index $fname (age: $((age / 86400)) days)"
          else
            mv "$f" "${TC_CAPTURE_DIR}/archive/" 2>/dev/null && (( cleaned++ )) || true
          fi
        fi
      fi
    done < <(find "$index_dir" -name "captures-*.jsonl" -type f 2>/dev/null)
  fi

  log_success "Retention: $cleaned files archived"
}

# ============================================================================
# Phase 5: REPAIR TASK IDS (one-time backfill for existing captures)
# ============================================================================

_repair_counts_total=0
_repair_counts_repaired=0
_repair_counts_already_ok=0

do_repair_task_ids_date() {
  local date_str="$1"
  local captures_file="${TC_CAPTURE_DIR}/index/captures-${date_str}.jsonl"

  if [[ ! -f "$captures_file" ]]; then
    log_info "No captures for $date_str"
    return 0
  fi

  local tmp_file="${captures_file}.repair-tmp"
  : > "$tmp_file"

  local total
  total=$(wc -l < "$captures_file")
  log_info "Checking $total captures for $date_str"

  while IFS= read -r capture; do
    (( _repair_counts_total++ )) || true
    local capture_id existing_count
    capture_id=$(echo "$capture" | jq -r '.capture_id')
    existing_count=$(echo "$capture" | jq -r '.input.task_ids | length')

    # Skip if already has task_ids
    if [[ "$existing_count" -gt 0 ]]; then
      echo "$capture" >> "$tmp_file"
      (( _repair_counts_already_ok++ )) || true
      continue
    fi

    # Try extracting from response file first, then prompt file
    local extracted_ids="[]"
    local response_file_rel
    response_file_rel=$(echo "$capture" | jq -r '.output.response_file // ""')
    if [[ -n "$response_file_rel" ]]; then
      local response_file="${TC_CAPTURE_DIR}/${response_file_rel}"
      if [[ -f "$response_file" ]]; then
        local resp_ids
        resp_ids=$(grep -oP 'AIProjects-[a-z0-9]{4}' "$response_file" 2>/dev/null | sort -u | head -10 || true)
        if [[ -n "$resp_ids" ]]; then
          extracted_ids=$(echo "$resp_ids" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")
        fi
      fi
    fi

    # Fallback: try prompt file
    if [[ "$extracted_ids" == "[]" ]]; then
      local prompt_file_rel
      prompt_file_rel=$(echo "$capture" | jq -r '.input.prompt_file // ""')
      if [[ -n "$prompt_file_rel" ]]; then
        local prompt_file="${TC_CAPTURE_DIR}/${prompt_file_rel}"
        if [[ -f "$prompt_file" ]]; then
          local prm_ids
          prm_ids=$(grep -oP 'AIProjects-[a-z0-9]{4}' "$prompt_file" 2>/dev/null | sort -u | head -10 || true)
          if [[ -n "$prm_ids" ]]; then
            extracted_ids=$(echo "$prm_ids" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")
          fi
        fi
      fi
    fi

    # Update capture record with extracted task_ids
    local id_count
    id_count=$(echo "$extracted_ids" | jq 'length' 2>/dev/null || echo 0)

    if [[ "$DRY_RUN" -eq 1 ]]; then
      if [[ "$id_count" -gt 0 ]]; then
        log_info "[DRY-RUN] Would repair $capture_id with $id_count task IDs"
        (( _repair_counts_repaired++ )) || true
      fi
      echo "$capture" >> "$tmp_file"
    else
      if [[ "$id_count" -gt 0 ]]; then
        local updated
        updated=$(echo "$capture" | jq -c --argjson ids "$extracted_ids" '.input.task_ids = $ids')
        echo "$updated" >> "$tmp_file"
        (( _repair_counts_repaired++ )) || true
      else
        echo "$capture" >> "$tmp_file"
      fi
    fi
  done < "$captures_file"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    mv "$tmp_file" "$captures_file"
  else
    rm -f "$tmp_file"
  fi
}

do_repair_task_ids() {
  log_info "=== REPAIR TASK IDS Phase ==="
  iterate_dates do_repair_task_ids_date
  log_success "Repair: total=$_repair_counts_total repaired=$_repair_counts_repaired already_ok=$_repair_counts_already_ok"
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"
  tc_load_settings

  mkdir -p "${TC_CAPTURE_DIR}/quality" "${TC_CAPTURE_DIR}/golden" "${TC_CAPTURE_DIR}/archive"

  [[ "$DRY_RUN" -eq 1 ]] && log_warning "DRY RUN MODE — no files will be modified"
  log_info "Date range: $DATE_START → $DATE_END | Action: $ACTION"

  case "$ACTION" in
    backfill)
      do_backfill
      ;;
    score)
      do_score_and_promote
      ;;
    promote)
      do_score_and_promote
      ;;
    stats)
      do_stats
      ;;
    retention)
      do_retention
      ;;
    repair-task-ids)
      do_repair_task_ids
      ;;
    all)
      do_backfill
      do_score_and_promote
      do_stats
      ;;
    *)
      log_error "Unknown action: $ACTION"
      exit 1
      ;;
  esac
}

main "$@"
