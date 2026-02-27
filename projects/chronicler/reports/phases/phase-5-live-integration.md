# Phase 5: Live Integration -- PRD/Roadmap

**Version**: 1.0
**Date**: 2026-02-25
**Phase Duration**: 3-4 weeks
**Milestone**: M5 -- Live Complete
**Entry State**: Bridge v6 (7 domains, polling only), no worldgen monitoring, no Knowledge Horizon
**Exit State**: Enhanced bridge with eventful + enrichment, worldgen monitoring with live map, Knowledge Horizon Phase 1-3, embedding pipelines for live data

**Parent Document**: Full Project Roadmap (full-project-roadmap.md)
**Dependencies**: Phase 1 (complete CDM), Phase 3 (storyteller for KH integration)
**Requirements Covered**: REQ-ETL-005 through ETL-012, REQ-KH-001 through KH-012, REQ-STR-032, REQ-EMB-001 through EMB-006

---

## 1. Phase Overview

Phase 5 extends Chronicler's real-time data capabilities in four directions: (1) enhancing the live bridge with reactive event subscriptions and richer data extraction, (2) building the worldgen monitoring system for watching world generation in real time, (3) implementing the Knowledge Horizon masking system that limits the storyteller's and explorer's knowledge to what the fortress plausibly knows, and (4) activating the embedding pipelines for both batch legends data and live in-game data, enabling semantic search and richer narrative context retrieval.

### 1.1 Current Live Bridge State (v6)

**chronicler-bridge.lua** (922 lines):
- DFHack repeat job every 100 ticks (~2.4 seconds)
- 7 data domains: game time, creature raws, unit summary, armies, buildings, artifacts, announcements, diplomacy, history
- JSON output served over HTTP port 8889
- Polling-only (no event subscriptions)
- No death cause enrichment
- No family chain extraction
- No personality/soul data

### 1.2 What This Phase Adds

- **Reactive events**: DFHack eventful subscriptions for immediate notification of deaths, item creation, job completion, invasions, and syndrome onset
- **Data enrichment**: Death cause lookup, family chain, book detection, personality data, skill tracking
- **Worldgen monitoring**: Novel capability to watch world generation progress in real time
- **Knowledge Horizon**: Dynamic visibility masking that filters data based on what the fortress knows
- **Embedding pipelines**: Batch and incremental embedding generation, hybrid semantic search, narrative context retrieval for the storyteller

---

## 2. Stage 5.1: Bridge Enhancements

**Duration**: 1-2 weeks
**Dependencies**: Phase 1 (HF field extensions for enrichment targets)
**Deliverables**: Enhanced chronicler-bridge.lua + Python-side consumers

### 2.1 Eventful Subscriptions

**Requirement**: REQ-ETL-006
**Priority**: P2

**Description**: Add DFHack eventful module subscriptions for reactive event capture.

**Lua implementation** (additions to chronicler-bridge.lua):
```lua
local eventful = require('plugins.eventful')

-- Event buffers (cleared each bridge cycle)
local pending_events = {
    unit_deaths = {},
    items_created = {},
    jobs_completed = {},
    new_units = {},
    syndromes = {},
    invasions = {},
}

-- Subscribe to events
eventful.onUnitDeath['chronicler'] = function(unit_id)
    table.insert(pending_events.unit_deaths, {
        unit_id = unit_id,
        tick = dfhack.world.ReadCurrentTick(),
    })
end

eventful.onItemCreated['chronicler'] = function(item_id)
    table.insert(pending_events.items_created, {
        item_id = item_id,
        tick = dfhack.world.ReadCurrentTick(),
    })
end

eventful.onJobCompleted['chronicler'] = function(job)
    table.insert(pending_events.jobs_completed, {
        job_type = tostring(job.job_type),
        pos = {x = job.pos.x, y = job.pos.y, z = job.pos.z},
        tick = dfhack.world.ReadCurrentTick(),
    })
end

eventful.onInvasion['chronicler'] = function()
    table.insert(pending_events.invasions, {
        tick = dfhack.world.ReadCurrentTick(),
    })
end

-- Enable events
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 0)
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 0)
eventful.enableEvent(eventful.eventType.JOB_COMPLETED, 0)
eventful.enableEvent(eventful.eventType.INVASION, 0)

-- Flush event buffers during each bridge cycle
local function flush_events()
    local events = pending_events
    pending_events = {
        unit_deaths = {},
        items_created = {},
        jobs_completed = {},
        new_units = {},
        syndromes = {},
        invasions = {},
    }
    return events
end
```

**Integration with bridge cycle**: During each 100-tick bridge output, include a `reactive_events` section containing all buffered events since last cycle.

**Python consumer**: The watcher processes reactive events with higher priority than polled data (immediate death notifications, invasion alerts).

