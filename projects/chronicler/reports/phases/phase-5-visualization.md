# Phase 5: Visualization -- PRD/Roadmap

**Version**: 2.0 (LVN v3.0 integration: +2 stages, +25 tasks)
**Date**: 2026-03-18 (original 2026-02-25, renumbered 2026-03-04)
**Phase Duration**: 5-7 weeks (updated from 3-4)
**Milestone**: M5 -- Visualization Complete
**Entry State**: vis.js graph tab (partially built), no maps or charts
**Exit State**: Leaflet world map with 7+ layer groups, Chart.js demographics, Cytoscape family trees, D3 war diagrams, per-object mini-maps

**Parent Document**: Full Project Roadmap v2.0 (full-project-roadmap.md)
**Dependencies**: Phase 1 (geographic data), Phase 2 (entity detail pages for embedding visualizations)
**Requirements Covered**: REQ-VIS-001 through VIS-024

---

## 1. Phase Overview

Phase 5 builds all visual data representations: the interactive world map, population charts, event timelines, family trees, war diagrams, and per-object mini-maps. These visualizations are embedded within the entity detail pages built in Phase 2 and serve as the primary "World History & Demographics Visualizer" component (MC-1).

### 1.1 Visualization Library Stack

| Visualization | Library | Rationale |
|--------------|---------|-----------|
| World map | Leaflet.js 1.9.4 | Industry standard, L.CRS.Simple for non-geographic |
| Population charts | Chart.js 4.x | Simple API, doughnut/pie/bar/line |
| Event timelines | Chart.js 4.x | Line chart with click interaction |
| Family trees | Cytoscape.js 3.31 + dagre | Hierarchical DAG layout |
| War chord diagram | D3.js 7.x | Ribbon/chord for inter-civ conflicts |
| Warfare graph | Cytoscape.js + cola | Force-directed network |
| Curse lineage | Cytoscape.js or SVG | Chain/tree visualization |
| Ego-network | vis.js | Already partially built |
| Mini-maps | Python Pillow | Server-side image generation |

---

## 2. Stage 5.1: World Map

**Duration**: 1-2 weeks
**Dependencies**: Phase 1 (regions, sites, constructions, rivers, mountains, landmasses)
**Deliverables**: Interactive Leaflet.js map with 7+ toggleable layer groups

### 2.1 Leaflet.js World Map Core

**Requirement**: REQ-VIS-001
**Priority**: P1

**Route**: Map tab in explorer or dedicated `/explorer/map?world_id={wid}`

**Implementation**:

```javascript
// Initialize Leaflet with CRS.Simple (non-geographic)
const MAP_CONFIG = {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.5,
    attributionControl: false,
};

const map = L.map('world-map', MAP_CONFIG);

// World dimensions from API
const worldWidth = worldData.width;   // e.g., 257
const worldHeight = worldData.height; // e.g., 257
const tileSize = 4;  // pixels per world tile

// Set bounds (Y-axis inverted)
const bounds = [[0, 0], [worldHeight * tileSize, worldWidth * tileSize]];
map.fitBounds(bounds);

// Base layer: world map image as overlay
const imageUrl = `/api/map/image?world_id=${worldId}&tile_size=${tileSize}`;
L.imageOverlay(imageUrl, bounds, { opacity: 0.5 }).addTo(map);
```

**Coordinate conversion** (DF coords to Leaflet coords):
```javascript
function dfToLeaflet(x, y, tileSize) {
    // DF: origin top-left, Y increases downward
    // Leaflet CRS.Simple: origin bottom-left, Y increases upward
    return [
        (worldHeight - y) * tileSize,  // lat (inverted Y)
        x * tileSize                    // lng
    ];
}
```

### 2.2 Map Image Generation

**Requirement**: REQ-VIS-001
**Priority**: P1

**API**: `GET /api/map/image?world_id={wid}&tile_size={size}`

