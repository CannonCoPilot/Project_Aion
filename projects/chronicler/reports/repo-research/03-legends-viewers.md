# Repository Research Report: Legends Viewers (4 repos)

This report covers four related repositories that all serve the same purpose — viewing Dwarf Fortress legends/history XML exports — but with different technology stacks and feature sets:

1. **LegendsBrowser** (Java, v0.44 era, 263 Java files)
2. **LegendsBrowser2** (Go, v0.47, complete rewrite)
3. **LegendsViewer-Next** (.NET 8 + Vue 3/TypeScript, v50.x/Steam, most modern)
4. **DwarvenSurveyor** (Unity/C#, XML map visualization)

---

## LegendsBrowser (Java)

**Repository**: `GitRepos/LegendsBrowser`
**Stack**: Java, Maven, web browser UI
**Target**: DF 0.44.x
**Key Files**: 263 Java source files, `pom.xml` build, HTML templates

### Architecture
- Java web server on port 58881
- Recreates DF Legends Mode in a browser with hyperlinked navigation
- Supports LNP (Lazy Newb Pack) archived legends
- Requires legends_plus.xml from DFHack for full features
- Server mode for remote access

### Features
- Civilization overviews with linked entities
- Historical figure browsing with relationship links
- Site exploration
- Event timelines
- Statistics and overviews not in base game
- Command line options: port, serverMode, subUri, world path

---

## LegendsBrowser2 (Go)

**Repository**: `GitRepos/LegendsBrowser2`
**Stack**: Go, web browser UI, HTML templates
**Target**: DF 0.47.x
**Key Files**: 33+ Go files, analyze/ tool, backend/ server

### Architecture
- Complete rewrite from Java to Go for better performance
- Same web UI paradigm (localhost:58881)
- `analyze/` tool for XML structure analysis and code generation
- `backend/model/` contains: collections, context, data, events, history, map, parse, process
- `backend/server/` contains: search, loading, resource, templates
- XML structure-aware code generator (`analyze/df/generate_backend.go`, `generate_events.go`)

### Key Features
- Full-text search across all world objects
- Map generation from parsed XML data
- Event list rendering with pagination
- Collection (war/battle/siege) aggregation
- CP437 to UTF-8 conversion utility
- Templated HTML output with navigation

### Unique Technical Contributions
- **XML Structure Analyzer**: `analyze/df/analyze.go` and `structure.go` can analyze legends XML structure and auto-generate Go model code — this meta-tool approach could be adapted for auto-generating CDM migrations when new DF versions add XML fields
- **Code Generation Pipeline**: `generate_backend.go` creates Go structs from XML analysis; `generate_events.go` creates event type handlers

---

## LegendsViewer-Next (.NET 8 + Vue 3)

**Repository**: `GitRepos/LegendsViewer-Next`
**Stack**: .NET 8 backend, Vue 3 + TypeScript frontend
**Target**: DF 50.x (Steam release), most modern viewer
**Key Files**: 143 Event classes, 17 WorldObject classes, Cytoscape graph data, Leaflet maps

### Architecture
- Modern web app: .NET 8 backend API + Vue 3 SPA frontend
- Bookmark system for quick world access
- Tests directory with backend test suite
- Parser/ directory: XMLParser, XMLPlusParser, HistoryParser, SitesAndPopsParser

### WorldObject Types (17 classes)
ArtForm, Artifact, DanceForm, Entity, Era, HistoricalFigure, Landmass, MountainPeak, MusicalForm, PoeticForm, Region, River, Site, Structure, UndergroundRegion, WorldConstruction, WrittenContent

### Event Types (143 classes)
Most comprehensive event type coverage of any viewer — from AgreementConcluded through WrittenContentComposed. Includes all DF 50.x event types.

### Key Features
- **Interactive Leaflet.js Map**: Zoomable map with site markers, region overlays
- **Family Trees**: Cytoscape.js-based family tree visualization for historical figures
- **Bookmarks**: Save/load world access with thumbnails and timestamps
- **Map Generation**: Generated from parsed XML data (elevation, biome, drainage, etc.)
- **Paginated Tables**: Browse all world objects with sort/filter
- **World Summary Dashboard**: Key statistics at a glance

### Unique Technical Contributions
- **Cytoscape Graph Data Model**: `CytoscapeData`, `CytoscapeNodeData`, `CytoscapeEdgeData` — structured graph data for relationship visualization
- **143 strongly-typed event classes** with full field mapping — the most complete event type reference available
- **Comprehensive enum set** (60+ enums) covering every DF concept from AbuseType to WrittenContentType
- **Map image generation**: `WorldMapImageGenerator` creates map images from parsed terrain data

---

## DwarvenSurveyor (Unity)

**Repository**: `GitRepos/DwarvenSurveyor`
**Stack**: Unity Engine, C#
**Target**: Visual map generation from legends XML
**Key Files**: 15 C# scripts, sample XML data

### Architecture
- Unity 3D application for map rendering
- Parses both legends.xml and legends_plus.xml
- Generates interactive 3D map with sites, regions
- Camera movement and region/site selection UI

### Key Scripts
- `MapXMLParser.cs`: Parses XML export files
- `Region.cs`, `Site.cs`: Data model for map elements
- `RegionPanel.cs`, `SitePanel.cs`: UI panels for selected regions/sites
- `CameraMover.cs`: 3D camera navigation
- `SearchButtonCameraJump.cs`: Search-to-location navigation
- `CoordinateChangeHandler.cs`: Coordinate system management
- `AnimHelper.cs`: Animation utilities for map transitions

### Unique Technical Contributions
- **3D map visualization from XML data** — demonstrates that world map rendering is viable from export data alone
- **Search-to-location** pattern: user searches for a site name, camera navigates to it on the map

---

## Consolidated Extractable Features for Chronicler

### F-LV-01: Interactive Leaflet.js World Map
- **User QoL**: Zoomable, pannable world map with clickable site markers, region overlays, and terrain visualization
- **Implementation**: LegendsViewer-Next uses Leaflet.js with custom tile generation from parsed XML elevation/biome data. WorldMapImageGenerator creates tile images. Sites displayed as markers with popover details.
- **Chronicler relevance**: Direct implementation reference for the Geography tab's interactive map; can be adapted to work from PostgreSQL queries rather than in-memory XML

### F-LV-02: Family Tree / Relationship Graph Visualization
- **User QoL**: Visual family trees showing parents, children, spouses, and relationship links between historical figures
- **Implementation**: LegendsViewer-Next uses Cytoscape.js with structured node/edge data. CytoscapeNodeData has id, label, type. CytoscapeEdgeData has source, target, relationship.
- **Chronicler relevance**: Graph tab enhancement; "Show me the family tree of Urist" Storyteller capability

### F-LV-03: Comprehensive Event Type Coverage (143 types)
- **User QoL**: Every event type in DF 50.x properly parsed, classified, and rendered with appropriate context
- **Implementation**: LegendsViewer-Next has 143 individual C# event classes, each with specific field parsing and display logic. This is the most complete event type reference available.
- **Chronicler relevance**: Event type validation for the XML parser; ensure Chronicler handles all 141+ canonical event types

### F-LV-04: World Bookmark / Quick Access System
- **User QoL**: Save parsed worlds for quick re-access with thumbnails, timestamps, and metadata
- **Implementation**: BookmarkService maintains a list of previously opened worlds with serialized state.
- **Chronicler relevance**: Multi-world management in Explorer UI; quick world switching without re-import

### F-LV-05: XML Structure Auto-Analysis
- **User QoL**: Automatically detect new/changed XML fields when DF versions update, reducing maintenance burden
- **Implementation**: LegendsBrowser2's analyze/ tool examines XML structure and generates model code. Could be adapted to compare XML schemas across DF versions and flag CDM migration needs.
- **Chronicler relevance**: Maintenance tooling for keeping the XML parser and CDM in sync with DF updates

### F-LV-06: Full-Text Search Across World Objects
- **User QoL**: Search for any entity, site, figure, artifact by name or description text
- **Implementation**: LegendsBrowser2's `backend/server/search.go` implements indexed text search across all world object types.
- **Chronicler relevance**: PostgreSQL full-text search (tsvector/tsquery) for the Explorer search bar; Storyteller query understanding

### F-LV-07: Entity/Civilization Overview Dashboard
- **User QoL**: At-a-glance view of all civilizations with population, site count, government type, wars
- **Implementation**: All viewers provide civilization list as the landing page. LegendsBrowser2 template renders per-entity statistics.
- **Chronicler relevance**: Civilizations tab content; entity cards with key metrics

### F-LV-08: Paginated World Object Browsing
- **User QoL**: Browse large datasets (100K+ events, 50K+ figures) with pagination, sorting, filtering
- **Implementation**: LegendsViewer-Next Vue 3 frontend with virtual scrolling and backend pagination.
- **Chronicler relevance**: People/Events/Sites tabs in Explorer need efficient pagination for large worlds

### F-LV-09: 60+ Enum Types for DF Concepts
- **User QoL**: Human-readable display of all coded game values (death causes, site types, structure types, etc.)
- **Implementation**: LegendsViewer-Next defines 60+ enums covering DeathCause, SiteType, RegionType, EntityType, Mood, HFState, etc.
- **Chronicler relevance**: Enum reference for CDM column values; display name mapping in Explorer UI

### F-LV-10: Map Generation from Terrain Data
- **User QoL**: Visual world maps generated from parsed XML without needing the game's own map image
- **Implementation**: Both LegendsViewer-Next (2D Leaflet) and DwarvenSurveyor (3D Unity) generate maps from XML terrain/elevation data. RegionTypeColors maps biomes to colors.
- **Chronicler relevance**: Server-side map tile generation for the Geography tab; could serve pre-rendered map tiles via API

### F-LV-11: Hyperlinked Navigation
- **User QoL**: Click any entity name, site name, or figure name to navigate to its detail page — Wikipedia-style browsing
- **Implementation**: All viewers generate HTML with entity cross-links. Template systems output `<a href="/entity/123">` style links.
- **Chronicler relevance**: Explorer UI navigation pattern; every entity reference should be a clickable link

### F-LV-12: Written Content / Art Form Browsing
- **User QoL**: Browse in-game books, poems, musical forms, dance forms with their content and attribution
- **Implementation**: LegendsViewer-Next has WrittenContent, PoeticForm, MusicalForm, DanceForm, ArtForm world objects. LegendsBrowser2 templates render written content details.
- **Chronicler relevance**: Cultural content tab; "Tell me about the poetry of this world" Storyteller capability

### F-LV-13: CP437 to UTF-8 Encoding
- **User QoL**: Proper display of DF character names that use the CP437 character set
- **Implementation**: All viewers implement CP437→UTF-8 conversion. LegendsBrowser2's `util/cp473.go`, weblegends' `cp437_streambuf`.
- **Chronicler relevance**: Already implemented in Chronicler's bridge via `dfhack.df2utf()`, but needed for any XML paths that contain CP437 characters

---

## Key Insights

1. **LegendsViewer-Next is the gold standard** for DF legends viewing — .NET 8 + Vue 3, 143 event types, Leaflet maps, Cytoscape graphs, bookmarks
2. **All viewers are offline-only** — they parse XML exports and display them. None connect to a live game. This is Chronicler's fundamental differentiator.
3. **LegendsBrowser2's XML analyzer** is a unique meta-tool that could save significant maintenance effort for CDM updates
4. **The 143-event-type inventory** from LegendsViewer-Next is the most complete reference and should be cross-referenced with Chronicler's 141 canonical types
5. **Map generation from XML** is proven viable — both 2D (Leaflet) and 3D (Unity) approaches work
6. **Family tree visualization** via Cytoscape.js is production-quality and directly reusable
7. **No viewer combines historical data with live data** — this remains Chronicler's unique proposition
