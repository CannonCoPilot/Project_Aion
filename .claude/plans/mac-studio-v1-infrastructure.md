# Mac Studio v1 Infrastructure Plan

**Created**: 2026-02-17
**Hardware**: Apple M4 Max, 128GB unified memory, 926GB SSD (~847GB free), macOS 26.2
**Username**: `nathanielcannon` (host: `Nathaniels-Mac-Studio`)
**Branch**: `Project_Aion`
**Supersedes**: Roadmap II Phases C and D (now consolidated and research-informed)
**Research Base**: 6 deep research reports, 200+ sources (2026-02-17)

---

## Executive Summary

This plan transforms the Mac Studio M4 Max into a fully local AI infrastructure server for Jarvis, providing: local LLM inference (MLX-native, not vLLM), a production database stack, RAG pipelines, voice interaction, workflow automation, and a foundation for multi-Mac Thunderbolt 5 clustering. Every component is selected for Apple Silicon optimization and MCP integration with Claude Code.

**Key strategic shifts from Roadmap II**:
- **MLX replaces vLLM** — vLLM lacks Apple Silicon support; MLX is native and 17-87% faster
- **Qwen3 family replaces Llama 3** — user preference, superior multilingual + coding + vision coverage
- **Qdrant + PostgreSQL/ParadeDB replaces Supabase** — purpose-built for RAG, lower overhead, MCP-native
- **Haystack replaces LangChain** — lowest overhead, built-in headless API (Hayhooks), production-grade
- **exo replaces manual model sharding** — peer-to-peer distributed inference ready for TB5 RDMA

**Total estimated time**: 35-50 hours across 8 phases

---

## Memory Budget (128GB Unified)

```
┌──────────────────────────────────────────────────────────────────┐
│               128 GB UNIFIED MEMORY ALLOCATION                    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ macOS + Docker Engine                        10-12 GB        │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ Database Stack (Docker)                                      │ │
│  │   PostgreSQL 16 + ParadeDB        6 GB                       │ │
│  │   Qdrant (ARM64 native)           4-8 GB                     │ │
│  │   Neo4j CE + Graphiti             6 GB                       │ │
│  │   Redis Stack                     2 GB                       │ │
│  │   n8n (queue mode)                2 GB                       │ │
│  │                          Subtotal: ~20-24 GB                 │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ Model Serving (Native macOS)                                 │ │
│  │   Primary LLM (Qwen3-32B Q4)     20 GB                      │ │
│  │   Secondary LLM (Qwen3-8B)       5 GB                       │ │
│  │   Embedding (Qwen3-Embed-4B)     8 GB                       │ │
│  │   Reranker (BGE-v2-m3)           2 GB                       │ │
│  │   TTS (Kokoro-82M)               <1 GB                      │ │
│  │   STT (Whisper Large V3 Turbo)   3 GB                       │ │
│  │                          Subtotal: ~39 GB                    │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ Headroom / overflow              ~53-59 GB                   │ │
│  │   (70B Q4 model = 42GB if loaded instead of 32B+8B)         │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Operating modes**:
- **Standard**: 32B + 8B + embeddings + voice + all DBs = ~71 GB (57 GB headroom)
- **Heavy inference**: 70B Q4 + embeddings + all DBs = ~82 GB (46 GB headroom)
- **Multi-model**: 32B + VL-8B + Coder-Next + embeddings + DBs = ~80 GB (48 GB headroom)
- **Voice active**: Add ~4 GB (STT + TTS) to any mode above

---

## Phase 0: Foundation Bootstrap (~2 hrs)

**Goal**: Install base tooling that everything else depends on.

### 0.1 System Python & Package Manager
```bash
# Modern Python (system is 3.9.6 — too old for MLX, Haystack, etc.)
brew install python@3.12
# Verify: python3.12 --version

