# Research Summary: Local RAG Pipeline for Apple M4 Max (2026-02-17)

**Full report**: `.claude/reports/research/rag-pipeline-local-deployment-2026-02-17.md`

## Key Findings

1. **Best embedding model**: Qwen3-Embedding-4B (quality/speed balance) or BGE-M3 (multilingual, multi-functional). Both run on MLX or via Ollama REST API.
2. **Best vector DB for local**: Qdrant (Docker, ARM64 native, production-grade) or LanceDB (embedded, zero-server, edge-friendly).
3. **Best RAG framework (headless API-first)**: Haystack with Hayhooks (FastAPI, REST built-in, lowest overhead). LlamaIndex for pure data-centric RAG.
4. **Best integration pattern for Jarvis**: MCP server via FastMCP exposing a LlamaIndex or Haystack pipeline, backed by Qdrant and Ollama embeddings.
5. **M4 Max 128GB capability**: Can run 70B+ models at useful speeds (~15-20 t/s); embedding throughput ~9,000-44,000 tok/s depending on model; 546 GB/s memory bandwidth.
6. **Advanced RAG stack**: Contextual retrieval + Hybrid BM25/vector + BGE-Reranker-v2-m3 cross-encoder = best retrieval quality per Anthropic's own benchmarks (67% failure rate reduction).

## Sources
- MTEB Leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Qwen3 Embedding: https://qwenlm.github.io/blog/qwen3-embedding/
- Production-Grade Apple Silicon paper: https://arxiv.org/abs/2511.05502
- Haystack Hayhooks: https://haystack.deepset.ai/blog/deploy-ai-pipelines-faster-with-hayhooks
- Anthropic Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
- n8n RAG pipelines: https://blog.n8n.io/rag-pipeline/
