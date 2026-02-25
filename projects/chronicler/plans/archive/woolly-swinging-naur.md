# Chronicler Database Explorer — Implementation Plan

## Context

The Chronicler Gap Closure plan is complete — 35 PostgreSQL tables with composite PKs, 131 tests, enriched storyteller. Before building the narrative engine and Knowledge Horizon (dynamic masking), we need **exploratory tools** to browse the database schema, inspect data, and visualize entity relationships. This explorer will also serve as the design workbench for tier-propagation logic in the masking system.

**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Scope

Add a new **Explorer** page to the existing Chronicler web app with three tabs:

1. **Schema Browser** — table list with row counts, column metadata, FK relationships
2. **Data Browser** — paginated table viewer with sorting, filtering, FK navigation, JSONB expansion, SQL runner
3. **Entity Graph** — vis.js ego-network visualization of HFs, entities, and sites

Also add **shared top navigation** across all three pages (Chat, Explorer, Monitoring).

---

## Phase 1: Navigation + Schema Browser

### 1.1 Shared nav partial

**Create** `chronicler/api/templates/partials/_nav.html`

Top nav bar with three links: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`). Active page highlighted in amber. Uses Jinja2 variable `active` set by each template.

### 1.2 Modify existing templates

**`index.html`** (line 44): Change body from `flex` to `flex flex-col h-screen`. Add `{% include "partials/_nav.html" %}` before the sidebar. Wrap sidebar+main in a `<div class="flex flex-1 overflow-hidden">`.

**`monitoring.html`** (lines 41-47): Replace the `<header>` block with `{% include "partials/_nav.html" %}`.

Both templates: Add `{% set active = "chat" %}` / `{% set active = "monitoring" %}` before the include.

### 1.3 Register explorer in app.py

**Modify** `chronicler/api/app.py`:
- Import and include `explorer_router` with `/api` prefix
- Add `GET /explorer` page route rendering `explorer.html`
- Add `active` context variable to existing `/` and `/monitoring` routes

### 1.4 Explorer API endpoints (schema)

**Create** `chronicler/api/routes/explorer.py`

| Endpoint | Returns |
|----------|---------|
| `GET /api/explorer/tables` | All tables with row counts (use `pg_stat_user_tables.n_live_tup` for speed, exact count on detail view) |
| `GET /api/explorer/tables/{name}` | Columns, types, PKs, FKs (outgoing + incoming), indexes |

Table names validated against regex `^[a-z_][a-z0-9_]*$` + existence check in `information_schema.tables`.

### 1.5 Explorer template (schema tab)

**Create** `chronicler/api/templates/explorer.html`

- Same Tailwind config/theme as other pages
- Three-tab internal nav: Schema / Data / Graph (JS tab switching)
- Schema tab: two-column layout — table list (left, 280px) + detail panel (right)
- Table list: clickable items showing `table_name (row_count)`, grouped by category (Legends, Geography, Live, Monitoring)
- Detail panel: columns table, PK badge, FK links (clickable → navigate to target table), incoming FKs, indexes

### Phase 1 files

| Action | File |
|--------|------|
| Create | `chronicler/api/templates/partials/_nav.html` |
| Create | `chronicler/api/routes/explorer.py` |
| Create | `chronicler/api/templates/explorer.html` |
| Modify | `chronicler/api/app.py` |
| Modify | `chronicler/api/templates/index.html` |
| Modify | `chronicler/api/templates/monitoring.html` |

---

## Phase 2: Data Browser

### 2.1 Data API endpoints

Add to `chronicler/api/routes/explorer.py`:

| Endpoint | Returns |
|----------|---------|
| `GET /api/explorer/tables/{name}/data?page=1&limit=25&sort=&order=asc&filter=` | Paginated rows with column metadata |
| `POST /api/explorer/query` | Read-only SQL results (SELECT/WITH only, `conn.transaction(readonly=True)`, max 500 rows) |

Row serialization helper `_serialize_row()` converts asyncpg types (datetime, Decimal, bytes) to JSON-safe values.

### 2.2 Data Browser UI

In `explorer.html` panel-data:

- **Table selector** dropdown (reuses table list from schema tab)
- **Filter bar**: text search across text columns + sort column dropdown + asc/desc toggle
- **Data grid**: HTML table with:
  - Clickable column headers (sort)
  - FK values as clickable links (navigate to referenced row, carrying world_id for composite PKs)
  - JSONB columns as collapsible `<details>` with formatted JSON
  - Booleans as colored indicators, NULLs as gray italic
  - Long text truncated with expand-on-click
- **Pagination**: Previous/Next, page X of Y, rows-per-page selector (25/50/100)
- **SQL Runner**: collapsible textarea + Run button + results grid + row limit selector + execution time

### 2.3 Safety

- SQL runner: keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE) as defense-in-depth
- Primary defense: `conn.transaction(readonly=True)` — asyncpg rejects writes even if keyword filter is bypassed
- Wrapped query with enforced LIMIT cap
- All dynamic table/column names validated against information_schema before interpolation

### Phase 2 files

| Action | File |
|--------|------|
| Modify | `chronicler/api/routes/explorer.py` (add 2 endpoints + helper) |
| Modify | `chronicler/api/templates/explorer.html` (populate data tab) |

---

## Phase 3: Entity Graph

### 3.1 Graph API endpoints

Add to `chronicler/api/routes/explorer.py`:

| Endpoint | Returns |
|----------|---------|
| `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=1` | Ego network: HF center + HF/entity/site links |
| `GET /api/explorer/graph/entity/{world_id}/{entity_id}?depth=1` | Entity center + member HFs |
| `GET /api/explorer/graph/site/{world_id}/{site_id}?depth=1` | Site center + linked HFs |
| `GET /api/explorer/graph/search?q=&world_id=` | Typeahead search across HFs, entities, sites |

**Graph query pattern**: BFS from center node, depth 1-3 (clamped). Each hop:
1. Fetch frontier HF details from `historical_figures`
2. Fetch HF→HF edges from `hf_links` (bidirectional)
3. Fetch HF→Entity edges from `hf_entity_links` (with `position_name`)
4. Fetch HF→Site edges from `hf_site_links`
5. Build next frontier from discovered HF IDs not yet visited

All entity/site detail fetches batched with `ANY($1::int[])` — no per-node queries.

**Return format** (vis.js DataSet-compatible):
```json
{
  "nodes": [{"id": "hf-123", "label": "Urist", "shape": "dot", "color": {...}, ...}],
  "edges": [{"from": "hf-123", "to": "hf-456", "label": "spouse", "color": "#f472b6"}]
}
```

### 3.2 Node styling

| Type | Shape | Color |
|------|-------|-------|
| HF (default) | dot | stone (#78716c) |
| HF (deity) | dot | gold (#f6b93b) |
| HF (vampire) | dot | red (#ef4444) |
| HF (necromancer) | dot | purple (#a855f7) |
| HF (werebeast) | dot | orange (#f97316) |
| HF (ghost) | dot | slate (#94a3b8) |
| Entity (civilization) | diamond | blue (#3b82f6) |
| Entity (religion) | diamond | purple (#a855f7) |
| Site | square | green (#22c55e) |

Edge colors: family=green, spouse=pink, enemy=red, membership=blue (dashed), site link=lime (dashed).

### 3.3 Graph UI

In `explorer.html` panel-graph:

- **World selector** dropdown
- **Search box** with typeahead → `/api/explorer/graph/search` → results as `Name (type)`
- **Depth selector**: 1-hop / 2-hop / 3-hop radio buttons
- **vis.js canvas**: full remaining height, dark background, forceAtlas2Based physics
- **Node info panel**: overlay on click showing entity details + "Expand" button
- **Click-to-expand**: adds the clicked node's 1-hop connections to the existing graph (incremental)
- **Legend**: node shapes and colors
- **Performance guard**: node count badge, warning at 500+ nodes, refuse expansion at 1000+

**vis.js**: CDN at `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js` (no build step)

### Phase 3 files

| Action | File |
|--------|------|
| Modify | `chronicler/api/routes/explorer.py` (add 4 endpoints + node helpers) |
| Modify | `chronicler/api/templates/explorer.html` (populate graph tab, add vis.js CDN) |

---

## Verification

After each phase, verify with `chronicler serve --reload`:

**Phase 1**:
- Nav bar visible on all 3 pages (Chat, Explorer, Monitoring)
- Active page highlighted
- Schema tab: table list loads with row counts, clicking table shows columns/PKs/FKs
- FK links navigate between tables

**Phase 2**:
- Data tab: select `historical_figures`, verify pagination through 60K+ rows
- Sort by `kill_count` DESC, see top killers
- Filter by name, verify results update
- Click an FK value (e.g., `entity_id`), verify navigation to `entities` table
- SQL runner: `SELECT name, kill_count FROM historical_figures WHERE kill_count > 100 ORDER BY kill_count DESC`
- Verify write queries are rejected

**Phase 3**:
- Graph tab: search for "Urist" or any known figure
- 1-hop graph renders with family/entity/site connections
- 2-hop expands to connected figures
- Click a node → info panel shows details
- Expand button adds connections incrementally
- Performance: 2-hop graph stays under 500 nodes for most figures

---

*Plan created 2026-02-22, Session 32*
