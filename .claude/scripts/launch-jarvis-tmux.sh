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
# ┌─────────────────────────────────────────┐
# │            HUD-live (window 7+)         │
# └─────────────────────────────────────────┘
#
# Watcher (window 1): JICM v6 context monitoring + compression
# Ennoia (window 2): Session orchestration, intent-driven wake-up
# Virgil (window 3): Task tracking, agent monitoring, file changes
# Commands (window 4): Signal file → command injection via send-keys
# Jarvis-dev (window 5): Second Claude session for dev testing (--dev mode only)
# HUD-live (window 7+): Read-only htop-style dashboard over watcher state surface
#
# Modes:
#   (default)    Full Jarvis with session persistence (W0-W4, resume by UUID)
#   --dev        Add W5 Jarvis-dev test driver
#   --fresh      Full Jarvis but new session (archive old, start clean)
#   --lite       Isolated one-off session (W0+Watcher only, no persistence,
#                separate tmux session 'lite', minimal CLAUDE.md ~340 tokens,
#                JSONL cleaned on exit — for ad hoc tasks and small projects)
#
# iTerm2 Integration:
#   Use --iterm2 flag to attach with tmux -CC for native iTerm2 tabs
#   This makes tmux windows appear as standard iTerm2 tabs/windows
#
# Updated: 2026-03-23 — v2.5: --lite mode for isolated one-off sessions

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
SESSION_NAME="${TMUX_SESSION:-jarvis}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Jarvis}"
# Derive Claude project directory slug from PROJECT_DIR (e.g. /Users/foo/Claude/Jarvis → -Users-foo-Claude-Jarvis)
CLAUDE_PROJECT_SLUG="-$(echo "$PROJECT_DIR" | sed 's|^/||; s|/|-|g')"

# Deterministic session UUIDs — pinned per-window for --fresh mode and exclusion filtering
# W0: UUID v5 of "project_aion_jarvis_w0" in NAMESPACE_URL (used only for --fresh)
JARVIS_W0_SESSION_ID="17612316-37f1-5cec-b456-6a79f7735a9f"
JARVIS_W0_SESSION_FILE="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}/${JARVIS_W0_SESSION_ID}.jsonl"
# W5: UUID v5 of "project_aion_jarvis_dev" in NAMESPACE_URL (excluded from W0 lookup)
JARVIS_W5_SESSION_ID="fbd7528a-c1bd-414a-bdaa-c3cc23f53215"
JARVIS_PROJECTS_DIR="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}"
W0_UUID_FILE="$PROJECT_DIR/.claude/context/.current-w0-uuid"

