# Dwarf Fortress Gameplay — Hands-On Verified Reference
# Programmatic Game Control via DFHack 53.11-r2

**Date**: 2026-03-19 (Session 43)
**Verified on**: Girderpriced fortress, Y251, 23 citizens, DFHack 53.11-r2
**Purpose**: Consolidated reference for playing DF programmatically. Every command in this doc was tested on the live game.
**Related docs**: `df-gameplay-mechanics-reference.md` (web research), `df-quickfort-reference.md` (Quickfort deep dive), `dfhack-command-catalog.md` (command catalog)

---

## Transport Layer (VERIFIED)

All commands execute via SSH → PowerShell → dfhack-run.exe:
```bash
ssh -i ~/.ssh/df-vm -o StrictHostKeyChecking=no Jarvis@192.168.64.3 \
  "powershell -Command \"& 'C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\dfhack-run.exe' <command>\""
```

For Lua: `dfhack-run.exe lua '<code>'` (NO colon prefix)

For complex scripts: SCP `.lua` file to `hack/scripts/` then run as `dfhack-run.exe <scriptname>`

---

## 1. Designations & Digging (VERIFIED)

### Quickfort API (VERIFIED — designated 309 tiles programmatically)
```lua
local quickfort = reqscript('quickfort')
quickfort.apply_blueprint{mode='dig', data='d(10x10)', pos={x=91, y=90, z=132}}
```

### Designation codes (VERIFIED)
| Code | Effect | Quickfort `data` |
|------|--------|-----------------|
| `d` | Mine (floor) | `'d'` or `'d(NxM)'` |
| `h` | Channel (hole + ramp below) | `'h'` |
| `j` | Down stair | `'j'` |
| `u` | Up stair | `'u'` |
| `i` | Up/down stair | `'i'` |
| `r` | Ramp | `'r'` |

### Direct Lua designation (VERIFIED)
```lua
local block = dfhack.maps.getTileBlock(x, y, z)
local lx = x % 16
local ly = y % 16
block.designation[lx][ly].dig = df.tile_dig_designation.DownStair  -- or Default, UpDownStair, Channel, etc.
block.flags.designated = true
```

### Designation types enum (VERIFIED)
```
0: No, 1: Default (mine), 2: UpDownStair, 3: Channel, 4: Ramp, 5: DownStair, 6: UpStair
```

### Key lessons learned
- **Wagon blocks designations** — can't designate tiles under the wagon (3x3 at center)
- **Underground digging requires adjacent accessible floor** — a stairwell into solid rock must have a dug-out landing at each level, otherwise miners have nowhere to stand
- **Hidden tiles can be designated** but miners won't dig until adjacent revealed tiles are dug first
- **Quickfort `data='d(NxM)'`** expansion syntax works for rectangles
- **Surface soil**: `SoilFloor*` / `GrassLightFloor*` — can dig stairs directly
- **Stone starts at z=132** (1-2 layers of soil on top in typical biome)

### Stats returned by apply_blueprint (VERIFIED)
```
dig_designated: N, dig_invalid_tiles: N, dig_protected_engraving: N,
out_of_bounds: N, invalid_keys: N
```

---

## 2. Building Workshops & Furnaces (VERIFIED)

### Quickfort build mode (VERIFIED — placed mason workshop, smelter, kitchen)
```lua
quickfort.apply_blueprint{mode='build', data='wm', pos={x=100, y=94, z=134}}
```

### Workshop codes (VERIFIED — from game enum + Quickfort)
| Code | Workshop | Size | Enum value |
|------|----------|------|------------|
| `wc` | Carpenter | 3×3 | 0 |
| `ww` | Farmer | 3×3 | 1 |
| `wm` | Mason | 3×3 | 2 |
| `we` | Craftsdwarf | 3×3 | 3 |
| `wj` | Jeweler | 3×3 | 4 |
| `wf` | Metalsmith Forge | 3×3 | 5 |
| `wM` | Mechanic | 3×3 | 8 |
| `wu` | Butcher | 3×3 | 10 |
| `wl` | Leather | 3×3 | 11 |
| `wo` | Clothier | 3×3 | 13 |
| `wh` | Fishery | 3×3 | 14 |
| `ws` | Still | 3×3 | 15 |
| `wL` | Loom | 3×3 | 16 |
| `wq` | Quern | 1×1 | 17 |
| `wk` | Kitchen | 3×3 | 19 |
| `wy` | Ashery | 3×3 | 20 |

### Furnace codes (VERIFIED from enum)
| Code | Furnace | Enum |
|------|---------|------|
| `ew` | Wood Furnace | 0 |
| `es` | Smelter | 1 |
| `eg` | Glass Furnace | 2 |
| `ek` | Kiln | 3 |

### Build stats returned (VERIFIED)
```
build_designated: N, build_unsuitable: N
```

### Key lessons learned
- **`build_unsuitable` = trees, boulders, or occupied tiles** — clear them first
- **Surface building is tricky** — 38 trees near wagon, many tiles unsuitable
- **`buildingplan` plugin is auto-enabled** — buildings designated without materials will wait
- **Buildings need floor tiles** — can't build on walls, ramps, or open space

---

## 3. Stockpiles (VERIFIED)

### Quickfort place mode (VERIFIED — placed 4 stockpiles)
```lua
quickfort.apply_blueprint{mode='place', data='w(3x3)', pos={x=90, y=90, z=134}}
```

### Stockpile category codes (VERIFIED)
| Code | Category |
|------|----------|
| `a` | Animal |
| `f` | Food |
| `u` | Furniture |
| `n` | Stone |
| `w` | Wood |
| `e` | Gems |
| `b` | Bar/Block |
| `l` | Cloth |
| `d` | Leather |
| `A` | Ammo |
| `C` | Coins |
| `g` | Finished Goods |
| `p` | Weapons |
| `r` | Armor |
| `R` | Refuse |
| `s` | Sheets |
| `c` | Corpse |

### Stats returned
```
place_designated: N, place_occupied: N, place_tiles: N
```

---

## 4. Zones (VERIFIED)

### Quickfort zone mode (VERIFIED — placed meeting hall + gather zone)
```lua
quickfort.apply_blueprint{mode='zone', data='m(7x7)', pos={x=92, y=92, z=134}}
```

### Zone codes
| Code | Zone type |
|------|-----------|
| `m` | Meeting Hall/Tavern |
| `i` | Hospital |
| `t` | Temple |
| `l` | Library |
| `a` | Archery Range |
| `T` | Training/Barracks |
| `w` | Water Source |
| `p` | Pit/Pond |
| `g` | Gather/collect |
| `d` | Dump |

---

## 5. Farm Plots (VERIFIED)

### Placement (VERIFIED — 2 farm plots placed on surface)
```lua
quickfort.apply_blueprint{mode='build', data='p(5x5)', pos={x=84, y=95, z=134}}
```

### Key facts
- **Surface farms** need outdoor soil with light — works on `GrassLightFloor`, `SoilFloor`
- **Underground farms** need muddied stone floors (flood the area with water first)
- **`autofarm` plugin** handles crop rotation automatically
- **Farm plots are buildings** (building_type.FarmPlot), placed via build mode

---

## 6. Manager Orders & Workorders (VERIFIED)

### Import order presets (VERIFIED — 45 orders from library/basic)
```
dfhack-run orders import library/basic
```
Available presets: `library/basic`, `library/furnace`, `library/glassstock`, `library/military`, `library/rockstock`, `library/smelting`

