# Research Report: Database Stack for AI Infrastructure on Mac Studio M4 Max

**Date**: 2026-02-17
**Scope**: Comprehensive evaluation of vector databases, graph databases, relational databases, and unified architectures for a Mac Studio M4 Max (128 GB unified memory) running a Docker-based AI infrastructure stack, including RAG pipelines, knowledge graphs, agent memory, and n8n workflow automation.

---

## Executive Summary

The Mac Studio M4 Max with 128 GB of unified memory is an exceptional AI infrastructure platform. With 500+ GB/s memory bandwidth and seamless NUMA-free access, it can simultaneously host LLM inference (70B quantized models use ~50-80 GB), vector search, relational persistence, graph traversal, and workflow automation — all without swapping.

The primary architectural recommendation is a **two-tier stack**: PostgreSQL with pgvector + ParadeDB as the unified relational/vector/hybrid-search backbone, supplemented by Qdrant for high-performance semantic search collections that outgrow pgvector, Neo4j Community Edition as the graph persistence layer running Graphiti for AI agent temporal memory, and Redis for agent working memory and workflow state. This keeps operational complexity manageable while covering all stated use cases.

For teams that want to minimize services and accept modest performance trade-offs at smaller scale, a **single-service path** using SurrealDB (multi-model: document + graph + vector + relational in one Rust binary) is viable with an official MCP server already available.

All primary recommended databases have production-quality MCP servers enabling Claude/Jarvis agents to query them directly. The full Docker Compose stack can run comfortably within 20-25 GB of RAM, leaving 50-80 GB for LLM inference.

---

## Key Findings

### Finding 1: Vector Database Landscape — Qdrant Leads for Production

Qdrant is the strongest choice for a dedicated vector database in a production Mac Studio setup. Written in Rust, it provides native ARM64 Docker images, HNSW indexing, sparse vector support for hybrid (BM25 + dense) search via its Query API, asymmetric quantization (24x compression with minimal accuracy loss), and the most mature MCP server (`qdrant/mcp-server-qdrant`, Apache 2.0, officially maintained).

ChromaDB underwent a complete Rust rewrite in 2025 delivering 4x write/query speed improvements and remains excellent for prototyping, but is not designed for production workloads beyond 10 million vectors.

LanceDB (columnar Lance format, Apache 2.0) is purpose-built for ML pipelines and multimodal data (images, audio, text) and excels at feature stores. Its embedded/serverless architecture avoids Docker overhead for embedded use cases.

Milvus Standalone requires at minimum 8 GB RAM dedicated to Docker plus etcd overhead, making it the heaviest option for a single-node Mac Studio.

Weaviate is notable for Hybrid Search 2.0 (2025): a complete rewrite combining BM25 + vector search + learned ranking in a single optimized index. Its Go-based architecture is highly performant, and it integrates vectorizers from OpenAI, Cohere, HuggingFace natively.

