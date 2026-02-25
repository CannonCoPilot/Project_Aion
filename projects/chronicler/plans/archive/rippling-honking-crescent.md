# Chronicler Explorer UI Enhancements — Implementation Plan [PHASES 1-7 COMPLETE]

## Context

After building the 6-tab Explorer, user testing revealed priority issues. The core realization: **Units and HFs are ontologically the same type of being** — both have relationships, memberships, positions, biographical data — but the Chronicler currently extracts far less data for units than for HFs. The bridge Lua script captures ~15 fields out of 100+ available on the DF unit struct. Before we can build a unified view or LLM integration, we need **comprehensive data extraction for both types**, then a mapping between the two data structures.

The plan also addresses 6 UI/UX issues: accent search, age display, position table columns, sidebar sort/filter, member loading, and Knowledge Horizon.

**Status**: Phases 1-7 COMPLETE (Session 32-33). Phase 8 (Knowledge Horizon stub) deferred as low priority.

**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Phase 1: Accent-Insensitive Search

Quick, zero-dependency win. DF names use diacritics (ö, ü, ï, é) that break plain `ILIKE`.

### 1.1 SQL: Enable `unaccent` extension

**File**: `chronicler/db/schema.sql`
Add alongside existing extensions: `CREATE EXTENSION IF NOT EXISTS unaccent;`
Also run manually against the live `chronicler` database.

### 1.2 Backend: Wrap search queries

**File**: `chronicler/api/routes/people.py`
- `search_people()` (lines 41-48, 62-71): `unaccent(name) ILIKE unaccent($1)` (and `english_name`)

**File**: `chronicler/api/routes/explorer.py`
- `graph_search()` (lines 772-829): Same wrapping on HF, entity, site, unit name searches

---

## Phase 2: Age Calculation

Display-time computation, not stored.

### 2.1 Backend: Add `current_game_year` to HF + Unit responses

**File**: `chronicler/api/routes/people.py`

In `get_historical_figure()` and `get_unit()`, fetch:
```python
current_year = await conn.fetchval(
    "SELECT game_year FROM sync_snapshots WHERE world_id = $1 "
    "ORDER BY synced_at DESC LIMIT 1", world_id)
```
Add `"current_game_year": current_year` to both response dicts.

### 2.2 Frontend: Compute and display age

**File**: `chronicler/api/templates/explorer.html`

In `renderHfDetail()` line 504 and `renderUnitDetail()`:
- Living + birth_year + game_year → `"127 (born year 23)"`
- Living + birth_year only → `"born year 23"`
- Dead + both years → `"Year 150, age 127 (old age)"`

For units: birth_year will come from expanded extraction (Phase 3). Until then, gracefully show "?" for units without birth_year.

---

## Phase 3: Unit Data Extraction Expansion

**Highest priority.** The bridge Lua script currently captures ~15 fields. DF units have 100+ accessible fields. This phase expands extraction to capture the most narratively and analytically valuable data.

### 3.1 Data audit summary (from investigation)

**Currently captured for units:**
- Identity: id, name, english_name, first_name, race (via race_map), caste (in schema but NOT in bridge), profession
- Position: pos_x/y/z
- State: is_alive, flags1/2/3, mood, has_mood, had_mood
- Social: civ_id, hist_fig_id, squad_id, squad_position
- Emotional: stress, focus, longterm_stress, combat_hardened
- Physical: pregnancy_timer, pregnancy_spouse, soldier_mood
- Skills: full skill list (id, rating, experience) — via dwarf_skills bridge section
- Emotions: recent emotions (type, thought, strength, severity, year) — via dwarf_emotions bridge section

**NOT captured but available (high value):**

| Field | Lua path | Value |
|-------|----------|-------|
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

### 3.2 Bridge Lua expansion: `chronicler-bridge.lua`

**File**: `chronicler/dfhack/scripts/chronicler-bridge.lua` (on HomeServer, deployed via HTTP)

Expand the `unit_summary` section builder. For each fortress dwarf, add:

```lua
-- Biographical
entry.birth_year = u.birth_year
entry.birth_time = u.birth_time
entry.old_year = u.old_year
entry.sex = u.sex
entry.caste = u.caste

-- Relationships (9 slots)
entry.relationships = {}
local rel_types = {'PetOwner','Spouse','Mother','Father','LastAttacker','GroupLeader','Draggee','Dragger','RiderMount'}
for i, rtype in ipairs(rel_types) do
    local hfid = u.relationship_ids[i-1]  -- 0-indexed
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

Add a new bridge section `dwarf_personality` for rich personality data (separated to keep unit_summary lean):

```lua
-- Per-dwarf personality extraction
local soul = u.status.current_soul
if soul then
    local p = soul.personality
    -- Traits (50 facets, 0-100 scale stored as 0-10000 internally)
    entry.traits = {}
    for i = 0, 49 do  -- personality_facet_type count
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

