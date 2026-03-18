# Comprehensive Chronicler Validation Report
**Date**: 2026-03-17 | **World**: Tar Thran (250 years, post-embark day 15) | **DB**: 48,273 HFs, 436,455 events

---

## Part 1: Database Validation — 25/25 PASS

All checks executed against live DB (`jarvis-postgres`, world_id=1).

### A. Core Data Integrity (7/7 PASS)

| # | Check | Actual |
|---|-------|--------|
| 1 | Total HFs | 48,273 |
| 2 | Total events | 436,455 |
| 3 | Total sites | 2,154 |
| 4 | Total entities | 4,847 |
| 5 | Total artifacts | 8,035 |
| 6 | Orphaned HF entity links | 0 |
| 7 | Orphaned HF site links | 0 |

### B. Population & Demographics (6/6 PASS)

| # | Check | Actual |
|---|-------|--------|
| 8 | Entity types | 10 types (SG:1890, Religion:985, Civ:810, Nomadic:419, Outcast:358, Guild:223, Troupe:90, Migrating:28, Military:23, Merchant:21) |
| 9 | Top civ by alive members | Civ 985 "The Nation of Stability" — 1,130 alive |
| 10 | Sentient living HFs | 16,004 |
| 11 | Fortress residents (site 2154) | 15 |
| 12 | Fortress SG members (entity 4846) | 15 |
| 13 | Entity site links | 2,857 |

### C. Post-Parse Pipeline (5/5 PASS)

| # | Check | Actual |
|---|-------|--------|
| 14 | Family links | 129,152 |
| 15 | Supernatural flags | 436 (vampires + werebeasts + necromancers) |
| 16 | HFs with kills | 6,955 |
| 17 | HFs with prominence scores | 48,167 (99.8%) |
| 18 | HFs with whereabouts | 10,776 |

### D. Schema Completeness (4/4 PASS)

| # | Check | Actual |
|---|-------|--------|
| 19 | Entity-entity links (Stage 3.0) | 5,594 |
| 20 | Event entity xref | 877,957 |
| 21 | Relationship supplements | 113,085 |
| 22 | Creature dictionary | 1,879 |

### E. Explorer Features (3/3 PASS)

| # | Check | Actual |
|---|-------|--------|
| 23 | Top event types | change_hf_state(76K), change_hf_job(65K), add_hf_entity_link(47K), written_content(37K), hf_died(31K) |
| 24 | Written content types | 22 types (Poem:20K, Musical:8.8K, Manual:4.4K, ...) |
| 25 | Structures | 1,833 |

### Schema Notes (3 query corrections needed)

- `death_year` uses `NULL` for alive HFs, not `-1`
- Creature dictionary join column is `creature_id`, not `race`
- Events table uses `event_type` column, not `type`

---

## Part 2: Pre/Post-Embark XML Diff — Critical Findings

Full analysis at: `projects/chronicler/reports/pre-post-embark-xml-analysis.md`

### Key Results

| Category | Pre-Embark | Post-Embark | Delta | Removals |
|----------|-----------|-------------|-------|----------|
| HFs | 46,949 | 48,273 | +1,324 | **0** |
| Events | 435,559 | 436,455 | +896 | **0** |
| Entities | 4,810 | 4,847 | +37 | **0** |
| Sites | 2,153 | 2,154 | +1 | **0** |
| Event Collections | 34,858 | 34,861 | +3 | **0** |

### Critical Confirmations

1. **Post-embark XML is PURELY ADDITIVE** — zero removals, zero ID reuse
2. **Embark dwarves appear as new HFs** — 15 settlers (IDs 48258-48272) at fortress "Silveryclasps" (Site 2154)
3. **All 15 settlers confirmed as embark party** — zero pre-embark event history (created whole cloth at embark)
4. **IDs are contiguously appended** — no gaps, no overwrites
5. **CDM ingestion handles seamlessly** — all new data properly linked in DB

### Embark Party Identification Rule (Canonical)

- **Never assume 7 starting dwarves** — player can use `startdwarf N` for any count
- **Embark dwarves**: 0 pre-embark events (created at embark time)
- **Migrants/visitors**: >0 pre-embark events (have worldgen history)

### Fortress Data Structure

- **Site 2154** "Silveryclasps" (fortress) → Entity 4846 "The Halls of Subtlety" (sitegovernment)
- **Parent civ**: Entity 1009 "The Sword of Modesty"
- Each settler has 3 entity links: civ + religion + fortress SG
- Each settler has 1 site link: Site 2154, type=resident

---

## Part 3: Explorer UI Verification — All Post-Embark Data Surfaced

| Check | URL | Status | Content Verified |
|-------|-----|--------|-----------------|
| Fortress site page | `/explorer/site/2154` | 200 (78KB) | "silveryclasps", "fortress", owner links |
| Fortress SG page | `/explorer/entity/4846` | 200 (58KB) | "the halls of subtlety", member names |
| Embark dwarf page | `/explorer/hf/48272` | 200 (70KB) | "vabok bronzerain", civ/religion/SG links |
| Popover API | `/api/popover/entity/4846` | 200 | name, type, race correct |
| Search "silveryclasps" | `/api/search?term=...` | 200 | Found: site 2154 |
| Search "halls of subtlety" | `/api/search?term=...` | 200 | Found: entity 4846 |

---

## Part 4: XML Datamining Coverage Audit — Gaps Identified

### Overall Coverage: ~80%

The CDM captures ~80% of available XML data. The **historical_figures** section has the largest gaps at ~60% field coverage.

