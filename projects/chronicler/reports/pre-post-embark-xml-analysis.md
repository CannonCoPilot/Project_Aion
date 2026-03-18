# Pre/Post-Embark XML Diff Analysis & Phase 3 Data Continuity Validation

**Date**: 2026-03-17
**World**: Tar Thran ("The Land of Dawning") — 250 years
**Pre-embark**: `region1-00250-01-01` (world generation complete, before embark)
**Post-embark**: `autosave_1-00250-01-15` (14 days after fortress embark)
**Fortress**: "Silveryclasps" (Site 2154), Entity 4846 "The Halls of Subtlety"
**Parent Civilization**: Entity 1009 "The Sword of Modesty" (Dwarf)

---

## Executive Summary

**CONFIRMED**: Post-embark Legends/Legends Plus XML is **purely additive** — zero records removed, zero IDs reused. Embark dwarves appear as new Historical Figures with full entity/site linkage. The CDM correctly ingests and links all new data. **Historical → Contemporary data continuity is validated.**

---

## 1. Quantitative Deltas

### 1.1 Legends.xml

| Entity Type | Pre-Embark | Post-Embark | Delta | Removals |
|-------------|-----------|-------------|-------|----------|
| Historical Figures | 46,949 | 48,273 | **+1,324** | **0** |
| History Events | 435,559 | 436,455 | **+896** | **0** |
| Sites | 2,153 | 2,154 | **+1** | **0** |
| Entities | 4,810 | 4,847 | **+37** | **0** |
| Artifacts | 8,035 | 8,035 | 0 | 0 |
| Regions | 2,278 | 2,278 | 0 | 0 |
| Written Contents | 37,486 | 37,486 | 0 | 0 |
| Event Collections | 34,858 | 34,861 | **+3** | **0** |

### 1.2 Legends Plus XML

| Entity Type | Pre-Embark | Post-Embark | Delta |
|-------------|-----------|-------------|-------|
| Historical Figures | 46,949 | 48,273 | **+1,324** |
| Entities | 22,104 | 22,142 | **+38** |
| Sites (sub-entries) | 210,323 | 210,839 | **+516** |
| Identities | 2,926 | 2,928 | **+2** |
| Entity Positions | 8,700 | 8,852 | **+152** |
| Structures | 14,993 | 15,058 | **+65** |
| Creatures | 1,879 | 1,879 | 0 |
| Artifacts | 8,243 | 8,243 | 0 |
| Occasions | 127 | 127 | 0 |
| Written Contents | 37,486 | 37,486 | 0 |

### 1.3 ID Contiguity

All new IDs are **contiguously appended** after the pre-embark maximum:

| Type | Pre-Max ID | New ID Range | Contiguous? |
|------|-----------|-------------|-------------|
| HFs | 46,948 | 46,949 – 48,272 | Yes |
| Events | 548,643 | 548,644 – 549,539 | Yes |
| Entities | 4,809 | 4,810 – 4,846 | Yes |
| Sites | 2,153 | 2,154 | Yes |
| Event Collections | 34,857 | 34,858 – 34,860 | Yes |

---

## 2. Embark Dwarves — Confirmed

### 2.1 The Fortress

- **Site 2154**: "Silveryclasps" (type: `fortress`)
- **Created**: Event 549502 — `created site`, Year 250, Second 0
- **Civilization**: Entity 1009 "The Sword of Modesty"
- **Site Government**: Entity 4846 "The Halls of Subtlety" (type: `sitegovernment`)

### 2.2 The 15 Settlers (HF 48258–48272)

All 15 dwarves are **brand new HFs** not present in pre-embark XML. All are alive (death_year = -1). All have `resident` site links to Site 2154 and `member` entity links to both the parent civilization (1009) and the fortress SG (4846), plus a personal religion.

| HF ID | Name | Born | Caste | Religion |
|-------|------|------|-------|----------|
| 48258 | Olin Shaftirons | 202 | F | The Creed of Jade |
| 48259 | Kivish Coalanvil | 205 | M | The Coven of Rock |
| 48260 | Vucar Laborhalls | 201 | M | The Coven of Sprays |
| 48261 | Asmel Roaddrives | 220 | F | The Creed of Jade |
| 48262 | Litast Merchantweather | 218 | F | The Coven of Sprays |
| 48263 | Lor Yellcloister | 228 | M | The Amber Order |
| 48264 | Urdim Startpaddled | 218 | F | The Creed of Jade |
| 48265 | Nil Whisperlancer | 206 | M | The Wooden Faith |
| 48266 | Kogsak Inkthunder | 228 | M | The Creed of Jade |
| 48267 | Momuz Rhythmconstructs | 230 | F | The Creed of Jade |
| 48268 | Stinthad Channelpresent | 199 | F | The Creed of Jade |
| 48269 | Thob Rockfern | 197 | F | The Creed of Jade |
| 48270 | Dumat Squarerope | 213 | F | (Entity 4711) |
| 48271 | Zuglar Assaultirons | 203 | F | (Entity 1698) |
| 48272 | Vabok Bronzerain | 209 | F | The Coven of Sprays |

