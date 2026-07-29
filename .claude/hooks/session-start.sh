#!/bin/bash
# Session Start Hook - Self-Launch Protocol (AC-01)
# Fires on: startup, resume, clear, compact
# Output: JSON with systemMessage and additionalContext
#
# Features (PR-12.1):
# - Phase A: Greeting & Orientation (time-aware greeting)
# - Phase B: System Review (context loading, baseline check)
# - Phase C: User Briefing (status, autonomous initiation)
# - Checkpoint loading for context restoration
# - MCP suggestions based on work type
# - Auto-clear watcher launch
#
# JICM v7 Integration:
# - Context injection via additionalContext (hook → Claude)
# - v7.9 watcher handles all state transitions via .jicm-clear-now.signal + .jicm-resume-complete.signal
# - v7 prep script replaces LLM compression agent (0.03s vs 210s)
# - See: .claude/context/designs/jicm-v6-design.md
#
# Updated: 2026-02-11 (v6.1 — v5 code paths removed)

# Read input from stdin (JSON)
INPUT=$(cat)

# Source shared JICM config (defines all paths)
PROJECT_DIR="$CLAUDE_PROJECT_DIR"
JICM_CONFIG="$CLAUDE_PROJECT_DIR/.claude/scripts/jicm-config.sh"
# W0-safety: strip any ambient per-invocation overrides before sourcing config, so
# a stray operator `export JICM_COMPRESSED_FILE=...dev...` in the shell that started
# the tmux server can never silently redirect W0's checkpoint/telemetry. The dev
# actuator sets these command-scoped on its prep call only (jicm-prep-context.sh
# does NOT unset), so its legitimate override still works; the dev branch below
# uses literal .dev paths, not these vars.
unset JICM_COMPRESSED_FILE JICM_COMPRESSION_SIGNAL JICM_JSONL_PATH \
      JICM_METADATA_FILE JICM_METRICS_FILE JICM_JSONL_STATS
if [[ -f "$JICM_CONFIG" ]]; then
    source "$JICM_CONFIG"
fi

# Parse source from input
SOURCE=$(echo "$INPUT" | jq -r '.source // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOCAL_TIME=$(date +"%H:%M")
LOCAL_DATE=$(date +"%A, %B %d, %Y")
# Use %k to avoid leading zero (octal interpretation bug with %H)
HOUR=$(date +"%k" | tr -d ' ')

# Log to diagnostic file
LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/state/components"
mkdir -p "$LOG_DIR" "$STATE_DIR"
echo "$TIMESTAMP | SessionStart | source=$SOURCE | session=$SESSION_ID | local_time=$LOCAL_TIME" >> "$LOG_DIR/session-start-diagnostic.log"

# ============== PER-LANE SESSION UUID TRACKING ==============
# Each lane records its OWN live session UUID so the tmux launcher can resume the
# correct session (Claude Code keeps only one lastSessionId per project dir) and
# jicm-self.sh can checkpoint the right transcript. Dev lane = JARVIS_SESSION_ROLE
# =dev; W0 = JARVIS_WINDOW unset/0. Role check FIRST so the dev window (which may
# leave JARVIS_WINDOW unset) can no longer clobber W0's .current-w0-uuid.
if [[ "$JARVIS_LITE" != "true" ]] && [[ "$SESSION_ID" != "unknown" ]]; then
    # Precedence aligned to jicm_derive_key (window-first) so the two never drift: a
    # leaked JARVIS_SESSION_ROLE=dev in W0's env can't misfile W0's UUID under
    # .current-dev-uuid (which launch-aion.sh:resolve_dev_session reads to pick the dev
    # resume candidate — misfiling feeds cross-lane confusion back into the launcher).
    # `${JARVIS_WINDOW:-}` (no :-0 default) means a dev window that left JARVIS_WINDOW
    # unset still falls to the role arm, not the w0 arm.
    if [[ "${JARVIS_WINDOW:-}" == "0" ]]; then
        echo "$SESSION_ID" > "$CLAUDE_PROJECT_DIR/.claude/context/.current-w0-uuid"
        echo "$TIMESTAMP | SessionStart | W0 UUID tracked: $SESSION_ID (source=$SOURCE)" >> "$LOG_DIR/session-start-diagnostic.log"
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "dev" ]]; then
        echo "$SESSION_ID" > "$CLAUDE_PROJECT_DIR/.claude/context/.current-dev-uuid"
        echo "$TIMESTAMP | SessionStart | DEV UUID tracked: $SESSION_ID (source=$SOURCE)" >> "$LOG_DIR/session-start-diagnostic.log"
    elif [[ -z "${JARVIS_WINDOW:-}" ]]; then
        echo "$SESSION_ID" > "$CLAUDE_PROJECT_DIR/.claude/context/.current-w0-uuid"
        echo "$TIMESTAMP | SessionStart | W0 UUID tracked (unset-window recovery): $SESSION_ID (source=$SOURCE)" >> "$LOG_DIR/session-start-diagnostic.log"
    fi
fi

# ============== AUTONOMY CONFIG CHECK ==============
CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/config/autonomy-config.yaml"
SKIP_GREETING="false"
AUTO_CONTINUE="true"

# Check environment overrides
if [[ "$JARVIS_DISABLE_AC01" == "true" ]]; then
    echo "$TIMESTAMP | SessionStart | AC-01 disabled via environment" >> "$LOG_DIR/session-start-diagnostic.log"
    echo "{}"
    exit 0
fi

if [[ "$JARVIS_QUICK_MODE" == "true" ]]; then
    SKIP_GREETING="true"
fi

if [[ "$JARVIS_MANUAL_MODE" == "true" ]]; then
    AUTO_CONTINUE="false"
fi