### 2.2 Death Cause Enrichment

**Requirement**: REQ-ETL-007
**Priority**: P2

**Description**: Look up death cause from `df.global.world.incidents.all` when a death event is detected.

**Lua implementation**:
```lua
local function get_death_cause(unit_id)
    local incidents = df.global.world.incidents.all
    for i = #incidents - 1, math.max(0, #incidents - 100), -1 do
        local incident = incidents[i]
        if incident._type == df.incident_type.Death then
            if incident.victim == unit_id then
                local result = {
                    death_cause = df.death_type[incident.death_cause] or tostring(incident.death_cause),
                    death_cause_id = incident.death_cause,
                }
                -- Killer info
                if incident.criminal and incident.criminal >= 0 then
                    local killer = df.unit.find(incident.criminal)
                    if killer then
                        result.killer_unit_id = incident.criminal
                        result.killer_name = dfhack.units.getReadableName(killer)
                        result.killer_race = dfhack.units.getRaceName(killer)
                        result.killer_hf_id = killer.hist_figure_id
                    end
                end
                return result
            end
        end
    end
    return nil
end
```

**Integration**: When `onUnitDeath` fires, immediately enrich with death cause before buffering.

### 2.3 Family Chain Extraction

**Requirement**: REQ-ETL-008
**Priority**: P2

**Lua implementation**:
```lua
local function get_family_chain(unit)
    local family = {}

    -- Direct relationships
    if unit.relationship_ids.Mother >= 0 then
        family.mother_hf_id = unit.relationship_ids.Mother
    end
    if unit.relationship_ids.Father >= 0 then
        family.father_hf_id = unit.relationship_ids.Father
    end
    if unit.relationship_ids.Spouse >= 0 then
        family.spouse_hf_id = unit.relationship_ids.Spouse
    end

    -- Children (from HF links if available)
    if unit.hist_figure_id >= 0 then
        local hf = df.historical_figure.find(unit.hist_figure_id)
        if hf then
            family.children_hf_ids = {}
            for _, link in ipairs(hf.histfig_links) do
                if link._type == df.histfig_hf_link_childst then
                    table.insert(family.children_hf_ids, link.target_hf)
                end
            end
        end
    end

    return family
end
```

### 2.4 Book Detection

**Requirement**: REQ-ETL-009
**Priority**: P3

```lua
local function get_book_title(item)
    local ok, title = pcall(function()
        return dfhack.items.getBookTitle(item)
    end)
    if ok and title and title ~= '' then
        return title
    end
    return nil
end
```

### 2.5 Personality/Soul Data

**Requirement**: REQ-ETL-010
**Priority**: P2

**Lua implementation**:
```lua
local function get_personality_data(unit)
    local soul = unit.status.current_soul
    if not soul then return nil end

    local personality = soul.personality
    if not personality then return nil end

    local result = {
        stress_level = personality.stress_level,
    }

    -- 50 personality facets
    result.traits = {}
    for i = 0, #personality.traits - 1 do
        result.traits[i] = personality.traits[i]
    end

    -- Values/beliefs
    result.values = {}
    for _, v in ipairs(personality.values) do
        table.insert(result.values, {
            type = tostring(v.type),
            strength = v.strength,
        })
    end

    -- Goals
    result.goals = {}
    for _, g in ipairs(personality.goals) do
        table.insert(result.goals, {
            type = tostring(g.type),
            accomplished = g.flags.accomplished,
        })
    end

    -- Needs
    result.needs = {}
    for _, n in ipairs(personality.needs) do
        table.insert(result.needs, {
            type = tostring(n.id),
            focus_level = n.focus_level,
        })
    end

    -- Emotions (recent)
    result.emotions = {}
    for i = math.max(0, #personality.emotions - 20), #personality.emotions - 1 do
        local e = personality.emotions[i]
        table.insert(result.emotions, {
            type = tostring(e.type),
            strength = e.strength,
            thought = tostring(e.thought),
        })
    end

    return result
end
```

### 2.6 Skill Progression Tracking

**Requirement**: REQ-ETL-011
**Priority**: P2

```lua
local function get_skills(unit)
    local soul = unit.status.current_soul
    if not soul then return {} end

    local skills = {}
    for _, skill in ipairs(soul.skills) do
        table.insert(skills, {
            id = skill.id,
            name = df.job_skill[skill.id] or tostring(skill.id),
            rating = skill.rating,
            experience = skill.experience,
        })
    end
    return skills
end
```

**Python-side delta tracking**: Compare skill snapshots between watcher cycles. Generate SKILL_UP events when rating increases.

---

## 3. Stage 5.2: Worldgen Monitoring

**Duration**: 1 week
**Dependencies**: Phase 1 (worldgen_snapshots table), Phase 4 (map rendering for preview)
**Deliverables**: worldgen-bridge.lua, Python ingester, live map preview

