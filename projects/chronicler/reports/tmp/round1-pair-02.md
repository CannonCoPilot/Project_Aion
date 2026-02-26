# Consolidation: Denizen Registry & Gap Closure

## Source Documents

- `phase-1-denizen-registry.md`: Detailed implementation plan for Phase 1 of post-gap-closure development — the `fortress_denizens` table, death/absence detection, Narrative Value Scoring (NVS), and CLI interface, dated 2026-02-24.
- `chronicler-gap-closure.md`: Revised implementation plan (v2) documenting all completed gap-closure work — data integrity fixes, composite PK migration, storyteller enrichment, XML completeness, and operational hardening, completed 2026-02-22 in Session 32.

---

## Features & Requirements

### Fortress Denizen Registry

- Central tracking table `fortress_denizens` for every fortress-relevant being.
- Tracks both `unit_id` (live DFHack unit record) and `hf_id` (Historical Figure from legends XML), supporting NULL for either if not yet available.
- Supports the following denizen statuses:
  - `resident` — Currently living in fortress
  - `departed` — Left alive (migrated out, caravan departed)
  - `deceased` — Confirmed dead
  - `missing` — Was resident, now absent (no departure/death event observed)
  - `visitor` — Temporary presence (diplomat, merchant, performer)
  - `attacker` — Hostile presence (siege, ambush)
  - `skulker` — Covert presence (thief, snatcher)
  - `historical` — Known only from legends/relationships, never physically present
- Embark flag (`embark = TRUE`) to mark starting dwarves at fortress embark.
- Arrival year and tick fields (when first detected at fortress).
- Departure year, tick, and cause (`death`, `departure`, `unknown`) fields.
- `narrative_value` float field (0.0–100.0) — Narrative Value Score (NVS).
- `last_seen_tick` — Last watcher cycle where this denizen was observed.
- `details` JSONB field — extended metadata (roles, notable events, etc.).
- Timestamps: `created_at`, `updated_at`.

### Embark Dwarf Identification

- First-cycle detection logic: if `fortress_denizens` has NO entries for the world, all units in the first cycle are marked `embark = TRUE`.
- Subsequent-cycle new arrivals are marked `embark = FALSE`.
- Embark flag is permanent once set.

### Death and Absence Detection

- Detection method 1 (Direct): Unit's `is_alive` flag transitions to FALSE → status set to `deceased`.
- Detection method 2 (Absence): Unit present in previous watcher cycle but absent in current → status set to `missing`.
- Detection method 3 (Flag): Unit has `killed` flag set → status set to `deceased`.
- All death/disappearance detections update `fortress_denizens` and log the event.
- Valid status transitions:
  - `resident` → `missing` (unit disappeared without death flag)
  - `resident` → `deceased` (is_alive = FALSE or death event)
  - `resident` → `departed` (left fortress)
  - `missing` → `deceased` (confirmed dead after investigation)
  - `missing` → `resident` (reappeared — false alarm)

### Narrative Value Scoring (NVS)

- Formula: `NVS = (screen_time * 0.30) + (event_density * 0.25) + (relationship_depth * 0.20) + (recency * 0.15) + (status_weight * 0.10)`
- Components (each normalized 0.0–1.0):
  - `screen_time`: watcher cycles observed / total cycles
  - `event_density`: count of history_events involving this HF / max events any denizen
  - `relationship_depth`: count of hf_links + unit relationships / max relationships
  - `recency`: inverse of ticks since last observation, normalized
  - `status_weight`: resident=1.0, deceased=0.8, visitor=0.5, historical=0.3
- Final score scaled to 0.0–100.0.
- Recomputed for all denizens on every watcher cycle (`compute_all_nvs`).
- Deceased denizens maintain historical scores (recency frozen at departure tick).
- Denizens with no HF link: event_density=0, relationship_depth=0, still score on screen_time, recency, status_weight.
- Edge case: first cycle — total_cycles=1, all denizens have screen_time=1.0.
- Edge case: NVS denominator guard — floor of 1 to avoid division by zero.

### HF Linking

