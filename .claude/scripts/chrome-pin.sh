#!/bin/bash
# chrome-pin.sh — which Chrome browser should this lane drive, and make the
# forced selection prompt go away.
#
# THE PROBLEM IT SOLVES
#   With 2+ Chrome extensions connected, the Chrome MCP injects a MUST-ask
#   instruction before every browser action, so each lane stops and interrogates
#   the user. That prompt is a FALLBACK, not a policy.
#
# HOW THE MCP ACTUALLY DECIDES (discoverAndSelectExtension, Claude Code v2.1.259,
# read out of the Bun-embedded bundle in the darwin-arm64 Mach-O binary):
#   1. requirePairedDevice   -> DEAD. The getter is consumed but NEVER PROVIDED
#                               by the CLI (0 providers in the binary). Ignore it.
#   2. selection already set -> return (this is what `select_browser` sets)
#   3. exactly one extension -> auto-select, silent
#   4. persisted pin matches a connected browser -> auto-connect, SILENT  <== the lever
#   5. otherwise             -> the AskUserQuestion prompt
#
# WHY A GLOBAL PIN IS ENOUGH, EVEN THOUGH LANES WANT DIFFERENT BROWSERS
#   getPersistedDeviceId reads ie().chromeExtension?.pairedDeviceId — GLOBAL, one
#   value, no project scope. But `selectedDeviceId` is PER-PROCESS. So concurrent
#   lanes never fight over live routing; they only fight over the default a NEW
#   session inherits. A lane that needs the other browser calls select_browser as
#   its first browser action and is correct immediately.
#
# CLAUDE_CONFIG_DIR would give true per-lane isolation, and is supported, but the
# config home also holds CREDENTIALS — a separate dir means a separate login per
# lane. Not worth it for this.
#
# Bash 3.2 (macOS). Never `set -euo pipefail`.

PROJECT_DIR="${PROJECT_DIR:-/Users/nathanielcannon/Claude/Project_Aion}"
MAP="$PROJECT_DIR/.claude/context/browser-map.json"
GLOBAL_CFG="$HOME/.claude.json"
PY="$PROJECT_DIR/infrastructure/.venv/bin/python"
[[ -x "$PY" ]] || PY="$(command -v python3)"

_key() {
    # Same precedence the JICM scripts use: explicit arg, then role, then window.
    [[ -n "$1" ]] && { echo "$1"; return; }
    [[ -n "$JARVIS_SESSION_ROLE" ]] && { echo "$JARVIS_SESSION_ROLE"; return; }
    echo "${JICM_KEY:-dev}"
}

usage() {
    cat <<USAGE
chrome-pin.sh — lane -> Chrome browser

  chrome-pin.sh show [key]     what this lane should drive, and what is pinned now
  chrome-pin.sh id [key]       print just the deviceId (for select_browser)
  chrome-pin.sh set-default <key|deviceId>
                               write the GLOBAL pin so the prompt stops appearing
  chrome-pin.sh list           every lane mapping
USAGE
}

_lookup() {  # key -> deviceId  (empty if unmapped)
    "$PY" - "$MAP" "$1" <<'PYEOF'
import json,sys
m=json.load(open(sys.argv[1])); k=sys.argv[2]
e=m.get("lanes",{}).get(k)
print(e["deviceId"] if e else "")
PYEOF
}

_name_of() {
    "$PY" - "$MAP" "$1" <<'PYEOF'
import json,sys
m=json.load(open(sys.argv[1]))
print(m.get("browsers",{}).get(sys.argv[2],{}).get("name","(unknown)"))
PYEOF
}

_current_pin() { "$PY" -c "
import json,sys
try: d=json.load(open('$GLOBAL_CFG'))
except Exception: print(''); sys.exit()
print(d.get('chromeExtension',{}).get('pairedDeviceId','') or '')
"; }

cmd_show() {
    local k dev cur
    k="$(_key "$1")"; dev="$(_lookup "$k")"; cur="$(_current_pin)"
    echo "lane            : $k"
    if [[ -z "$dev" ]]; then
        echo "mapped browser  : (UNMAPPED — add it to $MAP)"
    else
        echo "mapped browser  : $dev  ($(_name_of "$dev"))"
    fi
    if [[ -z "$cur" ]]; then
        echo "global pin      : (none) — the selection prompt WILL fire with 2+ browsers"
    else
        echo "global pin      : $cur  ($(_name_of "$cur"))"
    fi
    if [[ -n "$dev" && -n "$cur" && "$dev" != "$cur" ]]; then
        echo
        echo "ACTION: this lane wants a different browser than the global pin."
        echo "        Call select_browser with deviceId $dev as your FIRST browser action."
        echo "        That is per-session and promptless; it does not disturb other lanes' routing."
    elif [[ -n "$dev" && "$dev" == "$cur" ]]; then
        echo
        echo "OK: the global pin already matches this lane. The MCP auto-connects silently."
    fi
}

cmd_set_default() {
    local target="$1" dev
    [[ -n "$target" ]] || { echo "chrome-pin: set-default needs a lane key or a deviceId" >&2; return 2; }
    dev="$(_lookup "$target")"; [[ -n "$dev" ]] || dev="$target"
    "$PY" - "$GLOBAL_CFG" "$dev" "$(_name_of "$dev")" <<'PYEOF'
import json,sys,os,tempfile
cfg,dev,name=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(cfg))
ce=d.setdefault("chromeExtension",{})
before=ce.get("pairedDeviceId")
ce["pairedDeviceId"]=dev
ce["pairedDeviceName"]=name
# Write via a temp file in the same directory, then rename: ~/.claude.json is
# live state for every running session and a partial write would corrupt it.
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(cfg))
with os.fdopen(fd,"w") as f: json.dump(d,f,indent=2)
os.replace(tmp,cfg)
print(f"global pin {before} -> {dev} ({name})")
PYEOF
    echo "New SESSIONS inherit this. Sessions already running keep their in-memory selection."
}

case "${1:-show}" in
    show)        cmd_show "$2" ;;
    id)          _lookup "$(_key "$2")" ;;
    set-default) cmd_set_default "$2" ;;
    list)        "$PY" - "$MAP" <<'PYEOF'
import json,sys
m=json.load(open(sys.argv[1])); b=m.get("browsers",{})
for k,v in m.get("lanes",{}).items():
    d=v["deviceId"]
    print(f"  {k:9s} {b.get(d,{}).get('name','(unknown)'):11s} {d}  {v.get('note','')}")
PYEOF
                 ;;
    -h|--help)   usage ;;
    *)           usage; exit 2 ;;
esac
