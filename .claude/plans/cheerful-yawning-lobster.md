# M5: n8n Workflow Integration

## Context

n8n is running at localhost:5678 (Docker container `jarvis-n8n`, queue mode with Redis + PostgreSQL, on `jarvis-net` bridge). The API key is verified working. This milestone delivers the first automated workflows — session logging and infrastructure health monitoring — completing the orchestration layer of Jarvis's infrastructure stack.

## Scope: 2 Workflows Now, 2 Deferred

**Delivering now:**
- **Workflow A**: Session Summary Webhook — logs session metadata to Postgres on `/end-session`
- **Workflow B**: Hourly Health Check Cron — HTTP checks against Qdrant, Neo4j, Ollama, Redis

**Deferred to M5.1** (need host volume mount or HTTP shim for jarvis-rag):
- Scheduled RAG Re-index (daily 3am)
- Weekly Cost Report (ccusage runs on host only)

**No n8n-mcp registration** — 42 tool descriptions per session is too much context overhead for 4 static workflows. Curl API calls suffice.

## Implementation Steps

### Step 1: Create Postgres Tables
Use `postgres-mcp` or direct SQL to create `jarvis_sessions` and `jarvis_health_events` tables in the `jarvis` database (not the `n8n` database).

```sql
CREATE TABLE IF NOT EXISTS jarvis_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    summary TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    cost_usd NUMERIC(10,4),
    context_peak_pct REAL
);

CREATE TABLE IF NOT EXISTS jarvis_health_events (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    service TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT
);

CREATE INDEX idx_sessions_ts ON jarvis_sessions(timestamp DESC);
CREATE INDEX idx_health_svc ON jarvis_health_events(service, timestamp DESC);
```

### Step 2: Create Workflow A — Session Summary Webhook
POST to `http://localhost:5678/api/v1/workflows` with workflow JSON:
- Webhook trigger at path `jarvis/session-complete` (POST, respond immediately with 202)
- Postgres Insert node writing to `jarvis_sessions` table
- Use credential ID `uWm2xENqCgVCjg4O` (Jarvis Postgres, already created)
- Activate via `POST /api/v1/workflows/{id}/activate`

### Step 3: Create Workflow B — Hourly Health Check Cron
POST workflow JSON with:
- Schedule Trigger (every hour)
- Parallel HTTP Request nodes checking:
  - `http://jarvis-qdrant:6333/healthz` (Docker-internal)
  - `http://jarvis-neo4j:7474` (Docker-internal)
  - `http://host.docker.internal:11434/api/tags` (Ollama on host)
- Merge results → Postgres Insert to `jarvis_health_events`
- Activate via API

### Step 4: Wire end-session.md Step 7c
**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/commands/end-session.md`

Changes:
1. Add `Bash(curl:*)` to `allowed-tools` frontmatter
2. Insert Step 7c after existing Step 7b:

```bash
curl -s -X POST "http://localhost:5678/webhook/jarvis/session-complete" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"session-NN\",\"summary\":\"...\",\"cost_usd\":$BLOCK_COST}" \
  --max-time 5 || echo "[n8n] Webhook skipped (n8n unreachable)"
```

The `--max-time 5` + `|| echo` ensures end-session never blocks if n8n is down.

### Step 5: Export & Version-Control Workflow JSON
Create `/Users/nathanielcannon/Claude/Jarvis/.claude/context/workflows/n8n/`:
- `session-summary-ingest.json` — exported via GET /api/v1/workflows/{id}
- `health-check-cron.json` — exported via GET /api/v1/workflows/{id}

These serve as backup/reproducibility if the n8n Docker volume is lost.

### Step 6: Update Documentation
- Update `session-state.md` with M5 completion
- Update `n8n-setup-guide.md` with workflow IDs and credential references
- Commit: `feat: M5 n8n workflow integration (session webhook + health cron)`

## Verification

1. **Webhook test**: `curl -X POST http://localhost:5678/webhook/jarvis/session-complete -H "Content-Type: application/json" -d '{"session_id":"test","summary":"test","cost_usd":0}'` → verify row in `jarvis_sessions`
2. **Health cron**: Check n8n execution log at localhost:5678 after 1 hour (or trigger manually)
3. **End-to-end**: Run `/end-session` dry-run of Step 7c curl call

## Files Modified

| File | Change |
|------|--------|
| `.claude/commands/end-session.md` | Add `Bash(curl:*)` to allowed-tools, add Step 7c |
| `.claude/context/workflows/n8n/*.json` | NEW — exported workflow definitions |
| `.claude/context/research/n8n-setup-guide.md` | Update status + workflow IDs |
| `.claude/context/session-state.md` | M5 completion |

## Key Design Decisions

- **No n8n-mcp**: Context overhead not justified for 4 static workflows
- **Credentials via API**: Postgres credential `uWm2xENqCgVCjg4O` already created programmatically — no browser needed
- **Docker networking**: n8n reaches other containers by name (`jarvis-qdrant`, `jarvis-neo4j`) on `jarvis-net`; reaches host via `host.docker.internal`
- **Webhook over Stop hook**: Session summary is composed during end-session, not available at Stop hook time
- **5s timeout on webhook**: n8n is not in the critical path of session exit
