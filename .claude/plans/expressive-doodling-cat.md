# Plan: HF Detail Page — Three-Graph Restructure

## Context

The HF detail page currently has one vis.js network graph (all connection types) embedded in the Relationships tab. The user wants this split into three purpose-built visualizations:

1. **Family Pedigree** (Relationships tab) — ancestor/descendant tree with generation sliders
2. **Career / Mentorship** (Relationships tab) — directed master→apprentice flow chart
3. **Full Network Graph** (new Graph tab) — the existing all-connections graph, moved here with a togglable color-coded legend

## Files to Modify

| File | Changes |
|---|---|
| `chronicler/api/routes/detail_pages.py` | Extract node builder; add 3 graph data helpers; refactor route |
| `chronicler/api/templates/hf_detail.html` | Add Graph tab; replace old graph with pedigree+career; add legend; rewrite JS |

Both files live under `/Users/nathanielcannon/Claude/Projects/DwarfCron/`.

## Implementation Steps

### Step 1: Backend Constants + Node Helper (`detail_pages.py`)

Add after `_GRAPH_EDGE_COLORS` (line ~40):

- `_FAMILY_LINK_TYPES` frozenset: mother, father, child, spouse, former spouse, deceased spouse, lover, partner
- `_MENTORSHIP_LINK_TYPES` frozenset: master, apprentice, former master, former apprentice
- `_EDGE_CATEGORY` dict: maps each link_type to a category string (family/romantic/mentorship/companion/imprisonment/other)

Extract existing node-building logic (lines ~490-520) into `_build_hf_node(gid, hf_map, center_id)` helper. Add `'group'` key (deity/vampire/necromancer/werebeast/ghost/mortal) for vis.js legend groups.

### Step 2: Pedigree Data Builder (`detail_pages.py`)

New `async _build_pedigree_data(conn, world_id, hf_id, max_up=5, max_down=5)`:

- Iterative frontier expansion (matching pattern from `explorer.py:graph_hf` at line 514)
- **Ancestor walk**: for each generation 1..max_up, fetch mother/father links from frontier, collect partner/spouse links at each level
- **Descendant walk**: for each generation 1..max_down, fetch child links from frontier
- Tag each node with `generation` (0=center, negative=ancestors, positive=descendants)
- Tag each edge with `generation` + `id` (sequential integer for DataSet.update)
- Cap: 30 nodes per generation to prevent dynasty explosions
- Returns dict with `nodes`, `edges`, `center`, `max_up`, `max_down`

### Step 3: Career Data Builder (`detail_pages.py`)

New `async _build_career_data(conn, world_id, hf_id)`:

- Single query: fetch all hf_links where (hf_id=$2 OR target_hf_id=$2) AND link_type IN mentorship types
- Normalize direction: master→apprentice (master/former master link means target is master, so reverse)
- Directed edges with `arrows: 'to'`; dashed for "former" links
- Returns dict with `nodes`, `edges`, `center`

### Step 4: Full Graph Builder Refactor (`detail_pages.py`)

Move existing graph build block (lines ~464-565) into `async _build_full_graph_data(conn, world_id, hf_id, relationships, co_parents)`:

- Add `'category'` to each edge (from `_EDGE_CATEGORY`)
- Add `'group'` to each node (from `_build_hf_node`)
- Add sequential `'id'` to each edge
- Same 51-node cap as before

### Step 5: Wire Up Route (`detail_pages.py`)

In `hf_detail_page()`:
- Replace the inline graph-build block with calls to all 3 helpers
- Pass `graph_data_pedigree`, `graph_data_career`, `graph_data_full` to template (remove old `graph_data`)

### Step 6: Template — Tab Bar (`hf_detail.html`)

Add fifth tab button after Events (line 93):
```html
<button class="detail-tab" id="dtab-graph" onclick="switchDetailTab('graph')">Graph</button>
```
Convention confirmed: `dtab-{name}` + `dtab-content-{name}` + URL hash persistence (from `detail_base.html:173`).

### Step 7: Template — Relationships Tab Graphs (`hf_detail.html`)

Replace the old `#rel-graph-canvas` block (lines ~347-355) with:

**Family Pedigree section:**
- Conditional on `graph_data_pedigree.edges|length > 0`
- Two range sliders: "Ancestors" (0-5) and "Descendants" (0-5) — matches existing kills slider pattern
- Canvas div `#pedigree-graph-canvas` (400px height)

**Mentorship Network section:**
- Conditional on `graph_data_career.edges|length > 0`
- Label: "Mentorship Network (arrows: master -> apprentice)"
- Canvas div `#career-graph-canvas` (300px height)

### Step 8: Template — Graph Tab (`hf_detail.html`)

New `<div id="dtab-content-graph" class="tab-content">` after Relationships tab close, containing:

**Legend panel** (`#graph-legend`):
- Node type toggles: Deity, Vampire, Necromancer, Werebeast, Ghost, Mortal — each color-coded button
- Edge category toggles: Family, Romantic, Mentorship, Companion, Imprisonment — each color-coded button
- CSS: `.legend-toggle` with `.active` state; opacity dims when toggled off

**Full graph canvas** `#full-graph-canvas` (450px height)

### Step 9: Template — JavaScript (`hf_detail.html`)

Replace old single graph IIFE (lines ~726-793) with three IIFEs:

**Pedigree IIFE:**
- vis.js hierarchical layout (`direction: 'UD'`, `physics: false`)
- `window.filterPedigree()` — reads slider values, uses `DataSet.update({id, hidden})` to show/hide nodes by generation range
- IntersectionObserver lazy init
- Double-click navigation

**Career IIFE:**
- vis.js hierarchical layout (`direction: 'UD'`, `physics: false`)
- Directed arrows enabled
- IntersectionObserver lazy init
- Double-click navigation

**Full Graph IIFE:**
- Existing forceAtlas2Based physics
- `window.toggleLegendGroup(btn, kind, key)` — toggles button active class, uses DataSet.update to show/hide nodes by group or edges by category
- When node group hidden, also hides edges connecting to hidden nodes
- IntersectionObserver lazy init
- Double-click navigation

### Step 10: CSS for Legend (`hf_detail.html`)

In `{% block extra_head %}`:
```css
.legend-toggle { padding: 2px 8px; border-radius: 3px; cursor: pointer; opacity: 1; transition: opacity 0.2s; font-size: 0.65rem; font-weight: 700; }
.legend-toggle:not(.active) { opacity: 0.35; }
```

## Key Design Decisions

1. **Pre-compute, not AJAX**: All 3 graph datasets baked into template at page load (max 5 generations). Sliders filter client-side via `DataSet.update({hidden})` — instant, no round-trip. Matches kills-year-slider pattern.

2. **Hierarchical layout for pedigree + career**: `layout.hierarchical` with `physics: false` gives clean top-down trees. Full network keeps forceAtlas2Based for organic layout.

3. **Edge IDs required**: `DataSet.update()` needs explicit IDs. All edges get sequential integer `id` in the backend builders.

4. **Generation cap**: 30 nodes per generation in pedigree to prevent dynasty explosion (some DF HFs have 50+ children).

## Verification

1. Start server: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --port 5555 --reload`
2. Test pedigree: `/explorer/hf/4825` (Idala Curlsnake — 12 children, 2 co-parents, deep ancestry)
3. Test career: `/explorer/hf/10356` (Idala Swampwaxed — has former apprentice/master links)
4. Test Graph tab: any HF with diverse link types
5. Verify: sliders hide/show generations; legend toggles hide/show node/edge types; double-click navigates
6. Test empty states: HF with no family, no mentorship — graphs should not render (conditional blocks)
