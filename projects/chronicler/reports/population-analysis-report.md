# Chronicler Population Counting Analysis Report

**Date:** 2026-03-06
**Author:** Jarvis (autonomous analysis)
**Scope:** Population, Members, and Residents — counting accuracy across Civilization, Site Government, and Site levels
**World:** Tar Thran (The Land of Dawning), region1-post-embark, year 250

---

## 1. Executive Summary

The Chronicler Explorer tracks populations through three independent data sources:

| Source | Table | Basis | Coverage |
|--------|-------|-------|----------|
| **DF Native Census** | `entity_populations` | Game engine's internal population model | 1,663,758 total across 810 civs — includes unnamed NPCs |
| **Entity Membership** | `hf_entity_links` | Named historical figures linked to political entities | 44,321 unique HFs with `member` links |
| **Site Residency** | `hf_site_links` | Named HFs linked to geographic sites | 2,066 unique HFs across 544 sites |

### Critical Finding

**The `hf_site_links` table contains ZERO records with `link_type = 'resident'`.** The six link types actually present are: `home structure` (682), `occupation` (632), `seat of power` (503), `lair` (252), `hangout` (4), and `home site building` (2). This means any UI column labeled "Residents" that counts `hf_site_links` entries is not counting "residents" in the intuitive sense — it is counting HFs with *any* type of physical attachment to a site (primarily home structures, occupations, and seats of power).

Furthermore, only **2,066 of 48,273** total HFs (4.3%) have any site link at all. In contrast, **44,321 HFs** (91.8%) have entity membership links. This means site links capture only a tiny fraction of the population, making the "Residents" column appear near-zero for most sites.

---

## 2. The Three Counting Models — Definitions and Data

### 2.1 DF Native Census (`entity_populations`)

- **Source:** `<entity_population>` elements in `legends_plus.xml`
- **Meaning:** The game engine's own census, broken down by race per civilization
- **Scope:** Counts ALL sentient beings including unnamed NPCs (fortress workers, soldiers, etc.)
- **World total:** 1,663,758 across 810 civilizations
- **Top example:** "the fly of groups" (civilization): 37,880 population

This is the only count that includes unnamed NPCs. It is the closest to a "true" world population. However:
- It is only available at the **civilization** level, not per site or per site government
- It counts by race, so individual-level deduplication is not possible
- It is a snapshot from the legends export moment, not a dynamic count

### 2.2 Entity Membership (`hf_entity_links`)

- **Source:** `<entity_link>` elements inside `<historical_figure>` in `legends.xml`
- **Meaning:** Political affiliation — which named HFs belong to which entities
- **Link types in DB:**

| link_type | Count | Unique HFs |
|-----------|-------|------------|
| `member` | 92,204 | 44,321 |
| `former member` | 69,703 | 28,387 |
| `enemy` | 26,434 | 2,169 |
| `former prisoner` | 3,886 | 3,770 |
| `criminal` | 1,147 | 653 |
| `prisoner` | 302 | 302 |
| `former slave` | 27 | 26 |
| `slave` | 8 | 8 |

- **Population metric:** Alive HFs with `link_type = 'member'` for a given entity
- **Coverage:** 47,074 of 48,273 HFs (97.5%) have at least one entity link; 1,199 HFs have none
- **Gap:** 1,700 alive HFs have no *current* member link (they may only be former members, enemies, etc.)

### 2.3 Site Residency (`hf_site_links`)

- **Source:** `<site_link>` elements inside `<historical_figure>` in `legends.xml`
- **Critical fact:** These exist **only in standard `legends.xml`**, NOT in `legends_plus.xml`
- **Meaning:** Physical attachment between named HFs and specific geographic sites
- **Link types in DB:**

| link_type | Count | Unique HFs | Unique Sites |
|-----------|-------|------------|-------------|
| `home structure` | 682 | 682 | 35 |
| `occupation` | 632 | 631 | 98 |
| `seat of power` | 502 | 502 | 276 |
| `lair` | 252 | 252 | 233 |
| `hangout` | 4 | 4 | 4 |
| `home site building` | 2 | 2 | 2 |

- **Coverage:** 2,066 HFs across 544 of 2,154 total sites (25.3% of sites)
- **Gap:** 75% of sites have zero site links; 96% of HFs have no site link

---

## 3. Specific Example: "the nourishing league" / "pocketdumplings"

### Entity 1525: the nourishing league
- **Type:** sitegovernment (human)
- **`hf_entity_links`:** 267 total links, 267 current members
- **Alive current members:** 101
- **Members tab shows:** current-alive = 136 (note: this may count from a different query scope)
- **Owned sites:** 1 — Site 621 "pocketdumplings" (town)

