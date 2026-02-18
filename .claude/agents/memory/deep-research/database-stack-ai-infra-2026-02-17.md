# Memory: Database Stack Research — 2026-02-17

## Topic
Database architecture for Mac Studio M4 Max AI infrastructure (Docker-based)

## Key Conclusions

### Vector DBs
- Qdrant = best production vector DB (native ARM64, HNSW, official MCP, tiered multitenancy v1.16+)
- pgvector + ParadeDB = best under 10M vectors (unified, ACID, BM25 hybrid, SQL joins)
- ChromaDB = prototyping only (not production scale)
- Weaviate = best hybrid search (2.0 with learned fusion) but heavier
- LanceDB = best for ML pipeline / multimodal feature stores

### Graph DBs
- Neo4j CE = best for persistent knowledge graphs (disk-based, MCP available)
- Graphiti (Zep AI) = best AI agent memory layer (bi-temporal, conflict-resolving, runs on Neo4j)
- Memgraph = faster than Neo4j (3-41x) but RAM-bound — not ideal for growing knowledge graphs

### General Persistence
- PostgreSQL 16 = mandatory (n8n requires it for production)
- Redis Stack = agent working memory + n8n queue mode + pub/sub

### Multi-Model
- SurrealDB = viable all-in-one alternative with official MCP, but loses Graphiti support

### MCP Availability
All recommended DBs have production MCP servers:
- Qdrant: `qdrant/mcp-server-qdrant` (official)
- PostgreSQL: `crystaldba/postgres-mcp` (community, active)
- Neo4j: `mcp/neo4j-memory` (Neo4j Labs official)
- Graphiti: `getzep/graphiti` mcp_server (Zep AI official)
- SurrealDB: `surrealdb.com/mcp` (official)

## Resource Budget (128 GB host)
- PostgreSQL: 6 GB
- Qdrant: 4-8 GB
- Neo4j: 6 GB
- Redis: 2 GB
- n8n: 2 GB
- DB stack total: ~20-27 GB
- Available for LLM inference: ~90-100 GB

## Report Location
/Users/nathanielcannon/Claude/Jarvis/.claude/reports/research/database-stack-ai-infrastructure-2026-02-17.md
