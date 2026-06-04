#!/usr/bin/env bash
# pulsar-runner.sh — Evaluate pulsar definitions and create Pulse tasks
#
# Part of the Pulsars subsystem (Pulse/Nexus). Reads pulsars.yaml,
# checks schedules and conditions, creates Pulse tasks when appropriate.
#
# Types:
#   gate     — Check condition; create task once when condition is met
#   recurring — Create task on every scheduled run (future: knowledge carry-forward)
#   monitor  — Check condition; create task only on failure (something is wrong)
#
# Usage:
#   pulsar-runner.sh                    # Process all enabled pulsars
#   pulsar-runner.sh --list             # Show all pulsar definitions
#   pulsar-runner.sh --check            # Dry-run: show what would fire
#   pulsar-runner.sh --run <name>       # Force-run a specific pulsar
#   pulsar-runner.sh --reset <name>     # Reset gate state (allow re-fire)
#
# Cost: Zero LLM — pure bash. Tasks are created in Pulse and executed
# by existing task-executor/task-research jobs.

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"

cd "$PROJECT_DIR"

# Shared utilities
export LOG_COMPONENT="pulsar-runner"
export JOBS_DIR
source "$JOBS_DIR/lib/common.sh"
source "$JOBS_DIR/lib/pulse-api.sh"

PULSARS_FILE="$JOBS_DIR/pulsars.yaml"
STATE_DIR="$JOBS_DIR/state/pulsar-state"
KNOWLEDGE_DIR="$JOBS_DIR/state/pulsar-knowledge"

# Ensure state directories exist
mkdir -p "$STATE_DIR" "$KNOWLEDGE_DIR"

# yq for YAML parsing
YQ=$(require_yq)

# Helper: read a value from pulsars.yaml with proper key quoting
# Usage: pget "pulsar-name" "field.subfield" [default]
# Handles dots in pulsar names (e.g., "rocm-7.2.1-update") by using bracket syntax
pget() {
  local name="$1" path="$2" default="${3:-}"
  local val
  val=$("$YQ" ".pulsars[\"${name}\"].${path}" "$PULSARS_FILE" 2>/dev/null)
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "$default"
  else
    echo "$val"
  fi
}

# Helper: read from arbitrary YAML path (for template_path patterns)
pget_path() {
  local ypath="$1" default="${2:-}"
  local val
  val=$("$YQ" "$ypath" "$PULSARS_FILE" 2>/dev/null)
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "$default"
  else
    echo "$val"
  fi
}

# Helper: get JSON output from pulsars.yaml
pget_json() {
  local name="$1" path="$2" default="${3:-[]}"
  local val
  val=$("$YQ" -o=json ".pulsars[\"${name}\"].${path}" "$PULSARS_FILE" 2>/dev/null)
  if [[ -z "$val" || "$val" == "null" ]]; then
    echo "$default"
  else
    echo "$val"
  fi
}

# ============================================================================
# State Management
# ============================================================================

# Get pulsar state value (from JSON state file)
pulsar_state_get() {
  local name="$1" key="$2" default="${3:-}"
  local state_file="$STATE_DIR/${name}.json"
  if [[ -f "$state_file" ]]; then
    local val
    val=$(jq -r ".${key} // empty" "$state_file" 2>/dev/null)
    if [[ -n "$val" ]]; then
      echo "$val"
      return
    fi
  fi
  echo "$default"
}

# Set pulsar state value (atomic write via temp file + mv)
pulsar_state_set() {
  local name="$1" key="$2" value="$3"
  local state_file="$STATE_DIR/${name}.json"
  local tmp_file
  tmp_file=$(mktemp "${state_file}.XXXXXX")
  if [[ -f "$state_file" ]]; then
    jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$state_file" > "$tmp_file" && mv "$tmp_file" "$state_file"
  else
    jq -n --arg k "$key" --arg v "$value" '{($k): $v}' > "$tmp_file" && mv "$tmp_file" "$state_file"
  fi
}

