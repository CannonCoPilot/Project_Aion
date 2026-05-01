#!/bin/sh
# benchmark-harness.sh — Token Compression Benchmark Harness
# Replays existing Claude Code session JSONL files and compares token usage
# across JICM compression modes.
#
# Usage: benchmark-harness.sh [OPTIONS]
#
# Options:
#   --compression <mode>   Mode(s) to benchmark: none|light|medium|heavy|all (default: all)
#   --runs <N>             Sessions to analyze per mode (default: 3)
#   --session-dir <path>   Directory containing session JSONL files
#   --output <path>        Path to write benchmark-results.jsonl
#   --baseline <mode>      Mode to use as comparison baseline (default: none)
#   --help                 Show this help and exit
#
# Version: 1.0.0

set -e

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JARVIS_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

COMPRESSION="all"
RUNS=3
SESSION_DIR="${HOME}/.claude/projects/-Users-nathanielcannon-Claude-Jarvis"
OUTPUT="${JARVIS_ROOT}/.claude/metrics/token-compression/benchmark-results.jsonl"
BASELINE="none"
HARNESS_VERSION="1.0.0"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        --compression)
            COMPRESSION="$2"; shift 2;;
        --runs)
            RUNS="$2"; shift 2;;
        --session-dir)
            SESSION_DIR="$2"; shift 2;;
        --output)
            OUTPUT="$2"; shift 2;;
        --baseline)
            BASELINE="$2"; shift 2;;
        --help)
            sed -n '/^# Usage/,/^# Version/p' "$0"
            exit 0;;
        *)
            echo "[harness] Unknown option: $1" >&2
            exit 1;;
    esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

EXTRACTOR="${SCRIPT_DIR}/token-extractor.py"
if [ ! -f "${EXTRACTOR}" ]; then
    echo "[harness] ERROR: token-extractor.py not found at ${EXTRACTOR}" >&2
    exit 1
fi

if [ ! -d "${SESSION_DIR}" ]; then
    echo "[harness] WARNING: session directory not found: ${SESSION_DIR}"
    echo "[harness] No sessions to analyze. Exiting cleanly."
    exit 0
fi

OUTPUT_DIR="$(dirname "${OUTPUT}")"
mkdir -p "${OUTPUT_DIR}"

# ---------------------------------------------------------------------------
# Collect JSONL files
# ---------------------------------------------------------------------------

log() { echo "[harness] $*" >&2; }

log "Scanning session directory: ${SESSION_DIR}"

# Collect all .jsonl files (top-level and one level deep inside UUID subdirs)
TMPFILE_ALL=$(mktemp /tmp/harness-all-XXXXXX.txt)
find "${SESSION_DIR}" -maxdepth 2 -name "*.jsonl" 2>/dev/null | sort > "${TMPFILE_ALL}"

TOTAL_FILES=$(wc -l < "${TMPFILE_ALL}" | tr -d ' ')
log "Found ${TOTAL_FILES} JSONL file(s)"

if [ "${TOTAL_FILES}" -eq 0 ]; then
    echo "[harness] No JSONL session files found. Exiting cleanly."
    rm -f "${TMPFILE_ALL}"
    exit 0
fi

# ---------------------------------------------------------------------------
# Classify a single file by compression mode using cache_ratio
# Returns the mode name via stdout or "unknown"
# ---------------------------------------------------------------------------

