# Consolidation: df-ai & LegendsViewer-Next Research

**Consolidated**: 2026-02-24
**Sources**: df-ai-research.md + legendsviewer-next-research.md

---

## Source Documents

- **df-ai-research.md**: Source-level analysis of the df-ai C++ DFHack plugin that autonomously plays Dwarf Fortress end-to-end, covering its five subsystems, tick-based event loop, exclusive coroutine UI interaction system, room/construction planning, stock threshold model, military management, and all DFHack data access patterns — representing a complete encyclopedia of DF fortress management heuristics encoded in deterministic C++ logic.
- **legendsviewer-next-research.md**: Code-level analysis of LegendsViewer-Next, a .NET 8 backend + Vue 3/TypeScript SPA that parses DF Legends XML exports into an in-memory world graph and displays 70 browseable pages covering all DF data categories — historical figures, sites, entities, artifacts, events (115+ types), maps (Leaflet.js), family trees (Cytoscape.js dagre), warfare graphs (Cytoscape.js cola), and population charts (Chart.js).

---

## Feature Ideas for Chronicler

### 1. Autonomous AI Fortress Player / Advisor

**From df-ai**

#### 1.1 Tick-Based Polling / Monitoring Cadence

**User QoL**: The advisor watches the fortress continuously and proactively alerts the player at the right moment — not too early, not too late.

**Implementation**: Mirror df-ai's polling schedule as Chronicler's advisory cadence:
- Every 25 game ticks (~16,000×/year): population alerts (new arrivals, deaths, stalled jobs, nobles needing assignment, crimes)
- Every 100 ticks: stockpile status check, production queue review, farm/metal status
- Every 240 ticks: construction status, room lifecycle completion check
- Every 1,200 ticks (1 DF day): full fortress health summary
- Every 403,200 ticks (1 DF year): annual review / year-in-summary

**Source**: `event_manager.h`, `ai.cpp`

#### 1.2 Ten-Phase Population Update Cycle

**User QoL**: The player receives timely, organized advice on every population dimension — citizens, jobs, nobles, military, pets, deaths — rather than a monolithic wall of status.

**Implementation**: Adopt df-ai's 10-phase round-robin:
```
Phase 0: Trading management (caravan arrival, broker routing)
Phase 1: Citizenlist update (arrivals, departures, deaths)
Phase 2: Noble assignment
Phase 3: Job unsuspend (un-stall non-repeating suspended jobs)
Phase 4: Military management + crime review
Phase 5: Pet management
Phase 6: Dead unit handling (slabs, etc.)
Phase 7: Caged unit management
Phase 8: Location occupations (tavern keeper, performer, scholar)
Phase 9: Emit population event JSON (to Chronicler's CDM or live stream)
```

Each phase is a discrete advisory query to the LLM, enabling targeted narratives.

**Source**: `population.cpp:94-140`

#### 1.3 Three-Tier Stock Threshold Model

**User QoL**: The player sees color-coded stock alerts: "critical shortage," "running low," or "healthy buffer" for each of ~100 item categories, scaled automatically to fortress population.

**Implementation**: Replicate the `Watch` struct's three-tier model in Chronicler's CDM schema:
```
Needed:         absolute floor — act immediately
NeededPerDwarf: scales with population (per 100 dwarves)
WatchStock:     items to monitor but not necessarily act on
AlsoCount:      items to count for context without alerting
```
Approximately 100 named stock item categories should be included (see `STOCKS_ENUMS` in `stocks.h`). The advisor LLM reads this model and produces natural-language recommendations.

**Source**: `stocks.h:147-159`, `stocks.h:248-336`

#### 1.4 Room Type Taxonomy and Construction State Machine

**User QoL**: The player can ask "what rooms still need to be dug?" or "which dwarves don't have bedrooms yet?" and get precise, accurate answers.

**Implementation**:
- Canonical room types (22, from `room.h:35-57`): corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop
- Canonical room status states: `plan → dig → dug → finished`
- Store these states in the CDM `rooms` table
- Furniture types (28): archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well

**Source**: `room.h:35-57`, `room.h:182-264`

#### 1.5 Priority-Driven Construction Sequencing

**User QoL**: The advisor recommends a sensible build order that prioritizes survival essentials (food, shelter, defense) before quality-of-life improvements.

**Implementation**: Adapt df-ai's JSON-driven priority filter system (`plan_priorities.h`). Each priority rule is a filter over room properties (type, status, user count, etc.) paired with an action. Store as a configurable JSON priority ruleset in Chronicler. Actions: dig_immediate, unignore_furniture, finish, start_ore_search, dig_next_cavern_outpost, past_initial_phase, deconstruct_wagons.

**Source**: `plan_priorities.h`, `plans/generic01.json`

#### 1.6 Blueprint / Floor Plan System

**User QoL**: The player can upload or select a fortress blueprint and receive construction guidance in the correct priority order, matched to their specific layout.

**Implementation**: Parse df-ai's JSON blueprint format (`plans/generic01.json`). Blueprint specifies: room types, min/max counts, tags grouping room types, `count_as` (e.g., one dormitory = 39 bedrooms), limits per type. Translate into Chronicler's CDM room graph with `accesspath` corridor links.

**Source**: `blueprint.h`, `plan_setup.h`, `plans/generic01.json`

#### 1.7 Military Sizing and Drafting Advisor

**User QoL**: The player receives clear, population-scaled recommendations: "Your fortress has 80 citizens — you should have 20–60 soldiers. Currently 12. Consider drafting 8 more."

**Implementation**:
- Default military bounds: 25% (minimum) to 75% (maximum) of citizen count — configurable
- Draft pool eligibility: exclude dwarves with noble positions, mining/woodcutting/hunting labors
- Sorting: lowest XP first for draft candidates, lowest XP first for dismiss candidates
- Squad size scaling: 4/6/8/10 members depending on total military count
- Uniform selection: alternating Heavy Melee / Heavy Ranged every 3 squads
- Full heavy armor loadout: armor, helm, pants, gloves, shoes, shield, appropriate weapon

**Source**: `population_military.cpp:657-902`

#### 1.8 Noble Assignment Advisor

**User QoL**: The system alerts the player when noble positions are unfilled or when a noble lacks the facilities (e.g., office) required for their role, before the dwarf begins issuing mandates.

**Implementation**:
- Noble roles to track: Bookkeeper, Manager, Broker, Mayor, Sheriff, Captain of the Guard, and all other entity positions
- Check noble requirements: office room, required room value, trading capability
- Conflict detection: nobles should not simultaneously hold military positions that conflict with their accounting/management/trading responsibilities
- Noble room value validation: `check_noble_apartments()` checks `required_value` per room

**Source**: `population_nobles.cpp`

#### 1.9 Trade Advisor

**User QoL**: When a caravan arrives, the advisor automatically identifies which items to request, which surplus items to offer, and whether the trade ratio is favorable, presented as a pre-trade checklist.

**Implementation**:
- Caravan detection: monitor `ui->caravans`
- Broker identification: `entity_position_responsibility::TRADE`
- `want_trader_item()` decision function — what to buy based on stock Watch model
- Trade value calculation: `item_or_container_price_for_caravan()`
- Trade balance enforcement: offer value must be ≥ request value × 110%
- Counter-offer handling: iterative adjustment loop

**Source**: `trade_manager.cpp:31-722`

#### 1.10 Farm Management Advisor

