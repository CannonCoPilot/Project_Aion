# DFHack Quickfort — Comprehensive Reference

**Date**: 2026-03-19
**DFHack Version**: 53.11-r2 (current stable as of research date)
**DF Version**: v53.x (Steam)
**Scope**: Complete technical reference for automated fortress construction using Quickfort blueprints

---

## Table of Contents

1. [Quickfort Basics](#1-quickfort-basics)
2. [Blueprint File Formats](#2-blueprint-file-formats)
3. [Running Blueprints](#3-running-blueprints)
4. [Modeline Syntax](#4-modeline-syntax)
5. [Dig Mode (`#dig`)](#5-dig-mode-dig)
6. [Build Mode (`#build`)](#6-build-mode-build)
7. [Place Mode (`#place`)](#7-place-mode-place)
8. [Zone Mode (`#zone`)](#8-zone-mode-zone)
9. [Burrow Mode (`#burrow`)](#9-burrow-mode-burrow)
10. [Meta Mode (`#meta`)](#10-meta-mode-meta)
11. [Notes Mode (`#notes`)](#11-notes-mode-notes)
12. [Ignore Mode (`#ignore`)](#12-ignore-mode-ignore)
13. [Blueprint Syntax — General Rules](#13-blueprint-syntax--general-rules)
14. [Multi-Z-Level Blueprints](#14-multi-z-level-blueprints)
15. [Area Expansion Syntax](#15-area-expansion-syntax)
16. [Property/Configuration Syntax](#16-propertyconfiguration-syntax)
17. [Built-in Blueprint Library](#17-built-in-blueprint-library)
18. [Complete Symbol Reference — Dig Mode](#18-complete-symbol-reference--dig-mode)
19. [Complete Symbol Reference — Build Mode](#19-complete-symbol-reference--build-mode)
20. [Complete Symbol Reference — Place Mode](#20-complete-symbol-reference--place-mode)
21. [Complete Symbol Reference — Zone Mode](#21-complete-symbol-reference--zone-mode)
22. [Practical Blueprint Examples](#22-practical-blueprint-examples)
23. [Advanced Features](#23-advanced-features)
24. [Buildingplan Integration](#24-buildingplan-integration)
25. [Manager Orders Integration](#25-manager-orders-integration)
26. [Related DFHack Commands](#26-related-dfhack-commands)
27. [Sources](#27-sources)

---

## 1. Quickfort Basics

Quickfort is a DFHack tool that applies "blueprints" — `.csv`, `.tsv`, or `.xlsx` files — to a Dwarf Fortress map. Each blueprint describes a phase of construction (digging, stockpile placement, building construction, zone designation) using single-character codes placed in a grid that maps directly to DF map tiles.

**Core concept**: The spreadsheet grid IS the fortress layout. One cell = one map tile. The top-left cell of the blueprint aligns to the cursor position when applied.

**Key advantages**:
- Repeatable: apply the same blueprint stamp anywhere on the map
- Multi-phase: dig, then place stockpiles, then build — as separate but coordinated blueprints
- Integrated with `buildingplan`: place buildings before materials exist
- Integrated with `orders`: auto-queue work orders for required materials

**Blueprint storage**:
- User blueprints: `dfhack-config/blueprints/` (inside DF installation)
- Library blueprints: `hack/data/blueprints/` (DFHack install, read-only)

---

## 2. Blueprint File Formats

Quickfort accepts three file formats:

| Format | Extension | Notes |
|--------|-----------|-------|
| CSV | `.csv` | Comma-separated values; recommended for scripting and version control |
| TSV | `.tsv` | Tab-separated values; alternative text format |
| Excel | `.xlsx` | Supports multiple sheets; each sheet can be a separate blueprint or multiple blueprints per sheet |

**Editing tools**: Any spreadsheet application works (Excel, LibreOffice Calc, Google Sheets). Plain text editors work for CSV/TSV.

**Multi-blueprint files**: A single `.csv` file or `.xlsx` spreadsheet can contain multiple blueprints. Each new blueprint starts with a modeline in the first column of its first row.

---

## 3. Running Blueprints

### Subcommands

```
quickfort list [<search>] [-m <mode>] [-l] [-h]
quickfort run <id or filename> [options]
quickfort orders <id or filename> [options]
quickfort undo <id or filename> [options]
quickfort gui [<filename or search>]
quickfort delete <filename>
quickfort set [<key> <value>]
quickfort reset
```

### `quickfort list`

Lists available blueprints.

```
quickfort list                  # all user + library blueprints
quickfort list farming          # search by keyword
quickfort list -m build         # filter by mode
quickfort list -l               # library blueprints only (alias: --library)
quickfort list -u               # user blueprints only (alias: --useronly)
quickfort list -h               # include hidden blueprints
```

Output includes an index number, filepath, mode, label, and any modeline comment.

### `quickfort run`

Applies a blueprint to the map at the current cursor position.

```
quickfort run <N>                    # run blueprint by list index
quickfort run myfort.csv             # run by filename (first blueprint)
quickfort run myfort.csv -n dig1     # run named blueprint from file
quickfort run <N> -d                 # dry run (preview, no changes)
quickfort run <N> -c 45,60,100      # apply at specific coordinates x,y,z
quickfort run <N> -r down,3         # repeat 3 levels downward
quickfort run <N> -s 5,3            # shift blueprint right 5, down 3
quickfort run <N> -t rotcw          # rotate 90° clockwise before applying
quickfort run <N> -p 2              # set dig priority to 2 (1=highest)
quickfort run <N> -m blueprint      # apply as marker/blueprint-mode designations
quickfort run <N> --preserve-engravings masterful  # skip digging engraved tiles
```

### `quickfort orders`

Queues manager work orders for all materials required by a `#build` blueprint.

```
quickfort orders <N>            # queue orders for blueprint N
quickfort orders <N> -d         # dry run: show what would be ordered
```

**Material priority**: rock > wood > cloth > iron for generic building materials.

### `quickfort undo`

Reverses a blueprint: undesignates digs, cancels/schedules deconstruction of buildings.

```
quickfort undo <N>
```

### `quickfort gui`

Opens the interactive GUI for visual positioning before applying.

```
quickfort gui                       # browse and select blueprint interactively
quickfort gui dreamfort             # open with search pre-filled
```

**GUI controls**:
- Mouse / cursor keys: reposition blueprint on map
- `t`: open transformation menu
- `(` / `)`: rotate counterclockwise / clockwise
- `_`: flip vertically
- `=`: flip horizontally
- Enter / left-click: apply blueprint
- Esc / right-click: cancel

### `quickfort set` / `quickfort reset`

View or modify global configuration:

```
quickfort set                                    # show all current settings
quickfort set blueprints_user_dir path/to/dir   # change user blueprint dir
quickfort set force_marker_mode true            # force all digs to marker mode
quickfort set stockpiles_max_barrels 20         # cap barrels per stockpile
quickfort set stockpiles_max_bins 20            # cap bins per stockpile
quickfort set stockpiles_max_wheelbarrows 3     # cap wheelbarrows per stockpile
quickfort reset                                  # restore defaults
```

**Configuration keys**:

| Key | Default | Description |
|-----|---------|-------------|
| `blueprints_user_dir` | `dfhack-config/blueprints` | Where user blueprints are stored |
| `blueprints_library_dir` | `hack/data/blueprints` | Library blueprint location |
| `force_marker_mode` | `false` | Force all dig designations to blueprint/marker mode |
| `stockpiles_max_barrels` | `-1` (unlimited) | Max barrels per new stockpile |
| `stockpiles_max_bins` | `-1` (unlimited) | Max bins per new stockpile |
| `stockpiles_max_wheelbarrows` | `0` | Max wheelbarrows per new stockpile |

---

## 4. Modeline Syntax

The first cell of the first row of each blueprint must contain a modeline that identifies the blueprint type.

```
#mode [label(name)] [start(X;Y[;description])] [hidden()] [message(text)]
```

**Components** (all optional except `#mode`):

| Component | Syntax | Description |
|-----------|--------|-------------|
| Mode | `#dig`, `#build`, `#place`, `#zone`, `#burrow`, `#meta`, `#notes`, `#ignore` | Required; sets blueprint interpretation mode |
| Label | `label(my_blueprint)` | Identifier for meta-blueprint references; must start with a letter |
| Start | `start(3;3)` or `start(3;3;cursor here)` | Cursor offset (1-based); text after 2nd separator is a note |
| Hidden | `hidden()` | Hides blueprint from `quickfort list` unless `-h` is used |
| Message | `message(Apply next: farming)` | Text displayed after successful application; supports `\n` for newlines |

**Separator in `start()`**: semicolons, commas, or spaces all work: `start(3;3)` = `start(3,3)` = `start(3 3)`.

**Examples**:
```
#dig
#build label(workshop_level) start(5;5;NW corner of workshop block)
#place label(farming_stockpiles) hidden() message(Now run: farming_build)
#meta label(full_embark) message(Embark setup complete!\nRun: quickfort list embark)
```

**Note**: In non-modeline cells, any cell whose text starts with `#` followed by a word that matches a mode name will accidentally create a new modeline if placed in column A. Use `# comment text` (with a space) to safely write comments.

---

## 5. Dig Mode (`#dig`)

Designates tiles for mining, smoothing, and other terrain operations. If no modeline is present, a file is interpreted as `#dig` by default.

Applied via DF's Designations menu.

**Basic usage**: Place the appropriate symbol in each cell of your spreadsheet to designate that map tile.

---

## 6. Build Mode (`#build`)

Places buildings, workshops, furnaces, furniture, and constructions. Uses DF's Build menu.

Quickfort integrates with the `buildingplan` plugin so buildings can be placed before materials exist. The planner queues construction and automatically attaches materials when they become available.

**Multi-tile buildings**: Quickfort fills a rectangular area of identical codes (e.g., a 3x3 block of `wm` cells) and automatically splits it into appropriately-sized buildings. A 6x6 block of `wj` = four 3x3 jeweler's workshops.

---

## 7. Place Mode (`#place`)

Designates stockpile areas. Uses DF's Place Stockpiles menu.

Stockpile type is set by the single-letter code. Container counts can be appended as a number (e.g., `f3` = food stockpile with 3 barrels; `s5` = stone with 5 wheelbarrows).

---

## 8. Zone Mode (`#zone`)

Creates activity zones. Uses DF's Activity Zones menu.

---

## 9. Burrow Mode (`#burrow`)

Creates or modifies burrows.

---

## 10. Meta Mode (`#meta`)

Sequences multiple blueprints for batch application. Cells reference other blueprints by label. Supports transformations, repetition, and position shifting.

**Cell content**: References to blueprint labels (from the same file or by path):
```
/label_name           # blueprint in same file
filename/label_name   # blueprint in another file
```

**Meta-only markers** (placed as cell values):
```
repeat(down 5)        # repeat all blueprints in this meta, 5 levels downward
repeat(up 3)          # repeat 3 levels upward
shift(10 5)           # offset all blueprints right 10, down 5 tiles
transform(cw)         # rotate all blueprints 90° clockwise
transform(cw flipv)   # rotate then flip (transformations apply in order)
```

**Example meta blueprint**:
```
#meta label(full_surface) message(Surface complete)
/surface_dig
/surface_build
/surface_place
```

---

## 11. Notes Mode (`#notes`)

Displays a multi-line message to the user without affecting the map. Useful for step-by-step instructions embedded in a blueprint file. Each spreadsheet row becomes one line of output.

---

## 12. Ignore Mode (`#ignore`)

Marks a section of a spreadsheet to be skipped by quickfort. Used to hide draft sections, scratch areas, or disabled blueprint variants.

---

## 13. Blueprint Syntax — General Rules

### Empty cells

Two symbols are treated as "no action" for their respective modes:
- `` ` `` (backtick): explicitly empty
- `~` (tilde): explicitly empty (useful for visual alignment in dig/build blueprints)

Any truly empty CSV cell also means "no action."

### Comment cells

Any cell whose text begins with `#` is a comment and is ignored, EXCEPT in column A where it may be interpreted as a modeline. Safe practice: always start comments with `# ` (hash-space).

### Property syntax

Properties configure a building/stockpile/zone inline:
```
symbol{property=value property2="value with spaces"}
```

Multiple properties separated by spaces inside curly braces. Example:
```
b{name="Urist's Bedroom" assigned_unit=mayor}
f{name="Booze" barrels=20}:=booze
```

### Label syntax

Associates disconnected tiles with the same zone or stockpile:
```
f/main_food
f/main_food
```
Both cells become part of stockpile "main_food" even if not adjacent.

### Stockpile filter/preset syntax

The colon-suffix on stockpile cells applies filter presets:
```
f:=booze              # set food stockpile to booze preset only
p:-cat_weapons/other  # disable "other" weapons sub-category
p:+steelweapons       # enable steel weapons
```

Operators:
- `=` — set mode (replace)
- `+` — enable specific sub-category
- `-` — disable specific sub-category

---

## 14. Multi-Z-Level Blueprints

A single blueprint file can span multiple z-levels using level separators:

```
#dig label(mine_shaft) start(1;1)
d d d
d d d
d d d
#>
d d d
d d d
d d d
#>
i i i
d d d
d d d
```

**Separators**:
| Separator | Meaning |
|-----------|---------|
| `#>` | Move down one z-level |
| `#<` | Move up one z-level |
| `#>2` | Move down two z-levels |
| `#<3` | Move up three z-levels |

The separator must appear in the first column (column A) of its row.

**Command-line repeat**: Alternatively, use `-r` to repeat a single-level blueprint across multiple levels:
```
quickfort run <N> -r down,10    # apply 10 levels downward
quickfort run <N> -r up,5       # apply 5 levels upward
```

---

## 15. Area Expansion Syntax

Fills a rectangular region without repeating the symbol in every cell:
```
d(10x5)     # dig a 10-wide, 5-tall rectangle starting at this cell
wm(3x3)     # place a 3x3 stoneworker's workshop
```

**Negative coordinates**: Use negative numbers to specify a cell other than the top-left as the anchor:
```
d(-2x-2)    # this cell is the bottom-right of a 2x2 dug area
```

**Note**: Area expansion only creates rectangles. For complex shapes, fill each cell individually.

---

## 16. Property/Configuration Syntax

### Universal building properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Name displayed in-game for this building/stockpile/zone |
| `do_now` | bool | `true` = high-priority construction job |
| `take_from` | string | Comma-separated stockpile/workshop names to pull from |
| `give_to` | string | Comma-separated stockpile/workshop names to push to |

### Workshop-specific properties

| Property | Type | Description |
|----------|------|-------------|
| `labor` | string | Comma-separated labors to enable (overrides others) |
| `labor_mask` | string | Comma-separated labors to disable |
| `min_skill` | int | Minimum skill level for operators |
| `max_skill` | int | Maximum skill level for operators |
| `max_general_orders` | int | Max concurrent standing orders |

### Stockpile-specific properties

| Property | Type | Description |
|----------|------|-------------|
| `bins` | int | Number of bins |
| `barrels` | int | Number of barrels |
| `wheelbarrows` | int | Number of wheelbarrows |
| `containers` | int | Set all container types to this value (use `0` to disable) |
| `links_only` | bool | `true` = only accept items via links (from `take_from`) |
| `quantum` | bool | `true` = sets `containers=0 links_only=true` for quantum stockpile |
| `automelt` | bool | Enable auto-melt logistics |
| `autotrade` | bool | Enable auto-trade logistics |
| `autodump` | bool | Enable auto-dump logistics |
| `autotrain` | bool | Enable auto-train logistics |
| `autoforbid` | bool | Enable auto-forbid logistics |
| `autoclaim` | bool | Enable auto-claim logistics |

### Zone-specific properties

| Property | Type | Description |
|----------|------|-------------|
| `active` | bool | Zone is active/inactive |
| `assigned_unit` | string | Position name (e.g., `manager`, `mayor`, `sheriff`) |
| `location` | string | Location type with optional label: `location=tavern/mainpub` |
| `allow` | string | Access list: `visitors`, `residents`, `citizens`, `members` |
| `profession` | string | For guildhalls (e.g., `metalsmith`, `carpenter`) |
| `pond` | bool | For pit/pond zones: `true` = pond, `false` = pit |
| `shoot_from` | string | For archery ranges: `north`, `south`, `east`, `west` |
| `pick_trees` | bool | For gather/pasture zones |
| `pick_shrubs` | bool | For gather/pasture zones |
| `gather_fallen` | bool | For gather zones |
| `pets` | bool | For tomb zones: allow pet burial |
| `citizens` | bool | For tomb zones: restrict to citizens |

### Location desired-item properties (zone)

| Location | Properties |
|----------|-----------|
| Tavern | `desired_goblets`, `desired_instruments` |
| Hospital | `desired_splints`, `desired_thread`, `desired_cloth`, `desired_crutches`, `desired_powder`, `desired_buckets`, `desired_soap` |
| Library | `desired_paper` |
| Temple | `desired_instruments` |

---

## 17. Built-in Blueprint Library

Location: `hack/data/blueprints/library/` inside your DFHack installation.

List library blueprints:
```
quickfort list -l
quickfort list -l -m dig       # library dig blueprints only
quickfort list dreamfort       # search library for dreamfort
```

### Dreamfort — Flagship Blueprint

Dreamfort is a fully functional, self-sustaining fortress blueprint distributed with DFHack. It includes:

- Exterior defenses and entry structures
- Complete farming level with stockpile chains
- Full industry level (all workshops)
- Services (4 levels deep): cisterns, dining, hospital, jail, barracks
- Guildhall level
- Noble suites
- Apartments (hundreds of bedrooms)
- Crypt

Access the step-by-step walkthrough:
```
quickfort gui
# search: "dreamfort help"
```

Online resources (linked from library guide):
- Embark profile for Dreamfort
- Construction checklist
- Video tutorials

### Complete Library Blueprint Listing

**Whole Fort Sets**:
| File | Description |
|------|-------------|
| `dreamfort.csv` | Complete self-sustaining fortress with all amenities |

**Layout Helpers**:
| File | Description |
|------|-------------|
| `mark_up_left.csv` | Diagonal marker line (upper-left direction) |
| `mark_up_right.csv` | Diagonal marker line (upper-right direction) |
| `mark_down_left.csv` | Diagonal marker line (lower-left direction) |
| `mark_down_right.csv` | Diagonal marker line (lower-right direction) |

**Bedroom Designs**:
| File | Rooms | Source |
|------|-------|--------|
| `48-4-Raynard_Whirlpool_Housing.csv` | 48 rooms | Raynard community design |
| `95-9-Hactar1_3_Branch_Tree.csv` | 95 rooms | Hactar1 community design |
| `28-3-Modified_Windmill_Villas.csv` | 28 rooms | Modified Windmill Villas |

**Tombs**:
| File | Description |
|------|-------------|
| `Mini_Saracen.csv` | Compact tomb design |
| `The_Saracen_Crypts.csv` | Full crypt complex |

**Exploratory Mining**:
| File | Description |
|------|-------------|
| `tunnels.csv` | Horizontal tunnel patterns |
| `vertical-mineshafts.csv` | Vertical shaft patterns |
| `connected-mineshafts.csv` | Connected shaft network |

**Utilities**:
| File | Description |
|------|-------------|
| `aquifer_tap.csv` | Safe above-the-aquifer water source system |
| `embark.csv` | Post-embark starter: workshops and stockpiles |
| `pump_stack.csv` | Water and magma elevation system |

---

## 18. Complete Symbol Reference — Dig Mode

### Terrain Designations

| Symbol | Action |
|--------|--------|
| `d` | Dig (mine walls and natural ramps, leaving floor) |
| `h` | Channel (removes floor, creates open space with ramp below) |
| `u` | Up stair |
| `j` | Down stair |
| `i` | Up/down stair |
| `r` | Ramp (creates natural ramp, mine operation) |
| `z` | Remove up stairs/ramps |
| `t` | Chop trees |
| `p` | Gather plants |
| `s` | Smooth walls or floors |
| `e` | Engrave smoothed walls or floors |
| `F` | Carve fortification (into smoothed wall) |
| `T` | Carve track into floor |
| `v` | Toggle engraving detail visibility |
| `M` | Toggle marker/blueprint mode for this tile |
| `n` | Remove construction |
| `x` | Remove designation |

### Item Flag Designations

| Symbol | Action |
|--------|--------|
| `bc` | Claim items on this tile |
| `bf` | Forbid items on this tile |
| `bm` | Melt items on this tile |
| `bM` | Remove melt flag from items on this tile |
| `bd` | Dump items on this tile |
| `bD` | Remove dump flag from items on this tile |
| `bh` | Hide items on this tile |
| `bH` | Unhide items on this tile |

### Traffic Designations

| Symbol | Action |
|--------|--------|
| `oh` | Set high traffic |
| `on` | Set normal traffic |
| `ol` | Set low traffic |
| `or` | Set restricted traffic |

### Dig Priority Suffix

Append a digit 1–7 to any dig designation to set priority (1 = highest, 4 = default):
```
d1     # dig, priority 1 (highest)
h2     # channel, priority 2
d4     # dig, default priority
```

### Marker Mode Flags

| Symbol | Meaning |
|--------|---------|
| `mb` | Apply as blueprint/marker mode designation |
| `mw` | Apply as warm dig marker |
| `md` | Apply as damp dig marker |

### Carved Track Aliases

Single direction:
- `trackN`, `trackS`, `trackE`, `trackW`

Two directions:
- `trackNS`, `trackEW`
- `trackNE`, `trackNW`, `trackSE`, `trackSW`

Three directions:
- `trackNSE`, `trackNSW`, `trackNEW`, `trackSEW`

All directions:
- `trackNSEW`

Track over natural ramp (functionally identical to `track<dir>`):
- `trackrampN`, `trackrampS`, `trackrampE`, `trackrampW`
- `trackrampNS`, `trackrampEW`, `trackrampNE`, `trackrampNW`, `trackrampSE`, `trackrampSW`
- `trackrampNSE`, `trackrampNSW`, `trackrampNEW`, `trackrampSEW`, `trackrampNSEW`

---

## 19. Complete Symbol Reference — Build Mode

### Furniture and Fixtures

| Symbol | Building |
|--------|---------|
| `a` | Armor stand |
| `b` | Bed |
| `c` | Seat (chair/throne) |
| `n` | Burial receptacle (coffin/sarcophagus) |
| `d` | Door |
| `x` | Floodgate |
| `H` | Floor hatch |
| `W` | Wall grate |
| `G` | Floor grate |
| `B` | Vertical bars |
| `~b` | Floor bars |
| `f` | Cabinet |
| `h` | Container (chest/coffer) |
| `r` | Weapon rack |
| `s` | Statue |
| `~s` | Slab |
| `t` | Table |
| `l` | Well |
| `y` | Glass window |
| `Y` | Gem window |
| `D` | Trade depot |

### Bridges

| Symbol | Bridge Type |
|--------|-----------|
| `g` | Retracting bridge |
| `gw` | Bridge raising to north |
| `gd` | Bridge raising to east |
| `gx` | Bridge raising to south |
| `ga` | Bridge raising to west |

### Workshops

| Symbol | Workshop |
|--------|---------|
| `we` | Leather works |
| `wq` | Quern |
| `wM` | Millstone |
| `wo` | Loom |
| `wk` | Clothier's shop |
| `wb` | Bowyer's workshop |
| `wc` | Carpenter's workshop |
| `wf` | Metalsmith's forge |
| `wv` | Magma forge |
| `wj` | Jeweler's workshop |
| `wm` | Stoneworker's workshop (mason's) |
| `wu` | Butcher's shop |
| `wn` | Tanner's shop |
| `wr` | Craftsdwarf's workshop |
| `ws` | Siege workshop |
| `wt` | Mechanic's workshop |
| `wl` | Still |
| `ww` | Farmer's workshop |
| `wz` | Kitchen |
| `wh` | Fishery |
| `wy` | Ashery |
| `wd` | Dyer's shop |
| `wS` | Soap maker's workshop |
| `wp` | Screw press |

**Note**: All workshops occupy a 3x3 footprint. Fill a 3x3 block of cells with the code. For multiple adjacent workshops, fill the entire row/column — quickfort splits them automatically.

### Furnaces

| Symbol | Furnace |
|--------|--------|
| `ew` | Wood furnace |
| `es` | Smelter |
| `el` | Magma smelter |
| `eg` | Glass furnace |
| `ea` | Magma glass furnace |
| `ek` | Kiln |
| `en` | Magma kiln |

**Note**: Furnaces also occupy 3x3 footprints. Magma variants must be placed adjacent to a magma source.

### Constructions

| Symbol | Construction |
|--------|-------------|
| `Cw` | Wall |
| `CW` | Reinforced wall |
| `Cf` | Floor |
| `Cr` | Ramp (constructed) |
| `Cu` | Up stair (constructed) |
| `Cd` | Down stair (constructed) |
| `Cx` | Up/down stair (constructed) |
| `CF` | Fortification |

**Material note**: Constructions use `buildingplan` filter settings. Default: rock blocks. Run `quickfort orders` first or ensure `buildingplan` is active.

### Traps and Mechanisms

| Symbol | Trap/Device |
|--------|-----------|
| `Ts` | Stone-fall trap |
| `Tw` | Weapon trap |
| `Tl` | Lever |
| `Tp` | Pressure plate |
| `Tc` | Cage trap |
| `TS` | Upright spear/spike |

### Track Stops (Hauling)

| Symbol | Track Stop |
|--------|-----------|
| `trackstop` | Track stop (no dumping direction) |
| `trackstopN` | Track stop, dump to north |
| `trackstopS` | Track stop, dump to south |
| `trackstopE` | Track stop, dump to east |
| `trackstopW` | Track stop, dump to west |

**Track stop properties**:
```
trackstop{route="My Route" take_from="Main Stockpile"}
```

### Machines and Power

| Symbol | Machine |
|--------|--------|
| `Msu` | Screw pump (pumps from north) |
| `Msk` | Screw pump (pumps from east) |
| `Msm` | Screw pump (pumps from south) |
| `Msh` | Screw pump (pumps from west) |
| `Mw` | Water wheel (vertical, east-west) |
| `Mws` | Water wheel (horizontal, north-south) |
| `Mg` | Gear assembly |
| `Mh` | Horizontal axle (east-west) |
| `Mhs` | Horizontal axle (north-south) |
| `Mv` | Vertical axle |

### Rollers

| Symbol | Roller Direction |
|--------|----------------|
| `rollerNS` | Roller pushing south |
| `rollerEW` | Roller pushing west |
| `rollerSN` | Roller pushing north |
| `rollerWE` | Roller pushing east |

### Miscellaneous Buildings

| Symbol | Building |
|--------|---------|
| `S` | Support |
| `m` | Animal trap |
| `v` | Restraint |
| `j` | Cage |
| `A` | Archery target |
| `R` | Traction bench |
| `N` | Nest box |
| `~h` | Hive |
| `~a` | Offering place |
| `~c` | Bookcase |
| `F` | Display furniture |
| `I` | Buildable instrument |
| `k` | Vermin catcher's shop |

### Roads and Farm Plots

| Symbol | Structure |
|--------|---------|
| `p` | Farm plot |
| `o` | Paved road |
| `O` | Dirt road |

### Siege Engines

| Symbol | Siege Engine |
|--------|-------------|
| `ib` | Ballista |
| `it` | Bolt thrower |
| `ic` | Catapult |

---

## 20. Complete Symbol Reference — Place Mode

### Stockpile Types

| Symbol | Stockpile Type | Default Containers |
|--------|---------------|-------------------|
| `a` | Animal | none |
| `f` | Food | barrels |
| `u` | Furniture | none |
| `n` | Coins | bins |
| `y` | Corpses | none |
| `r` | Refuse | none |
| `s` | Stone | wheelbarrows |
| `w` | Wood | none |
| `e` | Gems | bins |
| `b` | Bars and blocks | bins |
| `h` | Cloth | bins |
| `l` | Leather | bins |
| `z` | Ammo | bins |
| `S` | Sheets | bins |
| `g` | Finished goods | bins |
| `p` | Weapons | bins |
| `d` | Armor | bins |
| `c` | Custom (blank) | none |

### Container Count Shorthand

Append a number to the stockpile code to set the container count:
```
f3     # food stockpile, 3 barrels
s5     # stone stockpile, 5 wheelbarrows
e2     # gem stockpile, 2 bins
```

### Quantum Stockpile

```
s{quantum=true}     # stone quantum (no containers, links_only)
f{quantum=true}     # food quantum
```

Equivalent to:
```
s{containers=0 links_only=true}
```

### Stockpile Filter Presets (colon syntax)

Common presets (defined in DFHack's stockpile preset library):
```
f:=booze            # food stockpile: booze only
f:=food             # food stockpile: all food
f:=seeds            # food stockpile: seeds only
p:=weapons          # weapons stockpile: all weapons
b:=bars             # bars/blocks: bars only
b:=blocks           # bars/blocks: blocks only
```

Sub-category operations:
```
p:-cat_weapons/other         # disable "other" weapons
p:+cat_weapons/steel         # enable steel weapons only
```

---

## 21. Complete Symbol Reference — Zone Mode

### Zone Types

| Symbol | Zone Type | Key Properties |
|--------|----------|---------------|
| `m` | Meeting area | `name`, `active` |
| `b` | Bedroom | `name`, `assigned_unit` |
| `h` | Dining hall | `name`, `assigned_unit` |
| `n` | Pen/pasture | `name`, `pick_trees`, `pick_shrubs` |
| `p` | Pit/pond | `name`, `pond=true/false` |
| `w` | Water source | `name`, `active` |
| `j` | Dungeon | `name` |
| `f` | Fishing | `name` |
| `s` | Sand | `name` |
| `o` | Office | `name`, `assigned_unit` |
| `D` | Dormitory | `name` |
| `B` | Barracks | `name` |
| `a` | Archery range | `name`, `shoot_from=north/south/east/west` |
| `d` | Garbage dump | `name` |
| `t` | Animal training | `name` |
| `T` | Tomb | `name`, `pets=true/false`, `citizens=true/false` |
| `g` | Gather/pick fruit | `name`, `pick_trees`, `pick_shrubs`, `gather_fallen` |
| `c` | Clay | `name` |

### Location Assignments

Zones can be assigned as named locations using the `location` property:
```
m{location=tavern/main_tavern allow=visitors}
m{location=library/main_library desired_paper=10}
m{location=temple/main_temple}
m{location=guildhall/smithguild profession=metalsmith}
m{location=hospital/main_hospital desired_thread=5 desired_cloth=5}
```

---

## 22. Practical Blueprint Examples

### Example 1: Basic Bedroom Block (4 rooms, 2x2 arrangement)

**Dig phase** (`bedroom_dig.csv`):
```
#dig label(bedroom_dig) start(1;1;NW corner)
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d
```

**Build phase** (`bedroom_build.csv`):
```
#build label(bedroom_build)
,d,,d,,d,,d,,d,
d,,,,,,,,,,d
,,b{name="Room 1"},,,,b{name="Room 2"},,,,
d,,,,,,,,,,d
,,,,,,,,,,
d,,,,,,,,,,d
,,b{name="Room 3"},,,,b{name="Room 4"},,,,
d,,,,,,,,,,d
,d,,d,,d,,d,,d,
```

**Zone phase** (`bedroom_zone.csv`):
```
#zone label(bedroom_zone)
,,,,,,,,,,,
,,,b{name="Room 1"},,,b{name="Room 2"},,,
,,,,,,,,,,,
,,,,,,,,,,,
,,,b{name="Room 3"},,,b{name="Room 4"},,,
,,,,,,,,,,,
```

### Example 2: Workshop Area (4 workshops in a row)

**Dig phase**:
```
#dig label(workshop_dig)
d,d,d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d,d,d
```

**Build phase** (carpenter + mason + craftsdwarf + mechanic):
```
#build label(workshop_build)
wc,wc,wc,wm,wm,wm,wr,wr,wr,wt,wt,wt
wc,wc,wc,wm,wm,wm,wr,wr,wr,wt,wt,wt
wc,wc,wc,wm,wm,wm,wr,wr,wr,wt,wt,wt
```

Quickfort automatically recognizes four 3x3 buildings and places them correctly.

### Example 3: Farming Setup

**Dig phase** (3 farm plots, 5x5 each):
```
#dig label(farm_dig)
d(17x7)
```

**Build phase**:
```
#build label(farm_build)
p(5x5),~,p(5x5),~,p(5x5)
p(5x5),~,p(5x5),~,p(5x5)
p(5x5),~,p(5x5),~,p(5x5)
p(5x5),~,p(5x5),~,p(5x5)
p(5x5),~,p(5x5),~,p(5x5)
```

**Stockpile phase** (seeds and food nearby):
```
#place label(farm_place)
f{name="Seeds" links_only=true}(5x3):=seeds
f{name="Food"}(5x3):=food
```

### Example 4: Military Barracks

**Zone phase**:
```
#zone label(barracks_zone)
B{name="Infantry Barracks"}(10x10)
```

**Build phase** (adjacent to zone):
```
#build label(barracks_build)
a,a,a,a,a,a,a,a,a,a
a,a,a,a,a,a,a,a,a,a
b,b,b,b,b,b,b,b,b,b
b,b,b,b,b,b,b,b,b,b
```

### Example 5: Trade Depot Area

**Dig phase** (depot + approach road):
```
#dig label(depot_dig)
d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d
d,d,d,d,d,d,d,d,d,d,d,d,d
```

**Build phase** (trade depot is 5x5, paved road approach):
```
#build label(depot_build)
D,D,D,D,D
D,D,D,D,D
D,D,D,D,D
D,D,D,D,D
D,D,D,D,D
```

Road:
```
#build label(depot_road)
o,o,o,o,o,o,o,o,o,o,o,o,o
```

### Example 6: Quantum Stockpile Setup

A quantum stockpile uses a feeder stockpile connected to a track stop that dumps to a single tile.

**Place phase** (feeder + quantum tile):
```
#place label(quantum_place)
s{name="Stone Feeder" give_to="Stone Quantum"}(5x5)
s{name="Stone Quantum" quantum=true}
```

**Build phase** (track stop adjacent to quantum tile):
```
#build label(quantum_build)
trackstopS{name="Stone Dump" take_from="Stone Feeder" route="Stone Route"}
```

### Example 7: Multi-Z-Level Staircase

```
#dig label(staircase) start(3;3;center of staircase)
i
#>
i
#>
i
#>
j
```

Top z: up/down stair. Middle levels: up/down stair. Bottom: down stair only.

---

## 23. Advanced Features

### Blueprint Aliases

Aliases allow meaningful names to stand in for complex sequences in `#query` and `#config` modes (the v50+ Steam edition uses direct property syntax instead of keystroke sequences for most operations).

**Alias file locations**:
- Built-in library: `hack/data/quickfort/aliases-common.txt` (do not edit; overwritten on DFHack update)
- User aliases: `dfhack-config/quickfort/aliases.txt` (user-editable; takes precedence)

**Alias format** in `aliases.txt`:
```
aliasname:keystroke-sequence
```

Alias names must be at least 2 characters (letters, digits, `-`, `_` allowed).

### Geometric Transformations

Apply to any blueprint at the command line:
```
quickfort run <N> -t rotcw        # rotate 90° clockwise
quickfort run <N> -t rotccw       # rotate 90° counterclockwise
quickfort run <N> -t fliph        # flip horizontally (mirror left-right)
quickfort run <N> -t flipv        # flip vertically (mirror top-bottom)
quickfort run <N> -t "cw flipv"   # rotate then flip (order matters)
```

Abbreviations: `cw` = `rotcw`, `ccw` = `rotccw`.

In `#meta` blueprints, use `transform()` marker cells.

### Blueprint Stacking / Multi-Phase Construction

Best practice for complex fortress areas: create one blueprint per construction phase, all with matching start positions.

**Recommended phase order**:
1. `#dig` — designate all mining
2. *(wait for dwarves to finish digging)*
3. `#place` — designate stockpiles
4. `#zone` — designate activity zones
5. `#build` — place all buildings/furniture
6. *(run `quickfort orders` before step 5 if not using buildingplan)*

Use a `#meta` blueprint to sequence them:
```
#meta label(level_1_full) message(Level 1 complete!)
/level1_dig
/level1_place
/level1_zone
/level1_build
```

**Note**: The meta blueprint applies all referenced blueprints simultaneously — you still need to wait for digging to complete before buildings can be placed. Meta is most useful for placing everything at once and letting dwarves complete each phase over time.

### Dry Run

Always use `-d` (dry run) to preview before committing:
```
quickfort run <N> -d
quickfort orders <N> -d
```

Outputs what would be changed without touching the map.

### Preserve Engravings

Avoid destroying valuable engravings during construction:
```
quickfort run <N> --preserve-engravings masterful
quickfort run <N> --preserve-engravings well-crafted
```

Valid quality thresholds: `ordinary`, `well-crafted`, `finely-crafted`, `superior`, `exceptional`, `masterful`.

---

## 24. Buildingplan Integration

`buildingplan` is a DFHack plugin that extends the construction system. Quickfort uses it automatically when it is enabled (it is enabled by default in DFHack 53.x).

### How it works with Quickfort

1. When quickfort places a `#build` blueprint, buildings are registered with `buildingplan` as "planned."
2. `buildingplan` periodically scans for available matching materials.
3. When materials are found, construction jobs are queued automatically.
4. No need to have materials ready before placing the blueprint.

### Material Filters

Set filters in the `buildingplan` UI **before** running a `#build` blueprint:
```
gui/buildingplan     # open the buildingplan UI
```

Filter settings (material category, quality range) are captured at blueprint-application time and persist with each planned building even after the filters change.

### Pre-setting filters for blueprints

1. Open `gui/buildingplan`
2. Set material filter (e.g., "gabbro only" or "quality >= superior")
3. Run `quickfort run <N>`
4. The placed buildings inherit the current filter settings
5. Change filters freely for the next blueprint

### Without buildingplan

If `buildingplan` is disabled:
1. Run `quickfort orders <N>` first to queue manufacturing orders
2. Wait for the work orders to complete (materials appear in stockpiles)
3. Then run `quickfort run <N>` to place buildings

---

## 25. Manager Orders Integration

```
quickfort orders <N>          # queue work orders for blueprint N
quickfort orders <N> -d       # dry run: show what would be ordered
```

### What gets ordered

| Building | Orders Generated |
|---------|-----------------|
| Most workshops/furnaces/furniture | Rock blocks (4 per boulder processed) |
| Track stop | 1 minecart |
| Traction bench | Table + mechanism + rope |
| Lever | 2 extra mechanisms (for linking) |
| Cage trap | 1 cage |
| Stockpile with bins=N | N bins |
| Stockpile with barrels=N | N barrels |
| Stockpile with wheelbarrows=N | N wheelbarrows |

### Material priority

Orders use: **rock first**, then wood, then cloth, then iron. Remove or modify generated orders manually if you want a different material.

### Workflow

```bash
# Step 1: Preview orders
quickfort orders <blueprint_id> -d

# Step 2: Queue orders
quickfort orders <blueprint_id>

# Step 3: Wait for work orders to complete in the manager screen

# Step 4: Apply blueprint
quickfort run <blueprint_id>
```

---

## 26. Related DFHack Commands

### `tiletypes` — Terrain Modification

Directly modifies map tile shapes and materials. Operates with a brush (area selection), filter (which tiles to affect), and paint specification (what to change tiles to).

**Interactive mode**:
```
tiletypes                       # enter interactive prompt
```

**Batch mode** (from DFHack console):
```
tiletypes-command <commands>    # run commands without interactive prompt
tiletypes-here                  # paint current cursor tile (uses last settings)
tiletypes-here-point            # paint only the exact cursor tile
```

**Brush types**:
| Brush | Description |
|-------|-------------|
| `point` | Single tile at cursor |
| `range width=W height=H [depth=D]` | Rectangle extending E/S/up from cursor |
| `block` | Entire 16x16 map block |
| `column` | Cursor upward to first solid tile |

**Filter/Paint properties**:
| Property | Description |
|----------|-------------|
| `shape` | Tile shape (wall, floor, ramp, stair, etc.) — see `:lua @df.tiletype_shape` |
| `material` | Stone, soil, mineral, etc. — see `:lua @df.tiletype_material` |
| `special` | Special tile attributes — see `:lua @df.tiletype_special` |
| `variant` | Tile variant |
| `hidden` | `0` = revealed, `1` = hidden |
| `designation` | Filter only: has pending job designation |
| `aquifer` | `0` = none, `1` = light, `2` = heavy |

**Example**: Turn all stone walls in a range into floors:
```
tiletypes-command "filter material STONE ; filter shape WALL ; paint shape FLOOR"
```

**Example**: Remove aquifer from current block:
```
tiletypes-command "paint aquifer 0" ; tiletypes-command "run"
```

### `createitem` — Spawn Items

Spawns arbitrary items at the cursor location or under a selected unit.

**Syntax**:
```
createitem <item_token> <material_token> [<count>]
```

**Placement**:
```
createitem floor      # (default) items placed on ground at cursor
createitem item       # items placed inside selected container
createitem building   # items placed inside selected building
```

**Examples**:
```
createitem BOULDER INORGANIC:GRANITE 50
createitem BLOCKS INORGANIC:GABBRO 200
createitem WOOD PLANT_MAT:TOWER_CAP:WOOD 100
createitem BAR INORGANIC:IRON 50
createitem GLOVES:ITEM_GLOVES_GAUNTLETS INORGANIC:STEEL 2
createitem PLANT_GROWTH BILBERRY:FRUIT
```

**Inspect existing item** (to get tokens):
```
createitem inspect     # with item selected in DF; outputs tokens for reuse
```

**Unsupported**: Corpses, body parts, and prepared meals cannot be created.

**Note**: Items created inside buildings require deconstructing the building to retrieve them. Use `createitem floor` for stockpile loading.

### `deramp`

Removes natural ramps by converting them to floor tiles. Useful after channeling or when ramps appear unexpectedly after mining. Operates on the current map view or a specified region.

```
deramp          # remove all exposed natural ramps in fort
```

### `fixbuildings`

Repairs construction issues that arise from tool-caused terrain changes. If `tiletypes` breaks a building's supporting terrain (e.g., you converted the tile under a constructed wall to open space), `fixbuildings` can restore consistency.

```
fixbuildings    # scan and fix invalid building states
```

### `gui/create-item` — Interactive Item Creation

Graphical interface version of `createitem`. Opens a UI to browse item and material types interactively.

```
gui/create-item
```

### `blueprint` — Export Existing Fortress

Exports a region of your existing fortress as quickfort-compatible blueprints. Useful for duplicating designs.

```
blueprint <width> <height> <depth> [<name>] [<modes>]
```

Modes: `dig`, `build`, `place`, `zone` — defaults to all.

Example:
```
blueprint 20 20 3 my_fortress dig build place
```

Output goes to `dfhack-config/blueprints/`.

---

## 27. Sources

1. [Quickfort blueprint creation guide — DFHack 53.11-r1](https://docs.dfhack.org/en/stable/docs/guides/quickfort-user-guide.html) — Primary technical reference
2. [quickfort tool — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/quickfort.html) — Command-line reference
3. [Quickfort blueprint library — DFHack 53.11-r1](https://docs.dfhack.org/en/stable/docs/guides/quickfort-library-guide.html) — Library guide and Dreamfort documentation
4. [gui/quickfort — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/gui/quickfort.html) — GUI interface documentation
5. [buildingplan — DFHack 53.11-r1](https://docs.dfhack.org/en/stable/docs/tools/buildingplan.html) — Buildingplan integration details
6. [tiletypes — DFHack 53.10-r1](https://docs.dfhack.org/en/stable/docs/tools/tiletypes.html) — Terrain modification tool
7. [createitem — DFHack 53.11-r2](https://docs.dfhack.org/en/latest/docs/tools/createitem.html) — Item spawning tool
8. [quickfort-user-guide.rst (GitHub develop branch)](https://github.com/DFHack/dfhack/blob/develop/docs/guides/quickfort-user-guide.rst) — Source RST for complete symbol tables
9. [Quickfort Community Blueprints — Dwarf Fortress Wiki](https://dwarffortresswiki.org/index.php/Quickfort_Community_Blueprints) — Community blueprint repository

---

## Appendix: Quick-Reference Card

### Common Dig Codes
`d`=dig `h`=channel `u`=up-stair `j`=down-stair `i`=up/down-stair `r`=ramp `s`=smooth `e`=engrave `F`=fortification

### Common Build Codes (furniture)
`b`=bed `c`=chair `t`=table `d`=door `f`=cabinet `h`=chest `a`=armor-stand `r`=weapon-rack `n`=coffin `s`=statue `l`=well `D`=depot

### Common Build Codes (workshops)
`wc`=carpenter `wm`=mason `wf`=forge `wj`=jeweler `wr`=craftsdwarf `wt`=mechanic `wl`=still `wz`=kitchen `wu`=butcher `wn`=tanner `we`=leather `wk`=clothier `wb`=bowyer `ww`=farmer `wh`=fishery `ws`=siege `wp`=screw-press `wy`=ashery `wd`=dyer `wS`=soapmaker

### Common Build Codes (furnaces)
`ew`=wood-furnace `es`=smelter `el`=magma-smelter `eg`=glass-furnace `ea`=magma-glass `ek`=kiln `en`=magma-kiln

### Common Build Codes (constructions)
`Cw`=wall `Cf`=floor `Cr`=ramp `Cu`=up-stair `Cd`=down-stair `Cx`=up/down-stair `CF`=fortification

### Stockpile Codes
`f`=food `s`=stone `w`=wood `b`=bars/blocks `g`=finished-goods `p`=weapons `d`=armor `h`=cloth `l`=leather `z`=ammo `e`=gems `u`=furniture `n`=coins `a`=animals `r`=refuse `y`=corpses

### Zone Codes
`b`=bedroom `h`=dining `B`=barracks `D`=dormitory `m`=meeting `o`=office `T`=tomb `a`=archery `n`=pasture `p`=pit/pond `w`=water `f`=fishing `g`=gather `t`=training `d`=dump

