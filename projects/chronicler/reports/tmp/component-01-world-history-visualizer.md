# Component Research: World History & Demographics Visualizer

**Date**: 2026-02-25
**Component**: Main Component #1 of 6
**Scope**: Historical timelines, civilization rise/fall visualization, population demographics (pyramids, distributions, migration flows), war/conflict mapping, artifact journey tracking, site history, region visualization, family trees, entity relationship graphs, and all world-history-oriented visualization or data display.

**Sources analyzed**: planning-history.md, legendsviewer-next-research.md, legends-browsers-research.md, narrator-weblegends-research.md, df-ai-research.md, worldgen-scraping-research.md, dfhack-infrastructure-research.md, dwarven-surveyor-scripts-research.md, research-synthesis.md

---

## 1. Feature Inventory

### 1.1 Interactive World Map (Leaflet.js)

**User-facing benefit**: The centerpiece visualization. Users see their entire DF world rendered as an interactive map with zoomable, pannable navigation. Sites are visible as color-coded markers; regions show terrain types; civilizations are distinguished by color. Users can click any site to view its detail page, toggle civilization layers on/off, and explore geographic relationships between sites, regions, and civilizations.

**Code implementation approach**:
- **Library**: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection needed for DF's tile grid)
- **Map image generation**: Two options:
  1. Use DF-exported `.bmp` map file if present (convert to PNG server-side)
  2. Generate from `RegionTypeColors.BaseRegionColors` programmatically using SkiaSharp PNG or Python Pillow, drawing region tiles with slight ID-based color variation (+/-15 per channel, seeded by regionId for consistency)
  3. Three cached sizes: thumbnail (tileSize=2), default (tileSize=4), large (tileSize=10)
- **Coordinate system**: Y-axis inverted, scaled by tile size: `[(height - y) * scale, x * scale]`. This is the canonical formula used by both LegendsViewer-Next and LegendsBrowser2.
- **Base layer**: World map PNG as `L.imageOverlay` at 50% opacity
- **Scale**: 4-10 pixels per world tile
- **Zoom**: `minZoom: -2`, `maxZoom: 2`
- **Map image served**: As base64 PNG string via REST API (LV-Next pattern) or as static PNG file `/map` (LB2 pattern)
- **Backend**: FastAPI endpoint generating/serving the map image. PostgreSQL queries for site/region data.
- **Frontend**: SvelteKit/Vue component wrapping Leaflet, with reactive layer control.

**Reference tools**: LegendsViewer-Next (Leaflet.js, `Map.vue`), LegendsBrowser2 (`backend/static/js/map.js`), DwarvenSurveyor (Unity mesh renderer), weblegends (static PNG `/region.png`)

**Complexity**: L (Large)

---

### 1.2 Map Layer Groups (Toggleable)

**User-facing benefit**: Users can selectively show/hide different categories of map objects to focus on what matters: just sites, just regions, just one civilization's territory, etc. Reduces visual clutter and enables focused exploration.

**Code implementation approach**:
- Each layer is a Leaflet `L.LayerGroup` containing multiple markers/polygons
- Layer groups (each toggleable via `L.control.layers`):
  - **Sites**: Colored polygons by owning entity; gray for ruins; yellow for unowned
  - **World Constructions**: Squares for point constructions, polylines for roads/bridges/tunnels
  - **Mountain Peaks**: Triangle markers
  - **Landmasses**: Semi-transparent rectangles
  - **Regions**: Outline polygons, color-coded by evilness (fuchsia=evil, aqua=good)
  - **Evilness fill layer**: Separate from region outlines for independent toggle
  - **Rivers**: Rendered paths (polylines following river coordinates)
  - **Battle markers**: Red diamond polygons (shown on war/battle collection pages)
- Sites grouped by owner into Leaflet `LayerGroup`; "All"/"None" toggle buttons
- Custom "All"/"None" buttons toggle all layers at once (LV-Next pattern)
- API endpoints: `/api/map/sites`, `/api/map/regions`, `/api/map/constructions`, etc.

**Reference tools**: LegendsViewer-Next (`Map.vue` lines 17-261), LegendsBrowser2 (`map.js`, `worldMap.html`)

**Complexity**: M (Medium) — after base map is done

---

### 1.3 Site Marker Shapes by Type

**User-facing benefit**: Users can instantly identify site types at a glance on the map without reading labels. Different geometric shapes encode site function: circles for natural sites, triangles for religious/military, squares for settlements, etc.

**Code implementation approach**:
- Site markers rendered as custom polygon shapes based on site type enum:
  ```
  Circle: Unknown, Cave, Lair, Camp
  Triangle: Monastery, Fort, Tomb
  Square (small): Hillocks, Hamlet
  Pentagon: Fortress, ForestRetreat, Town, DarkPits
  Hexagon (large): MountainHalls, Castle, DarkFortress
  Star: Vault, Labyrinth, Shrine, Tower, ImportantLocation
  Pentagon (blue): MysteriousDungeon
  Hexagon (blue): MysteriousPalace
  ```
- Marker colors: owning civilization's generated color (`Entity.LineColor`)
- Ruins: gray (`#aaa`); unowned: yellow (`#ff0`)
- Implementation: Leaflet `L.polygon` with computed vertex arrays for each shape type

**Reference tools**: LegendsViewer-Next (`Map.vue`), LegendsBrowser2 (`map.js`)

**Complexity**: S (Small)

---

### 1.4 Civilization Color System

**User-facing benefit**: Consistent color coding across the entire application lets users instantly associate sites, map markers, warfare graphs, and list items with their parent civilization. Reduces cognitive load when exploring cross-civilization relationships.

**Code implementation approach**:
- HSV rotation algorithm: Medium saturation for first 6 races, lighter for 7-12, darker for 13-18
- Applied consistently across: map markers, warfare graph nodes, civilization list items, entity detail pages
- Each entity type has `Color()` and `Icon()` methods/properties
- Colors computed once at world load and cached
- Colors assignable per-race using HSV space with progressive hue rotation
- Optional: user-customizable race colors via `jscolor` picker (LegendsBrowser v1 feature)
- Implementation: Python utility function `generate_civ_colors(entities)` returning `{entity_id: hex_color}` dict, served via API

**Reference tools**: LegendsViewer-Next (`World.GenerateCivColors()`), LegendsBrowser v1 (jscolor picker), LegendsBrowser2 (`Color()` method)

**Complexity**: S (Small)

---

### 1.5 Per-Object Mini-Maps

