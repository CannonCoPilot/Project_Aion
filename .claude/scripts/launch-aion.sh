#!/bin/bash
# Launch Aion (Jarvis + Alfred unified Archon session) in a tmux session for autonomous control
# This enables auto-command execution via tmux send-keys
#
# Window layout — authoritative source is window_target_index() below; the ASCII
# sketch that follows is legacy and may not match current indices.
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
#   --dev        Add W11 Jarvis-dev test driver
#   --fresh      Full Aion but new session (archive old, start clean)
#   --lite       Isolated one-off session (W0+Watcher only, no persistence,
#                separate tmux session 'lite', minimal CLAUDE.md ~340 tokens,
#                JSONL cleaned on exit — for ad hoc tasks and small projects)
#
# iTerm2 Integration:
#   Use --iterm2 flag to attach with tmux -CC for native iTerm2 tabs
#   This makes tmux windows appear as standard iTerm2 tabs/windows
#
# Updated: 2026-07-25 — v3.4: default model Claude Opus 5 @ 1M via the `[1m]` suffix, unified across
#          W0 (Jarvis) + W1 (Protos/Alfred seed) + W11 (Jarvis-dev) via AION_MODEL;
#          Jarvis-dev cross-codebase --add-dir (Projects, GitRepos); refreshed awareness doc

TMUX_BIN="${TMUX_BIN:-$HOME/bin/tmux}"
SESSION_NAME="${TMUX_SESSION:-aion}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
ALFRED_DIR="$PROJECT_DIR/alfred"
# Unified model for W0 (Jarvis Master Archon), the Protos/Alfred fork seed, and
# the executor seeds in chain-executor.sh / host-executor-bridge.sh. These MUST
# stay on the same model: executor tasks fork from W0's warm session to inherit
# its prefix cache, and a model mismatch invalidates that shared cache. Exported
# so an explicit `AION_MODEL=… ./launch-aion.sh` override propagates to children.
#
# THE `[1m]` SUFFIX IS LOAD-BEARING — DO NOT DROP IT.
# No Opus model is "1M-native". 1M is an opt-in beta window selected by the model
# ID suffix (`claude-opus-5[1m]`); a bare `claude-opus-5` gets the 200K default.
# The CLI strips the suffix case-insensitively (/\[1m\]$/i) once it has used it to
# pick the window, so the suffix never reaches the API as part of the model name.
# NOTE an explicit --model on the command line OVERRIDES `"model": "opus[1m]"` in
# ~/.claude/settings.json, so the setting cannot rescue a launcher that omits it.
#
# HISTORY (2026-08-01): the suffix was lost in the Opus 4.7 -> Opus 5 migration
# (the retired line read `--model 'claude-opus-4-7[1M]'`) and every launched lane
# silently ran at 200K. It was not a small regression — it broke JICM outright:
#   * jicm-gate.sh maps *opus-5* -> WINDOW=1000000, so JICM's accounting assumed a
#     1M window while the real session held 200K.
#   * JICM's hard threshold therefore sat ABOVE the entire real context window and
#     was mathematically unreachable — JICM could never fire a single cycle.
#   * Native autocompact won every race by default, and because it fires the
#     PreCompact path rather than the actuator, every checkpoint was produced by
#     the legacy unguarded qwen3:8b summariser instead of stage 3's grounded digest.
#   * With the old PCT_OVERRIDE=50 the compactor triggered at 50% of 200K = 100K,
#     which is what made autocompact feel early and relentless.
# One dropped suffix; four downstream symptoms that each looked like its own bug.
export AION_MODEL="${AION_MODEL:-claude-opus-5[1m]}"

# ── Window Index Map ──────────────────────────────────────────────────
# Permanent window ordering. Core sessions first, infrastructure second,
# aion subsystems third. Chain windows (from Alfred fork-resume) stack
# at the end automatically since they get the next available index.
#
#   0: Jarvis       — Master Archon
#   1: Protos       — Alfred seed (fork cache)
#   2: HUD          — Live dashboard
#   3: LiteLLM      — Model proxy
#   4: Ollama       — Local model monitor
#   5: MLX-Embed    — Embedding server
#   6: Ennoia       — Session orchestrator
#   7: Virgil       — Codebase guide
#   8: Watcher      — JICM context monitor
#   9: Commands     — Signal injection
#  10: Styx         — Host executor daemon + reaper
#  11: Jarvis-dev   — Dev test driver (when invoked)
#  12: Genie        — Research Archon (cwd Projects/WVU)
#  13: Jacques       — Contract Archon (cwd Projects/SnorkelTasks)
#  14+: chain-*     — Alfred fork-resume task windows (auto-stacked)
#
# NOTE: chain windows started at 12, then 13. Genie owns 12 and Jacques owns 13, so
# alfred/.claude/jobs/lib/host-executor-bridge.sh `_next_chain_index()` starts at 14.
# Those numbers must move together — a chain fork landing on an Archon's pane would
# inject an Alfred task into a live session. This is not hypothetical: during the Genie
# install a stale Styx daemon forked chain-31bcc85d straight onto window 12.

window_target_index() {
    case "$1" in
        Jarvis)     echo 0 ;;
        Protos)     echo 1 ;;
        HUD)        echo 2 ;;
        LiteLLM)    echo 3 ;;
        Ollama)     echo 4 ;;
        MLX-Embed)  echo 5 ;;
        Ennoia)     echo 6 ;;
        Virgil)     echo 7 ;;
        Watcher)    echo 8 ;;
        Commands)   echo 9 ;;
        Styx)       echo 10 ;;
        Jarvis-dev) echo 11 ;;
        Genie)      echo 12 ;;
        Jacques)     echo 13 ;;
        *)          echo "" ;;
    esac
}

# Highest index FIRST — reorder_windows() relies on this to avoid collisions.
WINDOW_ORDER="Jacques Genie Jarvis-dev Styx Commands Watcher Virgil Ennoia MLX-Embed Ollama LiteLLM HUD Protos Jarvis"

