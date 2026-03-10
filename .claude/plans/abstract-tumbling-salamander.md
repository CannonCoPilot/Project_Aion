# Plan: Statistics Tab for Explorer

## Context

The user has been investigating population counting algorithms across entity membership (`hf_entity_links`) and site residency (`hf_site_links`). This research produced a detailed statistical report showing how these two orthogonal link tables work, their coverage gaps, and how the revised tabulation system handles each `link_type`.

The user wants to make this kind of analysis permanently available in the Chronicler Explorer as a new **Statistics** top-level tab, with sub-tabs for: (1) a reference report explaining the counting systems, and (2) interactive visualizations of the data.

## Architecture

### Approach: Inline in `explorer.html` + New API Route

Follow the exact pattern of the **Database** tab (which has Schema/Data sub-tabs):
- Add `stats` to `ALL_TABS` in explorer.html
- Add a `<button>` for the tab in the tab bar
- Add a `panel-stats` div with sub-tabs: **Report** and **Visualizations**
- Create a new `statistics.py` API route file to serve the data
- Use **Chart.js** from CDN for visualizations (lightweight, no build step, fits the CDN-based pattern)

### Files to Create/Modify

| File | Action |
|---|---|
| `chronicler/api/templates/explorer.html` | Add Stats tab button, panel HTML, sub-tab JS, Chart.js CDN |
| `chronicler/api/routes/statistics.py` | New: API endpoints for statistics data |
| `chronicler/api/app.py` | Register statistics router |

## Implementation Steps

### Step 1: Create `statistics.py` API Route

New file: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/statistics.py`

Endpoints:
- `GET /api/statistics/population-model?world_id=N` — Returns JSON with:
  - `hf_entity_links` link_type distribution (count, unique_hfs, unique_entities, alive/dead breakdown)
  - `hf_site_links` link_type distribution (count, unique_hfs, unique_sites, alive/dead breakdown)
  - Global totals (total HFs, alive HFs, total entity links, total site links)
  - Cross-reference stats (HFs with both, entity-only, site-only)
  - Site coverage by type (total sites, sites with links, alive residents per type)
  - Race breakdown of site residents (top races by link_type)
  - Special flags among site residents (vampire, werebeast, necromancer, deity counts)
  - `entity_populations` summary (DF-native population counts by civ)

### Step 2: Register Route in `app.py`

Add import + `app.include_router(statistics_router, prefix="/api")`.

### Step 3: Add Statistics Tab to `explorer.html`

**Tab bar** (after Graph button, line ~128):
```html
<button onclick="switchTab('stats')" id="tab-stats" class="px-4 py-2.5 text-sm tab-inactive transition-colors">Statistics</button>
```

**ALL_TABS** (line 467): Add `'stats'` to the array.

**Lazy-load hook** in `switchTab()`: Add `if (tab === 'stats' && !statsLoaded) loadStats();`

**Panel HTML** — `panel-stats` div with two sub-tabs:

#### Sub-tab 1: Report
Static explanatory content (HTML) covering:
- **Three tiers of population data** explanation (entity_populations, hf_entity_links, hf_site_links)
- **hf_entity_links link_type** reference table with definitions and tabulation handling
- **hf_site_links link_type** reference table with definitions and tabulation handling
- **Dynamic tables** populated from the API: actual counts for the loaded world

#### Sub-tab 2: Visualizations
Interactive charts (Chart.js):
1. **Entity Link Type Distribution** — Horizontal bar chart of link_type counts (member, former member, enemy, etc.)
2. **Site Coverage by Type** — Stacked bar: sites with links vs without, colored by site type
3. **Race × Link Type Heatmap** — Top 15 races vs 6 link types, cell intensity = count
4. **Population vs Residents Scatter** — For sites with both entity population and site residents, plot divergence
5. **Special Flags Donut** — Small donut chart of supernatural residents (vampire/werebeast/necromancer/deity)

### Step 4: Add Chart.js CDN

In the `<head>` of explorer.html:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
```
Only load it lazily when stats tab is first visited (or include in head — it's ~60KB gzipped, acceptable).

### Step 5: JavaScript

- `loadStats()` function: fetches `/api/statistics/population-model?world_id=1`, populates report tables and renders charts
- `switchStatsSub(sub)` function: toggles between Report and Visualizations sub-panels
- Chart rendering functions for each visualization

## Verification

1. Start Chronicler: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve`
2. Navigate to `http://localhost:8080/explorer?tab=stats`
3. Verify Report sub-tab shows static explanations + dynamic counts
4. Verify Visualizations sub-tab shows 5 interactive charts
5. Verify tab switching works correctly (no broken state)
6. Verify lazy-loading (stats data only fetched on first tab visit)
