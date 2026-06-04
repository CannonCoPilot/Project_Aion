#!/bin/bash
# cost-report.sh - Aggregate Nexus job costs from SQLite
#
# Part of the Nexus autonomous operations platform (Phase 3: Observability).
# Deterministic bash script — no LLM costs to run.
#
# Usage:
#   cost-report.sh                          # Daily costs, past 7 days
#   cost-report.sh --period weekly          # Weekly totals, past 4 weeks
#   cost-report.sh --today                  # Today's total
#   cost-report.sh --cost-thresholds 5,20    # Warn >$5, critical >$20 (via message bus)
#   cost-report.sh --json                   # JSON output for dashboard
#   cost-report.sh --engine ollama          # Filter by engine

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2034  # JOBS_DIR used by sourcing scripts
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
JOBSDB="$SCRIPT_DIR/nexusdb.py"
MSGBUS="$SCRIPT_DIR/msgbus.sh"

# SQLite helper
_db() { python3 "$JOBSDB" "$@"; }

# Temp file for filtered data (cleaned up on exit)
DATA_FILE=$(mktemp)
trap 'rm -f "$DATA_FILE"' EXIT

# Colors (only when interactive and not --json)
JSON_MODE=false
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' NC=''
fi

# ============================================================================
# Functions
# ============================================================================

show_help() {
    cat << 'EOF'
cost-report.sh - Nexus cost aggregation

USAGE:
    cost-report.sh [OPTIONS]

OPTIONS:
    --period <daily|weekly>   Aggregation period (default: daily)
    --today                   Show today's costs only
    --days <N>                Number of days to show (default: 7 for daily, 28 for weekly)
    --engine <name>           Filter by engine (claude-code, ollama)
    --cost-thresholds <W,C>   Tiered cost alerts: warn at $W, critical at $C (default: 5,20)
    --alert-threshold <USD>   Legacy: alert at $USD (warning), critical at 4x
    --json                    Output JSON (for dashboard integration)
    -h, --help                Show this help

EXAMPLES:
    cost-report.sh                            # Daily costs, past 7 days
    cost-report.sh --period weekly            # Weekly totals, past 4 weeks
    cost-report.sh --today                    # Today's spending
    cost-report.sh --cost-thresholds 5,20      # Warn >$5, critical >$20
    cost-report.sh --alert-threshold 5.00     # Legacy: warn >$5, critical >$20
    cost-report.sh --json                     # JSON for dashboard
EOF
}

# Load and filter events from SQLite into DATA_FILE as flat JSONL
load_notifications() {
    local engine_filter="${1:-}"

    local engine_clause=""
    if [ -n "$engine_filter" ]; then
        engine_clause="AND json_extract(data, '$.engine') = '$engine_filter'"
    fi

    _db exec \
        "SELECT CAST(id AS TEXT) as id, created_at as timestamp,
                json_extract(data, '$.job') as job, severity,
                COALESCE(json_extract(data, '$.title'), '') as title,
                COALESCE(json_extract(data, '$.summary'), '') as summary,
                COALESCE(json_extract(data, '$.exit_code'), 0) as exit_code,
                json_extract(data, '$.cost_usd') as cost_usd,
                COALESCE(json_extract(data, '$.duration_secs'), 0) as duration_secs,
                COALESCE(json_extract(data, '$.engine'), 'claude-code') as engine,
                COALESCE(json_extract(data, '$.output_file'), '') as output_file
         FROM events
         WHERE event_type = 'job_completed'
           AND json_extract(data, '$.cost_usd') IS NOT NULL
           AND json_extract(data, '$.cost_usd') != 'unknown'
           $engine_clause
         ORDER BY id" > "$DATA_FILE" 2>/dev/null || true

    # If no results, write empty array for jq compatibility
    if [ ! -s "$DATA_FILE" ]; then
        echo "" > "$DATA_FILE"
    fi
}

