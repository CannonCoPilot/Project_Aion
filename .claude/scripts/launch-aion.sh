#!/bin/bash
# Launch Aion (Jarvis + Alfred unified Archon session) in a tmux session for autonomous control
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
#   (default)    Full Aion with session persistence (W0-W4, resume by UUID)
#   --dev        Add W5 Jarvis-dev test driver
#   --fresh      Full Aion but new session (archive old, start clean)
#   --lite       Isolated one-off session (W0+Watcher only, no persistence,
#                separate tmux session 'lite', minimal CLAUDE.md ~340 tokens,
#                JSONL cleaned on exit — for ad hoc tasks and small projects)
#
# iTerm2 Integration:
#   Use --iterm2 flag to attach with tmux -CC for native iTerm2 tabs
#   This makes tmux windows appear as standard iTerm2 tabs/windows
#
# Updated: 2026-06-04 — v3.0: Aion monorepo launcher (replaces launch-jarvis-tmux.sh)

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
SESSION_NAME="${TMUX_SESSION:-aion}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
ALFRED_DIR="$PROJECT_DIR/alfred"
# Claude Code derives its project slug from PWD at launch time. Sessions created
# via ~/Claude/Jarvis live under slug -Users-*-Claude-Jarvis. We MUST cd through
# the symlink path when launching Claude, otherwise it creates a new empty slug.
# CLAUDE_LAUNCH_DIR: the path used for `cd` in Claude session windows.
# PROJECT_DIR: the real path used for file operations (scripts, configs, etc.).
JARVIS_SYMLINK="$HOME/Claude/Jarvis"
if [[ -L "$JARVIS_SYMLINK" ]]; then
    CLAUDE_LAUNCH_DIR="$JARVIS_SYMLINK"
else
    CLAUDE_LAUNCH_DIR="$PROJECT_DIR"
fi
CLAUDE_PROJECT_SLUG="-$(echo "$CLAUDE_LAUNCH_DIR" | sed 's|^/||; s|/|-|g')"

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
HEALTH_CHECK_ONLY=false
RESTART_COMPONENT=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --iterm2|-i) ITERM2_MODE=true; shift ;;
        --fresh|-f) FRESH_MODE=true; shift ;;
        --dev|-d) DEV_MODE=true; shift ;;
        --lite|-l) LITE_MODE=true; shift ;;
        --skip-preflight|-s) SKIP_PREFLIGHT=true; shift ;;
        --health|-h) HEALTH_CHECK_ONLY=true; shift ;;
        --restart|-r) RESTART_COMPONENT="${2:-all}"; shift 2 ;;
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
    echo "║          PROJECT AION  ·  Lite Launcher v3.1                  ║"
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
    echo -e "  ${CYAN}Mode:${NC} ${YELLOW}LITE${NC} (no persistence, no Aion context)"
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
    echo "Main 'aion' session is unaffected."
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
echo "║               PROJECT AION  ·  Launcher v3.1                  ║"
echo "║         Jarvis (Master Archon) + Alfred (Ops Archon)          ║"
echo "║       Deterministic UUIDs · Aion Quartet · JICM v7.9         ║"
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
# Comprehensive pre-flight for the entire Aion environment.
# Auto-starts services we control (Docker stacks, MLX, LiteLLM).
# Warns for externally managed services (Ollama via macOS launchd).

check_port() {
    curl -sf --max-time 2 "http://localhost:${1}${2:-/}" >/dev/null 2>&1
}

check_container() {
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${1}$"
}