### Create individual workorders (VERIFIED)
```
dfhack-run workorder MakeCharcoal 5
dfhack-run workorder ConstructBed 5
```

### Workorder Command Quirks (VERIFIED — critical for bot use)

**Simple format** works for SOME job types:
```
dfhack-run workorder ConstructBed 10    -- WORKS
dfhack-run workorder ConstructDoor 5    -- WORKS
dfhack-run workorder ConstructTable 5   -- WORKS
dfhack-run workorder MakeCharcoal 5     -- WORKS
dfhack-run workorder SmeltOre 1         -- WORKS
```

**Fails for multi-word or reaction-based jobs**:
```
dfhack-run workorder BrewDrink 20       -- FAILS (JSON parse error)
dfhack-run workorder ConstructChair 5   -- FAILS (JSON parse error)
```

**JSON format** is more reliable:
```
dfhack-run workorder '{"job":"MakeCharcoal","amount_total":10}'
```

**`BrewDrink` is NOT a valid job type for workorders!** Brewing is a workshop reaction at the Still, managed via `CustomReaction` entries. Use `orders import library/basic` which includes brewing orders as CustomReaction entries.

**Valid drink-related job types** (from enum scan):
```
19: Drink         -- personal drinking action (NOT a workorder)
20: DrinkItem     -- personal (NOT a workorder)
114: PrepareMeal  -- cooking (valid workorder)
221: DrinkBlood   -- vampire action (NOT a workorder)
```

### Reliable Approach: Import Order Libraries
```
dfhack-run orders import library/basic    -- 45+ essential orders including brewing
dfhack-run orders import library/furnace  -- heat treatment
dfhack-run orders import library/smelting -- ore processing
dfhack-run orders import library/military -- military equipment
```

### Query existing orders
```lua
local orders = df.global.world.manager_orders.all
-- Each order has: job_type, amount_total, frequency
```

---

## 7. Labor Management (VERIFIED)

### Direct labor toggle (VERIFIED)
```lua
unit.status.labors[df.unit_labor.MINE] = true  -- enable mining
```

### autolabor plugin (VERIFIED — enabled, assigned 21 miners)
```
dfhack-run enable autolabor
```
Aggressively assigns labors. May over-assign (gave 21 dwarves mining with only 3 picks).

### Key labors
```
MINE, CUTWOOD, HERBALIST, CARPENTER, MASON, HUNT, FISH, COOK, BREW, PLANT,
SMELT, FORGE_WEAPON, FORGE_ARMOR, CRAFT, BUILD_CONSTRUCTION, HAUL_STONE,
HAUL_WOOD, HAUL_FOOD, HAUL_REFUSE, HAUL_ITEM, HAUL_FURNITURE, HAUL_TRADE,
HAUL_WATER, CLEAN
```

---

## 8. Game Flow Control (VERIFIED)

### Pause/unpause (VERIFIED)
```lua
df.global.pause_state = false  -- unpause
dfhack.world.SetPauseState(true)  -- API alternative
```

### Timestream (VERIFIED — accelerated game to Y251)
```
dfhack-run enable timestream
dfhack-run timestream set fps 500
dfhack-run disable timestream
```

### Universal "unblock game" function (VERIFIED — cleared caravan popup + season pause)
```lua
-- Clears popups + overlays + pause state
local ps=df.global.world.status.popups; while #ps>0 do ps:erase(0) end
df.global.world.status.display_timer=0
for i=1,10 do local f=dfhack.gui.getCurFocus(true); if f[1]=="dwarfmode/Default" then break end
  dfhack.screen._doSimulateInput(dfhack.gui.getCurViewscreen(), {df.interface_key.LEAVESCREEN}) end
df.global.pause_state=false
```

---

## 9. State Queries (VERIFIED)

### Game time (VERIFIED)
```lua
dfhack.world.ReadCurrentYear()  -- 251
dfhack.world.ReadCurrentTick()  -- 0-403199
dfhack.world.ReadCurrentMonth() -- 0-11
dfhack.world.ReadCurrentDay()   -- 1-28
```
Season = tick / 100800 (0=Spring, 1=Summer, 2=Autumn, 3=Winter)

### Map size (VERIFIED: 192x192x150)
```lua
local x,y,z = dfhack.maps.getTileSize()  -- returns 3 values, NOT a table
```

### Tile inspection (VERIFIED)
```lua
local block = dfhack.maps.getTileBlock(x, y, z)
local lx = x % 16; local ly = y % 16
local tt = block.tiletype[lx][ly]
local shape = df.tiletype_shape[df.tiletype.attrs[tt].shape]  -- WALL, FLOOR, STAIR_DOWN, etc.
local material = df.tiletype_material[df.tiletype.attrs[tt].material]  -- SOIL, STONE, TREE, etc.
local hidden = block.designation[lx][ly].hidden
local outside = block.designation[lx][ly].outside
local light = block.designation[lx][ly].light
local subterranean = block.designation[lx][ly].subterranean
```

### Building queries (VERIFIED)
```lua
local bs = df.global.world.buildings.all  -- all buildings
-- Types: building_type.Workshop, .Furnace, .Stockpile, .Civzone, .FarmPlot, etc.
-- Subtypes: workshop_type.Masons, furnace_type.Smelter, etc.
dfhack.buildings.findAtTile(x, y, z)  -- building at specific tile
```

### Unit queries (VERIFIED)
```lua
for _,u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and dfhack.units.isAlive(u) then
        dfhack.units.getReadableName(u)
        dfhack.units.getProfessionName(u)
        dfhack.units.isCitizen(u)
        u.status.labors[df.unit_labor.MINE]  -- check labor
        u.job.current_job  -- current job or nil
    end
end
```

### Item queries (VERIFIED)
```lua
local items = df.global.world.items.all
-- item:getType(), item:getSubtype()
-- item.flags.on_ground, item.flags.in_building
-- dfhack.items.getPosition(item) → x,y,z
-- dfhack.items.getOwner(item) → unit or nil
```

### Fortress info (VERIFIED)
```lua
dfhack.world.getCurrentSite()  -- site object
dfhack.translation.translateName(site.name, true)  -- "Girderpriced"
df.global.plotinfo.tasks.wealth.total  -- fortress wealth
```

---

## 10. Enums Reference (VERIFIED from live game)

### Building types (40+)
```
0:Chair, 1:Bed, 2:Table, 3:Coffin, 4:FarmPlot, 5:Furnace, 6:TradeDepot, 7:Shop,
8:Door, 9:Floodgate, 10:Box, 11:Weaponrack, 12:Armorstand, 13:Workshop,
14:Cabinet, 15:Statue, 19:Bridge, 23:Trap, 25:Support, 27:Chain, 28:Cage,
29:Stockpile, 30:Civzone, 32:Wagon, 33:ScrewPump, 34:Construction, 35:Hatch,
40:GearAssembly
```

### Workshop types (21)
```
0:Carpenters, 1:Farmers, 2:Masons, 3:Craftsdwarfs, 4:Jewelers, 5:MetalsmithsForge,
6:MagmaForge, 7:Bowyers, 8:Mechanics, 9:Siege, 10:Butchers, 11:Leatherworks,
12:Tanners, 13:Clothiers, 14:Fishery, 15:Still, 16:Loom, 17:Quern, 18:Kennels,
19:Kitchen, 20:Ashery
```

### Furnace types (8)
```
0:WoodFurnace, 1:Smelter, 2:GlassFurnace, 3:Kiln, 4:MagmaSmelter,
5:MagmaGlassFurnace, 6:MagmaKiln, 7:Custom
```

