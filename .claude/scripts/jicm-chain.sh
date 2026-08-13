#!/bin/bash
# jicm-chain.sh — JICM v9 continuity ledger (stages ① capture / ② bind).
#
# WHY THIS EXISTS
#   `/clear` mints a NEW session with ZERO inherited history (proven: W0's live conversation
#   f506b26a literally begins with the /clear command record; 0 shared message UUIDs with its
#   predecessor). `resumeSessionId` records a real lineage edge for --resume and --fork-session,
#   but for `/clear` the edge is recorded NOWHERE. So we write it ourselves.
#
#   Consequence if we don't: every identity path we own (jicm_pane_session, .current-<key>-uuid,
#   launcher --resume <uuid>) resolves the PANE PROCESS's session, which after a clear is the
#   DORMANT PRE-CLEAR SHELL. That is how JICM read W0 at 261,878 tokens while it was really at
#   520,037 — blind for two days. Occupancy is not identity; a window holds a SUCCESSION.
#
# MODEL
#   One append-only JSONL per key: .claude/context/jicm/chain/<key>.jsonl
#   Two record types, written at the two moments where the edge is knowable:
#     capture — emitted by the actuator immediately BEFORE /clear. Last chance to record what
#               the outgoing session was and where its transcript lives.
#     bind    — emitted by the successor's first gate write. Names its predecessor, closing
#               the edge from the other side.
#   A capture with no matching bind is an UNCLOSED edge: the cycle died mid-flight.
#
# NO SILENT DEGRADATION
#   capture REFUSES to write a row it cannot substantiate (missing sid, missing transcript) and
#   exits non-zero so the actuator can abort rather than /clear into an unrecorded void. It never
#   writes a placeholder row that would later read as a real edge.
#
# Bash 3.2 (macOS): no associative arrays, no readarray. Never `set -euo pipefail` here —
# this file is sourced/called from hook context where a bare non-zero grep must not kill the run.

CHAIN_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$CHAIN_SELF_DIR/jicm-config.sh" 2>/dev/null || { echo "jicm-chain: cannot source jicm-config.sh" >&2; exit 1; }

_now()    { date -u +%Y-%m-%dT%H:%M:%SZ; }
_epoch()  { date -u +%s; }
_die()    { echo "jicm-chain: $*" >&2; exit 1; }

# The project dir Claude Code derives from THIS repo's real path. It encodes the session cwd
# by replacing BOTH "/" and "_" with "-", so /Users/x/Claude/Project_Aion becomes
# -Users-x-Claude-Project-Aion. Getting only the "/" substitution gives ...-Project_Aion,
# which ALSO exists on disk — that underscore variant is the third leg of the triplication
# and is NOT the dir the live session is written to. Verified against the live transcript.
# `pwd -P` resolves symlinks, which is the point: the legacy ~/Claude/Jarvis symlink targets
# Project_Aion, so a session launched through it lands in yet another project dir.
_canonical_project_dir() {
    local real enc; real="$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P)" || real="$PROJECT_DIR"
    enc="${real//\//-}"; enc="${enc//_/-}"
    echo "$HOME/.claude/projects/$enc"
}

# Resolve the transcript for a session id. Largest match wins: the same session is written to
# multiple project dirs (the ~/Claude/Jarvis symlink plus underscore/hyphen path encodings
# triplicate 137 of 173 sessions), and the largest copy is the complete one.
#
# TIE-BREAK (2026-08-12): when copies are the same size — the common case, since the symlinked
# dirs are HARDLINKS to one inode, not divergent files — `ls -S | head -1` broke the tie on name,
# so `-Claude-Jarvis` won and the ledger recorded a path derived from a legacy symlink while the
# registry and state recorded the real one. The rows resolved, but the chain is APPEND-ONLY, so a
# non-canonical path is permanent, and any consumer joining chain rows to registry rows on path
# saw a mismatch. Prefer the canonical dir when it is not a SMALLER copy — that settles the tie
# without weakening "largest wins", which still protects against a genuinely truncated duplicate.
_transcript_for() {
    local sid="$1" best canon
    best="$(ls -S "$HOME/.claude/projects"/*/"$sid"*.jsonl 2>/dev/null | head -1)"
    [[ -n "$best" ]] || return 0
    canon="$(_canonical_project_dir)/$sid.jsonl"
    if [[ -f "$canon" && "$canon" != "$best" ]]; then
        local cz bz
        cz="$(stat -f %z "$canon" 2>/dev/null || echo 0)"
        bz="$(stat -f %z "$best"  2>/dev/null || echo 0)"
        [[ "$cz" -ge "$bz" ]] && { echo "$canon"; return 0; }
    fi
    echo "$best"
}

