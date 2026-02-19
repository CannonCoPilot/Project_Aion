# Session 26 Summary — Graphiti MCP + Two-Tier Memory Architecture

**Date**: 2026-02-18
**Duration**: Multi-context-window session (context restoration partway through)
**Branch**: Project_Aion
**Key Commits**: 2241ed0 (Graphiti MCP server), 8b67fa5 (lifecycle wiring), pending (architecture rework)

## What Was Accomplished

Session 26 completed Milestone 4 (Graphiti Cross-Session Memory) for the Mac Studio infrastructure roadmap. The core deliverable was a jarvis-graphiti FastMCP 3.0 server providing 6 MCP tools: search, search_nodes, add_episode, get_episodes, get_entity, and graph_stats. The server uses graphiti-core 0.28.0 with Neo4j for graph storage, a custom OllamaNoThinkClient for Qwen3 LLM inference (suppressing thinking mode via extra_body={'think': False}), and OpenAI-compatible embeddings via qwen3-embedding:4b (2560-dimensional vectors).

Five compatibility issues were solved during development: (1) OpenAIRerankerClient requiring an API key — replaced with NoOpCrossEncoder using RRF; (2) Pydantic validation requiring CrossEncoderClient subclass; (3) EMBEDDING_DIM mismatch (graphiti-core defaults to 1024, Qwen3 outputs 2560) — must set explicitly; (4) Neo4j EagerResult access pattern for graph_stats; (5) LiteLLM rejecting encoding_format: 'base64' for Ollama embeddings — embedder points direct to Ollama.

## Key Architectural Decision: Two-Tier Memory

After attempting session exit capture via Graphiti (which took >5 minutes due to 5-10 sequential LLM calls through qwen3-32b), the architecture was redesigned per user direction into two tiers:

- **Fast path (Qdrant/jarvis-rag, ~2-3s)**: Session summaries are written to `.claude/context/sessions/` and ingested into Qdrant at exit. These provide RAG retrieval for next-session context.
- **Slow path (Graphiti, ~20-30s with qwen3-8b)**: Deep knowledge graph ingestion belongs in `/reflect` command (Phase 5), which synthesizes session summaries, JSONL context, priorities, project aims, and planning docs into Graphiti episodes. This runs during idle/AFK periods or end-session reflection cycles.

The default Graphiti LLM was switched from qwen3-32b-nothink to qwen3-8b-nothink. Benchmarks show: qwen3-32b = 4.3s/call, qwen3-8b = 2.7s/call. The bottleneck is pipeline depth (5-10 sequential calls), not per-call latency.

## Current State

- M0-M4 complete: Foundation, Models, Database, RAG, Graphiti — all operational
- M5 (n8n Workflows) is next priority
- Graph: 36 entity nodes, 29 entity edges, 4 episodic nodes in Neo4j
- Qdrant: 6,491 vectors across 4 collections
- 7 MCPs registered: qdrant-mcp, postgres-mcp, neo4j, local-rag, jarvis-rag, jarvis-graphiti + standard set
- Session state needs archival (270+ lines)
