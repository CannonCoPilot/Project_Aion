#!/usr/bin/env bash
# memory-consolidation.sh — L1→L4 Autonomic Consolidation (Phase 2B, Task 5)
#
# Two functions:
# 1. Insights-log rotation: cap at KEEP entries, archive + RAG-ingest older
# 2. Corrections consolidation: ingest corrections.jsonl to RAG with type metadata
#
# Called by: session-start.sh (on JICM clear), PreCompact hook
# Memory System role:
#   Layer: L1 (Sensory Register) → L4 (Long-Term Declarative)
#   Process: Curate (rotation/pruning) + Store (RAG ingestion)
#   Anti-Hyperthymesia: caps prevent unbounded growth

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
INSIGHTS_LOG="$PROJECT_DIR/.claude/context/insights/insights-log.md"
INSIGHTS_ARCHIVE_DIR="$PROJECT_DIR/.claude/context/archive/insights"
CORRECTIONS_JSONL="$PROJECT_DIR/.claude/logs/corrections.jsonl"
CORRECTIONS_INGESTED="$PROJECT_DIR/.claude/logs/.corrections-ingested-marker"
LOG="$PROJECT_DIR/.claude/logs/memory-consolidation.log"
INGEST_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-auto-ingest.py"
PYTHON="$PROJECT_DIR/infrastructure/.venv/bin/python"

# Configuration
INSIGHTS_KEEP=${INSIGHTS_KEEP:-200}        # Keep last N entries in active log
INSIGHTS_INGEST=${INSIGHTS_INGEST:-true}   # Ingest archived insights to RAG

mkdir -p "$INSIGHTS_ARCHIVE_DIR" "$(dirname "$LOG")"

log() {
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $1" >> "$LOG"
}

# ============================================================================
# 1. INSIGHTS-LOG ROTATION
# ============================================================================
rotate_insights() {
    [[ -f "$INSIGHTS_LOG" ]] || return 0

    # Count entries (### headers)
    local total
    total=$(grep -c '^### ' "$INSIGHTS_LOG" 2>/dev/null || echo 0)

    if [[ "$total" -le "$INSIGHTS_KEEP" ]]; then
        log "insights: OK ($total entries, under $INSIGHTS_KEEP cap)"
        return 0
    fi

    local to_archive=$((total - INSIGHTS_KEEP))
    log "insights: rotating $to_archive entries (total=$total, keep=$INSIGHTS_KEEP)"

    # Find the line number of the (to_archive+1)th ### header = start of kept content
    local keep_start_line
    keep_start_line=$(grep -n '^### ' "$INSIGHTS_LOG" | sed -n "$((to_archive + 1))p" | cut -d: -f1)

    if [[ -z "$keep_start_line" ]]; then
        log "insights: SKIP — could not find cut point"
        return 1
    fi

    # Archive the older entries
    local today archive_file
    today=$(date +%Y-%m-%d)
    archive_file="$INSIGHTS_ARCHIVE_DIR/insights-archive-${today}.md"

    {
        echo "# Insights Archive — $today"
        echo "# Rotated: $(date -u +%Y-%m-%dT%H:%M:%SZ) ($to_archive entries)"
        echo ""
        # Get header (lines 1 to first ### - 1), skip it for archive
        # Get entries from first ### to keep_start_line - 1
        local first_entry_line
        first_entry_line=$(grep -n '^### ' "$INSIGHTS_LOG" | head -1 | cut -d: -f1)
        sed -n "${first_entry_line},$((keep_start_line - 1))p" "$INSIGHTS_LOG"
    } >> "$archive_file"

    # Rewrite active log: header + kept entries
    local header_end_line
    header_end_line=$(grep -n '^---$' "$INSIGHTS_LOG" | head -1 | cut -d: -f1)
    [[ -z "$header_end_line" ]] && header_end_line=5

    local tmp="$INSIGHTS_LOG.rotate-tmp.$$"
    {
        sed -n "1,${header_end_line}p" "$INSIGHTS_LOG"
        echo ""
        sed -n "${keep_start_line},\$p" "$INSIGHTS_LOG"
    } > "$tmp" && mv "$tmp" "$INSIGHTS_LOG"

    local new_count
    new_count=$(grep -c '^### ' "$INSIGHTS_LOG" 2>/dev/null || echo 0)
    log "insights: ROTATED $total → $new_count entries (archived to $archive_file)"

    # Ingest archive to RAG if enabled and services available
    if [[ "$INSIGHTS_INGEST" == "true" ]] && [[ -x "$PYTHON" ]]; then
        (
            export PROJECT_DIR
            export JICM_COMPRESSED_FILE="$archive_file"
            export JICM_RAG_COLLECTION="jarvis-context"
            export JICM_RAG_DEDUP_THRESHOLD="0.95"
            export JICM_INGEST_LOG="$LOG"
            "$PYTHON" "$INGEST_SCRIPT" >> "$LOG" 2>&1
        ) &
        log "insights: RAG ingest launched for archive (PID $!)"
    fi
}

# ============================================================================
# 2. CORRECTIONS CONSOLIDATION
# ============================================================================
consolidate_corrections() {
    [[ -f "$CORRECTIONS_JSONL" ]] || return 0

    local total
    total=$(wc -l < "$CORRECTIONS_JSONL" | tr -d ' ')
    [[ "$total" -eq 0 ]] && return 0

    # Check how many we've already processed
    local already_processed=0
    if [[ -f "$CORRECTIONS_INGESTED" ]]; then
        already_processed=$(cat "$CORRECTIONS_INGESTED" | tr -d ' ')
    fi

    if [[ "$total" -le "$already_processed" ]]; then
        log "corrections: OK (no new entries, $total total)"
        return 0
    fi

    local new_count=$((total - already_processed))
    log "corrections: $new_count new corrections to consolidate"

    # Ingest the corrections file to RAG (research collection — corrections are learning data)
    if [[ -x "$PYTHON" ]]; then
        (
            export PROJECT_DIR
            export JICM_COMPRESSED_FILE="$CORRECTIONS_JSONL"
            export JICM_RAG_COLLECTION="jarvis-context"
            export JICM_RAG_DEDUP_THRESHOLD="0.90"
            export JICM_INGEST_LOG="$LOG"
            "$PYTHON" "$INGEST_SCRIPT" >> "$LOG" 2>&1
        ) &
        log "corrections: RAG ingest launched (PID $!)"
    fi

    # Update marker
    echo "$total" > "$CORRECTIONS_INGESTED"
}

# ============================================================================
# MAIN
# ============================================================================
rotate_insights
consolidate_corrections
