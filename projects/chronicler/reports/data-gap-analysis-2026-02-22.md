# Chronicler Data Gap Analysis — Comprehensive Findings & Proposed Solutions

**Date**: 2026-02-22
**Session**: 32
**Scope**: Full audit of data capture coverage across Legends XML, live bridge, and storyteller retrieval
**Status**: Reference document for multi-phase gap closure implementation

---

## Executive Summary

Chronicler currently captures roughly 15-20% of available Dwarf Fortress data. The game exposes 93 top-level `df.global.world` fields, 141 history event types, 250+ announcement types, 100+ unit fields per dwarf, and rich spatial/psychological/social data structures. Our bridge captures 11 data sections with ~12 fields per unit, our XML parser handles 8 of 14 top-level legends sections, and our storyteller queries only legends tables — zero live data integration.

Three architectural gaps compound to create the current blindspots:
1. **Capture gaps** — data exists in DF memory but we don't read it
2. **Storage gaps** — data is read but not structured for queryability
3. **Retrieval gaps** — data is stored but the storyteller can't find or correlate it

This document catalogs all identified gaps and proposes solutions organized by priority tier.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Legends XML Parser Gaps](#2-legends-xml-parser-gaps)
3. [Live Bridge Capture Gaps](#3-live-bridge-capture-gaps)
4. [Event Capture & Polling Risk](#4-event-capture--polling-risk)
5. [Storyteller Retrieval Gaps](#5-storyteller-retrieval-gaps)
6. [Data Linkage & Cross-Referencing](#6-data-linkage--cross-referencing)
7. [Spatial & Contextual Reconstruction](#7-spatial--contextual-reconstruction)
8. [Tertiary Data Sources](#8-tertiary-data-sources)
9. [DF Data Structure Reference](#9-df-data-structure-reference)
10. [Proposed Solutions by Priority Tier](#10-proposed-solutions-by-priority-tier)
11. [Implementation Phases](#11-implementation-phases)

---

## 1. Architecture Overview

### Current Data Flow

```
Legends XML Export (pre-game history)
    ↓ xml_parser.py
    ↓ PostgreSQL legends tables (8 sections)
    ↓ context.py (keyword + categorical routing)
    ↓ prompts.py (8000 char budget)
    ↓ LLM (Qwen3 8B via LiteLLM)
    ↓ Storyteller response

Live Bridge (in-game state) — SEPARATE SILO
    ↓ chronicler-bridge.lua (100-tick repeat job)
    ↓ HTTP server (port 8888)
    ↓ bridge.py (Python accessors)
    ↓ watcher.py (30s polling + change detection)
    ↓ PostgreSQL live tables (units, unit_events, lua_probes)
    ↓ [NOT CONNECTED TO STORYTELLER]
```

### Key Architectural Facts

- **Same ID space**: `world.history.events` is one vector — legends XML and live fortress events use identical IDs
- **HF linkage exists**: `units.hist_fig_id` can link live dwarves to `historical_figures` records
- **Announcements are persistent**: `world.status.reports` is an append-only vector, NOT a ring buffer
- **Rich causation data**: Emotions store `thought` type + `subthought` ID (reference to specific HF/event)
- **Full spatial model**: Units, items, buildings, and zones all have x/y/z coordinates with room-type classification

---

## 2. Legends XML Parser Gaps

### 2.1 Sections Currently Parsed (8 of 14+)

| Section | Parsed? | Tables Populated |
|---------|---------|-----------------|
| `<regions>` | NO | `regions` (schema exists, unpopulated) |
| `<underground_regions>` | NO | `underground_regions` (schema exists) |
| `<sites>` | YES | `sites`, `structures` |
| `<artifacts>` | YES | `artifacts` |
| `<world_constructions>` | NO | `world_constructions` (schema exists) |
| `<historical_figures>` | YES | `historical_figures`, `hf_links`, `hf_entity_links`, `hf_site_links` |
| `<entity_populations>` | NO | No table |
| `<entities>` | YES | `entities` |
| `<historical_events>` | YES | `history_events` |
| `<historical_event_collections>` | YES | `history_event_collections`, `collection_events`, `collection_subcollections` |
| `<historical_eras>` | NO | No table |
| `<poetic_forms>` | NO | No table |
| `<musical_forms>` | NO | No table |
| `<dance_forms>` | NO | No table |

### 2.2 legends_plus.xml Sections

| Section | Parsed? | Notes |
|---------|---------|-------|
| `<landmasses>` | YES | `landmasses` table |
| `<mountain_peaks>` | YES | `mountain_peaks` table |
| `<identities>` | YES | `identities` table |
| `<historical_event_relationships>` | YES | `event_relationships` table |
| `<written_contents>` | NO | No table — books, poems, treatises |
| `<rivers>` | NO | No table |
| `<creature_raw>` | NO | Full creature definitions |

### 2.3 Known Parsing Bugs

#### BUG-001: Boolean Flags All FALSE (REFL-023)
**Severity**: HIGH
**Impact**: Every categorical supernatural query fails ("tell me about the gods" → 0 results)

All boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`, `is_ghost`) are `false` across ALL 55,321 historical figures in both World 1 and World 2.

**Root cause hypothesis**: The XML likely uses presence-based empty tags (e.g., `<deity/>`) that the iterparse-based parser doesn't detect. The parser checks for `associated_type` text content for vampire/necromancer/werebeast, and checks for child elements `<deity>`, `<force>`, `<ghost>` — but if these are self-closing empty tags, the text content would be empty and the check may not trigger.

**Parser code** (`xml_parser.py` lines ~180-200):
```python
# Checks like:
if child.tag == 'deity':
    hf_data['is_deity'] = True
```
These should work for `<deity/>` but need debugging — possibly the issue is that the parent element processing clears/skips children, or the boolean columns aren't included in the INSERT statement.

**Fix**: Debug with a specific HF known to be a deity. Check if the tag is reached, if `hf_data['is_deity']` gets set, and if the INSERT includes the column.

#### BUG-002: Multi-Participant Events Truncated
**Severity**: MEDIUM
**Impact**: Battle narratives lose participants beyond the first two

Events with multiple HFs (battles with 10+ participants) store only the first `hf_id_1` and `hf_id_2`. Additional `<attacking_hfid>` or `<defending_hfid>` tags go to JSONB `details` but aren't queryable via indexed columns.

**Parser code** (`xml_parser.py` lines 229-244):
```python
# Only captures first match per category:
if tag in hf1_tags and hf1 is None:
    hf1 = value
```

**Fix**: For battle events, collect ALL participant HF IDs into a dedicated `participants` JSONB array, or create a `event_participants` junction table.

#### BUG-003: Site Ownership NULL
**Severity**: MEDIUM
**Impact**: "What sites does this civilization control?" returns nothing

All `owner_entity_id` values are NULL for all 1,899 sites. The legends XML likely encodes ownership via `<entity_site_links>` within entities, not via `<owner>` within sites.

**Fix**: During entity parsing, when `<entity_site_link>` elements are found within `<entity>`, update the corresponding site's `owner_entity_id`. Or parse from legends_plus.xml which may have explicit site ownership.

### 2.4 Missing XML Data Categories

#### Historical Figure Sub-Profiles (Not Extracted)
Each HF in legends XML can contain rich sub-data that we discard:

| Sub-data | What It Contains | Storytelling Value |
|----------|-----------------|-------------------|
| Kill profile | Species killed, counts, underground/surface/site | "The legendary dragon-slayer who felled 47 goblins" |
| Wound history | Body parts lost, injuries sustained | "The one-armed warrior" |
| Skill history | Professions held with year ranges | "Started as a peasant, became a legendary axedwarf" |
| Personality | traits, values, beliefs, goals | Character depth for narrative |
| Whereabouts | Last known location, body state (buried/unburied) | "Her body lies unburied in the ruins of Goldendale" |
| Reputation | Criminal records, exile flags | "The outlaw king" |
| Known secrets | Supernatural knowledge, read books | "The scholar who uncovered the necromancer's secrets" |

#### Written Contents (Not Parsed)
DF generates books, poems, scrolls, and treatises during world generation. These include:
- Title, author (HF ID), year composed
- Type (poem, short story, autobiography, treatise, etc.)
- Subject matter (historical event, HF, philosophical topic)
- Referenced art forms (poetic/musical/dance forms)

**Storytelling value**: HIGH — "Urist composed 'The Ballad of the Flaming Hammers' in year 237, commemorating the siege of Goldenhall"

#### Historical Eras (Not Parsed)
DF divides world history into named eras. These provide temporal context for storytelling:
- Era name, type, start/end year
- Example: "The Age of Myths (year 1-200)", "The War of Swords (year 240-253)"

---

## 3. Live Bridge Capture Gaps

### 3.1 Currently Captured (11 sections)

| Section | Key Data | Adequacy |
|---------|----------|----------|
| `game_time` | year, tick, season | Complete |
| `creature_raws` | race_id → creature_id (934 types) | Complete |
| `unit_summary` | 12 fields per dwarf (name, prof, stress, focus, squad, pos) | ~15% of available unit data |
| `armies` | id, pos, member_count, controller_id (capped 50) | Adequate for tracking |
| `buildings` | total + type distribution | Count only — no details |
| `artifacts` | named list with translations (capped 200) | Names only — no creator/history |
| `announcements` | last 20 reports (text, type, year, time) | CRITICAL GAP — no cursor |
| `diplomacy` | player civ diplomatic relations | Adequate |
| `history` | figure count, event count, last 50 events (type+year only) | CRITICAL GAP — no payloads |
| `world_info` | world/fortress names, civ/site IDs | Complete |
| `entities` | name, type, race (capped 100) | Adequate |
| `dwarf_skills` | per-dwarf skill lists (id, rating, experience) | Complete for skills |

### 3.2 Unit Data Not Captured

Per-unit fields available in `df.global.world.units.active[]` but NOT read by bridge:

#### Psychology (narrative-critical)
| Field Path | Type | What It Tells You |
|-----------|------|-------------------|
| `status.current_soul.personality.emotions[]` | vector of `personality_moodst` | Recent emotional events with causes |
| `status.current_soul.personality.thoughts[]` | vector | Active thought records |
| `status.current_soul.personality.needs[]` | vector | Unmet psychological needs |
| `status.current_soul.personality.traits[50]` | int array | Personality facets (bravery, anxiety, etc.) |
| `status.current_soul.personality.values[32]` | int array | Personal values (law, family, nature) |
| `status.current_soul.personality.memories[]` | vector | Notable life memories |
| `status.current_soul.personality.preferences[]` | vector | Likes: foods, metals, activities |

#### Emotion Entry Structure (`personality_moodst`)
Each emotion has:
- `type` — emotion_type enum (ANGER, FEAR, JOY, GRIEF, etc.)
- `thought` — unit_thought_type enum (200+ values: WitnessDeath, NiceRoom, AteOutside, etc.)
- `subthought` — **ID reference to the specific cause** (historical_figure ID, event_collection ID, etc.)
- `strength`, `relative_strength`, `severity`
- `year`, `year_tick` — when the emotion formed
- `flags` — includes `was_dream_goal`, `vocalized`, etc.

**This is the key to contextual reconstruction.** The `subthought` field directly links an emotion to its cause.

#### Flags (128 bits across 4 bitfields)
| Flag | Bitfield | What It Indicates |
|------|----------|-------------------|
| `has_mood` | flags1 | Currently in a strange mood |
| `active_invader` | flags1 | Part of an attacking force |
| `ghostly` | flags3 | Is a ghost |
| `in_tantrum` | flags3 | Currently throwing a tantrum |
| `killed` / `inactive` | flags1/flags2 | Dead/removed from simulation |
| `merchant` | flags1 | Is a merchant |
| `diplomat` | flags1 | Is a diplomat |
| `caged` | flags1 | In a cage |
| `chained` | flags1 | Restrained |
| `drowning` | flags2 | Currently drowning |
| `emotionally_overloaded` | flags2 | Extreme emotional state |
| `announce_titan` | flags2 | Forgotten beast/titan arrival pending |

#### Mood/Reproduction
| Field | What It Tells You |
|-------|-------------------|
| `mood` (enum) | Strange mood type: Fey, Possessed, Macabre, Berserk, Melancholy, etc. |
| `mood_copy` | Original mood before strange mood override |
| `pregnancy_timer` | Ticks until birth (0 = not pregnant) |
| `pregnancy_spouse` | Father's unit ID |

#### Physical State
| Field | What It Tells You |
|-------|-------------------|
| `health.wounds[]` | Wound vector with body parts, severity |
| `inventory[]` | Equipped items with worn/held slots |
| `military.squad_id` + `squad_position` | Military assignment details |
| `uniform` | Equipment loadout |
| `birth_year`, `old_year` | Age and expected death from old age |

#### Relationships
| Field | What It Tells You |
|-------|-------------------|
| `relationship_ids[9]` | Indexed by unit_relationship_type (trainer, pet, etc.) |
| `hist_figure_id` | Link to historical_figures table |
| `following` | Currently following which unit |

### 3.3 World Structures Not Captured

| Structure | Typical Size | Storytelling Value | Effort |
|-----------|-------------|-------------------|--------|
| `world.squads.all` | 10-30 | Military readiness, composition, schedules | Low |
| `world.mandates` | 0-5 | Noble demands, fortress politics | Low |
| `world.crimes` | 0-20 | Crime narratives, justice system | Low |
| `world.incidents` | 0-20 | Crime investigations in progress | Low |
| `world.activities` | 10-50 | Parties, performances, scholarly work, training | Medium |
| `world.written_contents.all` | 0-100 | Library contents, books authored | Medium |
| `world.jobs.list` | 50-200 | Current workshop orders, construction | Medium |
| `world.manager_orders` | 0-30 | Standing work orders | Low |
| `world.items.all` | 1000-100000+ | Item locations, corpses, equipment | HIGH (perf risk) |
| `world.plants.all` | 100-5000 | Farm plots, surface vegetation | Low priority |
| `world.interactions` | 0-20 | Active curses, magic | Low |
| `world.identities` | 0-10 | Secret identities (vampire covers, etc.) | Low |
| `world.occupations` | 0-50 | Scholar/performer roles | Low |
| `world.belief_systems` | 1-5 | Religious belief systems | Low |

### 3.4 Spatial Data Not Captured

DF provides a full 3D spatial model:

#### Building Bounds
Every building has `x1, y1, x2, y2, z` — a rectangular footprint on one Z level.
The bridge captures building TYPE COUNTS but not individual buildings or their positions.

#### Zone Types (`building_civzonest`)
Zones classify areas by purpose. 100+ `civzone_type` values including:
- `MeadHall` (tavern), `Temple`, `Bedroom`, `DiningHall`, `Barracks`
- `Dungeon`, `Tomb`, `Office`, `Dormitory`, `NobleQuarters`
- `Shop`, `Library`, `Guildhall`

Each zone has: type enum, x1/y1/x2/y2/z bounds, `assigned_units[]`, `contained_buildings[]`

#### Items as Spatial Entities
Every item has `pos.x/y/z`. Corpses (`item_corpse`) additionally have:
- `hist_figure_id` — whose body this is
- `unit_id` — link to unit record
- `race`, `caste`, `sex` — creature identity
- `rot_timer` — decay state

**This enables spatial storytelling**: "Urist sat alone in the tavern" = unit.pos inside MeadHall zone bounds.

---

## 4. Event Capture & Polling Risk

### 4.1 The Announcement Cursor Problem (CRITICAL)

**Current behavior**: Bridge reads last 20 `world.status.reports` entries with no cursor.

**Risk**: If 21+ announcements fire between polls (battle, loyalty cascade, caravan + siege overlap), oldest events in the burst are silently dropped forever.

**Fix**: Track `last_seen_report_id` in the bridge state. On each poll, read all reports with `id > last_seen_report_id`. This makes the system lossless — polling interval affects only detection latency, not completeness.

**Implementation detail**: Reports are stored in an append-only vector. Each has a unique `id`. The vector never shrinks during a game session.

### 4.2 The History Event Payload Problem (CRITICAL)

**Current behavior**: Bridge reads last 50 `world.history.events` entries but captures only `{id, type_integer, year}`.

**Available per event**: All 141 event types have structured payloads. Key fields available on the base `history_event` class:
- `seconds` — tick within year
- Various typed fields depending on event subclass

Key event subclass payloads:

| Event Type | Available Fields | What They Tell You |
|-----------|-----------------|-------------------|
| `HIST_FIGURE_DIED` | victim HF, killer HF, cause, weapon, site | "Bomrek was slain by Urist with a copper hammer at Goldenhall" |
| `ARTIFACT_CREATED` | creator HF, item type, material, method (mood/craft), site | "Urist created Orbsearched, a bismuth bronze helm, in a fit of possession" |
| `ADD_HF_HF_LINK` | both HF IDs, link type (spouse/child/lover) | "Urist and Aban were married" |
| `CHANGE_HF_MOOD` | HF ID, mood type | "Urist was taken by a fey mood" |
| `WAR_ATTACKED_SITE` | attacker entity, defender entity, site | "The goblins attacked Goldenhall" |
| `MASTERPIECE_CREATED_ITEM` | creator HF, item type, material, skill | "A masterwork iron short sword was forged" |
| `CREATED_SITE` | founding entity, site location | "A new settlement was founded" |
| `CREATURE_DEVOURED` | eater HF, victim HF, site | "The dragon devoured the elf diplomat" |
| `HF_ABDUCTED` | snatcher HF, victim HF, site | "The goblin kidnapped the human child" |
| `ENTITY_OVERTHROWN` | overthrower HF, entity, position | "The baron was overthrown in a coup" |

**Fix**: Extract key payload fields for the top 20-30 most common event types. Store as structured JSONB.

### 4.3 Polling Timing Risk Matrix

At 100-tick bridge interval + 30-second watcher poll:

| Event Category | Persistent? | Announcement? | Risk of Missing |
|----------------|-------------|---------------|-----------------|
| Unit death | YES (unit removed) | YES | LOW — death detected by absence |
| Unit arrival | YES (unit appears) | YES | LOW — detected as new unit |
| Marriage | YES (HF link) | YES | HIGH — no HF link tracking, announcement may overflow |
| Birth | YES (new unit) | YES | MEDIUM — ARRIVED event, but no "birth" context |
| Strange mood | YES (flag set) | YES | HIGH — no mood flag captured |
| Artifact creation | YES (item created) | YES | MEDIUM — artifact list polled, creation context lost |
| Tantrum | TRANSIENT (flag) | YES | HIGH — flag not captured, announcement may overflow |
| Siege start | YES (army appears) | YES | LOW — army list polled |
| Siege end | YES (army gone) | YES | LOW — army disappearance detected |
| Profession change | YES (field change) | NO | LOW — change detector catches this |
| Skill gain | YES (field change) | NO | LOW — change detector catches this |
| Mandate issued | YES (mandate created) | YES | HIGH — no mandate tracking |
| Crime committed | YES (incident created) | YES | HIGH — no crime tracking |
| Noble appointment | YES (position assigned) | YES | HIGH — no position tracking |
| Outside-world war event | YES (history event) | NO (no announcement) | HIGH — event payloads not captured |
| Forgotten beast arrival | YES (unit appears) | YES | MEDIUM — detected as unit, type unclear |
| Loyalty cascade | FAST TRANSIENT | YES (multiple) | HIGH — cascade causality lost |
| Drowning | YES (death) | YES | LOW (death detected) but cause lost |

### 4.4 Events That Can Never Be Missed (With Fixes)

With report cursor tracking + unit flag capture, the following become lossless:
- ALL events that generate announcements (250+ types)
- ALL unit state changes (death, mood, tantrum, invasion)
- ALL history events (with payload extraction)

The only remaining blindspot would be **intermediate states** — a dwarf who goes berserk and dies within the same poll window. We'd capture both the announcement and the death, but miss the berserk flag snapshot.

---

## 5. Storyteller Retrieval Gaps

### 5.1 Current Retrieval Architecture

```
extract_keywords(query)  →  stop-word filtering (200+ words, no NLP)
    ↓
retrieve_context(pool, world_id, query):
    Phase 1: Categorical routing (_CATEGORY_ROUTES)
        "deity" → historical_figures WHERE is_deity=TRUE
        "dragon" → historical_figures WHERE race LIKE 'DRAGON%'
        "civilization" → entities WHERE type='civilization'
        "war"/"battle" → history_event_collections WHERE type=...
    Phase 2: ILIKE name search (remaining keywords, limit 5 per table)
        historical_figures, entities, sites, history_event_collections
    Fallback: _world_overview()
        Top 5 civs, top 5 wars, top 5 legends
    ↓
format_context(records)  →  8000 char budget
    ↓
build_messages()  →  System: Chronicler persona, User: context + query
    ↓
stream_completion()  →  Qwen3 8B, temp 0.8, max 2048 tokens
```

### 5.2 Retrieval Blindspots

#### No Live Data Integration
The storyteller queries ZERO live tables:
- `units` — current fortress inhabitants with stress, skills, positions
- `unit_events` — arrivals, deaths, profession changes, skill-ups
- `game_reports` — live announcements
- `lua_probes` — bridge data snapshots (armies, buildings, artifacts, diplomacy)

**Impact**: "Tell me about my fortress" returns nothing. "How are my dwarves doing?" returns nothing. The storyteller only knows about pre-game history.

#### No Event Payload Queries
When history events are fetched for an HF match, the query returns basic fields but doesn't join to extract event-specific payload data from the `details` JSONB column.

#### Limited HF Context
When an HF is matched, the retrieval fetches:
- Basic HF fields (name, race, birth/death year, flags)
- Up to 10 related events (ordered by year DESC)

But does NOT fetch:
- HF-to-HF relationships (spouse, children, master/apprentice)
- HF-to-entity memberships (civilizations, religions)
- HF-to-site associations (residences, lairs)
- Kill count details (beyond the computed `kill_count` integer)

#### No Relationship Traversal
If a user asks "Tell me about the family of Urist," the retrieval finds Urist by name search but doesn't traverse `hf_links` to find spouse, children, parents. The LLM gets Urist's record alone and must fabricate or omit family details.

#### No Vector/Embedding Search
The `embeddings` table and pgvector infrastructure exist but are unused. All retrieval is keyword-based.

### 5.3 System Prompt Limitations

The current system prompt tells the LLM:
1. Speak as "The Chronicler" with gravitas
2. Draw on provided historical records
3. Never fabricate facts that contradict records
4. Say "The annals hold no record" rather than inventing

**Missing instructions**:
- No guidance on what data types exist or how to interpret them
- No instruction to look for corroborating details (emotions → causes → locations)
- No guidance on distinguishing between absence-of-data vs data-confirming-absence
- The "never fabricate facts that contradict records" instruction allows the LLM to freely ADD details when records are silent (a known hallucination vector — REFL-024)

---

## 6. Data Linkage & Cross-Referencing

### 6.1 The Legends-to-Live Data Bridge

**Key finding**: Legends XML and live fortress data use the SAME `world.history.events` vector with identical IDs.

This means:
- A war that started in year 200 (legends) and continues into year 253 (fortress mode) has all events in one vector
- Event IDs from XML import should match event IDs readable from live memory
- `history_event_collections` (wars, sieges) span both periods seamlessly

**Current gap**: The `history_events` table (from XML) and `lua_probes` (from bridge) are separate silos. No query joins them.

**Proposed fix**: During bridge polling, check for new `world.history.events` entries beyond the highest ID in the `history_events` table. Insert them with the same schema. This makes the legends-to-live transition seamless — the `history_events` table becomes a unified timeline.

### 6.2 Unit-to-Historical-Figure Linkage

The `units` table has `hist_fig_id` which references `historical_figures.id`. This enables:
- "Which historical figure is this living dwarf?" → JOIN units to historical_figures
- "What events has this dwarf been involved in?" → units → historical_figures → history_events
- "Who is related to this dwarf?" → units → historical_figures → hf_links

**Current gap**: This JOIN is never performed in the storyteller's retrieval code.

### 6.3 Event-to-Figure-to-Site Chain

A complete narrative chain would be:
1. Event collection (war) → individual events → participant HFs → their civs/sites
2. Living unit → their hist_fig → events they participated in → related HFs
3. Unit emotion → cause (thought + subthought) → specific HF/event → location context

None of these chains are currently traversed in retrieval.

### 6.4 Proposed Unified Query Architecture

```sql
-- Example: "Tell me about Urist" should return:
-- 1. Historical figure record
SELECT * FROM historical_figures WHERE name ILIKE '%urist%';

-- 2. Current living status (if alive in fortress)
SELECT u.* FROM units u
WHERE u.hist_fig_id IN (SELECT id FROM historical_figures WHERE name ILIKE '%urist%')
AND u.is_alive = TRUE;

-- 3. Relationships
SELECT hf2.name, l.link_type
FROM hf_links l JOIN historical_figures hf2 ON l.target_hf_id = hf2.id
WHERE l.hf_id = <urist_hf_id>;

-- 4. Entity memberships
SELECT e.name, el.link_type, el.position_name
FROM hf_entity_links el JOIN entities e ON el.entity_id = e.id
WHERE el.hf_id = <urist_hf_id>;

-- 5. Key events (with payloads)
SELECT he.year, he.event_type, he.details,
       hf1.name as subject, hf2.name as object, s.name as site_name
FROM history_events he
LEFT JOIN historical_figures hf1 ON he.hf_id_1 = hf1.id
LEFT JOIN historical_figures hf2 ON he.hf_id_2 = hf2.id
LEFT JOIN sites s ON he.site_id = s.id
WHERE he.hf_id_1 = <urist_hf_id> OR he.hf_id_2 = <urist_hf_id>
ORDER BY he.year DESC LIMIT 10;

-- 6. Current emotions (if live unit)
-- (from bridge data stored in lua_probes or new emotions table)
```

---

## 7. Spatial & Contextual Reconstruction

### 7.1 The "Whose Dead Body?" Problem

**Question**: When we detect "Urist was horrified after seeing a dead body," can we determine whose body?

**Answer**: YES — the data supports full reconstruction:

1. **Emotion source**: `personality.emotions[].thought = WitnessDeath`, `subthought = <HF_ID of dead person>`
2. **Corpse location**: `item_corpse.pos.x/y/z` where `hist_figure_id = <same HF_ID>`
3. **Room context**: Match corpse position against `building_civzonest` bounds → zone type name
4. **Observer location**: `unit.pos.x/y/z` at time of emotion
5. **Death event**: `history_events` where `event_type = HIST_FIGURE_DIED` and `hf_id_1 = <HF_ID>`

**Reconstruction**: "Urist McAxedwarf was horrified after witnessing the corpse of Bomrek Hammerfist lying in the tavern. Bomrek had been killed by the goblin Snodub Evilteeth during the siege of year 253."

### 7.2 Location Resolution Strategy

To transform raw coordinates into named locations:

```lua
-- For each unit, determine which zone they're in:
function resolve_location(unit)
    for _, bld in ipairs(df.global.world.buildings.all) do
        if bld:getType() == df.building_type.Civzone then
            if unit.pos.x >= bld.x1 and unit.pos.x <= bld.x2
               and unit.pos.y >= bld.y1 and unit.pos.y <= bld.y2
               and unit.pos.z == bld.z then
                return bld  -- zone type, name, assigned units
            end
        end
    end
    return nil  -- outdoors or unzoned area
end
```

Zone type → human-readable name mapping:
- `MeadHall` → "the tavern"
- `Temple` → "the temple"
- `Bedroom` → "their bedroom"
- `DiningHall` → "the dining hall"
- `Barracks` → "the barracks"
- `Tomb` → "the catacombs"
- `Dungeon` → "the dungeon"
- `Office` → "the office"
- `Library` → "the library"

### 7.3 Proposed Enriched Unit Data Model

Instead of raw IDs and coordinates, capture pre-resolved context:

```json
{
    "id": 42,
    "name": "Urist McAxedwarf",
    "profession": "Axedwarf",
    "location": {
        "zone_type": "MeadHall",
        "zone_name": "the tavern",
        "pos": [45, 67, -3]
    },
    "emotions": [
        {
            "type": "GRIEF",
            "thought": "WitnessDeath",
            "cause": "Bomrek Hammerfist (HF #1234)",
            "strength": 80,
            "when": {"year": 253, "tick": 45000}
        }
    ],
    "mood": null,
    "flags": {
        "has_mood": false,
        "in_tantrum": false,
        "ghostly": false
    },
    "stress": 25000,
    "needs": ["alcohol", "social interaction"],
    "hist_fig_id": 5678
}
```

This pre-resolved format means the LLM receives narrative-ready context without needing to perform ID lookups.

---

## 8. Tertiary Data Sources

### 8.1 gamelog.txt

**Location**: `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\gamelog.txt`
**Access**: `curl http://192.168.4.194:8888/gamelog.txt`
**Status**: Currently accessible via HTTP server

**Format**: Plain text, append-only, mirrors on-screen announcements. No structured metadata (no year/tick/type fields).

**Use case**: Backup/validation source. If bridge crashes and `world.status.reports` cursor is stale, gamelog.txt can fill gaps via text parsing. Lower priority than structured report capture.

**Risk**: File may grow large over extended sessions. Would need tail-based reading (track file offset).

### 8.2 DFHack Event Hooks (Push-Based Alternative)

DFHack supports Lua event callbacks:
- `dfhack.onStateChange` — game state transitions
- `EventManager` — register callbacks for specific event types (UNIT_DEATH, CONSTRUCTION, etc.)

These provide **push-based** event detection (no polling gap), but:
- Require persistent Lua plugin (not a `repeat` script)
- More complex to implement and debug
- Currently not used

**Long-term consideration**: For critical events (deaths, mood starts, siege begins), event hooks would eliminate the polling blindspot entirely.

---

## 9. DF Data Structure Reference

### 9.1 History Event Types (141 total)

Organized by category:

**War & Military (17 types)**:
WAR_ATTACKED_SITE, WAR_DESTROYED_SITE, WAR_FIELD_BATTLE, WAR_PLUNDERED_SITE, WAR_SITE_NEW_LEADER, WAR_SITE_TRIBUTE_FORCED, WAR_SITE_TAKEN_OVER, WAR_PEACE_ACCEPTED, WAR_PEACE_REJECTED, HF_ATTACKED_SITE, HF_DESTROYED_SITE, HF_RAZED_BUILDING, ENTITY_RAZED_BUILDING, SITE_SURRENDERED, TACTICAL_SITUATION, SQUAD_VS_SQUAD, ENTITY_RAMPAGED_IN_SITE

**Sites & Civilizations (27 types)**:
CREATED_SITE, RECLAIM_SITE, SITE_DIED, SITE_RETIRED, ENTITY_CREATED, ENTITY_ACTION, ENTITY_INCORPORATED, ENTITY_DISSOLVED, ENTITY_LAW, ENTITY_OVERTHROWN, ENTITY_EXPELS_HF, ENTITY_BREACH_FEATURE_LAYER, ENTITY_ALLIANCE_FORMED, ENTITY_PERSECUTED, ENTITY_FLED_SITE, INSURRECTION_STARTED, INSURRECTION_ENDED, FIRST_CONTACT, FIRST_CONTACT_FAILED, DIPLOMAT_LOST, TOPICAGREEMENT_CONCLUDED, TOPICAGREEMENT_REJECTED, TOPICAGREEMENT_MADE, AGREEMENTS_VOIDED, AGREEMENT_FORMED, AGREEMENT_CONCLUDED, SITE_DISPUTE

**Historical Figures — Life Events (24 types)**:
HIST_FIGURE_DIED, HIST_FIGURE_WOUNDED, HIST_FIGURE_ABDUCTED, HIST_FIGURE_REVIVED, HIST_FIGURE_REUNION, HIST_FIGURE_REACH_SUMMIT, HIST_FIGURE_TRAVEL, HIST_FIGURE_NEW_PET, HIST_FIGURE_SIMPLE_BATTLE_EVENT, HIST_FIGURE_SIMPLE_ACTION, CHANGE_HF_STATE, CHANGE_HF_JOB, CHANGE_HF_MOOD, CHANGE_HF_BODY_STATE, CHANGE_CREATURE_TYPE, ASSUME_IDENTITY, HF_GAINS_SECRET_GOAL, HF_CONFRONTED, HF_RELATIONSHIP_DENIED, HFS_FORMED_REPUTATION_RELATIONSHIP, HFS_FORMED_INTRIGUE_RELATIONSHIP, FAILED_INTRIGUE_CORRUPTION, HF_CONVICTED, HF_INTERROGATED

**HF Links (9 types)**:
ADD_HF_ENTITY_LINK, REMOVE_HF_ENTITY_LINK, ADD_HF_SITE_LINK, REMOVE_HF_SITE_LINK, ADD_HF_HF_LINK, REMOVE_HF_HF_LINK, ADD_HF_ENTITY_HONOR, HF_RECRUITED_UNIT_TYPE_FOR_ENTITY, CREATE_ENTITY_POSITION

**Artifacts (14 types)**:
ARTIFACT_CREATED, ARTIFACT_LOST, ARTIFACT_FOUND, ARTIFACT_RECOVERED, ARTIFACT_DROPPED, ARTIFACT_STORED, ARTIFACT_POSSESSED, ARTIFACT_HIDDEN, ARTIFACT_TRANSFORMED, ARTIFACT_DESTROYED, ARTIFACT_COPIED, ARTIFACT_CLAIM_FORMED, ARTIFACT_GIVEN, HF_ACT_ON_ARTIFACT

**Masterpieces (7 types)**:
MASTERPIECE_CREATED_ARCH_CONSTRUCT, MASTERPIECE_CREATED_ITEM, MASTERPIECE_CREATED_DYE_ITEM, MASTERPIECE_CREATED_ITEM_IMPROVEMENT, MASTERPIECE_CREATED_FOOD, MASTERPIECE_CREATED_ENGRAVING, MASTERPIECE_LOST

**Knowledge & Culture (11 types)**:
KNOWLEDGE_DISCOVERED, WRITTEN_CONTENT_COMPOSED, POETIC_FORM_CREATED, MUSICAL_FORM_CREATED, DANCE_FORM_CREATED, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, HF_LEARNS_SECRET, HF_DOES_INTERACTION

**Misc (32 types)**:
CREATURE_DEVOURED, CREATED_WORLD_CONSTRUCTION, BODY_ABUSED, ITEM_STOLEN, SNEAK_INTO_SITE, SPOTTED_LEAVING_SITE, MERCHANT, TRADE, GAMBLE, SABOTAGE, REGIONPOP_INCORPORATED_INTO_ENTITY, ENTITY_SEARCHED_SITE, ENTITY_EQUIPMENT_PURCHASE, ADD_ENTITY_SITE_PROFILE_FLAG, BUILDING_PROFILE_ACQUIRED, MODIFIED_BUILDING, CREATED_BUILDING, REPLACED_BUILDING, HF_RANSOMED, HF_ENSLAVED, HF_FREED, HF_PREACH, HF_ACT_ON_BUILDING, FAILED_FRAME_ATTEMPT, ENTITY_RAMPAGED_IN_SITE, and others

### 9.2 Event Collection Types (19 total)

WAR, BATTLE, DUEL, SITE_CONQUERED, ABDUCTION, THEFT, BEAST_ATTACK, JOURNEY, INSURRECTION, OCCASION, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, PURGE, RAID, PERSECUTION, ENTITY_OVERTHROWN, and potentially more in v53+

### 9.3 Unit Thought Types (200+ values)

Selected high-value thought types for storytelling:

**Emotional triggers**: WitnessDeath, UnexpectedDeath, Death, SawDrinkingBlood, Conflict, ConflictWithAnimal, LoveSeparated, LoveReunited, AcquiredItem, LostItem

**Environmental**: NiceRoom, UglyRoom, AteInDiningRoom, AteOutside, SleptInBedroom, SleptOnGround, RainedOn, CaughtInStorm

**Social**: Conversation, NiceConversation, Argument, FightStarted, FriendDied, PetDied, RelativesDied

**Work**: MadeMasterpiece, ProducedArtifact, CompletedGreatProject, ResearchBreakthrough

### 9.4 Zone Types (Selected)

`MeadHall`, `Temple`, `Bedroom`, `DiningHall`, `Barracks`, `Dungeon`, `Tomb`, `Office`, `Dormitory`, `NobleQuarters`, `Shop`, `Library`, `Guildhall`, `Kitchen`, `CaptiveRoom`, `ThroneRoom`, `Depot`

---

## 10. Proposed Solutions by Priority Tier

### Tier 1: Critical Fixes (High Impact, Low Effort)

#### T1-1: Report Cursor Tracking
**Gap**: Announcement overflow — last-20 with no cursor
**Fix**: In `chronicler-bridge.lua`, track `last_seen_report_id` in bridge state. Fetch all reports since that ID (cap at 200 per poll).
**Files**: `chronicler-bridge.lua` (announcements section)
**Effort**: ~20 lines Lua
**Impact**: Captures ALL 250+ announcement event types losslessly

#### T1-2: Unit Flag Extraction
**Gap**: No mood, tantrum, invader, ghost detection
**Fix**: Add flag bit reads + mood enum to the fortress_units loop
**Fields**: `has_mood`, `mood`, `in_tantrum`, `ghostly`, `active_invader`, `pregnancy_timer`, `emotionally_overloaded`
**Files**: `chronicler-bridge.lua` (unit_summary section)
**Effort**: ~15 lines Lua
**Impact**: Detects strange moods, tantrums, invasions, pregnancies

#### T1-3: History Event Payloads
**Gap**: Events captured as type+year only, no participant/site/cause data
**Fix**: For each event in the last-N batch, extract key fields from the event struct based on its type. At minimum: hf_id_1, hf_id_2, site_id, artifact_id, entity_id
**Files**: `chronicler-bridge.lua` (history section)
**Effort**: ~40 lines Lua
**Impact**: Enables "who did what to whom where" for all captured events

#### T1-4: History Event Cursor Tracking
**Gap**: Only last 50 events captured; events between polls lost
**Fix**: Track `last_seen_event_id` and fetch all new events since
**Files**: `chronicler-bridge.lua` (history section)
**Effort**: ~10 lines Lua (combines with T1-3)
**Impact**: Lossless event capture for all 141 event types

### Tier 2: Narrative Enrichment (High Impact, Medium Effort)

#### T2-1: Emotion/Thought Capture
**Gap**: No psychological context beyond stress number
**Fix**: For each fortress dwarf, read `emotions[]` vector. Extract type, thought, subthought (cause ID), strength, year/tick. Resolve subthought IDs to names inline.
**Files**: `chronicler-bridge.lua` (new section or extended unit_summary)
**Effort**: ~60 lines Lua (iterate emotions per unit, resolve HF names)
**Impact**: "Urist was horrified after seeing Bomrek's corpse" becomes possible

#### T2-2: Zone/Location Resolution
**Gap**: Unit positions are raw x/y/z coordinates with no room context
**Fix**: Capture all `building_civzonest` entries (type, x1/y1/x2/y2/z, name). On the Python side, resolve each unit's position to a zone name.
**Files**: `chronicler-bridge.lua` (new zones section), `bridge.py` (new accessor), `watcher.py` (location resolution)
**Effort**: ~40 lines Lua + ~30 lines Python
**Impact**: "Urist is in the tavern" instead of "Urist is at (45, 67, -3)"

#### T2-3: Live Data Storyteller Integration
**Gap**: Storyteller queries only legends tables, ignores all live data
**Fix**: Add live data retrieval paths to `context.py`:
- Query `units` table for fortress inhabitants
- Query `unit_events` for recent events (deaths, arrivals)
- Query `lua_probes` for bridge snapshots (armies, diplomacy, announcements)
- JOIN `units.hist_fig_id` to `historical_figures` for cross-referencing
**Files**: `context.py` (new retrieval functions), `prompts.py` (updated system prompt)
**Effort**: ~150 lines Python
**Impact**: "Tell me about my fortress" actually returns data

#### T2-4: Event Collection Capture (Outside World)
**Gap**: Zero event collection data from live bridge
**Fix**: Read `world.history.event_collections` — active wars, sieges, beast attacks with participant entities and casualty data
**Files**: `chronicler-bridge.lua` (new section)
**Effort**: ~50 lines Lua
**Impact**: "What wars are happening?" becomes answerable

#### T2-5: Relationship Traversal in Retrieval
**Gap**: HF matches don't include relationships, memberships, or site associations
**Fix**: When an HF is matched, also query `hf_links`, `hf_entity_links`, `hf_site_links` and include in context
**Files**: `context.py` (extended HF query)
**Effort**: ~40 lines Python
**Impact**: "Tell me about Urist's family" returns actual family data

### Tier 3: Completeness (Medium Impact)

#### T3-1: Squads + Mandates + Crimes from Bridge
**Gap**: No military structure, noble demands, or crime data
**Fix**: Add `get_squads()`, `get_mandates()`, `get_crimes()` bridge sections
**Effort**: ~30 lines Lua each

#### T3-2: Fix XML Boolean Parsing (REFL-023)
**Gap**: Deity/vampire/necromancer flags all FALSE
**Fix**: Debug the parser with known deities, fix tag detection
**Effort**: ~2 hours debugging + ~5 lines fix

#### T3-3: Fix XML Site Ownership (BUG-003)
**Gap**: All site owner_entity_id NULL
**Fix**: Parse entity_site_links within entity elements, update site records
**Effort**: ~20 lines Python

#### T3-4: XML Region/Geography Parsing
**Gap**: Regions, underground regions, world constructions not parsed
**Fix**: Add parsing for `<regions>`, `<underground_regions>`, `<world_constructions>`
**Effort**: ~50 lines Python

#### T3-5: XML Written Contents Parsing
**Gap**: Books, poems, treatises not parsed from legends_plus
**Fix**: Add `written_contents` table + parser section
**Effort**: ~40 lines Python + schema migration

#### T3-6: XML Era Parsing
**Gap**: Historical eras not parsed
**Fix**: Add `historical_eras` table + parser section
**Effort**: ~20 lines Python + schema migration

#### T3-7: Confidence Signaling in Storyteller (REFL-024)
**Gap**: LLM fabricates details when records are sparse
**Fix**: Add context quality signal to system prompt: "You have N records (X chars) of context. If context is sparse, note uncertainty."
**Effort**: ~5 lines in prompts.py

#### T3-8: War Context Name Resolution (REFL-025)
**Gap**: War events have entity IDs but not resolved names
**Fix**: JOIN entity IDs to names in war event/collection queries
**Effort**: ~10 lines SQL

### Tier 4: Long-Term (Lower Priority)

#### T4-1: Corpse/Item Spatial Tracking
Read `world.items.all` filtered to corpses only (perf-safe subset), capture positions + HF links

#### T4-2: Activity Monitoring
Read `world.activities` for parties, performances, scholarly work

#### T4-3: Written Content from Live Data
Read `world.written_contents.all` for fortress-composed works

#### T4-4: DFHack Event Hooks (Push-Based)
Replace polling for critical events with EventManager callbacks

#### T4-5: Embedding-Based Retrieval
Wire up the existing pgvector infrastructure for semantic search

#### T4-6: Narrative Engine
Use enriched data to generate proactive fortress stories

---

## 11. Implementation Phases

### Phase 1: Bridge Expansion (Lua-side fixes)
- T1-1: Report cursor
- T1-2: Unit flags + mood
- T1-3 + T1-4: History event cursor + payloads
- T2-1: Emotion/thought capture
- T2-2: Zone data capture
- T2-4: Event collection capture
- T3-1: Squads + mandates + crimes

**Deliverable**: Expanded `chronicler-bridge.lua` (v6) with lossless event capture, enriched unit data, and spatial context

### Phase 2: Python Pipeline (storage + change detection)
- Updated `bridge.py` accessors for new sections
- Updated `watcher.py` for new change detection (mood changes, emotion triggers, zone transitions)
- Updated `detector.py` for new event types
- Schema migrations for new tables/columns
- Location resolution (unit pos → zone name)

**Deliverable**: Watcher that detects and stores moods, emotions, zone changes, and all announcement events

### Phase 3: Storyteller Enhancement (retrieval + prompts)
- T2-3: Live data integration in context.py
- T2-5: Relationship traversal
- T3-7: Confidence signaling
- T3-8: War context name resolution
- Updated system prompt with data structure guidance

**Deliverable**: Storyteller that queries both legends and live data with rich context

### Phase 4: XML Parser Fixes
- T3-2: Boolean flag debugging
- T3-3: Site ownership fix
- T3-4: Region/geography parsing
- T3-5: Written contents
- T3-6: Era parsing

**Deliverable**: Parser that extracts 12+ of 14 legends sections with correct boolean flags

### Phase 5: Advanced Features
- T4-1 through T4-6

---

## Appendix: Key File Locations

| Component | Path |
|-----------|------|
| Bridge Lua | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| Bridge Python | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| Watcher | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change Detector | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Sync | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py` |
| RPC Client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py` |
| XML Parser | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| DB Schema | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Context Retrieval | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` |
| System Prompts | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py` |
| LLM Client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/llm.py` |
| API Routes | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/storyteller.py` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| Deploy Bridge | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/experiments/deploy-bridge.py` |
| DF Structures | `/Users/nathanielcannon/Claude/GitRepos/df-structures/` |
| HomeServer | `192.168.4.194` (HTTP: 8888, DFHack RPC: 5000) |

---

*Gap Analysis v1.0 — Chronicler Data Coverage Audit, Session 32, 2026-02-22*
