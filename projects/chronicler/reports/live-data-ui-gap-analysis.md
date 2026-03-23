# Live Data → UI Gap Analysis: Complete Audit & Implementation Plan

**Date**: 2026-03-22 (Session 46)
**Purpose**: Exhaustive investigation of whether live game data flows through to the Chronicler UI
**Status**: ANALYSIS COMPLETE — reveals fundamental architectural gap

---

## Executive Summary

**The Chronicler UI currently shows a static snapshot from legends XML. Live game data is captured by the bridge and partially ingested into the database, but almost none of it propagates to what the user sees in the web UI.**

The core problem: **25 legends tables and 13 live tables exist as two separate, non-communicating data worlds.** When a citizen dies in-game, `unit_events` gets a DEPARTED record and `announcements` captures the text — but `historical_figures.death_year` stays NULL and `historical_figures.alive` stays TRUE. The UI, which queries `historical_figures`, shows the dead dwarf as alive.

### Key Numbers

| Metric | Value |
|--------|-------|
| Total CDM tables | 39 |
| Tables populated by legends XML only | 25 |
| Tables populated by live data only | 13 |
| Tables populated by BOTH | **0** |
| Bridge sections reaching CDM tables | 12/26 |
| Bridge sections stuck in raw staging (`lua_probes`) | 13/26 |
| UI pages with dedicated detail views | 6 (HF, entity, site, region, event, world) |
| UI pages showing ANY live data | **0** |
| Live data tables with dedicated UI pages | **0** |

---

## Part 1: UI Features Audit — What the User Sees

### 1.1 Page Inventory

| Page | Route | Template | Tables Queried |
|------|-------|----------|----------------|
| Explorer (main) | `/explorer` | `explorer.html` | All 33 ALLOWED_TABLES (generic query API) |
| Figure Detail | `/explorer/figure/{wid}/{hfid}` | `hf_detail.html` | `historical_figures`, `hf_links`, `hf_entity_links`, `hf_site_links`, `history_events`, `artifacts` |
| Entity Detail | `/explorer/entity/{wid}/{eid}` | `entity_detail.html` | `entities`, `hf_entity_links`, `historical_figures`, `entity_site_links`, `entity_entity_links`, `entity_populations`, `history_event_collections` |
| Site Detail | `/explorer/site/{wid}/{sid}` | `site_detail.html` | `sites`, `entity_site_links`, `entities`, `hf_site_links`, `historical_figures`, `history_events`, `regions` |
| Region Detail | `/explorer/region/{wid}/{rid}` | `region_detail.html` | `regions`, `history_events` |
| Event Detail | `/explorer/event/{wid}/{eid}` | `event_detail.html` | `history_events`, `historical_figures`, `sites`, `entities`, `event_relationships` |
| World Detail | `/explorer/world/{wid}` | `world_detail.html` | `worlds`, `historical_eras`, `hf_entity_links`, `entities` |
| Civ Members API | `/api/explorer/civilizations/{id}/members` | JSON | `hf_entity_links`, `historical_figures` |

### 1.2 Data Fields Affected by Live Gameplay

Every detail page queries `historical_figures` — the most important table. These fields SHOULD change during live gameplay but DON'T:

| Field | Displayed On | Should Change When | Currently Updated? |
|-------|-------------|-------------------|-------------------|
| `death_year` | HF detail, entity members, site residents | Citizen dies in-game | **NO** |
| `death_cause` | HF detail | Citizen dies | **NO** |
| `alive` | Used in alive/dead filter | Citizen dies | **NO** |
| `kill_count` | HF detail | Citizen kills enemy | **NO** |
| `event_count` | HF detail (score) | Any event involving HF | **NO** |
| `hf_entity_links.link_type` | Entity members (member vs former_member) | Citizen banished/leaves | **NO** |
| `hf_site_links` | Site residents | Citizen moves sites | **NO** |
| `history_events` | HF detail, site events, event detail | New events during gameplay | **NO** — live events go to `live_history`, a completely separate table |
| Entity member count | Entity detail | Deaths, migrations | **NO** — count computed from static `hf_entity_links` |
| Site event list | Site detail | Combat, construction, deaths at site | **NO** — queries `history_events` only |

### 1.3 Live Data Tables with NO UI

These tables contain live game data but have NO dedicated page or visualization:

| Table | Contains | UI Status |
|-------|----------|-----------|
| `units` | Current fortress citizens (stress, skills, position, job) | **No page** |
| `unit_events` | Arrivals, departures, skill-ups, stress changes | **No page** |
| `fortress_denizens` | Who is/was in the fortress, arrival/departure ticks | **No page** |
| `fortress_state` | Seasonal snapshots (wealth, population, food, drink) | **No page** |
| `squads` | Military squad composition | **No page** |
| `announcements` | Combat text, events, alerts | **No page** |
| `live_history` | Recent in-game history events | **No page** |
| `belief_systems` | Religious/value systems | **No page** |
| `cultural_identities` | Cultural identity records | **No page** |
| `occupations` | Occupational records | **No page** |
| `embeddings` | Vector search infrastructure | **No page** (not even queryable) |

---

## Part 2: Database Pipeline Audit — Where Data Flows (and Stops)

### 2.1 Bridge Section → CDM Table Status

| # | Bridge Section | ETL Function | CDM Table | Status |
|---|---------------|-------------|-----------|--------|
| 1 | `fortress_units` | `_ingest_units()` | `units` | **FULL CDM** |
| 2 | `squads` | `_ingest_squads()` | `squads` | **FULL CDM** |
| 3 | `announcements` | `_ingest_announcements()` | `announcements` | **FULL CDM** |
| 4 | `history` | `_ingest_live_history()` | `live_history` | **FULL CDM** |
| 5 | `skill_changes` | `_ingest_unit_events()` | `unit_events` | **FULL CDM** |
| 6 | `belief_systems` | `_ingest_belief_systems()` | `belief_systems` | **FULL CDM** |
| 7 | `cultural_identities` | `_ingest_cultural_identities()` | `cultural_identities` | **FULL CDM** |
| 8 | `occupations` | `_ingest_occupations()` | `occupations` | **FULL CDM** |
| 9 | `interaction_instances` | `_ingest_interaction_instances()` | `interaction_instances` | **FULL CDM** |
| 10 | `fortress_state` | `_ingest_fortress_state()` | `fortress_state` | **FULL CDM** (season boundaries) |
| 11 | `daily_events` | `_ingest_daily_events()` | `daily_events` | **FULL CDM** |
| 12 | CDC events | `_detect_cdc_events()` | `unit_events` | **FULL CDM** |
| 13 | `dwarf_skills` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 14 | `dwarf_personality` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 15 | `dwarf_emotions` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 16 | `noble_positions` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 17 | `buildings` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 18 | `artifacts` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 19 | `diplomacy` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 20 | `entities` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 21 | `zones` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 22 | `event_collections` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 23 | `mandates` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 24 | `incidents` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 25 | `reactive_events` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |
| 26 | `world_info` | `_ingest_probe()` | `lua_probes` | **STAGING ONLY** |

### 2.2 The Three Pipeline Breaks

**BREAK-1: Legends Tables Never Updated by Live Data**

The most critical gap. When events happen in-game:
- Citizen dies → `unit_events` DEPARTED + `announcements` text → BUT `historical_figures.death_year` stays NULL, `alive` stays TRUE
- New history events → `live_history` table → BUT `history_events` (queried by all detail pages) is never updated
- Entity membership changes → detected by CDC → BUT `hf_entity_links.link_type` never flips from 'member' to 'former_member'
- Artifact created → bridge captures it → BUT `artifacts` table keeps only legends XML data

**Impact**: The entire UI shows stale worldgen-era data. A fortress that had 15 citizens die shows them all as alive.

**BREAK-2: Live Events in Separate Table from UI Queries**

Live history events go to `live_history` table. But all detail pages (site events, HF events, event detail) query `history_events`. These are completely separate tables with different schemas:

| | `history_events` (UI queries this) | `live_history` (live data goes here) |
|---|---|---|
| PK | `(world_id, id)` | `(world_id, tick, event_type)` |
| Schema | year, seconds72, type, details | tick, event_type, details |
| Source | Legends XML | Bridge `history` section |
| Queried by UI | YES | NO |

**BREAK-3: 13/26 Bridge Sections Stuck in Raw Staging**

Half the bridge output lands in `lua_probes` as opaque JSONB blobs, never extracted to structured CDM tables. This means skills, personality, emotions, buildings, diplomacy, noble positions, etc. are technically in the database but not in a form the UI can query.

### 2.3 CDC (Change Detection) Coverage

The watcher detects these changes between bridge cycles:

| Event Type | Detection Method | CDM Table | UI Visible? |
|-----------|-----------------|-----------|-------------|
| `stress_change` | `abs(new - old) > 5000` | `unit_events` | **NO** |
| `ARRIVED` | Unit in new, not in old | `unit_events` | **NO** |
| `DEPARTED` | Unit in old, not in new | `unit_events` | **NO** |
| `SKILL_UP/DOWN` | Skill rating diff | `unit_events` | **NO** |
| `PROFESSION_CHANGED` | Profession string diff | `unit_events` | **NO** |