- When unit data includes `hist_fig_id`, check if matching Historical Figure record exists in `historical_figures` table.
- If match found, set `hf_id` on the denizen record.
- HF linking occurs at three points:
  1. During denizen registration (when unit data includes `hist_fig_id`)
  2. After legends XML import (when HF records become available for previously unit-only denizens)
  3. After post-embark legends re-export (Phase 2) — when embark dwarves gain HF records
- Denizens without matching HFs have `hf_id = NULL`.

### CLI Command: `chronicler denizens`

- Options: `--world` (name filter), `--status` (filter by status), `--sort` (nvs/name/arrival/status), `--limit` (max results, default 50).
- Displays formatted table: Name | Status | Embark | NVS | HF Link | Race | Arrived.
- Example output:
  ```
  Fortress Denizens — World: The Land of Dawning (24 total)

    Name              Status    Embark  NVS    HF Link    Race    Arrived
    ─────────────────────────────────────────────────────────────────────
    Urist McAxe       resident  *       72.3   HF#12345   DWARF   Y250
    Kel Sworddawn     resident  *       68.1   HF#12346   DWARF   Y250
    Olin Sealrage     deceased  *       54.7   HF#12349   DWARF   Y250
    Mafol Bridger     resident          41.2   HF#15001   DWARF   Y251
  ```

### Data Integrity Fixes (All Completed)

- `kill_count` computation bug (BUG-005): Was LEFT JOIN'd to event_count; fixed to independent UPDATE. Was grouping by `hf_id_1` (victim) instead of `hf_id_2` (slayer); corrected. Result: 8,680 figures updated, max kill count rose from 3 to 146.
- Link table UNIQUE constraints (BUG-006): Deduped 4,679 rows from `hf_links` and 23 from `hf_entity_links`. Added UNIQUE constraints: `uq_hf_links`, `uq_hf_entity_links`, `uq_hf_site_links`. Updated ON CONFLICT: hf_links/hf_site_links → DO NOTHING; hf_entity_links → DO UPDATE SET position_name.
- Region parsing scope fix (BUG-008): Changed `.//region` → `regions/region` and `.//underground_region` → `underground_regions/underground_region` for correct XML scoping. Verified: 240/240 regions and 125/125 underground_regions match.

### Composite PK Migration (Completed)

- All 13 legends tables migrated to `PRIMARY KEY (world_id, id)`.
- Link tables received `world_id` column, composite UNIQUE constraints, and composite FKs.
- `structures` table: PK = `(world_id, site_id, id)`, FK to sites composite.
- `collection_events`/`collection_subcollections`: world_id + composite FKs.
- Resolves 10,932 cross-world ID collisions.
- Recovered 5,466 HFs from world "Namoram" (previously lost to ID collision with world "Ormon").
- Post-migration totals: 60,787 total HFs (was 55,321; 9.9% data restoration).
- World 1 (Namoram): 5,466 HFs, 29,682 events.
- World 2 (Ormon): 55,321 HFs, 566,973 events.

### Storyteller Enrichment (Completed)

- Relationship traversal on HF match: queries `hf_links` for spouse/children/parents, `hf_entity_links` for civ memberships and positions, `hf_site_links` for associated sites.
- Event payload enrichment: JOINs to resolve hf_id → name, site_id → name. Natural-language templates for 6 event types. `_summarize_details()` for JSONB fields. Example: "Bomrek was slain by Urist at Goldenhall in year 253".
- Emotion/zone integration in live unit queries: `_build_emotion_map()` matches latest `dwarf_emotions` probe to unit IDs; `_build_zone_owner_map()` resolves owner → zone name. Top 3 emotions and zone assignment included in `_retrieve_live_units()` output.
- War name resolution: JOINs collection queries to resolve entity IDs → names in 3 locations. Format: "War Name (war, year X–Y) — Attacker vs Defender".
- Confidence signaling: context density note prepended to all retrieval results. If < 3 records: caution warning. If > 10 records: rich context note.

### XML Completeness (Completed)

