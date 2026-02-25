# Component Research: Common Data Model (CDM) & Database System

**Date**: 2026-02-25
**Component**: CDM & Database Architecture
**Scope**: PostgreSQL schema design, all CDM entity tables, composite primary keys, multi-world support, JSONB details columns, field mapping from DF structures, unit-HF data merge, fortress_denizens registry, entity positions, knowledge_horizon views, indexes, constraints, migration strategies, data integrity, and the overall database architecture.

**Sources**: planning-history.md, dfhack-infrastructure-research.md, legendsviewer-next-research.md, legends-browsers-research.md, worldgen-scraping-research.md, dwarven-surveyor-scripts-research.md, research-synthesis.md, schema.sql (live), unit-hf-field-mapping.md, knowledge-horizon.md

---

## 1. Complete Schema Inventory

### 1.1 Database Configuration

**Database**: PostgreSQL 16 (localhost:5432, database name `chronicler`)
**Extensions**:

```sql
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector for embedding storage (2560-dim)
CREATE EXTENSION IF NOT EXISTS unaccent;  -- Diacritic-tolerant search
```

**Key architectural decisions**:
- Composite primary keys `(world_id, id)` on all legends tables for multi-world support
- `JSONB DEFAULT '{}'` columns named `details` on most tables for overflow/unmapped fields
- Event types stored as `TEXT` (no DB enum) -- raw data in `details` JSONB
- `importance_score FLOAT DEFAULT 0.0` on HFs, sites, artifacts for LLM context selection
- Live data (units, events, reports, probes) stored alongside legends data in the same database

### 1.2 World Metadata Tables

#### `worlds` -- Root container for each imported world

```sql
CREATE TABLE IF NOT EXISTS worlds (
    id          SERIAL PRIMARY KEY,
    name        TEXT,
    alt_name    TEXT,
    import_path TEXT,
    imported_at TIMESTAMPTZ DEFAULT now()
);
```

**Notes**: Auto-incrementing surrogate key. Each legends XML import creates a new world row. The `name` field stores the Dwarvish name; `alt_name` stores the English translation. `import_path` records the file path of the original XML for provenance.

**Current data**: World 1 = "Namoram" (5,466 HFs, 29,682 events), World 2 = "Ormon" (55,321 HFs, 566,973 events), World 8 = "Thadar En" / "Namoram" (active live world, "The Land of Dawning", 48,366 HFs, 442,716 events).

### 1.3 Geography Tables

#### `regions` -- Surface geographic regions

```sql
CREATE TABLE IF NOT EXISTS regions (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,           -- biome type: Wetland, Forest, Grassland, Hills, Desert,
                                --   Lake, Tundra, Glacier, Ocean, Mountains (10 types)
    coords      TEXT,           -- pipe-delimited coordinate list from legends_plus.xml
    PRIMARY KEY (world_id, id)
);
```

**Parsing fix (BUG-008)**: Changed XPath from `.//region` to `regions/region` and `.//underground_region` to `underground_regions/underground_region`. Verified: 240/240 regions and 125/125 underground_regions match.

**Missing field from DwarvenSurveyor**: `evilness` -- string field from legends_plus.xml indicating region alignment (good/evil/neutral). Currently not stored; should be added.

**Coordinate format**: legends_plus.xml encodes region tile coordinates as pipe-delimited `x,y|x,y|x,y` strings. DwarvenSurveyor's `ParseCoordinates` method provides a clean reference for parsing this into an array of `Vector2Int`.

#### `underground_regions` -- Underground cavern/hell layers

```sql
CREATE TABLE IF NOT EXISTS underground_regions (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    type        TEXT,
    depth       INT,
    coords      TEXT,
    PRIMARY KEY (world_id, id)
);
```

**Data fix**: Underground_regions backfilled with type/depth from legends.xml. All 1,570 underground_regions corrected (0 NULLs remaining).

#### `sites` -- All world sites (fortresses, hamlets, lairs, vaults, etc.)

