# Research Report: DFHack World Gen Memory Scraping

**Date**: 2026-02-23
**Scope**: DFHack worldgen memory access patterns — historical v0.47 capabilities, current v53 structure definitions, community tooling, and a concrete implementation plan for Chronicler.

---

## Executive Summary

World generation memory scraping in Dwarf Fortress is entirely feasible through DFHack's Lua API in DF v53. The `df-structures` repository (current master, matching DF 53.10-r1) has fully mapped the `world_generatorst` struct, its 12-state state machine, and dozens of progress-tracking fields. The key access path is `df.global.world.worldgen_status` — a live `world_generatorst` struct that exists in memory throughout generation and is set to `state=Done (10)` on completion.

There was never a dedicated "worldgen viewer" DFHack plugin in the community. What existed was: (a) the `df-ai` project using `worldgen_status.state == 10` as a completion sentinel; (b) the `weblegends` test suite using the same check while waiting for generation to finish; (c) `exportlegends` (post-worldgen only, runs from Legends mode); and (d) no real-time scraper that polled live data _during_ generation.

This is a genuine capability gap. Chronicler has the opportunity to be the first tool that monitors DF worldgen in real time, watching civ count, event accumulation, figure creation, and terrain generation state as they happen.

The implementation follows directly from the existing `chronicler-bridge.lua` pattern: a new `worldgen-bridge.lua` that polls `df.global.world.worldgen_status` and `df.global.world.history` on a frame-rate timer, writes JSON to disk, and serves it over the existing PowerShell HTTP listener.

---

## Key Findings

### Finding 1: `world_generatorst` is Fully Mapped in df-structures

The struct at `df.global.world.worldgen_status` (type `world_generatorst`) is completely defined in `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml` at line 843. It contains a 12-state enum plus dozens of progress counters that are live during generation:

```xml
<struct-type type-name='world_generatorst'>
    <enum base-type='int16_t' name='state'>  <!-- bay12: ??? -->
        <enum-item name='None'          value='-1'/>
        <enum-item name='Initializing'  value='0'/>
        <enum-item name='PreparingElevation'/>
        <enum-item name='SettingTemperature'/>
        <enum-item name='RunningRivers'/>
        <enum-item name='FormingLakesAndMinerals'/>
        <enum-item name='GrowingVegetation'/>
        <enum-item name='VerifyingTerrain'/>
        <enum-item name='ImportingWildlife'/>
        <enum-item name='RecountingLegends'/>
        <enum-item name='Finalizing'/>
        <enum-item name='Done'          value='10'/>
    </enum>
    <int32_t name='num_rejects'/>
    <int32_t name='rivers_total'/>
    <int32_t name='rivers_cur'/>
    <int32_t name='civ_count'/>         <!-- Only valid during civ placement phase -->
    <int32_t name='civs_left_to_place'/>
    <int32_t name='rampage_num'/>
    <stl-vector name='entities' pointer-type='historical_entity'/>
    <stl-vector name='sites'    pointer-type='world_site'/>
    <int32_t name='cursor_x'/>
    <int32_t name='cursor_y'/>
    <bool name='prehistory_initialized'/>
    <bool name='placed_caves'/>
    <bool name='placed_good_evil'/>
    <bool name='placed_megabeasts'/>
    <bool name='placed_other_beasts'/>
    <bool name='made_cave_pops'/>
    <bool name='made_cave_civs'/>
    <bool name='finished_prehistory'/>
    <ulong name='last_chronicle_add_time'/>
    <int32_t name='last_event_id_added'/>
    ...
</struct-type>
```

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml`, lines 843-955.

---

### Finding 2: The Completion Sentinel is `worldgen_status.state == 10` (Done)

Two independent codebases use this exact check:

**df-ai (C++ plugin)** — `/Users/nathanielcannon/Claude/GitRepos/df-ai/embark.cpp`, line 454:
```cpp
if (!world->entities.all.empty()
    && view->simple_mode == 0
    && world->worldgen_status.state == 10)
{
    ai.debug(out, "world gen finished...");
    Key(interface_key::SELECT);
}
```

**weblegends test suite** — `/Users/nathanielcannon/Claude/GitRepos/weblegends/test/main.lua`, line 46:
```lua
while #df.global.world.entities.all == 0
   or new_region.simple_mode == 0
   or df.global.world.worldgen_status.state ~= 10 do
    script.sleep(1, 'frames')