- `written_contents` table: composite PK (world_id, id), parsed from legends.xml (title, author_hfid, form, styles, form_id, author_roll) and enriched from legends_plus.xml (type, page_start/end, references, CamelCase styles). Added book/poem/scroll/composition/music/literature/writing keywords to storyteller routing. Storyteller queries JOIN to historical_figures for author name resolution. Imported: 61,692 written contents across 2 worlds.
- `historical_eras` table: composite PK (world_id, name), parsed from legends.xml with raw int parsing (preserves start_year = -1). Imported: 2 eras (both "Age of Myth", start_year = -1).
- Region and underground_region parsing verified and fixed: underground_regions had NULL type/depth — was only parsed from legends_plus.xml (which lacks these fields). Added `_parse_underground_regions()` to parse type/depth from legends.xml first, then enrich coords from plus. Backfilled all 1,570 underground_regions. World constructions: already correct (14 + 425 = 439 total).
- Boolean flag debugging (BUG-001/REFL-023): deities, vampires, necromancers, werebeasts.
- Site ownership fix (BUG-003): from legends_plus `cur_owner_id`.

### Operational Hardening (Completed)

- 131-test suite, all passing in 0.19s.
- `lua_probes` retention policy: keep last N per probe_name per world_id via `_cleanup_lua_probes_count()`. Cleanup runs after bridge section storage every 10 watcher cycles. Removed unused `_cleanup_lua_probes` function.
- Bridge health monitoring: consecutive failure counter, warn after 3 failures, continue with core-only data (graceful degradation).

### Bridge (All Completed)

- Bridge v6 with 16 sections, 7 data domains, HTTP on port 8888.
- Report cursor tracking.
- Unit flag extraction.
- History event cursor and payloads.
- Emotion/thought capture.
- Zone data capture.
- Event collection capture.
- Squads, mandates, and incidents.

### Python Pipeline (All Completed)

- Bridge accessor functions: `bridge.py` (24 functions).
- Watcher bridge storage: `watcher.py` (16 sections to lua_probes).
- Change detector expansion: `detector.py` (11 event types).

### Storyteller (All Completed, with enrichment)

- Live data retrieval: `context.py` (5 retrieval functions).
- Keyword routing: `context.py` (23 live-data routes).
- System prompt: `prompts.py` (dual-tier, ~12K chars).
- HF-to-unit cross-reference: `_retrieve_live_units()` JOINs to historical_figures.
- All relationship traversal, event enrichment, emotion/zone integration, war name resolution, confidence signaling (see Storyteller Enrichment above).

---

## Implementation Details

### Schema: `fortress_denizens` Table

```sql
CREATE TABLE IF NOT EXISTS fortress_denizens (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT,
    hf_id           INT,
    name            TEXT NOT NULL,
    english_name    TEXT,
    race            TEXT,
    status          TEXT NOT NULL DEFAULT 'unknown',
    embark          BOOLEAN DEFAULT FALSE,
    arrival_year    INT,
    arrival_tick    INT,
    departure_year  INT,
    departure_tick  INT,
    departure_cause TEXT,
    narrative_value FLOAT DEFAULT 0.0,
    last_seen_tick  INT,
    details         JSONB DEFAULT '{}',
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

### Module: `chronicler/denizens.py` (~200 lines, new file)

Key function signatures:

```python
async def register_denizen(conn, world_id: int, unit: dict, is_embark: bool = False) -> int
async def update_denizen_status(conn, world_id: int, unit_id: int,
                                 new_status: str, cause: str = None,
                                 year: int = None, tick: int = None)
async def link_hf(conn, world_id: int, denizen_id: int, hf_id: int)
async def compute_nvs(conn, world_id: int, denizen_id: int) -> float
async def compute_all_nvs(conn, world_id: int)
async def get_fortress_denizens(conn, world_id: int,
                                 status_filter: list[str] = None,
                                 sort_by: str = 'narrative_value',
                                 limit: int = 100) -> list[dict]