# Get last run epoch for a pulsar
get_last_run() {
  pulsar_state_get "$1" "last_run" "0"
}

# Set last run to now
set_last_run() {
  pulsar_state_set "$1" "last_run" "$(date +%s)"
}

# ============================================================================
# Schedule Checking (mirrors dispatcher.sh logic)
# ============================================================================

is_pulsar_due() {
  local name="$1"
  local sched_type
  sched_type=$(pget "$name" "schedule.type")
  local last_run
  last_run=$(get_last_run "$name")
  local now
  now=$(date +%s)

  case "$sched_type" in
    interval)
      local sched_every_hours
      sched_every_hours=$(pget "$name" "schedule.every_hours")
      if [[ -z "$sched_every_hours" || ! "$sched_every_hours" =~ ^[0-9]+$ ]]; then
        log_error "Pulsar '$name': schedule.every_hours is missing or invalid ('$sched_every_hours')"
        return 1
      fi
      local interval_secs=$(( sched_every_hours * 3600 ))
      [[ "$now" -ge $(( last_run + interval_secs )) ]]
      ;;
    daily)
      local sched_hour
      sched_hour=$(pget "$name" "schedule.hour")
      if [[ -z "$sched_hour" || ! "$sched_hour" =~ ^[0-9]+$ ]]; then
        log_error "Pulsar '$name': schedule.hour is missing or invalid ('$sched_hour')"
        return 1
      fi
      local current_hour
      current_hour=$(date +%-H)
      if [[ "$current_hour" -lt "$sched_hour" ]]; then
        return 1
      fi
      local today_target
      today_target=$(date -d "today $(printf '%02d' "$sched_hour"):00:00" +%s 2>/dev/null)
      [[ "$last_run" -lt "$today_target" ]]
      ;;
    weekly)
      local sched_day sched_hour
      sched_day=$(pget "$name" "schedule.day")
      sched_hour=$(pget "$name" "schedule.hour")
      if [[ -z "$sched_day" ]]; then
        log_error "Pulsar '$name': schedule.day is missing"
        return 1
      fi
      if [[ -z "$sched_hour" || ! "$sched_hour" =~ ^[0-9]+$ ]]; then
        log_error "Pulsar '$name': schedule.hour is missing or invalid ('$sched_hour')"
        return 1
      fi
      local current_day
      current_day=$(date +%A | tr '[:upper:]' '[:lower:]')
      sched_day=$(echo "$sched_day" | tr '[:upper:]' '[:lower:]')
      if [[ "$current_day" != "$sched_day" ]]; then
        return 1
      fi
      local current_hour
      current_hour=$(date +%-H)
      if [[ "$current_hour" -lt "$sched_hour" ]]; then
        return 1
      fi
      local six_days_ago=$(( now - 518400 ))
      [[ "$last_run" -lt "$six_days_ago" ]] || [[ "$last_run" -lt $(date -d "today $(printf '%02d' "$sched_hour"):00:00" +%s 2>/dev/null) ]]
      ;;
    *)
      log_warning "Unknown schedule type '$sched_type' for pulsar '$name'"
      return 1
      ;;
  esac
}

# ============================================================================
# Condition Evaluation
# ============================================================================

# Evaluate a condition block. Returns 0 if condition is TRUE (met).
eval_condition() {
  local name="$1"
  local cond_type
  cond_type=$(pget "$name" "condition.type")

  case "$cond_type" in
    bash)
      local cmd
      cmd=$(pget "$name" "condition.command")
      if [[ -z "$cmd" ]]; then
        log_error "Pulsar '$name': bash condition has no command"
        return 1
      fi
      if timeout 30 bash -c "$cmd" >/dev/null 2>&1; then
        return 0
      else
        return 1
      fi
      ;;
    http)
      local url jq_filter match_pattern
      url=$(pget "$name" "condition.url")
      jq_filter=$(pget "$name" "condition.jq_filter")
      match_pattern=$(pget "$name" "condition.match")
      local response
      response=$(curl -sf --max-time 15 "$url" 2>/dev/null) || return 1
      if [[ -n "$jq_filter" ]]; then
        response=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null) || return 1
      fi
      if [[ -n "$match_pattern" ]]; then
        echo "$response" | grep -qP "$match_pattern"
      else
        [[ -n "$response" ]]
      fi
      ;;
    *)
      log_warning "Pulsar '$name': unknown condition type '$cond_type'"
      return 1
      ;;
  esac
}

