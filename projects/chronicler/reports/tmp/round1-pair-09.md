# Consolidation: Data Gap Analysis & Gap Closure Review

## Source Documents

- `data-gap-analysis-2026-02-22.md`: A comprehensive audit of all data capture blindspots across the Legends XML parser, live bridge, and storyteller retrieval layers, with proposed solutions organized by priority tier.
- `gap-closure-critical-review.md`: A post-implementation critical review that reveals ~70% of the gap analysis plan was already completed, reorders priorities around data integrity (composite PKs, kill_count bug, link table deduplication), and introduces 5 newly discovered bugs.

---

## Features & Requirements

### Core Storyteller Capabilities

- **AI Dwarf Fortress Storyteller**: LLM-powered narration using retrieved Legends XML and live fortress data as context.
- **Persona**: Speaks as "The Chronicler" with gravitas. Never fabricates facts that contradict records. Says "The annals hold no record" rather than inventing.
- **Dual-tier context**: System prompt distinguishes HISTORICAL (Legends XML) from LIVE (bridge) data. Context budget is 12,000 characters.
- **Contextual reconstruction**: Derive full narrative from sparse data (emotion → cause → corpse → zone → death event = "Urist McAxedwarf was horrified after witnessing the corpse of Bomrek Hammerfist lying in the tavern. Bomrek had been killed by the goblin Snodub Evilteeth during the siege of year 253.").
- **Pre-resolved narrative-ready unit data**: Bridge should resolve raw IDs and coordinates into names and zone names before delivering to LLM.

### Legends XML Data Capture

- **Sections to parse (target: 12+ of 14 top-level sections)**:
  - Currently parsed (8): `<sites>`, `<artifacts>`, `<historical_figures>`, `<entities>`, `<historical_events>`, `<historical_event_collections>`, `<landmasses>` (legends_plus), `<mountain_peaks>` (legends_plus)
  - Schema exists but unpopulated: `<regions>`, `<underground_regions>`, `<world_constructions>`
  - Not yet implemented: `<entity_populations>`, `<historical_eras>`, `<poetic_forms>`, `<musical_forms>`, `<dance_forms>`
  - legends_plus parsed: `<identities>`, `<historical_event_relationships>`
  - legends_plus NOT parsed: `<written_contents>` (books, poems, treatises), `<rivers>`, `<creature_raw>`

- **Historical Figure sub-profiles** (not currently extracted, high storytelling value):
  - Kill profile: species killed, counts, underground/surface/site context
  - Wound history: body parts lost, injuries sustained ("the one-armed warrior")
  - Skill history: professions held with year ranges ("started as a peasant, became a legendary axedwarf")
  - Personality: traits (50 values), values (32 values), beliefs, goals
  - Whereabouts: last known location, body state (buried/unburied)
  - Reputation: criminal records, exile flags
  - Known secrets: supernatural knowledge, read books

- **Written Contents** (books, poems, scrolls, treatises): title, author HF ID, year composed, type, subject matter, referenced art forms. Storytelling value: HIGH ("Urist composed 'The Ballad of the Flaming Hammers' in year 237").
- **Historical Eras**: name, type, start/end year. Enables temporal context ("During the Age of Myths (years 1-200)...").
- **Regions and underground regions**: geographic context for events and narratives.
- **World constructions**: bridges, roads, and other constructed geographic features.

### Live Bridge Data Capture (chronicler-bridge.lua)

- **Currently captured (v6, 16 sections)**: game_time, creature_raws, unit_summary (12 fields + flags + mood + emotions), armies (capped 50), buildings (count + type distribution), artifacts (capped 200), announcements (cursor-based, capped 200/tick), diplomacy, history (cursor-based, capped 100/tick, with payloads), world_info, entities (capped 100), dwarf_skills, dwarf_emotions, zones (civzones with bounds, up to 200), event_collections (last 50), squads, mandates, crimes.

- **Unit data still not captured** (available in `df.global.world.units.active[]`):
  - Health wounds vector (body parts, severity)
  - Inventory / equipped items with worn/held slots
  - `birth_year`, `old_year` (age and expected death from old age)
  - `relationship_ids[9]` indexed by unit_relationship_type
  - `following` (currently following which unit)
  - Full personality needs vector (unmet psychological needs)
  - Full personality memories vector (notable life memories)
  - Full personality preferences vector (foods, metals, activities liked)