All CDC events are captured correctly but none are visible in the UI.

### 2.4 Data NOT Captured by Bridge at All

| Missing Data | Available In DF | Impact |
|-------------|-----------------|--------|
| Death causes | `unit.counters.death_cause` (51 types) | HIGH — narrative needs "killed by goblin" not just "departed" |
| Combat reports | `world.status.reports` (structured combat data) | HIGH — combat is the most compelling DF narrative |
| Wounds/injuries | `unit.body.wounds` | MEDIUM |
| Relationship changes | `histfig_links` mutations | HIGH |
| Strange moods | `unit.mood` (0-5 enum) | HIGH — iconic DF events |
| Birth vs migration | `onUnitNewActive` callback | MEDIUM |
| Trade transactions | `plotinfo.caravans` | MEDIUM |
| Building CDC | compare building counts across cycles | MEDIUM |
| Individual thoughts/memories | `personality.memories` | MEDIUM |

---

## Part 3: The Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CURRENT DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DF Game Memory ──→ Bridge Lua ──→ SSH ──→ Watcher                 │
│       │                                      │                      │
│       │                              ┌───────┴───────┐              │
│       │                              │               │              │
│       │                         12 sections     13 sections         │
│       │                         with ETL        RAW ONLY            │
│       │                              │               │              │
│       │                              ▼               ▼              │
│       │                      ┌──────────────┐ ┌──────────────┐     │
│       │                      │ Live Tables  │ │  lua_probes  │     │
│       │                      │ (units,      │ │  (raw JSONB  │     │
│       │                      │  unit_events,│ │   staging)   │     │
│       │                      │  squads,     │ │              │     │
│       │                      │  etc.)       │ │  DEAD END    │     │
│       │                      └──────────────┘ └──────────────┘     │
│       │                              │                              │
│       │                              │ ← NO CONNECTION →            │
│       │                              │                              │
│  Legends XML ──→ XML Parser ──→ Post-Parse                         │
│                                      │                              │
│                                      ▼                              │
│                              ┌──────────────┐                      │
│                              │ Legends Tbls │                      │
│                              │ (hist_figs,  │                      │
│                              │  hist_events,│ ←── UI QUERIES       │
│                              │  entities,   │     ONLY THESE       │
│                              │  sites, etc.)│                      │
│                              └──────────────┘                      │
│                                      │                              │
│                                      ▼                              │
│                              ┌──────────────┐                      │
│                              │  Web UI      │                      │
│                              │  (6 detail   │                      │
│                              │   pages)     │                      │
│                              │              │                      │
│                              │  SHOWS STALE │                      │
│                              │  DATA ONLY   │                      │
│                              └──────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Implementation Plan — Making Live Data Visible

### Design Philosophy

Rather than creating a parallel live UI, we should **merge live data INTO the legends tables** so the existing UI automatically reflects current game state. This is the "single source of truth" approach.

Additionally, we need new UI components for live-only data (fortress dashboard, event log, denizen roster).

### Phase A: Live → Legends Table Sync (THE CRITICAL FIX)

Create a new module `chronicler/dfhack/live_sync.py` that runs after each watcher cycle and propagates live changes to legends tables.

#### A1: Death Sync
When `unit_events` records a DEPARTED event for a unit with `hist_fig_id`:
```sql
UPDATE historical_figures
SET death_year = <game_year>,
    death_cause = <cause_from_death_cause_enum>,
    alive = FALSE
WHERE world_id = $1 AND id = $2 AND death_year IS NULL;
```
**Also needed**: Enhance bridge to capture `unit.counters.death_cause` BEFORE the unit leaves the active list.

#### A2: Event Sync
Merge `live_history` events into `history_events`:
```sql
INSERT INTO history_events (world_id, id, year, seconds72, type, details)
SELECT world_id,
       (SELECT COALESCE(MAX(id), 0) + ROW_NUMBER() OVER() FROM history_events WHERE world_id = $1),
       <year>, <tick_to_seconds72>, event_type, details
FROM live_history
WHERE world_id = $1 AND tick > $2
ON CONFLICT DO NOTHING;
```

#### A3: Entity Link Sync
When a citizen dies or is banished, update `hf_entity_links`:
```sql
UPDATE hf_entity_links
SET link_type = 'former_member'
WHERE world_id = $1 AND hf_id = $2 AND entity_id = $3 AND link_type = 'member';
```

#### A4: Kill Count Sync
When combat events with kills are detected:
```sql
UPDATE historical_figures
SET kill_count = kill_count + 1
WHERE world_id = $1 AND id = $2;
```

