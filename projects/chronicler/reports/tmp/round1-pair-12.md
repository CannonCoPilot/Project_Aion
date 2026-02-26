# Consolidation: DFHack Infrastructure & Mod Management Research

## Source Documents

- **dfhack-infrastructure-research.md**: Deep technical analysis of five repositories (dfhack-client-python, DwarfFortressLogger/Dwarf Therapist, df-structures, DwarvenSurveyor, myDFHackScripts) covering RPC protocol details, memory layout definitions, complete DF data structure hierarchies, and live Lua scripting patterns for data extraction.
- **mod-management-research.md**: Comprehensive analysis of the DF v50 mod ecosystem including raw file format specifications, the info.txt metadata standard, deep dives into DF-Modloader (raw compiler), ModHearth (DFHack-integrated GUI), PyLNP (three-way merge), and PyDwarf (token-level API), benchmarked against NexusMods/Vortex patterns.

---

## Feature Ideas for Chronicler

### DFHack Data Extraction Features

#### Live Unit & Character Data Collection
- **Live unit watcher**: Subscribe to `eventful.UNIT_NEW_ACTIVE` for real-time arrival detection of dwarves, migrants, and creatures entering the fortress area (avoids needing to poll `units.active` entirely).
- **Citizen roster tracker**: Poll `df.global.world.units.active` (filtered by `dfhack.units.isCitizen()`) at configurable intervals (e.g., 500 ticks ≈ 12 seconds at normal speed) to detect roster changes and trigger DB sync.
- **Unit metadata extraction**: For every unit, automatically capture race (`dfhack.units.getRaceName()`), age (`dfhack.units.getAge()`), sex (`dfhack.units.isMale()`), readable name (`dfhack.units.getReadableName()`), and visible name (`dfhack.units.getVisibleName()`).
- **Unit soul data extractor**: Extract from `unit_soul` the complete skill set (`skills` vector with `job_skill` enum + `experience` int32), preferences, personality, and performance skills (musical instruments, poetic forms, musical forms, dance forms).
- **Soul personality snapshot**: Capture `unit_personality` including mannerisms (`mannerism_type`, 70+ distinct behaviors), values (`personality_valuest.type + strength`), ethics (`personality_ethicst.ethic + response`), and thought history (`unit_thought_type`, 80+ categories).

#### Historical Figure (HF) Data Pipeline
- **Full HF extraction via DFHack Lua**: Walk `df.global.world.history.figures` and for each HF capture:
  - Core identity: `id`, `name`, `race`, `caste`, `sex`, `profession`, `appeared_year`, `born_year`, `born_seconds`, `died_year`, `died_seconds`, `civ_id`, `unit_id`, `nemesis_id`, `cultural_identity`, `family_head_id`.
  - Flags: `deity`, `force`, `ghost`, `worldgen_acted`, `brag_on_kill`, `kill_quest`, `chatworthy` — critical for filtering narratively significant HFs.
  - All orientation data: `orientation_flags`.
  - Curse tracking: `curse_year`, `curse_seconds`.
- **HF profile extraction** (via `hf.info` pointer — all nullable):
  - Skills: `info.skills.skills` (job_skill enum vector) + `info.skills.points` (parallel XP vector), `professions_held`, `profession_years`, `account_balance`.
  - Location/whereabouts: `info.whereabouts.state`, `site_id`, `subregion_id`, `feature_layer_id`, `army_id`, `body_state` (Active, BuriedAtSite, UnburiedAtBattlefield, etc.), `year`, `year_tick`, `abs_smm_x/y` (strategic map coords).
  - Personality: `info.personality.personality` (full `unit_personality` compound).
  - Kill records: `info.kills` vector — kill events with victim name/race/year/site/count.
  - Knowledge: `info.known_info.known_secrets`, `known_written_contents`, `known_identities`, `known_witness_reports`, `known_events`, `creature_knowledge`, `known_poetic_forms`, `known_musical_forms`, `known_dance_forms`, `belief_systems`, `known_locations`.
  - Reputation: `info.reputation` — wanted status, identities, journey profile.
  - Curse/interaction: `info.curse` — necromancy, transformations, undead status.
  - Artifacts held: `info.books` — inventory_profilest, held artifacts and equipment.
  - Masterpieces: `info.masterpieces` — creation events, art image chunks.
  - Metaphysical: `info.metaphysical` — spheres, appearance, deity form.
  - Relationships: `info.relationships.hf_visual` (current active), `info.relationships.hf_historical` (past), intrigues.
  - Wounds: `info.wounds` — missing body parts, childbirth.
  - Pets: `info.pets` — owned creature races.
- **HF entity link extractor**: Walk `hf.entity_links` to capture membership types (`member`, `former_member`, `mercenary`, `slave`, `prisoner`, `enemy`, `criminal`), position assignments (`position`, `former_position`) with `start_year`/`end_year`, squad membership.
- **HF-to-HF relationship extractor**: Walk `hf.histfig_links` to capture family (`mother`, `father`, `child`), romantic (`spouse`, `former_spouse`, `deceased_spouse`, `lover`), religious (`deity`), training (`master`, `apprentice`, `former_master`, `former_apprentice`), companion (`companion` + `agreement_id`), and `pet_owner` relationships.
- **HF site link extractor**: Walk `hf.site_links` to capture `lair`, `home_site_saved_civzone`, `seat_of_power`, `hangout`, `home_site_abstract_building`, `occupation`, `prison_abstract_building`.
- **Worldgen-specific HF data**: During worldgen, capture `hf.worldgen_site`, `hf.worldgen_region`, `hf.worldgen_layer`, `hf.worldgen_relationships` (up to 6 quick relationships with types: `childhood_friend`, `war_buddy`, `jealous_obsession`, `lover`, `former_lover`, `scholar_buddy`, `artistic_buddy`, `athlete_buddy`, `athletic_rival`, `business_rival`, `religious_persecution_grudge`, `grudge`, `lieutenant`, `worshipped_deity`, `spouse`, `mother`, `father`, `master`, `apprentice`, `companion`, `ex_spouse`, `neighbor`, `shared_entity`).

