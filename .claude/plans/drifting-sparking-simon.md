# Population Counting Refactor — Citizens, Residents & DF Census

## Context

The Chronicler's population counting is broken in several ways:
1. **Multi-site SG inflation**: SG 2098 ("the silvery mirrors") owns 39 sites; its 275 members shown as "Pop" for every site — 39x inflation
2. **No sentience filtering**: Non-sentient `GIANT_[ANIMAL]` creatures counted alongside civilized races
3. **Wrong metric names**: "Population" used everywhere but means different things
4. **Zero-population sites**: Sites governed by child SGs show Pop=0

**Solution**: Replace the single "Population" metric with entity-type-specific metrics:

| Entity Type | Overview Tile Metrics | Sidebar List | Sites Tab Column |
|---|---|---|---|
| **Civilization** | Population (DF census) + Citizens + Residents (sum) | `NNN pop` (entity_populations) | Residents (per-site) |
| **Site Government** | Citizens | `NNN citizens` | Residents (per-site) |
| **Other** (guild, religion, troupe) | Members (unchanged) | `NNN members` (unchanged) | N/A |

**Metric Definitions:**
- **Population**: DF native census from `entity_populations` (includes unnamed NPCs). Civs only.
- **Citizens**: Living, sentient, current HFs with `member` link to entity hierarchy. Deduped across civ+child SGs.
- **Residents** (per Site): Living, sentient HFs physically at a site — via `whereabouts->>'site_id'` UNION `hf_site_links`. Includes former members who are still physically present.
- **Members**: Living, current `member` link_type HFs (existing logic, unchanged for guilds/religions/etc.)

**Default display rule**: All counts default to Living AND Current (intersection):
- **Living** = `death_year IS NULL` (includes animated dead — they are technically not dead)
- **Current** = present at a site / current member (not former)
- Dead HFs and former members are NOT counted in overview metrics
- **Exception**: Residents includes former members who are still physically present at the site (they are "current" in the site-presence sense even if "former" in the membership sense)

---

## Files to Modify

| # | File | Purpose |
|---|------|---------|
| 1 | `chronicler/api/routes/civilizations.py` | Core query logic: sentience filter, residents batch helper, citizens query, DF population, list endpoint |
| 2 | `chronicler/api/routes/detail_pages.py` | Entity detail route (L1292-1334) + Site detail route (L1457-1501) |
| 3 | `chronicler/api/routes/geography.py` | Site JSON API (L58-112) — add `residents_count` |
| 4 | `chronicler/api/templates/entity_detail.html` | Overview tile (conditional by type) + Sites tab column rename |
| 5 | `chronicler/api/templates/site_detail.html` | Add Residents to vital_stats bar + update Properties |
| 6 | `chronicler/api/templates/explorer.html` | Inline viewer: sidebar list, overview tile, Sites tab, site detail |

All paths relative to `/Users/nathanielcannon/Claude/Projects/DwarfCron/`.

---

## Step 1: Sentience Filter & Helpers — `civilizations.py`

### Sentience Approach: creature_dictionary flags (DISPOSITION)

The `creature_dictionary.flags` JSONB contains DF creature tags that serve as disposition/sentience indicators. Analysis of the actual flags reveals:

| Flag | Meaning | Example creatures |
|---|---|---|
| `has_any_intelligent_speaks` | Can speak — civilized races, animal people | DWARF, HUMAN, ELF, DINGO_MAN |
| `has_any_intelligent_learns` | Can learn skills — includes trolls | TROLL, DWARF, DINGO_MAN |
| `has_any_natural_animal` | Natural fauna (non-sentient) | GIANT_DINGO, JABBERER, BIRD_ROC |
| `occurs_as_entity_race` | Can form civilizations | DWARF, HUMAN, ELF, GOBLIN, KOBOLD |

**Primary sentience filter**: `has_any_intelligent_speaks OR has_any_intelligent_learns` = sentient.
This cleanly handles all cases without name-pattern matching:
- Civilized races (DWARF, HUMAN, etc.) → both flags → INCLUDED
- Animal people (DINGO_MAN, etc.) → both flags → INCLUDED
- Trolls → `intelligent_learns` only → INCLUDED
- Giant animals (GIANT_DINGO) → neither flag → EXCLUDED
- Underground predators (JABBERER, HUNGRY_HEAD, VORACIOUS_CAVE_CRAWLER) → neither → EXCLUDED
- Megabeasts (BIRD_ROC) → neither flag → EXCLUDED (non-sentient per DF lore)

