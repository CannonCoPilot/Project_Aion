# Phase 2: Explorer Core — Validation Walkthrough v2.1

**Purpose**: Step-by-step guide to verify all Phase 2 features (30 DoD + 13 enhancements).
**Prerequisites**: PostgreSQL running, world "Tar Thran" ingested (1,675,297 records).
**Server**: Chronicler running on port 8099.
**Date**: 2026-03-03 (updated 2026-03-04)

---

## Setup

If the server isn't running:

```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron
.venv/bin/chronicler serve --port 8099
```

Open your browser to **http://localhost:8099/explorer?world_id=1**

World stats to confirm: 48,273 HFs, 4,847 entities, 2,154 sites, 436,455 events, 2,278 regions.

---

## Part A: Core DoD (30 items)

### 1. Global Search

From any page, use the search bar in the top navigation:

1. Type `asob` — results should appear after ~200ms debounce
2. Expect 22+ results, all HFs named "Asob ...", with type badges
3. Type `Tar Thran` — should find the world/site entries
4. Use **Arrow Down/Up** to navigate, **Enter** to select, **Escape** to dismiss
5. Click a result — should navigate to that entity's detail page

**Verify**: Type badges colored by entity type, accent-insensitive matching, keyboard navigation.

---

### 2. Historical Figure Detail Page

**URL**: http://localhost:8099/explorer/hf/1?world_id=1

HF #1 is **Zogast Budzeniths the Esteemed** (HYDRA, MALE, deity, born -217, 15 kills).

Check:
- **Header**: Name, race resolved via creature dictionary ("hydra" not "HYDRA"), sex
- **Deity badge**: Gold badge since this HF is a deity
- **Tabs**: Click through all 5 tabs (Overview, Relationships, Career, Events, Graph)
- **Events tab**: Perspective-aware — this HF referenced as **he/him** in gold italic text; other entities are blue clickable links
- **Events enrichment**: Some event rows have a `▸` marker — click to expand inline enrichment tags (reason, circumstance, link_type, etc.)
- **Popovers**: Hover over any blue entity link — tooltip appears after ~300ms with mini-summary
- **Breadcrumb**: "Explorer > People > Zogast Budzeniths the Esteemed"
- **Prev/Next**: Navigation arrows to adjacent HFs

#### Caste-Aware Pronouns

- **http://localhost:8099/explorer/hf/0?world_id=1** — HF #0 (check caste; should use appropriate he/she/they)
- Male HFs: **he/him/his**
- Female HFs: **she/her/her**
- Unknown/DEFAULT: **they/them/their**

#### Vampire/Special Badges

- **http://localhost:8099/explorer/hf/1779?world_id=1** — check for vampire/werebeast/necromancer badges

---

### 3. Entity/Civilization Detail Page

**URL**: http://localhost:8099/explorer/entity/24?world_id=1

Check:
- **5 tabs**: Leaders, Sites, Members, Positions, Wars
- **Leaders tab**: Position holders with linked HF names
- **Sites tab**: Owned/controlled sites with links
- **Members tab**: Notable members sorted by importance
- **Positions tab**: Named positions defined for this entity (e.g., "king", "general")
- **Wars tab**: War participation showing aggressor/defender
- **Cross-links**: All names are clickable with popovers

---

### 4. Site Detail Page

**URL**: http://localhost:8099/explorer/site/1?world_id=1

Check:
- **4 tabs**: Structures, Properties, Ownership, History
- **Structures tab**: Linked structure list (click through to structure detail)
- **Properties tab**: Site type, coordinates, and metadata
- **Ownership tab**: Current owner civilization linked, ownership timeline showing transitions
- **History tab**: Events at this site with enrichment tags (click `▸` to expand)
- **Residents**: HFs linked as current/former residents (visible in Ownership section)

---

### 5. Artifact Detail Page

**URL**: http://localhost:8099/explorer/artifact/1?world_id=1

Check:
- Item type, material, creation info
- Chain-of-custody / related events
- Creator and holder cross-links

---

### 6. Region Detail Page

**URL**: http://localhost:8099/explorer/region/1?world_id=1