**Implementation** (Python Pillow):
```python
from PIL import Image

REGION_TYPE_COLORS = {
    'Wetland': (0, 128, 128),
    'Desert': (210, 180, 100),
    'Forest': (34, 139, 34),
    'Mountains': (139, 137, 137),
    'Hills': (160, 120, 60),
    'Lake': (65, 105, 225),
    'Ocean': (0, 0, 139),
    'Glacier': (200, 230, 255),
    'Tundra': (180, 180, 200),
    'Grassland': (124, 180, 62),
}

def generate_world_map_image(world_id: int, tile_size: int = 4) -> bytes:
    """Generate world map PNG from region data."""
    regions = db.query(Region).filter_by(world_id=world_id).all()

    # Determine world dimensions from region coordinates
    max_x = max_y = 0
    tiles = {}
    for region in regions:
        for coord in parse_coords(region.coords):
            x, y = coord
            tiles[(x, y)] = REGION_TYPE_COLORS.get(region.type, (128, 128, 128))
            max_x = max(max_x, x)
            max_y = max(max_y, y)

    # Create image
    img = Image.new('RGB', ((max_x + 1) * tile_size, (max_y + 1) * tile_size), (0, 0, 0))
    for (x, y), color in tiles.items():
        for dx in range(tile_size):
            for dy in range(tile_size):
                img.putpixel((x * tile_size + dx, y * tile_size + dy), color)

    # Cache three sizes
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()
```

**Three cached sizes**:
- Thumbnail: tile_size=2 (~100KB, for dashboards)
- Default: tile_size=4 (~400KB, for map view)
- Large: tile_size=10 (~2MB, for detailed exploration)

**Caching**: Store generated images in filesystem cache (`data/map_cache/{world_id}_{tile_size}.png`). Invalidate on re-ingestion.

### 2.3 Map Layer Groups

**Requirement**: REQ-VIS-002
**Priority**: P1

Each layer is a Leaflet `L.LayerGroup` with toggle controls.

```javascript
const layers = {
    sites: L.layerGroup(),
    constructions: L.layerGroup(),
    mountains: L.layerGroup(),
    landmasses: L.layerGroup(),
    regions: L.layerGroup(),
    rivers: L.layerGroup(),
    battles: L.layerGroup(),
};

// Toggle control
const layerControl = L.control.layers(null, {
    'Sites': layers.sites,
    'Roads & Bridges': layers.constructions,
    'Mountains': layers.mountains,
    'Landmasses': layers.landmasses,
    'Regions': layers.regions,
    'Rivers': layers.rivers,
    'Battles': layers.battles,
}).addTo(map);

// Custom "All"/"None" buttons
const toggleAll = L.control({position: 'topright'});
toggleAll.onAdd = function() {
    const div = L.DomUtil.create('div', 'layer-toggle-buttons');
    div.innerHTML = '<button onclick="showAllLayers()">All</button>' +
                    '<button onclick="hideAllLayers()">None</button>';
    return div;
};
toggleAll.addTo(map);
```

**Site layer population**:
```javascript
async function loadSiteLayer(worldId) {
    const response = await fetch(`/api/map/sites?world_id=${worldId}`);
    const sites = await response.json();

    sites.forEach(site => {
        const latlng = dfToLeaflet(site.x, site.y, tileSize);
        const marker = createSiteMarker(site, latlng);
        marker.bindPopup(renderSitePopup(site));
        marker.addTo(layers.sites);
    });
}
```

### 2.4 Site Marker Shapes by Type

**Requirement**: REQ-VIS-003
**Priority**: P1

```javascript
const SITE_SHAPES = {
    'Unknown': 'circle', 'Cave': 'circle', 'Lair': 'circle', 'Camp': 'circle',
    'Monastery': 'triangle', 'Fort': 'triangle', 'Tomb': 'triangle',
    'Hillocks': 'square', 'Hamlet': 'square',
    'Fortress': 'pentagon', 'ForestRetreat': 'pentagon', 'Town': 'pentagon', 'DarkPits': 'pentagon',
    'MountainHalls': 'hexagon', 'Castle': 'hexagon', 'DarkFortress': 'hexagon',
    'Vault': 'star', 'Labyrinth': 'star', 'Shrine': 'star', 'Tower': 'star', 'ImportantLocation': 'star',
};

function createSiteMarker(site, latlng) {
    const shape = SITE_SHAPES[site.type] || 'circle';
    const color = site.owner_entity_id ? getCivColor(site.owner_entity_id) :
                  site.is_ruin ? '#aaaaaa' : '#ffff00';

    // Use L.circleMarker for circles, L.polygon for other shapes
    if (shape === 'circle') {
        return L.circleMarker(latlng, { radius: 5, fillColor: color, fillOpacity: 0.8, color: '#333', weight: 1 });
    } else {
        const points = generateShapePoints(latlng, shape, 8);
        return L.polygon(points, { fillColor: color, fillOpacity: 0.8, color: '#333', weight: 1 });
    }
}

function generateShapePoints(center, shape, radius) {
    const sides = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, star: 10 };
    const n = sides[shape] || 6;
    const points = [];
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
        const r = (shape === 'star' && i % 2 === 1) ? radius * 0.5 : radius;
        points.push([
            center[0] + r * Math.sin(angle),
            center[1] + r * Math.cos(angle)
        ]);
    }
    return points;
}
```

