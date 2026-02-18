# Memory: n8n + Jarvis Integration Research
**Date**: 2026-02-17
**Topic**: n8n self-hosted setup, MCP integration, and Jarvis agent integration patterns

## Key Facts Discovered

### MCP Servers for n8n
- **czlonkowski/n8n-mcp**: Primary recommendation. 12.6K stars. 1,084 nodes documented. Install via `npx n8n-mcp`. Requires `N8N_API_URL` + `N8N_API_KEY` for workflow management. Without credentials: docs/validation only.
- **spences10/mcp-n8n-builder**: Full CRUD + activation/deactivation. Install via `npx -y mcp-n8n-builder`. Requires `N8N_HOST` + `N8N_API_KEY`.
- **czlonkowski/n8n-skills**: 7 companion skills for Claude Code (expressions, patterns, validation, JS, Python).

### Docker Setup
- Official AI Starter Kit: `github.com/n8n-io/self-hosted-ai-starter-kit`
- Includes: n8n + PostgreSQL + Qdrant + Ollama
- For Apple Silicon: use `--profile cpu` (Ollama runs natively outside Docker for GPU accel)
- Key ports: 5678 (n8n), 11434 (Ollama), 6333 (Qdrant)
- n8n 2.0 released Dec 2025 — breaking change: task runners now separate `n8nio/runners` image

### Version Strategy
- Pin version in production: `n8nio/n8n:1.73.1` (do NOT use `:latest`)
- n8n 2.0 is current as of early 2026

### Local LLM Integration
- Ollama: connect via `http://host.docker.internal:11434` from Docker
- mlx-lm: exposes OpenAI-compatible endpoint at `http://localhost:8080/v1`
- n8n OpenAI-compatible node works with mlx-lm by changing base URL

### API Key for n8n REST API
- Settings > n8n API > Create API Key in UI
- Header: `X-N8N-API-KEY: <key>`
- Endpoints: `/api/v1/workflows`, `/api/v1/executions`, etc.

### Webhook Pattern
- Production URL: `http://n8n-host:5678/webhook/<path>`
- Test URL: `http://n8n-host:5678/webhook-test/<path>`
- Max payload: 16MB (configurable via `N8N_PAYLOAD_SIZE_MAX`)
- Supports: auth headers, IP whitelisting, response modes

### Trusted Sources
- Official docs: docs.n8n.io
- n8n-mcp: github.com/czlonkowski/n8n-mcp
- AI starter kit: github.com/n8n-io/self-hosted-ai-starter-kit
- n8n templates: n8n.io/workflows (8,324+ templates)
