# Research Report: DwarvenSurveyor + myDFHackScripts Feature Inventory

**Date**: 2026-02-23
**Scope**: Full source code analysis of two DF-adjacent repos — a Unity-based world map visualizer and a DFHack Lua scripting collection — evaluated for Chronicler integration potential.

---

## PART 1: DwarvenSurveyor

### Purpose

A Unity 3D desktop application that reads DF world export XML files and renders an interactive 2D world map with colored biome regions and clickable site markers. It is a **post-hoc visualization tool**, not a live DFHack plugin — it does not connect to a running game.

### Data Access Method

DwarvenSurveyor reads **two static XML export files**:

1. **`legends.xml`** — the standard DF Legends Mode export, produced by the "Export XML" button in Legends Mode. Contains `<site>` and `<region>` elements with names, types, and coordinates.
2. **`legends_plus.xml`** — produced by running the DFHack `exportlegends` command. Contains `<region>` elements with per-tile coordinate arrays (pipe-delimited `x,y|x,y|...` format) and evilness ratings.

Both files are read via .NET `XmlReader` with `System.Text.Encoding.UTF8` / `.ASCII`. There is no DFHack RPC, no memory reading, no live connection.

### Complete Feature List

| Component | File | What It Does |
|---|---|---|
| `MapXMLParser.cs` | Core engine | Parses both XML files, instantiates region meshes and site objects, manages camera bounds, runs search |
| `Region.cs` | Region interaction | Mouse-over highlight on hover; displays name, type in sidebar |
| `RegionPanel.cs` | UI panel | Displays region name, type, evilness on mouse-over |
| `Site.cs` | Site interaction | Mouse-over on site marker; shows name, type, coordinates; activates outline highlight |
| `SitePanel.cs` | UI panel | Floating tooltip that follows mouse cursor; shows site name, type, coordinates |
| `CameraMover.cs` | Navigation | Pan camera with arrow keys or WASD; enforces map bounds |
| `SearchButtonCameraJump.cs` | Search UX | Click a search result to jump camera to that site or region |
| `CoordinateChangeHandler.cs` | Utility | Handles coordinate system conversions |
| `MeshCenterFinder.cs` | Geometry | Calculates centroid of each region mesh for camera jump targeting |
| `ErrorManager.cs` | UX | Displays colored error messages in the UI |
| `AnimHelper.cs` | UI animation | Iggy mascot head idle/select/deselect animations |
| `ResolutionSaver.cs` | Persistence | Saves window resolution across sessions |
| `SelfDestruct.cs` | Utility | Destroys game object after timer (used for temporary UI elements) |
| `URLOpener.cs` | UI | Opens URLs in browser (about/help links) |
| Materials (10) | Assets | Per-biome Unity materials: wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains |

### Data Structures Extracted from XML

**SiteData** (from `legends.xml`):
- `name` — site name (title-cased)
- `type` — one of 20 site types: Camp, Cave, Dark Fortress, Dark Pits, Forest Retreat, Fortress, Castle, Fort, Hamlet, Hillocks, Labyrinth, Lair, Monastery, Mountain Halls, Ruins, Shrine, Tomb, Tower, Town, Vault
- `coord` — `Vector2Int` (world tile x,y)
- `rectangle` — `Rect` (xMin:yMin,xMax:yMax bounding box in world tiles / 16)

**RegionData** (merged from both XMLs):
- `name` — region name
- `type` — one of 10 biome types: Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains
- `evilness` — string (from legends_plus)
- `coords` — `Vector2Int[]` — every world tile occupied by this region (from legends_plus pipe-delimited coords)

### Map Rendering Approach

