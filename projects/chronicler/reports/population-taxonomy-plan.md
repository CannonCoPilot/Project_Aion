# Population Taxonomy & Ne'er-do-wells Plan (v2)

**Date**: 2026-03-16
**Status**: DRAFT v2 — revised per user feedback
**Scope**: Phase 2 validation enhancement (pre-Phase 3)
**Affects**: Site Government pages, Site pages, HF pages

---

## 1. Background & Findings

### 1.1 "Resident" Is Not a Native XML Tag

The `resident` and `former resident` link types in `hf_site_links` are **entirely derived** during ingestion. Post-parse Step 10 (`step_10_materialize_hf_settlement_links` in `chronicler/ingest/post_parse.py:537-599`) mines `change_hf_state` events where `state = 'settled'/'settler'`:
- Most recent settlement site → `link_type = 'resident'`
- All prior settlement sites → `link_type = 'former resident'`

The **native XML `<site_link>` types** are:

| Native XML Value | Count (Tar Thran) | Meaning |
|---|---|---|
| `home structure` | 682 | Has a home in a specific building |
| `occupation` | 632 | Works at a site structure |
| `seat of power` | 503 | Rules from a structure |
| `lair` | 252 | Monster/vampire lair |
| `hangout` | 4 | Informal presence |
| `home site building` | 2 | Variant of home structure |

### 1.2 Presence Determination — Three Data Sources

To determine whether an HF is "at" a site, three data sources exist with different coverage:

| Source | HFs at Site 621 | What It Captures |
|---|---|---|
| `change_hf_state` (most recent event at site) | **333** | Settlers (159), visitors (31), plus historical states |
| `hf_site_links` (any link type) | **290** | Structural ties: resident, home structure, seat of power, occupation, lair, hangout |
| `whereabouts` JSONB column | **82** | Pre-computed last known location (incomplete) |

**Critical finding**: `hf_site_links` **misses all visitors**. The 31 visitors at site 621 have zero site_link entries — event mining is the only way to find them.

**The `whereabouts` column** already stores last-known state per HF with two source types:
- Event-derived: `{"year": 216, "state": "visitor", "reason": "gather_information", "site_id": 621}`
- Inferred from site links: `{"state": "inferred", "source": "home structure", "site_id": 621}`

### 1.3 Global State Distribution (`change_hf_state` events)

| State | Count | Meaning |
|---|---|---|
| settler | 54,364 | Settled at a site (long-term) |
| visitor | 15,260 | Visiting a site (transient) |
| wanderer | 5,351 | In the wilderness (site_id = NULL) |
| refugee | 790 | Fleeing to a site |

Visitor reasons: `none` (10,438), `gather_information` (3,927), `on_a_pilgrimage` (895).

### 1.4 Research Subjects

Five HFs investigated to validate the taxonomy:

| HF | ID | SG 1525 Link | Site 621 Link | Whereabouts | Category |
|---|---|---|---|---|---|
| Sekel Greenblows | 32606 | None | None | visitor at 621, Y216 (gather_info) | **Visitor** |
| Stral Mergedwaves | 39712 | Former member | None | visitor at 1366, Y227 (pilgrimage) | **Not present** (elsewhere) |
| Abo Evenedtreaty | 38312 | Enemy | Home structure | wanderer, no site, Y237 (flight) | **Ne'er-do-well** (structural presence despite wandering) |
| Mebas Twistedclustered | 43691 | Criminal | Home structure | inferred from home structure at 621 | **Ne'er-do-well** |
| Gasom Peekedchurch | 33516 | None | Home structure (entity 4373) | wanderer, no site, Y214 (flight) | **Ne'er-do-well** (structural presence despite wandering) |

**Key observations**:
- **Stral** is a former member with NO presence at site 621 — she left and is now visiting site 1366. She should NOT appear in any Pocketdumplings tab.
- **Sekel** has NO site links but IS a visitor via `change_hf_state` — only event mining captures her.
- **Gasom & Abo** have home structures (structural presence) but their most recent movement event shows them wandering in wilderness. They still have homes at the site — they are structurally present but temporarily absent. For our purposes, they retain their structural category.

### 1.5 Site 621 (Pocketdumplings) Full Picture

