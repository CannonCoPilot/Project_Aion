# Component Research: Data ETL Systems

**Component**: Data ETL (Extract, Transform, Load) Systems
**Date**: 2026-02-25
**Sources**: planning-history.md, dfhack-infrastructure-research.md, worldgen-scraping-research.md, dwarven-surveyor-scripts-research.md, df-ai-research.md, narrator-weblegends-research.md, legends-browsers-research.md, research-synthesis.md, plus direct codebase inspection of `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/`

---

## 1. Legends XML Pipeline

### 1.1 Parser Architecture

The Legends XML Parser is the primary batch ingestion path for historical data. It converts DF's exported XML files into the CDM PostgreSQL schema.

**Implementation file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` (733 lines)

**Technology**: Python `lxml` library using `iterparse` (SAX-style streaming). This is the consensus best practice across all reference tools:

| Tool | XML Approach | Memory Model |
|------|-------------|--------------|
| Chronicler | `lxml.etree.iterparse` + `root.clear()` | Streaming, constant memory |
| LegendsBrowser (Java) | SAX `XMLReader` + annotation handler | Streaming, constant memory |
| LegendsBrowser2 (Go) | Custom hand-written tokenizer (NOT `encoding/xml`) | Streaming, buffered I/O |
| LegendsViewer-Next (.NET) | Async XML with `FilteredStream` | Streaming, filtered |
| DwarvenSurveyor (C#) | `XmlReader` streaming | Streaming |
| df-narrator (Python) | `xml.etree.ElementTree` full-tree parse + `root.clear()` | Full-tree, then freed |

**Key design decisions**:
- Streaming via `iterparse` handles >25 MB files without OOM
- Recommended library in stack matrix: `lxml>=5.0`
- `root.clear()` called after each top-level element to free parsed subtrees
- Targets files up to 1 GB+ (verified by LegendsBrowser2's design for 400MB+ exports)

### 1.2 Dual-File Merge (legends.xml + legends_plus.xml)

Chronicler ingests two XML files:

1. **`legends.xml`** — Standard DF Legends Mode export (produced by "Export XML" button)
2. **`legends_plus.xml`** — DFHack `exportlegends` command output (enriched data)

The merge strategy (confirmed by LegendsViewer-Next and LegendsBrowser2):
- Parse `legends.xml` first to establish all entity records
- Parse `legends_plus.xml` second, matching by `id` fields
- `legends_plus.xml` provides additional data not in the base export:
  - Per-tile coordinate arrays for regions (pipe-delimited `x,y|x,y|...` format)
  - Evilness ratings for regions
  - `cur_owner_id` for sites (used to fix BUG-003)
  - Entity positions, assignments, and honors
  - Relationship profiles (visual/historical/identity)
  - Vampire/werebeast/necromancer "since" years
  - Written content references and styles
  - Entity occasion schedules

**Design Decision #19**: Written Contents parsed from BOTH sources (dual-source parsing).

### 1.3 Sections Currently Parsed (8 of 14+)

```
<sites>
<artifacts>
<historical_figures>
<entities>
<historical_events>
<historical_event_collections>
<landmasses>          (legends_plus only)
<mountain_peaks>      (legends_plus only)
```

### 1.4 Additional Legends Data Targets (Not Yet Parsed)

| Section | Priority | Notes |
|---------|----------|-------|
| `<written_contents>` | Phase 3.2 | title, author HF ID, year, type, form, references. **NOW DONE**: 61,692 records imported |
| `<historical_eras>` | Phase 3.3 | name, type, start/end year. **NOW DONE**: 2 eras imported |
| `<regions>` + `<underground_regions>` | Phase 3.1 | Terrain types, evilness. **NOW DONE**: 240/240 regions, 125/125 underground |
| `<world_constructions>` | Future | Bridges, roads, tunnels |
| `<entity_populations>` | Phase 3.4 | Population counts by race at sites |
| `<art_forms>` (3 types) | Phase 3.5 | Poetic, musical, dance forms |
| `<rivers>` | Future | Geographic paths |
| `<creature_raw>` | Future | Creature definitions |
| `<site_properties>` | Future | Individual parcels, owner HF |
| `<identities>` | Future | False identities used by HFs |

### 1.5 The 141 Event Types

The parser handles 141 canonical event types (133 from df-structures `history_event_type` enum + 8 DF 50.x Steam-era additions):

**Storage strategy (Design Decision #25)**: Event type stored as TEXT column (no DB enum). Raw event data stored in `details` JSONB column. This allows:
- No DB migration when new event types are added
- JSONB captures all fields per event type without schema changes
- LLM-based storyteller interprets unknown event types via reasoning

**Event type categories**:

| Category | Count | Key Types |
|----------|-------|-----------|
| HF Lifecycle | 17 | `hf died`, `hf revived`, `hf wounded`, `hf abducted`, `change hf state`, `change hf job` |
| HF Relationships | 10 | `add/remove hf_hf_link`, `add/remove hf_entity_link`, `add/remove hf_site_link` |
| HF Actions | 14 | `hf attacked site`, `hf does interaction`, `hf learns secret`, `hf preach` |
| HF Intrigue | 6 | `hf convicted`, `hf interrogated`, `failed intrigue corruption`, `sabotage` |
| Artifacts | 13 | `artifact created/destroyed/lost/found/given/possessed/recovered/stored/transformed/copied` |
| Sites & Construction | 11 | `created site`, `war destroyed site`, `reclaim site`, `site died` |
| Entities | 14+ | `entity created/dissolved/incorporated/overthrown/law/persecuted` |
| War & Combat | 8+ | `war field battle`, `squad vs squad`, `tactical situation` |
| Diplomacy | 9+ | `first contact`, `peace accepted/rejected`, `trade`, `merchant` |
| Culture & Art | 8+ | `poetic/musical/dance form created`, `written content composed`, `knowledge discovered` |
| Masterpieces | 7 | `masterpiece created arch_construct/item/dye_item/food/engraving`, `masterpiece lost` |
| Occasions | 5 | `ceremony`, `competition`, `performance`, `procession`, `gamble` |

**Coverage comparison**:
- LegendsBrowser2: 132 event types handled
- LegendsViewer-Next: 115+ event types
- weblegends: 94 per-event .cpp files
- Chronicler DB observes: 97 types in world 8 ("Thadar En")

**11 types with no LB2 handler**: AGREEMENTS_VOIDED, ARTIFACT_DROPPED, ARTIFACT_HIDDEN, CHANGE_HF_MOOD, ENTITY_ACTION, HF_ACT_ON_ARTIFACT, HF_ACT_ON_BUILDING, HF_RAZED_BUILDING, HIST_FIGURE_SIMPLE_ACTION, INSURRECTION_ENDED, ADD_ENTITY_SITE_PROFILE_FLAG

### 1.6 legends_plus Coordinate Parsing

From DwarvenSurveyor research — the `legends_plus.xml` provides per-tile region coordinates in pipe-delimited format:

```xml
<region>
  <id>42</id>
  <coords>10,5|10,6|11,5|11,6|12,5</coords>
  <evilness>evil</evilness>
</region>
```

The `ParseCoordinates` algorithm:
```python
def parse_coordinates(coords_str):
    """Parse pipe-delimited 'x,y|x,y|...' coordinate string."""
    tiles = []
    for pair in coords_str.split('|'):
        x, y = pair.split(',')
        tiles.append((int(x), int(y)))
    return tiles
