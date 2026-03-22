# Legends Viewer Next — Feature Audit

**Date**: 2026-03-18
**Source**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/`
**App**: http://localhost:8081/ — Vue 3 + Vuetify SPA, .NET 8 backend
**Method**: Full source code analysis (frontend Vue components, router, backend controllers)

---

## Executive Summary

Legends Viewer Next (LVN) is a sophisticated, full-stack Dwarf Fortress legends browser. It parses raw DF XML export files and presents them through a rich, interactive SPA. The feature set is substantially deeper than most community viewers, with:

- **45+ distinct entity types** each with their own list and detail page
- **Three interactive graph/visualization libraries** (Leaflet, Cytoscape.js + dagre/cola, Chart.js via vue-chartjs)
- **Reusable architecture**: a generic `WorldObjectsPage` list component and `WorldObjectPage` detail component that provide consistent UX across all object types
- **Bookmark system** with multi-timestamp/export support and world-map thumbnail previews
- **Server-side pagination, sorting, and search** for all large data sets
- **Expandable cards** with fullscreen dialog mode for graphs and timelines
- **Cross-entity hyperlinks** throughout — almost every rendered event or list entry is a clickable link

Key gaps (relative to Chronicler's roadmap): no population/demography tabs, no knowledge-horizon filtering, no AI narrative layer, and no live/real-time data integration.

---

## Navigation Structure

The left sidebar (`App.vue`) is always visible and organizes all sections into collapsible groups. All groups are disabled until a world is loaded.

```
Explore Worlds    (/)
World             (/world)
Map               (/map)
Eras              (/era, /era/:id)

Society
  Factions and Groups  (/entity, /entity/:id)
  Historical Figures   (/hf, /hf/:id)

Geography
  Regions              (/region, /region/:id)
  Underground          (/uregion, /uregion/:id)
  Landmasses           (/landmass, /landmass/:id)
  Rivers               (/river, /river/:id)
  Mountain Peaks       (/mountainpeak, /mountainpeak/:id)

Infrastructure
  Sites                (/site, /site/:id)
  Structures           (/structure, /structure/:id)
  Constructions        (/construction, /construction/:id)

Art and Craft
  Artifacts            (/artifact, /artifact/:id)
  Dance Forms          (/danceform, /danceform/:id)
  Musical Forms        (/musicalform, /musicalform/:id)
  Poetic Forms         (/poeticform, /poeticform/:id)
  Written Content      (/writtencontent, /writtencontent/:id)

Warfare
  Wars                 (/war, /war/:id)
  Battles              (/battle, /battle/:id)
  Duels                (/duel, /duel/:id)
  Raids                (/raid, /raid/:id)
  Site Conquerings     (/siteconquered, /siteconquered/:id)

Conflicts
  Insurrections        (/insurrection, /insurrection/:id)
  Persecutions         (/persecution, /persecution/:id)
  Purges               (/purge, /purge/:id)
  Coups                (/coup, /coup/:id)

Calamities
  Rampages             (/beastattack, /beastattack/:id)
  Abductions           (/abduction, /abduction/:id)
  Thefts               (/theft, /theft/:id)

Rituals
  Processions          (/procession, /procession/:id)
  Performances         (/performance, /performance/:id)
  Journeys             (/journey, /journey/:id)
  Competitions         (/competition, /competition/:id)
  Ceremonies           (/ceremony, /ceremony/:id)
  Occasions            (/occasion, /occasion/:id)