Check:
- **Biome badge**: Region biome type
- **Evilness badge**: Benign (cyan), Neutral (gray), Evil (purple)
- Events in this region

---

### 7. Structure Detail Page

Test with three different structure types:

| Structure | URL | Expected Tabs |
|-----------|-----|---------------|
| Market | http://localhost:8099/explorer/site/38/structure/0?world_id=1 | Overview, Events |
| Inn Tavern | http://localhost:8099/explorer/site/301/structure/0?world_id=1 | Overview, Events |
| Temple | http://localhost:8099/explorer/site/301/structure/6?world_id=1 | Overview, Positions (2), Members (67), Events |

#### All Structures
- **Type badge**: "market", "temple", "inn_tavern", "mead_hall", etc.
- **Parent site**: Link back to parent site
- **Events**: Event rows with enrichment tags (click `▸` to expand)

#### Temple-Specific (entity_id present)
- **Deity link**: Clickable HF link to the associated deity
- **Sect link**: Religion entity reference (e.g., "The Fellowship of Thirst")
- **Alt Name**: Displayed if `name2` exists in plus-XML details
- **Positions tab**: Named position roles (should show "Sacred Law" and "High Nourishment" — NOT "Position 0"/"Position 1")
- **Members tab**: 67 members with current/former badges

#### Inn Tavern (no entity_id)
- Should show **no** Positions or Members tabs — only Overview and Events
- This verifies the conditional tab rendering works correctly

---

### 8. Written Content Detail Page

**URL**: http://localhost:8099/explorer/written_content/1?world_id=1

Check:
- Author linked to HF page
- Referenced entities all cross-linked
- Form type displayed (poem, musical_composition, etc.)

---

### 9. Event Collection Detail Page

**URL**: http://localhost:8099/explorer/collection/1?world_id=1

Check:
- Hierarchy display (wars contain battles, battles contain events)
- Events within collection listed
- Combatants and locations cross-linked

---

### 10. Secondary Entity Pages

All should render with basic info and cross-links:

| Entity Type | URL | What to Check |
|------------|-----|---------------|
| Underground Region | http://localhost:8099/explorer/underground_region/1?world_id=1 | Type, depth |
| Landmass | http://localhost:8099/explorer/landmass/1?world_id=1 | Name, regions |
| Mountain Peak | http://localhost:8099/explorer/mountain_peak/1?world_id=1 | Name, height, is_volcano |
| River | http://localhost:8099/explorer/river/1?world_id=1 | Name, path |
| World Construction | http://localhost:8099/explorer/construction/1?world_id=1 | Type (road/bridge/tunnel) |
| Art Form | http://localhost:8099/explorer/art_form/1?world_id=1&form_type=dance | Type + description |
| Identity | http://localhost:8099/explorer/identity/1?world_id=1 | Linked HF |
| Historical Era | http://localhost:8099/explorer/era/Age%20of%20Myth?world_id=1 | Time range, events |

**Art Form special check**: Art form #1 with `form_type=dance` is "The Poetry of Lathering" — description should read "The Poetry of Lathering is a solo celebration dance...". This validates the dual-XML merge. Note: `form_type` values are `dance`, `musical`, `poetic` (not `dance_form`, `musical_form`, `poetic_form`).

---

### 11. Years and Events Browser

**URL**: http://localhost:8099/explorer/years?world_id=1

Check:
- Year list with event counts (total ~436,455 events)
- Click a year to drill into its events
- Pagination for large event lists
- Event type filter/categorization
- Enrichment tags on event rows (click `▸` to expand — ~64% of events have enrichment data)

---

### 12. Three-Layer People Filter

**URL**: http://localhost:8099/explorer?world_id=1 (People tab)

#### Layer 1 — Race Category Pills
- Click different race pills (Dwarf, Elf, Human, Goblin, etc.)
- Should filter the HF list to show only that race
- Check special categories: gods, demigods, titans

#### Layer 2 — Variant Bars
- 5 always-visible bar indicators: **Vampire** (43), **Necromancer** (289), **Werebeast** (105), **Ghost**, **Animated Dead**
- Click "Vampire" bar — list filters to show 43 vampires
- Click "Necromancer" — should show 289 necromancers
- Combine with a race pill — should AND the filters

