# Component Research: Database Explorer Tools

**Component**: Database Explorer Tools
**Date**: 2026-02-25
**Sources**: planning-history.md, legendsviewer-next-research.md, legends-browsers-research.md, narrator-weblegends-research.md, dfhack-infrastructure-research.md, dwarven-surveyor-scripts-research.md, research-synthesis.md

---

## 1. Feature Inventory

This section catalogs every discrete feature relevant to Database Explorer Tools, with user benefit, implementation approach, reference tool inspiration, and complexity estimate.

---

### 1.1 Schema Browser

**Feature ID**: DB-001
**Feature**: Schema Browser — Table List with Row Counts
**User Benefit**: Power users can understand the CDM structure at a glance — see all tables, their row counts, and navigate to any table's schema definition. Essential for developers, modders, and anyone building queries.
**Implementation Approach**: API endpoint `GET /api/explorer/schema/tables` returns list of table names with row counts from `pg_stat_user_tables` or `SELECT count(*) FROM information_schema.tables`. Frontend renders as a scrollable left panel (280px width) with table names and row count badges.
**Reference Tool**: Chronicler existing Schema tab (built). No equivalent in legends browsers (they have no database).
**Complexity**: S (already built)

---

**Feature ID**: DB-002
**Feature**: Schema Browser — Column/Type/PK/FK/Index Detail
**User Benefit**: See the full column definition for any table — column names, types, primary keys, foreign keys, and indexes. Critical for writing correct SQL queries and understanding data relationships.
**Implementation Approach**: API endpoint `GET /api/explorer/schema/tables/{table_name}` returns column definitions from `information_schema.columns`, PK info from `information_schema.table_constraints`, FK info from `information_schema.key_column_usage` joined to `information_schema.referential_constraints`, index info from `pg_indexes`. Two-column layout: table list (left, 280px) + detail panel (right).
**Reference Tool**: Chronicler existing Schema tab (built).
**Complexity**: S (already built)

---

**Feature ID**: DB-003
**Feature**: Schema Browser — Visual FK Relationship Lines
**User Benefit**: See foreign key relationships between tables visually, making it easy to understand how entities connect (e.g., `historical_figures.world_id` -> `worlds.id`). Reduces cognitive load when planning cross-table joins.
**Implementation Approach**: Render FK relationships as visual lines/arrows between table cards in a diagram view. Could use vis.js, D3.js force-directed layout, or a dedicated ERD library. Tables as nodes, FK relationships as edges.
**Reference Tool**: None in existing DF tools (novel feature).
**Complexity**: L

---

**Feature ID**: DB-004
**Feature**: Schema Browser — JSONB Column Field Inventory
**User Benefit**: Many CDM tables use JSONB columns (e.g., `details` on `history_events`, `personality_json` on `units`). Users need to know what fields are actually present inside these JSONB columns to query them effectively.
**Implementation Approach**: API endpoint that samples N rows from a JSONB column and extracts the union of all keys. Return as a nested key tree. Could use `SELECT DISTINCT jsonb_object_keys(details) FROM history_events LIMIT 1000`.
**Reference Tool**: Chronicler existing (partially built — JSONB collapsible in Data tab). LegendsBrowser2 offers `{{ json . }}` debug dump on every page.
**Complexity**: M

---

### 1.2 Data Browser

**Feature ID**: DB-005
**Feature**: Data Browser — Table Selector + Paginated Data Grid
**User Benefit**: Browse any CDM table's contents in a scrollable, paginated grid. Essential for data exploration, verification, and ad-hoc investigation.
**Implementation Approach**: Table selector dropdown, data grid with configurable columns. Server-side pagination via `LIMIT/OFFSET`. API: `GET /api/explorer/data/{table_name}?page=1&per_page=25`. Frontend: data table component with column headers, sortable.
**Reference Tool**: Chronicler existing Data tab (built). LegendsViewer-Next uses `v-data-table-server` with server-side pagination (10/25/50/100 items per page). LegendsBrowser2 uses server-side rendering with 1000 events/page.
**Complexity**: S (already built)

---

**Feature ID**: DB-006
**Feature**: Data Browser — Filter Bar with Column-Level Filtering
**User Benefit**: Filter table data by column values. E.g., filter `historical_figures` WHERE `race = 'DWARF'` AND `is_deity = TRUE`. Dramatically reduces the data a user must scan.
**Implementation Approach**: Filter bar above data grid. Each column gets a filter input. Backend applies WHERE clauses dynamically. Must sanitize inputs (parameterized queries only). API: `GET /api/explorer/data/{table_name}?filter_race=DWARF&filter_is_deity=true`.
**Reference Tool**: Chronicler existing Data tab (built). LegendsBrowser2 `/hfs` supports URL query params: `leader=1`, `deity=1`, `force=1`, `vampire=1`, `werebeast=1`, `necromancer=1`, `alive=1`, `ghost=1`, `adventurer=1`, `race=X`.
**Complexity**: M (partially built)

---

**Feature ID**: DB-007
**Feature**: Data Browser — Column Sorting
**User Benefit**: Sort any column ascending or descending. E.g., sort `historical_figures` by `kill_count DESC` to find the deadliest warriors.
**Implementation Approach**: Clickable column headers toggle sort. Backend applies `ORDER BY` dynamically. Table/column names validated against whitelist. API: `GET /api/explorer/data/{table_name}?sort=kill_count&order=desc`.
**Reference Tool**: LegendsViewer-Next passes `sortKey` + `sortOrder` query parameters. LegendsBrowser `/hfs` supports sort options: name, race, birth, death, kills.
**Complexity**: S (partially built)

---

**Feature ID**: DB-008
**Feature**: Data Browser — FK Link Navigation
**User Benefit**: When viewing a row that references another table (e.g., `hf_id` in `hf_links`), click the FK value to navigate to that entity's detail view. Seamless cross-table exploration.
**Implementation Approach**: Detect FK columns from schema metadata. Render FK values as clickable links. On click, navigate to the referenced table filtered to the target row. Or navigate to the domain-specific detail view if available (e.g., HF detail page).
**Reference Tool**: Chronicler existing Data tab (built — FK links). All legends browsers implement cross-linking as their core UX pattern. weblegends uses `link()` and `event_link()` functions. LegendsBrowser2 uses Go template functions `{{ hf .Id }}`, `{{ entity .Id }}`, etc.
**Complexity**: S (already built)

---

**Feature ID**: DB-009
**Feature**: Data Browser — JSONB Collapsible Expansion
**User Benefit**: JSONB columns contain nested data (event details, personality traits, skill lists). Inline expansion lets users inspect this data without writing queries.
**Implementation Approach**: Render JSONB values as collapsible tree widgets. Click to expand/collapse. Syntax-highlighted JSON with key-value formatting. Deep nesting supported.
**Reference Tool**: Chronicler existing Data tab (built). LegendsBrowser2 `{{ json . }}` debug dump renders full Go struct as JSON on every page.
**Complexity**: S (already built)

---

**Feature ID**: DB-010
**Feature**: Data Browser — Row Detail Overlay/Modal
**User Benefit**: Click any row to see a full-screen detail view with all columns rendered in a readable key-value format, including expanded JSONB, FK links, and related data from other tables.
**Implementation Approach**: Click row -> modal or slide-out panel. Render all columns vertically. JSONB expanded. FK columns render as links. Show related records from FK-linked tables in sub-sections.
**Reference Tool**: LegendsViewer-Next `WorldObjectPage.vue` pattern — detail view with type-specific cards, expandable sections, prev/next navigation.
**Complexity**: M

---

### 1.3 Entity Detail Pages

**Feature ID**: DB-011
**Feature**: Historical Figure Detail Page
**User Benefit**: Comprehensive view of a single HF — biography, relationships, positions, events, skills, kills. The central exploration target for most users.
**Implementation Approach**: API: `GET /api/explorer/hf/{world_id}/{hf_id}` returning full HF record + JOINed data. Frontend: profile card (name, race, caste, sex, birth/death, age, type flags), relationships section, entity memberships, positions held, site links, skills table, key events, identities, artifacts held, graph button.

