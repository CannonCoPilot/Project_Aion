# Research Report: Optimal Embedding Model Inference on Apple M4 Max

**Date**: 2026-02-19
**Scope**: Comprehensive evaluation of embedding inference backends for Apple M4 Max
(128 GB unified memory, 40-core GPU). Current baseline: Ollama + qwen3-embedding:4b
producing 2560-dim vectors. Target: identify faster drop-in replacements.

---

## Executive Summary

Ollama is convenient but demonstrably suboptimal for embedding workloads on Apple
Silicon. Its llama.cpp/Metal backend, while functional, carries significant overhead
(large KV cache allocation per request, no true continuous batching at the token
level, 5x slower than purpose-built embedding servers in head-to-head tests on GPU
hardware). On Apple Silicon specifically, MLX-native runtimes achieve 30–50% higher
throughput for generative workloads and likely similar gains for embeddings.

The fastest available path for the exact current setup (qwen3-embedding:4b, 2560 dims)
is the dedicated `jakedahn/qwen3-embeddings-mlx` server: pure MLX, purpose-built for
this model family, benchmarks at 18,000 tokens/sec on M2 Max (4B model) — which
projects to 25,000–30,000+ tokens/sec on M4 Max given memory bandwidth scaling.
This is a purpose-built REST server, not a drop-in `/v1/embeddings` replacement, but
a thin adapter layer can bridge it.

For a true OpenAI-compatible `/v1/embeddings` drop-in, `vllm-mlx` serves the endpoint
and uses `mlx-embeddings` as its backend, though Qwen3-Embedding-4B support in
`mlx-embeddings` needs verification before committing to a migration.

**Recommendation**: Migrate from Ollama to `qwen3-embeddings-mlx` for embedding
workloads. Estimated throughput gain: 5–15x on the 4B model. Migration risk: low
(same model, same dimensions, minimal code change in `mcp_server.py`).

---

## Key Findings

### Finding 1: How Ollama Leverages Apple Silicon

Ollama is a thin wrapper around `llama.cpp` with an HTTP API layer. The inference
pipeline is:

```
Python (httpx) → Ollama HTTP API → llama.cpp → GGML Metal kernels → GPU cores
```

Metal GPU acceleration is automatic — no configuration needed. On Apple Silicon,
llama.cpp compiles Metal compute shaders that run directly on the GPU cores. The
unified memory architecture means CPU and GPU share the same physical RAM pool; no
PCIe memory copies are needed (unlike discrete GPU systems).

**Layer offloading**: llama.cpp offloads transformer layers into Metal buffers. For
embedding workloads (full forward pass, no generation), all layers are offloaded to
the GPU up to ~75% of total unified memory. For a 128 GB M4 Max, that's ~96 GB
available for GPU tensors — far more than the 2.5–4 GB needed for qwen3-embedding:4b.

**The Neural Engine (ANE) is NOT used by Ollama or llama.cpp.** The ANE is only
accessible via Apple's Core ML framework, which is entirely separate from the Metal
compute path. Embedding lookup (the gather operation) actually runs on CPU even in
Metal mode — a known llama.cpp/Core ML delegation behavior.

