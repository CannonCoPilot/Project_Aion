# Mac Studio DB/AI Implementation Roadmap
## Use-Case-Driven Build Guide

**Created**: 2026-02-17
**Hardware**: Apple M4 Max, 128GB unified memory, macOS 26.2
**Companion**: `mac-studio-v1-infrastructure.md` (full technical reference)
**Approach**: Each milestone delivers a working capability. No dead-end infrastructure.

---

## The 10 Jarvis Capabilities This Unlocks

Before diving into steps — here's what we're building and why each matters.

### UC-1: Persistent Cross-Session Memory
**Problem**: Jarvis loses all context at /clear. JICM v7 mitigates this with JSONL extraction, but it's lossy — nuance, rationale, and relationship context degrade with each cycle.
**Solution**: Graphiti (bi-temporal knowledge graph on Neo4j) creates episodic memory entries from every session. Jarvis can recall past decisions, what was tried, what worked — across ALL sessions, with temporal awareness ("what did I know last Tuesday?").
**Components**: Neo4j + Graphiti MCP
**Value**: High — directly addresses Jarvis's #1 limitation (context amnesia)

### UC-2: Codebase Semantic Search
**Problem**: Jarvis currently finds code via Glob/Grep/Read — which requires knowing WHERE to look. Semantic intent ("find the code that handles context compression") is unsupported.
**Solution**: Index the entire Jarvis codebase into Qdrant with contextual retrieval enrichment. Hybrid BM25 + vector search with reranking returns the exact chunks needed.
**Components**: Qdrant + Ollama embeddings + RAG MCP server
**Value**: High — replaces multi-step file exploration with single semantic queries

### UC-3: Research Knowledge Persistence
**Problem**: The 6 deep research reports we just completed are markdown files. Jarvis must know which file to read and manually open it. Cross-report queries ("what's the best model under 8GB for coding?") require reading multiple files.
**Solution**: All research reports, patterns, plans, and context files are embedded in Qdrant. Natural language queries retrieve the exact relevant chunk. n8n auto-indexes new reports as created.
**Components**: Qdrant + RAG pipeline + n8n file watcher
**Value**: High — transforms static files into a searchable knowledge base

### UC-4: Local Model Delegation (Cost + Latency Savings)
**Problem**: Jarvis currently uses Claude (API) for EVERYTHING — including tasks that don't need frontier-class intelligence: summarization, classification, embedding generation, context enrichment.
**Solution**: Route lightweight tasks to local Qwen models via LiteLLM. Embeddings generated locally (Qwen3-Embedding-4B). Context enrichment for RAG uses Qwen3-8B. Claude reserved for complex reasoning.
**Components**: Ollama + MLX + LiteLLM proxy
**Value**: Medium-High — reduces API cost, eliminates network latency for delegated tasks

### UC-5: Session Analytics & Self-Improvement Data
**Problem**: AC-05 (Reflection) and AC-06 (Evolution) currently have no structured data to mine. Session logs are flat text. Performance trends, tool usage patterns, and error frequencies are invisible.
**Solution**: PostgreSQL stores structured session metadata — task completion times, tool usage counts, error frequencies, context efficiency metrics. Redis holds real-time session state. AC-05/06 query PostgreSQL for trend analysis.
**Components**: PostgreSQL + Redis + telemetry pipeline
**Value**: Medium — enables data-driven self-improvement (currently speculative)

### UC-6: Autonomous Workflow Orchestration
**Problem**: Periodic tasks (re-indexing, health checks, backups) require manual triggers or cron scripts with no visibility.
**Solution**: n8n provides visual workflow automation with webhook triggers, scheduling, and notification. Jarvis creates/modifies n8n workflows programmatically via MCP. n8n monitors infrastructure health and triggers Jarvis on external events.
**Components**: n8n + n8n-mcp + PostgreSQL backend + Redis queue
**Value**: Medium — infrastructure automation without manual intervention

### UC-7: Voice Interface ("Hey Jarvis")
**Problem**: Jarvis is text-only. Voice interaction would enable hands-free operation during hardware setup, debugging, or when away from keyboard.
**Solution**: Wake word detection → VAD → STT (mlx-whisper) → Claude/local LLM → TTS (Kokoro) → speaker. VoiceMode MCP provides a production-ready integration.
**Components**: mlx-whisper + Kokoro-82M + Silero VAD + openWakeWord + VoiceMode MCP
**Value**: Medium — experiential upgrade, not strictly necessary for core Jarvis function

### UC-8: Knowledge Graph Navigation
**Problem**: Jarvis has 51 patterns, 28 skills, 40 commands, 13 agents — all interconnected but the relationships are implicit (embedded in YAML cross-references and markdown text).
**Solution**: Neo4j graph explicitly models: Pattern → uses → Hook, Skill → depends_on → Agent, Command → triggers → Skill. Enables "what would break if I change hook X?" queries. Graph-RAG combines structured relationships with semantic search.
**Components**: Neo4j + Neo4j MCP + ingestion scripts
**Value**: Medium — powerful for refactoring and impact analysis

### UC-9: Vision/Multimodal Analysis
**Problem**: When debugging UI issues, reviewing diagrams, or processing screenshots, Jarvis relies on Claude's vision capability via API. No local fallback.
**Solution**: Qwen3-VL-8B provides local vision understanding — screenshot analysis, OCR, diagram interpretation — without API calls. Qwen2.5-Omni-7B adds audio/video input.
**Components**: Ollama + Qwen3-VL-8B model
**Value**: Low-Medium — useful but not a daily driver for current workflows