**Sections (from LegendsViewer-Next HF detail page)**:
1. Profile Overview card (age, birth, death, spheres, positions)
2. Family Tree card (Cytoscape.js, expandable, 360px/720px toggle)
3. Skills card (scrollable list with rank icons and point counts)
4. Related Factions and Groups
5. Related Sites
6. Close Relationships (non-deity HF links with sex-specific labels)
7. Vague Relationships
8. Worshipped Deities (with worship strength: dubious <10, casual <25, average <75, faithful <90, ardent >=90)
9. Journey Pets
10. Noble Positions (with date ranges)
11. Worshipping Figures (if deity)
12. Worshipping Entities (if deity)
13. Notable Kills
14. Artifacts (currently held)
15. Dedicated Structures
16. Snatcher Of (abduction victims)
17. Battles (as attacker/defender/non-combatant)
18. Beast Attacks (if beast)
19. Full Event History (paginated, 1000/page)
20. Entity Reputations (murderer, hero, monster, poet, bard, etc.)
21. Intrigue actors/plots
22. Used Identities
23. Squad links (current and former)
24. Site Property links

**HF Type Flags Display**: deity (gold), force, vampire (red), werebeast (orange), necromancer (purple), ghost (slate), adventurer, leader (crown icon), zombie/skeleton, animated.

**Node visual classes for graph/tree (from LegendsViewer-Next FamilyTree.vue)**:
- `current`: Dashed orange border
- `dead`: 30% opacity
- `male`: Blue background
- `female`: Magenta background
- `leader`: Round-octagon shape with crown icon
- `necromancer`: Round-hexagon with skull icon
- `vampire`: Hexagon with vampire icon
- `werebeast`: Hexagon with wolf icon
- `ghost`: Hexagon with ghost icon

**Reference Tool**: LegendsViewer-Next `HistoricalFigure.vue`, LegendsBrowser2 `hf.html`, weblegends `render_figure.cpp`.
**Complexity**: XL

---

**Feature ID**: DB-012
**Feature**: Entity (Civilization/Group) Detail Page
**User Benefit**: Browse civilization structure — leaders, sites, members, groups, wars. Understand political landscape.
**Implementation Approach**: API: `GET /api/explorer/entity/{world_id}/{entity_id}`. Frontend with tabs:
1. **Leaders** tab: table of leaders with date range (from/till), linked to HF pages
2. **Sites** tab: sites controlled, each with inline event history
3. **Members** tab: member HF list, up to 1,000, clickable headers, client-side sort/filter
4. **Groups** tab: child entities (sub-organizations)
5. **Wars** tab: date range, war name (linked), role (attacking/defending), enemy entity

Plus: mini-map showing owned sites, entity color indicator, race badge, member count, administrative positions with gender-appropriate titles and category-coded badges (Noble=amber, Military=red, Administrator=blue, Other=stone). Full event history.

**Reference Tool**: LegendsViewer-Next entity detail, LegendsBrowser2 `entity.html` (5 tabs), weblegends `render_entity.cpp`.
**Complexity**: XL

---

**Feature ID**: DB-013
**Feature**: Site Detail Page
**User Benefit**: Explore a site's history, structures, ownership, inhabitants. Understand geographic significance.
**Implementation Approach**: API: `GET /api/explorer/site/{world_id}/{site_id}`. Frontend with tabs:
1. **Structures** tab: table of buildings (name, type, ruin status)
2. **Properties** tab: site properties (owner HF, type, linked structure)
3. **History** tab: site-level history events (created, taken over, destroyed, reclaimed)

Plus: mini-map centered on site, world populations (animal populations), inhabitants (named HFs + anonymous populations), artifacts at site, related entities (capital, holy_city, monument, etc.), owner entity with ownership history (`OwnerPeriod` records). Full event list.

**Reference Tool**: LegendsBrowser2 `site.html`, weblegends `render_site.cpp`, LegendsViewer-Next site detail.
**Complexity**: L

---

**Feature ID**: DB-014
**Feature**: Artifact Detail Page
**User Benefit**: Track an artifact's history — creation, holders, location changes, theft, recovery. Artifacts are high-narrative-value entities.
**Implementation Approach**: API: `GET /api/explorer/artifact/{world_id}/{artifact_id}`. Shows: name, item description, material, item type/subtype, page count, contained written content, current location (site), current holder (HF). Chain-of-custody timeline from artifact events (created -> given -> lost -> recovered -> stored). Full event history.
**Reference Tool**: LegendsBrowser2 `artifact.html`, LegendsViewer-Next artifact detail, df-narrator artifact scoring.
**Complexity**: M

---

**Feature ID**: DB-015
**Feature**: Region Detail Page
**User Benefit**: Explore geographic regions — type, evilness, events, contained sites. Geographic context for world understanding.
**Implementation Approach**: API: `GET /api/explorer/region/{world_id}/{region_id}`. Shows: name, type (10 biome types: Wetland, Forest, Grassland, Hills, Desert, Lake, Tundra, Glacier, Ocean, Mountains), evilness (good/evil/neutral), contained sites, full event history. Region outline on map.
**Reference Tool**: LegendsBrowser2 `region.html`, DwarvenSurveyor region rendering with color-coded biomes.
**Complexity**: M

---

**Feature ID**: DB-016
**Feature**: Structure Detail Page
**User Benefit**: Explore individual structures within sites — temples, libraries, keeps, guildhalls. Important for understanding cultural/religious landscape.
**Implementation Approach**: API: `GET /api/explorer/site/{world_id}/{site_id}/structure/{structure_id}`. Shows: name, type (12+ types: mead hall, keep, temple of X, dark tower, market, tomb of X, dungeon/sewers/catacombs, underworld spire, tavern, library, counting house, guildhall, tower), ruin status, parent site, full event history.
**Reference Tool**: LegendsBrowser2 `structure.html`, weblegends `site-N/bld-M` sub-pages.
**Complexity**: S

---

**Feature ID**: DB-017
**Feature**: Written Content Detail Page
**User Benefit**: Browse in-world literature — books, scrolls, compositions. Understand cultural output.
**Implementation Approach**: Shows: name, form (poem, short_story, musical_composition, etc.), author HF link, linked art form, references section (what the work refers to), style list. Full event history. Written content names italicized in links (weblegends pattern).
**Reference Tool**: LegendsBrowser2 `writtencontent.html`, LegendsViewer-Next written content detail.
**Complexity**: S

---

**Feature ID**: DB-018
**Feature**: Event Collection Detail Page (Wars, Battles, etc.)
**User Benefit**: Browse compound events — wars contain battles, battles contain individual events. Essential for understanding conflicts.
**Implementation Approach**: API: `GET /api/explorer/collection/{world_id}/{collection_id}`. Shows collection hierarchy as expandable trees. War page: aggressor/defender, sub-collections (battles, sieges), map with battle markers. Battle page: squads, attackers/defenders, outcome, location. 19 collection types handled.

**Collection types**: battle, war, duel, raid, site conquered, insurrection, persecution, purge, entity overthrown, beast attack, abduction, theft, occasion, procession, ceremony, performance, competition, journey.

**Reference Tool**: LegendsBrowser2 `collection.html` + `collectionDetail.html`, LegendsViewer-Next warfare routes (war/battle/duel/raid/siteconquered + 8 more).
**Complexity**: L

---

**Feature ID**: DB-019
**Feature**: Additional Entity Type Detail Pages
**User Benefit**: Complete world browser coverage — every entity type in the CDM has a dedicated detail page.
**Implementation Approach**: Following LegendsViewer-Next's 70-route pattern (35 list + 35 detail), implement detail pages for:
- Underground Regions
- Landmasses
- Mountain Peaks
- Rivers
- World Constructions (roads, tunnels, bridges)
- Art Forms (Dance, Musical, Poetic)
- Identities (false identities assumed by HFs)
- Historical Eras

Each follows the generic detail page pattern: header, type-specific cards, event history.

**Reference Tool**: LegendsViewer-Next 70 routes, LegendsBrowser2 full route list.
**Complexity**: L (many pages, each individually S/M)

---

### 1.4 Search Infrastructure