#### A5: HF ↔ Unit Link
Populate `historical_figures.unit_id` from live unit data:
```sql
UPDATE historical_figures
SET unit_id = $2
WHERE world_id = $1 AND id = $3 AND unit_id IS NULL;
```

### Phase B: Bridge Enhancement — Capture Missing Data

#### B1: Death Cause Capture
In `chronicler-bridge.lua`, when a unit has `counters.death_cause >= 0`:
```lua
unit_data.death_cause = df.death_type[unit.counters.death_cause]
unit_data.death_id = unit.counters.death_id
```
**Critical**: Must capture this from units that are still in `world.units.active` but have `flags1.dead == true`, BEFORE they disappear from the active list.

#### B2: Strange Mood Detection
Add to bridge:
```lua
unit_data.mood = unit.mood  -- 0=normal, 1=fey, 2=secretive, 3=possessed, 4=fell, 5=macabre
unit_data.mood_skill = unit.job.mood_skill  -- skill being used for artifact
```

#### B3: Relationship Change Detection
Add CDC for `hf_links` changes (compare histfig_links between cycles).

#### B4: Combat Report Extraction
Add bridge section for `world.status.reports`:
```lua
local reports = {}
for i = math.max(0, #df.global.world.status.reports - 50), #df.global.world.status.reports - 1 do
    local r = df.global.world.status.reports[i]
    table.insert(reports, {id=r.id, type=r.type, year=r.year, ...})
end
```

### Phase C: Staging → CDM Promotion

Move 13 staging-only bridge sections from `lua_probes` to proper CDM tables or existing table columns.

| Staging Section | Target | Method |
|----------------|--------|--------|
| `dwarf_skills` | `units.skills` JSONB column | Already partially done — verify completeness |
| `dwarf_personality` | `units.attributes` JSONB column | Merge personality traits into existing column |
| `dwarf_emotions` | `unit_events` with type=EMOTION | Already done by etl_expanded |
| `noble_positions` | New `noble_appointments` column or table | New: per-fortress noble state |
| `buildings` | New `fortress_buildings` table OR `fortress_state.details` | Append to seasonal snapshot |
| `diplomacy` | `live_history` with type=DIPLOMACY | Already done by etl_expanded |
| `entities` | Update `entities` table member counts | Sync live counts to legends table |
| `zones` | `fortress_state.details` JSONB | Append zone summary to state |
| `event_collections` | `history_event_collections` | Merge new collections into legends table |
| `mandates` | `live_history` with type=MANDATE | Already done by etl_expanded |
| `incidents` | `unit_events` with type=INCIDENT | Already done by etl_expanded |
| `reactive_events` | `live_history` with type=REACTIVE_EVENT | Already done by etl_expanded |
| `artifacts` | `artifacts` table | Upsert live artifact changes into legends table |

**Note**: Several of these (emotions, diplomacy, mandates, incidents, reactive_events) are ALREADY being promoted by `etl_expanded.py`. The gap analysis initially counted them as staging-only because they go to `lua_probes` AND to `unit_events`/`live_history`. The actual staging-only sections are: `dwarf_skills`, `noble_positions`, `buildings`, `entities`, `zones`, `event_collections`, `artifacts`.

### Phase D: New UI Components

#### D1: Fortress Dashboard (NEW PAGE)
Route: `/explorer/fortress/{wid}/{site_id}`
Shows:
- Live citizen roster (from `units` + `fortress_denizens`)
- Current stress levels, skills, professions
- Food/drink/wealth from `fortress_state`
- Recent events from `unit_events` + `announcements`
- Military squad composition from `squads`
- Population timeline chart from `fortress_state` time series

#### D2: Event Log (NEW PAGE)
Route: `/explorer/events/live/{wid}`
Shows:
- Combined feed from `unit_events`, `announcements`, `live_history`
- Filterable by type (combat, arrival, departure, skill-up, death)
- Real-time-ish (refreshes on page load from latest DB state)

#### D3: Enhanced Site Detail
Add new tab: "Live Fortress" (visible only for sites that have live data)
- Shows current denizen count from `fortress_denizens`
- Shows recent events from `live_history` WHERE site_id matches
- Shows fortress_state seasonal data

#### D4: Enhanced HF Detail
When viewing an HF that is also a live unit (`units.hist_fig_id = hf.id`):
- Show current stress, skills, profession from `units` table
- Show recent unit_events for this unit
- Show live status badge: "Currently in Girderpriced" or "Deceased (Y256)"

### Phase E: Watcher Cycle Enhancement

