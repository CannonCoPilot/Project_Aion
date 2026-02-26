# Consolidation: Explorer UI Enhancement & Redesign

## Source Documents

- `rippling-honking-crescent.md`: A detailed 8-phase implementation plan for Explorer UI enhancements covering accent-insensitive search, age display, comprehensive unit data extraction from the DF bridge Lua script, unit/HF field mapping, position table improvements, sidebar sort/filter, member loading expansion, and a Knowledge Horizon filter stub — with Phases 1–7 marked COMPLETE.
- `shiny-churning-sprout.md`: The original Explorer redesign plan that conceived and specified the domain-specific 6-tab Explorer architecture (People, Civilizations, Geography, Events, Database, Graph) replacing the generic Schema/Data/Graph tabs, including all API routes, frontend detail cards, and cross-linking navigation.

---

## Features & Requirements

### Explorer Tab Architecture

- Replace generic Schema/Data/Graph tabs with domain-specific tabs.
- Final tab order: `People | Civilizations | Geography | Events | Database | Graph`
- **Database** tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries.
- **Graph** tab = existing vis.js ego-network graph visualization as a standalone tab, also launchable from detail views via "View graph" buttons.
- Update `_nav.html` to keep top-level pages (Chat / Explorer / Monitoring) and add sub-tabs within Explorer.
- Single-world simplification: hardcode `world_id=8` ("Thadar En" / "Namoram") in frontend API calls; keep `world_id` parameter in routes for schema correctness.

### People Tab

- Unified searchable interface merging historical figures (HFs) and in-game units.
- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter.
- **Right panel detail card**:
  - Both Dwarvish and English names prominently displayed.
  - Biographical info: race, caste, birth/death years, computed age.
  - Relationships list (spouse, parent, child, master, etc.) with clickable names.
  - Entity memberships with position titles.
  - Skills table (for units).
  - Key life events (collapsed by default).
  - Graph button: opens ego-network in Graph tab for this entity.
- Filter input for search results, stored in `peopleResults` array; `filterPeopleList(q)` re-renders matching items.
- Search supports both Dwarvish names and English translations.
- Accent-insensitive search: DF names use diacritics (ö, ü, ï, é) that break plain `ILIKE`; use `unaccent(name) ILIKE unaccent($1)` pattern.

#### Age Display

- Display-time computation, not stored.
- Living unit/HF with `birth_year` and `game_year` → `"127 (born year 23)"`.
- Living unit/HF with `birth_year` only → `"born year 23"`.
- Dead entity with both years → `"Year 150, age 127 (old age)"`.
- For units without birth_year (pre-expansion bridge): gracefully show "?".
- `current_game_year` fetched from `sync_snapshots` (most recent snapshot for world).

#### HF Detail View (`renderHfDetail()`)

- Already comprehensive from legends XML extraction; no structural changes needed.
- Shows: biography, relationships, entity memberships, positions held, site links, identities, events.
- Add: computed age display using `current_game_year`.
- Cross-navigation: when unit exists for this HF, show linked Unit card with nav-link.

#### Unit Detail View (`renderUnitDetail()`)

- Add biography card (expanded): birth_year, computed age, sex, death_cause.
- Relationships section: from `unit.details.relationships` — show Spouse, Mother, Father as nav-links (resolved histfig IDs to names via batch lookup).
- Personality section: traits as compact grid (50 facets with descriptive labels), values list, needs with satisfaction bars, dreams with accomplished flags.
- Attributes section: physical (6) + mental (12) attributes as bar charts.
- Linked HF card: when `hist_fig_id` exists and HF is found, show "This unit has a corresponding Historical Figure record." with nav-link. When HF not found: "Born after legends export."
- Skills table.
- Both Dwarvish and English names.

#### HF ↔ Unit Linkage Gap Handling

- Unit `hist_fig_id` values (36,469+) can exceed max HF id (35,333) from legends XML export.
- Gracefully display "No legends record — born after legends export" when HF not found.
- Cross-navigation: Unit detail links to HF record and vice versa when both exist.

### Civilizations Tab

