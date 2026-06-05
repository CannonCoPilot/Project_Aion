<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20ARM64-black?style=for-the-badge&logo=apple" alt="macOS"/>
  <img src="https://img.shields.io/badge/AI-Claude%20Opus%204-blueviolet?style=for-the-badge&logo=anthropic" alt="Claude"/>
  <img src="https://img.shields.io/badge/Infra-Docker%20%7C%2016+%20Services-blue?style=for-the-badge&logo=docker" alt="Docker"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT"/>
</p>

# Project Aion

**A self-monitoring, self-improving AI development platform that extends Claude Code into a fully autonomous engineering environment.**

Project Aion is a production-grade orchestration layer built on top of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Anthropic's CLI for Claude. It adds persistent memory hierarchies, intelligent context management, autonomous task pipelines, real-time telemetry, and multi-agent coordination that go far beyond out-of-the-box capabilities.

Two AI Archons work in symbiosis:
- **Jarvis** (Master Archon) — deep collaborative development with persistent sessions, 5-tier memory, self-reflection, and adaptive context compression
- **Alfred** (Operations Archon) — headless operations: cron-driven pipelines, 24-persona task execution, Kanban-style project management, and observability dashboards

---

## Why This Exists

Claude Code is powerful but stateless between sessions, lacks project memory beyond conversation context, has no built-in task orchestration, and provides limited observability into API usage patterns. Project Aion solves these gaps:

| Gap | Aion Solution |
|-----|--------------|
| **No persistent memory** | 5-tier memory hierarchy: ephemeral → session → cross-session → semantic (Qdrant) → structural (Neo4j knowledge graph) |
| **Context window exhaustion** | JICM v7.9 — intelligent context compression with AI-driven summarization, automatic checkpoint/restore cycles |
| **No task automation** | Alfred pipeline: 24 AI personas, signal-file delegation, chain-executor with warm session forking |
| **No usage visibility** | Reverse proxy telemetry capturing every API call, rate-limit headers, burn-rate curves, and cost attribution |
| **No self-improvement** | Autonomic components (AC-01 through AC-10): self-launch, iterative verification, milestone review, self-reflection, self-evolution |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Project Aion                              │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   Jarvis (Master)     │    │   Alfred (Operations)         │   │
│  │                        │    │                                │   │
│  │  ● 5-Tier Memory      │    │  ● Pulse API (FastAPI)        │   │
│  │  ● JICM Compression   │◄──►│  ● Nexus Dashboard (React)   │   │
│  │  ● 10 Autonomic       │    │  ● 24 AI Personas             │   │
│  │    Components          │    │  ● Chain Executor             │   │
│  │  ● 52 Behavior        │    │  ● Pipeline Watcher           │   │
│  │    Patterns            │    │  ● Usage Proxy + Telemetry    │   │
│  └──────────────────────┘    └──────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shared Infrastructure (Docker)                │   │
│  │  PostgreSQL/ParadeDB │ Qdrant │ Neo4j │ Redis │ n8n       │   │
│  │  Ollama │ LiteLLM │ MLX Embeddings │ Authentik │ Caddy    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Service Inventory (16+ containers)

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL/ParadeDB | 5432 | Primary data store with pgvector + BM25 |
| Qdrant | 6333 | Vector search for RAG (2560-dim Qwen3 embeddings) |
| Neo4j | 7687 | Knowledge graph (Graphiti agent memory) |
| Redis | 6379 | Cache, queues, agent working memory |
| Pulse API | 8800 | Task management — 80+ REST endpoints |
| Nexus Dashboard | 8701 | React operations dashboard (35+ pages) |
| Usage Proxy | 9800 | API telemetry: rate limits, tokens, cost attribution |
| LiteLLM | 4000 | Multi-model proxy (Qwen3 32B/8B) |
| MLX Embeddings | 8000 | Qwen3-Embedding-4B on Apple Silicon |
| Ollama | 11434 | Local LLM inference (8 models) |
| Authentik | 9000 | SSO/OIDC authentication |
| Caddy | 443 | Reverse proxy + automatic HTTPS |

---

## Key Technical Achievements

### Intelligent Context Management (JICM v7.9)

The biggest operational challenge with LLM-powered development is context window exhaustion. JICM monitors token usage in real-time and orchestrates AI-driven compression cycles:

```
Token Usage → Threshold Detection → AI Summarization → Context Checkpoint
    ↓              ↓                      ↓                    ↓
 Live HUD     soft 250K/hard 300K    qwen3:8b local     Qdrant auto-ingest
                                                              ↓
                                                     Seamless /clear + Resume
```

