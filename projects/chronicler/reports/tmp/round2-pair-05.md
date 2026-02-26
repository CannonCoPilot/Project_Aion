# Round 2 Consolidation: Data Quality Analysis & Reference Tool Research

**Sources**:
- `round1-pair-09.md`: Consolidation of `data-gap-analysis-2026-02-22.md` + `gap-closure-critical-review.md`
- `round1-pair-10.md`: Consolidation of `df-ai-research.md` + `legendsviewer-next-research.md`
**Consolidation date**: 2026-02-24

---

## All Features & Requirements

### AI Dwarf Fortress Storyteller

- **Core persona**: Speaks as "The Chronicler" with gravitas. Never fabricates facts that contradict records. Says "The annals hold no record" rather than inventing. LLM hallucination is controlled through strict persona, not suppressed — the LLM may freely add narrative color when records are silent.
- **Dual-tier context architecture**: System prompt distinguishes HISTORICAL (Legends XML) from LIVE (bridge) data. Context budget: 12,000 characters (up from 8,000 in original plan).
- **Contextual reconstruction**: Full narrative derived from sparse structured data: emotion type → cause (subthought HF_ID) → corpse record → zone bounds → death history event = "Urist McAxedwarf was horrified after witnessing the corpse of Bomrek Hammerfist lying in the tavern. Bomrek had been killed by the goblin Snodub Evilteeth during the siege of year 253."
- **Pre-resolved narrative-ready bridge data**: Bridge resolves raw IDs and coordinates into names and zone names in Lua before delivering to LLM. LLM receives usable context without requiring downstream ID lookups.
- **Confidence signaling** (Phase 2.5): Count context records and characters at retrieval time. If sparse (< 3 records or < 500 chars), prepend "Context is limited — note uncertainty." If rich (> 10 records), prepend "Rich context available — synthesize comprehensively." STATUS: NOT YET DONE.
- **Cross-linked event narratives** (from LegendsViewer-Next): Every event sentence has clickable hyperlinks for each named entity. Backend generates HTML anchors via `WorldObject.ToLink()` / `HtmlStyleUtil.GetAnchorString()`. Frontend injects via `<span v-html="...">`. Pattern: `<a href="/{entityType}/{id}" title="{tooltip}">{icon}{displayName}</a>`. Applicable to Chronicler's web UI and any future rich text rendering of storyteller output.

### Storyteller Retrieval Architecture

- **Current retrieval pipeline**: keyword extraction (stop-word filter, 200+ words, no NLP) → categorical routing (_CATEGORY_ROUTES, 23 keyword routes) → ILIKE name search (limit 5 per table) → fallback `_world_overview()` → `format_context` (12,000 char budget) → `build_messages` → LLM (Qwen3 8B via LiteLLM, temp 0.8, max 2048 tokens). STATUS: DONE.
- **Live data retrieval paths** (5 implemented): units table, unit_events, game_reports, lua_probes snapshots (armies, diplomacy, announcements), plus JOIN of units.hist_fig_id to historical_figures. STATUS: DONE.
- **Categorical routes (23)**: "deity" → historical_figures WHERE is_deity=TRUE; "dragon" → historical_figures WHERE race LIKE 'DRAGON%'; "civilization" → entities WHERE type='civilization'; "war"/"battle" → history_event_collections WHERE type=... [full route set in context.py]. STATUS: DONE.
- **Relationship traversal** (Phase 2.1): When HF matched by name, also query hf_links (spouse, children, parents, master/apprentice), hf_entity_links (civilization memberships, position titles), hf_site_links (residences, lairs, associated sites). STATUS: NOT YET DONE.
- **Event payload enrichment** (Phase 2.2): JOIN history_events to historical_figures and sites to resolve IDs into names inline. Produces "Bomrek was slain by Urist at Goldenhall in year 253." STATUS: NOT YET DONE.
- **Emotion and zone data in live unit queries** (Phase 2.3): Enhance `_retrieve_live_units()` to pull emotion data from latest `dwarf_emotions` probe and resolve unit positions to zone names from latest `zones` probe. STATUS: NOT YET DONE.
- **War name resolution** (Phase 2.4): JOIN attacker_entity_id and defender_entity_id to `entities.name` in war/battle collection queries. STATUS: NOT YET DONE.
- **pgvector / embedding-based retrieval** (long-term, T4-5): `embeddings` table and pgvector infrastructure exist but unused. All current retrieval is keyword-based. Long-term: wire up for semantic search.

### Legends XML Data Capture

- **Sections currently parsed (8 of 14+)**: `<sites>`, `<artifacts>`, `<historical_figures>`, `<entities>`, `<historical_events>`, `<historical_event_collections>`, `<landmasses>` (legends_plus), `<mountain_peaks>` (legends_plus).
- **Schema exists but unpopulated**: `<regions>`, `<underground_regions>`, `<world_constructions>`.
- **Not yet implemented**: `<entity_populations>`, `<historical_eras>`, `<poetic_forms>`, `<musical_forms>`, `<dance_forms>`.
- **legends_plus parsed**: `<identities>`, `<historical_event_relationships>`.
- **legends_plus NOT parsed**: `<written_contents>` (books, poems, treatises), `<rivers>`, `<creature_raw>`.
- **Target**: 12+ of 14 top-level sections parsed.

#### Historical Figure Sub-Profiles (not currently extracted — high storytelling value)

- Kill profile: species killed, counts, underground/surface/site context.
- Wound history: body parts lost, injuries sustained ("the one-armed warrior").
- Skill history: professions held with year ranges ("started as a peasant, became a legendary axedwarf").
- Personality: traits (50 values), values (32 values), beliefs, goals.
- Whereabouts: last known location, body state (buried/unburied).
- Reputation: criminal records, exile flags.
- Known secrets: supernatural knowledge, read books.
- Life goal (from LegendsViewer-Next model).
- Active interactions: VAMPIRE, WEREBEAST, SECRET_* curses.
- Lineage curse parent (vampire sire lineage).
- BreedId for unique creature tracking.
- `Adventurer` flag.
- Current geographic state (HfState).
- Notable Kills (other named HFs killed).
- Dedicated structures (temples dedicated to this HF).
- Intrigue actors and intrigue plots.
- Reputation profiles and relationship profiles.
- VagueRelationships.

#### Additional Legends Data Targets

- **Written Contents** (books, poems, scrolls, treatises): title, author HF ID, year composed, type, subject matter, referenced art forms. Storytelling value: HIGH ("Urist composed 'The Ballad of the Flaming Hammers' in year 237"). Phase 3.2.
- **Historical Eras**: name, type, start/end year. Enables temporal context ("During the Age of Myths (years 1-200)..."). Era end years computed from following era's start year. Phase 3.3.
- **Regions and underground regions**: geographic context for events and narratives. Phase 3.1.
- **World constructions**: bridges, roads, and other constructed geographic geographic features.
- **Entity populations**: civilized, outdoor, and underground population demographics. Phase 3.4 (optional).
- **Art forms**: poetic forms, musical forms, dance forms. Phase 3.5 (lowest priority — only if written_contents reveals refs).
- **Rivers**: geographic data, currently unparsed.
- **Creature raw**: raw creature definitions, currently unparsed.
- **Structures within sites**: temples, libraries, keeps (referenced in LegendsViewer-Next model as `Structures`).
- **Site properties**: individual parcels within sites (`SiteProperties`).
- **Owner history per site**: list of `OwnerPeriod` records (who owned from when to when). 1,145/1,899 World 2 sites currently have `owner_entity_id`; 754 still NULL.
- **22 site types**: Fortress, Hillocks, MountainHalls, ForestRetreat, Hamlet, Town, Castle, DarkPits, DarkFortress, Monastery, Fort, Tomb, MysteriousLair, MysteriousDungeon, MysteriousPalace, Cave, Lair, Vault, Labyrinth, Shrine, Tower, Camp, ImportantLocation.
- **11 entity types**: Civilization, NomadicGroup, SemiMegaBeast, MegaBeast, PerformanceTroupe, MercenaryCompany, Militia, Religion, Guild, Outcast, Unknown.
- **Entity positions and assignments**: noble titles + holders, full historical record.
- **Entity occasions**: ceremonial events.
- **Entity-entity links**: parent/child faction hierarchy.
- **HF link types (complete set)**: Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge.
- **Untranslated site names**: Dwarvish/Elvish original names alongside translated names.
- **115+ WorldEvent types** (canonical list from LegendsViewer-Next `XMLParser.cs:408-888`; see complete reference in Appendix A).
- **19 EventCollection types** (canonical list; see Appendix A).

### Live Bridge Data Capture (chronicler-bridge.lua)

- **Currently captured (v6, 16 sections)**: game_time, creature_raws, unit_summary (12 fields + flags + mood + emotions), armies (capped 50), buildings (count + type distribution), artifacts (capped 200), announcements (cursor-based, capped 200/tick), diplomacy, history (cursor-based, capped 100/tick, with payloads), world_info, entities (capped 100), dwarf_skills, dwarf_emotions (10 most recent per dwarf), zones (civzones with bounds, up to 200), event_collections (last 50), squads, mandates, crimes. STATUS: DONE.
- **Bridge v6 line count**: 922 lines (Lua).

#### Unit Data Still Not Captured (available in `df.global.world.units.active[]`)

- Health wounds vector (body parts, severity).
- Inventory / equipped items with worn/held slots.
- `birth_year`, `old_year` (age and expected death from old age).
- `relationship_ids[9]` indexed by unit_relationship_type.
- `following` (currently following which unit).
- Full personality needs vector (unmet psychological needs). Currently captured in unit_summary as resolved text only.
- Full personality memories vector (notable life memories).
- Full personality preferences vector (foods, metals, activities liked).

