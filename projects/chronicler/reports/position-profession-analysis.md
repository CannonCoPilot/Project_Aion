# Position & Profession Analysis Report

**Date**: 2026-03-17
**Context**: Post-Phase 2 population UI enhancement — improving the Profession and Position columns on SG member tables, Site detail pages, and HF detail pages.

---

## 1. Executive Summary

The current profession waterfall (`_profession.py`) misses the single richest data source in the DB: **`change_hf_job` events** (65,241 events covering 32,257 HFs — 67% of all HFs). Additionally, the Position column on SG member tables only shows positions held within the viewing SG entity, leaving it blank for 65% of members who hold positions in religions, guilds, and outcast groups.

This report documents the data landscape and proposes an enhanced system that separates Position (formal organizational role) from Profession (day-to-day occupation) and leverages all available data sources.

---

## 2. Data Source Inventory

### 2.1 `change_hf_job` Events (PRIMARY — Currently Unused)

- **65,241 events** covering **32,257 distinct HFs** (66.8% of 48,273 total)
- **72 distinct job values** including:
  - Crafts: weaver, tanner, potter, mason, carpenter, armorer, weaponsmith, metalcrafter
  - Food/Agriculture: farmer, planter, brewer, cook, cheese_maker, fisherman, butcher
  - Social/Scholar: poet, bard, dancer, philosopher, historian, astronomer, monk, pilgrim
  - Military/Criminal: monster_slayer, beast_hunter, mercenary, scout, ranger, criminal, thief
  - Service: tavern_keeper, doctor, engineer, chemist, merchant, peddler, administrator
  - Generic: "standard" (7,365 events — the default no-profession state, should be excluded)
- **Most authoritative source**: DF's own explicit job assignments, not inferred

### 2.2 `hf_position_links` / `details->'positions'` JSONB

- **14,717 HFs** with position data (30.5% of total)
- **19,658 total position link entries** across all HFs
- These two stores are **identical data** — JSONB is a denormalized copy with pre-resolved names
- **35% of JSONB entries show "Unknown"** (6,435 orphaned position IDs with no `entity_positions` match)

### 2.3 `hf_entity_links` (Entity Memberships)

- 92,204 active memberships, 69,703 former memberships
- Entity types indicating profession: `merchantcompany`, `performancetroupe`, `guild`, `militaryunit`, `nomadicgroup`, `outcast`
- **Note**: `link_type='occupation'` has **zero** entries in the current dataset

### 2.4 Skills Data

- **39,560 HFs** (82%) have skills data
- **12,832 living HFs** (75% of 17,073 living) have skills
- Only profession-worthy skills (craft/labor/scholar/performance) should be used — 88 skills mapped in `SKILL_PROFESSIONS`

### 2.5 Event-Based Reconstruction (Fallback)

| Event Type | Count | Implied Profession |
|------------|-------|--------------------|
| `written_content_composed` | 37,486 | Writer/Scholar |
| `artifact_created` | 7,835 | Artisan |
| `knowledge_discovered` | 2,975 | Scholar |
| `created_structure` | 1,826 | Builder |
| `created_site` | 1,448 | Leader |
| `masterpiece_created_*` | various | Craftsperson |

---

## 3. Coverage Statistics

### 3.1 All HFs (48,273 total)

| Source | HFs Covered | Percentage |
|--------|------------|------------|
| `change_hf_job` events | 32,257 | 66.8% |
| `hf_position_links` (any) | 14,717 | 30.5% |
| `hf_position_links` (current, end_year IS NULL) | — | ~29% |
| Skills data | 39,560 | 82.0% |
| **All sources combined** | **39,919** | **82.7%** |

### 3.2 Living HFs (17,073 total)

| Source | HFs Covered | Percentage |
|--------|------------|------------|
| `change_hf_job` events | 9,387 | 55.0% |
| `hf_position_links` (current) | 4,946 | 29.0% |
| Skills data | 12,832 | 75.1% |
| **All sources combined** | **13,062** | **76.5%** |

### 3.3 Remaining Blanks

~17-23% of HFs have no qualifying data from any source. Example: HF 44268 (Shene Beersapple) — no skills, no positions, no job events, only a `settler` state change event.

---

## 4. Position vs Profession: Distinct Concepts

### 4.1 Position (Formal Organizational Role)

- **What**: A titled role within an entity — lord, alderperson, sacred virtue, doyen, captain
- **Where**: `hf_position_links` → `entity_positions` (with entity context)
- **Coverage**: 14,717 HFs (30.5%)
- **Key issue**: SG member tables currently only show positions held in *that* SG. For SG 1525, only 94 of 267 members (35%) hold positions in entity 1525 itself. 195 members (73%) hold positions in *some* entity — but 101 of those are in religions, guilds, outcast groups, etc.

### 4.2 Profession (Day-to-Day Occupation)

- **What**: What someone does — potter, farmer, bard, mercenary, tavern keeper
- **Where**: `change_hf_job` events (primary), skills (fallback), entity type membership (fallback)
- **Coverage**: 32,257 HFs from job events alone (66.8%)

### 4.3 Why They Must Be Separate

An HF can be a **potter** (profession) who is also the **alderperson of the Handy Guild** (position). These are independent facts. Conflating them into one column loses information.

---

## 5. Case Studies

### HF 33486 — Ato Bucklecooks (Human, alive, SG 1525 member)