```

Site coordinates use single `x,y` format. Site rectangles use `xMin:yMin,xMax:yMax` bounding box format (divided by 16 to convert to world tile coordinates).

### 1.7 Boolean Flag Derivation

Several critical HF boolean flags are NOT in the XML directly — they must be derived during post-parse processing:

| Flag | Derivation Method | Source |
|------|-------------------|--------|
| `is_vampire` | Any `active_interaction` containing "VAMPIRE" (case-insensitive) | df-narrator |
| `is_necromancer` | Any `active_interaction` containing "NECROMANCER" or "RAISE" | df-narrator |
| `is_deity` | `associated_type == "DEITY"` | XML direct |
| `is_force` | `associated_type == "FORCE"` | XML direct |
| `is_megabeast` | Race in `{DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN}` | df-narrator (hardcoded) |
| `is_werebeast` | `HfDoesInteraction` events with `DEITY_CURSE_WEREBEAST_*` | LB2 processing |
| `is_ghost` | `histfig_flags.ghost` or events | df-structures |
| `is_adventurer` | XML direct flag | legends_plus |
| `is_leader` | Derived from `world_history.txt` leader names | LB2 history parser |
| `site.is_ruin` | Derived from destruction/reclaim events | LB2 post-processing |

**More robust megabeast detection** (from weblegends): Use `creature_raw_flags::HAS_ANY_TITAN`, `HAS_ANY_FEATURE_BEAST`, `HAS_ANY_UNIQUE_DEMON` from creature raws instead of hardcoded race set.

### 1.8 JSONB Enrichment

Each `history_event` row stores event-type-specific fields in a `details` JSONB column. This is the flexible storage approach:

```sql
INSERT INTO history_events (id, world_id, year, seconds72, type, details)
VALUES (12345, 8, 125, 14400, 'hf died', '{
    "hfid": 4567,
    "slayer_hfid": 890,
    "site_id": 23,
    "death_cause": "SHOT",
    "weapon_type": "crossbow",
    "slayer_race": "GOBLIN"
}'::jsonb);
```

The `_summarize_details()` function in the storyteller context module expands JSONB fields for LLM consumption.

### 1.9 Post-Parse Processing Pipeline

After XML ingestion, a cross-referencing pass must run (confirmed by LB2's `world.process()` in `process.go`):

1. **Resolve HF-to-HF family links** — build parent/child/spouse graphs from `hf_links`
2. **Resolve HF-to-entity position assignments** — link positions to HFs
3. **Derive vampire/werebeast/necromancer flags** from interaction events (`HfDoesInteraction` with `DEITY_CURSE_*`)
4. **Compute site ruin status** from destruction/reclaim events
5. **Build entity war lists** from event collections
6. **Compute HF kill lists** from `hf died` events (BUG-005 fix: group by `hf_id_2` (slayer), not `hf_id_1` (victim))
7. **Calculate importance scores** using df-narrator formulas
8. **Synthesize relationship events** from `HistoricalEventRelationships` (plus-mode data not in main event stream)
9. **Assign River IDs** (rivers stored as slice, not map in LB2)
10. **Fix world construction part relationships**

### 1.10 Control Character Filtering

DF XML output contains raw control characters that break standard XML parsers. Reference implementations handle this:

- **LegendsViewer-Next**: `FilteredStream` wrapper replaces all bytes < 32 with spaces
- **LegendsBrowser2**: `cp473.go` converts legacy IBM CP473 characters to Unicode
- **LegendsBrowser (Java)**: `CodingErrorAction.IGNORE` for malformed bytes

**Verification needed**: Confirm Chronicler's `xml_parser.py` handles control characters and IBM CP473 encoding.

### 1.11 HF_FIELDS — Canonical HF Reference Field List

From df-narrator — these XML event fields reference historical figure IDs:

```python
HF_FIELDS = {
    'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid',
    'changee_hfid', 'changer_hfid', 'woundee_hfid', 'wounder_hfid',
    'doer_hfid', 'target_hfid', 'attacker_hfid', 'defender_hfid',
    'hist_fig_id', 'body_hfid', 'hfid_target', 'hfid_attacker',
    'hfid_defender', 'trickster_hfid', 'cover_hfid', 'student_hfid',
    'teacher_hfid', 'trainer_hfid', 'seeker_hfid',
}
```

This set is critical for:
- Building HF event indexes (which events reference which HFs)
- Co-appearance rivalry detection (shared events between HFs)
- Kill count computation (slayer_hfid in `hf died` events)

### 1.12 HF Sub-Profiles Not Yet Extracted

These high-value fields exist in the XML but are not yet parsed:

Kill profile, wound history, skill history, personality (50 traits, 32 values, beliefs, goals, mannerisms 70+ types, ethics, thought history 80+ categories), whereabouts, reputation (hero, murderer, psychopath, etc.), known secrets, life goal, active interactions, lineage curse parent, BreedId, adventurer flag, current geographic state, notable kills, dedicated structures, intrigue actors/plots, orientation flags, worldgen flags, journey pets, masterpieces.

### 1.13 Implementation Status

| Component | Status | Metrics |
|-----------|--------|---------|
| XML parser core | **COMPLETE** | 733 lines, lxml iterparse, streaming |
| 141 event type enumeration | **COMPLETE** | All types recognized |
| legends_plus merge | **COMPLETE** | Dual-source parsing |
| Composite PK migration | **COMPLETE** | 13 tables, resolves 10,932 cross-world collisions |
| Written contents parsing | **COMPLETE** | 61,692 records across 2 worlds |
| Historical eras parsing | **COMPLETE** | 2 eras |
| Region/underground parsing | **COMPLETE** | 240+125 regions, 0 NULLs |
| Entity position extraction | **COMPLETE** | 11,712 definitions, 13,501 assignments, 41,199 historical links |
| Post-parse processing pipeline | **PARTIAL** | Kill counts fixed (BUG-005), link dedup done (BUG-006), some steps pending |
| HF sub-profile extraction | **NOT STARTED** | High storytelling value fields |
| World constructions | **NOT STARTED** | Roads, bridges, tunnels |
| Art forms (3 types) | **NOT STARTED** | Poetic, musical, dance |
| Identities | **NOT STARTED** | False identities |
| Rivers | **NOT STARTED** | Geographic paths |
| Importance scoring on ingestion | **NOT STARTED** | df-narrator formulas ready |

---

## 2. Live Bridge System (chronicler-bridge.lua)

### 2.1 Architecture Overview

**Implementation file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` (922 lines)

The live bridge is a DFHack Lua script running as a `repeat` job inside the DF process. It periodically snapshots game state to a JSON file served over HTTP.

**Invocation**:
```bash
repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]
```

**Version**: v6 (current)

**Architecture**: Polling-based, NOT event-driven. Runs every 100 game ticks (~2.4 seconds at normal speed). Writes comprehensive game state to `chronicler-state.json`, which is served over HTTP on port 8888.

### 2.2 The 16 Sections and 7 Data Domains

The bridge captures data across 16 JSON sections organized into 7 logical data domains:

**Domain 1: Time & World Context**
- `game_time` — current year, tick, day, month, season
- `world_info` — world name, dimensions, current fortress name

**Domain 2: Population**
- `unit_summary` — 12 fields + flags + mood + emotions per unit
- `creature_raws` — creature definitions
- `dwarf_skills` — skill levels per unit
- `dwarf_emotions` — emotional state per unit
- `squads` — military squad composition

**Domain 3: Economy & Items**
- `artifacts` — artifact listing
- `buildings` — building inventory
- `zones` — activity zone definitions
- `mandates` — active mandates

**Domain 4: External Relations**
- `armies` — approaching/known armies
- `diplomacy` — diplomatic state
- `entities` — known civilizations

**Domain 5: Events & History**
- `announcements` — cursor-based, 200 announcements per tick
- `history` — cursor-based, 100 events per tick
- `event_collections` — grouped event collections

**Domain 6: Law**
- `crimes` — crime records

**Domain 7: Probes (separate Lua scripts)**
- `probe_armies()` — detailed army composition
- `probe_diplomacy()` — diplomatic relationships
- `probe_unit_detail(id)` — detailed unit inspection

### 2.3 Unit Data Captured (12 Fields + Extended)

Per-unit fields currently captured:
```lua
{
    id = unit.id,
    name = dfhack.TranslateName(unit.name),
    english_name = dfhack.TranslateName(unit.name, true),
    race = dfhack.units.getRaceName(unit),
    profession = df.profession[unit.profession],
    site_id = unit.pos and unit.pos.x or nil,
    pos_x = unit.pos.x, pos_y = unit.pos.y, pos_z = unit.pos.z,
    is_alive = not dfhack.units.isDead(unit),
    hist_fig_id = unit.hist_figure_id,
    stress_level = unit.status.current_soul and unit.status.current_soul.personality.stress or nil,
    mood = df.mood_type[unit.mood],
    -- Extended: flags, emotions
}
```

### 2.4 Unit Data NOT Yet Captured

