# Component Research: Dwarf Fortress Mod Manager

**Date**: 2026-02-25
**Component**: Main Component 5 of 6 -- Dwarf Fortress Mod Manager
**Sources**: planning-history.md, mod-management-research.md, dfhack-infrastructure-research.md, dwarven-surveyor-scripts-research.md, research-synthesis.md
**Scope**: Mod installation/uninstallation, conflict detection, load order management, mod profiles/presets, raw file parsing and patching, mod history tracking, Steam Workshop integration, mod compatibility checking, raw compiler pipeline, three-way merge strategies, and all other mod management functionality.

---

## 1. Feature Inventory

### 1.1 Core Mod Manager (MVP -- Tier 1: "Modpack Manager")

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-01 | **Mod Discovery via Filesystem Scan** | User sees all installed mods without launching DF | Scan `<DF_dir>/Mods/`, `data/vanilla/`, `data/installed_mods/` for `info.txt` files. Parse each `info.txt` using the DF v50 token-based format. Build an in-memory catalog of `ModMetadata` objects. | ModHearth (`ModReference.cs`), DF-Modloader (`raw_handler.py`) | M |
| F-02 | **DFHack Live Mod Discovery** | More accurate version data when DF is running | Execute `dfhack-run` over SSH to call `reqscript('gui/mod-manager')` then `manager.get_modlist_fields('base_available', viewScreen)`. Parse pipe-delimited output with JSON headers. Returns: id, name, displayed_version, numeric_version, earliest_compat_numeric_version, src_dir, mod_header (all info.txt fields as Lua table). | ModHearth (`GetModMemoryData.lua`) | M |
| F-03 | **Cached Mod List Fallback** | App works even when DF is not running and filesystem is unavailable | Persist last successful mod scan results in Chronicler's PostgreSQL database or a local JSON cache. Display with "last scanned: <timestamp>" indicator. | N/A (Chronicler-specific) | S |
| F-04 | **info.txt Parser** | Understands all mod metadata fields | Full token-based parser supporting all v50 fields: ID, NAME, NUMERIC_VERSION, DISPLAYED_VERSION, EARLIEST_COMPATIBLE_NUMERIC_VERSION, EARLIEST_COMPATIBLE_DISPLAYED_VERSION, AUTHOR, DESCRIPTION, REQUIRES_ID, REQUIRES_ID_BEFORE_ME, REQUIRES_ID_AFTER_ME, CONFLICTS_WITH_ID, plus Steam fields (STEAM_TITLE, STEAM_DESCRIPTION, STEAM_TAG, STEAM_KEY_VALUE_TAG, STEAM_METADATA, STEAM_CHANGELOG, STEAM_FILE_ID). | ModHearth (`ModReference.cs` regex parsing), DF-Modloader (`mod_info.txt` flat format) | M |
| F-05 | **Modpack CRUD** | User can create, manage, and switch between mod configurations | Read/write `<DF_dir>/dfhack-config/mod-manager.json`. Operations: create new (from vanilla list), rename, delete (minimum one required), set-default. JSON schema: `[{name: string, default: bool, modlist: [{id: string, version: int}]}]`. Version integers constructed by removing dots from numeric_version string. | ModHearth (`DFHModpack` class), DFHack `gui/mod-manager.lua` | M |
| F-06 | **Profile Import/Export** | Users can share mod configurations | Import/export modpack JSON files. Validate against `DFHModpack` schema on import. Include version compatibility warnings if loaded mod versions differ from exported versions. | ModHearth (import/export in `ModHearthManager.cs`) | S |
| F-07 | **Load Order Management** | Correct mod ordering prevents conflicts | Drag-and-drop reordering in UI. Enforce DF's canonical header load order: `o_template, language, descriptor_shape, descriptor_color, descriptor_pattern, material_template, inorganic, plant, tissue_template, item, building, b_detail_plan, body, c_variation, creature, entity, reaction, interaction, edit`. Object template files must load first. | DF-Modloader (`header_load_order` in `raw_handler.py`) | M |
| F-08 | **Mod Browser with Search/Filter** | Quickly find and manage mods | Dual-pane view: available/disabled mods (left) vs. enabled mods (right). Search/filter boxes for each pane. Show mod name, version, author, description, preview.png thumbnail if present. | ModHearth (dual-pane `MainForm.cs`), Vortex (NexusMods) | M |
| F-09 | **Mod Info Panel** | Understand what a mod does before enabling | Display full metadata: name, description, version, author, preview image (if `preview.png` exists in mod folder). Show dependency requirements and known conflicts. | ModHearth (info panel), Vortex (mod details) | S |
| F-10 | **Undo to Last Saved State** | Recover from accidental changes | Track unsaved changes with `*` marker in UI. Undo reverts to last saved `mod-manager.json` state. | ModHearth (in-session undo) | S |
| F-11 | **CLI Interface** | Power users and automation | `chronicler mods list` -- list all discovered mods. `chronicler mods profiles` -- list modpack profiles. `chronicler mods activate <profile>` -- switch active profile. `chronicler mods check` -- run conflict detection. Aligns with Chronicler's existing Click CLI pattern. | N/A (Chronicler-specific) | M |

