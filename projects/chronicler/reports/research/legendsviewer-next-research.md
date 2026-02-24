# Research Report: LegendsViewer-Next

**Date**: 2026-02-23
**Scope**: Thorough code-level analysis of the LegendsViewer-Next repository for Chronicler product requirements. Covers architecture, data model, XML parsing, event system, map rendering, family tree visualization, search/filter, cross-linking, and UI/UX patterns.

**Repository**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/`
**Stack**: .NET 8 backend (ASP.NET Core REST API) + Vue 3 / TypeScript frontend (Vuetify 3, Vite)

---

## Executive Summary

LegendsViewer-Next is a complete legends browser for Dwarf Fortress exported XML data. It consumes two files: the standard `legends.xml` (always required) and the DFHack-generated `legends_plus.xml` (optional but dramatically richer). The backend parses both XML files with a streaming async `XmlReader` approach, builds an in-memory world graph of ~20 entity types, then exposes a paginated REST API consumed by a Vue 3 SPA.

The tool handles every data category that DF exports: historical figures, sites, entities, artifacts, regions (surface and underground), world constructions, art forms (dance/music/poetry), written content, eras, and the full event taxonomy (115+ distinct event types, 19 event collection types). It renders an interactive Leaflet.js map with civilization-colored site markers, Cytoscape.js family trees and warfare graphs, and Chart.js line/bar/doughnut charts for population and event timelines. Cross-linking is pervasive — every entity reference in every event becomes a clickable HTML anchor.

For Chronicler, the most relevant findings are: (1) the complete event type taxonomy (115+ events), (2) the data model field inventory for each entity type, (3) the XML parsing strategy for large files, (4) the map coordinate system and region-coloring approach, (5) the family tree structure and Cytoscape rendering logic, and (6) the paginated server-side search API pattern.

---

## Key Findings

### 1. Features and Capabilities: Complete View/Page Inventory

The application is a single-page app with a left-side navigation drawer organized into sections. Every section has a list view and an individual detail view.

**Navigation Groups and Routes** (from `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/App.vue` and `src/router/index.ts`):

**Top-level**
- `/` — World Overview (bookmarks page, world loader)
- `/world` — World summary (active/lost civilizations, population charts, events table, chronicles table)
- `/map` — Interactive Leaflet.js map
- `/era` / `/era/:id` — Historical Eras

**Society**
- `/entity` / `/entity/:id` — Factions and Groups (civilizations, religions, guilds, etc.)
- `/hf` / `/hf/:id` — Historical Figures

**Geography**
- `/region` / `/region/:id` — Surface Regions
- `/uregion` / `/uregion/:id` — Underground Regions
- `/landmass` / `/landmass/:id` — Landmasses
- `/river` / `/river/:id` — Rivers
- `/mountainpeak` / `/mountainpeak/:id` — Mountain Peaks

**Infrastructure**
- `/site` / `/site/:id` — Sites (all types: fortress, hamlet, tower, lair, vault, etc.)
- `/structure` / `/structure/:id` — Structures within sites
- `/construction` / `/construction/:id` — World Constructions (roads, tunnels, bridges)

**Art and Craft**
- `/artifact` / `/artifact/:id` — Artifacts
- `/danceform` / `/danceform/:id` — Dance Forms
- `/musicalform` / `/musicalform/:id` — Musical Forms
- `/poeticform` / `/poeticform/:id` — Poetic Forms
- `/writtencontent` / `/writtencontent/:id` — Written Content

**Warfare**
- `/war` / `/war/:id` — Wars
- `/battle` / `/battle/:id` — Battles
- `/duel` / `/duel/:id` — Duels
- `/raid` / `/raid/:id` — Raids
- `/siteconquered` / `/siteconquered/:id` — Site Conquerings

**Conflicts**
- `/insurrection` / `/insurrection/:id` — Insurrections
- `/persecution` / `/persecution/:id` — Persecutions
- `/purge` / `/purge/:id` — Purges
- `/coup` / `/coup/:id` — Coups (EntityOverthrownCollection)

**Calamities**
- `/beastattack` / `/beastattack/:id` — Rampages (BeastAttack)
- `/abduction` / `/abduction/:id` — Abductions
- `/theft` / `/theft/:id` — Thefts

**Rituals**
- `/procession` / `/procession/:id` — Processions
- `/performance` / `/performance/:id` — Performances
- `/journey` / `/journey/:id` — Journeys
- `/competition` / `/competition/:id` — Competitions
- `/ceremony` / `/ceremony/:id` — Ceremonies
- `/occasion` / `/occasion/:id` — Occasions

**Total: 70 routes** (35 list views + 35 detail views).

**Source**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/router/index.ts`

---

