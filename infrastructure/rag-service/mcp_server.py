"""
Jarvis RAG MCP Server — Milestone 3
Exposes semantic search and document ingestion via MCP protocol.
Uses Qdrant for vector storage, Ollama for embeddings.

Collections:
  jarvis-context — patterns, state, plans, context files
  codebase       — scripts, hooks, skills, agents
  research       — reports, deep research, experiments
  sessions       — session transcripts and checkpoints
"""
import hashlib
import os
import re
from pathlib import Path

import httpx
from fastmcp import FastMCP
from qdrant_client import QdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
)

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:4b")
EMBED_DIM = int(os.getenv("EMBED_DIM", "2560"))
VALID_COLLECTIONS = {"jarvis-context", "codebase", "research", "sessions"}

qdrant = QdrantClient(url=QDRANT_URL)
mcp = FastMCP("jarvis-rag")


async def get_embedding(text: str) -> list[float]:
    """Get embedding vector from Ollama."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": text},
        )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("embeddings", [])
        if not embeddings:
            raise ValueError(f"No embeddings returned: {data}")
        return embeddings[0]


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    """Split text into overlapping chunks with sentence-boundary awareness.

    Tries to break at sentence boundaries (period/newline) near the chunk_size
    limit. Falls back to character boundary if no sentence break is found.
    """
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

        # Look for sentence boundary in the last 30% of the chunk
        search_start = start + int(chunk_size * 0.7)
        segment = text[search_start:end]
        # Find last sentence-ending punctuation followed by whitespace, or double newline
        match = None
        for m in re.finditer(r'[.!?]\s|\n\n|\n(?=[A-Z#\-*])', segment):
            match = m

        if match:
            # Break after the sentence boundary
            break_at = search_start + match.end()
        else:
            break_at = end

        chunk = text[start:break_at].strip()
        if chunk:
            chunks.append(chunk)

        start = break_at - overlap

    return chunks


def file_to_collection(file_path: str) -> str:
    """Auto-detect the best collection for a file based on its path."""
    p = file_path.lower()
    if "/reports/" in p or "/deep-research/" in p or "/research/" in p:
        return "research"
    if "/scripts/" in p or "/hooks/" in p or "/skills/" in p or "/agents/" in p:
        return "codebase"
    if "/context/" in p or "/plans/" in p or "/patterns/" in p:
        return "jarvis-context"
    if ".jsonl" in p or "/sessions/" in p or "session" in p:
        return "sessions"
    # Default: treat as context
    return "jarvis-context"


@mcp.tool()
async def search(
    query: str,
    collection: str = "jarvis-context",
    top_k: int = 5,
) -> list[dict]:
    """Semantic search across the Jarvis knowledge base.

    Args:
        query: Natural language search query.
        collection: Which collection to search — one of:
            jarvis-context (patterns, state, plans),
            codebase (scripts, hooks, skills),
            research (reports, experiments),
            sessions (transcripts, checkpoints).
        top_k: Number of results to return (1-20).
    """
    if collection not in VALID_COLLECTIONS:
        return [{"error": f"Invalid collection '{collection}'. Valid: {VALID_COLLECTIONS}"}]

    top_k = max(1, min(20, top_k))
    embedding = await get_embedding(query)

    results = qdrant.query_points(
        collection_name=collection,
        query=embedding,
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "score": round(r.score, 4),
            "text": r.payload.get("text", "")[:2000],
            "source": r.payload.get("source", ""),
            "file_name": r.payload.get("file_name", ""),
            "chunk_index": r.payload.get("chunk_index", 0),
        }
        for r in results.points
    ]


@mcp.tool()
async def multi_search(
    query: str,
    collections: list[str] | None = None,
    top_k: int = 3,
) -> dict[str, list[dict]]:
    """Search across multiple collections simultaneously.

    Args:
        query: Natural language search query.
        collections: List of collections to search. Defaults to all.
        top_k: Results per collection (1-10).
    """
    if collections is None:
        collections = list(VALID_COLLECTIONS)

    top_k = max(1, min(10, top_k))
    embedding = await get_embedding(query)
    results = {}

    for coll in collections:
        if coll not in VALID_COLLECTIONS:
            results[coll] = [{"error": f"Invalid collection '{coll}'"}]
            continue

        hits = qdrant.query_points(
            collection_name=coll,
            query=embedding,
            limit=top_k,
            with_payload=True,
        )
        results[coll] = [
            {
                "score": round(r.score, 4),
                "text": r.payload.get("text", "")[:1500],
                "source": r.payload.get("source", ""),
                "file_name": r.payload.get("file_name", ""),
            }
            for r in hits.points
        ]

    return results


@mcp.tool()
async def ingest(
    file_path: str,
    collection: str | None = None,
) -> dict:
    """Ingest a document into the RAG knowledge base.

    Chunks the file, generates embeddings via local Ollama, and stores
    in Qdrant. Skips files already indexed with the same content hash.
    Automatically detects the best collection if not specified.

    Args:
        file_path: Absolute path to the file to ingest.
        collection: Target collection. Auto-detected from path if omitted.
    """
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}
    if not path.is_file():
        return {"error": f"Not a file: {file_path}"}

    if collection is None:
        collection = file_to_collection(file_path)
    if collection not in VALID_COLLECTIONS:
        return {"error": f"Invalid collection '{collection}'. Valid: {VALID_COLLECTIONS}"}

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return {"error": f"Read error: {e}"}

    if not text.strip():
        return {"status": "skipped", "reason": "empty file", "file": file_path}

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
            return {
                "status": "skipped",
                "reason": "already indexed (same content hash)",
                "file": file_path,
                "collection": collection,
            }
    except Exception:
        pass  # Collection might not have indexed payloads yet

    # Delete old vectors for this file (re-index scenario)
    try:
        qdrant.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=file_path))]
            ),
        )
    except Exception:
        pass

    # Chunk and embed
    chunks = chunk_text(text)
    points = []
    for i, chunk in enumerate(chunks):
        embedding = await get_embedding(chunk)
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
                    "file_name": path.name,
                    "file_ext": path.suffix,
                },
            )
        )

    if points:
        # Upsert in batches of 50 to avoid timeout on large files
        batch_size = 50
        for batch_start in range(0, len(points), batch_size):
            batch = points[batch_start : batch_start + batch_size]
            qdrant.upsert(collection_name=collection, points=batch)

    return {
        "status": "ingested",
        "file": file_path,
        "chunks": len(points),
        "collection": collection,
        "file_hash": file_hash,
    }


@mcp.tool()
async def ingest_directory(
    directory: str,
    collection: str | None = None,
    pattern: str = "**/*.md",
) -> dict:
    """Ingest all matching files in a directory into the RAG knowledge base.

    Args:
        directory: Absolute path to the directory.
        collection: Target collection. Auto-detected per file if omitted.
        pattern: Glob pattern for files to include (default: all markdown).
    """
    dir_path = Path(directory)
    if not dir_path.is_dir():
        return {"error": f"Not a directory: {directory}"}

    files = sorted(dir_path.glob(pattern))
    results = {
        "ingested": 0,
        "skipped": 0,
        "errors": 0,
        "total_chunks": 0,
        "files_processed": [],
    }

    for f in files:
        if not f.is_file():
            continue
        try:
            result = await ingest(str(f), collection)
            status = result.get("status", "error")
            if status == "ingested":
                results["ingested"] += 1
                results["total_chunks"] += result.get("chunks", 0)
                results["files_processed"].append(
                    {"file": f.name, "chunks": result.get("chunks", 0)}
                )
            elif status == "skipped":
                results["skipped"] += 1
            else:
                results["errors"] += 1
        except Exception as e:
            results["errors"] += 1

    # Truncate file list for large directories
    if len(results["files_processed"]) > 20:
        results["files_processed"] = results["files_processed"][:20]
        results["files_processed"].append({"note": "... truncated"})

    return results


@mcp.tool()
async def list_collections() -> list[dict]:
    """List all RAG collections with document and vector counts."""
    collections_resp = qdrant.get_collections()
    result = []
    for c in collections_resp.collections:
        info = qdrant.get_collection(c.name)
        result.append(
            {
                "name": c.name,
                "points_count": info.points_count or 0,
                "indexed_vectors_count": info.indexed_vectors_count or 0,
                "status": info.status.value if info.status else "unknown",
            }
        )
    return result


@mcp.tool()
async def delete_file(
    file_path: str,
    collection: str = "jarvis-context",
) -> dict:
    """Remove all vectors for a specific file from a collection.

    Args:
        file_path: The source file path used during ingestion.
        collection: The collection to delete from.
    """
    if collection not in VALID_COLLECTIONS:
        return {"error": f"Invalid collection '{collection}'. Valid: {VALID_COLLECTIONS}"}

    try:
        qdrant.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=file_path))]
            ),
        )
        return {"status": "deleted", "file": file_path, "collection": collection}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run(transport="stdio")
