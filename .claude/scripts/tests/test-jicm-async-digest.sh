#!/bin/bash
# Behavioural test of the async digest: does the cycle stop waiting on it, does
# the finalizer still fold it, and does it refuse to inject into the dead
# transcript? Stubs stand in for the model and the tmux injection.
T=/private/tmp/claude-501/-Users-nathanielcannon-Claude-Project-Aion/2c92c4bc-4285-4f1a-8524-fb5f8451670d/scratchpad/t_async
rm -rf "$T"; mkdir -p "$T/jicm-digest" "$T/digests"
SRC=/Users/nathanielcannon/Claude/Project_Aion/.claude/scripts/jicm-actuate.sh

# stub tdigest: takes DIGEST_SECS to run, prints the row on stdout, writes --out
cat > "$T/jicm-digest/tdigest.py" <<'PY'
import sys, time, json, os
secs=float(os.environ.get("DIGEST_SECS","6")); time.sleep(secs)
out=sys.argv[sys.argv.index("--out")+1]
open(out,"w").write("DIGEST BODY for "+sys.argv[1]+"\n")
print(json.dumps({"degenerate": os.environ.get("DEGEN")=="1", "truncated": False, "words": 412}))
PY

SCRIPT_DIR="$T"; JICM_DIGESTS_DIR="$T/digests"; JICM_LOG_FILE="$T/log"
JICM_DIGEST_ARGS="--model stub"; JICM_DIGEST_ENABLED=true
JK_KEY=testlane; JK_COMPRESSED="$T/checkpoint.md"; echo "CHECKPOINT" > "$JK_COMPRESSED"
TRANSCRIPT="$T/old-1111111111111111.jsonl"; echo '{}' > "$TRANSCRIPT"
LIVE="$T/new-2222222222222222.jsonl"; echo '{}' > "$LIVE"
_log(){ printf '%s %s\n' "$(date +%T)" "$*" | tee -a "$T/log"; }
_inject(){ echo "INJECT[$1] ${2:0:60}" >> "$T/injects"; }
_wait_for_idle(){ [[ "$1" == "$LIVE" ]] && return 0; echo "  !! _wait_for_idle called on DEAD transcript" ; return 0; }
_reg(){ [[ "$1" == ".transcript_path" ]] && echo "$REG_LIVE"; }
eval "$(sed -n '/^_step_digest() {/,/^}/p' "$SRC")"
eval "$(sed -n '/^_step_digest_finalize() {/,/^}/p' "$SRC")"
JD_PID=""; JD_OUT=""; JD_SID=""; JD_ROW_FILE=""

echo "== 1. launch is non-blocking (stub digest takes 6s) =="
export DIGEST_SECS=6
s=$(date +%s); _step_digest; e=$(date +%s)
echo "   _step_digest returned in $((e-s))s  (must be ~0)"

echo "== 2. finalizer folds it and notifies the LIVE transcript =="
REG_LIVE="$LIVE"
s=$(date +%s); _step_digest_finalize; e=$(date +%s)
echo "   finalizer took $((e-s))s"
grep -q "DIGEST BODY" "$JK_COMPRESSED" && echo "   FOLD: checkpoint contains the digest" || echo "   FOLD: MISSING"
[[ -s "$T/injects" ]] && echo "   NOTIFY: $(cat "$T/injects" | tail -1)" || echo "   NOTIFY: none"

echo "== 3. refuses to inject when the registry still shows the DEAD transcript =="
rm -f "$T/injects"; JD_PID=""; echo "CHECKPOINT" > "$JK_COMPRESSED"
export DIGEST_SECS=1; _step_digest; REG_LIVE="$TRANSCRIPT"; _step_digest_finalize
[[ -s "$T/injects" ]] && echo "   BAD: injected anyway" || echo "   GOOD: no injection into the cleared session"

echo "== 4. degenerate digest is NOT folded =="
rm -f "$T/injects"; JD_PID=""; echo "CHECKPOINT" > "$JK_COMPRESSED"
export DEGEN=1 DIGEST_SECS=1; REG_LIVE="$LIVE"; _step_digest; _step_digest_finalize
grep -q "DIGEST BODY" "$JK_COMPRESSED" && echo "   BAD: degenerate digest folded" || echo "   GOOD: degenerate not folded"
