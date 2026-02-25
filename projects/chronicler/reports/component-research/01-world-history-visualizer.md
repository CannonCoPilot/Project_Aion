# Component Research: World History & Demographics Visualizer

## Component Definition
The World History & Demographics Visualizer is the "Living Atlas" side of Chronicler -- a comprehensive browser-based viewer for world history data including interactive maps, demographic charts, civilization overviews, event timelines, and artifact tracking. It unifies the capabilities of LegendsViewer-Next, LegendsBrowser, and weblegends into a single coherent experience with the addition of live data and demographic analytics.

## Current State (v0.8)
- Explorer with 6 tabs: People, Civilizations, Geography, Schema, Data, Graph
- vis.js ego-network graph visualization
- Basic entity linking and cross-navigation
- Single-world simplification (hardcoded world_id)

## Feature Inventory from Repository Research

### Interactive World Map (P1)
**Sources**: LegendsViewer-Next (F-LV-01, F-LV-10), DwarvenSurveyor, weblegends (F-WL-04)
- Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection)
- Map image from DF-exported BMP or generated from RegionTypeColors
- Y-axis inverted coordinate system: `[(height - y) * scale, x * scale]`
- Toggleable layer groups: Sites, World Constructions, Mountains, Landmasses, Regions, Rivers, Battles
- Site marker shapes by type: Circle (caves), Triangle (forts), Square (hamlets), Pentagon (fortresses), Hexagon (halls), Star (vaults)
- Marker colors: owning civilization's HSV-generated color
- Zoom range: -2 to +2
- Timeline scrubber: view map at any world year
- Civ territory overlays
- Search-and-jump to named locations
- Site bounding box display
- Large region support with viewport culling

### Family Tree / Relationship Graph (P2)
**Sources**: LegendsViewer-Next (F-LV-02), LegendsBrowser
- Cytoscape.js with dagre layout for family trees
- Cytoscape.js with cola layout for warfare graphs
- Node/edge data model: CytoscapeNodeData (id, label, type), CytoscapeEdgeData (source, target, relationship)
- Graph types: family tree, curse lineage, warfare network, entity membership

### Population & Demographic Charts (P2)
**Sources**: LegendsViewer-Next, LegendsBrowser, df-narrator (F-NR-01, F-NR-03)
- Population by Race doughnut chart (Chart.js/vue-chartjs)
- Area by Overworld Regions doughnut chart
- Events per year line chart (timeline)
- Event type breakdown bar chart
- D3 War Chord Diagram (civilizations as arcs, wars as chords)
- Population pyramids (age distribution by race/civ)
- Migration flow visualization (Sankey diagram)
- Skill distribution histograms

### Civilization Color System
**Source**: LegendsViewer-Next
- HSV rotation: medium saturation for first 6 races, lighter for 7-12, darker for 13-18
- Consistent across: map markers, warfare graphs, civilization lists, event highlights
- Entity.Color() and Entity.Icon() methods

### World Summary Dashboard
**Sources**: LegendsViewer-Next (F-LV-07), LegendsBrowser2
- World map thumbnail
- Population and Area doughnut charts
- Active/Lost Civilizations card lists
- Events timeline with line chart
- Chronicles (event collections) table
- World statistics summary (years, sites, civs, HFs, events, artifacts)
- Heroic Ties card (player-related objects)

### Hover Popovers
**Sources**: LegendsBrowser, LegendsBrowser2
- Every entity hyperlink triggers hover popover
- Content fetched from `/popover/{type}/{id}` endpoint
- HF: name, race, sex, birth/death, type flags
- Site: name, type, owner entity
- Entity: name, type, race

### Artifact Journey Tracking
**Source**: df-narrator (F-NR-04)
- Artifact detail page with creation, holders, thefts, storage, loss
- Chronological event timeline per artifact
- Holder chain visualization
- Lost/stolen status indicators

### Conflict Aggregation & War Timeline
**Source**: df-narrator (F-NR-03), LegendsBrowser2
- War/battle/siege collection hierarchy
- Death toll, battle count, sites involved, duration
- Aggressor/defender identification
- Battle timeline within wars
- Expandable war -> battle -> event trees

### Written Content / Art Form Browsing
**Source**: LegendsViewer-Next (F-LV-12), myDFHackScripts (F-MS-07)
- Browse in-game books, poems, musical forms, dance forms
- Author attribution, creation date, content preview
- Subject matter categorization

### Entity Importance Scoring
**Source**: df-narrator (F-NR-01)
- Multi-factor scoring for figures, sites, conflicts, artifacts
- Used for: default sort order, "top N" displays, storyteller prioritization
- SQL-implementable: `SELECT *, importance_score(columns...) AS score FROM historical_figures ORDER BY score DESC`

## Features Unique to Chronicler (Not in Any Reference Tool)

1. **Live data overlay**: Combine historical legends data with real-time fortress data on the same visualizations
2. **Cross-save analytics**: Track population trends, war outcomes, artifact journeys across multiple fortress saves
3. **Worldgen live map preview**: Update the map in real-time as world generation progresses
4. **Demographic analytics**: Population pyramids, migration flows, skill distributions -- no existing tool provides these
5. **Knowledge Horizon-aware display**: Optionally mask visualizations to show only "known" data for narrative immersion
6. **Timeline scrubber**: Navigate the world map to any historical year -- no existing viewer has this

## Implementation Priority

| Feature | Priority | Effort | Dependencies |
|---------|----------|--------|-------------|
| Interactive Leaflet map | P1 | HIGH | Map image generation |
| Site markers with type shapes | P1 | MED | Map + CDM site data |
| Civilization color system | P1 | LOW | Entity data |
| World summary dashboard | P1 | MED | Charts library |
| Hover popovers | P2 | MED | API endpoints |
| Family tree graph | P2 | HIGH | Cytoscape.js |
| Population charts | P2 | MED | Chart.js/vue-chartjs |
| Event timeline chart | P2 | MED | Chart.js |
| Warfare graph | P2 | HIGH | Cytoscape.js |
| Timeline scrubber | P2 | HIGH | Temporal query system |
| War chord diagram | P3 | MED | D3.js |
| Curse lineage tree | P3 | MED | Graph data model |
| Demographic analytics | P3 | HIGH | Statistical queries |
| Live data overlay | P3 | HIGH | Watcher integration |