### 2. XML Parsing Strategy

**Parser class**: `XmlParser` at `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/XMLParser.cs`

**Mechanism**: Streaming `XmlReader` with `Async = true`. Large files are never loaded into DOM — they are read element by element. The `ParseAsync()` method is the entry point.

```csharp
XmlReader = XmlReader.Create(
    new FilteredStream(new FileStream(xmlFile, FileMode.Open)),
    new XmlReaderSettings { Async = true, IgnoreWhitespace = true, IgnoreComments = true,
        IgnoreProcessingInstructions = true });
```

**FilteredStream** (`/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/FilteredStream.cs`): A custom `Stream` wrapper that replaces all non-printable characters (bytes < 32) with spaces. This handles DF's XML output which can contain raw control characters that would break standard XML parsing.

**Dual-file parsing**: When `legends_plus.xml` exists, an `XmlPlusParser` instance is created alongside the main parser. The plus parser runs ahead: before each item from the main XML is committed to the world, the plus parser's `AddNewPropertiesAsync()` merges additional properties by matching `id` fields. This allows the richer DFHack export to supplement the base export without duplicating the base data.

**Section dispatch** (`GetSectionType()`): Top-level XML element names map to `Section` enum values. Recognized sections:
- `artifacts`, `entities`, `entity_populations`, `historical_eras`, `historical_event_collections`, `historical_events`, `historical_figures`, `regions`, `sites`, `underground_regions`, `world_constructions`, `poetic_forms`, `musical_forms`, `dance_forms`, `written_contents`, `landmasses`, `mountain_peaks`, `creature_raw`, `identities`, `rivers`, `historical_event_relationships`, `historical_event_relationship_supplements`

**Post-section processing** (`ProcessXmlSection()`): After each section finishes parsing, cross-references are resolved. For example:
- After `historical_figures`: HF-to-HF links resolved
- After `entities`: HF-to-entity links, entity-to-entity links, reputations resolved
- After `historical_eras`: Era end years computed, events assigned to eras
- After `historical_event_collections`: Sub-collections linked to parents, beast attacks get beast HF resolved by heuristic analysis of sub-events

**World.ParseAsync()** (`/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/World.cs:117`): Orchestrates all parsing steps — XmlParser, then optional HistoryParser (for the `.txt` history file), then SitesAndPopsParser (for sites-and-populations file). After all parsing, runs a post-processing pass: `ProcessHFtoEntityLinks`, `ResolveEntityToEntityPopulation`, `ResolveHfToEntityPopulation`, `ResolveStructureProperties`, `ResolveSitePropertyOwners`, `ResolveHonorEntities`, `ResolveMountainPeakToRegionLinks`, `ResolveRegionProperties`, `ResolveArtifactProperties`, `ResolveArtformEventsProperties`, `ResolveEntityIsMainCiv`, `GenerateCivColors`.

**Performance**: All parsing is async. Duration is tracked with `Stopwatch` and logged. The world grid uses a `Dictionary<Location, WorldRegion>` for O(1) coordinate lookups.

---

### 3. Event Types: Complete Taxonomy

**115 distinct WorldEvent types** are parsed in `AddEvent()` at line 408 of `XMLParser.cs`. **19 EventCollection types** are parsed in `AddEventCollection()`.

#### WorldEvent Types (individual events)

| Category | Event Type Names |
|----------|-----------------|
| HF Links | add hf entity link, add hf hf link, add hf site link, remove hf entity link, remove hf hf link, remove hf site link, add hf entity honor |
| HF State | change hf job, change hf state, change hf body state, changed creature type, hf died, hf wounded, hf revived, hf reach summit |
| HF Actions | hf abducted, hf new pet, hf reunion, hf simple battle event, hf travel, hf profaned structure, hf disturbed structure, hf destroyed site, hf attacked site, hf razed structure, hf rampaged in site (via entity), hf preach, hf prayed inside structure, hf viewed artifact, hf asked about artifact, hf carouse |
| HF Intrigue | hf confronted, assume identity, impersonate hf, hf gains secret goal, hf learns secret, hf does interaction, hf performed horrible experiments, hfs formed intrigue relationship, hfs formed reputation relationship, failed frame attempt, failed intrigue corruption, hf convicted, hf interrogated, entity primary criminals |
| HF Fate | hf freed, hf enslaved, hf ransomed, hf relationship denied, hf recruited unit type for entity |
| Site Events | created site, destroyed site, attacked site, plundered site, reclaim site, site abandoned, site died, site dispute, site taken over, site tribute forced, site surrendered, site retired |
| Entity Events | entity created, entity dissolved, entity law, entity relocate, entity rampaged in site, entity fled site, entity expels hf, entity persecuted, entity searched site, entity alliance formed, entity overthrown, entity incorporated, entity breach feature layer, entity equipment purchase |
| Artifact | artifact created, artifact destroyed, artifact stored, artifact possessed, artifact lost, artifact given, artifact claim formed, artifact copied, artifact recovered, artifact found, artifact transformed |
| Masterpiece | masterpiece arch design, masterpiece arch constructed, masterpiece engraving, masterpiece food, masterpiece lost, masterpiece item, masterpiece item improvement, masterpiece dye |
| Diplomatic | peace accepted, peace rejected, agreement made, agreement rejected, agreement formed, agreement concluded, agreement void, diplomat lost, first contact, site tribute forced |
| Construction | created structure, created world construction, replaced structure, razed structure, new site leader, modified building, building profile acquired |
| Cultural/Civic | poetic form created, musical form created, dance form created, written content composed, knowledge discovered, holy city declaration, regionpop incorporated into entity, create entity position |
| Tactical | field battle, tactical situation, squad vs squad |
| Special | sneak into site, spotted leaving site, item stolen, creature devoured, body abused, merchant, gamble, trade, hf equipment purchase, procession, ceremony, performance, competition, sabotage, insurrection started |
| Relationships | remove hf entity link, remove hf hf link, remove hf site link |

