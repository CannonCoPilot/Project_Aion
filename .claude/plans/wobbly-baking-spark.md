# Plan: Graph Tab Network Visualizer Enhancement

## Context

The Graph Tab on the HF detail page currently shows a basic force-directed network of HF-to-HF relationships only. The user wants it transformed into a flexible exploration tool for discovering connections between HFs through family, sites, and organizations. Five enhancements are needed: degree selector, enriched entity/site nodes, square container, layout selector + reset, and a fixed toggle system.

## Files to Modify

- **Backend**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`
- **Frontend**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/hf_detail.html`

## Data Available (verified from DB)

**Entity types**: sitegovernment (1890), religion (985), civilization (810), nomadicgroup (419), outcast (358), guild (223), performancetroupe (90), migratinggroup (28), militaryunit (23), merchantcompany (21)

**HF-Entity link types**: member (92K), former member (70K), enemy (26K), former prisoner (4K), criminal (1K), prisoner (302), former slave (27), slave (8)

**HF-Site link types**: home structure (682), occupation (632), seat of power (502), lair (252), hangout (4), home site building (2)

## Implementation Order

### Step 1: Fix Toggle System (Feature 5) — Foundation

**Problem**: Current code at `hf_detail.html:1139-1173` uses `fullNodes.update({hidden: !show})`. vis.js `hidden` flag still includes nodes in physics — hidden nodes push visible nodes apart, creating gaps. Also, `_syncEdgeVisibility()` only hides edges (never re-shows them), and `update()` overwrites color properties.

**Solution**: Replace hidden-flag approach with **remove/re-add pattern**. Store deep clones of original node/edge arrays. On toggle change, `clear()` both DataSets and `add()` only the visible subset. This forces vis.js to recalculate layout without hidden elements.

Changes in `hf_detail.html` (lines 1102-1177):
- Store `_origNodes = JSON.parse(JSON.stringify(fullData.nodes))` and `_origEdges` at init
- New function `_getActiveFilters()` — reads all toggle checkbox states, returns `{hiddenGroups, hiddenCats}`
- New function `_rebuildDataSets()` — filters `_origNodes`/`_origEdges` by active filters, does `clear()` + `add()` on DataSets. Edges whose endpoints are hidden are automatically excluded.
- Wire all `.graph-node-toggle` and `.graph-edge-toggle` checkboxes to call `_rebuildDataSets()`
- Delete `_syncEdgeVisibility()` (no longer needed)

### Step 2: Square Graph Container (Feature 3) — CSS only

**Change** in `hf_detail.html` line 826:
```
Before: style="height: 500px; background: ..."
After:  style="aspect-ratio: 1; max-height: 80vh; background: ..."
```

`aspect-ratio: 1` makes the canvas square, width determined by parent `.section-card`. `max-height: 80vh` prevents overflowing the viewport. vis.js has an internal ResizeObserver that handles container dimension changes.

### Step 3: Enriched Node & Edge Types (Feature 2) — Backend + Frontend

#### 3a. Backend (`detail_pages.py`)

**New constants** (after line 68):
- `_ENTITY_NODE_STYLES` dict mapping entity type → `{color, shape, label}`:
  - `civilization` → blue diamond, `religion` → purple triangle ("Sect"), `guild` → amber square, `sitegovernment` → emerald diamond ("Site Gov"), `merchantcompany` → red square ("Mercenary Co"), `performancetroupe` → pink triangle ("Troupe"), `outcast` → stone triangleDown ("Outcast"), `militaryunit` → red star ("Military"), `nomadicgroup`/`migratinggroup` → gray triangle
- `_SITE_NODE_STYLE` → green hexagon
- Extend `_GRAPH_EDGE_COLORS` with: member, former member, enemy, prisoner, criminal, home structure, occupation, seat of power, lair, hangout
- Extend `_EDGE_CATEGORY` with: membership, conflict, residence categories

**New helpers** (after `_build_hf_node` at line 98):
- `_build_entity_node(entity_id, entity_row)` → vis.js node dict with shape/color from `_ENTITY_NODE_STYLES`
- `_build_site_node(site_id, site_row)` → vis.js node dict as green hexagon

**Modify `_build_full_graph_data()`** (lines 280-358):
- Add params: `entity_links=None, site_links=None`
- After existing HF nodes/edges, append entity nodes + membership edges from `entity_links`
- Append site nodes + residence edges from `site_links`
- Entity/site data already fetched in `hf_detail_page()` (lines 467-492) — just pass it through

**Update call site** (line 786-787):
```python
graph_data_full = await _build_full_graph_data(
    conn, world_id, hf_id, relationships, co_parents,
    entity_links=entity_links, site_links=site_links)
```