# ============================================================================
# Knowledge Carry-Forward
# ============================================================================

# Get the knowledge directory for a pulsar
knowledge_dir() {
  local name="$1"
  local store
  store=$(pget "$name" "knowledge_store" "$name")
  echo "$KNOWLEDGE_DIR/$store"
}

# Read the latest findings for injection into a task description
read_knowledge() {
  local name="$1"
  local kdir
  kdir=$(knowledge_dir "$name")
  local findings_file="$kdir/latest-findings.md"
  if [[ -f "$findings_file" ]]; then
    cat "$findings_file"
  fi
}

# Harvest knowledge from completed pulsar tasks
# Checks for closed tasks with pulsar:<name> label, extracts close reason / notes
harvest_knowledge() {
  local name="$1"
  local kdir
  kdir=$(knowledge_dir "$name")
  mkdir -p "$kdir"

  # Find recently closed tasks for this pulsar
  local closed_tasks
  closed_tasks=$(pulse_list_tasks "status=closed&label=pulsar:${name}&limit=5" 2>/dev/null) || return 0
  local count
  count=$(echo "$closed_tasks" | jq 'length' 2>/dev/null || echo "0")
  [[ "$count" -eq 0 ]] && return 0

  # Get the last harvested task ID to avoid re-processing
  local last_harvested
  last_harvested=$(pulsar_state_get "$name" "last_harvested_task" "")

  # Process each closed task
  local harvested=0
  echo "$closed_tasks" | jq -c '.[]' 2>/dev/null | while IFS= read -r task_json; do
    local task_id
    task_id=$(echo "$task_json" | jq -r '.id')

    # Skip if already harvested
    [[ "$task_id" == "$last_harvested" ]] && continue

    # Extract close reason and notes
    local close_reason notes
    close_reason=$(echo "$task_json" | jq -r '.close_reason // empty')
    notes=$(echo "$task_json" | jq -r '.notes // empty')
    local title
    title=$(echo "$task_json" | jq -r '.title // empty')

    # Build a summary entry
    local summary=""
    # Prefer notes (where executor writes Key Findings), fall back to close_reason
    if [[ -n "$notes" ]]; then
      summary=$(echo "$notes" | tail -c 2000)
    elif [[ -n "$close_reason" ]]; then
      summary="$close_reason"
    fi

    if [[ -n "$summary" ]]; then
      # Append compact JSON line to runs.jsonl
      jq -cn \
        --arg date "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --arg task_id "$task_id" \
        --arg title "$title" \
        --arg summary "$summary" \
        '{date:$date, task_id:$task_id, title:$title, summary:$summary}' >> "$kdir/runs.jsonl"
      harvested=$((harvested + 1))
      log_info "Pulsar '$name': harvested knowledge from $task_id"
    fi

    # Update last harvested
    pulsar_state_set "$name" "last_harvested_task" "$task_id"
  done

  # Rebuild latest-findings.md from recent entries
  rebuild_findings "$name"
}

