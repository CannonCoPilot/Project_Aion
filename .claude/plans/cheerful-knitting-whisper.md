# Phase 3 Realignment: Chronicler as a Living Game Mirror

## Context

The Chronicler Explorer UI currently operates as a static legends viewer — it queries `historical_figures`, `history_events`, and `hf_links` but completely ignores the live data pipeline. Meanwhile, the watcher ETL already stores 18+ bridge sections into CDM tables every 30 seconds (units, skills, personality, emotions, squads, game reports, history events, etc.). **The gap is in the UI layer, not the pipeline.** The Explorer detail pages need to JOIN live data, the fortress dashboard needs a full denizen detail panel, and the entire system needs to behave as a living, dynamically self-updating view of real in-game state.

Additionally, KH is deferred. "Dwarf of the Day" is replaced by a selectable denizen dropdown with comprehensive character sheet data.

---

## Stage 0: Fix Data Quality Issues (prerequisite)

**Problem**: `units.details` JSONB column is double-encoded — stored as a JSON string (`"{"skills":...}"`) rather than a native JSONB object (`{"skills":...}`). This prevents `details->'skills'` queries from working. Must fix before UI can consume it.

**Files**:
- `chronicler/dfhack/ingest_live.py:158` — `transform_unit()` returns `details` as a dict (correct)
- `chronicler/dfhack/ingest_live.py:207` — `upsert_units()` passes dict to asyncpg (should be correct with codec)
- `chronicler/db/connection.py:30` — JSONB codec registered (correct)
- Suspect: some code path pre-encodes details before passing to upsert

**Fix**:
1. Trace the actual write path to find where double-encoding happens
2. Fix the encoding
3. Run a one-time `UPDATE units SET details = (details #>> '{}')::jsonb WHERE ...` to fix existing data
4. Add `CREATE INDEX idx_units_hist_fig ON units(world_id, hist_fig_id)` — needed for HF→Unit JOINs

**Verify**: `SELECT details->'skills' FROM units WHERE world_id=1 LIMIT 1` returns a JSON array, not null.

---

## Stage 1: Close ETL Gaps (backend)

Ensure every important bridge section flows to CDM tables (not just lua_probes).

### 1A. Promote reactive events to unit_events

Currently `jobs_completed` and `items_created` from `reactive_events` are WebSocket-only (never persisted). Store them:

**File**: `chronicler/dfhack/watcher.py` (after line ~434, inside the transaction block)

- Add `_insert_reactive_events(conn, bridge_data, world_id, game_year, game_tick)`
- `jobs_completed` → `unit_events(event_type='job_completed', new_value={job_type, pos, tick})`
- `items_created` → `unit_events(event_type='item_created', new_value={item_id, book_title?, tick})`
- `syndromes` → already handled? Verify. If not, add.

### 1B. Promote skill_changes to unit_events

**File**: `chronicler/dfhack/ingest_live.py` — `DeltaDetector.detect()` (line ~217)

- Add skill delta detection: compare `current.details.skills` vs `prev.details.skills`
- Only emit `event_type='skill_change'` when rating increases (not every XP tick)
- Include skill name, old_rating, new_rating in event data

### 1C. Promote remaining bridge sections (lower priority)

- `armies` → new `etl_armies_live()` in `etl_expanded.py` (upsert to existing `armies` table if it exists, or add table)
- `mandates` → stored as `fortress_state.details.mandates` JSONB field (no new table needed)

**Verify**: Run watcher 2-3 cycles, then `SELECT event_type, count(*) FROM unit_events GROUP BY event_type` shows `job_completed`, `item_created`, `skill_change`.

---

## Stage 2: Augment HF Detail Pages with Live Data

When viewing a living fortress HF, show their current game state.

### 2A. Backend: Add live queries to `hf_detail_page()`

**File**: `chronicler/api/routes/detail_pages.py` (line ~695)

After the existing HF query, add:
```python
# If HF is alive, check for a live unit in the fortress
live_unit = None
if hf.get('death_year') is None:
    live_unit = await conn.fetchrow(
        "SELECT * FROM units WHERE world_id=$1 AND hist_fig_id=$2 AND is_alive=true",
        world_id, hf_id)
```

