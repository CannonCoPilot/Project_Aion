#!/bin/bash
# score-session-probe.sh — Score session-natural quality probe responses
#
# Unlike score-quality-probe.sh (v1, synthetic facts), this uses per-trial
# ground truth files with real session work as answers.
#
# Usage:
#   score-session-probe.sh --ground-truth FILE --response-file FILE
#   score-session-probe.sh --ground-truth FILE --response "captured text"
#
# Ground truth JSON format:
#   {
#     "trial_id": "2-1",
#     "treatment": "S",
#     "answers": [
#       {"exact": "jicm-prep-context.sh", "partial": "prep-context"},
#       {"exact": "32", "partial": "32"},
#       ...
#     ]
#   }
#
# Output: JSON with total score and per-question details
#
set -eu

GROUND_TRUTH_FILE=""
RESPONSE_FILE=""
RESPONSE_TEXT=""

# ─── Argument Parsing ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --ground-truth)  GROUND_TRUTH_FILE="$2"; shift 2 ;;
        --response-file) RESPONSE_FILE="$2"; shift 2 ;;
        --response)      RESPONSE_TEXT="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: score-session-probe.sh --ground-truth FILE --response-file FILE"
            exit 0 ;;
        *) shift ;;
    esac
done

if [[ -z "$GROUND_TRUTH_FILE" ]] || [[ ! -f "$GROUND_TRUTH_FILE" ]]; then
    echo "ERROR: --ground-truth FILE required (must exist)" >&2
    exit 1
fi

# Load response text
if [[ -n "$RESPONSE_FILE" ]] && [[ -f "$RESPONSE_FILE" ]]; then
    RESPONSE_TEXT=$(cat "$RESPONSE_FILE")
elif [[ -z "$RESPONSE_TEXT" ]]; then
    echo "ERROR: --response-file or --response required" >&2
    exit 1
fi

# ─── Load Ground Truth ───────────────────────────────────────────────────
TRIAL_ID=$(jq -r '.trial_id' "$GROUND_TRUTH_FILE")
TREATMENT=$(jq -r '.treatment' "$GROUND_TRUTH_FILE")
NUM_QUESTIONS=$(jq '.answers | length' "$GROUND_TRUTH_FILE")

if [[ "$NUM_QUESTIONS" -lt 1 ]] || [[ "$NUM_QUESTIONS" -gt 20 ]]; then
    echo "ERROR: Ground truth must have 1-20 answers, got $NUM_QUESTIONS" >&2
    exit 1
fi

# ─── Extract Answers from Response ────────────────────────────────────────
declare -a EXTRACTED
for i in $(seq 1 "$NUM_QUESTIONS"); do
    # Try numbered patterns: "1. answer", "1: answer", "1) answer"
    line=$(echo "$RESPONSE_TEXT" | grep -i "^[[:space:]]*${i}[\.\:\)][[:space:]]" | head -1 | sed "s/^[[:space:]]*${i}[\.\:\)][[:space:]]*//" | tr -d '\r')
    if [[ -z "$line" ]]; then
        # Fallback: i-th non-empty line
        line=$(echo "$RESPONSE_TEXT" | grep -v '^[[:space:]]*$' | sed -n "${i}p" | tr -d '\r')
    fi
    EXTRACTED+=("$line")
done

# ─── Score Each Answer ────────────────────────────────────────────────────
TOTAL=0
declare -a SCORES
declare -a RESULTS

for i in $(seq 0 $((NUM_QUESTIONS - 1))); do
    answer="${EXTRACTED[$i]:-}"
    expected=$(jq -r ".answers[$i].exact" "$GROUND_TRUTH_FILE")
    partial=$(jq -r ".answers[$i].partial" "$GROUND_TRUTH_FILE")
    category=$(jq -r ".answers[$i].category // \"q$((i+1))\"" "$GROUND_TRUTH_FILE")
    score=0
    result="miss"

    # Use -x (whole-line match) to avoid false positives when "UNKNOWN" appears as content
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
scores_json="["
for i in $(seq 0 $((NUM_QUESTIONS - 1))); do
    [[ $i -gt 0 ]] && scores_json+=","
    scores_json+="${SCORES[$i]}"
done
scores_json+="]"

details_json="["
for i in $(seq 0 $((NUM_QUESTIONS - 1))); do
    [[ $i -gt 0 ]] && details_json+=","
    expected=$(jq -r ".answers[$i].exact" "$GROUND_TRUTH_FILE")
    category=$(jq -r ".answers[$i].category // \"q$((i+1))\"" "$GROUND_TRUTH_FILE")
    # Escape any quotes in extracted answer for JSON safety
    got=$(echo "${EXTRACTED[$i]:-}" | jq -Rs '.')
    details_json+="{\"q\":$((i+1)),\"category\":\"$category\",\"expected\":\"$expected\",\"got\":$got,\"result\":\"${RESULTS[$i]}\",\"score\":${SCORES[$i]}}"
done
details_json+="]"

cat <<EOF
{
  "trial_id": "$TRIAL_ID",
  "treatment": "$TREATMENT",
  "total_score": $TOTAL,
  "max_score": $NUM_QUESTIONS,
  "pct": $(echo "scale=1; $TOTAL / $NUM_QUESTIONS * 100" | bc),
  "scores": $scores_json,
  "details": $details_json
}
EOF
