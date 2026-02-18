"""
Jarvis Graphiti MCP Server — Milestone 4
Cross-session knowledge graph memory via graphiti-core + Neo4j.

Exposes graph operations as MCP tools:
  search         — hybrid search returning facts (EntityEdge)
  search_nodes   — search returning entity nodes
  add_episode    — ingest new knowledge into the graph
  get_episodes   — retrieve recent episodic nodes
  get_entity     — look up a specific entity and its edges
  graph_stats    — collection/node/edge counts

Uses OllamaNoThinkClient (Qwen3-32B via LiteLLM) for LLM,
OpenAIEmbedder (qwen3-embedding:4b direct to Ollama) for embeddings.
Neo4j for graph storage.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

from fastmcp import FastMCP
from graphiti_core.cross_encoder.client import CrossEncoderClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3-32b-nothink")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:4b")
EMBED_DIM = int(os.getenv("EMBEDDING_DIM", "2560"))
DEFAULT_GROUP_ID = os.getenv("GRAPHITI_GROUP_ID", "jarvis-core")

mcp = FastMCP("jarvis-graphiti")

# --- Lazy Singleton ---
_graphiti_instance = None
_init_lock = asyncio.Lock()


class NoOpCrossEncoder(CrossEncoderClient):
    """No-op cross-encoder that returns passages with uniform scores.

    Local Qwen3 models can't serve as cross-encoders, so we skip reranking
    and rely on RRF (Reciprocal Rank Fusion) which is purely algorithmic.
    """

    async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
        return [(p, 1.0) for p in passages]


async def get_graphiti():
    """Get or initialize the Graphiti singleton."""
    global _graphiti_instance
    if _graphiti_instance is not None:
        return _graphiti_instance

    async with _init_lock:
        # Double-check after acquiring lock
        if _graphiti_instance is not None:
            return _graphiti_instance

        from graphiti_core import Graphiti
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
        from ollama_nothink_client import OllamaNoThinkClient

        llm_config = LLMConfig(
            api_key="not-needed",
            base_url=LITELLM_BASE_URL,
            model=LLM_MODEL,
        )
        llm_client = OllamaNoThinkClient(config=llm_config)

        embedder_config = OpenAIEmbedderConfig(
            api_key="not-needed",
            base_url=OLLAMA_BASE_URL,
            embedding_model=EMBED_MODEL,
            embedding_dim=EMBED_DIM,
        )
        embedder = OpenAIEmbedder(config=embedder_config)

        graphiti = Graphiti(
            uri=NEO4J_URI,
            user=NEO4J_USER,
            password=NEO4J_PASSWORD,
            llm_client=llm_client,
            embedder=embedder,
            cross_encoder=NoOpCrossEncoder(),
        )

        logger.info("Graphiti initialized: Neo4j=%s, LLM=%s, Embedder=%s",
                     NEO4J_URI, LLM_MODEL, EMBED_MODEL)
        _graphiti_instance = graphiti
        return graphiti


def edge_to_dict(edge) -> dict:
    """Convert an EntityEdge to a serializable dict."""
    return {
        "uuid": edge.uuid,
        "fact": edge.fact,
        "name": edge.name,
        "source_node_uuid": edge.source_node_uuid,
        "target_node_uuid": edge.target_node_uuid,
        "episodes": edge.episodes[:5] if edge.episodes else [],
        "valid_at": edge.valid_at.isoformat() if edge.valid_at else None,
        "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
        "created_at": edge.created_at.isoformat() if edge.created_at else None,
    }


def node_to_dict(node) -> dict:
    """Convert an EntityNode to a serializable dict."""
    return {
        "uuid": node.uuid,
        "name": node.name,
        "group_id": node.group_id,
        "labels": node.labels,
        "summary": getattr(node, "summary", ""),
        "created_at": node.created_at.isoformat() if node.created_at else None,
    }


def episode_to_dict(ep) -> dict:
    """Convert an EpisodicNode to a serializable dict."""
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "source": ep.source.value if ep.source else "unknown",
        "source_description": getattr(ep, "source_description", ""),
        "content": (ep.content[:2000] if ep.content else ""),
        "valid_at": ep.valid_at.isoformat() if ep.valid_at else None,
        "created_at": ep.created_at.isoformat() if ep.created_at else None,
    }


# --- MCP Tools ---

@mcp.tool()
async def search(
    query: str,
    group_id: str | None = None,
    num_results: int = 10,
) -> list[dict]:
    """Search the Jarvis knowledge graph for facts.

    Returns relevant facts (edges) extracted from past sessions, architectural
    decisions, and ingested documents. Uses hybrid search (semantic + BM25)
    with RRF reranking.

    Args:
        query: Natural language search query.
        group_id: Filter to a specific group. Default: jarvis-core.
        num_results: Number of results (1-20).
    """
    graphiti = await get_graphiti()
    num_results = max(1, min(20, num_results))
    group_ids = [group_id or DEFAULT_GROUP_ID]

    edges = await graphiti.search(
        query=query,
        group_ids=group_ids,
        num_results=num_results,
    )

    return [edge_to_dict(e) for e in edges]


@mcp.tool()
async def search_nodes(
    query: str,
    group_id: str | None = None,
    num_results: int = 10,
) -> dict:
    """Search for entity nodes and their relationships in the knowledge graph.

    Returns entities (nodes), their facts (edges), and related episodes.
    More comprehensive than basic search — useful when you need to understand
    an entity's full context.

    Args:
        query: Natural language search query.
        group_id: Filter to a specific group. Default: jarvis-core.
        num_results: Max results per category (1-20).
    """
    from graphiti_core.search.search_config_recipes import COMBINED_HYBRID_SEARCH_RRF

    graphiti = await get_graphiti()
    num_results = max(1, min(20, num_results))
    group_ids = [group_id or DEFAULT_GROUP_ID]

    # Override the limit in the config
    config = COMBINED_HYBRID_SEARCH_RRF.model_copy(update={"limit": num_results})

    results = await graphiti.search_(
        query=query,
        config=config,
        group_ids=group_ids,
    )

    return {
        "edges": [edge_to_dict(e) for e in results.edges],
        "nodes": [node_to_dict(n) for n in results.nodes],
        "episodes": [episode_to_dict(ep) for ep in results.episodes],
        "communities": [
            {"name": c.name, "summary": c.summary}
            for c in results.communities
        ],
    }


@mcp.tool()
async def add_episode(
    name: str,
    content: str,
    source_description: str,
    group_id: str | None = None,
    source_type: str = "text",
) -> dict:
    """Add a new episode (knowledge) to the Jarvis knowledge graph.

    The LLM will extract entities, relationships, and facts from the content
    and integrate them into the graph. Use for session summaries, architectural
    decisions, or any knowledge worth persisting across sessions.

    Args:
        name: Short descriptive name for the episode (e.g., "Session 26 summary").
        content: The text content to extract knowledge from.
        source_description: Where this content came from (e.g., "Jarvis session log").
        group_id: Group to assign this episode to. Default: jarvis-core.
        source_type: One of: text, message, json. Default: text.
    """
    from graphiti_core.nodes import EpisodeType

    type_map = {
        "text": EpisodeType.text,
        "message": EpisodeType.message,
        "json": EpisodeType.json,
    }
    episode_type = type_map.get(source_type, EpisodeType.text)

    graphiti = await get_graphiti()

    result = await graphiti.add_episode(
        name=name,
        episode_body=content,
        source_description=source_description,
        reference_time=datetime.now(timezone.utc),
        source=episode_type,
        group_id=group_id or DEFAULT_GROUP_ID,
    )

    return {
        "status": "ingested",
        "episode_uuid": result.episode.uuid,
        "entities_extracted": len(result.nodes),
        "edges_created": len(result.edges),
        "nodes": [{"name": n.name, "uuid": n.uuid} for n in result.nodes],
        "facts": [e.fact for e in result.edges],
    }


@mcp.tool()
async def get_episodes(
    last_n: int = 10,
    group_id: str | None = None,
) -> list[dict]:
    """Retrieve the most recent episodes from the knowledge graph.

    Episodes are atomic units of ingested knowledge — session logs, decisions,
    documents. Useful for understanding what knowledge has been captured.

    Args:
        last_n: Number of recent episodes to retrieve (1-50).
        group_id: Filter to a specific group. Default: jarvis-core.
    """
    graphiti = await get_graphiti()
    last_n = max(1, min(50, last_n))
    group_ids = [group_id or DEFAULT_GROUP_ID]

    episodes = await graphiti.retrieve_episodes(
        reference_time=datetime.now(timezone.utc),
        last_n=last_n,
        group_ids=group_ids,
    )

    return [episode_to_dict(ep) for ep in episodes]


@mcp.tool()
async def get_entity(
    entity_uuid: str,
) -> dict:
    """Look up a specific entity node and all its connected edges.

    Args:
        entity_uuid: The UUID of the entity node to look up.
    """
    from graphiti_core.nodes import EntityNode
    from graphiti_core.edges import EntityEdge

    graphiti = await get_graphiti()
    driver = graphiti.driver

    node = await EntityNode.get_by_uuid(driver, entity_uuid)
    edges = await EntityEdge.get_by_node_uuid(driver, entity_uuid)

    return {
        "node": node_to_dict(node),
        "edges": [edge_to_dict(e) for e in edges],
        "edge_count": len(edges),
    }


@mcp.tool()
async def graph_stats(
    group_id: str | None = None,
) -> dict:
    """Get knowledge graph statistics — node, edge, and episode counts.

    Args:
        group_id: Filter to a specific group. Default: all groups.
    """
    graphiti = await get_graphiti()
    driver = graphiti.driver

    # Run Cypher queries for counts via Neo4j EagerResult
    group_filter = ""
    params = {}
    if group_id:
        group_filter = " WHERE n.group_id = $group_id"
        params["group_id"] = group_id

    entity_result = await driver.execute_query(
        f"MATCH (n:Entity){group_filter} RETURN count(n) as cnt", params=params
    )
    episode_result = await driver.execute_query(
        f"MATCH (n:Episodic){group_filter} RETURN count(n) as cnt", params=params
    )
    rel_filter = " WHERE r.group_id = $group_id" if group_id else ""
    edge_result = await driver.execute_query(
        f"MATCH ()-[r:RELATES_TO]->(){rel_filter} RETURN count(r) as cnt",
        params=params,
    )
    community_result = await driver.execute_query(
        f"MATCH (n:Community){group_filter} RETURN count(n) as cnt", params=params
    )

    def extract_count(eager_result):
        """Extract count from Neo4j EagerResult."""
        try:
            records = eager_result.records
            if records:
                return records[0]["cnt"]
        except (AttributeError, IndexError, KeyError):
            pass
        return 0

    return {
        "entity_nodes": extract_count(entity_result),
        "episodic_nodes": extract_count(episode_result),
        "entity_edges": extract_count(edge_result),
        "community_nodes": extract_count(community_result),
        "group_id": group_id or "all",
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