# ============== STALE SIGNAL CLEANUP (MAINT-004 failsafe) ==============
# If .jicm-exit-mode.signal exists at session start, a prior end-session was
# interrupted. Remove it so JICM isn't permanently suppressed.
STALE_EXIT_SIGNAL="${JICM_EXIT_SIGNAL:-$CLAUDE_PROJECT_DIR/.claude/context/.jicm-exit-mode.signal}"
if [[ -f "$STALE_EXIT_SIGNAL" ]]; then
    rm -f "$STALE_EXIT_SIGNAL"
    echo "$TIMESTAMP | SessionStart | CLEANUP: Removed stale .jicm-exit-mode.signal from interrupted exit" >> "$LOG_DIR/session-start-diagnostic.log"
fi

# ============== PHASE A: TIME-OF-DAY GREETING ==============
# Determine greeting based on hour
if (( HOUR >= 5 && HOUR < 12 )); then
    TIME_OF_DAY="morning"
    GREETING="Good morning"
elif (( HOUR >= 12 && HOUR < 17 )); then
    TIME_OF_DAY="afternoon"
    GREETING="Good afternoon"
elif (( HOUR >= 17 && HOUR < 21 )); then
    TIME_OF_DAY="evening"
    GREETING="Good evening"
else
    TIME_OF_DAY="night"
    GREETING="Good evening"
fi

echo "$TIMESTAMP | SessionStart | time_of_day=$TIME_OF_DAY" >> "$LOG_DIR/session-start-diagnostic.log"

# ============== WEATHER INTEGRATION (evo-2026-01-017) ==============
# Fetch weather from wttr.in (no API key required)
# Default location: Salt Lake City (configurable via JARVIS_WEATHER_LOCATION)
WEATHER_INFO=""
WEATHER_LOCATION="${JARVIS_WEATHER_LOCATION:-Salt+Lake+City}"

if [[ "$SOURCE" == "startup" ]] && [[ "$JARVIS_DISABLE_WEATHER" != "true" ]]; then
    # Fetch weather data (timeout 3s to not block startup)
    WEATHER_JSON=$(curl -s --max-time 3 "wttr.in/${WEATHER_LOCATION}?format=j1" 2>/dev/null)

    if [[ -n "$WEATHER_JSON" ]] && echo "$WEATHER_JSON" | jq -e '.current_condition[0]' >/dev/null 2>&1; then
        # Parse weather data
        TEMP_F=$(echo "$WEATHER_JSON" | jq -r '.current_condition[0].temp_F // "?"')
        WEATHER_DESC=$(echo "$WEATHER_JSON" | jq -r '.current_condition[0].weatherDesc[0].value // "Unknown"')
        FEELS_LIKE=$(echo "$WEATHER_JSON" | jq -r '.current_condition[0].FeelsLikeF // "?"')
        HUMIDITY=$(echo "$WEATHER_JSON" | jq -r '.current_condition[0].humidity // "?"')

        # Build weather string
        WEATHER_INFO="${TEMP_F}°F (feels like ${FEELS_LIKE}°F), ${WEATHER_DESC}, ${HUMIDITY}% humidity"

        echo "$TIMESTAMP | SessionStart | Weather: $WEATHER_INFO" >> "$LOG_DIR/session-start-diagnostic.log"
    else
        echo "$TIMESTAMP | SessionStart | Weather: fetch failed or invalid response" >> "$LOG_DIR/session-start-diagnostic.log"
    fi
fi

# Clean up clear-pending marker from previous session
PENDING_FILE="$CLAUDE_PROJECT_DIR/.claude/context/.clear-pending"
if [[ -f "$PENDING_FILE" ]]; then
    rm -f "$PENDING_FILE"
    echo "$TIMESTAMP | SessionStart | Cleaned up .clear-pending marker" >> "$LOG_DIR/session-start-diagnostic.log"
fi

    # v5 debounce REMOVED (v6.1) — v7.9 state machine handles clear dedup via .jicm-clear-now.signal

# ============== JICM RESET (AC-04 Integration) ==============
# context-estimate.json write REMOVED (Tier 3+ cleanup) — no production code reads it.
# Watcher writes .watcher-status with live context percentage instead.
COMPACTION_FLAG="$CLAUDE_PROJECT_DIR/.claude/context/.compaction-in-progress"

if [[ "$SOURCE" == "startup" ]] || [[ "$SOURCE" == "clear" ]]; then
    # Clear compaction-in-progress flag if exists
    if [[ -f "$COMPACTION_FLAG" ]]; then
        rm -f "$COMPACTION_FLAG"
        echo "$TIMESTAMP | SessionStart | JICM: Cleared compaction-in-progress flag" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Clear compression-in-progress flag if exists (skill still writes this)
    COMPRESSION_FLAG="${JICM_COMPRESSION_GUARD:-$CLAUDE_PROJECT_DIR/.claude/context/.compression-in-progress}"
    if [[ -f "$COMPRESSION_FLAG" ]]; then
        rm -f "$COMPRESSION_FLAG"
        echo "$TIMESTAMP | SessionStart | JICM: Cleared compression-in-progress flag" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Clear exit-guard signal files if stale from previous session
    rm -f "$CLAUDE_PROJECT_DIR/.claude/context/.exit-guard-passed" 2>/dev/null
    rm -f "$CLAUDE_PROJECT_DIR/.claude/context/.exit-ceremony-done" 2>/dev/null

    # v5 idle-hands cleanup removed (v7 refurbishment) — nothing creates these files anymore
fi

# ============================================================================
# WATCHER LAUNCH DISABLED — Handled by launch-jarvis-tmux.sh (2026-02-05)
# ============================================================================
# Previously launched watcher here, but this caused duplicate watchers:
# 1. launch-jarvis-tmux.sh creates watcher window (primary)
# 2. session-start.sh hook fires ~simultaneously (race condition)
# 3. Both pass duplicate checks before either fully registers → 2 watchers
#
# Fix: Watcher is now ONLY launched by launch-jarvis-tmux.sh
# This hook focuses on context injection; tmux launcher handles process management
# ============================================================================
if [[ "$SOURCE" == "startup" ]] || [[ "$SOURCE" == "resume" ]]; then
    # Watcher launch removed - see comment above
    echo "$TIMESTAMP | SessionStart | Watcher launch skipped (handled by tmux launcher)" >> "$LOG_DIR/session-start-diagnostic.log"

    # JICM agent spawn signal removed (Tier 1 pruning) — nobody reads .jicm-agent-spawn-signal.
    # JICM is fully managed by jicm-watcher.sh (v6 stop-and-wait).