| Data Source | Link/State Type | Count |
|---|---|---|
| hf_site_links | resident | 185 |
| hf_site_links | former resident | 60 |
| hf_site_links | home structure | 45 |
| hf_site_links | seat of power | 11 |
| hf_site_links | occupation | 5 |
| change_hf_state (last event at site) | settler | 159 |
| change_hf_state (last event at site) | visitor | 31 |

---

## 1.6 Standardized Demographic Terminology

All planning documents, reports, code comments, and UI labels must consistently use these terms:

### Aggregate Terms (Overview Tiles, Sidebars, Summary Statistics)

| Term | Scope | Definition |
|------|-------|-----------|
| **Population (DF Census)** | Civilization only | Simulated headcount from `entity_populations`. Orders of magnitude larger than tracked HFs. |
| **Residents** | Civilization or Site | Total number of HFs linked (via `hf_entity_links` + `hf_site_links`) to a Civilization **or** a Site. Closest analog to "who lives here." Superset of Citizens. |
| **Citizens** | Civilization, SG, or Site | Total number of HFs with membership links to a Civilization, a Site Government entity, **or** a Site directly. Subset of Residents. |
| **Members** | Any entity | Generic term for HFs belonging to any entity. Used for non-Civilization, non-SG entities (guilds, religions, performance troupes, etc.). |

**Invariant**: Population >> Residents >= Citizens (ALWAYS). If Residents < Citizens, the system is broken.

### Site-Level Classification (Denizens Tab, Ne'er-do-wells Tab)

Each HF present at a site is classified into exactly one of four categories:

| Category | Definition | Priority |
|----------|-----------|----------|
| **Ne'er-do-well** | HF with adversarial relationship to the site's governing entity AND present at the site | 1 (highest) |
| **Citizen** | Sentient HF with current civic affiliation to the SG who is present at the site | 2 |
| **Resident** | HF with structural presence at the site who is not a Citizen and not a Ne'er-do-well | 3 |
| **Visitor** | HF present via event only, with no structural tie and no SG affiliation | 4 (lowest) |

**Groupings**:
- **Denizens** = Citizens + Residents + Visitors (non-adversarial present HFs; shown in Denizens tab)
- **Total Present** = Denizens + Ne'er-do-wells
- Aggregate "Residents" (overview) ≈ Denizens (site-level). The naming overlap is intentional — at the aggregate level, "Residents" means "all HFs linked to this location," which encompasses all Denizen subcategories.

### Geographical Dwelling Hierarchy (non-inclusive, semi-hierarchical)

`Civilization > Site > Cave > Lair`

---

## 2. Population Taxonomy (Four Categories)

### 2.1 The Universal Gate: Site Presence

**No HF is assigned a category unless they have evidence of presence at the site.** Presence is established by ANY of:

| Presence Type | Source | Indicates |
|---|---|---|
| **Structural** | `hf_site_links.link_type` IN ('resident', 'home structure', 'home site building', 'seat of power', 'occupation', 'hangout') | Long-term tie to the site |
| **Structural (adversarial)** | `hf_site_links.link_type = 'lair'` | Monster/vampire lair at site |
| **Event-based (settled)** | Most recent `change_hf_state` has `site_id = this site` AND `state = 'settler'` | Currently settled here |
| **Event-based (visiting)** | Most recent `change_hf_state` has `site_id = this site` AND `state = 'visitor'` | Currently visiting here |
| **Event-based (refugee)** | Most recent `change_hf_state` has `site_id = this site` AND `state = 'refugee'` | Fled to this site |

**NOT present** (excluded from all categories):
- `hf_site_links.link_type = 'former resident'` with no other current link
- Most recent `change_hf_state` places them at a *different* site or in wilderness
- No site links and no events at this site

**Structural vs. event conflict**: If an HF has a structural link (e.g., home structure) but their most recent event places them elsewhere (e.g., wandering), they **retain structural presence**. A home structure is a persistent tie — the HF may be temporarily away but still "lives there." This matches DF semantics: adventurers and werebeasts leave home but return.

### 2.2 Category Definitions

Four population categories. **"Former Member" is NOT a category** — it is a membership status that excludes an HF from being a Citizen. Former members who pass the presence gate are classified as Resident, Visitor, or Ne'er-do-well based on their actual situation.

