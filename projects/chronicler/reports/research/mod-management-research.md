# Research Report: Dwarf Fortress Mod Management Tools & Ecosystem

**Date**: 2026-02-23
**Scope**: Deep analysis of DF-Modloader (voliol), ModHearth (ch3mbot), PyLNP, PyDwarf, the DF raw file format, info.txt metadata, the DFHack mod-manager system, and comparable mod management patterns from NexusMods/Vortex. Goal: inform Chronicler's mod management suite requirements.

---

## Executive Summary

Dwarf Fortress modding underwent a fundamental restructuring in v50 (December 2022 Steam release). The new system introduces first-class mod support with a dedicated `info.txt` metadata format, a modular folder structure, native SELECT/CUT patching tokens, and DFHack integration through `mod-manager.json`. Two reference tools were analyzed in depth from source code: DF-Modloader (a Python mockup implementing a complete raw compiler with EDIT/OBJECT_TEMPLATE compilation) and ModHearth (a C# Windows GUI that manages modpacks by reading DF memory live via DFHack Lua). The broader ecosystem includes PyLNP (three-way merge using difflib), PyDwarf (doubly-linked token list API), and the dfraw_json_parser Rust library.

For Chronicler's mod management suite, the minimum viable feature set is: mod detection via DFHack memory query, modpack CRUD backed by `mod-manager.json`, conflict detection using info.txt dependency fields, load order validation, raw file parsing for conflict analysis, and profile import/export. Stretch features include a raw compiler (DF-Modloader style), visual diff of raw objects across mods, and an embedded raw editor.

---

## Key Findings

### Finding 1: DF v50 Raw File Format

**Parsing algorithm.** Raw files are plain text. The parser discards everything outside square brackets as comments. Tokens are delimited by `[` and `]`, with the token name as the first colon-separated field and zero or more arguments following. The pseudocode from DF-Modloader's `split_lines_into_tokens()` is the canonical reference:

```
state = COMMENTS
for each character c:
  if state == COMMENTS and c == '[': state = TOKEN
  elif state == TOKEN:
    if c == ':': state = ARGS
    elif c == ']': emit([token]); token = ""; state = COMMENTS
    else: token += c
  elif state == ARGS:
    if c == ']': emit([token] + args.split(':')); reset; state = COMMENTS
    else: args += c
```

**File headers and load order.** The *first line* of each raw file (not the filename) determines its category. DF-Modloader codifies the canonical ordering in `header_load_order`:

```
o_template, language, descriptor_shape, descriptor_color,
descriptor_pattern, material_template, inorganic, plant,
tissue_template, item, building, b_detail_plan, body,
c_variation, creature, entity, reaction, interaction, edit
```

Object template files (`o_template_*`) are loaded first to ensure templates are available for later object compilation.

**Object types.** DF recognizes 18 super-types mapped to specific file prefixes. Each file begins with `[OBJECT:TYPE]`. Object IDs within a super-type must be globally unique — duplicate IDs cause silent corruption, not a clean last-wins override.

**Source**: DF-Modloader `/raw_handler.py` lines 6–84; comments reference the DF Wiki raw file parsing article.

---

### Finding 2: DF v50+ Patching Tokens (SELECT / CUT)

v50.01+ introduced native patch tokens that allow mods to modify vanilla objects without wholesale file replacement.

**SELECT_<TYPE>:** Appends tokens to an existing object. The entire object definition does not need to be present. Example:

```
[SELECT_CREATURE:DWARF]
    [SELECT_CASTE:FEMALE]
        [BODY_DETAIL_PLAN:FACIAL_HAIR_TISSUE_LAYERS]
```

**CUT_<TYPE>:** Removes an object entirely, even if defined earlier in the load order. Example: `[CUT_CREATURE:ELEPHANT]`

**Applicable to:** CREATURE, ENTITY, INTERACTION, ITEM, WORD/TRANSLATION/SYMBOL, INORGANIC, PLANT, MUSIC/SOUND, REACTION.

**Sub-object selectors:** `SELECT_CASTE`, `SELECT_ADDITIONAL_CASTE`, `SELECT_MATERIAL`, `SELECT_TISSUE`, `SELECT_TISSUE_LAYER`, `SELECT_GROWTH`.

**Limitation:** You cannot *remove* an existing token from most objects via SELECT alone. Workaround: `[CV_REMOVE_TAG]` for creatures, or CUT+redefine for other types.

**Conflict implication for Chronicler:** If two mods both SELECT the same object, they can coexist (both patches apply). If one mod CUTs an object that another SELECTs, the CUT wins if it loads after. This is the primary source of cross-mod conflicts in v50.

**Best practice (official):** prefer SELECT over CUT; prefer CUT over conflicting with (not loading) vanilla raws.

**Source**: [Dwarf Fortress Wiki — Modding](https://dwarffortresswiki.org/index.php/Modding); [Bay 12 modding guide](https://bay12games.com/dwarves/modding_guide.html)

---

### Finding 3: info.txt Metadata Format (v50)

Every mod must contain an `info.txt` in its root folder. The token format mirrors raw file syntax.

**Required fields:**
| Token | Description |
|-------|-------------|
| `[ID:mod_id]` | Unique mod identifier (no spaces). Used by DFHack. |
| `[NAME:Display Name]` | Human-readable name |
| `[NUMERIC_VERSION:N]` | Integer version. Must be >= EARLIEST_COMPATIBLE. |
| `[DISPLAYED_VERSION:str]` | Display string only. |
| `[EARLIEST_COMPATIBLE_NUMERIC_VERSION:N]` | Oldest compatible version |
| `[EARLIEST_COMPATIBLE_DISPLAYED_VERSION:str]` | Display string only. |
| `[AUTHOR:name]` | Creator name |

**Optional fields:**
| Token | Description |
|-------|-------------|
| `[DESCRIPTION:text]` | Shown in mod loading screen |
| `[REQUIRES_ID:mod_id]` | Cannot use unless named mod is loaded |
| `[REQUIRES_ID_BEFORE_ME:mod_id]` | Named mod must appear earlier in load order |
| `[REQUIRES_ID_AFTER_ME:mod_id]` | Named mod must appear later in load order |
| `[CONFLICTS_WITH_ID:mod_id]` | Cannot use if named mod is also loaded |

**Steam fields** (for Workshop publishing):
`STEAM_TITLE`, `STEAM_DESCRIPTION`, `STEAM_TAG`, `STEAM_KEY_VALUE_TAG`, `STEAM_METADATA`, `STEAM_CHANGELOG`, `STEAM_FILE_ID` (auto-assigned on first upload).

**DF-Modloader's older format** uses a flat key:value approach in `mod_info.txt`:
```
name:Vanilla Dwarf Fortress
version:0.47.05
creator:Bay 12 Games
df_version:0.47.05
description_string:Vanilla raws from Dwarf Fortress 0.47.05
dependencies_string:No dependencies.
```

This is the pre-v50 format. The v50 Steam version uses the bracketed token format with the fields above.

**Source**: [Dwarf Fortress Wiki — Info.txt file](https://dwarffortresswiki.org/index.php/Info.txt_file); [Mod info token](https://dwarffortresswiki.org/index.php/Mod_info_token); ModHearth `ModReference.cs` lines 87-111.

---

### Finding 4: DF-Modloader — Raw Compiler Deep Dive

DF-Modloader (voliol, 2021) is explicitly a "working mockup" to explore what a mod compiler needs. It is the most complete public reference implementation of DF raw compilation.

**Architecture:**
- `raw_handler.py` — all raw parsing and compilation logic (~1,270 lines)
- `main.py` — Tkinter GUI wrapping the compiler (~400 lines)

**RawObject class:**
```python
class RawObject:
    object_id: str          # e.g., "DWARF"
    tokens: List[List[str]] # each token as a list: ["BODY", "QUADRUPED_NECK"]
    source_file_name: str
    source_mod_name_and_version: str
    is_removed: bool
```

Each token is stored as a flat list of strings (not a linked list). Methods include `has_token()`, `get_token_values()`, `remove_token()`, `convert_token()`, and `tokens_with_arguments_inserted()` (for argument substitution with `!ARG1`, `!ARG2`, etc.).

**Compiler class — compile_mods() pipeline:**
1. For each mod in load order: `read_mod_raws_and_apply_edit_objects(mod)` — reads files in header-sorted order, builds `normal_objects` dict-of-dicts and `normal_objects_lists` dict-of-lists.
2. `apply_special_tokens_to_create_compiled_objects()` — processes OBJECT_TEMPLATE and normal objects through the special token compiler.
3. `write_compiled_objects(output_path)` — writes one `*_compiled.txt` per super-type.

**Reading mode state machine:**
The file parser uses a `reading_mode` variable: `"NONE"`, `"NEW"` (standard object), `"OT"` (object template), or `"EDIT"`.

**EDIT object handling:**
`[EDIT:CREATURE:SEL_BY_CLASS:MAMMAL]` selects all creatures with class MAMMAL, then subsequent tokens are applied to all selected objects. Selection criteria:
- `SEL_BY_ID` — single object by ID
- `SEL_BY_CLASS` — all objects with matching `OBJECT_CLASS` or `CREATURE_CLASS`
- `SEL_BY_TAG` — all objects containing a given token (with leading values)
- `SEL_BY_TAG_PRECISE` — exact token match
- `PLUS_SELECT` — union with additional criteria
- `UNSELECT` — exclude from selection

Within EDIT mode, normal tokens are wrapped as `[OT_ADD_TAG:...]`. Special tokens (`ADD_SPEC_TAG`, `REMOVE_SPEC_TAG`, `CONVERT_SPEC_TAG`) manipulate special tokens directly.

**OBJECT_TEMPLATE compilation:**
Templates support `COPY_TAGS_FROM` (inserts another compiled template's tokens at the insertion_index), `GO_TO_END`/`GO_TO_START`/`GO_TO_TAG` (repositions the insertion cursor), and argument substitution. Recursion detection prevents infinite `COPY_TAGS_FROM` loops via `currently_compiling_ids`.

**USE_OBJECT_TEMPLATE processing (for normal objects):**
`OT_ADD_TAG` inserts tokens, `OT_REMOVE_TAG` removes by matching prefix, `OT_CONVERT_TAG` + `OTCT_TARGET`/`OTCT_REPLACEMENT` does string substitution within token arguments. Conditional variants (`OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG`) check a numbered argument matches a set value.

**REMOVE_OBJECT:** Sets `is_removed = True` on the output object; such objects are skipped during write.

**Output format:**
Each compiled file is `<type>_compiled.txt` with:
```
creature_compiled

[OBJECT:CREATURE]

Vanilla Dwarf Fortress 0.47.05, creature_dwarf.txt
[CREATURE:DWARF]
    [BODY:HUMANOID_NECK]
    ...
```

Source comments track which mod and file each object came from.

**SyntaxUpdater class:**
Converts legacy `c_variation_*` files to `o_template_cv_*` format and `b_detail_plan_*` files to `o_template_bdp_*` format, enabling old mods to work with the new compiler. This is the legacy migration path.

**Mod discovery:** Reads `mod_info.txt` from each subdirectory of `mods/`. Modpack support: if a directory has `modpack_info.txt` instead of `mod_info.txt`, it is treated as a collection of sub-mods.

**Conflict model in DF-Modloader:** There is no explicit conflict detection. The "last mod wins" rule applies — if two mods define `[CREATURE:DWARF]`, the second mod's definition overwrites the first. EDIT objects layer on top of whichever definition exists at the time they are processed (in load order).

**Source**: `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/raw_handler.py` (full file); `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/main.py` (full file)

---

### Finding 5: ModHearth — DFHack-Integrated Mod Manager Deep Dive

ModHearth (ch3mbot, v0.0.3-beta) is a C# Windows Forms application targeting the Steam version of DF with DFHack installed.

**Architecture:**
- `ModHearthManager.cs` — core business logic
- `DFHackModClasses.cs` — `DFHMod` and `DFHModpack` data structures
- `ModReference.cs` — rich mod metadata object
- `ModList.cs` — internal list container
- `UI/MainForm.cs` — Windows Forms UI (~800 lines)
- `bin/.../GetModMemoryData.lua` — DFHack Lua script

**Data model:**
```
DFHMod: { id: string, version: int }   -- DFHack's internal representation
DFHModpack: { default: bool, modlist: DFHMod[], name: string }  -- mod-manager.json structure
ModReference: full metadata (ID, versions, author, name, description, steam fields, paths, dependency lists)
```

**DFHack memory query mechanism:**
ModHearth requires DF to be running and at the world creation screen. It executes:
```
dfhack-run.exe lua -f "GetModMemoryData.lua"
```

The Lua script calls `reqscript('gui/mod-manager')` to access DFHack's mod manager, then calls `manager.get_modlist_fields('base_available', viewScreen)` to retrieve all available mods from DF's in-memory structures. Returned fields per mod: `id`, `name`, `displayed_version`, `numeric_version`, `earliest_compat_numeric_version`, `src_dir`, `mod_header` (contains all info.txt parsed fields as a Lua table).

The output is formatted as a pipe-delimited string with JSON headers:
```
name|version|id|compat_version|numeric_version|src_dir==={"json_headers"}___next_mod...
```

**Conflict detection (`FindModlistProblems`):**
Performs a simulated load-order scan. Maintains two sets: `scannedModIDs` (already loaded) and `unscannedModIDs` (not yet loaded). For each mod:
- `REQUIRES_ID_BEFORE_ME`: checks if required mod is in `scannedModIDs`
- `REQUIRES_ID_AFTER_ME`: checks if required mod is in `unscannedModIDs`
- `CONFLICTS_WITH_ID`: checks if conflicting mod is in either set

Dependency fields are parsed from `info.txt` via regex, not from memory:
```csharp
MatchCollection requireBeforeMatches = Regex.Matches(modInfo,
    @"\[REQUIRES_ID_BEFORE_ME\]:*(.*?)\n|\[REQUIRES_ID_BEFORE_ME:*(.*?)\]",
    RegexOptions.IgnoreCase);
```

Conflict problems are typed as `MissingBefore`, `MissingAfter`, or `ConflictPresent`.

**Modpack management:**
Modpacks read from and written to `<DF_dir>/dfhack-config/mod-manager.json`. The JSON schema exactly mirrors `DFHModpack`:
```json
[
  {
    "default": true,
    "modlist": [
      {"id": "vanilla_creatures", "version": 5310},
      {"id": "some_mod", "version": 100}
    ],
    "name": "Default"
  }
]
```

Version integers are constructed by removing dots from the `numeric_version` string: `"53.10"` → `5310`, `"1.0.0"` → `100`.

**Profile operations:** Create new (from vanilla list), rename, delete (minimum one required), import from JSON file, export to JSON file.

**UI features:**
- Dual-pane drag-and-drop (disabled mods left, enabled mods right)
- Search/filter boxes for each pane
- Mod info panel (name, description, preview.png if present)
- Unsaved changes tracking with `*` marker on the ComboBox
- Undo to last saved state
- Theme switching (light/dark mode)
- Conflict highlighting (red text in right pane for problem mods)

**Mod detection path:** `<DF_dir>/Mods/` — the game's mod storage directory. Does not directly read from Steam Workshop folders; relies on DF having discovered mods first (requires launching DF to the world creation screen at least once).

**Source**: `/Users/nathanielcannon/Claude/GitRepos/ModHearth/` (all .cs files); `/Users/nathanielcannon/Claude/GitRepos/ModHearth/bin/Debug/net7.0-windows/GetModMemoryData.lua`

---

### Finding 6: PyLNP — Three-Way Merge System

PyLNP (Python Lazy Newb Pack) is the predecessor mod management tool for pre-v50 DF. Its merge system is the most sophisticated raw-level merging approach in the DF ecosystem.

**Merge approach:** Three-way file merge using Python's `difflib.SequenceMatcher` and `ndiff`. The three inputs are:
1. **vanilla baseline** — the unmodified vanilla raw file
2. **previously accumulated merge** — the result of all mods merged so far
3. **new mod file** — the file from the mod being added

**Algorithm (`three_way_merge`):** Yields blocks of lines using SequenceMatcher opcode comparison. If the mod changed a region that the accumulated file also changed (both differ from vanilla), this is flagged as an "overlap." The function returns status codes:
- 0 — clean merge
- 1 — potential compatibility issues (no merge problems)
- 2 — overlap merged (non-fatal conflict, manual review recommended)
- 3 — fatal error (triggers rebuild from scratch)

**Visual status:** In the PyLNP UI, merged mods show green (0), yellow (1), orange (2, overlap), or red (3) indicators.

**Baseline management:**
- Baselines live in `LNP/Baselines/`
- The `make_blank_files()` function creates empty placeholder files for vanilla files that a mod doesn't touch, ensuring the merge algorithm has a clean three-way comparison
- `can_rebuild()` verifies the merge log is complete enough to reproduce the exact merge

**`install_mods()`:** Deletes the installed raw folder and copies over the merged raws (atomic replacement).

**`update_raw_dir()`:** In-place update — can replace graphics without full reinstall if the merge log shows no overlaps.

**Relevance to Chronicler:** PyLNP's three-way merge is the gold standard for detecting raw-level conflicts in DF mods. It requires a known vanilla baseline. For v50+ with SELECT/CUT, a more sophisticated approach is needed because the semantics are richer than simple line-based text merging.

**Source**: [PyLNP core.mods documentation](http://pylnp.birdiesoft.dk/docs/dev/core/core.mods.html); Bay 12 Forums [PyLNP mod merging thread](https://www.bay12forums.com/smf/index.php?topic=143662.0)

---

### Finding 7: PyDwarf — Token-Level Raw API

PyDwarf (pineapplemachine, Python 2.7) is the most programmatically sophisticated raw manipulation library in the DF ecosystem.

**Token data model:**
```python
class token:
    value: str          # First field: "CREATURE"
    args: List[str]     # Remaining fields: ["DWARF"]
    prev: token         # Doubly-linked list pointer
    next: token         # Doubly-linked list pointer
    file: rawfile       # Parent file reference (or None)
    prefix: str         # Text before the '[' (preserves whitespace)
    suffix: str         # Text after the ']' (preserves whitespace)
```

**Key capability:** The doubly-linked list allows O(1) insertion, deletion, and traversal. `token.remove()` unlinks the token from the chain. `args` is a mutable list — direct assignment modifies the raw.

**Mod API:** PyDwarf exposes a Python scripting API where mod scripts receive a `raws` object and can traverse/modify any token chain using `filter()`, `get()`, and iteration.

**Comparison with DF-Modloader approach:** DF-Modloader uses flat `List[List[str]]` per object (compact, fast compilation). PyDwarf uses a doubly-linked global token chain (flexible, allows arbitrary traversal). PyDwarf is better for interactive editing; DF-Modloader is better for batch compilation.

**Source**: [PyDwarf GitHub](https://github.com/pineapplemachine/PyDwarf); [PyDwarf modding docs](https://github.com/pineapplemachine/PyDwarf/blob/master/docs/modding.md)

---

### Finding 8: DFHack mod-manager.json Format

The DFHack `gui/mod-manager.lua` script manages modpack presets. The JSON file at `<DF_dir>/dfhack-config/mod-manager.json` has this schema:

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
  },
  {
    "name": "My Modpack",
    "default": false,
    "modlist": [...]
  }
]
```

**Memory query fields** (available through `get_modlist_fields`):
- `id` — string
- `numeric_version` — integer
- `displayed_version` — string
- `earliest_compat_numeric_version` — integer
- `src_dir` — path to mod folder (relative to DF dir)
- `name` — display name from info.txt
- `mod_header` — Lua table with all parsed info.txt fields

**Available data kinds:** `'available'` (all installable mods), `'base_available'` (same, alias), `'object_load_order'` (currently active mods in load order).

**Overlay system:** Two UI overlays on the world creation screen: modpack preset browser (save/load/rename/delete/set-default) and active mod list viewer (with clipboard export, vanilla/non-vanilla filtering).

**Source**: [gui/mod-manager.lua source](https://github.com/DFHack/scripts/blob/master/gui/mod-manager.lua); [DFHack gui/mod-manager documentation](https://docs.dfhack.org/en/stable/docs/tools/gui/mod-manager.html); ModHearth `ModHearthManager.cs` lines 251-283, 305-315

---

### Finding 9: Mod Folder Structure (v50 Steam)

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

**Steam Workshop mods** are stored in the Steam workshop content folder, not in the DF directory. DFHack's mod list includes them if DF has loaded them (they appear in `base_available`).

**Source**: [Dwarf Fortress Wiki — Mod](https://dwarffortresswiki.org/index.php/Mod); ModHearth `ModHearthConfig.cs`

---

### Finding 10: Comparable Mod Manager Features (NexusMods/Vortex)

For benchmarking Chronicler's mod suite against established patterns:

**Vortex (NexusMods):**
- Dual-pane: available vs. installed
- File conflict visualization: red lightning bolt for unresolved, green for resolved
- LOOT integration for automated load order sorting
- Rule-based ordering (mod A before mod B, mod A after group X)
- Profile switching (independent mod configurations per playthrough)
- Import/export modlists as JSON
- Mod-level and file-level conflict resolution with visual diff
- Automatic update notifications via NexusMods API
- Mod preview images and descriptions

**Mod Organizer 2 (alternative):**
- Virtual file system — mods never touch the real game folder
- Complete isolation between mods
- Per-mod activation without reinstall
- Conflict visualization at file level

**LOOT (Load Order Optimisation Tool):**
- Masterlist of community-curated load order rules
- Topological sort based on explicit dependency graph
- Linting: flags missing masters, incompatible pairs, mismatched versions

**Key gap in DF ecosystem:** No equivalent of LOOT exists for DF. No centralized conflict ruleset. No virtual file system isolation (DF requires mods to be physically copied). No mod update system integrated with DFFD or NexusMods DF page.

---

## Comparison Table

| Feature | DF-Modloader | ModHearth | PyLNP | PyDwarf | Needed for Chronicler |
|---------|-------------|-----------|-------|---------|----------------------|
| Raw file parsing | Full token parser | None (delegates to DFHack) | Line-based | Token linked-list | Token parser (Python) |
| Mod compilation | Full compiler (EDIT/OT/CTF) | None | Merge only | Script API | Optional (post-MVP) |
| Conflict detection | None | info.txt dependency fields | Overlap detection | None | Required (info.txt + raw-level) |
| Load order management | Manual list UI | Drag-and-drop + problem scanner | Sequential merge | N/A | Required |
| DFHack integration | None | Full (Lua memory query) | None | None | Desirable (mod discovery) |
| Modpack profiles | None | Full (CRUD + import/export) | None | None | Required |
| Mod browser/search | Basic (2-pane listbox) | 2-pane + search filter | Tab-based | N/A | Required |
| Mod metadata display | Name/version/desc | Name/desc/preview image | Tooltip | N/A | Required |
| Backup/restore | Syntax updater backup | Undo (in-session) | Baseline management | N/A | Required |
| SELECT/CUT awareness | No (pre-v50) | Implicit (delegates to DF) | No (pre-v50) | No (pre-v50) | Required |
| Raw diff/viewer | No | No | No | Partial (traversal API) | Desirable |
| Steam Workshop | No | Partial (via DFHack) | No | No | Desirable |
| Cross-platform | Windows (tkinter) | Windows only | Windows/Linux/Mac | Python 2.7 | Linux/Mac (HomeServer is Win) |

---

## Recommendations

### 1. Primary Recommendation: Tiered Implementation

**MVP (Tier 1 — "Modpack Manager")**
Build on the ModHearth pattern: query mod data via DFHack Lua, manage modpacks in `mod-manager.json`, validate info.txt dependency fields.

Core components:
- DFHack Lua integration for mod discovery (or fallback: scan `<DF_dir>/Mods/` + `data/vanilla/` directly)
- info.txt parser (token-based, matching v50 format)
- Conflict detector implementing `REQUIRES_ID_BEFORE_ME`, `REQUIRES_ID_AFTER_ME`, `CONFLICTS_WITH_ID` logic (modeled on ModHearth's `FindModlistProblems`)
- Modpack CRUD backed by `mod-manager.json` (same schema as ModHearth's `DFHModpack`)
- CLI interface first (aligns with Chronicler's existing pattern)

**Tier 2 — "Raw Analyzer"**
Add raw-level conflict detection using a token parser:
- Parse all `objects/*.txt` files for all active mods
- Detect duplicate object IDs (guaranteed conflict)
- Detect SELECT + CUT interactions across mods
- Report which mods modify the same objects

Token parser implementation: model on DF-Modloader's `split_lines_into_tokens()` + `RawObject` class, upgraded to handle v50 object types including GRAPHICS, PALETTE, TEXT_SET.

**Tier 3 — "Raw Compiler" (Optional/Long-term)**
Full mod compilation in the DF-Modloader style: EDIT objects, OBJECT_TEMPLATE, COPY_TAGS_FROM. Only needed if Chronicler wants to produce pre-merged raw packages. High implementation cost; skip unless explicitly required.

---

### 2. Data Model Recommendation

Use a three-tier data model matching what exists in the ecosystem:

```python
@dataclass
class DFMod:
    """Minimal identity — matches DFHack's internal representation."""
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
    steam_id: Optional[str]
    requires_id: List[str]
    requires_id_before_me: List[str]
    requires_id_after_me: List[str]
    conflicts_with_id: List[str]
    raw_files: List[Path]  # objects/*.txt

@dataclass
class Modpack:
    """A named, ordered collection of mods — maps to mod-manager.json entry."""
    name: str
    default: bool
    modlist: List[DFMod]
```

---

### 3. DFHack Integration Recommendation

ModHearth requires DF to be running at world creation. For Chronicler, a more resilient approach is:

1. **Primary path**: Parse `info.txt` files directly from the filesystem. Scan `<DF_dir>/Mods/`, `<DF_dir>/data/vanilla/`, and `<DF_dir>/data/installed_mods/`.
2. **Secondary path**: If DFHack is available and DF is running, use the Lua query (`get_modlist_fields`) to get live memory data (more accurate versioning).
3. **Fallback**: If neither is available, show cached mod list from last successful scan.

This pattern is more robust for Chronicler's use case (HomeServer may not always be at world creation screen).

---

### 4. Conflict Detection Architecture

Three levels of conflict detection, in order of increasing cost:

**Level 1 — Metadata conflicts** (fast, O(n) in mod count):
- Duplicate mod IDs
- `CONFLICTS_WITH_ID` pairs both present
- `REQUIRES_ID_BEFORE_ME`/`REQUIRES_ID_AFTER_ME` violations
- Version incompatibility (loaded version < `EARLIEST_COMPATIBLE_NUMERIC_VERSION`)

**Level 2 — Object ID conflicts** (medium, O(n×m) in mod count × file count):
- Parse all `objects/*.txt` for each enabled mod
- Build a map of `{object_type: {object_id: [mod_id, ...]}}
- Flag any object_id with multiple mods that define it (not SELECT/CUT — full definitions)
- This is the raw duplication error that causes "offset" bugs

**Level 3 — Semantic conflicts** (expensive, requires full compilation):
- Detect CUT + SELECT interactions (CUT in mod B removes object that mod A's SELECT targets)
- Detect OT_REMOVE_TAG vs. OT_ADD_TAG on same token across mods
- Only feasible with the full DF-Modloader compiler pipeline

---

## Action Items

- [ ] Build `info.txt` parser supporting all v50 token fields (including `REQUIRES_ID_*`, `CONFLICTS_WITH_ID`)
- [ ] Implement `mod-manager.json` reader/writer using the `DFHModpack` schema
- [ ] Implement Level 1 conflict detection (metadata-only, no raw parsing needed)
- [ ] Implement `objects/*.txt` scanner for Level 2 duplicate ID detection
- [ ] Design modpack profile CRUD (create, rename, delete, set-default, import, export)
- [ ] Integrate with existing Chronicler DFHack RPC client for optional live mod discovery
- [ ] Add mod search/filter for browsing available mods
- [ ] Implement SELECT/CUT token detection in raw scanner (needed for Level 2 completeness)
- [ ] Research whether Chronicler's existing DB schema can store modpack state for historical tracking

---

## Sources

1. [DF-Modloader source — raw_handler.py](file:///Users/nathanielcannon/Claude/GitRepos/DF-Modloader/raw_handler.py)
2. [DF-Modloader source — main.py](file:///Users/nathanielcannon/Claude/GitRepos/DF-Modloader/main.py)
3. [ModHearth source — ModHearthManager.cs](file:///Users/nathanielcannon/Claude/GitRepos/ModHearth/ModHearthManager.cs)
4. [ModHearth source — ModReference.cs](file:///Users/nathanielcannon/Claude/GitRepos/ModHearth/ModReference.cs)
5. [ModHearth source — DFHackModClasses.cs](file:///Users/nathanielcannon/Claude/GitRepos/ModHearth/DFHackModClasses.cs)
6. [ModHearth Lua — GetModMemoryData.lua](file:///Users/nathanielcannon/Claude/GitRepos/ModHearth/bin/Debug/net7.0-windows/GetModMemoryData.lua)
7. [Dwarf Fortress Wiki — Info.txt file](https://dwarffortresswiki.org/index.php/Info.txt_file)
8. [Dwarf Fortress Wiki — Mod info token](https://dwarffortresswiki.org/index.php/Mod_info_token)
9. [Dwarf Fortress Wiki — Modding](https://dwarffortresswiki.org/index.php/Modding)
10. [Dwarf Fortress Wiki — Raw file](https://dwarffortresswiki.org/index.php/Raw_file)
11. [Dwarf Fortress Wiki — Mod](https://dwarffortresswiki.org/index.php/Mod)
12. [Bay 12 Games Modding Guide](https://bay12games.com/dwarves/modding_guide.html)
13. [DFHack gui/mod-manager documentation](https://docs.dfhack.org/en/stable/docs/tools/gui/mod-manager.html)
14. [DFHack gui/mod-manager.lua source](https://github.com/DFHack/scripts/blob/master/gui/mod-manager.lua)
15. [PyLNP core.mods module documentation](http://pylnp.birdiesoft.dk/docs/dev/core/core.mods.html)
16. [PyLNP GitHub (PeridexisErrant mirror)](https://github.com/PeridexisErrant/python-lnp)
17. [PyLNP mod merging forum thread](https://www.bay12forums.com/smf/index.php?topic=143662.0)
18. [PyDwarf GitHub](https://github.com/pineapplemachine/PyDwarf)
19. [PyDwarf modding documentation](https://github.com/pineapplemachine/PyDwarf/blob/master/docs/modding.md)
20. [Voliol — Dwarf Fortress Mod Structure article](https://voliol.neocities.org/articles/df_mod_structure)
21. [dfraw_json_parser Rust library](https://github.com/nwesterhausen/dfraw_parser)
22. [Nexus Mods Wiki — About Load Orders](https://wiki.nexusmods.com/index.php/About_Load_Orders)
23. [Nexus Mods Wiki — File Conflicts: NMM vs Vortex](https://wiki.nexusmods.com/index.php/File_Conflicts:_Nexus_Mod_Manager_vs_Vortex)
24. [Vortex load order approach](https://wiki.nexusmods.com/index.php/The_Vortex_approach_to_load_order_sorting)

---

## Uncertainties

1. **SELECT/CUT token order semantics across mods**: The exact rules for how DF resolves multiple SELECTs and CUT+SELECT interactions have not been confirmed from official source code. The documented behavior (CUT wins if after SELECT) is inferred from the wiki documentation and is consistent with how DF-Modloader's REMOVE_OBJECT works.

2. **DFHack Lua API stability**: `get_modlist_fields()` and `get_newregion_viewscreen()` are internal DFHack APIs, not formally documented for third-party use. They may change across DFHack releases. The ModHearth approach of calling them via `reqscript` is a pragmatic workaround.

3. **`mod-manager.json` version integer format**: The observed behavior (remove dots) comes from ModHearth source code, not from DFHack documentation. Unusual version strings (e.g., `"2.0.1"` → `201` vs. `"50.13"` → `5013`) need validation against actual DFHack behavior.

4. **Workshop mod path on HomeServer**: Steam Workshop mods on Windows are in `<Steam>\steamapps\workshop\content\975370\`. Whether these appear in DFHack's `base_available` without extra configuration is unconfirmed.

5. **BP_LAYERS/BP_POSITION/BP_RELATION**: DF-Modloader notes these body detail plan tokens are not convertible to OBJECT_TEMPLATE equivalents. Handling these in Chronicler's raw compiler (if built) requires special cases.

---

## Related Topics

- Chronicler PRD v2 design (`/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/chronicler-prd-v2.md`)
- DFHack RPC client in Chronicler for live data access
- DB schema for storing modpack history (useful for "which mods were active when this legend event occurred")
- DF raw schema for Chronicler's annotation layer (understanding what raw objects are referenced in legends XML)