### UC-10: Intelligent Caching & Deduplication
**Problem**: Jarvis frequently re-reads the same files across sessions. Web research re-fetches the same URLs. Embedding the same unchanged documents wastes compute.
**Solution**: Redis provides microsecond-access semantic caching (embedding-based cache hits). File hash tracking in Qdrant metadata prevents re-embedding unchanged files. PostgreSQL stores URL → content mappings for research caching.
**Components**: Redis + Qdrant metadata + PostgreSQL
**Value**: Low-Medium — efficiency optimization, not a new capability

---

## Prioritized Use Case Matrix

| Rank | Use Case | Dependencies | Effort | Immediate Value |
|------|----------|-------------|--------|-----------------|
| 1 | UC-4: Local Models | Phase 0 only | 3-4 hrs | Instant — models serving, can test immediately |
| 2 | UC-2: Codebase Search | UC-4 + Qdrant | 6-8 hrs | High — semantic search from day 1 |
| 3 | UC-3: Research Persistence | UC-2 | 2-3 hrs | High — extends UC-2 to all docs |
| 4 | UC-5: Session Analytics | PostgreSQL | 3-4 hrs | Medium — structured data for AC-05/06 |
| 5 | UC-1: Cross-Session Memory | Neo4j + UC-4 | 4-6 hrs | High — but complex, benefits from UC-2 first |
| 6 | UC-6: Workflow Automation | n8n + UC-2 | 3-4 hrs | Medium — ties everything together |
| 7 | UC-8: Knowledge Graph Nav | UC-1 + Neo4j | 3-4 hrs | Medium — builds on existing graph |
| 8 | UC-10: Caching | Redis + UC-2 | 2-3 hrs | Low-Medium — optimization layer |
| 9 | UC-7: Voice Interface | UC-4 + MLX audio | 4-6 hrs | Medium — experiential, independent |
| 10 | UC-9: Vision/Multimodal | UC-4 | 1-2 hrs | Low-Medium — just model pull + test |

---

## Implementation Milestones

Each milestone is a self-contained working capability. We build together, step by step.

---

### Milestone 0: Foundation Bootstrap (2-3 hrs)
**Delivers**: Base tooling everything else depends on
**Use Cases Served**: All

#### Step 0.1: System Python & Package Manager
```bash
# Modern Python (system is 3.9.6 — too old for MLX, Haystack, etc.)
brew install python@3.12
python3.12 --version  # Verify

# uv — fast Python package manager (replaces pip/venv/conda)
brew install uv
uv --version  # Verify
```

#### Step 0.2: Docker Desktop
```bash
brew install --cask docker
# Launch Docker Desktop from Applications, then configure:
#   Settings → General:
#     ✅ Apple Virtualization framework
#     ✅ VirtioFS (fastest file sharing)
#   Settings → Resources:
#     Memory: 32 GB (caps the Linux VM — Docker doesn't see unified memory)
#     CPU: 8 cores
#     Virtual disk: 200 GB
```

> **Why 32GB?** Docker on macOS runs inside a Linux VM. The VM can't access
> unified memory directly — it sees allocated RAM. 32GB is enough for all our
> database containers while leaving 96GB for native macOS processes (Ollama, MLX,
> Claude Code). If you find databases need more, increase to 40GB.

#### Step 0.3: Core CLI Tools
```bash
brew install jq yq git-lfs htop
# Node.js: already installed (v24.13.1)
# git: already installed
```

#### Step 0.4: Ollama (NATIVE — not Docker)
```bash
brew install ollama
ollama serve &  # Starts on localhost:11434
sleep 2
curl http://localhost:11434/api/tags  # Verify — should return 200
```

> **CRITICAL**: Ollama must run natively on macOS, NOT in Docker.
> Docker runs inside a Linux VM that CANNOT access Metal Performance Shaders.
> Native Ollama uses Metal directly → 3-5x faster inference than Docker Ollama.

#### Step 0.5: MLX Framework
```bash
uv pip install --system mlx mlx-lm mlx-vlm mlx-audio mlx-whisper
python3.12 -c "import mlx; print(mlx.__version__)"  # Verify
```

#### Step 0.6: Infrastructure Directory
```bash
mkdir -p /Users/nathanielcannon/Claude/Jarvis/infrastructure/{init-scripts,qdrant-config,rag-service}
```

#### Validation Checklist
- [ ] `python3.12 --version` → 3.12.x
- [ ] `uv --version` → installed
- [ ] `docker --version` → installed, Docker Desktop running
- [ ] `ollama --version` → installed
- [ ] `curl localhost:11434/api/tags` → 200 OK
- [ ] `python3.12 -c "import mlx"` → no error

---

### Milestone 1: Local Model Serving (3-4 hrs)
**Delivers**: UC-4 — Local models answering queries, generating embeddings
**Depends on**: Milestone 0

This is the highest-ROI milestone. Once models are serving, you can immediately test local inference, embeddings, and vision — all without any database setup.

