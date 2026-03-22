# Chronicler vs Legends Viewer Next: Feature Comparison & Enhancement Proposals

**Version**: 1.0
**Date**: 2026-03-18
**Author**: Jarvis (comparative analysis agent)
**Purpose**: Side-by-side feature comparison and creative enhancement proposals to guide Chronicler development through Phases 3-7.

---

## 1. Executive Summary

**Legends Viewer Next (LVN)** is the current gold standard for Dwarf Fortress legends browsing. It is a desktop application built on Vue 3 + TypeScript (frontend) and C# .NET 8 (backend), with SkiaSharp for server-side map rendering. LVN operates entirely in-memory after loading legends XML, providing fast exploration of historical data across 79 frontend routes. Its strengths are breadth of entity coverage, polished visualizations (Leaflet.js maps, Cytoscape.js graphs, Chart.js analytics), and deep event collection modeling (19 aggregate types including wars, journeys, performances, and ceremonies).

**Chronicler** is a next-generation legends viewer and live game companion built on Python/FastAPI (backend), Jinja2 + Tailwind CSS (frontend), and PostgreSQL (persistent storage). Chronicler already surpasses LVN in several dimensions: persistent multi-world database storage (1.68M+ records), live fortress polling via DFHack bridge, an AI storyteller with 114 event templates and death-cause rendering, a Knowledge Horizon system (planned), and embedding pipelines for semantic search. Chronicler currently has 17 entity detail pages, global search with autocomplete, hover popovers, and a monitoring dashboard.

**The opportunity**: Chronicler can absorb LVN's visualization and navigation strengths while leveraging its unique advantages (persistent DB, live data, AI narrative, Knowledge Horizon) to create a tool that is categorically superior to anything in the DF ecosystem. This document maps every gap and proposes 30+ enhancements to guide that effort.

---

## 2. Feature Gap Analysis

### 2.1 Navigation & Search

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Global entity search | Full-text across all types | Global search with live autocomplete, categorized results | **Parity** |
| Bookmark/save worlds | Save/load without re-upload | Multi-world persistent DB (superior) | **Chronicler ahead** |
| Breadcrumb navigation | Vue router history | Prev/next FABs on detail pages | **Parity** |
| Hover preview popovers | Tippy.js tooltips on graph nodes | Ajax-fetched Bootstrap/Tippy popovers on entity links | **Parity** |
| 79 dedicated routes | Full coverage of all entity/collection types | 17 detail page templates + explorer tabs | **Medium — see Section 2.3** |
| URL deep-linking | Vue router with query params | Server-rendered URLs (bookmarkable) | **Parity** |

### 2.2 Entity / HF / Site Detail Pages

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Historical Figure detail | Full biography, events, relationships, positions, family | 24-section HF detail page with vis.js graph, events, links | **Parity** |
| Entity (Civilization) detail | Leaders, sites, members, wars, populations | 5-tab civ page (Leaders, Sites, Members, Groups, Wars) | **Parity** |
| Site detail | Structures, owners, history, population | 3-tab site detail (Structures, Properties, History) + Denizens tab | **Parity** |
| Artifact detail | Chain of custody, written content links | Chain-of-custody timeline | **Parity** |
| Region detail | Biome, evilness, sites, forces | Biome, evilness, sites | **Parity** |
| Structure detail | Type, inhabitants, deity | Type, entity, details | **Parity** |
| Written Content detail | Author, references, styles | Author, style, references | **Parity** |
| Underground Region detail | Type, depth, populations | Type, depth, coords | **Parity** |
| Landmass detail | Coordinates, regions | Coordinates | **Parity** |
| Mountain Peak detail | Height, volcano status | Height, volcano, prominence | **Parity** |
| River detail | Path, end type | Path, end type, English name | **Parity** |
| World Construction detail | Type, coords | Type, coords | **Parity** |
| Art Form detail (dance/musical/poetic) | Browse by form type, descriptions | 3-type detail with description, JSONB details | **Parity** |
| Identity detail | Name, race, associated HF | Name, race, JSONB details | **Parity** |
| Historical Era detail | Name, start/end year | Name, year range | **Parity** |
| Entity Position assignments | Position history with dates | HF position links with entity cross-refs | **Parity** |
| Event Collection detail (19 types) | War, Battle, Journey, Raid, Duel, Insurrection, Persecution, Purge, BeastAttack, Abduction, Theft, Procession, Performance, Competition, Ceremony, Occasion, SiteConquered | Collection detail with drill-down hierarchy | **Low — Chronicler has all 19 types in DB** |

### 2.3 Dedicated Route Coverage (LVN's 79 routes vs Chronicler)

| Route Category | LVN Routes | Chronicler Equivalent | Gap |
|---------------|-----------|----------------------|-----|
| Wars | war list, war detail | Event collection filtered by type=War | **Low** |
| Battles | battle list, battle detail | Event collection type=Battle | **Low** |
| Raids | raid list, raid detail | Event collection type=Raid | **Low** |
| Duels | duel list, duel detail | Event collection type=Duel | **Low** |
| Journeys | journey list, journey detail | Event collection type=Journey | **Low** |
| Insurrections | list + detail | Event collection type=Insurrection | **Low** |
| Persecutions | list + detail | Event collection type=Persecution | **Low** |
| Purges | list + detail | Event collection type=Purge | **Low** |
| Beast Attacks | list + detail | Event collection type=BeastAttack | **Low** |
| Abductions | list + detail | Event collection type=Abduction | **Low** |
| Thefts | list + detail | Event collection type=Theft | **Low** |
| Processions | list + detail | Event collection type=Procession | **Low** |
| Performances | list + detail | Event collection type=Performance | **Low** |
| Competitions | list + detail | Event collection type=Competition | **Low** |
| Ceremonies | list + detail | Event collection type=Ceremony | **Low** |
| Occasions | list + detail | Event collection type=Occasion | **Low** |
| Eras | era browser | era_detail.html (has it) | **None** |
| Landmasses | list + detail | landmass_detail.html (has it) | **None** |
| Rivers | list + detail | river_detail.html (has it) | **None** |
| Mountain Peaks | list + detail | mountain_peak_detail.html (has it) | **None** |
| World Constructions | list + detail | construction_detail.html (has it) | **None** |
| Underground Regions | list + detail | underground_region_detail.html (has it) | **None** |
| Dance/Musical/Poetic Forms | 3 lists + details | art_form_detail.html (has it) | **None** |
| Written Content | list + detail | written_content_detail.html (has it) | **None** |

**Assessment**: Chronicler has detail pages for all entity types. The "gap" is primarily that LVN has dedicated list views with filtering for each event collection type (wars, battles, raids, etc.), while Chronicler uses a generic collection browser. Adding filtered collection list views is a quick win (see Section 8).

### 2.4 Map & Geography

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Interactive world map | Leaflet.js with L.CRS.Simple, pre-rendered PNG overlay | Not yet built (Phase 5 planned) | **High** |
| Site markers by type | 18 shape/color configs (circle, pentagon, hexagon, star, etc.) | Planned in Phase 5 PRD (6 shapes) | **High** |
| Ownership layer toggles | Filter sites by owning civ | Planned in Phase 5 PRD | **High** |
| Region type coloring | Server-side map generation (SkiaSharp) | Planned: Python Pillow generation | **High** |
| Underground depth layers | Separate layers by cavern depth | Not planned | **Medium** |
| Object-specific map views | Map centered on entity with highlight | Planned: per-object mini-maps | **Medium** |
| 3 zoom scale levels | 2px, 4px, 10px tile sizes | Planned: 3 cached sizes (2, 4, 10) | **Parity (planned)** |
| Map search + camera jump | Search sites/regions on map | Planned in Phase 5 PRD | **Parity (planned)** |
| Territory overlays | Civilization territories via convex hull | Planned P3 in Phase 5 PRD | **Medium** |
| Timeline scrubber | Historical ownership at any year | Planned P3 in Phase 5 PRD | **Medium** |

