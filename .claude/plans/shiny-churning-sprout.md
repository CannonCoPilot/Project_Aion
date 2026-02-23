# Chronicler Explorer Redesign — Domain-Specific Entity & Relationship Browser

## Context

The Chronicler web app at `localhost:8080` has a functional but generic Explorer with Schema/Data/Graph tabs that expose raw database tables. The user wants **domain-specific views** for exploring Dwarf Fortress entities and their relationships — purpose-built tabs that make the complex relational data (35K HFs, 312K events, 208K relationship links, 70 live units) navigable for fortress management.

**Specific problems to solve:**
1. **Can't find in-game dwarves** — units exist in `units` table but aren't surfaced prominently
2. **Name duality** — Units have Dwarvish names (`name`) + English translations (`details->>'english_name'`), but only one is shown
3. **Generic browsing** — Schema/Data tabs show raw tables; no domain-aware navigation between HFs, civilizations, sites, and events
4. **Broken HF↔Unit linkage** — Unit `hist_fig_id` values (36,469+) exceed max HF id (35,333) from legends XML export

**Current architecture:** FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs. Single `explorer.html` template (~600 lines JS). API routes in `explorer.py` (822 lines). Single world "Thadar En" (world_id=8).

---

## Phase 1: People Tab + Name Handling

**Goal:** A purpose-built People view that merges historical figures and in-game units into a single searchable interface, showing both Dwarvish and English names.

### 1a. Schema: Promote `english_name` on units

Add `english_name TEXT` column to `units` table. Populate from existing `details->>'english_name'` JSONB. Update the watcher/sync code to write both `name` and `english_name` on insert/update.

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` (add column)
**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/sync/watcher.py` or wherever unit upserts happen

### 1b. API: People endpoints

New routes in a `people.py` router:

- `GET /api/people/search?q=...&type=all|hf|unit` — Unified search across HFs + units by name (both Dwarvish and English), returns type, race, alive/dead status
- `GET /api/people/hf/{world_id}/{hf_id}` — HF detail: name, race, birth/death, relationships (from `hf_links`), entity memberships (from `hf_entity_links`), site links (from `hf_site_links`), position history (from `hf_position_links`), key events, identities
- `GET /api/people/unit/{unit_id}` — Unit detail: both names, race, profession, skills, labors, position, linked HF (if linkable), civ membership
- `GET /api/people/hf/{world_id}/{hf_id}/events?limit=50` — Events involving this HF
- `GET /api/people/hf/{world_id}/{hf_id}/relationships` — Graph-ready relationship data (reuse existing graph logic)

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/people.py` (new)

### 1c. Frontend: People tab

Replace or augment the Explorer's tab bar to include a **People** tab:

- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter
- **Right panel**: Detail card showing:
  - Both names (Dwarvish + English) prominently displayed
  - Biographical info (race, caste, birth/death years)
  - Relationships list (spouse, parent, child, master, etc.) with clickable names
  - Entity memberships with position titles
  - Skills table (for units)
  - Key life events (collapsed by default)
- **Graph button**: Click to open ego-network in the Graph tab for this entity

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` (modify)

---

## Phase 2: Civilizations Tab

**Goal:** Browse entities (civilizations, religions, military orders) with their positions, members, and controlled sites.

### 2a. API: Civilization endpoints

New routes in a `civilizations.py` router:

- `GET /api/civilizations?type=...` — List entities with type filter, member counts, site counts
- `GET /api/civilizations/{world_id}/{entity_id}` — Entity detail: name, type, race, positions, current holders, member HFs, controlled sites
- `GET /api/civilizations/{world_id}/{entity_id}/positions` — Position hierarchy with current/former holders
- `GET /api/civilizations/{world_id}/{entity_id}/members?limit=50` — Paginated member list from `hf_entity_links`

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/civilizations.py` (new)

### 2b. Frontend: Civilizations tab

- **Left panel**: Entity list grouped by type (Civilization, Religion, Military, Other), with race badges and member counts
- **Right panel**: Detail card showing:
  - Entity name, type, race
  - Positions table (name, gendered variants, current holder with name link)
  - Notable members (leaders, deities, vampires)
  - Controlled sites with links to Geography tab
  - Related events (wars, conquests)

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` (modify)

