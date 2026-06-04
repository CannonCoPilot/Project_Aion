#!/usr/bin/env bash
# gather-weekly-data.sh — Pre-gather cost/execution data for weekly-digest job
#
# Collects cost ledger entries, job execution stats, and failure summaries
# from the past 7 days. The LLM only needs to summarize and format.
#
# Output: stdout (text block for prompt injection)
# Called by: executor.sh pre_gather mechanism

set -uo pipefail

COST_LEDGER="${PROJECT_DIR:-.}/.claude/data/cost-ledger.jsonl"
SEVEN_DAYS_AGO=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d 2>/dev/null || echo "2026-01-01")

echo "## Pre-Gathered Weekly Data (${SEVEN_DAYS_AGO} to today)"
echo ""

if [ ! -f "$COST_LEDGER" ]; then
    echo "No cost ledger found at $COST_LEDGER"
    exit 0
fi

echo "### Cost Ledger Summary (last 7 days)"
echo '```'
jq -s --arg since "$SEVEN_DAYS_AGO" '
    [.[] | select(.ts >= $since)] |
    {
        total_jobs: length,
        total_cost_usd: ([.[].cost] | add // 0 | . * 100 | round / 100),
        successful: [.[] | select(.success == true)] | length,
        failed: [.[] | select(.success == false)] | length,
        by_engine: (group_by(.engine) | map({
            engine: .[0].engine,
            count: length,
            cost: ([.[].cost] | add // 0 | . * 100 | round / 100)
        })),
        top_5_costly: (sort_by(-.cost) | .[0:5] | map({
            job: .job, cost: .cost, engine: .engine, model: .model, ts: .ts
        })),
        by_job: (group_by(.job) | map({
            job: .[0].job,
            runs: length,
            total_cost: ([.[].cost] | add // 0 | . * 100 | round / 100),
            avg_duration: ([.[].duration_s] | add / length | round)
        }) | sort_by(-.total_cost))
    }
' "$COST_LEDGER" 2>/dev/null || echo "Failed to parse cost ledger"
echo '```'
echo ""

echo "### Failed Executions (last 7 days)"
echo '```'
jq -s --arg since "$SEVEN_DAYS_AGO" '
    [.[] | select(.ts >= $since and .success == false)] |
    if length == 0 then "No failures in the past 7 days"
    else map({job: .job, ts: .ts, engine: .engine, cost: .cost})
    end
' "$COST_LEDGER" 2>/dev/null || echo "No failure data"
echo '```'
echo ""

echo "### Daily Cost Trend"
echo '```'
jq -s --arg since "$SEVEN_DAYS_AGO" '
    [.[] | select(.ts >= $since)] |
    group_by(.ts[:10]) |
    map({
        date: .[0].ts[:10],
        jobs: length,
        cost: ([.[].cost] | add // 0 | . * 100 | round / 100)
    }) |
    sort_by(.date)
' "$COST_LEDGER" 2>/dev/null || echo "No trend data"
echo '```'