```

**App bar**: Logo (ceretelina.png), title "Legends Viewer", GitHub release link showing version number.

---

## Page-by-Page Feature Catalog

### `/` — World Overview / Landing (WorldOverview.vue)

**Purpose**: Entry point for loading worlds and accessing recent bookmarks.

**Sections**:
- **"Explore a new world" card**: file browser dialog to select a legends XML export.
  - Dialog shows current folder path (read-only), a "Copy path from clipboard" button that parses an XML path from the clipboard automatically.
  - Scrollable directory list (with `..` parent navigation) and a World Exports list filtered to `*-legends.xml` files.
  - "Load World" button activates only when a file is selected.
  - Info alert: notes that companion files (e.g., `*-legends_plus.xml`, map images) are auto-detected from the same folder.
- **Bookmark cards** (one per previously loaded world, shown in reverse order):
  - World map thumbnail (300x300, pixelated rendering for DF aesthetic).
  - World name + alternative name.
  - World dimensions chip (e.g., "65 x 65").
  - Timestamp selector dropdown (if multiple exports exist for same world — supports comparing saves across time).
  - Load / Explore / Delete actions.
  - Loading state (spinner on Load button, `bookmarkStore.isLoading` disables all).
- **Warning dialog** for bookmark warnings.
- **Error snackbar** for bookmark errors.

**Unique features**:
- Clipboard-path paste for quick loading.
- Multi-timestamp bookmark system: one bookmark card per world file path, with a dropdown of all detected timestamps. This lets users switch between different export generations without re-browsing.

---

### `/world` — World Detail (World.vue)

**Purpose**: Dashboard for the loaded world.

**Sections**:
- **Header**: World name + alternative name, `mdi-earth-box` icon.
- **World Overview Map card**: Thumbnail (320x320) that links to `/map`. Uses mid-resolution map image.
- **Population by Race** (DoughnutChart): demographic breakdown of populations of main civilizations.
- **Area by Overworld Regions** (DoughnutChart): land distribution across biome regions.
- **Active Civilizations** (CivilizationsCardList): card list of currently active civs.
- **Lost Civilizations** (CivilizationsCardList): card list of fallen/extinct civs.
- **Events** (ExpandableCard):
  - Compact view: LineChart (events per year timeline) + paginated server-side data table.
  - Table columns: Date | Type | Event (HTML-rendered description).
  - Expanded (fullscreen dialog) view: BarChart (occurrences per event type).
- **Chronicles**: paginated table of all event collections.
  - Columns: Start | End | Name | Type | Subtype | Chronicles (sub-collection count) | Events.
- **Heroic Ties** (LegendsCardList): player-related objects (adventurers, factions, locations tied to the player's journey). Conditional — only shown if data is present.

**Charts**: DoughnutChart x2, LineChart x1, BarChart x1.

---

### `/map` — Interactive World Map (Map.vue)

**Purpose**: Full-screen interactive map of the world with site overlays.

**Technology**: Leaflet.js with `L.CRS.Simple` (no projection), zoom range -2 to +2. Map is 880px tall.

**Features**:
- Background: full-resolution world map image (Large) as an `L.imageOverlay`.
- Site markers overlaid on top, styled by site type AND owning civilization color.
- **Site type marker shapes** (exhaustive list):
  - Circle: Unknown, Cave, Lair, Camp
  - Triangle: Monastery, Fort, Tomb
  - Square (small): Hillocks, Hamlet
  - Pentagon: Fortress, ForestRetreat, Town, DarkPits
  - Hexagon (large): MountainHalls, Castle, DarkFortress
  - Star: Vault (Demons), Labyrinth (Minotaur), Shrine (Titan/Colossus), Tower (Necromancer), ImportantLocation
  - Blue-tinted shapes: MysteriousLair (square), MysteriousDungeon (pentagon), MysteriousPalace (hexagon)
- **Layer controls** (Leaflet built-in `L.control.layers`): toggle visibility per owning faction (one layer group per owner).
- **Custom All/None control** (top-right): show or hide all faction layers at once.
- **Popups on click**: each marker shows site name, type string, and owner name.
- Cursor changes to pointer on hover over any marker.
- URL: markers are clickable and navigate to the corresponding site detail page via `window.location.href`.
- Dark-mode friendly: CSS `filter: invert(100%) hue-rotate(180deg)` applied to Leaflet controls and popups.

**Note**: Only sites with known coordinates and owners are plotted.

---

### Generic List Pages (WorldObjectsPage component)

All 45+ entity type list pages share the same component. Each page provides:

- **Page header**: icon + title + subtitle + optional "Search DF Wiki" button (opens `dwarffortresswiki.org/index.php/{keyword}` in new tab).
- **Search bar**: live text search (debounced via watch) filtering by name, type, and subtype fields — server-side.
- **Paginated data table** (`v-data-table-server`):
  - Server-side pagination, sorting.
  - Configurable column headers per entity type.
  - HTML-rendered name cells (so names are hyperlinks).
  - Items-per-page selector.
  - Total count chip (cyan label, top-right of card).
- **Type-specific sections** (via `slot name="type-specific-after-table"`) — currently unused in base component but hookable.

**Column sets by entity type**:

| Entity | Columns |
|--------|---------|
| Wars | Start / End / Name / Type / Attacker vs. Defender / Chronicles / Events |
| Battles, Duels, Raids, Site Conquerings, Insurrections, Persecutions, Purges, Coups, Rampages, Abductions, Thefts | (same chronicle/event-count pattern) |
| Historical Figures | Id / Name / Type / Caste / Chronicles / Events |
| Entities | Id / Name / Type / Race / Chronicles / Events |
| Sites | Id / Name / Type / Region / Chronicles / Events |
| Artifacts | Id / Name / Type / Subtype / Chronicles / Events |
| Eras | Id / Duration / From-To / Name / Chronicles / Events |
| Regions, Underground Regions, Landmasses, Rivers, Mountain Peaks | standard name/type/counts |
| Structures, Constructions | standard |
| Dance/Musical/Poetic Forms, Written Content | standard |
| Processions, Performances, Journeys, Competitions, Ceremonies, Occasions | standard |

---

### Generic Detail Pages (WorldObjectPage component)

All detail pages share a base template with type-specific slots. Each provides:

- **Prev/Next navigation FABs** (top-right): float-action buttons (`mdi-chevron-left` / `mdi-chevron-right`) that navigate to the previous/next object in the full list. Uses `previousId` / `nextId` from the API (computed by index in the full sorted list).
- **Page header**: entity icon (rendered HTML, can be a custom DF sprite), entity name, type subtitle.
- **Location card** (if mapStore available): 320x320 thumbnail of the world map with the entity's location highlighted. Clicking navigates to `/map`.
- **Type-specific content** (slot `type-specific-before-table`): varies per entity (see below).
- **Events section** (ExpandableCard, shown if `eventCount > 0`):
  - Compact view: LineChart (events-per-year timeline) + paginated event table.
  - Event table columns: Date | Type | Event (HTML-rendered).
  - Expanded/fullscreen view: BarChart (event type distribution).
- **Chronicles section** (shown if `eventCollectionCount > 0`): paginated table.
  - Columns: Start | End | Name | Type | Subtype | Chronicles | Events.
- **Type-specific content** (slot `type-specific-after-table`): varies per entity.

**Entity-specific additions**:

#### Historical Figure (`/hf/:id`)
**Before-table slots**:
- **Profile Overview** (LegendsCardList): miscList — summary of traits, titles, status.
- **Family Tree** (ExpandableCard + FamilyTree component):
  - Cytoscape.js graph with dagre (top-down hierarchical) layout.
  - Node styles by gender: blue (male), magenta (female).
  - Node styles by status: 30% opacity for dead figures.
  - Current figure has dashed orange border.
  - Special node shapes + embedded PNG icons for: leader (round-octagon), necromancer (round-hexagon), vampire (hexagon), werebeast (hexagon), ghost (hexagon).
  - Compact: 360px tall. Fullscreen: 720px tall.
  - Nodes are clickable — navigate to that HF's detail page.
- **Skills** (scrollable list, 360px): each skill shows rank (icon by subrank level: dabbler → legendary), skill name, token, points, and category chip. Skill levels use escalating icon set: square-outline → star-outline → diamond-outline → crown-outline → crown → trophy.
- **Related Factions and Groups** (LegendsCardList)
- **Related Sites** (LegendsCardList)
- **Close Relationships** (LegendsCardList)
- **Vague Relationships** (LegendsCardList)
- **Worshipped Deities** (LegendsCardList)
- **Journey Pets** (LegendsCardList)
- **Noble Positions** (LegendsCardList)
- **Worshipping Figures** (LegendsCardList) — figures that worship this deity/creature
- **Worshipping Entities** (LegendsCardList)

**After-table slots**:
- **Notable Kills** (LegendsCardList)
- **Artifacts** (LegendsCardList) — currently held
- **Dedicated Structures** (LegendsCardList)
- **Snatcher Of** (LegendsCardList)
- **Battles** (LegendsCardList)
- **Beast Attacks** (LegendsCardList)

#### War (`/war/:id`)
**Before-table slots**:
- **Battle Graph** (ExpandableCard + WarfareGraph):
  - Cytoscape.js graph with cola (force-directed) layout.
  - Nodes: round-rectangle (individual entities), round-hexagon (civilizations, `is-civilization` class).
  - Edge width proportional to battle intensity (`data(width)`).
  - Edge tooltips (tippy.js) on hover.
  - Current entity highlighted with dashed orange border.
  - Nodes/edges are clickable links.
  - Compact: 360px. Fullscreen: 780px.
- **War Overview** (LegendsCardList): summary details.
- **Battles** (LegendsCardList): list of all battles in this war.
- **Notable Deaths** (LegendsCardList)
- **Deaths by Race** (DoughnutChart)

#### Battle (`/battle/:id`)
**Before-table slots**:
- **Battle Overview** (LegendsCardList)
- **Notable Deaths** (LegendsCardList)
- **Deaths by Race** (DoughnutChart)

#### Entity (`/entity/:id`)
**Before-table slots**:
- **War Graph** (ExpandableCard + WarfareGraph): same as Battle Graph but scoped to wars this entity participated in.
- **Wars** (LegendsCardList)
- **Noble Positions** (LegendsCardList)
- **Related Factions and Groups** (LegendsCardList) — entity-entity links
- **Current Sites** (LegendsCardList)
- **Lost Sites** (LegendsCardList)
- **Worshipped Deities** (LegendsCardList)

**After-table slots**:
- **Related Sites** (LegendsCardList) — entity-site links

#### Site (`/site/:id`)
**Before-table slots**:
- **Info card** (read-only list):
  - Region (hyperlink)
  - Current Owner (hyperlink)
  - Battle count
  - Beast Attack count
  - Notable Death count
- **Deaths by Race** (DoughnutChart)

**After-table slots**:
- **Structures** (LegendsCardList)
- **Related Historical Figures** (LegendsCardList)
- **Notable Deaths** (LegendsCardList)
- **Battles** (LegendsCardList)
- **Conquerings** (LegendsCardList)
- **Raids** (LegendsCardList)
- **Duels** (LegendsCardList)
- **Persecutions** (LegendsCardList)
- **Insurrections** (LegendsCardList)
- **Abductions** (LegendsCardList)
- **Beast Attacks** (LegendsCardList)

#### Artifact (`/artifact/:id`)
**Before-table slots**:
- **Info card**:
  - Type (subtype string)
  - Current Holder (hyperlink to HF or entity)
  - Stored in Structure (hyperlink)
  - Stored at Site (hyperlink)
  - Region (hyperlink)
  - Creator (hyperlink)
  - Written Content (hyperlink, if a book)
  - Page Count (if applicable)
  - Original Name (if differs from artifact name and not "«untitled»")
  - Material
  - Description

#### Region (`/region/:id`)
**Before-table slots**:
- **Related Sites** (LegendsCardList)
- Location map thumbnail (standard from base component)

#### Structure (`/structure/:id`)
- Standard base component only (location map + events/chronicles). No type-specific additions.

#### Era (`/era/:id`)
- Standard base component only (events + chronicles). No map, no type-specific additions.

#### Written Content (`/writtencontent/:id`)
**Before-table slots**:
- **Overview** (LegendsCardList): summary details (author, form, content type, etc.)

#### Beast Attack, Abduction, Theft, Insurrection, Persecution, Purge, Coup
- Standard base component only (events + chronicles). No type-specific additions.

#### Duel, Raid, Site Conquering
- Standard base component only.

#### Procession, Performance, Journey, Competition, Ceremony, Occasion
- Standard base component only.

#### Dance Form, Musical Form, Poetic Form
- Standard base component only.

#### Mountain Peak, Underground Region, Landmass, River
- Standard base component only (some have location map via mapStore).

---

## Shared Components Catalog

### LegendsCardList
- Renders a titled card with an icon and subtitle, containing a scrollable list of hyperlinked items.
- Items come from pre-computed `*Link` lists on each entity (HTML strings rendered via `v-html`).
- Used for every cross-reference list across the entire app.

### DoughnutChart
- Chart.js doughnut chart via vue-chartjs.
- Used for: Population by Race (world), Area by Overworld Regions (world), Deaths by Race (war, battle, site).

### LineChart
- Chart.js line chart. Used for events-per-year timelines on all world/entity detail pages.

### BarChart
- Chart.js bar chart. Used for event-type distribution in expanded Events card.

### ExpandableCard
- Wraps any content with a fullscreen expand button (`mdi-resize`).
- Opens a `v-dialog fullscreen` with alternate (larger) content in the `expanded-content` slot.
- Used for: Events section (all detail pages), Family Tree (HF), Battle/War Graph (war, entity).

### WarfareGraph
- Cytoscape.js graph using the `cola` force-directed layout.
- Node types: entities (round-rectangle), civilizations (round-hexagon).
- Edge widths are data-driven (proportional to battle count or intensity).
- tippy.js edge tooltips on hover.
- Click-to-navigate on nodes and edges.
- Compact (360px) and fullscreen (780px) modes.
- Used for: War detail page (battle graph), Entity detail page (war graph).

### FamilyTree
- Cytoscape.js graph using the `dagre` directed-acyclic hierarchical layout.
- Rich node styling: gender color, dead/alive opacity, special shapes + embedded PNG icons for leader/necromancer/vampire/werebeast/ghost.
- Click-to-navigate on nodes.
- Compact (360px) and fullscreen (720px) modes.

### WorldObjectPage (base detail template)
- Shared template for all 45+ entity detail pages.
- Provides: header, prev/next FABs, optional location map, events ExpandableCard, chronicles table, and two named slots for type-specific content.

### WorldObjectsPage (base list template)
- Shared template for all 45+ entity list pages.
- Provides: header with optional DF Wiki search link, search bar, server-side paginated/sorted data table, total count chip.

### CivilizationsCardList
- Specialized card list for civilization entities (used on world overview page).

---

## Backend API (WorldObjectGenericController)

Every entity type exposes the same REST API surface at `api/{entitytype}/`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/{type}` | Paginated list with `pageNumber`, `pageSize`, `sortKey`, `sortOrder`, `search` params. Returns total count, total filtered count, page metadata, and items as `WorldObjectDto`. |
| `GET /api/{type}/{id}` | Single entity detail. Populates `previousId` and `nextId` for prev/next navigation. |
| `GET /api/{type}/count` | Total count of objects of this type. |
| `GET /api/{type}/{id}/events` | Paginated events for the entity (sortable). |
| `GET /api/{type}/{id}/eventcollections` | Paginated event collections for the entity (sortable). |
| `GET /api/{type}/{id}/eventchart` | Chart.js dataset: events per year, from year 0 to current year, zero-filled. |
| `GET /api/{type}/{id}/eventtypechart` | Chart.js dataset: occurrences per event type (descending sort). |

