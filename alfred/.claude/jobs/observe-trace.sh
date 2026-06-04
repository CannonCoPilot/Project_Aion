#!/usr/bin/env bash
# observe-trace.sh — CL-v2 Phase 1 Execution Trace Observer
#
# Called by executor.sh after each job completion (non-blocking, runs in background).
# Records execution traces to JSONL and performs lightweight pattern detection
# to surface instinct candidates.
#
# Usage: observe-trace.sh <job_name> <persona> <model> <engine> <exit_code> <duration_s> <cost_usd> <task_id> <task_labels> <severity>
# All args optional — gracefully handles missing values.
#
# Safety: NEVER errors out. All failures are logged and silently ignored.
# The executor must never be blocked by this script.

set -uo pipefail  # No -e: observer failure must not propagate

JOBS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTINCTS_DIR="$JOBS_DIR/instincts"
TRACES_FILE="$INSTINCTS_DIR/execution-traces.jsonl"
CANDIDATES_FILE="$INSTINCTS_DIR/candidates.jsonl"
LOCK_FILE="$INSTINCTS_DIR/.detect.lock"
LOG_FILE="$JOBS_DIR/logs/observe-trace.log"

# Minimum traces before pattern detection runs
DETECTION_THRESHOLD=20
# Minimum occurrences before a pattern becomes a candidate
CANDIDATE_MIN_SIGNALS=5

mkdir -p "$INSTINCTS_DIR/detected" "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] observe-trace: $*" >> "$LOG_FILE" 2>/dev/null || true; }

# Parse args (all positional, all optional)
JOB_NAME="${1:-unknown}"
PERSONA="${2:-}"
MODEL="${3:-unknown}"
ENGINE="${4:-claude-code}"
EXIT_CODE="${5:-0}"
DURATION_S="${6:-0}"
COST_USD="${7:-0}"
TASK_ID="${8:-}"
TASK_LABELS="${9:-}"     # space-separated label list
SEVERITY="${10:-info}"

SUCCESS="true"
[ "$EXIT_CODE" -ne 0 ] 2>/dev/null && SUCCESS="false"