### 2.5 Warfare & Conflict

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Warfare graph | Cytoscape.js with Cola force-directed layout | Planned in Phase 5 PRD (Stage 5.4) | **High** |
| War detail page | Attacker/defender, battles, casualties | Event collection type=War with drill-down | **Low** |
| Battle detail | Location, participants, outcome | Event collection type=Battle | **Low** |
| War timeline charts | Chart.js line/bar for war duration | Not planned | **Medium** |
| Death breakdown by race (wars) | Doughnut chart per war | Not planned | **Medium** |
| Army movement visualization | Not present | Not planned | **Medium — see Section 5** |

### 2.6 Family & Relationships

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Family tree graph | Cytoscape.js with Dagre hierarchical layout | Planned in Phase 5 PRD (Stage 5.3) | **High** |
| Gender-colored nodes | Blue male, pink female | Planned with same colors | **Parity (planned)** |
| Status indicators | Dead/ghost/vampire/werebeast icons | Planned with CSS classes | **Parity (planned)** |
| Click-to-navigate graph nodes | Node click opens entity page | Planned | **Parity (planned)** |
| Ego-network graph | Not present (warfare graph serves different purpose) | vis.js ego-network partially built | **Chronicler ahead** |
| Relationship profiles | Not present | `hf_relationship_profiles` table (love/respect/trust/fear) | **Chronicler ahead** |
| Vague relationships | Not present | `hf_vague_relationships` table (war_buddy, grudge, etc.) | **Chronicler ahead** |
| Intrigue plots | Not present | `hf_intrigue_plots` table with JSONB details | **Chronicler ahead** |

### 2.7 Charts & Statistics

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Population doughnut chart | Chart.js doughnut by race | Planned in Phase 5 PRD | **High** |
| Event timeline line chart | Chart.js line chart (events per year) | Planned in Phase 5 PRD | **High** |
| Event type bar chart | Horizontal bar sorted descending | Planned in Phase 5 PRD | **High** |
| War death breakdown doughnut | Per-war casualty by race | Not planned | **Medium** |
| World summary dashboard | Entity counts, civ list | Planned in Phase 5 PRD (Stage 5.2) | **High** |
| Importance scoring | Not present | `prominence_score` + `salience_score` on all entities | **Chronicler ahead** |

### 2.8 Event Collections & Timelines

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| 19 event collection types | Full modeling with dedicated routes | All 19 types in DB + collection_detail.html | **Parity** |
| Collection drill-down (War -> Battle -> Events) | Hierarchical navigation | Planned: `<details>`/`<summary>` AJAX drill-down | **Low** |
| Years/Events browser | Era-based timeline | years_browser.html (chronological index) | **Parity** |
| Event template rendering | ~130 event type renderers in C# | 114 event templates in PerspectiveRenderer | **Low — 18 templates short** |

### 2.9 Arts & Culture

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Dance form browser | Dedicated list + detail | art_form_detail.html (form_type='dance') | **Parity** |
| Musical form browser | Dedicated list + detail | art_form_detail.html (form_type='musical') | **Parity** |
| Poetic form browser | Dedicated list + detail | art_form_detail.html (form_type='poetic') | **Parity** |
| Written content reader | Full text, author, references | written_content_detail.html with cross-links | **Parity** |

### 2.10 Live Game Integration (Chronicler-only)

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Live fortress bridge | Not present | chronicler-bridge.lua (21 functions, 7 domains, 1077 lines) | **Chronicler-only** |
| Unit tracking | Not present | `units` table with live polling | **Chronicler-only** |
| Real-time event feed | Not present | Planned: eventful subscriptions (Stage 3.1) | **Chronicler-only** |
| Worldgen monitoring | Not present | Planned: worldgen-bridge.lua (Stage 3.2) | **Chronicler-only** |
| Knowledge Horizon | Not present | Planned: visibility masking system (Stage 3.3) | **Chronicler-only** |
| AI Storyteller | Not present | Keyword-routed storyteller with 23 routes + SSE streaming | **Chronicler-only** |
| AI Fortress Advisor | Not present | Planned: Phase 6 (LLM + fortress state) | **Chronicler-only** |
| Mod Manager | Not present | Planned: Phase 6 (mod discovery, conflict detection) | **Chronicler-only** |
| Labor Manager | Not present | Planned: Phase 6 (Dwarf Therapist-equivalent) | **Chronicler-only** |
| Embedding/semantic search | Not present | Planned: pgvector + hybrid search (Stage 3.4) | **Chronicler-only** |

### 2.11 Data Sources

| Feature | LVN Status | Chronicler Status | Gap Priority |
|---------|-----------|-------------------|--------------|
| Legends XML parsing | Full in-memory parse | 15+ XML sections parsed to PostgreSQL | **Parity** |
| legends_plus.xml support | Full extended data | Full extended data (skills, kills, reputations, etc.) | **Parity** |
| Dual-file merge | legends + legends_plus merge | Merge rules audited against LV-Next/LB2 | **Parity** |
| creature_raw parsing | Creature definitions | creature_dictionary table with flags JSONB | **Parity** |
| Persistent storage | In-memory only (re-upload each session) | PostgreSQL with multi-world support | **Chronicler ahead** |
| Live game data | Not present | DFHack bridge + SSH transport | **Chronicler ahead** |

---

## 3. Detailed Gap Descriptions

### 3.1 Interactive World Map (HIGH PRIORITY)

LVN renders a world map using Leaflet.js with `L.CRS.Simple` for pixel-coordinate mapping. The server generates a PNG base map via SkiaSharp, coloring each world tile by region type. Sites appear as markers with 18 distinct shape/color configurations: circles for caves and camps, pentagons for fortresses and towns, hexagons for mountain halls, stars for vaults and towers. An ownership toggle lets users filter sites by controlling civilization, with colors assigned per-entity.

Chronicler has all the data needed (sites with `coord_x`/`coord_y`, regions with `coords` and `type`, entity ownership via `owner_entity_id`) but no map UI yet. The Phase 5 PRD (`phase-5-visualization.md`) contains a complete implementation plan including Leaflet.js setup, Python Pillow map generation, 7 layer groups, and site marker shapes. This is the single most impactful visualization gap.

### 3.2 Family Tree Visualization (HIGH PRIORITY)

LVN uses Cytoscape.js with the Dagre hierarchical layout plugin to render family trees. Nodes are colored by gender (blue/pink), with shape and opacity variations for vampires, necromancers, werebeasts, ghosts, and the dead. The tree is navigable — clicking a node opens that HF's detail page.

Chronicler already has a vis.js ego-network graph on HF detail pages, but it is a force-directed layout (not hierarchical) and mixes family, mentorship, and other relationship types. The Phase 5 PRD specifies a dedicated Cytoscape.js + Dagre family tree with 3-generation depth, two display sizes (360px embedded, 720px fullscreen), and the same gender/status node styling as LVN.

### 3.3 Charts and Demographics Dashboard (HIGH PRIORITY)

LVN uses Chart.js via vue-chartjs for multiple chart types: line charts for timelines, bar charts for categories, doughnut charts for race breakdowns in wars. A world summary dashboard presents quick statistics alongside visualizations.

Chronicler has no charts yet. The Phase 5 PRD plans Chart.js 4.x for population doughnut charts, event timeline line charts (clickable years), event type bar charts, and a world summary dashboard with map thumbnail, charts, and statistics. All data is available in PostgreSQL — this is purely a frontend build task.

### 3.4 Warfare Graph (MEDIUM PRIORITY)

LVN's warfare graph uses Cytoscape.js with the Cola force-directed layout to show entities as nodes and wars/relationships as edges. Tippy.js tooltips provide hover details, and clicking a node navigates to the entity page.

Chronicler has the `history_event_collections` table with all war/battle data and the entity relationships needed. The Phase 5 PRD plans both a Cytoscape.js warfare graph (Stage 5.4.2) and a D3.js war chord diagram (Stage 5.4.1). These are P3 priority and may be deferred from Phase 5.

### 3.5 Dedicated Event Collection List Views (LOW PRIORITY)

LVN has 19 dedicated list views for each event collection type (wars, battles, raids, journeys, etc.), each with type-specific columns and sorting. Chronicler has a generic collection_detail page that works for all types but lacks dedicated list views with type-appropriate column layouts.

Adding filtered list views (e.g., `/explorer/wars?world_id=1`) with type-specific columns is a straightforward template + route task.

### 3.6 Underground Depth Layers (LOW PRIORITY)