**User QoL**: The advisor recommends the correct seasonal crop for each farm plot based on the fortress biome, preventing starvation from planting underground plants on surface farms.

**Implementation**:
- Separate plant category tracking: drink_plants, thread_plants, mill_plants, bag_plants, dye_plants, slurry_plants, grow_plants
- Biome-aware crop selection: underground = underground plants, outdoor = surface plants
- Season rotation logic from `stocks_farm.cpp`
- Kitchen management: mark cookable items correctly to prevent accidental cooking of seed stock

**Source**: `stocks_farm.cpp`, `stocks_update.cpp`

#### 1.11 Metalworking Production Chain Advisor

**User QoL**: The advisor tracks ore availability, computes how many bars can be smelted, and queues the optimal production chain through smelting → bar forging → equipment production.

**Implementation**:
- `update_simple_metal_ores()`: scan world for ore deposits, compute smeltable bars
- `may_forge_bars()`: available-ore → bars math per material
- `queue_need_forge()`: ore → bars → equipment production chain decisions
- Metal preferences based on material flags: ITEMS_WEAPON, ITEMS_ARMOR
- Duplicate order prevention: avoid ordering within 5 units of existing orders
- Manager order stall detection: if order stuck in `validated` state across two monthly checks, trim quantity by 3

**Source**: `stocks_forge.cpp`, `stocks_manager.cpp`, `stocks_update.cpp:46-73`

#### 1.12 Pet Management Advisor

**User QoL**: The player is informed which animals can be milked, sheared, trained, or used for egg production, and receives pasture assignment recommendations based on grass availability.

**Implementation**:
- Detect pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing
- Pasture assignment via `assign_unit_to_zone()` for grazing zones
- Track grass availability per pasture zone

**Source**: `population_pets.cpp`

#### 1.13 Occupation / Location Assignment Advisor

**User QoL**: The advisor recommends which resident non-citizens should be assigned to tavern keeper, performer, and scholar roles at the fortress's cultural locations.

**Implementation**:
- Track `locations` (tavern, library, temple) and their required occupation types
- Assign residents (non-citizen travelers) to fill roles via `assign_occupation()`
- Respect location capacity constraints

**Source**: `population_occupations.cpp`

#### 1.14 Justice and Crime Monitoring

**User QoL**: The player is alerted to crimes and ongoing justice proceedings, with a summary of suspects, verdicts, and punishments to avoid missing justice events that trigger tantrum spirals.

**Implementation**:
- Scan world crimes: `world->crimes`
- Track crime detection, punishment assignment, execution/imprisonment status
- Alert on unresolved crimes above a threshold

**Source**: `population_justice.cpp`

#### 1.15 Fortress Loss Detection

**User QoL**: The system recognizes when a fortress is at the brink of collapse or has been lost, and offers a post-mortem summary with the cause of death.

**Implementation**:
- Monitor viewscreen text content for fortress-loss messages: "Your strength has been broken," etc.
- On detection: preserve full state snapshot, generate post-mortem narrative
- Optionally support multi-embark session tracking (df-ai's `random_embark` pattern)

**Source**: `event_manager.cpp:569-608`

#### 1.16 Job Stall Detection and Auto-Unsuspend

**User QoL**: The player is alerted when production has stalled because non-repeating jobs are suspended, with a one-click fix recommendation.

**Implementation**:
- Every advisory cycle: scan all non-repeating suspended jobs
- Report which jobs are stalled and why (missing materials, hauling conflicts)
- Recommend or automatically trigger `unsuspend` via DFHack Lua

**Source**: `population.cpp` — `update_jobs()`

#### 1.17 Baby Reunification Bug Workaround (DF Bug 5551)

**User QoL**: The advisor detects the DF bug where infants are separated from their mothers and proactively creates the reunification job.

**Implementation**:
- Detect baby/mother separation: baby alive, mother sane and alive and idle
- Queue `SeekInfant` job via DFHack if separated

**Source**: `population.cpp` — DF Bug 5551 workaround

#### 1.18 Ore Vein Discovery and Mining Advisor

**User QoL**: The advisor reports newly discovered ore veins and recommends whether to route a mineshaft to them based on current metal stock levels.

**Implementation**:
- `list_map_veins()`: scan map blocks for `block_square_event_mineralst` events
- `dig_vein()`: route shaft to vein
- Track `dug_veins` to avoid redundant reporting

**Source**: `plan.cpp` — `list_map_veins()`, `dig_vein()`

#### 1.19 Cistern and Water Supply Advisor

**User QoL**: The player receives guidance on building a safe water supply — cistern layout, floodgate sequencing, lever connections — with status on current fill level.

**Implementation**:
- Cistern construction workflow: channel water source → reservoir → well
- Lever and floodgate connection tracking
- `monitor_cistern()`: check water fill levels
- Alert on empty cistern / overflowing cistern

**Source**: `plan_cistern.cpp`

#### 1.20 LLM Action Chain / Exclusive Callback Analogy

**User QoL**: When the advisor executes multi-step actions (e.g., "place a manager order" or "draft three soldiers"), each step is reported to the player with confirmation before the next step begins.

**Implementation**: Implement an "exclusive action executor" analogous to df-ai's `ExclusiveCallback` system:
- Maintain one active action chain at a time
- Queue pending actions in FIFO order
- Report completion/failure of each step before starting next
- Translate df-ai's ExclusiveCallback coroutines into async Python coroutines calling DFHack Lua via `dfhack-run` over SSH

**Source**: `exclusive_callback.h`, `event_manager.h:38-112`

---

### 2. World History & Demographics Visualizer

**From LegendsViewer-Next**

#### 2.1 Interactive World Map

**User QoL**: Players can visually explore the entire world on an interactive map, with civilization-colored site markers toggled by faction — understanding at a glance which civilizations control which territory.

**Implementation**:
- Library: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection)
- Map image generation: SkiaSharp PNG from world region data; three cached sizes (thumb/default/large); use DF-exported `.bmp` map file if present, otherwise generate from `RegionTypeColors.BaseRegionColors`
- Coordinate system: Y-axis inverted, scaled by tile size: `[(height - y) * scale, x * scale]`
- Site marker shapes by type:
  - Circle: Unknown, Cave, Lair, Camp
  - Triangle: Monastery, Fort, Tomb
  - Square: Hillocks, Hamlet
  - Pentagon: Fortress, ForestRetreat, Town, DarkPits
  - Hexagon (large): MountainHalls, Castle, DarkFortress
  - Star: Vault, Labyrinth, Shrine, Tower, ImportantLocation
  - Pentagon (blue): MysteriousDungeon
  - Hexagon (blue): MysteriousPalace
- Marker colors: owning civilization's generated color (`Entity.LineColor`)
- Layer control: sites grouped by owner into Leaflet `LayerGroup`; "All"/"None" toggle buttons
- Popup content: site name, type, owner name
- Zoom: `minZoom: -2`, `maxZoom: 2`
- Per-object mini-maps: focused region-highlighted map on each entity detail page

**Source**: `Map.vue`, `WorldMapImageGenerator.cs`

#### 2.2 Civilization Color System

**User QoL**: Each civilization is assigned a visually distinct color used consistently across the map, warfare graph, and civilization list — making cross-reference intuitive.

**Implementation**: HSV rotation algorithm from `World.GenerateCivColors()`:
- Medium saturation for first 6 races
- Lighter variants for races 7-12
- Darker variants for races 13-18
- Applied to `Entity.LineColor` property
- Used on map markers, warfare graph nodes, civilization list items