**Feature ID**: DB-020
**Feature**: Accent-Insensitive Full-Text Search
**User Benefit**: DF generates names with diacritics (e.g., "Kogan Uzolam", "Arîs Swordarm"). Users must be able to search by typing plain ASCII and still find accented names.
**Implementation Approach**: PostgreSQL `unaccent` extension (already enabled). Search pattern: `unaccent(name) ILIKE unaccent($1)`. API: `GET /api/explorer/search?q=aris` returns matches across all entity types.

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Search query pattern
SELECT id, name, 'hf' as entity_type
FROM historical_figures
WHERE world_id = $1
  AND unaccent(name) ILIKE '%' || unaccent($2) || '%'
LIMIT 50;
```

**Reference Tool**: Chronicler existing (designed, implementation status unclear). All legends browsers do case-insensitive substring search.
**Complexity**: S

---

**Feature ID**: DB-021
**Feature**: Global Search with Live Autocomplete
**User Benefit**: Type anywhere in the app and get instant results across all entity types — HFs, sites, entities, artifacts, regions, etc. The primary navigation mechanism for discovery.
**Implementation Approach**: Search box in top nav. On each keystroke (debounced 200ms), fetch `GET /api/explorer/search?q={term}&limit=50` returning JSON `[{label, value, type, id}]`. Results categorized by entity type. Click result to navigate to detail page.

LegendsBrowser2's approach: custom `autocomplete.js` widget fetching from `/search?term=` endpoint. Returns 50 results max. Navigates directly to result URL on selection.

Full results page: categorized results with counts per category (N Historical Figures, M Sites, K Entities, etc.).

**Search scope** (from LegendsBrowser2): historical figures, entities, sites, structures, regions, artifacts, world constructions, dance forms, musical forms, poetic forms, written contents, landmasses, mountain peaks, identities.

**Reference Tool**: LegendsBrowser2 autocomplete search, LegendsViewer-Next server-side search.
**Complexity**: M

---

**Feature ID**: DB-022
**Feature**: HF Filtering by Type Flags
**User Benefit**: Filter HFs by special characteristics — show only deities, vampires, necromancers, leaders, etc. Essential for targeted exploration.
**Implementation Approach**: Filter controls on HF list page. URL query parameters:
- `leader=1` — only leaders
- `deity=1` — only deities
- `force=1` — only forces
- `vampire=1` — only vampires
- `werebeast=1` — only werebeasts
- `necromancer=1` — only necromancers
- `alive=1` — only living (death_year IS NULL)
- `ghost=1` — only ghosts
- `adventurer=1` — only adventurers
- `race=X` — filter by race

Sort options: name, race, birth, death, kills.

Backend: `WHERE is_deity = TRUE` etc., combined with ILIKE name search.

**Reference Tool**: LegendsBrowser2 `/hfs` page (complete filter set). LegendsBrowser v1 same pattern.
**Complexity**: M

---

**Feature ID**: DB-023
**Feature**: Advanced Query Builder (Visual)
**User Benefit**: Build complex multi-table queries without knowing SQL. Select tables, join conditions, filter criteria, and columns via a visual interface.
**Implementation Approach**: Drag-and-drop or dropdown-based query builder. Select base table, add JOINs by FK relationships, add WHERE clauses via column/operator/value selectors. Preview generated SQL. Execute and display results. Could use libraries like `react-querybuilder` or custom implementation.
**Reference Tool**: None in DF tools (novel feature). Chronicler-specific advantage: persistent database enables complex queries that in-memory tools cannot do.
**Complexity**: XL

---

**Feature ID**: DB-024
**Feature**: Raw SQL Explorer (SQL Runner)
**User Benefit**: Power users can write and execute arbitrary SQL against the CDM. The ultimate exploration tool for developers and data analysts.
**Implementation Approach**: Text area for SQL input. Execute button. Results rendered in data grid. Safety measures:
- Keyword blocklist (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE)
- Read-only transaction: `conn.transaction(readonly=True)`
- Enforced LIMIT cap (e.g., 1000 rows max, auto-appended if missing)
- All dynamic table/column names validated against schema whitelist
- Query timeout (5 seconds)

```python
# SQL Runner safety pattern
BLOCKED_KEYWORDS = {'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'}
async with conn.transaction(readonly=True):
    result = await conn.fetch(query)
```

**Reference Tool**: Chronicler existing SQL Runner (built). No equivalent in any legends browser (they have no database).
**Complexity**: S (already built)

---

### 1.5 Data Export

**Feature ID**: DB-025
**Feature**: Query Results Export (CSV/JSON)
**User Benefit**: Export query results or table data for external analysis in Excel, pandas, R, or other tools.
**Implementation Approach**: Export button on data grid and SQL runner results. Generate CSV or JSON download. API: `GET /api/explorer/data/{table_name}?format=csv` or `POST /api/explorer/sql?format=json`.
**Reference Tool**: None in existing DF tools. Chronicler-specific advantage: API-first design enables external tooling.
**Complexity**: S

---

**Feature ID**: DB-026
**Feature**: Entity Data Export (Full Entity JSON)
**User Benefit**: Export a complete entity record (HF with all relationships, events, positions) as a structured JSON document for external analysis or LLM ingestion.
**Implementation Approach**: "Export" button on entity detail pages. Generates a comprehensive JSON document with all JOINed data. Could follow the df-narrator Markdown export pattern but with richer structured data.
**Reference Tool**: df-narrator Markdown export pattern. weblegends `weblegends-export` BFS static site generation.
**Complexity**: M

---

### 1.6 Cross-Referencing and Navigation

**Feature ID**: DB-027
**Feature**: Cross-Linked Entity References in All Views
**User Benefit**: Every entity reference (HF name, site name, entity name, artifact name) is a clickable link navigating to that entity's detail page. The core UX pattern of all legends browsers.
**Implementation Approach**: All API responses include entity IDs alongside names. Frontend renders entity references as `<a>` links. Pattern: `<a href="/explorer/hf/{world_id}/{hf_id}">{name}</a>`.

**Server-side HTML generation pattern (from LegendsViewer-Next)**:
```html
<a href="/hf/123" title="King&#13Dwarf&#13Born: 50&#13Age: 200">
  <span class="icon">...</span> the dwarf Urist McSomeone
