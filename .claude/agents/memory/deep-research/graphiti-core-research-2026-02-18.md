# Research Report: graphiti-core Python Package

**Date**: 2026-02-18
**Scope**: graphiti-core version, dependencies, LLM backend compatibility (OpenAI-compatible/LiteLLM), local model viability (Qwen3-8B/32B), built-in MCP server status, Neo4j requirements, and official MCP packages.

---

## Executive Summary

graphiti-core is a temporal knowledge graph library by Zep (getzep) currently at version 0.28.0 (Feb 17, 2026). It is designed for AI agent memory via incremental, bi-temporal graph construction. Core dependencies include `openai>=1.91.0` and `neo4j>=5.26.0` as hard requirements, with structured output being the critical LLM capability. OpenAI-compatible APIs are supported via `OpenAIGenericClient`, making LiteLLM a viable proxy layer. Local models like Qwen2.5-14B+ are viable; Qwen3 has an open-and-closed support issue with no confirmed working configurations, and reasoning-mode variants (DeepSeek-R1, Qwen3 thinking-mode) are known to fail. The MCP server is a standalone script in `mcp_server/`, NOT a `graphiti_core.mcp_server` importable module. Neo4j 5.26 is the minimum required version. No official npm package exists; the official distribution is PyPI only.

---

## Key Findings

### 1. Current Version and Dependencies

**Version**: 0.28.0 (released February 17, 2026)
**Python**: >=3.10, <4
**License**: Apache-2.0

**Core (required) dependencies from pyproject.toml:**
| Package | Min Version |
|---------|-------------|
| pydantic | >=2.11.5 |
| neo4j | >=5.26.0 |
| openai | >=1.91.0 |
| tenacity | >=9.0.0 |
| numpy | >=1.0.0 |
| diskcache | >=5.6.3 |
| python-dotenv | >=1.0.1 |
| posthog | >=3.0.0 |

**Optional extras:**
- `anthropic`: anthropic>=0.49.0
- `groq`: groq>=0.2.0
- `google-genai`: google-genai>=1.62.0
- `kuzu`: kuzu>=0.11.3
- `falkordb`: falkordb>=1.1.2,<2.0.0
- `voyageai`: voyageai>=0.2.3
- `neo4j-opensearch`: boto3>=1.39.16, opensearch-py>=3.0.0
- `sentence-transformers`: sentence-transformers>=3.2.1
- `neptune`: langchain-aws>=0.2.29, opensearch-py>=3.0.0, boto3>=1.39.16
- `tracing`: opentelemetry-api>=1.20.0, opentelemetry-sdk>=1.20.0

Note: The `openai` package is a HARD dependency even when using other LLM backends.

### 2. OpenAI-Compatible API Support (LiteLLM)

graphiti-core supports OpenAI-compatible APIs via `OpenAIGenericClient`. This is distinct from `OpenAIClient`:
- `OpenAIClient` uses the beta `responses.parse()` API → NOT compatible with most third-party endpoints
- `OpenAIGenericClient` uses `/v1/chat/completions` with `response_format` → compatible with Ollama, vLLM, LiteLLM, LM Studio, etc.

**LiteLLM integration pattern**: Run LiteLLM proxy, configure graphiti's `OpenAIGenericClient` to point at `http://localhost:4000/v1`. LiteLLM handles backend routing. The `openai` SDK in graphiti-core will work against any compliant OpenAI-compatible endpoint.

Key config parameters:
- `base_url`: point to LiteLLM or vLLM endpoint
- `api_key`: dummy value like "abc" works for Ollama/LiteLLM with local models
- Model name: must match what the backend expects

Structured output is transmitted via `response_format={"type": "json_object"}` or JSON schema mode.

### 3. LLM Capabilities Required / Local Model Viability

**Required LLM operations:**
1. Entity extraction — analyze episode text, identify named entities
2. Relationship/fact extraction — infer edges between entities
3. Node deduplication — select canonical entity from candidates
4. Edge deduplication — merge or supersede conflicting facts
5. Attribute summarization — generate entity summary text
6. JSON structured output — all above require valid Pydantic-validated JSON

**Critical constraint**: Graphiti uses structured output extensively. Models that cannot reliably produce schema-conformant JSON will cause `ingestion failures`. Reasoning-mode models (DeepSeek-R1, Qwen3 with thinking enabled) are explicitly known to fail — they return schema definitions instead of populated data.

