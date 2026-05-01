#!/usr/bin/env bash
# setup-metrics.sh — Initialize token compression metrics directory structure
#
# Usage: setup-metrics.sh [--dry-run]
#
# Creates:
#   .claude/metrics/token-compression/
#   .claude/metrics/token-compression/archive/
#   .claude/metrics/token-compression/session-metrics.jsonl
#   .claude/metrics/token-compression/daily-summary.json

set -euo pipefail

PROJECT_DIR="${JARVIS_PROJECT_DIR:-$HOME/Claude/Jarvis}"
METRICS_DIR="$PROJECT_DIR/.claude/metrics/token-compression"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "[dry-run] Would initialize metrics structure at: $METRICS_DIR"
fi

run() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[dry-run] $*"
    else
        "$@"
    fi
}

echo "Setting up token compression metrics..."

# Create directories
run mkdir -p "$METRICS_DIR/archive"
echo "  ✓ $METRICS_DIR/archive/"

# Initialize session-metrics.jsonl (primary metrics file)
if [[ ! -f "$METRICS_DIR/session-metrics.jsonl" ]] || [[ "$DRY_RUN" == "true" ]]; then
    if [[ "$DRY_RUN" != "true" ]]; then
        touch "$METRICS_DIR/session-metrics.jsonl"
    fi
    echo "  ✓ session-metrics.jsonl (created)"
else
    echo "  · session-metrics.jsonl (already exists)"
fi

# Initialize daily-summary.json
if [[ ! -f "$METRICS_DIR/daily-summary.json" ]] || [[ "$DRY_RUN" == "true" ]]; then
    if [[ "$DRY_RUN" != "true" ]]; then
        cat > "$METRICS_DIR/daily-summary.json" <<'SUMMARY_EOF'
{
  "last_updated": null,
  "rotations": [],
  "total_sessions_logged": 0,
  "total_lines_archived": 0
}
SUMMARY_EOF
    fi
    echo "  ✓ daily-summary.json (created)"
else
    echo "  · daily-summary.json (already exists)"
fi

echo "Done. Metrics structure ready at: $METRICS_DIR"