### 1.2 Conflict Detection System (Tier 1-2)

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-12 | **Level 1: Metadata Conflict Detection** | Catch dependency problems before launch | O(n) scan through enabled mod list. Checks: (1) Duplicate mod IDs, (2) `CONFLICTS_WITH_ID` pairs both present, (3) `REQUIRES_ID_BEFORE_ME` violations (required mod not in `scannedModIDs`), (4) `REQUIRES_ID_AFTER_ME` violations (required mod not in `unscannedModIDs`), (5) Version incompatibility (loaded version < `EARLIEST_COMPATIBLE_NUMERIC_VERSION`). Maintains two sets during scan: `scannedModIDs` and `unscannedModIDs`. Problem types: `MissingBefore`, `MissingAfter`, `ConflictPresent`. | ModHearth (`FindModlistProblems` in `ModHearthManager.cs`) | M |
| F-13 | **Level 2: Object ID Conflict Detection** | Detect raw-level conflicts that cause silent corruption | O(n x m) scan: parse all `objects/*.txt` for each enabled mod. Build map `{object_type: {object_id: [mod_id, ...]}}`. Flag any object_id defined by multiple mods (full definitions, not SELECT/CUT). CRITICAL: duplicate object IDs cause silent offset corruption in DF, not a clean last-wins override. | DF-Modloader (implicit via `normal_objects` dict), N/A (no existing tool does this explicitly) | L |
| F-14 | **Level 3: Semantic Conflict Detection** | Deep analysis of mod interactions | Full DF-Modloader compiler pipeline needed. Detect: (1) CUT + SELECT interactions (CUT in mod B removes object that mod A's SELECT targets -- CUT wins if loaded after), (2) OT_REMOVE_TAG vs. OT_ADD_TAG on same token across mods. Only feasible with the full raw compiler. | DF-Modloader (compiler pipeline) | XL |
| F-15 | **Visual Conflict Indicators** | See problems at a glance | Color-code mods by status: green (no issues), yellow (warnings), orange (overlap/potential conflict), red (fatal conflict). Red text for problem mods in enabled list. Modeled on PyLNP's status codes: 0=clean, 1=potential, 2=overlap, 3=fatal. | ModHearth (red highlighting), PyLNP (4-level status), Vortex (lightning bolt icons) | S |
| F-16 | **SELECT/CUT Token Detection** | Understand v50 mod interactions | Parse raw files for SELECT_<TYPE> and CUT_<TYPE> tokens. Track which objects each mod selects/cuts. Cross-reference with other mods' definitions. If two mods both SELECT the same object, they coexist. If one CUTs an object another SELECTs, flag as conflict (CUT wins if later in load order). Sub-object selectors: SELECT_CASTE, SELECT_ADDITIONAL_CASTE, SELECT_MATERIAL, SELECT_TISSUE, SELECT_TISSUE_LAYER, SELECT_GROWTH. | N/A (no existing tool explicitly detects this) | L |
| F-17 | **LOOT-style Auto-Order** | Automated load order optimization | Topological sort of mod dependency graph based on REQUIRES_ID_BEFORE_ME/AFTER_ME declarations. Community-curated masterlist of known load order rules (long-term). Linting: flag missing masters, incompatible pairs, mismatched versions. | LOOT (Load Order Optimisation Tool for TES/Bethesda games) | L |

### 1.3 Raw File Parsing and Analysis (Tier 2: "Raw Analyzer")

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-18 | **Raw File Tokenizer** | Foundation for all raw analysis | Canonical state machine from DF-Modloader: `COMMENTS -> TOKEN -> ARGS`. Discard everything outside square brackets as comments. Token = first colon-separated field. Arguments = remaining colon-separated fields. Preserve prefix/suffix whitespace for round-trip fidelity (PyDwarf pattern). | DF-Modloader (`split_lines_into_tokens()`), PyDwarf (token class with prefix/suffix) | M |
| F-19 | **Object Type Catalog** | Understand mod structure | Recognize all 18 DF super-types mapped to file prefixes: o_template, language, descriptor_shape, descriptor_color, descriptor_pattern, material_template, inorganic, plant, tissue_template, item, building, b_detail_plan, body, c_variation, creature, entity, reaction, interaction. Plus v50 additions: GRAPHICS, PALETTE, TEXT_SET. Each file begins with `[OBJECT:TYPE]`. | DF-Modloader (`raw_handler.py` lines 6-84) | S |
| F-20 | **Per-Object Mod Attribution** | Know which mod defines each object | Build `{object_type: {object_id: {mod_id, source_file, line_number}}}` map. Track source mod name, version, and file for every raw object. DF-Modloader's `RawObject` stores `source_mod_name_and_version` and `source_file_name`. | DF-Modloader (`RawObject` class) | M |
| F-21 | **Raw Visual Diff Viewer** | Compare mod changes to vanilla | Side-by-side or unified diff view of raw objects across mods. Show token-level differences between vanilla and modded objects. Highlight added, removed, and modified tokens. | N/A (no existing DF tool does this) | L |
| F-22 | **Mod Content Summary** | Quick overview of what a mod changes | Parse all `objects/*.txt` in a mod. Summarize: N creatures added/modified, N entities added/modified, N reactions added, N items added, etc. Group by object type. Show SELECT/CUT counts separately from full definitions. | N/A (Chronicler-specific) | M |

### 1.4 Three-Way Merge System (Tier 2-3)

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-23 | **Three-Way File Merge** | Detect line-level conflicts between mods | Uses Python `difflib.SequenceMatcher` and `ndiff`. Three inputs: (1) vanilla baseline -- unmodified vanilla raw file, (2) previously accumulated merge -- result of all mods merged so far, (3) new mod file. Yields blocks using SequenceMatcher opcode comparison. If mod changed a region that accumulated also changed (both differ from vanilla), flagged as "overlap." Returns status: 0=clean, 1=potential issues, 2=overlap merged (manual review), 3=fatal. | PyLNP (`three_way_merge` function using `difflib`) | L |
| F-24 | **Vanilla Baseline Management** | Ensure clean merge reference | Baselines stored in designated directory. `make_blank_files()` creates empty placeholders for vanilla files a mod doesn't touch, ensuring clean three-way comparison. `can_rebuild()` verifies merge log is complete enough to reproduce exact merge. | PyLNP (`LNP/Baselines/` directory, baseline functions) | M |
| F-25 | **Merge Status Visualization** | Understand merge quality | Each merged mod shows colored indicator: green (0, clean), yellow (1, potential), orange (2, overlap), red (3, fatal). Merge log tracks all operations for rebuild. | PyLNP (visual status in UI) | S |
| F-26 | **Atomic Raw Installation** | Safe mod installation | `install_mods()`: delete installed raw folder and copy merged raws (atomic replacement). `update_raw_dir()`: in-place update for graphics-only changes if merge log shows no overlaps. | PyLNP (`install_mods`, `update_raw_dir`) | M |

### 1.5 Advanced Mod Management (Tier 3: "Raw Compiler")

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-27 | **Full Raw Compiler** | Pre-merged raw packages | Complete DF-Modloader-style compilation pipeline: (1) For each mod in load order: `read_mod_raws_and_apply_edit_objects(mod)` -- reads files in header-sorted order, builds `normal_objects` dict-of-dicts and `normal_objects_lists` dict-of-lists. (2) `apply_special_tokens_to_create_compiled_objects()` -- processes OBJECT_TEMPLATE and normal objects. (3) `write_compiled_objects(output_path)` -- writes one `*_compiled.txt` per super-type with source comments. | DF-Modloader (full `Compiler` class, ~1,270 lines in `raw_handler.py`) | XL |
| F-28 | **EDIT Object Processing** | Support mod editing semantics | EDIT objects select existing objects and apply modifications. Selection criteria: `SEL_BY_ID` (single object), `SEL_BY_CLASS` (all with matching OBJECT_CLASS/CREATURE_CLASS), `SEL_BY_TAG` (all containing given token), `SEL_BY_TAG_PRECISE` (exact match), `PLUS_SELECT` (union), `UNSELECT` (exclude). Within EDIT: normal tokens wrapped as `[OT_ADD_TAG:...]`. Special tokens: `ADD_SPEC_TAG`, `REMOVE_SPEC_TAG`, `CONVERT_SPEC_TAG`. | DF-Modloader (EDIT handling in `raw_handler.py`) | XL |
| F-29 | **OBJECT_TEMPLATE Compilation** | Template expansion for raw objects | Templates support: `COPY_TAGS_FROM` (inserts another template's tokens at insertion_index), `GO_TO_END`/`GO_TO_START`/`GO_TO_TAG` (repositions cursor), argument substitution (`!ARG1`, `!ARG2`). Recursion detection prevents infinite COPY_TAGS_FROM loops via `currently_compiling_ids` set. | DF-Modloader (OBJECT_TEMPLATE in `Compiler` class) | XL |
| F-30 | **USE_OBJECT_TEMPLATE Processing** | Apply templates to normal objects | `OT_ADD_TAG` inserts tokens. `OT_REMOVE_TAG` removes by matching prefix. `OT_CONVERT_TAG` + `OTCT_TARGET`/`OTCT_REPLACEMENT` does string substitution within token arguments. Conditional variants: `OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG` check a numbered argument matches a set value. | DF-Modloader | XL |
| F-31 | **REMOVE_OBJECT Processing** | Remove objects during compilation | Sets `is_removed = True` on the output object; skipped during write phase. | DF-Modloader | S |
| F-32 | **Legacy Mod Migration Tool** | Support pre-v50 mods | `SyntaxUpdater` class: converts legacy `c_variation_*` files to `o_template_cv_*` format and `b_detail_plan_*` to `o_template_bdp_*` format. Enables old mods to work with the new compiler. NOTE: `BP_LAYERS/BP_POSITION/BP_RELATION` body detail plan tokens are not convertible -- require special case handling. | DF-Modloader (`SyntaxUpdater` class) | L |
| F-33 | **Token-Level Raw API** | Programmatic raw manipulation | PyDwarf-style doubly-linked token list. Each token: `value` (first field), `args` (remaining fields), `prev`/`next` (linked list pointers), `file` (parent rawfile reference), `prefix`/`suffix` (whitespace preservation). O(1) insertion/deletion/traversal. `filter()`, `get()`, iteration API. Better than flat list for interactive editing. | PyDwarf (token class, doubly-linked list) | L |
| F-34 | **Virtual File System Isolation** | Mods never touch the real game folder | Mod Organizer 2 pattern: virtual filesystem where mods are overlaid without physical file copies. Complete isolation between mods. Per-mod activation without reinstall. NOTE: DF requires mods to be physically copied into its directory structure, so this would require proxying file access. May not be feasible for DF. | Mod Organizer 2 | XL |

### 1.6 Steam Workshop Integration

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-35 | **Steam Workshop Mod Detection** | See subscribed Workshop mods | Steam Workshop mods stored in `<Steam>/steamapps/workshop/content/975370/`. These appear in DFHack's `base_available` list if DF has loaded them (requires launching DF to world creation screen at least once). Parse Workshop mod metadata from `info.txt` in Workshop content folder. | ModHearth (indirect via DFHack), Steam Workshop | M |
| F-36 | **Workshop Mod Path Resolution** | Locate Workshop mods on disk | Resolve Steam Workshop content paths per platform. Windows: `<Steam>/steamapps/workshop/content/975370/<workshop_id>/`. Detect `STEAM_FILE_ID` from `info.txt` to map between Workshop IDs and mod IDs. | N/A | M |
| F-37 | **Mod Update Notifications** | Know when mods have updates | Compare installed mod `NUMERIC_VERSION` against Workshop version. Flag mods with available updates. NOTE: No existing DF tool implements this -- significant opportunity. Requires periodic Workshop API polling or Steam client integration. | Vortex (NexusMods API update checking) | L |

### 1.7 Modpack History and Audit (Chronicler-Unique)

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-38 | **Modpack Snapshot at World Creation** | Know exactly which mods generated a world | During worldgen monitoring (worldgen-bridge.lua), capture the active mod list from `data/installed_mods/` or DFHack memory. Store as JSON in the `worlds` table or a dedicated `world_modpacks` table. Include mod ID, version, and load order position. | N/A (Chronicler-unique) | M |
| F-39 | **Mod History in Database** | Link game events to active modpack | Unique Chronicler feature. DB schema: `world_modpacks(world_id, snapshot_time, modpack_json)` linking each world/save to its active mod configuration. Enables queries like "which mods were active when this creature was generated?" or "did this mod add the artifact that started the war?" | N/A (Chronicler-unique -- called out as key differentiator in planning-history.md Section 1.3) | L |
| F-40 | **Mod Annotation in Legends Display** | See mod provenance in explorer | When displaying entities (creatures, items, reactions) in the explorer, annotate with the mod that defined them. Cross-reference object definitions with the modpack snapshot for the current world. | N/A (Chronicler-unique) | L |
| F-41 | **Modpack Transition Tracking** | Understand mid-save mod changes | Detect when the active modpack changes between saves of the same world. Store before/after snapshots. Flag entities that may be affected by mod changes (e.g., creatures whose defining mod was removed). Open design question: conflict resolution for modpack transitions mid-save. | N/A (Chronicler-unique) | L |
| F-42 | **Modpack Diff View** | Compare mod configurations | Show differences between two modpack snapshots: mods added, removed, version-changed. Useful for understanding what changed between world generations or save points. | N/A | M |

### 1.8 Embedded Raw Editor (Stretch)

| # | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|---|---------|-------------|---------------------|----------------|------------|
| F-43 | **Syntax-Highlighted Raw Editor** | Edit raw files with understanding | Text editor with DF raw file syntax highlighting: tokens in brackets highlighted, comments dimmed, object headers emphasized. Auto-completion for known token names. Validation against known token vocabulary per object type. | N/A | L |
| F-44 | **Raw Object Browser** | Navigate raw definitions visually | Tree view of all raw objects organized by type and source mod. Click to navigate to definition. Show token count, dependency references, and SELECT/CUT status. | N/A | M |

---

## 2. Reference Tool Analysis

### 2.1 DF-Modloader (voliol, Python, 2021)

**Purpose**: "Working mockup" to explore what a mod compiler needs. Most complete public reference implementation of DF raw compilation.

**Architecture**:
- `raw_handler.py` (~1,270 lines) -- all raw parsing and compilation logic
- `main.py` (~400 lines) -- Tkinter GUI wrapping the compiler

**Core Data Structure -- `RawObject`**:
```python
class RawObject:
    object_id: str          # e.g., "DWARF"
    tokens: List[List[str]] # each token as flat list: ["BODY", "QUADRUPED_NECK"]
    source_file_name: str
    source_mod_name_and_version: str
    is_removed: bool

    # Methods:
    has_token(token_name) -> bool
    get_token_values(token_name) -> List[List[str]]
    remove_token(token_name) -> None
    convert_token(target, replacement) -> None
    tokens_with_arguments_inserted(args) -> List[List[str]]  # !ARG1/!ARG2 substitution
```

**Compilation Pipeline** (`compile_mods()`):
1. For each mod in load order: `read_mod_raws_and_apply_edit_objects(mod)` -- reads files in header-sorted order, builds `normal_objects` dict-of-dicts and `normal_objects_lists` dict-of-lists
2. `apply_special_tokens_to_create_compiled_objects()` -- processes OBJECT_TEMPLATE and normal objects through special token compiler
3. `write_compiled_objects(output_path)` -- writes one `*_compiled.txt` per super-type

**File Parser State Machine** (`reading_mode`):
- `"NONE"` -- not inside any object
- `"NEW"` -- reading a standard object definition
- `"OT"` -- reading an object template
- `"EDIT"` -- reading an EDIT object (modifier)

**EDIT Object Selection System**:
```
[EDIT:CREATURE:SEL_BY_CLASS:MAMMAL]  -- select all creatures with class MAMMAL
  SEL_BY_ID       -- single object by ID
  SEL_BY_CLASS    -- all with matching OBJECT_CLASS or CREATURE_CLASS
  SEL_BY_TAG      -- all containing a given token (with leading values)
  SEL_BY_TAG_PRECISE -- exact token match
  PLUS_SELECT     -- union with additional criteria
  UNSELECT        -- exclude from selection
```

**Modpack Discovery**: Reads `mod_info.txt` from each subdirectory of `mods/`. If a directory has `modpack_info.txt` instead, treated as collection of sub-mods.

**Conflict Model**: No explicit conflict detection. "Last mod wins" -- if two mods define `[CREATURE:DWARF]`, second overwrites first. EDIT objects layer on top in load order.

**Output Format**: Each compiled file is `<type>_compiled.txt` with source comments tracking which mod/file each object came from.

**Key Limitation**: Pre-v50 design. Does not handle SELECT/CUT tokens natively.

### 2.2 ModHearth (ch3mbot, C# Windows Forms, v0.0.3-beta)

**Purpose**: DFHack-integrated mod manager GUI targeting Steam DF with DFHack.

**Architecture**:
- `ModHearthManager.cs` -- core business logic
- `DFHackModClasses.cs` -- `DFHMod` and `DFHModpack` data structures
- `ModReference.cs` -- rich mod metadata object (87-111 lines of regex parsing)
- `ModList.cs` -- internal list container
- `UI/MainForm.cs` (~800 lines) -- Windows Forms UI
- `bin/.../GetModMemoryData.lua` -- DFHack Lua script

**Data Model**:
```
DFHMod: { id: string, version: int }
DFHModpack: { default: bool, modlist: DFHMod[], name: string }
ModReference: { ID, numeric_version, displayed_version, earliest_compat_version,
                author, name, description, path, steam_id,
                requires_id[], requires_id_before_me[], requires_id_after_me[],
                conflicts_with_id[], raw_files[] }
```

**DFHack Memory Query**:
- Requires DF running at world creation screen
- Executes: `dfhack-run.exe lua -f "GetModMemoryData.lua"`
- Lua script calls `reqscript('gui/mod-manager')` to access DFHack's mod manager
- Calls `manager.get_modlist_fields('base_available', viewScreen)`
- Output: pipe-delimited string: `name|version|id|compat_version|numeric_version|src_dir==={"json_headers"}___next_mod...`

**Conflict Detection Algorithm** (`FindModlistProblems`):
```
scannedModIDs = {}     # already processed
unscannedModIDs = {all mod IDs}  # not yet processed

for each mod in load order:
    move mod.id from unscannedModIDs to scannedModIDs
    for each required_before in mod.REQUIRES_ID_BEFORE_ME:
        if required_before NOT in scannedModIDs: problem(MissingBefore)
    for each required_after in mod.REQUIRES_ID_AFTER_ME:
        if required_after NOT in unscannedModIDs: problem(MissingAfter)
    for each conflict in mod.CONFLICTS_WITH_ID:
        if conflict in scannedModIDs OR unscannedModIDs: problem(ConflictPresent)
```

**Dependency Parsing** (from info.txt via regex):
```csharp
Regex.Matches(modInfo,
    @"\[REQUIRES_ID_BEFORE_ME\]:*(.*?)\n|\[REQUIRES_ID_BEFORE_ME:*(.*?)\]",
    RegexOptions.IgnoreCase);
```

**Profile Operations**: Create new (from vanilla list), rename, delete (minimum one), import JSON, export JSON.

**UI Features**: Dual-pane drag-and-drop, search/filter boxes, mod info panel (name, desc, preview.png), unsaved changes tracking with `*`, undo to last saved, theme switching (light/dark), conflict highlighting (red text).

**Key Limitation**: Windows-only (WinForms). Requires DF running at world creation screen for memory query.

### 2.3 PyLNP (Python Lazy Newb Pack)

**Purpose**: Pre-v50 mod management tool with the most sophisticated raw-level merging in the DF ecosystem.

**Three-Way Merge Algorithm**:
```
Inputs:
  vanilla_baseline    -- unmodified vanilla raw file
  accumulated_merge   -- result of all previous mods merged
  new_mod_file        -- current mod's file

Algorithm:
  Use difflib.SequenceMatcher to compare all three
  Yield blocks via opcode comparison
  If mod changed a region that accumulated also changed -> "overlap"

Status codes:
  0 -- clean merge
  1 -- potential compatibility issues (no merge problems)
  2 -- overlap merged (non-fatal conflict, manual review recommended)
  3 -- fatal error (triggers rebuild from scratch)
```

**Baseline Management**:
- Baselines in `LNP/Baselines/`
- `make_blank_files()` -- empty placeholders for files a mod doesn't touch
- `can_rebuild()` -- verify merge log completeness for reproducibility

**Installation**:
- `install_mods()` -- delete installed raw folder, copy merged raws (atomic)
- `update_raw_dir()` -- in-place for graphics-only if no overlaps in merge log

**Key Limitation**: Line-based merging. Pre-v50, does not understand SELECT/CUT semantics.

### 2.4 PyDwarf (pineapplemachine, Python 2.7)

**Purpose**: Most programmatically sophisticated raw manipulation library in the DF ecosystem.

**Token Data Model**:
```python
class token:
    value: str          # First field: "CREATURE"
    args: List[str]     # Remaining fields: ["DWARF"]
    prev: token         # Doubly-linked list pointer
    next: token         # Doubly-linked list pointer
    file: rawfile       # Parent file reference (or None)
    prefix: str         # Text before '[' (preserves whitespace)
    suffix: str         # Text after ']' (preserves whitespace)
```

**Key Capability**: Doubly-linked list enables O(1) insertion, deletion, and traversal. `token.remove()` unlinks from chain. `args` is mutable -- direct assignment modifies the raw.

**Mod API**: Python scripting API where mod scripts receive a `raws` object and traverse/modify any token chain using `filter()`, `get()`, and iteration.

**Trade-off vs DF-Modloader**: DF-Modloader uses flat `List[List[str]]` per object (compact, fast compilation). PyDwarf uses doubly-linked global token chain (flexible, allows arbitrary traversal). PyDwarf better for interactive editing; DF-Modloader better for batch compilation.

### 2.5 Vortex / NexusMods / LOOT (Comparable Ecosystem Tools)

**Vortex** (NexusMods):
- Dual-pane: available vs. installed
- File conflict visualization: red lightning bolt (unresolved), green (resolved)
- LOOT integration for automated load order sorting
- Rule-based ordering: mod A before mod B, mod A after group X
- Profile switching (independent mod configs per playthrough)
- Import/export modlists as JSON
- Mod-level and file-level conflict resolution with visual diff
- Automatic update notifications via NexusMods API
- Mod preview images and descriptions

**Mod Organizer 2**:
- Virtual file system -- mods never touch real game folder
- Complete isolation between mods
- Per-mod activation without reinstall
- Conflict visualization at file level

**LOOT** (Load Order Optimisation Tool):
- Masterlist of community-curated load order rules
- Topological sort based on explicit dependency graph
- Linting: flags missing masters, incompatible pairs, mismatched versions

**Key Gap in DF Ecosystem**: No equivalent of LOOT exists for DF. No centralized conflict ruleset. No virtual file system isolation. No mod update system integrated with DFFD or NexusMods DF page.

### 2.6 DFHack gui/mod-manager

**Location**: `<DF_dir>/dfhack-config/mod-manager.json`

**JSON Schema**:
```json
[
  {
    "name": "Default",
    "default": true,
    "modlist": [
      {"id": "vanilla_text", "version": 5310},
      {"id": "vanilla_creatures", "version": 5310},
      {"id": "some_mod", "version": 100}
    ]
  }
]
```

**Memory Query API**:
- `get_modlist_fields(kind, viewScreen)` where kind is:
  - `'available'` / `'base_available'` -- all installable mods
  - `'object_load_order'` -- currently active mods in load order
- Returns per mod: id, numeric_version, displayed_version, earliest_compat_numeric_version, src_dir, name, mod_header

**Version Integer Format**: Dots removed from numeric_version string: `"53.10"` -> `5310`, `"1.0.0"` -> `100`. Observed behavior from ModHearth source, not formally documented by DFHack.

**Overlay System**: Two UI overlays on world creation screen: modpack preset browser (save/load/rename/delete/set-default) and active mod list viewer (clipboard export, vanilla/non-vanilla filtering).

### 2.7 dfraw_json_parser (Rust Library)

**Source**: https://github.com/nwesterhausen/dfraw_parser

A Rust library for parsing DF raw files into JSON representations. Potentially useful as a high-performance alternative backend for raw parsing in Chronicler, but would require Rust FFI integration (PyO3 or similar).

---

## 3. Raw File Architecture

### 3.1 DF Raw File Format

**Parsing Algorithm** (canonical, from DF-Modloader):
```
state = COMMENTS
for each character c:
  if state == COMMENTS and c == '[': state = TOKEN; token = ""
  elif state == TOKEN:
    if c == ':': state = ARGS; args = ""
    elif c == ']': emit([token]); token = ""; state = COMMENTS
    else: token += c
  elif state == ARGS:
    if c == ']': emit([token] + args.split(':')); reset; state = COMMENTS
    else: args += c
```

Everything outside square brackets is treated as a comment and discarded by the parser. This means raw files use comments for documentation, and the bracket-delimited token system is the entire semantic content.

### 3.2 File Headers and Load Order

The FIRST LINE of each raw file determines its category. DF-Modloader codifies the canonical ordering:

```
o_template, language, descriptor_shape, descriptor_color,
descriptor_pattern, material_template, inorganic, plant,
tissue_template, item, building, b_detail_plan, body,
c_variation, creature, entity, reaction, interaction, edit
```

Object template files (`o_template_*`) are loaded first to ensure templates are available for later object compilation.

### 3.3 Object Types

DF recognizes 18 super-types mapped to specific file prefixes. Each file begins with `[OBJECT:TYPE]`. Object IDs within a super-type must be globally unique -- duplicate IDs cause silent corruption, not a clean last-wins override. This is one of the most critical facts for conflict detection.

### 3.4 v50+ Patching Tokens

**SELECT_<TYPE>**: Appends tokens to an existing object without redefining it entirely.
```
[SELECT_CREATURE:DWARF]
    [SELECT_CASTE:FEMALE]
        [BODY_DETAIL_PLAN:FACIAL_HAIR_TISSUE_LAYERS]
```

**CUT_<TYPE>**: Removes an object entirely, even if defined earlier in load order.
```
[CUT_CREATURE:ELEPHANT]
```

**Applicable to**: CREATURE, ENTITY, INTERACTION, ITEM, WORD/TRANSLATION/SYMBOL, INORGANIC, PLANT, MUSIC/SOUND, REACTION.

**Sub-object selectors**: SELECT_CASTE, SELECT_ADDITIONAL_CASTE, SELECT_MATERIAL, SELECT_TISSUE, SELECT_TISSUE_LAYER, SELECT_GROWTH.

**Limitation**: Cannot REMOVE an existing token from most objects via SELECT alone. Workarounds: `[CV_REMOVE_TAG]` for creatures, or CUT+redefine for other types.

**Conflict Rules**:
- Two mods both SELECT same object: coexist (both patches apply)
- One mod CUTs an object another SELECTs: CUT wins if loaded after
- This is the primary source of cross-mod conflicts in v50

**Best Practice** (official): Prefer SELECT over CUT; prefer CUT over conflicting with (not loading) vanilla raws.

### 3.5 info.txt Metadata Format (v50)

Every mod must contain `info.txt` in its root folder. Token format mirrors raw file syntax.

**Required Fields**:
| Token | Description |
|-------|-------------|
| `[ID:mod_id]` | Unique identifier (no spaces). Used by DFHack. |
| `[NAME:Display Name]` | Human-readable name |
| `[NUMERIC_VERSION:N]` | Integer version. Must be >= EARLIEST_COMPATIBLE. |
| `[DISPLAYED_VERSION:str]` | Display string only |
| `[EARLIEST_COMPATIBLE_NUMERIC_VERSION:N]` | Oldest compatible version |
| `[EARLIEST_COMPATIBLE_DISPLAYED_VERSION:str]` | Display string only |
| `[AUTHOR:name]` | Creator name |

**Optional Dependency Fields**:
| Token | Description |
|-------|-------------|
| `[DESCRIPTION:text]` | Shown in mod loading screen |
| `[REQUIRES_ID:mod_id]` | Cannot use unless named mod is loaded |
| `[REQUIRES_ID_BEFORE_ME:mod_id]` | Named mod must appear earlier in load order |
| `[REQUIRES_ID_AFTER_ME:mod_id]` | Named mod must appear later in load order |
| `[CONFLICTS_WITH_ID:mod_id]` | Cannot use if named mod is also loaded |

**Steam Workshop Fields**:
`STEAM_TITLE`, `STEAM_DESCRIPTION`, `STEAM_TAG`, `STEAM_KEY_VALUE_TAG`, `STEAM_METADATA`, `STEAM_CHANGELOG`, `STEAM_FILE_ID` (auto-assigned on first upload).

**Pre-v50 Format** (DF-Modloader `mod_info.txt`):
```
name:Vanilla Dwarf Fortress
version:0.47.05
creator:Bay 12 Games
df_version:0.47.05
description_string:Vanilla raws from Dwarf Fortress 0.47.05
dependencies_string:No dependencies.
```

### 3.6 Mod Folder Structure (v50 Steam)

```
<DF_dir>/
  Mods/                          # Installed/downloaded mods (not subscribed WS mods)
  data/
    vanilla/                     # Vanilla mod folders
      vanilla_creatures/
        info.txt
        objects/
          creature_*.txt
    installed_mods/              # Mods activated for the current world (auto-copied)
      <mod_id>_<version>/
        info.txt
        objects/
        graphics/
  dfhack-config/
    mod-manager.json             # DFHack modpack presets
```

Steam Workshop mods stored in Steam workshop content folder (`<Steam>/steamapps/workshop/content/975370/`), not in DF directory. DFHack's mod list includes them if DF has loaded them.

### 3.7 Compiled Output Format

From DF-Modloader's compiler output:
```
creature_compiled

[OBJECT:CREATURE]

Vanilla Dwarf Fortress 0.47.05, creature_dwarf.txt
[CREATURE:DWARF]
    [BODY:HUMANOID_NECK]
    ...
```

Source comments track which mod and file each object came from. One file per super-type.

---

## 4. Mod History in Database (Chronicler-Unique Feature)

### 4.1 Concept

This is explicitly called out in the planning history as a unique Chronicler differentiator: "Mod history in DB: Unique feature -- link game events to the modpack active at time of generation" (planning-history.md Section 1.3, item 6).

No existing DF tool tracks which mods were active when game content was generated. This enables powerful analytical queries that are otherwise impossible.

### 4.2 Proposed Database Schema

```sql
-- Modpack snapshot per world
CREATE TABLE IF NOT EXISTS world_modpacks (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    snapshot_time   TIMESTAMPTZ DEFAULT NOW(),
    snapshot_type   TEXT NOT NULL DEFAULT 'worldgen',  -- 'worldgen', 'save_load', 'manual'
    modpack_name    TEXT,
    modpack_json    JSONB NOT NULL,  -- Full ordered mod list with versions
    UNIQUE (world_id, snapshot_time)
);

-- Individual mod records for efficient querying
CREATE TABLE IF NOT EXISTS world_mod_entries (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INT NOT NULL REFERENCES world_modpacks(id) ON DELETE CASCADE,
    load_order      INT NOT NULL,
    mod_id          TEXT NOT NULL,
    mod_name        TEXT,
    numeric_version INT,
    displayed_version TEXT,
    author          TEXT,
    UNIQUE (snapshot_id, mod_id)
);

-- Optional: link specific raw objects to their defining mod
CREATE TABLE IF NOT EXISTS mod_object_attribution (
    world_id        INT NOT NULL,
    object_type     TEXT NOT NULL,   -- 'CREATURE', 'ENTITY', etc.
    object_id       TEXT NOT NULL,   -- 'DWARF', 'MOUNTAIN', etc.
    defining_mod_id TEXT NOT NULL,
    source_file     TEXT,
    PRIMARY KEY (world_id, object_type, object_id)
);
```

### 4.3 modpack_json Format

Following the DFHack `mod-manager.json` schema:
```json
{
  "snapshot_type": "worldgen",
  "modpack_name": "My Modded World",
  "mods": [
    {"id": "vanilla_text", "version": 5310, "name": "Vanilla Text", "load_order": 0},
    {"id": "vanilla_creatures", "version": 5310, "name": "Vanilla Creatures", "load_order": 1},
    {"id": "masterwork_reborn", "version": 200, "name": "Masterwork Reborn", "load_order": 2}
  ]
}
```

### 4.4 Capture Mechanism

**During Worldgen Monitoring**: The worldgen-bridge.lua script (already planned) can capture `data/installed_mods/` contents or query DFHack memory for the active mod list. Store as the initial snapshot for the world being generated.

**On Save Load**: When the watcher detects a new world being loaded, snapshot the current mod state.

**Manual Trigger**: CLI command `chronicler mods snapshot` to manually record current state.

### 4.5 Analytical Queries Enabled

```sql
-- What mods were active when world "Namoram" was generated?
SELECT wme.mod_id, wme.mod_name, wme.numeric_version, wme.load_order
FROM world_modpacks wp
JOIN world_mod_entries wme ON wme.snapshot_id = wp.id
WHERE wp.world_id = 8 AND wp.snapshot_type = 'worldgen'
ORDER BY wme.load_order;

-- Did the active modpack change between saves?
SELECT wp1.snapshot_time, wp2.snapshot_time,
       jsonb_array_elements(wp1.modpack_json->'mods') AS mods_before,
       jsonb_array_elements(wp2.modpack_json->'mods') AS mods_after
FROM world_modpacks wp1, world_modpacks wp2
WHERE wp1.world_id = wp2.world_id
  AND wp1.snapshot_time < wp2.snapshot_time;

-- Which mod defined the creature "GIANT_CAVE_SPIDER"?
SELECT moa.defining_mod_id, wme.mod_name
FROM mod_object_attribution moa
JOIN world_mod_entries wme ON moa.defining_mod_id = wme.mod_id
WHERE moa.object_type = 'CREATURE' AND moa.object_id = 'GIANT_CAVE_SPIDER';
```

### 4.6 Integration with Storyteller

When the storyteller narrates events involving modded content, it can include provenance information: "The Giant Cave Spider, a creature introduced by the 'Forgotten Beasts Expanded' mod, terrorized the fortress..."

### 4.7 Integration with Explorer

Explorer entity pages can show a "Mod Source" badge indicating which mod defined or modified the entity. The annotation layer would cross-reference `mod_object_attribution` with the world's modpack snapshot.

---

## 5. Data Requirements

### 5.1 File System Access

| Resource | Path Pattern | Access Mode | Purpose |
|----------|-------------|-------------|---------|
| Installed mods | `<DF_dir>/Mods/*/info.txt` | Read | Discover available mods |
| Vanilla mods | `<DF_dir>/data/vanilla/*/info.txt` | Read | Discover vanilla mod components |
| Active mods | `<DF_dir>/data/installed_mods/*/info.txt` | Read | Determine currently active mods |
| Raw files | `<DF_dir>/data/installed_mods/*/objects/*.txt` | Read | Parse for conflict detection |
| DFHack config | `<DF_dir>/dfhack-config/mod-manager.json` | Read/Write | Modpack profiles |
| Steam Workshop | `<Steam>/steamapps/workshop/content/975370/*/info.txt` | Read | Workshop mod discovery |
| Preview images | `<DF_dir>/Mods/*/preview.png` | Read | UI thumbnails |

**Note**: All file access is on the Windows VM (UTM or HomeServer), accessed via SSH/SCP. The mod manager cannot access the local macOS filesystem for DF files.

### 5.2 Database Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `world_modpacks` | Modpack snapshots per world | Not started |
| `world_mod_entries` | Individual mod records per snapshot | Not started |
| `mod_object_attribution` | Which mod defines which raw object | Not started |
| `mod_cache` | Cached mod metadata for offline access | Not started |

### 5.3 DFHack Integration

| Integration Point | Method | Purpose |
|-------------------|--------|---------|
| Mod list query | `dfhack-run` over SSH -> `reqscript('gui/mod-manager').get_modlist_fields()` | Live mod discovery |
| Active load order | `get_modlist_fields('object_load_order', viewScreen)` | Current load order |
| World creation screen check | DFHack viewscreen detection | Required for memory query |
| Worldgen mod capture | worldgen-bridge.lua extension | Snapshot at world creation |

### 5.4 Remote Access Patterns

Since DF runs on a Windows VM and Chronicler runs on macOS, all mod management operations must work over the network:

1. **Primary**: `dfhack-run` over SSH for DFHack memory queries
2. **Secondary**: SCP for file transfer (reading info.txt, raw files)
3. **Tertiary**: HTTP file server for bulk file reads
4. **Cached**: Local PostgreSQL for offline access to previously scanned data

---

## 6. Existing Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| info.txt parser | NOT STARTED | |
| mod-manager.json reader/writer | NOT STARTED | |
| Level 1 conflict detection | NOT STARTED | |
| Level 2 object ID conflict detection | NOT STARTED | |
| Level 3 semantic conflict detection | NOT STARTED | |
| Raw file tokenizer | NOT STARTED | |
| Modpack CRUD | NOT STARTED | |
| Mod browser UI | NOT STARTED | |
| Mod history in DB | NOT STARTED | Schema designed but not implemented |
| DFHack mod discovery integration | NOT STARTED | DFHack RPC/SSH infrastructure exists |
| Steam Workshop detection | NOT STARTED | |
| Three-way merge | NOT STARTED | |
| Raw compiler | NOT STARTED | |
| CLI commands (`chronicler mods`) | NOT STARTED | CLI framework exists |
| Worldgen mod snapshot | NOT STARTED | Worldgen bridge not yet implemented |

**Related existing infrastructure**:
- DFHack SSH transport (`dfhack-run`) -- VERIFIED WORKING
- SCP file transfer -- VERIFIED WORKING
- HTTP file server -- VERIFIED WORKING
- PostgreSQL CDM schema -- COMPLETE (35+ tables, would need mod tables added)
- CLI framework (Click) -- COMPLETE
- FastAPI web backend -- COMPLETE
- Explorer UI -- COMPLETE (6 tabs, would need Mods tab added)

---

## 7. Open Questions and Design Decisions

### 7.1 Unresolved Design Decisions

| # | Question | Options | Status |
|---|----------|---------|--------|
| Q-01 | Should the mod manager be a standalone tool or integrated into Chronicler? | A) Integrated (new `Mods` tab in explorer + CLI commands). B) Standalone Python tool. C) Both (shared library). | Recommendation: Integrated, with CLI interface first |
| Q-02 | How to handle raw file access on remote VM? | A) SCP individual files on demand. B) Bulk transfer all raws to local cache. C) HTTP file server for directory listing. | Recommendation: Bulk transfer to local cache, refresh on demand |
| Q-03 | Should Chronicler implement the full raw compiler? | A) Yes, full DF-Modloader-style. B) No, only parsing and analysis. C) Defer to Phase N+. | Recommendation: Defer. Level 1-2 conflict detection is sufficient for MVP |
| Q-04 | How to detect mid-save modpack changes? | A) Compare installed_mods between sessions. B) Track via DFHack memory. C) Manual user declaration. | Open -- needs design |
| Q-05 | Version integer format reliability? | Observed: dots removed. `"53.10"` -> `5310`, `"1.0.0"` -> `100`. Not formally documented. | Needs validation against DFHack behavior |
| Q-06 | Steam Workshop path on Windows ARM VM? | Standard path: `<Steam>/steamapps/workshop/content/975370/`. Untested on ARM Windows under UTM. | Needs empirical verification |
| Q-07 | Should mod annotations be shown in storyteller output? | A) Always. B) Only when asked. C) Only for non-vanilla content. | Recommendation: Option C |
| Q-08 | What about `BP_LAYERS/BP_POSITION/BP_RELATION`? | DF-Modloader notes these body detail plan tokens are not convertible to OBJECT_TEMPLATE equivalents. | Requires special-case handling if raw compiler is implemented |
| Q-09 | Conflict resolution for modpack transitions mid-save? | Listed as unresolved in planning history Section 13.2 | Open -- needs design |
| Q-10 | Virtual file system feasibility for DF? | DF requires physical file copies. MO2 pattern may not be feasible. | Likely not feasible without DF engine changes |

