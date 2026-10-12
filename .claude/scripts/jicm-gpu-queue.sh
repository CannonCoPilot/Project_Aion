#!/bin/bash
# ============================================================================
# jicm-gpu-queue.sh — one post-cycle GPU job at a time, across ALL lanes (sourced)
# ============================================================================
# WHY THIS EXISTS
#
# Every JICM cycle launched four GPU jobs at the same instant: 5.5 and 5.6c RAG ingests
# (MLX embeddings), 5.9 Graphiti (qwen3-8b via LiteLLM/Ollama + embeddings) and the 3.5
# digest (qwen3-32b). They share one Apple GPU. Under load they starve each other past
# their timeouts. Measured on Fielding's first cycle, 2026-10-09:
#
#     5.6c scrollback RAG ingest   KILLED at 600s, wrote nothing   | alone, idle: 23s
#     5.9  Graphiti part 1/5        TIMEOUT at 840s                 | alone, idle: 41-155s/part
#
# So parallelism bought nothing and lost memory. This file serialises them: one holder at
# a time, with a priority queue so the work the successor is waiting for goes first.
#
#   prio 1  RAG ingests (seconds) and the digest (the successor's history; its finalizer
#           gives up after JICM_DIGEST_FINALIZE_TIMEOUT, so it must not queue behind a
#           15-minute Graphiti run)
#   prio 2  Graphiti (slow, and nobody waits on it)
#   prio 3  retry-queue drains (jicm-retry-drain.sh)
#
# A job WAITS FOR THE GPU OUTSIDE ITS OWN TIMEOUT: acquire first, then run under _bounded.
# Otherwise queueing alone would kill jobs, which is the failure this replaces.
#
# Long batch work (a corpus indexer running for hours) must NOT take this lock ONCE for the whole
# run: it would hold every lane's memory hostage. It takes it PER BATCH at prio 3, with a long
# wait (e.g. 10800s), releasing after each batch, so a cycle's prio-1/2 work slips in between.
#     for batch in ...; do gpu_acquire 3 "<job> batch $k" 10800 && { ...one batch...; gpu_release; }; done
# Proven on Fielding's chunk study 2026-10-12 (71 batches; lanes cycling mid-run were served first).
#
# USAGE (inside a detached `( ... ) &` subshell):
#     source "$SCRIPT_DIR/jicm-gpu-queue.sh"
#     if gpu_acquire 1 "5.5 RAG ingest $JK_KEY" 1800; then ...work...; gpu_release
#     else ...the wait timed out: ALERTed; enqueue a retry or skip...; fi
#
# bash 3.2 (macOS): no $BASHPID. Inside `( ) &`, $$ is the PARENT's pid, so every job would
# look like the same owner. The subshell's own pid comes from `$(exec sh -c 'echo $PPID')`.
# The `exec` is load-bearing: bash 3.2 forks a child for $(...) and does NOT exec its last
# command, so without it $PPID is that throwaway child, dead on return. Each job then stamped
# its ticket with a dead pid, _gpu_reap_tickets deleted it, and NO job acquired the GPU from
# 2026-10-09 19:29 to 2026-10-12 (bash 5 on PATH execs implicitly, so the tests passed).
# ============================================================================

# Locate jicm-alert.sh beside this file. BASH_SOURCE is bash-only: sourced from zsh it is empty,
# dirname "" is ".", and the source used to resolve against the CALLER's cwd and fail, so timeout
# ALERTs silently went nowhere (found by Fielding 2026-10-12). Fall back to the project path.
_GPU_Q_LIBDIR=""
[[ -n "${BASH_SOURCE[0]:-}" ]] && _GPU_Q_LIBDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
[[ -f "$_GPU_Q_LIBDIR/jicm-alert.sh" ]] || _GPU_Q_LIBDIR="${PROJECT_DIR:-$HOME/Claude/Project_Aion}/.claude/scripts"
source "$_GPU_Q_LIBDIR/jicm-alert.sh" 2>/dev/null || _GPU_Q_LIBDIR=""
GPU_Q_DIR="${JICM_GPU_QUEUE_DIR:-${PROJECT_DIR:-$HOME/Claude/Project_Aion}/.claude/context/jicm/signals/gpu-queue}"
GPU_HOLDER="$GPU_Q_DIR/holder"               # a DIRECTORY: mkdir is the atomic acquire
GPU_HOLD_TTL="${JICM_GPU_HOLD_TTL:-7200}"    # backstop: a live holder older than this is reaped
GPU_POLL="${JICM_GPU_POLL:-2}"
_GPU_TICKET=""
_GPU_MYPID=""

_gpu_log() {
    local f="${JICM_LOG_FILE:-${PROJECT_DIR:-$HOME/Claude/Project_Aion}/.claude/logs/jicm-actuate.log}"
    printf '%s [gpu-queue] %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*" >> "$f" 2>/dev/null
    case "$*" in *ALERT*)
        if [[ -n "$_GPU_Q_LIBDIR" ]]; then JICM_ALERT_SOURCE="jicm-gpu-queue" jicm_deliver_alert "$*"
        else printf '%s [gpu-queue] ALERT DELIVERY UNAVAILABLE (jicm-alert.sh not found); the line above reached only this log\n' \
                 "$(date +%Y-%m-%dT%H:%M:%S%z)" >> "$f" 2>/dev/null; fi ;;
    esac
}