async def detect_embark_dwarves(conn, world_id: int, units: list[dict]) -> list[int]
```

- `register_denizen` uses `ON CONFLICT (world_id, unit_id) DO UPDATE`.
- `detect_embark_dwarves` checks if `fortress_denizens` has ANY entries for world_id; if zero entries, all current units are embark dwarves.

### NVS SQL Subqueries

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

### Death Detection Logic

```python
async def detect_deaths(conn, world_id: int,
                        current_units: list[dict],
                        previous_units: list[dict]):
    current_ids = {u['id'] for u in current_units}
    previous_ids = {u['id'] for u in previous_units}
    missing_ids = previous_ids - current_ids
    for uid in missing_ids:
        await update_denizen_status(conn, world_id, uid, 'missing',
            cause='disappeared_between_cycles', year=current_year, tick=current_tick)
    for unit in current_units:
        if unit.get('flags', {}).get('killed') or not unit.get('is_alive', True):
            current_status = await conn.fetchval(
                "SELECT status FROM fortress_denizens WHERE world_id = $1 AND unit_id = $2",
                world_id, unit['id'])
            if current_status in ('resident', 'missing'):
                await update_denizen_status(conn, world_id, unit['id'], 'deceased',
                    cause='death', year=current_year, tick=current_tick)
```

### Watcher Integration Pseudocode

```python
# Per poll cycle:
current_units = await get_bridge_units()
embark_ids = await detect_embark_dwarves(conn, world_id, current_units)
for unit in current_units:
    is_embark = unit['id'] in embark_ids
    await register_denizen(conn, world_id, unit, is_embark=is_embark)
for unit in current_units:
    if unit.get('hist_fig_id'):
        existing_hf = await conn.fetchval(
            "SELECT id FROM historical_figures WHERE world_id = $1 AND id = $2",
            world_id, unit['hist_fig_id'])
        if existing_hf:
            await link_hf(conn, world_id, denizen_id, unit['hist_fig_id'])
await detect_deaths(conn, world_id, current_units, previous_units)
await compute_all_nvs(conn, world_id)
```

Key concern: watcher must store `previous_units` state accessible to the denizen tracking code.

### CLI Implementation

```python
@app.command()
def denizens(
    world: str = typer.Option(None, help="World name filter"),
    status: str = typer.Option(None, help="Status filter (resident/deceased/missing/...)"),
    sort: str = typer.Option("nvs", help="Sort by: nvs, name, arrival, status"),
    limit: int = typer.Option(50, help="Max results"),
):
    """List fortress denizens with status, NVS, and embark flag."""
```

### File Summary for Phase 1 (Denizen Registry)

| File | Action | Lines est. | Task |
|------|--------|-----------|------|
| `chronicler/db/schema.sql` | ADD table + indexes | ~40 | 1.1 |
| `chronicler/denizens.py` | NEW module | ~200 | 1.2, 1.5, 1.7 |
| `chronicler/dfhack/watcher.py` | MODIFY — denizen tracking + death detection | ~100 | 1.3, 1.4 |
| `chronicler/cli.py` | MODIFY — add `denizens` command | ~40 | 1.6 |
| `tests/test_denizens.py` | NEW test file | ~250 | 1.8 |
| **Total** | | **~630** | |

All product code lives at `/Users/nathanielcannon/Claude/Projects/DwarfCron/`.

### Dependency Graph (Phase 1 Internal)

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

Recommended implementation order: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.7 → 1.6 → 1.8

### Dependency Graph (Gap Closure Phases)

```
Phase 0 (Quick Fixes)     ← No dependencies
    ↓
Phase 1 (Composite PKs)   ← Requires Phase 0 clean data
    ↓
Phase 2 (Storyteller)     ← Needs Phase 1 correct queries
Phase 3 (XML)             ← Needs Phase 1 composite PK schema (parallel with Phase 2)
    ↓
