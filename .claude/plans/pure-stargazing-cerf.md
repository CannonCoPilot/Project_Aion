# Stage 3.2: Worldgen Monitoring — Implementation Plan

## Context

Stage 3.2 builds worldgen monitoring for Chronicler. The user clarified two key design points:
1. **Post-gen retrospective explorer, not live dashboard** — capture as much data as practical during worldgen, but the UI is a rich storytelling explorer for replaying worldgen history, not a real-time progress watcher.
2. **New worlds, not Tar Thran** — worldgen creates entirely new worlds. Track A tools are developed/tested against Tar Thran but must be world-agnostic. Track B needs manual worldgen runs that produce new `world_id`s.

**Existing infrastructure is substantial** — the Lua bridge (256 lines), Python ingester (142 lines), worldgen.html template, `worldgen_snapshots` table, and `watch-worldgen` CLI all already exist. This plan extends rather than rebuilds.

---

## Track A: Temporal Backfill Tooling (Autonomous, No VM)

### A1: Post-parse step — Backfill `sites.founded_year`

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py`

Add `step_9b_backfill_site_temporal_data()` after step 9 (ownership history). Derives `founded_year` and `founder_entity_id` from `created site` events. Currently 0/2,154 sites have this populated.

```sql
UPDATE sites s SET founded_year = sub.year, founder_entity_id = sub.eid
FROM (
    SELECT site_id, MIN(year) as year,
           COALESCE(entity_id_1, (details->>'civ_id')::int) as eid
    FROM history_events
    WHERE world_id = $1 AND event_type = 'created site' AND site_id IS NOT NULL
    GROUP BY site_id, COALESCE(entity_id_1, (details->>'civ_id')::int)
) sub
WHERE s.id = sub.site_id AND s.world_id = $1 AND s.founded_year IS NULL
```

Also derive `destroyed_year` from `destroyed site` events (for sites not reclaimed — complements step 4's ruin status).

Update `run_all()` to call between step 9 and step 10.

**Done**: `SELECT COUNT(*) FROM sites WHERE world_id=1 AND founded_year IS NOT NULL` > 0. Spot-check: Y1 should show ~71 sites.

---

### A2: Post-parse step — Materialize world timeline

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py`

Add `step_12_materialize_world_timeline()` after step 11 (validation). Computes year-by-year aggregate statistics and stores in `worldgen_snapshots` with `phase = 'historical_backfill'`.

Uses a single efficient CTE approach:

```sql
WITH years AS (SELECT generate_series(1, (SELECT MAX(year) FROM history_events WHERE world_id=$1)) AS y),
hf_births AS (SELECT birth_year, COUNT(*) c FROM historical_figures WHERE world_id=$1 AND birth_year>0 GROUP BY birth_year),
hf_deaths AS (SELECT death_year, COUNT(*) c FROM historical_figures WHERE world_id=$1 AND death_year>0 GROUP BY death_year),
site_founds AS (SELECT founded_year, COUNT(*) c FROM sites WHERE world_id=$1 AND founded_year IS NOT NULL GROUP BY founded_year),
events_per_year AS (SELECT year, COUNT(*) c FROM history_events WHERE world_id=$1 GROUP BY year)
INSERT INTO worldgen_snapshots (world_id, phase, progress_pct, year, hf_count, site_count, event_count, data)
SELECT $1, 'historical_backfill', (y::float / max_y * 100),
       y, cumulative_hf, cumulative_sites, cumulative_events, '{}'::jsonb
FROM <computed cumulative sums>
```

Clear existing backfill rows first (`DELETE FROM worldgen_snapshots WHERE world_id=$1 AND phase='historical_backfill'`) for idempotency.

**Done**: `SELECT COUNT(*) FROM worldgen_snapshots WHERE world_id=1 AND phase='historical_backfill'` = number of years with events. Year 250 cumulative counts match CDM totals.

---

### A3: API endpoint — World timeline

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/world.py`

Add `GET /api/world/{world_id}/timeline`:
- Queries `worldgen_snapshots` for given world_id, ordered by year
- Returns both live-capture and historical_backfill rows (distinguished by `phase`)
- Response: `{"world_id": 1, "years": [{"year": 1, "hf_count": ..., "site_count": ..., ...}], "source": "historical_backfill"}`

**Done**: `curl localhost:8000/api/world/1/timeline` returns JSON array with 250 entries. < 200ms.

---

### A4: API endpoint — State at year Y

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/world.py`

Add `GET /api/world/{world_id}/state?year={Y}`:
- Computes on-the-fly: living HFs, active sites, active wars, events that year, top civilizations at that point
- All queries use year-range filters against existing indexed tables
- Response: `{"year": 100, "living_hfs": 5432, "active_sites": 1200, "events_this_year": 3400, "wars": [...], "top_civs": [...]}`