#### Step 1.1: Pull Core Models via Ollama
```bash
# ─── Primary text models (start with the two most useful) ───
ollama pull qwen3:8b            # 5 GB — fast, great for delegation
ollama pull qwen3:32b           # 20 GB — all-around anchor (pull while working)

# ─── Embedding (critical for UC-2/UC-3) ───
ollama pull qwen3-embedding:4b  # 8 GB — top-tier MTEB multilingual
ollama pull nomic-embed-text    # 1 GB — fast fallback

# ─── Coding ───
ollama pull qwen3-coder          # 17 GB — 30B MoE, 3.3B active params

# ─── Vision ───
ollama pull qwen3-vl:8b         # 5 GB — image understanding

# ─── Ultra-fast for routing/classification ───
ollama pull qwen3:0.6b          # <1 GB
```

> **Disk usage note**: Models are ~80-100 GB total on disk. They're loaded into
> unified memory on demand — only active models consume RAM. Ollama handles
> loading/unloading automatically.

#### Step 1.2: Test Each Model
```bash
# Text generation
curl http://localhost:11434/api/generate \
  -d '{"model":"qwen3:8b","prompt":"Explain JICM context management in 2 sentences.","stream":false}'

# Embedding
curl http://localhost:11434/api/embed \
  -d '{"model":"qwen3-embedding:4b","input":"vector database for RAG pipeline"}'

# Vision (base64 image)
# curl http://localhost:11434/api/generate \
#   -d '{"model":"qwen3-vl:8b","prompt":"Describe this image","images":["<base64>"]}'
```

#### Step 1.3: LiteLLM Proxy (Unified API)
```bash
uv pip install --system 'litellm[proxy]'
```

Create `infrastructure/litellm-config.yaml`:
```yaml
model_list:
  - model_name: qwen3-32b
    litellm_params:
      model: ollama/qwen3:32b
      api_base: http://localhost:11434
  - model_name: qwen3-8b
    litellm_params:
      model: ollama/qwen3:8b
      api_base: http://localhost:11434
  - model_name: qwen3-fast
    litellm_params:
      model: ollama/qwen3:0.6b
      api_base: http://localhost:11434
  - model_name: qwen3-vl
    litellm_params:
      model: ollama/qwen3-vl:8b
      api_base: http://localhost:11434
  - model_name: qwen3-coder
    litellm_params:
      model: ollama/qwen3-coder
      api_base: http://localhost:11434
  - model_name: embedding
    litellm_params:
      model: ollama/qwen3-embedding:4b
      api_base: http://localhost:11434
  # Cloud fallback — uncomment when needed
  # - model_name: claude-opus
  #   litellm_params:
  #     model: anthropic/claude-opus-4-6
  #     api_key: os.environ/ANTHROPIC_API_KEY

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 2
  timeout: 120
```

```bash
litellm --config /Users/nathanielcannon/Claude/Jarvis/infrastructure/litellm-config.yaml --port 4000 &

# Verify
curl http://localhost:4000/v1/models  # Should list all models
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-8b","messages":[{"role":"user","content":"Hello"}]}'
```

#### Validation Checklist
- [ ] `ollama list` → all 7 models present
- [ ] Text generation works (qwen3:8b)
- [ ] Embedding generation works (qwen3-embedding:4b)
- [ ] LiteLLM proxy responds on port 4000
- [ ] LiteLLM can route to different models by name

#### What you can do RIGHT NOW with Milestone 1:
- Ask local models questions (no API cost)
- Generate embeddings for any text
- Test vision with Qwen3-VL-8B
- Route requests through LiteLLM's unified API
- Compare local model quality vs Claude for various tasks

---

### Milestone 2: Database Stack + RAG Foundation (6-8 hrs)
**Delivers**: UC-2 (Codebase Search) + UC-3 (Research Persistence) + UC-5 (Session Analytics)
**Depends on**: Milestone 1

This is the big one — brings up the full database layer and the first RAG capability.

#### Step 2.1: Environment Configuration

Create `infrastructure/.env`:
```bash
# Generate secure passwords (run each command, save output)
# openssl rand -base64 24

PG_USER=jarvis
PG_PASSWORD=<generate-secure>
PG_DB=jarvis
NEO4J_PASSWORD=<generate-secure>
N8N_ENCRYPTION_KEY=<generate-secure>
```

> **IMPORTANT**: Copy these credentials to `.claude/secrets/credentials.yaml`
> (gitignored) for Jarvis to access without exposing them in tracked files.

#### Step 2.2: Docker Compose — Full Database Stack