```sql
CREATE TABLE IF NOT EXISTS sites (
    id              INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    name            TEXT,
    type            TEXT,           -- 24 distinct types (see taxonomy below)
    coord_x         INT,
    coord_y         INT,
    coords          TEXT,           -- raw coordinate string
    owner_entity_id INT,            -- current owning entity
    importance_score FLOAT DEFAULT 0.0,
    details         JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**Site Type Taxonomy (24 distinct types)**:
Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress, Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery, Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace, Ruins, Shrine, Tomb, Tower, Town, Vault.

**Site Importance Score (df-narrator formula)**: `event_count + (death_count * 2) + (event_collection_count * 5) + (structure_count * 3)`

**Owner fix (BUG-003)**: Fixed from `legends_plus` `cur_owner_id` field.

**DwarvenSurveyor note**: Sites have both a single `coord` (x,y) tile and a `rectangle` bounding box (xMin:yMin,xMax:yMax in world tiles / 16). The `rectangle` is stored in `details` JSONB, the single coord in `coord_x`/`coord_y`.

**Missing fields**: `owner_history` (list of OwnerPeriod records from LegendsViewer-Next), `site_properties` (individual property parcels per site), `ruin` flag (derived from destruction/reclaim events in post-parse processing).

#### `structures` -- Buildings within sites

```sql
CREATE TABLE IF NOT EXISTS structures (
    id          INT NOT NULL,
    world_id    INT NOT NULL,
    site_id     INT NOT NULL,
    name        TEXT,
    type        TEXT,           -- temple, guildhall, dungeon, tomb, mead_hall, etc.
    entity_id   INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, site_id, id),
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id)
);
```

**PK design**: Triple composite `(world_id, site_id, id)` because structure IDs are local to a site. FK references the composite site PK.

**Missing field**: `ruin` flag (derived from razed_structure events).

#### `landmasses`

```sql
CREATE TABLE IF NOT EXISTS landmasses (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    coord_1     TEXT,
    coord_2     TEXT,           -- bounding box corners
    PRIMARY KEY (world_id, id)
);
```

#### `mountain_peaks`

```sql
CREATE TABLE IF NOT EXISTS mountain_peaks (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    coords      TEXT,
    height      INT,
    PRIMARY KEY (world_id, id)
);
```

**Missing field**: `is_volcano` flag (present in LegendsBrowser2).

#### `world_constructions` -- Roads, bridges, tunnels

```sql
CREATE TABLE IF NOT EXISTS world_constructions (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,           -- road, tunnel, bridge
    coords      TEXT,
    PRIMARY KEY (world_id, id)
);
```

**Status**: Table created but parser not yet populating it from XML.

### 1.4 Civilization & Organization Tables

#### `entities` -- Civilizations, religions, guilds, etc.

```sql
CREATE TABLE IF NOT EXISTS entities (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,           -- 15 distinct types (see taxonomy below)
    race        TEXT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**Entity Type Taxonomy (15 distinct types)**:
Civilization, Site Government, Nomadic Group, Migrating Group, Religion, Military Unit (mercenary/shadowy/versatile), Guild, Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang, Outcast, Semi-Megabeast, Mega-Beast, Unknown.

**Reference comparison**: LegendsViewer-Next models `Entity` with: `EntityType` enum (11 types: Civilization, NomadicGroup, SemiMegaBeast, MegaBeast, PerformanceTroupe, MercenaryCompany, Militia, Religion, Guild, Outcast, Unknown), `IsCiv` flag, `Race`, `SiteHistory`, `EntityPositions`, `EntityPositionAssignments`, `EntityPopulation`, `Parent/Groups` (hierarchy), `EntityOccasions`, `LineColor`, `EntityEntityLinks`.

**Missing from Chronicler CDM**: `parent_entity_id` (hierarchical entity relationships), `entity_populations` (population group data), `entity_occasions` (ceremonial occasions), `entity_honors`, `entity_weapons` (weapons list), `entity_links` (entity-to-entity links), `is_civ` flag, generated color for visualization.

#### `entity_positions` -- Noble/administrative position definitions

```sql
CREATE TABLE IF NOT EXISTS entity_positions (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,      -- local ID within entity (0, 1, 2...)
    name            TEXT,              -- generic name ("monarch", "general")
    name_male       TEXT,              -- gendered variant ("king")
    name_female     TEXT,              -- gendered variant ("queen")
    spouse          TEXT,              -- spouse title ("king consort")
    spouse_male     TEXT,
    spouse_female   TEXT,
    UNIQUE (world_id, entity_id, position_id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);

CREATE INDEX IF NOT EXISTS idx_entity_positions_entity
    ON entity_positions(world_id, entity_id);
```

**Data volumes**: 11,712 position definitions extracted.

**LegendsBrowser2 reference**: `EntityPosition` struct includes: `Id_`, `Name_`, `NameMale`, `NameFemale`, `Succession` (election, heir, etc.), `Spouse`, `Spouse2`, `MaxAge`. Missing from Chronicler: `succession`, `max_age`.

**Missing fields**: `succession` (election/heir/etc.), `max_age` (age limit for position).

#### `hf_position_links` -- HF-to-position assignments (historical + active)

```sql
CREATE TABLE IF NOT EXISTS hf_position_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    hf_id           INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,      -- references entity_positions.position_id
    start_year      INT,
    end_year        INT,               -- NULL = currently held
    UNIQUE (world_id, hf_id, entity_id, position_id, start_year),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);

CREATE INDEX IF NOT EXISTS idx_hf_position_links_hf
    ON hf_position_links(world_id, hf_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_entity
    ON hf_position_links(world_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_current
    ON hf_position_links(world_id, entity_id) WHERE end_year IS NULL;
-- Partial unique index: prevent duplicate active positions with NULL start_year
CREATE UNIQUE INDEX IF NOT EXISTS idx_hf_position_links_null_start_dedup
    ON hf_position_links(world_id, hf_id, entity_id, position_id)
    WHERE start_year IS NULL;
```

**Data volumes**: 13,501 active assignments + 41,199 historical links extracted.

**Partial index rationale**: PostgreSQL treats NULLs as distinct in UNIQUE constraints, so `UNIQUE (world_id, hf_id, entity_id, position_id, start_year)` would allow duplicate rows with `start_year IS NULL`. The partial unique index prevents this.

#### `identities` -- False identities assumed by HFs

```sql
CREATE TABLE IF NOT EXISTS identities (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    histfig_id  INT,
    birth_year  INT,
    birth_second INT,
    entity_id   INT,
    PRIMARY KEY (world_id, id)
);
```

**Missing fields**: `profession` (from LegendsViewer-Next Identity model), `race`, `caste`.

### 1.5 Historical Figures Tables

#### `historical_figures` -- Every named creature in history

```sql
CREATE TABLE IF NOT EXISTS historical_figures (
    id              INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    name            TEXT,
    race            TEXT,
    caste           TEXT,
    sex             SMALLINT,
    birth_year      INT,
    birth_seconds   INT,
    death_year      INT,
    death_seconds   INT,
    death_cause     TEXT,
    entity_id       INT,           -- primary civilization membership
    is_deity        BOOLEAN DEFAULT FALSE,
    is_force        BOOLEAN DEFAULT FALSE,
    is_vampire      BOOLEAN DEFAULT FALSE,
    is_necromancer  BOOLEAN DEFAULT FALSE,
    is_werebeast    BOOLEAN DEFAULT FALSE,
    is_ghost        BOOLEAN DEFAULT FALSE,
    kill_count      INT DEFAULT 0,
    event_count     INT DEFAULT 0,
    importance_score FLOAT DEFAULT 0.0,
    details         JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**HF Importance Score (df-narrator canonical formula)**:
```
events * 2 (cap 500) + kills * 15 + vampire(80) + necromancer(100) + deity(120) +
force(90) + megabeast(70) + HF_links * 3 (cap 100) + leadership_positions * 20 +
artifacts_held * 30 + spheres * 10 + skills_bonus (cap 80) + site_links * 5 (cap 50) +
entity_links * 3 (cap 60) + death_recorded(5)
```

**Boolean flag derivation**: Flags are NOT direct XML fields. They are derived during post-parse processing:
- `is_deity`: Detected from `histfig_flags.deity` or presence of spheres
- `is_force`: Detected from `histfig_flags.force`
- `is_vampire`: Derived from `HfDoesInteraction` events matching `DEITY_CURSE_VAMPIRE_*`
- `is_necromancer`: Derived from `HfLearnsSecret` events matching `SECRET_*`
- `is_werebeast`: Derived from `HfDoesInteraction` events matching `DEITY_CURSE_WEREBEAST_*`
- `is_ghost`: Detected from `histfig_flags.ghost`

**Kill count fix (BUG-005)**: Was LEFT JOIN'd to event_count (mirroring wrong count); was grouping by `hf_id_1` (victim) instead of `hf_id_2` (slayer). Fixed to independent UPDATE with correct grouping. Result: 8,680 figures updated, max kill count rose from 3 to 146.

**Fields present in df-structures but NOT in CDM** (high priority, from research-synthesis):
- `active_interactions` -- vampire/necromancer/werebeast detection string
- `spheres` -- deity domains (list of strings)
- `goals` -- life goals (list of strings)
- `skills` with XP points -- from `info.skills` profile
- `current_state` / `whereabouts` -- geographic location (state enum, site_id, subregion_id, body_state)
- `vague_relationships` -- loose social associations
- `relationship_profiles` -- visual/historical/identity profile with type label
- `entity_reputations` -- numeric scores for hero, murderer, monster, etc.
- `intrigue_actors` / `intrigue_plots` -- v0.47+ intrigue system
- `used_identities` / `current_identity` -- false identity tracking
- `journey_pets` -- pet list
- `holds_artifact` -- currently held artifact IDs
- `breed_id`, `cultural_identity`, `family_head_id`

**Fields present in df-structures but NOT in CDM** (medium priority):
- `orientation_flags`
- `curse_year` / `curse_seconds`
- `personality` -- values, ethics, mannerisms (70+ mannerism types)
- `knowledge_profile` -- known secrets, known books, belief systems
- `reputation_profile` -- wanted status, journey profile
- `appeared_year`
- `nemesis_id`
- `art_count`

**df-structures canonical field list** (from `df.history_figure.xml`):
Core identity: `profession`, `race`, `caste`, `sex`, `orientation_flags`, `appeared_year`, `born_year`, `born_seconds`, `curse_year`, `curse_seconds`, `old_year`, `old_seconds`, `died_year`, `died_seconds`, `name`, `civ_id`, `population_id`, `breed_id`, `cultural_identity`, `family_head_id`, `flags`, `unit_id`, `nemesis_id`, `id`, `art_count`

Link vectors: `entity_links` (polymorphic subtypes), `site_links` (polymorphic subtypes), `histfig_links` (polymorphic subtypes)

Profile pointer (`info`): `metaphysical`, `skills`, `pets`, `personality`, `masterpieces`, `whereabouts`, `kills`, `wounds`, `known_info`, `curse`, `books`, `reputation`, `relationships` (13 nullable sub-pointers)

Worldgen-specific: `worldgen_site`, `worldgen_region`, `worldgen_layer`, `worldgen_genetics`, `worldgen_relationships` (all null in fortress mode)

#### `hf_links` -- HF-to-HF relationships

```sql
CREATE TABLE IF NOT EXISTS hf_links (
    id           SERIAL PRIMARY KEY,
    world_id     INT NOT NULL,
    hf_id        INT NOT NULL,
    target_hf_id INT NOT NULL,
    link_type    TEXT,
    UNIQUE (world_id, hf_id, target_hf_id, link_type),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, target_hf_id) REFERENCES historical_figures(world_id, id)
);
```

**Dedup fix (BUG-006)**: 4,679 duplicate rows deduped. UNIQUE constraint `uq_hf_links` added. ON CONFLICT: DO NOTHING.

**HF-to-HF link types** (from df-structures `histfig_hf_link` subtypes):
Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion (+agreement_id), Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner.

**Missing fields**: `link_strength` (present in df-structures), `agreement_id` (for companions).

#### `hf_entity_links` -- HF-to-entity memberships

```sql
CREATE TABLE IF NOT EXISTS hf_entity_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    hf_id           INT NOT NULL,
    entity_id       INT NOT NULL,
    link_type       TEXT,
    position_name   TEXT,
    UNIQUE (world_id, hf_id, entity_id, link_type),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
