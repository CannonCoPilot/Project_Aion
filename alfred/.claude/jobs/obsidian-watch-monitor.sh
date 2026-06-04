#!/usr/bin/env bash
# obsidian-watch-monitor.sh — Detect Obsidian file changes, match against watch triggers
#
# Two-phase design:
#   Phase A (bash, zero LLM cost): checksum-based file change detection
#   Phase B (pipeline trigger): emit triggers for AI David evaluation on match
#
# Runs every 10 minutes via cron. NFS-mounted NAS means inotify won't work.
#
# Usage: obsidian-watch-monitor.sh
#
# Part of the Nexus system.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OBSIDIAN_ROOT="/mnt/synology_nas/Obsidian/Master"
STATE_DIR="$SCRIPT_DIR/state"
CHECKSUM_FILE="$STATE_DIR/obsidian-watch-checksums.json"
LOCK_FILE="$STATE_DIR/locks/obsidian-watch-monitor.lock"

# Source libraries
source "$SCRIPT_DIR/lib/common.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/watch-trigger-ops.sh" || { echo "ERROR: watch-trigger-ops.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/pulse-api.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/pulse-env.sh" || { echo "ERROR: pulse-env.sh not found" >&2; exit 1; }
source "$SCRIPT_DIR/lib/trigger-ops.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/label-ops.sh" 2>/dev/null || true

LOG_COMPONENT="obsidian-watch-monitor"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$LOG_COMPONENT] $1"
}

# ============================================================================
# Lock management
# ============================================================================

acquire_lock() {
    mkdir -p "$(dirname "$LOCK_FILE")"
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 1
        fi
        rm -f "$LOCK_FILE"
    fi
    echo $$ > "$LOCK_FILE"
    return 0
}

release_lock() {
    rm -f "$LOCK_FILE"
}

trap release_lock EXIT

# ============================================================================
# Phase A: Checksum-based change detection
# ============================================================================

if ! acquire_lock; then
    log "Another instance running, exiting"
    exit 0
fi

# Check NAS availability
if [ ! -d "$OBSIDIAN_ROOT" ]; then
    log "NAS not mounted at $OBSIDIAN_ROOT — skipping"
    exit 0
fi

# Fetch active watch triggers
TRIGGERS_JSON=$(wt_get_active "obsidian" || echo "[]")
TRIGGER_COUNT=$(echo "$TRIGGERS_JSON" | jq 'length' 2>/dev/null || echo "0")

if [ "$TRIGGER_COUNT" = "0" ]; then
    log "No active watch triggers — nothing to monitor"
    exit 0
fi

log "Monitoring $TRIGGER_COUNT active watch triggers"

# Collect all unique file patterns from active triggers
ALL_PATTERNS=$(echo "$TRIGGERS_JSON" | jq -r '.[].file_patterns[]?' 2>/dev/null | sort -u)

if [ -z "$ALL_PATTERNS" ]; then
    log "No file patterns defined on active triggers — nothing to watch"
    exit 0
fi

# Initialize checksums file if missing
mkdir -p "$STATE_DIR"
if [ ! -f "$CHECKSUM_FILE" ]; then
    echo '{}' > "$CHECKSUM_FILE"
fi

PREV_CHECKSUMS=$(cat "$CHECKSUM_FILE")
CHANGED_FILES=()

# Find matching files and compute checksums
while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    # Use find with -path to match glob patterns under OBSIDIAN_ROOT
    while IFS= read -r filepath; do
        [ -z "$filepath" ] && continue
        # Compute relative path for storage
        local_path="${filepath#$OBSIDIAN_ROOT/}"
        # Compute current checksum
        current_sum=$(sha256sum "$filepath" 2>/dev/null | cut -d' ' -f1 || echo "error")
        [ "$current_sum" = "error" ] && continue
        # Compare with stored checksum
        stored_sum=$(echo "$PREV_CHECKSUMS" | jq -r --arg p "$local_path" '.[$p] // "none"' 2>/dev/null)
        if [ "$current_sum" != "$stored_sum" ]; then
            CHANGED_FILES+=("$local_path")
            log "Changed: $local_path"
        fi
        # Update checksum in memory (will write at end)
        PREV_CHECKSUMS=$(echo "$PREV_CHECKSUMS" | jq --arg p "$local_path" --arg s "$current_sum" '.[$p] = $s')
    done < <(find "$OBSIDIAN_ROOT" -path "$OBSIDIAN_ROOT/$pattern" -type f 2>/dev/null)
done <<< "$ALL_PATTERNS"

# Save updated checksums
echo "$PREV_CHECKSUMS" > "$CHECKSUM_FILE"

if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
    log "No file changes detected"
    exit 0
fi

log "Detected ${#CHANGED_FILES[@]} changed files"

# ============================================================================
# Phase B: Match changes against triggers, emit pipeline triggers
# ============================================================================

# Build JSON array of changed files
CHANGED_JSON=$(printf '%s\n' "${CHANGED_FILES[@]}" | jq -R . | jq -s .)

# Ask Pulse which triggers match
MATCHES_JSON=$(wt_check_files "$CHANGED_JSON" || echo "[]")
MATCH_COUNT=$(echo "$MATCHES_JSON" | jq 'length' 2>/dev/null || echo "0")

if [ "$MATCH_COUNT" = "0" ]; then
    log "Changed files don't match any trigger patterns"
    exit 0
fi

log "Found $MATCH_COUNT trigger matches — emitting pipeline triggers"

# Emit pipeline trigger for each match (AI David will evaluate)
echo "$MATCHES_JSON" | jq -c '.[]' | while IFS= read -r match; do
    trigger_id=$(echo "$match" | jq -r '.trigger_id')
    task_id=$(echo "$match" | jq -r '.task_id')
    condition=$(echo "$match" | jq -r '.condition')
    matched_files=$(echo "$match" | jq -c '.matched_files')

    log "Emitting trigger for task $task_id (watch trigger $trigger_id)"

    # Emit pipeline trigger for AI David to evaluate.
    # Use curl directly since pulse_emit_trigger doesn't support handler param.
    # AI David reads the watch trigger details from the Pulse API using task_id.
    curl -sf -X POST "${PULSE_API_URL}/triggers/emit" \
        -H "Content-Type: application/json" \
        -H "X-Service-Token: ${PULSE_SERVICE_TOKEN:-}" \
        -d "{
            \"task_id\": \"${task_id}\",
            \"stage\": \"watch-trigger-evaluate\",
            \"source\": \"obsidian-watch-monitor\",
            \"handler\": \"ai-david\"
        }" 2>/dev/null || log "WARN: Failed to emit pipeline trigger for $task_id"

    # Append watch trigger context to task notes so AI David has the details
    pulse_update_task "$task_id" "{\"append_notes\": \"## Watch Trigger Match ($(date -u +%Y-%m-%dT%H:%M:%SZ))\\nTrigger ID: ${trigger_id}\\nChanged files: ${matched_files}\\nCondition: ${condition}\"}" \
        2>/dev/null || true
done

log "Done — $MATCH_COUNT pipeline triggers emitted for AI David evaluation"