Create `infrastructure/docker-compose.yml`:
```yaml
version: "3.9"

services:
  # ─── PostgreSQL + pgvector + BM25 (n8n backend + RAG + analytics) ─────
  postgres:
    image: paradedb/paradedb:latest
    container_name: jarvis-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${PG_USER:-jarvis}
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ${PG_DB:-jarvis}
    command: >
      postgres
        -c shared_buffers=2GB
        -c effective_cache_size=6GB
        -c work_mem=256MB
        -c maintenance_work_mem=1GB
        -c max_connections=200
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - jarvis-net
    deploy:
      resources:
        limits:
          memory: 6G
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER:-jarvis}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Qdrant (high-performance vector search for RAG) ───────────────
  qdrant:
    image: qdrant/qdrant:latest
    container_name: jarvis-qdrant
    restart: unless-stopped
    volumes:
      - qdrant_data:/qdrant/storage
    ports:
      - "6333:6333"
      - "6334:6334"
    networks:
      - jarvis-net
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6333/healthz || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5

  # ─── Neo4j (knowledge graph + Graphiti agent memory) ────────────────
  neo4j:
    image: neo4j:latest
    container_name: jarvis-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_server_memory_pagecache__size: 4G
      NEO4J_server_memory_heap_initial__size: 1G
      NEO4J_server_memory_heap_max__size: 4G
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    ports:
      - "7474:7474"
      - "7687:7687"
    networks:
      - jarvis-net
    deploy:
      resources:
        limits:
          memory: 6G
          cpus: "4"
    healthcheck:
      test: ["CMD-SHELL", "wget -O /dev/null -q http://localhost:7474 || exit 1"]
      interval: 20s
      timeout: 10s
      retries: 10

  # ─── Redis (agent working memory + workflow queue + caching) ─────────
  redis:
    image: redis/redis-stack:latest
    container_name: jarvis-redis
    restart: unless-stopped
    command: >
      redis-server
        --maxmemory 2gb
        --maxmemory-policy allkeys-lru
        --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
      - "8001:8001"
    networks:
      - jarvis-net
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── n8n (workflow automation — uses PostgreSQL + Redis) ─────────────
  n8n:
    image: n8nio/n8n:1.73.1
    container_name: jarvis-n8n
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: ${PG_USER:-jarvis}
      DB_POSTGRESDB_PASSWORD: ${PG_PASSWORD}
      EXECUTIONS_MODE: queue
      QUEUE_BULL_REDIS_HOST: redis
      QUEUE_BULL_REDIS_PORT: 6379
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      WEBHOOK_URL: http://localhost:5678
    volumes:
      - n8n_data:/home/node/.n8n
    ports:
      - "5678:5678"
    networks:
      - jarvis-net
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

volumes:
  postgres_data:
  qdrant_data:
  neo4j_data:
  neo4j_logs:
  redis_data:
  n8n_data:

networks:
  jarvis-net:
    driver: bridge
```

#### Step 2.3: PostgreSQL Init Scripts

Create `infrastructure/init-scripts/01-create-databases.sql`:
```sql
-- n8n requires its own database
CREATE DATABASE n8n;

-- RAG pipeline metadata
CREATE DATABASE rag;

-- Enable extensions in jarvis DB
\c jarvis;
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_search;    -- ParadeDB BM25 full-text

-- Session analytics tables (UC-5)
CREATE TABLE IF NOT EXISTS session_logs (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    context_cycles INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tools_used JSONB DEFAULT '{}',
    errors JSONB DEFAULT '[]',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS tool_usage (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    invoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS decision_log (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category TEXT,  -- 'architecture', 'tool_selection', 'approach', etc.
    decision TEXT NOT NULL,
    rationale TEXT,
    outcome TEXT,
    tags TEXT[]
);
```

#### Step 2.4: Bring Up the Stack
```bash
cd /Users/nathanielcannon/Claude/Jarvis/infrastructure
docker compose up -d

# Wait for services to be healthy (takes 30-60s for Neo4j)
sleep 30
docker compose ps
```

#### Step 2.5: Create Qdrant Collections
```bash
# jarvis-context — patterns, session state, plans, context files
curl -X PUT http://localhost:6333/collections/jarvis-context \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# codebase — source code chunks (scripts, hooks, skills)
curl -X PUT http://localhost:6333/collections/codebase \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# research — research reports and findings
curl -X PUT http://localhost:6333/collections/research \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# sessions — session transcripts and checkpoints
curl -X PUT http://localhost:6333/collections/sessions \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# Verify
curl http://localhost:6333/collections | jq '.result.collections[].name'
```

> **Why 2560 dimensions?** Qwen3-Embedding-4B outputs 2560-dimensional vectors
> (confirmed via M1 testing). This matches the model we'll use for all embeddings.
> If you switch to nomic-embed-text (768-dim), create separate collections or
> use Qdrant's named vectors feature for multi-model support.

#### Step 2.6: Register MCP Servers in Claude Code
```bash
# Qdrant MCP — vector search from Claude Code
claude mcp add qdrant-mcp -- npx -y @qdrant/mcp-server-qdrant \
  --qdrant-url http://localhost:6333

# PostgreSQL MCP — SQL queries from Claude Code
claude mcp add postgres-mcp -- npx -y @crystaldba/postgres-mcp \
  --connection-string "postgresql://jarvis:<password>@localhost:5432/jarvis"

# Neo4j MCP — knowledge graph from Claude Code
claude mcp add neo4j-memory -- docker run -i --rm mcp/neo4j-memory \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password <password>

# n8n MCP — workflow management from Claude Code
# (requires API key — get it from n8n UI after Step 2.7)
```

#### Step 2.7: n8n Initial Setup
```
Open http://localhost:5678 in browser
1. Create admin account
2. Settings → n8n API → Generate API key
3. Save API key to .claude/secrets/credentials.yaml
4. Return to CLI:
```
```bash
# Now register n8n MCP with the API key
claude mcp add n8n-mcp -- npx -y n8n-mcp \
  --n8n-api-url http://localhost:5678/api/v1 \
  --n8n-api-key <api-key-from-step-above>
```

#### Validation Checklist
- [ ] `docker compose ps` → all 5 services healthy
- [ ] `psql -h localhost -U jarvis -c "SELECT 1"` → OK
- [ ] `curl localhost:6333/collections` → 4 collections listed
- [ ] `curl localhost:7474` → Neo4j browser accessible
- [ ] `redis-cli -h localhost ping` → PONG
- [ ] `curl localhost:5678` → n8n UI accessible
- [ ] MCP servers respond in Claude Code (restart Claude Code after adding)