| Field | DFHack Lua Path | Priority |
|-------|----------------|----------|
| Health/wounds | `unit.body.wounds` | Medium |
| Inventory/equipped | `unit.inventory` | Medium |
| Birth year | `unit.birth_year` | High |
| Old year (lifespan) | `unit.old_year` | Medium |
| Relationship IDs (9 slots) | `unit.relationship_ids.Mother/Father/...` | High |
| Following unit | `unit.following` | Low |
| Full personality needs | `unit.status.current_soul.personality.needs` | Medium |
| Memories | `unit.status.current_soul.personality.memories` | Low |
| Preferences | `unit.status.current_soul.preferences` | Low |
| Cultural identity | `unit.cultural_identity` | Low |

### 2.5 World Structures NOT Yet Captured

| Structure | Lua Path | Performance Risk |
|-----------|---------|-----------------|
| Activities | `world.activities` | Low |
| Written contents | `world.written_contents.all` | Low |
| Job list | `world.jobs.list` | Medium |
| Manager orders | `world.manager_orders` | Low |
| All items | `world.items.all` | **HIGH** (massive vector) |
| All plants | `world.plants.all` | Medium |
| Interactions | `world.interactions` | Low |
| Identities | `world.identities` | Low |
| Occupations | `world.occupations` | Low |
| Belief systems | `world.belief_systems` | Low |

### 2.6 Cursor-Based Event Ingestion

The bridge uses cursor-based pagination for high-volume data:

- **Announcements**: Tracks `last_announcement_id`, ingests up to 200 new announcements per tick
- **History events**: Tracks `last_event_id`, ingests up to 100 new events per tick

This prevents overwhelming the JSON output while ensuring no events are missed during normal play.

### 2.7 Bridge Enhancement Requirements

From research synthesis:

1. **Add `eventful` subscriptions** — Reactive event capture instead of polling-only:
   ```lua
   eventful.enableEvent(eventful.eventType.UNIT_DEATH, 1)
   eventful.enableEvent(eventful.eventType.ITEM_CREATED, 1)
   eventful.enableEvent(eventful.eventType.JOB_COMPLETED, 1)
   eventful.enableEvent(eventful.eventType.UNIT_NEW_ACTIVE, 1)
   eventful.enableEvent(eventful.eventType.SYNDROME, 1)

   local modId = "CHRONICLER"
   eventful.onUnitDeath[modId] = function(unitId)
       -- immediate death capture
   end
   eventful.onItemCreated[modId] = function(itemId)
       -- artifact detection
   end
   ```

2. **Death cause enrichment** via incident system:
   ```lua
   function getDeathCause(victimId)
       for _, incident in ipairs(df.global.world.incidents.all) do
           if incident.type == df.incident_type.Death
              and incident.victim == victimId then
               return df.death_type[incident.death_cause], incident.criminal
           end
       end
       return nil, nil
   end
   ```

3. **Parent/family chain** extraction:
   ```lua
   unit.relationship_ids.Mother   -- hist_figure_id of mother
   unit.relationship_ids.Father   -- hist_figure_id of father
   ```

4. **Book detection**:
   ```lua
   dfhack.items.getBookTitle(item)  -- returns title if item is a book
   ```

5. **Incident system** for crime/death narrative enrichment

### 2.8 Hybrid Polling + Events Architecture

The proven architecture (validated by myDFHackScripts):

```
+-- eventful subscriptions (reactive, per-event)
|   +-- UNIT_DEATH     -> immediate death capture
|   +-- ITEM_CREATED   -> artifact detection
|   +-- UNIT_NEW_ACTIVE -> arrival detection
|   +-- SYNDROME       -> curse/transformation
|   +-- JOB_COMPLETED  -> masterwork detection
|
+-- dfhack.timeout polling (periodic, state-based)
    +-- every 100 ticks: unit state snapshot
    +-- every 100 ticks: announcement cursor
    +-- every 100 ticks: history event cursor
    +-- every 500 ticks: citizen change detection
    +-- every 500 ticks: agreement/petition check
    +-- every 500 ticks: book check
```

The `eventful` module provides these event types (complete list from myDFHackScripts):
```
TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE,
UNIT_DEATH, ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION,
INVENTORY_CHANGE, REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX
```

**Key timing**: `500 ticks ≈ 12 seconds` at normal game speed. This is the production-validated polling rate from myDFHackScripts.

### 2.9 Generic Watcher Factory Pattern

From myDFHackScripts `Helper.watch()` — a reusable closure that tracks a list and detects additions:

```lua
function Helper.watch(getCurrentList, getKey, logChange, logNew, secondCondition)
    local lastCount = 0
    local known_items = {}
    local firstCall = true

    return function()
        if firstCall then
            known_items = getCurrentList()
            lastCount = #known_items
            firstCall = false
            return lastCount
        end
        local current_items = getCurrentList()
        local newCount = #current_items
        if newCount ~= lastCount then
            logChange(lastCount, newCount)
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
        return newCount
    end
end
```

**Note**: Chronicler's implementation should handle DELETIONS (items leaving the list), which myDFHackScripts does not.

---

## 3. DFHack Integration

### 3.1 Key Lua Global Paths

All paths verified against df-structures for DF 53.10-r1:

```lua
-- Global state
df.global.cur_year
df.global.cur_year_tick
df.global.pause_state
df.global.ui                              -- fortress UI state

-- World data container
df.global.world                           -- top-level world object
df.global.world.units.active              -- active units (alive, in fortress area)
df.global.world.units.all                 -- all units including historical
df.global.world.items.all                 -- all items
df.global.world.status.reports            -- announcement/report log
df.global.world.agreements.all            -- petition/agreement records
df.global.world.incidents.all             -- crime/death incident records
df.global.world.entities.all              -- historical entities (civs)
df.global.world.history.figures           -- all historical figures
df.global.world.history.events            -- all history events
df.global.world.history.eras              -- era definitions
df.global.world.artifacts.all             -- all artifacts
df.global.world.world_data.sites          -- all sites
df.global.world.world_data.regions        -- all regions

-- Fortress-specific
df.global.plotinfo.main.fortress_site.name  -- current fortress name
df.global.world.world_data.name             -- world name
```

### 3.2 Key DFHack Lua Helper Functions

```lua
-- Unit inspection
dfhack.units.isCitizen(unit)         -- is fortress citizen?
dfhack.units.isDead(unit)            -- is dead?
dfhack.units.isSane(unit)            -- is sane?
dfhack.units.isMale(unit)            -- sex check
dfhack.units.isBaby(unit)            -- is infant?
dfhack.units.getRaceName(unit)       -- race string
dfhack.units.getAge(unit)            -- age in years (float)
dfhack.units.getReadableName(unit)   -- "Firstname Lastname"
dfhack.units.getVisibleName(unit)    -- visible name (may be alias)
dfhack.units.getPosition(unit)       -- x,y,z coords
dfhack.units.getNoblePositions(unit) -- noble position list

-- Translation
dfhack.translation.translateName(name_compound)      -- compound name -> string
dfhack.TranslateName(unit.name)                       -- shorthand
dfhack.TranslateName(unit.name, true)                 -- English translation

-- Items
dfhack.items.getBookTitle(item)      -- title if item is a book
dfhack.items.getDescription(item, 0) -- item description
dfhack.items.getValue(item)          -- item value
dfhack.matinfo.decode(item)          -- material info

-- Game time
dfhack.world.ReadCurrentDay()        -- in-game day
dfhack.world.ReadCurrentMonth()      -- in-game month (0-based)
dfhack.world.ReadCurrentYear()       -- in-game year

-- Enum resolution
df[enum_type_name][value]            -- standard enum lookup
-- e.g. df.death_type[incident.death_cause]
-- e.g. df.profession[unit.profession]
-- e.g. df.mood_type[unit.mood]
```

### 3.3 Historical Figure Access via Lua

For complete HF extraction via DFHack Lua (from df-structures XML definitions):