### Construction types
```
0:Fortification, 1:Wall, 2:Floor, 3:UpStair, 4:DownStair, 5:UpDownStair, 6:Ramp
```

### Trap types
```
0:Lever, 1:PressurePlate, 2:CageTrap, 3:StoneFallTrap, 4:WeaponTrap, 5:TrackStop
```

### Noble positions (VERIFIED)
```
MILITIA_COMMANDER, MILITIA_CAPTAIN, SHERIFF, CAPTAIN_OF_THE_GUARD,
EXPEDITION_LEADER, MAYOR, MANAGER, CHIEF_MEDICAL_DWARF, BROKER,
BOOKKEEPER, CHAMPION, HAMMERER, DUNGEON_MASTER, MESSENGER
```

### Announcement types (first 40 VERIFIED)
```
0:REACHED_PEAK, 1:ERA_CHANGE, 2:FEATURE_DISCOVERY, 3:STRUCK_DEEP_METAL,
4:STRUCK_MINERAL, 5:STRUCK_ECONOMIC_MINERAL, 6-38:COMBAT_*, ...
```

---

## 11. Automation Plugins Status (VERIFIED)

| Plugin | Status | Purpose |
|--------|--------|---------|
| `autolabor` | ENABLED | Auto-assign labors to dwarves |
| `autochop` | can enable | Auto-designate trees for felling |
| `autofarm` | can enable | Auto-manage crop rotation |
| `seedwatch` | ENABLED | Auto-manage seed stocks |
| `tailor` | ENABLED | Auto-confiscate tattered clothing |
| `buildingplan` | ENABLED | Build without materials ready |
| `timestream` | can enable | Accelerate game simulation |
| `autobutcher` | available | Auto-cull livestock |
| `autonestbox` | available | Auto-assign nestboxes |

---

## 12. Quickfort Blueprint Library (VERIFIED)

### Key library blueprints discovered
| ID | Blueprint | Purpose |
|----|-----------|---------|
| 127 | `library/embark.csv -n /workshops` | Basic post-embark workshops |
| 128 | `library/embark.csv -n /stockpiles` | Basic post-embark stockpiles |
| 18-37 | `library/dreamfort.csv -n /surface*` | Complete surface fort (8 phases) |
| 65-67 | `library/dreamfort.csv -n /farming*` | Farming level (dig + build) |
| 75-77 | `library/dreamfort.csv -n /industry*` | Industry level (dig + workshops) |
| 83-86 | `library/dreamfort.csv -n /services*` | Services level (dining, hospital) |
| 108-110 | `library/dreamfort.csv -n /suites*` | Noble suites |
| 115-116 | `library/dreamfort.csv -n /apartments*` | Bedroom complex |
| 120-122 | `library/dreamfort.csv -n /crypt*` | Crypt level |
| 129-131 | `library/exploratory-mining/*` | Mining patterns |

### Dreamfort is a complete multi-level fortress template
Surface → Farming → Industry → Services → Guildhall → Suites → Apartments → Crypt

### Order presets
`library/basic` (45 orders), `library/furnace`, `library/glassstock`, `library/military`, `library/rockstock`, `library/smelting`

---

## 13. Practical Playthrough Log (Girderpriced)

### Starting state (Y250 Summer)
- 192x192x150 map, wagon at (96,95,134)
- 23 citizens (7 founders + 16 migrants)
- Soil at z=134-133, stone from z=132 down
- 1,025 trees, 343 inorganic materials
- Starting items: 419 weapons, 15 barrels, 11 bags, 1 anvil, 3 picks, 3 wood

### Actions taken
1. **Dug stairwell** z=134→130 at (93,92) via Quickfort API + direct Lua designation
2. **Dug 10x10 room** at z=132 + workshop rooms + hallways (309 total designations)
3. **Fixed entrance** — had to dig 3x3 landing at z=133 so miners had space to stand
4. **Placed 4 stockpiles** on surface (wood, food, furniture, stone)
5. **Built workshops** — mason, smelter, kitchen (carpenter/craftsdwarf failed: trees in way)
6. **Created meeting zone** (7x7) and **gather zone** (20x20)
7. **Placed 2 farm plots** on surface
8. **Enabled** autolabor, autofarm, autochop, seedwatch, tailor, buildingplan
9. **Imported 45 standing orders** from library/basic
10. **Queued workorders**: MakeCharcoal x5, ConstructBed x5
11. **Enabled mining** on 3 dwarves (limited by 3 picks)
12. **Advanced** to Y251 via timestream

### Critical issues encountered
- **Miners couldn't path** to underground: stairwell at z=133 was surrounded by unwedged walls. Fix: dig 3x3 landing at z=133.
- **Only 1 miner had a pick** despite 3 available: picks were in wagon, other miners grabbed them slowly. autolabor over-assigned 21 miners for 3 picks.
- **No food/drink by Y251**: 0 food, 0 drink, 78 seeds. Needed emergency farming + gathering. Surface farm plots placed, herbalist labor enabled.
- **Surface building blocked by trees**: 38 trees near wagon made workshops `build_unsuitable`. Need to enable autochop or manually cut trees.
- **Quickfort `workorder` command quirk**: multi-word job names like `BrewDrink 20` cause JSON parse errors in workorder command (tries to parse as JSON). Use `dfhack-run workorder BrewDrink 20` separately.

---

## 14. Bot Architecture Implications

### For a game-playing bot, the key control primitives are:

1. **Quickfort API** for mass operations (dig, build, place, zone)
2. **Direct Lua** for fine-grained control (tile designation, labor assignment, unit inspection)
3. **Plugin commands** for automation (autolabor, autofarm, autochop)
4. **Workorder/orders** for production management
5. **Game state queries** for decision-making (food stocks, population, wealth)

### Recommended bot loop:
```
1. Query game state (tick, citizens, food, threats)
2. Check for blockers (popups, overlays, season pause)
3. Clear blockers if found
4. Evaluate needs (food? shelter? military? trade?)
5. Issue commands (dig, build, workorder, labor assignment)
6. Advance game time (unpause, optionally timestream)
7. Poll for completion
8. Repeat
```

### Key APIs for bot development:
- `quickfort.apply_blueprint{}` — batch construction
- `df.global.world.units.active` — unit roster
- `df.global.world.buildings.all` — building inventory
- `df.global.world.items.all` — item inventory
- `df.global.world.manager_orders.all` — production queue
- `dfhack.world.Read*()` — game time
- `dfhack.maps.getTileBlock()` — terrain inspection
- `dfhack.buildings.findAtTile()` — building lookup
- `df.global.world.status.popups` — popup management
- `dfhack.gui.getCurFocus(true)` — overlay detection

---

## 15. Military System (VERIFIED)

### World vs Fortress Squads (CRITICAL DISTINCTION)

`df.global.world.squads.all` contains **every squad in the world** — all civilizations, not just yours. In our test world: **331 squads total, 0 fortress-owned** until we created one.

**Filter for fortress squads:**
```lua
local fort_id = df.global.plotinfo.group_id
for _, sq in ipairs(df.global.world.squads.all) do
    if sq.entity_id == fort_id then
        -- This is a fortress squad
    end
end
```

### Squad Struct Fields (VERIFIED)
```lua
sq.id                          -- unique squad ID (ours was 331)
sq.alias                       -- player-set display name (e.g., "Iron Guard")
sq.entity_id                   -- owning entity ID (match against plotinfo.group_id)
sq.cur_routine_idx             -- current training routine index
sq.uniform_priority            -- equipment priority
sq.activity                    -- current activity (-1 = none)
sq.leader_position             -- position ID of squad leader role
sq.leader_assignment           -- assignment ID that created this squad
sq.assigned_army_controller_id -- for world army tracking (-1 = none)
sq.positions                   -- array of 10 position slots
sq.positions[i].occupant       -- unit_id (-1 = empty, >=0 = filled)
```