# Aggregate costs by date (reads from DATA_FILE)
aggregate_daily() {
    local days="$1"
    local cutoff
    cutoff=$(date -d "$days days ago" +%Y-%m-%d 2>/dev/null || date -v-${days}d +%Y-%m-%d 2>/dev/null)

    jq -s --arg cutoff "$cutoff" '
        [.[] | select(.timestamp >= $cutoff)]
        | group_by(.timestamp[:10])
        | map({
            date: .[0].timestamp[:10],
            total: (map(.cost_usd | tostring | tonumber) | add // 0),
            count: length,
            by_engine: (group_by(.engine // "claude-code") | map({
                engine: (.[0].engine // "claude-code"),
                cost: (map(.cost_usd | tostring | tonumber) | add // 0),
                count: length
            })),
            by_job: (group_by(.job) | map({
                job: .[0].job,
                cost: (map(.cost_usd | tostring | tonumber) | add // 0),
                count: length
            }) | sort_by(-.cost))
        })
        | sort_by(.date)
        | reverse
    ' "$DATA_FILE" 2>/dev/null || echo "[]"
}

# Aggregate costs by week (reads from DATA_FILE)
aggregate_weekly() {
    local weeks="$1"
    local cutoff_days=$((weeks * 7))
    local cutoff
    cutoff=$(date -d "$cutoff_days days ago" +%Y-%m-%d 2>/dev/null || date -v-${cutoff_days}d +%Y-%m-%d 2>/dev/null)

    jq -s --arg cutoff "$cutoff" '
        [.[] | select(.timestamp >= $cutoff)]
        | group_by(.timestamp[:4] + "-W" + ((.timestamp[:10] | strptime("%Y-%m-%d") | strftime("%V"))))
        | map({
            week: .[0].timestamp[:4] + "-W" + (.[0].timestamp[:10] | strptime("%Y-%m-%d") | strftime("%V")),
            total: (map(.cost_usd | tostring | tonumber) | add // 0),
            count: length,
            by_engine: (group_by(.engine // "claude-code") | map({
                engine: (.[0].engine // "claude-code"),
                cost: (map(.cost_usd | tostring | tonumber) | add // 0),
                count: length
            }))
        })
        | sort_by(.week)
        | reverse
    ' "$DATA_FILE" 2>/dev/null || echo "[]"
}

# Get today's total cost (reads from DATA_FILE)
today_total() {
    local today
    today=$(date +%Y-%m-%d)

    jq -s --arg today "$today" '
        [.[] | select(.timestamp[:10] == $today)]
        | {
            date: $today,
            total: (map(.cost_usd | tostring | tonumber) | add // 0),
            count: length,
            by_engine: (group_by(.engine // "claude-code") | map({
                engine: (.[0].engine // "claude-code"),
                cost: (map(.cost_usd | tostring | tonumber) | add // 0),
                count: length
            })),
            by_job: (group_by(.job) | map({
                job: .[0].job,
                cost: (map(.cost_usd | tostring | tonumber) | add // 0),
                count: length
            }) | sort_by(-.cost))
        }
    ' "$DATA_FILE" 2>/dev/null || echo "{}"
}

# Print daily report (terminal)
print_daily_report() {
    local aggregated="$1"
    local total_cost

    echo ""
    echo -e "${BOLD}Nexus Cost Report — Daily${NC}"
    echo "===================================="
    echo ""
    printf "%-12s %10s %8s %s\n" "DATE" "COST" "RUNS" "ENGINES"
    printf "%-12s %10s %8s %s\n" "----" "----" "----" "-------"

    echo "$aggregated" | jq -r '.[] |
        [.date, (.total | tostring | .[0:6]), (.count | tostring),
         (.by_engine | map(.engine + ":" + (.count | tostring)) | join(", "))]
        | @tsv' 2>/dev/null | \
    while IFS=$'\t' read -r date cost count engines; do
        printf "%-12s %9s %8s %s\n" "$date" "\$$cost" "$count" "$engines"
    done

    total_cost=$(echo "$aggregated" | jq '[.[].total] | add // 0 | tostring | .[0:6]' -r 2>/dev/null)
    echo ""
    echo -e "  ${BOLD}Period total: \$${total_cost}${NC}"
    echo ""
}

# Print weekly report (terminal)
print_weekly_report() {
    local aggregated="$1"
    local total_cost

    echo ""
    echo -e "${BOLD}Nexus Cost Report — Weekly${NC}"
    echo "====================================="
    echo ""
    printf "%-12s %10s %8s %s\n" "WEEK" "COST" "RUNS" "ENGINES"
    printf "%-12s %10s %8s %s\n" "----" "----" "----" "-------"

    echo "$aggregated" | jq -r '.[] |
        [.week, (.total | tostring | .[0:6]), (.count | tostring),
         (.by_engine | map(.engine + ":" + (.count | tostring)) | join(", "))]
        | @tsv' 2>/dev/null | \
    while IFS=$'\t' read -r week cost count engines; do
        printf "%-12s %9s %8s %s\n" "$week" "\$$cost" "$count" "$engines"
    done

    total_cost=$(echo "$aggregated" | jq '[.[].total] | add // 0 | tostring | .[0:6]' -r 2>/dev/null)
    echo ""
    echo -e "  ${BOLD}Period total: \$${total_cost}${NC}"
    echo ""
}

# Print today report (terminal)
print_today_report() {
    local today_data="$1"
    local total count

    total=$(echo "$today_data" | jq -r '.total | tostring | .[0:6]' 2>/dev/null)
    count=$(echo "$today_data" | jq -r '.count' 2>/dev/null)

    echo ""
    echo -e "${BOLD}Today's Nexus Costs${NC}"
    echo "============================="
    echo ""
    echo -e "  Total: ${BOLD}\$${total}${NC} across ${count} runs"
    echo ""

    echo "  By engine:"
    echo "$today_data" | jq -r '.by_engine[] |
        "    " + .engine + ": $" + (.cost | tostring | .[0:6]) + " (" + (.count | tostring) + " runs)"' 2>/dev/null

    echo ""
    echo "  By job:"
    echo "$today_data" | jq -r '.by_job[] |
        "    " + .job + ": $" + (.cost | tostring | .[0:6]) + " (" + (.count | tostring) + " runs)"' 2>/dev/null
    echo ""
}

# Check cost thresholds with tiered severity
# Under warn_threshold = info (silent), warn-crit = warning (dashboard), above crit = critical (Telegram)
check_cost_thresholds() {
    local today_data="$1" warn_threshold="$2" crit_threshold="$3"
    local total
    total=$(echo "$today_data" | jq -r '.total' 2>/dev/null || echo "0")

    local severity="info"
    if echo "$total $crit_threshold" | awk '{exit !($1 > $2)}'; then
        severity="critical"
    elif echo "$total $warn_threshold" | awk '{exit !($1 > $2)}'; then
        severity="warning"
    fi

    if [ "$severity" != "info" ] && [ -x "$MSGBUS" ]; then
        "$MSGBUS" send --type cost_alert \
            --source "headless:cost-report" \
            --severity "$severity" \
            --data "$(jq -nc \
                --arg total "$total" \
                --arg warn "$warn_threshold" \
                --arg crit "$crit_threshold" \
                --arg sev "$severity" \
                --arg date "$(date +%Y-%m-%d)" \
                '{total_usd: ($total|tonumber), warn_threshold: ($warn|tonumber), crit_threshold: ($crit|tonumber), severity: $sev, date: $date}')" \
            > /dev/null 2>&1 || true
    fi

    if [ "$severity" = "critical" ]; then
        echo -e "${RED}CRITICAL: Daily cost \$${total} exceeds \$${crit_threshold}${NC}" >&2
        return 2
    elif [ "$severity" = "warning" ]; then
        echo -e "${YELLOW}WARNING: Daily cost \$${total} exceeds \$${warn_threshold}${NC}" >&2
        return 1
    fi
    return 0
}

# ============================================================================
# Main
# ============================================================================

PERIOD="daily"
DAYS=""
ENGINE_FILTER=""
COST_WARN=""
COST_CRIT=""
TODAY_ONLY=false

# shellcheck disable=SC2034  # GREEN/BLUE/CYAN set for consistency, used by sourcing scripts
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --period) PERIOD="$2"; shift 2 ;;
        --days) DAYS="$2"; shift 2 ;;
        --engine) ENGINE_FILTER="$2"; shift 2 ;;
        --cost-thresholds) COST_WARN="${2%,*}"; COST_CRIT="${2#*,}"; shift 2 ;;
        --alert-threshold) COST_WARN="$2"; COST_CRIT=$(awk "BEGIN {printf \"%.2f\", $2 * 4}"); shift 2 ;;
        --today) TODAY_ONLY=true; shift ;;
        --json) JSON_MODE=true; RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' NC=''; shift ;;
        *) echo "Unknown option: $1"; show_help; exit 1 ;;
    esac
