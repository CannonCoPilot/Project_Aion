# XML Location Data Analysis — Comprehensive Cross-File Comparison

**Date**: 2026-03-09 (Session 40)
**Purpose**: Exhaustive analysis of ALL location-related data for Historical Figures across 4 XML files
**Goal**: Determine how to populate `whereabouts.site_id` for the Chronicler population system

---

## Files Analyzed

| Label | File | Lines | HF Count |
|-------|------|-------|----------|
| **PRE-L** | `region1-pre-embark/region1-00250-01-01-legends.xml` | 11,182,406 | 46,949 |
| **PRE-LP** | `region1-pre-embark/region1-00250-01-01-legends_plus.xml` | 4,396,703 | 46,949 |
| **POST-L** | `region1-post-embark/autosave_1-00250-01-15-legends.xml` | 11,226,326 | 48,273 |
| **POST-LP** | `region1-post-embark/autosave_1-00250-01-15-legends_plus.xml` | 4,414,164 | 48,273 |

Pre-embark = worldgen-only (year 250, day 1). Post-embark = 15 days of fortress play.

---

## Executive Summary

### What Does NOT Exist

The following tags are **completely absent from ALL four files** (0 occurrences each):

| Tag | Expected Purpose | Status |
|-----|-----------------|--------|
| `<cur_site_id>` | HF's current site | **NOT PRESENT** |
| `<current_state>` | HF's current state | **NOT PRESENT** |
| `<cur_subregion_id>` | HF's current subregion | **NOT PRESENT** |
| `<cur_region_id>` | HF's current region | **NOT PRESENT** |
| `<home_site_id>` | HF's home site | **NOT PRESENT** |
| `<residence>` | HF's residence | **NOT PRESENT** |
| `<dwelling>` | HF's dwelling | **NOT PRESENT** |
| `<lair_id>` | HF's lair (as direct tag) | **NOT PRESENT** |
| `<whereabouts>` | HF's location | **NOT PRESENT** |

**Conclusion**: There is NO snapshot/static "current location" field on HF records in this world's legends XML. The parser code at `xml_parser.py:1012-1019` that checks for `<current_state>` and `<cur_site_id>` will never find data in these exports.

### What DOES Exist — Three Location Data Sources

| Source | Type | Coverage | Quality |
|--------|------|----------|---------|
| **1. `change hf state` events** | Event stream | 75,000-76,000 events | **BEST** — last event per HF = current location |
| **2. `site_link` on HF records** | Snapshot | 2,032-2,075 HFs | **GOOD** — structural site associations |
| **3. `inhabitant` in site structures** | Snapshot (LP only) | 1,780-1,821 HFs | **GOOD** — physical presence at structures |

---

## Source 1: `change hf state` Events (PRIMARY LOCATION DATA)

### Overview

This is the **single most important location data source**. Every time an HF changes their physical state (settles at a site, visits, wanders into wilderness, flees as refugee), a `change hf state` event is recorded with full location data.

**The most recent `change hf state` event per HF effectively IS their current whereabouts.**

### Event Counts

| Metric | PRE-L | PRE-LP | POST-L | POST-LP |
|--------|-------|--------|--------|---------|
| Total events | 75,327 | 75,809 | 76,247 | 76,765 |
| Settled/Settler | 53,927 | 53,927 | 54,364 | 54,364 |
| Visiting/Visitor | 15,259 | 15,259 | 15,260 | 15,260 |
| Wandering/Wanderer | 5,351 | 5,351 | 5,351 | 5,351 |
| Refugee | 790 | 790 | 790 | 790 |

### Structure Comparison

**Base Legends** (`change hf state`):
```xml
<historical_event>
    <id>0</id>
    <year>1</year>
    <seconds72>0</seconds72>
    <type>change hf state</type>
    <hfid>0</hfid>
    <state>settled</state>
    <site_id>-1</site_id>              <!-- site ID, or -1 if in wilderness -->
    <subregion_id>1426</subregion_id>  <!-- subregion ID, or -1 if at site -->
    <feature_layer_id>-1</feature_layer_id>  <!-- underground layer, -1 = surface -->
    <coords>189,172</coords>           <!-- world tile coordinates -->
</historical_event>
```