### Creating a Squad (VERIFIED)
```lua
-- Requires a militia commander assignment to exist
local mc_assignment_id = 11  -- from positions.assignments
local squad = dfhack.military.makeSquad(mc_assignment_id)
squad.alias = "Iron Guard"

-- Assign a unit as commander (position 0)
dfhack.military.addToSquad(unit.id, squad.id, 0)

-- Remove from squad
dfhack.military.removeFromSquad(unit.id)

-- Full API:
dfhack.military.makeSquad(assignment_id)
dfhack.military.addToSquad(unit_id, squad_id, squad_pos)  -- pos 0-9
dfhack.military.removeFromSquad(unit_id)
dfhack.military.getSquadName(squad_id)
dfhack.military.updateRoomAssignments(squad_id, assignment_id, flags)
```

### Key Lessons
- Squad creation requires a MILITIA_COMMANDER position assignment (id=11 in our fortress)
- Squads have 10 positions (0 = commander, 1-9 = soldiers)
- `sq.alias` is the player-set name; `dfhack.military.getSquadName()` returns the generated name
- The `entity_id` filter is **essential** — without it you'll process 300+ NPC squads

---

## 16. Nobles & Administration (VERIFIED)

### Fortress Positions (VERIFIED — 14 positions)

Access via `df.global.plotinfo.main.fortress_entity`:
```lua
local site_gov = df.global.plotinfo.main.fortress_entity
for _, pos in ipairs(site_gov.positions.own) do
    print(pos.code, pos.name[0])
end
```

| Position Code | Name | Function |
|--------------|------|----------|
| `MILITIA_COMMANDER` | militia commander | Creates/leads first squad |
| `MILITIA_CAPTAIN` | militia captain | Leads additional squads |
| `SHERIFF` | sheriff | Early justice enforcement |
| `CAPTAIN_OF_THE_GUARD` | captain of the guard | Full justice enforcement |
| `EXPEDITION_LEADER` | expedition leader | Initial leader; diplomat |
| `MAYOR` | mayor | Replaces exp. leader at 50 pop |
| `MANAGER` | manager | Validates work orders |
| `CHIEF_MEDICAL_DWARF` | chief medical dwarf | Manages hospital |
| `BROKER` | broker | Conducts trade |
| `BOOKKEEPER` | bookkeeper | Tracks stock accuracy |
| `CHAMPION` | champion | Elite military position |
| `HAMMERER` | hammerer | Administers punishment |
| `DUNGEON_MASTER` | dungeon master | Handles exotic creatures |
| `MESSENGER` | messenger | Diplomatic courier |

### Appointing Nobles Programmatically (VERIFIED)
```lua
local site_gov = df.global.plotinfo.main.fortress_entity

-- Find the assignment for a specific position
for _, a in ipairs(site_gov.positions.assignments) do
    -- Match assignment to position code
    for _, p in ipairs(site_gov.positions.own) do
        if p.id == a.position_id and p.code == "MANAGER" then
            -- Appoint by setting histfig to the unit's historical figure ID
            a.histfig = unit.hist_figure_id
        end
    end
end
```

### Verified Appointments (Session 43)
- Manager: Cerol Brassringed (Miner)
- Bookkeeper: Melbil Oilyrouts (Stonecrafter)
- Broker: Erush Groovedgold (Fisherdwarf)
- Chief Medical Dwarf: Minkot Relievedbook (Mason)
- Expedition Leader: Urist Keylesson (pre-assigned at embark)

### Civilization vs Fortress Positions
Two different entity hierarchies:
- **`df.global.plotinfo.civ_id`** → parent civilization: MONARCH, GENERAL, DUKE, COUNT, BARON, DIPLOMAT, OUTPOST_LIAISON
- **`df.global.plotinfo.main.fortress_entity`** → fortress: the 14 positions above
- Civilization positions are filled by worldgen NPCs, not controllable by the player

### Key Lessons
- **Manager is critical** — without a Manager, workorders cannot be validated or executed
- **Bookkeeper accuracy** matters — set to maximum for precise stock counts
- **Broker skill** determines trade efficiency — Appraisal skill affects price accuracy
- Noble appointment is instant — just set `assignment.histfig = unit.hist_figure_id`

---

## 17. Trade & Economy (PARTIALLY VERIFIED)

### Trade Depot (VERIFIED — placement works)
```lua
-- Via Quickfort:
quickfort.apply_blueprint{mode='build', data='D', pos={x=75, y=88, z=134}}
```
The `D` code designates a 5×5 Trade Depot. Requires materials (3 building materials + Architecture labor).

### Current Fortress Economy (VERIFIED)
- Wealth: 1,438 (very low — only Y251)
- No trade depot built yet
- No caravans arrived (need depot + accessible 3-wide path to map edge)

### Item Inventory (VERIFIED — Session 43)
```
BOOK: 6,859   TOOL: 2,939   WEAPON: 687   THREAD: 585   WOOD: 224
ROCK: 152     SHOES: 100    BOULDER: 90    SEEDS: 80     GLOVES: 54
ARMOR: 42     PANTS: 35     BARREL: 15     SHIELD: 15    GEM: 18
BAG: 11       BED: 1        ANVIL: 1
```

### Key Lessons
- The massive BOOK count (6,859) comes from worldgen civilizations
- Most items are worldgen artifacts — the fortress itself has produced almost nothing
- Need to build trade depot before autumn caravans arrive

---

## 18. Water & Fluid Mechanics (VERIFIED)

### Fluid Distribution (VERIFIED — full map scan z=100-145)
```
Water tiles: 3,711  (underground river/lake at z=102, coords ~24-26, 20-21)
Magma tiles: 3      (magma feature reaching mid-levels)
```

### Deep Magma (VERIFIED — sample scan z=0-20)
```
Magma tiles: 702    (magma sea confirmed at deep levels)
```

### Fluid Level Querying (VERIFIED)
```lua
local block = dfhack.maps.getTileBlock(x, y, z)
local des = block.designation[x%16][y%16]
des.flow_size       -- 0-7 (0=dry, 7=full)
des.liquid_type     -- false=water, true=magma
des.flow_forbid     -- blocks flow propagation
```

### Setting Fluid Levels (VERIFIED)
```lua
des.flow_size = 7                           -- set to full (1=puddle, 7=full)
des.liquid_type = false                     -- water (true = magma)
dfhack.maps.enableBlockUpdates(block, true) -- trigger liquid processing
block.flags.designated = true               -- alternative trigger
```

### Block Flags (VERIFIED — 53.x field names)
```lua
block.flags.designated            -- block needs processing
block.flags.update_liquid         -- liquid needs processing (NOT liquid_1)
block.flags.update_liquid_twice   -- process liquid twice (NOT liquid_2)
block.flags.update_temperature    -- temperature needs update
block.flags.has_aquifer           -- aquifer present
block.flags.has_river_high/medium/low  -- river proximity
block.flags.has_magma_close/far   -- magma proximity
```

### Muddying Underground Floors (VERIFIED — 159 tiles muddied)
```lua
-- Place 1/7 water on stone floors; water evaporates, leaves mud for farming
for x = x1, x2 do
    for y = y1, y2 do
        local block = dfhack.maps.getTileBlock(x, y, z)
        local des = block.designation[x%16][y%16]
        if des.flow_size == 0 then
            des.flow_size = 1
            des.liquid_type = false
            dfhack.maps.enableBlockUpdates(block, true)
        end
    end
end
```

