#!/bin/bash
# msgbus-rotate.sh - Archive old Nexus message bus events
#
# Archives events older than RETENTION_DAYS from jobs.db to a dated JSONL file,
# then deletes them from the database to prevent unbounded growth.
#
# Usage:
#   ./msgbus-rotate.sh              # Dry run - show what would be archived
#   ./msgbus-rotate.sh --execute    # Archive and delete old events
#   ./msgbus-rotate.sh --days 120   # Custom retention (default: 120)
#
# Archive location: .claude/jobs/state/archive/msgbus-archive-YYYY-MM.jsonl
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
JOBSDB="$SCRIPT_DIR/nexusdb.py"
DB_PATH="$JOBS_DIR/state/jobs.db"
ARCHIVE_DIR="$JOBS_DIR/state/archive"
LOG_FILE="$JOBS_DIR/logs/msgbus-rotate.log"

RETENTION_DAYS=120
DRY_RUN=true

# ============================================================================
# Logging
# ============================================================================

log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] $*"
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$ts] $*" >> "$LOG_FILE"
}

# ============================================================================
# Helpers
# ============================================================================

_db() {
    python3 "$JOBSDB" "$@"
}

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --execute)
            DRY_RUN=false
            shift
            ;;
        --days)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--execute] [--days N]"
            echo ""
            echo "Options:"
            echo "  --execute    Archive and delete old events (default is dry run)"
            echo "  --days N     Retention period in days (default: 120)"
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# ============================================================================
# Main
# ============================================================================

log "=== Message Bus Rotation ==="
log "Retention: $RETENTION_DAYS days"
log "Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'EXECUTE')"

if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Calculate cutoff timestamp
CUTOFF=$(date -u -v"-${RETENTION_DAYS}d" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-${RETENTION_DAYS} days" +%Y-%m-%dT%H:%M:%SZ)
log "Cutoff: $CUTOFF"

# Count events to archive
ARCHIVE_COUNT=$(_db exec-scalar \
    "SELECT COUNT(*) FROM events WHERE created_at < ?" "$CUTOFF")

TOTAL_COUNT=$(_db exec-scalar "SELECT COUNT(*) FROM events")

log "Total events: $TOTAL_COUNT"
log "Events to archive (older than ${RETENTION_DAYS}d): $ARCHIVE_COUNT"

if [ "$ARCHIVE_COUNT" -eq 0 ]; then
    log "Nothing to archive — no events older than ${RETENTION_DAYS} days"
    exit 0
fi

if [ "$DRY_RUN" = true ]; then
    log "DRY RUN — no changes made. Run with --execute to archive."
    exit 0
fi

# ============================================================================
# Execute archival
# ============================================================================

mkdir -p "$ARCHIVE_DIR"
ARCHIVE_FILE="$ARCHIVE_DIR/msgbus-archive-$(date '+%Y-%m').jsonl"

log "Archiving to: $ARCHIVE_FILE"

# Export old events as JSONL (one JSON object per line)
python3 "$JOBSDB" exec \
    "SELECT id, event_type, source, actor, severity, parent_id, thread_id, status, data, created_at, deliver_after, expires_at FROM events WHERE created_at < ? ORDER BY id" \
    "$CUTOFF" >> "$ARCHIVE_FILE"

# Verify archive was written
ARCHIVED_LINES=0
if [ -f "$ARCHIVE_FILE" ]; then
    ARCHIVED_LINES=$(wc -l < "$ARCHIVE_FILE")
fi

if [ "$ARCHIVED_LINES" -lt "$ARCHIVE_COUNT" ]; then
    log "WARNING: Expected $ARCHIVE_COUNT lines in archive but found $ARCHIVED_LINES — skipping delete"
    exit 1
fi

log "Archive written: $ARCHIVED_LINES events"

# Delete archived events from database
_db exec "DELETE FROM events WHERE created_at < ?" "$CUTOFF"

REMAINING=$(_db exec-scalar "SELECT COUNT(*) FROM events")
DELETED=$((TOTAL_COUNT - REMAINING))

log "Deleted $DELETED events from database"
log "Remaining: $REMAINING events"
log "Done."
