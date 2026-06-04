#!/bin/bash
# ============================================================================
# Jarvis Cost-Anomaly Watcher v1.0
# ============================================================================
#
# Polls pulse_dev.api_requests for recurring-task / runaway-cost patterns.
# Writes a state file consumed by the JICM HUD ticker (E).
#
# Detection rules (any one triggers an anomaly):
#   1. 15-min cadence pattern: ≥3 bursts within last 60 min, gap=900±60s,
#      avg input_tokens<50 AND avg cache_read_tokens>500K  (task-executor leak signature)
#   2. Rate spike: >$5 cost in last 5-min rolling window
#   3. Coverage gap: account 5h utilization >50% but proxy-summed cost is <30%
#      of expected (significant unrouted traffic)
#
# Output (atomic write to .claude/context/.cost-state.json):
#   - window_5h: elapsed, cost, request_count, rate_usd_per_h
#   - rate_5min: cost, request_count, rate_usd_per_h
#   - anomalies: list of {type, detail, confidence}
#   - alert_level: ok | watch | warn | critical
#
# Provenance: Built 2026-05-06 in response to task-executor leak that wasted
# ~$8/5h-window before being caught manually. This watcher closes the
# discovery-latency gap from hours to ≤5 min.
#
# Usage:
#   bash .claude/scripts/cost-anomaly-watcher.sh           # live loop, 5min interval
#   bash .claude/scripts/cost-anomaly-watcher.sh --once    # single check + exit
#   COST_INTERVAL=60 bash ... cost-anomaly-watcher.sh      # custom interval (sec)
#
# Author: Jarvis (Project Aion master archon)
# License: MIT
# ============================================================================

set -o pipefail

# ─── CONFIG ────────────────────────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/Users/nathanielcannon/Claude/Project_Aion}"
STATE_FILE="$PROJECT_DIR/.claude/context/.cost-state.json"
LOG_FILE="$PROJECT_DIR/.claude/logs/cost-anomaly-watcher.log"
ANOMALY_LOG="$PROJECT_DIR/.claude/logs/cost-anomaly-events.jsonl"
INTERVAL="${COST_INTERVAL:-300}"
PULSE_API="${PULSE_DEV_API:-http://localhost:8800}"
PULSE_DB_CONTAINER="${PULSE_DB_CONTAINER:-aifred-dev-postgres}"
PULSE_DB_USER="${PULSE_DB_USER:-pulse_dev}"
PULSE_DB_NAME="${PULSE_DB_NAME:-pulse_dev}"

# Thresholds (tunable)
RATE_5MIN_WARN_USD="${RATE_5MIN_WARN_USD:-3.0}"
RATE_5MIN_CRITICAL_USD="${RATE_5MIN_CRITICAL_USD:-5.0}"
TASK_EXECUTOR_CACHE_THRESHOLD="${TASK_EXECUTOR_CACHE_THRESHOLD:-500000}"
COVERAGE_RATIO_WARN="${COVERAGE_RATIO_WARN:-0.5}"

# ─── HELPERS ───────────────────────────────────────────────────────────────
log() {
    printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG_FILE"
}

# Run SQL against pulse_dev; tab-separated single-line output.
psql_query() {
    docker exec "$PULSE_DB_CONTAINER" psql -U "$PULSE_DB_USER" -d "$PULSE_DB_NAME" -A -F$'\t' -t -c "$1" 2>/dev/null
}

# Record an anomaly event to JSONL log.
emit_anomaly() {
    local atype="$1" detail="$2" confidence="$3"
    printf '{"ts":"%s","type":"%s","detail":%s,"confidence":%s}\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$atype" "$detail" "$confidence" >> "$ANOMALY_LOG"
    log "ANOMALY: $atype | $detail | confidence=$confidence"
}

# ─── DETECTION ─────────────────────────────────────────────────────────────