#### History Event Processing
- **Tiered event ingestion system**: Implement three-tier processing of the 144 `history_event_type` variants:
  - Tier 1 (always process): `HIST_FIGURE_DIED`, `ARTIFACT_CREATED`, `ARTIFACT_DESTROYED`, `HIST_FIGURE_SIMPLE_BATTLE_EVENT`, `WAR_FIELD_BATTLE`, `HIST_FIGURE_REVIVED`, `CHANGE_CREATURE_TYPE`.
  - Tier 2 (process for active HFs): `ADD_HF_HF_LINK`, `HF_LEARNS_SECRET`, `CHANGE_HF_MOOD`, `MASTERPIECE_CREATED_*` (all 6 variants), `WRITTEN_CONTENT_COMPOSED`.
  - Tier 3 (background enrichment): `WAR_*`, `ENTITY_*`, `CHANGE_HF_STATE`, `CHANGE_HF_JOB`.
- **Complete war event tracking**: `WAR_ATTACKED_SITE`, `WAR_DESTROYED_SITE`, `WAR_FIELD_BATTLE`, `WAR_PLUNDERED_SITE`, `WAR_SITE_NEW_LEADER`, `WAR_SITE_TRIBUTE_FORCED`, `WAR_SITE_TAKEN_OVER`, `SITE_SURRENDERED`.
- **Site lifecycle events**: `CREATED_SITE`, `HF_DESTROYED_SITE`, `SITE_DIED`, `SITE_RETIRED`, `RECLAIM_SITE`, `HF_ATTACKED_SITE`, `INSURRECTION_STARTED`, `INSURRECTION_ENDED`.
- **Complete HF lifecycle event ingestion**: Track `HIST_FIGURE_DIED`, `HIST_FIGURE_REVIVED`, `HIST_FIGURE_WOUNDED`, `HIST_FIGURE_SIMPLE_BATTLE_EVENT`, `HIST_FIGURE_ABDUCTED`, `CHANGE_HF_STATE`, `CHANGE_HF_JOB`, `CHANGE_HF_BODY_STATE`, `CHANGE_HF_MOOD`, `HIST_FIGURE_SIMPLE_ACTION`.
- **Artifact chain-of-custody tracking**: Track the full sequence — `ARTIFACT_CREATED`, `ARTIFACT_LOST`, `ARTIFACT_FOUND`, `ARTIFACT_HIDDEN`, `ARTIFACT_POSSESSED`, `ARTIFACT_RECOVERED`, `ARTIFACT_DROPPED`, `ARTIFACT_STORED`, `ARTIFACT_TRANSFORMED`, `ARTIFACT_DESTROYED`, `ARTIFACT_CLAIM_FORMED`, `ARTIFACT_GIVEN`, `ARTIFACT_COPIED`.
- **Knowledge and culture event ingestion**: `HF_LEARNS_SECRET`, `HF_GAINS_SECRET_GOAL`, `KNOWLEDGE_DISCOVERED`, `POETIC_FORM_CREATED`, `MUSICAL_FORM_CREATED`, `DANCE_FORM_CREATED`, `WRITTEN_CONTENT_COMPOSED`.
- **Arts and performance tracking**: All `MASTERPIECE_CREATED_*` variants (arch construct, item, dye item, item improvement, food, engraving), `MASTERPIECE_LOST`, `PERFORMANCE`, `COMPETITION`, `PROCESSION`, `CEREMONY`.
- **Intrigue system events** (v0.47+): `HFS_FORMED_INTRIGUE_RELATIONSHIP`, `FAILED_INTRIGUE_CORRUPTION`, `HF_CONVICTED`, `FAILED_FRAME_ATTEMPT`, `HF_INTERROGATED`, `ENTITY_OVERTHROWN`, `SABOTAGE`, `HF_RANSOMED`, `HF_ENSLAVED`, `HF_PREACH`, `ENTITY_PERSECUTED`.
- **Diplomatic event tracking**: `FIRST_CONTACT`, `TOPICAGREEMENT_CONCLUDED`, `TOPICAGREEMENT_REJECTED`, `AGREEMENT_FORMED`, `AGREEMENT_CONCLUDED`, `TRADE`, `GAMBLE`.
- **Entity-level events**: `ENTITY_CREATED`, `ENTITY_ACTION`, `ENTITY_INCORPORATED`, `ENTITY_DISSOLVED`, `ENTITY_EXPELS_HF`, `ENTITY_LAW`, `ENTITY_ALLIANCE_FORMED`, `ENTITY_BREACH_FEATURE_LAYER`, `ENTITY_EQUIPMENT_PURCHASE`, `ENTITY_RAMPAGED_IN_SITE`, `ENTITY_FLED_SITE`, `ENTITY_SEARCHED_SITE`.
- **Event virtual methods**: Use `event:getRelatedHistfigIDs()`, `getRelatedSiteIDs()`, `getRelatedEntityIDs()`, `wasHistfigKilled()`, `getKilledHistfigID()`, `wasHistfigRevived()`, `getSentence()`, `getPhrase()`, `getImportance()`, `getEraImportance()` for enriched narrative generation.
- **Event era classification**: Use `event:categorize()` / `event:uncategorize()` to group events into `world_history.events_death`.

#### Real-Time Fortress Mode Monitoring
- **Death event handler with cause lookup**: Subscribe to `eventful.onUnitDeath` and immediately look up the death incident in `df.global.world.incidents.all` to get `death_cause` (enum `death_type`) and `criminal` (killer unit ID). Cross-reference killer via `df.unit.find(killer_id)` to get name and race.
- **Item creation tracking**: Subscribe to `eventful.onItemCreated` with sensitivity level 1. Detect artifact creation via `item.flags.artifact`. Log item description via `dfhack.items.getDescription(item, 0)` and material via `dfhack.matinfo.decode(item)`.
- **Job completion logging**: Subscribe to `eventful.onJobCompleted` for production event tracking.
- **Invasion tracking**: Subscribe to `eventful.onInvasion` for tactical alert generation.
- **Syndrome/curse tracking**: Subscribe to `eventful.SYNDROME` event for transformation, curse, and disease detection on units.
- **Inventory change tracking**: Subscribe to `eventful.INVENTORY_CHANGE` for artifact movement and equipment tracking — more efficient than polling `items.all`.
- **Announcement/report polling**: Poll `df.global.world.status.reports` on a configurable tick interval (recommended: 500 ticks) to capture game announcements, alerts, and important messages.
- **Book/written content detection**: Poll `df.global.world.items.all` with book filter — `dfhack.items.getBookTitle(item)` to detect newly created literary works.
- **Agreement/petition monitoring**: Poll `df.global.world.agreements.all` to detect new petitions, trade agreements, and diplomatic agreements.
- **In-game time stamping**: Use `dfhack.world.ReadCurrentYear()`, `ReadCurrentMonth()`, `ReadCurrentDay()` to timestamp all events with in-game calendar dates.