| Category | Definition | How Determined |
|---|---|---|
| **Citizen** | Sentient HF with current civic affiliation to the SG who is present at the site | 3-source UNION (SG members + hf_site_links citizens + position holders), sentience filter, AND passes presence gate |
| **Resident** | HF who lives at the site (structural presence) but is not a Citizen and not a Ne'er-do-well | Has structural site link, NOT in Citizen set, NOT in Ne'er-do-well set |
| **Visitor** | HF present at the site via event only, with no structural tie and no SG affiliation | Most recent `change_hf_state` at this site (visitor/settler/refugee), NO structural site link, NOT a Citizen, NOT a Ne'er-do-well |
| **Ne'er-do-well** | HF with adversarial relationship to the governing entity AND present at the site | See §2.3 for criteria; must also pass presence gate |

### 2.3 Ne'er-do-well Criteria

An HF is a Ne'er-do-well if they pass the **presence gate** AND meet any of these:

**Direct** (high confidence):
- `hf_entity_links.link_type` IN ('enemy', 'criminal', 'prisoner', 'former prisoner', 'slave', 'former slave') to the SG entity

**Indirect** (catches edge cases like Gasom):
- HF is a member of an entity with `type = 'outcast'` that has a site link to the SG's site
- HF has `hf_site_links.link_type = 'lair'` at the site (monster/vampire lair)
- HF has `is_werebeast = true` or `is_vampire = true`, has structural presence at the site, but NO membership in the SG

**Note on `entity_reputation.first_ageless_year`**: This indicates the SG noticed an HF's agelessness. While suspicious, agelessness alone doesn't make someone a ne'er-do-well (some ageless beings are benign). This data is better surfaced as a detail on the HF's row rather than as a classification criterion.

### 2.4 Mutual Exclusivity & Priority

A present HF appears in exactly one category. Priority order:
1. **Ne'er-do-well** — adversarial relationship overrides everything
2. **Citizen** — current civic affiliation
3. **Resident** — structural presence, no civic tie, not adversarial
4. **Visitor** — event-only presence, no structural tie

An HF who is `former member` of the SG AND has structural presence AND is not adversarial → **Resident** (not Citizen, because former members are excluded from citizenship).

An HF who is `former member` AND `enemy` AND present → **Ne'er-do-well**.

An HF who is `former member` AND not present → **does not appear** in any tab for this site.

### 2.5 Category Diagram

```
                    ┌──────────────────────────────┐
                    │   All HFs in the database     │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   PRESENCE GATE               │
                    │   Structural link OR          │
                    │   Most recent event at site   │
                    └──────────────┬───────────────┘
                                   │
              PRESENT              │              NOT PRESENT
         ┌─────────────────────────┤              (excluded from
         │                         │               all categories)
         ▼                         │
    ┌────────────┐                 │
    │ Adversarial│─── YES ──► Ne'er-do-well
    │ to SG?     │
    └─────┬──────┘
          │ NO
          ▼
    ┌────────────┐
    │ Current SG │─── YES ──► Citizen
    │ citizen?   │
    └─────┬──────┘
          │ NO
          ▼
    ┌────────────┐
    │ Structural │─── YES ──► Resident
    │ site link? │
    └─────┬──────┘
          │ NO
          ▼
        Visitor (event-only presence)
```

---

## 3. UI Design

### 3.1 Site Page — "Denizens" Tab (replaces "Residents")

The Site page (`site_detail.html`) gets a **Denizens** tab that unifies Citizens, Residents, and Visitors in one table with a Type column.

**Tab label**: "Denizens"

**Columns**: Name (linked), Race, Type (Citizen/Resident/Visitor), Basis (Member, Home Structure, Settler, Visitor, etc.), Status (Alive/Dead)

**Filter chips**: All, Citizens, Residents, Visitors

**Overview tile**: "Denizens: X (Y Citizens, Z Residents, W Visitors)"

### 3.2 Site Page — "Ne'er-do-wells" Tab (new)

**Tab label**: "Ne'er-do-wells"

**Columns**: Name (linked), Race, Threat Type (Enemy/Criminal/Prisoner/Slave/Outcast/Lair), Basis (direct entity link, outcast membership, lair, werebeast), Resident (Yes/No — do they have a structural link?), Status (Alive/Dead), Context (e.g., "Warlord of The Fated Councils, weretortoise")