</a>
```

**Go template function pattern (from LegendsBrowser2)**:
```go
{{ hf .Id }} → <a class="hf" href="/hf/123">Urist McHammer</a>
{{ entity .Id }} → <a class="entity" href="/entity/456">The Dagger of Feasting</a>
{{ site .Id }} → <a class="site" href="/site/789">Boatmurdered</a>
```

**Reference Tool**: ALL legends browsers. This is the single most important UX pattern.
**Complexity**: L (pervasive, touches every view)

---

**Feature ID**: DB-028
**Feature**: Hover Popovers for Entity Preview
**User Benefit**: Hover over any entity link to see a compact preview without navigating away. Critical UX for exploration flow — users can quickly assess relevance before clicking.
**Implementation Approach**: API endpoint `GET /api/explorer/popover/{entity_type}/{world_id}/{id}` returning HTML snippet. Frontend: on hover, fetch and display in popover/tooltip.

**Popover content by type**:
- HF: name, race, sex, birth/death, type flags (vampire, etc.)
- Site: name, type, owner entity
- Entity: name, type, race
- Artifact: name, material, current holder
- Region: name, type, evilness
- Structure: name, type, ruin status

**Implementation pattern (from LegendsBrowser2 `layout.html`)**:
```javascript
// Bootstrap popover via Ajax
var popover = new bootstrap.Popover(element, {
    trigger: 'hover',
    html: true,
    content: function() {
        return fetch('/popover/' + type + '/' + id).then(r => r.text());
    }
});
```

**Reference Tool**: LegendsBrowser2 hover popovers (Bootstrap), LegendsBrowser v1 hover popovers (Bootstrap). weblegends does NOT have hover previews. LegendsViewer-Next does NOT have hover previews.
**Complexity**: M

---

**Feature ID**: DB-029
**Feature**: Cross-Tab Navigation
**User Benefit**: Navigate seamlessly between domain tabs. E.g., click a civilization name on the People tab to jump to that entity's Civilizations tab detail. Click a site on a Civilization page to jump to Geography tab.
**Implementation Approach**: "View graph" buttons, entity link navigation, tab state in URL hash. Navigation paths:
- People -> Civilizations (click entity membership)
- People -> Geography (click site link)
- Civilizations -> Geography (click controlled sites)
- Civilizations -> People (click member HFs)
- Geography -> Civilizations (click owner entity)
- Geography -> People (click notable inhabitants)
- Unit <-> HF cross-links (when both exist)
- Any entity -> Graph tab (click "View graph" button)

**URL hash tab persistence (from LegendsBrowser2)**:
```javascript
var hash = document.location.hash;
if (hash && hash.startsWith("#nav-")) {
    var tab = new bootstrap.Tab(document.querySelector('.nav-link[data-bs-target="' + hash + '"]'));
    tab.show();
}
```

**Reference Tool**: Chronicler existing cross-linking (designed). All legends browsers.
**Complexity**: M

---

**Feature ID**: DB-030
**Feature**: Breadcrumb / Prev-Next Navigation
**User Benefit**: Navigate to adjacent entities (prev/next by ID) without returning to list view. Enables rapid sequential browsing.
**Implementation Approach**: Prev/Next floating action buttons (FABs) on detail pages. Navigate to adjacent IDs within the current entity type.

**LegendsViewer-Next pattern** (`WorldObjectPage.vue`): `v-fab` buttons at top-right that navigate to adjacent IDs.

**Reference Tool**: LegendsViewer-Next prev/next FABs. Planning history insight #54: "Breadcrumb/adjacent-ID navigation is essential."
**Complexity**: S

---

**Feature ID**: DB-031
**Feature**: Perspective-Aware Event Rendering
**User Benefit**: When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns ("his wife"), while other entities remain fully linked. Reduces visual noise and reads more naturally.
**Implementation Approach**: Pass current entity ID as context to event rendering. Suppress self-links, use relational pronouns for known relationships.

**weblegends pattern** (`event_link()` in `helpers.cpp`):
```cpp
// If entity matches current page context, render plain text
// Otherwise, render as full <a> link
void event_link(ostream& s, const event_context& context, df::historical_figure* hf) {
    if (context.related(hf)) {
        s << plain_name(hf);  // "the dwarf" or first name
    } else {
        link(s, hf);  // full <a href="fig-123">Urist McHammer</a>
    }
}
```

**LegendsBrowser2 pattern**: `Context` struct with `HfId` field. When `HfId == current_event_hf`, render short name.

**Reference Tool**: weblegends `event_context`, LegendsBrowser2 `Context.HfId`. LegendsViewer-Next does NOT implement this.
**Complexity**: M

---

### 1.7 Graph Visualization

**Feature ID**: DB-032
**Feature**: Ego-Network Graph (vis.js)
**User Benefit**: Visualize the relationship network around any entity — HFs, entities, and sites connected by family, membership, site links, and more. The primary visual exploration tool for understanding social/political networks.
**Implementation Approach**: vis.js canvas with `forceAtlas2Based` physics. Search box with typeahead, world selector, depth selector (1-3 hop). Node info panel with click-to-expand. Performance guard: node count badge, warning at 500+ nodes, refuse expansion at 1,000+ nodes.

**Node styling**:
- HF (default): stone color
- HF (deity): gold
- HF (vampire): red
- HF (necromancer): purple
- HF (werebeast): orange
- HF (ghost): slate
- Entity (civilization): diamond shape, blue
- Entity (religion): diamond shape, purple
- Site: square shape, green

**Edge colors**:
- Family: green
- Spouse: pink
- Enemy: red
- Membership: blue dashed
- Site link: lime dashed

**Reference Tool**: Chronicler existing Graph tab (built). vis.js loaded from CDN. LegendsViewer-Next uses Cytoscape.js for family tree and warfare graph.
**Complexity**: S (already built, but enhancements possible)

---

**Feature ID**: DB-033
**Feature**: Family Tree Visualization
**User Benefit**: See multi-generational genealogy for any HF — parents, children, grandparents. Critical for understanding dynastic relationships.
**Implementation Approach**: Cytoscape.js with `dagre` layout plugin (hierarchical DAG, top-to-bottom). Or SVG custom rendering (LegendsBrowser v1 pattern).

**Cytoscape.js pattern (from LegendsViewer-Next `FamilyTree.vue`)**:
- Nodes: One per HF. Current HF gets `current` class (dashed orange border).
- Edges: Directed parent->child. `mother.id -> current.id`, `father.id -> current.id`, `current.id -> child.id`.
- Depth limit: Max 3 ancestors on each parent line. Children unlimited.
- Node label format: race prefix, title/assignment, divider, highest skill, name, age (with death marker).
- Two display sizes: compact (360px) and fullscreen (720px) via ExpandableCard.
- Click node to navigate to HF detail page.

**SVG pattern (from LegendsBrowser v1)**:
- Custom SVG rendering with `FamilyMember.layout()` algorithm
- Colored `<rect>` nodes (blue=male, pink=female, gold=deity)
- `<polyline>` edges (horizontal for spouse, L-shaped for parent-child)
- Auto-scroll to center on subject

**Reference Tool**: LegendsViewer-Next `FamilyTree.vue` (Cytoscape.js), LegendsBrowser v1 `hffamily.vm` (SVG).
**Complexity**: L

---

**Feature ID**: DB-034
**Feature**: Curse Lineage Tree
**User Benefit**: For vampires and werebeasts, visualize "who bit whom" — the chain of curse transmission traced through `HfDoesInteraction` events back to the original curse source.
**Implementation Approach**: Same tree layout as family tree but tracing `DEITY_CURSE_WEREBEAST_*` and `DEITY_CURSE_VAMPIRE_*` interaction events instead of family links. Root node is Patient Zero.
**Reference Tool**: LegendsBrowser v1 `hffamily.vm` curse lineage tree. Not in LegendsBrowser2. Not in LegendsViewer-Next.
**Complexity**: M

---

**Feature ID**: DB-035
**Feature**: Warfare Graph (Force-Directed)
**User Benefit**: Visualize civilization conflict relationships — which civilizations fought which wars, with what intensity.
**Implementation Approach**: Cytoscape.js with `cola` layout (force-directed physics). Nodes: civilizations (round-hexagon) and battles/wars (roundrectangle). Edges: attack/defense relationships with labels and widths proportional to battle size. Edge tooltips via `tippy.js`. Click to navigate.

**LegendsViewer-Next `WarfareGraph.vue` pattern**:
```javascript
const layout = {
    name: 'cola',
    animate: true,
    nodeSpacing: 50
};
// tippy.js tooltips on edges
cy.edges().forEach(edge => {
    tippy(edge.popperRef(), { content: edge.data('label') });
});
```

**Reference Tool**: LegendsViewer-Next `WarfareGraph.vue`.
**Complexity**: M

---

**Feature ID**: DB-036
**Feature**: War Chord Diagram (D3.js)
**User Benefit**: At-a-glance overview of all inter-civilization war relationships. Each civilization is an arc; chords connect warring pairs.
**Implementation Approach**: D3.js v3+ chord/ribbon diagram. Each civilization as arc segment. Chords connect warring civilizations. Hover highlights related chords. Civilization colors from HSV rotation algorithm.
**Reference Tool**: LegendsBrowser v1 `indexWars.vm` (D3 chord diagram). Not in LegendsBrowser2. Not in LegendsViewer-Next.
**Complexity**: M

---

### 1.8 List Views

**Feature ID**: DB-037
**Feature**: Paginated Entity List Views with Server-Side Search
**User Benefit**: Browse lists of all HFs, all sites, all entities, etc. with text search and pagination. The primary entry point for finding specific entities.
**Implementation Approach**: Generic list view component. Server-side pagination and search. API: `GET /api/explorer/{entity_type}?page=1&per_page=25&q=search_term&sort=name&order=asc`.

**LegendsViewer-Next pattern** (`WorldObjectsPage.vue`):
- Header with icon, title, subtitle, optional DF Wiki button
- Search text field (instant-filter on keystroke)
- `v-data-table-server` with server-side pagination and sorting
- Total count badge (cyan chip)
- Items per page options: 10, 25, 50, 100

**Table columns by entity type** (from LegendsViewer-Next):
| List View | Columns |
|-----------|---------|
| Historical Figures | Id, Name (html), Type (race), Caste, Chronicles count, Events count |
| Sites | Id, Name, Type, Subtype, Chronicles, Events |
| Entities | Id, Name, Type, Subtype, Chronicles, Events |
| Wars | Start, End, Name (html), Type, Subtype, Chronicles, Events |
| Artifacts | Id, Name, Type, Subtype, Chronicles, Events |

**Reference Tool**: LegendsViewer-Next `WorldObjectsPage.vue`, LegendsBrowser2 all list pages.
**Complexity**: M

---

**Feature ID**: DB-038
**Feature**: Year-Based Event Browser
**User Benefit**: Browse all events chronologically by year. See what happened in year 125, year 250, etc. Essential for understanding world timeline.
**Implementation Approach**: `/years` page lists all years with event counts. `/year/{id}` shows all events in that year, rendered as narrative sentences. Season display in timestamps: "early spring of 125" (from LegendsBrowser2).

**DF Calendar conversion** (from df-narrator, weblegends):
```python
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1
months = ["Granite", "Slate", "Felsite", "Hematite", "Malachite", "Galena",
          "Limestone", "Sandstone", "Timber", "Moonstone", "Opal", "Obsidian"]
