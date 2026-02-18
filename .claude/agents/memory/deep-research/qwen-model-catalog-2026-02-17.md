## Qwen Model Family + Local LLM Catalog Research (2026-02-17)

**Research Scope**: Comprehensive catalog of Qwen family and top alternative open-weight models for M4 Max 128GB Mac Studio. Covers all modalities, memory budgets, MLX availability, and task-specific recommendations.

**Key Findings**:

1. **Qwen3.5-397B-A17B released Feb 16, 2026** — natively multimodal MoE, 17B active params, 2M context, 201 languages. Requires 256GB+ RAM; too large for 128GB alone.

2. **Qwen3-VL is the current vision king** — 8B/32B dense + 30B-A3B/235B-A22B MoE. 256K context, beats Gemini 2.5 Pro in perception. MLX via mlx-vlm. Use Qwen3-VL-8B for 128GB, Qwen3-VL-32B at Q4.

3. **Qwen3-Coder-Next is the coding champion** — 94.1% HumanEval, 74.2% SWE-Bench. 80B-A3B architecture (3B active). Fits 128GB at Q4.

4. **Qwen3-32B is the best all-around text model** — thinking/non-thinking modes, 128K context, Apache 2.0. Needs ~20GB Q4. Excellent for agentic work.

5. **gpt-oss-20b is the OpenAI OSS pick** — 21B MoE, o3-mini comparable, 16GB RAM. Runs on Apple Silicon via LM Studio GGUF. gpt-oss-120b needs 60-80GB.

6. **Qwen2.5-Omni-7B is the audio/omni pick** — text+image+audio+video input, text+speech output. 4-bit GPTQ available. MLX support via mlx-audio.

7. **nomic-embed-text-v2-moe is the embedding pick** — MoE architecture, ~100 languages, Ollama-compatible, Metal accelerated.

8. **Memory sweet spots for 128GB**: Q4 70B = ~40GB, Q4 32B = ~20GB, Q4 14B = ~9GB, Q4 8B = ~5GB. Can run 2-3 medium models simultaneously.

**Model IDs**:
- Qwen3-32B: `Qwen/Qwen3-32B` / `mlx-community/Qwen3-32B-4bit`
- Qwen3-VL-8B: `Qwen/Qwen3-VL-8B-Instruct`
- Qwen3-Coder-Next: `Qwen/Qwen3-Coder-Next-Instruct`
- Qwen2.5-Omni-7B: `Qwen/Qwen2.5-Omni-7B`
- Qwen2.5-VL-72B: `Qwen/Qwen2.5-VL-72B-Instruct` / `mlx-community/Qwen2.5-VL-72B-Instruct-4bit`
- gpt-oss-20b: `openai/gpt-oss-20b`
- gpt-oss-120b: `openai/gpt-oss-120b`
- Phi-4-reasoning: `microsoft/Phi-4-reasoning-plus`
- Gemma 3 27B: `google/gemma-3-27b-it` / `mlx-community/gemma-3-27b-it-4bit`
- Llama 4 Scout: available via Meta/HuggingFace

**Reports**: Full report at `.claude/reports/research/qwen-model-catalog-2026-02-17.md`

**Sources**: Qwen blog, HuggingFace model cards, OpenAI gpt-oss announcement, arxiv technical reports, mlx-community HF org.