**Note**: `HistoricalEventRelationShip` is a special plus-XML-only event type stored separately in `World.SpecialEventsById`.

#### EventCollection Types (compound events)

| Category | Collection Types |
|----------|-----------------|
| Warfare | battle, war, duel, raid, site conquered |
| Political | insurrection, persecution, purge, entity overthrown (coup) |
| Calamities | beast attack, abduction, theft |
| Rituals | occasion, procession, ceremony, performance, competition |
| Travel | journey |

**Source**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/XMLParser.cs:408-888`

#### Event Rendering

Events are rendered to HTML strings via `ToLink()` methods and `GetDeathString()` patterns on the backend. Each event type has a `Print()` method that generates a sentence like "the dwarf Urist died in the siege of Boatmurdered, slain by a goblin". These HTML strings are transmitted to the frontend and injected via `v-html`. Events are displayed in paginated server-side tables with columns: Date, Type, Event (rendered HTML).

---

### 4. Data Model

#### Core Entity Types (WorldObjects in `World.cs`)

| Property | Type | Description |
|----------|------|-------------|
| `Regions` | `List<WorldRegion>` | Surface geographic regions |
| `UndergroundRegions` | `List<UndergroundRegion>` | Underground cavern/hell levels |
| `Landmasses` | `List<Landmass>` | Named landmasses |
| `MountainPeaks` | `List<MountainPeak>` | Named peaks |
| `Rivers` | `List<River>` | Named rivers |
| `Sites` | `List<Site>` | All sites (fortresses, hamlets, lairs, etc.) |
| `HistoricalFigures` | `List<HistoricalFigure>` | Every named creature |
| `Entities` | `List<Entity>` | Civilizations, religions, guilds, etc. |
| `Eras` | `List<Era>` | Historical eras |
| `Artifacts` | `List<Artifact>` | Named legendary items |
| `WorldConstructions` | `List<WorldConstruction>` | Roads, bridges, tunnels |
| `PoeticForms` | `List<PoeticForm>` | Named poem forms |
| `MusicalForms` | `List<MusicalForm>` | Named musical forms |
| `DanceForms` | `List<DanceForm>` | Named dance forms |
| `WrittenContents` | `List<WrittenContent>` | Books, scrolls, etc. |
| `Structures` | `List<Structure>` | Temples, libraries, keeps within sites |
| `Identities` | `List<Identity>` | False identities assumed by HFs |
| `EntityPopulations` | `List<EntityPopulation>` | Population groups |

**Source**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/World.cs:20-85`

#### HistoricalFigure Fields

Key fields from `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/WorldObjects/HistoricalFigure.cs`:

| Field | Type | Description |
|-------|------|-------------|
| `Name` | `string` | Full name |
| `Race` | `CreatureInfo` | Species (dwarf, elf, goblin, demon, etc.) |
| `Caste` | `string` | Male, Female, Default |
| `BirthYear` / `BirthSeconds72` | `int` | Birth timestamp |
| `DeathYear` / `DeathSeconds72` | `int` | Death timestamp (-1 = alive) |
| `Age` | `int` | Computed age |
| `Alive` | `bool` | Derived from DeathYear |
| `Deity` | `bool` | Is a god |
| `Force` | `bool` | Is a force of nature |
| `Ghost` | `bool` | Is a ghost |
| `Zombie` / `Skeleton` | `bool` | Undead status |
| `Animated` / `AnimatedType` | | Animated object type |
| `Adventurer` | `bool` | Player character |
| `CurrentState` | `HfState` | Current geographic state |
| `RelatedHistoricalFigures` | `List<HistoricalFigureLink>` | Links to other HFs (mother, father, child, deity, spouse, etc.) |
| `RelatedEntities` | `List<EntityLink>` | Entity memberships and positions |
| `RelatedSites` | `List<SiteLink>` | Site relationships (home, lair, seat of power) |
| `RelatedRegions` | `List<WorldRegion>` | Region associations (forces of nature) |
| `Skills` | `List<Skill>` | Skill levels and points |
| `Spheres` | `List<string>` | Deity spheres (e.g., "water", "death") |
| `ActiveInteractions` | `List<string>` | Active curses/secrets (VAMPIRE, WEREBEAST, SECRET_*) |
| `Goal` | `string` | Life goal |
| `NotableKills` | `List<HfDied>` | Kills of named HFs |
| `Battles` | `List<Battle>` | Battles participated in |
| `BeastAttacks` | `List<BeastAttack>` | Beast attack events |
| `Positions` | `List<HfPosition>` | Noble positions held |
| `VagueRelationships` | `List<VagueRelationship>` | Loose social associations |
| `RelationshipProfiles` | `List<RelationshipProfileHf>` | Detailed relationship profiles |
| `Reputations` | `List<EntityReputation>` | Reputations within entities |
| `HoldingArtifacts` | `List<Artifact>` | Currently held artifacts |
| `DedicatedStructures` | `List<Structure>` | Structures dedicated to this HF (temples) |
| `IntrigueActors` / `IntriguePlots` | | Intrigue network data |
| `BreedId` | `string?` | Unique breed identifier |
| `LineageCurseParent` | `HistoricalFigure?` | Curse lineage |
| `FamilyTreeData` | `CytoscapeData?` | Lazily computed family tree graph |

**Relationship link types** (`HistoricalFigureLinkType` enum): Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge.

#### Site Fields

From `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/WorldObjects/Site.cs`:

- `SiteType` (enum): Fortress, Hillocks, MountainHalls, ForestRetreat, Hamlet, Town, Castle, DarkPits, DarkFortress, Monastery, Fort, Tomb, MysteriousLair, MysteriousDungeon, MysteriousPalace, Cave, Lair, Vault, Labyrinth, Shrine, Tower, Camp, ImportantLocation
- `UntranslatedName`: Original Dwarvish/Elvish/etc. name
- `Coordinates`: `List<Location>` — world grid coordinates
- `Rectangle`: `Rectangle` — bounding box
- `Region`: `WorldRegion` — which region the site is in
- `Structures`: `List<Structure>` — buildings within the site
- `OwnerHistory`: `List<OwnerPeriod>` — who owned the site over time
- `SiteProperties`: `List<SiteProperty>` — individual property parcels within a site
- `RelatedHistoricalFigures`: HFs linked to the site
- Typed event collection access: `Battles`, `Conquerings`, `Raids`, `Duels`, `Purges`, `Persecutions`, `Insurrections`, `Coups`, `Abductions`, `BeastAttacks`

#### Entity Fields (partial, from Entity.cs)

- `EntityType` enum: Civilization, NomadicGroup, SemiMegaBeast, MegaBeast, PerformanceTroupe, MercenaryCompany, Militia, Religion, Guild, Outcast, Unknown
- `IsCiv`: Whether this is a main civilization
- `Race`: The entity's primary race
- `SiteHistory`: Sites claimed over time
- `EntityPositions` / `EntityPositionAssignments`: Noble titles and holders
- `EntityPopulation`: Associated population data
- `Parent` / `Groups`: Hierarchical entity relationships
- `EntityOccasions`: Ceremonial occasions
- `LineColor`: Generated per-civilization color for map display
- `EntityEntityLinks`: Links to parent/child entities

---

### 5. Maps: Leaflet.js Interactive Map

