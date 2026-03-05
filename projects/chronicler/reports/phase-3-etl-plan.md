# Phase 3: Live Data ETL Plan

**Version**: 1.0 (Wiggum Loop 1)
**Date**: 2026-03-05
**Purpose**: Extraction, transformation, and loading plan for all in-game data across world generation, fortress mode, and adventure mode
**Depends On**: `phase-3-memory-cdm-mapping.md` (memory→CDM field mapping)

---

## 1. Architecture Overview

### 1.1 Three-Layer ETL Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: EXTRACTION (Lua in DFHack)                        │
│  chronicler-bridge.lua + worldgen-bridge.lua                │
│  → JSON files on HTTP port 8889                             │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: TRANSFORMATION (Python watcher)                   │
│  chronicler watcher service                                 │
│  → Normalize, delta-detect, enrich, validate                │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: LOADING (asyncpg → PostgreSQL)                    │
│  Upsert into CDM tables                                     │
│  → CONNECT to existing records, not APPEND                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow per Game Mode

| Mode | Extractor | Transport | Watcher | Frequency |
|------|-----------|-----------|---------|-----------|
| World Generation | `worldgen-bridge.lua` | HTTP 8889 | worldgen poller | Every 30 frames (~0.5s) |
| Fortress Mode | `chronicler-bridge.lua` | HTTP 8889 | fortress watcher | Every 100 ticks (~2.4s) |
| Adventure Mode | `adventure-bridge.lua` (new) | HTTP 8889 | adventure watcher | Every 50 ticks (~1.2s) |

### 1.3 Current State (Bridge v7)

**21 extraction functions** already implemented in `chronicler-bridge.lua` (1,077 lines):

| Function | Domain | Lines | Status |
|----------|--------|-------|--------|
| `get_game_time()` | Time | 62-68 | Complete |
| `get_creature_raws()` | Raws | 72-80 | Complete |
| `get_unit_summary()` | Units | 84-203 | Complete (v7) |
| `get_armies()` | Military | 207-229 | Complete |
| `get_buildings()` | Structures | 233-254 | Basic (counts only) |
| `get_artifacts()` | Artifacts | 258-285 | Complete |
| `get_announcements()` | Events | 289-335 | Complete (cursor) |
| `get_diplomacy()` | Entities | 339-370 | Complete |
| `get_history_summary()` | Events | 374-447 | Complete (cursor) |
| `get_world_info()` | World | 451-480 | Complete |
| `get_entities()` | Entities | 484-517 | Complete |
| `get_dwarf_skills()` | Units | 521-557 | Complete |
| `get_dwarf_emotions()` | Units | 565-613 | Complete |
| `get_dwarf_personality()` | Units | 617-722 | Complete (v7) |
| `get_zones()` | Structures | 726-778 | Complete |
| `get_event_collections()` | Events | 782-852 | Complete |
| `get_squads()` | Military | 856-915 | Complete |
| `get_mandates()` | Governance | 919-961 | Complete |
| `get_incidents()` | Events | 965-1017 | Complete |
| `write_state()` | Orchestration | 1021-1074 | Complete |

---

## 2. Extraction Layer — What's New

### 2.1 New Bridge Functions Needed

#### 2.1.1 Fortress Mode — Bridge Enhancements

| New Function | Data Source | CDM Target | Priority | Est. Lines |
|-------------|------------|------------|----------|-----------|
| `get_death_causes()` | `world.incidents` + unit death flags | `units.death_cause`, `fortress_denizens.departure_cause` | P1 | ~60 |
| `get_family_chains()` | `hf.histfig_links[]` (MOTHER/FATHER/SPOUSE/CHILD) | `hf_links` (enrich strength) | P1 | ~80 |
| `get_soul_deep()` | `unit.status.current_soul.personality` (full) | `units.details.personality` | P1 | ~120 |
| `get_skill_progression()` | `unit_soul.skills[]` with experience/rust | `units.details.skills` (delta) | P2 | ~60 |
| `get_books()` | `world.written_contents` in-fort items | `written_contents` (live update) | P2 | ~50 |
| `get_entity_relationships()` | `entity.entity_links[]` + `entity.site_links[]` | `entity_entity_links`, `entity_site_links` | P1 | ~100 |
| `get_belief_systems()` | `world.belief_systems` | `belief_systems` (new table) | P3 | ~40 |