preflight_services() {
    echo -e "${CYAN}Pre-flight checks — Aion environment${NC}"
    echo ""
    local failures=0 warnings=0

    # ── Section 1: Docker Engine ────────────────────────────────────────────
    echo -e "  ${CYAN}[Docker Engine]${NC}"
    if docker info &>/dev/null; then
        echo -e "    ${GREEN}✓${NC} Docker Engine running"
    else
        echo -e "    ${RED}✗${NC} Docker Engine — not running (start Docker Desktop)"
        failures=$((failures + 1))
        echo ""
        echo -e "  ${RED}Cannot continue pre-flight without Docker. Start Docker Desktop and retry.${NC}"
        return 1
    fi

    # ── Section 2: Jarvis Infrastructure (5 services) ───────────────────────
    echo -e "  ${CYAN}[Jarvis Infrastructure]${NC}"
    local infra_dir="$PROJECT_DIR/infrastructure"
    if [[ -f "$infra_dir/docker-compose.yml" ]]; then
        local running_count
        running_count=$(cd "$infra_dir" && docker compose ps --format json 2>/dev/null | grep -c '"running"' || true)
        running_count=${running_count:-0}
        if [[ "$running_count" -lt 5 ]]; then
            echo -e "    ${YELLOW}…${NC} Infrastructure stack ($running_count/5 running) — starting..."
            (cd "$infra_dir" && docker compose up -d 2>/dev/null)
            local waited=0
            while [[ $waited -lt 30 ]]; do
                running_count=$(cd "$infra_dir" && docker compose ps --format json 2>/dev/null | grep -c '"running"' || true)
                running_count=${running_count:-0}
                [[ "$running_count" -ge 5 ]] && break
                sleep 2; waited=$((waited + 2))
            done
        fi
        if [[ "$running_count" -ge 5 ]]; then
            echo -e "    ${GREEN}✓${NC} Compose stack ($running_count containers)"
        else
            echo -e "    ${RED}✗${NC} Compose stack ($running_count/5 after ${waited:-0}s)"
            failures=$((failures + 1))
        fi
    fi
    # Individual service health (port-level, not just container count)
    # PostgreSQL: not HTTP — use pg_isready or TCP probe
    if command -v pg_isready &>/dev/null && pg_isready -h localhost -p 5432 &>/dev/null; then
        echo -e "    ${GREEN}✓${NC} PostgreSQL/ParadeDB (:5432)"
    elif check_container jarvis-postgres; then
        echo -e "    ${GREEN}✓${NC} PostgreSQL/ParadeDB (container healthy)"
    else
        echo -e "    ${RED}✗${NC} PostgreSQL/ParadeDB — not reachable on :5432"
        failures=$((failures + 1))
    fi
    if check_port 6333 "/collections"; then
        echo -e "    ${GREEN}✓${NC} Qdrant (:6333)"
    else
        echo -e "    ${RED}✗${NC} Qdrant — not reachable on :6333"
        failures=$((failures + 1))
    fi
    if check_port 7474; then
        echo -e "    ${GREEN}✓${NC} Neo4j (:7474 browser, :7687 bolt)"
    else
        echo -e "    ${RED}✗${NC} Neo4j — not reachable on :7474"
        failures=$((failures + 1))
    fi
    if check_container jarvis-redis; then
        echo -e "    ${GREEN}✓${NC} Redis (:6379, RedisInsight :8001)"
    else
        echo -e "    ${YELLOW}⚠${NC} Redis — container not detected"
        warnings=$((warnings + 1))
    fi
    if check_port 5678; then
        echo -e "    ${GREEN}✓${NC} n8n (:5678)"
    else
        echo -e "    ${YELLOW}⚠${NC} n8n — not reachable on :5678"
        warnings=$((warnings + 1))
    fi

    # ── Section 3: Alfred Dev Stack (6 services) ────────────────────────────
    echo -e "  ${CYAN}[Alfred Ops Archon — Dev Stack]${NC}"
    local aifred_dev_dir="$ALFRED_DIR"
    if [[ -f "$aifred_dev_dir/docker-compose.yml" ]]; then
        local dev_running
        dev_running=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c 'aifred-dev-' || true)
        if [[ "$dev_running" -lt 4 ]]; then
            echo -e "    ${YELLOW}…${NC} Alfred stack ($dev_running running) — starting..."
            (cd "$aifred_dev_dir" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d 2>/dev/null)
            local waited=0
            while [[ $waited -lt 45 ]]; do
                dev_running=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c 'aifred-dev-' || true)
                [[ "$dev_running" -ge 4 ]] && break
                sleep 3; waited=$((waited + 3))
            done
        fi
        if [[ "$dev_running" -ge 4 ]]; then
            echo -e "    ${GREEN}✓${NC} Compose stack ($dev_running containers)"
        else
            echo -e "    ${RED}✗${NC} Compose stack ($dev_running after ${waited:-0}s)"
            failures=$((failures + 1))
        fi
    fi
    # Pulse API
    if check_port 8800 "/api/v1/health"; then
        echo -e "    ${GREEN}✓${NC} Pulse API (:8800)"
    else
        echo -e "    ${YELLOW}⚠${NC} Pulse API — not reachable on :8800"
        warnings=$((warnings + 1))
    fi
    # Nexus Dashboard (prod-style)
    if check_port 8701; then
        echo -e "    ${GREEN}✓${NC} Nexus Dashboard (:8701)"
    else
        echo -e "    ${YELLOW}⚠${NC} Nexus Dashboard — not reachable on :8701"
        warnings=$((warnings + 1))
    fi
    # Vite dev sidecar
    if check_port 8702; then
        echo -e "    ${GREEN}✓${NC} Vite Dev Sidecar (:8702)"
    else
        echo -e "    ${YELLOW}⚠${NC} Vite Dev Sidecar — not reachable on :8702 (hot-reload may be slow to start)"
        warnings=$((warnings + 1))
    fi
    # Usage Proxy + failover
    if check_port 9800 "/health"; then
        echo -e "    ${GREEN}✓${NC} Usage Proxy (:9800)"
        export ANTHROPIC_BASE_URL="http://localhost:9800"
    else
        echo -e "    ${YELLOW}⚠${NC} Usage Proxy DOWN — telemetry offline, routing direct to Anthropic"
        unset ANTHROPIC_BASE_URL
        PROXY_OFFLINE=true
        warnings=$((warnings + 1))
    fi
    # Pipeline Watcher
    if check_container aifred-dev-pipeline; then
        echo -e "    ${GREEN}✓${NC} Pipeline Watcher (Docker)"
    else
        echo -e "    ${YELLOW}⚠${NC} Pipeline Watcher — not running"
        warnings=$((warnings + 1))
    fi
    # Host Executor Bridge
    local bridge_heartbeat="$ALFRED_DIR/.claude/jobs/state/.bridge-heartbeat"
    if [[ -f "$bridge_heartbeat" ]]; then
        local bridge_age=$(( $(date +%s) - $(date -r "$bridge_heartbeat" +%s 2>/dev/null || echo 0) ))
        if [[ "$bridge_age" -lt 60 ]]; then
            echo -e "    ${GREEN}✓${NC} Host Executor Bridge (heartbeat ${bridge_age}s ago)"
        else
            echo -e "    ${YELLOW}⚠${NC} Host Executor Bridge (stale heartbeat: ${bridge_age}s)"
            warnings=$((warnings + 1))
        fi
    else
        echo -e "    ${YELLOW}⚠${NC} Host Executor Bridge — no heartbeat file"
        warnings=$((warnings + 1))
    fi

    # ── Section 4: Optional Stacks (Authentik, Caddy, Monitoring, MCP-GW) ──
    echo -e "  ${CYAN}[Optional Infrastructure]${NC}"
    # Authentik (SSO)
    if check_container authentik_server; then
        if check_port 9000; then
            echo -e "    ${GREEN}✓${NC} Authentik SSO (:9000, :9443)"
        else
            echo -e "    ${YELLOW}⚠${NC} Authentik container up but :9000 not reachable"
            warnings=$((warnings + 1))
        fi
    else
        echo -e "    ${YELLOW}·${NC} Authentik SSO — not running (optional)"
    fi
    # Caddy (reverse proxy)
    if check_container caddy; then
        echo -e "    ${GREEN}✓${NC} Caddy reverse proxy (:80, :443)"
    else
        echo -e "    ${YELLOW}·${NC} Caddy — not running (optional)"
    fi
    # Monitoring (Prometheus + Grafana)
    local mon_count=0
    check_container aifred-prometheus && mon_count=$((mon_count + 1))
    check_container aifred-pushgateway && mon_count=$((mon_count + 1))
    check_container aifred-grafana && mon_count=$((mon_count + 1))
    if [[ $mon_count -ge 3 ]]; then
        echo -e "    ${GREEN}✓${NC} Monitoring stack ($mon_count/3: Prometheus :9090, Pushgateway :9091, Grafana :3002)"
    elif [[ $mon_count -gt 0 ]]; then
        echo -e "    ${YELLOW}⚠${NC} Monitoring stack partial ($mon_count/3)"
        warnings=$((warnings + 1))
    else
        echo -e "    ${YELLOW}·${NC} Monitoring stack — not running (optional)"
    fi
    # MCP Gateway
    if check_container mcp-gateway || docker ps --format '{{.Config.Image}}' 2>/dev/null | grep -q 'mcp-gateway'; then
        echo -e "    ${GREEN}✓${NC} MCP Gateway (:8811)"
    elif docker ps --format '{{.Image}}' 2>/dev/null | grep -q 'mcp-gateway'; then
        echo -e "    ${GREEN}✓${NC} MCP Gateway (running, non-standard name)"
    else
        echo -e "    ${YELLOW}·${NC} MCP Gateway — not running (optional)"
    fi

    # ── Section 5: AI Services (Ollama, MLX, LiteLLM) ──────────────────────
    echo -e "  ${CYAN}[AI Services]${NC}"
    # Ollama
    if check_port 11434 "/api/version"; then
        local model_count
        model_count=$(curl -sf --max-time 3 http://localhost:11434/api/tags 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "?")
        echo -e "    ${GREEN}✓${NC} Ollama (:11434, $model_count models available)"
    else
        echo -e "    ${YELLOW}⚠${NC} Ollama — not reachable (launchd-managed; check manually)"
        warnings=$((warnings + 1))
    fi
    # MLX Embedding Server
    if check_port 8000 "/health"; then
        echo -e "    ${GREEN}✓${NC} MLX Embedding Server (:8000, Qwen3-Embedding-4B)"
        MLX_STARTED_BY_PREFLIGHT=false
    else
        echo -e "    ${YELLOW}…${NC} MLX Embedding Server — will start in tmux window"
        MLX_STARTED_BY_PREFLIGHT=true
    fi
    # LiteLLM Proxy (use /v1/models — /health probes backends and can hang)
    if check_port 4000 "/v1/models"; then
        echo -e "    ${GREEN}✓${NC} LiteLLM Proxy (:4000)"
    else
        echo -e "    ${YELLOW}…${NC} LiteLLM Proxy — will start in tmux window"
        LITELLM_STARTED_BY_PREFLIGHT=true
    fi

    # ── Section 6: MCP Servers ──────────────────────────────────────────────
    echo -e "  ${CYAN}[MCP Servers]${NC}"
    # jarvis-rag: depends on Qdrant + MLX
    if check_port 6333 "/collections" && (check_port 8000 "/health" || [[ "$MLX_STARTED_BY_PREFLIGHT" == "true" ]]); then
        echo -e "    ${GREEN}✓${NC} jarvis-rag (Qdrant + MLX backends available)"
    else
        echo -e "    ${YELLOW}⚠${NC} jarvis-rag — backend(s) missing (Qdrant:6333 or MLX:8000)"
        warnings=$((warnings + 1))
    fi
    # jarvis-graphiti: depends on Neo4j + LiteLLM
    if check_port 7474 && (check_port 4000 "/v1/models" || [[ "$LITELLM_STARTED_BY_PREFLIGHT" == "true" ]]); then
        echo -e "    ${GREEN}✓${NC} jarvis-graphiti (Neo4j + LiteLLM backends available)"
    else
        echo -e "    ${YELLOW}⚠${NC} jarvis-graphiti — backend(s) missing (Neo4j:7474 or LiteLLM:4000)"
        warnings=$((warnings + 1))
    fi
    # jarvis-pulse: depends on Pulse API
    if check_port 8800 "/api/v1/health"; then
        echo -e "    ${GREEN}✓${NC} jarvis-pulse (Pulse API :8800)"
    else
        echo -e "    ${YELLOW}⚠${NC} jarvis-pulse — Pulse API not reachable"
        warnings=$((warnings + 1))
    fi

    # ── Section 7: LaunchAgents ─────────────────────────────────────────────
    echo -e "  ${CYAN}[LaunchAgents]${NC}"
    local agents_loaded=0 agents_total=0
    for agent in com.aion.nexus-dev-dispatcher com.aion.nexus-dev-watchdog com.aion.jarvis-cost-watcher com.aion.token-compression-reminder; do
        agents_total=$((agents_total + 1))
        if launchctl list "$agent" &>/dev/null; then
            agents_loaded=$((agents_loaded + 1))
        else
            local plist_path="$HOME/Library/LaunchAgents/${agent}.plist"
            if [[ -f "$plist_path" ]]; then
                launchctl load "$plist_path" 2>/dev/null
                if launchctl list "$agent" &>/dev/null; then
                    agents_loaded=$((agents_loaded + 1))
                fi
            fi
        fi
    done
    if [[ $agents_loaded -ge $agents_total ]]; then
        echo -e "    ${GREEN}✓${NC} All $agents_loaded/$agents_total agents loaded"
    else
        echo -e "    ${YELLOW}⚠${NC} $agents_loaded/$agents_total agents loaded"
        warnings=$((warnings + 1))
    fi

    # ── Summary ─────────────────────────────────────────────────────────────
    echo ""
    if [[ $failures -gt 0 ]]; then
        echo -e "  ${RED}Pre-flight: $failures CRITICAL failure(s), $warnings warning(s). Continuing...${NC}"
    elif [[ $warnings -gt 0 ]]; then
        echo -e "  ${GREEN}Pre-flight: OK${NC} ${YELLOW}($warnings non-critical warning(s))${NC}"
    else
        echo -e "  ${GREEN}Pre-flight: all systems nominal.${NC}"
    fi
    echo ""
}

