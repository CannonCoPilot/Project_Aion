# Revised Live ETL Architecture — Unified Pipeline Design

**Date**: 2026-03-22 (Session 46)
**Status**: DESIGN PLAN — pending implementation
**Supersedes**: `live-data-ui-gap-analysis.md` (initial diagnosis)

---

## Design Principles (from User Direction)

1. **ALL live data terminates in the core Legends Tables.** No separate "live tables." No dead ends.
2. **On-disk structured files** serve as the intermediate stage between bridge capture and DB ingestion.
3. **XML import is two-phase**: pre-embark (once, required) + post-embark diffs (optional, many times).
4. **No CDM expansion** beyond existing Legends Tables without explicit user permission. Flag anything that can't fit.
5. **The `units`, `unit_events`, `fortress_denizens`, `lua_probes`, `live_history`, `announcements`, `squads`, `fortress_state`** tables are transitional staging — their data MUST flow into the core CDM.

---

## Part 1: Revised Architecture Overview

### The Pipeline (3 stages)

```
STAGE 1: CAPTURE
  DF Game Memory → Bridge Lua (chronicler-bridge.lua)
  → SSH+SCP → On-Disk Structured Files (chronicler/data/live/)

STAGE 2: TRANSFORM
  On-Disk Files → live_etl.py (section-by-section transform)
  → Mapped to Legends Table columns

STAGE 3: LOAD
  Transformed data → UPSERT/INSERT into Legends Tables
  → UI queries reflect current game state
```

### On-Disk File Structure

```
chronicler/data/live/
├── world_info.json          # Current world metadata
├── fortress_units.json      # All active fortress units
├── dwarf_skills.json        # Per-unit skill arrays
├── dwarf_personality.json   # Per-unit personality traits
├── dwarf_emotions.json      # Per-unit emotional state
├── squads.json              # Military squad composition
├── noble_positions.json     # Fortress noble appointments
├── buildings.json           # Fortress buildings
├── artifacts.json           # Artifacts in game memory
├── announcements.json       # Recent game announcements
├── diplomacy.json           # Diplomatic relations
├── history.json             # Recent history events
├── entities.json            # Live entity data
├── zones.json               # Fortress zones
├── event_collections.json   # Recent event collections
├── mandates.json            # Active mandates
├── incidents.json           # Recent incidents
├── reactive_events.json     # Emotion-triggering events
├── skill_changes.json       # CDC: skill diffs
├── belief_systems.json      # Religious/value systems
├── cultural_identities.json # Cultural identity records
├── occupations.json         # Occupation records
├── interaction_instances.json
├── fortress_state.json      # Seasonal fortress snapshot
├── daily_events.json        # 30-day rolling event window
├── _meta.json               # Cycle metadata (tick, timestamp, world_id)
└── _prev/                   # Previous cycle (for CDC diffing)
    └── (same files)
```

---

## Part 2: Bridge Section → Legends Table Mapping

### Complete Mapping (26 sections → Legends Tables)