World-level endpoints at `api/world/`:
- `GET /api/world` — world summary DTO (name, dimensions, populations, civilizations, site markers, etc.)
- `GET /api/world/events` — paginated world event log.
- `GET /api/world/eventcollections` — paginated world event collections.
- `GET /api/world/eventchart` — global events-per-year chart.
- `GET /api/world/eventtypechart` — global event-type distribution chart.

Additional specialty endpoints:
- `GET /api/entity/civs` — returns only main civilizations (IsCiv flag or civilization type with site history).
- `GET /api/worldmap/*` — map tile/image endpoints.
- `GET /api/bookmark/*` — bookmark CRUD.
- `GET /api/filesystem/*` — server-side directory browsing.
- `GET /api/version` — app version.

---

## Data Fields Exposed by Entity Type

### WorldDto (world overview)
- `name`, `alternativeName`
- `width`, `height`
- `entityPopulationsByRace` (chart data)
- `areaByOverworldRegions` (chart data)
- `mainCivilizations`, `mainCivilizationsLost` (CivilizationsCardList data)
- `siteMarkers` (for map: coordinates, owner, type, color, name, typeAsString, ownerText)
- `playerRelatedObjects` (Heroic Ties list)

### HistoricalFigure detail
- `miscList` — traits, titles, status summary
- `relatedEntityList`, `relatedSiteList`, `relatedHistoricalFigureList`
- `vagueRelationshipList`, `worshippedDeities`, `journeyPets`
- `positionList`, `worshippingFiguresList`, `worshippingEntitiesList`
- `familyTreeData` (cytoscape node/edge graph data)
- `skillDescriptions` (list of: category, subrank, rank, name, token, points)
- `notableKillList`, `holdingArtifactLinks`, `dedicatedStructuresLinks`
- `snatchedHfLinks`, `battleLinks`, `beastAttackLinks`