```lua
local hf = df.global.world.history.figures[i]

-- Core identity (direct access)
hf.id, hf.name, hf.race, hf.caste, hf.sex
hf.born_year, hf.died_year, hf.profession
hf.civ_id, hf.unit_id, hf.nemesis_id
hf.appeared_year, hf.curse_year
hf.breed_id, hf.cultural_identity, hf.family_head_id
hf.flags  -- df-flagarray, includes: deity, force, ghost, worldgen_acted

-- Profile bag (may be nil)
if hf.info then
    -- Skills
    if hf.info.skills then
        for j, skill in ipairs(hf.info.skills.skills) do
            -- skill is job_skill enum value
            -- hf.info.skills.points[j] is the XP
        end
        hf.info.skills.profession  -- current profession enum
    end

    -- Whereabouts
    if hf.info.whereabouts then
        hf.info.whereabouts.state     -- enum whereabouts_type
        hf.info.whereabouts.site_id
        hf.info.whereabouts.body_state -- Active, BuriedAtSite, etc.
    end

    -- Personality
    if hf.info.personality then
        -- hf.info.personality.personality (unit_personality compound)
        -- Contains: mannerisms (70+), values, ethics, thoughts (80+)
    end

    -- Relationships
    if hf.info.relationships then
        hf.info.relationships.hf_visual      -- current active
        hf.info.relationships.hf_historical  -- past
    end

    -- Knowledge (very rich for narrative)
    if hf.info.known_info then
        -- known_secrets, known_written_contents, known_identities
        -- known_witness_reports, creature_knowledge
        -- known_poetic_forms, known_musical_forms, known_dance_forms
        -- belief_systems
    end

    -- Kills
    if hf.info.kills then
        -- kill events vector with race, count, site
    end

    -- Reputation
    if hf.info.reputation then
        -- wanted status, journey profile, identities
    end
end

-- Links (always populated)
for _, link in ipairs(hf.entity_links) do
    link:getType()    -- histfig_entity_link_type
    link.entity_id
end
for _, link in ipairs(hf.histfig_links) do
    link:getType()    -- mother, father, spouse, child, etc.
    link.target_hf
end
for _, link in ipairs(hf.site_links) do
    link:getType()    -- lair, home, seat_of_power, etc.
    link.site_id
end
```

### 3.4 DFHack RPC Status

**TCP RPC is BROKEN** for game-thread calls on DFHack 53.x under Prism (ARM Windows VM):

| Call Type | Status | Explanation |
|-----------|--------|-------------|
| `GetVersion` | WORKS | Cached, no Core lock needed |
| `GetWorldInfo` | WORKS | Cached, no Core lock needed |
| `RunCommand` | **HANGS** | CoreSuspender never acquired from network thread |
| All RFR calls | **HANGS** | Game-thread dispatch fails under Prism |

**Root cause**: Thread scheduling issue where the TCP server's network thread cannot acquire the Core lock for game-thread dispatch under Prism's x86 emulation layer.

**Working transport**: `dfhack-run` over SSH executes Lua commands directly on the DFHack Core thread, bypassing TCP dispatch entirely. Verified access to ALL data domains:
- `df.global.world.history.figures` (48,366 HFs)
- `df.global.world.history.events` (442,716 events)
- `df.global.world.entities.all` (4,901 entities)
- `df.global.world.artifacts.all` (8,035 artifacts)
- `df.global.world.world_data.sites` (2,154 sites)

**Design Decision #3**: `dfhack-run` over SSH as primary transport.
**Design Decision #21**: Lua Bridge as primary data path (no RFR dependency).

### 3.5 RemoteFortressReader (RFR) Status

RFR IS loaded in DFHack 53.10-r1:
- Bind succeeds, IDs assigned
- 41 RPC functions registered
- `enable RemoteFortressReader` fails because no `plugin_enable()` exists — by design, plugin auto-activates at init

However, ALL game-thread RPC calls hang (see above). RFR is effectively unusable over the network. The bridge Lua approach is the correct architecture.

### 3.6 dfhack-client-python RPC Protocol Details

For reference — the binary RPC protocol over TCP port 5000:

**Handshake**:
```
Client sends: b'DFHack?\n' + uint32(1)     # 12 bytes
Server replies: b'DFHack!\n' + uint32(1)    # 12 bytes, must match
```

**Frame format** (little-endian):
```
bytes [0:2]  - int16: message ID (negative = reply code, positive = method ID)
bytes [2:4]  - padding (0x0000)
bytes [4:8]  - int32: payload size
```

**Reply codes**: -1 = success, -2 = fail, -3 = text notification, -4 = quit

**Method binding**: `CoreBindRequest` on channel 0 assigns method IDs via `lru_cache(65534)`.

**Gaps in dfhack-client-python**:
- No timeout on `asyncio.open_connection()`
- No retry loop
- No heartbeat/health-check
- No thread safety (single global reader/writer)

### 3.7 DFHack State Change Events

```lua
SC_WORLD_LOADED = 0       -- after worldgen completes
SC_WORLD_UNLOADED = 1
SC_MAP_LOADED = 2
SC_MAP_UNLOADED = 3
SC_VIEWSCREEN_CHANGED = 4
SC_CORE_INITIALIZED = 5
SC_PAUSED = 7
SC_UNPAUSED = 8
-- NOTE: No SC_WORLDGEN_STARTED or SC_WORLDGEN_TICK
```

**No worldgen-specific state change events exist.** Worldgen monitoring requires polling via `dfhack.timeout` or `repeat` jobs.

### 3.8 Struct Introspection Pattern

For runtime field discovery (from myDFHackScripts):

```lua
local unit_type = unit._type
for field_name, field_info in pairs(unit_type._fields) do
    print("Field:", field_name, "Offset:", field_info.offset, "Type:", field_info.type_name)
end
```

This avoids hardcoding field offsets and enables dynamic bridge expansion.

---

## 4. Worldgen Monitoring

### 4.1 Novel Capability — First-Mover Opportunity

**No existing tool monitors DF worldgen in real time.** This is a confirmed capability gap across the entire DF ecosystem:

