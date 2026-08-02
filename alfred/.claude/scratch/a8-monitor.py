#!/usr/bin/env python3
"""A8 lifecycle monitor. Emits one stdout line per state change.
Exits 0 when A8 closes (success) or blocks (failure). Covers failure
signatures: daemon death, executor/reviewer block, stall, closed-without-doc."""
import json, os, subprocess, sys, time, urllib.request

API = "http://localhost:8800/api/v1/tasks/AION-962a0274"
DOC = "/Users/nathanielcannon/Claude/Projects/neural-canvas/docs/reconstruction/07_revised_master_plan.md"
STALL_SECS = 30 * 60
POLL = 60

def emit(m): print(m, flush=True)

def fetch():
    req = urllib.request.Request(API, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    t = d.get("task") or d.get("result") or d
    return t.get("status"), set(t.get("labels") or [])

def daemon_alive():
    return subprocess.run(["pgrep", "-f", "host-executor-bridge.sh --daemon"],
                          capture_output=True).returncode == 0

# stage labels we surface transitions on
STAGE_KEYS = ("stage:", "staging:", "evaluated:", "queued:", "active:", "completed:", "blocked:", "reason:")
last_stage = set()
last_status = None
doc_seen = False
daemon_warned = False
started = time.time()

emit("ARMED: monitoring A8 (AION-962a0274) — stage transitions / doc / block / stall / daemon-death")

while True:
    if not daemon_alive():
        if not daemon_warned:
            emit("FAILURE: executor daemon DEAD — A8 will not progress")
            daemon_warned = True
    elif daemon_warned:
        emit("RECOVERED: executor daemon alive again")
        daemon_warned = False

    try:
        status, labels = fetch()
    except Exception as e:
        emit(f"WARN: poll failed ({e}); retrying")
        time.sleep(POLL); continue

    stage = {l for l in labels if l.startswith(STAGE_KEYS)}
    if stage != last_stage:
        added = sorted(stage - last_stage)
        if added:
            emit("A8 stage: " + ", ".join(added))
        last_stage = stage
    if status != last_status:
        emit(f"A8 status: {last_status} -> {status}")
        last_status = status

    if not doc_seen and os.path.exists(DOC):
        doc_seen = True
        emit(f"DOC A8: 07_revised_master_plan.md written ({os.path.getsize(DOC)} bytes)")

    # terminal: failure
    if "blocked:yes" in labels:
        reasons = sorted(l for l in labels if l.startswith("reason:"))
        emit(f"FAILURE: A8 blocked ({', '.join(reasons) or 'no reason label'}) — pipeline gave up")
        sys.exit(1)
    # terminal: success
    if status == "closed":
        ok = os.path.exists(DOC)
        emit(f"DONE: A8 closed; doc {'PRESENT' if ok else 'MISSING'} at canonical path.")
        sys.exit(0 if ok else 2)

    if time.time() - started > STALL_SECS and status not in ("closed",):
        emit(f"STALL: A8 not terminal after {STALL_SECS//60} min (status={status}, stage={sorted(last_stage)})")
        # keep watching but only warn once
        STALL_SECS = 10**9

    time.sleep(POLL)