### 2.5 Civilization Color System

**Requirement**: REQ-VIS-004
**Priority**: P1

```javascript
function getCivColor(entityId) {
    // HSV rotation: medium saturation for first 6, lighter for 7-12, darker for 13-18
    const idx = entityId % 18;
    const hue = (idx % 6) * 60;  // 0, 60, 120, 180, 240, 300
    let saturation, value;

    if (idx < 6) {
        saturation = 0.7; value = 0.8;  // medium
    } else if (idx < 12) {
        saturation = 0.5; value = 0.9;  // lighter
    } else {
        saturation = 0.9; value = 0.6;  // darker
    }

    return hsvToHex(hue, saturation, value);
}
```

### 2.6 Map Search and Jump

**Requirement**: REQ-VIS-009
**Priority**: P2

```javascript
// Search overlay on map
const searchControl = L.control({position: 'topleft'});
searchControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-search');
    div.innerHTML = '<input type="text" id="map-search-input" placeholder="Search sites, regions...">';
    div.innerHTML += '<div id="map-search-results" class="dropdown"></div>';
    return div;
};
searchControl.addTo(map);

// Autocomplete + camera jump
document.getElementById('map-search-input').addEventListener('input', debounce(async (e) => {
    const results = await fetch(`/api/search?term=${e.target.value}&world_id=${worldId}&types=site,region,mountain_peak`);
    renderMapSearchResults(results, (selected) => {
        const latlng = dfToLeaflet(selected.x, selected.y, tileSize);
        map.flyTo(latlng, 1);  // Animate to location
    });
}, 200));
```

### 2.7 Site Bounding Box Display

**Requirement**: REQ-VIS-010
**Priority**: P2

```javascript
// For sites with rectangle data (e.g., "42,15:45,18")
function addSiteBoundingBox(site) {
    if (!site.rectangle) return;
    const [corner1, corner2] = site.rectangle.split(':').map(c => {
        const [x, y] = c.split(',').map(Number);
        return dfToLeaflet(x, y, tileSize);
    });
    L.rectangle([corner1, corner2], {
        color: getCivColor(site.owner_entity_id),
        fillOpacity: 0.1,
        weight: 1,
        dashArray: '5,5'
    }).addTo(layers.sites);
}
```

**River layer**: Polylines from river path coordinates.
**Construction layer**: Polylines for roads/bridges/tunnels.
**Mountain layer**: Triangle markers at peak coordinates.
**Landmass layer**: Semi-transparent rectangles from bounding box coordinates.
**Region layer**: Outline polygons color-coded by evilness (fuchsia=evil, aqua=good, white=neutral).
**Battle layer**: Red diamond markers at battle locations (from event_collections).

---

## 3. Stage 5.2: Charts and Demographics

**Duration**: 1 week
**Dependencies**: Phase 1 (population data, event counts)
**Deliverables**: Chart.js demographic and event visualizations

### 3.1 Population Charts

**Requirement**: REQ-VIS-012
**Priority**: P2

**API**: `GET /api/charts/population?world_id={wid}`

```javascript
// Population by Race doughnut chart
const popCtx = document.getElementById('population-chart').getContext('2d');
new Chart(popCtx, {
    type: 'doughnut',
    data: {
        labels: populationData.map(d => d.race),
        datasets: [{
            data: populationData.map(d => d.count),
            backgroundColor: populationData.map(d => getCivColor(d.race_idx)),
        }]
    },
    options: {
        responsive: true,
        plugins: { legend: { position: 'right' } }
    }
});
```

