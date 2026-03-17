# Performance & Scalability Review — Chronicler

**Date**: 2026-03-10
**Reviewer**: Jarvis Code Review Agent (Opus 4.6)
**Scope**: Chronicler codebase at `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Current dataset**: ~1.68M records, world "Tar Thran" (250 years, post-embark)
**Score**: 5/10

---

## Executive Summary

Chronicler has significant performance issues that are manageable at current scale (~1.68M records) but will become blocking at Phase 3+ scale. The three most impactful issues are: (1) zero secondary indexes in the schema — every query that isn't a PK lookup does a sequential scan; (2) N+1 query patterns in event rendering (up to 7,500 sequential DB queries per detail page); and (3) sequential execution of independent queries where `asyncio.gather()` could parallelize them. The ingestion pipeline is reasonably efficient with batch inserts, but the explorer web layer was built for correctness over performance.

---

## Methodology

1. Review of `chronicler/db/schema.sql` for index analysis
2. Review of all query patterns in `chronicler/explorer/` modules
3. Review of event rendering pipeline for N+1 patterns
4. Review of ingestion pipeline for batch efficiency
5. Static analysis of async patterns (sequential vs parallel)

---

## Findings

### PERF-001 — Zero Secondary Indexes [CRITICAL]

**File**: `chronicler/db/schema.sql`

The schema defines only PRIMARY KEY and UNIQUE constraints. Zero `CREATE INDEX` statements exist. Critical missing indexes:

| Query Pattern | Table | Row Count | Impact |
|---|---|---|---|
| `details->>'hfid' = $2` (18 OR conditions) | `historical_events` | 500K+ | Full scan per HF detail page |
| `event_type = $1` | `historical_events` | 500K+ | Full scan for event filtering |
| `race ILIKE $1` | `historical_figures` | 30K+ | Full scan for search |
| `name ILIKE $1` | All entity tables | Various | Full scan for search/autocomplete |
| `death_year = -1 OR IS NULL` | `historical_figures` | 30K+ | Full scan for alive/dead counts |
| `link_type IN (...)` | `hf_site_links` | 50K+ | Full scan for denizen queries |
| `entity_id = $1` | `hf_entity_links` | 100K+ | Full scan for member queries |

**Fix**: Add targeted indexes. At minimum:
```sql
CREATE INDEX idx_he_event_type ON historical_events (world_id, event_type);
CREATE INDEX idx_he_year ON historical_events (world_id, year);
CREATE INDEX idx_hf_race ON historical_figures (world_id, race);
CREATE INDEX idx_hf_death_year ON historical_figures (world_id, death_year);
CREATE INDEX idx_hsl_site_link ON hf_site_links (world_id, site_id, link_type);
CREATE INDEX idx_hel_entity ON hf_entity_links (world_id, entity_id, link_type);
CREATE INDEX idx_he_details_gin ON historical_events USING gin (details jsonb_path_ops);
```

The GIN index alone would transform every detail page event query from sequential scan to index scan.

---

### PERF-002 — N+1 Event Rendering (Up to 7,500 Sequential Queries) [CRITICAL]

**File**: `chronicler/explorer/event_rendering.py`

Event rendering loop processes events sequentially:
```python
for event in events:
    rendered = await render_event(pool, event, world_id, resolver)
```

Each `render_event` may issue 5-15 DB queries for entity resolution. With LIMIT 500 on detail pages, this produces 2,500-7,500 sequential DB queries per page load. The `EntityResolver` cache mitigates repeated lookups but doesn't help with unique entities.

**Fix**:
1. Pre-scan all events to collect referenced entity IDs by type
2. Batch-resolve all IDs in a single query per type (`WHERE id = ANY($2)`)
3. Populate resolver cache before rendering loop

---

### PERF-003 — N+1 Family Link Resolution [CRITICAL]

**File**: `chronicler/explorer/detail_pages.py:67-78`

Family links resolved with individual DB queries in a loop:
```python
for link in links:
    target = await pool.fetchrow("SELECT ... WHERE id = $2", world_id, link['target_id'])
```

A figure with 10 family links fires 10 extra queries.

**Fix**: Collect all target_ids, batch-fetch with `WHERE id = ANY($2)`.

---

### PERF-004 — Sequential Independent Queries in Detail Pages [HIGH]

**File**: `chronicler/explorer/detail_pages.py`

`figure_detail` issues 8 independent queries sequentially (links, skills, entity_links, site_links, position_links, spheres, goals, events). No data dependencies — can all run in parallel.

**Affected**: `figure_detail`, `site_detail`, `civilization_detail` (10+ sequential queries each).

**Fix**: `asyncio.gather()` for all independent queries. With pool of 10 connections, reduces latency 4-6x.

---

### PERF-005 — Sequential Search Queries [HIGH]

**File**: `chronicler/explorer/search.py`

Global search issues 6 sequential ILIKE queries (figures, sites, entities, regions, artifacts, written_contents). Autocomplete issues 4.

**Fix**: `asyncio.gather()` all search queries.

---

### PERF-006 — Redundant Population Counts [HIGH]

**File**: `chronicler/explorer/population.py:22-34`

Three separate `COUNT(*)` queries for total, alive, dead when one query with `FILTER` suffices:
```sql
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE death_year = -1 OR death_year IS NULL) as alive,
       COUNT(*) FILTER (WHERE death_year > -1) as dead