#### World History Monitoring
- **World history container access**: Read from `df.global.world.history` to access `events` (all history events), `events_death` (deaths specifically), `relationship_events` (v0.47+), `figures` (all HFs), `event_collections` (18 typed subcategories), `eras` (era names and boundaries), `intrigues` (v0.47+), and classified HF lists (`hf_artists`, `hf_poets`, `hf_bards`, `hf_dancers`, `hf_scholars`, `hf_heros`, `hf_religious`, `hf_merchant`, `hf_teachers` [indexed by goal_type — 11 = necromancers]).
- **Live megabeast tracker**: Monitor `world.history.live_megabeasts`, `live_semimegabeasts`, `hf_allbeasts` for crisis events.
- **Era transition detection**: Poll `df.global.world.history.eras` to detect era boundary crossings during worldgen and play.
- **Worldgen real-time monitoring**: During worldgen, poll `df.global.world.history.figures` and `df.global.world.history.events` as they are being built in real-time. Track `era_determinerst` fields: `living_powers`, `living_megabeasts`, `living_semimegabeasts`, `civilized_races`, `civilized_total`, `civilized_mundane`. Flag HFs with `worldgen_acted` flag.

#### Map and Geographic Features
- **World map rendering**: Parse legends XML for site and region data — site type, name, coordinates (`x,y`), bounding rectangle (`xMin:yMin,xMax:yMax`), and region terrain type (wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains). Render an interactive world map with clickable site labels.
- **Extended legends export**: Use DFHack's `exportlegends` command to generate `legends_plus.xml` (richer than base DF export, includes data omitted from standard export). Use this for the most complete batch snapshot after worldgen.
- **Site link narrative**: Use `histfig_site_link` subtypes (`lair`, `seat_of_power`, `hangout`, `home_site_*`, `occupation`) to generate location-focused narrative about HFs.
- **Strategic coordinates tracking**: Use `abs_smm_x/y` from `state_profilest` for strategic-level location data.

#### Artifact System
- **Artifact flag detection**: Use `item.flags.artifact` on created items. Subscribe to `INVENTORY_CHANGE` events to track artifact movement.
- **Artifact chain-of-custody**: Link all artifact events together by artifact ID to produce a complete chain-of-custody narrative for each artifact from creation through destruction.
- **Masterpiece tracking**: Track all `MASTERPIECE_CREATED_*` events, linked to their creator HF and creation context.

### Mod Management Features

#### Core Mod Manager (MVP)
- **Mod discovery via filesystem scan**: Scan `<DF_dir>/Mods/`, `<DF_dir>/data/vanilla/`, and `<DF_dir>/data/installed_mods/` for all `info.txt` files. Build a complete available-mods catalog without requiring DF to be running.
- **DFHack live mod discovery**: When DFHack is running and DF is at the world creation screen, execute `dfhack-run lua -f GetModMemoryData.lua` (pattern from ModHearth) to query `gui/mod-manager` via `reqscript` and call `manager.get_modlist_fields('base_available', viewScreen)`. Returned data: `id`, `name`, `displayed_version`, `numeric_version`, `earliest_compat_numeric_version`, `src_dir`, `mod_header` (full info.txt as Lua table).
- **info.txt parser**: Full token-based parser supporting all v50 fields: `ID`, `NAME`, `NUMERIC_VERSION`, `DISPLAYED_VERSION`, `EARLIEST_COMPATIBLE_NUMERIC_VERSION`, `EARLIEST_COMPATIBLE_DISPLAYED_VERSION`, `AUTHOR`, `DESCRIPTION`, `REQUIRES_ID`, `REQUIRES_ID_BEFORE_ME`, `REQUIRES_ID_AFTER_ME`, `CONFLICTS_WITH_ID`, and all Steam Workshop fields (`STEAM_TITLE`, `STEAM_DESCRIPTION`, `STEAM_TAG`, `STEAM_FILE_ID`, etc.).
- **Modpack CRUD backed by mod-manager.json**: Create, rename, delete (enforce minimum one modpack), set-default, import from JSON file, export to JSON file. Schema matches DFHack's format exactly.
- **Load order management**: Drag-and-drop (or CLI equivalent) reordering of mods within a modpack. Enforce header load order: `o_template → language → descriptor_* → material_template → inorganic → plant → tissue_template → item → building → b_detail_plan → body → c_variation → creature → entity → reaction → interaction → edit`.
- **Mod browser with search/filter**: Dual-pane view (available/disabled mods vs. enabled mods). Search and filter boxes for each pane. Display mod name, description, version, author, and preview image (`preview.png` if present).
- **Undo to last saved state**: Track unsaved changes and allow reverting to the last persisted modpack configuration.
- **Profile import/export**: Full JSON import/export using the `DFHModpack` schema.
- **Fallback to cached mod list**: If neither filesystem scan nor DFHack query is available, show the last successful scan result.

#### Conflict Detection System
- **Level 1 — Metadata conflict detection** (O(n), no raw parsing):
  - Duplicate mod IDs in the active list.
  - `CONFLICTS_WITH_ID` pairs both present in active list.
  - `REQUIRES_ID_BEFORE_ME` violations (required mod not yet loaded at this position).
  - `REQUIRES_ID_AFTER_ME` violations (required mod already loaded before this position).
  - Version incompatibility: loaded `numeric_version` < `EARLIEST_COMPATIBLE_NUMERIC_VERSION`.
- **Level 2 — Object ID conflict detection** (O(n × m), requires raw parsing):
  - Parse all `objects/*.txt` for each enabled mod.
  - Build a map of `{object_type: {object_id: [mod_id, ...]}}`.
  - Flag any `object_id` with multiple full definitions across mods (duplicate definitions cause silent corruption — not last-wins, but offset bugs).
  - Detect SELECT + CUT interactions: CUT in mod B removes an object that mod A's SELECT targets.
