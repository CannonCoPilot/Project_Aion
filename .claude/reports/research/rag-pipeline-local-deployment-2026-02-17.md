# Research Report: Local RAG Pipeline Architecture for Apple M4 Max

**Date**: 2026-02-17
**Scope**: Comprehensive analysis of local embedding models, vector databases, RAG frameworks, advanced retrieval techniques, integration patterns for Jarvis/Claude Code, indexing pipelines, and performance estimates on Apple M4 Max (128 GB). No cloud dependencies.

---

## Executive Summary

The local RAG ecosystem has matured dramatically in 2025-2026. A fully capable, production-grade RAG pipeline can now run entirely on an Apple M4 Max Mac Studio with 128 GB unified memory, with no cloud dependencies. The stack recommendation centers on: **Qwen3-Embedding-4B** (via Ollama REST API) for embeddings, **Qdrant** (Docker, ARM64-native) as the vector store, **Haystack with Hayhooks** as the headless API-first RAG orchestrator, and **BGE-Reranker-v2-m3** for local reranking. Integration with Jarvis/Claude Code is best achieved via an **MCP server** exposing the pipeline, with **n8n** handling automated incremental indexing triggers.

The M4 Max at 128 GB provides a qualitative leap over commodity hardware: it can handle 70B+ parameter models at ~15-20 tokens/second, embed text at ~9,000-44,000 tokens/second depending on model, and sustain all components simultaneously within its 546 GB/s memory bandwidth budget. The architecture below is designed to be API-first, headless, and composable for multi-agent use.

---

## Section 1: Local Embedding Models

### 1.1 Model Landscape

#### Qwen3 Embedding Series (Recommended Primary)
Released June 2025 by Alibaba/QwenLM. Built on the Qwen3 foundation model using dual-encoder architecture with LoRA fine-tuning. Available in three sizes.

| Variant | Parameters | MTEB Multilingual | MTEB Code | Rec. Use |
|---------|-----------|-------------------|-----------|----------|
| Qwen3-Embedding-0.6B | 0.6B | Competitive | High | Edge/fast |
| Qwen3-Embedding-4B | 4B | Top-tier | ~78 | Production balance |
| Qwen3-Embedding-8B | 8B | **#1 (70.58)** | **80.68** (SOTA) | Max quality |

Qwen3-Embedding-8B holds the #1 position on the MTEB Multilingual Leaderboard as of June 2025, outperforming Gemini-Embedding (proprietary). MLX-native server available: `jakedahn/qwen3-embeddings-mlx` on GitHub achieves 44,000 tokens/second on M2 Max. On M4 Max, expect 50,000+ tokens/second for the 0.6B variant. Available via Ollama (`ollama pull qwen3-embedding`).

