# Unified CDM Expansion Plan — Memory-to-CDM Full Mapping

## Context

Phase 3 Live Integration is operational (bridge v8, streaming pipeline, 15 fortress citizens flowing). However, only **3 of 36 bridge sections** are ETL'd into CDM tables, and **6 memory-only structures** (belief_systems, cultural_identities, agreements, occupations, squads, wildlife_populations) have zero CDM representation. The mapping document (`phase-3-memory-cdm-mapping.md`) identifies 166 extractable memory fields: 82 CONNECTED, 64 CDM-NEW needed, 20 SKIP. Current coverage: 49% → target: 88%.

This plan wires everything into a unified CDM so no XML data is dropped, no in-game data is dropped, and live events integrate seamlessly with legends history.

---

## Part 1: Schema Migration (V5)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/migrate_stage31_cdm_expansion.sql`

### 1.1 New Tables (7)

All follow `(world_id, id)` composite PK + `REFERENCES worlds(id) ON DELETE CASCADE`.

| Table | Records | Priority | Purpose |
|-------|---------|----------|---------|
| `belief_systems` | ~1,502 | MED | Religious systems — deity worship, creation myths, cultural values |
| `cultural_identities` | ~1,721 | MED | Ethics/values per identity — links to units via `cultural_identity` |
| `squads` | ~245 | MED | Military squads — composition, leader, orders |
| `occupations` | ~1,584 | MED | Tavern keepers, scholars, performers — HF↔location links |
| `fortress_state` | periodic | MED | Fortress progression snapshots — rank, infiltrators, invasions |
| `interaction_instances` | ~12 | HIGH | Active curses/vampirism/lycanthropy — small but narratively critical |
| `agreements` | ~3,410 | LOW | Treaties, peace deals, tribute — defer unless diplomacy needed |

**Table DDL**:

```sql
-- belief_systems: Religious belief systems (memory-only, no XML)
CREATE TABLE IF NOT EXISTS belief_systems (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    deities          INTEGER[],           -- HF IDs of deities
    worship_levels   INTEGER[],           -- parallel: intensity per deity
    cultural_values  JSONB DEFAULT '{}',  -- {value_type: weight}
    details          JSONB DEFAULT '{}',  -- creation myths, stories
    PRIMARY KEY (world_id, id)
);

-- cultural_identities: Cultural ethics/values (memory-only, no XML)
CREATE TABLE IF NOT EXISTS cultural_identities (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    site_id          INT,
    civ_id           INT,
    ethics           JSONB DEFAULT '{}',  -- {ethic_topic: response}
    cultural_values  JSONB DEFAULT '{}',  -- parallels personality values
    details          JSONB DEFAULT '{}',  -- group_log, rumor_info, practices
    PRIMARY KEY (world_id, id),
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id) ON DELETE SET NULL,
    FOREIGN KEY (world_id, civ_id) REFERENCES entities(world_id, id) ON DELETE SET NULL
);

-- squads: Military squads (bridge already extracts; needs CDM table)
CREATE TABLE IF NOT EXISTS squads (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    entity_id        INT,
    name             TEXT,
    name_english     TEXT,
    alias            TEXT,
    leader_hf_id     INT,
    position_count   INT DEFAULT 0,
    members          JSONB DEFAULT '[]',  -- [{position, histfig_id, unit_id}]
    details          JSONB DEFAULT '{}',  -- ammunition, orders, uniforms
    last_synced_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id) ON DELETE SET NULL
);

-- occupations: HF roles at specific locations (memory-only, no XML)
CREATE TABLE IF NOT EXISTS occupations (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    occupation_type  TEXT NOT NULL,
    hf_id            INT,
    unit_id          INT,
    site_id          INT,
    location_id      INT,
    entity_id        INT,
    details          JSONB DEFAULT '{}',  -- service orders
    PRIMARY KEY (world_id, id),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id) ON DELETE SET NULL,
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id) ON DELETE SET NULL
);

-- fortress_state: Append-only progression snapshots (1/season)
CREATE TABLE IF NOT EXISTS fortress_state (
    id               SERIAL PRIMARY KEY,
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    site_id          INT NOT NULL,
    fortress_age     INT,
    fortress_rank    INT,             -- 0=outpost..4=monarchy
    population       INT,
    king_arrived     BOOLEAN DEFAULT FALSE,
    infiltrators     INTEGER[],       -- HF IDs of known infiltrators
    invasion_count   INT DEFAULT 0,
    wealth_created   BIGINT,
    wealth_imported  BIGINT,
    wealth_exported  BIGINT,
    game_year        INT,
    game_tick        INT,
    details          JSONB DEFAULT '{}',
    captured_at      TIMESTAMPTZ DEFAULT now()
);

-- interaction_instances: Active curses/syndromes (memory-only)
CREATE TABLE IF NOT EXISTS interaction_instances (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    interaction_type TEXT,
    source_hf_id     INT,
    affected_units   INTEGER[],
    details          JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

-- agreements: Treaties/peace/tribute (memory-only, LOW priority)
CREATE TABLE IF NOT EXISTS agreements (
    world_id         INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    id               INT NOT NULL,
    agreement_type   TEXT,
    parties          JSONB DEFAULT '[]',  -- [{entity_id, histfig_id, role}]
    flags            JSONB DEFAULT '{}',
    map_x            INT,
    map_y            INT,
    details          JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

### 1.2 New Columns on Existing Tables

```sql
-- HF ↔ Unit bidirectional link
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS unit_id INT;
CREATE INDEX IF NOT EXISTS idx_hf_unit_id ON historical_figures(world_id, unit_id) WHERE unit_id IS NOT NULL;