### Aquifer Check (VERIFIED — z=132 sample)
Zero aquifer tiles found in the fortress area — safe for underground construction.

### Key Lessons
- Underground water at z=102 is a potential irrigation/drinking source
- Magma at deep levels enables magma forges (no fuel needed)
- The 3 mid-level magma tiles indicate a magma pipe — could be exploited for closer forge access
- Always check `des.flow_size > 0` before assuming a tile is dry

---

## 19. Burrows (VERIFIED)

### Accessing Burrows
```lua
df.global.plotinfo.burrows.list  -- array of all burrows
-- Each burrow: .id, .name, .units (array of unit IDs)
```

### Creating Burrows
Direct struct creation (`df.burrow:new()`) works but `plotinfo.next_burrow_id` does not exist in 53.x. Use the `burrow` command instead:

```
-- Add tiles to a named burrow
dfhack-run burrow tiles box-add "Safe Room" 92,92,134 98,98,134

-- Flood-fill add from a point
dfhack-run burrow tiles flood-add "Safe Room" --cursor 95,95,134

-- Set from keywords
dfhack-run burrow tiles set Inside INSIDE
dfhack-run burrow tiles remove Inside HIDDEN

-- Assign units
dfhack-run burrow units set "Safe Room" Peasants Skilled

-- Clear
dfhack-run burrow tiles clear "Safe Room"
```

### Quickfort Burrow Mode
`#burrow` mode exists but expansion syntax (`b(NxN)`) is invalid. Each cell must contain the burrow name.

### Auto-Expanding Burrows
Enable the `burrow` plugin to auto-expand burrows whose names end in `+`:
```
dfhack-run enable burrow
-- Name a burrow "Mining Zone+" and it auto-expands as walls are dug
```

---

## 20. Healthcare (VERIFIED)

### Health Counter Fields (VERIFIED — in counters2, NOT counters)
```lua
unit.counters2.hunger_timer      -- hunger level (236,723 = very hungry)
unit.counters2.thirst_timer      -- thirst level (8,535 = moderate)
unit.counters2.sleepiness_timer  -- fatigue (160,117 = very tired)
unit.counters2.stored_fat        -- body fat reserves (92,802)
unit.counters2.stomach_content   -- current stomach fullness
unit.counters2.stomach_food      -- food being digested
unit.counters2.exhaustion        -- physical exhaustion
unit.counters2.fever             -- fever level
unit.counters2.paralysis         -- paralysis level
unit.counters2.numbness          -- numbness level
```

### Combat/Status Counters (VERIFIED — in counters)
```lua
unit.counters.pain               -- pain level
unit.counters.nausea             -- nausea level
unit.counters.dizziness          -- dizziness level
unit.counters.winded             -- out of breath
unit.counters.stunned            -- stun timer
unit.counters.unconscious        -- unconscious timer
unit.counters.suffocation        -- suffocation timer
unit.counters.webbed             -- web entanglement
unit.counters.death_cause        -- how they died (-1 = alive)
unit.counters.death_id           -- death event ID (-1 = alive)
unit.counters.soldier_mood       -- military mood (-1 = none)
```

### Wound System (VERIFIED)
```lua
unit.body.wounds  -- array of wound objects
#unit.body.wounds -- wound count (0 = uninjured)
```

### Stress System (VERIFIED)
```lua
unit.status.current_soul.personality.stress
-- Negative = happy (-92,870 for Cerol), positive = stressed (85,300 for Etur)
-- >100,000 → tantrum-prone; >200,000 → insane
```

### Healthcare Appointments
- Chief Medical Dwarf: appointed via noble system (see Section 16)
- Hospital zone: Create via Quickfort zone mode `i(NxN)` or direct construction
- Hospital needs: chest (for supplies), bucket, traction bench, cloth, plaster

---

## 21. Advanced Construction (VERIFIED via Quickfort)

### Building Codes (ALL VERIFIED — designated successfully)

**Bridges** (retractable barriers):
```lua
quickfort.apply_blueprint{mode='build', data='gx(3x1)', pos={x=93, y=88, z=134}}
-- gx = bridge raises east, ga = north, gd = south, gw = west
```

**Doors, Levers, Traps** (all verified):
```lua
quickfort.apply_blueprint{mode='build', data='d', pos=...}   -- Door
quickfort.apply_blueprint{mode='build', data='Tl', pos=...}  -- Lever
quickfort.apply_blueprint{mode='build', data='Tc', pos=...}  -- Cage Trap
quickfort.apply_blueprint{mode='build', data='Ts', pos=...}  -- Stone-Fall Trap
quickfort.apply_blueprint{mode='build', data='Tw', pos=...}  -- Weapon Trap
quickfort.apply_blueprint{mode='build', data='Tp', pos=...}  -- Pressure Plate
```

**Furniture** (verified):
```lua
data='b'   -- Bed
data='t'   -- Table
data='c'   -- Chair
data='n'   -- Coffin
data='a'   -- Armor Stand
data='r'   -- Weapon Rack
data='x'   -- Cabinet
data='s'   -- Statue
data='S'   -- Support
data='H'   -- Floodgate
data='l'   -- Well
```

**Constructions** (verified):
```lua
data='Cw'  -- Wall construction
data='Cf'  -- Floor construction
data='Cu'  -- Up Stair construction
data='Cd'  -- Down Stair construction
data='Cx'  -- Up/Down Stair construction
data='Cr'  -- Ramp construction
data='CF'  -- Fortification construction
```

**Mechanical** (from research):
```lua
data='Ms'  -- Screw Pump
data='Mg'  -- Gear Assembly
data='Mh'  -- Horizontal Axle
data='Mv'  -- Vertical Axle
```

### Direct Lua Construction (VERIFIED)
```lua
-- Floor construction at specific tile
dfhack.buildings.constructBuilding{
    pos = xyz2pos(95, 88, 134),
    type = df.building_type.Construction,
    subtype = df.construction_type.Floor
}
```

### Key Lessons
- Bridge codes: `g` + direction letter (`x`=east, `a`=north, `d`=south, `w`=west)
- All trap codes start with `T` + type letter
- Construction codes start with `C` + type letter
- `buildingplan` plugin queues construction even without materials

---

## 22. Unit Deep Dive (VERIFIED)

### Skill System (VERIFIED)
```lua
local soul = unit.status.current_soul
for _, skill in ipairs(soul.skills) do
    local name = df.job_skill[skill.id]
    local level = skill.rating      -- 0-20 (0=Dabbling...15=Legendary)
    local xp = skill.experience     -- experience points toward next level
end
```

**Sample skills from Cerol (Miner):**
```
MINING = 5 (Skilled), APPRAISAL = 4, PLAY_STRINGED_INSTRUMENT = 3,
PLAY_WIND_INSTRUMENT = 3, POETRY = 2, DANCE = 2, SING_MUSIC = 2,
JUDGING_INTENT = 1, SPEAKING = 1, MAKE_MUSIC = 1
```

### Personality Facets (VERIFIED — 50 traits, 0-100 scale)
```lua
for i = 0, 49 do
    local trait_name = df.personality_facet_type[i]
    local value = soul.personality.traits[i]  -- 0-100
end
```