#### 3b. Frontend (`hf_detail.html`)

**New legend groups** (after line 823, before canvas):
- **Orgs row**: toggles for `entity_civilization`, `entity_religion` (Sect), `entity_guild`, `entity_sitegovernment` (Site Gov), `entity_merchantcompany` (Mercenary), `entity_performancetroupe` (Troupe), `entity_outcast` (Outcast), `entity_militaryunit` (Military)
- **Places row**: toggle for `site` nodes (green hexagon indicator)
- **Links row**: toggles for `membership` and `residence` edge categories

**Update double-click handler** to support `entity-{id}` and `site-{id}` node ID prefixes (navigate to entity/site detail pages).

**Update header stats**: Change "people" to "nodes" to account for non-HF nodes.

### Step 4: Degree Selector (Feature 1) — Backend BFS + Frontend AJAX

#### 4a. New API endpoint (`detail_pages.py`, after line 848)

```python
@router.get("/api/hf/{hf_id}/graph", response_class=JSONResponse)
async def hf_graph_data(hf_id, world_id, degree):
```

This endpoint:
1. Clamps degree to [1,3]
2. Fetches HF's direct relationships + co-parents + entity_links + site_links (reuses same queries from `hf_detail_page`)
3. For degree 1: same as current `_build_full_graph_data()` behavior
4. For degree 2-3: BFS expansion through `hf_links` — queries frontier nodes' relationships, collects new HF IDs, repeats for each degree
5. Caps at 200 total HF nodes to prevent explosion
6. Returns JSON graph data

#### 4b. Modify `_build_full_graph_data()` to accept `degree` param

Add BFS loop:
- Degree 1: use pre-fetched `relationships` (current behavior, no new query)
- Degree 2+: for each frontier set, query `hf_links` for new neighbors not yet visited, add to visited set, update frontier
- After BFS: fetch all HF details for the complete visited set, build nodes/edges
- Entity/site enrichment stays on center HF only (prevents query explosion at higher degrees)

#### 4c. Frontend controls

**HTML**: Add degree dropdown `<select id="graph-degree-select">` with options 1/2/3 hops, plus a node count indicator.

**JavaScript**: On change, fetch `/api/hf/{hf_id}/graph?world_id={wid}&degree={d}`, replace `_origNodes`/`_origEdges` with response data, call `_rebuildDataSets()`. Show loading indicator during fetch.

### Step 5: Reset Button + Layout Selector (Feature 4)

#### 5a. Frontend controls

**HTML** (same controls row as degree selector):
- Layout `<select>` with options: Force Atlas 2 (default), Barnes-Hut, Repulsion, Hierarchical, Circle, Grid
- Reset `<button>` styled with hover amber accent

Note: vis.js natively supports `forceAtlas2Based`, `barnesHut`, `repulsion`, and hierarchical layout. Circle and Grid are custom-positioned (compute x,y, set `physics: false`).

#### 5b. JavaScript

**Extract options builder** — `_getFullGraphOptions(solver)`:
- For physics solvers (`forceAtlas2Based`, `barnesHut`, `repulsion`): return appropriate physics config
- For `hierarchical`: return hierarchical layout config with physics disabled
- For `circle`: compute positions in a ring (center HF at origin, others evenly spaced on radius)
- For `grid`: compute positions in a grid pattern

**Layout change handler**: On select change, compute positions if custom layout, rebuild DataSets with position data, call `network.setOptions()`, then `network.stabilize()` or `network.fit()`.

**Reset handler**: On click, reset all checkboxes to checked, degree to 1, layout to Force Atlas 2, restore original degree-1 data from `fullData` (the server-rendered snapshot), rebuild.

## Verification

1. **Toggle fix**: Open HF 3615 Graph tab. Uncheck "Mortal" nodes. Verify remaining nodes re-settle tightly (no phantom gaps). Re-check "Mortal". Verify nodes reappear with correct colors/sizes.

2. **Square container**: Verify canvas is square, responsive to window width, never exceeds 80vh.

3. **Enriched types**: On HF 3615 (or another HF with entity/site links), verify entity nodes (diamond/triangle/square/star shapes) and site nodes (hexagons) appear. Toggle org types off/on. Double-click entity → navigates to entity detail.

4. **Degree selector**: Change to 2 hops. Verify more nodes appear. Change to 3. Verify cap at ~200. Switch back to 1.

5. **Layout selector**: Switch between all 6 layouts. Force Atlas 2 / Barnes-Hut / Repulsion show physics. Hierarchical shows tree. Circle shows ring. Grid shows grid. Reset button restores all defaults.

6. **Edge cases**: HF with no relationships → "No data" message. HF with only family links → only family edges shown.
