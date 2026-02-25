# Repository Research Report: DFHack Plugins & Scripts Reference

**Repository**: `GitRepos/dfhack-53.10-r1/plugins/` and `DwarfCron/repos/dfhack/scripts/`
**Purpose**: Catalog DFHack capabilities that Chronicler can leverage
**Scale**: 86 C++ plugins, 170+ Lua scripts

---

## DFHack Plugins Relevant to Chronicler

This is not a full analysis of every plugin but rather a catalog of the plugins and scripts whose capabilities are directly relevant to Chronicler's architecture and features.

### Data Access Plugins

| Plugin | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **RemoteFortressReader** | 41 RPC functions for reading map, units, buildings, items, materials | Primary data source for live fortress data (already integrated) |
| **exportlegends** | Export legends XML and legends_plus XML | Automated batch export trigger via `dfhack-run` |
| **dwarfmonitor** | Fortress statistics: happiness, food, drink, weather, activities | Statistics patterns; unit preference/activity tracking |
| **cursecheck** | Detect vampires, werebeasts, other cursed units | Curse detection for narrative enrichment |
| **autolabor** | Automatic labor assignment based on skills | Labor optimization algorithm reference |
| **labormanager** | More sophisticated labor assignment | Advanced labor optimization reference |
| **debug** | Debug output from any plugin | Logging patterns; error tracking |

### Automation Plugins (AI Player Reference)

| Plugin | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **autobutcher** | Automatic livestock management | Animal management algorithm for AI Player |
| **autochop** | Automatic tree designation | Resource management for AI Player |
| **autofarm** | Automatic farm plot management | Farming automation for AI Player |
| **autoclothing** | Automatic clothing production orders | Production queue management for AI Player |
| **buildingplan** | Building material selection automation | Construction planning for AI Player |
| **blueprint** | Blueprint import/export | Fortress layout management |
| **channel-safely** | Safe channel designation | Mining safety for AI Player |
| **autonestbox** | Automatic nest box assignment | Animal management for AI Player |
| **autoslab** | Automatic memorial slab engraving | Morale management for AI Player |

### UI/Monitoring Plugins

| Plugin | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **confirm** | Confirmation dialogs for dangerous actions | UI pattern for AI Player safety |
| **design** | Design overlay for building placement | UI overlay patterns |
| **dwarfvet** | Veterinary care monitoring | Health monitoring patterns |
| **edgescroll** | Map edge scrolling | UI interaction patterns |
| **dig-now** | Instant dig designation | Testing/speedrun utility |

### Data Modification Plugins

| Plugin | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **createitem** | Create items in the game world | Testing utility; mod integration |
| **changeitem** | Modify item properties | Item manipulation for AI Player |
| **changelayer** | Modify terrain layers | World modification capabilities |

---

## DFHack Lua Scripts Relevant to Chronicler

### Data Access Scripts

| Script | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **exportlegends.lua** | Orchestrates legends XML export | Automated export triggering |
| **deathcause.lua** | Resolves death causes with detail | Death narrative enrichment |
| **diplomacy.lua** | Inspect diplomatic state | Diplomatic data for Explorer |
| **caravan.lua** | Caravan interaction management | Trade event data |
| **forum-dwarves.lua** | Export fortress info as forum-format text | Text export format reference |

### Dwarf Management Scripts

| Script | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **assign-attributes.lua** | Modify dwarf attributes | Testing utility |
| **assign-beliefs.lua** | Modify dwarf beliefs | Testing utility; belief system reference |
| **assign-facets.lua** | Modify personality facets | Testing utility; personality reference |
| **assign-goals.lua** | Modify dwarf goals | Goal system reference |
| **assign-preferences.lua** | Modify dwarf preferences | Preference system reference |
| **assign-skills.lua** | Modify skill levels | Skill system reference |
| **assign-profile.lua** | Apply complete dwarf profile | Profile template reference |
| **dwarf-op.lua** | Batch operations on dwarves | Bulk operation patterns |
| **embark-skills.lua** | Configure embark skills | Embark skill reference |

### Fortress Management Scripts

| Script | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **animal-control.lua** | Animal management commands | Animal tracking reference |
| **ban-cooking.lua** | Ban items from cooking | Food management for AI Player |
| **burial.lua** | Burial management | Death handling for AI Player |
| **combine.lua** | Combine partial stacks | Inventory management |
| **control-panel.lua** | Script enable/disable panel | Configuration management reference |
| **forbid.lua** | Item forbid management | Inventory control patterns |
| **growcrops.lua** | Crop management | Farming data |
| **catsplosion.lua** | Population management | Testing utility |