**Charts to build**:
- Population by race (doughnut)
- Area by overworld region type (pie)
- Living vs. dead HFs (doughnut)
- Entity count by type (bar)

### 3.2 Event Timeline Line Chart

**Requirement**: REQ-VIS-013
**Priority**: P2

**API**: `GET /api/charts/event_timeline?world_id={wid}` or `GET /api/charts/event_timeline/{entity_type}/{id}?world_id={wid}`

```javascript
// Events per year line chart
const timeCtx = document.getElementById('event-timeline').getContext('2d');
new Chart(timeCtx, {
    type: 'line',
    data: {
        labels: timelineData.map(d => `Year ${d.year}`),
        datasets: [{
            label: 'Events',
            data: timelineData.map(d => d.count),
            borderColor: '#4e79a7',
            fill: false,
            tension: 0.1,
        }]
    },
    options: {
        responsive: true,
        onClick: (e, elements) => {
            if (elements.length > 0) {
                const year = timelineData[elements[0].index].year;
                window.location.href = `/explorer/years/${year}?world_id=${worldId}`;
            }
        }
    }
});
```

**Features**:
- Appears on World summary and every entity detail page
- Clickable: click a year to navigate to events browser for that year
- Data from `SELECT year, COUNT(*) FROM history_events WHERE world_id = :wid GROUP BY year ORDER BY year`

### 3.3 Event Type Breakdown Bar Chart

**Requirement**: REQ-VIS-014
**Priority**: P3

Horizontal bar chart showing count of each event type, sorted descending.

### 3.4 World Summary Dashboard

**Requirement**: REQ-VIS-020
**Priority**: P2

**Route**: `GET /explorer/dashboard?world_id={wid}`

**Content layout**:
```
+---------------------------+-------------------+
| World Map (thumbnail)     | Quick Stats       |
| (click to full map)       | - Total events    |
|                           | - Total HFs       |
|                           | - Total sites     |
|                           | - Active civs     |
+---------------------------+-------------------+
| Population by Race        | Events Timeline   |
| (doughnut chart)          | (line chart)      |
+---------------------------+-------------------+
| Active Civilizations      | Lost Civs         |
| (list with member count)  | (gray list)       |
+---------------------------+-------------------+
| Recent Events (paginated) | Event Type Stats  |
+---------------------------+-------------------+
```

---

## 4. Stage 5.3: Genealogy and Network Graphs

**Duration**: 1-2 weeks
**Dependencies**: Phase 1 (HF family links), Phase 2 (HF detail page for embedding)
**Deliverables**: Family tree, improved ego-network, per-object mini-maps

### 4.1 Family Tree Visualization

**Requirement**: REQ-VIS-017
**Priority**: P2

**Library**: Cytoscape.js 3.31.0 with `cytoscape-dagre` layout plugin

**API**: `GET /api/charts/family_tree/{hf_id}?world_id={wid}&depth=3`

```javascript
const cy = cytoscape({
    container: document.getElementById('family-tree'),
    elements: treeData.elements,
    layout: {
        name: 'dagre',
        rankDir: 'TB',       // Top-to-bottom
        rankSep: 80,         // Vertical spacing
        nodeSep: 40,         // Horizontal spacing
    },
    style: [
        { selector: 'node', style: {
            'label': 'data(name)',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'font-size': '11px',
            'width': 40,
            'height': 40,
        }},
        // Node classes from research synthesis
        { selector: '.current', style: { 'border-style': 'dashed', 'border-color': 'orange', 'border-width': 3 }},
        { selector: '.dead', style: { 'opacity': 0.3 }},
        { selector: '.male', style: { 'background-color': '#4169e1' }},
        { selector: '.female', style: { 'background-color': '#ff69b4' }},
        { selector: '.leader', style: { 'shape': 'round-octagon' }},
        { selector: '.necromancer', style: { 'shape': 'round-hexagon' }},
        { selector: '.vampire', style: { 'shape': 'hexagon' }},
        { selector: '.werebeast', style: { 'shape': 'hexagon' }},
        { selector: '.ghost', style: { 'shape': 'hexagon', 'opacity': 0.5 }},

        // Edge styles
        { selector: 'edge[type="parent"]', style: { 'line-color': '#888', 'width': 2 }},
        { selector: 'edge[type="spouse"]', style: { 'line-color': '#e74c3c', 'line-style': 'dashed' }},
    ]
});
```

