# Research Report: DFHack Infrastructure Repositories

**Date**: 2026-02-23
**Scope**: Five DF/DFHack repositories examined for Chronicler data extraction patterns.
Repos: dfhack-client-python, DwarfFortressLogger (Dwarf Therapist), df-structures, DwarvenSurveyor, myDFHackScripts.

---

## Executive Summary

These five repositories collectively cover three distinct data-access paradigms for Dwarf Fortress: (1) live RPC over TCP using protobuf (dfhack-client-python), (2) direct OS-level memory reading via ptrace/ReadProcessMemory with version-specific memory layout files (DwarfFortressLogger / Dwarf Therapist), and (3) legends XML export parsing (DwarvenSurveyor). The myDFHackScripts collection demonstrates production patterns for in-process Lua scripting using the eventful plugin and polling loops.

The df-structures repository is the authoritative reference for every DF data structure in memory, defined in XML. It contains complete field-level definitions for `historical_figure`, `history_event`, `unit_soul`, and `unit_personality` — all critical for Chronicler. Every Lua path used via `df.global.world.*` corresponds to fields defined in these XML files.

For Chronicler's use case (reading DF data from a remote Windows machine), the critical finding is: the RPC protocol (dfhack-client-python) is the only viable remote access mechanism. Memory reading (Dwarf Therapist approach) requires local process access. Legend XML export is a one-time batch operation, not live. The `myDFHackScripts` patterns show exactly how to implement live polling loops, event subscriptions, and structured logging that Chronicler already replicates on the bridge side.

---

## Key Findings

### 1. dfhack-client-python: RPC Protocol Details

**Source**: `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/dfhack_remote.py`, `blendwarf.py`

#### Handshake Protocol

The protocol is binary over TCP port 5000:

```
Client sends: b'DFHack?\n' + uint32(1)     # 12 bytes total
Server replies: b'DFHack!\n' + uint32(1)   # 12 bytes, must match exactly
```

On mismatch, the library silently sets `_reader, _writer = None, None` with no exception. Chronicler must check the return value of `connect()`.

#### Frame Format

Every message is framed as an 8-byte header followed by a protobuf payload:

```
Header layout (little-endian, system byteorder):
  bytes [0:2]  - int16: message ID (negative = reply code, positive = bound method ID)
  bytes [2:4]  - padding (always 0x0000)
  bytes [4:8]  - int32: payload size in bytes
```

Reply code constants:
- `-1` = `RPC_REPLY_RESULT` — success, payload is the protobuf response
- `-2` = `RPC_REPLY_FAIL` — failure
- `-3` = `RPC_REPLY_TEXT` — text notification (raises exception in this impl)
- `-4` = `RPC_REQUEST_QUIT` — used in the close() frame

#### Method Binding

Before calling any remote method, the client must issue a `CoreBindRequest` on channel 0:

```python
br = CoreProtocol_pb2.CoreBindRequest()
br.method = "GetUnitList"
br.input_msg = EmptyMessage.DESCRIPTOR.full_name
br.output_msg = UnitList.DESCRIPTOR.full_name
br.plugin = "RemoteFortressReader"
```

The response is a `CoreBindReply` containing an `assigned_id` integer. Subsequent calls use that ID as the frame header ID. The implementation caches these IDs via `@functools.lru_cache(maxsize=65534)`.

#### Decorator Pattern

The library uses Python type annotations to auto-wire bindings:

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

#### Demonstrated Capabilities

From `blendwarf.py`, the library demonstrates:
- `GetVersionInfo()` — RemoteFortressReader version info
- `GetUnitList()` — returns a `UnitList` protobuf with a `creature_list` array
- `GetWorldInfo()` — returns `GetWorldInfoOut` protobuf

**Critical limitation**: The library has no reconnection logic, no timeout handling, and no error recovery beyond catching `RPC_REPLY_TEXT` as an exception. For Chronicler's long-running daemon, these need to be implemented.

**Missing protobuf files**: The repo contains only the source; the generated `py_export/` directory requires running `cmake && make`. The actual `.proto` files for `RemoteFortressReader_pb2`, `BasicApi_pb2`, and `CoreProtocol_pb2` are in the DFHack C++ source tree, not in this repo.

#### Connection Management Gaps

The library has no:
- Timeout on `asyncio.open_connection()`
- Retry loop for connection failures
- Heartbeat or health-check mechanism
- Thread safety (single global `_reader, _writer`)

Chronicler's `chronicler-bridge.lua` HTTP approach sidesteps these issues entirely, which is architecturally sound for the current deployment.

---

### 2. DwarfFortressLogger (Dwarf Therapist): Memory Access Architecture

**Source**: `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/memorylayout.h`, `histfigure.h`

This is the Dwarf Therapist application — not a logger per se, but a Qt-based unit management tool that reads DF memory directly.

#### Memory Access Method

Dwarf Therapist reads DF memory using OS-level process inspection:
- **Linux**: `ptrace()` syscall (restricted by `ptrace_scope` on modern distros)
- **Windows**: `ReadProcessMemory()` Win32 API
- **macOS**: `task_for_pid()` Mach API