- Browse entities: civilizations, religions, military orders.
- **Left panel**: Entity list grouped by type (Civilization, Religion, Military, Other), with race badges and member counts. Filter input (name/race substring) + sort dropdown (Name A-Z, Name Z-A, Most Members, Most Sites).
- **Right panel detail card**:
  - Entity name, type, race.
  - Positions table: Position | Title (gender-appropriate) | Category (color-coded badge) | Site | Current Holder.
    - Noble: king, queen, duke, baron, count, lord, monarch, emperor, consort — amber badge.
    - Military: general, captain, militia, commander, sheriff, champion, marshal — red badge.
    - Administrator: manager, bookkeeper, broker, expedition leader, mayor, chief medical — blue badge.
    - Other: fallback — stone badge.
  - Gender-appropriate title: `is_female = (holder_sex == 1 or holder_caste == "FEMALE")`, pick `name_female`/`name_male`/`name`.
  - Notable members (leaders, deities, vampires).
  - Controlled sites with links to Geography tab.
  - Related events (wars, conquests).

#### Members Loading

- Load up to 1,000 members (limit raised from prior lower value).
- Columns: Name, Race, Link Type, Position (from `position_name`), Status.
- Clickable column headers → toggle sort ascending/descending.
- Filter input → client-side substring on name/race/position.
- Data stored in `civMembersData`; client-side sort and filter without re-fetch.

### Geography Tab

- Browse sites, regions, and structures with connections to entities and HFs.
- **Left panel**: Sites grouped by type (town, fortress, cave, shrine, etc.). Filter input (name/owner substring) + sort dropdown (Name A-Z, Name Z-A, Most HFs, Most Structures).
- **Right panel detail card**: Site detail with structures, owner civ, notable inhabitants, historical events at this location.
- Regions list with type.
- Cross-linking: clicking a site from Civilizations tab navigates to Geography tab detail.

### Events & Timeline Tab

- Browse historical events chronologically with participant filtering.
- **Controls**: Year range slider, event type dropdown, participant search.
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable).
- **Collection view**: Expandable war/battle trees.
- Event collections: WAR, BATTLE, SIEGE, and others.
- Collection detail with sub-events.
- Filtered event list: by year range, event type, HF participant, site, with limit.

### Knowledge Horizon Filter (Stub — Phase 8, deferred as low priority)

- Concept: filter all Explorer views to show only entities/events within the fortress's "known world."
- UI: "Fortress Knowledge" toggle in tab bar, hidden until horizon data exists.
- `knowledge_horizon` table: `(world_id, entity_type, entity_id, visible BOOLEAN)`.
- Backend: horizon status endpoint + optional `?horizon=true` filter param on existing endpoints.
- Full computation deferred; stub in place for future activation.

### Cross-Linking Navigation

- Clicking a name in any tab navigates to the relevant tab's detail view.
- "View graph" buttons throughout domain views jump to Graph tab with entity pre-loaded.
- Civilizations → Geography (controlled sites).
- People → Civilizations (entity memberships).
- People → Geography (site links from HF data).
- Unit detail → HF detail (when linked) and vice versa.

### Sidebar Scroll Consistency

- Filter/sort controls in `flex-shrink-0` header; list containers have `overflow-y-auto`.

---

## Implementation Details

### Technology Stack

- FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs.
- Single `explorer.html` template (grew from ~600 lines JS).
- API routes structured in separate files per domain.
- PostgreSQL with `unaccent` extension for diacritic-tolerant search.

### API Routes

#### People (`chronicler/api/routes/people.py`)

- `GET /api/people/search?q=...&type=all|hf|unit` — Unified search across HFs + units by name (Dwarvish and English); returns type, race, alive/dead status.
- `GET /api/people/hf/{world_id}/{hf_id}` — HF detail: name, race, birth/death, relationships (from `hf_links`), entity memberships (from `hf_entity_links`), site links (from `hf_site_links`), position history (from `hf_position_links`), key events, identities, `current_game_year`.
- `GET /api/people/unit/{unit_id}` — Unit detail: both names, race, profession, skills, labors, position, linked HF (if linkable), civ membership, `current_game_year`, expanded fields from Phase 3.
- `GET /api/people/hf/{world_id}/{hf_id}/events?limit=50` — Events involving this HF.
- `GET /api/people/hf/{world_id}/{hf_id}/relationships` — Graph-ready relationship data.
- Relationship name resolution: when `details.relationships` exists, resolve histfig IDs to names via batch lookup:
  ```python
  rel_ids = [v for v in relationships.values() if v]
  hf_names = await conn.fetch(
      "SELECT id, name FROM historical_figures WHERE world_id = $1 AND id = ANY($2::int[])",
      world_id, rel_ids)
  name_map = {r["id"]: r["name"] for r in hf_names}
  ```
  Return `resolved_relationships`: `[{type: "Spouse", hf_id: 12345, name: "Urist McHammer"}]`.