# uv — fast Python package manager (replaces pip/venv/conda)
brew install uv
# Verify: uv --version
```

### 0.2 Docker Desktop
```bash
brew install --cask docker
# Launch Docker Desktop, enable:
#   - Apple Virtualization framework
#   - VirtioFS (fastest file sharing)
#   - Memory limit: 32 GB (Docker doesn't see unified memory — this caps VM)
#   - CPU limit: 8 cores
#   - Disk: 200 GB
```

### 0.3 Core CLI Tools
```bash
brew install jq yq git-lfs tmux htop
# Node.js already installed (v24.13.1)
# git already installed
```

### 0.4 Ollama (Native — NOT Docker)
```bash
# CRITICAL: Run Ollama natively for Metal GPU acceleration
# Docker Ollama cannot access Metal — runs on CPU only
brew install ollama
ollama serve &  # Starts on localhost:11434
# Verify: curl http://localhost:11434/api/tags
```

**Why native Ollama**: Docker on macOS runs inside a Linux VM that cannot access Metal Performance Shaders. Native Ollama uses Metal directly, achieving 3-5x faster inference than Docker-based Ollama on Apple Silicon.

### 0.5 MLX Framework
```bash
uv pip install --system mlx mlx-lm mlx-vlm mlx-audio mlx-whisper
# Verify: python3.12 -c "import mlx; print(mlx.__version__)"
```

### Validation Checklist
- [ ] `python3.12 --version` → 3.12.x
- [ ] `uv --version` → installed
- [ ] `docker --version` → installed
- [ ] `ollama --version` → installed
- [ ] `curl localhost:11434/api/tags` → 200 OK
- [ ] `python3.12 -c "import mlx"` → no error

---

## Phase 1: Core Database Stack (~6 hrs)

**Goal**: Deploy all databases as a unified Docker Compose stack.

### 1.1 Docker Compose Stack

Create `/Users/nathanielcannon/Claude/Jarvis/infrastructure/docker-compose.yml`:

```yaml
version: "3.9"

services:
  # ─── RELATIONAL + VECTOR + FULL-TEXT (n8n backend + RAG) ─────────
  postgres:
    image: paradedb/paradedb:latest
    # ParadeDB = PostgreSQL 16 + pgvector + pg_search (BM25) pre-bundled
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

  # ─── VECTOR DATABASE (HIGH-PERFORMANCE RAG) ──────────────────────
  qdrant:
    image: qdrant/qdrant:latest
    # Native ARM64 — no Rosetta overhead
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

  # ─── GRAPH DATABASE (KNOWLEDGE GRAPH + AGENT MEMORY) ──────────────
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

  # ─── REDIS (AGENT MEMORY + WORKFLOW STATE + CACHING) ──────────────
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
      - "8001:8001"   # Redis Insight UI
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

  # ─── N8N WORKFLOW AUTOMATION ──────────────────────────────────────
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

### 1.2 Init Scripts

Create `infrastructure/init-scripts/01-create-databases.sql`:
```sql
-- Create separate databases for n8n and RAG
CREATE DATABASE n8n;
CREATE DATABASE rag;

-- Enable extensions in main jarvis DB
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_search;    -- ParadeDB BM25
```

### 1.3 Environment File

Create `infrastructure/.env`:
```bash
PG_USER=jarvis
PG_PASSWORD=<generate-secure>
PG_DB=jarvis
NEO4J_PASSWORD=<generate-secure>
N8N_ENCRYPTION_KEY=<generate-secure>
```
Store copies in `.claude/secrets/credentials.yaml` (gitignored).

### 1.4 Deployment & Verification
```bash
cd infrastructure
docker compose up -d
# Wait for healthchecks
docker compose ps  # All services "healthy"
```

### 1.5 MCP Server Registration

After databases are running, register MCP servers for Claude Code:
```bash
# Qdrant MCP
claude mcp add qdrant-mcp -- npx -y @qdrant/mcp-server-qdrant \
  --qdrant-url http://localhost:6333

# PostgreSQL MCP
claude mcp add postgres-mcp -- npx -y @crystaldba/postgres-mcp \
  --connection-string "postgresql://jarvis:<password>@localhost:5432/jarvis"

# Neo4j MCP
claude mcp add neo4j-memory -- docker run -i --rm mcp/neo4j-memory \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password <password>
```