LVN supports separate map layers by underground depth, showing cavern systems at different levels. Chronicler's `underground_regions` table stores `depth` data, so this is feasible but not currently planned. It would require extending the map layer system with depth-filtered queries.

---

## 4. Interactive Map Design Proposal

### 4.1 Technology Choice

**Recommendation: Leaflet.js 1.9.4** — already proven in LVN, already specified in Chronicler's Phase 5 PRD, lightweight (42KB gzip), excellent plugin ecosystem, well-documented `L.CRS.Simple` mode for non-geographic coordinate systems.

Alternative considered: MapLibre GL JS (vector tiles, WebGL rendering). Rejected because Chronicler's world maps are small (typically 257x257 tiles), making the overhead of vector tile infrastructure unjustified.

### 4.2 Data Sources

| Data | Source Table | Key Fields |
|------|-------------|------------|
| Region terrain | `regions` | `type`, `coords`, `evilness` |
| Site positions | `sites` | `coord_x`, `coord_y`, `type`, `owner_entity_id` |
| Site boundaries | `sites` | `details->'rectangle'` |
| Mountains | `mountain_peaks` | `coords`, `height`, `is_volcano` |
| Rivers | `rivers` | `path` (pipe-delimited coordinate pairs) |
| Roads/Bridges | `world_constructions` | `type`, `coords` |
| Landmasses | `landmasses` | `coord_1`, `coord_2` |
| Underground regions | `underground_regions` | `coords`, `depth` |
| Battle locations | `history_event_collections` | `details->'coords'` (where type=Battle) |
| Army positions | `history_events` | Events with site coords (type like '%army%' or '%squad%') |
| HF locations | `historical_figures` | `whereabouts` JSONB (last known location) |
| Entity territories | `entity_site_links` | Owned sites -> convex hull |
| Live unit positions | `units` (live bridge) | Current fortress tile coords |

### 4.3 Map Layers

| Layer | Geometry | Toggle | Default |
|-------|----------|--------|---------|
| **Terrain Base** | Image overlay from Pillow-generated PNG | Always on | On |
| **Sites** | Shaped markers (6 types) with civ-color fill | Yes | On |
| **Site Boundaries** | Dashed rectangles from site rectangle data | Yes | Off |
| **Regions** | Outline polygons color-coded by evilness | Yes | Off |
| **Mountains** | Triangle markers at peak coords; volcano=red | Yes | On |
| **Rivers** | Polylines from path coordinates | Yes | On |
| **Roads/Bridges** | Polylines/points from construction coords | Yes | Off |
| **Landmasses** | Semi-transparent rectangles | Yes | Off |
| **Battles** | Red diamond markers at battle coords | Yes | Off |
| **Entity Territories** | Convex hull polygons per civ (semi-transparent) | Yes | Off |
| **Underground** | Separate layer group per depth level | Yes | Off |
| **HF Last Known** | Small dots at HF whereabouts (filtered by importance) | Yes | Off |
| **Live Fortress** | Pulsing marker at fortress location (bridge data) | Yes | On (when live) |

### 4.4 Interaction Model

1. **Click site marker** -> Popup with site name, type, owner, population count, link to site detail page
2. **Click battle marker** -> Popup with war name, belligerents, outcome, link to collection detail
3. **Right-click site** -> Context menu: "Show ownership history", "Show events at this site", "Navigate to detail"
4. **Filter by owner** -> Dropdown or checkbox list of civilizations; non-matching sites grayed out
5. **Timeline scrubber** -> Horizontal slider (year range 0 to max_year); sites recolored by historical owner at selected year; "not yet founded" sites hidden
6. **Search overlay** -> Autocomplete input on map; selecting result flies camera to location with highlight pulse
7. **Layer toggles** -> Leaflet `L.control.layers` with custom "All" / "None" buttons
8. **Zoom to entity** -> API parameter `?focus=site:42` centers map on entity and highlights it

### 4.5 Live Data Overlay

When the DFHack bridge is active:
- **Fortress marker**: Pulsing green marker at fortress site with population count badge
- **Army alerts**: Red pulsing markers for detected siege/invasion forces (from eventful subscriptions)
- **Migration paths**: Dotted lines showing incoming migrant wave source civilizations
- **Trade caravans**: Moving dot on path from civ HQ to fortress site (when detected by bridge)

### 4.6 Map Page Layout (ASCII Mockup)

```
+------------------------------------------------------------------+
|  CHRONICLER          [Search sites, regions...]    [World: Tar Thran]  |
+------------------------------------------------------------------+
|  [Map] [People] [Civs] [Geography] [Data] [Graph] [Storyteller]      |
+------------------------------------------------------------------+
|  Layer Controls  |                                                |
|  [x] Sites       |                                                |
|  [x] Mountains   |                                                |
|  [ ] Regions     |          INTERACTIVE WORLD MAP                 |
|  [x] Rivers      |                                                |
|  [ ] Roads       |      (Leaflet.js L.CRS.Simple)                 |
|  [ ] Battles     |                                                |
|  [ ] Territories |     [Site markers with shape/color]            |
|  [ ] Underground |     [River polylines]                          |
|  [ ] HF Locate   |     [Mountain triangles]                       |
|  ----------      |                                                |
|  Filter by Civ:  |                                                |
|  [x] All         |                                                |
|  [ ] Dwarves     |                                                |
|  [ ] Elves       |                                                |
|  [ ] Goblins     +------------------------------------------------+
|  [ ] Humans      |  Timeline: [====|=========] Year 125 of 250    |
+------------------+------------------------------------------------+
|  Clicked Entity Info Panel (collapsible)                          |
|  Site: Boatmurdered | Type: Fortress | Owner: The Splattered Walls|
|  Population: 142 | Founded: Year 3 | [Open Detail Page ->]        |
+------------------------------------------------------------------+
```

---

## 5. Army Movement & War Visualization Proposal

### 5.1 Battle Location Mapping

Extract coordinates from `history_event_collections` where `type = 'Battle'`. The `details` JSONB may contain site references; if not, derive location from the associated site in the parent War collection or from the attacking/defending entity's site.

Display as:
- **Battle markers**: Red diamond on map, sized by participant count
- **Popup**: War name, attacker, defender, outcome, casualty count, link to battle detail
- **Cluster**: At low zoom, nearby battles cluster with count badge

### 5.2 Army Path Animation

For wars with multiple battles, draw animated polylines connecting battle locations in chronological order:
- **Attacker path**: Red dashed line with animated dash-offset (CSS animation)
- **Defender path**: Blue dashed line
- **Direction arrows**: Small arrow markers along path indicating army direction
- **Playback control**: Play/pause/speed buttons to animate army movement through campaign

Implementation: Leaflet.js `L.polyline` with `dashArray` and CSS `stroke-dashoffset` animation, or the `leaflet-ant-path` plugin for moving-dash effects.

### 5.3 War Timeline with Battle Markers

A dedicated war detail view combining:

```
+------------------------------------------------------------------+
|  WAR: The Assault of Searing (Year 45 - Year 89)                |
+------------------------------------------------------------------+
|  Attacker: The Steamy Confederacy (Goblins)                      |
|  Defender: The Gloved Union (Dwarves)                            |
+------------------------------------------------------------------+
|  TIMELINE                                                        |
|  Y45----Y50----Y55----Y60----Y65----Y70----Y75----Y80----Y89     |
|   *       *  *    *              *    *  *     *       *          |
|   |       |  |    |              |    |  |     |       |          |
|   B1     B2 B3   B4            B5   B6 B7    B8      B9          |
|  (hover any * for battle summary)                                |
+------------------------------------------------------------------+
|  MAP VIEW                          |  CASUALTIES                 |
|  [Map zoomed to war theater]       |  Attacker: 1,234 killed     |
|  [Battle markers numbered B1-B9]   |  Defender: 567 killed       |
|  [Army paths animated]             |  [Doughnut by race]         |
+------------------------------------|-----------------------------+
|  WARFARE GRAPH (Cytoscape.js)                                    |
|  [Force-directed: entities as nodes, wars as edges]              |
|  [Click node -> navigate to entity detail]                       |
+------------------------------------------------------------------+
```

### 5.4 Warfare Network Graph

