#!/bin/bash
# chrome-pin.sh — which Chrome session should this lane drive?
#
# THE PROBLEM
#   With 2+ Chrome extensions connected, the Chrome MCP injects a MUST-ask
#   instruction before every browser action. That prompt is a FALLBACK, not a
#   policy: it fires only when the pin matches nothing.
#
# HOW THE MCP DECIDES (discoverAndSelectExtension, Claude Code v2.1.259, read
# from the Bun bundle inside the darwin-arm64 Mach-O binary):
#   1. requirePairedDevice   -> DEAD. Consumed but NEVER PROVIDED by the CLI
#                               (0 providers in the binary). Do not design on it.
#   2. selection already set -> return.  <- what select_browser sets
#   3. exactly one extension -> auto-select, silent
#   4. persisted pin matches -> auto-connect, SILENT        <== the lever
#   5. otherwise             -> the AskUserQuestion prompt
#
# WHY ROLES
#   Lanes need a PRIMARY session plus occasional access to a SHARED one (journal
#   access). getPersistedDeviceId reads ie().chromeExtension?.pairedDeviceId --
#   ONE value, global, no project scope. But selectedDeviceId is PER-PROCESS, so
#   a lane can borrow an alternate with select_browser without disturbing any
#   other lane's live routing. Global pin = the common case; select_browser =
#   the exception.
#
# Bash 3.2 (macOS). Never `set -euo pipefail`.

PROJECT_DIR="${PROJECT_DIR:-/Users/nathanielcannon/Claude/Project_Aion}"
MAP="$PROJECT_DIR/.claude/context/browser-map.json"
GLOBAL_CFG="$HOME/.claude.json"
PY="$PROJECT_DIR/infrastructure/.venv/bin/python"
[[ -x "$PY" ]] || PY="$(command -v python3)"

_key() {
    [[ -n "$1" ]] && { echo "$1"; return; }
    [[ -n "$JARVIS_SESSION_ROLE" ]] && { echo "$JARVIS_SESSION_ROLE"; return; }
    echo "${JICM_KEY:-dev}"
}

_q() {   # _q <verb> [args...] -> python helper over the map
    "$PY" "$PROJECT_DIR/.claude/scripts/chrome_pin_lib.py" "$MAP" "$GLOBAL_CFG" "$@"
}

usage() {
    cat <<USAGE
chrome-pin.sh — lane -> role -> Chrome deviceId

  show [lane] [role]              what this lane should drive right now
  id   [lane] [role]              just the deviceId (feed to select_browser)
  roles                           every role and whether it is resolved
  list                            every lane mapping
  resolve                         how to establish which deviceId is which
  set-profile <personal|micro1> <deviceId>   record a VERIFIED mapping
  set-default <role|deviceId>     rewrite the GLOBAL pin
USAGE
}

case "${1:-show}" in
    show)        _q show "$(_key "$2")" "${3:-}" ;;
    id)          _q id   "$(_key "$2")" "${3:-}" ;;
    roles)       _q roles ;;
    list)        _q list ;;
    resolve)     _q resolve ;;
    set-profile) _q set-profile "${2:-}" "${3:-}" ;;
    set-default) _q set-default "${2:-}" ;;
    -h|--help)   usage ;;
    *)           usage; exit 2 ;;
esac