#### 2.1.2 Eventful Subscriptions (Reactive)

```lua
-- New: Event-driven extraction (zero-latency for critical events)
local eventful = require('plugins.eventful')

-- Death events → immediate capture with cause enrichment
eventful.onUnitDeath['chronicler'] = function(unit_id)
    -- Extract death cause from incidents table
    -- Write to pending_events buffer
end

-- Item creation → artifact detection
eventful.onItemCreated['chronicler'] = function(item_id)
    -- Check if item is named/artifact
    -- Write to pending_events buffer
end

-- Job completion → skill progression trigger
eventful.onJobCompleted['chronicler'] = function(job)
    -- Mark relevant unit for skill re-scan
end

-- Invasion → entity relationship + army update
eventful.onInvasion['chronicler'] = function()
    -- Trigger full army scan
    -- Trigger entity relationship refresh
end

-- Syndrome → personality/health impact
eventful.onSyndrome['chronicler'] = function(unit_id, syndrome_id)
    -- Capture syndrome onset for health tracking
end
```

#### 2.1.3 World Generation Mode — New Bridge

**File**: `worldgen-bridge.lua` (new, ~200 lines)

```lua
-- Polls worldgen state every 30 frames
-- Captures: phase, progress, population counts, terrain sampling

function get_worldgen_status()
    local wg = df.global.world.worldgen_status
    return {
        phase = tostring(wg.phase),      -- TERRAIN, RIVERS, CIVS, HISTORY, etc.
        progress = wg.progress,           -- 0-100%
        year = wg.year,                   -- Current simulated year
        pop_count = #df.global.world.history.figures,
        site_count = #df.global.world.world_data.sites,
        entity_count = #df.global.world.entities.all,
        event_count = #df.global.world.history.events,
    }
end

function get_worldgen_terrain_sample()
    -- Sample region_map tiles for live map rendering
    local wd = df.global.world.world_data
    local tiles = {}
    for x = 0, wd.world_width - 1 do
        for y = 0, wd.world_height - 1 do
            local tile = wd.region_map[x]:_displace(y)
            table.insert(tiles, {
                x = x, y = y,
                elevation = tile.elevation,
                rainfall = tile.rainfall,
                vegetation = tile.vegetation,
                temperature = tile.temperature,
                evilness = tile.evilness,
                drainage = tile.drainage,
                savagery = tile.savagery,
                salinity = tile.salinity,
            })
        end
    end
    return tiles
end
```

#### 2.1.4 Adventure Mode — New Bridge

**File**: `adventure-bridge.lua` (new, ~150 lines)

| Function | Data | CDM Target |
|----------|------|------------|
| `get_player_unit()` | Player character full state | `units` + `fortress_denizens` |
| `get_nearby_units()` | Units within render distance | `units` |
| `get_conversations()` | Active dialogues | `unit_events` |
| `get_combat_state()` | Active combat details | `unit_events` |
| `get_current_site()` | Site/region at player position | `sites` (update visit log) |
| `get_travel_state()` | Travel mode, destination, companions | `unit_events` |

---

## 3. Transformation Layer

### 3.1 Watcher Architecture

```python
class ChroniclerWatcher:
    """Main watcher service — polls bridge JSON and transforms into CDM records."""

    def __init__(self, config):
        self.mode = None  # 'fortress', 'adventure', 'worldgen'
        self.db_pool = None  # asyncpg connection pool
        self.last_sync = {}  # Per-section sync timestamps
        self.delta_cache = {}  # Previous state for change detection

    async def detect_mode(self, data: dict) -> str:
        """Detect game mode from bridge data."""
        if 'worldgen_status' in data:
            return 'worldgen'
        elif data.get('world_info', {}).get('is_adventure_mode'):
            return 'adventure'
        else:
            return 'fortress'

    async def poll_cycle(self):
        """Single poll-transform-load cycle."""
        data = await self.fetch_bridge_json()
        mode = await self.detect_mode(data)

        if mode == 'worldgen':
            await self.process_worldgen(data)
        elif mode == 'fortress':
            await self.process_fortress(data)
        elif mode == 'adventure':
            await self.process_adventure(data)

        await self.reconcile_events(data)
```