# Track whether services need starting (set by preflight, used during window creation)
MLX_STARTED_BY_PREFLIGHT=false
LITELLM_STARTED_BY_PREFLIGHT=false
PROXY_OFFLINE=false

# ─── Health Check Mode ──────────────────────────────────────────────────────
if [[ "$HEALTH_CHECK_ONLY" == "true" ]]; then
    preflight_services
    echo ""
    echo -e "${CYAN}Health check complete. Exiting.${NC}"
    exit 0
fi

# ─── Restart Mode ────────────────────────────────────────────────────────────
if [[ -n "$RESTART_COMPONENT" ]]; then
    AIFRED_DEV_DIR="$ALFRED_DIR"
    case "$RESTART_COMPONENT" in
        infra)
            echo "Restarting infrastructure compose..."
            (cd "$PROJECT_DIR/infrastructure" && docker compose restart)
            ;;
        pulse)
            echo "Restarting Pulse..."
            docker stop aifred-dev-pulse 2>/dev/null; docker rm aifred-dev-pulse 2>/dev/null
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d --no-deps pulse 2>/dev/null)
            ;;
        proxy)
            echo "Restarting Usage Proxy..."
            docker stop aifred-dev-usage-proxy 2>/dev/null; docker rm aifred-dev-usage-proxy 2>/dev/null
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d --no-deps usage-proxy 2>/dev/null)
            ;;
        dashboard)
            echo "Restarting Dashboard..."
            docker stop aifred-dev-dashboard aifred-dev-dashboard-vite 2>/dev/null
            docker rm aifred-dev-dashboard aifred-dev-dashboard-vite 2>/dev/null
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d --no-deps nexus-dashboard dashboard-dev 2>/dev/null)
            ;;
        pipeline)
            echo "Restarting Pipeline Watcher..."
            docker stop aifred-dev-pipeline 2>/dev/null; docker rm aifred-dev-pipeline 2>/dev/null
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d --no-deps pipeline 2>/dev/null)
            ;;
        watcher)
            echo "Restarting JICM Watcher (W1)..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:1" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:1" "$WATCHER_SCRIPT" Enter 2>/dev/null
            ;;
        hud)
            echo "Restarting HUD..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:HUD" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:HUD" "$PROJECT_DIR/.claude/scripts/jicm-watcher-hud.sh" Enter 2>/dev/null
            ;;
        bridge)
            echo "Restarting Host Executor Bridge..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Bridge" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:Bridge" \
                "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Bridge stopped.'; read" 2>/dev/null \
                || "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Bridge" -d \
                    "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Bridge stopped.'; read"
            ;;
        all)
            echo "Full restart..."
            (cd "$PROJECT_DIR/infrastructure" && docker compose restart 2>/dev/null)
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d 2>/dev/null)
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Bridge" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:Bridge" \
                "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Bridge stopped.'; read" 2>/dev/null || true
            echo "Docker stacks + bridge restarted. tmux processes unchanged."
            ;;
        ollama)
            echo "Restarting Ollama monitor window..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Ollama" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Ollama" "" Enter 2>/dev/null
            ;;
        mlx)
            echo "Restarting MLX-Embed..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:MLX-Embed" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:MLX-Embed" \
                "cd '$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx' && bash start-server.sh; echo 'MLX-Embed stopped.'; read" 2>/dev/null || true
            ;;
        litellm)
            echo "Restarting LiteLLM..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:LiteLLM" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:LiteLLM" \
                "cd '$PROJECT_DIR/infrastructure' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read" 2>/dev/null || true
            ;;
        *)
            echo "Unknown component: $RESTART_COMPONENT"
            echo "Available: infra, pulse, proxy, dashboard, pipeline, bridge, watcher, hud, ollama, mlx, litellm, all"
            exit 1
            ;;
    esac
    echo "Restart complete."
    exit 0