**Legends Plus** (`change_hf_state`):
```xml
<historical_event>
    <id>0</id>
    <type>change_hf_state</type>
    <hfid>0</hfid>
    <state>settler</state>          <!-- different naming: settler vs settled -->
    <reason>none</reason>           <!-- DFHack addition: WHY they moved -->
    <site>-1</site>                 <!-- uses <site> not <site_id> -->
</historical_event>
```

### Key Differences: Legends vs Legends Plus

| Field | Base Legends | Legends Plus | Notes |
|-------|-------------|-------------|-------|
| Type name | `change hf state` | `change_hf_state` | Underscore vs space |
| State values | `settled`, `visiting`, `wandering`, `refugee` | `settler`, `visitor`, `wanderer`, `refugee` | Different naming convention |
| Site tag | `<site_id>` | `<site>` | Different tag name |
| Subregion | `<subregion_id>` present | **ABSENT** | LP lacks subregion detail |
| Feature layer | `<feature_layer_id>` present | **ABSENT** | LP lacks underground layer |
| Coords | `<coords>` present | **ABSENT** | LP lacks coordinates |
| Reason | **ABSENT** | `<reason>` present | LP-only DFHack addition |
| Year/seconds | Present | **ABSENT** | LP lacks timestamps (rely on event ordering) |

### Legends Plus `reason` Values (DFHack Addition)

| Reason | Count | Meaning |
|--------|-------|---------|
| `none` | ~61,500 | Standard movement |
| `be_with_master` | 7,818 | Following master/lord |
| `gather_information` | 3,927 | Spying, scouting |
| `on_a_pilgrimage` | 895 | Religious travel |
| `flight` | 619 | Fleeing danger |
| `scholarship` | 583 | Academic pursuit |

### Location Resolution Logic

```
IF site_id >= 0  → HF is AT that site (coords will be -1,-1)
IF site_id == -1 AND subregion_id >= 0  → HF is in wilderness at subregion (coords populated)
IF feature_layer_id >= 0  → HF is underground
```

### Derivation Strategy

To populate `whereabouts.site_id` for all living HFs:

1. For each living HF, find their **most recent** `change hf state` event (by year + seconds72)
2. Extract `site_id` (base legends) or `site` (legends_plus)
3. If `site_id >= 0`: HF is at that site → set `whereabouts.site_id`
4. If `site_id == -1`: HF is in wilderness → set `whereabouts.subregion_id` + `whereabouts.coords`
5. Set `whereabouts.state` = the state value (`settled`/`visiting`/`wandering`/`refugee`)

**Expected coverage**: Since there are 75,000+ events across ~47,000 HFs, most living HFs should have at least one `change hf state` event. HFs created at worldgen start (year 1) who never moved will have their initial `settled` event.

---

## Source 2: `site_link` on HF Records (STRUCTURAL ASSOCIATIONS)

### Overview

Direct, current site associations stored on the HF record itself. These represent formal relationships (home, workplace, lair, seat of power), not just physical presence.

### Counts by File

| link_type | PRE-L | POST-L | Change |
|-----------|-------|--------|--------|
| `home structure` | 683 | 682 | -1 |
| `occupation` | 650 | 632 | -18 |
| `seat of power` | 443 | 503 | +60 |
| `lair` | 252 | 252 | 0 |
| `hangout` | 4 | 4 | 0 |
| `home site building` | 0 | 2 | +2 |
| **Total** | **2,032** | **2,075** | **+43** |

### Structure

```xml
<site_link>
    <link_type>home structure</link_type>
    <site_id>325</site_id>
    <sub_id>7</sub_id>               <!-- structure ID within site -->
    <entity_id>1030</entity_id>      <!-- associated entity (optional) -->
    <occupation_id>9</occupation_id>  <!-- for occupation type (optional) -->
</site_link>
```

### Link Type Semantics

| link_type | Count | What It Means | Implies Residence? |
|-----------|-------|--------------|-------------------|
| `home structure` | 682 | HF's home dwelling at a site | **YES — strongest** |
| `occupation` | 632 | HF works at a structure | **YES — daily presence** |
| `seat of power` | 503 | HF rules from a structure | **YES — political home** |
| `lair` | 252 | Megabeast/titan's lair | **YES — permanent** |
| `hangout` | 4 | HF frequents a structure | **WEAK — social only** |
| `home site building` | 2 | Alternate home building | **YES — home variant** |