**User-facing benefit**: When viewing any entity detail page (a site, region, historical figure's home, etc.), a small focused map highlights that object's location within the broader world context. Users never lose spatial orientation.

**Code implementation approach**:
- For each entity detail page, generate a smaller static map focused on the object's location
- Object's tiles highlighted in Magenta; yellow/red oval drawn around the focus area
- Map served from backend: `/api/map/{type}/{id}` returning base64 PNG
- LegendsViewer-Next generates these via `WorldMapImageGenerator.cs` with object-specific highlighting
- Implementation: Python Pillow or SkiaSharp-equivalent to draw on the cached world map image

**Reference tools**: LegendsViewer-Next (`WorldObjectPage.vue`, `WorldMapImageGenerator.cs`), weblegends (`render_map_coords()`)

**Complexity**: M (Medium)

---

### 1.6 Map Timeline Scrubber

**User-facing benefit**: Users can "rewind" the world map to see what it looked like at any point in history. Watch civilizations expand and contract, sites change hands, ruins appear. A slider control lets users scrub through world years and see the map update.

**Code implementation approach**:
- Timeline slider component (year range: world start to current year)
- For each year, compute site ownership state from `OwnerHistory` / `OwnerPeriod` records
- Recolor site markers based on historical ownership at selected year
- Mark sites as "not yet founded" (hidden) or "destroyed" (gray) based on timeline position
- Requires: site creation/destruction event timestamps, site ownership history with year ranges
- Data source: `history_events` where type IN ('created site', 'destroyed site', 'site taken over', 'reclaim site'), plus `sites.owner_history` JSONB field
- API: `/api/map/state?year=N` returning site ownership map at year N
- Frontend: Range slider with year labels, debounced API calls on drag

**Reference tools**: Planning-history.md Section 3.1 ("Timeline Scrubber: See the map at any world year")

**Complexity**: L (Large)

---

### 1.7 Civilization Territory Overlays

**User-facing benefit**: Visual representation of which civilizations control which territories, overlaid on the world map. Users can see the geopolitical landscape at a glance — critical for understanding wars, migrations, and diplomatic relationships.

**Code implementation approach**:
- Overlay colored polygons/regions showing civilization territorial control
- Territory computed from: sites owned by each entity + surrounding region tiles
- Semi-transparent fill with civilization color
- Toggle per-civilization (integrated with existing layer control)
- May use convex hull or alpha shape algorithm around entity's controlled sites
- API: `/api/map/territories?year=N` returning GeoJSON-like territory boundaries

**Reference tools**: Planning-history.md Section 3.1 ("Civ Territory Overlays")

**Complexity**: L (Large)

---

### 1.8 Worldgen Live Map Preview

**User-facing benefit**: During world generation, users can watch the map form in real-time as terrain phases complete. This is an entirely novel feature — no existing tool provides this.

**Code implementation approach**:
- During worldgen, `worldgen-bridge.lua` polls `df.global.world.world_data` (when available)
- `region_map` is a `world_width x world_height` 2D array of `region_map_entry` (each has elevation, rainfall, temperature, volcanism, evilness)
- Read this grid during terrain generation phases and render progressive map
- Large regions require chunked rendering (>10,000 tiles split into multiple render chunks)
- Viewport culling for performance
- The `regionDataMap[x,y]` lookup array enables O(1) hover detection
- Y-axis flip handling for DF's inverted Y coordinate system
- WebSocket push from watcher to frontend for progressive updates
- `world_data` pointer may be nil before terrain begins — wrapped in `pcall` guard

**Reference tools**: worldgen-scraping-research.md (Finding 5: `world_data` populated during terrain phase), DwarvenSurveyor (region mesh rendering approach)

**Complexity**: XL (Extra Large)

---

### 1.9 Map Search and Jump

**User-facing benefit**: Users can search for a site or region by name and instantly jump the camera to that location. Essential for worlds with thousands of sites.

**Code implementation approach**:
- Search input field overlaid on map
- Autocomplete suggestions from `/api/search?term=X&types=site,region`
- On selection, call `map.setView([lat, lng], zoom)` to center on the target
- Use the object's centroid coordinates for camera targeting (DwarvenSurveyor `MeshCenterFinder.cs` pattern)
- For regions: compute centroid from region tile coordinates
- For sites: use site `coord` or `rectangle` center

**Reference tools**: DwarvenSurveyor (`SearchButtonCameraJump.cs`), LegendsBrowser2 (search endpoint)

**Complexity**: S (Small)

---

### 1.10 Site Bounding Box Display

**User-facing benefit**: Shows the actual spatial extent of a site on the map, not just a single point marker. Sites in DF can span multiple tiles; showing the full rectangle gives users accurate spatial context.

**Code implementation approach**:
- Each site has a `rectangle` field (4-corner bounding box in world tiles): `xMin:yMin,xMax:yMax`
- Render as a semi-transparent `L.rectangle` overlay in addition to the single `coord` marker
- Rectangle scaled to world tile coordinates
- Parse from site data: `rectangle` string parsed to `[xMin, yMin, xMax, yMax]`

**Reference tools**: DwarvenSurveyor (SiteData `rectangle` field), LegendsViewer-Next (Site `Rectangle` property)

**Complexity**: S (Small)

---

### 1.11 Hover Popovers (Map and All Entity Links)

**User-facing benefit**: Hovering over any entity reference (link, map marker) shows a compact preview without navigating away from the current page. Critical UX feature for exploration — users can browse context without losing their place.

**Code implementation approach**:
- Every entity hyperlink (`a.hf`, `a.entity`, `a.site`, etc.) triggers a popover on hover
- Content fetched from `/api/popover/{type}/{id}` endpoint returning compact HTML snippet
- **HF popover**: name, race, sex, birth/death, type flags (deity, vampire, etc.)
- **Site popover**: name, type, owner entity
- **Entity popover**: name, type, race
- **Artifact popover**: name, material, current holder
- **Region popover**: name, type, evilness
- Implementation: Bootstrap 5 popovers (LB2 pattern) or Tippy.js (LV-Next WarfareGraph pattern)
- Ajax fetch on hover event, cached for session
- Map markers: `L.bindTooltip()` + `L.bindPopup()` calling `urlToolTip(type, id)` which fetches `/popover/{type}/{id}` HTML

**Reference tools**: LegendsBrowser2 (Bootstrap popover, `layout.html`), LegendsBrowser v1 (Bootstrap popover), weblegends (no popovers but full link context)

**Complexity**: M (Medium)

---

### 1.12 Population Charts — Doughnut/Pie

**User-facing benefit**: At-a-glance demographic overview of the world. Users instantly see which races dominate, how populations distribute across civilizations, and the relative land area of different biome types.

**Code implementation approach**:
- **Doughnut chart: Population by Race** — Count of living historical figures or entity population aggregates, grouped by race. Data endpoint: `/api/world/population`
- **Doughnut chart: Area by Overworld Regions** — Count of region tiles by type. Data endpoint: `/api/world/regions`
- Library: Chart.js via `vue-chartjs` 5.3.2 wrapper (LV-Next pattern) or D3.js donut (LB1 pattern)
- D3 population donut: at-a-glance demographic view with count labels
- Race colors from civilization color system
- Placed on World Summary Dashboard / Home Page

**Reference tools**: LegendsViewer-Next (`DoughnutChart.vue`, Chart.js 4.4.8), LegendsBrowser v1 (`indexPop.vm`, D3.js v3 donut)

**Complexity**: S (Small)

---

### 1.13 Event Timeline — Line Chart (Events per Year)

**User-facing benefit**: Users see the tempo of history — when was the world most active? Where are the peaceful periods? When did wars cluster? A line chart of events per year reveals the narrative arc of the entire world.

**Code implementation approach**:
- Line chart: Events per year plotted as a line for each object's event history
- Appears on: World summary page and every object detail page (inside ExpandableCard "Events" section)
- Data served from `/api/{type}/{id}/eventchart` (LV-Next pattern)
- Return format: `{ labels: [year1, year2, ...], data: [count1, count2, ...] }`
- Library: Chart.js line chart via `vue-chartjs` or Observable Plot
- Can show multiple series: total events, deaths, wars, etc.
- Clickable: clicking a year range zooms to that period in the Events tab

**Reference tools**: LegendsViewer-Next (`LineChart.vue`, `BarChart.vue`)

**Complexity**: M (Medium)

---

### 1.14 Event Type Breakdown — Bar Chart

**User-facing benefit**: Users see what kinds of events dominate an entity's history — was this site defined by wars, cultural achievements, or political intrigue? Helps users understand the character of a place or figure.

**Code implementation approach**:
- Bar chart: Count of each distinct event type for an object
- Appears in the expanded view of the Events card on detail pages
- Data served from `/api/{type}/{id}/eventtypechart`
- Return format: `{ labels: ["hf died", "created site", ...], data: [count1, count2, ...] }`
- Horizontal bar chart sorted by count descending
- Library: Chart.js bar chart

**Reference tools**: LegendsViewer-Next (`BarChart.vue`)

**Complexity**: S (Small)

---

### 1.15 D3 War Chord Diagram

**User-facing benefit**: At-a-glance visualization of which civilizations fought which others, and how intensely. Users see the web of conflicts across the world's history in a single elegant diagram.

**Code implementation approach**:
- D3.js v3+ chord/ribbon diagram
- Each civilization is an arc segment; chords connect warring civilizations
- Chord width proportional to number of wars/battles between the pair
- Hover highlights related chords
- Civilizations colored by civilization color system
- Data: `/api/world/war-matrix` returning N x N matrix of war counts between civilizations
- Implementation: D3 `d3.layout.chord()` with custom rendering
- Placed on: Civilizations index page (Wars tab), World Summary

**Reference tools**: LegendsBrowser v1 (`indexWars.vm`, D3.js v3 chord diagram)

**Complexity**: M (Medium)

---

### 1.16 Warfare Graph (Force-Directed Network)

**User-facing benefit**: Interactive network visualization showing the structure of wars and battles — which civilizations attacked which, how battles connect through shared participants, and the overall conflict topology.

**Code implementation approach**:
- Library: Cytoscape.js with `cytoscape-cola` layout (force-directed physics)
- Nodes: Civilizations (round-hexagon shape) and battles/wars (roundrectangle shape)
- Edges: Show attack/defense relationships
- Edge labels and widths proportional to battle size
- Edge tooltips via `tippy.js` 6.3.7 on hover
- Clickable: tap node/edge to navigate to the respective entity or battle
- Appears on War and Entity detail pages
- Data: `/api/entity/{id}/warfare-graph` returning Cytoscape-compatible graph JSON

**Reference tools**: LegendsViewer-Next (`WarfareGraph.vue`, Cytoscape.js cola layout)

**Complexity**: M (Medium)

---

### 1.17 Family Tree Visualization

**User-facing benefit**: Genealogy is one of the most compelling aspects of DF worlds. Users can see multi-generational family trees with visual cues for gender, status (alive/dead), special types (vampire, necromancer, leader), and navigate the tree by clicking nodes.

**Code implementation approach**:
- **Library**: Cytoscape.js 3.31.0 with `cytoscape-dagre` layout plugin (hierarchical DAG, top-to-bottom)
- **Backend generation**: API endpoint that traverses HF links (mother/father/child) up to 3 generations in each direction (separate depth counters for mother and father lines). Children included without depth limit.
- **Graph structure**:
  - Nodes: One node per HF in the family tree
  - Edges: Directed from parent to child. Direction: `mother.id -> current.id`, `father.id -> current.id`, `current.id -> child.id`
  - Current HF gets class `current` (dashed orange border)
- **Node visual classes**:
  - `current`: Dashed orange border
  - `dead`: 30% opacity
  - `male`: Blue background
  - `female`: Magenta background
  - `leader`: Round-octagon shape with crown icon (base64 PNG background)
  - `necromancer`: Round-hexagon with skull icon
  - `vampire`: Hexagon with vampire icon
  - `werebeast`: Hexagon with wolf icon
  - `ghost`: Hexagon with ghost icon
- **Node label format**:
  ```
  [race prefix if different]
  [assignment/title]
  -- * ----------
  [highest skill rank + name]
  ----------------
  [HF name]

  Age: N   (or "Age: N+" if dead)
  ```
- **Interaction**: Click a node to navigate to that HF's detail page
- **Display**: Two sizes -- compact (360px height) and fullscreen (720px), toggled via ExpandableCard wrapper
- **Relationship types traced**: Mother, Father, Child. (Spouse, Lover, Companion appear in RelatedHistoricalFigureList instead)
- **Depth limit**: Max 3 ancestors deep on each of mother and father lines (LV-Next constraint, prevents infinite recursion on large dynastic trees)
- **Alternative**: SVG custom family tree (LB1 pattern) with custom layout algorithm (`FamilyMember.layout()`, `layoutUp()`, `layoutDown()`), rendered nodes as `<rect>` elements (blue=male, pink=female, gold=deity, highlighted=self), edges as `<polyline>` elements

**Reference tools**: LegendsViewer-Next (`FamilyTree.vue`, `HistoricalFigureExtensions.cs:12-200`), LegendsBrowser v1 (`hffamily.vm`, SVG tree)

**Complexity**: L (Large)

---

### 1.18 Curse Lineage Tree

**User-facing benefit**: For vampires and werebeasts, trace the "who bit whom" chain all the way back to the original cursed figure. This is compelling narrative content unique to DF.

**Code implementation approach**:
- Separate visualization from family tree (same rendering engine, different data)
- Traces `HfDoesInteraction` events for `DEITY_CURSE_WEREBEAST_*` and `DEITY_CURSE_VAMPIRE_*` interactions
- Tree traces upward to find Patient Zero (the original curse source)
- Uses same SVG/Cytoscape engine as family tree but different coloring
- Vampire nodes: red/dark theme; Werebeast nodes: orange/fur theme
- Shows: curse date, "since" year, interaction text
- Data: `/api/hf/{id}/curse-lineage` returning tree of HF interactions
- Backend query: follow `hf_does_interaction` events backward through `target_hfid` -> `doer_hfid` chains

**Reference tools**: LegendsBrowser v1 (`hffamily.vm` curse tree section), LegendsViewer-Next (`LineageCurseParent` field on HistoricalFigure)

**Complexity**: M (Medium)

---

### 1.19 Entity Relationship Graph (vis.js Ego Network)

**User-facing benefit**: Interactive network graph showing how a historical figure, entity, or site connects to others through relationships, memberships, and events. Users can explore the web of connections by expanding nodes.

**Code implementation approach**:
- **Library**: vis.js with forceAtlas2Based physics
- **Already partially built**: Explorer Graph tab with search box, typeahead, world selector, depth selector (1-3 hop)
- **Node styling**:
  - HF (default): stone
  - HF (deity): gold
  - HF (vampire): red
  - HF (necromancer): purple
  - HF (werebeast): orange
  - HF (ghost): slate
  - Entity (civilization): diamond blue
  - Entity (religion): diamond purple
  - Site: square green
- **Edge colors**: family=green, spouse=pink, enemy=red, membership=blue dashed, site link=lime dashed
- **Performance guard**: Node count badge; warning at 500+ nodes; refuse expansion at 1,000+ nodes
- **Node info panel**: Click-to-expand with detail card
- **Data**: `/api/graph/{type}/{id}?depth=N` returning vis.js-compatible graph JSON

**Reference tools**: Planning-history.md Section 3.2 (Graph Tab), existing Chronicler Explorer Graph tab

**Complexity**: S (Small) — already partially built, needs polish

---

### 1.20 World Summary Dashboard / Home Page

**User-facing benefit**: Landing page giving users a comprehensive overview of the world at a glance: population breakdown, active civilizations, recent events, and a thumbnail map linking to the full interactive map.

**Code implementation approach**:
- **World map thumbnail**: Links to full interactive map
- **Population by Race doughnut chart** and **Area by Overworld Regions doughnut chart**
- **Active Civilizations card list** (with civilization color indicators)
- **Lost Civilizations card list**
- **Events section**: Line chart + paginated event table
- **Chronicles section**: Paginated event collection table
- **Heroic Ties card**: Player-related objects (adventurer HFs, their factions, sites)
- **World statistics summary**: Years of recorded history, site count by type, civilization count, HF count, event count, artifact count
- **Entities grouped by race**: Showing only civilization-type entities and necromancer groups
- API: `/api/world/summary` returning all dashboard data in a single aggregated response

**Reference tools**: LegendsViewer-Next (`World.vue`), LegendsBrowser2 (`index.html`)

**Complexity**: M (Medium)

---

### 1.21 Historical Eras Browser

**User-facing benefit**: Users can browse the named eras of world history (Age of Myths, Age of Heroes, etc.) and see what defined each era — the events that began and ended it, the dominant civilizations, the major figures.

**Code implementation approach**:
- List view: `/era` — all eras with name, start/end year, duration
- Detail view: `/era/:id` — era name, start/end events, all events within the era
- Events assigned to eras based on year range
- CDM table: `historical_eras` (world_id, id, name, type, start_year, end_year)
- API: `/api/eras`, `/api/eras/{id}`, `/api/eras/{id}/events`
- Era end years computed from next era's start or world current year

**Reference tools**: LegendsViewer-Next (`/era/:id` route), LegendsBrowser2 (no dedicated era page)

**Complexity**: S (Small)

---

### 1.22 Years and Events Browser

**User-facing benefit**: Chronological index of all events. Users can browse history year by year, seeing all events that occurred in any given year rendered as narrative sentences.

**Code implementation approach**:
- `/years` — Lists all years with event counts, grouped by era
- `/year/{id}` — All events that occurred in that year, rendered as narrative sentences
- `/events` — All known event types as a list (meta-page for exploring event taxonomy)
- `/events/{type}` — All events of a given type, chronologically
- `/event/{id}` — Individual event detail
- Season display in event timestamps: "early spring of 125" using DF calendar conversion
- Events grouped by year, then within a year by weeks (every 7-day DF period) for readability
- Pagination: 1000 events per page (weblegends pattern)

**Reference tools**: LegendsBrowser2 (`years.html`, `year.html`, `eventTypes.html`, `eventType.html`), weblegends (1000 events/page pagination)

**Complexity**: M (Medium)

---

### 1.23 Event Collection Hierarchy (Wars, Battles, Sieges)

**User-facing benefit**: Wars are structured as nested hierarchies — a war contains battles, a battle contains individual combat events. Users can drill down from the macro (a multi-decade war) to the micro (who killed whom in a specific battle).

**Code implementation approach**:
- **19 EventCollection types** parsed and displayed:
  - Warfare: battle, war, duel, raid, site conquered
  - Political: insurrection, persecution, purge, entity overthrown (coup)
  - Calamities: beast attack, abduction, theft
  - Rituals: occasion, procession, ceremony, performance, competition
  - Travel: journey
- **War collection page**: Map showing all sites of both entities plus all battle markers. Expandable list of sub-collections (battles), each with their own events
- **Battle collection page**: Shows squads, attackers/defenders, outcome. Coords for map marker.
- **Beast attack**: Derives `AttackerHfIds` by scanning member events. Text: "the second rampage of [creature] in [site]"
- **Abduction**: Derives `TargetHfids` from member `HfAbducted` events
- All collections show: map with relevant markers, sub-collections, and all member events
- Data: `/api/collections`, `/api/collections/{id}`, `/api/collections/{id}/events`
- Sub-collection nesting: `event_ids_json` and `subcollection_ids_json` in CDM

**Reference tools**: LegendsBrowser2 (`collections.go`, `collection.html`, `collectionDetail.html`), LegendsViewer-Next (19 EventCollection types)

**Complexity**: L (Large)

---

### 1.24 Artifact Journey Tracking

**User-facing benefit**: Track the "chain of custody" for legendary artifacts — who created it, who held it, where it traveled, when it was lost or stolen. This is inherently narrative content that tells stories across centuries.

**Code implementation approach**:
- Artifact detail page showing chronological journey
- Events filtered to artifact-relevant types:
  ```
  artifact created, artifact given, artifact lost, item stolen,
  artifact possessed, artifact stored, artifact recovered,
  artifact found, artifact destroyed, artifact transformed,
  artifact copied, artifact claim formed
  ```
- Chronological sort by (year, seconds72)
- Display format: timeline with year markers and event descriptions
- Each event shows: year, event type, involved HF (linked), location (linked)
- Artifact importance score: `(events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named`
- Additional fields: item description, material, item type/subtype, page count, contained written content, current location (site), current holder (HF)
- Map integration: Show artifact locations on a mini-map with movement arrows

**Reference tools**: df-narrator (artifact scoring, journey section in output), LegendsViewer-Next (Artifact detail page), LegendsBrowser2 (`artifact.html`)

**Complexity**: M (Medium)

---

### 1.25 Site History and Ownership Timeline

**User-facing benefit**: Every site has a rich history of ownership changes, construction, destruction, and events. Users see who founded it, who conquered it, when it fell to ruin, and who reclaimed it — all as a navigable timeline.

**Code implementation approach**:
- Site detail page tabs: Structures, Properties, History
- **Structures tab**: Table of all structures within the site (name, type, ruin status)
- **Properties tab**: Site properties (owner HF, type, linked structure)
- **History tab**: Site-level history events (created, taken over, destroyed, reclaimed)
- **Ownership history**: `OwnerPeriod` records showing who owned the site over time, displayed as a timeline
- **Site populations**: World populations (animal populations), named HF inhabitants (via nemesis records), anonymous populations with counts and entity/civ affiliations
- **Artifacts at site**: Currently stored artifacts
- **Related entities**: Entities with site links (capital, holy_city, monument, base_of_operation, residence, criminal_gang)
- Mini-map centered on site
- Full event list for the site with all `RelatedToSite(id)` events

**Reference tools**: LegendsViewer-Next (`Site.vue`), LegendsBrowser2 (`site.html`), weblegends (`render_site.cpp`)

**Complexity**: M (Medium)

---

### 1.26 Region Visualization

**User-facing benefit**: Browse geographic regions with terrain type, evilness rating, and associated events. See which regions are evil, which are good, and what happened there.

**Code implementation approach**:
- Region detail page: name, type, evilness (good/evil/neutral), map highlight
- Underground region detail: name, type, depth
- Landmass detail: name, coordinate bounds, map highlight
- Mountain peak detail: name, coords, volcano flag, map marker
- River detail: name, list of paths, map rendering
- Region types color-coded on map: 10 biome types (Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains) with distinct materials/colors
- Evilness overlay: fuchsia=evil, aqua=good
- Full event history per region
- API: `/api/regions`, `/api/regions/{id}`, `/api/regions/{id}/events`

**Reference tools**: DwarvenSurveyor (10 biome materials), LegendsViewer-Next (geography routes), LegendsBrowser2 (`region.html`, `geography.html`)

**Complexity**: M (Medium)

---

### 1.27 Entity Importance Scoring System

**User-facing benefit**: Not all entities are equally interesting. Scoring surfaces the most narrative-worthy figures, sites, wars, and artifacts, enabling both the LLM and UI to prioritize what to show.

**Code implementation approach**:
- **Figure Importance Score** (df-narrator canonical):
  ```python
  def score_figure(hfid, hf, event_counts, kill_counts, artifact_by_holder):
      s = min(event_counts.get(hfid, 0) * 2, 500)   # events x 2, capped at 500
      s += kill_counts.get(hfid, 0) * 15              # kills x 15
      if hf.get("vamp"):  s += 80                     # VAMPIRE bonus
      if hf.get("necro"): s += 100                    # NECROMANCER bonus
      if hf.get("deity"): s += 120                    # DEITY bonus
      if hf.get("force"): s += 90                     # FORCE bonus
      if hf.get("mega"):  s += 70                     # MEGABEAST bonus
      s += min(len(hf.get("hf_links", [])) * 3, 100)  # HF relationships, cap 100
      s += sum(20 for el in hf.get("entity_links", [])
               if el["type"] in ("position", "former_position", "position_claim"))
      s += len(artifact_by_holder.get(hfid, [])) * 30  # artifacts held x 30
      s += len(hf.get("spheres", [])) * 10             # deity spheres x 10
      skills = hf.get("skills", [])
      if skills:
          s += min(len(skills) * 2 + max(x["ip"] for x in skills) // 5000, 80)
      s += min(len(hf.get("site_links", [])) * 5, 50)
      s += min(len(hf.get("entity_links", [])) * 3, 60)
      if hf.get("death_year", "-1") != "-1": s += 5
      return s
  ```
- **Site Importance Score**: `events + (deaths * 2) + (event_collections * 5) + (structures * 3)`
- **Conflict Importance Score**: `(deaths * 3) + (battles * 10) + (sites_involved * 5) + duration_years`
- **Artifact Importance Score**: `(events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named`
- Store as `importance_score` column on CDM tables, computed on ingestion and updated per watcher cycle
- Used for: LLM context selection (top-N by score), default sort order in list views, NVS computation

**Reference tools**: df-narrator (`df_narrator.py` lines 51-111), research-synthesis.md Section 6

**Complexity**: M (Medium)

---

### 1.28 Rivalry Detection (Co-Appearance)

**User-facing benefit**: Surfaces meaningful figure pairs — rivals, allies, nemeses — based on how often they appear in the same events. Tells users "these two had a complicated history" without requiring them to read through thousands of events.

**Code implementation approach**:
- Scan all events mentioning a figure's hfid
- Count co-appearances of other figure IDs in the same event (using `HF_FIELDS` set)
- `HF_FIELDS = { 'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid', 'changee_hfid', 'changer_hfid', 'woundee_hfid', 'wounder_hfid', 'doer_hfid', 'target_hfid', 'attacker_hfid', 'defender_hfid', 'hist_fig_id', 'body_hfid', 'hfid_target', 'hfid_attacker', 'hfid_defender', 'trickster_hfid', 'cover_hfid', 'student_hfid', 'teacher_hfid', 'trainer_hfid', 'seeker_hfid' }`
- Overlay formal relationship type if it exists from `hf_links`
- Compute among top-scored figures set, not globally
- Top 10 rivals per figure, top 5 rivals used for pair ranking, top 10 pairs output
- Display: "Notable Rivalries and Alliances" section on World Summary and HF detail pages
- API: `/api/hf/{id}/rivals`, `/api/world/rivalries`

**Reference tools**: df-narrator (rivalry detection in `find_rivals_inline`)

**Complexity**: M (Medium)

---

### 1.29 Event Rendering Pipeline (Narrative Sentences)

**User-facing benefit**: Events are displayed as human-readable narrative sentences with clickable entity links, not raw data fields. "In 125, the dwarf Urist was slain by the goblin Snodub in the siege of Boatmurdered" instead of `{type: "hf died", hfid: 123, slayer_hfid: 456}`.

**Code implementation approach**:
- **Pattern**: `Event (CDM row) -> Context (target entity + related entities) -> Template (per-type prose) -> HTML (with entity links)`
- **115-132 event types** need narrative templates
- **Cross-linking**: Every entity reference in every event becomes a clickable HTML anchor: `<a href="/hf/123" title="...">the dwarf Urist</a>`
- **Context-aware rendering** (from LB2/weblegends): When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns, while other entities remain fully linked
- **Death cause rendering**: 40+ specific death cause variants with specific prose (OLD_AGE -> "died of old age", BEHEAD -> "was beheaded", DRAIN_BLOOD -> "was drained of blood", etc.)
- **Circumstance/Reason fields**: Additional context for why events happened:
  - Reasons: "in order to glorify [HF]", "as a symbol of everlasting peace", etc.
  - Circumstances: "after the death of [HF]", "after a nightmare", "from afar", etc.
- **Season display**: "In early spring of 125" using DF calendar conversion
- **Interaction text**: For `hf_does_interaction` events, pull text from `hist_string_1` / `hist_string_2` (game raw data) for vampire biting, necromancer raising, etc.
- **Missing event fallback**: Use DF's own `getSentence()` method via DFHack, or LLM interpretation of raw JSONB fields

**Reference tools**: weblegends (94 event handlers, `event_link()` pattern), LegendsBrowser2 (132 event `Html()` implementations), LegendsViewer-Next (event `Print()` methods)

**Complexity**: XL (Extra Large)

---

### 1.30 DF Calendar Utility

**User-facing benefit**: All dates displayed using DF's in-game calendar (Granite, Slate, Felsite, etc.) and seasons (early spring, mid summer, late autumn), matching what players see in-game.

**Code implementation approach**:
```python
# seconds72 -> calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

months = ["Granite", "Slate", "Felsite",      # Spring
          "Hematite", "Malachite", "Galena",   # Summer
          "Limestone", "Sandstone", "Timber",  # Autumn
          "Moonstone", "Opal", "Obsidian"]     # Winter

season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```
- Age calculation at death: `age_years_days(born_year, born_seconds, died_year, died_seconds)`
- Fractional ages displayed as: 1/4, 1/2, 3/4 if days >= 28*3, 28*6, 28*9

**Reference tools**: df-narrator (`format_time()` in `df_legends_common.py`), weblegends (`helpers/event.cpp`), LegendsBrowser2 (`functions.go` time formatting)

**Complexity**: S (Small)

---

### 1.31 Worldgen Progress Dashboard

**User-facing benefit**: Watch world generation progress in real-time with live counters showing civilization count rising, event accumulation curves, era transitions, and phase progression. First-ever real-time worldgen dashboard for DF.

**Code implementation approach**:
- Reads from `worldgen_snapshots` CDM table, populated by `worldgen-bridge.lua`
- Dashboard shows:
  - Current generation phase (0-10 with named states: Initializing, PreparingElevation, SettingTemperature, RunningRivers, FormingLakesAndMinerals, GrowingVegetation, VerifyingTerrain, ImportingWildlife, RecountingLegends, Finalizing, Done)
  - Progress counters: rivers_cur/total, civ_count, civs_left_to_place, rampage_num, num_rejects
  - Phase completion flags: placed_caves, placed_good_evil, placed_megabeasts, finished_prehistory
  - Live history accumulation: figure_count, event_count, era_count, entity_count
  - Geography: region_count, site_count, landmass_count, river_count, geo_biome_count
  - World parameters: seed, title, dimensions, end_year
- Charts: Line charts showing figure_count, event_count, entity_count over time
- Phase indicator: Progress bar or state machine visualization
- Auto-refresh via WebSocket or SSE
- API: `/api/worldgen/current`, `/api/worldgen/history`

**Reference tools**: worldgen-scraping-research.md (complete `worldgen-bridge.lua` implementation template)

**Complexity**: L (Large)

---

### 1.32 Cross-Linked Entity Navigation

**User-facing benefit**: Every mention of every entity throughout the application is a clickable link that navigates to that entity's detail page. The entire application becomes a hyperlinked encyclopedia.

**Code implementation approach**:
- **Server-side HTML generation** (LV-Next pattern): Each WorldObject generates `<a href="/hf/123" title="...">the dwarf Urist</a>` via `ToLink()` method
- **Frontend injection**: `v-html` or equivalent to render server-generated HTML
- **Navigation**: Standard `href` navigation or SvelteKit client-side routing
- **Prev/Next navigation**: FABs that navigate to adjacent entity IDs (LV-Next `WorldObjectPage.vue`)
- **Tab state persistence**: URL hash saves and restores active tab on page load
- **Breadcrumb**: Navigate back through browsing history
- **Cross-tab navigation**: Clicking a name in any tab navigates to the relevant tab's detail view (People -> Civilizations -> Geography -> Events)
- **"View graph" buttons**: Throughout domain views, link to the Graph tab centered on that entity

**Reference tools**: LegendsViewer-Next (cross-linking via `ToLink()`, `HtmlStyleUtil.GetAnchorString()`), LegendsBrowser2 (context-aware `hf()`, `entity()`, `site()` template functions), weblegends (`link()`, `event_link()`)

**Complexity**: M (Medium)

---

### 1.33 Global Search with Autocomplete

**User-facing benefit**: Users can find any entity in the world by name — historical figures, sites, civilizations, artifacts, regions — with instant suggestions as they type.

**Code implementation approach**:
- Search input in top navigation bar
- Autocomplete: `/api/search?term=X` returning JSON `[{label, name, type, id}]`, max 50 results
- Substring match (case-insensitive) across: historical figures, entities, sites, structures, regions, artifacts, world constructions, art forms, written contents, landmasses, mountain peaks
- Accent-insensitive: `unaccent(name) ILIKE unaccent($1)` with PostgreSQL `unaccent` extension
- Search results page: categorized results with counts per category
- Navigate to detail page on selection
- DF Wiki link: Optional "Search DF Wiki" button for external reference

**Reference tools**: LegendsBrowser2 (`search.go`, `autocomplete.js`), LegendsViewer-Next (`WorldObjectsPage.vue` search)

**Complexity**: M (Medium)

---

### 1.34 Paginated Server-Side Data Tables

**User-facing benefit**: List views for all entity types with server-side search, pagination, and sorting. Handle worlds with 60,000+ historical figures without browser performance issues.

**Code implementation approach**:
- Common component: `WorldObjectsPage` with server-side search
- Free-text search field bound to reactive state
- Pagination: server-side via data table component. Items per page: 10, 25, 50, 100
- Sorting: column-level, passed as `sortKey` + `sortOrder` query params
- Table columns by entity type:
  - HFs: Id, Name (linked), Type (race), Caste, Events count
  - Sites: Id, Name, Type, Subtype, Events
  - Entities: Id, Name, Type, Subtype, Events
  - Wars: Start, End, Name (linked), Type, Events
  - Artifacts: Id, Name, Type, Material, Events
- API pattern: `/api/{type}?search=X&page=N&pageSize=M&sortKey=K&sortOrder=asc|desc`
- Response: `{ items: [...], totalCount: N }`
- Pinia stores (or SvelteKit stores) cache loaded objects within session

**Reference tools**: LegendsViewer-Next (`WorldObjectsPage.vue`, `v-data-table-server`), LegendsBrowser2 (server-rendered tables)

**Complexity**: M (Medium)

---

### 1.35 HF List Filtering

**User-facing benefit**: Filter the historical figures list by type flags: leaders, deities, forces, vampires, werebeasts, necromancers, alive only, ghosts, adventurers, by race. Essential for exploring specific figure categories.

**Code implementation approach**:
- URL query parameters on `/hfs` endpoint:
  - `leader=1`, `deity=1`, `force=1`, `vampire=1`, `werebeast=1`, `necromancer=1`
  - `alive=1`, `ghost=1`, `adventurer=1`
  - `race=X`
- Sort options: name, race, birth, death, kills, importance_score
- Backend: PostgreSQL WHERE clauses built from filter params
- Frontend: Filter chips/toggles above the data table

**Reference tools**: LegendsBrowser2 (`HfsController.java` filter/sort logic), LegendsBrowser v1 (URL parameter filters)

**Complexity**: S (Small)

---

### 1.36 ExpandableCard UI Pattern

**User-facing benefit**: Dense information is organized into collapsible cards with a compact summary visible by default and detailed content available on expansion. Prevents information overload while keeping everything accessible.

**Code implementation approach**:
- Component: `ExpandableCard` with `compact-content` (default visible) and `expanded-content` (shown on expansion)
- Used for: Events (shows line chart by default, full event table on expand), Family Tree (compact vs fullscreen), Skills, Relationships
- Animation: Smooth expand/collapse transition
- State: Expansion state persisted in session (not URL)

**Reference tools**: LegendsViewer-Next (`ExpandableCard` component)

**Complexity**: S (Small)

---

### 1.37 Written Content Pages

**User-facing benefit**: Browse books, scrolls, and other written works that DF generates. See who wrote what, about whom, in what style — rich cultural output of civilizations.

**Code implementation approach**:
- Written content detail page: name, form (poem, short_story, musical_composition, etc.), author HF link, linked art form, references section, style list
- Written content list page: grouped by type
- CDM: `written_contents` table with composite PK (world_id, id), title, author_hf_id, type, form_id, year, details JSONB
- Art form detail pages: Dance, Music, Poetry forms with name, description (hyperlinked mentions), event history
- `LinkDescription()` function parses description text and replaces entity/HF/form names with HTML links

**Reference tools**: LegendsViewer-Next (WrittenContent routes), LegendsBrowser2 (`writtencontent.html`, `artform.html`)

**Complexity**: M (Medium)

---

### 1.38 Identity Tracking Pages

**User-facing benefit**: DF figures can assume false identities. Users can see who is pretending to be whom, which is crucial for understanding intrigue plots.

**Code implementation approach**:
- Identity detail page: name, profession, entity link, used-by HF (cross-linked)
- Identity list page: all identities
- Current identity flagged on HF detail page
- CDM: New `identities` table (world_id, id, name, profession, entity_id, used_by_hfid)
- Events: `assume_identity` event type links to identity

**Reference tools**: LegendsViewer-Next (`/identity/:id` route), LegendsBrowser2 (`identity.html`)

**Complexity**: S (Small)

---

### 1.39 World Construction Pages

**User-facing benefit**: Browse roads, bridges, and tunnels that connect sites across the world. See the infrastructure that civilizations build.

**Code implementation approach**:
- World construction detail page: name, type (road, tunnel, bridge), coords, map marker
- World construction list page: grouped by type
- Map rendering: squares for point constructions, polylines for roads/bridges/tunnels
- CDM: New `world_constructions` table
- Full event history per construction

**Reference tools**: LegendsViewer-Next (`/construction/:id`), LegendsBrowser2 (`worldconstruction.html`)

**Complexity**: S (Small)

---

### 1.40 Entity (Civilization) Detail Pages with Tabs

**User-facing benefit**: Comprehensive view of a civilization or group: its leaders through history, controlled sites, member figures, sub-organizations, and wars fought. Tabbed organization prevents information overload.

**Code implementation approach**:
- **Tabs**: Leaders, Sites, Members, Groups, Wars
- **Leaders tab**: Table of leaders with date range (from/till), linked to HF pages
- **Sites tab**: Table of controlled sites with inline event history
- **Members tab**: Named HF members list (up to 1,000 members, client-side sort)
- **Groups tab**: Child entities (sub-organizations)
- **Wars tab**: Table of wars showing date range, war name (linked), enemy entity (attacker/defender role)
- Mini-map showing all owned sites
- Warfare graph embedded
- Entity positions and assignments table with gender-appropriate titles
- Entity type icons (Font Awesome): crown=leader, skull=necromancer, droplet=vampire, etc.
- Member counts and race badges

**Reference tools**: LegendsViewer-Next (`Entity.vue`), LegendsBrowser2 (`entity.html`), weblegends (`render_entity.cpp`)

**Complexity**: L (Large)

---

### 1.41 Historical Figure Detail Pages

**User-facing benefit**: The most information-dense page in the application. Every detail about a historical figure: biography, family, positions, kills, artifacts, skills, relationships, full event history — all cross-linked and navigable.

**Code implementation approach**:
- **Profile Overview card**: Age, birth, death, spheres, positions, type flags (deity/vampire/etc.)
- **Family Tree card**: Cytoscape.js dagre, expandable
- **Skills card**: Scrollable list with rank icons and point counts
- **Related Factions and Groups**: Entity memberships
- **Related Sites**: Site links with type
- **Close Relationships**: Non-deity HF links with sex-specific labels (wife/husband, son/daughter, etc.)
- **Vague Relationships**: Loose social associations
- **Worshipped Deities**: Deity links with worship strength (dubious <10, casual <25, average <75, faithful <90, ardent >=90)
- **Journey Pets**: Pet list
- **Noble Positions**: Multiple position history with date ranges
- **Worshipping Figures/Entities** (if deity)
- **Notable Kills**: Kill list with victim details
- **Artifacts**: Currently held artifacts
- **Dedicated Structures**: Temples and structures dedicated to this HF
- **Intrigue actors/plots**: v0.47+ intrigue network
- **Entity Reputations**: Numeric scores for hero, murderer, psychopath, enemy fighter, etc.
- **Snatcher Of**: Abduction victims (if applicable)
- **Battles**: As attacker/defender/non-combatant
- **Beast Attacks**: If beast
- **Full Event History**: Paginated, perspective-aware rendering

**Reference tools**: LegendsViewer-Next (`HistoricalFigure.vue`), LegendsBrowser2 (`hf.html`), LegendsBrowser v1 (`hf.vm`), weblegends (`render_figure.cpp`)

**Complexity**: XL (Extra Large)

---

## 2. Data Requirements

### 2.1 CDM Tables Required

**Core tables (already built)**:
- `world` (id, name, altname, year_current, year_began, params_json)
- `region` (id, world_id, name, type, coords_json, evilness)
- `site` (id, world_id, name, type, coords, rectangle, owner_entity_id, civ_id)
- `structure` (id, site_id, name, type, deity_id)
- `entity` (id, world_id, name, type, race, parent_entity_id)
- `historical_figure` (id, world_id, name, race, caste, born_year, died_year, ...)
- `history_event` (id, world_id, year, seconds72, type, site_id, region_id, entity_id, figure_ids_json, details_json)
- `history_collection` (id, world_id, type, start_year, end_year, name, event_ids_json)
- `artifact` (id, world_id, name, item_type, material, creator_hfid, current_holder_hfid)
- `hf_links`, `hf_entity_links`, `hf_site_links` (relationship tables)
- `entity_positions`, `hf_position_links` (position assignment tables)
- `written_contents`, `historical_eras`
- `worldgen_snapshots`, `worldgen_params`

**Tables needed (not yet built)**:
- `world_constructions` (id, world_id, name, type, coords)
- `dance_forms`, `musical_forms`, `poetic_forms` (id, world_id, name, description)
- `identities` (id, world_id, name, profession, entity_id, used_by_hfid)
- `rivers` (id, world_id, name, path_json)
- `entity_populations` (id, world_id, entity_id, race, count)
- `landmasses` (extend existing — ensure full detail)
- `mountain_peaks` (extend existing — ensure full detail)
- `underground_regions` (extend existing — ensure full detail)

### 2.2 CDM Column Extensions Required

**historical_figures — missing high-priority fields**:
- `deity`, `force`, `ghost` flags (from `histfig_flags`)
- `active_interactions` TEXT[] (vampire/necromancer/werebeast detection)
- `spheres` TEXT[] (deity domains)
- `goals` TEXT[] (life goals)
- `skills` JSONB (from `info.skills` — skill list with XP points)
- `kills` JSONB (notable and other kill records)
- `whereabouts` JSONB (current geographic state)
- `vague_relationships` JSONB
- `entity_reputations` JSONB (hero, murderer, monster, etc.)
- `intrigue_actors` JSONB, `intrigue_plots` JSONB
- `used_identities` INT[], `current_identity_id` INT
- `journey_pets` TEXT[]
- `holds_artifact` INT[]
- `breed_id` INT, `cultural_identity` INT, `family_head_id` INT
- `importance_score` FLOAT (computed)
- `lineage_curse_parent_id` INT (for curse lineage trees)

**sites — extensions**:
- `owner_history` JSONB (OwnerPeriod records)
- `site_properties` JSONB
- `importance_score` FLOAT

**artifacts — extensions**:
- `holder_history` JSONB (chain of custody)
- `page_count` INT
- `writing_id` INT (linked written content)
- `importance_score` FLOAT

**entities — extensions**:
- `line_color` TEXT (generated hex color)
- `entity_occasions` JSONB
- `entity_entity_links` JSONB

### 2.3 Computed Data

- **Importance scores**: Computed on ingestion for HFs, sites, artifacts, conflicts
- **Kill lists**: Built from `hf died` events during post-parse processing
- **Ruin status**: Derived from destruction/reclaim events
- **Vampire/werebeast/necromancer flags**: Derived from `hf_does_interaction` events
- **Entity war lists**: Built from event collections
- **Region map grid**: Pre-computed `world_width x world_height` 2D array for O(1) hover detection
- **Civilization colors**: HSV rotation computed once per world load
- **Family tree graphs**: Lazily computed per HF, cached (Cytoscape JSON)
- **Rivalry scores**: Co-appearance analysis computed periodically

### 2.4 Live Data (Bridge)

- Current site ownership from `site.cur_owner_id`
- Current inhabitants from `site.unk_1.nemesis` (live nemesis records)
- Current artifact locations
- `cur_year` / `cur_year_tick` for age calculations
- Creature raws for caste descriptions, gender symbols
- Interaction definitions for `hist_string_1/2`
- Squad names, occupation records, entity position names

---

## 3. UI/UX Patterns

### 3.1 Application Layout (from LegendsViewer-Next)
- `v-app-bar`: Top bar with app logo, title, version badge
- `v-navigation-drawer`: Left sidebar, always visible, with collapsible menu groups
- `v-main` + `v-container`: Main content area
- 8 navigation groups: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals
- Top nav bar with links to: Chat, Explorer, Monitoring

### 3.2 List View Pattern
- Header with large icon, title, subtitle, optional DF Wiki button
- Search text field (instant-filter)
- Server-side paginated data table
- Total count badge (cyan chip)

### 3.3 Detail View Pattern
- Prev/Next navigation FABs at top-right
- Large icon + name header
- Optional mini-map card
- Type-specific cards injected via named slots
- ExpandableCard "Events" section with line chart + paginated event table
- "Chronicles" section with paginated event collections table
- Tab state persistence via URL hash

### 3.4 Dark Mode
- Bootstrap 5 dark mode via `bootstrap-dark.css` (LB2 pattern)
- Or Vuetify 3 dark theme (LV-Next pattern)

### 3.5 Entity Icon System
- Font Awesome 6 solid icons for entity type glyphs:
  - crown=leader, skull=necromancer, droplet=vampire, moon=werebeast
  - hiking=adventurer, hands=deity, star=force
- Consistent across: map markers, list views, entity links, node icons

### 3.6 JSON Debug Dump
- Every entity page optionally shows the complete data struct as JSON for debugging (LB2 pattern: `{{ json . }}`)

---

## 4. Implementation Architecture

### 4.1 Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Backend API | FastAPI + Uvicorn | REST endpoints, WebSocket for live updates |
| Database | PostgreSQL 16 + pgvector | CDM storage, spatial queries |
| Map Library | Leaflet.js 1.9.4 | Interactive world map |
| Charts | Observable Plot + D3.js + Chart.js | Demographics, timelines, chord diagrams |
| Graph Viz | Cytoscape.js (dagre + cola layouts) | Family trees, warfare graphs |
| Network Viz | vis.js | Ego-network entity relationship graphs |
| Frontend | SvelteKit (or Vue 3 + Vuetify 3) | SPA with SSR support |
| Templates | Jinja2 (current) / Svelte components (target) | Page rendering |

### 4.2 API Route Structure

```
# World overview
GET /api/world/summary
GET /api/world/population
GET /api/world/regions
GET /api/world/war-matrix
GET /api/world/rivalries

# Map
GET /api/map/image/{size}          # thumbnail, default, large
GET /api/map/sites
GET /api/map/regions
GET /api/map/constructions
GET /api/map/state?year=N          # temporal state
GET /api/map/territories?year=N
GET /api/map/{type}/{id}           # per-object mini-map

# Entity CRUD (pattern for each type)
GET /api/{type}?search=X&page=N&pageSize=M&sortKey=K&sortOrder=asc
GET /api/{type}/{id}
GET /api/{type}/{id}/events
GET /api/{type}/{id}/eventchart
GET /api/{type}/{id}/eventtypechart

# Specialized
GET /api/hf/{id}/family-tree
GET /api/hf/{id}/curse-lineage
GET /api/hf/{id}/rivals
GET /api/entity/{id}/warfare-graph
GET /api/collections/{id}/events
GET /api/search?term=X
GET /api/popover/{type}/{id}

# Worldgen
GET /api/worldgen/current
GET /api/worldgen/history

# Graph
GET /api/graph/{type}/{id}?depth=N
```

### 4.3 Data Flow for Visualization

```
PostgreSQL CDM
    |
FastAPI REST API (paginated, filtered, sorted)
    |
    +-- Map endpoints -> Leaflet.js (site markers, regions, layers)
    +-- Chart endpoints -> Chart.js / D3.js (timelines, demographics)
    +-- Graph endpoints -> Cytoscape.js / vis.js (family trees, networks)
    +-- Event endpoints -> Narrative HTML (cross-linked, perspective-aware)
    +-- Search endpoint -> Autocomplete component
    +-- Popover endpoints -> Hover preview cards
    +-- Worldgen endpoints -> WebSocket -> Live dashboard
```

---

## 5. Existing Implementation Status

| Feature | Status | Location |
|---------|--------|----------|
| CDM PostgreSQL Schema (35 tables) | COMPLETE | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Explorer 6-tab UI (People, Civs, Geography, Schema, Data, Graph) | COMPLETE | Explorer template + routes |
| vis.js ego-network graph | COMPLETE | Graph tab, 1-3 hop, forceAtlas2Based |
| Entity cross-linking (FK navigation) | COMPLETE | Explorer detail views |
| Entity positions (11,712 defs + 13,501 assignments) | COMPLETE | entity_positions, hf_position_links tables |
| Written contents (61,692 records) | COMPLETE | written_contents table |
| Historical eras | COMPLETE | historical_eras table |
| World summary (basic) | PARTIAL | World statistics on home page |
| Composite PK migration (multi-world) | COMPLETE | All 13 legends tables |
| Interactive world map (Leaflet) | NOT STARTED | Planned for Phase 5+ |
| Family tree visualization | NOT STARTED | Planned for Phase 5+ |
| Warfare graph | NOT STARTED | Planned for Phase 5+ |
| Event timeline charts | NOT STARTED | Planned for Phase 5+ |
| Population distribution charts | NOT STARTED | Planned for Phase 5+ |
| Hover popovers | NOT STARTED | Planned for Phase 5+ |
| Map timeline scrubber | NOT STARTED | Post-v1.0 |
| Civ territory overlays | NOT STARTED | Post-v1.0 |
| Worldgen live map preview | NOT STARTED | Post-v1.0 |
| Curse lineage tree | NOT STARTED | Post-v1.0 |
| War chord diagram | NOT STARTED | Post-v1.0 |
| Importance scoring | NOT STARTED | Planned for ingestion pipeline |
| Death cause narrative rendering | NOT STARTED | Planned for narrative engine |
| Perspective-aware event rendering | NOT STARTED | Planned for narrative engine |
| DF calendar utility | NOT STARTED | Small utility |
| Global search with autocomplete | NOT STARTED | Planned |
| Worldgen progress dashboard | NOT STARTED | Novel feature |
| Identity pages | NOT STARTED | CDM extension needed |
| World construction pages | NOT STARTED | CDM extension needed |
| Art form pages | NOT STARTED | CDM extension needed |
| River pages | NOT STARTED | CDM extension needed |

---

## 6. Open Questions & Design Decisions

### 6.1 Frontend Framework
**Decision needed**: Vue 3 + Vuetify 3 (following LegendsViewer-Next) or SvelteKit (planned in stack decision matrix).
- Vue 3 + Vuetify 3: Proven by LV-Next, Material Design components, rich data table
- SvelteKit: Lightweight, fast, SSR, good DX, recommended in planning docs
- Current: Jinja2 templates + vanilla JS (working but not scalable)
- **Impact on this component**: Chart.js and Leaflet work with either; Cytoscape.js has Vue wrappers but also works standalone

### 6.2 Map Generation Method
**Decision needed**: Use DF-exported BMP vs. generate programmatically from region data.
- BMP: Simplest, most accurate, but requires manual export step
- Programmatic: Always available, can be updated live, but requires color mapping and coordinate transforms
- **Recommendation**: Support both — try BMP first, fall back to programmatic

### 6.3 Event HTML Rendering
**Decision needed**: Server-side HTML generation (LV-Next/LB2 pattern) vs. structured JSON rendered client-side.
- Server-side: Simpler frontend, single rendering path, works with any frontend framework
- Client-side: More flexible, better for reactive updates, but requires duplicate rendering logic
- **Recommendation**: Server-side HTML with entity links, injected via `v-html` or equivalent

### 6.4 Multi-Participant Events
**BUG-002**: Events with 10+ participants store only first two HF IDs. Pending decision: JSONB array vs. junction table for participant lists.

### 6.5 Timeline Scrubber Data Strategy
**Decision needed**: Precompute site ownership at every year vs. compute on-the-fly from events.
- Precompute: Fast scrubbing, large storage
- On-the-fly: Smaller storage, slower scrubbing
- **Recommendation**: Compute on-the-fly with caching for frequently accessed years

### 6.6 Large World Performance
**Decision needed**: How to handle worlds with 60,000+ HFs and 400,000+ events in the map and graph views.
- Map: Viewport culling, clustering at low zoom levels
- Graph: Hard limit at 1,000 nodes (already implemented)
- Tables: Server-side pagination (already planned)
- Charts: Pre-aggregate at ingestion time for commonly queried ranges

### 6.7 Worldgen Map Access Safety
**Uncertainty**: `world_data` pointer may be nil before terrain phase begins. `world_data.region_map` accessibility during `PreparingElevation` phase needs empirical verification. Thread safety during `RecountingLegends` (state 8) when history vectors are being written at high speed needs testing.

### 6.8 Visualization Priority Ordering

| Priority | Visualization | Phase |
|----------|--------------|-------|
| P1 | Interactive world map (Leaflet) | Phase 5+ (post-v1.0) |
| P1 | Site markers (type-coded shapes) | Phase 5+ |
| P1 | Civilization color coding | Phase 5+ |
| P2 | Family tree (Cytoscape dagre) | Phase 5+ |
| P2 | Warfare graph (Cytoscape cola) | Phase 5+ |
| P2 | Event timeline (line chart) | Phase 5+ |
| P2 | Population pie/doughnut | Phase 5+ |
| P2 | Per-object mini-map | Phase 5+ |
| P2 | Hover popovers | Phase 5+ |
| P3 | Curse lineage tree | Post-v1.0 |
| P3 | War chord diagram | Post-v1.0 |
| P3 | Event type breakdown (bar) | Post-v1.0 |
| P3 | Map timeline scrubber | Post-v1.0 |
| P3 | Civ territory overlays | Post-v1.0 |
| P4 | Worldgen live map preview | Post-v1.0 |
| P4 | Worldgen progress dashboard | Post-v1.0 |

---

## 7. Summary Statistics

- **Total discrete features identified**: 41
- **Complexity breakdown**: 6 Small, 17 Medium, 9 Large, 4 Extra Large, 5 Not Yet Classified (embedded in larger features)
- **Features already built**: 6 (CDM schema, Explorer tabs, vis.js graph, entity cross-linking, positions, written contents)
- **Features not started**: 35
- **CDM tables needed (new)**: 6
- **CDM column extensions needed**: ~25 new columns across 3 tables
- **Reference tools contributing features**: LegendsViewer-Next (21 features), LegendsBrowser2 (18), LegendsBrowser v1 (5 unique), weblegends (12), df-narrator (4), DwarvenSurveyor (3), worldgen-scraping (3), myDFHackScripts (2), df-ai (1)

---

*Component Research Document -- World History & Demographics Visualizer. Extracted from 9 source documents. All features, requirements, design details, implementation approaches, code patterns, UI concepts, and technical specifications relevant to this component have been captured.*
