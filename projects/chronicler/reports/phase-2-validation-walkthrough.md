# Phase 2: Explorer Core — Validation Walkthrough v2.0

**Purpose**: Step-by-step guide to verify all Phase 2 features (30 DoD + 12 enhancements).
**Prerequisites**: PostgreSQL running, world "Tar Thran" ingested (1,675,297 records).
**Server**: Chronicler running on port 8099.
**Date**: 2026-03-03

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
- **Tabs**: Click through all tabs (Overview, Relationships, Career, Events)
- **Events tab**: Perspective-aware — this HF referenced as **he/him** in gold italic text; other entities are blue clickable links
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
- **5 tabs**: Leaders, Sites, Members, Groups, Wars
- **Leaders tab**: Position holders with linked HF names
- **Sites tab**: Owned/controlled sites with links
- **Members tab**: Notable members sorted by importance
- **Wars tab**: War participation showing aggressor/defender
- **Cross-links**: All names are clickable with popovers

---

### 4. Site Detail Page

**URL**: http://localhost:8099/explorer/site/1?world_id=1

Check:
- **3 tabs**: Structures, Properties, History
- **Structures tab**: Linked structure list (click through to structure detail)
- **Owner**: Current owner civilization linked
- **History tab**: Ownership history and events

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

**URL**: http://localhost:8099/explorer/site/38/structure/0?world_id=1 (market)

Temple with deity enrichment: **http://localhost:8099/explorer/site/301/structure/6?world_id=1**

Check:
- **Type badge**: "market", "temple", "tomb", "mead_hall", etc.
- **Deity link** (temples): Clickable HF link to the associated deity
- **Religion** (temples): Religion/entity references from plus-XML enrichment
- **Parent site**: Link back to parent site

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
| Art Form | http://localhost:8099/explorer/art_form/1?world_id=1&form_type=musical_form | Type + description |
| Identity | http://localhost:8099/explorer/identity/1?world_id=1 | Linked HF |
| Historical Era | http://localhost:8099/explorer/era/Age%20of%20Myth?world_id=1 | Time range, events |

**Art Form special check**: The description field should contain text from base legends.xml (e.g., "The Poetry of Lathering is a solo celebration dance..."). This validates the dual-XML merge.

---

### 11. Years and Events Browser

**URL**: http://localhost:8099/explorer/years?world_id=1

Check:
- Year list with event counts (total ~436,455 events)
- Click a year to drill into its events
- Pagination for large event lists
- Event type filter/categorization

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

## Part B: Enhancement Features (12 items)

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

These checks verify that the enrichment pipeline persisted data correctly. Some enrichments are visible in the UI; others are data-layer only (validated via SQL in the Regression Checks section).

#### Structure Enrichment (UI-visible)
- Visit the temple at http://localhost:8099/explorer/site/301/structure/6?world_id=1
- Should show: **deity**, **religion**, **inhabitants**, **name2** from plus-XML data

#### Art Form Description Merge (UI-visible)
- Visit http://localhost:8099/explorer/art_form/1?world_id=1&form_type=musical_form
- Should have a text description like "The Poetry of Lathering is a solo celebration dance..."
- This description comes from base legends.xml merged into plus metadata

#### Event Enrichment (data-layer only — verify via SQL)
- 290K events gained plus-only fields (`reason`, nested `circumstance`) via JSONB `||` merge
- These fields are stored in `details` JSONB but **not yet surfaced in event text templates** (71 templates use entity-reference placeholders; enrichment fields like `reason` and `circumstance` are available for Phase 3 narrative rendering)
- Verify via SQL tab: `SELECT event_type, details->'reason', details->'circumstance' FROM history_events WHERE details ? 'circumstance' LIMIT 5`

#### Relationship Supplements (data-layer only — verify via SQL)
- 334 records merged into `event_relationships.details` JSONB
- Contains: `occasion_type`, `supplement_site_id`, `supplement_reason`
- Verify via SQL tab: `SELECT details FROM event_relationships WHERE details IS NOT NULL AND details != '{}' LIMIT 5`

---

### 22. Co-Member/Co-Occupant Graph Wings

On HF detail pages with organizational membership:
- Relationship section should show co-member and co-occupant connections
- These appear as "wings" on the relationship display

---

### 23. Site Residents Tab

On site detail pages:
- Look for a **Residents** section or tab
- Should show HFs linked as residents/former residents
- These come from materialized settlement links (post-parse step 10)

---

### 24. Ownership Timeline

On site detail pages with ownership changes:
- Look for a visual timeline showing ownership transitions
- Format: "Year X-Y: Owned by [Entity]" with colored segments

---

### 25. Art Form Composite PK Routing

Art forms use a composite primary key (world_id, id, form_type):
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=musical_form
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=poetic_form
- http://localhost:8099/explorer/art_form/1?world_id=1&form_type=dance_form
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
SELECT COUNT(*) FROM structures WHERE details ? 'deity';
-- Expected: > 0 (temples with deity data)
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

---

## Validation Checklist

### Core DoD (30 items)

**Entity Detail Pages (17)**:
- [ ] Historical Figure detail (tabs, events, badges, 24 sections)
- [ ] Entity/Civilization detail (5 tabs)
- [ ] Site detail (3 tabs + structures)
- [ ] Artifact detail (chain-of-custody)
- [ ] Region detail (biome + evilness badges)
- [ ] Structure detail (type badge, deity link for temples)
- [ ] Written Content detail (author link, form type)
- [ ] Event Collection detail (hierarchy)
- [ ] Underground Region detail
- [ ] Landmass detail
- [ ] Mountain Peak detail
- [ ] River detail
- [ ] World Construction detail
- [ ] Art Form detail (3 types, description text)
- [ ] Identity detail (linked HF)
- [ ] Historical Era detail (time range)
- [ ] Years and Events browser

**Search and Navigation (8)**:
- [ ] Global search with live autocomplete (accent-insensitive)
- [ ] Three-layer People filter (race pills, variant bars, status/text)
- [ ] Hover popovers on entity links
- [ ] Breadcrumb navigation on all detail pages
- [ ] Prev/Next navigation on all detail pages
- [ ] URL hash tab persistence
- [ ] Row detail overlay in data browser
- [ ] Query results export (CSV/JSON)

**Cross-Cutting (5)**:
- [ ] Cross-linked entity references everywhere
- [ ] Perspective-aware event rendering (caste-aware pronouns)
- [ ] DF calendar formatting
- [ ] Entity name cache (pages load within performance targets)
- [ ] All pages load without errors

### Enhancements (12 items)
- [ ] Unified scoring (prominence + salience badges)
- [ ] Multi-mode graph (pedigree, mentorship, full network)
- [ ] Graph features (degree selector, 6 layouts, edge/node toggles)
- [ ] Hide isolated nodes toggle
- [ ] Inline HF detail expansion
- [ ] Chat popup (SSE streaming)
- [ ] Dual-XML enrichment (events, structures, supplements)
- [ ] Co-member/co-occupant graph wings
- [ ] Site residents tab
- [ ] Ownership timeline
- [ ] Art form composite PK routing
- [ ] Materialized HF settlement links

### Regression Checks (5 SQL queries)
- [ ] R1: 334 relationship supplements
- [ ] R2: ~13,261 circumstance events
- [ ] R3: Structures with deity data
- [ ] R4: 658 art form descriptions
- [ ] R5: Record counts match expected

---

*Phase 2: Explorer Core — Validation Walkthrough v2.0*
*47 verification items covering 30 DoD + 12 enhancements + 5 regression checks*