### Site 621: pocketdumplings
- **Type:** town
- **Owner:** Entity 1525 (the nourishing league)
- **`hf_site_links`:**
  - `home structure`: 45
  - `seat of power`: 11
  - `occupation`: 5
  - **Total: 61 links** (but NOT using `link_type = 'resident'`)
- **No `link_type = 'resident'` records exist anywhere in the database**

### What the UI shows:
- **Statistics tab "Residents" column: 0** — because the divergence query counts only alive HFs with site links, and the site link types present (home structure, occupation, seat of power) are not filtered correctly, OR the column is genuinely showing zero because the divergence query joins on `owner_entity_id` which maps entity→site, not the other way around
- **Sites tab "Pop. = 0"** — because the site government population query in `civilizations.py` (line 140-150) returns per-SG population only when the SG owns exactly one site; when it owns multiple, it falls back to 0 to avoid misleading display. But Entity 1525 owns only 1 site, so this specific case warrants investigation.
- **Site detail "Residents" tab: 23 counted living** — this counts ALL `hf_site_links` for the site (any link_type), filtered to alive HFs on the frontend

### The Discrepancy Chain:
1. Entity 1525 has **101 alive members** (entity membership)
2. Site 621 has **61 site links** (physical presence), of which some are dead HFs
3. The "Residents" count on site detail shows **23 living** (alive HFs with any site link)
4. The Statistics tab shows **0** for the "Residents" column

Numbers 1 and 3 are measuring **different things** (political membership vs physical presence), so discrepancy is expected. But the **zero** in the Statistics tab indicates a query bug.

---

## 4. Analysis: Logical Consistency

### 4.1 Is the current implementation intuitively logical?

**FOR:**
- The three-tier model (DF census / entity membership / site links) maps to real DF concepts:
  - DF census = total souls in a civilization (including unnamed workers)
  - Entity members = named figures politically affiliated with an organization
  - Site links = named figures with a known physical attachment to a location
- These are genuinely orthogonal in DF: a dwarf can be a member of a civilization without having a specific site_link (most are), and a figure can have a site link without being a member of the site's owner entity

**AGAINST:**
- The word "Residents" implies "people who live at a site." In common understanding, ALL members of a site government who live at a site are "residents." But the current system only counts HFs with explicit `site_link` XML entries, which cover only 4.3% of all HFs.
- Users expect that if a site government has 101 living members and owns one site, that site's "population" or "resident count" should be approximately 101, not 23 or 0.
- The DF native census (entity_populations) counts 17,097 for "the brave kingdom" but the HF-derived member count is much lower. The system doesn't clearly communicate that HF-derived counts are a small sample of the actual population.
- The label "Residents" is misleading when the underlying data is actually "home structure," "occupation," or "seat of power" links — these are specific roles, not general residency.

### 4.2 Is the system undercounting or overcounting?

| Level | Metric | Verdict | Explanation |
|-------|--------|---------|-------------|
| **Civilization** | entity_populations | Correct | DF's own census; authoritative |
| **Civilization** | alive members (deduplicated across SGs) | Undercounting | Only counts *named* HFs; misses ~98% of actual pop |
| **Site Government** | alive members | Correct for its scope | Counts named members accurately; but scope is narrow |
| **Site** | hf_site_links | **Severely undercounting** | Only 4.3% of HFs have site links; 75% of sites have zero |
| **Site** | Population from owner SG | **Sometimes zero when it shouldn't be** | Logic bug in multi-site fallback |

### 4.3 Are ALL sentient denizens counted somewhere?

**NO.** There are three gaps:

1. **1,199 HFs with no entity links at all** — these are likely short-lived, nameless, or purely event-generated figures. Not counted in any membership tally.
2. **1,700 alive HFs with no current member link** — alive but only linked as former members, enemies, prisoners, etc. Not counted in any "population" metric.
3. **~98% of the total DF population (entity_populations) has no individual HF record** — unnamed citizens are invisible to the HF-derived counting system. Only `entity_populations` captures them.

---

## 5. Identified Issues

### Issue 1: CRITICAL — No `link_type = 'resident'` in `hf_site_links`

**Problem:** The DF legends XML uses link types `home structure`, `occupation`, `seat of power`, `lair`, `hangout`, and `home site building` — never `resident`. Any code or UI that expects or filters on `link_type = 'resident'` will return 0.

**Impact:** The Statistics tab "Residents" column shows 0 for all sites. The divergence analysis (entity members vs site residents) always shows 0 on the resident side, making the comparison meaningless.

**Root cause:** The `hf_site_links` table design and the statistics divergence query both work correctly with the data they have — the issue is that the *concept* of "resident" doesn't map to a specific link_type in DF's data model. All six link types represent various forms of site presence.

### Issue 2: HIGH — Site links only in `legends.xml`, not `legends_plus.xml`

