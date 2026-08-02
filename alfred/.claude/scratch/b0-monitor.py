#!/usr/bin/env python3
"""B0 batch monitor (neural-canvas foundations). Watches 3 code tickets through
the pipeline AND the neural-canvas git HEAD (commits = concrete evidence of code
work). Flags lifecycle_resets (execute->reset loop) and blocks. Exits when all
three close (success) or emits FAILURE on any block."""
import json, os, subprocess, sys, time, urllib.request

REPO = "/Users/nathanielcannon/Claude/Projects/neural-canvas"
TICKETS = {
    "AION-9927f772": "B0.1 config",
    "AION-77a6f4c3": "B0.2 key-mismatch",
    "AION-0bd598f5": "B0.3 vertex-guard",
}
POLL = 30
STALL_SECS = 45 * 60

def emit(m): print(m, flush=True)

def fetch(tid):
    req = urllib.request.Request(f"http://localhost:8800/api/v1/tasks/{tid}",
                                 headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    t = d.get("task") or d.get("result") or d
    m = t.get("metadata") or {}
    return t.get("status"), set(t.get("labels") or []), m.get("lifecycle_resets", 0)

def git_head():
    try:
        return subprocess.run(["git", "-C", REPO, "log", "--oneline", "-1"],
                              capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return "?"

def daemon_alive():
    return subprocess.run(["pgrep", "-f", "host-executor-bridge.sh --daemon"],
                          capture_output=True).returncode == 0

KEYS = ("stage:", "staging:", "evaluated:", "queued:", "active:", "completed:", "blocked:", "reason:")
last = {tid: {"stage": set(), "status": None, "resets": 0} for tid in TICKETS}
last_head = git_head()
daemon_warned = False
started = time.time()

emit(f"ARMED: B0 batch ({len(TICKETS)} code tickets). neural-canvas HEAD: {last_head}")
while True:
    if not daemon_alive():
        if not daemon_warned: emit("FAILURE: Styx daemon DEAD"); daemon_warned = True
    elif daemon_warned: emit("RECOVERED: daemon alive"); daemon_warned = False

    # git HEAD advance = a ticket committed code
    head = git_head()
    if head != last_head:
        emit(f"COMMIT: neural-canvas HEAD -> {head}")
        last_head = head

    closed = 0
    for tid, label in TICKETS.items():
        try:
            status, labels, resets = fetch(tid)
        except Exception as e:
            emit(f"WARN {label}: poll failed ({e})"); continue
        stage = {l for l in labels if l.startswith(KEYS)}
        if stage != last[tid]["stage"]:
            added = sorted(stage - last[tid]["stage"])
            if added: emit(f"{label}: " + ", ".join(added))
            last[tid]["stage"] = stage
        if status != last[tid]["status"]:
            emit(f"{label}: status {last[tid]['status']} -> {status}")
            last[tid]["status"] = status
        if resets != last[tid]["resets"]:
            emit(f"WARN {label}: lifecycle_resets {last[tid]['resets']} -> {resets} (execute->reset loop)")
            last[tid]["resets"] = resets
        if "blocked:yes" in labels:
            rs = sorted(l for l in labels if l.startswith("reason:"))
            emit(f"FAILURE {label}: blocked ({', '.join(rs) or 'no reason'})")
        if status == "closed":
            closed += 1

    if closed == len(TICKETS):
        emit(f"DONE: all {len(TICKETS)} B0 tickets closed. neural-canvas HEAD: {git_head()}")
        sys.exit(0)
    if time.time() - started > STALL_SECS:
        emit(f"STALL: B0 not complete after {STALL_SECS//60}m ({closed}/{len(TICKETS)} closed)")
        STALL_SECS = 10**9
    time.sleep(POLL)
