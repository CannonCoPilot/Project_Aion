#!/usr/bin/env python3
"""Hardened-pipeline code canary monitor (AION-5878f4d0). Validates: reliable
completion, git-aware review by qwen3-coder (no false pass/fail), no reset loop.
Watches canary-repo git HEAD + the review verdict. Exits 0 on close, 1 on block."""
import json, os, subprocess, sys, time, urllib.request

TID = "AION-5878f4d0"
REPO = "/Users/nathanielcannon/Claude/Project_Aion/alfred/.claude/scratch/canary-repo"
POLL = 25
STALL = 20 * 60

def emit(m): print(m, flush=True)

def head():
    try:
        return subprocess.run(["git","-C",REPO,"log","--oneline","-1"],
                              capture_output=True,text=True,timeout=10).stdout.strip()
    except Exception: return "?"

def fetch():
    req = urllib.request.Request(f"http://localhost:8800/api/v1/tasks/{TID}",
                                 headers={"Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=10) as r: d = json.load(r)
    t = d.get("task") or d.get("result") or d
    m = t.get("metadata") or {}
    ro = m.get("review_output") or {}
    return (t.get("status"), set(t.get("labels") or []), m.get("lifecycle_resets",0),
            m.get("reviewed_by"), ro.get("passed"), (ro.get("summary") or "")[:200])

KEYS=("stage:","staging:","evaluated:","queued:","active:","completed:","blocked:","reason:")
ls_, st_, rs_, hd_ = set(), None, 0, head()
started=time.time()
emit(f"ARMED: code canary {TID}. canary-repo HEAD: {hd_}")
while True:
    h=head()
    if h!=hd_: emit(f"COMMIT: canary-repo HEAD -> {h}"); hd_=h
    try: status,labels,resets,rby,passed,summ = fetch()
    except Exception as e: emit(f"WARN poll failed: {e}"); time.sleep(POLL); continue
    stage={l for l in labels if l.startswith(KEYS)}
    if stage!=ls_:
        add=sorted(stage-ls_)
        if add: emit("stage: "+", ".join(add))
        ls_=stage
    if status!=st_: emit(f"status: {st_} -> {status}"); st_=status
    if resets!=rs_: emit(f"WARN lifecycle_resets {rs_} -> {resets} (reset loop!)"); rs_=resets
    if "blocked:yes" in labels:
        rs=sorted(l for l in labels if l.startswith("reason:"))
        emit(f"FAILURE: canary blocked ({', '.join(rs) or '?'}) reviewed_by={rby} passed={passed} :: {summ}")
        sys.exit(1)
    if status=="closed":
        emit(f"DONE: canary CLOSED. reviewed_by={rby} passed={passed} resets={resets}")
        emit(f"  review: {summ}")
        emit(f"  canary-repo HEAD: {head()}")
        sys.exit(0)
    if time.time()-started>STALL: emit(f"STALL after {STALL//60}m (status={status})"); STALL=10**9
    time.sleep(POLL)
