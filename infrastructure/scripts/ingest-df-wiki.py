#!/usr/bin/env python3
"""
Ingest Dwarf Fortress wiki articles into Qdrant df-wiki collection.
Uses MediaWiki API for plain-text extraction, MLX for embeddings.

Strategy: Fetch pages from curated category list + standalone pages.
Target: ~500-800 high-value core articles (not all 10k).
"""
import hashlib
import time
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

WIKI_API = "https://dwarffortresswiki.org/api.php"
QDRANT_URL = "http://localhost:6333"
MLX_EMBED_URL = "http://localhost:8000"
EMBED_DIM = 2560
COLLECTION = "df-wiki"

qdrant = QdrantClient(url=QDRANT_URL)
http = httpx.Client(timeout=30.0, follow_redirects=True,
                    headers={"User-Agent": "JarvisBot/1.0 (Chronicler project; educational)"})


def ensure_collection():
    existing = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION not in existing:
        qdrant.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
        print(f"Created collection: {COLLECTION}")
    else:
        info = qdrant.get_collection(COLLECTION)
        print(f"Collection {COLLECTION} exists ({info.points_count} points)")


def chunk_text(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks."""
    lines = text.split("\n")
    chunks = []
    current = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1
        if current_len + line_len > max_chars and current:
            chunks.append("\n".join(current))
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
    resp = httpx.post(f"{MLX_EMBED_URL}/embed", json={"text": text}, timeout=30.0)
    resp.raise_for_status()
    return resp.json()["embedding"]


def get_category_members(category: str, limit: int = 500) -> list[dict]:
    """Get all pages in a category via MediaWiki API."""
    pages = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmlimit": 50,
        "cmtype": "page",
        "format": "json",
    }

    while True:
        resp = http.get(WIKI_API, params=params)
        data = resp.json()
        members = data.get("query", {}).get("categorymembers", [])
        pages.extend(members)

        if len(pages) >= limit:
            break

        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        params["cmcontinue"] = cont
        time.sleep(0.5)

    return pages[:limit]


def get_page_text(title: str) -> str | None:
    """Get plain-text content of a wiki page."""
    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": "true",
        "titles": title,
        "format": "json",
    }
    resp = http.get(WIKI_API, params=params)
    data = resp.json()
    pages = data.get("query", {}).get("pages", {})
    for page_id, page in pages.items():
        if page_id == "-1":
            return None
        return page.get("extract", "")
    return None


def ingest_page(title: str, category: str) -> dict:
    """Fetch and ingest a single wiki page."""
    text = get_page_text(title)
    if not text or len(text.strip()) < 100:
        return {"status": "skipped", "reason": "too short or missing"}

    # Prepend title as context
    full_text = f"# {title}\n\n{text}"
    file_hash = hashlib.sha256(full_text.encode()).hexdigest()[:16]

    # Check if already indexed
    try:
        existing = qdrant.scroll(
            collection_name=COLLECTION,
            scroll_filter=Filter(
                must=[FieldCondition(key="file_hash", match=MatchValue(value=file_hash))]
            ),
            limit=1,
        )
        if existing[0]:
            return {"status": "skipped", "reason": "same hash"}
    except Exception:
        pass

    # Delete old vectors for this page
    source_key = f"wiki:{title}"
    try:
        qdrant.delete(
            collection_name=COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="source", match=MatchValue(value=source_key))]
            ),
        )
    except Exception:
        pass

    chunks = chunk_text(full_text)
    points = []
    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        point_id = abs(hash(f"wiki:{title}:{i}:{file_hash}")) % (2**63)
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk,
                    "source": source_key,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "file_hash": file_hash,
                    "file_name": title,
                    "file_ext": ".wiki",
                    "category": category,
                    "url": f"https://dwarffortresswiki.org/index.php/{title.replace(' ', '_')}",
                },
            )
        )

    if points:
        batch_size = 50
        for start in range(0, len(points), batch_size):
            batch = points[start:start + batch_size]
            qdrant.upsert(collection_name=COLLECTION, points=batch)

    return {"status": "ingested", "chunks": len(points)}


# ── Categories to crawl ──────────────────────────────────────────

# Phase 1: Core gameplay mechanics
PHASE1_CATEGORIES = [
    "DF2014:Fortress mode",
    "DF2014:Guides",
    "DF2014:Game mechanics",
    "DF2014:Interface",
    "DF2014:Buildings",
    "DF2014:Items",
    "DF2014:Designations",
    "DF2014:Industry",
    "DF2014:Labors",
    "DF2014:Jobs",
    "DF2014:Healthcare",
    "DF2014:Justice",
    "DF2014:Dwarves",
    "DF2014:Economy",
    "DF2014:Getting started",
    "DF2014:Fortress defense",
    "DF2014:Furniture",
    "DF2014:Furnaces",
    "DF2014:Food",
    "DF2014:Constructions",
    "DF2014:Design",
    "DF2014:Computing",
    "DF2014:Logic",
    "DF2014:Machine components",
    "DF2014:Locations",
]

# Phase 2: World, history, legends
PHASE2_CATEGORIES = [
    "DF2014:Adventurer mode",
    "DF2014:Events",
    "DF2014:Lore",
    "DF2014:Biomes",
    "DF2014:Creature attributes",
    "DF2014:Game",
]

# Phase 3: Modding/data reference
PHASE3_CATEGORIES = [
    "DF2014:Files",
    "DF2014:Map tiles",
]

# Standalone pages (not in categories or important top-level pages)
STANDALONE_PAGES = [
    "DF2014:Legends",
    "DF2014:World generation",
    "DF2014:Historical figure",
    "DF2014:Entity",
    "DF2014:Site",
    "DF2014:Artifact",
    "DF2014:Personality trait",
    "DF2014:Emotion",
    "DF2014:Thought",
    "DF2014:Need",
    "DF2014:Skill",
    "DF2014:Attribute",
    "DF2014:Military",
    "DF2014:Noble",
    "DF2014:Occupation",
    "DF2014:Position",
    "DF2014:Material",
    "DF2014:Metal",
    "DF2014:Stone",
    "DF2014:Wood",
    "DF2014:Gem",
    "DF2014:Quickstart guide",
    "DF2014:Your first fortress",
    "DF2014:Embark",
    "DF2014:Civilization",
    "DF2014:Megabeast",
    "DF2014:Forgotten beast",
    "DF2014:Titan",
    "DF2014:Demon",
    "DF2014:Goblin",
    "DF2014:Dwarf",
    "DF2014:Elf",
    "DF2014:Human",
    "DF2014:Kobold",
    "DF2014:Necromancer",
    "DF2014:Vampire",
    "DF2014:Werebeast",
    "DF2014:Strange mood",
    "DF2014:Artifact",
    "DF2014:Trading",
    "DF2014:Caravan",
    "DF2014:Siege",
    "DF2014:Ambush",
    "DF2014:Squad",
    "DF2014:Militia",
    "DF2014:Stress",
    "DF2014:Happiness",
    "DF2014:Mood",
    "DF2014:Loyalty cascade",
    "DF2014:Tantrum spiral",
    "DF2014:Migration",
    "DF2014:Temple",
    "DF2014:Tavern",
    "DF2014:Library",
    "DF2014:Hospital",
    "DF2014:Bedroom",
    "DF2014:Dining room",
    "DF2014:Well",
    "DF2014:Farm plot",
    "DF2014:Workshop",
    "DF2014:Stockpile",
    "DF2014:Zone",
    "DF2014:Minecart",
    "DF2014:Lever",
    "DF2014:Trap",
    "DF2014:Drawbridge",
    "DF2014:Floodgate",
    "DF2014:Magma",
    "DF2014:Aquifer",
    "DF2014:Cavern",
    "DF2014:Adamantine",
    "DF2014:Candy",
    "DF2014:Armor",
    "DF2014:Weapon",
    "DF2014:Clothing",
    "DF2014:Adventure mode",
    "DF2014:Legends mode",
    "DF2014:World generation advanced parameters",
    "DF2014:Calendar",
    "DF2014:Weather",
    "DF2014:Temperature",
    "Modding",
    "Tile",
    "Raw file",
    "Token",
    "Material definition token",
    "Creature token",
    "Entity token",
    "Building token",
    "Item token",
    "Reaction token",
    "Inorganic token",
    "Plant token",
    "Graphics token",
]


def main():
    start = time.time()
    ensure_collection()

    all_pages = {}  # title -> category (dedup by title)

    # Gather pages from categories
    all_categories = PHASE1_CATEGORIES + PHASE2_CATEGORIES + PHASE3_CATEGORIES
    for cat in all_categories:
        print(f"\nFetching category: {cat}")
        members = get_category_members(cat, limit=100)
        for m in members:
            title = m["title"]
            if title not in all_pages:
                all_pages[title] = cat
        print(f"  -> {len(members)} pages (total unique: {len(all_pages)})")
        time.sleep(0.5)

    # Add standalone pages
    for title in STANDALONE_PAGES:
        if title not in all_pages:
            all_pages[title] = "standalone"

    print(f"\n{'='*60}")
    print(f"Total unique pages to ingest: {len(all_pages)}")
    print(f"{'='*60}")

    ingested = 0
    skipped = 0
    errors = 0
    total_chunks = 0

    for i, (title, cat) in enumerate(all_pages.items()):
        result = ingest_page(title, cat)
        status = result.get("status", "error")

        if status == "ingested":
            ingested += 1
            total_chunks += result.get("chunks", 0)
            print(f"  [{i+1}/{len(all_pages)}] {title} -> {result['chunks']} chunks")
        elif status == "skipped":
            skipped += 1
            if i % 20 == 0:  # reduce noise
                print(f"  [{i+1}/{len(all_pages)}] {title} (skipped: {result.get('reason', '?')})")
        else:
            errors += 1
            print(f"  [{i+1}/{len(all_pages)}] {title} ERROR: {result.get('error', '?')}")

        # Rate limit: ~1 req/s for wiki API + embedding calls
        time.sleep(0.3)

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"Wiki ingestion complete in {elapsed:.1f}s")
    print(f"Ingested: {ingested}, Skipped: {skipped}, Errors: {errors}")
    print(f"Total chunks: {total_chunks}")

    info = qdrant.get_collection(COLLECTION)
    print(f"Collection {COLLECTION}: {info.points_count} points")


if __name__ == "__main__":
    main()
