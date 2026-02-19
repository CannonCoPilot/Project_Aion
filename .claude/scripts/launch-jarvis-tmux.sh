#!/bin/bash
# Launch Jarvis (Claude) in a tmux session for autonomous control
# This enables auto-command execution via tmux send-keys
#
# Layout (Aion Quartet + Commands):
# ┌─────────────────────────────────────────┐
# │            Claude Code (window 0)       │
# └─────────────────────────────────────────┘
# ┌─────────────────────────────────────────┐
# │            Watcher (window 1)           │
# └─────────────────────────────────────────┘
# ┌─────────────────────────────────────────┐
# │            Ennoia (window 2)            │
# └─────────────────────────────────────────┘
# ┌─────────────────────────────────────────┐
# │            Virgil (window 3)            │
# └─────────────────────────────────────────┘
# ┌─────────────────────────────────────────┐
# │            Commands (window 4)          │
# └─────────────────────────────────────────┘
#
# Watcher (window 1): JICM v6 context monitoring + compression
# Ennoia (window 2): Session orchestration, intent-driven wake-up
# Virgil (window 3): Task tracking, agent monitoring, file changes
# Commands (window 4): Signal file → command injection via send-keys
# Jarvis-dev (window 5): Second Claude session for dev testing (--dev mode only)
#
# iTerm2 Integration:
#   Use --iterm2 flag to attach with tmux -CC for native iTerm2 tabs
#   This makes tmux windows appear as standard iTerm2 tabs/windows
#
# Updated: 2026-02-17 — v2.3: Deterministic session UUIDs for W0+W5, --resume by default

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
SESSION_NAME="${TMUX_SESSION:-jarvis}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
# Derive Claude project directory slug from PROJECT_DIR (e.g. /Users/foo/Claude/Jarvis → -Users-foo-Claude-Jarvis)
CLAUDE_PROJECT_SLUG="-$(echo "$PROJECT_DIR" | sed 's|^/||; s|/|-|g')"

# Deterministic session UUIDs — each window resumes its own conversation by default
# W0: UUID v5 of "project_aion_jarvis_w0" in NAMESPACE_URL
JARVIS_W0_SESSION_ID="17612316-37f1-5cec-b456-6a79f7735a9f"
JARVIS_W0_SESSION_FILE="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}/${JARVIS_W0_SESSION_ID}.jsonl"

# JICM v6 watcher (v5 removed in v6.1)
WATCHER_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-watcher.sh"
WATCHER_VERSION="v6"
if [[ ! -x "$WATCHER_SCRIPT" ]]; then
    WATCHER_SCRIPT=""
    WATCHER_VERSION="none"
fi

# Parse arguments
ITERM2_MODE=false
FRESH_MODE=false
DEV_MODE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --iterm2|-i) ITERM2_MODE=true; shift ;;
        --fresh|-f) FRESH_MODE=true; shift ;;
        --dev|-d) DEV_MODE=true; shift ;;
        *) shift ;;
    esac
done

# --dev only controls W5 creation; W0 resumes by default regardless
# Use --fresh explicitly if you want a clean W0 slate

# Auto-detect iTerm2
if [[ "$TERM_PROGRAM" == "iTerm.app" ]] && [[ "$ITERM2_MODE" != "true" ]]; then
    echo "Detected iTerm2. Use --iterm2 flag for native tab integration."
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              JARVIS TMUX LAUNCHER v2.3                        ║"
echo "║       (Deterministic UUIDs + Aion Quartet + JICM)            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if tmux is available
if [[ ! -x "$TMUX_BIN" ]]; then
    echo -e "${RED}ERROR: tmux not found at $TMUX_BIN${NC}"
    echo ""
    echo "To install tmux:"
    echo "  macOS: brew install tmux"
    echo "  Linux: apt-get install tmux"
    exit 1
fi

# Check if watcher script exists
if [[ -z "$WATCHER_SCRIPT" ]] || [[ ! -x "$WATCHER_SCRIPT" ]]; then
    echo -e "${YELLOW}WARNING: No watcher script found${NC}"
    echo "Commands will need to be executed manually."
    WATCHER_ENABLED=false
else
    WATCHER_ENABLED=true
    echo -e "  ${CYAN}Watcher:${NC} ${GREEN}$WATCHER_VERSION${NC} ($WATCHER_SCRIPT)"
fi

