#!/bin/bash
# alfred-observer.sh — Capture Alfred operator + canary + chain state, diff vs
# last-seen snapshot, emit a structured digest with "changed" flags so the
# caller can narrate only what's new.
#
# State file: $STATE (json-ish key=value, line-per-key for trivial diffability).
# Output: stdout-only digest. Always emits the current digest; "CHANGED:" lines
# precede unchanged sections to flag deltas.
#
# Tracked signals:
#   - W1:Protos tail hash (substantive content, not spinner)
#   - W12 chain window list (births/deaths)
#   - Canary AION-11bd2c23 status, label-set hash, stage_output.expected_output
#   - Pulse API reachability
set -u  # NOT -e per bash-gotchas: grep exit 1 would kill us

TMUX_BIN=/Users/nathanielcannon/bin/tmux
PROJECT_DIR=/Users/nathanielcannon/Claude/Project_Aion
STATE="$PROJECT_DIR/.claude/context/.alfred-observer-state"
CANARY_ID="${ALFRED_CANARY_ID:-AION-11bd2c23}"
PULSE_API="${PULSE_API:-http://localhost:8800}"

# ── helpers ─────────────────────────────────────────────────────────────────
hash() { /sbin/md5 -q 2>/dev/null || md5sum | awk '{print $1}'; }
prev() { grep "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; }
emit() {
    local key="$1" cur="$2"
    local was; was=$(prev "$key")
    if [[ "$cur" != "$was" ]]; then
        echo "CHANGED [$key]: $was → $cur"
    fi
    # rewrite this key in state (atomic-ish: rebuild)
    grep -v "^$key=" "$STATE" 2>/dev/null > "$STATE.tmp"
    echo "$key=$cur" >> "$STATE.tmp"
    mv "$STATE.tmp" "$STATE"
}

touch "$STATE"

# ── 1. tmux window list (births/deaths of chain windows) ────────────────────
WIN_LIST=$("$TMUX_BIN" list-windows -t aion -F "#{window_index}:#{window_name}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
emit "windows" "$WIN_LIST"

# ── 2. W1 Alfred operator pane tail (substantive only) ──────────────────────
# Capture last 40 lines, strip spinner/status-bar lines, hash.
W1_TAIL=$("$TMUX_BIN" capture-pane -t aion:1 -p -S -40 2>/dev/null \
    | grep -vE '^[[:space:]]*$|^[│|─━╿▒░▓]+|⏵⏵|services \(main\)|\[▓▒░' \
    | tail -20)
W1_HASH=$(printf '%s' "$W1_TAIL" | hash)
emit "w1_tail_hash" "$W1_HASH"
# If changed, also stash the actual tail for the caller to read
if grep -q "^CHANGED \[w1_tail_hash\]" <<< "$(grep -v '^CHANGED' /dev/null)" 2>/dev/null; then :; fi
W1_TAIL_FILE="$PROJECT_DIR/.claude/context/.alfred-observer-w1-last.txt"
printf '%s\n' "$W1_TAIL" > "$W1_TAIL_FILE"

# ── 3. W12+ chain windows tail (currently 1: chain-912c416b) ────────────────
for win in $("$TMUX_BIN" list-windows -t aion -F "#{window_index}:#{window_name}" 2>/dev/null | grep ":chain-" | cut -d: -f1); do
    name=$("$TMUX_BIN" list-windows -t aion -F "#{window_index}:#{window_name}" 2>/dev/null | grep "^$win:" | cut -d: -f2)
    tail=$("$TMUX_BIN" capture-pane -t "aion:$win" -p -S -20 2>/dev/null | grep -vE '^[[:space:]]*$' | tail -8)
    h=$(printf '%s' "$tail" | hash)
    emit "chain_${name}_hash" "$h"
    printf '%s\n' "$tail" > "$PROJECT_DIR/.claude/context/.alfred-observer-chain-$name.txt"
done

# ── 4. Pulse canary state ───────────────────────────────────────────────────
CANARY_JSON=$(curl -sf --max-time 5 "$PULSE_API/api/v1/tasks/$CANARY_ID" 2>/dev/null)
if [[ -n "$CANARY_JSON" ]]; then
    emit "pulse_reachable" "yes"
    STATUS=$(printf '%s' "$CANARY_JSON" | python3 -c 'import sys,json;t=json.load(sys.stdin);print(t.get("status","?"))' 2>/dev/null)
    LABELS=$(printf '%s' "$CANARY_JSON" | python3 -c 'import sys,json;t=json.load(sys.stdin);print(",".join(sorted(t.get("labels",[]))))' 2>/dev/null)
    LHASH=$(printf '%s' "$LABELS" | hash)
    EXP_OUT=$(printf '%s' "$CANARY_JSON" | python3 -c 'import sys,json;t=json.load(sys.stdin);so=(t.get("metadata") or {}).get("stage_output") or {};print((so.get("expected_output") or "")[:80])' 2>/dev/null)
    EXEC_ATT=$(printf '%s' "$CANARY_JSON" | python3 -c 'import sys,json;t=json.load(sys.stdin);print((t.get("metadata") or {}).get("executor_attempts","?"))' 2>/dev/null)
    emit "canary_status" "$STATUS"
    emit "canary_labels_hash" "$LHASH"
    emit "canary_labels" "$LABELS"
    emit "canary_exec_attempts" "$EXEC_ATT"

    # If expected_output is a file path, check whether it materialized
    if [[ "$EXP_OUT" == /Users/* ]]; then
        OUT_PATH=$(printf '%s' "$CANARY_JSON" | python3 -c 'import sys,json,re;t=json.load(sys.stdin);so=(t.get("metadata") or {}).get("stage_output") or {};eo=so.get("expected_output") or "";m=re.search(r"(/Users/[^\s]+\.(json|md|txt|csv))",eo);print(m.group(1) if m else "")' 2>/dev/null)
        if [[ -n "$OUT_PATH" ]]; then
            if [[ -f "$OUT_PATH" ]]; then
                OUT_SIZE=$(stat -f %z "$OUT_PATH" 2>/dev/null)
                emit "canary_output_file" "$OUT_PATH"
                emit "canary_output_size" "$OUT_SIZE"
            else
                emit "canary_output_file" "$OUT_PATH"
                emit "canary_output_size" "absent"
            fi
        fi
    fi
else
    emit "pulse_reachable" "no"
fi

# ── 5. Active task count (kanban depth) ─────────────────────────────────────
ACTIVE_COUNT=$(curl -sf --max-time 5 "$PULSE_API/api/v1/tasks?label=active:running&limit=100" 2>/dev/null \
    | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    items=d.get("items") or d.get("tasks") or (d if isinstance(d,list) else [])
    print(len(items))
except Exception:
    print("?")
' 2>/dev/null)
emit "active_running_count" "$ACTIVE_COUNT"

# ── 6. Phase output dirs (count files, watch for new births) ────────────────
# Phase A → docs/reconstruction/, Phase B → alfred/output/neural-canvas/
PHASE_A_COUNT=$(ls /Users/nathanielcannon/Claude/Projects/neural-canvas/docs/reconstruction/ 2>/dev/null | wc -l | tr -d ' ')
PHASE_B_COUNT=$(ls /Users/nathanielcannon/Claude/Project_Aion/alfred/output/neural-canvas/ 2>/dev/null | wc -l | tr -d ' ')
emit "phase_a_doc_count" "$PHASE_A_COUNT"
emit "phase_b_doc_count" "$PHASE_B_COUNT"

# ── 7. Footer: timestamp ────────────────────────────────────────────────────
emit "observed_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