#### Layer 3 — Status + Text
- Toggle **Alive/Dead** status filter
- Type a name in the text search box
- All three layers compose together

---

### 13. Data Browser Features

**URL**: http://localhost:8099/explorer?world_id=1 (Data tab)

#### JSONB Field Inventory
1. Select `historical_figures` table
2. Look for JSONB column `details`
3. Schema browser should show union of all keys found across rows

#### Row Detail Overlay
1. Click any data row
2. Modal overlay shows all fields, JSONB expanded as tree
3. FK values are clickable links
4. Close with Escape or click outside

#### Query Results Export
1. Go to **SQL** tab
2. Run: `SELECT name, race, birth_year FROM historical_figures LIMIT 10`
3. Click **CSV** export button — downloads CSV file
4. Click **JSON** export button — downloads JSON file

---

### 14. URL Hash Tab Persistence

1. Go to http://localhost:8099/explorer/entity/24?world_id=1
2. Click "Wars" tab — URL should update to `#tab=wars`
3. Copy URL, open in new browser tab — Wars tab should be pre-selected
4. Navigate away, use browser Back — tab state preserved

---

### 15. Cross-Cutting Verification

#### Cross-Links
- On any detail page, entity names are clickable colored links
- Links navigate to the correct entity detail page
- Types: HF (gold), Entity (blue), Site (green), Artifact (purple), Region (orange)

#### Perspective Rendering
- HF pages: current HF replaced with **caste-aware pronouns** in gold italic
- Site pages: current site replaced with "here"
- Other entities remain as clickable links

#### DF Calendar
- Events show "Year N" or "the Nth of Month, Year N"
- DF months: Granite, Slate, Felsite, Hematite, Malachite, Galena, Limestone, Sandstone, Timber, Moonstone, Opal, Obsidian

#### Hover Popovers
- HF: name, race (resolved display name), caste, born/died, kill count, type badges
- Site: name, type, owner
- Entity: name, type, race
- Artifact: name, item type, material, holder

---

## Part B: Enhancement Features (13 items)

These were delivered beyond the original PRD scope during Phase 2.

### 16. Unified Scoring System

On the People tab, HFs should show **scoring badges** (prominence + salience):
- Sort by prominence — most event-connected HFs first
- Scoring uses IDF-weighting across 10 entity types
- Check that deities, supernatural creatures, and leaders rank highly

---

### 17. Multi-Mode Graph Visualization

**URL**: http://localhost:8099/explorer?world_id=1 (Graph tab)

Test with HF #19639 (Minaro Autumnalsculpt, Elf werebeast — rich graph: 47 nodes, 132 edges at depth 2):

#### Pedigree Mode
- Select "Pedigree" — shows family tree layout
- Tree should show parent/child/spouse relationships
- Generation-depth slider controls how many generations displayed

#### Mentorship Mode
- Switch to "Mentorship" — career graph
- Shows master/apprentice edges

#### Full Network Mode
- Switch to "Full Network"
- **Degree selector**: Try 1-hop, 2-hop, 3-hop (more hops = more nodes)
- **Layout algorithms**: Try Force Atlas 2, Barnes-Hut, Hierarchical, Circle, Grid
- **Edge toggles**: Toggle family/romantic/mentorship/companion/imprisonment/membership/residence/conflict
- **Node type toggles**: Toggle different HF types, entity subtypes, sites
- **Entity/Site nodes**: Diamonds for entities, squares for sites

---

### 18. Hide Isolated Nodes

In the Graph tab:
- Toggle "Hide isolated nodes" — nodes with no visible edges should disappear
- Helps declutter sparse networks

---

### 19. Inline HF Detail Expansion

From the People tab or any list of HFs:
- Click an HF name in the Explorer panel (not the full detail link)
- An inline detail panel should expand showing partial HF info
- Has its own sub-tab system (`switchInlineTab()`)
- "Open Full Page" and "View Graph" escape hatches available

---

### 20. Chat Popup

Look for a chat icon/button (usually bottom-right):
- Click to open chat popup
- Type a question about the world (e.g., "Who are the most powerful dwarves?")
- Should stream a response via SSE from local Qwen3 LLM
- Response should be RAG-augmented with world data

