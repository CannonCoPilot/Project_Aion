#!/bin/bash
# run-experiment-7.sh — JICM v7 Quality & Speed Experiment
#
# Two-phase experiment comparing JICM v7 treatments vs native /compact:
#   Phase 1: Offline treatment comparison (prep script configs)
#   Phase 2: Live quality probes (end-to-end with fact recall scoring)
#
# Designed to run from W5:Jarvis-dev. Controls W0:Jarvis via tmux.
#
# Usage: run-experiment-7.sh [--phase 1|2|all] [--start-trial N] [--dry-run]
#
set -eu

# ─── Configuration ──────────────────────────────────────────────────────────
TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
SESSION="${TMUX_SESSION:-jarvis}"
TARGET="${SESSION}:0"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
SCRIPTS_DIR="$PROJECT_DIR/.claude/scripts/dev"
DATA_FILE="$PROJECT_DIR/.claude/reports/testing/experiment-7-data.jsonl"
LOG_FILE="$PROJECT_DIR/.claude/logs/experiment-7.log"
OVERRIDE_FILE="$PROJECT_DIR/.claude/context/.prep-override"
PREP_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"
SCORE_SCRIPT="$SCRIPTS_DIR/score-quality-probe.sh"
JICM_STATE="$PROJECT_DIR/.claude/context/.jicm-state"
CAPTURE_DIR="$PROJECT_DIR/.claude/reports/testing/experiment-7-captures"

PHASE="all"
START_TRIAL=1
DRY_RUN=false
INTER_TRIAL_WAIT=30
WATCHER_SAFE_THRESHOLD=80

# ─── Colors ──────────────────────────────────────────────────────────────────
C_RESET=$'\e[0m'
C_GREEN=$'\e[32m'
C_RED=$'\e[31m'
C_YELLOW=$'\e[33m'
C_CYAN=$'\e[36m'
C_BOLD=$'\e[1m'
C_DIM=$'\e[2m'

# ─── Usage ───────────────────────────────────────────────────────────────────
show_usage() {
    cat <<EOF
run-experiment-7.sh — JICM v7 Quality & Speed Experiment

Usage: run-experiment-7.sh [options]

Options:
  --phase 1|2|all     Phase to run (default: all)
  --start-trial N     Start from trial N in Phase 2 (default: 1)
  --dry-run           Show what would happen without executing
  -h, --help          Show this help

Treatments:
  C = /compact (native baseline)
  M = v7-minimal   (3 msgs, 200 chars, no plan)
  S = v7-standard  (10 msgs, 500 chars, plan)
  E = v7-enriched  (20 msgs, 2000 chars, plan)
  X = v7-mixed     (10 msgs user+asst, 500 chars, plan)

Data: $DATA_FILE
Log:  $LOG_FILE
EOF
    exit 0
}

# ─── Argument Parsing ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --phase)       PHASE="$2"; shift 2 ;;
        --start-trial) START_TRIAL="$2"; shift 2 ;;
        --dry-run)     DRY_RUN=true; shift ;;
        -h|--help)     show_usage ;;
        *)             shift ;;
    esac
done

# ─── Seed Fact Sets ──────────────────────────────────────────────────────────
SEED_A="Working on bug #4217 in auth module. Error: TokenExpiredError on line 142 of /src/auth/validator.py in function validate_session_token(). Fix: change timeout from 3600 to 7200 seconds. Next: implement Redis caching with redis-py v4.6.0. Approved in ticket PROJ-891 by Sarah. Config key: auth.timeout.session in config.yaml."
SEED_B="Working on bug #5832 in payments module. Error: CardDeclinedError on line 287 of /lib/payments/stripe.py in function process_refund(). Fix: change retry window from 30 to 90 days. Next: implement GraphQL API with graphene v3.2.1. Approved in ticket PROJ-1045 by Marcus. Config key: payments.retry.window in config.yaml."
SEED_C="Working on bug #3691 in API module. Error: RateLimitExceeded on line 95 of /api/routes/users.go in function handleBulkInvite(). Fix: change limit from 100 to 500 requests. Next: implement WebSocket notifications with gorilla/websocket v1.5.3. Approved in ticket PROJ-774 by Elena. Config key: api.ratelimit.bulk in config.yaml."
SEED_D="Working on bug #6104 in cache module. Error: ConnectionPoolExhausted on line 156 of /services/cache/redis.ts in function getFromCluster(). Fix: change pool size from 10 to 50 connections. Next: implement Kafka streaming with kafkajs v2.2.4. Approved in ticket PROJ-1299 by David. Config key: cache.pool.maxsize in config.yaml."

