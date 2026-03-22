# Unified CDM Expansion: Map All In-Game Memory to Database

## Context

Phase 3 Stage 3.1 completed the live ETL pipeline (bridge JSON → units/unit_events/fortress_denizens). The memory→CDM mapping inventory (v2.0) identified 48 world collections totaling ~750K records, of which 93% of narratively useful data is already connected. However, 14 data structures remain unmapped — belief systems, cultural identities, agreements, occupations, squads, wildlife, fortress state, daily events, raws reference, and several JSONB-eligible structures.

**Critical finding**: belief_systems, cultural_identities, agreements, occupations, squads, and wildlife_populations are **NOT in legends XML** — they exist only in DF's live memory. The bridge is the sole extraction path for these structures.

**Goal**: Map EVERYTHING into a unified CDM so no XML data is dropped and no in-game data is dropped. All datapoints connected 1:1 between live memory and static XML. Live events flow into history_events. Richer individual data (skills, moods, activities, movements) tracked per unit.

---

## Design Decisions Summary

| Structure | Records | Decision | Target |
|-----------|---------|----------|--------|
| belief_systems | 1,502 | **New table** | `belief_systems` — has DF ID, deity FK refs, queried for religious narrative |
| cultural_identities | 1,721 | **New table** | `cultural_identities` — has DF ID, ethics/values, linked from units, KH-critical |
| agreements | 3,410 | **New table** | `agreements` — has DF ID, multi-party, temporal |
| occupations | 1,584 | **New table** | `occupations` — has DF ID, HF→site link, queried for "what does this person do" |
| squads | 245 | **New table** | `squads` — has DF ID, already referenced by hf_squad_links (960 rows, no FK target) |
| wildlife_populations | 8,903 | **New table** | `wildlife_populations` — region+creature composite, ecological narrative |
| fortress_state | 1 | **New table** | `fortress_state` — singleton per world, plotinfo + armies + buildings + mandates |
| raws_reference | ~11K | **New table** | `raws_reference` — typed lookup for itemdefs, inorganics, plants, interactions, language |
| interaction_instances | 12 | **JSONB on parent** | `historical_figures.details.active_interaction_details` |
| divination_sets | 1,060 | **JSONB on parent** | `entities.details.divination_sets` |
| image_sets | 1,075 | **JSONB on parent** | `artifacts.details.image_set` / `written_contents.details.image_set` |
| rhythms + scales | 66 | **JSONB on parent** | `art_forms.details.rhythm` / `art_forms.details.scale` |
| daily_events | N/A | **Extend existing** | `unit_events` with new event_types: birth, marriage, grown_up |
| items | 9,263 | **SKIP** | Transient engine state; named items already in artifacts |

**Total: 8 new tables, 4 JSONB expansions, 1 existing table extension, 1 skip**

---

## Implementation Plan

### Step 1: Migration SQL — `migrate_stage31_cdm_expansion.sql`

Write idempotent DDL (CREATE TABLE IF NOT EXISTS, all composite PKs).

**8 new tables:**

```sql
-- belief_systems: Religious systems with deity refs and creation myths
belief_systems (world_id INT, id INT, name TEXT, details JSONB DEFAULT '{}')
  PK: (world_id, id), FK: worlds(id)

-- cultural_identities: Ethics, values, religious practices per site+civ
cultural_identities (world_id INT, id INT, entity_id INT, site_id INT,
                     ethics JSONB DEFAULT '{}', values JSONB DEFAULT '{}',
                     details JSONB DEFAULT '{}')
  PK: (world_id, id), FK: worlds(id), entities, sites

-- agreements: Treaties, peace deals between entity parties
agreements (world_id INT, id INT, type TEXT, year INT, details JSONB DEFAULT '{}')
  PK: (world_id, id), FK: worlds(id)

-- occupations: Tavern keepers, scholars, performers linked to HFs+sites
occupations (world_id INT, id INT, hf_id INT, site_id INT, type TEXT,
             details JSONB DEFAULT '{}')
  PK: (world_id, id), FK: worlds(id), historical_figures, sites

-- squads: Military squads (gives hf_squad_links an FK target)
squads (world_id INT, id INT, entity_id INT, name TEXT, alias TEXT,
        details JSONB DEFAULT '{}')
  PK: (world_id, id), FK: worlds(id), entities

-- wildlife_populations: Fauna per region
wildlife_populations (world_id INT, region_id INT, race TEXT, count INT,
                      details JSONB DEFAULT '{}')
  PK: (world_id, region_id, race), FK: regions(world_id, id)

-- fortress_state: Singleton per world — plotinfo aggregate snapshot
fortress_state (world_id INT, fortress_age INT, fortress_rank TEXT,
                population INT, details JSONB DEFAULT '{}',
                last_updated_at TIMESTAMPTZ DEFAULT now())
  PK: (world_id), FK: worlds(id)

-- raws_reference: Typed lookup for static game definitions
raws_reference (world_id INT, raw_type TEXT, raw_id INT, name TEXT,
                details JSONB DEFAULT '{}')
  PK: (world_id, raw_type, raw_id), FK: worlds(id)
```

**Indexes**: FK-target indexes on occupations(hf_id, site_id), squads(entity_id), etc.