### 7.2 Key Uncertainties (from mod-management-research.md)

1. **SELECT/CUT token order semantics across mods**: Exact rules for how DF resolves multiple SELECTs and CUT+SELECT interactions not confirmed from official source code. Documented behavior (CUT wins if after SELECT) is inferred from wiki.

2. **DFHack Lua API stability**: `get_modlist_fields()` and `get_newregion_viewscreen()` are internal DFHack APIs, not formally documented for third-party use. May change across releases.

3. **`mod-manager.json` version integer format**: Observed from ModHearth source, not DFHack documentation. Unusual version strings need validation.

4. **Workshop mod path on HomeServer/VM**: Whether Workshop mods appear in `base_available` without extra configuration is unconfirmed.

5. **BP_LAYERS/BP_POSITION/BP_RELATION handling**: Not convertible to OBJECT_TEMPLATE equivalents -- special cases needed.

### 7.3 Key Insights (from planning-history.md Section 11, items 43-49)

43. **v50 is a clean break** from pre-v50 modding -- new info.txt format, SELECT/CUT tokens, modular folder structure.
44. **Duplicate object IDs cause silent corruption** -- not a clean last-wins override. This is the highest-priority conflict to detect.
45. **DFHack's GUI mod manager API is undocumented** -- `get_modlist_fields()` is internal.
46. **No LOOT equivalent for DF** -- significant opportunity for Chronicler to fill this gap.
47. **Modpack history in DB** enables powerful queries no other tool offers.
48. **Cross-platform requirement** -- ModHearth is Windows-only; Chronicler must work from macOS.
49. **Steam Workshop integration gap** -- no existing DF tool integrates with Workshop for updates.