- **Zero-loss context transitions**: compressed checkpoints are auto-ingested into Qdrant for semantic recall
- **5-tier memory hierarchy**: ephemeral → session → cross-session → semantic (RAG) → structural (knowledge graph)
- **Autonomic circuits**: L3→L4 auto-ingest with 0.92 dedup threshold, L5→L2 relevance retrieval with 12 trigger types

### Pipeline v2 — Chain Executor

Alfred's pipeline replaces expensive `claude -p` subprocess spawning with a warm-session fork model:

```
Seed Session (cache-warm) ──fork──► Chain Window 1 ──sentinel──► Complete
                           ──fork──► Chain Window 2 ──sentinel──► Complete
                           ──fork──► Chain Window N ──sentinel──► Complete
```

**6.2× cost reduction** per task vs cold `claude -p` calls (measured: $0.049 vs $0.305 per child).

### Autonomic Components (AC-01 through AC-10)

| AC | Name | Function |
|----|------|----------|
| AC-01 | Self-Launch | Load identity, read state, begin work autonomously |
| AC-02 | Wiggum Loop | Multi-pass verification: Execute → Check → Review → Drift → Continue |
| AC-03 | Milestone Review | Dual-agent code quality + progress assessment |
| AC-04 | JICM | Intelligent context compression (described above) |
| AC-05 | Self-Reflection | Analyze corrections, identify behavioral patterns |
| AC-06 | Self-Evolution | Implement queued improvements with risk gating |
| AC-07 | R&D Cycles | Research external + internal efficiency opportunities |
| AC-08 | Maintenance | Health checks, freshness audits, log rotation |
| AC-09 | Session Meditation | End-of-session consolidation + knowledge capture |
| AC-10 | Ulfhedthnar | Emergency override: parallel agents, approach rotation |

### API Telemetry & Burn-Rate Analysis

Every Anthropic API call passes through a reverse proxy that captures:
- Rate-limit headers (unified 5h/7d utilization windows)
- Token accounting by class (input, output, cache_read, cache_write)
- Per-session cost attribution via custom `x-aion-*` headers
- Real-time burn-rate curves with regression analysis on the dashboard

---

## tmux Session Layout

```bash
bash .claude/scripts/launch-aion.sh [--dev] [--fresh] [--lite]
```

| Window | Name | Role |
|--------|------|------|
| W0 | Jarvis | Primary Claude Code session (Master Archon) |
| W1 | Watcher | JICM v7.9 context monitor |
| W2 | Ennoia | Session orchestrator |
| W3 | Virgil | Codebase guide |
| W4 | Commands | Signal file → command injection |
| W5 | Jarvis-dev | Engineering/infrastructure test driver |
| — | MLX-Embed | Qwen3-Embedding-4B server |
| — | LiteLLM | Multi-model proxy |
| — | Ollama | Local model monitor |
| — | HUD | Real-time dashboard |
| — | Bridge | Host executor signal daemon |
| — | Protos | Warm chain session (Alfred identity) |

---

## Tech Stack

**Languages**: Python, TypeScript, Bash, SQL, YAML  
**AI/ML**: Claude Opus 4 (1M context), Qwen3 (32B/8B/0.6B), MLX embeddings  
**Databases**: PostgreSQL/ParadeDB (pgvector + BM25), Qdrant, Neo4j, Redis, DuckDB  
**Infrastructure**: Docker Compose, tmux, Caddy, Authentik, Prometheus, Grafana  
**Frameworks**: FastAPI, React, Vite, Streamlit, n8n  
**Tools**: Claude Code, LiteLLM, Ollama, FastMCP 3.0  

---

## Repository Structure

```
Project_Aion/
├── .claude/              # Jarvis Archon (capabilities, context, hooks, skills, agents)
│   ├── context/          # Knowledge layer: 52 patterns, psyche, components
│   ├── scripts/          # 80+ operational scripts (launcher, JICM, HUD, telemetry)
│   ├── skills/           # 12 active skill modules
│   └── plans/            # Implementation plans (adjective-animal naming)
├── alfred/               # Alfred Archon (operations, Nexus, Pulse, dashboard)
│   ├── pulse/            # Pulse task API (FastAPI, 80+ endpoints)
│   ├── dashboard/        # Nexus dashboard (React, 35+ pages)
│   ├── usage-proxy/      # Anthropic API telemetry reverse proxy
│   └── .claude/          # Alfred-specific hooks, personas, job executors
├── infrastructure/       # Shared Docker stack
│   ├── docker-compose.yml
│   ├── qwen3-embeddings-mlx/
│   └── litellm-config.yaml
└── projects/             # Development artifacts and reports
```

---

## License

MIT License — see [LICENSE](LICENSE).

---

<p align="center">
  <em>Project Aion — where AI builds AI tooling, autonomously.</em>
</p>
