# Phase 7: Polish & Production -- PRD/Roadmap

**Version**: 1.0
**Date**: 2026-02-25
**Phase Duration**: 2-3 weeks
**Milestone**: M7 -- Release
**Entry State**: All functional components built, varying quality/performance levels
**Exit State**: Performance optimized, fully tested, packaged, documented, production-ready

**Parent Document**: Full Project Roadmap (full-project-roadmap.md)
**Dependencies**: All prior phases (Phase 1-6)
**Requirements Covered**: REQ-NFR-001 through NFR-010

---

## 1. Phase Overview

Phase 7 is the final polishing pass before the Chronicler v1.0 release. It covers four areas: performance optimization, comprehensive testing, packaging/deployment, and documentation. Unlike Phases 1-6 which build features, Phase 7 refines and hardens what already exists.

---

## 2. Stage 7.1: Performance Optimization

**Duration**: 1 week
**Deliverables**: SQL index optimization, query profiling, caching, UI optimization

### 2.1 SQL Index Optimization

**Requirement**: REQ-NFR-002
**Priority**: P1

**Analysis approach**:
1. Run `EXPLAIN ANALYZE` on all heavy queries from entity detail pages
2. Identify sequential scans on large tables
3. Add targeted indexes based on actual query patterns

**Expected indexes**:
```sql
-- Event lookups (most common heavy query)
CREATE INDEX idx_events_year ON history_events(world_id, year);
CREATE INDEX idx_events_type ON history_events(world_id, type);
CREATE INDEX idx_events_details_hfid ON history_events(world_id, (details->>'hfid'));
CREATE INDEX idx_events_details_site ON history_events(world_id, (details->>'site_id'));

-- Cross-reference index (used by every detail page)
CREATE INDEX idx_xref_entity_type_id ON event_entity_xref(world_id, entity_type, entity_id);
CREATE INDEX idx_xref_event ON event_entity_xref(world_id, event_id);

-- HF lookups
CREATE INDEX idx_hf_name ON historical_figures(world_id, name);
CREATE INDEX idx_hf_importance ON historical_figures(world_id, importance_score DESC);
CREATE INDEX idx_hf_race ON historical_figures(world_id, race);

-- Site lookups
CREATE INDEX idx_sites_owner ON sites(world_id, owner_entity_id);
CREATE INDEX idx_sites_type ON sites(world_id, type);

-- Link table lookups
CREATE INDEX idx_hf_links_source ON hf_links(world_id, source_hf_id);
CREATE INDEX idx_hf_links_target ON hf_links(world_id, target_hf_id);
CREATE INDEX idx_hf_entity_links_hf ON hf_entity_links(world_id, hf_id);
CREATE INDEX idx_hf_entity_links_entity ON hf_entity_links(world_id, entity_id);
CREATE INDEX idx_hf_site_links_hf ON hf_site_links(world_id, hf_id);

-- Search (full-text)
CREATE INDEX idx_hf_unaccent_name ON historical_figures(world_id, unaccent(name));
CREATE INDEX idx_sites_unaccent_name ON sites(world_id, unaccent(name));
CREATE INDEX idx_entities_unaccent_name ON entities(world_id, unaccent(name));

-- Knowledge Horizon
CREATE INDEX idx_kh_lookup ON knowledge_horizon(world_id, entity_type, entity_id, visible);
```

**Materialized views** (for expensive aggregations):
```sql
-- Event counts per entity (used by importance scores and detail pages)
CREATE MATERIALIZED VIEW mv_entity_event_counts AS
SELECT world_id, entity_type, entity_id, COUNT(*) as event_count
FROM event_entity_xref
GROUP BY world_id, entity_type, entity_id;

CREATE UNIQUE INDEX idx_mv_event_counts ON mv_entity_event_counts(world_id, entity_type, entity_id);

-- Refresh after ingestion
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_entity_event_counts;
```

### 2.2 Query Performance Profiling

**Requirement**: REQ-NFR-002
**Priority**: P1

**Target latencies**:
| Query Type | Target | Acceptable |
|-----------|--------|------------|
| Paginated data grid (25 rows) | < 200ms | < 500ms |
| Entity detail page (main data) | < 500ms | < 2s |
| Entity events (paginated 50) | < 300ms | < 1s |
| Global search | < 150ms | < 300ms |
| Map data (all sites) | < 500ms | < 2s |
| Family tree (3-gen) | < 300ms | < 1s |
| Importance score recompute | < 30s | < 60s |

**Profiling tool**: Add query timing middleware to FastAPI:
```python
@app.middleware("http")
async def add_query_timing(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    response.headers["X-Query-Time"] = f"{duration:.3f}s"
    if duration > 2.0:
        logger.warning(f"Slow query: {request.url} took {duration:.3f}s")
    return response
```

### 2.3 Map Image Caching

**Caching strategy**:
- World map images cached in `data/map_cache/` with `{world_id}_{tile_size}.png` naming
- Cache invalidated on re-ingestion
- Mini-maps cached per entity: `data/map_cache/mini_{world_id}_{type}_{id}.png`
- Cache-Control headers: `max-age=86400` (24 hours) for map images

