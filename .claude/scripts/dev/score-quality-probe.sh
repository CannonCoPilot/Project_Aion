#!/bin/bash
# score-quality-probe.sh — Score quality probe responses against ground truth
#
# Takes a captured probe response and a fact set identifier, returns quality score.
#
# Usage: score-quality-probe.sh --fact-set A|B|C|D --response-file FILE
#        score-quality-probe.sh --fact-set A --response "captured text"
#
# Output: JSON with total score and per-question details
#
# Scoring:
#   1 point  = exact match (case-insensitive, substring OK)
#   0.5      = partial match (key term present)
#   0        = wrong or UNKNOWN
#
set -eu

FACT_SET=""
RESPONSE_FILE=""
RESPONSE_TEXT=""

# ─── Argument Parsing ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --fact-set)      FACT_SET="$2"; shift 2 ;;
        --response-file) RESPONSE_FILE="$2"; shift 2 ;;
        --response)      RESPONSE_TEXT="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: score-quality-probe.sh --fact-set A|B|C|D --response-file FILE"
            exit 0 ;;
        *) shift ;;
    esac
done

if [[ -z "$FACT_SET" ]]; then
    echo "ERROR: --fact-set required (A, B, C, or D)" >&2
    exit 1
fi

# Load response text
if [[ -n "$RESPONSE_FILE" ]] && [[ -f "$RESPONSE_FILE" ]]; then
    RESPONSE_TEXT=$(cat "$RESPONSE_FILE")
elif [[ -z "$RESPONSE_TEXT" ]]; then
    echo "ERROR: --response-file or --response required" >&2
    exit 1
fi

# ─── Ground Truth ─────────────────────────────────────────────────────────
# Arrays indexed 0-9 for questions 1-10
case "$FACT_SET" in
    A)
        ANSWERS=("4217" "/src/auth/validator.py" "142" "TokenExpiredError" "validate_session_token" "3600" "7200" "Redis caching" "redis-py" "auth.timeout.session")
        PARTIALS=("4217" "validator.py" "142" "TokenExpired" "validate_session" "3600" "7200" "Redis" "redis" "auth.timeout")
        ;;
    B)
        ANSWERS=("5832" "/lib/payments/stripe.py" "287" "CardDeclinedError" "process_refund" "30" "90" "GraphQL API" "graphene" "payments.retry.window")
        PARTIALS=("5832" "stripe.py" "287" "CardDeclined" "process_refund" "30" "90" "GraphQL" "graphene" "payments.retry")
        ;;
    C)
        ANSWERS=("3691" "/api/routes/users.go" "95" "RateLimitExceeded" "handleBulkInvite" "100" "500" "WebSocket notifications" "gorilla/websocket" "api.ratelimit.bulk")
        PARTIALS=("3691" "users.go" "95" "RateLimit" "handleBulk" "100" "500" "WebSocket" "gorilla" "api.ratelimit")
        ;;
    D)
        ANSWERS=("6104" "/services/cache/redis.ts" "156" "ConnectionPoolExhausted" "getFromCluster" "10" "50" "Kafka streaming" "kafkajs" "cache.pool.maxsize")
        PARTIALS=("6104" "redis.ts" "156" "ConnectionPool" "getFromCluster" "10" "50" "Kafka" "kafkajs" "cache.pool")
        ;;
    *)
        echo "ERROR: Unknown fact set '$FACT_SET' (use A, B, C, or D)" >&2
        exit 1
        ;;
esac

CATEGORIES=("identifier" "filepath" "lineno" "errortype" "function" "old_value" "new_value" "next_task" "library" "config_key")

# ─── Extract Answers from Response ────────────────────────────────────────
# Response format: numbered lines "1. answer\n2. answer\n..."
# We extract the answer portion after the number prefix

declare -a EXTRACTED
for i in $(seq 1 10); do
    # Try multiple patterns: "1. answer", "1: answer", "1) answer", just "answer" on line i
    line=$(echo "$RESPONSE_TEXT" | grep -i "^[[:space:]]*${i}[\.\:\)][[:space:]]" | head -1 | sed "s/^[[:space:]]*${i}[\.\:\)][[:space:]]*//" | tr -d '\r')
    if [[ -z "$line" ]]; then
        # Fallback: try to get the i-th non-empty line
        line=$(echo "$RESPONSE_TEXT" | grep -v '^[[:space:]]*$' | sed -n "${i}p" | tr -d '\r')
    fi
    EXTRACTED+=("$line")
done

# ─── Score Each Answer ────────────────────────────────────────────────────
TOTAL=0
declare -a SCORES
declare -a RESULTS

for i in $(seq 0 9); do
    answer="${EXTRACTED[$i]:-}"
    expected="${ANSWERS[$i]}"
    partial="${PARTIALS[$i]}"
    score=0
    result="miss"

    trimmed=$(echo "$answer" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [[ -z "$answer" ]] || echo "$trimmed" | grep -qix "unknown"; then
        score=0
        result="unknown"
    elif echo "$answer" | grep -qi "$expected"; then
        score=1
        result="exact"
    elif echo "$answer" | grep -qi "$partial"; then
        score="0.5"
        result="partial"
    else
        score=0
        result="miss"
    fi

    SCORES+=("$score")
    RESULTS+=("$result")
    TOTAL=$(echo "$TOTAL + $score" | bc)
done

# ─── Output JSON ─────────────────────────────────────────────────────────
# Build scores array
scores_json="["
for i in $(seq 0 9); do
    [[ $i -gt 0 ]] && scores_json+=","
    scores_json+="${SCORES[$i]}"
done
scores_json+="]"

# Build details array
details_json="["
for i in $(seq 0 9); do
    [[ $i -gt 0 ]] && details_json+=","
    details_json+="{\"q\":$((i+1)),\"category\":\"${CATEGORIES[$i]}\",\"expected\":\"${ANSWERS[$i]}\",\"got\":\"${EXTRACTED[$i]:-}\",\"result\":\"${RESULTS[$i]}\",\"score\":${SCORES[$i]}}"
done
details_json+="]"

cat <<EOF
{
  "fact_set": "$FACT_SET",
  "total_score": $TOTAL,
  "max_score": 10,
  "pct": $(echo "scale=1; $TOTAL * 10" | bc),
  "scores": $scores_json,
  "details": $details_json
}
EOF
