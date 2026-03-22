# Dwarf Fortress Live Data Systems Reference

**Purpose**: Comprehensive mapping of all DF information systems accessible via DFHack to
Chronicler CDM tables. Verified on live fortress Girderpriced/Silveryclasps, Y251.

**Bridge version**: v9 (33 data sections, 4.6 MB JSON state file)
**DFHack version**: 53.11-r2
**DF version**: 53.11

---

## Table of Contents

1. [Data Source Summary](#1-data-source-summary)
2. [Announcements & Reports](#2-announcements--reports)
3. [Popups (Modal Dialogs)](#3-popups-modal-dialogs)
4. [History Events](#4-history-events)
5. [Event Collections](#5-event-collections)
6. [Incidents](#6-incidents)
7. [Daily Events](#7-daily-events)
8. [Reactive Events (Eventful)](#8-reactive-events-eventful)
9. [Units & Population](#9-units--population)
10. [Emotions & Personality](#10-emotions--personality)
11. [Skills & Professions](#11-skills--professions)
12. [Buildings & Workshops](#12-buildings--workshops)
13. [Zones](#13-zones)
14. [Items](#14-items)
15. [Military & Squads](#15-military--squads)
16. [Noble Positions](#16-noble-positions)
17. [Armies (World Movement)](#17-armies-world-movement)
18. [Diplomacy](#18-diplomacy)
19. [Event Collections (Active)](#19-event-collections-active)
20. [Artifacts](#20-artifacts)
21. [Belief Systems](#21-belief-systems)
22. [Occupations](#22-occupations)
23. [Interaction Instances](#23-interaction-instances)
24. [Mandates](#24-mandates)
25. [Gamelog](#25-gamelog)
26. [Fortress State](#26-fortress-state)
27. [CDM Mapping Matrix](#27-cdm-mapping-matrix)
28. [Popup Handling Strategy](#28-popup-handling-strategy)

---

## 1. Data Source Summary

| Source | Access Method | Records | Update Freq | CDM Relevance |
|--------|--------------|---------|-------------|---------------|
| Announcements | `world.status.announcements` | 1,450+ | Per-event | HIGH — player-facing events |
| Reports | `world.status.reports` | 1,700+ | Per-event | HIGH — combat/dialog detail |
| Popups | `world.status.popups` | 0-5 | On trigger | MEDIUM — succession/alerts |
| History Events | `world.history.events` | 490,000+ | Continuous | HIGH — canonical event log |
| Event Collections | `world.history.event_collections` | 36,000+ | Continuous | HIGH — grouped events |
| Incidents | `world.incidents.all` | 78+ | Per-incident | HIGH — crime/conflict |
| Daily Events | Bridge section | Per-day | Daily | HIGH — births/deaths/marriages |
| Reactive Events | Eventful callbacks | Variable | Immediate | CRITICAL — real-time triggers |
| Units | `world.units.active/all` | 185-228 | Continuous | CRITICAL — population |
| Emotions | `unit.personality.emotions` | Per-citizen | Continuous | MEDIUM — narrative flavor |
| Personality | `unit.personality.facets/beliefs` | Per-citizen | Static | LOW — character profiles |
| Buildings | `world.buildings.all` | 21+ | On construct | MEDIUM — fortress layout |
| Zones | `building_civzonest` | 2+ | On designate | LOW — activity areas |
| Items | `world.items.all` | 4,000+ | Continuous | LOW — wealth/inventory |
| Military | `world.squads.all` | 341 (world) | On change | MEDIUM — squad composition |
| Noble Positions | `plotinfo.fortress_entity` | 5 | On appointment | MEDIUM — governance |
| Armies | Bridge `armies` | 2,311 | Continuous | HIGH — world movement |
| Diplomacy | Bridge `diplomacy` | Variable | On contact | MEDIUM — civ relations |
| Artifacts | Bridge `artifacts` | 10,526 | On creation | MEDIUM — named items |
| Belief Systems | Bridge `belief_systems` | 1,523 | Static | LOW — cultural data |
| Occupations | Bridge `occupations` | Many | On assignment | LOW — tavern/temple roles |
| Interactions | Bridge `interaction_instances` | Many | On cast | LOW — magic/curses |
| Mandates | Bridge `mandates` | 0+ | On decree | LOW — noble demands |
| Gamelog | `gamelog.txt` | All | On event | MEDIUM — text backup |
| Fortress State | Bridge `fortress_state` | 1 | Per-poll | HIGH — aggregate stats |

---

## 2. Announcements & Reports

### Announcements (`world.status.announcements`)

**Access**: `df.global.world.status.announcements[i]`

**Fields**:
- `id` — unique sequential ID
- `year`, `time` — game timestamp
- `text` — human-readable announcement text (CP437 encoded, needs `df2utf`)
- `type` — announcement_type enum (see type table below)
- `color`, `bright` — display formatting
- `pos.x/y/z` — map location (if applicable)
- `flags` — bitfield (version-dependent field names)

**Volume**: 1,450 announcements in ~1.5 game years

### Reports (`world.status.reports`)

**Access**: `df.global.world.status.reports[i]`

**Fields**: Same as announcements plus:
- `duration` — display duration
- `flags.continuation` — whether this continues a previous report
- `flags.announcement` — whether this was also an announcement

**Volume**: 1,703 reports in ~1.5 game years

### Report Type Decode (VERIFIED — 72+ types found)

| Type | Name | Count | CDM Table |
|------|------|-------|-----------|
| 38 | COMBAT | 972 | combat_logs |
| 177 | DIALOG | 123 | announcements |
| 104 | CANCEL | 103 | job_events |
| 39 | COMBAT_WOUND | 60 | combat_logs |
| 11 | COMBAT_DODGE | 33 | combat_logs |
| 118 | CRIME | 23 | incidents |
| 12 | COMBAT_MISS | 23 | combat_logs |
| 106 | MISSING | 21 | unit_events |
| 149 | SIEGE | 21 | invasions |
| 8 | UNIT_MOOD | 21 | unit_events |
| 16 | UNIT_TITLE | 20 | unit_events |
| 132 | ANIMAL | 18 | unit_events |
| 15 | MASTERWORK | 18 | item_events |
| 111 | RUMOR | 16 | world_events |
| 43 | DEATH | 16 | unit_events |
| 150 | UNDEAD | 1 | unit_events |
| 178 | NOBLE_SUCCESSION | 5 | governance |
| 4 | STRUCK_DOWN | 4 | combat_logs |
| 40 | ENRAGED | 4 | unit_events |
| 45 | CARAVAN | 3 | trade_events |

**Note**: 50+ additional types exist (6, 17-22, 26, 30, 32-36, 41, 46-48, 59, 67, 69, 72,
80, 84, 96, 107, 115-117, 123-127, 139, 148, 151, 182, 236, 239, 243, 245-247,
278, 292-300, 341-343, 348) that need further investigation to map to names.

---

## 3. Popups (Modal Dialogs)

### Access

```lua
df.global.world.status.popups           -- the popup list
df.global.world.status.popups[i].text   -- popup text
df.global.world.status.popups[i].color  -- display color
df.global.world.status.popups[i].bright -- bright flag
df.global.world.status.popups[i].portrait_hfid  -- associated HF ID (-1 if none)
```

### Key Discovery

Popups are **distinct from announcements**. They are modal dialogs that overlay the game
screen and effectively pause gameplay until dismissed by the player. However, `pause_state`
does NOT change when a popup is shown — the popup captures input rather than setting the
pause flag.

### Popup Dismissal (Programmatic)

```lua
-- Clear all popups
df.global.world.status.popups:resize(0)
```

This immediately removes all popup dialogs. The game resumes normal operation.

### Common Popup Triggers

- Noble/position succession ("X has assumed the position of...")
- Seasonal autosave
- Megabeast arrival
- Artifact creation mood completion
- Strange mood failure

### CDM Mapping

Popups should be captured as a special announcement type with `is_popup=true` flag,
since they represent the most important events that the game itself deems worthy of
interrupting the player.

---

## 4. History Events

### Access

```lua
df.global.world.history.events[i]
-- .id, .year, .seconds72 (tick), :getType()
```

### Volume

- **Total**: 490,073 events (250 years of worldgen + 1.5 years fortress)
- **Since embark (Y250+)**: 19,205 events

### Fortress-Era Event Types (Y250+)

| Type | Count | Likely Meaning |
|------|-------|----------------|
| 44 | 13,276 | Change HF state (death, mood, etc) |
| 34 | 1,791 | Creature devoured |
| 4 | 1,354 | HF died |
| 3 | 559 | HF simple battle event |
| 109 | 517 | Agreement formed/broken |
| 27 | 305 | Item stolen |
| 108 | 298 | Tactical situation |
| 0 | 143 | Civ founded |
| 32 | 119 | Field battle |
| 99 | 112 | Entity rampages |
| 53 | 110 | Change HF job |
| 63 | 100 | Written content created |
| 85 | 88 | HF relationship change |
| 74 | 78 | HF gains skill |
| 101 | 73 | HF learning |
| 45 | 67 | Artifact created |
| 23 | 51 | HF body state change |
| 19 | 50 | Peace/diplomacy |
| 75 | 28 | HF recruited unit type |
| 5 | 15 | HF attacked site |
| 95 | 15 | Site dispute |

### CDM Mapping

Maps to `history_events` table. The `type` enum maps to `event_type` column.
Delta detection (bridge `history.cursor`) enables incremental ingestion.

---

## 5. Event Collections

### Access

Bridge `event_collections` section or `df.global.world.history.event_collections`

### Fields

- `id`, `name`, `type`, `start_year`, `end_year`
- `event_count`, `child_collection_count`
- `site_id`, `attacker_civ`, `defender_civ`, `attacker_name`, `defender_name` (for wars)

### Volume

**36,418** event collections total

### Types Observed

| Type | Name | Example |
|------|------|---------|
| 0 | War | "Ashro Zurko" — attacker_civ vs defender_civ |
| 1 | Battle | "Unâmkök" at site X |
| 15 | Unknown | (may be duel or persecution) |

### CDM Mapping

Maps to `history_event_collections` table. Parent/child relationships enable
hierarchical grouping (War → Battles → Individual Events).

---

## 6. Incidents

### Access

`df.global.world.incidents.all` or bridge `incidents` section

### Fields

- `id`, `type`, `event_year`, `event_time`, `site`
- `victim` (unit ID), `criminal` (unit ID)
- `death_cause` — death_type enum value
- `announced_missing`, `discovered`, `stale`
- `conflict_level`

### Volume

78 incidents total, 50 shown in bridge (capped)

### Types Observed

| Type | Count | Meaning |
|------|-------|---------|
| 0 | 78 | Violence/assault |

### CDM Mapping

Incidents are DISTINCT from history events. They track:
- Who attacked whom (criminal → victim)
- Death cause (using the same death_type enum as unit.counters.death_cause)
- Discovery state (for crime investigation mechanics)

Maps to a new `incidents` CDM table (not yet in schema).

---

## 7. Daily Events

### Access

Bridge `daily_events` section (bridge computes this from scanning units each poll)

### Fields

- `day_index` — current DF day number
- `births` — list of unit IDs born today
- `deaths` — dict of day → [unit IDs]
- `marriages_1` / `marriages_2` — paired marriage partners by day
- `pregnancies` — list of unit IDs
- `grown_up` — dict of day → [unit IDs]

### Example Data (Y251)

```json
{
  "deaths": {"274": [15251], "279": [16513], "285": [1674], "289": [9925]},
  "grown_up": {"286": [11493]},
  "marriages_1": {"270": [10374, 14448, 13577], "272": [8659, 13973, 19327], ...}
}
```

**18 marriages** in a single season across the world!
**4 deaths** during the observation period.
**1 coming-of-age** event.

### CDM Mapping

This is a GOLDMINE for the narrative engine. Maps to:
- `unit_events` (births, deaths, coming-of-age)
- `relationships` (marriages)
- Daily event summaries for timeline views

---

## 8. Reactive Events (Eventful)

### Access

Bridge `reactive_events` section — populated via DFHack eventful plugin callbacks

### Fields

- `unit_deaths` — units that died since last poll
- `items_created` — new items crafted
- `jobs_completed` — finished workshop/task jobs
- `invasions` — siege/raid events
- `syndromes` — curses/diseases applied
- `new_units` — new units appeared (births, migrants)
- `total_count` — sum of all reactive events

### CDM Mapping

These are the MOST IMPORTANT for live monitoring. They provide immediate notification
of game-changing events without polling. Maps to all CDM event tables plus triggers
for the Knowledge Horizon system.

**Current state**: 0 reactive events (may need eventful configuration per event type).

---

## 9. Units & Population

### Access

```lua
df.global.world.units.active    -- units on the map (185)
df.global.world.units.all       -- all known units (228)
```

### Unit Classification Matrix (VERIFIED)

| State | isAlive | isDead | isUndead | isCitizen | isFortControlled |
|-------|---------|--------|----------|-----------|------------------|
| Living citizen | true | false | false | true | true |
| Living visitor | true | false | false | false | false |
| Living merchant | true | false | false | false | true |
| Off-site dwarf | true | false | false | false | false |
| Dead citizen | false | true | false | N/A | true |
| Zombie (raised) | false | false | true | false | varies |
| Ghost | false | true | true | N/A | false |
| Dead+undead body | false | true | true | N/A | false |

### Key Finding: isCitizen ≠ "our dwarf"

`dfhack.units.isCitizen()` returns true ONLY for full fortress citizens.
Merchants, visitors, off-site members, and children (in some cases) do NOT count.

For Chronicler: use `isAlive AND race=DWARF AND (isCitizen OR isFortControlled)` to
capture all dwarves the player cares about.

### Fortress Population (Girderpriced, Y251)

| Name | Profession | Status | Notes |
|------|-----------|--------|-------|
| Dastot | Doctor | ALIVE, Citizen | Expedition leader, necromancer |
| Alath | Farmer | ALIVE, Citizen | |
| Domas | Merchant | ALIVE, Fort-controlled | Visiting merchant |
| Athel | Merchant | ALIVE, Fort-controlled | Visiting merchant |
| Inod | Brewer | ALIVE, Off-site | Not fort-controlled |
| Imush | Animal Caretaker | ALIVE, Off-site | Not fort-controlled |
| Cerol | Miner | UNDEAD | Former expedition leader |
| Etur | Clothier | UNDEAD | Raised by necromancer |
| Sakzul | Gem Cutter | UNDEAD | Raised by necromancer |
| Zulban | Clothier | UNDEAD | Raised by necromancer |
| Melbil | Stonecrafter | GHOST | Haunting |
| Minkot | Mason | GHOST | Haunting, attacking the living |

### CDM Mapping

Maps to `units` table with live state columns:
- `is_alive`, `is_dead`, `is_undead`, `is_ghost`, `is_citizen`
- Need to ADD: `is_fort_controlled`, `current_profession`

---

## 10. Emotions & Personality

### Emotions

```lua
unit.status.current_soul.personality.emotions[i]
-- .type, .thought, .subthought, .strength, .severity, .year, .year_tick
```

**Emotion types**: -1 (general) through 135+ (specific emotions like grief, satisfaction)
**Thought types**: 2 (general), 4 (about another unit), 240 (eating/drinking), etc.

### Personality Facets

```lua
unit.status.current_soul.personality.traits[i]  -- 50 personality facets
unit.status.current_soul.personality.beliefs[i] -- cultural beliefs
```

### CDM Mapping

- Emotions → `unit_emotions` table (time-series, great for narrative)
- Personality → `unit_personality` table (relatively static)
- Both available via bridge `dwarf_emotions` and `dwarf_personality` sections

---

## 11. Skills & Professions

### Access

Via bridge `dwarf_skills` section or:
```lua
unit.status.current_soul.skills[i]
-- .id (skill_type enum), .experience, .rating
```

### Skill Changes

Bridge `skill_changes` tracks delta between polls — when a dwarf gains XP or levels up.

### CDM Mapping

- `unit_skills` table (snapshot)
- `skill_change_events` (delta log for progression tracking)

---

## 12. Buildings & Workshops

### Access

```lua
df.global.world.buildings.all[i]
-- :getType(), .id, .x1/.y1/.x2/.y2/.z
```

### Types Found (21 buildings total)

Available via bridge `buildings.by_type` section.

Building types use numeric enum:
- Workshops (Craftsdwarf's, Still, etc.)
- Furnaces
- Stockpiles (via `building_stockpilest:is_instance`)
- Farm plots
- Constructed (walls, floors, stairs)

### CDM Mapping

Maps to `buildings` table. Stockpiles map to `stockpiles` table with
tile area calculations.

---

## 13. Zones

### Access

```lua
-- Zones are buildings of type building_civzonest
df.building_civzonest:is_instance(bld)
-- .type (zone_type enum), .x1/.y1/.x2/.y2/.z, .assigned_unit_count
```

### Types Found

| Type | Count | Likely Meaning |
|------|-------|---------------|
| 87 | 1 | Meeting hall / tavern |
| 91 | 1 | Gathering zone |

### CDM Mapping

Maps to `zones` table — not critical for narrative but useful for fortress layout.

---

## 14. Items

### Access

```lua
df.global.world.items.all[i]
-- :getType() returns item_type enum
```

### Volume

4,000+ items (varies with fortress activity)

### CDM Mapping

Items are generally too numerous for individual tracking. Track via:
- Aggregate counts by type (wealth calculation)
- Named/artifact items only (via `artifacts` section)
- Items involved in events (masterwork creation, theft)

---

## 15. Military & Squads

### Access

```lua
-- All world squads:
df.global.world.squads.all  -- 341 squads (world-wide!)
-- Fortress only:
filter by sq.entity_id == df.global.plotinfo.group_id
```

### CDM Mapping

Maps to `squads` and `squad_members` tables.
Filter: `entity_id = fortress_entity_id` for fortress squads only.

---

## 16. Noble Positions

### Access

Bridge `noble_positions.fortress_entity` section.

### Fields

- `assignments[i].position_id` — position type
- `assignments[i].histfig_id` — occupant historical figure ID
- `assignments[i].squad_id` — associated military squad (-1 if none)

### Current State (5 positions filled)

| Position ID | HF ID | Likely Role |
|-------------|-------|-------------|
| 13 | 49610 | (unknown position) |
| 12 | 49609 | (unknown position) |
| 11 | 49608 | (unknown position) |
| 10 | 49613 | Chief Medical Dwarf / Manager |
| 8 | 4489 | Expedition Leader (Dastot) |

### CDM Mapping

Maps to `noble_positions` table. Track succession events for narrative.

---

## 17. Armies (World Movement)

### Access

Bridge `armies` section.

### Fields

- `id`, `controller_id` (civ), `member_count`, `squad_count`
- `pos_x`, `pos_y` — world map coordinates

### Volume

**2,311 armies** currently active across the world!

### CDM Mapping

Maps to a new `armies` table — essential for:
- Invasion early warning (armies approaching fortress)
- World map visualization
- War tracking
- Migration patterns

---

## 18. Diplomacy

### Access

Bridge `diplomacy` section.

### Fields

- `civ_id` — player's civilization
- `civ_name` — civilization name
- `relations` — list of diplomatic relationships
- `relation_count` — number of known civ relationships

### CDM Mapping

Maps to `diplomatic_relations` table.

---

## 19. Event Collections (Active)

### Access

Bridge `event_collections` section (limited to 50 most recent).

### Fields

- `id`, `name`, `type`, `start_year`, `end_year`
- `event_count`, `child_collection_count`
- For wars: `attacker_civ`, `defender_civ`, `attacker_name`, `defender_name`

### Types

| Type | Meaning |
|------|---------|
| 0 | War |
| 1 | Battle |
| 15 | Unknown (duel/persecution?) |

### CDM Mapping

Maps to `history_event_collections` table (already in CDM from Phase 1 XML ingestion).
Live bridge data supplements the XML-based historical data with current events.

---

## 20. Artifacts

### Access

Bridge `artifacts` section.

### Volume

**10,526 total** artifacts, **200 named** (bridge shows named only).

### CDM Mapping

Maps to `artifacts` table (already in CDM).

---

## 21. Belief Systems

### Access

Bridge `belief_systems` section.

### Fields

- `id`, `deities` (list of HF IDs), `worship_levels`
- `cultural_values` — 64-element array of value weights

### Volume

**1,523 belief systems** across the world.

### CDM Mapping

Maps to a potential `belief_systems` table. Cultural values provide deep context for
narrative — why civilizations behave the way they do.

---

## 22. Occupations

### Access

Bridge `occupations` section.

### Fields

- `id`, `hf_id`, `unit_id`, `site_id`, `entity_id`
- `location_id` — the location (tavern/temple/library) they work at
- `occupation_type` — role type enum

### CDM Mapping

Maps to `occupations` table — tracks who works where (performers, scholars, priests).

---

## 23. Interaction Instances

### Access

Bridge `interaction_instances` section.

### Fields

- `id`, `interaction_type` (numeric)
- `affected_units` — list of unit IDs affected

### CDM Mapping

Tracks magical interactions (necromancy, curses, werebeast infections).
Maps to `interaction_instances` table.

---

## 24. Mandates

### Access

Bridge `mandates` section.

### Fields

Standard mandate structure (item type, item subtype, noble issuer, deadline).

### CDM Mapping

Maps to `mandates` table — noble demands for item production/export bans.

---

## 25. Gamelog

### Access

```lua
io.open('gamelog.txt', 'r')  -- direct file read from DF directory
```

### Content

Human-readable text of major game events. Subset of announcements/reports.
Written automatically by DF — no DFHack needed.

### CDM Mapping

Gamelog serves as a TEXT BACKUP of announcements. For Chronicler, we should
prefer the structured announcement/report data, but gamelog provides a fallback
and is useful for text search.

---

## 26. Fortress State

### Access

Bridge `fortress_state` section.

### Fields

| Field | Value | Description |
|-------|-------|-------------|
| fortress_age | 71,114 | Game ticks since embark |
| fortress_rank | 0 | Settlement rank (hamlet/town/city) |
| invasion_count | 1 | Total invasions survived |
| population | 1 | Current population (bridge counts) |
| site_id | 2212 | Fortress site ID |
| king_arrived | false | Has the king arrived |
| wealth_architecture | 33 | Architecture wealth |
| wealth_displayed | 18 | Displayed wealth |
| wealth_exported | 0 | Export value |
| wealth_imported | 17,439 | Import value |
| wealth_total | 1,929 | Total created wealth |
| infiltrators | [] | Hidden infiltrators |

### CDM Mapping

Maps to `fortress_snapshots` table — periodic snapshots of aggregate fortress stats.

---

## 27. CDM Mapping Matrix

### Existing CDM Tables (Phase 1-2)

| CDM Table | Live Data Source | Status |
|-----------|-----------------|--------|
| `history_events` | `world.history.events` | Bridge cursor-based delta |
| `history_event_collections` | `world.history.event_collections` | Bridge section |
| `historical_figures` | `world.units.all` (hf link) | Via `hist_figure_id` |
| `units` | `world.units.active/all` | Direct mapping |
| `sites` | N/A (static from XML) | No live changes |
| `entities` | Bridge `entities` | Delta possible |
| `artifacts` | Bridge `artifacts` | Named artifacts |
| `regions` | N/A (static) | No live changes |

### New CDM Tables Needed (Phase 3)

| Proposed Table | Data Source | Priority |
|----------------|------------|----------|
| `announcements` | `world.status.announcements` | P0 — critical |
| `combat_logs` | Reports type 38/39/11/12 | P0 — critical |
| `incidents` | `world.incidents.all` | P1 — high |
| `fortress_snapshots` | Bridge `fortress_state` | P1 — high |
| `armies` | Bridge `armies` | P2 — medium |
| `unit_emotions` | Bridge `dwarf_emotions` | P2 — medium |
| `unit_personality` | Bridge `dwarf_personality` | P3 — low |
| `skill_changes` | Bridge `skill_changes` | P3 — low |
| `belief_systems` | Bridge `belief_systems` | P4 — narrative only |
| `occupations` | Bridge `occupations` | P4 — narrative only |
| `mandates` | Bridge `mandates` | P4 — narrative only |

---

## 28. Popup Handling Strategy

### Problem

DF generates popup dialogs for major events (succession, artifact creation, megabeast
arrival). These popups:
1. Overlay the game screen
2. Block player input (effectively pausing)
3. Do NOT set `df.global.pause_state = true`
4. Remain until explicitly dismissed

### Detection

```lua
-- Check for pending popups
local popup_count = #df.global.world.status.popups
if popup_count > 0 then
    for i = 0, popup_count - 1 do
        local p = df.global.world.status.popups[i]
        -- p.text, p.color, p.bright, p.portrait_hfid
    end
end
```

### Dismissal

```lua
-- Capture popup text before dismissing (for CDM logging)
local popups = {}
for i = 0, #df.global.world.status.popups - 1 do
    local p = df.global.world.status.popups[i]
    table.insert(popups, {
        text = dfhack.df2utf(p.text),
        color = p.color,
        portrait_hfid = p.portrait_hfid
    })
end

-- Dismiss all popups
df.global.world.status.popups:resize(0)
```

### Automation Strategy

The bridge's repeat job should:
1. Check for popups each cycle
2. Capture popup text → write to `reactive_events` section
3. Auto-dismiss the popup
4. Log the popup event to CDM `announcements` with `is_popup = true`

This enables unattended fortress operation — no human needs to click through popups.

---

## Appendix A: DFHack API Quick Reference

### Unit Functions (dfhack.units.*)

| Function | Returns | Use |
|----------|---------|-----|
| `isAlive(u)` | bool | True if breathing |
| `isDead(u)` | bool | True if body is dead |
| `isUndead(u)` | bool | True if raised/zombie |
| `isGhost(u)` | bool | True if haunting |
| `isCitizen(u)` | bool | Strict: full citizen only |
| `isFortControlled(u)` | bool | Fort-owned (inc. pets, merchants) |
| `getReadableName(u)` | string | "Name Surname, Profession title" |
| `getVisibleName(u)` | name_obj | The visible name struct |

### GUI Functions (dfhack.gui.*)

| Function | Returns | Use |
|----------|---------|-----|
| `getCurFocus(true)` | table | Current focus string(s) |
| `getDFViewscreen(true)` | viewscreen | Top viewscreen |
| `getWidgetChildren(w)` | table | Widget children |
| `showPopupAnnouncement(text, color)` | void | Create custom popup |
| `makeAnnouncement(type, flags, pos, text)` | void | Create announcement |

### Popup System

```lua
df.global.world.status.popups      -- popup list
    [i].text                       -- popup text (CP437)
    [i].color                      -- color code
    [i].bright                     -- bright flag
    [i].portrait_hfid              -- associated HF ID (-1 if none)
    :resize(0)                     -- dismiss all popups
```

---

*Generated by Jarvis, Session 44, 2026-03-19*
*Fortress: Girderpriced / The Corridor of Heaven, Year 251*
*World: Tar Thran / The Land of Dawning*
