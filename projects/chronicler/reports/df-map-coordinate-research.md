# Research Report: DF Map Coordinates, World Maps, and Geographic Data

**Date**: 2026-03-18
**Scope**: Comprehensive investigation of Dwarf Fortress coordinate systems, geographic XML data, DFHack map APIs, existing viewer map-rendering approaches, army/HF movement data — oriented toward building an interactive map feature in Chronicler.

---

## Executive Summary

Dwarf Fortress uses a three-tier hierarchical coordinate system. At the top sits the **world tile grid** (e.g., 257×257 for Tar Thran), where each integer pair `(x, y)` is one world map tile visible on the embark screen. Each world tile subdivides into a 16×16 grid of **embark sub-tiles** (the sub-tile space), giving a maximum addressable grid of 4096×4096 for a 257×257 world. Within each embark sub-tile, when actually playing, the local fortress map further expands to 48×48 actual game tiles.

The legends XML export (vanilla + DFHack `legends_plus.xml`) contains rich geographic data: every site, region, underground region, world construction (roads, bridges, tunnels), river, mountain peak, and landmass includes world-tile coordinates. Battle and HF movement events also carry world-tile coordinates, making it possible to plot the full history of the world on a map. The CDM already stores all this data. The primary gap is rendering — no map image is available in the data directory; the map must be generated programmatically from the coordinate data.

---

## Key Findings

### Finding 1: The Three-Tier Coordinate System

DF coordinates operate at three distinct scales, which must not be confused:

| Tier | Name | Unit | Example (Tar Thran, 257×257) |
|------|------|------|------------------------------|
| 1 | World tile | Integer pair `x,y` | Range 0–256 on each axis |
| 2 | Embark sub-tile | Integer pair `x,y` in sub-tile space | Range 0–4095 (world_x × 16 + 0..15) |
| 3 | Local map tile | Integer triple `x,y,z` in local fortress | 48×48 per embark sub-tile |

**World tile to embark sub-tile**: `sub_x = world_x * 16 + sub_offset`, where `sub_offset` is 0–15 within the tile. This is what the `rectangle` field in site entries uses.

**Verified from Tar Thran XML**:
- Site "cavern of strangulation": `coords=32,200` → `rectangle=512,3207:514,3209`
- `32 × 16 = 512` (exact), `200 × 16 = 3200`, `3207 − 3200 = 7` (sub-offset within tile)
- Rectangle size is typically 3×3 sub-tiles for caves (point) or larger for towns (16×16)

**World sizes** (all square): 17, 33, 65, 129, or 257 tiles per side. Coordinates in the XML are 0-based, so a 257×257 world has valid coordinates 0–256.

**Source**: Direct analysis of `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-post-embark/autosave_1-00250-01-15-legends.xml` and `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-post-embark/autosave_1-00250-01-15-legends_plus.xml`

---

### Finding 2: Geographic Data in Vanilla legends.xml

The vanilla XML (CP437 encoded) contains the following geographic sections:

**Regions** (`<regions>`):
- Each region has `<id>`, `<name>`, `<type>` (Ocean, Tundra, Hills, Forest, Grassland, Desert, Lake, Mountains, Wetland, Glacier)
- No coordinates in vanilla — only type and name. 240 regions in Tar Thran.

**Underground Regions** (`<underground_regions>`):
- Each has `<id>`, `<type>` (cavern, underworld, magma), `<depth>`
- No coordinates in vanilla. 1,445 underground regions in Tar Thran.

**Sites** (`<sites>`):
- Each has `<id>`, `<type>`, `<name>`, `<coords>` (world tile, e.g., `32,200`), `<rectangle>` (embark sub-tile bounding box, e.g., `512,3207:514,3209`)
- The `rectangle` format is `x1,y1:x2,y2` in embark sub-tile space
- 2,154 sites in Tar Thran

**World Constructions** (`<world_constructions>`): Empty in vanilla XML — only present in `legends_plus.xml`

**Historical Events** (movement/location tracking):
- Every `<historical_event>` includes `<site_id>`, `<subregion_id>`, `<feature_layer_id>`, and optionally `<coords>` (world tile)
- Coords field is `-1,-1` when location is a site (use `site_id` for location) or unknown
- 76,247 `change hf state` events in Tar Thran; 2,124 events have explicit world-tile coords

