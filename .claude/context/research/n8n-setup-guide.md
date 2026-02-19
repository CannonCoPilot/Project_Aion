# n8n M5 Setup Guide

**Status**: COMPLETE — M5 delivered (2 workflows active)
**Container**: `jarvis-n8n` running at `localhost:5678`
**Health**: Confirmed (HTTP 200 on /healthz)
**Execution Mode**: `regular` (changed from `queue` — no worker container needed for single-user)

## Credentials

- **API Key**: `.claude/secrets/credentials.yaml` → `.local_n8n.Jarvis_n8n`
- **Postgres Credential** (in n8n): ID `uWm2xENqCgVCjg4O`, name "Jarvis Postgres"
  - Host: `postgres` (Docker-internal), Port: 5432, Database: `jarvis`, User: `jarvis`
- **n8n MCP**: NOT registered (context overhead not justified for static workflows)

## Active Workflows

| ID | Workflow | Trigger | Webhook Path | Status |
|----|----------|---------|-------------|--------|
| `Tj70JeRfngyAkH5N` | Session Summary Ingest | Webhook POST | `/webhook/jarvis/session-complete` | Active |
| `wTLsa71OChm0jNsa` | Hourly Health Check | Cron (hourly) | N/A (scheduled) | Active |

## Postgres Tables

```sql
-- In 'jarvis' database (not 'n8n' database)
jarvis_sessions (id, session_id, summary, timestamp, cost_usd, context_peak_pct)
jarvis_health_events (id, timestamp, service, status, response_time_ms, error_message)
```

## Integration Points

- **end-session.md Step 7c**: Fires `curl -s -X POST http://localhost:5678/webhook/jarvis/session-complete` with session metadata (5s timeout, non-blocking fallback)
- **Health check**: Checks Qdrant (`jarvis-qdrant:6333`), Neo4j (`jarvis-neo4j:7474`), Ollama (`host.docker.internal:11434`) every hour

## Workflow JSON Backups

Version-controlled at `.claude/context/workflows/n8n/`:
- `session-summary-ingest.json`
- `health-check-cron.json`

To reimport after volume loss:
```bash
N8N_KEY=$(yq -r '.local_n8n.Jarvis_n8n' .claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
curl -s -X POST "http://localhost:5678/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_KEY" -H "Content-Type: application/json" \
  -d @.claude/context/workflows/n8n/session-summary-ingest.json
```

## M5.1 Deferred Workflows

| Workflow | Blocker | Solution Path |
|----------|---------|--------------|
| Scheduled RAG Re-index | n8n can't call jarvis-rag (stdio MCP) | Expose jarvis-rag as HTTP service on host |
| Weekly Cost Report | ccusage runs on host only | Add host volume mount to n8n or host-side webhook receiver |

---

*Updated 2026-02-19 — Session 29 (M5 complete)*