fi

# ============== MCP SUGGESTIONS ==============
# Post-decomposition (v5.9.0): All Tier 1 MCPs phagocytosed into skills.
# Only 5 MCPs remain (memory, local-rag, fetch, git, playwright) — no suggestions needed.
MCP_SUGGESTION=""

# ============== PHASE B ENHANCEMENTS (evo-2026-01-018, evo-2026-01-019) ==============

# --- AIfred Baseline Sync Check ---
# Removed (v7 refurbishment): ~/Claude/AIfred archived. AIFred-Pro is read-only production.
AIFRED_SYNC_STATUS=""

# --- Claude Code Docs Sync (B.1 integration) ---
CLAUDE_DOCS_REPO="$HOME/Claude/GitRepos/claude-code-docs"
if [[ -d "$CLAUDE_DOCS_REPO/.git" ]] && [[ "$SOURCE" == "startup" ]]; then
    cd "$CLAUDE_DOCS_REPO" 2>/dev/null
    if git pull --quiet origin main 2>/dev/null; then
        echo "$TIMESTAMP | SessionStart | Claude docs: synced" >> "$LOG_DIR/session-start-diagnostic.log"
    else
        echo "$TIMESTAMP | SessionStart | Claude docs: sync failed (using cached)" >> "$LOG_DIR/session-start-diagnostic.log"
    fi
    cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
fi

# --- JICM Session ID (v7 simplified) ---
# Session dirs removed (v7 refurbishment) — only write session ID for hooks that read it
if [[ "$SOURCE" == "startup" ]] || [[ "$SOURCE" == "resume" ]]; then
    JICM_SESSION_ID=$(date +"%Y%m%d-%H%M%S")
    echo "$JICM_SESSION_ID" > "$CLAUDE_PROJECT_DIR/.claude/context/jicm/.current-session-id"
    echo "$TIMESTAMP | SessionStart | JICM session ID: $JICM_SESSION_ID" >> "$LOG_DIR/session-start-diagnostic.log"
fi

# --- Environment Validation (evo-2026-01-019) ---
ENV_ISSUES=""
ENV_WARNINGS=""

if [[ "$SOURCE" == "startup" ]] || [[ "$SOURCE" == "resume" ]]; then
    # Check 1: Git status (uncommitted changes)
    cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
    GIT_STATUS=$(git status --porcelain 2>/dev/null | head -20)
    if [[ -n "$GIT_STATUS" ]]; then
        CHANGE_COUNT=$(echo "$GIT_STATUS" | wc -l | xargs)
        ENV_WARNINGS="${ENV_WARNINGS}- $CHANGE_COUNT uncommitted changes in workspace\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: $CHANGE_COUNT uncommitted changes" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Check 2: Current branch
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
    if [[ "$CURRENT_BRANCH" != "main" ]] && [[ "$CURRENT_BRANCH" != "master" ]] && [[ "$CURRENT_BRANCH" != "Project_Aion" ]]; then
        ENV_WARNINGS="${ENV_WARNINGS}- On branch '$CURRENT_BRANCH' (not main/Project_Aion)\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: On branch $CURRENT_BRANCH" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Check 3: Hooks directory exists and has content
    HOOKS_DIR="$CLAUDE_PROJECT_DIR/.claude/hooks"
    if [[ ! -d "$HOOKS_DIR" ]] || [[ -z "$(ls -A $HOOKS_DIR 2>/dev/null)" ]]; then
        ENV_ISSUES="${ENV_ISSUES}- Hooks directory missing or empty\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: ISSUE - hooks directory problem" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Check 4: Settings.json exists
    if [[ ! -f "$CLAUDE_PROJECT_DIR/.claude/settings.json" ]]; then
        ENV_ISSUES="${ENV_ISSUES}- Settings.json missing\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: ISSUE - settings.json missing" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Check 5: Context files exist
    if [[ ! -f "$CLAUDE_PROJECT_DIR/.claude/context/session-state.md" ]]; then
        ENV_WARNINGS="${ENV_WARNINGS}- session-state.md missing (run /setup)\n"
    fi

    # Check 6: Watcher health (evo-2026-02-001)
    WATCHER_COUNT=$(pgrep -f "jicm-watcher.sh" 2>/dev/null | wc -l | xargs)
    if [[ "$WATCHER_COUNT" -eq 0 ]]; then
        ENV_WARNINGS="${ENV_WARNINGS}- JICM watcher not running (will be started by tmux launcher)\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: Watcher not running" >> "$LOG_DIR/session-start-diagnostic.log"
    elif [[ "$WATCHER_COUNT" -gt 1 ]]; then
        ENV_WARNINGS="${ENV_WARNINGS}- Multiple JICM watchers detected ($WATCHER_COUNT) — check for duplicates\n"
        echo "$TIMESTAMP | SessionStart | EnvCheck: WARNING - $WATCHER_COUNT watchers running" >> "$LOG_DIR/session-start-diagnostic.log"
    else
        echo "$TIMESTAMP | SessionStart | EnvCheck: Watcher healthy (1 instance)" >> "$LOG_DIR/session-start-diagnostic.log"
    fi
fi

# Build environment status message
ENV_STATUS=""
if [[ -n "$ENV_ISSUES" ]]; then
    ENV_STATUS="\n\n--- ENVIRONMENT ISSUES ---\n$ENV_ISSUES---"
fi
if [[ -n "$ENV_WARNINGS" ]]; then
    ENV_STATUS="${ENV_STATUS}\n\n--- ENVIRONMENT NOTES ---\n$ENV_WARNINGS---"
fi
if [[ -n "$AIFRED_SYNC_STATUS" ]]; then
    ENV_STATUS="${ENV_STATUS}\n\n--- AIFRED BASELINE ---\n$AIFRED_SYNC_STATUS\n---"
fi

echo "$TIMESTAMP | SessionStart | EnvValidation complete" >> "$LOG_DIR/session-start-diagnostic.log"