PROBE_PROMPT='[QUALITY-PROBE] Answer each with ONLY the exact value. One per line, numbered 1-10. Write "UNKNOWN" if unsure. Do NOT explain.

1. Bug number?
2. File path with the error?
3. Line number of the error?
4. Error type name?
5. Function name we modified?
6. Old value before the fix?
7. New value after the fix?
8. What is our next task after this fix?
9. What library/package for the next task?
10. What config key holds the setting we changed?'

# ─── Treatment Overrides ────────────────────────────────────────────────────
# Write .prep-override for a given treatment code
write_treatment_override() {
    local treatment="$1"
    case "$treatment" in
        M) cat > "$OVERRIDE_FILE" <<'EOF'
USER_MSG_COUNT=3
MSG_TRUNCATE_CHARS=200
INCLUDE_PLAN=false
INCLUDE_ASSISTANT=false
EOF
            ;;
        S) cat > "$OVERRIDE_FILE" <<'EOF'
USER_MSG_COUNT=10
MSG_TRUNCATE_CHARS=500
INCLUDE_PLAN=true
INCLUDE_ASSISTANT=false
EOF
            ;;
        E) cat > "$OVERRIDE_FILE" <<'EOF'
USER_MSG_COUNT=20
MSG_TRUNCATE_CHARS=2000
INCLUDE_PLAN=true
INCLUDE_ASSISTANT=false
EOF
            ;;
        X) cat > "$OVERRIDE_FILE" <<'EOF'
USER_MSG_COUNT=10
MSG_TRUNCATE_CHARS=500
INCLUDE_PLAN=true
INCLUDE_ASSISTANT=true
EOF
            ;;
        C) rm -f "$OVERRIDE_FILE" ;;  # No override for /compact
        *) echo "ERROR: Unknown treatment '$treatment'" >&2; return 1 ;;
    esac
}

# ─── Helpers ─────────────────────────────────────────────────────────────────
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

get_context_pct() {
    grep 'context_pct' "$JICM_STATE" 2>/dev/null | awk '{print $2}' || echo "0"
}

get_context_tokens() {
    grep 'context_tokens' "$JICM_STATE" 2>/dev/null | awk '{print $2}' || echo "0"
}

tmux_send() {
    "$TMUX_BIN" send-keys -t "$TARGET" "$1" Enter
}

tmux_send_text() {
    # Send text without Enter (for multi-line content)
    "$TMUX_BIN" send-keys -t "$TARGET" -l "$1"
}

tmux_capture() {
    "$TMUX_BIN" capture-pane -t "$TARGET" -p -S -100
}

wait_for_idle() {
    local timeout="${1:-120}"
    local elapsed=0
    local prev_content=""
    local stable_count=0

    while [[ $elapsed -lt $timeout ]]; do
        local content
        content=$("$TMUX_BIN" capture-pane -t "$TARGET" -p -S -5 2>/dev/null || echo "")

        # Check for spinner characters (Claude is working)
        if echo "$content" | grep -q '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]'; then
            stable_count=0
            sleep 3
            elapsed=$((elapsed + 3))
            continue
        fi

        # Check for idle prompt
        if echo "$content" | grep -q '❯'; then
            if [[ "$content" == "$prev_content" ]]; then
                stable_count=$((stable_count + 1))
                if [[ $stable_count -ge 3 ]]; then
                    return 0
                fi
            else
                stable_count=0
            fi
        fi

        prev_content="$content"
        sleep 3
        elapsed=$((elapsed + 3))
    done

    return 1  # Timeout
}

wait_for_compact_done() {
    # After /compact, wait for Claude to finish compacting
    local timeout="${1:-180}"
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        local content
        content=$("$TMUX_BIN" capture-pane -t "$TARGET" -p -S -10 2>/dev/null || echo "")

        # /compact produces output like "Auto-compact completed" or just returns to prompt
        if echo "$content" | grep -qiE '(compact|complet|summar)'; then
            sleep 5
            return 0
        fi

        # Or check for idle state (prompt without spinner)
        if echo "$content" | grep -q '❯' && ! echo "$content" | grep -q '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]'; then
            sleep 3
            local content2
            content2=$("$TMUX_BIN" capture-pane -t "$TARGET" -p -S -5 2>/dev/null || echo "")
            if [[ "$content" == "$content2" ]]; then
                return 0
            fi
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    return 1
}