- **Level 3 — Semantic conflict detection** (expensive, requires full compilation):
  - Full DF-Modloader compiler pipeline to detect `OT_REMOVE_TAG` vs. `OT_ADD_TAG` conflicts on the same token across mods.
  - Requires known vanilla baseline.
- **Visual conflict indicators**: Color-code mods in the active list by conflict status: clean (no indicator), problem (red text/highlight). Typed conflict messages: `MissingBefore`, `MissingAfter`, `ConflictPresent`.
- **Three-way merge conflict detection** (PyLNP pattern): For raw-level conflict analysis, perform line-based three-way merge with vanilla baseline + accumulated mods + new mod. Return status: 0 (clean), 1 (potential issues), 2 (overlap merged, manual review), 3 (fatal, rebuild from scratch).

#### Raw File Parsing and Analysis
- **Raw file tokenizer**: Implement DF-Modloader's `split_lines_into_tokens()` algorithm. State machine: `COMMENTS → TOKEN → ARGS`. Discard everything outside `[` `]`. Token = first colon-separated field, args = remaining fields.
- **Object type catalog**: Recognize all 18 DF super-types mapped to file prefixes (`[OBJECT:TYPE]`). Build per-type, per-file object inventories.
- **RawObject data model**:
  ```
  object_id: str
  tokens: List[List[str]]  (each token as flat list)
  source_file_name: str
  source_mod_name_and_version: str
  is_removed: bool
  ```
- **SELECT/CUT token detection**: Parse `SELECT_<TYPE>` and `CUT_<TYPE>` tokens in raw files. Enumerate all sub-object selectors: `SELECT_CASTE`, `SELECT_ADDITIONAL_CASTE`, `SELECT_MATERIAL`, `SELECT_TISSUE`, `SELECT_TISSUE_LAYER`, `SELECT_GROWTH`.
- **Raw visual diff viewer**: Show side-by-side diff of the same raw object across two or more mods. Highlight added/removed/changed tokens. (PyDwarf doubly-linked traversal is the reference implementation for this.)
- **Embedded raw editor** (stretch): Allow in-application editing of raw files with syntax highlighting for DF token format. Track edits as a mod or mod overlay.

#### Advanced Mod Management (Tier 3 / Long-term)
- **Full raw compiler** (DF-Modloader pattern):
  - EDIT object support: `SEL_BY_ID`, `SEL_BY_CLASS`, `SEL_BY_TAG`, `SEL_BY_TAG_PRECISE`, `PLUS_SELECT`, `UNSELECT`.
  - OBJECT_TEMPLATE compilation: `COPY_TAGS_FROM`, `GO_TO_END`, `GO_TO_START`, `GO_TO_TAG`, argument substitution (`!ARG1`, `!ARG2`), recursion detection.
  - USE_OBJECT_TEMPLATE processing: `OT_ADD_TAG`, `OT_REMOVE_TAG`, `OT_CONVERT_TAG` + `OTCT_TARGET/REPLACEMENT`, conditional variants (`OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG`).
  - `REMOVE_OBJECT` support (sets `is_removed = True`).
  - Output: per-super-type compiled files (`creature_compiled.txt`, etc.) with source comments.
- **Legacy mod migration tool** (SyntaxUpdater pattern): Convert pre-v50 `c_variation_*` files to `o_template_cv_*`, `b_detail_plan_*` to `o_template_bdp_*`. Enable old mods to work with the new compiler.
- **Modpack content discovery**: Support modpack-in-modpack structure — directories with `modpack_info.txt` are treated as collections of sub-mods.
- **Virtual file system isolation** (Mod Organizer 2 pattern): Serve mods to DF without physically copying files. Each mod remains in its own folder. Per-mod activation/deactivation without reinstall. (Implementation complexity is high given DF requires physical file presence.)
- **Automated load order optimization** (LOOT pattern): Topological sort of the mod dependency graph derived from `REQUIRES_ID_BEFORE_ME`/`REQUIRES_ID_AFTER_ME` relationships. Flag missing masters, incompatible pairs, mismatched versions.
- **Mod update notifications**: Integrate with Steam Workshop API or DFFD/NexusMods DF page to check for available updates against the currently installed `numeric_version`.

#### Modpack History and Audit
- **DB schema for modpack state**: Store which modpack was active when each legend event, fortress event, or world was generated. Answer queries like "which mods were active when this artifact was created?"
- **Modpack snapshot at world creation**: Capture the full `object_load_order` via DFHack at world creation time and store it in the DB against the world record.
- **Mod annotation in legends**: When displaying a legend event or creature/entity, annotate which mod introduced that raw object (if applicable).

---

## Reference Implementations

### DFHack RPC Protocol (dfhack-client-python)

**Handshake (TCP port 5000):**
```
Client sends: b'DFHack?\n' + uint32(1)   # 12 bytes
Server replies: b'DFHack!\n' + uint32(1)  # 12 bytes — must match exactly
```
On mismatch, set connection to None silently — must check return value of `connect()`.

**Frame format (8-byte header + protobuf payload, little-endian):**
```
bytes [0:2]  — int16: message ID (negative = reply code, positive = bound method ID)
bytes [2:4]  — padding (0x0000)
bytes [4:8]  — int32: payload size in bytes
```
Reply code constants: `-1` = RESULT (success), `-2` = FAIL, `-3` = TEXT (raises exception), `-4` = QUIT.

**Method binding via CoreBindRequest (channel 0):**
```python
br.method = "GetUnitList"
br.input_msg = EmptyMessage.DESCRIPTOR.full_name
br.output_msg = UnitList.DESCRIPTOR.full_name
br.plugin = "RemoteFortressReader"
# Response: CoreBindReply.assigned_id — cache via lru_cache(maxsize=65534)
```

**Decorator pattern for auto-wiring:**
```python
@remote(plugin='RemoteFortressReader')
async def GetVersionInfo(output: VersionInfo = None): pass
@remote(plugin='RemoteFortressReader')
async def GetUnitList(output: UnitList = None): pass
@remote
async def GetVersion(output: StringMessage = None): pass
@remote
async def GetWorldInfo(output: GetWorldInfoOut = None): pass
```