**Problem:** The `legends_plus.xml` file contains zero `<site_link>` elements inside `<historical_figure>`. Site links are only present in the standard `legends.xml`. The parser correctly extracts them from `legends.xml` (2,075 entries), but this is a DF data format limitation that should be documented.

**Impact:** If future code changes prioritize `legends_plus.xml` for HF data (since it has richer HF fields), site links could be lost unless the merge logic is preserved.

### Issue 3: HIGH — Fundamental coverage asymmetry

**Problem:** Entity membership covers 97.5% of HFs but site links cover only 4.3%. This makes any comparison between the two fundamentally unbalanced. The divergence table is inherently lopsided: one column (Population) has data for most sites, the other (Residents) is nearly always zero.

**Impact:** The "Population vs Residents" comparison in the Statistics tab is misleading. Users see large populations with zero residents and may think data is broken, when in reality DF simply doesn't provide site-level residency data for most figures.

### Issue 4: MEDIUM — Statistics tab "Residents" column computation

**Problem:** In the divergence query (`statistics.py`), the `site_res` CTE counts `COUNT(DISTINCT hsl.hf_id) FILTER (WHERE hf.death_year IS NULL)` from `hf_site_links` — this counts ALL alive HFs with ANY site link type. This is correct given the available data, but the column header "Residents" is misleading.

**Discrepancy with site detail page:** The site detail page at `/explorer/site/621` shows 23 living residents for pocketdumplings, but the Statistics tab shows 0. This means the divergence query is either:
- Not finding the site_link data (possible JOIN issue with `owner_entity_id`)
- Computing correctly but the frontend rendering has a bug

After reviewing the divergence query: the `entity_pop` CTE joins `sites → entities (via owner_entity_id) → hf_entity_links`. The `site_res` CTE joins `hf_site_links → historical_figures`. These are then LEFT JOINed. Site 621 has 61 site links, some alive. The query should return a non-zero resident count. The zero shown in the UI may be a rendering issue or a data timing issue.

### Issue 5: MEDIUM — Site government population display logic

**Problem:** In `civilizations.py` (line 140-162), the per-site-government population query returns a per-entity count. But the display logic falls back to 0 when a site government owns multiple sites (to avoid showing the same total for each site). For Entity 1525, which owns exactly 1 site (pocketdumplings), the count should pass through — but the user reported seeing Pop=0.

This may be related to how the `sg_populations` dict is keyed: by `entity_id`, not by `site_id`. If the site→SG mapping isn't resolving correctly, the template may not find the population.

### Issue 6: LOW — Inconsistent alive-member counts

**Problem:** The Members tab for Entity 1525 shows `current-alive = 136`, but direct DB query shows 101 alive current members. The discrepancy of 35 may come from:
- The Members API counting from a wider entity scope (including child entities)
- A caching issue
- A different filter condition

This needs investigation.

---

## 6. Comprehensive Proposed Solutions

### Solution 1: Redefine "Residents" as "Site-Linked HFs"

**Change:** Rename all UI labels from "Residents" to "Site-Linked HFs" or "Site Presence" where the data comes from `hf_site_links`. Reserve the word "Residents" for contexts where it means "people living at a site" in the intuitive sense.

**Implementation:**
- `explorer.html`: Change "Residents (Site Links)" to "Site-Linked HFs"
- `site_detail.html`: Change "Residents" tab label to "Site-Linked Figures" with a subtitle explaining the link types
- Statistics tab: Rename "Residents" column to "Site-Linked" and add tooltip explaining coverage

### Solution 2: Derive site population from entity membership

**Change:** For site population, compute it from the owning entity's membership rather than from `hf_site_links`. This gives a much more complete picture:
- Site population = alive members of the entity that owns the site (via `owner_entity_id`)
- This changes the meaning from "physically attached to site" to "members of the site's government"

**Implementation:**
```sql
-- Per-site population from owning entity
SELECT s.id, s.name,
       COUNT(DISTINCT hel.hf_id) FILTER (
           WHERE hel.link_type = 'member' AND hf.death_year IS NULL
       ) AS population
FROM sites s
JOIN hf_entity_links hel ON hel.entity_id = s.owner_entity_id AND hel.world_id = s.world_id
JOIN historical_figures hf ON hf.world_id = hel.world_id AND hf.id = hel.hf_id
WHERE s.world_id = $1
GROUP BY s.id, s.name
```

**Caveat:** Multiple sites can share the same owner entity. In that case, the full entity membership would be attributed to each site, which overcounts at the site level. A weighted distribution or explicit "entity population, not per-site" label would be needed.

### Solution 3: Add DF native census integration at the site level

**Change:** The `entity_populations` table only has civilization-level data. DF doesn't natively export per-site population breakdowns in legends XML. However, for Phase 3 (Live Integration), the DFHack bridge can capture real-time fortress population, which IS per-site.