# ---------------------------------------------------------------------------
# ① capture <key> <outgoing_sid> [tokens]
#    Called by the actuator in the last moment before /clear.
# ---------------------------------------------------------------------------
cmd_capture() {
    local key="${1:?capture: key required}" sid="${2:?capture: outgoing_sid required}" tokens="${3:-}"
    jicm_key_paths "$key"

    local tp; tp="$(_transcript_for "$sid")"
    [[ -n "$tp" ]] || _die "capture ABORT: no transcript found for ${sid:0:8} — refusing to record an edge I cannot substantiate"

    # Prefer the live token reading from the key's own state file over a caller-supplied number.
    if [[ -z "$tokens" && -f "$JK_STATE" ]]; then
        tokens="$(jq -r '.tokens // empty' "$JK_STATE" 2>/dev/null)"
    fi
    # 0 means NOT YET KNOWN, not "an empty session". The gate writes state on UserPromptSubmit,
    # one turn BEFORE the assistant's usage lands in the transcript, so a session captured just
    # after a resume reads 0. Recording that as a number states a measurement nobody took, and a
    # later reader cannot tell it apart from a genuinely empty session. Record null and let
    # `show` print "?" — an admitted gap beats a confident wrong number.
    [[ -n "$tokens" && "$tokens" != "0" ]] || tokens="null"

    local plan="" ckpt=""
    [[ -f "$JK_ACTIVE_PLAN" ]] && plan="$(head -1 "$JK_ACTIVE_PLAN" 2>/dev/null)"
    [[ -f "$JK_COMPRESSED"  ]] && ckpt="$JK_COMPRESSED"

    mkdir -p "$JICM_CHAIN_DIR" 2>/dev/null
    jq -nc \
        --arg rec "capture" --arg key "$key" --arg sid "$sid" --arg tp "$tp" \
        --arg ts "$(_now)" --argjson te "$(_epoch)" --argjson tok "$tokens" \
        --arg plan "$plan" --arg ckpt "$ckpt" \
        '{rec:$rec,key:$key,outgoing_sid:$sid,transcript_path:$tp,ts:$ts,ts_epoch:$te,
          tokens:$tok,active_plan:$plan,checkpoint:$ckpt,digest:null,bound:false}' \
        >> "$JK_CHAIN" || _die "capture ABORT: could not append to $JK_CHAIN"
    echo "jicm-chain: captured ${key} <- ${sid:0:8} (${tokens} tok)" >&2
}