This approach is **not viable for Chronicler** because:
1. It requires running on the same machine as DF
2. It requires elevated privileges or ptrace scope adjustment
3. It breaks with every DF version update (requires new memory layout files)
4. The HomeServer runs Windows 10 and Chronicler runs on macOS

#### Memory Layout System

The key architectural insight is the `MemoryLayout` class, which defines 29 named memory sections:

```
MEM_GLOBALS    -> "addresses"          (global pointer addresses)
MEM_UNIT       -> "dwarf_offsets"      (field offsets within unit struct)
MEM_SOUL       -> "soul_details"       (soul struct field offsets)
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
... (29 total sections)
```

The layout files are INI/QSettings files keyed by DF binary checksum. This is equivalent to what df-structures does via XML — both are describing the same memory layout, just for different consumers.

#### HistFigure Data Extraction

From `histfigure.h`, Dwarf Therapist reads from historical figures:
- ID (`m_id`)
- Memory address (`m_address`)
- Profile info address (`m_fig_info_addr`)
- Fake identity / nickname data (`m_fake_ident_addr`, `m_fake_name_addr`)
- Kill records (`m_notable_kills`, `m_other_kills`) with: name, year, site_id, count, creature type

The `kill_info` struct shows the expected shape:
```cpp
struct kill_info {
    QString name;
    int year;
    int site;
    int count;
    QString creature;
};
```

#### What Dwarf Therapist Reads (Complete Scope)

The 29 memory sections collectively cover:
- Units: profession, attributes, skills, beliefs, needs, emotions, wounds, health
- Soul: skills, preferences, personality
- Historical figures: kills, identity, fake identity
- Historical events and entities
- Squads, jobs, items, materials
- Art images

This is highly relevant as a reference for what data is available in memory — even if Chronicler accesses it via DFHack Lua rather than direct memory reads.

#### World Gen Monitoring

Dwarf Therapist does **not** monitor during world generation. It connects to a running fortress. The `DFInstance` class (not in this excerpt) connects to the process and periodically reads the unit vector. World gen is a different game state with different data structures — Dwarf Therapist does not handle this.

---