**Note**: Requires Qwen3 LLM running locally. If not available, popup may show an error — that's OK for validation.

---

### 21. Dual-XML Enrichment (Data Verification)

These checks verify that the enrichment pipeline persisted data correctly and is surfaced in the UI.

#### Event Enrichment (UI-visible)
- 290K events gained plus-only fields (`reason`, nested `circumstance`) via JSONB `||` merge
- **Now visible in UI**: Event rows with enrichment data show a `▸` marker — click to expand inline tags showing reason, circumstance, link_type, action, quality, etc.
- Enrichment display filters out entity IDs, sentinel values, and fields already in the narrative text — only showing meaningful extra metadata
- Test on any HF page: ~64% of events will have expandable enrichment tags
- Verify data via SQL tab: `SELECT event_type, details->'reason', details->'circumstance' FROM history_events WHERE details ? 'circumstance' LIMIT 5`

#### Structure Enrichment (UI-visible)
- Visit the temple at http://localhost:8099/explorer/site/301/structure/6?world_id=1
- Should show: **deity**, **religion (Sect)**, **positions**, **members**, **name2** from plus-XML data
- Positions should display named roles ("Sacred Law", "High Nourishment") not numeric "Position N" entries

#### Art Form Description Merge (UI-visible)
- Visit http://localhost:8099/explorer/art_form/1?world_id=1&form_type=dance
- Should have a text description: "The Poetry of Lathering is a solo celebration dance..."
- This description comes from base legends.xml merged into plus metadata

#### Relationship Supplements (data-layer only — verify via SQL)
- 334 records merged into `event_relationships.details` JSONB
- Contains: `occasion_type`, `supplement_site_id`, `supplement_reason`
- Verify via SQL tab: `SELECT details FROM event_relationships WHERE details IS NOT NULL AND details != '{}' LIMIT 5`

---

### 22. Event Enrichment UI Display

On any detail page with events (HF, site, structure, region, etc.):
- Event rows with enrichment data show a small `▸` marker before the date
- Click the row to expand — inline tags appear showing metadata like **reason**, **circumstance**, **link_type**, **action**, **quality**, etc.
- Click again to collapse
- The enrichment filter suppresses entity IDs, sentinel values (`none`, `-1`), and fields already substituted into the narrative text — only meaningful extra metadata is shown
- Test on HF #1: ~39 out of ~120 events have expandable enrichment
- Test on year browser: ~64% of events in a typical year have enrichment data

---

### 23. Co-Member/Co-Occupant Graph Wings

On HF detail pages with organizational membership:
- Relationship section should show co-member and co-occupant connections
- These appear as "wings" on the relationship display

---

### 24. Site Residents Tab

On site detail pages:
- Look for a **Residents** section or tab
- Should show HFs linked as residents/former residents
- These come from materialized settlement links (post-parse step 10)

---

### 25. Ownership Timeline

On site detail pages with ownership changes:
- Look for a visual timeline showing ownership transitions
- Format: "Year X-Y: Owned by [Entity]" with colored segments

---

### 26. Art Form Composite PK Routing

Art forms use a composite primary key (world_id, id, form_type):
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=musical
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=poetic
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=dance
- Each should route correctly, prev/next links should stay within the same form_type

---

## Regression Checks

These verify that recent fixes didn't break existing functionality:

### R1. Relationship Supplements Persisted
```sql
-- Run in SQL tab
SELECT COUNT(*) FROM event_relationships WHERE details IS NOT NULL AND details != '{}'::jsonb;
-- Expected: 334
```

### R2. Event Enrichment Count
```sql
SELECT COUNT(*) FROM history_events WHERE details ? 'circumstance';
-- Expected: ~13,261
```

### R3. Structure Enrichment Count
```sql
SELECT COUNT(*) FROM structures WHERE details ? 'deity_hf_id';
-- Expected: 4 (temples with deity data)
```

### R4. Art Form Descriptions Present
```sql
SELECT COUNT(*) FROM art_forms WHERE description IS NOT NULL AND description != '';
-- Expected: 658
```