# Find the most recent W0 session by excluding known non-W0 deterministic UUIDs.
# JICM /clear creates new session UUIDs, so we can't pin W0 to one UUID.
# Instead, we pick the most recent JSONL that isn't W5's session.
find_latest_w0_session() {
    local exclude_uuid="$JARVIS_W5_SESSION_ID"
    local f uuid
    for f in $(ls -t "$JARVIS_PROJECTS_DIR"/*.jsonl 2>/dev/null); do
        uuid=$(basename "$f" .jsonl)
        if [[ "$uuid" != "$exclude_uuid" ]]; then
            echo "$uuid"
            return 0
        fi
    done
    return 1
}

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
LITE_MODE=false
SKIP_PREFLIGHT=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --iterm2|-i) ITERM2_MODE=true; shift ;;
        --fresh|-f) FRESH_MODE=true; shift ;;
        --dev|-d) DEV_MODE=true; shift ;;
        --lite|-l) LITE_MODE=true; shift ;;
        --skip-preflight|-s) SKIP_PREFLIGHT=true; shift ;;
        *) shift ;;
    esac
done

# ═══════════════════════════════════════════════════════════════════════
# LITE MODE — Isolated one-off session (W0 + Watcher only)
# ═══════════════════════════════════════════════════════════════════════
# Separate tmux session, separate project dir, no session persistence.
# Runs from $HOME/Claude/lite-workspace/ with minimal CLAUDE.md (~1K tokens).
# JSONL cleaned up on exit so --continue doesn't find it.

if [[ "$LITE_MODE" == "true" ]]; then
    LITE_SESSION="lite"
    LITE_PROJECT="$HOME/Claude/lite-workspace"
    LITE_WATCHER="$PROJECT_DIR/.claude/scripts/jicm-watcher.sh"

    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║              JARVIS LITE LAUNCHER                             ║"
    echo "║       (Isolated session — no persistence, no state)           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Check if lite session already exists
    if "$TMUX_BIN" has-session -t "$LITE_SESSION" 2>/dev/null; then
        echo -e "${GREEN}Lite session already running.${NC}"
        if [[ "$ITERM2_MODE" == "true" ]]; then
            exec "$TMUX_BIN" -CC attach-session -t "$LITE_SESSION"
        else
            exec "$TMUX_BIN" attach-session -t "$LITE_SESSION"
        fi
    fi

    if [[ ! -d "$LITE_PROJECT" ]]; then
        echo -e "${RED}ERROR: Lite workspace not found at $LITE_PROJECT${NC}"
        echo "Create it with: mkdir -p $LITE_PROJECT/.claude/hooks"
        exit 1
    fi

    # Determine Claude Code project slug for the lite workspace
    LITE_SLUG="-$(echo "$LITE_PROJECT" | sed 's|^/||; s|/|-|g')"
    LITE_PROJECTS_DIR="$HOME/.claude/projects/${LITE_SLUG}"

    echo -e "  ${CYAN}Project:${NC} $LITE_PROJECT"
    echo -e "  ${CYAN}Session:${NC} $LITE_SESSION"
    echo -e "  ${CYAN}Mode:${NC} ${YELLOW}LITE${NC} (no persistence, no Jarvis context)"
    echo ""

    # Claude command — no deterministic UUID, no resume, dangerously-skip-permissions
    LITE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000 JARVIS_LITE=true"
    LITE_CLAUDE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort medium --verbose"

    # Wrapper: run Claude, clean up JSONL on exit so --continue can't find it
    LITE_WRAPPER="export $LITE_ENV && $LITE_CLAUDE; echo ''; echo 'Lite session ended. Cleaning up...'; rm -f ${LITE_PROJECTS_DIR}/*.jsonl 2>/dev/null; echo 'Session data removed. Press Enter to close, or run claude for another session.'; read; $LITE_CLAUDE"

    # Create tmux session
    export TERM=xterm-256color
    "$TMUX_BIN" new-session -d -s "$LITE_SESSION" -n "Claude" -c "$LITE_PROJECT" "$LITE_WRAPPER"
    sleep 1

    # W1: Watcher for JICM safety (uses lite project dir)
    if [[ -x "$LITE_WATCHER" ]]; then
        "$TMUX_BIN" new-window -t "$LITE_SESSION" -n "Watcher" -d \
            "cd '$LITE_PROJECT' && CLAUDE_PROJECT_DIR='$LITE_PROJECT' TMUX_SESSION='$LITE_SESSION' '$LITE_WATCHER' --interval 5; echo 'Watcher stopped.'; read"
    fi

    # Set tmux options
    "$TMUX_BIN" set-option -t "$LITE_SESSION" mouse on 2>/dev/null || true
    "$TMUX_BIN" set-option -t "$LITE_SESSION" history-limit 10000 2>/dev/null || true
    "$TMUX_BIN" set-window-option -t "$LITE_SESSION:0" automatic-rename off 2>/dev/null || true
    "$TMUX_BIN" set-window-option -t "$LITE_SESSION:1" automatic-rename off 2>/dev/null || true

    echo ""
    echo -e "${GREEN}Lite session ready!${NC}"
    echo ""
    echo "Windows:"
    echo "  Window 0: Claude (fresh, no prior context)"
    echo "  Window 1: Watcher (JICM safety net)"
    echo ""
    echo "On exit: session JSONL will be automatically deleted."
    echo "Main 'jarvis' session is unaffected."
    echo ""

    if [[ "$ITERM2_MODE" == "true" ]]; then
        exec "$TMUX_BIN" -CC attach-session -t "$LITE_SESSION"
    else
        echo "Keyboard shortcuts:"
        echo "  Ctrl+b then 0-1 - Switch windows: Claude (0), Watcher (1)"
        echo "  Ctrl+b then d   - Detach (leave running)"
        echo "  Ctrl+b then x   - Close current window"
        echo ""
        exec "$TMUX_BIN" attach-session -t "$LITE_SESSION"
    fi
fi

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
echo "║              JARVIS TMUX LAUNCHER v2.4                        ║"
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

# ─── Service Pre-Flight ───────────────────────────────────────────────────────
# Ensures all Jarvis dependencies are healthy before launching Claude sessions.
# Auto-starts services we control (Docker stack, MLX embeddings, LiteLLM).
# Warns for externally managed services (Ollama via macOS launchd).

preflight_services() {
    echo -e "${CYAN}Service pre-flight checks...${NC}"
    local failures=0

    # 1. Docker Engine
    if docker info &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker Engine"
    else
        echo -e "  ${RED}✗${NC} Docker Engine — not running (start Docker Desktop)"
        failures=$((failures + 1))
    fi

    # 2. Docker Compose stack (5 containers: postgres, qdrant, neo4j, redis, n8n)
    local infra_dir="$PROJECT_DIR/infrastructure"
    if [[ -f "$infra_dir/docker-compose.yml" ]]; then
        local running_count
        running_count=$(cd "$infra_dir" && docker compose ps --format json 2>/dev/null | grep -c '"running"' || true)
        running_count=${running_count:-0}
        if [[ "$running_count" -ge 5 ]]; then
            echo -e "  ${GREEN}✓${NC} Docker Compose stack ($running_count containers)"
        else
            echo -e "  ${YELLOW}✗${NC} Docker Compose stack ($running_count/5 running) — starting..."
            (cd "$infra_dir" && docker compose up -d 2>/dev/null)
            # Wait up to 30s for containers
            local waited=0
            while [[ $waited -lt 30 ]]; do
                running_count=$(cd "$infra_dir" && docker compose ps --format json 2>/dev/null | grep -c '"running"' || true)
                running_count=${running_count:-0}
                if [[ "$running_count" -ge 5 ]]; then
                    break
                fi
                sleep 2
                waited=$((waited + 2))
            done
            if [[ "$running_count" -ge 5 ]]; then
                echo -e "  ${GREEN}✓${NC} Docker Compose stack ($running_count containers — started)"
            else
                echo -e "  ${RED}✗${NC} Docker Compose stack ($running_count/5 after ${waited}s)"
                failures=$((failures + 1))
            fi
        fi
    fi

    # 3. Ollama (macOS launchd managed — warn only)
    if curl -sf --max-time 2 http://localhost:11434/api/version &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Ollama (localhost:11434)"
    else
        echo -e "  ${YELLOW}⚠${NC} Ollama — not reachable (launchd-managed; check manually)"
    fi

    # 4. MLX Embedding Server
    if curl -sf --max-time 2 http://localhost:8000/health &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} MLX Embedding Server (localhost:8000)"
        MLX_STARTED_BY_PREFLIGHT=false
    else
        echo -e "  ${YELLOW}✗${NC} MLX Embedding Server — not running, will start in tmux window"
        MLX_STARTED_BY_PREFLIGHT=true
    fi

    # 5. LiteLLM Proxy
    # Note: /health probes all backends (hangs if Ollama models not loaded).
    # Use /v1/models instead — lightweight metadata check that confirms proxy is up.
    if curl -sf --max-time 2 http://localhost:4000/v1/models &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} LiteLLM Proxy (localhost:4000)"
    else
        echo -e "  ${YELLOW}✗${NC} LiteLLM Proxy — not running, will start in tmux window"
        LITELLM_STARTED_BY_PREFLIGHT=true
    fi

    # 6. Pulse API (AIfred-Pro Operations Archon)
    if curl -sf --max-time 2 http://localhost:8700/api/v1/health >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Pulse API (AIfred-Pro, port 8700)"
    else
        echo -e "  ${YELLOW}!${NC} Pulse API — not running (start: bash ~/Claude/AIFred-Pro/pulse/start-pulse.sh --background)"
    fi

    # 7. Pipeline Watcher (Pulse-Nexus Pipeline — Docker container or process)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^aifred-dev-pipeline$'; then
        echo -e "  ${GREEN}✓${NC} Pipeline Watcher (Docker: aifred-dev-pipeline)"
    elif pgrep -f 'pipeline-watcher.py' >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Pipeline Watcher (process: pipeline-watcher.py)"
    else
        echo -e "  ${YELLOW}!${NC} Pipeline Watcher — not running"
    fi

    if [[ $failures -gt 0 ]]; then
        echo -e "${RED}Pre-flight: $failures critical service(s) failed. Continuing anyway...${NC}"
    else
        echo -e "${GREEN}Pre-flight: all services healthy.${NC}"
    fi
    echo ""
}

# Track whether services need starting (set by preflight, used during window creation)
MLX_STARTED_BY_PREFLIGHT=false
LITELLM_STARTED_BY_PREFLIGHT=false

if [[ "$SKIP_PREFLIGHT" == "true" ]]; then
    echo -e "${YELLOW}Skipping pre-flight checks (--skip-preflight)${NC}"
    echo ""
else
    preflight_services
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
            DEV_SYSTEM_APPEND="You are W5:Jarvis-dev, the engineering/infrastructure agent. Focus on Jarvis core systems (JICM, hooks, AC components, skills, tmux, infrastructure). DwarfCron/Chronicler product work belongs to W0. Ignore DF-specific @-imports unless explicitly tasked with Chronicler work."
            if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
            else
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
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

    # Add missing service windows to existing session
    EXISTING_WINDOWS=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null)
    if [[ "$MLX_STARTED_BY_PREFLIGHT" == "true" ]] && ! echo "$EXISTING_WINDOWS" | grep -q "^MLX-Embed$"; then
        echo "Adding MLX-Embed window to existing session..."
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
            "cd '$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx' && bash start-server.sh; echo 'MLX-Embed stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:MLX-Embed" automatic-rename off 2>/dev/null || true
        WAITED=0
        while [[ $WAITED -lt 15 ]]; do
            if curl -sf --max-time 1 http://localhost:8000/health &>/dev/null; then
                echo -e "  ${GREEN}✓${NC} MLX Embedding Server ready (${WAITED}s)"
                break
            fi
            sleep 1
            WAITED=$((WAITED + 1))
        done
        [[ $WAITED -ge 15 ]] && echo -e "  ${YELLOW}⚠${NC} MLX Embedding Server still starting"
    fi
    if [[ "$LITELLM_STARTED_BY_PREFLIGHT" == "true" ]] && ! echo "$EXISTING_WINDOWS" | grep -q "^LiteLLM$"; then
        echo "Adding LiteLLM window to existing session..."
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "LiteLLM" -d \
            "cd '$PROJECT_DIR/infrastructure' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:LiteLLM" automatic-rename off 2>/dev/null || true
        WAITED=0
        while [[ $WAITED -lt 10 ]]; do
            if curl -sf --max-time 1 http://localhost:4000/v1/models &>/dev/null; then
                echo -e "  ${GREEN}✓${NC} LiteLLM Proxy ready (${WAITED}s)"
                break
            fi
            sleep 1
            WAITED=$((WAITED + 1))
        done
        [[ $WAITED -ge 10 ]] && echo -e "  ${YELLOW}⚠${NC} LiteLLM Proxy still starting"
    fi
    HUD_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-watcher-hud.sh"
    if [[ -x "$HUD_SCRIPT" ]] && ! echo "$EXISTING_WINDOWS" | grep -q "^HUD$"; then
        echo "Adding HUD window to existing session..."
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "HUD" -d \
            "cd '$PROJECT_DIR' && bash '$HUD_SCRIPT'; echo 'HUD stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:HUD" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} HUD-live dashboard added"
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
if [[ "$FRESH_MODE" == "true" ]]; then
    echo -e "  ${CYAN}W0 Mode:${NC} ${YELLOW}FRESH${NC} (new session pinned to $JARVIS_W0_SESSION_ID)"
else
    echo -e "  ${CYAN}W0 Mode:${NC} ${GREEN}RESUME${NC} (most recent non-W5 session)"
fi
echo -e "  ${CYAN}W5 UUID:${NC} $JARVIS_W5_SESSION_ID (excluded from W0 lookup)"
echo -e "  ${CYAN}Watcher:${NC} $([ "$WATCHER_ENABLED" = true ] && echo "${GREEN}ENABLED${NC}" || echo "${YELLOW}DISABLED${NC}")"
echo ""
echo "Starting Jarvis..."

# Set TERM for best compatibility with Claude's ink UI
export TERM=xterm-256color

# Context management environment variables
# - ENABLE_TOOL_SEARCH: Enable MCP tool search to reduce context usage
# - CLAUDE_CODE_MAX_OUTPUT_TOKENS: Set max output to 20K (affects effective context budget)
# Note: CLAUDE_AUTOCOMPACT_PCT_OVERRIDE set to 50% (500K at 1M window) as backstop
#       JICM triggers at 300K tokens (absolute); native autocompact is the safety net
# Determine session type
if [[ "$FRESH_MODE" == "true" ]]; then
    JARVIS_SESSION_TYPE="fresh"
else
    JARVIS_SESSION_TYPE="resume"
fi

# Usage proxy: route Anthropic API through local proxy for telemetry capture
# Proxy captures rate-limit headers + token usage per request → PostgreSQL
# See: projects/aifred-usage-tracking/anthropic-api-headers-reference.md
USAGE_PROXY_URL="${ANTHROPIC_BASE_URL:-http://localhost:9800}"

# x-aion-* attribution headers per reverse-proxy-paradigm-2026-05-05.md §8.5.
# Claude Code reads ANTHROPIC_CUSTOM_HEADERS at session start (Name: Value pairs,
# comma- or newline-separated). proxy.py:_parse_request_body falls back to these
# when body metadata is absent — they survive the SDK's body-redaction layer.
# Single UUID for both windows so cross-window calls correlate by session_id.
JARVIS_SESSION_UUID="${JARVIS_SESSION_UUID:-$(uuidgen)}"
W0_HEADERS="x-aion-project: project-aion,x-aion-agent-name: jarvis-w0,x-aion-session-id: $JARVIS_SESSION_UUID"
DEV_HEADERS="x-aion-project: project-aion,x-aion-agent-name: jarvis-dev-w5,x-aion-session-id: $JARVIS_SESSION_UUID"

#CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0 ANTHROPIC_BASE_URL=$USAGE_PROXY_URL"
CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0 ANTHROPIC_BASE_URL=$USAGE_PROXY_URL CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 MAX_THINKING_TOKENS=16000"

# Create new tmux session with Claude in the main pane
# W0 runs in a restart loop: first launch per mode, then --resume on re-entry
# W0: effort max, bypass permissions, full Opus 4.7 1M context, exclude dynamic system prompts
# Permission bypass: two complementary flags
#   --dangerously-skip-permissions: skips workspace trust dialog + enables bypass
#   --permission-mode bypassPermissions: explicitly sets session permission mode
#CLAUDE_BASE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort max --exclude-dynamic-system-prompt-sections --model 'claude-opus-4-7[1M]' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"
CLAUDE_BASE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --exclude-dynamic-system-prompt-sections --model 'claude-opus-4-6[1M]' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"

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
# NOTE: --continue and --resume/--session-id are mutually exclusive CLI flags.
# JICM /clear creates new session UUIDs, so we can't pin W0 to a deterministic UUID.
# Default mode finds the most recent non-W5 session and --resume's it explicitly.
if [[ "$FRESH_MODE" == "true" ]]; then
    # Fresh: archive existing session and start new with pinned UUID
    if [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
        mkdir -p "$W0_SESSION_ARCHIVE_DIR"
        ARCHIVE_NAME="w0-session-$(date +%Y%m%d-%H%M%S).jsonl"
        mv "$JARVIS_W0_SESSION_FILE" "$W0_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
        echo -e "  ${YELLOW}W0 session archived for --fresh → $ARCHIVE_NAME${NC}"
    fi
    CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
    echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
else
    # Default: resume W0 from state file, fall back to mtime heuristic
    if [[ -f "$W0_UUID_FILE" ]]; then
        LATEST_W0=$(cat "$W0_UUID_FILE" | tr -d '[:space:]')
        LATEST_W0_JSONL="$JARVIS_PROJECTS_DIR/${LATEST_W0}.jsonl"
        if [[ -n "$LATEST_W0" ]] && [[ -f "$LATEST_W0_JSONL" ]]; then
            echo -e "  ${CYAN}Resuming W0 from state file:${NC} $LATEST_W0"
            CLAUDE_FIRST="$CLAUDE_BASE --resume $LATEST_W0"
        else
            echo -e "  ${YELLOW}State file UUID stale (JSONL missing), falling back to heuristic${NC}"
            LATEST_W0=$(find_latest_w0_session)
            if [[ -n "$LATEST_W0" ]]; then
                echo -e "  ${CYAN}Resuming W0 session:${NC} $LATEST_W0"
                CLAUDE_FIRST="$CLAUDE_BASE --resume $LATEST_W0"
                echo "$LATEST_W0" > "$W0_UUID_FILE"
            else
                echo -e "  ${CYAN}No prior W0 session found — creating new${NC}"
                CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
                echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
            fi
        fi
    else
        # No state file yet — fall back to heuristic, seed the file
        LATEST_W0=$(find_latest_w0_session)
        if [[ -n "$LATEST_W0" ]]; then
            echo -e "  ${CYAN}Resuming W0 (seeding state file):${NC} $LATEST_W0"
            CLAUDE_FIRST="$CLAUDE_BASE --resume $LATEST_W0"
            echo "$LATEST_W0" > "$W0_UUID_FILE"
        else
            echo -e "  ${CYAN}No prior W0 session found — creating new${NC}"
            CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
            echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
        fi
    fi
fi

# Restart loop: --continue is safe here because W0's JSONL was the most recently
# modified file (it just exited). W5 contamination only affects initial launch.
CLAUDE_RESUME="$CLAUDE_BASE --continue"
W0_WRAPPER="export $CLAUDE_ENV && export ANTHROPIC_CUSTOM_HEADERS='$W0_HEADERS' && $CLAUDE_FIRST; while true; do echo ''; echo 'Claude exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $CLAUDE_RESUME; done"

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
    # Threshold=70 (default) — single compression threshold, no emergency/lockout
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Watcher" -d \
        "cd '$PROJECT_DIR' && '$WATCHER_SCRIPT' --interval 3; echo 'Watcher stopped.'; read"
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
    CLAUDE_ENV_DEV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 JARVIS_SESSION_ROLE=dev JARVIS_WINDOW=5 ANTHROPIC_BASE_URL=$USAGE_PROXY_URL"
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
    # W5 system prompt overlay — deprioritizes DwarfCron context, focuses on Jarvis core
    DEV_SYSTEM_APPEND="You are W5:Jarvis-dev, the engineering/infrastructure agent. Focus on Jarvis core systems (JICM, hooks, AC components, skills, tmux, infrastructure). DwarfCron/Chronicler product work belongs to W0. Ignore DF-specific @-imports unless explicitly tasked with Chronicler work."
    if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
    else
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
    fi
    # Preload dev instructions file into context on launch
    DEV_INIT_PROMPT="Please load these files into context: @${DEV_INSTRUCTIONS}"
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
        "cd '$PROJECT_DIR' && export $CLAUDE_ENV_DEV && export ANTHROPIC_CUSTOM_HEADERS='$DEV_HEADERS' && $CLAUDE_CMD_DEV '$DEV_INIT_PROMPT'"
    "$TMUX_BIN" set-window-option -t "$SESSION_NAME:5" automatic-rename off 2>/dev/null || true
fi

# MLX-Embed window — auto-start embedding server if preflight detected it was down
if [[ "$MLX_STARTED_BY_PREFLIGHT" == "true" ]]; then
    echo "Launching MLX Embedding Server in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
        "cd '$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx' && bash start-server.sh; echo 'MLX-Embed stopped.'; read"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:MLX-Embed" automatic-rename off 2>/dev/null || true
    # Wait up to 15s for MLX health endpoint
    WAITED=0
    while [[ $WAITED -lt 15 ]]; do
        if curl -sf --max-time 1 http://localhost:8000/health &>/dev/null; then
            echo -e "  ${GREEN}✓${NC} MLX Embedding Server ready (${WAITED}s)"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done
    if [[ $WAITED -ge 15 ]]; then
        echo -e "  ${YELLOW}⚠${NC} MLX Embedding Server still starting after 15s (may need longer for model load)"
    fi
fi

# LiteLLM window — auto-start proxy if preflight detected it was down
if [[ "$LITELLM_STARTED_BY_PREFLIGHT" == "true" ]]; then
    echo "Launching LiteLLM Proxy in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "LiteLLM" -d \
        "cd '$PROJECT_DIR/infrastructure' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:LiteLLM" automatic-rename off 2>/dev/null || true
    # Wait up to 10s for /v1/models endpoint
    WAITED=0
    while [[ $WAITED -lt 10 ]]; do
        if curl -sf --max-time 1 http://localhost:4000/v1/models &>/dev/null; then
            echo -e "  ${GREEN}✓${NC} LiteLLM Proxy ready (${WAITED}s)"
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done
    if [[ $WAITED -ge 10 ]]; then
        echo -e "  ${YELLOW}⚠${NC} LiteLLM Proxy still starting after 10s"
    fi
fi

# HUD-live window — always launch (read-only dashboard, negligible resource cost)
HUD_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-watcher-hud.sh"
if [[ -x "$HUD_SCRIPT" ]]; then
    echo "Launching HUD-live dashboard in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "HUD" -d \
        "cd '$PROJECT_DIR' && bash '$HUD_SCRIPT'; echo 'HUD stopped.'; read"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:HUD" automatic-rename off 2>/dev/null || true
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
[[ "$MLX_STARTED_BY_PREFLIGHT" == "true" ]] && echo "  Window  : MLX-Embed (embedding server)"
[[ "$LITELLM_STARTED_BY_PREFLIGHT" == "true" ]] && echo "  Window  : LiteLLM (proxy server)"
[[ -x "$HUD_SCRIPT" ]] && echo "  Window  : HUD (live dashboard)"
echo ""
echo "Services:"
echo -n "  Docker: "; docker info &>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
echo -n "  MLX Embed: "; curl -sf --max-time 1 http://localhost:8000/health &>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}starting${NC}"
echo -n "  LiteLLM: "; curl -sf --max-time 1 http://localhost:4000/v1/models &>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}⚠${NC}"
echo -n "  Ollama: "; curl -sf --max-time 1 http://localhost:11434/api/version &>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}⚠${NC}"
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
