# Knowledge Horizon UI — Phased Implementation Plan

## Context

The Knowledge Horizon is a dynamic masking system that limits what the Chronicler reveals about the world, based on what the fortress and its inhabitants would logically know. The design document (`projects/chronicler/designs/knowledge-horizon.md`) defines 7 visibility caveats (CAV-001 through CAV-007), but no implementation exists yet.

**Current state**: Fresh world "Thadar En" (world_id=8, 35K HFs, 312K events, 3.7K entities). The watcher is running, collecting in-game data. 20 starting dwarves all have hist_fig_ids but zero connections in legends data — a clean slate. The player's civilization ("the moist arches", entity 989) has 25 position holders.

**Goal**: Build three complementary UI visualizations (phased) that make the Knowledge Horizon visible, informative, and interactive. The foundation layer (masking computation) supports all three.

---

## Architecture: Foundation Layer (supports all 3 phases)

### New Table: `knowledge_horizon`
```sql
CREATE TABLE knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,  -- 'hf', 'entity', 'site'
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    caveat      TEXT,           -- which CAV rule revealed this: 'CAV-001', 'CAV-002', etc.
    revealed_by INT,            -- unit_id of the dwarf whose connection revealed this
    revealed_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (world_id, entity_type, entity_id)
);
CREATE INDEX idx_kh_visible ON knowledge_horizon(world_id, visible);
CREATE INDEX idx_kh_caveat ON knowledge_horizon(world_id, caveat);
```

### Computation Module: `chronicler/knowledge/horizon.py`
A function `compute_horizon(conn, world_id, civ_id, site_id)` that:
1. Starts with an empty visible set
2. Applies each CAV rule in order, adding entities:
   - **CAV-002** (Nobles/Admins): All current position holders for civ_id → visible HFs
   - **CAV-005** (Family): For each fortress dwarf, traverse hf_links depth 1-2
   - **CAV-001** (Organizations): For each fortress dwarf, traverse hf_entity_links → find co-members
   - **CAV-003** (Previous Residence): For each fortress dwarf, traverse hf_site_links → co-residents
   - **CAV-006** (Events): Query recent history_events involving fortress entities
3. Upserts results into `knowledge_horizon` table
4. Returns summary statistics (counts per caveat)

### API Endpoint: `GET /api/explorer/horizon/stats?world_id=8`
Returns JSON with visibility counts, per-caveat breakdown, and total known/unknown.

### API Endpoint: `GET /api/explorer/horizon/check?world_id=8&entity_type=hf&entity_id=123`
Returns `{visible: true, caveat: "CAV-002", revealed_by: 15002}` for a single entity.

---

## Phase 1: Graph Fog-of-War (enhance existing Graph tab)

### Backend Changes

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py`

1. Add visibility lookup to graph endpoints (`graph_hf`, `graph_entity`, `graph_site`):
   - After building nodes, batch-check `knowledge_horizon` for each node
   - Attach `visibility` field to each node: `'known'`, `'boundary'`, or `'unknown'`
   - Boundary = 1 hop beyond a known node but not itself known

2. Modify node builder functions (`_hf_node`, `_entity_node`, `_site_node`):
   - Add optional `visibility` parameter
   - When `visibility='boundary'`: use RGBA colors with 40% alpha, dashed border
   - When `visibility='unknown'`: use very dim colors (20% alpha), dotted border
   - Known nodes: unchanged (current full-color styling)

3. New endpoint: `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=2&horizon=true`
   - The `horizon=true` query param activates Knowledge Horizon styling
   - Without it, the graph renders as before (no fog)

### Frontend Changes

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html`

1. Add "Knowledge Horizon" toggle switch in graph controls bar (next to depth radio buttons):
   ```html
   <label class="flex items-center gap-2 text-xs text-stone-400">
     <input type="checkbox" id="horizon-toggle" onchange="reloadGraph()">
     Knowledge Horizon
   </label>
   ```

2. Update graph load function to pass `?horizon=true` when toggle is checked

3. Update legend to show visibility tiers:
   - Solid = Known | Semi-transparent = Boundary | (hidden = Beyond horizon)

4. Add hover tooltip on boundary nodes: "Beyond current knowledge — could be revealed by: [caveat description]"

### Visual Styling (vis.js)

vis.js doesn't support per-node CSS opacity, but RGBA colors work:
- **Known**: Current colors (e.g., `#a8a29e` for HF, `#f6b93b` for deity)
- **Boundary**: Same hue at 40% alpha (e.g., `rgba(168,162,158,0.4)`), dashed border
- **Unknown**: Same hue at 15% alpha, dotted border, smaller size

---

## Phase 2: Knowledge Audit Panel

### Backend Changes

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py`

1. New endpoint: `GET /api/explorer/horizon/audit?world_id=8`
   Returns:
   ```json
   {
     "total_hf": 35334,
     "visible_hf": 847,
     "pct_visible": 2.4,
     "by_caveat": {
       "CAV-001": {"label": "Organizations", "count": 89},
       "CAV-002": {"label": "Nobles & Admins", "count": 34},
       "CAV-003": {"label": "Previous Residence", "count": 156},
       "CAV-005": {"label": "Family Chains", "count": 412},
       "CAV-006": {"label": "Events", "count": 156}
     },
     "by_entity_type": {
       "hf": {"visible": 847, "total": 35334},
       "entity": {"visible": 124, "total": 3684},
       "site": {"visible": 38, "total": 1983}
     },
     "recent_revelations": [
       {"text": "Migrant Urist arrived", "revealed": 12, "caveat": "CAV-003", "time": "..."}
     ],
     "fortress_dwarves": [
       {"name": "Urdim Ushrirkutam", "contribution": 42, "top_caveat": "CAV-005"}
     ]
   }
   ```

2. New endpoint: `GET /api/explorer/horizon/dwarf/{world_id}/{unit_id}`
   Returns the personal "knowledge cone" for a specific dwarf — what they know and why.

### Frontend Changes

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html`