fi

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
            DEV_SESSION_MAX_BYTES=5242880
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
            DEV_SYSTEM_APPEND="You are W5:Jarvis-dev, the engineering/infrastructure agent. Focus on Aion core systems (JICM, hooks, AC components, skills, tmux, infrastructure). DwarfCron/Chronicler product work belongs to W0. Ignore DF-specific @-imports unless explicitly tasked with Chronicler work."
            if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
            else
                CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
            fi
            DEV_INIT_PROMPT="Please load these files into context: @${DEV_INSTRUCTIONS}"
            "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
                "cd '$CLAUDE_LAUNCH_DIR' && export $CLAUDE_ENV_DEV && $CLAUDE_CMD_DEV '$DEV_INIT_PROMPT'"
            "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Jarvis-dev" automatic-rename off 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Jarvis-dev window created"
        else
            echo "  Jarvis-dev window already exists."
        fi
    fi

    # Add missing service windows to existing session
    EXISTING_WINDOWS=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null)
    if ! echo "$EXISTING_WINDOWS" | grep -q "^MLX-Embed$"; then
        echo "Adding MLX-Embed window to existing session..."
        MLX_EMBED_DIR="$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx"
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
            "cd '$MLX_EMBED_DIR' && bash start-server.sh; echo 'MLX-Embed stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:MLX-Embed" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} MLX-Embed window added"
    fi
    if ! echo "$EXISTING_WINDOWS" | grep -q "^LiteLLM$"; then
        echo "Adding LiteLLM window to existing session..."
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "LiteLLM" -d \
            "cd '$PROJECT_DIR/infrastructure' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:LiteLLM" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} LiteLLM window added"
    fi
    if ! echo "$EXISTING_WINDOWS" | grep -q "^Ollama$"; then
        echo "Adding Ollama monitor window to existing session..."
        OLLAMA_MONITOR='while true; do clear; echo "Ollama Model Monitor (:11434)"; echo ""; if curl -sf --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then echo "Status: ONLINE"; echo ""; echo "── Loaded ──"; ollama ps 2>/dev/null; echo ""; echo "── Available ──"; ollama list 2>/dev/null; else echo "Status: OFFLINE"; fi; echo ""; echo "Refresh: 30s"; sleep 30; done'
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Ollama" -d "bash -c '$OLLAMA_MONITOR'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Ollama" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} Ollama monitor added"
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
echo -e "  ${CYAN}Launch dir:${NC} $CLAUDE_LAUNCH_DIR"
echo -e "  ${CYAN}Session:${NC} $SESSION_NAME"
echo -e "  ${CYAN}Watcher:${NC} $([ "$WATCHER_ENABLED" = true ] && echo "${GREEN}ENABLED${NC}" || echo "${YELLOW}DISABLED${NC}")"
echo ""
echo "Starting Aion..."

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
# Primary: --resume <UUID> (preserves session identity across relaunches).
# Fallback: --continue (if resume fails due to busy/stale session index).
# ~/.claude/sessions/<pid>.json tracks active sessions — --resume rejects
# sessions marked "busy". Exit the old Claude session before relaunching.
if [[ "$FRESH_MODE" == "true" ]]; then
    if [[ -f "$JARVIS_W0_SESSION_FILE" ]]; then
        mkdir -p "$W0_SESSION_ARCHIVE_DIR"
        ARCHIVE_NAME="w0-session-$(date +%Y%m%d-%H%M%S).jsonl"
        mv "$JARVIS_W0_SESSION_FILE" "$W0_SESSION_ARCHIVE_DIR/$ARCHIVE_NAME"
        echo -e "  ${YELLOW}W0 session archived for --fresh → $ARCHIVE_NAME${NC}"
    fi
    CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
    echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
    echo -e "  ${CYAN}W0 Mode:${NC} ${YELLOW}FRESH${NC} (new session $JARVIS_W0_SESSION_ID)"
