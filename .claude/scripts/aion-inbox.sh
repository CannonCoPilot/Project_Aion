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
#   aion-inbox.sh list                   # per-key unread counts
#
# Author: Jarvis-dev (W11), 2026-08-14.
# ============================================================================
# NO `set -euo pipefail` — a grep that legitimately finds nothing exits 1 and
# would kill the script (bash-gotchas, and this is bash 3.2 on macOS).
set -o pipefail

PROJECT_DIR="${JICM_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
INBOX_DIR="$PROJECT_DIR/.claude/context/inbox"
ACTUATE="$PROJECT_DIR/.claude/scripts/jicm-actuate.sh"
UNREAD_MARK="<!-- UNREAD -->"
READ_MARK="<!-- read -->"

# Lane keys must match jicm-config.sh's, or a message lands in a file nobody loads.
_valid_key() {
    case "$1" in
        w0|dev|genie|jaques|protos) return 0 ;;
        *) return 1 ;;
    esac
}

_usage() {
    cat <<'USAGE'
usage:
  aion-inbox.sh send <key> [--from X] [--subject S] [--no-nudge]  < body
  aion-inbox.sh read <key> [--all]
  aion-inbox.sh ack  <key>
  aion-inbox.sh list
keys: w0 dev genie jaques protos
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
    {
        printf '\n---\n\n## %s %s\n' "$ts" "$UNREAD_MARK"
        printf '**From:** %s' "$from"
        [[ -n "$subject" ]] && printf ' · **Subject:** %s' "$subject"
        printf '\n\n%s\n' "$body"
    } >> "$file"

    echo "aion-inbox: queued for $key → $file"

    # The pointer. Its loss is survivable by construction, so a failed nudge is
    # reported and never fatal — the message is already durable on disk.
    if [[ "$nudge" -eq 1 && -x "$ACTUATE" ]]; then
        local rc
        JICM_NUDGE_TEXT="Inbox: you have a new message from ${from}${subject:+ — \"$subject\"}. Read it with: .claude/scripts/aion-inbox.sh read $key   (it is also @-imported at session start, so it cannot be lost)." \
            "$ACTUATE" "$key" nudge >/dev/null 2>&1; rc=$?
        case "$rc" in
            0) echo "aion-inbox: pointer delivered (user turn observed)" ;;
            3) echo "aion-inbox: lane busy — pointer skipped; message is on disk and @-imported at next start" ;;
            4) echo "aion-inbox: pointer UNVERIFIED (no user turn) — message is on disk and @-imported at next start" ;;
            *) echo "aion-inbox: pointer failed rc=$rc — message is on disk and @-imported at next start" ;;
        esac
    fi
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
    awk -v m="$UNREAD_MARK" 'index($0,m){p=1} p' "$file"
}

cmd_ack() {
    local key="$1"
    _valid_key "$key" || { echo "aion-inbox: unknown lane '$key'" >&2; return 64; }
    local file="$INBOX_DIR/$key.md" n
    [[ -f "$file" ]] || { echo "(inbox empty)"; return 0; }
    n="$(grep -c "$UNREAD_MARK" "$file" 2>/dev/null)"
    [[ "$n" =~ ^[0-9]+$ ]] || n=0
    [[ "$n" -eq 0 ]] && { echo "(nothing unread)"; return 0; }
    # In-place via temp + mv: a partial rewrite of an inbox loses messages.
    local tmp="$file.tmp.$$"
    sed "s|$UNREAD_MARK|$READ_MARK|g" "$file" > "$tmp" 2>/dev/null && mv "$tmp" "$file"
    echo "aion-inbox: marked $n message(s) read for $key"
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
    ack)  shift; cmd_ack  "${1:?key required}" ;;
    list) cmd_list ;;
    -h|--help|"") _usage ;;
    *) echo "aion-inbox: unknown verb '$1'" >&2; _usage; exit 64 ;;
esac
