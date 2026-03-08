# Chronicler Population Counting Analysis Report

**Date:** 2026-03-06 (revised 2026-03-07)
**Author:** Jarvis (autonomous analysis)
**Scope:** Population, Members, Residents, and Citizens — counting accuracy across Civilization, Site Government, and Site levels
**World:** Tar Thran (The Land of Dawning), region1-post-embark, year 250

---

## 1. Executive Summary

The Chronicler Explorer tracks populations through three independent data sources:

| Source | Table | Basis | Coverage |
|--------|-------|-------|----------|
| **DF Native Census** | `entity_populations` | Game engine's internal population model | 1,663,758 total across 810 civs — includes unnamed NPCs |
| **Entity Membership** | `hf_entity_links` | Named historical figures linked to political entities | 44,321 unique HFs with `member` links |
| **Site Presence** | `hf_site_links` | Named HFs linked to geographic sites | 2,066 unique HFs across 544 sites |

### Critical Finding

**The `hf_site_links` table contains ZERO records with `link_type = 'resident'`.** The six link types actually present are: `home structure` (682), `occupation` (632), `seat of power` (503), `lair` (252), `hangout` (4), and `home site building` (2). This means any UI column labeled "Residents" that counts `hf_site_links` entries is not counting "residents" in the intuitive sense — it is counting HFs with *any* type of physical attachment to a site (primarily home structures, occupations, and seats of power).

Furthermore, only **2,066 of 48,273** total HFs (4.3%) have any site link at all. In contrast, **44,321 HFs** (91.8%) have entity membership links. This means site links capture only a tiny fraction of the population, making the site presence column appear near-zero for most sites.

---

## 2. Canonical Demographic Glossary

> **This glossary defines the authoritative meaning of demographic terms throughout all Chronicler code, documentation, templates, and API responses.**

### 2.1 Core Terms

| Term | Definition | Data Source | Filter | Scope |
|------|-----------|-------------|--------|-------|
| **Population** | Total count of **living** Historical Figures with current membership assignment to a Civilization entity. | `hf_entity_links` | `link_type = 'member'` AND `death_year IS NULL` AND entity `type = 'civilization'` | Civilization-level only |
| **Residents** | Total number of **unique HFs** linked to a Civilization **or** a Site via entity membership or site presence. The union of `hf_entity_links` (member) + `hf_site_links` (any type) for the relevant scope. Closest analog to "who lives here." | `hf_entity_links` UNION `hf_site_links` | `link_type = 'member'` for entity links; any type for site links | Civ or Site level |
| **Citizens** | Total number of **unique HFs** with current membership links to a Civilization, **or** to a Site Government entity, **or** to a Site directly (via `hf_site_links`). | `hf_entity_links` (civ members) UNION `hf_entity_links` (SG members) UNION `hf_site_links` | `link_type = 'member'` for entity links; any type for site links | Cross-level |
| **Members** | All HFs with a political affiliation link (`member` or `former member`) to a specific entity. Includes alive and dead unless explicitly filtered. | `hf_entity_links` | `link_type IN ('member', 'former member')` | Any entity |
| **Current Members** | Subset of Members where `link_type = 'member'` (excluding former). May be alive or dead. | `hf_entity_links` | `link_type = 'member'` | Any entity |
| **Site Presence** | Named HFs with explicit physical attachment to a site. Replaces the misleading "Residents" label when sourced solely from `hf_site_links`. | `hf_site_links` | Any link_type | Site-level |

### 2.2 Overlap Counts (World: Tar Thran)

| Set | Count | Description |
|-----|-------|-------------|
| Civilization members (`member` link, entity type `civilization`) | 36,776 | HFs affiliated with a civilization |
| Site Government members (`member` link, entity type `sitegovernment`) | 29,560 | HFs affiliated with a site government |
| Site-linked HFs (any `hf_site_links` type) | 2,066 | HFs with physical site attachment |
| **Citizens** (union: civ members + SG members) | **40,009** | Unique HFs in any political entity |
| **Residents** (union: civ + SG + site-linked) | **40,943** | Unique HFs with any linkage |

### 2.3 Geographical Dwelling Hierarchy

Non-inclusive, semi-hierarchical levels of geographic settlement:

```
Civilization  →  Site  →  Cave  →  Lair
(political)     (geographic)  (subterranean)  (individual)
```