-- Family lineage root
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS family_head_id INT;

-- Region enrichment (fauna, evil flags, flora)
ALTER TABLE regions ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
```

### 1.3 Indexes for New Tables

```sql
CREATE INDEX IF NOT EXISTS idx_belief_systems_world ON belief_systems(world_id);
CREATE INDEX IF NOT EXISTS idx_cultural_identities_civ ON cultural_identities(world_id, civ_id);
CREATE INDEX IF NOT EXISTS idx_squads_entity ON squads(world_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_occupations_hf ON occupations(world_id, hf_id);
CREATE INDEX IF NOT EXISTS idx_occupations_site ON occupations(world_id, site_id);
CREATE INDEX IF NOT EXISTS idx_fortress_state_world ON fortress_state(world_id);
CREATE INDEX IF NOT EXISTS idx_fortress_state_time ON fortress_state(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_inst_world ON interaction_instances(world_id);
CREATE INDEX IF NOT EXISTS idx_agreements_world ON agreements(world_id);
```

---

## Part 2: Bridge v9 — New Lua Extraction Functions

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

Add 6 new extraction functions and wire them into `write_state()`:

| Function | Source | Records | Frequency | Est. Lines |
|----------|--------|---------|-----------|------------|
| `get_belief_systems()` | `world.belief_systems.all` | ~1,502 | Every cycle | ~40 |
| `get_cultural_identities()` | `world.cultural_identities.all` | ~1,721 | Every cycle | ~60 |
| `get_occupations()` | `world.occupations.all` | ~1,584 | Every cycle | ~40 |
| `get_interaction_instances()` | `world.interaction_instances.all` | ~12 | Every cycle | ~30 |
| `get_fortress_state()` | `df.global.plotinfo` | 1 snapshot | Once/season | ~80 |
| `get_daily_events()` | `plotinfo.daily_events` | ~few/day | Every cycle | ~50 |

**NOT extracted (Tier 3 deferred)**: agreements, wildlife_populations (too large/low value for per-cycle extraction; one-time bulk extract if needed).

---

## Part 3: ETL Pipeline Expansion

**New file**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/etl_expanded.py`

Promotes bridge sections from `lua_probes` archival to proper CDM table ingestion.

### 3.1 Bridge Section → CDM Table Routing

| Bridge Section | Current Fate | New CDM Target | ETL Function | Priority |
|----------------|-------------|----------------|--------------|----------|
| `unit_summary` | ✅ CDM | `units`, `fortress_denizens` | existing | — |
| `dwarf_skills` | ✅ CDM | `units.details.skills` | existing | — |
| `dwarf_personality` | ✅ CDM | `units.details.personality` | existing | — |
| `dwarf_emotions` | ✅ CDM | `units.details.emotions` | existing | — |
| `reactive_events` | ⚠️ archived | `unit_events` | `process_reactive_events()` | Tier 1 |
| `skill_changes` | ⚠️ archived | `unit_events` (SKILL_UP) | `process_skill_changes()` | Tier 1 |
| `history` | ⚠️ archived | `history_events` (source='live_bridge') | **NEW** `etl_live_history()` | Tier 1 |
| `incidents` | ⚠️ archived | `unit_events` enrichment | **NEW** `etl_incidents()` | Tier 1 |
| `squads` | ⚠️ archived | `squads` table | **NEW** `etl_squads()` | Tier 2 |
| `announcements` | ⚠️ archived | `game_reports` | **NEW** `etl_announcements()` | Tier 2 |
| `event_collections` | ⚠️ archived | `history_event_collections` (update) | **NEW** `etl_event_collections()` | Tier 2 |
| `entities` | ⚠️ archived | `entities` (update live state) | **NEW** `etl_entities_live()` | Tier 2 |
| `diplomacy` | ⚠️ archived | `entity_entity_links.details` | **NEW** `etl_diplomacy()` | Tier 2 |
| `artifacts` | ⚠️ archived | `artifacts` (update holder/location) | **NEW** `etl_artifacts_live()` | Tier 2 |
| **NEW** `belief_systems` | — | `belief_systems` table | **NEW** `etl_belief_systems()` | Tier 2 |
| **NEW** `cultural_identities` | — | `cultural_identities` table | **NEW** `etl_cultural_identities()` | Tier 2 |
| **NEW** `occupations` | — | `occupations` table | **NEW** `etl_occupations()` | Tier 2 |
| **NEW** `interaction_instances` | — | `interaction_instances` table | **NEW** `etl_interaction_instances()` | Tier 1 |
| **NEW** `fortress_state` | — | `fortress_state` table | **NEW** `etl_fortress_state()` | Tier 2 |
| **NEW** `daily_events` | — | `unit_events` (birth/marriage/grown_up) | **NEW** `etl_daily_events()` | Tier 2 |
| `armies` | ⚠️ archived | `entities.details.armies` JSONB | **NEW** `etl_armies()` | Tier 3 |
| `mandates` | ⚠️ archived | `fortress_state.details` | captured in fortress_state | Tier 3 |
| `buildings` | ⚠️ archived | `fortress_state.details` | captured in fortress_state | Tier 3 |
| `zones` | ⚠️ archived | stay in lua_probes | deferred | Tier 3 |

### 3.2 Watcher Integration

Modify `watcher.py` `_store_bridge_sections()` to call `etl_expanded` functions after archiving to `lua_probes`. Add conditional fortress_state capture (once per season change).

### 3.3 Event Reconciliation

Already partially implemented (Stage 3.0 added `reconciled_event_id`, `reconciled_at` to `unit_events` and `source` to `history_events`). Complete by:

1. `etl_live_history()` inserts live events with `source='live_bridge'`
2. Post-XML-import reconciliation pass matches `unit_events` to `history_events` by HF ID + year + type
3. Run as part of `chronicler ingest` pipeline (after XML import)

---

## Part 4: Implementation Order

### Phase A: Tier 1 Foundation

1. **SQL migration V5** — Create all 7 new tables + 3 ALTER statements
2. **`process_reactive_events()`** — Process buffered eventful callbacks into `unit_events`
3. **`process_skill_changes()`** — Generate SKILL_UP events from skill deltas
4. **`etl_live_history()`** — Promote bridge `history` section to `history_events`
5. **`etl_incidents()`** — Death cause enrichment pipeline
6. **`etl_interaction_instances()`** — Active curses/syndromes

### Phase B: Tier 2 Social/Military/Cultural

7. **`etl_squads()`** — Military squad upsert (bridge already extracts)
8. **Lua: `get_fortress_state()`** + **`etl_fortress_state()`** — Fortress progression
9. **`etl_announcements()`** — Game reports into `game_reports` table
10. **`etl_artifacts_live()`** — Update artifact locations/holders
11. **`etl_event_collections()`** — Refresh active wars/battles
12. **`etl_entities_live()`** + **`etl_diplomacy()`** — Entity live state + diplomatic relations

### Phase C: Tier 2 Memory-Only Structures

13. **Lua: `get_belief_systems()` + `get_cultural_identities()` + `get_occupations()` + `get_interaction_instances()` + `get_daily_events()`** — 5 new bridge extraction functions
14. **ETL for each** — `etl_belief_systems()`, `etl_cultural_identities()`, `etl_occupations()`, `etl_daily_events()`
15. **Event reconciliation pass** — Post-XML-import matching

### Phase D: Tier 3 Deferred (only if needed)

16. `agreements` table + one-time bulk extract
17. `wildlife_populations` — one-time bulk extract
18. `etl_armies()` — army state JSONB
19. Item definitions reference table

---

## Part 5: Connection Map (How Everything Links)

```
LEGENDS (XML batch)                          LIVE (bridge v9 real-time)
─────────────────                            ────────────────────────
historical_figures ←── hist_fig_id ──────→ units
  (birth/death/links)                        (position/job/mood/personality)
  NEW: unit_id column ──────────────────→ units.id (bidirectional)
                                             │
entities ←── civ_id ─────────────────────→ units.civ_id
  │                                          │
  ├── entity_entity_links (PARENT/CHILD)     │
  ├── entity_site_links (own/occupy)         │
  └── NEW: diplomacy updates ────────────→ diplomacy bridge section
                                             │
history_events ←── reconciliation ───────→ unit_events (CDC stream)
  source='legends_xml'                       source='live_bridge'
  NEW: source='live_bridge' ←────────────→ bridge history section
                                             │
fortress_denizens ←─ unit_id + hf_id ───→ Both tables
                                             │
NEW: squads ←─ entity_id ───────────────→ entities
  members[].histfig_id ─────────────────→ historical_figures
                                             │
NEW: belief_systems ←─ deities[] ───────→ historical_figures (is_deity)
  entity → belief_system link                │
                                             │
NEW: cultural_identities ←─ civ_id ─────→ entities
  unit.cultural_identity ───────────────→ cultural_identities.id
                                             │
NEW: occupations ←─ hf_id ─────────────→ historical_figures
  site_id ──────────────────────────────→ sites
                                             │
NEW: interaction_instances ─────────────→ historical_figures (is_vampire etc.)
  affected_units[] ─────────────────────→ units
                                             │
NEW: fortress_state ←─ site_id ─────────→ sites
  infiltrators[] ───────────────────────→ historical_figures
```

---

## Part 6: Verification

1. **Schema migration**: Run `psql -f migrate_stage31_cdm_expansion.sql` → verify 7 new tables via `\dt`
2. **Bridge v9 deploy**: SCP updated `chronicler-bridge.lua` to VM → verify new sections in `chronicler-state.json`
3. **ETL smoke test**: Run one bridge cycle → check each new table has rows
4. **Reconciliation test**: Import legends XML → run reconciliation → verify `unit_events.reconciled_event_id` populated for matching deaths
5. **FK integrity**: `SELECT COUNT(*) FROM belief_systems b WHERE NOT EXISTS (SELECT 1 FROM worlds w WHERE w.id = b.world_id)` → expect 0
6. **Coverage metric**: Query all tables with record counts → verify 88%+ of memory fields have CDM representation

---

## Critical Files

| File | Action |
|------|--------|
| `DwarfCron/chronicler/db/migrate_stage31_cdm_expansion.sql` | **CREATE** — V5 migration |
| `DwarfCron/chronicler/db/schema.sql` | **UPDATE** — add new tables to canonical schema |
| `DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | **UPDATE** — add 6 new extraction functions (bridge v9) |
| `DwarfCron/chronicler/dfhack/etl_expanded.py` | **CREATE** — new ETL module for promoted bridge sections |
| `DwarfCron/chronicler/dfhack/ingest_live.py` | **UPDATE** — call etl_expanded functions from orchestrator |
| `DwarfCron/chronicler/dfhack/watcher.py` | **UPDATE** — route sections to CDM instead of only lua_probes |
| `Jarvis/projects/chronicler/reports/phase-3-memory-cdm-mapping.md` | **UPDATE** — mark statuses as implemented |