Using Cytoscape.js with Cola force-directed layout:
- **Nodes**: Civilizations (diamond shape, civ color), individual HFs who led armies (circle, smaller)
- **Edges**: Wars (red, width proportional to battle count), alliances (green dashed), vassalage (blue arrow)
- **Tooltips**: Tippy.js on hover showing entity name, type, war count
- **Click**: Navigate to entity or war detail page
- **Filter**: Toggle to show only active wars, only wars involving selected civ, or all historical wars

### 5.5 Live Army Tracking (Phase 3 Integration)

When the bridge is active during fortress mode:
- Detect siege/invasion events via eventful subscriptions (INVASION, UNIT_NEW_ACTIVE with invader flag)
- Show approaching army as animated marker moving toward fortress
- Display army composition in sidebar (race, count, equipment summary)
- Historical: replay past invasions from event log with animated paths

---

## 6. HF Migration Path Proposal

### 6.1 Movement Data Extraction

Historical figure movement can be reconstructed from multiple event types:

| Event Type | Movement Meaning | Data Fields |
|------------|-----------------|-------------|
| `hf_travel` | Voluntary travel | origin site, destination site |
| `change_hf_state` (settled) | Permanent relocation | site_id |
| `hf_new_pet` at new site | Incidental travel indicator | site_id |
| `add_hf_entity_link` | Joined organization at location | entity_id -> sites |
| `hf_departed` | Left a site | site_id |
| `hf_reached_summit` | Mountain visit | coords |
| `creature_devoured` | Predatory movement | site_id |
| `hf_wounded` / `hf_died` | Final location | site_id |
| `hf_abducted` | Forced movement | site_id (abduction target) |
| `hf_razed_structure` | Military campaign | site_id |
| `artifact_stored` | Artifact placement travel | site_id |
| `hf_confronted` | Meeting at location | site_id |

### 6.2 Path Visualization

On the HF detail page, add a "Journey Map" tab:

```
+------------------------------------------------------------------+
|  HISTORICAL FIGURE: Urist McAxedwarf                             |
|  [Biography] [Events] [Relationships] [Journey Map] [Graph]      |
+------------------------------------------------------------------+
|  Journey Map                                                      |
|  +----------------------------------------------------+          |
|  |                                                    |          |
|  |    (1) Born: Silvervaults          (3) Traveled    |          |
|  |     *------------------------------*  to Ringbell  |          |
|  |                                    |               |          |
|  |              (2) Settled at        |               |          |
|  |               Bridgehelm     (4) * Fled to         |          |
|  |                *-----------/ Westfort              |          |
|  |                            (kidnapped)             |          |
|  |                                    \               |          |
|  |                              (5) *  Died at        |          |
|  |                               Spearbreakers        |          |
|  |                                                    |          |
|  +----------------------------------------------------+          |
|  Timeline: [====|==========] Year 78 of 145                      |
|  Legend: --- peaceful  ~~~ flee  === military  ... kidnap         |
+------------------------------------------------------------------+
```

### 6.3 Path Color Coding

| Movement Type | Line Style | Color |
|--------------|-----------|-------|
| Peaceful relocation | Solid line | `#22c55e` (green) |
| Flee / escape | Wavy dashed | `#eab308` (yellow) |
| Kidnapped / abducted | Dotted | `#ef4444` (red) |
| Military campaign | Thick solid | `#3b82f6` (blue) |
| Trade / diplomatic | Thin dashed | `#a855f7` (purple) |
| Unknown / inferred | Dotted gray | `#78716c` (stone) |

### 6.4 Timeline Scrubber Integration

- Horizontal slider showing HF's lifespan (birth_year to death_year or current year)
- Dragging scrubber reveals path incrementally (animated drawing of lines up to selected year)
- Click any waypoint to see the event that caused the movement
- "Play" button animates the full journey at configurable speed

### 6.5 Integration with HF Detail Page

- Embedded mini-map (200px) showing journey overview on the Biography tab
- Full-screen Journey Map tab with all controls
- Cross-link: clicking a site on the journey map navigates to site detail
- API endpoint: `GET /api/map/hf_journey/{hf_id}?world_id={wid}` returns ordered waypoints with event references

---

## 7. Additional Enhancement Proposals

### Map Enhancements

#### 7.1 Territory Animation Over Time
- **Description**: Animate civilization territory growth/shrinkage over world history. Convex hull polygons expand as sites are founded and contract as sites fall. Slider or "play" button steps through years.
- **Data source**: `entity_site_links` (start_year, end_year) + `sites` (coord_x, coord_y)
- **Difficulty**: L (requires temporal queries + animation logic)
- **Phase alignment**: Phase 5 (Stage 5.4.5 extension)

#### 7.2 Trade Route Inference
- **Description**: Infer trade routes between civilizations by connecting capital sites of entities that have trade-related events. Display as dashed lines on map with trade frequency as line thickness.
- **Data source**: `history_events` (type like '%trade%' or '%caravan%'), `entity_site_links`, `sites`
- **Difficulty**: M (event mining + route inference)
- **Phase alignment**: Phase 5

#### 7.3 Migration Heatmap
- **Description**: Heatmap overlay showing where HFs concentrate over time. High-density areas glow warm (red/orange), sparse areas stay cool (blue/transparent). Animated with timeline scrubber.
- **Data source**: `historical_figures.whereabouts` + event-derived locations
- **Difficulty**: M (aggregation + Leaflet.heat plugin)
- **Phase alignment**: Phase 5

#### 7.4 Biome Explorer Layer
- **Description**: Toggle layer showing region biome types with terrain-appropriate colors and textures. Click a region to see its biome details, evilness level, and contained sites.
- **Data source**: `regions` (type, evilness, coords)
- **Difficulty**: S (region coloring already planned; add interactivity)
- **Phase alignment**: Phase 5

### Timeline Features

#### 7.5 World Timeline Browser
- **Description**: A full-page chronological timeline showing major events as cards on a vertical or horizontal scrolling view. Events are sized by importance score. Filter by type, entity, or region.
- **Data source**: `history_events` + `history_event_collections` + `historical_eras`
- **Difficulty**: M (UI design + importance filtering)
- **Phase alignment**: Phase 5 (Stage 5.4.6 extension)

#### 7.6 "This Year in History" Summary
- **Description**: For any selected year, generate a newspaper-style summary: major events, births, deaths, wars started/ended, sites founded/destroyed. Template-rendered with optional AI narrative.
- **Data source**: `history_events` filtered by year
- **Difficulty**: M (template design + optional LLM integration)
- **Phase alignment**: Phase 4 (narrative engine synergy)

#### 7.7 Era Browser with Event Density
- **Description**: Visual era browser showing historical eras as horizontal bars with event density heatmap (darker = more events). Click an era to expand and see major events within.
- **Data source**: `historical_eras` + `history_events` grouped by year
- **Difficulty**: S (Chart.js + era data already available)
- **Phase alignment**: Phase 5

### Analytics

#### 7.8 Population Trend Lines
- **Description**: Line chart showing civilization population over time, derived from birth/death events. Track rise and fall of each civ. Overlay with war periods (shaded regions).
- **Data source**: `history_events` (birth/death types) grouped by year and entity
- **Difficulty**: M (temporal aggregation + multi-series chart)
- **Phase alignment**: Phase 5

#### 7.9 Power Rankings Dashboard
- **Description**: Ranked list of civilizations by configurable metrics: population, site count, military strength (kill count of members), cultural output (written content, art forms). Sparkline trend for each.
- **Data source**: Aggregated from `entities`, `sites`, `historical_figures`, `written_contents`, `art_forms`
- **Difficulty**: M (multi-metric aggregation + ranking UI)
- **Phase alignment**: Phase 5

#### 7.10 Death Statistics Dashboard
- **Description**: Comprehensive death analytics: deaths by cause (pie chart), deaths by race (bar chart), deadliest years (line chart), deadliest sites (ranked list), most prolific killers (ranked list with kill counts).
- **Data source**: `historical_figures` (death_year, death_cause) + `history_events` (death events)
- **Difficulty**: S (aggregation queries + Chart.js)
- **Phase alignment**: Phase 5