**Fallback**: For HFs whose race has no `creature_dictionary` entry (rare/modded), fall back to name-pattern: exclude `GIANT_*` without `_MAN` suffix. This is a safety net, not the primary filter.

Add after `_is_animal_person` (line 52):

```python
async def _get_sentient_races(conn, world_id: int) -> set[str]:
    """Return set of creature_ids flagged as sentient via creature_dictionary.

    A creature is sentient if it has intelligent_speaks OR intelligent_learns.
    """
    rows = await conn.fetch(
        "SELECT creature_id FROM creature_dictionary "
        "WHERE world_id = $1 AND ("
        "  flags->>'has_any_intelligent_speaks' = 'true' "
        "  OR flags->>'has_any_intelligent_learns' = 'true'"
        ")",
        world_id,
    )
    return {r["creature_id"] for r in rows}
```

**Usage in queries**: JOIN creature_dictionary or pre-fetch the sentient set and pass as `ANY($N::text[])`.

**Preferred SQL approach** (avoids extra round-trip): JOIN directly in queries:

```sql
LEFT JOIN creature_dictionary cd
    ON cd.world_id = hf.world_id AND cd.creature_id = hf.race
WHERE ...
  AND (
      cd.flags->>'has_any_intelligent_speaks' = 'true'
      OR cd.flags->>'has_any_intelligent_learns' = 'true'
      -- Fallback for races not in creature_dictionary:
      -- if no dictionary entry, include unless GIANT_ pattern
      OR (cd.creature_id IS NULL AND NOT (
          hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN'
      ))
  )
```

### New: `fetch_site_residents_batch(conn, world_id, site_ids) -> dict[int, int]`

Counts living sentient HFs at each site using UNION of:
1. `historical_figures WHERE (whereabouts->>'site_id')::int = ANY(site_ids)` — physical presence
2. `hf_site_links WHERE site_id = ANY(site_ids)` — structural links (home, occupation, seat of power, lair for sentient creatures)

Both branches apply: `death_year IS NULL` + sentience filter (creature_dictionary JOIN). UNION deduplicates. GROUP BY site_id.

**Note**: Residents is NOT filtered by `link_type = 'member'` — it's based on physical presence. A former member still physically at a site IS counted as a Resident.

### New: `fetch_site_residents_count(conn, world_id, site_id) -> int`

Single-site convenience wrapper around the batch function.

---

## Step 2: Modify `fetch_civilization_data()` — `civilizations.py`

### 2a. Replace per-SG population with per-site residents (lines 139-162)

**Delete**: `sg_populations` dict, `pop_rows` query, non-civ `own_pop` fallback.
**Add**: `site_residents = await fetch_site_residents_batch(conn, world_id, all_site_ids)` where `all_site_ids` includes both SG-owned sites AND direct sites (for non-civ entities).

### 2b. Update population_stats query (lines 247-261)

Add sentience filter via `creature_dictionary` JOIN. Rename result key to `citizens`:

```sql
SELECT
    COUNT(DISTINCT hel.hf_id) AS total_known_hfs,
    COUNT(DISTINCT hel.hf_id) FILTER (WHERE hel.link_type = 'member') AS current_members,
    COUNT(DISTINCT hel.hf_id) FILTER (
        WHERE hel.link_type = 'member' AND hf.death_year IS NULL
        AND (
            cd.flags->>'has_any_intelligent_speaks' = 'true'
            OR cd.flags->>'has_any_intelligent_learns' = 'true'
            OR (cd.creature_id IS NULL AND NOT (
                hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN'
            ))
        )
    ) AS citizens
FROM hf_entity_links hel
JOIN historical_figures hf ON hf.world_id = $1 AND hf.id = hel.hf_id
LEFT JOIN creature_dictionary cd ON cd.world_id = hf.world_id AND cd.creature_id = hf.race
WHERE hel.world_id = $1 AND hel.entity_id = ANY($2::int[])
  AND hel.link_type IN ('member', 'former member')
```

### 2c. Add DF Population for civilizations (after population_stats)

```python
df_population = 0
if is_civ:
    df_population = await conn.fetchval(
        "SELECT COALESCE(SUM(count), 0) FROM entity_populations "
        "WHERE world_id = $1 AND civ_id = $2",
        world_id, entity_id,
    ) or 0
```

### 2d. Add total Residents for civilization overview