- **World structures not yet captured**:
  - `world.activities` (10-50): parties, performances, scholarly work, training
  - `world.written_contents.all` (0-100): library contents, books authored in fortress
  - `world.jobs.list` (50-200): current workshop orders, construction tasks
  - `world.manager_orders` (0-30): standing work orders
  - `world.items.all` (1,000-100,000+): item locations, corpses, equipment (HIGH perf risk — corpse subset is safe)
  - `world.plants.all` (100-5,000): farm plots, surface vegetation (low priority)
  - `world.interactions` (0-20): active curses, magic effects
  - `world.identities` (0-10): secret identities (vampire covers, etc.)
  - `world.occupations` (0-50): scholar/performer roles
  - `world.belief_systems` (1-5): religious belief systems

- **Spatial data not captured**:
  - Individual building footprints: each building has `x1, y1, x2, y2, z` bounds (currently only type counts captured)
  - Corpse spatial data: `item_corpse.pos.x/y/z`, `hist_figure_id`, `unit_id`, `race`, `caste`, `sex`, `rot_timer`

### Announcement / Event Lossless Capture

- **Report cursor tracking** (T1-1): Track `last_seen_report_id`; fetch all reports with `id > last_seen_report_id` each tick (cap 200). Makes announcement capture lossless across all 250+ announcement types. STATUS: DONE.
- **History event cursor tracking** (T1-4): Track `last_seen_event_id`; fetch all new events since last poll (cap 100/tick). STATUS: DONE.
- **History event payloads** (T1-3): Extract key fields from event structs by type — at minimum hf_id_1, hf_id_2, site_id, artifact_id, entity_id, victim, slayer, reason. STATUS: DONE.
- **gamelog.txt as backup/validation**: Plain-text mirror of on-screen announcements at `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\gamelog.txt`, accessible via HTTP at `curl http://192.168.4.194:8888/gamelog.txt`. No structured metadata. Use for gap-filling if bridge crashes and `world.status.reports` cursor is stale; requires tail-based reading (track file offset).

### Psychology / Emotion Capture

- **Emotion/thought capture** (T2-1): Per-dwarf `emotions[]` vector. Each emotion has: type (ANGER, FEAR, JOY, GRIEF, etc.), thought type (200+ unit_thought_type values), subthought (ID reference to specific HF/event as cause), strength, relative_strength, severity, year, year_tick, flags (was_dream_goal, vocalized). STATUS: DONE (10 most recent emotions per dwarf).
- **Emotional subthought linkage**: The `subthought` field directly links an emotion to its specific cause — this is the key to contextual reconstruction.
- **Unit flags** (T1-2): `has_mood`, `mood` (enum: Fey, Possessed, Macabre, Berserk, Melancholy), `in_tantrum`, `ghostly`, `active_invader`, `pregnancy_timer`, `pregnancy_spouse`, `emotionally_overloaded`. STATUS: DONE.
- **Needs vector**: Unmet psychological needs (alcohol, social interaction, etc.). Currently captured in unit_summary as resolved text.
- **Change detector events**: MOOD_CHANGED, MOOD_RESOLVED, GHOST, PREGNANCY_DETECTED, STRESS_SPIKE. STATUS: DONE (11 event types total across core and bridge paths).

### Spatial / Zone Resolution

- **Zone capture** (T2-2): All `building_civzonest` entries with type, x1/y1/x2/y2/z bounds, names, up to 200. STATUS: DONE.
- **Location resolution**: Resolve unit `pos.x/y/z` against zone bounds to yield human-readable room name. Zone type → name mapping: MeadHall→"the tavern", Temple→"the temple", Bedroom→"their bedroom", DiningHall→"the dining hall", Barracks→"the barracks", Tomb→"the catacombs", Dungeon→"the dungeon", Office→"the office", Library→"the library", NobleQuarters, Shop, Guildhall, Kitchen, CaptiveRoom, ThroneRoom, Depot.
- **"Whose dead body?" full reconstruction**: Emotion (WitnessDeath + subthought HF_ID) → corpse location (item_corpse.pos where hist_figure_id matches) → room context (zone bounds match) → observer location (unit.pos at time of emotion) → death event (history_events where event_type = HIST_FIGURE_DIED and hf_id_1 = HF_ID).