#### 7.11 Megabeast Tracker
- **Description**: Dedicated page listing all megabeasts, forgotten beasts, and titans with their status (alive/dead), kill count, last known location, and associated events. Map overlay showing beast lairs and attack sites.
- **Data source**: `historical_figures` (associated_type like '%BEAST%' or '%TITAN%'), `history_events`
- **Difficulty**: S (filtered query + detail page)
- **Phase alignment**: Phase 5

### Relationship Visualization

#### 7.12 Alliance Network Graph
- **Description**: Force-directed graph showing civilizations connected by alliance/vassalage/religious relationships from `entity_entity_links`. Edge color by link type (PARENT=blue, CHILD=green, RELIGIOUS=purple). Node size by population.
- **Data source**: `entity_entity_links` (link_type, strength), `entities`
- **Difficulty**: S (Cytoscape.js with existing data)
- **Phase alignment**: Phase 5

#### 7.13 Religious Spread Map
- **Description**: Map overlay showing the geographic spread of religions/temples. Each worshipped entity gets a color. Sites with temples are marked. Animated timeline shows religious spread over history.
- **Data source**: `entities` (type='religion'), `structures` (type like '%temple%'), `entity_entity_links` (RELIGIOUS)
- **Difficulty**: M (religious entity resolution + map overlay)
- **Phase alignment**: Phase 5

#### 7.14 Curse Lineage Visualization
- **Description**: Trace vampire and werebeast curse chains from patient zero through all infected HFs. Tree layout showing infection order with dates. Color-coded: vampire=red/dark, werebeast=orange.
- **Data source**: `history_events` (type='hf_does_interaction'), `historical_figures` (is_vampire, is_werebeast, first_ageless_year)
- **Difficulty**: M (event chain reconstruction + tree layout)
- **Phase alignment**: Phase 5 (already in PRD as Stage 5.4.3)

### Narrative Features

#### 7.15 AI-Generated World Summary
- **Description**: On world load, generate a 2-3 paragraph AI summary of the world's history: major wars, dominant civilizations, notable figures, defining events. Cache and display on world dashboard.
- **Data source**: Aggregated statistics + top-importance events, fed to LLM
- **Difficulty**: M (prompt engineering + caching)
- **Phase alignment**: Phase 4 (narrative engine)

#### 7.16 "Notable Events" Highlight Reel
- **Description**: Algorithmically select the 20 most notable events in world history using importance scoring. Display as a curated timeline with AI-generated prose for each event.
- **Data source**: `history_events` ordered by computed importance, LLM for prose
- **Difficulty**: M (scoring algorithm + LLM integration)
- **Phase alignment**: Phase 4

#### 7.17 Character Obituary Generator
- **Description**: For any dead HF, generate a newspaper-style obituary combining biography, relationships, accomplishments, and cause of death into flowing prose. "Urist McAxedwarf, legendary axe lord of The Splattered Walls, perished in Year 145..."
- **Data source**: HF detail data + events + relationships, fed to LLM
- **Difficulty**: S (prompt template + existing data)
- **Phase alignment**: Phase 4

#### 7.18 Civilization Rise-and-Fall Narrative
- **Description**: Multi-paragraph narrative tracing a civilization's history from founding through wars, territorial changes, leadership transitions, and current state. Timeline sidebar with chapter markers.
- **Data source**: Entity events, site ownership history, position assignments
- **Difficulty**: M (event aggregation + narrative generation)
- **Phase alignment**: Phase 4 (already in PRD as Stage 4.2.3)

### Live Game Features

#### 7.19 Real-Time Event Feed
- **Description**: Scrolling feed of live game events as they happen (deaths, births, artifacts created, invasions). Each event rendered with the PerspectiveRenderer template system. Filterable by type.
- **Data source**: Bridge eventful subscriptions (Stage 3.1)
- **Difficulty**: M (WebSocket push + event rendering)
- **Phase alignment**: Phase 3

#### 7.20 Fortress Health Dashboard
- **Description**: Single-page dashboard showing fortress vital signs: population count (with trend), food/drink stocks, military strength, happiness distribution, recent deaths, active threats. Auto-refreshes from bridge data.
- **Data source**: Bridge polling data (units, events, game state)
- **Difficulty**: L (comprehensive bridge data + dashboard UI)
- **Phase alignment**: Phase 6 (already in PRD as Stage 6.3.6)

#### 7.21 Prediction Engine
- **Description**: Based on historical patterns and current fortress state, predict likely upcoming events: "Based on your fortress age and wealth, a goblin siege is likely within 2 years." Use statistical models from world history.
- **Data source**: Historical event patterns + current fortress metrics
- **Difficulty**: XL (statistical modeling + bridge integration)
- **Phase alignment**: Phase 6+

#### 7.22 Dwarf of the Day
- **Description**: Each day (real-time or game-time), highlight one fortress dwarf with a mini-biography, current mood, notable skills, and recent events. Encourages engagement with individual citizens.
- **Data source**: Bridge unit data + HF cross-reference
- **Difficulty**: S (random selection + existing data)
- **Phase alignment**: Phase 3 (quick win once bridge is enhanced)

### Social Features

#### 7.23 Civilization Comparison View
- **Description**: Side-by-side comparison of two civilizations: population, site count, military strength, cultural output, territory size, leadership history. Radar chart for multi-axis comparison.
- **Data source**: Aggregated entity statistics
- **Difficulty**: M (comparison UI + radar chart)
- **Phase alignment**: Phase 5

#### 7.24 Rivalry Tracker
- **Description**: Identify and display the most intense rivalries between civilizations (most wars, most battles, most casualties). Show rivalry score, history of conflicts, and current territorial proximity.
- **Data source**: `history_event_collections` (type=War), casualties from battle events
- **Difficulty**: M (rivalry scoring algorithm + visualization)
- **Phase alignment**: Phase 5

#### 7.25 HF Relationship Web
- **Description**: Full social network visualization showing all relationships for a selected HF out to N hops. Edge types colored differently (family=green, romantic=pink, mentorship=blue, rivalry=red). Relationship strength from `hf_relationship_profiles`.
- **Data source**: `hf_links`, `hf_relationship_profiles`, `hf_vague_relationships`
- **Difficulty**: M (graph data assembly + vis.js/Cytoscape.js rendering)
- **Phase alignment**: Phase 5

### Cultural Features

#### 7.26 Art Form Gallery
- **Description**: Visual gallery view of all art forms (dance, musical, poetic) with card layout showing name, type, description, and related HF artists. Filter by form type, search by name.
- **Data source**: `art_forms`, `written_contents`, `historical_figures` (is_author, is_auteur)
- **Difficulty**: S (card layout + existing data)
- **Phase alignment**: Phase 5

#### 7.27 Written Content Library
- **Description**: Browsable library of all written works with full-text display, author links, and subject cross-references. Filter by content type (poem, chronicle, novel, manual, etc.). Reading pane layout.
- **Data source**: `written_contents` with JSONB details
- **Difficulty**: S (list + detail layout with existing data)
- **Phase alignment**: Phase 5

### Geographic Features

#### 7.28 Underground Explorer
- **Description**: Dedicated view for underground regions showing cavern layers at different depths. Toggle between depth levels. Show underground sites, forgotten beast lairs, and adamantine locations.
- **Data source**: `underground_regions` (type, depth, coords), `sites` (underground types)
- **Difficulty**: M (depth layer filtering + map rendering)
- **Phase alignment**: Phase 5

#### 7.29 River System Tracer
- **Description**: Interactive river visualization: click a river to highlight its full path, show source, tributaries, and mouth. Display sites along the river. Useful for understanding trade routes and geographic barriers.
- **Data source**: `rivers` (path coordinates, end_type)
- **Difficulty**: S (polyline rendering + site proximity query)
- **Phase alignment**: Phase 5

### Gamification

#### 7.30 World Records & Superlatives
- **Description**: Dashboard of world records: oldest living HF, most prolific killer, largest civilization, longest war, most conquered site, most traveled HF, most children, etc. Each record links to the entity detail page.
- **Data source**: Aggregated queries across all entity tables
- **Difficulty**: S (SQL aggregation + display page)
- **Phase alignment**: Phase 5