- `exportlegends` — runs from Legends mode AFTER worldgen, not during
- `df-ai` — polls `worldgen_status.state == 10` only as a completion signal
- `weblegends` test — same completion poll
- `DwarfGenManager` — batch script for re-generation, reads post-worldgen files only
- DFHack maintainer (myk002, Discussion #3774, 2023): "DFHack has very little tooling around worldgen currently"

### 4.2 `world_generatorst` State Machine

The struct at `df.global.world.worldgen_status` (type `world_generatorst`) is fully defined in df-structures (`df.region.xml`, line 843):

```xml
<struct-type type-name='world_generatorst'>
    <enum base-type='int16_t' name='state'>
        <enum-item name='None'               value='-1'/>
        <enum-item name='Initializing'       value='0'/>
        <enum-item name='PreparingElevation'/>
        <enum-item name='SettingTemperature'/>
        <enum-item name='RunningRivers'/>
        <enum-item name='FormingLakesAndMinerals'/>
        <enum-item name='GrowingVegetation'/>
        <enum-item name='VerifyingTerrain'/>
        <enum-item name='ImportingWildlife'/>
        <enum-item name='RecountingLegends'/>
        <enum-item name='Finalizing'/>
        <enum-item name='Done'               value='10'/>
    </enum>
    <int32_t name='num_rejects'/>
    <int32_t name='rivers_total'/>
    <int32_t name='rivers_cur'/>
    <int32_t name='civ_count'/>
    <int32_t name='civs_left_to_place'/>
    <int32_t name='rampage_num'/>
    <stl-vector name='entities' pointer-type='historical_entity'/>
    <stl-vector name='sites' pointer-type='world_site'/>
    <int32_t name='cursor_x'/>
    <int32_t name='cursor_y'/>
    <bool name='prehistory_initialized'/>
    <bool name='placed_caves'/>
    <bool name='placed_good_evil'/>
    <bool name='placed_megabeasts'/>
    <bool name='placed_other_beasts'/>
    <bool name='made_cave_pops'/>
    <bool name='made_cave_civs'/>
    <bool name='finished_prehistory'/>
    <ulong name='last_chronicle_add_time'/>
    <int32_t name='last_event_id_added'/>
</struct-type>
```

**Critical structural note**: `worldgen_status` is embedded in `world` as `compound` (NOT a pointer). It is always valid memory — no null pointer check needed.

### 4.3 Progress Bar Mapping to Internal State

| DF Progress Bar Phase | `worldgen_status.state` | Key Data Being Written |
|-----------------------|------------------------|----------------------|
| "Preparing Elevation" | 1 | `world_data.region_map` elevation grid |
| "Setting Temperature" | 2 | region_map temperature/rainfall |
| "Running Rivers" | 3 | `rivers_cur`/`rivers_total`, `world_data.rivers` |
| "Forming Lakes and Minerals" | 4 | geo_biomes, underground_regions |
| "Growing Vegetation" | 5 | region vegetation |
| "Verifying Terrain" | 6 | world may reject here |
| "Importing Wildlife" | 7 | entity_populations |
| "Recounting Legends" | 8 | **history.events/figures (bulk write, rapid growth)** |
| "Finalizing" | 9 | civ placement, site naming |
| "Done" | 10 | all vectors complete |

### 4.4 Lua Access Paths for Worldgen

```lua
-- Primary generation state
local ws = df.global.world.worldgen_status
local state = ws.state          -- int16_t: -1=None, 0-9=phases, 10=Done
local state_name = df.world_generatorst.T_state[state]

-- Progress counters
local rivers_done   = ws.rivers_cur
local rivers_total  = ws.rivers_total
local civs_placed   = ws.civ_count
local civs_left     = ws.civs_left_to_place
local rampage_count = ws.rampage_num
local last_event    = ws.last_event_id_added

-- Phase completion flags
local caves_placed       = ws.placed_caves
local good_evil_placed   = ws.placed_good_evil
local megabeasts_placed  = ws.placed_megabeasts
local prehistory_done    = ws.finished_prehistory

-- Worldgen parameters (set before generation begins)
local parms = df.global.world.worldgen.worldgen_parms
local seed           = parms.seed
local world_title    = parms.title
local dim_x          = parms.dim_x
local dim_y          = parms.dim_y
local end_year       = parms.end_year
local total_civs     = parms.total_civ_number

-- Live history accumulation
local figures  = df.global.world.history.figures
local events   = df.global.world.history.events
local eras     = df.global.world.history.eras

-- Geography (conditional - world_data may be nil early)
local wd_ok, wd = pcall(function() return df.global.world.world_data end)
if wd_ok and wd then
    local region_count = #wd.regions
    local site_count   = #wd.sites
end

-- Detection: is worldgen running?
local is_worldgen = (state >= 0 and state < 10)
local is_done     = (state == 10)
```

### 4.5 worldgen-bridge.lua Reference Implementation

Complete implementation template from worldgen-scraping research:

```lua
-- worldgen-bridge.lua — Chronicler worldgen monitor
-- Deploy: repeat --name worldgen-monitor --time 30 --timeUnits frames \
--         --command [ worldgen-bridge ]

local json = require('json')

local wg_state = {
    last_event_id = -1,
    snapshots = 0,
}

local STATE_NAMES = {
    [-1] = 'None', [0] = 'Initializing',
    [1] = 'PreparingElevation', [2] = 'SettingTemperature',
    [3] = 'RunningRivers', [4] = 'FormingLakesAndMinerals',
    [5] = 'GrowingVegetation', [6] = 'VerifyingTerrain',
    [7] = 'ImportingWildlife', [8] = 'RecountingLegends',
    [9] = 'Finalizing', [10] = 'Done',
}

local function get_worldgen_snapshot()
    local ws = df.global.world.worldgen_status
    local state_val = ws.state
    local snap = {
        timestamp = os.time(),
        state_id   = state_val,
        state_name = STATE_NAMES[state_val] or 'Unknown',
        seed        = df.global.world.worldgen.worldgen_parms.seed,
        world_title = dfhack.df2utf(df.global.world.worldgen.worldgen_parms.title),
        dim_x       = df.global.world.worldgen.worldgen_parms.dim_x,
        dim_y       = df.global.world.worldgen.worldgen_parms.dim_y,
        end_year    = df.global.world.worldgen.worldgen_parms.end_year,
        rivers_cur           = ws.rivers_cur,
        rivers_total         = ws.rivers_total,
        civ_count            = ws.civ_count,
        civs_left_to_place   = ws.civs_left_to_place,
        rampage_num          = ws.rampage_num,
        num_rejects          = ws.num_rejects,
        placed_caves       = ws.placed_caves,
        placed_good_evil   = ws.placed_good_evil,
        placed_megabeasts  = ws.placed_megabeasts,
        finished_prehistory = ws.finished_prehistory,
        figure_count  = #df.global.world.history.figures,
        event_count   = #df.global.world.history.events,
        era_count     = #df.global.world.history.eras,
        entity_count  = #df.global.world.entities.all,
        gen_entity_count = #ws.entities,
        gen_site_count   = #ws.sites,
    }
    -- Geography (conditional)
    local wd_ok, wd = pcall(function() return df.global.world.world_data end)
    if wd_ok and wd then
        snap.region_count   = #wd.regions
        snap.site_count     = #wd.sites
        snap.landmass_count = #wd.landmasses
        snap.river_count    = #wd.rivers
        snap.geo_biome_count = #wd.geo_biomes
    end
    -- New events since last poll (cursor-based, cap 50)
    local events = df.global.world.history.events
    local ev_count = #events
    local new_events = {}
    if wg_state.last_event_id >= 0 then
        local start_idx = ev_count
        for i = ev_count - 1, 0, -1 do
            if events[i].id <= wg_state.last_event_id then
                start_idx = i + 1; break
            end
        end
        local cap = math.min(ev_count, start_idx + 50)
        for i = start_idx, cap - 1 do
            table.insert(new_events, {
                id = events[i].id, type = events[i]:getType(), year = events[i].year
            })
            wg_state.last_event_id = events[i].id
        end
    else
        wg_state.last_event_id = ws.last_event_id_added
    end
    snap.new_events = new_events
    snap.snapshot_num = wg_state.snapshots
    wg_state.snapshots = wg_state.snapshots + 1
    return snap
end

-- Guard: only run when worldgen screen is active
local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
if not vs then return end

local ok, err = pcall(function()
    local snap = get_worldgen_snapshot()
    json.encode_file(snap, 'chronicler-worldgen.json')
end)
if not ok then dfhack.printerr('worldgen-bridge: ' .. tostring(err)) end
```

### 4.6 Auto-Start Hook

For fully automatic monitoring via `dfhack-config/init.lua`:

```lua
dfhack.onStateChange.worldgen_monitor = function(state)
    if state == SC_VIEWSCREEN_CHANGED then
        local vs = dfhack.gui.getViewscreenByType(df.viewscreen_new_regionst, 0)
        if vs then
            dfhack.run_command('repeat', '--name', 'worldgen-monitor',
                '--time', '30', '--timeUnits', 'frames',
                '--command', '[', 'worldgen-bridge', ']')
        else
            pcall(function()
                dfhack.run_command('repeat', '--cancel', 'worldgen-monitor')
            end)
        end
    end
end
```

### 4.7 Completion Detection

Three conditions must ALL be true for "worldgen finished":
1. `df.global.world.worldgen_status.state == 10` (Done)
2. `#df.global.world.entities.all > 0` (entities vector non-empty)
3. `viewscreen_new_regionst.simple_mode == 0` (UI in "generation complete" mode)

### 4.8 CDM Schema for Worldgen Snapshots

```sql
CREATE TABLE worldgen_snapshots (
    world_name    TEXT,
    seed          TEXT,
    state_id      INT,
    state_name    TEXT,
    snapshot_ts   BIGINT,
    figure_count  INT,
    event_count   INT,
    era_count     INT,
    civ_count     INT,
    civs_left     INT,
    rivers_cur    INT,
    rivers_total  INT,
    rampage_num   INT,
    num_rejects   INT,
    entity_count  INT,
    site_count    INT,
    landmass_count INT,
    river_count   INT,
    geo_biome_count INT,
    snapshot_num  INT
);

CREATE TABLE worldgen_params (
    seed          TEXT PRIMARY KEY,
    title         TEXT,
    dim_x         INT,
    dim_y         INT,
    end_year      INT,
    total_civ_number INT,
    megabeast_cap INT,
    semimegabeast_cap INT,
    titan_number  INT,
    demon_number  INT
);
```

### 4.9 Worldgen-Specific Data Available ONLY During Generation

| Data | During Worldgen | After Worldgen |
|------|----------------|----------------|
| `hf.worldgen_site` pointer | Non-null | **NULL** |
| `hf.worldgen_region` pointer | Non-null | **NULL** |
| `hf.worldgen_relationships` | Populated (6 quick slots) | **NULL** |
| `world_gen_wandering_group` | Exists | **Freed** |
| `histfig_flags.worldgen_acted` | Indicates HF took actions | Preserved |
| `era_determinerst` tracking | Live counts | Preserved |

### 4.10 Implementation Status

| Component | Status |
|-----------|--------|
| `worldgen-bridge.lua` script | **NOT STARTED** (complete template ready) |
| `worldgen_snapshots` CDM table | **NOT STARTED** (schema designed) |
| `worldgen_params` CDM table | **NOT STARTED** (schema designed) |
| Python-side `chronicler worldgen-watch` CLI | **NOT STARTED** |
| Auto-start hook in `dfhack-config/init.lua` | **NOT STARTED** |
| Worldgen live map preview | **NOT STARTED** (depends on `region_map` 2D grid readability) |

---

## 5. Change Detection & Events

### 5.1 Watcher Daemon Architecture

**Implementation file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` (355 lines)

The watcher is the Python-side polling daemon that:
1. Fetches JSON from the bridge HTTP endpoint (port 8888)
2. Compares current snapshot to previous snapshot
3. Detects state transitions (changes)
4. Generates events for each detected change
5. Writes events to PostgreSQL

**CLI command**: `chronicler watch`

**Status**: COMPLETE — 3+ cycles verified, graceful shutdown confirmed.

### 5.2 The 11 Event Types (Watcher + Detector Combined)

**Watcher-level events** (detected in `watcher.py`):
1. `DEATH` — unit `is_alive` flag transition
2. `MOOD_CHANGE` — mood state change
3. `STRESS_CHANGE` — stress level threshold crossing
4. `PREGNANCY` — pregnancy flag detection
5. `GHOST` — ghost flag detection
6. Additional lifecycle events

**Detector-level events** (detected in `detector.py`, 246 lines):
1. `ARRIVED` — new unit appears in fortress
2. `DIED` — unit disappears or `is_alive` flips
3. `SKILL_UP` — skill level increase
4. `PROFESSION_CHANGED` — profession changes
5. `SQUAD_CHANGED` — military assignment changes

### 5.3 Death Detection Mechanisms (4 Approaches)

1. **Flag check**: `is_alive` field transitions from true to false
2. **Absence detection**: Unit present in previous snapshot but absent from current
3. **Announcement parsing**: Death-related announcements in game reports
4. **History event matching**: `hf died` events in the history event stream

**Limitation**: Deaths go undetected when units simply disappear (e.g., fell into chasm, loyalty cascade). Absence-based detection (mechanism 2) addresses this but introduces latency.

### 5.4 Death Cause Enrichment

From myDFHackScripts, the correct pattern for getting death cause and killer:

```lua
-- In bridge Lua:
function getDeathCause(victimId)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death
           and incident.victim == victimId then
            return {
                cause = df.death_type[incident.death_cause],
                killer_id = incident.criminal
            }
        end
    end
    return nil
end
```

Cross-reference with `df.unit.find(killer_id)` to get killer name/race for narrative.

**40+ death cause variants** (from weblegends `hist_figure_died.cpp`):
```
NONE, OLD_AGE, HUNGER, THIRST, SHOT, BLEED, DROWN, SUFFOCATE,
STRUCK_DOWN, SCUTTLE, COLLISION, MAGMA, MAGMA_MIST, DRAGONFIRE,
FIRE, SCALD, CAVEIN, DRAWBRIDGE, FALLING_ROCKS, CHASM, CAGE,
MURDER, TRAP, VANISH, QUIT, ABANDON, HEAT, COLD, SPIKE,
ENCASE_LAVA, ENCASE_MAGMA, ENCASE_ICE, BEHEAD, CRUCIFY,
BURY_ALIVE, DROWN_ALT, BURN_ALIVE, FEED_TO_BEASTS, HACK_TO_PIECES,
LEAVE_OUT_IN_AIR, BOIL, MELT, CONDENSE, SOLIDIFY, INFECTION,
MEMORIALIZE, SCARE, DARKNESS, COLLAPSE, DRAIN_BLOOD, SLAUGHTER,
VEHICLE, FALLING_OBJECT, LEAPT_FROM_HEIGHT, DROWN_ALT2,
EXECUTION_GENERIC
```

### 5.5 Polling Intervals and Timing

| Component | Interval | Source |
|-----------|----------|--------|
| Lua bridge (game-side) | 100 game ticks (~2.4s) | chronicler-bridge.lua |
| Python watcher (host-side) | 10 seconds default | CLI config |
| myDFHackScripts citizen poll | 500 game ticks (~12s) | FortressStatistics.lua |
| df-ai population update | 25 game ticks (~0.6s) | population.cpp |
| df-ai stocks update | 100 game ticks (~2.4s) | stocks.cpp |
| df-ai plan update | 240 game ticks (~5.8s) | plan.cpp |

**DF timing constants**: 1 DF year = 403,200 ticks. 1 DF day = 1,200 ticks.

### 5.6 Polling Timing Risk Matrix

| Event Category | Risk of Missing |
|----------------|-----------------|
| Marriage, Strange mood, Tantrum, Mandate, Crime, Noble appointment | **HIGH** |
| Outside-world war event, Loyalty cascade | **HIGH** |
| Forgotten beast arrival, Intermediate states | **MEDIUM** |
| Death, Migration, Profession change | **LOW** (captured by watcher) |

**Mitigation**: Add `eventful` subscriptions for UNIT_DEATH, UNIT_NEW_ACTIVE, SYNDROME to catch high-risk events reactively.

### 5.7 Live Event Generation

**Design Decision #5**: Live events stored in the SAME `history_events` table with `live_generated BOOLEAN DEFAULT FALSE` and `source TEXT DEFAULT 'legends'`.

**Design Decision #8**: Event IDs for live events use a gap of 10,000+ to prevent collision with legends-imported event IDs.

Event types generated from live detection:
- Death events (from death detection)
- Profession change events (from `PROFESSION_CHANGED` detector)
- Skill milestone events (from `SKILL_UP` detector)
- Arrival events (from `ARRIVED` detector)
- Squad change events (from `SQUAD_CHANGED` detector)

### 5.8 Bridge Health Monitoring

Implemented (Design Decision #18):
- Consecutive failure counter tracks bridge HTTP fetch failures
- Warning emitted after 3 consecutive failures
- Watcher continues with core-only data (degraded mode)
- `lua_probes` cleanup runs every 10 watcher cycles (Design Decision #17)

### 5.9 Implementation Status

| Component | Status |
|-----------|--------|
| Watcher daemon (`chronicler watch`) | **COMPLETE** |
| Change detection (snapshot comparison) | **COMPLETE** |
| 11 event types | **COMPLETE** |
| Bridge health monitoring | **COMPLETE** |
| lua_probes retention policy | **COMPLETE** |
| `eventful` subscriptions | **NOT STARTED** |
| Death cause enrichment (via incidents) | **NOT STARTED** |
| Live event generation into `history_events` | **NOT STARTED** |

---

## 6. File Transfer Mechanisms

### 6.1 Three Transfer Methods

| Method | Speed | Command | When to Use |
|--------|-------|---------|-------------|
| HTTP file server | ~105 MB/s | `vm-lifecycle.sh http-serve start` (port 8889) | Bulk data, legends XML |
| SCP | ~19 MB/s | `vm-lifecycle.sh scp-pull` | Ad-hoc file retrieval |
| Guest Agent (utmctl) | ~0.24 MB/s | `utmctl file pull` | **Emergency only** (440x slower) |

### 6.2 HTTP File Server (Port 8889)

The fastest transfer method. A PowerShell HTTP listener serves files from the DF data directory:

```bash
# Start:
vm-lifecycle.sh http-serve start

# Fetch file:
curl -O http://192.168.64.3:8889/path/to/legends.xml
```

**Performance**: ~105 MB/s throughput for large files.

### 6.3 SCP Transfer

```bash
# Requires -O (legacy SCP protocol) and -T (disable strict filename check)
# OpenSSH 8.0+ defaults to SFTP mode which breaks C:/ paths
scp -O -T -i ~/.ssh/df-vm Chronicler@192.168.64.3:"C:/path/to/file" ./local/

# Via wrapper:
vm-lifecycle.sh scp-pull "C:\\path\\to\\file" ./local/
```

**Critical gotchas**:
- MUST use `-O` flag (legacy SCP protocol, not SFTP) for Windows paths
- MUST use `-T` flag (disable strict filename check) for paths with spaces/parens
- Double-backslash paths required in bash: `"C:\\\\Windows\\\\Temp\\\\file.txt"` resolves to `C:\\Windows\\Temp\\file.txt`

### 6.4 Guest Agent (utmctl)

```bash
utmctl file pull DF-Windows "C:\\path\\to\\file" ./local/
```

**Critical gotchas**:
- `utmctl exec` is fire-and-forget (no stdout relay)
- `utmctl file pull` returns exit code 0 even on failure — MUST check output content
- Use `vm-lifecycle.sh exec-capture` (simple commands) or `exec-ps` (complex PowerShell via base64) instead

---

## 7. VM Infrastructure

### 7.1 UTM VM Configuration

| Component | Detail |
|-----------|--------|
| VM identity | `DF-Windows` / `WIN-MRGFUCCV202` / `192.168.64.3` |
| OS | Windows 11 Pro ARM 64-bit (10.0.26200) |
| DF Version | 53.10 + DFHack 53.10-r1 |
| SSH user | `Chronicler` |
| SSH key | `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control) |
| SSH implementation | OpenSSH ARM64 v10.0 (MSI install — x64 build crashes under Prism during KEXINIT) |
| DF install path | `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\` |
| DFHack RPC | TCP port 5000 (broken for game-thread calls under Prism) |
| Bridge HTTP | Port 8888 (JSON game state) |
| File server HTTP | Port 8889 (~105 MB/s) |

### 7.2 HomeServer (Secondary)

| Component | Detail |
|-----------|--------|
| Host | Windows 10 Pro x86_64 at `192.168.4.194` |
| Machine name | `WIN-48L3R2QLQN0` |
| DF/DFHack | 53.10 / 53.10-r1 on x86_64 |
| DFHack RPC | TCP port 5000, firewall open |
| RFR | NOT AVAILABLE on 53.10-r1 |
| User / Pass | Nathaniel / DwarfF0rtress |

### 7.3 Development Machine

| Component | Detail |
|-----------|--------|
| DB | PostgreSQL `chronicler` on localhost:5432 |
| Web UI | `localhost:8080`, SSE streaming from Qwen3-8B via LiteLLM |
| MLX Embedding Server | `localhost:8000` — Qwen3-Embedding-4B, 2560-dim |
| Qdrant | `localhost:6333` |

### 7.4 VM Automation Scripts

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

**Existing** (Phase 0 COMPLETE):
- `vm-config.sh` — shared configuration (IP, paths, keys)
- `vm-lifecycle.sh` — 19 commands, 451 lines (start/stop/ssh/exec/scp/http-serve)
- `vm-bootstrap.sh` — 343 lines (initial VM setup)

**Planned**:
- `vm-install-df.sh` — automate DF + DFHack installation
- `vm-test-rpc.py` — RPC connectivity verification
- `vm-deploy.sh` — deploy bridge scripts to VM
- `vm-dfhack-cmd.sh` — execute DFHack commands via SSH
- `vm-service-manager.sh` — manage persistent services
- `vm-deploy-all.sh` — full deployment pipeline
- `vm-watch.sh` — bridge watcher orchestration

### 7.5 Data Transport Architecture

```
+-- macOS Host (Development) ----------------------------------------+
|                                                                      |
|  chronicler watch ----HTTP GET----> port 8888 -----> bridge JSON     |
|                                                                      |
|  chronicler ingest <--HTTP GET----- port 8889 <----- legends XML     |
|                                                                      |
|  dfhack-run --------SSH----------> DFHack Core ----> Lua execution   |
|                                                                      |
|  scp -O -T --------SSH----------> VM filesystem --> file retrieval   |
|                                                                      |
+-- UTM VM (DF-Windows) --------------------------------------------+
|                                                                      |
|  chronicler-bridge.lua (repeat job) --> chronicler-state.json        |
|  PowerShell HTTP listener (port 8889) --> file serving               |
|  OpenSSH ARM64 sshd (port 22) --> command execution                  |
|  DFHack RPC (port 5000) --> BROKEN for game-thread calls             |
|                                                                      |
+--------------------------------------------------------------------+
```

---

## 8. RAG / Vector Indexing

### 8.1 Current Qdrant Collections

| Collection | Points | Dimensions | Content |
|-----------|--------|-----------|---------|
| dfhack | 8,476 | 2560 | DFHack documentation and source |
| dwarf-therapist | 926 | 2560 | Dwarf Therapist source/docs |
| df-wiki | 4 | 2560 | Dwarf Fortress wiki (very sparse) |

### 8.2 Embedding Model

- **Model**: Qwen3-Embedding-4B
- **Runtime**: MLX (was Ollama, migrated for 5-15x throughput)
- **Server**: `infrastructure/qwen3-embeddings-mlx/start-server.sh` → `localhost:8000/embed`
- **Dimensions**: 2560
- **OpenAI-compat endpoint**: `localhost:8000/v1/embeddings` (added for Graphiti integration)

### 8.3 Target RAG Collections

| Collection | Estimated Points | Source |
|-----------|-----------------|--------|
| dfhack | ~8,700 | DFHack docs + scripts |
| dwarf-therapist | 926 | Source code + memory layouts |
| df-ai | ~1,500-2,000 | C++ AI logic documentation |
| weblegends | ~3,000-4,000 | Event rendering + entity types |
| df-structures | ~2,000-3,000 | Memory layout XML definitions |
| df-narrator | ~300-500 | Scoring formulas + narrative |
| dfhack-client-python | ~100-200 | RPC protocol reference |
| df-wiki | ~5,000-8,000 | Selective wiki crawl (~500-800 pages from 43,621 total) |

**Total target**: ~21,000-27,000 points

### 8.4 Wiki Crawl Strategy

**Design Decision #24**: Selective wiki crawl — ~500-800 pages from 43,621 total wiki pages. Priority categories:
- Game mechanics relevant to data extraction
- DFHack scripting reference
- Creature/entity type definitions
- Event type documentation
- Map/geography reference

### 8.5 pgvector Tables (CDM-Integrated)

```sql
-- Figure biography embeddings
figure_embeddings  -- biography chunks -> 2560-dim vectors