- `current_game_year` fetch pattern:
  ```python
  current_year = await conn.fetchval(
      "SELECT game_year FROM sync_snapshots WHERE world_id = $1 "
      "ORDER BY synced_at DESC LIMIT 1", world_id)
  ```
- `unaccent` search pattern: `unaccent(name) ILIKE unaccent($1)` on `name` and `english_name` fields.

#### Civilizations (`chronicler/api/routes/civilizations.py`)

- `GET /api/civilizations?type=...` — List entities with type filter, member counts, site counts.
- `GET /api/civilizations/{world_id}/{entity_id}` — Entity detail.
- `GET /api/civilizations/{world_id}/{entity_id}/positions` — Position hierarchy with current/former holders.
- `GET /api/civilizations/{world_id}/{entity_id}/members?limit=1000` — Paginated member list from `hf_entity_links`.
- Position query joining `historical_figures` for `hf.sex`/`hf.caste` and `sites` for site association:
  ```sql
  SELECT ep.position_id, ep.name, ep.name_male, ep.name_female,
         hpl.hf_id AS holder_hf_id, hf.name AS holder_name,
         hf.sex AS holder_sex, hf.caste AS holder_caste,
         s.id AS site_id, s.name AS site_name
  FROM entity_positions ep
  LEFT JOIN hf_position_links hpl ON ...
  LEFT JOIN historical_figures hf ON ...
  LEFT JOIN sites s ON s.world_id = ep.world_id AND s.owner_entity_id = ep.entity_id
  WHERE ep.world_id = $1 AND ep.entity_id = $2
  ORDER BY ep.name
  ```
- `_categorize_position(name)` helper classifies positions into Noble / Military / Administrator / Other.

#### Geography (`chronicler/api/routes/geography.py`)

- `GET /api/geography/sites?type=...&owner=...` — Sites with owner entity, type filter.
- `GET /api/geography/sites/{world_id}/{site_id}` — Site detail.
- `GET /api/geography/regions` — Regions list with type.

#### Events (`chronicler/api/routes/events.py`)

- `GET /api/events?year_from=...&year_to=...&type=...&hf=...&site=...&limit=100` — Filtered event list.
- `GET /api/events/collections?type=WAR|BATTLE|...` — Event collections.
- `GET /api/events/collections/{world_id}/{id}` — Collection detail with sub-events.

#### Explorer (`chronicler/api/routes/explorer.py`)

- `graph_search()`: add `unaccent` wrapping on HF, entity, site, unit name searches.
- Add Knowledge Horizon endpoint (stub).
- Do not refactor existing `explorer.py` — add new route files alongside it.

### Database Schema (`chronicler/db/schema.sql`)