---

## Phase 3: Geography Tab

**Goal:** Browse sites, regions, and structures with their connections to entities and HFs.

### 3a. API: Geography endpoints

- `GET /api/geography/sites?type=...&owner=...` — Sites with owner entity, type filter
- `GET /api/geography/sites/{world_id}/{site_id}` — Site detail: structures, owner, linked HFs, events that happened here
- `GET /api/geography/regions` — Regions list with type

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/geography.py` (new)

### 3b. Frontend: Geography tab

- **Left panel**: Sites grouped by type (town, fortress, cave, shrine, etc.)
- **Right panel**: Site detail with structures, owner civ, notable inhabitants, historical events at this location

---

## Phase 4: Events & Timeline Tab

**Goal:** Browse historical events chronologically with participant filtering.

### 4a. API: Events endpoints

- `GET /api/events?year_from=...&year_to=...&type=...&hf=...&site=...&limit=100` — Filtered event list
- `GET /api/events/collections?type=WAR|BATTLE|...` — Event collections (wars, battles, sieges)
- `GET /api/events/collections/{world_id}/{id}` — Collection detail with sub-events

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/events.py` (new)

### 4b. Frontend: Events tab

- **Controls**: Year range slider, event type dropdown, participant search
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable)
- **Collection view**: Expandable war/battle trees

---

## Phase 5: Tab Restructure & Raw DB

**Goal:** Reorganize tabs and preserve the existing raw DB explorer as an advanced tool.

### 5a. New tab order

`People | Civilizations | Geography | Events | Database | Graph`

- **Database** = existing Schema + Data tabs (renamed from "Explorer")
- **Graph** = existing vis.js graph visualization (standalone tab, also launchable from detail views)

### 5b. Navigation enhancement

Update `_nav.html` to keep the top-level pages (Chat / Explorer / Monitoring) and add sub-tabs within Explorer for the domain views.

---

## Critical Files

| Component | Path |
|-----------|------|
| Explorer template | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` |
| Explorer routes | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py` |
| Nav partial | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/partials/_nav.html` |
| App entry | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/app.py` |
| DB schema | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| World routes | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/world.py` |

## Implementation Notes

- **Single-world simplification**: Since only "Thadar En" (world_id=8) exists, hardcode the world_id in API calls from the frontend. Keep the `world_id` parameter in routes for schema correctness but default it.
- **HF↔Unit gap**: When displaying a unit's linked HF, handle the case where `hist_fig_id` doesn't exist in `historical_figures` gracefully (show "No legends record — born after legends export").
- **Reuse existing graph**: The vis.js ego-network graph already works well. Add "View graph" buttons throughout the domain views that jump to the Graph tab with the entity pre-loaded.
- **Preserve SQL Runner**: Keep the SQL runner available in the Database tab for ad-hoc queries.
- **Keep explorer.py**: Don't refactor existing explorer.py — add new route files alongside it.

## Verification

1. Start server: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`
2. Navigate to `http://localhost:8080/explorer`
3. Verify each tab loads:
   - **People**: Search for "Inod" → should show unit with Dwarvish name "Inod Adakrul" and English "Suntin"
   - **Civilizations**: Browse entities, click one, see positions and members
   - **Geography**: Browse sites by type, click one, see linked HFs
   - **Events**: Filter by year range, see events with clickable participants
   - **Database**: Existing Schema/Data functionality preserved
   - **Graph**: Existing vis.js graph preserved, launchable from detail views
4. Verify cross-linking: clicking a name in Civilizations tab navigates to People tab detail