**Backend tree construction**:
```python
def build_family_tree(world_id: int, hf_id: int, depth: int = 3) -> dict:
    """Build Cytoscape.js elements for family tree centered on hf_id."""
    elements = {'nodes': [], 'edges': []}
    visited = set()

    def traverse(current_id, current_depth, direction='both'):
        if current_id in visited or current_depth > depth:
            return
        visited.add(current_id)

        hf = get_hf(world_id, current_id)
        if not hf:
            return

        # Node
        classes = []
        if current_id == hf_id: classes.append('current')
        if hf.death_year: classes.append('dead')
        if hf.sex == 'MALE': classes.append('male')
        elif hf.sex == 'FEMALE': classes.append('female')
        if hf.is_vampire: classes.append('vampire')
        if hf.is_necromancer: classes.append('necromancer')

        elements['nodes'].append({
            'data': {'id': str(current_id), 'name': hf.name, 'race': hf.race},
            'classes': ' '.join(classes)
        })

        # Traverse family links
        links = get_hf_links(world_id, current_id)
        for link in links:
            if link.link_type in ('Mother', 'Father') and direction in ('both', 'up'):
                elements['edges'].append({
                    'data': {'source': str(link.target_hf_id), 'target': str(current_id), 'type': 'parent'}
                })
                traverse(link.target_hf_id, current_depth + 1, 'up')
            elif link.link_type == 'Child' and direction in ('both', 'down'):
                elements['edges'].append({
                    'data': {'source': str(current_id), 'target': str(link.target_hf_id), 'type': 'parent'}
                })
                traverse(link.target_hf_id, current_depth + 1, 'down')
            elif link.link_type == 'Spouse':
                elements['edges'].append({
                    'data': {'source': str(current_id), 'target': str(link.target_hf_id), 'type': 'spouse'}
                })
                if link.target_hf_id not in visited:
                    traverse(link.target_hf_id, current_depth, 'down')

    traverse(hf_id, 0)
    return elements
```

**Two sizes**: 360px (embedded in HF detail page) and 720px (fullscreen modal).

### 4.2 Ego-Network Graph Polish

**Requirement**: REQ-VIS-019
**Priority**: P2

Enhance existing vis.js graph:
- 1-3 hop depth selector (radio buttons)
- Node styling by entity type (HF=circle, entity=rectangle, site=diamond)
- HF nodes styled by type flags (same color scheme as family tree)
- Node info panel (click node to show summary in sidebar)
- Performance guard: warning at 500+ nodes, refuse at 1,000+
- Node size proportional to importance_score

### 4.3 Per-Object Mini-Maps

**Requirement**: REQ-VIS-005
**Priority**: P2

**API**: `GET /api/map/mini/{entity_type}/{entity_id}?world_id={wid}`

**Implementation** (Python Pillow):
```python
def generate_mini_map(world_id: int, entity_type: str, entity_id: int,
                       size: int = 200) -> bytes:
    """Generate focused mini-map PNG highlighting an entity's location."""
    # Load base world map (thumbnail size)
    base = load_world_map_image(world_id, tile_size=2)

    # Get entity coordinates
    coords = get_entity_coords(world_id, entity_type, entity_id)
    if not coords:
        return base  # Return unmodified map

    # Crop to region around entity (with padding)
    cx, cy = coords
    crop_radius = 30  # tiles
    cropped = base.crop((
        max(0, (cx - crop_radius) * 2),
        max(0, (cy - crop_radius) * 2),
        min(base.width, (cx + crop_radius) * 2),
        min(base.height, (cy + crop_radius) * 2),
    ))

    # Highlight entity tiles
    draw = ImageDraw.Draw(cropped)
    highlight_x = (cx - max(0, cx - crop_radius)) * 2
    highlight_y = (cy - max(0, cy - crop_radius)) * 2
    draw.ellipse([highlight_x - 6, highlight_y - 6, highlight_x + 6, highlight_y + 6],
                  outline='magenta', width=2)
    draw.rectangle([highlight_x - 3, highlight_y - 3, highlight_x + 3, highlight_y + 3],
                    fill='yellow')

    # Resize to target size
    cropped = cropped.resize((size, size), Image.NEAREST)

    buffer = io.BytesIO()
    cropped.save(buffer, format='PNG')
    return buffer.getvalue()
```