### Storyteller Retrieval

- **Current retrieval architecture**: keyword extraction (stop-word filtering, 200+ words, no NLP) → categorical routing (_CATEGORY_ROUTES, 23 keyword routes) → ILIKE name search (limit 5 per table) → fallback `_world_overview()` → format_context (12,000 char budget) → build_messages → LLM (Qwen3 8B via LiteLLM, temp 0.8, max 2048 tokens).
- **Live data retrieval paths** (5 implemented): units table, unit_events, game_reports, lua_probes snapshots (armies, diplomacy, announcements), plus join of units.hist_fig_id to historical_figures. STATUS: DONE.
- **Categorical routes**: "deity" → historical_figures WHERE is_deity=TRUE; "dragon" → historical_figures WHERE race LIKE 'DRAGON%'; "civilization" → entities WHERE type='civilization'; "war"/"battle" → history_event_collections WHERE type=...
- **Relationship traversal** (T2-5 / Phase 2.1): When HF is matched by name, also query hf_links (spouse, children, parents, master/apprentice), hf_entity_links (civilization memberships, position titles), hf_site_links (residences, lairs, associated sites). STATUS: NOT YET DONE.
- **Event payload enrichment in retrieval** (Phase 2.2): JOIN history_events to historical_figures and sites to resolve IDs into names inline. Transforms raw IDs into "Bomrek was slain by Urist at Goldenhall in year 253." STATUS: NOT YET DONE.
- **Emotion and zone data in live unit queries** (Phase 2.3): Enhance `_retrieve_live_units()` to pull emotion data from latest `dwarf_emotions` probe and resolve unit positions to zone names from latest `zones` probe. STATUS: NOT YET DONE.
- **War name resolution** (T3-8 / Phase 2.4): JOIN attacker_entity_id and defender_entity_id to `entities.name` in war/battle collection queries. STATUS: NOT YET DONE.
- **Confidence signaling** (T3-7 / Phase 2.5): Count context records and chars; if sparse (< 3 records or < 500 chars) prepend "Context is limited — note uncertainty"; if rich (> 10 records) prepend "Rich context available — synthesize comprehensively." STATUS: NOT YET DONE.
- **pgvector / embedding-based retrieval** (T4-5): `embeddings` table and pgvector infrastructure exist but are unused. All retrieval is currently keyword-based. Long-term: wire up for semantic search.

### DFHack Event Hooks (Push-Based Alternative)

- **DFHack event callbacks**: `dfhack.onStateChange` for game state transitions, `EventManager` for specific event type callbacks (UNIT_DEATH, CONSTRUCTION, etc.). These provide push-based event detection with no polling gap.
- **Requirements**: Persistent Lua plugin (not a `repeat` script), more complex to implement and debug.
- **Target use case**: Critical events (deaths, mood starts, siege begins) where polling blindspot is unacceptable. Eliminates last remaining blindspot: intermediate states (berserk dwarf who dies within one poll window).

### Multi-World Architecture

- **Composite primary key requirement** (BUG-007): All 12 legends tables currently use `id INT PRIMARY KEY` where `id` is DF-internal and starts from 1 in every world. Multi-world imports cause silent data loss via `ON CONFLICT DO NOTHING`.
- **Affected tables with data loss metrics**: historical_figures (5,466 World 2 HFs lost = 19.5%), history_events (massive loss), sites (~1,800 lost), entities (most lost), artifacts (most lost), regions (all lost from World 2), underground_regions (all lost), history_event_collections (most lost), identities (most lost), landmasses (all lost), mountain_peaks (all lost), world_constructions (all lost).
- **Fix**: Migrate all legends tables to composite PKs `(world_id, id)`, update all foreign key references to include world_id, update import pipeline ON CONFLICT clauses, update all storyteller queries.

### Data Integrity Fixes