| # | Bridge Section | Target Legends Table(s) | Transform | Notes |
|---|---------------|------------------------|-----------|-------|
| 1 | `fortress_units` | `historical_figures` | UPDATE death_year, death_cause, unit_id, skills, whereabouts | Match via `hist_fig_id` → `historical_figures.id` |
| 2 | `fortress_units` | `hf_site_links` | UPSERT site residency | Link HF to fortress site |
| 3 | `fortress_units` | `hf_entity_links` | UPDATE link_type member↔former_member | On death/departure |
| 4 | `dwarf_skills` | `historical_figures.skills` | UPDATE JSONB | Merge live skill ratings into HF skills |
| 5 | `dwarf_personality` | `historical_figures.details` | UPDATE JSONB | Personality traits into HF details |
| 6 | `dwarf_emotions` | `history_events` | INSERT type='hf_emotion' | Significant emotions as events |
| 7 | `squads` | `hf_squad_links` | UPSERT squad membership | Map unit→HF, write squad links |
| 8 | `noble_positions` | `hf_position_links` | UPSERT position assignments | Map noble appointments to HF position links |
| 9 | `buildings` | `structures` | UPSERT fortress structures | Buildings map to site structures |
| 10 | `buildings` | `sites.details` | UPDATE JSONB | Aggregate building counts into site details |
| 11 | `artifacts` | `artifacts` | UPSERT holder/location changes | Update holder_hf_id, site_id |
| 12 | `announcements` | `history_events` | INSERT type='announcement' | Significant announcements as events with `source='live_announcement'` |
| 13 | `diplomacy` | `entity_entity_links` | UPSERT diplomatic state | War/peace/trade relations |
| 14 | `history` | `history_events` | INSERT with `source='live'` | New game events merged into main events table |
| 15 | `history` | `event_entity_xref` | INSERT cross-references | Maintain event→entity xref index |
| 16 | `entities` | `entities.details` | UPDATE JSONB | Live entity member counts, updates |
| 17 | `zones` | `sites.details` | UPDATE JSONB | Zone info merged into fortress site details |
| 18 | `event_collections` | `history_event_collections` | UPSERT | New wars, battles, etc. |
| 19 | `mandates` | `history_events` | INSERT type='mandate_issued' | Mandates as historical events |
| 20 | `incidents` | `history_events` | INSERT type='incident' | Incidents (crimes, tantrums) as events |
| 21 | `reactive_events` | `history_events` | INSERT type='reactive_event' | Emotion triggers as events |
| 22 | `skill_changes` | `historical_figures.skills` | UPDATE JSONB | Update HF skill ratings |
| 23 | `belief_systems` | `entities.details` | UPDATE JSONB | Belief data into entity details |
| 24 | `cultural_identities` | `entities.details` | UPDATE JSONB | Cultural identity into entity details |
| 25 | `occupations` | `hf_entity_links` | UPSERT with position_name | Occupations as HF-entity links |
| 26 | `interaction_instances` | `history_events` | INSERT type='interaction' | Interactions as events |
| 27 | `fortress_state` | `sites.details` | UPDATE JSONB | Wealth, population, food/drink into site details |
| 28 | `daily_events` | `history_events` | INSERT type='scheduled_event' | Scheduled nemesis events |
| — | CDC: death | `historical_figures` | UPDATE death_year, death_cause, alive=FALSE | From departed unit's death_cause |
| — | CDC: arrival | `hf_entity_links` | INSERT link_type='member' | New fortress member |
| — | CDC: departure | `hf_entity_links` | UPDATE link_type='former_member' | Left fortress |
| — | CDC: skill_up | `historical_figures.skills` | UPDATE JSONB | Skill improvement |
| — | CDC: profession | `historical_figures.details` | UPDATE JSONB | Profession change |

### Items Flagged for Co-Review

These live data structures have no natural home in the existing Legends Tables CDM:

| Data | Why It Doesn't Fit | Proposed Resolution |
|------|-------------------|-------------------|
| **Current stress level** | Legends HFs don't track stress — it's a fortress-mode-only metric | Store in `historical_figures.details` JSONB under key `"live_stress"` |
| **Current position (x,y,z)** | Legends HFs have `whereabouts` JSONB but not tile-level coords | Store in `historical_figures.whereabouts` JSONB (already exists) |
| **Current job** | Legends doesn't track moment-to-moment jobs | Store in `historical_figures.details` JSONB under key `"current_job"` |
| **Fortress wealth/food/drink** | No fortress economy table in legends | Store in `sites.details` JSONB under key `"fortress_state"` |
| **Game announcements (text)** | Legends has events, not raw announcement text | Convert significant announcements to `history_events` entries; discard routine ones |
| **Mandates** | No mandate concept in legends | Store as `history_events` with type='mandate_issued' |
| **Zones** | Fortress zones aren't in legends | Store in `sites.details` JSONB under key `"zones"` |

**Assessment**: All flagged items can fit into existing JSONB columns (`details`, `whereabouts`) without schema changes. No CDM expansion required. However, this means the UI won't display them unless the detail pages are enhanced to render these JSONB keys.

---

## Part 3: XML Import — Revised Two-Phase Design

### Phase 1: Pre-Embark Import (ONE TIME, REQUIRED)

```
┌─────────────────────────────────────────────────┐
│  DFHack Console (in Legends Mode)               │
│                                                  │
│  > open-legends                                  │
│  > exportlegends                                 │
│    → region1-legends.xml                         │
│    → region1-legends_plus.xml                    │
│                                                  │
│  ⚠️ WARNING: open-legends is ONE-WAY            │
│  Must be done BEFORE embarking                   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  chronicler ingest <legends.xml> <plus.xml>     │
│  (xml_parser.py → post_parse.py)                │
│                                                  │
│  Creates world record                            │
│  Populates ALL 25+ Legends Tables               │
│  Runs 10 post-parse enrichment steps            │
│  This is the baseline "world at embark"          │
└─────────────────────────────────────────────────┘
```

