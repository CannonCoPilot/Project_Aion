# Consolidation: Worldgen Scraping & DwarfHack Scripting Research

**Consolidated**: 2026-02-24
**Sources**: worldgen-scraping-research.md + dwarven-surveyor-scripts-research.md

---

## Source Documents

- **worldgen-scraping-research.md**: Deep technical research into DFHack's `df.global.world.worldgen_status` struct, establishing that Chronicler can be the first tool to monitor Dwarf Fortress world generation in real time, with a complete Lua implementation template (`worldgen-bridge.lua`) and full data access map.
- **dwarven-surveyor-scripts-research.md**: Source code analysis of DwarvenSurveyor (a Unity XML-based world map visualizer) and myDFHackScripts (a DFHack Lua scripting collection for fortress-mode event capture), yielding a comprehensive catalog of map data structures, event hook patterns, and DF data access paths directly applicable to Chronicler.

---

## Feature Ideas for Chronicler

### 1. Real-Time Worldgen Monitor (Novel Capability — No Existing Tool Does This)

Chronicler has the opportunity to be the **first-ever tool** that monitors Dwarf Fortress world generation in real time. No DFHack plugin, community script, or third-party tool has ever polled live worldgen data during generation. All existing tools (exportlegends, df-ai, weblegends) only read data after generation is complete.

**Sub-features**:

- **Live Phase Progress Display**: Show the current worldgen phase (one of 12 states: None, Initializing, PreparingElevation, SettingTemperature, RunningRivers, FormingLakesAndMinerals, GrowingVegetation, VerifyingTerrain, ImportingWildlife, RecountingLegends, Finalizing, Done) as generation proceeds. Map this directly to a progress bar in the Chronicler UI.
- **River Generation Progress**: Show `rivers_cur / rivers_total` as a percentage during the RunningRivers phase.
- **Civilization Placement Counter**: Show `civ_count` and `civs_left_to_place` during the Finalizing phase — watch civilizations appear one by one.
- **Historical Figure Count Live Feed**: Show `#world.history.figures` incrementing during RecountingLegends (state 8), where the bulk of history is written.
- **Historical Event Count Live Feed**: Show `#world.history.events` growing in real time.
- **Era Formation Tracker**: Show `#world.history.eras` as new eras open.
- **Entity Count Live Feed**: Watch `#world.entities.all` and `#worldgen_status.entities` as civilizations form.
- **Site Count Live Feed**: Watch `#worldgen_status.sites` and `#world.world_data.sites` fill during site placement.
- **Beast Placement Flags**: Binary indicators for `placed_megabeasts`, `placed_caves`, `placed_good_evil`, `finished_prehistory`.
- **Rejection Counter**: Show `num_rejects` — how many times the world engine has rejected a terrain configuration and restarted.
- **Rampage Counter**: Show `rampage_num` — megabeast rampages during prehistory.
- **New Events Stream**: Real-time feed of the most recently added history events (id, type, year) as generation writes them, using `last_event_id_added` as a cursor.
- **World Parameters Summary**: Display seed, world title, dimensions (dim_x, dim_y), end year, and civilization caps from `worldgen_parms` the moment generation begins.
- **Terrain Geography Accumulation**: Track `region_count`, `landmass_count`, `river_count`, `geo_biome_count`, `site_count` from `world_data` as terrain phases fill these vectors.
- **Terrain Tile Grid Snapshot** (experimental): Read the `world_data.region_map` 2D elevation/rainfall/temperature/volcanism/evilness grid during terrain phases for a real-time evolving world map preview.
- **Auto-Start/Stop Monitoring**: Automatically begin recording when the user enters the worldgen screen and stop when generation completes, with no user intervention required.
- **Worldgen Complete Trigger**: Detect `worldgen_status.state == 10` (combined with `#world.entities.all > 0` and `viewscreen_new_regionst.simple_mode == 0`) and fire the Chronicler post-worldgen ingestion pipeline automatically.

### 2. Worldgen Snapshot Database (CDM Extension)

- **`worldgen_snapshots` Table**: Persist every polled snapshot to a new CDM table. Schema: `(world_name, seed, state_id, state_name, snapshot_ts, figure_count, event_count, era_count, civ_count, civs_left, rivers_cur, rivers_total, rampage_num, num_rejects, entity_count, site_count, landmass_count, river_count, geo_biome_count, snapshot_num)`.
- **`worldgen_complete` Record**: Write a final completion record when `state == 10` is first detected, capturing all final counts.
- **World Parameters Record**: Store `worldgen_parms` (seed, title, dim_x, dim_y, end_year, total_civ_number, megabeast_cap, etc.) in a dedicated `worldgen_params` table for cross-world comparison.
- **Cross-World Analytics**: Compare worldgen characteristics across multiple generated worlds — which seeds produce more events, more civilizations, longer prehistory, more rejections.
- **`chronicler worldgen-watch` CLI Command**: Python-side command that reads the JSON snapshots from `worldgen-bridge.lua` and ingests them into the CDM in real time.

### 3. Interactive World Map Visualizer