end
```

The combined condition for "worldgen finished and ready to accept" is:
1. `df.global.world.worldgen_status.state == 10` (Done)
2. `#df.global.world.entities.all > 0` (entities vector non-empty)
3. `view.simple_mode == 0` (UI is in "generation complete" mode)

During generation, state values cycle through 0-9 corresponding to the terrain/history phases above. Each intermediate state is readable in real time.

**Source**: df-ai and weblegends Git repositories (local at `/Users/nathanielcannon/Claude/GitRepos/`).

---

### Finding 3: `viewscreen_new_regionst` Exposes Generation Phase State

The `viewscreen_new_regionst` struct (defined in `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.d_interface.xml`, line 6044) is the active viewscreen during worldgen. Key fields confirmed in community documentation:

| Field | Type | Meaning |
|-------|------|---------|
| `simple_mode` | `int8_t` | 1 = parameter screen, 0 = generation running or complete |
| `load_world_params` | bool | True while params are loading (early init) |
| `welcome_msg` | stl-vector | Non-empty when a disclaimer popup is showing |
| `worldgen_presets` | stl-vector | Available worldgen presets |
| `raw_load` | bool | True during raw loading phase |
| `raw_load_stage` | enum | Stage enum (NONE through FINALIZE) of raw loading |
| `abort_world_gen_dialogue` | int8_t | Abort dialog active |
| `reject_dialogue` | int8_t | Rejection dialog active |

The df-structures XML for v53 does not define `in_worldgen`, `worldgen_paused`, or `worldgen_rejected` as top-level fields on the viewscreen. Those appear to have been documented on an older (pre-v50) viewscreen definition from the community site `peridexiserrant.neocities.org`. The primary live state source in v53 is `df.global.world.worldgen_status.state`.

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.d_interface.xml`, line 6044-6132; df-ai embark.cpp line 406-412.

---

### Finding 4: `world.history` is Populated Incrementally During Generation

The `world_history` struct (defined in `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml`, line 185) includes:

```xml
<struct-type type-name='world_history' original-name='historyst'>
    <stl-vector name='events'   pointer-type='history_event'/>
    <stl-vector name='figures'  pointer-type='historical_figure'/>
    <stl-vector name='eras'     pointer-type='history_era'/>
    <int32_t name='total_art'/>   <!-- some value during worldgen -->
    <int32_t name='total_powers'/>
    <int32_t name='total_megabeasts'/>
    ...
    <stl-vector name='live_megabeasts'       pointer-type='historical_figure'/>
    <stl-vector name='live_semimegabeasts'   pointer-type='historical_figure'/>
</struct-type>
```

The comment "some value during worldgen" on `total_art` confirms this struct is actively written during generation. The `worldgen_status.last_event_id_added` field provides a cursor to track which events have been added since the last poll.

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml`, lines 185-260; `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml` line 951.

---

### Finding 5: `world_data` (Geography) is Populated During Terrain Phase

The `world_data` struct (defined in `df.region.xml`, line 733) contains the geography arrays that are built during `PreparingElevation` through `VerifyingTerrain` phases:

```xml
<struct-type type-name='world_data' original-name='regionst'>
    <stl-vector name="landmasses"          pointer-type='world_landmass'/>
    <stl-vector name="regions"             pointer-type='world_region'/>
    <stl-vector name="underground_regions" pointer-type='world_underground_region'/>
    <stl-vector name="geo_biomes"          pointer-type='world_geo_biome'/>
    <stl-vector name="mountain_peaks"      pointer-type='world_mountain_peak'/>
    <stl-vector name="rivers"              pointer-type='world_river'/>
    <stl-vector name="sites"              pointer-type='world_site'/>
    <!-- 2D region map: world_width x world_height grid of region_map_entry -->
    <pointer name="region_map" is-array='true'>...</pointer>
    <!-- worldgen-only temp data -->
    <stl-vector name="world_gen_wandering_group" .../>
</struct-type>
```

Note: The comment "exists during worldgen only, before it finishes" on `world_gen_wandering_group` (line 838) confirms that the `world_data` pointer is accessible and partially populated during generation.