### Phase 2: Post-Embark Re-Import (OPTIONAL, MANY TIMES)

```
┌─────────────────────────────────────────────────┐
│  DFHack Console (save + re-enter legends)       │
│                                                  │
│  > exportlegends                                 │
│    → region1-legends.xml (updated)               │
│    → region1-legends_plus.xml (updated)          │
│                                                  │
│  Contains all pre-embark data PLUS:              │
│  - New HFs born since embark                     │
│  - Deaths that occurred                          │
│  - New events (battles, migrations, etc.)        │
│  - Entity membership changes                     │
│  - New artifacts created                         │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  chronicler ingest --update <legends> <plus>    │
│  (xml_parser.py with diff mode)                 │
│                                                  │
│  DIFF against existing DB:                       │
│  - New HFs (id not in DB) → INSERT              │
│  - Existing HFs with death_year → UPDATE        │
│  - New events (id not in DB) → INSERT           │
│  - Updated entity links → UPSERT                │
│  - New artifacts → INSERT                        │
│  - Existing artifacts with new holder → UPDATE   │
│                                                  │
│  Does NOT delete or overwrite existing data      │
│  Only appends/updates with new information       │
└─────────────────────────────────────────────────┘
```

---

## Part 4: Transitional Tables — Deprecation Plan

These tables currently exist but should be deprecated once live data flows into Legends Tables:

| Table | Current Purpose | Replacement | Action |
|-------|----------------|-------------|--------|
| `units` | Live fortress unit snapshots | `historical_figures` (via unit_id + details JSONB) | **KEEP as cache** — fast unit lookups, but not the source of truth for UI |
| `unit_events` | CDC events (arrival, departure, skill) | `history_events` with `source='live_cdc'` | **DEPRECATE** — events go to history_events |
| `fortress_denizens` | Who is/was in fortress | `hf_entity_links` + `hf_site_links` | **DEPRECATE** — membership tracked in standard link tables |
| `lua_probes` | Raw bridge JSONB dumps | On-disk structured files | **DEPRECATE** — raw data stored on disk, not in DB |
| `live_history` | Live game events (separate table) | `history_events` with `source='live'` | **DEPRECATE** — merge into main events table |
| `announcements` | Game announcement text | `history_events` with `source='live_announcement'` | **DEPRECATE** — significant announcements become events |
| `squads` | Military squad composition | `hf_squad_links` | **DEPRECATE** — squad membership tracked in HF link table |
| `fortress_state` | Seasonal fortress snapshots | `sites.details` JSONB | **DEPRECATE** — fortress metrics stored in site details |
| `belief_systems` | Religious/value systems | `entities.details` JSONB | **DEPRECATE** — belief data merged into entity details |
| `cultural_identities` | Cultural identity records | `entities.details` JSONB | **DEPRECATE** — same |
| `occupations` | Occupation records | `hf_entity_links` with position_name | **DEPRECATE** — occupations tracked as entity links |
| `interaction_instances` | Interaction records | `history_events` type='interaction' | **DEPRECATE** — interactions become events |
| `agreements` | Agreement records (empty) | Not needed currently | **DROP** |
| `daily_events` | 30-day rolling event window | `history_events` type='scheduled_event' | **DEPRECATE** |

**Implementation note**: Deprecation means "stop writing to these tables and stop querying them." The tables can remain in the schema during transition but should be marked as deprecated in comments. The `units` table is the exception — it serves as a fast cache for real-time unit lookups during bridge cycles, even though the source of truth for UI display is `historical_figures`.

---

## Part 5: Implementation Plan

### Milestone 1: On-Disk File Layer + Core Sync (Priority: CRITICAL)

**Goal**: Bridge data lands on disk as structured JSON files. Deaths and events flow into Legends Tables.

**Tasks**:

1. **Create on-disk file writer** (`chronicler/dfhack/file_writer.py`)
   - After `fetch_bridge_data()`, write each section to `chronicler/data/live/<section>.json`
   - Write `_meta.json` with cycle metadata (world_id, tick, timestamp, year, season)
   - Copy current files to `_prev/` before overwriting (for CDC diffing)

2. **Create live ETL engine** (`chronicler/dfhack/live_etl.py`)
   - Read from on-disk files (not directly from bridge dict)
   - Section-by-section transform functions
   - Each function maps one bridge section → one or more Legends Table UPSERTs