FROM historical_figures WHERE world_id = $1
```

Plus 6 more sequential queries on same page — all independent, all should use `asyncio.gather()`.

---

### PERF-007 — Correlated Subqueries in Sites List [HIGH]

**File**: `chronicler/explorer/filters.py:143-171`

Sites list includes two correlated subqueries per row (structure_count, denizen_count). For 50 sites/page = 100 correlated subqueries, each doing sequential scans without indexes.

**Fix**: Use `LEFT JOIN ... GROUP BY` or CTE.

---

### PERF-008 — Dashboard Sequential Table Counts [HIGH]

**File**: `chronicler/explorer/dashboard.py:30-42`

Counts 9 tables sequentially. Use `UNION ALL` or `asyncio.gather()`.

---

### PERF-009 — Monitoring Sequential Counts (66 Queries) [HIGH]

**File**: `chronicler/explorer/monitoring.py:43-60`

Sequential `COUNT(*)` + `pg_total_relation_size()` for 33 tables = 66 queries.

**Fix**: Single query with `UNION ALL` or `asyncio.gather()`.

---

### PERF-010 — Unbounded Export (Memory Risk) [MEDIUM]

**File**: `chronicler/explorer/export.py:67-70`

Export queries have no LIMIT. For `historical_events` (500K+ rows with JSONB details), loads entire result into memory. Could reach hundreds of MB.

**Fix**: Use streaming response with cursor or chunked fetching.

---

### PERF-011 — Entity Resolver Cache Per-Request [MEDIUM]

**File**: `chronicler/explorer/event_rendering.py`

Entity resolver cache created fresh per request. Repeated visitors to related pages re-resolve the same entities.

**Fix**: Consider LRU cache at application level (TTL-based to handle data changes).

---

### PERF-012 — Full XML DOM In Memory [MEDIUM]

**File**: `chronicler/ingest/xml_parser.py:17-19`

`ET.parse()` loads entire XML DOM. DF exports can reach 200-500 MB for large worlds.

**Fix**: Use `iterparse` with element clearing for streaming processing.

---

### PERF-013 — No Static Asset Cache Headers [LOW]

**File**: `chronicler/explorer/app.py:27-28`

Static files served by aiohttp with no cache headers.

**Fix**: Set `Cache-Control` headers for static assets.

---

### PERF-014 — Unpaginated List Pages [LOW]

**File**: `chronicler/explorer/filters.py:328-333`

`regions_list` and `world_constructions_list` fetch all rows with no pagination. Typically small tables but should paginate for completeness.

---

## Scalability Assessment

### Current Scale (~1.68M records)
Works with noticeable inefficiencies. Sequential scans on 500K events take ~50-200ms each.

### Projected Scale (5-10M records, multiple worlds)
- Event queries: JSONB OR-clause scans → 1-3 seconds each
- Detail pages with N+1 rendering: 30-60 seconds
- Population aggregates: 3-5 seconds
- Export: memory exhaustion for events table

### Recommended Fix Priority

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| 1 | Add indexes (PERF-001) | Highest — transforms all query performance | Low |
| 2 | Batch entity resolution (PERF-002) | Transforms detail page rendering | Medium |
| 3 | `asyncio.gather` (PERF-004-009) | 4-6x latency reduction | Low (mechanical) |
| 4 | Fix N+1 family links (PERF-003) | Per-page improvement | Low |
| 5 | Event-figure junction table (PERF-001 alt) | Long-term scalability | Medium |
| 6 | Stream exports (PERF-010) | Prevents OOM | Medium |

---

## Phase 3 Readiness Assessment

**Verdict: CONDITIONAL PASS**

Phase 3 will increase data volume continuously via live bridge. The current query patterns will degrade rapidly.

### Must-fix before Phase 3:
1. **PERF-001**: Add indexes — live bridge adds events/entities continuously
2. **PERF-002**: Batch event rendering — monitoring dashboard will display live events

### Should-fix:
3. **PERF-004-009**: `asyncio.gather` — reduces page load times from seconds to sub-second
4. **PERF-010**: Stream exports — larger datasets from live data accumulation

### Accept for now:
5. PERF-012 (XML memory) — Phase 3 live data uses JSON bridge, not XML
6. PERF-013-014 — low priority quality improvements
