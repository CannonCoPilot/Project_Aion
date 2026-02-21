# Chronicler Live Polling Daemon — Implementation Plan

## Context

Chronicler's `sync-live` command is a one-shot pull: connect to DFHack, dump all sane units into PostgreSQL, disconnect. There's no continuous capture, no change detection, no event logging. To build a real narrative engine that tracks fortress life over time, we need a **polling daemon** that continuously captures game state and detects meaningful changes (arrivals, deaths, skill-ups, mood shifts).

Research confirmed:
- **Worldgen capture via RPC is not viable** — no worldgen-specific RPC methods exist. Post-worldgen data comes via `legends.xml` (already handled by `chronicler ingest`).
- **Core API** (`ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads`) works without special config.
- **RemoteFortressReader** (game time, creature raws, buildings, reports) requires `allow_remote=true` — we'll enable this as Step 0.
- **Change detection pattern**: Two-level approach from reference repos — count-based mass detection + key-based per-unit diffing.
- **First cycle**: Silent bootstrap (populate detector state, no events emitted).

**Goal**: Enable `allow_remote`, then build a `chronicler watch` command that polls DFHack every N seconds, tracks in-game time, resolves race names, detects changes, and logs events to PostgreSQL.

---

## Phase 0: Enable `allow_remote` on VM DFHack

**On the VM** (192.168.64.2): Set DFHack to allow remote plugin calls. This is typically done by adding to the DFHack init file or running `remote-server-security allow-remote` at the DFHack console. We'll verify by calling `GetCreatureRaws` and `GetWorldMap` from the host — the same calls that previously timed out.

**Smoke test from host**:
- `GetWorldMap` → should return `cur_year`, `cur_year_tick`
- `GetCreatureRaws` → should return race definitions (DWARF, ELF, GOBLIN, etc.)

---

## Phase 1: Schema + Event Model (~30 LOC SQL)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

Add `unit_events` table:
```sql
CREATE TABLE IF NOT EXISTS unit_events (
    id SERIAL PRIMARY KEY,
    unit_id INT NOT NULL,
    world_id INT NOT NULL REFERENCES worlds(id),
    event_type TEXT NOT NULL,        -- ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED
    old_value JSONB,                 -- previous state (null for ARRIVED)
    new_value JSONB,                 -- current state (null for DIED)
    game_year INT,                   -- in-game year from GetWorldMap
    game_tick INT,                   -- in-game tick (0-403199 per year)
    detected_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unit_events_unit ON unit_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_events_type ON unit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_unit_events_time ON unit_events(detected_at);
```

Add `sync_snapshots` table for tracking poll cycles:
```sql
CREATE TABLE IF NOT EXISTS sync_snapshots (
    id SERIAL PRIMARY KEY,
    world_id INT NOT NULL REFERENCES worlds(id),
    unit_count INT NOT NULL,
    event_count INT DEFAULT 0,
    game_year INT,
    game_tick INT,
    synced_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 2: DFHack Client — Add RFR Methods (~40 LOC Python)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py`

Add two new methods to `DFHackClient`:

```python
def get_world_map(self) -> dict:
    """Get world map data including cur_year/cur_year_tick. Requires allow_remote."""
    # Calls RemoteFortressReader::GetWorldMap → WorldMap message
    # Returns {'cur_year': int, 'cur_year_tick': int, ...}

def get_creature_raws(self) -> dict[int, str]:
    """Build race_id → race_name mapping from creature raws. Requires allow_remote."""
    # Calls RemoteFortressReader::GetCreatureRaws → CreatureRawList
    # Returns {0: 'DWARF', 1: 'ELF', ...}
    # Cached after first call (creature raws don't change during a game)
```

The protobuf definitions already exist at `chronicler/dfhack/proto/RemoteFortressReader_pb2.py`. The client's `_call()` method supports plugin calls — just pass `plugin='RemoteFortressReader'`.

---

## Phase 3: Change Detector (~80 LOC Python)

**New file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py`

Two-level change detection (pattern from `Helper.lua` in reference repos):

```python
class ChangeDetector:
    """Compares consecutive unit snapshots to emit events."""

    def __init__(self):
        self.previous: dict[int, dict] = {}
        self._bootstrapped = False

    def detect(self, current_units: list[dict]) -> list[dict]:
        """Compare current vs previous. First call = silent bootstrap (no events)."""
        current_by_id = {u['id']: u for u in current_units}

        if not self._bootstrapped:
            self.previous = current_by_id
            self._bootstrapped = True
            return []  # Silent bootstrap

        events = []
        # New arrivals
        for uid, unit in current_by_id.items():
            if uid not in self.previous:
                events.append(...)
        # Departures
        for uid in self.previous:
            if uid not in current_by_id:
                events.append(...)
        # Per-unit diffs (alive, profession, skills, squad)
        for uid, unit in current_by_id.items():
            if uid in self.previous:
                events.extend(_diff_unit(uid, self.previous[uid], unit))

        self.previous = current_by_id
        return events