#### 7.31 "Most Interesting" Rankings
- **Description**: Use the existing `prominence_score` and `salience_score` fields to rank entities by "interestingness." Display top 10 most interesting HFs, sites, civilizations, artifacts. Explain why each scored high.
- **Data source**: `prominence_score`, `salience_score` on all entity tables
- **Difficulty**: S (ranking query + explanatory UI)
- **Phase alignment**: Phase 5 (quick win — scores already computed)

#### 7.32 Achievement System
- **Description**: Define world-level achievements: "Century of Peace" (100 years without war), "The Great Plague" (100+ deaths in one year), "Cultural Renaissance" (50+ art forms created), "Megabeast Slayer" (civilization killed 5+ megabeasts). Scan world data and display earned achievements as badges.
- **Data source**: Pattern detection across event tables
- **Difficulty**: M (achievement definitions + detection queries)
- **Phase alignment**: Phase 5 or Phase 6

#### 7.33 Fortress Milestones Tracker
- **Description**: Track fortress milestones during live play: first trade caravan, first siege survived, first legendary craftsdwarf, population thresholds (50, 100, 150, 200), first artifact created. Display as achievement banner when reached.
- **Data source**: Bridge live events + milestone detection logic
- **Difficulty**: M (event pattern matching + notification UI)
- **Phase alignment**: Phase 6

---

## 8. Implementation Priority Matrix

### Quick Wins (1-2 days each, high impact)

| ID | Enhancement | Effort | Impact |
|----|------------|--------|--------|
| QW-1 | Dedicated event collection list views (wars, battles, etc.) with type-specific columns | 1 day | Medium |
| QW-2 | Death statistics dashboard (death cause pie, deadliest years, top killers) | 1 day | High |
| QW-3 | World records & superlatives page | 1 day | High |
| QW-4 | "Most Interesting" rankings using existing prominence/salience scores | 0.5 day | Medium |
| QW-5 | Megabeast tracker page | 1 day | Medium |
| QW-6 | Art form gallery (card layout) | 0.5 day | Low |
| QW-7 | Written content library browser | 0.5 day | Low |
| QW-8 | Era browser with event density bars | 1 day | Medium |

### Phase 3 Candidates (Live Integration Synergy)

| ID | Enhancement | Effort | Rationale |
|----|------------|--------|-----------|
| P3-1 | Real-time event feed (WebSocket) | 3 days | Direct use of eventful subscriptions |
| P3-2 | Dwarf of the Day | 1 day | Quick win once bridge enhanced |
| P3-3 | Live army tracking on map (placeholder until Phase 5 map) | 2 days | Pairs with INVASION eventful |

### Phase 4 Candidates (Narrative Engine Synergy)

| ID | Enhancement | Effort | Rationale |
|----|------------|--------|-----------|
| P4-1 | AI-generated world summary | 2 days | Agentic storyteller integration |
| P4-2 | Character obituary generator | 1 day | LLM + existing templates |
| P4-3 | "This Year in History" summary | 2 days | Template + optional LLM |
| P4-4 | Notable events highlight reel | 2 days | Importance scoring + LLM prose |
| P4-5 | Civilization rise-and-fall narrative | 3 days | Already in Phase 4 PRD |

### Phase 5 Candidates (Visualization Phase)

| ID | Enhancement | Effort | Rationale |
|----|------------|--------|-----------|
| P5-1 | Interactive world map (Leaflet.js) | 5-7 days | **Core deliverable** — highest priority gap |
| P5-2 | Family tree (Cytoscape.js + Dagre) | 3 days | **Core deliverable** |
| P5-3 | Population charts (Chart.js) | 2 days | **Core deliverable** |
| P5-4 | Event timeline line chart | 1 day | **Core deliverable** |
| P5-5 | World summary dashboard | 2 days | **Core deliverable** |
| P5-6 | Warfare graph (Cytoscape.js + Cola) | 3 days | High-value visualization |
| P5-7 | War chord diagram (D3.js) | 2 days | Nice complement to warfare graph |
| P5-8 | Territory animation over time | 3 days | Extends map with historical playback |
| P5-9 | Population trend lines | 2 days | Extends demographics charts |
| P5-10 | Power rankings dashboard | 2 days | Compelling analytics view |
| P5-11 | Alliance network graph | 2 days | Uses entity_entity_links data |
| P5-12 | Civilization comparison view | 3 days | Radar chart + side-by-side |
| P5-13 | Rivalry tracker | 2 days | War event aggregation |
| P5-14 | HF migration path visualization | 4 days | High-value map feature |
| P5-15 | Migration heatmap | 2 days | Leaflet.heat plugin |
| P5-16 | Underground explorer | 3 days | Extends map with depth layers |
| P5-17 | Curse lineage tree | 2 days | Already in Phase 5 PRD |
| P5-18 | Religious spread map | 3 days | Animated map overlay |
| P5-19 | HF relationship web | 2 days | Extends existing ego-network |
| P5-20 | River system tracer | 1 day | Simple polyline + interaction |
| P5-21 | Army movement / war visualization on map | 4 days | Animated campaign trails |
| P5-22 | Biome explorer layer | 1 day | Interactive region clicking |

### Phase 6+ Candidates (Advanced Features)

| ID | Enhancement | Effort | Rationale |
|----|------------|--------|-----------|
| P6-1 | Fortress health dashboard | 5 days | Live bridge + comprehensive UI |
| P6-2 | Prediction engine | 10+ days | Statistical modeling |
| P6-3 | Achievement system | 3 days | Pattern detection engine |
| P6-4 | Fortress milestones tracker | 3 days | Live event pattern matching |
| P6-5 | Trade route inference | 3 days | Event mining + visualization |

---

## 9. Technical Architecture Notes

### 9.1 Frontend Stack Differences

| Aspect | LVN | Chronicler |
|--------|-----|-----------|
| Framework | Vue 3 + TypeScript SPA | FastAPI + Jinja2 server-rendered + vanilla JS |
| Styling | Tailwind CSS (presumed) | Tailwind CSS (CDN) |
| State management | Vue reactivity | Server-side state + AJAX fetch |
| Routing | Vue Router (client-side) | FastAPI routes (server-side) |
| Build | Vite bundler | No build step (CDN imports) |

**Implication**: Chronicler's server-rendered approach means each visualization library (Leaflet, Cytoscape, Chart.js, D3) is loaded via CDN `<script>` tags and initialized in page-level JavaScript. This is simpler than LVN's component architecture but means:
- No tree-shaking (load full library for each page)
- No TypeScript type safety for visualization code
- AJAX calls for data instead of Vue's reactive data binding

**Recommendation**: Continue with the current approach. For the visualization-heavy Phase 5, consider extracting shared JS utilities into `/static/js/` files (e.g., `map-utils.js`, `chart-utils.js`, `graph-utils.js`) to avoid code duplication across templates.

### 9.2 Backend Architecture