#### World Structures Not Yet Captured

- `world.activities` (10-50 typical): parties, performances, scholarly work, training.
- `world.written_contents.all` (0-100): library contents, books authored in fortress.
- `world.jobs.list` (50-200): current workshop orders, construction tasks.
- `world.manager_orders` (0-30): standing work orders.
- `world.items.all` (1,000-100,000+): item locations, corpses, equipment. HIGH performance risk — corpse subset is safe.
- `world.plants.all` (100-5,000): farm plots, surface vegetation. Low priority.
- `world.interactions` (0-20): active curses, magic effects.
- `world.identities` (0-10): secret identities (vampire covers, etc.).
- `world.occupations` (0-50): scholar/performer roles.
- `world.belief_systems` (1-5): religious belief systems.

#### Spatial Data Not Yet Captured

- Individual building footprints: each building has `x1, y1, x2, y2, z` bounds (currently only type counts captured).
- Corpse spatial data: `item_corpse.pos.x/y/z`, `hist_figure_id`, `unit_id`, `race`, `caste`, `sex`, `rot_timer`.

### Announcement / Event Lossless Capture

- **Report cursor tracking** (T1-1): Track `last_seen_report_id`; fetch all reports with `id > last_seen_report_id` each tick (cap 200). Lossless across all 250+ announcement types. `world.status.reports` is append-only, NOT a ring buffer. STATUS: DONE.
- **History event cursor tracking** (T1-4): Track `last_seen_event_id`; fetch all new events since last poll (cap 100/tick). STATUS: DONE.
- **History event payloads** (T1-3): Extract key fields from event structs by type — at minimum hf_id_1, hf_id_2, site_id, artifact_id, entity_id, victim, slayer, reason. STATUS: DONE.
- **gamelog.txt as backup/validation**: Plain-text at `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\gamelog.txt`, accessible via HTTP at `curl http://192.168.4.194:8888/gamelog.txt`. No structured metadata. Tertiary backup only — use for gap-filling if bridge crashes and cursor is stale.

### Psychology / Emotion Capture

- **Emotion/thought capture** (T2-1): Per-dwarf `emotions[]` vector. Each emotion: type (ANGER, FEAR, JOY, GRIEF, etc.), thought type (200+ unit_thought_type values), subthought (ID reference to specific HF/event as cause), strength, relative_strength, severity, year, year_tick, flags (was_dream_goal, vocalized). Captures 10 most recent per dwarf. STATUS: DONE.
- **Emotional subthought linkage**: The `subthought` field directly links an emotion to its specific cause — key to contextual reconstruction.
- **Unit flags** (T1-2): `has_mood`, `mood` (enum: Fey, Possessed, Macabre, Berserk, Melancholy), `in_tantrum`, `ghostly`, `active_invader`, `pregnancy_timer`, `pregnancy_spouse`, `emotionally_overloaded`. STATUS: DONE.
- **Change detector events**: MOOD_CHANGED, MOOD_RESOLVED, GHOST, PREGNANCY_DETECTED, STRESS_SPIKE. 11 event types total across core and bridge paths. STATUS: DONE.
- **Needs vector**: Unmet psychological needs (alcohol, social interaction, etc.). Currently captured in unit_summary as resolved text. Full vector not yet captured.
- **128-bit unit flags across 4 bitfields**: has_mood (flags1), active_invader (flags1), merchant (flags1), diplomat (flags1), caged (flags1), killed/inactive (flags1/2), drowning (flags2), emotionally_overloaded (flags2), announce_titan (flags2), ghostly (flags3), in_tantrum (flags3).

### Spatial / Zone Resolution

- **Zone capture** (T2-2): All `building_civzonest` entries with type, x1/y1/x2/y2/z bounds, names, up to 200. STATUS: DONE.
- **Zone type → human-readable name mapping**: MeadHall→"the tavern", Temple→"the temple", Bedroom→"their bedroom", DiningHall→"the dining hall", Barracks→"the barracks", Tomb→"the catacombs", Dungeon→"the dungeon", Office→"the office", Library→"the library", NobleQuarters, Shop, Guildhall, Kitchen, CaptiveRoom, ThroneRoom, Depot.
- **"Whose dead body?" full reconstruction chain**: Emotion (WitnessDeath + subthought HF_ID) → corpse location (item_corpse.pos where hist_figure_id matches) → room context (zone bounds match) → observer location (unit.pos at time of emotion) → death event (history_events where event_type = HIST_FIGURE_DIED and hf_id_1 = HF_ID).

### DFHack Event Hooks (Push-Based Alternative)

- **DFHack event callbacks**: `dfhack.onStateChange` for game state transitions; `EventManager` for specific event type callbacks (UNIT_DEATH, CONSTRUCTION, etc.). Push-based, no polling gap.
- **Requirements**: Persistent Lua plugin, not a `repeat` script. More complex to implement and debug.
- **Target use case**: Critical events (deaths, mood starts, siege begins) where polling blindspot is unacceptable. Eliminates last remaining blindspot: intermediate states (berserk dwarf who dies within one poll window).
- **Priority**: Tier 4 / long-term. Current `repeat`-based model covers the vast majority of cases.

### Multi-World Architecture

- **Composite primary key requirement** (BUG-007): All 12 legends tables currently use `id INT PRIMARY KEY` where `id` is DF-internal and starts from 1 in every world. Multi-world imports cause silent data loss via `ON CONFLICT DO NOTHING`.
- **Affected tables with data loss metrics**: historical_figures (5,466 World 2 HFs lost = 19.5%), history_events (massive loss), sites (~1,800 lost), entities (most lost), artifacts (most lost), regions (all lost from World 2), underground_regions (all lost), history_event_collections (most lost), identities (most lost), landmasses (all lost), mountain_peaks (all lost), world_constructions (all lost).
- **Fix**: Migrate all 12 legends tables to composite PKs `(world_id, id)`. Update all FK references to include world_id. Update import pipeline ON CONFLICT clauses. Update all storyteller queries.
- **Multi-world bookmark system** (from LegendsViewer-Next): File-based bookmark store with world metadata and SkiaSharp-generated thumbnail. World overview page with bookmark cards: world map thumbnail, name, dimensions, last-accessed timestamp. "Explore a new world" card with file browser dialog. Bookmarks persist across sessions.

### Data Integrity Fixes (Bugs)

