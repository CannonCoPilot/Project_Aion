# Decision: Dev-Space Isolation Scheme

**Date**: 2026-04-22
**Decided by**: CannonCoPilot (user)
**Plan task**: P0-T04

## Decision

**Suffix `-dev` on container names + port offset of +100 from prod.**

## Naming convention

| Prod container | Dev container |
|---------------|---------------|
| `aifred-postgres` | `aifred-dev-postgres` |
| `aifred-pulse` | `aifred-dev-pulse` |
| `aifred-dashboard` | `aifred-dev-dashboard` |
| `aifred-grafana` | `aifred-dev-grafana` |
| `aifred-prometheus` | `aifred-dev-prometheus` |
| `aifred-pushgateway` | `aifred-dev-pushgateway` |
| `jarvis-postgres` | `jarvis-dev-postgres` |
| `jarvis-n8n` | `jarvis-dev-n8n` |
| `jarvis-redis` | `jarvis-dev-redis` |
| `jarvis-qdrant` | `jarvis-dev-qdrant` |
| `jarvis-neo4j` | `jarvis-dev-neo4j` |

## Port mapping (prod → dev, +100)

### AIFred-Pro-Dev

| Service | Prod | Dev |
|---------|:---:|:---:|
| Pulse API | 8700 | **8800** |
| Dashboard | 8600 | **8700**⚠️ |
| Grafana | 3002 | 3102 |
| Prometheus | 9090 | 9190 |
| Pushgateway | 9091 | 9191 |

⚠️ **Collision alert**: prod Pulse is on 8700; dev Dashboard would want 8700 if we strictly +100. **Override**: dev Dashboard uses `8701` (prod port + 101) to avoid this. Document explicitly in P4-T02.

### Jarvis-Dev

| Service | Prod | Dev |
|---------|:---:|:---:|
| Postgres | 5432 | 5532 |
| Redis | 6379 | 6479 |
| RedisInsight | 8001 | 8101 |
| Qdrant HTTP | 6333 | 6433 |
| Qdrant gRPC | 6334 | 6434 |
| Neo4j Browser | 7474 | 7574 |
| Neo4j Bolt | 7687 | 7787 |
| n8n | 5678 | 5778 |

## Volume naming

- Prod uses: `aifred-postgres-data`, `aifred-grafana-data`, `aifred-dashboard-data`, `aifred-prometheus-data`, `infrastructure_postgres_data`, etc.
- Dev uses: `aifred-dev-postgres-data`, `aifred-dev-grafana-data`, `aifred-dev-dashboard-data`, `aifred-dev-prometheus-data`, `infrastructure_dev_postgres_data`, etc.

## Network naming

- Prod: `aifred-network`, `caddy-network`, `jarvis-net`
- Dev: `aifred-dev-network`, `jarvis-dev-net`
- Dev does NOT join `caddy-network` (dev bypasses Caddy/SSO for local access)

## Compose project name

- Prod: `aifred-pro` (default from directory)
- Dev: `--project-name=aifred-pro-dev` explicit flag
- Jarvis prod: `infrastructure` (legacy)
- Jarvis-Dev: `--project-name=jarvis-dev` explicit

## Rationale

- +100 offset is large enough to be unambiguous while fitting in the same port category (80xx for app ports)
- Suffix approach preserves original name readability; sort order groups prod/dev together
- Explicit `--project-name` flag ensures Docker doesn't mix environments

## Implications

- P4-T02 compose overlay enumerates every service with its +100 port
- P5-T03 mirrors this pattern for Jarvis-Dev
- All smoke tests (P6-T01) must validate NO port overlap between prod/dev