**Critical missing features for production use:**
- No timeout on `asyncio.open_connection()`
- No retry/reconnect loop
- No heartbeat/health-check
- No thread safety (single global reader/writer)
- No recovery from `RPC_REPLY_TEXT`

**Note**: TCP RPC is broken for game-thread calls on DFHack 53.x under Prism/UTM. `GetVersion`/`GetWorldInfo` work (cached, no Core lock needed). All other calls hang indefinitely — CoreSuspender never acquired from network thread. Use `dfhack-run` over SSH instead.

### Dwarf Therapist Memory Layout Architecture

Memory layout system with 29 named sections (INI/QSettings files keyed by DF binary checksum):
```
MEM_GLOBALS    -> "addresses"           (global pointer addresses)
MEM_UNIT       -> "dwarf_offsets"       (unit struct field offsets)
MEM_SOUL       -> "soul_details"
MEM_HIST_FIG   -> "hist_figure_offsets"
MEM_HIST_EVT   -> "hist_event_offsets"
MEM_HIST_ENT   -> "hist_entity_offsets"
MEM_EMOTION    -> "emotion_offsets"
MEM_ACTIVITY   -> "activity_offsets"
MEM_NEED       -> "need_offsets"
MEM_HEALTH     -> "health_offsets"
MEM_WOUND      -> "unit_wound_offsets"
MEM_RACE       -> "race_offsets"
MEM_CASTE      -> "caste_offsets"
... (29 total)
```
Not viable for Chronicler (requires same-machine, elevated privileges, breaks each DF version). Value: scope reference for what data categories are available.

**Historical figure data read by Dwarf Therapist:**
- `m_id`, `m_address`, `m_fig_info_addr`
- `m_fake_ident_addr`, `m_fake_name_addr`
- `m_notable_kills`, `m_other_kills` with struct: `{ name: str, year: int, site: int, count: int, creature: str }`

### df-structures XML Reference

**Access pattern for Lua via DFHack:**
```lua
-- instance-vector in XML maps directly to Lua path
-- <struct-type instance-vector='$global.world.history.figures'> -> df.global.world.history.figures
local hf = df.global.world.history.figures[i]
local hf_info = hf.info  -- historical_figure_info / hf_profilest (nullable bag of pointers)
```

**HF profile pointer bag — all nullable:**
```
metaphysical  -> spheres, appearance, deity form
skills        -> skill list, professions, account_balance, employment_held
pets          -> owned creature races
personality   -> unit_personality + mood
masterpieces  -> creation events, art image chunks
whereabouts   -> location: state, site_id, region_id, army_id, body_state, year, tick, smm coords
kills         -> kill events, killed races/sites/counts
wounds        -> missing body parts, childbirth
known_info    -> secrets, identities, witness reports, rumor events, creature knowledge, poetic/musical/dance forms, scholar knowledge, belief systems, known locations
curse         -> necromancy, transformations, undead status
books         -> held artifacts, equipment
reputation    -> wanted status, identities, journey profile
relationships -> hf_visual (current), hf_historical (past), intrigues
```

**Event subtype casting pattern in Lua:**
```lua
local e = df.history_event_war_field_battlest(event_ptr)
-- Cast to specific subtype to access subtype-specific fields
```

### myDFHackScripts Lua Patterns

**Module architecture for production bridge:**
```
FortressStatistics.lua  -- orchestrator, event registration, polling loop
  LogHandler.lua        -- file I/O, UTF8 conversion, log path management
  Helper.lua            -- watcher factory, enum resolution, unit lookup
  AnnouncementLogger.lua -- polls df.global.world.status.reports
  CitizenLogger.lua     -- polls df.global.world.units.active
  DeathLogger.lua       -- eventful.onUnitDeath subscription
  ItemLogger.lua        -- eventful.onItemCreated subscription
  JobLogger.lua         -- eventful.onJobCompleted subscription
  InvasionLogger.lua    -- eventful.onInvasion subscription
  AnnounceBooks.lua     -- polls df.global.world.items.all (book filter)
  PetitionLogger.lua    -- polls df.global.world.agreements.all
```

**Event subscription pattern:**
```lua
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 1)  -- sensitivity 1 = every tick
local modId = "DF_STATS"  -- unique module ID prevents conflicts
eventful.onUnitDeath[modId] = function(unitId) DeathLogger.log(unitId) end
eventful.onUnitDeath[modId] = nil  -- clean unsubscribe
```

**Available event types:**
```
TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE, UNIT_DEATH,
ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION, INVENTORY_CHANGE,
REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX
```
Note: `REPORT` is best handled via polling, not event subscription.

**Polling pattern with dfhack.timeout:**
```lua
local function tick()
    if not watcherActive then return end
    AnnouncementLogger.watch()
    CitizenLogger.watch()
    if watcherActive then
        dfhack.timeout(500, 'ticks', tick)  -- reschedule: 500 ticks ≈ 12s at normal speed
    end
end
```
`'ticks'` = real game ticks (pauses when game pauses). `'frames'` = real-time frames (alternative).

**Generic watcher factory (change detection closure):**
```lua
function Helper.watch(getCurrentList, getKey, logChange, logNew, secondCondition)
    local lastCount = 0
    local known_items = {}
    local firstCall = true
    return function()
        if firstCall then
            known_items = getCurrentList(); lastCount = #known_items; firstCall = false; return lastCount
        end
        local current_items = getCurrentList()
        local newCount = #current_items
        if newCount ~= lastCount then
            logChange(lastCount, newCount)
            local known_keys = {}
            for _, item in ipairs(known_items) do known_keys[getKey(item)] = true end
            for _, item in ipairs(current_items) do
                if not known_keys[getKey(item)] then logNew(item) end
            end
            known_items = current_items; lastCount = newCount
        end
        -- optional second condition for value-change detection
        return newCount
    end
end
```
Note: Does not handle deletions. Chronicler's implementation must handle items leaving the list.

**Death cause and killer lookup via incidents:**
```lua
function Helper.getIncidentDeathCauseByVictimId(victimId)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death then
            if incident.victim == victimId then
                return incident.death_cause  -- enum death_type
            end
        end
    end
    return nil
end
-- incident.criminal = killer unit ID; cross-reference with df.unit.find(killer_id)
```

