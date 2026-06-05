---
name: Jarvis
type: application-stack
path: ~/Claude/Jarvis
registered: 2026-04-22
---

# Jarvis

Active application stack — 5 containers currently running on this host: `jarvis-n8n`, `jarvis-postgres`, `jarvis-redis`, `jarvis-qdrant`, `jarvis-neo4j`. All marked critical in paths-registry.yaml.

## Layout

- Compose: `infrastructure/docker-compose.yml`
- Active branch: `Project_Aion`

## Services

| Container | Image | Role |
|-----------|-------|------|
| jarvis-n8n | n8nio/n8n:latest | Workflow automation |
| jarvis-postgres | paradedb/paradedb:latest | Postgres with full-text search |
| jarvis-redis | redis/redis-stack:latest | Cache + Redis Stack modules |
| jarvis-qdrant | qdrant/qdrant:latest | Vector DB |
| jarvis-neo4j | neo4j:latest | Graph DB |

## When to load context

- Working in `~/Claude/Project_Aion/` or its subdirs
- Troubleshooting any `jarvis-*` container
- Questions about n8n workflows, vector/graph queries, or the Project_Aion initiative