_gpu_self_pid() { exec sh -c 'echo $PPID'; }

_gpu_pid_alive() { [[ "$1" =~ ^[0-9]+$ ]] && kill -0 "$1" 2>/dev/null; }

# Reap the holder if its owner is dead, or alive but past the TTL backstop (a hung job must
# not wedge every lane's memory forever). Both are ALERTed, never silent.
_gpu_reap_holder() {
    [[ -d "$GPU_HOLDER" ]] || return 0
    local pid epoch label now
    read -r pid epoch label < "$GPU_HOLDER/owner" 2>/dev/null
    now="$(date +%s)"
    if ! _gpu_pid_alive "$pid"; then
        # An owner file not yet written (holder created a moment ago) is not stale: give it 10s.
        if [[ -z "$pid" ]]; then
            local mt; mt="$(stat -f %m "$GPU_HOLDER" 2>/dev/null || echo "$now")"
            [[ $(( now - mt )) -lt 10 ]] && return 0
        fi
        _gpu_log "reap: holder '${label:-?}' pid ${pid:-?} is dead; releasing the GPU"
        rm -rf "$GPU_HOLDER"
    elif [[ "$epoch" =~ ^[0-9]+$ && $(( now - epoch )) -gt "$GPU_HOLD_TTL" ]]; then
        _gpu_log "ALERT reap: holder '$label' pid $pid has held the GPU $(( now - epoch ))s > TTL ${GPU_HOLD_TTL}s; releasing (the job may still be running)"
        rm -rf "$GPU_HOLDER"
    fi
}

# Tickets: t.<prio>.<epoch>.<seq>.<pid>. Sorted by name = priority, then arrival.
_gpu_reap_tickets() {
    local t pid
    for t in "$GPU_Q_DIR"/t.*; do
        [[ -e "$t" ]] || continue
        pid="${t##*.}"
        _gpu_pid_alive "$pid" || rm -f "$t"
    done
}

_gpu_first_ticket() { ls -1 "$GPU_Q_DIR" 2>/dev/null | grep '^t\.' | sort | head -1; }

# gpu_acquire <prio> <label> [max_wait_s] -> 0 acquired | 1 wait timed out (ALERTed)
gpu_acquire() {
    local prio="$1" label="$2" max="${3:-3600}" waited=0 seq
    mkdir -p "$GPU_Q_DIR" 2>/dev/null
    _GPU_MYPID="$(_gpu_self_pid)"
    # A dead self-pid means our own ticket is reaped on the first poll and we can never win.
    # That starved every lane for 2.5 days once; refuse loudly instead of waiting out $max.
    if ! _gpu_pid_alive "$_GPU_MYPID"; then
        _gpu_log "ALERT: '$label' self-pid '${_GPU_MYPID}' is not a live process; queue identity broken, NOT run"
        _GPU_MYPID=""; return 1
    fi
    seq="$(printf '%05d' $(( RANDOM % 100000 )))"
    _GPU_TICKET="t.${prio}.$(date +%s).${seq}.${_GPU_MYPID}"
    : > "$GPU_Q_DIR/$_GPU_TICKET"
    while :; do
        _gpu_reap_holder
        _gpu_reap_tickets
        if [[ ! -d "$GPU_HOLDER" && "$(_gpu_first_ticket)" == "$_GPU_TICKET" ]]; then
            if mkdir "$GPU_HOLDER" 2>/dev/null; then
                printf '%s %s %s\n' "$_GPU_MYPID" "$(date +%s)" "$label" > "$GPU_HOLDER/owner"
                rm -f "$GPU_Q_DIR/$_GPU_TICKET"; _GPU_TICKET=""
                [[ "$waited" -gt 0 ]] && _gpu_log "acquired by '$label' after ${waited}s queued"
                return 0
            fi
        fi
        if [[ "$waited" -ge "$max" ]]; then
            rm -f "$GPU_Q_DIR/$_GPU_TICKET"; _GPU_TICKET=""
            _gpu_log "ALERT: '$label' waited ${waited}s for the GPU without acquiring it (max ${max}s); NOT run"
            return 1
        fi
        sleep "$GPU_POLL"; waited=$(( waited + GPU_POLL ))
    done
}

# Release only a holder we own (by pid token): never someone else's.
gpu_release() {
    [[ -n "$_GPU_TICKET" ]] && { rm -f "$GPU_Q_DIR/$_GPU_TICKET"; _GPU_TICKET=""; }
    [[ -d "$GPU_HOLDER" ]] || return 0
    local pid _r
    read -r pid _r < "$GPU_HOLDER/owner" 2>/dev/null
    [[ "$pid" == "$_GPU_MYPID" ]] && rm -rf "$GPU_HOLDER"
    return 0
}
