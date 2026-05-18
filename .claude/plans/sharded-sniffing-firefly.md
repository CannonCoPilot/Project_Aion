# Jarvis Memory Dashboard Visualization Upgrade

## Context

The Memory System (JICM + Watcher + autonomic functions) is now fully implemented (Phase 2C complete). The jarvis-memory dashboard page currently shows real-time state as text/gauges with zero charts. The usage page demonstrates sophisticated Recharts visualizations (ComposedChart, dual axes, reference lines, rolling averages). This plan adds 5 visualization features to make the Memory System's behavior, performance, and stores observable over time.

**Key constraint**: context-window-metrics.jsonl has 501 entries but only 44 with token data (recent sessions). Telemetry enrichment is part of the plan to build denser time-series going forward.

---

## Architecture

- **Frontend**: React 19 + Recharts 3.8 + Tailwind (existing stack)
- **Backend**: Fastify routes in `jarvis-memory.ts` reading Jarvis project files
- **External APIs**: Qdrant REST (:6333), Neo4j HTTP query API (:7474/db/{db}/query/v2)
- **No new npm deps** except possibly one lightweight graph viz library for Feature 2

### Page Restructuring

JarvisMemoryPage gets **tab navigation** to manage growing content:
- **Overview** tab: existing content (state, gauges, connections, signals, watcher log)
- **Analytics** tab: Features 1, 4, 5A (timeline, compression gauge, health heatmap)
- **Stores** tab: Features 2, 3 (Graphiti graph, RAG collections)

---

## Feature 1: Context Window Timeline

**Goal**: Recharts ComposedChart showing token usage over time with event markers.

### Server

**Endpoint**: `GET /api/jarvis/context-timeline?hours=168`

**Sources**:
- `.claude/logs/context-window-metrics.jsonl` — compression events with tokens, trigger, method
- `.claude/logs/telemetry/memory-health-*.jsonl` — intra-cycle snapshots (l6_tokens field)
- `.claude/context/.jicm-state-hook.json` — current real-time point

**Response**:
```typescript
{
  points: Array<{ ts: number; tokens: number; source: 'compression'|'health'|'realtime' }>;
  events: Array<{ ts: number; type: 'compression'|'meditate'|'rest'; label: string; tokens_before?: number; checkpoint_bytes?: number }>;
  thresholds: { soft: 250000; hard: 300000; window: 1000000 };
}
```

**Logic**: Parse JSONL, filter to time window, merge health telemetry points, append current state. For each compression event, emit both the pre-compression token count AND a synthetic post-compression point (checkpoint_bytes * 4 + ~22K baseline) to create the sawtooth pattern. Skip entries with tokens=0 for the line but still emit their event markers.

### Frontend

- `ComposedChart` with `Area` (tokens, filled gradient blue→transparent)
- `ReferenceLine y={250000}` amber dashed (soft threshold)
- `ReferenceLine y={300000}` red dashed (hard threshold)
- Vertical `ReferenceLine` for each event: blue=compression, green=rest, purple=meditate
- Time slider (hours: 24/72/168) with localStorage persistence
- Custom Tooltip: timestamp, tokens, event type + details

**Complexity**: M

---

## Feature 2: Graphiti Knowledge Graph Prototype

**Goal**: Visual representation of the Neo4j knowledge graph.

### Server

**Endpoint**: `GET /api/jarvis/graphiti-overview?sample=30`

**Source**: Neo4j HTTP Query API at `http://localhost:7474/db/neo4j/query/v2`
- Cypher queries via HTTP POST (no neo4j-driver dependency needed)
- Auth: Basic auth (neo4j / password from credentials)

**Queries**:
```cypher
// Stats
MATCH (n:Entity) RETURN count(n) AS entities
MATCH (n:Episodic) RETURN count(n) AS episodes  
MATCH ()-[r:RELATES_TO]->() RETURN count(r) AS edges
MATCH (n:Community) RETURN count(n) AS communities

// Top entities by relationship count
MATCH (n:Entity)-[r:RELATES_TO]-() RETURN n.name, n.summary, count(r) AS edges ORDER BY edges DESC LIMIT 15

// Sample subgraph (most-connected entities + their relationships)
MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) 
WITH a, r, b ORDER BY r.weight DESC LIMIT 50
RETURN collect(DISTINCT {id: elementId(a), name: a.name, type: 'entity'}) + 
       collect(DISTINCT {id: elementId(b), name: b.name, type: 'entity'}) AS nodes,
       collect({source: elementId(a), target: elementId(b), name: r.name}) AS edges
```

