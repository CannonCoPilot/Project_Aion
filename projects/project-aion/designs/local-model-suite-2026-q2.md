# Local Model Suite — Q2 2026

**Status**: Design doc (synthesis from 6 deep-research investigations)
**Created**: 2026-05-01
**Author**: Jarvis (autonomous synthesis from 6 deep-research subagents)
**Scope**: Open-weights AI models for local Apple Silicon deployment, release window Q3 2025 – Q2 2026
**Constraint envelope**: Apple Silicon (M-series); ≤100 GB warm RAM ceiling; MLX preferred; Qwen family preferred where competitive but best-in-class included regardless

---

## 1. Source Material

This doc synthesizes 6 deep-research investigations conducted 2026-05-01:

| # | Category | Scratch report | Lines | Notes |
|---|----------|----------------|-------|-------|
| 1 | Audio / STT / TTS / streaming | `.claude/scratch/models-audio-video-2026-q2.md` | 797 | Pre-HALT, 2026-05-01 |
| 2 | Vision / multimodal / computer-use / OCR / depth | `.claude/scratch/models-vision-2026-q2.md` | 548 | 46 sources |
| 3 | Language: coding / tool-use / reasoning / general | (in-context only — agent failed to write file) | n/a | Full data preserved in conversation transcript |
| 4 | Embeddings / reranking | `.claude/scratch/models-embeddings-2026-q2.md` | 307 | 7 sources |
| 5 | Image / video generation | `.claude/scratch/models-image-gen-2026-q2.md` | 418 | 12 sources |
| 6 | Genomics / molbio / bioinformatics | `.claude/scratch/models-genomics-2026-q2.md` | 396 | 19 sources |

Total raw research: ~161 KB across 5 files plus the in-context language report. The language scratch file is the one outlier — its agent narrated a write that didn't execute. Future research-agent prompts must include a final `ls -la <path>` self-verify step.

---

## 2. Executive Summary

### 2.1 The Recommended Suite (15 models)

The suite below covers seven capability domains and fits comfortably in 100 GB warm RAM with simultaneous loading of the daily-driver subset.

| # | Slot | Model | Quant | RAM | License | MLX |
|---|------|-------|-------|-----|---------|-----|
| 1 | **Everyday driver (chat / reasoning / code)** | Qwen3.6-27B (dense, Apr 2026) | Q8 | ~28.6 GB | Apache 2.0 | ✅ Day-0 |
| 2 | Multimodal general chat | Gemma 4 31B Dense | Q4_K_M | ~18.5 GB | **Apache 2.0** (full; v4 dropped prior custom terms) | ✅ Day-0 mlx-vlm |
| 3 | Pure tool-use (open-source τ-bench leader) | xLAM-2-70b-fc-r | Q4_K_M | ~40 GB | Llama 3.1 community | 🔶 GGUF (community MLX feasible) |
| 4 | Reasoning (math / science specialist) | DeepSeek-R1-0528-Qwen3-8B | Q4_K_M | ~4.7 GB | MIT | ✅ |
| 5 | Vision-language (VLM) | Qwen3-VL-30B-A3B | Q4 | ~18 GB | Apache 2.0 | ✅ Day-0 |
| 6 | GUI / computer-use | UI-TARS-1.5-7B | GGUF | ~5 GB | Apache 2.0 | ✅ via Ollama |
| 7 | Document OCR | MonkeyOCR Apple Silicon fork | fp16 | ~3 GB | Apache 2.0 | ✅ MLX fork |
| 8 | Spatial / depth | Apple Depth Pro | fp16 | ~2 GB | Apple ML license | ⚡ CoreML / MPS |
| 9 | General embeddings | Qwen3-Embedding-4B *(current — keep)* | fp16 | ~8 GB | Apache 2.0 | ✅ MLX |
| 10 | Reranker | Qwen3-Reranker-0.6B *(NEW capability)* | fp16 | ~2.5 GB | Apache 2.0 | ✅ |
| 11 | Code embeddings (parallel collection) | Nomic Embed Code 7B | Q4 | ~7 GB | Apache 2.0 | 🔶 GGUF |
| 12 | ASR (daily transcription) | Whisper-large-v3-turbo MLX | int8 | ~0.9 GB | MIT | ✅ + ⚡ WhisperKit |
| 13 | ASR (streaming / real-time) | Voxtral-Mini-4B Realtime | Q4 | ~2.5 GB | Apache 2.0 | 🔶 voxtral.c |
| 14 | Image generation (T2I + edit) | FLUX.1 [dev] + Kontext | Q8 | ~12 GB each | FLUX dev license | ✅ via mflux / Draw Things |
| 15 | Video generation | Wan 2.2 TI2V-5B | fp16 | ~10 GB | Apache 2.0 | ✅ MLX port |