**Filter chips**: All, Enemy, Criminal, Prisoner, Slave

**Overview tile**: "Ne'er-do-wells: X"

### 3.3 Site Government Page — Members Tab (refined)

The existing Members tab on SG entity pages (`entity_detail.html`) is refined:

- **Remove** Ne'er-do-wells (enemies, criminals, prisoners, slaves of this SG)
- **Keep**: Citizens (current members + site-link citizens + position holders)
- Former members who are NOT adversarial remain visible with "Former Member" label (for historical completeness) but are clearly distinguished from current Citizens
- Columns: Name, Race, Membership (Member/Former Member/Citizen via Site Link), Citizen (Yes/No), Status

### 3.4 Site Government Page — Ne'er-do-wells Tab (new)

Same structure as §3.2 but scoped to this specific SG's adversarial links.

### 3.5 HF Page Enrichment

On individual HF detail pages:
- **Residency line**: "Resident of Pocketdumplings (home structure: The Worthy Honey)" or "Visitor at Pocketdumplings (gather_information, Y216)"
- **Political status**: "Citizen of The Nourishing League" or "Enemy of The Nourishing League" or "Not affiliated"
- **Agelessness note** (if applicable): "Known to The Nourishing League as ageless since Y217"

---

## 4. Implementation Plan

### Task 1: Presence Gate & Visitor Detection

**Goal**: Build the foundation — determine which HFs are present at any given site.

**4.1a — Improve `whereabouts` computation** (`post_parse.py`)
The existing `whereabouts` column is incomplete (only 82 HFs point to site 621 vs 333 from events). Enhance Step 10b to:
- For EVERY living HF, compute `whereabouts` from their most recent `change_hf_state` event
- Fall back to structural links (home structure > seat of power > occupation > lair > etc.) for HFs with no events
- Store: `{"state": "visitor"|"settler"|"wanderer"|"refugee"|"inferred", "site_id": N|null, "source": "...", "year": N, "reason": "..."}`

**4.1b — Site presence query function** (`detail_pages.py` or new `population.py`)
Create `fetch_site_present_hfs(pool, world_id, site_id)` that returns all HFs present at a site via:
1. Structural links: `hf_site_links` WHERE `site_id = X` AND `link_type NOT IN ('former resident')`
2. Event presence: HFs whose most recent `change_hf_state` has `site_id = X`
3. UNION, deduplicate, annotate each HF with their presence basis

### Task 2: Four-Way Classification

**Goal**: Classify every present HF into exactly one of: Ne'er-do-well, Citizen, Resident, Visitor.

**4.2a — Ne'er-do-well detection** (`detail_pages.py`)
For a given SG entity at a site, identify ne'er-do-wells among present HFs:
- Direct: `hf_entity_links.link_type` IN ('enemy','criminal','prisoner','former prisoner','slave','former slave') to SG
- Indirect: member of outcast entity at this site, lair holder, werebeast/vampire with no SG membership

**4.2b — Citizen set** (already implemented)
Existing 3-source UNION with sentience filter. Exclude anyone in ne'er-do-well set.

**4.2c — Resident vs Visitor split**
Among present HFs who are neither ne'er-do-well nor citizen:
- **Resident**: has structural site link (resident, home structure, home site building, seat of power, occupation, hangout)
- **Visitor**: present via event only (no structural link)

### Task 3: Site Page — Denizens Tab

**Goal**: Replace the Residents tab with a unified Denizens tab.

**4.3a — Backend route** (`detail_pages.py` or `civilizations.py`)
Endpoint returns all present HFs classified into Citizen/Resident/Visitor with their basis.

**4.3b — Template** (`site_detail.html`)
Denizens tab with Type column, filter chips, overview tile count.

### Task 4: Ne'er-do-wells Tab (Site + SG pages)

**Goal**: Surface adversarial HFs in a dedicated tab.

**4.4a — Backend route** for ne'er-do-well data
Returns adversarial HFs with threat type, residency status, context string.

**4.4b — Template additions** (`site_detail.html` + `entity_detail.html`)
Ne'er-do-wells tab on both page types.

### Task 5: SG Members Tab Cleanup

**Goal**: Remove ne'er-do-wells from the Members tab on SG pages.