### Validation Checklist
- [ ] `docker compose ps` → all 5 services healthy
- [ ] `psql -h localhost -U jarvis -c "SELECT 1"` → OK
- [ ] `curl localhost:6333/healthz` → OK
- [ ] `curl localhost:7474` → Neo4j browser accessible
- [ ] `redis-cli -h localhost ping` → PONG
- [ ] `curl localhost:5678` → n8n UI accessible
- [ ] MCP servers respond in Claude Code

---

## Phase 2: Model Serving Layer (~4 hrs)

**Goal**: Deploy Ollama + MLX model serving with the recommended model portfolio.

### 2.1 Pull Core Models via Ollama

```bash
# ─── Primary text models ───
ollama pull qwen3:32b          # 20 GB — all-around anchor
ollama pull qwen3:8b            # 5 GB — fast secondary / context gen
ollama pull qwen3:0.6b          # <1 GB — ultra-fast routing / classification

# ─── Coding ───
ollama pull qwen3-coder          # 17 GB — 30B MoE, 3.3B active params
# Qwen3-Coder-Next (80B-A3B MoE) — via HuggingFace GGUF when available

# ─── Vision / Multimodal ───
ollama pull qwen3-vl:8b         # 5 GB — image understanding
# Qwen2.5-Omni-7B — via MLX (audio+video+image+text)

# ─── Embedding ───
ollama pull qwen3-embedding:4b  # 8 GB — MTEB top-tier
ollama pull nomic-embed-text    # 1 GB — fast fallback

# ─── Alternative providers ───
ollama pull gpt-oss:20b         # 16 GB — OpenAI open-weight (when GGUF available)
```

### 2.2 MLX Model Server (High-Throughput)

For maximum throughput (continuous batching, speculative decoding):

```bash
# mlx-lm server — simple, fast
python3.12 -m mlx_lm.server --model mlx-community/Qwen3-32B-4bit --port 8080

# OR mlx-openai-server — multi-model, OpenAI-compatible
uv pip install mlx-openai-server
mlx-openai-server --config models.yaml --port 8080
```

`infrastructure/mlx-models.yaml`:
```yaml
models:
  - name: qwen3-32b
    path: mlx-community/Qwen3-32B-4bit
    default: true
  - name: qwen3-8b
    path: mlx-community/Qwen3-8B-4bit
  - name: qwen3-vl-8b
    path: mlx-community/Qwen3-VL-8B-Instruct-4bit
```

### 2.3 LiteLLM Router (Unified API)

Deploy LiteLLM as a single OpenAI-compatible endpoint routing to all backends:

```bash
uv pip install litellm[proxy]
```

`infrastructure/litellm-config.yaml`:
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
  - model_name: qwen3-vl
    litellm_params:
      model: ollama/qwen3-vl:8b
      api_base: http://localhost:11434
  - model_name: embedding
    litellm_params:
      model: ollama/qwen3-embedding:4b
      api_base: http://localhost:11434
  - model_name: claude-opus
    litellm_params:
      model: anthropic/claude-opus-4-6
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: os.environ/ANTHROPIC_API_KEY

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 2
  timeout: 120
```

```bash
litellm --config infrastructure/litellm-config.yaml --port 4000
# All models available at http://localhost:4000/v1/...
```

### 2.4 Model Selection Matrix

| Task | Primary Model | Fallback | RAM | Speed (est.) |
|------|--------------|----------|-----|--------------|
| General chat / reasoning | Qwen3-32B Q4 | Qwen3-8B | 20 GB | 20-30 tok/s |
| Coding / refactoring | Qwen3-Coder-Next | Qwen3-32B | 20 GB | ~100 tok/s (MoE) |
| Vision / images | Qwen3-VL-8B | — | 5 GB | 40-60 tok/s |
| Audio / omni | Qwen2.5-Omni-7B | — | 5 GB | 40-60 tok/s |
| Embedding | Qwen3-Embedding-4B | nomic-embed-text | 8 GB | 15K-25K tok/s |
| Reranking | BGE-Reranker-v2-m3 | — | 2 GB | Fast (cross-encoder) |
| Context generation (RAG) | Qwen3-8B | Qwen3-32B | 5 GB | 80-100 tok/s |
| Classification / routing | Qwen3-0.6B | — | <1 GB | 200+ tok/s |
| Variety / comparison | gpt-oss-20b | — | 16 GB | TBD |

### Validation Checklist
- [ ] `ollama list` → all models present
- [ ] `curl localhost:11434/api/generate -d '{"model":"qwen3:8b","prompt":"hello"}'` → generates
- [ ] MLX server responds on port 8080 (if running)
- [ ] LiteLLM responds on port 4000 (if running)

---

## Phase 3: RAG Pipeline (~8 hrs)

**Goal**: Build a production RAG pipeline with hybrid search, reranking, and MCP integration.

### 3.1 Architecture Overview

```
Jarvis/Claude Code
    │ MCP Protocol
    ▼