Derived from DwarvenSurveyor's architecture, adapted as a Chronicler UI panel:

- **Biome Region Map**: Render each biome region as a colored mesh/polygon on a 2D world map. Support 10 biome types: Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains — each with a distinct color/material.
- **Evilness Overlay**: Color-code or overlay regions by evilness rating (from `legends_plus.xml` or CDM). Allow toggling evilness as a map layer.
- **Site Markers**: Place clickable icons on the map for each site. Color-code by site type across the full 20-type taxonomy: Camp, Cave, Dark Fortress, Dark Pits, Forest Retreat, Fortress, Castle, Fort, Hamlet, Hillocks, Labyrinth, Lair, Monastery, Mountain Halls, Ruins, Shrine, Tomb, Tower, Town, Vault.
- **Site Hover Tooltips**: Floating tooltip on mouse-over showing site name, type, coordinates, controlling entity, and historical summary.
- **Region Hover Panel**: Sidebar panel showing region name, type, evilness, and historical events on mouse-over.
- **Camera Navigation**: Pan/zoom the world map with arrow keys, WASD, or click-drag. Enforce map bounds.
- **Search and Jump**: Search for a site or region by name; click result to jump camera to that location.
- **Site Bounding Box**: Show the site `rectangle` (4-corner bounding box in world tiles) in addition to the single `coord` marker.
- **Large Region Support**: Handle regions with >10,000 tiles by splitting into multiple render chunks (DwarvenSurveyor splits into 4 meshes; Chronicler should use viewport culling for performance).
- **`regionDataMap` Fast Lookup**: Pre-compute a `world_width x world_height` 2D array mapping every world tile to its region for O(1) hover detection.
- **Y-Axis Flip Handling**: Account for DF's inverted Y coordinate system when rendering (DF Y=0 is top; screen Y=0 is typically bottom).
- **Worldgen Live Map Preview**: During worldgen, update the map as terrain phases complete — show regions appearing, rivers drawing, sites being placed in real time.

### 4. Fortress-Mode Event Capture & Logging

Derived from myDFHackScripts pattern, adapted for Chronicler's bridge:

- **Announcement / Report Logger**: Poll `df.global.world.status.reports` to capture all in-game announcement text with id and repeat_count. Ingest to CDM for searchable announcement history.
- **Item Creation Logger**: Hook `ITEM_CREATED` eventful event. Log item id, type, material, name, description, maker (hist_figure_id), quality (0-5), value, and artifact flag.
- **Death Logger**: Hook `UNIT_DEATH` event. Log unit id, name, race, death cause (resolved from enum), killer name, whether killer is a fortress citizen, and killer race.
- **Job Completion Logger**: Hook `JOB_COMPLETED` event. Log job name, job type (enum), and worker name.
- **Citizen Arrival Logger**: Poll `df.global.world.units.active` every N ticks. Detect citizen count changes. Log new citizens with id, name, race, age, sex.
- **Invasion Logger**: Hook `eventful.onInvasion`. Log invasion events with entity, time, and outcome.
- **Petition Logger**: Poll `df.global.world.agreements.all` to detect new petitions or treaty changes.
- **Written Work / Book Logger**: Poll `df.global.world.items.all` for book items using `dfhack.items.getBookTitle(item)`. Detect when a fortress citizen writes a new book — capture title, author, content type.
- **Masterwork Tracker**: Count items with `quality == 5` over time. Graph masterwork production rate.
- **Top Worker Analysis**: Aggregate job completion records to rank workers by completed jobs, masterworks, or job type specialization.
- **Citizen Arrival by Year**: Track when each citizen joined the fortress, enabling historical migration graphs.
- **Deaths by Year / Cause**: Aggregate death records by year and cause for mortality analysis.
- **In-Game Bar/Line Graph Widget**: Render time-series graphs inside the DF UI using a DFHack GUI widget (like CurveWidget.lua) for stats like deaths, arrivals, production over time — without leaving the game.

### 5. Death Cause & Incident Investigation

- **Death Cause Resolution**: Search `df.global.world.incidents.all` for death incidents by victim unit id. Resolve `death_cause` enum to human-readable string. Identify the killer's unit id and name.
- **Killer Identification**: From a `UNIT_DEATH` event, walk `world.incidents.all` to find the associated incident, extract `incident.criminal` (killer unit_id), resolve the killer's name via `dfhack.units.getReadableName`.
- **Citizen/Non-Citizen Kill Classification**: Flag whether a death was caused by a fortress citizen (friendly fire, accidents) vs. an enemy or wildlife.
- **Death Cause Taxonomy**: Maintain a complete `df.death_type` enum lookup table for all possible death causes.
- **Incident-to-Historical-Event Linkage**: Link fortress-mode death incidents to pre-existing historical figure death events in the Legends database when a historical figure is involved.

### 6. Historical Figure Lineage Extraction