### 2.4 Graph Rendering Optimization

**Requirement**: REQ-NFR-003
**Priority**: P2

- Progressive loading for graphs with > 100 nodes
- WebWorker for physics calculation (vis.js and Cytoscape.js support this)
- Warning modal at 500+ nodes: "This graph is large. Rendering may be slow."
- Hard limit at 1,000 nodes: "Too many nodes. Please narrow your query."

### 2.5 Storyteller Latency Optimization

**Target**: First token in < 3s for keyword mode, < 5s for agentic mode.

**Optimizations**:
- Pre-compute and cache schema summary per world
- Pre-compute denizen summary (update on watcher cycle, not per query)
- Connection pooling for LLM client
- Prompt compression: remove redundant context when possible

---

## 3. Stage 7.2: Testing

**Duration**: 1 week
**Deliverables**: Expanded test suite covering all new components

### 3.1 Test Coverage Targets

| Component | Target Tests | Current Tests | Gap |
|-----------|-------------|---------------|-----|
| XML Parser (all sections) | 30 | 15 | 15 |
| Post-Parse Pipeline | 15 | 0 | 15 |
| Entity Detail APIs | 20 | 0 | 20 |
| Search APIs | 5 | 2 | 3 |
| Event Templates | 20 | 0 | 20 |
| Death Cause Renderer | 10 | 0 | 10 |
| Agentic Storyteller | 10 | 5 | 5 |
| Knowledge Horizon | 15 | 0 | 15 |
| Mod Manager | 10 | 0 | 10 |
| Labor Manager | 10 | 0 | 10 |
| Fortress Advisor | 5 | 0 | 5 |
| **Total** | **~150** | **~22** | **~128** |

### 3.2 Test Categories

**Unit tests** (fastest, most numerous):
- XML parser section tests (mock XML -> verify DB records)
- Post-parse processing step tests (known input -> expected output)
- Event template rendering tests (event dict -> expected HTML)
- Death cause rendering tests (enum -> expected text)
- Calendar utility tests (seconds72 -> expected date)
- Importance score formula tests
- Conflict detection tests (mod lists -> expected conflicts)

**Integration tests**:
- Full XML ingestion pipeline (parse + post-parse + verify)
- Storyteller keyword routing (query -> expected route)
- Storyteller agentic mode (query -> SQL validation -> response)
- Knowledge Horizon initialization + expansion + query filtering
- Bridge data consumption (JSON -> DB records)

**API tests** (via pytest + httpx):
- All entity detail API endpoints (valid ID, invalid ID, missing world)
- Search API (various terms, accent-insensitive, empty results)
- Map API (image generation, mini-map, layer data)
- Export API (CSV, JSON)
- Mod manager CLI commands

**E2E tests** (optional, via Playwright or similar):
- Explorer navigation flow (list -> detail -> event -> related entity)
- Search -> result click -> detail page
- Map interaction (zoom, pan, layer toggle, site click)
- Storyteller chat (query -> streaming response)

### 3.3 Load Testing

**Requirement**: REQ-NFR-002
**Priority**: P2

Test with large worlds (500K+ events):
- Entity detail page response times under load
- Search performance with concurrent users
- Map rendering with 2,000+ sites
- Storyteller latency under concurrent queries

**Tool**: Use `locust` or `ab` for load testing.

### 3.4 Knowledge Horizon Testing

**Specific KH test scenarios**:
1. Initialize KH -> verify only denizens visible
2. Expand individual scope -> verify family members visible
3. Expand geographic scope -> verify nearby sites visible
4. Process war event -> verify enemy civ revealed
5. Query visible_* views -> verify filtering correct
6. Toggle KH off -> verify all data visible
7. Verify LLM system prompt includes KH advisory

---

## 4. Stage 7.3: Packaging and Deployment

**Duration**: 0.5 weeks
**Deliverables**: Python package, Docker container, deployment scripts

### 4.1 Python Package Configuration

```toml
# pyproject.toml (existing, enhance)
[project]
name = "chronicler"
version = "1.0.0"
description = "Dwarf Fortress living record and AI storyteller"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "sqlalchemy>=2.0",
    "psycopg2-binary>=2.9",
    "lxml>=5.0",
    "jinja2>=3.1",
    "sse-starlette>=2.0",
    "pillow>=10.0",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "httpx>=0.27", "ruff>=0.4"]
llm = ["litellm>=1.40", "openai>=1.30"]

[project.scripts]
chronicler = "chronicler.cli:main"
```

### 4.2 Docker Containerization

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python package
COPY . /app
RUN pip install -e ".[llm]"

# Expose ports
EXPOSE 8000  # FastAPI
EXPOSE 8889  # Bridge HTTP proxy

