#!/usr/bin/env python3
"""
Bulk ingest Dwarf Fortress codebases into Qdrant collections.
Direct Qdrant + MLX embedding, bypasses MCP server VALID_COLLECTIONS whitelist.
Same chunking and embedding logic as mcp_server.py.
"""
import hashlib
import re
import sys
import time
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

QDRANT_URL = "http://localhost:6333"
MLX_EMBED_URL = "http://localhost:8000"
EMBED_DIM = 2560

qdrant = QdrantClient(url=QDRANT_URL)


def ensure_collection(name: str):
    """Create collection if it doesn't exist."""
    existing = [c.name for c in qdrant.get_collections().collections]
    if name not in existing:
        qdrant.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"  Created collection: {name}")
    else:
        info = qdrant.get_collection(name)
        print(f"  Collection {name} exists ({info.points_count} points)")


def chunk_text(text: str, max_chars: int = 1500, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks, respecting line boundaries."""
    lines = text.split("\n")
    chunks = []
    current = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1
        if current_len + line_len > max_chars and current:
            chunks.append("\n".join(current))
            # Keep overlap
            overlap_lines = []
            overlap_len = 0
            for prev_line in reversed(current):
                if overlap_len + len(prev_line) + 1 > overlap:
                    break
                overlap_lines.insert(0, prev_line)
                overlap_len += len(prev_line) + 1
            current = overlap_lines
            current_len = overlap_len
        current.append(line)
        current_len += line_len

    if current:
        chunks.append("\n".join(current))
    return chunks


def get_embedding(text: str) -> list[float]:
    """Get embedding from MLX server."""
    resp = httpx.post(
        f"{MLX_EMBED_URL}/embed",
        json={"text": text},
        timeout=30.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["embedding"]


def ingest_file(file_path: Path, collection: str) -> dict:
    """Ingest a single file into the specified collection."""
    try:
        text = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return {"status": "error", "error": str(e)}

    if not text.strip():
        return {"status": "skipped", "reason": "empty"}

    file_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
    file_str = str(file_path)

    # Check if already indexed
    try:
        existing = qdrant.scroll(
            collection_name=collection,
            scroll_filter=Filter(
                must=[FieldCondition(key="file_hash", match=MatchValue(value=file_hash))]
            ),
            limit=1,
        )
        if existing[0]:
            return {"status": "skipped", "reason": "same hash"}
    except Exception:
        pass

    # Delete old vectors for this file
    try:
        qdrant.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=file_str))]
            ),
        )
    except Exception:
        pass

    chunks = chunk_text(text)
    points = []
    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        point_id = abs(hash(f"{file_str}:{i}:{file_hash}")) % (2**63)
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk,
                    "source": file_str,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "file_hash": file_hash,
                    "file_name": file_path.name,
                    "file_ext": file_path.suffix,
                },
            )
        )

    if points:
        batch_size = 50
        for batch_start in range(0, len(points), batch_size):
            batch = points[batch_start:batch_start + batch_size]
            qdrant.upsert(collection_name=collection, points=batch)

    return {"status": "ingested", "chunks": len(points)}


def ingest_directory(directory: Path, collection: str, patterns: list[str],
                     excludes: list[str] | None = None):
    """Ingest all matching files in a directory."""
    ensure_collection(collection)
    excludes = excludes or []

    files = []
    for pattern in patterns:
        files.extend(directory.glob(pattern))

    # Filter excludes
    filtered = []
    for f in files:
        skip = False
        for excl in excludes:
            if excl in str(f):
                skip = True
                break
        if not skip and f.is_file():
            filtered.append(f)

    filtered = sorted(set(filtered))
    print(f"\n{'='*60}")
    print(f"Ingesting {len(filtered)} files into '{collection}'")
    print(f"{'='*60}")

    ingested = 0
    skipped = 0
    errors = 0
    total_chunks = 0

    for i, f in enumerate(filtered):
        rel = f.relative_to(directory)
        result = ingest_file(f, collection)
        status = result.get("status", "error")

        if status == "ingested":
            ingested += 1
            total_chunks += result.get("chunks", 0)
            print(f"  [{i+1}/{len(filtered)}] {rel} -> {result['chunks']} chunks")
        elif status == "skipped":
            skipped += 1
            print(f"  [{i+1}/{len(filtered)}] {rel} (skipped: {result.get('reason', '?')})")
        else:
            errors += 1
            print(f"  [{i+1}/{len(filtered)}] {rel} ERROR: {result.get('error', '?')}")

    print(f"\nDone: {ingested} ingested, {skipped} skipped, {errors} errors, {total_chunks} total chunks")
    return {"ingested": ingested, "skipped": skipped, "errors": errors, "total_chunks": total_chunks}


PROJECTS = Path("/Users/nathanielcannon/Claude/Jarvis/projects")

REPOS = [
    {
        "name": "df-ai",
        "dir": PROJECTS / "df-ai",
        "collection": "df-ai",
        "patterns": ["*.cpp", "*.h"],
        "excludes": ["thirdparty/", ".git/"],
    },
    {
        "name": "weblegends",
        "dir": PROJECTS / "weblegends",
        "collection": "weblegends",
        "patterns": ["**/*.cpp", "**/*.h"],
        "excludes": ["thirdparty/", ".git/"],
    },
    {
        "name": "df-structures",
        "dir": PROJECTS / "df-structures",
        "collection": "df-structures",
        "patterns": ["*.xml"],
        "excludes": [".git/"],
    },
    {
        "name": "df-narrator",
        "dir": PROJECTS / "df-narrator",
        "collection": "df-narrator",
        "patterns": ["**/*.py"],
        "excludes": [".git/", "__pycache__/"],
    },
    {
        "name": "dfhack-client-python",
        "dir": PROJECTS / "dfhack-client-python",
        "collection": "dfhack-client-python",
        "patterns": ["**/*.py", "**/*.proto"],
        "excludes": [".git/", "__pycache__/"],
    },
    {
        "name": "myDFHackScripts (append to dfhack)",
        "dir": PROJECTS / "myDFHackScripts",
        "collection": "dfhack",
        "patterns": ["*.lua"],
        "excludes": ["test.lua", "test2.lua", "test3.lua", "test4.lua", "test5.lua",
                     "Incest.lua", ".git/"],
    },
]

# Also ingest the research plan
RESEARCH_FILES = [
    (Path("/Users/nathanielcannon/Claude/Jarvis/.claude/context/research/dwarf-fortress-project-plan.md"), "research"),
]


def main():
    start = time.time()

    # Ingest repos
    for repo in REPOS:
        print(f"\n{'#'*60}")
        print(f"# {repo['name']}")
        print(f"{'#'*60}")
        ingest_directory(repo["dir"], repo["collection"], repo["patterns"], repo.get("excludes"))

    # Ingest research files
    print(f"\n{'#'*60}")
    print(f"# Research documents")
    print(f"{'#'*60}")
    for fpath, coll in RESEARCH_FILES:
        ensure_collection(coll)
        result = ingest_file(fpath, coll)
        print(f"  {fpath.name} -> {result}")

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"All done in {elapsed:.1f}s")

    # Print final collection stats
    print(f"\nFinal collection stats:")
    for c in qdrant.get_collections().collections:
        info = qdrant.get_collection(c.name)
        print(f"  {c.name}: {info.points_count} points")


if __name__ == "__main__":
    main()