- **Parent-Chain Walk**: Given a unit's `unit.relationship_ids.Mother` and `unit.relationship_ids.Father` (both are hist_figure_ids), walk the full lineage tree by resolving each into `df.global.world.history.figures`.
- **Family Tree Builder**: Recursively construct family trees for fortress citizens and notable historical figures.
- **Ancestor/Descendant Search**: Given a historical figure id, find all known ancestors (walk up parent chain) and all known descendants (scan figures for matching parent ids).
- **Lineage Database**: Store resolved lineage relationships in the CDM for graph query and UI display.

### 7. Item & Artifact Tracking

- **Complete Material Classification**: Use a full lookup table classifying DF materials into categories: Gem, Rock, EconomicStone, Ore, Metal, Wood, Plant, Creature. Apply this to all item logging.
- **Artifact Registry**: Track all items with `item.flags.artifact == true`. Record maker, creation year, name, material, description, and current owner/location.
- **Quality Distribution Dashboard**: Track quality distribution (0-5) for produced items over time. Show per-worker and per-job-type quality curves.
- **Item Value Tracking**: Record `dfhack.items.getValue(item)` for produced items. Track economic output over time.

### 8. XML-Based World Data Ingestion (Post-Worldgen)

Derived from DwarvenSurveyor's parsing approach:

- **`legends.xml` Parser**: Parse DF's standard Legends Mode export for sites and regions. Extract name, type, coord, and rectangle for every site. Extract region name and type for every region.
- **`legends_plus.xml` Parser**: Parse DFHack's `exportlegends` output for per-tile region coordinate arrays (pipe-delimited `x,y|x,y` format) and evilness ratings.
- **`ParseCoordinates` Algorithm**: Implement the pipe-delimited coordinate string parser as a Python utility — split on `|`, split each pair on `,`, construct a list of `(x, y)` integer tuples.
- **Site Type Taxonomy (20 types)**: Ingest and store all 20 DF site types with their indices (Camp=0 through Vault=19).
- **Region Type Taxonomy (10 biome types)**: Ingest and store all 10 biome types with their indices.
- **`evilness` Field for Regions**: Add `evilness` (string, from legends_plus) to the CDM `regions` table if not already present.
- **Site Rectangle Storage**: Store both the single `coord` tile and the `rectangle` (bounding box) for sites in the CDM `sites` table.

### 9. Automated Post-Worldgen Ingestion Pipeline

- **Completion Detection**: Detect `worldgen_status.state == 10` and auto-trigger the full Chronicler ETL pipeline (export legends, ingest CDM, run analysis).
- **`exportlegends` Auto-Run**: After worldgen completes, auto-run DFHack's `exportlegends` command to produce `legends.xml` and `legends_plus.xml` without requiring user action in Legends Mode.
- **Auto-Embark Scripting**: Optionally leverage df-ai's `worldgen_status.state == 10` detection to auto-trigger embark after generation, enabling fully automated world-generate-and-embark workflows.

### 10. Cross-Session Persistence & Analytics

- **Log File Persistence**: Write all event logs to a structured file with timestamp (day, month, year) prepended to every line. Support deduplication of consecutive identical messages.
- **Log Parser for Historical Analysis**: Parse the structured log file into typed structs by event type. Enable queries: job counts, top workers, masterwork counts, citizen arrivals by year, deaths by year.
- **Session Continuity**: Detect whether a log already exists for the current fortress and append rather than overwrite. Preserve all prior sessions' data.

---

## Reference Implementations

### worldgen-bridge.lua (Complete Template)

A fully working Lua script for polling worldgen state and writing JSON snapshots. Deploy via `repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]`. Key implementation details:

- Guard execution with `dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)` — do nothing if not on worldgen screen.
- Wrap `df.global.world.world_data` access in `pcall` since it is a pointer that may be nil during early phases.
- Use `ws.last_event_id_added` as a cursor to extract only newly added events since the previous poll (scan backwards through `world.history.events` until `event.id <= last_event_id`).
- Cap new event extraction at 50 per poll to avoid JSON size explosion during RecountingLegends.
- Convert DF strings with `dfhack.df2utf()` to handle special characters in world titles.