# Check if jq is available (needed by watcher)
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}WARNING: jq not installed (needed for watcher)${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    WATCHER_ENABLED=false
fi

# Check if session already exists
if "$TMUX_BIN" has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}Session '$SESSION_NAME' already exists.${NC}"

    # If --dev requested and W5 doesn't exist, add it to the running session
    if [[ "$DEV_MODE" == "true" ]]; then
        EXISTING_WINDOWS=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null)
        if ! echo "$EXISTING_WINDOWS" | grep -q "^Jarvis-dev$"; then
            echo "Adding Jarvis-dev window (W5) to existing session..."
            JARVIS_DEV_SESSION_ID="fbd7528a-c1bd-414a-bdaa-c3cc23f53215"
            JARVIS_DEV_SESSION_FILE="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}/${JARVIS_DEV_SESSION_ID}.jsonl"
            CLAUDE_ENV_DEV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000 JARVIS_SESSION_ROLE=dev"
            DEV_INSTRUCTIONS="$PROJECT_DIR/.claude/context/dev-session-instructions.md"
            # Session file rotation — archive if > 5MB to prevent unbounded growth
            DEV_SESSION_MAX_BYTES=5242880  # 5MB
            DEV_SESSION_ARCHIVE_DIR="$PROJECT_DIR/.claude/exports/dev/sessions"
            if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
                DEV_FILE_SIZE=$(stat -f%z "$JARVIS_DEV_SESSION_FILE" 2>/dev/null || echo 0)
                if [[ "$DEV_FILE_SIZE" -gt "$DEV_SESSION_MAX_BYTES" ]]; then
                    mkdir -p "$DEV_SESSION_ARCHIVE_DIR"
                    ARCHIVE_NAME="dev-session-$(date +%Y%m%d-%H%M%S).jsonl"
                    mv "$JARVIS_DEV_SESSION_FILE" "$DEV_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
                    echo -e "  ${YELLOW}Session file rotated ($(( DEV_FILE_SIZE / 1024 ))KB > 5MB) → $ARCHIVE_NAME${NC}"
                    ls -t "$DEV_SESSION_ARCHIVE_DIR"/dev-session-*.jsonl 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
                fi
            fi
            if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
            else
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
            fi
            DEV_INIT_PROMPT="Please load these files into context: @${DEV_INSTRUCTIONS}"
            "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
                "cd '$PROJECT_DIR' && export $CLAUDE_ENV_DEV && $CLAUDE_CMD_DEV '$DEV_INIT_PROMPT'"
            "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Jarvis-dev" automatic-rename off 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Jarvis-dev window created"
        else
            echo "  Jarvis-dev window already exists."
        fi
    fi

    if [[ "$ITERM2_MODE" == "true" ]]; then
        echo "Attaching with iTerm2 integration..."
        exec "$TMUX_BIN" -CC attach-session -t "$SESSION_NAME"
    else
        echo "Attaching..."
        exec "$TMUX_BIN" attach-session -t "$SESSION_NAME"
    fi
fi

# Ensure project directory exists
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo -e "${RED}ERROR: Project directory not found: $PROJECT_DIR${NC}"
    exit 1
fi

echo -e "  ${CYAN}Project:${NC} $PROJECT_DIR"
echo -e "  ${CYAN}Session:${NC} $SESSION_NAME"
echo -e "  ${CYAN}W0 UUID:${NC} $JARVIS_W0_SESSION_ID"
if [[ "$FRESH_MODE" == "true" ]]; then
    echo -e "  ${CYAN}W0 Mode:${NC} ${YELLOW}FRESH${NC} (new session pinned to UUID)"