**Component**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/Map.vue`

**Map Library**: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection — uses simple pixel coordinates).

**Map Image Source**: The backend generates PNG images from the world's region data using SkiaSharp. Three sizes are cached:
- `Default` (tileSize=4, `DefaultTileSizeMid`) — used on the World summary page
- `Large` (tileSize=10, `DefaultTileSizeMax`) — used on the interactive Map page
- `Min` (tileSize=2, `DefaultTileSizeMin`) — small thumbnail

If the user's DF export includes a `.bmp` map file, that is used as the base image. Otherwise the generator draws region tiles by color from `RegionTypeColors.BaseRegionColors`.

**Map generation** (`/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Maps/WorldMapImageGenerator.cs`):
- For each world coordinate, the region type is looked up and colored with slight ID-based variation (±15 per channel, seeded by regionId for consistency)
- Object-specific maps: When viewing a region or site detail page, a focused map is generated with the object's tiles highlighted in Magenta and a yellow/red oval drawn around it
- Images are served as base64 PNG strings via the REST API

**Site Markers**: Sites are plotted on the Leaflet map using custom polygon shapes based on site type:
```
Circle: Unknown, Cave, Lair, Camp
Triangle: Monastery, Fort, Tomb
Square (small): Hillocks, Hamlet
Pentagon: Fortress, ForestRetreat, Town, DarkPits
Hexagon (large): MountainHalls, Castle, DarkFortress
Star: Vault, Labyrinth, Shrine, Tower, ImportantLocation
Pentagon (blue): MysteriousDungeon
Hexagon (blue): MysteriousPalace
```

**Coloring**: Each site marker uses the owning civilization's generated color (`Entity.LineColor`). Colors are assigned per-race using HSV space with progressive hue rotation, then lighter/darker variants for > 6 races.

**Layer Control**: Sites are grouped into `L.LayerGroup` per owner name. The Leaflet layer control panel (top-right) lets users toggle individual civilization layers. Custom "All"/"None" buttons toggle all layers at once.

**Coordinate System**: Map coordinates are scaled by 8x (tileSize=10, `scale=8` in the Vue component). Y-axis is inverted: `[(height - coordinate.y) * scale - 0.5 * scale, coordinate.x * scale + 0.5 * scale]`.

**Popup content**: Each site marker shows: site name, type string, owner name.

**User interaction**: Click markers to see popup. Layer panel on top-right. Zoom via scroll wheel. `minZoom: -2`, `maxZoom: 2`.

**Per-object maps**: From `WorldObjectPage.vue`, when viewing any object detail page, a smaller static map is fetched that highlights the object's location.

**Source**: Map.vue lines 17-261; WorldMapImageGenerator.cs; `mapStore.ts`

---

### 6. Genealogy and Family Trees

**Component**: `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/FamilyTree.vue`

**Library**: Cytoscape.js 3.31.0 with `cytoscape-dagre` layout plugin (hierarchical DAG layout, top-to-bottom).

**Backend generation**: `HistoricalFigureExtensions.CreateFamilyTreeElements()` at `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Extensions/HistoricalFigureExtensions.cs:12`.

**Graph structure**:
- Nodes: One node per HF in the family tree. The current HF gets class `current` (dashed orange border).
- Edges: Directed from parent to child. Direction: `mother.id → current.id`, `father.id → current.id`, `current.id → child.id`.
- Tree depth limit: Max 3 ancestors deep on each of the mother and father lines (separate counters). Children are included without depth limit.

**Node visual classes** (styled in Cytoscape):
- `current`: Dashed orange border
- `dead`: 30% opacity
- `male`: Blue background
- `female`: Magenta background
- `leader`: Round-octagon shape with crown icon (base64 PNG background image)
- `necromancer`: Round-hexagon with skull icon
- `vampire`: Hexagon with vampire icon
- `werebeast`: Hexagon with wolf icon
- `ghost`: Hexagon with ghost icon

**Node label format**:
```
[race prefix if different]
[assignment/title]
── ✶ ────────
[highest skill rank + name]
────────────
[HF name]