### 3.1 worldgen-bridge.lua

**Requirement**: REQ-ETL-012
**Priority**: P2

**Description**: A separate DFHack Lua script that monitors world generation progress.

```lua
-- worldgen-bridge.lua
-- Polls df.global.world.worldgen_status every 30 frames (~0.5s)
-- Writes JSON snapshots to file for HTTP serving

local repeatUtil = require('repeat-util')
local json = require('json')

local OUTPUT_PATH = 'worldgen-status.json'
local POLL_INTERVAL = 30  -- frames

local function get_worldgen_status()
    local wgs = df.global.world.worldgen_status
    if not wgs then return nil end

    local status = {
        state = tostring(wgs.state),
        cur_year = wgs.cur_year or 0,
        timestamp = os.time(),
    }

    -- Phase progress indicators
    local ok, _ = pcall(function()
        status.rivers_generated = wgs.rivers_generated or 0
        status.civs_generated = wgs.civs_generated or 0
        status.megabeasts_placed = wgs.megabeasts_placed or false
        status.caves_placed = wgs.caves_placed or false
    end)

    -- Count generated entities (safe access)
    pcall(function()
        status.figure_count = #df.global.world.history.figures
        status.event_count = #df.global.world.history.events
        status.site_count = #df.global.world.world_data.sites
        status.entity_count = #df.global.world.entities.all
    end)

    -- Region map for live preview (if terrain phase complete)
    if wgs.state ~= 'None' and wgs.state ~= 'Terrain' then
        pcall(function()
            local region_map = df.global.world.world_data.region_map
            if region_map then
                status.map_width = df.global.world.world_data.world_width
                status.map_height = df.global.world.world_data.world_height
                -- Extract terrain type grid (compressed)
                status.terrain_grid = extract_terrain_grid(region_map,
                    status.map_width, status.map_height)
            end
        end)
    end

    return status
end

local function extract_terrain_grid(region_map, width, height)
    -- Extract region types as flat array (one byte per tile)
    -- Compressed for transfer: run-length encode
    local grid = {}
    for x = 0, width - 1 do
        for y = 0, height - 1 do
            local ok, val = pcall(function()
                return region_map[x][y].region_id
            end)
            table.insert(grid, ok and val or 0)
        end
    end
    return grid
end

-- Auto-start on worldgen
dfhack.onStateChange.worldgen_monitor = function(code)
    if code == SC_WORLD_LOADED then
        -- Check if this is worldgen
        if df.global.world.worldgen_status and
           df.global.world.worldgen_status.state ~= 'None' then
            start_monitoring()
        end
    elseif code == SC_WORLD_UNLOADED then
        stop_monitoring()
    end
end

local function start_monitoring()
    repeatUtil.scheduleEvery('worldgen-monitor', POLL_INTERVAL, 'frames', function()
        local status = get_worldgen_status()
        if status then
            local f = io.open(OUTPUT_PATH, 'w')
            f:write(json.encode(status))
            f:close()
        end
    end)
    print('[Chronicler] Worldgen monitoring started')
end

local function stop_monitoring()
    repeatUtil.cancel('worldgen-monitor')
    print('[Chronicler] Worldgen monitoring stopped')
end
```

### 3.2 Python Worldgen Snapshot Ingester

**Requirement**: REQ-ETL-012
**Priority**: P2

```python
class WorldgenIngester:
    """Polls worldgen-status.json and stores snapshots in PostgreSQL."""

    POLL_INTERVAL = 2.0  # seconds
    SNAPSHOT_INTERVAL = 10.0  # seconds between DB writes

    async def run(self, world_id: int):
        last_snapshot = 0
        while True:
            status = await self._fetch_status()
            if status:
                # Always update in-memory state
                self._current_status = status

                # Periodic DB snapshots
                now = time.time()
                if now - last_snapshot >= self.SNAPSHOT_INTERVAL:
                    await self._store_snapshot(world_id, status)
                    last_snapshot = now

                # Push to WebSocket clients
                await self._broadcast(status)

                # Check for completion
                if status.get('state') == 'Done':
                    await self._store_snapshot(world_id, status)
                    break

            await asyncio.sleep(self.POLL_INTERVAL)

    async def _store_snapshot(self, world_id: int, status: dict):
        """Store snapshot in worldgen_snapshots table."""
        await db.execute(
            "INSERT INTO worldgen_snapshots (world_id, phase, progress_pct, cur_year, data) "
            "VALUES (:wid, :phase, :pct, :year, :data)",
            {
                'wid': world_id,
                'phase': status['state'],
                'pct': self._estimate_progress(status),
                'year': status.get('cur_year', 0),
                'data': json.dumps(status),
            }
        )
```

### 3.3 Worldgen Live Map Preview