reorder_windows() {
    # Move each named window to its assigned index. Process in the order
    # listed in WINDOW_ORDER (highest index first) to avoid collisions.
    for name in $WINDOW_ORDER; do
        local target
        target=$(window_target_index "$name")
        [ -z "$target" ] && continue

        # Find the window's current index by name
        local current
        current=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_index}:#{window_name}' 2>/dev/null | grep ":${name}$" | cut -d: -f1)
        [ -z "$current" ] && continue
        [ "$current" = "$target" ] && continue

        # Check if target slot is occupied
        local occupant
        occupant=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_index}:#{window_name}' 2>/dev/null | grep "^${target}:" | cut -d: -f2)
        if [ -n "$occupant" ] && [ "$occupant" != "$name" ]; then
            "$TMUX_BIN" swap-window -s "${SESSION_NAME}:${current}" -t "${SESSION_NAME}:${target}" 2>/dev/null
        else
            "$TMUX_BIN" move-window -s "${SESSION_NAME}:${current}" -t "${SESSION_NAME}:${target}" 2>/dev/null
        fi
    done

    # Disable automatic rename for all assigned windows
    for name in $WINDOW_ORDER; do
        local idx
        idx=$(window_target_index "$name")
        [ -n "$idx" ] && "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:${idx}" automatic-rename off 2>/dev/null || true
    done
}
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
# W11: UUID v5 of "project_aion_jarvis_dev" in NAMESPACE_URL (excluded from W0 lookup)
JARVIS_W11_SESSION_ID="fbd7528a-c1bd-414a-bdaa-c3cc23f53215"
JARVIS_PROJECTS_DIR="$HOME/.claude/projects/${CLAUDE_PROJECT_SLUG}"
W0_UUID_FILE="$PROJECT_DIR/.claude/context/.current-w0-uuid"

# W12:Genie launches from Projects/WVU, so Claude Code files its sessions under a
# DIFFERENT project slug than W0/W5. That separation is deliberate and load-bearing:
# Genie gets its own JSONL dir and its own L2 memory dir for free, and can never be
# picked up by W0's latest-session scan.
GENIE_PROJECT_SLUG="-Users-nathanielcannon-Claude-Projects-WVU"
GENIE_PROJECTS_DIR="$HOME/.claude/projects/${GENIE_PROJECT_SLUG}"

# ──────────────────────────────────────────────────────────────────────────
# Session resumability validation (added 2026-06-04 after launcher v3.0 cwd-
# mismatch incident: cached UUIDs pointed at sessions whose recorded cwd was
# /Users/.../Project_Aion while launcher was cd'd into the Jarvis symlink, so
# `claude --resume <UUID>` rejected with "No conversation found".)
#
# Claude Code records cwd verbatim at session start (no realpath normalization)
# and --resume requires byte-exact cwd match. Mixed-cwd sessions in the same
# project store therefore need filtering at the launcher layer.
# ──────────────────────────────────────────────────────────────────────────