# ============== SESSION STATE CHECK ==============
SESSION_STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/context/session-state.md"
# Priorities now consolidated into session-state.md (Session 28b)
PRIORITIES_FILE="$CLAUDE_PROJECT_DIR/.claude/context/session-state.md"
CURRENT_WORK=""
NEXT_STEP=""

if [[ -f "$SESSION_STATE_FILE" ]]; then
    # Extract current work status
    CURRENT_WORK=$(grep -A 1 "Current Work" "$SESSION_STATE_FILE" 2>/dev/null | tail -1 | sed 's/\*\*//g' | xargs)
fi

if [[ -f "$PRIORITIES_FILE" ]]; then
    # Extract next step
    NEXT_STEP=$(grep "Next Step" "$PRIORITIES_FILE" 2>/dev/null | head -1 | sed 's/.*Next Step.*: //' | xargs)
fi

echo "$TIMESTAMP | SessionStart | current_work='$CURRENT_WORK' next_step='$NEXT_STEP'" >> "$LOG_DIR/session-start-diagnostic.log"

# ============== BUILD SELF-LAUNCH PROTOCOL INSTRUCTIONS ==============
build_protocol_instructions() {
    local source_type="$1"
    local has_checkpoint="$2"

    if [[ "$SKIP_GREETING" == "true" ]]; then
        echo "QUICK MODE: Skip greeting, proceed directly to work."
        return
    fi

    # Build weather context if available
    local weather_context=""
    if [[ -n "$WEATHER_INFO" ]]; then
        weather_context=" | Weather: $WEATHER_INFO"
    fi

    # Build AIfred baseline notice if behind
    local aifred_notice=""
    if [[ -n "$AIFRED_SYNC_STATUS" ]]; then
        aifred_notice="
AIfred baseline has new commits. Run /sync-aifred-baseline after greeting."
    fi

    cat << PROTOCOL
SESSION START — $LOCAL_DATE at $LOCAL_TIME (${TIME_OF_DAY})${weather_context}
Status: ${CURRENT_WORK:-No active work} | Next: ${NEXT_STEP:-Check priorities}${aifred_notice}
Read session-state.md (includes priorities), then begin work. Do NOT just greet.
After orientation:
1. Query jarvis-rag search with collection 'sessions' for prior session summaries relevant to your current task (limit 3).
2. Query jarvis-graphiti search for prior knowledge relevant to your current task.
Use insights from both to inform your work approach.
PROTOCOL
}

# ============== RECENT ARCHIVE HELPER ==============
# Gather compressed context archives less than 3 hours old for deeper continuity.
# The current .compressed-context-ready.md has the latest state;
# recent archives provide a sliding window of context history.
gather_recent_archives() {
    local archive_dir="$CLAUDE_PROJECT_DIR/.claude/logs/jicm/archive"
    local max_age=10800  # 3 hours in seconds
    local now
    now=$(date +%s)
    local archive_context=""

    if [[ -d "$archive_dir" ]]; then
        for f in $(ls -1t "$archive_dir"/compressed-*.md 2>/dev/null | head -5); do
            local file_age=$(( now - $(stat -f %m "$f" 2>/dev/null || echo "$now") ))
            if [[ "$file_age" -lt "$max_age" ]]; then
                local basename
                basename=$(basename "$f")
                local file_lines
                file_lines=$(wc -l < "$f" | tr -d ' ')
                archive_context="${archive_context}
--- Archive: ${basename} (${file_age}s ago, ${file_lines} lines) ---
$(head -30 "$f")
..."
            fi
        done
    fi

    echo "$archive_context"
}

# ============== JICM v7.9 — STOP-AND-WAIT ARCHITECTURE ==============
# JICM v7.9 uses native signal files (.jicm-clear-now.signal +
# .jicm-resume-complete.signal); the .jicm-state shim was retired at 7.9.6c.
# The watcher handles all state transitions; this hook just injects context.
# Detection: .jicm-clear-now.signal exists (watcher wrote it before /clear,
# removes it during step-9 cleanup post-RESUME).
JICM_CYCLE_SIGNAL="${JICM_CLEAR_SIGNAL:-$CLAUDE_PROJECT_DIR/.claude/context/.jicm-clear-now.signal}"
V6_COMPRESSED="${JICM_COMPRESSED_FILE:-$CLAUDE_PROJECT_DIR/.claude/context/.compressed-context-ready.md}"

# JICM v9: derive this session's key + per-key paths (JK_*). Config (sourced above)
# provides jicm_derive_key/jicm_key_paths; if it failed to load, fall back inline so
# behavior never regresses (dev → legacy .dev.* paths; anything else → legacy w0).
if command -v jicm_derive_key >/dev/null 2>&1 && command -v jicm_key_paths >/dev/null 2>&1; then
    JICM_KEY="$(jicm_derive_key "$SESSION_ID")"
    jicm_key_paths "$JICM_KEY"
else
    # config unavailable — mirror jicm_derive_key's EXACT precedence inline (window-first,
    # then role, then unset-window→w0), then set legacy paths by key. A genuine stray
    # (window set, !=0, not dev) stays session_id → matches neither injection branch →
    # routes to the safety fallback, NOT blanket-forced to w0 (which would mis-inject).
    if   [[ "${JARVIS_WINDOW:-}" == "0" ]];         then JICM_KEY="w0"
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "dev" ]]; then JICM_KEY="dev"
    elif [[ -z "${JARVIS_WINDOW:-}" ]];             then JICM_KEY="w0"
    else JICM_KEY="$SESSION_ID"; fi
    if [[ "$JICM_KEY" == "dev" ]]; then
        JK_COMPRESSED="$CLAUDE_PROJECT_DIR/.claude/context/.compressed-context-ready.dev.md"
        JK_CLEAR_SIGNAL="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-clear-now.dev.signal"
        JK_RESUME_SIGNAL="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-resume-complete.dev.signal"
    elif [[ "$JICM_KEY" == "w0" ]]; then
        JK_COMPRESSED="$V6_COMPRESSED"; JK_CLEAR_SIGNAL="$JICM_CYCLE_SIGNAL"
        JK_RESUME_SIGNAL="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"
    fi