```

**Reference Tool**: LegendsBrowser2 `/years` and `/year/{id}` pages.
**Complexity**: M

---

**Feature ID**: DB-039
**Feature**: Event Type Browser
**User Benefit**: See all known event types and browse all events of a specific type. E.g., "show me all artifact creation events."
**Implementation Approach**: `/events` lists all event types with counts. `/events/{type}` shows all events of that type chronologically.
**Reference Tool**: LegendsBrowser2 `/events` and `/events/{type}` pages. Not in LegendsBrowser v1 or LegendsViewer-Next.
**Complexity**: M

---

### 1.9 Events & Timeline Tab

**Feature ID**: DB-040
**Feature**: Events & Timeline Tab with Filtering
**User Benefit**: Browse historical events chronologically with participant filtering, year range selection, event type filtering, and source filtering (legends vs. live).
**Implementation Approach**: Controls: year range slider, event type dropdown, participant search, source filter ("All Events" / "Legends Only" / "Live Only"). Event list: chronological table with year, type, participants (clickable), location (clickable). Default: showing only events at the fortress site or involving fortress denizens.
**Reference Tool**: Planning history section 3.2 (Events & Timeline Tab). LegendsViewer-Next event sections.
**Complexity**: L

---

**Feature ID**: DB-041
**Feature**: Event Detail Cards with Context-Aware Rendering
**User Benefit**: Each event rendered as a rich narrative sentence with clickable entity references, circumstance/reason fields, and appropriate level of detail.
**Implementation Approach**: Per-event-type rendering templates (132+ types). Each generates a prose sentence.

**Event rendering pipeline**:
```
Event (CDM row) -> Context (target entity + related entities) -> Template (per-type prose) -> HTML (with entity links)
```

**Circumstance/Reason rendering** (from weblegends `helpers/circumstance.cpp`):
- Reasons: `glorify_hf` -> "in order to glorify [HF]", `artifact_is_heirloom` -> "of the [HF] family", `as_symbol_of_peace` -> "as a symbol of everlasting peace", `artifact_is_symbol_of_position` -> "as a symbol of authority within [entity]"
- Circumstances: Death -> "after the death of [HF]", Prayer -> "after praying to [HF]", DreamAbout -> "after dreaming about [HF]", Dream -> "after a dream", Nightmare -> "after a nightmare", FromAfar -> "from afar"

**Reference Tool**: weblegends 94 event `.cpp` files, LegendsBrowser2 132 event `Html()` implementations, LegendsViewer-Next event rendering.
**Complexity**: XL

---

**Feature ID**: DB-042
**Feature**: Event Collection Hierarchy View (War -> Battle -> Event Trees)
**User Benefit**: Understand the structure of conflicts. Wars contain battles, battles contain individual events. Expandable tree view shows this hierarchy.
**Implementation Approach**: Expandable tree UI component. War node expands to show battle nodes, each battle expands to show member events. Each level shows summary (dates, participants, outcome).

**19 collection types**: battle, war, duel, raid, site_conquered, insurrection, persecution, purge, entity_overthrown, beast_attack, abduction, theft, occasion, procession, ceremony, performance, competition, journey.

**Reference Tool**: Planning history section 3.2, LegendsBrowser2 `collectionDetail.html`.
**Complexity**: L

---

### 1.10 People Tab

**Feature ID**: DB-043
**Feature**: People Tab — Unified HF/Unit Search
**User Benefit**: Single searchable interface merging historical figures and in-game units. Users don't need to know which data source has a person's record.
**Implementation Approach**: Left panel: searchable list with type badges (HF/Unit), race filter, alive/dead filter. Search supports both Dwarvish names and English translations. Right panel: detail card with biographical info, relationships, entity memberships, skills, key life events, graph button.
**Reference Tool**: Chronicler existing People tab (built). Planning history section 3.2.
**Complexity**: M (partially built)

---

**Feature ID**: DB-044
**Feature**: People Tab — Fortress Folk View (Phase 3)
**User Benefit**: Default view showing only fortress denizens — the people the player cares about most — sorted by narrative importance.
**Implementation Approach**: "Fortress Folk" default view: only `fortress_denizens` WHERE `status IN ('resident', 'deceased', 'missing')`, sorted by NVS (narrative value score). Status badges: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark). NVS column: sortable.
**Reference Tool**: Planning history section 3.2 (Fortress Folk View).
**Complexity**: M

---

**Feature ID**: DB-045
**Feature**: People Tab — Unified Person Detail (Phase 3)
**User Benefit**: Click any denizen to see a merged Unit + HF view with combined personality, historical data, combined event timeline (legends + live-generated), relationships from both sources.
**Implementation Approach**: Merge Unit data (live, personality, skills, labors) with HF data (historical events, positions, relationships). For conflicts: prefer Unit for real-time data, prefer HF for historical facts. Display both Dwarvish and English names.

**Unified Person JSON schema** (from planning history):
```json
{
  "name": "Urist McHammer",
  "english_name": "Suntin",
  "race": "Dwarf",
  "caste": "Female",
  "birth_year": 23,
  "age": 127,
  "is_alive": true,
  "profession": "Legendary Miner",
  "civilization": "The Dagger of Feasting",
  "relationships": [{"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345}],
  "personality": {"notable_traits": ["Very brave"], "values": ["Family"]},
  "positions_held": [{"title": "Militia Commander", "entity": "...", "current": true}],
  "skills": [{"name": "Mining", "level": 20, "label": "Legendary"}],
  "key_events": [{"year": 45, "type": "slew", "description": "Slew a forgotten beast"}],
  "sources": {"unit_id": 567, "hf_id": 12340, "world_id": 8}
}
```

**Reference Tool**: Planning history section 3.2, section 4.3 (Unit-HF merge strategy).
**Complexity**: L

---

### 1.11 Civilization Tab

**Feature ID**: DB-046
**Feature**: Civilizations Tab — Entity Browser with Grouped Types
**User Benefit**: Browse entities grouped by type: civilizations, religions, military orders. Filter, sort, and explore political landscape.
**Implementation Approach**: Left panel: entity list grouped by type, with race badges and member counts. Filter + sort. Right panel: detail card with entity name, type, race, positions table, notable members, controlled sites, related events.

**Position display**: Gender-appropriate titles with category-coded badges (Noble=amber, Military=red, Administrator=blue, Other=stone).

**Reference Tool**: Chronicler existing Civilizations tab (built). LegendsBrowser2 entity detail (5 tabs). Planning history section 3.2.
**Complexity**: M (partially built)

---

### 1.12 Geography Tab

**Feature ID**: DB-047
**Feature**: Geography Tab — Site/Region/Structure Browser
**User Benefit**: Explore the physical world — sites grouped by type, regions with terrain, structures within sites.
**Implementation Approach**: Left panel: sites grouped by type. Filter + sort. Right panel: site detail with structures, owner civ, notable inhabitants, historical events. Regions list with type. Cross-linking: clicking a site from Civilizations tab navigates to Geography tab detail.
**Reference Tool**: Chronicler existing Geography tab (built). Planning history section 3.2.
**Complexity**: M (partially built)

---

### 1.13 Importance Scoring & Sorting

**Feature ID**: DB-048
**Feature**: Entity Importance Scoring (NVS / Narrative Value Score)
**User Benefit**: Entities ranked by narrative importance. Most interesting HFs, sites, artifacts rise to top. Enables "show me the most important figures" queries.
**Implementation Approach**: Compute on ingestion using df-narrator formulas. Store as column on CDM tables.

**Figure Importance Score** (from df-narrator):
```python
s = min(event_count * 2, 500)          # events, capped at 500
s += kill_count * 15                    # kills
s += 80 if vampire else 0              # vampire bonus
s += 100 if necromancer else 0          # necromancer bonus
s += 120 if deity else 0               # deity bonus
s += 90 if force else 0                # force bonus
s += 70 if megabeast else 0            # megabeast bonus
s += min(len(hf_links) * 3, 100)       # HF relationships, capped
s += leadership_positions * 20          # positions
s += artifacts_held * 30               # artifacts
s += len(spheres) * 10                 # deity spheres
s += min(skill_bonus, 80)             # skills, capped
s += min(site_links * 5, 50)          # site associations
s += min(entity_links * 3, 60)        # entity links
s += 5 if death_recorded else 0        # death recorded
```

**Site Importance Score**: `events + deaths*2 + event_collections*5 + structures*3`

**Conflict Importance Score**: `deaths*3 + battles*10 + sites_involved*5 + duration_years`

**Artifact Importance Score**: `events*10 + unique_holders*20 + 30 if lost/stolen + 50 if named`

**Reference Tool**: df-narrator scoring formulas. Planning history section 3.3.
**Complexity**: M

---

### 1.14 Database Tab (Combined Schema + Data)

**Feature ID**: DB-049
**Feature**: Database Tab — Combined Schema Browser + Data Browser
**User Benefit**: Single tab for database power users. Browse schema on the left, data on the right, run SQL at the bottom. Everything a database explorer needs in one place.
**Implementation Approach**: "Database" tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries. Power-user access must not be removed.
**Reference Tool**: Chronicler existing Schema + Data tabs (built). Planning history section 3.2.
**Complexity**: S (already built, needs tab reorganization)

---

---

## 2. Data Requirements

### 2.1 CDM Tables Required

| Table | Status | Usage in Explorer |
|-------|--------|-------------------|
| `worlds` | Built | World selector |
| `historical_figures` | Built | People tab, HF detail, graph |
| `units` | Built | People tab, unit detail |
| `entities` | Built | Civilizations tab, entity detail |
| `sites` | Built | Geography tab, site detail |
| `structures` | Built | Geography tab, structure detail |
| `regions` | Built | Geography tab, region detail |
| `underground_regions` | Built | Geography tab |
| `history_events` | Built | Events tab, all entity event histories |
| `history_event_collections` | Built | Events tab, collection views |
| `artifacts` | Built | Artifact detail |
| `hf_links` | Built | HF relationships, family tree |
| `hf_entity_links` | Built | HF entity memberships |
| `hf_site_links` | Built | HF site associations |
| `entity_positions` | Built | Entity position definitions |
| `hf_position_links` | Built | HF position assignments |
| `written_contents` | Built | Written content detail |
| `historical_eras` | Built | Era detail |
| `fortress_denizens` | Planned | Fortress Folk view |
| `knowledge_horizon` | Planned | Knowledge Horizon masking |
| `landmasses` | Partial | Landmass detail |
| `mountain_peaks` | Partial | Mountain detail |
| `world_constructions` | Missing | World construction detail |
| `art_forms` (3 types) | Missing | Art form detail pages |
| `identities` | Missing | Identity detail, HF false identities |
| `rivers` | Missing | River detail |
| `entity_populations` | Partial | Population stats, charts |

### 2.2 Required Indexes

```sql
-- Search indexes (accent-insensitive)
CREATE INDEX idx_hf_name_unaccent ON historical_figures (world_id, unaccent(name));
CREATE INDEX idx_entity_name_unaccent ON entities (world_id, unaccent(name));
CREATE INDEX idx_site_name_unaccent ON sites (world_id, unaccent(name));
CREATE INDEX idx_artifact_name_unaccent ON artifacts (world_id, unaccent(name));

-- FK lookup indexes
CREATE INDEX idx_events_world_year ON history_events (world_id, year);
CREATE INDEX idx_events_type ON history_events (world_id, type);
CREATE INDEX idx_events_site ON history_events (world_id, site_id);
CREATE INDEX idx_hf_links_source ON hf_links (world_id, hf_id_1);
CREATE INDEX idx_hf_links_target ON hf_links (world_id, hf_id_2);
CREATE INDEX idx_hf_entity_links_hf ON hf_entity_links (world_id, hf_id);
CREATE INDEX idx_hf_entity_links_entity ON hf_entity_links (world_id, entity_id);
CREATE INDEX idx_hf_site_links_hf ON hf_site_links (world_id, hf_id);
CREATE INDEX idx_hf_position_links_hf ON hf_position_links (world_id, hf_id);

-- Importance score indexes (for sorted list views)
CREATE INDEX idx_hf_importance ON historical_figures (world_id, importance_score DESC);
CREATE INDEX idx_site_importance ON sites (world_id, importance_score DESC);

-- Event collection lookup
CREATE INDEX idx_collection_events ON collection_events (world_id, collection_id);
```

### 2.3 Required Views

```sql
-- Visible historical figures (Knowledge Horizon masking)
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE (world_id, id) IN (
    SELECT world_id, entity_id FROM knowledge_horizon
    WHERE entity_type = 'hf' AND visible = true
);

-- Fortress denizens with merged Unit+HF data
CREATE VIEW fortress_folk AS
SELECT
    d.id, d.name, d.english_name, d.race, d.status, d.embark,
    d.narrative_value, d.arrival_year, d.departure_year,
    u.profession, u.stress_level, u.mood,
    hf.birth_year, hf.death_year, hf.kill_count, hf.event_count
FROM fortress_denizens d
LEFT JOIN units u ON d.world_id = u.world_id AND d.unit_id = u.id
LEFT JOIN historical_figures hf ON d.world_id = hf.world_id AND d.hf_id = hf.id;

-- Event summary per entity (for event count badges)
CREATE VIEW entity_event_counts AS
SELECT world_id, type, COUNT(*) as event_count
FROM history_events
GROUP BY world_id, type;
```

### 2.4 Required Column Additions

```sql
-- Importance scoring columns
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.0;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 0.0;

-- HF flag columns (if not already present)
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_deity BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_force BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_vampire BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_werebeast BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_necromancer BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS is_adventurer BOOLEAN DEFAULT FALSE;

-- Event source tracking
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
```

---

## 3. UI/UX Patterns

### 3.1 Tab Architecture

**Final tab order**: `People | Civilizations | Geography | Events | Database | Graph`

- **People**: Unified HF + Unit search. Fortress Folk default. Merged person detail.
- **Civilizations**: Entity browser with type grouping. Tabbed detail (Leaders/Sites/Members/Groups/Wars).
- **Geography**: Site browser with type grouping. Region, structure, landmass, mountain detail.
- **Events**: Chronological event browser with filters. Event collection trees. Year browser.
- **Database**: Schema browser + data browser + SQL runner. Power-user access.
- **Graph**: vis.js ego-network. Launchable from any domain view via "View graph" buttons.

### 3.2 Top Navigation

- Top nav bar: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`)
- Active page highlighted in amber
- Implemented as Jinja2 partial: `_nav.html`

### 3.3 List-Detail Pattern

All entity pages follow the same pattern:
1. **Left panel** (280px): Scrollable entity list with search box, type filter, sort controls
2. **Right panel**: Detail card with type-specific sections

From LegendsViewer-Next:
- **List view** (`WorldObjectsPage.vue`): Header icon + title + subtitle, search field, `v-data-table-server`, total count badge
- **Detail view** (`WorldObjectPage.vue`): Prev/Next FABs, header, mini-map card, type-specific cards via named slots, ExpandableCard sections

### 3.4 ExpandableCard Pattern

From LegendsViewer-Next: collapsible card with compact-content (default visible) and expanded-content (shown when expanded). Used for Events section (compact = line chart, expanded = full event table + bar chart), Family Tree (compact = 360px, expanded = 720px), etc.

### 3.5 Color System

**Civilization Colors**: HSV rotation algorithm. Medium saturation for first 6 races, lighter for 7-12, darker for 13-18. Applied consistently across: map markers, warfare graph nodes, civilization list items, entity badges.

**Entity type icons** (from LegendsBrowser2 `icons.go`): Font Awesome CSS classes mapped to entity/site/structure/artifact types. Used in map markers, list views, entity links.

**HF type badges**: crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity.

**Status badges**: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark).