```python
total_residents = sum(site_residents.values()) if is_civ else 0
```

### 2e. Update site_govts construction

Line 384: `"population"` → `"residents": site_residents.get(site["id"], 0) if site else 0`
Line 440: Same pattern for direct sites.

### 2f. Update result dict (lines 446-449)

```python
result["citizens"] = int(population_stats["citizens"])
result["is_civ"] = is_civ
if is_civ:
    result["df_population"] = df_population
    result["total_residents"] = total_residents
```

Remove `result["total_population"]`.

---

## Step 3: Update list endpoint — `civilizations.py` (lines 619-693)

The sidebar needs entity_populations for civs. Add to the list query:

```sql
-- Add CTE:
ep_totals AS (
    SELECT civ_id, SUM(count) AS pop
    FROM entity_populations WHERE world_id = $1
    GROUP BY civ_id
)

-- Add to SELECT:
COALESCE(ept.pop, 0) AS entity_population

-- Add JOIN:
LEFT JOIN ep_totals ept ON ept.civ_id = e.id
```

Add `entity_population` to the returned dict. The sidebar JS will use this for civs.

---

## Step 4: Entity Detail Route — `detail_pages.py`

### Lines 1292-1298: Extract new keys

```python
citizens = civ_data.get("citizens", 0) if civ_data else 0
df_population = civ_data.get("df_population", 0) if civ_data else 0
total_residents = civ_data.get("total_residents", 0) if civ_data else 0
is_civ = civ_data.get("is_civ", False) if civ_data else False
```

### Lines 1310-1334: Update template context

Remove `"total_population"`. Add:
```python
"citizens": citizens,
"df_population": df_population,
"total_residents": total_residents,
"is_civ": is_civ,
```

---

## Step 5: Site Detail Route — `detail_pages.py`

### Lines 1457-1466: Replace gov_population

```python
from chronicler.api.routes.civilizations import fetch_site_residents_count
residents_count = await fetch_site_residents_count(conn, world_id, site_id)
```

### Line 1494: Update context

`"gov_population": gov_population` → `"residents_count": residents_count`

---

## Step 6: Site JSON API — `geography.py` (lines 58-112)

Add `residents_count` to the JSON response:
```python
from chronicler.api.routes.civilizations import fetch_site_residents_count
residents_count = await fetch_site_residents_count(conn, world_id, site_id)
# Add to return dict:
"residents_count": residents_count,
```

---

## Step 7: `entity_detail.html` Template

### Overview tile (lines 26-56): Three-way conditional

**Civilization** (grid-cols-3, 2 rows):
```
Race          | Sites         | Population (DF census)
Citizens      | Residents     | Ruler
```

**Site Government** (grid-cols-2, 2 rows):
```
Race          | Sites
Citizens      | Ruler
```

**Other** (grid-cols-2, 2 rows — unchanged):
```
Race          | Sites
Members       | Ruler
```

Use `{% if is_civ %}` / `{% elif entity.type == 'sitegovernment' %}` / `{% else %}`.

### Sites tab table (lines 121-166):

- Header: `Pop. ↓` → `Residents ↓`, `data-col="population"` → `data-col="residents"`
- Row data attrs: `data-population` → `data-residents`, value `sg.population` → `sg.residents`
- Cell display: `sg.population` → `sg.residents`

### Sort JS (lines 382-396):

- Default sort col: `'population'` → `'residents'`
- Numeric sort check: `'population'` → `'residents'`

---

## Step 8: `site_detail.html` Template

### Vital stats bar (lines 29-37):

Add after existing spans:
```html
{% if residents_count is defined %}<span>Residents: {{ "{:,}".format(residents_count) }}</span>{% endif %}
```

### Properties section (lines 101-107):

Replace `gov_population` display with:
```html
{% if residents_count is defined and residents_count > 0 %}
  <div><span class="text-stone-500">Residents:</span> {{ "{:,}".format(residents_count) }}</div>
{% endif %}
```

Keep "Site-Linked Residents" line as supplementary detail.

---

## Step 9: `explorer.html` Inline Viewer JS

### Sidebar list (line 1334):

```javascript
// Three-way conditional for sidebar summary line:
const popLabel = e.type === 'civilization'
  ? `${(e.entity_population || 0).toLocaleString()} pop`
  : e.type === 'sitegovernment'
    ? `${e.member_count.toLocaleString()} citizens`
    : `${e.member_count.toLocaleString()} members`;
// Use: ${popLabel} | ${e.site_count} sites
```