---

## 8. Recommended Implementation Tiers

### Tier 1 -- MVP "Modpack Manager" (Estimated: 20-30 hrs)

Minimum viable mod management. Build on ModHearth patterns.

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| info.txt token parser (v50 format) | 4-6 hrs | None |
| mod-manager.json reader/writer | 2-3 hrs | None |
| Filesystem mod scanner (via SCP/SSH) | 3-4 hrs | VM SSH infrastructure |
| Level 1 metadata conflict detector | 3-4 hrs | info.txt parser |
| Modpack CRUD (create, rename, delete, set-default, import, export) | 3-4 hrs | mod-manager.json R/W |
| CLI commands (`chronicler mods list/check/profiles/activate`) | 3-4 hrs | All above |
| Mod history DB schema + worldgen capture | 3-4 hrs | Worldgen bridge |

### Tier 2 -- "Raw Analyzer" (Estimated: 30-40 hrs)

Raw-level conflict detection and analysis.

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| Raw file tokenizer | 4-6 hrs | None |
| Object type catalog (18+ types) | 2-3 hrs | Tokenizer |
| Level 2 duplicate object ID detector | 4-6 hrs | Tokenizer, mod scanner |
| SELECT/CUT token detector | 4-6 hrs | Tokenizer |
| Per-object mod attribution | 3-4 hrs | Object catalog |
| Mod content summary | 3-4 hrs | Object catalog |
| Raw visual diff viewer | 6-8 hrs | Tokenizer, UI |
| Explorer Mods tab (web UI) | 6-8 hrs | All above |