**Source**: [Qwen3 Embedding Blog](https://qwenlm.github.io/blog/qwen3-embedding/), [Hugging Face Qwen3-Embedding-8B](https://huggingface.co/Qwen/Qwen3-Embedding-8B), [MLX server](https://github.com/jakedahn/qwen3-embeddings-mlx)

#### BGE-M3 (Best for Multilingual + Multi-Functional)
From BAAI (Beijing Academy of Artificial Intelligence). The "M3" refers to Multi-linguality (100+ languages), Multi-granularities (up to 8,192 tokens), Multi-Functionality (dense + sparse/BM25 + ColBERT multi-vector in one model).

- MTEB Overall: ~63.0
- RAG Retrieval Accuracy (real-world test): **72%** — highest among tested models
- Long-question accuracy: **92.5%**
- License: MIT
- Size: ~570M parameters, ~2.4 GB
- Context: 8,192 tokens
- Embedding dimension: 1,024 (dense), variable (sparse)

BGE-M3's unique value is that a single model can do dense retrieval, sparse BM25-compatible retrieval, and ColBERT multi-vector retrieval simultaneously, making it ideal for hybrid search without running two separate models.

**Source**: [BAAI/bge-m3 Hugging Face](https://huggingface.co/BAAI/bge-m3), [NV-Embed vs BGE-M3 vs Nomic](https://ai-marketinglabs.com/lab-experiments/nv-embed-vs-bge-m3-vs-nomic-picking-the-right-embeddings-for-pinecone-rag)

#### nomic-embed-text (Best Lightweight / Fast)
- MTEB Overall: 62.39, Retrieval: 49.01
- Size: ~548 MB
- Context: 8,192 tokens (significant advantage)
- Speed on M2 Max via Ollama: ~9,340 tokens/second at batch 128
- Short-question performance comparable to mxbai-embed-large
- Available: `ollama pull nomic-embed-text`

**Source**: [Ollama nomic-embed-text](https://ollama.com/library/nomic-embed-text), [Collabnix Ollama Embeddings Guide](https://collabnix.com/ollama-embedded-models-the-complete-technical-guide-for-2025-enterprise-deployment/)

#### mxbai-embed-large-v1
- MTEB Overall: **64.68** — highest among the "classic" open models
- Retrieval: 54.39, STS: 76.82, Classification: 72.15
- Context: 512 tokens (limitation for long documents)
- Size: ~1.34 GB
- Speed on M2 Max: ~6,780 tokens/second at batch 64
- Strong on context-heavy and long questions (82.5% retrieval accuracy)

**Source**: [Best Open-Source Embedding Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)

#### GTE Models (Alibaba-NLP)
GTE (General Text Embeddings) from Alibaba-NLP. Latest generation: GTE-Qwen2 series.
- Context: up to 32,768 tokens
- Competitive MTEB scores, strong multilingual performance
- Available as `Alibaba-NLP/gte-Qwen2-7B-instruct` on Hugging Face
- Note: Qwen3-Embedding supersedes GTE-Qwen for most use cases

### 1.2 Embedding Dimension vs Quality Trade-offs

| Dimension | Models | Storage per 1M chunks | Retrieval Quality |
|-----------|--------|----------------------|-------------------|
| 384 | all-MiniLM-L6-v2 | ~1.5 GB | Baseline |
| 768 | nomic-embed-text, nomic-embed-text-v2-moe | ~3 GB | Good |
| 1,024 | BGE-M3, mxbai-embed-large | ~4 GB | Very Good |
| 2,048-4,096 | Qwen3-8B, GTE-Qwen2-7B | ~8-16 GB | Excellent |

Matryoshka Representation Learning (MRL) models like nomic-embed-text-v2-moe allow truncating dimensions at query time for a 3x storage reduction with modest quality loss.

### 1.3 Serving Embeddings as a REST API

**Option A: Ollama (Simplest)**
```
ollama serve  # runs on localhost:11434
curl http://localhost:11434/api/embed \
  -d '{"model": "qwen3:0.6b", "input": "your text here"}'
```
Compatible with OpenAI SDK via `base_url="http://localhost:11434/v1"`.

**Option B: MLX-native server (Fastest throughput)**
```
# jakedahn/qwen3-embeddings-mlx
python -m qwen3_embeddings_mlx.server --model Qwen/Qwen3-Embedding-4B --port 8080
```
Hot-swappable models, batch processing, REST API. Best throughput on M4 Max.

**Option C: FastAPI + sentence-transformers (Most flexible)**
```python
from sentence_transformers import SentenceTransformer
from fastapi import FastAPI
model = SentenceTransformer("BAAI/bge-m3")
app = FastAPI()
@app.post("/embed")
def embed(texts: list[str]):
    return {"embeddings": model.encode(texts).tolist()}
```

**Source**: [Ollama Embedding Models](https://ollama.com/blog/embedding-models), [qwen3-embeddings-mlx](https://github.com/jakedahn/qwen3-embeddings-mlx)

---

## Section 2: Chunking and Document Processing

### 2.1 Chunking Strategy Comparison

| Strategy | Quality | Speed | Complexity | Best For |
|----------|---------|-------|------------|----------|
| Fixed-size | Low | Fastest | Trivial | Prototyping only |
| Recursive Character | Good | Fast | Low | General purpose (default) |
| Structure-aware (Markdown/HTML) | Very Good | Fast | Low | Structured docs |
| Semantic (embedding-based) | Excellent | Slow (10x) | Medium | Knowledge bases, tech docs |
| Hierarchical (RAPTOR) | Excellent | Slowest | High | Long docs, multi-hop |
| LLM-based | Best | Very Slow | High | High-value, small corpora |
| Code-aware | Good | Fast | Low | Source code repos |

**Practical recommendation**: Start with `RecursiveCharacterTextSplitter` (LangChain) at 512 tokens / 10% overlap. Switch to structure-aware for Markdown/HTML docs. Use semantic chunking for knowledge bases if the 70% accuracy improvement justifies the compute cost.

Optimal defaults: **256-512 tokens per chunk, 10-20% overlap**.

**Source**: [Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag), [Document Chunking for RAG — LLM Practical Experience Hub](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)

### 2.2 Code-Aware Chunking

LangChain's `RecursiveCharacterTextSplitter` supports language-aware code parsing:
```python
from langchain.text_splitter import RecursiveCharacterTextSplitter, Language
splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON,
    chunk_size=1000,
    chunk_overlap=100
)
```
Supported: Python, JavaScript, TypeScript, Go, Rust, Ruby, C, C++, Java, Markdown, HTML, LaTeX.

LlamaIndex's `CodeSplitter` uses AST (tree-sitter) for semantically correct code splits at function/class boundaries — the preferred approach for source code repositories.

### 2.3 Document Loaders

| Format | LangChain | LlamaIndex | Notes |
|--------|-----------|------------|-------|
| PDF | PyPDFLoader, UnstructuredPDFLoader | SimpleDirectoryReader | Unstructured best for complex layouts |
| DOCX | Docx2txtLoader | DocxReader | |
| HTML | BSHTMLLoader | SimpleWebPageReader | BeautifulSoup-based |
| Markdown | UnstructuredMarkdownLoader | MarkdownReader | |
| Code (repo) | GitLoader | GithubRepositoryReader | Git-aware |
| JSON | JSONLoader | JSONReader | |
| CSV | CSVLoader | PandasCSVReader | |

**Docling** (IBM, 2024): New open-source document parsing library with strong OCR, table extraction, and structure preservation. Integrates with LlamaIndex. Recommended for complex PDFs with tables/figures.

**LlamaParse**: Managed cloud service by LlamaIndex for high-quality document parsing. Not fully local. For fully local equivalent, use Docling.

### 2.4 Metadata Extraction

Preserve metadata with each chunk for filtered retrieval:
- Source file path and URL
- Document title, author, date
- Page/section number
- Heading hierarchy
- Git commit hash (for code)
- Document type/category

**Source**: [Smart Chunking for Smarter RAG — Medium](https://medium.com/@tam.tamanna18/smart-chunking-for-smarter-rag-methods-and-tools-for-2025-bda0164ea3e6)

---

## Section 3: RAG Frameworks

### 3.1 Comparison Matrix

| Aspect | LlamaIndex | LangChain | Haystack | RAGFlow |
|--------|-----------|-----------|---------|---------|
| Primary focus | Data/RAG | General LLM apps | Production pipelines | Visual RAG |
| API-first/headless | Moderate (FastAPI needed) | Moderate | **Excellent (Hayhooks)** | Limited |
| Framework overhead | ~6 ms | ~10 ms | **~5.9 ms** | N/A |
| Token efficiency | ~1.60k | ~2.40k | **~1.57k** | N/A |
| Hybrid search built-in | Yes | Yes | Yes | Yes |
| Reranking | Yes | Yes | Yes | Yes |
| Graph-RAG | Limited | Via LangGraph | Limited | No |
| Production stability | Good | Variable | **Excellent** | Good |
| REST API | Manual FastAPI | Manual | **Hayhooks (built-in)** | Web UI |
| Docker support | Yes | Yes | **Yes (Hayhooks)** | Yes |
| Local LLM support | **Excellent** | Good | Good | Good |
| Onboarding time | 2-3 days | 3-5 days | 3-4 days | 1-2 days |
| Best for | Pure RAG, complex indexes | Complex agents | **Production headless** | Visual config |

**Source**: [Best RAG Frameworks 2025 — LLM Practical Experience Hub](https://langcopilot.com/posts/2025-09-18-top-rag-frameworks-2024-complete-guide), [RAG Frameworks — AIM Research](https://research.aimultiple.com/rag-frameworks/)

### 3.2 Individual Framework Analysis

**LlamaIndex**: Best-in-class for document indexing sophistication. HierarchicalNodeParser, RAPTOR integration, multi-modal support. 35% retrieval accuracy boost in 2025. Achieved 40% faster document retrieval than LangChain in benchmarks. Recommended when the primary challenge is complex data ingestion and retrieval from diverse sources. Not API-first by default — needs FastAPI wrapper.

**Haystack (deepset)**: Production-ready with Hayhooks providing a FastAPI-based server out of the box. REST API, streaming responses, OpenAI-compatible chat endpoints, Docker/Kubernetes deployment. Lowest token usage per query (~1.57k). Best uptime in production (99.9% reported). **Primary recommendation for headless API-first deployment.**

**LangChain**: Largest ecosystem, most integrations. Best for rapid prototyping. LangGraph extends it for complex agentic workflows. Higher overhead and token usage. Reports of breaking API changes are a concern for production stability. Use when you need the broadest integration catalog.

**RAGFlow**: Excels at complex document understanding (tables, visual elements). Low-code visual interface. Best when non-technical users need to configure pipelines. Not ideal for headless API deployment.

**PrivateGPT / Anything-LLM / Open WebUI**: All-in-one solutions with chat UI. Good for end-user document Q&A but not designed for headless API-first deployments. Exclude from Jarvis architecture.

### 3.3 Verdict for Jarvis

**Primary: Haystack + Hayhooks** for the headless API layer. **Secondary: LlamaIndex** for complex indexing pipelines (can be called from within Haystack or run as a separate ingestion service).

**Source**: [Deploy AI Pipelines Faster with Hayhooks](https://haystack.deepset.ai/blog/deploy-ai-pipelines-faster-with-hayhooks), [Haystack GitHub](https://github.com/deepset-ai/haystack)

---

## Section 4: Vector Databases

### 4.1 Comparison Matrix

| Aspect | Qdrant | LanceDB | Chroma | Milvus |
|--------|--------|---------|--------|--------|
| Language | Rust | Rust | Python | Go/C++ |
| Architecture | Client-server | Embedded | Embedded/server | Distributed |
| Apple Silicon | Native ARM64 Docker | Native (no Docker) | Native | Heavy (Standalone mode) |
| Performance (ARM) | 10-20% slower than x86, consistent | Excellent | Good | Variable |
| Metadata filtering | Excellent | Good | Good | Excellent |
| Hybrid search | Yes (dense+sparse) | Yes | Limited | Yes |
| Persistent storage | Yes | Yes (Lance format) | Yes | Yes |
| Scale | Medium-Large | Small-Large | Small-Medium | Massive |
| Production readiness | High | Medium | Medium | High |
| Deployment complexity | Low (Docker) | Trivial (embedded) | Low | High |
| Disk-based indexing | DiskANN | Lance columnar | No | DiskANN, IVF |
| Multi-collection | Yes | Yes | Yes | Yes |

### 4.2 Recommendation for Jarvis

**Primary: Qdrant** — best balance of production features, filtering, hybrid search support, and Apple Silicon compatibility. Official Docker image is multi-arch (ARM64 native, no emulation). Rust-based, low memory footprint.

```yaml
# docker-compose.yml excerpt
qdrant:
  image: qdrant/qdrant:latest
  platform: linux/arm64
  ports:
    - "6333:6333"
    - "6334:6334"  # gRPC
  volumes:
    - ./qdrant_storage:/qdrant/storage
```

**Alternative: LanceDB** for an embedded zero-server option if you want to avoid Docker overhead for smaller collections (< 10M vectors). Integrates natively with Python ML toolchain (pandas, numpy, arrow).

**Source**: [Qdrant ARM Architecture](https://qdrant.tech/blog/qdrant-supports-arm-architecture/), [Vector Database Comparison 2025](https://liquidmetal.ai/casesAndBlogs/vector-comparison/), [Best Vector Databases 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

---

## Section 5: Advanced RAG Techniques

### 5.1 Hybrid Search (High Impact, Recommended)

Combine dense vector search with BM25/sparse keyword search. Use Reciprocal Rank Fusion (RRF) to merge ranked result lists.

Benefits:
- Handles both semantic queries ("what is X about") and exact-term queries ("find mentions of API v3.2")
- Reduces hallucinations by grounding in exact token matches
- 15-25% improvement in retrieval precision over vector-only

BGE-M3 can produce both dense and sparse embeddings from one model, making it ideal for hybrid search without running two separate models.

Qdrant natively supports hybrid search with its sparse vector fields alongside dense vectors.

**Source**: [Optimizing RAG with Hybrid Search & Reranking — VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)

### 5.2 Reranking with Cross-Encoders (High Impact, Recommended)

After initial retrieval (top-k = 20-50 candidates), rerank with a cross-encoder that reads query+document jointly for higher accuracy than bi-encoder similarity alone.

**Local reranker recommendations:**

| Model | Size | Multilingual | Notes |
|-------|------|-------------|-------|
| BAAI/bge-reranker-v2-m3 | ~570M params | Yes (100+ langs) | Best open-source, Apache 2.0 |
| BAAI/bge-reranker-large | ~560M params | No (EN) | Strong English performance |
| mixedbread-ai/mxbai-rerank-v2 | ~570M params | Moderate | Current OSS SOTA via Qwen backbone |
| jinaai/jina-reranker-v2-base | ~278M params | Yes | 8,192 token context, fast |
| ms-marco-MiniLM-L-6-v2 | ~22M params | No | Very fast, lower accuracy |

Use the `AnswerDotAI/rerankers` library for a unified API:
```python
from rerankers import Reranker
ranker = Reranker("BAAI/bge-reranker-v2-m3", model_type="cross-encoder")
results = ranker.rank(query="...", docs=[...])
```
FlashRank (ONNX) variant runs efficiently on CPU/Apple Silicon without GPU dependencies.

**Source**: [Top 7 Rerankers for RAG — Analytics Vidhya](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/), [rerankers library](https://github.com/AnswerDotAI/rerankers)

### 5.3 Contextual Retrieval (Anthropic's Approach — High Impact)

**Problem**: Traditional RAG chunks lose document context. A chunk saying "revenue grew 3% over the previous quarter" is ambiguous without knowing which company and quarter.

**Solution**: Before indexing, use an LLM to prepend a 3-4 sentence contextual summary to each chunk explaining its position within the source document.

**Results** (Anthropic's benchmarks):
- Contextual Embeddings alone: 35% reduction in retrieval failure (5.7% → 3.7%)
- Contextual Embeddings + Contextual BM25: 49% reduction (5.7% → 2.9%)
- Full stack (contextual + hybrid + reranking): up to **67% failure rate reduction**

**Cost optimization**: Use Claude's prompt caching when generating contextual summaries — up to 90% cost reduction for repeated document processing. For fully local deployment, use a small fast model (Qwen 7B via Ollama) for context generation.

```python
CONTEXT_PROMPT = """
<document>
{full_document}
</document>
Here is the chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>
Please give a short succinct context to situate this chunk within the overall document
for the purposes of improving search retrieval. Answer only with the succinct context
and nothing else.
"""
```

**Source**: [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval), [DataCamp Implementation Guide](https://www.datacamp.com/tutorial/contextual-retrieval-anthropic)

### 5.4 RAPTOR — Hierarchical Summarization (For Long-Document RAG)

RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval) builds a multi-level tree of summaries:
1. Chunk source documents into leaf nodes
2. Cluster semantically similar leaves
3. Summarize each cluster with an LLM
4. Recurse upward until a single root summary
5. Store all levels in a "collapsed tree" (one flat vector store)

At query time, retrieval finds the right abstraction level automatically. 20% improvement on QuALITY benchmark (complex multi-step reasoning).

RAGFlow has first-class RAPTOR support via `enable_raptor` setting.

**Cost note**: LLM summarization at scale is expensive. Fine-tune a small local model (Qwen 3B) for summarization to reduce cost while maintaining quality.

**Use when**: Documents are long (> 20 pages), queries require multi-hop reasoning across sections, or you need hierarchical question-answering (high-level + detail).

**Source**: [RAPTOR Paper arXiv](https://arxiv.org/abs/2401.18059), [RAGFlow RAPTOR Docs](https://ragflow.io/docs/enable_raptor)

### 5.5 Graph-RAG (For Multi-Entity Reasoning)

Graph-RAG combines a knowledge graph (entities + relationships) with vector retrieval. Enables:
- Cross-document entity reasoning ("how does X relate to Y across all documents")
- Multi-hop queries that require chaining through relationships
- Explainable retrieval (can show which entities were traversed)

Microsoft GraphRAG (open-source) builds entity-relation graphs from corpora. LlamaIndex has `KnowledgeGraphIndex`. Neo4j + LlamaIndex is a common production pattern.

**Use when**: Knowledge base contains many inter-related entities (people, products, events) and queries often require reasoning across relationships.

### 5.6 Agentic RAG

Rather than a fixed pipeline, an agent dynamically decides:
- Whether to retrieve at all
- Which collection to retrieve from
- How many retrieval rounds to perform
- Whether to decompose a complex query into sub-queries

Implemented via LlamaIndex agents or LangGraph. A-RAG (2025 paper) formalizes the principles: Autonomous Strategy, Iterative Execution, Interleaved Tool Use.

**Source**: [A-RAG Paper 2025](https://arxiv.org/html/2602.03442v1)

---

## Section 6: Integration Architecture

### 6.1 Integration Patterns for Jarvis/Claude Code

**Pattern A: MCP Server (Recommended for Jarvis)**

Expose the RAG pipeline as an MCP server. Claude Code (Jarvis) calls MCP tools: `search_documents`, `ingest_document`, `list_collections`.

Existing reference implementations:
- `shinpr/mcp-local-rag`: Zero-setup Node.js MCP server, works with Claude Code via `claude mcp add`
- `doITmagic/rag-code-mcp`: Semantic code navigation MCP for Claude, using Qdrant + Ollama
- `ItMeDiaTech/rag-cli`: ChromaDB + Sentence Transformers + LangChain MCP bridge for Claude Code

Custom implementation pattern:
```python
# FastMCP server wrapping LlamaIndex/Haystack pipeline
from fastmcp import FastMCP
mcp = FastMCP("local-rag")

@mcp.tool()
async def search(query: str, collection: str = "default", top_k: int = 5) -> list[dict]:
    """Search the local RAG knowledge base."""
    return pipeline.retrieve(query, collection=collection, top_k=top_k)

@mcp.tool()
async def ingest(file_path: str, collection: str = "default") -> dict:
    """Ingest a document into the knowledge base."""
    return pipeline.ingest(file_path, collection=collection)
```

**Pattern B: REST API (FastAPI wrapper)**

Haystack with Hayhooks provides this out of the box. FastAPI running on port 8080, exposing:
- `POST /query` — RAG query
- `POST /ingest` — document ingestion
- `GET /collections` — list collections
- OpenAI-compatible `/v1/chat/completions` endpoint

LlamaIndex can be wrapped similarly via FastAPI.

**Pattern C: Direct Python Library**

Import LlamaIndex or Haystack directly in a Python agent script. No HTTP overhead. Best for tightly coupled integrations.

**Source**: [mcp-local-rag GitHub](https://github.com/shinpr/mcp-local-rag), [rag-code-mcp GitHub](https://github.com/doITmagic/rag-code-mcp), [Claude RAG MCP Pipeline](https://glama.ai/mcp/servers/@kenjisekino/claude-rag-mcp-pipeline)

### 6.2 Multi-Collection Management

Qdrant supports named collections natively. Design suggestions:
- `jarvis-context` — Jarvis session state, patterns, plans
- `codebase-{repo}` — per-repository code chunks
- `projects-{name}` — per-project documentation
- `research` — research reports and findings
- `web-cache` — cached web pages for offline reference

### 6.3 n8n Integration for Indexing Triggers

n8n (self-hosted) handles the indexing orchestration layer:
- File system watcher → detect new/modified files → trigger ingestion pipeline
- Git webhook → detect commits → re-index changed files only
- Scheduled full re-index (nightly)
- Smart deduplication via file hash comparison

n8n has 549+ AI RAG workflow templates. Supports Qdrant natively as a vector store node.

Example workflow: `File Modified → Hash Check → If Changed → Chunk → Embed (Ollama) → Upsert (Qdrant)`

Incremental indexing strategy:
1. Store file hash + chunk IDs in Qdrant payload metadata
2. On file change: delete old vectors by file_path filter, re-ingest
3. For Git repos: use `git diff --name-only` to get changed files, re-index only those

**Source**: [n8n RAG Pipeline Blog](https://blog.n8n.io/rag-pipeline/), [n8n RAG Docs](https://docs.n8n.io/advanced-ai/rag-in-n8n/), [Self-updating RAG with n8n + Qdrant](https://n8n.io/workflows/7647-build-a-self-updating-rag-system-with-openai-google-gemini-qdrant-and-google-drive/)

---

## Section 7: Recommended Architecture

### 7.1 Text-Based Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mac Studio M4 Max (128 GB)                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  QUERY PATH (Real-time)                  │   │
│  │                                                          │   │
│  │  Jarvis / Claude Code                                    │   │
│  │       │                                                  │   │
│  │       ▼ MCP Protocol                                     │   │
│  │  ┌──────────────┐                                        │   │
│  │  │  RAG MCP     │◄─── FastMCP server (Python)            │   │
│  │  │  Server      │     Port 8090                          │   │
│  │  └──────┬───────┘                                        │   │
│  │         │                                                │   │
│  │         ▼                                                │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              Haystack Pipeline                    │   │   │
│  │  │  1. Query → Hybrid Retriever                      │   │   │
│  │  │     ├── Dense: Qdrant (vector similarity)         │   │   │
│  │  │     └── Sparse: BM25 index                        │   │   │
│  │  │  2. RRF Fusion → top-50 candidates                │   │   │
│  │  │  3. BGE-Reranker-v2-m3 → top-5 results            │   │   │
│  │  │  4. Return chunks + metadata + scores             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │         │ Dense vectors          │ Sparse index          │   │
│  │         ▼                        ▼                       │   │
│  │  ┌─────────────┐        ┌──────────────────┐            │   │
│  │  │   Qdrant    │        │   BM25 Index     │            │   │
│  │  │  (Docker)   │        │  (Elasticsearch  │            │   │
│  │  │  Port 6333  │        │   or in-memory)  │            │   │
│  │  └─────────────┘        └──────────────────┘            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 INGESTION PATH (Background)              │   │
│  │                                                          │   │
│  │  n8n (self-hosted, Port 5678)                            │   │
│  │  Triggers: file watcher │ git hook │ cron schedule       │   │
│  │       │                                                  │   │
│  │       ▼                                                  │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │           Ingestion Pipeline                      │   │   │
│  │  │  1. Load document (Docling / LlamaIndex loaders)  │   │   │
│  │  │  2. Chunk (Recursive / Code-aware / Semantic)     │   │   │
│  │  │  3. Contextual enrichment (Qwen 7B local LLM)     │   │   │
│  │  │  4. Embed (Ollama → qwen3-embedding:4b)           │   │   │
│  │  │     REST: localhost:11434/api/embed                │   │   │
│  │  │  5. Upsert to Qdrant (with metadata + file hash)  │   │   │
│  │  │  6. Update BM25 index                             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              EMBEDDING SERVICE                           │   │
│  │  Ollama (Port 11434)                                     │   │
│  │  Models: qwen3-embedding:4b (primary)                    │   │
│  │          nomic-embed-text (fast fallback)                │   │
│  │  OR: MLX native server (Port 8080, max throughput)       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Docker Compose Configuration

```yaml
version: "3.9"
services:
  qdrant:
    image: qdrant/qdrant:latest
    platform: linux/arm64
    restart: unless-stopped
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./data/qdrant:/qdrant/storage
    environment:
      QDRANT__SERVICE__GRPC_PORT: 6334

  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ./data/ollama:/root/.ollama
    # Note: Ollama runs natively on macOS host for Metal acceleration
    # Use host network mode or run Ollama directly on host

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    volumes:
      - ./data/n8n:/home/node/.n8n
      - /Users/nathanielcannon:/files:ro  # read-only access to index
    environment:
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: ${N8N_PASSWORD}

  rag-api:
    build: ./rag-service
    restart: unless-stopped
    ports:
      - "8090:8090"
    environment:
      QDRANT_URL: http://qdrant:6333
      OLLAMA_URL: http://host.docker.internal:11434
    depends_on:
      - qdrant
```

**Note on Ollama**: Run Ollama natively on macOS host (not in Docker) to use Metal GPU acceleration. Access from Docker containers via `host.docker.internal:11434`.

---

## Section 8: Performance Estimates on M4 Max

### 8.1 Hardware Specs

| Metric | M4 Max (128 GB) |
|--------|----------------|
| Memory bandwidth | 546 GB/s |
| Unified memory | 128 GB |
| Neural Engine | 38 TOPS |
| CPU cores | 14 (10P + 4E) |
| GPU cores | 40 |
| TDP under load | 40-80W |

### 8.2 Embedding Throughput Estimates

| Model | Estimated tok/s (M4 Max) | Batch size | RAM usage |
|-------|--------------------------|------------|-----------|
| Qwen3-Embedding-0.6B (MLX) | 50,000+ | 64-128 | ~2 GB |
| Qwen3-Embedding-4B (MLX) | 15,000-25,000 | 32-64 | ~8 GB |
| Qwen3-Embedding-8B (MLX) | 8,000-12,000 | 16-32 | ~16 GB |
| nomic-embed-text (Ollama) | ~11,000 | 128 | ~1 GB |
| BGE-M3 (sentence-transformers) | ~6,000-8,000 | 32 | ~3 GB |
| mxbai-embed-large (Ollama) | ~8,000 | 64 | ~2 GB |

*Estimates extrapolated from M2 Max benchmarks (+~20% for M4 Max per generation benchmarks).*

### 8.3 LLM Inference (for contextual enrichment, RAG generation)

| Model | Est. tok/s (M4 Max, 128GB) | RAM usage | Use case |
|-------|---------------------------|-----------|----------|
| Qwen3-7B | 80-100 | 8 GB | Context generation |
| Qwen3-14B | 40-60 | 14 GB | High quality context gen |
| Qwen3-30B-A3B (MoE) | ~100+ | 20 GB | Efficient large model |
| Qwen3-32B | 20-30 | 32 GB | Best quality generation |
| Llama 3.3-70B | 12-18 | 70 GB | Max quality |

The M4 Max 128GB can simultaneously hold:
- Qwen3-Embedding-4B: ~8 GB
- BGE-Reranker-v2-m3: ~2 GB
- Qwen3-14B (generation LLM): ~14 GB
- Qdrant + OS overhead: ~8 GB
- Total active: ~32 GB, leaving 96 GB for larger models

**Source**: [M4 Max 128GB LLM Testing — MacRumors](https://forums.macrumors.com/threads/m4-max-studio-128gb-llm-testing.2453816/), [MLX Performance Deep Dive](https://www.linkedin.com/pulse/running-llms-locally-your-mac-deep-dive-mlx-m4-max-travis-lelle-gp6ce), [M4 vs M2 Benchmarks — GoTranscript](https://gotranscript.com/public/benchmarking-local-llms-for-2025-m4-vs-m2-performance)

### 8.4 Vector Search Latency (Qdrant, ARM64)

| Collection size | Query latency (p50) | Notes |
|----------------|--------------------|----|
| 100K vectors | < 5 ms | Well within real-time |
| 1M vectors | 10-20 ms | Still fast |
| 10M vectors | 30-80 ms | Acceptable for RAG |
| 100M vectors | 100-300 ms | Consider sharding |

At 1,024-dim vectors: 1M vectors = ~4 GB RAM. M4 Max 128GB can hold ~30M vectors in-memory comfortably.

---

## Recommendations

### Primary Recommendation: Haystack + Qdrant + Qwen3 + BGE-Reranker Stack

**Rationale**: Best production-quality headless API deployment with lowest overhead. Native ARM64 Docker support throughout. Comprehensive hybrid search and reranking pipeline.

Stack:
1. **Embedding**: Qwen3-Embedding-4B via Ollama REST (`localhost:11434`)
2. **Vector DB**: Qdrant (Docker, ARM64, persistent storage)
3. **RAG Framework**: Haystack with Hayhooks (FastAPI, streaming, OpenAI-compatible)
4. **Reranker**: BAAI/bge-reranker-v2-m3 (local, Apache 2.0)
5. **Hybrid BM25**: Haystack's BM25Retriever or Qdrant sparse vectors
6. **Contextual enrichment**: Qwen3-7B via Ollama (local LLM for context prepending)
7. **Indexing triggers**: n8n (self-hosted, file watcher + git hooks)
8. **Jarvis integration**: FastMCP MCP server wrapping Haystack pipeline
9. **Advanced retrieval**: RAPTOR for long documents (optional, high cost)

**Caveats**:
- Haystack is slightly less mature than LangChain for complex agentic workflows
- RAPTOR contextual enrichment adds significant indexing time (3-5x slower)
- Qdrant on ARM64 is 10-20% slower than x86 — acceptable for this use case

### Alternative: LlamaIndex + LanceDB (Simpler, Embedded)

When to use: Smaller knowledge base (< 5M vectors), want zero Docker complexity, primarily Python-native integration.

Stack: LlamaIndex + LanceDB (embedded, no server) + Ollama embeddings + FastAPI wrapper. Entire stack runs in one Python process.

### Action Items

- [ ] Install Ollama natively on macOS host, pull `qwen3-embedding:4b` and `nomic-embed-text`
- [ ] Deploy Qdrant via Docker Compose with ARM64 native image and persistent volume
- [ ] Build Haystack ingestion pipeline with: Docling loader, recursive chunker, contextual enrichment (local LLM), Qdrant upsert
- [ ] Build Haystack query pipeline with: hybrid retriever (Qdrant dense + BM25), RRF fusion, BGE-Reranker-v2-m3
- [ ] Wrap with Hayhooks (FastAPI) and expose on port 8090
- [ ] Build FastMCP MCP server wrapping the Haystack REST API, add to Claude Code via `claude mcp add`
- [ ] Set up n8n with file watcher workflow for automated incremental indexing
- [ ] Seed initial collections: `jarvis-context`, `codebase-jarvis`, `research`
- [ ] Benchmark retrieval quality on representative Jarvis queries vs. current context-only approach

---

## Sources

1. [Qwen3 Embedding — Official Blog](https://qwenlm.github.io/blog/qwen3-embedding/)
2. [Qwen3-Embedding-8B — Hugging Face](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
3. [qwen3-embeddings-mlx — GitHub](https://github.com/jakedahn/qwen3-embeddings-mlx)
4. [MTEB Leaderboard — Hugging Face](https://huggingface.co/spaces/mteb/leaderboard)
5. [NV-Embed vs BGE-M3 vs Nomic — AI Marketing Labs](https://ai-marketinglabs.com/lab-experiments/nv-embed-vs-bge-m3-vs-nomic-picking-the-right-embeddings-for-pinecone-rag)
6. [Best Open-Source Embedding Models 2026 — BentoML](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
7. [BAAI/bge-m3 — Hugging Face](https://huggingface.co/BAAI/bge-m3)
8. [Ollama Embedding Models — Ollama Blog](https://ollama.com/blog/embedding-models)
9. [Ollama nomic-embed-text](https://ollama.com/library/nomic-embed-text)
10. [Production-Grade Local LLM Inference on Apple Silicon — arXiv](https://arxiv.org/abs/2511.05502)
11. [Benchmarking On-Device ML on Apple Silicon with MLX — arXiv](https://arxiv.org/abs/2510.18921)
12. [Weaviate Chunking Strategies for RAG](https://weaviate.io/blog/chunking-strategies-for-rag)
13. [Best Chunking Strategies for RAG 2025 — Firecrawl](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
14. [Document Chunking for RAG: 9 Strategies Tested — LLM Practical Experience Hub](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)
15. [Best RAG Frameworks 2025 — LLM Practical Experience Hub](https://langcopilot.com/posts/2025-09-18-top-rag-frameworks-2024-complete-guide)
16. [RAG Frameworks Comparison — AIM Research](https://research.aimultiple.com/rag-frameworks/)
17. [15 Best Open-Source RAG Frameworks 2026 — Firecrawl](https://www.firecrawl.dev/blog/best-open-source-rag-frameworks)
18. [Deploy AI Pipelines Faster with Hayhooks — Haystack Blog](https://haystack.deepset.ai/blog/deploy-ai-pipelines-faster-with-hayhooks)
19. [Haystack GitHub](https://github.com/deepset-ai/haystack)
20. [Vector Database Comparison 2025 — LiquidMetal AI](https://liquidmetal.ai/casesAndBlogs/vector-comparison/)
21. [Best Vector Databases 2025 — Firecrawl](https://www.firecrawl.dev/blog/best-vector-databases-2025)
22. [Qdrant ARM Architecture Support](https://qdrant.tech/blog/qdrant-supports-arm-architecture/)
23. [Qdrant Benchmarks](https://qdrant.tech/benchmarks/)
24. [Optimizing RAG with Hybrid Search & Reranking — VectorHub/Superlinked](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)
25. [Advanced RAG Techniques: Hybrid Search, Reranking, Graph-RAG — Medium](https://medium.com/@rizqimulkisrc/advanced-rag-techniques-hybrid-search-reranking-and-graph-rag-24f8d9b8d7e2)
26. [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
27. [DataCamp — Contextual Retrieval Implementation](https://www.datacamp.com/tutorial/contextual-retrieval-anthropic)
28. [RAPTOR Paper — arXiv](https://arxiv.org/abs/2401.18059)
29. [RAGFlow RAPTOR Docs](https://ragflow.io/docs/enable_raptor)
30. [A-RAG: Agentic RAG — arXiv 2025](https://arxiv.org/html/2602.03442v1)
31. [Top 7 Rerankers for RAG — Analytics Vidhya](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/)
32. [rerankers Library — AnswerDotAI GitHub](https://github.com/AnswerDotAI/rerankers)
33. [BAAI/bge-reranker-v2-m3 — Hugging Face](https://huggingface.co/BAAI/bge-reranker-v2-m3)
34. [mcp-local-rag — GitHub](https://github.com/shinpr/mcp-local-rag)
35. [rag-code-mcp — GitHub](https://github.com/doITmagic/rag-code-mcp)
36. [n8n RAG Pipeline Blog](https://blog.n8n.io/rag-pipeline/)
37. [n8n RAG Docs](https://docs.n8n.io/advanced-ai/rag-in-n8n/)
38. [M4 Max 128GB LLM Testing — MacRumors Forums](https://forums.macrumors.com/threads/m4-max-studio-128gb-llm-testing.2453816/)
39. [MLX Performance Deep Dive on M4 Max — LinkedIn](https://www.linkedin.com/pulse/running-llms-locally-your-mac-deep-dive-mlx-m4-max-travis-lelle-gp6ce)
40. [M4 vs M2 Benchmarks — GoTranscript](https://gotranscript.com/public/benchmarking-local-llms-for-2025-m4-vs-m2-performance)
41. [Semantic AI Search with RAG, Qdrant & Ollama on macOS](https://www.markus-schall.de/en/2025/08/rag-with-ollama-and-qdrant-as-a-universal-search-engine-for-your-own-data/)
42. [Dockerizing RAG with FastAPI, LlamaIndex, Qdrant, Ollama](https://otmaneboughaba.com/posts/dockerize-rag-application/)

---

## Uncertainties

- **Qwen3-Embedding exact throughput on M4 Max**: Extrapolated from M2 Max data. Actual numbers may differ by ±20%.
- **Hayhooks production maturity**: Relatively new (2024). Evaluate carefully for edge cases.
- **LanceDB vs Qdrant for multi-collection at scale**: Limited comparative benchmarks at > 5M vectors on ARM64.
- **Contextual retrieval cost**: LLM cost per document varies significantly by document length and local model quality. Full benchmark needed on actual Jarvis corpus.
- **RAPTOR at scale**: Clustering quality depends heavily on embedding quality and document domain. May require tuning.

## Related Topics

- Knowledge graph construction from existing Jarvis context files (Graph-RAG potential)
- Fine-tuning a local embedding model on Jarvis-specific vocabulary
- Evaluation framework for RAG quality (RAGAS, TruLens)
- Multi-modal RAG (images, diagrams in documents)
- Streaming ingestion for real-time document updates