**Position category badges**: Noble=amber, Military=red, Administrator=blue, Other=stone.

### 3.6 Dark Mode

Bootstrap 5 dark mode via `bootstrap-dark.css` (LegendsBrowser2 pattern). Auto-applied.

### 3.7 JSON Debug Dump

From LegendsBrowser2: every entity page ends with `{{ json . }}` rendering the complete struct as JSON. Extremely useful during development. Chronicler should include a toggleable "Debug: Show Raw JSON" option on detail pages.

---

## 4. Implementation Architecture

### 4.1 API Routes

**Schema Browser**:
```
GET /api/explorer/schema/tables                    -> [{name, row_count}]
GET /api/explorer/schema/tables/{name}             -> {columns, pks, fks, indexes}
GET /api/explorer/schema/tables/{name}/jsonb/{col} -> {keys: [...]}
```

**Data Browser**:
```
GET /api/explorer/data/{table}?page=1&per_page=25&sort=name&order=asc&filter_*=*  -> {items, totalCount}
POST /api/explorer/sql                             -> {columns, rows, rowCount, executionTime}
GET /api/explorer/export/{table}?format=csv        -> CSV file download
```

**Entity Detail Pages**:
```
GET /api/explorer/hf/{world_id}/{id}               -> HF full detail
GET /api/explorer/entity/{world_id}/{id}            -> Entity full detail
GET /api/explorer/site/{world_id}/{id}              -> Site full detail
GET /api/explorer/artifact/{world_id}/{id}          -> Artifact full detail
GET /api/explorer/region/{world_id}/{id}            -> Region full detail
GET /api/explorer/structure/{world_id}/{site_id}/{id} -> Structure detail
GET /api/explorer/collection/{world_id}/{id}        -> Event collection detail
GET /api/explorer/writtencontent/{world_id}/{id}    -> Written content detail
GET /api/explorer/era/{world_id}/{id}               -> Era detail
```

