#!/usr/bin/env bash
# log-rotation.sh — Anti-Hyperthymesia for L1 Sensory Register (Phase 2B, Task 11)
#
# Retention policies:
#   - Diagnostic logs: cap at 5MB per file, rotate to .1 suffix, delete .1 > 7 days
#   - Checkpoint archives: delete after 7 days (ingested to RAG by auto-ingest)
#   - JSONL data logs (orchestration, selection-audit, etc.): cap at 2MB, rotate
#   - JSONL transcripts (~/.claude/projects/): NOT touched (raw L1 memory; read-only)
#
# Called by: housekeep.sh, session-start.sh (periodic), cron
# Memory System role:
#   Layer: L1 (Sensory Register)
#   Process: Store (anti-Hyperthymesia — pruning)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
ARCHIVE_DIR="$LOG_DIR/jicm/archive"
LOG="$LOG_DIR/log-rotation.log"

# Retention configuration
MAX_LOG_BYTES=$((5 * 1024 * 1024))        # 5MB per diagnostic log
MAX_JSONL_BYTES=$((2 * 1024 * 1024))      # 2MB per JSONL data log
ARCHIVE_RETAIN_DAYS=7                      # Checkpoint archives
OLD_ROTATED_DAYS=7                         # .1 rotated files

log() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $1" >> "$LOG"
}

# Rotate a single file if over size limit
rotate_if_large() {
    local file="$1" max_bytes="$2"
    [[ -f "$file" ]] || return 0
    local size
    size=$(wc -c < "$file" 2>/dev/null | tr -d ' ')
    if [[ "$size" -gt "$max_bytes" ]]; then
        mv "$file" "${file}.1"
        log "ROTATED: $file ($size bytes → .1)"
    fi
}

# Delete old rotated files
cleanup_rotated() {
    find "$LOG_DIR" -name "*.1" -mtime +"$OLD_ROTATED_DAYS" -exec rm -f {} \; 2>/dev/null
    local count
    count=$(find "$LOG_DIR" -name "*.1" -mtime +"$OLD_ROTATED_DAYS" 2>/dev/null | wc -l | tr -d ' ')
    [[ "$count" -gt 0 ]] && log "CLEANUP: removed $count old .1 files (>$OLD_ROTATED_DAYS days)"
}

# Delete old checkpoint archives (already ingested to RAG)
cleanup_archives() {
    [[ -d "$ARCHIVE_DIR" ]] || return 0
    local count
    count=$(find "$ARCHIVE_DIR" -name "compressed-*.md" -mtime +"$ARCHIVE_RETAIN_DAYS" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$count" -gt 0 ]]; then
        find "$ARCHIVE_DIR" -name "compressed-*.md" -mtime +"$ARCHIVE_RETAIN_DAYS" -exec rm -f {} \;
        log "ARCHIVES: removed $count checkpoint archives (>$ARCHIVE_RETAIN_DAYS days)"
    fi
}

# Main execution
log "START"

# Diagnostic logs (cap at 5MB)
for f in "$LOG_DIR"/debug.log "$LOG_DIR"/litellm.log "$LOG_DIR"/exit-guard-debug.log \
         "$LOG_DIR"/session-start-diagnostic.log "$LOG_DIR"/cost-anomaly-watcher.log \
         "$LOG_DIR"/ennoia-debug.log "$LOG_DIR"/jicm-watcher.log; do
    rotate_if_large "$f" "$MAX_LOG_BYTES"
done

# JSONL data logs (cap at 2MB)
for f in "$LOG_DIR"/orchestration-detections.jsonl "$LOG_DIR"/selection-audit.jsonl \
         "$LOG_DIR"/session-events.jsonl "$LOG_DIR"/agent-activity.jsonl \
         "$LOG_DIR"/context-window-metrics.jsonl "$LOG_DIR"/corrections.jsonl; do
    rotate_if_large "$f" "$MAX_JSONL_BYTES"
done

# Cleanup old rotated files and archives
cleanup_rotated
cleanup_archives

# Report
TOTAL_MB=$(du -sm "$LOG_DIR" 2>/dev/null | cut -f1)
log "DONE: $LOG_DIR = ${TOTAL_MB}MB total"