### CRITICAL Gaps (High Narrative Value, Large Volume)

| # | XML Field | Tags | Description | Impact |
|---|-----------|------|-------------|--------|
| 1 | `relationship_profile_hf_visual` | 42,444 | Love/respect/trust/loyalty/fear scores toward other HFs | **Essential for social graphs & storytelling** |
| 2 | `vague_relationship` | 34,014 | war_buddy, grudge, jealous_obsession, childhood_friend | **Rich informal social bonds** |
| 3 | `intrigue_plot` | 24,632 | Plots with type, actors, agreements, on_hold status | **Political intrigue narratives** |
| 4 | `associated_type` | 48,137 | HF profession/role type (ADMINISTRATOR, etc.) | **Cheap to add, nearly every HF** |
| 5 | `appeared` | 48,315 | Year HF first appeared in the world | **Cheap to add, nearly every HF** |

### HIGH Priority Gaps

| # | XML Field | Tags | Description |
|---|-----------|------|-------------|
| 6 | `entity_squad_link` | 1,920 | Military squad membership |
| 7 | `current_identity_id` / `known_identity_id` | 5,941 | Identity linkage for disguised HFs |
| 8 | `first_ageless_year` | 539 | When HF became vampire/undead |
| 9 | `site_properties` | ~1,399 | House ownership at sites |
| 10 | Entity `honor` | 609 | Military honors with requirements |
| 11 | Entity `worship_id` | 1,014 | Deity worship links |
| 12 | Entity `weapon` | 1,688 | Military unit preferred weapons |
| 13 | Site `rectangle` | 2,154 | Map tile bounds (Phase 5 visualization) |
| 14 | Site `civ_id` (plus) | 2,630 | Original founding civilization |

### MODERATE Priority Gaps

| # | XML Field | Tags | Notes |
|---|-----------|------|-------|
| 15 | `hf_link.link_strength` | varies | Column EXISTS in CDM but parser never writes it |
| 16 | `relationship_profile_hf_historical` | 8,028 | Historical relationship profiles |
| 17 | `ent_pop_id` | 44,534 | Entity population group membership |
| 18 | `nemesis_id` | 2,371 | Adventurer/nemesis record ID |
| 19 | Artifact `abs_tile_x/y/z` | varies | Exact coordinates |
| 20 | Structure enrichment | varies | dungeon_type, owner_hfid, worship_hfid |

### What's Well-Covered (No Action Needed)

- **Events**: 95% coverage — structured columns + JSONB details catch everything
- **Event collections**: 95% — all combat/war data captured
- **Regions/underground**: 95%
- **Rivers/landmasses/mountains**: 90-100%
- **Art forms**: 95%
- **Identities**: 100%
- **Creature dictionary**: 95%
- **Entity positions/occasions**: Fully captured

---

## Part 5: Recommendations

### Pre-Phase 3 Quick Wins (add to ingestion pipeline)

These can be captured with minimal code changes (add columns + parse lines):

1. **`associated_type`** → `historical_figures.associated_type` column (48K records, trivial)
2. **`appeared`** → `historical_figures.appeared_year` column (48K records, trivial)
3. **`first_ageless_year`** → `historical_figures.first_ageless_year` column (539 records)
4. **`current_identity_id`** → `historical_figures.current_identity_id` FK (862 records)
5. **`hf_link.link_strength`** → actually populate existing `hf_links.strength` column
6. **Site `civ_id`** → `sites.founding_civ_id` column (2,630 records from legends_plus)

**Estimated effort**: 1-2 hours for all 6.

### Phase 3 or Phase 4 (larger structural additions)

7. **`relationship_profile_hf_visual`** → new `hf_relationship_profiles` table (42K+ rows)
8. **`vague_relationship`** → new `hf_vague_relationships` table (34K+ rows)
9. **`intrigue_plot`** → new `intrigue_plots` + `plot_actors` tables (24K+ rows)
10. **`entity_squad_link`** → new `hf_squad_links` table (1,920 rows)
11. **`site_properties`** → new `site_properties` table (~1,399 rows)
12. **Entity `honor`** → new `entity_honors` table (609 rows)
13. **Entity `worship_id`** → `entities.worship_entity_id` column (1,014 rows)
14. **Entity `weapon`** → `entity_weapons` table or JSONB (1,688 rows)

**Estimated effort**: 1-2 days for items 7-10 (high narrative value). Others are lower priority.

### Phase 3 Data Continuity — VALIDATED

The pre/post-embark analysis confirms the data architecture supports seamless Historical → Contemporary continuity:

```
WorldGen XML (Pre-Embark) → CDM Base (46,949 HFs)
        ↓ purely additive
Post-Embark XML → CDM + 1,324 new HFs
        ↓ additive enrichment
Bridge Live Data → CDM + real-time stats
        ↓ additive
Mid-Game XML Re-Export → CDM verification
```

**No schema changes needed for Phase 3.** The bridge will extend existing records, not replace them.

---

## Summary

| Area | Status |
|------|--------|
| Database integrity | **25/25 PASS** |
| Pre/post-embark continuity | **CONFIRMED — purely additive** |
| Embark dwarves in XML | **CONFIRMED — 15 settlers, all new HFs** |
| Explorer UI (post-embark data) | **All pages load, search works, links correct** |
| XML datamining coverage | **~80%** — 20 gaps identified, 6 quick wins, 8 structural additions |
| Phase 3 readiness | **READY** — data continuity validated, CDM handles historical+contemporary |

---

*Generated by Jarvis, 2026-03-17. Supersedes phase-2-validation-walkthrough.md for current state assessment.*
