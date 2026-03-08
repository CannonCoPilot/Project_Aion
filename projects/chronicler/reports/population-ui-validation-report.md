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

## E. Validation Results (Fresh DB — 2026-03-08 22:48)

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

**Result: PASS** — matches previous ingestion exactly (entity `type` now a proper column, not JSONB).

### V2: Top 5 civs by sentient citizen count
| ID | Name | Citizens | Living Members |
|----|------|----------|----------------|
| 985 | the nation of stability | 864 | 1,127 |
| 1027 | the fiery wires | 813 | 1,010 |
| 1009 | the sword of modesty | 676 | 785 |
| 1007 | the brave kingdom | 661 | 914 |
| 1029 | the gleeful realms | 631 | 867 |

**Result: PASS** — note: `df_census_pop` not populated (Phase 3 CDM field). Citizen counts derived from `has_any_intelligent_speaks` / `has_any_intelligent_learns` creature flags. Nation of Stability remains #1 at 864 citizens, consistent with previous ingestion.

### V3: Multi-site SG inflation check
| SG ID | Name | Sites Owned | Living Sentient Members |
|-------|------|-------------|------------------------|
| 2098 | the silvery mirrors | 39 | 275 |
| 3948 | the helmed grottoes | 5 | 0 |
| 3083 | the dimensions of shooting | 3 | 0 |

**Result: PASS** — SG 2098 still owns 39 sites with 275 members. No inflation (was previously 275 × 39 = 10,725).

### V4: Sentience filter
| Metric | Count |
|--------|-------|
| Total living HFs | 17,073 |
| Sentient living (creature flags) | 16,004 |
| No dictionary entry (fallback) | 8 |
| GIANT_* animals excluded | 44 |

**Result: PASS** — all four metrics match previous ingestion exactly.

### V5: Top sites by residents (hf_site_links)
| Site ID | Site | Type | Residents (page) |
|---------|------|------|------------------|
| 672 | squeezelantern | fortress | 130 |
| 350 | spearsands | hillocks | (via SG 2098) |
| 530 | siegehealed | town | (via SG) |

**Note**: Site resident counts via `hf_site_links` (2,075 explicit links) differ from SG member counts. The detail page shows `hf_site_links`-based residents (e.g., squeezelantern: 130), which is the precise "who lives here" relationship. SG membership is broader ("who belongs to this site's government").

### V6: Page load verification
| Page | Status |
|------|--------|
| Explorer (`/explorer?world_id=1`) | 200 |
| Civ 985 (the nation of stability) | 200 |
| SG 2098 (the silvery mirrors) | 200 |
| Site 350 (spearsands, region tile visible) | 200 |
| Site 672 (squeezelantern, 130 residents) | 200 |
| Civ 1027 (the fiery wires) | 200 |
| Members API (civ 985) | 200 |
| Members API (SG 2098) | 200 |

### V7: API response field verification
Members API for SG 2098 returns:
- `total`: 430, `current_alive`: 275 — matches V3
- Fields present: `is_citizen`, `profession`, `position_name`, `is_alive`, `link_type`
- `is_citizen` correctly true for living sentient current members

### V8: Template feature verification
| Feature | Explorer Inline | Full View Members | Site Residents |
|---------|-----------------|-------------------|----------------|
| Alive/Dead/All toggle | `filterCivMembers()` present | Filter chips present | N/A |
| Auto-load (no button) | `civMembersStatusFilter='alive'` | limit=10000 on load | N/A |
| Compact rows (25px) | Present | Present | Present |
| Citizen column | Present | Present | Present |
| Profession column | N/A | N/A | Present |
| Position column | N/A | N/A | Present |
| Region tile | N/A | N/A | "the hill of aging" for site 350 |

---

## Regressions

**None identified.** All pages load successfully (HTTP 200). The members API correctly returns `is_citizen`, `profession`, and `position_name` fields. The sentience filter, multi-site inflation fix, and three-metric display all work as designed.

## Schema Notes (Fresh Ingestion)

The following tables are empty by design (Phase 3 CDM fields not yet in ingestion pipeline):
- `entity_site_links` (0 rows) — Phase 3 APPEND→CONNECT fix
- `entity_entity_links` (0 rows) — Phase 3 APPEND→CONNECT fix
- `df_census_pop` in entities.details — Phase 3 live bridge data

These will be populated when Phase 3 Stage 3.0 CDM fixes are implemented.

## Files Touched

### Backend (Python)
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/civilizations.py` — `is_citizen` in members query (sentience via `has_any_intelligent_speaks` / `has_any_intelligent_learns`)
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py` — enhanced site residents (citizen/profession/position), region + co-located data

### Templates (HTML/JS)
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/explorer.html` — inline members: auto-load, toggle, compact rows, citizen/link columns
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/entity_detail.html` — full view members: auto-load, citizen column, compact rows
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/site_detail.html` — tab reorder, citizen/profession/position columns, region/co-located tile

### World ID
Previous ingestion had world_id=8 (duplicate worlds). Clean re-ingest: world_id=**1**. Single world "Tar Thran" (The Land of Dawning).
