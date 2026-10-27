#!/bin/bash
# ============================================================================
# aion-inbox.sh — durable cross-lane messaging for Project Aion
# ============================================================================
# WHY THIS EXISTS
#
# Cross-lane messages used to be typed straight into the target's tmux pane. The
# pane is the worst possible channel for content, and it failed exactly the way
# its shape predicts:
#
#   * It is SINGLE-SLOT. One unsent line occupies it completely. On 2026-08-14 a
#     1723-character message was typed into W13 while a human line already sat
#     there; it never became a turn, and the target's transcript shows no `user`
#     record for it. It went unread for 30+ minutes.
#   * It is DESTRUCTIVE. Delivery begins with clear-input, so the next sender
#     silently discards whatever the last one (or the human) left unsent.
#   * It is SHARED WITH A HUMAN. Sir types there. A machine that writes to that
#     slot is racing the person it is trying to help.
#   * Its success signal was a LIE. "Keystrokes sent" was reported as DELIVERED.
#     jicm-actuate.sh:cmd_nudge now verifies a real user turn appears (rc 4 =
#     unverified), but verification is not a channel: knowing the message was
#     lost is better than believing it landed, and still not the same as it
#     arriving.
#
# THE SPLIT: give each half the job its shape suits.
#   FILE  (here)  — durable content. Append-only, nothing overwrites it, it
#                   survives /clear, restarts and crashes, and it is readable by
#                   the recipient whenever they get to it.
#   NUDGE (pane)  — a short "you have mail" pointer, delivery-verified.
#
# Content NEVER rides the fragile channel. The pointer can be lost harmlessly:
# the inbox is also force-loaded by each persona's @-import at session start, so
# a missed nudge delays a message rather than destroying it.
#
# USAGE
#   aion-inbox.sh send <key> [--from <sender>] [--subject <text>] [--no-nudge]  < body
#   aion-inbox.sh read <key> [--all]     # unread by default
#   aion-inbox.sh ack  <key>             # mark everything read
#   aion-inbox.sh archive <key> [--keep N]   # move old READ messages to inbox/archive/<key>.md
#   aion-inbox.sh list                   # per-key unread counts
#
# Author: Jarvis-dev (W11), 2026-08-14.
# ============================================================================
# NO `set -euo pipefail` — a grep that legitimately finds nothing exits 1 and
# would kill the script (bash-gotchas, and this is bash 3.2 on macOS).
set -o pipefail

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
INBOX_DIR="$PROJECT_DIR/.claude/context/inbox"
ACTUATE="${AION_INBOX_ACTUATE:-$PROJECT_DIR/.claude/scripts/jicm-actuate.sh}"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
INBOX_LOG="$PROJECT_DIR/.claude/logs/aion-inbox.log"
RETRY_INTERVAL="${AION_INBOX_RETRY_INTERVAL:-60}"    # seconds between pointer attempts
RETRY_TTL="${AION_INBOX_RETRY_TTL:-7200}"            # give up after this many seconds
UNREAD_MARK="<!-- UNREAD -->"
READ_MARK="<!-- read -->"

# ONE WRITER AT A TIME per inbox (2026-10-27). 'ack' rewrites the file through a temp copy; a
# 'send' appending during that rewrite was overwritten by the mv and LOST. send and ack now hold
# the same mkdir lock. Stale after 30 s (a crashed holder), so a dead lock cannot wedge the inbox.
_lock() {   # _lock <key>
    local d="$INBOX_DIR/.lock.$1" i=0
    while ! mkdir "$d" 2>/dev/null; do
        if [[ -d "$d" ]] && (( $(date +%s) - $(stat -f %m "$d" 2>/dev/null || date +%s) > 30 )); then
            rmdir "$d" 2>/dev/null; continue
        fi
        i=$((i + 1)); [[ $i -gt 100 ]] && return 1
        sleep 0.1
    done
    return 0
}
_unlock() { rmdir "$INBOX_DIR/.lock.$1" 2>/dev/null; }