#### What you can do RIGHT NOW with Milestone 2:
- Query databases directly from Claude Code via MCP
- Store and retrieve vectors in Qdrant
- Run SQL analytics queries against PostgreSQL
- Browse the Neo4j knowledge graph at localhost:7474
- Create n8n workflows from the web UI
- Use Redis for fast key-value caching

---

### Milestone 3: RAG Pipeline — Semantic Search for Jarvis (4-6 hrs)
**Delivers**: UC-2 (Codebase Search) + UC-3 (Research Persistence)
**Depends on**: Milestone 2

This is where the databases become *useful*. We build the ingestion pipeline, embed Jarvis's own files, and create an MCP server that lets Jarvis semantically search its own knowledge.

#### Step 3.1: Install RAG Dependencies
```bash
uv pip install --system \
  haystack-ai \
  hayhooks \
  qdrant-haystack \
  sentence-transformers \
  'rerankers[flashrank]' \
  fastmcp \
  docling
```

#### Step 3.2: Build the RAG MCP Server

Create `infrastructure/rag-service/mcp_server.py`:
```python
"""
Jarvis RAG MCP Server
Exposes semantic search and document ingestion via MCP protocol.
Uses Qdrant for vector storage, Ollama for embeddings, FlashRank for reranking.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path

import httpx
from fastmcp import FastMCP
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:4b")
EMBED_DIM = int(os.getenv("EMBED_DIM", "2560"))

qdrant = QdrantClient(url=QDRANT_URL)
mcp = FastMCP("jarvis-rag")


async def get_embedding(text: str) -> list[float]:
    """Get embedding from Ollama."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": text},
        )
        resp.raise_for_status()
        return resp.json()["embeddings"][0]


def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> list[str]:
    """Simple recursive character chunker."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return [c for c in chunks if c.strip()]


@mcp.tool()
async def search(
    query: str,
    collection: str = "jarvis-context",
    top_k: int = 5,
) -> list[dict]:
    """Search the local RAG knowledge base with semantic retrieval.

    Args:
        query: Natural language search query
        collection: Which collection to search (jarvis-context, codebase, research, sessions)
        top_k: Number of results to return
    """
    embedding = await get_embedding(query)
    results = qdrant.query_points(
        collection_name=collection,
        query=embedding,
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "score": r.score,
            "text": r.payload.get("text", ""),
            "source": r.payload.get("source", ""),
            "chunk_index": r.payload.get("chunk_index", 0),
        }
        for r in results.points
    ]


@mcp.tool()
async def ingest(
    file_path: str,
    collection: str = "jarvis-context",
) -> dict:
    """Ingest a document into the RAG knowledge base.

    Args:
        file_path: Absolute path to the file to ingest
        collection: Target collection (jarvis-context, codebase, research, sessions)
    """
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    text = path.read_text(encoding="utf-8", errors="replace")
    file_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

    # Check if already indexed with same hash
    existing = qdrant.scroll(
        collection_name=collection,
        scroll_filter=Filter(
            must=[FieldCondition(key="file_hash", match=MatchValue(value=file_hash))]
        ),
        limit=1,
    )
    if existing[0]:
        return {"status": "skipped", "reason": "already indexed (same hash)", "file": file_path}

    # Delete old vectors for this file
    qdrant.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[FieldCondition(key="source", match=MatchValue(value=file_path))]
        ),
    )

    # Chunk and embed
    chunks = chunk_text(text)
    points = []
    for i, chunk in enumerate(chunks):
        embedding = await get_embedding(chunk)
        points.append(
            PointStruct(
                id=abs(hash(f"{file_path}:{i}:{file_hash}")) % (2**63),
                vector=embedding,
                payload={
                    "text": chunk,
                    "source": file_path,
                    "chunk_index": i,
                    "file_hash": file_hash,
                    "file_name": path.name,
                },
            )
        )

    if points:
        qdrant.upsert(collection_name=collection, points=points)

    return {
        "status": "ingested",
        "file": file_path,
        "chunks": len(points),
        "collection": collection,
    }


@mcp.tool()
async def ingest_directory(
    directory: str,
    collection: str = "jarvis-context",
    pattern: str = "**/*.md",
) -> dict:
    """Ingest all matching files in a directory.

    Args:
        directory: Absolute path to the directory
        collection: Target collection
        pattern: Glob pattern for files to include (default: all markdown)
    """
    dir_path = Path(directory)
    if not dir_path.is_dir():
        return {"error": f"Not a directory: {directory}"}

    files = list(dir_path.glob(pattern))
    results = {"ingested": 0, "skipped": 0, "errors": 0, "total_chunks": 0}

    for f in files:
        try:
            result = await ingest(str(f), collection)
            if result.get("status") == "ingested":
                results["ingested"] += 1
                results["total_chunks"] += result.get("chunks", 0)
            elif result.get("status") == "skipped":
                results["skipped"] += 1
            else:
                results["errors"] += 1
        except Exception as e:
            results["errors"] += 1

    return results


@mcp.tool()
async def list_collections() -> list[dict]:
    """List all RAG collections with document counts."""
    collections = qdrant.get_collections().collections
    return [
        {
            "name": c.name,
            "vectors_count": qdrant.get_collection(c.name).vectors_count,
            "points_count": qdrant.get_collection(c.name).points_count,
        }
        for c in collections
    ]


if __name__ == "__main__":
    mcp.run()
```