- **kill_count computation inverted** (BUG-005): Current query groups by `hf_id_1` (victim) instead of `hf_id_2` (killer) in death events. Result: kill_count is always 0 or 1, never a real kill count. `_world_overview()` "Notable figures" sort is corrupted. Fix: change `hf_id_1` to `hf_id_2` on xml_parser.py lines 710-711, then re-run computation.
- **Link table duplicate accumulation** (BUG-006): `hf_links`, `hf_entity_links`, `hf_site_links` use SERIAL PRIMARY KEY. Because SERIAL always generates a new key, `ON CONFLICT DO NOTHING` never triggers. Re-importing the same world appends exact duplicates, causing duplicate relationships in storyteller output.
- **Boolean flags all FALSE — FIXED** (BUG-001 / REFL-023): Originally ALL boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`, `is_ghost`) were FALSE across all 55,321 historical figures. Root cause: parser needed to detect via spheres (deity), interactions (vampire), and other indirect signals. STATUS: FIXED in xml_parser.py lines 159-183.
- **Site ownership NULL — FIXED** (BUG-003): All `owner_entity_id` were NULL. Fix: parse `cur_owner_id` from legends_plus.xml entity_site_links. STATUS: FIXED — 1,145/1,899 World 2 sites now have owners.
- **Multi-participant events truncated** (BUG-002): Events with multiple HFs (battles with 10+ participants) store only first `hf_id_1` and `hf_id_2`. Additional participant IDs go to JSONB `details` but are not indexed. Fix: collect ALL participant HF IDs into a `participants` JSONB array or create an `event_participants` junction table.
- **Region parsing scope risk** (BUG-008): `_parse_regions()` uses `root.findall(".//region")` which matches ALL `<region>` tags anywhere in document, including inside `<site>` elements. May insert spurious region records. Fix: scope to `root.findall("regions/region")`.

### Operational / Infrastructure Requirements

- **lua_probes unbounded growth** (DESIGN-001): Each watcher poll inserts 16 rows (one per bridge section) every 30 seconds = 32 rows/minute, 1,920/hour, 46,080/day. No TTL, no cleanup, no deduplication. Fix options: (a) delete rows older than N hours keeping latest per probe_name, (b) UPSERT with `UNIQUE (world_id, probe_name)` ON CONFLICT DO UPDATE, (c) configurable retention policy for time-series value (keep all last 24 hours, then hourly for older data).
- **Bridge health monitoring**: Track consecutive bridge fetch failures; log warning after 3 failures; continue with core-only data (fallback already handled); resume bridge polling when HTTP server returns.
- **Migration framework** (Phase 4.4): For future schema changes — `chronicler/db/migrations/` directory with numbered SQL files, `migrations` table tracking applied, CLI command `chronicler migrate`. Not urgent (pre-1.0, single operator) but reduces risk of future schema changes.

### Test Coverage

- **Zero test coverage** currently (MEDIUM severity).
- **Target test files**:
  - `test_xml_parser.py`: Parsing correctness, boolean detection, field mapping — HIGH priority
  - `test_context.py`: Keyword extraction, category routing, query generation — HIGH priority
  - `test_schema.py`: Schema integrity, FK constraints, composite PKs — HIGH priority
  - `test_detector.py`: Change detection across snapshots — MEDIUM priority
  - `test_bridge.py`: Bridge accessor parsing, version detection — MEDIUM priority
- **Minimum viable test set**:
  - Parse small test XML with known deities/vampires, verify boolean flags
  - Verify kill_count computation with known event data
  - Verify keyword routing maps to correct query types
  - Verify composite PK prevents cross-world collisions

---

## Implementation Details

### DF Data Structures

- **93 top-level `df.global.world` fields** available; bridge reads ~16 sections.
- **141 history event types** with structured payloads. Key event types and their fields:
  - `HIST_FIGURE_DIED`: victim HF, killer HF, cause, weapon, site
  - `ARTIFACT_CREATED`: creator HF, item type, material, method (mood/craft), site
  - `ADD_HF_HF_LINK`: both HF IDs, link type (spouse/child/lover)
  - `CHANGE_HF_MOOD`: HF ID, mood type
  - `WAR_ATTACKED_SITE`: attacker entity, defender entity, site
  - `MASTERPIECE_CREATED_ITEM`: creator HF, item type, material, skill
  - `CREATED_SITE`: founding entity, site location
  - `CREATURE_DEVOURED`: eater HF, victim HF, site
  - `HF_ABDUCTED`: snatcher HF, victim HF, site
  - `ENTITY_OVERTHROWN`: overthrower HF, entity, position
- **250+ announcement types** in `world.status.reports` — append-only vector, NOT a ring buffer.
- **100+ unit fields per dwarf** in `df.global.world.units.active[]`.
- **19 event collection types**: WAR, BATTLE, DUEL, SITE_CONQUERED, ABDUCTION, THEFT, BEAST_ATTACK, JOURNEY, INSURRECTION, OCCASION, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, PURGE, RAID, PERSECUTION, ENTITY_OVERTHROWN, and more in v53+.
- **200+ unit thought types**: WitnessDeath, UnexpectedDeath, Death, SawDrinkingBlood, Conflict, ConflictWithAnimal, LoveSeparated, LoveReunited, AcquiredItem, LostItem, NiceRoom, UglyRoom, AteInDiningRoom, AteOutside, SleptInBedroom, SleptOnGround, RainedOn, CaughtInStorm, Conversation, NiceConversation, Argument, FightStarted, FriendDied, PetDied, RelativesDied, MadeMasterpiece, ProducedArtifact, CompletedGreatProject, ResearchBreakthrough.
- **128-bit unit flags** across 4 bitfields: has_mood (flags1), active_invader (flags1), merchant (flags1), diplomat (flags1), caged (flags1), killed/inactive (flags1/2), drowning (flags2), emotionally_overloaded (flags2), announce_titan (flags2), ghostly (flags3), in_tantrum (flags3).

### Proposed Unified Query (Storyteller — "Tell me about Urist")

```sql
-- 1. Historical figure record
SELECT * FROM historical_figures WHERE name ILIKE '%urist%';