fi

# ============== JICM DEV-LANE SELF-CLEAR (Phase 0.3a → v9 per-key) ==============
# The dev lane (W11, key=dev) resumes from its OWN checkpoint — never W0's shared
# .compressed-context-ready.md (the "generate a CV" mis-inject observed 2026-07-18).
# v9: prefer the per-key paths (jicm-actuate.sh writes JK_*); fall back to the legacy
# .dev.* paths (jicm-self.sh writes them) so the current dev self-clear keeps working
# until jicm-self.sh retires (Phase 2) — drop the *_LEGACY fallbacks then. Key-guarded
# on JICM_KEY==dev so W0 clears never enter it, and the safety fallback below EXCLUDES
# dev so a dev clear with no checkpoint can never mis-inject W0's checkpoint.
DEV_CKPT_LEGACY="$CLAUDE_PROJECT_DIR/.claude/context/.compressed-context-ready.dev.md"
DEV_CLEAR_LEGACY="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-clear-now.dev.signal"
DEV_RESUME_LEGACY="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-resume-complete.dev.signal"
DEV_CKPT_EFF="$JK_COMPRESSED";    [[ -f "$DEV_CKPT_EFF" ]]  || DEV_CKPT_EFF="$DEV_CKPT_LEGACY"
DEV_CLEAR_EFF="$JK_CLEAR_SIGNAL"; [[ -f "$DEV_CLEAR_EFF" ]] || DEV_CLEAR_EFF="$DEV_CLEAR_LEGACY"

if [[ "$SOURCE" == "clear" ]] && [[ "$JICM_KEY" == "dev" ]] && [[ -f "$DEV_CKPT_EFF" ]]; then
    DEV_CYCLE="manual"
    [[ -f "$DEV_CLEAR_EFF" ]] && DEV_CYCLE="self-refresh-cycle"
    echo "$TIMESTAMP | SessionStart | JICM dev-lane: injecting DEV checkpoint (mode=$DEV_CYCLE)" >> "$LOG_DIR/session-start-diagnostic.log"

    DEV_CONTEXT=$(cat "$DEV_CKPT_EFF")

    # No-Silent-Degradation: a manual /clear (no actuator) may resume from a
    # checkpoint built hours ago — surface its age LOUDLY rather than presenting
    # stale context as current. The self-refresh-cycle path just built it fresh,
    # so it is never warned.
    # Judge staleness by the CHECKPOINT'S OWN mtime — NOT by DEV_CYCLE, because
    # "self-refresh-cycle" is inferred from a signal file that a crashed prior actuator
    # may have left behind, which would mask a genuinely old checkpoint (a No-Silent-
    # Degradation gap). A freshly-built cycle checkpoint is <1m old → no warning fires.
    DEV_STALE_WARN=""
    DEV_AGE_MIN=$(( ( $(date +%s) - $(stat -f %m "$DEV_CKPT_EFF" 2>/dev/null || echo "$(date +%s)") ) / 60 ))
    if [[ "$DEV_AGE_MIN" -gt 15 ]]; then
        DEV_STALE_WARN="⚠️ STALENESS — this dev checkpoint is ${DEV_AGE_MIN}m old (cycle=$DEV_CYCLE); it may omit recent work. Reconcile against .scratchpad.dev.md and the tail of your transcript before trusting it; rebuild with 'jicm-self.sh refresh' if in doubt."
        echo "$TIMESTAMP | SessionStart | JICM dev-lane: STALE checkpoint (${DEV_AGE_MIN}m, cycle=$DEV_CYCLE) — warned inline" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    MESSAGE="JICM dev-lane: context refreshed from DEV checkpoint.$ENV_STATUS"
    CONTEXT="JICM DEV-LANE CONTEXT RESTORATION — NOT a new session.
You are W11 Jarvis-dev. Your context was cleared via the dev-lane self-refresh cycle.
Resume work immediately. Do NOT greet. Do NOT ask what to work on.
${DEV_STALE_WARN:+
$DEV_STALE_WARN
}
Current datetime: $LOCAL_DATE at $LOCAL_TIME

Dev Checkpoint (.compressed-context-ready.dev.md):
$DEV_CONTEXT

Before continuing, read .claude/context/.scratchpad.dev.md — your dev working-state
(it is NOT force-loaded; only the W0 .scratchpad.md is). Then resume from the
interruption point recorded in the checkpoint above."

    echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": true, \"compression_type\": \"jicm_dev\", \"restart_type\": \"dev_self_clear\", \"dev_cycle\": \"$DEV_CYCLE\"}" > "$STATE_DIR/AC-01-launch.json"

    jq -n \
      --arg msg "$MESSAGE" \
      --arg ctx "$CONTEXT" \
      '{
        "systemMessage": $msg,
        "hookSpecificOutput": {
          "hookEventName": "SessionStart",
          "additionalContext": $ctx
        }
      }'

    # Signal that resume injection landed. Write BOTH targets so either detached
    # actuator's wait is satisfied during migration: JK_RESUME_SIGNAL (v9
    # jicm-actuate.sh) + the legacy .dev signal (jicm-self.sh). Both DEV-namespaced,
    # never colliding with W0's. Drop the legacy write when jicm-self.sh retires.
    mkdir -p "$(dirname "$JK_RESUME_SIGNAL")" 2>/dev/null
    DEV_RESUME_JSON="{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"checkpoint_bytes\":$(wc -c < "$DEV_CKPT_EFF" 2>/dev/null | tr -d ' '),\"source\":\"dev-clear\",\"cycle\":\"$DEV_CYCLE\"}"
    echo "$DEV_RESUME_JSON" > "$JK_RESUME_SIGNAL" 2>/dev/null || true
    [[ "$JK_RESUME_SIGNAL" != "$DEV_RESUME_LEGACY" ]] && echo "$DEV_RESUME_JSON" > "$DEV_RESUME_LEGACY" 2>/dev/null || true

    exit 0
fi