#### Step 3.3: Register RAG MCP Server
```bash
claude mcp add jarvis-rag -- python3.12 \
  /Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/mcp_server.py
```

#### Step 3.4: Initial Indexing — Seed the Knowledge Base

Run these from Claude Code (or a script) to index Jarvis's own files:

```bash
# Index context files (patterns, state, designs)
# Via the jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/context", "jarvis-context", "**/*.md")

# Index research reports
# Via jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/reports", "research", "**/*.md")
# Via jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/agents/memory/deep-research", "research", "**/*.md")

# Index codebase (scripts, hooks, skills)
# Via jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/scripts", "codebase", "**/*.{sh,js,py}")
# Via jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/hooks", "codebase", "**/*.js")
# Via jarvis-rag MCP: ingest_directory("/Users/nathanielcannon/Claude/Jarvis/.claude/skills", "codebase", "**/*.md")
```

#### Step 3.5: Test Semantic Search
```
Via jarvis-rag MCP: search("context compression timing", "jarvis-context")
Via jarvis-rag MCP: search("voice latency requirements", "research")
Via jarvis-rag MCP: search("hook that detects defeat signals", "codebase")
```

#### Validation Checklist
- [ ] RAG MCP server starts without errors
- [ ] `list_collections` returns 4 collections with correct dimensions
- [ ] `ingest` successfully chunks and embeds a test file
- [ ] `search` returns relevant results for known-content queries
- [ ] `ingest_directory` processes multiple files efficiently

#### What you can do RIGHT NOW with Milestone 3:
- Semantically search Jarvis's own codebase ("find the hook that handles context budget")
- Query research findings in natural language ("what's the best TTS model under 1GB?")
- Search across session patterns and context files
- All searches happen locally — no API calls, no cloud dependency

---

### Milestone 4: Cross-Session Memory — Graphiti (4-6 hrs)
**Delivers**: UC-1 (Persistent Cross-Session Memory) + UC-8 (Knowledge Graph Navigation)
**Depends on**: Milestone 2 (Neo4j running)

#### Step 4.1: Install Graphiti
```bash
uv pip install --system graphiti-core
```

#### Step 4.2: Configure Graphiti

Graphiti needs an LLM for graph construction. We route it through LiteLLM to our local Ollama models:

```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=<same-as-docker-compose>
export OPENAI_API_KEY=<litellm-key-or-dummy>
export OPENAI_BASE_URL=http://localhost:4000/v1  # LiteLLM proxy → Ollama
```

#### Step 4.3: Register Graphiti MCP
```bash
claude mcp add graphiti -- python3.12 -m graphiti_core.mcp_server \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password <password>
```

#### Step 4.4: Seed Initial Knowledge

Create an ingestion script to populate the graph with Jarvis's architectural knowledge:

```python
# infrastructure/seed-graphiti.py
"""Seed Graphiti with Jarvis architectural knowledge."""
import asyncio
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

async def seed():
    g = Graphiti(
        neo4j_uri="bolt://localhost:7687",
        neo4j_user="neo4j",
        neo4j_password="<password>",
    )
    await g.build_indices_and_constraints()

    # Architectural episodes
    episodes = [
        ("Jarvis is an autonomous Archon agent built on Claude Code, "
         "managing Project Aion. It has 9 Hippocrenae autonomic components "
         "(AC-01 through AC-09) and a hidden 10th (AC-10 Ulfhedthnar)."),
        ("JICM v7 uses a bash script (jicm-prep-context.sh) to extract "
         "session state from JSONL transcripts. This replaced the LLM "
         "compression agent, achieving 7500x faster context preparation."),
        ("The codebase has three architectural layers: Nous (knowledge, "
         "in .claude/context/), Pneuma (capabilities, in .claude/), and "
         "Soma (infrastructure, in /Jarvis/)."),
        ("Research on 2026-02-17 identified Qwen3-32B as the best "
         "all-around local text model for M4 Max 128GB. Qwen3-Embedding-4B "
         "is the recommended embedding model. Kokoro-82M is the TTS leader."),
    ]

    for i, episode in enumerate(episodes):
        await g.add_episode(
            name=f"seed-{i}",
            episode_body=episode,
            source=EpisodeType.text,
            source_description="Jarvis architectural seed data",
        )
        print(f"Added episode {i}")

    await g.close()

asyncio.run(seed())
```

#### Step 4.5: Integration with Session Lifecycle

The real power comes from automatically capturing session knowledge:

- **Session start (AC-01)**: Query Graphiti for recent episodes related to current task
- **During work (AC-02)**: On significant decisions, add episodes to Graphiti
- **Session end (AC-09)**: Summarize session outcomes as episodes

This will be wired into the existing session-start.sh and end-session.md workflows.

#### Validation Checklist
- [x] Graphiti MCP server starts without errors
- [x] MCP tools visible: search, search_nodes, add_episode, get_episodes, get_entity, graph_stats
- [x] Seed episodes appear in Neo4j (4 episodes, 36 entities, 29 edges)
- [x] Search returns relevant episodes for "JICM" or "context management"
- [x] Session lifecycle wired: AC-01 query on start, AC-09 capture on end

---

### Milestone 5: n8n Automation Workflows (3-4 hrs)
**Delivers**: UC-6 (Autonomous Workflow Orchestration)
**Depends on**: Milestones 2 + 3

#### Step 5.1: Create Core Workflows in n8n UI

Open http://localhost:5678 and build these workflows:

**Workflow 1: RAG Auto-Indexer**
```
Trigger: File System Watcher (polls every 5 min)
  → Watch: /Users/nathanielcannon/Claude/Jarvis/.claude/
  → Filter: *.md, *.js, *.sh, *.py, *.yaml
  → HTTP Request: POST http://host.docker.internal:8090/ingest
  → Body: { "file_path": "{{ $json.path }}", "collection": "jarvis-context" }
```

**Workflow 2: Health Monitor**
```
Trigger: Cron (every 5 minutes)
  → HTTP Request: GET http://jarvis-qdrant:6333/healthz
  → HTTP Request: GET http://jarvis-postgres:5432 (pg_isready)
  → HTTP Request: GET http://host.docker.internal:11434/api/tags
  → IF any fail → Send notification (webhook/email/Slack)
```

**Workflow 3: Git Commit Indexer**
```
Trigger: Webhook (POST /webhook/git-push)
  → Execute: git diff --name-only HEAD~1
  → For each changed file:
    → HTTP Request: POST ingest endpoint
```

**Workflow 4: Research Report Watcher**
```
Trigger: File System Watcher
  → Watch: .claude/reports/research/, .claude/agents/memory/deep-research/
  → On new/modified: ingest into "research" collection
```

#### Step 5.2: Register n8n MCP (if not done)
```bash
claude mcp add n8n-mcp -- npx -y n8n-mcp \
  --n8n-api-url http://localhost:5678/api/v1 \
  --n8n-api-key <your-api-key>
```

Now Jarvis can programmatically create, modify, and trigger n8n workflows.

#### Validation Checklist
- [ ] Health monitor workflow triggers every 5 min, reports green
- [ ] RAG indexer detects file changes and triggers ingestion
- [ ] n8n MCP allows creating test workflow from Claude Code

---

### Milestone 6: Voice Pipeline (4-6 hrs)
**Delivers**: UC-7 (Voice Interface)
**Depends on**: Milestone 1 (MLX installed)

This milestone is independent of the database stack — it can be done any time after Milestone 0.

#### Step 6.1: Install Voice Dependencies
```bash
uv pip install --system mlx-whisper mlx-audio silero-vad openwakeword
```

#### Step 6.2: Test STT
```bash
# Record a short test clip (or use any .wav file)
# macOS: use QuickTime Player → New Audio Recording → Save

python3.12 -c "
import mlx_whisper
result = mlx_whisper.transcribe(
    'test.wav',
    path_or_hf_repo='mlx-community/whisper-large-v3-turbo'
)
print(result['text'])
"
```

#### Step 6.3: Test TTS
```bash
python3.12 -c "
from mlx_audio.tts import generate
generate('Good evening, sir. All systems are operational.', voice='af_sky')
# Outputs audio file
"
```

#### Step 6.4: Install VoiceMode MCP
```bash
claude mcp add voicemode -- npx -y @mbailey/voicemode
```

This gives Claude Code voice input/output capability directly.

#### Step 6.5: Custom Wake Word (Optional)
```bash
python3.12 -c "
from openwakeword.model import Model
model = Model(wakeword_models=['hey_jarvis'])
# Integrate with microphone stream for always-on detection
"
```

#### Validation Checklist
- [ ] mlx-whisper transcribes test audio correctly
- [ ] Kokoro generates clear speech
- [ ] VoiceMode MCP responds in Claude Code
- [ ] End-to-end voice interaction works

---

### Milestone 7: Service Management & Backup (2-3 hrs)
**Delivers**: Reliability, auto-start, and data safety
**Depends on**: Milestones 0-5

#### Step 7.1: Start/Stop Scripts

Create `infrastructure/start-stack.sh`:
```bash
#!/bin/bash
set -e
echo "Starting Jarvis infrastructure..."

# Docker services
cd /Users/nathanielcannon/Claude/Jarvis/infrastructure
docker compose up -d
echo "Waiting for services..."
sleep 15
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# Ollama (native)
if ! pgrep -x "ollama" > /dev/null; then
    ollama serve &
    sleep 3
fi

# LiteLLM router
if ! pgrep -f "litellm" > /dev/null; then
    litellm --config /Users/nathanielcannon/Claude/Jarvis/infrastructure/litellm-config.yaml \
      --port 4000 > /tmp/litellm.log 2>&1 &
fi

echo ""
echo "Services:"
echo "  PostgreSQL:  localhost:5432"
echo "  Qdrant:      localhost:6333"
echo "  Neo4j:       localhost:7474 / 7687"
echo "  Redis:       localhost:6379 / 8001"
echo "  n8n:         localhost:5678"
echo "  Ollama:      localhost:11434"
echo "  LiteLLM:     localhost:4000"
```

Create `infrastructure/health-check.sh`:
```bash
#!/bin/bash
echo "Jarvis Infrastructure Health Check"
echo "==================================="

check() {
    local name=$1 cmd=$2
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  [OK]   $name"
    else
        echo "  [FAIL] $name"
    fi
}

check "PostgreSQL" "pg_isready -h localhost -U jarvis 2>/dev/null"
check "Qdrant"     "curl -sf http://localhost:6333/healthz"
check "Neo4j"      "curl -sf http://localhost:7474"
check "Redis"      "redis-cli -h localhost ping 2>/dev/null"
check "n8n"        "curl -sf http://localhost:5678/healthz"
check "Ollama"     "curl -sf http://localhost:11434/api/tags"
check "LiteLLM"    "curl -sf http://localhost:4000/v1/models"
```