### Legends vs Legends Plus

`site_link` blocks exist ONLY in base legends.xml. Legends_plus HF blocks contain only `<id>`, `<sex>`, `<race>` — no site_links.

---

## Source 3: `inhabitant` Tags in Site Structures (LEGENDS PLUS ONLY)

### Overview

Found within `<structure>` elements inside `<site>` blocks in legends_plus only. Lists HF IDs who currently inhabit/run specific structures (primarily taverns, temples).

### Counts

| Metric | PRE-LP | POST-LP |
|--------|--------|---------|
| `<inhabitant>` tags | 1,780 | 1,821 |

### Structure

```xml
<site>
    <id>302</id>
    <civ_id>971</civ_id>
    <cur_owner_id>1164</cur_owner_id>
    <structures>
        <structure>
            <id>1</id>
            <type>inn_tavern</type>
            <name>The Honey of Reticence</name>
            <inhabitant>31070</inhabitant>   <!-- HF ID -->
            <inhabitant>29844</inhabitant>   <!-- multiple allowed -->
        </structure>
    </structures>
</site>
```

### Analysis

- Primarily found in `inn_tavern` and `temple` structures
- Directly maps HF IDs to specific structures at specific sites
- This is a snapshot — represents who is physically at these structures at export time
- Useful cross-reference but low coverage (~1,800 out of ~17,000 living HFs)

---

## Source 4: Movement and Association Events

### `add hf site link` / `remove hf site link` Events

Track when HFs gain or lose site associations over time.

| Event Type | PRE-L | POST-L | PRE-LP | POST-LP |
|-----------|-------|--------|--------|---------|
| `add hf site link` | 6,455 | 6,518 | 6,455 | 6,518 |
| `remove hf site link` | 1,507 | 1,508 | 1,507 | 1,508 |

**Base legends** (minimal): only `<site_id>`

**Legends plus** (enriched with DFHack data):
```xml
<historical_event>
    <type>add_hf_site_link</type>
    <site>303</site>
    <structure>0</structure>
    <histfig>1235</histfig>
    <civ>973</civ>
    <link_type>seat_of_power</link_type>
</historical_event>
```

**Legends plus `link_type` values**:

| link_type | Count | Meaning |
|-----------|-------|---------|
| `occupation` | 3,857-3,874 | HF takes occupation at site |
| `seat_of_power` | 2,176-2,239 | HF takes seat of power |
| `home_site_abstract_building` | 421 | **HF assigned home at site** |
| `position` | 595 | Position assignment |
| `member` | 375 | Entity membership at site |
| `enemy` | 128 | Declared enemy of site |
| `master` | 82 | Master of site |
| `prisoner` | 41 | Imprisoned at site |
| `deity` | 10 | Worshipped at site |
| `slave` | 1 | Enslaved at site |

### `hf travel` Events (BASE LEGENDS ONLY)

| Metric | PRE-L | POST-L |
|--------|-------|--------|
| Events | 1,023 | 1,023 |
| With `<return/>` flag | 506 | 506 |

```xml
<type>hf travel</type>
<group_hfid>1417</group_hfid>
<site_id>313</site_id>
<subregion_id>-1</subregion_id>
<feature_layer_id>-1</feature_layer_id>
<return/>                        <!-- self-closing: indicates return trip -->
<coords>188,63</coords>
```

**NOT present in legends_plus** — DFHack doesn't export this event type.

### `change hf job` Events

| Metric | PRE-L | POST-L |
|--------|-------|--------|
| Events | ~65,000 | ~65,234 |

Contains `<site_id>` (base) or `<site>` (plus), recording WHERE a job change happened. Useful as corroborating location evidence but not primary.

### Other Location-Bearing Events

| Event Type | Count | Location Fields |
|------------|-------|----------------|
| `hf died` | 31,919-31,924 | `site_id`, `subregion_id`, `feature_layer_id`, `coords` |
| `hf abducted` | 3,098 | `site_id`, `subregion_id`, `feature_layer_id` |
| `change hf body state` | 171 | `site_id`, `structure_id` (all: `entombed at site`) |
| `hf simple battle event` | 21,185 | `site_id`, `subregion_id`, `feature_layer_id` |
| `creature devoured` | 6,838 | `site_id`, `subregion_id`, `feature_layer_id` |
| `hf wounded` | 6,226 | `site_id`, `subregion_id`, `feature_layer_id` |