### 3.2 Transformation Rules

#### 3.2.1 Unit Normalization

```python
def transform_unit(raw_unit: dict, creature_raws: dict) -> dict:
    """Transform bridge unit JSON into CDM units row."""
    return {
        'id': raw_unit['id'],
        'world_id': current_world_id,
        'name': raw_unit.get('name', ''),
        'english_name': raw_unit.get('english_name', ''),
        'race': creature_raws.get(str(raw_unit['race_id']), {}).get('name', 'UNKNOWN'),
        'caste': raw_unit.get('caste', ''),
        'profession': raw_unit.get('profession', ''),
        'pos_x': raw_unit.get('pos', {}).get('x'),
        'pos_y': raw_unit.get('pos', {}).get('y'),
        'pos_z': raw_unit.get('pos', {}).get('z'),
        'is_alive': not raw_unit.get('flags', {}).get('dead', False),
        'hist_fig_id': raw_unit.get('hist_figure_id'),
        'civ_id': raw_unit.get('civ_id'),
        'birth_year': raw_unit.get('birth_year'),
        'sex': raw_unit.get('sex'),
        'death_cause': raw_unit.get('death_cause'),
        'details': {
            'mood': raw_unit.get('mood'),
            'current_job': raw_unit.get('current_job'),
            'stress': raw_unit.get('stress'),
            'personality': raw_unit.get('personality'),
            'skills': raw_unit.get('skills'),
            'emotions': raw_unit.get('emotions'),
        },
    }
```

#### 3.2.2 Delta Detection (Change Data Capture)

```python
class DeltaDetector:
    """Detect changes between poll cycles for unit_events generation."""

    def __init__(self):
        self.previous_state = {}  # unit_id → {field: value}

    def detect_changes(self, unit_id: int, current: dict) -> list[dict]:
        """Compare current state to previous, emit change events."""
        prev = self.previous_state.get(unit_id, {})
        events = []

        # Track significant state changes
        watch_fields = [
            ('profession', 'job_change'),
            ('mood', 'mood_change'),
            ('is_alive', 'death' if not current.get('is_alive') else 'revival'),
            ('pos_x', 'movement'),  # Only if moved significantly
            ('stress', 'stress_change'),  # Only if crossed threshold
        ]

        for field, event_type in watch_fields:
            old_val = prev.get(field)
            new_val = current.get(field)
            if old_val != new_val and old_val is not None:
                events.append({
                    'unit_id': unit_id,
                    'event_type': event_type,
                    'old_value': {field: old_val},
                    'new_value': {field: new_val},
                })

        self.previous_state[unit_id] = current
        return events
```

#### 3.2.3 Event Reconciliation

```python
async def reconcile_live_to_history(self, live_events: list, history_events: list):
    """
    CONNECT live events to history events when possible.

    Strategy:
    1. For each live death event, look for matching HIST_FIGURE_DIED in history
    2. Match by: hf_id + year + approximate tick
    3. If matched: add reconciliation link
    4. If unmatched: the history event will appear after next legends export
    """
    for live_event in live_events:
        if live_event['event_type'] == 'death':
            unit = await self.get_unit(live_event['unit_id'])
            if unit and unit.get('hist_fig_id'):
                # Search history_events for matching death
                match = await self.db.fetchrow("""
                    SELECT id FROM history_events
                    WHERE world_id = $1 AND event_type = 'hf died'
                    AND hf_id_1 = $2 AND year = $3
                """, self.world_id, unit['hist_fig_id'], self.game_year)

                if match:
                    # CONNECT: Link live event to history event
                    await self.db.execute("""
                        UPDATE unit_events SET details = details ||
                        jsonb_build_object('history_event_id', $1)
                        WHERE id = $2
                    """, match['id'], live_event['id'])
```

### 3.3 CONNECT-First Loading Rules

Every INSERT/UPSERT must follow these rules:

1. **Units**: Always UPSERT by `(world_id, id)`. If `hist_fig_id` is set, verify it exists in `historical_figures`.
2. **Fortress Denizens**: Match by `(world_id, unit_id)` OR `(world_id, hf_id)` — never create duplicates.
3. **Entity relationships**: UPSERT by `(world_id, source_entity_id, target_entity_id, link_type)`.
4. **Events**: `unit_events` for CDC stream (high frequency). Only promote to `history_events` when the event type maps to a known `history_event_type` and the HF ID is confirmed.
5. **Skills/Personality**: Always UPDATE existing `units.details` JSONB — never create new rows.

---

## 4. ETL Plan by Game Mode

### 4.1 World Generation Mode

**Trigger**: Game enters worldgen screen
**Polling**: Every 30 frames (~0.5 seconds)
**Duration**: 5-30 minutes per world generation

#### ETL Stages

| Stage | Extraction | Transformation | Loading |
|-------|-----------|---------------|---------|
| **4.1.1** Phase tracking | `worldgen_status.phase` | Map DF phase enum to human name | UPSERT `worldgen_snapshots` |
| **4.1.2** Population counts | `#world.history.figures` etc. | Direct mapping | UPDATE `worldgen_snapshots` |
| **4.1.3** Terrain sampling | `region_map[x][y]` tiles | Compress to per-tile struct | INSERT `world_map_snapshots` (on phase change) |
| **4.1.4** Post-gen entity dump | Full HF/entity/site iteration | Transform to CDM records | Batch INSERT to `historical_figures`, `entities`, `sites` |

**Post-Generation Hook**: When worldgen completes, trigger a full legends-style extraction via Lua iteration over all world data. This captures everything that would be in a legends XML export but without requiring the user to export.

```python
# Worldgen completion handler
async def on_worldgen_complete(self):
    """Extract full world data after generation completes."""
    # 1. Extract all historical figures
    figures = await self.bridge.call('get_all_historical_figures')
    await self.batch_upsert_hfs(figures)

    # 2. Extract all entities
    entities = await self.bridge.call('get_all_entities')
    await self.batch_upsert_entities(entities)

    # 3. Extract all sites
    sites = await self.bridge.call('get_all_sites')
    await self.batch_upsert_sites(sites)

    # 4. Extract all events
    events = await self.bridge.call('get_all_history_events')
    await self.batch_upsert_events(events)

    # 5. Build cross-references
    await self.build_event_entity_xref()
    await self.run_scoring_pipeline()
```

### 4.2 Fortress Mode

**Trigger**: Game loaded into fortress mode (detected by `world_info.is_fortress_mode`)
**Polling**: Every 100 ticks (~2.4 seconds)
**Reactive**: eventful subscriptions for zero-latency critical events

#### ETL Stages

| Stage | Extraction | Transformation | Loading | Frequency |
|-------|-----------|---------------|---------|-----------|
| **4.2.1** Unit sync | `get_unit_summary()` | Normalize + delta detect | UPSERT `units` + INSERT `unit_events` | Every poll |
| **4.2.2** Denizen registry | Filter units by civ_id | Lifecycle detection (new/departed/deceased) | UPSERT `fortress_denizens` | Every poll |
| **4.2.3** Personality deep | `get_soul_deep()` | Full personality struct → JSONB | UPDATE `units.details` | Every 10 polls (~24s) |
| **4.2.4** Skill tracking | `get_dwarf_skills()` | Delta detection on XP/rating | UPDATE `units.details.skills` + INSERT `unit_events` | Every 5 polls (~12s) |
| **4.2.5** Death enrichment | `get_death_causes()` | Match incident to unit | UPDATE `units.death_cause` + `fortress_denizens` | On death event |
| **4.2.6** Family chains | `get_family_chains()` | Extract HF links with strength | UPSERT `hf_links` (with strength) | Every 50 polls (~2min) |
| **4.2.7** Entity relations | `get_entity_relationships()` | Normalize link types | UPSERT `entity_entity_links` + `entity_site_links` | Every 50 polls |
| **4.2.8** Announcements | `get_announcements()` (cursor) | Classify + store | INSERT `game_reports` | Every poll |
| **4.2.9** History events | `get_history_summary()` (cursor) | Map to CDM event format | INSERT `history_events` (source='live') | Every poll |
| **4.2.10** Armies | `get_armies()` | Normalize army state | UPDATE `entities.details.armies` | Every poll |
| **4.2.11** Squads | `get_squads()` | Map squad→members | UPDATE `entities.details.squads` or new table | Every 10 polls |
| **4.2.12** Artifacts | `get_artifacts()` | Match to existing artifacts | UPSERT `artifacts` (holder/site update) | Every 10 polls |
| **4.2.13** Buildings | `get_buildings()` + enhanced | Update structure counts | UPDATE `sites.details` or `structures` | Every 50 polls |
| **4.2.14** Mandates | `get_mandates()` | Noble governance events | UPDATE `entities.details` | Every 10 polls |
| **4.2.15** Incidents | `get_incidents()` | Crime/accident records | INSERT `unit_events` (type=incident) | Every poll |