else
    # Find the most recent W0 session to resume
    if [[ -f "$W0_UUID_FILE" ]]; then
        LATEST_W0=$(cat "$W0_UUID_FILE" | tr -d '[:space:]')
        LATEST_W0_JSONL="$JARVIS_PROJECTS_DIR/${LATEST_W0}.jsonl"
        if [[ -n "$LATEST_W0" ]] && [[ -f "$LATEST_W0_JSONL" ]]; then
            echo -e "  ${CYAN}W0 UUID:${NC} $LATEST_W0 (from state file)"
        else
            LATEST_W0=$(find_latest_w0_session)
            if [[ -n "$LATEST_W0" ]]; then
                echo "$LATEST_W0" > "$W0_UUID_FILE"
            fi
        fi
    else
        LATEST_W0=$(find_latest_w0_session)
        [[ -n "$LATEST_W0" ]] && echo "$LATEST_W0" > "$W0_UUID_FILE"
    fi

    if [[ -n "$LATEST_W0" ]]; then
        # --resume preserves UUID; || --continue as fallback if session is busy
        CLAUDE_FIRST="$CLAUDE_BASE --resume $LATEST_W0 || (echo 'Resume failed (session busy?) — falling back to --continue'; $CLAUDE_BASE --continue)"
        echo -e "  ${CYAN}W0 Mode:${NC} ${GREEN}RESUME${NC} $LATEST_W0 (fallback: --continue)"
    else
        CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
        echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
        echo -e "  ${CYAN}W0 Mode:${NC} ${YELLOW}NEW${NC} (no prior session found)"
    fi