### Overview tile (lines 1473-1481):

Three-way conditional matching the full-page template:
- **Civ**: grid-cols-3, show Population + Citizens + Residents + Race + Sites + Ruler
- **SG**: grid-cols-2, show Race + Sites + Citizens + Ruler
- **Other**: grid-cols-2, show Race + Sites + Members + Ruler (unchanged)

Use `civ.is_civ` (or check `civ.df_population != null`) for conditional.

### Sites tab (lines 1486-1511):

- Line 1496: Default sort `'population'` → `'residents'`
- Line 1507: Header `Pop.` → `Residents`, `data-col="population"` → `data-col="residents"`
- Line 1427: `sg.population` → `sg.residents`
- Line 1405: Numeric sort check `'population'` → `'residents'`

### Site inline detail (`renderSiteDetail`, line 1782):

Add residents count after Owner section:
```javascript
if (site.residents_count != null && site.residents_count > 0) {
  html += `<div class="text-xs text-stone-400 mt-1">
    <span class="text-stone-500">Residents:</span> ${site.residents_count.toLocaleString()}
  </div>`;
}
```

---

## Verification Plan

### Phase A: Query Logic Verification (DB-level)

Run these SQL queries directly against the database to validate counting logic before checking the UI.

**A1. Sentience filter accuracy** — verify creature_dictionary flags classify correctly:
```sql
-- All races flagged as sentient (should include DWARF, HUMAN, ELF, GOBLIN, KOBOLD, *_MAN, TROLL)
SELECT creature_id, name_singular,
       flags->>'has_any_intelligent_speaks' AS speaks,
       flags->>'has_any_intelligent_learns' AS learns
FROM creature_dictionary WHERE world_id = 1
  AND (flags->>'has_any_intelligent_speaks' = 'true'
       OR flags->>'has_any_intelligent_learns' = 'true')
ORDER BY creature_id;

-- All races flagged as NON-sentient that have living HFs (should include GIANT_DINGO, JABBERER, etc.)
SELECT cd.creature_id, cd.name_singular, COUNT(hf.id) AS alive_count
FROM creature_dictionary cd
JOIN historical_figures hf ON hf.world_id = cd.world_id AND hf.race = cd.creature_id
WHERE cd.world_id = 1 AND hf.death_year IS NULL
  AND cd.flags->>'has_any_intelligent_speaks' IS DISTINCT FROM 'true'
  AND cd.flags->>'has_any_intelligent_learns' IS DISTINCT FROM 'true'
GROUP BY cd.creature_id, cd.name_singular
ORDER BY alive_count DESC;
```
**Expected**: No civilized race (DWARF, HUMAN, ELF, etc.) appears in the non-sentient list. No `*_MAN` animal person appears in non-sentient. TROLL is in sentient. GIANT_DINGO, JABBERER, HUNGRY_HEAD, VORACIOUS_CAVE_CRAWLER all in non-sentient.

**A2. Residents count for multi-site SG** — verify each site gets its own count:
```sql
-- Get all sites owned by SG 2098's child SGs
WITH sg_sites AS (
    SELECT s.id AS site_id, s.name AS site_name, s.owner_entity_id
    FROM sites s
    JOIN entities sg ON sg.world_id = s.world_id AND sg.id = s.owner_entity_id
    WHERE s.world_id = 1 AND (
        s.owner_entity_id = 2098
        OR sg.details->'entity_links' @> ('[{"type":"PARENT","target":2098}]')::jsonb
    )
)
SELECT ss.site_id, ss.site_name,
    COUNT(DISTINCT sub.hf_id) AS residents
FROM sg_sites ss
LEFT JOIN LATERAL (
    -- Source 1: whereabouts
    SELECT hf.id AS hf_id FROM historical_figures hf
    LEFT JOIN creature_dictionary cd ON cd.world_id = hf.world_id AND cd.creature_id = hf.race
    WHERE hf.world_id = 1 AND hf.death_year IS NULL
      AND (hf.whereabouts->>'site_id')::int = ss.site_id
      AND (cd.flags->>'has_any_intelligent_speaks' = 'true'
           OR cd.flags->>'has_any_intelligent_learns' = 'true'
           OR (cd.creature_id IS NULL AND NOT (hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN')))
    UNION
    -- Source 2: site links
    SELECT hsl.hf_id FROM hf_site_links hsl
    JOIN historical_figures hf ON hf.world_id = hsl.world_id AND hf.id = hsl.hf_id
    LEFT JOIN creature_dictionary cd ON cd.world_id = hf.world_id AND cd.creature_id = hf.race
    WHERE hsl.world_id = 1 AND hsl.site_id = ss.site_id AND hf.death_year IS NULL
      AND (cd.flags->>'has_any_intelligent_speaks' = 'true'
           OR cd.flags->>'has_any_intelligent_learns' = 'true'
           OR (cd.creature_id IS NULL AND NOT (hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN')))
) sub ON true
GROUP BY ss.site_id, ss.site_name
ORDER BY residents DESC;
```
**Expected**: Each site has its OWN count (not 275 everywhere). Sum of all per-site counts should be much less than 275 × 39.