# Rebuild latest-findings.md from the last N entries in runs.jsonl
rebuild_findings() {
  local name="$1"
  local kdir
  kdir=$(knowledge_dir "$name")
  local runs_file="$kdir/runs.jsonl"
  local findings_file="$kdir/latest-findings.md"
  local window
  window=$(pget "$name" "knowledge_window" "3")
  # Also check defaults
  [[ -z "$window" || "$window" == "null" ]] && window=$("$YQ" '.defaults.knowledge_window // 3' "$PULSARS_FILE" 2>/dev/null)
  [[ -z "$window" || "$window" == "null" ]] && window=3

  if [[ ! -f "$runs_file" ]]; then
    return 0
  fi

  # Compact any multi-line entries (fix for legacy format)
  local compact_tmp
  compact_tmp=$(mktemp "${runs_file}.compact.XXXXXX")
  jq -c '.' "$runs_file" > "$compact_tmp" 2>/dev/null && mv "$compact_tmp" "$runs_file" || rm -f "$compact_tmp"

  # Take last N entries and build markdown
  local tmp_findings
  tmp_findings=$(mktemp "${findings_file}.XXXXXX")
  {
    echo "# Previous Run Findings"
    echo ""
    tail -n "$window" "$runs_file" | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local entry_date entry_title entry_summary
      entry_date=$(echo "$line" | jq -r '.date // empty' 2>/dev/null)
      entry_title=$(echo "$line" | jq -r '.title // empty' 2>/dev/null)
      entry_summary=$(echo "$line" | jq -r '.summary // empty' 2>/dev/null)
      echo "## ${entry_title} (${entry_date%%T*})"
      echo ""
      echo "$entry_summary"
      echo ""
    done
  } > "$tmp_findings"
  mv "$tmp_findings" "$findings_file"
}

# ============================================================================
# Task Creation
# ============================================================================

create_pulsar_task() {
  local name="$1"
  local template_subpath="$2"  # e.g., "on_condition_met.task_template"

  local title priority description
  title=$(pget "$name" "${template_subpath}.title")
  priority=$(pget "$name" "${template_subpath}.priority" "2")
  description=$(pget "$name" "${template_subpath}.description")

  # If description_template is specified, read from file
  local desc_template
  desc_template=$(pget "$name" "${template_subpath}.description_template")
  if [[ -n "$desc_template" ]]; then
    local template_file="$JOBS_DIR/workflows/${desc_template}"
    if [[ -f "$template_file" ]]; then
      description=$(cat "$template_file")
    else
      log_warning "Template file not found: $template_file"
    fi
  fi

  # Build labels array — always include source:pulsar and pulsar:<name>
  local labels
  labels=$(pget_json "$name" "${template_subpath}.labels" "[]")
  labels=$(echo "$labels" | jq --arg src "source:pulsar" --arg pname "pulsar:${name}" \
    '. + [$src, $pname] | unique')

  # Resolve simple template variables
  local date_str week_str
  # date_str: UTC to avoid DST day-shift in pulsar-generated task titles
  # week_str: intentionally local — schedules use local week boundaries
  date_str=$(date -u +%Y-%m-%d)
  week_str=$(date +%G-W%V)
  title=$(echo "$title" | sed "s/{{date}}/$date_str/g; s/{{week}}/$week_str/g")
  description=$(echo "$description" | sed "s/{{date}}/$date_str/g; s/{{week}}/$week_str/g")

  # Inject knowledge context for recurring pulsars
  local knowledge_carry
  knowledge_carry=$(pget "$name" "knowledge_carry_forward" "false")
  if [[ "$knowledge_carry" == "true" ]]; then
    local prev_context
    prev_context=$(read_knowledge "$name")
    if [[ -n "$prev_context" ]]; then
      description="${description}

---

## Context From Previous Runs

${prev_context}

---
*Use the above context to build on previous findings. Note what changed, what's new, and what persists.*"
    fi
  fi

  # Dedup check 1 — open task already exists (defensive net for edge cases like
  # missing state file or manually-created tasks).
  local existing
  existing=$(pulse_list_tasks "status=open&label=pulsar:${name}" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
  if [[ "$existing" -gt 0 ]]; then
    log_info "Pulsar '$name': open task already exists, skipping creation"
    return 0
  fi

  # Dedup check 2 — a task was created by this pulsar within the current
  # schedule window (covers the case where the previous task was already
  # closed by the time the next pulsar-runner pass arrives — without this
  # check, weekly pulsars can produce duplicate tasks for the same week).
  # Window is one bucket-length minus a small slack so back-to-back runs
  # within the same period dedup, but the next legitimate period still fires.
  local last_created
  last_created=$(pulsar_state_get "$name" "last_task_created" "")
  if [[ -n "$last_created" ]]; then
    local last_epoch now_epoch age_secs window_secs
    last_epoch=$(date -d "$last_created" +%s 2>/dev/null || echo 0)
    now_epoch=$(date +%s)
    age_secs=$(( now_epoch - last_epoch ))
    local sched_type
    sched_type=$(pget "$name" "schedule.type")
    case "$sched_type" in
      weekly)   window_secs=518400 ;;  # 6 days (1 day slack before next week)
      daily)    window_secs=82800 ;;   # 23 hours
      interval)
        local hours
        hours=$(pget "$name" "schedule.every_hours" "6")
        # Use integer floor of (hours - 1) hours, minimum 1 hour
        window_secs=$(awk "BEGIN {h=$hours-1; if (h<1) h=1; printf \"%d\", h*3600}")
        ;;
      *)        window_secs=0 ;;
    esac
    if [[ "$age_secs" -gt 0 && "$age_secs" -lt "$window_secs" ]]; then
      log_info "Pulsar '$name': task created ${age_secs}s ago (within ${window_secs}s schedule window), skipping creation"
      return 0
    fi
  fi

  # Build task JSON
  local task_data
  task_data=$(jq -n \
    --arg title "$title" \
    --argjson priority "$priority" \
    --arg desc "$description" \
    --argjson labels "$labels" \
    --arg actor "pulsar-runner" \
    '{
      title: $title,
      priority: $priority,
      description: $desc,
      labels: $labels,
      actor: $actor
    }')

  local result
  result=$(pulse_create_task "$title" "$task_data" 2>/dev/null)
  if [[ -n "$result" ]]; then
    local task_id
    task_id=$(echo "$result" | jq -r '.id // empty' 2>/dev/null)
    if [[ -n "$task_id" ]]; then
      log_success "Pulsar '$name': created task $task_id — $title"
      pulsar_state_set "$name" "last_task_id" "$task_id"
      pulsar_state_set "$name" "last_task_created" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      return 0
    fi
  fi
  log_error "Pulsar '$name': failed to create task"
  return 1
}

