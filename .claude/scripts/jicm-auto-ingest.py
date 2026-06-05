#!/usr/bin/env python3
"""
jicm-auto-ingest.py — L4 Autonomic Consolidation (Phase 2B, Task 1)

After each JICM compression cycle, ingest the checkpoint file into the RAG
sessions collection for long-term semantic retrieval. Implements deduplication
via similarity search before insertion.

Called by: jicm-watcher.sh (step 5.5, async background)
Requires: Qdrant (localhost:6333) + MLX embed (localhost:8000)
Venv: infrastructure/.venv/bin/python (qdrant-client, httpx)

Memory System role:
  Layer: L4 (Long-Term Declarative)
  Process: Curate + Store (consolidation from L3 → L4)
  Anti-Hyperthymesia: similarity dedup prevents redundant ingestion
"""
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

# --- Configuration (from environment, set by jicm-config.sh sourcing) ---
PROJECT_DIR = os.environ.get("PROJECT_DIR", os.environ.get("CLAUDE_PROJECT_DIR", os.path.expanduser("~/Claude/Project_Aion")))
CHECKPOINT_FILE = os.environ.get("JICM_COMPRESSED_FILE", f"{PROJECT_DIR}/.claude/context/.compressed-context-ready.md")
COLLECTION = os.environ.get("JICM_RAG_COLLECTION", "sessions")
DEDUP_THRESHOLD = float(os.environ.get("JICM_RAG_DEDUP_THRESHOLD", "0.92"))
QDRANT_URL = os.environ.get("JICM_RAG_QDRANT_URL", "http://localhost:6333")
EMBED_URL = os.environ.get("JICM_RAG_EMBED_URL", "http://localhost:8000")
LOG_FILE = os.environ.get("JICM_INGEST_LOG", f"{PROJECT_DIR}/.claude/logs/jicm-auto-ingest.log")
EMBED_DIM = 2560
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"{ts} | {msg}\n"
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line)


def get_embedding(text: str) -> list[float]:
    """Get embedding vector from MLX embed server."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(f"{EMBED_URL}/embed", json={"text": text, "model": "medium"})
        resp.raise_for_status()
        data = resp.json()
        embedding = data.get("embedding")
        if not embedding:
            raise ValueError(f"No embedding returned: {data}")
        return embedding


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks with sentence-boundary awareness."""
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + CHUNK_SIZE
        if end >= text_len:
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break
        search_start = start + int(CHUNK_SIZE * 0.7)
        segment = text[search_start:end]
        match = None
        for m in re.finditer(r'[.!?]\s|\n\n|\n(?=[A-Z#\-*])', segment):
            match = m
        break_at = (search_start + match.end()) if match else end
        chunk = text[start:break_at].strip()
        if chunk:
            chunks.append(chunk)
        start = break_at - CHUNK_OVERLAP
    return chunks


def ensure_collection(qdrant: QdrantClient):
    """Create collection if it doesn't exist."""
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION not in collections:
        qdrant.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        log(f"Created collection '{COLLECTION}'")


def check_dedup(qdrant: QdrantClient, text: str) -> tuple[bool, float]:
    """Check if similar content already exists. Returns (should_skip, top_score)."""
    # Embed the first ~500 chars (representative summary) for dedup check
    sample = text[:500]
    try:
        embedding = get_embedding(sample)
    except Exception as e:
        log(f"WARN: dedup embedding failed ({e}) — proceeding with ingest")
        return False, 0.0

    results = qdrant.query_points(
        collection_name=COLLECTION,
        query=embedding,
        limit=1,
    )

    if results.points:
        top_score = results.points[0].score
        if top_score >= DEDUP_THRESHOLD:
            return True, top_score
    return False, results.points[0].score if results.points else 0.0


def ingest_checkpoint(qdrant: QdrantClient, text: str, file_path: str):
    """Chunk, embed, and upsert the checkpoint to Qdrant."""
    file_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    session_id = os.environ.get("JICM_SESSION_ID", "unknown")
    timestamp = datetime.now(timezone.utc).isoformat()

    # Delete old vectors for this source (re-ingest scenario)
    try:
        qdrant.delete(
            collection_name=COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=file_path))]
            ),
        )
    except Exception:
        pass

    chunks = chunk_text(text)
    points = []
    for i, chunk in enumerate(chunks):
        try:
            embedding = get_embedding(chunk)
        except Exception as e:
            log(f"WARN: embedding failed for chunk {i} ({e}) — skipping")
            continue
        point_id = abs(hash(f"{file_path}:{i}:{file_hash}")) % (2**63)
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk,
                    "source": file_path,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "file_hash": file_hash,
                    "file_name": Path(file_path).name,
                    "type": "jicm_checkpoint",
                    "session_id": session_id,
                    "ingested_at": timestamp,
                    "dedup_threshold": DEDUP_THRESHOLD,
                },
            )
        )

    if points:
        batch_size = 50
        for batch_start in range(0, len(points), batch_size):
            batch = points[batch_start:batch_start + batch_size]
            qdrant.upsert(collection_name=COLLECTION, points=batch)

    return len(points)


def main():
    start = time.time()

    if not os.path.isfile(CHECKPOINT_FILE):
        log(f"SKIP: checkpoint file not found: {CHECKPOINT_FILE}")
        return

    text = Path(CHECKPOINT_FILE).read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        log("SKIP: checkpoint file is empty")
        return

    try:
        qdrant = QdrantClient(url=QDRANT_URL, timeout=10)
        ensure_collection(qdrant)
    except Exception as e:
        log(f"ERROR: Qdrant connection failed ({e}) — skipping ingest")
        return

    # Deduplication check
    should_skip, top_score = check_dedup(qdrant, text)
    if should_skip:
        log(f"DEDUP: skipped (top_score={top_score:.4f} >= threshold={DEDUP_THRESHOLD})")
        return

    # Ingest
    try:
        n_chunks = ingest_checkpoint(qdrant, text, CHECKPOINT_FILE)
        elapsed = time.time() - start
        log(f"INGESTED: {n_chunks} chunks to '{COLLECTION}' "
            f"(dedup_score={top_score:.4f}, threshold={DEDUP_THRESHOLD}, "
            f"elapsed={elapsed:.1f}s)")
    except Exception as e:
        log(f"ERROR: ingest failed ({e})")
        return

    # Write metadata for observability
    metadata = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "chunks_ingested": n_chunks,
        "collection": COLLECTION,
        "dedup_score": round(top_score, 4),
        "dedup_threshold": DEDUP_THRESHOLD,
        "elapsed_seconds": round(time.time() - start, 2),
        "checkpoint_bytes": len(text.encode()),
    }
    metadata_file = os.path.join(PROJECT_DIR, ".claude/context/.jicm-last-ingest.json")
    with open(metadata_file, "w") as f:
        json.dump(metadata, f, indent=2)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FATAL: {e}")
        sys.exit(1)