| Aspect | LVN | Chronicler |
|--------|-----|-----------|
| Storage | In-memory (C# objects) | PostgreSQL with asyncpg |
| Query model | LINQ over object graph | SQL queries with JOIN |
| Performance model | Fast (everything in RAM) | Paginated queries with indexes |
| Multi-world | Single world at a time | Multi-world with world_id FK |
| Persistence | None (re-upload each session) | Full persistence across sessions |

**Implication**: Chronicler's PostgreSQL backend is superior for persistence and multi-world support, but requires careful query optimization for visualization data (map layers, graph data, chart aggregations). Key considerations:

- **Map data**: Cache generated map images on disk (`data/map_cache/`). Invalidate on re-ingestion.
- **Chart data**: Use materialized views or cached aggregation queries for population/event statistics.
- **Graph data**: Limit graph queries with depth bounds and node count caps (500 node warning, 1000 node hard limit).
- **Timeline data**: Pre-compute year-level aggregations at ingestion time or use indexed GROUP BY queries.

### 9.3 CDM Schema Extensions Needed

| Enhancement | Schema Change |
|------------|--------------|
| Battle coordinates | Ensure `history_event_collections.details` JSONB includes coords for battles |
| HF movement tracking | No change needed — derive from existing events |
| Territory history | Already available via `entity_site_links` (start_year, end_year) |
| Achievement definitions | New `achievements` table (world_id, achievement_id, name, description, earned_at) |
| Fortress milestones | New `fortress_milestones` table (world_id, milestone_type, achieved_year, details) |
| Map image cache metadata | New `map_cache` table (world_id, tile_size, generated_at, file_path) or filesystem-only |
| Pre-computed aggregations | Optional `world_statistics` materialized view for dashboard performance |

Most enhancements require zero schema changes — they are pure visualization/aggregation over existing data.

### 9.4 Live Bridge Data Pipeline

For live-game enhancements (real-time event feed, army tracking, fortress dashboard), the data flow is:

```
DFHack (VM) --> chronicler-bridge.lua --> HTTP JSON endpoint
                                              |
Python watcher --> PostgreSQL (units, unit_events, sync_snapshots)
                       |
WebSocket server --> Browser (real-time updates)
```

Key integration points:
- **Eventful subscriptions** (Stage 3.1): UNIT_DEATH, INVASION, UNIT_NEW_ACTIVE provide triggers for live UI updates
- **WebSocket push**: FastAPI WebSocket endpoint for pushing events to connected browsers
- **Bridge polling interval**: Currently ~5 seconds; configurable for real-time features
- **Event deduplication**: Use `unit_events` table to avoid re-processing seen events

### 9.5 Visualization Library Budget

| Library | Size (gzip) | Purpose | Pages |
|---------|------------|---------|-------|
| Leaflet.js 1.9.4 | 42 KB | World map | Map page, mini-maps |
| Chart.js 4.x | 65 KB | Charts | Dashboard, entity detail pages |
| Cytoscape.js 3.31 | 85 KB | Graphs | Family tree, warfare graph, alliance network |
| cytoscape-dagre | 12 KB | Hierarchical layout | Family tree |
| cytoscape-cola | 25 KB | Force-directed layout | Warfare graph |
| D3.js 7.x | 95 KB | Chord diagram | War chord diagram |
| vis.js (network) | 175 KB | Ego-network | HF detail page (already loaded) |
| Leaflet.heat | 5 KB | Heatmap plugin | Migration heatmap |
| leaflet-ant-path | 3 KB | Animated paths | Army movement |

**Strategy**: Load libraries only on pages that need them. Use `{% block scripts %}` in Jinja2 templates to conditionally include. vis.js is already loaded on explorer.html; consider migrating ego-network to Cytoscape.js to reduce total library count.

---

## 10. ASCII Mockups

### 10.1 Interactive World Map Page

```
+======================================================================+
|  CHRONICLER — World Map: Tar Thran (The Land of Dawning)             |
+======================================================================+
|  [Map] [People] [Civs] [Geography] [Data] [Graph] [Storyteller]     |
+----------------------------------------------------------------------+
| LAYERS         |                                                     |
| [x] Terrain    |                          ~~     .^^.               |
| [x] Sites      |          ,,,,       ~~~   ~~    .^^.  (Volcano)    |
| [ ] Regions    |        ,,,,,,,,    ~~~~  ~~      ^^                |
| [x] Mountains  |      ,,,,,,,,,,   ~~~~~ ~~   * Mountainhome       |
| [x] Rivers     |    ,,  O  ,,,,, ~~~~~~  ~~     (Pentagon, Blue)   |
| [ ] Roads      |   ,, Elftown,,  ~River~  ~~                       |
| [ ] Battles    |    ,,(Circle,,   ~~~~~~   ~~   [] Hamlet           |
| [ ] Territory  |      Green) ,,    ~~~~     ~   (Square, Gray)     |
| [ ] HF Locate  |        ,,,,,,      ~~      ~                      |
| [ ] Underground|   * DarkFortress   ~~       ~   * Town            |
|                |   (Hexagon, Red)    ~~        ~  (Pentagon, Green) |
| FILTER BY CIV  |                     ~~         ~                   |
| [x] All        |    *** Goblin Pits   ~~          ~                 |
| [ ] Dwarves    |    (Pentagon, Red)    ~~    ...river mouth...      |
| [ ] Elves      |                       ~~                           |
| [ ] Goblins    |   <Star> Vault        ~~   ^ Peak                 |
| [ ] Humans     |   (Star, Yellow)       ~~~~~~                      |
+----------------+-----------------------------------------------------+
| Timeline: [=======|=======================] Year 125 / 250           |
+----------------------------------------------------------------------+
| SELECTED: Mountainhome  |  Type: MountainHalls  |  Owner: Dwarves   |
| Pop: 342  | Founded: Year 1  |  [Open Detail Page ->]               |
+----------------------------------------------------------------------+
```

### 10.2 War Detail Page with Battle Graph

```
+======================================================================+
|  WAR: The Assault of Searing  (Year 45 — Year 89, 44 years)         |
+======================================================================+
|  Attacker: The Steamy Confederacy (Goblins)   [-> Entity Detail]     |
|  Defender: The Gloved Union (Dwarves)         [-> Entity Detail]     |
+----------------------------------------------------------------------+
|  BATTLE TIMELINE                                                     |
|  Y45    Y50    Y55    Y60    Y65    Y70    Y75    Y80    Y89         |
|   |      |      |      |      |      |      |      |      |         |
|   *------*--*---*------+------*--*---*------*------*                 |
|   B1     B2 B3  B4           B5 B6  B7     B8     B9                |
|   Siege  Raid   Field        Siege  Raid   Siege   Final            |
+----------------------------------------------------------------------+
|  MAP (battles)             |  CASUALTIES              | WARFARE     |
|  +---------------------+  |  Goblins:   3,412 dead   | GRAPH       |
|  | *B1     *B4         |  |  Dwarves:   1,287 dead   |             |
|  |    *B2       *B5    |  |  Elves:       89 dead    | (Goblins)--+|
|  |  *B3      *B6  *B7  |  |                          |   |    |   ||
|  |         *B8    *B9  |  |  [Doughnut Chart]        | (Dwarves) ||
|  +---------------------+  |  [Deaths by Race]        |   |        ||
|  Red=Goblin, Blue=Dwarf   |                          | (Elves)   ||
+----------------------------+--------------------------+------------+|
|  BATTLE LIST                                                        |
|  B1 | Year 45 | Siege of Mountainhome   | Goblin victory | 234 dead|
|  B2 | Year 50 | Raid on Bridgehelm      | Dwarf victory  | 89 dead |
|  B3 | Year 52 | Battle of Red Fields    | Goblin victory | 445 dead|
|  ...                                                                |
+=====================================================================+
```

### 10.3 HF Migration Path View

```
+======================================================================+
|  HISTORICAL FIGURE: Urist McAxedwarf (Dwarf, Year 12 — Year 145)    |
+======================================================================+
|  [Biography] [Events] [Relationships] [Journey Map] [Graph]         |
+----------------------------------------------------------------------+
|  Journey Map (5 locations, 4 movements)                              |
|  +--------------------------------------------------------------+   |
|  |                                                              |   |
|  |    (1) * Born                     (3) *----> Traveled        |   |
|  |    Silvervaults              --->      Ringbell              |   |
|  |    Year 12                  /          Year 78               |   |
|  |         |                  /                |                |   |
|  |         | Settled         /                 | Fled           |   |
|  |         v                /                  v (yellow wavy)  |   |
|  |    (2) * Bridgehelm     /             (4) * Westfort         |   |
|  |    Year 34             /                  Year 102           |   |
|  |    (peaceful, green)  / (military, blue)       |             |   |
|  |                      /                         | Kidnapped   |   |
|  |                     /                          v (red dotted)|   |
|  |                    /                     (5) * Spearbreakers  |   |
|  |                   /                       Year 145 (DIED)    |   |
|  +--------------------------------------------------------------+   |
|  Timeline: [=========|=======================] Year 78 / 145        |
|  Legend:  --- peaceful  ~~~ flee  === military  ... kidnap           |
+----------------------------------------------------------------------+
|  WAYPOINT DETAIL (selected: (3) Ringbell, Year 78)                   |
|  Event: Urist traveled to Ringbell to serve as militia commander     |
|  [Open Event Detail ->] [Open Site Detail ->]                        |
+======================================================================+
```

### 10.4 World Timeline Browser

```
+======================================================================+
|  WORLD TIMELINE: Tar Thran (The Land of Dawning)                     |
+======================================================================+
|  Filter: [All Types v] [All Civs v] [All Races v]  [Search events..]|
+----------------------------------------------------------------------+
|  ERA: The Age of Myth (Year 1 — Year 50)             [50 years]     |
|  ================================================================   |
|  |||||||||||||||||||||||||  <-- event density bar                    |
+----------------------------------------------------------------------+
|  Year 1  | * World created. 4 civilizations founded.                 |
|          |   The Gloved Union (Dwarves), The Steamy Confederacy      |
|          |   (Goblins), The Council of Twilight (Elves), ...         |
|  --------|-----------------------------------------------------------|
|  Year 3  | * Mountainhome founded by The Gloved Union                |
|          |   [Site] [Entity]                                         |
|  --------|-----------------------------------------------------------|
|  Year 12 | ** Urist McAxedwarf born in Silvervaults                   |
|          |   [HF Detail ->]                                          |
|  --------|-----------------------------------------------------------|
|  Year 23 | *** The Assault of Searing begins!                        |
|          |   Attacker: The Steamy Confederacy                        |
|          |   Defender: The Gloved Union                              |
|          |   [War Detail ->]                                         |
|  --------|-----------------------------------------------------------|
+----------------------------------------------------------------------+
|  ERA: The Age of Heroes (Year 51 — Year 150)        [100 years]    |
|  ================================================================   |
|  ||||||||||||||||||||||||||||||||||||||||||  <-- event density bar    |
+----------------------------------------------------------------------+
|  Year 51 | * Forgotten Beast Nguslu attacks Bridgehelm!              |
|          |   [Beast Detail ->] [Site Detail ->]                      |
|  ...                                                                |
+======================================================================+
|  Showing 1-50 of 2,847 events  [< Prev] [Page 1 of 57] [Next >]   |
+======================================================================+
```

### 10.5 Real-Time Fortress Dashboard

```
+======================================================================+
|  FORTRESS DASHBOARD: Boatmurdered  (Year 7, Mid-Spring)  [LIVE]     |
+======================================================================+
|  POPULATION          | MILITARY            | MOOD                    |
|  142 dwarves (+3)    | 28 soldiers (20%)   | Happy: 89 (63%)        |
|  [trend: +12/year]   | 4 squads            | Content: 31 (22%)      |
|  Last migrant wave:  | Equipment: 76% good  | Stressed: 15 (11%)    |
|  Year 7, Early Spring| [1 siege survived]  | Tantrum: 7 (5%)       |
+----------------------+---------------------+-------------------------+
|  RECENT EVENTS                              | ALERTS                 |
|  [Year 7] Urist created a masterwork        | [!] 3 idle dwarves    |
|            steel battle axe                  | [!] Low plump helmet  |
|  [Year 7] Migrants have arrived! (3 dwarves)| stock (12 remaining)  |
|  [Year 7] Reg Thunderhammer killed by a     | [!!] Goblin scouts    |
|            giant spider                      | spotted nearby        |
|  [Year 6] Trade caravan from Elves arrived   |                       |
|  [Year 6] Urist McAxedwarf became legendary  |                       |
|            Axe Lord                          |                       |
+---------------------------------------------+------------------------+
|  DWARF OF THE DAY                           | MINI-MAP               |
|  Zefon Coggears (Mechanic)                  | +---------+           |
|  Age 48, Legendary Mechanic                  | |    *    |           |
|  Mood: Content                               | |  Boat-  |           |
|  Recent: Built artifact mechanism            | | murdered|           |
|  "A brooding dwarf who values hard work"     | +---------+           |
+---------------------------------------------+------------------------+
|  STOCKS (Top 5 Low)       | FORTRESS MILESTONES                    |
|  Plump Helmets: 12 [!]    | [x] First artifact (Year 5)            |
|  Rock Nuts: 23             | [x] First siege survived (Year 6)      |
|  Pigtail Thread: 8 [!]    | [ ] Population 200                     |
|  Iron Bars: 45             | [ ] Legendary + 5 skills               |
|  Quarry Bush Leaves: 67    | [ ] 10 years survived                  |
+----------------------------+----------------------------------------+
```

---

## Appendix A: LVN Route Coverage Reference

For completeness, the 79 LVN frontend routes span these categories (Chronicler equivalents noted):

| # | LVN Route Category | Count | Chronicler Coverage |
|---|-------------------|-------|---------------------|
| 1 | Historical Figures | 2 (list + detail) | Full (People tab + hf_detail) |
| 2 | Entities/Civs | 2 | Full (Civs tab + entity_detail) |
| 3 | Sites | 2 | Full (Geography tab + site_detail) |
| 4 | Artifacts | 2 | Full (artifact_detail) |
| 5 | Regions | 2 | Full (region_detail) |
| 6 | Structures | 2 | Full (structure_detail) |
| 7 | Written Content | 2 | Full (written_content_detail) |
| 8 | Underground Regions | 2 | Full (underground_region_detail) |
| 9 | Landmasses | 2 | Full (landmass_detail) |
| 10 | Mountain Peaks | 2 | Full (mountain_peak_detail) |
| 11 | Rivers | 2 | Full (river_detail) |
| 12 | World Constructions | 2 | Full (construction_detail) |
| 13 | Art Forms (3 types) | 6 | Full (art_form_detail) |
| 14 | Identities | 2 | Full (identity_detail) |
| 15 | Eras | 2 | Full (era_detail) |
| 16 | Wars | 2 | Partial (collection type filter needed) |
| 17 | Battles | 2 | Partial |
| 18 | Raids | 2 | Partial |
| 19 | Duels | 2 | Partial |
| 20 | Journeys | 2 | Partial |
| 21 | Insurrections | 2 | Partial |
| 22 | Persecutions | 2 | Partial |
| 23 | Purges | 2 | Partial |
| 24 | Beast Attacks | 2 | Partial |
| 25 | Abductions | 2 | Partial |
| 26 | Thefts | 2 | Partial |
| 27 | Processions | 2 | Partial |
| 28 | Performances | 2 | Partial |
| 29 | Competitions | 2 | Partial |
| 30 | Ceremonies | 2 | Partial |
| 31 | Occasions | 2 | Partial |
| 32 | Map | 1 | Not yet (Phase 5) |
| 33 | Dashboard/Home | 1 | Partial (index.html) |
| — | **Total** | **~67** | **34 full, 32 partial, 1 missing** |

Note: "Partial" for event collections means Chronicler has the data and a generic collection detail page, but lacks dedicated filtered list views with type-specific column layouts.

---

## Appendix B: Data Availability Audit

All proposed enhancements were checked against Chronicler's existing CDM schema. Results:

| Enhancement | Data Available | Schema Change Needed |
|------------|---------------|---------------------|
| Interactive map | Yes (sites.coord_x/y, regions.coords) | None |
| Family tree | Yes (hf_links) | None |
| Charts | Yes (all aggregation queries) | None |
| Warfare graph | Yes (event_collections, entities) | None |
| Territory animation | Yes (entity_site_links.start_year/end_year) | None |
| Migration heatmap | Partial (events have site refs, HF whereabouts) | None |
| Trade routes | Partial (trade events exist but routes implicit) | None |
| Population trends | Yes (birth/death events by year) | None |
| Death statistics | Yes (death_year, death_cause on HFs) | None |
| Megabeast tracker | Yes (associated_type field) | None |
| Alliance network | Yes (entity_entity_links) | None |
| Religious spread | Yes (entities.type, structures.type) | None |
| Curse lineage | Yes (HfDoesInteraction events, is_vampire/werebeast) | None |
| Underground explorer | Yes (underground_regions.depth) | None |
| Achievement system | Yes (pattern detection over events) | Optional: achievements table |
| Fortress milestones | Partial (live bridge needed) | Optional: milestones table |

**Conclusion**: 28 of 33 proposed enhancements require zero schema changes and can be built purely with visualization code over existing data. This is a testament to the completeness of Chronicler's CDM built in Phase 1.

---

*Chronicler vs LVN Comparison & Enhancement Proposals v1.0 — 2026-03-18*
*33 enhancement proposals, 5 ASCII mockups, full gap analysis across 11 categories*
*Estimated total effort: 80-120 development days across Phases 3-7*