- **BUG-005 — kill_count computation inverted** (CRITICAL): Current query groups by `hf_id_1` (victim) instead of `hf_id_2` (killer) in death events. Result: kill_count always 0 or 1. `_world_overview()` "Notable figures" sort is corrupted. Fix: change `hf_id_1` to `hf_id_2` in xml_parser.py lines 710-711, re-run computation. Effort: ~5 lines.
- **BUG-006 — Link table duplicate accumulation** (HIGH): `hf_links`, `hf_entity_links`, `hf_site_links` use SERIAL PRIMARY KEY. `ON CONFLICT DO NOTHING` never triggers. Re-importing the same world appends exact duplicates, causing duplicate relationships in storyteller output. Fix: add UNIQUE constraints, deduplicate existing data.
- **BUG-007 — Single-column PKs, multi-world collision** (CRITICAL): See Multi-World Architecture above. Phase 1. Effort: 4-6 hours.
- **BUG-008 — Region parsing scope risk** (MEDIUM): `_parse_regions()` uses `root.findall(".//region")` which matches ALL `<region>` tags in document including inside `<site>` elements. May insert spurious region records. Fix: scope to `root.findall("regions/region")`. Effort: 1 line.
- **BUG-001 — Boolean flags all FALSE — FIXED**: Originally ALL boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`, `is_ghost`) were FALSE across all 55,321 historical figures. Root cause: parser needed to detect via spheres (deity), interactions (vampire), and other indirect signals. STATUS: FIXED in xml_parser.py lines 159-183.
- **BUG-002 — Multi-participant events truncated**: Events with multiple HFs (battles with 10+ participants) store only first `hf_id_1` and `hf_id_2`. Additional participant IDs go to JSONB `details` but are not indexed. Fix: collect ALL participant HF IDs into a `participants` JSONB array or create an `event_participants` junction table. Design decision pending.
- **BUG-003 — Site ownership NULL — FIXED**: All `owner_entity_id` were NULL. Fix: parse `cur_owner_id` from legends_plus.xml entity_site_links. STATUS: FIXED — 1,145/1,899 World 2 sites now have owners.
- **Control character filtering in XML** (from LegendsViewer-Next): DF XML output contains raw control characters (bytes < 32). Without filtering, XML parsers throw. LegendsViewer-Next solution: `FilteredStream` wrapper replaces all bytes < 32 with spaces before XML reader sees them. Chronicler's XML ingestion pipeline must include equivalent sanitization. STATUS: unknown — verify whether current xml_parser.py handles this.

### Operational / Infrastructure Requirements

- **lua_probes unbounded growth** (DESIGN-001): Each watcher poll inserts 16 rows every 30 seconds = 32 rows/minute, 1,920/hour, 46,080/day. No TTL, no cleanup, no deduplication. Fix options: (a) delete rows older than N hours keeping latest per probe_name, (b) UPSERT with `UNIQUE (world_id, probe_name)` ON CONFLICT DO UPDATE, (c) configurable retention policy. Phase 4.2.
- **Bridge health monitoring**: Track consecutive bridge fetch failures; log warning after 3 failures; continue with core-only data; resume bridge polling when HTTP server returns. Phase 4.3.
- **Migration framework** (Phase 4.4): `chronicler/db/migrations/` directory with numbered SQL files, `migrations` table tracking applied, CLI command `chronicler migrate`. Not urgent (pre-1.0, single operator).
- **Sites-and-populations file parsing** (from LegendsViewer-Next): Parser for DF-exported populations file producing: `SitePopulations`, `CivilizedPopulations`, `OutdoorPopulations`, `UndergroundPopulations`. Integrates into main parse pipeline.
- **History text file parsing** (from LegendsViewer-Next): `HistoryParser` reads DF `.txt` history file and adds narrative detail to world model. Supplements XML data with richer prose descriptions.

### Test Coverage

- **Zero test coverage currently** (MEDIUM severity).
- **Target test files**:
  - `test_xml_parser.py`: Parsing correctness, boolean detection, field mapping. HIGH priority.
  - `test_context.py`: Keyword extraction, category routing, query generation. HIGH priority.
  - `test_schema.py`: Schema integrity, FK constraints, composite PKs. HIGH priority.
  - `test_detector.py`: Change detection across snapshots. MEDIUM priority.
  - `test_bridge.py`: Bridge accessor parsing, version detection. MEDIUM priority.
- **Minimum viable test set**:
  - Parse small test XML with known deities/vampires, verify boolean flags.
  - Verify kill_count computation with known event data.
  - Verify keyword routing maps to correct query types.
  - Verify composite PK prevents cross-world collisions.

---

## World History & Demographics Visualizer (from LegendsViewer-Next)

### Interactive World Map

- Library: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection needed — DF uses simple pixel grid).
- Map image generation: SkiaSharp PNG from world region data; three cached sizes (thumb/default/large). Use DF-exported `.bmp` map file if present, otherwise generate from `RegionTypeColors.BaseRegionColors`.
- **Coordinate system**: Y-axis inverted, scaled by tile size: `[(height - y) * scale, x * scale]`. This is the canonical formula.
- **Site marker shapes by type**: Circle (Unknown, Cave, Lair, Camp), Triangle (Monastery, Fort, Tomb), Square (Hillocks, Hamlet), Pentagon (Fortress, ForestRetreat, Town, DarkPits), Hexagon large (MountainHalls, Castle, DarkFortress), Star (Vault, Labyrinth, Shrine, Tower, ImportantLocation), Pentagon blue (MysteriousDungeon), Hexagon blue (MysteriousPalace).
- Marker colors: owning civilization's generated color (`Entity.LineColor`).
- Layer control: sites grouped by owner into Leaflet `LayerGroup`; "All"/"None" toggle buttons.
- Popup content: site name, type, owner name.
- Zoom: `minZoom: -2`, `maxZoom: 2`.
- Per-object mini-maps: focused region-highlighted map on each entity detail page.

### Civilization Color System

- HSV rotation algorithm: medium saturation for first 6 races, lighter for 7-12, darker for 13-18.
- Applied consistently across: map markers, warfare graph nodes, civilization list items. Reduces cognitive load when cross-referencing data sources.

### Population Charts

- Doughnut chart (Chart.js): Population by Race.
- Doughnut chart: Area by Overworld Regions.
- Line chart: Events per year for world timeline.
- Bar chart: Event type breakdown by count.
- Library: `vue-chartjs` 5.3.2 (Chart.js 4.4.8 wrapper).
- Data endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`.

### World Summary Dashboard

- World map thumbnail linking to full interactive map.
- Population by Race and Area by Overworld Regions doughnut charts.
- Active Civilizations card list (with civilization color indicators).
- Lost Civilizations card list.
- Events section: line chart + paginated event table.
- Chronicles section: paginated event collection table.
- Heroic Ties card: player-related objects — adventurer HFs, their factions, sites.

### Historical Figure Detail Pages

All fields from the LegendsViewer-Next `HistoricalFigure.cs` model:
- Profile overview: name, race, caste, birth/death years, age, living status (alive/dead/ghost/undead/zombie/skeleton).
- Deity status, deity spheres (water, death, etc.).
- Current geographic state (HfState).
- Active interactions (VAMPIRE, WEREBEAST, SECRET_* curses).
- Life goal.
- Family Tree card (Cytoscape.js).
- Skills card: scrollable list with rank icons and point counts.
- Related Factions and Groups (entity memberships + positions).
- Related Sites (home, lair, seat of power).
- Close Relationships: Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge.
- Vague Relationships and Reputation profiles.
- Worshipped Deities.
- Noble Positions held (full history).
- Notable Kills (other named HFs killed).
- Artifacts currently held.
- Dedicated Structures (temples).
- Battles participated in (attacker/defender/non-combatant).
- Beast Attacks (if a beast).
- Snatcher-of list (abduction victims).
- Intrigue actors and plots.
- BreedId for unique creature tracking.
- LineageCurseParent (vampire sire chain).
- Adventurer flag.

### Family Tree Visualization

- Library: Cytoscape.js 3.31.0 + `cytoscape-dagre` (hierarchical layout).
- Depth limit: max 3 ancestors per maternal and paternal line (separate counters); children unlimited. Prevents recursion bombs on DF's multi-century dynasties.
- Node visual classes: `dead` (30% opacity), `male` (blue), `female` (magenta), `leader` (round-octagon + crown), `necromancer` (round-hexagon + skull), `vampire` (hexagon + vampire icon), `werebeast` (hexagon + wolf), `ghost` (hexagon + ghost).
- Node label: race prefix, title/assignment, separator lines, highest skill rank, HF name, age with ✝ if dead.
- Click navigation: click node → navigate to that HF's detail page.
- Two sizes: compact 360px height and fullscreen 720px (toggle via ExpandableCard).
- Relationship scope: Mother, Father, Child only. Spouse/Lover/Companion in separate Related list.

### Warfare Graph

- Library: Cytoscape.js with `cytoscape-cola` (force-directed physics).
- Nodes: Civilizations (round-hexagon), Battles/Wars (roundrectangle).
- Edges: attack/defense relationships with labels and widths proportional to battle size.
- Edge tooltips: `tippy.js` 6.3.7 on hover.
- Clickable: tap node/edge → navigate to entity or battle detail page.
- Appears on War detail pages and Entity detail pages.

### Event Timeline and Type Distribution Charts

- Per-entity line chart: events per year for complete event history.
- Per-entity bar chart: count of each distinct event type.
- Served from REST endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`.
- Displayed in expandable card sections on every object detail page.

### Complete 70-Route World Browser (from LegendsViewer-Next)

35 list + 35 detail view pairs covering:
- Society: entities (civilizations, religions, guilds, performance troupes, mercenary companies, militias, nomadic groups, outcasts), historical figures.
- Geography: surface regions, underground regions, landmasses, rivers, mountain peaks.
- Infrastructure: sites (all 22 types), structures within sites, world constructions (roads, tunnels, bridges).
- Art and Craft: artifacts, dance forms, musical forms, poetic forms, written contents.
- Warfare: wars, battles, duels, raids, site conquerings.
- Conflicts: insurrections, persecutions, purges, coups.
- Calamities: beast attacks, abductions, thefts.
- Rituals: processions, performances, journeys, competitions, ceremonies, occasions.
- Historical eras.

### Written Content, Art Forms, and Cultural Output Browser

- Written Contents (books, scrolls): title, content type, author HF, topics covered.
- Poetic Forms: name, craft style, sub-type.
- Musical Forms: name, style.
- Dance Forms: name, style.
- Cross-links from HF pages to authored works and vice versa.
- Fully cross-linked with Storyteller references ("Urist composed 'The Ballad of the Flaming Hammers' in year 237").

### Historical Eras Browser

- Era list + detail views.
- Era end years computed from following era's start year (post-section processing).
- Events assigned to eras after `historical_eras` section parsed.
- Display: era name, start/end year, major civilizations active, notable events.

### Paginated Server-Side Search API

- Server-side search: text field triggers `loadWorldObjects()` on each keystroke change.
- Backend: case-insensitive name filter.
- Server-side pagination via `v-data-table-server`: 10/25/50/100 items per page options.
- Column-level sorting via `sortKey` + `sortOrder` query parameters.
- Standard GET endpoint: `/api/{Type}?search={text}&page={n}&size={m}&sortKey={col}&sortOrder={asc|desc}`.
- Total count badge displayed (cyan chip).
- DF Wiki search button per entity type.
- Prev/Next navigation FABs for adjacent-record browsing.

### Heroic Ties / Player Character Tracking

- `PlayerRelatedObjects` property: set of objects tagged as player-related.
- `Adventurer` flag on HistoricalFigure.
- On World Summary page: "Heroic Ties" card listing player-related HFs, entities, sites.
- Cross-links to all associated detail pages.

### Creature / Entity Identity and False Identity Tracking

- `Identity` entity type: false identities assumed by HFs (common vampire behavior).
- `assume identity` and `impersonate hf` event types.
- `ActiveInteractions` on HF: VAMPIRE, WEREBEAST, SECRET_* flags.
- `LineageCurseParent`: vampire sire chain.
- `BreedId`: unique breed tracking.

---

## Autonomous AI Fortress Player / Advisor (from df-ai)

### Tick-Based Polling / Advisory Cadence

Mirror df-ai's polling schedule as Chronicler's advisory cadence:
- Every 25 game ticks (~16,000×/year): population alerts (new arrivals, deaths, stalled jobs, nobles, crimes).
- Every 100 ticks: stockpile status, production queue, farm/metal status.
- Every 240 ticks: construction status, room lifecycle completion.
- Every 1,200 ticks (1 DF day): full fortress health summary.
- Every 403,200 ticks (1 DF year): annual review / year-in-summary.

DF timing constants: 1 DF year = 403,200 ticks. 1 DF day = 1,200 ticks. "Every 25 ticks" fires ~16,000×/year.

### Ten-Phase Population Update Cycle

Adopt df-ai's 10-phase round-robin (each phase is a discrete advisory query):
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
Phase 9: Emit population event JSON (to CDM or live stream)
```

