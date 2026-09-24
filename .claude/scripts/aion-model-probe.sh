#!/bin/bash
# aion-model-probe.sh — what model ID actually serves, and at what context window?
#
# WHY THIS EXISTS. launch-aion.sh pins an ORDERED cascade of concrete model IDs
# (AION_MODEL_CASCADE). After a `claude` upgrade the newest model's exact ID is not
# knowable by guesswork, and guessing is the expensive failure here: a wrong ID does
# not error, it falls back to the next cascade entry, so the estate quietly keeps
# running the OLD model while everyone believes it was upgraded.
#
# So measure it. `--model opus[1m]` asks the CLI for "latest Opus" and the result's
# modelUsage is KEYED BY THE MODEL THAT ACTUALLY ANSWERED, carrying the REAL
# contextWindow. Verified 2026-09-24: the key RETAINS the [1m] suffix
# ('claude-opus-5[1m]', contextWindow 1000000), so what this prints can be pasted
# into the cascade verbatim.
#
# USE THE ALIAS ONLY FOR DISCOVERY, NOT IN THE CASCADE. resolve_aion_model() warns
# "CASCADE FELL BACK" whenever served != primary; with an alias at the head that
# fires on every single launch, and an alarm that always fires is an alarm nobody
# reads. Discover here, paste the concrete ID there.
#
# Same lean-probe rules as the launcher: neutral cwd, empty MCP set, stdin closed.
# Run in-tree instead and it boots 6 MCP servers + ~39 hooks and returns nothing in 120s.
#
# Bash 3.2 (macOS). Never `set -euo pipefail`.

CANDIDATE="${1:-opus[1m]}"
TIMEOUT="${AION_PROBE_TIMEOUT:-90}"

PD="$(mktemp -d "${TMPDIR:-/tmp}/aion-model-probe.XXXXXX")" || { echo "probe: mktemp failed" >&2; exit 1; }
trap 'rm -rf "$PD" 2>/dev/null' EXIT
printf '{"mcpServers":{}}' > "$PD/mcp.json"

OUT="$(cd "$PD" && timeout "$TIMEOUT" claude -p 'ok' \
        --model "$CANDIDATE" --output-format json \
        --strict-mcp-config --mcp-config "$PD/mcp.json" \
        --dangerously-skip-permissions 2>/dev/null < /dev/null)"

printf '%s' "$OUT" | python3 -c '
import json, sys
cand = sys.argv[1]
raw = sys.stdin.read()
if not raw.strip():
    print("  PROBE FAILED: no output. Is `claude` on PATH and authenticated?"); raise SystemExit(2)
try:
    d = json.loads(raw)
except Exception as e:
    print("  PROBE FAILED: not JSON (%s)" % e); raise SystemExit(2)
for e in (d if isinstance(d, list) else [d]):
    if e.get("type") == "result":
        mu = e.get("modelUsage") or {}
        if not mu:
            print("  PROBE FAILED: result carried no modelUsage."); raise SystemExit(2)
        for m, u in mu.items():
            w = u.get("contextWindow", 0)
            print("  requested   : %s" % cand)
            print("  SERVED ID   : %s" % m)
            print("  ctx window  : %s" % w)
            if m != cand:
                print("  note        : served id differs from the request (alias resolved, or fell back).")
            if not str(m).lower().endswith("[1m]"):
                print("  WARNING     : no [1m] suffix on the served id — this is a 200K session.")
                print("                Do NOT paste it into AION_MODEL_CASCADE without the suffix.")
            if w and int(w) != 1000000:
                print("  WARNING     : measured window is %s, not 1000000." % w)
                print("                jicm-gate.sh maps by NAME; check its case map covers this id.")
        raise SystemExit(0)
print("  PROBE FAILED: no result event in payload."); raise SystemExit(2)
' "$CANDIDATE"