#### Reactive Events (Eventful Subscriptions)

| Event | Trigger | Immediate Action | CDM Target |
|-------|---------|-----------------|------------|
| Unit death | `onUnitDeath` | Extract death cause, update denizen status | `units`, `fortress_denizens`, `unit_events` |
| Item created | `onItemCreated` | Check if artifact/masterwork | `artifacts`, `unit_events` |
| Job completed | `onJobCompleted` | Mark unit for skill rescan | `unit_events` |
| Invasion | `onInvasion` | Trigger army+entity full scan | `unit_events`, entity updates |
| Syndrome | `onSyndrome` | Health tracking | `unit_events` |

### 4.3 Adventure Mode

**Trigger**: Game loaded into adventure mode
**Polling**: Every 50 ticks (~1.2 seconds, faster due to real-time nature)

#### ETL Stages

| Stage | Extraction | Transformation | Loading |
|-------|-----------|---------------|---------|
| **4.3.1** Player state | `get_player_unit()` | Full unit extraction | UPSERT `units` + `fortress_denizens` |
| **4.3.2** Companions | `get_nearby_units()` filter | Companion tracking | UPSERT `units` |
| **4.3.3** Location | `get_current_site()` | Site/region detection | UPDATE visit log in `unit_events` |
| **4.3.4** Combat | `get_combat_state()` | Combat event stream | INSERT `unit_events` |
| **4.3.5** Conversations | `get_conversations()` | Dialogue capture | INSERT `unit_events` |
| **4.3.6** Travel | `get_travel_state()` | Route/destination tracking | UPDATE `units.details` |

---

## 5. CDM Schema Changes Required

### 5.1 Fix APPEND Violations (from 1:1 Review)

```sql
-- V1: Fix units PK to composite
ALTER TABLE units DROP CONSTRAINT units_pkey;
ALTER TABLE units ADD PRIMARY KEY (world_id, id);

-- V3: New entity-entity links table
CREATE TABLE IF NOT EXISTS entity_entity_links (
    world_id            INT NOT NULL,
    source_entity_id    INT NOT NULL,
    target_entity_id    INT NOT NULL,
    link_type           TEXT NOT NULL,  -- 'PARENT', 'CHILD', 'RELIGIOUS'
    strength            SMALLINT DEFAULT 100,
    PRIMARY KEY (world_id, source_entity_id, target_entity_id, link_type),
    FOREIGN KEY (world_id, source_entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE,
    FOREIGN KEY (world_id, target_entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE
);

-- V4: New entity-site links table
CREATE TABLE IF NOT EXISTS entity_site_links (
    world_id            INT NOT NULL,
    entity_id           INT NOT NULL,
    site_id             INT NOT NULL,
    link_type           TEXT NOT NULL,  -- 'All', 'Inside_Wall', 'Local_Activity', etc.
    flags               JSONB DEFAULT '{}',  -- capital, fortress, holy_city, trade_partner, etc.
    start_year          INT,
    end_year            INT,
    link_strength       INT DEFAULT 100,
    PRIMARY KEY (world_id, entity_id, site_id, link_type),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE,
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id) ON DELETE CASCADE
);

-- New columns
ALTER TABLE hf_links ADD COLUMN IF NOT EXISTS strength SMALLINT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS founded_year INT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS founder_entity_id INT;

-- Add source tracking to history_events
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends_xml';
-- Values: 'legends_xml', 'live_bridge', 'worldgen', 'adventure'
```

### 5.2 Optional New Tables (Phase 3 stretch goals)