# Run
CMD ["uvicorn", "chronicler.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml addition for Chronicler
services:
  chronicler:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://chronicler:chronicler@postgres:5432/chronicler
      - LLM_API_BASE=http://litellm:4000
    depends_on:
      - postgres
```

### 4.3 VM Deployment Scripts

Enhance existing `vm-lifecycle.sh` with:
- `deploy-bridge`: Push latest `chronicler-bridge.lua` + `worldgen-bridge.lua` to VM
- `deploy-mods`: Push mod manager configuration to VM
- `start-all`: Start bridge, watcher, and HTTP server in sequence

### 4.4 Configuration Management

```yaml
# chronicler-config.yaml
database:
  url: postgresql://chronicler:chronicler@localhost:5432/chronicler

dfhack:
  host: 192.168.64.3
  ssh_key: ~/.ssh/df-vm
  df_install: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\"

storyteller:
  mode: agentic  # keyword, agentic, hybrid
  model: qwen3-8b
  temperature: 0.7
  max_sql_rounds: 5
  context_budget: 12000

watcher:
  poll_interval: 100  # ticks
  bridge_timeout: 30  # seconds

knowledge_horizon:
  enabled: true
  default_mode: enabled  # enabled, disabled

labor_manager:
  poll_interval: 500  # ticks

advisor:
  mode: advisor  # advisor, autonomous
```

---

## 5. Stage 7.4: Documentation

**Duration**: 0.5 weeks
**Deliverables**: API docs, schema docs, user guide, developer guide

### 5.1 API Documentation

Document all API endpoints with:
- URL pattern and HTTP method
- Query parameters and types
- Request/response JSON schemas
- Example requests and responses
- Error codes

**Tool**: Auto-generate from FastAPI's OpenAPI schema (`/docs` and `/redoc` built-in).

### 5.2 CDM Schema Documentation

Complete documentation of all 40+ tables:
- Table name and purpose
- Column names, types, constraints
- FK relationships
- JSONB column key inventories
- Indexes
- Example queries

### 5.3 User Guide

- **Getting Started**: Installation, configuration, first world ingestion
- **Explorer**: How to browse entities, use search, navigate detail pages
- **Storyteller**: How to ask questions, use agentic mode, understand confidence
- **Map**: How to use the world map, toggle layers, search locations
- **Labor Manager**: How to view citizens, toggle labors, monitor stress
- **Mod Manager**: How to discover mods, create profiles, check conflicts
- **Knowledge Horizon**: What it is, how to toggle, what affects visibility

### 5.4 Developer Guide

- **Architecture**: Component hierarchy, data flow, technology stack
- **Contributing**: Code style, testing, PR process
- **Extending**: How to add new entity types, event templates, map layers
- **DFHack Integration**: Bridge protocol, Lua scripting patterns, gotchas

---

## 6. Definition of Done (M7 Milestone / v1.0 Release)

### Performance
- [ ] All indexes created and verified
- [ ] Paginated queries < 500ms
- [ ] Entity detail pages < 2s
- [ ] Search < 300ms
- [ ] Map data < 2s
- [ ] Storyteller TTFT < 5s (agentic)
- [ ] Graph rendering guards in place
- [ ] Materialized views for expensive aggregations
- [ ] Map image caching functional

### Testing
- [ ] 150+ tests total
- [ ] All tests passing
- [ ] Integration tests for all major flows
- [ ] Load testing with large world data
- [ ] KH-specific test scenarios

### Packaging
- [ ] pyproject.toml complete with all dependencies
- [ ] `chronicler` CLI works from installed package
- [ ] Docker container builds and runs
- [ ] VM deployment scripts updated
- [ ] Configuration file documented

### Documentation
- [ ] API documentation (auto-generated + annotated)
- [ ] CDM schema documentation (40+ tables)
- [ ] User guide (7 sections)
- [ ] Developer guide (4 sections)

---

## 7. Post-v1.0 Roadmap Items (Future)

These items are explicitly deferred beyond Phase 7 and v1.0 release:

| Item | Priority | Notes |
|------|----------|-------|
| Steam Workshop mod integration | P4 | Requires Steam API access |
| Full raw compiler (EDIT/SELECT/CUT) | P4 | Complex; mod manager works without it |
| Labor optimization engine | P4 | Constraint satisfaction solver |
| AI-powered labor advisor | P4 | LLM + personality + skills |
| Construction planning (22 room types) | P4 | df-ai feature adaptation |
| Trade cycle management | P4 | 9-step automated process |
| Embark site evaluation | P4 | Novel feature |
| Random embark with auto-restart | P4 | df-ai feature adaptation |
| In-game data curve widget | P4 | CurveWidget.lua pattern |
| Static site generation (BFS) | P4 | weblegends-style export |
| Visual query builder (drag-and-drop) | P4 | Complex UI |
| Proactive narrative engine | P4 | WebSocket push alerts |
| pgvector in-database semantic search | P3 | Complement to Qdrant |
| DF Wiki RAG integration (21K+ points) | P3 | Web crawl + indexing |
| KH Phase 4: Full 7-caveat system | P3 | CAV-003 through CAV-005 |
| Adventure mode support | P4 | Different data access patterns |
| Multi-fortress support | P4 | Multiple simultaneous fortresses |

---

*Phase 7: Polish & Production PRD/Roadmap v1.0 -- 2026-02-25*
*4 Stages, 25+ Tasks, 2-3 Weeks Estimated*
