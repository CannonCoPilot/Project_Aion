# Plan: Dynamic Race Filter + Biological Variants Dashboard

## Context

The People tab's type-flag checkboxes (Deity/Vampire/Necro/Were/Ghost) can't scale — they're hardcoded categories that filter a fixed dataset. The User wants two changes:

1. **Replace checkboxes with a dynamic race selector** — pill/tag toggles populated from data, not hardcoded. When a mod adds "Wood Elf," it appears automatically.
2. **Add a biological variants bar chart tile** — dashboard-style tile showing vampire/necromancer/werebeast/ghost/animated-dead counts. Updates when a race is selected.

This requires creating the `creature_dictionary` table (Stage 1.5 prerequisite) to provide dynamic race categorization via creature_raw flags.

---

## Implementation Steps

### Step 1: Create `creature_dictionary` table

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`
- Add table definition after the existing tables:
```sql
CREATE TABLE IF NOT EXISTS creature_dictionary (
    world_id       INT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    creature_id    TEXT NOT NULL,       -- matches historical_figures.race
    name_singular  TEXT,                -- "dwarf", "forgotten beast", "midnight freak"
    name_plural    TEXT,                -- "dwarves", "forgotten beasts"
    flags          JSONB DEFAULT '{}',  -- all boolean tags from creature_raw
    PRIMARY KEY (world_id, creature_id)
);
```

**File**: New migration `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/migrate_creature_dictionary.sql`
- CREATE TABLE + index on `(world_id)` for efficient lookups
- Apply to DB immediately

### Step 2: Parse `<creature_raw>` in XML parser

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
- Add a new parsing section in `_parse_legends_plus()` for `<creature_raw>` → `<creature>` elements
- Extract: `creature_id`, `name_singular`, `name_plural`, all self-closing boolean tags → JSONB flags
- Batch insert into `creature_dictionary` table
- Wire into `import_legends()` pipeline

### Step 3: Populate creature_dictionary for Tar Thran

- Re-run ingest (or a targeted CLI command) to populate the 1,879 creature entries
- Verify all 1,087 distinct HF race values resolve in creature_dictionary

### Step 4: Add race-summary API endpoint

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/people.py`

New endpoint: `GET /api/people/race-summary?world_id=N`

Returns:
```json
{
  "races": [
    {"key": "DWARF", "label": "Dwarf", "count": 10226},
    {"key": "HUMAN", "label": "Human", "count": 16280},
    {"key": "_forgotten_beast", "label": "Forgotten Beast", "count": 867},
    {"key": "_animal_people", "label": "Animal People", "count": 744},
    {"key": "_demigod", "label": "Demigod", "count": 1203},
    {"key": "_gods", "label": "Gods", "count": 68},
    ...
  ],
  "total": 48273
}
```

**Race categorization logic** (Python function `_categorize_race()`):
1. `is_deity=TRUE AND death_year IS NULL` → key `_demigod`, label "Demigod"
2. `is_deity=TRUE AND death_year IS NOT NULL` → key `_gods`, label "Gods"
3. creature_dictionary `has_any_feature_beast` flag → key `_forgotten_beast`
4. creature_dictionary `has_any_titan` flag → key `_titan`
5. creature_dictionary `has_any_night_creature` flag → key `_night_creature`
6. creature_dictionary `has_any_unique_demon` flag → key `_demon`
7. race starts with `HFEXP` → key `_animated_dead`
8. creature_dictionary `occurs_as_entity_race` flag → key = raw race token, label = name_singular.title()
9. Creature is an animal-person (name_singular ends with " man" and NOT an entity race) → key `_animal_people`
10. Fallback → key = raw race token, label = name_singular.title() from creature_dictionary

Sorted by count DESC. Collapsed categories use underscore-prefixed keys.

### Step 5: Add race_category filter to browse endpoint

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/people.py`

Modify `browse_people()`:
- Add `race_category: str = Query(None)` parameter
- When set to a raw race token (e.g. `DWARF`): `AND race = $N`
- When set to a collapsed key (e.g. `_forgotten_beast`): expand via creature_dictionary flags into `AND race IN (SELECT creature_id FROM creature_dictionary WHERE ...)`
- When set to `_demigod`/`_gods`: `AND is_deity = TRUE AND death_year IS NULL/IS NOT NULL`
- When set to `_animated_dead`: `AND race LIKE 'HFEXP%'`
- When set to `_animal_people`: use creature_dictionary to find matching creature_ids

### Step 6: Add variants-summary API endpoint

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/people.py`