**Requirement**: REQ-VIS-008
**Priority**: P3

**WebSocket endpoint**: `ws://localhost:8000/ws/worldgen`

```python
@app.websocket("/ws/worldgen")
async def worldgen_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            status = ingester._current_status
            if status:
                await websocket.send_json(status)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
```

**Frontend**: Progressive terrain visualization showing the world map building up as worldgen progresses.

### 3.4 Worldgen Dashboard

**Requirement**: REQ-ETL-012
**Priority**: P2

**Route**: `GET /explorer/worldgen?world_id={wid}`

**Content**:
- Current phase (with progress bar)
- Generation year counter
- Entity counts (figures, events, sites, entities) as live-updating cards
- Mini terrain map (progressive rendering)
- Phase timeline (which phases completed, duration of each)
- Final statistics on completion

---

## 4. Stage 5.3: Knowledge Horizon

**Duration**: 2-3 weeks
**Dependencies**: Phase 1 (complete HF data), Phase 2 (entity detail pages), Phase 3 (storyteller)
**Deliverables**: KH table, masking views, phased rollout (3 of 4 phases), storyteller integration

### 4.1 Database Architecture

**Requirement**: REQ-KH-011
**Priority**: P2

```sql
-- Knowledge horizon control table
CREATE TABLE knowledge_horizon (
    world_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,  -- 'hf', 'entity', 'site', 'region', 'artifact'
    entity_id INTEGER NOT NULL,
    visible BOOLEAN DEFAULT FALSE,
    reason TEXT,  -- why this entity is visible (for debugging)
    revealed_at TIMESTAMP DEFAULT NOW(),
    revealed_by TEXT,  -- event or mechanism that revealed this entity
    PRIMARY KEY (world_id, entity_type, entity_id)
);

CREATE INDEX idx_kh_visible ON knowledge_horizon(world_id, entity_type, visible);

-- View-based masking: visible_* views filter through KH
CREATE OR REPLACE VIEW visible_historical_figures AS
SELECT hf.*
FROM historical_figures hf
JOIN knowledge_horizon kh ON kh.world_id = hf.world_id
    AND kh.entity_type = 'hf'
    AND kh.entity_id = hf.id
    AND kh.visible = TRUE;

CREATE OR REPLACE VIEW visible_entities AS
SELECT e.*
FROM entities e
JOIN knowledge_horizon kh ON kh.world_id = e.world_id
    AND kh.entity_type = 'entity'
    AND kh.entity_id = e.id
    AND kh.visible = TRUE;

CREATE OR REPLACE VIEW visible_sites AS
SELECT s.*
FROM sites s
JOIN knowledge_horizon kh ON kh.world_id = s.world_id
    AND kh.entity_type = 'site'
    AND kh.entity_id = s.id
    AND kh.visible = TRUE;

-- Events are visible if any referenced entity is visible
CREATE OR REPLACE VIEW visible_events AS
SELECT DISTINCT he.*
FROM history_events he
JOIN event_entity_xref xref ON xref.world_id = he.world_id AND xref.event_id = he.id
JOIN knowledge_horizon kh ON kh.world_id = xref.world_id
    AND kh.entity_type = xref.entity_type
    AND kh.entity_id = xref.entity_id
    AND kh.visible = TRUE;
```

### 4.2 KH Phase 1: Denizen Registry Initialization

**Requirement**: REQ-KH-012
**Priority**: P2

**Description**: Initialize the knowledge horizon from the fortress denizen registry.

```python
class KnowledgeHorizonInitializer:
    """Initialize KH from fortress denizens."""

    async def initialize(self, world_id: int):
        """Set initial visibility based on fortress inhabitants."""
        # Get all fortress denizens
        denizens = await db.fetch_all(
            "SELECT unit_id, hist_fig_id FROM fortress_denizens WHERE world_id = :wid",
            {'wid': world_id}
        )

        visibility_entries = []

        for denizen in denizens:
            hf_id = denizen['hist_fig_id']
            if hf_id:
                # The denizen themselves
                visibility_entries.append(('hf', hf_id, 'fortress_denizen'))

        # Batch insert
        await self._batch_insert(world_id, visibility_entries)
```

### 4.3 KH Phase 2: Individual Scope Masking

**Requirement**: REQ-KH-003
**Priority**: P2

**Description**: Make fortress inhabitants and their direct family visible.