if [[ "$SOURCE" == "clear" ]] && [[ "$JICM_KEY" == "w0" ]] && [[ -f "$JICM_CYCLE_SIGNAL" ]]; then
    # JICM v9: key-guarded (== w0) so a dev/stray clear can never enter W0's injection.
    # For w0, JICM_CYCLE_SIGNAL/V6_COMPRESSED are the legacy paths (== JK_*), so this
    # block stays byte-identical to the v7.9 behavior.
    V6_STATE="JICM_CYCLE_ACTIVE"
    echo "$TIMESTAMP | SessionStart | JICM v7.9: Detected active cycle (signal present)" >> "$LOG_DIR/session-start-diagnostic.log"

    # NOTE (Phase 2C, 2026-05-17): Scratchpad rotation and memory consolidation
    # MOVED to jicm-watcher.sh steps 5.7/5.8 (fire BEFORE /clear, not after).
    # Rationale: consolidation is about OLD session data; should run pre-/clear
    # while watcher has async time budget. SessionStart is RETRIEVAL-ONLY now.

    if true; then

        V6_CONTEXT=""
        if [[ -f "$V6_COMPRESSED" ]]; then
            V6_CONTEXT=$(cat "$V6_COMPRESSED")
            echo "$TIMESTAMP | SessionStart | JICM v7: Loaded compressed context ($(wc -c < "$V6_COMPRESSED") bytes)" >> "$LOG_DIR/session-start-diagnostic.log"
        fi

        # Gather recent archives for deeper continuity
        RECENT_ARCHIVES=$(gather_recent_archives)
        if [[ -n "$RECENT_ARCHIVES" ]]; then
            echo "$TIMESTAMP | SessionStart | JICM v7: Found recent archives for continuity" >> "$LOG_DIR/session-start-diagnostic.log"
        fi

        # NOTE: Session-state.md deliberately NOT loaded for mid-session restores.
        # It is stale during active work. Compressed context contains current state.
        # Session-state is for NEW session starts only (created at session end).

        # L1 retrieval: include NLP-compressed scrollback summary (Phase 2C)
        # Prefers .pre-clear-scrollback-summary.md (NLP-compressed by watcher step 5.6b)
        # Falls back to raw scrollback (last 100 lines) if summary not available
        SCROLLBACK_SUMMARY="$CLAUDE_PROJECT_DIR/.claude/context/.pre-clear-scrollback-summary.md"
        SCROLLBACK_RAW="$CLAUDE_PROJECT_DIR/.claude/context/.pre-clear-scrollback.md"
        SCROLLBACK_EXCERPT=""
        if [[ -f "$SCROLLBACK_SUMMARY" ]] && [[ -s "$SCROLLBACK_SUMMARY" ]]; then
            SCROLLBACK_EXCERPT=$(cat "$SCROLLBACK_SUMMARY")
            echo "$TIMESTAMP | SessionStart | JICM v7: Scrollback summary loaded ($(wc -c < "$SCROLLBACK_SUMMARY" | tr -d ' ') bytes, NLP-compressed)" >> "$LOG_DIR/session-start-diagnostic.log"
        elif [[ -f "$SCROLLBACK_RAW" ]]; then
            SCROLLBACK_EXCERPT=$(tail -100 "$SCROLLBACK_RAW")
            echo "$TIMESTAMP | SessionStart | JICM v7: Scrollback raw fallback (last 100 lines)" >> "$LOG_DIR/session-start-diagnostic.log"
        fi

        # B3/B4: Extract task keywords from checkpoint for targeted MCP searches
        TASK_KEYWORDS=""
        if [[ -n "$V6_CONTEXT" ]]; then
            TASK_KEYWORDS=$(echo "$V6_CONTEXT" | grep -A2 '## Current Task' 2>/dev/null | tail -1 | sed 's/[^a-zA-Z0-9 _-]//g' | head -c 80 | xargs)
        fi
        TASK_KEYWORDS="${TASK_KEYWORDS:-current session work}"

        MESSAGE="JICM v7: Context compressed and cleared.$ENV_STATUS"
        CONTEXT="JICM v7 CONTEXT RESTORATION — NOT a new session.
You are Jarvis. Context was cleared via stop-and-wait JICM cycle.
Resume work immediately. Do NOT greet. Do NOT ask what to work on.

Current datetime: $LOCAL_DATE at $LOCAL_TIME

Compressed Context (current):
$V6_CONTEXT
${RECENT_ARCHIVES:+
Recent Archives (for additional continuity):
$RECENT_ARCHIVES
}${SCROLLBACK_EXCERPT:+
Terminal Scrollback (last 50 lines before /clear — use for context recovery):
$SCROLLBACK_EXCERPT
}
MANDATORY CONTEXT RETRIEVAL — Execute these two searches BEFORE any other work:
1. Call mcp__jarvis-rag__search with query=\"$TASK_KEYWORDS\", collection=\"sessions\", limit=3
2. Call mcp__jarvis-graphiti__search with query=\"$TASK_KEYWORDS\"
Integrate any relevant findings into your understanding. If either returns no results, proceed without.
Do NOT skip these searches — they connect you to prior session knowledge.

Resume: Parse the compressed context above, check .scratchpad.md (force-loaded), execute the mandatory retrieval above, then continue from the interruption point."

        # Write state file (AC-01)
        echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": true, \"compression_type\": \"jicm_v6\", \"restart_type\": \"v6_stop_and_wait\"}" > "$STATE_DIR/AC-01-launch.json"

        # NO .idle-hands-active flag — v6 watcher handles resume directly
        jq -n \
          --arg msg "$MESSAGE" \
          --arg ctx "$CONTEXT" \
          '{
            "systemMessage": $msg,
            "hookSpecificOutput": {
              "hookEventName": "SessionStart",
              "additionalContext": $ctx
            }
          }'

        # Phase 7.9.1 (v7.9) — signal slim watcher that resume injection succeeded.
        # Watcher (Phase 7.9.3) polls .jicm-resume-complete.signal to advance the actuator chain.
        # Production (v7.3 watcher) ignores this signal; harmless additive code, forward-compatible.
        RESUME_SIGNAL="$CLAUDE_PROJECT_DIR/.claude/context/.jicm-resume-complete.signal"
        echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"checkpoint_bytes\":$(wc -c < "$V6_COMPRESSED" 2>/dev/null | tr -d ' '),\"source\":\"clear-v7\"}" > "$RESUME_SIGNAL" 2>/dev/null || true

        exit 0
    fi