**Enum resolution pattern:**
```lua
function Helper.resolveEnum(k, v)
    local d = df[k]
    if d == nil then return tostring(v) end
    local dv = d[v]
    if dv == nil then return "unknown_enum_value" end
    return d[v] .. "," .. k .. "_value," .. tostring(v)
end
-- e.g.: Helper.resolveEnum("death_type", death_cause_enum_value)
```

**Struct introspection for bridge development:**
```lua
local unit_type = df.global.world.units.all[0]._type
for field_name, field_info in pairs(unit_type._fields) do
    print("Field:", field_name, "Offset:", field_info.offset, "Type:", field_info.type_name)
end
print("Size:", unit_type:sizeof())
-- Enum introspection:
for k, v in pairs(df.goal_type.attrs) do print("Enum key:", k, "Value:", v) end
```

**Module hot-reload pattern (for bridge development iteration):**
```lua
package.loaded["ModuleName"] = nil
local Module = require("ModuleName")
```

### DwarvenSurveyor: XML Streaming Parser

```csharp
// XmlReader (streaming, not DOM) for large legends XML files
// Site fields: type, name, coords (x,y), rect (xMin:yMin,xMax:yMax)
// Region terrain types (10 values): wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains
// legends.xml = standard DF export
// legends_plus.xml = DFHack exportlegends output (richer data, Chronicler should prefer this)
```
Sample XML files available in DwarvenSurveyor repo as parser test fixtures:
- `UNITYTESTregion1-00050-01-01-legends.xml`
- `UNITYTESTregion1-00050-01-15-legends_plus.xml`

### DF-Modloader Raw Compiler

**RawObject class:**
```python
class RawObject:
    object_id: str
    tokens: List[List[str]]     # each token as flat list ["BODY", "QUADRUPED_NECK"]
    source_file_name: str
    source_mod_name_and_version: str
    is_removed: bool
# Methods: has_token(), get_token_values(), remove_token(), convert_token(),
#          tokens_with_arguments_inserted()  (handles !ARG1, !ARG2 substitution)
```

**Compiler pipeline:**
1. `read_mod_raws_and_apply_edit_objects(mod)` — reads files in header-sorted order, builds `normal_objects` dict-of-dicts and `normal_objects_lists`.
2. `apply_special_tokens_to_create_compiled_objects()` — processes OBJECT_TEMPLATE and normal objects.
3. `write_compiled_objects(output_path)` — writes `*_compiled.txt` per super-type.

**EDIT object selection modes:** `SEL_BY_ID`, `SEL_BY_CLASS`, `SEL_BY_TAG`, `SEL_BY_TAG_PRECISE`, `PLUS_SELECT`, `UNSELECT`.

**OBJECT_TEMPLATE special tokens:** `COPY_TAGS_FROM`, `GO_TO_END`, `GO_TO_START`, `GO_TO_TAG`, `OT_ADD_TAG`, `OT_REMOVE_TAG`, `OT_CONVERT_TAG + OTCT_TARGET/OTCT_REPLACEMENT`, conditional variants `OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG`.

**Reading mode state machine:** `"NONE"` → `"NEW"` (standard object) / `"OT"` (object template) / `"EDIT"`.

**Conflict model:** Last-mod-wins for full object definitions. EDIT objects layer in load order. No explicit conflict detection in DF-Modloader.

**Legacy migration:** SyntaxUpdater converts `c_variation_*` → `o_template_cv_*` and `b_detail_plan_*` → `o_template_bdp_*`.

### ModHearth DFHack Integration

**Lua memory query:**
```lua
-- GetModMemoryData.lua (executed via: dfhack-run.exe lua -f "GetModMemoryData.lua")
local manager = reqscript('gui/mod-manager')
local mods = manager.get_modlist_fields('base_available', viewScreen)
-- Available data kinds: 'available', 'base_available', 'object_load_order'
-- Per-mod output: id, name, displayed_version, numeric_version,
--                earliest_compat_numeric_version, src_dir, mod_header
-- Output format: pipe-delimited with JSON headers:
--   "name|version|id|compat_version|numeric_version|src_dir==={json_headers}___next_mod..."
```

**Conflict detection algorithm (FindModlistProblems):**
```
scannedModIDs = set()   -- already loaded
unscannedModIDs = set() -- not yet loaded
for each mod in load order:
    parse REQUIRES_ID_BEFORE_ME -> check mod in scannedModIDs (MissingBefore if not)
    parse REQUIRES_ID_AFTER_ME  -> check mod in unscannedModIDs (MissingAfter if not)
    parse CONFLICTS_WITH_ID     -> check mod in either set (ConflictPresent if found)
```
Dependency fields parsed via regex from `info.txt` text, not from in-memory structures.

**mod-manager.json schema:**
```json
[{
  "name": "Default",
  "default": true,
  "modlist": [
    {"id": "vanilla_creatures", "version": 5310},
    {"id": "some_mod", "version": 100}
  ]
}]
```
Version integer construction: remove dots from `numeric_version` string (`"53.10"` → `5310`, `"1.0.0"` → `100`).

**UI patterns from ModHearth:**
- Dual-pane drag-and-drop (disabled left, enabled right)
- Search/filter boxes per pane
- Mod info panel with `preview.png` if present
- `*` marker for unsaved changes
- Undo to last saved state
- Light/dark theme switching
- Red text highlighting for conflicting mods

### PyDwarf Token API

**Doubly-linked token data model:**
```python
class token:
    value: str          # "CREATURE"
    args: List[str]     # ["DWARF"]
    prev: token         # O(1) traversal
    next: token
    file: rawfile
    prefix: str         # whitespace before '['
    suffix: str         # whitespace after ']'
```
`token.remove()` = O(1) unlink. Best for interactive editing; DF-Modloader flat-list is better for batch compilation.

---

## Data Access Patterns

### DFHack Lua Global Paths Reference