```python
async def expand_individual_scope(self, world_id: int):
    """Phase 2: Expand visibility to direct family of all visible HFs."""
    # Get all currently visible HFs
    visible_hfs = await db.fetch_all(
        "SELECT entity_id FROM knowledge_horizon "
        "WHERE world_id = :wid AND entity_type = 'hf' AND visible = TRUE",
        {'wid': world_id}
    )

    new_visible = []
    for row in visible_hfs:
        hf_id = row['entity_id']
        # Get direct family links
        family = await db.fetch_all(
            "SELECT target_hf_id, link_type FROM hf_links "
            "WHERE world_id = :wid AND source_hf_id = :hf_id "
            "AND link_type IN ('Mother', 'Father', 'Child', 'Spouse')",
            {'wid': world_id, 'hf_id': hf_id}
        )
        for link in family:
            new_visible.append(('hf', link['target_hf_id'], f'family_of_{hf_id}'))

    await self._batch_insert(world_id, new_visible)
```

### 4.4 KH Phase 3: Geographic and Civilization Scope

**Requirement**: REQ-KH-001, REQ-KH-002
**Priority**: P2

**Geographic masking**:
```python
async def expand_geographic_scope(self, world_id: int):
    """Phase 3a: Make fortress region + adjacent regions visible."""
    # Get fortress site coordinates
    fortress_site = await get_fortress_site(world_id)
    if not fortress_site:
        return

    fx, fy = parse_coords(fortress_site.coords)[0]

    # Visible regions: fortress region + all adjacent (8-connected)
    adjacent_regions = await db.fetch_all(
        "SELECT id FROM regions WHERE world_id = :wid "
        "AND EXISTS (SELECT 1 FROM unnest(string_to_array(coords, '|')) AS c "
        "  WHERE abs(split_part(c, ',', 1)::int - :fx) <= 5 "
        "    AND abs(split_part(c, ',', 2)::int - :fy) <= 5)",
        {'wid': world_id, 'fx': fx, 'fy': fy}
    )

    for region in adjacent_regions:
        await self._set_visible(world_id, 'region', region['id'], 'geographic_proximity')

    # Make all sites in visible regions visible
    for region in adjacent_regions:
        sites_in_region = await db.fetch_all(
            "SELECT id FROM sites WHERE world_id = :wid "
            "AND details->>'region_id' = :rid",
            {'wid': world_id, 'rid': str(region['id'])}
        )
        for site in sites_in_region:
            await self._set_visible(world_id, 'site', site['id'], f'in_visible_region_{region["id"]}')
```

**Civilization masking**:
```python
async def expand_civilization_scope(self, world_id: int):
    """Phase 3b: Make parent civilization structure visible."""
    # Get fortress entity
    fortress_entity = await get_fortress_entity(world_id)
    if not fortress_entity:
        return

    # Parent civ and its structure
    await self._set_visible(world_id, 'entity', fortress_entity.id, 'fortress_entity')

    # Parent civ's sites
    civ_sites = await db.fetch_all(
        "SELECT id FROM sites WHERE world_id = :wid AND owner_entity_id = :eid",
        {'wid': world_id, 'eid': fortress_entity.id}
    )
    for site in civ_sites:
        await self._set_visible(world_id, 'site', site['id'], f'civ_site_{fortress_entity.id}')

    # Parent civ's leaders (nobles always visible -- CAV-002)
    leaders = await db.fetch_all(
        "SELECT hf_id FROM hf_entity_links "
        "WHERE world_id = :wid AND entity_id = :eid AND link_type = 'Position'",
        {'wid': world_id, 'eid': fortress_entity.id}
    )
    for leader in leaders:
        await self._set_visible(world_id, 'hf', leader['hf_id'], f'noble_of_{fortress_entity.id}')
```

### 4.5 Event-Based Revelation

**Requirement**: REQ-KH-009
**Priority**: P2

```python
REVELATION_RULES = {
    'war_declared': lambda e: [
        ('entity', e['details'].get('aggressor_ent_id'), 'war_revelation'),
        ('entity', e['details'].get('defender_ent_id'), 'war_revelation'),
    ],
    'caravan_arrived': lambda e: [
        ('entity', e['details'].get('source_entity_id'), 'caravan_contact'),
        ('site', e['details'].get('source_site_id'), 'caravan_origin'),
    ],
    'migrant_arrived': lambda e: [
        ('site', e['details'].get('origin_site_id'), 'migrant_knowledge'),
    ],
    'raid_launched': lambda e: [
        ('site', e['details'].get('target_site_id'), 'raid_target'),
        ('entity', e['details'].get('target_entity_id'), 'raid_target_entity'),
    ],
    'artifact_found': lambda e: [
        ('artifact', e['details'].get('artifact_id'), 'artifact_discovery'),
    ],
}

async def process_revelation_event(self, world_id: int, event: dict):
    """Process a live event for KH revelations."""
    event_type = event.get('type', '')
    rule = REVELATION_RULES.get(event_type)
    if rule:
        revelations = rule(event)
        for entity_type, entity_id, reason in revelations:
            if entity_id:
                await self._set_visible(world_id, entity_type, entity_id, reason)
                # Cascade: if entity revealed, reveal its members/sites
                await self._cascade_revelation(world_id, entity_type, entity_id)
```