-- 2. Current living status
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

-- 5. Key events with payloads (post-Phase 2 with world_id and name resolution)
SELECT he.year, he.event_type, he.details,
       hf1.name as subject, hf2.name as object, s.name as site_name
FROM history_events he
LEFT JOIN historical_figures hf1 ON he.hf_id_1 = hf1.id AND he.world_id = hf1.world_id
LEFT JOIN historical_figures hf2 ON he.hf_id_2 = hf2.id AND he.world_id = hf2.world_id
LEFT JOIN sites s ON he.site_id = s.id AND he.world_id = s.world_id
WHERE (he.hf_id_1 = $1 OR he.hf_id_2 = $1) AND he.world_id = $2
ORDER BY he.year DESC LIMIT 10;

-- 6. Current emotions (from lua_probes dwarf_emotions section)
```

### kill_count Fix

```sql
-- WRONG (current — groups by victim):
SELECT hf_id_1 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_1

-- CORRECT (group by killer):
SELECT hf_id_2 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_2
```

File: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` lines 710-711.

### Link Table UNIQUE Constraints (BUG-006 Fix)

```sql
ALTER TABLE hf_links ADD CONSTRAINT uq_hf_links UNIQUE (hf_id, target_hf_id, link_type);
ALTER TABLE hf_entity_links ADD CONSTRAINT uq_hf_entity_links UNIQUE (hf_id, entity_id, link_type);
ALTER TABLE hf_site_links ADD CONSTRAINT uq_hf_site_links UNIQUE (hf_id, site_id, link_type);
```

Must deduplicate existing data before applying constraints.

### Composite PK Migration Schema

```
historical_figures    → PRIMARY KEY (world_id, id)
history_events        → PRIMARY KEY (world_id, id)
sites                 → PRIMARY KEY (world_id, id)
entities              → PRIMARY KEY (world_id, id)
artifacts             → PRIMARY KEY (world_id, id)
regions               → PRIMARY KEY (world_id, id)
underground_regions   → PRIMARY KEY (world_id, id)
history_event_collections → PRIMARY KEY (world_id, id)
identities            → PRIMARY KEY (world_id, id)
landmasses            → PRIMARY KEY (world_id, id)
mountain_peaks        → PRIMARY KEY (world_id, id)
world_constructions   → PRIMARY KEY (world_id, id)
```

Child table FK updates required:
```
structures          → REFERENCES sites(world_id, id)  ← PK becomes (world_id, site_id, id)
hf_links            → both hf_id and target_hf_id need (world_id, hf_id) refs
hf_entity_links     → hf_id needs (world_id, hf_id), entity_id needs (world_id, entity_id)
hf_site_links       → hf_id needs (world_id, hf_id), site_id needs (world_id, site_id)
collection_events   → both FKs need world_id prefix
collection_subcollections → both FKs need world_id prefix
event_relationships → source_hf, target_hf need world_id
```

Design decision: explicit `world_id` on every table (denormalized but enables direct queries without JOINs, consistent with existing pattern).