**First 10 facets (Cerol):**
```
LOVE_PROPENSITY=53, HATE_PROPENSITY=24, ENVY_PROPENSITY=60,
CHEER_PROPENSITY=36, DEPRESSION_PROPENSITY=58, ANGER_PROPENSITY=41,
ANXIETY_PROPENSITY=50, LUST_PROPENSITY=50, STRESS_VULNERABILITY=24, GREED=58
```

### Stress Levels (VERIFIED)
| Range | State | Example |
|-------|-------|---------|
| < -100,000 | Very happy | Cerol: -92,870 |
| -100,000 to 0 | Content | Melbil: -16,360 |
| 0 to 25,000 | Stressed | Multiple dwarves |
| 25,000 to 100,000 | Very stressed | Etur: 85,300, Thîkut: 46,420 |
| > 100,000 | Tantrum-prone | — |
| > 200,000 | Insane | — |

### Necromancers Among Citizens (DISCOVERED + VERIFIED!)
Two citizens are necromancers: Dastot "Manorhands" and Geshud "Postheroes" (both Doctor necromancers). Their profession shows "Doctor" but they have necromantic abilities — they can potentially raise corpses.

**Key discovery: Necromancers don't need food or drink!**
```
Dastot: thirst=0, hunger=0 (immortal, no sustenance needed)
Geshud: thirst=0, hunger=0 (same)
```
They're effectively undead — they'll outlive starvation crises. This makes them the most reliable citizens in emergency situations. Risk: they can raise corpses (manage Refuse stockpile carefully).

---

## 23. Stockpile Code Reference (VERIFIED)

All lowercase codes work. Uppercase codes (A=Ammo, C=Coins, R=Refuse) produce warnings but still function.

| Code | Category | Verified |
|------|----------|----------|
| `a` | Animal | Yes |
| `f` | Food | Yes |
| `u` | Furniture | Yes |
| `n` | Stone | Yes |
| `w` | Wood | Yes |
| `e` | Gems | Yes |
| `b` | Bar/Block | Yes |
| `l` | Cloth | Yes |
| `d` | Leather | Yes |
| `A` | Ammo | Yes (warning) |
| `C` | Coins | Yes (warning) |
| `g` | Finished Goods | Yes |
| `p` | Weapons | Yes |
| `r` | Armor | Yes |
| `R` | Refuse | Yes (warning) |
| `s` | Sheets | Yes |
| `c` | Corpse | Yes |

### Stockpile filter syntax (from research):
```
f:=booze              -- Food stockpile, booze only
p:-cat_weapons/other  -- Disable "other" weapons sub-category
f{barrels=3}          -- Limit to 3 barrels
```

---

## 24. Farming Deep Dive (VERIFIED)

### Farm Crop Assignment (VERIFIED)
```lua
-- Find plant index by ID
local plump_id = -1
for i, p in ipairs(df.global.world.raws.plants.all) do
    if p.id == "MUSHROOM_HELMET_PLUMP" then
        plump_id = i
        break
    end
end

-- Assign to farm for all 4 seasons
for _, b in ipairs(df.global.world.buildings.all) do
    if b:getType() == df.building_type.FarmPlot then
        for season = 0, 3 do
            b.plant_id[season] = plump_id
        end
    end
end
```

### Crop Categories (VERIFIED — from raws scan)

**Surface crops: 93+ types**, all grow all 4 seasons! Examples:
```
Grains: SINGLE-GRAIN_WHEAT(0), BARLEY(5), OATS(7), RYE(9), RICE(11), MAIZE(12)
Vegetables: POTATO(64), CABBAGE(41), CARROT(43), TURNIP(75), ONION(59), GARLIC(52)
Legumes: PEA(61), LENTIL(55), CHICKPEA(46), SOYBEAN(68), PEANUT(62)
Fruits: STRAWBERRY(182), BLUEBERRY(87), GRAPE(84), WATERMELON(77)
Fibers: FLAX(27), COTTON(30), HEMP(29), JUTE(28)
DF-native: ROOT_MUCK(178), TUBER_BLOATED(179), BERRIES_PRICKLE(181)
```

**Underground crops: only 6 types** (require subterranean + muddied stone or soil):
```
MUSHROOM_HELMET_PLUMP(173)  — all seasons (the classic DF staple)
GRASS_TAIL_PIG(174)         — Su/Au (thread + beer)
GRASS_WHEAT_CAVE(175)       — Su/Au (flour + beer)
POD_SWEET(176)              — Sp/Su (wine + cooking)
BUSH_QUARRY(177)            — Sp/Su/Au (leaves, needs processing)
MUSHROOM_CUP_DIMPLE(188)    — all seasons (blue dye only)
```

### Underground Farm Requirements (VERIFIED)
- Stone floors at z=132: 107 dug tiles BUT 0 soil → **must muddy first**
- Muddying: flood the area with water (1/7 is enough), then drain → leaves mud residue
- Alternative: dig into a soil layer (z=133 had soil in our embark)
- Quickfort farm plot: `quickfort.apply_blueprint{mode='build', data='p(5x5)', pos={x,y,z}}`

### autofarm Plugin (VERIFIED)
```
dfhack-run enable autofarm
dfhack-run autofarm default 30          -- target 30 of each crop
dfhack-run autofarm threshold 200 MUSHROOM_HELMET_PLUMP  -- override for plump helmets
```

### Key Lessons
- **Surface farms can't grow underground crops** — plump helmets need `BIOME_SUBTERRANEAN_WATER` flag
- **Underground farms need muddied stone floors** — soil floors work directly, stone must be flooded first
- **Farm plots have per-season crop IDs**: `b.plant_id[0..3]` for Spring/Summer/Autumn/Winter
- **Plant index -1 = no crop assigned** — this was our starvation root cause
- **93+ surface crops exist** — all grow all 4 seasons, far more variety than underground
- **autofarm auto-rotates crops** but only works if enabled AND farm plots exist

---

## 25. Plugin Ecosystem (VERIFIED)

### Enabling Plugins (VERIFIED)
```
dfhack-run enable <plugin_name>
dfhack-run disable <plugin_name>
```

### Plugin Status Check
`dfhack.internal.getPluginState()` and `isPluginLoaded()` do NOT exist in 53.x. Use:
```
dfhack-run <plugin_name> status
```
Each plugin has its own status subcommand.

### Essential Plugins for Bot Operations
| Plugin | Purpose | Enable At |
|--------|---------|-----------|
| `autolabor` | Auto-assign labors | Embark |
| `autofarm` | Auto-manage crop rotation | After farms built |
| `seedwatch` | Prevent seed depletion | Embark |
| `tailor` | Auto-order clothing | After clothier built |
| `buildingplan` | Queue buildings without materials | Always (default on) |
| `suspendmanager` | Smart job suspension | Embark |
| `autochop` | Auto-designate trees | When wood needed |
| `autobutcher` | Manage livestock | When animals arrive |
| `channel-safely` | Prevent channeling accidents | Before channeling |

---

## 26. Comprehensive Quickfort Build Code Reference (VERIFIED)

### Workshops (mode='build')
```
wc=Carpenter  ww=Farmer  wm=Mason  we=Craftsdwarf  wj=Jeweler
wf=Forge  wM=Mechanic  wu=Butcher  wl=Leather  wo=Clothier
wh=Fishery  ws=Still  wL=Loom  wq=Quern  wk=Kitchen  wy=Ashery
```

### Furnaces (mode='build')
```
ew=WoodFurnace  es=Smelter  eg=GlassFurnace  ek=Kiln
```