The `region_map` is a `world_width x world_height` 2D array of `region_map_entry` (each has elevation, rainfall, temperature, volcanism, evilness, etc.) — this grid is filled during terrain generation phases and can be read while generation is in progress.

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml`, lines 733-841.

---

### Finding 6: `worldgen_parms` Encodes the Generation Configuration

The `worldgen_parms` struct (line 44 in `df.region.xml`) captures all parameters used for generation — seed, dimensions, history length, civ counts, beast caps, etc. These are readable as soon as the user confirms world parameters.

```xml
<struct-type type-name='worldgen_parms' original-name='world_gen_paramst'>
    <stl-string name='title'/>
    <stl-string name='seed'/>
    <stl-string name='history_seed'/>
    <stl-string name='name_seed'/>
    <stl-string name='creature_seed'/>
    <int32_t name='dim_x'/>
    <int32_t name='dim_y'/>
    <int32_t name='total_civ_number'/>
    <int32_t name='end_year'/>
    <int32_t name='megabeast_cap'/>
    <int32_t name='semimegabeast_cap'/>
    <int32_t name='titan_number'/>
    <int32_t name='demon_number'/>
    ...
</struct-type>
```

Access path: `df.global.world.worldgen.worldgen_parms`

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml`, lines 44-161.

---

### Finding 7: DFHack Has "Very Little Tooling Around Worldgen"

A DFHack maintainer (myk002) explicitly stated in GitHub Discussion #3774 (2023): "DFHack has very little tooling around worldgen currently." The command-line worldgen automation that existed in DF v0.47 stopped working in v50+. No dedicated worldgen monitoring plugin or script exists in the official DFHack scripts repository.

The existing community approach is:
1. `exportlegends` — runs from Legends mode _after_ worldgen, not during
2. `df-ai` — polls `worldgen_status.state == 10` as a completion signal only, does not scrape interim data
3. `weblegends` test — same completion poll, no interim scraping
4. `DwarfGenManager` (Nikorasu) — Windows batch script for automated world re-generation; reads post-worldgen files only

No tool exists that polls live worldgen data (event counts, civ counts, figure counts, terrain state) while generation is running.