# ============================================================================
# Pulsar Processing
# ============================================================================

process_pulsar() {
  local name="$1"
  local force="${2:-false}"

  local enabled
  enabled=$(pget "$name" "enabled" "true")
  if [[ "$enabled" == "false" && "$force" != "true" ]]; then
    return 0
  fi

  local ptype
  ptype=$(pget "$name" "type")

  # Check schedule (skip if not due, unless forced)
  if [[ "$force" != "true" ]]; then
    if ! is_pulsar_due "$name"; then
      return 0
    fi
  fi

  log_info "Pulsar '$name' (${ptype}): evaluating..."

  case "$ptype" in
    gate)
      local action
      action=$(pget "$name" "on_condition_met.action" "create_once")
      if [[ "$action" == "create_once" ]]; then
        local already_fired
        already_fired=$(pulsar_state_get "$name" "gate_fired" "false")
        if [[ "$already_fired" == "true" && "$force" != "true" ]]; then
          log_info "Pulsar '$name': gate already fired, skipping (use --reset to re-arm)"
          set_last_run "$name"
          return 0
        fi
      fi

      if eval_condition "$name"; then
        log_success "Pulsar '$name': gate condition MET!"
        create_pulsar_task "$name" "on_condition_met.task_template"
        pulsar_state_set "$name" "gate_fired" "true"
        pulsar_state_set "$name" "gate_met_at" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

        # Phase 5.5: emit decision_events for gate-fire
        if type log_decision &>/dev/null; then
          local _gate_task_id _gate_condition _gate_template _gate_desc
          _gate_task_id=$(pulsar_state_get "$name" "last_task_id" "")
          _gate_condition=$(pget "$name" "condition" "")
          _gate_template=$(pget "$name" "on_condition_met.task_template.title" "(template)")
          _gate_desc="gate condition met for first time — pulsar '$name' fired and created task ${_gate_task_id:-unknown}. Condition: ${_gate_condition:-unspecified}"
          log_decision "system:pulsar-runner" "gate_fire" "task_created:${_gate_task_id:-unknown}" \
            "$(jq -nc '[{option:"fire_and_create",score:0.95},{option:"suppress",score:0.05}]')" \
            "$(jq -nc --arg pulsar "$name" --arg cond "$_gate_condition" \
                '[{signal:("pulsar:"+$pulsar),weight:0.5},{signal:"condition_met",weight:0.5}]')" \
            "0.95" \
            "$_gate_desc" \
            "$(jq -nc --arg pulsar "$name" --arg template "$_gate_template" --arg task "$_gate_task_id" \
                '{pulsar:$pulsar,task_template:$template,task_id_created:$task,gate_state_transition:"watching→fired"}')" \
            "$_gate_task_id" 2>/dev/null || true
        fi
      else
        log_info "Pulsar '$name': condition not met, watching..."
      fi
      set_last_run "$name"
      ;;

    monitor)
      if eval_condition "$name"; then
        log_warning "Pulsar '$name': monitor detected issue!"
        create_pulsar_task "$name" "on_failure_only.task_template"

        # Phase 5.5: emit decision_events for monitor-detected issue (same shape as gate_fire)
        if type log_decision &>/dev/null; then
          local _mon_task_id _mon_condition
          _mon_task_id=$(pulsar_state_get "$name" "last_task_id" "")
          _mon_condition=$(pget "$name" "condition" "")
          log_decision "system:pulsar-runner" "gate_fire" "monitor_issue:${_mon_task_id:-unknown}" \
            "$(jq -nc '[{option:"fire_and_create",score:0.9},{option:"suppress",score:0.1}]')" \
            "$(jq -nc --arg pulsar "$name" '[{signal:("pulsar:"+$pulsar),weight:0.5},{signal:"monitor_condition_failed",weight:0.5}]')" \
            "0.9" \
            "Monitor pulsar '$name' detected a health/integrity issue and created task ${_mon_task_id:-unknown}. Condition: ${_mon_condition:-unspecified}" \
            "$(jq -nc --arg pulsar "$name" --arg task "$_mon_task_id" '{pulsar:$pulsar,pulsar_type:"monitor",task_id_created:$task}')" \
            "$_mon_task_id" 2>/dev/null || true
        fi
      else
        log_info "Pulsar '$name': healthy"
      fi
      set_last_run "$name"
      ;;

    recurring)
      # Harvest knowledge from previously completed tasks before creating new one
      local kcarry
      kcarry=$(pget "$name" "knowledge_carry_forward" "false")
      if [[ "$kcarry" == "true" ]]; then
        harvest_knowledge "$name"
      fi
      log_info "Pulsar '$name': recurring — creating task"
      create_pulsar_task "$name" "on_schedule.task_template"
      set_last_run "$name"
      ;;

    external)
      # External pulsars are managed by other services — skip silently
      return 0
      ;;

    *)
      log_warning "Pulsar '$name': unknown type '$ptype'"
      ;;
  esac
}