**Files**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/migrate_stage31_cdm_expansion.sql`

---

### Step 2: Bridge v9 — New Lua Extraction Sections

Add 6 new sections to `chronicler-bridge.lua`. Since these structures are **memory-only** (not in XML), the bridge is the sole source.

| New Section | Source | Est. Lines | Frequency |
|-------------|--------|-----------|-----------|
| `plotinfo_state` | `df.global.plotinfo` | ~30 | Every cycle |
| `belief_systems_data` | `world.belief_systems.all` | ~40 | Once per session (static after worldgen) |
| `cultural_identities_data` | `world.cultural_identities.all` | ~50 | Once per session |
| `occupations_data` | `world.occupations.all` | ~30 | Every 10 cycles (slow-changing) |
| `agreements_data` | `world.agreements.all` | ~35 | Once per session |
| `wildlife_data` | `world.populations.all` | ~25 | Once per session |

**One-shot vs every-cycle**: Static worldgen data (belief_systems, cultural_identities, agreements, wildlife) only needs extraction once, stored with a "first cycle" flag. Fortress state changes every tick. Occupations change rarely.

Also promote existing raw-staged sections:
- `squads` → transform to CDM (already captured, just needs ETL)
- `history` → insert into history_events with source='live_bridge'
- `incidents` → enrich unit_events

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

---

### Step 3: Expand ingest_live.py — New Transform Functions

Add 7 new transform/upsert functions following existing pattern (ON CONFLICT upsert, dict details passed directly to asyncpg JSONB codec):

1. `upsert_fortress_state()` — plotinfo + armies/buildings/zones/mandates merged into details
2. `upsert_squads()` — from existing bridge `squads` section
3. `upsert_belief_systems()` — from new bridge section
4. `upsert_cultural_identities()` — from new bridge section
5. `upsert_occupations()` — from new bridge section
6. `upsert_agreements()` — from new bridge section
7. `ingest_live_history_events()` — bridge `history.recent_events` → history_events with source='live_bridge', ON CONFLICT DO NOTHING

Update `ingest_bridge_live()` orchestrator to call steps 8-14 after existing 7 steps. Each wrapped in try/except with logging.

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/ingest_live.py`

---

### Step 4: Raws Reference Extraction

One-shot extraction via controller probe commands for static reference data:
- itemdefs (1,092), inorganics (343), plants (225), entity templates (11)
- interactions (7,096), language words (2,196), translations (6)

Add a `chronicler control extract-raws` CLI command that runs once after bridge deployment, populating `raws_reference` table. These don't change during gameplay.

**Files**: `controller.py` (new probe functions), `cli.py` (new command), `ingest_live.py` (new upsert)

---

### Step 5: Live Event → history_events Promotion

**Strategy**: The bridge's `history` section polls `df.global.world.history.events` with a cursor. New events since last cycle get DF event IDs. Insert directly into `history_events` with `source='live_bridge'` and ON CONFLICT (world_id, id) DO UPDATE to merge live details.

**Reconciliation**: Match `unit_events` CDC records to `history_events` by (hf_id + year + tick). Set `unit_events.reconciled_event_id`. Run every 10 cycles.

**Daily events**: Add bridge eventful subscriptions for births/marriages if available in DFHack eventful API, or detect via history event polling (event types: `add hf entity link` with link_type=spouse for marriage, new HF creation for birth).

---

### Step 6: JSONB Enrichment on Existing Tables

No new code files — extend existing bridge sections and transforms:

- `interaction_instances` (12) → enrich `historical_figures.details.active_interaction_details` during live ETL
- `divination_sets` (1,060) → extract once, store in `entities.details.divination_sets`
- `image_sets` (1,075) → extract once, store in `artifacts.details.image_set`
- `rhythms` (33) + `scales` (33) → extract once, store in `art_forms.details`

---

### Step 7: Validation & Testing

1. Apply migration → verify 8 new empty tables
2. Run bridge v9 on live fortress → verify new sections in JSON
3. Run ingest cycle → verify new tables populated
4. Cross-reference counts: DB records vs `#df.global.world.X.all`
5. Verify FK integrity (especially squads ↔ hf_squad_links)
6. Verify history_events with source='live_bridge' appear
7. Run existing Phase 2 Explorer UI → confirm no regressions

---

## Execution Order

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 1 | Write + apply migration SQL | `migrate_stage31_cdm_expansion.sql` | — |
| 2 | Bridge v9: plotinfo_state + one-shot sections | `chronicler-bridge.lua` | — |
| 3 | Deploy bridge v9 to VM | SSH deploy | #2 |
| 4 | Expand ingest_live.py with new transforms | `ingest_live.py` | #1 |
| 5 | Wire new sections into _ingest_bridge_cycle | `cli.py` | #4 |
| 6 | Promote existing raw-staged sections (squads, history) | `ingest_live.py` | #1, #4 |
| 7 | Add raws extraction CLI command | `controller.py`, `cli.py` | #1 |
| 8 | JSONB enrichment transforms | `ingest_live.py` | #2, #4 |
| 9 | Event reconciliation logic | `ingest_live.py` | #6 |
| 10 | End-to-end validation | — | All |

---

## Key Files

| File | Changes |
|------|---------|
| `DwarfCron/chronicler/db/migrate_stage31_cdm_expansion.sql` | NEW — 8 tables + indexes |
| `DwarfCron/chronicler/db/schema.sql` | Update with new tables (append) |
| `DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | v9: 6 new sections (~200 lines) |
| `DwarfCron/chronicler/dfhack/ingest_live.py` | 7 new transform functions + orchestrator expansion |
| `DwarfCron/chronicler/dfhack/controller.py` | Raws extraction probe functions |
| `DwarfCron/chronicler/cli.py` | New `extract-raws` command + updated section routing |