### 3.3 Schema expansion: New columns on `units`

**File**: `chronicler/db/schema.sql`

Add columns to `units` table:
```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex SMALLINT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```

The remaining rich data (personality, relationships, attributes) stays in `details` JSONB — it's too varied/nested for columns. The `birth_year` and `sex` get columns because they're used in queries (age calculation, gender-appropriate titles).

### 3.4 Watcher sync update

**File**: `chronicler/dfhack/watcher.py` and/or `chronicler/sync/sync.py`

Update the unit upsert to write `birth_year`, `sex`, and `death_cause` columns from the bridge data. Merge expanded bridge fields into `details` JSONB:
- `relationships` dict → `details.relationships`
- `cultural_identity` → `details.cultural_identity`
- Personality data from `dwarf_personality` section → `details.personality` (traits, values, needs, dreams)
- Attributes → `details.physical_attrs`, `details.mental_attrs`

### 3.5 Verification

1. Deploy updated bridge to HomeServer
2. Run `chronicler watch` — verify new fields appear in `lua_probes`
3. Check `units` table: `birth_year` and `sex` columns populated
4. Check `details` JSONB: personality, relationships, attributes present
5. Verify no regressions on existing unit sync

---

## Phase 4: Unit/HF Field Mapping + Detail View Completeness

With expanded unit data, both detail views should show ALL available data independently. Then create a mapping document for LLM integration.

### 4.1 HF detail view: Verify completeness

**File**: `chronicler/api/templates/explorer.html` — `renderHfDetail()` (line 481)

Current HF detail already shows: biography, relationships, entity memberships, positions held, site links, identities, events. **No changes needed** — HF extraction from legends XML is already comprehensive.

### 4.2 Unit detail view: Show expanded data

**File**: `chronicler/api/templates/explorer.html` — `renderUnitDetail()` (line 653)

Add sections for newly extracted data:

1. **Biography card** (expanded): Add birth_year, age (computed), sex, death_cause
2. **Relationships section**: From `unit.details.relationships` — show Spouse, Mother, Father as nav-links (resolve histfig IDs to names via a lightweight batch lookup)
3. **Personality section**: Traits as a compact grid (50 facets with descriptive labels), values list, needs with satisfaction bars, dreams with accomplished flags
4. **Attributes section**: Physical (6) + Mental (12) attributes as bar charts
5. **Linked HF card**: When `hist_fig_id` exists and HF is found, show a link card: "This unit has a corresponding Historical Figure record." with nav-link. When HF not found: "Born after legends export."

### 4.3 Backend: Add relationship name resolution to unit endpoint

**File**: `chronicler/api/routes/people.py` — `get_unit()`

When `details.relationships` exists (e.g., `{"Spouse": 12345, "Mother": 12346}`), resolve the histfig IDs to names:
```python
rel_ids = [v for v in relationships.values() if v]
if rel_ids:
    hf_names = await conn.fetch(
        "SELECT id, name FROM historical_figures WHERE world_id = $1 AND id = ANY($2::int[])",
        world_id, rel_ids)
    name_map = {r["id"]: r["name"] for r in hf_names}
```
Return `resolved_relationships`: `[{type: "Spouse", hf_id: 12345, name: "Urist McHammer"}]`

### 4.4 Field mapping document for LLM integration

**File**: `projects/chronicler/designs/unit-hf-field-mapping.md` (new design doc)

Create a mapping table showing:
- Which fields exist on BOTH Units and HFs (with different column/key names)
- Which fields are Unit-only (skills, labors, personality, needs, position, mood)
- Which fields are HF-only (kill_count, event_count, written works, reputation, spheres)
- For overlapping entities (same person as both Unit and HF): which source is authoritative for each field
- JSON schema for a "unified person" object the LLM storyteller will use

### 4.5 Verification

1. Click a unit → see full biography with birth year, age, relationships, personality
2. Click an HF → see full legends data (unchanged, already comprehensive)
3. For a unit that IS also an HF, verify both views show their respective data independently
4. Verify the linked HF/Unit card provides easy cross-navigation

---

## Phase 5: Position Table Enhancement

Rename "Variants" to "Title" with gender-appropriate display. Add Category and Site columns.

### 5.1 Backend: Add holder gender + site to positions query

**File**: `chronicler/api/routes/civilizations.py` — `get_civilization()` (lines 66-78)

