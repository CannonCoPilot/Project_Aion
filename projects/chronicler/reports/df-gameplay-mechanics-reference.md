# Dwarf Fortress Gameplay Mechanics Reference
# For Autonomous Bot / Game-Playing Agent Development

**Date**: 2026-03-19  
**Scope**: Comprehensive reference for all major DF v53.x game systems, DFHack command control, and Lua API paths. Intended for building a game-playing bot over the DFHack remote interface.  
**DFHack version**: 53.11-r2 (stable at time of writing)

---

## Table of Contents

1. [Designations & Digging](#1-designations--digging)
2. [Stockpiles](#2-stockpiles)
3. [Workshops & Furnaces](#3-workshops--furnaces)
4. [Building & Construction](#4-building--construction)
5. [Zones & Rooms](#5-zones--rooms)
6. [Farming & Food Production](#6-farming--food-production)
7. [Military System](#7-military-system)
8. [Nobles & Administration](#8-nobles--administration)
9. [Trade & Economy](#9-trade--economy)
10. [Water & Fluid Mechanics](#10-water--fluid-mechanics)
11. [Key DFHack Automation Commands](#11-key-dfhack-automation-commands)
12. [Lua API Quick Reference](#12-lua-api-quick-reference)
13. [Remote Execution Model](#13-remote-execution-model)

---

## 1. Designations & Digging

### How It Works in Vanilla DF

Digging is the primary way to expand a fortress underground. Players designate areas via the Designations menu, and dwarves with the Mining labor enabled will execute those jobs. Designations do not start jobs immediately — they queue work that miners pick up at their convenience.

**Designation types:**

| Type | Key | Effect |
|------|-----|--------|
| Mine (Default) | `d` | Removes a wall tile, leaving a floor |
| Channel | `h` | Removes a floor tile, creating a ramp on the z-level below |
| Ramp | `r` | Carves an upward ramp (connects two z-levels) |
| Up stair | `u` | Carves an up staircase |
| Down stair | `j` | Carves a down staircase |
| Up/down stair | `i` | Carves both simultaneously |
| Smooth | `s` | Smooths a rock wall/floor (engravable after) |
| Engrave | `e` | Engraves a smoothed surface (requires stonecutter/engraver) |
| Fortification | `F` | Carves fortifications into a wall (ranged shooting through) |
| Remove designation | `x` | Cancels a pending designation |

**Priority**: All designations accept `-p1` through `-p7` (1=highest, 4=default, 7=lowest) to control which jobs miners tackle first.

**Z-level strategy**: Stairs (up/down pair) connect adjacent z-levels. Ramps provide a walkable slope. Channels create a 1-tile hole to the level below — if you channel a 3×3 area, the level below gets a 3×3 ramp cluster. For deep excavations, a staircase shaft (up/down stairs carved every z-level) is standard. For ventilation shafts or drainage, channels stacked vertically create drop shafts.

### DFHack Commands

**`dig`** — The main dig plugin, containing several subcommands:

```
digv [-p<n>]           — Designate the entire vein under the cursor for mining
digvx [-p<n>]          — Same as digv but also digs stairs across z-levels
digl [x] [undo] [-p<n>] — Designate entire layer stone for mining (x = cross z-levels)
diglx [-p<n>]          — Alias: digl x

digcircle [<diameter>] [hollow|filled] [set|unset|invert]
          [dig|ramp|ustair|dstair|xstair|chan] [-p<n>]
  — Designate a circular area. Default: hollow, set, dig.
  — Example: digcircle 10 filled chan   (filled 10-tile diameter channel)

digtype [dig|channel|ramp|updown|up|down|clear] [-p<n>]
        [--zup|-u] [--zdown|-zu] [--cur-zlevel|-z]
        [--hidden|-h] [--no-auto|-a]
  — Designate all veins of the same type as the cursor tile.
  — --zup: extend upward across z-levels
  — --zdown: extend downward across z-levels

digexp [diag5|diag5r|ladder|ladderr|cross|clear] [hidden|all|designated] [-p<n>]
  — Exploratory mining patterns (useful for revealing the map efficiently)
  — diag5: diagonal 5-wide pattern; ladder: ladder pattern
```

**`tiletypes`** — Direct tile manipulation (bypasses labor, instant):

```
tiletypes           — Opens interactive prompt
tiletypes-command <cmd> [; <cmd> ...]   — Non-interactive batch mode
tiletypes-here      — Apply current settings at cursor (range brush)
tiletypes-here-point — Apply at cursor (single tile)

Brush types: point, range <w> <h> [<d>], block, column
Properties: shape, material, special, variant, designated, hidden, light,
            subterranean, aquifer (0|1|2)

Key shapes: WALL, FLOOR, RAMP, STAIR_UP, STAIR_DOWN, STAIR_UPDOWN,
            FORTIFICATION, BROOK_TOP, BROOK_BED, EMPTY (OpenSpace)
Key materials: STONE, LAVA_STONE, MINERAL, FEATURE, FROZEN_LIQUID, CONSTRUCTION,
               MAGMA, SOIL, GRASS_LIGHT, GRASS_DARK, PEBBLES, SMOOTH

Example (dig a 5x5 area instantly, no labor needed):
  tiletypes-command shape FLOOR material STONE ; run
```

**`channel-safely`** — Channels downward safely with supports to prevent cave-ins:

```
channel-safely enable   — Enables the plugin
channel-safely disable  — Disables it
```

### Lua API

**Tile designation via block access:**

```lua
-- Get the block containing a tile
local block = dfhack.maps.getTileBlock(x, y, z)
-- or ensure it exists:
local block = dfhack.maps.ensureTileBlock(x, y, z)

-- Read/write dig designation for a tile within the block
-- (tiles are stored in 16x16 blocks; local coords = x%16, y%16)
local des = block.designation[x % 16][y % 16]

-- Designation fields:
des.dig           -- df.tile_dig_designation enum:
                  --   0 = No (not designated)
                  --   1 = Default (mine)
                  --   2 = UpDownStair
                  --   3 = Channel
                  --   4 = Ramp
                  --   5 = DownStair
                  --   6 = UpStair
des.smooth        -- 1 = designated for smoothing
des.engrave       -- 1 = designated for engraving
des.hidden        -- 1 = tile is hidden (unexplored)
des.flow_size     -- fluid level 0-7
des.flow_forbid   -- blocks fluid flow
des.dig_auto      -- designation from auto-designation

-- Read tile type
local tt = block.tiletype[x % 16][y % 16]
-- df.tiletype enum — hundreds of variants
-- Use df.tiletype.attrs[tt].shape, .material, .special for metadata

-- Mark a single tile for mining:
des.dig = df.tile_dig_designation.Default
block.flags.designated = true   -- IMPORTANT: must set block dirty flag

-- After modifying tiles, call:
dfhack.maps.enableBlockUpdates(block, true)
-- or for visibility changes:
block.flags.designated = true
```

**Map size queries:**

```lua
local bx, by, bz = dfhack.maps.getSize()        -- dimensions in blocks (16x16)
local tx, ty, tz = dfhack.maps.getTileSize()     -- dimensions in tiles

-- Validate a position:
if dfhack.maps.isValidTilePos(x, y, z) then ... end

-- Check visibility:
if dfhack.maps.isTileVisible(x, y, z) then ... end
```

**Practical tips for a bot:**
- Never set `enabler.fps` or `enabler.calculated_fps` to 0 (freezes game permanently).
- After bulk-designating tiles, the game queues mining jobs on the next tick. The bot must wait for job processing.
- Use `digv` / `digvx` for ore veins — it designates all connected vein tiles automatically.
- The `digexp` patterns are efficient for blind exploration: `ladder` and `diag5` maximize the percentage of map revealed per miner-tick.
- Hidden tiles (`des.hidden = true`) are not accessible to dwarves until revealed by adjacent excavation.

---

## 2. Stockpiles

### How It Works in Vanilla DF

Stockpiles are designated floor areas where dwarves haul specific categories of items. Each stockpile has detailed settings for which item types are accepted. Stockpiles can be linked: a stockpile can be set to "Give to" a workshop (feeding it materials) or "Take from" another stockpile (acting as a secondary sort point).

**Container allocation:**

| Stockpile Type | Default Container |
|---------------|-------------------|
| Food | Barrels (up to 5 items per barrel) |
| Cloth, Leather, Gems, Ammo, Weapons, Armor | Bins |
| Stone | Wheelbarrows (1 per 3 tiles by default) |
| Animals, Corpses, Refuse, Wood | No containers |

**Stockpile categories** (all 18 in v50+):

1. **Animals** — live tame/caged animals
2. **Food** — prepared food, fish, meat, vegetables, fruit, cheese, eggs, seeds, drink, honey
3. **Furniture/Siege/Trap Components** — beds, tables, chairs, mechanisms, cages, chains
4. **Corpses** — entire creature bodies (separate from Refuse)
5. **Refuse** — body parts, shells, hair, skulls, rotten food, used items
6. **Stone** — all rock types; subcategories by economic/non-economic
7. **Wood** — logs
8. **Gems** — rough/cut gems and glass
9. **Bars/Blocks** — metal bars, blocks of stone/metal/glass/clay
10. **Cloth** — woven thread and fabric (plant/animal/silk/yarn)
11. **Leather** — tanned hides
12. **Flasks/Bags** — waterskins, large bags, small bags
13. **Ammo** — bolts, arrows
14. **Coins** — minted coins
15. **Finished Goods** — crafts, instruments, toys, clothing, tools, goblets
16. **Weapons** — edged and blunt weapons
17. **Armor** — all armor and shields
18. **Sheets** — papyrus, paper, parchment, vellum

### DFHack Commands

**`stockpiles` / `gui/stockpiles`** — Import/export stockpile settings:

```
gui/stockpiles        — Open interactive GUI (requires selected stockpile in q-mode)
  Options: Save settings to file, Load settings from file, Apply presets

-- Command-line equivalents (in older DFHack; use gui/stockpiles in 53.x):
stockpiles import <filename>    — Import settings from dfhack-config/stockpiles/
stockpiles export <filename>    — Export current stockpile settings
```

**`gui/quantum`** — Create quantum stockpiles with automated minecart setup:

```
gui/quantum
  1. Click feeder stockpile(s) to select
  2. Click destination tile for quantum dump point
  — Automatically assigns a minecart (or orders one if unavailable)
  — Sets up track stop with correct dump direction
  — Configures "take from links only" on the destination pile
```

**Stockpile API via `constructBuilding`** (Lua — see Section 12):

```lua
-- Stockpiles are "abstract" buildings (no construction job needed)
local sp = dfhack.buildings.constructBuilding{
    pos = xyz2pos(x, y, z),
    type = df.building_type.Stockpile,
    abstract = true,
    width = 5, height = 5
}
-- sp is a df.building_stockpilest
-- Configure via sp.settings fields (complex — use gui/stockpiles for presets)
```

### Stockpile Links

From the stockpile menu (q on stockpile):
- **Give to workshop**: Dwarves bring items from this pile directly to the linked workshop. Limits travel distance for production chains.
- **Take from stockpile**: This pile accepts items only from the linked feeder pile (useful for sorting).

Setting links via Lua:

```lua
-- sp.links.give_to_workshop[] — array of building refs
-- sp.links.take_from_pile[]   — array of stockpile refs
-- Directly manipulate these arrays to establish links
```

### Quantum Stockpile Technique

A quantum stockpile stores unlimited items in a single tile, exploiting the minecart dump mechanic:

1. Build a 1×1 stockpile (the quantum pile) set to accept target item types, **"take from links only"**, 0 barrels/bins/wheelbarrows.
2. Place a **Track Stop** adjacent to the quantum pile, configured to dump in the pile's direction, friction = highest.
3. Build a feeder stockpile (normal size) set to the same item types.
4. Set the feeder to "give to" the Track Stop's hauling route.
5. Assign a minecart to the hauling route.

Items are hauled from feeder → minecart → dumped onto the quantum tile. The game keeps tipping the cart, producing near-infinite density. This dramatically reduces FPS cost compared to large traditional stockpiles.

**`gui/quantum`** automates steps 2–5 above.

**Practical tips for a bot:**
- Use `gui/stockpiles` presets or exported configs to configure stockpiles consistently.
- Keep stone stockpiles near the surface/quarry; wood near the carpenter; metal bars near the forge.
- Food stockpiles should be near the kitchen/still, underground (to slow spoilage).
- Use the `automelt` / `autotrade` stockpile flags (via DFHack settings) to automatically melt/trade items placed in specific stockpiles.

---

## 3. Workshops & Furnaces

### How It Works in Vanilla DF

Workshops and furnaces are 3×3 tile buildings (some vary) where dwarves perform production jobs. They consume raw materials and produce finished goods. Workshops use non-heat processes; furnaces require fuel (wood/charcoal) unless using magma variants.

### Complete Workshop List

| Workshop | df.workshop_type | Build Materials | Primary Products |
|----------|-----------------|-----------------|-----------------|
| Carpenter's Workshop | Carpenters | 3× building material | Furniture, barrels, bins, beds, doors |
| Farmer's Workshop | Farmers | 3× building material | Process plants, make bags/thread |
| Mason's Workshop | Masons | 3× building material | Stone furniture, blocks, crafts |
| Craftsdwarf's Workshop | Craftsdwarfs | 3× building material | Bone/shell/stone/wood crafts, instruments |
| Jeweler's Workshop | Jewelers | 3× building material | Cut gems, encrust items |
| Metalsmith's Forge | MetalsmithsForge | 1× anvil + 3× building material | Weapons, armor, metal tools, chains |
| Magma Forge | MagmaForge | 1× anvil + 3× magma-safe material | Same as Metalsmith's Forge (no fuel needed) |
| Bowyer's Workshop | Bowyers | 3× building material | Bows, crossbows, arrows |
| Mechanic's Workshop | Mechanics | 3× building material | Mechanisms, cages, traps |
| Siege Workshop | Siege | 3× building material (×3 quantity) | Ballistas, catapults, ammo |
| Butcher's Shop | Butchers | 3× building material | Butcher animals → meat/fat/bones |
| Leather Works | Leatherworks | 3× building material | Tan hides into leather |
| Tanner's Shop | Tanners | 3× building material | (older alias for Leather Works) |
| Clothier's Shop | Clothiers | 3× building material | Weave cloth into garments |
| Fishery | Fishery | 3× building material | Clean fish, extract fish organs |
| Still | Still | 3× building material | Brew drinks from plants |
| Loom | Loom | 3× building material | Weave thread into cloth |
| Quern | Quern | 1× quern stone | Mill plants into flour/powder |
| Millstone | Millstone | 1× millstone + mechanism | Mill plants (powered, faster than Quern) |
| Kennels | Kennels | 3× building material | Train animals, make war/hunting animals |
| Ashery | Ashery | 3× blocks + 1× barrel + 1× bucket | Make lye and potash from ash |
| Kitchen | Kitchen | 3× building material | Cook meals from ingredients |
| Dyer's Shop | Dyers | 3× blocks + 1× barrel + 1× bucket | Dye cloth with pigments |
| Soap Maker's Workshop | SoapMaker | 3× building material | Make soap from tallow + lye |
| Screw Press | Tool (custom) | 3× building material | Extract oil/juice, make paper |
| Alchemist's Laboratory | Alchemist | 3× building material | Transmute metals (mod use) |
| Animal Trap Workshop | AnimalTrap | 3× building material | Make wooden animal traps |

### Complete Furnace List

| Furnace | df.furnace_type | Material Requirement | Notes |
|---------|----------------|---------------------|-------|
| Wood Furnace | WoodFurnace | Fire-safe building material | Burns wood → charcoal + ash |
| Smelter | Smelter | Fire-safe building material | Smelt ore → metal bars (needs fuel) |
| Glass Furnace | GlassFurnace | Fire-safe building material | Make glass items (needs fuel) |
| Kiln | Kiln | Fire-safe building material | Fire clay/porcelain, make potash (needs fuel) |
| Magma Smelter | MagmaSmelter | Magma-safe building material | Smelt ore (no fuel — needs magma access) |
| Magma Glass Furnace | MagmaGlassFurnace | Magma-safe building material | Make glass (no fuel) |
| Magma Kiln | MagmaKiln | Magma-safe building material | Fire clay/porcelain (no fuel) |

**Fuel note:** Wood Furnace consumes 1 log to produce 1 charcoal (+ 1 ash). Smelter/Glass/Kiln each consume 1 charcoal per job. Magma variants require the building to be placed adjacent to or over a magma flow tile.

### Building Workshops via DFHack

**`buildingplan`** — Place workshops without materials on hand:

```
-- Enable (usually on by default in 53.x):
enable buildingplan

buildingplan set boulders true|false   -- Allow/disallow boulders as material
buildingplan set blocks true|false     -- Allow/disallow blocks
buildingplan set logs true|false       -- Allow/disallow logs
buildingplan set bars true|false       -- Allow/disallow bars
```

When you designate a building via the DF UI with buildingplan active, it creates a suspended building placeholder. buildingplan monitors inventory and unsuspends construction when materials become available.

**Lua construction:**

```lua
-- Build a Carpenter's Workshop at (x, y, z):
local bld = dfhack.buildings.constructBuilding{
    pos    = xyz2pos(x, y, z),
    type   = df.building_type.Workshop,
    subtype = df.workshop_type.Carpenters,
    width  = 3,
    height = 3
}
-- Returns the building object or nil + error string

-- Build a Smelter (furnace):
local furnace = dfhack.buildings.constructBuilding{
    pos     = xyz2pos(x, y, z),
    type    = df.building_type.Furnace,
    subtype = df.furnace_type.Smelter,
    width   = 3,
    height  = 3
}
```

### Job Queuing and Manager Orders

**`workorder`** — Create manager work orders programmatically:

```
workorder <job_type> [<amount>]
  — Simple form: workorder BrewDrink 20
  — Creates a manager order for 20 brewed drinks

workorder <json_string>
  — Full form with all options:
  workorder "{\"job\":\"MakeBarrel\",\"amount_total\":10,\"frequency\":\"Daily\"}"

workorder --file <filename>
  — Load orders from dfhack-config/workorder/<filename>.json

workorder -l [<filter>]   — List all valid job_type values (filter by substring)
```

**JSON fields for workorder:**

```json
{
  "job": "MeltMetalObject",          // df.job_type enum name (required)
  "amount_total": 5,                  // quantity (omit for MilkCreature/ShearCreature)
  "item_category": ["finished_goods"], // which item categories apply
  "item_conditions": [...],           // conditions on input items
  "frequency": "OneTime",             // OneTime|Daily|Weekly|Monthly|Seasonal|Yearly
  "id": 42,                           // only needed if referenced by order conditions
  "__reduce_amount": true             // subtract existing orders from amount
}
```

**`orders`** — Import/export full sets of manager orders:

```
orders list                     — Show all exportable order sets (including built-in library)
orders import library/basic     — Import essential early-game orders
orders import library/military  — Import high-volume military production orders
orders import library/furnace   — Import heat-treatment orders
orders import library/smelting  — Import ore smelting for all metals
orders import library/rockstock — Import rock furniture maintenance
orders import library/glassstock — Import glass furniture maintenance
orders export <name>            — Save current orders to dfhack-config/orders/<name>.json
orders clear                    — Delete all current manager orders
orders recheck                  — Force re-evaluation of all order conditions
orders sort                     — Sort so one-time orders don't get blocked by repeating orders
```

**Practical tips for a bot:**
- Always build the Smelter before the Metalsmith's Forge (forge requires metal bars).
- A Quern works without power; a Millstone needs a mechanism and axle/gear power to operate.
- Use `orders import library/basic` immediately at embark to set up baseline food/drink production.
- Link a food stockpile to the Still with "give to" so brewers always have nearby ingredients.
- The Still and Kitchen share ingredients — set Kitchen to disable seed cooking to prevent seed depletion.

---

## 4. Building & Construction

### How It Works in Vanilla DF

Constructions (walls, floors, stairs, etc.) are built from raw materials and are permanent once placed. Unlike workshops, constructions occupy entire tiles and form the structural skeleton of a fortress. Buildings (doors, traps, levers, etc.) are placed on top of constructed or natural tiles.

**Construction types** (Build → Constructions):

| Construction | Description | Material |
|-------------|-------------|----------|
| Wall | Solid barrier | Any block/boulder/wood/bar |
| Floor | Walkable surface | Any block/boulder/wood/bar |
| Up Stair | Connects to stair above | Any material |
| Down Stair | Connects to stair below | Any material |
| Up/Down Stair | Both directions | Any material |
| Ramp | Walkable slope | Any material |
| Fortification | Wall with arrow slits | Any material |
| Track | Minecart rail | Any material |
| Track/Ramp | Ramp with rail | Any material |

**Building types** (Build → Furniture & other):

| Building | Function | Material |
|---------|----------|----------|
| Door | Passable barrier, can be locked | Any material |
| Floodgate | Hydraulic door, linkable to lever | Any material |
| Hatch Cover | Floor trapdoor | Any material |
| Grate | Allows fluid/projectile pass-through | Metal bar |
| Bars (vertical) | Cage-like partition | Metal bar |
| Fortification (built) | Ranged fire position | Any block |
| Lever | Mechanical trigger | Mechanism ×2 |
| Pressure Plate | Automatic trigger | Mechanism |
| Cage Trap | Captures creatures | Mechanism + cage |
| Stone-Fall Trap | Instant kill | Mechanism + boulder |
| Weapon Trap | Damages creatures | Mechanism + weapon(s) |
| Upright Spear/Spike | Linked damage | Mechanism + spear |
| Screw Pump | Fluid mover | Corkscrew + block + pipe section |
| Gear Assembly | Power distribution | Mechanism |
| Horizontal Axle | Power transfer | Wood |
| Vertical Axle | Power transfer | Wood |
| Water Wheel | Power generation (water) | Wood |
| Windmill | Power generation (wind) | Wood |
| Minecart Track Stop | Quantum dump point | Mechanism |

### DFHack Commands

**`buildingplan`** (primary):

```
enable buildingplan              — Activates (usually default-on in 53.x)

-- Material filters (set before placing via UI):
buildingplan set boulders true
buildingplan set blocks true
buildingplan set logs false      -- Disallow wood for stone builds

-- With buildingplan active, place any building via normal UI:
-- If materials unavailable, building queued until materials arrive
-- Quality filters can be set in the buildingplan UI panel
```

**`quickfort`** — Blueprint-based mass construction:

```
quickfort list [-l] [<filter>]       — List available blueprints
quickfort run <blueprint> [<opts>]   — Apply blueprint at cursor
quickfort preview <blueprint>        — Show overlay without applying
quickfort orders <blueprint>         — Queue manager orders for all materials
quickfort undo <blueprint>           — Remove everything placed by blueprint

-- Blueprint modes within a .csv/.xlsx file:
#dig   — Mining/channeling designations
#build — Workshop and building placement
#place — Stockpile placement
#zone  — Zone designation
#burrow — Burrow creation/modification

-- Example dig blueprint cell content:
-- d = mine, h = channel, u = up stair, j = down stair, i = up/down stair
-- r = ramp, s = smooth, e = engrave
```

**`gui/blueprint`** — Record existing fortress layout to blueprint file:

```
gui/blueprint <width> <height> [<depth>] [<name>]
  — Records the area under cursor as a blueprint for reuse
```

**Lua building placement:**

```lua
-- Place a door at (x, y, z):
dfhack.buildings.constructBuilding{
    pos  = xyz2pos(x, y, z),
    type = df.building_type.Door
}

-- Place a lever at (x, y, z):
dfhack.buildings.constructBuilding{
    pos  = xyz2pos(x, y, z),
    type = df.building_type.Trap,
    subtype = df.trap_type.Lever
}

-- Place a cage trap:
dfhack.buildings.constructBuilding{
    pos  = xyz2pos(x, y, z),
    type = df.building_type.Trap,
    subtype = df.trap_type.CageTrap
}

-- Find a building at a position:
local bld = dfhack.buildings.findAtTile(x, y, z)

-- Get all buildings in a region:
local blds = dfhack.buildings.getBuildings(x1, y1, z1, x2, y2, z2)

-- Deconstruct a building:
dfhack.buildings.deconstruct(bld)
```

**Practical tips for a bot:**
- Construct walls/floors before placing furniture on them — furniture on unconstructed floors can be removed by cave-ins.
- Link levers to floodgates/bridges using the DF UI's `q → a (add link)` or via Lua `building.linked_levers` array.
- Pressure plates require configuration (who/what triggers them: citizens, enemies, animals, water, etc.).
- Use `channel-safely` before channeling areas above occupied spaces to prevent dwarf accidents.

---

## 5. Zones & Rooms

### How It Works in Vanilla DF

Activity zones define how areas are used. A zone is painted over tiles and assigns behavioral functions to those spaces. Rooms are zones associated with a specific building (e.g., a bed creates a bedroom potential; you assign it via the building's room designation).

### Complete Zone Type Reference

| Zone Type | Quickfort Key | Purpose | Required Furniture |
|-----------|--------------|---------|-------------------|
| Meeting Area | `m` | Idle gathering; basis for tavern/temple/library/hospital | None |
| Bedroom | `b` | Private sleeping; boosts happiness | Bed (1 per room) |
| Dining Hall | `h` | Communal eating; mood bonuses scale with food quality | Table(s) |
| Dormitory | `D` | Communal sleeping (negative mood penalty) | Multiple beds |
| Tomb | `T` | Burial/memorial; prevents ghosts | Coffin |
| Office | `o` | Noble/manager workspace; required by several positions | Chair (+ optional table) |
| Pen/Pasture | `n` | Contains assigned tame animals | None |
| Pit | `p` | Disposal; creatures thrown in from above | None |
| Pond | `p` (+ pond flag) | Dwarves fill with buckets from water source | None |
| Fishing | `f` | Dwarves preferentially fish here | Adjacent water |
| Gather/Pick Fruit | `g` | Automates herbalism/tree harvesting | Trees/shrubs |
| Barracks | `B` | Military sleep/train/equipment storage | None (use beds/weapon racks inside) |
| Archery Range | `a` | Marksdwarf practice | Archery targets |
| Animal Training | `t` | Taming/training wild animals | Training zone or restraint |
| Water Source | `w` | Designated drinking/filling point | Adjacent water |
| Garbage Dump | `d` | Items marked for dump are hauled here | None |
| Dungeon | `j` | Prisoner confinement (justice system) | Chains or cages |

### Location Types (Zone Upgrades)

A Meeting Area can be upgraded to a **Location** via the zone menu:

| Location | Requirement | Effect |
|----------|-------------|--------|
| Tavern | Table(s), chair(s) | Attracts performers, merchants, visitors; generates reputation |
| Temple | Optionally dedicated to a deity | Religious services; dwarves fulfill spiritual needs |
| Library | Bookcase(s) | Knowledge accumulation; scholars/scribes produce books |
| Guildhall | Dedicated to a craft guild | Guild membership; dwarves gain perks |
| Hospital | Chest(s), bucket(s), traction bench | Wounded dwarves treated here; needs medical supplies |

### Room Quality

Room quality affects noble happiness and is computed from:
- **Base material value** multiplied by placement multipliers (floors ×7, walls ×9)
- **Furniture value** (quality × base value)
- **Surface treatments**: Smooth walls +10×material value per tile; engravings ×quality multiplier

Quality tiers: Meager → Modest → Adequate → Decent → Comfortable → Fine → Superior → Exceptional → Magnificent → Legendary

### DFHack Zone Management

```
-- List zones:
:lua for _,z in ipairs(df.global.world.buildings.other.CIVZONE_ANY) do
    print(z.id, z.type, z.x1, z.y1, z.z, z.x2, z.y2) end

-- Get selected zone in UI:
local zone = dfhack.gui.getSelectedCivZone()

-- Zone type enum:
-- df.civzone_type: MeetingHall, Bedroom, DiningHall, Pen, Farm,
--                  Stockpile, Archery, Training, Barracks, Pond,
--                  Dump, Slaughterpen, AnimalTraining, Tomb, ...

-- Create a zone programmatically (abstract building):
local zone = dfhack.buildings.constructBuilding{
    pos     = xyz2pos(x1, y1, z),
    type    = df.building_type.Civzone,
    subtype = df.civzone_type.MeetingHall,
    abstract = true,
    width   = w,
    height  = h
}
```

**Practical tips for a bot:**
- Place a meeting area immediately at embark — it prevents dwarves from wandering randomly and boosts morale.
- A dining hall requires a table; a single table in a large room creates a fortress-wide hall.
- Nobles require offices, dining rooms, and bedrooms of increasing quality as their rank rises.
- Garbage dumps near a smelter allow quick melt designation (mark for dump → mark dump pile for auto-melt).

---

## 6. Farming & Food Production

### How It Works in Vanilla DF

Farming requires farm plots (built like constructions) on **muddy/soil tiles**. Underground, you need either soil layers or stone tiles that have been muddied by flooding. Surface farming works on soil without irrigation.

**Farm plot creation:** Build → Workshops → Farming → Farm Plot. Drag to select area. Farm plots can be any size but small (3×3 to 5×5) is typical for manageability.

**Seasonal crop scheduling:** Each farm plot can grow one crop per season. Unscheduled seasons leave the plot fallow. You can schedule all four seasons in advance via the farm plot menu.

### Seasonal Crops Reference

**Underground crops** (grown on muddy/soil underground tiles):

| Crop | Seasons | Raw Product | Processed Use |
|------|---------|------------|---------------|
| Plump Helmet | All 4 | Plump helmet spawn | Eat raw, brew (Dwarven Wine), cook |
| Cave Wheat | Spring/Summer | Cave wheat | Mill → flour; brew (Dwarven Beer) |
| Pig Tail | Spring/Summer | Pig tail | Brew (Pig tail beer); spin → thread |
| Rock Nut | Spring/Summer | Rock nut | Mill → roasted rock nut paste (oil-like) |
| Sweet Pod | Spring/Summer | Sweet pod | Brew (Sweet Pod Wine); cook |
| Dimple Cup | Spring/Summer | Dimple cup | Dye cloth (blue) |
| Bloated Tuber | Summer/Autumn | Bloated tuber | Brew (Bloated Tuber Wine); eat |
| Quarry Bush | Summer | Quarry bush leaves | Process at Farmer's Workshop → seeds |
| Sliver Barb | Summer/Autumn | Sliver barb | Brew |
| Sun Berry | Autumn | Sun berries | Brew (Sunshine); eat |
| Longland Grass | All 4 | Longland grass | Mill → flour |
| Rope Reed | Spring/Summer | Rope reed | Spin → thread |
| Muck Root | Spring/Autumn | Muck root | Eat; brew |
| Rat Weed | Spring/Autumn | Rat weed berries | Brew |
| Hide Root | Autumn/Winter | Hide root | Eat; brew |
| Nether-cap | All 4 | Nether-cap wood | (no seeds; fungi; not directly farmable) |

**Surface crops** (require soil, biome-appropriate):

| Crop | Seasons | Notable Use |
|------|---------|------------|
| Strawberry | Spring/Summer | Eat raw; brew (Strawberry Wine) |
| Wild strawberry | Spring | Eat raw |
| Prickle berry | Summer | Brew; eat |
| Fisher berry | Summer | Brew; eat |
| Whip vine | Summer | Brew; eat |
| Red spinach | Spring/Autumn | Eat raw; cook |
| Ground petal | Summer | Brew |
| Blade weed | Spring/Summer | Brew |
| Elephant head plump helmet | (underground variant) | Brew; eat |
| Sweet pod | Spring | Brew |

### Food Production Chain

```
Raw plant → [Still] → Drink (alcohol)          Seeds returned
Raw plant → [Kitchen] → Prepared meal          Seeds DESTROYED
Raw plant → [Farmer's Workshop] → Process      Seeds returned + byproduct (thread, etc.)
Raw plant → [Quern/Millstone] → Flour/Powder   Seeds returned + flour
Flour → [Kitchen] → Prepared meal (needs more ingredients for higher-quality)

Animal → [Butcher's Shop] → Meat + Fat + Bone + Skulls + Skin
Fat → [Kitchen] → Tallow (rendered)
Tallow + Lye → [Soap Maker's Workshop] → Soap
Ash → [Wood Furnace] → Ash
Ash → [Ashery] → Potash / Lye (with water barrel + bucket)
Lye → [Ashery] → Pearlash
Pearlash → [Glass Furnace/Kiln] → used for clear glass

Milk (from pasture animals) → [Kitchen] → Cheese
Honey → [Still] → Mead / Dwarven Honey Wine
Fish (raw) → [Fishery] → Cleaned fish + fish organs
Thread → [Loom] → Cloth
Cloth/Leather → [Clothier's Shop] → Garments
```

**Seed preservation rules:**
- Cooking destroys seeds. **Disable seed cooking in the Kitchen menu** (k → Kitchen → toggle each seed type Off).
- Brewing and processing return seeds.
- Eating raw plants returns seeds if the fortress seed count is below the cap (default 200/type; 3000 total).
- Keep a dedicated food stockpile for seeds with enough small bags (100 seeds per bag).

### DFHack Automation

**`autofarm`** — Automatically manage farm plot crops based on stock levels:

```
enable autofarm             — Activate
autofarm status             — Show current configuration
autofarm runonce            — Single update pass (no persistent enable)
autofarm default <N>        — Set default threshold for all crops (N = target stock)
autofarm threshold <N> <CROP_ID> [<CROP_ID>...]
  — Set per-crop threshold; plant that crop until N units in stock
  — Example: autofarm threshold 200 MUSHROOM_HELMET_PLUMP
  — Example: autofarm threshold 50 GRASS_TAIL_PIG

-- Find valid crop IDs for your world:
:lua for _,p in ipairs(df.global.world.raws.plants.all) do
    if p.flags.SEED then print(p.id) end end
```

**`seedwatch`** — Prevent cooking of rare seeds:

```
enable seedwatch       — Monitor seeds and disable cooking when stocks are low
seedwatch threshold <N> — Set minimum seed count before protecting (default: 30)
seedwatch status
```

**`gui/autofarm`** — Interactive configuration GUI for autofarm.

**Practical tips for a bot:**
- Prioritize Plump Helmets — they grow all four seasons, can be eaten raw (no processing needed), and brew into Dwarven Wine.
- Maintain a 1:1 ratio of Still to Farm Plot for small fortresses.
- Build a Quern early for grain milling; upgrade to Millstone when power is available.
- Pig tail provides both food (brewing) and textile (spinning thread → loom → cloth → clothier → clothing). Plant generously.

---

## 7. Military System

### How It Works in Vanilla DF

The military operates through a hierarchy: Militia Commander → Militia Captains → Squads. Squads are assigned equipment uniforms, given schedules (monthly training/patrol/station orders), and activated via the Alert system.

### Squad Creation Process

1. Appoint a **Militia Commander** (Nobles screen).
2. Open the Military screen (`m`).
3. Create a new squad — the commander auto-fills position 1.
4. Assign dwarves to remaining positions (max 10 per squad).
5. Assign a **barracks** for sleep/training/equipment storage.
6. Configure a **uniform** with desired equipment.
7. Set a **training schedule** (monthly breakdown for the year).
8. Activate via **Alert** when needed.

### Equipment & Uniforms

Uniforms specify what items soldiers should equip:
- Items can be specified by type only, or by type + specific material.
- Quality minimums can be set (e.g., Masterwork steel only).
- Toggle "Replace clothing" to force armor to replace civilian clothes.

**Important bug (v53.x):** Mining, woodcutting, and hunting labors carry invisible equipment that conflicts with military gear. Always disable those labors before adding to a squad.

Uniform slot types: Helm, Upper Body, Lower Body, Feet, Hands, Shield, Weapon (melee + ranged), Ammo, Quiver.

### Training Schedules

Each squad gets a 12-month schedule. Each month can have multiple simultaneous orders:

| Order Type | Function |
|-----------|----------|
| Train (Barracks) | Spar, class demonstrations, individual practice |
| Station | Guard a specific tile |
| Patrol Route | Walk a designated path repeatedly |
| Defend Burrow | Guard all tiles of a burrow |

**Training mechanics:**
- Dwarves in the same barracks with training orders spar together (fastest skill gain).
- Squad leaders give demonstrations to raise trainee weapon skills.
- Individual practice (if no sparring partner available) raises skills slowly.
- Known bug: Squad leaders wait indefinitely for students if criteria not met — set "train at least 1" rather than requiring a full squad.

### Alert System

Alerts define activation states for squads:

| Alert Level | Default State | Effect |
|------------|--------------|--------|
| Inactive | Off duty | Follow schedule; no active orders |
| Active | Activated | Execute any queued orders (station/patrol/attack) |
| High Alert | Custom | Configurable |

Activate alerts via the Military screen → Alerts tab. A bot can trigger alerts via:

```lua
-- Get military alert list:
df.global.world.squads.all   -- All squad objects
-- Each squad: squad.active_alert_idx (0 = inactive, 1+ = alert level index)

-- Activate a squad (set to first alert level):
squad.active_alert_idx = 1
```

### Burrows

Burrows restrict where civilians go during alerts. Common uses:
- **Panic room**: Designate a secure underground area; all civilians retreat here during siege.
- **Work areas**: Restrict laborers to specific z-levels for efficiency.

```
-- DFHack burrow command:
burrow create <name>          — Create a new burrow
burrow add <burrow> <area>    — Add tiles to a burrow
burrow remove <burrow> <area> — Remove tiles
burrow assign <unit> <burrow> — Assign dwarf to burrow
burrow clear <burrow>         — Remove all tiles
burrow delete <burrow>        — Delete burrow entirely

-- Via Lua:
df.global.world.burrows.all   -- Array of all burrows
-- Each burrow: burrow.name, burrow.units[], burrow.tile_bitmask (per-block)
```

### DFHack Military API

```lua
-- Create a squad from an entity position assignment:
local squad = dfhack.military.makeSquad(assignment_id)
squad.name.nickname = "Iron Guard"   -- Set squad name

-- Add a unit to squad position:
dfhack.military.addToSquad(unit_id, squad_id, squad_pos)
-- squad_pos: 0-9 (0 = commander slot)

-- Remove a unit from their squad:
dfhack.military.removeFromSquad(unit_id)

-- Get squad name:
local name = dfhack.military.getSquadName(squad_id)

-- Set barracks assignment flags:
dfhack.military.updateRoomAssignments(squad_id, assignment_id, {
    sleep    = true,
    train    = true,
    indiv_eq = true,
    squad_eq = true
})

-- Access squads globally:
for _,sq in ipairs(df.global.world.squads.all) do
    print(sq.id, dfhack.military.getSquadName(sq.id), #sq.positions)
end

-- Access squad positions (which units are in the squad):
for pos_idx, pos in ipairs(squad.positions) do
    if pos.occupant >= 0 then
        local unit = df.unit.find(pos.occupant)
        print(pos_idx, dfhack.units.getReadableName(unit))
    end
end
```

**`autotraining`** — Automatically put units in squads to fulfill "Martial Training" need:

```
enable autotraining
gui/autotraining    — Interactive configuration
```

**Practical tips for a bot:**
- Train at least 10–15 dwarves before the 3rd year when sieges may begin.
- Equip squads with iron or steel weapons minimum; copper/bronze is adequate for early defense.
- Always assign a barracks (weapon rack + armor stand + sleeping area) to each squad.
- Rotate 2 squads: one on training, one on active patrol duty — prevents training gap during attacks.
- Use `force Megabeast` or `force Migrants` (DFHack) to test military response before actual sieges.

---

## 8. Nobles & Administration

### How It Works in Vanilla DF

Nobles are administrative positions that unlock fortress capabilities, impose demands, and manage diplomatic relations. Some are elected (Mayor), others appointed (Manager, Bookkeeper, Broker, etc.).

### Noble Position Reference

| Position | Trigger | Room Requirements | Function |
|---------|---------|------------------|---------|
| Expedition Leader | Embark start | None initially | Interacts with liaisons; happiness bonus to stressed dwarves |
| Mayor | 50+ population (replaces Expedition Leader) | Decent bedroom + dining + office | Mandates, handles diplomacy |
| Manager | Appointed when needed | Meager office (if 20+ dwarves) | Validates and executes work orders |
| Bookkeeper | Appointed | Meager office | Updates stock/wealth accuracy (set to level 3-5) |
| Broker | Appointed | None | Conducts trading; Appraisal skill = trade accuracy |
| Captain of the Guard | 50+ population | Meager bedroom/office | Enforces justice system; issues punishments |
| Sheriff | Early alternative to Captain | None | Basic justice enforcement |
| Chief Medical Dwarf | Appointed | None required | Manages hospital stock orders |
| Dungeon Master | Rarely triggered | None | Handles exotic animals |
| Baron/Baroness | 20 pop + 100k wealth + 10k exports | Decent+ quarters/dining/office/tomb | Enables wagon trade; higher-tier mandates |
| Count/Countess | 200k/20k thresholds | Great+ quarters | Larger wagon capacity |
| Duke/Duchess | 300k/30k thresholds | Grand+ quarters | Maximum trade capacity |
| King/Queen | Capital designation | Royal quarters | Highest-tier diplomacy |

### Mandates and Demands

**Mandates** are legally binding production orders. If not met within a season, the justice system (if active) punishes dwarves for "oath breaking." Example: Mayor mandates 3 copper crafts → must produce ≥3 copper crafts within the season.

**Demands** are personal requests for luxury items (specific furniture, jewelry, etc.). Failure causes unhappiness but not legal penalties.

**Impossible mandates** (e.g., "produce cardinal leather") can occur with random nobles. The only resolution is the noble's death (natural or otherwise) or DFHack intervention.

### Justice System

If a Captain of the Guard is appointed:
- Broken mandates, property theft, and assault are tracked.
- Criminals are brought to a dungeon zone and punished (beating or imprisonment).
- Requires chains/cages in a designated Dungeon zone.
- The Captain needs a barracks to sleep and an office to work.

### Liaison and Diplomatic Mechanics

The **outpost liaison** arrives with the dwarven caravan each autumn:
- Meet via the Mayor/Expedition Leader's office (automatic if leader is alive and mobile).
- Negotiate **export agreements** (what you'll sell) and **import requests** (what the caravan brings next year).
- Liaison disappears from view after meeting; agreements persist in Civilizations screen.
- If the leader is dead/incapacitated, the liaison leaves unhappy.

**Elven diplomat**: Arrives in spring with elven caravan. Complains about tree-cutting. Chopping too many trees → diplomatic incident → eventually elves declare war.

**Goblin/human diplomats**: Arrive in summer to negotiate tribute or ally against common enemies.

### DFHack Noble Management

```lua
-- Access all noble positions:
local fort_ent = df.global.world.entities.all[df.global.ui.civ_id]
-- or df.global.ui.main.fortress_entity

-- Noble assignments:
for _,pos in ipairs(fort_ent.positions.assignments) do
    if pos.occupant >= 0 then
        local hf = df.historical_figure.find(pos.occupant)
        print(pos.id, hf.name.first_name)
    end
end

-- Check if position exists:
-- df.global.ui.nobles (list of entity_position_assignment IDs for player civ)
```

**Relevant DFHack commands:**

```
-- Remove impossible mandates (use with care):
:lua local ent = df.global.world.entities.all[df.global.ui.civ_id]
     for _,m in ipairs(ent.activity.mandates) do print(m.id, m.mode, m.amount_required) end

-- Appoint a noble manually via the DF UI (n → select position → select dwarf)
-- No DFHack command directly assigns noble positions in 53.x (use gui/assign-rack or similar)
```

**Practical tips for a bot:**
- Appoint a Bookkeeper and set accuracy to level 5 as early as possible — accurate stock counts are essential for bot decision-making.
- Appoint a Manager before reaching 20 dwarves; manager orders are the only scalable production system.
- Keep the Expedition Leader/Mayor healthy and housed with appropriate rooms to maintain diplomatic relations.
- Monitor noble demands regularly (`n` screen) and produce requested items proactively to avoid mandate penalties.

---

## 9. Trade & Economy

### How It Works in Vanilla DF

Trade occurs at the **Trade Depot** when caravans arrive. The Depot must be accessible via a wagon-width (3-tile) path to the map edge for dwarven/human caravans; elven caravans only need a 1-tile path.

### Trade Depot

**Construction requirements:** 3× building material (any); requires Architecture labor (Architect dwarf). The depot is a 5×5 tile footprint.

**Wagon accessibility:** The path from map edge to depot must be at minimum 3 tiles wide, unobstructed by: stairways, traps, minecart tracks, boulders, other buildings. Plan an entrance road accordingly.

### Caravan Timing

| Civilization | Season | Arrives | Notes |
|-------------|--------|---------|-------|
| Dwarven | Autumn | Year 1 onwards | Always arrives unless civ is extinct; brings wagons |
| Human | Summer | Year 1/2 onwards | Brings wagons; good for food/animals |
| Elven | Spring | Year 1/2 onwards | Pack animals only; dislikes tree products |
| Kobold | Any | Rarely; steal items | Not a real caravan |

Caravans depart after a set number of in-game days. If your broker is unavailable or depot inaccessible, the caravan leaves without trading.

### Trading Process

1. Caravan arrives → hauls goods to depot (may take several days).
2. Go to depot, select **Request Trader** (`q` on depot → r).
3. Optionally enable **"Only broker may trade"** for best Appraisal skill.
4. Select items from the caravan side to buy, items from your side to sell.
5. The **Trader Profit** value must be green (positive) for the merchant to accept.
6. Confirm trade.

**Item colors in trading screen:**
- Brown: Made/modified by your fortress — can trade or gift.
- Light gray: Obtained from outside (imports, spoils) — can trade, not gift.
- Purple: Under export mandate — trading triggers justice penalties.
- Red: Seized items — must transform before trading.

### Broker Skill Effects

| Appraisal Skill | Effect |
|----------------|--------|
| Unskilled | ~25% accuracy; bad trades common |
| Competent (3) | ~50% accuracy |
| Professional (7) | ~75% accuracy |
| Legendary (15) | Near-perfect; can trade for 1-unit profit |

The broker gains XP in: Comedian, Judge of Intent, Negotiator, Persuader, Liar, Flatterer, Intimidator — with Judge of Intent receiving the highest share per trade session.

### Export Agreements

After meeting with the liaison, you negotiate:
- **Export agreements**: Items your fortress will provide in volume → caravan brings more trade goods.
- **Import requests**: Items the mountainhomes will send in exchange for premium prices.
- Agreements persist even if the liaison dies en route home.

### DFHack Trade Tools

```
-- Force a caravan to arrive immediately:
force Caravan [<civ_type>]
  -- Civ types: MOUNTAIN (dwarven), PLAINS (human), FOREST (elven), EVIL (dark)

-- Mark items for trade via Lua:
dfhack.items.markForTrade(item, depot_building)
-- Returns true if successfully marked

-- Check item trade eligibility:
if dfhack.items.canTrade(item) then ... end

-- Calculate item value (with trade modifier):
local val = dfhack.items.getValue(item, caravan_state)
-- caravan_state is optional; nil uses fortress context

-- DFHack WARNING: In the search plugin, 's' means SEIZE (not search).
-- Use 'q' to search merchant goods and 'w' to search fortress items.
-- Accidentally seizing goods damages diplomatic relations.
```

**Practical tips for a bot:**
- Prepare trade goods before autumn: crafts (rock, bone, shell), furniture, drinks, prepared food.
- Keep a large buffer of cheap crafts (stone mugs, rock crafts) to pad trade value.
- Export cloth, leather goods, and metal items for high returns.
- Never export weapons/armor made with valuable metals unless intentional.
- Request raw materials (metal ores, wood, sand) from the caravan if your biome lacks them.

---

## 10. Water & Fluid Mechanics

### How It Works in Vanilla DF

Fluid (water and magma) flows in a cellular automaton with levels 1–7 per tile. A full tile contains 7 units. Fluid flows to adjacent lower tiles based on level differences. **Pressure** is a separate mechanic — it allows water to flow uphill when forced (by pumps, rivers, or falling water).

### Fluid Levels

- **7/7**: Full tile — blocks movement of most creatures.
- **4/7+**: Causes dwarves to slow and eventually drown.
- **1/7**: Shallow puddle — passable; will eventually evaporate.
- **0/7**: Dry.

Water can freeze (in cold biomes), melt, boil (near magma at > 10,000 °U), and evaporate from 1/7 puddles over time.

### Pressure Rules

Pressure is not a stored property of water — it is a movement rule:
1. Water falls downward into existing water → creates pressure.
2. River/brook source tiles continuously generate water.
3. Screw pumps force water to output tile → creates pressure.

Pressurized water searches for the nearest exit: sideways first, then down, then up. It can travel uphill only when actively pressurized. **Diagonal gaps break pressure** — water does not flow diagonally; a diagonal connection de-pressurizes flow.

**Key insight:** Water reaches the same height as the tile pressure is exerted upon — no higher. A pump outputs at pump level; water rises to that height, no more.

### Screw Pump

**Construction requirements:** 1× enormous corkscrew + 1× block + 1× pipe section.  
**Power requirement:** 10 power units.  
**Footprint:** 2×1 tiles across two z-levels (intake below, output at pump level).

**Directions:** Set during construction (u/m/k/h keys) — output faces chosen direction.

**Power transmission:** Adjacent pumps share power automatically — no axle needed. A pump stack only needs power input at the top; each pump passes power to the one below.

**Materials for magma:** All three components must be magma-safe (iron, steel, obsidian, etc.). Wood and non-fire-safe stone will burn/melt instantly.

**50-tick coast:** A pump supplied power for exactly 1 tick will continue pumping for 50 ticks after power stops.

**On/off switch:** Place a hatch cover above the intake tile and link it to a lever → opening the hatch stops the pump; closing resumes.

### Pump Stacks (Lifting Fluids)

A pump stack raises fluid one z-level per pump. To build:
1. Build pump at bottom level (output facing desired direction or up).
2. Build pump above with output aligned to drain into next pump's intake.
3. Each pump passes power to the next; only one power source needed at top.

Each pump moves approximately 1/7 unit per tick when powered. For high-volume transfer, use multiple adjacent pumps in parallel.

### Common Fluid Applications

**Cistern (water reservoir):**
1. Dig a large underground room.
2. Route river water via pump + channel into the cistern.
3. Cover with grates/bars to prevent drowning.
4. Designate a Well zone adjacent to the cistern for drinking.

**Drowning trap:**
1. Channel a corridor to a holding pool.
2. Connect a river intake via pump + floodgate (lever-controlled).
3. Open floodgate → floods corridor → drowns invaders.
4. Drain via channels to lower level or controlled drain.

**Magma moat:**
1. Same as drowning trap, but use magma-safe materials.
2. Requires pump stack from magma sea (very deep) or a magma pipe/surface vent.

**Aquifer breach:**
1. Aquifers generate water indefinitely — breaching allows a water source but requires controlling flow.
2. Typical method: freeze layer (cold climate), breach, build walls quickly, then drain.
3. Or: Use obsidian casting (combine magma + water at the aquifer level) to seal tiles.

### DFHack Fluid Tools

```
-- Direct fluid placement (bypasses normal flow logic):
-- Interactive:
liquids               — Opens interactive fluid placement mode
-- Non-interactive:
liquids-here          — Apply current liquids settings at cursor

-- Tile-level fluid manipulation via Lua:
local block = dfhack.maps.getTileBlock(x, y, z)
local des = block.designation[x%16][y%16]
des.flow_size = 7           -- Set fluid level (0-7)
des.liquid_type = false     -- false = water, true = magma
des.flow_forbid = false     -- allow flow
block.flags.liquid_1 = true -- mark block as having liquid (triggers update)
block.flags.liquid_2 = true

-- Drain all fluids in an area (useful for cleanup):
:lua for x=x1,x2 do for y=y1,y2 do
    local b = dfhack.maps.getTileBlock(x,y,z)
    if b then b.designation[x%16][y%16].flow_size = 0 end
end end
```

**`channel-safely`** — Prevents cave-ins when channeling above occupied areas:

```
enable channel-safely
-- Also prevents dwarves from channeling out the floor beneath themselves
```

**Practical tips for a bot:**
- Plan water infrastructure before it's needed — building under pressure is chaotic.
- Always include an emergency drain in cisterns and drowning traps.
- Magma forges/furnaces need a magma source 1 tile below the building location — plan forge placement near a natural magma feature or build a pump stack.
- Use floodgates (lever-linked) rather than doors to control fluid — doors allow fluid seepage.

---

## 11. Key DFHack Automation Commands

### `autolabor` — Automatic Labor Assignment

Automatically manages which dwarves have which labors enabled, based on available jobs.

```
enable autolabor              — Activate
autolabor status              — Show current settings
autolabor list                — List all labor IDs and current settings

autolabor <LABOR_ID> <min> [<max>] [<talent_pool>]
  — min: minimum dwarves always assigned to this labor
  — max: maximum; default 200
  — talent_pool: only top-N most skilled dwarves considered

autolabor <LABOR_ID> haulers  — Assign to hauler pool (plus normal hauling tasks)
autolabor <LABOR_ID> disable  — Stop managing this labor
autolabor <LABOR_ID> reset    — Return this labor to defaults
autolabor reset-all           — Return all labors to defaults

-- Examples:
autolabor MINE 5              — Always keep at least 5 miners
autolabor CUT_GEM 1 1         — Exactly 1 gem cutter
autolabor COOK 1 1 3          — 1 cook, only from top-3 most skilled
autolabor FEED_WATER_CIVILIANS haulers  — Assign nurse duty to haulers
autolabor CUTWOOD disable     — Don't auto-manage woodcutting
```

**Important**: autolabor conflicts with the Work Details (labors tab) system. Enabling autolabor disables work details.

**Key labor IDs** (partial list — run `autolabor list` for all):
MINE, CUTWOOD, HUNT, ARCHITECT, COOK, FORGE_WEAPON, FORGE_ARMOR, FORGE_FURNITURE, METAL_CRAFT, CUT_GEM, SET_GEM, CLOTHESMAKER, WEAVE, BREW, PLANT, HERBALIST, FISH, CLEAN_FISH, DISSECT_FISH, LEATHER, TAN_HIDE, CARPENTER, MASON, STONE_CRAFT, WOOD_CRAFT, BONE_CARVE, SMELT, HAUL_STONE, HAUL_WOOD, HAUL_FOOD, HAUL_ITEM, HAUL_ANIMALS, CLEAN, BUILD_CONSTRUCTION, REMOVE_CONSTRUCTION, BUTCHER, TANNER, DYER, SOAP_MAKER, SPIN, MILL, BUILD_ITEM, FEED_WATER_CIVILIANS, RECOVER_WOUNDED, DIAGNOSE_PATIENT, SURGERY, SUTURE, SET_BONE, DRESS_WOUNDS

### `autobutcher` — Livestock Management

Automatically designates excess animals for butchering to maintain target population counts.

```
enable autobutcher              — Activate
autobutcher status              — Show current targets
autobutcher list_export         — Export settings (for backup/restore)

autobutcher target <fk> <mk> <fa> <ma> all|new|<RACE> [<RACE>...]
  — fk = female kids target count
  — mk = male kids target count
  — fa = female adults target count
  — ma = male adults target count
  — all: apply to all current watchlist races + set default for new ones
  — new: only set default for future watch commands
  — Otherwise: list specific races to target

autobutcher watch <RACE>        — Add race to watchlist
autobutcher unwatch <RACE>      — Remove from watchlist
autobutcher forget <RACE>       — Remove entirely

-- Example (standard pig herd):
autobutcher target 4 2 8 2 PIG
-- Keep: 4 female kids, 2 male kids, 8 female adults, 2 male adults

-- Default targets: fk=4, mk=2, fa=4, ma=2
-- Juveniles closer to adulthood are butchered last
```

### `autochop` — Automated Tree Designation

Automatically designates trees for chopping when log count falls below threshold.

```
enable autochop                 — Activate
autochop status                 — Show current settings
gui/autochop                    — Interactive configuration panel

autochop choplimit <N>          — Target log count (default: 100)
autochop burrow <name>          — Restrict tree chopping to this burrow
autochop allow_burrow <name>    — Allow chopping in additional burrow
autochop clear_burrows          — Remove all burrow restrictions
```

### `autoclothing` — Clothing Production Management

Maintains clothing stock by auto-generating manager orders.

```
enable autoclothing             — Activate
autoclothing                    — Show all configured clothing targets

autoclothing <material> <item>                  — Show target for this item
autoclothing <material> <item> <qty_per_dwarf>  — Set per-citizen target

autoclothing clear <material> <item>            — Remove a target

-- Materials: cloth, silk, yarn, leather
-- Items: any producible garment (dress, "short skirt", mitten, hood, etc.)

-- Example setup:
autoclothing cloth dress 1              -- 1 dress per citizen
autoclothing cloth "short skirt" 1
autoclothing cloth sock 2               -- 2 socks per citizen (pair)
autoclothing leather "low boot" 2       -- 2 boots per citizen

-- Alternative: tailor plugin (simpler, less configurable)
enable tailor
```

### `autofarm` — Farm Crop Management

(Covered in Section 6 — see reference there.)

### `buildingplan` — Build Without Materials

(Covered in Section 4 — see reference there.)

### `workflow` — Maintain Stock Levels via Repeat Jobs

Monitors inventory of items produced by repeat workshop jobs and suspends/resumes jobs to maintain target stock levels.

```
enable workflow                 — Activate

workflow count <spec> <target> [<gap>]
  — Each stack counts as 1 unit; maintain target ± gap
  — Default gap = target/10 if unspecified

workflow amount <spec> <target> [<gap>]
  — Individual items counted (not stacks)

workflow unlimit <spec>         — Remove a constraint
workflow unlimit-all            — Remove all constraints
workflow jobs                   — Show all managed job positions
workflow list                   — Show all active constraints

-- Constraint spec format:
-- ITEM_TYPE[:SUBTYPE]/[GENERIC_MATERIAL]/[SPECIFIC_MATERIAL]/[FLAGS]

-- Examples:
workflow amount AMMO:ITEM_AMMO_BOLTS 900 100   -- Keep 800-1000 bolts
workflow count FOOD 90 20                       -- Keep 70-110 prepared food stacks
workflow amount DRINK 200                       -- Keep 200 drinks total
workflow count BUCKET:ITEM_BUCKET 10           -- Keep 10 empty buckets
workflow count BAR/COAL 20                     -- Keep 20 coal bars
workflow count BAR/IRON 100                    -- Keep 100 iron bars

-- Material flags:
-- LOCAL: only locally-produced items count
-- Quality (append to spec): :1 through :5 (Fine through Masterwork)
-- Example: WEAPON:ITEM_WEAPON_SWORD/METAL/INORGANIC:STEEL:3
--          (quality ≥ Superior, steel swords)
```

**workflow vs. vanilla workorders:** Vanilla work orders support more complex trigger conditions (raw material availability gates). Workflow is simpler but good for continuous production chains.

### `orders` — Manager Order Library

(Covered in Section 3 — see reference there.)

### `suspendmanager` — Intelligent Job Suspension

Automatically suspends construction jobs that are blocked, inaccessible, or would cause issues.

```
enable suspendmanager     — Activate (prevents annoying suspended job pile-up)
suspendmanager status
```

### `seedwatch` — Protect Seeds from Cooking

```
enable seedwatch
seedwatch all     — Enable protection for all seeds
seedwatch threshold <N>   — Protect seeds when count < N (per type)
seedwatch status
```

### `tailor` — Automatic Clothing Orders

Simpler alternative to autoclothing; automatically orders clothing when stocks are insufficient.

```
enable tailor
tailor status
tailor materials cloth silk yarn leather   -- Set which materials to use
```

### `autofish` — Automated Fishing Control

```
enable autofish
autofish threshold <N>    — Stop fishing when stock exceeds N (default: 200)
autofish status
```

### `automelt` — Auto-Melt Stockpile Items

Enable on a stockpile to automatically mark all meltable items in it for melting:

```
-- Via stockpile settings: q on stockpile → DFHack settings → automelt on
-- Or via Lua:
local sp = dfhack.gui.getSelectedStockpile()
sp.settings.flags.melt = true
```

### `fastdwarf` — Speed Control

```
fastdwarf 0           — Normal speed
fastdwarf 1           — Dwarves move at max speed (teleport to job sites)
fastdwarf 2           — Extra fast
fastdwarf 0 1         — Normal movement speed, 1-step pathfinding
```

---

## 12. Lua API Quick Reference

### Core Module Summary

```lua
-- ============================================================
-- MAPS MODULE
-- ============================================================
dfhack.maps.getSize()                   -- returns bx, by, bz (in blocks)
dfhack.maps.getTileSize()               -- returns tx, ty, tz (in tiles)
dfhack.maps.isValidTilePos(x, y, z)     -- boolean
dfhack.maps.isTileVisible(x, y, z)      -- boolean
dfhack.maps.getTileBlock(x, y, z)       -- returns map_block or nil
dfhack.maps.getBlock(bx, by, bz)        -- by block coordinates
dfhack.maps.ensureTileBlock(x, y, z)    -- allocates if missing
dfhack.maps.getTileType(x, y, z)        -- returns tiletype enum value
dfhack.maps.getTileFlags(x, y, z)       -- returns (designation, occupancy) refs
dfhack.maps.enableBlockUpdates(block, flow) -- mark block for update

-- Block fields:
block.tiletype[lx][ly]                  -- tiletype enum (lx=x%16, ly=y%16)
block.designation[lx][ly]               -- designation flags struct
block.occupancy[lx][ly]                 -- occupancy flags struct
block.flags.designated                  -- must be true after dig designation

-- Designation fields:
des.dig        -- tile_dig_designation: No=0,Default=1,UpDownStair=2,
               --   Channel=3,Ramp=4,DownStair=5,UpStair=6
des.smooth     -- boolean
des.hidden     -- boolean
des.flow_size  -- 0-7 (fluid level)
des.liquid_type -- false=water, true=magma
des.flow_forbid -- blocks flow
des.aquifer    -- 0=none, 1=light, 2=heavy

-- ============================================================
-- BUILDINGS MODULE
-- ============================================================
dfhack.buildings.allocateBuilding(type, subtype, custom)
dfhack.buildings.setSize(bld, w, h, d)
dfhack.buildings.checkFreeTiles(...)
dfhack.buildings.constructBuilding{     -- HIGH-LEVEL: does everything
    pos     = xyz2pos(x, y, z),         -- or x=, y=, z= separately
    type    = df.building_type.Workshop,
    subtype = df.workshop_type.Carpenters,
    custom  = -1,                        -- custom building ID (-1 = none)
    width   = 3, height = 3,
    abstract = false,                    -- true for stockpiles, civzones
    items   = {...},                     -- explicit item list (optional)
    filters = {...},                     -- filter objects (optional)
    material= ...,                       -- named material filter
    anvil=true, mechanism=true,          -- named input shortcuts
}
dfhack.buildings.deconstruct(bld)
dfhack.buildings.findAtTile(x, y, z)
dfhack.buildings.getBuildings(x1,y1,z1,x2,y2,z2)
dfhack.buildings.isActive(bld)

-- Building type enums:
df.building_type.Workshop       -- uses df.workshop_type subtype
df.building_type.Furnace        -- uses df.furnace_type subtype
df.building_type.Trap           -- uses df.trap_type subtype
df.building_type.Stockpile
df.building_type.Civzone        -- uses df.civzone_type subtype
df.building_type.Door
df.building_type.Floodgate
df.building_type.Hatch
df.building_type.Grate
df.building_type.BarsVertical
df.building_type.Well
df.building_type.ScrewPump
df.building_type.GearAssembly
df.building_type.AxleHorizontal
df.building_type.AxleVertical
df.building_type.WaterWheel
df.building_type.Windmill
df.building_type.TrackStop
df.building_type.Wagon
df.building_type.Bridge
-- (complete list: :lua @df.building_type)

-- Workshop types: :lua @df.workshop_type
-- Carpenters, Farmers, Masons, Craftsdwarfs, Jewelers, MetalsmithsForge,
-- MagmaForge, Bowyers, Mechanics, Siege, Butchers, Leatherworks, Tanners,
-- Clothiers, Fishery, Still, Loom, Quern, Kennels, Ashery, Kitchen, Dyers,
-- Millstone, SoapMaker, Tool (Screw Press), Alchemist, AnimalTrap

-- Furnace types: :lua @df.furnace_type
-- WoodFurnace, Smelter, GlassFurnace, Kiln,
-- MagmaSmelter, MagmaGlassFurnace, MagmaKiln

-- ============================================================
-- UNITS MODULE
-- ============================================================
dfhack.units.isActive(unit)         -- alive and on map
dfhack.units.isCitizen(unit)        -- fort member, sane
dfhack.units.isAdult(unit)
dfhack.units.isDead(unit)
dfhack.units.isSane(unit)
dfhack.units.isVisible(unit)

dfhack.units.getPosition(unit)      -- returns x, y, z or nil
dfhack.units.getReadableName(unit)  -- "Name, Profession (Role)"
dfhack.units.getRaceName(unit)      -- "DWARF", "GOBLIN", etc.
dfhack.units.getAge(unit)           -- years as float
dfhack.units.getProfession(unit)    -- profession ID
dfhack.units.getNominalSkill(unit, skill) -- level accounting for rust
dfhack.units.getEffectiveSkill(unit, skill) -- level with penalties

dfhack.units.teleport(unit, pos)    -- relocate unit
dfhack.units.setPathGoal(unit, pos, goal)
dfhack.units.setNickname(unit, nick)
dfhack.units.create(race, caste)    -- create new unit

-- ============================================================
-- ITEMS MODULE
-- ============================================================
dfhack.items.findType(string)       -- item_type by name
dfhack.items.getPosition(item)      -- x, y, z or nil
dfhack.items.getOwner(item)
dfhack.items.getContainer(item)
dfhack.items.moveToGround(item, pos)
dfhack.items.moveToContainer(item, container)
dfhack.items.moveToBuilding(item, bld)
dfhack.items.moveToInventory(item, unit)
dfhack.items.getValue(item)
dfhack.items.canTrade(item)
dfhack.items.markForTrade(item, depot)
dfhack.items.createItem(unit, item_type, subtype, mat_type, mat_index)
dfhack.items.getDescription(item, 0) -- player-readable description

-- ============================================================
-- MILITARY MODULE
-- ============================================================
dfhack.military.makeSquad(assignment_id)
dfhack.military.addToSquad(unit_id, squad_id, squad_pos)
dfhack.military.removeFromSquad(unit_id)
dfhack.military.updateRoomAssignments(squad_id, assignment_id, flags)
dfhack.military.getSquadName(squad_id)

-- Global military data:
df.global.world.squads.all          -- all squads
df.global.ui.squads                 -- player-fort squad data
df.global.ui.alerts                 -- alert level definitions

-- ============================================================
-- JOB MODULE
-- ============================================================
dfhack.job.createLinked()           -- create and register job
dfhack.job.assignToWorkshop(job, bld)
dfhack.job.addWorker(job, unit)
dfhack.job.removeWorker(job, cooldown)
dfhack.job.getWorker(job)
dfhack.job.getHolder(job)
dfhack.job.attachJobItem(job, item, role, filter_idx, insert_idx)
dfhack.job.addGeneralRef(job, type, id)

-- ============================================================
-- GUI MODULE (selection helpers)
-- ============================================================
dfhack.gui.getSelectedUnit([silent])
dfhack.gui.getSelectedItem([silent])
dfhack.gui.getSelectedBuilding([silent])
dfhack.gui.getSelectedStockpile([silent])
dfhack.gui.getSelectedCivZone([silent])

-- ============================================================
-- USEFUL GLOBAL DATA PATHS
-- ============================================================
df.global.world.units.all               -- all units
df.global.world.units.active            -- active (on-map) units
df.global.world.items.all               -- all items
df.global.world.buildings.all           -- all buildings
df.global.world.buildings.other.STOCKPILE_ARMOR   -- stockpile arrays by type
df.global.world.buildings.other.WORKSHOP_*
df.global.world.buildings.other.CIVZONE_ANY
df.global.world.squads.all
df.global.world.raws.plants.all         -- plant definitions (for crop IDs)
df.global.world.raws.creatures.all      -- creature definitions
df.global.world.raws.inorganics.all     -- rock/metal definitions
df.global.world.map.map_data            -- tile blocks array
df.global.ui.civ_id                     -- player civ entity ID
df.global.ui.site_id                    -- current fort site ID
df.global.ui.main.fortress_entity       -- fort entity object
df.global.world.entities.all            -- all civs/entities
df.global.ui.job_list.jobs              -- current job queue
df.global.world.manager_orders          -- work order list
```

---

## 13. Remote Execution Model

### Invoking DFHack from External Processes

All DFHack commands can be invoked remotely via SSH to the Windows VM using `dfhack-run`:

```bash
# On the host (or via SSH to the VM):
dfhack-run <command> [args...]

# Execute arbitrary Lua:
dfhack-run lua ":<lua code>"

# Execute a Lua file:
dfhack-run script <filename>

# Multiple commands in sequence:
dfhack-run multicmd "cmd1 ; cmd2 ; cmd3"
```

**Critical caveat for 53.x under Prism (Chronicler project):**  
TCP RPC is broken for game-thread calls on DFHack 53.x running under Prism virtualization. Only cached calls (GetVersion, GetWorldInfo) work over TCP. All other invocations must go through `dfhack-run` over SSH. This is already the operational model for the Chronicler bridge.

**GUI-only commands (not scriptable via dfhack-run):**  
All `gui/*` commands open interactive panels and require mouse/keyboard interaction. Exception: they can be opened remotely but cannot be completed without user input. The `liquids` and `tiletypes` interactive modes have non-interactive variants (`liquids-here`, `tiletypes-command`).

### Polling Patterns for a Bot

```lua
-- Pattern 1: Read-only state polling
-- Call from external process via dfhack-run lua script:
local function get_fortress_state()
    local state = {}
    state.dwarves = #df.global.world.units.active
    state.food = 0
    -- count food items...
    for _,item in ipairs(df.global.world.items.all) do
        if item:getType() == df.item_type.FOOD then
            state.food = state.food + 1
        end
    end
    return state
end

-- Pattern 2: Issue dig designation
local function designate_dig(x, y, z)
    local block = dfhack.maps.getTileBlock(x, y, z)
    if not block then return false end
    local des = block.designation[x%16][y%16]
    if des.dig == df.tile_dig_designation.No then
        des.dig = df.tile_dig_designation.Default
        block.flags.designated = true
        return true
    end
    return false
end

-- Pattern 3: Queue a work order
dfhack.run_command("workorder", "BrewDrink", "20")
-- or via lua:
dfhack.run_command("workorder", '{"job":"BrewDrink","amount_total":20}')
```

### Event Subscription (eventful plugin)

For reactive bot behavior, subscribe to game events:

```lua
-- In a persistent Lua script (loaded via dfhack.init or dfhack_onLoad):
local eventful = require('plugins.eventful')

eventful.onUnitDeath[script_name] = function(unit_id)
    -- Triggered when any unit dies
    local unit = df.unit.find(unit_id)
    print("Unit died:", dfhack.units.getReadableName(unit))
end

eventful.onJobInitiated[script_name] = function(job)
    -- Triggered when a job starts
end

eventful.onJobCompleted[script_name] = function(job)
    -- Triggered when a job completes
end

-- Available events:
-- onUnitDeath, onJobInitiated, onJobCompleted,
-- onItemCreated, onSyndrome, onInvasion,
-- onBuildingDestroyed, onConstructionDestroyed,
-- onReactionComplete, onMiningComplete

-- Unsubscribe:
eventful.onUnitDeath[script_name] = nil
```

---

## Sources

1. [DFHack Lua API Reference — DFHack 53.10-r2rc1](https://docs.dfhack.org/en/latest/docs/dev/Lua%20API.html)
2. [DFHack Lua API Reference — DFHack 53.06-r1 (stable)](https://docs.dfhack.org/en/stable/docs/dev/Lua%20API.html)
3. [Quickfort Blueprint Creation Guide — DFHack 53.11-r1](https://docs.dfhack.org/en/stable/docs/guides/quickfort-user-guide.html)
4. [DFHack Tools Index — DFHack 53.11-r2](https://docs.dfhack.org/en/latest/docs/Tools.html)
5. [dig — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/dig.html)
6. [workorder — DFHack 53.10-r1](https://docs.dfhack.org/en/latest/docs/tools/workorder.html)
7. [workflow — DFHack 53.08-r1](https://docs.dfhack.org/en/stable/docs/tools/workflow.html)
8. [orders — DFHack 53.10-r1](https://docs.dfhack.org/en/latest/docs/tools/orders.html)
9. [autolabor — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/autolabor.html)
10. [autobutcher — DFHack 53.08-r1](https://docs.dfhack.org/en/53.08-r1/docs/tools/autobutcher.html)
11. [autochop — DFHack 53.11-r2](https://docs.dfhack.org/en/latest/docs/tools/autochop.html)
12. [autoclothing — DFHack 53.08-r1](https://docs.dfhack.org/en/latest/docs/tools/autoclothing.html)
13. [autofarm — DFHack 53.11-r2](https://docs.dfhack.org/en/stable/docs/tools/autofarm.html)
14. [buildingplan — DFHack 53.11-r1](https://docs.dfhack.org/en/stable/docs/tools/buildingplan.html)
15. [tiletypes — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/tiletypes.html)
16. [gui/quantum — DFHack 53.06-r1](https://docs.dfhack.org/en/stable/docs/tools/gui/quantum.html)
17. [DFHack Quickstart Guide — 53.11-r1](https://docs.dfhack.org/en/stable/docs/Quickstart.html)
18. [dfhack/library/lua/dfhack/buildings.lua (GitHub develop)](https://github.com/DFHack/dfhack/blob/develop/library/lua/dfhack/buildings.lua)
19. [DFHack Utility — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Utility:DFHack)
20. [Farming — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Farming)
21. [Activity zone — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Activity_zone)
22. [Noble — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Noble)
23. [Trading — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Trading)
24. [Screw pump — Dwarf Fortress Wiki (DF2014)](https://dwarffortresswiki.org/index.php/DF2014:Screw_pump)
25. [Pressure — Dwarf Fortress Wiki (DF2014)](https://dwarffortresswiki.org/index.php/DF2014:Pressure)
26. [Military — Dwarf Fortress Wiki (DF2014)](https://dwarffortresswiki.org/index.php/DF2014:Military)
27. [Quantum stockpile — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/DF2014:Quantum_stockpile)
28. [EldrickWT/eld-dfhack-scripts — do_dig_designations.lua (GitHub)](https://github.com/EldrickWT/eld-dfhack-scripts/blob/master/do_dig_designations.lua)
29. [DFHack/scripts — hfs-pit.lua (GitHub)](https://github.com/DFHack/scripts/blob/master/hfs-pit.lua)

---

*Document generated by Deep Research agent, 2026-03-19. Coverage: DFHack 53.11-r2 / DF Steam v53.x.*