**Note**: All 15 are embark party members — confirmed by the absence of any pre-embark event history (zero events before embark for all 15). The player used DFHack's `startdwarf` command to set a custom embark party size. The starting number of dwarves is **never fixed at 7** — it is player-configurable via `startdwarf N`.

**Canonical Rule**: Embark dwarves are identified by having **zero pre-embark HF history** — they are created whole cloth at embark time. Any fortress settler with pre-embark events is a pre-existing HF (migrant, prior site resident, visitor, lair inhabitant).

### 2.3 Entity Link Structure

Each settler has exactly **3 entity links**:
1. **Civilization** (Entity 1009 "The Sword of Modesty") — their parent nation
2. **Religion** (various) — their personal religious affiliation
3. **Site Government** (Entity 4846 "The Halls of Subtlety") — the fortress government

Each settler has exactly **1 site link**:
- **Site 2154** "Silveryclasps" — link_type: `resident`

---

## 3. Other New Data (World Simulation for 14 Days)

### 3.1 New HFs by Race (1,324 total)

| Race | Count | Notes |
|------|-------|-------|
| GOBLIN | 693 | Ongoing world births/promotions |
| HUMAN | 521 | Ongoing world births/promotions |
| DWARF | 46 | 15 settlers + 31 world births |
| ELF | 34 | Ongoing world births |
| DINGO_MAN | 8 | Animal-man entity members |
| HFEXP* (6 types) | 18 | Procedurally generated night creatures |
| CHAMELEON_MAN | 2 | |
| PORCUPINE_MAN | 1 | |
| HARE_MAN | 1 | |

**Birth year distribution**: Peak in years 218-231 (recent generations), with a long tail back to year 3. These are HFs that existed in the world simulation but were below the pre-embark export threshold (not yet "notable" enough for legends). The post-embark export after 14 days of active simulation promotes them to legends status.

### 3.2 HFEXP Entries (Night Creatures)

The `HFEXP*` race entries are DF's **procedurally generated creatures** — night trolls, bogeymen, or generated beasts created via experiment (the number after HFEXP is a reference to the generating HF or experiment). They are members of various entities (religions, covens). 18 total across 6 experiment lineages. This is normal DF behavior.

### 3.3 New Events (896 total)

| Event Type | Count | Significance |
|------------|-------|-------------|
| change hf state | 438 | Settlement, migration, movement events |
| add hf entity link | 268 | New organizational memberships |
| add hf hf link | 64 | Family/relationship connections |
| add hf site link | 63 | Site residency assignments |
| reclaim site | 36 | Civilization site management |
| change hf job | 7 | Profession changes |
| hf died | 5 | Deaths during 14-day period |
| tactical situation | 3 | Combat simulation detail |
| squad vs squad | 3 | Combat encounter |
| assume identity | 2 | Identity theft/disguise |
| created site | 1 | Silveryclasps fortress creation |
| attacked site | 1 | Goblin siege |
| agreement formed | 1 | Diplomatic event |
| sneak into site | 1 | Covert operation |
| item stolen | 1 | Theft event |
| artifact given | 1 | Artifact transfer |
| remove hf site link | 1 | Departure from site |

### 3.4 New Entities (37)

All 37 new entities have type `sitegovernment` (appears as "unknown" in legends.xml; enriched in legends_plus). These are site governments created during the 14-day simulation, including Entity 4846 "The Halls of Subtlety" for the player's fortress.

### 3.5 New Event Collections (3)

| EC ID | Type | Details |
|-------|------|---------|
| 34858 | Raid | Sneak + theft at a site (Year 250) |
| 34859 | War | "The Searing War" — goblins vs. a civilization |
| 34860 | Battle | Part of The Searing War — goblin attack + deaths |

---

## 4. CDM Ingestion Validation