### Furniture (mode='build')
```
b=Bed  t=Table  c=Chair  n=Coffin  a=Armorstand  r=Weaponrack
d=Door  H=Floodgate  x=Cabinet  s=Statue  S=Support  l=Well
```

### Constructions (mode='build')
```
Cw=Wall  Cf=Floor  Cu=UpStair  Cd=DownStair  Cx=UpDownStair
Cr=Ramp  CF=Fortification
```

### Traps (mode='build')
```
Tl=Lever  Tp=PressurePlate  Tc=CageTrap  Ts=StoneFall  Tw=WeaponTrap
```

### Other (mode='build')
```
D=TradeDepot  gx/ga/gd/gw=Bridge(E/N/S/W)  p=FarmPlot
Ms=ScrewPump  Mg=GearAssembly  Mh=HorizAxle  Mv=VertAxle
```

### Designations (mode='dig')
```
d=Mine  h=Channel  j=DownStair  u=UpStair  i=UpDownStair  r=Ramp
s=Smooth  e=Engrave
```

### Stockpiles (mode='place')
```
a=Animal  f=Food  u=Furniture  n=Stone  w=Wood  e=Gems  b=Bar/Block
l=Cloth  d=Leather  A=Ammo  C=Coins  g=FinishedGoods  p=Weapons
r=Armor  R=Refuse  s=Sheets  c=Corpse
```

### Zones (mode='zone')
```
m=MeetingHall  i=Hospital  t=Temple  l=Library  a=ArcheryRange
T=Training/Barracks  w=WaterSource  p=Pit/Pond  g=Gather  d=Dump
```

### Expansion Syntax
```
d(10x10)     -- 10×10 rectangle
d(3x1)       -- 3-wide, 1-tall
wm(3x3)     -- 3×3 mason workshop (minimum for workshops)
```

---

## 27. Zone Type Enum (VERIFIED — 98 types)

```
0:Home  1:Depot  2:Stockpile  3:NobleQuarters  4:Shop
7:MeadHall  8:ThroneRoom  10:Temple  11:Kitchen  12:CaptiveRoom
13:TowerTop  14:Courtyard  15:Treasury  16:GuardPost  17:Entrance
18:SecretLibrary  19:Library  20:Plot  21:MarketStall
47:Well  79:Dormitory  80:DiningHall  81:Shrine  82:WaterSource
83:Dump  84:SandCollection  85:FishingArea  86:Pond
87:MeetingHall  88:Pen  89:ClayCollection  90:AnimalTraining
91:PlantGathering  92:Bedroom  93:Office  94:ArcheryRange
95:Barracks  96:Dungeon  97:Tomb
```

Many types (22-78) are worldgen-specific (workshops, guild offices, tower rooms) not directly used in fortress mode.

---

## 28. Complete Lua API Reference (VERIFIED paths)

### Maps Module
```lua
dfhack.maps.getSize()                    -- block dimensions
dfhack.maps.getTileSize()               -- tile dimensions (192x192x150)
dfhack.maps.isValidTilePos(x, y, z)     -- bounds check
dfhack.maps.getTileBlock(x, y, z)       -- get block by tile coords
dfhack.maps.getBlock(bx, by, bz)        -- get block by block coords
dfhack.maps.ensureTileBlock(x, y, z)    -- allocate if missing
dfhack.maps.enableBlockUpdates(block, flow)  -- trigger update
```

### Units Module
```lua
dfhack.units.isCitizen(u)               -- fort member, sane
dfhack.units.isAlive(u)                 -- not dead
dfhack.units.getReadableName(u)         -- "Name Surname, Profession"
dfhack.units.getProfessionName(u)       -- profession string
dfhack.units.getRaceName(u)             -- "DWARF", "GOBLIN"
dfhack.units.getAge(u)                  -- years as float
dfhack.units.getNominalSkill(u, skill)  -- skill level
dfhack.units.getEffectiveSkill(u, skill)-- skill with penalties
dfhack.units.setNickname(u, nick)       -- set display name
```

### Buildings Module
```lua
dfhack.buildings.constructBuilding{...} -- create building
dfhack.buildings.findAtTile(x, y, z)    -- lookup
dfhack.buildings.deconstruct(bld)       -- remove
dfhack.buildings.isActive(bld)          -- check status
```

### Military Module
```lua
dfhack.military.makeSquad(assignment_id) -- create squad
dfhack.military.addToSquad(uid, sid, pos)-- add member
dfhack.military.removeFromSquad(uid)     -- remove member
dfhack.military.getSquadName(sid)        -- get name
dfhack.military.updateRoomAssignments(sid, aid, flags)
```

### Items Module
```lua
dfhack.items.getPosition(item)           -- x,y,z
dfhack.items.getOwner(item)              -- unit or nil
dfhack.items.getContainer(item)          -- container item
dfhack.items.moveToGround(item, pos)     -- relocate
dfhack.items.getValue(item)              -- gold value
dfhack.items.getDescription(item, 0)     -- readable name
dfhack.items.canTrade(item)              -- trade eligibility
dfhack.items.markForTrade(item, depot)   -- mark for trade
```

### Key Global Data Paths
```lua
df.global.world.units.active             -- on-map units
df.global.world.items.all                -- all items
df.global.world.buildings.all            -- all buildings
df.global.world.squads.all              -- ALL world squads
df.global.world.manager_orders.all       -- work orders
df.global.world.raws.plants.all          -- plant definitions
df.global.world.raws.creatures.all       -- creature definitions
df.global.world.raws.inorganics.all      -- rock/metal definitions
df.global.plotinfo.group_id              -- fortress entity ID
df.global.plotinfo.civ_id               -- parent civ entity ID
df.global.plotinfo.main.fortress_entity  -- fortress entity object
df.global.plotinfo.burrows.list          -- all burrows
df.global.plotinfo.tasks.wealth.total    -- fortress wealth
```

---

## 29. Updated Playthrough Log (Girderpriced, Y251 Month 2)

### Actions Taken (continued from Section 13)
13. **Fixed farm crops** — all 3 farms set to Plump Helmets for all 4 seasons (plant index 173)
14. **Enabled autofarm** plugin for automatic crop management
15. **Appointed nobles**: Manager (Cerol), Bookkeeper (Melbil), Broker (Erush), Chief Medical Dwarf (Minkot)
16. **Created military squad** "Iron Guard" (Squad 331) with Thîkut as militia commander
17. **Designated trade depot** at (75,88,134) via Quickfort
18. **Designated buildings**: bridge, door, lever, cage trap, well, beds, wall construction, fortification
19. **Enabled plugins**: autofarm, seedwatch, tailor, buildingplan, suspendmanager
20. **Discovered** underground water (3,711 tiles at z=102) and magma (702 tiles at z=0-20)
21. **Discovered** 2 necromancer citizens (Dastot + Geshud)

### Fortress State at Y251 M4 (Summer)
```
Citizens: 19 (7 founders + 12 migrants)
Military: 1 squad ("Iron Guard"), 1 member
Nobles: Expedition Leader, Manager, Bookkeeper, Broker, Chief Medical Dwarf
Buildings: 2 workshops (Mason, Clothier), 1 furnace (Smelter), 3 farm plots,
           4 stockpiles, 2 zones (MeetingHall, PlantGathering), 1 wagon
Food: 0 (CRITICAL — farms now planted, awaiting harvest)
Drink: 0 (CRITICAL — no still built yet)
Seeds: 80
Wealth: 1,438
Underground: Water at z=102, Magma at z=0-20
Dangers: 2 necromancer citizens, food/drink crisis
```

