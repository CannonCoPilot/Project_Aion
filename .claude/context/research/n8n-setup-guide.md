# n8n M5 Setup Guide

**Status**: Pending — requires API key creation through web UI
**Container**: `jarvis-n8n` running at `localhost:5678`
**Health**: Confirmed (HTTP 200 on /healthz)

## Prerequisites (User Action Required)

1. **Create API Key**:
   - Open `http://localhost:5678` in browser
   - Navigate to Settings > n8n API
   - Click "Create API Key"
   - Save key to `.claude/secrets/credentials.yaml` under:
     ```yaml
     n8n:
       api_key: "n8n_api_XXXXXXXXXXXXXXXX"
       url: "http://localhost:5678"
     ```

2. **Register n8n MCP** (after API key is available):
   ```bash
   # Add to .mcp.json:
   npx n8n-mcp
   # Requires: N8N_API_URL=http://localhost:5678 N8N_API_KEY=<key>
   ```

## Planned Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| Session Summary Ingest | Webhook (from /end-session) | Send session summary to Qdrant via RAG service |
| Scheduled RAG Re-index | Cron (daily 3am) | Re-index changed files in codebase collection |
| Weekly Cost Report | Cron (Monday 8am) | Run `ccusage monthly --json`, format, save to reports/ |
| Health Check | Cron (hourly) | Check Docker containers, Qdrant, Neo4j, Ollama |

## Next Steps

Once API key is created, Jarvis can:
1. Register n8n MCP for workflow CRUD
2. Import/create workflows via API
3. Wire session hooks to trigger workflows via webhook

---

*Created 2026-02-19 — Session 28b Phase 5 (deferred: requires user interaction)*