If `live_unit` exists, also fetch:
- `unit_events` (last 20 events for this unit_id)
- `fortress_denizens` (status, embark, arrival, narrative_value)
- Squad info from `squads` table (check `details->'squad_id'` or `squads.members`)

Pass all as template context: `live_unit`, `live_events`, `live_denizen`.

### 2B. Template: Add "Live Status" panel to hf_detail.html

**File**: `chronicler/api/templates/hf_detail.html`

Add a new section-card (visible only when `live_unit` is set):
- **Header**: "Live Fortress Data" with last-synced timestamp
- **Stats row**: Current profession, location (pos_x/y/z), stress (color bar), mood, focus
- **Skills table**: From `live_unit.details.skills` — sortable, with rank names and XP
- **Personality**: Traits as labeled bars, values/beliefs, goals, needs
- **Emotions**: Current emotional state list
- **Relationships**: Family (from details.family) + social (from details.relationships)
- **Recent events**: Mini-timeline from `live_events`

When live_unit exists, **prefer live skills over legends skills** (live is current; legends is snapshot from last export).

### 2C. Template: Override legends skills section

In the existing Skills tab, when `live_unit.details.skills` is available, render those instead of `hf.skills`. Add a "(Live)" badge.

**Verify**: Navigate to `/explorer/hf/{id}` for a living fortress dwarf → "Live Fortress Data" panel appears with skills, stress, mood. Dead HFs show no live panel.

---

## Stage 3: Augment Site and Entity Detail Pages

### 3A. Site detail: Show fortress live population

**File**: `chronicler/api/routes/detail_pages.py` — `site_detail_page()` (line ~1639)

Check if this site is the active fortress (`fortress_state.site_id = this site_id`). If so:
- Query `units WHERE is_alive=true` for live population roster
- Query latest `fortress_state` for wealth, age, rank
- Pass as `fortress_snapshot`, `live_population` to template

**File**: `chronicler/api/templates/site_detail.html`

Add "Fortress Status" card:
- Population count, wealth, fortress age, rank
- Live citizens table: name (linked to HF page), profession, stress badge
- This supplements the existing legends-based Denizens tab

### 3B. Entity detail: Augment living members with live data

**File**: `chronicler/api/routes/detail_pages.py` — `entity_detail_page()` (line ~1252)

After building members list, cross-reference with `units`:
```python
live_rows = await conn.fetch(
    "SELECT hist_fig_id, profession, details FROM units "
    "WHERE world_id=$1 AND hist_fig_id = ANY($2) AND is_alive=true",
    world_id, member_hf_ids)
```

Augment each member dict with `live_profession`, `live_stress` from the unit's details JSONB.

**File**: `chronicler/api/templates/entity_detail.html`

In members table, show live profession and stress indicator when available.

**Verify**: Fortress site page shows "Fortress Status" card. Civ entity page shows live stress/profession for fortress citizens.

---

## Stage 4: Rebuild Fortress Dashboard

Replace "Dwarf of the Day" with a full denizen selector and comprehensive character sheet panel.

### 4A. New API: Denizen list + detail

**File**: `chronicler/api/routes/live.py`

```python
@router.get("/api/live/denizens")
# Returns all fortress_denizens JOINed with units
# Fields: unit_id, hf_id, name, race, status, profession, stress, embark, narrative_value

@router.get("/api/live/denizen/{unit_id}")
# Returns EVERYTHING for one denizen:
# - Unit record (name, profession, pos, is_alive)
# - Full details JSONB (skills, personality, emotions, relationships, family, stress, mood, etc.)
# - unit_events (last 50)
# - fortress_denizen metadata (status, embark, arrival, departure, narrative_value)
# - HF data if linked (birth_year, death info, kill_count)
# - Squad membership
# - Occupation
```

Remove or deprecate `/api/live/dwarf-of-the-day`.

### 4B. Rebuild fortress.html sidebar

**File**: `chronicler/api/templates/fortress.html`

Replace right sidebar (DotD + Army + Quick Stats) with:

**Denizen Selector** (top of sidebar):
- Searchable dropdown populated from `/api/live/denizens`
- Grouped: Residents / Deceased / Missing
- Shows: name, profession, stress indicator
- On select → fetch `/api/live/denizen/{unit_id}`