RAG MCP Server (FastMCP, port 8090)
    │
    ▼
Haystack Pipeline
    ├── Dense: Qdrant (vector similarity)
    ├── Sparse: BM25 (ParadeDB or Qdrant sparse vectors)
    ├── Fusion: Reciprocal Rank Fusion (RRF)
    └── Reranker: BGE-Reranker-v2-m3 → top-5 results

Ingestion (n8n triggered):
    File change → Chunk → Contextual enrich (Qwen3-8B) → Embed → Upsert Qdrant
```

### 3.2 Install Dependencies

```bash
uv pip install \
  haystack-ai \
  hayhooks \
  qdrant-haystack \
  sentence-transformers \
  rerankers[flashrank] \
  fastmcp \
  docling
```

### 3.3 Qdrant Collections

Create initial collections via REST API:
```bash
# jarvis-context — Jarvis session state, patterns, plans
curl -X PUT http://localhost:6333/collections/jarvis-context \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# codebase-jarvis — source code chunks
curl -X PUT http://localhost:6333/collections/codebase-jarvis \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'

# research — research reports and findings
curl -X PUT http://localhost:6333/collections/research \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":2560,"distance":"Cosine"}}'
```

### 3.4 RAG MCP Server

Build `infrastructure/rag-service/mcp_server.py`:
```python
from fastmcp import FastMCP

mcp = FastMCP("jarvis-rag")

@mcp.tool()
async def search(query: str, collection: str = "jarvis-context", top_k: int = 5):
    """Search the local RAG knowledge base with hybrid retrieval."""
    # Haystack pipeline: embed → retrieve → rerank → return
    ...

@mcp.tool()
async def ingest(file_path: str, collection: str = "jarvis-context"):
    """Ingest a document into the RAG knowledge base."""
    # Docling parse → chunk → contextual enrich → embed → upsert
    ...

@mcp.tool()
async def list_collections():
    """List all RAG collections with stats."""
    ...
```

### 3.5 Contextual Retrieval (Anthropic's Technique)

Before indexing each chunk, prepend a contextual summary using local Qwen3-8B:
```
[Context]: This chunk describes the PostgreSQL configuration for the Jarvis
infrastructure database stack on Mac Studio M4 Max, including shared_buffers
and connection pool settings.
[Original chunk]: shared_buffers=2GB effective_cache_size=6GB...
```

This reduces retrieval failure by 49-67% (Anthropic benchmarks).

### 3.6 n8n Indexing Workflows

Set up in n8n UI (port 5678):
1. **File Watcher** → detect new/modified files in `.claude/` and `projects/`
2. **Git Hook** → on commit, re-index changed files via `git diff --name-only`
3. **Nightly Full Re-index** → cron schedule, complete re-ingestion
4. **Smart Dedup** → store file hash in Qdrant metadata, skip unchanged files

### Validation Checklist
- [ ] Qdrant collections created (`curl localhost:6333/collections`)
- [ ] RAG MCP server responds via Claude Code
- [ ] Test search returns relevant results for "JICM context management"
- [ ] Test ingest processes a Markdown file correctly
- [ ] n8n indexing workflow triggers on file change

---

## Phase 4: Voice Pipeline (~6 hrs)

**Goal**: Give Jarvis a voice — local STT + TTS with <800ms latency.

### 4.1 STT: mlx-whisper

```bash
uv pip install mlx-whisper
# Pull Whisper Large V3 Turbo (quantized)
python3.12 -c "import mlx_whisper; mlx_whisper.transcribe('test.wav', path_or_hf_repo='mlx-community/whisper-large-v3-turbo')"
```

Performance: ~1s per audio segment on M4 Max.

### 4.2 TTS: Kokoro-82M via mlx-audio

```bash
uv pip install mlx-audio
# Kokoro-82M — #1 TTS Arena, <200ms latency
python3.12 -c "from mlx_audio.tts import generate; generate('Hello sir, I am Jarvis.', voice='af_sky')"
```

54 voice presets available. For a custom Jarvis voice, use F5-TTS voice cloning with reference audio.

### 4.3 Alternative: Pre-built JARVIS Voice (Piper)

```bash
# Pre-trained JARVIS voice model (jgkawell/jarvis on HuggingFace)
# Fast, lightweight, ONNX-based
pip install piper-tts
piper --model en_GB-jarvis-high.onnx --output_file jarvis.wav "Good evening, sir."
```

### 4.4 VAD + Wake Word

```bash
# Silero VAD — 1.8MB, 1ms per 30ms chunk
uv pip install silero-vad