**List Pages**:
```
GET /api/explorer/hfs?world_id=8&page=1&q=*&sort=*&deity=1&vampire=1&race=*  -> {items, totalCount}
GET /api/explorer/entities?world_id=8&type=civilization                       -> {items, totalCount}
GET /api/explorer/sites?world_id=8&type=fortress                             -> {items, totalCount}
GET /api/explorer/artifacts?world_id=8                                        -> {items, totalCount}
GET /api/explorer/collections?world_id=8&type=war                            -> {items, totalCount}
```

**Events**:
```
GET /api/explorer/events?world_id=8&year_min=1&year_max=250&type=*&hf_id=*&site_id=*&source=*&page=1
GET /api/explorer/events/types                     -> [{type, count}]
GET /api/explorer/events/years                     -> [{year, count}]
GET /api/explorer/events/year/{year}               -> {events}
GET /api/explorer/event/{world_id}/{id}            -> Single event detail
```

**Search**:
```
GET /api/explorer/search?q={term}&world_id=8&limit=50  -> [{label, value, type, id}]
```

**Popovers**:
```
GET /api/explorer/popover/{entity_type}/{world_id}/{id} -> HTML snippet
```

**Graph**:
```
GET /api/explorer/graph/{entity_type}/{world_id}/{id}?depth=2  -> {nodes, edges}
GET /api/explorer/familytree/{world_id}/{hf_id}?depth=3        -> {nodes, edges}
```

**Charts/Data**:
```
GET /api/explorer/{type}/{world_id}/{id}/eventchart      -> {labels, data} (events per year)
GET /api/explorer/{type}/{world_id}/{id}/eventtypechart   -> {labels, data} (event type breakdown)
GET /api/explorer/world/{world_id}/population             -> {labels, data} (population by race)
```

### 4.2 Frontend Components

**Current stack**: FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js

**Target stack** (from planning history): SvelteKit or Vue 3 + Vuetify 3 (decision pending). For now, existing Jinja2 + vanilla JS + Tailwind CSS.

**Key frontend components**:
- `EntityList` — generic scrollable list with search, filter, pagination
- `EntityDetail` — generic detail card with type-specific sections
- `DataGrid` — paginated sortable table for data browser and event lists
- `SqlRunner` — SQL input + result grid
- `SchemaViewer` — table list + column detail
- `GraphViewer` — vis.js ego-network wrapper
- `FamilyTree` — Cytoscape.js dagre tree
- `WarfareGraph` — Cytoscape.js cola force-directed
- `EventTimeline` — Chart.js line chart (events per year)
- `PopulationChart` — Chart.js doughnut (population by race)
- `EventTypeChart` — Chart.js bar chart (event type breakdown)
- `Popover` — hover-triggered entity preview
- `ExpandableCard` — compact/expanded toggle card
- `SearchBar` — global autocomplete search

### 4.3 Search Infrastructure

**PostgreSQL `unaccent` extension**: Already enabled. Used for accent-insensitive search across all name columns.

**Search query pattern**:
```sql
-- Multi-entity search
SELECT id, name, 'hf' as entity_type, importance_score
FROM historical_figures
WHERE world_id = $1 AND unaccent(name) ILIKE '%' || unaccent($2) || '%'
UNION ALL
SELECT id, name, 'entity', NULL
FROM entities
WHERE world_id = $1 AND unaccent(name) ILIKE '%' || unaccent($2) || '%'
UNION ALL
SELECT id, name, 'site', importance_score
FROM sites
WHERE world_id = $1 AND unaccent(name) ILIKE '%' || unaccent($2) || '%'
UNION ALL
SELECT id, name, 'artifact', importance_score
FROM artifacts
WHERE world_id = $1 AND unaccent(name) ILIKE '%' || unaccent($2) || '%'
ORDER BY importance_score DESC NULLS LAST
LIMIT 50;
```

**Full-text search upgrade (future)**: PostgreSQL `tsvector` + `tsquery` for weighted full-text search across entity descriptions, event details, JSONB fields.

---

## 5. Existing Implementation Status

### 5.1 What Is Built (6 Explorer Tabs)

| Tab | Status | Description |
|-----|--------|-------------|
| **People** | COMPLETE (Phase 1-7) | Searchable HF + Unit list, detail cards, biography, relationships, entity memberships, skills |
| **Civilizations** | COMPLETE | Entity browser grouped by type, positions table with gender-appropriate titles, notable members, controlled sites |
| **Geography** | COMPLETE | Sites grouped by type, regions list, structure detail |
| **Schema** | COMPLETE | Table list with row counts, column/type/PK/FK/index detail |
| **Data** | COMPLETE | Table selector, filter bar, data grid with FK links, JSONB collapsible, pagination, SQL Runner |
| **Graph** | COMPLETE | vis.js ego-network, typeahead search, depth selector (1-3 hop), performance guard |

### 5.2 What Is Planned But Not Built

| Feature | Phase | Effort |
|---------|-------|--------|
| Events & Timeline tab | Phase 4 | 4-6 hrs |
| Fortress Folk view (People tab) | Phase 3 | Part of 8-10 hrs |
| Unified Person detail (Unit+HF merge) | Phase 3 | Part of 8-10 hrs |
| Interactive world map (Leaflet.js) | Phase 5+ | Large |
| Family tree visualization | Phase 5+ | Medium |
| Hover popovers | Phase 5+ | Medium |
| Global search with autocomplete | Phase 5+ | Medium |
| Event timeline charts | Phase 5+ | Medium |
| Population charts | Phase 5+ | Small |
| Warfare graph | Phase 5+ | Medium |
| Importance scoring | Phase 5+ | Medium |
| War/battle collection trees | Phase 4 | Part of 4-6 hrs |
| Artifact detail page | Not scheduled | Medium |
| Written content detail page | Not scheduled | Small |
| Context-aware event rendering | Not scheduled | Medium |
| Accent-insensitive search | Phase 5 item | Small |
| Breadcrumb/prev-next navigation | Not scheduled | Small |
| Data export (CSV/JSON) | Not scheduled | Small |
| Cross-tab navigation | Partially built | Medium |

### 5.3 Technical Debt / Known Issues