**4.5a — Filter adversarial HFs** from the existing members query
**4.5b — Keep former members** who are not adversarial (for historical context)

### Task 6: HF Page Enrichment

**Goal**: Show residency, political status, and agelessness on HF detail pages.

**4.6a — Residency line** from `hf_site_links` + `whereabouts`
**4.6b — Political status** from `hf_entity_links` to governing SG
**4.6c — Agelessness note** from `entity_reputations` JSONB

---

## 5. Sequencing

| Order | Task | Complexity | Prerequisite |
|---|---|---|---|
| **1** | Task 1: Presence gate & visitor detection | Medium | None |
| **2** | Task 2: Four-way classification | Medium | Task 1 |
| **3** | Task 5: SG Members tab cleanup | Low | Task 2 |
| **4** | Task 3: Site page Denizens tab | Medium | Task 2 |
| **5** | Task 4: Ne'er-do-wells tab (both pages) | Medium | Task 2 |
| **6** | Task 6: HF page enrichment | Medium | Tasks 2-5 |

---

## 6. Validation Checklist

### Spot-check HFs at Pocketdumplings (site 621, SG 1525):

| HF | Expected Category | Why |
|---|---|---|
| Gasom Peekedchurch (33516) | Ne'er-do-well | Outcast warlord (entity 4373) based at site, weretortoise, home structure |
| Abo Evenedtreaty (38312) | Ne'er-do-well | Enemy of SG 1525, weredonkey, home structure at site |
| Mebas Twistedclustered (43691) | Ne'er-do-well | Criminal of SG 1525, home structure at site |
| Sekel Greenblows (32606) | Visitor | No site links, no SG link, but most recent event = visitor at 621 (Y216, gather_info) |
| Stral Mergedwaves (39712) | **Not present** | Former member of SG 1525, but most recent event = visitor at site 1366 (not 621), no site links to 621 |

### Count verification:
- [ ] Every HF in any tab passes the presence gate
- [ ] No HF appears in more than one category
- [ ] Ne'er-do-wells excluded from Denizens tab
- [ ] Former members with no presence excluded from all tabs
- [ ] Visitors (event-only presence, no site links) correctly captured
- [ ] Denizens total = Citizens + Residents + Visitors
- [ ] Total present HFs = Denizens + Ne'er-do-wells

### Site 621 expected approximate counts:
- Structural presence (site links excl. former resident): ~246
- Event presence (last state at site): ~190 (settler 159 + visitor 31)
- Combined unique (UNION): ~350+ (significant overlap between settlers and residents)
- Ne'er-do-wells: TBD (depends on adversarial link count for SG 1525)
- Denizens: Total present minus ne'er-do-wells

---

## 7. Edge Cases

| Case | Resolution |
|---|---|
| HF is enemy AND former member of SG, present at site | Ne'er-do-well (adversarial wins) |
| HF is former member, NOT adversarial, has home structure at site | Resident (former membership excludes from Citizen; structural presence qualifies as Resident) |
| HF is former member, NOT adversarial, no site presence | **Not shown** (fails presence gate) |
| HF has home structure but most recent event = wandering elsewhere | **Still present** (structural link is persistent; wandering is temporary) |
| HF has lair at site | Ne'er-do-well (lair = monster/vampire) |
| HF is member of SG AND criminal of SG, present | Ne'er-do-well (adversarial overrides) |
| HF is werebeast, has home structure, no SG membership | Ne'er-do-well (indirect criterion) |
| HF is member of outcast entity based at site, no direct SG link | Ne'er-do-well (indirect: outcast at site) |
| HF is visitor AND former member, not adversarial | Visitor (former membership doesn't grant Citizen or Resident; event-only presence = Visitor) |
| HF has settler event at site but no site_link | Visitor → Resident TBD. Settler events indicate settling, but if no site_link was created, the settlement may have been brief. Classify as **Resident** if event is the most recent state; the settler intent implies longer-term presence than a visitor. |
| HF is refugee at site | Visitor (transient presence, similar to visitor) |
| HF has `change_hf_state` = settler at site AND a `hf_site_links` = resident | Resident (structural link confirms; event corroborates) |
| HF is former prisoner of SG, now present as visitor | Ne'er-do-well (former prisoner is adversarial history) |