# Lane keys must match jicm-config.sh's, or a message lands in a file nobody loads.
#
# 🔴 A HARDCODED ROSTER DRIFTS, AND IT ALREADY DID. urist was added 2026-08-24 with a
# registry entry, a pane and an inbox file — and this function still rejected it, so
# `aion-inbox.sh send urist` exited 64. The lane LOOKED wired up and was unreachable, which
# only surfaces the first time somebody actually needs to message it. The warning above was
# written before the drift and did not prevent it, because a comment cannot enforce a list.
# So ask the JICM registry, which is the source of truth for which lanes exist. The static
# roster survives only as a fallback for when the registry is unavailable.
_lane_keys() {
    local reg="$PROJECT_DIR/.claude/context/jicm/registry"
    if [[ -d "$reg" ]] && compgen -G "$reg/*.json" >/dev/null 2>&1; then
        ls -1 "$reg"/*.json 2>/dev/null | sed 's|.*/||; s|\.json$||'
        return 0
    fi
    printf '%s\n' w0 dev genie jaques fleming protos urist fielding
}

_valid_key() {
    local k
    while IFS= read -r k; do
        [[ "$k" == "$1" ]] && return 0
    done < <(_lane_keys)
    # Registry misses are not fatal: a legitimate lane may not have registered yet.
    case "$1" in
        w0|dev|genie|jaques|fleming|protos|urist|fielding) return 0 ;;
        *) return 1 ;;
    esac
}

_usage() {
    cat <<USAGE
usage:
  aion-inbox.sh send <key> [--from X] [--subject S] [--no-nudge]  < body
  aion-inbox.sh read <key> [--all]
  aion-inbox.sh ack  <key>
  aion-inbox.sh archive <key> [--keep N]
  aion-inbox.sh list
keys: $(_lane_keys | tr '\n' ' ')
USAGE
}

cmd_send() {
    local key="$1"; shift
    local from="${JARVIS_SESSION_ROLE:-unknown}" subject="" nudge=1 body file ts
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --from)     from="${2:?}"; shift 2 ;;
            --subject)  subject="${2:?}"; shift 2 ;;
            --no-nudge) nudge=0; shift ;;
            *) echo "aion-inbox: unknown flag '$1'" >&2; return 64 ;;
        esac
    done
    _valid_key "$key" || { echo "aion-inbox: unknown lane '$key'" >&2; return 64; }

    body="$(cat)"
    [[ -n "${body//[[:space:]]/}" ]] || { echo "aion-inbox: refusing to send an empty message" >&2; return 64; }

    mkdir -p "$INBOX_DIR" 2>/dev/null
    file="$INBOX_DIR/$key.md"
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Append, never rewrite. An inbox that can be truncated by a writer has the
    # same failure mode as the pane it replaces.
    _lock "$key" || { echo "aion-inbox: inbox lock held >10s for $key; refusing to append unlocked" >&2; return 75; }
    {
        printf '\n---\n\n## %s %s\n' "$ts" "$UNREAD_MARK"
        printf '**From:** %s' "$from"
        [[ -n "$subject" ]] && printf ' · **Subject:** %s' "$subject"
        printf '\n\n%s\n' "$body"
    } >> "$file"
    _unlock "$key"

    echo "aion-inbox: queued for $key → $file"

    # The pointer. Its loss is survivable by construction, so a failed nudge is
    # reported and never fatal — the message is already durable on disk.
    if [[ "$nudge" -eq 1 && -x "$ACTUATE" ]]; then
        local rc
        JICM_NUDGE_TEXT="Inbox: you have a new message from ${from}${subject:+ — \"$subject\"}. Read it with: .claude/scripts/aion-inbox.sh read $key  then mark it read with: .claude/scripts/aion-inbox.sh ack $key   (it is also @-imported at session start, so it cannot be lost)." \
            "$ACTUATE" "$key" nudge >/dev/null 2>&1; rc=$?
        case "$rc" in
            0) echo "aion-inbox: pointer delivered (user turn observed)"
               touch "$INBOX_DIR/.pointer-delivered.$key" 2>/dev/null ;;
            3) echo "aion-inbox: lane busy — pointer skipped; message is on disk and @-imported at next start"
               _spawn_pointer_retry "$key" ;;
            4) echo "aion-inbox: pointer UNVERIFIED (no user turn) — message is on disk and @-imported at next start" ;;
            *) echo "aion-inbox: pointer failed rc=$rc — message is on disk and @-imported at next start" ;;
        esac
    fi
}

