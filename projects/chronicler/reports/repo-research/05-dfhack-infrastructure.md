# Repository Research Report: DFHack Infrastructure (3 repos)

This report covers three DFHack-related repositories that provide infrastructure for interacting with Dwarf Fortress:

1. **dfhack-53.10-r1 / dfhack** (DFHack core — plugins, scripts, library)
2. **dfhack-client-python** (Python async RPC client)
3. **df-structures** (XML data structure definitions)

---

## dfhack-53.10-r1 / dfhack (DFHack Core)

**Repository**: `GitRepos/dfhack-53.10-r1` and `DwarfCron/repos/dfhack`
**Language**: C++ (core library, plugins), Lua (scripts)
**Purpose**: The modding framework for Dwarf Fortress — provides memory access, plugin system, scripting, and RPC
**Scale**: 100+ plugins, 170+ Lua scripts, extensive C++ library

### Architecture
- **library/**: Core C++ library (DataDefs, Console, PluginManager, RemoteServer, Lua integration)
- **plugins/**: 100+ C++ plugins (each compiled as .so/.dll)
- **scripts/**: 170+ Lua scripts invokable from DFHack console
- **docs/**: Extensive RST documentation
- **data/**: Art, blueprints, config defaults, stockpile templates, profession templates

### Key Plugins Relevant to Chronicler
- **RemoteFortressReader**: 41 RPC functions for reading fortress state (units, buildings, items, map data). Already confirmed loaded in Chronicler's VM.
- **exportlegends**: Generates legends XML and legends_plus XML exports from legends mode
- **autobutcher/autochop/autofarm**: Automation plugins showing event hook patterns
- **buildingplan/blueprint**: Building template systems
- **dwarfmonitor**: Performance/statistics monitoring
- **dwarfvet**: Health monitoring
- **labormanager/autolabor**: Labor assignment systems
- **confirm**: Confirmation dialogs for dangerous actions
- **channel-safely**: Safe channel designation

### Key Scripts Relevant to Chronicler
- **exportlegends.lua**: XML export orchestration
- **deathcause.lua**: Death cause resolution
- **diplomacy.lua**: Diplomatic state inspection
- **caravan.lua**: Caravan interaction
- **catsplosion.lua**: Population management
- **growcrops.lua**: Crop management
- **emigration.lua**: Emigration events
- **gaydar.lua**: Orientation data access
- **dwarf-op.lua**: Batch dwarf operations
- **control-panel.lua**: Script enable/disable management
- **combine.lua**: Item combining
- **forbid.lua**: Item forbid management
- **burial.lua**: Burial management
- **animal-control.lua**: Animal management
- **gui/**: 30+ GUI overlay scripts showing DFHack GUI patterns

### DFHack Core Library Features
- **DataDefs**: Auto-generated C++ headers from df-structures XML
- **RemoteServer**: TCP RPC server (port 5000) with protobuf messages
- **Lua Integration**: Full Lua scripting with access to all game memory via `df.global`
- **EventManager**: C++ event system for tick callbacks, state changes, unit events
- **PluginManager**: Dynamic loading/unloading of native plugins
- **Console**: Interactive console with command history, tab completion

---

## dfhack-client-python

**Repository**: `GitRepos/dfhack-client-python`
**Language**: Python 3 (asyncio)
**Purpose**: Python async client for DFHack's TCP RPC interface
**Files**: 2 key files (`dfhack_remote.py`, `blendwarf.py`)

### Architecture
- **dfhack_remote.py**: Async TCP client with protobuf serialization
  - Handshake protocol: `DFHack?\n` + version
  - CoreBindRequest for method binding (cached via `@lru_cache`)
  - Reply handling: RESULT, FAIL, TEXT codes
  - Decorator-based API: `@remote(plugin='PluginName')` for defining RPC calls
- **blendwarf.py**: Example Blender integration for 3D voxel rendering

### RPC Protocol
```python
# Header format: 2-byte ID + 2-byte padding + 4-byte size
# Handshake: b'DFHack?\n' + version_int32
# Bind: CoreBindRequest(method, input_msg, output_msg, plugin)
# Call: header(bound_id, size) + serialized_protobuf
# Reply: header(reply_code, size) + payload
```

### Key Limitation (from MEMORY.md)
TCP RPC is BROKEN for game-thread calls on DFHack 53.x under Prism emulation. Only cached calls (GetVersion, GetWorldInfo) work. All other calls hang — CoreSuspender never acquired from network thread. This is why Chronicler uses `dfhack-run` over SSH instead.

---

## df-structures

**Repository**: `GitRepos/df-structures`
**Language**: XML structure definitions, Perl code generators
**Purpose**: Define all Dwarf Fortress data structures for DFHack memory access
**Scale**: 150+ XML files defining every game data structure

### Architecture
- Each `.xml` file defines structures for one game subsystem
- `symbols.xml` (537KB) maps structure addresses for each DF version
- Perl code generators produce C++ headers and Lua bindings
- `SYNTAX.rst` documents the XML schema definition language

### Key Structure Files for Chronicler

| File | Size | Contents |
|------|------|----------|
| `df.unit.xml` | 149KB | Unit structure: name, body, soul, personality, skills, labors, jobs, inventory, wounds, relationships, thoughts, emotions |
| `df.history_event.xml` | 95KB | All history event types with fields (the definitive event type reference) |
| `df.entity.xml` | 98KB | Entity structure: positions, resources, diplomacy, squads, claims, activities |
| `df.history_figure.xml` | 57KB | Historical figure: identity, links, skills, reputation, secrets |
| `df.building.xml` | 136KB | All building types and fields |
| `df.item.xml` | 114KB | All item types with material, quality, ownership data |
| `df.personality.xml` | 75KB | Personality traits, beliefs, goals, emotions |
| `df.creature.xml` | 74KB | Creature raw definitions |
| `df.itemdef.xml` | 75KB | Item definition templates |
| `df.job.xml` | 84KB | Job types, materials, items |
| `df.d_basics.xml` | 577KB | Core data types and enums |
| `df.d_interface.xml` | 352KB | Interface/UI structures |
| `df.world.xml` | 37KB | World container structure (root of df.global.world) |
| `df.history.xml` | 15KB | History subsystem: eras, collections, events |
| `df.diplomacy.xml` | 6KB | Diplomatic structures |
| `df.army.xml` | 5KB | Army/military structures |
| `df.squad.xml` | 16KB | Squad definitions |
| `df.site.xml` | 21KB | Site data |
| `df.region.xml` | 46KB | Region/biome data |
| `df.activity.xml` | 48KB | Activity events (tavern, temple, combat) |
| `df.skill_enum.xml` | 39KB | All skill types (the definitive skill enum) |
| `df.announcement.xml` | 10KB | Announcement types |
| `df.agreement.xml` | 14KB | Agreement structures |
| `df.crime.xml` | 3KB | Crime structures |
| `df.occupation.xml` | 3KB | Occupation types |

---

## Consolidated Extractable Features for Chronicler

### F-DH-01: Complete Lua Memory Access Paths
- **User QoL**: Access any game data field from Lua scripts for real-time data extraction
- **Implementation**: df-structures XML files define every field path. DFHack generates Lua bindings so `df.global.world.units.active[0].status.current_soul.personality.stress` works. Already used by Chronicler's bridge.
- **Chronicler relevance**: The definitive reference for expanding the bridge Lua script to capture any additional data fields

### F-DH-02: 141+ Event Type Definitions
- **User QoL**: Correctly parse and interpret every history event type in DF
- **Implementation**: `df.history_event.xml` (95KB) defines all event type structs with their fields. Each struct maps directly to both the XML legends export format and the in-memory format.
- **Chronicler relevance**: Cross-reference with the XML parser's 141 canonical event types; identify any missing types; verify field completeness

### F-DH-03: Unit Data Model (149KB structure)
- **User QoL**: Complete unit information: name, race, profession, skills, labors, personality, emotions, relationships, health, inventory, job
- **Implementation**: `df.unit.xml` defines the entire unit structure hierarchy including soul, personality traits, belief system, thoughts, emotions, wounds, corpse components.
- **Chronicler relevance**: Definitive field reference for expanding the bridge Lua script's unit extraction; CDM schema validation

### F-DH-04: EventManager Tick Callback System
- **User QoL**: Efficient periodic polling with configurable tick intervals
- **Implementation**: DFHack's C++ EventManager provides: onupdate (per-tick), onJobCompleted, onUnitDeath, onItemCreated, onBuildingCreated, onConstruction, onSyndrome, onInvasion, onInventoryChange, onReport, onUnitAttack, onInteraction
- **Chronicler relevance**: The Lua bridge already uses `dfhack.timeout()` for repeat jobs; the EventManager shows the C++ equivalent for potential native plugin development

### F-DH-05: DFHack Script Ecosystem (170+ Scripts)
- **User QoL**: Pre-built solutions for common fortress management tasks — labor assignment, military orders, bulk operations
- **Implementation**: Lua scripts callable from DFHack console or via `dfhack-run`. Each script demonstrates specific Lua API patterns for data access and manipulation.
- **Chronicler relevance**: Reference for Lua patterns; scripts like `deathcause.lua`, `diplomacy.lua`, `caravan.lua`, `exportlegends.lua` are directly relevant to Chronicler's data needs

### F-DH-06: Python Async RPC Client
- **User QoL**: Python interface to DFHack for scripting game interactions
- **Implementation**: `dfhack_remote.py` with asyncio, protobuf serialization, decorator-based method binding. Caches bound method IDs for performance.
- **Chronicler relevance**: While TCP RPC is broken under Prism for game-thread calls, the protobuf message definitions and protocol knowledge remain valuable. Could be used if RPC is fixed in future DFHack versions.

### F-DH-07: Personality/Trait System (75KB structure)
- **User QoL**: Access dwarf personality traits, beliefs, goals, values, preferences — the psychological model underlying behavior
- **Implementation**: `df.personality.xml` defines traits (50 personality facets), beliefs (44 types), goals (16 types), value ranges, need satisfaction states, emotion types.
- **Chronicler relevance**: Personality trait extraction for narrative enrichment ("Urist is a stoic dwarf who values tradition..."); Dwarf Therapist-style personality display

### F-DH-08: Labor/Profession System
- **User QoL**: Complete labor assignment and profession tracking for all dwarves
- **Implementation**: `df.unit.xml` defines labor flags and profession enums. DFHack scripts like `autolabor.lua` implement automated assignment.
- **Chronicler relevance**: Labor Manager component; skill/profession tracking in the CDM

### F-DH-09: exportlegends Script
- **User QoL**: Automated legends XML generation without manual export
- **Implementation**: `scripts/exportlegends.lua` orchestrates the export process, generating both legends.xml and legends_plus.xml.
- **Chronicler relevance**: Could be triggered remotely via `dfhack-run` to automate periodic legends export for batch ingestion

### F-DH-10: Symbol/Address Mapping
- **User QoL**: Version-specific memory address resolution for all game structures
- **Implementation**: `symbols.xml` (537KB) maps structure addresses per DF version/platform combination.
- **Chronicler relevance**: Understanding why DFHack versions must match DF versions exactly; implications for VM setup documentation

---

## Key Insights

1. **df-structures is THE definitive reference** for every data field in Dwarf Fortress — 150+ XML files totaling over 2MB of structure definitions
2. **DFHack's Lua integration** makes virtually every game data field accessible from Chronicler's bridge script
3. **The Python RPC client** documents the protocol but TCP RPC is broken under Prism — the knowledge is valuable for future compatibility
4. **170+ Lua scripts** provide a rich library of data access patterns that can be studied and adapted for the bridge
5. **The EventManager** provides 14 event types (death, job, item, building, etc.) that the bridge could hook into for real-time change detection
6. **The personality system** (75KB of structure definitions) offers deep psychological modeling that could enrich Chronicler's narrative generation far beyond what any existing tool provides