**Sources**: [Zilliz Comparison](https://zilliz.com/comparison/chroma-vs-lancedb), [LiquidMetal AI Comparison](https://liquidmetal.ai/casesAndBlogs/vector-comparison/), [Qdrant 2025 Recap](https://qdrant.tech/blog/2025-recap/), [Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant)

---

### Finding 2: pgvector + ParadeDB — The Case for PostgreSQL as Vector Backend

For most RAG workloads under ~10 million vectors (which describes the vast majority of single-server AI projects), PostgreSQL with pgvector is the pragmatic winner:
- Single operational system: one monitoring stack, one backup system, one HA plan
- Native SQL joins between vectors and metadata — no ETL synchronization
- pgvector supports HNSW indexing (logarithmic complexity like dedicated DBs), cosine/L2/inner product metrics, and dimensions up to 16,000
- ParadeDB's `pg_search` extension (built on Tantivy, Rust) adds true BM25 indexing with Reciprocal Rank Fusion (RRF) hybrid search — complete hybrid search without leaving PostgreSQL
- Instacart migrated from Elasticsearch to pgvector in 2025: 80% cost savings, 6% reduction in zero-result searches

The n8n workflow automation tool also requires PostgreSQL (v13+ recommended) for production deployments, meaning PostgreSQL is mandatory in the stack regardless of vector strategy.

**Performance threshold**: pgvector handles sub-100ms queries up to ~10M vectors. Above 50M vectors, purpose-built databases (Qdrant, Weaviate) become significantly faster.

**Sources**: [dbadataverse pgvector analysis](https://dbadataverse.com/poetry/2025/12/postgresql-beat-vector-databases-dba-perspective), [instaclustr pgvector guide](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/), [ParadeDB hybrid search](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)

---

### Finding 3: Graph Database — Neo4j + Graphiti for AI Agent Memory

**Neo4j Community Edition** is the right choice for the graph layer:
- Mature, disk-based (not RAM-bound like Memgraph), handles large persistent graphs exceeding available RAM
- Native Docker support with official images; memory tunable via environment variables (defaults are too low at 512 MB — raise page cache to 4+ GB)
- Graphiti (by Zep AI) runs on top of Neo4j: bi-temporal knowledge graph framework specifically designed for AI agent memory
- Graphiti MCP server (`getzep/graphiti`) is in the official MCP server directory, providing episode management, entity search, semantic/hybrid graph search, and group management — directly queryable by Claude agents
- Neo4j also has its own MCP server (`mcp/neo4j-memory`) for persistent memory via knowledge graphs

**Graphiti's key differentiator**: bi-temporal model (when-event-occurred vs when-ingested), automatic conflict resolution using semantic similarity, and real-time incremental ingestion without batch recomputation. This makes it far superior to static RAG for agent memory.

**Memgraph** is 3-41x faster than Neo4j for real-time streaming workloads but is RAM-bound (dataset must fit in memory) and more suited to fraud detection/streaming analytics than persistent knowledge graphs. On a 128 GB Mac Studio it would work, but adds operational risk as dataset grows.

**Sources**: [Graphiti GitHub](https://github.com/getzep/graphiti), [Neo4j Graphiti Blog](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/), [Memgraph vs Neo4j comparison](https://medium.com/decoded-by-datacast/memgraph-vs-neo4j-in-2025-real-time-speed-or-battle-tested-ecosystem-66b4c34b117d), [Neo4j MCP](https://neo4j.com/developer/genai-ecosystem/model-context-protocol-mcp/)

---

### Finding 4: Redis — Agent Working Memory and Workflow Coordination

Redis is the optimal choice for:
- AI agent short-term/session memory (in-memory, microsecond access)
- Cross-agent state coordination and message passing (Redis Streams)
- Workflow queue state (n8n supports Redis for queue-mode scaling)
- Semantic caching (Redis Vector Library for embedding-based cache hits)
- Pub/sub between agents and pipeline stages

Redis has released an official `agent-memory-server` (Docker image: `redislabs/agent-memory-server`) in 2025 that handles working memory, episodic memory, and long-term semantic retrieval in one container. A Stack Overflow 2025 survey found Redis is used by 43% of developers for AI agent memory, ahead of ChromaDB and pgvector.

n8n specifically recommends adding Redis alongside PostgreSQL for production queue-mode deployments.

**Sources**: [Redis Agent Memory](https://redis.io/blog/ai-agent-memory-stateful-systems/), [Redis LangGraph integration](https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/), [n8n PostgreSQL docs](https://docs.n8n.io/hosting/configuration/supported-databases-settings/)

---

### Finding 5: SurrealDB — The Single-Service Alternative

SurrealDB (Rust, single binary) combines document + graph + relational + vector + key-value + time-series + geospatial in one engine. In 2025:
- Official MCP server available at `surrealdb.com/mcp` with full Claude Desktop integration
- Native Docker support with RocksDB persistence backend
- Auth enabled by default since v2.0
- Separates storage from compute for independent scaling

**When to choose SurrealDB**: teams willing to trade best-in-class performance per domain for drastically fewer running services. Avoids synchronization between PostgreSQL, Qdrant, and Neo4j.

**When not to choose SurrealDB**: when you need Graphiti's temporally-aware agent memory (requires Neo4j/FalkorDB backend), production-scale HNSW performance of Qdrant, or n8n's requirement for PostgreSQL specifically.

**Sources**: [SurrealDB GitHub](https://github.com/surrealdb/surrealdb), [SurrealDB MCP](https://surrealdb.com/mcp)

---

### Finding 6: MCP Server Status — All Primary DBs Covered

Every database in the recommended stack has a production-quality MCP server:

| Database | MCP Server | Maintainer | Transport |
|---|---|---|---|
| Qdrant | `qdrant/mcp-server-qdrant` | Official (Qdrant) | stdio/HTTP |
| PostgreSQL | `crystaldba/postgres-mcp` | Community (active) | stdio |
| Neo4j | `mcp/neo4j-memory` | Official (Neo4j Labs) | stdio/HTTP |
| Graphiti | `getzep/graphiti` mcp_server | Official (Zep AI) | stdio/HTTP |
| Redis | Via LangGraph Redis integration | Community | N/A (library) |
| SurrealDB | `surrealdb.com/mcp` | Official (SurrealDB) | stdio/HTTP |
| ChromaDB | `chroma-core/chroma-mcp` | Official (Chroma) | stdio |

**Sources**: [MCP Servers GitHub](https://github.com/modelcontextprotocol/servers), [Qdrant MCP](https://pypi.org/project/mcp-server-qdrant/), [Neo4j MCP](https://hub.docker.com/r/mcp/neo4j-memory), [Graphiti MCP docs](https://help.getzep.com/graphiti/getting-started/mcp-server)

---

### Finding 7: Hybrid Search — What Each DB Supports

| Database | Keyword (BM25) | Dense Vector | Hybrid Fusion | Notes |
|---|---|---|---|---|
| Qdrant | Sparse vectors | HNSW | Query API (RRF) | Best standalone hybrid |
| Weaviate | BM25 | HNSW | Hybrid Search 2.0 | Learned ranking fusion |
| PostgreSQL + pgvector + ParadeDB | `pg_search` BM25 | HNSW | RRF in SQL | Fully within Postgres |
| ChromaDB | Basic | HNSW | Limited | Not production hybrid |
| LanceDB | Full-text | HNSW | Yes | Good for ML pipelines |
| Milvus | Sparse | HNSW | Yes | Heavy resource use |

**Sources**: [Qdrant hybrid search](https://qdrant.tech/articles/hybrid-search/), [Weaviate Hybrid Search 2.0](https://app.ailog.fr/en/blog/news/weaviate-hybrid-search-2), [ParadeDB hybrid](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)

---

### Finding 8: Docker on Apple Silicon — Key Constraints

- Qdrant provides native ARM64 Docker images — no Rosetta overhead
- Neo4j provides ARM-compatible images (Debian-packaged)
- Memgraph provides ARM64 Docker images (Debian 11 binary)
- Milvus GPU-accelerated Docker images are Linux x86_64 only (GPU indexing unavailable on Mac)
- Docker's virtualization layer on macOS adds overhead; volume mount strategy is critical (use named volumes, not bind mounts for databases)
- Qdrant supports GPU indexing via Vulkan API v1.3 for Apple Silicon, but only in native (non-Docker) deployment

For Apple Silicon MPS (Metal Performance Shaders) acceleration of *embedding generation* (not DB indexing): configure `MPS_DEVICE_ENABLE=1` in your embedding service container environment.

**Sources**: [Qdrant installation docs](https://qdrant.tech/documentation/guides/installation/), [Docker Mac performance guide](https://m.academy/articles/docker-desktop-performance-guide-mac/), [Apple Silicon Docker](https://oneuptime.com/blog/post/2026-01-16-docker-mac-apple-silicon/view)

---

## Comparison Matrix: Vector Databases

| Aspect | ChromaDB | Qdrant | LanceDB | Weaviate | pgvector | Milvus Standalone |
|---|---|---|---|---|---|---|
| Language | Rust (2025 rewrite) | Rust | Rust | Go | C (extension) | Go |
| Deployment | Embedded/Server | Client-Server | Embedded/Server | Client-Server | PostgreSQL ext | Docker (3 containers) |
| ARM64 Docker | Yes | Yes (native) | No Docker needed | Yes | Yes (via PG) | Yes (no GPU) |
| Min RAM (Docker) | ~512 MB | ~512 MB | In-process | ~1 GB | ~256 MB | 8 GB |
| Max practical scale | ~10M vectors | Billions | Large ML datasets | Billions | ~10M vectors | Billions |
| Hybrid Search | Limited | Yes (Query API) | Yes | Yes (v2.0, best) | Yes (ParadeDB) | Yes |
| BM25 Keyword | No | Sparse vectors | Yes | Yes | Via pg_search | Sparse vectors |
| HNSW Index | Yes | Yes | Yes | Yes | Yes | Yes |
| Multi-tenancy | Collection-based | Payload + tiered sharding | Namespace | Collection | Schema/Row-level | Partition |
| MCP Server | Official (chroma-mcp) | Official (qdrant) | Community | Community | Official (postgres-mcp) | Community |
| MCP Quality | Production | Production | Beta | Beta | Production | Beta |
| Ease of Use | Highest | High | High | Medium | High (SQL) | Medium |
| Best For | Prototyping | Production RAG | ML pipelines | Enterprise hybrid | Unified stack | Massive scale |
| License | Apache 2.0 | Apache 2.0 | Apache 2.0 | BSD-3 | PostgreSQL | Apache 2.0 |

---

## Comparison Matrix: Graph Databases

| Aspect | Neo4j Community | Memgraph | Graphiti (framework) | SurrealDB |
|---|---|---|---|---|
| Type | Graph DB | Graph DB | Knowledge graph framework | Multi-model DB |
| Storage | Disk (persistent) | In-memory + WAL | Uses Neo4j/FalkorDB/etc. | RocksDB (disk) |
| ARM64 Docker | Yes | Yes | Yes (Docker Compose) | Yes |
| Min RAM | 2 GB (default low) | Dataset-dependent | Via backend | ~512 MB |
| Recommended RAM | 4-8 GB | Dataset fits in RAM | Via backend | 1-2 GB |
| Query Language | Cypher | openCypher | Semantic + graph API | SurrealQL |
| MCP Server | Official (neo4j-memory) | Community | Official (getzep/graphiti) | Official (surrealdb.com/mcp) |
| AI Agent Memory | Via MCP | Via custom | Native design | Via MCP |
| Temporal Awareness | Limited | Limited | Bi-temporal (native) | Limited |
| Conflict Resolution | Manual | Manual | Automatic (semantic) | Manual |
| Best For | Persistent knowledge graphs | Real-time streaming | AI agent dynamic memory | All-in-one simplicity |
| License | GPL-3 (Community) | BSL | Apache 2.0 | Apache 2.0 |

---

## Recommended Architecture for Mac Studio M4 Max

### Primary Recommendation: Tiered Specialist Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    MAC STUDIO M4 MAX (128 GB)                   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   LLM Inference   │  │  Embedding Svc   │  │  n8n + API   │  │
│  │  (Ollama/Docker  │  │  (MPS-enabled)   │  │   Services   │  │
│  │   Model Runner)  │  │                  │  │              │  │
│  │    50-80 GB      │  │    1-2 GB        │  │   1-2 GB     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    DATABASE LAYER                         │   │
│  │                                                          │   │
│  │  ┌─────────────────────┐  ┌──────────┐  ┌───────────┐   │   │
│  │  │  PostgreSQL 16      │  │  Qdrant  │  │   Neo4j   │   │   │
│  │  │  + pgvector         │  │  (prod   │  │  CE +     │   │   │
│  │  │  + pg_search (BM25) │  │   RAG)   │  │ Graphiti  │   │   │
│  │  │  + n8n backend      │  │          │  │           │   │   │
│  │  │    4-6 GB           │  │  4-8 GB  │  │  4-6 GB   │   │   │
│  │  └─────────────────────┘  └──────────┘  └───────────┘   │   │
│  │                                                          │   │
│  │  ┌─────────────────────┐                                 │   │
│  │  │  Redis              │                                 │   │
│  │  │  (agent memory,     │                                 │   │
│  │  │   workflow state)   │                                 │   │
│  │  │    1-2 GB           │                                 │   │
│  │  └─────────────────────┘                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  macOS overhead: ~8-12 GB                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow**:
- RAG retrieval under 10M vectors: PostgreSQL + pgvector + pg_search (single query, ACID, SQL joins)
- RAG retrieval over 10M vectors or requiring highest throughput: Qdrant (dedicated HNSW, tiered multitenancy)
- Agent episodic/temporal memory: Graphiti MCP → Neo4j (bi-temporal, conflict-resolving)
- Agent working memory / session state: Redis (microsecond access)
- Workflow orchestration state: n8n → PostgreSQL
- Agent queries to any DB: MCP servers (Qdrant MCP, postgres-mcp, neo4j-memory MCP, Graphiti MCP)

### Alternative: Minimal Single-Service Stack

If operational simplicity is the top priority and scale is modest:
- **SurrealDB** replaces PostgreSQL + pgvector + Neo4j (vector + graph + document + relational in one)
- **Redis** retained for working memory and pub/sub
- **n8n** still requires PostgreSQL — run a lightweight PG instance just for n8n
- Trade-off: lose Graphiti's temporal agent memory, lose Qdrant's production HNSW performance

---

## Docker Compose Stack Design

```yaml
# docker-compose.yml — AI Infrastructure Stack
# Mac Studio M4 Max (128 GB) — Resource budgets annotated

version: "3.9"

services:
  # ─── RELATIONAL + VECTOR + FULL-TEXT ───────────────────────────
  postgres:
    image: pgvector/pgvector:pg16
    # pgvector pre-installed; add pg_search via ParadeDB image for BM25
    # Alternative: paradedb/paradedb:latest (includes pg_search + pgvector)
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${PG_USER:-jarvis}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ${PG_DB:-jarvis}
      # Performance tuning for 128 GB host
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8"
    command: >
      postgres
        -c shared_buffers=2GB
        -c effective_cache_size=6GB
        -c work_mem=256MB
        -c maintenance_work_mem=1GB
        -c max_connections=200
        -c wal_level=replica
        -c max_wal_senders=3
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 6G      # 4-6 GB budget
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER:-jarvis}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── VECTOR DATABASE (HIGH-PERFORMANCE RAG) ────────────────────
  qdrant:
    image: qdrant/qdrant:latest
    # Native ARM64 image — no Rosetta overhead
    container_name: qdrant
    restart: unless-stopped
    environment:
      QDRANT__SERVICE__GRPC_PORT: 6334
      QDRANT__LOG_LEVEL: INFO
    volumes:
      - qdrant_data:/qdrant/storage
      - ./qdrant-config:/qdrant/config
    ports:
      - "6333:6333"   # REST API
      - "6334:6334"   # gRPC API
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 8G      # 4-8 GB budget (scale with collection size)
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6333/healthz || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5

  # ─── GRAPH DATABASE (KNOWLEDGE GRAPH + AGENT MEMORY) ───────────
  neo4j:
    image: neo4j:latest
    # Community Edition — no -enterprise suffix
    container_name: neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      # Override low defaults — critical for production
      NEO4J_server_memory_pagecache__size: 4G
      NEO4J_server_memory_heap_initial__size: 1G
      NEO4J_server_memory_heap_max__size: 4G
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_plugins:/plugins
    ports:
      - "7474:7474"   # HTTP browser
      - "7687:7687"   # Bolt protocol
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 6G      # 4-6 GB budget
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "wget -O /dev/null -q http://localhost:7474 || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 10

  # ─── GRAPHITI MCP SERVER (AI AGENT KNOWLEDGE GRAPH) ────────────
  graphiti:
    image: python:3.12-slim
    # Or use: docker compose -f graphiti/docker/docker-compose-neo4j.yml
    container_name: graphiti-mcp
    restart: unless-stopped
    working_dir: /app
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: ${NEO4J_PASSWORD}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      # Or set ANTHROPIC_API_KEY for Claude embedding
    volumes:
      - ./graphiti:/app
    ports:
      - "8000:8000"   # MCP HTTP SSE endpoint
    networks:
      - ai-net
    depends_on:
      neo4j:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2"

  # ─── REDIS (AGENT MEMORY + WORKFLOW STATE + CACHING) ───────────
  redis:
    image: redis/redis-stack:latest
    # redis-stack includes RedisSearch + RedisJSON for vector capabilities
    container_name: redis
    restart: unless-stopped
    command: >
      redis-server
        --maxmemory 2gb
        --maxmemory-policy allkeys-lru
        --appendonly yes
        --appendfilename appendonly.aof
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"   # Redis protocol
      - "8001:8001"   # Redis Insight UI
    networks:
      - ai-net
    deploy:
      resources:
        limits:
          memory: 2G      # 1-2 GB budget
          cpus: "2"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── N8N WORKFLOW AUTOMATION ────────────────────────────────────
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: ${PG_USER:-jarvis}
      DB_POSTGRESDB_PASSWORD: ${PG_PASSWORD}
      DB_POSTGRESDB_POOL_SIZE: 20
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      EXECUTIONS_MODE: queue        # Enable queue mode for scaling
      QUEUE_BULL_REDIS_HOST: redis
      QUEUE_BULL_REDIS_PORT: 6379
      WEBHOOK_URL: http://localhost:5678
    volumes:
      - n8n_data:/home/node/.n8n
    ports:
      - "5678:5678"
    networks:
      - ai-net
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"

# ─── VOLUMES ──────────────────────────────────────────────────────
volumes:
  postgres_data:
    driver: local
  qdrant_data:
    driver: local
  neo4j_data:
    driver: local
  neo4j_logs:
    driver: local
  neo4j_plugins:
    driver: local
  redis_data:
    driver: local
  n8n_data:
    driver: local

# ─── NETWORKS ─────────────────────────────────────────────────────
networks:
  ai-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/24
```

**Note**: Add `paradedb/paradedb:latest` as the PostgreSQL image (or run `pg_search` extension install scripts via `docker-entrypoint-initdb.d`) to enable BM25 hybrid search within PostgreSQL. The ParadeDB image is a drop-in PG16 replacement pre-bundled with `pg_search` and `pgvector`.

---

## Memory and Resource Budget

| Service | RAM Limit | CPU Limit | Storage | Notes |
|---|---|---|---|---|
| LLM Inference (Ollama/DMR) | 50-80 GB | 10+ cores | Model files | 70B Q4 needs ~45 GB |
| PostgreSQL 16 + pgvector | 6 GB | 4 cores | Named volume | Tune shared_buffers to 2 GB |
| Qdrant | 8 GB | 4 cores | Named volume | Scale with collection size |
| Neo4j CE | 6 GB | 4 cores | Named volume | Pagecache 4 GB, heap 4 GB |
| Graphiti MCP | 1 GB | 2 cores | — | Python process |
| Redis Stack | 2 GB | 2 cores | Named volume | maxmemory 2 GB, LRU eviction |
| n8n | 2 GB | 2 cores | Named volume | Queue mode with Redis |
| Embedding Service | 2 GB | 2 cores | — | MPS-accelerated |
| macOS + Docker overhead | 10-12 GB | — | — | Reserved |
| **DB Stack Total** | **~25-27 GB** | — | — | — |
| **Available for LLMs** | **~90-100 GB** | — | — | Comfortable 70B headroom |

With 128 GB unified memory: the full DB stack consumes ~20-27 GB, macOS uses ~10-12 GB, leaving 90+ GB for LLM inference and embeddings. A 70B Q4 model uses approximately 42-50 GB, leaving comfortable headroom for multiple concurrent models or larger quantizations.

---

## Recommendations

### 1. Primary Recommendation: Start with PostgreSQL + Qdrant + Neo4j/Graphiti + Redis

**What to do**: Deploy the full tiered specialist stack described above.

**Rationale**:
- PostgreSQL handles n8n (mandatory), general persistence, and RAG up to 10M vectors with full hybrid search via ParadeDB
- Qdrant handles high-volume/high-throughput RAG collections above that threshold
- Neo4j + Graphiti provides temporally-aware, conflict-resolving AI agent memory — the most sophisticated agent memory architecture available
- Redis handles low-latency working memory and n8n queue mode
- All four have production-quality MCP servers for direct Claude/Jarvis agent querying

**Caveats**: Four distinct services to operate and monitor. Use named Docker volumes and implement automated `pg_dump` + Qdrant snapshot backups.

### 2. Alternative: SurrealDB + Redis + PostgreSQL (for n8n only)

**When to use**: Team prioritizes minimal operational surface over best-in-class performance. SurrealDB + its official MCP server covers document + graph + vector + relational in one Rust binary.

**Caveats**: Cannot use Graphiti (requires Neo4j/FalkorDB backend). Vector search performance at scale is unvalidated vs Qdrant. n8n still requires a separate PostgreSQL instance.

### 3. For embedding dimensions and distance metrics

- Standard text embeddings: OpenAI `text-embedding-3-small` (1536 dims) or `text-embedding-3-large` (3072 dims); `all-MiniLM-L6-v2` (384 dims) for local inference
- Use cosine distance for text semantic similarity
- Use dot product (inner product) for normalized vectors (marginally faster)
- pgvector supports up to 16,000 dimensions; Qdrant and Weaviate support arbitrary dimensions

### 4. For hybrid search strategy

Default to BM25 + HNSW hybrid with RRF fusion for general RAG. Pure semantic search can outperform hybrid on domain-specific corpora (tested on academic papers). Validate on your specific dataset.

---

## Action Items

- [ ] Deploy PostgreSQL 16 with ParadeDB image (pgvector + pg_search bundled) and create `n8n`, `rag`, and `jarvis` databases
- [ ] Deploy Qdrant with named volume; configure initial collection with 1536-dim cosine for OpenAI embeddings
- [ ] Deploy Neo4j CE with pagecache=4G, heap_max=4G; install APOC plugin
- [ ] Clone Graphiti repo, configure `.env` with `NEO4J_URI` + `OPENAI_API_KEY`, run `docker compose -f docker/docker-compose-neo4j.yml up` for Graphiti MCP on port 8000
- [ ] Deploy Redis Stack (includes RedisSearch + RedisJSON); configure n8n queue mode to point at Redis
- [ ] Configure Qdrant MCP server in Claude Code (`claude mcp add qdrant-mcp ...`)
- [ ] Configure postgres-mcp in Claude Code (`claude mcp add postgres-mcp ...`)
- [ ] Configure neo4j-memory MCP or Graphiti MCP in Claude Code
- [ ] Set up automated backups: `pg_dump` daily cron for PostgreSQL, Qdrant snapshot API call daily, Neo4j `neo4j-admin database dump` daily
- [ ] Test MPS acceleration for embedding generation: set `MPS_DEVICE_ENABLE=1` in embedding service environment
- [ ] Benchmark pgvector vs Qdrant on your actual dataset at 1M, 5M, 10M vectors to determine crossover point

---

## Sources

1. [Zilliz: Chroma vs LanceDB comparison](https://zilliz.com/comparison/chroma-vs-lancedb)
2. [Zilliz: Qdrant vs LanceDB comparison](https://zilliz.com/comparison/qdrant-vs-lancedb)
3. [LiquidMetal AI: Vector database comparison 2025](https://liquidmetal.ai/casesAndBlogs/vector-comparison/)
4. [Firecrawl: Best vector databases 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)
5. [Qdrant 2025 Recap](https://qdrant.tech/blog/2025-recap/)
6. [Qdrant MCP Server (official)](https://github.com/qdrant/mcp-server-qdrant)
7. [Qdrant installation docs](https://qdrant.tech/documentation/guides/installation/)
8. [Qdrant multitenancy](https://qdrant.tech/documentation/guides/multitenancy/)
9. [Qdrant 1.16 tiered multitenancy](https://qdrant.tech/blog/qdrant-1.16.x/)
10. [Qdrant hybrid search](https://qdrant.tech/articles/hybrid-search/)
11. [dbadataverse: PostgreSQL wins for AI 2025](https://dbadataverse.com/poetry/2025/12/postgresql-beat-vector-databases-dba-perspective)
12. [instaclustr: pgvector guide 2026](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/)
13. [render.com: Simplify AI stack with pgvector](https://render.com/articles/simplify-ai-stack-managed-postgresql-pgvector)
14. [pgvector vs vector database comparison](https://postgresqlhtx.com/what-is-pgvector-and-when-you-should-use-it-instead-of-a-dedicated-vector-db/)
15. [ParadeDB: Hybrid search in PostgreSQL](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
16. [TigerData: True BM25 in Postgres](https://www.tigerdata.com/blog/introducing-pg_textsearch-true-bm25-ranking-hybrid-retrieval-postgres)
17. [Weaviate Docker setup](https://www.docker.com/blog/how-to-get-started-weaviate-vector-database-on-docker/)
18. [Weaviate Hybrid Search 2.0](https://app.ailog.fr/en/blog/news/weaviate-hybrid-search-2)
19. [Weaviate documentation](https://docs.weaviate.io/weaviate)
20. [ZenML: Vector databases for RAG](https://www.zenml.io/blog/vector-databases-for-rag)
21. [Milvus deployment options](https://milvus.io/docs/install-overview.md)
22. [Milvus Standalone Docker prereqs](https://milvus.io/docs/prerequisite-docker.md)
23. [Zilliz: Milvus vs Chroma vs Qdrant vs LanceDB](https://www.myscale.com/blog/milvus-alternatives-chroma-qdrant-lancedb/)
24. [Neo4j Graphiti blog](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)
25. [Graphiti GitHub](https://github.com/getzep/graphiti)
26. [Graphiti MCP Server docs](https://help.getzep.com/graphiti/getting-started/mcp-server)
27. [Memgraph vs Neo4j 2025](https://medium.com/decoded-by-datacast/memgraph-vs-neo4j-in-2025-real-time-speed-or-battle-tested-ecosystem-66b4c34b117d)
28. [Memgraph performance benchmark](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison)
29. [Memgraph Docker](https://memgraph.com/docs/getting-started/install-memgraph/docker)
30. [Neo4j MCP integrations](https://neo4j.com/developer/genai-ecosystem/model-context-protocol-mcp/)
31. [Neo4j Docker configuration](https://neo4j.com/docs/operations-manual/current/docker/configuration/)
32. [Neo4j memory MCP Docker image](https://hub.docker.com/r/mcp/neo4j-memory)
33. [SurrealDB GitHub](https://github.com/surrealdb/surrealdb)
34. [SurrealDB MCP official](https://surrealdb.com/mcp)
35. [SurrealDB Docker](https://surrealdb.com/docs/surrealdb/installation/running/docker)
36. [SurrealDB MCP community server](https://github.com/nsxdavid/surrealdb-mcp-server)
37. [Redis Agent Memory](https://redis.io/blog/ai-agent-memory-stateful-systems/)
38. [Redis Agent Memory Server GitHub](https://github.com/redis/agent-memory-server)
39. [Redis LangGraph integration](https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/)
40. [n8n Docker docs](https://docs.n8n.io/hosting/installation/docker/)
41. [n8n supported databases](https://docs.n8n.io/hosting/configuration/supported-databases-settings/)
42. [n8n PostgreSQL vs SQLite](https://lumadock.com/tutorials/n8n-postgresql-vs-sqlite)
43. [postgres-mcp Pro](https://github.com/crystaldba/postgres-mcp)
44. [MCP Servers collection](https://github.com/modelcontextprotocol/servers)
45. [ChromaDB MCP server](https://github.com/chroma-core/chroma-mcp)
46. [Docker backup strategies 2025](https://portalzine.de/docker-backup-strategies-for-2025-protecting-your-container-environment/)
47. [Docker volumes persistent data](https://oneuptime.com/blog/post/2026-02-02-docker-volumes-persistent-data/view)
48. [Production vector databases guide](https://www.dataquest.io/blog/production-vector-databases/)
49. [InferBench Apple M4 Max](https://www.inferbench.com/gpu/Apple%20M4%20Max)
50. [Mac for AI/ML guide](https://people.utm.my/shahabuddin/?p=8081)

---

## Uncertainties

- **Graphiti LLM requirement**: Graphiti currently works best with OpenAI/Gemini for structured output in graph construction. Using Claude (Anthropic) for Graphiti's internal graph building requires the OpenAI-compatible API path or Ollama as a proxy. Verify before committing to a fully local LLM pipeline for graph construction.
- **ParadeDB license**: The `pg_search` extension is AGPL-3.0, which has implications for commercial products embedding it. Evaluate if this applies to your use case (self-hosted infrastructure is generally fine).
- **Qdrant GPU indexing on Mac**: Vulkan-based GPU indexing claims Apple Silicon support but Docker images with GPU support are Linux x86_64 only. CPU-based HNSW indexing in Docker is the practical deployment path.
- **SurrealDB vector search maturity**: SurrealDB's built-in vector search is newer than Qdrant's or Weaviate's and has fewer production benchmarks. Treat it as emerging for vector workloads.
- **n8n queue mode memory**: n8n in queue mode with Redis workers may require additional worker containers with their own memory allocations beyond what is budgeted above.

---

## Related Topics for Future Research

- Embedding model selection: local (nomic-embed-text, all-MiniLM) vs API (OpenAI, Cohere) trade-offs for the M4 Max
- Ollama vs Docker Model Runner vs vLLM for local LLM serving on Apple Silicon
- Monitoring stack: Prometheus + Grafana vs Signoz for the Docker AI stack
- FalkorDB as alternative graph backend for Graphiti (Redis-compatible, potentially lower overhead than Neo4j)
- pgvectorscale (Timescale) as a pgvector performance accelerator for larger vector sets within PostgreSQL