```

**Dedup fix (BUG-006)**: 23 duplicate rows deduped. ON CONFLICT: DO UPDATE SET position_name.

**HF-to-Entity link types** (from df-structures `histfig_entity_link` subtypes):
Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position (+assignment_id, start_year), Former Position (+end_year), Position Claim, Occupation, Former Occupation, Squad, Former Squad.

**Missing fields**: `assignment_id`, `start_year`, `end_year` (for position/occupation links).

#### `hf_site_links` -- HF-to-site relationships

```sql
CREATE TABLE IF NOT EXISTS hf_site_links (
    id          SERIAL PRIMARY KEY,
    world_id    INT NOT NULL,
    hf_id       INT NOT NULL,
    site_id     INT NOT NULL,
    link_type   TEXT,
    UNIQUE (world_id, hf_id, site_id, link_type),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id)
);
```

**ON CONFLICT**: DO NOTHING.

**HF-to-Site link types** (from df-structures `histfig_site_link` subtypes):
Lair, Home Site (abstract/realization building/sul), Seat of Power, Hangout, Occupation, Prison (abstract_building/site_building_profile).

### 1.6 Events Tables

#### `history_events` -- All history events (legends + live-generated)

```sql
CREATE TABLE IF NOT EXISTS history_events (
    id              INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    year            INT,
    seconds         INT,
    event_type      TEXT,              -- 141 canonical types, stored as text
    -- Common FK columns covering ~95% of event subtypes
    hf_id_1         INT,               -- primary HF (attacker, doer, subject)
    hf_id_2         INT,               -- secondary HF (victim, target)
    site_id         INT,
    region_id       INT,
    entity_id_1     INT,               -- primary entity (attacker civ)
    entity_id_2     INT,               -- secondary entity (defender civ)
    artifact_id     INT,
    structure_id    INT,
    -- Overflow for unmapped fields
    details         JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**Design decision**: Event types as TEXT, not DB enum. Raw subtype-specific data goes in `details` JSONB. This supports all 141 canonical types without schema changes. The agentic storyteller handles all types via LLM interpretation.

**Column additions for live data**:
```sql
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
```

**Live event ID collision prevention**: Gap of 10,000+ between legends IDs and live-generated IDs.

**BUG-002 (open)**: Multi-participant events (10+ participants) store only first two HF IDs in `hf_id_1`/`hf_id_2`. Design decision pending: JSONB array in `details` vs. junction table `event_participants(world_id, event_id, hf_id, role)`.

**Event base fields from df-structures** (all event types share):
- `year` (int32)
- `seconds` (int32)
- `flags` (df-flagarray: hidden, realized, has_support_structure)
- `id` (int32)

**Virtual methods** (accessible via DFHack vtable):
- `getType()`, `getRelatedHistfigIDs()`, `getRelatedSiteIDs()`, `getRelatedEntityIDs()`
- `wasHistfigKilled()`, `getKilledHistfigID()`, `wasHistfigRevived()`
- `getSentence()`, `getPhrase()` -- human-readable text generation
- `getImportance()`, `getEraImportance()`

**HF ID reference fields in events** (from df-narrator canonical list):
```
hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid,
changee_hfid, changer_hfid, woundee_hfid, wounder_hfid,
doer_hfid, target_hfid, attacker_hfid, defender_hfid,
hist_fig_id, body_hfid, hfid_target, hfid_attacker,
hfid_defender, trickster_hfid, cover_hfid, student_hfid,
teacher_hfid, trainer_hfid, seeker_hfid
```

**141 Canonical Event Types** (133 df-structures + 8 DF 50.x Steam-era):

| Category | Count | Types |
|----------|-------|-------|
| HF Lifecycle | 17 | HIST_FIGURE_DIED, WOUNDED, ABDUCTED, REVIVED, REUNION, TRAVEL, NEW_PET, SIMPLE_BATTLE_EVENT, SIMPLE_ACTION, CHANGE_HF_STATE, CHANGE_HF_JOB, CHANGE_HF_BODY_STATE, CHANGE_HF_MOOD, CHANGE_CREATURE_TYPE, HF_GAINS_SECRET_GOAL, HF_RELATIONSHIP_DENIED, HIST_FIGURE_REACH_SUMMIT |
| HF Relationships | 10 | ADD/REMOVE_HF_HF_LINK, ADD/REMOVE_HF_ENTITY_LINK, ADD/REMOVE_HF_SITE_LINK, ADD_HF_ENTITY_HONOR, ASSUME_IDENTITY, HFS_FORMED_REPUTATION_RELATIONSHIP, HFS_FORMED_INTRIGUE_RELATIONSHIP |
| HF Actions | 14 | HF_ATTACKED_SITE, HF_DESTROYED_SITE, HF_CONFRONTED, HF_DOES_INTERACTION, HF_LEARNS_SECRET, HF_PREACH, HF_FREED, HF_RANSOMED, HF_ENSLAVED, HF_ACT_ON_BUILDING, HF_ACT_ON_ARTIFACT, HF_RAZED_BUILDING, HF_RECRUITED_UNIT_TYPE_FOR_ENTITY, SNEAK_INTO_SITE |
| HF Intrigue | 6 | HF_CONVICTED, HF_INTERROGATED, FAILED_INTRIGUE_CORRUPTION, FAILED_FRAME_ATTEMPT, SABOTAGE, SPOTTED_LEAVING_SITE |
| Artifacts | 13 | ARTIFACT_CREATED/DESTROYED/LOST/FOUND/RECOVERED/POSSESSED/GIVEN/STORED/TRANSFORMED/COPIED/CLAIM_FORMED/HIDDEN/DROPPED |
| Sites & Construction | 11 | CREATED_SITE, WAR_DESTROYED_SITE, RECLAIM_SITE, SITE_DIED, SITE_RETIRED, CREATED/REPLACED/RAZED_BUILDING, CREATED_WORLD_CONSTRUCTION, MODIFIED_BUILDING, BUILDING_PROFILE_ACQUIRED |
| Entities | 14+ | ENTITY_CREATED/INCORPORATED/DISSOLVED/LAW/PERSECUTED/OVERTHROWN/ALLIANCE_FORMED/EQUIPMENT_PURCHASE/BREACH_FEATURE_LAYER/SEARCHED_SITE/RAMPAGED_IN_SITE/FLED_SITE/EXPELS_HF, REGIONPOP_INCORPORATED, CREATE_ENTITY_POSITION |
| War & Combat | 8+ | WAR_ATTACKED_SITE/FIELD_BATTLE/PLUNDERED_SITE/SITE_NEW_LEADER/SITE_TAKEN_OVER/SITE_TRIBUTE_FORCED, TACTICAL_SITUATION, SQUAD_VS_SQUAD, BODY_ABUSED, CREATURE_DEVOURED, ITEM_STOLEN |
| Diplomacy | 9+ | FIRST_CONTACT, WAR_PEACE_ACCEPTED/REJECTED, TOPICAGREEMENT_*, DIPLOMAT_LOST, AGREEMENT_FORMED/CONCLUDED, SITE_DISPUTE, TRADE, MERCHANT |
| Culture & Art | 8+ | POETIC/MUSICAL/DANCE_FORM_CREATED, WRITTEN_CONTENT_COMPOSED, KNOWLEDGE_DISCOVERED, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, GAMBLE |
| Masterpieces | 7 | MASTERPIECE_CREATED_ARCH_CONSTRUCT/ITEM/DYE_ITEM/ITEM_IMPROVEMENT/FOOD/ENGRAVING, MASTERPIECE_LOST |
| DF 50.x Steam | 8 | HF_PRAYED_INSIDE_STRUCTURE, HF_EQUIPMENT_PURCHASE, HF_PERFORMED_HORRIBLE_EXPERIMENTS, HF_PROFANED_STRUCTURE, ENTITY_RELOCATE, ENTITY_PRIMARY_CRIMINALS, HOLY_CITY_DECLARATION, HF_VIEWED_ARTIFACT |
| Unhandled by LB2 | 11 | AGREEMENTS_VOIDED, ARTIFACT_DROPPED, ARTIFACT_HIDDEN, CHANGE_HF_MOOD, ENTITY_ACTION, HF_ACT_ON_ARTIFACT, HF_ACT_ON_BUILDING, HF_RAZED_BUILDING, HIST_FIGURE_SIMPLE_ACTION, INSURRECTION_ENDED, ADD_ENTITY_SITE_PROFILE_FLAG |

#### `history_event_collections` -- Compound event groups (wars, battles, etc.)

```sql
CREATE TABLE IF NOT EXISTS history_event_collections (
    id                  INT NOT NULL,
    world_id            INT NOT NULL REFERENCES worlds(id),
    type                TEXT,
    name                TEXT,
    parent_id           INT,
    start_year          INT,
    start_seconds       INT,
    end_year            INT,
    end_seconds         INT,
    attacker_entity_id  INT,
    defender_entity_id  INT,
    site_id             INT,
    region_id           INT,
    details             JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**19 EventCollection Types**:
- Warfare: battle, war, duel, raid, site_conquered
- Political: insurrection, persecution, purge, entity_overthrown
- Calamities: beast_attack, abduction, theft
- Rituals: occasion, procession, ceremony, performance, competition
- Travel: journey

#### `collection_events` -- Junction table linking events to collections

```sql
CREATE TABLE IF NOT EXISTS collection_events (
    world_id        INT NOT NULL,
    collection_id   INT NOT NULL,
    event_id        INT NOT NULL,
    PRIMARY KEY (world_id, collection_id, event_id),
    FOREIGN KEY (world_id, collection_id) REFERENCES history_event_collections(world_id, id),
    FOREIGN KEY (world_id, event_id) REFERENCES history_events(world_id, id)
);
```

#### `collection_subcollections` -- Hierarchy: wars contain battles

```sql
CREATE TABLE IF NOT EXISTS collection_subcollections (
    world_id    INT NOT NULL,
    parent_id   INT NOT NULL,
    child_id    INT NOT NULL,
    PRIMARY KEY (world_id, parent_id, child_id),
    FOREIGN KEY (world_id, parent_id) REFERENCES history_event_collections(world_id, id),
    FOREIGN KEY (world_id, child_id) REFERENCES history_event_collections(world_id, id)
);
```

#### `event_relationships` -- Plus-XML-only relationship events

```sql
CREATE TABLE IF NOT EXISTS event_relationships (
    id          SERIAL PRIMARY KEY,
    world_id    INT NOT NULL REFERENCES worlds(id),
    event_id    INT,
    relationship TEXT,
    source_hf   INT,
    target_hf   INT,
    year        INT
);
```

**Note**: LegendsViewer-Next stores `HistoricalEventRelationship` as a special plus-XML-only event type in `World.SpecialEventsById`. LegendsBrowser2's `addRelationshipEvents()` synthesizes `AddHfHfLink` events from these.

### 1.7 Artifacts & Written Content Tables

#### `artifacts`

```sql
CREATE TABLE IF NOT EXISTS artifacts (
    id              INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    name            TEXT,
    item_type       TEXT,
    item_subtype    TEXT,
    material        TEXT,
    creator_hf_id   INT,
    holder_hf_id    INT,
    site_id         INT,
    importance_score FLOAT DEFAULT 0.0,
    details         JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

**Artifact Importance Score (df-narrator formula)**: `(events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named`

**LB2 reference fields**: `ItemDescription`, `PageCount`, `Writing` (WrittenContent id), `StructureLocalId`, `AbsTileX/Y/Z`.

**Missing fields**: `page_count`, `writing_id` (link to written_contents), `structure_local_id`, `abs_tile_x/y/z`.

#### `written_contents` -- Books, scrolls, compositions

```sql
CREATE TABLE IF NOT EXISTS written_contents (
    id              INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    title           TEXT,
    author_hf_id    INT,
    form            TEXT,          -- "poem", "musical composition", "guide", etc.
    type            TEXT,          -- CamelCase from legends_plus: "Poem", "MusicalComposition"
    page_start      INT,
    page_end        INT,
    styles          TEXT[],        -- style tags (merged from both XML sources)
    details         JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE INDEX IF NOT EXISTS idx_written_contents_author ON written_contents(author_hf_id);
```

**Dual-source parsing**: Both `legends.xml` and `legends_plus.xml` contribute data, merged by matching ID.

**Data volumes**: 61,692 written contents across 2 worlds imported.

**LB2 reference fields**: `Form` (poem, short_story, musical_composition, etc.), `FormId` (dance/music/poetic form id), `Reference []Reference {Type, Id}`.

**Missing fields**: `form_id` (link to art form tables), `references` (what the work refers to).

#### `historical_eras`

```sql
CREATE TABLE IF NOT EXISTS historical_eras (
    world_id        INT NOT NULL REFERENCES worlds(id),
    name            TEXT NOT NULL,
    start_year      INT,           -- -1 preserved for pre-history
    PRIMARY KEY (world_id, name)
);
```

**Data**: 2 eras imported. Start year -1 is preserved for the first era.

**Missing fields**: `end_year` (derived from next era's start_year - 1).

### 1.8 Live Data Tables (DFHack Bridge)

#### `units` -- Live game units (fortress inhabitants)

```sql
CREATE TABLE IF NOT EXISTS units (
    id              INT PRIMARY KEY,    -- NOTE: NOT composite PK
    world_id        INT REFERENCES worlds(id),
    name            TEXT,
    english_name    TEXT,
    race            TEXT,
    caste           TEXT,
    profession      TEXT,
    pos_x           INT,
    pos_y           INT,
    pos_z           INT,
    is_alive        BOOLEAN DEFAULT TRUE,
    hist_fig_id     INT,
    civ_id          INT,
    birth_year      INT,
    sex             SMALLINT,
    death_cause     TEXT,
    details         JSONB DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ DEFAULT now()
);
```

**Design note**: Units table currently uses a single-column PK (`id INT PRIMARY KEY`) instead of composite `(world_id, id)`. This is because unit IDs are only relevant for the currently running world. Future multi-world live data would need migration.

**Unit fields currently captured by bridge** (v6, 16 sections):
`game_time`, `creature_raws`, `unit_summary` (12 fields + flags + mood + emotions), `armies`, `buildings`, `artifacts`, `announcements`, `diplomacy`, `history`, `world_info`, `entities`, `dwarf_skills`, `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `crimes`.

**Unit fields NOT yet captured by bridge**:
Health wounds, inventory/equipped items, `birth_year`/`old_year`, `relationship_ids[9]`, `following`, full personality needs/memories/preferences vectors.

**Column additions**:
```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```

#### `unit_events` -- Change events detected by watcher

```sql
CREATE TABLE IF NOT EXISTS unit_events (
    id              SERIAL PRIMARY KEY,
    unit_id         INT NOT NULL,
    world_id        INT NOT NULL REFERENCES worlds(id),
    event_type      TEXT NOT NULL,      -- ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED
    old_value       JSONB,
    new_value       JSONB,
    game_year       INT,
    game_tick       INT,
    detected_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_events_unit ON unit_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_events_type ON unit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_unit_events_time ON unit_events(detected_at);
```

**11 event types detected by watcher.py**: death, mood, stress, pregnancy, ghost, ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED + additional detector types.

#### `sync_snapshots` -- Per-watcher-cycle metadata

```sql
CREATE TABLE IF NOT EXISTS sync_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_count      INT NOT NULL,
    event_count     INT DEFAULT 0,
    game_year       INT,
    game_tick       INT,
    synced_at       TIMESTAMPTZ DEFAULT now()
);
```

#### `game_reports` -- Announcements and combat logs

```sql
CREATE TABLE IF NOT EXISTS game_reports (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    report_id       INT NOT NULL,
    report_type     INT,
    text            TEXT NOT NULL,
    game_year       INT,
    game_tick       INT,
    pos_x           INT,
    pos_y           INT,
    pos_z           INT,
    is_announcement BOOLEAN DEFAULT FALSE,
    detected_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (world_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_game_reports_world ON game_reports(world_id);
CREATE INDEX IF NOT EXISTS idx_game_reports_year ON game_reports(game_year);
```

#### `world_map_snapshots` -- Geography snapshots

```sql
CREATE TABLE IF NOT EXISTS world_map_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    world_width     INT NOT NULL,
    world_height    INT NOT NULL,
    name            TEXT,
    name_english    TEXT,
    geography       JSONB NOT NULL,
    captured_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (world_id)
);
```

#### `lua_probes` -- Stored results of Lua probe calls

```sql
CREATE TABLE IF NOT EXISTS lua_probes (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    probe_name      TEXT NOT NULL,
    data            JSONB NOT NULL,
    game_year       INT,
    game_tick       INT,
    captured_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lua_probes_world ON lua_probes(world_id);
CREATE INDEX IF NOT EXISTS idx_lua_probes_name ON lua_probes(probe_name);
```

**Retention policy**: Keep last N per probe_name per world_id via `_cleanup_lua_probes_count()`. Cleanup every 10 watcher cycles.

**Existing probes**: `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)`.

### 1.9 Fortress Denizen Registry

```sql
CREATE TABLE IF NOT EXISTS fortress_denizens (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT,                -- NULL if HF-only (never had unit record)
    hf_id           INT,                -- NULL if unit-only (no HF match yet)
    name            TEXT NOT NULL,       -- Best available name
    english_name    TEXT,                -- English translation if available
    race            TEXT,
    status          TEXT NOT NULL DEFAULT 'unknown',
        -- 'resident'   : Currently living in fortress
        -- 'departed'   : Left alive (migrated out, caravan departed)
        -- 'deceased'   : Confirmed dead
        -- 'missing'    : Was resident, now absent (no departure/death event)
        -- 'visitor'    : Temporary presence (diplomat, merchant, performer)
        -- 'attacker'   : Hostile presence (siege, ambush)
        -- 'skulker'    : Covert presence (thief, snatcher)
        -- 'historical' : Known only from legends/relationships, never present
    embark          BOOLEAN DEFAULT FALSE,  -- TRUE if starting dwarf at embark
    arrival_year    INT,
    arrival_tick    INT,
    departure_year  INT,
    departure_tick  INT,
    departure_cause TEXT,               -- 'death', 'departure', 'unknown'
    narrative_value FLOAT DEFAULT 0.0,  -- Storytelling importance score (0.0-100.0)
    last_seen_tick  INT,                -- Last watcher cycle tick where observed
    details         JSONB DEFAULT '{}', -- Extended metadata
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, unit_id),
    UNIQUE (world_id, hf_id)
);

CREATE INDEX IF NOT EXISTS idx_fortress_denizens_status
    ON fortress_denizens(world_id, status);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_narrative
    ON fortress_denizens(world_id, narrative_value DESC);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_hf
    ON fortress_denizens(world_id, hf_id) WHERE hf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_embark
    ON fortress_denizens(world_id) WHERE embark = TRUE;
```

See Section 3 for full details.

### 1.10 Knowledge Horizon Table

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,       -- 'hf', 'entity', 'site', 'region', etc.
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);
```

See Section 4 for full details.

### 1.11 Monitoring & Analytics Tables

#### `storyteller_log`

```sql
CREATE TABLE IF NOT EXISTS storyteller_log (
    id                  SERIAL PRIMARY KEY,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
    query               TEXT NOT NULL,
    world_id            INT,
    world_name          TEXT,
    keywords            TEXT[],
    context_records     INT DEFAULT 0,
    context_chars       INT DEFAULT 0,
    context_categories  JSONB DEFAULT '{}',
    model               TEXT,
    temperature         REAL,
    max_tokens          INT,
    tokens_streamed     INT DEFAULT 0,
    response_chars      INT DEFAULT 0,
    context_latency_ms  INT,
    first_token_ms      INT,
    llm_latency_ms      INT,
    total_latency_ms    INT,
    status              TEXT DEFAULT 'ok',
    error               TEXT
);

CREATE INDEX IF NOT EXISTS idx_storyteller_log_ts ON storyteller_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_storyteller_log_world ON storyteller_log(world_id);
```

### 1.12 Vector Embeddings Table

```sql
CREATE TABLE IF NOT EXISTS embeddings (
    id              SERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,       -- 'figure', 'event', 'artifact', 'site'
    entity_id       INT NOT NULL,
    chunk_index     INT NOT NULL DEFAULT 0,
    chunk_text      TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    embedding       vector(2560),        -- Qwen3-Embedding-4B via MLX
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings(entity_type, entity_id);
```

**Planned vector tables** (pgvector, not yet implemented):
- `figure_embeddings` -- biography chunks -> 2560-dim vectors
- `event_embeddings` -- event narratives -> 2560-dim vectors
- `artifact_embeddings` -- artifact histories
- `site_embeddings` -- site histories

### 1.13 Planned Tables (Not Yet Created)

#### `worldgen_snapshots` -- Real-time worldgen monitoring

```sql
-- PLANNED: CDM table for worldgen monitoring data
CREATE TABLE IF NOT EXISTS worldgen_snapshots (
    id              SERIAL PRIMARY KEY,
    world_name      TEXT,
    seed            TEXT,
    state_id        INT,
    state_name      TEXT,
    snapshot_ts     TIMESTAMPTZ DEFAULT now(),
    figure_count    INT,
    event_count     INT,
    era_count       INT,
    civ_count       INT,
    civs_left       INT,
    rivers_cur      INT,
    rivers_total    INT,
    rampage_num     INT,
    num_rejects     INT,
    entity_count    INT,
    site_count      INT,
    landmass_count  INT,
    river_count     INT,
    geo_biome_count INT,
    snapshot_num    INT
);
```

#### `worldgen_params` -- Generation configuration

```sql
-- PLANNED: Store worldgen parameters per world
CREATE TABLE IF NOT EXISTS worldgen_params (
    id              SERIAL PRIMARY KEY,
    world_id        INT REFERENCES worlds(id),
    seed            TEXT,
    title           TEXT,
    dim_x           INT,
    dim_y           INT,
    end_year        INT,
    total_civ_number INT,
    megabeast_cap   INT,
    semimegabeast_cap INT,
    titan_number    INT,
    demon_number    INT,
    details         JSONB DEFAULT '{}'
);
```

#### Art Forms (3 planned tables)

```sql
-- PLANNED: Dance, Musical, Poetic art forms
CREATE TABLE IF NOT EXISTS dance_forms (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    description TEXT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE TABLE IF NOT EXISTS musical_forms (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    description TEXT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE TABLE IF NOT EXISTS poetic_forms (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    description TEXT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

#### Rivers (planned)

```sql
-- PLANNED: River geographic features
CREATE TABLE IF NOT EXISTS rivers (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    name        TEXT,
    paths       JSONB DEFAULT '[]',   -- array of coordinate paths
    PRIMARY KEY (world_id, id)
);
```

#### Entity Populations (planned extension)

```sql
-- PLANNED: Population groups per entity
CREATE TABLE IF NOT EXISTS entity_populations (
    id          INT NOT NULL,
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_id   INT,
    race        TEXT,
    count       INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

---

## 2. Unit-HF Merge Model

### 2.1 Linkage Mechanism

- `units.hist_fig_id` -> `historical_figures.id` (within same `world_id`)
- Not all units have HF records (born after legends export date)
- Not all HFs have unit records (dead, off-map, or non-fortress entities)

### 2.2 The 6 Merge Rules

1. **Start with Unit data** (always fresher for live entities)
2. **Overlay HF data for historical depth** (relationships, events, positions)
3. **For conflicts: prefer Unit for real-time; prefer HF for historical facts**
4. **Personality data is Unit-only** (not in legends XML)
5. **Event history from TWO sources**, distinguished by `live_generated` flag:
   - HF events from legends XML (`live_generated = FALSE, source = 'legends'`)
   - Live-generated events from watcher state transitions (`live_generated = TRUE, source = 'bridge'`)
6. **Embark dwarves with no HF**: flag `embark: true` -- personality and skills available, event history grows from live event generation

### 2.3 Authoritative Source Designations

| Field | Unit Source | HF Source | Authoritative |
|-------|-----------|----------|---------------|
| Name (Dwarvish) | `units.name` | `historical_figures.name` | Unit (live, may change) |
| Name (English) | `units.english_name` | -- | Unit only |
| Race | `units.race` | `historical_figures.race` | Either (should match) |
| Caste | `units.caste` | `historical_figures.caste` | Either (should match) |
| Birth year | `units.birth_year` | `historical_figures.birth_year` | HF (canonical) |
| Death year | -- | `historical_figures.death_year` | HF only |
| Death cause | `units.death_cause` | `historical_figures.death_cause` | HF (richer text) |
| Sex | `units.sex` (0=M, 1=F) | `historical_figures.caste` | Unit (numeric) |
| Alive status | `units.is_alive` | `death_year IS NULL` | Unit (real-time) |
| Civilization | `units.civ_id` | `historical_figures.entity_id` | Unit (may change) |
| Relationships | `units.details.relationships` (9 slots) | `hf_links` table | HF (comprehensive) |
| Entity memberships | -- | `hf_entity_links` table | HF only |
| Position history | -- | `hf_position_links` table | HF only |

### 2.4 Unit-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Profession | `units.profession` | Current job assignment |
| Position (x,y,z) | `units.pos_x/y/z` | Real-time map coordinates |
| Skills | `units.details.skills[]` | Full skill list with levels + XP |
| Labors | `units.details.labors[]` | Active labor assignments |
| Personality traits | `units.details.personality.traits{}` | 50 facets, 0-100 scale |
| Values | `units.details.personality.values[]` | Core value priorities |
| Needs | `units.details.personality.needs[]` | Need satisfaction levels |
| Dreams/goals | `units.details.personality.dreams[]` | Life aspirations |
| Physical attributes | `units.details.physical_attrs{}` | STR, AGI, etc. (6) |
| Mental attributes | `units.details.mental_attrs{}` | Analytical, Focus, etc. (12+) |
| Stress level | Bridge `unit_summary` | Current stress counter |
| Mood | Bridge `unit_summary` | Strange mood status |
| Squad | `units.details.squad_id` | Military assignment |
| Old year (lifespan) | `units.details.old_year` | Expected death year |
| Cultural identity | `units.details.cultural_identity` | Cultural group beyond civ |

### 2.5 HF-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Kill count | `historical_figures.kill_count` | Lifetime kills |
| Event count | `historical_figures.event_count` | Historical events involved in |
| Type flags | `is_deity, is_vampire, ...` | 6 boolean flags |
| Identities | `identities` table | Assumed names/disguises |
| Site links | `hf_site_links` table | Home, lair, prison, etc. |
| Spheres | `historical_figures.details` | Deity spheres of influence |
| Written works | Events table | Authored books/compositions |
| Reputation | Events table | Derived from event participation |
| Importance score | `historical_figures.importance_score` | Computed using df-narrator formula |

### 2.6 Unified Person Schema (JSON for LLM)

```json
{
  "name": "Urist McHammer",
  "english_name": "Suntin",
  "race": "Dwarf",
  "caste": "Female",
  "birth_year": 23,
  "age": 127,
  "is_alive": true,
  "profession": "Legendary Miner",
  "civilization": "The Dagger of Feasting",
  "relationships": [
    {"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345},
    {"type": "Mother", "name": "Urvad Glazedchest", "hf_id": 12346}
  ],
  "personality": {
    "notable_traits": ["Very brave", "Very curious", "Somewhat anxious"],
    "values": ["Family", "Craftsmanship"],
    "unmet_needs": ["Socialize", "Practice martial art"],
    "dreams": ["Start a family (accomplished)", "Master a skill"]
  },
  "positions_held": [
    {"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}
  ],
  "skills": [
    {"name": "Mining", "level": 20, "label": "Legendary"},
    {"name": "Hammerdwarf", "level": 12, "label": "Great"}
  ],
  "key_events": [
    {"year": 45, "type": "slew", "description": "Slew a forgotten beast"},
    {"year": 120, "type": "artifact", "description": "Created Asen Nidostdishmab"}
  ],
  "sources": {
    "unit_id": 567,
    "hf_id": 12340,
    "world_id": 8
  }
}
```

---

## 3. Fortress Denizens Registry

### 3.1 Purpose

The `fortress_denizens` table is the **keystone table** of the v1.0 architecture. It serves as:
- **Gateway**: Every being who has touched the fortress
- **Root node**: For all Knowledge Horizon queries
- **Anchor**: For Narrative Value Scores (NVS)
- **Routing layer**: Determines which beings the LLM prioritizes

### 3.2 NVS (Narrative Value Scoring)

NVS is a 0.0-100.0 float score computed per watcher cycle. It determines storytelling importance for fortress-relevant beings. The scoring model draws from df-narrator's figure importance formula but is adapted for fortress context:

**Fortress-specific NVS factors**:
- Duration of residency (longer = more narrative weight)
- Event involvement (deaths, skill milestones, profession changes)
- Relationship density (more connections = more narrative hooks)
- Status multipliers (embark dwarves get bonus, deceased get partial credit)
- Kill count, artifact creation, position holdings

**NVS update**: Computed per watcher cycle (every ~10 seconds), enabling O(1) sort for "most important denizens" queries.

### 3.3 Routing Layer Design

The denizen registry acts as the routing layer between the agentic storyteller and the broader CDM:

```
User question
  -> LLM receives: top denizens by NVS + schema summary
  -> LLM queries fortress_denizens first
  -> LLM follows FK links to historical_figures, hf_links, history_events
  -> LLM builds response from evidence
```

### 3.4 Status State Machine

```
unknown -> resident (first observed alive)
unknown -> visitor/attacker/skulker (temporary presence)
resident -> deceased (death detected)
resident -> departed (left alive)
resident -> missing (absent, cause unknown)
missing -> deceased (death confirmed)
missing -> departed (departure confirmed)
visitor -> departed (caravan left, diplomat departed)
```

### 3.5 Death Detection (4 Mechanisms)

1. **Flag check**: `units.is_alive` transitions from TRUE to FALSE
2. **Absence detection**: Unit disappears from active unit list for N consecutive cycles
3. **Announcement matching**: Game reports containing death-related text
4. **History event matching**: `history_events` with type `hf died` referencing the HF

### 3.6 Embark Detection

On the first watcher cycle for a new fortress, unit count <= 7 and no prior denizen entries exist. These units are flagged `embark = TRUE`. They may lack HF records entirely (embark dwarves exist only as units in a fresh game).

---

## 4. Knowledge Horizon Database Views

### 4.1 Core Concept

The Knowledge Horizon limits the LLM's effective search space. Instead of exposing all ~1.65M CDM records across 35+ tables, the mask exposes only data relevant to the fortress and its inhabitants.

### 4.2 View Definitions

**Preferred implementation**: View-Based Masking using PostgreSQL views.

```sql
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE (world_id, id) IN (
    SELECT world_id, CAST(entity_id AS INT)
    FROM knowledge_horizon
    WHERE entity_type = 'hf' AND visible = true
);

CREATE VIEW visible_entities AS
SELECT * FROM entities
WHERE (world_id, id) IN (
    SELECT world_id, CAST(entity_id AS INT)
    FROM knowledge_horizon
    WHERE entity_type = 'entity' AND visible = true
);

CREATE VIEW visible_sites AS
SELECT * FROM sites
WHERE (world_id, id) IN (
    SELECT world_id, CAST(entity_id AS INT)
    FROM knowledge_horizon
    WHERE entity_type = 'site' AND visible = true
);

CREATE VIEW visible_history_events AS
SELECT he.* FROM history_events he
WHERE EXISTS (
    SELECT 1 FROM knowledge_horizon kh
    WHERE kh.world_id = he.world_id
    AND kh.visible = true
    AND (
        (kh.entity_type = 'hf' AND (he.hf_id_1 = kh.entity_id OR he.hf_id_2 = kh.entity_id))
        OR (kh.entity_type = 'site' AND he.site_id = kh.entity_id)
        OR (kh.entity_type = 'entity' AND (he.entity_id_1 = kh.entity_id OR he.entity_id_2 = kh.entity_id))
    )
);
```

### 4.3 Masking Logic (3 Dimensions)

**Geographic Scope**:
- Always visible: fortress region + adjacent regions
- Revealed by: migrants, caravans, raids

**Civilization Scope**:
- Always visible: parent civilization structure
- Revealed by: diplomatic contact, wars, raids

**Individual Scope**:
- Always visible: all fortress inhabitants + direct family
- Revealed by: arrival, family connection, organizational overlap

### 4.4 The 7 Visibility Caveats

**CAV-001**: Organization Membership Propagation -- Cults: full visibility. Military Squads: squad-mates and chain of command. Guilds: same-site members. Religious Orders: nearby site worshippers. Civilization (broad): NO full propagation.

**CAV-002**: Civilization Nobles and Administrators -- Always visible: civilization-level nobles, administrators, law-givers, military commanders.

**CAV-003**: Previous Residence Knowledge -- Dwarf carries knowledge of all inhabitants of previous residences. Derived from cross-referencing `hf_site_links`.

**CAV-004**: Starting Dwarf Background Generation -- Initial 7 dwarves may lack HF records. Heuristic: check relationships, assign parentage, generate synthetic entries with `source = 'inferred'`.

**CAV-005**: Family Chain Propagation -- Depth 1 (spouse, children, parents): Always visible. Depth 2 (siblings, grandparents, in-laws): Visible if alive. Depth 3+: Masked unless another caveat reveals them.

**CAV-006**: Event-Based Revelation -- War declaration, caravan arrival, migrant wave, raid/expedition return, artifact acquisition each reveal specific data.

**CAV-007**: LLM Inference Restrictions -- Do NOT infer events or relationships not present in unmasked data. Treat the Knowledge Horizon as an in-world limitation.

### 4.5 Phased Rollout

| Phase | Scope |
|-------|-------|
| Phase 1 | Denizen registry as starting point |
| Phase 2 | View-based masking for HFs (visible if denizen or 1-hop) |
| Phase 3 | Geographic masking |
| Phase 4 | Full Knowledge Horizon with 7 caveats |

---

## 5. Entity Positions (Full Detail)

### 5.1 `entity_positions` Table

Stores position **definitions** per entity. Each entity (civilization, religion, etc.) defines its own set of noble/administrative positions with gendered name variants.

**Data volumes**: 11,712 position definitions across all worlds.

**Source**: `legends_plus.xml` `<entity_position>` elements within `<entity>`.

**Fields**:
- `position_id`: Local ID within entity (0, 1, 2...)
- `name`: Generic name ("monarch", "general", "hammerer")
- `name_male`: Male variant ("king", "duke")
- `name_female`: Female variant ("queen", "duchess")
- `spouse/spouse_male/spouse_female`: Consort title variants

**Missing fields from LB2**: `succession` (election, heir, etc.), `max_age` (age limit).

### 5.2 `hf_position_links` Table

Stores position **assignments** -- which HFs held which positions, and when.

**Data volumes**: 13,501 active assignments + 41,199 historical links = 54,700 total.

**Key indexes**:
- By HF: `idx_hf_position_links_hf` on `(world_id, hf_id)`
- By entity: `idx_hf_position_links_entity` on `(world_id, entity_id)`
- Current positions only: `idx_hf_position_links_current` on `(world_id, entity_id) WHERE end_year IS NULL`
- Null start dedup: `idx_hf_position_links_null_start_dedup` on `(world_id, hf_id, entity_id, position_id) WHERE start_year IS NULL`

### 5.3 Query Pattern: Position History for a Figure

```sql
SELECT ep.name, ep.name_male, ep.name_female,
       e.name AS entity_name, e.type AS entity_type,
       hpl.start_year, hpl.end_year
FROM hf_position_links hpl
JOIN entity_positions ep ON ep.world_id = hpl.world_id
    AND ep.entity_id = hpl.entity_id
    AND ep.position_id = hpl.position_id
JOIN entities e ON e.world_id = hpl.world_id AND e.id = hpl.entity_id
WHERE hpl.world_id = $1 AND hpl.hf_id = $2
ORDER BY hpl.start_year;
```

---

## 6. Multi-World Support

### 6.1 Composite PK Design

All 13 legends tables use composite primary keys `(world_id, id)` where `world_id` references `worlds(id)`. This was implemented in Phase 1 (Composite PK Migration).

**Tables with composite PKs**:
- `regions(world_id, id)`
- `underground_regions(world_id, id)`
- `sites(world_id, id)`
- `structures(world_id, site_id, id)` -- triple composite
- `entities(world_id, id)`
- `historical_figures(world_id, id)`
- `history_events(world_id, id)`
- `history_event_collections(world_id, id)`
- `artifacts(world_id, id)`
- `written_contents(world_id, id)`
- `historical_eras(world_id, name)` -- composite with name instead of id
- `landmasses(world_id, id)`
- `mountain_peaks(world_id, id)`
- `world_constructions(world_id, id)`
- `identities(world_id, id)`

**Link tables with world_id + composite FKs**:
- `hf_links` -- FK to `(world_id, hf_id)` and `(world_id, target_hf_id)`
- `hf_entity_links` -- FK to `(world_id, hf_id)` and `(world_id, entity_id)`
- `hf_site_links` -- FK to `(world_id, hf_id)` and `(world_id, site_id)`
- `collection_events` -- FK to `(world_id, collection_id)` and `(world_id, event_id)`
- `collection_subcollections` -- FK to `(world_id, parent_id)` and `(world_id, child_id)`

### 6.2 Collision Resolution

Before migration: 10,932 cross-world ID collisions existed. After migration: 5,466 HFs recovered from world "Namoram" (previously lost to ID collision with world "Ormon"). Total HFs post-migration: 60,787 (was 55,321; 9.9% data restoration).

### 6.3 World ID Partitioning

The `world_id` column enables:
- Direct per-world queries without filtering
- Per-world importance score rankings
- Independent legends imports without data collision
- Multi-world comparative analysis (cross-world analytics)

### 6.4 Exception: Units Table

The `units` table currently uses a single-column PK (`id INT PRIMARY KEY`) instead of composite. This is because unit IDs are only relevant for the currently running world. Multi-world live data support would require migration to `(world_id, id)`.

---

## 7. Data Integrity

### 7.1 Bugs Found and Fixed

| Bug ID | Description | Fix | Impact |
|--------|-------------|-----|--------|
| BUG-001 | Boolean flags (deity, vampire, necromancer, werebeast) not populating | Fixed detection via spheres, interactions | Correct type classification |
| BUG-003 | Site ownership not populating | Parse `cur_owner_id` from legends_plus | 2,154 sites with correct ownership |
| BUG-005 | kill_count grouping by victim instead of killer | Changed to group by `hf_id_2` (slayer) | 8,680 figures updated, max 3->146 |
| BUG-006 | Duplicate rows in link tables | Deduped 4,679 + 23 rows; added UNIQUE constraints | Data integrity restored |
| BUG-007 | Cross-world ID collisions (no world_id) | Migrated all 13 tables to composite PK | 5,466 HFs recovered, 10,932 collisions resolved |
| BUG-008 | Region parsing scope too broad | Changed XPath from `.//region` to `regions/region` | 240/240 regions, 125/125 underground correct |

### 7.2 Open Bugs

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-002 | Multi-participant events truncated to 2 HF IDs | Design decision pending: JSONB array vs. junction table |

### 7.3 Validation Rules

- **UNIQUE constraints on link tables**: `uq_hf_links`, `uq_hf_entity_links`, `uq_hf_site_links`
- **ON CONFLICT behavior**: hf_links/hf_site_links -> DO NOTHING; hf_entity_links -> DO UPDATE SET position_name
- **Composite FK integrity**: All link tables reference composite PKs
- **Partial unique indexes**: Prevent NULL-start duplicates in `hf_position_links`
- **Control character filtering**: XML parser must handle DF's raw control characters (bytes < 32). LegendsViewer-Next uses `FilteredStream` wrapper that replaces all non-printable characters with spaces.
- **IBM CP473 encoding**: Legacy character encoding in DF XML output. LegendsBrowser2 includes CP473-to-Unicode conversion.

### 7.4 Test Coverage

131 tests passing in 0.19s across 4 test files:
- `test_xml_parser.py`: 26 tests -- XML parsing correctness
- `test_context.py`: 30 tests -- storyteller context retrieval
- `test_detector.py`: 29 tests -- change detection logic
- `test_schema.py`: 46 tests -- composite PK correctness, FK integrity

### 7.5 Post-Parse Processing Pipeline (Required)

After XML ingestion, the following cross-referencing steps must run (derived from LV-Next: 12 resolve steps, LB2: 6 process steps):

1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores (HF, site, artifact using df-narrator formulas)

### 7.6 Data Recovery Metrics

| Metric | Value |
|--------|-------|
| Cross-world collisions resolved | 10,932 |
| HFs recovered (Namoram) | 5,466 |
| Total HFs post-migration | 60,787 (9.9% restoration) |
| Kill counts corrected | 8,680 figures |
| Written contents imported | 61,692 |
| Link table rows deduped | 4,702 |

---

## 8. Reference Tool Data Models (Comparison)

### 8.1 LegendsViewer-Next (.NET 8, in-memory)

**Architecture**: All data held in a singleton `World` object in memory. No database. Queries are in-memory LINQ. Map images cached as `byte[]`.

**Core entity types**: Regions, UndergroundRegions, Landmasses, MountainPeaks, Rivers, Sites, HistoricalFigures, Entities, Eras, Artifacts, WorldConstructions, PoeticForms, MusicalForms, DanceForms, WrittenContents, Structures, Identities, EntityPopulations.

**HF model** (HistoricalFigure.cs): Name, Race, Caste, BirthYear/DeathYear, Age, Alive, Deity/Force/Ghost/Zombie/Skeleton/Adventurer/Animated, CurrentState, RelatedHistoricalFigures (links), RelatedEntities, RelatedSites, Skills, Spheres, ActiveInteractions, Goal, NotableKills, Battles, BeastAttacks, Positions, VagueRelationships, RelationshipProfiles, Reputations, HoldingArtifacts, DedicatedStructures, IntrigueActors/Plots, BreedId, LineageCurseParent, FamilyTreeData.

**Key difference from Chronicler**: No persistent storage, no multi-world support, no composite keys. All data discarded on app restart.

### 8.2 LegendsBrowser2 (Go, in-memory)

**Architecture**: All data in Go maps (`map[int]*T`). Custom hand-written streaming XML tokenizer for performance. Code-generated model from XML structure analysis.

**DfWorld root container**: maps for all entity types (Regions, UndergroundRegions, Sites, WorldConstructions, Artifacts, HistoricalFigures, Identities, EntityPopulations, Entities, HistoricalEvents, HistoricalEventCollections, plus slices for HistoricalEventRelationships, HistoricalEras, DanceForms, MusicalForms, PoeticForms, WrittenContents, Landmasses, MountainPeaks, Rivers).

**HF model** (generated Go struct): Name, Race, Caste, Sex, BirthYear/DeathYear, AssociatedType, EntPopId, Leader/Vampire/Werebeast/Necromancer/Deity/Force/Ghost/Adventurer flags (computed from events), Kills, HfLink/EntityLink/SiteLink/EntityPositionLink/VagueRelationship/RelationshipProfile/IntrigueActor/IntriguePlot/SitePropertyLink arrays, Goals/Spheres/JourneyPet/HfSkill/ActiveInteraction/InteractionKnowledge/UsedIdentityIds/HoldsArtifact, WerebeastSince/VampireSince/NecromancerSince.

**Key difference from Chronicler**: No database, everything in memory. But the Go model is more field-complete than Chronicler's current CDM.

### 8.3 weblegends (C++, live game memory)

**Architecture**: DFHack C++ plugin serving HTML over HTTP. Reads directly from DF memory structures (`df::world->*`). No parsing, no storage -- always live. 96 per-event `.cpp` files for event rendering.

**Data model**: Identical to df-structures XML definitions. Access via `df.global.world.*` paths. No intermediate storage.

**Key difference from Chronicler**: No persistence, no search, no cross-session analysis. But provides the most complete live data access.

### 8.4 df-narrator (Python, scored XML)

**Architecture**: Python script that parses legends XML, computes importance scores, then generates Markdown output. No web UI, no database.

**Scoring formulas**: The canonical reference for entity importance scoring (see Section 1.5 for HF formula, Section 1.7 for artifact formula, planning-history for site and conflict formulas).

**Unique contribution to Chronicler**: The 4 scoring formulas, HF_FIELDS canonical list (all XML fields referencing HF IDs), rivalry detection (co-appearance counting), DF calendar conversion.

---

## 9. Migration Strategy

### 9.1 Schema Versioning

Current schema is in `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` (537 lines). All DDL uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for idempotent execution.

Column additions use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for non-breaking evolution.

### 9.2 Migration History

| Migration | Description | Status |
|-----------|-------------|--------|
| v1: Initial schema | 35 tables, single-column PKs | SUPERSEDED |
| v2: Composite PK migration | All 13 legends tables to `(world_id, id)`, link tables with composite FKs | DONE |
| Entity positions extraction | `entity_positions` + `hf_position_links` tables added | DONE |
| Written contents + eras | `written_contents` + `historical_eras` tables added | DONE |
| Importance scoring | `importance_score FLOAT` columns on HFs, sites, artifacts | DONE |
| Fortress denizens | `fortress_denizens` table added | DONE (table created, logic pending) |
| Knowledge horizon | `knowledge_horizon` table added | DONE (table created, logic pending) |
| Identities | `identities` table added | DONE |
| World constructions | `world_constructions` table added | DONE (not yet populated) |
| Live data columns | `english_name`, `birth_year`, `sex`, `death_cause` on units | DONE |
| Live event columns | `live_generated`, `source` on history_events | DONE |
| Embark flag | `embark BOOLEAN` on historical_figures | DONE |

### 9.3 Planned Migrations

| Migration | Priority | Description |
|-----------|----------|-------------|
| Art forms tables | Medium | 3 tables: dance_forms, musical_forms, poetic_forms |
| Rivers table | Medium | Geographic river features |
| Entity populations extension | Medium | Population groups per entity |
| Worldgen tables | Medium | worldgen_snapshots + worldgen_params |
| HF field extensions | High | Add missing high-priority fields from df-structures |
| Units composite PK | Low | Migrate units to `(world_id, id)` for multi-world live data |
| Event participants junction | Medium | Resolve BUG-002 (multi-participant events) |

### 9.4 Migration Tool

Planned: Alembic (SQLAlchemy migration framework). Not yet implemented. Current approach is idempotent DDL in `schema.sql`.

### 9.5 Backup Strategy

Pre-migration backup: `chronicler-pre-migration.dump` (17MB) taken before composite PK migration. Pattern: `pg_dump` before any destructive schema change.

---

## 10. Open Questions & Design Decisions

### 10.1 Resolved Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Composite PKs over single-column PKs | Resolves cross-world collisions (10,932 resolved) |
| 2 | Event types as TEXT, not DB enum | Supports all 141 types without schema changes |
| 3 | JSONB `details` overflow columns | Captures unmapped fields without schema evolution |
| 4 | Live events in same `history_events` table | `live_generated` + `source` columns distinguish origin |
| 5 | Live event ID gap of 10,000+ | Anti-collision with legends event IDs |
| 6 | `fortress_denizens` with two nullable FK columns | Unit-only or HF-only denizens possible |
| 7 | View-based Knowledge Horizon masking | Preferred over materialized tables (simpler, no duplication) |
| 8 | NVS computed per watcher cycle | Enables O(1) sort for "most important" queries |
| 9 | `embark` flag on both HF and denizen tables | Different semantic uses |
| 10 | kill_count fixed to group by killer (hf_id_2) | Was incorrectly grouping by victim (hf_id_1) |
| 11 | Synthetic HF records flagged `source = 'inferred'` | Distinguishable from legends data |
| 12 | Entity position dual-source merge | DO NOTHING on conflict |
| 13 | `missing` status distinct from `deceased` | Vanished -> missing -> confirmed deceased |
| 14 | `lua_probes` retention every 10 cycles | Balance storage vs. history |
| 15 | Family depth cap at 3 generations | Prevent recursion bombs in family tree queries |

### 10.2 Open Design Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | Multi-participant events (BUG-002) | JSONB array in `details` vs. junction table `event_participants` | Query performance for "all events involving HF X" |
| 2 | `lua_probes` time-series vs. UPSERT | Keep all snapshots vs. latest only per probe | Storage vs. trend analysis capability |
| 3 | Units table composite PK migration | Migrate to `(world_id, id)` or keep single PK | Multi-world live data support |
| 4 | HF sub-profile storage | Extend `details` JSONB vs. new dedicated columns | Query performance vs. schema simplicity |
| 5 | Materialized views for Knowledge Horizon | Views (current) vs. materialized views if 60K+ HFs cause slowdowns | Query latency at scale |
| 6 | Graphiti/Neo4j as complement to relational CDM | Use graph DB for relationship traversal | Complex multi-hop queries |
| 7 | pgvector usage for semantic search | Current `embeddings` table vs. entity-specific embedding tables | RAG pipeline architecture |
| 8 | Art form references in written_contents | JSONB references vs. FK to art form tables | Query join complexity |
| 9 | Entity hierarchy (parent-child entities) | `parent_entity_id` column vs. junction table | Recursive CTE queries |
| 10 | Ruin state tracking | Computed column vs. post-parse derived flag | Schema vs. processing complexity |

### 10.3 CDM Entity Coverage Gaps

| Entity Type | Chronicler CDM Status | Required Action |
|-------------|----------------------|-----------------|
| World Constructions | Table exists, not populated | Implement XML parser |
| Art Forms (3 types) | Tables not created | Create tables + parser |
| Rivers | Table not created | Create table + parser |
| Entity Populations | Partial | Extend with full population data |
| HF Sub-Profiles | Missing (13 profile pointers) | Prioritize skills, whereabouts, personality, kills |
| Vague Relationships | Missing | Add to CDM or JSONB details |
| Entity Reputations | Missing | Add table or JSONB |
| Intrigue System | Missing | Add tables for actors/plots |

### 10.4 Performance Considerations

| Concern | Current State | Mitigation |
|---------|--------------|------------|
| 60K+ HFs in Knowledge Horizon views | Not yet tested at scale | Materialized views as fallback |
| Event table with 500K+ rows | Indexed on year, type, hf_id, site_id, entity_id | Partition by world_id if needed |
| JSONB `details` query performance | Used for overflow only | GIN indexes if query patterns emerge |
| Link table join performance | Indexed on FK columns | Composite indexes cover common patterns |
| Importance score ranking | DESC index on (world_id, importance_score) | Already implemented |
| Full-text search | `unaccent` extension for diacritic tolerance | Consider pg_trgm for fuzzy matching |

### 10.5 Complete Index Inventory

```sql
-- Events
idx_events_year ON history_events(year)
idx_events_type ON history_events(event_type)
idx_events_hf1 ON history_events(hf_id_1)
idx_events_hf2 ON history_events(hf_id_2)
idx_events_site ON history_events(site_id)
idx_events_entity1 ON history_events(entity_id_1)

-- Historical Figures
idx_hf_name ON historical_figures(name)
idx_hf_race ON historical_figures(race)
idx_hf_importance ON historical_figures(world_id, importance_score DESC)

-- Sites
idx_sites_name ON sites(name)
idx_sites_importance ON sites(world_id, importance_score DESC)

-- Entities
idx_entities_name ON entities(name)

-- Artifacts
idx_artifacts_name ON artifacts(name)
idx_artifacts_importance ON artifacts(world_id, importance_score DESC)

-- Links
idx_hf_links_hf ON hf_links(hf_id)
idx_hf_links_target ON hf_links(target_hf_id)
idx_hf_entity_links_hf ON hf_entity_links(hf_id)
idx_hf_site_links_hf ON hf_site_links(hf_id)

-- Entity Positions
idx_entity_positions_entity ON entity_positions(world_id, entity_id)
idx_hf_position_links_hf ON hf_position_links(world_id, hf_id)
idx_hf_position_links_entity ON hf_position_links(world_id, entity_id)
idx_hf_position_links_current ON hf_position_links(world_id, entity_id) WHERE end_year IS NULL
idx_hf_position_links_null_start_dedup ON hf_position_links(world_id, hf_id, entity_id, position_id) WHERE start_year IS NULL  [UNIQUE]

-- Written Contents
idx_written_contents_author ON written_contents(author_hf_id)

-- Embeddings
idx_embeddings_entity ON embeddings(entity_type, entity_id)

-- Event Relationships
idx_event_rels_source ON event_relationships(source_hf)
idx_event_rels_target ON event_relationships(target_hf)

-- Monitoring
idx_storyteller_log_ts ON storyteller_log(timestamp DESC)
idx_storyteller_log_world ON storyteller_log(world_id)

-- Unit Events
idx_unit_events_unit ON unit_events(unit_id)
idx_unit_events_type ON unit_events(event_type)
idx_unit_events_time ON unit_events(detected_at)

-- Game Reports
idx_game_reports_world ON game_reports(world_id)
idx_game_reports_year ON game_reports(game_year)

-- Lua Probes
idx_lua_probes_world ON lua_probes(world_id)
idx_lua_probes_name ON lua_probes(probe_name)

-- Fortress Denizens
idx_fortress_denizens_status ON fortress_denizens(world_id, status)
idx_fortress_denizens_narrative ON fortress_denizens(world_id, narrative_value DESC)
idx_fortress_denizens_hf ON fortress_denizens(world_id, hf_id) WHERE hf_id IS NOT NULL
idx_fortress_denizens_embark ON fortress_denizens(world_id) WHERE embark = TRUE
```

---

## 11. Key File Paths

| Component | Path |
|-----------|------|
| Live schema DDL | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| XML parser | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| Watcher | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change detector | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Bridge accessor | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| Lua bridge | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| Context retriever | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| Unit-HF mapping design | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/unit-hf-field-mapping.md` |
| Knowledge horizon design | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/knowledge-horizon.md` |
| df-structures (HF) | `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_figure.xml` |
| df-structures (events) | `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_event.xml` |
| df-structures (soul) | `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.soul.xml` |
| df-structures (personality) | `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.personality.xml` |
| df-structures (worldgen) | `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.region.xml` |

---

*Component research document for CDM & Database System. All information extracted from 7 source documents + live schema.sql + 2 design documents. No information discarded.*