- Each biome region is a **Unity Mesh** — one quad per world tile in `coords[]`. Regions with >10,000 tiles are split into 4 meshes to stay under Unity vertex limits.
- Each site is a **Unity Sprite** — color-coded by site type, scaled to the `rectangle` dimensions.
- Y-axis is flipped (DF's coordinate system has Y inverted relative to Unity screen space).
- The `regionDataMap[x,y]` lookup array maps every world tile coordinate to its region — enabling fast hover detection.

### Chronicler Relevance

**High relevance for map visualization in the explorer.** The XML parsing logic is a clean reference implementation:

1. The `ParseCoordinates` method — parsing `x,y|x,y|x,y` pipe-delimited coordinate strings from `legends_plus.xml` — is directly reusable as a Python algorithm for map tile ingestion.
2. The site type taxonomy (20 site types with indices 0-19) matches what we'd expect to store in the `sites` table.
3. The biome type taxonomy (10 biome types) matches `region` classification.
4. The `evilness` field from legends_plus is data we could add to Chronicler's `regions` table if not already present.
5. The `rectangle` coordinate (the 4-corner bounding box) for sites is separate from the single `coord` tile.

---

## PART 2: myDFHackScripts

### Purpose

A personal DFHack Lua scripting collection for fortress-mode statistics logging, event capture, and in-game GUI visualization. The system captures live game events into a structured CSV-like log file and provides analysis and visualization tools over that log.

### Complete Script Inventory

| Script | Category | What It Does |
|---|---|---|
| `FortressStatistics.lua` | **Main entrypoint** | Orchestrator: enables DFHack eventful hooks (ITEM_CREATED, UNIT_DEATH, JOB_COMPLETED, INVASION), starts polling watcher at 500-tick interval |
| `LogHandler.lua` | Infrastructure | File I/O layer. Writes/reads the log file. Prepends timestamp (day,month,year) to every line. Deduplicates consecutive identical messages |
| `Helper.lua` | Infrastructure | Core utility library. Date reading, unit lookup by id, name translation, enum resolution, table serialization/deserialization, death cause lookup via `df.global.world.incidents.all`, killer identification |
| `AnnouncementLogger.lua` | Event capture | Polls `df.global.world.status.reports` every 500 ticks. Logs new report text with id and repeat_count |
| `ItemLogger.lua` | Event capture | Fires on `ITEM_CREATED` event. Logs item id, type, material, name, description, maker, quality (0-5), value, artifact flag |
| `DeathLogger.lua` | Event capture | Fires on `UNIT_DEATH` event. Logs unit id, readable name, race, death cause (resolved enum), killer name, whether killer is a citizen, killer race |
| `JobLogger.lua` | Event capture | Fires on `JOB_COMPLETED` event. Logs job name, job type (enum), worker name |
| `CitizenLogger.lua` | Event capture | Polls `df.global.world.units.active` every 500 ticks. Detects citizen count changes. Logs new citizens with id, name, race, age, sex |
| `InvasionLogger.lua` | Event capture | Stub — registers path setup. Invasions logged via `eventful.onInvasion` |
| `PetitionLogger.lua` | Event capture | Polls `df.global.world.agreements.all` every 500 ticks. Detects petition count changes |
| `AnnounceBooks.lua` | Event capture | Polls `df.global.world.items.all` for book items with titles. Detects when a fortress citizen writes a new book |
| `MaterialHelper.lua` | Data helper | Classifies items by material category: Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature |
| `LogParser.lua` | Analysis | Reads the log file and parses it into typed structs by event type. Job counts, top workers, masterwork counts, citizen arrivals by year, deaths by year |
| `CurveWidget.lua` | GUI | Custom DFHack GUI widget that renders a bar/line graph with coordinate axes and slider controls |
| `unit.lua` | Exploration | Loads all units, walks parent relationships via `unit.relationship_ids.Mother/Father` |

### Key DF Data Access Patterns

#### Unit Access
```lua
df.global.world.units.active
df.global.world.units.all
dfhack.units.isCitizen(unit)
dfhack.translation.translateName(unit.name)
dfhack.units.getReadableName(unit)
dfhack.units.getRaceName(unit)
dfhack.units.getAge(unit)
dfhack.units.isMale(unit)
unit.hist_figure_id
```

#### Historical Figure Access
```lua
df.global.world.history.figures
unit.relationship_ids.Mother  -- hist_figure_id of mother
unit.relationship_ids.Father  -- hist_figure_id of father
dfhack.translation.translateName(histfig.name)
```

#### Death / Incident Access
```lua
df.global.world.incidents.all
-- Filter for death incidents
if incident.type == df.incident_type.Death then
    death.victim    -- unit_id of victim
    death.criminal  -- unit_id of killer
    death.death_cause -- enum death_type
end
df.death_type[death_cause_enum_value]
```

#### Item Access
```lua
df.global.world.items.all
df.item.find(item_id)
dfhack.items.getDescription(item, 0)
dfhack.items.getValue(item)
dfhack.items.getBookTitle(item)
item.flags.artifact
item.quality  -- 0-5, 5=masterwork
item.maker    -- hist_figure_id
```

#### Announcement / Report Access
```lua
df.global.world.status.reports
reports[#reports - 1].text
reports[#reports - 1].id
```

#### Game Date
```lua
dfhack.world.ReadCurrentDay()
dfhack.world.ReadCurrentMonth()
dfhack.world.ReadCurrentYear()
```

### Chronicler Relevance

**Very high relevance.** Key transferable patterns:

1. **Death Cause Resolution** (HIGH) — `Helper.getIncidentDeathCauseByVictimId` searches `df.global.world.incidents.all` for death causes and killer IDs
2. **HF Lineage Traversal** (HIGH) — `unit.relationship_ids.Mother/Father` -> `df.global.world.history.figures`
3. **Book/Written Work Detection** (MEDIUM) — `dfhack.items.getBookTitle(item)` for in-game book creation events
4. **Material Classification** (MEDIUM) — Complete lookup tables for all DF material types
5. **Citizen Arrival Detection** (MEDIUM) — `dfhack.units.isCitizen(unit)` + change detection
6. **Event Loop / Polling Pattern** (HIGH) — `dfhack.timeout(500, 'ticks', tick)` + `eventful.enableEvent` confirms the bridge pattern

### Action Items

- [ ] Test `df.global.world.incidents.all` accessibility on DFHack 53.10-r1
- [ ] Test `unit.relationship_ids.Mother/Father` accessibility for fortress units
- [ ] Port death cause resolution to `chronicler-bridge.lua`
- [ ] Port parent-chain walk for HF lineage extraction
- [ ] Port book detection for written work events
- [ ] Verify `evilness` field in Chronicler `regions` table