- **Civilization:** Top-level political entity (810 in Tar Thran). Owns sites indirectly via child Site Government entities.
- **Site:** Geographic location (2,154 total). Owned by a Site Government via `owner_entity_id`.
- **Cave / Lair:** Subterranean or individual sites without formal government (caves: 100, lairs: 199). Typically inhabited by megabeasts, animal-people, or outcasts.

### 2.4 Excluded Link Types (Not Counted in Population, Residents, or Citizens)

The following `hf_entity_links.link_type` values represent adversarial or coerced relationships and are **excluded** from all demographic counts:

| link_type | Total Links | Unique HFs | Alive HFs | Meaning |
|-----------|------------|------------|-----------|---------|
| `enemy` | 26,434 | 2,169 | 548 | Hostile relationship; declared enemy of the entity |
| `former prisoner` | 3,886 | 3,770 | 741 | Was imprisoned, now released |
| `criminal` | 1,147 | 653 | 287 | Wanted for crimes against the entity |
| `prisoner` | 302 | 302 | 215 | Currently imprisoned by the entity |
| `former slave` | 27 | 26 | 16 | Was enslaved, now freed |
| `slave` | 8 | 8 | 2 | Currently enslaved by the entity |

These are surfaced in the **Ne'er-do-wells** tab (see §7) rather than in membership or population views.

---

## 3. The Three Counting Models — Definitions and Data

### 3.1 DF Native Census (`entity_populations`)

- **Source:** `<entity_population>` elements in `legends_plus.xml`
- **Meaning:** The game engine's own census, broken down by race per civilization
- **Scope:** Counts ALL sentient beings including unnamed NPCs (fortress workers, soldiers, etc.)
- **World total:** 1,663,758 across 810 civilizations
- **Top example:** "the fly of groups" (civilization): 37,880 population
- **Status:** Alive only (snapshot at moment of legends export)

This is the only count that includes unnamed NPCs. It is the closest to a "true" world population. However:
- It is only available at the **civilization** level, not per site or per site government
- It counts by race, so individual-level deduplication is not possible
- It is a snapshot from the legends export moment, not a dynamic count

### 3.2 Entity Membership (`hf_entity_links`)

- **Source:** `<entity_link>` elements inside `<historical_figure>` in `legends.xml`
- **Meaning:** Political affiliation — which named HFs belong to which entities
- **Link types in DB:**

| link_type | Total Links | Unique HFs | Alive HFs | Unique Entities |
|-----------|------------|------------|-----------|----------------|
| `member` | 92,204 | 44,321 | 15,373 | 2,942 |
| `former member` | 69,703 | 28,387 | 8,303 | 2,551 |
| `enemy` | 26,434 | 2,169 | 548 | 1,918 |
| `former prisoner` | 3,886 | 3,770 | 741 | 335 |
| `criminal` | 1,147 | 653 | 287 | 214 |
| `prisoner` | 302 | 302 | 215 | 91 |
| `former slave` | 27 | 26 | 16 | 7 |
| `slave` | 8 | 8 | 2 | 3 |

- **Population metric:** Alive HFs with `link_type = 'member'` for a given entity
- **Coverage:** 47,074 of 48,273 HFs (97.5%) have at least one entity link; 1,199 HFs have none
- **Gap:** 1,700 alive HFs have no *current* member link (they may only be former members, enemies, etc.)

#### Entity Link Type Descriptions

- **`member`**: Current political membership. The HF is affiliated with and counted as part of this entity. This is the primary demographic link.
- **`former member`**: Previously affiliated but no longer. May have died, migrated, been exiled, or transferred allegiance. Still tracked for historical reference.
- **`enemy`**: Declared hostile relationship. Overwhelmingly megabeasts and titans (ROC: 6,879; BRONZE_COLOSSUS: 3,836; ETTIN: 1,591). These beings threaten civilizations but are not members.
- **`criminal`**: Wanted for crimes. Interestingly dominated by animal-people in human towns (REPTILE_MAN: 147; CAVE_FISH_MAN: 143; OLM_MAN: 136; AMPHIBIAN_MAN: 109) — suggesting cultural friction between animal-person immigrants and human governance.
- **`prisoner`**: Currently imprisoned. Mainly dwarves (152) and humans (119) held by site governments.
- **`former prisoner`**: Previously imprisoned, now released. Mostly dwarves (1,838) and humans (1,566).
- **`slave`**: Currently enslaved (only 8 records). Rare in this world.
- **`former slave`**: Previously enslaved, now freed (27 records). Mostly dwarves (12) and elves (6).