**Local model viability:**
- Qwen2.5-14B: Community-reported working configurations exist (via Ollama `qwen2.5:14b`)
- Qwen2.5-32B: Likely viable given Qwen2.5 series JSON reliability improvements
- Qwen3-8B: Uncertain — GitHub issue #464 was closed by redirecting to OpenAI-compatible docs without confirmed working configs; Qwen3 instruct variants had vLLM structured output infinite generation bugs
- Qwen3-32B: Higher capability suggests better reliability, but no confirmed graphiti-specific reports found; Qwen3 thinking mode MUST be disabled (non-thinking mode only)
- Qwen3-8B recommendation: RISKY — 8B is on the edge of reliable structured JSON; official docs warn against smaller models
- Qwen3-32B recommendation: PLAUSIBLE with non-thinking mode, but not confirmed

**Official recommendation**: OpenAI GPT-4o-mini was used in the graphiti research paper for graph construction. Frontier-class reasoning is NOT required — a capable mid-size model with reliable JSON output is sufficient. The bottleneck is structured output reliability, not reasoning depth.

### 4. MCP Server Status

**There is NO `graphiti_core.mcp_server` importable Python module.**

The MCP server is a **standalone script-based application** in a separate `mcp_server/` directory of the getzep/graphiti GitHub repo. It is NOT part of the `graphiti-core` pip package.

Deployment path:
```
git clone https://github.com/getzep/graphiti.git
cd graphiti/mcp_server
uv sync
uv run main.py  # or graphiti_mcp_server.py
```

Docker is supported: `docker compose -f docker/docker-compose-neo4j.yml up`

The MCP server is described as "experimental and under active development."

MCP transport: HTTP (default, endpoint `/mcp/` at `http://localhost:8000/mcp/`) or stdio.

Built on FastMCP framework. Capabilities:
- Episode management (add/retrieve/delete)
- Entity search and management
- Semantic + hybrid search
- Group management with group_id isolation
- Graph maintenance and index rebuild

### 5. Neo4j Version Requirements

- **Minimum**: Neo4j 5.26 (hard requirement, specified in pyproject.toml as `neo4j>=5.26.0`)
- **Supported editions**: Community (free), Enterprise, AuraDB (cloud)
- **APOC plugin**: REQUIRED for Community/Enterprise (add via `NEO4J_PLUGINS='["apoc"]'` in Docker)
- **AuraDB**: APOC included automatically, no extra config needed
- **Parallel runtime** (`USE_PARALLEL_RUNTIME=true`): Enterprise + larger AuraDB only, not available in Community
- **Connection env vars**: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

### 6. Official MCP Server Packages

**PyPI**: No separate official `graphiti-mcp` package. The MCP server code lives in the GitHub repo only.
**npm**: No official npm package exists.

**Community packages:**
- `graphiti-memory` (PyPI) — community fork with Ollama support; `uvx montesmakes.graphiti-memory`
- `@zhangzichao2008/mcp-graphiti` (npm) — third-party, supports Neo4j
- `rawr-ai/mcp-graphiti` (GitHub) — fork with multi-project Docker support
- `graphiti-mcp-but-working` (GitHub michabbb) — adds MCP 2025-06-18 Streamable HTTP transport, telemetry control

---

## Recommendations

1. **LiteLLM as proxy**: Use `OpenAIGenericClient` pointing to a LiteLLM proxy. This gives graphiti structured output via `/v1/chat/completions` while allowing any local or cloud backend.

2. **Model selection**: Start with Qwen2.5-32B or Qwen3-32B (non-thinking mode). Avoid Qwen3-8B for production graph construction due to JSON reliability risk. If budget allows, route graph construction tasks through a larger model and embedding tasks locally.

3. **Thinking mode**: DISABLE Qwen3 thinking mode when using for graphiti. Set `/no_think` system prompt or configure appropriately. Thinking models return schema metadata or runaway tokens.

4. **MCP server deployment**: Clone the repo, run `uv sync` in `mcp_server/`, use Docker Compose for production. Do NOT expect `from graphiti_core.mcp_server import ...` to work.

5. **Neo4j**: Use Neo4j 5.26+ Community Edition with APOC plugin. Already deployed in Jarvis stack.

---

## Sources
- https://pypi.org/project/graphiti-core/
- https://github.com/getzep/graphiti/blob/main/pyproject.toml
- https://github.com/getzep/graphiti
- https://help.getzep.com/graphiti/configuration/llm-configuration
- https://help.getzep.com/graphiti/configuration/neo-4-j-configuration
- https://help.getzep.com/graphiti/getting-started/mcp-server
- https://github.com/getzep/graphiti/blob/main/mcp_server/README.md
- https://github.com/getzep/graphiti/issues/464
- https://github.com/getzep/graphiti/issues/868
- https://deepwiki.com/getzep/graphiti/5.2-mcp-server
- https://glama.ai/mcp/servers/@lanru/graphiti-mcp-pro