#### Extensions
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```
Also run manually against live `chronicler` database.

#### Units Table New Columns
```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex SMALLINT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```
- `english_name`: populated from existing `details->>'english_name'` JSONB; both `name` and `english_name` written on insert/update.
- `birth_year` and `sex` get columns (not JSONB) because they are used in queries.
- Rich data (personality, relationships, attributes) stays in `details` JSONB — too varied/nested for columns.

#### Knowledge Horizon Table (stub)
```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);
```

### Unit Data Extraction — Bridge Lua Script

**File**: `chronicler/dfhack/scripts/chronicler-bridge.lua`

#### Currently Captured (~15 fields out of 100+ available)

- Identity: id, name, english_name, first_name, race (via race_map), caste (in schema but NOT in bridge prior to expansion), profession.
- Position: pos_x/y/z.
- State: is_alive, flags1/2/3, mood, has_mood, had_mood.
- Social: civ_id, hist_fig_id, squad_id, squad_position.
- Emotional: stress, focus, longterm_stress, combat_hardened.
- Physical: pregnancy_timer, pregnancy_spouse, soldier_mood.
- Skills: full skill list (id, rating, experience) via `dwarf_skills` section.
- Emotions: recent emotions (type, thought, strength, severity, year) via `dwarf_emotions` section.

#### New Fields to Extract (High Value, Not Previously Captured)

| Field | Lua path | Narrative/Analytical Value |
|-------|----------|---------------------------|
| birth_year | `u.birth_year` | Age calculation, generational stories |
| birth_time | `u.birth_time` | Precise birth timing |
| old_year | `u.old_year` | Expected lifespan |
| sex | `u.sex` | Gender for title selection |
| caste (from bridge) | `u.caste` | Currently in schema but not bridge output |
| relationship_ids | `u.relationship_ids[type]` | Spouse, Mother, Father — 9 slots, histfig IDs |
| death_cause | `u.counters.death_cause` | Enriches death events beyond boolean |
| cultural_identity | `u.cultural_identity` | Cultural group beyond civ_id |
| personality traits | `u.status.current_soul.personality.traits[facet]` | 50 facets (Brave, Curious, etc.) |
| personality values | `u.status.current_soul.personality.values[i]` | Core values (Family, Tradition, Power...) |
| personality needs | `u.status.current_soul.personality.needs[i]` | 30 need types with focus_level |
| life goals/dreams | `u.status.current_soul.personality.dreams[i]` | Start family, master skill, etc. |
| physical attrs | `u.body.physical_attrs[type].value` | Strength, Agility, etc. (6 attrs) |
| mental attrs | `u.status.current_soul.mental_attrs[type].value` | Analytical, Focus, etc. (12 attrs) |
| preferences | `u.status.current_soul.preferences[i]` | Likes/dislikes for materials, creatures |
| need states | `u.counters2.hunger_timer` etc. | Hunger, thirst, sleep timers |

#### Expanded `unit_summary` Section Code

```lua
-- Biographical
entry.birth_year = u.birth_year
entry.birth_time = u.birth_time
entry.old_year = u.old_year
entry.sex = u.sex
entry.caste = u.caste

-- Relationships (9 slots, 0-indexed)
entry.relationships = {}
local rel_types = {'PetOwner','Spouse','Mother','Father','LastAttacker','GroupLeader','Draggee','Dragger','RiderMount'}
for i, rtype in ipairs(rel_types) do
    local hfid = u.relationship_ids[i-1]
    if hfid and hfid > -1 then
        entry.relationships[rtype] = hfid
    end
end

-- Death cause (for dead units still in list)
if dfhack.units.isDead(u) then
    entry.death_cause = u.counters.death_cause
end