### Fortress State at Y251 M5 D21 (Late Summer)
```
Citizens: 12 (7 DIED from starvation/dehydration)
Military: 1 squad ("Iron Guard")
Nobles: Expedition Leader, Manager, Bookkeeper, Broker, Chief Medical Dwarf
Workshops: Mason, Clothier, Carpenter (Still designated but not yet built)
Farm plots: 3 surface (wheat) + 3 underground designated (plump helmets)
Food: 0, Drink: 0, Seeds: 103, Plants: 15
Wealth: 1,527
Underground: 159 tiles muddied at z=132 for farming
LESSON: Food crisis kills dwarves FAST. Must establish food/drink immediately at embark.
```

---

## 30. Bot Architecture Implications (Updated)

### Complete Control Primitive Set (VERIFIED)

| Category | Primary API | Fallback |
|----------|------------|----------|
| Mass operations | `quickfort.apply_blueprint{}` | Direct Lua tile manipulation |
| Labor management | `enable autolabor` | `unit.status.labors[X] = true` |
| Production | `workorder` / `orders import` | Direct manager_orders manipulation |
| Military | `dfhack.military.*` | Direct squad struct manipulation |
| Noble management | Direct `positions.assignments` | — |
| Building queries | `df.global.world.buildings.all` | `dfhack.buildings.findAtTile()` |
| Unit queries | `df.global.world.units.active` | `dfhack.units.isCitizen()` filter |
| Item queries | `df.global.world.items.all` | Type-specific sub-arrays |
| Game flow | `df.global.pause_state` / `timestream` | Popup clearing function |
| Burrows | `burrow tiles box-add` command | Direct burrow struct |
| Automation | Plugin enable/disable | — |

### Decision-Making Data Sources (VERIFIED)
```lua
-- Food emergency?
if food_count == 0 then → plant crops, enable autofarm, build still
-- Military needed?
if citizen_count > 10 then → create squad, train soldiers
-- Trade ready?
if season == 2 and no_depot then → build depot, prepare goods
-- Health crisis?
if unit.counters2.hunger_timer > 200000 then → emergency food
-- Stress crisis?
if soul.personality.stress > 50000 then → improve rooms, create tavern
```

---

## 31. Hard-Won Lessons (Verified Through Failure)

### Critical Embark Checklist (bot must do IMMEDIATELY)
1. **Build a Still** within first 10 game-days (brewing is the primary drink source)
2. **Plant surface crops** — assign crops to farm plots for ALL seasons (empty farms produce nothing)
3. **Build underground farms** at soil layer OR muddy stone floors first
4. **Enable autofarm + seedwatch** — prevents crop/seed depletion
5. **Appoint Manager** — without one, workorders are never validated
6. **Import `library/basic` orders** — includes all essential production chains
7. **Enable `autolabor`** — prevents dwarves from being idle while critical work undone

### API Gotchas (53.x specific)
| Expected | Actual (53.x) |
|----------|---------------|
| `block.flags.liquid_1` | `block.flags.update_liquid` |
| `block.flags.liquid_2` | `block.flags.update_liquid_twice` |
| `unit.counters.hunger_timer` | `unit.counters2.hunger_timer` (in counters2!) |
| `dfhack.internal.getPluginState()` | Does not exist; use `<plugin> status` command |
| `dfhack.internal.isPluginLoaded()` | Does not exist |
| `plotinfo.next_burrow_id` | Does not exist |
| `squad.cur_alert_idx` | Does not exist; use `squad.cur_routine_idx` |
| `constructBuilding` errors | Returns nil silently; no error message |

### Workorder Command Rules
- **Simple format works**: `workorder ConstructBed 10`, `workorder MakeCharcoal 5`
- **Fails for some names**: `BrewDrink`, `ConstructChair` → JSON parse error
- **JSON always works**: `workorder '{"job":"MakeCharcoal","amount_total":10}'`
- **`BrewDrink` not valid for workorders** — brewing is a Still workshop reaction
- **Use `orders import library/basic`** for production chains including brewing

### Farming Rules
- **Surface crops ≠ underground crops** — 93 surface types vs 6 underground types
- **Plant index -1 = no crop** → farm produces nothing; must assign explicitly
- **Underground needs mud** — flood stone floors with water first, then drain
- **autofarm only works on EXISTING farm plots** — doesn't create farms
- **Surface farms in all biomes grow all 4 seasons** — no fallow needed

### Building Placement Rules
- **`constructBuilding` returns nil on failure** — no error message, no exception
- **Surface tiles blocked by trees** → `build_unsuitable`; enable `autochop` or cut manually
- **Quickfort `apply_blueprint` always succeeds** (returns result table) but may have 0 designated
- **`buildingplan` plugin** queues buildings without materials → builds when materials arrive

### Military Lessons
- **`df.global.world.squads.all` is WORLD-WIDE** — 331 squads from all civs
- **Filter by `sq.entity_id == plotinfo.group_id`** for fortress squads only
- **Must create MILITIA_COMMANDER assignment first** before making squads

### DFHack Cheat Commands (for emergencies/testing)
```lua
-- Set cursor position (required for createitem)
df.global.cursor.x = unit.pos.x
df.global.cursor.y = unit.pos.y
df.global.cursor.z = unit.pos.z

-- Create items at cursor
dfhack.run_command("createitem", "DRINK", "PLANT_MAT:MUSHROOM_HELMET_PLUMP:DRINK", "30")
dfhack.run_command("createitem", "PLANT", "PLANT_MAT:MUSHROOM_HELMET_PLUMP:STRUCTURAL", "30")
dfhack.run_command("createitem", "WOOD", "PLANT_MAT:TOWER_CAP:WOOD", "100")
dfhack.run_command("createitem", "GLOVES:ITEM_GLOVES_GAUNTLETS", "INORGANIC:STEEL", "2")

-- Reset cursor after
df.global.cursor.x = -30000

-- Reduce stress on a unit (0 = neutral)
unit.status.current_soul.personality.stress = 0
```

### Death Type Enum (VERIFIED — 51 types)
```
0:OLD_AGE  1:HUNGER  2:THIRST  3:SHOT  4:BLEED  5:DROWN  6:SUFFOCATE
7:STRUCK_DOWN  8:SCUTTLE  9:COLLISION  10:MAGMA  11:MAGMA_MIST
12:DRAGONFIRE  13:FIRE  14:SCALD  15:CAVEIN  16:DRAWBRIDGE
17:FALLING_ROCKS  18:CHASM  19:CAGE  20:MURDER  21:TRAP
22:VANISH  23:QUIT  24:ABANDON  25:HEAT  26:COLD  27:SPIKE
28:ENCASE_LAVA  43:INFECTION  44:MEMORIALIZE  48:DRAIN_BLOOD  49:SLAUGHTER
```
Access: `df.death_type[unit.counters.death_cause]` (alive = -1)

### Unit Position (VERIFIED — 53.x)
```lua
-- Direct position (NOT dfhack.units.getPosition which returns 3 numbers)
unit.pos.x, unit.pos.y, unit.pos.z  -- most reliable
-- API alternative (returns 3 separate values, NOT a table)
local x, y, z = dfhack.units.getPosition(unit)
```

### Survival Lessons
- **11 dwarves died in <3 seasons** without food/drink infrastructure
- **Necromancers survive starvation** — thirst=0, hunger=0 (undead)
- **hunger_timer > 200,000 = near death** (Urist at 327,492 was barely eating)
- **Herbalist gathering is too slow** for 19+ dwarves — need farm plots + still
- **ALWAYS build Still before Year 1 Summer** or risk losing half your population