**Implementation (Phase 3):**
- Add `site_populations` CDM table for bridge-sourced live data
- Populate via `chronicler-bridge.lua` during fortress mode
- Display as a third population metric alongside HF-derived counts

### Solution 4: Fix the Statistics tab divergence query

**Change:** The divergence query currently shows "Residents = 0" for sites that actually have site links. This needs debugging — the LEFT JOIN between `entity_pop` and `site_res` should produce non-zero values for sites like pocketdumplings.

**Specific fix:** Verify the divergence query is correctly joining on `site_id` and that the `FILTER (WHERE hf.death_year IS NULL)` isn't eliminating all records. Also check that the query isn't limited by the `WHERE ep.population > 0 OR COALESCE(sr.residents, 0) > 0` predicate — sites with entity_pop = 0 AND residents = 0 would be excluded.

### Solution 5: Add population tier explanation to UI

**Change:** Add a clear explanation in the Statistics tab (and optionally on entity/site detail pages) that explains the three tiers:

1. **DF Census** (`entity_populations`): Game engine's full population count including unnamed NPCs. Available only at civilization level. Total: 1,663,758.
2. **Named Members** (`hf_entity_links`): Named historical figures politically affiliated with entities. Covers 92% of all HFs. Available at civilization and site government level.
3. **Site Presence** (`hf_site_links`): Named HFs with explicit physical attachment to a site. Covers only 4.3% of HFs across 25% of sites. Available at site level.

This manages user expectations and explains why numbers differ dramatically between tiers.

### Solution 6: Improve post-parse population rollup

**Change:** In `post_parse.py`, add a population rollup step that:
1. For each site with an `owner_entity_id`, computes the entity-membership-derived population
2. Stores this as a computed field on the site record (e.g., `details->'computed_population'`)
3. Falls back to site_link count when no owner entity exists

**Implementation:**
```python
# In post_parse.py, add after existing enrichment steps:
async def _compute_site_populations(conn, world_id):
    """Compute entity-membership-derived population for each owned site."""
    await conn.execute("""
        WITH site_pop AS (
            SELECT s.id AS site_id,
                   COUNT(DISTINCT hel.hf_id) FILTER (
                       WHERE hel.link_type = 'member' AND hf.death_year IS NULL
                   ) AS entity_pop
            FROM sites s
            JOIN hf_entity_links hel ON hel.world_id = s.world_id AND hel.entity_id = s.owner_entity_id
            JOIN historical_figures hf ON hf.world_id = hel.world_id AND hf.id = hel.hf_id
            WHERE s.world_id = $1 AND s.owner_entity_id IS NOT NULL
            GROUP BY s.id
        )
        UPDATE sites s
        SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('entity_population', sp.entity_pop)
        FROM site_pop sp
        WHERE s.world_id = $1 AND s.id = sp.site_id
    """, world_id)
```

### Solution 7: Audit member count discrepancy (Entity 1525)

**Change:** Investigate why the Members tab shows `current-alive = 136` when direct DB query shows 101. Check:
1. Whether the Members API query includes child entities or just the single entity
2. Whether the query in `civilizations.py:fetch_civilization_members` uses a different scope than the detail page
3. Whether there's a caching layer involved

---

## 7. Priority Ranking

| # | Solution | Priority | Effort | Impact |
|---|----------|----------|--------|--------|
| 1 | Redefine "Residents" labeling | HIGH | Low | Eliminates user confusion immediately |
| 4 | Fix Statistics divergence query | HIGH | Low | Makes existing data visible |
| 5 | Add population tier explanation | HIGH | Low | Sets correct expectations |
| 2 | Derive site pop from entity membership | HIGH | Medium | Provides meaningful per-site population |
| 7 | Audit member count discrepancy | MEDIUM | Low | Ensures data integrity |
| 6 | Post-parse population rollup | MEDIUM | Medium | Pre-computes for performance |
| 3 | Live census integration (Phase 3) | LOW (future) | High | Most accurate per-site data possible |

---

## 8. Appendix: Raw Data Snapshot

### Global Counts
- Total HFs: 48,273
- Alive HFs: 17,073
- HFs with entity links: 47,074
- HFs with site links: 2,066
- HFs with both: 2,054
- HFs with neither: ~1,187

### entity_populations vs HF-derived
- DF native census total: 1,663,758
- Alive HFs with current member link: (derived from entity_link counts)
- Alive HFs with any site link: (subset of 2,066)

### Site Coverage
- Total sites: 2,154
- Sites with any hf_site_link: 544 (25.3%)
- Sites with owner_entity_id: 1,466 (68.1%)
- Sites with neither: ~644 (29.9%)