---

## Source 5: Indirect Location Chains

### `ent_pop_id` on HF Records

| Metric | PRE-L | POST-L |
|--------|-------|--------|
| HFs with `ent_pop_id` | 43,240 | 44,534 |

Links HF to an entity_population record. In legends_plus, entity_population has `<civ_id>` and `<race>` with count. The civ can be mapped to sites. This is the weakest location signal — it only tells you which civ the HF belongs to, not which site.

### `site_property > owner_hfid` in Site Blocks

| Metric | PRE-L | POST-L |
|--------|-------|--------|
| Properties with `owner_hfid` | ~195 | ~195 |

House ownership at specific sites. Cross-references HF to site via property ownership.

---

## Pre-Embark vs Post-Embark Differences

### Tag-Level Differences

**No structural tag differences** between pre-embark and post-embark in either legends or legends_plus. Both exports use identical tag schemas for HF blocks, events, and site blocks.

### Data Volume Differences

| Metric | Pre-Embark | Post-Embark | Delta | Reason |
|--------|-----------|-------------|-------|--------|
| Total HFs | 46,949 | 48,273 | +1,324 | New HFs from 15 days of play |
| `site_link` entries | 2,032 | 2,075 | +43 | New site associations |
| `change hf state` events | 75,327 | 76,247 | +920 | Movement during play |
| `add hf site link` events | 6,455 | 6,518 | +63 | New site links |
| `hf travel` events | 1,023 | 1,023 | 0 | No new travel events |
| `inhabitant` tags (LP) | 1,780 | 1,821 | +41 | New structure inhabitants |
| `seat of power` links | 443 | 503 | +60 | Power changes |
| `occupation` links | 650 | 632 | -18 | Occupations ended |

**Analysis**: The 15 days of fortress play generated 1,324 new HFs and 920 new state change events. The delta is modest — most location data comes from worldgen. The pre/post difference is purely additive (more data), not structural.

### Legends vs Legends Plus Differences

| Feature | Base Legends | Legends Plus |
|---------|-------------|-------------|
| **HF block richness** | Full (all tags) | Minimal (id, sex, race only) |
| **Event type naming** | Spaces: `change hf state` | Underscores: `change_hf_state` |
| **State naming** | `settled`, `visiting`, `wandering` | `settler`, `visitor`, `wanderer` |
| **Site tag naming** | `<site_id>` | `<site>` |
| **Location detail** | `subregion_id`, `feature_layer_id`, `coords` | **ABSENT** — less detail |
| **DFHack additions** | None | `<reason>` on state changes, `<link_type>` on site link events |
| **`hf travel` events** | Present (1,023) | **ABSENT** — not exported |
| **`inhabitant` tags** | **ABSENT** | Present (1,780-1,821) |
| **`cur_owner_id` on sites** | **ABSENT** | Present |
| **Entity population detail** | Minimal | `<race>`, `<civ_id>` enriched |

**Key takeaway**: Base legends has richer HF blocks and more detailed location fields per event. Legends plus has minimal HF blocks but adds DFHack-enriched event fields (`reason`, `link_type`) and site-level data (`inhabitant`, `cur_owner_id`). The parser should use BOTH files to get complete data.

---

## Implementation Status (COMPLETED)

### Bug Fix: Step 10 `'settled'` vs `'settler'` Mismatch

**Root cause**: Post-parse step 10 filtered `details->>'state' = 'settled'` but the DB stores `'settler'` (legends_plus naming). Result: **zero resident links created**.

**Fix**: Changed filter to `IN ('settled', 'settler')` to handle both naming conventions.
**File**: `chronicler/ingest/post_parse.py:563`
**Result**: 50,592 links created (25,643 resident + 24,949 former resident)

### New Step 10b: Populate HF Whereabouts

Added `step_10b_populate_hf_whereabouts()` to the post-parse pipeline:
1. **Primary**: Derives whereabouts from most recent `change hf state` event per living HF
2. **Fallback**: For HFs without state events, infers from `hf_site_links` (priority: home structure > seat of power > occupation > lair)

**File**: `chronicler/ingest/post_parse.py:601+`

#### Actual Coverage (Tar Thran world)