### Written Contents Schema (Phase 3.2)

```sql
CREATE TABLE IF NOT EXISTS written_contents (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    title       TEXT,
    author_hf_id INT,
    type        TEXT,
    form_id     INT,
    year        INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

### Historical Eras Schema (Phase 3.3)

```sql
CREATE TABLE IF NOT EXISTS historical_eras (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,
    start_year  INT,
    end_year    INT,
    PRIMARY KEY (world_id, id)
);
```

### lua_probes Cleanup Query (Phase 4.2)

```python
await conn.execute("""
    DELETE FROM lua_probes
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY world_id, probe_name
                ORDER BY captured_at DESC
            ) AS rn
            FROM lua_probes
        ) sub WHERE rn <= $1
    )
""", keep_count)  # e.g., keep_count=10
```

### Zone Location Resolution (Lua)

```lua
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

### Enriched Unit Data Model (Target JSON Format)

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

### War Name Resolution Query (Phase 2.4)

```sql
SELECT hec.name, hec.start_year, hec.end_year,
       a.name as attacker, d.name as defender
FROM history_event_collections hec
LEFT JOIN entities a ON hec.attacker_entity_id = a.id AND hec.world_id = a.world_id
LEFT JOIN entities d ON hec.defender_entity_id = d.id AND hec.world_id = d.world_id
WHERE hec.world_id = $1 AND hec.type = 'war'
ORDER BY hec.start_year DESC LIMIT 10
```

### Polling Timing Risk Matrix (Selected High-Risk Events)

| Event Category | Persistent? | Announcement? | Risk of Missing |
|----------------|-------------|---------------|-----------------|
| Marriage | YES (HF link) | YES | HIGH — no HF link tracking, announcement may overflow |
| Strange mood | YES (flag set) | YES | HIGH — now captured via flag extraction |
| Tantrum | TRANSIENT (flag) | YES | HIGH — flag now captured, announcement cursor prevents loss |
| Mandate issued | YES (mandate created) | YES | HIGH — now tracked via mandates section |
| Crime committed | YES (incident created) | YES | HIGH — now tracked via crimes section |
| Noble appointment | YES (position assigned) | YES | HIGH — no position tracking |
| Outside-world war event | YES (history event) | NO | HIGH — now captured via event cursor + payloads |
| Loyalty cascade | FAST TRANSIENT | YES (multiple) | HIGH — cascade causality still may be lost |
| Forgotten beast arrival | YES (unit appears) | YES | MEDIUM — detected as unit, type unclear |
| Intermediate states (berserk then dead in same poll) | N/A | YES | MEDIUM — both announcement and death captured, berserk snapshot missed |

### Migration Execution Strategy (Phase 1.5)

No migration framework exists. Safe approach:
1. `pg_dump -Fc chronicler > chronicler-backup.dump`
2. Apply new schema.sql (DROP + CREATE)
3. Re-import all worlds from XML sources
4. Verify record counts match pre-migration totals (adjusted for previously-lost records)

---

## Status & Completion

### Completed (Were Listed as TODO in Original Gap Analysis)

| Plan Item | Status | Evidence |
|-----------|--------|----------|
| T1-1: Report cursor tracking | DONE | `chronicler-bridge.lua:252` — cursor-based, capped 200/tick |
| T1-2: Unit flag extraction | DONE | `chronicler-bridge.lua:83` — mood, tantrum, ghostly, pregnancy, stress |
| T1-3: History event payloads | DONE | `chronicler-bridge.lua:337` — extracts hfid/site/victim/slayer/reason |
| T1-4: History event cursor | DONE | `last_seen_event_id` global, 100/tick cap |
| T2-1: Emotion/thought capture | DONE | `chronicler-bridge.lua:522` — per-dwarf emotions, 10 most recent |
| T2-2: Zone data capture | DONE | `chronicler-bridge.lua:574` — civzones with bounds, up to 200 |
| T2-4: Event collection capture | DONE | `chronicler-bridge.lua:630` — last 50 collections |
| T3-1: Squads + mandates + crimes | DONE | Lines 704, 767, 813 — all three sections |
| Phase 2: bridge.py accessors | DONE | `bridge.py` — 24 accessor functions for all 16 sections |
| Phase 2: change detector expansion | DONE | `detector.py` — MOOD_CHANGED, MOOD_RESOLVED, GHOST, PREGNANCY_DETECTED, STRESS_SPIKE |
| Phase 2: watcher bridge storage | DONE | `watcher.py:90-94` — stores all 16 sections to lua_probes |
| Phase 3: live data retrieval | DONE | `context.py:392-553` — 5 retrieval functions + 23 keyword routes |
| Phase 3: system prompt update | DONE | `prompts.py` — dual-tier (HISTORICAL + LIVE), 12,000 char budget |
| Phase 4: boolean flag fix (BUG-001) | DONE | `xml_parser.py:159-183` — spheres, interactions, knowledge detection |
| Phase 4: site ownership (BUG-003) | DONE | `xml_parser.py:686-696` — cur_owner_id from legends_plus; 1,145/1,899 sites have owners |

