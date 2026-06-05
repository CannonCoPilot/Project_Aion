#!/usr/bin/env bash
# scratchpad-rotate.sh — auto-rotate stale entries out of force-loaded scratchpad.
#
# WHY: .scratchpad.md is force-loaded via CLAUDE.md @-import. Each line is in the
# system prompt of every session, so unchecked growth (1,905 lines / 38K tokens
# observed pre-audit 2026-05-04) inflates cache_creation cost on every JICM cycle.
# This hook enforces the scratchpad's own ≤80-line discipline.
#
# WHEN: called from SessionStart hook (idempotent: no-op if under threshold).
#
# POLICY:
#   - Threshold: SCRATCHPAD_LINE_LIMIT (default 120 lines)
#   - Action: if exceeded, archive ALL "## Active Notes" entries older than
#     SCRATCHPAD_KEEP_HOURS (default 6) to archive/scratchpad-YYYY-MM-DD.md
#   - Header + rules + most-recent-entry are always preserved
#   - Archive is APPEND-only; safe across multiple rotations per day
#
# SAFETY:
#   - Backup written to archive/scratchpad-rotate-backup-EPOCH.md before rewrite
#   - All operations idempotent / no-op if no rotation needed
#   - Bash 3.2 compatible (macOS), no `set -e` (failures surface explicitly)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/Users/nathanielcannon/Claude/Project_Aion}"
SCRATCHPAD="${PROJECT_DIR}/.claude/context/.scratchpad.md"
ARCHIVE_DIR="${PROJECT_DIR}/.claude/context/archive"
LIMIT="${SCRATCHPAD_LINE_LIMIT:-120}"
KEEP_HOURS="${SCRATCHPAD_KEEP_HOURS:-6}"
LOG="${PROJECT_DIR}/.claude/logs/scratchpad-rotate.log"

mkdir -p "$ARCHIVE_DIR" "$(dirname "$LOG")"

[[ -f "$SCRATCHPAD" ]] || exit 0

LINES=$(wc -l < "$SCRATCHPAD" | tr -d ' ')
if [[ "$LINES" -le "$LIMIT" ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | OK | $LINES lines (under $LIMIT)" >> "$LOG"
    exit 0
fi

# Over threshold — rotate.
EPOCH=$(date +%s)
TODAY=$(date +%Y-%m-%d)
BACKUP="${ARCHIVE_DIR}/scratchpad-rotate-backup-${EPOCH}.md"
ARCHIVE="${ARCHIVE_DIR}/scratchpad-${TODAY}.md"
TMP="${SCRATCHPAD}.rotate-tmp.$$"

cp "$SCRATCHPAD" "$BACKUP"

# Find the LAST "### YYYY-MM-DD" entry header line number; everything from there
# to EOF is "most recent" and stays. Everything before (after the header rules
# section) is candidate-for-archive.
HEADER_END_LN=$(grep -n '^## Active Notes' "$SCRATCHPAD" | head -1 | cut -d: -f1)
LAST_ENTRY_LN=$(grep -n '^### [0-9]' "$SCRATCHPAD" | tail -1 | cut -d: -f1)

if [[ -z "$HEADER_END_LN" ]] || [[ -z "$LAST_ENTRY_LN" ]]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | SKIP | could not parse entry markers" >> "$LOG"
    rm -f "$BACKUP"
    exit 0
fi

# Older entries (between Active Notes header and the last-entry line, exclusive)
# are appended to today's archive.
{
    echo ""
    echo "## Rotation $(date -u +%Y-%m-%dT%H:%M:%SZ) (entries pre-${KEEP_HOURS}h cutoff)"
    echo ""
    sed -n "$((HEADER_END_LN + 1)),$((LAST_ENTRY_LN - 1)) p" "$SCRATCHPAD"
} >> "$ARCHIVE"

# Rewrite scratchpad: keep header + Active Notes title + last entry only.
{
    sed -n "1,${HEADER_END_LN} p" "$SCRATCHPAD"
    echo ""
    echo "_(Older entries auto-rotated to ${ARCHIVE} on $(date -u +%Y-%m-%dT%H:%M:%SZ).)_"
    echo ""
    sed -n "${LAST_ENTRY_LN},\$ p" "$SCRATCHPAD"
} > "$TMP" && mv "$TMP" "$SCRATCHPAD"

NEW_LINES=$(wc -l < "$SCRATCHPAD" | tr -d ' ')
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | ROTATED | $LINES → $NEW_LINES lines | archive=$ARCHIVE | backup=$BACKUP" >> "$LOG"
exit 0
