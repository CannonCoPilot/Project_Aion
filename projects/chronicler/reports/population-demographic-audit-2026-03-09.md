# Population Demographic Audit — "the fly of groups" (Revision 2)

**Date**: 2026-03-09 (Session 40, post-JICM)
**Test Entity**: Civ 991 "the fly of groups" (Goblin civilization)
**Related**: SG 1920 "the nightmare of wine", Site 867 "viceankles" (dark fortress)
**DB**: Chronicler, world_id=1 "Tar Thran" (1,684,920 records)
**Revision Note**: Complete re-investigation with corrected population definitions per user's requirements.

---

## Canonical Demographic Terminology

These definitions are CANON for all Chronicler population features. See `population-taxonomy-plan.md` §1.6 for the full specification.

### Aggregate Terms (Overview Tiles, Sidebars)

| Term | Scope | Definition | Expected Size Order |
|------|-------|-----------|-------------------|
| **Population (DF Census)** | Civilization only | Simulated headcount from `entity_populations`. Orders of magnitude larger than tracked HFs. | LARGEST |
| **Residents** | Civilization or Site | Total number of HFs linked (via `hf_entity_links` + `hf_site_links`) to a Civilization **or** a Site. Closest analog to "who lives here." Superset of Citizens. | MIDDLE |
| **Citizens** | Civilization, SG, or Site | Total number of HFs with membership links to a Civilization, a Site Government entity, **or** a Site directly. | SMALLEST of tracked |
| **Members** | Any entity | Generic term for HFs belonging to any entity (non-Civ, non-SG). | Varies |

**Invariant**: Population >> Residents >= Citizens (ALWAYS). If Residents < Citizens, the system is broken.

### Site-Level Classification (Four Categories)

| Category | Definition | Priority |
|----------|-----------|----------|
| **Ne'er-do-well** | Adversarial HF present at site | 1 (highest) |
| **Citizen** | Sentient HF with current SG affiliation, present at site | 2 |
| **Resident** | Structural presence, not Citizen, not Ne'er-do-well | 3 |
| **Visitor** | Event-only presence, no structural tie | 4 (lowest) |

**Denizens** = Citizens + Residents + Visitors. **Total Present** = Denizens + Ne'er-do-wells.

**Lairs**: Site-linked HFs are Residents only; no Citizens count.

**whereabouts data**: Derived from `change_hf_state` events and structural links (XML `cur_site_id` not available in legends exports). See §9 for investigation.

---

## Executive Summary