### 3. df-structures: Memory Layout Definitions

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-structures/*.xml`

This is the authoritative, community-maintained XML database of every DF data structure. It is the canonical reference for all Lua `df.global.*` paths.

#### XML Schema

```xml
<struct-type type-name='historical_figure' instance-vector='$global.world.history.figures' key-field='id'>
  <field-definition .../>
</struct-type>
```

The `instance-vector` attribute tells you the Lua path: `df.global.world.history.figures`.

#### Complete `historical_figure` Field List

From `df.history_figure.xml` (lines 984-1049):

**Core identity fields:**
- `profession` (int16, enum `profession`)
- `race` (int16, ref to `creature_raw`)
- `caste` (int16, ref to `caste_raw`)
- `sex` (enum `pronoun_type`)
- `orientation_flags` (bitfield `orientation_flags`)
- `appeared_year`, `born_year`, `born_seconds`
- `curse_year`, `curse_seconds`
- `birth_year_bias`, `birth_time_bias`
- `old_year`, `old_seconds` (age at which they become old)
- `died_year`, `died_seconds`
- `name` (compound `language_name`)
- `civ_id` (int32, ref to `historical_entity`)
- `population_id` (int32, ref to `entity_population`)
- `breed_id` (int32)
- `cultural_identity` (int32, ref to `cultural_identity`)
- `family_head_id` (int32, ref to `historical_figure`)
- `flags` (df-flagarray, index-enum `histfig_flags`)
- `unit_id` (int32, ref to `unit`)
- `nemesis_id` (int32, ref to `nemesis_record`)
- `id` (int32, the HF's own ID)
- `art_count` (int32)

**Link vectors:**
- `entity_links` (vector of `histfig_entity_link` polymorphic subtypes)
- `site_links` (vector of `histfig_site_link` polymorphic subtypes)
- `histfig_links` (vector of `histfig_hf_link` polymorphic subtypes)

**Profile pointer (deferred load):**
- `info` (pointer to `historical_figure_info` / `hf_profilest`)

**Worldgen-specific pointers (null in fortress mode):**
- `worldgen_site`, `worldgen_region`, `worldgen_layer`, `worldgen_genetics`, `worldgen_relationships`

**Transient:**
- `temp_var`, `temp_flag`
- `gen_material_skill_ip_sum`, `defensive_skill_ip_sum`
- `pool_id`

#### `historical_figure_info` (the `info` pointer)

This is a bag of optional profile pointers, all nullable:

```
metaphysical  -> metaphysical_profilest  (spheres, appearance, deity form)
skills        -> skill_profilest         (skill list, profession, account balance)
pets          -> pet_profilest           (owned creature races)
personality   -> personality_profilest   (unit_personality + mood)
masterpieces  -> artistic_profilest      (creation events, art image chunks)
whereabouts   -> state_profilest         (current location: site/region/army)
kills         -> historical_kills        (kill events, killed races/sites/counts)
wounds        -> body_profilest          (missing body parts, childbirth)
known_info    -> knowledge_profilest     (known secrets, identities, written contents)
curse         -> interaction_profilest   (necromancy, transformations, undead status)
books         -> inventory_profilest     (held artifacts, equipment)
reputation    -> reputation_profilest    (wanted status, identities, journey profile)
relationships -> historical_figure_relationships (hf_visual, hf_historical, intrigues)
```

#### HF Link Type Hierarchy

`histfig_entity_link` subtypes (entity membership):
- `member`, `former_member`, `mercenary`, `former_mercenary`
- `slave`, `former_slave`, `prisoner`, `former_prisoner`
- `enemy`, `criminal`
- `position` (+assignment_id, start_year)
- `former_position` (+end_year)
- `position_claim`, `occupation`, `former_occupation`
- `squad`, `former_squad`

`histfig_hf_link` subtypes (HF-to-HF relationships):
- `mother`, `father`, `child`
- `spouse`, `former_spouse`, `deceased_spouse`
- `lover`
- `deity`
- `prisoner`, `imprisoner`
- `master`, `former_master`, `apprentice`, `former_apprentice`
- `companion` (+agreement_id)
- `pet_owner`

`histfig_site_link` subtypes:
- `lair`, `home_site_saved_civzone`, `seat_of_power`, `hangout`
- `home_site_abstract_building`, `home_site_realization_building`, `home_site_realization_sul`
- `occupation`, `prison_abstract_building`, `prison_site_building_profile`

#### `histfig_flags` Enum

```
reveal_artwork, equipment_created, deity, force, skeletal_deity, rotting_deity,
worldgen_acted, ghost, skin_destroyed, meat_destroyed, bones_destroyed,
brag_on_kill, kill_quest, chatworthy, flashes, never_cull
```

The `deity`, `force`, `ghost`, `worldgen_acted` flags are critical for Chronicler filtering.

#### `skill_profilest` Fields

From `df.history_figure.xml`:
- `skills` (vector of `job_skill` enum values)
- `points` (vector of int32, parallel to skills)
- `professions_held` (vector of `profession` enum)
- `profession_years` (vector of int32, duration in each profession)
- `profession` (current profession enum)
- `flags` (skill_profile_flag: `mood_spent`, `ran_replace_nemesis`, `mood_succeeded`)
- `account_balance` (int32, abstract wealth tracker, since v0.47)
- `employment_held` (pointer to `honor_profilest`, since v0.47)

#### `state_profilest` (Whereabouts)

For tracking HF locations — critical for Chronicler's narrative engine:
- `state` (enum `whereabouts_type`)
- `site_id`, `subregion_id`, `feature_layer_id`
- `army_id`
- `body_state` (enum `histfig_body_state`: Active, BuriedAtSite, UnburiedAtBattlefield, etc.)
- `body_state_id`, `body_state_sub_id`
- `year`, `year_tick` (time of arrival)
- `abs_smm_x`, `abs_smm_y` (strategic map coordinates)

#### `knowledge_profilest` Fields

This is very rich for narrative generation:
- `known_secrets` (vector of interactions — necromancy slabs, etc.)
- `next_intervention_resistance_year`
- `known_written_contents` (IDs of known books/scrolls)
- `known_identities` (demon true names, etc.)
- `known_witness_reports` (crimes witnessed)
- `known_events` (rumor/entity events)
- `creature_knowledge` (creatures known)
- `known_poetic_forms`, `known_musical_forms`, `known_dance_forms`
- `knowledge` (pointer to `scholar_knowledgest` — research fields)
- `belief_systems` (religious affiliations)
- `known_locations` (site reputation reports)

#### `history_event_type` Enum (144 distinct event types)

The complete event type hierarchy from `df.history_event.xml` covers:

**War events**: WAR_ATTACKED_SITE, WAR_DESTROYED_SITE, WAR_FIELD_BATTLE, WAR_PLUNDERED_SITE, WAR_SITE_NEW_LEADER, WAR_SITE_TRIBUTE_FORCED, WAR_SITE_TAKEN_OVER, SITE_SURRENDERED

**Site events**: CREATED_SITE, HF_DESTROYED_SITE, SITE_DIED, SITE_RETIRED, RECLAIM_SITE, HF_ATTACKED_SITE, INSURRECTION_STARTED, INSURRECTION_ENDED

**HF lifecycle**: HIST_FIGURE_DIED, HIST_FIGURE_REVIVED, HIST_FIGURE_WOUNDED, HIST_FIGURE_SIMPLE_BATTLE_EVENT, HIST_FIGURE_ABDUCTED, CHANGE_HF_STATE, CHANGE_HF_JOB, CHANGE_HF_BODY_STATE, CHANGE_HF_MOOD, HIST_FIGURE_SIMPLE_ACTION

**Relationships**: ADD_HF_HF_LINK, REMOVE_HF_HF_LINK, ADD_HF_ENTITY_LINK, REMOVE_HF_ENTITY_LINK, ADD_HF_SITE_LINK, REMOVE_HF_SITE_LINK, HF_RELATIONSHIP_DENIED

**Artifacts**: ARTIFACT_CREATED, ARTIFACT_LOST, ARTIFACT_FOUND, ARTIFACT_HIDDEN, ARTIFACT_POSSESSED, ARTIFACT_RECOVERED, ARTIFACT_DROPPED, ARTIFACT_STORED, ARTIFACT_TRANSFORMED, ARTIFACT_DESTROYED, ARTIFACT_CLAIM_FORMED, ARTIFACT_GIVEN, ARTIFACT_COPIED

**Knowledge/Culture**: HF_LEARNS_SECRET, HF_GAINS_SECRET_GOAL, KNOWLEDGE_DISCOVERED, POETIC_FORM_CREATED, MUSICAL_FORM_CREATED, DANCE_FORM_CREATED, WRITTEN_CONTENT_COMPOSED

**Arts/Performance**: MASTERPIECE_CREATED_ARCH_CONSTRUCT, MASTERPIECE_CREATED_ITEM, MASTERPIECE_CREATED_DYE_ITEM, MASTERPIECE_CREATED_ITEM_IMPROVEMENT, MASTERPIECE_CREATED_FOOD, MASTERPIECE_CREATED_ENGRAVING, MASTERPIECE_LOST, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY

**Intrigue** (v0.47+): HFS_FORMED_INTRIGUE_RELATIONSHIP, FAILED_INTRIGUE_CORRUPTION, HF_CONVICTED, FAILED_FRAME_ATTEMPT, HF_INTERROGATED, ENTITY_OVERTHROWN, SABOTAGE, HF_RANSOMED, HF_ENSLAVED, HF_PREACH, ENTITY_PERSECUTED

**Entity events**: ENTITY_CREATED, ENTITY_ACTION, ENTITY_INCORPORATED, ENTITY_DISSOLVED, ENTITY_EXPELS_HF, ENTITY_LAW, ENTITY_ALLIANCE_FORMED, ENTITY_BREACH_FEATURE_LAYER, ENTITY_EQUIPMENT_PURCHASE, ENTITY_RAMPAGED_IN_SITE, ENTITY_FLED_SITE, ENTITY_SEARCHED_SITE

**Diplomatic**: FIRST_CONTACT, TOPICAGREEMENT_CONCLUDED, TOPICAGREEMENT_REJECTED, AGREEMENT_FORMED, AGREEMENT_CONCLUDED, TRADE, GAMBLE

**Base class fields** (all event types share):
- `year` (int32)
- `seconds` (int32)
- `flags` (df-flagarray, `history_event_flags`: hidden, realized, has_support_structure)
- `id` (int32)

**Virtual methods** (accessible via DFHack's vtable):
- `getType()` — returns `history_event_type`
- `getRelatedHistfigIDs()`, `getRelatedSiteIDs()`, `getRelatedEntityIDs()` etc.
- `wasHistfigKilled()`, `getKilledHistfigID()`, `wasHistfigRevived()`
- `getSentence()`, `getPhrase()` — human-readable text generation
- `getImportance()`, `getEraImportance()`
- `categorize()` / `uncategorize()` — adds/removes from `world_history.events_death`

#### `unit_soul` Structure

From `df.soul.xml`:
- `id` (int32)
- `name` (compound `language_name`)
- `race`, `sex`, `caste`
- `orientation_flags`
- `birth_year`, `birth_time`
- `curse_year`, `curse_time`
- `birth_year_bias`, `birth_time_bias`
- `old_year`, `old_time`
- `mental_attrs` (static-array of `unit_attribute`, indexed by `mental_attribute_type`)
- `skills` (vector of `unit_skill`)
- `preferences` (vector of `unit_preference`)
- `personality` (compound `unit_personality`)
- `performance_skills` (pointer to `practical_experiencest`)

`practical_experiencest` covers:
- `musical_instruments` (vector of `unit_instrument_skill`)
- `poetic_forms` (vector of `unit_poetic_skill`)
- `musical_forms` (vector of `unit_musical_skill`)
- `dance_forms` (vector of `unit_dance_skill`)

Each skill has: `id`, `rating` (enum `skill_rating`), `experience` (int32).

#### `unit_personality` Structure

From `df.personality.xml`, the personality includes mannerisms, values, ethics, and thoughts:

`mannerismst`: type (`mannerism_type` — 70+ distinct behaviors like TALKS_WHISPERS, LAUGHS_CACKLES, POSTURE_SLOUCH) + situation (`mannerism_situation_type` — WHEN_ANGRY, WHEN_NERVOUS, etc.)

`personality_valuest`: type (`value_type`) + strength (int32)

`personality_ethicst`: ethic (`ethic_type`) + response (`ethic_response`)

`unit_thought_type` — 80+ thought categories including:
- Conflict, Trauma, WitnessDeath, UnexpectedDeath, Death, Kill
- LoveSeparated, LoveReunited, NewRomance, BecomeParent
- MakeMasterwork, MadeArtifact, MasterSkill
- JailReleased, Miscarriage, GhostNightmare, GhostHaunt
- Thirsty, Dehydrated, Hungry, Starving
- MajorInjuries, MinorInjuries
- Elected, Reelected, Incident, HearRumor
- Drowsy, VeryDrowsy, Rest, FreakishWeather, Rain, SnowStorm

#### `world_history` Structure

The complete history object at `df.global.world.history`:
- `events` (vector of `history_event*`) — all history events
- `events_death` (vector of `history_event*`) — death events specifically
- `relationship_events` (vector of `relationship_event*`) — since v0.47
- `figures` (vector of `historical_figure*`) — all HFs
- `event_collections` — all and 18 typed subcategories
- `eras` (vector of `history_era`) — era names and boundaries
- `intrigues` (vector of `intrigue*`) — since v0.47
- `live_megabeasts`, `live_semimegabeasts`, `hf_allbeasts`
- `hf_beast_actors`, `hf_civ_actors`, `hf_plotters`
- `hf_teachers` (indexed by `goal_type` — 11 = necromancers)
- `hf_artists`, `hf_poets`, `hf_bards`, `hf_dancers`, `hf_scholars`
- `hf_heros`, `hf_underbelly`, `hf_religious`, `hf_merchant`

#### World Gen Structures

From `df.world.xml`, the world data includes `region_object_datast` which tracks raw content during world generation:
- `generated_plants`, `generated_creatures`, `generated_entities` (with their raw text)
- Random object batch ranges for each object type
- Mod metadata

The `era_determinerst` struct tracks worldgen state:
- `living_powers`, `living_megabeasts`, `living_semimegabeasts`
- `power_hf[3]` — the dominant power HFs
- `civilized_races`, `civilized_total`, `civilized_mundane`

During worldgen, `df.global.world.history.figures` and `df.global.world.history.events` are being built in real time. The HF's `worldgen_site`, `worldgen_region`, and `worldgen_relationships` pointers are populated during worldgen and become null in post-gen play.

#### `vague_relationship_type` Enum

The relationship types available during world gen quick-info:
childhood_friend, war_buddy, jealous_obsession, lover, former_lover, scholar_buddy, artistic_buddy, athlete_buddy, athletic_rival, business_rival, religious_persecution_grudge, grudge, persecution_grudge, supernatural_grudge, lieutenant, worshipped_deity, **spouse**, **mother**, **father**, master, apprentice, companion, ex_spouse, neighbor, shared_entity

These are the "quick" relationships cached in `wg_relationship_quick_infost` during worldgen (up to 6 slots with a current_spouse pointer and 2 current_lover slots).

---

### 4. DwarvenSurveyor: XML-Based Map Generation

**Source**: `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/Script/MapXMLParser.cs`, `README.md`

#### Architecture

DwarvenSurveyor is a Unity3D application (C#) that:
1. Reads the standard DF legends XML export (`<worldname>-legends.xml`)
2. Reads the DFHack exportlegends output (`<worldname>-legends_plus.xml`)
3. Parses sites and regions from the XML
4. Renders a 3D map with clickable site labels

The XML parsing is streaming (using `XmlReader` rather than DOM loading), reading:
- `<site>` elements: type, name, coords (`x,y`), rectangle (`xMin:yMin,xMax:yMax`)
- `<region>` elements: name, position data

Region terrain types are color-coded: wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains (10 materials, parallel color array).

#### Relevance to Chronicler

DwarvenSurveyor demonstrates:
1. The XML structure of exported legends data matches Chronicler's import format
2. Site coordinates use the same `x,y` format that Chronicler already parses
3. The `legends_plus.xml` (from DFHack's `exportlegends` command) extends the standard XML with additional data not in the base export

**The `exportlegends` DFHack command** is significant: it generates extra data that the standard DF export omits. Chronicler should use this extended format when possible.

The repo also includes sample XML files:
- `UNITYTESTregion1-00050-01-01-legends.xml` (standard)
- `UNITYTESTregion1-00050-01-15-legends_plus.xml` (extended)

These can serve as test fixtures for Chronicler's XML parser.

---

### 5. myDFHackScripts: Live Lua Scripting Patterns

**Source**: All `.lua` files in `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/`

This is a production DFHack script collection implementing an event logging system for fortress mode. It demonstrates every pattern Chronicler needs for live data access.

#### Module Architecture

```
FortressStatistics.lua  -- Main orchestrator, registers all events and starts polling
  LogHandler.lua        -- File I/O, UTF8 conversion, log path management
  Helper.lua            -- Generic watcher factory, enum resolution, unit lookup
  AnnouncementLogger.lua -- Polling: df.global.world.status.reports
  CitizenLogger.lua     -- Polling: df.global.world.units.active (citizen filter)
  DeathLogger.lua       -- Event: eventful.onUnitDeath
  ItemLogger.lua        -- Event: eventful.onItemCreated
  JobLogger.lua         -- Event: eventful.onJobCompleted
  InvasionLogger.lua    -- Event: eventful.onInvasion
  AnnounceBooks.lua     -- Polling: df.global.world.items.all (book filter)
  PetitionLogger.lua    -- Polling: df.global.world.agreements.all
```

#### Event Subscription Pattern

```lua
-- Enable events with sensitivity level (1 = fire every tick when active)
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 1)
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 1)
eventful.enableEvent(eventful.eventType.JOB_COMPLETED, 1)
eventful.enableEvent(eventful.eventType.INVASION, 1)

-- Subscribe with a unique module ID (prevents conflicts)
local modId = "DF_STATS"
eventful.onUnitDeath[modId] = function(unitId)
    DeathLogger.log(unitId)
end
eventful.onItemCreated[modId] = function(itemId)
    ItemLogger.log(itemId)
end

-- Unsubscribe cleanly
eventful.onUnitDeath[modId] = nil
```

Available event types (from the commented list in FortressStatistics.lua):
```
TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE, UNIT_DEATH,
ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION, INVENTORY_CHANGE,
REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX
```

**Note**: `REPORT` is handled via polling, not event subscription, which is the pattern Chronicler should follow for announcements.

#### Polling Pattern (dfhack.timeout)

```lua
local function startWatcher()
    local function tick()
        if not watcherActive then return end
        AnnouncementLogger.watch()    -- polls df.global.world.status.reports
        CitezenLogger.watch()         -- polls df.global.world.units.active
        BookAnnouncer.checkForNewBooks()
        PetitionLogger.watch()
        if watcherActive then
            dfhack.timeout(500, 'ticks', tick)  -- reschedule after 500 game ticks
        end
    end
    tick()
end
```

`dfhack.timeout(N, 'ticks', fn)` schedules `fn` to run after N game ticks. This is the standard DFHack async pattern. Using `'ticks'` means real game ticks (pausing when game is paused). Alternative: `'frames'` for real-time frames.

**500 ticks ≈ 12 seconds** at normal game speed. This is the polling rate used for citizen/announcement detection.

#### Generic Watcher Factory (`Helper.watch`)

The most reusable pattern — a closure that tracks a list and detects additions:

```lua
function Helper.watch(getCurrentList, getKey, logChange, logNew, secondCondition)
    local lastCount = 0
    local known_items = {}
    local firstCall = true
    
    return function()
        if firstCall then
            -- Initialize state on first call (no events fired)
            known_items = getCurrentList()
            lastCount = #known_items
            firstCall = false
            return lastCount
        end
        local current_items = getCurrentList()
        local newCount = #current_items
        if newCount ~= lastCount then
            logChange(lastCount, newCount)
            -- Find new items by key comparison
            local known_keys = {}
            for _, item in ipairs(known_items) do
                known_keys[getKey(item)] = true
            end
            for _, item in ipairs(current_items) do
                if not known_keys[getKey(item)] then
                    logNew(item)
                end
            end
            known_items = current_items
            lastCount = newCount
        end
        -- Optional second condition for value-change detection
        for id, item in ipairs(current_items) do
            local cond, value1, value2 = secondCondition(lastItemValues[id], item)
            if cond then logNew(item) end
        end
        return newCount
    end
end
```

This is structurally identical to Chronicler's change detection approach but simpler. Chronicler's implementation should handle deletions (items leaving the list), which this one does not.

#### Death Detection via Incidents

```lua
function Helper.getIncidentDeathCauseByVictimId(victimId)
    local incidents = df.global.world.incidents.all
    for _, incident in ipairs(incidents) do
        if incident.type == df.incident_type.Death then
            local death_incident = incident
            if death_incident.victim == victimId then
                return death_incident.death_cause  -- enum death_type
            end
        end
    end
    return nil
end

function Helper.getKillerIdbyVictimId(victimId)
    for _, incident in ipairs(incidents) do
        if incident.type == df.incident_type.Death then
            if death_incident.victim == victimId then
                return death_incident.criminal  -- unit ID of killer
            end
        end
    end
    return nil
end
```

This is the correct pattern for Chronicler's death narrative generation: look up the incident to get the cause and killer, then look up the killer's unit to get their name/race.

#### Key `df.global.world.*` Paths Demonstrated

```lua
df.global.world.units.active         -- active units (alive, in fortress area)
df.global.world.units.all            -- all units including historical
df.global.world.items.all            -- all items
df.global.world.status.reports       -- announcement/report log
df.global.world.agreements.all       -- petition/agreement records
df.global.world.incidents.all        -- crime/death incident records
df.global.world.entities.all         -- historical entities (civs)
df.global.plotinfo.main.fortress_site.name  -- current fortress site
df.global.world.world_data.name      -- world name
```

#### Helper Functions for Unit Data

```lua
dfhack.units.isCitizen(unit)         -- is this unit a fortress citizen?
dfhack.units.isMale(unit)            -- sex check
dfhack.units.getRaceName(unit)       -- race string
dfhack.units.getAge(unit)            -- age in years (float)
dfhack.units.getReadableName(unit)   -- "Firstname Lastname" format
dfhack.units.getVisibleName(unit)    -- visible name (may be alias)
dfhack.translation.translateName(name_compound)  -- compound name -> string
dfhack.items.getBookTitle(item)      -- title if item is a book
dfhack.items.getDescription(item, 0) -- item description
dfhack.matinfo.decode(item)          -- material info
dfhack.world.ReadCurrentDay()        -- in-game day
dfhack.world.ReadCurrentMonth()      -- in-game month (0-based)
dfhack.world.ReadCurrentYear()       -- in-game year
```

#### Item Artifact Detection

```lua
-- From ItemLogger.lua
local isArtifact = item.flags.artifact
```

#### Enum Resolution Pattern

```lua
function Helper.resolveEnum(k, v)
    local d = df[k]
    if d == nil then return tostring(v) end
    local dv = d[v]
    if dv == nil then return "unknown_enum_value" end
    return d[v] .. "," .. k .. "_value," .. tostring(v)
end

-- Usage:
local death_cause_str = Helper.resolveEnum("death_type", death_cause_enum_value)
```

This pattern (using `df[enum_type_name][value]`) is the standard DFHack enum lookup.

#### Table Introspection Pattern

From `unit.lua`, demonstrates how to inspect any DF struct at runtime:

```lua
local all = df.global.world.units.all
local details = all[#all-1]
local unit_type = details._type

-- List all fields
for field_name, field_info in pairs(unit_type._fields) do
    print("Field:", field_name, "Offset:", field_info.offset, "Type:", field_info.type_name)
end

-- Type checking
print("Size:", unit_type:sizeof())
print("Is instance:", unit_type:is_instance(some_unit))

-- Enum introspection
for k, v in pairs(df.goal_type.attrs) do
    print("Enum key:", k, "Value:", v)
end
```

This is the correct approach for Chronicler bridge development: use `_type._fields` to enumerate available fields without hardcoding offsets.

#### Script Reload Pattern

The `ScriptReload.lua` and `reset.lua` files suggest the collection handles hot-reloading via:
```lua
package.loaded["ModuleName"] = nil
local Module = require("ModuleName")
```

This is standard Lua module reload — relevant for Chronicler bridge development iteration.

---

## Comparison: Data Access Methods

| Aspect | RPC (dfhack-client-python) | Memory Reading (Dwarf Therapist) | Lua Scripting (myDFHackScripts) | XML Export (DwarvenSurveyor) |
|--------|---------------------------|----------------------------------|----------------------------------|------------------------------|
| Location | Remote TCP | Same machine | In-process DFHack | Post-session |
| Latency | ~1-5ms per call | <1ms | <1ms | Minutes |
| Scope | RemoteFortressReader only | All memory structures | All df.global.* | Limited subset |
| Live updates | Polling via RPC | Polling via OS | Events + polling | None |
| Fortress mode | Yes | Yes | Yes | No (legends only) |
| World gen | Depends on plugin | No | Yes (df.global accessible) | No |
| Setup complexity | Medium (protobuf) | High (memory layouts) | Low (Lua scripting) | Low (XML parsing) |
| Chronicler viability | Partial | Not viable | Primary mechanism | Batch supplement |

---

## Recommendations

### 1. Primary Recommendation: Lua Bridge is the Right Approach

The `myDFHackScripts` patterns confirm that Chronicler's `chronicler-bridge.lua` approach is architecturally correct. The combination of `eventful` subscriptions for reactive events and `dfhack.timeout` polling for state changes is the standard DFHack pattern.

**Specific improvements suggested:**
- Add `UNIT_NEW_ACTIVE` event subscription for unit arrival detection (not just polling `units.active`)
- Add `SYNDROME` event for curse/transformation detection
- Use `INVENTORY_CHANGE` event rather than polling items for artifact tracking

### 2. Death Narrative Enrichment

Use the incident-based pattern from Helper.lua to get death causes and killer IDs:
```lua
df.global.world.incidents.all[i].death_cause  -- enum death_type
df.global.world.incidents.all[i].criminal     -- killer unit ID
```
Cross-reference with `df.unit.find(killer_id)` to get killer name/race.

### 3. HF Data Completeness

For complete HF extraction via DFHack Lua, the access pattern should follow the df-structures XML hierarchy:

```lua
local hf = df.global.world.history.figures[i]
-- Core fields: direct access
hf.id, hf.name, hf.race, hf.caste, hf.sex, hf.born_year, hf.died_year, hf.profession

-- Profile (may be nil if not yet populated)
if hf.info then
    if hf.info.skills then
        for j, skill in ipairs(hf.info.skills.skills) do
            -- skill is job_skill enum value
            -- hf.info.skills.points[j] is the XP
        end
    end
    if hf.info.whereabouts then
        -- hf.info.whereabouts.state, site_id, body_state
    end
    if hf.info.personality then
        -- hf.info.personality.personality (unit_personality compound)
    end
    if hf.info.relationships then
        -- hf.info.relationships.hf_visual (current active relationships)
        -- hf.info.relationships.hf_historical (past relationships)
    end
end

-- Links
for _, link in ipairs(hf.entity_links) do
    -- link:getType() -> histfig_entity_link_type
    -- link.entity_id, link.link_strength
end
for _, link in ipairs(hf.histfig_links) do
    -- link:getType() -> histfig_hf_link_type (mother, father, spouse, etc.)
    -- link.target_hf, link.link_strength
end
```

### 4. World Generation Access

During worldgen, `df.global.world.history.figures` and `df.global.world.history.events` are being populated in real time. The bridge can poll these during worldgen with the same patterns. Key differences in worldgen:
- `hf.worldgen_site`, `hf.worldgen_region` pointers are non-null
- `hf.worldgen_relationships` is populated (has up to 6 quick relationships)
- Units (`hf.unit_id`) are typically `-1` (no live unit)
- `histfig_flags.worldgen_acted` indicates the HF has taken worldgen actions

The `era_determinerst` struct can be polled via `df.global.world.history.eras` to track era transitions.

### 5. Event Type Filtering for Chronicler

Based on the 144 event types, Chronicler should prioritize these for narrative generation:
- **Tier 1 (always process)**: HIST_FIGURE_DIED, ARTIFACT_CREATED, ARTIFACT_DESTROYED, HIST_FIGURE_SIMPLE_BATTLE_EVENT, WAR_FIELD_BATTLE, HIST_FIGURE_REVIVED, CHANGE_CREATURE_TYPE
- **Tier 2 (process for active HFs)**: ADD_HF_HF_LINK, HF_LEARNS_SECRET, CHANGE_HF_MOOD, MASTERPIECE_CREATED_*, WRITTEN_CONTENT_COMPOSED
- **Tier 3 (background enrichment)**: WAR_*, ENTITY_*, CHANGE_HF_STATE, CHANGE_HF_JOB

### 6. Use exportlegends for Batch Enrichment

DwarvenSurveyor confirms that DFHack's `exportlegends` command generates a richer XML (`legends_plus.xml`) than the base DF export. Run this command in Legends mode after world generation to get the most complete snapshot. This is complementary to live RPC/Lua access during fortress mode.

---

## Action Items

- [ ] Add `eventful.UNIT_NEW_ACTIVE` subscription to bridge for arrival detection
- [ ] Add `eventful.SYNDROME` subscription for curse/transformation events
- [ ] Implement incident-lookup for death cause and killer in bridge death handler
- [ ] Add `hf.info.whereabouts` extraction to HF snapshot Lua code
- [ ] Add `hf.info.personality` extraction (values, ethics, mannerisms) to HF snapshot
- [ ] Add `hf.histfig_links` extraction (family/relationship links) to HF snapshot
- [ ] Add `hf.info.kills` extraction (kill events vector) to HF snapshot
- [ ] Test `df.global.world.history.eras` polling during worldgen
- [ ] Use the test XML files from DwarvenSurveyor repo as parser fixtures
- [ ] Implement connection validation (check handshake reply) in Chronicler's RPC client

---

## Sources

All findings are from direct source code inspection. No web sources were consulted.

1. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/dfhack_remote.py` — RPC protocol implementation
2. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/blendwarf.py` — API usage examples
3. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/memorylayout.h` — Memory layout system
4. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/histfigure.h` — Historical figure extraction
5. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_figure.xml` — Complete HF structure definition
6. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_event.xml` — Event type hierarchy
7. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml` — world_history container
8. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.soul.xml` — unit_soul structure
9. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.personality.xml` — personality and thought types
10. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml` — world container and worldgen structures
11. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.unit.xml` — unit structure helpers (conflict_reportst, etc.)
12. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/FortressStatistics.lua` — Event orchestration
13. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/Helper.lua` — Watcher factory, incident lookup
14. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/DeathLogger.lua` — Death event handling
15. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/CitizenLogger.lua` — Citizen change detection
16. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/ItemLogger.lua` — Item creation handling
17. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnounceBooks.lua` — Book/item polling
18. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/PetitionLogger.lua` — Agreement polling
19. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnouncementLogger.lua` — Report polling
20. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/unit.lua` — Struct introspection patterns
21. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/Script/MapXMLParser.cs` — XML parsing architecture
22. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/README.md` — exportlegends workflow

---

## Uncertainties

1. **RemoteFortressReader availability**: The README and blendwarf.py reference `RemoteFortressReader` as a DFHack plugin, but Chronicler's MEMORY.md notes it is unavailable (`enable RemoteFortressReader` fails). This means the RPC methods `GetUnitList` and `GetVersionInfo` via RemoteFortressReader plugin are not usable on the HomeServer. Only core DFHack RPC methods and Lua execution are available.

2. **`unit.lua` file in the wrong repo**: The file `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/unit.lua` is a struct introspection helper, not a unit data extraction script. It appears to be a development/debug tool rather than production logging code.

3. **worldgen Lua access**: While df-structures confirms the data structures exist during worldgen, whether DFHack Lua can poll them in real-time during the worldgen screen (as opposed to after worldgen completes) depends on DFHack's game state hooks. The InvasionLogger and similar scripts only run in fortress mode. This requires empirical testing.

4. **`df.unit.xml` is actually `df.unit.xml` (the conflict/opinion file)**: The `df.unit.xml` in df-structures appears to define conflict-related structures (`conflict_reportst`, `opinion_type`, `unit_action_data_*`), not the main `unit` struct itself. The primary unit definition is likely split across multiple files. The `unit_soul` is in `df.soul.xml`.

5. **History event subtypes in Lua**: While the XML defines many event subtypes (e.g., `history_event_war_field_battlest`), accessing subtype-specific fields via DFHack Lua requires casting: `local e = df.history_event_war_field_battlest(event_ptr)`. The availability of this casting pattern for all 144 subtypes has not been verified empirically.

---

## Related Topics

- DFHack protobuf schema for RemoteFortressReader (in the DFHack C++ source tree, not these repos)
- `df.history_event_collection` types (battles, raids, sieges as event groups)
- `df.entity.xml` — historical entity (civ) structure for political narrative
- `df.site.xml` — world site structure for location narrative
- `df.nemesis.xml` — nemesis record linking HFs to living units
- `df.artifact.xml` — artifact_record structure for artifact chain-of-custody narrative
- DFHack `exportlegends` Lua source code for legends_plus XML format specification

