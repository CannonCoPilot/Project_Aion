# Chronicler Population Counting Analysis Report

**Date:** 2026-03-06 (revised 2026-03-07; appendix expanded 2026-03-17)
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

> **Update (2026-03-17):** Stage 3.0 CDM schema fixes (Session 39) added event-derived `resident` and `former resident` link types to `hf_site_links`, dramatically improving site coverage. The original finding below has been superseded.

~~**The `hf_site_links` table contains ZERO records with `link_type = 'resident'`.**~~ **RESOLVED.** As of Stage 3.0, the table now contains **25,643 `resident`** and **24,949 `former resident`** links derived from settlement/migration history events. The original six native XML link types remain (`home structure`: 682, `occupation`: 632, `seat of power`: 502, `lair`: 252, `hangout`: 4, `home site building`: 2), but the event-derived types now account for 96% of all site links.

**26,890 of 48,273** total HFs (55.7%) now have at least one site link (up from 4.3%). Site coverage expanded from 544 sites (25.3%) to **1,965 sites (91.2%)**. Entity membership links still cover more HFs (47,074 / 97.5%), but the gap has narrowed substantially.

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
|-----|------:|-------------|
| Civilization members (`member` link, entity type `civilization`) | 36,776 | HFs affiliated with a civilization |
| Site Government members (`member` link, entity type `sitegovernment`) | 29,560 | HFs affiliated with a site government |
| Site-linked HFs (any `hf_site_links` type) | 26,890 | HFs with physical site attachment (updated post-Stage 3.0) |
| **Citizens** (union: civ members + SG members) | **40,009** | Unique HFs in any political entity |
| **Residents** (union: civ + SG + site-linked) | **~42,500** | Unique HFs with any linkage (updated post-Stage 3.0) |

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

- **Source:** Native XML links from `<site_link>` in `legends.xml` + event-derived `resident`/`former resident` links from post-parse processing (Stage 3.0)
- **Note on native links:** The six native XML link types exist **only in standard `legends.xml`**, NOT in `legends_plus.xml`
- **Meaning:** Physical attachment between named HFs and specific geographic sites
- **Link types in DB:**

| link_type | Total Links | Unique HFs | Alive HFs | Unique Sites | Source |
|-----------|------------|------------|-----------|-------------|--------|
| `resident` | 25,643 | 25,643 | 8,501 | 1,718 | Event-derived |
| `former resident` | 24,949 | 12,567 | 4,287 | 1,327 | Event-derived |
| `home structure` | 682 | 682 | 277 | 35 | Native XML |
| `occupation` | 632 | 631 | 631 | 98 | Native XML |
| `seat of power` | 502 | 502 | 502 | 276 | Native XML |
| `lair` | 252 | 252 | 252 | 233 | Native XML |
| `hangout` | 4 | 4 | 4 | 4 | Native XML |
| `home site building` | 2 | 2 | 2 | 2 | Native XML |

- **Coverage:** 26,890 HFs across 1,965 of 2,154 total sites (91.2%)
- **Gap:** 8.8% of sites have zero site links (primarily camps, vaults); 44.3% of HFs have no site link

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

### Issue 1: ~~CRITICAL~~ **RESOLVED** — No `link_type = 'resident'` in `hf_site_links`

**Problem:** The DF legends XML uses link types `home structure`, `occupation`, `seat of power`, `lair`, `hangout`, and `home site building` — never `resident`. Any code or UI that expects or filters on `link_type = 'resident'` returned 0.

**Resolution (Stage 3.0, 2026-03-09):** Post-parse processing now derives `resident` and `former resident` link types from settlement/migration history events (e.g., `hf settled site`, `hf left site`). The table now contains 25,643 `resident` and 24,949 `former resident` links, covering 1,965 of 2,154 sites (91.2%).

### Issue 2: HIGH — Site links only in `legends.xml`, not `legends_plus.xml`

**Problem:** The `legends_plus.xml` file contains zero `<site_link>` elements inside `<historical_figure>`. Site links are only present in the standard `legends.xml`. The parser correctly extracts them from `legends.xml` (2,075 entries), but this is a DF data format limitation that should be documented.