### 4.6 Caveats Implementation

**CAV-001: Organization Membership Propagation** (REQ-KH-004):
- Cults: full membership revealed
- Squads: chain-of-command revealed
- Guilds: same-site members only
- Religion: nearby temples/worshippers
- Civilization: NO automatic propagation (too broad)

**CAV-002: Nobles Always Visible** (REQ-KH-005):
- All HFs with position assignments in the fortress entity are always visible

**CAV-006: Event-Based Revelation** (REQ-KH-009):
- Wars reveal enemy civilization
- Caravans reveal source civilization
- Migrants reveal origin site
- Raids reveal target
- Artifacts reveal full artifact history

**CAV-007: LLM Inference Restrictions** (REQ-KH-010):
```python
KH_SYSTEM_PROMPT_ADDENDUM = """
## Knowledge Horizon
You are limited to knowledge that the fortress of {fortress_name} plausibly possesses.
You know about:
- All inhabitants of the fortress and their direct families
- Your parent civilization and its public figures
- Civilizations you have had contact with (trade, war, diplomacy)
- Geographic regions near the fortress
- Events that have directly affected the fortress

You do NOT know about:
- Distant civilizations with no contact
- Events in far-off lands
- Historical figures unconnected to your civilization
- Secret identities (unless revealed in-game)

If asked about something outside your knowledge, say: "The fortress has no knowledge of this."
Treat this as an in-world limitation, not a system error.
"""
```

### 4.7 Storyteller Integration

**Requirement**: REQ-STR-032
**Priority**: P2

```python
async def build_storyteller_context(world_id: int, query: str, kh_enabled: bool = True):
    """Build storyteller context with optional KH filtering."""
    if kh_enabled:
        # Query against visible_* views
        hfs = await db.fetch_all("SELECT * FROM visible_historical_figures WHERE world_id = :wid", ...)
        events = await db.fetch_all("SELECT * FROM visible_events WHERE world_id = :wid", ...)
        # Add KH system prompt addendum
        system_prompt += KH_SYSTEM_PROMPT_ADDENDUM
    else:
        # Full omniscient mode
        hfs = await db.fetch_all("SELECT * FROM historical_figures WHERE world_id = :wid", ...)
        events = await db.fetch_all("SELECT * FROM history_events WHERE world_id = :wid", ...)
```

**Mode toggle**: KH can be enabled/disabled per session. Explorer pages show a "Knowledge Horizon" toggle in the toolbar.

---

## 5. Stage 5.4: Modified Embedding Pipelines for Live In-Game Data

**Duration**: 1 week
**Dependencies**: Phase 1 (embeddings table schema, pgvector), Stage 5.1 (live bridge data)
**Deliverables**: Text extraction pipeline, batch + incremental embedding generation, semantic search integration

### 5.1 Current Embedding Infrastructure

Phase 1 created the plumbing but not the pump:

- **pgvector extension**: Installed in PostgreSQL
- **`embeddings` table**: Schema created (0 rows) — `entity_type`, `entity_id`, `chunk_index`, `chunk_text`, `content_hash`, `embedding vector(2560)`, `created_at`
- **pgvector codec**: Registered on every DB connection via `register_vector(conn)`
- **MLX embedding server**: Qwen3-Embedding-4B at `localhost:8000`, 2560-dim output

What's missing: text extraction, chunking strategy, embedding generation code, downstream consumers.

### 5.2 Text Extraction Pipeline

**Requirement**: REQ-EMB-001
**Priority**: P2

**Description**: Build entity-type-specific text extractors that concatenate relevant fields into embeddable text representations.

```python
TEXT_EXTRACTORS = {
    'hf': lambda hf: f"{hf['name']}. {hf['race']} {hf['caste']}. "
          f"Born year {hf.get('birth_year', '?')}. "
          f"{hf.get('associated_type', '')}. "
          f"{'; '.join(hf.get('spheres', []))}",

    'site': lambda s: f"{s['name']} ({s['type']}). "
            f"Coordinates: {s.get('coords', '?')}. "
            f"Owner: {s.get('owner_entity_name', 'none')}",

    'entity': lambda e: f"{e['name']} ({e['type']}). "
              f"Race: {e.get('race', '?')}. "
              f"Worship: {', '.join(e.get('worship_ids', []))}",

    'artifact': lambda a: f"{a['name']}. {a.get('item_description', '')}. "
                f"Material: {a.get('mat', '?')}",

    'event': lambda ev: f"Year {ev.get('year', '?')}: {ev['type']}. "
             f"{ev.get('details_text', '')}",

    'written_content': lambda wc: f"{wc['title']}. "
                       f"Form: {wc.get('form', '?')}. "
                       f"Author: {wc.get('author_name', '?')}",
}
```