# ============================================================================
# CLI Interface
# ============================================================================

list_pulsars() {
  local pulsars
  pulsars=$("$YQ" '.pulsars | keys | .[]' "$PULSARS_FILE" 2>/dev/null)

  printf "\n%-25s %-10s %-10s %-12s %-8s %s\n" "NAME" "TYPE" "SCHEDULE" "LAST CHECK" "STATUS" "DESCRIPTION"
  printf "%-25s %-10s %-10s %-12s %-8s %s\n" "----" "----" "--------" "----------" "------" "-----------"

  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    local ptype enabled desc sched_type last_run status
    ptype=$(pget "$name" "type")
    enabled=$(pget "$name" "enabled" "true")
    desc=$(pget "$name" "description")
    sched_type=$(pget "$name" "schedule.type")
    last_run=$(get_last_run "$name")

    if [[ "$enabled" == "false" ]]; then
      status="disabled"
    elif [[ "$ptype" == "gate" ]]; then
      local fired
      fired=$(pulsar_state_get "$name" "gate_fired" "false")
      status=$([[ "$fired" == "true" ]] && echo "fired" || echo "watching")
    else
      status="active"
    fi

    local last_str="never"
    if [[ "$last_run" -gt 0 ]]; then
      last_str=$(date -d "@$last_run" "+%m-%d %H:%M" 2>/dev/null || echo "unknown")
    fi

    # Truncate description
    desc="${desc:0:50}"

    printf "%-25s %-10s %-10s %-12s %-8s %s\n" "$name" "$ptype" "$sched_type" "$last_str" "$status" "$desc"
  done <<< "$pulsars"
  echo ""
}