```lua
-- worldgen-bridge.lua — Chronicler worldgen monitor
local json = require('json')
local wg_state = { last_event_id = -1, snapshots = 0 }

local STATE_NAMES = {
    [-1]='None', [0]='Initializing', [1]='PreparingElevation',
    [2]='SettingTemperature', [3]='RunningRivers',
    [4]='FormingLakesAndMinerals', [5]='GrowingVegetation',
    [6]='VerifyingTerrain', [7]='ImportingWildlife',
    [8]='RecountingLegends', [9]='Finalizing', [10]='Done',
}

local function get_worldgen_snapshot()
    local ws    = df.global.world.worldgen_status
    local parms = df.global.world.worldgen.worldgen_parms
    local snap  = {
        timestamp  = os.time(),
        state_id   = ws.state,
        state_name = STATE_NAMES[ws.state] or 'Unknown',
        seed        = parms.seed,
        world_title = dfhack.df2utf(parms.title),
        dim_x       = parms.dim_x,
        dim_y       = parms.dim_y,
        end_year    = parms.end_year,
        rivers_cur          = ws.rivers_cur,
        rivers_total        = ws.rivers_total,
        civ_count           = ws.civ_count,
        civs_left_to_place  = ws.civs_left_to_place,
        rampage_num         = ws.rampage_num,
        num_rejects         = ws.num_rejects,
        placed_caves        = ws.placed_caves,
        placed_good_evil    = ws.placed_good_evil,
        placed_megabeasts   = ws.placed_megabeasts,
        finished_prehistory = ws.finished_prehistory,
        figure_count  = #df.global.world.history.figures,
        event_count   = #df.global.world.history.events,
        era_count     = #df.global.world.history.eras,
        entity_count  = #df.global.world.entities.all,
        gen_entity_count = #ws.entities,
        gen_site_count   = #ws.sites,
        snapshot_num = wg_state.snapshots,
    }
    -- Geography (pointer may be nil early)
    local wd_ok, wd = pcall(function() return df.global.world.world_data end)
    if wd_ok and wd then
        snap.region_count    = #wd.regions
        snap.site_count      = #wd.sites
        snap.landmass_count  = #wd.landmasses
        snap.river_count     = #wd.rivers
        snap.geo_biome_count = #wd.geo_biomes
    end
    -- New events since last poll (cursor-based, capped at 50)
    local events  = df.global.world.history.events
    local ev_count = #events
    local new_events = {}
    if wg_state.last_event_id < 0 then
        wg_state.last_event_id = ws.last_event_id_added
    else
        local start_idx = ev_count
        for i = ev_count - 1, 0, -1 do
            if events[i].id <= wg_state.last_event_id then
                start_idx = i + 1; break
            end
            if i == 0 then start_idx = 0 end
        end
        local cap = math.min(ev_count, start_idx + 50)
        for i = start_idx, cap - 1 do
            local ev = events[i]
            table.insert(new_events, { id=ev.id, type=ev:getType(), year=ev.year })
            wg_state.last_event_id = ev.id
        end
    end
    snap.new_events = new_events
    wg_state.snapshots = wg_state.snapshots + 1
    return snap
end

local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
if not vs then return end
local ok, err = pcall(function()
    local snap = get_worldgen_snapshot()
    json.encode_file(snap, 'chronicler-worldgen.json')
end)
if not ok then dfhack.printerr('worldgen-bridge: ' .. tostring(err)) end
```

**Deploy**:
```
repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]
```
**Stop**:
```
repeat --cancel worldgen-monitor
```

### Auto-Start Hook for worldgen-bridge (dfhack-config/init.lua)

Register a `SC_VIEWSCREEN_CHANGED` handler to start/stop monitoring automatically when the user enters or leaves the worldgen screen:

```lua
dfhack.onStateChange.worldgen_monitor = function(state)
    if state == SC_VIEWSCREEN_CHANGED then
        local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
        if vs then
            dfhack.run_command('repeat', '--name', 'worldgen-monitor',
                '--time', '30', '--timeUnits', 'frames',
                '--command', '[', 'worldgen-bridge', ']')
        else
            pcall(function()
                dfhack.run_command('repeat', '--cancel', 'worldgen-monitor')
            end)
        end
    end
end
```

### FortressStatistics.lua (myDFHackScripts Orchestrator Pattern)

The orchestrator pattern: enables DFHack eventful hooks (ITEM_CREATED, UNIT_DEATH, JOB_COMPLETED, INVASION) at startup, then starts a polling watcher at 500-tick intervals. Each subsystem (LogHandler, ItemLogger, DeathLogger, etc.) is a separate module. This is the exact architecture to replicate for `chronicler-bridge.lua` subsystems.

### LogHandler.lua (File I/O Layer)

- Prepends `day,month,year` timestamp to every log line.
- Deduplicates consecutive identical messages (tracks `last_message` and skips write if identical).
- Reads the log back for analysis by splitting on newlines and parsing each line.

### MapXMLParser.cs (DwarvenSurveyor — XML Parsing Reference)

Region coordinate parsing (pipe-delimited format from `legends_plus.xml`):
```csharp
// Each region's coords attribute: "x,y|x,y|x,y|..."
string[] pairs = coordString.Split('|');
foreach (string pair in pairs) {
    string[] xy = pair.Split(',');
    coords.Add(new Vector2Int(int.Parse(xy[0]), int.Parse(xy[1])));
}
```
Python equivalent:
```python
def parse_coordinates(coord_str: str) -> list[tuple[int, int]]:
    return [tuple(map(int, pair.split(','))) for pair in coord_str.split('|') if pair]
```

### CurveWidget.lua (In-Game Graph Widget)

A custom DFHack GUI widget that renders bar/line graphs with coordinate axes and slider controls inside the DF UI. Can be adapted for displaying Chronicler stats (citizen count, deaths, production) without leaving the game.

### Helper.lua (Death Cause Resolution)