- **Positions**: Doyen of guild 3719 (current), formerly Alderperson of guild 3719
- **Job trail**: planter → standard → trapper → tanner
- **Skills**: HAMMER(1800), PLANT(1500), COMEDY(2900)
- **Current waterfall result**: "Comedian" (highest eligible skill IP) — **WRONG**
- **Correct profession**: "Tanner" (latest job event) or "Doyen" (position)
- **No position in SG 1525** — Position column blank on SG member table

### HF 46648 — Cobi Trussgullies (Human, alive, SG 1525 member)

- **Positions**: Representative of outcast 3215 (current)
- **Job trail**: none
- **Skills**: SNEAK(18000), DODGING(18000), CROSSBOW(10000) — military/rogue, no craft skills
- **Entity memberships**: criminal in civ 1007 and SG 2108
- **Current waterfall result**: None (no qualifying skills) — **COULD BE BETTER**
- **Better profession**: "Outcast" (entity type) or "Criminal" (link type)

### HF 43711 — Emtha Couragedeep (Human, alive, SG 1525 member)

- **Positions**: Sacred Virtue of religion 4000 (current)
- **Job trail**: none
- **Skills**: POTTERY(18000, legendary), COMEDY(10500)
- **Current waterfall result**: "Potter" (top craft skill) — **ACCEPTABLE but incomplete**
- **Better result**: Position = "Sacred Virtue (the doctrines of holding)", Profession = "Potter"

### HF 44268 — Shene Beersapple (Human, alive, SG 1525 member)

- **Positions**: none
- **Job trail**: none
- **Skills**: none
- **Events**: only `change_hf_state` (settler, year 237)
- **Current waterfall result**: None — **CORRECT (true blank)**
- **Possible enhancement**: "Settler" from state change event (low confidence)

### HF 38316 — Tadin Wiltheroes (Human, alive, SG 1525 member)

- **Positions**: Alderperson of guild 3485 (current), formerly "Unknown" in religion 1477 (orphaned position_id=14)
- **Job trail**: weaver
- **Skills**: WEAVING(1500), COMEDY(2200)
- **Current waterfall result**: "Comedian" (highest eligible IP) — **WRONG**
- **Correct profession**: "Weaver" (latest job event)
- **Orphaned position**: Religion 1477 only defines position_ids 0-2, but HF holds position_id 14. Event data says it was "sacred healer".

---

## 6. Enhanced Waterfall Design

### 6.1 Profession Waterfall (Revised)

| Priority | Source | Example | Notes |
|----------|--------|---------|-------|
| 1 | Latest `change_hf_job` event | "Tanner", "Tavern Keeper" | Exclude `standard` (means no-profession). Format: underscore→space, title case |
| 2 | Active position title | "Mayor", "Chieftain" | From `details->'positions'` where `end_year IS NULL` |
| 3 | Supernatural: deity, necromancer | "Deity", "Necromancer" | High-signal supernatural flags |
| 4 | Entity-type role | "Merchant", "Performer" | From entity membership type |
| 3b | Supernatural: vampire, werebeast | "Vampire", "Werebeast" | After entity type (may have cover identity) |
| 5 | Craft/labor/scholar skill | "Mason", "Surgeon" | Highest IP among 88 eligible skills |
| 6 | Author/auteur flags | "Scholar", "Auteur" | Boolean flags on HF |
| 7 | Event reconstruction | "Writer", "Artisan" | From artifact_created, written_content_composed, etc. |
| 8 | Ghost flag | "Ghost" | Last resort supernatural |
| 9 | None | — | True blank (~17-23% of HFs) |

### 6.2 Position Display (New)

For SG/entity member tables:
1. Show current position in *this* entity first (if any)
2. If none, show current position in *any* entity with entity name: "Doyen (the Handy Guild)"
3. If no current positions, blank

For HF detail pages:
- Show all current positions with entity context
- Show historical positions (ended) in a separate section

### 6.3 Orphaned Position Resolution

- Mine `entity_position_assignment` events for `details->>'position'` field containing actual position name
- Either: (a) resolve at ingestion time in post-parse pipeline, or (b) add to `_profession.py` batch query
- Option (a) preferred: update `details->'positions'` JSONB during post-parse step to replace "Unknown" entries

---

## 7. Implementation Plan

1. **`_profession.py`**: Add `batch_fetch_latest_jobs()` querying `change_hf_job` events. Insert as Priority 1 in `derive_profession()`.
2. **Position queries**: Update SG member augmentation and site detail queries to fetch cross-entity positions with entity name context.
3. **Orphaned positions**: Add post-parse step or batch query to resolve "Unknown" position names from `entity_position_assignment` events.
4. **Event reconstruction**: Add `batch_fetch_profession_events()` for fallback profession derivation from artifact/writing/knowledge events.
5. **Templates**: Update `entity_detail.html`, `site_detail.html`, `explorer.html` to display both Position and Profession columns.
6. **Validation**: Test against control HFs (33486, 46648, 43711, 44268, 38316).

---

## 8. Appendix: Entity 1525 Position Distribution

**Entity**: "the nourishing league" (sitegovernment), 267 members

**Defined positions** (16): lord, harvest official, baron, chief housekeeper, head chef, road commissioner, chief chamberlain, justiciar, fire official, justice, head butler, head counselor, master of beasts, head executioner, building caretaker, sewer commissioner

**Member position distribution**:
- 94 members (35%) hold positions in entity 1525 itself
- 195 members (73%) hold positions in any entity
- Members hold positions across 60 different entities
- Top entities: self (94), the regal cult/religion (38), the lone utterances/outcast (24), the mellow band/SG (14)