fi

# Propagate W0 session ID to Alfred pipeline state for extend-then-fork execution.
# Executor tasks fork from this session to inherit Jarvis's warm cache prefix.
JARVIS_SESSION_ID_FOR_PIPELINE=$(cat "$W0_UUID_FILE" 2>/dev/null | tr -d '[:space:]')
if [[ -n "$JARVIS_SESSION_ID_FOR_PIPELINE" ]]; then
    PIPELINE_STATE_DIR="$ALFRED_DIR/.claude/jobs/state"
    mkdir -p "$PIPELINE_STATE_DIR"
    echo "$JARVIS_SESSION_ID_FOR_PIPELINE" > "$PIPELINE_STATE_DIR/jarvis-session-id"
fi

# Restart loop: --continue is safe here because W0's JSONL was the most recently
# modified file (it just exited). W5 contamination only affects initial launch.
CLAUDE_RESUME="$CLAUDE_BASE --continue"
W0_WRAPPER="export $CLAUDE_ENV && export ANTHROPIC_CUSTOM_HEADERS='$W0_HEADERS' && $CLAUDE_FIRST; while true; do echo ''; echo 'Claude exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $CLAUDE_RESUME; done"

"$TMUX_BIN" new-session -d -s "$SESSION_NAME" -n "Jarvis" -c "$CLAUDE_LAUNCH_DIR" "$W0_WRAPPER"

# Give Claude a moment to start
sleep 2

# Launch watcher in a tmux window (terminal-agnostic)
if [[ "$WATCHER_ENABLED" = true ]]; then
    echo "Launching watcher in tmux window..."

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
    DEV_SESSION_MAX_BYTES=5242880
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
    DEV_SYSTEM_APPEND="You are W5:Jarvis-dev, the engineering/infrastructure agent. Focus on Aion core systems (JICM, hooks, AC components, skills, tmux, infrastructure). DwarfCron/Chronicler product work belongs to W0. Ignore DF-specific @-imports unless explicitly tasked with Chronicler work."
    if [[ -f "$JARVIS_DEV_SESSION_FILE" ]]; then
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --resume $JARVIS_DEV_SESSION_ID"
    else
        CLAUDE_CMD_DEV="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort high --append-system-prompt '$DEV_SYSTEM_APPEND' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log --session-id $JARVIS_DEV_SESSION_ID"
    fi
    DEV_INIT_PROMPT="Please load these files into context: @${DEV_INSTRUCTIONS}"
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
        "cd '$CLAUDE_LAUNCH_DIR' && export $CLAUDE_ENV_DEV && export ANTHROPIC_CUSTOM_HEADERS='$DEV_HEADERS' && $CLAUDE_CMD_DEV '$DEV_INIT_PROMPT'"
    "$TMUX_BIN" set-window-option -t "$SESSION_NAME:5" automatic-rename off 2>/dev/null || true