### 4.4 Event Collection Hierarchy Drill-Down

**Requirement**: REQ-VIS-023
**Priority**: P2

Expandable tree visualization for event collections:
- War -> Battles -> Events
- Beast Attack -> Events
- Abduction -> Events

Using simple HTML `<details>` / `<summary>` elements with AJAX loading of child collections on expand.

---

## 5. Stage 5.4: Advanced Visualizations (P3, Can Be Deferred)

**Duration**: 1-2 weeks (optional)
**Dependencies**: Stages 4.1-4.3
**Deliverables**: D3 war diagrams, curse trees, timeline scrubber, territory overlays

### 5.1 War Chord Diagram (D3.js)

**Requirement**: REQ-VIS-015
**Priority**: P3

D3.js chord diagram showing inter-civilization conflicts. Chord width proportional to war count.

### 5.2 Warfare Graph (Force-Directed)

**Requirement**: REQ-VIS-016
**Priority**: P3

Cytoscape.js with cola layout. Nodes = civilizations and wars. Edges = attacker/defender.

### 5.3 Curse Lineage Tree

**Requirement**: REQ-VIS-018
**Priority**: P3

Trace `HfDoesInteraction` events for vampire/werebeast curse chains back to Patient Zero. Vampire: red/dark theme. Werebeast: orange theme.

### 5.4 Map Timeline Scrubber

**Requirement**: REQ-VIS-006
**Priority**: P3

Year slider showing site ownership state at any historical point. Sites recolored by historical owner. "Not yet founded" sites hidden.

### 5.5 Civilization Territory Overlays

**Requirement**: REQ-VIS-007
**Priority**: P3

Semi-transparent colored polygons from owned sites using convex hull algorithm. Toggle per-civilization.

### 5.6 Historical Eras Browser

**Requirement**: REQ-VIS-021
**Priority**: P3

Era list with name, start/end year, duration. Era detail showing major events within era.

---

## 6. Definition of Done (M5 Milestone)

### World Map
- [ ] Leaflet.js map renders with CRS.Simple
- [ ] Map image generated from region data (3 cached sizes)
- [ ] 7+ layer groups toggleable (sites, constructions, mountains, landmasses, regions, rivers, battles)
- [ ] Site markers shaped by type (6 shapes)
- [ ] Civilization color system applied consistently
- [ ] Map search with camera jump
- [ ] Site bounding box display

### Charts
- [ ] Population doughnut chart(s)
- [ ] Event timeline line chart (clickable years)
- [ ] Event type breakdown bar chart
- [ ] World summary dashboard

### Genealogy & Graphs
- [ ] Family tree (Cytoscape.js dagre, 3-gen depth, node classes)
- [ ] Ego-network graph polished (depth selector, info panel, guards)
- [ ] Per-object mini-maps on entity detail pages
- [ ] Event collection hierarchy drill-down

### Advanced (P3, may be deferred)
- [ ] War chord diagram
- [ ] Warfare graph
- [ ] Curse lineage tree
- [ ] Map timeline scrubber
- [ ] Territory overlays
- [ ] Eras browser
- [ ] War chord diagram — D3.js ribbon (LVN-P5-7)
- [ ] Alliance network graph — Cytoscape.js entity_entity_links (LVN-P5-11)
- [ ] Curse lineage tree — vampire/werebeast infection chains (LVN-P5-17)
- [ ] HF relationship web — N-hop social network with vague relationships (LVN-P5-19)

---

## Stage 5.5: Map Enhancements (LVN v3.0)

**Duration**: 2-3 weeks