### Remaining Work (Revised Priority Order)

| Item | Severity | New Phase | Effort |
|------|----------|-----------|--------|
| 0.1 Fix kill_count computation (BUG-005) | CRITICAL | Phase 0 | LOW (5 lines) |
| 0.2 Add link table UNIQUE constraints (BUG-006) | HIGH | Phase 0 | MEDIUM |
| 0.3 Fix region parsing scope (BUG-008) | MEDIUM | Phase 0 | LOW (1 line) |
| 1.x Composite PK migration (BUG-007) | CRITICAL | Phase 1 | HIGH (4-6 hours) |
| 2.1 Relationship traversal in storyteller | MEDIUM | Phase 2 | MEDIUM |
| 2.2 Event payload enrichment in storyteller | MEDIUM | Phase 2 | MEDIUM |
| 2.3 Emotion/zone data in live unit queries | MEDIUM | Phase 2 | MEDIUM |
| 2.4 War name resolution | LOW | Phase 2 | LOW |
| 2.5 Confidence signaling in prompts | LOW | Phase 2 | LOW |
| 3.1 Verify / fix region parsing | LOW | Phase 3 | LOW |
| 3.2 Written contents table + parser | LOW | Phase 3 | MEDIUM |
| 3.3 Historical eras table + parser | LOW | Phase 3 | MEDIUM |
| 3.4 Entity populations parsing | LOW | Phase 3 | MEDIUM (optional) |
| 3.5 Art forms (poetic/musical/dance) | LOWEST | Phase 3 | LOW (only if written_contents reveals refs) |
| 4.1 Core test suite | MEDIUM | Phase 4 | HIGH |
| 4.2 lua_probes cleanup | LOW | Phase 4 | LOW |
| 4.3 Bridge health monitoring | LOW | Phase 4 | LOW |
| 4.4 Migration framework | LOW | Phase 4 | MEDIUM (optional, pre-1.0) |

### Outstanding Verifications Needed

| Assumption | Verification Method |
|-----------|---------------------|
| `event_type = 'hf died'` matches DF XML output | Check actual XML event type text values |
| Region parsing captures spurious elements | Grep XML for `<region>` tags outside `<regions>` section |
| World 2 has ~28K HFs (5,466 lost = 19.5%) | Re-import World 2 in isolation and count |
| Written contents exist in our legends_plus XML | Check XML file for `<written_contents>` section |
| Kill count fix + re-computation is sufficient | Verify no cached/derived data depends on old kill_count values |

---

## Key Decisions & Design Choices