### Tier 3 -- "Raw Compiler" (Estimated: 60-80 hrs)

Full compilation pipeline. Only if explicitly required.

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| Full raw compiler (EDIT/OT/CTF) | 20-30 hrs | Tokenizer, object catalog |
| OBJECT_TEMPLATE compilation | 8-12 hrs | Compiler core |
| USE_OBJECT_TEMPLATE processing | 8-12 hrs | OT compilation |
| Three-way merge (PyLNP pattern) | 8-12 hrs | Tokenizer |
| Legacy mod migration (SyntaxUpdater) | 4-6 hrs | Compiler core |
| Vanilla baseline management | 4-6 hrs | Merge system |
| Level 3 semantic conflict detection | 6-8 hrs | Full compiler |

### Tier 4 -- Stretch Features (Estimated: 40-60 hrs)

Nice-to-have features for a complete mod management experience.

| Component | Effort | Dependencies |
|-----------|--------|-------------|
| LOOT-style auto-order | 8-12 hrs | Dependency graph |
| Steam Workshop integration | 8-12 hrs | Workshop API access |
| Mod update notifications | 6-8 hrs | Workshop integration |
| Token-level raw API (PyDwarf pattern) | 8-12 hrs | Tokenizer |
| Embedded raw editor | 8-12 hrs | Token API, UI |
| Virtual file system (if feasible) | 12-16 hrs | Deep DF integration |