1. Add "Horizon" as a 4th tab (after Schema / Data / Graph)

2. Horizon tab layout:
   - **Top bar**: Knowledge score gauge (e.g., "847 / 35,334 HFs known — 2.4%")
   - **Left panel**: Per-caveat breakdown with horizontal bar chart
     - Each bar color-coded by caveat type
     - Clickable to filter the detail view
   - **Right panel**: Dwarf roster showing each fortress dwarf and their knowledge contribution
     - Click a dwarf to see their personal cone
   - **Bottom**: Recent revelations timeline (last N events that expanded knowledge)

3. Visual elements:
   - Progress bar showing % of world known (fills amber)
   - Caveat bars use distinct colors (green=family, blue=org, orange=position, purple=events)
   - Dwarf avatars with contribution badges

---

## Phase 3: Concentric Horizon Rings

### Backend Changes

1. New endpoint: `GET /api/explorer/horizon/rings?world_id=8&center=fortress`
   Returns ring data:
   ```json
   {
     "rings": [
       {"id": 0, "label": "Fortress", "entities": [...], "count": 20},
       {"id": 1, "label": "Direct Knowledge", "entities": [...], "count": 89},
       {"id": 2, "label": "Extended Knowledge", "entities": [...], "count": 412},
       {"id": 3, "label": "Event-Revealed", "entities": [...], "count": 156},
       {"id": 4, "label": "Boundary", "entities": [...], "count": 78}
     ],
     "beyond": {"count": 34599, "label": "Unknown World"}
   }
   ```

2. Ring assignment logic:
   - Ring 0: Fortress inhabitants (units table)
   - Ring 1: CAV-002 (nobles) + CAV-005 depth-1 family
   - Ring 2: CAV-001 (orgs) + CAV-005 depth-2 family + CAV-003 (residence)
   - Ring 3: CAV-006 (events)
   - Ring 4: Boundary (1 hop beyond any known entity, not itself known)

### Frontend Changes

1. Add concentric ring visualization to the Horizon tab (or as a sub-view):
   - Canvas2D rendering (no vis.js dependency — this is a custom viz)
   - Concentric circles with entities positioned radially
   - Each ring is a distinct color band
   - Click a ring to expand and see entities within
   - Click an entity to navigate to its graph view
   - Center shows fortress name + dwarf count
   - Outer edge shows "34,599 beyond horizon" with a fading gradient

2. Animation: When knowledge expands (e.g., migrant arrives), the ring system pulses outward

---

## Files to Modify

| File | Changes |
|------|---------|
| `chronicler/db/schema.sql` | Add `knowledge_horizon` table |
| `chronicler/knowledge/__init__.py` | New module |
| `chronicler/knowledge/horizon.py` | Core computation: `compute_horizon()` |
| `chronicler/api/routes/explorer.py` | Horizon API endpoints, graph fog styling |
| `chronicler/api/templates/explorer.html` | Horizon tab, fog toggle, ring viz |
| `chronicler/dfhack/watcher.py` | Call `compute_horizon()` after each sync cycle |
| `chronicler/api/app.py` | Register new route module (if separate) |

## Existing Code to Reuse

- **Node builders**: `_hf_node()`, `_entity_node()`, `_site_node()` at `explorer.py:422-496` — extend with visibility parameter
- **Edge builder**: `_edge()` at `explorer.py:499-507` — add dim styling for boundary edges
- **Tab switching**: `switchTab()` pattern at `explorer.html:192-198` — add 4th tab
- **Connection pool**: `request.app.state.pool` pattern — used by all endpoints
- **SQL safety**: Readonly transactions pattern at `explorer.py:367`
- **Graph search**: Typeahead pattern at `explorer.py:521-570` — extend for horizon-aware search

## Verification

### Phase 1 Verification
1. Start Chronicler: `chronicler serve --port 8080`
2. Open http://localhost:8080/explorer → Graph tab
3. Search for a starting dwarf (e.g., "Urdim")
4. Toggle "Knowledge Horizon" on → nodes should dim/brighten based on visibility
5. Expand nodes → boundary nodes should appear semi-transparent
6. Compare with toggle off → all nodes should render at full color

### Phase 2 Verification
1. Navigate to Horizon tab
2. Verify knowledge score shows (should be low for new fortress)
3. Check per-caveat breakdown matches expected counts
4. Click a dwarf → verify personal knowledge cone renders
5. Let game run → refresh → verify counts increase as data flows

### Phase 3 Verification
1. Open Horizon tab → ring visualization
2. Verify ring 0 shows fortress dwarves
3. Click rings 1-4 to expand and see entities
4. Click entity → navigates to graph view
5. Verify "beyond horizon" count matches total minus visible

## Implementation Order

1. Foundation: `knowledge_horizon` table + `compute_horizon()` function
2. Phase 1: Graph fog-of-war toggle + styled nodes
3. Phase 2: Horizon tab with audit panel + dwarf roster
4. Phase 3: Concentric ring visualization