Age: N   (or "Age: N✝" if dead)
```

**Interaction**: Click a node to navigate to that HF's detail page (`window.location.href = node.data('href')`). Hover shows pointer cursor.

**Display**: Two sizes — compact (360px height) and fullscreen (720px). Toggled via an `ExpandableCard` wrapper on the HF detail page.

**Relationship types traced**: Mother, Father, Child. Spouse, Lover, Companion are NOT included in the family tree (they appear in `RelatedHistoricalFigureList` instead).

**Source**: FamilyTree.vue; HistoricalFigureExtensions.cs:12-200

---

### 7. Search and Filter

**Pattern**: All list views use a common `WorldObjectsPage.vue` component with server-side search.

**Search**: Free-text `v-text-field` bound to `searchString` reactive ref. On every keystroke change, `loadWorldObjects()` fires with the current search string as a query parameter. The backend repository filters by name (case-insensitive `Contains`).

**Pagination**: Server-side via `v-data-table-server`. Items per page options: 10, 25, 50, 100. State managed in Pinia stores.

**Sorting**: Column-level sorting passed as `sortKey` + `sortOrder` query parameters. Supported on most columns except rendered HTML columns (sortable: false).

**Table columns by entity type**:

| List View | Columns |
|-----------|---------|
| Historical Figures | Id, Name (html), Type (race), Caste, Chronicles count, Events count |
| Sites | Id, Name, Type, Subtype, Chronicles, Events |
| Entities | Id, Name, Type, Subtype, Chronicles, Events |
| Wars | Start, End, Name (html), Type, Subtype, Chronicles, Events |
| Artifacts | Id, Name, Type, Subtype, Chronicles, Events |
| (all others follow same pattern) |

**Filtering**: Beyond text search, the EntityController exposes a `/api/Entity/civs` endpoint that returns only main civilizations. No other specialized filter endpoints are present — filtering is entirely by text search in the overview.

**DF Wiki link**: Each list page includes a "Search DF Wiki" button that opens the relevant Dwarf Fortress wiki page for the entity type.

**Source**: WorldObjectsPage.vue; WorldObjectGenericController.cs

---

### 8. Visualization

**Chart Types**: Three chart types used via `vue-chartjs` 5.3.2 (Chart.js 4.4.8 wrapper).

**Line Chart** (`BarChart.vue`, `LineChart.vue`):
- Event timeline: Events per year plotted as a line chart for each object's event history
- Appears on World summary page and every object detail page (inside ExpandableCard "Events" section)
- Data served from `/api/{Type}/{id}/eventchart`

**Bar Chart**:
- Event type breakdown: Count of each distinct event type for an object
- Appears in the expanded view of the Events card
- Data served from `/api/{Type}/{id}/eventtypechart`

**Doughnut Chart** (`DoughnutChart.vue`):
- Population by Race: Distribution of entity populations across races
- Area by Overworld Regions: Land area distribution
- Appears on World summary page

**Warfare Graph** (`WarfareGraph.vue`):
- Library: Cytoscape.js with `cytoscape-cola` layout (force-directed physics)
- Nodes: Civilizations (round-hexagon) and battles/wars (roundrectangle)
- Edges: Show attack/defense relationships with labels and widths proportional to battle size
- Edge tooltips via `tippy.js` 6.3.7 on hover
- Clickable: tap node/edge to navigate to the respective entity or battle
- Appears on War and Entity detail pages

**Source**: BarChart.vue; LineChart.vue; DoughnutChart.vue; WarfareGraph.vue; stores/worldStore.ts

---

### 9. Cross-Linking: Entity Linking Patterns

Cross-linking is the core UX metaphor. Every entity reference is rendered as an HTML anchor.

**Pattern**: Each `WorldObject` subclass implements `ToLink(bool link, DwarfObject? pov, WorldEvent? worldEvent)`. When `link = true`, this returns an HTML string like:
```html
<a href="/hf/123" title="King&#13Dwarf&#13Born: 50&#13Age: 200✝">
  <span class="icon">...</span> the dwarf Urist McSomeone