---

## 9. Comparison Table: Feature Coverage Across Tools

| Feature | DF-Modloader | ModHearth | PyLNP | PyDwarf | Vortex | Chronicler (Target) |
|---------|-------------|-----------|-------|---------|--------|---------------------|
| Raw file parsing | Full token parser | None (delegates) | Line-based | Token linked-list | N/A | Token parser (Python) |
| Mod compilation | Full compiler (EDIT/OT/CTF) | None | Merge only | Script API | N/A | Optional (Tier 3) |
| Conflict detection | None | info.txt deps | Overlap detection | None | File-level | Level 1+2 (Tier 1-2) |
| Load order management | Manual list | Drag-and-drop + scanner | Sequential merge | N/A | LOOT integration | Drag-and-drop + auto-order |
| DFHack integration | None | Full (Lua memory) | None | None | N/A | SSH-based (dfhack-run) |
| Modpack profiles | None | Full (CRUD + I/E) | None | None | Full | Full (CRUD + I/E) |
| Mod browser/search | Basic 2-pane | 2-pane + search | Tab-based | N/A | Full | 2-pane + search + filter |
| Mod metadata | Name/ver/desc | Name/desc/preview | Tooltip | N/A | Full | Full + DB storage |
| Backup/restore | Syntax updater | Undo (in-session) | Baseline mgmt | N/A | Full rollback | Undo + snapshots |
| SELECT/CUT awareness | No (pre-v50) | Implicit (DF) | No (pre-v50) | No (pre-v50) | N/A | Yes (Tier 2) |
| Raw diff/viewer | No | No | No | Partial | Visual diff | Yes (Tier 2) |
| Steam Workshop | No | Partial (via DFHack) | No | No | Full | Partial (detection) |
| Cross-platform | Win (tkinter) | Win only | Win/Linux/Mac | Python 2.7 | Win | macOS + remote VM |
| Mod history in DB | No | No | No | No | No | **Yes (unique)** |
| Mod annotations | No | No | No | No | No | **Yes (unique)** |
| Three-way merge | No | No | Yes (gold standard) | No | No | Yes (Tier 3) |
| Auto-order (LOOT) | No | No | No | No | Yes | Yes (Tier 4) |

