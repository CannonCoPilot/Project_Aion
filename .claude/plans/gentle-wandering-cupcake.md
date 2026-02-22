# DFHack Data Streams Expansion — Implementation Plan

## Context

The Chronicler Live Polling Daemon (Phase 1) is complete — it polls `ListUnits` every 30s, detects changes, and logs events to PostgreSQL. But we're only using 7 of 45+ RPC methods. The user wants to:

1. Implement four new RPC data streams (reports, world map, building defs, enriched units)
2. Add a `run_command()` capability to execute arbitrary DFHack console commands
3. Use that to probe DF's memory via Lua for "outside world" data (armies, diplomacy, personality, moods)

### Key Discovery: CoreRunLuaRequest Limitations

`CoreRunLuaRequest` calls **pre-defined Lua module functions** — it does NOT execute arbitrary Lua code. However, `CoreRunCommandRequest` can run the DFHack `lua` console command, which DOES execute arbitrary Lua. Output comes back as `CoreTextNotification` frames (already captured by our `_recv_response()` method).

This means `run_command("lua", "print(#df.global.world.armies.all)")` is viable for probing any data structure in DF's memory.

### What RFR Actually Returns

Important clarification from proto analysis:
- `GetItemList` → `MaterialList` (item *type definitions*, NOT actual items on the map)
- `GetBuildingDefList` → `BuildingList` (building *type definitions*, NOT actual buildings)
- Actual items/buildings are in `MapBlock` via `GetBlockList` (16x16x1 tile blocks — high data volume)
- `GetUnitList` (RFR version) → `UnitDefinition` with inventory, wounds, blood, appearance, noble positions — this IS instance data
- `GetReports` → `Status` with game announcements, combat logs — instance data

So the four streams are really: **Reports** (announcements), **WorldMap** (geography), **Enriched Units** (RFR UnitDefinition), and **RunCommand** (Lua data probe).

---

## Phase 1: Client Methods (DFHackClient)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py`

Add 4 new methods following the existing pattern (`_call()` with timeout + graceful degradation):

### 1a. `get_reports(timeout=15) -> list[dict] | None`
- RPC: `GetReports` → `Status` (plugin=RemoteFortressReader)
- Returns list of `{id, type, text, year, time, pos_x, pos_y, pos_z, is_announcement, repeat_count}`
- Timeout fallback like `get_world_map()`

