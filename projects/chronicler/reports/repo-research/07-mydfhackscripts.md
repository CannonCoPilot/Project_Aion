# Repository Research Report: myDFHackScripts

**Repository**: `GitRepos/myDFHackScripts`
**Author**: Community contributor
**Language**: Lua (DFHack scripts)
**Purpose**: Fortress event logging and statistics system running inside DFHack
**Files**: 29 Lua scripts + 1 features.txt + 1 sample log (4MB)

---

## Repository Overview

myDFHackScripts is a collection of DFHack Lua scripts that implement a comprehensive fortress event logging system. The core script (`FortressStatistics.lua`) orchestrates multiple domain-specific loggers that hook into DFHack's event system and periodic polling to record fortress events to a structured log file. This is the closest existing implementation to Chronicler's watcher daemon, but runs entirely within DFHack as Lua scripts.

---

## Architecture & Key Components

### Core Orchestrator (`FortressStatistics.lua`)
- Registers DFHack eventful callbacks: ITEM_CREATED, UNIT_DEATH, JOB_COMPLETED, INVASION
- Starts periodic watcher (500 tick interval) for polling-based detection
- Modules: AnnouncementLogger, ItemLogger, DeathLogger, JobLogger, InvasionLogger, AnnounceBooks, CitizenLogger, PetitionLogger
- Enable/disable via command argument

### Event-Driven Loggers

**DeathLogger** (`DeathLogger.lua`)
- Hooks `eventful.onUnitDeath`
- Captures: unit ID, readable name, race, age, death_cause (resolved from enum), killer name, killer race, killed-by-citizen flag
- Uses incident system to find killer (`getKillerIdbyVictimId`)

**ItemLogger** (`ItemLogger.lua`)
- Hooks `eventful.onItemCreated`
- Captures: item type, material, quality, maker, quantity

**JobLogger** (`JobLogger.lua`)
- Hooks `eventful.onJobCompleted`
- Captures job details from DFHack's job printing

**InvasionLogger** (`InvasionLogger.lua`)
- Hooks `eventful.onInvasion`
- Captures: civ_id, site_id, invasion size

### Polling-Based Loggers

**CitizenLogger** (`CitizenLogger.lua`)
- Polls `df.global.world.units.active` every 500 ticks
- Tracks citizen count changes (arrivals, departures/deaths)
- Logs new citizens with: id, name, race, age, sex
- Uses `Helper.watch()` generic watcher pattern

**AnnouncementLogger** (`AnnouncementLogger.lua`)
- Polls game announcements for new entries
- Detects announcement text changes

**AnnounceBooks** (`AnnounceBooks.lua`)
- Monitors for newly created written works (books, scrolls)
- Logs book details when detected

**PetitionLogger** (`PetitionLogger.lua`)
- Watches petition changes
- Detects new petitions and petition modifications

### Helper System (`Helper.lua`)
- `Helper.date()`: Read current day/month/year from `dfhack.world`
- `Helper.getMakerName()`: Resolve maker ID to readable name
- `Helper.watch()`: **Generic watcher pattern** — configurable periodic comparison of entity lists with delta detection
- `Helper.resolveEnum()`: Convert enum integer values to string names via `df[enum_name][value]`
- `Helper.getIncidentDeathCauseByVictimId()`: Navigate incident records to find death cause
- `Helper.getKillerIdbyVictimId()`: Navigate incident records to find killer
- `Helper.getNameOfKillerByVictimId()`: Get readable killer name
- `Helper.isUnitCitizen()`: Check if a unit is a fortress citizen

### Log Format
CSV-like structured log with tagged sections:
```
[UnitDeath],id,123,name,Urist McAxedwarf,race,DWARF,death_cause,OLD_AGE,killer,unknown,killed_by_citizen,false,killer_race,unknown
[Citizens],type,countchange,from,48,to,49
[Citizens],type,newcitizen,id,456,name,Ablel Mörulzokun,race,DWARF,age,28,sex,male
[Invasion],civ_id,7,site_id,3,size,20
```

### Feature Wishlist (`features.txt`)
Community-sourced feature ideas organized by category:

**Wealth**: Kills-by-dwarf, wealth produced per dwarf, imported/exported/created wealth tracking
**Artifacts**: Retrieved or created artifact tracking
**Items**: Masterwork counts by type, most used materials, production trends, most valuable item, food/alcohol consumption
**Combat**: Most Valuable Warrior, siege tracking, forgotten beast/titan attacks
**Social**: Marriage, murder, death, birth, immigration, petitions
**Statistics**: Happiness trends over time, unhappy thought sources, skill progression, average bedroom quality, most common desires/preferences
**Advanced**: Ore/gem discovery logging, average wealth per dwarf, drinking stats, prayer frequency, story/song/dance participation, friend counts, subject discussion frequency, book count/most prolific writer, exercise leadership, immigration by civilization, entertainment group frequency, physical extremes (biggest/smallest), popularity, humor, crime reporting, criminal activity

### Visualization (`CurveWidget.lua`, `DiagramWindow.lua`, `newGui.lua`)
- Lua-based in-game graph rendering
- CurveWidget draws data curves on DFHack GUI overlays
- DiagramWindow provides chart containers
- Custom GUI framework for DFHack overlays

### Log Parser (`LogParser.lua`, 16KB)
- Parses the structured log file back into data structures
- Enables post-hoc analysis of logged events