wait_for_jicm_cycle() {
    # Wait for JICM watcher to complete a full cycle
    local timeout="${1:-120}"
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        local state
        state=$(grep 'state:' "$JICM_STATE" 2>/dev/null | awk '{print $2}')

        case "$state" in
            WATCHING)
                local compressions
                compressions=$(grep 'compressions:' "$JICM_STATE" 2>/dev/null | awk '{print $2}')
                if [[ "${compressions:-0}" -gt 0 ]]; then
                    sleep 10  # Let restore complete
                    return 0
                fi
                ;;
        esac

        sleep 5
        elapsed=$((elapsed + 5))
    done

    return 1
}

record_trial() {
    local phase="$1" treatment="$2" block_id="$3" trial_id="$4" fact_set="$5"
    local start_s="$6" end_s="$7" start_pct="$8" end_pct="$9"
    local start_tokens="${10}" end_tokens="${11}" quality_score="${12}"
    local quality_details="${13}" checkpoint_bytes="${14}" checkpoint_lines="${15}"
    local outcome="${16}"

    local duration=$((end_s - start_s))

    jq -nc \
        --arg phase "$phase" \
        --arg treatment "$treatment" \
        --arg block_id "$block_id" \
        --arg trial_id "$trial_id" \
        --arg fact_set "$fact_set" \
        --argjson start_s "$start_s" \
        --argjson end_s "$end_s" \
        --argjson duration_s "$duration" \
        --argjson start_pct "$start_pct" \
        --argjson end_pct "$end_pct" \
        --argjson start_tokens "$start_tokens" \
        --argjson end_tokens "$end_tokens" \
        --argjson quality_score "$quality_score" \
        --argjson quality_details "$quality_details" \
        --argjson checkpoint_bytes "$checkpoint_bytes" \
        --argjson checkpoint_lines "$checkpoint_lines" \
        --arg outcome "$outcome" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{phase:$phase, treatment:$treatment, block_id:$block_id,
          trial_id:$trial_id, fact_set:$fact_set,
          start_s:$start_s, end_s:$end_s, duration_s:$duration_s,
          start_pct:($start_pct|tonumber), end_pct:($end_pct|tonumber),
          start_tokens:($start_tokens|tonumber), end_tokens:($end_tokens|tonumber),
          quality_score:$quality_score, quality_details:$quality_details,
          checkpoint_bytes:$checkpoint_bytes, checkpoint_lines:$checkpoint_lines,
          outcome:$outcome, timestamp:$ts}' >> "$DATA_FILE"
}

# ─── Phase 1: Offline Treatment Comparison ───────────────────────────────────
run_phase_1() {
    log "═══ Phase 1: Offline Treatment Comparison ═══"

    local treatments=("M" "S" "E" "X")
    local labels=("minimal" "standard" "enriched" "mixed")

    for i in "${!treatments[@]}"; do
        local t="${treatments[$i]}"
        local label="${labels[$i]}"

        log "  Treatment $t ($label)..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log "    [DRY RUN] Would run prep script with $t config"
            continue
        fi

        # Set override
        write_treatment_override "$t"

        # Run prep script
        local start_s end_s
        start_s=$(date +%s)
        local output
        output=$(bash "$PREP_SCRIPT" 2>&1)
        end_s=$(date +%s)

        local exit_code=$?
        local duration=$((end_s - start_s))

        # Read checkpoint stats
        local checkpoint="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
        local ckpt_bytes=0 ckpt_lines=0
        if [[ -f "$checkpoint" ]]; then
            ckpt_bytes=$(wc -c < "$checkpoint" | tr -d ' ')
            ckpt_lines=$(wc -l < "$checkpoint" | tr -d ' ')

            # Copy for comparison
            cp "$checkpoint" "$CAPTURE_DIR/phase1-treatment-${t}.md"
        fi

        log "    Exit=$exit_code, ${duration}s, ${ckpt_lines} lines, ${ckpt_bytes} bytes"

        # Record
        record_trial "offline" "$t" "0" "p1-$t" "-" \
            "$start_s" "$end_s" "0" "0" "0" "0" \
            "0" "[]" "$ckpt_bytes" "$ckpt_lines" \
            "$([ $exit_code -eq 0 ] && echo 'success' || echo 'error')"
    done

    # Clean up override
    rm -f "$OVERRIDE_FILE"

    log "  Phase 1 complete. Checkpoint files saved to $CAPTURE_DIR/"

    # Summary comparison
    if [[ "$DRY_RUN" != "true" ]]; then
        log ""
        log "  ─── Phase 1 Summary ───"
        for t in M S E X; do
            local f="$CAPTURE_DIR/phase1-treatment-${t}.md"
            if [[ -f "$f" ]]; then
                local bytes lines
                bytes=$(wc -c < "$f" | tr -d ' ')
                lines=$(wc -l < "$f" | tr -d ' ')
                log "    Treatment $t: ${lines} lines, ${bytes} bytes"
            fi
        done
    fi
}