```lua
-- Units
df.global.world.units.active         -- alive units in fortress area
df.global.world.units.all            -- all units including historical

-- Items
df.global.world.items.all            -- all items (including books, artifacts)

-- Communication and reports
df.global.world.status.reports       -- announcement/report log (poll, not event)
df.global.world.agreements.all       -- petitions, trade agreements, diplomatic records

-- Crime and death
df.global.world.incidents.all        -- crime/death incidents (death_cause + criminal)

-- World entities and history
df.global.world.entities.all         -- historical entities (civs, groups)
df.global.world.history.figures      -- all historical figures
df.global.world.history.events       -- all history events
df.global.world.history.eras         -- era boundaries
df.global.world.history.intrigues    -- intrigue network (v0.47+)
df.global.world.history.relationship_events  -- relationship events (v0.47+)
df.global.world.history.live_megabeasts
df.global.world.history.live_semimegabeasts
df.global.world.history.hf_allbeasts
df.global.world.history.hf_artists, hf_poets, hf_bards, hf_dancers, hf_scholars
df.global.world.history.hf_heros, hf_underbelly, hf_religious, hf_merchant
df.global.world.history.hf_teachers  -- index 11 = necromancers

-- Location context
df.global.plotinfo.main.fortress_site.name  -- current fortress name
df.global.world.world_data.name             -- world name

-- Worldgen structures
df.global.world.history.event_collections   -- typed event collection groups
```

### DFHack Lua Helper Functions Reference

```lua
-- Unit classification
dfhack.units.isCitizen(unit)         -- fortress citizen check
dfhack.units.isMale(unit)
dfhack.units.getRaceName(unit)
dfhack.units.getAge(unit)            -- float, in years
dfhack.units.getReadableName(unit)   -- "Firstname Lastname"
dfhack.units.getVisibleName(unit)    -- visible/alias name

-- Translation
dfhack.translation.translateName(name_compound)  -- compound name -> string

-- Items
dfhack.items.getBookTitle(item)
dfhack.items.getDescription(item, 0)
dfhack.matinfo.decode(item)          -- material information

-- Time
dfhack.world.ReadCurrentDay()
dfhack.world.ReadCurrentMonth()      -- 0-based
dfhack.world.ReadCurrentYear()
```

### DF v50 Mod File System Layout

```
<DF_dir>/
  Mods/                          -- installed/downloaded mods
  data/
    vanilla/                     -- vanilla mod folders
      vanilla_creatures/
        info.txt
        objects/creature_*.txt
    installed_mods/              -- currently active world mods (auto-copied)
      <mod_id>_<version>/
        info.txt
        objects/
        graphics/
  dfhack-config/
    mod-manager.json             -- DFHack modpack presets
```
Steam Workshop mods stored in `<Steam>/steamapps/workshop/content/975370/`. Appear in `base_available` only after DF has loaded them (requires launching to world creation screen at least once).

### Raw File Token Format

**Tokenizer pseudocode (DF-Modloader canonical):**
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

**Header load order (first line of each file determines category):**
```
o_template, language, descriptor_shape, descriptor_color, descriptor_pattern,
material_template, inorganic, plant, tissue_template, item, building,
b_detail_plan, body, c_variation, creature, entity, reaction, interaction, edit
```

**18 DF super-types** map to specific `[OBJECT:TYPE]` headers. Object IDs must be globally unique per super-type — duplicate IDs cause silent corruption.

### DF v50 Patching Tokens (SELECT/CUT)

```
[SELECT_CREATURE:DWARF]           -- append tokens to existing object without full redefinition
  [SELECT_CASTE:FEMALE]
    [BODY_DETAIL_PLAN:FACIAL_HAIR_TISSUE_LAYERS]

[CUT_CREATURE:ELEPHANT]           -- remove object entirely

Sub-object selectors: SELECT_CASTE, SELECT_ADDITIONAL_CASTE, SELECT_MATERIAL,
                      SELECT_TISSUE, SELECT_TISSUE_LAYER, SELECT_GROWTH
```
Applicable to: `CREATURE`, `ENTITY`, `INTERACTION`, `ITEM`, `WORD/TRANSLATION/SYMBOL`, `INORGANIC`, `PLANT`, `MUSIC/SOUND`, `REACTION`.

Token removal workaround: `[CV_REMOVE_TAG]` for creatures; CUT+redefine for other types.

**Conflict semantics:** Multiple SELECTs on same object coexist (both apply). CUT after SELECT removes what SELECT targeted. CUT wins if it loads after SELECT.

### info.txt Token Format

**Required tokens:**
```
[ID:mod_id]                                         -- unique, no spaces
[NAME:Display Name]
[NUMERIC_VERSION:N]                                 -- integer, must be >= EARLIEST_COMPATIBLE
[DISPLAYED_VERSION:str]
[EARLIEST_COMPATIBLE_NUMERIC_VERSION:N]
[EARLIEST_COMPATIBLE_DISPLAYED_VERSION:str]
[AUTHOR:name]
```

**Optional dependency/conflict tokens:**
```
[DESCRIPTION:text]
[REQUIRES_ID:mod_id]
[REQUIRES_ID_BEFORE_ME:mod_id]
[REQUIRES_ID_AFTER_ME:mod_id]
[CONFLICTS_WITH_ID:mod_id]
```

**Steam Workshop tokens:**
```
[STEAM_TITLE:str]
[STEAM_DESCRIPTION:str]
[STEAM_TAG:str]
[STEAM_KEY_VALUE_TAG:key:value]
[STEAM_METADATA:str]
[STEAM_CHANGELOG:str]
[STEAM_FILE_ID:N]         -- auto-assigned on first upload
```

---

## Key Insights

### Infrastructure Insights

1. **Lua bridge is architecturally correct**: The `chronicler-bridge.lua` HTTP-serving approach is validated as the right pattern. It sidesteps all RPC connection management issues (no timeout, no reconnect, no thread safety) while providing full access to `df.global.*`. The myDFHackScripts collection confirms this is the standard DFHack production pattern.

2. **TCP RPC is broken on DFHack 53.x under Prism**: CoreSuspender is never acquired from the network thread. Only `GetVersion`/`GetWorldInfo` work (cached). All game-thread RPC calls (GetUnitList, all RFR plugin calls) hang indefinitely. Use `dfhack-run` over SSH as the transport mechanism instead.

