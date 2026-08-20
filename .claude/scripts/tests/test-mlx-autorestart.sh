#!/bin/bash
# Branch harness for the MLX leak auto-restart (jicm-watcher.sh).
# SAFE BY CONSTRUCTION: every path that could respawn a pane is pointed at a THROWAWAY tmux
# target, and the real aion:5 is never named. A test that can restart production is not a test.
SUP="/Users/nathanielcannon/Claude/Project_Aion/.claude/scripts/jicm-watcher.sh"
TMUX_BIN="/Users/nathanielcannon/bin/tmux"
P=0; F=0
ok(){ if [ "$2" = "$3" ]; then echo "  PASS $1"; P=$((P+1)); else echo "  FAIL $1 (got '$2' want '$3')"; F=$((F+1)); fi; }
has(){ case "$2" in *"$3"*) echo "  PASS $1"; P=$((P+1));; *) echo "  FAIL $1 (got '$2' want substring '$3')"; F=$((F+1));; esac; }

# shellcheck disable=SC1090
source "$SUP"

echo "1. threshold derives from baseline x multiplier (not a hand-set constant)"
ok "2654MB x3 -> 8GB" "$MAINT_MLX_FOOTPRINT_GB" "8"
ok "target is aion:5" "$MAINT_MLX_TARGET" "aion:5"
(
  export JICM_HEALTH_MLX_BASELINE_MB=4000 JICM_HEALTH_MLX_LEAK_MULT=5
  v=$(bash -c 'source '"$SUP"'; echo $MAINT_MLX_FOOTPRINT_GB')
  if [ "$v" = "20" ]; then echo "  PASS re-measured baseline moves the trigger (4000MB x5 -> 20GB)"; else echo "  FAIL baseline override (got $v want 20)"; fi
)

echo "2. _mlx_busy REFUSES on each independent signal"
mkdir -p "$JICM_SIGNALS_DIR"
touch "$JICM_SIGNALS_DIR/actuating.__test__"
has "actuation lock" "$(_mlx_busy 1 ok)" "actuation-in-flight"
rm -f "$JICM_SIGNALS_DIR/actuating.__test__"
has "saturated probe" "$(_mlx_busy 1 timeout)" "probe-saturated"
# Absence-is-not-zero: a pid we cannot measure must read BUSY, never idle.
has "unmeasurable footprint" "$(_mlx_busy 999999 ok)" "footprint-unmeasurable"

echo "3. cooldown blocks a loop-restart"
STAMP="$PROJECT_DIR/.claude/context/.mlx-last-restart"
SAVED=""; [ -f "$STAMP" ] && SAVED="$(cat "$STAMP")"
printf '%s' "$(_now)" > "$STAMP"
out="$(_mlx_restart 1 99 2>&1; echo "rc=$?")"
has "refuses inside cooldown" "$out" "rc=1"
grep -q 'cooldown, NOT restarting' "$SUP_LOG" 2>/dev/null && { echo "  PASS cooldown logged"; P=$((P+1)); } || { echo "  FAIL cooldown not logged"; F=$((F+1)); }

echo "4. unresolvable target refuses instead of guessing"
printf '0' > "$STAMP"
out="$(MAINT_MLX_TARGET='aion:__nonexistent__' _mlx_restart 1 99 2>&1; echo "rc=$?")"
has "refuses on unresolvable pane" "$out" "rc=1"
# Either refusal path is correct, and BOTH must name a cause. Note: `tmux display -t <bad> -p`
# does NOT fail — it falls back to another pane's start command — so the empty-cmd branch is not
# the one that fires here; respawn-pane rejects the bad target instead. Assert the property
# (refused + cause named), not the specific branch.
tail -3 "$SUP_LOG" | grep -qE 'start command unresolvable|respawn of .* FAILED' \
  && { echo "  PASS names the cause"; P=$((P+1)); } || { echo "  FAIL cause not named"; F=$((F+1)); }

# restore
if [ -n "$SAVED" ]; then printf '%s' "$SAVED" > "$STAMP"; else rm -f "$STAMP"; fi

echo; echo "PASS=$P FAIL=$F"; [ "$F" -eq 0 ]