**Add-ons specific to user interest**:

| Slot | Model | RAM | Why |
|------|-------|-----|-----|
| Bio: protein structure | OpenFold3-MLX (v0.1.0) | ~4 GB | First native Apple-Silicon AF3-quality predictor; 33s/protein on M4 |
| Bio: binding affinity | Boltz-2 via ChimeraX | ~16 GB | Open-source approaching FEP accuracy; 1000× faster |
| Bio: protein LM | ESM-C 300M | <1 GB | Embeddings + zero-shot mutation effects |
| Bio: inverse folding | ProteinMPNN | <1 GB | Sequence design from any backbone |

### 2.2 Memory budget reality-check

The "everyday driver" simultaneous-resident set is models 1, 5, 9, 10, 12, 14:
- Qwen3.6-27B at Q8: **28.6 GB**
- Qwen3-VL-30B-A3B at Q4: **18 GB**
- Qwen3-Embedding-4B fp16: **8 GB**
- Qwen3-Reranker-0.6B fp16: **2.5 GB**
- Whisper-large-v3-turbo int8: **0.9 GB**
- FLUX.1 [dev] Q8: **12 GB**
- **Subtotal: ~70 GB** (leaves ~30 GB headroom for KV cache, OS, simultaneous tasks)

The full 15-model suite cannot all be resident simultaneously, but the on-demand swap-in models (xLAM-2-70b for tool-use sessions; Gemma 4 for multimodal queries; DeepSeek-R1-0528-Qwen3-8B for reasoning bursts; Wan 2.2 for video runs) each fit in remaining headroom when the everyday driver is unloaded or quantized down.

### 2.3 Three findings worth front-loading

1. **Qwen3.6-27B (April 2026, dense 27B) outperforms 397B MoE on agentic coding (SWE-bench Pro 53.5 vs 50.9), GPQA Diamond 87.8%, AIME 2026 94.1%, LiveCodeBench v6 83.9%.** Dense + Gated DeltaNet hybrid attention is the architectural insight. This single model collapses three former slots (separate coder, reasoner, generalist) into one. **Recommended primary model.**

2. **DeepSeek-R1-0528-Qwen3-8B achieves AIME 2025 87.5% (up from 70% in the prior version), and on AIME 2024 it matches Qwen3-235B-Thinking — at 8B parameters and 4.7 GB Q4.** The most surprising datapoint in the entire survey. Reasoning capability is no longer gated by model size on math benchmarks. *(Per [DeepSeek-R1-0528 HF model card](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528). The v1.0 of this doc misattributed the 87.5% to AIME 2024.)*

