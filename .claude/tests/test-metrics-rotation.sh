#!/usr/bin/env bash
# test-metrics-rotation.sh — Verify compression metrics rotation logic
#
# Generates 100 sample metric lines, inflates the file past 1MB,
# then runs housekeep.sh Phase 8 and verifies rotation occurred.
#
# Usage: test-metrics-rotation.sh [--keep]
#   --keep  Don't clean up test artifacts after run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${JARVIS_PROJECT_DIR:-$HOME/Claude/Jarvis}"
METRICS_DIR="$PROJECT_DIR/.claude/metrics/token-compression"
METRICS_FILE="$METRICS_DIR/session-metrics.jsonl"
ARCHIVE_DIR="$METRICS_DIR/archive"
SUMMARY_FILE="$METRICS_DIR/daily-summary.json"
HOUSEKEEP="$PROJECT_DIR/.claude/scripts/housekeep.sh"

KEEP=false
if [[ "${1:-}" == "--keep" ]]; then
    KEEP=true
fi

# --- Colors ---
C_GREEN=$'\e[32m'
C_RED=$'\e[31m'
C_RESET=$'\e[0m'
C_BOLD=$'\e[1m'

pass() { echo "${C_GREEN}  PASS${C_RESET} $1"; }
fail() { echo "${C_RED}  FAIL${C_RESET} $1"; FAILED=$((FAILED + 1)); }

FAILED=0

echo "${C_BOLD}test-metrics-rotation.sh${C_RESET}"
echo "────────────────────────────────────────"

# --- Setup: back up real metrics file ---
BACKUP=""
if [[ -f "$METRICS_FILE" ]]; then
    BACKUP=$(mktemp)
    cp "$METRICS_FILE" "$BACKUP"
    echo "  Backed up existing session-metrics.jsonl"
fi

# --- Setup: ensure dirs exist ---
mkdir -p "$ARCHIVE_DIR"

# --- Generate 100 sample metric lines ---
echo "Generating 100 sample metric lines..."
> "$METRICS_FILE"
for i in $(seq 1 100); do
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "{\"timestamp\":\"$ts\",\"session_id\":\"test-session-$(printf '%03d' $i)\",\"compression_mode\":\"medium\",\"input_tokens\":$((40000 + RANDOM % 10000)),\"output_tokens\":$((3000 + RANDOM % 2000)),\"cache_creation_tokens\":$((180000 + RANDOM % 50000)),\"cache_read_tokens\":$((280000 + RANDOM % 50000)),\"estimated_cost_usd\":$(echo "scale=4; ($(( RANDOM % 100 )) + 50) / 100" | bc),\"savings_pct\":$((30 + RANDOM % 40))}" >> "$METRICS_FILE"
done

line_count=$(wc -l < "$METRICS_FILE" | tr -d ' ')
echo "  Generated $line_count lines"

# Test 1: File has 100 lines
if [[ "$line_count" -eq 100 ]]; then
    pass "100 sample lines generated"
else
    fail "Expected 100 lines, got $line_count"
fi

# --- Inflate file past 1MB for rotation test ---
# Repeat the 100 lines ~12 times to exceed 1MB
echo "Inflating file past 1MB for rotation test..."
original_content=$(cat "$METRICS_FILE")
for i in $(seq 1 11); do
    echo "$original_content" >> "$METRICS_FILE"
done
file_size=$(stat -f %z "$METRICS_FILE" 2>/dev/null || wc -c < "$METRICS_FILE")
echo "  File size: $file_size bytes ($(( file_size / 1024 ))KB)"

# Test 2: File is >1MB
if [[ "$file_size" -gt 1048576 ]]; then
    pass "File exceeds 1MB threshold ($(( file_size / 1024 ))KB)"
else
    fail "File not large enough to trigger rotation: $file_size bytes"
fi

# --- Run housekeep Phase 8 (metrics rotation) ---
echo "Running housekeep.sh --phase 8..."
if bash "$HOUSEKEEP" --phase 8 2>/dev/null; then
    pass "housekeep.sh --phase 8 exited cleanly"
else
    fail "housekeep.sh --phase 8 failed with exit code $?"
fi

# Test 3: session-metrics.jsonl was cleared (rotation occurred)
if [[ -f "$METRICS_FILE" ]]; then
    new_size=$(stat -f %z "$METRICS_FILE" 2>/dev/null || echo 1)
    if [[ "$new_size" -eq 0 ]]; then
        pass "session-metrics.jsonl cleared after rotation"
    else
        fail "session-metrics.jsonl not cleared (size: $new_size)"
    fi
else
    fail "session-metrics.jsonl missing after rotation"
fi

# Test 4: Archive file created
today=$(date +%Y-%m-%d)
archive_pattern="$ARCHIVE_DIR/session-metrics-${today}.jsonl.gz"
if ls "$archive_pattern" 2>/dev/null | grep -q .; then
    pass "Archive file created: session-metrics-${today}.jsonl.gz"
else
    fail "Archive file not found: $archive_pattern"
fi

# Test 5: Archive is valid gzip
archive_file=$(ls "$archive_pattern" 2>/dev/null | head -1)
if [[ -n "$archive_file" ]] && gzip -t "$archive_file" 2>/dev/null; then
    pass "Archive is valid gzip"
else
    fail "Archive is not valid gzip or missing"
fi

# Test 6: daily-summary.json updated
if [[ -f "$SUMMARY_FILE" ]]; then
    last_updated=$(python3 -c "import json; d=json.load(open('$SUMMARY_FILE')); print(d.get('last_updated','null'))" 2>/dev/null || echo "null")
    if [[ "$last_updated" != "null" ]]; then
        pass "daily-summary.json updated (last_updated: $last_updated)"
    else
        fail "daily-summary.json not updated"
    fi
else
    fail "daily-summary.json missing"
fi

# Test 7: dry-run doesn't modify file
echo "Testing dry-run mode..."
echo '{"test":"dry-run-marker"}' >> "$METRICS_FILE"
size_before=$(stat -f %z "$METRICS_FILE" 2>/dev/null || echo 0)
bash "$HOUSEKEEP" --phase 8 --dry-run > /dev/null 2>&1 || true
size_after=$(stat -f %z "$METRICS_FILE" 2>/dev/null || echo 0)
if [[ "$size_before" -eq "$size_after" ]]; then
    pass "dry-run mode does not modify files"
else
    fail "dry-run modified session-metrics.jsonl (before: $size_before, after: $size_after)"
fi

# --- Cleanup ---
echo "────────────────────────────────────────"
if [[ "$KEEP" != "true" ]]; then
    # Restore backup
    if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then
        cp "$BACKUP" "$METRICS_FILE"
        rm -f "$BACKUP"
        echo "  Restored original session-metrics.jsonl"
    else
        > "$METRICS_FILE"
        echo "  Cleared test data from session-metrics.jsonl"
    fi
    # Remove test archive files
    if ls "$ARCHIVE_DIR"/session-metrics-*.jsonl.gz 2>/dev/null | grep -q .; then
        rm -f "$ARCHIVE_DIR"/session-metrics-*.jsonl.gz
        echo "  Cleaned test archive files"
    fi
else
    echo "  --keep: preserving test artifacts"
fi

# --- Results ---
total=7
passed=$(( total - FAILED ))
echo ""
if [[ "$FAILED" -eq 0 ]]; then
    echo "${C_GREEN}${C_BOLD}All $total tests passed${C_RESET}"
    exit 0
else
    echo "${C_RED}${C_BOLD}$FAILED/$total tests failed${C_RESET}"
    exit 1
fi
