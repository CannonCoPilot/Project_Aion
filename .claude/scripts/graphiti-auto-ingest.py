#!/usr/bin/env python3
"""
graphiti-auto-ingest.py — L5 Autonomic Episode Ingestion (Phase 2C)

After each JICM compression cycle, ingest the checkpoint as a Graphiti episode
for entity/relationship extraction into the knowledge graph. Mirrors
jicm-auto-ingest.py's role for L4 (RAG), but targets L5 (Graphiti/Neo4j).

Called by: jicm-watcher.sh (step 5.9, async background)
          REST stage R2 (same interface)
Requires: Neo4j (bolt://localhost:7687) + LiteLLM (localhost:4000) + Ollama embeddings
Venv: infrastructure/.venv/bin/python (graphiti-core)

Memory System role:
  Layer: L5 (Long-Term Procedural)
  Process: Store (L3 checkpoint → L5 knowledge graph)
"""
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "infrastructure" / "rag-service"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

PROJECT_DIR = os.environ.get("PROJECT_DIR", os.environ.get("CLAUDE_PROJECT_DIR", str(Path.home() / "Claude" / "Jarvis")))
CHECKPOINT_FILE = os.environ.get("JICM_COMPRESSED_FILE", f"{PROJECT_DIR}/.claude/context/.compressed-context-ready.md")
LOG_FILE = os.path.join(PROJECT_DIR, ".claude/logs/graphiti-auto-ingest.log")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "70stc9h60XCCSiQrdxDR9rQQxtGVlDa2")
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3-8b-nothink")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:4b")
EMBED_DIM = int(os.getenv("EMBEDDING_DIM", "2560"))
GROUP_ID = "jarvis-core"
MAX_CONTENT_CHARS = 8000


def log_to_file(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"{ts} | {msg}\n")


async def init_graphiti():
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.cross_encoder.client import CrossEncoderClient
    from ollama_nothink_client import OllamaNoThinkClient

    class NoOpCrossEncoder(CrossEncoderClient):
        async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
            return [(p, 1.0) for p in passages]

    llm_config = LLMConfig(api_key="not-needed", base_url=LITELLM_BASE_URL, model=LLM_MODEL)
    llm_client = OllamaNoThinkClient(config=llm_config)

    embedder_config = OpenAIEmbedderConfig(
        api_key="not-needed", base_url=OLLAMA_BASE_URL,
        embedding_model=EMBED_MODEL, embedding_dim=EMBED_DIM,
    )
    embedder = OpenAIEmbedder(config=embedder_config)

    return Graphiti(
        uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD,
        llm_client=llm_client, embedder=embedder, cross_encoder=NoOpCrossEncoder(),
    )


async def ingest_episode(content: str, name: str, source: str):
    from graphiti_core.nodes import EpisodeType

    graphiti = await init_graphiti()
    start = time.time()

    result = await graphiti.add_episode(
        name=name,
        episode_body=content,
        source_description=source,
        reference_time=datetime.now(timezone.utc),
        source=EpisodeType.text,
        group_id=GROUP_ID,
    )

    elapsed = time.time() - start
    entities = len(result.nodes)
    edges = len(result.edges)
    return entities, edges, elapsed


async def main():
    if not os.path.isfile(CHECKPOINT_FILE):
        log_to_file(f"SKIP: checkpoint not found: {CHECKPOINT_FILE}")
        return

    content = Path(CHECKPOINT_FILE).read_text(encoding="utf-8", errors="replace").strip()
    if not content:
        log_to_file("SKIP: checkpoint empty")
        return

    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS] + "\n\n[... truncated at 8000 chars]"

    name = f"JICM cycle {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}"
    source = f"jicm-compression-cycle — {Path(CHECKPOINT_FILE).name}"

    try:
        entities, edges, elapsed = await ingest_episode(content, name, source)
        log_to_file(f"INGESTED: {entities} entities, {edges} edges in {elapsed:.1f}s")

        metadata = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "entities": entities,
            "edges": edges,
            "elapsed_seconds": round(elapsed, 2),
            "checkpoint_bytes": len(content.encode()),
            "group_id": GROUP_ID,
        }
        meta_file = os.path.join(PROJECT_DIR, ".claude/context/.graphiti-last-ingest.json")
        with open(meta_file, "w") as f:
            json.dump(metadata, f, indent=2)

    except Exception as e:
        log_to_file(f"ERROR: {str(e)[:300]}")
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        log_to_file(f"FATAL: {e}")
        sys.exit(1)