### Three-Tier Stock Threshold Model

Replicate the `Watch` struct in Chronicler's CDM schema:
```
Needed:         absolute floor — act immediately
NeededPerDwarf: scales with population (per 100 dwarves)
WatchStock:     items to monitor but not necessarily act on
AlsoCount:      items to count for context without alerting
```
~100 named stock item categories (see `STOCKS_ENUMS` in `stocks.h`). `NeededPerDwarf` mechanism handles population scaling automatically — essential for robust stock advisor.

### Room Type Taxonomy and Construction State Machine

- Canonical room types (22): corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop.
- Canonical room status states: `plan → dig → dug → finished`.
- CDM `rooms` table stores states and `owner_unit_id` (explicit bedroom/diningroom owner assignments — unreliable without explicit tracking).
- Furniture types (28): archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well.
- Task type enum (22): check_construct, check_furnish, check_idle, check_rooms, construct_activityzone, construct_farmplot, construct_furnace, construct_stockpile, construct_tradedepot, construct_windmill, construct_workshop, dig_cistern, dig_garbage, dig_room, dig_room_immediate, furnish, monitor_cistern, monitor_farm_irrigation, monitor_room_value, rescue_caged, setup_farmplot, want_dig.
- Construction task lifecycle: `want_dig(room) → tasks queue → dig_room → monitors until floor/open → status=dug → construct_room() → construct_* tasks → once built → furnish_room() → try_furnish() per item`.

### Priority-Driven Construction Sequencing

- JSON-driven priority filter system (from `plan_priorities.h`). Each rule is a filter over room properties paired with an action. Stored as configurable JSON priority ruleset. Prioritizes survival essentials (food, shelter, defense) before quality-of-life improvements.
- Actions: dig_immediate, unignore_furniture, finish, start_ore_search, dig_next_cavern_outpost, past_initial_phase, deconstruct_wagons.

### Blueprint / Floor Plan System

- Parse df-ai's JSON blueprint format (`plans/generic01.json`). Blueprint specifies: room types, min/max counts, tags grouping room types, `count_as` (e.g., one dormitory = 39 bedrooms), limits per type. Enables player-definable and shareable fortress designs.
- Translate into Chronicler's CDM room graph with `accesspath` corridor links.

### Military Sizing and Drafting Advisor

- Default military bounds: 25% (minimum) to 75% (maximum) of citizen count — configurable.
- Draft pool eligibility: exclude dwarves with noble positions, mining/woodcutting/hunting labors.
- Sorting: lowest XP first for draft candidates, lowest XP first for dismiss candidates.
- Squad size scaling: 4/6/8/10 members depending on total military count.
- Uniform selection: alternating Heavy Melee / Heavy Ranged every 3 squads.
- Full heavy armor loadout: armor, helm, pants, gloves, shoes, shield, appropriate weapon.

### Noble Assignment Advisor

- Noble roles to track: Bookkeeper, Manager, Broker, Mayor, Sheriff, Captain of the Guard, and all other entity positions.
- Check noble requirements: office room, required room value, trading capability.
- Conflict detection: nobles should not simultaneously hold conflicting military positions.
- Noble room value validation: `check_noble_apartments()` checks `required_value` per room.

### Trade Advisor

- Caravan detection: monitor `ui->caravans`.
- Broker identification: `entity_position_responsibility::TRADE`.
- `want_trader_item()` decision function: what to buy based on stock Watch model.
- Trade value calculation: `item_or_container_price_for_caravan()`.
- Trade balance enforcement: offer value must be ≥ request value × 110%.
- Counter-offer handling: iterative adjustment loop.
- Full trade cycle: detect caravan → identify broker → request at depot → wait → open trade screen → scan items → balance offer → handle counter-offers → dismiss broker.

### Farm Management Advisor

- Separate plant category tracking: drink_plants, thread_plants, mill_plants, bag_plants, dye_plants, slurry_plants, grow_plants.
- Biome-aware crop selection: underground = underground plants, outdoor = surface plants.
- Season rotation logic.
- Kitchen management: mark cookable items correctly to prevent accidental cooking of seed stock.

### Metalworking Production Chain Advisor

- `update_simple_metal_ores()`: scan world for ore deposits, compute smeltable bars.
- `may_forge_bars()`: available-ore → bars math per material.
- `queue_need_forge()`: ore → bars → equipment production chain decisions.
- Metal preferences based on material flags: ITEMS_WEAPON, ITEMS_ARMOR.
- Duplicate order prevention: avoid ordering within 5 units of existing orders.
- Manager order stall detection: if order stuck in `validated` state across two monthly checks, trim quantity by 3. This is a real DF behavior requiring periodic clearing — must be in production advisor.

### Pet Management Advisor

- Detect pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing.
- Pasture assignment via `assign_unit_to_zone()` for grazing zones.
- Track grass availability per pasture zone.

### Occupation / Location Assignment Advisor

- Track `locations` (tavern, library, temple) and their required occupation types.
- Assign residents (non-citizen travelers) to fill roles via `assign_occupation()`.
- Respect location capacity constraints.

### Justice and Crime Monitoring

- Scan `world->crimes` for crime detection, punishment assignment, execution/imprisonment status.
- Alert on unresolved crimes above threshold (triggers tantrum spirals if ignored).

### Fortress Loss Detection