Phase 4 (Hardening)       ← Tests cover Phase 1-3 changes
```

### Runtime Environment

| Component | Detail |
|-----------|--------|
| DF Host | UTM Win11 VM (`DF-Windows` / `192.168.64.3`) |
| DF Version | 53.10 + DFHack 53.10-r1 |
| Data Transport | `dfhack-run` over SSH (primary); TCP RPC broken for game-thread calls |
| SSH Key | `~/.ssh/df-vm` |
| Current World | "The Land of Dawning" — year 250, 257x257 |
| Live Data | 48,366 HFs, 442,716 events, 4,901 entities, 8,035 artifacts, 2,154 sites |
| DB | PostgreSQL `chronicler` on localhost:5432 (CDM schema, 109K records, world "Namoram") |
| Watcher | `chronicler watch` — verified E2E, 3+ cycles, graceful shutdown |
| Bridge | v6, 16 sections, 7 data domains, HTTP on port 8888 |

Note: DB currently holds world "Namoram" from legends XML; live VM runs "The Land of Dawning". Phase 1 (denizen registry) works with either — populated from live data regardless of which world's legends are in the DB.

### Reference Documents

- Full critical review: `projects/chronicler/reports/gap-closure-critical-review.md`
- Data gap analysis: `projects/chronicler/reports/data-gap-analysis-2026-02-22.md`
- PRD v2.2: Sections 3, 4.3, 11
- Roadmap v1.1: Sections 1.1-1.7
- Branch: `Project_Aion`

---

## Status & Completion

### Gap Closure (chronicler-gap-closure.md) — ALL COMPLETE

Completed 2026-02-22, Session 32.

- **Phase 0**: Data integrity fixes — DONE (3 bugs: kill_count, link table dedup, region parsing)
- **Phase 1**: Composite PK migration — DONE (13 tables, 10,932 collision resolutions, 5,466 HFs recovered)
- **Phase 2**: Storyteller enrichment — DONE (relationship traversal, event formatting, emotion/zone, war names, confidence signaling)
- **Phase 3**: XML completeness — DONE (written_contents, historical_eras, underground_region type/depth backfill)
- **Phase 4**: Operational hardening — DONE (131-test suite, lua_probes retention, bridge health monitoring)
- ~70% of original plan was already implemented before the revised v2 plan was written; the audit confirmed this.

### Phase 1 Denizen Registry (phase-1-denizen-registry.md) — PLANNED, NOT YET STARTED

All prerequisites are met as of 2026-02-24:
- [x] Composite PK migration complete (Session 32)
- [x] 131-test suite passing
- [x] Bridge v6 with 16 sections deployed
- [x] Watcher verified E2E (`chronicler watch`)
- [x] Change detector handling 11 event types
- [x] Explorer 6-tab structure complete
- [x] `dfhack-run` over SSH verified working

Tasks 1.1 through 1.8 are all pending implementation. Estimated effort: 6-8 hours.

### What Phase 1 (Denizen Registry) Enables

- **Phase 2**: Embark HF handling built on top of the `embark` flag; event generator can reference denizens as participants.
- **Phase 3**: Agentic storyteller uses denizen registry as its starting point; explorer shows fortress-centric views sorted by NVS.
- **Phase 4**: Knowledge Horizon roots its visibility graph in the denizen registry.
- The denizen registry is described as the "keystone table" — every subsequent phase depends on it.

---

## Key Decisions & Design Choices

- **Composite PKs over single-column PKs**: Chosen to resolve cross-world ID collisions. All 13 legends tables migrated. This is a prerequisite for all subsequent work.
- **fortress_denizens has two nullable FK columns** (`unit_id` and `hf_id`): A denizen can be known from a live unit without a matched HF (unit-only), or from legends/relationships without a live unit record (historical). Both columns can be NULL initially; linking happens incrementally.
- **UNIQUE constraints on (world_id, unit_id) and (world_id, hf_id)**: Enforces uniqueness per world for each identifier type. Both are separate constraints so that a denizen can have one without the other.
- **Embark detection via absence of records**: First watcher cycle is detected by checking if fortress_denizens has zero entries for the world_id. Simple and reliable; avoids need for an explicit "cycle counter" state.
- **NVS computed every cycle**: `compute_all_nvs` runs per watcher cycle. Keeps scores current. Acceptable overhead given 30s+ poll intervals.
- **NVS uses five weighted components**: Balances storytelling relevance (screen_time, event_density, relationship_depth), freshness (recency), and categorical importance (status_weight). Deceased denizens retain historical scores.
- **Death detection uses two orthogonal methods**: Direct flag/is_alive check AND absence comparison. Belt-and-suspenders approach ensures deaths and unexplained disappearances are both captured.
- **`missing` is distinct from `deceased`**: A unit that vanishes without a death flag gets `missing` status. This captures game edge cases (unit offscreen, bug, etc.) while remaining upgradeable to `deceased` upon confirmation.
- **Watcher stores previous_units**: Required for absence-based death detection. Identified as key concern — must verify this state is accessible.
- **Storyteller enrichment over raw data**: Phase 2 (gap closure) chose to enrich storyteller context with JOIN-resolved names and natural-language templates rather than return raw IDs. Example: "Bomrek was slain by Urist at Goldenhall in year 253" vs raw hf_id/site_id values.
- **Confidence signaling**: Storyteller prepends a context density note to all results, distinguishing sparse vs rich context. Chosen to help LLM calibrate response confidence.
- **lua_probes retention cleanup**: Runs every 10 watcher cycles (not every cycle) to avoid overhead. Keeps last N per probe_name per world_id.
- **Bridge health monitoring with graceful degradation**: After 3 consecutive bridge failures, watcher warns but continues with core-only data rather than crashing. Chosen for operational robustness.
- **Written contents dual-source parsing**: legends.xml provides core fields; legends_plus.xml provides enriched fields. Parser handles both, with legends.xml as the primary source to ensure type/depth fields are not lost.
- **kill_count fix**: Changed from LEFT JOIN (which caused kill_count to mirror event_count) to independent UPDATE, and changed grouping column from hf_id_1 (victim) to hf_id_2 (slayer). This was a design-level bug in the original computation.

---

## Metrics & Targets

### Existing Test Suite (Gap Closure)

- `test_xml_parser.py`: 26 tests (boolean flags, field mapping, composite PKs, written contents, eras, helpers)
- `test_context.py`: 30 tests (keyword extraction, category routing, HF/event/details formatting)
- `test_detector.py`: 29 tests (bootstrap, arrivals/departures, unit diffs, bridge events)
- `test_schema.py`: 46 tests (17 composite PK tests, 25 FK constraint tests, 4 UNIQUE constraint tests)
- **Total: 131 tests, all passing in 0.19s**

### Phase 1 New Tests (`tests/test_denizens.py`)

12 required test cases:
1. `test_register_denizen_new` — new unit creates denizen record
2. `test_register_denizen_idempotent` — re-registering same unit updates, doesn't duplicate
3. `test_embark_detection_first_cycle` — all units on first cycle marked embark
4. `test_embark_detection_subsequent_cycle` — new units on later cycles NOT marked embark
5. `test_death_detection_flag` — `is_alive=FALSE` → status=deceased
6. `test_death_detection_absence` — unit disappears → status=missing
7. `test_nvs_computation` — NVS formula produces expected range (0–100)
8. `test_nvs_ordering` — denizen with more events scores higher
9. `test_hf_linking` — unit with matching HF gets hf_id set
10. `test_status_transitions` — valid transitions accepted, invalid rejected
11. `test_get_fortress_denizens_filters` — status filter and sort options work
12. `test_cli_denizens_command` — CLI command produces formatted output

Coverage target: `denizens.py` > 80%.
No regressions in existing 131-test suite.

### Phase 1 Verification Checklist (Post-Implementation)

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

### Data Recovery Metrics (Gap Closure)

- Cross-world ID collisions resolved: 10,932
- HFs recovered (Namoram, previously lost): 5,466
- Total HFs post-migration: 60,787 (was 55,321 — 9.9% data restoration)
- Kill counts corrected: 8,680 figures updated (max kill count: 3 → 146)
- Written contents imported: 61,692 rows across 2 worlds
- Underground regions backfilled with type/depth: 1,570 (0 NULLs remaining)
- Backup taken before migration: `chronicler-pre-migration.dump` (17MB)

### Phase 1 Effort Estimate

- Estimated: 6–8 hours
- Total estimated lines of new/modified code: ~630

### Risks (Phase 1 Specific)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Watcher previous_units state not accessible for death detection | MEDIUM | Verify watcher stores previous cycle data; add if missing |
| NVS formula denominator is zero on first cycle | LOW | Guard against division by zero; set floor of 1 for denominators |
| Bridge unit data missing `hist_fig_id` for some units | LOW | HF linking is optional; denizen works with unit_id only |
| `dfhack-run` SSH latency adds to watcher cycle time | LOW | SSH commands are <0.5s; acceptable for 30s+ poll intervals |
| Race condition if two watcher instances run simultaneously | LOW | Add advisory lock or check in watcher startup |