### R5. Total Record Count
```sql
SELECT
  (SELECT COUNT(*) FROM historical_figures WHERE world_id=1) as hfs,
  (SELECT COUNT(*) FROM entities WHERE world_id=1) as entities,
  (SELECT COUNT(*) FROM sites WHERE world_id=1) as sites,
  (SELECT COUNT(*) FROM history_events WHERE world_id=1) as events;
-- Expected: 48273, 4847, 2154, 436455
```

### R6. Event-Entity Xref Structure Coverage
```sql
SELECT COUNT(*) FROM event_entity_xref WHERE entity_type = 'structure';
-- Expected: ~6,196 (added in post-parse xref gap fix)
```

### R7. Position Profile Corrections Applied
```sql
-- Temple entity 1604 should show named positions, not "Position N"
SELECT ep.name, COUNT(*) as holders
FROM hf_position_links pl
JOIN entity_positions ep ON ep.world_id = pl.world_id
  AND ep.entity_id = pl.entity_id AND ep.position_id = pl.position_id
WHERE pl.entity_id = 1604 AND pl.world_id = 1
GROUP BY ep.name ORDER BY ep.name;
-- Expected: "high nourishment" (1), "sacred law" (22)
-- Verify NO results contain "Position N" pattern
```

---

## Validation Checklist (validated 2026-03-04)

### Core DoD (30 items) — 30/30 PASS

**Entity Detail Pages (17)**:
- [x] Historical Figure detail (tabs, events, badges, 24 sections)
- [x] Entity/Civilization detail (5 tabs)
- [x] Site detail (4 tabs: structures, properties, ownership, history)
- [x] Artifact detail (chain-of-custody)
- [x] Region detail (biome + evilness badges)
- [x] Structure detail (type badge, deity/sect links, positions/members tabs for temples, no tabs for inns)
- [x] Written Content detail (author link, form type)
- [x] Event Collection detail (hierarchy)
- [x] Underground Region detail
- [x] Landmass detail
- [x] Mountain Peak detail
- [x] River detail
- [x] World Construction detail
- [x] Art Form detail (3 types, description text)
- [x] Identity detail (linked HF)
- [x] Historical Era detail (time range)
- [x] Years and Events browser

**Search and Navigation (8)**:
- [x] Global search with live autocomplete (accent-insensitive)
- [x] Three-layer People filter (race pills, variant bars, status/text)
- [x] Hover popovers on entity links
- [x] Breadcrumb navigation on all detail pages
- [x] Prev/Next navigation on all detail pages
- [x] URL hash tab persistence
- [x] Row detail overlay in data browser
- [x] Query results export (CSV/JSON) — fixed 2026-03-04: added `format` to QueryRequest body model

**Cross-Cutting (5)**:
- [x] Cross-linked entity references everywhere
- [x] Perspective-aware event rendering (caste-aware pronouns)
- [x] DF calendar formatting
- [x] Entity name cache (pages load within performance targets)
- [x] All pages load without errors

### Enhancements (13 items) — 13/13 PASS

- [x] Unified scoring (prominence + salience badges)
- [x] Multi-mode graph (pedigree, mentorship, full network)
- [x] Graph features (degree selector, 6 layouts, edge/node toggles)
- [x] Hide isolated nodes toggle
- [x] Inline HF detail expansion
- [x] Chat popup (SSE streaming)
- [x] Dual-XML enrichment (events, structures, supplements)
- [x] Event enrichment UI display (expandable tags on all detail pages)
- [x] Co-member/co-occupant graph wings
- [x] Site residents tab
- [x] Ownership timeline
- [x] Art form composite PK routing
- [x] Materialized HF settlement links

### Regression Checks (7 SQL queries) — 7/7 PASS

- [x] R1: 334 relationship supplements
- [x] R2: ~13,261 circumstance events
- [x] R3: 4 structures with deity data (key: `deity_hf_id`)
- [x] R4: 658 art form descriptions
- [x] R5: Record counts match expected
- [x] R6: ~6,196 structure xref rows
- [x] R7: Position profiles corrected (named positions, not "Position N")

---

*Phase 2: Explorer Core — Validation Walkthrough v2.1 (validated 2026-03-04)*
*50/50 verification items PASSED — 30 DoD + 13 enhancements + 7 regression checks*