Advanced map overlays and animated geographic visualizations derived from the LVN feature gap analysis (2026-03-18).

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.5.1 | REQ-LVN-MAP-002 | **Territory animation over time** — animated convex hull polygons showing civ territorial extent per year. Year slider + play/pause. Data: `entity_site_links` + `sites` coords. Leaflet time animation plugin. | Territory animation layer |
| 5.5.2 | REQ-LVN-MAP-003 | **HF migration path visualization** — "Journey Map" tab on HF detail page. Numbered waypoints from 11 event types. 6 color-coded movement types (peaceful=green, flee=yellow, kidnap=red, military=blue, diplomatic=purple, unknown=gray). Timeline scrubber. API: `GET /api/map/hf_journey/{hf_id}` | Journey Map tab + API |
| 5.5.3 | REQ-LVN-MAP-004 | **Army movement & war visualization** — animated polylines (red=attacker, blue=defender). Battle diamond markers sized by participants. Campaign trail animation. War timeline sidebar. | War animation layer |
| 5.5.4 | REQ-LVN-MAP-005 | **Migration heatmap** — Leaflet.heat plugin, HF density over time with year slider. | Heatmap layer |
| 5.5.5 | REQ-LVN-MAP-006 | **Underground explorer** — cavern depth layers (surface, cavern 1/2/3, magma sea, HFS). Depth-appropriate styling. | Underground layer selector |
| 5.5.6 | REQ-LVN-MAP-007 | **Religious spread map** — animated overlay of religion geographic expansion. Data: religion entities + temple structures + entity_entity_links RELIGIOUS. | Religion overlay |
| 5.5.7 | REQ-LVN-MAP-008 | **River system tracer** — interactive polyline with tributary connections and site proximity. | River layer |
| 5.5.8 | REQ-LVN-MAP-009 | **Trade route inference** — connect trading civ capitals with dashed lines, thickness ∝ trade event frequency. | Trade route overlay |

---

## Stage 5.6: Analytics, Dashboards & Exploration (LVN v3.0)

**Duration**: 2-3 weeks

Analytical dashboards, ranking systems, and collection browsers that provide high-level world understanding.

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 5.6.1 | REQ-LVN-ANLZ-001 | **Power rankings dashboard** — ranked civs by pop/sites/military/culture, sparkline trends, sortable | Dashboard page |
| 5.6.2 | REQ-LVN-ANLZ-002 | **Death statistics dashboard** — deaths by cause (pie), race (bar), deadliest years (line), sites/killers (tables) | Dashboard page |
| 5.6.3 | REQ-LVN-ANLZ-003 | **World records & superlatives** — oldest HF, largest battle, longest war, most prolific author, etc. | Records page |
| 5.6.4 | REQ-LVN-ANLZ-004 | **"Most Interesting" rankings** — top entities by prominence/salience scores, configurable weights | Rankings page |
| 5.6.5 | REQ-LVN-ANLZ-005 | **Megabeast tracker** — megabeasts/FBs/titans: status, kills, location, events, map overlay | Tracker page |
| 5.6.6 | REQ-LVN-ANLZ-006 | **Population trend lines** — multi-series civ pop over time from birth/death events, war period overlays | Chart component |
| 5.6.7 | REQ-LVN-ANLZ-007 | **Civilization comparison view** — radar chart of 2-4 civs across dimensions | Comparison page |
| 5.6.8 | REQ-LVN-ANLZ-008 | **Rivalry tracker** — intense rivalries via war/battle/casualty aggregation | Analytics page |
| 5.6.9 | REQ-LVN-COLL-001 | **Event collection list views** — browsable wars, battles, raids with type-specific columns, CSV export | Collection pages |
| 5.6.10 | REQ-LVN-COLL-002 | **Art form gallery** — card-layout browser for dance/musical/poetic forms | Gallery page |
| 5.6.11 | REQ-LVN-COLL-003 | **Written content library** — browsable, searchable with author/style/type filters | Library page |
| 5.6.12 | REQ-LVN-COLL-004 | **Era browser with event density** — horizontal era bars with event density heatmap | Browser page |
| 5.6.13 | REQ-LVN-COLL-005 | **World timeline browser** — full-page timeline with importance-sized event cards, filterable | Timeline page |

### Definition of Done (Stages 5.5 + 5.6)
- [ ] Territory animation plays smoothly with year slider
- [ ] HF journey map shows correct waypoints with 6 color-coded movement types
- [ ] War animation displays army movements and battle markers
- [ ] All analytics dashboards compute from live CDM data
- [ ] Collection browsers support pagination, search, filtering
- [ ] All pages responsive and load in < 3s

---

*Phase 5: Visualization PRD/Roadmap v2.0 -- 2026-03-18*
*6 Stages, 50+ Tasks, 5-7 Weeks Estimated (includes LVN v3.0 enhancements)*