-- Event narrative embeddings
event_embeddings   -- event narratives -> 2560-dim vectors

-- Artifact history embeddings
artifact_embeddings -- artifact chain-of-custody narratives

-- Site history embeddings
site_embeddings    -- site histories
```

**Embedding generation**: Assembled from CDM data, not raw XML. Biography chunks are assembled from HF records + event history + relationship data.

---

## 9. Existing Implementation Status Summary

### 9.1 Built and Working

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| XML Parser | `chronicler/ingest/xml_parser.py` | 733 | COMPLETE |
| Lua Bridge (v6) | `chronicler/dfhack/scripts/chronicler-bridge.lua` | 922 | COMPLETE |
| Python Bridge Accessor | `chronicler/dfhack/bridge.py` | 308 (24 accessors) | COMPLETE |
| Watcher Daemon | `chronicler/dfhack/watcher.py` | 355 | COMPLETE |
| Change Detector | `chronicler/dfhack/detector.py` | 246 | COMPLETE |
| DB Schema | `chronicler/db/schema.sql` | 378 | COMPLETE |
| Storyteller Context | `chronicler/storyteller/context.py` | 723 | COMPLETE |
| Config | `chronicler/config.py` | - | COMPLETE |
| CLI | `chronicler/cli.py` | - | COMPLETE |
| DFHack Client (RPC) | `chronicler/dfhack/client.py` | - | COMPLETE (but transport broken) |
| Probe System | `chronicler/dfhack/probe.py` | - | COMPLETE |
| DFHack Reports | `chronicler/dfhack/reports.py` | - | COMPLETE |
| Sync Module | `chronicler/dfhack/sync.py` | - | COMPLETE |
| Export Script | `chronicler/dfhack/scripts/chronicler-export.lua` | - | COMPLETE |
| Protobuf Bindings | `chronicler/dfhack/proto/*.py` | 7 files | COMPLETE |
| Test Suite | 4 test files | 131 tests | COMPLETE (0.19s) |
| VM Scripts | `projects/chronicler/scripts/vm-*.sh` | ~800+ lines | COMPLETE |

### 9.2 Partially Built

| Component | Status | Gap |
|-----------|--------|-----|
| Post-parse processing | Kill counts fixed, dedup done | Remaining 7 pipeline steps |
| RAG indexing | 3 collections, sparse | Target: 21K-27K points |
| HF field extraction | Core fields only | Sub-profiles unextracted |
| Event type handling | All types stored | No per-type narrative templates |

### 9.3 Not Started

| Component | Design Status | Implementation Status |
|-----------|--------------|----------------------|
| `worldgen-bridge.lua` | Template ready | NOT STARTED |
| `worldgen_snapshots` table | Schema designed | NOT STARTED |
| `eventful` subscriptions | Requirements defined | NOT STARTED |
| Death cause enrichment | Algorithm documented | NOT STARTED |
| Live event generation | Design decisions made | NOT STARTED |
| Importance scoring | Formulas ready (df-narrator) | NOT STARTED |
| Monitoring system | ~230 LOC estimated | NOT STARTED |
| Adventure mode capture | Conceptual only | NOT STARTED |

---

## 10. Open Questions & Design Decisions

### 10.1 Resolved Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 3 | `dfhack-run` over SSH as primary transport | TCP RPC broken under Prism |
| 5 | Live events in same `history_events` table | `live_generated` + `source` columns distinguish |
| 8 | Event ID gap of 10,000+ | Anti-collision between legends and live |
| 17 | `lua_probes` retention every 10 cycles | Balance storage vs. performance |
| 18 | Bridge health monitoring with degradation | Continue after 3 failures |
| 19 | Written contents dual-source parsing | legends.xml + legends_plus.xml |
| 21 | Lua Bridge as primary data path | No RFR dependency |
| 25 | Event type storage as TEXT, data in JSONB | Flexible, no migration on new types |

### 10.2 Unresolved Design Decisions

1. **lua_probes time-series vs. UPSERT** — Should probes accumulate historical data or overwrite?
2. **Multi-participant events: JSONB array vs. junction table** — Events with 10+ participants currently truncate to 2 HF IDs (BUG-002)
3. **DFHack TCP RPC vs. dfhack-run SSH as PERMANENT transport** — TCP RPC may work on HomeServer (x86, no Prism)
4. **`worldgen_status.entities` vs `world.entities.all`** — Are these the same objects at completion or copied?
5. **`world_data` pointer nullability during early phases** — When exactly does this become non-null?
6. **Thread safety during RecountingLegends (state 8)** — High-speed writes to history vectors; CoreSuspend may have edge cases
7. **Frontend framework for worldgen dashboard** — Same as explorer (Jinja2) or separate SvelteKit app?
8. **Adventure mode data access patterns** — Unknown; requires empirical testing with adventure mode active
9. **Map generation approach** — DF-exported BMP vs. programmatic from `region_map` 2D grid
10. **`region_map` 2D grid readability during PreparingElevation** — Needs empirical testing

### 10.3 Verification Needed

| Assumption | Verification Method |
|------------|---------------------|
| `xml_parser.py` handles control characters | Check for FilteredStream-equivalent |
| IBM CP473 encoding handled | Verify or add conversion |
| TCP RPC broken ONLY under Prism, or all 53.x | Test on HomeServer (x86) |
| `world_data.region_map` accessible during PreparingElevation | Empirical test on live worldgen |
| `unit.relationship_ids.Mother/Father` availability | Verify on DFHack 53.10-r1 |
| `df.global.world.incidents.all` accessible | Test on DFHack 53.10-r1 |

### 10.4 Data Capture Gaps

- No position/noble tracking in live bridge
- No HF link tracking in live bridge
- `world.activities`, `world.written_contents.all`, `world.jobs.list` not captured
- Individual building footprints, corpse spatial data not captured
- Full personality memories/preferences vectors not captured
- Loyalty cascade causality may be lost during polling gaps
- All HF sub-profile fields remain unextracted from Legends XML
- 11 event types defined in df-structures but unhandled by any tool
- Adventure mode and worldgen data capture entirely unimplemented

### 10.5 Key File Paths

| Component | Path |
|-----------|------|
| Lua bridge | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| Lua export | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-export.lua` |
| XML parser | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| Watcher | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change detector | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Bridge accessor | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| DFHack client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py` |
| Sync module | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py` |
| Probe system | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/probe.py` |
| Reports | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/reports.py` |
| DB schema | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| CLI | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py` |
| VM scripts | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh` |
| Protobuf defs | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/proto/*.py` |
| Product code root | `/Users/nathanielcannon/Claude/Projects/DwarfCron/` |
| Dev artifacts | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/` |
| Reference repos | `/Users/nathanielcannon/Claude/GitRepos/` |
| df-structures | `/Users/nathanielcannon/Claude/GitRepos/df-structures/` |
| myDFHackScripts | `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/` |
| DwarvenSurveyor | `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/` |

---

## Appendix A: Complete `df.global.world.*` Data Access Reference

From df-structures + myDFHackScripts + df-ai, the complete set of game data paths:

```lua
-- Units
df.global.world.units.active              -- alive, in fortress area
df.global.world.units.all                 -- all including historical

-- Items
df.global.world.items.all                 -- all items (LARGE vector)
df.global.world.items.other[idx]          -- typed item sublists

-- History
df.global.world.history.figures           -- all historical figures
df.global.world.history.events            -- all history events
df.global.world.history.events_death      -- death events specifically
df.global.world.history.eras              -- era definitions
df.global.world.history.event_collections -- all + 18 typed subcategories
df.global.world.history.live_megabeasts
df.global.world.history.live_semimegabeasts
df.global.world.history.hf_teachers       -- indexed by goal_type (11=necromancers)

-- Geography
df.global.world.world_data.regions
df.global.world.world_data.underground_regions
df.global.world.world_data.sites
df.global.world.world_data.rivers
df.global.world.world_data.landmasses
df.global.world.world_data.mountain_peaks
df.global.world.world_data.geo_biomes
df.global.world.world_data.region_map     -- 2D elevation/rainfall/temperature grid

-- Entities
df.global.world.entities.all              -- all civilizations/groups

-- Artifacts
df.global.world.artifacts.all

-- Status/Reports
df.global.world.status.reports            -- announcement/report log

-- Legal/Social
df.global.world.incidents.all             -- crime/death incidents
df.global.world.agreements.all            -- petitions/agreements
df.global.world.crimes.all               -- crime records

-- Worldgen
df.global.world.worldgen_status           -- generation state machine
df.global.world.worldgen.worldgen_parms   -- generation parameters

-- Fortress
df.global.plotinfo.main.fortress_site     -- current fortress site
df.global.plotinfo.main.fortress_entity   -- controlling entity
df.global.world.manager_orders            -- manager order queue
df.global.world.jobs.list                 -- active job list
```

## Appendix B: df-narrator Event Classification Sets

```python
COMBAT_EVENTS = {
    "attacked site", "hf attacked site", "field battle", "squad vs squad",
    "hf destroyed site", "plundered site", "site taken over", "razed structure",
    "hf simple battle event", "tactical situation", "site dispute", "reclaim site",
}

COLLECTION_WAR_TYPES = {"war", "battle", "siege", "attack", "raid", "insurrection"}

ARTIFACT_EVENT_TYPES = {
    "artifact created", "artifact given", "artifact lost", "artifact possessed",
    "artifact stored", "item stolen", "artifact claim formed", "masterpiece item",
}
```

## Appendix C: DF Calendar Utility

```python
def seconds72_to_date(seconds72):
    """Convert DF seconds72 to calendar date."""
    day_of_year = seconds72 // 1200 + 1
    month = min((day_of_year - 1) // 28 + 1, 12)
    day = (day_of_year - 1) % 28 + 1
    return month, day

MONTHS = [
    "Granite", "Slate", "Felsite",       # Spring
    "Hematite", "Malachite", "Galena",   # Summer
    "Limestone", "Sandstone", "Timber",  # Autumn
    "Moonstone", "Opal", "Obsidian"      # Winter
]

SEASONS = [
    "early spring", "mid spring", "late spring",
    "early summer", "mid summer", "late summer",
    "early autumn", "mid autumn", "late autumn",
    "early winter", "mid winter", "late winter"
]

def format_date(year, seconds72):
    """Format DF date as 'the Nth of Month, year N'."""
    month, day = seconds72_to_date(seconds72)
    return f"the {day}th of {MONTHS[month-1]}, year {year}"

def format_season(year, seconds72):
    """Format DF date as 'early spring of 125'."""
    month, _ = seconds72_to_date(seconds72)
    return f"{SEASONS[month-1]} of {year}"
```

---

*Component Research Document — Data ETL Systems. Extracted from 8 source documents with EVERY pipeline detail, code pattern, and architecture decision preserved. 2026-02-25.*