**Live data text extraction**: For bridge data (units, announcements, artifacts), the text extractor runs on each watcher cycle's changed entities. The `content_hash` field in the embeddings table enables incremental re-embedding — only entities whose extracted text has changed need new vectors.

### 5.3 Chunking Strategy

**Requirement**: REQ-EMB-002
**Priority**: P2

**Description**: Define how entity text is split for embedding when it exceeds the model's optimal input length.

```python
class EntityChunker:
    """Split entity text into embedding-sized chunks."""

    MAX_TOKENS = 512  # Qwen3-Embedding-4B optimal input
    OVERLAP_TOKENS = 64  # Overlap between chunks for context continuity

    def chunk(self, text: str, entity_type: str, entity_id: int) -> list[dict]:
        """Return list of {chunk_index, chunk_text, content_hash}."""
        tokens = self.tokenize(text)
        if len(tokens) <= self.MAX_TOKENS:
            return [{
                'chunk_index': 0,
                'chunk_text': text,
                'content_hash': hashlib.sha256(text.encode()).hexdigest(),
            }]

        chunks = []
        start = 0
        idx = 0
        while start < len(tokens):
            end = min(start + self.MAX_TOKENS, len(tokens))
            chunk_text = self.detokenize(tokens[start:end])
            chunks.append({
                'chunk_index': idx,
                'chunk_text': chunk_text,
                'content_hash': hashlib.sha256(chunk_text.encode()).hexdigest(),
            })
            start += self.MAX_TOKENS - self.OVERLAP_TOKENS
            idx += 1
        return chunks
```

**Chunking by entity type**:
- **Historical figures**: Rarely exceed 512 tokens — single chunk typical
- **Events**: Always single chunk (extracted text is short)
- **Sites with long histories**: May produce 2-3 chunks
- **Written content**: Title + form metadata only (not full text) — single chunk

### 5.4 Batch Embedding CLI Command

**Requirement**: REQ-EMB-003
**Priority**: P2

**Description**: Add `chronicler embed` CLI command that generates embeddings for all entities after legends ingestion.

```python
@app.command()
def embed(
    world_name: str = typer.Option(..., help="World to embed"),
    entity_types: str = typer.Option("all", help="Comma-separated types or 'all'"),
    force: bool = typer.Option(False, help="Re-embed even if content_hash unchanged"),
    batch_size: int = typer.Option(64, help="Embedding batch size"),
):
    """Generate embeddings for all entities in the database."""
    world_id = resolve_world(world_name)
    types = ENTITY_TYPES if entity_types == "all" else entity_types.split(",")

    for etype in types:
        entities = fetch_entities(world_id, etype)
        for batch in chunked(entities, batch_size):
            texts = [TEXT_EXTRACTORS[etype](e) for e in batch]
            chunks_list = [chunker.chunk(t, etype, e['id']) for t, e in zip(texts, batch)]

            # Skip unchanged (unless --force)
            if not force:
                chunks_list = filter_changed(world_id, etype, chunks_list)

            if chunks_list:
                embeddings = embed_batch([c['chunk_text'] for cl in chunks_list for c in cl])
                store_embeddings(world_id, etype, chunks_list, embeddings)

        typer.echo(f"  {etype}: {len(entities)} entities embedded")
```

**Performance target**: Embed full Tar Thran world (~109K entities) in < 10 minutes using MLX batch inference.

### 5.5 Incremental Live Embedding

**Requirement**: REQ-EMB-004
**Priority**: P2

**Description**: During watcher cycles, detect changed entities and re-embed only those.

```python
class LiveEmbedder:
    """Incremental embedding for live bridge data."""

    def __init__(self, world_id: int, embedding_client: EmbeddingClient):
        self.world_id = world_id
        self.client = embedding_client
        self.chunker = EntityChunker()

    async def process_changes(self, changes: list[dict]):
        """Process a batch of entity changes from the watcher."""
        to_embed = []

        for change in changes:
            etype = change['entity_type']
            eid = change['entity_id']
            text = TEXT_EXTRACTORS[etype](change['data'])
            chunks = self.chunker.chunk(text, etype, eid)

            # Check content_hash — skip if unchanged
            for chunk in chunks:
                existing_hash = await self._get_existing_hash(etype, eid, chunk['chunk_index'])
                if existing_hash != chunk['content_hash']:
                    to_embed.append((etype, eid, chunk))

        if to_embed:
            texts = [c['chunk_text'] for _, _, c in to_embed]
            vectors = await self.client.embed_batch(texts)
            await self._upsert_embeddings(to_embed, vectors)

    async def process_reactive_event(self, event: dict):
        """Immediately embed high-priority reactive events (deaths, invasions)."""
        text = TEXT_EXTRACTORS['event'](event)
        vector = await self.client.embed(text)
        await self._store_event_embedding(event, text, vector)
```