**A3. Citizens vs old "living_population"** — compare sentience-filtered vs unfiltered:
```sql
-- Pick a civilization and compare
WITH all_entity_ids AS (
    SELECT id FROM entities WHERE world_id = 1 AND (
        id = <CIV_ID> OR
        details->'entity_links' @> ('[{"type":"PARENT","target":<CIV_ID>}]')::jsonb
    )
)
SELECT
    COUNT(DISTINCT hel.hf_id) FILTER (
        WHERE hel.link_type = 'member' AND hf.death_year IS NULL
    ) AS old_living_population,
    COUNT(DISTINCT hel.hf_id) FILTER (
        WHERE hel.link_type = 'member' AND hf.death_year IS NULL
        AND (cd.flags->>'has_any_intelligent_speaks' = 'true'
             OR cd.flags->>'has_any_intelligent_learns' = 'true'
             OR (cd.creature_id IS NULL AND NOT (hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN')))
    ) AS new_citizens
FROM hf_entity_links hel
JOIN historical_figures hf ON hf.world_id = 1 AND hf.id = hel.hf_id
LEFT JOIN creature_dictionary cd ON cd.world_id = hf.world_id AND cd.creature_id = hf.race
WHERE hel.world_id = 1 AND hel.entity_id IN (SELECT id FROM all_entity_ids)
  AND hel.link_type IN ('member', 'former member');
```
**Expected**: `new_citizens <= old_living_population`. Difference = non-sentient creatures that were previously counted.

**A4. DF Population (entity_populations) sanity check**:
```sql
SELECT civ_id, SUM(count) AS df_population
FROM entity_populations WHERE world_id = 1
GROUP BY civ_id ORDER BY df_population DESC LIMIT 10;
```
**Expected**: Numbers should be much larger than Citizens (entity_populations includes unnamed NPCs).

**A5. whereabouts.site_id coverage**:
```sql
SELECT
    COUNT(*) FILTER (WHERE (whereabouts->>'site_id') IS NOT NULL) AS has_site_id,
    COUNT(*) FILTER (WHERE (whereabouts->>'site_id') IS NULL) AS missing_site_id,
    COUNT(*) FILTER (WHERE death_year IS NULL AND (whereabouts->>'site_id') IS NOT NULL) AS alive_with_site_id,
    COUNT(*) FILTER (WHERE death_year IS NULL AND (whereabouts->>'site_id') IS NULL) AS alive_missing_site_id
FROM historical_figures WHERE world_id = 1;
```
**Expected**: Understand what percentage of living HFs have `whereabouts.site_id`. If coverage is low, Residents counts will be lower than expected — this is a data completeness issue, not a bug.

**A6. "Former member but still Resident" edge case**:
```sql
-- HFs who are former members of an SG but still physically at one of that SG's sites
SELECT hf.id, hf.name, hf.race, hel.link_type,
       (hf.whereabouts->>'site_id')::int AS cur_site_id
FROM hf_entity_links hel
JOIN historical_figures hf ON hf.world_id = hel.world_id AND hf.id = hel.hf_id
WHERE hel.world_id = 1 AND hel.link_type = 'former member'
  AND hf.death_year IS NULL
  AND (hf.whereabouts->>'site_id') IS NOT NULL
LIMIT 20;
```
**Expected**: These HFs should be counted as Residents (physical presence) but NOT as Citizens (membership only). Verify the Residents query includes them and the Citizens query excludes them.

---

### Phase B: UI Display Verification (Page-level)

Load each page type and verify labels, values, and layout.