### Entity detail
- `warList`, `entityPositionAssignmentsList`, `entityEntityLinkList`
- `currentSiteList`, `lostSiteList`, `worshippedLinks`, `entitySiteLinkList`
- `warGraphData` (cytoscape graph data)

### War detail
- `miscList`, `battleList`, `notableDeathLinks`
- `battleGraphData` (cytoscape graph data)
- `deathsByRace` (chart data)

### Battle detail
- `miscList`, `notableDeathLinks`
- `deathsByRace` (chart data)

### Site detail
- `regionToLink`, `currentOwnerToLink`
- `structuresLinks`, `relatedHistoricalFigureLinks`, `notableDeathLinks`
- `battleLinks`, `conqueringLinks`, `raidLinks`, `duelLinks`
- `persecutionLinks`, `insurrectionLinks`, `abductionLinks`, `beastAttackLinks`
- `deathsByRace` (chart data)

### Artifact detail
- `subtype`, `holderLink`, `structureLink`, `siteLink`, `regionLink`
- `creatorLink`, `writtenContentLink`, `pageCount`
- `item` (original name), `material`, `description`

### Region detail
- `siteLinks`

### Written Content detail
- `miscList` (author, form, content type, etc.)

---

## Feature Comparison: LVN vs. Chronicler Phase 2