#### Step 7.2: Backup Script

Create `infrastructure/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/Users/nathanielcannon/Backups/jarvis/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

echo "Backing up to $BACKUP_DIR..."

# PostgreSQL
pg_dump -h localhost -U jarvis jarvis > "$BACKUP_DIR/postgres-jarvis.sql" 2>/dev/null
pg_dump -h localhost -U jarvis n8n > "$BACKUP_DIR/postgres-n8n.sql" 2>/dev/null

# Qdrant snapshots
curl -sf -X POST http://localhost:6333/snapshots > /dev/null

# Neo4j
docker exec jarvis-neo4j neo4j-admin database dump neo4j --to-path=/tmp/ 2>/dev/null
docker cp jarvis-neo4j:/tmp/neo4j.dump "$BACKUP_DIR/" 2>/dev/null

echo "Backup complete: $(du -sh "$BACKUP_DIR" | cut -f1)"
```

```bash
chmod +x infrastructure/{start-stack,health-check,backup}.sh
```

---

## Port Map (Quick Reference)

| Port | Service | Purpose |
|------|---------|---------|
| 4000 | LiteLLM | Unified model API |
| 5432 | PostgreSQL | Relational + vector + BM25 |
| 5678 | n8n | Workflow automation UI |
| 6333 | Qdrant | Vector DB REST API |
| 6334 | Qdrant | Vector DB gRPC |
| 6379 | Redis | Cache + queue |
| 7474 | Neo4j | Graph DB browser |
| 7687 | Neo4j | Bolt protocol |
| 8001 | Redis Insight | Redis web UI |
| 11434 | Ollama | Model serving |

---

## MCP Server Registry (After Full Build)

| MCP | Purpose | Milestone |
|-----|---------|-----------|
| `qdrant-mcp` | Vector search | M2 |
| `postgres-mcp` | SQL queries | M2 |
| `neo4j-memory` | Knowledge graph | M2 |
| `n8n-mcp` | Workflow automation | M2 |
| `jarvis-rag` | Semantic search + ingest | M3 |
| `graphiti` | Temporal agent memory | M4 |
| `voicemode` | Voice input/output | M6 |

---

## Comparison: Current Jarvis vs. Post-Build Jarvis

| Capability | Current (v5.10.0) | After Milestones 0-5 |
|-----------|-------------------|---------------------|
| Memory across sessions | JICM v7 JSONL extraction (lossy) | Graphiti bi-temporal + Qdrant semantic + Redis working |
| Code search | Glob/Grep (requires knowing where) | Semantic search ("find defeat signal handler") |
| Research retrieval | Manual file reads | Natural language queries across all reports |
| Model inference | Claude API only | Local Qwen family + Claude fallback via LiteLLM |
| Workflow automation | Cron scripts + manual hooks | n8n visual workflows with webhooks |
| Session analytics | Flat log files | Structured PostgreSQL with trend queries |
| Knowledge relationships | Implicit (YAML cross-refs) | Explicit Neo4j graph with traversal |
| Embedding generation | None (relied on MCP) | Local Qwen3-Embedding-4B (50K tok/s) |
| File re-indexing | Manual | Automatic via n8n file watchers |
| Cost per query (local tasks) | ~$0.003-0.05 (Claude API) | $0.00 (local inference) |

---

## Estimated Timeline

| Milestone | Effort | Cumulative | What Works After |
|-----------|--------|-----------|-----------------|
| M0: Foundation | 2-3 hrs | 2-3 hrs | Python, Docker, Ollama, MLX |
| M1: Local Models | 3-4 hrs | 5-7 hrs | Local LLM queries, embeddings, vision |
| M2: Database Stack | 4-5 hrs | 9-12 hrs | All DBs running, MCP servers active |
| M3: RAG Pipeline | 4-6 hrs | 13-18 hrs | Semantic search across codebase + research |
| M4: Graphiti Memory | 4-6 hrs | 17-24 hrs | Persistent cross-session knowledge graph |
| M5: n8n Workflows | 3-4 hrs | 20-28 hrs | Automated indexing, health monitoring |
| M6: Voice Pipeline | 4-6 hrs | 24-34 hrs | "Hey Jarvis" voice interaction |
| M7: Service Mgmt | 2-3 hrs | 26-37 hrs | Auto-start, backups, health checks |
| **Total** | **26-37 hrs** | | **All 10 use cases operational** |

---

## What This Does NOT Cover (Future Work)

- **Multi-Mac TB5 Clustering (Phase 8)**: Requires additional hardware + macOS 26.2 RDMA
- **Fine-tuned models**: Training custom models on Jarvis-specific data
- **Graph-RAG**: Combining Neo4j knowledge graph with Qdrant vector retrieval
- **DSPy prompt optimization**: Compiler-optimized prompts for research tasks
- **lm-eval benchmarks**: Formal evaluation of local model quality
- **Monitoring stack**: Prometheus + Grafana for infrastructure metrics
- **Contextual retrieval enrichment**: LLM-enhanced chunks (adds complexity to M3)

These are Phase 2 enhancements after the base stack is proven.

---

*Mac Studio DB/AI Implementation Roadmap v1.0*
*Companion to: mac-studio-v1-infrastructure.md (full technical reference)*
*Jarvis v5.10.0 → v5.11.0 (target after completion)*
