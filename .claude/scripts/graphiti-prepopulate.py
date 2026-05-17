#!/usr/bin/env python3
"""
graphiti-prepopulate.py — Identity Corpus Ingestion to Graphiti Knowledge Graph

Bulk-ingests Jarvis identity/self-knowledge/operational files into the Neo4j
knowledge graph via graphiti-core. Each file becomes an episode in the
jarvis-core group. The graph extracts entities, relationships, and facts
to build a searchable relational network of Jarvis's self-model.

Called by: Phase I implementation (one-time), MAINTAIN stage M4 (re-ingestion)
Memory System role:
  Layer: L5 (Long-Term Procedural)
  Process: Store (identity corpus → relational graph)

Usage:
  python3 graphiti-prepopulate.py                    # Full corpus ingestion
  python3 graphiti-prepopulate.py --file <path>      # Single file re-ingestion
  python3 graphiti-prepopulate.py --changed-only     # Only files modified since last run
"""

import argparse
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
MARKER_FILE = os.path.join(PROJECT_DIR, ".claude/context/.graphiti-prepopulate-ran")
LOG_FILE = os.path.join(PROJECT_DIR, ".claude/logs/graphiti-prepopulate.log")

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

CORPUS = {
    "P0-psyche": [
        ".claude/context/psyche/jarvis-identity.md",
        ".claude/context/psyche/capability-map.yaml",
        ".claude/context/psyche/autopoietic-paradigm.md",
        ".claude/context/psyche/_index.md",
        ".claude/context/psyche/nous-map.md",
        ".claude/context/psyche/pneuma-map.md",
        ".claude/context/psyche/soma-map.md",
        ".claude/context/psyche/prompts.yaml",
        ".claude/context/psyche/valedictions.yaml",
        ".claude/context/psyche/self-knowledge/self-corrections.md",
        ".claude/context/psyche/self-knowledge/patterns-observed.md",
        ".claude/context/psyche/self-knowledge/strengths.md",
        ".claude/context/psyche/self-knowledge/weaknesses.md",
        ".claude/context/psyche/self-knowledge/corrections.md",
    ],
    "P0-constitution": [
        ".claude/proposals/jarvis-self-constitution-proposal.md",
        ".claude/proposals/self-constitution-review-2026-02-08.md",
        ".claude/proposals/EVO-2026-02-010-watcher-recovery-interrupt.md",
    ],
    "P1-context": [
        ".claude/context/session-state.md",
        ".claude/context/current-plans.md",
        ".claude/context/_index.md",
        ".claude/context/compaction-essentials.md",
        ".claude/context/configuration-summary.md",
        ".claude/context/dev-session-instructions.md",
        ".claude/context/current-priorities.md",
        ".claude/context/user-preferences.md",
        ".claude/context/reindex-queue.md",
    ],
    "P1-root": [
        "CLAUDE.md",
        "README.md",
        "jarvis_graph.md",
        "paths-registry.yaml",
    ],
    "P2-workflows": [
        ".claude/context/workflows/archon-maintenance-workflow.md",
        ".claude/context/guides/autonomous-commands-guide.md",
        ".claude/context/guides/autonomous-commands-quickstart.md",
        ".claude/context/guides/CLAUDE.md",
    ],
}


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

    graphiti = Graphiti(
        uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD,
        llm_client=llm_client, embedder=embedder, cross_encoder=NoOpCrossEncoder(),
    )
    logger.info("Graphiti initialized: Neo4j=%s, LLM=%s", NEO4J_URI, LLM_MODEL)
    return graphiti


async def ingest_file(graphiti, file_path: str, category: str) -> dict:
    from graphiti_core.nodes import EpisodeType

    full_path = os.path.join(PROJECT_DIR, file_path) if not file_path.startswith("/") else file_path
    if not os.path.exists(full_path):
        logger.warning("SKIP (not found): %s", full_path)
        return {"status": "skipped", "reason": "not found"}

    content = Path(full_path).read_text(encoding="utf-8", errors="replace")
    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS] + "\n\n[... truncated at 8000 chars]"

    name = f"Identity: {Path(file_path).stem} ({category})"
    source_desc = f"Jarvis identity corpus pre-population — {file_path}"

    start = time.time()
    try:
        result = await graphiti.add_episode(
            name=name,
            episode_body=content,
            source_description=source_desc,
            reference_time=datetime.now(timezone.utc),
            source=EpisodeType.text,
            group_id=GROUP_ID,
        )
        elapsed = time.time() - start
        entities = len(result.nodes)
        edges = len(result.edges)
        logger.info("OK (%5.1fs): %s → %d entities, %d edges", elapsed, file_path, entities, edges)
        return {"status": "ingested", "entities": entities, "edges": edges, "time": elapsed}
    except Exception as e:
        elapsed = time.time() - start
        logger.error("FAIL (%5.1fs): %s → %s", elapsed, file_path, str(e)[:200])
        return {"status": "error", "error": str(e)[:200], "time": elapsed}


async def run_full_corpus():
    graphiti = await init_graphiti()
    results = {"total": 0, "ingested": 0, "errors": 0, "skipped": 0, "start": datetime.now(timezone.utc).isoformat()}

    all_files = []
    for category, files in CORPUS.items():
        for f in files:
            all_files.append((category, f))

    results["total"] = len(all_files)
    logger.info("Starting corpus ingestion: %d files", len(all_files))

    for i, (category, file_path) in enumerate(all_files, 1):
        logger.info("[%d/%d] Processing: %s", i, len(all_files), file_path)
        result = await ingest_file(graphiti, file_path, category)
        if result["status"] == "ingested":
            results["ingested"] += 1
        elif result["status"] == "error":
            results["errors"] += 1
        else:
            results["skipped"] += 1

    results["end"] = datetime.now(timezone.utc).isoformat()
    results["total_time"] = sum(r.get("time", 0) for r in [result])

    Path(MARKER_FILE).write_text(json.dumps(results, indent=2))
    logger.info("Corpus ingestion complete: %d ingested, %d errors, %d skipped",
                results["ingested"], results["errors"], results["skipped"])
    return results


async def run_single_file(file_path: str):
    graphiti = await init_graphiti()
    result = await ingest_file(graphiti, file_path, "manual")
    return result


async def run_changed_only():
    graphiti = await init_graphiti()
    marker_time = 0
    if os.path.exists(MARKER_FILE):
        marker_time = os.path.getmtime(MARKER_FILE)

    changed = []
    for category, files in CORPUS.items():
        for f in files:
            full_path = os.path.join(PROJECT_DIR, f)
            if os.path.exists(full_path) and os.path.getmtime(full_path) > marker_time:
                changed.append((category, f))

    if not changed:
        logger.info("No files changed since last ingestion")
        return {"status": "no_changes"}

    logger.info("Re-ingesting %d changed files", len(changed))
    for category, file_path in changed:
        await ingest_file(graphiti, file_path, category)

    Path(MARKER_FILE).write_text(json.dumps({"last_reingestion": datetime.now(timezone.utc).isoformat(), "files": len(changed)}))
    return {"status": "reingested", "count": len(changed)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Graphiti identity corpus pre-population")
    parser.add_argument("--file", type=str, help="Single file to ingest")
    parser.add_argument("--changed-only", action="store_true", help="Only re-ingest modified files")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    file_handler = logging.FileHandler(LOG_FILE)
    file_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    logging.getLogger().addHandler(file_handler)

    if args.file:
        asyncio.run(run_single_file(args.file))
    elif args.changed_only:
        asyncio.run(run_changed_only())
    else:
        asyncio.run(run_full_corpus())