**Impact:** If future code changes prioritize `legends_plus.xml` for HF data (since it has richer HF fields), site links could be lost unless the merge logic is preserved.

### Issue 3: ~~HIGH~~ **MITIGATED** — Fundamental coverage asymmetry

**Problem:** Entity membership covers 97.5% of HFs but site links covered only 4.3%.

**Mitigation (Stage 3.0):** Site links now cover 55.7% of HFs (26,890 / 48,273) and 91.2% of sites. The remaining gap (97.5% vs 55.7%) reflects HFs who have entity membership but no recorded settlement event — primarily ancient historical figures whose settlement history predates the event log, or nomadic/migrating individuals who never settled permanently.

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

> **Revision note (2026-03-17):** All data refreshed against current DB state (post-Stage 3.0 CDM schema fixes). The `resident` and `former resident` link types, derived from settlement/migration events during Stage 3.0, dramatically expanded site link coverage from 2,066 to 26,890 unique HFs (4.3% → 55.7%). Every table below uses dual **All / Alive** columns.

---

### 10.1 Global Counts

| Metric | All | Alive Only |
|--------|----:|----------:|
| Total Historical Figures | 48,273 | 17,073 |
| HFs with entity links | 47,074 | 16,136 |
| HFs with site links | 26,890 | 9,382 |
| HFs with both entity + site links | 25,691 | 9,331 |
| HFs with neither | ~1,187 | 886 |
| Total entity link records | 193,711 | — |
| Total site link records | 52,666 | — |
| Entities in world | 4,847 | — |
| Sites in world | 2,154 | — |
| DF Native Census (entity_populations) | 1,663,758 | 1,663,758 (alive only by design) |

**Descriptive context:** 97.5% of all HFs have at least one entity link; 55.7% now have at least one site link (up from 4.3% before Stage 3.0). The overlap is high — 95.5% of site-linked HFs also have entity links. The 886 alive HFs with neither link are primarily short-lived event-generated figures or creatures with no political/geographic attachment.

---

### 10.2 Entity Link Type Breakdown

#### Summary Table

| link_type | Total Links | Unique HFs (All) | Unique HFs (Alive) | Unique Entities | Category |
|-----------|----------:|------------------:|--------------------:|----------------:|----------|
| `member` | 92,204 | 44,321 | 15,373 | 2,942 | Demographic |
| `former member` | 69,703 | 28,387 | 8,303 | 2,551 | Demographic |
| `enemy` | 26,434 | 2,169 | 548 | 1,918 | Excluded |
| `former prisoner` | 3,886 | 3,770 | 741 | 335 | Excluded |
| `criminal` | 1,147 | 653 | 287 | 214 | Excluded |
| `prisoner` | 302 | 302 | 215 | 91 | Excluded |
| `former slave` | 27 | 26 | 16 | 7 | Excluded |
| `slave` | 8 | 8 | 2 | 3 | Excluded |

#### 10.2.1 By Entity Type (target entity)

Each entity link connects an HF to an entity of a specific type. This breakdown shows where demographic and adversarial links concentrate.

**`member`** — current political affiliation, by target entity type:

| Entity Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-------------|----------:|------------------:|--------------------:|
| civilization | 36,823 | 36,776 | 10,996 |
| sitegovernment | 29,620 | 29,560 | 10,524 |
| religion | 18,681 | 16,956 | 6,686 |
| performancetroupe | 2,284 | 2,284 | 1,114 |
| nomadicgroup | 2,161 | 2,146 | 1,574 |
| guild | 1,212 | 1,115 | 330 |
| outcast | 781 | 781 | 338 |
| merchantcompany | 528 | 527 | 210 |
| migratinggroup | 100 | 100 | 32 |
| militaryunit | 14 | 14 | 6 |

*Insight: The big 3 (civilization, sitegovernment, religion) account for 93% of member links. Performance troupes and nomadic groups have disproportionately high alive ratios (49% and 73% respectively), suggesting these are younger or more mobile communities.*

**`former member`** — past affiliation, by target entity type:

| Entity Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-------------|----------:|------------------:|--------------------:|
| sitegovernment | 57,145 | 27,874 | 8,116 |
| civilization | 7,823 | 7,649 | 2,697 |
| religion | 3,349 | 2,863 | 1,085 |
| outcast | 642 | 466 | 177 |
| nomadicgroup | 376 | 362 | 117 |
| guild | 158 | 140 | 47 |
| performancetroupe | 110 | 107 | 48 |
| migratinggroup | 53 | 53 | 28 |
| militaryunit | 41 | 41 | 3 |
| merchantcompany | 6 | 6 | 6 |

*Insight: Site governments dominate former membership (82% of links). The 57K SG former-member links reflect DF's pattern of HFs cycling through site governments as they migrate between settlements over a 250-year history. Military units have only 3 alive former members — suggesting units are either recent or their members don't survive long.*

**Adversarial links** — by target entity type (see also §10.7 for full Ne'er-do-well table):

| link_type | Entity Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-----------|-------------|----------:|------------------:|--------------------:|
| enemy | sitegovernment | 19,231 | 2,162 | 543 |
| enemy | nomadicgroup | 3,607 | 304 | 219 |
| enemy | civilization | 3,532 | 2,129 | 516 |
| enemy | guild | 33 | 32 | 4 |
| enemy | militaryunit | 31 | 31 | 31 |
| criminal | sitegovernment | 602 | 602 | 265 |
| criminal | civilization | 545 | 545 | 247 |
| prisoner | sitegovernment | 294 | 294 | 210 |
| prisoner | civilization | 7 | 7 | 4 |
| prisoner | nomadicgroup | 1 | 1 | 1 |
| former prisoner | sitegovernment | 3,867 | 3,760 | 739 |
| former prisoner | nomadicgroup | 10 | 10 | 0 |
| former prisoner | civilization | 9 | 9 | 2 |
| former slave | civilization | 27 | 26 | 16 |
| slave | civilization | 8 | 8 | 2 |

*Insight: Slavery is exclusively a civilization-level phenomenon (no SG or religion slavery). Enemies overwhelmingly target site governments (73% of enemy links), reflecting local rather than civilization-wide hostility.*

#### 10.2.2 By Race (top entries per link type)

**`member`** (current political affiliation) — who belongs to organizations:

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| HUMAN | 35,870 | 16,011 | 5,173 |
| DWARF | 21,284 | 9,869 | 2,814 |
| ELF | 17,493 | 9,336 | 4,384 |
| GOBLIN | 15,470 | 7,922 | 2,590 |
| KOBOLD | 694 | 375 | 90 |
| CAVE_FISH_MAN | 184 | 77 | 28 |
| REPTILE_MAN | 173 | 78 | 34 |
| OLM_MAN | 138 | 71 | 37 |
| AMPHIBIAN_MAN | 121 | 57 | 29 |
| SERPENT_MAN | 98 | 45 | 23 |

*Insight: Humans hold the most member links (39%) but elves have the highest alive ratio (47% vs humans' 32%), reflecting elven longevity. The four civilized races (human/dwarf/elf/goblin) account for 97.6% of all member links. Animal-people (cave fish men, reptile men, olm men, amphibian men) have small but significant presence — these are urban immigrants integrated into human towns.*

**`former member`** (past affiliation) — who has left organizations:

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| HUMAN | 23,694 | 9,688 | 2,199 |
| DWARF | 18,304 | 7,335 | 1,618 |
| ELF | 17,251 | 6,619 | 3,266 |
| GOBLIN | 8,712 | 4,073 | 1,034 |
| HFEXP37844 E_HUM1 | 233 | 46 | 14 |
| HFEXP33187 E_HUM1 | 206 | 36 | 11 |
| HFEXP2636 E_HUM1 | 145 | 31 | 4 |
| KOBOLD | 131 | 78 | 5 |
| REPTILE_MAN | 72 | 42 | 15 |
| CAVE_FISH_MAN | 70 | 50 | 14 |

*Insight: Elves again show the highest alive ratio (49% vs humans' 23%), consistent with their longer lifespans. The HFEXP* entries are DF-generated experimental humanoid races with small populations. Kobolds have very low alive former members (6.4%) — most who leave their civilization die.*

**`enemy`** (hostile declarations) — who threatens civilizations:

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| BIRD_ROC | 6,879 | 22 | 20 |
| COLOSSUS_BRONZE | 3,836 | 16 | 13 |
| ETTIN | 1,591 | 33 | 33 |
| MINOTAUR | 1,350 | 39 | 19 |
| CYCLOPS | 1,212 | 28 | 26 |
| GIANT | 1,155 | 31 | 31 |
| GIANT_COUGAR | 797 | 216 | 7 |
| GIANT_JAGUAR | 746 | 207 | 6 |
| GIANT_DINGO | 670 | 217 | 10 |
| CROCODILE_SALTWATER | 449 | 37 | 5 |

*Insight: Megabeasts are enemies of MANY entities — a single roc averages 313 enemy links (6,879 / 22 unique). This reflects DF's mechanic where each megabeast attack creates an enemy relationship with the targeted entity. Giant animals have high link counts but few survivors (giant cougars: 3.2% alive), suggesting historical threats that have mostly been hunted down. Ettins and giants show 100% alive rate — they are durable survivors.*

**`criminal`** (wanted for crimes):

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| HUMAN | 389 | 243 | 93 |
| REPTILE_MAN | 147 | 78 | 34 |
| CAVE_FISH_MAN | 143 | 76 | 28 |
| OLM_MAN | 136 | 70 | 36 |
| AMPHIBIAN_MAN | 109 | 56 | 28 |
| SERPENT_MAN | 86 | 45 | 23 |
| ANT_MAN | 43 | 22 | 1 |
| GOBLIN | 40 | 31 | 28 |
| RODENT MAN | 14 | 7 | 5 |
| CAVE_SWALLOW_MAN | 12 | 6 | 4 |

*Insight: Animal-people are massively over-represented among criminals relative to their population. Reptile men are 0.2% of all HFs but 12.8% of criminal links — a 64x over-representation. This reflects cultural friction between animal-person immigrants and human town governance. Ant men have only 1 alive criminal out of 22 — nearly all were killed.*

**`prisoner`** (currently held):

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| DWARF | 152 | 152 | 124 |
| HUMAN | 119 | 119 | 73 |
| ELF | 19 | 19 | 9 |
| GOBLIN | 8 | 8 | 6 |
| DINGO_MAN | 2 | 2 | 1 |

*Insight: Dwarves are the most imprisoned race (50% of prisoners), disproportionate to their 21% HF share. The 82% alive rate for dwarf prisoners vs 61% for humans may reflect dwarven fortresses' better prison conditions. Each prisoner link is unique (1:1 link:HF ratio) — you can only be actively imprisoned in one place.*

**`former prisoner`** (released):

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| DWARF | 1,838 | 1,762 | 384 |
| HUMAN | 1,566 | 1,531 | 257 |
| ELF | 400 | 397 | 56 |
| GOBLIN | 59 | 58 | 35 |

*Insight: Dwarves and humans together account for 97% of former prisoners. The low alive rates (dwarves 22%, humans 17%) suggest many former prisoners were captured during wars and have since died. Elves show an even lower 14% alive rate despite their longevity — possibly because elven prisoners were taken in ancient conflicts.*

**`slave`** (currently enslaved):

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| HFEXP2636 E_HUM1 | 3 | 3 | 0 |
| ELF | 2 | 2 | 0 |
| DWARF | 1 | 1 | 1 |
| HFEXP37844 E_HUM1 | 1 | 1 | 1 |
| HFEXP9459 E_HUM2 | 1 | 1 | 0 |

*Insight: Slavery is extremely rare in Tar Thran (8 total links). Only 2 slaves are alive. The experimental humanoid races (HFEXP*) are over-represented, possibly reflecting edge-case DF world generation mechanics.*

**`former slave`** (freed):

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| DWARF | 12 | 11 | 7 |
| ELF | 6 | 6 | 4 |
| HFEXP33187 E_HUM1 | 2 | 2 | 2 |
| GOBLIN | 2 | 2 | 0 |
| HUMAN | 2 | 2 | 2 |

*Insight: Former slaves have a relatively high alive rate (~62%) compared to former prisoners (~22%), suggesting that freed slaves tend to survive longer — possibly because enslavement is a more stable (if oppressive) condition than wartime imprisonment.*

---

### 10.3 Site Link Type Breakdown

> **Stage 3.0 update:** The `resident` and `former resident` link types are now derived from settlement and migration history events during post-parse processing. These represent HFs who have settled at or departed from sites, dramatically expanding site link coverage.

#### Summary Table

| link_type | Total Links | Unique HFs (All) | Unique HFs (Alive) | Unique Sites | Category |
|-----------|----------:|------------------:|--------------------:|------------:|----------|
| `resident` | 25,643 | 25,643 | 8,501 | 1,718 | Derived (events) |
| `former resident` | 24,949 | 12,567 | 4,287 | 1,327 | Derived (events) |
| `home structure` | 682 | 682 | 277 | 35 | Native (XML) |
| `occupation` | 632 | 631 | 631 | 98 | Native (XML) |
| `seat of power` | 502 | 502 | 502 | 276 | Native (XML) |
| `lair` | 252 | 252 | 252 | 233 | Native (XML) |
| `hangout` | 4 | 4 | 4 | 4 | Native (XML) |
| `home site building` | 2 | 2 | 2 | 2 | Native (XML) |

*Insight: The event-derived `resident` and `former resident` types now account for 96% of all site links (50,592 / 52,666). Native XML links (home structure, occupation, etc.) remain valuable as they provide specific role information that the derived links do not.*

#### 10.3.1 By Site Type

**`resident`** — HFs currently settled at sites, by site type:

| Site Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-----------|----------:|------------------:|--------------------:|
| forest retreat | 5,547 | 5,547 | 2,851 |
| hamlet | 4,142 | 4,142 | 767 |
| dark fortress | 3,048 | 3,048 | 503 |
| town | 3,024 | 3,024 | 1,171 |
| fortress | 2,669 | 2,669 | 1,043 |
| dark pits | 2,501 | 2,501 | 512 |
| hillocks | 1,550 | 1,550 | 366 |
| mountain halls | 1,113 | 1,113 | 377 |
| monastery | 900 | 900 | 330 |
| fort | 420 | 420 | 113 |
| castle | 273 | 273 | 58 |
| mysterious lair | 152 | 152 | 152 |
| tower | 131 | 131 | 110 |
| cave | 107 | 107 | 90 |
| mysterious dungeon | 40 | 40 | 40 |
| tomb | 16 | 16 | 8 |
| mysterious palace | 8 | 8 | 8 |
| camp | 2 | 2 | 2 |

*Insight: Forest retreats have the most residents (22%) and the highest alive rate (51%), reflecting elven communities' stability and longevity. Dark fortresses show only 17% alive, reflecting the dangerous goblin realm. Each resident link is 1:1 (link count = unique HFs) — a figure is a current resident of at most one site per link type. Mysterious lairs, dungeons, and palaces show 100% alive — these are active megabeast/creature lairs.*

**`former resident`** — HFs who have left sites, by site type:

| Site Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-----------|----------:|------------------:|--------------------:|
| forest retreat | 7,735 | 3,731 | 2,097 |
| hamlet | 5,527 | 3,171 | 559 |
| dark pits | 2,433 | 1,575 | 406 |
| hillocks | 1,993 | 1,366 | 240 |
| mountain halls | 1,885 | 1,087 | 252 |
| town | 1,834 | 1,632 | 553 |
| fortress | 1,629 | 1,448 | 597 |
| dark fortress | 950 | 904 | 300 |
| monastery | 484 | 471 | 182 |
| fort | 138 | 115 | 66 |
| tower | 132 | 127 | 64 |
| castle | 121 | 107 | 34 |
| cave | 83 | 50 | 48 |
| tomb | 5 | 5 | 4 |

*Insight: Former resident links can be many-to-one (a single HF may have been a former resident at multiple sites). Forest retreats lead again — elves frequently migrate between retreats. Hamlets show high churn (5,527 former resident links for 3,171 unique HFs, averaging 1.7 departures each) but only 18% alive, reflecting the vulnerability of small settlements.*

**Native XML links** — by site type:

| link_type | Site Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-----------|-----------|----------:|------------------:|--------------------:|
| home structure | town | 680 | 680 | 275 |
| home structure | dark fortress | 1 | 1 | 1 |
| home structure | fortress | 1 | 1 | 1 |
| occupation | fortress | 288 | 287 | 287 |
| occupation | dark fortress | 164 | 164 | 164 |
| occupation | town | 103 | 103 | 103 |
| occupation | forest retreat | 77 | 77 | 77 |
| seat of power | hamlet | 194 | 194 | 194 |
| seat of power | town | 176 | 176 | 176 |
| seat of power | fortress | 96 | 96 | 96 |
| seat of power | forest retreat | 20 | 20 | 20 |
| seat of power | dark fortress | 11 | 11 | 11 |
| seat of power | hillocks | 4 | 4 | 4 |
| seat of power | dark pits | 1 | 1 | 1 |
| lair | lair | 199 | 199 | 199 |
| lair | shrine | 33 | 33 | 33 |
| lair | labyrinth | 20 | 20 | 20 |
| hangout | town | 3 | 3 | 3 |
| hangout | hamlet | 1 | 1 | 1 |
| home site building | mysterious lair | 2 | 2 | 2 |

*Insight: Home structures are almost exclusively in towns (99.7%). Occupations concentrate in fortresses (46%) and dark fortresses (26%) — these are active sites where scholars, performers, and mercenaries work. Seats of power spread across hamlets and towns — local administrators of small and medium settlements. Lairs map to dedicated lair sites (79%) plus shrines (13%) and labyrinths (8%).*

#### 10.3.2 By Race (top entries per site link type)

**`resident`** — who currently lives at sites:

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| HUMAN | 8,950 | 8,950 | 2,258 |
| ELF | 6,433 | 6,433 | 3,415 |
| DWARF | 6,070 | 6,070 | 1,599 |
| GOBLIN | 3,517 | 3,517 | 987 |
| DINGO_MAN | 50 | 50 | 8 |
| HFEXP37844 E_HUM1 | 44 | 44 | 14 |
| CAVE_FISH_MAN | 30 | 30 | 9 |
| HFEXP33187 E_HUM1 | 30 | 30 | 10 |
| GIANT | 27 | 27 | 27 |
| REPTILE_MAN | 27 | 27 | 10 |

*Insight: Elves have the highest alive rate among major races (53% vs humans' 25%), consistent with their longevity. Giants show 100% alive — they settle and persist. The four civilized races account for 97.4% of resident links.*

**`former resident`** — who has departed from sites:

| Race | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|------|----------:|------------------:|--------------------:|
| ELF | 8,103 | 3,686 | 2,143 |
| HUMAN | 7,743 | 4,253 | 902 |
| DWARF | 5,869 | 2,798 | 699 |
| GOBLIN | 2,813 | 1,603 | 463 |
| HFEXP37844 E_HUM1 | 69 | 26 | 2 |
| HFEXP33187 E_HUM1 | 57 | 20 | 3 |
| CYCLOPS | 32 | 19 | 18 |
| GIANT | 30 | 15 | 15 |
| ETTIN | 22 | 14 | 14 |

*Insight: Elves lead in former resident links (8,103) — they are the most mobile race, with an average of 2.2 departures per elf (vs 1.8 for humans). Cyclopes, giants, and ettins show very high alive rates (94-100%) as former residents — these are long-lived creatures who outlive the settlements they once inhabited.*

**`home structure`** — who has a designated dwelling (top 10):

| Race | Total | Alive |
|------|------:|------:|
| HUMAN | 222 | 81 |
| OLM_MAN | 54 | 32 |
| REPTILE_MAN | 50 | 24 |
| CAVE_FISH_MAN | 47 | 19 |
| AMPHIBIAN_MAN | 36 | 18 |
| SERPENT_MAN | 34 | 18 |
| GOBLIN | 34 | 28 |
| TROLL | 29 | 9 |
| CROCODILE_SALTWATER | 21 | 3 |
| ANT_MAN | 20 | 1 |

*Insight: Humans account for only 33% of home structures — the remaining 67% are non-human races (predominantly animal-people) who have integrated into human towns. All home structures are in towns (99.7%). Animal-people alive rates range from 5% (ant men) to 59% (olm men), reflecting varying degrees of success in urban integration.*

**`occupation`** — who holds working roles:

| Race | Total | Alive |
|------|------:|------:|
| ELF | 285 | 284 |
| HUMAN | 119 | 119 |
| DWARF | 112 | 112 |
| GOBLIN | 111 | 111 |
| REPTILE_MAN | 1 | 1 |
| AMPHIBIAN_MAN | 1 | 1 |
| CAVE_FISH_MAN | 1 | 1 |
| ELEPHANT_MAN | 1 | 1 |

*Insight: Occupations are 99.8% alive — DF removes occupation links upon death. Elves dominate (45%), primarily as scholars, performers, and tavern visitors at fortresses. The four civilized races account for 99.4% of occupations.*

**`seat of power`** — who holds political authority:

| Race | Total | Alive |
|------|------:|------:|
| HUMAN | 328 | 328 |
| DWARF | 62 | 62 |
| ELF | 57 | 57 |
| GOBLIN | 24 | 24 |
| REPTILE_MAN | 6 | 6 |
| HFEXP33187 E_HUM1 | 6 | 6 |
| AMPHIBIAN_MAN | 5 | 5 |
| CAVE_FISH_MAN | 3 | 3 |
| SERPENT_MAN | 2 | 2 |
| OLM_MAN | 2 | 2 |

*Insight: 100% alive — seats of power are vacated upon death. Humans dominate (65%), consistent with their having the most towns. Animal-people holding seats of power (18 total) indicates political integration into human governance. Demon seats of power (not shown; 5 total) represent demonic overlords of dark pits.*

**`lair`** — megabeast and creature lairs (top 10):

| Race | Total | Alive |
|------|------:|------:|
| BIRD_ROC | 20 | 20 |
| MINOTAUR | 20 | 20 |
| YETI | 19 | 19 |
| ETTIN | 19 | 19 |
| GIANT | 14 | 14 |
| CYCLOPS | 14 | 14 |
| COLOSSUS_BRONZE | 13 | 13 |
| GIANT_COUGAR | 7 | 7 |
| TROLL | 7 | 7 |
| GIANT_JAGUAR | 6 | 6 |

*Insight: 100% alive — dead creatures lose lair links. 252 lair-dwellers across 233 sites (some sites have multiple lairers). The distribution includes 67 distinct creature races, with megabeasts (rocs, minotaurs, ettins, etc.) dominating the top slots but many rarer night creatures and titans holding individual lairs.*

---

### 10.4 Race Distribution (All HFs)

| Race | Total | Alive | % of Total | % of Alive |
|------|------:|------:|----------:|----------:|
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

*Insight: The four civilized races account for 90.9% of all HFs and 89.8% of alive HFs. Elves punch above their weight in the alive column (25.7% vs 19.4% total) due to their longer lifespans. Giant animals have extremely low alive rates (2-5%) — they are mostly historical figures killed in past conflicts. Giants (not "giant animals") show 100% alive — a fundamentally different creature category.*

---

### 10.5 Entity Type Distribution (with Member Counts)

| Entity Type | Count | Members (All) | Members (Alive) | Former Members (All) | Former Members (Alive) |
|-------------|------:|-------------:|----------------:|--------------------:|----------------------:|
| sitegovernment | 1,890 | 29,560 | 10,524 | 27,874 | 8,116 |
| religion | 985 | 16,956 | 6,686 | 2,863 | 1,085 |
| civilization | 810 | 36,776 | 10,996 | 7,649 | 2,697 |
| nomadicgroup | 419 | 2,146 | 1,574 | 362 | 117 |
| outcast | 358 | 781 | 338 | 466 | 177 |
| guild | 223 | 1,115 | 330 | 140 | 47 |
| performancetroupe | 90 | 2,284 | 1,114 | 107 | 48 |
| migratinggroup | 28 | 100 | 32 | 53 | 28 |
| militaryunit | 23 | 14 | 6 | 41 | 3 |
| merchantcompany | 21 | 527 | 210 | 6 | 6 |

*Insight: Civilizations have the most unique members (36,776) but site governments collectively have more links (29,560) — reflecting that many HFs are members of both their civilization AND a local SG. Religions have 17K members with relatively high alive rates (39%), as religious membership persists throughout life. Performance troupes have the highest alive rate (49%) — traveling performers tend to survive. Military units are paradoxically small (14 current members across 23 units) because DF's military unit entities track organizational structures, not individual soldiers.*

---

### 10.6 Site Type Distribution (with Denizen Counts)

| Site Type | Total Sites | Owned | Unique HFs (All) | Unique HFs (Alive) |
|-----------|----------:|------:|------------------:|--------------------:|
| forest retreat | 290 | 290 | 6,350 | 3,329 |
| hamlet | 288 | 288 | 5,960 | 1,285 |
| monastery | 224 | 35 | 1,344 | 505 |
| lair | 180 | 0 | 199 | 199 |
| camp | 173 | 0 | 2 | 2 |
| dark pits | 164 | 164 | 3,202 | 738 |
| mysterious lair | 152 | 152 | 152 | 152 |
| hillocks | 112 | 112 | 2,516 | 557 |
| mountain halls | 100 | 100 | 1,865 | 574 |
| cave | 100 | 7 | 114 | 95 |
| fort | 72 | 72 | 535 | 179 |
| fortress | 49 | 49 | 3,703 | 1,464 |
| castle | 44 | 44 | 380 | 92 |
| mysterious dungeon | 40 | 40 | 40 | 40 |
| town | 34 | 34 | 4,817 | 1,866 |
| shrine | 33 | 0 | 33 | 33 |
| tower | 31 | 31 | 245 | 161 |
| dark fortress | 23 | 23 | 3,943 | 888 |
| labyrinth | 20 | 0 | 20 | 20 |
| tomb | 9 | 9 | 21 | 12 |
| mysterious palace | 8 | 8 | 8 | 8 |
| vault | 8 | 8 | 0 | 0 |

*Insight: Towns have the highest HF density (142 HFs/site) despite having only 34 sites, reflecting their role as major population centers. Fortresses are similar (76 HFs/site). Forest retreats are numerous (290) with moderate density (22 HFs/site) but the highest alive rate (52%). Camps have 173 sites but virtually no HF links (only 2) — these are transient meeting sites. Vaults are the only site type with zero linked HFs. Monasteries are mostly unowned (189 of 224) but still have 1,344 linked HFs — many are pilgrimage or scholarly destinations.*

---

### 10.7 Ne'er-do-wells by Entity Type

| Link Type | Entity Type | Total Links | Unique HFs (All) | Unique HFs (Alive) |
|-----------|-------------|----------:|------------------:|--------------------:|
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

*Insight: Site governments bear the brunt of adversarial relationships — 73% of enemy links, 100% of prisoner links, and 52% of criminal links target SGs. This makes sense: SGs are the local governance entities that encounter threats, imprison offenders, and deal with crime. Civilizations attract fewer enemies directly but more broad-scope threats (megabeasts). Military unit enemies are 100% alive (31/31) — these are active threats to currently deployed units.*

---

### 10.8 DF Census vs HF-derived Counts

| Metric | Count | Coverage |
|--------|------:|---------|
| DF native census total (entity_populations) | 1,663,758 | Full world population including unnamed NPCs |
| Alive HFs with current member link | 15,373 | 0.92% of census — named figures only |
| Alive HFs with any site link | 9,382 | 0.56% of census |
| Alive HFs with both entity + site links | 9,331 | 0.56% of census |
| Total alive HFs | 17,073 | 1.03% of census |

*Insight: The DF census counts ~97x more individuals than the HF system tracks. The HF system captures only named, historically significant figures — the vast majority of a civilization's population consists of unnamed workers, soldiers, and civilians that exist in DF's simulation but are not promoted to historical figure status.*

---

### 10.9 Site Coverage

| Metric | Count | Percentage |
|--------|------:|----------:|
| Total sites | 2,154 | 100% |
| Sites with any hf_site_link | 1,965 | 91.2% |
| Sites with owner_entity_id | 1,466 | 68.1% |
| Sites with both | ~1,420 | ~65.9% |
| Sites with neither | ~143 | ~6.6% |

*Insight: Site link coverage improved dramatically from 25.3% (544 sites) to 91.2% (1,965 sites) after Stage 3.0 added event-derived resident links. The remaining 8.8% without links are primarily camps (173), vaults (8), and a few other uninhabited site types. Sites with owner entities represent established settlements — the 32% without owners include lairs (180), camps (173), shrines (33), labyrinths (20), and other ungovernered locations.*