check_pulsars() {
  log_info "Dry-run: checking which pulsars would fire..."
  local pulsars
  pulsars=$("$YQ" '.pulsars | keys | .[]' "$PULSARS_FILE" 2>/dev/null)

  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    local enabled
    enabled=$(pget "$name" "enabled" "true")
    if [[ "$enabled" == "false" ]]; then
      continue
    fi

    local ptype
    ptype=$(pget "$name" "type")

    if is_pulsar_due "$name"; then
      echo -e "  ${GREEN}DUE${NC}: $name ($ptype)"

      # For gate/monitor, also check the condition
      if [[ "$ptype" == "gate" || "$ptype" == "monitor" ]]; then
        if eval_condition "$name"; then
          echo -e "    ${YELLOW}Condition: MET${NC}"
        else
          echo -e "    Condition: not met"
        fi
      fi
    else
      echo "  SKIP: $name (not due)"
    fi
  done <<< "$pulsars"
}

reset_pulsar() {
  local name="$1"
  local state_file="$STATE_DIR/${name}.json"
  if [[ -f "$state_file" ]]; then
    # Reset gate_fired but keep other state
    local tmp
    tmp=$(jq '.gate_fired = "false" | del(.gate_met_at)' "$state_file" 2>/dev/null)
    echo "$tmp" > "$state_file"
    log_success "Pulsar '$name': gate reset, will fire again when condition is met"
  else
    log_warning "Pulsar '$name': no state to reset"
  fi
}

run_all() {
  log_info "Processing all enabled pulsars..."
  local pulsars
  pulsars=$("$YQ" '.pulsars | keys | .[]' "$PULSARS_FILE" 2>/dev/null)
  local count=0 fired=0

  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    count=$((count + 1))
    process_pulsar "$name" "false" && fired=$((fired + 1)) || true
  done <<< "$pulsars"

  log_info "Processed $count pulsars"
}

# ============================================================================
# Main
# ============================================================================

main() {
  if [[ ! -f "$PULSARS_FILE" ]]; then
    log_error "Pulsars file not found: $PULSARS_FILE"
    exit 1
  fi

  case "${1:-}" in
    --list|-l)
      list_pulsars
      ;;
    --check|-c)
      check_pulsars
      ;;
    --run|-r)
      if [[ -z "${2:-}" ]]; then
        log_error "Usage: pulsar-runner.sh --run <name>"
        exit 1
      fi
      process_pulsar "$2" "true"
      ;;
    --reset)
      if [[ -z "${2:-}" ]]; then
        log_error "Usage: pulsar-runner.sh --reset <name>"
        exit 1
      fi
      reset_pulsar "$2"
      ;;
    --help|-h)
      head -20 "$0" | grep '^#' | sed 's/^# *//'
      ;;
    "")
      run_all
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
}

main "$@"