New endpoint: `GET /api/people/variants-summary?world_id=N&race_category=X`

Returns:
```json
{
  "variants": [
    {"key": "necromancer", "label": "Necromancer", "count": 289, "color": "#a855f7"},
    {"key": "animated_dead", "label": "Animated Dead", "count": 294, "color": "#6b7280"},
    {"key": "werebeast", "label": "Werebeast", "count": 105, "color": "#f97316"},
    {"key": "vampire", "label": "Vampire", "count": 43, "color": "#ef4444"},
    {"key": "ghost", "label": "Ghost", "count": 0, "color": "#a8a29e"}
  ]
}
```

When `race_category` is provided, counts are filtered to HFs within that race group. Uses same expansion logic as step 5. Animated dead counted by `race LIKE 'HFEXP%'`.

### Step 7: Frontend — Replace checkboxes with pill/tag race selector

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html`

**Remove**: The checkbox `div.flex.flex-wrap` block (lines 97-103)

**Add in its place**: A race pill container:
```html
<div id="race-pills" class="flex flex-wrap gap-1.5 text-[10px]">
  <!-- Populated dynamically by loadRaceSummary() -->
</div>
```

**New JS functions:**
- `loadRaceSummary()` — fetches `/api/people/race-summary`, renders pills
- `selectRace(key)` — toggles active pill, calls `browsePeople()` with `race_category` param
- `loadVariantsSummary()` — fetches `/api/people/variants-summary`, renders bar chart

**Pill styling**: Click to select (amber highlight), click again to deselect (back to "All"). Single-select behavior. Each pill shows `Label (count)`.

**Modify `browsePeople()`**:
- Remove checkbox flag reading (no more `.hf-flag-filter`)
- Instead, read `selectedRaceCategory` global variable and append `&race_category=X`

### Step 8: Frontend — Add biological variants dashboard tile

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html`

Add a tile above the HF detail content in the right panel. Always visible (collapses to a thin strip when an HF is selected).

```html
<div id="variants-tile" class="border-b border-stone-800 px-4 py-3">
  <div class="text-[10px] text-stone-500 uppercase tracking-wider mb-2">Biological Variants</div>
  <div id="variants-bars">
    <!-- CSS horizontal bars, same technique as unit personality bars -->
  </div>
</div>
```

Each bar: label on left, amber/colored bar proportional to count, count number on right. Pure CSS — no chart library needed (consistent with existing unit personality trait bars).

When a race pill is selected, `loadVariantsSummary(raceKey)` re-fetches and re-renders the bars for that race subset.

### Step 9: Update on-load initialization

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html`

In the IIFE at page bottom:
- Call `loadRaceSummary()` on page load (populates race pills)
- Call `loadVariantsSummary()` on page load (populates variants tile)
- Keep `browsePeople()` call (loads default HF list)

---

## Files Modified

| File | Change |
|------|--------|
| `chronicler/db/schema.sql` | Add `creature_dictionary` table |
| `chronicler/db/migrate_creature_dictionary.sql` | New migration file |
| `chronicler/ingest/xml_parser.py` | Parse `<creature_raw>` section |
| `chronicler/api/routes/people.py` | Add `/race-summary`, `/variants-summary` endpoints; add `race_category` to browse |
| `chronicler/api/templates/explorer.html` | Replace checkboxes with race pills; add variants tile; update JS |

---

## Verification

1. **DB**: `SELECT COUNT(*) FROM creature_dictionary WHERE world_id=2` → 1,879
2. **API**: `curl /api/people/race-summary` → JSON with dynamically categorized races, counts summing to 48,273
3. **API**: `curl /api/people/variants-summary?race_category=DWARF` → variant counts filtered to dwarves only
4. **API**: `curl /api/people/browse?race_category=_forgotten_beast&limit=5` → top 5 forgotten beasts by importance
5. **UI**: Load explorer, verify race pills render with correct counts
6. **UI**: Click "Dwarf" pill → HF list shows only dwarves, variants tile updates to show dwarven vampires/necromancers/etc.
7. **UI**: Click "Dwarf" again (deselect) → returns to "All Races" view
8. **UI**: Verify variants tile shows horizontal bars with labels and counts
