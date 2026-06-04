#!/bin/bash
# Agent Session Cleanup Script
# Removes agent session logs older than 90 days
#
# Cron: 0 2 * * * ${PROJECT_DIR}/.claude/jobs/cleanup-agent-sessions.sh

# Configuration
REPO_DIR="${PROJECT_DIR}"
SESSION_DIR="${REPO_DIR}/.claude/agents/sessions"
RETENTION_DAYS=90
LOG_FILE="${REPO_DIR}/.claude/jobs/logs/cleanup-agent-sessions.log"
ERROR_LOG="${REPO_DIR}/.claude/jobs/logs/errors.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" "$ERROR_LOG"
}

# Start
log "=== Agent Session Cleanup Started ==="

# Safety check - verify session directory exists
if [ ! -d "$SESSION_DIR" ]; then
    error "Session directory not found: $SESSION_DIR"
    exit 1
fi

# Count files before cleanup
BEFORE_COUNT=$(find "$SESSION_DIR" -name "*.md" -type f | wc -l)
log "Current session logs: $BEFORE_COUNT"

# Find files to be deleted
FILES_TO_DELETE=$(find "$SESSION_DIR" -name "*.md" -type f -mtime +$RETENTION_DAYS)
DELETE_COUNT=$(echo "$FILES_TO_DELETE" | grep -c '.' 2>/dev/null || echo 0)

# Handle case where no files need cleanup
if [ "$DELETE_COUNT" -eq 0 ]; then
    log "No session logs older than $RETENTION_DAYS days found"
    log "=== Agent Session Cleanup Complete (No Action Needed) ==="
    exit 0
fi

log "Found $DELETE_COUNT session logs older than $RETENTION_DAYS days"

# List files to be deleted (first 10 for verification)
log "Sample of files to delete:"
echo "$FILES_TO_DELETE" | head -5 | while read -r file; do
    if [ -n "$file" ]; then
        FILENAME=$(basename "$file")
        FILEAGE=$(( ($(date +%s) - $(stat -c %Y "$file")) / 86400 ))
        log "  - $FILENAME (${FILEAGE} days old)"
    fi
done

# Delete old session logs
log "Deleting old session logs..."
find "$SESSION_DIR" -name "*.md" -type f -mtime +$RETENTION_DAYS -delete

# Verify deletion
AFTER_COUNT=$(find "$SESSION_DIR" -name "*.md" -type f | wc -l)
DELETED=$((BEFORE_COUNT - AFTER_COUNT))

log "Cleanup complete"
log "  Before: $BEFORE_COUNT session logs"
log "  Deleted: $DELETED session logs"
log "  Remaining: $AFTER_COUNT session logs"

# Alert if deletion count doesn't match expectation
if [ "$DELETED" -ne "$DELETE_COUNT" ]; then
    error "Expected to delete $DELETE_COUNT files but deleted $DELETED"
    log "This may indicate a problem - manual verification recommended"
fi

# Report disk space saved (approximate)
if [ "$DELETED" -gt 0 ]; then
    SPACE_SAVED=$(du -sh "$SESSION_DIR" 2>/dev/null | cut -f1)
    log "Current session directory size: $SPACE_SAVED"
fi

log "=== Agent Session Cleanup Complete ==="

exit 0
