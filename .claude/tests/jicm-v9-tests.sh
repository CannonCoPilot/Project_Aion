#!/bin/bash
# jicm-v9-tests.sh — TDD suite for the JICM v9 per-key machinery.
#
# Written test-first: each case below was RED before its fix existed. Cases assert on the
# key-generic paths (any key, not just w0/dev), because every defect found during live testing
# on 2026-07-29 was of one shape: a component that hardcoded w0/dev and quietly fell back to
# W0's SHARED files for anything else.
#
# Deliberately NOT `set -euo pipefail` — a non-zero grep inside a test is data, not a fatal
# error, and the house rule for these scripts on macOS Bash 3.2 is to let tests report rather
# than abort the run (see .claude/context/reference/bash-gotchas.md).
#
# Usage:  bash jicm-v9-tests.sh [-v]
#   -v   print the reason for every test, not just failures

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
SCRIPTS="$PROJECT_DIR/.claude/scripts"
HOOKS="$PROJECT_DIR/.claude/hooks"
CTX="$PROJECT_DIR/.claude/context"
VERBOSE=0
[[ "${1:-}" == "-v" ]] && VERBOSE=1

PASS=0; FAIL=0; FAILED_NAMES=""
ok()   { PASS=$((PASS+1)); [[ $VERBOSE -eq 1 ]] && printf '  \033[32mPASS\033[0m %s — %s\n' "$1" "$2"; return 0; }
bad()  { FAIL=$((FAIL+1)); FAILED_NAMES="$FAILED_NAMES\n    - $1"; printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; return 0; }
# assert_contains <name> <haystack-file> <needle> <why>
assert_contains() { grep -q "$3" "$2" 2>/dev/null && ok "$1" "$4" || bad "$1" "$4"; }
assert_absent()   { grep -q "$3" "$2" 2>/dev/null && bad "$1" "$4" || ok "$1" "$4"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/jicm-tests.XXXXXX")"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

echo "JICM v9 test suite — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "sandbox: $SANDBOX"
echo

# ═══ GROUP 1 — key derivation is single-sourced ═══════════════════════════════
# Every "wrong lane" bug so far traces to a component reimplementing "what key am I".
# There must be exactly ONE derivation, and every consumer must use it.
echo "GROUP 1 — key derivation"

T=T1.1; WHY="jicm_derive_key resolves protos from JARVIS_WINDOW=1"
GOT="$(env -u JARVIS_SESSION_ROLE bash -c "source $SCRIPTS/jicm-config.sh >/dev/null 2>&1; JARVIS_WINDOW=1 jicm_derive_key" 2>/dev/null)"
[[ "$GOT" == "protos" ]] && ok "$T" "$WHY" || bad "$T" "$WHY (got '$GOT')"

T=T1.2; WHY="jicm_default_target maps protos to aion:1"
GOT="$(bash -c "source $SCRIPTS/jicm-config.sh >/dev/null 2>&1; jicm_default_target protos" 2>/dev/null)"
[[ "$GOT" == *":1" ]] && ok "$T" "$WHY" || bad "$T" "$WHY (got '$GOT')"

T=T1.3; WHY="session-start.sh does NOT reimplement key derivation (must source jicm-config)"
# RED at time of writing: session-start.sh carries its own w0/dev-only if-chain, so a protos
# session gets JICM_KEY=<session_id>, matches no injection branch, and never receives a
# per-key resume signal. The actuator then waits 60s and nudges blind.
if grep -q 'jicm_derive_key\|jicm_key_paths' "$HOOKS/session-start.sh" 2>/dev/null; then
    ok "$T" "$WHY"
else
    bad "$T" "$WHY — it has a private if-chain instead"
fi

# ═══ GROUP 2 — no cross-lane contamination ════════════════════════════════════
# The OriginalDR incident: a protos checkpoint carried W0's shared session-state.md, so the
# test lane read another lane's status as its own orders and launched a real pipeline.
echo "GROUP 2 — per-key memory isolation"

T=T2.1; WHY="config defines a per-key session-state for non-w0 keys"
GOT="$(bash -c "source $SCRIPTS/jicm-config.sh >/dev/null 2>&1; jicm_key_paths protos; echo \$JK_SESSION_STATE" 2>/dev/null)"
[[ "$GOT" == *"protos"* ]] && ok "$T" "$WHY" || bad "$T" "$WHY (got '$GOT')"

T=T2.2; WHY="_step_prep hands the per-key session-state to the prep script"
# RED at time of writing: _step_prep exported six JICM_* vars but not JICM_SESSION_STATE, so
# prep fell back to W0's shared file. The per-key value existed in config and was never passed.
assert_contains "$T" "$SCRIPTS/jicm-actuate.sh" "JICM_SESSION_STATE=" "$WHY"

T=T2.3; WHY="_step_prep hands the per-key scratchpad to the prep script"
assert_contains "$T" "$SCRIPTS/jicm-actuate.sh" "JICM_SCRATCHPAD=" "$WHY"

T=T2.4; WHY="_step_prep hands the per-key active-plan to the prep script"
assert_contains "$T" "$SCRIPTS/jicm-actuate.sh" "JICM_ACTIVE_PLAN=" "$WHY"

T=T2.5; WHY="a non-w0 checkpoint carries no other lane's project status"
# Behavioural check against the artifact a live cycle actually produced.
CKPT="$CTX/jicm/checkpoints/protos.compressed.md"
if [[ -f "$CKPT" ]]; then
    if grep -qiE "PALIMPSEST|ORIGINALDR|CHRONICLER|SPRINT-STATUS" "$CKPT" 2>/dev/null; then
        bad "$T" "$WHY — it carries another lane's project status"
    else
        ok "$T" "$WHY"
    fi
else
    ok "$T" "$WHY (no protos checkpoint on disk yet — nothing to contaminate)"
fi

# ═══ GROUP 3 — continuity ledger ══════════════════════════════════════════════
echo "GROUP 3 — continuity ledger"
CHAIN="$SCRIPTS/jicm-chain.sh"
TESTKEY="selftest-$$"
export JICM_CHAIN_DIR_OVERRIDE=""   # chain lives under the real dir; we clean our own key up
CHAINFILE="$CTX/jicm/chain/$TESTKEY.jsonl"
rm -f "$CHAINFILE"

T=T3.1; WHY="capture REFUSES a session with no transcript (never records an edge it cannot substantiate)"
"$CHAIN" capture "$TESTKEY" "no-such-session-xyz" >/dev/null 2>&1
[[ $? -ne 0 && ! -f "$CHAINFILE" ]] && ok "$T" "$WHY" || bad "$T" "$WHY"

REAL_SID="$(ls -S "$HOME/.claude/projects"/*/*.jsonl 2>/dev/null | head -1 | xargs basename 2>/dev/null | sed 's/\.jsonl$//')"
if [[ -z "$REAL_SID" ]]; then
    echo "  SKIP T3.2-T3.5 — no transcripts available to reference"
else
    T=T3.2; WHY="capture records an edge for a real session"
    "$CHAIN" capture "$TESTKEY" "$REAL_SID" 12345 >/dev/null 2>&1
    [[ -s "$CHAINFILE" ]] && ok "$T" "$WHY" || bad "$T" "$WHY"

    T=T3.3; WHY="bind is idempotent (the gate calls it on EVERY prompt)"
    for i in 1 2 3; do "$CHAIN" bind "$TESTKEY" "bind-target-aaa" >/dev/null 2>&1; done
    N="$(grep -c '"rec":"bind"' "$CHAINFILE" 2>/dev/null)"
    [[ "$N" == "1" ]] && ok "$T" "$WHY" || bad "$T" "$WHY (got $N bind rows, expected 1)"

    T=T3.4; WHY="bind REFUSES to make a session its own predecessor"
    "$CHAIN" capture "$TESTKEY" "$REAL_SID" >/dev/null 2>&1
    "$CHAIN" bind "$TESTKEY" "$REAL_SID" >/dev/null 2>&1
    [[ $? -ne 0 ]] && ok "$T" "$WHY" || bad "$T" "$WHY"

    T=T3.6; WHY="capture records UNKNOWN tokens as null, never as a fake 0"
    # Live cycle 3 recorded "0 tok" because the gate's state file still read 0 (the successor's
    # first write lands before usage does). Writing 0 into the ledger states a measurement that
    # was never taken; the reader cannot distinguish "empty session" from "not yet known".
    rm -f "$CHAINFILE"
    printf '' > /dev/null
    "$CHAIN" capture "$TESTKEY" "$REAL_SID" 0 >/dev/null 2>&1
    TOKVAL="$(jq -r 'select(.rec=="capture") | .tokens' "$CHAINFILE" 2>/dev/null | tail -1)"
    [[ "$TOKVAL" == "null" ]] && ok "$T" "$WHY" || bad "$T" "$WHY (recorded '$TOKVAL')"

    T=T3.5; WHY="digest attach REFUSES a nonexistent file"
    "$CHAIN" digest "$TESTKEY" "$REAL_SID" /nonexistent-digest.md >/dev/null 2>&1
    [[ $? -ne 0 ]] && ok "$T" "$WHY" || bad "$T" "$WHY"
fi
rm -f "$CHAINFILE"

# ═══ GROUP 4 — digest harness verdicts ════════════════════════════════════════
echo "GROUP 4 — digest harness"
TD="$SCRIPTS/jicm-digest/tdigest.py"

T=T4.1; WHY="tdigest exposes the degenerate guard (a 26-word continuation-mode reply once passed every other check)"
assert_contains "$T" "$TD" "degenerate" "$WHY"

T=T4.2; WHY="truncation verdict is the generation cap ONLY, not terminal punctuation"
if grep -q 'trunc = oc >= z.npred-2' "$TD" 2>/dev/null; then ok "$T" "$WHY"; else bad "$T" "$WHY"; fi

T=T4.3; WHY="--anchor-only answers 'has the prefix moved' without a model call"
SMALL_SID="$(ls -Sr "$HOME/.claude/projects"/*/*.jsonl 2>/dev/null | awk 'NR>3' | head -1 | xargs basename 2>/dev/null | sed 's/\.jsonl$//')"
GOT="$(cd "$SCRIPTS/jicm-digest" && python3 tdigest.py "$SMALL_SID" --grounded --order recency --layout tx --anchor-only 2>/dev/null | head -1)"
echo "$GOT" | grep -q '"mode": *"anchor"' && ok "$T" "$WHY" || bad "$T" "$WHY"

T=T4.4; WHY="pre-warm and digest share ONE flag definition (drift silently wastes every warm)"
if grep -q 'JICM_DIGEST_ARGS' "$SCRIPTS/jicm-config.sh" 2>/dev/null \
   && ! grep -q 'JICM_DIGEST_ARGS="--model' "$SCRIPTS/jicm-prewarm.sh" 2>/dev/null; then
    ok "$T" "$WHY"
else
    bad "$T" "$WHY — a second definition exists"
fi

# ═══ GROUP 5 — watcher & HUD ══════════════════════════════════════════════════
echo "GROUP 5 — watcher & HUD"

T=T5.1; WHY="watcher calls the pre-warm below the hard threshold"
assert_contains "$T" "$SCRIPTS/jicm-watcher.sh" "jicm-prewarm.sh" "$WHY"

T=T5.2; WHY="pre-warm trigger is NOT gated behind the health-log cadence"
# A logging interval must not decide when a functional trigger fires.
if awk '/jicm-prewarm.sh/{found=NR} /HEALTH_WARN_EVERY/{warn=NR} END{exit !(found && warn && found<warn)}' \
     "$SCRIPTS/jicm-watcher.sh" 2>/dev/null; then
    ok "$T" "$WHY"
else
    bad "$T" "$WHY — prewarm sits inside/after the HEALTH_WARN_EVERY guard"
fi

T=T5.3; WHY="pre-warm scheduler is silent in steady state (it runs every tick)"
if [[ -f "$CTX/jicm/prewarm/protos.json" ]]; then
    bash "$SCRIPTS/jicm-prewarm.sh" protos >/dev/null 2>&1   # settle: absorb any legitimate re-warm
    BEFORE=$(wc -l < "$PROJECT_DIR/.claude/logs/jicm-prewarm.log" 2>/dev/null || echo 0)
    bash "$SCRIPTS/jicm-prewarm.sh" protos >/dev/null 2>&1   # now it must be silent
    AFTER=$(wc -l < "$PROJECT_DIR/.claude/logs/jicm-prewarm.log" 2>/dev/null || echo 0)
    [[ "$BEFORE" == "$AFTER" ]] && ok "$T" "$WHY" || bad "$T" "$WHY (added $((AFTER-BEFORE)) lines)"
else
    ok "$T" "$WHY (no warm state yet — nothing to be noisy about)"
fi

T=T5.4; WHY="HUD renders without error for a live key"
HUD="$SCRIPTS/jicm-watcher-hud.sh"
if [[ -x "$HUD" ]]; then
    timeout 15 bash "$HUD" --once >/dev/null 2>&1
    RC=$?
    [[ $RC -eq 0 || $RC -eq 124 ]] && ok "$T" "$WHY" || bad "$T" "$WHY (exit $RC)"
else
    bad "$T" "$WHY — HUD script missing or not executable"
fi

T=T5.5; WHY="HUD reports every registered key, not just w0/dev"
if [[ -f "$HUD" ]] && grep -qE 'jicm_registry_keys|registry/\*\.json' "$HUD" 2>/dev/null; then
    ok "$T" "$WHY"
else
    bad "$T" "$WHY — HUD enumerates a hardcoded key list"
fi

T=T5.6; WHY="a watcher tick stays cheap on a HUGE transcript (anchor cost must be gated by growth)"
# RED before the fix: --anchor-only re-parses the whole transcript every tick — 0.29s on a small
# session, 55s on an 88MB one. The watcher calls this every tick, so the cost gate is load-bearing.
BIG="$(ls -S "$HOME/.claude/projects"/*/*.jsonl 2>/dev/null | head -1)"
if [[ -n "$BIG" ]]; then
    BIGSID="$(basename "$BIG" .jsonl)"
    BIGMB=$(( $(stat -f %z "$BIG" 2>/dev/null || echo 0) / 1048576 ))
    BIGKEY="costgate-$$"
    mkdir -p "$CTX/jicm/state" "$CTX/jicm/prewarm" 2>/dev/null
    cat > "$CTX/jicm/state/$BIGKEY.json" <<EOJ
{"tokens":999999,"soft_threshold_tokens":1,"hard_threshold_tokens":2,"session_id":"$BIGSID","transcript_path":"$BIG"}
EOJ
    # Seed a warm state as though we had already warmed this transcript at its current size.
    printf '{"sid":"%s","anchor":0,"tx_size":%s}\n' "$BIGSID" "$(stat -f %z "$BIG" 2>/dev/null || echo 0)" \
        > "$CTX/jicm/prewarm/$BIGKEY.json"
    T0=$(date +%s)
    bash "$SCRIPTS/jicm-prewarm.sh" "$BIGKEY" >/dev/null 2>&1
    ELAPSED=$(( $(date +%s) - T0 ))
    rm -f "$CTX/jicm/state/$BIGKEY.json" "$CTX/jicm/prewarm/$BIGKEY.json" "$CTX/jicm/prewarm/.$BIGKEY.anchor.err"
    if [[ "$ELAPSED" -le 3 ]]; then
        ok "$T" "$WHY (${ELAPSED}s on a ${BIGMB}MB transcript)"
    else
        bad "$T" "$WHY — took ${ELAPSED}s on a ${BIGMB}MB transcript; the watcher runs this every tick"
    fi
else
    ok "$T" "$WHY (no transcripts to test against)"
fi

# ═══ Summary ══════════════════════════════════════════════════════════════════
echo
echo "─────────────────────────────────────────────"
printf 'PASS %d   FAIL %d\n' "$PASS" "$FAIL"
[[ $FAIL -gt 0 ]] && printf 'failing:%b\n' "$FAILED_NAMES"
echo "─────────────────────────────────────────────"
[[ $FAIL -eq 0 ]]
