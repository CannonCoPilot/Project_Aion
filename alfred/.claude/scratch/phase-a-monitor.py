#!/usr/bin/env python3
"""Phase A lifecycle monitor. Emits one stdout line per state change.
Exits 0 when all 7 A-tickets are closed. Covers failure signatures:
daemon death, per-ticket stall, closed-without-doc."""
import json, os, subprocess, sys, time, urllib.request

API = "http://localhost:8800/api/v1/tasks?limit=200"
DOCDIR = "/Users/nathanielcannon/Claude/Projects/neural-canvas/docs/reconstruction"
TICKETS = {
    "AION-68254a10": ("A1", "00_corpus_inventory.md"),
    "AION-2c16c139": ("A2", "01_product_requirements.md"),
    "AION-0fe3fdbe": ("A3", "02_architecture.md"),
    "AION-8fc84fbe": ("A4", "03_status_and_roadmap.md"),
    "AION-7f2655df": ("A5", "04_adversarial_review.md"),
    "AION-4de4411b": ("A6", "05_comparative_research.md"),
    "AION-bc15722b": ("A7", "06_credential_audit.md"),
}
STALL_SECS = 25 * 60          # warn if a ticket runs longer than this
POLL = 75

def emit(msg):
    print(msg, flush=True)

def fetch_status():
    req = urllib.request.Request(API, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    tasks = d if isinstance(d, list) else (d.get("tasks") or d.get("items") or d.get("result") or [])
    out = {}
    for t in tasks:
        tid = t.get("id")
        if tid in TICKETS:
            out[tid] = (t.get("status") or "?")
    return out

def daemon_alive():
    return subprocess.run(["pgrep", "-f", "host-executor-bridge.sh --daemon"],
                          capture_output=True).returncode == 0

last_status = {tid: "open" for tid in TICKETS}
docs_seen = set()
inprog_since = {}
stall_warned = set()
daemon_warned = False

emit("ARMED: monitoring A1-A7 (7 tickets) for in_progress/closed/doc/stall/daemon-death")

while True:
    # daemon liveness — primary failure signature
    if not daemon_alive():
        if not daemon_warned:
            emit("FAILURE: executor daemon (host-executor-bridge.sh --daemon) is DEAD — tickets will not progress")
            daemon_warned = True
    else:
        if daemon_warned:
            emit("RECOVERED: executor daemon is alive again")
            daemon_warned = False

    try:
        cur = fetch_status()
    except Exception as e:
        emit(f"WARN: pulse API poll failed ({e}); retrying")
        time.sleep(POLL)
        continue

    now = time.time()
    for tid, (label, docname) in TICKETS.items():
        st = cur.get(tid, "missing")
        prev = last_status.get(tid)
        if st != prev:
            emit(f"{label} {tid}: {prev} -> {st}")
            last_status[tid] = st
            if st in ("in_progress", "active"):
                inprog_since[tid] = now
            if st == "closed":
                inprog_since.pop(tid, None)
                docpath = os.path.join(DOCDIR, docname)
                if not os.path.exists(docpath):
                    emit(f"  WARN {label}: closed but output doc {docname} NOT found")
        # stall detection
        if tid in inprog_since and tid not in stall_warned:
            if now - inprog_since[tid] > STALL_SECS:
                emit(f"STALL {label} {tid}: in_progress > {STALL_SECS//60} min — possible hung fork")
                stall_warned.add(tid)

    # doc appearance (independent of close, in case close lags)
    for tid, (label, docname) in TICKETS.items():
        p = os.path.join(DOCDIR, docname)
        if os.path.exists(p) and docname not in docs_seen:
            docs_seen.add(docname)
            try:
                sz = os.path.getsize(p)
            except OSError:
                sz = 0
            emit(f"DOC {label}: {docname} written ({sz} bytes)")

    closed = [t for t in TICKETS if last_status.get(t) == "closed"]
    if len(closed) == len(TICKETS):
        emit(f"DONE: all {len(TICKETS)} A-tickets closed; {len(docs_seen)} docs present. Proceed to A8 gate.")
        sys.exit(0)

    time.sleep(POLL)