fi

# MLX-Embed window — always present; starts server if not already running
MLX_EMBED_DIR="$PROJECT_DIR/infrastructure/qwen3-embeddings-mlx"
if [[ -d "$MLX_EMBED_DIR" ]]; then
    echo "Launching MLX-Embed window..."
    if [[ "$MLX_STARTED_BY_PREFLIGHT" == "true" ]]; then
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
            "cd '$MLX_EMBED_DIR' && bash start-server.sh; echo 'MLX-Embed stopped.'; read"
        WAITED=0
        while [[ $WAITED -lt 15 ]]; do
            curl -sf --max-time 1 http://localhost:8000/health &>/dev/null && break
            sleep 1; WAITED=$((WAITED + 1))
        done
        [[ $WAITED -lt 15 ]] && echo -e "  ${GREEN}✓${NC} MLX Embedding Server started (${WAITED}s)" \
            || echo -e "  ${YELLOW}⚠${NC} MLX Embedding Server still loading model"
    else
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "MLX-Embed" -d \
            "cd '$MLX_EMBED_DIR' && echo 'MLX Embedding Server already running on :8000'; echo 'Restart: bash start-server.sh'; echo ''; bash start-server.sh; echo 'MLX-Embed stopped.'; read"
        echo -e "  ${GREEN}✓${NC} MLX-Embed window (server already running on :8000)"
    fi
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:MLX-Embed" automatic-rename off 2>/dev/null || true
fi

# LiteLLM window — always present; starts proxy if not already running
LITELLM_DIR="$PROJECT_DIR/infrastructure"
if [[ -f "$LITELLM_DIR/litellm-config.yaml" ]]; then
    echo "Launching LiteLLM window..."
    if [[ "$LITELLM_STARTED_BY_PREFLIGHT" == "true" ]]; then
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "LiteLLM" -d \
            "cd '$LITELLM_DIR' && .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
        WAITED=0
        while [[ $WAITED -lt 10 ]]; do
            curl -sf --max-time 1 http://localhost:4000/v1/models &>/dev/null && break
            sleep 1; WAITED=$((WAITED + 1))
        done
        [[ $WAITED -lt 10 ]] && echo -e "  ${GREEN}✓${NC} LiteLLM Proxy started (${WAITED}s)" \
            || echo -e "  ${YELLOW}⚠${NC} LiteLLM Proxy still starting"
    else
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "LiteLLM" -d \
            "cd '$LITELLM_DIR' && echo 'LiteLLM Proxy already running on :4000'; echo 'Restart: .venv/bin/litellm --config litellm-config.yaml --port 4000'; echo ''; .venv/bin/litellm --config litellm-config.yaml --port 4000; echo 'LiteLLM stopped.'; read"
        echo -e "  ${GREEN}✓${NC} LiteLLM window (proxy already running on :4000)"
    fi
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:LiteLLM" automatic-rename off 2>/dev/null || true
fi

# Ollama window — live model status monitor
echo "Launching Ollama model monitor window..."
OLLAMA_MONITOR='while true; do
    clear
    echo "╔═══════════════════════════════════════════════╗"
    echo "║          Ollama Model Monitor (:11434)        ║"
    echo "╚═══════════════════════════════════════════════╝"
    echo ""
    if curl -sf --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
        echo "Status: ONLINE"
        echo ""
        echo "── Loaded Models (in VRAM) ──────────────────"
        ollama ps 2>/dev/null || echo "  (none running)"
        echo ""
        echo "── Available Models ─────────────────────────"
        ollama list 2>/dev/null || echo "  (ollama CLI not found)"
    else
        echo "Status: OFFLINE"
        echo ""
        echo "Ollama is not reachable on localhost:11434."
        echo "Start via: open -a Ollama (macOS) or ollama serve"
    fi
    echo ""
    echo "─────────────────────────────────────────────"
    echo "Refreshing every 30s. Press Ctrl-C to exit."
    sleep 30
done'
"$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Ollama" -d "bash -c '$OLLAMA_MONITOR'; read"
"$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Ollama" automatic-rename off 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Ollama model monitor window created"

# HUD-live window — always launch (read-only dashboard, negligible resource cost)
HUD_SCRIPT="$PROJECT_DIR/.claude/scripts/jicm-watcher-hud.sh"
if [[ -x "$HUD_SCRIPT" ]]; then
    echo "Launching HUD-live dashboard in tmux window..."
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "HUD" -d \
        "cd '$PROJECT_DIR' && bash '$HUD_SCRIPT'; echo 'HUD stopped.'; read"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:HUD" automatic-rename off 2>/dev/null || true
