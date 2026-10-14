#!/usr/bin/env python3
"""Embedder v2 cutover, phase BUILD: re-embed every legacy-recipe Qdrant collection into a shadow
collection `<name>__v2`, from each point's payload `text`, keeping the same point id and payload.

WHY: the legacy :8000 recipe (no causal mask, mean pooling) produced near-random vectors for
Qwen3-Embedding (cos .23 to the reference). v2 (server.py entry Qwen3-Embedding-4B-q8-v2) is the
reference recipe. Old and new vectors are not comparable, so a collection is switched only when
ALL its points carry v2 vectors: a mixed collection is silently wrong.

NON-DESTRUCTIVE: the source collection is never written. The swap (snapshot, drop, alias) is a
separate, later step. Re-running resumes: only ids missing from the shadow are embedded.

ONE BATCH PER CALL, so the bash driver can take the GPU queue per batch at prio 3 (see
.claude/scripts/jicm-gpu-queue.sh, "Long batch work"):

  embed-cutover-v2.py plan                   collections, counts, points without text
  embed-cutover-v2.py batch NAME [N]         embed the next N (default 256) missing points; prints
                                             "remaining=<k>" (0 = shadow complete)
  embed-cutover-v2.py verify NAME            counts, ids, payload equality on a sample, and
                                             self-retrieval of a sample (the v2 sanity check)
"""
from __future__ import annotations

import json
import random
import sys
import time

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

QDRANT = "http://localhost:6333"
EMBED = "http://127.0.0.1:8010"          # the v2 server; :8000 is still legacy until the swap
MODEL = "v2"
DIM = 2560
SUFFIX = "__v2"
EMBED_BATCH = 32                         # texts per /embed_batch request
# Not built by the legacy MLX recipe: a 512-dim image collection with no text payload.
EXCLUDE = {"neural_canvas_artworks"}

q = QdrantClient(url=QDRANT, timeout=60)


def sources() -> list[str]:
    out = []
    for c in q.get_collections().collections:
        n = c.name
        if n.endswith(SUFFIX) or n in EXCLUDE:
            continue
        vc = q.get_collection(n).config.params.vectors
        if getattr(vc, "size", None) == DIM:
            out.append(n)
    return sorted(out)


def all_ids(name: str) -> list:
    ids, off = [], None
    while True:
        pts, off = q.scroll(name, limit=2048, offset=off, with_payload=False, with_vectors=False)
        ids += [p.id for p in pts]
        if off is None:
            return ids


def ensure_shadow(name: str) -> str:
    sh = name + SUFFIX
    if not q.collection_exists(sh):
        q.create_collection(sh, vectors_config=VectorParams(size=DIM, distance=Distance.COSINE))
    return sh


def embed(texts: list[str]) -> list[list[float]]:
    out = []
    for i in range(0, len(texts), EMBED_BATCH):
        r = httpx.post(f"{EMBED}/embed_batch", json={"texts": texts[i:i + EMBED_BATCH], "model": MODEL},
                       timeout=600)
        r.raise_for_status()
        d = r.json()
        if d.get("model") != "Qwen3-Embedding-4B-q8-v2" or d.get("dim") != DIM:
            sys.exit(f"REFUSING: embedder answered model={d.get('model')} dim={d.get('dim')}, not v2/{DIM}")
        out += d["embeddings"]
    return out


def cmd_plan() -> None:
    tot = 0
    for n in sources():
        cnt = q.count(n, exact=True).count
        sh = n + SUFFIX
        done = q.count(sh, exact=True).count if q.collection_exists(sh) else 0
        tot += cnt
        print(f"{n:32s} {cnt:7d}  shadow {done:7d}")
    print(f"TOTAL {tot}")


def cmd_batch(name: str, n: int) -> None:
    sh = ensure_shadow(name)
    have = set(all_ids(sh))
    missing = [i for i in all_ids(name) if i not in have]
    todo = missing[:n]
    if todo:
        pts = q.retrieve(name, ids=todo, with_payload=True, with_vectors=False)
        no_text = [p.id for p in pts if not isinstance((p.payload or {}).get("text"), str) or not p.payload["text"].strip()]
        if no_text:
            # Never invent a vector and never drop a point silently: a point without text blocks the swap.
            sys.exit(f"BLOCKED: {len(no_text)} point(s) in {name} have no payload text, e.g. {no_text[:5]}")
        t0 = time.time()
        vecs = embed([p.payload["text"] for p in pts])
        q.upsert(sh, points=[PointStruct(id=p.id, vector=v, payload=p.payload) for p, v in zip(pts, vecs)],
                 wait=True)
        print(f"{name}: +{len(pts)} in {time.time() - t0:.1f}s", file=sys.stderr)
    print(f"remaining={len(missing) - len(todo)}")


def cmd_verify(name: str) -> None:
    sh = name + SUFFIX
    src, dst = set(all_ids(name)), set(all_ids(sh))
    res = {"collection": name, "source": len(src), "shadow": len(dst),
           "missing": len(src - dst), "extra": len(dst - src)}
    sample = random.Random(20261013).sample(sorted(src & dst, key=str), min(25, len(src & dst)))
    a = {p.id: p.payload for p in q.retrieve(name, ids=sample, with_payload=True)}
    b = {p.id: p for p in q.retrieve(sh, ids=sample, with_payload=True, with_vectors=True)}
    res["payload_equal"] = sum(a[i] == b[i].payload for i in sample)
    # Self-retrieval: each sampled point's own text, embedded fresh, should find that point first.
    hits = 0
    if sample:
        vecs = embed([a[i]["text"] for i in sample])
        for i, v in zip(sample, vecs):
            top = q.query_points(sh, query=v, limit=1).points
            hits += bool(top) and top[0].id == i
    res["self_retrieval_at1"] = f"{hits}/{len(sample)}"
    res["ok"] = res["missing"] == 0 and res["extra"] == 0 and res["payload_equal"] == len(sample)
    print(json.dumps(res))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["plan"]:
        cmd_plan()
    elif a[:1] == ["batch"] and len(a) in (2, 3):
        cmd_batch(a[1], int(a[2]) if len(a) == 3 else 256)
    elif a[:1] == ["verify"] and len(a) == 2:
        cmd_verify(a[1])
    else:
        sys.exit(__doc__)