| Feature | LVN | Chronicler Phase 2 |
|---------|-----|--------------------|
| World overview with charts | Yes (3 charts) | No (not a goal) |
| Leaflet interactive map | Yes | No |
| Site markers by type + civ color | Yes | No |
| Historical Figure detail page | Yes (deep) | Yes (deep) |
| Entity detail page | Yes | Yes |
| Site detail page | Yes | Yes |
| Skill display (HF) | Yes | Not yet |
| Family tree (cytoscape) | Yes | No (Chronicler uses table) |
| Warfare graph (cytoscape) | Yes (War + Entity pages) | No |
| Events-per-year line chart | Yes (on every entity) | Yes (partial) |
| Event type bar chart | Yes (expanded mode) | No |
| Deaths-by-race doughnut | Yes (War, Battle, Site) | No |
| Population-by-race doughnut | Yes (world level) | No |
| Server-side search on lists | Yes (name/type/subtype) | Yes |
| Multi-column sort | Yes | Yes |
| Prev/Next navigation FABs | Yes | No |
| Bookmark system (multi-timestamp) | Yes | No |
| DF Wiki search integration | Yes | No |
| Ritual event types | Yes (6 types) | Yes |
| Political conflict types | Yes (4 types) | Yes |
| Calamity event types | Yes (3 types) | Yes |
| Art/culture entity types | Yes (5 types) | Partial |
| Knowledge-horizon filtering | No | Phase 3.3 |
| AI narrative / storytelling | No | Phase 4 |
| Live data integration | No | Phase 3.1 |
| Population demography tabs | No | Phase 2 (citizens/residents) |
| Cross-linked HTML events | Yes | Yes |
| ExpandableCard fullscreen mode | Yes | No |