3. **Implement death sync** (highest priority single item)
   - When CDC detects DEPARTED + death_cause available:
     ```sql
     UPDATE historical_figures
     SET death_year = $year, death_cause = $cause, death_seconds = $tick
     WHERE world_id = $1 AND id = $hf_id AND death_year IS NULL
     ```
   - Update `hf_entity_links.link_type` → 'former_member'

4. **Implement event sync**
   - `history` bridge section → `history_events` with `source='live'`
   - Generate sequential IDs: `SELECT MAX(id) + 1 FROM history_events WHERE world_id = $1`
   - Populate `hf_id_1`, `site_id`, `entity_id_1` from event details
   - Update `event_entity_xref` for each new event

5. **Implement HF field sync**
   - `fortress_units` → `historical_figures.unit_id`, `.whereabouts`, `.details`
   - `dwarf_skills` → `historical_figures.skills` JSONB
   - `noble_positions` → `hf_position_links` UPSERT

6. **Bridge enhancement**: Capture `death_cause` enum from departing units

**Files created/modified**:
- NEW: `chronicler/dfhack/file_writer.py`
- NEW: `chronicler/dfhack/live_etl.py`
- MODIFIED: `chronicler/dfhack/watcher.py` (use file_writer + live_etl instead of direct DB writes)
- MODIFIED: `chronicler/dfhack/scripts/chronicler-bridge.lua` (add death_cause capture)
- NEW: `chronicler/data/live/` directory structure

### Milestone 2: Full Section Coverage (Priority: HIGH)

**Goal**: All 26 bridge sections fully transformed into Legends Tables.

**Tasks**:

7. Implement transforms for remaining sections:
   - `squads` → `hf_squad_links`
   - `buildings` → `structures` + `sites.details`
   - `artifacts` → `artifacts` (upsert holder/location)
   - `diplomacy` → `entity_entity_links`
   - `entities` → `entities.details`
   - `event_collections` → `history_event_collections`
   - `incidents` → `history_events`
   - `mandates` → `history_events`
   - `fortress_state` → `sites.details`

8. Implement CDC for:
   - Arrival classification (birth vs migration vs visitor)
   - Building changes (new/destroyed)
   - Relationship changes (via histfig_links diff)

**Files modified**:
- `chronicler/dfhack/live_etl.py` (additional transform functions)

### Milestone 3: XML Diff Import (Priority: MEDIUM)

**Goal**: Post-embark legends XML re-import with diff-based updates.

**Tasks**:

9. Add `--update` flag to `chronicler ingest` CLI command
10. Modify `xml_parser.py` to support diff mode:
    - Query existing IDs before insert
    - New records → INSERT
    - Existing records with new data (e.g., death_year) → UPDATE
    - Never DELETE existing records
11. Test with pre-embark vs post-embark XML pair

**Files modified**:
- `chronicler/cli.py` (add --update flag)
- `chronicler/ingest/xml_parser.py` (diff mode)

### Milestone 4: Transitional Table Deprecation (Priority: LOW)

**Goal**: Stop writing to transitional tables, update queries.

**Tasks**:

12. Remove direct writes to `unit_events`, `fortress_denizens`, `live_history`, `announcements`, `lua_probes`
13. Update any UI queries that reference these tables (currently none do — the UI only queries Legends Tables)
14. Mark tables as deprecated in schema.sql comments
15. Keep `units` table as cache (fast unit lookups during watcher cycles)

---

## Part 6: Self-Review Checklist

| Check | Status |
|-------|--------|
| Every bridge section has a Legends Table destination? | YES — all 26 mapped (see Part 2) |
| Any data left hanging without a CDM home? | NO — flagged items use existing JSONB columns |
| Death sync updates `historical_figures`? | YES — death_year, death_cause, death_seconds |
| Death sync updates `hf_entity_links`? | YES — member → former_member |
| Live events go into `history_events`? | YES — with `source='live'` |
| On-disk files as intermediate stage? | YES — `chronicler/data/live/` |
| XML import supports pre-embark + post-embark diff? | YES — Milestone 3 |
| No CDM expansion without permission? | YES — all fits in existing JSONB columns |
| Diagrams created? | YES — see companion diagram file |

---

*Revised Live ETL Architecture v1.0*
*Chronicler / DwarfCron Project*
*2026-03-22, Session 46*