# openWakeWord — custom "Hey Jarvis" wake word
uv pip install openwakeword
# Train custom wake word or use built-in "hey_jarvis" model
```

### 4.5 VoiceMode MCP Integration

The `mbailey/voicemode` MCP server provides a drop-in solution integrating Whisper STT + Kokoro TTS with Claude Code:

```bash
# Install VoiceMode MCP
claude mcp add voicemode -- npx -y @mbailey/voicemode
```

### 4.6 Full Pipeline Architecture

```
Mic → Silero VAD (gate) → mlx-whisper (STT) → Claude/Local LLM → Kokoro (TTS) → Speaker
              │                    │                    │                │
              1ms              ~1000ms             streaming         <200ms
                                              Total: <800ms (streaming)
```

### Validation Checklist
- [ ] mlx-whisper transcribes test audio correctly
- [ ] Kokoro generates speech with acceptable quality
- [ ] VoiceMode MCP registered and functional
- [ ] End-to-end latency <800ms measured

---

## Phase 5: Graphiti Agent Memory (~4 hrs)

**Goal**: Deploy Graphiti for bi-temporal AI agent knowledge graph memory.

### 5.1 Graphiti Setup

```bash
git clone https://github.com/getzep/graphiti.git /Users/nathanielcannon/Claude/infrastructure/graphiti
cd /Users/nathanielcannon/Claude/infrastructure/graphiti
```

Configure `.env`:
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<same-as-docker-compose>
# Graphiti uses an LLM for graph construction — route through LiteLLM
OPENAI_API_KEY=<litellm-key-or-anthropic-key>
OPENAI_BASE_URL=http://localhost:4000/v1  # LiteLLM proxy
```

### 5.2 Graphiti MCP Server

```bash
# Run Graphiti MCP server on port 8000
cd graphiti
python -m graphiti_core.mcp_server --port 8000
```

Register with Claude Code:
```bash
claude mcp add graphiti -- python -m graphiti_core.mcp_server \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password <password>
```

### 5.3 Memory Architecture

```
Jarvis Memory Tiers (Revised for Mac Studio):
┌─────────────────────────────────────────────────────┐
│ Tier 0: Working Memory — Redis (microsecond access) │
│   Session state, agent coordination, caching        │
├─────────────────────────────────────────────────────┤
│ Tier 1: Episodic Memory — Graphiti + Neo4j          │
│   Bi-temporal events, entity relationships,         │
│   conflict resolution, dynamic knowledge graph      │
├─────────────────────────────────────────────────────┤
│ Tier 2: Semantic Memory — Qdrant RAG                │
│   Document chunks, code, research, patterns         │
│   Hybrid BM25 + vector search + reranking           │
├─────────────────────────────────────────────────────┤
│ Tier 3: Archive — PostgreSQL + filesystem           │
│   Full documents, session logs, telemetry           │
│   Structured metadata, n8n workflow state            │
└─────────────────────────────────────────────────────┘
```

### Validation Checklist
- [ ] Graphiti server starts without errors
- [ ] MCP tools visible in Claude Code (`graphiti.add_episode`, `graphiti.search`)
- [ ] Can create and query a test episode
- [ ] Neo4j browser shows graph data at localhost:7474

