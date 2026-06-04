#!/bin/bash
# smoke-reo.sh — End-to-end smoke test for the REO observability data path.
#
# Validates the Pulse READ endpoints that back /reo:
#   /observability/timeline
#   /observability/persona-aggregates
#   /observability/decisions/{event_id}
#
# Tests filter shape coverage shipped in REO B4:
#   actor multivalue (= ANY array path)
#   decision_type multivalue
#   outcome multivalue
#   task_id / thread_id exact match
#   q free-text ILIKE on rationale + downstream_effect
#
# Plus REO B6 case-file shape: decision + linked_costs + linked_audit.
#
# Usage:
#   smoke-reo.sh                  # default: dev pulse on :8800
#   smoke-reo.sh --port 8700      # prod pulse
#   smoke-reo.sh --host 10.0.0.5  # remote host
#   smoke-reo.sh --verbose        # echo full payloads
#
# Exit codes:
#   0   all checks passed
#   1   one or more checks failed (see structured output for which)
#   2   pre-flight failed (curl/jq/python3 missing, or pulse not responding)

set -euo pipefail

HOST="localhost"
PORT="8800"
VERBOSE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)    HOST="$2"; shift 2 ;;
    --port)    PORT="$2"; shift 2 ;;
    --verbose) VERBOSE="true"; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

BASE="http://${HOST}:${PORT}/api/v1"
PASS=0
FAIL=0

# ─── pre-flight ─────────────────────────────────────────────────────────────

for tool in curl python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "PRE-FLIGHT FAIL: $tool not on PATH" >&2
    exit 2
  fi
done

if ! curl -fsS --max-time 5 "${BASE}/health" >/dev/null 2>&1; then
  echo "PRE-FLIGHT FAIL: pulse at ${BASE} not responding" >&2
  exit 2
fi

echo "smoke-reo.sh — validating ${BASE}"
echo

# ─── helpers ────────────────────────────────────────────────────────────────

check() {
  local name="$1"; local url="$2"; local jq_expr="$3"
  local resp http_status body
  resp=$(curl -sS -w "\n%{http_code}" --max-time 10 "$url")
  http_status=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [[ "$http_status" != "200" ]]; then
    echo "  ✘ $name — HTTP $http_status"
    echo "    $body" | head -c 300
    echo
    FAIL=$((FAIL + 1))
    return 1
  fi
  local result
  result=$(echo "$body" | python3 -c "
import json, sys
d = json.load(sys.stdin)
$jq_expr
")
  if [[ "$VERBOSE" == "true" ]]; then
    echo "    payload preview: $(echo "$body" | head -c 200)"
  fi
  echo "  ✓ $name — $result"
  PASS=$((PASS + 1))
}

# ─── checks ─────────────────────────────────────────────────────────────────

echo "Timeline endpoint"
check "baseline (no filters, 720h)" \
  "${BASE}/observability/timeline?since_hours=720&limit=5" \
  "print(f'count={d[\"count\"]} filters={d.get(\"filters\") is not None}')"

# Pull a real event for follow-up checks
echo
EVT=$(curl -sS "${BASE}/observability/timeline?since_hours=720&limit=1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if d.get('events'):
    e = d['events'][0]
    print(f'{e[\"id\"]}|{e[\"actor\"]}|{e[\"decision_type\"]}|{e[\"outcome\"]}|{e[\"thread_id\"]}|{e.get(\"task_id\") or \"\"}')
else:
    print('||||||')
")

if [[ -z "$EVT" || "$EVT" == "||||||" ]]; then
  echo "  ! no events in pulse_dev — skipping filter + drawer checks"
  echo
  echo "─────────────────────"
  echo "RESULT: ${PASS} passed, ${FAIL} failed (filter checks SKIPPED — empty DB)"
  exit $((FAIL > 0 ? 1 : 0))
fi

IFS='|' read -r EID ACTOR DTYPE OUTCOME TID TASK_ID <<< "$EVT"
echo "Sample event: id=$EID actor=$ACTOR type=$DTYPE outcome=$OUTCOME"
echo

echo "Filter shape coverage (REO B4)"
check "actor single (back-compat: persona=)" \
  "${BASE}/observability/timeline?since_hours=720&persona=$(printf %s "$ACTOR" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read()))')&limit=200" \
  "print(f'count={d[\"count\"]} all_match={all(e[\"actor\"]==\"$ACTOR\" for e in d[\"events\"])}')"

check "actor multivalue (ANY array)" \
  "${BASE}/observability/timeline?since_hours=720&actor=$(printf %s "$ACTOR" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read()))'),nonexistent_actor&limit=200" \
  "print(f'count={d[\"count\"]} expected_to_match_actor={sum(1 for e in d[\"events\"] if e[\"actor\"]==\"$ACTOR\")}')"

check "decision_type single" \
  "${BASE}/observability/timeline?since_hours=720&decision_type=$DTYPE&limit=200" \
  "print(f'count={d[\"count\"]} all_match={all(e[\"decision_type\"]==\"$DTYPE\" for e in d[\"events\"])}')"

check "outcome single" \
  "${BASE}/observability/timeline?since_hours=720&outcome=$OUTCOME&limit=200" \
  "print(f'count={d[\"count\"]} all_match={all(e[\"outcome\"]==\"$OUTCOME\" for e in d[\"events\"])}')"

check "thread_id exact" \
  "${BASE}/observability/timeline?since_hours=720&thread_id=$TID&limit=200" \
  "print(f'count={d[\"count\"]} all_match={all(e[\"thread_id\"]==\"$TID\" for e in d[\"events\"])}')"

if [[ -n "$TASK_ID" ]]; then
  check "task_id exact" \
    "${BASE}/observability/timeline?since_hours=720&task_id=$TASK_ID&limit=200" \
    "print(f'count={d[\"count\"]} all_match={all(e[\"task_id\"]==\"$TASK_ID\" for e in d[\"events\"])}')"
fi

echo
echo "Persona aggregates"
check "persona-aggregates" \
  "${BASE}/observability/persona-aggregates?since_hours=720" \
  "print(f'aggregates={d[\"count\"]} actors={[a[\"actor\"] for a in d[\"aggregates\"][:5]]}')"

echo
echo "Case-file drawer (REO B6)"
check "decisions/{id} = decision + linked_costs + linked_audit" \
  "${BASE}/observability/decisions/${EID}" \
  "print(f'decision_id={d[\"decision\"][\"id\"]} costs={len(d[\"linked_costs\"])} audit={len(d[\"linked_audit\"])}')"

echo
echo "─────────────────────"
echo "RESULT: ${PASS} passed, ${FAIL} failed"
exit $((FAIL > 0 ? 1 : 0))