**Source**: `World.cs:215-275`

#### 2.3 Population Charts

**User QoL**: The player sees visual breakdowns of their world's population distribution by race and geographic region, useful for understanding demographic balance.

**Implementation**:
- Doughnut chart (Chart.js): Population by Race — distribution across races
- Doughnut chart: Area by Overworld Regions — land area distribution
- Line chart: Events per year for world timeline
- Bar chart: Event type breakdown by count
- Library: `vue-chartjs` 5.3.2 (Chart.js 4.4.8 wrapper)
- Data endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`

**Source**: `DoughnutChart.vue`, `LineChart.vue`, `BarChart.vue`

#### 2.4 World Summary Dashboard

**User QoL**: A single "world at a glance" page shows population, civilizations, key events, and player-associated entities without requiring navigation into individual detail pages.

**Implementation**:
- World map thumbnail linking to full interactive map
- Population by Race doughnut chart
- Area by Overworld Regions doughnut chart
- Active Civilizations card list (with civilization color indicators)
- Lost Civilizations card list
- Events section: line chart + paginated event table
- Chronicles section: paginated event collection table
- Heroic Ties card: player-related objects (`PlayerRelatedObjects`) — adventurer HFs, their factions, sites

**Source**: `World.vue`

#### 2.5 Historical Figure Detail Pages

**User QoL**: Each named creature in the world has a comprehensive biography page covering their entire life: birth, skills, relationships, battles, crimes, artifacts owned, positions held, and death.

**Implementation** (all fields from `HistoricalFigure.cs`):
- Profile overview: name, race, caste, birth/death years, age, living status (alive/dead/ghost/undead/zombie/skeleton)
- Deity status, deity spheres (water, death, etc.)
- Current geographic state (`HfState`)
- Active interactions (VAMPIRE, WEREBEAST, SECRET_* curses)
- Life goal
- Family Tree card (Cytoscape.js, see §2.6)
- Skills card: scrollable list with rank icons and point counts
- Related Factions and Groups (entity memberships + positions)
- Related Sites (home, lair, seat of power)
- Close Relationships: HistoricalFigureLinkType — Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge
- Vague Relationships
- Worshipped Deities
- Noble Positions held (full history)
- Notable Kills (other named HFs killed)
- Artifacts currently held
- Dedicated Structures (temples dedicated to this HF)
- Battles participated in (as attacker / defender / non-combatant)
- Beast Attacks (if a beast)
- Snatcher-of list (abduction victims)
- Intrigue actors and plots
- Breed ID for unique creature tracking
- Lineage curse parent (vampire sire lineage, etc.)

**Source**: `HistoricalFigure.cs`, `HistoricalFigure.vue`

#### 2.6 Family Tree Visualization

**User QoL**: Players can visually explore the dynastic lineages of key figures — useful for understanding inheritance disputes, curse propagation, and nobility succession.

**Implementation**:
- Library: Cytoscape.js 3.31.0 + `cytoscape-dagre` (hierarchical top-to-bottom layout)
- Nodes: one per HF, current HF gets dashed orange border (`current` class)
- Edges: directed parent → child (mother.id → current, father.id → current, current → child)
- Depth limit: max 3 ancestors on each maternal and paternal line (separate counters); children unlimited
- Node visual classes:
  - `dead`: 30% opacity
  - `male`: Blue background
  - `female`: Magenta background
  - `leader`: Round-octagon shape + crown icon
  - `necromancer`: Round-hexagon + skull icon
  - `vampire`: Hexagon + vampire icon
  - `werebeast`: Hexagon + wolf icon
  - `ghost`: Hexagon + ghost icon
- Node label format: race prefix, title/assignment, separator lines, highest skill rank, HF name, age (with ✝ if dead)
- Interaction: click node → navigate to that HF's detail page
- Two sizes: compact 360px height and fullscreen 720px (toggle via ExpandableCard)
- Relationship types in tree: Mother, Father, Child only (Spouse/Lover/Companion appear in separate Related list)

**Source**: `FamilyTree.vue`, `HistoricalFigureExtensions.cs:12-200`

#### 2.7 Warfare Graph

**User QoL**: Players can see which civilizations have fought wars with each other, how many battles occurred, and which side attacked or defended — a strategic-level view of world history conflicts.

**Implementation**:
- Library: Cytoscape.js with `cytoscape-cola` layout (force-directed physics)
- Nodes: Civilizations (round-hexagon), Battles/Wars (roundrectangle)
- Edges: attack/defense relationships with labels and widths proportional to battle size
- Edge tooltips: `tippy.js` 6.3.7 on hover
- Clickable: tap node/edge → navigate to entity or battle detail page
- Appears on War detail pages and Entity detail pages

**Source**: `WarfareGraph.vue`

#### 2.8 Event Timeline and Type Distribution Charts

**User QoL**: For any entity (HF, site, civilization, artifact), the player can see how "eventful" its history was over time and what types of events dominated — revealing whether a site was mostly peaceful or war-torn.

**Implementation**:
- Per-entity line chart: events per year for the object's complete event history
- Per-entity bar chart: count of each distinct event type for that object
- Served from REST endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`
- Displayed in expandable card sections on every object detail page

**Source**: `BarChart.vue`, `LineChart.vue`

#### 2.9 Complete 70-Route World Browser

**User QoL**: Players can browse every category of world data — geography, societies, art forms, warfare, rituals, calamities — from a consistent, navigable interface with list and detail views for all 35 entity types.

**Implementation**: Implement 35 list + 35 detail view pairs covering:
- Society: entities (civilizations, religions, guilds, performance troupes, mercenary companies, militias, nomadic groups, outcasts), historical figures
- Geography: surface regions, underground regions, landmasses, rivers, mountain peaks
- Infrastructure: sites (all 22 types), structures within sites, world constructions (roads, tunnels, bridges)
- Art and Craft: artifacts, dance forms, musical forms, poetic forms, written contents
- Warfare: wars, battles, duels, raids, site conquerings
- Conflicts: insurrections, persecutions, purges, coups
- Calamities: beast attacks, abductions, thefts
- Rituals: processions, performances, journeys, competitions, ceremonies, occasions
- Historical eras

**Source**: `router/index.ts` — all 70 routes

#### 2.10 Site Detail Pages with Full History

**User QoL**: Each site (fortress, hamlet, vault, etc.) has a complete history page showing all owners over time, all battles fought there, all crimes, and all structures within it.

**Implementation** (from `Site.cs`):
- SiteType (22 types): Fortress, Hillocks, MountainHalls, ForestRetreat, Hamlet, Town, Castle, DarkPits, DarkFortress, Monastery, Fort, Tomb, MysteriousLair, MysteriousDungeon, MysteriousPalace, Cave, Lair, Vault, Labyrinth, Shrine, Tower, Camp, ImportantLocation
- Untranslated name (Dwarvish/Elvish original)
- World grid coordinates + bounding rectangle
- Region association
- Structures within site (temples, libraries, keeps)
- Owner history: list of `OwnerPeriod` records (who owned from when to when)
- Site properties: individual parcels within the site
- Related HFs linked to the site
- Event collection access: Battles, Conquerings, Raids, Duels, Purges, Persecutions, Insurrections, Coups, Abductions, BeastAttacks

**Source**: `Site.cs`

#### 2.11 Entity (Civilization) Detail Pages