-- Cultural identity
entry.cultural_identity = u.cultural_identity
```

#### New `dwarf_personality` Bridge Section

```lua
local soul = u.status.current_soul
if soul then
    local p = soul.personality
    -- Traits (50 facets, 0-100 scale stored as 0-10000 internally)
    entry.traits = {}
    for i = 0, 49 do
        entry.traits[df.personality_facet_type[i]] = p.traits[i]
    end
    -- Values
    entry.values = {}
    for _, v in ipairs(p.values) do
        table.insert(entry.values, {type=df.value_type[v.type], strength=v.strength})
    end
    -- Needs with focus level
    entry.needs = {}
    for _, n in ipairs(p.needs) do
        table.insert(entry.needs, {type=df.need_type[n.id], focus=n.focus_level, level=n.need_level})
    end
    -- Dreams/goals
    entry.dreams = {}
    for _, d in ipairs(p.dreams) do
        table.insert(entry.dreams, {type=df.goal_type[d.type], accomplished=d.flags.accomplished})
    end
    -- Physical attributes (6)
    entry.physical_attrs = {}
    for i = 0, 5 do
        local attr = u.body.physical_attrs[i]
        entry.physical_attrs[df.physical_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
    -- Mental attributes (12)
    entry.mental_attrs = {}
    for i = 0, 11 do
        local attr = soul.mental_attrs[i]
        entry.mental_attrs[df.mental_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
end
```

### Watcher/Sync Update

**File**: `chronicler/dfhack/watcher.py` and/or `chronicler/sync/sync.py`

- Update unit upsert to write `birth_year`, `sex`, `death_cause`, and `english_name` columns from bridge data.
- Merge expanded bridge fields into `details` JSONB:
  - `relationships` dict → `details.relationships`
  - `cultural_identity` → `details.cultural_identity`
  - Personality data from `dwarf_personality` section → `details.personality` (traits, values, needs, dreams)
  - Attributes → `details.physical_attrs`, `details.mental_attrs`

### Unit ↔ HF Field Mapping (Design Doc)

**File**: `projects/chronicler/designs/unit-hf-field-mapping.md` (new)

Content requirements:
- Fields that exist on BOTH units and HFs (with different column/key names).
- Fields that are Unit-only: skills, labors, personality, needs, position, mood.
- Fields that are HF-only: kill_count, event_count, written works, reputation, spheres.
- For overlapping entities (same person as both Unit and HF): which source is authoritative for each field.
- JSON schema for a "unified person" object the LLM storyteller will use.

### Data Scale Context

- 35K historical figures, 312K events, 208K relationship links, 70 live units (as of original design).
- 109K records in world "Namoram" (per MEMORY.md).
- Units table has ontological parity with HFs — both have relationships, memberships, positions, biographical data — but extraction was historically far less comprehensive for units.

### Critical Files

| File | Role |
|------|------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` | `unaccent` extension, unit columns, `knowledge_horizon` table |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/people.py` | `unaccent` search, `current_game_year`, relationship resolution, HF/unit detail endpoints |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/civilizations.py` | Position query + categorization, member limit, entity listing |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/geography.py` | Sites, regions endpoints (new file) |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/events.py` | Events, collections endpoints (new file) |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py` | `unaccent` in graph search, horizon endpoint; do NOT refactor, add alongside |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` | All tab UI, detail views, sidebar sort/filter, age display, unit detail expansion, positions, members, horizon toggle |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/partials/_nav.html` | Top-level nav (Chat / Explorer / Monitoring) |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/app.py` | App entry point, router registration |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` | Config |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | Expanded unit field extraction (deployed to HomeServer via HTTP) |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` | Handle new bridge fields |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/sync/sync.py` | Handle new bridge fields |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/projects/chronicler/designs/unit-hf-field-mapping.md` | New design doc for LLM integration mapping |

### Server Start Command

```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload
```

---

## Status & Completion

### Completed (Phases 1–7, Sessions 32–33)

- **Phase 1** (Accent-Insensitive Search): `unaccent` extension enabled; `unaccent(name) ILIKE unaccent($1)` in `search_people()` and `graph_search()`. COMPLETE.
- **Phase 2** (Age Calculation): `current_game_year` added to HF and Unit responses; frontend computes and displays age in `renderHfDetail()` and `renderUnitDetail()`. COMPLETE.
- **Phase 3** (Unit Data Extraction Expansion): Bridge Lua script expanded with biographical, relationship, personality, attribute fields; `dwarf_personality` section added; schema columns `birth_year`, `sex`, `death_cause` added; watcher/sync updated. COMPLETE.
- **Phase 4** (Unit/HF Field Mapping + Detail View Completeness): HF detail verified complete (no changes needed); unit detail view expanded with all new sections; relationship name resolution in `get_unit()`; field mapping design doc created. COMPLETE.
- **Phase 5** (Position Table Enhancement): Position table renamed to 5-column layout (Position | Title | Category | Site | Current Holder); gender-appropriate title logic; category badges; site nav-links. COMPLETE.
- **Phase 6** (Left Panel Sort/Filter): Filter inputs and sort dropdowns added to People, Civilizations, and Geography tab sidebars; scroll consistency enforced. COMPLETE.
- **Phase 7** (Load Members Enhancement): Member limit raised to 1,000; columns expanded; client-side sort and filter; Position column added. COMPLETE.
- **Explorer Redesign** (original `shiny-churning-sprout.md` plan): Domain-specific 6-tab Explorer built (People, Civilizations, Geography, Events, Database, Graph); all API route files created; cross-linking navigation implemented; HF↔Unit gap handled; SQL runner preserved. COMPLETE (preceded Phase 1–7 enhancements).

### Deferred

- **Phase 8** (Knowledge Horizon Filter): Stub SQL table and backend endpoint planned; UI toggle hidden until horizon data exists. Deferred as low priority. NOT STARTED.

### Planned / Not Yet Started

- Full Knowledge Horizon computation logic (populating `knowledge_horizon` table based on fortress knowledge).
- Preferences field extraction (`u.status.current_soul.preferences[i]`).
- Need state extraction (`u.counters2.hunger_timer` etc.).
- LLM storyteller integration using unified person JSON schema from the field mapping doc.

---

## Key Decisions & Design Choices

- **Units and HFs are ontologically the same type of being**: Both have relationships, memberships, positions, biographical data. The disparity was a data extraction gap, not a conceptual one. This insight drove Phase 3 and the field mapping work.
- **Rich personality/attribute data stays in `details` JSONB**: Too varied and nested for columns. Only query-critical fields (`birth_year`, `sex`, `english_name`) get dedicated columns.
- **Do not refactor `explorer.py`**: Add new domain route files alongside it to avoid breaking existing functionality.
- **Preserve SQL runner**: Keep raw Database tab (formerly Schema/Data) available for ad-hoc queries; do not remove power-user access.
- **Single-world simplification**: Hardcode `world_id` in frontend calls; keep it in route signatures for schema correctness.
- **Personality data in separate bridge section (`dwarf_personality`)**: Keeps `unit_summary` lean; personality data is large and not always needed.
- **`dwarf_personality` section is per-bridge-section, not per-unit field**: Separation allows selective sync of personality data without re-syncing all unit fields.
- **Reuse vis.js graph**: The existing ego-network graph is functional; add "View graph" buttons throughout domain views rather than rebuilding graph logic.
- **Age is computed at display time**: Not stored; avoids staleness and is trivial to compute from `birth_year` and `current_game_year`.
- **Member limit raised to 1,000 with client-side sort/filter**: Avoids repeated round-trips for sort/filter operations on a fixed dataset.
- **Gender-appropriate titles**: Use `name_female`/`name_male`/`name` from entity_positions data; derive gender from `sex == 1 OR caste == "FEMALE"`.
- **Knowledge Horizon as a stub**: The concept (showing only fortress-known entities) is architecturally important for an AI storyteller, but computation is non-trivial; stub the table and toggle now, fill later.
- **HF↔Unit gap is a known data limitation**: Units born after the legends XML export have `hist_fig_id` values that exceed the maximum HF id; display graceful fallback rather than an error.

---

## Metrics & Targets

- **Unit struct coverage**: Expanded from ~15 fields to cover all high-value fields out of 100+ available on the DF unit struct.
- **Relationship slots**: 9 relationship type slots extracted per unit (PetOwner, Spouse, Mother, Father, LastAttacker, GroupLeader, Draggee, Dragger, RiderMount).
- **Personality facets**: 50 traits extracted on 0-100 scale.
- **Personality values**: Variable count per dwarf.
- **Personality needs**: 30 need types with focus_level and need_level.
- **Physical attributes**: 6 attributes with value and max_value.
- **Mental attributes**: 12 attributes with value and max_value.
- **Member loading limit**: 1,000 (raised from prior lower limit).
- **Search scope**: Unified search across 35K+ HFs and all active units.
- **Data scale**: 35K HFs, 312K events, 208K relationship links, 70+ live units, 109K total DB records.

### Verification Checklist

1. Accent search: Search "Etur" → matches "Etür" in People + Graph tabs.
2. Age display: Living HF shows computed age; dead HF shows death year + age.
3. Unit extraction: After bridge update, `units` table has `birth_year`, `sex`; `details` JSONB has relationships, personality, attributes.
4. Unit detail: Click a fortress dwarf → see biography, relationships, personality traits, attributes, skills.
5. HF detail: Unchanged — still shows full legends data.
6. Cross-navigation: Unit detail links to HF record (and vice versa) when both exist.
7. Position table: Title (gender-correct), Category badge, Site link.
8. Sidebar sort/filter: Filter + sort on People, Civilizations, Geography tabs.
9. Members: Load up to 1,000 with sortable columns + filter + Position column.
10. Knowledge Horizon: Toggle appears when horizon data exists.
11. People tab: Search "Inod" → unit with Dwarvish "Inod Adakrul" and English "Suntin" found.
12. Civilizations tab: Browse entities, click one, see positions and members.
13. Geography tab: Browse sites by type, click one, see linked HFs.
14. Events tab: Filter by year range, see events with clickable participants.
15. Database tab: Existing Schema/Data functionality preserved, SQL runner intact.
16. Graph tab: Existing vis.js graph preserved, launchable from detail views.
17. Cross-linking: Clicking a name in Civilizations navigates to People tab detail.
