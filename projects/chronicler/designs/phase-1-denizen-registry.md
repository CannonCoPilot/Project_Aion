# Phase 1: Denizen Registry + Death Detection — Detailed Plan

**Date**: 2026-02-24
**Source**: PRD v2.2 (Sections 3, 4.3, 11), Roadmap v1.1 (Sections 1.1-1.7)
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Estimated effort**: 6-8 hours

---

## Goal

Establish the `fortress_denizens` table as the central tracking mechanism for every fortress-relevant being, with death/absence detection, embark identification, Narrative Value Scoring (NVS), and a CLI interface. This is the foundation upon which Phases 2-4 build.

---

## Runtime Environment

| Component | Detail |
|-----------|--------|
| **DF Host** | UTM Win11 VM (`DF-Windows` / `192.168.64.3`) |
| **DF Version** | 53.10 + DFHack 53.10-r1 |
| **Data Transport** | `dfhack-run` over SSH (primary); TCP RPC broken for game-thread calls |
| **SSH Key** | `~/.ssh/df-vm` |
| **Current World** | "The Land of Dawning" — year 250, 257x257 |
| **Live Data** | 48,366 HFs, 442,716 events, 4,901 entities, 8,035 artifacts, 2,154 sites |
| **DB** | PostgreSQL `chronicler` on localhost:5432 (CDM schema, 109K records, world "Namoram") |
| **Watcher** | `chronicler watch` — verified E2E, 3+ cycles, graceful shutdown |
| **Bridge** | v6, 16 sections, 7 data domains, HTTP on port 8888 |

**Note**: The DB currently holds world "Namoram" from legends XML. The live VM runs "The Land of Dawning". Phase 1 should work with either world — the denizen registry is populated by the watcher from live data, regardless of which world's legends are in the DB.

---

## Prerequisites (All Met)

- [x] Composite PK migration complete (Session 32)
- [x] 131-test suite passing
- [x] Bridge v6 with 16 sections deployed
- [x] Watcher verified E2E (`chronicler watch`)
- [x] Change detector handling 11 event types
- [x] Explorer 6-tab structure complete
- [x] `dfhack-run` over SSH verified working

---

## Task Breakdown

### Task 1.1: Schema — `fortress_denizens` table

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`
**Action**: ADD

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
        -- 'historical' : Known only from legends/relationships, never physically present
    embark          BOOLEAN DEFAULT FALSE,  -- TRUE if this was a starting dwarf at embark
    arrival_year    INT,                -- Year first detected at fortress
    arrival_tick    INT,                -- Tick within year
    departure_year  INT,                -- Year departed/died (NULL if still present)
    departure_tick  INT,
    departure_cause TEXT,               -- 'death', 'departure', 'unknown'
    narrative_value FLOAT DEFAULT 0.0,  -- Storytelling importance score (0.0-100.0)
    last_seen_tick  INT,                -- Last watcher cycle where this denizen was observed
    details         JSONB DEFAULT '{}', -- Extended metadata (roles, notable events, etc.)
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

**Acceptance**: Table created successfully against live DB. Indexes present. No conflicts with existing schema.

### Task 1.2: Module — `chronicler/denizens.py`

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/denizens.py`
**Action**: NEW (~200 lines)

Core denizen management functions:

```python
async def register_denizen(conn, world_id: int, unit: dict, is_embark: bool = False) -> int:
    """Insert or update a denizen record from unit data.

    Args:
        conn: asyncpg connection
        world_id: World ID
        unit: Unit data dict (from bridge or watcher)
        is_embark: Whether this is an embark dwarf (first cycle detection)

    Returns:
        denizen ID

    Behavior:
        - INSERT on first detection
        - UPDATE on subsequent detections (update last_seen_tick, status if changed)
        - ON CONFLICT (world_id, unit_id) DO UPDATE
    """

async def update_denizen_status(conn, world_id: int, unit_id: int,
                                 new_status: str, cause: str = None,
                                 year: int = None, tick: int = None):
    """Update a denizen's status with optional departure metadata.

    Valid transitions:
        resident → missing (unit disappeared without death flag)
        resident → deceased (is_alive = FALSE or death event)
        resident → departed (left fortress)
        missing → deceased (confirmed dead after investigation)
        missing → resident (reappeared — false alarm)
    """

async def link_hf(conn, world_id: int, denizen_id: int, hf_id: int):
    """Link a denizen to their Historical Figure record.

    Called when:
        - Unit has hist_fig_id and the HF exists in historical_figures table
        - Post-embark legends import makes HF available for a previously unit-only denizen
    """

async def compute_nvs(conn, world_id: int, denizen_id: int) -> float:
    """Compute Narrative Value Score for a denizen.

    Formula:
        NVS = (screen_time * 0.30) + (event_density * 0.25) +
              (relationship_depth * 0.20) + (recency * 0.15) +
              (status_weight * 0.10)

    Components:
        screen_time: watcher cycles observed / total cycles (0.0-1.0)
        event_density: count of history_events involving this HF / max events any denizen (0.0-1.0)
        relationship_depth: count of hf_links + unit relationships / max relationships (0.0-1.0)
        recency: inverse of ticks since last observation, normalized (0.0-1.0)
        status_weight: resident=1.0, deceased=0.8, visitor=0.5, historical=0.3

    Each component is normalized to 0.0-1.0, then weighted and summed.
    Final score scaled to 0.0-100.0.
    """

async def compute_all_nvs(conn, world_id: int):
    """Recompute NVS for all denizens in a world. Called per watcher cycle."""

async def get_fortress_denizens(conn, world_id: int,
                                 status_filter: list[str] = None,
                                 sort_by: str = 'narrative_value',
                                 limit: int = 100) -> list[dict]:
    """Query denizens with optional filtering and sorting.

    Args:
        status_filter: List of statuses to include (None = all)
        sort_by: 'narrative_value', 'name', 'arrival_year', 'status'
        limit: Max rows

    Returns:
        List of denizen dicts with all fields
    """

async def detect_embark_dwarves(conn, world_id: int, units: list[dict]) -> list[int]:
    """Identify embark dwarves on the first watcher cycle.

    Logic:
        - Check if fortress_denizens has ANY entries for this world_id
        - If NO entries exist: this is the first cycle → all units are embark dwarves
        - If entries exist: this is NOT the first cycle → no new embark dwarves

    Returns:
        List of unit_ids that are embark dwarves (empty if not first cycle)
    """
```

**Acceptance**: All functions pass unit tests. `register_denizen` is idempotent. NVS formula produces sensible scores (embark dwarves with lots of events > visitors with few events).

### Task 1.3: Watcher Integration — Denizen Tracking

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py`
**Action**: MODIFY (~100 lines added)

Integration points in the watcher polling loop:

```python
# At start of each poll cycle:
current_units = await get_bridge_units()  # existing bridge data fetch

# Denizen tracking (new code):
from chronicler.denizens import (
    register_denizen, update_denizen_status, detect_embark_dwarves,
    compute_all_nvs, link_hf
)

# 1. First-cycle embark detection
embark_ids = await detect_embark_dwarves(conn, world_id, current_units)

# 2. Register all current units as denizens
for unit in current_units:
    is_embark = unit['id'] in embark_ids
    await register_denizen(conn, world_id, unit, is_embark=is_embark)

# 3. HF linking — for units with hist_fig_id, check if HF exists
for unit in current_units:
    if unit.get('hist_fig_id'):
        existing_hf = await conn.fetchval(
            "SELECT id FROM historical_figures WHERE world_id = $1 AND id = $2",
            world_id, unit['hist_fig_id'])
        if existing_hf:
            await link_hf(conn, world_id, denizen_id, unit['hist_fig_id'])

# 4. Death detection (Task 1.4)
await detect_deaths(conn, world_id, current_units, previous_units)

# 5. NVS recomputation
await compute_all_nvs(conn, world_id)
```

**Key concern**: The watcher currently stores `previous_units` state for change detection. Ensure the denizen tracking code has access to both current and previous unit lists.

**Acceptance**: After 3 watcher cycles, `fortress_denizens` contains all fortress units with correct statuses. First-cycle units have `embark = TRUE`.

### Task 1.4: Death Detection Enhancement

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py`
**Action**: MODIFY (within denizen tracking code)