```sql
-- Belief systems (religions)
CREATE TABLE IF NOT EXISTS belief_systems (
    world_id    INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id          INT NOT NULL,
    name        TEXT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

-- Cultural identities
CREATE TABLE IF NOT EXISTS cultural_identities (
    world_id    INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id          INT NOT NULL,
    name        TEXT,
    entity_id   INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

---

## 6. Implementation Order

### Phase 3.1: Bridge Enhancements (Week 1-2)

```
Step 1: CDM schema migration (V1-V4 fixes + new tables)
Step 2: Add eventful subscriptions to chronicler-bridge.lua
Step 3: Add get_death_causes() extraction
Step 4: Add get_family_chains() extraction
Step 5: Add get_soul_deep() for full personality
Step 6: Add get_entity_relationships() extraction
Step 7: Python watcher enhancements:
  - Delta detection for unit_events CDC
  - Denizen lifecycle detection (arrival/departure/death)
  - Death cause enrichment pipeline
  - Family chain → hf_links upsert with strength
  - Entity relationship loading
Step 8: Reconciliation job (live events → history events)
```

### Phase 3.2: Worldgen Monitoring (Week 2)

```
Step 1: Write worldgen-bridge.lua (status + terrain sampling)
Step 2: Python worldgen watcher mode
Step 3: worldgen_snapshots loading
Step 4: Post-worldgen full data extraction
Step 5: WebSocket endpoint for live dashboard push
```

### Phase 3.3: Knowledge Horizon (Week 3-4)

```
Step 1: knowledge_horizon table + visibility views
Step 2: KH Phase 1 — Denizen registry initialization
Step 3: KH Phase 2 — Family scope expansion
Step 4: KH Phase 3 — Geographic + civilization scope
Step 5: Explorer toggle (KH-filtered vs omniscient)
Step 6: Storyteller integration with visible_* views
```

### Phase 3.4: Embedding Pipelines (Week 4)

```
Step 1: Text extractors for all entity types
Step 2: Chunking strategy (512-token, 64-overlap)
Step 3: chronicler embed CLI command
Step 4: Incremental live embedding (content_hash delta)
Step 5: Hybrid search (ILIKE + pgvector + RRF)
```

---

## 7. Data Volume Estimates

| Data Source | Records per Poll | Polls per Game-Hour | Total/Hour | CDM Table |
|------------|-----------------|--------------------:|----------:|-----------|
| Units (fortress) | 150-300 | 1,500 | 150-300 upserts | `units` |
| Unit events (CDC) | 5-20 | 1,500 | 7,500-30,000 inserts | `unit_events` |
| Announcements | 0-10 | 1,500 | 0-15,000 inserts | `game_reports` |
| History events | 0-5 | 1,500 | 0-7,500 inserts | `history_events` |
| Denizen updates | 0-5 | 1,500 | 0-7,500 upserts | `fortress_denizens` |
| Worldgen snapshots | 1 | 7,200 | 7,200 inserts | `worldgen_snapshots` |

**Total write throughput**: ~30,000-60,000 rows/hour during active fortress play.
**PostgreSQL capacity**: Well within single-node PostgreSQL limits (~100K inserts/sec).

---

## 8. Error Handling & Recovery

### 8.1 Bridge Failures
- Each extraction function is already wrapped in `pcall` (safe call)
- Failed sections produce `null` in JSON — watcher skips missing sections
- Bridge writes complete JSON atomically (temp file + rename)

### 8.2 Watcher Failures
- Each CDM domain processed independently — one failure doesn't block others
- Cursor-based event tracking (announcements, history) survives restarts
- Delta detection cache rebuilt from CDM state on restart

### 8.3 Database Failures
- asyncpg pool auto-reconnects
- Failed upserts logged and retried next cycle
- worldgen_snapshots are append-only (no data loss risk)

---

## 9. Testing Strategy

| Test Level | What | How |
|-----------|------|-----|
| Unit tests | Transform functions (normalize, delta detect) | pytest with fixture data |
| Integration | Bridge→Watcher→DB pipeline | VM test world + 5-minute fortress session |
| Regression | No CDM table damage | Schema validation before/after watcher run |
| Load test | 1-hour fortress session throughput | Monitor DB write latency + row counts |
| Mode test | Worldgen + fortress + adventure transitions | Full lifecycle test |