### 1b. `get_full_world_map(timeout=30) -> dict | None`
- RPC: `GetWorldMap` → `WorldMap` (plugin=RemoteFortressReader)
- Returns `{world_width, world_height, name, name_english, cur_year, cur_year_tick, elevation[], rainfall[], vegetation[], temperature[], evilness[], drainage[], volcanism[], savagery[], salinity[]}`
- One-time pull — cache after first successful call (geography doesn't change mid-game)

### 1c. `get_enriched_units(timeout=30) -> list[dict] | None`
- RPC: `GetUnitList` → `UnitList` (plugin=RemoteFortressReader)
- Returns extended unit data: `{id, pos, race, name, blood_max, blood_count, is_soldier, age, noble_positions[], inventory[], wounds[], appearance}`
- Merges with core `list_units()` data to enrich `units.details`

### 1d. `run_command(command: str, *args: str) -> list[str]`
- RPC: `RunCommand` → `EmptyMessage` (core method, no plugin needed)
- Captures TEXT notification frames as output
- No timeout wrapper needed (core methods don't hang on pause)
- Returns list of output lines

---

## Phase 2: Schema Extensions

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

### 2a. `game_reports` table
```sql
CREATE TABLE IF NOT EXISTS game_reports (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    report_id       INT NOT NULL,          -- DF's internal report ID
    report_type     INT,
    text            TEXT NOT NULL,
    game_year       INT,
    game_tick       INT,
    pos_x           INT,
    pos_y           INT,
    pos_z           INT,
    is_announcement BOOLEAN DEFAULT FALSE,
    detected_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (world_id, report_id)           -- prevent duplicate inserts
);
```

### 2b. `world_map_snapshots` table
```sql
CREATE TABLE IF NOT EXISTS world_map_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    world_width     INT NOT NULL,
    world_height    INT NOT NULL,
    name            TEXT,
    name_english    TEXT,
    geography       JSONB NOT NULL,        -- elevation, rainfall, vegetation, etc.
    captured_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (world_id)                      -- one per world, upsert on re-capture
);
```

### 2c. No new table needed for enriched units
Enriched data merges into existing `units.details` JSONB — adds `inventory`, `wounds`, `appearance`, `noble_positions`, `blood_max`, `blood_count`, `is_soldier`, `age` fields.

### 2d. `lua_probes` table (for arbitrary Lua output)
```sql
CREATE TABLE IF NOT EXISTS lua_probes (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    probe_name      TEXT NOT NULL,         -- e.g. 'armies', 'diplomacy'
    data            JSONB NOT NULL,
    game_year       INT,
    game_tick       INT,
    captured_at     TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 3: Collectors

### 3a. Reports Collector
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/reports.py` (new)

- `async def collect_reports(conn, client, world_id) -> int`
- Calls `client.get_reports()`
- Deduplicates by `report_id` (INSERT ... ON CONFLICT DO NOTHING)
- Returns count of new reports inserted

### 3b. World Map Collector
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/world_map.py` (new)

- `async def capture_world_map(conn, client, world_id) -> bool`
- Calls `client.get_full_world_map()`
- Upserts into `world_map_snapshots`
- One-time call per session (cached in client)

### 3c. Unit Enrichment
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py` (modify)

- Add `enrich_units(base_units, enriched_units) -> list[dict]` function
- Matches by unit ID, merges enriched fields into `details`
- Called from watcher loop after both `list_units()` and `get_enriched_units()`

### 3d. Lua Probe Framework
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/probe.py` (new)

- `def probe_armies(client) -> dict` — runs Lua to extract army count, positions, goals
- `def probe_diplomacy(client) -> dict` — runs Lua to extract diplomatic state
- `def probe_unit_detail(client, unit_id) -> dict` — personality, moods, thoughts
- `async def store_probe(conn, world_id, probe_name, data, year, tick)`
- Each probe is a `run_command("lua", ...)` call that prints JSON-parseable output

---

## Phase 4: Watcher Integration

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` (modify)

Add to the polling loop (with graceful degradation — each stream independent):

```python
# Existing: units + change detection
# New additions per cycle:
#   1. Collect reports (every cycle)
#   2. Enrich units with RFR data (every cycle, merges into upsert)
#   3. World map (first cycle only, then skip)
#   4. Lua probes (every N cycles, configurable)
```

Each new stream wrapped in try/except so failure doesn't break the core unit polling.

---

## Phase 5: CLI Commands

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py` (modify)

### 5a. `chronicler probe` — One-shot data exploration
```
chronicler probe --world-id 1 [--reports] [--world-map] [--armies] [--diplomacy] [--unit ID]
```
Runs individual probes and prints results to stdout. For exploration before committing to continuous polling.

### 5b. Update `chronicler watch` — Add flags for new streams
```
chronicler watch --interval 30 --world-id 1 --reports --enriched --probe-interval 300
```
- `--reports`: Enable report collection each cycle
- `--enriched`: Enable RFR unit enrichment each cycle
- `--probe-interval N`: Run Lua probes every N seconds (default: off)

---

## Phase 6: Lua Probe Scripts (Data Fishing)

The `run_command()` method opens the door to probing any data in DF's memory. Initial probes:

### 6a. Army Probe
```lua
lua local c=#df.global.world.armies.all; print('{"count":'..c..',"armies":['); for i=0,math.min(c-1,19) do local a=df.global.world.armies.all[i]; print('{"pos_x":'..a.pos.x..',"pos_y":'..a.pos.y..'}') end; print(']}'
```

### 6b. Diplomacy Probe
```lua
lua print(#df.global.world.diplomacy.all)
```

### 6c. Unit Personality Probe
```lua
lua local u=df.unit.find(ID); if u and u.status.current_soul then local p=u.status.current_soul.personality; print('{"stress":'..u.status.current_soul.personality.stress..',"happiness":'..p.stress_level..'}') end
```

These are intentionally minimal — single-line Lua that fits in a `run_command()` call. Output is parsed from the TEXT notification frames.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `chronicler/dfhack/client.py` | Modify | Add 4 new methods |
| `chronicler/db/schema.sql` | Modify | Add 3 new tables |
| `chronicler/dfhack/reports.py` | Create | Report collector |
| `chronicler/dfhack/world_map.py` | Create | World map collector |
| `chronicler/dfhack/probe.py` | Create | Lua probe framework |
| `chronicler/dfhack/sync.py` | Modify | Add unit enrichment merge |
| `chronicler/dfhack/watcher.py` | Modify | Integrate new streams |
| `chronicler/cli.py` | Modify | Add `probe` command, update `watch` |

---

## Verification

1. **Unit test**: Connect to DFHack, call each new method, verify non-null return
2. **Reports**: Run `chronicler probe --reports`, verify game announcements appear
3. **World map**: Run `chronicler probe --world-map`, verify geography data (elevation ranges, dimensions)
4. **Enriched units**: Run watcher with `--enriched`, verify `units.details` gains inventory/wounds/appearance
5. **Lua probes**: Run `chronicler probe --armies`, verify army count matches game state
6. **DB verification**: `chronicler validate` should show counts in new tables
7. **Watcher integration**: Run `chronicler watch --reports --enriched` for 3+ cycles, verify all streams populate without errors

---

## Implementation Order

1. Client methods (Phase 1) — foundation for everything else
2. Schema migration (Phase 2) — must exist before collectors
3. Reports collector + CLI probe command (Phase 3a + 5a) — immediate value, tests the pipeline
4. World map collector (Phase 3b) — one-time, quick win
5. Unit enrichment (Phase 3c + 4) — watcher integration
6. RunCommand + Lua probes (Phase 1d + 3d + 6) — the fishing expedition
7. Full watcher integration (Phase 4 + 5b) — tie it all together