# Returns 0 if the JSONL's recorded cwd is one of the canonical paths for
# this project (literal CLAUDE_LAUNCH_DIR or its realpath). Claude Code
# 2.1.153+ tolerates cross-cwd resume — sessions recorded under either the
# symlink path or its realpath resume cleanly from either cwd — so accepting
# both matches Claude's behavior. Reason this filter still exists: prevents
# the launcher from selecting sessions that belong to OTHER unrelated
# projects (e.g. lite-workspace) that share a JSONL store via symlink.
# $2 = expected launch dir (default: CLAUDE_LAUNCH_DIR, i.e. the W0/dev Jarvis symlink).
# Parameterized for W12:Genie, which launches from Projects/WVU — hardcoding the Jarvis
# path made every Genie session look cwd-mismatched and therefore unresumable.
session_cwd_matches() {
    local jsonl="$1"
    local want_dir="${2:-$CLAUDE_LAUNCH_DIR}"
    [[ -f "$jsonl" ]] || return 1
    local launch_real
    launch_real="$(cd "$want_dir" 2>/dev/null && pwd -P)"
    grep -m1 '"cwd"' "$jsonl" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    cwd = d.get('cwd', '')
    sys.exit(0 if cwd == '$want_dir' or cwd == '$launch_real' else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null
}

# Returns 0 if a running Claude process has this UUID as its active sessionId.
# Source: Claude Code maintains ~/.claude/sessions/<pid>.json for every live
# process, with sessionId and status fields. This is the authoritative signal
# — pgrep on command line misses sessions launched without explicit --resume.
session_uuid_in_use() {
    local uuid="$1"
    local f
    [[ -z "$uuid" ]] && return 1
    for f in "$HOME"/.claude/sessions/*.json; do
        [[ -f "$f" ]] || continue
        # Cheap match first; only parse JSON if substring hit.
        grep -q "\"sessionId\":\"$uuid\"" "$f" 2>/dev/null && return 0
    done
    return 1
}

# Composite check: 0 = safely resumable from this launcher, 1 = skip.
# $2 = projects (JSONL) dir, $3 = expected launch dir. Both default to the W0/dev pair,
# so w0 and dev behavior is byte-identical. W12:Genie must pass its own: Claude Code files
# sessions under a slug derived from cwd, and Genie's cwd is Projects/WVU — its JSONLs are
# in a DIFFERENT directory than W0's. Left unparameterized, session_resumable could never
# find Genie's seed, resolve_genie_session fell through to `uuidgen new`, and Genie minted
# a fresh random session on every launch — no resume, no continuity, a new L2 identity
# each time. Caught on the second launch of the install.
session_resumable() {
    local uuid="$1"
    local pdir="${2:-$JARVIS_PROJECTS_DIR}"
    local ldir="${3:-$CLAUDE_LAUNCH_DIR}"
    [[ -n "$uuid" ]] || return 1
    local jsonl="$pdir/${uuid}.jsonl"
    [[ -f "$jsonl" ]] || return 1
    session_cwd_matches "$jsonl" "$ldir" || return 1
    ! session_uuid_in_use "$uuid"
}

# Find the most recent resumable W0 session — i.e., the newest JSONL whose
# recorded cwd matches CLAUDE_LAUNCH_DIR (or its realpath) AND whose UUID is
# not currently held by a live claude process. Excludes W11's deterministic
# UUID to prevent W11/W0 cross-contamination.
find_latest_w0_session() {
    local exclude_uuid="$JARVIS_W11_SESSION_ID"
    local f uuid
    for f in $(ls -t "$JARVIS_PROJECTS_DIR"/*.jsonl 2>/dev/null); do
        uuid=$(basename "$f" .jsonl)
        [[ "$uuid" == "$exclude_uuid" ]] && continue
        if session_resumable "$uuid"; then
            echo "$uuid"
            return 0
        fi
    done
    return 1
}

# ──────────────────────────────────────────────────────────────────────────
# Dev lane (W11:Jarvis-dev) session resolution + window launch — single source
# of truth shared by the fresh-launch and existing-session paths, which had
# drifted (the existing-session path was missing proxy routing, JARVIS_WINDOW,
# attribution headers, resume-UUID validation, and a survivability loop).
#
# Deterministic dev seed: UUID v5 of "project_aion_jarvis_dev" in NAMESPACE_URL.
DEV_SEED_UUID="fbd7528a-c1bd-414a-bdaa-c3cc23f53215"

# Resolve which dev session to attach and how. Prints "<uuid> <resume|new>".
# Mirrors W0's trust model but pinned to the dev breadcrumb + deterministic
# seed — never a latest-scan, since dev and W0 share one project slug dir and a
# scan could cross-contaminate. session_resumable() (defined above) validates
# JSONL existence + recorded-cwd match + not-in-use.
resolve_dev_session() {
    local candidate=""
    [[ -s "$PROJECT_DIR/.claude/context/.current-dev-uuid" ]] && \
        candidate="$(tr -d '[:space:]' < "$PROJECT_DIR/.claude/context/.current-dev-uuid")"
    if [[ -n "$candidate" ]] && session_resumable "$candidate"; then
        echo "$candidate resume"; return 0
    fi
    if session_resumable "$DEV_SEED_UUID"; then
        echo "$DEV_SEED_UUID resume"; return 0
    fi
    # Breadcrumb phantom and seed not resumable. If the seed JSONL is simply
    # absent, create the session UNDER the seed so it is resumable next time.
    if [[ ! -f "$JARVIS_PROJECTS_DIR/${DEV_SEED_UUID}.jsonl" ]]; then
        echo "$DEV_SEED_UUID new"; return 0
    fi
    # Seed JSONL exists but is unresumable (in use / cwd mismatch): a fresh id
    # avoids "--session-id already exists" and starts a clean lane.
    echo "$(uuidgen) new"
}

# Create the W11:Jarvis-dev tmux window. Caller reorders afterward if needed.
launch_dev_window() {
    local dev_uuid dev_mode
    read -r dev_uuid dev_mode < <(resolve_dev_session)
    local dev_file="$JARVIS_PROJECTS_DIR/${dev_uuid}.jsonl"

    # Session-file rotation — archive if > 5MB to prevent unbounded growth.
    local max_bytes=5242880
    local archive_dir="$PROJECT_DIR/.claude/exports/dev/sessions"
    if [[ -f "$dev_file" ]]; then
        local fsize
        fsize=$(stat -f%z "$dev_file" 2>/dev/null || echo 0)
        if [[ "$fsize" -gt "$max_bytes" ]]; then
            mkdir -p "$archive_dir"
            local aname="dev-session-$(date +%Y%m%d-%H%M%S).jsonl"
            mv "$dev_file" "$archive_dir/$aname"
            echo -e "  ${YELLOW}Dev session file rotated ($(( fsize / 1024 ))KB > 5MB) -> $aname${NC}"
            ls -t "$archive_dir"/dev-session-*.jsonl 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
            # Rotated away -> uuid now has no JSONL; start fresh under the same id.
            dev_mode="new"
        fi
    fi

    local proxy_url="${ANTHROPIC_BASE_URL:-http://localhost:9800}"
    # NEWLINE-delimited, not comma. ANTHROPIC_CUSTOM_HEADERS is parsed as one "Name: Value" per
    # LINE; a comma-joined string is read as a SINGLE header whose value swallows the rest. That
    # is why the proxy recorded project="project-aion,x-aion-agent-name: jarvis-dev-w5,x-aion-..."
    # with agent_name and session_id NULL on every row: the data was being sent, just collapsed
    # into one field. The \n stay literal here (backslash-n inside double quotes) and are expanded
    # by the $'...' quoting in the wrapper below, which keeps the tmux command on one line.
    local dev_headers="x-aion-project: project-aion\nx-aion-agent-name: jarvis-dev-w5\nx-aion-session-id: $(uuidgen)"
    local env_dev="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_SESSION_ROLE=dev JARVIS_WINDOW=5 ANTHROPIC_BASE_URL=$proxy_url"
    local sysappend="You are W11:Jarvis-dev, the engineering/infrastructure agent. Focus on Aion core systems (JICM, hooks, AC components, skills, tmux, infrastructure). DwarfCron/Chronicler product work belongs to W0. Ignore DF-specific @-imports unless explicitly tasked with Chronicler work."
    local base="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort low --model '${AION_MODEL}' --add-dir .claude/personas/jarvis --add-dir /Users/nathanielcannon/Claude/Projects --add-dir /Users/nathanielcannon/Claude/GitRepos --append-system-prompt '$sysappend' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"
    local first
    if [[ "$dev_mode" == "resume" ]]; then
        first="$base --resume $dev_uuid"
    else
        first="$base --session-id $dev_uuid"
    fi
    # Loop resume targets the KNOWN dev uuid (never --continue, which would grab
    # the newest JSONL in the shared slug dir — often W0's live session).
    local loop_resume="$base --resume $dev_uuid"
    local instr="$PROJECT_DIR/.claude/context/dev-session-instructions.md"
    local init="Please load these files into context: @${instr}"

    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jarvis-dev" -d \
        "cd '$CLAUDE_LAUNCH_DIR' && export $env_dev && export ANTHROPIC_CUSTOM_HEADERS=$'$dev_headers' && $first '$init'; while true; do echo ''; echo 'Jarvis-dev exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $loop_resume; done"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Jarvis-dev" automatic-rename off 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Jarvis-dev window (${dev_mode}: ${dev_uuid})"
}

# ──────────────────────────────────────────────────────────────────────────
# Genie lane (W12) — Research Archon. Scientific coding, analysis, research and
# writing for the DOE GENESIS grant (PI Dr. Ember Morrissey, WVU) and the IMAGINE
# system. Structurally mirrors launch_dev_window() above; the differences that
# matter are called out inline.
#
# Deterministic seed: UUID v5 of "project_aion_genie_w12" in NAMESPACE_URL.
#   python3 -c 'import uuid;print(uuid.uuid5(uuid.NAMESPACE_URL,"project_aion_genie_w12"))'
# (Verified by round-trip. Note W0's seed reproduces from its documented string but
# DEV_SEED_UUID above does NOT reproduce from "project_aion_jarvis_dev" — that comment
# is inaccurate. Genie's is checked, so it can be regenerated if the file is ever lost.)
GENIE_SEED_UUID="468a0010-55cd-5c85-b152-fdb34d7c607b"

# Genie's cwd is Projects/WVU, NOT the monorepo. Claude Code derives its project slug
# from PWD at launch, so this also gives Genie its own L2 memory directory
# (~/.claude/projects/-Users-nathanielcannon-Claude-Projects-WVU/) with no extra wiring —
# and, critically, its own JSONL project dir, so the "shared slug" hazard that forces
# W0/dev to avoid --continue does not apply here.
GENIE_LAUNCH_DIR="/Users/nathanielcannon/Claude/Projects/WVU"

# Resolve which Genie session to attach and how. Prints "<uuid> <resume|new>".
# Same trust model as resolve_dev_session(): breadcrumb → deterministic seed → fresh id.
resolve_genie_session() {
    local candidate=""
    [[ -s "$PROJECT_DIR/.claude/context/.current-genie-uuid" ]] && \
        candidate="$(tr -d '[:space:]' < "$PROJECT_DIR/.claude/context/.current-genie-uuid")"
    # Genie's own projects dir + launch dir — see session_resumable's note on why these
    # must be passed rather than defaulted.
    if [[ -n "$candidate" ]] && session_resumable "$candidate" "$GENIE_PROJECTS_DIR" "$GENIE_LAUNCH_DIR"; then
        echo "$candidate resume"; return 0
    fi
    if session_resumable "$GENIE_SEED_UUID" "$GENIE_PROJECTS_DIR" "$GENIE_LAUNCH_DIR"; then
        echo "$GENIE_SEED_UUID resume"; return 0
    fi
    if [[ ! -f "$GENIE_PROJECTS_DIR/${GENIE_SEED_UUID}.jsonl" ]]; then
        echo "$GENIE_SEED_UUID new"; return 0
    fi
    echo "$(uuidgen) new"
}

# Create the W12:Genie tmux window. Caller reorders afterward if needed.
launch_genie_window() {
    [[ -d "$GENIE_LAUNCH_DIR" ]] || {
        echo -e "  ${YELLOW}⊘${NC} Genie skipped (no $GENIE_LAUNCH_DIR)"
        return 0
    }

    local genie_uuid genie_mode
    read -r genie_uuid genie_mode < <(resolve_genie_session)

    local proxy_url="${ANTHROPIC_BASE_URL:-http://localhost:9800}"
    # NEWLINE-delimited, not comma — see the dev-lane comment above for why.
    local genie_headers="x-aion-project: wvu-genesis\nx-aion-agent-name: genie-w12\nx-aion-session-id: $(uuidgen)"
    # GRAPHITI_GROUP_ID scopes Genie's L5 writes to its own graph. graphiti-auto-ingest.py
    # reads this env var (it was hardcoded to jarvis-core until the Genie install).
    # JICM_PROJECT_DIR is load-bearing, not decorative. Genie's cwd is Projects/WVU, so
    # CLAUDE_PROJECT_DIR points there and every hook would write its lane state, registry
    # heartbeat and breadcrumb into WVU/.claude/ — where the supervisor, the actuator and
    # this launcher (all of which read the monorepo) would never look. Empirically
    # confirmed on the first Genie launch: zero hooks fired, no registry row appeared.
    # Honored by jicm-gate.sh, jicm-stop.sh, session-start.sh and the v9 statusline.
    local env_genie="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_SESSION_ROLE=genie JARVIS_WINDOW=12 JICM_PROJECT_DIR=$PROJECT_DIR GRAPHITI_GROUP_ID=genie-core JICM_RAG_COLLECTION=genie-sessions ANTHROPIC_BASE_URL=$proxy_url"
    local sysappend="You are W12:Genie, the Research Archon of Project Aion — co-developer and co-researcher to the User on scientific coding, analysis, research, writing, and automation. Your domain is the DOE GENESIS grant (PI Dr. Ember Morrissey, WVU) and the IMAGINE microbiome genotype-to-phenotype system. Your memory namespace is genie-* / genie-core; never write to Jarvis jarvis-* collections or the jarvis-core graph. Never invent a figure and never attribute an unresolved citation. Aion core engineering belongs to W11:Jarvis-dev; Chronicler and Palimpsest belong to W0:Jarvis."
    # --add-dir Project_Aion is what makes the shared .claude/ capabilities (skills, agents,
    # patterns, hooks context) reachable from a cwd outside the monorepo.
    # --mcp-config + --strict-mcp-config: Genie gets EXACTLY the server set in its own
    # mcp.json, replacing the root one. This is what actually binds GRAPHITI_GROUP_ID to
    # genie-core — the root .mcp.json hardcodes "jarvis-core" as a literal env value, and
    # an env value declared there overrides the launching process's environment, so
    # exporting GRAPHITI_GROUP_ID here alone would silently do nothing.
    local genie_mcp="$PROJECT_DIR/.claude/personas/genie/mcp.json"
    local base="claude --dangerously-skip-permissions --permission-mode bypassPermissions --model '${AION_MODEL}' --add-dir $PROJECT_DIR --add-dir $PROJECT_DIR/.claude/personas/genie --add-dir /Users/nathanielcannon/Claude/Projects --mcp-config '$genie_mcp' --strict-mcp-config --append-system-prompt '$sysappend' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug-genie.log"

    local first
    if [[ "$genie_mode" == "resume" ]]; then
        first="$base --resume $genie_uuid"
    else
        first="$base --session-id $genie_uuid"
    fi
    local loop_resume="$base --resume $genie_uuid"
    local init="Please load these files into context: @$PROJECT_DIR/.claude/personas/genie/CLAUDE.md"

    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Genie" -d \
        "cd '$GENIE_LAUNCH_DIR' && export $env_genie && export ANTHROPIC_CUSTOM_HEADERS=$'$genie_headers' && $first '$init'; while true; do echo ''; echo 'Genie exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $loop_resume; done"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Genie" automatic-rename off 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Genie window (${genie_mode}: ${genie_uuid})"
}

# ──────────────────────────────────────────────────────────────────────────
# Jacques lane (W13) — Contract Archon. Snorkel AI evaluation-task authoring across
# ec-beech / ecs-otter / ec-starfish. Structurally mirrors launch_genie_window().
#
# Deterministic seed: UUID v5 of "project_aion_jaques_w13" in NAMESPACE_URL.
#   python3 -c 'import uuid;print(uuid.uuid5(uuid.NAMESPACE_URL,"project_aion_jaques_w13"))'
JAQUES_SEED_UUID="79e6488b-2ca4-5521-8e52-3ca110115cf0"

# cwd is the SnorkelTasks repo, NOT the monorepo — that earns Jacques its own Claude Code
# project slug (and therefore its own L2 memory dir and JSONL dir) for free. It also means
# SnorkelTasks/CLAUDE.md is auto-discovered as the project file, so the Harbor domain law
# loads without being duplicated into the persona.
JAQUES_LAUNCH_DIR="/Users/nathanielcannon/Claude/Projects/SnorkelTasks"
JAQUES_PROJECT_SLUG="-Users-nathanielcannon-Claude-Projects-SnorkelTasks"
JAQUES_PROJECTS_DIR="$HOME/.claude/projects/${JAQUES_PROJECT_SLUG}"

# Prints "<uuid> <resume|new>". Same trust model as the dev/genie resolvers.
resolve_jaques_session() {
    local candidate=""
    [[ -s "$PROJECT_DIR/.claude/context/.current-jaques-uuid" ]] && \
        candidate="$(tr -d '[:space:]' < "$PROJECT_DIR/.claude/context/.current-jaques-uuid")"
    # Pass Jacques' own projects dir + launch dir: session_resumable defaults to W0's, and
    # Claude Code files sessions under a slug derived from cwd, so the defaults would never
    # find Jacques' seed and every launch would mint a fresh random session.
    if [[ -n "$candidate" ]] && session_resumable "$candidate" "$JAQUES_PROJECTS_DIR" "$JAQUES_LAUNCH_DIR"; then
        echo "$candidate resume"; return 0
    fi
    if session_resumable "$JAQUES_SEED_UUID" "$JAQUES_PROJECTS_DIR" "$JAQUES_LAUNCH_DIR"; then
        echo "$JAQUES_SEED_UUID resume"; return 0
    fi
    if [[ ! -f "$JAQUES_PROJECTS_DIR/${JAQUES_SEED_UUID}.jsonl" ]]; then
        echo "$JAQUES_SEED_UUID new"; return 0
    fi
    echo "$(uuidgen) new"
}

# Create the W13:Jacques tmux window. Caller reorders afterward if needed.
launch_jaques_window() {
    [[ -d "$JAQUES_LAUNCH_DIR" ]] || {
        echo -e "  ${YELLOW}⊘${NC} Jacques skipped (no $JAQUES_LAUNCH_DIR)"
        return 0
    }

    local jaques_uuid jaques_mode
    read -r jaques_uuid jaques_mode < <(resolve_jaques_session)

    local proxy_url="${ANTHROPIC_BASE_URL:-http://localhost:9800}"
    local jaques_headers="x-aion-project: snorkel-tasks\nx-aion-agent-name: jaques-w13\nx-aion-session-id: $(uuidgen)"
    # JICM_PROJECT_DIR is load-bearing: cwd is outside the monorepo, so every hook would
    # otherwise write lane state into SnorkelTasks/.claude/ where the supervisor, actuator
    # and this launcher would never find it.
    local env_jaques="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_SESSION_ROLE=jaques JARVIS_WINDOW=13 JICM_PROJECT_DIR=$PROJECT_DIR GRAPHITI_GROUP_ID=jaques-core JICM_RAG_COLLECTION=jaques-sessions ANTHROPIC_BASE_URL=$proxy_url"
    # NO APOSTROPHES IN THIS STRING. It is interpolated into a single-quoted argument inside
    # the tmux command line; an apostrophe closes that quote early and the shell then glob-
    # expands what follows. Observed on the first Jacques launch: "the User's" broke the quote,
    # zsh tried to glob jaques-* and jarvis-*, failed with "no matches found", and claude never
    # started at all — an empty pane and zero hooks, which looks exactly like the settings-root
    # bug but is not. Wildcards are fine INSIDE the quotes; unbalanced quotes are not.
    local sysappend="You are W13:Jacques, the Contract Archon of Project Aion, collaborator to the User on paid evaluation-task authoring for Snorkel AI across three projects: ec-beech, ecs-otter, ec-starfish. The file SnorkelTasks/CLAUDE.md is auto-discovered from your cwd and is AUTHORITATIVE on Harbor bundle rules, the auto-reject list and Gate 1/Gate 2 — never restate it from memory. Your memory namespace is jaques-context/research/sessions/codebase plus the jaques-core graph; never write to any jarvis- or genie- collection or graph. Never state a telemetry fact you have not read out of the run-record JSON. SUBMITTING TO experts.snorkel-ai.com IS THE USER ACTION, NEVER YOURS. Aion core engineering belongs to W11:Jarvis-dev; WVU and GENESIS research belong to W12:Genie."
    local jaques_mcp="$PROJECT_DIR/.claude/personas/jacques/mcp.json"
    local base="claude --dangerously-skip-permissions --permission-mode bypassPermissions --model '${AION_MODEL}' --add-dir $PROJECT_DIR --add-dir $PROJECT_DIR/.claude/personas/jacques --add-dir /Users/nathanielcannon/Claude/Projects --mcp-config '$jaques_mcp' --strict-mcp-config --append-system-prompt '$sysappend' --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug-jaques.log"

    local first
    if [[ "$jaques_mode" == "resume" ]]; then
        first="$base --resume $jaques_uuid"
    else
        first="$base --session-id $jaques_uuid"
    fi
    local loop_resume="$base --resume $jaques_uuid"
    local init="Please load these files into context: @$PROJECT_DIR/.claude/personas/jacques/CLAUDE.md"

    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Jacques" -d \
        "cd '$JAQUES_LAUNCH_DIR' && export $env_jaques && export ANTHROPIC_CUSTOM_HEADERS=$'$jaques_headers' && $first '$init'; while true; do echo ''; echo 'Jacques exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $loop_resume; done"
    "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Jacques" automatic-rename off 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Jacques window (${jaques_mode}: ${jaques_uuid})"
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
    LITE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=20000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_LITE=true"
    LITE_CLAUDE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort low --add-dir .claude/personas/jarvis --verbose"

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
    # Styx (Host Executor)
    local bridge_heartbeat="$ALFRED_DIR/.claude/jobs/state/.bridge-heartbeat"
    if [[ -f "$bridge_heartbeat" ]]; then
        local bridge_age=$(( $(date +%s) - $(date -r "$bridge_heartbeat" +%s 2>/dev/null || echo 0) ))
        if [[ "$bridge_age" -lt 60 ]]; then
            echo -e "    ${GREEN}✓${NC} Styx (Host Executor) (heartbeat ${bridge_age}s ago)"
        else
            echo -e "    ${YELLOW}⚠${NC} Styx (Host Executor) (stale heartbeat: ${bridge_age}s)"
            warnings=$((warnings + 1))
        fi
    else
        echo -e "    ${YELLOW}⚠${NC} Styx (Host Executor) — no heartbeat file"
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
        bridge|styx)
            echo "Restarting Styx (Host Executor)..."
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Styx" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:Styx" \
                "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Styx stopped.'; read" 2>/dev/null \
                || "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Styx" -d \
                    "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Styx stopped.'; read"
            ;;
        all)
            echo "Full restart..."
            (cd "$PROJECT_DIR/infrastructure" && docker compose restart 2>/dev/null)
            (cd "$AIFRED_DEV_DIR" && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d 2>/dev/null)
            "$TMUX_BIN" send-keys -t "${SESSION_NAME}:Styx" C-c 2>/dev/null
            sleep 1
            "$TMUX_BIN" respawn-window -t "${SESSION_NAME}:Styx" \
                "cd '$AIFRED_DEV_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$AIFRED_DEV_DIR' && bash '$AIFRED_DEV_DIR/.claude/jobs/lib/host-executor-bridge.sh' --daemon; echo 'Styx stopped.'; read" 2>/dev/null || true
            echo "Docker stacks + styx restarted. tmux processes unchanged."
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
            echo "Available: infra, pulse, proxy, dashboard, pipeline, styx (bridge), watcher, hud, ollama, mlx, litellm, all"
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
            echo "Adding Jarvis-dev window (W11) to existing session..."
            launch_dev_window
            reorder_windows
        else
            echo "  Jarvis-dev window already exists."
        fi
    fi

    # Genie (W12) — add to a running session if missing. Not flag-gated; Genie is a
    # permanent Archon. This is also the install path: an existing aion session picks
    # Genie up without a full relaunch.
    if [[ "${GENIE:-on}" != "off" ]]; then
        EXISTING_WINDOWS=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null)
        if ! echo "$EXISTING_WINDOWS" | grep -q "^Genie$"; then
            echo "Adding Genie window (W12) to existing session..."
            launch_genie_window
            reorder_windows
        else
            echo "  Genie window already exists."
        fi
    fi

    # Jacques (W13) — add to a running session if missing. Also the install path.
    if [[ "${JAQUES:-on}" != "off" ]]; then
        EXISTING_WINDOWS=$("$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null)
        if ! echo "$EXISTING_WINDOWS" | grep -q "^Jacques$"; then
            echo "Adding Jacques window (W13) to existing session..."
            launch_jaques_window
            reorder_windows
        else
            echo "  Jacques window already exists."
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

# Load MCP-server credentials from gitignored credentials.yaml so settings.json
# can reference them via ${VAR} expansion instead of carrying literal secrets.
# Silent failure tolerated (yq missing or section absent → MCP starts with empty
# key and fails loudly downstream, which is preferable to embedding a secret).
CREDS_FILE="$PROJECT_DIR/.claude/secrets/credentials.yaml"
if command -v yq >/dev/null 2>&1 && [[ -r "$CREDS_FILE" ]]; then
    ANNAS_KEY=$(yq -r '.annas_archive.secret_key // ""' "$CREDS_FILE" 2>/dev/null | head -1 | tr -d '[:space:]')
    [[ -n "$ANNAS_KEY" && "$ANNAS_KEY" != "null" ]] && export ANNAS_SECRET_KEY="$ANNAS_KEY"
fi

# Context management environment variables
# - ENABLE_TOOL_SEARCH: Enable MCP tool search to reduce context usage
# - CLAUDE_CODE_MAX_OUTPUT_TOKENS: Set max output to 20K (affects effective context budget)
# - CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80: native autocompact as a LAST-RESORT backstop at
#   ~800K on a 1M window. JICM owns the normal clear+resume cycle and must always fire first.
#
#   ORDERING INVARIANT — re-derive this whenever EITHER side moves:
#       JICM soft 300K  <  JICM hard 330K  <<  native autocompact ~800K   (jicm-config.sh)
#   ~470K of headroom above JICM hard. Native compaction should never be reached in
#   normal operation; if it fires, that is a signal JICM failed to act, not a success.
#
#   HISTORY (2026-08-01) — why this invariant is written down. The override was 50%
#   (=500K) with the comment "JICM triggers at 300K; native autocompact is the safety net".
#   True when written. After 11a90fe moved JICM to soft=550K/hard=600K, nobody re-derived
#   the percentage — so the 500K "backstop" fired BEFORE JICM's 550K soft threshold and
#   preempted every cycle it was meant to catch. W0 could never reach soft at all.
#   The override is a PERCENTAGE of the window; JICM's are ABSOLUTE tokens in another
#   file. Nothing enforces the ordering but this comment. Check it, or the bug returns.
#
#   Claude Code gates autocompact on three switches (DISABLE_COMPACT flag,
#   DISABLE_AUTO_COMPACT env, autoCompactEnabled setting — default TRUE). All three are
#   left permissive; only the percentage is tuned. Note the CLI parses this as
#   `testPctOverride` and internal reserves may make the effective trigger somewhat
#   below the nominal 80% — treat 800K as an upper bound, not an exact firing point.
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
W0_HEADERS="x-aion-project: project-aion\nx-aion-agent-name: jarvis-w0\nx-aion-session-id: $JARVIS_SESSION_UUID"
# NOTE: DEV_HEADERS is currently UNUSED — the dev lane builds its own `dev_headers` at line ~288.
# Kept (and fixed) so it is correct if ever wired up, rather than a comma-joined trap in waiting.
DEV_HEADERS="x-aion-project: project-aion\nx-aion-agent-name: jarvis-dev-w5\nx-aion-session-id: $JARVIS_SESSION_UUID"

#CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=40000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0 ANTHROPIC_BASE_URL=$USAGE_PROXY_URL"
CLAUDE_ENV="ENABLE_TOOL_SEARCH=true CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 JARVIS_SESSION_TYPE=$JARVIS_SESSION_TYPE JARVIS_WINDOW=0 ANTHROPIC_BASE_URL=$USAGE_PROXY_URL"

# Create new tmux session with Claude in the main pane
# W0 runs in a restart loop: first launch per mode, then --resume on re-entry
# W0: bypass permissions, full Opus 5 (1M) context, exclude dynamic system prompts
# Permission bypass: two complementary flags
#   --dangerously-skip-permissions: skips workspace trust dialog + enables bypass
#   --permission-mode bypassPermissions: explicitly sets session permission mode
#CLAUDE_BASE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort max --exclude-dynamic-system-prompt-sections --model 'claude-opus-4-7[1M]' --add-dir .claude/personas/jarvis --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"
# --add-dir loads .claude/personas/jarvis/CLAUDE.md with @-import processing.
# Jarvis identity, psyche, and force-loaded context are in that persona CLAUDE.md,
# NOT in the root CLAUDE.md (which is shared with Alfred to avoid external-import conflicts).
CLAUDE_BASE="claude --dangerously-skip-permissions --permission-mode bypassPermissions --effort low --exclude-dynamic-system-prompt-sections --model '${AION_MODEL}' --add-dir .claude/personas/jarvis --verbose --debug --debug-file $PROJECT_DIR/.claude/logs/debug.log"

# Cross-project workspace dirs (Pyright LSP + cross-repo awareness).
# Each path in .claude/context/.active-projects (one per line; blanks/#comments OK)
# becomes a `--add-dir <path>` so the LSP discovers per-project pyrightconfig.json
# and treats the dir as a workspace folder. ~ is expanded; missing dirs are skipped.
ACTIVE_PROJECTS_FILE="$PROJECT_DIR/.claude/context/.active-projects"
if [[ -f "$ACTIVE_PROJECTS_FILE" ]]; then
    while IFS= read -r _line || [[ -n "$_line" ]]; do
        [[ -z "$_line" || "$_line" =~ ^[[:space:]]*# ]] && continue
        _line="${_line/#\~/$HOME}"
        if [[ -d "$_line" ]]; then
            CLAUDE_BASE="$CLAUDE_BASE --add-dir '$_line'"
        fi
    done < "$ACTIVE_PROJECTS_FILE"
fi

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
    # Find the most recent W0 session to resume.
    # Two-stage trust: (1) check cached UUID via session_resumable; (2) on
    # cache invalidation, scan filesystem via find_latest_w0_session (which
    # itself uses session_resumable). This prevents caching stale UUIDs whose
    # recorded cwd no longer matches the launcher's CLAUDE_LAUNCH_DIR, which
    # was the failure mode in the 2026-06-04 launcher v3.0 incident.
    LATEST_W0=""
    if [[ -f "$W0_UUID_FILE" ]]; then
        CACHED_W0=$(cat "$W0_UUID_FILE" | tr -d '[:space:]')
        if session_resumable "$CACHED_W0"; then
            LATEST_W0="$CACHED_W0"
            echo -e "  ${CYAN}W0 UUID:${NC} $LATEST_W0 (from state file, validated)"
        else
            echo -e "  ${YELLOW}W0 cached UUID stale ($CACHED_W0) — rescanning${NC}"
        fi
    fi
    if [[ -z "$LATEST_W0" ]]; then
        LATEST_W0=$(find_latest_w0_session)
        if [[ -n "$LATEST_W0" ]]; then
            echo "$LATEST_W0" > "$W0_UUID_FILE"
            echo -e "  ${CYAN}W0 UUID:${NC} $LATEST_W0 (rediscovered, cwd-compatible, not in use)"
        fi
    fi

    if [[ -n "$LATEST_W0" ]]; then
        # Pre-validation (session_resumable) catches the common failure modes
        # but Claude Code's --resume can still reject for reasons outside the
        # launcher's visibility (internal index state, version drift, etc.).
        # Keep a runtime --continue fallback so a post-validation rejection
        # doesn't dump the user straight into the wait loop. If --continue
        # also fails, the wait loop prompts for manual recovery — we do NOT
        # auto-create a fresh session (preserves user's history-fidelity rule).
        CLAUDE_FIRST="$CLAUDE_BASE --resume $LATEST_W0 || (echo \"\${YELLOW}--resume rejected $LATEST_W0 at runtime — trying --continue\${NC}\"; $CLAUDE_BASE --continue)"
        echo -e "  ${CYAN}W0 Mode:${NC} ${GREEN}RESUME${NC} $LATEST_W0 (runtime fallback: --continue)"
    else
        # No resumable session found at all — fall back to deterministic UUID.
        # This creates a NEW session under JARVIS_W0_SESSION_ID. Existing
        # cwd-mismatched JSONLs remain preserved on disk (recoverable manually
        # by launching with the matching cwd) but are not auto-resumed.
        CLAUDE_FIRST="$CLAUDE_BASE --session-id $JARVIS_W0_SESSION_ID"
        echo "$JARVIS_W0_SESSION_ID" > "$W0_UUID_FILE"
        echo -e "  ${CYAN}W0 Mode:${NC} ${YELLOW}NEW${NC} (no resumable session — preserving prior JSONLs on disk)"
    fi
fi

# Propagate W0 session ID to Alfred pipeline state for extend-then-fork execution.
# Executor tasks fork from this session to inherit Jarvis's warm cache prefix.
JARVIS_SESSION_ID_FOR_PIPELINE=$(cat "$W0_UUID_FILE" 2>/dev/null | tr -d '[:space:]')
if [[ -n "$JARVIS_SESSION_ID_FOR_PIPELINE" ]]; then
    PIPELINE_STATE_DIR="$ALFRED_DIR/.claude/jobs/state"
    mkdir -p "$PIPELINE_STATE_DIR"
    echo "$JARVIS_SESSION_ID_FOR_PIPELINE" > "$PIPELINE_STATE_DIR/jarvis-session-id"
    # Publish W0's model so Alfred executors fork tasks on the SAME model
    # (prefix-cache match with the warm seed). Read by executor.py / pipeline-watcher.py.
    printf '%s' "$AION_MODEL" > "$PIPELINE_STATE_DIR/seed-model"
fi

# Restart loop: --continue is safe here because W0's JSONL was the most recently
# modified file (it just exited). W5 contamination only affects initial launch.
CLAUDE_RESUME="$CLAUDE_BASE --continue"
W0_WRAPPER="export $CLAUDE_ENV && export ANTHROPIC_CUSTOM_HEADERS=$'$W0_HEADERS' && $CLAUDE_FIRST; while true; do echo ''; echo 'Claude exited. Press Enter to --resume, or Ctrl-C to close window.'; read; $CLAUDE_RESUME; done"

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

    # Create watcher window (window 1, detached so we stay on window 0).
    # TMUX_SESSION passed inline (not via tmux set-env) so the watcher subprocess
    # picks it up regardless of tmux session-level env. jicm-config.sh resolves
    # JICM_TMUX_SESSION="${TMUX_SESSION:-aion}" — without this inline export the
    # old default 'jarvis' caused every inject attempt to fail ("session not found").
    # W0 cutover (2026-08-12) + capability port (2026-08-14): jicm-supervisor now owns
    # cycling for EVERY lane including w0 (CYCLE_ENABLED=false), and REST/idle-hands,
    # MAINTAIN health pings and identity checks for the whole machine (MAINT_ENABLED=false).
    # Both gates exist to prevent two managers racing on one file — the clear signal, then
    # .memory-health.json and the M4 reindex queue.
    # This process now does exactly ONE thing: refresh W0's state between turns. That is
    # superseded by the PostToolUse sampler once W0's session turns over and picks the hook
    # up (hooks cache at session start) — retire the window then. Set either gate back to
    # true only if the supervisor is stopped.
    "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Watcher" -d \
        "cd '$PROJECT_DIR' && export TMUX_SESSION='$SESSION_NAME' TMUX_BIN='$TMUX_BIN' CLAUDE_PROJECT_DIR='$PROJECT_DIR' JICM_WATCHER_CYCLE_ENABLED='false' JICM_WATCHER_MAINT_ENABLED='false' && '$WATCHER_SCRIPT' --interval 3; echo 'Watcher stopped.'; read"
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

# W11: Jarvis-dev (developer's seat — named session for deterministic resumption)
# Uses a deterministic UUID so --resume always picks up the same conversation.
# UUID v5 of "project_aion_jarvis_dev" in NAMESPACE_URL = fbd7528a-c1bd-414a-bdaa-c3cc23f53215
if [[ "$DEV_MODE" == "true" ]]; then
    echo "Launching Jarvis-dev (developer's seat) in tmux window..."
    launch_dev_window
fi

# W12: Genie (Research Archon). Unlike Jarvis-dev this is NOT flag-gated — Genie is a
# permanent Archon, not an on-demand test driver. It self-skips if Projects/WVU is absent,
# and GENIE=off suppresses it for a lean launch.
if [[ "${GENIE:-on}" != "off" ]]; then
    echo "Launching Genie (Research Archon) in tmux window..."
    launch_genie_window
fi

# W13: Jacques (Contract Archon). Permanent, not flag-gated; self-skips if SnorkelTasks
# is absent, and JAQUES=off suppresses it for a lean launch.
if [[ "${JAQUES:-on}" != "off" ]]; then
    echo "Launching Jacques (Contract Archon) in tmux window..."
    launch_jaques_window
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

# Styx (Host Executor) (signal-file daemon for Docker↔host Claude delegation)
BRIDGE_SCRIPT="$ALFRED_DIR/.claude/jobs/lib/host-executor-bridge.sh"
if [[ -x "$BRIDGE_SCRIPT" ]] || [[ -f "$BRIDGE_SCRIPT" ]]; then
    if ! "$TMUX_BIN" list-windows -t "$SESSION_NAME" -F '#{window_name}' 2>/dev/null | grep -q '^Styx$'; then
        "$TMUX_BIN" new-window -t "$SESSION_NAME" -n "Styx" -d \
            "cd '$ALFRED_DIR' && export TMUX_SESSION='$SESSION_NAME' ALFRED_DIR='$ALFRED_DIR' && bash '$BRIDGE_SCRIPT' --daemon; echo 'Styx stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:Styx" automatic-rename off 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} Styx (Host Executor) daemon started"
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
            "cd '$ALFRED_LAUNCH_DIR' && export JARVIS_WINDOW=1 JICM_PROJECT_DIR='$PROJECT_DIR' ANTHROPIC_BASE_URL='$SEED_PROXY_URL' && export ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: seed-session' && claude --model '${AION_MODEL}' --dangerously-skip-permissions --permission-mode bypassPermissions; echo 'Protos stopped.'; read"
        "$TMUX_BIN" set-window-option -t "${SESSION_NAME}:${SEED_WINDOW}" automatic-rename off 2>/dev/null || true
        # Prime the seed: wait for Claude to be interactive, then inject the seed prompt.
        # This caches the initial context and confirms the session is ready for forking.
        # Detection: look for "Claude Code" banner (startup done) + "bypass permissions"
        # (interactive prompt ready). Can't match ❯ directly — tmux capture mangles Unicode.
        (
            sleep 15
            local_waited=0
            while [ "$local_waited" -lt 40 ]; do
                pane=$("$TMUX_BIN" capture-pane -t "${SESSION_NAME}:${SEED_WINDOW}" -p 2>/dev/null)
                if echo "$pane" | grep -q "Allow external CLAUDE.md"; then
                    "$TMUX_BIN" send-keys -t "${SESSION_NAME}:${SEED_WINDOW}" Down 2>/dev/null
                    sleep 0.3
                    "$TMUX_BIN" send-keys -t "${SESSION_NAME}:${SEED_WINDOW}" Enter 2>/dev/null
                    sleep 5
                    continue
                fi
                if echo "$pane" | grep -q "bypass permissions"; then
                    "$TMUX_BIN" send-keys -t "${SESSION_NAME}:${SEED_WINDOW}" 'You are the Alfred seed session. Acknowledge with: "Seed ready."' 2>/dev/null
                    sleep 0.5
                    "$TMUX_BIN" send-keys -t "${SESSION_NAME}:${SEED_WINDOW}" Enter 2>/dev/null
                    break
                fi
                sleep 2
                local_waited=$((local_waited + 2))
            done
        ) &
        echo -e "  ${GREEN}✓${NC} Protos warm session created (Alfred identity, model=${AION_MODEL})"
    else
        echo -e "  ${YELLOW}⚠${NC} Protos skipped — $ALFRED_LAUNCH_DIR not found"
        echo "    Create it: ln -sf $PROJECT_DIR/alfred $ALFRED_LAUNCH_DIR"
    fi
fi

# Set tmux options for better experience
"$TMUX_BIN" set-option -t "$SESSION_NAME" mouse on 2>/dev/null || true
"$TMUX_BIN" set-option -t "$SESSION_NAME" history-limit 10000 2>/dev/null || true
# Ensure chain windows (created later by bridge fork-resume) stack at 12+
"$TMUX_BIN" set-option -t "$SESSION_NAME" -g renumber-windows off 2>/dev/null || true

# Reorder all windows to their assigned indices
reorder_windows

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Aion is ready!                             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Tmux Windows:${NC}"
echo "  W0  Jarvis        Master Archon ($([ "$FRESH_MODE" == "true" ] && echo "fresh" || echo "resumed"))"
echo "  W1  Protos        Alfred seed (fork cache, model=${AION_MODEL})"
echo "  W2  HUD           Live dashboard"
echo "  W3  LiteLLM       Model proxy (:4000)"
echo "  W4  Ollama        Local model monitor (:11434)"
echo "  W5  MLX-Embed     Qwen3-Embedding-4B server (:8000)"
echo "  W6  Ennoia        Session orchestrator"
echo "  W7  Virgil        Codebase guide"
echo "  W8  Watcher       JICM v7.9 context monitor"
echo "  W9  Commands      Signal file → command injection"
echo "  W10 Styx          Host executor daemon + reaper"
[[ "$DEV_MODE" == "true" ]] && \
echo "  W11 Jarvis-dev    Developer test driver"
echo "  W12+              Chain windows (Alfred fork-resume tasks)"
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