---

## Phase 6: n8n Workflow Integration (~4 hrs)

**Goal**: Connect n8n to Jarvis with bidirectional workflow automation.

### 6.1 n8n Initial Configuration

1. Access n8n at `http://localhost:5678`
2. Create admin account
3. Settings → n8n API → Generate API key
4. Store API key in `.claude/secrets/credentials.yaml`

### 6.2 n8n MCP Server

```bash
# czlonkowski/n8n-mcp — 12.6K stars, 1,084 nodes documented
claude mcp add n8n-mcp -- npx -y n8n-mcp \
  --n8n-api-url http://localhost:5678/api/v1 \
  --n8n-api-key <api-key>
```

This gives Jarvis the ability to:
- Create and modify n8n workflows programmatically
- Activate/deactivate workflows
- Trigger workflow executions
- Read workflow execution results

### 6.3 Integration Patterns

**Pattern 1: Jarvis → n8n (MCP Build)**
Jarvis uses n8n-mcp tools to create/modify/trigger workflows from within Claude Code.

**Pattern 2: n8n → Jarvis (Webhook Callback)**
n8n workflows call Jarvis via webhook when external events occur (file changes, schedule triggers, alerts).

**Pattern 3: n8n + Local LLMs**
n8n AI nodes connect to Ollama via `http://host.docker.internal:11434` for local LLM-powered workflows.

**Pattern 4: n8n REST API**
Jarvis calls n8n REST API directly for workflow management:
```bash
curl -X GET http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: <key>"
```

### 6.4 Starter Workflows

Build these initial workflows in n8n:
1. **RAG Indexing**: File watcher → hash check → chunk → embed → upsert Qdrant
2. **Health Monitor**: Cron (5min) → check Docker services → alert on failure
3. **Git Automation**: Webhook on push → run tests → notify
4. **Research Ingest**: Watch research output dir → index new reports → update Qdrant

### Validation Checklist
- [ ] n8n API key stored in credentials
- [ ] n8n-mcp registered and functional in Claude Code
- [ ] Can create a test workflow via MCP
- [ ] Webhook endpoint responds
- [ ] Starter workflows active and functional

---

## Phase 7: Service Management (~3 hrs)

**Goal**: Reliable startup, monitoring, and backup for the full stack.

### 7.1 Startup Script

Create `infrastructure/start-stack.sh`:
```bash
#!/bin/bash
# Start the full Jarvis infrastructure stack

echo "Starting Jarvis infrastructure..."

# 1. Docker services (databases + n8n)
cd /Users/nathanielcannon/Claude/Jarvis/infrastructure
docker compose up -d
echo "Waiting for services to be healthy..."
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# 2. Ollama (native, background)
if ! pgrep -x "ollama" > /dev/null; then
    ollama serve &
    sleep 2
fi

# 3. LiteLLM router (background)
litellm --config /Users/nathanielcannon/Claude/Jarvis/infrastructure/litellm-config.yaml \
  --port 4000 &

echo "Stack started. Services:"
echo "  PostgreSQL:  localhost:5432"
echo "  Qdrant:      localhost:6333"
echo "  Neo4j:       localhost:7474 (browser) / 7687 (bolt)"
echo "  Redis:       localhost:6379 / 8001 (insight)"
echo "  n8n:         localhost:5678"
echo "  Ollama:      localhost:11434"
echo "  LiteLLM:     localhost:4000"
```

### 7.2 Health Check Script

Create `infrastructure/health-check.sh`:
```bash
#!/bin/bash
# Quick health check for all services

services=(
  "PostgreSQL:localhost:5432:pg_isready -h localhost -U jarvis"
  "Qdrant:localhost:6333:curl -sf http://localhost:6333/healthz"
  "Neo4j:localhost:7474:curl -sf http://localhost:7474"
  "Redis:localhost:6379:redis-cli ping"
  "n8n:localhost:5678:curl -sf http://localhost:5678/healthz"
  "Ollama:localhost:11434:curl -sf http://localhost:11434/api/tags"
)

for svc in "${services[@]}"; do
  IFS=: read -r name host port cmd <<< "$svc"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  [OK] $name ($host:$port)"
  else
    echo "  [FAIL] $name ($host:$port)"
  fi
done
```

