## Apple Silicon LLM Inference Stack Research (2026-02-17)

**Research Scope**: Comprehensive investigation of MLX/mlx-lm, exo distributed inference, Thunderbolt 5 RDMA clustering, and multi-engine comparison for M4 Max 128GB Mac Studio deployment.

**Key Findings**:

1. **MLX + vllm-mlx is the performance leader**: vllm-mlx outperforms mlx-lm and llama.cpp by 17–87% on M4 Max 128GB across all model sizes. mlx-lm is the best balance of simplicity + speed for single-machine deployments.

2. **exo 1.0 + RDMA is the clustering answer**: macOS 26.2 enables RDMA over TB5, dropping inter-Mac latency from 300μs to <50μs. exo achieves 3.2x speedup on 4 nodes for models like Kimi K2 (1T params).

3. **Thunderbolt 5 RDMA requires full-mesh**: No TB5 switches exist. 4-Mac cluster requires 6 direct TB5 cables. Topology ceiling is ~4–5 Macs.

4. **For n8n/agents: Ollama is the integration layer**: Native Ollama node in n8n. OpenAI-compatible endpoint for Claude Code via `mlx-lm.server` or `mlx-openai-server`.

5. **LiteLLM as multi-model router**: Self-hosted proxy unifying Ollama, mlx-lm serve, and cloud fallbacks into one OpenAI-compatible endpoint.

**Reports**:
- Full report: `.claude/agents/memory/deep-research/apple-silicon-inference-2026-02-17.md`

**Sources**: 35+ references from Apple Research, Jeff Geerling, EuroMLSys '26 paper, official GitHub repos.