Complete algorithm for resolving death causes from incidents:
```lua
function Helper.getIncidentDeathCauseByVictimId(unit_id)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death
           and incident.victim == unit_id then
            local cause = df.death_type[incident.death_cause]
            local killer_id = incident.criminal
            return cause, killer_id
        end
    end
    return nil, nil
end
```

---

## Data Access Patterns

### Worldgen Access Paths (All Verified for DF 53.10-r1)

```lua
-- Primary state machine
local ws         = df.global.world.worldgen_status
local state_val  = ws.state          -- int16_t: -1..10
local state_name = df.world_generatorst.T_state[state_val]

-- Progress counters
local rivers_done  = ws.rivers_cur
local rivers_total = ws.rivers_total
local civs_placed  = ws.civ_count
local civs_left    = ws.civs_left_to_place
local rampage_ct   = ws.rampage_num
local last_event   = ws.last_event_id_added  -- cursor into history.events
local num_rejects  = ws.num_rejects

-- Phase completion flags (bool)
local caves_placed      = ws.placed_caves
local good_evil_placed  = ws.placed_good_evil
local megabeasts_placed = ws.placed_megabeasts
local prehistory_done   = ws.finished_prehistory
local last_chron_time   = ws.last_chronicle_add_time  -- ulong timestamp

-- Worldgen parameters (set before generation)
local parms      = df.global.world.worldgen.worldgen_parms
local seed       = parms.seed
local title      = dfhack.df2utf(parms.title)
local dim_x      = parms.dim_x
local dim_y      = parms.dim_y
local end_year   = parms.end_year
local total_civs = parms.total_civ_number
local mega_cap   = parms.megabeast_cap
local semi_cap   = parms.semimegabeast_cap
local titan_num  = parms.titan_number
local demon_num  = parms.demon_number

-- Live history accumulation
local fig_count   = #df.global.world.history.figures
local event_count = #df.global.world.history.events
local era_count   = #df.global.world.history.eras
local mega_live   = #df.global.world.history.live_megabeasts
local semi_live   = #df.global.world.history.live_semimegabeasts

-- Geography (pointer; may be nil before terrain phase)
local wd_ok, wd = pcall(function() return df.global.world.world_data end)
if wd_ok and wd then
    local n_regions    = #wd.regions
    local n_sites      = #wd.sites
    local n_landmasses = #wd.landmasses
    local n_rivers     = #wd.rivers
    local n_geo_biomes = #wd.geo_biomes
    local n_mtn_peaks  = #wd.mountain_peaks
    local n_underground = #wd.underground_regions
    -- world_gen_wandering_group: worldgen-only temp data (nil post-worldgen)
end

-- Generator vectors (separate from world_data)
local gen_entities = #ws.entities  -- fills during prehistory
local gen_sites    = #ws.sites     -- fills during site placement

-- Viewscreen detection
local vs          = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
local in_worldgen = (vs ~= nil and vs.simple_mode == 0)
local is_done     = (ws.state == 10)
```

### Fortress-Mode Unit Access Paths

```lua
-- Active units and all units
df.global.world.units.active
df.global.world.units.all

-- Unit predicates
dfhack.units.isCitizen(unit)
dfhack.units.isMale(unit)
dfhack.units.getAge(unit)

-- Name and race resolution
dfhack.units.getReadableName(unit)
dfhack.units.getRaceName(unit)
dfhack.translation.translateName(unit.name)

-- Link to historical figure
unit.hist_figure_id

-- Historical figures
df.global.world.history.figures
dfhack.translation.translateName(histfig.name)
```

### Lineage / Relationship Access Paths

```lua
-- Parent relationships (hist_figure_ids)
unit.relationship_ids.Mother  -- hist_figure_id of mother
unit.relationship_ids.Father  -- hist_figure_id of father

-- Walk to historical figure
local hf = df.historical_figure.find(unit.relationship_ids.Mother)
```

### Death and Incident Access Paths

```lua
-- All incidents (search for death cause)
df.global.world.incidents.all
incident.type       -- compare to df.incident_type.Death
incident.victim     -- unit_id
incident.criminal   -- unit_id of killer
incident.death_cause -- enum value
df.death_type[incident.death_cause]  -- enum -> string

-- Event hooks (eventful API)
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 1)
eventful.onUnitDeath.mykey = function(unit_id) ... end
```

### Item Access Paths

```lua
df.global.world.items.all
df.item.find(item_id)
dfhack.items.getDescription(item, 0)
dfhack.items.getValue(item)
dfhack.items.getBookTitle(item)
item.flags.artifact   -- boolean
item.quality          -- 0-5 (5=masterwork)
item.maker            -- hist_figure_id
```

### Announcement / Report Access Paths

```lua
df.global.world.status.reports
local last_report = reports[#reports - 1]
last_report.text
last_report.id
last_report.repeat_count
```

### Game Date Access Paths

```lua
dfhack.world.ReadCurrentDay()
dfhack.world.ReadCurrentMonth()
dfhack.world.ReadCurrentYear()
```

### Agreements / Petitions Access Paths

```lua
df.global.world.agreements.all
-- Poll for count changes to detect new petitions
```

### DFHack State Change Events (Complete List)