### Information Scripts

| Script | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **allneeds.lua** | Display all dwarf needs | Need system reference |
| **gaydar.lua** | Display orientation data | Orientation data access |
| **full-heal.lua** | Full health restoration | Health system reference |

### GUI Overlay Scripts (gui/ directory)

| Script | Function | Chronicler Relevance |
|--------|----------|---------------------|
| **gui/unit-info-viewer** | Enhanced unit info display | Unit data presentation reference |
| **gui/pathable** | Pathability visualization | Map analysis reference |
| **gui/blueprint** | Blueprint creation overlay | Blueprint management |
| **gui/launcher** | Script launcher | Command execution patterns |

---

## Key DFHack APIs for Chronicler Development

### Units Module
```lua
dfhack.units.isCitizen(unit)       -- Check citizenship
dfhack.units.isAlive(unit)          -- Check alive status
dfhack.units.isDead(unit)           -- Check dead status
dfhack.units.getAge(unit)           -- Get age in years
dfhack.units.getRaceName(unit)      -- Get race string
dfhack.units.getReadableName(unit)  -- Get full readable name
dfhack.units.getVisibleName(unit)   -- Get visible name
dfhack.units.isMale(unit)           -- Check sex
dfhack.units.getStressCategory(unit)-- Stress level category
dfhack.units.getProfessionName(unit)-- Profession string
dfhack.units.getGoalName(unit, goal)-- Goal description
```

### Translation Module
```lua
dfhack.translation.translateName(name, in_english) -- Name translation
dfhack.df2utf(str)                  -- CP437 to UTF-8
```

### World Module
```lua
dfhack.world.ReadCurrentYear()      -- Current year
dfhack.world.ReadCurrentMonth()     -- Current month
dfhack.world.ReadCurrentDay()       -- Current day
dfhack.world.ReadCurrentTick()      -- Current tick
```

### GUI Module
```lua
dfhack.gui.showAnnouncement(text, color) -- Show announcement
dfhack.gui.getSelectedUnit()        -- Get selected unit
```

### Job Module
```lua
dfhack.job.printJobDetails(job)     -- Print job details
```

---

## Chronicler-Relevant DFHack Capability Summary

### Already Leveraged
- Lua scripting via `dfhack-run` over SSH
- `df.global` memory access for all game data
- `dfhack.timeout()` for repeat job scheduling
- `dfhack.translation.translateName()` for name resolution
- `dfhack.df2utf()` for CP437 encoding
- `dfhack.units.*` for unit data access
- HTTP server pattern for data export (bridge serves on port 8888)

### Available But Not Yet Used
- `eventful` callbacks (UNIT_DEATH, ITEM_CREATED, JOB_COMPLETED, INVASION, REPORT)
- `exportlegends` remote triggering for automated XML export
- `dwarfmonitor` statistics patterns
- `cursecheck` for curse detection
- `autolabor`/`labormanager` algorithms for labor optimization
- 170+ scripts providing Lua API usage examples
- `assign-*` scripts showing how to write data back to DF (for AI Player)

### Not Currently Possible (Prism Limitation)
- TCP RPC calls requiring game-thread dispatch (RemoteFortressReader's 41 functions)
- Core lock acquisition from network thread
- Plugin enable/disable via RPC

---

## Key Insights

1. **86 plugins + 170 scripts** = DFHack is an enormous capability platform; Chronicler currently uses a fraction of what's available
2. **eventful callbacks** could replace polling for death/item/job detection — more efficient than the current 500-tick poll approach
3. **The automation plugins** (autobutcher, autofarm, autolabor) are the foundation for an AI Player — their algorithms can be studied and reimplemented in Chronicler's LLM-driven decision system
4. **assign-* scripts** demonstrate that DFHack can WRITE to game state, not just read — this enables the AI Player to actually execute decisions
5. **labormanager** is more sophisticated than autolabor — its optimization algorithm is the reference for Chronicler's Labor Manager
6. **exportlegends** can be triggered remotely — enabling automated periodic XML re-export for incremental database updates
7. **The Lua API surface** (Units, Translation, World, GUI, Job modules) covers all data access needs for the bridge