done

# Set default days
if [ -z "$DAYS" ]; then
    case "$PERIOD" in
        daily)  DAYS=7 ;;
        weekly) DAYS=4 ;;
    esac
fi

# Load filtered data into temp file
load_notifications "$ENGINE_FILTER"

# Handle cost thresholds
if [ -n "$COST_WARN" ]; then
    TODAY_DATA=$(today_total)
    check_cost_thresholds "$TODAY_DATA" "$COST_WARN" "$COST_CRIT" || true
fi

# Today-only mode
if [ "$TODAY_ONLY" = "true" ]; then
    TODAY_DATA=$(today_total)
    if [ "$JSON_MODE" = "true" ]; then
        echo "$TODAY_DATA" | jq '.'
    else
        print_today_report "$TODAY_DATA"
    fi
    exit 0
fi

# Period-based reports
case "$PERIOD" in
    daily)
        AGG=$(aggregate_daily "$DAYS")
        if [ "$JSON_MODE" = "true" ]; then
            echo "$AGG" | jq '.'
        else
            print_daily_report "$AGG"
        fi
        ;;
    weekly)
        AGG=$(aggregate_weekly "$DAYS")
        if [ "$JSON_MODE" = "true" ]; then
            echo "$AGG" | jq '.'
        else
            print_weekly_report "$AGG"
        fi
        ;;
    *)
        echo "Unknown period: $PERIOD (use daily or weekly)"
        exit 1
        ;;
esac

exit 0