3. **RemoteFortressReader has 41 registered RPC functions but cannot be `enable`-d**: It auto-activates at init (`plugin_enable()` does not exist by design). However, game-thread calls still hang under Prism. RFR functions are inaccessible for practical use on the UTM VM.

4. **df-structures is the canonical field reference**: Every `df.global.*` Lua path corresponds to a field defined in these XML files. The `instance-vector` attribute directly gives the Lua path. Always consult df-structures when adding new data extraction to the bridge.

5. **Complete data available vs. accessible**: Dwarf Therapist's 29-section memory layout shows the full scope of data DF exposes — units with profession/attributes/skills/beliefs/needs/emotions/wounds/health; souls; historical figures; historical events and entities; squads, jobs, items, materials; art images. All of this is accessible via DFHack Lua using `df.global.*` paths, no direct memory reading needed.

6. **500-tick polling rate (≈12 seconds) is the production-validated interval**: The myDFHackScripts collection uses this for citizen, announcement, book, and petition polling. Suitable baseline for Chronicler's monitoring loops.

7. **Generic watcher factory pattern is the reusable core**: The `Helper.watch()` closure pattern (track known list, detect additions on each poll) is the correct abstraction for all Chronicler polling. Must be extended to detect deletions (items leaving the list) for complete change tracking.

8. **Death narratives require incident lookup**: The `eventful.onUnitDeath` event provides only the unit ID. To get cause of death and killer identity, you must look up `df.global.world.incidents.all` for a matching `incident_type.Death` record and read `death_cause` and `criminal` fields.

9. **Worldgen Lua access requires empirical validation**: df-structures confirms the data structures exist during worldgen, but whether DFHack Lua polling works on the worldgen screen (vs. after worldgen completes) is unconfirmed. The standard scripts (InvasionLogger, CitizenLogger) only run in fortress mode.

10. **exportlegends generates richer data**: DFHack's `exportlegends` command produces `legends_plus.xml` with additional data beyond the standard DF export. Chronicler should use this format for the most complete batch snapshot. DwarvenSurveyor's test files are available as parser fixtures.

### Mod Management Insights

11. **v50 is a clean break from pre-v50 modding**: SELECT/CUT tokens, info.txt metadata, and the `mod-manager.json` profile system are all new in v50. PyLNP, PyDwarf, and pre-v50 tools do not handle these. Chronicler must target v50 natively.

12. **Duplicate object IDs cause silent corruption, not last-wins**: The most dangerous raw conflict is two mods defining the same `[CREATURE:SOME_ID]`. This does not cleanly override — it causes offset bugs and silent data corruption. Level 2 conflict detection (object ID deduplication) is critical for safety.

13. **DFHack's `gui/mod-manager` Lua API is undocumented but functional**: ModHearth successfully calls `get_modlist_fields()` via `reqscript`. This is not formally documented for third-party use and may change across DFHack releases. Filesystem scan is the more robust primary path; DFHack query is the enriched secondary path.

14. **ModHearth requires DF running at world creation screen**: This is a constraint for live memory queries. Chronicler must fall back to filesystem scanning when DF is not running or not at world creation.

15. **Three-way merge (PyLNP) is the gold standard for raw-level conflict detection**: Requires a known vanilla baseline. For v50+ with SELECT/CUT, line-based text merging is insufficient — semantic understanding of tokens is needed for full accuracy.

16. **The DF mod ecosystem has no LOOT equivalent**: No centralized conflict ruleset, no automated dependency graph resolution, no community-curated load order database. Chronicler has an opportunity to fill this gap with community-contributed conflict rules.

17. **Version integer format**: DFHack uses `numeric_version` with dots removed (`"53.10"` → `5310`). This is inferred from ModHearth source, not DFHack documentation — validate against actual behavior before production use.

18. **Modpack history in DB enables powerful queries**: Storing which modpack was active when each world/event was generated enables retrospective analysis — "what mods were running when this legendary artifact was created?" This is a unique feature not available in any existing mod manager.

19. **Cross-platform requirement**: ModHearth is Windows-only (Windows Forms). DF itself runs on Windows (HomeServer and UTM VM). Chronicler's mod management UI runs on macOS. All UI code must be platform-neutral (web frontend or cross-platform Python UI).

20. **Steam Workshop integration gap**: No existing DF tool integrates Steam Workshop mod browsing, install, and update with the mod management workflow. This is a significant UX gap Chronicler could address via Steam Web API integration.

---

## Sources

### DFHack Infrastructure Sources
1. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/dfhack_remote.py` — RPC protocol implementation
2. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/blendwarf.py` — API usage examples
3. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/memorylayout.h` — Memory layout system
4. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/histfigure.h` — Historical figure extraction
5. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_figure.xml` — Complete HF structure
6. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_event.xml` — Event type hierarchy
7. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml` — world_history container
8. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.soul.xml` — unit_soul structure
9. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.personality.xml` — personality and thought types
10. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml` — world container and worldgen structures
11. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.unit.xml` — unit structure helpers
12. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/FortressStatistics.lua` — Event orchestration
13. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/Helper.lua` — Watcher factory, incident lookup
14. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/DeathLogger.lua` — Death event handling
15. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/CitizenLogger.lua` — Citizen change detection
16. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/ItemLogger.lua` — Item creation handling
17. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnounceBooks.lua` — Book/item polling
18. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/PetitionLogger.lua` — Agreement polling
19. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnouncementLogger.lua` — Report polling
20. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/unit.lua` — Struct introspection
21. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/Script/MapXMLParser.cs` — XML parsing
22. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/README.md` — exportlegends workflow

### Mod Management Sources
23. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/raw_handler.py` — Raw compiler implementation
24. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/main.py` — Tkinter GUI wrapper
25. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModHearthManager.cs` — Core business logic
26. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModReference.cs` — Mod metadata object
27. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/DFHackModClasses.cs` — DFHack data structures
28. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/bin/Debug/net7.0-windows/GetModMemoryData.lua` — DFHack Lua query
29. Dwarf Fortress Wiki — Info.txt file, Modding, Raw file, Mod articles
30. DFHack gui/mod-manager documentation and source
31. PyLNP core.mods documentation and forum thread
32. PyDwarf GitHub and modding documentation
33. NexusMods Wiki — About Load Orders, File Conflicts, Vortex approach