### 7.3 Backup Script

Create `infrastructure/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/Users/nathanielcannon/Backups/jarvis/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# PostgreSQL
pg_dump -h localhost -U jarvis jarvis > "$BACKUP_DIR/postgres-jarvis.sql"
pg_dump -h localhost -U jarvis n8n > "$BACKUP_DIR/postgres-n8n.sql"

# Qdrant snapshots
curl -X POST http://localhost:6333/snapshots

# Neo4j (requires neo4j-admin in container)
docker exec jarvis-neo4j neo4j-admin database dump neo4j --to-path=/tmp/
docker cp jarvis-neo4j:/tmp/neo4j.dump "$BACKUP_DIR/"

echo "Backup complete: $BACKUP_DIR"
```

### 7.4 launchd Service (Auto-Start on Boot)

Create `~/Library/LaunchAgents/com.jarvis.infrastructure.plist` to auto-start Docker Compose on login.

### Validation Checklist
- [ ] `start-stack.sh` brings up all services
- [ ] `health-check.sh` reports all green
- [ ] `backup.sh` creates valid backups
- [ ] Services survive reboot (Docker Desktop auto-start + launchd)

---

## Phase 8: Future — Multi-Mac TB5 Clustering (Planning Only)

**Goal**: Document the path to multi-Mac-Studio distributed inference.

### 8.1 Prerequisites
- macOS 26.2+ (RDMA over Thunderbolt 5 support)
- Enable RDMA: boot to Recovery Mode → `rdma_ctl enable`
- Full-mesh TB5 topology (no switches exist)
  - 2 Macs = 1 cable
  - 3 Macs = 3 cables
  - 4 Macs = 6 cables (practical maximum)

### 8.2 exo Distributed Inference

```bash
pip install exo-explore
# On each Mac:
exo --discovery-module thunderbolt --rdma-enable
```

exo automatically:
- Discovers peers via mDNS/Thunderbolt
- Partitions model layers across available memory
- Achieves 3.2x speedup on 4 nodes for 1T-parameter models
- Latency: <50μs inter-node via RDMA (vs 300μs TCP)

### 8.3 Models Enabled by Clustering

| Model | Params | RAM Needed | Macs Required |
|-------|--------|-----------|---------------|
| Qwen3.5-397B-A17B | 397B MoE | 256+ GB | 2-3 Macs |
| gpt-oss-120b | 120B MoE | 60-80 GB | 1 Mac (tight) |
| Kimi K2 | 1T MoE | 500+ GB | 4 Macs |
| Llama 4 Behemoth | 2T MoE | 1+ TB | 4+ Macs |

### 8.4 Architecture Evolution

```
Phase v1 (Current plan — single Mac):
  Mac Studio → Ollama + MLX → LiteLLM → Jarvis

Phase v2 (2 Macs):
  Mac Studio 1 ←─TB5─→ Mac Studio 2
  exo cluster → shared model memory → LiteLLM → Jarvis

Phase v3 (4 Macs):
  Full mesh (6 TB5 cables)
  exo RDMA cluster → 512GB unified → massive models
```

---

## Port Map

| Port | Service | Protocol |
|------|---------|----------|
| 4000 | LiteLLM Proxy | HTTP (OpenAI-compatible) |
| 5432 | PostgreSQL | PostgreSQL wire |
| 5678 | n8n | HTTP |
| 6333 | Qdrant | HTTP REST |
| 6334 | Qdrant | gRPC |
| 6379 | Redis | Redis wire |
| 7474 | Neo4j Browser | HTTP |
| 7687 | Neo4j Bolt | Bolt |
| 8000 | Graphiti MCP | HTTP |
| 8001 | Redis Insight | HTTP |
| 8080 | MLX Server | HTTP (OpenAI-compatible) |
| 8090 | RAG MCP Server | HTTP |
| 11434 | Ollama | HTTP (OpenAI-compatible) |

---

## MCP Server Registry

