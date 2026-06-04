#!/usr/bin/env bash
# active-cleanup.sh — Remove stale sidecar files from .claude/jobs/active/
#
# Deletes any file in the active/ directory older than 60 minutes.
# Safe to run even if the directory is empty or doesn't exist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTIVE_DIR="$SCRIPT_DIR/active"

if [ ! -d "$ACTIVE_DIR" ]; then
    echo "active-cleanup: active/ directory not found: $ACTIVE_DIR" >&2
    exit 1
fi

# Find files older than 60 minutes
mapfile -t stale < <(find "$ACTIVE_DIR" -maxdepth 1 -type f -mmin +60 2>/dev/null)

if [ "${#stale[@]}" -eq 0 ]; then
    echo "active-cleanup: no stale sidecar files found"
    exit 0
fi

deleted=0
for f in "${stale[@]}"; do
    echo "active-cleanup: removing stale sidecar $(basename "$f") (age >60m)"
    rm -f "$f"
    deleted=$((deleted + 1))
done

echo "active-cleanup: removed $deleted stale sidecar file(s)"