fi

# JICM v5 code path REMOVED (v6.1, 2026-02-11)
# v5 used two-mechanism resume: hook injection + idle-hands keystroke monitor.
# v7.9 uses .jicm-clear-now.signal + .jicm-resume-complete.signal + stop-and-wait architecture (above).

# ============== JICM v9 DEV CLEAR — NO CHECKPOINT ==============
# A dev clear that reached here has NO dev checkpoint (the dev-branch above required
# one). Give a minimal nudge — NEVER W0's checkpoint or prep — so a first-ever dev
# clear (before any self-refresh cycle) starts oriented, not blank, and never inherits
# W0's context (the mis-inject class). Dev never reaches the W0 safety fallback below.
if [[ "$SOURCE" == "clear" ]] && [[ "$JICM_KEY" == "dev" ]]; then
    echo "$TIMESTAMP | SessionStart | JICM dev-lane: clear with no dev checkpoint — minimal nudge" >> "$LOG_DIR/session-start-diagnostic.log"
    echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": false, \"restart_type\": \"dev_clear_no_checkpoint\"}" > "$STATE_DIR/AC-01-launch.json"
    jq -n \
      --arg msg "JICM dev-lane: context cleared — no dev checkpoint found.$ENV_STATUS" \
      --arg ctx "Dev context cleared, $LOCAL_DATE at $LOCAL_TIME. No dev checkpoint was available.
You are W11 Jarvis-dev. Read .claude/context/.scratchpad.dev.md for your working state
(it is NOT force-loaded), then continue from there or start fresh. Do NOT load W0's
.compressed-context-ready.md — that is a different lane's context." \
      '{
        "systemMessage": $msg,
        "hookSpecificOutput": {
          "hookEventName": "SessionStart",
          "additionalContext": $ctx
        }
      }'
    exit 0
fi

# ============== JICM v9 — ANY OTHER KEY'S CLEAR (key-generic) ==============
# Every key that is not w0 and not dev used to fall through to the W0 "safety fallback" below,
# which runs W0's prep (find_best_jsonl → W0's TRANSCRIPT) and injects W0's checkpoint. dev was
# hardened against exactly that in 2026-07-18; no other key was.
#
# Observed live 2026-07-29: a protos session was handed W0's current task — "Review and optimize
# Genesis OCR processing for Genesis chapter 1 … run the kraken re-run" — and did it, launching a
# real 25-minute pipeline against a live project. It obeyed the context it was given. The bug was
# that we gave it another lane's context.
#
# So: a key with its own checkpoint gets ITS OWN, and writes the per-key resume signal the
# actuator waits on (previously only dev and w0 wrote one, so every other key made the actuator
# time out after 60s and nudge blind). A key with no checkpoint gets a minimal nudge to its own
# scratchpad — the same treatment dev gets, and NEVER W0's context.
if [[ "$SOURCE" == "clear" ]] && [[ "$JICM_KEY" != "w0" ]] && [[ "$JICM_KEY" != "dev" ]]; then
    KEY_SCRATCH=".claude/context/.scratchpad.${JICM_KEY}.md"
    if [[ -f "$JK_COMPRESSED" ]]; then
        echo "$TIMESTAMP | SessionStart | JICM key=$JICM_KEY: injecting OWN checkpoint ($(wc -c < "$JK_COMPRESSED" | tr -d ' ') bytes)" >> "$LOG_DIR/session-start-diagnostic.log"
        KEY_CTX="Context cleared, $LOCAL_DATE at $LOCAL_TIME (lane: $JICM_KEY).

$(cat "$JK_COMPRESSED")

--- Resume ---
Read $KEY_SCRATCH for transient working details (it is NOT force-loaded), then resume.
Do NOT load .claude/context/.compressed-context-ready.md or session-state.md — those belong to
the W0 lane, not to you."
        echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": true, \"compression_type\": \"jicm_key\", \"restart_type\": \"key_clear\", \"jicm_key\": \"$JICM_KEY\"}" > "$STATE_DIR/AC-01-launch.json"
        jq -n --arg msg "JICM ($JICM_KEY): context cleared — checkpoint restored.$ENV_STATUS" --arg ctx "$KEY_CTX" \
          '{"systemMessage": $msg, "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": $ctx}}'
        # Tell the waiting actuator the injection landed. Without this it waits the full 60s and
        # then nudges blind, unable to distinguish "resumed" from "never came back".
        if [[ -n "$JK_RESUME_SIGNAL" ]]; then
            mkdir -p "$(dirname "$JK_RESUME_SIGNAL")" 2>/dev/null
            echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"checkpoint_bytes\":$(wc -c < "$JK_COMPRESSED" 2>/dev/null | tr -d ' '),\"source\":\"key-clear\",\"key\":\"$JICM_KEY\"}" > "$JK_RESUME_SIGNAL" 2>/dev/null || true
        fi
    else
        echo "$TIMESTAMP | SessionStart | JICM key=$JICM_KEY: clear with no checkpoint — minimal nudge" >> "$LOG_DIR/session-start-diagnostic.log"
        echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": false, \"restart_type\": \"key_clear_no_checkpoint\", \"jicm_key\": \"$JICM_KEY\"}" > "$STATE_DIR/AC-01-launch.json"
        jq -n --arg msg "JICM ($JICM_KEY): context cleared — no checkpoint found.$ENV_STATUS" \
              --arg ctx "Context cleared, $LOCAL_DATE at $LOCAL_TIME. No checkpoint was available for lane '$JICM_KEY'.
Read $KEY_SCRATCH for your working state, then continue or start fresh.
Do NOT load .claude/context/.compressed-context-ready.md or session-state.md — that is a
different lane's context." \
          '{"systemMessage": $msg, "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": $ctx}}'
    fi
    exit 0