Join `historical_figures` for `hf.sex`/`hf.caste`, and `sites` for site association:
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

### 5.2 Backend: Position categorization + gender-appropriate title

**File**: `chronicler/api/routes/civilizations.py`

Add `_categorize_position(name)` helper:
- **Noble**: king, queen, duke, baron, count, lord, monarch, emperor, consort
- **Military**: general, captain, militia, commander, sheriff, champion, marshal
- **Administrator**: manager, bookkeeper, broker, expedition leader, mayor, chief medical
- **Other**: fallback

Gender-appropriate title: `is_female = (holder_sex == 1 or holder_caste == "FEMALE")`, then pick `name_female`/`name_male`/`name`.

### 5.3 Frontend: 5-column position table

**File**: `chronicler/api/templates/explorer.html` (lines 808-829)

**Position | Title | Category | Site | Current Holder**
- Category: color-coded badge (Noble=amber, Military=red, Administrator=blue, Other=stone)
- Site: clickable nav-link to Geography tab
- Title: gender-appropriate variant

---

## Phase 6: Left Panel Sort/Filter

Pure frontend. Consistent filter input + sort dropdown on each tab's sidebar.

### 6.1 People tab: Add filter for search results

Store results in `peopleResults` array. Filter input → `filterPeopleList(q)` re-renders matching items.

### 6.2 Civilizations tab: Filter + sort

Filter input (name/race substring) + sort dropdown (Name A-Z, Name Z-A, Most Members, Most Sites).

### 6.3 Geography tab: Filter + sort

Filter input (name/owner substring) + sort dropdown (Name A-Z, Name Z-A, Most HFs, Most Structures).

### 6.4 Scroll consistency

Ensure filter/sort controls are in `flex-shrink-0` header; list containers have `overflow-y-auto`.

---

## Phase 7: Load Members Enhancement

### 7.1 Backend: Increase limit to 1000

**File**: `chronicler/api/routes/civilizations.py` — `list_members()` (line 114): `le=1000`

### 7.2 Frontend: Sort + filter + position column

Rewrite `loadCivMembers()` (lines 879-910):
- Fetch `limit=1000`, store in `civMembersData`
- **Columns**: Name, Race, Link Type, Position (from `position_name`), Status
- Click column header → toggle sort asc/desc
- Filter input → client-side substring on name/race/position

---

## Phase 8: Knowledge Horizon Filter Stub

**Lowest priority.** Creates UI toggle and minimal backend; defers full computation.

### 8.1 SQL: `knowledge_horizon` table

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);
```

### 8.2 Backend: Horizon status endpoint + optional filter param

### 8.3 Frontend: "Fortress Knowledge" toggle in tab bar (hidden until data exists)

---

## Critical Files Summary

| File | Phases | Changes |
|------|--------|---------|
| `chronicler/db/schema.sql` | 1, 3, 8 | `unaccent` extension, unit columns, `knowledge_horizon` |
| `chronicler/api/routes/people.py` | 1, 2, 4 | `unaccent` search, `current_game_year`, relationship resolution |
| `chronicler/api/routes/civilizations.py` | 5, 7 | Position query + categorization, member limit |
| `chronicler/api/routes/explorer.py` | 1, 8 | `unaccent` in graph search, horizon endpoint |
| `chronicler/api/templates/explorer.html` | 2, 4, 5, 6, 7, 8 | Age, unit detail expansion, positions, sidebar, members, horizon |
| `chronicler/dfhack/scripts/chronicler-bridge.lua` | 3 | Expanded unit field extraction |
| `chronicler/dfhack/watcher.py` / `sync.py` | 3 | Handle new bridge fields |
| `projects/chronicler/designs/unit-hf-field-mapping.md` | 4 | New design doc |

## Verification

1. **Accent search**: Search "Etur" → matches "Etür" in People + Graph tabs
2. **Age display**: Living HF shows computed age; dead HF shows death year + age
3. **Unit extraction**: After bridge update, `units` table has birth_year, sex; `details` JSONB has relationships, personality, attributes
4. **Unit detail**: Click a fortress dwarf → see biography, relationships, personality traits, attributes, skills
5. **HF detail**: Unchanged — still shows full legends data
6. **Cross-navigation**: Unit detail links to HF record (and vice versa) when both exist
7. **Position table**: Title (gender-correct), Category badge, Site link
8. **Sidebar sort/filter**: Filter + sort on People, Civilizations, Geography tabs
9. **Members**: Load up to 1000 with sortable columns + filter + Position column
10. **Knowledge Horizon**: Toggle appears when horizon data exists

Start server: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`

---

*Plan created 2026-02-22, revised 2026-02-23 (Session 32)*
