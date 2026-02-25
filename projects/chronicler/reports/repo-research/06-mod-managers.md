# Repository Research Report: Mod Management Tools (4 repos)

This report covers four repositories related to Dwarf Fortress mod management:

1. **DF-Modloader** (Python, raw file compilation/management)
2. **ModHearth** (C#, DFHack + Steam Workshop mod manager)
3. **Nexus-Mod-Manager** (C#, general-purpose mod manager)
4. **DFHack data/ directory** (professions, orders, stockpiles, blueprints)

---

## DF-Modloader (Python)

**Repository**: `GitRepos/DF-Modloader`
**Language**: Python 3 (tkinter GUI)
**Purpose**: Load, compile, and manage Dwarf Fortress raw mods
**Files**: `main.py` (19KB), `raw_handler.py` (63KB), `tooltip.py`

### Architecture
- **main.py**: tkinter GUI with dual-listbox mod selector (selected/unselected), mod info display, compile button
- **raw_handler.py** (63KB): Core mod compilation engine
  - `Mod` class: Parses mod_info.txt metadata (name, version, creator, df_version, dependencies, conflicts)
  - `Compiler` class: Merges multiple mods into DF's raw directory
  - `SyntaxUpdater` class: Translates mod syntax across DF versions

### Raw Object Type System
Defines 18 object type categories with their file naming conventions:
```
BODY_DETAIL_PLAN, BODY, BUILDING, CREATURE, DESCRIPTOR_COLOR, DESCRIPTOR_PATTERN,
DESCRIPTOR_SHAPE, ENTITY, INORGANIC, INTERACTION, ITEM, LANGUAGE, MATERIAL_TEMPLATE,
PLANT, REACTION, TISSUE_TEMPLATE, EDIT, OBJECT_TEMPLATE
```

### Key Features
- **Mod metadata system**: `mod_info.txt` with name, version, creator, DF version, description, dependencies
- **Dependency resolution**: Mods can declare required-before, required-after, and incompatible-with relationships
- **Syntax translation**: Convert mod files between DF version formats
- **Load order management**: Follows DF's documented raw file load order
- **Missing mod detection**: Highlights mods referenced by load lists but not found in mods folder
- **Raw file compilation**: Merges mod raw files into DF's data directory

---

## ModHearth (C#)

**Repository**: `GitRepos/ModHearth`
**Language**: C# (.NET, Windows Forms)
**Purpose**: Mod manager for Steam Dwarf Fortress + DFHack
**Files**: `ModHearthManager.cs` (28KB), `ModReference.cs` (6KB), `DFHackModClasses.cs` (2KB)

### Architecture
- **ModHearthManager.cs**: Core manager with mod pool, enabled/disabled lists, modpack management
- **ModReference.cs**: Rich mod metadata from filesystem inspection
- **DFHackModClasses.cs**: DFHack mod-manager.json format classes
- **UI/**: Windows Forms UI components

### Key Concepts
- **DFHMod**: DFHack's minimal mod representation (name + version)
- **ModReference**: Extended mod info with display metadata, filesystem paths
- **DFHModPack**: Named modpack (list of DFHMods with default flag)
- **ModProblem**: Dependency/conflict issue tracking (MissingBefore, MissingAfter, ConflictPresent)

### Key Features
- **DFHack integration**: Reads/writes DFHack's `mod-manager.json` configuration
- **Steam Workshop awareness**: Discovers mods from Steam Workshop directory
- **Modpack system**: Save/load named mod combinations (modpacks)
- **Dependency validation**: Detect missing dependencies and incompatible mods
- **Load order editing**: Drag-and-drop mod ordering with undo
- **Game launcher**: Play button to launch DF with configured mods

---

## Nexus-Mod-Manager (C#)

**Repository**: `GitRepos/Nexus-Mod-Manager`
**Language**: C# (.NET Framework 4.6)
**Purpose**: General-purpose mod manager for 35+ games (not DF-specific)
**Scale**: Large enterprise app — NexusClient, ModManager.Interface, Game Modes, Scripting, Transactions

### Architecture
- **NexusClient/**: Main application with download manager, mod installer, profile system
- **ModManager.Interface/**: Plugin interface for game-specific mod handling
- **Game Modes/**: Per-game handlers (not including DF, but extensible)
- **Scripting/**: Script execution engine for mod installation scripts
- **Transactions/**: Transactional file operations for safe mod installation/removal
- **UI/**: Rich WinForms UI with tree views, file browsers, wizards

### Key Features (relevant to Chronicler's Mod Manager component)
- **1-click download/install**: Site integration for download initiation
- **Download manager**: Pause/resume/queue downloads
- **Mod profiles**: Save/switch between different mod configurations
- **Clean install/uninstall**: Transactional file operations ensure clean state
- **Mod conflict detection**: Identify file-level conflicts between mods
- **Virtual file system**: Track mod file ownership without modifying originals
- **Plugin-based game support**: Interface for adding new game support
- **XML/script parsing**: Process mod installation scripts with conditions

---

## DFHack Data Directory

**Repository**: `DwarfCron/repos/dfhack/data/`
**Contents**: Built-in templates and configurations

### Key Subdirectories
- **blueprints/**: Pre-built fortress blueprints (quickfort-compatible)
- **dfhack-config/**: Default DFHack configuration files
- **init/**: Initialization scripts run at DF startup
- **orders/**: Manager order templates (stockpiling, production)
- **professions/**: Custom profession definitions (skill assignments)
- **stockpiles/**: Stockpile configuration templates

---

## Consolidated Extractable Features for Chronicler

### F-MM-01: Mod Metadata System
- **User QoL**: Track which mods were active when a world was generated, enabling mod-aware game history
- **Implementation**: Parse DFHack's `mod-manager.json` and mod info files to capture mod name, version, creator, DF version. Store in CDM linked to world records.
- **Chronicler relevance**: Unique Chronicler feature — no existing tool tracks mod history in a database. Enables "this world was generated with these mods" queries.

### F-MM-02: Dependency Resolution Engine
- **User QoL**: Detect mod conflicts and missing dependencies before game launch, preventing broken worlds
- **Implementation**: Both DF-Modloader and ModHearth implement dependency graphs with before/after/conflict relationships. ModHearth's `ModProblem` struct classifies issues.
- **Chronicler relevance**: Mod Manager component validation; warn users about incompatible mod combinations

### F-MM-03: Modpack Profile System
- **User QoL**: Save, name, and switch between different mod configurations quickly
- **Implementation**: ModHearth stores modpacks in DFHack's JSON format; NMM uses XML profiles with virtual file system tracking.
- **Chronicler relevance**: Mod Manager's core UX — save "Megabeast Madness" profile vs "Vanilla Plus" profile

### F-MM-04: Raw File Object Type Taxonomy
- **User QoL**: Understand the complete structure of DF's modding system — what can be modded and how
- **Implementation**: DF-Modloader's `raw_handler.py` defines 18 object types with their file naming conventions, load order, and parsing rules.
- **Chronicler relevance**: Mod content categorization; understand what a mod changes (creatures? buildings? reactions?)

### F-MM-05: Raw Syntax Version Translation
- **User QoL**: Automatically update mod syntax when DF versions change
- **Implementation**: DF-Modloader's `SyntaxUpdater` translates raw file tokens between DF versions.
- **Chronicler relevance**: Long-term mod compatibility; historical mod tracking across DF version upgrades

### F-MM-06: Transactional File Operations
- **User QoL**: Install/uninstall mods cleanly with rollback on failure
- **Implementation**: NMM's Transactions/ system provides atomic file operations — if any step fails, all changes are rolled back.
- **Chronicler relevance**: Safe mod installation/removal in the Mod Manager component; prevent corrupted game installations

### F-MM-07: Steam Workshop Integration
- **User QoL**: Discover and manage Steam Workshop mods alongside manual mods
- **Implementation**: ModHearth scans the Steam Workshop directory for installed mods, reconciles with DFHack's mod-manager.json.
- **Chronicler relevance**: Workshop mod discovery for the Mod Manager; track which Workshop mods are active

### F-MM-08: Blueprint/Template Management
- **User QoL**: Save, share, and apply fortress blueprints, stockpile configs, profession templates
- **Implementation**: DFHack's data/ directory contains JSON/CSV templates for blueprints, orders, professions, stockpiles.
- **Chronicler relevance**: Template management UI in the Mod Manager or as a standalone feature; fortress blueprint library

### F-MM-09: Mod Content Preview
- **User QoL**: See what a mod adds/changes before enabling it — new creatures, items, reactions, buildings
- **Implementation**: DF-Modloader parses raw files to categorize mod content by object type. Could be extended to diff against vanilla.
- **Chronicler relevance**: Mod detail view showing content changes; helps players understand mod impact

### F-MM-10: Game Launch Integration
- **User QoL**: Launch DF directly from the mod manager with the configured modpack
- **Implementation**: ModHearth's Play button writes mod-manager.json and launches DF. NMM handles game process management.
- **Chronicler relevance**: "Play" button in the Mod Manager that ensures mods are correctly configured before launch

---

## Key Insights

1. **No existing mod manager tracks mod history in a database** — Chronicler's unique "mod history in DB" feature has no precedent to follow
2. **DFHack's mod-manager.json** is the canonical mod list format for Steam DF — the Mod Manager should read/write this format
3. **Dependency resolution** is a solved problem — both DF-Modloader and ModHearth implement it
4. **NMM is enterprise-scale** but not DF-specific — its architecture (transactional files, virtual FS, plugin games) is over-engineered for Chronicler but provides useful patterns
5. **Raw file parsing** (63KB in DF-Modloader) could be leveraged for mod content analysis and preview
6. **The DFHack data/ directory** contains a wealth of pre-built templates that could be surfaced in a template management UI
7. **Steam Workshop** is the primary mod distribution channel for modern DF — integration is essential