- Single-world simplification: `world_id=8` hardcoded in frontend API calls (world selector needed for multi-world)
- No event type rendering templates (events displayed as raw type strings + JSONB)
- No importance scoring computed
- No hover popovers
- No autocomplete search
- No chart/visualization beyond vis.js graph
- SQL Runner built but may need safety hardening review

---

## 6. Open Questions & Design Decisions

### 6.1 Frontend Framework

**Status**: Undecided. Current implementation: Jinja2 + vanilla JS + Tailwind CSS. Planning history mentions both SvelteKit and Vue 3 + Vuetify 3 as candidates. LegendsViewer-Next uses Vue 3 + Vuetify 3. LegendsBrowser2 uses Go templates + Bootstrap 5.

**Tradeoff**: Jinja2 is fastest to iterate (no build step) but limits interactivity. Vue/Svelte enables richer UX but requires build pipeline.

**Recommendation**: Keep Jinja2 + vanilla JS for now (matches existing codebase). Migrate to SvelteKit or Vue 3 when UI complexity demands it (likely Phase 5+).

### 6.2 Multi-World Support in Explorer

**Status**: Composite PKs built. Frontend currently hardcodes `world_id=8`. Need world selector widget.

**Decision needed**: URL structure. Options:
- `/explorer?world=8` (query parameter)
- `/explorer/world/8/hf/123` (URL path)
- Session-scoped world selection (stored in cookie/localStorage)

### 6.3 Event Rendering Strategy

**Status**: No per-type rendering implemented. Events displayed as raw type + JSONB.

**Options**:
1. **Template-based** (like LegendsBrowser2): Per-type Python template functions generating HTML strings. 132+ templates needed.
2. **LLM-based** (novel): Pass event data to LLM for natural-language rendering. Slower but richer.
3. **Hybrid**: Templates for common types (top 50 by frequency), LLM for rare types and narrative enrichment.

**Recommendation**: Start with templates for the most frequent types. Add LLM enhancement later.

### 6.4 Hover Popover Implementation

**Status**: Not implemented.

**Options**:
1. **Server-side HTML** (LegendsBrowser2 pattern): Fetch `/popover/{type}/{id}` returning HTML. Simple but requires round-trip per hover.
2. **Inline data** (embedded in initial page load): Include minimal popover data in list view responses. Faster but increases payload.
3. **Client-side cache**: Fetch on first hover, cache in memory. Best UX but requires cache invalidation logic.

**Recommendation**: Server-side HTML with client-side cache (fetch once, cache forever within session).

### 6.5 BUG-002: Multi-Participant Events

**Status**: Events with 10+ participants store only first two HF IDs. Design decision pending.

**Options**:
- JSONB array in `details` column (current approach, already stored)
- Junction table `event_participants(event_id, hf_id, role)`

**Impact on Explorer**: Junction table enables "show all events involving HF #123" via JOIN. JSONB requires scanning.

### 6.6 Knowledge Horizon Integration in Explorer

**Status**: Designed but not implemented.

**Decision**: Should the explorer respect Knowledge Horizon masking? Options:
1. **Always show everything** (explorer is a "god mode" view)
2. **Default to masked, toggle to show all** (more immersive)
3. **Masked in People/Events tabs, unmasked in Database tab** (power users get full access)

### 6.7 Chart Library

**Status**: vis.js for graph only.

**Options**: Chart.js (used by LegendsViewer-Next), D3.js (used by LegendsBrowser v1), Observable Plot. Chart.js is simpler; D3 is more flexible for custom visualizations.

**Recommendation**: Chart.js for standard charts (line, bar, doughnut). D3.js for custom visualizations (chord diagram, population treemap). Cytoscape.js for graph layouts (family tree, warfare graph).

### 6.8 Entity Page Depth vs. Explorer Tab Depth

**Question**: Should entity detail pages live within the explorer tab system (left-panel/right-panel pattern) or as standalone full-page views (like LegendsViewer-Next)?

**Current**: Left-panel/right-panel within tabs.

**Consideration**: As detail pages get richer (20+ sections on HF page), the right-panel may be too constrained. Full-page views with breadcrumb navigation may be needed.

---

## 7. Reference Tool Feature Comparison

| Feature | LV-Next | LB1 | LB2 | weblegends | Chronicler Status |
|---------|---------|-----|-----|------------|-------------------|
| Schema browser | No | No | No | No | **BUILT** |
| Data grid with pagination | Server-side (Vuetify) | No | Server-side (Go) | 1000/page | **BUILT** |
| SQL Runner | No | No | No | No | **BUILT** |
| JSONB expansion | No | No | JSON debug dump | No | **BUILT** |
| FK link navigation | HTML anchors | HTML anchors | HTML anchors | HTML anchors | **BUILT** |
| Ego-network graph | Cytoscape | No | No | No | **BUILT** (vis.js) |
| Global search | Server-side text | Autocomplete + full results | Autocomplete + full results | No | **NOT BUILT** |
| Hover popovers | No | Bootstrap Ajax | Bootstrap Ajax | No | **NOT BUILT** |
| HF filter by type flags | No | URL params | URL params | N/A | **PARTIAL** |
| Accent-insensitive search | No | No | No | No | **DESIGNED** |
| Paginated event history | Chart.js + table | Per-page | Per-page | 1000/page grouped by year | **NOT BUILT** |
| Event type rendering (132+) | HTML strings | HTML Go templates | HTML C++ ostream | **NOT BUILT** |
| Family tree | Cytoscape dagre | SVG custom | No | No | **NOT BUILT** |
| Warfare graph | Cytoscape cola | No | No | No | **NOT BUILT** |
| Event timeline chart | Chart.js line | No | No | No | **NOT BUILT** |
| Population chart | Chart.js doughnut | D3 donut | No | No | **NOT BUILT** |
| War chord diagram | No | D3 chord | No | No | **NOT BUILT** |
| Importance scoring | No | No | No | 4 formulas (output only) | **NOT BUILT** |
| Cross-linked event HTML | Server-side HTML + v-html | Go templates + popover | Go templates + popover | C++ link() + event_link() | **PARTIAL** |
| Perspective-aware rendering | No | No | Yes (Context.HfId) | Yes (event_context) | **NOT BUILT** |
| Data export (CSV/JSON) | No | No | No | Static HTML export | **NOT BUILT** |
| Breadcrumb/prev-next | FAB buttons | No | No | No | **NOT BUILT** |
| Multi-world support | Bookmark system | Single world | Single world | Live game | **SCHEMA READY** |

---

## 8. Implementation Priority Matrix

| Priority | Features | Effort | Justification |
|----------|----------|--------|---------------|
| **P0 (built)** | Schema browser, data grid, SQL runner, JSONB expansion, FK links, vis.js graph, People/Civ/Geo tabs | Done | Foundation complete |
| **P1 (critical)** | Events tab, event collection trees, cross-linked entity references, accent-insensitive search | L | Enables event browsing — the core exploration activity |
| **P2 (high)** | Global search + autocomplete, HF filter flags, hover popovers, importance scoring, entity detail pages (artifact, collection, written content) | L | Search and scoring transform usability |
| **P3 (medium)** | Family tree, event timeline charts, population charts, breadcrumb navigation, Fortress Folk view, unified person detail | L | Visualization and fortress-centric views |
| **P4 (future)** | Warfare graph, war chord diagram, curse lineage tree, visual query builder, interactive Leaflet map integration, data export, full Knowledge Horizon in explorer | XL | Polish and advanced features |

---

## 9. Sources

All feature details extracted from:

1. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/planning-history.md` — Sections 1.4, 2.5, 3.2, 4.1-4.6, 7.1-7.9, 10.4-10.6, 11, 13
2. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/legendsviewer-next-research.md` — Sections 1, 4, 7-11
3. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/legends-browsers-research.md` — Sections 2, 5-8, 11-12
4. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/narrator-weblegends-research.md` — Part I (scoring), Part II (event rendering, cross-linking, page structure)
5. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/dfhack-infrastructure-research.md` — Sections 3 (df-structures data model), 5 (Lua patterns)
6. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/dwarven-surveyor-scripts-research.md` — DwarvenSurveyor map/biome data, myDFHackScripts death/citizen detection
7. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research-synthesis.md` — Sections 3-6, 11-15