**User QoL**: Each civilization, religion, guild, or other faction has a comprehensive detail page showing its race, sites controlled, noble hierarchy, population, military history, and diplomatic relationships.

**Implementation** (from `Entity.cs`):
- EntityType (11 types): Civilization, NomadicGroup, SemiMegaBeast, MegaBeast, PerformanceTroupe, MercenaryCompany, Militia, Religion, Guild, Outcast, Unknown
- IsCiv flag, race, site history
- EntityPositions and EntityPositionAssignments (noble titles + holders)
- EntityPopulation data
- Parent/child entity hierarchy
- EntityOccasions (ceremonial events)
- Civilization color (`LineColor`)
- EntityEntityLinks (parent/child faction links)
- Warfare graph embedded on entity page

**Source**: `Entity.cs`, `World.cs`

#### 2.12 Cross-Linked Hypertext Event Narratives

**User QoL**: Every historical event reads as a sentence like "the dwarf Urist McSomeone died in the siege of Boatmurdered, slain by a goblin" — and every name in that sentence is a clickable link navigating to the relevant entity's detail page.

**Implementation**:
- Backend generates HTML anchor strings via `WorldObject.ToLink()` methods on all entity types
- Pattern: `HtmlStyleUtil.GetAnchorString(icon, entityType, id, title, displayName)` → `<a href="/{entityType}/{id}" title="{tooltip}">{icon}{displayName}</a>`
- `HistoricalFigure.ToLink()`: includes race prefix, gender/deity icon, tooltip showing title/age/birth/death/event count
- Each event has a `Print()` method generating a rendered HTML sentence
- Frontend injects via `<span v-html="...">` — server-side generation avoids client-side cross-linking complexity
- Applied across all event types, entity references in tables, and list items

**Source**: `HistoricalFigure.cs:828-850`, `HtmlStyleUtil.cs`

#### 2.13 Complete 115+ Event Type Coverage

**User QoL**: No event in the world's history is dropped, misformatted, or shown as "unknown event" — players see a complete, accurate narrative of everything that happened.

**Implementation**: Parse and render all 115 WorldEvent types and 19 EventCollection types. Key categories:
- HF Links (add/remove HF-entity, HF-HF, HF-site links; honors)
- HF State (job/state/body-state changes, death, wounding, revival, summit)
- HF Actions (abductions, pet acquisition, reunions, battles, travel, rampages, preaching, praying, artifact viewing)
- HF Intrigue (confrontations, assumed identities, secret learning, experiments, intrigue relationships, convictions, interrogations)
- HF Fate (freed, enslaved, ransomed, recruited)
- Site Events (created, destroyed, attacked, plundered, reclaimed, abandoned, retired)
- Entity Events (created, dissolved, laws, relocation, rampages, expulsions, persecution, alliances, overthrows, incorporations, breaches)
- Artifact events (created, destroyed, stored, possessed, lost, given, claimed, copied, recovered, found, transformed)
- Masterpiece events (arch design, arch construction, engraving, food, items, improvements, dye)
- Diplomatic events (peace accepted/rejected, agreements made/rejected/formed/concluded/voided, diplomat lost, first contact)
- Construction events (created structure/world-construction, replaced/razed structure, site leader changes, building profile)
- Cultural/civic events (art form creation, knowledge discovery, holy city declarations, entity position creation)
- Tactical events (field battle, tactical situation, squad vs squad)
- Special events (sneak/spotted, theft, devoured, body abuse, merchant/gamble/trade, procession, ceremony, performance, sabotage, insurrection)
- EventCollections: battle, war, duel, raid, site conquered, insurrection, persecution, purge, coup, beast attack, abduction, theft, occasion, procession, ceremony, performance, competition, journey

**Source**: `XMLParser.cs:408-888`

#### 2.14 Multi-World Bookmark System

**User QoL**: Players can load and switch between multiple DF worlds, with saved bookmarks showing each world's thumbnail map, dimensions, and last-accessed timestamp.

**Implementation**:
- File-based bookmark store (world metadata + thumbnail)
- World overview page with bookmark cards: world map thumbnail, name, dimensions, timestamp selector
- "Explore a new world" card with file browser dialog
- Bookmarks persist across sessions
- Parsed worlds saved as bookmarks with SkiaSharp-generated thumbnail

**Source**: `WorldOverview.vue`

#### 2.15 Written Content, Art Forms, and Cultural Output Browser

**User QoL**: Players can read the texts their dwarves have written, understand the dance/music/poetry traditions of their civilization, and see which artifacts are legendary works of art.

**Implementation**: Detail pages for:
- Written Contents (books, scrolls): title, content type, author HF, topics covered
- Poetic Forms: name, craft style, sub-type
- Musical Forms: name, style
- Dance Forms: name, style
- Link from HF pages to their authored works and vice versa

**Source**: `router/index.ts`, `World.cs`

#### 2.16 Paginated Server-Side Search API

**User QoL**: Players can search any entity type by name with instant filtering and page through large result sets without performance degradation even on large world files.

**Implementation**:
- Server-side search: text field bound to search string, triggers `loadWorldObjects()` on each keystroke change
- Backend: `Contains` case-insensitive name filter in repository
- Server-side pagination via `v-data-table-server`: 10/25/50/100 items per page options
- Column-level sorting via `sortKey` + `sortOrder` query parameters
- Standard paginated GET endpoint: `/api/{Type}?search={text}&page={n}&size={m}&sortKey={col}&sortOrder={asc|desc}`
- Total count badge displayed (cyan chip)
- DF Wiki search button per entity type

**Source**: `WorldObjectsPage.vue`, `WorldObjectGenericController.cs`

#### 2.17 Heroic Ties / Player Character Tracking

**User QoL**: A dedicated section surfaces all content associated with the player's adventurer or fortress — their faction, home site, battles, allies — as a personalized entry point into world history.

**Implementation**:
- `PlayerRelatedObjects` property on World — set of objects tagged as player-related
- `Adventurer` flag on `HistoricalFigure`
- On World Summary page: "Heroic Ties" card listing player-related HFs, entities, sites
- Cross-links to all associated detail pages

**Source**: `World.vue`, `HistoricalFigure.cs`

#### 2.18 Historical Eras Browser

**User QoL**: Players can navigate the world's history divided into named eras, seeing what major civilizations and events defined each period.

**Implementation**:
- Era list + detail views
- Era end years computed from following era's start year (post-section processing)
- Events assigned to eras after `historical_eras` section parsed
- Display: era name, start/end year, major civilizations active, notable events

**Source**: `XMLParser.cs` — `ProcessXmlSection()`, `World.cs`

---

### 3. Data ETL and Common Data Model

#### 3.1 Streaming XML Parser with Non-Printable Character Filtering

**User QoL**: The import process handles malformed DF XML files without crashing or silently dropping data.

