#!/usr/bin/env python3
"""Embedder v2 cutover, phase SWAP: put each collection's v2 vectors (from its `<name>__v2` shadow,
filled by embed-cutover-v2.py) back under the ORIGINAL collection name.

WHY COPY-BACK, NOT A QDRANT ALIAS: consumers find collections by listing them
(`get_collections()`), and an alias is not listed. jicm-auto-ingest.py and bulk-ingest.py would
then create a NEW, EMPTY real collection under the aliased name. So the original name must be a
real collection again.

WHAT THE SWAPPED COLLECTION HOLDS:
  * every point the source holds now (vector + payload from the shadow; the shadow copied the
    payload at build time);
  * plus ORPHANS: shadow points whose `source` file has NO points left in the source. Before
    eb8b29d a re-ingest deleted a file's vectors BEFORE embedding the new ones, so the :8000
    outage of 2026-10-13 left fleming-sessions at 0 and fielding-sessions short by 95. The shadow
    holds the only surviving copy; dropping it would finish the loss.
  * NOT superseded points: shadow points whose source file still has points in the source (the
    normal re-ingest replaced them).

  embed-swap-v2.py plan              per collection: source / shadow / missing / superseded / orphans
  embed-swap-v2.py swap NAME         snapshot, recreate, copy, verify (refuses if any source id is
                                     missing from the shadow: run the build to catch up first)
  embed-swap-v2.py drop-shadow NAME  delete NAME__v2 once NAME verifies
"""
from __future__ import annotations

import json
import random
import sys
import time

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams

QDRANT = "http://localhost:6333"
EMBED = "http://127.0.0.1:8010"          # v2 server; used only for the self-retrieval check
SUFFIX = "__v2"
EXCLUDE = {"neural_canvas_artworks"}
PAGE = 256

q = QdrantClient(QDRANT, timeout=120)


def pairs() -> list[str]:
    names = {c.name for c in q.get_collections().collections}
    return sorted(n for n in names if not n.endswith(SUFFIX) and n + SUFFIX in names and n not in EXCLUDE)


def ids_and_sources(name: str) -> tuple[set, dict]:
    """All point ids, and id -> payload['source'] (None when absent)."""
    ids, src, off = set(), {}, None
    while True:
        pts, off = q.scroll(name, limit=1000, offset=off, with_payload=["source"], with_vectors=False)
        for p in pts:
            ids.add(p.id)
            src[p.id] = (p.payload or {}).get("source")
        if off is None:
            return ids, src


def classify(name: str) -> dict:
    s_ids, s_src = ids_and_sources(name)
    h_ids, h_src = ids_and_sources(name + SUFFIX)
    live_sources = {v for v in s_src.values() if v is not None}
    extra = h_ids - s_ids
    orphans = {i for i in extra if h_src[i] is not None and h_src[i] not in live_sources}
    return {
        "source": len(s_ids), "shadow": len(h_ids),
        "missing": sorted(s_ids - h_ids, key=str)[:5], "n_missing": len(s_ids - h_ids),
        "superseded": len(extra - orphans), "orphans": len(orphans),
        "orphan_sources": sorted({h_src[i] for i in orphans}),
        "_keep": s_ids | orphans,
    }


def cmd_plan() -> None:
    for n in pairs():
        c = classify(n)
        c.pop("_keep")
        print(json.dumps({"collection": n, **c}))