# ── POINTER RETRY ─────────────────────────────────────────────────────────────
# A busy lane refuses the pointer (rc 3), and nothing used to retry it. An Archon working
# continuously never reaches idle, so on 2026-10-09 Fielding went 10+ minutes without seeing
# a message explaining why his fetch had been stopped, read the stop as a fault, and relaunched
# it. One detached loop per lane now retries until the pointer lands, the recipient has read
# everything, another sender's pointer lands first, or RETRY_TTL expires. The message itself
# was never at risk (it is on disk and @-imported at start); only its timeliness was.
_ilog() { mkdir -p "$(dirname "$INBOX_LOG")" 2>/dev/null; printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$INBOX_LOG"; }

_retry_owner_alive() {   # pid in the lock is alive AND is a retry for this key (argv != identity alone)
    local lock="$1" key="$2" pid
    [[ -f "$lock" ]] || return 1
    pid="$(awk '{print $1}' "$lock" 2>/dev/null)"
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    ps -o command= -p "$pid" 2>/dev/null | grep -qF "aion-inbox.sh _retry $key"
}

_spawn_pointer_retry() {
    local key="$1" lock="$INBOX_DIR/.pointer-retry.$1"
    if _retry_owner_alive "$lock" "$key"; then
        echo "aion-inbox: pointer retry already pending for $key"; return 0
    fi
    nohup bash "$SELF" _retry "$key" </dev/null >/dev/null 2>&1 &
    disown 2>/dev/null
    echo "aion-inbox: pointer retry scheduled (every ${RETRY_INTERVAL}s, up to ${RETRY_TTL}s)"
}

cmd__retry() {
    local key="$1" lock="$INBOX_DIR/.pointer-retry.$1" file="$INBOX_DIR/$1.md"
    local delivered="$INBOX_DIR/.pointer-delivered.$1" start n rc deadline
    start="$(date +%s)"; deadline=$(( start + RETRY_TTL ))
    printf '%s %s\n' "$$" "$start" > "$lock"
    # Remove the lock only if it is still ours. A trap on TERM must EXIT, or the loop survives
    # the signal with its lock gone (reference_trap_term_unkillable).
    # GLOBAL, not local: the EXIT trap runs after this function returns, when locals are gone.
    _RETRY_LOCK="$lock"
    trap '[[ "$(awk "{print \$1}" "$_RETRY_LOCK" 2>/dev/null)" == "$$" ]] && rm -f "$_RETRY_LOCK"' EXIT
    trap 'exit 143' TERM INT
    _ilog "retry START key=$key pid=$$ interval=${RETRY_INTERVAL}s ttl=${RETRY_TTL}s"
    while [[ "$(date +%s)" -lt "$deadline" ]]; do
        sleep "$RETRY_INTERVAL"
        n="$(grep -c "$UNREAD_MARK" "$file" 2>/dev/null)"; [[ "$n" =~ ^[0-9]+$ ]] || n=0
        if [[ "$n" -eq 0 ]]; then _ilog "retry DONE key=$key: nothing unread (recipient read it)"; return 0; fi
        if [[ -f "$delivered" ]] && [[ "$(stat -f %m "$delivered" 2>/dev/null || echo 0)" -gt "$start" ]]; then
            _ilog "retry DONE key=$key: another sender's pointer landed"; return 0
        fi
        JICM_NUDGE_TEXT="Inbox: $n unread message(s). Read with: .claude/scripts/aion-inbox.sh read $key  then mark read with: .claude/scripts/aion-inbox.sh ack $key" \
            "$ACTUATE" "$key" nudge >/dev/null 2>&1; rc=$?
        if [[ "$rc" -eq 0 ]]; then
            touch "$delivered" 2>/dev/null
            _ilog "retry DELIVERED key=$key after $(( $(date +%s) - start ))s ($n unread)"; return 0
        fi
    done
    _ilog "retry WARN key=$key: pointer NOT delivered within ${RETRY_TTL}s (last rc=$rc); $n unread stay on disk, @-imported at next start"
    return 1
}

cmd_read() {
    local key="$1" all=0
    [[ "${2:-}" == "--all" ]] && all=1
    _valid_key "$key" || { echo "aion-inbox: unknown lane '$key'" >&2; return 64; }
    local file="$INBOX_DIR/$key.md"
    [[ -f "$file" ]] || { echo "(inbox empty)"; return 0; }
    if [[ "$all" -eq 1 ]]; then cat "$file"; return 0; fi
    if ! grep -q "$UNREAD_MARK" "$file" 2>/dev/null; then
        echo "(no unread messages — use --all for the full inbox)"; return 0
    fi
    # Print from the first UNREAD header to EOF: messages are appended in order,
    # so everything after the earliest unread marker is also unread.
    # READ-THROUGH MARK (2026-10-27). 'ack' used to mark EVERY unread message, so one that arrived
    # between a 'read' and its 'ack' was marked read unseen (Fielding, 14:33Z). Record how far this
    # read went (the file's line count; the inbox is append-only and ack keeps line counts), and
    # 'ack' marks only headers up to that line.
    local upto; upto="$(wc -l < "$file" | tr -d ' ')"
    awk -v m="$UNREAD_MARK" -v u="$upto" 'NR>u{exit} index($0,m){p=1} p' "$file"
    echo "$upto" > "$INBOX_DIR/.$key.read-through"
}

cmd_ack() {
    local key="$1"
    _valid_key "$key" || { echo "aion-inbox: unknown lane '$key'" >&2; return 64; }
    local file="$INBOX_DIR/$key.md" n
    [[ -f "$file" ]] || { echo "(inbox empty)"; return 0; }
    n="$(grep -c "$UNREAD_MARK" "$file" 2>/dev/null)"
    [[ "$n" =~ ^[0-9]+$ ]] || n=0
    [[ "$n" -eq 0 ]] && { echo "(nothing unread)"; return 0; }
    local wm_file="$INBOX_DIR/.$key.read-through" upto
    if [[ "${2:-}" == "--all" ]]; then
        upto=999999999
    else
        upto="$(cat "$wm_file" 2>/dev/null)"
        [[ "$upto" =~ ^[0-9]+$ ]] || { echo "aion-inbox: nothing marked: run 'read $key' first (ack marks only what a read showed; 'ack $key --all' to mark everything)" >&2; return 1; }
    fi
    _lock "$key" || { echo "aion-inbox: inbox lock held >10s for $key; not marking" >&2; return 75; }
    # In-place via temp + mv, under the lock: a partial rewrite of an inbox loses messages.
    local tmp="$file.tmp.$$" marked left
    awk -v m="$UNREAD_MARK" -v r="$READ_MARK" -v u="$upto" 'NR<=u && index($0,m){sub(m,r)} {print}' "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
    _unlock "$key"
    rm -f "$wm_file"
    left="$(grep -c "$UNREAD_MARK" "$file" 2>/dev/null)"; [[ "$left" =~ ^[0-9]+$ ]] || left=0
    marked=$(( n - left ))
    echo "aion-inbox: marked $marked message(s) read for $key"
    [[ "$left" -gt 0 ]] && echo "aion-inbox: $left message(s) arrived AFTER your last read and stay UNREAD: read them" >&2
    return 0
}

# ARCHIVE (2026-10-27). The inbox is force-loaded at session start, and it only ever grew: Fielding's reached
# 573 KB (~140k tokens) of messages read long ago, too big to load. 'archive' moves the oldest READ messages to
# inbox/archive/<key>.md (append-only, nothing deleted) and keeps every unread message plus the last N read ones.
# Read messages always form a prefix (send appends; ack marks up to a line), so only that prefix moves.
# It refuses while a read awaits its ack: the read-through mark is a line number, and moving lines would shift it.
cmd_archive() {
    local key="$1" keep=10
    [[ "${2:-}" == "--keep" ]] && keep="${3:?--keep needs a number}"
    [[ "$keep" =~ ^[0-9]+$ ]] || { echo "aion-inbox: --keep must be a number" >&2; return 64; }
    _valid_key "$key" || { echo "aion-inbox: unknown lane '$key'" >&2; return 64; }
    local file="$INBOX_DIR/$key.md" arch="$INBOX_DIR/archive/$key.md"
    [[ -f "$file" ]] || { echo "(inbox empty)"; return 0; }
    [[ -f "$INBOX_DIR/.$key.read-through" ]] && { echo "aion-inbox: a read of $key awaits its ack; ack (or read again) first, then archive" >&2; return 1; }
    mkdir -p "$INBOX_DIR/archive" 2>/dev/null
    _lock "$key" || { echo "aion-inbox: inbox lock held >10s for $key; not archiving" >&2; return 75; }
    # Message k starts at its '---' separator line (the line two above its '## <ts> <mark>' header).
    local nread move tmp="$file.tmp.$$" atmp="$arch.tmp.$$"
    nread="$(awk -v r="$READ_MARK" -v m="$UNREAD_MARK" '/^## / && index($0,m){exit} /^## / && index($0,r){n++} END{print n+0}' "$file")"
    move=$(( nread - keep ))
    if [[ "$move" -le 0 ]]; then _unlock "$key"; echo "aion-inbox: $key: $nread read message(s), keeping $keep: nothing to archive"; return 0; fi
    # cut = line number of the separator that opens message (move+1); lines before it (after the preamble) move.
    local first cut
    first="$(awk '/^## / && /<!-- (UNREAD|read) -->/{print NR; exit}' "$file")"
    cut="$(awk -v k=$((move + 1)) '/^## / && /<!-- (UNREAD|read) -->/{c++; if(c==k){print NR; exit}}' "$file")"
    first=$(( first - 2 )); cut=$(( cut - 2 ))          # each header is preceded by '---' and a blank line
    if [[ "$first" -lt 1 || "$cut" -le "$first" ]]; then _unlock "$key"; echo "aion-inbox: $key: unexpected layout; not archiving" >&2; return 1; fi
    { [[ -f "$arch" ]] && cat "$arch"; awk -v a="$first" -v b="$cut" 'NR>=a && NR<b' "$file"; } > "$atmp" \
        && awk -v a="$first" -v b="$cut" 'NR<a || NR>=b' "$file" > "$tmp" \
        && mv "$atmp" "$arch" && mv "$tmp" "$file"
    local rc=$?
    _unlock "$key"
    [[ "$rc" -eq 0 ]] || { rm -f "$tmp" "$atmp"; echo "aion-inbox: archive of $key failed; inbox untouched" >&2; return 1; }
    echo "aion-inbox: archived $move read message(s) of $key to $arch; kept $keep read + all unread"
}

cmd_list() {
    local f key n
    [[ -d "$INBOX_DIR" ]] || { echo "(no inboxes yet)"; return 0; }
    for f in "$INBOX_DIR"/*.md; do
        [[ -f "$f" ]] || continue
        key="$(basename "$f" .md)"
        n="$(grep -c "$UNREAD_MARK" "$f" 2>/dev/null)"
        [[ "$n" =~ ^[0-9]+$ ]] || n=0
        printf '  %-8s %s unread\n' "$key" "$n"
    done
}

case "${1:-}" in
    send) shift; cmd_send "${1:?key required}" "${@:2}" ;;
    read) shift; cmd_read "${1:?key required}" "${2:-}" ;;
    ack)  shift; cmd_ack  "${1:?key required}" "${2:-}" ;;
    archive) shift; cmd_archive "${1:?key required}" "${@:2}" ;;
    list) cmd_list ;;
    _retry) shift; cmd__retry "${1:?key required}" ;;
    -h|--help|"") _usage ;;
    *) echo "aion-inbox: unknown verb '$1'" >&2; _usage; exit 64 ;;
esac
