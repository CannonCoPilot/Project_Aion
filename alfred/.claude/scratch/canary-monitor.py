#!/usr/bin/env python3
"""Canary lifecycle monitor for AION-9b646760. Validates the Phase A fixes
end-to-end. Emits stage transitions, doc write, and — key signal — any
lifecycle_resets increment (would indicate the execute->reset loop recurred).
Exits 0 on close (success), 1 on block (failure)."""
import json, os, subprocess, sys, time, urllib.request

API = "http://localhost:8800/api/v1/tasks/AION-9b646760"
DOC = "/Users/nathanielcannon/Claude/Projects/neural-canvas/docs/reconstruction/CANARY_phaseA.md"
POLL = 30
STALL_SECS = 20 * 60

def emit(m): print(m, flush=True)

def fetch():
    req = urllib.request.Request(API, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    t = d.get("task") or d.get("result") or d
    m = t.get("metadata") or {}
    return t.get("status"), set(t.get("labels") or []), m.get("lifecycle_resets", 0)

def daemon_alive():
    return subprocess.run(["pgrep", "-f", "host-executor-bridge.sh --daemon"],
                          capture_output=True).returncode == 0

KEYS = ("stage:", "staging:", "evaluated:", "queued:", "active:", "completed:", "blocked:", "reason:")
last_stage, last_status, last_resets = set(), None, 0
doc_seen = False; daemon_warned = False; started = time.time()

emit("ARMED: canary AION-9b646760 — validating sentinel-fix/output-dir/reconcile end-to-end")
while True:
    if not daemon_alive():
        if not daemon_warned: emit("FAILURE: Styx daemon DEAD"); daemon_warned = True
    elif daemon_warned: emit("RECOVERED: daemon alive"); daemon_warned = False

    try:
        status, labels, resets = fetch()
    except Exception as e:
        emit(f"WARN: poll failed ({e})"); time.sleep(POLL); continue

    stage = {l for l in labels if l.startswith(KEYS)}
    if stage != last_stage:
        added = sorted(stage - last_stage)
        if added: emit("canary stage: " + ", ".join(added))
        last_stage = stage
    if status != last_status:
        emit(f"canary status: {last_status} -> {status}"); last_status = status
    if resets != last_resets:
        emit(f"WARN: lifecycle_resets {last_resets} -> {resets} (execute->reset loop — sentinel fix may not have taken)")
        last_resets = resets
    if not doc_seen and os.path.exists(DOC):
        doc_seen = True; emit(f"DOC: CANARY_phaseA.md written ({os.path.getsize(DOC)} bytes)")

    if "blocked:yes" in labels:
        rs = sorted(l for l in labels if l.startswith("reason:"))
        emit(f"FAILURE: canary blocked ({', '.join(rs) or 'no reason'})"); sys.exit(1)
    if status == "closed":
        emit(f"DONE: canary CLOSED via pipeline. doc={'PRESENT' if os.path.exists(DOC) else 'MISSING'}, "
             f"lifecycle_resets={resets}. Fixes validated end-to-end." )
        sys.exit(0)
    if time.time() - started > STALL_SECS:
        emit(f"STALL: canary not terminal after {STALL_SECS//60}m (status={status})"); STALL_SECS = 10**9
    time.sleep(POLL)