```

**Tracked changes** (in `_diff_unit`):
- `is_alive` True→False → `DIED`
- `profession` changed → `PROFESSION_CHANGED`
- Skill level increased → `SKILL_UP` (batched per unit per cycle)
- Squad assignment changed → `SQUAD_CHANGED`

---

## Phase 4: Polling Daemon (~100 LOC Python)

**New file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py`

```python
async def watch_loop(pool, world_id: int, interval: float = 30.0):
    """Continuous polling loop. Runs until SIGINT/SIGTERM."""
    detector = ChangeDetector()
    client = DFHackClient()
    client.connect()

    # One-time: build race cache from creature raws
    race_map = client.get_creature_raws()

    try:
        while not _shutdown_event.is_set():
            # 1. Get game time
            world_map = client.get_world_map()
            game_year = world_map.get('cur_year')
            game_tick = world_map.get('cur_year_tick')

            # 2. Pull current units (with race names resolved)
            units = client.list_units(sane=True, skills=True, profession=True)
            for u in units:
                u['race_name'] = race_map.get(u['race'], str(u['race']))

            # 3. Detect changes
            events = detector.detect(units)

            # 4. Upsert units + insert events + record snapshot (single txn)
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await _upsert_units(conn, units, world_id)
                    await _insert_events(conn, events, world_id, game_year, game_tick)
                    await _record_snapshot(conn, world_id, len(units), len(events),
                                           game_year, game_tick)

            # 5. Log summary
            _log_cycle(game_year, game_tick, len(units), len(events), events)

            # 6. Wait (interruptible)
            try:
                await asyncio.wait_for(_shutdown_event.wait(), timeout=interval)
            except asyncio.TimeoutError:
                continue
    finally:
        client.close()
```

Key design decisions:
- **Reuse existing `DFHackClient`** — synchronous TCP, fine at 30s intervals
- **Race resolution at startup** — creature raws cached once, applied to every unit
- **Game time on every cycle** — `GetWorldMap` gives year/tick for event timestamps
- **Single transaction** per cycle — atomic commit of units + events + snapshot
- **Graceful shutdown** via `asyncio.Event` + signal handlers
- **Refactor `sync.py`**: Extract upsert logic so both `sync-live` and `watch` share it

---

## Phase 5: CLI Command (~30 LOC Python)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py`

```python
@cli.command("watch")
@click.option("--world-id", default=1, type=int)
@click.option("--interval", default=30.0, type=float, help="Seconds between polls")
def watch(world_id, interval):
    """Continuously poll DFHack and log changes to the CDM."""
    from chronicler.dfhack.watcher import watch_loop
    # Setup pool, register SIGINT/SIGTERM handlers, run watch_loop
```

---

## Phase 6: Refactor sync.py (~20 LOC changed)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py`

Extract the 14-column UPSERT into `upsert_units(conn, units, world_id)` — reused by both `sync_units()` and `watch_loop`.

---

## File Summary

| File | Action | ~LOC |
|------|--------|------|
| `chronicler/db/schema.sql` | Modify | +20 |
| `chronicler/dfhack/client.py` | Modify | +40 (RFR methods) |
| `chronicler/dfhack/detector.py` | Create | +80 |
| `chronicler/dfhack/watcher.py` | Create | +100 |
| `chronicler/dfhack/sync.py` | Modify | +/-20 (refactor upsert) |
| `chronicler/cli.py` | Modify | +30 |

**Total**: ~270 LOC, 2 new files, 4 modified files. No new dependencies.

---

## What This Intentionally Does NOT Do

- **No worldgen capture** — RPC has no worldgen methods; `legends.xml` is the right path
- **No systemd/launchd service** — foreground CLI; Ctrl+C to stop
- **No websocket push** — monitoring dashboard already polls; events queryable via SQL
- **No building/item tracking** — future enhancement once unit polling is stable

---

## Follow-Up Tasks (Out of Scope)

1. **Narrative event synthesis** — Feed unit_events into the storyteller LLM for real-time fortress narratives
2. **Building/item capture** — extend watcher to poll RFR's `GetBuildingDefList`, `GetItemList`
3. **Report/announcement capture** — `GetReports` for combat logs, mood announcements
4. **Monitoring integration** — Add watcher stats to the existing `/monitoring` dashboard

---

## Verification

1. **Enable allow_remote** on VM DFHack, verify `GetWorldMap` and `GetCreatureRaws` respond
2. Run schema migration: `psql -U jarvis -d chronicler -f chronicler/db/schema.sql`
3. Ensure DF is running on VM with DFHack (port 5000)
4. Run one-shot sync: `chronicler sync-live` (verify baseline still works)
5. Start watcher: `chronicler watch --interval 10` (shorter for testing)
6. First cycle: should see "Synced N units, 0 events" + game year/tick (silent bootstrap)
7. Second cycle: events only if something actually changed in-game
8. Cause a change in DF (e.g., assign dwarf to squad) → verify SQUAD_CHANGED event
9. Ctrl+C → verify graceful shutdown (no partial transactions)
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`
11. `SELECT * FROM sync_snapshots ORDER BY synced_at DESC LIMIT 10;`