fi

# ============== CLEAR WITHOUT JICM (W0 safety fallback) ==============
# Legacy .soft-restart-checkpoint.md handling removed (v7 refurbishment).
# Nothing creates that file anymore. Only .compressed-context-ready.md matters.
# NOW RESERVED TO w0: this runs W0's prep and injects W0's checkpoint, which is correct ONLY
# for W0. Every other key is handled by the key-generic branch above.
if [[ "$SOURCE" == "clear" ]] && [[ "$JICM_KEY" == "w0" ]]; then
    # JICM v9: EXCLUDE dev — this fallback runs W0's prep (find_best_jsonl → W0's
    # transcript) and injects W0's checkpoint. A dev clear that reached here (no dev
    # checkpoint at all) must NOT get W0's context — that is exactly the mis-inject
    # bug (2026-07-18); it simply starts clean instead.
    # Clear without JICM — run prep script to create backup context
    PREP_SCRIPT="${JICM_PREP_SCRIPT:-$CLAUDE_PROJECT_DIR/.claude/scripts/jicm-prep-context.sh}"
    if [[ -x "$PREP_SCRIPT" ]]; then
        bash "$PREP_SCRIPT" 2>>"$LOG_DIR/session-start-diagnostic.log" || true
        echo "$TIMESTAMP | SessionStart | /clear safety: ran jicm-prep-context.sh" >> "$LOG_DIR/session-start-diagnostic.log"
    fi

    # Gather recent archives for continuity
    RECENT_ARCHIVES=$(gather_recent_archives)

    # Check if compressed context is now available
    if [[ -f "$V6_COMPRESSED" ]]; then
        BACKUP_CONTEXT=$(cat "$V6_COMPRESSED")
        MESSAGE="CONTEXT CLEARED — backup context prepared.$ENV_STATUS"
        CONTEXT="Context cleared, $LOCAL_DATE at $LOCAL_TIME. Backup context auto-prepared.

Compressed Context (current):
$BACKUP_CONTEXT
${RECENT_ARCHIVES:+
Recent Archives (for additional continuity):
$RECENT_ARCHIVES
}
Resume: Review above context, check the active plan referenced in CLAUDE.md, then continue or start fresh."
    else
        MESSAGE="CONTEXT CLEARED — No checkpoint found.$ENV_STATUS"
        CONTEXT="Context cleared, $LOCAL_DATE at $LOCAL_TIME. No checkpoint found.
${RECENT_ARCHIVES:+
Recent Archives (may contain relevant context):
$RECENT_ARCHIVES
}
Read session-state.md, offer to continue previous work or start fresh."
    fi

    # Write state file
    echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": false, \"auto_continue\": false, \"restart_type\": \"clear_no_checkpoint\"}" > "$STATE_DIR/AC-01-launch.json"

    jq -n \
      --arg msg "$MESSAGE" \
      --arg ctx "$CONTEXT" \
      '{
        "systemMessage": $msg,
        "hookSpecificOutput": {
          "hookEventName": "SessionStart",
          "additionalContext": $ctx
        }
      }'

elif [[ "$SOURCE" == "startup" ]] || [[ "$SOURCE" == "resume" ]]; then
    # Normal startup - Full Self-Launch Protocol
    PROTOCOL_INSTRUCTIONS=$(build_protocol_instructions "$SOURCE" "false")

    if [[ "$AUTO_CONTINUE" == "true" ]] && [[ -n "$NEXT_STEP" ]]; then
        CONTEXT="$PROTOCOL_INSTRUCTIONS
AUTO: Proceed with $NEXT_STEP without waiting for confirmation."
    else
        CONTEXT="$PROTOCOL_INSTRUCTIONS
Present status and offer to continue with pending work."
    fi

    MESSAGE="Session started ($SOURCE)$ENV_STATUS"

    # Write state file
    echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": false, \"auto_continue\": $AUTO_CONTINUE}" > "$STATE_DIR/AC-01-launch.json"

    jq -n \
      --arg msg "$MESSAGE" \
      --arg ctx "$CONTEXT" \
      '{
        "systemMessage": $msg,
        "hookSpecificOutput": {
          "hookEventName": "SessionStart",
          "additionalContext": $ctx
        }
      }'

elif [[ "$SOURCE" == "compact" ]]; then
    # Native autocompact fired — Claude Code summarized old context, new window starts.
    # Inject compressed context + scratchpad pointer so Claude can recover orientation.
    COMPACT_CONTEXT=""
    if [[ -f "$V6_COMPRESSED" ]]; then
        COMPACT_CONTEXT=$(cat "$V6_COMPRESSED")
    fi

    RECENT_ARCHIVES=$(gather_recent_archives)

    MESSAGE="Context compacted by Claude Code.$ENV_STATUS"
    CONTEXT="AUTOCOMPACT — Claude Code's native compaction ran.
Context was summarized, NOT cleared. Your conversation summary is above this block.
Current datetime: $LOCAL_DATE at $LOCAL_TIME

Check .claude/context/.scratchpad.md for transient session details (force-loaded).
${COMPACT_CONTEXT:+
Last JICM checkpoint (may be stale — prefer your conversation summary):
$COMPACT_CONTEXT
}${RECENT_ARCHIVES:+
Recent Archives:
$RECENT_ARCHIVES
}Resume from your conversation summary above. Do NOT re-greet."

    echo "{\"last_run\": \"$TIMESTAMP\", \"greeting_type\": \"$TIME_OF_DAY\", \"checkpoint_loaded\": true, \"restart_type\": \"compact\"}" > "$STATE_DIR/AC-01-launch.json"

    jq -n \
      --arg msg "$MESSAGE" \
      --arg ctx "$CONTEXT" \
      '{
        "systemMessage": $msg,
        "hookSpecificOutput": {
          "hookEventName": "SessionStart",
          "additionalContext": $ctx
        }
      }'

else
    # Unknown source - minimal output
    echo "{}"
fi

# Exit success
exit 0