- **Data integrity before features**: The revised plan inverts the original priority order. Composite PKs, kill_count fix, and link deduplication are done before any new features — everything else builds on potentially corrupt foundations without these fixes.
- **Original plan ~70% already implemented**: 15 of 22 original plan items are complete. The plan should not be re-executed as written — it would duplicate existing work. Revised phases (0-4) replace the original phases (1-4).
- **Same ID space between legends and live data**: `world.history.events` is one vector — legends XML and live fortress events use identical IDs. This means event IDs from XML import should match event IDs readable from live memory, enabling a unified `history_events` timeline table.
- **Append-only reports vector**: `world.status.reports` is NOT a ring buffer. It is append-only with unique IDs, enabling cursor-based lossless capture.
- **Explicit world_id on every table**: Denormalized (world_id on child tables rather than inheriting through FK chain), but enables direct queries without JOINs and is consistent with existing schema pattern.
- **Phase 3 XML completeness is independent of Phase 2**: XML parser changes don't depend on storyteller query changes; both depend on Phase 1 composite PK schema.
- **Pre-resolved narrative-ready bridge data**: Bridge should resolve IDs (HF names, zone names) inline in Lua rather than leaving resolution to the Python or LLM layer. This means the LLM receives usable context without ID lookups.
- **lua_probes time-series vs. UPSERT tradeoff**: Keep INSERT-only (time-series history) if time-series analysis of fortress state is valuable, then add configurable archival; switch to UPSERT if only current snapshot is needed.
- **DFHack push-based hooks are long-term, not current**: EventManager callbacks would eliminate polling blindspots entirely for critical events but require a persistent Lua plugin (significantly more complex than the current `repeat` script model). Deferred to Tier 4 / long-term.
- **Multi-participant events**: Battles with 10+ participants currently lose data beyond the first two HF IDs (stored in JSONB but not indexed). Design decision pending: JSONB array `participants` vs. junction table `event_participants`.
- **gamelog.txt as tertiary backup**: Lower priority than structured report capture. Valid for gap-filling only if bridge crashes and cursor is stale.
- **LLM hallucination control**: "Never fabricate facts that contradict records" allows LLM to freely ADD details when records are silent. Confidence signaling (Phase 2.5) is the designed mitigation.

---

## Metrics & Targets

- **Current data capture coverage**: ~15-20% of available DF data.
- **DF data dimensions**: 93 top-level `df.global.world` fields, 141 history event types, 250+ announcement types, 100+ unit fields per dwarf.
- **Bridge sections**: v6 with 16 data domains (was 11 in original gap analysis assumptions).
- **Legends XML sections parsed**: 8 of 14+ top-level (target: 12+).
- **World 1 historical figures**: 26,917 records.
- **World 2 historical figures**: ~28,383 expected; 5,466 lost to PK collision (19.5%) under current schema.
- **Sites**: 1,899 total; 1,145/1,899 World 2 sites have owner_entity_id (60%), 754 still NULL.
- **Total historical figures (both worlds)**: 55,321 (with current data loss).
- **Storyteller context budget**: 12,000 characters (was 8,000 per original plan).
- **Live data retrieval paths**: 5 functions + 23 keyword routes.
- **Change detector event types**: 11 total.
- **lua_probes growth rate**: 32 rows/minute, 1,920/hour, 46,080/day at 30-second poll interval with 16 sections.
- **Bridge v6 line count**: 922 lines (Lua).
- **xml_parser.py line count**: 733 lines.
- **context.py line count**: 723 lines.
- **watcher.py line count**: 355 lines.
- **detector.py line count**: 246 lines.
- **bridge.py line count**: 308 lines (24 accessor functions).
- **schema.sql line count**: 378 lines.
- **kill_count fix effort**: ~5 lines, 1-line change to group-by target.
- **Phase 0 estimated effort**: ~1 hour total.
- **Phase 1 (composite PKs) estimated effort**: 4-6 hours.
- **Phase 2 (storyteller enrichment) estimated effort**: 3-4 hours.
- **Phase 3 (XML completeness) estimated effort**: 2-3 hours.
- **Phase 4 (operational hardening) estimated effort**: 4-6 hours.
- **Minimum test coverage goal**: 5 test files covering parser, context, schema, detector, bridge accessor.

---

## Key File Paths

| Component | Path |
|-----------|------|
| Lua bridge (v6, 922 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| XML parser (733 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| Context retriever (723 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` |
| System prompts (93 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py` |
| Watcher (355 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change detector (246 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Bridge accessor (308 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| DB schema (378 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| RPC client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py` |
| Sync | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py` |
| LLM client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/llm.py` |
| API routes | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/storyteller.py` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| Deploy bridge | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/experiments/deploy-bridge.py` |
| DF structures reference | `/Users/nathanielcannon/Claude/GitRepos/df-structures/` |
| Source: gap analysis | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/data-gap-analysis-2026-02-22.md` |
| Source: gap closure review | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/gap-closure-critical-review.md` |
| HomeServer | `192.168.4.194` (HTTP: 8888, DFHack RPC: 5000) |

---

*Consolidated from: data-gap-analysis-2026-02-22.md (v1.0, Session 32) + gap-closure-critical-review.md (v1.0, Session 32)*
*Consolidation date: 2026-02-24*