```lua
SC_WORLD_LOADED     = 0  -- after worldgen + world load (CDM ingestion trigger)
SC_WORLD_UNLOADED   = 1
SC_MAP_LOADED       = 2  -- after fortress embark
SC_MAP_UNLOADED     = 3
SC_VIEWSCREEN_CHANGED = 4  -- use for worldgen screen detection
SC_CORE_INITIALIZED = 5
SC_PAUSED           = 7
SC_UNPAUSED         = 8
-- NOTE: No SC_WORLDGEN_STARTED or SC_WORLDGEN_TICK — must poll
```

### `world_generatorst` State Machine (Complete Enum)

| Value | Name | Key Data Being Written |
|-------|------|----------------------|
| -1 | None | (pre-generation) |
| 0 | Initializing | (setup) |
| 1 | PreparingElevation | `world_data.region_map` elevation grid |
| 2 | SettingTemperature | region_map temperature/rainfall |
| 3 | RunningRivers | `rivers_cur/total`, `world_data.rivers` |
| 4 | FormingLakesAndMinerals | `geo_biomes`, `underground_regions` |
| 5 | GrowingVegetation | region vegetation |
| 6 | VerifyingTerrain | world rejection check (num_rejects increments here) |
| 7 | ImportingWildlife | entity_populations |
| 8 | RecountingLegends | `history.events`, `history.figures` (bulk write, high speed) |
| 9 | Finalizing | civ placement, site naming, `civ_count/civs_left_to_place` |
| 10 | Done | all vectors complete, safe to embark or export |

### Data Available During vs After Worldgen (Complete Reference)

| Data | During Worldgen | After Worldgen |
|------|----------------|----------------|
| `worldgen_status.state` (0-10) | Yes — live phase enum | Yes (= 10) |
| `worldgen_status.rivers_cur/total` | Yes — during RunningRivers | Yes (final values) |
| `worldgen_status.civ_count/civs_left_to_place` | Yes — during Finalizing | Yes |
| `worldgen_status.rampage_num` | Yes — during beast rampages | Yes |
| `worldgen_status.entities` vector | Yes — fills during prehistory | Yes (complete) |
| `worldgen_status.sites` vector | Yes — fills during site placement | Yes (complete) |
| `worldgen_status.last_event_id_added` | Yes — cursor into history.events | Yes |
| `worldgen_status.num_rejects` | Yes — increments each rejection | Yes |
| `worldgen_status.last_chronicle_add_time` | Yes — ulong timestamp | Yes |
| `world.history.figures` count | Yes — increments live | Yes (final) |
| `world.history.events` count | Yes — increments live | Yes (final) |
| `world.history.eras` | Yes — adds eras as they start | Yes (complete) |
| `world.history.live_megabeasts` | Yes — fills during beast placement | Yes |
| `world.worldgen.worldgen_parms` | Yes — set before gen starts | Yes (preserved) |
| `world.world_data.regions` vector | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.landmasses` | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.sites` | Yes — fills during site placement | Yes (complete) |
| `world.world_data.region_map` (2D grid) | Yes — fills during PreparingElevation | Yes (complete) |
| `world.world_data.rivers` | Yes — fills during RunningRivers | Yes (complete) |
| `world.world_data.underground_regions` | Yes — fills during Forming phase | Yes (complete) |
| `world.world_data.geo_biomes` | Yes — fills during Forming phase | Yes (complete) |
| `world.world_data.mountain_peaks` | Yes — fills during terrain | Yes (complete) |
| `world.world_data.world_gen_wandering_group` | Yes — worldgen temp data only | NO (nil after completion) |
| `world.worldgen_status.placed_megabeasts` etc. (bool flags) | Yes — set when phase completes | Yes |
| `world.entities.all` | Partial — fills during prehistory | Yes (complete) |
| Fortress-mode units, squads, etc. | No — don't exist yet | Yes (after embark) |

### XML Data Structures (DwarvenSurveyor Reference)

**SiteData** (from `legends.xml`):
- `name` — site name (title-cased)
- `type` — one of 20 site types (indices 0-19)
- `coord` — `(x, y)` world tile
- `rectangle` — `(xMin, yMin, xMax, yMax)` bounding box in world tiles / 16

**RegionData** (merged `legends.xml` + `legends_plus.xml`):
- `name` — region name
- `type` — one of 10 biome types
- `evilness` — string
- `coords` — `[(x, y), ...]` — every world tile occupied by this region

**Site Type Taxonomy (20 types)**:
Camp, Cave, Dark Fortress, Dark Pits, Forest Retreat, Fortress, Castle, Fort, Hamlet, Hillocks, Labyrinth, Lair, Monastery, Mountain Halls, Ruins, Shrine, Tomb, Tower, Town, Vault

**Biome Type Taxonomy (10 types)**:
Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains

### Material Classification Lookup (myDFHackScripts MaterialHelper)