#### E1: Post-Ingest Sync Step
After each watcher cycle's ingestion, run `live_sync.py`:
```python
async def post_ingest_sync(conn, world_id, bridge_data):
    await sync_deaths(conn, world_id, bridge_data)
    await sync_entity_links(conn, world_id, bridge_data)
    await sync_hf_unit_ids(conn, world_id, bridge_data)
    await sync_kill_counts(conn, world_id, bridge_data)
    await sync_live_events_to_history(conn, world_id, bridge_data)
```

#### E2: Periodic Full Sync
Every N cycles (e.g., season boundary), run a comprehensive reconciliation:
- Re-scan all units for death_cause
- Rebuild entity member counts
- Merge all unmerged live_history into history_events
- Update artifact locations/holders

---

## Part 5: Implementation Priority & Sequencing

### Priority 1: CRITICAL (Must-have for Phase 3 closure)
1. **A1: Death sync** — `historical_figures.death_year/death_cause/alive` from `unit_events` DEPARTED
2. **A2: Event sync** — Merge `live_history` → `history_events` so site/HF detail pages show live events
3. **A5: HF-unit link** — `historical_figures.unit_id` population
4. **B1: Death cause capture** — Bridge enhancement to read `unit.counters.death_cause`

### Priority 2: HIGH (Strong value for user experience)
5. **D1: Fortress dashboard** — New page showing live fortress state
6. **D4: Enhanced HF detail** — Show live unit data alongside HF data
7. **A3: Entity link sync** — Member→former_member on death/departure
8. **D2: Event log** — Combined live event feed

### Priority 3: MEDIUM (Polish & completeness)
9. **D3: Enhanced site detail** — Live fortress tab
10. **B2: Strange mood detection** — Bridge enhancement
11. **C1-C7: Staging promotions** — Move remaining sections from lua_probes to CDM
12. **A4: Kill count sync** — Combat kill tracking
13. **E1-E2: Watcher sync integration** — Automated post-ingest sync

### Priority 4: NICE-TO-HAVE (Future phases)
14. **B3: Relationship change CDC** — Detect new marriages, grudges, etc.
15. **B4: Combat report extraction** — Structured combat data
16. Fortress state time-series charts
17. Population timeline visualization

---

## Part 6: Estimated Effort

| Phase | Scope | Effort | Files Modified |
|-------|-------|--------|----------------|
| A (Live→Legends sync) | 5 sync functions | 1-2 sessions | New: `live_sync.py`. Modified: `watcher.py` |
| B (Bridge enhancement) | 2-4 new bridge sections | 1 session | Modified: `chronicler-bridge.lua`, `controller.py` |
| C (Staging promotion) | 7 ETL functions | 1 session | Modified: `etl_expanded.py`, possibly `schema.sql` |
| D (New UI) | 2 new pages + 2 enhanced | 2-3 sessions | New: templates, route handlers. Modified: `app.py`, `detail_pages.py` |
| E (Watcher integration) | 2 functions | 0.5 session | Modified: `watcher.py` |
| **Total** | | **5-7 sessions** | |

---

## Files Examined (Across All 3 Audit Agents)

### Web UI
- `chronicler/web/app.py` — Route definitions, API handlers, ALLOWED_TABLES
- `chronicler/web/civilizations.py` — Civ browser, member filtering
- `chronicler/web/detail_pages.py` — All 6 detail page handlers
- `chronicler/web/templates/*.html` — 9 templates (base, explorer, 6 detail, 1 placeholder)
- `chronicler/web/static/js/explorer.js` — Client-side filtering, pagination

### Database & ETL
- `chronicler/db/schema.sql` — 39 tables, all columns documented
- `chronicler/dfhack/watcher.py` — 1077 lines, streaming orchestrator
- `chronicler/dfhack/etl_expanded.py` — 530 lines, 16 ETL functions
- `chronicler/dfhack/sync.py` — 536 lines, unit/denizen sync
- `chronicler/dfhack/controller.py` — GameController, 13 commands
- `chronicler/ingest/xml_parser.py` — Legends XML parser
- `chronicler/ingest/post_parse.py` — 10 post-parse steps

### Bridge
- `chronicler/dfhack/scripts/chronicler-bridge.lua` — 819 lines, 26 sections

### Embedding
- `chronicler/embedding/extractors.py` — 9 entity text extractors
- `chronicler/embedding/pipeline.py` — Batch/live embed pipeline
- `chronicler/embedding/search.py` — Hybrid search

---

*Live Data → UI Gap Analysis v1.0*
*Chronicler / DwarfCron Project*
*2026-03-22, Session 46*