# ---------------------------------------------------------------------------
# ② bind <key> <new_sid>
#    Called by the successor's first gate write. Closes the most recent UNBOUND capture.
# ---------------------------------------------------------------------------
cmd_bind() {
    local key="${1:?bind: key required}" new="${2:?bind: new_sid required}"
    jicm_key_paths "$key"
    [[ -s "$JK_CHAIN" ]] || { echo "jicm-chain: no chain for $key — nothing to bind (first session on this key)" >&2; return 0; }

    # IDEMPOTENT: the gate that calls this runs on EVERY prompt, so a session must bind exactly
    # once. Enforced here rather than only at the call site — an append-only ledger that can
    # accumulate duplicate edges for one session is not a lineage, it is noise.
    local already
    already="$(jq -s --arg s "$new" '[.[] | select(.rec=="bind" and .session_id==$s)] | length' "$JK_CHAIN" 2>/dev/null)"
    [[ "${already:-0}" -gt 0 ]] && return 0

    # The predecessor is the newest capture that no successor has claimed. Binding to the newest
    # capture UNCONDITIONALLY would let a re-run steal an already-closed edge and rewrite history.
    local pred; pred="$(jq -r -s 'map(select(.rec=="capture" and .bound==false)) | last | .outgoing_sid // empty' "$JK_CHAIN" 2>/dev/null)"
    if [[ -z "$pred" ]]; then
        echo "jicm-chain: no unbound capture for $key — ${new:0:8} starts a new chain segment" >&2
        pred=""
    fi
    [[ "$pred" == "$new" ]] && _die "bind ABORT: ${new:0:8} would be its own predecessor (stale pane read?)"

    local tp; tp="$(_transcript_for "$new")"
    mkdir -p "$JICM_CHAIN_DIR" 2>/dev/null
    jq -nc --arg rec "bind" --arg key "$key" --arg sid "$new" --arg pred "$pred" \
           --arg tp "$tp" --arg ts "$(_now)" --argjson te "$(_epoch)" \
        '{rec:$rec,key:$key,session_id:$sid,predecessor:(if $pred=="" then null else $pred end),
          transcript_path:$tp,ts:$ts,ts_epoch:$te}' >> "$JK_CHAIN" \
        || _die "bind ABORT: could not append to $JK_CHAIN"

    # Mark the capture closed. Rewrite whole-file via a temp + mv so a crash mid-write cannot
    # leave a half-truncated ledger (an append-only file is worthless if it can be corrupted).
    if [[ -n "$pred" ]]; then
        local tmp="$JK_CHAIN.bind.$$"
        if jq -c --arg p "$pred" 'if .rec=="capture" and .outgoing_sid==$p then .bound=true else . end' \
             "$JK_CHAIN" > "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
            mv "$tmp" "$JK_CHAIN"
        else
            rm -f "$tmp" 2>/dev/null
            echo "jicm-chain: WARN could not mark capture bound; edge is recorded but may re-bind" >&2
        fi
    fi
    echo "jicm-chain: bound ${key} ${new:0:8} <- predecessor ${pred:0:8}" >&2
}

# ---------------------------------------------------------------------------
# digest <key> <sid> <path>   — stage ③ hook: attach a produced digest to its capture row.
# ---------------------------------------------------------------------------
cmd_digest() {
    local key="${1:?digest: key required}" sid="${2:?digest: sid required}" path="${3:?digest: path required}"
    jicm_key_paths "$key"
    [[ -s "$JK_CHAIN" ]] || _die "digest ABORT: no chain for $key"
    [[ -f "$path" ]]     || _die "digest ABORT: $path does not exist"
    local tmp="$JK_CHAIN.dg.$$"
    jq -c --arg s "$sid" --arg p "$path" \
        'if .rec=="capture" and .outgoing_sid==$s then .digest=$p else . end' "$JK_CHAIN" > "$tmp" 2>/dev/null \
        && [[ -s "$tmp" ]] && mv "$tmp" "$JK_CHAIN" || { rm -f "$tmp"; _die "digest ABORT: rewrite failed"; }
    echo "jicm-chain: digest attached to ${sid:0:8}" >&2
}

# ---------------------------------------------------------------------------
# show <key> — human-readable succession, oldest first.
# ---------------------------------------------------------------------------
cmd_show() {
    local key="${1:?show: key required}"
    jicm_key_paths "$key"
    [[ -s "$JK_CHAIN" ]] || { echo "no chain for $key"; return 0; }
    echo "SUCCESSION — key=$key  ($JK_CHAIN)"
    jq -r 'if .rec=="capture" then
             "  [\(.ts)] CAPTURE  \(.outgoing_sid[0:8])  \(.tokens // "?") tok  \(if .bound then "bound" else "UNBOUND (cycle died mid-flight)" end)\(if .digest then "  digest=\(.digest|split("/")|last)" else "" end)"
           else
             "  [\(.ts)] BIND     \(.session_id[0:8])  <- \(if .predecessor then .predecessor[0:8] else "(chain start)" end)"
           end' "$JK_CHAIN"
}

case "${1:-}" in
    capture) shift; cmd_capture "$@" ;;
    bind)    shift; cmd_bind    "$@" ;;
    digest)  shift; cmd_digest  "$@" ;;
    show)    shift; cmd_show    "$@" ;;
    *) cat >&2 <<EOF
usage: jicm-chain.sh <command>
  capture <key> <outgoing_sid> [tokens]   ① record the edge just before /clear
  bind    <key> <new_sid>                 ② successor names its predecessor
  digest  <key> <sid> <path>              ③ attach a produced history digest
  show    <key>                           print the succession
EOF
       exit 2 ;;
esac