**Response**:
```typescript
{
  stats: { entities: number; episodes: number; edges: number; communities: number };
  top_entities: Array<{ name: string; summary: string; edge_count: number }>;
  recent_episodes: Array<{ name: string; created_at: string }>;
  sample_graph: { nodes: Array<{id,name,type}>; edges: Array<{source,target,name}> };
}
```

### Frontend

**Stat cards row**: 4 cards (entities, edges, episodes, communities) — same pattern as TokenCompressionPage

**Top entities table**: Sortable by edge count, name truncated with tooltip

**Subgraph visualization**: Two options evaluated:

- **Option A (recommended)**: Pure SVG with a simple force simulation computed in `useMemo`. For 30 nodes, 50 iterations of a spring-force algorithm takes <5ms. Nodes as circles with labels, edges as lines. Pan/zoom via SVG viewBox manipulation. No new dependency.

- **Option B (fallback)**: Recharts `ScatterChart` with custom dot shapes for nodes, SVG `<line>` overlays for edges. Hackier but zero-dependency.

**Complexity**: L (Neo4j HTTP integration + graph rendering)

---

## Feature 3: RAG Database Visualization

**Goal**: Visual representation of Qdrant vector collections.

### Server

**Endpoint**: `GET /api/jarvis/rag-collections`

**Source**: Qdrant REST at `http://localhost:6333`
- `GET /collections` for list
- `GET /collections/{name}` for detail (points_count, indexed_vectors_count, status)

**Response**:
```typescript
{
  collections: Array<{ name: string; points_count: number; indexed_count: number; status: string; dimensions: number }>;
  total_points: number;
  qdrant_up: boolean;
}
```

### Frontend

- **Stat header**: Total points, collection count, Qdrant status
- **Recharts `Treemap`**: Proportional rectangles sized by points_count, color-coded by status (green/amber). Treemap is available in Recharts — visually more interesting than a bar chart for 10+ collections of varying sizes (sessions: 53 vs jarvis-context: 904+).
- **Collection grid below**: Name, points, indexed count, dimensions, status dot

**Complexity**: S

---

## Feature 4: Compression Effectiveness Metric

**Goal**: Single aggregate gauge representing JICM compression impact, shown on both jarvis-memory and token-compression pages.

### Server

**Endpoint**: `GET /api/jarvis/compression-effectiveness`

**Sources**:
- `context-window-metrics.jsonl` — compression events
- `.jsonl-compression-stats.json` — Stage 1 stats

**Metric: "Memory Turnover Efficiency"** (0-100%):

| Component | Weight | Formula |
|-----------|--------|---------|
| Context preserved through compression | 40% | avg(checkpoint_tokens / pre_tokens) where checkpoint_tokens = checkpoint_bytes * 4 |
| Stage 1 JSONL reduction | 30% | reduction_pct from stats |
| Dedup effectiveness | 30% | tool_results_deduped / tool_results_total |

**Response**:
```typescript
{
  efficiency_pct: number;
  components: { preservation: number; stage1_reduction: number; dedup: number };
  stats: { total_compressions: number; avg_duration_s: number; cumulative_tokens_saved: number };
}
```

### Frontend

**Shared component**: `EfficiencyGauge.tsx` in `src/components/jarvis-memory/`

- Recharts `RadialBarChart` with `PolarAngleAxis` domain [0, 100]
- Semicircular gauge (startAngle=180, endAngle=0)
- Color gradient: red (<30%) → amber (30-60%) → green (>60%)
- Center label: percentage + "Memory Efficiency"
- Below gauge: 3 sub-metric bars showing each component's contribution

**Placement**:
- jarvis-memory Analytics tab: primary position
- token-compression page: new stat card in the header row

**Complexity**: S