**Denizen Detail Panel** (fills sidebar below selector):
- **Header**: Name, profession, race, embark badge, HF link
- **Stats grid**: Stress (color bar), Mood, Focus, Combat Hardened
- **Skills table**: All skills with rank name + XP, sortable
- **Personality section**: 50 traits as +/- indicators, values/beliefs/goals/needs
- **Emotions**: Current emotional state with severity
- **Relationships**: Family tree, social relationships
- **Squad**: Current assignment + role
- **Recent Events**: Scrollable unit_events timeline

Keep the Army Watch card (below denizen panel or collapsed).

### 4C. Auto-refresh denizen data

JavaScript: poll `/api/live/denizen/{selectedId}` every 30s to match watcher cycle. Also refresh status bar via `/api/live/status`.

**Verify**: `/fortress` shows denizen dropdown, select a dwarf → full character sheet panel. Wait 30s → data refreshes. Stress/skills may change between polls.

---

## Stage 5: Auto-refresh Explorer Detail Pages

### 5A. Lightweight polling for live sections

**File**: `chronicler/api/templates/detail_base.html`

Add JavaScript that:
1. Checks `window._hasLiveData` flag (set by templates with live panels)
2. Every 30s, fetches `/api/live/status` to check if `game_tick` has advanced
3. If advanced, fetches a partial endpoint for just the live data panel HTML
4. Replaces the live panel DOM element without full page reload

### 5B. Partial render endpoints

**File**: `chronicler/api/routes/detail_pages.py`

Add `/api/hf/{hf_id}/live-panel?world_id=X` that returns just the "Live Fortress Data" HTML fragment. This enables AJAX refresh of the live section without reloading the full page (which includes heavy legends queries).

### 5C. Subtle update indicator

In `detail_base.html`, add a small "Data updated" toast that appears when new data arrives, with an auto-dismiss after 3 seconds.

**Verify**: Open a living HF page. Wait 30-60s. Live panel updates without full page reload. Dead HF pages have no polling overhead.

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `chronicler/db/connection.py` | Verify JSONB codec path |
| `chronicler/db/schema.sql` | Add `idx_units_hist_fig` index |
| `chronicler/dfhack/ingest_live.py` | Fix details double-encoding; add skill delta detection |
| `chronicler/dfhack/watcher.py` | Add reactive event persistence |
| `chronicler/dfhack/etl_expanded.py` | Add armies ETL (optional) |
| `chronicler/api/routes/detail_pages.py` | Add live data queries to HF/Site/Entity pages; add partial endpoints |
| `chronicler/api/routes/live.py` | Add denizen list/detail APIs; remove DotD |
| `chronicler/api/templates/fortress.html` | Full sidebar rebuild: denizen selector + detail panel |
| `chronicler/api/templates/hf_detail.html` | Add "Live Fortress Data" panel |
| `chronicler/api/templates/site_detail.html` | Add "Fortress Status" card |
| `chronicler/api/templates/entity_detail.html` | Augment members with live data |
| `chronicler/api/templates/detail_base.html` | Add auto-refresh polling + toast |

---

## Execution Order

```
Stage 0 (fix details encoding + add index) — prerequisite, ~30min
  ↓
Stage 1 (ETL gaps) — ~1hr
  ↓
Stage 2 (HF live panels) — ~2hr  ← most impactful
  ↓
Stage 3 (Site/Entity live) — ~1hr
  ↓
Stage 4 (Fortress dashboard rebuild) — ~2hr  ← most visible
  ↓
Stage 5 (Auto-refresh) — ~1hr polish
```

Total: ~7-8 hours of focused implementation across 6 stages.

---

## Verification Plan (end-to-end)

1. **Watcher running**: `chronicler watch` produces unit_events with `job_completed`, `skill_change` types
2. **HF page**: Navigate to a living fortress dwarf HF → see live skills, stress, mood, events
3. **Site page**: Navigate to fortress site → see "Fortress Status" with live population
4. **Entity page**: Navigate to player civ → see living members with live profession/stress
5. **Fortress dashboard**: Select denizen from dropdown → full character sheet panel populates
6. **Auto-refresh**: Open HF page, wait 30s → live panel updates without reload
7. **Dead HFs**: Navigate to dead HF → no live panel, no polling overhead
