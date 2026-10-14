#!/usr/bin/env python3
"""Embedder v2 cutover, Graphiti (Neo4j) part: re-embed every Entity.name_embedding and
RELATES_TO.fact_embedding with v2, exactly as graphiti_core would write them.

WHY: the jarvis-graphiti MCP embeds through :8000/v1 (EMBED_MODEL qwen3-embedding:4b). Since the
2026-10-14 swap :8000 serves v2 for every model name, so NEW nodes and edges get v2 vectors while
the graph's older ones hold legacy (near-random) vectors. A mixed index is silently wrong; this
makes it all v2.

SAME INPUT AS GRAPHITI: text = name.replace('\\n', ' ') for entities (nodes.py
generate_name_embedding) and fact.replace('\\n', ' ') for edges (edges.py generate_embedding),
embedded through the same OpenAI-compatible /v1/embeddings path and truncated to EMBEDDING_DIM,
stored with db.create.setNodeVectorProperty / setRelationshipVectorProperty as graphiti does.

PROGRESS is a local file of done elementIds (NOT a property on the node: graphiti turns extra node
properties into `attributes`, so a marker would leak into every search result). Resumable.

  graphiti-reembed-v2.py plan            entity / edge totals and how many are done
  graphiti-reembed-v2.py batch KIND [N]  KIND = entity | edge; prints "remaining=<k>"
  graphiti-reembed-v2.py verify KIND     a seeded sample: stored vector == fresh v2 vector
"""
from __future__ import annotations

import json
import math
import os
import random
import sys
from pathlib import Path

import httpx
from neo4j import GraphDatabase

EMBED = "http://localhost:8000/v1/embeddings"
MODEL = "qwen3-embedding:4b"          # what the MCP sends; :8000 pins it to v2 (EMBED_FORCE_MODEL)
DIM = 2560
ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".claude/scratch/graphiti-reembed-v2"

KINDS = {
    "entity": {
        "ids": "MATCH (n:Entity) WHERE n.name IS NOT NULL RETURN elementId(n) AS id",
        "get": "MATCH (n:Entity) WHERE elementId(n) IN $ids RETURN elementId(n) AS id, n.name AS text",
        "set": ("UNWIND $rows AS row MATCH (n) WHERE elementId(n) = row.id "
                "CALL db.create.setNodeVectorProperty(n, 'name_embedding', row.vec) RETURN count(*) AS c"),
        "vec": "MATCH (n) WHERE elementId(n) = $id RETURN n.name_embedding AS v, n.name AS text",
    },
    "edge": {
        "ids": "MATCH ()-[e:RELATES_TO]->() WHERE e.fact IS NOT NULL RETURN elementId(e) AS id",
        "get": "MATCH ()-[e:RELATES_TO]->() WHERE elementId(e) IN $ids RETURN elementId(e) AS id, e.fact AS text",
        "set": ("UNWIND $rows AS row MATCH ()-[e]->() WHERE elementId(e) = row.id "
                "CALL db.create.setRelationshipVectorProperty(e, 'fact_embedding', row.vec) RETURN count(*) AS c"),
        "vec": "MATCH ()-[e]->() WHERE elementId(e) = $id RETURN e.fact_embedding AS v, e.fact AS text",
    },
}

drv = GraphDatabase.driver(os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
                           auth=("neo4j", os.environ["NEO4J_PASSWORD"]))


def done_file(kind: str) -> Path:
    STATE.mkdir(parents=True, exist_ok=True)
    return STATE / f"{kind}.done"


def done(kind: str) -> set[str]:
    f = done_file(kind)
    return set(f.read_text().split()) if f.exists() else set()


def all_ids(kind: str) -> list[str]:
    with drv.session() as s:
        return sorted(r["id"] for r in s.run(KINDS[kind]["ids"]))


def embed(texts: list[str]) -> list[list[float]]:
    r = httpx.post(EMBED, json={"input": texts, "model": MODEL}, timeout=600)
    r.raise_for_status()
    d = r.json()
    if d.get("model") != "Qwen3-Embedding-4B-q8-v2":
        sys.exit(f"REFUSING: :8000 answered model={d.get('model')}, not v2")
    return [x["embedding"][:DIM] for x in d["data"]]


def cmd_plan() -> None:
    for k in KINDS:
        print(json.dumps({"kind": k, "total": len(all_ids(k)), "done": len(done(k))}))


def cmd_batch(kind: str, n: int) -> None:
    have = done(kind)
    todo_all = [i for i in all_ids(kind) if i not in have]
    todo = todo_all[:n]
    if todo:
        with drv.session() as s:
            rows = [(r["id"], r["text"]) for r in s.run(KINDS[kind]["get"], ids=todo)]
        vecs = []
        for i in range(0, len(rows), 32):
            vecs += embed([t.replace("\n", " ") for _, t in rows[i:i + 32]])
        with drv.session() as s:
            c = s.run(KINDS[kind]["set"], rows=[{"id": i, "vec": v} for (i, _), v in zip(rows, vecs)]).single()["c"]
        if c != len(rows):
            sys.exit(f"WRITE MISMATCH: set {c} of {len(rows)}")
        with done_file(kind).open("a") as f:
            f.write("".join(i + "\n" for i, _ in rows))
    print(f"remaining={len(todo_all) - len(todo)}")


def cmd_verify(kind: str) -> None:
    ids = sorted(done(kind))
    sample = random.Random(20261014).sample(ids, min(25, len(ids)))
    ok = 0
    with drv.session() as s:
        recs = [s.run(KINDS[kind]["vec"], id=i).single() for i in sample]
    fresh = embed([r["text"].replace("\n", " ") for r in recs])
    for r, f in zip(recs, fresh):
        v = r["v"]
        cos = sum(a * b for a, b in zip(v, f)) / math.sqrt(sum(a * a for a in v) * sum(b * b for b in f))
        ok += cos >= 0.9999
    print(json.dumps({"kind": kind, "done": len(ids), "total": len(all_ids(kind)),
                      "stored_eq_fresh_v2": f"{ok}/{len(sample)}", "ok": ok == len(sample)}))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["plan"]:
        cmd_plan()
    elif a[:1] == ["batch"] and len(a) in (2, 3) and a[1] in KINDS:
        cmd_batch(a[1], int(a[2]) if len(a) == 3 else 256)
    elif a[:1] == ["verify"] and len(a) == 2 and a[1] in KINDS:
        cmd_verify(a[1])
    else:
        sys.exit(__doc__)