**Implementation**:
- Streaming `XmlReader` with `Async = true` — never loads entire file into DOM
- `FilteredStream` wrapper: replaces all bytes < 32 with spaces before the XML reader sees them (handles DF's raw control characters in XML output)
- Async parse loop — non-blocking for large files
- Duration tracking with `Stopwatch` and logging

**Source**: `XMLParser.cs`, `FilteredStream.cs`

#### 3.2 Dual-File Merge: legends.xml + legends_plus.xml

**User QoL**: Users who have DFHack installed get dramatically richer data (extended HF fields, relationship details, event relationships) automatically merged with the base export.

**Implementation**:
- `XmlPlusParser.AddNewPropertiesAsync()` merges by matching `id` fields
- Plus parser runs ahead in a single sequential pass, not a second full pass
- Entity-type-specific merge rules for: Entities, Artifacts, WrittenContent, Events
- `HistoricalEventRelationShip` (plus-only event type) stored separately in `World.SpecialEventsById`
- Properties added to existing objects without duplicating base data

**Source**: `XMLPlusParser.cs`, `XMLParser.cs`

#### 3.3 Multi-Source Cross-Reference Post-Processing

**User QoL**: All relationships in the data are correctly resolved — clicking "Urist's mother" navigates to the actual mother HF rather than showing a broken reference.

**Implementation**: After each XML section, run cross-reference resolution. Full post-processing pass after all parsing:
- `ProcessHFtoEntityLinks`
- `ResolveEntityToEntityPopulation`
- `ResolveHfToEntityPopulation`
- `ResolveStructureProperties`
- `ResolveSitePropertyOwners`
- `ResolveHonorEntities`
- `ResolveMountainPeakToRegionLinks`
- `ResolveRegionProperties`
- `ResolveArtifactProperties`
- `ResolveArtformEventsProperties`
- `ResolveEntityIsMainCiv`
- `GenerateCivColors`
- Beast HF heuristic resolution from sub-events (for beast attacks)
- Era end year computation
- Sub-collection linking to parent collections

**Source**: `World.cs:117`

#### 3.4 Sites-and-Populations File Parsing

**User QoL**: Population data (civilized, outdoor, underground) is complete and accurate, supporting demographic visualization.

**Implementation**: `SitesAndPopsParser` produces:
- `SitePopulations`
- `CivilizedPopulations`
- `OutdoorPopulations`
- `UndergroundPopulations`
Integrated into the main `World.ParseAsync()` pipeline.

**Source**: `World.cs` — `SitesAndPopsParser` reference

#### 3.5 History Text File Parsing

**User QoL**: Narrative detail from the DF `.txt` history file supplements the XML data with richer prose descriptions of events.

**Implementation**:
- `HistoryParser` component reads the `.txt` history file
- Adds narrative detail to the world model
- Runs as third input in `World.ParseAsync()` pipeline alongside XML

**Source**: `World.cs` — `HistoryParser` reference

#### 3.6 O(1) Entity Lookup Optimization

**User QoL**: Large worlds with tens of thousands of entities load and navigate instantly.

**Implementation**:
- Sites: `Sites[id - 1].Id == id` fast path (sites are 1-indexed, generally contiguous)
- World grid: `Dictionary<Location, WorldRegion>` for O(1) coordinate-to-region lookup
- Events: `BinarySearch` insertion requiring `IComparable<WorldEvent>` implementation
- Pinia frontend stores cache loaded objects within session

**Source**: `World.cs`, `WorldObjectGenericController.cs`

---

### 4. DFHack Live Data Access and RPC Layer

#### 4.1 Lua Equivalent of df-ai C++ Scans

**User QoL**: Chronicler can read live fortress state on demand for real-time advisor recommendations.

**Implementation**: Implement DFHack Lua scripts callable via `dfhack-run` over SSH:
```lua
-- Citizenlist scan (equivalent to df-ai's update_citizenlist)
local citizens = {}
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u) then
        table.insert(citizens, {
            id = u.id,
            name = dfhack.TranslateName(u.name),
            job = u.job.current_job and df.job_type[u.job.current_job.job_type] or nil,
            squad_id = u.military.squad_id,
            mood = df.mood_type[u.mood]
        })
    end
end
```
Equivalent scans needed for: stockpile counts, active military, pending construction, manager orders, active jobs, caravan state, noble positions.

**Source**: df-ai `population.cpp`, `stocks_detect.cpp`, `plan.cpp`

#### 4.2 DFHack Global State Access Patterns

**User QoL**: All live data queries are reliable and complete.

**Implementation**: Key Lua globals available via DFHack:
- `df.global.cur_year`, `df.global.cur_year_tick`, `df.global.pause_state`
- `df.global.ui` — fortress UI state, noble positions, squad list, caravans
- `df.global.world` — units, items, buildings, jobs, history, crimes, manager_orders

Key DFHack Lua modules:
- `dfhack.units.isCitizen()`, `isDead()`, `isSane()`, `getNoblePositions()`, `getPosition()`
- `dfhack.buildings.constructBuilding()`, building state queries
- `Maps.getTileType()`, `Maps.getTileWalkable()`, map block iteration
- `dfhack.job.linkIntoWorld()`, `getWorker()`
- `Materials.MaterialInfo`, material property lookup

**Source**: df-ai `population.cpp`, `plan_construct.cpp`, `stocks_detect.cpp`

#### 4.3 Key DF Structs for Live Data

**Implementation**: Critical `df::` structs and their Lua equivalents to expose:
- `df.world` → units, items, buildings, jobs, manager_orders, history, crimes
- `df.ui` → follow_unit, caravans, squads, site_id, group_id, fortress_entity
- `df.unit` → status, labors, military, inventory, body, health, occupations, relationships, mood
- `df.item` → type, material, quality, stack size
- `df.building` → type, build stage, position
- `df.squad` → positions, orders, schedule, cur_alert_idx
- `df.historical_figure` → unit_id, site links
- `df.manager_order` → job_type, amount_left, material

**Source**: df-ai all `.cpp` files

#### 4.4 Viewscreen State Detection

**User QoL**: The live advisor knows what screen the player is currently on and can provide context-appropriate suggestions.

**Implementation**:
- `strict_virtual_cast<df::viewscreen_dwarfmodest>(Gui::getCurViewscreen(true))`
- `Gui::getFocusString(screen)`
- State events: `SC_WORLD_UNLOADED`, `SC_PAUSED`, `SC_UNPAUSED`, `SC_VIEWSCREEN_CHANGED`
- Lua equivalent: `dfhack.gui.getCurViewscreen()`, `dfhack.gui.getFocusString()`

**Source**: `event_manager.cpp:569-608`

---

### 5. Database Explorer Tools

#### 5.1 Full DF XML Data Schema Coverage

**User QoL**: Every piece of data exported by DF is queryable and browseable, with nothing silently discarded.

**Implementation**: CDM schema must cover all LegendsViewer-Next entity types:
- Regions (surface + underground), Landmasses, MountainPeaks, Rivers
- Sites (all 22 types), Structures, SiteProperties, OwnerPeriod
- HistoricalFigures (all fields — see §2.5 above), EntityPopulations
- Entities (all 11 types), EntityPositions, EntityPositionAssignments, EntityOccasions
- Eras, Artifacts, WorldConstructions
- PoeticForms, MusicalForms, DanceForms, WrittenContents
- Identities, Relationships (HF-HF, HF-entity, HF-site)
- EventCollections (19 types), WorldEvents (115+ types)

**Source**: `World.cs:20-85`, all WorldObjects files

#### 5.2 Creature/Entity Identity and False Identity Tracking

**User QoL**: Players can track which historical figures are secretly using false identities (a common vampire behavior), exposing hidden connections in world history.

**Implementation**:
- `Identity` entity type: false identities assumed by HFs
- `assume identity` event type
- `impersonate hf` event type
- `ActiveInteractions` on HF: VAMPIRE, WEREBEAST, SECRET_* flags
- `LineageCurseParent` on HF: vampire sire chain
- `BreedId`: unique breed tracking for creatures

**Source**: `HistoricalFigure.cs`, `XMLParser.cs`

---

### 6. UI/UX Framework Patterns

#### 6.1 Material Design SPA with Persistent Navigation

**User QoL**: The app feels polished and familiar, with consistent navigation regardless of which world object is being viewed.

**Implementation**:
- Framework: Vuetify 3 (Material Design components for Vue 3)
- `v-app-bar`: top bar with logo, title, version badge, external links
- `v-navigation-drawer`: left sidebar, always visible, collapsible `v-list-group` groups
- `v-main` + `v-container`: routed content area
- `<RouterView />` in main content — Vue Router lazy-loads each view component: `() => import('../views/X.vue')`
- 8 navigation groups: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals

**Source**: `App.vue`, `router/index.ts`

#### 6.2 Generic List Page Component

**User QoL**: Every entity type list works the same way — search, sort, paginate — so the player doesn't have to learn different UX patterns for different data types.

**Implementation** (`WorldObjectsPage.vue` pattern):
- Header with large icon, title, subtitle, optional DF Wiki button
- Instant-filter search text field
- `v-data-table-server` with server-side pagination and sorting
- Total count badge (cyan chip)
- Per entity type: define columns (Id, Name html, Type, Subtype, Chronicles count, Events count)

**Source**: `WorldObjectsPage.vue`

#### 6.3 Generic Detail Page Component

**User QoL**: Every entity detail page has consistent navigation controls and layout, with type-specific content injected through named slots.

**Implementation** (`WorldObjectPage.vue` pattern):
- Prev/Next navigation FABs (floating action buttons)
- Large icon + name header
- Optional mini-map card
- Type-specific cards via named slots: `type-specific-before-table`, `type-specific-after-table`
- ExpandableCard "Events" section: line chart + paginated event table; expanded view adds bar chart
- "Chronicles" section: paginated event collections table
- Breadcrumb / adjacent ID navigation

**Source**: `WorldObjectPage.vue`

#### 6.4 ExpandableCard Pattern

**User QoL**: Complex sections like family trees and event charts are collapsed by default to avoid overwhelming the page, but expand to full size on demand.

**Implementation**:
- `ExpandableCard` component: compact-content (default visible) + expanded-content (on expand toggle)
- Used for: Events, Family Tree, Charts
- Two sizes for Family Tree: 360px compact, 720px fullscreen

**Source**: `FamilyTree.vue`, `HistoricalFigure.vue`

---

## Reference Implementations

### df-ai Reference Implementations

**Tick-based reactive loop** (`event_manager.h:38-112`):
```cpp
// Sorted priority queue of callbacks by next-fire-time
onupdate_register(descr, ticklimit, initialtickdelay, callback);
onupdate_register_once(descr, ticklimit, callback);
```

**Stock Watch struct** (`stocks.h:147-159`):
```cpp
struct Watch {
    map<stock_item::item, int32_t> Needed;
    map<stock_item::item, int32_t> NeededPerDwarf;
    map<stock_item::item, int32_t> WatchStock;
    set<stock_item::item> AlsoCount;
};
map<stock_item::item, int32_t> count_free;
map<stock_item::item, int32_t> count_total;
map<stock_item::item, map<int16_t, pair<int32_t,int32_t>>> count_subtype;
```

**Population 10-phase update** (`population.cpp:94-140`): Rotate through 10 distinct update phases on every 25-tick cycle.

**Citizenlist scan Lua equivalent** (`population.cpp:155-270`):
```lua
local citizens = {}
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u) then
        table.insert(citizens, { id=u.id, name=dfhack.TranslateName(u.name),
            job=u.job.current_job and df.job_type[u.job.current_job.job_type] or nil,
            squad_id=u.military.squad_id, mood=df.mood_type[u.mood] })
    end
end
```

**Room type enum** (`room.h:35-57`): 22 canonical types — corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop.

**Task type enum** (`room.h:150-173`): check_construct, check_furnish, check_idle, check_rooms, construct_activityzone, construct_farmplot, construct_furnace, construct_stockpile, construct_tradedepot, construct_windmill, construct_workshop, dig_cistern, dig_garbage, dig_room, dig_room_immediate, furnish, monitor_cistern, monitor_farm_irrigation, monitor_room_value, rescue_caged, setup_farmplot, want_dig.

**Furniture types**: archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well.

**Construction task lifecycle** (`plan_task.cpp`):
```
want_dig(room) → tasks queue → dig_room → monitors until floor/open
  → status=dug → construct_room() → construct_* tasks
    → once built → furnish_room() → try_furnish() per item
```

**Military draft/dismiss** (`population_military.cpp:657-902`):
```
target_military_size = citizen_count × [25%, 75%]
excess soldiers → partial_sort by XP (lowest first) → Dismiss
deficit soldiers → draft pool (exclude nobles, miners, woodcutters, hunters)
               → partial_sort by XP (lowest first) → Draft
```

**Metalworking chain** (`stocks_forge.cpp`):
1. Scan for ore deposits → compute smeltable bars
2. `may_forge_bars()`: ore → bar counts per material
3. `queue_need_forge()`: ore → bars → item chain
4. Avoid duplicate orders within 5 units
5. Stall detection: trim 3/month if stuck in `validated`

**Trade cycle** (`trade_manager.cpp:31-722`): Detect caravan → identify broker → request at depot → wait for items → open trade screen → scan trader items → `want_trader_item()` decision → balance offer ≥ request × 110% → handle counter-offers → dismiss broker.

**CHEAT fallback for manager orders** (`stocks_manager.cpp`): If search filter returns no matching orders, force-overwrite first order in list and log `[CHEAT]`.

### LegendsViewer-Next Reference Implementations

**FilteredStream** (`FilteredStream.cs`): Stream wrapper replacing all bytes < 32 with spaces — critical for DF XML which contains raw control characters.

**Dual-file merge** (`XMLPlusParser.cs`): Before committing each item from main XML, call `plus_parser.AddNewPropertiesAsync()` to merge richer properties by matching `id` field in a single sequential pass.

**Section dispatch** (`XMLParser.cs:70-130`): Map top-level XML element names to Section enum: artifacts, entities, entity_populations, historical_eras, historical_event_collections, historical_events, historical_figures, regions, sites, underground_regions, world_constructions, poetic_forms, musical_forms, dance_forms, written_contents, landmasses, mountain_peaks, creature_raw, identities, rivers, historical_event_relationships, historical_event_relationship_supplements.

**Post-section cross-reference resolution** (`World.ParseAsync()`): After each section, run targeted resolution (HF-to-HF links, entity links, era end years, beast HF heuristics). Full post-processing pass after all sections complete.

**Family tree Cytoscape data** (`HistoricalFigureExtensions.cs:12-200`):
- Max 3 ancestors deep per maternal and paternal line (separate depth counters)
- Node classes: current, dead, male, female, leader, necromancer, vampire, werebeast, ghost
- Node label: race prefix, title, separator, highest skill + name, age with ✝

**Civilization color generation** (`World.GenerateCivColors()`): HSV rotation — medium saturation for first 6 races, lighter for 7-12, darker for 13-18.

**Leaflet.js coordinate math** (`Map.vue`):
```js
// Y-axis inverted, scaled by tileSize
latlng = [(height - coordinate.y) * scale - 0.5 * scale,
           coordinate.x * scale + 0.5 * scale]
```

**HTML anchor cross-linking** (`HtmlStyleUtil.cs`):
```csharp
GetAnchorString(icon, entityType, id, title, displayName)
  → "<a href='/{entityType}/{id}' title='{title}'>{icon}{displayName}</a>"
```

**Event rendering** (`WorldObject.ToLink()`): Each event type has a `Print()` method generating richly linked HTML sentence, transmitted to frontend and injected via `v-html`.

**O(1) site lookup** (`World.cs`): `Sites[id - 1].Id == id` fast path — sites are 1-indexed and generally contiguous.

**World grid** (`World.cs`): `Dictionary<Location, WorldRegion>` for O(1) coordinate-to-region lookup.

---

## Data Access Patterns

### df-ai Data Access Patterns

**Global state** (C++ `REQUIRE_GLOBAL` macros, Lua `df.global.*`):
- `cur_year`, `cur_year_tick` — current game date
- `pause_state` — paused/unpaused
- `ui` — fortress state: noble positions, squads, caravans, site/group IDs
- `world` — everything else: units, items, buildings, jobs, history, crimes, manager_orders

**Unit iteration** (`world->units.active`): All active units; filter with `Units::isCitizen()`, `isBaby()`, `isDead()`, `isSane()`.

**Item lookup** (`world->items.other[items_other_id::*]`): Typed item lists by category (IN_PLAY plus typed sublists).

**Building lookup**: `df::building::find(bld_id)`, virtual cast to specific building type.

**Job list** (`world->jobs.list`): Linked list; scan with `j->next`.

**Map tiles** (`Maps::getTileType()`, `Maps::getTileWalkable()`, `block_square_event_mineralst`): Tile type, walkability, ore vein scanning.

**Viewscreen detection**: `strict_virtual_cast` + `Gui::getFocusString(screen)` for current UI context.

**Timing**: 1 DF year = 403,200 ticks. 1 DF day = 1,200 ticks. "Every 25 ticks" fires ~16,000×/year.

**Execution model**: All game-thread data access via DFHack hooks (`onupdate` callback from DFHack update hook). Exclusive callbacks drive UI via simulated interface key events. TCP RPC broken for game-thread calls on DFHack 53.x under Prism — use `dfhack-run` over SSH instead.

### LegendsViewer-Next Data Access Patterns

**Source files consumed**:
1. `legends.xml` — base DF export (always required)
2. `legends_plus.xml` — DFHack-generated enriched export (optional but dramatically richer)
3. `.txt` history file — narrative prose supplement
4. Sites-and-populations file — population demographics
5. `.bmp` map file — optional base map image (used instead of generated image if present)

**Parsing approach**: Streaming `XmlReader` with `Async = true` — never loads full file into DOM. `FilteredStream` pre-processes bytes for control character safety.

**In-memory query**: All queries are in-memory LINQ after parse. No database — singleton `World` object held in memory. For a database-backed implementation like Chronicler, replace LINQ with SQL.

**REST API pattern**: Paginated GET endpoints per entity type. Query parameters: `search`, `page`, `size`, `sortKey`, `sortOrder`. Response: `{ items: [...], totalCount: N }`. Event chart endpoints: `/api/{Type}/{id}/eventchart`, `eventtypechart`.

**Frontend data flow**: Pinia stores per entity type cache results within session. `v-data-table-server` drives server-side pagination. Images transmitted as base64 PNG strings in JSON.

---

## Key Insights

### df-ai Insights

1. **No planner — just invariant maintenance**: df-ai has no explicit goal tree. The entire system is five independent invariant-maintenance loops polling at different rates and taking the smallest corrective action when their invariant is violated. This "reactive control" architecture is more robust than a planner because it handles unexpected DF behavior gracefully. Chronicler's LLM advisor can adopt the same philosophy: frame every advisory recommendation as "current state deviates from desired state by X — recommended corrective action is Y."

2. **df-ai is domain knowledge, not code to reuse**: The C++ codebase is unrunnable on current DF 53.10 (designed for older DF/DFHack versions). Its value is entirely as an encyclopedia of expert DF fortress management heuristics. Every decision encoded in its logic represents years of DF expertise.

3. **Exclusive callback = one action at a time**: The strict serialization of UI interactions (one exclusive callback runs while all others are queued) prevents DF UI conflicts. Any Chronicler action executor must maintain the same discipline — never attempt concurrent multi-step game interactions.

4. **Stock threshold scalability**: The `NeededPerDwarf` mechanism handles population scaling automatically. Thresholds that make sense for a 20-dwarf fortress would be wrong for a 150-dwarf fortress. This per-capita scaling is essential for a robust stock advisor.

5. **Room assignment is a 1:1 mapping problem**: df-ai maintains explicit bedroom/diningroom owner assignments as integer sets. This is not "nice to have" — without explicit tracking, the game's automatic assignment is unreliable. Chronicler's CDM room schema should include explicit `owner_unit_id` fields.

6. **DF Bug 5551 and similar**: Real DF play requires compensating for known game bugs. df-ai encodes several such workarounds. Chronicler's live advisor must also know and compensate for these bugs.

7. **Manager order stall is a known production blocker**: The `validated`-state stall is a real DF behavior that requires periodic clearing. Any Chronicler production advisor must detect and resolve this state.

8. **Blueprint JSON system enables repeatable fortress designs**: df-ai's external JSON blueprint system means fortress layouts are fully configurable without code changes. Chronicler can adopt this pattern to let players define and share fortress blueprints.

9. **DFHack TCP RPC is broken for game-thread calls on DFHack 53.x under Prism**: All live game-state access must go through `dfhack-run` over SSH. The TCP RPC path only works for cached calls (GetVersion, GetWorldInfo). All RFR plugin calls and RunCommand hang indefinitely.

### LegendsViewer-Next Insights

10. **115 event types is the authoritative canonical list**: `XMLParser.cs:408-888` is the most complete available enumeration of all DF Legends XML event types. Chronicler's CDM event type enum should be derived from this list.

11. **legends_plus.xml is transformative**: The DFHack-generated plus file adds relationship data, extended fields, and event relationships that make the legends database dramatically richer. Chronicler must prioritize plus-file integration.

12. **Control characters in DF XML are a real hazard**: Without the `FilteredStream` wrapper, XML parsers will throw on DF's raw control character output. Chronicler's XML ingestion pipeline must include equivalent sanitization.

13. **Family tree depth limits prevent recursion bombs**: The 3-ancestor limit per lineage is a practical constraint, not an arbitrary one — DF dynastic trees can extend for thousands of years and thousands of generations. Without depth limits, genealogy rendering would be unusably slow or infinite.

14. **In-memory singleton is viable for single-world use**: LegendsViewer-Next's approach (parse once, hold in memory, query with LINQ) works well for its use case. Chronicler's PostgreSQL approach offers advantages (persistence, cross-session queries, richer filtering) at the cost of ETL complexity.

15. **Civilization-colored visualization creates intuitive UX**: Consistent per-civilization colors across map, graph, and list views dramatically reduce cognitive load when cross-referencing multiple data sources. Chronicler's visualization layer should adopt this pattern.

16. **Event HTML rendering server-side unlocks rich UX cheaply**: Generating cross-linked HTML on the backend (rather than doing client-side relinking) means the frontend only needs `v-html` injection — no complex client-side relationship mapping required.

17. **EventCollection types (19) are distinct from individual events (115+)**: Collections represent compound events (a war, a beast attack, an insurrection) that contain many individual events. Both levels must be modeled in the CDM and surfaced in the UI.

18. **The DF world coordinate system is a simple pixel grid**: Y-axis inverted, scaled by tile size. No geographic projection needed — `L.CRS.Simple` in Leaflet is the correct choice. Scale formula: `[(height - y) * scale, x * scale]`.

19. **Performance on large worlds requires careful architecture**: Even in-memory, post-processing cross-reference resolution across tens of thousands of HFs and hundreds of thousands of events requires careful ordering (process HF links before entity links, etc.) and O(1) lookup structures.

20. **Breadcrumb/adjacent-ID navigation is essential for exploration**: Players navigating large datasets need prev/next controls — not just back buttons — to explore adjacent records. This is especially important for event logs and HF lists.

---

## Appendix: Complete DF Event Type Reference

### 115 WorldEvent Types (from XMLParser.cs:408-888)

**HF Links**: add hf entity link, add hf hf link, add hf site link, remove hf entity link, remove hf hf link, remove hf site link, add hf entity honor

**HF State**: change hf job, change hf state, change hf body state, changed creature type, hf died, hf wounded, hf revived, hf reach summit

**HF Actions**: hf abducted, hf new pet, hf reunion, hf simple battle event, hf travel, hf profaned structure, hf disturbed structure, hf destroyed site, hf attacked site, hf razed structure, hf rampaged in site (via entity), hf preach, hf prayed inside structure, hf viewed artifact, hf asked about artifact, hf carouse

**HF Intrigue**: hf confronted, assume identity, impersonate hf, hf gains secret goal, hf learns secret, hf does interaction, hf performed horrible experiments, hfs formed intrigue relationship, hfs formed reputation relationship, failed frame attempt, failed intrigue corruption, hf convicted, hf interrogated, entity primary criminals

**HF Fate**: hf freed, hf enslaved, hf ransomed, hf relationship denied, hf recruited unit type for entity

**Site Events**: created site, destroyed site, attacked site, plundered site, reclaim site, site abandoned, site died, site dispute, site taken over, site tribute forced, site surrendered, site retired

**Entity Events**: entity created, entity dissolved, entity law, entity relocate, entity rampaged in site, entity fled site, entity expels hf, entity persecuted, entity searched site, entity alliance formed, entity overthrown, entity incorporated, entity breach feature layer, entity equipment purchase

**Artifact**: artifact created, artifact destroyed, artifact stored, artifact possessed, artifact lost, artifact given, artifact claim formed, artifact copied, artifact recovered, artifact found, artifact transformed

**Masterpiece**: masterpiece arch design, masterpiece arch constructed, masterpiece engraving, masterpiece food, masterpiece lost, masterpiece item, masterpiece item improvement, masterpiece dye

**Diplomatic**: peace accepted, peace rejected, agreement made, agreement rejected, agreement formed, agreement concluded, agreement void, diplomat lost, first contact, site tribute forced

**Construction**: created structure, created world construction, replaced structure, razed structure, new site leader, modified building, building profile acquired

**Cultural/Civic**: poetic form created, musical form created, dance form created, written content composed, knowledge discovered, holy city declaration, regionpop incorporated into entity, create entity position

**Tactical**: field battle, tactical situation, squad vs squad

**Special**: sneak into site, spotted leaving site, item stolen, creature devoured, body abused, merchant, gamble, trade, hf equipment purchase, procession, ceremony, performance, competition, sabotage, insurrection started

**Relationships (plus-XML only)**: HistoricalEventRelationShip — stored in World.SpecialEventsById

### 19 EventCollection Types

**Warfare**: battle, war, duel, raid, site conquered

**Political**: insurrection, persecution, purge, entity overthrown (coup)

**Calamities**: beast attack, abduction, theft

**Rituals**: occasion, procession, ceremony, performance, competition

**Travel**: journey

---

## Appendix: df-ai Subsystem Timing Reference

| Subsystem | Files | Update Frequency | Scope |
|-----------|-------|-----------------|-------|
| Population | population.cpp | Every 25 ticks | Citizens, jobs, unsuspend |
| Military | population_military.cpp | Every 25 ticks (phase 4) | Draft/dismiss, squads, attack orders |
| Nobles | population_nobles.cpp | Every 25 ticks (phase 2) | Noble position assignment |
| Trading | trade_manager.cpp | Every 25 ticks (phase 0) | Caravan, broker, trade execution |
| Pets | population_pets.cpp | Every 25 ticks (phase 5) | Pasture, milking, shearing |
| Justice | population_justice.cpp | Every 25 ticks (phase 4) | Crime detection, punishment |
| Occupations | population_occupations.cpp | Every 25 ticks (phase 8) | Tavern, performer, scholar |
| Construction Plan | plan.cpp | Every 240 ticks | Dig, build, furnish rooms |
| Cistern | plan_cistern.cpp | Every 240 ticks | Water supply |
| Room smoothing | plan_smooth.cpp | As needed | Stone smoothing, engraving |
| Stocks | stocks.cpp | Every 100 ticks | Item count, production queue |
| Farm | stocks_farm.cpp | Every 100 ticks | Crop selection, rotation |
| Metalwork | stocks_forge.cpp | Every 100 ticks | Ore, bars, equipment |
| Equipment | stocks_equipment.cpp | Every 100 ticks | Weapons, armor, tools |
| Embark | embark.cpp | Once (setup) | Site selection, initial party |
| Blueprint setup | plan_setup.cpp | Once | JSON blueprint → room layout |

---

## Appendix: LegendsViewer-Next Entity Data Model Summary

### HistoricalFigure Key Fields
Name, Race (CreatureInfo), Caste, BirthYear, BirthSeconds72, DeathYear, DeathSeconds72, Age, Alive, Deity, Force, Ghost, Zombie, Skeleton, Animated, AnimatedType, Adventurer, CurrentState (HfState), RelatedHistoricalFigures (List<HistoricalFigureLink>), RelatedEntities (List<EntityLink>), RelatedSites (List<SiteLink>), RelatedRegions, Skills (List<Skill>), Spheres, ActiveInteractions, Goal, NotableKills, Battles, BeastAttacks, Positions (List<HfPosition>), VagueRelationships, RelationshipProfiles, Reputations, HoldingArtifacts, DedicatedStructures, IntrigueActors, IntriguePlots, BreedId, LineageCurseParent, FamilyTreeData (CytoscapeData, lazily computed).

**HF Link Types**: Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge.

### Site Key Fields
SiteType (22 types), UntranslatedName, Coordinates (List<Location>), Rectangle, Region, Structures, OwnerHistory (List<OwnerPeriod>), SiteProperties, RelatedHistoricalFigures, Battles, Conquerings, Raids, Duels, Purges, Persecutions, Insurrections, Coups, Abductions, BeastAttacks.

### Entity Key Fields
EntityType (11 types), IsCiv, Race, SiteHistory, EntityPositions, EntityPositionAssignments, EntityPopulation, Parent, Groups, EntityOccasions, LineColor, EntityEntityLinks.

### World Core Collections
Regions, UndergroundRegions, Landmasses, MountainPeaks, Rivers, Sites, HistoricalFigures, Entities, Eras, Artifacts, WorldConstructions, PoeticForms, MusicalForms, DanceForms, WrittenContents, Structures, Identities, EntityPopulations.

---

*Consolidated from:*
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/df-ai-research.md` (source date: 2026-02-23)
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/legendsviewer-next-research.md` (source date: 2026-02-23)