TRACE_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))" 2>/dev/null || echo "$(date +%s)-$$")
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Step 1: Write execution trace record
LABELS_JSON=$(python3 -c "
import json, sys
labels = '$TASK_LABELS'.split() if '$TASK_LABELS'.strip() else []
print(json.dumps(labels))
" 2>/dev/null || echo "[]")

TRACE_RECORD=$(python3 -c "
import json
print(json.dumps({
    'trace_id': '$TRACE_ID',
    'timestamp': '$TIMESTAMP',
    'job_name': '$JOB_NAME',
    'persona': '$PERSONA' if '$PERSONA' else None,
    'model': '$MODEL',
    'engine': '$ENGINE',
    'exit_code': int('$EXIT_CODE') if '$EXIT_CODE'.isdigit() else 0,
    'duration_s': float('$DURATION_S') if '$DURATION_S'.replace('.','',1).isdigit() else 0,
    'cost_usd': float('$COST_USD') if '$COST_USD'.replace('.','',1).isdigit() else 0,
    'task_id': '$TASK_ID' if '$TASK_ID' else None,
    'task_labels': $LABELS_JSON,
    'severity': '$SEVERITY',
    'success': $SUCCESS
}))
" 2>/dev/null || true)

if [ -n "$TRACE_RECORD" ]; then
    echo "$TRACE_RECORD" >> "$TRACES_FILE" 2>/dev/null || true
    log "Trace recorded: $TRACE_ID ($JOB_NAME, success=$SUCCESS)"
else
    log "WARNING: Failed to serialize trace for $JOB_NAME — skipping"
    exit 0
fi

# Step 2: Count total traces — run pattern detection if threshold reached
TRACE_COUNT=$(wc -l < "$TRACES_FILE" 2>/dev/null || echo "0")
TRACE_COUNT="${TRACE_COUNT//[[:space:]]/}"

if [ "${TRACE_COUNT:-0}" -lt "$DETECTION_THRESHOLD" ]; then
    log "Trace count ${TRACE_COUNT} < threshold ${DETECTION_THRESHOLD} — skipping pattern detection"
    exit 0
fi

# Acquire lock for pattern detection (non-blocking — skip if another instance is running)
if ! (set -C; echo "$$" > "$LOCK_FILE") 2>/dev/null; then
    log "Pattern detection already running — skipping this cycle"
    exit 0
fi
trap 'rm -f "$LOCK_FILE"' EXIT

log "Running pattern detection (${TRACE_COUNT} traces in window)..."

# Step 3: Pattern detection — look for repeated label sequences and task type pairings
python3 - << PYEOF 2>/dev/null || log "WARNING: Pattern detection script failed"
import json, uuid
from pathlib import Path
from collections import Counter
from datetime import datetime

traces_file = Path("$TRACES_FILE")
candidates_file = Path("$CANDIDATES_FILE")
instincts_dir = Path("$INSTINCTS_DIR")

# Load all traces
traces = []
for line in traces_file.read_text().strip().splitlines():
    try:
        traces.append(json.loads(line))
    except Exception:
        pass

if len(traces) < $DETECTION_THRESHOLD:
    exit(0)

# Load existing candidates (to avoid duplicates)
existing_candidates = set()
if candidates_file.exists():
    for line in candidates_file.read_text().strip().splitlines():
        try:
            c = json.loads(line)
            k = c.get("raw_pattern", {})
            existing_candidates.add(json.dumps(k, sort_keys=True))
        except Exception:
            pass

new_candidates = []

# Pattern 1: label_sequence — job + sorted label combo appears frequently
label_seq_counter = Counter()
label_seq_examples = {}
for t in traces:
    if not t.get("task_labels") or not t.get("job_name"):
        continue
    # Filter to routing-relevant labels only
    relevant_labels = sorted([
        l for l in t["task_labels"]
        if any(l.startswith(p) for p in ["capability:", "domain:", "type:", "risk:", "persona:"])
    ])
    if len(relevant_labels) < 2:
        continue
    key = (t["job_name"], tuple(relevant_labels))
    label_seq_counter[key] += 1
    label_seq_examples.setdefault(key, [])
    if len(label_seq_examples[key]) < 5:
        label_seq_examples[key].append(t["trace_id"])

for (job_name, labels), count in label_seq_counter.items():
    if count < $CANDIDATE_MIN_SIGNALS:
        continue
    raw = {"labels": list(labels), "job_name": job_name}
    raw_key = json.dumps(raw, sort_keys=True)
    if raw_key in existing_candidates:
        continue
    new_candidates.append({
        "candidate_id": str(uuid.uuid4()),
        "detected_at": "$TIMESTAMP",
        "pattern_type": "label_sequence",
        "description": f"Job '{job_name}' repeatedly handles tasks with labels: {', '.join(labels)}",
        "signal_count": count,
        "examples": label_seq_examples[(job_name, labels)],
        "raw_pattern": raw,
        "confidence": min(count / 20.0, 1.0),
        "status": "new"
    })

# Pattern 2: failure_pattern — job fails repeatedly on tasks with specific labels
fail_label_counter = Counter()
fail_examples = {}
for t in traces:
    if t.get("success") or not t.get("task_labels") or not t.get("job_name"):
        continue
    relevant_labels = sorted([
        l for l in t["task_labels"]
        if any(l.startswith(p) for p in ["capability:", "type:", "risk:"])
    ])
    if not relevant_labels:
        continue
    key = (t["job_name"], tuple(relevant_labels))
    fail_label_counter[key] += 1
    fail_examples.setdefault(key, [])
    if len(fail_examples[key]) < 5:
        fail_examples[key].append(t["trace_id"])

for (job_name, labels), count in fail_label_counter.items():
    if count < $CANDIDATE_MIN_SIGNALS:
        continue
    raw = {"job_name": job_name, "labels": list(labels), "fail_count": count}
    raw_key = json.dumps(raw, sort_keys=True)
    if raw_key in existing_candidates:
        continue
    new_candidates.append({
        "candidate_id": str(uuid.uuid4()),
        "detected_at": "$TIMESTAMP",
        "pattern_type": "failure_pattern",
        "description": f"Job '{job_name}' fails repeatedly on tasks with: {', '.join(labels)}",
        "signal_count": count,
        "examples": fail_examples[(job_name, labels)],
        "raw_pattern": raw,
        "confidence": min(count / 10.0, 1.0),
        "status": "new"
    })

# Write new candidates
if new_candidates:
    with candidates_file.open("a") as f:
        for c in new_candidates:
            f.write(json.dumps(c) + "\n")
    print(f"Wrote {len(new_candidates)} new instinct candidates")
else:
    print("No new patterns detected above threshold")
PYEOF

log "Pattern detection complete"
exit 0