---

## Feature 5: Additional Recommendations

### 5A: Memory Layer Health Heatmap (recommended — build in Phase 2)

**Goal**: 6-row heatmap (L1-L6) x time columns showing layer health status over time.

**Server**: `GET /api/jarvis/layer-health-history?hours=72`
- Parse `memory-health-*.jsonl` telemetry files
- Re-derive layer status from raw values using thresholds:
  - L1: warn if insights_lines > 200
  - L2: warn if scratchpad > 80, critical if > 120
  - L6: warn if tokens > 250K, critical if > 300K

**Frontend**: CSS grid with colored cells (green/amber/red/grey). No Recharts needed — simpler as pure HTML/CSS. Each cell clickable to show the raw metric values in a tooltip.

**Complexity**: S-M

### 5B: Telemetry Enrichment (infrastructure — build in Phase 1)

**Goal**: Build denser time-series data by logging token counts more frequently.

**Implementation**: Extend the watcher's `refresh_state_from_jsonl()` (runs every 5s) to append to a new high-frequency metrics file (`.claude/logs/telemetry/context-tokens-YYYY-MM-DD.jsonl`) every 30 seconds. Schema: `{ts, tokens, cache_hit_rate, burn_rate}`. This gives ~2880 points/day vs the current ~7.

This is the **critical enabler** for Feature 1. Without it, the timeline chart has too few data points to show meaningful trends.

**Complexity**: S

---

## Implementation Phases

### Phase 1: Foundation + Quick Wins (~3h)

1. **Telemetry enrichment** (5B) — watcher appends high-frequency token snapshots
2. **API module** — create `src/api/jarvis-memory.ts` with TanStack Query hooks
3. **Feature 3: RAG Collections** — simplest new endpoint, Treemap chart
4. **Feature 4: Compression Gauge** — shared EfficiencyGauge component on both pages
5. **Tab navigation** — restructure JarvisMemoryPage into Overview/Analytics/Stores tabs

### Phase 2: Core Visualizations (~3h)

6. **Feature 1: Context Window Timeline** — ComposedChart with event markers
7. **Feature 5A: Health Heatmap** — CSS grid, layer status over time
8. Polish + integration testing

### Phase 3: Advanced (~3h)

9. **Feature 2: Graphiti Graph** — Neo4j HTTP integration + SVG force graph
10. Stretch: Session lifecycle timeline if time permits

---

## Files Modified

### New files
- `dashboard/frontend/src/api/jarvis-memory.ts` — TanStack Query hooks
- `dashboard/frontend/src/components/jarvis-memory/EfficiencyGauge.tsx` — shared gauge
- `dashboard/frontend/src/components/jarvis-memory/ContextTimelineChart.tsx`
- `dashboard/frontend/src/components/jarvis-memory/RagCollectionsChart.tsx`
- `dashboard/frontend/src/components/jarvis-memory/GraphitiOverview.tsx`
- `dashboard/frontend/src/components/jarvis-memory/LayerHealthHeatmap.tsx`

### Modified files
- `dashboard/server/routes/jarvis-memory.ts` — 4 new endpoints
- `dashboard/frontend/src/pages/JarvisMemoryPage.tsx` — tab navigation + chart sections
- `dashboard/frontend/src/pages/TokenCompressionPage.tsx` — add EfficiencyGauge
- `Jarvis/.claude/scripts/jicm-watcher.sh` — telemetry enrichment (high-freq token logging)

---

## Verification

1. Start dev dashboard: `cd ~/Claude/Alfred-Dev && docker compose -f docker-compose.yml -f docker-compose.dev.yml -p aifred-pro-dev up -d --no-deps nexus-dashboard`
2. Open `http://localhost:8702/jarvis-memory` — verify tab navigation, Overview has existing content
3. Analytics tab: Context Timeline shows sawtooth with event markers, Compression Gauge shows percentage, Health Heatmap shows 6 layers
4. Stores tab: RAG Treemap shows collections with proportional sizes, Graphiti shows stats + subgraph
5. Open `http://localhost:8702/token-compression` — verify EfficiencyGauge appears
6. Check 15s auto-refresh updates data without full page reload