| MCP Server | Purpose | Install |
|------------|---------|---------|
| `qdrant-mcp` | Vector search, RAG retrieval | `npx @qdrant/mcp-server-qdrant` |
| `postgres-mcp` | SQL queries, metadata | `npx @crystaldba/postgres-mcp` |
| `neo4j-memory` | Knowledge graph | `docker mcp/neo4j-memory` |
| `graphiti` | Temporal agent memory | `python graphiti_core.mcp_server` |
| `n8n-mcp` | Workflow automation | `npx n8n-mcp` |
| `voicemode` | STT + TTS | `npx @mbailey/voicemode` |
| `local-rag` | RAG search/ingest (custom) | Custom FastMCP server |

---

## Disk Budget

| Component | Estimated Size |
|-----------|---------------|
| Docker images (all services) | ~15 GB |
| Docker volumes (databases, growing) | ~20-50 GB |
| Ollama models (all pulled) | ~80-100 GB |
| MLX model cache | ~40-60 GB |
| RAG indexed data | ~10-30 GB |
| Total estimated | ~165-255 GB |
| Remaining from 847 GB free | ~590-680 GB |

---

## Implementation Order & Dependencies

```
Phase 0: Foundation Bootstrap
    │ (no dependencies)
    ▼
Phase 1: Core Database Stack
    │ (requires Docker)
    ├──────────────────────┐
    ▼                      ▼
Phase 2: Model Serving    Phase 5: Graphiti
    │ (requires Ollama)    │ (requires Neo4j)
    ▼                      │
Phase 3: RAG Pipeline ◄───┘
    │ (requires Qdrant + Ollama + embeddings)
    ▼
Phase 4: Voice Pipeline
    │ (requires MLX)
    │
Phase 6: n8n Integration
    │ (requires n8n running + API key)
    ▼
Phase 7: Service Management
    │ (requires all above)
    ▼
Phase 8: Multi-Mac (FUTURE — planning only)
```

**Phases 2 and 5 can run in parallel** (Model Serving + Graphiti).
**Phase 4 (Voice) is independent** — can be done at any point after Phase 0.

---

## Revision Notes

This plan supersedes Roadmap II Phases C and D with the following changes:

| Roadmap II Item | Status | Replacement |
|----------------|--------|-------------|
| C.1 Docker setup | **Absorbed** → Phase 1 (expanded with full DB stack) |
| C.2 Obsidian Vault | **Deferred** — Qdrant RAG covers the primary use case; Obsidian can be added later as a UI layer |
| C.3 n8n setup | **Absorbed** → Phase 1 (Docker) + Phase 6 (integration) |
| C.4 Local Supabase | **Replaced** → PostgreSQL + ParadeDB covers auth/storage; Supabase adds unnecessary overhead |
| C.5 Language Servers | **Deferred** — not blocking for AI infra; add in a future sprint |
| D.1 vLLM | **Replaced** → MLX + Ollama + mlx-openai-server (Phase 2) — vLLM has no Apple Silicon support |
| D.2 lm-eval-harness | **Deferred** — add after models are serving |
| D.3 DSPy | **Deferred** — add after RAG pipeline is validated |
| D.4 RAG pipeline | **Absorbed** → Phase 3 (expanded with Haystack + contextual retrieval) |
| D.5 Voice pipeline | **Absorbed** → Phase 4 (new — not in original Roadmap II) |

---

## Sources

Research reports synthesized in this plan:
1. Apple Silicon Inference Stack — `.claude/agents/memory/deep-research/apple-silicon-inference-2026-02-17.md`
2. Qwen Model Catalog — `.claude/agents/memory/deep-research/qwen-model-catalog-2026-02-17.md`
3. Voice Pipeline — `.claude/agents/memory/deep-research/voice-pipeline-research-2026-02-17.md`
4. Database Stack — `.claude/reports/research/database-stack-ai-infrastructure-2026-02-17.md`
5. n8n Integration — `.claude/agents/memory/deep-research/n8n-jarvis-integration-2026-02-17.md`
6. RAG Pipeline — `.claude/reports/research/rag-pipeline-local-deployment-2026-02-17.md`

Combined: 200+ external sources across academic papers, official documentation, benchmarks, and community reports.