</a>
```

**HistoricalFigure.ToLink()**: Includes race string prefix ("the dwarf X"), icon (gender/deity/force icon), and tooltip showing title, age, birth/death years, and event count.

**Anchor format**: `HtmlStyleUtil.GetAnchorString(icon, entityType, id, title, displayName)` generates `<a href="/{entityType}/{id}" title="{title}">{icon}{displayName}</a>`.

**HTML injection**: Frontend uses `<span v-html="value"></span>` to render these server-generated HTML strings directly. All event descriptions, subtype labels, entity names in tables, and list items use this pattern.

**Navigation**: Clicking any linked entity navigates to its detail page via standard `href` navigation (not Vue Router `<router-link>`), which causes a full page load within the SPA. This is a trade-off for simplicity since the links are generated server-side.

**"Heroic Ties"** section on World summary page: `PlayerRelatedObjects` — objects tagged as player-related (adventurer HFs, their associated factions/sites) are surfaced in a dedicated card.

**Breadcrumb navigation**: `WorldObjectPage.vue` provides prev/next navigation buttons (`v-fab`) that navigate to adjacent IDs.

**Source**: HistoricalFigure.cs:828-850; HtmlStyleUtil.cs; WorldObjectPage.vue:1-7

---

### 10. Performance: Loading Strategy and Caching

**Backend**:
- World is parsed once and held in memory as a singleton `World` object
- Map images cached in `WorldMapImageGenerator` as `byte[]` arrays (three sizes)
- No database — all queries are in-memory LINQ
- `World.GetSite(id)` has an O(1) fast path: `Sites[id - 1].Id == id` (sites are 1-indexed and generally contiguous)
- Repository uses `BinarySearch` for event insertion: `Events.BinarySearch(event)` requires `IComparable<WorldEvent>` implementation

**Frontend**:
- Pinia stores cache loaded objects and event lists within the session
- Pagination prevents loading all records at once (default 10 per page)
- Images transmitted as base64 strings in JSON responses — no separate asset pipeline needed
- Vue Router lazy-loads each view component: `() => import('../views/HistoricalFigure.vue')`
- World map image at `Large` size (10px tiles) loaded once on map page mount, then watched for changes via Pinia store reactive state

**Parsing performance**: The README claims fast loading "using XmlReader." Timing logged to console (minutes/seconds/ms). The dual-file parser approach runs both files in a single sequential pass rather than two full passes.

**WorldGrid**: `Dictionary<Location, WorldRegion>` for O(1) coordinate-to-region lookup, used during post-processing.

---

### 11. UI/UX Patterns

**Framework**: Vuetify 3.7.14 (Material Design component library for Vue 3).

**App Layout** (from `App.vue`):
- `v-app-bar`: Top bar with app logo (`ceretelina.png`), title "Legends Viewer", version badge + GitHub link
- `v-navigation-drawer`: Left sidebar, always visible, contains collapsible `v-list-group` navigation
- `v-main` + `v-container`: Main content area with `<RouterView />`

**List View Pattern** (`WorldObjectsPage.vue`):
- Header with large icon, title, subtitle, optional DF Wiki button
- Search text field (instant-filter)
- `v-data-table-server` with server-side pagination and sorting
- Total count badge (cyan chip)

**Detail View Pattern** (`WorldObjectPage.vue`):
- Prev/Next navigation FABs (floating action buttons) at top-right
- Large icon + name header
- Optional mini-map card (links to full map page)
- Type-specific cards injected via named slots (`type-specific-before-table`, `type-specific-after-table`)
- ExpandableCard "Events" section with line chart + paginated event table
- ExpandableCard expanded view shows bar chart of event type breakdown
- "Chronicles" section with paginated event collections table

**ExpandableCard Component**: Collapsible card with compact-content (default visible) and expanded-content (shown when expanded). Used for Events, Family Tree, etc.

**World Overview Page**:
- Bookmark cards with world map thumbnail, name, dimensions, timestamp selector
- "Explore a new world" card with file browser dialog
- Bookmarks persist across sessions; parsed worlds are saved as bookmarks with thumbnail

**World Summary Page**:
- World map thumbnail (links to interactive map)
- Population by Race doughnut chart
- Area by Overworld Regions doughnut chart
- Active Civilizations card list (with civilization color indicators)
- Lost Civilizations card list
- Events section (line chart + paginated table)
- Chronicles section (paginated table)
- Heroic Ties card (player-related objects)

**HF Detail Page** (`HistoricalFigure.vue`):
- Profile Overview card (age, birth, death, spheres, positions)
- Family Tree card (Cytoscape.js, expandable)
- Skills card (scrollable list with rank icons and point counts)
- Related Factions and Groups
- Related Sites
- Close Relationships (non-deity HF links)
- Vague Relationships
- Worshipped Deities
- Journey Pets
- Noble Positions (multiple position history)
- Worshipping Figures (if deity)
- Worshipping Entities (if deity)
- Notable Kills
- Artifacts (currently held)
- Dedicated Structures
- Snatcher Of (abduction victims)
- Battles (as attacker / defender / non-combatant)
- Beast Attacks (if beast)

**Color System**: Each civilization gets a unique color generated via HSV rotation. Medium saturation for first 6 races, lighter for 7-12, darker for 13-18. Used on map markers, warfare graph nodes, and civilization list items.

**Source**: App.vue; WorldObjectPage.vue; WorldObjectsPage.vue; HistoricalFigure.vue; World.cs:215-275

---

## Comparison: Chronicler vs LegendsViewer-Next Feature Coverage

| Feature | LegendsViewer-Next | Chronicler Status |
|---------|-------------------|-------------------|
| XML ingestion (legends.xml) | Full streaming async XmlReader | Built — CDM schema |
| XML+ (legends_plus.xml) | Full merge support | Built |
| Event type coverage | 115+ event types | 131-test suite; coverage in progress |
| Interactive map | Leaflet.js with site markers | Not yet |
| Family tree | Cytoscape.js dagre layout | Not yet |
| Warfare graph | Cytoscape.js cola layout | Not yet |
| Event timeline charts | Chart.js line/bar | Not yet |
| Population charts | Chart.js doughnut | Not yet |
| Paginated search/filter | Server-side with text search | Not yet (DB-backed) |
| Cross-linked HTML events | HTML anchor string generation | Partial (text narratives) |
| Multi-world bookmarks | File-based bookmark store | N/A (single-world DB) |
| Per-object mini-maps | Region highlight + oval | Not yet |
| Civilization colors | HSV rotation per race | Not yet |

---

## Recommendations

1. **Adopt the event HTML rendering pattern**: LegendsViewer-Next generates HTML anchor strings server-side and injects them via `v-html`. This is an excellent pattern for Chronicler's narrative enrichment pipeline — render events as richly-linked prose once at ingestion time.

2. **Use the event type taxonomy as a canonical reference**: The 115 event types in `XMLParser.cs:408-823` is the authoritative list of what DF exports. Map these directly to Chronicler's CDM event types to ensure completeness.

3. **Adopt the dual-file merge strategy**: The `XmlPlusParser.AddNewPropertiesAsync()` property-merge-by-id approach is elegant. Chronicler already does this but the ID-matching logic here is worth examining for edge cases.

4. **Family tree depth limits**: The 3-ancestor depth limit (separate for mother/father lineages) prevents infinite recursion on large dynastic trees. Chronicler should implement the same constraint.

5. **Civilization color generation**: The HSV rotation algorithm in `World.GenerateCivColors()` (medium/light/dark variants for up to 18+ races) is directly reusable for Chronicler's visualization layer.

6. **FilteredStream pattern**: The non-printable character replacement wrapper is essential — DF XML regularly contains control characters. Verify Chronicler handles this equivalently.

---

## Action Items

- [ ] Extract the 115 event type strings from `XMLParser.cs:408-823` into Chronicler's canonical event type enum/table
- [ ] Review `HistoricalFigureExtensions.CreateFamilyTreeElements()` as a spec for Chronicler's genealogy API endpoint
- [ ] Use `Map.vue` coordinate math `[(height - y) * scale, x * scale]` as reference for any Chronicler map implementation
- [ ] Audit Chronicler CDM against `HistoricalFigure.cs` field list for completeness
- [ ] Review `XmlPlusParser.AddNewPropertiesAsync()` lines 120-148 for entity-type-specific merge rules (Entities, Artifacts, WrittenContent, Events each have special cases)
- [ ] Consider adopting paginated server-side search pattern from `WorldObjectGenericController` for Chronicler's REST API

---

## Sources

All sources are local code files in `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/`:

1. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/README.md` — Overview and feature description
2. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/XMLParser.cs` — Core parser: event type dispatch (lines 408-888), section dispatch (lines 70-130), async parse loop
3. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/FilteredStream.cs` — Non-printable character filtering
4. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Parser/XMLPlusParser.cs` — Plus-file merge logic
5. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/World.cs` — World data model, post-processing, ParseAsync orchestration
6. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/WorldObjects/HistoricalFigure.cs` — Full HF data model and constructor parsing
7. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/WorldObjects/Site.cs` — Site data model
8. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Legends/Maps/WorldMapImageGenerator.cs` — SkiaSharp map generation
9. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Extensions/HistoricalFigureExtensions.cs` — Family tree Cytoscape data builder
10. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Backend/Controllers/WorldObjectControllers.cs` — REST API endpoints
11. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/router/index.ts` — All 70 routes
12. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/App.vue` — Navigation structure, 8 menu groups
13. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/Map.vue` — Leaflet map: coordinate math, site marker shapes, layer control
14. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/FamilyTree.vue` — Cytoscape.js dagre family tree
15. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/WarfareGraph.vue` — Cytoscape.js cola warfare graph with tippy tooltips
16. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/HistoricalFigure.vue` — HF detail page layout, all card sections
17. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/World.vue` — World summary page layout
18. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/views/WorldOverview.vue` — Bookmark/world loader page
19. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/WorldObjectPage.vue` — Generic detail page template
20. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/components/WorldObjectsPage.vue` — Generic list page template with search
21. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/src/stores/worldObjectStores.ts` — Pinia store factory, all API paths
22. `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/LegendsViewer.Frontend/legends-viewer-frontend/package.json` — Dependencies: chart.js, cytoscape, leaflet, vuetify, pinia

---

## Uncertainties

- **Entity detail page**: The `Entity.vue` and `Entity.cs` files were not fully read. The warfare graph is likely embedded there alongside entity member lists, but the exact field inventory for Entity beyond what is in `World.cs` was not confirmed from source.
- **History file parsing**: `HistoryParser.cs` was not read. The `.txt` history file adds narrative detail but its exact contribution to the data model is unknown.
- **SiteAndPopulationsParser**: Not read. Contributes `SitePopulations`, `CivilizedPopulations`, `OutdoorPopulations`, `UndergroundPopulations` lists.
- **WorldObjectGenericController**: The base controller with paginated GET, by-id GET, events, event collections, and chart endpoints was not read in full — but the pattern is clear from the store bindings.
- **Artifact.cs / WrittenContent.cs / ArtForm.cs**: Full field inventories not captured.

## Related Topics

- Chronicler CDM field mapping: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/unit-hf-field-mapping.md`
- Chronicler PRD v2: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/chronicler-prd-v2.md`
- DF XML structure reference: `GitRepos/df-structures` (indexed in Qdrant)
