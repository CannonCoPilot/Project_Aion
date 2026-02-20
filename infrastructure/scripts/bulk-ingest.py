#!/usr/bin/env python3
"""Bulk ingestion script for DF project repos into Qdrant.

Creates collections if needed, chunks source files, embeds via MLX server,
and upserts into Qdrant. Uses the same chunking/embedding logic as mcp_server.py.
"""
import asyncio
import hashlib
import re
import sys
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

# Extensions to index (text-readable source files)
INDEX_EXTENSIONS = {
    ".cpp", ".h", ".c", ".hpp", ".cc",
    ".py", ".lua", ".rb", ".pl", ".pm",
    ".md", ".txt", ".rst",
    ".xml", ".json", ".yaml", ".yml",
    ".cmake", ".proto", ".toml", ".cfg", ".ini",
    ".sh", ".bat",
}

# Repos to ingest: (directory_name, collection_name)
REPOS = [
    ("DwarfFortressLogger", "df-logger"),
    ("myDFHackScripts", "mydfhack-scripts"),
    ("df-ai", "df-ai"),
    ("df-structures", "df-structures"),
    ("df-narrator", "df-narrator"),
    ("dfhack-client-python", "dfhack-client-python"),
    ("weblegends", "weblegends"),
]

PROJECTS_DIR = Path("/Users/nathanielcannon/Claude/Jarvis/projects")

qdrant = QdrantClient(url=QDRANT_URL)


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks with sentence-boundary awareness."""
    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        search_start = start + int(chunk_size * 0.7)
        segment = text[search_start:end]
        match = None
        for m in re.finditer(r'[.!?]\s|\n\n|\n(?=[A-Z#\-*])', segment):
            match = m

        if match:
            end = search_start + match.end()

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap if end - overlap > start else end

    return chunks


async def get_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    """Get embedding vector from MLX server."""
    resp = await client.post(
        f"{MLX_EMBED_URL}/embed",
        json={"text": text, "model": "medium"},
    )
    resp.raise_for_status()
    data = resp.json()
    embedding = data.get("embedding")
    if not embedding:
        raise ValueError(f"No embedding returned: {data}")
    return embedding


def ensure_collection(name: str):
    """Create Qdrant collection if it doesn't exist."""
    collections = [c.name for c in qdrant.get_collections().collections]
    if name not in collections:
        qdrant.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"  Created collection: {name}")
    else:
        print(f"  Collection exists: {name}")


def find_files(repo_dir: Path) -> list[Path]:
    """Find all indexable source files in a repo."""
    files = []
    for f in sorted(repo_dir.rglob("*")):
        if not f.is_file():
            continue
        if f.suffix.lower() not in INDEX_EXTENSIONS:
            continue
        # Skip hidden dirs, build dirs, .git
        parts = f.relative_to(repo_dir).parts
        if any(p.startswith(".") or p in ("build", "node_modules", "__pycache__") for p in parts):
            continue
        files.append(f)
    return files


async def ingest_file(
    client: httpx.AsyncClient, file_path: Path, collection: str
) -> dict:
    """Ingest a single file into Qdrant."""
    try:
        text = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return {"status": "error", "file": str(file_path), "error": str(e)}

    if not text.strip():
        return {"status": "skipped", "reason": "empty", "file": str(file_path)}

    file_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

    # Check if already indexed with same hash
    try:
        existing = qdrant.scroll(
            collection_name=collection,
            scroll_filter=Filter(
                must=[FieldCondition(key="file_hash", match=MatchValue(value=file_hash))]
            ),
            limit=1,
        )
        if existing[0]:
            return {"status": "skipped", "reason": "already indexed", "file": str(file_path)}
    except Exception:
        pass

    # Delete old vectors for this file
    try:
        qdrant.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=str(file_path)))]
            ),
        )
    except Exception:
        pass

    chunks = chunk_text(text)
    points = []
    for i, chunk in enumerate(chunks):
        embedding = await get_embedding(client, chunk)
        point_id = abs(hash(f"{file_path}:{i}:{file_hash}")) % (2**63)
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk,
                    "source": str(file_path),
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
            batch = points[batch_start : batch_start + batch_size]
            qdrant.upsert(collection_name=collection, points=batch)

    return {"status": "ingested", "file": str(file_path), "chunks": len(points)}


async def ingest_repo(repo_name: str, collection: str):
    """Ingest all files from a repo into a Qdrant collection."""
    repo_dir = PROJECTS_DIR / repo_name
    if not repo_dir.is_dir():
        print(f"  ERROR: {repo_dir} not found")
        return

    print(f"\n{'='*60}")
    print(f"Ingesting: {repo_name} -> {collection}")
    print(f"{'='*60}")

    ensure_collection(collection)
    files = find_files(repo_dir)
    print(f"  Found {len(files)} indexable files")

    ingested = 0
    skipped = 0
    errors = 0
    total_chunks = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i, f in enumerate(files):
            result = await ingest_file(client, f, collection)
            status = result.get("status")
            if status == "ingested":
                ingested += 1
                total_chunks += result.get("chunks", 0)
                print(f"  [{i+1}/{len(files)}] {f.name} -> {result.get('chunks')} chunks")
            elif status == "skipped":
                skipped += 1
                if i % 20 == 0:
                    print(f"  [{i+1}/{len(files)}] {f.name} (skipped: {result.get('reason')})")
            else:
                errors += 1
                print(f"  [{i+1}/{len(files)}] ERROR: {f.name}: {result.get('error')}")

    print(f"\n  Summary: {ingested} ingested, {skipped} skipped, {errors} errors, {total_chunks} total chunks")


async def main():
    repos = REPOS
    if len(sys.argv) > 1:
        # Allow specifying specific repos: python bulk-ingest.py DwarfFortressLogger
        repos = [(name, col) for name, col in REPOS if name in sys.argv[1:]]
        if not repos:
            print(f"Unknown repo. Available: {[r[0] for r in REPOS]}")
            sys.exit(1)

    print(f"Bulk ingestion starting — {len(repos)} repos")
    for repo_name, collection in repos:
        await ingest_repo(repo_name, collection)
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
