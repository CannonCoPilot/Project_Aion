#!/bin/bash
# Harness for _jicm_retire_duplicate_bg. Sandbox PROJECT_DIR — never touches live state.
SB="$(mktemp -d)"; trap 'rm -rf "$SB"' EXIT
export PROJECT_DIR="$SB"
mkdir -p "$SB/.claude/context/jicm"/{registry,state,signals,chain}
source /Users/nathanielcannon/Claude/Project_Aion/.claude/scripts/jicm-config.sh

PASS=0; FAIL=0
ok(){ if eval "$2"; then echo "  PASS $1"; PASS=$((PASS+1)); else echo "  FAIL $1"; FAIL=$((FAIL+1)); fi; }
SID="6c429de9-1690-4372-aacd-d0f50440a6b1"; OTHER="deadbeef-0000-0000-0000-000000000000"
R="$JICM_REGISTRY_DIR"; S="$JICM_DIR/state"; SIG="$JICM_SIGNALS_DIR"

reset(){
  rm -rf "$R" "$S" "$SIG" "$JICM_CHAIN_DIR" "$JICM_DIR/archive"
  mkdir -p "$R" "$S" "$SIG" "$JICM_CHAIN_DIR"
  echo "{\"session_id\":\"$SID\",\"tmux_target\":\"aion:12\"}" > "$R/genie.json"
  echo "{\"session_id\":\"${1:-$SID}\",\"tmux_target\":\"\"}"  > "$R/genie-bg-6c429de9.json"
  echo '{"tokens":0}' > "$S/genie-bg-6c429de9.json"
  : > "$S/.last-sample.genie-bg-6c429de9"
  JICM_RECONCILE_NOTE=""
}

echo "T1: duplicate (same sid) is retired"
reset; _jicm_retire_duplicate_bg genie "$SID"; rc=$?
ok "returns 0"                  "[[ $rc -eq 0 ]]"
ok "bg registry gone"           "[[ ! -f '$R/genie-bg-6c429de9.json' ]]"
ok "bg state gone"              "[[ ! -f '$S/genie-bg-6c429de9.json' ]]"
ok "sample marker gone"         "[[ ! -f '$S/.last-sample.genie-bg-6c429de9' ]]"
ok "canonical UNTOUCHED"        "[[ \"\$(jq -r .session_id '$R/genie.json')\" == '$SID' ]]"
ok "archived, not deleted"      "[[ -n \"\$(find '$JICM_DIR/archive' -name 'genie-bg-*.json' 2>/dev/null)\" ]]"
ok "note says RETIRED"          "[[ \"\$JICM_RECONCILE_NOTE\" == RETIRED* ]]"

echo "T2: bg key naming a DIFFERENT session (real fork) is left alone"
reset "$OTHER"; JICM_RECONCILE_NOTE=""; _jicm_retire_duplicate_bg genie "$SID"; rc=$?
ok "returns 1"                  "[[ $rc -eq 1 ]]"
ok "fork registry PRESERVED"    "[[ -f '$R/genie-bg-6c429de9.json' ]]"
ok "no note emitted"            "[[ -z \"\$JICM_RECONCILE_NOTE\" ]]"

echo "T3: actuation in flight -> defer, nothing moved"
reset; : > "$SIG/actuating.genie"; _jicm_retire_duplicate_bg genie "$SID"; rc=$?
ok "returns 1"                  "[[ $rc -eq 1 ]]"
ok "registry PRESERVED"         "[[ -f '$R/genie-bg-6c429de9.json' ]]"
ok "note says defer"            "[[ \"\$JICM_RECONCILE_NOTE\" == defer* ]]"

echo "T4: no bg key -> silent no-op"
reset; rm -f "$R/genie-bg-6c429de9.json"; JICM_RECONCILE_NOTE=""
_jicm_retire_duplicate_bg genie "$SID"; rc=$?
ok "returns 1"                  "[[ $rc -eq 1 ]]"
ok "no note"                    "[[ -z \"\$JICM_RECONCILE_NOTE\" ]]"

echo "T5: chain lineage merges forward, never dropped"
reset
echo '{"ts":"2026-08-15T10:00:00Z","ev":"canon"}' > "$JICM_CHAIN_DIR/genie.jsonl"
echo '{"ts":"2026-08-15T09:00:00Z","ev":"bg"}'    > "$JICM_CHAIN_DIR/genie-bg-6c429de9.jsonl"
_jicm_retire_duplicate_bg genie "$SID" >/dev/null
ok "canonical chain has BOTH rows" "[[ \$(wc -l < '$JICM_CHAIN_DIR/genie.jsonl') -eq 2 ]]"
ok "sorted by ts (bg row first)"   "[[ \"\$(head -1 '$JICM_CHAIN_DIR/genie.jsonl' | jq -r .ev)\" == 'bg' ]]"
ok "bg chain consumed"             "[[ ! -f '$JICM_CHAIN_DIR/genie-bg-6c429de9.jsonl' ]]"

echo "T6: caller's key paths restored to canonical after the call"
reset; jicm_key_paths genie; _jicm_retire_duplicate_bg genie "$SID" >/dev/null
ok "JK_STATE points at canonical" "[[ \"\$JK_STATE\" == *'/genie.json' ]]"

echo; echo "PASS=$PASS FAIL=$FAIL"; [[ $FAIL -eq 0 ]]