def self_retrieval(name: str, ids: set, k: int = 25) -> str:
    """Each sampled point's own text, embedded fresh by v2, must find that point first."""
    if not ids:
        return "0/0"
    sample = random.Random(20261014).sample(sorted(ids, key=str), min(k, len(ids)))
    order = {p.id: (p.payload or {}).get("text", "") for p in q.retrieve(name, ids=sample, with_payload=True)}
    r = httpx.post(f"{EMBED}/embed_batch", json={"texts": [order[i] for i in sample], "model": "v2"}, timeout=600)
    r.raise_for_status()
    d = r.json()
    if d.get("model") != "Qwen3-Embedding-4B-q8-v2":
        sys.exit(f"REFUSING: self-retrieval embedder answered model={d.get('model')}, not v2")
    # A DUPLICATE TEXT is a tie, not a miss: df-logger repeats licence headers and offset tables
    # across files, and identical text gets an identical vector (score 1.0000), so top-1 may be the
    # twin. It counts only when the twin's text is EXACTLY the same; the tie count is reported.
    hit = ties = 0
    for pid, vec in zip(sample, d["embeddings"]):
        top = q.query_points(name, query=vec, limit=1, with_payload=["text"]).points
        if top and top[0].id == pid:
            hit += 1
        elif top and (top[0].payload or {}).get("text") == order[pid] and top[0].score >= 0.9999:
            hit += 1
            ties += 1
    return f"{hit}/{len(sample)}" + (f" ({ties} exact-text ties)" if ties else "")


def cmd_swap(name: str) -> None:
    t0 = time.time()
    if name not in pairs():
        sys.exit(f"REFUSE: {name} has no {name}{SUFFIX} shadow")
    c = classify(name)
    if c["n_missing"]:
        sys.exit(f"REFUSE: {c['n_missing']} source ids missing from the shadow (e.g. {c['missing']}); "
                 "run embed-cutover-v2.py batch to catch up first")
    keep = c["_keep"]
    info = q.get_collection(name)
    params = info.config.params
    vec = params.vectors
    schema = info.payload_schema or {}

    snap = q.create_snapshot(name).name           # restore point for this collection
    q.delete_collection(name)
    q.create_collection(
        name,
        vectors_config=VectorParams(size=vec.size, distance=vec.distance),
        hnsw_config=info.config.hnsw_config.model_dump(),
        on_disk_payload=params.on_disk_payload,
    )
    for field, s in schema.items():
        q.create_payload_index(name, field_name=field, field_schema=s.data_type)

    copied, off = 0, None
    while True:
        pts, off = q.scroll(name + SUFFIX, limit=PAGE, offset=off, with_payload=True, with_vectors=True)
        batch = [PointStruct(id=p.id, vector=p.vector, payload=p.payload) for p in pts if p.id in keep]
        if batch:
            q.upsert(name, points=batch, wait=True)
            copied += len(batch)
        if off is None:
            break

    got, _ = ids_and_sources(name)
    ok_ids = got == keep
    sr = self_retrieval(name, got)
    hit, tot = (int(x) for x in sr.split(" ")[0].split("/"))
    ok = ok_ids and copied == len(keep) and (tot == 0 or hit == tot)
    print(json.dumps({
        "collection": name, "snapshot": snap, "copied": copied, "expected": len(keep),
        "ids_equal": ok_ids, "orphans_restored": c["orphans"], "superseded_dropped": c["superseded"],
        "payload_indexes": sorted(schema), "self_retrieval_at1": sr, "ok": ok,
        "seconds": round(time.time() - t0, 1),
    }))
    if not ok:
        sys.exit(f"VERIFY FAILED for {name}: restore from snapshot {snap}")


def cmd_drop_shadow(name: str) -> None:
    q.delete_collection(name + SUFFIX)
    print(json.dumps({"dropped": name + SUFFIX}))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "plan"
    if cmd == "plan":
        cmd_plan()
    elif cmd == "swap":
        cmd_swap(sys.argv[2])
    elif cmd == "verify":                       # re-check an already swapped collection
        got, _ = ids_and_sources(sys.argv[2])
        print(json.dumps({"collection": sys.argv[2], "points": len(got),
                          "self_retrieval_at1": self_retrieval(sys.argv[2], got)}))
    elif cmd == "drop-shadow":
        cmd_drop_shadow(sys.argv[2])
    else:
        sys.exit(__doc__)
