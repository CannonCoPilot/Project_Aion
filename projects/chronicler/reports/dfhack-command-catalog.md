# Research Report: DFHack 53.11-r2 Command Catalog for Remote Game Control

**Date**: 2026-03-19
**Scope**: Comprehensive inventory of DFHack commands and Lua APIs usable for remote game control via `dfhack-run` and scripted Lua, organized by functional category with Chronicler/KH relevance notes.

---

## Executive Summary

DFHack 53.11-r2 ships approximately 400+ commands. Of these, the vast majority can be invoked via `dfhack-run <command>` from an external process — the only exceptions are commands explicitly requiring interactive GUI (gui/* family), the `liquids` interactive terminal mode, and `tiletypes` interactive mode (though both have scriptable `-command` / `liquids-here` variants). The `lua` and `multicmd` builtins allow arbitrary Lua code execution remotely, which means nearly every game-state read/write is achievable over the SSH → `dfhack-run` path already proven in Stage 3.1.

For Knowledge Horizon testing specifically, the most important commands fall into three buckets: **event triggers** (force, migrants-now, strangemood, spawnunit), **unit modification** (assign-*, teleport, add-thought, remove-stress, full-heal), and **state queries** (the `:lua` escape hatch into df.global).

---

## dfhack-run Remote Execution Model

**Binary:** `dfhack-run <command> [args...]`  
**Transport:** TCP port 5000 (DFHack RPC server; must be running)  
**Equivalent:** Calling the command in the DFHack console  
**Lua escape:** `dfhack-run lua ":<lua code here>"` — executes arbitrary Lua  
**Multi-command:** `dfhack-run multicmd "cmd1 ; cmd2 ; cmd3"` — semicolon-separated  
**Scripting:** `dfhack-run script <filename>` — runs a `.init`-style file of commands

**Critical gotcha (already documented in MEMORY.md):** TCP RPC is broken for game-thread calls on DFHack 53.x under Prism. The workaround is `dfhack-run` over SSH to the Windows VM, which works correctly.

**GUI-only commands (cannot be scripted remotely):** All `gui/*` commands require the graphical DF window. They open interactive panels and are not scriptable via dfhack-run. Exception: `gui/sandbox` and `gui/create-unit` can be triggered to open but require mouse/keyboard interaction to complete.

---

## Category 1: Game Event Triggers

### `force`
**Syntax:** `force <event> [<civ_id>]`  
**Events:**
- `force Caravan [<civ_id>]` — spawns caravan from parent civ (or specified civ: MOUNTAIN/PLAINS/FOREST/EVIL)
- `force Migrants` — triggers a migrant wave (requires at least one prior wave)
- `force Diplomat [<civ_id>]` — spawns diplomat
- `force Megabeast` — calls a megabeast to attack; enters on surface
- `force Wildlife` — allows additional wildlife in visible areas
- `force Wildlife all` — wildlife in all areas including unexplored

**Remote via dfhack-run:** Yes  
**Activation:** Next game tick (Wildlife: up to 100 ticks)  
**Caveats:** One caravan per civ at a time; DF may ignore frequently triggered events  
**KH relevance:** HIGH — trigger specific events to test KH revelation rules (caravan arrival reveals trade partner civ, diplomat reveals diplomatic status, megabeast attack triggers military KH expansion)

---

### `migrants-now`
**Syntax:** `migrants-now`  
**Description:** Triggers an immediate migrant wave.  
**Requirement:** At least one prior wave must have arrived through normal progression.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — test KH population growth tracking and new-unit revelation events

---

### `strangemood`
**Syntax:** `strangemood [--force] [--unit | --id <unit_id>] [--type <type>] [--skill <skill>]`  
**Options:**
- `--force` — bypass preconditions (no recent mood, min population, artifact limit)
- `--unit` — strike selected unit
- `--id <id>` — strike unit with given ID
- `--type fey|secretive|possessed|fell|macabre`
- `--skill miner|carpenter|engraver|mason|stonecutter|stonecarver|tanner|weaver|clothier|weaponsmith|armorsmith|metalsmith|gemcutter|gemsetter|woodcrafter|stonecrafter|metalcrafter|glassmaker|leatherworker|bonecarver|bowyer|mechanic`

**Remote via dfhack-run:** Yes  
**Known limitation:** Unit must not be currently performing a job  
**KH relevance:** MEDIUM — test artifact creation KH event (artifact creation is a revelation trigger)

---

### `catsplosion`
**Syntax:** `catsplosion [<race>]`  
**Description:** Makes all female units of a race pregnant (default: cats).  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — population side effect

---

### `region-pops`
**Syntax:**
- `region-pops list [<pattern>]` — show known regional populations
- `region-pops list-all [<pattern>]` — show all populations including unknown
- `region-pops boost <race> <factor>` — multiply population by factor
- `region-pops boost-all <pattern> <factor>`
- `region-pops incr <race> <amount>` — add to population count
- `region-pops incr-all <pattern> <amount>`

**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — test wildlife encounter probabilities; `list` vs `list-all` directly models KH known/unknown split

---

### `weather`
**Syntax:** `weather [clear|rain|snow]`  
**Description:** Display or set weather conditions.  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — environmental flavor

---

## Category 2: Unit Manipulation

### `teleport`
**Syntax:** `teleport [--unit <id>] [-x <x> -y <y> -z <z>]`  
**Description:** Teleport a unit to any map location. Works on friendly and hostile units.  
**Coordinate discovery:** `position` command or `cprobe`  
**Remote via dfhack-run:** Yes (unit ID and coordinates can be scripted)  
**KH relevance:** HIGH — place units precisely to test geographic scope KH rules; move spies/infiltrators to test visibility rules

---

### `spawnunit` (simplified wrapper)
**Syntax:** `spawnunit [-command] <race> <caste> [<name> [<x> <y> <z>]] [...]`  
**Description:** Create a unit. Wraps `modtools/create-unit`. Extra args pass through.  
**Example:** `spawnunit GOBLIN MALE` / `spawnunit JABBERER FEMALE --domesticate`  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — spawn test units for KH scope testing

---

### `modtools/create-unit`
**Syntax:** `modtools/create-unit -race <race> -location [ x y z ] [options]`  
**Status in 53.11:** Shows "UNTESTED WARNING" on first run — run command twice to bypass warning and proceed (VERIFIED 2026-03-19). Prefer `spawnunit` for simple cases.  
**Full parameter set:**
- `-race <raceName>` (required)
- `-location [ x y z ]` (required)
- `-caste <casteName>` (MALE/FEMALE/DEFAULT)
- `-civId <id>` (-1 or \LOCAL)
- `-groupId <id>` (-1 or \LOCAL)
- `-setUnitToFort` — sets civId+groupId to player fort
- `-name <entityRawName>` (\LOCAL for fort group)
- `-nick <nickname>`
- `-age <howOld>`
- `-equip [ ITEM:MATERIAL:QUANTITY ... ]`
- `-skills [ SKILL:LEVEL ... ]`
- `-profession <token>` (e.g. TRAINED_WAR)
- `-customProfession <name>`
- `-duration <ticks>` — auto-despawn
- `-quantity <n>`
- `-locationRange [ x y z ]`
- `-locationType Walkable|Open|Any`
- `-flagSet [ flag1 ... ]`
- `-flagClear [ flag1 ... ]`
- `-domesticate`

**Remote via dfhack-run:** Yes (but tagged unavailable — test before relying on it)  
**KH relevance:** VERY HIGH — precise unit creation with civ affiliation, skills, profession for scenario construction

---

### `makeown`
**Syntax:** `makeown` (requires selected unit in GUI)  
**Description:** Converts a unit to fortress citizen, removes foreign affiliation.  
**Remote via dfhack-run:** Requires unit selection; scriptable via `dfhack.units.makeown(unit)` in Lua  
**KH relevance:** MEDIUM — test KH transitions when foreigners become citizens

---

### `exterminate`
**Syntax:**
- `exterminate list`
- `exterminate this [options]`
- `exterminate undead [options]`
- `exterminate all[:<caste>] [options]`
- `exterminate <race>[:<caste>] [options]`

**Methods:** `instant` (default), `vaporize`, `disintegrate`, `drown`, `magma`, `butcher`, `knockout`, `traumatize`  
**Options:** `-m <method>`, `-o` (visible only), `-f` (include friendly), `-l <num>` (limit)  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — kill specific unit to test death revelation rules (KH Phase 2: direct family death notification)

---

### `full-heal`
**Syntax:**
- `full-heal` — selected unit
- `full-heal --unit <id>`
- `full-heal -r [--keep_corpse]` — heal + resurrect
- `full-heal --all [-r] [--keep_corpse]`
- `full-heal --all_citizens [-r] [--keep_corpse]`
- `full-heal --all_civ [-r] [--keep_corpse]`

**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — reset units for repeated test scenarios

---

### `assign-skills`
**Syntax:** `assign-skills [--unit <id>] [--skills [ <skill> <rank> ... ]] [--reset]`  
**Rank range:** -1 to 20+ (0=Dabbling, 3=Competent, 10=Accomplished, 15=Legendary)  
**Example:** `assign-skills --reset --skills [ WOODCUTTING 3 AXE 2 ]`  
**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — set up test dwarves with specific skill profiles for profession-based KH testing

---

### `assign-attributes`
**Syntax:** `assign-attributes [--unit <id>] [--attributes [ <attr> <tier> ... ]] [--reset]`  
**Tier range:** -4 to 4 (0=neutral)  
**Valid attributes:** STRENGTH, AGILITY, TOUGHNESS, ENDURANCE, RECUPERATION, DISEASE_RESISTANCE, ANALYTICAL_ABILITY, FOCUS, WILLPOWER, CREATIVITY, INTUITION, PATIENCE, MEMORY, LINGUISTIC_ABILITY, SPATIAL_SENSE, MUSICALITY, KINESTHETIC_SENSE, EMPATHY, SOCIAL_AWARENESS  
**Remote via dfhack-run:** Yes

---

### `assign-beliefs`
**Syntax:** `assign-beliefs [--unit <id>] [--beliefs [ <belief> <level> ... ]] [--reset]`  
**Level range:** -3 to 3  
**Valid tokens:** query with `devel/query --table df.value_type`  
**Example:** `assign-beliefs --reset --beliefs [ TRADITION 2 CRAFTSMANSHIP 3 POWER 0 CUNNING -1 ]`  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — construct test units with specific belief profiles for ideology/religion KH tests

---

### `assign-facets`
**Syntax:** `assign-facets [--unit <id>] [--facets [ <facet> <level> ... ]] [--reset]`  
**Level range:** -3 to 3  
**Valid tokens:** Personality_trait tokens (spaces replaced by underscores)  
**Remote via dfhack-run:** Yes

---

### `assign-goals`
**Syntax:** `assign-goals [--unit <id>] [--goals [ <goal> ... ]] [--reset]`  
**Description:** Change unit dreams/goals.  
**Remote via dfhack-run:** Yes

---

### `assign-preferences`
**Syntax:** `assign-preferences [--unit <id>] [--preferences [ ... ]] [--reset]`  
**Description:** View/modify unit preferences.  
**Remote via dfhack-run:** Yes

---

### `assign-profile`
**Syntax:** `assign-profile [--unit <id>] [--file <path>] [--profile <name>] [--reset [ALL|PROFILE|ATTRIBUTES|SKILLS|PREFERENCES|BELIEFS|GOALS|FACETS]]`  
**Description:** Apply all assign-* settings from a JSON profile file in one command.  
**Default profile file:** `/hack/scripts/dwarf_profiles.json`  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — batch-configure complex test dwarves from a profile library

---

### `add-thought`
**Syntax:** `add-thought [--unit <id>] [--thought <id>] [--emotion <id>] [--subthought <id>] [--strength <n>] [--severity <n>]`  
**Defaults:** thought=180 (NeedsUnfulfilled), emotion=-1 (none), subthought=0, strength=0  
**Query valid values:**
- Thoughts: `:lua @df.unit_thought_type`
- Emotions: `:lua @df.emotion_type`
- Syndromes: `devel/query --table df.global.world.raws.syndromes.all`

**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — inject emotional states to test mood-based narrative triggers

---

### `remove-stress`
**Syntax:** `remove-stress [--all] [--value <value>]`  
**Description:** Reduce stress to -1,000,000 (default) or specified value. Negative values need backslash prefix: `--value \-50000`  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — scenario reset utility

---

### `combat-harden`
**Syntax:** `combat-harden --value <n> [--unit <id>]`  
**Description:** Set combat-hardened value (0-100). Controls how much unit cares about seeing corpses. Default: 100.  
**Remote via dfhack-run:** Yes

---

### `rejuvenate`
**Syntax:** `rejuvenate [--all] [--age <years>]`  
**Description:** Reset unit age to minimum adult age (or specified age). `--all` applies to all citizens/residents.  
**Remote via dfhack-run:** Yes

---

### `modtools/add-syndrome`
**Syntax:**
- `modtools/add-syndrome --target <unit_id> --syndrome <name|id> [--resetPolicy NewInstance|DoNothing|ResetDuration|AddDuration] [--erase] [--eraseAll] [--skipImmunities]`
- `modtools/add-syndrome --target <unit_id> --eraseClass <class_id>`

**Browse syndromes:** `gui/unit-syndromes`  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — apply syndromes to test KH syndrome revelation (Stage 3.1 already subscribes to syndrome events)

---

### `diplomacy`
**Syntax:**
- `diplomacy` — display all diplomatic relations
- `diplomacy all <RELATIONSHIP>` — set stance with all civs
- `diplomacy <civ_id> <RELATIONSHIP>` — set stance with specific civ

**Relationships:** peace, war  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — modify diplomatic state to test KH diplomacy revelation (war declaration triggers KH event)

---

## Category 3: World and Map Manipulation

### `reveal` / `unreveal` / `revtoggle` / `revforget` / `revflood`
**Syntax:**
- `reveal [hell|demon]` — reveal all z-layers
- `unreveal` — revert revealed map
- `revtoggle` — toggle state
- `revforget` — discard pre-reveal visibility records
- `revflood` — hide everything, then reveal tiles with path to cursor/selected unit

**Caveats:** `reveal hell` may trigger HFS events on unpause; `reveal demon` allows unpause with secrets exposed  
**Remote via dfhack-run:** Yes  
**KH relevance:** VERY HIGH — `reveal` is essential for KH geographic scope testing (reveals map tiles, enabling testing of what the fortress "knows" about terrain)

---

### `reveal-hidden-units`
**Syntax:** `reveal-hidden-units`  
**Description:** Exposes all sneaking/ambush units on the map.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — expose hidden invaders to test KH army/military revelation

---

### `reveal-hidden-sites`
**Syntax:** `reveal-hidden-sites`  
**Description:** Exposes all undiscovered sites on the world map.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — test site discovery KH rules

---

### `tiletypes-command`
**Syntax:** `tiletypes-command <command> [; <command> ...]`  
**Plus:** `tiletypes-here [--cursor <x>,<y>,<z>] [-q]` and `tiletypes-here-point [--cursor <x>,<y>,<z>] [-q]`  

**Paint/filter options:**
- Shape: `shape WALL|FLOOR|RAMP|STAIR_UP|STAIR_DOWN|STAIR_UPDOWN|FORTIFICATION|...`
- Material: `material STONE|SOIL|MINERAL|LAVA_STONE|PLANT|...`
- Special: `special NORMAL|SMOOTH|WORN_1|WORN_2|WORN_3|...`
- Specific stone: `stone MARBLE|GRANITE|...`
- Hidden: `hidden 0|1`
- Aquifer: `aquifer 0|1|2`

**Brush types:** `point`, `range <w> <h> [<d>]`, `block`, `column`  
**Remote via dfhack-run (tiletypes-command):** Yes — the `-command` variant is designed for scripted use  
**Coordinate option:** `--cursor <x>,<y>,<z>` removes need for in-game cursor  
**KH relevance:** MEDIUM — modify terrain for testing geographic discovery events

---

### `liquids-here`
**Syntax:** `liquids-here` (uses settings from prior `liquids` session)  
**Note:** `liquids` itself is interactive terminal-only. `liquids-here` can be called via keybind or dfhack-run after configuring settings.  
**Remote via dfhack-run:** Partially — requires prior `liquids` configuration session  
**Better alternative:** `source` script for simple single-tile liquid spawning

---

### `changelayer`
**Syntax:** `changelayer <material_id> [all_biomes] [all_z-levels]`  
**Description:** Change the material of an entire geology layer.  
**Remote via dfhack-run:** Yes

---

### `changevein`
**Syntax:** `changevein <material_id>`  
**Description:** Change material of a mineral vein at the cursor.  
**Remote via dfhack-run:** Yes (with cursor)

---

### `plant`
**Syntax:** `plant grow [all]` / `plant shrubs` / `plant trees`  
**Description:** Grow or remove vegetation.  
**Remote via dfhack-run:** Yes

---

### `regrass`
**Syntax:** `regrass`  
**Description:** Regrow grass and moss on all appropriate tiles.  
**Remote via dfhack-run:** Yes

---

### `tubefill`
**Syntax:** `tubefill [hollow]`  
**Description:** Replenish depleted adamantine tubes. `hollow` leaves the interior hollow.  
**Remote via dfhack-run:** Yes

---

## Category 4: Information Queries

### `prospect`
**Syntax:** `prospect [all] [--show <options>]`  
**Description:** Resource analysis — lists ores, gems, soils, flux stone, aquifers.  
- `prospect all` — includes hidden/undug tiles (uses memory scan, not in-game knowledge)
- Options control which resource types are shown

**Remote via dfhack-run:** Yes — outputs to console/stdout  
**KH relevance:** HIGH — query raw map resources independent of discovery state; compare with KH-filtered view

---

### `probe`
**Syntax:** `probe [--cursor <x>,<y>,<z>]`  
**Related:** `bprobe` (building properties), `cprobe` (unit properties including worn item IDs)  
**Remote via dfhack-run:** Yes (with `--cursor` option, no active cursor required)  
**KH relevance:** MEDIUM — inspect tile properties for verification

---

### `position`
**Syntax:** `position`  
**Description:** Reports cursor position, window size, mouse location, world coordinates of site, adventurer coordinates.  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — coordinate utility

---

### `list-waves`
**Syntax:** `list-waves [<wave_num> ...] [--no-dead] [--granularity years|seasons|months|days] [--no-names] [--no-petitioners] [--unit <id>]`  
**Description:** Show migration wave membership, arrival times, wave numbers. Wave 0 = founding dwarves.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — introspect population history for KH scope initialization

---

### `showmood`
**Syntax:** `showmood`  
**Description:** Displays all items needed for the currently active strange mood.  
**Remote via dfhack-run:** Yes

---

### `allneeds`
**Syntax:** `allneeds [--sort id|strength|focus|freq]`  
**Description:** Summarize cumulative needs of selected unit or entire fort.  
**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — query need fulfillment for KH narrative triggers

---

### `deathcause`
**Syntax:** `deathcause` (selected corpse) or Lua: `deathcause.getDeathCause(unit_or_hfig)` → string  
**Description:** Returns cause of death string for corpse/body part/historical figure.  
**Remote via dfhack-run:** Via Lua API; `dfhack-run lua "require('deathcause').getDeathCause(...)"`  
**KH relevance:** HIGH — query death details for KH death revelation enrichment

---

### `devel/export-map`
**Syntax:** `devel/export-map [include|exclude] [options]`  
**Output:** JSON file with all tile data (tiletype, shape, material, hidden, light, aquifer, liquid, flow, evilness)  
**Warning:** Freezes game for minutes on large maps  
**Options:** `--tiletype`, `--shape`, `--special`, `--variant`, `--hidden`, `--light`, `--subterranean`, `--outside`, `--aquifer`, `--material`, `--liquid`, `--flow`, `--underworld`, `--evilness`  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — bulk export map discovery state for KH geographic scope analysis

---

### `exportlegends`
**Syntax:** `exportlegends` (also triggered by vanilla "Export XML" button in legends mode)  
**Description:** Exports extended legends data beyond vanilla XML — designed for Legends Browser.  
**Requirement:** Must be in legends mode (`open-legends` first — but note ONE-WAY warning)  
**Remote via dfhack-run:** Yes (when in legends mode)  
**KH relevance:** VERY HIGH — the primary data source for Chronicler Phase 1; also useful for snapshot comparisons

---

### Lua execution (inline)
**Syntax (dfhack-run):** `dfhack-run lua '<lua code>'` — NO colon prefix
**Syntax (DFHack console):** `:lua <expression>` — colon prefix for console only
**Description:** Execute arbitrary Lua code. When using `dfhack-run`, pass code directly without the `:` prefix.
**Remote via dfhack-run:** Yes (VERIFIED 2026-03-19)
**KH relevance:** VERY HIGH — the ultimate escape hatch; can query or mutate any df.global structure

**Key Lua query patterns (dfhack-run form):**
```lua
-- Unit list
dfhack-run lua 'for _,u in ipairs(df.global.world.units.active) do print(u.id, u.name.first_name) end'

-- Pause state
dfhack-run lua 'print(dfhack.world.ReadPauseState())'

-- Current time (VERIFIED: returns year, tick, pause_state)
dfhack-run lua 'print(dfhack.world.ReadCurrentYear(), dfhack.world.ReadCurrentTick())'

-- World info
dfhack-run lua 'local w=df.global.world.world_data print(w.name.first_word)'

-- Unit skills
dfhack-run lua 'local u=df.global.world.units.active[0] for _,s in ipairs(u.status.current_soul.skills) do print(s.id, s.rating) end'
```

---

## Category 5: Game Flow Control

### `fpause`
**Syntax:** `fpause`  
**Description:** Force the game to pause immediately.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — pause before complex state modifications

---

### `dfhack.world.SetPauseState(bool)` (Lua API)
**Via:** `dfhack-run lua ":dfhack.world.SetPauseState(true)"`  
**Remote:** Yes  
**KH relevance:** HIGH — programmatic pause/unpause

---

### `setfps`
**Syntax:** `setfps <n>`  
**Description:** Set the graphics FPS limit. Note: NEVER set to 0 (freezes game loop permanently).  
**Remote via dfhack-run:** Yes

---

### `timestream`
**Syntax:** `timestream [-fps <n>]`  
**Description:** Resolve FPS death by controlling simulation speed independently of graphics FPS. Safe alternative to `setfps` for speed control.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — accelerate game time for KH scenario testing without display overhead

---

### `repeat`
**Syntax:** `repeat [--name <n>] --time <delay> [--timeUnits frames|ticks|days|months|years] --command [ <command> ... ]`  
**Description:** Run a command periodically. `repeat --name <n>` (with no `--command`) cancels the named timer.  
**Time units:** `frames` (raw FPS), `ticks` (simulation ticks, paused doesn't count), `days`/`months`/`years` (in-world time)  
**Example:** `repeat --name orders-sort --time 600 --timeUnits ticks --command [ orders sort ]`  
**Remote via dfhack-run:** Yes — the core mechanism of the Chronicler bridge  
**KH relevance:** HIGH — schedule periodic KH revelation checks

---

### `quicksave`
**Syntax:** `quicksave`  
**Keybind:** Ctrl+Alt+S  
**Description:** Immediately autosave. Game keeps last 3 autosaves.  
**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — save before destructive KH tests

---

### `die`
**Syntax:** `die`  
**Description:** Exit DF without saving.  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — emergency exit; use with caution

---

### `sc-script`
**Syntax:** `sc-script add|remove|list <state> <script>` or `sc-script clear <state>`  
**States:** `SC_DFHACK_LOADED`, `SC_WORLD_LOADED`, `SC_WORLD_UNLOADED`, `SC_MAP_LOADED`, `SC_MAP_UNLOADED`, `SC_VIEWSCREEN_CHANGED`  
**Description:** Execute commands/scripts on game state changes.  
**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — hook into map load/unload for automatic KH initialization

---

## Category 6: Legends and History

### `exportlegends`
(See Category 4 above)

### `open-legends`
**Syntax:** `open-legends [--no-autoquit]`  
**WARNING:** ONE-WAY TRIP — entering legends mode from fort/adventure mode corrupts world data in subtle ways. Save first.  
**Remote via dfhack-run:** Yes (triggers mode switch)  
**KH relevance:** LOW — use only for dedicated export sessions, not during live fort play

### `deathcause`
(See Category 4 above)

### `list-waves`
(See Category 4 above)

---

## Category 7: Military

### `dfhack.military` Lua API
**Via `dfhack-run lua`:**
- `dfhack.military.makeSquad(assignment_id)` → squad object
- `dfhack.military.addToSquad(unit_id, squad_id, squad_pos)` → bool
- `dfhack.military.removeFromSquad(unit_id)` → bool
- `dfhack.military.getSquadName(squad_id)` → string
- `dfhack.military.updateRoomAssignments(squad_id, assignment_id, squad_use_flags)`

**Remote via dfhack-run:** Yes (via `:lua`)  
**KH relevance:** HIGH — squad creation/destruction triggers KH military events

### `forceequip`
**Syntax:** `forceequip [--unit <id>] [--item <id>] [--ignore-constraints]`  
**Description:** Move items from floor/container into a unit's inventory/hands.  
**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — equipment setup utility

---

## Category 8: Economy and Trade

### `caravan`
**Syntax:**
- `caravan [list]` — display caravan IDs and info
- `caravan extend [<days> [<ids>]]` — extend stay (default +7 days)
- `caravan happy [<ids>]` — restore willingness to trade
- `caravan leave [<ids>]` — force immediate departure
- `caravan unload` — resolve unloading issues

**Remote via dfhack-run:** Yes  
**KH relevance:** HIGH — trigger caravan events, extend for trading scenarios, test KH trade partner revelation

### `orders`
**Syntax:**
- `orders list` — list exported orders and library
- `orders export <name>` — save current orders to file
- `orders import <name>` — import orders (additive)
- `orders clear` — delete all manager orders
- `orders recheck [this]` — re-evaluate order conditions
- `orders sort` — sort by repeat frequency

**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — production management

### `workorder`
**Syntax:**
- `workorder <jobtype> [<amount>]` — simple job
- `workorder <json>` — full JSON specification
- `workorder --file <filename>` — from dfhack-config/workorder/
- `workorder -l <filter>` — list job types

**Remote via dfhack-run:** Yes  
**KH relevance:** LOW — production utility

---

## Category 9: Modtools Family

All `modtools/*` commands are designed for mod scripting and are fully scriptable via `dfhack-run`.

| Command | Description |
|---------|-------------|
| `modtools/add-syndrome` | Add/remove syndromes from units (full docs in Category 2) |
| `modtools/create-unit` | Full unit creation API (full docs in Category 2) |
| `modtools/create-item` | Create items via reaction-raw syntax |
| `modtools/if-entity` | Execute commands conditionally by civ entity type |
| `modtools/item-trigger` | Register callbacks on item use |
| `modtools/moddable-gods` | Create deities |
| `modtools/skill-change` | Modify unit skills by token name |
| `modtools/spawn-liquid` | Spawn liquid at map tile |

### `modtools/skill-change`
**Syntax:** `modtools/skill-change --unit <id> --skill <SKILL_TOKEN> --delta <n>` (or `--value <n>`)  
**Remote via dfhack-run:** Yes  
**KH relevance:** MEDIUM — skill modification for test scenario setup

### `modtools/create-item`
**Syntax:** `modtools/create-item -itemType <ITEM_TYPE> -material <MAT> [-quantity <n>] [-unit <id>] [-location [ x y z ]]`  
**Remote via dfhack-run:** Yes

---

## Category 10: Automation Plugins (Queryable/Configurable Remotely)

These automation plugins can be enabled, configured, and queried via `dfhack-run`:

| Command | Description | Remote? |
|---------|-------------|---------|
| `autobutcher` | Auto-cull livestock | Yes |
| `autochop` | Auto-harvest trees | Yes |
| `autoclothing` | Auto work orders for clothing | Yes |
| `autodump` | Process dump-marked items | Yes |
| `autofarm` | Auto crop selection | Yes |
| `autolabor` | Auto job assignment | Yes |
| `autonestbox` | Auto assign nestboxes | Yes |
| `logistics` | Auto route stockpile items | Yes |
| `seedwatch` | Auto seed management | Yes |
| `tailor` | Auto clothing maintenance | Yes |
| `orders` | Manager order management | Yes |
| `stockpiles` | Import/export stockpile settings | Yes |

---

## Eventful API (Lua, for persistent scripts)

The `eventful` plugin exposes event callbacks in Lua. These are **not** `dfhack-run` commands — they are Lua API hooks registered in persistent scripts running inside DFHack.

### Subscription Pattern
```lua
local eventful = require('plugins.eventful')
eventful.onUnitDeath[script_name] = function(unit_id) ... end
```

### Known Event Types (from Stage 3.1 implementation in chronicler-bridge.lua v9)
The bridge already subscribes to these via `eventful`:
- `onUnitDeath` — fired when unit dies; callback receives `unit_id`
- `onItemCreated` — fired on item creation; receives `item_id`
- `onJobCompleted` — fired on job completion; receives `job`
- `onInvasion` — fired on invasion/army arrival
- `onSyndrome` — fired when syndrome applied

### Complete Eventful Event List (VERIFIED 2026-03-19 via live enumeration)
Bridge already uses: `onUnitDeath`, `onItemCreated`, `onJobCompleted`, `onInvasion`, `onSyndrome`

**Additional events available:**
- `onBuildingCreatedDestroyed` — building constructed/deconstructed (note: no "Or" in name)
- `onConstructionCreatedDestroyed` — construction changes (note: no "Or" in name)
- `onUnitNewActive` — new unit becomes active (migration arrival, birth)
- `onUnitAttack` — unit attacks another unit
- `onInventoryChange` — unit equipment/inventory changes (NOT "onEquipmentChange")
- `onInteraction` — interaction between units
- `onReport` — new announcement/report generated
- `onJobInitiated` — job starts being assigned
- `onJobStarted` — job execution begins
- `onReactionCompleting` — reaction about to complete
- `onReactionComplete` — reaction finished
- `onItemContaminateWound` — item contaminates a wound
- `onProjUnitCheckMovement` — projectile (unit-targeted) movement check
- `onProjUnitCheckImpact` — projectile (unit-targeted) impact check
- `onProjItemCheckMovement` — projectile (item-targeted) movement check
- `onProjItemCheckImpact` — projectile (item-targeted) impact check

**Utility functions also in module:** `enableEvent`, `registerReaction`, `registerSidebar`, `addReactionToShop`, `removeNative`, `postWorkshopFillSidebarMenu`, `onWorkshopFillSidebarMenu`, `onUnload`, `_registeredStuff`, `eventType`

### Query valid event types
```lua
dfhack-run lua 'for k,v in pairs(require("plugins.eventful")) do print(k) end'
```

---

## Lua API Quick Reference (via `dfhack-run lua ":<code>"`)

### dfhack.world
| Function | Returns |
|----------|---------|
| `ReadPauseState()` | bool |
| `SetPauseState(bool)` | — |
| `ReadCurrentYear()` | int |
| `ReadCurrentMonth()` | int (0-11) |
| `ReadCurrentDay()` | int (1-28) |
| `ReadCurrentTick()` | int |
| `ReadCurrentWeather()` | weather_type enum |
| `SetCurrentWeather(type)` | — |
| `isFortressMode()` | bool |
| `isAdventureMode()` | bool |
| `getCurrentSite()` | world_site or nil |

### dfhack.units (VERIFIED 2026-03-19 — 130+ functions; key subset below)

**Core identity/status:**
| Function | Returns |
|----------|---------|
| `getReadableName(unit)` | string (VERIFIED) |
| `getVisibleName(unit)` | string |
| `getPosition(unit)` | x, y, z or nil |
| `getAge(unit)` | float |
| `getProfession(unit)` | profession_id |
| `getProfessionName(unit)` | string (VERIFIED) |
| `getCasteProfessionName(unit)` | string |
| `getCasteProfessionColor(unit)` | color |
| `getIdentity(unit)` | identity object |
| `getStressCategory(unit)` | int |
| `getStressCategoryRaw(unit)` | int |
| `getStressCutoffs()` | table |
| `getKillCount(unit)` | int |

**State predicates (all return bool, VERIFIED `isCitizen`):**
| Function | Description |
|----------|-------------|
| `isCitizen(unit)` | Is fortress citizen |
| `isActive(unit)` | Is in active unit list |
| `isAlive(unit)` | Is alive |
| `isDead(unit)` | Is dead |
| `isSane(unit)` | Is sane |
| `isVisible(unit)` | Is visible on map |
| `isAdult(unit)` | Is adult age |
| `isChild(unit)` | Is child |
| `isBaby(unit)` | Is baby |
| `isMale(unit)` / `isFemale(unit)` | Sex check |
| `isDwarf(unit)` | Is dwarf race |
| `isAnimal(unit)` | Is animal |
| `isVisitor(unit)` / `isVisiting(unit)` | Visitor status |
| `isResident(unit)` | Is long-term resident |
| `isMerchant(unit)` / `isDiplomat(unit)` | Trade/diplomacy |
| `isInvader(unit)` | Is hostile invader |
| `isGhost(unit)` | Is ghost |
| `isUndead(unit)` | Is undead |
| `isHunter(unit)` / `isWar(unit)` | Military animal |
| `isPet(unit)` / `isTame(unit)` | Pet/tamed status |
| `isDomesticated(unit)` | Domesticated animal |
| `isOwnCiv(unit)` / `isOwnGroup(unit)` / `isOwnRace(unit)` | Affiliation |
| `isFortControlled(unit)` | Under fort control |
| `isWildlife(unit)` | Wild creature |
| `isDanger(unit)` / `isGreatDanger(unit)` | Threat level |
| `isMegabeast(unit)` / `isSemiMegabeast(unit)` / `isTitan(unit)` | Megabeast/titan |
| `isDemon(unit)` / `isForgottenBeast(unit)` | Demon/FB |
| `isNightCreature(unit)` / `isBloodsucker(unit)` | Night creature |
| `isOpposedToLife(unit)` | Opposed to life |
| `isCrazed(unit)` / `isAgitated(unit)` | Crazed/agitated |
| `isHidingCurse(unit)` | Hiding a curse |
| `isNaked(unit)` | No clothing |
| `isGay(unit)` | Orientation |
| `isGeldable(unit)` / `isGelded(unit)` | Gelding status |
| `isEggLayer(unit)` / `isEggLayerRace(unit)` | Egg laying |
| `isGrazer(unit)` / `isMilkable(unit)` | Grazer/milkable |
| `isMarkedForSlaughter/Training/HuntTraining/WarTraining/Gelding/Taming(unit)` | Labor marks |

**Manipulation:**
| Function | Returns |
|----------|---------|
| `teleport(unit, pos)` | — |
| `setNickname(unit, nick)` | — |
| `create(race, caste)` | unit |
| `makeown(unit)` | — |
| `getCitizens([excl_residents[, incl_insane]])` | table of units |
| `assignTrainer(unit)` / `unassignTrainer(unit)` | — |
| `setLaborValidity(unit)` | — |
| `setAutomaticProfessions(unit)` | — |
| `setPathGoal(unit)` | — |
| `setActionTimers(unit)` / `multiplyActionTimers(unit)` / `subtractActionTimers(unit)` | — |
| `setGroupActionTimers(unit)` / `multiplyGroupActionTimers(unit)` / `subtractGroupActionTimers(unit)` | — |

**Skills:**
| Function | Returns |
|----------|---------|
| `getNominalSkill(unit, skill)` | int |
| `getEffectiveSkill(unit, skill)` | int |
| `getExperience(unit)` | int |
| `isJobAvailable(unit)` | bool |
| `isValidLabor(unit)` | bool |

**Race/caste helpers:**
| Function | Returns |
|----------|---------|
| `getRaceName(unit)` / `getRaceNameById(id)` | string |
| `getRaceNamePlural(unit)` / `getRaceNamePluralById(id)` | string |
| `getRaceReadableName(unit)` / `getRaceReadableNameById(id)` | string |
| `getRaceBabyName(unit)` / `getRaceBabyNameById(id)` | string |
| `getRaceChildName(unit)` / `getRaceChildNameById(id)` | string |
| `getCasteRaw(unit)` | raw data |
| `casteFlagSet(unit)` | flags |

**Misc:**
| Function | Returns |
|----------|---------|
| `getNoblePositions(unit)` | table |
| `getUnitsByNobleRole(role)` | table |
| `getUnitByNobleRole(role)` | unit |
| `getNemesis(unit)` | nemesis |
| `getSpecificRef(unit)` | ref |
| `getGeneralRef(unit)` | ref |
| `getOuterContainerRef(unit)` | ref |
| `getContainer(unit)` | container |
| `getUnitsInBox(x1,y1,z1,x2,y2,z2)` | table |
| `isUnitInBox(unit,x1,y1,z1,x2,y2,z2)` | bool |
| `getFocusPenalty(unit)` | int |
| `getGoalType(unit)` | type |
| `getGoalName(unit)` | string |
| `isGoalAchieved(unit)` | bool |
| `getMiscTrait(unit)` | trait |
| `getMainSocialEvent(unit)` / `getMainSocialActivity(unit)` | event/activity |
| `hasUnbailableSocialActivity(unit)` | bool |
| `isMischievous(unit)` | bool |
| `computeMovementSpeed(unit)` | int |
| `computeSlowdownFactor(unit)` | float |
| `getProfessionColor(unit)` | color |
| `hasExtravision(unit)` | bool |
| `isForest(unit)` | bool |
| `isAvailableForAdoption(unit)` | bool |
| `isTrainableWar(unit)` / `isTrainableHunting(unit)` / `isTamable(unit)` | bool |
| `isHidden(unit)` | bool |
| `isKilled(unit)` | bool |
| `isTrained(unit)` | bool |
| `getMentalAttrValue(unit)` / `getPhysicalAttrValue(unit)` | int |

### dfhack.maps
| Function | Returns |
|----------|---------|
| `getSize()` | x, y, z (blocks) |
| `getTileSize()` | x, y, z (tiles) |
| `getBlock(x,y,z)` | map_block or nil |
| `isValidTilePos(x,y,z)` | bool |
| `isTileVisible(coords)` | bool |
| `getTileBlock(coords)` | map_block |

### dfhack.items
| Function | Returns |
|----------|---------|
| `getOwner(item)` | unit or nil |
| `getPosition(item)` | x, y, z or nil |
| `moveToGround(item, pos)` | bool |
| `moveToContainer(item, container)` | bool |
| `moveToInventory(item, unit)` | bool |
| `remove(item)` | — |
| `getValue(item)` | int |
| `canTrade(item)` | bool |
| `markForTrade(item, depot)` | — |

### dfhack.military
| Function | Returns |
|----------|---------|
| `makeSquad(assignment_id)` | squad |
| `addToSquad(unit_id, squad_id, pos)` | bool |
| `removeFromSquad(unit_id)` | bool |
| `getSquadName(squad_id)` | string |

### dfhack.run_command (from within Lua)
```lua
dfhack.run_command('force', 'Caravan')        -- returns command_result
dfhack.run_command_silent('strangemood', '--force')  -- returns output, result
```

---

## Comparison Table: Commands by Chronicler/KH Relevance

| Command | Category | Remote? | KH Relevance | Primary Use |
|---------|----------|---------|--------------|-------------|
| `force Caravan/Migrants/Megabeast` | Events | Yes | VERY HIGH | Trigger KH revelation events |
| `strangemood --force --id <id>` | Events | Yes | HIGH | Artifact creation KH test |
| `spawnunit` | Unit | Yes | VERY HIGH | Place test units for scope testing |
| `modtools/create-unit` | Unit | Yes | VERY HIGH | Full-spec unit creation |
| `teleport` | Unit | Yes | VERY HIGH | Position units for geographic scope |
| `exterminate` | Unit | Yes | HIGH | Trigger death revelation rules |
| `diplomacy` | World | Yes | HIGH | Trigger war/peace revelation |
| `reveal` | Map | Yes | VERY HIGH | Full map visibility for KH geographic tests |
| `reveal-hidden-units` | Map | Yes | HIGH | Expose ambushes for army KH tests |
| `reveal-hidden-sites` | Map | Yes | HIGH | Test site discovery KH |
| `assign-*` family | Unit | Yes | HIGH | Configure test unit profiles |
| `assign-profile` | Unit | Yes | HIGH | Batch profile application |
| `modtools/add-syndrome` | Unit | Yes | HIGH | Test syndrome revelation |
| `caravan extend/happy` | Economy | Yes | HIGH | Trade scenario control |
| `exportlegends` | Legends | Yes | VERY HIGH | Legends data extraction |
| `devel/export-map` | Query | Yes | HIGH | Map state snapshot |
| `prospect` | Query | Yes | HIGH | Resource vs. KH-known comparison |
| `list-waves` | Query | Yes | HIGH | Population history |
| `timestream` | Flow | Yes | HIGH | Accelerated game time for testing |
| `repeat` | Flow | Yes | VERY HIGH | Bridge scheduling mechanism |
| `quicksave` | Flow | Yes | MEDIUM | Pre-test save points |
| `fpause` + SetPauseState | Flow | Yes | HIGH | State freeze for modifications |
| `sc-script` | Flow | Yes | HIGH | Map load hooks |
| `full-heal -r` | Unit | Yes | MEDIUM | Resurrect for repeat scenarios |
| `:lua df.global.*` | Query | Yes | VERY HIGH | Direct game state access |
| `eventful` callbacks | Events | Lua only | VERY HIGH | Real-time event capture |
| `gui/*` | GUI | NO | n/a | Requires interactive window |
| `open-legends` | Legends | Yes | LOW | One-way trip; avoid in live fort |

---

## Recommendations for Chronicler KH Testing Infrastructure

1. **Primary event trigger:** `force` + `migrants-now` cover 80% of KH revelation test scenarios. Use `dfhack-run force Caravan` / `dfhack-run force Megabeast` as the core of the test harness.

2. **Unit scenario construction:**
   - Use `spawnunit <RACE> <CASTE>` for quick unit placement
   - Use `modtools/create-unit -race <R> -location [ x y z ] -civId <id> -skills [ ... ]` for precise scenario units (verify it works in 53.11 first — it carries "unavailable" tag)
   - Use `assign-profile` with a JSON profile library for repeatable test dwarf configurations

3. **KH scope testing pattern:**
   ```
   dfhack-run fpause
   dfhack-run teleport --unit <id> -x <x> -y <y> -z <z>
   dfhack-run lua 'dfhack.world.SetPauseState(false)'
   [wait N ticks]
   dfhack-run fpause
   [query KH state via: dfhack-run lua 'print(...)']
   ```

4. **Death revelation testing:** `exterminate --unit <id>` is cleanest for targeted kills. Use `full-heal -r --unit <id>` to resurrect and reset.

5. **Map visibility:** `reveal` before KH geographic tests to ensure no "undiscovered" tile confusion. `unreveal` after to restore normal state.

6. **Accelerated time:** Use `timestream -fps 100` (or higher) to advance game time rapidly without FPS-death risk. Never `setfps 0`.

7. **Event capture:** The Stage 3.1 `eventful` subscriptions in `chronicler-bridge.lua` already capture death/item/job/invasion/syndrome events. Extend with `onUnitNewActive` for migration arrival and `onBuildingCreatedDestroyed` for construction KH events.

8. **Game-blocking pause/popup dismissal (VERIFIED 2026-03-19 end-to-end):** Three distinct mechanisms can block game progression. Each requires a different dismissal approach:

   ### Mechanism A: Announcement Popups (`world.status.popups`)
   **Trigger:** Caravan arrival, important events, `showPopupAnnouncement()`
   **Symptoms:** Game won't advance despite `pause_state=false`. Focus = `dwarfmode/Default`. `#world.status.popups > 0`.
   **This is the most insidious blocker** — focus string looks normal, pause state looks normal, but the game loop won't advance ticks.

   **Detection + Dismissal (VERIFIED — unblocked live game):**
   ```lua
   dfhack-run lua 'local ps=df.global.world.status.popups; print("popups: " .. #ps); while #ps > 0 do ps:erase(0) end; df.global.world.status.display_timer=0; print("cleared")'
   ```

   ### Mechanism B: Season Boundary Pause (`pause_state` flag)
   **Trigger:** Season change when `d_init.announcements.flags.SEASON_<name>.PAUSE = true`
   **Symptoms:** Game paused, tick at exact boundary (100800/201600/302400/0). Focus = `dwarfmode/Default`. popups = 0.
   **VERIFIED:** Enabled SEASON_WINTER.PAUSE, crossed boundary at tick 302,408 — game force-paused, zero popups, focus normal.

   **Detection:**
   ```lua
   dfhack-run lua 'print(df.global.pause_state, #df.global.world.status.popups)'
   -- If pause=true, popups=0, focus=dwarfmode/Default → season boundary pause
   ```

   **Dismissal (VERIFIED — successfully unpaused and resumed):**
   ```lua
   dfhack-run lua 'df.global.pause_state=false'
   ```

   **Query/modify season pause settings:**
   ```lua
   dfhack-run lua 'local af=df.global.d_init.announcements.flags; for _,s in ipairs({"SEASON_SPRING","SEASON_SUMMER","SEASON_AUTUMN","SEASON_WINTER"}) do print(s .. " PAUSE=" .. tostring(af[s].PAUSE)) end'
   ```

   ### Mechanism C: Viewscreen Overlays (gui/*, open-legends)
   **Trigger:** `open-legends`, `gui/*` commands, some export commands
   **Symptoms:** Focus != `dwarfmode/Default`. Viewscreen stack has child on top of dwarfmodest.

   **Detection:**
   ```lua
   dfhack-run lua 'local f=dfhack.gui.getCurFocus(true); for _,v in ipairs(f) do print(v) end'
   ```
   Normal = `dwarfmode/Default`. Anything else = overlay active.

   **Dismissal (send ESC / LEAVESCREEN):**
   ```lua
   dfhack-run lua 'local scr=dfhack.gui.getCurViewscreen(); dfhack.screen._doSimulateInput(scr, {df.interface_key.LEAVESCREEN})'
   ```

   **Robust dismiss-all loop:**
   ```lua
   dfhack-run lua 'for i=1,10 do local f=dfhack.gui.getCurFocus(true); if f[1]=="dwarfmode/Default" then break end; dfhack.screen._doSimulateInput(dfhack.gui.getCurViewscreen(), {df.interface_key.LEAVESCREEN}) end; print(dfhack.gui.getCurFocus(true)[1])'
   ```

   ### Universal "unblock game" function (handles all 3 mechanisms)
   ```lua
   dfhack-run lua 'local ps=df.global.world.status.popups; while #ps>0 do ps:erase(0) end; df.global.world.status.display_timer=0; for i=1,10 do local f=dfhack.gui.getCurFocus(true); if f[1]=="dwarfmode/Default" then break end; dfhack.screen._doSimulateInput(dfhack.gui.getCurViewscreen(), {df.interface_key.LEAVESCREEN}) end; df.global.pause_state=false; print("focus:" .. dfhack.gui.getCurFocus(true)[1] .. " tick:" .. dfhack.world.ReadCurrentTick())'
   ```

   **Key APIs (all VERIFIED):**
   - `dfhack.gui.getCurFocus(true)` → table of focus strings
   - `dfhack.gui.getCurViewscreen()` → current viewscreen object
   - `dfhack.screen._doSimulateInput(scr, {key})` → send keypress to viewscreen
   - `dfhack.screen.dismiss(scr)` → programmatically dismiss a viewscreen
   - `dfhack.screen.isDismissed(scr)` → check if already dismissed
   - `df.interface_key.LEAVESCREEN` → ESC key code (value: 5)
   - `df.global.world.status.popups` → announcement popup queue
   - `df.global.world.status.display_timer` → popup display countdown
   - `df.global.d_init.announcements.flags.<TYPE>.PAUSE` → per-announcement-type pause setting

   **Known overlay-triggering commands:**
   - `open-legends` — WARNING: one-way trip, corrupts fort state
   - `gui/*` family — ALL require interactive GUI
   - `exportlegends` — opens legends export overlay
   - Caravan arrival announcements (Mechanism A popup)

---

## Action Items

- [x] Verify `modtools/create-unit` functional status in 53.11-r2 — **DONE**: shows "UNTESTED WARNING", bypass by running twice
- [x] Enumerate complete `eventful` event list — **DONE**: 28 entries captured (16 event callbacks + 12 utility functions)
- [x] Verify `dfhack.units` API completeness — **DONE**: 130+ functions enumerated, table expanded
- [x] Verify `:lua` vs `dfhack-run lua` syntax difference — **DONE**: colon prefix is console-only
- [ ] Build a `dfhack-config/assign-profile/kh-test-profiles.json` with profiles for each KH scope tier (denizen, family, geographic, civilization)
- [ ] Add `onUnitNewActive` and `onBuildingCreatedDestroyed` eventful subscriptions to bridge v10
- [ ] Create a `kh-test-harness.lua` script that orchestrates: pause → place units → configure relationships → unpause → wait N ticks → capture KH state → report
- [ ] Document that `open-legends` is a one-way trip and must never be called during live fort sessions
- [ ] Test `spawnunit` and `exterminate` on a quicksaved fort (avoid live fort state changes)
- [ ] Verify `dfhack.units.makeown(unit)` works headlessly via Lua (no GUI selection required)
- [x] Document overlay/popup dismissal technique — **DONE**: 3 mechanisms identified and documented (popups, season pause, viewscreen overlays) with universal "unblock game" function, all verified end-to-end

---

## Sources

1. [DFHack 53.11-r2 Documentation Home](https://docs.dfhack.org/en/stable/index.html)
2. [DFHack Tools Index (all-tag-index)](https://docs.dfhack.org/en/stable/all-tag-index.html)
3. [DFHack Tools Reference](https://docs.dfhack.org/en/stable/docs/Tools.html)
4. [DFHack Core (dfhack-run, lua, multicmd)](https://docs.dfhack.org/en/stable/docs/Core.html)
5. [DFHack Lua API Reference](https://docs.dfhack.org/en/stable/docs/dev/Lua%20API.html)
6. [force command](https://docs.dfhack.org/en/stable/docs/tools/force.html)
7. [modtools/create-unit](https://docs.dfhack.org/en/stable/docs/tools/modtools/create-unit.html)
8. [modtools/add-syndrome](https://docs.dfhack.org/en/stable/docs/tools/modtools/add-syndrome.html)
9. [assign-profile](https://docs.dfhack.org/en/stable/docs/tools/assign-profile.html)
10. [spawnunit](https://docs.dfhack.org/en/53.10-r1/docs/tools/spawnunit.html)
11. [eventful documentation](https://docs.dfhack.org/en/stable/docs/tools/eventful.html)
12. [repeat command](https://docs.dfhack.org/en/50.11-r4/docs/tools/repeat.html)
13. [DFHack scripts GitHub repository](https://github.com/DFHack/scripts/blob/master/repeat.lua)
14. [Dwarf Fortress Wiki: DFHack](https://dwarffortresswiki.org/index.php/Utility:DFHack)

---

## Uncertainties (updated 2026-03-19 after live validation)

- ~~`modtools/create-unit` is tagged "unavailable" in 53.11-r2~~ **RESOLVED**: Shows "UNTESTED WARNING" on first run; run twice to bypass. Not actually broken.
- ~~The complete `eventful` event list requires in-game introspection~~ **RESOLVED**: Full 28-entry enumeration captured (see Category: Eventful API above).
- `tiletypes-here` and `liquids-here` require cursor position; the `--cursor` option on `tiletypes-command` bypasses this, but `liquids-here` does not have an equivalent coordinate parameter
- `makeown` docs say it requires selected unit — whether `dfhack.units.makeown(unit)` Lua call works headlessly needs verification (likely yes based on API pattern)
- `spawnunit` — not yet tested in 53.11-r2 live (testing deferred to avoid state changes on live fort)

---

## Related Topics

- Stage 3.3 Knowledge Horizon implementation (knowledge_horizon table + visible_* views)
- Bridge v10 eventful subscription expansion
- KH test harness automation design
- DFHack RPC protocol details (for potential direct TCP integration post-Prism)