---

## 10. Data Model Recommendation

### 10.1 Python Data Classes

```python
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

@dataclass
class DFMod:
    """Minimal identity -- matches DFHack's internal representation."""
    id: str
    version: int  # numeric_version with dots removed

@dataclass
class ModMetadata:
    """Rich metadata from info.txt and filesystem."""
    id: str
    numeric_version: int
    displayed_version: str
    earliest_compat_version: int
    author: str
    name: str
    description: str
    path: Path
    steam_id: Optional[str] = None
    requires_id: List[str] = field(default_factory=list)
    requires_id_before_me: List[str] = field(default_factory=list)
    requires_id_after_me: List[str] = field(default_factory=list)
    conflicts_with_id: List[str] = field(default_factory=list)
    raw_files: List[Path] = field(default_factory=list)

@dataclass
class Modpack:
    """A named, ordered collection of mods -- maps to mod-manager.json entry."""
    name: str
    default: bool
    modlist: List[DFMod]

@dataclass
class ConflictProblem:
    """A detected conflict between mods."""
    problem_type: str  # 'MissingBefore', 'MissingAfter', 'ConflictPresent',
                       # 'DuplicateObjectID', 'CUTSelectConflict', 'VersionIncompat'
    mod_id: str
    related_mod_id: Optional[str]
    description: str
    severity: str  # 'error', 'warning', 'info'

@dataclass
class RawObject:
    """Parsed raw file object definition."""
    object_type: str     # 'CREATURE', 'ENTITY', etc.
    object_id: str       # 'DWARF', 'MOUNTAIN', etc.
    tokens: List[List[str]]  # Each token as list of strings
    source_file: str
    source_mod_id: str
    is_removed: bool = False
    is_select: bool = False  # SELECT_<TYPE> patch
    is_cut: bool = False     # CUT_<TYPE> removal
```