---

## Unique / Noteworthy Features

1. **Multi-timestamp bookmark system**: LVN saves all detected export timestamps for a world file path, letting the user switch between snapshots without re-browsing the filesystem. This is rare among DF legend viewers.

2. **Warfare graph (cytoscape-cola)**: Visualizes which factions fought each other in a war or which wars an entity participated in, as a force-directed graph with edge widths proportional to battle scale. Nodes are clickable navigation targets.

3. **Family tree (cytoscape-dagre)**: Renders a proper directed-acyclic-graph family tree per HF, with DF-specific visual encoding (gender color, alive/dead opacity, special node shapes for cursed/supernatural beings). Inline SVG icons embedded as base64 for leader/necromancer/vampire/werebeast/ghost nodes.

4. **Skill rank icon ladder**: 12-level skill visualization using escalating MDI icons (square-outline → star → diamond → crown → trophy), one of the more detailed DF-skill presentations in any viewer.

5. **Deaths-by-Race doughnut**: Available on War, Battle, and Site pages — shows racial breakdown of deaths in that event.

6. **DF Wiki deep-link button**: Every list page includes a "Search DF Wiki" button linking directly to the relevant wiki article for the entity type.

7. **Prev/Next FABs**: Float-action navigation buttons on every detail page allow cycling through all objects of a type without going back to the list.