# Returns: cost_usd req_count for current 5h window
metric_5h_window() {
    local row
    row=$(psql_query "SELECT
        ROUND(SUM(cost_usd)::numeric, 4) AS cost,
        COUNT(*) AS reqs,
        EXTRACT(EPOCH FROM (now() - MIN(timestamp)))::int AS elapsed_sec
    FROM api_requests
    WHERE timestamp >= now() - interval '5 hours' AND http_status = 200;")
    echo "${row:-0	0	0}"
}

# Returns: cost_usd req_count for last 5 min
metric_5min_rate() {
    local row
    row=$(psql_query "SELECT
        ROUND(SUM(cost_usd)::numeric, 4) AS cost,
        COUNT(*) AS reqs
    FROM api_requests
    WHERE timestamp >= now() - interval '5 minutes' AND http_status = 200;")
    echo "${row:-0	0}"
}

# Detection 1: 15-min cadence pattern
# Signature: ≥3 bursts in last hour, gap = 900±60s, low input + high cache_read.
detect_task_executor_pattern() {
    local result
    result=$(psql_query "WITH bursts AS (
        SELECT timestamp,
               input_tokens,
               cache_read_tokens,
               LAG(timestamp) OVER (ORDER BY timestamp) AS prev
        FROM api_requests
        WHERE timestamp >= now() - interval '60 minutes'
          AND http_status = 200
          AND model LIKE 'claude-sonnet%'
    ),
    starts AS (
        SELECT timestamp, input_tokens, cache_read_tokens,
               EXTRACT(EPOCH FROM (timestamp - prev))::numeric AS gap
        FROM bursts
        WHERE prev IS NULL OR (timestamp - prev) > interval '60 seconds'
    )
    SELECT COUNT(*) FILTER (WHERE gap BETWEEN 840 AND 960) AS matching_gaps,
           ROUND(AVG(input_tokens)::numeric, 1) AS avg_input,
           ROUND(AVG(cache_read_tokens)::numeric, 0) AS avg_cache_read,
           COUNT(*) AS total_starts
    FROM starts;")
    echo "$result"
}

# Detection 3: account vs proxy coverage gap
detect_coverage_gap() {
    local util cost
    util=$(curl -sf "$PULSE_API/api/v1/usage/session-window" 2>/dev/null \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("five_hour",{}).get("utilization", 0))' 2>/dev/null || echo 0)
    cost=$(curl -sf "$PULSE_API/api/v1/usage/session-spend-dollars" 2>/dev/null \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("total_usd", 0))' 2>/dev/null || echo 0)
    # Reference: a 100%-util session typically = $37 of proxy-summed cost (empirical)
    echo "$util $cost"
}

# ─── MAIN CYCLE ────────────────────────────────────────────────────────────
run_cycle() {
    # 5h window
    local row5h cost5h reqs5h elapsed5h rate5h
    row5h=$(metric_5h_window)
    cost5h=$(echo "$row5h" | awk -F'\t' '{print ($1+0)}')
    reqs5h=$(echo "$row5h" | awk -F'\t' '{print ($2+0)}')
    elapsed5h=$(echo "$row5h" | awk -F'\t' '{print ($3+0)}')
    rate5h=$(awk -v c="$cost5h" -v e="$elapsed5h" 'BEGIN{if(e>0) printf "%.3f", c*3600/e; else print "0"}')

    # 5min rate
    local row5m cost5m reqs5m rate5m_per_h
    row5m=$(metric_5min_rate)
    cost5m=$(echo "$row5m" | awk -F'\t' '{print ($1+0)}')
    reqs5m=$(echo "$row5m" | awk -F'\t' '{print ($2+0)}')
    rate5m_per_h=$(awk -v c="$cost5m" 'BEGIN{printf "%.2f", c*12}')

    # Anomalies array (JSON-safe assembly)
    local anomalies="[]"
    local alert="ok"

    # Rule 1: task-executor signature
    local te_row matching_gaps avg_input avg_cache total_starts
    te_row=$(detect_task_executor_pattern)
    matching_gaps=$(echo "$te_row" | awk -F'\t' '{print ($1+0)}')
    avg_input=$(echo "$te_row" | awk -F'\t' '{print ($2+0)}')
    avg_cache=$(echo "$te_row" | awk -F'\t' '{print ($3+0)}')
    if [[ "$matching_gaps" -ge 3 ]] && (( $(awk -v c="$avg_cache" -v t="$TASK_EXECUTOR_CACHE_THRESHOLD" 'BEGIN{print (c>t)?1:0}') )) && (( $(awk -v i="$avg_input" 'BEGIN{print (i<50)?1:0}') )); then
        local detail
        detail=$(printf '{"matching_gaps":%d,"avg_input":%s,"avg_cache_read":%s}' "$matching_gaps" "$avg_input" "$avg_cache")
        emit_anomaly "task-executor-burst-pattern" "$detail" "0.95"
        anomalies=$(printf '[{"type":"task-executor-burst-pattern","detail":%s,"confidence":0.95}]' "$detail")
        alert="critical"
    fi

    # Rule 2: 5-min rate spike
    if (( $(awk -v c="$cost5m" -v t="$RATE_5MIN_CRITICAL_USD" 'BEGIN{print (c>t)?1:0}') )); then
        local detail
        detail=$(printf '{"cost_5min_usd":%s,"req_count":%d}' "$cost5m" "$reqs5m")
        emit_anomaly "rate-spike-critical" "$detail" "1.0"
        if [[ "$alert" != "critical" ]]; then alert="critical"; fi
    elif (( $(awk -v c="$cost5m" -v t="$RATE_5MIN_WARN_USD" 'BEGIN{print (c>t)?1:0}') )); then
        if [[ "$alert" == "ok" ]]; then alert="warn"; fi
    fi

    # Rule 3: coverage gap (account util > threshold but proxy-summed too low)
    local cov_row cov_util cov_cost
    cov_row=$(detect_coverage_gap)
    cov_util=$(echo "$cov_row" | awk '{print $1+0}')
    cov_cost=$(echo "$cov_row" | awk '{print $2+0}')
    local coverage_ratio
    coverage_ratio=$(awk -v u="$cov_util" -v c="$cov_cost" 'BEGIN{
        expected = u * 37.0;
        if (expected > 1.0) printf "%.3f", c/expected; else print "1.0"
    }')
    if (( $(awk -v r="$coverage_ratio" -v u="$cov_util" -v t="$COVERAGE_RATIO_WARN" 'BEGIN{print (u>0.3 && r<t)?1:0}') )); then
        local detail
        detail=$(printf '{"util_5h":%s,"proxy_cost":%s,"coverage_ratio":%s}' "$cov_util" "$cov_cost" "$coverage_ratio")
        emit_anomaly "coverage-gap" "$detail" "0.8"
        if [[ "$alert" == "ok" ]]; then alert="watch"; fi
    fi

    # Atomic state-file write
    local tmp="$STATE_FILE.tmp.$$"
    cat > "$tmp" <<JSONEOF
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "window_5h": {
    "elapsed_seconds": $elapsed5h,
    "cost_usd": $cost5h,
    "request_count": $reqs5h,
    "rate_usd_per_h": $rate5h
  },
  "rate_5min": {
    "cost_usd": $cost5m,
    "request_count": $reqs5m,
    "rate_usd_per_h": $rate5m_per_h
  },
  "coverage": {
    "util_5h": $cov_util,
    "proxy_cost_usd": $cov_cost,
    "ratio": $coverage_ratio
  },
  "anomalies": $anomalies,
  "alert_level": "$alert"
}
JSONEOF
    mv "$tmp" "$STATE_FILE"

    log "cycle: 5h=\$$cost5h ($reqs5h reqs, \$$rate5h/hr) | 5m=\$$cost5m | alert=$alert"
}

# ─── ENTRY ─────────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOG_FILE")"

case "${1:-}" in
    --once)
        run_cycle
        cat "$STATE_FILE" 2>/dev/null
        ;;
    *)
        log "Cost-anomaly watcher starting (interval=${INTERVAL}s, pulse=$PULSE_API)"
        while true; do
            run_cycle
            sleep "$INTERVAL"
        done
        ;;
esac