fi

# Host Executor Bridge (signal-file daemon for Docker↔host Claude delegation)
BRIDGE_SCRIPT="$ALFRED_DIR/.claude/jobs/lib/host-executor-bridge.sh"
if [[ -x "$BRIDGE_SCRIPT" ]] || [[ -f "$BRIDGE_SCRIPT" ]]; then
    if ! "$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null | grep -q '^Bridge$'; then
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Bridge" -d \
            "cd '$ALFRED_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$ALFRED_DIR' && bash '$BRIDGE_SCRIPT' --daemon; echo 'Bridge stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Bridge" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} Host Executor Bridge daemon started"
    fi
fi

# Protos — warm Claude session for chain-executor fork-and-inject pattern.
# The chain-executor calls ensure_seed() on demand, but pre-warming at launch
# avoids the ~15s cold-start penalty on the first chain dispatch.
# MUST launch from ALFRED_LAUNCH_DIR (~/Claude/Alfred-Dev symlink) rather than
# ALFRED_DIR (inside the monorepo git tree). Claude Code walks up to find .git/
# and would load Jarvis's .claude/ instead of Alfred's if launched from within
# the monorepo. The Alfred-Dev symlink is outside the git tree, so Claude Code
# finds alfred/.claude/ directly.
SEED_WINDOW="Protos"
ALFRED_LAUNCH_DIR="$HOME/Claude/Alfred-Dev"
if ! "$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null | grep -q "^${SEED_WINDOW}$"; then
    if [[ -d "$ALFRED_LAUNCH_DIR" ]] || [[ -L "$ALFRED_LAUNCH_DIR" ]]; then
        echo "Launching Protos (warm chain session via Alfred-Dev)..."
        SEED_PROXY_URL="${ANTHROPIC_BASE_URL:-http://localhost:9800}"
        "$TMUX_BIN" new-window -d -t "$SESSION_NAME" -n "${SEED_WINDOW}" \
            "cd '$ALFRED_LAUNCH_DIR' && export ANTHROPIC_BASE_URL='$SEED_PROXY_URL' && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: seed-session' && claude --dangerously-skip-permissions --permission-mode bypassPermissions; echo 'Protos stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:${SEED_WINDOW}" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} Protos warm session created (Alfred identity)"
    else
        echo -e "  ${YELLOW}⚠${NC} Protos skipped — $ALFRED_LAUNCH_DIR not found"
        echo "    Create it: ln -sf $PROJECT_DIR/alfred $ALFRED_LAUNCH_DIR"
    fi
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
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Aion is ready!                             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Tmux Windows:${NC}"
echo "  W0  Jarvis        Master Archon ($([ "$FRESH_MODE" == "true" ] && echo "fresh" || echo "resumed"))"
echo "  W1  Watcher       JICM v7.9 context monitor"
echo "  W2  Ennoia        Session orchestrator"
echo "  W3  Virgil        Codebase guide"
echo "  W4  Commands      Signal file → command injection"
[[ "$DEV_MODE" == "true" ]] && \
echo "  W5  Jarvis-dev      Developer test driver"
echo "      MLX-Embed     Qwen3-Embedding-4B server (:8000)"
echo "      LiteLLM       Model proxy (:4000)"
echo "      Ollama        Local model monitor (:11434)"
[[ -x "$HUD_SCRIPT" ]] && \
echo "      HUD           Live dashboard"
[[ -f "$ALFRED_DIR/.claude/jobs/lib/host-executor-bridge.sh" ]] && \
echo "      Bridge        Host executor signal daemon"
echo "      Protos        Warm chain session (fork cache)"
echo ""
echo -e "${CYAN}Archon Service Summary:${NC}"
echo -n "  Jarvis Infra : "; check_port 5432 && check_port 6333 "/collections" && check_port 7474 && echo -e "${GREEN}PG+Qdrant+Neo4j ✓${NC}" || echo -e "${YELLOW}partial${NC}"
echo -n "  Alfred Pulse : "; check_port 8800 "/api/v1/health" && echo -e "${GREEN}:8800 ✓${NC}" || echo -e "${YELLOW}⚠${NC}"
echo -n "  Dashboard    : "; check_port 8701 && echo -e "${GREEN}:8701 ✓${NC}" || echo -e "${YELLOW}⚠${NC}"
echo -n "  Usage Proxy  : "; check_port 9800 "/health" && echo -e "${GREEN}:9800 ✓${NC}" || echo -e "${YELLOW}offline${NC}"
echo -n "  AI Services  : "; check_port 11434 "/api/version" && echo -n -e "${GREEN}Ollama${NC} " || echo -n -e "${YELLOW}Ollama?${NC} "
check_port 8000 "/health" && echo -n -e "${GREEN}MLX${NC} " || echo -n -e "${YELLOW}MLX…${NC} "
check_port 4000 "/v1/models" && echo -e "${GREEN}LiteLLM${NC}" || echo -e "${YELLOW}LiteLLM…${NC}"
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
