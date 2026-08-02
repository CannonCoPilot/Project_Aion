#!/usr/bin/env bash
# Functional test of patched inject_and_wait (sentinel + output-detection paths).
BRIDGE=/Users/nathanielcannon/Claude/Project_Aion/alfred/.claude/jobs/lib/host-executor-bridge.sh
export STATE_DIR=$(mktemp -d); export TMUX_BIN=true; export TMUX_SESSION=test
log(){ :; }
eval "$(awk '/^inject_and_wait\(\) \{/{f=1} f{print} f&&/^}$/{exit}' "$BRIDGE")"
echo "prompt body" > "$STATE_DIR/.bp.txt"

echo "=== detection predicate (no sleep) ==="
MK=$(mktemp); OUT=$(mktemp -d)
touch -t 202001010000 "$OUT/old.md"
find "$OUT" -type f -newer "$MK" 2>/dev/null | grep -q . && echo "FAIL: pre-existing triggered" || echo "PASS: pre-existing ignored"
echo fresh > "$OUT/new.md"
find "$OUT" -type f -newer "$MK" 2>/dev/null | grep -q . && echo "PASS: fresh file detected" || echo "FAIL: fresh missed"
rm -rf "$OUT" "$MK"

echo ""
echo "=== TEST A: output-detection (no sentinel; doc written ~7s in) ==="
OUTA=$(mktemp -d)
( sleep 7; echo "deliverable" > "$OUTA/07_test.md" ) &
sa=$SECONDS; inject_and_wait win taskA "$STATE_DIR/.bp.txt" 2 "$OUTA"; echo "  rc=$? elapsed=$((SECONDS-sa))s (expect rc=0 ~27s)"

echo "=== TEST B: sentinel path (sentinel ~6s in) ==="
OUTB=$(mktemp -d)
( sleep 6; echo DONE > "$STATE_DIR/.chain-done-taskB" ) &
sb=$SECONDS; inject_and_wait win taskB "$STATE_DIR/.bp.txt" 2 "$OUTB"; echo "  rc=$? elapsed=$((SECONDS-sb))s (expect rc=0 ~6s)"

rm -rf "$OUTA" "$OUTB" "$STATE_DIR"
echo "=== DONE ==="