elif [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
    echo -e "  ${CYAN}W0 Mode:${NC} ${GREEN}RESUME${NC} (restoring previous session)"
else
    echo -e "  ${CYAN}W0 Mode:${NC} ${GREEN}NEW${NC} (first session, pinned to UUID)"
fi
echo -e "  ${CYAN}Watcher:${NC} $([ "$WATCHER_ENABLED" = true ] && echo "${GREEN}ENABLED${NC}" || echo "${YELLOW}DISABLED${NC}")"
echo ""
echo "Starting Jarvis..."

# Set TERM for best compatibility with Claude's ink UI
export TERM=xterm-256color

# Context management environment variables
# - ENABLE_TOOL_SEARCH: Enable MCP tool search to reduce context usage
# - CLAUDE_CODE_MAX_OUTPUT_TOKENS: Set max output to 20K (affects effective context budget)
# Note: CLAUDE_AUTOCOMPACT_PCT_OVERRIDE left at default (~95%, effective ~85%)
#       JICM triggers at 70% with 15% headroom before auto-compact
# Determine session type
if [[ "$FRESH_MODE" == "true" ]]; then
    JARVIS_SESSION_TYPE="fresh"
else
    JARVIS_SESSION_TYPE="resume"
fi

CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0"

# Create new tmux session with Claude in the main pane
# W0 runs in a restart loop: first launch per mode, then --resume on re-entry
CLAUDE_BASE="claude --dangerously-skip-permissions --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"

# W0 session file rotation — archive if > 5MB to prevent unbounded growth
W0_SESSION_MAX_BYTES=5242880  # 5MB
W0_SESSION_ARCHIVE_DIR="$PROJECT_DIR/.claude/exports/w0/sessions"
if [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
    W0_FILE_SIZE=$(stat -f%z "$JARVIS_W0_SESSION_FILE" 2>/dev/null || echo 0)
    if [[ "$W0_FILE_SIZE" -gt "$W0_SESSION_MAX_BYTES" ]]; then
        mkdir -p "$W0_SESSION_ARCHIVE_DIR"
        ARCHIVE_NAME="w0-session-$(date +%Y%m%d-%H%M%S).jsonl"
        mv "$JARVIS_W0_SESSION_FILE" "$W0_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
        echo -e "  ${YELLOW}W0 session file rotated ($(( W0_FILE_SIZE / 1024 ))KB > 5MB) → $ARCHIVE_NAME${NC}"
        ls -t "$W0_SESSION_ARCHIVE_DIR"/w0-session-*.jsonl 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
    fi
fi

# Determine W0 first-run command based on mode
if [[ "$FRESH_MODE" == "true" ]]; then
    # Fresh: archive existing session and start new with pinned UUID
    if [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
        mkdir -p "$W0_SESSION_ARCHIVE_DIR"
        ARCHIVE_NAME="w0-session-$(date +%Y%m%d-%H%M%S).jsonl"
        mv "$JARVIS_W0_SESSION_FILE" "$W0_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
        echo -e "  ${YELLOW}W0 session archived for --fresh → $ARCHIVE_NAME${NC}"
    fi
    CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
else
    # Default: resume existing session or create new pinned session
    if [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
        CLAUDE_FIRST="$CLAUDE_BASE --resume $JARVIS_W0_SESSION_ID"
    else
        CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
    fi
fi

# Restart loop: always --resume (session was created on first run)
CLAUDE_RESUME="$CLAUDE_BASE --resume $JARVIS_W0_SESSION_ID"
W0_WRAPPER="export $CLAUDE_ENV && $CLAUDE_FIRST; while true; do echo ''; echo 'Claude exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $CLAUDE_RESUME; done"

"$TMUX_BIN" new-session -d -s "$SESSION_NAME" -n "Jarvis" -c "$PROJECT_DIR" "$W0_WRAPPER"

# Give Claude a moment to start
sleep 2

# Launch watcher in a tmux window (terminal-agnostic)
if [[ "$WATCHER_ENABLED" = true ]]; then
    echo "Launching Jarvis watcher in tmux window..."

    # Set environment for watcher
    export TMUX_BIN="$TMUX_BIN"
    export TMUX_SESSION="$SESSION_NAME"
    export CLAUDE_PROJECT_DIR="$PROJECT_DIR"

    # Create watcher window (window 1, detached so we stay on window 0)
    # Threshold=50 (accounts for queuing delay before compression starts)
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Watcher" -d \
        "cd '$PROJECT_DIR' && '$WATCHER_SCRIPT' --threshold 50 --interval 3; echo 'Watcher stopped.'; read"
fi

# Launch Ennoia session orchestrator in a tmux window (window 2, detached)
ENNOIA_SCRIPT="$PROJECT_DIR/.claude/scripts/ennoia.sh"
if [[ -x "$ENNOIA_SCRIPT" ]]; then
    echo "Launching Ennoia orchestrator in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Ennoia" -d \
        "cd '$PROJECT_DIR' && '$ENNOIA_SCRIPT'; echo 'Ennoia stopped.'; read"
fi

# Launch Virgil codebase guide in a tmux window (window 3, detached)
VIRGIL_SCRIPT="$PROJECT_DIR/.claude/scripts/virgil.sh"
if [[ -x "$VIRGIL_SCRIPT" ]]; then
    echo "Launching Virgil codebase guide in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Virgil" -d \
        "cd '$PROJECT_DIR' && '$VIRGIL_SCRIPT'; echo 'Virgil stopped.'; read"
fi

# Launch command handler in a tmux window (window 4, detached)
CMD_HANDLER_SCRIPT="$PROJECT_DIR/.claude/scripts/command-handler.sh"
if [[ -x "$CMD_HANDLER_SCRIPT" ]]; then
    echo "Launching command handler in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Commands" -d \
        "cd '$PROJECT_DIR' && '$CMD_HANDLER_SCRIPT' --interval 3; echo 'Command handler stopped.'; read"
fi

# W5: Jarvis-dev (developer's seat — named session for deterministic resumption)
# Uses a deterministic UUID so --resume always picks up the same conversation.
# UUID v5 of "project_aion_jarvis_dev" in NAMESPACE_URL = fbd7528a-c1bd-414a-bdaa-c3cc23f53215
if [[ "$DEV_MODE" == "true" ]]; then
    echo "Launching Jarvis-dev (developer's seat) in tmux window..."
    JARVIS_DEV_SESSION_ID="fbd7528a-c1bd-414a-bdaa-c3cc23f53215"
    JARVIS_DEV_SESSION_FILE="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}/${JARVIS_DEV_SESSION_ID}.jsonl"
    CLAUDE_ENV_DEV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 JARVIS_SESSION_ROLE=dev JARVIS_WINDOW=5"
    DEV_INSTRUCTIONS="$PROJECT_DIR/.claude/context/dev-session-instructions.md"
    # Session file rotation — archive if > 5MB to prevent unbounded growth
    DEV_SESSION_MAX_BYTES=5242880  # 5MB
    DEV_SESSION_ARCHIVE_DIR="$PROJECT_DIR/.claude/exports/dev/sessions"
    if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
        DEV_FILE_SIZE=$(stat -f%z "$JARVIS_DEV_SESSION_FILE" 2>/dev/null || echo 0)
        if [[ "$DEV_FILE_SIZE" -gt "$DEV_SESSION_MAX_BYTES" ]]; then
            mkdir -p "$DEV_SESSION_ARCHIVE_DIR"
            ARCHIVE_NAME="dev-session-$(date +%Y%m%d-%H%M%S).jsonl"
            mv "$JARVIS_DEV_SESSION_FILE" "$DEV_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
            echo -e "  ${YELLOW}Session file rotated ($(( DEV_FILE_SIZE / 1024 ))KB > 5MB) → $ARCHIVE_NAME${NC}"
            # Prune archives: keep last 5
            ls -t "$DEV_SESSION_ARCHIVE_DIR"/dev-session-*.jsonl 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
        fi
    fi
    if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
    else
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
    fi
    # Preload dev instructions file into context on launch
    DEV_INIT_PROMPT="Please load these files into context: @${DEV_INSTRUCTIONS}"
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
        "cd '$PROJECT_DIR' && export $CLAUDE_ENV_DEV && $CLAUDE_CMD_DEV '$DEV_INIT_PROMPT'"
    "$TMUX_BIN" set-window-option -t "$SESSION_NAME:5" automatic-rename off 2>/dev/null || true
fi

# Set tmux options for better experience
"$TMUX_BIN" set-option -t "$SESSION_NAME" mouse on 2>/dev/null || true
"$TMUX_BIN" set-option -t "$SESSION_NAME" history-limit 10000 2>/dev/null || true
# Prevent tmux from overriding window names with command names
"$TMUX_BIN" set-window-option -t "$SESSION_NAME:0" automatic-rename off 2>/dev/null || true
"$TMUX_BIN" set-window-option -t "$SESSION_NAME:1" automatic-rename off 2>/dev/null || true
"$TMUX_BIN" set-window-option -t "$SESSION_NAME:2" automatic-rename off 2>/dev/null || true
"$TMUX_BIN" set-window-option -t "$SESSION_NAME:3" automatic-rename off 2>/dev/null || true
"$TMUX_BIN" set-window-option -t "$SESSION_NAME:4" automatic-rename off 2>/dev/null || true

echo ""
echo -e "${GREEN}Jarvis is ready!${NC}"
echo ""
echo "Windows:"
echo "  Window 0: Jarvis ($([ "$FRESH_MODE" == "true" ] && echo "fresh" || echo "resumed") — $JARVIS_W0_SESSION_ID)"
echo "  Window 1: Watcher"
echo "  Window 2: Ennoia"
echo "  Window 3: Virgil"
echo "  Window 4: Commands"
[[ "$DEV_MODE" == "true" ]] && echo "  Window 5: Jarvis-dev (test driver)"
echo ""

if [[ "$ITERM2_MODE" == "true" ]]; then
    echo "iTerm2 Integration Mode:"
    echo "  - tmux windows will appear as native iTerm2 tabs"
    echo "  - Switch windows: Cmd+[Number] or Cmd+Shift+[/]"
    echo "  - Dashboard: Shell > tmux > Dashboard"
    echo ""
    echo "Attaching with iTerm2 integration..."
    exec "$TMUX_BIN" -CC attach-session -t "$SESSION_NAME"
else
    echo "Keyboard shortcuts:"
    echo "  Ctrl+b then 0-4 - Switch windows: Jarvis (0), Watcher (1), Ennoia (2), Virgil (3), Commands (4)"
    [[ "$DEV_MODE" == "true" ]] && echo "  Ctrl+b then 5   - Switch to Jarvis-dev (test driver)"
    echo "  Ctrl+b then d     - Detach (leave running)"
    echo "  Ctrl+b then x     - Close current window"
    echo ""
    echo "Attaching to session..."
    exec "$TMUX_BIN" attach-session -t "$SESSION_NAME"
fi