**B1. Civilization full page** (`/explorer/entity/<CIV_ID>?world_id=1`):
- [ ] Overview tile shows 3 rows: Race/Sites/Population, Citizens/Residents/Ruler
- [ ] "Population" value matches A4 query result for this civ
- [ ] "Citizens" value matches A3 `new_citizens` for this civ
- [ ] "Residents" value = sum of all per-site Residents in the Sites tab
- [ ] Sites tab column header says "Residents" (not "Pop.")
- [ ] Each site row shows its own Residents count (not the SG member count)
- [ ] Sites tab sorts by Residents descending by default
- [ ] Clicking Residents column header toggles sort direction

**B2. Site Government full page** (`/explorer/entity/2597?world_id=1`):
- [ ] Overview tile shows: Race, Sites, Citizens, Ruler (2×2 grid)
- [ ] "Citizens" label used (not "Population" or "Members")
- [ ] Citizens value = living sentient current members of this SG
- [ ] Sites tab column says "Residents" with per-site counts
- [ ] Members tab unchanged (still shows all members with filter chips)

**B3. Other entity full page** (load a religion or guild entity):
- [ ] Overview tile shows: Race, Sites, Members, Ruler (2×2 grid)
- [ ] "Members" label used (not "Population" or "Citizens")
- [ ] Members value = living current members (unchanged logic)

**B4. Site full page** (`/explorer/site/621?world_id=1`):
- [ ] Vital stats bar includes "Residents: NNN"
- [ ] Properties section shows "Residents: NNN" (replaced "Gov. Members (alive)")
- [ ] "Site-Linked Residents" detail line still present
- [ ] Residents tab still shows individual HFs with link types

**B5. Multi-site SG case** (`/explorer/entity/2098?world_id=1`):
- [ ] Sites tab shows 39 sites with DIFFERENT Residents counts (not 275 everywhere)
- [ ] Sites with 0 `whereabouts.site_id` matches still show site-link-based Residents
- [ ] Total Residents (sum of column) is realistic (not 39 × 275 = 10,725)

**B6. Zero-population fix**:
- [ ] Pick 3-5 sites that previously showed Pop=0
- [ ] At least some now show Residents > 0 (if HFs have `whereabouts.site_id` pointing there)

---

### Phase C: Inline Viewer Verification (Explorer SPA)

**C1. Sidebar list**:
- [ ] Civilization entries show `NNN pop` (entity_populations value)
- [ ] Site Government entries show `NNN citizens`
- [ ] Other entity entries show `NNN members`
- [ ] Sort by "members" still works (sidebar sort dropdown)

**C2. Civilization inline detail**:
- [ ] Overview tile matches full page layout (3-column grid with Population, Citizens, Residents)
- [ ] Sites tab column says "Residents" with per-site counts
- [ ] Sites tab sorts by Residents by default
- [ ] Values match between inline and full page for the same entity

**C3. Site Government inline detail**:
- [ ] Overview tile shows Citizens (not Population)
- [ ] Sites tab column says "Residents"

**C4. Site inline detail**:
- [ ] Shows "Residents: NNN" after Owner section
- [ ] Value matches the full page Residents count for same site

---

### Phase D: Counting Logic Cross-Checks

These checks verify the MATHEMATICAL CORRECTNESS of the counting.

**D1. Citizens ⊆ Members**: For any entity, Citizens count ≤ total living current members (Citizens = Members minus non-sentient creatures).

**D2. Residents independence**: Residents at site A + Residents at site B should not double-count an HF that appears at both sites (the UNION in the query deduplicates by hf_id within a site, and each site is counted independently).

**D3. Population ≫ Citizens**: For civilizations, DF Population (entity_populations) should be much larger than Citizens (entity_populations includes unnamed NPCs; Citizens only counts named HFs).

**D4. Sum of per-site Residents ≤ Citizens for a civ**: The total Residents across all sites should generally be ≤ Citizens, because not all citizens have a known physical location. (Could be > Citizens if there are Residents who are former members.)

**D5. Sentience filter consistency**: Run this check for a sample of 10 HFs that appear as Residents — verify each one has `has_any_intelligent_speaks` or `has_any_intelligent_learns` in their creature_dictionary entry.

**D6. No deceased in overview counts**: Verify that no overview count (Population, Citizens, Residents, Members) includes an HF with `death_year IS NOT NULL`. Run a query that intersects the counted HFs with `death_year IS NOT NULL` — result should be empty.

**D7. No former members in Citizens**: Verify that Citizens count excludes HFs with `link_type = 'former member'`. Run the Citizens query without the `link_type = 'member'` filter and compare — difference = former members correctly excluded.