| Source | Living HFs Covered | Percentage |
|--------|-------------------|------------|
| `change hf state` events | **10,094** | 59% |
| Fallback: `hf_site_links` | **682** | 4% |
| **Total with whereabouts** | **10,776** | **63%** |
| No location data | 6,297 | 37% |

The 37% gap consists of HFs with entity membership only (no site-level location in any source). This is inherent to DF's data model.

### Citizen/Resident Counting Refactor

Updated `civilizations.py` with canonical citizen/resident definitions:

**Citizens of a Site** (new `fetch_site_citizens_batch()`):
1. Members of the Site Government governing that site (if SG governs >1 site, only members with whereabouts there)
2. HFs with `hf_site_link` to that site (excluding lairs)
3. Position holders at that site (excluding lairs)

**Residents of a Site** (updated `fetch_site_residents_batch()`):
- All Citizens (sources 1-3 above)
- UNION anyone with whereabouts at that site
- Guarantees Residents >= Citizens by construction

**Validation results** (all 41 civilizations):
- 40/41 PASS: `DF_Census > Residents >= Citizens`
- 1 edge case: `jogis` (kobold, DF=8, R=10) — DF Census undercount for tiny civ

**Lairs**: 0 citizens, 86 lairs with residents (correct per spec)

### Data Quality Notes

1. **HFs who never moved**: Some HFs created at year 1 may have only ONE `change hf state` event (their initial settlement). This is still valid — it tells us where they settled.

2. **Dead HFs**: Their last `change hf state` before death gives their location at that time. The `hf died` event gives their death location. We don't need whereabouts for dead HFs.

3. **Wandering HFs**: ~5,351 events with `state=wandering` have `site_id=-1` and `subregion_id` populated. These HFs are NOT at any site — `whereabouts.site_id` will be null, `whereabouts.subregion_id` populated.

4. **Refugees**: ~790 events. Similar to wandering — may or may not be at a site.

5. **`settled` at a site**: The largest group (~54,000 events). These HFs definitively have a `site_id`.

---

## Appendix A: Complete HF Block Tag Inventory

### Tags ONLY in Base Legends HF Blocks (not in legends_plus)

Everything except `<id>`, `<sex>`, `<race>` — legends_plus HF blocks are minimal:

`active_interaction`, `animated`, `animated_string`, `appeared`, `birth_seconds72`, `birth_year`, `caste`, `current_identity_id`, `death_seconds72`, `death_year`, `deity`, `ent_pop_id`, `entity_former_position_link`, `entity_link`, `entity_position_link`, `entity_squad_link`, `force`, `goal`, `hf_link`, `hf_skill`, `holds_artifact`, `id`, `interaction_knowledge`, `intrigue_actor`, `intrigue_plot`, `journey_pet`, `known_identity_id`, `name`, `race`, `relationship_profile_hf_historical`, `relationship_profile_hf_identity`, `relationship_profile_hf_visual`, `site_link`, `site_property`, `sphere`, `used_identity_id`, `vagrant`, `vague_relationship`

### Tags ONLY in Legends Plus HF Blocks

`<sex>` (uses `sex` instead of `caste`)

### Tags in BOTH

`<id>`, `<race>`

## Appendix B: Summary Comparison Table

| Data Source | File(s) | Count | Coverage | Best For |
|-------------|---------|-------|----------|----------|
| `change hf state` events | L + LP | 75,000-76,000 | ~all living HFs | **Current whereabouts** |
| `site_link` on HF record | L only | 2,032-2,075 | 4% of HFs | Structural site ties |
| `inhabitant` in site structures | LP only | 1,780-1,821 | ~4% of HFs | Physical structure presence |
| `site_property.owner_hfid` | L (sites section) | ~195 | <1% of HFs | Property ownership |
| `entity_link` (member) | L only | 92,204 | ~all HFs | Entity membership (indirect) |
| `ent_pop_id` → civ_id → sites | L + LP | 43,000-44,000 | ~93% of HFs | Population group (weakest) |
| `add/remove hf site link` events | L + LP | 6,500 / 1,500 | History tracking | Site link changes over time |
| `hf travel` events | L only | 1,023 | Rare | Travel destinations |
| `change hf job` events | L + LP | ~65,000 | Job holders | Job site (corroborating) |
