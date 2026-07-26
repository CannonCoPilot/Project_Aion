#!/bin/bash
# ============================================================================
# jicm-self.sh — DEPRECATED SHIM (JICM v9 R2/M1). Forwards to jicm-actuate.sh.
# ============================================================================
# The dev-lane deliberative self-management organs (sense / prepare / refresh →
# detached self-clear) were CONSOLIDATED into the single per-session actuator
# jicm-actuate.sh. Governing principle: ONE actuator; preserve-the-reflex,
# add-the-volition. The self-clear path is NOT lost — it is jicm-actuate.sh's
# __run detached worker + _cycle_preserve_restore (a superset of the old
# cmd_actuate: same double idle-gate + self-decapitation guard, PLUS the
# fold-forward memory machinery and a gate sentinel). The two deliberative
# organs (sense, prepare) were ported into jicm-actuate.sh verbatim in behavior.
#
# This shim preserves muscle-memory + any lingering reference:
#     jicm-self.sh sense                    → jicm-actuate.sh dev sense
#     jicm-self.sh prepare                  → jicm-actuate.sh dev prepare
#     jicm-self.sh refresh                  → jicm-actuate.sh dev prepare + (dry-run plan)
#     jicm-self.sh refresh --fire           → jicm-actuate.sh dev --fire
#     jicm-self.sh refresh --fire --canary  → jicm-actuate.sh dev --fire --canary
# Override the target key via JICM_SELF_KEY (default: dev).
#
# Slated for REMOVAL at R6, together with session-start.sh's legacy .dev.* resume
# fallback — the migration bridge closes as one unit at the un-gate.
# ============================================================================
set -o pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACT="$DIR/jicm-actuate.sh"
KEY="${JICM_SELF_KEY:-dev}"

[[ -f "$ACT" ]] || { echo "jicm-self.sh (deprecated): jicm-actuate.sh not found at $ACT" >&2; exit 66; }
>&2 echo "⚠️  jicm-self.sh is DEPRECATED (JICM v9) — forwarding to: jicm-actuate.sh $KEY ${*:-sense}"

case "${1:-sense}" in
    sense)     exec bash "$ACT" "$KEY" sense ;;
    prepare)   exec bash "$ACT" "$KEY" prepare ;;
    refresh)
        shift
        # Preserve old cmd_refresh semantics: --fire path arms the actuator; the
        # no-flag dry-run shows the deliberative view (prepare THEN plan).
        if printf '%s\n' "$@" | grep -q -- '--fire'; then
            exec bash "$ACT" "$KEY" "$@"
        else
            bash "$ACT" "$KEY" prepare
            exec bash "$ACT" "$KEY"
        fi ;;
    __actuate)
        echo "jicm-self.sh __actuate is RETIRED — the detached worker is now: jicm-actuate.sh __run <key>" >&2
        exit 64 ;;
    -h|--help|*)
        echo "usage (DEPRECATED → jicm-actuate.sh $KEY …): jicm-self.sh {sense|prepare|refresh [--fire [--canary]]}"
        exit 0 ;;
esac