**Integration point**: The `LiveEmbedder` is instantiated by the watcher daemon and called at the end of each watcher cycle for changed entities, and immediately for reactive events from eventful subscriptions.

### 5.6 Semantic Search Integration

**Requirement**: REQ-EMB-005
**Priority**: P2

**Description**: Augment the global search with pgvector similarity search alongside the existing ILIKE text search.

```python
async def hybrid_search(query: str, world_id: int, limit: int = 20) -> list[dict]:
    """Combine text search (ILIKE) with semantic search (pgvector)."""
    # Text search (existing)
    text_results = await text_search(query, world_id, limit=limit)

    # Semantic search (new)
    query_vector = await embedding_client.embed(query)
    semantic_results = await db.fetch_all(
        "SELECT entity_type, entity_id, chunk_text, "
        "1 - (embedding <=> :vec) AS similarity "
        "FROM embeddings "
        "WHERE world_id = :wid "
        "ORDER BY embedding <=> :vec "
        "LIMIT :lim",
        {'vec': query_vector, 'wid': world_id, 'lim': limit}
    )

    # Merge and rank (RRF — Reciprocal Rank Fusion)
    return reciprocal_rank_fusion(text_results, semantic_results, k=60)
```

**User experience**: The global search bar uses hybrid search transparently. Users see better results for conceptual queries like "who was the most powerful necromancer" or "battles near the mountain" that ILIKE alone would miss.

### 5.7 Narrative Context Retrieval

**Requirement**: REQ-EMB-006
**Priority**: P2

**Description**: Feed relevant embeddings to the storyteller for richer narrative context.

```python
async def get_narrative_context(query: str, world_id: int, max_chunks: int = 10) -> str:
    """Retrieve relevant entity context for storyteller prompts."""
    query_vector = await embedding_client.embed(query)
    relevant = await db.fetch_all(
        "SELECT entity_type, entity_id, chunk_text, "
        "1 - (embedding <=> :vec) AS similarity "
        "FROM embeddings "
        "WHERE world_id = :wid "
        "AND 1 - (embedding <=> :vec) > 0.3 "
        "ORDER BY embedding <=> :vec "
        "LIMIT :lim",
        {'vec': query_vector, 'wid': world_id, 'lim': max_chunks}
    )

    context_parts = []
    for row in relevant:
        context_parts.append(
            f"[{row['entity_type']} #{row['entity_id']}] "
            f"{row['chunk_text']}"
        )
    return "\n\n".join(context_parts)
```

**Storyteller integration**: Before generating a narrative response, the storyteller calls `get_narrative_context()` with the user's query to retrieve semantically relevant entity descriptions. This context is injected into the LLM prompt alongside the SQL-retrieved structured data, giving the storyteller both precise facts (SQL) and broader context (embeddings).

---

## 6. Definition of Done (M5 Milestone)

### Bridge Enhancements
- [ ] Eventful subscriptions (5 event types)
- [ ] Death cause enrichment from incidents
- [ ] Family chain extraction
- [ ] Book detection
- [ ] Personality/soul data (50 facets, values, goals, needs, emotions)
- [ ] Skill progression tracking with delta detection

### Worldgen Monitoring
- [ ] worldgen-bridge.lua polling every 30 frames
- [ ] Auto-start via onStateChange
- [ ] Python snapshot ingester
- [ ] WebSocket push for live updates
- [ ] Worldgen dashboard with phase progress

### Knowledge Horizon
- [ ] knowledge_horizon table + visible_* views
- [ ] KH Phase 1: Denizen registry initialization
- [ ] KH Phase 2: Individual scope (direct family)
- [ ] KH Phase 3: Geographic + civilization scope
- [ ] Event-based revelation rules
- [ ] CAV-001 organization propagation
- [ ] CAV-002 nobles always visible
- [ ] CAV-007 LLM inference restrictions
- [ ] Storyteller integration (query visible_* views)
- [ ] Explorer toggle (KH on/off)

### Embedding Pipelines
- [ ] Entity text extractors for all entity types (HF, site, entity, artifact, event, written content)
- [ ] Chunking strategy with content_hash deduplication
- [ ] `chronicler embed` CLI command (batch embedding after legends ingestion)
- [ ] Incremental live embedding via watcher (content_hash delta detection)
- [ ] Reactive event embedding (immediate embed for deaths, invasions)
- [ ] Hybrid search (ILIKE + pgvector semantic search with RRF ranking)
- [ ] Narrative context retrieval for storyteller prompts

---

*Phase 5: Live Integration PRD/Roadmap v1.1 -- 2026-02-27*
*4 Stages, 35+ Tasks, 3-4 Weeks Estimated*