### 3.3 Site Presence (`hf_site_links`)

- **Source:** `<site_link>` elements inside `<historical_figure>` in `legends.xml`
- **Critical fact:** These exist **only in standard `legends.xml`**, NOT in `legends_plus.xml`
- **Meaning:** Physical attachment between named HFs and specific geographic sites
- **Link types in DB:**

| link_type | Total Links | Unique HFs | Alive HFs | Unique Sites |
|-----------|------------|------------|-----------|-------------|
| `home structure` | 682 | 682 | 277 | 35 |
| `occupation` | 632 | 631 | 631 | 98 |
| `seat of power` | 502 | 502 | 502 | 276 |
| `lair` | 252 | 252 | 252 | 233 |
| `hangout` | 4 | 4 | 4 | 4 |
| `home site building` | 2 | 2 | 2 | 2 |

- **Coverage:** 2,066 HFs across 544 of 2,154 total sites (25.3% of sites)
- **Gap:** 75% of sites have zero site links; 96% of HFs have no site link

#### Site Link Type Descriptions

- **`home structure`**: The HF has a designated dwelling (house, room) at a structure within this site. Predominantly human (222) and animal-people (OLM_MAN: 54, REPTILE_MAN: 50, CAVE_FISH_MAN: 47, AMPHIBIAN_MAN: 36). Concentrated in 35 towns. Includes both alive (277) and dead (405) HFs.
- **`occupation`**: The HF holds a working role at this site — scholar, performer, mercenary, tavern keeper, doctor, etc. Linked to **sites** (not individual structures). Dominated by elves (285), then humans (119), dwarves (112), goblins (111). Notably, 100% alive — dead HFs lose occupations. Top sites: squeezelantern (122), tinscoured (81), cudgelpoint (55) — all fortresses.
- **`seat of power`**: The HF holds political authority at this site — typically a ruler, administrator, or council member. 100% alive. Humans dominate (328), then dwarves (62), elves (57), goblins (24). Spread across 276 sites.
- **`lair`**: The HF resides in an individual lair. Almost exclusively megabeasts — minotaurs (20), rocs (20), ettins (19), yetis (19), cyclopes (14). 100% alive (dead lair-dwellers don't retain the link). 233 unique lair sites.
- **`hangout`**: The HF frequents this site as a gathering place. Only 4 records (3 human, 1 goblin). Extremely rare.
- **`home site building`**: The HF resides in a specific building (not a structure). Only 2 records (both elves). Rare variant of `home structure`.

---

## 4. Specific Example: "the nourishing league" / "pocketdumplings"

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
- **Site detail "Site Presence" tab: 23 counted living** — this counts ALL `hf_site_links` for the site (any link_type), filtered to alive HFs on the frontend

### The Discrepancy Chain:
1. Entity 1525 has **101 alive members** (entity membership)
2. Site 621 has **61 site links** (physical presence), of which some are dead HFs
3. The "Site Presence" count on site detail shows **23 living** (alive HFs with any site link)
4. The Statistics tab shows **0** for the "Site Presence" column

Numbers 1 and 3 are measuring **different things** (political membership vs physical presence), so discrepancy is expected. But the **zero** in the Statistics tab indicates a query bug.

---

## 5. Analysis: Logical Consistency

### 5.1 Is the current implementation intuitively logical?

**FOR:**
- The three-tier model (DF census / entity membership / site links) maps to real DF concepts:
  - DF census = total souls in a civilization (including unnamed workers)
  - Entity members = named figures politically affiliated with an organization
  - Site presence = named figures with a known physical attachment to a location
- These are genuinely orthogonal in DF: a dwarf can be a member of a civilization without having a specific site_link (most are), and a figure can have a site link without being a member of the site's owner entity

**AGAINST:**
- The word "Residents" implies "people who live at a site." In common understanding, ALL members of a site government who live at a site are "residents." But the current system only counts HFs with explicit `site_link` XML entries, which cover only 4.3% of all HFs.
- Users expect that if a site government has 101 living members and owns one site, that site's "population" or "resident count" should be approximately 101, not 23 or 0.
- The DF native census (entity_populations) counts 17,097 for "the brave kingdom" but the HF-derived member count is much lower. The system doesn't clearly communicate that HF-derived counts are a small sample of the actual population.
- Referring to site link data as "Residents" is misleading when the underlying data is actually "home structure," "occupation," or "seat of power" links — these are specific roles, not general residency.

### 5.2 Is the system undercounting or overcounting?

| Level | Metric | Verdict | Explanation |
|-------|--------|---------|-------------|
| **Civilization** | entity_populations | Correct | DF's own census; authoritative |
| **Civilization** | alive members (deduplicated across SGs) | Undercounting | Only counts *named* HFs; misses ~98% of actual pop |
| **Site Government** | alive members | Correct for its scope | Counts named members accurately; but scope is narrow |
| **Site** | hf_site_links | **Severely undercounting** | Only 4.3% of HFs have site links; 75% of sites have zero |
| **Site** | Population from owner SG | **Sometimes zero when it shouldn't be** | Logic bug in multi-site fallback |

### 5.3 Are ALL sentient denizens counted somewhere?

**NO.** There are three gaps:

1. **1,199 HFs with no entity links at all** — these are likely short-lived, nameless, or purely event-generated figures. Not counted in any membership tally.
2. **1,700 alive HFs with no current member link** — alive but only linked as former members, enemies, prisoners, etc. Not counted in any "population" metric.
3. **~98% of the total DF population (entity_populations) has no individual HF record** — unnamed citizens are invisible to the HF-derived counting system. Only `entity_populations` captures them.

---

## 6. Identified Issues

### Issue 1: CRITICAL — No `link_type = 'resident'` in `hf_site_links`

**Problem:** The DF legends XML uses link types `home structure`, `occupation`, `seat of power`, `lair`, `hangout`, and `home site building` — never `resident`. Any code or UI that expects or filters on `link_type = 'resident'` will return 0.

**Impact:** The Statistics tab "Residents" column shows 0 for all sites. The divergence analysis (entity members vs site residents) always shows 0 on the resident side, making the comparison meaningless.

**Root cause:** The `hf_site_links` table design and the statistics divergence query both work correctly with the data they have — the issue is that the *concept* of "resident" doesn't map to a specific link_type in DF's data model. All six link types represent various forms of site presence.

### Issue 2: HIGH — Site links only in `legends.xml`, not `legends_plus.xml`

**Problem:** The `legends_plus.xml` file contains zero `<site_link>` elements inside `<historical_figure>`. Site links are only present in the standard `legends.xml`. The parser correctly extracts them from `legends.xml` (2,075 entries), but this is a DF data format limitation that should be documented.

**Impact:** If future code changes prioritize `legends_plus.xml` for HF data (since it has richer HF fields), site links could be lost unless the merge logic is preserved.

### Issue 3: HIGH — Fundamental coverage asymmetry

**Problem:** Entity membership covers 97.5% of HFs but site links cover only 4.3%. This makes any comparison between the two fundamentally unbalanced. The divergence table is inherently lopsided: one column (Population) has data for most sites, the other (Site Presence) is nearly always zero.

**Impact:** The "Population vs Site Presence" comparison in the Statistics tab is misleading. Users see large populations with zero site presence and may think data is broken, when in reality DF simply doesn't provide site-level residency data for most figures.

### Issue 4: MEDIUM — Statistics tab "Site Presence" column computation

**Problem:** In the divergence query (`statistics.py`), the `site_res` CTE counts `COUNT(DISTINCT hsl.hf_id) FILTER (WHERE hf.death_year IS NULL)` from `hf_site_links` — this counts ALL alive HFs with ANY site link type. This is correct given the available data, but the column header needs to reflect what it actually measures.

### Issue 5: MEDIUM — Site government population display logic

**Problem:** In `civilizations.py` (line 140-162), the per-site-government population query returns a per-entity count. But the display logic falls back to 0 when a site government owns multiple sites (to avoid showing the same total for each site). For Entity 1525, which owns exactly 1 site (pocketdumplings), the count should pass through — but the user reported seeing Pop=0.

### Issue 6: LOW — Inconsistent alive-member counts

**Problem:** The Members tab for Entity 1525 shows `current-alive = 136`, but direct DB query shows 101 alive current members. The discrepancy may come from the Members API counting from a wider entity scope (including child entities), a caching issue, or a different filter condition.

---

## 7. Occupation & Animal-Person Analysis

### 7.1 Are Occupations Linked to Structures, Sites, or Both?

**Answer: Sites only.** The `hf_site_links` table links an HF to a `site_id` with `link_type = 'occupation'`. There is no structure-level linkage for occupations in the DF legends XML data model — the XML only emits `<site_link>` elements, not `<structure_link>` elements for occupations.

This means:
- A **Tavern Keeper** at site "pocketdumplings" has a site-level occupation link, but we cannot determine *which* tavern structure they work at from the legends data alone.
- A **Doctor** similarly links to the site, not to a specific hospital or temple.
- **Merchants and Performers** who travel between sites may have occupation links that change over time, but the legends export captures only the state at export time. If a performer has moved on, their previous site link is gone.

#### Occupation Race Distribution

| Race | Total | Alive | Notes |
|------|-------|-------|-------|
| ELF | 285 | 285 | Largest occupational workforce — scholars, performers |
| HUMAN | 119 | 119 | Second largest |
| DWARF | 112 | 112 | Third — includes fortress workers |
| GOBLIN | 111 | 111 | Fourth — dark fortress occupants |
| REPTILE_MAN | 1 | 1 | Rare outlier |
| CAVE_FISH_MAN | 1 | 1 | Rare outlier |
| AMPHIBIAN_MAN | 1 | 1 | Rare outlier |
| ELEPHANT_MAN | 1 | 1 | Rare outlier |

**Key insight:** Occupations are **100% alive** — dead HFs lose their occupation links. This is DF's design: occupations represent current employment, not historical roles.

#### Top Occupation Sites

| Site | Type | Total Occupied HFs |
|------|------|-------------------|
| squeezelantern | fortress | 122 |
| tinscoured | fortress | 81 |
| cudgelpoint | fortress | 55 |
| siegehealed | town | 14 |
| reignedjackals | dark fortress | 12 |

Fortresses dominate the occupation rankings because DF generates many named scholar/performer/mercenary HFs who work at active fortress sites.

### 7.2 Animal-Person "Home Structure" Analysis

**What is a "home structure" for an animal-person?**

In Dwarf Fortress, animal-people (amphibian men, cave fish men, olm men, reptile men, etc.) are semi-civilized races that can integrate into human civilization. When they settle in a human town, DF assigns them a `home structure` link — the same mechanism used for human townspeople. The "home structure" is a dwelling (house, room, or allocated space) within the town's structures.

These are **not** cave dwellings or wilderness lairs. Animal-people with `home structure` links live **exclusively in towns** as integrated residents of human settlements.

#### Per-Race Summary

| Race | Total Home Struct | Alive | Sites (all towns) | Also Has Occupation | Also Has Seat of Power |
|------|-------------------|-------|--------------------|--------------------|----------------------|
| OLM_MAN | 54 | 32 | 16 towns | 0 | 2 |
| REPTILE_MAN | 50 | 24 | 16 towns | 1 | 5 |
| CAVE_FISH_MAN | 47 | 19 | 16 towns | 1 | 2 |
| AMPHIBIAN_MAN | 36 | 18 | 15 towns | 1 | 5 |

**Key findings:**
1. **All home structures are in towns** — zero caves, lairs, or fortresses. Animal-people with home structures are urban residents.
2. **Spread across many towns** — not concentrated in one settlement. Each race has 15-16 distinct towns.
3. **Some hold power** — reptile men and amphibian men occasionally achieve seats of power in human towns (5 each), suggesting political integration.
4. **High mortality** — only ~40-60% alive across races, consistent with their participation in town life (wars, crime, etc.).
5. **The "criminal" connection** — animal-people are disproportionately represented in the `criminal` link type (see §3.2). REPTILE_MAN: 147 criminal links, CAVE_FISH_MAN: 143, OLM_MAN: 136, AMPHIBIAN_MAN: 109. This suggests cultural friction between animal-person immigrants and human governance structures.

#### Top Towns by Animal-Person Home Structures

| Town | OLM_MAN | REPTILE_MAN | CAVE_FISH_MAN | AMPHIBIAN_MAN | Total |
|------|---------|-------------|---------------|---------------|-------|
| siegehealed | 15 | 1 | 6 | 2 | 24 |
| bowdrilled | 3 | 6 | 4 | 1 | 14 |
| jumpcrosses | 2 | 9 | 0 | 3 | 14 |
| dearfigure | 3 | 7 | 2 | 3 | 15 |
| reigngrasps | 7 | 1 | 1 | 1 | 10 |
| sculptedbone | 6 | 3 | 4 | 0 | 13 |
| virtueomen | 0 | 0 | 5 | 1 | 6 |

---

## 8. Comprehensive Proposed Solutions

### Solution 1: Standardize UI labels per Canonical Glossary (§2)

**Change:** All UI labels must match §2 terminology:
- "Members" tab → keep as-is (shows `member` + `former member` links)
- "Population" header → clarify as "Population (named, alive members)"
- "Residents" tab on site detail → rename to "Site Presence" with subtitle showing link types
- Statistics "Residents" column → rename to "Site-Linked" with tooltip

### Solution 2: Derive site population from entity membership

**Change:** For site population, compute from the owning entity's membership:
```sql
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

**Caveat:** Multiple sites can share the same owner entity, leading to overcounting.

### Solution 3: Add DF native census integration at the site level

For Phase 3 (Live Integration), the DFHack bridge can capture real-time fortress population, which IS per-site. Add `site_populations` CDM table for bridge-sourced live data.

### Solution 4: Fix the Statistics tab divergence query

Verify the divergence query is correctly joining on `site_id` and that the alive filter isn't eliminating all records.

### Solution 5: Add population tier explanation to UI

Add clear three-tier explanation to Statistics tab: DF Census (1.66M), Named Members (44K), Site Presence (2K).

### Solution 6: Improve post-parse population rollup

In `post_parse.py`, add a population rollup step that pre-computes entity-membership-derived population per site.

### Solution 7: Audit member count discrepancy (Entity 1525)

Investigate why Members tab shows 136 alive vs DB query returning 101.

---

## 9. Priority Ranking

| # | Solution | Priority | Effort | Impact |
|---|----------|----------|--------|--------|
| 1 | Standardize UI labels per glossary | HIGH | Low | Eliminates user confusion immediately |
| 4 | Fix Statistics divergence query | HIGH | Low | Makes existing data visible |
| 5 | Add population tier explanation | HIGH | Low | Sets correct expectations |
| 2 | Derive site pop from entity membership | HIGH | Medium | Provides meaningful per-site population |
| 7 | Audit member count discrepancy | MEDIUM | Low | Ensures data integrity |
| 6 | Post-parse population rollup | MEDIUM | Medium | Pre-computes for performance |
| 3 | Live census integration (Phase 3) | LOW (future) | High | Most accurate per-site data possible |

---

## 10. Appendix: Raw Data Snapshot

### 10.1 Global Counts

| Metric | All | Alive Only |
|--------|-----|-----------|
| Total Historical Figures | 48,273 | 17,073 |
| HFs with entity links | 47,074 | — |
| HFs with site links | 2,066 | — |
| HFs with both entity + site links | 2,054 | — |
| HFs with neither | ~1,187 | — |
| DF Native Census (entity_populations) | 1,663,758 | 1,663,758 (alive only by design) |

### 10.2 Entity Link Type Breakdown

| link_type | Total Links | Unique HFs (All) | Unique HFs (Alive) | Unique Entities | Category |
|-----------|------------|-------------------|---------------------|----------------|----------|
| `member` | 92,204 | 44,321 | 15,373 | 2,942 | Demographic |
| `former member` | 69,703 | 28,387 | 8,303 | 2,551 | Demographic |
| `enemy` | 26,434 | 2,169 | 548 | 1,918 | Excluded |
| `former prisoner` | 3,886 | 3,770 | 741 | 335 | Excluded |
| `criminal` | 1,147 | 653 | 287 | 214 | Excluded |
| `prisoner` | 302 | 302 | 215 | 91 | Excluded |
| `former slave` | 27 | 26 | 16 | 7 | Excluded |
| `slave` | 8 | 8 | 2 | 3 | Excluded |

#### By Race (top 5 per entity link type)

**`member`** (current political affiliation):
| Race | Total | Alive |
|------|-------|-------|
| HUMAN | 35,870 | 11,890 |
| DWARF | 21,284 | 7,004 |
| ELF | 17,493 | 8,398 |
| GOBLIN | 15,470 | 4,830 |
| KOBOLD | 694 | 174 |

**`former member`** (past affiliation):
| Race | Total | Alive |
|------|-------|-------|
| HUMAN | 23,694 | 5,286 |
| DWARF | 18,304 | 4,443 |
| ELF | 17,251 | 9,504 |
| GOBLIN | 8,712 | 2,509 |
| HFEXP37844 E_HUM1 | 233 | 24 |

**`enemy`** (hostile declaration):
| Race | Total | Alive |
|------|-------|-------|
| BIRD_ROC | 6,879 | 6,820 |
| COLOSSUS_BRONZE | 3,836 | 3,794 |
| ETTIN | 1,591 | 1,591 |
| MINOTAUR | 1,350 | 1,236 |
| CYCLOPS | 1,212 | 1,193 |

**`criminal`** (wanted):
| Race | Total | Alive |
|------|-------|-------|
| HUMAN | 389 | 152 |
| REPTILE_MAN | 147 | 64 |
| CAVE_FISH_MAN | 143 | 54 |
| OLM_MAN | 136 | 72 |
| AMPHIBIAN_MAN | 109 | 56 |

**`prisoner`** (currently held):
| Race | Total | Alive |
|------|-------|-------|
| DWARF | 152 | 124 |
| HUMAN | 119 | 73 |
| ELF | 19 | 9 |
| GOBLIN | 8 | 6 |
| DINGO_MAN | 2 | 1 |

**`former prisoner`** (released):
| Race | Total | Alive |
|------|-------|-------|
| DWARF | 1,838 | 401 |
| HUMAN | 1,566 | 262 |
| ELF | 400 | 58 |
| GOBLIN | 59 | 36 |
| HFEXP2636 E_HUM1 | 3 | 0 |

### 10.3 Site Link Type Breakdown

| link_type | Total Links | Unique HFs (All) | Unique HFs (Alive) | Unique Sites | Category |
|-----------|------------|-------------------|---------------------|-------------|----------|
| `home structure` | 682 | 682 | 277 | 35 | Site Presence |
| `occupation` | 632 | 631 | 631 | 98 | Site Presence |
| `seat of power` | 502 | 502 | 502 | 276 | Site Presence |
| `lair` | 252 | 252 | 252 | 233 | Site Presence |
| `hangout` | 4 | 4 | 4 | 4 | Site Presence |
| `home site building` | 2 | 2 | 2 | 2 | Site Presence |

#### By Race (top 5 per site link type)

**`home structure`**:
| Race | Total | Alive |
|------|-------|-------|
| HUMAN | 222 | 81 |
| OLM_MAN | 54 | 32 |
| REPTILE_MAN | 50 | 24 |
| CAVE_FISH_MAN | 47 | 19 |
| AMPHIBIAN_MAN | 36 | 18 |

**`occupation`**:
| Race | Total | Alive |
|------|-------|-------|
| ELF | 285 | 285 |
| HUMAN | 119 | 119 |
| DWARF | 112 | 112 |
| GOBLIN | 111 | 111 |
| REPTILE_MAN | 1 | 1 |

**`seat of power`**:
| Race | Total | Alive |
|------|-------|-------|
| HUMAN | 328 | 328 |
| DWARF | 62 | 62 |
| ELF | 57 | 57 |
| GOBLIN | 24 | 24 |
| REPTILE_MAN | 6 | 6 |

**`lair`**:
| Race | Total | Alive |
|------|-------|-------|
| MINOTAUR | 20 | 20 |
| BIRD_ROC | 20 | 20 |
| ETTIN | 19 | 19 |
| YETI | 19 | 19 |
| CYCLOPS | 14 | 14 |

### 10.4 Race Distribution (All HFs)

| Race | Total | Alive | % of Total | % of Alive |
|------|-------|-------|-----------|-----------|
| HUMAN | 16,280 | 5,325 | 33.7% | 31.2% |
| DWARF | 10,226 | 3,005 | 21.2% | 17.6% |
| ELF | 9,368 | 4,392 | 19.4% | 25.7% |
| GOBLIN | 8,019 | 2,613 | 16.6% | 15.3% |
| KOBOLD | 381 | 90 | 0.8% | 0.5% |
| GIANT_DINGO | 241 | 10 | 0.5% | 0.1% |
| GIANT_COUGAR | 221 | 7 | 0.5% | 0.0% |
| GIANT_JAGUAR | 212 | 6 | 0.4% | 0.0% |
| GIANT_WOLF | 108 | 2 | 0.2% | 0.0% |
| GIANT_LEOPARD | 92 | 4 | 0.2% | 0.0% |
| HFEXP33187 E_HUM1 | 85 | 48 | 0.2% | 0.3% |
| GIANT_TIGER | 85 | 4 | 0.2% | 0.0% |
| REPTILE_MAN | 78 | 34 | 0.2% | 0.2% |
| CAVE_FISH_MAN | 77 | 28 | 0.2% | 0.2% |
| DINGO | 77 | 1 | 0.2% | 0.0% |
| DINGO_MAN | 76 | 19 | 0.2% | 0.1% |
| OLM_MAN | 71 | 37 | 0.1% | 0.2% |
| HFEXP37844 E_HUM1 | 64 | 32 | 0.1% | 0.2% |
| GIANT_HYENA | 63 | 1 | 0.1% | 0.0% |
| COUGAR | 61 | 1 | 0.1% | 0.0% |
| AMPHIBIAN_MAN | 58 | 30 | 0.1% | 0.2% |
| TROLL | 52 | 20 | 0.1% | 0.1% |
| GIANT_CHEETAH | 52 | 0 | 0.1% | 0.0% |
| GIANT | 46 | 46 | 0.1% | 0.3% |
| SERPENT_MAN | 45 | 23 | 0.1% | 0.1% |

### 10.5 Entity Type Distribution

| Entity Type | Count | Description |
|-------------|-------|-------------|
| sitegovernment | 1,890 | Local governments administering individual sites |
| religion | 985 | Religious organizations (temples, cults, faiths) |
| civilization | 810 | Top-level political entities spanning multiple sites |
| nomadicgroup | 419 | Wandering groups without permanent settlement |
| outcast | 358 | Banished individuals forming loose groups |
| guild | 223 | Professional organizations (craftsmen, merchants) |
| performancetroupe | 90 | Traveling entertainment groups |
| migratinggroup | 28 | Groups in transit between settlements |
| militaryunit | 23 | Standing military organizations |
| merchantcompany | 21 | Commercial trading entities |

### 10.6 Site Type Distribution

| Site Type | Total Sites | Owned | Site-Linked HFs (All) | Site-Linked HFs (Alive) |
|-----------|------------|-------|----------------------|------------------------|
| town | 963 | 963 | 955 | 550 |
| fortress | 405 | 405 | 384 | 384 |
| forest retreat | 355 | 355 | 97 | 97 |
| hamlet | 291 | 291 | 195 | 195 |
| monastery | 224 | 35 | 0 | 0 |
| lair | 199 | 0 | 199 | 199 |
| dark fortress | 181 | 181 | 176 | 176 |
| camp | 173 | 0 | 0 | 0 |
| dark pits | 164 | 164 | 1 | 1 |
| mysterious lair | 152 | 152 | 2 | 2 |
| hillocks | 112 | 112 | 4 | 4 |
| mountain halls | 100 | 100 | 0 | 0 |
| cave | 100 | 7 | 0 | 0 |
| fort | 72 | 72 | 0 | 0 |
| castle | 44 | 44 | 0 | 0 |
| mysterious dungeon | 40 | 40 | 0 | 0 |
| shrine | 33 | 0 | 33 | 33 |
| tower | 31 | 31 | 0 | 0 |
| labyrinth | 20 | 0 | 20 | 20 |
| tomb | 9 | 9 | 0 | 0 |
| mysterious palace | 8 | 8 | 0 | 0 |
| vault | 8 | 8 | 0 | 0 |

### 10.7 Ne'er-do-wells by Entity Type

| Link Type | Entity Type | Total Links | Unique HFs | Alive |
|-----------|-------------|------------|------------|-------|
| enemy | sitegovernment | 19,231 | 2,162 | 543 |
| enemy | nomadicgroup | 3,607 | 304 | 219 |
| enemy | civilization | 3,532 | 2,129 | 516 |
| enemy | guild | 33 | 32 | 4 |
| enemy | militaryunit | 31 | 31 | 31 |
| criminal | sitegovernment | 602 | 602 | 265 |
| criminal | civilization | 545 | 545 | 247 |
| former prisoner | sitegovernment | 3,867 | 3,760 | 739 |
| former prisoner | nomadicgroup | 10 | 10 | 0 |
| former prisoner | civilization | 9 | 9 | 2 |
| prisoner | sitegovernment | 294 | 294 | 210 |
| prisoner | civilization | 7 | 7 | 4 |
| prisoner | nomadicgroup | 1 | 1 | 1 |
| former slave | civilization | 27 | 26 | 16 |
| slave | civilization | 8 | 8 | 2 |

### 10.8 entity_populations vs HF-derived
- DF native census total: 1,663,758
- Alive HFs with current member link: 15,373
- Alive HFs with any site link: ~1,668 (sum of alive across site link types, deduplicated)

### 10.9 Site Coverage
- Total sites: 2,154
- Sites with any hf_site_link: 544 (25.3%)
- Sites with owner_entity_id: 1,466 (68.1%)
- Sites with neither: ~644 (29.9%)