**Done**: Spot-check year=1 (many site foundings), year=125 (mid-history), year=250 (matches current totals).

---

### A5: World Timeline explorer page

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/worldgen.html`

Rework to dual-mode:
- **Primary**: Retrospective timeline viewer (shows when worldgen_snapshots exist for the world)
  - SVG growth curves (HF population, site count, events/year)
  - Year scrubber — click a year → fetch `/api/world/{wid}/state?year=Y` → show detail panel
  - War period bands overlaid on timeline
  - Summary cards (total HFs, peak pop year, most violent year, longest war)
- **Secondary**: Live WebSocket monitor (shown when worldgen is actively in progress — existing behavior)

**Pattern**: Follow existing template patterns — Tailwind CSS, inline SVG, no external JS libs. Use `fetch()` for API calls.

**Done**: Navigate to `/worldgen?world_id=1` → see timeline with growth curves for Tar Thran. Click year → see state detail.

---

### A6: CLI command — `chronicler worldgen backfill`

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py`

Refactor existing `watch-worldgen` into a `worldgen` group with subcommands:
- `chronicler worldgen watch` (existing watch-worldgen behavior)
- `chronicler worldgen backfill --world-id N` (runs A1 + A2 steps only)
- `chronicler worldgen history --world-id N` (prints timeline summary to console)

**Done**: `chronicler worldgen backfill --world-id 1` completes in < 30s, populates snapshots.

---

## Track B: Live Worldgen Capture Enhancement (Needs Manual VM Runs)

### B1: Adapt ingester for SSH transport

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/worldgen.py`

Current `_fetch_status()` calls `fetch_bridge_data()` (HTTP). During worldgen no fortress HTTP server runs. Add SSH fallback using `GameController._ssh()` pattern to read `worldgen-status.json` from VM.

**Done**: `WorldgenIngester` can poll via SSH when HTTP is unavailable.

### B2: Capture generation parameters

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/worldgen-bridge.lua`

Add parameter extraction: read `df.global.world.worldgen_parms` (if available in DF 53.x) for seeds, world size, history length, civ targets. Store in snapshot `data` JSONB.

**Done**: First snapshot's `data` field contains `gen_params` with seed/size/history values.

### B3: Post-worldgen data handoff

**Files**: `worldgen.py`, `cli.py`

Add `--auto-world` flag to `worldgen watch`: creates placeholder `worlds` row at worldgen start, stores snapshots against it. After user exports Legends and runs `ingest`, the placeholder is updated with the real world name. Track A steps auto-run during ingestion.

**Done**: Full cycle: watch-worldgen → export legends → ingest → timeline appears for new world.

### B4: Verify Lua bridge during actual worldgen

Manual verification: deploy bridge, start worldgen, check that `worldgen-status.json` updates correctly through all phases. Requires 1 manual worldgen run.

**Done**: All 10 phases captured, entity counts grow during RecountingLegends, clean stop at completion.

---

## Execution Order

```
A1 (founded_year backfill)         ← start here, quick win
A2 (timeline materialization)      ← depends on A1
A3 (timeline API)                  ← depends on A2
A4 (state-at-year API)             ← depends on A1, parallel with A3
A5 (timeline explorer page)        ← depends on A3 + A4
A6 (CLI refactor)                  ← depends on A1 + A2
B1 (SSH transport)                 ← independent, can parallel with A3/A4
B2 (gen params)                    ← independent Lua work
B3 (data handoff)                  ← depends on A1, A2, B1
B4 (manual verification)           ← needs VM, do with B2
```

Track A is fully autonomous (6 tasks, ~450 lines). Track B needs 1-2 manual worldgen runs (4 tasks, ~175 lines).

---

## Verification Plan

1. **After A1+A2**: `chronicler worldgen backfill --world-id 1` → check `sites.founded_year` populated and `worldgen_snapshots` has historical rows
2. **After A3+A4**: `curl` both endpoints, spot-check year 1 / 125 / 250
3. **After A5**: Browser to `/worldgen?world_id=1` → visual verification of charts and year drill-down
4. **After B1-B4**: Full worldgen cycle on VM → verify snapshots captured → ingest legends → verify timeline has both live + backfill data

## Key Files

| File | Tasks | Changes |
|------|-------|---------|
| `chronicler/ingest/post_parse.py` | A1, A2 | +2 steps (~110 lines) |
| `chronicler/api/routes/world.py` | A3, A4 | +2 endpoints (~100 lines) |
| `chronicler/api/templates/worldgen.html` | A5 | Rework to dual-mode (~200 lines) |
| `chronicler/cli.py` | A6 | Refactor watch-worldgen → worldgen group (~40 lines) |
| `chronicler/dfhack/worldgen.py` | B1, B3 | SSH fallback + auto-world (~80 lines) |
| `chronicler/dfhack/scripts/worldgen-bridge.lua` | B2 | Gen params extraction (~20 lines) |
