# Population UI Fixes & Validation Report

**Date**: 2026-03-08
**World**: Tar Thran (ID: 1) — fresh ingestion from region1-post-embark
**Records**: 1,677,998 total (48,273 HFs, 4,847 entities, 2,154 sites)
**Referential integrity**: 0 broken references (473,155 checked)

---

## A. Site Government — Explorer Inline View (explorer.html)

| Fix | Status | Notes |
|-----|--------|-------|
| A1. Alive/Dead/All toggle | DONE | Default: Alive. Three-button toggle with amber highlight |
| A2. "X total, showing Y" updates | DONE | `filterCivMembers()` dynamically updates the title |
| A3. Remove "Load Members" button | DONE | Members auto-load on entity selection |
| A4. Row height ~25px with scrollbar | DONE | `height: 25px`, `max-h-[400px]` with `ex-scroll` |
| A5. Citizen yes/no column | DONE | `is_citizen` computed in SQL via sentience filter |
| A6. Link column (link_type) | DONE | Already existed as "Membership"; renamed header to "Link" |

## B. Site Government — Full View Members Tab (entity_detail.html)

| Fix | Status | Notes |
|-----|--------|-------|
| B1. Alive/Dead/All filter chips | DONE | Pre-existing Current/Former + Alive/Dead chips (identical UX) |
| B2. "showing Y" updates with filter | DONE | `updateMembersTitle()` called on every filter change |
| B3. Remove "Load All" button | DONE | Auto-loads all (limit=10000) on page load |
| B4. Row height ~25px with scrollbar | DONE | `height: 25px`, `py-0.5` padding, `max-h-[600px]` scroll |
| B5. Citizen yes/no column | DONE | `is_citizen` flag from API, rendered as "Yes"/"No" |
| B6. Link column | DONE | Existing "Membership" column shows link_type |

## C. Site — Full View Page (site_detail.html)

| Fix | Status | Notes |
|-----|--------|-------|
| C1. Residents: Citizen column | DONE | `is_citizen` = living + sentient + current member of site owner |
| C2. Residents: Profession column | DONE | Derived from highest-IP skill |
| C3. Residents: Position column | DONE | From hf_position_links LATERAL join |
| C4. Tab reorder | DONE | Structures → Residents → History → Ownership → Properties |
| C5. Details tile (region, co-located) | DONE | Upper-right tile with region link + co-located sites |

## D. Database Re-ingestion

| Step | Status | Notes |
|------|--------|-------|
| D1. Wipe DB | DONE | `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (instant) |
| D2. Re-apply schema.sql | DONE | All 46 tables recreated |
| D3. Re-ingest legends XML | DONE | Both legends + legends_plus, 1,677,998 records |
| D4. Verify ingestion | DONE | 0 referential integrity issues |

## E. Validation Results

### V1: Entity type distribution
| Type | Count |
|------|-------|
| sitegovernment | 1,890 |
| religion | 985 |
| civilization | 810 |
| nomadicgroup | 419 |
| outcast | 358 |
| guild | 223 |
| performancetroupe | 90 |
| migratinggroup | 28 |
| militaryunit | 23 |
| merchantcompany | 21 |

### V2: Top 5 civs — DF Census vs Citizens
| ID | Name | DF Census | Citizens |
|----|------|-----------|----------|
| 991 | the fly of groups | 37,880 | 388 |
| 1021 | the cobalt torments | 30,219 | 376 |
| 985 | the nation of stability | 21,772 | 864 |
| 1015 | the tick of specks | 20,867 | 300 |
| 981 | the sizzling flies | 19,142 | 181 |

### V3: Multi-site SG inflation check
SG 2098 ("the silvery mirrors"): 39 sites, 275 living members — **no inflation** (was previously counted as 275 × 39 = 10,725).

### V4: Sentience filter
- 16,004 sentient by creature_dictionary flags
- 8 with no dictionary entry (fallback filter applies)
- 44 GIANT_* animals correctly excluded
- 17,073 total living HFs

### V5: Top sites by sentient residents
| Site | Type | Residents |
|------|------|-----------|
| squeezelantern | fortress | 130 |
| tinscoured | fortress | 103 |
| cudgelpoint | fortress | 64 |
| siegehealed | town | 45 |
| squashedtalks | town | 29 |

### V6: Page load verification
| Page | Status |
|------|--------|
| Explorer | 200 |
| Civ 991 (the fly of groups) | 200 |
| SG 2098 (the silvery mirrors) | 200 |
| Site 499 (halltop) | 200 |
| Site 672 (squeezelantern, 130 residents) | 200 |
| Religion 1030 | 200 |
| Members API (civ) | 200 |
| Members API (sg) | 200 |
| Site 301 (region tile visible) | 200 |
| Site 49 (co-located tile visible) | 200 |

---

## Regressions

**None identified.** All pages load successfully (HTTP 200). The members API correctly returns `is_citizen`, `profession`, and `position_name` fields. The sentience filter, multi-site inflation fix, and three-metric display all work as designed.

## Files Touched

### Backend (Python)
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/civilizations.py` — added `is_citizen` to members query
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py` — enhanced site residents query (citizen/profession/position), added region + co-located data

### Templates (HTML/JS)
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` — inline members: auto-load, toggle, compact rows, citizen/link columns
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/entity_detail.html` — full view members: auto-load, citizen column, compact rows
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/site_detail.html` — tab reorder, citizen/profession/position columns, region/co-located tile

### World ID
Previous ingestion used world_id=8 (two duplicate worlds). After clean re-ingest, world_id is now **1**.