**Historical Event Collections** (battles, wars, journeys):
- Battle collections include `<site_id>`, `<subregion_id>`, `<feature_layer_id>`, `<coords>` (world tile)
- 778 battles in Tar Thran, all with world tile coords
- Journey collections aggregate change_hf_state movement events (517 journeys in Tar Thran)

**Source**: Direct XML analysis of Tar Thran post-embark legends files

---

### Finding 3: Geographic Data Added by legends_plus.xml

DFHack's `exportlegends` generates `legends_plus.xml` (UTF-8) with substantially richer geographic data:

**Regions** — adds:
- `<coords>`: pipe-delimited list of ALL world tiles belonging to this region (e.g., `0,0|0,1|1,0|...`)
- `<evilness>`: `good`, `neutral`, or `evil`

**Underground Regions** — adds:
- `<coords>`: pipe-delimited world tiles for this underground region

**Sites** — adds:
- `<civ_id>`: current controlling civilization
- `<cur_owner_id>`: current owner entity

**World Constructions** — ONLY present in `legends_plus.xml`:
- `<id>`, `<name>`, `<type>` (road, bridge, tunnel), `<coords>` (pipe-delimited world tile path)
- 311 world constructions in Tar Thran

**Rivers** — ONLY present in `legends_plus.xml`:
- `<name>`, `<path>`, `<end_pos>`
- Path format: pipe-delimited segments, each segment is `world_x,world_y,field3,width,direction`
  - `field3`: elevation offset in sub-tile space (0 = tile start)
  - `width`: river width (sub-tiles? exact unit unclear)
  - `direction`: exit direction code (99/100 = ocean/sea terminus; 104–106 = likely branching codes)
- 7,465 rivers in Tar Thran

**Mountain Peaks** — ONLY in `legends_plus.xml`:
- `<id>`, `<name>`, `<coords>` (world tile), `<height>` (integer), `<is_volcano/>` (boolean flag)
- 16 mountain peaks in Tar Thran

**Landmasses** — ONLY in `legends_plus.xml`:
- `<id>`, `<name>`, `<coord_1>`, `<coord_2>` (bounding box corners in world tiles)
- Defines named continents and islands
- 100 landmasses in Tar Thran

**Source**: Direct analysis of `legends_plus.xml` files and CDM schema at `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

---

### Finding 4: What the CDM Already Stores

All geographic data from `legends_plus.xml` is already ingested into the CDM (PostgreSQL). Key tables:

| Table | Records (Tar Thran) | Key Geographic Fields |
|-------|--------------------|-----------------------|
| `sites` | 2,154 | `coord_x`, `coord_y` (world tile); `coords` (raw string) |
| `regions` | 2,278 | `coords` (pipe-delimited world tiles); `evilness` |
| `underground_regions` | 1,445 | `coords` (pipe-delimited world tiles); `depth` |
| `world_constructions` | 311 | `coords` (pipe-delimited world tile path) |
| `rivers` | 7,465 | `path` (pipe-delimited path segments) |
| `mountain_peaks` | 16 | `coords` (world tile); `height`; `is_volcano` |
| `landmasses` | 100 | `coord_1`, `coord_2` (bounding box corners) |
| `history_events` | ~800K+ | `site_id`, `region_id` (FKs); `details` JSONB (has coords for many event types) |
| `history_event_collections` | — | `site_id`, `region_id` (FKs); `details` JSONB (has coords for battles) |

**Gap**: `history_events` does not have dedicated `coord_x`/`coord_y` columns — the coords from XML events go into the `details` JSONB. Battle coordinates from event collections are in `details`. To use these for map rendering, they need to be extracted or the JSONB queried.

**Source**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` and live DB query

---

### Finding 5: DFHack RemoteFortressReader Map APIs

DFHack's RemoteFortressReader (RFR) exposes real-time map data via protobuf RPC:

**World-level APIs**:
- `GetWorldMap()` / `GetWorldMapNew()`: Returns world name, year, and a per-tile array of biome/terrain data
- `GetWorldMapCenter()`: Returns player's current position on world map
- `GetRegionMaps()` / `GetRegionMapsNew()`: Regional biome details for local area