**Sources**:
- [Streamlining Repeated Worldgen? — DFHack Discussion #3774](https://github.com/DFHack/dfhack/discussions/3774)
- [DFHack exportlegends documentation](https://docs.dfhack.org/en/latest/docs/tools/exportlegends.html)
- [GitHub — DwarfGenManager](https://github.com/Nikorasu/DwarfGenManager)

---

### Finding 8: DF's Native Lua (v50+) is Scoped to Content, Not Observation

As clarified in DFHack Discussion #4961 (2024), DF's own Lua environment (added in v50) is intentionally limited: it runs during worldgen for "describing content" (raws, procedural generation hooks). It cannot observe game state, read history, or write files. DFHack's Lua API (separate, Lua 5.3 via C++) is what enables the `df.global.*` access path.

The DF native Lua worldgen hooks (`do_once`, `do_once_early`, `preprocess`, `postprocess`) exist for modding content into the world — they cannot read back world state during generation in a useful way.

**Source**: [DFHack and DF+Lua — Discussion #4961](https://github.com/DFHack/dfhack/discussions/4961)

---

### Finding 9: DFHack State Change Events Do Not Include Worldgen-Specific Triggers

The DFHack state change event system (`dfhack.onStateChange`) fires:
- `SC_WORLD_LOADED = 0` — after worldgen completes and world is loaded
- `SC_WORLD_UNLOADED = 1`
- `SC_MAP_LOADED = 2`
- `SC_MAP_UNLOADED = 3`
- `SC_VIEWSCREEN_CHANGED = 4`
- `SC_CORE_INITIALIZED = 5`
- `SC_PAUSED = 7`
- `SC_UNPAUSED = 8`

There is no `SC_WORLDGEN_STARTED`, `SC_WORLDGEN_TICK`, or equivalent. Monitoring worldgen requires polling via `dfhack.timeout` or a `repeat` job, not event-driven callbacks.

**Source**: `/Users/nathanielcannon/Claude/GitRepos/dfhack/` (local), confirmed via dfhack.lua source.

---

### Finding 10: DwarfFortressLogger Does Not Monitor Worldgen

The Dwarf Therapist fork (`DwarfFortressLogger`) focuses entirely on fortress-mode unit management. Its memory layouts (e.g., `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/share/memory_layouts/linux/v0.51.04-steam_linux64.ini`) contain addresses for `world_data`, `historical_entities_vector`, `historical_figures_vector`, and `events_vector` — but only used after a world loads into fortress mode. No worldgen monitoring capability exists in that codebase.

**Source**: Local repo at `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/`.

---

## Data Available During Worldgen vs After

| Data | Available During Worldgen | Available After Worldgen |
|------|--------------------------|--------------------------|
| `worldgen_status.state` (0-10) | Yes — live phase enum | Yes (= 10) |
| `worldgen_status.rivers_cur/total` | Yes — during RunningRivers phase | Yes (final values) |
| `worldgen_status.civ_count` / `civs_left_to_place` | Yes — during civ placement | Yes |
| `worldgen_status.rampage_num` | Yes — during beast rampages | Yes |
| `worldgen_status.entities` vector | Yes — fills during prehistory | Yes (complete) |
| `worldgen_status.sites` vector | Yes — fills during site placement | Yes (complete) |
| `worldgen_status.last_event_id_added` | Yes — cursor into history.events | Yes |
| `world.history.figures` count | Yes — increments live | Yes (final) |
| `world.history.events` count | Yes — increments live | Yes (final) |
| `world.history.eras` | Yes — adds eras as they start | Yes (complete) |
| `world.worldgen.worldgen_parms` | Yes — set before gen starts | Yes (preserved) |
| `world.world_data.regions` vector | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.landmasses` | Yes — fills during terrain phase | Yes (complete) |
| `world.world_data.sites` | Yes — fills during site placement | Yes (complete) |
| `world.worldgen_status.placed_megabeasts` | Yes — bool flag | Yes |
| `world.entities.all` | Partial — fills during prehistory | Yes (complete) |
| `world.worldgen_status.bool flags` (placed_caves etc.) | Yes — each set when phase completes | Yes |
| Fortress-mode units, squads, etc. | No — don't exist yet | Yes (after embark) |
| `world.history.live_megabeasts` | Yes — fills during beast placement | Yes |

**Critical constraint**: The `worldgen_status` struct is embedded in `world` as `compound name='worldgen_status'` — it is NOT a pointer. This means it is always valid memory as long as `df.global.world` is accessible. No null pointer check needed for the struct itself.

---

## Lua Access Paths for v53

All paths verified against df-structures for DF 53.10-r1:

```lua
-- Primary generation state
local ws = df.global.world.worldgen_status
local state = ws.state          -- int16_t: -1=None, 0-9=phases, 10=Done
local state_name = df.world_generatorst.T_state[state]  -- enum name

-- Progress counters
local rivers_done   = ws.rivers_cur
local rivers_total  = ws.rivers_total
local civs_placed   = ws.civ_count
local civs_left     = ws.civs_left_to_place
local rampage_count = ws.rampage_num
local last_event    = ws.last_event_id_added  -- cursor into history.events

-- Phase completion flags
local caves_placed       = ws.placed_caves
local good_evil_placed   = ws.placed_good_evil
local megabeasts_placed  = ws.placed_megabeasts
local prehistory_done    = ws.finished_prehistory

-- Worldgen parameters (set before generation begins)
local parms = df.global.world.worldgen.worldgen_parms
local seed           = parms.seed
local world_title    = parms.title
local dim_x          = parms.dim_x
local dim_y          = parms.dim_y
local end_year       = parms.end_year
local total_civs     = parms.total_civ_number

-- Live history accumulation
local figures  = df.global.world.history.figures
local events   = df.global.world.history.events
local eras     = df.global.world.history.eras
local fig_count   = #figures
local event_count = #events
local era_count   = #eras

-- Geography (fills during terrain phases)
local wd = df.global.world.world_data  -- may be nil before terrain begins
if wd then
    local regions   = #wd.regions
    local sites     = #wd.sites
    local landmasses = #wd.landmasses
end

-- Live worldgen entity/site vectors (on the generator, not world_data)
local gen_entities = #ws.entities  -- fills during prehistory
local gen_sites    = #ws.sites     -- fills during site placement

-- Detection: is worldgen running?
local is_worldgen = (state >= 0 and state < 10)
local is_done     = (state == 10)
```

**Note**: The viewscreen check from `df-ai` also confirms worldgen is active:
```lua
local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
local in_gen_phase = (vs ~= nil and vs.simple_mode == 0)
```

---

## How the Progress Bar Maps to Internal State

The in-game worldgen progress bar corresponds to `world_generatorst.state`:

| Progress Bar Phase (visible) | `worldgen_status.state` value | Key data filling |
|------------------------------|-------------------------------|-----------------|
| "Preparing Elevation" | 1 (PreparingElevation) | `world_data.region_map` elevation grid |
| "Setting Temperature" | 2 (SettingTemperature) | region_map temperature/rainfall |
| "Running Rivers" | 3 (RunningRivers) | `rivers_cur`/`rivers_total`, `world_data.rivers` |
| "Forming Lakes and Minerals" | 4 (FormingLakesAndMinerals) | geo_biomes, underground_regions |
| "Growing Vegetation" | 5 (GrowingVegetation) | region vegetation |
| "Verifying Terrain" | 6 (VerifyingTerrain) | world may reject here |
| "Importing Wildlife" | 7 (ImportingWildlife) | entity_populations |
| "Recounting Legends" | 8 (RecountingLegends) | history.events, history.figures |
| "Finalizing" | 9 (Finalizing) | civ placement, site naming |
| "Done" | 10 (Done) | all vectors complete |

During state 8 (RecountingLegends), the `world.history.events` vector grows rapidly — this is when the bulk of historical events are written. During state 9 (Finalizing), `civ_count` and `civs_left_to_place` are active.

---

## What Old Worldgen Monitoring Looked Like (Pre-v50)

There was no dedicated worldgen monitoring tool in the community before v50. The only relevant capabilities were:

1. **`exportlegends` (post-worldgen)**: Always required Legends mode, never ran during generation.
2. **`df-ai` completion detection**: Used `worldgen_status.state == 10` only as an exit condition, then immediately proceeded to embark. No interim data logged.
3. **`weblegends` test automation**: Same pattern — wait for state 10, then test Legends mode export.
4. **No Stonesense worldgen viz**: Stonesense (DFHack 3D renderer) had no worldgen visualization mode.
5. **No worldgen-viewer plugin**: The DFHack plugin registry has never contained a plugin with this name.

The command-line worldgen feature referenced in old DFHack docs (allowing DF to generate a world from CLI arguments) stopped working in v50 when the UI was redesigned. The DFHack team confirmed this gap in Discussion #3774 (2023).

---

## Recommendations

### Primary Recommendation: Implement `worldgen-bridge.lua` as a Standalone Script

Rationale: The existing `chronicler-bridge.lua` pattern works perfectly. A worldgen monitor needs to:
1. Detect when `viewscreen_new_regionst` becomes active (worldgen screen entered)
2. Start polling `worldgen_status.state` + history counts every ~30 frames (~0.5s)
3. Write incremental JSON snapshots to disk
4. Stop when state reaches 10 (Done) and fire a final complete snapshot

**Implementation template**:

```lua
-- worldgen-bridge.lua — Chronicler worldgen monitor
-- Run via: repeat --name worldgen-monitor --time 30 --timeUnits frames \
--          --command [ worldgen-bridge ]

local json = require('json')

local wg_state = {
    last_event_id = -1,
    snapshots = 0,
}

local STATE_NAMES = {
    [-1] = 'None',
    [0]  = 'Initializing',
    [1]  = 'PreparingElevation',
    [2]  = 'SettingTemperature',
    [3]  = 'RunningRivers',
    [4]  = 'FormingLakesAndMinerals',
    [5]  = 'GrowingVegetation',
    [6]  = 'VerifyingTerrain',
    [7]  = 'ImportingWildlife',
    [8]  = 'RecountingLegends',
    [9]  = 'Finalizing',
    [10] = 'Done',
}

local function get_worldgen_snapshot()
    local ws = df.global.world.worldgen_status
    local state_val = ws.state
    local snap = {
        timestamp = os.time(),
        state_id   = state_val,
        state_name = STATE_NAMES[state_val] or 'Unknown',
        -- Parms (static after generation starts)
        seed        = df.global.world.worldgen.worldgen_parms.seed,
        world_title = dfhack.df2utf(df.global.world.worldgen.worldgen_parms.title),
        dim_x       = df.global.world.worldgen.worldgen_parms.dim_x,
        dim_y       = df.global.world.worldgen.worldgen_parms.dim_y,
        end_year    = df.global.world.worldgen.worldgen_parms.end_year,
        -- Progress counters
        rivers_cur           = ws.rivers_cur,
        rivers_total         = ws.rivers_total,
        civ_count            = ws.civ_count,
        civs_left_to_place   = ws.civs_left_to_place,
        rampage_num          = ws.rampage_num,
        num_rejects          = ws.num_rejects,
        -- Phase completion flags
        placed_caves       = ws.placed_caves,
        placed_good_evil   = ws.placed_good_evil,
        placed_megabeasts  = ws.placed_megabeasts,
        finished_prehistory = ws.finished_prehistory,
        -- Live history
        figure_count  = #df.global.world.history.figures,
        event_count   = #df.global.world.history.events,
        era_count     = #df.global.world.history.eras,
        entity_count  = #df.global.world.entities.all,
        -- Generator vectors (separate from world_data)
        gen_entity_count = #ws.entities,
        gen_site_count   = #ws.sites,
    }

    -- Geography (conditional: world_data pointer may be nil early)
    local wd_ok, wd = pcall(function() return df.global.world.world_data end)
    if wd_ok and wd then
        snap.region_count     = #wd.regions
        snap.site_count       = #wd.sites
        snap.landmass_count   = #wd.landmasses
        snap.river_count      = #wd.rivers
        snap.geo_biome_count  = #wd.geo_biomes
    end

    -- New events since last poll (cursor-based)
    local events = df.global.world.history.events
    local ev_count = #events
    local new_events = {}
    if wg_state.last_event_id < 0 then
        wg_state.last_event_id = ws.last_event_id_added
    else
        local start_idx = ev_count
        for i = ev_count - 1, 0, -1 do
            if events[i].id <= wg_state.last_event_id then
                start_idx = i + 1
                break
            end
            if i == 0 then start_idx = 0 end
        end
        local cap = math.min(ev_count, start_idx + 50)
        for i = start_idx, cap - 1 do
            local ev = events[i]
            table.insert(new_events, {
                id   = ev.id,
                type = ev:getType(),
                year = ev.year,
            })
            wg_state.last_event_id = ev.id
        end
    end
    snap.new_events = new_events
    snap.snapshot_num = wg_state.snapshots
    wg_state.snapshots = wg_state.snapshots + 1

    return snap
end

-- Guard: only run when worldgen screen is active
local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
if not vs then return end  -- Not on worldgen screen

local ok, err = pcall(function()
    local snap = get_worldgen_snapshot()
    json.encode_file(snap, 'chronicler-worldgen.json')
end)
if not ok then
    dfhack.printerr('worldgen-bridge: ' .. tostring(err))
end
```

**Deploy command** (run in DF console after entering worldgen screen):
```
repeat --name worldgen-monitor --time 30 --timeUnits frames --command [ worldgen-bridge ]
```

Stop when done:
```
repeat --cancel worldgen-monitor
```

### Alternative: Auto-start via `dfhack.onStateChange` + Viewscreen Hook

For fully automatic monitoring, register a `SC_VIEWSCREEN_CHANGED` handler in `dfhack-config/init.lua` that detects entry to `viewscreen_new_regionst` and starts/stops the repeat job automatically:

```lua
-- In dfhack-config/init.lua or a persistent plugin script
dfhack.onStateChange.worldgen_monitor = function(state)
    if state == SC_VIEWSCREEN_CHANGED then
        local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
        if vs then
            -- Started worldgen screen — begin monitoring
            dfhack.run_command('repeat', '--name', 'worldgen-monitor',
                '--time', '30', '--timeUnits', 'frames',
                '--command', '[', 'worldgen-bridge', ']')
        else
            -- Left worldgen screen — stop monitoring
            pcall(function()
                dfhack.run_command('repeat', '--cancel', 'worldgen-monitor')
            end)
        end
    end
end
```

When to use: For Chronicler's production deployment where human intervention during worldgen is undesirable.

---

## Action Items

- [ ] Create `worldgen-bridge.lua` based on template above, deploy to HomeServer DF install
- [ ] Add Python-side `chronicler worldgen-watch` command that reads `chronicler-worldgen.json` and ingests snapshots into a new CDM table (`worldgen_snapshots`)
- [ ] Design `worldgen_snapshots` CDM schema: `(world_name, seed, state_id, state_name, snapshot_ts, figure_count, event_count, era_count, civ_count, rivers_cur, rivers_total, ...)`
- [ ] Add auto-start hook to `dfhack-config/init.lua` so monitoring begins automatically when user enters worldgen screen
- [ ] Test on active DF session — generate a small (Pocket) world and verify all fields increment as expected
- [ ] Consider writing final `worldgen_complete` record to CDM when `state == 10` is detected
- [ ] Investigate whether `world_data.region_map` (elevation/rainfall 2D grid) is readable during PreparingElevation phase; if so, add terrain snapshot capability

---

## Sources

1. [df-structures df.region.xml — worldgen_parms and world_generatorst definitions](https://github.com/DFHack/df-structures) (local: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml`)
2. [df-structures df.world.xml — world struct with worldgen_status compound](https://github.com/DFHack/df-structures) (local: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml`)
3. [df-structures df.history.xml — world_history struct](https://github.com/DFHack/df-structures) (local: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml`)
4. [df-structures df.d_interface.xml — viewscreen_new_regionst](https://github.com/DFHack/df-structures) (local: `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.d_interface.xml`)
5. [df-ai embark.cpp — worldgen completion detection](https://github.com/df-ai/df-ai) (local: `/Users/nathanielcannon/Claude/GitRepos/df-ai/embark.cpp`)
6. [weblegends test/main.lua — worldgen_status.state polling](https://github.com/DFHack/weblegends) (local: `/Users/nathanielcannon/Claude/GitRepos/weblegends/test/main.lua`)
7. [Streamlining Repeated Worldgen? — DFHack Discussion #3774](https://github.com/DFHack/dfhack/discussions/3774)
8. [DFHack exportlegends documentation — v53.10-r1](https://docs.dfhack.org/en/latest/docs/tools/exportlegends.html)
9. [DFHack and DF+Lua — Discussion #4961](https://github.com/DFHack/dfhack/discussions/4961)
10. [DFHack Lua API Reference — v53.10-r1](https://docs.dfhack.org/en/latest/docs/dev/Lua%20API.html)
11. [DwarfFortressLogger memory layouts (v0.51.04)](https://github.com/Dwarf-Therapist/Dwarf-Therapist) (local: `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/`)
12. [DwarfGenManager — batch worldgen automation](https://github.com/Nikorasu/DwarfGenManager)
13. [DFHack dfhack.lua — SC_ state change event constants](https://github.com/DFHack/dfhack/blob/develop/library/lua/dfhack.lua)
14. [Dwarf Fortress Wiki — Lua scripting](https://dwarffortresswiki.org/index.php/Lua_scripting)

---

## Uncertainties

1. **`world_data` pointer nullability during early phases**: The `world_data` field in the `world` struct is a pointer (`<pointer name='world_data' type-name='world_data'/>`). It is unknown at what exact phase this becomes non-null. Wrapping access in `pcall` guards against crashes, but the exact safe-to-read window needs empirical testing on a live worldgen.

2. **`viewscreen_new_regionst` field name verification**: The peridexiserrant community docs listed fields like `in_worldgen`, `worldgen_paused`, `worldgen_rejected` but these do not appear in the current `df-structures` XML for v53. These may have been present in pre-v50 structures or may be accurately named but not yet reverse-engineered into the XML. The `simple_mode` / `worldgen_status.state` pair is the confirmed reliable combination.

3. **Thread safety during `RecountingLegends`**: When `worldgen_status.state == 8`, the history vectors are being written at potentially high speed. The DFHack `CoreSuspend` mechanism (used by `repeat` jobs) should protect against reads during active writes, but there may be edge cases with very large worlds.

4. **`worldgen_status.entities` vs `world.entities.all`**: The generator has its own `entities` vector on `worldgen_status` (filled during generation) separate from `world.entities.all`. The relationship between these two vectors at completion time needs verification — they may be the same objects or copied.

---

## Related Topics

- CDM schema extension for worldgen snapshot tables
- Chronicler's legends export integration (post-worldgen, when `exportlegends` can run)
- Terrain map snapshot (reading `world_data.region_map` 2D elevation grid)
- Auto-embark scripting via `df-ai` patterns (using `worldgen_status.state == 10` to trigger Chronicler's post-worldgen ingestion pipeline)