Complete DF material categories for item classification:
- **Gem** — precious/semi-precious gems
- **Rock** — ordinary stone
- **EconomicStone** — flux/fuel/other economic uses
- **Ore** — metal-bearing ore
- **Metal** — smelted metal bars and objects
- **Wood** — all wood types
- **Plant** — plant-derived materials
- **Creature** — bone, leather, horn, silk, wool, etc.

---

## Key Insights

### Insight 1: Chronicler Has a Genuine First-Mover Opportunity for Worldgen Monitoring

No tool in the DF community has ever scraped live worldgen data during generation. The DFHack maintainer explicitly acknowledged this gap in 2023 (Discussion #3774: "DFHack has very little tooling around worldgen currently"). The `worldgen_status` struct is fully mapped in df-structures, the access path is confirmed working, and the implementation pattern (extend `chronicler-bridge.lua`) is already proven. This is a low-effort, high-value feature with no competition.

### Insight 2: `worldgen_status` is a Compound (Not a Pointer) — Always Safe to Access

The `worldgen_status` field is defined as `<compound name='worldgen_status' type-name='world_generatorst'/>` in the `world` struct — it is embedded by value, not a pointer. This means it is always valid memory as long as `df.global.world` is accessible. No null pointer check is required for the struct itself, only for `world_data` (which IS a pointer).

### Insight 3: DF's Native Lua (v50+) Cannot Be Used for Observation — Must Use DFHack Lua

DF's built-in Lua environment (added in v50) is intentionally sandboxed to content description (raws, worldgen hooks for modding). It cannot read game state, write files, or access `df.global.*`. All of Chronicler's data access must go through DFHack's separate Lua 5.3 environment. The DF native worldgen hooks (`do_once`, `do_once_early`, `preprocess`, `postprocess`) are exclusively for modding content into the world.

### Insight 4: State 8 (RecountingLegends) is the High-Speed Write Phase — Poll Carefully

During state 8, the `world.history.events` and `world.history.figures` vectors grow at their fastest rate. The cursor-based approach (`last_event_id_added` + capped extraction at 50 events per poll) prevents JSON output from exploding. The `CoreSuspend` mechanism used by DFHack's `repeat` command should protect reads during active writes, but very large worlds may stress this.

### Insight 5: `worldgen_status.state == 10` Completion Detection Requires Three Conditions

The correct full completion check (derived from both df-ai and weblegends independently) is:
1. `df.global.world.worldgen_status.state == 10`
2. `#df.global.world.entities.all > 0`
3. `viewscreen_new_regionst.simple_mode == 0`

Using only condition 1 may fire too early in some edge cases. All three together confirm that worldgen is genuinely complete and ready.

### Insight 6: DwarvenSurveyor Confirms That Site + Region XML Data is Sufficient for a Full World Map

DwarvenSurveyor renders a fully navigable 2D world map with biome regions, evilness overlays, and clickable site markers using only `legends.xml` and `legends_plus.xml`. This means Chronicler's post-worldgen ingestion pipeline (already partially implemented) can power a full interactive map without requiring any additional memory scraping. The XML parser reference implementation is clean and directly portable to Python.

### Insight 7: The Event-Loop Architecture from myDFHackScripts Validates Chronicler's Bridge Design

The `FortressStatistics.lua` orchestrator — start eventful hooks + 500-tick polling loop — is exactly the pattern already used by `chronicler-bridge.lua`. The additional event types (ITEM_CREATED, JOB_COMPLETED, INVASION) and polling targets (agreements, items/books, announcements) are immediately portable as new Chronicler bridge modules. Each is a self-contained logger with its own data access path and CDM target.

### Insight 8: `world.incidents.all` Is the Correct Path for Death Cause Resolution — Not the Unit Struct Directly

Death cause is not stored on the unit struct after death. The correct lookup is to search `df.global.world.incidents.all` for an incident of type `df.incident_type.Death` where `incident.victim == unit_id`. This pattern resolves both the death cause (enum -> string) and the killer's unit_id. This is a non-obvious access path that has been empirically validated in myDFHackScripts.

### Insight 9: `unit.relationship_ids.Mother/Father` Enables Complete Lineage Reconstruction Without Legends Export

Historical figure lineage (parent-child relationships) is accessible live via `unit.relationship_ids.Mother` and `.Father` (both hist_figure_ids), which can then be resolved against `df.global.world.history.figures`. This means family tree construction does not require waiting for a Legends export — it can be done live in-game via the bridge.

### Insight 10: The `world_data.region_map` 2D Grid May Enable a Real-Time Worldgen Map Preview

The `region_map` is a `world_width x world_height` grid of `region_map_entry` structs, each containing elevation, rainfall, temperature, volcanism, and evilness values. If this pointer is accessible during the PreparingElevation phase (state 1), Chronicler could render a grayscale elevation map that updates in real time as the worldgen fills in terrain — a genuinely novel visualization. This needs empirical verification on a live worldgen.

### Insight 11: Large Region Tile Counts Require Chunked Rendering

DwarvenSurveyor splits regions with >10,000 world tiles into 4 separate meshes to stay under Unity's vertex limits. Chronicler's map renderer (whether web-based or desktop) will need to implement viewport culling or level-of-detail tiling for large worlds (e.g., a Large world is 257x257 = 66,049 tiles total, with large biome regions potentially covering tens of thousands of tiles each).

### Insight 12: The `worldgen_parms` Struct Supports Multi-World Comparative Analysis

Because `worldgen_parms` (seed, title, dim_x, dim_y, end_year, civ caps, beast caps) is preserved in memory after worldgen, and because Chronicler stores it in the CDM, we can build a world comparison dashboard: compare the final stats (event count, civ count, etc.) of multiple worlds with different seeds or parameters to help players select the richest world for their fortress.

---

## Action Items (Consolidated from Both Sources)

**Worldgen Bridge**:
- [ ] Create `worldgen-bridge.lua` from the template above; deploy to HomeServer DF install
- [ ] Add auto-start hook to `dfhack-config/init.lua` (SC_VIEWSCREEN_CHANGED handler)
- [ ] Add Python-side `chronicler worldgen-watch` CLI command to ingest JSON snapshots
- [ ] Design and create `worldgen_snapshots` CDM table with full schema
- [ ] Design and create `worldgen_params` CDM table for cross-world comparison
- [ ] Test on Pocket world — verify all fields increment as expected during each phase
- [ ] Write final `worldgen_complete` record to CDM when state == 10 is first detected
- [ ] Investigate `world_data.region_map` accessibility during PreparingElevation phase
- [ ] Investigate `worldgen_status.entities` vs `world.entities.all` identity at completion

**XML Ingestion**:
- [ ] Implement Python `parse_coordinates()` for pipe-delimited coord strings from legends_plus.xml
- [ ] Add `evilness` field to CDM `regions` table if not already present
- [ ] Add `rectangle` (bounding box) field to CDM `sites` table if not already present
- [ ] Verify all 20 site types and 10 biome types are represented in CDM schema

**Fortress Event Capture (chronicler-bridge.lua extensions)**:
- [ ] Port death cause resolution (`world.incidents.all` search) to bridge
- [ ] Port parent-chain walk (Mother/Father relationship_ids) for HF lineage extraction
- [ ] Port book detection (`dfhack.items.getBookTitle`) for written work events
- [ ] Add ITEM_CREATED hook with material classification
- [ ] Add JOB_COMPLETED hook with worker tracking
- [ ] Add INVASION hook
- [ ] Add announcement/report polling module
- [ ] Add petition/agreement polling module
- [ ] Add citizen arrival detection module
- [ ] Test `df.global.world.incidents.all` on DFHack 53.10-r1
- [ ] Test `unit.relationship_ids.Mother/Father` on DFHack 53.10-r1

**Map Visualization**:
- [ ] Design Chronicler world map UI panel architecture (web-based vs desktop)
- [ ] Implement region mesh/polygon rendering with biome color coding
- [ ] Implement site marker layer with 20-type color coding
- [ ] Implement evilness overlay toggle
- [ ] Implement pan/zoom navigation with map bounds enforcement
- [ ] Implement site/region search with camera jump
- [ ] Implement worldgen live map preview (update as terrain phases complete)
- [ ] Design chunked rendering strategy for large regions (>10,000 tiles)

---

## Sources

1. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml` — `worldgen_parms` (line 44), `world_data` (line 733), `world_generatorst` (line 843)
2. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml` — world struct with worldgen_status compound
3. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml` — `world_history` struct (line 185)
4. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.d_interface.xml` — `viewscreen_new_regionst` (lines 6044-6132)
5. `/Users/nathanielcannon/Claude/GitRepos/df-ai/embark.cpp` — worldgen completion detection (line 454)
6. `/Users/nathanielcannon/Claude/GitRepos/weblegends/test/main.lua` — worldgen_status.state polling (line 46)
7. DFHack Discussion #3774 — "Streamlining Repeated Worldgen?" (2023, myk002: "DFHack has very little tooling around worldgen currently")
8. DFHack Discussion #4961 — "DFHack and DF+Lua" (2024, scope of DF native Lua)
9. DFHack `exportlegends` documentation — v53.10-r1
10. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/share/memory_layouts/linux/v0.51.04-steam_linux64.ini`
11. `DwarfGenManager` (Nikorasu) — batch worldgen automation script
12. DFHack dfhack.lua — SC_ state change event constants
13. DwarvenSurveyor Unity project — `MapXMLParser.cs`, `Region.cs`, `Site.cs`, `CameraMover.cs`, `RegionPanel.cs`, `SitePanel.cs`, `SearchButtonCameraJump.cs`, `MeshCenterFinder.cs`, and supporting files
14. myDFHackScripts — `FortressStatistics.lua`, `LogHandler.lua`, `Helper.lua`, `AnnouncementLogger.lua`, `ItemLogger.lua`, `DeathLogger.lua`, `JobLogger.lua`, `CitizenLogger.lua`, `PetitionLogger.lua`, `AnnounceBooks.lua`, `MaterialHelper.lua`, `LogParser.lua`, `CurveWidget.lua`, `unit.lua`