```python
async def detect_deaths(conn, world_id: int,
                        current_units: list[dict],
                        previous_units: list[dict]):
    """Detect deaths and disappearances by comparing unit lists.

    Detection methods:
    1. Direct: Unit's is_alive flag transitions FALSE → status = 'deceased'
    2. Absence: Unit in previous cycle but not in current → status = 'missing'
    3. Flag check: Unit has killed flag set → status = 'deceased'

    For each detection, update fortress_denizens and log the event.
    """
    current_ids = {u['id'] for u in current_units}
    previous_ids = {u['id'] for u in previous_units}

    # Units that disappeared between cycles
    missing_ids = previous_ids - current_ids
    for uid in missing_ids:
        prev_unit = next(u for u in previous_units if u['id'] == uid)
        await update_denizen_status(
            conn, world_id, uid, 'missing',
            cause='disappeared_between_cycles',
            year=current_year, tick=current_tick
        )

    # Units whose is_alive changed to FALSE
    for unit in current_units:
        if unit.get('flags', {}).get('killed') or not unit.get('is_alive', True):
            # Check if this denizen was previously alive
            current_status = await conn.fetchval(
                "SELECT status FROM fortress_denizens WHERE world_id = $1 AND unit_id = $2",
                world_id, unit['id'])
            if current_status in ('resident', 'missing'):
                await update_denizen_status(
                    conn, world_id, unit['id'], 'deceased',
                    cause='death', year=current_year, tick=current_tick
                )
```

**Acceptance**: Kill a dwarf in DF → denizen status changes to `deceased` within 2 watcher cycles. Unit that disappears without death flag → status changes to `missing`.

### Task 1.5: NVS Computation

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/denizens.py`
**Action**: Part of Task 1.2 (already specified)

**Implementation detail for NVS subqueries**:

```sql
-- screen_time: proportion of cycles observed
SELECT COUNT(*) FILTER (WHERE d.last_seen_tick IS NOT NULL) AS cycles_observed,
       (SELECT COUNT(DISTINCT cycle_tick) FROM sync_snapshots WHERE world_id = $1) AS total_cycles

-- event_density: events involving this denizen's HF
SELECT COUNT(*) FROM history_events
WHERE world_id = $1 AND (hf_id = $2 OR hf_id_2 = $2)

-- relationship_depth: links involving this denizen's HF
SELECT COUNT(*) FROM hf_links WHERE world_id = $1 AND hf_id = $2

-- recency: current_tick - last_seen_tick (lower = more recent = higher score)
-- normalized: 1.0 - (ticks_since_seen / max_ticks_since_seen)
```

**Edge cases**:
- Denizen with no HF link: event_density = 0, relationship_depth = 0 (they'll still score on screen_time, recency, status_weight)
- First cycle: total_cycles = 1, all denizens have screen_time = 1.0
- Deceased denizen: recency frozen at departure tick

**Acceptance**: NVS scores are non-zero for all denizens. Embark dwarves with many observations > visitors with few observations. Deceased denizens maintain historical scores.

### Task 1.6: CLI Command — `chronicler denizens`

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py`
**Action**: MODIFY (~40 lines)

```python
@app.command()
def denizens(
    world: str = typer.Option(None, help="World name filter"),
    status: str = typer.Option(None, help="Status filter (resident/deceased/missing/...)"),
    sort: str = typer.Option("nvs", help="Sort by: nvs, name, arrival, status"),
    limit: int = typer.Option(50, help="Max results"),
):
    """List fortress denizens with status, NVS, and embark flag."""
    # Implementation:
    # 1. Resolve world_id from world name (or use most recent)
    # 2. Call get_fortress_denizens() with filters
    # 3. Format as table:
    #    Name | Status | Embark | NVS | HF Link | Race | Arrived
    #    Urist McAxe | resident | * | 72.3 | HF#12345 | DWARF | Y250
```

**Output format** (example):
```
Fortress Denizens — World: The Land of Dawning (24 total)

  Name              Status    Embark  NVS    HF Link    Race    Arrived
  ─────────────────────────────────────────────────────────────────────
  Urist McAxe       resident  *       72.3   HF#12345   DWARF   Y250
  Kel Sworddawn     resident  *       68.1   HF#12346   DWARF   Y250
  Olin Sealrage     deceased  *       54.7   HF#12349   DWARF   Y250
  Mafol Bridger     resident          41.2   HF#15001   DWARF   Y251
  ...
```

**Acceptance**: `chronicler denizens` runs without error and displays a formatted table with all fortress units.

### Task 1.7: HF Linking

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/denizens.py`
**Action**: Part of Task 1.2

For each denizen with a `hist_fig_id` from the unit data, check if the corresponding Historical Figure record exists in `historical_figures`. If it does, set `hf_id` on the denizen record.

This linking happens:
1. During denizen registration (Task 1.3) — when unit data includes `hist_fig_id`
2. After legends XML import — when HF records become available for previously unit-only denizens
3. After post-embark legends re-export (Phase 2) — when embark dwarves gain HF records

**Acceptance**: Denizens with matching HFs have `hf_id` set. Denizens without matching HFs have `hf_id = NULL`.

### Task 1.8: Tests

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/tests/test_denizens.py`
**Action**: NEW