8. **Expandable/fullscreen cards**: Every visualization and the Events section can be expanded to fullscreen via a dialog, with different (larger) content rendered in fullscreen mode.

9. **CSS dark-mode inversion on Leaflet**: Map controls and popups are CSS-inverted to match the dark-theme SPA aesthetic.

10. **Site type shape vocabulary**: 8 distinct Leaflet polygon shapes mapped to DF's 25+ site types, with civilization-color tinting. All shapes rendered programmatically (no external icon fonts needed).

---

## Gaps and Limitations Observed

- No text search on events (search is list-level only, not within event logs).
- No filter by date range on events.
- No population breakdown at site or entity level (only world-level race chart).
- No "what is this creature/race" lookup (no race detail page).
- No inline display of HF image/portrait (DF does not export images, so this is expected).
- No constructed/destroyed event timeline on Site pages.
- Family Tree and Warfare Graph do not support click-and-drag pan (the Cytoscape canvas does support pan natively via mouse drag, so this may work at runtime even though not explicitly configured).
- `/era/:id` page has no type-specific content beyond the base events/chronicles — era pages in LVN are effectively blank beyond the event table.
- Rituals, political conflicts, and calamities are fully enumerated but all use the base template — no type-specific visual enrichment for processions, ceremonies, persecutions, etc.

---

## Sources

All findings are from direct source code analysis:

- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/App.vue`
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/router/index.ts`
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/` (all 90 view files)
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/` (all components)
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Controllers/WorldObjectGenericController.cs`
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Controllers/WorldController.cs`
- `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Controllers/WorldObjectControllers.cs`