### Material System (`MaterialHelper.lua`, 7KB)
- Material type resolution from item references
- Maps material IDs to readable names

---

## Extractable Features for Chronicler

### F-MS-01: Generic Watcher Pattern
- **User QoL**: Detect changes in any game entity list (citizens, items, buildings) by periodic comparison
- **Implementation**: `Helper.watch(getCurrentList, getKey, logChange, logNew, secondCondition)` — polls a list function, compares keys to known set, fires callbacks on additions/count changes/value changes. Configurable comparison function for detecting attribute changes.
- **Chronicler relevance**: Direct inspiration for the Python watcher's change detection loop; already similar to Chronicler's `watcher.py` but could be enhanced with the secondary condition pattern

### F-MS-02: Multi-Domain Event Logging
- **User QoL**: Simultaneously log deaths, items, jobs, invasions, citizen changes, announcements, books, petitions in a unified format
- **Implementation**: Modular logger architecture with per-domain scripts. Each logger is independent but shares `LogHandler` for output.
- **Chronicler relevance**: Validates the bridge's multi-section approach; the domain set (deaths, items, jobs, invasions, citizens, announcements, books, petitions) maps directly to bridge sections

### F-MS-03: Death Cause Resolution Chain
- **User QoL**: Determine not just that a unit died, but how and who killed them
- **Implementation**: `Helper.getIncidentDeathCauseByVictimId()` navigates the incident system. `Helper.getKillerIdbyVictimId()` follows killer references. Death cause resolved via `df.death_type` enum.
- **Chronicler relevance**: Rich death event detail for the Storyteller ("Urist McAxedwarf was killed by the goblin Stobash in combat")

### F-MS-04: Comprehensive Statistics Feature Set (from features.txt)
- **User QoL**: The community has identified 40+ statistics that players want to track — this is a validated feature wishlist
- **Implementation**: Not all implemented, but the wishlist provides community-validated feature priorities:
  - Wealth tracking (per-dwarf, imported/exported/created)
  - Combat statistics (most kills, most valuable warrior)
  - Social event tracking (marriage, birth, immigration)
  - Happiness analysis (trend over time, unhappy thought sources)
  - Skill progression
  - Production/consumption statistics
  - Superlative dwarves (biggest drinker, most popular, most prolific writer)
- **Chronicler relevance**: Feature prioritization for the Database Explorer and narrative generation; community validation of desired statistics

### F-MS-05: Enum Resolution Pattern
- **User QoL**: Convert internal game enum values to human-readable strings
- **Implementation**: `Helper.resolveEnum(k, v)` uses `df[enum_name][value]` to resolve any DFHack enum to its string name. Returns both the name and the numeric value for completeness.
- **Chronicler relevance**: Bridge Lua script should use this pattern for all enum fields; ensures human-readable data in the CDM

### F-MS-06: In-Game Visualization (Charts/Graphs)
- **User QoL**: See statistics as charts and graphs directly in the game interface
- **Implementation**: `CurveWidget.lua` (12KB) and `DiagramWindow.lua` implement curve/chart rendering in DFHack's GUI overlay system. Custom draw routines for axes, labels, data points.
- **Chronicler relevance**: While Chronicler uses a web UI, the data requirements for charts (time-series population, wealth curves, skill progression) are identical. The in-game overlay concept could be a future "DFHack companion plugin" feature.

### F-MS-07: Book/Written Content Monitoring
- **User QoL**: Get notified when dwarves write books, and see what they wrote
- **Implementation**: `AnnounceBooks.lua` (6KB) monitors for newly created written content, extracts title and content details.
- **Chronicler relevance**: Written content tracking for the cultural content tab; "What books have been written in this fortress?" query for Storyteller

### F-MS-08: Petition Tracking
- **User QoL**: Track all petitions to the fortress with their current status
- **Implementation**: `PetitionLogger.lua` uses the generic watcher pattern to detect petition changes.
- **Chronicler relevance**: Diplomatic event tracking; petition types (citizenship, residence, performances) inform narrative generation

### F-MS-09: Structured Log Format
- **User QoL**: Machine-parseable log format for post-game analysis
- **Implementation**: CSV-like format with section tags `[Category],key,value,key,value` enabling easy parsing.
- **Chronicler relevance**: The bridge JSON format is superior (structured, typed), but the domain categorization (UnitDeath, Citizens, Invasion) validates the bridge's section-based approach

---

## Key Insights

1. **myDFHackScripts proves that comprehensive fortress logging is achievable** entirely within DFHack's Lua environment
2. **The generic watcher pattern** (`Helper.watch()`) is a clean abstraction for change detection — Chronicler's Python watcher implements a similar but less generic approach
3. **The 40+ statistics from features.txt** represent genuine community demand — they should be treated as a validated feature list for Chronicler's Explorer
4. **Death cause resolution** requires navigating the incident system, not just the unit record — the Helper functions document the correct path
5. **The log format** (CSV-like) demonstrates that structured event data is the expected output — Chronicler's JSON bridge output is an evolution of this concept
6. **In-game visualization** is feasible via DFHack overlays — this could be a future companion feature (show Chronicler data directly in DF)
7. **The 4MB sample log** demonstrates that fortress logging generates significant data volume — confirms the need for Chronicler's database approach rather than flat files