classify_file() {
    local filepath="$1"
    local result
    result=$(python3 "${EXTRACTOR}" "${filepath}" --format json 2>/dev/null) || true

    if [ -z "${result}" ]; then
        echo "unknown"
        return
    fi

    # Extract avg_cache_ratio from summary (or first session cache_ratio)
    local ratio
    ratio=$(echo "${result}" | python3 -c "
import sys, json, math
try:
    d = json.load(sys.stdin)
    sessions = d.get('sessions', [])
    if sessions:
        cr = sessions[0].get('cache_ratio', -1)
    else:
        cr = d.get('summary', {}).get('avg_cache_ratio', -1)
    if cr < 0:
        print('unknown')
    elif cr < 20:
        print('none')
    elif cr < 40:
        print('light')
    elif cr < 65:
        print('medium')
    else:
        print('heavy')
except Exception:
    print('unknown')
" 2>/dev/null) || ratio="unknown"

    echo "${ratio}"
}

# ---------------------------------------------------------------------------
# Determine which modes to benchmark
# ---------------------------------------------------------------------------

if [ "${COMPRESSION}" = "all" ]; then
    MODES="none light medium heavy"
else
    MODES="${COMPRESSION}"
fi

# ---------------------------------------------------------------------------
# Temporary storage for per-mode metric accumulation
# ---------------------------------------------------------------------------

TMPDIR_MODES=$(mktemp -d /tmp/harness-modes-XXXXXX)

# Initialize mode buckets
for mode in none light medium heavy; do
    mkdir -p "${TMPDIR_MODES}/${mode}"
done

# ---------------------------------------------------------------------------
# Classify all files and bucket them
# ---------------------------------------------------------------------------

log "Classifying sessions by compression mode..."

while IFS= read -r filepath; do
    mode=$(classify_file "${filepath}")
    if [ "${mode}" = "unknown" ]; then
        continue
    fi
    echo "${filepath}" >> "${TMPDIR_MODES}/${mode}/files.txt"
done < "${TMPFILE_ALL}"
rm -f "${TMPFILE_ALL}"

# Report how many sessions per mode
for mode in none light medium heavy; do
    count=0
    if [ -f "${TMPDIR_MODES}/${mode}/files.txt" ]; then
        count=$(wc -l < "${TMPDIR_MODES}/${mode}/files.txt" | tr -d ' ')
    fi
    log "  ${mode}: ${count} session(s) found"
done

# ---------------------------------------------------------------------------
# Run benchmark per requested mode
# ---------------------------------------------------------------------------

RUN_ID="bench-$(date +%Y%m%d-%H%M%S)-$(od -An -N2 -tu2 /dev/urandom | tr -d ' ' | head -c 3)"
BENCH_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Collect mode results for table display
RESULT_NONE=""
RESULT_LIGHT=""
RESULT_MEDIUM=""
RESULT_HEAVY=""

process_mode() {
    local mode="$1"
    local bucket_file="${TMPDIR_MODES}/${mode}/files.txt"

    if [ ! -f "${bucket_file}" ]; then
        log "  [${mode}] No sessions found for this mode — skipping"
        return
    fi

    local file_count
    file_count=$(wc -l < "${bucket_file}" | tr -d ' ')
    local use_runs=${RUNS}
    if [ "${file_count}" -lt "${use_runs}" ]; then
        use_runs="${file_count}"
    fi

    log "  [${mode}] Processing ${use_runs} session(s) (of ${file_count} available)..."

    # Pick top N files
    local selected_files
    selected_files=$(head -n "${use_runs}" "${bucket_file}")

    # Aggregate metrics across selected sessions
    local agg_result
    agg_result=$(echo "${selected_files}" | python3 -c "
import sys, json, subprocess, math

files = [l.strip() for l in sys.stdin if l.strip()]
sessions_all = []

for fp in files:
    try:
        r = subprocess.run(
            ['python3', '${EXTRACTOR}', fp, '--format', 'json'],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode != 0:
            continue
        d = json.loads(r.stdout)
        sessions_all.extend(d.get('sessions', []))
    except Exception:
        pass

if not sessions_all:
    print(json.dumps({'error': 'no_sessions'}))
    sys.exit(0)

n = len(sessions_all)
total_input = sum(s.get('input_tokens_total', 0) for s in sessions_all)
total_output = sum(s.get('output_tokens_total', 0) for s in sessions_all)
total_cc = sum(s.get('cache_creation_tokens_total', 0) for s in sessions_all)
total_cr = sum(s.get('cache_read_tokens_total', 0) for s in sessions_all)
total_all = sum(s.get('total_tokens_all', 0) for s in sessions_all)
total_cost = sum(s.get('estimated_cost_usd', 0.0) for s in sessions_all)
cache_ratios = [s.get('cache_ratio', 0.0) for s in sessions_all]
avg_cr = sum(cache_ratios) / n if n > 0 else 0.0

out = {
    'session_count': n,
    'avg_input_tokens': round(total_input / n),
    'avg_output_tokens': round(total_output / n),
    'avg_cache_creation_tokens': round(total_cc / n),
    'avg_cache_read_tokens': round(total_cr / n),
    'avg_total_tokens': round(total_all / n),
    'avg_cache_ratio': round(avg_cr, 4),
    'avg_estimated_cost_usd': round(total_cost / n, 6),
}
print(json.dumps(out))
" 2>/dev/null) || agg_result='{"error":"aggregation_failed"}'

    # Check for error
    local has_error
    has_error=$(echo "${agg_result}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'error' in d else 'no')" 2>/dev/null) || has_error="yes"

    if [ "${has_error}" = "yes" ]; then
        log "  [${mode}] WARNING: aggregation failed — skipping"
        return
    fi

    # Write result entry to output JSONL
    echo "${agg_result}" | python3 -c "
import sys, json

d = json.load(sys.stdin)
entry = {
    'timestamp': '${BENCH_TIMESTAMP}',
    'run_id': '${RUN_ID}-${mode}',
    'compression_mode': '${mode}',
    'session_count': d['session_count'],
    'avg_input_tokens': d['avg_input_tokens'],
    'avg_output_tokens': d['avg_output_tokens'],
    'avg_cache_creation_tokens': d['avg_cache_creation_tokens'],
    'avg_cache_read_tokens': d['avg_cache_read_tokens'],
    'avg_total_tokens': d['avg_total_tokens'],
    'avg_cache_ratio': d['avg_cache_ratio'],
    'avg_estimated_cost_usd': d['avg_estimated_cost_usd'],
    'vs_baseline_pct': None,
    'harness_version': '${HARNESS_VERSION}',
}
print(json.dumps(entry))
" >> "${OUTPUT}"

    # Save summary metrics for table display
    echo "${agg_result}" > "${TMPDIR_MODES}/${mode}/result.json"
    log "  [${mode}] Done — avg total tokens: $(echo "${agg_result}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('avg_total_tokens',0))" 2>/dev/null)"
}

log "Running benchmark for modes: ${MODES}"
for mode in ${MODES}; do
    process_mode "${mode}"
done

# ---------------------------------------------------------------------------
# Compute vs_baseline percentages and write summary entry
# ---------------------------------------------------------------------------

BASELINE_TOTAL=""
if [ -f "${TMPDIR_MODES}/${BASELINE}/result.json" ]; then
    BASELINE_TOTAL=$(python3 -c "
import sys, json
d = json.load(open('${TMPDIR_MODES}/${BASELINE}/result.json'))
print(d.get('avg_total_tokens', 0))
" 2>/dev/null) || BASELINE_TOTAL=""
fi

# Rewrite last N entries to add vs_baseline_pct (append corrected entries)
# (For simplicity, we append a summary entry that includes per-mode comparisons)

python3 - << INNERPY
import json, os, math

modes = '${MODES}'.split()
baseline_mode = '${BASELINE}'
tmpdir = '${TMPDIR_MODES}'
output_path = '${OUTPUT}'
run_id = '${RUN_ID}'
bench_ts = '${BENCH_TIMESTAMP}'
version = '${HARNESS_VERSION}'

results = {}
for m in ['none', 'light', 'medium', 'heavy']:
    rpath = os.path.join(tmpdir, m, 'result.json')
    if os.path.exists(rpath):
        with open(rpath) as f:
            results[m] = json.load(f)

baseline_total = None
if baseline_mode in results:
    baseline_total = results[baseline_mode].get('avg_total_tokens')

per_mode = {}
for m, d in results.items():
    total = d.get('avg_total_tokens', 0)
    if baseline_total and baseline_total > 0:
        vs_pct = round((total - baseline_total) / baseline_total * 100, 2)
    else:
        vs_pct = None
    per_mode[m] = {
        'session_count': d.get('session_count', 0),
        'avg_total_tokens': total,
        'avg_cache_ratio': d.get('avg_cache_ratio', 0.0),
        'avg_estimated_cost_usd': d.get('avg_estimated_cost_usd', 0.0),
        'vs_baseline_pct': vs_pct,
    }

summary_entry = {
    'timestamp': bench_ts,
    'run_id': run_id + '-summary',
    'type': 'summary',
    'baseline_mode': baseline_mode,
    'harness_version': version,
    'modes': per_mode,
}

with open(output_path, 'a') as f:
    f.write(json.dumps(summary_entry) + '\n')

print(json.dumps(per_mode))
INNERPY

# ---------------------------------------------------------------------------
# Print formatted comparison table
# ---------------------------------------------------------------------------

python3 - << TABLEPRINT
import json, os

tmpdir = '${TMPDIR_MODES}'
baseline_mode = '${BASELINE}'

results = {}
for m in ['none', 'light', 'medium', 'heavy']:
    rpath = os.path.join(tmpdir, m, 'result.json')
    if os.path.exists(rpath):
        with open(rpath) as f:
            results[m] = json.load(f)

baseline_total = None
if baseline_mode in results:
    baseline_total = results[baseline_mode].get('avg_total_tokens')

print('')
print('Token Compression Benchmark Results')
print('====================================')
print('{:<10s} | {:>14s} | {:>12s} | {:>12s} | {:>6s}'.format(
    'Mode', 'Total Tokens', 'Cache Ratio', 'vs Baseline', 'Runs'))
print('{}-|-{}-|-{}-|-{}-|-{}'.format(
    '-'*10, '-'*14, '-'*12, '-'*12, '-'*6))

for m in ['none', 'light', 'medium', 'heavy']:
    if m not in results:
        continue
    d = results[m]
    total = d.get('avg_total_tokens', 0)
    ratio = d.get('avg_cache_ratio', 0.0)
    sessions = d.get('session_count', 0)

    if baseline_total and baseline_total > 0:
        vs_pct = (total - baseline_total) / baseline_total * 100
        if m == baseline_mode:
            vs_str = '(base)'
        else:
            vs_str = '{:+.1f}%'.format(vs_pct)
    else:
        vs_str = 'N/A'

    print('{:<10s} | {:>14s} | {:>11.1f}% | {:>12s} | {:>6d}'.format(
        m,
        '{:,}'.format(total),
        ratio,
        vs_str,
        sessions,
    ))

print('')
TABLEPRINT

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

rm -rf "${TMPDIR_MODES}"
log "Benchmark complete. Results written to: ${OUTPUT}"