- Monitor viewscreen text for fortress-loss messages: "Your strength has been broken," etc.
- On detection: preserve full state snapshot, generate post-mortem narrative.
- Optionally support multi-embark session tracking (df-ai's `random_embark` pattern).

### Job Stall Detection and Auto-Unsuspend

- Every advisory cycle: scan all non-repeating suspended jobs.
- Report which jobs are stalled and why (missing materials, hauling conflicts).
- Recommend or trigger `unsuspend` via DFHack Lua.

### Baby Reunification Bug Workaround (DF Bug 5551)

- Detect baby/mother separation: baby alive, mother sane and alive and idle.
- Queue `SeekInfant` job via DFHack if separated.
- Real DF play requires compensating for known game bugs; this pattern applies to all such workarounds.

### Ore Vein Discovery and Mining Advisor

- `list_map_veins()`: scan map blocks for `block_square_event_mineralst` events.
- `dig_vein()`: route shaft to vein.
- Track `dug_veins` to avoid redundant reporting.

### Cistern and Water Supply Advisor

- Cistern construction workflow: channel water source → reservoir → well.
- Lever and floodgate connection tracking.
- `monitor_cistern()`: check water fill levels.
- Alert on empty cistern / overflowing cistern.

### LLM Action Chain / Exclusive Callback Analogy

- Maintain one active action chain at a time (analogous to df-ai's `ExclusiveCallback` system).
- Queue pending actions in FIFO order. Report completion/failure of each step before starting next.
- Strict serialization prevents DF UI conflicts — never attempt concurrent multi-step game interactions.
- Translate df-ai's ExclusiveCallback coroutines into async Python coroutines calling DFHack Lua via `dfhack-run` over SSH.

### Reactive Control Architecture Philosophy

- df-ai has no explicit goal tree. The entire system is five independent invariant-maintenance loops polling at different rates and taking the smallest corrective action when their invariant is violated.
- Chronicler's LLM advisor should adopt the same philosophy: frame every advisory recommendation as "current state deviates from desired state by X — recommended corrective action is Y."
- This "reactive control" architecture is more robust than a planner because it handles unexpected DF behavior gracefully.

---

## Implementation Architecture

### DF Data Structures

- **93 top-level `df.global.world` fields** available; bridge reads ~16 sections.
- **141 history event types** with structured payloads.
- **250+ announcement types** in `world.status.reports` — append-only, NOT a ring buffer, unique IDs enabling cursor-based lossless capture.
- **100+ unit fields per dwarf** in `df.global.world.units.active[]`.
- **19 event collection types**: WAR, BATTLE, DUEL, SITE_CONQUERED, ABDUCTION, THEFT, BEAST_ATTACK, JOURNEY, INSURRECTION, OCCASION, PERFORMANCE, COMPETITION, PROCESSION, CEREMONY, PURGE, RAID, PERSECUTION, ENTITY_OVERTHROWN, and more in v53+.
- **200+ unit thought types**: WitnessDeath, UnexpectedDeath, Death, SawDrinkingBlood, Conflict, ConflictWithAnimal, LoveSeparated, LoveReunited, AcquiredItem, LostItem, NiceRoom, UglyRoom, AteInDiningRoom, AteOutside, SleptInBedroom, SleptOnGround, RainedOn, CaughtInStorm, Conversation, NiceConversation, Argument, FightStarted, FriendDied, PetDied, RelativesDied, MadeMasterpiece, ProducedArtifact, CompletedGreatProject, ResearchBreakthrough.
- **Same ID space between legends and live data**: `world.history.events` is one vector — legends XML and live fortress events use identical IDs, enabling a unified `history_events` timeline table.

#### Key Event Type Payloads

- `HIST_FIGURE_DIED`: victim HF, killer HF, cause, weapon, site.
- `ARTIFACT_CREATED`: creator HF, item type, material, method (mood/craft), site.
- `ADD_HF_HF_LINK`: both HF IDs, link type (spouse/child/lover).
- `CHANGE_HF_MOOD`: HF ID, mood type.
- `WAR_ATTACKED_SITE`: attacker entity, defender entity, site.
- `MASTERPIECE_CREATED_ITEM`: creator HF, item type, material, skill.
- `CREATED_SITE`: founding entity, site location.
- `CREATURE_DEVOURED`: eater HF, victim HF, site.
- `HF_ABDUCTED`: snatcher HF, victim HF, site.
- `ENTITY_OVERTHROWN`: overthrower HF, entity, position.

### DFHack Global State Access Patterns

Key Lua globals:
- `df.global.cur_year`, `df.global.cur_year_tick`, `df.global.pause_state`.
- `df.global.ui` — fortress UI state, noble positions, squad list, caravans.
- `df.global.world` — units, items, buildings, jobs, history, crimes, manager_orders.

Key DFHack Lua modules:
- `dfhack.units.isCitizen()`, `isDead()`, `isSane()`, `getNoblePositions()`, `getPosition()`.
- `dfhack.buildings.constructBuilding()`, building state queries.
- `Maps.getTileType()`, `Maps.getTileWalkable()`, map block iteration.
- `dfhack.job.linkIntoWorld()`, `getWorker()`.
- `Materials.MaterialInfo`, material property lookup.
- `dfhack.gui.getCurViewscreen()`, `dfhack.gui.getFocusString()` for viewscreen state detection.

Critical `df::` structs:
- `df.world` → units, items, buildings, jobs, manager_orders, history, crimes.
- `df.ui` → follow_unit, caravans, squads, site_id, group_id, fortress_entity.
- `df.unit` → status, labors, military, inventory, body, health, occupations, relationships, mood.
- `df.item` → type, material, quality, stack size.
- `df.building` → type, build stage, position.
- `df.squad` → positions, orders, schedule, cur_alert_idx.
- `df.historical_figure` → unit_id, site links.
- `df.manager_order` → job_type, amount_left, material.

### Proposed Unified Storyteller Query ("Tell me about Urist")

```sql
-- 1. Historical figure record
SELECT * FROM historical_figures WHERE name ILIKE '%urist%';

-- 2. Current living status
SELECT u.* FROM units u
WHERE u.hist_fig_id IN (SELECT id FROM historical_figures WHERE name ILIKE '%urist%')
AND u.is_alive = TRUE;

-- 3. Relationships
SELECT hf2.name, l.link_type
FROM hf_links l JOIN historical_figures hf2 ON l.target_hf_id = hf2.id
WHERE l.hf_id = <urist_hf_id>;

-- 4. Entity memberships
SELECT e.name, el.link_type, el.position_name
FROM hf_entity_links el JOIN entities e ON el.entity_id = e.id
WHERE el.hf_id = <urist_hf_id>;

-- 5. Key events with payloads (post-Phase 2, with world_id and name resolution)
SELECT he.year, he.event_type, he.details,
       hf1.name as subject, hf2.name as object, s.name as site_name
FROM history_events he
LEFT JOIN historical_figures hf1 ON he.hf_id_1 = hf1.id AND he.world_id = hf1.world_id
LEFT JOIN historical_figures hf2 ON he.hf_id_2 = hf2.id AND he.world_id = hf2.world_id
LEFT JOIN sites s ON he.site_id = s.id AND he.world_id = s.world_id
WHERE (he.hf_id_1 = $1 OR he.hf_id_2 = $1) AND he.world_id = $2
ORDER BY he.year DESC LIMIT 10;

-- 6. Current emotions (from lua_probes dwarf_emotions section)
```

### kill_count Fix

```sql
-- WRONG (current — groups by victim):
SELECT hf_id_1 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_1

-- CORRECT (group by killer):
SELECT hf_id_2 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_2
```

File: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` lines 710-711.

### Link Table UNIQUE Constraints (BUG-006 Fix)

```sql
ALTER TABLE hf_links ADD CONSTRAINT uq_hf_links UNIQUE (hf_id, target_hf_id, link_type);
ALTER TABLE hf_entity_links ADD CONSTRAINT uq_hf_entity_links UNIQUE (hf_id, entity_id, link_type);
ALTER TABLE hf_site_links ADD CONSTRAINT uq_hf_site_links UNIQUE (hf_id, site_id, link_type);
```

Must deduplicate existing data before applying constraints.

### Composite PK Migration Schema

```
historical_figures         → PRIMARY KEY (world_id, id)
history_events             → PRIMARY KEY (world_id, id)
sites                      → PRIMARY KEY (world_id, id)
entities                   → PRIMARY KEY (world_id, id)
artifacts                  → PRIMARY KEY (world_id, id)
regions                    → PRIMARY KEY (world_id, id)
underground_regions        → PRIMARY KEY (world_id, id)
history_event_collections  → PRIMARY KEY (world_id, id)
identities                 → PRIMARY KEY (world_id, id)
landmasses                 → PRIMARY KEY (world_id, id)
mountain_peaks             → PRIMARY KEY (world_id, id)
world_constructions        → PRIMARY KEY (world_id, id)
```

Child table FK updates required:
```
structures              → REFERENCES sites(world_id, id)  ← PK becomes (world_id, site_id, id)
hf_links                → both hf_id and target_hf_id need (world_id, hf_id) refs
hf_entity_links         → hf_id needs (world_id, hf_id), entity_id needs (world_id, entity_id)
hf_site_links           → hf_id needs (world_id, hf_id), site_id needs (world_id, site_id)
collection_events       → both FKs need world_id prefix
collection_subcollections → both FKs need world_id prefix
event_relationships     → source_hf, target_hf need world_id
```

Explicit `world_id` on every table (denormalized) enables direct queries without JOINs and is consistent with existing schema pattern.

### New Schema Additions

#### Written Contents Schema (Phase 3.2)

```sql
CREATE TABLE IF NOT EXISTS written_contents (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    title       TEXT,
    author_hf_id INT,
    type        TEXT,
    form_id     INT,
    year        INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

#### Historical Eras Schema (Phase 3.3)

```sql
CREATE TABLE IF NOT EXISTS historical_eras (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,
    start_year  INT,
    end_year    INT,
    PRIMARY KEY (world_id, id)
);
```

#### lua_probes Cleanup Query (Phase 4.2)

```python
await conn.execute("""
    DELETE FROM lua_probes
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY world_id, probe_name
                ORDER BY captured_at DESC
            ) AS rn
            FROM lua_probes
        ) sub WHERE rn <= $1
    )
""", keep_count)  # e.g., keep_count=10
```

### Zone Location Resolution (Lua)

```lua
function resolve_location(unit)
    for _, bld in ipairs(df.global.world.buildings.all) do
        if bld:getType() == df.building_type.Civzone then
            if unit.pos.x >= bld.x1 and unit.pos.x <= bld.x2
               and unit.pos.y >= bld.y1 and unit.pos.y <= bld.y2
               and unit.pos.z == bld.z then
                return bld  -- zone type, name, assigned units
            end
        end
    end
    return nil  -- outdoors or unzoned area
end
```

### Citizenlist Scan Lua (df-ai Reference)

```lua
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

### Enriched Unit Data Model (Target JSON Format)

```json
{
    "id": 42,
    "name": "Urist McAxedwarf",
    "profession": "Axedwarf",
    "location": {
        "zone_type": "MeadHall",
        "zone_name": "the tavern",
        "pos": [45, 67, -3]
    },
    "emotions": [
        {
            "type": "GRIEF",
            "thought": "WitnessDeath",
            "cause": "Bomrek Hammerfist (HF #1234)",
            "strength": 80,
            "when": {"year": 253, "tick": 45000}
        }
    ],
    "mood": null,
    "flags": {
        "has_mood": false,
        "in_tantrum": false,
        "ghostly": false
    },
    "stress": 25000,
    "needs": ["alcohol", "social interaction"],
    "hist_fig_id": 5678
}
```

### War Name Resolution Query (Phase 2.4)

```sql
SELECT hec.name, hec.start_year, hec.end_year,
       a.name as attacker, d.name as defender
FROM history_event_collections hec
LEFT JOIN entities a ON hec.attacker_entity_id = a.id AND hec.world_id = a.world_id
LEFT JOIN entities d ON hec.defender_entity_id = d.id AND hec.world_id = d.world_id
WHERE hec.world_id = $1 AND hec.type = 'war'
ORDER BY hec.start_year DESC LIMIT 10
```

### Migration Execution Strategy (Phase 1.5)

No migration framework currently exists. Safe approach:
1. `pg_dump -Fc chronicler > chronicler-backup.dump`
2. Apply new schema.sql (DROP + CREATE).
3. Re-import all worlds from XML sources.
4. Verify record counts match pre-migration totals (adjusted for previously-lost records).

### Streaming XML Parser (from LegendsViewer-Next)

- Streaming `XmlReader` with `Async = true` — never loads entire file into DOM.
- `FilteredStream` wrapper: replaces all bytes < 32 with spaces before XML reader sees them (handles DF's raw control characters).
- Section dispatch map: top-level XML element names → Section enum (artifacts, entities, entity_populations, historical_eras, historical_event_collections, historical_events, historical_figures, regions, sites, underground_regions, world_constructions, poetic_forms, musical_forms, dance_forms, written_contents, landmasses, mountain_peaks, creature_raw, identities, rivers, historical_event_relationships, historical_event_relationship_supplements).

### Dual-File Merge (legends.xml + legends_plus.xml)

- `XmlPlusParser.AddNewPropertiesAsync()` merges by matching `id` fields.
- Plus parser runs ahead in a single sequential pass, not a second full pass.
- Entity-type-specific merge rules for: Entities, Artifacts, WrittenContent, Events.
- `HistoricalEventRelationShip` (plus-only event type) stored separately.

### Multi-Source Cross-Reference Post-Processing

After each XML section, run cross-reference resolution. Full post-processing pass after all parsing:
- `ProcessHFtoEntityLinks`, `ResolveEntityToEntityPopulation`, `ResolveHfToEntityPopulation`, `ResolveStructureProperties`, `ResolveSitePropertyOwners`, `ResolveHonorEntities`, `ResolveMountainPeakToRegionLinks`, `ResolveRegionProperties`, `ResolveArtifactProperties`, `ResolveArtformEventsProperties`, `ResolveEntityIsMainCiv`, `GenerateCivColors`, Beast HF heuristic resolution from sub-events, Era end year computation, Sub-collection linking to parent collections.

### O(1) Entity Lookup Optimization

- Sites: `Sites[id - 1].Id == id` fast path (1-indexed, generally contiguous).
- World grid: `Dictionary<Location, WorldRegion>` for O(1) coordinate-to-region lookup.
- Events: `BinarySearch` insertion requiring `IComparable<WorldEvent>`.
- Frontend Pinia stores cache loaded objects within session.
- Performance on large worlds requires careful ordering of cross-reference resolution (HF links before entity links, etc.).

### UI/UX Framework Patterns (from LegendsViewer-Next)

- **SPA framework**: Vuetify 3 (Material Design) + Vue 3 + Vue Router. `v-app-bar`, `v-navigation-drawer`, `v-main + v-container`, `<RouterView />` with lazy-loaded views.
- **Generic list page pattern** (`WorldObjectsPage.vue`): Header with icon/title/subtitle + DF Wiki button; instant-filter search; `v-data-table-server` with server-side pagination and sorting; total count badge.
- **Generic detail page pattern** (`WorldObjectPage.vue`): Prev/Next navigation FABs; large icon + name header; optional mini-map card; type-specific slots; ExpandableCard sections for Events (line chart + table), Chronicles (table).
- **ExpandableCard pattern**: compact-content default + expanded-content on toggle. Two sizes for Family Tree (360px / 720px).
- **REST API pattern**: Paginated GET endpoints per entity type. Response: `{ items: [...], totalCount: N }`. Images transmitted as base64 PNG strings in JSON.
- **Frontend data flow**: Pinia stores per entity type cache results within session. `v-data-table-server` drives server-side pagination.
- **8 navigation groups**: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals.

### Polling Timing Risk Matrix (Selected High-Risk Events)

| Event Category | Persistent? | Announcement? | Risk of Missing |
|----------------|-------------|---------------|-----------------|
| Marriage | YES (HF link) | YES | HIGH — no HF link tracking, announcement may overflow |
| Strange mood | YES (flag set) | YES | HIGH — now captured via flag extraction |
| Tantrum | TRANSIENT (flag) | YES | HIGH — flag now captured, announcement cursor prevents loss |
| Mandate issued | YES (mandate created) | YES | HIGH — now tracked via mandates section |
| Crime committed | YES (incident created) | YES | HIGH — now tracked via crimes section |
| Noble appointment | YES (position assigned) | YES | HIGH — no position tracking |
| Outside-world war event | YES (history event) | NO | HIGH — now captured via event cursor + payloads |
| Loyalty cascade | FAST TRANSIENT | YES (multiple) | HIGH — cascade causality still may be lost |
| Forgotten beast arrival | YES (unit appears) | YES | MEDIUM — detected as unit, type unclear |
| Intermediate states (berserk then dead in same poll) | N/A | YES | MEDIUM — both announcement and death captured, berserk snapshot missed |

---

## Completion Status

### Phase 0 — Data Integrity Hotfixes (Estimated: ~1 hour total)

| Item | Status | Effort |
|------|--------|--------|
| 0.1 Fix kill_count computation (BUG-005) | NOT DONE | LOW (5 lines) |
| 0.2 Add link table UNIQUE constraints (BUG-006) | NOT DONE | MEDIUM |
| 0.3 Fix region parsing scope (BUG-008) | NOT DONE | LOW (1 line) |

### Phase 1 — Composite PK Schema Migration (Estimated: 4-6 hours)

| Item | Status | Effort |
|------|--------|--------|
| 1.x Composite PK migration (BUG-007) | NOT DONE | HIGH |

### Phase 2 — Storyteller Enrichment (Estimated: 3-4 hours)

| Item | Status | Effort |
|------|--------|--------|
| 2.1 Relationship traversal in storyteller | NOT DONE | MEDIUM |
| 2.2 Event payload enrichment in storyteller | NOT DONE | MEDIUM |
| 2.3 Emotion/zone data in live unit queries | NOT DONE | MEDIUM |
| 2.4 War name resolution | NOT DONE | LOW |
| 2.5 Confidence signaling in prompts | NOT DONE | LOW |

### Phase 3 — XML Completeness (Estimated: 2-3 hours)

| Item | Status | Effort |
|------|--------|--------|
| 3.1 Verify / fix region parsing | NOT DONE | LOW |
| 3.2 Written contents table + parser | NOT DONE | MEDIUM |
| 3.3 Historical eras table + parser | NOT DONE | MEDIUM |
| 3.4 Entity populations parsing | NOT DONE | MEDIUM (optional) |
| 3.5 Art forms (poetic/musical/dance) | NOT DONE | LOW (only if written_contents reveals refs) |

### Phase 4 — Operational Hardening (Estimated: 4-6 hours)

| Item | Status | Effort |
|------|--------|--------|
| 4.1 Core test suite | NOT DONE | HIGH |
| 4.2 lua_probes cleanup | NOT DONE | LOW |
| 4.3 Bridge health monitoring | NOT DONE | LOW |
| 4.4 Migration framework | NOT DONE | MEDIUM (optional, pre-1.0) |

### Previously Completed Items

| Plan Item | Status | Evidence |
|-----------|--------|----------|
| T1-1: Report cursor tracking | DONE | `chronicler-bridge.lua:252` |
| T1-2: Unit flag extraction | DONE | `chronicler-bridge.lua:83` |
| T1-3: History event payloads | DONE | `chronicler-bridge.lua:337` |
| T1-4: History event cursor | DONE | `last_seen_event_id` global |
| T2-1: Emotion/thought capture | DONE | `chronicler-bridge.lua:522` |
| T2-2: Zone data capture | DONE | `chronicler-bridge.lua:574` |
| T2-4: Event collection capture | DONE | `chronicler-bridge.lua:630` |
| T3-1: Squads + mandates + crimes | DONE | Lines 704, 767, 813 |
| Phase 2: bridge.py accessors | DONE | `bridge.py` — 24 accessor functions |
| Phase 2: change detector expansion | DONE | `detector.py` — 11 event types |
| Phase 2: watcher bridge storage | DONE | `watcher.py:90-94` |
| Phase 3: live data retrieval | DONE | `context.py:392-553` — 5 functions + 23 keyword routes |
| Phase 3: system prompt update | DONE | `prompts.py` — dual-tier, 12,000 char budget |
| Phase 4: boolean flag fix (BUG-001) | DONE | `xml_parser.py:159-183` |
| Phase 4: site ownership (BUG-003) | DONE | `xml_parser.py:686-696` |

**Note**: Original plan was ~70% already implemented (15 of 22 items). Revised phases 0-4 replace the original phases 1-4 and should not be re-executed as written.

---

## Design Decisions & Rationale

- **Data integrity before features**: The revised plan inverts the original priority order. Composite PKs, kill_count fix, and link deduplication are done before any new features — everything else builds on potentially corrupt foundations without these fixes.
- **Explicit world_id on every table** (denormalized): Enables direct queries without JOINs. Consistent with existing pattern. Trade-off: more storage, but simpler queries.
- **Pre-resolved narrative-ready bridge data**: Bridge resolves IDs (HF names, zone names) inline in Lua rather than leaving resolution to the Python or LLM layer. LLM receives usable context without ID lookups.
- **Same ID space between legends and live data**: `world.history.events` is one vector. Legends XML and live fortress events use identical IDs. Enables unified `history_events` timeline table.
- **Append-only reports vector**: `world.status.reports` is NOT a ring buffer. Append-only with unique IDs enables cursor-based lossless capture.
- **lua_probes time-series vs. UPSERT tradeoff**: Keep INSERT-only (time-series history) if time-series analysis of fortress state is valuable, then add configurable archival; switch to UPSERT if only current snapshot is needed. Decision pending.
- **Multi-participant events**: Battles with 10+ participants currently lose data beyond first two HF IDs (stored in JSONB but not indexed). Design decision pending: JSONB array `participants` vs. junction table `event_participants`.
- **DFHack push-based hooks are long-term, not current**: EventManager callbacks eliminate polling blindspots for critical events but require persistent Lua plugin (significantly more complex than current `repeat` script model). Deferred to Tier 4 / long-term.
- **gamelog.txt as tertiary backup**: Lower priority than structured report capture. Valid for gap-filling only if bridge crashes and cursor is stale.
- **LLM hallucination control**: "Never fabricate facts that contradicting records" allows LLM to freely ADD details when records are silent. Confidence signaling (Phase 2.5) is designed mitigation.
- **Phase 3 XML completeness is independent of Phase 2**: XML parser changes don't depend on storyteller query changes; both depend on Phase 1 composite PK schema.
- **In-memory singleton (LegendsViewer-Next) vs. PostgreSQL (Chronicler)**: LegendsViewer-Next parses once, holds in memory, queries with LINQ. Works for single-world use. Chronicler's PostgreSQL approach offers persistence, cross-session queries, richer filtering at the cost of ETL complexity.
- **Control character filtering is mandatory**: Without FilteredStream-equivalent, DF XML import will throw on raw control character output. Must be implemented in Chronicler's XML ingestion pipeline.
- **115 event types from XMLParser.cs is authoritative**: This is the most complete available enumeration of all DF Legends XML event types. Chronicler's CDM event type enum should be derived from this list.
- **19 EventCollection types are distinct from 115 individual events**: Collections (war, beast attack, insurrection) contain many individual events. Both levels must be modeled in CDM and surfaced in UI.
- **Family tree depth limits are practical, not arbitrary**: DF dynastic trees extend thousands of years and generations. 3-ancestor limit per lineage prevents unusably slow or infinite rendering.
- **Civilization-colored visualization**: Consistent per-civilization colors across map, graph, and list views dramatically reduce cognitive load. Chronicler's visualization layer should adopt this pattern.
- **Event HTML rendering server-side unlocks rich UX cheaply**: Generating cross-linked HTML on the backend means frontend only needs `v-html` injection — no complex client-side relationship mapping.
- **Reactive control vs. goal planner**: df-ai's invariant-maintenance architecture is more robust than an explicit goal tree. Advisor recommendations should always be framed as "current deviation from desired state → corrective action."
- **Stock threshold per-capita scaling is essential**: `NeededPerDwarf` mechanism handles population scaling automatically. Thresholds valid for 20 dwarves are wrong for 150 dwarves.
- **Exclusive action serialization**: Never attempt concurrent multi-step game interactions. One active action chain at a time, queued FIFO.
- **DFHack TCP RPC is broken for game-thread calls on DFHack 53.x under Prism**: All live game-state access must go through `dfhack-run` over SSH. TCP RPC only works for cached calls (GetVersion, GetWorldInfo). This is confirmed environment behavior.
- **Blueprint JSON system enables repeatable fortress designs**: External JSON blueprints mean layouts are fully configurable without code changes. Players can define and share designs.
- **legends_plus.xml is transformative**: DFHack-generated plus file adds relationship data, extended fields, and event relationships that make the legends database dramatically richer. Must prioritize plus-file integration.
- **Breadcrumb/adjacent-ID navigation is essential for exploration**: Players navigating large datasets need prev/next controls — not just back buttons — to explore adjacent records, especially for event logs and HF lists.

---

## Reference Tool Feature Ideas

### From df-ai (Applicable to Chronicler)

1. **Tick-based advisory cadence** — mirror df-ai's multi-rate polling schedule (25/100/240/1200/403200 ticks) as Chronicler's live advisory refresh rates.
2. **10-phase population advisory cycle** — discrete advisory categories covering all fortress dimensions, each queried separately.
3. **Three-tier stock threshold model** — Needed, NeededPerDwarf, WatchStock, AlsoCount, with ~100 stock item categories; per-capita scaling.
4. **Room type taxonomy** — 22 canonical room types + 4-state lifecycle (plan/dig/dug/finished) as CDM schema.
5. **Priority-driven construction sequencing** — JSON-driven filter rules, survival-first ordering.
6. **Blueprint/floor plan system** — JSON fortress layout specs with room counts, tags, count_as, accesspath corridors. Player-definable and shareable.
7. **Military sizing advisor** — 25-75% of citizen count bounds, XP-sorted draft pool, squad/uniform configurations.
8. **Noble assignment advisor** — position filling, room value validation, conflict detection.
9. **Trade advisor** — caravan detection, broker routing, want_trader_item decision logic, 110% value balance enforcement, counter-offer handling.
10. **Farm management advisor** — biome-aware crop selection, season rotation, kitchen seed protection.
11. **Metalworking production chain advisor** — ore→bar→equipment chain, duplicate prevention, stall detection.
12. **Pet management advisor** — capability detection (milkable/shearable/trainable/egg-laying), pasture assignment, grass tracking.
13. **Occupation/location assignment** — tavern keeper, performer, scholar role assignment to residents.
14. **Justice and crime monitoring** — crime detection, punishment tracking, tantrum spiral prevention.
15. **Fortress loss detection + post-mortem narrative** — viewscreen text monitoring, state snapshot preservation.
16. **Job stall detection and unsuspend** — non-repeating suspended job scanning, stall reporting, auto-fix via DFHack.
17. **DF Bug workarounds** — Baby reunification (Bug 5551) as template for encoding known DF bug compensations.
18. **Ore vein discovery advisor** — `list_map_veins()` scanning, shaft routing recommendation.
19. **Cistern and water supply advisor** — cistern construction workflow, fill level monitoring.
20. **LLM action chain executor** — exclusive serialized action chains, FIFO queue, step-by-step confirmation.
21. **Reactive control philosophy** — "current state deviates from desired state by X — corrective action is Y" framing for all advisory output.
22. **Manager order stall detection** — detect `validated`-state stall, trim quantity periodically.
23. **CHEAT fallback pattern** — if search filter returns no matching orders, force-overwrite first order (log as CHEAT for auditing).

### From LegendsViewer-Next (Applicable to Chronicler)

1. **Interactive world map** — Leaflet.js L.CRS.Simple with DF Y-axis coordinate formula, civilization-colored site markers, 8 marker shapes by site type, layer group toggles, zoom -2 to +2.
2. **Civilization color system** — HSV rotation (medium/lighter/darker for batches of 6 races), applied consistently across map + graph + lists.
3. **Population charts** — doughnut charts for race distribution and area; line chart for events per year; bar chart for event type distribution. vue-chartjs / Chart.js.
4. **World summary dashboard** — thumbnail map, charts, active/lost civilizations, events, chronicles, heroic ties.
5. **Historical figure detail pages** — complete biography: birth/death, skills, relationships, positions, kills, artifacts, battles, intrigue, curses, breed tracking.
6. **Family tree visualization** — Cytoscape.js dagre, 3-ancestor depth limit, visual class system (dead/male/female/leader/necromancer/vampire/werebeast/ghost), two sizes via ExpandableCard.
7. **Warfare graph** — Cytoscape.js cola force-directed, civilization and battle nodes, edge widths proportional to battle size, tippy tooltips, click-navigate.
8. **Per-entity event timeline + type distribution charts** — line chart (events/year) + bar chart (event type counts) on every detail page.
9. **Complete 70-route world browser** — 35 list + 35 detail views for all entity types, 8 navigation groups.
10. **Site detail pages with full history** — 22 site types, untranslated names, structures, owner history, event collection access.
11. **Entity/civilization detail pages** — 11 entity types, noble hierarchy, population, military history, diplomatic relationships, embedded warfare graph.
12. **Cross-linked hypertext event narratives** — server-side HTML anchor generation (`HtmlStyleUtil.GetAnchorString()`), `v-html` injection, every name clickable.
13. **Complete 115+ event type coverage** — all event types and 19 collection types parsed and rendered; no "unknown event" fallback.
14. **Multi-world bookmark system** — file-based bookmarks with thumbnail, metadata, timestamp selector, "explore a new world" card.
15. **Written content, art forms, cultural output browser** — books/scrolls with authors, poetic/musical/dance form detail pages, bidirectional HF cross-links.
16. **Paginated server-side search API** — instant-filter text field, v-data-table-server, sortKey/sortOrder params, count badge, DF Wiki button.
17. **Heroic ties / player character tracking** — `PlayerRelatedObjects`, `Adventurer` flag, personalized world entry point.
18. **Historical eras browser** — era list + detail, end year computation from next era's start, event assignment to eras.
19. **False identity / vampire tracking** — Identity entity type, assume identity / impersonate hf events, LineageCurseParent vampire sire chain.
20. **Streaming XML parser** — `XmlReader Async=true`, FilteredStream control character sanitization, async parse loop.
21. **Dual-file merge (legends.xml + legends_plus.xml)** — single sequential plus-parser pass merging by id, entity-type-specific merge rules.
22. **Multi-source cross-reference post-processing** — 15 resolution passes after all sections parsed, targeted resolution after each section.
23. **O(1) entity lookup optimization** — fast path for contiguous 1-indexed sites, Dictionary for grid, BinarySearch for events.
24. **Generic list + detail page component patterns** — consistent search/sort/paginate UX across all entity types, ExpandableCard for charts and trees.
25. **Breadcrumb/adjacent-ID navigation FABs** — prev/next floating action buttons on all detail pages.
26. **DF Wiki integration button** — per entity type on list pages.
27. **Sites-and-populations file parser** — separate population demographics file; civilized/outdoor/underground/site populations.
28. **History text file parser** — `.txt` narrative file supplement to XML data.

---

## Open Questions & Gaps

### Verification Needed

| Assumption | Verification Method |
|-----------|---------------------|
| `event_type = 'hf died'` matches DF XML output | Check actual XML event type text values |
| Region parsing captures spurious elements | Grep XML for `<region>` tags outside `<regions>` section |
| World 2 has ~28K HFs (5,466 lost = 19.5%) | Re-import World 2 in isolation and count |
| Written contents exist in our legends_plus XML | Check XML file for `<written_contents>` section |
| Kill count fix + re-computation is sufficient | Verify no cached/derived data depends on old kill_count values |
| Current xml_parser.py handles control characters | Check for FilteredStream-equivalent in ingestion pipeline |

### Unresolved Design Decisions

- **lua_probes time-series vs. UPSERT**: Keep INSERT-only for time-series history, or UPSERT for current-snapshot-only? Configurable archival option (keep all last 24 hours, then hourly for older)?
- **Multi-participant events**: JSONB array `participants` on history_events row, or separate `event_participants` junction table?
- **DFHack TCP RPC vs. dfhack-run over SSH for future expansion**: RPC is broken for game-thread calls on 53.x under Prism — is this expected to be fixed upstream, or is SSH-based `dfhack-run` the permanent transport?
- **Manager order search with no results — CHEAT fallback**: Should Chronicler's advisor adopt a "CHEAT fallback" (force-overwrite first order with logging) or fail gracefully with a user alert?
- **Integration of df-ai heuristics as LLM system prompt content vs. compiled rules**: df-ai encodes expertise in deterministic C++ logic; Chronicler can either hardcode the same heuristics as rules in the advisor logic, OR include the heuristics as natural language in the LLM system prompt. Best approach for each category TBD.
- **Observatory / Player Character distinction**: "Heroic Ties" concept from LegendsViewer-Next presupposes distinguishing player-associated objects. How does Chronicler determine which HFs are "player-related" in the database?
- **Map generation**: Use DF-exported `.bmp` if present vs. SkiaSharp/Pillow/equivalent programmatic generation from `regions` data? What map generation library for Python backend?
- **Frontend framework**: LegendsViewer-Next uses Vue 3 + Vuetify 3. Confirm that Chronicler's planned frontend matches, or decide on alternatives (React + MUI, etc.).
- **Event collection sub-events in Storyteller retrieval**: Currently `event_collections` are retrieved separately. Should the Storyteller join to individual `history_events` within a collection for richer context?

### Gaps in Current Data Capture

- No position/noble tracking in live bridge (noble appointment events not captured as bridge data, only via history event cursor).
- No HF link tracking in live bridge (marriage events not tracked as bridge data, only via history event cursor).
- `world.activities` not captured (parties, performances, scholarly work, training).
- `world.written_contents.all` in live bridge not captured.
- `world.jobs.list` not captured (workshop orders, construction tasks).
- Individual building footprints not captured (only type-count distribution).
- Corpse spatial data not captured.
- Full personality memories and preferences vectors not captured.
- Loyalty cascade causality may still be lost even with cursor-based announcement capture.
- Intermediate states (berserk dwarf who dies within one poll window) still missable — requires DFHack EventManager for full coverage.

### Historical Figure Sub-Profile Data Not Yet Extracted

All sub-profile fields listed in the "Historical Figure Sub-Profiles" section above remain unextracted from Legends XML. This data is structurally available in the XML but no parser code exists to capture it.

---

## Metrics & Targets

- **Current data capture coverage**: ~15-20% of available DF data.
- **DF data dimensions**: 93 top-level `df.global.world` fields, 141 history event types, 250+ announcement types, 100+ unit fields per dwarf.
- **Bridge sections**: v6 with 16 data domains.
- **Legends XML sections parsed**: 8 of 14+ top-level sections (target: 12+).
- **World 1 historical figures**: 26,917 records.
- **World 2 historical figures**: ~28,383 expected; 5,466 lost to PK collision (19.5%) under current schema.
- **Sites**: 1,899 total; 1,145/1,899 World 2 sites have owner_entity_id (60%); 754 still NULL.
- **Total historical figures (both worlds)**: 55,321 (with current data loss).
- **Storyteller context budget**: 12,000 characters.
- **Live data retrieval paths**: 5 functions + 23 keyword routes.
- **Change detector event types**: 11 total.
- **lua_probes growth rate**: 32 rows/minute, 1,920/hour, 46,080/day at 30-second poll interval with 16 sections.
- **Bridge v6 line count**: 922 lines (Lua).
- **xml_parser.py line count**: 733 lines.
- **context.py line count**: 723 lines.
- **watcher.py line count**: 355 lines.
- **detector.py line count**: 246 lines.
- **bridge.py line count**: 308 lines (24 accessor functions).
- **schema.sql line count**: 378 lines.
- **Phase 0 estimated effort**: ~1 hour total.
- **Phase 1 (composite PKs) estimated effort**: 4-6 hours.
- **Phase 2 (storyteller enrichment) estimated effort**: 3-4 hours.
- **Phase 3 (XML completeness) estimated effort**: 2-3 hours.
- **Phase 4 (operational hardening) estimated effort**: 4-6 hours.
- **Minimum test coverage goal**: 5 test files covering parser, context, schema, detector, bridge accessor.
- **kill_count fix effort**: ~5 lines, 1-line change to group-by target.
- **LegendsViewer-Next event type count**: 115 WorldEvent types + 19 EventCollection types (canonical authoritative reference).
- **LegendsViewer-Next route count**: 70 routes (35 list + 35 detail).

---

## Key File Paths

| Component | Path |
|-----------|------|
| Lua bridge (v6, 922 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` |
| XML parser (733 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` |
| Context retriever (723 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` |
| System prompts (93 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py` |
| Watcher (355 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py` |
| Change detector (246 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py` |
| Bridge accessor (308 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/bridge.py` |
| DB schema (378 lines) | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` |
| RPC client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py` |
| Sync | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py` |
| LLM client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/llm.py` |
| API routes | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/storyteller.py` |
| Config | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` |
| Deploy bridge | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/experiments/deploy-bridge.py` |
| DF structures reference | `/Users/nathanielcannon/Claude/GitRepos/df-structures/` |
| Source: gap analysis | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/data-gap-analysis-2026-02-22.md` |
| Source: gap closure review | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/gap-closure-critical-review.md` |
| Source: df-ai research | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/df-ai-research.md` |
| Source: LegendsViewer-Next research | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/legendsviewer-next-research.md` |
| HomeServer | `192.168.4.194` (HTTP: 8888, DFHack RPC: 5000) |
| UTM VM | `192.168.64.3` (DF-Windows, Win11 ARM) |

---

## Appendix A: Complete DF Event Type Reference

### 115 WorldEvent Types (canonical from LegendsViewer-Next XMLParser.cs:408-888)

**HF Links**: add hf entity link, add hf hf link, add hf site link, remove hf entity link, remove hf hf link, remove hf site link, add hf entity honor.

**HF State**: change hf job, change hf state, change hf body state, changed creature type, hf died, hf wounded, hf revived, hf reach summit.

**HF Actions**: hf abducted, hf new pet, hf reunion, hf simple battle event, hf travel, hf profaned structure, hf disturbed structure, hf destroyed site, hf attacked site, hf razed structure, hf rampaged in site (via entity), hf preach, hf prayed inside structure, hf viewed artifact, hf asked about artifact, hf carouse.

**HF Intrigue**: hf confronted, assume identity, impersonate hf, hf gains secret goal, hf learns secret, hf does interaction, hf performed horrible experiments, hfs formed intrigue relationship, hfs formed reputation relationship, failed frame attempt, failed intrigue corruption, hf convicted, hf interrogated, entity primary criminals.

**HF Fate**: hf freed, hf enslaved, hf ransomed, hf relationship denied, hf recruited unit type for entity.

**Site Events**: created site, destroyed site, attacked site, plundered site, reclaim site, site abandoned, site died, site dispute, site taken over, site tribute forced, site surrendered, site retired.

**Entity Events**: entity created, entity dissolved, entity law, entity relocate, entity rampaged in site, entity fled site, entity expels hf, entity persecuted, entity searched site, entity alliance formed, entity overthrown, entity incorporated, entity breach feature layer, entity equipment purchase.

**Artifact**: artifact created, artifact destroyed, artifact stored, artifact possessed, artifact lost, artifact given, artifact claim formed, artifact copied, artifact recovered, artifact found, artifact transformed.

**Masterpiece**: masterpiece arch design, masterpiece arch constructed, masterpiece engraving, masterpiece food, masterpiece lost, masterpiece item, masterpiece item improvement, masterpiece dye.

**Diplomatic**: peace accepted, peace rejected, agreement made, agreement rejected, agreement formed, agreement concluded, agreement void, diplomat lost, first contact, site tribute forced.

**Construction**: created structure, created world construction, replaced structure, razed structure, new site leader, modified building, building profile acquired.

**Cultural/Civic**: poetic form created, musical form created, dance form created, written content composed, knowledge discovered, holy city declaration, regionpop incorporated into entity, create entity position.

**Tactical**: field battle, tactical situation, squad vs squad.

**Special**: sneak into site, spotted leaving site, item stolen, creature devoured, body abused, merchant, gamble, trade, hf equipment purchase, procession, ceremony, performance, competition, sabotage, insurrection started.

**Relationships (plus-XML only)**: HistoricalEventRelationShip — stored in World.SpecialEventsById.

### 19 EventCollection Types

**Warfare**: battle, war, duel, raid, site conquered.

**Political**: insurrection, persecution, purge, entity overthrown (coup).

**Calamities**: beast attack, abduction, theft.

**Rituals**: occasion, procession, ceremony, performance, competition.

**Travel**: journey.

---

## Appendix B: df-ai Subsystem Timing Reference

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

## Appendix C: LegendsViewer-Next Entity Data Model Summary

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
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/tmp/round1-pair-09.md` (Data Gap Analysis + Gap Closure Review consolidation, 2026-02-24)
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/tmp/round1-pair-10.md` (df-ai + LegendsViewer-Next Research consolidation, 2026-02-24)
*Round 2 consolidation date: 2026-02-24*