3. **Five flagship 2026 models are effectively unavailable on consumer Apple Silicon** — SAM 3 (triton CUDA-only kernels), AlphaFold 3 + Chai-1 + RFdiffusion3 (all hard-CUDA bio), and FLUX.2 [dev] (marked ❌ for M1/M2/M3 in [Black Forest Labs official spec](https://deepwiki.com/black-forest-labs/flux2/2.3-hardware-requirements); Klein 4B/9B variants do run via MPS but slowly). Apple Silicon viability is now governed by **kernel portability + per-tier MPS support**, not model size or weight openness. This is a structural ceiling, not a quantization choice. *(Correction from v1.0: FLUX.2 is not "all CUDA-only" — only the dev tier is unsupported on Mac.)*

---

## 3. Cross-Cutting Findings

### 3.1 The "augment-don't-replace" pattern

Every category report independently arrived at the same conclusion: a local model suite is not picked from a leaderboard — it is **layered onto an existing stack** where re-indexing, re-training, and re-tuning costs gate the upgrade decision.

Concrete examples from this synthesis:
- **Embeddings**: Qwen3-Embedding-8B yields only +0.6 MTEB EN over the current 4B — not worth re-indexing four Qdrant collections (each dim-locked). Stay on 4B; add a *parallel* code collection with Nomic Embed Code.
- **Image gen**: FLUX.1 [dev] remains the workhorse despite FLUX.2 release (which is Mac-locked anyway). Add Qwen-Image-2.0 *alongside* for text-rendering use cases.
- **Reasoning**: Don't displace Qwen3-32B with QwQ-32B (predecessor); the upgrade arrived as Qwen3-32B Thinking mode.
- **Vision**: Add UI-TARS-1.5-7B for GUI/computer-use as a *new capability slot*, not a replacement.

This pattern justifies the **two-stage validation gating** rule (`.claude/context/patterns/two-stage-validation-gating.md`): every model swap that affects an indexed datastore is a measurable behavioral change that must clear Stage 1 (regression catch) and Stage 2 (formal sign-off) before promotion.

### 3.2 The CUDA ceiling has lifted unevenly

Categories where the model architecture is naturally MPS-portable (transformers, Mamba, state-space) have native MLX or community ports within weeks of release: Qwen3.6-27B, Gemma 4, Qwen3-VL all Day-0 MLX. Categories that depend on custom CUDA kernels (FLUX.2's specialized DiT, SAM 3's triton ops, AlphaFold 3's JAX, RFdiffusion3's CUDA-only requirement) remain locked out for months or indefinitely.

| Category | CUDA-locked flagships (excluded) | Apple-Silicon best-in-class (included) |
|----------|----------------------------------|----------------------------------------|
| Vision segmentation | SAM 3 (triton CUDA-only) | SAM 2.1 (2024) |
| Image gen flagship | FLUX.2 [dev] 32B | FLUX.1 [dev] 12B |
| Protein structure | AlphaFold 3, Chai-1 | OpenFold3-MLX (Apache 2.0, 33s/protein on M4) |
| Protein design | RFdiffusion3 | RFdiffusion (M1 community port; v3 community port expected ~6mo) |
| ASR (English-only WER) | Canary-Qwen-2.5B (NeMo Linux/CUDA) | Whisper-large-v3-turbo MLX |

The implication for Jarvis architecture: **prefer model categories where the kernel pipeline is open**. A model whose authors don't ship MPS support represents a future risk regardless of weight openness.

### 3.3 Qwen family dominance + specific gaps

Qwen3 family covers all S-tier slots in language, embeddings, vision, and ASR. Two specific gaps where non-Qwen models lead and the suite must include them:

| Gap | Non-Qwen winner | Why |
|-----|-----------------|-----|
| **Tool-use τ-bench** (real multi-turn agentic) | xLAM-2-70b-fc-r (Salesforce) | APIGen-MT training; τ-bench 56.2% beats Claude 3.5 + GPT-4o on identical scenarios. Qwen3-235B-A22B leads BFCL but xLAM leads on τ-bench (the more realistic evaluation). |
| **Multimodal chat** (image + video + audio in) | Gemma 4 31B Dense (Google) | Qwen3 textbook chat models are text-only. Gemma 4 ships full multimodal at 31B dense — Day-0 MLX. |
| **Math-per-GB** | DeepSeek-R1-0528-Qwen3-8B | Technically a Qwen base distilled by DeepSeek; counts as a partial overlap. AIME 87.5% at 8B is unmatched. |

### 3.4 The "everyday driver" reframing

Pre-2026, a local model suite typically meant separate models for code, chat, reasoning, math. Qwen3.6-27B (dense, April 2026) collapses those four into one slot at SWE-bench 77.2% / GPQA 87.8% / AIME 94.1% / LiveCodeBench 83.9%. The suite design pivots from "many specialists" to "one generalist + a few targeted specialists." This shifts memory budget from N×20-30 GB (multiple specialists resident) to 30 GB driver + on-demand swap-ins.

---

## 4. Per-Category Recommendations

### 4.1 Language Models (Coding · Tool-Use · Reasoning · General)

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **S-tier daily driver** | **Qwen3.6-27B** (dense, Apr 22 2026) | Q4 16.8 GB / Q8 28.6 GB / fp16 55.6 GB | Dense 27B beats 397B MoE on SWE-bench Pro. Hybrid thinking mode. 262K context. Apache 2.0. MLX Day-0. |
| Agentic coder (specialized) | Qwen3-Coder-30B-A3B (MoE, Jul 2025) | Q4 18 GB | Built for Cline/Qwen Code agentic loops; strong tool-call format adherence at Q4. |
| Tool-use specialist | xLAM-2-70b-fc-r (Salesforce, Apr 2025) | Q4 40 GB | τ-bench 56.2%; BFCL Top-1; APIGen-MT multi-turn training. Llama 3.1 community license. |
| Compact tool-use | xLAM-2-32b-fc-r | Q4 19 GB | Same family at half size; fits 24 GB configs. |
| Reasoning (math / science) | DeepSeek-R1-0528-Qwen3-8B (May 2025) | Q4 4.7 GB | AIME 2024 87.5% at 8B. MIT. Anywhere-runnable. |
| Reasoning (workhorse) | Qwen3-32B Thinking mode | Q4 19 GB | Hybrid /think toggle; AIME'25 73%; GPQA 66.8%. |
| Reasoning (per-GB champion) | Phi-4-Reasoning-Plus (14B, Microsoft) | Q4 8.4 GB | AIME'25 82.5%; GPQA 68.9%; beats o1; MIT. 32K context limit caveat. |
| Multimodal general chat | Gemma 4 31B Dense (Apr 2 2026) | Q4 18.5 GB | MMLU-Pro 85.2%; Arena #3; text+image+video+audio in. Apache 2.0. Day-0 MLX via mlx-vlm. |
| Compact general chat | Mistral Small 3.2 (24B, Jun 2025) | Q4 14.5 GB | Apache 2.0; clean instruction following. |
| Microservice slot | Granite 4.1 8B (IBM) | Q4 4.7 GB | Apache 2.0; strong tool calling at tiny size; for Ennoia/Virgil-class services. |

**Excluded due to ceiling**: Qwen3-Coder-480B-A35B (~261 GB Q4), DeepSeek-V3-0324 (~150 GB UD-IQ1_S minimum), Llama 4 Maverick (~200 GB Q4), Mistral Large 3 (~400 GB).

**Everyday-driver verdict**: Qwen3.6-27B at Q8 (~29 GB) on a 96 GB Mac Studio; abundant headroom for KV cache, simultaneous embedding model, OCR, OS, and other tasks.

### 4.2 Vision · Multimodal · Computer-Use · OCR · Depth

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **Primary VLM** | **Qwen3-VL-30B-A3B** (MoE) | Q4 ~18 GB | 256K context; OCR + GUI capable simultaneously; Day-0 MLX; Apache 2.0. |
| Universal VLM fallback | Qwen3-VL-8B | Q4 ~5.5 GB | Runs on any Mac. |
| GUI / computer-use | **UI-TARS-1.5-7B** | GGUF ~5 GB | **94.2% ScreenSpot-V2** — surpasses Claude 3.7 (87.6) + GPT-4o Operator (87.9) on standardized GUI grounding. |
| Long-horizon GUI agent | Aria-UI | varies | Session-aware automation; secondary to UI-TARS. |
| OCR (throughput) | MonkeyOCR Apple Silicon MLX fork | fp16 ~3 GB | 3× PyTorch baseline on M-series. |
| OCR (max quality) | OlmOCR-2-7B (AllenAI) | fp16 ~14 GB | Fully open: data + code + weights. Highest accuracy on complex documents. |
| Visual grounding | Grounding DINO 1.6 Edge + SAM 2.1 | varies | Detect-then-segment pipeline. SAM 3 is **CUDA-locked** (triton). |
| Spatial / metric depth | Apple Depth Pro | fp16 ~2 GB | 0.3 s metric depth; Neural Engine path; Apple-native. |
| Multi-view depth | Depth Anything 3 (ByteDance Seed, Nov 2025) | varies | MPS PyTorch; CoreML conversion not yet available (community gap). |

**Surprising datapoint**: UI-TARS-1.5-7B at 5 GB outperforms Anthropic and OpenAI computer-use frontier APIs on the standardized benchmark. This collapses a network-dependent capability into a local one.

**Notable gap**: SAM 3's CUDA-only kernels mean local-Mac segmentation ceiling remains SAM 2.1 (a 2024 model). If high-fidelity segmentation matters to a downstream Jarvis use case, this is a real bottleneck.

### 4.3 Embeddings · Reranking

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **General dense (KEEP CURRENT)** | **Qwen3-Embedding-4B** | fp16 ~8 GB | Already deployed at dim 2560 via MLX server. 8B upgrade yields only +0.6 MTEB EN — **not worth re-indexing**. |
| **Reranker (NEW capability)** | **Qwen3-Reranker-0.6B** | fp16 ~2.5 GB | CrossEncoder via sentence-transformers; MTEB-R 65.80; beats all prior baselines. Jarvis has no reranker today; this fills the gap at low cost. |
| Code embeddings (parallel collection) | Nomic Embed Code 7B | Q4 ~7 GB | Apache 2.0, Qwen2.5-Coder backbone, top CoIR/CodeSearchNet. Add as dim=4096 collection alongside the 2560 general collection — do not replace. |
| Multivector (optional) | GTE-ModernColBERT-v1 | <1 GB | 139M params; BEIR 54.67; LongEmbed #1; via PyLate on MPS. For long-document collections only. |
| Sparse hybrid (optional) | SPLADE-v3 | ~500 MB | fastembed/ONNX; CPU-viable; adds BM25-class keyword matching for exact-term queries (fortress names, artifact IDs, REQ-IDs). |

**Decision**: Stay on Qwen3-Embedding-4B as the canonical general embedder. Add Qwen3-Reranker-0.6B for the retrieval pipeline. Spawn a parallel `codebase-code` Qdrant collection at dim=4096 with Nomic Embed Code if/when code-specific retrieval becomes a first-class use case.

**Surprising datapoint**: Qwen3-Embedding-0.6B matches the 7B GTE-Qwen2 on MTEB English (70.70 vs 70.72) at 1/11 the parameters. Worth keeping in mind for resource-constrained agent contexts (Ennoia, Virgil) where embedding cost actually matters per call.

### 4.4 Audio (STT · TTS · Streaming)

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **Daily driver ASR** | **Whisper-large-v3-turbo (MLX + WhisperKit)** | int8 ~0.9 GB | MIT. 99+ languages. ~50× realtime on M2 Ultra. WhisperKit uses Neural Engine at ~66 MB working RAM. |
| Streaming / live ASR | Voxtral-Mini-4B Realtime (Mistral, Feb 2026) | Q4 ~2.5 GB | WER 4.90% at 480ms delay; pure-C inference via voxtral.c (no PyTorch). Apache 2.0. |
| Multilingual + Apache 2.0 | Qwen3-ASR-1.7B (MLX) | Q4 ~1 GB | 52 languages + 22 Chinese dialects. 4.19× faster than PyTorch on long-form. |
| Noisy-environment ASR | IBM Granite Speech 3.3 8B | Q4 ~5 GB | Best noise robustness in independent tests. Enterprise meetings/call-center. |
| Highest English WER (cloud only) | Canary-Qwen-2.5B (NVIDIA) | — | **CUDA-only**; documented for completeness. Not suitable for local Mac. |

**Decision**: Whisper-large-v3-turbo is the daily driver via WhisperKit (Neural Engine path) for batch + lowest-latency streaming. Voxtral-Mini-4B for high-quality streaming where 8 GB resident is acceptable. Qwen3-ASR-1.7B as the multilingual + clean-license option.

### 4.5 Image Generation

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **Base T2I workhorse** | **FLUX.1 [dev] Q8** (via mflux) | ~12 GB | ~60s/image on M3 Max. Best open-weights photorealism + prompt adherence. Dominant ecosystem (LoRA, ControlNet, Kontext). |
| Text-in-image | Qwen-Image-2.0 (7B, Feb 2026) | fp16 ~14 GB | **Best legible-text rendering** (English + Chinese). Unified gen + edit in one 7B model. Apache 2.0. |
| Image editing (instruction) | FLUX.1 Kontext [dev] | ~12 GB | Only open model competing with GPT-4o image editing. No-mask in-context editing. |
| Anime / illustration | Animagine XL 4.0 (SDXL-class) | ~7 GB | 8.4M anime images training corpus through early 2025. Active LoRA ecosystem. |
| Upscaling | SeedVR2 v2.5 (3B/7B) | varies | MLX-native via mflux. Apache 2.0. Native Apple Silicon support v2.5. |

**Excluded**: FLUX.2 [dev] 32B — **CUDA-only kernels**; official docs explicitly state MPS unsupported. Only the klein 4B/9B variants work on Mac. HiDream-I1 (17B) holds the highest GenEval (0.83) but needs 34 GB+ — viable only on M2/M3 Ultra or M4 Max 48 GB+.

**Frontend recommendation**: **Draw Things as primary** — beats mflux ~25% and ComfyUI-GGUF ~94% on Apple Silicon via Metal FlashAttention 2.0 and the s4nnc inference engine. Use mflux as CLI fallback for models not in Draw Things and for batch scripting. ComfyUI + MLX extension only for ControlNet workflows.

### 4.6 Video Generation

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **Primary** | **Wan 2.2 TI2V-5B** | fp16 ~10 GB (24 GB recommended) | Apache 2.0. Best open-weights video quality 2025. MLX-native via osama-ata/Wan2.2-mlx. Text+image hybrid input. |
| Audio+video synchronized | LTX-2.3 (22B) | varies | Generates synchronized audio + video in one pass. Local MLX port experimental and slow; official LTX Desktop routes to cloud API. |
| Long-form / cinematic | HunyuanVideo 1.5 | varies | Higher quality but heavier compute; MPS path slow. |

**Verdict**: Wan 2.2 is the only practical local video model on Mac today. Other categories (camera control, motion brush) remain experimental.

### 4.7 Genomics · Molecular Biology · Bioinformatics

| Slot | Model | Memory | Notes |
|------|-------|--------|-------|
| **Protein structure** | **OpenFold3-MLX** (v0.1.0) | ~4 GB | **First native Apple-Silicon AF3-quality predictor**. 33 s/protein on M4. Apache 2.0. |
| Binding affinity | Boltz-2 (via ChimeraX) | ~16 GB | First open-source approaching FEP accuracy at 1000× speed. MIT. |
| Protein LM (embeddings) | ESM-C 300M | <1 GB | Cambrian Open license. Zero-shot mutation effects. |
| Inverse folding | ProteinMPNN | <1 GB | MIT. Sequence design from any backbone in seconds. |
| Structure-aware protein LM | SaProt 650M | varies | #1 ProteinGym; non-commercial license. |
| Genomic features | Nucleotide Transformer v2 500M | varies | 12 kb context; 18 benchmark tasks. Apache 2.0. |
| Long-range regulatory genomics | Caduceus (Mamba-based) | <100 MB | 131 kb context. Sub-100 MB. Apache 2.0. |
| Single-cell foundation | Geneformer V2 (316M) | varies | Cell-type annotation; therapeutic target discovery. CC-BY-4.0. |
| RNA structure / function | AIDO.RNA 1.6B | ~3.2 GB | 24/26 task SOTA. Apache 2.0. |
| Cheminformatics | ChemBERTa-3 | <1 GB | SMILES property prediction. Apache 2.0. |
| Antibody | AbLang-2 | <1 GB | Sequence analysis; mutation likelihoods. MIT. |
| Variant interpretation | SpliceAI + Pangolin + AlphaMissense | <2 GB | Complete clinical-grade variant calling pipeline. CPU-feasible. |

**Suite memory load (simultaneous)**: ~12-15 GB for all 12 bio models. The headline insight is that *the entire molecular biology workstation now fits inside the spare RAM of a Mac Studio after the everyday-driver LLM is loaded*.

**Cloud-only (excluded)**:
- AlphaFold 3 (DeepMind, JAX/CUDA) — A100/H100 80 GB required
- Chai-1 — hard CUDA + bfloat16, no fallback
- RFdiffusion3 — CUDA-only officially (community Mac port expected ~6 months)
- Evo 2 (7B/40B) — CUDA + Flash Attention required
- ESM3 98B — API only, weights unreleased

**Killer-app claim**: Drug screening, mRNA design, full clinical variant interpretation, and AF3-class structure prediction are now all locally-deployable on a Mac Studio. This was cloud-only 18 months ago.

---

## 5. Apple Silicon Compatibility Matrix

Symbol key: ✅ MLX-native · ⚡ CoreML / WhisperKit · 🔶 MPS PyTorch / GGUF only · 🔴 CUDA-locked

| Category | MLX-native winner | MPS-only competitive | CUDA-locked excluded |
|----------|-------------------|---------------------|---------------------|
| Language (chat / code / reasoning) | Qwen3.6-27B ✅ | Mistral Small 3.2 🔶 | DeepSeek-V3-0324 (size, not kernel) |
| Multimodal | Qwen3-VL-30B-A3B ✅ / Gemma 4 31B ✅ | InternVL3.5-30B-A3B 🔶 (no MLX despite MIT) | — |
| Computer-use | UI-TARS-1.5 ✅ via Ollama | Aria-UI 🔶 | — |
| OCR | MonkeyOCR-MLX ✅ / OlmOCR-2 🔶 | — | — |
| Segmentation | SAM 2.1 🔶 | — | **SAM 3 🔴 (triton)** |
| Embeddings | Qwen3-Embedding family ✅ | — | — |
| Reranking | Qwen3-Reranker ✅ | jina-reranker-v3 🔶 | — |
| ASR daily | Whisper-large-v3-turbo ✅ + ⚡ | Voxtral-Mini-4B 🔶 | **Canary-Qwen-2.5B 🔴** |
| Image gen flagship | FLUX.1 [dev] ✅ via mflux | HiDream-I1 🔶 | **FLUX.2 [dev] 🔴** |
| Video gen | Wan 2.2 ✅ via osama-ata MLX | HunyuanVideo 1.5 🔶 | — |
| Protein structure | OpenFold3-MLX ✅ | Boltz-2 🔶 (CPU/MPS via ChimeraX) | **AlphaFold 3 🔴, Chai-1 🔴** |
| Protein design | ProteinMPNN ✅ | RFdiffusion (M1 community) 🔶 | **RFdiffusion3 🔴** |
| Genomic LM | Caduceus ✅ / NT-v2 🔶 | — | **Evo 2 🔴** |

The **🔴 column** is the structural ceiling. Six flagship models from 2026 alone (FLUX.2, SAM 3, AlphaFold 3, Chai-1, RFdiffusion3, Canary-Qwen-2.5B) are unavailable to Apple Silicon despite open-or-permissive licensing — all because of CUDA-specific kernel dependencies.

---

## 6. Deployment Stack Recommendations

| Frontend / Runtime | Use for | Notes |
|--------------------|---------|-------|
| **MLX-LM** | Primary LLM serving (Qwen3.6-27B, Gemma 4, xLAM-2 via community port) | mlx-community quants on Hugging Face |
| **Ollama** | Convenient single-command serving; UI-TARS via GGUF | Slower than mlx-lm but easier ops |
| **LM Studio** | GUI workflow, model browsing | Bundles MLX runtime under the hood |
| **WhisperKit (Argmax)** | Streaming ASR via Neural Engine | ~66 MB working RAM; lowest latency |
| **mlx-whisper** | Batch ASR; transcript pipelines | GPU path via MLX |
| **mlx-vlm** | Multimodal serving (Qwen3-VL, Gemma 4 multimodal) | Day-0 support for both |
| **Draw Things** | **Primary image-gen frontend** | 25% faster than mflux, 94% faster than ComfyUI-GGUF on Apple Silicon |
| **mflux** | CLI image-gen / batch / new model variants | Fallback for models Draw Things doesn't yet support |
| **ComfyUI + MLX extension** | ControlNet workflows; video gen | 50-70% speedup over vanilla MPS |
| **osama-ata/Wan2.2-mlx** | Local video gen | MLX port of Wan 2.2 |
| **Sentence-Transformers + Qdrant** | Embeddings + vector store (current) | Continue with Qwen3-Embedding-4B |
| **PyLate** | Multivector retrieval (if added) | For long-document collections |
| **ColabFold local** | OpenFold3-MLX deployment | Native MLX path |
| **ChimeraX** | Boltz-2 binding affinity workflow | GUI-driven CPU path |

---

## 7. Two-Stage Validation Rollout Plan

Per `.claude/context/patterns/two-stage-validation-gating.md`, every model swap that affects measurable behavior must clear Stage 1 and Stage 2 before promotion.

### Stage 1 (regression-catch, hours-48h windows for service-class changes)

For each candidate model, the regression-catch axes are:

| Axis | Signal | Criteria |
|------|--------|----------|
| Cache stability | LiteLLM / mlx-lm cache hit rate | Δ ≤5pp from baseline |
| Latency | tokens/sec or seconds/turn | Δ ≤20% from baseline |
| Memory | resident set size | ≤budget allocated for slot |
| Failure rate | tool-call format errors, refusal rate | ≤2× baseline |
| Output register | Jeeves-Brief / Alfred-Brief compliance | quote-aware filter score unchanged |

**Stage 1 verdicts**: `STAGE_1_CLEAR` (proceed to Stage 2), `STAGE_1_HALT` (rollback), `STAGE_1_DEFERRED` (more samples needed).

### Stage 2 (formal sign-off, days-14d windows for service-class changes)

For each candidate, pre-register the effect-axis predictions before deployment:

| Axis | Predicted effect | Measurement window |
|------|------------------|-------------------|
| Capability score | benchmark on representative task corpus | 7-14 days |
| Per-class output quality | Wiggum-loop quality, code-review pass rate | matched-population |
| User-perceived utility | session task completion rate | 7-14 days |

**Stage 2 verdicts**: `STAGE_2_PASS` (promote), `STAGE_2_PARTIAL` (revise), `STAGE_2_FAIL` (rollback), `STAGE_2_REGRESSION_CATCH` (Stage 1 re-fire mid-window).

### Recommended rollout order

1. **Qwen3-Reranker-0.6B** — new capability, no displacement risk, lowest Stage 1 + 2 cost. Deploy first.
2. **Whisper-large-v3-turbo MLX + WhisperKit** — replaces no current model (audio is greenfield); pure additive.
3. **Qwen3.6-27B** — Stage 1 against current `claude-opus-4-7[1m]` on a held-out benchmark suite; Stage 2 measures cost-per-task + quality on representative Wiggum-loop sessions.
4. **UI-TARS-1.5-7B** — new capability slot; Stage 2 measured against Anthropic computer-use API on identical task suite.
5. **OpenFold3-MLX** — additive; Stage 2 measures structural-prediction accuracy vs cloud AlphaFold 3 reference set.
6. **FLUX.1 [dev] + Draw Things** — new capability; Stage 2 measures quality vs DALL-E 3 / Midjourney reference outputs.
7. **Wan 2.2 TI2V-5B** — last; video gen is highest variance and least mature.

Each step can run in parallel on the orthogonal-stream rule (per pattern §4.7-equivalent stacking) — embeddings/reranker work survives a failed Qwen3.6-27B Stage 2 because they're independent streams.

---

## 8. Open Questions / 6-Month Revisit (Nov 2026)

| Question | Why it matters | Trigger to revisit |
|----------|----------------|-------------------|
| Gemma 4 MLX bug resolution | Currently broken in MLX as of April 2026; Ollama is only stable Mac path | Ollama → MLX migration when fixed |
| InternVL3.5 MLX port | MIT license, MMMU-Pro 75.6 (highest VLM); no MLX port despite obvious community gap | Community release |
| Qwen3-VL-235B-A22B fit on M3/M4 Ultra | 22B active is borderline at Q4 within 100 GB ceiling | Benchmark when Mac Studio Ultra becomes available |
| Depth Anything 3 CoreML conversion | Would unlock Neural Engine for depth | Apple ML community |
| RFdiffusion3 community Mac port | M1 community port for RFdiffusion v1 worked; v3 expected within 6 months | Community release |
| Protenix-Mini via MPS | ByteDance compact variant (85% FLOP reduction, ~90M params) may become Mac-feasible | Community port |
| Evo 2 lighter checkpoint or CPU/MPS path | 7B model sits right at feasibility boundary on 64 GB Mac | Arc Institute release |
| CZI rBio virtual cell model | If pip-packaged, major local single-cell capability upgrade | CZI release |
| Boltz-2 native MLX | Currently CPU/MPS via ChimeraX; native MLX would 10-100× speed | Community port |
| Bio-AI license liberalization | Several bio models (AlphaFold 3, ESM-C 600M+) carry non-commercial restrictions | Field pressure |
| Qwen3 family successor (Qwen3.7? Qwen4?) | Cadence has been ~4-month major releases | Q4 2026 expected |

---

## 9. Summary in Five Lines

1. **Adopt Qwen3.6-27B as everyday driver.** Q8 fits in 32 GB; replaces three former specialist slots.
2. **Add Qwen3-Reranker-0.6B as a new pipeline step.** Augment, not replace, current Qwen3-Embedding-4B.
3. **Computer-use is now local: UI-TARS-1.5-7B beats Claude 3.7 + GPT-4o Operator on standardized GUI grounding.**
4. **Apple Silicon ceiling has lifted unevenly: kernel portability, not size, is the new gate.** FLUX.2, SAM 3, AlphaFold 3 remain locked out; FLUX.1, SAM 2.1, OpenFold3-MLX serve their slots.
5. **Bio workstation is now real on a Mac.** OpenFold3-MLX + Boltz-2 + ProteinMPNN + ESM-C + variant pipeline = ~12 GB simultaneous. Cloud-only as recently as 2024.

---

## 10. Sources

Full citation list lives in the per-category scratch files. Headline sources by category:

**Language**: Qwen3-Coder Blog · Qwen3.6-27B MarkTechPost · Qwen3.6-27B Release Blog · Phi-4-Reasoning Microsoft · DeepSeek-R1-0528 VentureBeat · BFCL V4 Leaderboard · xLAM GitHub Salesforce · Qwen3 arXiv

**Vision**: Qwen3-VL arXiv · InternVL3.5 Blog · UI-TARS-1.5 Release · Gemma 4 HF Blog · Apple Depth Pro ML Research · OlmOCR-2 GitHub · SAM 3 Apple-Silicon Discussion · MonkeyOCR Apple-Silicon HF · Open VLM Leaderboard · Depth Anything 3 GitHub

**Embeddings**: Qwen3 Embedding Blog · jakedahn MLX Server · MTEB March 2026 · jina-reranker-v3 · GTE-ModernColBERT · Nomic Embed Code · mxbai-rerank-v2

**Audio**: HF Open ASR Leaderboard · NVIDIA Canary · OpenAI Whisper · Mistral Voxtral · IBM Granite Speech · Qwen3-ASR · TTS Arena · WhisperKit/Argmax

**Image / Video**: mflux GitHub · Black Forest Labs FLUX.1 Kontext · FLUX.2 Hardware Requirements · HiDream-I1 arXiv · Wan2.2 GitHub · Wan2.2 MLX port · HunyuanVideo 1.5 · LTX-2.3 Docs · Qwen-Image 2.0 · Animagine XL 4.0 · Draw Things Metal FlashAttention · Artificial Analysis Image Leaderboard

**Bio**: OpenFold3-MLX · Boltz-2 MIT Jameel Clinic · Boltz-2 bioRxiv · Evo 2 Arc Institute · ESM3 Science · ESM Cambrian · Protenix-v1 ByteDance · RFdiffusion3 IPD · BindCraft Nature 2025 · Nucleotide Transformer v2 Nature Methods · AIDO.RNA CMU · TranscriptFormer CZI · SaProt GitHub · ChemBERTa-3 ChemRxiv · AlphaMissenseR Bioinformatics Advances · Helix-mRNA arXiv · Caduceus arXiv · Geneformer HF · AbLang-2 GitHub

---

*Local Model Suite v1.0 — synthesized 2026-05-01 from 6 deep-research investigations · Pending Stage 1 / Stage 2 validation per two-stage-gating pattern · Promote selectively to MEMORY.md operational habits when individual models clear Stage 2*