The demographic display pipeline has **fundamental definition mismatches** and a **critical data gap**:

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| **1** | Citizens definition wrong | **CRITICAL** | Code computes Citizens as ENTITY members (hf_entity_links). Should be PER-SITE: hf_site_links ∪ SG members ∪ position holders |
| **2** | Residents definition wrong | **CRITICAL** | Residents = Citizens + others AT site. Code only uses hf_site_links ∪ whereabouts (whereabouts empty). Missing: SG members without site links, position holders without site links |
| **3** | whereabouts.site_id empty | **CRITICAL** | 0/17,073 living HFs have whereabouts data. `cur_site_id` NOT in XML exports. Phase 2 BLOCKER |
| **4** | Sites tab drops multi-site SGs | **HIGH** | `sg_sites` dict keyed by SG ID overwrites when SG owns >1 site. Loses crossnightmare (12 res) + deathsin (11 res) |
| **5** | Sidebar SG label misleading | **HIGH** | Shows `member_count` (286, includes dead) labeled "citizens". Should show living sentient citizens |
| **6** | SG Overview shows wrong Citizens | **MEDIUM** | SG entity 1920 shows "Citizens: 30" — actually entity membership, not per-site citizens |
| **7** | Civ Overview Residents ≠ Sites tab sum | **MEDIUM** | Overview: 53 residents. Sites tab sum: 30 (23 lost to bug #4) |

---

## 1. Sidebar Inline UI — Civ 991 in Explorer List

**Source**: `/api/civilizations?world_id=1&type=civilization`

**Displayed**: `the fly of groups — Goblin | 37,880 pop | 35 sites`

**Code** (`civilizations.py:704-756`):
```javascript
// Frontend rendering logic:
e.type === 'civilization' ? (e.entity_population || 0).toLocaleString() + ' pop'
: e.type === 'sitegovernment' ? e.member_count.toLocaleString() + ' citizens'
: e.member_count.toLocaleString() + ' members'
```

**Findings**:
- Civ sidebar: Shows `entity_population` (37,880) with "pop" label — **CORRECT**
- SG sidebar: Shows `member_count` with "citizens" label — **WRONG**
  - `member_count` = 286 for SG 1920 (all current members, living AND dead)
  - Should show living sentient citizens only (30 by entity membership; or by user's per-site definition, up to 30)

**ISSUE-5 (HIGH)**: SG sidebar labels raw `member_count` (includes dead) as "citizens"

---

## 2. Full-Page View — Civ 991 Overview Tiles

**URL**: `http://localhost:8080/explorer/entity/991?world_id=1`

| Tile | Value | Source | Status |
|------|-------|--------|--------|
| Race | Goblin | `entities.race` | OK |
| Sites | 35 | `len(site_rows)` from `sites.owner_entity_id` | See §9 |
| Population (DF Census) | 37,880 | `SUM(entity_populations.count)` | OK |
| Citizens | 603 | `COUNT(DISTINCT hf_entity_links.hf_id)` across civ + all child SGs | **WRONG DEFINITION** |
| Residents | 53 | `SUM(fetch_site_residents_batch)` across all 35 sites | **INCOMPLETE** |
| Ruler | ost rainedguts the cloak of tunneling (master) | Position 0 holder | OK |

**How Citizens 603 is computed** (`civilizations.py:282-298`):
```sql
COUNT(DISTINCT hel.hf_id) FILTER (
    WHERE hel.link_type = 'member' AND hf.death_year IS NULL AND SENTIENCE_FILTER
)
FROM hf_entity_links hel ... WHERE hel.entity_id = ANY([991] + child_sg_ids)
```

This counts living sentient current members of the civilization + all 42 child SGs, deduplicated. It's an **entity membership count**, NOT a per-site citizen count.

**Breakdown by entity** (top 5 of 40 entities with members):
| Entity | Name | Type | Living Sentient Members |
|--------|------|------|------------------------|
| 991 | the fly of groups | civilization | 388 |
| 1842 | the hex of sects | sitegovernment | 72 |
| 992 | the wickedness of rams | sitegovernment | 30 |
| 1920 | the nightmare of wine | sitegovernment | 30 |
| 1427 | the brown devil | sitegovernment | 24 |
| ... | (35 more SGs + 3 religions) | ... | ... |
| **TOTAL** | **(deduplicated)** | | **603** |

**ISSUE-1 (CRITICAL)**: The 603 "Citizens" is entity-membership-based. Per user's definition, Citizens should be computed PER SITE as: `hf_site_links(site) ∪ SG_members(site's SG if single-site) ∪ position_holders(site)`. These are fundamentally different aggregations.

**Key statistic**: Of 603 entity-level citizens, only **57** (9.5%) have ANY `hf_site_link` to ANY site. The remaining 546 are "citizens" by entity membership only — they have no physical site association.

---

## 3. Full-Page View — Civ 991 Members Tab

**URL**: `http://localhost:8080/explorer/entity/991?world_id=1#tab=members`

**Table title**: `Members (2765 total, showing 2765)`

**Filter chips**:
| Filter | Count | Description |
|--------|-------|-------------|
| Current | 2,644 | `link_type = 'member'` |
| Former | 121 | `link_type = 'former member'` |
| Alive | 442 | `death_year IS NULL` (includes non-sentient) |
| Dead | 2,323 | `death_year IS NOT NULL` |

**Columns**: Name, Race, Position, Profession, Membership, Citizen, Status

**Note**: Members tab counts are for **direct entity 991 membership only** (not hierarchy-wide). The 388 living sentient direct members ≠ the 603 hierarchy-wide citizens shown in the Overview. This is technically correct but confusing — the Members tab is entity-scoped while Citizens in the overview is hierarchy-scoped.

---

## 4. Full-Page View — Civ 991 Sites Tab

**URL**: `http://localhost:8080/explorer/entity/991?world_id=1#tab=sites`

**Table title**: `Sites (33)`

**Columns**: Site Govt, Site, Structures, Residents, Ruler

**Sites with residents > 0**:
| Site Govt | Site | Residents |
|-----------|------|-----------|
| the nightmare of wine | viceankles | 13 |
| the wickedness of rams | menacetribes | 13 |
| — | riddledaggers | 2 |
| — | scorpionsaves | 1 |
| — | cloistermanor | 1 |
| **Subtotal (Sites tab)** | | **30** |

**MISSING from Sites tab** (due to bug #4):
| Site Govt | Site | Residents |
|-----------|------|-----------|
| the hex of sects (1842) | crossnightmare | 12 |
| the brown devil (1427) | deathsin | 11 |
| **Missing subtotal** | | **23** |

**CORRECT total** (all 35 sites via DB): **53** (matches overview tile)

**Root Cause of Bug #4** (`civilizations.py:174-182`):
```python
# Line 180: Dict keyed by SG ID — OVERWRITES when SG owns >1 site!
sg_sites[s["owner_entity_id"]] = {
    "id": s["id"], "name": s["name"], "type": s["type"],
}
```
- SG 1842 owns BOTH crossnightmare (id=810) AND standhex (id=918). Dict keeps standhex (last alphabetically from `ORDER BY name`), drops crossnightmare.
- SG 1427 owns BOTH deathsin (id=569) AND wickedtimes (id=1471). Dict keeps wickedtimes, drops deathsin.
- Result: 2 sites with 23 total residents silently dropped from the Sites tab.

**ISSUE-4 (HIGH)**: `sg_sites` dict overwrites when a SG owns multiple sites. Fix: change from `dict[sg_id] -> single_site` to `dict[sg_id] -> list[sites]`.

---

## 5. Full-Page View — SG 1920 "the nightmare of wine" Overview

**URL**: `http://localhost:8080/explorer/entity/1920?world_id=1`

| Tile | Value | Notes |
|------|-------|-------|
| Race | Goblin | OK |
| Sites | 1 | Correct — owns only site 867 |
| Citizens | 30 | Entity-membership: living sentient members of SG 1920 |
| Ruler | None | No noble position holder with title |

**No "Population (DF Census)" tile** — correct, SGs don't have entity_populations.
**No "Residents" tile** — the code only shows Residents for `is_civ` entities. **WRONG**: SGs should also show Residents for their governed site(s).

**Members tab**: `Members (406 total, showing 406)` — includes dead members.

**ISSUE-6 (MEDIUM)**: SG overview shows "Citizens: 30" computed as entity membership. Per user's definition, Citizens should be site-based. For a single-site SG, this happens to be equivalent (SG members are Citizens of the site they govern), but the label and concept should be site-based.

---

## 6. Site 867 "viceankles" — Overview and Residents Tab

**URL**: `http://localhost:8080/explorer/site/867?world_id=1`

**Overview metadata**:
| Field | Value |
|-------|-------|
| Type | Dark Fortress |
| Government | the nightmare of wine |
| Structures | 16 |
| Residents | 13 |
| Site-Linked Residents | 13 alive / 13 total |

**Residents Tab** (`http://localhost:8080/explorer/site/867?world_id=1#tab=residents`):

**Table title**: `Residents (13 alive / 13 total)`
**Filter chips**: Alive (13), Dead (0), Occupation (11), Seat Of Power (2)

**All 13 residents**:
| Name | Race | Link Type | Citizen | Profession |
|------|------|-----------|---------|------------|
| eliye graspinghooves | Elf | Occupation | Yes | Clothesmaking |
| kutsmob backspiders | Goblin | Occupation | Yes | Butcher |
| mato bughate | Goblin | Occupation | Yes | Wood Burning |
| mato demonbitten | Goblin | Occupation | Yes | Animalcare |
| nguslu cruelhalls | Goblin | Occupation | Yes | Leatherwork |
| snodub doomnut | Goblin | Occupation | Yes | Woodcutting |
| song poisontrite | Goblin | Occupation | Yes | Engrave Stone |
| stasost deviloak | Goblin | Occupation | Yes | Dissect Fish |
| stasost flyspecks | Goblin | Occupation | Yes | Woodcraft |
| stozu agedjackals | Goblin | Occupation | Yes | Wood Burning |
| strodno stealivy | Goblin | Occupation | Yes | Forge Armor |
| nako liegrowls | Goblin | Seat Of Power | Yes | — |
| nguslu attackcruelty | Goblin | Seat Of Power | Yes | — |

**All 13 are marked as Citizens** (is_citizen = Yes). This is computed via:
```sql
EXISTS (SELECT 1 FROM hf_entity_links hel2
        WHERE hel2.hf_id = hf.id AND hel2.link_type = 'member' AND hel2.entity_id = $owner)
```

---

## 7. Cross-Reference: Who Is at Site 867?

### 7a. HFs with hf_site_links to site 867

13 living HFs (11 occupation + 2 seat of power). All are also members of SG 1920 (confirmed via hf_entity_links). 12 of 13 are also members of civ 991 directly; 1 (eliye graspinghooves, an Elf) is member of SG 1920 only.

### 7b. HFs who are members of SG 1920 (entity-level)

30 living sentient members via `hf_entity_links`. Of these:
- **13** have hf_site_links to site 867 (the ones shown in the Denizens tab)
- **17** are SG members WITHOUT any site link to 867

**The 17 SG members NOT site-linked to 867**:
| hf_id | Name | Race |
|-------|------|------|
| 45026 | alala mergesnarled | ELF |
| 44376 | amxu hexappeared | GOBLIN |
| 46616 | bax hateburns | GOBLIN |
| 46615 | bosa horrorsoaks | GOBLIN |
| 46018 | dostngosp doomsneaks | GOBLIN |
| 19591 | kadol sizzledmine | DWARF |
| 45651 | mato terrorrhymed | GOBLIN |
| 45923 | ngokang malignedshames | GOBLIN |
| 46614 | nguslu shockedcruelty | GOBLIN |
| 44385 | nisa tunneleddove | ELF |
| 38812 | sidaya rivermatches | ELF |
| 46025 | snang endeddemons | GOBLIN |
| 44203 | snodub tanglehated | GOBLIN |
| 46024 | stozu malignedmoist | GOBLIN |
| 46517 | stozu tormentstart | GOBLIN |
| 34548 | utes demonfeeds | GOBLIN |
| 46026 | zolak diamondfell | GOBLIN |

### 7c. Position holders for SG 1920

1 living position holder: **kadol sizzledmine** (hf_id 19591, DWARF)
- Holds positions 0 (since year 149) and 7 (no dates)
- Is member of SG 1920 (already in the 30 above)
- Has NO hf_site_link to site 867
- Also member of entity 1033 (unknown entity)

### 7d. Correct Per-Site Counts Under User's Definitions

**Citizens(867)** = hf_site_links(867) ∪ SG_members(1920, single-site) ∪ position_holders(1920):
- hf_site_links: 13 HFs
- SG members: 30 HFs (includes all 13 site-linked + 17 additional)
- Position holders: 1 HF (kadol, already in SG members)
- **UNION (deduplicated): 30 Citizens**

**Residents(867)** = Citizens(867) ∪ other sentient HFs AT site 867:
- Citizens: 30
- Others at site: **UNKNOWN** — `whereabouts.site_id` is empty for ALL HFs
- **Minimum: 30 Residents** (= Citizens, since no additional data source)

**Comparison with current UI**:
| Metric | Current UI | Correct Value | Gap |
|--------|-----------|--------------|-----|
| Residents (site overview) | 13 | ≥30 | **-17 minimum** |
| Citizens (Denizens tab) | 13 (all marked Yes) | 30 | **-17** |
| Pop (not shown for sites) | N/A | 37,880 (civ-level) | N/A |

**The 17 missing Citizens are SG members without site links** — they should be Citizens and Residents of site 867 under the corrected definitions.

---

## 8. Conceptual Questions: How Do Pop, Citizens, and Residents Relate?

### Q: How does 'Pop' relate to 'Citizens' and to 'Residents'?

**Pop (DF Census)** is a simulated population count from Dwarf Fortress's internal census system, stored in `entity_populations`. It represents the total simulated headcount of a civilization (e.g., 37,880 goblins). It is orders of magnitude larger than tracked Historical Figures because DF only creates HF records for noteworthy individuals, not every simulated creature. Pop exists only for civilizations, not for SGs or individual sites.

Pop >> Residents >> Citizens in count size. Pop tells you the civilization's total simulated strength; Citizens and Residents tell you about individually tracked, named HFs at specific sites.

### Q: How does 'Citizens' relate to 'Residents'?

Citizens is a SUBSET of Residents. Every Citizen is automatically a Resident, but not every Resident is a Citizen.

- **Citizens(site)**: HFs with a formal civic connection to the site — site links, membership in the site's governing entity, or holding positions at the site. These are the "recognized inhabitants."
- **Residents(site)**: All Citizens PLUS any other sentient creatures physically present at the site but lacking formal civic ties — travelers, prisoners, visiting diplomats, hired mercenaries, etc.

### Q: Expected order of Pop, Citizens, Residents by count size?

**Pop >> Residents >= Citizens** — ALWAYS.

- Pop is always largest (simulated, not individually tracked)
- Residents >= Citizens (Residents is a superset of Citizens)
- If Residents < Citizens, the system is broken

### Q: How do the HF sets at 'viceankles' and in 'the nightmare of wine' differ?

**All living HFs "at" viceankles** (what we can discover from the DB):
- 13 via hf_site_links (occupation/seat of power)
- 0 via whereabouts.site_id (empty data)
- Total discoverable: **13**

**All living current members of 'the nightmare of wine'** (SG 1920):
- 30 via hf_entity_links (link_type='member', living, sentient)
- Total: **30**

**Overlap**: All 13 site-linked HFs are also SG members. The 17 additional SG members have no site link to 867 but are members of the entity that governs 867.

**Difference**: The SG membership set (30) is a superset of the site-link set (13). This is expected — many HFs belong to the SG administratively but don't have individual site occupancy records in the legends XML.

### Q: How would you organize and assign these HFs as Residents and Citizens?

Starting from all 30 discoverable living HFs (13 site-linked + 17 SG-member-only):

**Citizens of viceankles** (all 30):
1. 13 HFs with hf_site_links to site 867 → Citizens (site link criterion)
2. 17 additional SG 1920 members → Citizens (SG member criterion, since SG 1920 governs only 1 site)
3. kadol sizzledmine → already counted as SG member; also qualifies via position holder criterion

**Residents of viceankles** (≥30):
1. All 30 Citizens → automatically Residents
2. Any additional sentient HFs physically at the site but not Citizens → **UNKNOWN due to empty whereabouts.site_id**

---

## 9. whereabouts.site_id Investigation

### Data Status

```
Total living HFs:     17,073
With whereabouts:     0 (all have {} empty JSONB)
cur_site_id in XML:   0 occurrences in both legends.xml and legends_plus.xml
```

### Parser Code (`xml_parser.py:1012-1019`)

```python
current_state = _text(hf, "current_state")
if current_state:
    enrichment["whereabouts"] = {
        "state": current_state,
        "site_id": _int(hf, "cur_site_id"),
        "subregion_id": _int(hf, "cur_subregion_id"),
    }
```

The parser correctly handles `cur_site_id` — but the tag simply **doesn't exist** in this world's legends XML export. This appears to be a limitation of the DF legends export format for this world/version.

### Previous Checkpoint Discrepancy

The prior session checkpoint stated "Base legends.xml has 862 `cur_site_id` entries" — this was **incorrect**. Grep confirms 0 occurrences in both XML files.

### Resolution Path

`whereabouts.site_id` is a **Phase 2 MUST** per user requirements. Since the XML doesn't provide it, alternative data sources must be investigated:

1. **DFHack bridge** (Phase 3 territory): Live unit tracking provides current site, but this is fortress-mode only
2. **Inference from hf_site_links**: For legends-only data, site links may be the best available proxy for "at this site"
3. **Event-based inference**: Parse `hf_reached_summit`, `hf_new_pet`, settlement events to infer current location
4. **Accept the gap**: Document that legends-only exports cannot fully populate Residents beyond Citizens, and that the Phase 3 bridge will fill this gap with live data

**This requires user decision**: How to handle whereabouts when the XML export literally doesn't contain the data.

---

## 10. Code Issues — Detailed Analysis

### ISSUE-1 (CRITICAL): Citizens Definition Mismatch

**Location**: `civilizations.py:282-298`

**Current**: Citizens = living sentient members of entity + all child SGs (entity membership via `hf_entity_links`)

**Required**: Citizens(site) = hf_site_links(site) ∪ SG_members(site's SG, if single-site) ∪ position_holders(site)

**Impact**: At civ level, the current "603 Citizens" is a sum of entity memberships deduplicated across the hierarchy. It does NOT represent per-site citizen counts. For the civ overview, the correct approach would be to sum per-site citizen counts across all sites.

For site 867:
- Current: 13 (only hf_site_links, via the Denizens tab is_citizen flag)
- Correct: 30 (includes 17 SG members without site links + kadol the position holder)

### ISSUE-2 (CRITICAL): Residents Definition Incomplete

**Location**: `civilizations.py:73-105` (fetch_site_residents_batch)

**Current**: Residents = whereabouts.site_id UNION hf_site_links (both filtered by sentience)

**Required**: Residents = Citizens(site) ∪ all other sentient HFs AT site

**Impact**: Even if whereabouts were populated, the query doesn't include SG members or position holders who lack site links. 17 of 30 Citizens of site 867 would not be counted as Residents.

### ISSUE-3 (CRITICAL): whereabouts.site_id Empty

**Location**: All HFs have `whereabouts = {}`

**Impact**: The Residents query's first UNION branch (whereabouts) contributes 0 results. Residents = hf_site_links only.

### ISSUE-4 (HIGH): Sites Tab Multi-Site SG Bug

**Location**: `civilizations.py:180`

**Current**: `sg_sites[s["owner_entity_id"]] = {...}` — dict keyed by SG ID

**Impact**: When SG owns 2+ sites, only the last (alphabetically by name) is kept. SG 1842 loses crossnightmare (12 residents), SG 1427 loses deathsin (11 residents). Overview shows correct total (53) because it uses the full site_rows list, but the Sites tab renders from the deduplicated sg_sites dict showing only 33 sites with 30 residents.

### ISSUE-5 (HIGH): Sidebar SG Label

**Location**: Frontend JS rendering

**Current**: `e.member_count.toLocaleString() + ' citizens'` for SGs

**Impact**: SG 1920 shows "286 citizens" in sidebar. Actual living sentient members: 30. The `member_count` is all current members including dead and non-sentient.

### ISSUE-6 (MEDIUM): SG Overview Missing Residents

**Location**: `civilizations.py:508-510`

**Current**: `total_residents` only set when `is_civ == True`

**Impact**: SG entity pages don't show a Residents tile. Per user's definitions, SGs should show Residents for their governed site(s).

---

## 11. Full Data Summary

### Entity 991 — Civ "the fly of groups"

| Metric | Current UI | DB Reality | Correct Per User Definitions |
|--------|-----------|-----------|------------------------------|
| Pop (DF Census) | 37,880 | 37,880 | 37,880 ✓ |
| Sites (overview) | 35 | 35 (via sites.owner_entity_id) | 35 ✓ |
| Sites (tab) | 33 | 35 | 35 (fix multi-site SG bug) |
| Citizens (overview) | 603 | 603 entity members | SUM of per-site citizens (TBD) |
| Residents (overview) | 53 | 53 (hf_site_links only) | SUM of per-site residents (≥ citizens) |

### Entity 1920 — SG "the nightmare of wine"

| Metric | Current UI | DB Reality | Correct Per User Definitions |
|--------|-----------|-----------|------------------------------|
| Sites | 1 | 1 (site 867) | 1 ✓ |
| Citizens | 30 | 30 entity members | 30 per-site citizens ✓ (happens to match for single-site SG) |
| Residents | (not shown) | 13 (hf_site_links) | ≥30 (all Citizens + others at site) |
| Members (tab) | 406 total | 286 current, 120 former | OK (entity membership history) |

### Site 867 — "viceankles"

| Metric | Current UI | DB Reality | Correct Per User Definitions |
|--------|-----------|-----------|------------------------------|
| Residents (overview) | 13 | 13 (hf_site_links) | ≥30 (Citizens + others) |
| Site-Linked | 13 alive | 13 alive | 13 ✓ |
| Citizens (tab column) | 13/13 = Yes | 13 entity members with site link | 30 (includes 17 SG members without links) |

### Sidebar

| Entity Type | Current Label | Current Source | Correct Label | Correct Source |
|-------------|--------------|----------------|---------------|----------------|
| Civilization | `{pop} pop` | entity_populations | `{pop} pop` ✓ | entity_populations |
| Sitegovernment | `{member_count} citizens` | hf_entity_links count (all, incl dead) | `{citizens} citizens` | Living sentient per-site citizens |
| Other | `{member_count} members` | hf_entity_links count | `{member_count} members` | OK |

---

## 12. Recommended Fix Priority

### Phase 2 Blockers (MUST before Phase 3)

1. **Fix Citizens computation**: Change from entity-membership to per-site definition
   - Citizens(site) = hf_site_links(site) ∪ SG_members(SG if single-site) ∪ position_holders(site)
   - Aggregate at civ level by summing per-site (deduplicated)

2. **Fix Residents computation**: Change to Citizens + others AT site
   - Residents(site) = Citizens(site) ∪ sentient HFs with whereabouts.site_id = site
   - Guaranteed: Residents >= Citizens (Citizens is a subset)

3. **Resolve whereabouts.site_id**: Investigate alternatives since XML doesn't have `cur_site_id`
   - USER DECISION REQUIRED: Accept that Residents = Citizens for legends-only data, OR derive whereabouts from events/site_links/bridge

4. **Fix Sites tab multi-site SG bug**: Change `sg_sites` from dict to list-of-sites per SG

5. **Fix sidebar SG label**: Use living sentient citizen count, not raw member_count

### Post-Phase 2 (Lower Priority)

6. SG Overview: Add Residents tile for SGs
7. Clarify Members tab vs Citizens count relationship in UI
8. Add Lair handling: site-linked HFs as Residents only, no Citizens

---

## Appendix: Schema Reference

**Tables involved in population counts**:
- `entity_populations` (race, count, civ_id) — DF census
- `hf_entity_links` (hf_id, entity_id, link_type, position_name) — entity membership
- `hf_site_links` (hf_id, site_id, link_type) — site occupancy
- `hf_position_links` (hf_id, entity_id, position_id, start_year, end_year) — position assignments
- `historical_figures` (whereabouts JSONB, death_year, race) — HF data
- `creature_dictionary` (creature_id, flags JSONB) — sentience flags
- `entity_entity_links` (source_entity_id, target_entity_id, link_type) — civ hierarchy
- `entity_site_links` (entity_id, site_id, link_type) — entity-site ownership
- `sites` (id, owner_entity_id) — site records

**Death convention**: Living HFs have `death_year IS NULL` (not -1).

**Sentience filter** (`civilizations.py:59-65`):
```sql
cd.flags->>'has_any_intelligent_speaks' = 'true'
OR cd.flags->>'has_any_intelligent_learns' = 'true'
OR (cd.creature_id IS NULL AND NOT (hf.race LIKE 'GIANT_%' AND hf.race NOT LIKE '%_MAN'))
```