**Local fortress APIs** (require game thread — see MEMORY.md gotcha):
- `GetMapInfo()`: Local map dimensions, position in world
- `GetBlockList(x_min, x_max, y_min, y_max, z_min, z_max)`: Block-level tile data with terrain type, designation, occupancy
- `GetViewInfo()`: Current viewport coordinates

**Critical limitation**: TCP RPC is broken for game-thread calls on DFHack 53.x under Prism (ARM UTM VM). Only `GetVersion`/`GetWorldInfo` (cached) work reliably via TCP. `GetWorldMap` would require SSH + `dfhack-run` approach, or the HTTP bridge pattern already used.

**What world map data provides** (unavailable in XML):
- Per-tile biome type (forest, grassland, mountain, etc.) for ALL tiles
- Per-tile elevation data
- Per-tile rainfall, temperature, vegetation, evil alignment, volcanism
- This would enable rendering a proper terrain-colored base map

**Source**: [DFHack RemoteFortressReader source](https://github.com/DFHack/dfhack/blob/develop/plugins/remotefortressreader/remotefortressreader.cpp), [DFHack Maps API docs](https://docs.dfhack.org/en/latest/docs/api/Maps.html)

---

### Finding 6: Map Export Options from DF Itself

DF offers two map export mechanisms in Legends mode:

**Press 'p'**: Exports 4 files including a bitmap of the world map as shown on the embark screen. This is a pixel-art raster image where each world tile is one colored pixel/cell. File format and exact dimensions depend on world size.

**Press 'd'**: Detailed map export menu with 15+ layer options:
- Elevation (height map)
- Temperature, rainfall, drainage
- Savagery, volcanism, vegetation
- Evil/good alignment
- Salinity, diplomacy, hydrology
- Nobility, structures/roads, trade

These exports produce PNG/BMP files that can serve as base layer tiles for a map renderer. **However**, no such files currently exist in `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/`.

**Source**: [DF Wiki — Legends](https://dwarffortresswiki.org/index.php/DF2014:Legends)

---

### Finding 7: How Existing Legends Viewers Render Maps

**LegendsViewer-Next** (C# backend + Vue 3 frontend):
- Uses Leaflet.js for interactive map display
- Generates maps **programmatically from XML coordinate data** (no image import)
- Key data sources: `legends.xml` + `legends_plus.xml`
- Renders regions as polygon fills from the `<coords>` tile lists
- Plots sites as markers using `<coords>` world tile positions
- Map generation noted as: "Generated maps from parsed information of the exported XML plus files"

**LegendsBrowser2** (Go backend + HTML/JS frontend):
- Also works with XML exports
- Opens a local web server (port 58881)
- Shows world map with civilizations but exact rendering approach not documented

**Legends Viewer (original, C#)**:
- Requires 4 input files including a **map image file** exported from DF
- Uses the raster image as a base layer, overlays site markers and event data
- Less sophisticated but directly uses DF's own visual representation

**DwarvenSurveyor**: Also generates maps from XML, C# scripts

**Key takeaway**: Modern viewers (LegendsViewer-Next) generate maps from coordinate data without needing a DF-exported image. This is the recommended approach for Chronicler.

**Sources**: [LegendsViewer-Next GitHub](https://github.com/Kromtec/LegendsViewer-Next), [LegendsBrowser2 GitHub](https://github.com/robertjanetzko/LegendsBrowser2)

---

### Finding 8: Army/Battle Movement Data

Battles are tracked in `historical_event_collections` with type `battle`:
- `<coords>`: World tile of the battle location
- `<site_id>`: Site where battle occurred (-1 if in open terrain)
- `<subregion_id>`: Region if in open terrain (-1 if at site)
- `<feature_layer_id>`: Underground layer (-1 if surface)
- `<attacking_hfid>` / `<defending_hfid>`: Participants
- `<attacking_squad_race>`, `<attacking_squad_number>`: Army composition
- `<war_eventcol>`: Parent war collection ID

Wars (`type=war`) group battles but do not themselves carry coordinates.

**Sample from Tar Thran**:
- "the battle of smokes" at world tile (163,179), region 1052, no site
- "the assault of razors" at world tile (140,106), site 457

This is sufficient to plot all 778 battles on a map and link them to their parent wars (172 wars in Tar Thran).

---

### Finding 9: Historical Figure Movement Data

HF movement is tracked through `change hf state` events:

**State values**:
- `settled`: HF settled at a site (`site_id`) or region (`subregion_id` + `coords`)
- `visiting`: HF visiting a site
- `wandering`: HF wandering in a region/underground area
- `refugee`: HF fled to a location
- (less common: `scouting`, `thief`, `snatcher`, `hunting`)

**Location resolution**:
1. If `site_id != -1`: HF is at that site (use site's `coord_x`, `coord_y` for map position)
2. If `subregion_id != -1` and `coords != "-1,-1"`: HF is in open terrain at that world tile
3. If `feature_layer_id != -1`: HF is underground (no world surface coords available)

**Frequency in Tar Thran**: 76,247 change_hf_state events total:
- 54,364 `settled`
- 15,260 `visiting`
- 5,351 `wandering`
- 790 `refugee`

**Journey collections** (517 in Tar Thran) group movement events. To reconstruct an HF's travel history, collect all `change hf state` events for that HF ordered by `year`+`seconds72`, then resolve each event to a world tile coordinate.

**Migration tracking**: DF does not record individual travel paths — only state changes. The journey collection groups the state-change events conceptually, but within the collection, movement is inferred from sequential state changes. There is no "arrived at waypoint X then Y then Z" data.

---

### Finding 10: The `feature_layer_id` Field

Every geographic event has a `feature_layer_id`. This is a reference to underground regions (`underground_regions.id`). When an event occurs underground (cave, cavern, underworld), `site_id` may be -1 and `feature_layer_id` points to the underground region. Since underground regions have world-tile `coords` in `legends_plus.xml`, an underground event can be approximately mapped to the surface by using the underground region's tile coverage centroid.

---

## Comparison: Map Data Sources

| Data Source | Terrain Colors | Site Positions | Region Boundaries | Rivers | Roads | Battle Positions | HF Movement |
|-------------|---------------|----------------|-------------------|--------|-------|-----------------|-------------|
| Vanilla legends.xml | — | Yes (world tile) | No | No | No | Yes | By site_id |
| legends_plus.xml | — | Yes | Yes (tile lists) | Yes | Yes (world constructions) | Yes | Yes + coords |
| DF 'p' export (bitmap) | Yes (visual) | No (just image) | No | No | No | No | No |
| DF 'd' export (layers) | Yes (per-layer) | No | No | No | No | No | No |
| RFR GetWorldMap | Yes (per-tile biome) | No | No | No | No | No | No |

---

## Recommendations

### 1. Primary Recommendation: Leaflet.js with Procedural Tile Generation

Build the map as a Leaflet.js canvas with a custom tile layer that renders world tiles from CDM data.

**Rationale**: All coordinate data is already in the CDM. No DF image export needed. Matches the approach of LegendsViewer-Next (the most current and maintained viewer). Supports zoom levels, click-to-explore, and animated overlays.

**Implementation approach**:
- Backend API endpoint: `/api/map/tiles/{z}/{x}/{y}` serving PNG tiles rendered from CDM data
- Tile renderer reads region polygon fills, site markers, river paths, road paths at each zoom level
- Region coordinates: parse `regions.coords` pipe-delimited tile list → fill polygons colored by region type + evilness
- Site markers: plot at `(coord_x, coord_y)` world tile center
- Rivers: parse `rivers.path` segments (fields: `world_x, world_y, ?, width, direction`)
- World constructions: parse `world_constructions.coords` for road/bridge/tunnel paths

**Caveats**: No terrain coloring (elevation, biome) without DFHack RFR data. Regions are the best proxy for biome coloring (type + evilness).

### 2. Alternative: Use DF-Exported Map Image as Base Layer

If the user exports the world bitmap from DF (press 'p' in Legends, then 'd' for detailed layers), this can serve as the visual base. Overlay site markers and event data on top.

**When to use**: If photorealistic terrain appearance is desired, or if real-time DFHack access is available to call `GetWorldMap`.

**Caveats**: Requires user to export files from DF; not hands-off. Image coordinate alignment requires knowing exact world dimensions to scale correctly.

### 3. Data Gaps to Address

Before building the map feature, address these schema gaps:

1. **Battle coordinates**: `history_event_collections.details` JSONB contains `coords` but no indexed columns. Add `coord_x INT`, `coord_y INT` to `history_event_collections` and extract from JSONB.

2. **HF movement coordinates**: `history_events.details` JSONB likely has coords for `change hf state` events. Verify and potentially add indexed columns or a `hf_movement_timeline` view.

3. **Site `rectangle` field**: Not stored in CDM `sites` table. This is needed for precise site boundary rendering (especially for larger sites like fortresses). Add `rectangle TEXT` column.

---

## Action Items

- [ ] Add `coord_x INT`, `coord_y INT` to `history_event_collections` table; backfill from `details->>'coords'`
- [ ] Add `rectangle TEXT` to `sites` table; re-ingest from legends XML
- [ ] Create a `/api/map/data` endpoint returning all geographic features (sites, regions, rivers, roads) as GeoJSON or similar
- [ ] Build a Leaflet.js map component with region polygon layer, site marker layer, river path layer, road layer
- [ ] Add battle event overlay: plot battle markers at `coord_x/coord_y` with link to battle detail page
- [ ] Add HF movement timeline: for a given HF, reconstruct movement history from `change hf state` events ordered by `year`+`seconds`
- [ ] Optionally: implement RFR `GetWorldMap` call via SSH bridge to get per-tile biome/elevation data for base layer coloring

---

## Sources

1. [Dwarf Fortress Wiki — XML dump](https://dwarffortresswiki.org/index.php/XML_dump)
2. [Dwarf Fortress Wiki — XML dump (DF2014)](https://dwarffortresswiki.org/index.php/DF2014:XML_dump)
3. [Dwarf Fortress Wiki — v0.31 XML dump (most detailed field docs)](https://dwarffortresswiki.org/index.php/v0.31:XML_dump)
4. [Dwarf Fortress Wiki — World Generation](https://dwarffortresswiki.org/index.php/World_generation)
5. [Dwarf Fortress Wiki — Advanced World Generation](https://dwarffortresswiki.org/index.php/Advanced_world_generation)
6. [Dwarf Fortress Wiki — Legends mode](https://dwarffortresswiki.org/index.php/DF2014:Legends)
7. [DFHack exportlegends documentation](https://docs.dfhack.org/en/stable/docs/tools/exportlegends.html)
8. [DFHack Maps API documentation](https://docs.dfhack.org/en/latest/docs/api/Maps.html)
9. [DFHack RemoteFortressReader C++ source](https://github.com/DFHack/dfhack/blob/develop/plugins/remotefortressreader/remotefortressreader.cpp)
10. [LegendsViewer-Next GitHub](https://github.com/Kromtec/LegendsViewer-Next)
11. [LegendsBrowser2 GitHub](https://github.com/robertjanetzko/LegendsBrowser2)
12. [DwarvenSurveyor (XML to map tool)](https://github.com/itsiggyboy/DwarvenSurveyor)
13. [dfhack-remote Rust client](https://github.com/plule/dfhack-remote)

---

## Uncertainties

- **River path field 3**: The third field in river path segments (e.g., `32,27,**0**,12,99`) appears to be an elevation or cumulative-distance offset but exact meaning is not documented in the official wiki. Reverse-engineering from LegendsViewer-Next source code would clarify this.
- **River direction codes**: Values 99, 100, 104, 105, 106 appear to be special terminus/branching codes. Standard direction codes 0–7 (N/NE/E/SE/S/SW/W/NW) are assumed for non-terminal segments.
- **`GetWorldMap` availability**: Whether RFR `GetWorldMap` is callable from Chronicler's bridge (given TCP limitations on ARM DFHack) has not been verified. Likely requires the SSH + `dfhack-run` approach.
- **Site `rectangle` exact semantics**: For single-tile sites (point dungeons/lairs), `rectangle` is `x,y:x,y` (same corner twice). The exact size meaning for multi-tile sites (towns, hillocks) needs verification — whether it encompasses all structures or just the declared site footprint.

---

## Related Topics

- Phase 5 Visualization (full heatmap, animated timelines, political history)
- DFHack `devel/export-map` tool for local fortress tile export
- DFHack `legends_processor.lua` (if it exists) for additional geographic enrichment
- Leaflet.js custom CRS (Coordinate Reference System) for non-geographic pixel maps
- Potential use of WebGL/Canvas for performance with 257×257 = 66,000+ tile worlds