Test cases:
1. `test_register_denizen_new` — new unit creates denizen record
2. `test_register_denizen_idempotent` — re-registering same unit updates, doesn't duplicate
3. `test_embark_detection_first_cycle` — all units on first cycle marked embark
4. `test_embark_detection_subsequent_cycle` — new units on later cycles NOT marked embark
5. `test_death_detection_flag` — `is_alive=FALSE` → status=deceased
6. `test_death_detection_absence` — unit disappears → status=missing
7. `test_nvs_computation` — NVS formula produces expected range (0-100)
8. `test_nvs_ordering` — denizen with more events scores higher
9. `test_hf_linking` — unit with matching HF gets hf_id set
10. `test_status_transitions` — valid transitions accepted, invalid rejected
11. `test_get_fortress_denizens_filters` — status filter and sort options work
12. `test_cli_denizens_command` — CLI command produces formatted output

**Acceptance**: All 12 tests pass. Test coverage for `denizens.py` > 80%.

---

## Files Summary

| File | Action | Lines est. | Task |
|------|--------|-----------|------|
| `chronicler/db/schema.sql` | ADD table + indexes | ~40 | 1.1 |
| `chronicler/denizens.py` | NEW module | ~200 | 1.2, 1.5, 1.7 |
| `chronicler/dfhack/watcher.py` | MODIFY — denizen tracking + death detection | ~100 | 1.3, 1.4 |
| `chronicler/cli.py` | MODIFY — add `denizens` command | ~40 | 1.6 |
| `tests/test_denizens.py` | NEW test file | ~250 | 1.8 |
| **Total** | | **~630** | |

---

## Dependency Graph (Internal to Phase 1)

```
Task 1.1 (schema)
    │
    ▼
Task 1.2 (denizens.py module)
    │
    ├──→ Task 1.3 (watcher integration)
    │        │
    │        ├──→ Task 1.4 (death detection)
    │        └──→ Task 1.5 (NVS computation)
    │
    ├──→ Task 1.6 (CLI command)
    └──→ Task 1.7 (HF linking)

Task 1.8 (tests) — can start after 1.2, runs after all others
```

**Recommended implementation order**: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.7 → 1.6 → 1.8

---

## Verification Checklist

- [ ] `fortress_denizens` table exists in PostgreSQL with all columns and indexes
- [ ] Run watcher 3+ cycles → table populated with all fortress units
- [ ] First-cycle units all have `embark = TRUE`
- [ ] Second-cycle new arrivals have `embark = FALSE`
- [ ] Kill a dwarf in DF → denizen status changes to `deceased` within 2 cycles
- [ ] Dwarf disappears without death flag → status changes to `missing`
- [ ] NVS scores are non-zero and vary between denizens
- [ ] NVS ordering makes sense (active residents > old visitors)
- [ ] Denizens with matching HFs have `hf_id` populated
- [ ] `chronicler denizens` CLI command shows formatted table with all fields
- [ ] All 12 tests pass
- [ ] No regressions in existing 131-test suite

---

## Risks (Phase 1 Specific)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Watcher previous_units state not accessible for death detection | MEDIUM | Verify watcher stores previous cycle data; add if missing |
| NVS formula denominator is zero on first cycle | LOW | Guard against division by zero; set floor of 1 for denominators |
| Bridge unit data missing `hist_fig_id` for some units | LOW | HF linking is optional; denizen works with unit_id only |
| `dfhack-run` SSH latency adds to watcher cycle time | LOW | SSH commands are <0.5s; acceptable for 30s+ poll intervals |
| Race condition if two watcher instances run simultaneously | LOW | Add advisory lock or check in watcher startup |

---

## What Phase 1 Enables

Once Phase 1 is complete:
- **Phase 2** can build embark HF handling on top of the `embark` flag
- **Phase 2** event generator can reference denizens for event participants
- **Phase 3** agentic storyteller uses denizen registry as its starting point
- **Phase 3** explorer shows fortress-centric views sorted by NVS
- **Phase 4** Knowledge Horizon roots its visibility graph in the denizen registry

The denizen registry is the **keystone table** — every subsequent phase depends on it.

---

*Phase 1 Detailed Plan — Denizen Registry + Death Detection*
*2026-02-24*
*Extracted from PRD v2.2 and Roadmap v1.1*