### 4.1 Database Verification

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Pre-embark HFs (0–46948) | 46,949 | 46,949 | **PASS** |
| Post-embark HFs (46949+) | 1,324 | 1,324 | **PASS** |
| Total HFs | 48,273 | 48,273 | **PASS** |
| Fortress site (ID 2154) | "silveryclasps" fortress | Found | **PASS** |
| Fortress SG (ID 4846) | "the halls of subtlety" sitegovernment | Found | **PASS** |
| Settler entity links | 45 (15 × 3) | 45 | **PASS** |
| Settler site links | 15 (all → Site 2154, resident) | 15 | **PASS** |
| New HF race distribution | 14 races | 14 races | **PASS** |

### 4.2 Data Integrity

- **Zero orphaned records**: All entity_id and site_id references resolve
- **Zero duplicate IDs**: Contiguous append with no overlap
- **Zero data loss**: Pre-embark data fully preserved in post-embark export
- **Referential integrity**: 0% RI violations (validated during ingestion)

---

## 5. Phase 3 Implications — Data Continuity Assessment

### 5.1 Historical → Contemporary Continuity: CONFIRMED

The pre/post-embark analysis proves the following properties critical for Phase 3:

| Property | Status | Evidence |
|----------|--------|----------|
| **Additive-only exports** | CONFIRMED | 0 removals across all entity types |
| **Contiguous ID space** | CONFIRMED | New IDs appended after pre-embark max |
| **Embark dwarves as HFs** | CONFIRMED | 15 settlers with full linkage (IDs 48258-48272) |
| **Entity/site link integrity** | CONFIRMED | 3 entity links + 1 site link per settler |
| **Event continuity** | CONFIRMED | New events reference both old and new HF IDs |
| **Safe re-ingestion** | CONFIRMED | No data would be lost on re-import |

### 5.2 Implications for Phase 3 Live Data Pipeline

1. **Memory-mapped data can use the same ID space**: In-game unit IDs will map to HF IDs already present in the CDM. The bridge can look up `hf_id` for each fortress dwarf and enrich the existing record.

2. **Incremental XML exports are safe**: If the player exports XML mid-game, it will be a superset of the post-embark data. The ingestion pipeline can use `ON CONFLICT DO UPDATE` to safely merge without data loss.

3. **The CDM schema handles the transition seamlessly**: No schema changes needed for contemporary data. The same tables, same FK relationships, same query patterns work for both historical (worldgen) and contemporary (fortress mode) data.

4. **Bridge data will EXTEND, not REPLACE**: The `chronicler-bridge.lua` data (real-time unit stats, skills, personality, inventory) supplements the XML-derived HF records. The bridge writes to separate columns/tables that the XML ingestion doesn't touch.

### 5.3 Caveats for Phase 3

| Caveat | Risk | Mitigation |
|--------|------|------------|
| **CAV-001**: Not all fortress units may have HF entries | Medium | Some animals/children may not appear in legends; bridge must handle "HF-less" units |
| **CAV-002**: Distinguishing embark party from migrants | Low | Embark dwarves have zero pre-embark event history; migrants have worldgen history. Use event count as classifier. |
| **CAV-003**: Mid-game XML export timing | Low | Additive-only property means any export is safe |
| **CAV-004**: HFEXP creature IDs contain spaces | Low | Race field `HFEXP20691 E_HUM1` has embedded space; ingestion handles this correctly |

---

## 6. Recommendations

### Immediate (Before Phase 3 Stage 3.1)

1. **No action needed**: CDM and ingestion pipeline fully handle pre/post-embark data
2. **Embark party size is variable**: Player uses `startdwarf N` to set any starting count; Phase 3 bridge must not hardcode assumptions about initial population size

### Phase 3 Bridge Design

1. **Unit-to-HF mapping**: Match in-game unit IDs to HF IDs via `df.global.world.history.figures` lookup
2. **New-unit detection**: Watch for new migrants/births whose HF IDs may not yet exist in the CDM; insert new HF stub records on first encounter
3. **Incremental XML re-import**: Add a CLI option `chronicler ingest --incremental` that uses `ON CONFLICT DO UPDATE` for safe mid-game re-ingestion

### Data Architecture

The validated data flow is:

```
WorldGen XML (Pre-Embark) → CDM Base Layer (46,949 HFs)
        ↓ additive
Post-Embark XML → CDM + 1,324 new HFs (settlers, world sim)
        ↓ additive + enrichment
Bridge Live Data → CDM + real-time stats (skills, mood, inventory)
        ↓ additive
Mid-Game XML Re-Export → CDM verification + new world events
```

Each layer only adds data; no layer destroys or overwrites data from a previous layer. This is the ideal architecture for Chronicler's "living record" design goal.

---

*Report generated by Jarvis, 2026-03-17. World data: Tar Thran, 250 years, post-embark day 15.*