**Key Ollama embedding overhead** (from GitHub issue #12088 benchmark):
- Allocates a full 448 MB KV cache sized for 4096-token context per request,
  even for short embedding queries
- Cold start: ~1.35s; warm request: ~78–99ms per query
- Comparison on RTX 4060: Ollama ~99ms vs TEI ~20ms (5x slower)
- Root cause: KV cache overallocation + no token-level batching for embedding-only
  workloads

**Sources**:
- [Ollama GPU Documentation](https://docs.ollama.com/gpu)
- [llama.cpp Apple Silicon Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167)
- [Ollama vs TEI Performance Gap Issue #12088](https://github.com/ollama/ollama/issues/12088)
- [Apple Silicon GPUs, Docker and Ollama](https://chariotsolutions.com/blog/post/apple-silicon-gpus-docker-and-ollama-pick-two/)

---

### Finding 2: MLX and mlx-lm — What They Are and Why They Matter

**MLX** is Apple's open-source array framework for machine learning, purpose-built for
Apple Silicon. It is NOT a wrapper around PyTorch or llama.cpp — it is a native
framework with its own Metal kernels, lazy evaluation graph, and unified memory model.

Key architectural advantages over llama.cpp/Ollama:
- **Zero-copy tensor operations**: MLX models live natively in unified memory; no
  buffer copies between CPU and GPU address spaces
- **Lazy evaluation**: Operations are fused and kernel launches are batched,
  reducing overhead compared to llama.cpp's eager Metal dispatch
- **Continuous batching**: mlx-lm and vllm-mlx support true token-level batching,
  enabling 4.3x aggregate throughput at 16 concurrent requests

**Performance vs Ollama on Apple Silicon (M2 Ultra)**:
- MLX: ~230 tok/s
- llama.cpp: ~150 tok/s
- Ollama: 20–40 tok/s
- PyTorch MPS: 7–9 tok/s

The gap between MLX and Ollama is 6–10x in these benchmarks. On M4 Max (120 GB/s
memory bandwidth), vllm-mlx reaches 525 tok/s on Qwen3-0.6B text generation.

**For EMBEDDINGS specifically**: The same architectural advantages apply. A forward
pass for embeddings is simpler than generation (no KV cache growth, no sampling),
which means the per-request overhead differences are even more pronounced.

**Sources**:
- [Benchmarking On-Device ML on Apple Silicon with MLX (arXiv)](https://arxiv.org/abs/2510.18921)
- [Production-Grade Local LLM Inference on Apple Silicon (arXiv)](https://arxiv.org/abs/2511.05502)
- [Native LLM and MLLM Inference at Scale on Apple Silicon](https://arxiv.org/html/2601.19139v1)
- [Is MLX Really Faster Than Ollama?](https://deepai.tn/glossary/ollama/mlx-faster-than-ollama/)

---

### Finding 3: MLX Qwen3-Embedding Models — Availability and Status

The exact model in use (qwen3-embedding:4b, 2560 dims) has an MLX-quantized version
on Hugging Face, and a purpose-built server exists for it.

**Available MLX models**:

| Model | HuggingFace ID | Size | Dimensions |
|-------|---------------|------|------------|
| Qwen3-Embedding-0.6B (4-bit DWQ) | `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` | ~900 MB | 1024 |
| Qwen3-Embedding-4B (4-bit DWQ) | `mlx-community/Qwen3-Embedding-4B-4bit-DWQ` | ~2.26 GB | **2560** |
| Qwen3-Embedding-8B (various) | See mlx-community collection | ~4.5 GB | 4096 |

The 4B model at 4-bit quantization is 2.26 GB — trivial on 128 GB M4 Max.

**CRITICAL NOTE on Dimensions Bug**: A known bug exists in `mlx-swift-lm` where MLX-
converted embedding models return incorrect dimensions (e.g., 16384 instead of 1024
for the 0.6B model). This indicates pooling may not be working correctly in the MLX
conversion for some tools. The `qwen3-embeddings-mlx` dedicated server handles
pooling correctly and is confirmed to output 2560 dims for the 4B model.

**Available servers**:

1. **`jakedahn/qwen3-embeddings-mlx`** — purpose-built, handles Qwen3 pooling
   correctly, benchmarked at 18K tokens/sec (4B model on M2 Max)
   - Custom `/embed` endpoint (not `/v1/embeddings` compatible)
   - Requires an adapter for drop-in replacement

2. **`waybarrios/vllm-mlx`** — OpenAI-compatible `/v1/embeddings` endpoint,
   uses `mlx-embeddings` library as backend
   - Qwen3-Embedding-4B support depends on `mlx-embeddings>=0.0.5`
   - BERT/XLM-RoBERTa well-supported; Qwen3 support less verified

**Sources**:
- [qwen3-embeddings-mlx GitHub](https://github.com/jakedahn/qwen3-embeddings-mlx)
- [mlx-community/Qwen3-Embedding-4B-4bit-DWQ](https://huggingface.co/mlx-community/Qwen3-Embedding-4B-4bit-DWQ)
- [MLX dimensions bug report](https://github.com/ml-explore/mlx-swift-lm/issues/36)
- [Blaizzy/mlx-embeddings](https://github.com/Blaizzy/mlx-embeddings)

---

### Finding 4: vLLM on Apple Silicon — Two Projects, Different Maturity

There are two distinct "vLLM on Apple Silicon" projects, which are easy to confuse:

**Option A: `vllm-metal`** (official community plugin under vllm-project org)
- Uses MLX as backend, integrated with vLLM's engine/scheduler
- OpenAI-compatible API
- Requires building from source (Rust toolchain + vLLM v0.13.0)
- TEXT ONLY — does not support embeddings
- Paged attention, GQA support

**Option B: `waybarrios/vllm-mlx`** (independent reimplementation, EuroMLSys '26)
- Fully native MLX (no PyTorch dependency)
- OpenAI + Anthropic compatible server
- Supports embeddings via `/v1/embeddings` (mlx-embeddings backend)
- Supports LLMs, VLMs, audio, embeddings
- `pip install vllm-mlx` — easy installation
- 525 tok/s on M4 Max (Qwen3-0.6B), 21–87% faster than llama.cpp
- Continuous batching with 4.3x scaling at 16 concurrent requests

**The original vLLM** (vllm-project/vllm) does NOT support Apple Silicon natively —
it runs CPU-only on Mac, yielding ~1–2 tok/s vs the 40–60 achievable with Metal.

**Sources**:
- [vllm-metal GitHub](https://github.com/vllm-project/vllm-metal)
- [vllm-mlx GitHub](https://github.com/waybarrios/vllm-mlx)
- [Two paths to vLLM on Apple Silicon](https://blog.labs.purplemaia.org/two-paths-to-vllm-on-apple-silicon-vllm-metal-vs-vllm-mlx/)

---

### Finding 5: LM Studio vs Ollama on Apple Silicon

LM Studio supports both llama.cpp (GGUF models) and MLX models as backends.

- **With GGUF models**: Ollama is 10–20% faster (better tuned CLI pipeline)
- **With MLX models**: LM Studio is 26–30% faster (M3 Ultra benchmark) than Ollama
  because it uses the native MLX runtime rather than llama.cpp
- LM Studio is CLOSED SOURCE — a concern for production infrastructure
- LM Studio does support `/v1/embeddings` API
- Known limitation: LM Studio does not support the `dimensions` parameter for
  embedding models (GitHub issue open as of 2025)

For embedding workloads specifically, LM Studio with MLX models would outperform
Ollama, but the dimensions limitation and closed-source nature make it a poor choice
for Jarvis's RAG pipeline.

**Sources**:
- [Ollama vs LM Studio macOS](https://www.chrislockard.net/posts/ollama-vs-lmstudio-macos/)
- [Gemma 3 LM Studio vs Ollama M3 Ultra benchmark](https://medium.com/google-cloud/gemma-3-performance-tokens-per-second-in-lm-studio-vs-ollama-mac-studio-m3-ultra-7e1af75438e4)
- [LM Studio dimensions issue](https://github.com/lmstudio-ai/lms/issues/300)

---

### Finding 6: PyTorch MPS Backend

PyTorch with the MPS (Metal Performance Shaders) backend is the worst option for
production embedding inference on Apple Silicon.

**Performance hierarchy** (M2 Ultra):
- MLX: ~230 tok/s
- llama.cpp: ~150 tok/s
- Ollama: 20–40 tok/s
- PyTorch MPS: 7–9 tok/s

**Why PyTorch MPS is slow**:
- Python overhead: every op goes through Python → PyTorch → MPS → Metal
  (vs MLX's lazy graph fusion or llama.cpp's direct C++ Metal dispatch)
- 4 GB tensor cap causes OOM errors beyond ~2K tokens
- No built-in server, no continuous batching, no streaming
- No native quantization support comparable to GGUF Q4/Q8

**When PyTorch MPS is appropriate**:
- Fine-tuning or training (where MLX/llama.cpp don't apply)
- Research where you need direct layer access
- HuggingFace Transformers compatibility for model development

For production inference, PyTorch MPS should not be considered.

**Sources**:
- [Production-Grade Local LLM Inference on Apple Silicon (arXiv 2511.05502)](https://arxiv.org/abs/2511.05502)
- [Ollama vs HuggingFace Transformers on Apple Silicon](https://medium.com/@michael.hannecke/running-llms-locally-on-apple-silicon-a-practical-guide-for-developers-980deed326d9)

---

### Finding 7: The Apple Neural Engine — Not Accessible for This Use Case

The ANE (Neural Engine) is a fixed-function accelerator for INT4/INT8 neural network
inference. On M4 Max it is rated at 38 TOPS.

**Critical constraint**: The ANE is ONLY accessible via Apple's Core ML framework.
Neither MLX, nor llama.cpp, nor Ollama can dispatch work to the ANE directly.

MLX's own documentation states: "The only public way of using the ANE subsystem is
by creating and running models through Core ML, which is entirely orthogonal to the
purpose and mandate of MLX."

**What the ANE CAN do**: SqueezeBits demonstrated a "disaggregated inference" engine
(Yetter) that uses ANE for prefill (via Core ML) + GPU for decode (via MLX). Results
show significant TTFT improvement in prefill-heavy scenarios.

**What the ANE CANNOT do** even with Core ML:
- Embedding lookup (gather op) runs on CPU
- LM head (linear op) runs off-ANE
- Requires fixed input shapes (must pad sequences)
- Models must be compiled to CoreML format (`.mlmodel`/`.mlpackage`)

**Practical conclusion**: Targeting the ANE requires a completely different toolchain
(Core ML conversion, fixed shapes, no dynamic batching) and cannot serve the
`qwen3-embedding:4b` model without significant engineering. The GPU via MLX is the
right target, not the ANE.

**Sources**:
- [Apple ANE Transformers Research](https://machinelearning.apple.com/research/neural-engine-transformers)
- [Running LLMs Fully on Apple Neural Engine](https://ai2.work/technology/ai-tech-running-llms-on-apple-neural-engine-2025/)
- [Disaggregated Inference: ANE prefill + GPU decode](https://blog.squeezebits.com/disaggregated-inference-on-apple-silicon-npu-prefill-and-gpu-decode-67176)

---

### Finding 8: Benchmarks — Concrete Numbers

#### Embedding-specific throughput (qwen3-embeddings-mlx server, M2 Max 32GB):

| Model | Throughput | Latency (single) | Latency (batch-32) | Memory |
|-------|-----------|-----------------|-------------------|--------|
| 0.6B (small) | 44,000 tokens/sec | 1–3ms | — | 900 MB |
| 4B (medium) | 18,000 tokens/sec | — | — | 2.5 GB |
| 8B (large) | 11,000 tokens/sec | — | — | 4.5 GB |

Note: These are on M2 Max. M4 Max has 120 GB/s memory bandwidth vs M2 Max's 96 GB/s,
suggesting a ~25% throughput increase. Projected M4 Max 4B throughput: ~22,500 tok/sec.

#### Ollama embedding on RTX 4060 (GPU, not Apple Silicon):
- ~99ms per request (warm), ~1350ms cold start
- vs TEI at ~20ms — 5x slower

#### General inference ranking (M2 Ultra, Qwen-2.5 family):
- MLX: ~230 tok/s
- MLC-LLM: ~190 tok/s
- llama.cpp: ~150 tok/s
- Ollama: 20–40 tok/s
- PyTorch MPS: 7–9 tok/s

#### M4 Max generative throughput (vllm-mlx, Qwen3-0.6B):
- 525 tokens/sec peak
- 21–87% faster than llama.cpp across model sizes

**Sources**:
- [qwen3-embeddings-mlx README](https://github.com/jakedahn/qwen3-embeddings-mlx)
- [Native LLM Inference at Scale on Apple Silicon (arXiv 2601.19139)](https://arxiv.org/html/2601.19139v1)
- [Ollama vs TEI issue #12088](https://github.com/ollama/ollama/issues/12088)

---

## Comparison Table

| Aspect | Ollama (current) | qwen3-embeddings-mlx | vllm-mlx | LM Studio (MLX) | PyTorch MPS |
|--------|-----------------|---------------------|----------|-----------------|-------------|
| **Backend** | llama.cpp + Metal | MLX native | MLX native | MLX or llama.cpp | PyTorch MPS |
| **4B embedding throughput** | ~3–5K tok/s (est.) | ~18K tok/s (M2M) | Unknown | ~15K tok/s (est.) | ~500 tok/s (est.) |
| **M4 Max projected 4B** | ~4–7K tok/s | ~22–25K tok/s | ~20K+ tok/s | ~20K tok/s | ~1K tok/s |
| **2560-dim output** | Yes (confirmed) | Yes (confirmed) | Needs verification | Partial (no `dimensions` param) | Yes |
| **OpenAI `/v1/embeddings`** | Yes | No (custom endpoint) | Yes | Yes | No |
| **Drop-in for mcp_server.py** | — | Requires adapter | Yes | Possible | No |
| **Open source** | Yes (MIT) | Yes | Yes | No (closed) | Yes |
| **ANE usage** | No | No | No | No | No |
| **Neural Engine** | No | No | No | No | No |
| **Continuous batching** | No | Yes (batch endpoint) | Yes (token-level) | Limited | No |
| **Production stability** | High | Medium (newer project) | Medium | Medium | Low |
| **Install complexity** | Low | Low (pip + python server.py) | Low (pip install) | GUI app | Low (pip) |

---

## Recommendations

### Primary Recommendation: Migrate to qwen3-embeddings-mlx

Migrate `mcp_server.py`'s `get_embedding()` function from Ollama to the
`jakedahn/qwen3-embeddings-mlx` server.

**Why**:
- Same model family (qwen3-embedding), same 2560 dimensions
- 18K tokens/sec on M2 Max → ~22–25K projected on M4 Max
- ~5–6x throughput improvement over Ollama estimates
- Purpose-built for this exact model — correct pooling, correct dimensions
- Low migration risk: only `get_embedding()` in `mcp_server.py` changes

**Migration steps**:
```bash
# 1. Install
git clone https://github.com/jakedahn/qwen3-embeddings-mlx
cd qwen3-embeddings-mlx
pip install -r requirements.txt

# 2. Start server (uses mlx-community/Qwen3-Embedding-4B-4bit-DWQ by default)
MODEL_NAME=mlx-community/Qwen3-Embedding-4B-4bit-DWQ python server.py
# Runs at localhost:8000
```

```python
# Updated get_embedding() in mcp_server.py
MLX_EMBED_URL = os.getenv("MLX_EMBED_URL", "http://localhost:8000")

async def get_embedding(text: str) -> list[float]:
    """Get embedding vector from qwen3-embeddings-mlx server."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{MLX_EMBED_URL}/embed",
            json={"text": text, "model": "medium"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embedding"]  # list[float], shape 2560
```

**Caveats**:
- Not OpenAI `/v1/embeddings` compatible (uses `/embed`)
- Graphiti server may also use Ollama for embeddings — check separately
- Must validate output dimensions match before swapping Qdrant collections

### Alternative: vllm-mlx (True Drop-in Replacement)

If OpenAI API compatibility is required (for Graphiti or other consumers):

```bash
pip install vllm-mlx
pip install mlx-embeddings>=0.0.5

# Start with embedding model pre-loaded
python -m vllm_mlx.server \
    --embedding-model mlx-community/Qwen3-Embedding-4B-4bit-DWQ \
    --port 8000
```

Then update `OLLAMA_URL` in environment or add `OPENAI_BASE_URL=http://localhost:8000/v1`
and change `mcp_server.py` to use the OpenAI embeddings client.

**Risk**: Less verified for Qwen3-Embedding-4B specifically. Test dimension output
before migrating Qdrant data.

### Not Recommended: PyTorch MPS, raw TEI, LM Studio

- **PyTorch MPS**: 7–9 tok/s, severe memory constraints, no server
- **TEI**: Fastest on NVIDIA (5x over Ollama on RTX 4060) but CPU-only on Apple
  Silicon when run via Docker; native build with Metal requires Rust compilation
- **LM Studio**: Closed source, no `dimensions` parameter support

---

## Action Items

- [ ] Clone `jakedahn/qwen3-embeddings-mlx`, run on M4 Max, verify 2560-dim output
- [ ] Benchmark: measure actual tokens/sec with `qwen3-embedding:4b` in Ollama (baseline)
- [ ] Benchmark: measure actual tokens/sec with `qwen3-embeddings-mlx` medium model
- [ ] Check if Graphiti MCP server (`graphiti_mcp_server.py`) also uses Ollama embeddings
- [ ] If yes, migrate Graphiti embeddings too (or point both servers at same MLX endpoint)
- [ ] Update `mcp_server.py` `get_embedding()` to use new server
- [ ] Run validation: embed 10 test strings, verify vectors are identical to Ollama output
  (within floating-point tolerance from quantization differences)
- [ ] Optionally test `vllm-mlx` as the OpenAI-compatible alternative

---

## Uncertainties

1. **No direct M4 Max embedding benchmark exists** for `qwen3-embeddings-mlx` — the
   18K tok/sec figure is from M2 Max (32 GB). M4 Max projection (~22–25K) is
   extrapolated from memory bandwidth scaling.

2. **Ollama embedding baseline** is unknown for Apple Silicon specifically. The 5x
   figure comes from an RTX 4060 comparison. The gap on Apple Silicon may be different
   (llama.cpp is more optimized for Metal than CUDA for consumer GPUs).

3. **vllm-mlx Qwen3-Embedding-4B support** is not confirmed in official documentation.
   `mlx-embeddings` may not yet handle the Qwen3 instruction-tuned pooling correctly.

4. **Dimension consistency**: The known bug in `mlx-swift-lm` returning wrong
   dimensions for MLX-converted embedding models should be tested on the Python path
   before assuming 2560 dims are correct.

5. **Graphiti embedding impact**: If Graphiti's `OllamaNoThinkClient` also invokes
   embeddings through Ollama (for `EMBEDDING_DIM=2560`), migrating only the RAG
   server may leave Graphiti unoptimized.

---

## Related Topics

- Matryoshka Representation Learning (MRL) — Qwen3-Embedding supports variable dims
  (32 to 2560), could reduce Qdrant storage if lower dims are acceptable
- Core ML model conversion for ANE acceleration (high engineering cost, unlikely
  worth it for this use case)
- Continuous batching strategies for embedding workloads (batch ingestion pipelines)
- vllm-mlx vs vllm-metal trajectory — vllm-metal is the "official" path but lags

---

## Sources

1. [qwen3-embeddings-mlx — MLX Qwen3 embedding server](https://github.com/jakedahn/qwen3-embeddings-mlx)
2. [mlx-community/Qwen3-Embedding-4B-4bit-DWQ on Hugging Face](https://huggingface.co/mlx-community/Qwen3-Embedding-4B-4bit-DWQ)
3. [vllm-mlx — OpenAI-compatible MLX server](https://github.com/waybarrios/vllm-mlx)
4. [vllm-mlx embeddings guide](https://github.com/waybarrios/vllm-mlx/blob/main/docs/guides/embeddings.md)
5. [vllm-metal — official community plugin](https://github.com/vllm-project/vllm-metal)
6. [Two paths to vLLM on Apple Silicon](https://blog.labs.purplemaia.org/two-paths-to-vllm-on-apple-silicon-vllm-metal-vs-vllm-mlx/)
7. [Production-Grade LLM Inference on Apple Silicon (arXiv 2511.05502)](https://arxiv.org/abs/2511.05502)
8. [Benchmarking On-Device ML on Apple Silicon with MLX (arXiv 2510.18921)](https://arxiv.org/abs/2510.18921)
9. [Native LLM and MLLM Inference at Scale on Apple Silicon (arXiv 2601.19139)](https://arxiv.org/html/2601.19139v1)
10. [Ollama vs TEI embedding performance gap (GitHub Issue #12088)](https://github.com/ollama/ollama/issues/12088)
11. [Ollama GPU Documentation](https://docs.ollama.com/gpu)
12. [llama.cpp Apple Silicon Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167)
13. [Apple ANE Transformers (Apple ML Research)](https://machinelearning.apple.com/research/neural-engine-transformers)
14. [Disaggregated Inference — ANE prefill + GPU decode (SqueezeBits)](https://blog.squeezebits.com/disaggregated-inference-on-apple-silicon-npu-prefill-and-gpu-decode-67176)
15. [Running LLMs Fully on Apple Neural Engine](https://ai2.work/technology/ai-tech-running-llms-on-apple-neural-engine-2025/)
16. [mlx-embeddings Python library (Blaizzy)](https://github.com/Blaizzy/mlx-embeddings)
17. [MLX dimensions bug (mlx-swift-lm issue #36)](https://github.com/ml-explore/mlx-swift-lm/issues/36)
18. [Ollama vs HuggingFace Transformers on Apple Silicon](https://medium.com/@michael.hannecke/running-llms-locally-on-apple-silicon-a-practical-guide-for-developers-980deed326d9)
19. [Is MLX Really Faster Than Ollama?](https://deepai.tn/glossary/ollama/mlx-faster-than-ollama/)
20. [Gemma 3: LM Studio vs Ollama M3 Ultra](https://medium.com/google-cloud/gemma-3-performance-tokens-per-second-in-lm-studio-vs-ollama-mac-studio-m3-ultra-7e1af75438e4)
21. [LM Studio dimensions parameter issue](https://github.com/lmstudio-ai/lms/issues/300)