# ─── Phase 2: Live Quality Probes ────────────────────────────────────────────
run_phase_2() {
    log "═══ Phase 2: Live Quality Probes ═══"

    # Block schedule: treatment code and fact set per trial
    # 4 blocks × 5 treatments = 20 trials (but we run a reduced set)
    # Reduced design: 2 trials per treatment = 10 trials
    local -a SCHEDULE_TREATMENT=("S" "C" "X" "M" "E" "E" "M" "C" "X" "S")
    local -a SCHEDULE_FACTSET=( "A" "A" "A" "A" "A" "B" "B" "B" "B" "B")
    local -a SCHEDULE_BLOCK=(   "1" "1" "1" "1" "1" "2" "2" "2" "2" "2")

    local total=${#SCHEDULE_TREATMENT[@]}

    log "  Schedule: $total trials across 2 blocks"

    for idx in $(seq 0 $((total - 1))); do
        local trial_num=$((idx + 1))

        # Skip if before start trial
        if [[ $trial_num -lt $START_TRIAL ]]; then
            continue
        fi

        local treatment="${SCHEDULE_TREATMENT[$idx]}"
        local fact_set="${SCHEDULE_FACTSET[$idx]}"
        local block_id="${SCHEDULE_BLOCK[$idx]}"
        local trial_id="${block_id}-${trial_num}"

        log ""
        log "  ─── Trial $trial_num/$total: Treatment=$treatment, FactSet=$fact_set, Block=$block_id ───"

        if [[ "$DRY_RUN" == "true" ]]; then
            log "    [DRY RUN] Would execute trial"
            continue
        fi

        # Get seed text for this fact set
        local seed_text
        case "$fact_set" in
            A) seed_text="$SEED_A" ;;
            B) seed_text="$SEED_B" ;;
            C) seed_text="$SEED_C" ;;
            D) seed_text="$SEED_D" ;;
        esac

        # Record pre-treatment state
        local start_pct start_tokens start_s
        start_pct=$(get_context_pct)
        start_tokens=$(get_context_tokens)
        start_s=$(date +%s)

        # Step 1: Send seed facts
        log "    [1/5] Sending seed facts (set $fact_set)..."
        tmux_send "[SEED-FACTS] $seed_text"

        # Step 2: Wait for acknowledgment
        log "    [2/5] Waiting for W0 to process seed..."
        if ! wait_for_idle 90; then
            log "    WARN: Timeout waiting for seed acknowledgment"
        fi
        sleep 5

        # Step 3: Apply treatment
        log "    [3/5] Applying treatment $treatment..."
        local treat_start_s
        treat_start_s=$(date +%s)

        if [[ "$treatment" == "C" ]]; then
            # Native /compact
            tmux_send "/compact"
            if ! wait_for_compact_done 180; then
                log "    ERROR: /compact timeout"
                record_trial "live" "$treatment" "$block_id" "$trial_id" "$fact_set" \
                    "$start_s" "$(date +%s)" "$start_pct" "0" "$start_tokens" "0" \
                    "0" "[]" "0" "0" "timeout"
                continue
            fi
        else
            # JICM v7 treatment
            write_treatment_override "$treatment"

            # Get current watcher compressions count
            local pre_compressions
            pre_compressions=$(grep 'compressions:' "$JICM_STATE" 2>/dev/null | awk '{print $2}' || echo "0")

            # Restart watcher with low threshold to trigger
            local current_pct
            current_pct=$(get_context_pct)
            local trigger_threshold=$((current_pct - 5))
            [[ $trigger_threshold -lt 5 ]] && trigger_threshold=5

            log "    Restarting watcher at threshold $trigger_threshold% (current $current_pct%)..."
            bash "$SCRIPTS_DIR/restart-watcher.sh" "$trigger_threshold" >> "$LOG_FILE" 2>&1

            # Wait for cycle to complete
            if ! wait_for_jicm_cycle 120; then
                log "    ERROR: JICM cycle timeout"
                # Restore safe threshold
                bash "$SCRIPTS_DIR/restart-watcher.sh" "$WATCHER_SAFE_THRESHOLD" >> "$LOG_FILE" 2>&1
                rm -f "$OVERRIDE_FILE"
                record_trial "live" "$treatment" "$block_id" "$trial_id" "$fact_set" \
                    "$start_s" "$(date +%s)" "$start_pct" "0" "$start_tokens" "0" \
                    "0" "[]" "0" "0" "timeout"
                continue
            fi

            # Restore safe threshold
            bash "$SCRIPTS_DIR/restart-watcher.sh" "$WATCHER_SAFE_THRESHOLD" >> "$LOG_FILE" 2>&1
            rm -f "$OVERRIDE_FILE"
        fi

        local treat_end_s
        treat_end_s=$(date +%s)
        local treat_duration=$((treat_end_s - treat_start_s))
        log "    Treatment applied in ${treat_duration}s"

        # Step 4: Wait for idle, send probe
        log "    [4/5] Sending quality probe..."
        if ! wait_for_idle 60; then
            log "    WARN: Timeout waiting for post-treatment idle"
            sleep 10
        fi

        tmux_send "$PROBE_PROMPT"

        # Wait for probe response
        log "    Waiting for probe response..."
        if ! wait_for_idle 120; then
            log "    WARN: Timeout waiting for probe response"
        fi
        sleep 5

        # Step 5: Capture and score
        log "    [5/5] Capturing and scoring..."
        local capture_file="$CAPTURE_DIR/trial-${trial_id}-${treatment}.txt"
        tmux_capture > "$capture_file"

        local end_pct end_tokens end_s
        end_pct=$(get_context_pct)
        end_tokens=$(get_context_tokens)
        end_s=$(date +%s)

        # Score the response
        local score_json
        score_json=$(bash "$SCORE_SCRIPT" --fact-set "$fact_set" --response-file "$capture_file" 2>/dev/null || echo '{"total_score":0,"scores":[]}')

        local quality_score
        quality_score=$(echo "$score_json" | jq -r '.total_score' 2>/dev/null || echo "0")
        local quality_details
        quality_details=$(echo "$score_json" | jq -c '.scores' 2>/dev/null || echo "[]")

        # Get checkpoint stats (JICM treatments only)
        local ckpt_bytes=0 ckpt_lines=0
        if [[ "$treatment" != "C" ]]; then
            local checkpoint="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
            if [[ -f "$checkpoint" ]]; then
                ckpt_bytes=$(wc -c < "$checkpoint" | tr -d ' ')
                ckpt_lines=$(wc -l < "$checkpoint" | tr -d ' ')
            fi
        fi

        log "    Quality score: $quality_score/10"
        log "    Duration: $((end_s - start_s))s (treatment: ${treat_duration}s)"

        # Record trial
        record_trial "live" "$treatment" "$block_id" "$trial_id" "$fact_set" \
            "$start_s" "$end_s" "$start_pct" "$end_pct" "$start_tokens" "$end_tokens" \
            "$quality_score" "$quality_details" "$ckpt_bytes" "$ckpt_lines" "success"

        # Save detailed score
        echo "$score_json" | jq '.' > "$CAPTURE_DIR/score-${trial_id}-${treatment}.json" 2>/dev/null

        # Inter-trial cooldown
        if [[ $trial_num -lt $total ]]; then
            log "    Cooldown ${INTER_TRIAL_WAIT}s..."
            sleep "$INTER_TRIAL_WAIT"
        fi
    done

    log ""
    log "  Phase 2 complete."
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
    mkdir -p "$CAPTURE_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$(dirname "$DATA_FILE")"

    log "═══════════════════════════════════════════════════════"
    log " Experiment 7: JICM v7 Quality & Speed Assessment"
    log " Phase: $PHASE | Start: trial $START_TRIAL | Dry: $DRY_RUN"
    log "═══════════════════════════════════════════════════════"

    case "$PHASE" in
        1)   run_phase_1 ;;
        2)   run_phase_2 ;;
        all) run_phase_1; run_phase_2 ;;
        *)   echo "ERROR: Unknown phase '$PHASE'" >&2; exit 1 ;;
    esac

    log ""
    log "═══ Experiment 7 Complete ═══"

    # Print summary
    if [[ -f "$DATA_FILE" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log ""
        log "─── Data Summary ───"
        local total_trials
        total_trials=$(wc -l < "$DATA_FILE" | tr -d ' ')
        log "Total trials recorded: $total_trials"

        # Quality scores by treatment
        for t in C M S E X; do
            local avg
            avg=$(jq -r "select(.treatment == \"$t\" and .phase == \"live\") | .quality_score" "$DATA_FILE" 2>/dev/null \
                | awk '{s+=$1; n++} END {if(n>0) printf "%.1f", s/n; else print "N/A"}')
            local count
            count=$(jq -r "select(.treatment == \"$t\" and .phase == \"live\") | .quality_score" "$DATA_FILE" 2>/dev/null | wc -l | tr -d ' ')
            log "  Treatment $t: avg quality=$avg (n=$count)"
        done
    fi
}

main "$@"