### 10.2 DFHack Integration Recommendation

Three-tier resilience pattern:

1. **Primary**: Parse `info.txt` files directly from filesystem via SCP/SSH. Scan `<DF_dir>/Mods/`, `<DF_dir>/data/vanilla/`, `<DF_dir>/data/installed_mods/`.
2. **Secondary**: If DFHack is available and DF is running, use Lua query (`get_modlist_fields`) for live memory data (more accurate versioning).
3. **Fallback**: If neither available, show cached mod list from last successful scan.

This is more robust than ModHearth's approach (which requires DF at world creation screen).

---

## 11. Action Items

### Immediate (Tier 1 -- MVP)
- [ ] Build `info.txt` parser supporting all v50 token fields
- [ ] Implement `mod-manager.json` reader/writer using `DFHModpack` schema
- [ ] Implement Level 1 conflict detection (metadata-only)
- [ ] Implement `objects/*.txt` scanner for Level 2 duplicate ID detection
- [ ] Design modpack profile CRUD operations
- [ ] Implement CLI commands (`chronicler mods list/check/profiles/activate`)
- [ ] Add mod search/filter for browsing available mods
- [ ] Create `world_modpacks` and `world_mod_entries` DB tables

### Near-term (Tier 2 -- Raw Analyzer)
- [ ] Build raw file tokenizer (DF-Modloader state machine)
- [ ] Implement SELECT/CUT token detection
- [ ] Build per-object mod attribution map
- [ ] Implement raw visual diff viewer
- [ ] Add Mods tab to Explorer UI
- [ ] Implement mod content summary generation

### Long-term (Tier 3-4 -- Compiler + Stretch)
- [ ] Implement full raw compiler (only if explicitly required)
- [ ] Implement three-way merge (PyLNP pattern)
- [ ] Build LOOT-style topological sort auto-order
- [ ] Add Steam Workshop integration
- [ ] Build embedded raw editor

### Verification Needed
- [ ] Validate version integer format against actual DFHack behavior
- [ ] Test Steam Workshop mod path on Windows ARM VM
- [ ] Verify `get_modlist_fields()` API stability across DFHack versions
- [ ] Confirm SELECT/CUT ordering rules from DF source behavior
- [ ] Test `BP_LAYERS/BP_POSITION/BP_RELATION` handling if compiler is built

---

## 12. Sources

### Repository Sources (Direct Source Code Inspection)
1. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/raw_handler.py` -- Full raw compiler (~1,270 lines)
2. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/main.py` -- Tkinter GUI (~400 lines)
3. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModHearthManager.cs` -- Core logic
4. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModReference.cs` -- Metadata parsing
5. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/DFHackModClasses.cs` -- Data structures
6. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/bin/Debug/net7.0-windows/GetModMemoryData.lua` -- DFHack Lua

### Documentation Sources
7. [Dwarf Fortress Wiki -- Info.txt file](https://dwarffortresswiki.org/index.php/Info.txt_file)
8. [Dwarf Fortress Wiki -- Mod info token](https://dwarffortresswiki.org/index.php/Mod_info_token)
9. [Dwarf Fortress Wiki -- Modding](https://dwarffortresswiki.org/index.php/Modding)
10. [Dwarf Fortress Wiki -- Raw file](https://dwarffortresswiki.org/index.php/Raw_file)
11. [Dwarf Fortress Wiki -- Mod](https://dwarffortresswiki.org/index.php/Mod)
12. [Bay 12 Games Modding Guide](https://bay12games.com/dwarves/modding_guide.html)
13. [DFHack gui/mod-manager documentation](https://docs.dfhack.org/en/stable/docs/tools/gui/mod-manager.html)
14. [DFHack gui/mod-manager.lua source](https://github.com/DFHack/scripts/blob/master/gui/mod-manager.lua)
15. [PyLNP core.mods module](http://pylnp.birdiesoft.dk/docs/dev/core/core.mods.html)
16. [PyDwarf GitHub](https://github.com/pineapplemachine/PyDwarf)
17. [Nexus Mods Wiki -- About Load Orders](https://wiki.nexusmods.com/index.php/About_Load_Orders)
18. [Nexus Mods Wiki -- File Conflicts](https://wiki.nexusmods.com/index.php/File_Conflicts:_Nexus_Mod_Manager_vs_Vortex)
19. [Vortex load order approach](https://wiki.nexusmods.com/index.php/The_Vortex_approach_to_load_order_sorting)
20. [Voliol -- DF Mod Structure article](https://voliol.neocities.org/articles/df_mod_structure)
21. [dfraw_json_parser Rust library](https://github.com/nwesterhausen/dfraw_parser)

### Chronicler Project Documents
22. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/planning-history.md` -- Sections 1.3, 3.5, 8.7, 11 (items 43-49), 13.2
23. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/mod-management-research.md` -- Complete document
24. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/dfhack-infrastructure-research.md` -- DFHack integration patterns
25. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research-synthesis.md` -- Section 9 (Mod Management Scope Assessment)

---

*Component 5 of 6 -- Dwarf Fortress Mod Manager. Exhaustive feature extraction from all source documents. 44 discrete features identified across 8 categories. "When in doubt, put it in."*
