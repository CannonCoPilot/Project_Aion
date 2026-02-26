# Round 3 Consolidation: Data Quality, External Tools & Ecosystem Research

**Sources**:
- `round2-pair-05.md`: Data Quality Analysis & Reference Tool Research (consolidation of data-gap-analysis, gap-closure-critical-review, df-ai-research, legendsviewer-next-research)
- `round2-pair-06.md`: External Tools & Ecosystem Research (consolidation of df-narrator, weblegends, LegendsBrowser v1/v2, dfhack-client-python, DwarfFortressLogger, df-structures, myDFHackScripts, DwarvenSurveyor, DF-Modloader, ModHearth, PyLNP, PyDwarf, NexusMods/Vortex)
**Consolidation date**: 2026-02-25

---

## Complete Feature Inventory

### AI Dwarf Fortress Storyteller

- **Core persona**: Speaks as "The Chronicler" with gravitas. Never fabricates facts that contradict records. Says "The annals hold no record" rather than inventing. LLM hallucination is controlled through strict persona, not suppressed — the LLM may freely add narrative color when records are silent.
- **Dual-tier context architecture**: System prompt distinguishes HISTORICAL (Legends XML) from LIVE (bridge) data. Context budget: 12,000 characters.
- **Contextual reconstruction**: Full narrative derived from sparse structured data: emotion type → cause (subthought HF_ID) → corpse record → zone bounds → death history event = "Urist McAxedwarf was horrified after witnessing the corpse of Bomrek Hammerfist lying in the tavern. Bomrek had been killed by the goblin Snodub Evilteeth during the siege of year 253."
- **Pre-resolved narrative-ready bridge data**: Bridge resolves raw IDs and coordinates into names and zone names in Lua before delivering to LLM. LLM receives usable context without requiring downstream ID lookups.
- **Confidence signaling** (Phase 2.5): Count context records and characters at retrieval time. If sparse (< 3 records or < 500 chars), prepend "Context is limited — note uncertainty." If rich (> 10 records), prepend "Rich context available — synthesize comprehensively." STATUS: NOT YET DONE.
- **Cross-linked event narratives**: Every event sentence has clickable hyperlinks for each named entity. Backend generates HTML anchors via `WorldObject.ToLink()` / `HtmlStyleUtil.GetAnchorString()`. Frontend injects via `<span v-html="...">`. Pattern: `<a href="/{entityType}/{id}" title="{tooltip}">{icon}{displayName}</a>`.
- **Template-based vs. LLM-based rendering**: df-narrator, weblegends, and LegendsBrowser all use deterministic string templates. Chronicler's unique advantage is the ability to use LLM generation to produce richer, non-repetitive narrative prose. Templates remain as a fast fallback and training scaffolding.
- **Context-aware self-reference suppression**: The weblegends `event_context` pattern (suppressing links/full names when the referenced entity is the current page's subject) prevents narrative from being flooded with redundant constructions. Must be implemented in Chronicler's narrative layer.
- **Missing event fallback**: If no handler exists for a given event type, fall back to DF's own `getSentence()` method (via DFHack) wrapped in an accessible container with the event type/ID noted.

### Storyteller Retrieval Architecture

- **Current retrieval pipeline**: keyword extraction (stop-word filter, 200+ words, no NLP) → categorical routing (_CATEGORY_ROUTES, 23 keyword routes) → ILIKE name search (limit 5 per table) → fallback `_world_overview()` → `format_context` (12,000 char budget) → `build_messages` → LLM (Qwen3 8B via LiteLLM, temp 0.8, max 2048 tokens). STATUS: DONE.
- **Live data retrieval paths** (5 implemented): units table, unit_events, game_reports, lua_probes snapshots (armies, diplomacy, announcements), plus JOIN of units.hist_fig_id to historical_figures. STATUS: DONE.
- **Categorical routes (23)**: "deity" → historical_figures WHERE is_deity=TRUE; "dragon" → historical_figures WHERE race LIKE 'DRAGON%'; "civilization" → entities WHERE type='civilization'; "war"/"battle" → history_event_collections WHERE type=... STATUS: DONE.
- **Relationship traversal** (Phase 2.1): When HF matched by name, also query hf_links (spouse, children, parents, master/apprentice), hf_entity_links (civilization memberships, position titles), hf_site_links (residences, lairs, associated sites). STATUS: NOT YET DONE.
- **Event payload enrichment** (Phase 2.2): JOIN history_events to historical_figures and sites to resolve IDs into names inline. Produces "Bomrek was slain by Urist at Goldenhall in year 253." STATUS: NOT YET DONE.
- **Emotion and zone data in live unit queries** (Phase 2.3): Enhance `_retrieve_live_units()` to pull emotion data from latest `dwarf_emotions` probe and resolve unit positions to zone names from latest `zones` probe. STATUS: NOT YET DONE.
- **War name resolution** (Phase 2.4): JOIN attacker_entity_id and defender_entity_id to `entities.name` in war/battle collection queries. STATUS: NOT YET DONE.
- **pgvector / embedding-based retrieval** (long-term, T4-5): `embeddings` table and pgvector infrastructure exist but unused. All current retrieval is keyword-based. Long-term: wire up for semantic search.
- **Event collection sub-events in Storyteller**: Currently `event_collections` are retrieved separately. Should the Storyteller join to individual `history_events` within a collection for richer context? (Design decision pending.)

### Entity Importance Scoring (df-narrator canonical)

All scoring formulas represent accumulated community knowledge and should become Chronicler's canonical "importance" ranking. They drive "Featured"/"Notable" UI badges, AI storyteller prioritization, and narrative focus selection.

**Figure Importance Score**:
- Events: `min(event_count * 2, 500)` — events dominate (cap 500 pts)
- Kills: `kill_count * 15`
- VAMPIRE active_interaction: +80
- NECROMANCER/RAISE active_interaction: +100
- DEITY associated_type: +120
- FORCE associated_type: +90
- MEGABEAST race (DRAGON, HYDRA, COLOSSUS_BRONZE, CYCLOPS, ETTIN, GIANT, ROC, TITAN): +70
- HF-to-HF relationships: `min(hf_link_count * 3, 100)`
- Leadership positions (position/former_position/position_claim entity links): `count * 20` (uncapped)
- Artifacts held: `artifact_count * 30`
- Deity spheres: `sphere_count * 10`
- Skills: `min(skill_count * 2 + max_ip // 5000, 80)`
- Site associations: `min(site_link_count * 5, 50)`
- Entity links: `min(entity_link_count * 3, 60)`
- Death recorded: +5
- Note: position-type entity links may double-count (both the ×20 uncapped and ×3 capped bonus)

**Site Importance Score**:
- `event_count + (death_count * 2) + (event_collection_count * 5) + (structure_count * 3)`
- Deaths are double-weighted; collections (wars, sieges touching site) are 5x

**Conflict Importance Score**:
- `(deaths * 3) + (battle_count * 10) + (sites_involved * 5) + duration_years`
- Battle count is the dominant factor

**Artifact Importance Score**:
- `(events * 10) + (unique_holders * 20) + 30 if lost/stolen + 50 if named`
- Unnamed artifacts with no events score 0 and should be excluded entirely
- Named artifacts are heavily prioritized

**Rivalry Detection (co-appearance)**:
- Scan all events mentioning a figure's hfid; count co-appearances of other figure IDs
- Use HF_FIELDS set to identify all HF-referencing fields in each event
- Compute top-10 rivals per figure; overlay formal relationship type if it exists
- Output: rival pairs with co-appearance count and relationship label
- Lightweight but effective narrative technique that surfaces meaningful figure pairs without requiring explicit relationship links

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
- Personality: traits (50 values), values (32 values), beliefs, goals, mannerisms (70+ types), ethics (type + response), thought history (80+ categories).
- Whereabouts: last known location, body state (buried/unburied), abs_smm_x/y (strategic map coords).
- Reputation: criminal records, exile flags, entity reputation scores (hero, murderer, psychopath, enemy fighter, friendly fighter, killer, poet, bard, dancer, storyteller, treasure hunter, preacher, brigand, intruder, monster, thief).
- Known secrets: supernatural knowledge, read books. Known written contents, known identities, known witness reports, known events, creature knowledge, known poetic/musical/dance forms, belief systems, known locations.
- Life goal.
- Active interactions: VAMPIRE, WEREBEAST, SECRET_* curses.
- Lineage curse parent (vampire sire lineage).
- BreedId for unique creature tracking.
- `Adventurer` flag.
- Current geographic state (HfState).
- Notable Kills (other named HFs killed).
- Dedicated structures (temples dedicated to this HF).
- Intrigue actors and intrigue plots.
- Reputation profiles and relationship profiles (plus-mode only).
- VagueRelationships (plus-mode only).
- Orientation flags (from DFHack `hf.orientation_flags`).
- Curse year and curse seconds.
- Worldgen flags: `worldgen_acted`, `brag_on_kill`, `kill_quest`, `chatworthy`.
- Journey pets list.
- Masterpieces: creation events, art image chunks.
- Metaphysical: spheres, appearance, deity form.
- Relationships: hf_visual (current active), hf_historical (past), intrigues.

#### HF Link Types (complete set)

Mother, Father, Child, Deity, Spouse, Companion, Prisoner, Master, Apprentice, Lover, Buddy, Grudge, Former_Spouse, Deceased_Spouse, Pet_Owner. Plus worldgen-only quick relationships: childhood_friend, war_buddy, jealous_obsession, former_lover, scholar_buddy, artistic_buddy, athlete_buddy, athletic_rival, business_rival, religious_persecution_grudge, lieutenant, worshipped_deity, ex_spouse, neighbor, shared_entity.

Deity worship strength: dubious <10, casual <25, average <75, faithful <90, ardent ≥90.

#### Additional Legends Data Targets

- **Written Contents** (books, poems, scrolls, treatises): title, author HF ID, year composed, type, subject matter, referenced art forms, form (poem, short_story, musical_composition, choreography, etc.), references, styles, page count, contained written content link for books/scrolls. Storytelling value: HIGH ("Urist composed 'The Ballad of the Flaming Hammers' in year 237"). Phase 3.2.
- **Historical Eras**: name, type, start/end year. Enables temporal context ("During the Age of Myths (years 1-200)..."). Era end years computed from following era's start year. Phase 3.3.
- **Regions and underground regions**: geographic context for events and narratives. Terrain types (10 values): wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains. Evilness coding (good/evil/neutral). Phase 3.1.
- **World constructions**: bridges, roads, tunnels, and other constructed geographic features. Name, type, coords, map marker, full event history.
- **Entity populations**: civilized, outdoor, and underground population demographics. Phase 3.4 (optional).
- **Art forms**: poetic forms, musical forms, dance forms. Phase 3.5 (lowest priority — only if written_contents reveals refs).
- **Rivers**: geographic data, currently unparsed. List of paths, map rendering.
- **Creature raw**: raw creature definitions, currently unparsed.
- **Structures within sites**: temples, libraries, keeps — name, type, ruin status. Types: mead_hall, keep, temple (of specific deity), dark_tower, market, tomb (of specific HF), dungeon/sewers/catacombs, underworld_spire, tavern, library, counting_house, guildhall, tower, monastery, castle.
- **Site properties**: individual parcels within sites (`SiteProperties`), owner HF, type, linked structure.
- **Owner history per site**: list of `OwnerPeriod` records (who owned from when to when). 1,145/1,899 World 2 sites currently have `owner_entity_id`; 754 still NULL.
- **22 site types**: Fortress, Hillocks, MountainHalls, ForestRetreat, Hamlet, Town, Castle, DarkPits, DarkFortress, Monastery, Fort, Tomb, MysteriousLair, MysteriousDungeon, MysteriousPalace, Cave, Lair, Vault, Labyrinth, Shrine, Tower, Camp, ImportantLocation.
- **11 entity types**: Civilization, NomadicGroup, SemiMegaBeast, MegaBeast, PerformanceTroupe, MercenaryCompany, Militia, Religion, Guild, Outcast, Unknown.
- **Entity positions and assignments**: noble titles + holders, full historical record, sex-specific titles, squad if applicable, linked site if land-holder.
- **Entity occasions**: ceremonial events with schedule.
- **Entity honors**: entity honor definitions.
- **Entity-entity links**: parent/child faction hierarchy.
- **Entity reputations and entity-to-entity links**.
- **Untranslated site names**: Dwarvish/Elvish original names alongside translated names.
- **115+ WorldEvent types** (canonical list from LegendsViewer-Next XMLParser.cs:408-888; see complete reference in Appendix A).
- **19 EventCollection types** (canonical list; see Appendix A).
- **Landmasses**: name, coordinate bounds, map highlight.
- **Mountain peaks**: name, coords, volcano flag, map marker.
- **Identities (false identities)**: name, profession, entity link, used-by HF.
- **Sites-and-populations file**: `SitePopulations`, `CivilizedPopulations`, `OutdoorPopulations`, `UndergroundPopulations`. Separate from XML export.
- **History text file**: `world_history.txt` — leader/succession data, narrative detail supplementing XML data.
- **World gen params file**: `world_gen_param.txt` — world dimensions.

### Live Bridge Data Capture (chronicler-bridge.lua)

- **Currently captured (v6, 16 sections)**: game_time, creature_raws, unit_summary (12 fields + flags + mood + emotions), armies (capped 50), buildings (count + type distribution), artifacts (capped 200), announcements (cursor-based, capped 200/tick), diplomacy, history (cursor-based, capped 100/tick, with payloads), world_info, entities (capped 100), dwarf_skills, dwarf_emotions (10 most recent per dwarf), zones (civzones with bounds, up to 200), event_collections (last 50), squads, mandates, crimes. STATUS: DONE.
- **Bridge v6 line count**: 922 lines (Lua).

#### Unit Data Still Not Captured

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
- **gamelog.txt as backup/validation**: Plain-text accessible via HTTP at `curl http://192.168.4.194:8888/gamelog.txt`. No structured metadata. Tertiary backup only.

### Psychology / Emotion Capture

- **Emotion/thought capture** (T2-1): Per-dwarf `emotions[]` vector. Each emotion: type (ANGER, FEAR, JOY, GRIEF, etc.), thought type (200+ unit_thought_type values), subthought (ID reference to specific HF/event as cause), strength, relative_strength, severity, year, year_tick, flags (was_dream_goal, vocalized). Captures 10 most recent per dwarf. STATUS: DONE.
- **Emotional subthought linkage**: The `subthought` field directly links an emotion to its specific cause — key to contextual reconstruction.
- **Unit flags** (T1-2): `has_mood`, `mood` (enum: Fey, Possessed, Macabre, Berserk, Melancholy), `in_tantrum`, `ghostly`, `active_invader`, `pregnancy_timer`, `pregnancy_spouse`, `emotionally_overloaded`. STATUS: DONE.
- **Change detector events**: MOOD_CHANGED, MOOD_RESOLVED, GHOST, PREGNANCY_DETECTED, STRESS_SPIKE. 11 event types total across core and bridge paths. STATUS: DONE.
- **Needs vector**: Unmet psychological needs (alcohol, social interaction, etc.). Currently captured in unit_summary as resolved text. Full vector not yet captured.
- **128-bit unit flags across 4 bitfields**: has_mood (flags1), active_invader (flags1), merchant (flags1), diplomat (flags1), caged (flags1), killed/inactive (flags1/2), drowning (flags2), emotionally_overloaded (flags2), announce_titan (flags2), ghostly (flags3), in_tantrum (flags3).

### Real-Time DFHack Event Subscriptions (Push-Based)

- **Death event handler with cause lookup**: Subscribe to `eventful.onUnitDeath` and immediately look up the death incident in `df.global.world.incidents.all` to get `death_cause` (enum `death_type`) and `criminal` (killer unit ID).
- **Item creation tracking**: Subscribe to `eventful.onItemCreated` with sensitivity level 1. Detect artifact creation via `item.flags.artifact`. Log item description via `dfhack.items.getDescription(item, 0)` and material via `dfhack.matinfo.decode(item)`.
- **Job completion logging**: Subscribe to `eventful.onJobCompleted` for production event tracking.
- **Invasion tracking**: Subscribe to `eventful.onInvasion` for tactical alert generation.
- **Syndrome/curse tracking**: Subscribe to `eventful.SYNDROME` for transformation, curse, and disease detection on units.
- **Inventory change tracking**: Subscribe to `eventful.INVENTORY_CHANGE` for artifact movement and equipment tracking — more efficient than polling `items.all`.
- **Live unit arrival detection**: Subscribe to `eventful.UNIT_NEW_ACTIVE` for real-time arrival detection.
- **Book/written content detection**: Poll `df.global.world.items.all` with book filter — `dfhack.items.getBookTitle(item)` to detect newly created literary works.
- **Agreement/petition monitoring**: Poll `df.global.world.agreements.all`.
- **Announcement/report polling**: Poll `df.global.world.status.reports` on configurable tick interval (500 ticks recommended).
- **DFHack event callbacks**: `dfhack.onStateChange` for game state transitions; `EventManager` for specific event type callbacks (UNIT_DEATH, CONSTRUCTION, etc.). Push-based, no polling gap.
- **DFHack push-based hooks are long-term for critical events**: EventManager callbacks eliminate polling blindspots for deaths/mood starts/sieges but require persistent Lua plugin (significantly more complex than current `repeat` script model). Deferred to Tier 4.

All available eventful event types:
`TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE, UNIT_DEATH, ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION, INVENTORY_CHANGE, REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX`
Note: `REPORT` is best handled via polling, not event subscription.

### Live Unit & Character Data Collection (DFHack)

- **Live unit watcher**: Subscribe to `eventful.UNIT_NEW_ACTIVE` for real-time arrival detection of dwarves, migrants, and creatures entering the fortress area.
- **Citizen roster tracker**: Poll `df.global.world.units.active` (filtered by `dfhack.units.isCitizen()`) at configurable intervals (500 ticks ~ 12 seconds at normal speed) to detect roster changes and trigger DB sync.
- **Unit metadata extraction**: For every unit, automatically capture race, age, sex, readable name, visible name.
- **Unit soul data extractor**: Extract from `unit_soul` the complete skill set (job_skill enum + experience int32), preferences, personality, and performance skills (musical instruments, poetic forms, musical forms, dance forms).
- **Soul personality snapshot**: Capture `unit_personality` including mannerisms (70+ distinct behaviors), values (type + strength), ethics (ethic + response), and thought history (unit_thought_type, 80+ categories).

### World History Monitoring (DFHack)

- **World history container access**: Read from `df.global.world.history` to access `events`, `events_death`, `relationship_events` (v0.47+), `figures`, `event_collections` (18 typed subcategories), `eras`, `intrigues` (v0.47+), and classified HF lists (`hf_artists`, `hf_poets`, `hf_bards`, `hf_dancers`, `hf_scholars`, `hf_heros`, `hf_religious`, `hf_merchant`, `hf_teachers` [index 11 = necromancers]).
- **Live megabeast tracker**: Monitor `world.history.live_megabeasts`, `live_semimegabeasts`, `hf_allbeasts` for crisis events.
- **Era transition detection**: Poll `df.global.world.history.eras` to detect era boundary crossings during worldgen and play.
- **Worldgen real-time monitoring**: During worldgen, poll `df.global.world.history.figures` and `df.global.world.history.events` as they are being built in real-time. Track `era_determinerst` fields: `living_powers`, `living_megabeasts`, `living_semimegabeasts`, `civilized_races`, `civilized_total`, `civilized_mundane`. Flag HFs with `worldgen_acted` flag.

### Spatial / Zone Resolution

- **Zone capture** (T2-2): All `building_civzonest` entries with type, x1/y1/x2/y2/z bounds, names, up to 200. STATUS: DONE.
- **Zone type → human-readable name mapping**: MeadHall→"the tavern", Temple→"the temple", Bedroom→"their bedroom", DiningHall→"the dining hall", Barracks→"the barracks", Tomb→"the catacombs", Dungeon→"the dungeon", Office→"the office", Library→"the library", NobleQuarters, Shop, Guildhall, Kitchen, CaptiveRoom, ThroneRoom, Depot.
- **"Whose dead body?" full reconstruction chain**: Emotion (WitnessDeath + subthought HF_ID) → corpse location (item_corpse.pos where hist_figure_id matches) → room context (zone bounds match) → observer location (unit.pos at time of emotion) → death event (history_events where event_type = HIST_FIGURE_DIED and hf_id_1 = HF_ID).

### World History & Demographics Visualizer

#### Interactive World Map (Leaflet.js)

- Library: Leaflet.js 1.9.4 with `L.CRS.Simple` (no geographic projection needed).
- Map image generation: SkiaSharp PNG from world region data; three cached sizes (thumb/default/large). Use DF-exported `.bmp` map file if present, otherwise generate from `RegionTypeColors.BaseRegionColors`.
- **Coordinate system**: Y-axis inverted, scaled by tile size: `[(height - y) * scale, x * scale]`. This is the canonical formula.
- Base layer: world map PNG as image overlay (50% opacity).
- Layer groups (each toggleable):
  - Sites: colored polygons by owning entity; gray for ruins; yellow for unowned
  - World Constructions: squares for point constructions, polylines for roads/bridges/tunnels
  - Mountain Peaks: triangle markers
  - Landmasses: semi-transparent rectangles
  - Regions: outline polygons, color-coded by evilness (fuchsia=evil, aqua=good)
  - Evilness fill layer (separate from region outlines)
  - Rivers: rendered paths
  - Battle markers: red diamond polygons on war/battle collection pages
- **Site marker shapes by type**: Circle (Unknown, Cave, Lair, Camp), Triangle (Monastery, Fort, Tomb), Square (Hillocks, Hamlet), Pentagon (Fortress, ForestRetreat, Town, DarkPits), Hexagon large (MountainHalls, Castle, DarkFortress), Star (Vault, Labyrinth, Shrine, Tower, ImportantLocation), Pentagon blue (MysteriousDungeon), Hexagon blue (MysteriousPalace).
- Marker colors: owning civilization's generated color (`Entity.LineColor`).
- Layer control: sites grouped by owner into Leaflet `LayerGroup`; "All"/"None" toggle buttons.
- Popup content: site name, type, owner name.
- Tooltips and popups on every map element via fetch to `/popover/{type}/{id}`.
- Zoom: `minZoom: -2`, `maxZoom: 2`.
- Per-object mini-maps: focused region-highlighted map on each entity detail page.
- Map coordinate system for non-square worlds: use worldgen params for width/height.

#### Hover Popovers

- Every entity hyperlink triggers hover popover.
- Content fetched from `/popover/{type}/{id}` endpoint returning compact HTML snippet.
- HF popover: name, race, sex, birth/death, type flags.
- Site popover: name, type, owner entity.
- Entity popover: name, type, race.
- Critical UX feature for exploration without navigation.

#### Civilization Color System

- HSV rotation algorithm: medium saturation for first 6 races, lighter for 7-12, darker for 13-18.
- Applied consistently across: map markers, warfare graph nodes, civilization list items.
- Each entity type has Color() and Icon() methods used consistently across map, lists, and links.

#### Population Charts

- Doughnut chart (Chart.js / D3): Population by Race.
- Doughnut chart: Area by Overworld Regions.
- Line chart: Events per year for world timeline.
- Bar chart: Event type breakdown by count.
- D3 population donut: at-a-glance demographic view with count labels.
- Library: `vue-chartjs` 5.3.2 (Chart.js 4.4.8 wrapper).
- Data endpoints: `/api/{Type}/{id}/eventchart`, `/api/{Type}/{id}/eventtypechart`.

#### World Summary Dashboard / Home Page

- World map thumbnail linking to full interactive map.
- Population by Race and Area by Overworld Regions doughnut charts.
- Active Civilizations card list (with civilization color indicators).
- Lost Civilizations card list.
- Events section: line chart + paginated event table.
- Chronicles section: paginated event collection table.
- Heroic Ties card: player-related objects — adventurer HFs, their factions, sites.
- Entities grouped by race, showing only civilization-type entities and necromancer groups.
- D3 War Chord Diagram (Wars tab): D3.js chord/ribbon diagram, each civilization as arc segment, chords connect warring pairs, hover highlights related chords.
- World statistics summary: years of recorded history, site count by type, civilization count, HF count, event count, artifact count.

### Historical Figure Detail Pages

All fields from the LegendsViewer-Next `HistoricalFigure.cs` model plus df-narrator and weblegends additions:

**Identity and Status**:
- Native + English name (e.g. "Kogan Uzolam, 'Blademaster'"), with native name in `<abbr title="ENGLISH">NATIVE</abbr>`.
- Race, caste, sex (with gender icon and sex symbol from creature raws).
- Birth and death years with DF calendar formatting and season display.
- Special type flags with icons: deity/force/vampire/werebeast/necromancer/adventurer/ghost/leader. Icon system: crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity.
- Curse/transformation: if figure has an active curse with body transformation, render target caste's description.
- Spheres of influence (for deities and forces).
- Goals list. Life goal.
- Journey pets list.
- Kill count (computed from HfDied events where SlayerHfid matches this figure).
- Age at death rendered as fractional years (HTML fractions: ¼, ½, ¾ based on DF 28-day months).
- Computed importance score.
- Orientation flags, curse year and curse seconds.
- Worldgen flags: `worldgen_acted`, `brag_on_kill`, `kill_quest`, `chatworthy`.
- Current geographic state (HfState). Active interactions (VAMPIRE, WEREBEAST, SECRET_* curses).

**Visualization: Family Tree**:
- Library: Cytoscape.js 3.31.0 + `cytoscape-dagre` (hierarchical layout), OR SVG family tree (LegendsBrowser v1 layout algorithm — high-value signature feature not in LB2).
- SVG tree: multi-generation genealogy up to 3 generations up, all generations down. Nodes as colored rectangles (blue=male, pink=female, gold=deity, highlighted=self). Edges: horizontal for spouse links, L-shaped for parent-child. Shows name, relation label, birth/death years. Auto-scroll to center on subject.
- Cytoscape: depth limit max 3 ancestors per maternal and paternal line; children unlimited. Prevents recursion bombs on DF's multi-century dynasties.
- Node visual classes: `dead` (30% opacity), `male` (blue), `female` (magenta), `leader` (round-octagon + crown), `necromancer` (round-hexagon + skull), `vampire` (hexagon + vampire icon), `werebeast` (hexagon + wolf), `ghost` (hexagon + ghost).
- Node label: race prefix, title/assignment, separator lines, highest skill rank, HF name, age with ✝ if dead.
- Click navigation: click node → navigate to that HF's detail page.
- Two sizes: compact 360px height and fullscreen 720px (toggle via ExpandableCard).
- Relationship scope: Mother, Father, Child only. Spouse/Lover/Companion in separate Related list.

**Visualization: Curse Lineage Tree** (high-value, unique to LegendsBrowser v1 — no other tool has this):
- For vampires and werebeasts: "who bit whom" tree.
- Traces HfDoesInteraction events for `DEITY_CURSE_WEREBEAST_*` and `DEITY_CURSE_VAMPIRE_*`.
- Traverses upward to find Patient Zero (original curse source).
- Uses same SVG tree engine as family tree.

**Related Figures**:
- All relationship types with sex-specific labels: mother, father, spouse/wife/husband, child/son/daughter, lover, companion, prisoner/imprisoner, master/apprentice/former_master/former_apprentice, pet_owner, former_spouse, deceased_spouse.
- Deity worship strength display.
- Vague relationships (plus-mode). Intrigue actors and plots. Worldgen-only quick relationships.

**Related Entities**:
- member, former_member, mercenary, former_mercenary, slave, former_slave, prisoner, former_prisoner, enemy, criminal.
- Current and former positions with sex-specific title, start year / year range.
- Squad links (current and former, with squad name and years).
- Occupation roles: tavern_keeper, performer, scholar, mercenary, monster_slayer, scribe, messenger (with linked location).
- Entity reputations with numeric scores (plus-mode).

**Related Sites**: occupation, seat_of_power, hangout, home, lair, prison. Site property links.

**Used Identities**: all false identities assumed, current identity flagged.

**Full Event History**: Paginated (1000 events/page), chronological. Perspective-aware rendering: references to this HF render as short name/pronoun, not a link.

**Other cards**: Skills (scrollable list with rank icons and point counts). Related Factions. Artifacts held. Dedicated Structures. Battles participated in. Beast Attacks. Snatcher-of list. Notable Kills. BreedId. LineageCurseParent. Adventurer flag.

### Entity (Civilization/Group) Pages

**Tabs on entity page**:
1. Leaders — table of leaders with date range, linked to HF pages
2. Sites — table of all sites controlled, each with inline site creation/takeover/destruction history
3. Members — list of member HFs
4. Groups — child entities (sub-organizations)
5. Wars — table of wars: date range, war name (linked to collection), enemy entity (attacker/defender role)

**Plus content**: Administrative positions with holder, sex-specific title, squad, linked site. Occasions with schedule. Entity honors list. Entity position definitions (male/female names, succession type, spouse relationships, max age). Entity reputations and entity-to-entity links. Worship list. Weapons/equipment list.

**Entity type categorization** (from weblegends `categorize()`): civilization, site_government/population, vessel_crew, migrating_group, bandit_gang, religion (with worshipped deities listed), military_unit (mercenary/shadowy/versatile), outcasts, performance_troupe, merchant_company, guild.

**Visualization**: Mini-map showing all owned sites. D3 War Chord Diagram on Wars pages. Entity type icons. Warfare graph (Cytoscape.js with `cytoscape-cola` force-directed physics, nodes for Civilizations and Battles/Wars, edge widths proportional to battle size, tippy tooltips, click navigation).

### Site Pages

**Tabs on site page**:
1. Structures — table of all structures (name, type, ruin status)
2. Properties — site properties (owner HF, type, linked structure)
3. History — site-level history events (creation, takeover, destruction, reclamation)

**Plus content**: Site type detail (all 22 types). Map: minimap rendering. World populations and animal populations at site. Current inhabitants: named HFs (via nemesis records) + anonymous populations with entity/civ affiliations. Current artifacts located at site. Current site ownership (live from DFHack). Related entities with relationship type.

**Structure sub-pages**: Structure name, type, ruin status. Full event history for the structure.

**Ruin state tracking**: Must be derived from events during post-parse processing. Sites and structures don't have an explicit `ruin` flag in XML. LegendsBrowser2's `processEvents()` pipeline implements this correctly.

### Event Collection Pages

**Collection hierarchy**: wars contain battles/sieges, battles contain individual events. All levels navigable.

**War collection page**: Map showing all sites of both entities plus all battle markers. Aggressor and defender entities. Date range, war name. Expandable sub-collections in chronological order.

**Battle collection page**: Name, outcome. Site location and map marker. Attacking and defending squads with origin sites. Member events.

**All other collection types** (each with appropriate summary and event list): beast_attack, abduction, duel, entity_overthrown, insurrection, journey, occasion (with sub-collections: ceremony, competition, performance, procession), persecution, purge, raid, site_conquered, theft.

### Artifact Pages

- Name, item description, material, item type, item subtype.
- Page count (for written works). Contained written content link.
- Current location: site and structure link. Current holder: HF link.
- Creator HF link, creation year.
- Unique holder count, lost/stolen status.
- Artifact journey: chronological sequence of events (created, given, lost, stolen, possessed, stored) with year and parties involved.
- Full event history.
- Chain-of-custody: link all artifact events together by artifact ID from creation through destruction.

### Written Content Pages

- Name, form (poem, short_story, musical_composition, choreography, etc.).
- Author HF link. Linked art form (poetic/musical/dance form). References section. Style list. Full event history.

### Art Form Pages (Dance, Music, Poetry)

- Name, description with hyperlinked entity/HF/form mentions.
- The `LinkDescription()` pattern: parse description text and replace entity/HF/form names with HTML links.
- Full event history.

### Geography Pages

- **Regions**: name, type, evilness (color-coded: fuchsia=evil, aqua=good), full event history, region outline on map.
- **Underground regions**: parsed data, dedicated view.
- **Landmasses**: name, coordinate bounds, map highlight.
- **Mountain peaks**: name, coords, volcano flag, map marker.
- **Rivers**: name, list of paths, map rendering.
- **World Constructions**: name, type (road, tunnel, bridge), coords, map marker, full event history.

### Identity Pages

- Name, profession, entity link.
- Used-by HF (cross-linked from events).
- Full event history.

### Complete World Browser

**From LegendsViewer-Next**: 70 routes (35 list + 35 detail view pairs), 8 navigation groups: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals.

**Years and Events Browser**:
- `/years` — all years with event counts, grouped.
- `/year/{id}` — all events that occurred in that year as narrative sentences.
- `/events` — all known event types as a list.
- `/events/{type}` — all events of a given type.
- `/event/{id}` — individual event detail.

**Global Search**: Full-text substring search (case-insensitive) across all entity types. Live autocomplete via `GET /search?term=` returning JSON `[{label, value}]`. Custom lightweight autocomplete widget. Full results page with categorized results and counts per category. HF list filtering by URL parameters: leader, deity, force, vampire, werebeast, necromancer, alive, ghost, adventurer, race. HF sort options: name, race, birth, death, kills.

**Paginated Server-Side Search API**: Text field triggers `loadWorldObjects()` on each keystroke change. Backend: case-insensitive name filter. Server-side pagination via `v-data-table-server`: 10/25/50/100 items per page. Column-level sorting via `sortKey` + `sortOrder`. Standard GET endpoint: `/api/{Type}?search={text}&page={n}&size={m}&sortKey={col}&sortOrder={asc|desc}`. Total count badge (cyan chip). DF Wiki search button per entity type. Prev/Next navigation FABs for adjacent-record browsing.

### Multi-World Architecture

- **Composite primary key requirement** (BUG-007): All 12 legends tables currently use `id INT PRIMARY KEY` where `id` is DF-internal and starts from 1 in every world. Multi-world imports cause silent data loss via `ON CONFLICT DO NOTHING`.
- **Multi-world bookmark system**: File-based bookmark store with world metadata and thumbnail. World overview page with bookmark cards: world map thumbnail, name, dimensions, last-accessed timestamp. "Explore a new world" card with file browser dialog. Bookmarks persist across sessions.

### Heroic Ties / Player Character Tracking

- `PlayerRelatedObjects` property: set of objects tagged as player-related.
- `Adventurer` flag on HistoricalFigure.
- On World Summary page: "Heroic Ties" card listing player-related HFs, entities, sites.
- Cross-links to all associated detail pages.
- Design question: how does Chronicler determine which HFs are "player-related" in the database?

### Creature / Entity Identity and False Identity Tracking

- `Identity` entity type: false identities assumed by HFs (common vampire behavior).
- `assume identity` and `impersonate hf` event types.
- `ActiveInteractions` on HF: VAMPIRE, WEREBEAST, SECRET_* flags.
- `LineageCurseParent`: vampire sire chain.
- `BreedId`: unique breed tracking.
- Zombie handling: if curse.original_histfig_id != -1, render as "zombie" with hover.

### Autonomous AI Fortress Player / Advisor (from df-ai)

#### Tick-Based Polling / Advisory Cadence

Mirror df-ai's polling schedule as Chronicler's advisory cadence:
- Every 25 game ticks (~16,000×/year): population alerts (new arrivals, deaths, stalled jobs, nobles, crimes).
- Every 100 ticks: stockpile status, production queue, farm/metal status.
- Every 240 ticks: construction status, room lifecycle completion.
- Every 1,200 ticks (1 DF day): full fortress health summary.
- Every 403,200 ticks (1 DF year): annual review / year-in-summary.
- 500-tick polling rate (≈12 seconds) validated by myDFHackScripts for citizen, announcement, book, and petition polling.

DF timing constants: 1 DF year = 403,200 ticks. 1 DF day = 1,200 ticks.

#### Ten-Phase Population Update Cycle

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

#### Three-Tier Stock Threshold Model

```
Needed:         absolute floor — act immediately
NeededPerDwarf: scales with population (per 100 dwarves)
WatchStock:     items to monitor but not necessarily act on
AlsoCount:      items to count for context without alerting
```
~100 named stock item categories (see `STOCKS_ENUMS` in `stocks.h`). `NeededPerDwarf` handles population scaling automatically.

#### Room Type Taxonomy and Construction State Machine

- Canonical room types (22): corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop.
- Canonical room status states: `plan → dig → dug → finished`.
- Furniture types (28): archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well.
- Task type enum (22): check_construct, check_furnish, check_idle, check_rooms, construct_activityzone, construct_farmplot, construct_furnace, construct_stockpile, construct_tradedepot, construct_windmill, construct_workshop, dig_cistern, dig_garbage, dig_room, dig_room_immediate, furnish, monitor_cistern, monitor_farm_irrigation, monitor_room_value, rescue_caged, setup_farmplot, want_dig.
- Construction task lifecycle: `want_dig(room) → tasks queue → dig_room → monitors until floor/open → status=dug → construct_room() → construct_* tasks → once built → furnish_room() → try_furnish() per item`.

#### Priority-Driven Construction Sequencing

- JSON-driven priority filter system. Each rule is a filter over room properties paired with an action. Prioritizes survival essentials (food, shelter, defense) before quality-of-life improvements.
- Actions: dig_immediate, unignore_furniture, finish, start_ore_search, dig_next_cavern_outpost, past_initial_phase, deconstruct_wagons.

#### Blueprint / Floor Plan System

- Parse df-ai's JSON blueprint format (`plans/generic01.json`). Blueprint specifies: room types, min/max counts, tags grouping room types, `count_as` (e.g., one dormitory = 39 bedrooms), limits per type.
- Enables player-definable and shareable fortress designs.
- Translate into Chronicler's CDM room graph with `accesspath` corridor links.

#### Military Sizing and Drafting Advisor

- Default military bounds: 25% (minimum) to 75% (maximum) of citizen count — configurable.
- Draft pool eligibility: exclude dwarves with noble positions, mining/woodcutting/hunting labors.
- Sorting: lowest XP first for draft candidates, lowest XP first for dismiss candidates.
- Squad size scaling: 4/6/8/10 members depending on total military count.
- Uniform selection: alternating Heavy Melee / Heavy Ranged every 3 squads.
- Full heavy armor loadout: armor, helm, pants, gloves, shoes, shield, appropriate weapon.

#### Noble Assignment Advisor

- Noble roles to track: Bookkeeper, Manager, Broker, Mayor, Sheriff, Captain of the Guard, and all other entity positions.
- Check noble requirements: office room, required room value, trading capability.
- Conflict detection: nobles should not simultaneously hold conflicting military positions.
- Noble room value validation: `check_noble_apartments()` checks `required_value` per room.

#### Trade Advisor

- Caravan detection: monitor `ui->caravans`. Broker identification: `entity_position_responsibility::TRADE`.
- `want_trader_item()` decision function: what to buy based on stock Watch model.
- Trade value calculation: `item_or_container_price_for_caravan()`.
- Trade balance enforcement: offer value must be ≥ request value × 110%.
- Counter-offer handling: iterative adjustment loop.
- Full trade cycle: detect caravan → identify broker → request at depot → wait → open trade screen → scan items → balance offer → handle counter-offers → dismiss broker.

#### Farm Management Advisor

- Separate plant category tracking: drink_plants, thread_plants, mill_plants, bag_plants, dye_plants, slurry_plants, grow_plants.
- Biome-aware crop selection: underground = underground plants, outdoor = surface plants.
- Season rotation logic.
- Kitchen management: mark cookable items correctly to prevent accidental cooking of seed stock.

#### Metalworking Production Chain Advisor

- `update_simple_metal_ores()`: scan world for ore deposits, compute smeltable bars.
- `may_forge_bars()`: available-ore → bars math per material.
- `queue_need_forge()`: ore → bars → equipment production chain decisions.
- Metal preferences based on material flags: ITEMS_WEAPON, ITEMS_ARMOR.
- Duplicate order prevention: avoid ordering within 5 units of existing orders.
- Manager order stall detection: if order stuck in `validated` state across two monthly checks, trim quantity by 3. CHEAT fallback: if search filter returns no matching orders, force-overwrite first order (log as CHEAT for auditing).

#### Pet Management Advisor

- Detect pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing.
- Pasture assignment via `assign_unit_to_zone()` for grazing zones.
- Track grass availability per pasture zone.

#### Occupation / Location Assignment Advisor

- Track `locations` (tavern, library, temple) and their required occupation types.
- Assign residents (non-citizen travelers) to fill roles via `assign_occupation()`.
- Respect location capacity constraints.

#### Justice and Crime Monitoring

- Scan `world->crimes` for crime detection, punishment assignment, execution/imprisonment status.
- Alert on unresolved crimes above threshold.

#### Fortress Loss Detection

- Monitor viewscreen text for fortress-loss messages: "Your strength has been broken," etc.
- On detection: preserve full state snapshot, generate post-mortem narrative.
- Support multi-embark session tracking (df-ai's `random_embark` pattern).

#### Job Stall Detection and Auto-Unsuspend

- Every advisory cycle: scan all non-repeating suspended jobs.
- Report which jobs are stalled and why (missing materials, hauling conflicts).
- Recommend or trigger `unsuspend` via DFHack Lua.

#### Baby Reunification Bug Workaround (DF Bug 5551)

- Detect baby/mother separation: baby alive, mother sane and alive and idle.
- Queue `SeekInfant` job via DFHack if separated.
- Pattern for all known DF bug compensations.

#### Ore Vein Discovery and Mining Advisor

- `list_map_veins()`: scan map blocks for `block_square_event_mineralst` events.
- `dig_vein()`: route shaft to vein.
- Track `dug_veins` to avoid redundant reporting.

#### Cistern and Water Supply Advisor

- Cistern construction workflow: channel water source → reservoir → well.
- Lever and floodgate connection tracking. `monitor_cistern()`: check water fill levels.
- Alert on empty cistern / overflowing cistern.

#### LLM Action Chain / Exclusive Callback Analogy

- Maintain one active action chain at a time (analogous to df-ai's `ExclusiveCallback` system).
- Queue pending actions in FIFO order.
- Strict serialization prevents DF UI conflicts.
- Translate df-ai's ExclusiveCallback coroutines into async Python coroutines calling DFHack Lua via `dfhack-run` over SSH.

#### Reactive Control Architecture Philosophy

- df-ai has no explicit goal tree. Five independent invariant-maintenance loops polling at different rates, taking smallest corrective action when invariant is violated.
- Chronicler's LLM advisor should adopt the same philosophy: "current state deviates from desired state by X — recommended corrective action is Y."
- This reactive control architecture is more robust than a planner because it handles unexpected DF behavior gracefully.

### Narrative Event Rendering

**Core principle**: Every event should render as a human-readable narrative sentence, not a raw type code.

**Death event rendering** (50+ death cause variants — render each as specific prose):
NONE, OLD_AGE, HUNGER, THIRST, SHOT, BLEED, DROWN, SUFFOCATE, STRUCK_DOWN, SCUTTLE, COLLISION, MAGMA, MAGMA_MIST, DRAGONFIRE, FIRE, SCALD, CAVEIN, DRAWBRIDGE, FALLING_ROCKS, CHASM, CAGE, MURDER, TRAP, VANISH, QUIT, ABANDON, HEAT, COLD, SPIKE, ENCASE_LAVA, ENCASE_MAGMA, ENCASE_ICE, BEHEAD, CRUCIFY, BURY_ALIVE, DROWN_ALT, BURN_ALIVE, FEED_TO_BEASTS, HACK_TO_PIECES, LEAVE_OUT_IN_AIR, BOIL, MELT, CONDENSE, SOLIDIFY, INFECTION, MEMORIALIZE, SCARE, DARKNESS, COLLAPSE, DRAIN_BLOOD, SLAUGHTER, VEHICLE, FALLING_OBJECT, LEAPT_FROM_HEIGHT, DROWN_ALT2, EXECUTION_GENERIC.
Each cause has a specific verb phrase. Append weapon info where available. Append slayer. Append age at death. Live cause lookup via incidents is required for fortress-mode deaths: death cause granularity matters — users notice and care about the difference.

**Interaction event rendering** (hf_does_interaction): Text comes from interaction definition's `hist_string_1` and `hist_string_2` from game raws via DFHack. Do NOT hardcode these strings — pull from game raws so modded interactions work.

**Circumstance/Reason rendering**: glorify_hf, artifact_is_heirloom_of_family_hfid, as_a_symbol_of_everlasting_peace, artifact_is_symbol_of_entity_position, Death, Prayer, DreamAbout, Dream, Nightmare, FromAfar.

**Location rendering**: "in [structure] in [site] in [region] in [layer]". Suppress any location component that matches the current page context.

**Date/time formatting**:
- DF calendar: `doy = sec // 1200 + 1`, `month = min((doy-1)//28 + 1, 12)`, `day = (doy-1) % 28 + 1`
- Months: Granite through Obsidian (12 months × 28 days).
- Season display: "early/mid/late spring/summer/autumn/winter of [year]" (LegendsBrowser2).
- "In YEAR on the Nth of MONTH, " or "On the Nth of MONTH, " for same-year continuation.
- Age at death: fractional display (¼ if days ≥ 28×3, ½ if ≥ 28×6, ¾ if ≥ 28×9).

**Pagination**: 1000 events/page. Within a dense year, split by DF weeks (every 7 days). Without pagination, pages for major deities or capital cities can have tens of thousands of events.

**Tiered event ingestion system** (from df-structures analysis):
- Tier 1 (always process): `HIST_FIGURE_DIED`, `ARTIFACT_CREATED`, `ARTIFACT_DESTROYED`, `HIST_FIGURE_SIMPLE_BATTLE_EVENT`, `WAR_FIELD_BATTLE`, `HIST_FIGURE_REVIVED`, `CHANGE_CREATURE_TYPE`
- Tier 2 (process for active HFs): `ADD_HF_HF_LINK`, `HF_LEARNS_SECRET`, `CHANGE_HF_MOOD`, `MASTERPIECE_CREATED_*` (all 6 variants), `WRITTEN_CONTENT_COMPOSED`
- Tier 3 (background enrichment): `WAR_*`, `ENTITY_*`, `CHANGE_HF_STATE`, `CHANGE_HF_JOB`

### Mod Management Features

#### Core Mod Manager (MVP)

- **Mod discovery via filesystem scan**: Scan `<DF_dir>/Mods/`, `<DF_dir>/data/vanilla/`, and `<DF_dir>/data/installed_mods/` for all `info.txt` files. Build available-mods catalog without requiring DF to be running.
- **DFHack live mod discovery**: When DFHack is running and DF is at the world creation screen, execute `dfhack-run lua -f GetModMemoryData.lua` via `reqscript` to call `manager.get_modlist_fields('base_available', viewScreen)`. Returned data: `id`, `name`, `displayed_version`, `numeric_version`, `earliest_compat_numeric_version`, `src_dir`, `mod_header`. NOTE: This is undocumented for third-party use and may change across DFHack releases.
- **info.txt parser**: Full token-based parser supporting all v50 fields: `ID`, `NAME`, `NUMERIC_VERSION`, `DISPLAYED_VERSION`, `EARLIEST_COMPATIBLE_NUMERIC_VERSION`, `EARLIEST_COMPATIBLE_DISPLAYED_VERSION`, `AUTHOR`, `DESCRIPTION`, `REQUIRES_ID`, `REQUIRES_ID_BEFORE_ME`, `REQUIRES_ID_AFTER_ME`, `CONFLICTS_WITH_ID`, and all Steam Workshop fields.
- **Modpack CRUD backed by mod-manager.json**: Create, rename, delete (enforce minimum one modpack), set-default, import from JSON file, export to JSON file. Schema matches DFHack's format exactly.
- **Load order management**: Drag-and-drop reordering. Enforce header load order: `o_template → language → descriptor_* → material_template → inorganic → plant → tissue_template → item → building → b_detail_plan → body → c_variation → creature → entity → reaction → interaction → edit`.
- **Mod browser with search/filter**: Dual-pane view (available/disabled mods vs. enabled mods). Search and filter boxes. Display mod name, description, version, author, and preview image.
- **Undo to last saved state**: Track unsaved changes and allow reverting to last persisted configuration.
- **Profile import/export**: Full JSON import/export using the `DFHModpack` schema.
- **Fallback to cached mod list**: If neither filesystem scan nor DFHack query is available, show last successful scan result.
- **Version integer format**: Remove dots from `numeric_version` string (`"53.10"` → `5310`, `"1.0.0"` → `100`).

#### Conflict Detection System

- **Level 1 — Metadata conflict detection** (O(n), no raw parsing): Duplicate mod IDs in active list; `CONFLICTS_WITH_ID` pairs both present; `REQUIRES_ID_BEFORE_ME` violations; `REQUIRES_ID_AFTER_ME` violations; version incompatibility.
- **Level 2 — Object ID conflict detection** (O(n × m), requires raw parsing): Parse all `objects/*.txt` for each enabled mod. Build a map of `{object_type: {object_id: [mod_id, ...]}}`. Flag any `object_id` with multiple full definitions across mods. Detect SELECT + CUT interactions. CRITICAL: Duplicate object IDs cause silent offset corruption, not last-wins behavior.
- **Level 3 — Semantic conflict detection** (expensive, requires full compilation): Full DF-Modloader compiler pipeline to detect `OT_REMOVE_TAG` vs. `OT_ADD_TAG` conflicts. Requires known vanilla baseline.
- **Visual conflict indicators**: Color-code mods in active list by conflict status. Typed conflict messages: `MissingBefore`, `MissingAfter`, `ConflictPresent`.
- **Three-way merge conflict detection** (PyLNP pattern): Line-based three-way merge with vanilla baseline + accumulated mods + new mod. Return status: 0 (clean), 1 (potential issues), 2 (overlap merged, manual review), 3 (fatal, rebuild from scratch). NOTE: Line-based text merging is insufficient for v50 mods with SELECT/CUT tokens — warn users.
- **LOOT-style auto-order** (long-term): Topological sort of mod dependency graph. No DF equivalent exists — significant opportunity.

#### Raw File Parsing and Analysis

- **Raw file tokenizer** (DF-Modloader canonical state machine): `COMMENTS → TOKEN → ARGS`. Discard everything outside `[` `]`.
- **Object type catalog**: Recognize all 18 DF super-types mapped to file prefixes.
- **SELECT/CUT token detection**: Parse `SELECT_<TYPE>` and `CUT_<TYPE>`. Sub-object selectors: `SELECT_CASTE`, `SELECT_ADDITIONAL_CASTE`, `SELECT_MATERIAL`, `SELECT_TISSUE`, `SELECT_TISSUE_LAYER`, `SELECT_GROWTH`.
- **Raw visual diff viewer**: Show side-by-side diff of the same raw object across two or more mods. Highlight added/removed/changed tokens. PyDwarf doubly-linked token model is best for interactive editing.
- **Embedded raw editor** (stretch): In-application editing with syntax highlighting.

#### Advanced Mod Management (Long-term)

- **Full raw compiler** (DF-Modloader pattern): EDIT object support, OBJECT_TEMPLATE compilation with argument substitution, USE_OBJECT_TEMPLATE processing, REMOVE_OBJECT support.
- **Legacy mod migration tool** (SyntaxUpdater pattern): Convert pre-v50 `c_variation_*` files to `o_template_cv_*`.
- **Modpack content discovery**: Support modpack-in-modpack structure.
- **Virtual file system isolation** (Mod Organizer 2 pattern): Serve mods to DF without physically copying files.
- **Steam Workshop integration**: Integrate with Steam Workshop API for browsing, install, and update. Steam Workshop path on macOS differs from Windows path.

#### Modpack History and Audit

- **DB schema for modpack state**: Store which modpack was active when each legend event, fortress event, or world was generated. Answer "which mods were active when this artifact was created?"
- **Modpack snapshot at world creation**: Capture the full `object_load_order` via DFHack at world creation time, stored in DB against the world record.
- **Mod annotation in legends**: When displaying a legend event or creature/entity, annotate which mod introduced that raw object.
- This is a unique feature not available in any existing mod manager or legends viewer.

### Dwarf Labor Manager (Dwarf Therapist Pattern)

- Full unit soul data extraction: complete skill set (job_skill enum + experience int32), preferences, personality, performance skills (musical instruments, poetic forms, musical forms, dance forms).
- Soul personality snapshot: `unit_personality` including mannerisms (70+ distinct behaviors), values (type + strength), ethics (ethic + response), thought history (unit_thought_type, 80+ categories).
- Citizen roster tracker: poll `df.global.world.units.active` (filtered by `dfhack.units.isCitizen()`) at configurable intervals to detect roster changes and trigger DB sync.
- Unit metadata extraction: race, age, sex, readable name, visible name.
- Labor assignment advisor using personality and skill data.
- Dwarf Therapist memory layout (29 sections — INI/QSettings) shows full scope of data categories available, but direct memory reading is not viable for Chronicler. All this data is accessible via DFHack Lua `df.global.*` paths instead.

---

## Reference Tool Analysis

### df-narrator (Python XML entity scoring)

| Feature | Status | Notes |
|---------|--------|-------|
| Figure importance scoring | Reference | 4-formula system, well-calibrated |
| Site importance scoring | Reference | Deaths and collections weighted higher |
| Conflict importance scoring | Reference | Battle count dominant |
| Artifact importance scoring | Reference | Names and holders weighted |
| Rivalry detection (co-appearance) | Reference | Top-10 rivals per figure |
| HF_FIELDS canonical list | Reference | All XML HF-reference fields |
| Calendar conversion formula | Reference | sec → month/day/year |
| Markdown narrative output | Adapt | Chronicler uses HTML/API instead |
| XML streaming (SAX/iterparse) | Reference | Python ETL should use iterparse + root.clear() |

Source: `/Users/nathanielcannon/Claude/GitRepos/df-narrator/`

### weblegends (C++ DFHack plugin, live in-game HTML server)

| Feature | Status | Notes |
|---------|--------|-------|
| 94 event type handlers | Adapt | LB2's 132 is more complete baseline |
| Context-aware event rendering | Must adopt | `event_context` pattern critical |
| Live DFHack memory access | Reference | C++ direct bindings; Chronicler uses Lua bridge |
| CoreSuspender acquire | Must understand | Pauses game thread for data consistency |
| Hover popovers | Must adopt | Critical UX feature |
| Static export via BFS crawl | Optional | Useful for offline/sharing |
| Zombie handling (curse.original_histfig_id) | Must adopt | Renders "zombie" correctly |
| Written content italicization | Must adopt | `<em>` wrapping pattern |
| Name translation `<abbr>` | Must adopt | Native/English name display |
| Entity categorization | Must adopt | 11 entity type labels |
| Current inhabitant data (nemesis records) | Must adopt | Not in XML, DFHack only |
| Interaction text from raws | Must adopt | hist_string_1/2 via DFHack |

Source: `/Users/nathanielcannon/Claude/GitRepos/weblegends/`

### LegendsBrowser v1 (Java, DF 0.44)

| Feature | Status | Notes |
|---------|--------|-------|
| SVG Family Tree | Must adopt | Signature feature, not in LB2 |
| Curse Lineage Tree | Must adopt | Unique, high narrative value |
| D3 chord diagram (wars) | Must adopt | Best overview of civ-war relationships |
| D3 population donut | Must adopt | At-a-glance demographic view |
| Per-race color picker | Optional | User customization |
| LNP archive support | Optional | Legacy format |
| Tabbed entity pages | Must adopt | Standard UX pattern |
| War tab on entity pages | Must adopt | Essential for civ history |
| SAX streaming parser | Reference | Java; Python: iterparse |
| Family Tree layout algorithm | Must port | Self-contained, portable |

Source: `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/`

### LegendsBrowser2 (Go, DF 0.47, most complete event type coverage)

| Feature | Status | Notes |
|---------|--------|-------|
| 132 event types | Must adopt | Complete baseline for DF 0.47+ |
| RelatedTo* interface | Must adopt | Maps to PostgreSQL queries |
| DfWorld root container | Reference | Complete world data model |
| Post-parse processing pipeline | Must adopt | Ruin tracking, kill lists, collection links |
| Season display in timestamps | Must adopt | "early spring of 125" |
| Custom XML tokenizer | Reference | Go-specific; Python: use iterparse |
| Code generation from XML | Consider | Long-term maintainability |
| Popover endpoints | Must adopt | /popover/{type}/{id} pattern |
| Non-plus mode inference | Must adopt | Entity type inference, hardcoded position lists |
| URL hash tab persistence | Must adopt | UX quality |
| Bootstrap 5 dark mode | Must adopt | UI standard |
| Leaflet world map | Must adopt | Centerpiece visualization |

Source: `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/`

### LegendsViewer-Next (C#/.NET/Vue3)

| Feature | Status | Notes |
|---------|--------|-------|
| 70-route world browser (35 list + 35 detail) | Must adopt | Complete coverage |
| Interactive Leaflet map | Must adopt | DF-specific coordinate formula |
| Streaming XML parser (XmlReader Async=true) | Must adopt | FilteredStream for control chars |
| Dual-file merge (legends.xml + legends_plus.xml) | Must adopt | Single sequential pass |
| 15-pass cross-reference post-processing | Must adopt | Full resolution pipeline |
| Multi-world bookmark system | Must adopt | File-based with thumbnails |
| Composite PK schema | Must implement | Per BUG-007 fix required |
| O(1) entity lookup optimization | Must implement | Fast path + Dictionary + BinarySearch |
| Vue 3 + Vuetify 3 SPA framework | Reference | Material Design, lazy-loaded views |
| Generic list + detail page component patterns | Must adopt | Consistent UX across all types |
| ExpandableCard pattern | Must adopt | Compact/expanded content toggle |
| REST API pattern with pagination | Must adopt | `{ items: [...], totalCount: N }` |
| Pinia stores per entity type | Must adopt | Client-side session cache |

Source: From round2-pair-05.md (research file)

### df-ai (C++ autonomous fortress player)

| Feature | Status | Notes |
|---------|--------|-------|
| Tick-based multi-rate polling | Must adopt | 5 rate tiers |
| 10-phase population advisory cycle | Must adopt | All fortress dimensions covered |
| Three-tier stock threshold model | Must adopt | Per-capita scaling critical |
| Room type taxonomy (22 types) | Must adopt | CDM schema |
| Priority-driven construction sequencing | Must adopt | JSON-driven filter rules |
| Blueprint/floor plan system | Must adopt | Sharable JSON fortress designs |
| Military sizing advisor | Must adopt | 25-75% bounds |
| Noble assignment advisor | Must adopt | Room value validation |
| Trade advisor | Must adopt | Full cycle including counter-offers |
| Farm management advisor | Must adopt | Biome-aware crop selection |
| Metalworking production chain | Must adopt | Stall detection included |
| Pet management advisor | Must adopt | Capability detection |
| Occupation/location assignment | Must adopt | Tavern/library/temple roles |
| Justice and crime monitoring | Must adopt | Tantrum spiral prevention |
| Fortress loss detection + post-mortem | Must adopt | State snapshot preservation |
| Job stall detection and unsuspend | Must adopt | Non-repeating suspended job scan |
| DF bug workarounds (Bug 5551, etc.) | Must adopt | Template for all bug compensations |
| Reactive control architecture | Must adopt | "Deviation + corrective action" framing |
| ExclusiveCallback serialization | Must adopt | One active action chain at a time |
| Manager order stall + CHEAT fallback | Must adopt | Real DF behavior |

Source: from round2-pair-05.md (df-ai research)

### dfhack-client-python (RPC protocol reference)

| Feature | Status | Notes |
|---------|--------|-------|
| Handshake and frame format | Reference | For understanding RPC protocol |
| Method binding via CoreBindRequest | Reference | Auto-wire decorator pattern |
| `@remote` decorator pattern | Reference | For future RPC usage |
| lru_cache(maxsize=65534) for method IDs | Reference | Bind once, reuse |

CRITICAL: TCP RPC is broken for game-thread calls on DFHack 53.x under Prism/UTM. Only `GetVersion`/`GetWorldInfo` work. Use `dfhack-run` over SSH exclusively.

Production gaps in dfhack-client-python: no timeout on connection, no retry/reconnect, no heartbeat, no thread safety, no recovery from RPC_REPLY_TEXT.

Source: `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/`

### df-structures (canonical DF field definitions)

- `df.global.world.*` Lua paths mirror the instance-vector paths in XML exactly.
- HF profile pointer bag: all nullable, 13 sub-pointers (metaphysical, skills, pets, personality, masterpieces, whereabouts, kills, wounds, known_info, curse, books, reputation, relationships).
- Event subtype casting: `local e = df.history_event_war_field_battlest(event_ptr)`.
- Event virtual methods: `getRelatedHistfigIDs()`, `getRelatedSiteIDs()`, `getRelatedEntityIDs()`, `wasHistfigKilled()`, `getKilledHistfigID()`, `wasHistfigRevived()`, `getSentence()`, `getPhrase()`, `getImportance()`, `getEraImportance()`.
- 144 `history_event_type` variants — the definitive ceiling for event coverage.
- Targets: df-structures defines 12 more event types than LegendsBrowser2 covers. Need to identify the 12 unhandled types.

Source: `/Users/nathanielcannon/Claude/GitRepos/df-structures/`

### myDFHackScripts (Lua production bridge patterns)

- Module architecture for production bridge: 10 modules (FortressStatistics, LogHandler, Helper, AnnouncementLogger, CitizenLogger, DeathLogger, ItemLogger, JobLogger, InvasionLogger, AnnounceBooks, PetitionLogger).
- Generic watcher factory: `Helper.watch()` closure — track known list, detect additions on each poll. Must be extended to handle deletions.
- Death cause and killer lookup via incidents: only way to get cause + killer.
- Enum resolution: `Helper.resolveEnum(k, v)` for readable values.
- Struct introspection: field enumeration via `unit_type._fields`.
- Module hot-reload: `package.loaded["ModuleName"] = nil`.
- 500-tick polling rate (≈12 seconds) validated as production pattern.
- `dfhack.timeout(500, 'ticks', tick)` is the canonical reschedule pattern.

Source: `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/`

### DwarvenSurveyor (C# XML streaming parser)

- XmlReader (streaming, not DOM) for large legends XML files.
- Region terrain types (10 values): wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains.
- Sample test fixtures available.

Source: `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/`

### DF-Modloader (Python raw compiler)

- Compiler pipeline: `read_mod_raws_and_apply_edit_objects(mod)` → `apply_special_tokens_to_create_compiled_objects()` → `write_compiled_objects(output_path)`.
- Reading mode state machine: `"NONE"` → `"NEW"` (standard object) / `"OT"` (object template) / `"EDIT"`.
- Conflict model: last-mod-wins for full object definitions. EDIT objects layer in load order. No explicit conflict detection — duplicate IDs cause silent offset corruption.

**Full raw compiler pipeline** (DF-Modloader pattern):
- EDIT object support: `SEL_BY_ID`, `SEL_BY_CLASS`, `SEL_BY_TAG`, `SEL_BY_TAG_PRECISE`, `PLUS_SELECT`, `UNSELECT`
- OBJECT_TEMPLATE compilation: `COPY_TAGS_FROM`, `GO_TO_END`, `GO_TO_START`, `GO_TO_TAG`, argument substitution (`!ARG1`, `!ARG2`), recursion detection
- USE_OBJECT_TEMPLATE processing: `OT_ADD_TAG`, `OT_REMOVE_TAG`, `OT_CONVERT_TAG + OTCT_TARGET/REPLACEMENT`, conditional variants (`OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG`)
- `REMOVE_OBJECT` support (sets `is_removed = True`)
- Output: per-super-type compiled files (`creature_compiled.txt`, etc.) with source comments

**RawObject data model**:
```
object_id: str
tokens: List[List[str]]     # each token as flat list
source_file_name: str
source_mod_name_and_version: str
is_removed: bool
```

Source: `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/`

### ModHearth (C# DFHack-integrated GUI mod manager)

- Dual-pane mod browser, drag-and-drop load ordering.
- DFHack Lua query via reqscript (undocumented, may break).
- mod-manager.json schema documented.
- Windows-only (Windows Forms) — Chronicler must be cross-platform.

**Conflict Detection Algorithm**:
```
scannedModIDs = set()   -- already loaded
unscannedModIDs = set() -- not yet loaded
for each mod in load order:
    parse REQUIRES_ID_BEFORE_ME -> check mod in scannedModIDs (MissingBefore if not)
    parse REQUIRES_ID_AFTER_ME  -> check mod in unscannedModIDs (MissingAfter if not)
    parse CONFLICTS_WITH_ID     -> check mod in either set (ConflictPresent if found)
```
Visual conflict indicators: Color-code mods by conflict status: clean (no indicator), problem (red text/highlight). Typed conflict messages: `MissingBefore`, `MissingAfter`, `ConflictPresent`.

Source: `/Users/nathanielcannon/Claude/GitRepos/ModHearth/`

### PyLNP and PyDwarf

- PyLNP: line-based three-way merge conflict detection with vanilla baseline + accumulated mods + new mod. Return status: 0 (clean), 1 (potential issues), 2 (overlap merged, manual review), 3 (fatal, rebuild from scratch). Pre-v50 design, not SELECT/CUT aware. Line-based text merging is insufficient for v50 mods that use SELECT/CUT tokens — semantic understanding of tokens is needed.
- PyDwarf: doubly-linked token model for interactive editing.
```python
class token:
    value: str          # "CREATURE"
    args: List[str]     # ["DWARF"]
    prev: token         # O(1) traversal
    next: token
    file: rawfile
    prefix: str         # whitespace before '['
    suffix: str         # whitespace after ']'
```
`token.remove()` = O(1) unlink. Best for interactive editing; DF-Modloader flat-list is better for batch compilation.

### NexusMods / Vortex (reference patterns)

- LOOT automated load order: topological sort of dependency graph, community-curated conflict rules.
- No DF equivalent exists. Significant opportunity for Chronicler.
- Virtual file system isolation: Mod Organizer 2 pattern.

---

## Data Quality Findings

### Critical Bugs

- **BUG-005 — kill_count computation inverted** (CRITICAL): Current query groups by `hf_id_1` (victim) instead of `hf_id_2` (killer) in death events. Result: kill_count always 0 or 1. `_world_overview()` "Notable figures" sort is corrupted. Fix: change `hf_id_1` to `hf_id_2` in `xml_parser.py` lines 710-711. Effort: ~5 lines. STATUS: NOT DONE.
- **BUG-007 — Single-column PKs, multi-world collision** (CRITICAL): All 12 legends tables use `id INT PRIMARY KEY` where `id` starts from 1 in every world. Multi-world imports cause silent data loss via `ON CONFLICT DO NOTHING`. Affected tables with data loss metrics: historical_figures (5,466 World 2 HFs lost = 19.5%), history_events (massive loss), sites (~1,800 lost), entities (most lost), artifacts (most lost), regions (all lost from World 2), underground_regions (all lost), history_event_collections (most lost), identities (most lost), landmasses (all lost), mountain_peaks (all lost), world_constructions (all lost). Phase 1. Effort: 4-6 hours. STATUS: NOT DONE.

### High Severity Bugs

- **BUG-006 — Link table duplicate accumulation** (HIGH): `hf_links`, `hf_entity_links`, `hf_site_links` use SERIAL PRIMARY KEY. `ON CONFLICT DO NOTHING` never triggers. Re-importing the same world appends exact duplicates, causing duplicate relationships in storyteller output. Fix: add UNIQUE constraints, deduplicate existing data. STATUS: NOT DONE.
- **BUG-002 — Multi-participant events truncated**: Events with multiple HFs (battles with 10+ participants) store only first `hf_id_1` and `hf_id_2`. Additional participant IDs go to JSONB `details` but are not indexed. Design decision pending: JSONB array `participants` vs. junction table `event_participants`.

### Medium Severity Bugs

- **BUG-008 — Region parsing scope risk** (MEDIUM): `_parse_regions()` uses `root.findall(".//region")` which matches ALL `<region>` tags in document including inside `<site>` elements. May insert spurious region records. Fix: scope to `root.findall("regions/region")`. Effort: 1 line. STATUS: NOT DONE.
- **Zero test coverage** (MEDIUM): No automated tests for any component.

### Fixed Bugs

- **BUG-001 — Boolean flags all FALSE — FIXED**: Originally ALL boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`, `is_ghost`) were FALSE across all 55,321 historical figures. Root cause: parser needed to detect via spheres (deity), interactions (vampire), and other indirect signals. STATUS: FIXED in xml_parser.py lines 159-183.
- **BUG-003 — Site ownership NULL — FIXED**: All `owner_entity_id` were NULL. Fix: parse `cur_owner_id` from legends_plus.xml entity_site_links. STATUS: FIXED — 1,145/1,899 World 2 sites now have owners.

### Data Integrity Requirements

- **Control character filtering in XML**: DF XML output contains raw control characters (bytes < 32). Without filtering, XML parsers throw. Solution: `FilteredStream` wrapper replaces all bytes < 32 with spaces. IBM CP473 legacy characters require explicit conversion to Unicode. Both LegendsBrowser versions include this. STATUS: unknown — verify whether current xml_parser.py handles this.
- **lua_probes unbounded growth** (DESIGN-001): Each watcher poll inserts 16 rows every 30 seconds = 32 rows/minute, 1,920/hour, 46,080/day. No TTL, no cleanup, no deduplication. Fix options: (a) delete rows older than N hours keeping latest per probe_name, (b) UPSERT with `UNIQUE (world_id, probe_name)` ON CONFLICT DO UPDATE, (c) configurable retention policy.
- **Bridge health monitoring**: Track consecutive bridge fetch failures; log warning after 3 failures; continue with core-only data.
- **Migration framework** (Phase 4.4): `chronicler/db/migrations/` directory with numbered SQL files, `migrations` table, CLI command `chronicler migrate`. Not urgent pre-1.0.

### Polling Timing Risk Matrix (Selected High-Risk Events)

| Event Category | Persistent? | Announcement? | Risk of Missing |
|----------------|-------------|---------------|-----------------|
| Marriage | YES (HF link) | YES | HIGH — no HF link tracking |
| Strange mood | YES (flag set) | YES | HIGH — now captured via flag extraction |
| Tantrum | TRANSIENT (flag) | YES | HIGH — flag now captured |
| Mandate issued | YES (mandate created) | YES | HIGH — now tracked via mandates section |
| Crime committed | YES (incident created) | YES | HIGH — now tracked via crimes section |
| Noble appointment | YES (position assigned) | YES | HIGH — no position tracking |
| Outside-world war event | YES (history event) | NO | HIGH — now captured via event cursor |
| Loyalty cascade | FAST TRANSIENT | YES (multiple) | HIGH — cascade causality still may be lost |
| Forgotten beast arrival | YES (unit appears) | YES | MEDIUM — detected as unit, type unclear |
| Intermediate states (berserk then dead in same poll) | N/A | YES | MEDIUM — both captured, berserk snapshot missed |

---

## Architecture & Implementation Patterns

### DF Data Structures

- **93 top-level `df.global.world` fields** available; bridge reads ~16 sections.
- **141+ history event types** with structured payloads (144 per df-structures).
- **250+ announcement types** in `world.status.reports` — append-only, NOT a ring buffer.
- **100+ unit fields per dwarf** in `df.global.world.units.active[]`.
- **19 event collection types** (see Appendix A).
- **200+ unit thought types**.
- **Same ID space between legends and live data**: `world.history.events` is one vector — legends XML and live fortress events use identical IDs, enabling a unified `history_events` timeline table.

### Key Event Type Payloads

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
- `df.global.plotinfo.main.fortress_site.name` — current fortress name.
- `df.global.world.world_data.name` — world name.

Key DFHack Lua modules:
- `dfhack.units.isCitizen()`, `isDead()`, `isSane()`, `isMale()`, `getRaceName()`, `getAge()`, `getReadableName()`, `getVisibleName()`, `getNoblePositions()`, `getPosition()`.
- `dfhack.buildings.constructBuilding()`, building state queries.
- `Maps.getTileType()`, `Maps.getTileWalkable()`, map block iteration.
- `dfhack.job.linkIntoWorld()`, `getWorker()`.
- `Materials.MaterialInfo`, material property lookup.
- `dfhack.gui.getCurViewscreen()`, `dfhack.gui.getFocusString()`.
- `dfhack.translation.translateName(name_compound)`.
- `dfhack.items.getBookTitle(item)`, `getDescription(item, 0)`.
- `dfhack.matinfo.decode(item)`.
- `dfhack.world.ReadCurrentDay()`, `ReadCurrentMonth()`, `ReadCurrentYear()`.

Live DFHack Global Paths Reference (complete):
```lua
-- Units
df.global.world.units.active         -- alive units in fortress area
df.global.world.units.all            -- all units including historical

-- Items
df.global.world.items.all            -- all items (including books, artifacts)

-- Communication and reports
df.global.world.status.reports       -- announcement/report log (poll, not event)
df.global.world.agreements.all       -- petitions, trade agreements, diplomatic records

-- Crime and death
df.global.world.incidents.all        -- crime/death incidents (death_cause + criminal)

-- World entities and history
df.global.world.entities.all         -- historical entities (civs, groups)
df.global.world.history.figures      -- all historical figures
df.global.world.history.events       -- all history events
df.global.world.history.eras         -- era boundaries
df.global.world.history.intrigues    -- intrigue network (v0.47+)
df.global.world.history.relationship_events  -- relationship events (v0.47+)
df.global.world.history.live_megabeasts
df.global.world.history.live_semimegabeasts
df.global.world.history.hf_allbeasts
df.global.world.history.hf_artists, hf_poets, hf_bards, hf_dancers, hf_scholars
df.global.world.history.hf_heros, hf_underbelly, hf_religious, hf_merchant
df.global.world.history.hf_teachers  -- index 11 = necromancers

-- Location context
df.global.plotinfo.main.fortress_site.name  -- current fortress name
df.global.world.world_data.name             -- world name

-- Worldgen structures
df.global.world.history.event_collections   -- typed event collection groups
```

### DFHack Lua Bridge Architecture (Validated Production Pattern)

The `chronicler-bridge.lua` HTTP-serving approach is architecturally correct and validated by reference tools. It sidesteps all RPC connection management issues while providing full access to `df.global.*`.

Module architecture for production bridge:
```
FortressStatistics.lua  -- orchestrator, event registration, polling loop
  LogHandler.lua        -- file I/O, UTF8 conversion, log path management
  Helper.lua            -- watcher factory, enum resolution, unit lookup
  AnnouncementLogger.lua -- polls df.global.world.status.reports
  CitizenLogger.lua     -- polls df.global.world.units.active
  DeathLogger.lua       -- eventful.onUnitDeath subscription
  ItemLogger.lua        -- eventful.onItemCreated subscription
  JobLogger.lua         -- eventful.onJobCompleted subscription
  InvasionLogger.lua    -- eventful.onInvasion subscription
  AnnounceBooks.lua     -- polls df.global.world.items.all (book filter)
  PetitionLogger.lua    -- polls df.global.world.agreements.all
```

Event subscription pattern:
```lua
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 1)
local modId = "DF_STATS"
eventful.onUnitDeath[modId] = function(unitId) DeathLogger.log(unitId) end
eventful.onUnitDeath[modId] = nil  -- clean unsubscribe
```

Polling pattern with dfhack.timeout:
```lua
local function tick()
    if not watcherActive then return end
    AnnouncementLogger.watch()
    CitizenLogger.watch()
    if watcherActive then
        dfhack.timeout(500, 'ticks', tick)
    end
end
```
`'ticks'` = real game ticks (pauses when game pauses). `'frames'` = real-time frames.

Generic watcher factory (change detection closure):
```lua
function Helper.watch(getCurrentList, getKey, logChange, logNew, secondCondition)
    local lastCount = 0
    local known_items = {}
    local firstCall = true
    return function()
        if firstCall then
            known_items = getCurrentList(); lastCount = #known_items; firstCall = false; return lastCount
        end
        local current_items = getCurrentList()
        local newCount = #current_items
        if newCount ~= lastCount then
            logChange(lastCount, newCount)
            local known_keys = {}
            for _, item in ipairs(known_items) do known_keys[getKey(item)] = true end
            for _, item in ipairs(current_items) do
                if not known_keys[getKey(item)] then logNew(item) end
            end
            known_items = current_items; lastCount = newCount
        end
        return newCount
    end
end
```
Note: Does not handle deletions — Chronicler's implementation must detect items leaving the list.

Death cause and killer lookup via incidents:
```lua
function Helper.getIncidentDeathCauseByVictimId(victimId)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death then
            if incident.victim == victimId then
                return incident.death_cause
            end
        end
    end
    return nil
end
-- incident.criminal = killer unit ID
```

Enum resolution pattern:
```lua
function Helper.resolveEnum(k, v)
    local d = df[k]
    if d == nil then return tostring(v) end
    local dv = d[v]
    if dv == nil then return "unknown_enum_value" end
    return d[v] .. "," .. k .. "_value," .. tostring(v)
end
```

### weblegends C++ Memory Access Pattern

```cpp
df::historical_figure::find(id)       // O(log n) binary search
df::historical_entity::find(id)       // world->entities.all
df::world_site::find(id)              // world->world_data->sites
df::artifact_record::find(id)         // world->artifacts.all
df::creature_raw::find(race_id)       // world->raws.creatures.all
binsearch_in_vector(vec, id)          // DFHack utility
CoreSuspender suspend;                // Pause game thread during rendering
```

Cross-linking pattern:
```cpp
void link(ostream &s, df::historical_figure *hf);
void event_link(ostream &s, const event_context &ctx, df::historical_figure *hf);
// Zombie: if curse.original_histfig_id != -1, render as "zombie"
// Written content: wrap in <em> if item has writingst/pagesst improvements
// Name: native name in <abbr title="ENGLISH">NATIVE</abbr>
```

Event dispatch: each event type is a separate file; central dispatch wraps with temporal context; 1000-event pagination with year-group boundaries.

### LegendsBrowser2 Data Model (Go)

```go
DfWorld {
    Name_, Altname string
    Width, Height int
    MapData []byte
    Regions, UndergroundRegions, Sites, WorldConstructions,
    Artifacts, HistoricalFigures, Identities, EntityPopulations,
    Entities, HistoricalEvents, HistoricalEventCollections,
    HistoricalEventRelationships, HistoricalEras,
    DanceForms, MusicalForms, PoeticForms, WrittenContents,
    Landmasses, MountainPeaks, Rivers
}
```

RelatedTo interface (maps to PostgreSQL queries in Chronicler):
```go
type HistoricalEventDetails interface {
    RelatedToEntity(int) bool
    RelatedToHf(int) bool
    RelatedToArtifact(int) bool
    RelatedToSite(int) bool
    RelatedToStructure(int, int) bool
    RelatedToRegion(int) bool
    RelatedToWorldConstruction(int) bool
    RelatedToWrittenContent(int) bool
    RelatedToDanceForm(int) bool
    RelatedToMusicalForm(int) bool
    RelatedToPoeticForm(int) bool
    RelatedToMountain(int) bool
    RelatedToIdentity(int) bool
    Html(*Context) string
}
```

Post-parse processing pipeline (must adopt):
1. Assign River IDs
2. `addRelationshipEvents()` — synthesize AddHfHfLink events from plus-mode relationships
3. Set structure.SiteId
4. `processEvents()`: Mark HFs as Vampire/Werebeast/Necromancer; build entity site lists; track ruin status; resolve mountain peak IDs; populate HF kill lists from HfDied events
5. `processCollections()`: Assign Collection id to member events; derive summary data; link sub-collections to parent occasions; append wars to entity war lists
6. Non-plus mode inference: race cleanup, entity type inference, hardcoded position lists for dwarf/elf/human/goblin entities

### XML Parsing Architectures

**LegendsViewer-Next streaming parser**:
- Streaming `XmlReader` with `Async = true` — never loads entire file into DOM.
- `FilteredStream` wrapper: replaces all bytes < 32 with spaces.
- Section dispatch map to Section enum covering all 22 top-level sections.

**LegendsBrowser Java SAX Parsing**:
- SAX streaming with `@Xml("element_name")` annotation-driven field mapping.
- `@XmlSubtypes` / `@XmlSubtype("battle")` polymorphic dispatch.
- `CodingErrorAction.IGNORE` for malformed DF XML bytes.
- Reads separately: `legends.xml`, `legends_plus.xml`, `world_history.txt`, `world_gen_param.txt`, `sites_and_pops.txt`, world map image.

**LegendsBrowser2 Custom XML Tokenizer (Go)**:
- Custom `XMLParser` backed by `bufio.Reader`, reading byte-by-byte.
- `model.go` is fully code-generated from an `analyze/` generator tool.
- `cp473.go` converts legacy IBM CP473 characters to Unicode.
- After loading `legends.xml`, auto-detect and load `legends_plus.xml` (replace suffix in path).
- World map: loads `-world_map.*` or `-detailed.*` (supports BMP), encodes to PNG in memory.

**All approaches agree**: use streaming parsers for large legends XML files. Python ETL should use `iterparse` with `root.clear()` after each element, not ElementTree with full tree loading. Custom tokenizers outperform standard XML libraries for DF-sized (25MB–400MB+) exports.

**Dual-File Merge (legends.xml + legends_plus.xml)**:
- LegendsViewer-Next: `XmlPlusParser.AddNewPropertiesAsync()` merges by matching `id` fields. Plus parser runs ahead in single sequential pass. Entity-type-specific merge rules.
- LegendsBrowser2: after loading legends.xml, auto-detect legends_plus.xml and merge.

**Multi-Source Cross-Reference Post-Processing** (LegendsViewer-Next 15 passes):
ProcessHFtoEntityLinks, ResolveEntityToEntityPopulation, ResolveHfToEntityPopulation, ResolveStructureProperties, ResolveSitePropertyOwners, ResolveHonorEntities, ResolveMountainPeakToRegionLinks, ResolveRegionProperties, ResolveArtifactProperties, ResolveArtformEventsProperties, ResolveEntityIsMainCiv, GenerateCivColors, Beast HF heuristic resolution, Era end year computation, Sub-collection linking to parent collections.

### LegendsBrowser v1 Family Tree Layout Algorithm (Java)

The `FamilyMember.layout()` / `layoutUp()` / `layoutDown()` algorithm in `HfsController.java` is self-contained and portable:
- Traverses HF links to build a tree structure
- Computes non-overlapping x-positions for each generation
- Returns SVG coordinate data per node
- Handles both upward (ancestors) and downward (descendants) traversal independently
- Produces multi-generation genealogy: up to 3 generations up, all generations down
- Nodes as colored rectangles (blue=male, pink=female, gold=deity, highlighted=self)
- Edges: horizontal for spouse links, L-shaped for parent-child
- Auto-scroll to center on subject

### Dwarf Therapist Memory Layout Architecture (Reference)

29-section INI/QSettings mapping (NOT usable by Chronicler, but shows data scope):
```
MEM_GLOBALS    -> "addresses"           (global pointer addresses)
MEM_UNIT       -> "dwarf_offsets"       (unit struct field offsets)
MEM_SOUL       -> "soul_details"
MEM_HIST_FIG   -> "hist_figure_offsets"
MEM_HIST_EVT   -> "hist_event_offsets"
MEM_HIST_ENT   -> "hist_entity_offsets"
MEM_EMOTION    -> "emotion_offsets"
MEM_ACTIVITY   -> "activity_offsets"
MEM_NEED       -> "need_offsets"
MEM_HEALTH     -> "health_offsets"
MEM_WOUND      -> "unit_wound_offsets"
MEM_RACE       -> "race_offsets"
MEM_CASTE      -> "caste_offsets"
... (29 total)
```
Not viable for Chronicler (requires same-machine, elevated privileges, breaks each DF version). Value: scope reference for what data categories are available. All data accessible via DFHack Lua using `df.global.*` paths without direct memory reading.

### O(1) Entity Lookup Optimization

- Sites: `Sites[id - 1].Id == id` fast path (1-indexed, generally contiguous).
- World grid: `Dictionary<Location, WorldRegion>` for O(1) coordinate-to-region lookup.
- Events: `BinarySearch` insertion requiring `IComparable<WorldEvent>`.
- Frontend Pinia stores cache loaded objects within session.
- LegendsBrowser2 uses `map[int]*T` for O(1) lookups across all entity types.

### UI/UX Framework Patterns

- **SPA framework**: Vuetify 3 (Material Design) + Vue 3 + Vue Router. `v-app-bar`, `v-navigation-drawer`, `v-main + v-container`, `<RouterView />` with lazy-loaded views.
- **Generic list page pattern**: Header with icon/title/subtitle + DF Wiki button; instant-filter search; `v-data-table-server` with server-side pagination and sorting; total count badge.
- **Generic detail page pattern**: Prev/Next navigation FABs; large icon + name header; optional mini-map card; type-specific slots; ExpandableCard sections for Events and Chronicles.
- **ExpandableCard pattern**: compact-content default + expanded-content on toggle. Two sizes for Family Tree (360px / 720px).
- **REST API pattern**: Paginated GET endpoints per entity type. Response: `{ items: [...], totalCount: N }`. Images transmitted as base64 PNG strings in JSON.
- **Frontend data flow**: Pinia stores per entity type cache results within session.
- **8 navigation groups**: Society, Geography, Infrastructure, Art & Craft, Warfare, Conflicts, Calamities, Rituals.
- **Tab navigation** with URL hash persistence (`#nav-leaders` etc.).
- **Bootstrap 5 dark mode** (bootstrap-dark.css), responsive layout.
- **Debug**: JSON dump at bottom of every entity page during development.

### Key SQL Patterns

**kill_count Fix**:
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

**Link Table UNIQUE Constraints (BUG-006 Fix)**:
```sql
ALTER TABLE hf_links ADD CONSTRAINT uq_hf_links UNIQUE (hf_id, target_hf_id, link_type);
ALTER TABLE hf_entity_links ADD CONSTRAINT uq_hf_entity_links UNIQUE (hf_id, entity_id, link_type);
ALTER TABLE hf_site_links ADD CONSTRAINT uq_hf_site_links UNIQUE (hf_id, site_id, link_type);
```

**Composite PK Migration Schema** (BUG-007 Fix):
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

Child table FK updates:
```
structures              → REFERENCES sites(world_id, id)
hf_links                → both hf_id and target_hf_id need (world_id, hf_id) refs
hf_entity_links         → hf_id needs (world_id, hf_id), entity_id needs (world_id, entity_id)
hf_site_links           → hf_id needs (world_id, hf_id), site_id needs (world_id, site_id)
collection_events       → both FKs need world_id prefix
collection_subcollections → both FKs need world_id prefix
event_relationships     → source_hf, target_hf need world_id
```

**New Schema Additions**:

Written Contents Schema (Phase 3.2):
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

Historical Eras Schema (Phase 3.3):
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

lua_probes Cleanup Query (Phase 4.2):
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
""", keep_count)
```

**War Name Resolution Query (Phase 2.4)**:
```sql
SELECT hec.name, hec.start_year, hec.end_year,
       a.name as attacker, d.name as defender
FROM history_event_collections hec
LEFT JOIN entities a ON hec.attacker_entity_id = a.id AND hec.world_id = a.world_id
LEFT JOIN entities d ON hec.defender_entity_id = d.id AND hec.world_id = d.world_id
WHERE hec.world_id = $1 AND hec.type = 'war'
ORDER BY hec.start_year DESC LIMIT 10
```

**Proposed Unified Storyteller Query ("Tell me about Urist")**:
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

### Zone Location Resolution (Lua)

```lua
function resolve_location(unit)
    for _, bld in ipairs(df.global.world.buildings.all) do
        if bld:getType() == df.building_type.Civzone then
            if unit.pos.x >= bld.x1 and unit.pos.x <= bld.x2
               and unit.pos.y >= bld.y1 and unit.pos.y <= bld.y2
               and unit.pos.z == bld.z then
                return bld
            end
        end
    end
    return nil
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

### Migration Execution Strategy (Phase 1.5)

No migration framework currently exists. Safe approach:
1. `pg_dump -Fc chronicler > chronicler-backup.dump`
2. Apply new schema.sql (DROP + CREATE).
3. Re-import all worlds from XML sources.
4. Verify record counts match pre-migration totals.

### df-narrator HF_FIELDS Canonical Set

```python
HF_FIELDS = {
    'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid',
    'changee_hfid', 'changer_hfid', 'woundee_hfid', 'wounder_hfid',
    'doer_hfid', 'target_hfid', 'attacker_hfid', 'defender_hfid',
    'hist_fig_id', 'body_hfid', 'hfid_target', 'hfid_attacker',
    'hfid_defender', 'trickster_hfid', 'cover_hfid', 'student_hfid',
    'teacher_hfid', 'trainer_hfid', 'seeker_hfid',
}
```

### df-narrator Calendar Conversion Formula

```python
def format_time(year, sec):
    doy = sec // 1200 + 1
    month = min((doy - 1) // 28 + 1, 12)
    day = (doy - 1) % 28 + 1
    month_names = ["Granite", "Slate", "Felsite", "Hematite", "Malachite",
                   "Galena", "Limestone", "Sandstone", "Timber", "Moonstone",
                   "Opal", "Obsidian"]
    return f"{day} {month_names[month-1]}, {year}"
```

### DF v50 Mod File System Layout

```
<DF_dir>/
  Mods/                          -- installed/downloaded mods
  data/
    vanilla/                     -- vanilla mod folders
      vanilla_creatures/
        info.txt
        objects/creature_*.txt
    installed_mods/              -- currently active world mods (auto-copied)
      <mod_id>_<version>/
  dfhack-config/
    mod-manager.json             -- DFHack modpack presets
```

### mod-manager.json Schema

```json
[{
  "name": "Default",
  "default": true,
  "modlist": [
    {"id": "vanilla_creatures", "version": 5310},
    {"id": "some_mod", "version": 100}
  ]
}]
```
Version integer construction: remove dots from `numeric_version` string (`"53.10"` → `5310`, `"1.0.0"` → `100`).

### DF v50 Patching Tokens (SELECT/CUT)

```
[SELECT_CREATURE:DWARF]           -- append tokens to existing object
  [SELECT_CASTE:FEMALE]
    [BODY_DETAIL_PLAN:FACIAL_HAIR_TISSUE_LAYERS]

[CUT_CREATURE:ELEPHANT]           -- remove object entirely

Sub-object selectors: SELECT_CASTE, SELECT_ADDITIONAL_CASTE, SELECT_MATERIAL,
                      SELECT_TISSUE, SELECT_TISSUE_LAYER, SELECT_GROWTH
```
Applicable to: `CREATURE`, `ENTITY`, `INTERACTION`, `ITEM`, `WORD/TRANSLATION/SYMBOL`, `INORGANIC`, `PLANT`, `MUSIC/SOUND`, `REACTION`.

Token removal workaround: `[CV_REMOVE_TAG]` for creatures; CUT+redefine for other types.

**Conflict semantics**: Multiple SELECTs on same object coexist (both apply). CUT after SELECT removes what SELECT targeted. CUT wins if it loads after SELECT.

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

### HTTP Serving Architecture

- **weblegends**: TCP socket listener on ports 5080–5089. One accept thread + one thread per client. Static export via `weblegends-export <folder>` — BFS crawl starting from `/`, follows all `href`/`src` attributes.
- **LegendsBrowser2**: Go HTTP server on port 58881. All routes in `server.go`. Popover endpoints return HTML snippets.

### Raw File Token Format

```
State machine: COMMENTS → TOKEN → ARGS
for each character c:
  if state == COMMENTS and c == '[': state = TOKEN
  elif state == TOKEN:
    if c == ':': state = ARGS
    elif c == ']': emit([token]); state = COMMENTS
    else: token += c
  elif state == ARGS:
    if c == ']': emit([token] + args.split(':')); reset; state = COMMENTS
    else: args += c
```

### DFHack RPC Protocol (Reference Only)

Handshake (TCP port 5000):
```
Client sends: b'DFHack?\n' + uint32(1)   # 12 bytes
Server replies: b'DFHack!\n' + uint32(1)  # 12 bytes
```
Frame format (8-byte header + protobuf payload, little-endian):
```
bytes [0:2]  — int16: message ID (negative = reply code, positive = bound method ID)
bytes [2:4]  — padding (0x0000)
bytes [4:8]  — int32: payload size in bytes
```
Reply codes: `-1` = RESULT (success), `-2` = FAIL, `-3` = TEXT (raises exception), `-4` = QUIT.

CRITICAL: TCP RPC is BROKEN for game-thread calls on DFHack 53.x under Prism/UTM. Use `dfhack-run` over SSH exclusively.

### df-structures: Canonical HF Profile Pointer Bag

All nullable, accessed via `hf.info`:
```
metaphysical  -> spheres, appearance, deity form
skills        -> skill list, professions, account_balance, employment_held
pets          -> owned creature races
personality   -> unit_personality + mood
masterpieces  -> creation events, art image chunks
whereabouts   -> location: state, site_id, region_id, army_id, body_state, year, tick, smm coords
kills         -> kill events, killed races/sites/counts
wounds        -> missing body parts, childbirth
known_info    -> secrets, identities, witness reports, rumor events, creature knowledge,
                 poetic/musical/dance forms, scholar knowledge, belief systems, known locations
curse         -> necromancy, transformations, undead status
books         -> held artifacts, equipment
reputation    -> wanted status, identities, journey profile
relationships -> hf_visual (current), hf_historical (past), intrigues
```

### Event Collection Classification Sets (for filtering)

```python
COMBAT_EVENTS = {"attacked site", "hf attacked site", "field battle", "squad vs squad",
                 "hf destroyed site", "plundered site", "site taken over", "razed structure",
                 "hf simple battle event", "tactical situation", "site dispute", "reclaim site"}
COLLECTION_WAR_TYPES = {"war", "battle", "siege", "attack", "raid", "insurrection"}
ARTIFACT_EVENT_TYPES = {"artifact created", "artifact given", "artifact lost", "artifact possessed",
                         "artifact stored", "item stolen", "artifact claim formed", "masterpiece item"}
# Artifact journey subset (chronological sort by (year, sec)):
ARTIFACT_JOURNEY = {"artifact created", "artifact given", "artifact lost",
                    "item stolen", "artifact possessed", "artifact stored"}
```

### Chronicler-Specific Advantages Over Reference Tools

1. **Persistent PostgreSQL database**: Enables historical diffs across saves, trend analysis, cross-session queries, incremental updates.
2. **LLM-enhanced narrative**: LLM generation for richer, non-repetitive narrative prose beyond templates.
3. **API-first design**: JSON APIs enabling external tooling and programmatic access.
4. **Live DFHack integration**: Data unavailable in XML: current inhabitants, site ownership, creature raw data for interaction text, squad names, occupation detail, age from live tick.
5. **Cross-save analytics**: Track population trends, war outcomes, artifact journeys across multiple fortress saves.
6. **Mod history in DB**: Unique feature — link game events to the modpack active at time of generation. "What mods were active when this artifact was created?"

### Test Coverage Requirements

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

## Key Insights & Recommendations

### Narrative Architecture

1. **Template-based vs. LLM-based rendering**: df-narrator, weblegends, and LegendsBrowser all use deterministic string templates. Chronicler's unique advantage is LLM generation for richer, non-repetitive narrative prose. Templates remain as fast fallback and training scaffolding.

2. **Context-aware self-reference suppression is critical**: The weblegends `event_context` pattern prevents narrative from being flooded with redundant constructions. Must be implemented in Chronicler's narrative layer.

3. **Scoring formulas are well-calibrated**: df-narrator's four scoring formulas represent accumulated community knowledge. The figure score weights (deity > kills > artifacts > events) align with what players find compelling. Do not discard in favor of raw "most events" ranking.

4. **Co-appearance rivalry detection** is lightweight but effective: surfaces meaningful figure pairs without requiring explicit relationship links.

5. **Death cause granularity matters**: DF has 50+ distinct death causes. Rendering as generic "died" is a significant quality loss. Live cause lookup via incidents is required for fortress-mode deaths.

### Event Type Coverage

6. **94 weblegends handlers vs. 132 LegendsBrowser2 types vs. 144 df-structures types**: LegendsBrowser2 is most complete for DF 0.47+. df-structures defines 144 variants — the definitive ceiling. Chronicler should target df-structures' full set.

7. **Masterpiece events (6 types)**: Often overlooked but track the craftwork and cultural output of civilizations.

### Data Model Insights

8. **Ruin state must be derived from events**: Sites and structures don't have an explicit `ruin` flag in XML — ruin status must be inferred during post-parse processing. LegendsBrowser2's `processEvents()` implements this correctly.

9. **Entity type inference for non-plus mode**: Without `legends_plus.xml`, entity types must be inferred from events. LegendsBrowser2 has hardcoded position name lists for dwarf/elf/human/goblin entities as fallback. Modded games with custom entities require a different strategy.

10. **Kill list construction**: HF kill lists are not stored directly in the XML. Must be built during processing by scanning all `HfDied` events and indexing `slayer_hfid`.

11. **Relationship profiles are plus-mode only**: Reputation scores (hero, murderer, psychopath) are in `legends_plus.xml`. Without it, only basic link types are available.

12. **Complete data available via DFHack Lua**: All of Dwarf Therapist's 29-section memory layout data is accessible via `df.global.*` paths without direct memory reading. TCP RPC is broken for game-thread calls on DFHack 53.x under Prism — use `dfhack-run` over SSH exclusively.

13. **Data integrity before features**: Composite PKs, kill_count fix, and link deduplication must be done before any new features — everything builds on potentially corrupt foundations without these fixes.

14. **Explicit world_id on every table** (denormalized): Enables direct queries without JOINs. Consistent with existing pattern.

15. **Same ID space between legends and live data**: `world.history.events` is one vector. Enables unified `history_events` timeline table.

16. **Control character filtering is mandatory**: Without FilteredStream-equivalent, DF XML import will throw on raw control character output. IBM CP473 encoding must also be handled.

### Visualization Insights

17. **The Leaflet world map is the centerpiece feature**: Integrates all geographic entity types with entity-specific color coding and hover popovers. Battle markers on war pages make conflict geography immediately legible.

18. **The SVG Family Tree is a signature feature users love**: Unique to LegendsBrowser v1 and not present in v2 — a gap that Chronicler can fill. The layout algorithm is self-contained and portable.

19. **The Curse Lineage Tree** is compelling narrative visualization not in LB2. Tracing vampirism/werebeast infection chains is a compelling DF story element.

20. **D3 chord diagrams for wars** provide at-a-glance overview of inter-civilization conflict patterns impossible to convey in tabular form.

21. **Consistent civilization-colored visualization**: Consistent per-civilization colors across map, graph, and list views dramatically reduce cognitive load.

22. **Event HTML rendering server-side unlocks rich UX cheaply**: Generating cross-linked HTML on the backend means frontend only needs `v-html` injection.

### XML Parsing Insights

23. **Custom tokenizers outperform standard XML libraries** for DF-sized exports. Python ETL should use SAX or iterparse with `root.clear()` after each element.

24. **Code generation from XML structure analysis** (LegendsBrowser2's `analyze/` tool) produces the most maintainable parser. Worth considering for long-term maintainability.

### Performance Insights

25. **Pagination at 1000 events/page** is the right threshold for figures/sites with dense histories. Without pagination, pages for major deities can have tens of thousands of events.

26. **500-tick polling rate (≈12 seconds) is production-validated** by myDFHackScripts collection.

27. **Generic watcher factory pattern is the reusable core**: The `Helper.watch()` closure is the correct abstraction for all Chronicler polling. Must be extended to handle deletions.

28. **All-in-memory maps vs. database**: LegendsBrowser2 keeps all data in `map[int]*T` for O(1) lookups. Chronicler's PostgreSQL backend gains persistence, cross-save diffing, and analytical queries at the cost of needing careful indexing strategy.

### Mod Management Insights

29. **v50 is a clean break from pre-v50 modding**: SELECT/CUT tokens, info.txt metadata, and mod-manager.json are new in v50. PyLNP, PyDwarf, and pre-v50 tools do not handle these. Chronicler must target v50 natively.

30. **Duplicate object IDs cause silent corruption, not last-wins**: The most dangerous raw conflict. Level 2 conflict detection (object ID deduplication) is critical for safety.

31. **DFHack's `gui/mod-manager` Lua API is undocumented**: Filesystem scan is the more robust primary path. DFHack query is the enriched secondary path.

32. **The DF mod ecosystem has no LOOT equivalent**: No centralized conflict ruleset, no automated dependency graph resolution. Chronicler has an opportunity to fill this gap.

33. **Modpack history in DB enables powerful queries**: Unique feature — "what mods were running when this legendary artifact was created?"

34. **Cross-platform requirement**: ModHearth is Windows-only. Chronicler's mod management UI must be platform-neutral (web frontend or cross-platform Python UI).

35. **Steam Workshop integration gap**: No existing DF tool integrates Steam Workshop mod browsing, install, and update. Significant UX gap Chronicler could address.

36. **Reactive control vs. goal planner**: df-ai's invariant-maintenance architecture is more robust than an explicit goal tree. Advisor recommendations should always be framed as "current deviation from desired state → corrective action."

37. **Stock threshold per-capita scaling is essential**: `NeededPerDwarf` mechanism handles population scaling automatically. Thresholds valid for 20 dwarves are wrong for 150 dwarves.

38. **Exclusive action serialization**: Never attempt concurrent multi-step game interactions. One active action chain at a time, queued FIFO.

39. **legends_plus.xml is transformative**: Adds relationship data, extended fields, and event relationships that make the legends database dramatically richer. Must prioritize plus-file integration.

40. **Breadcrumb/adjacent-ID navigation is essential for exploration**: Prev/next controls — not just back buttons — to explore adjacent records, especially for event logs and HF lists.

### Chronicler Integration Priorities

**Must-have for feature parity (all reference tools)**:
- All 132+ event types rendered as human-readable narrative sentences
- Full entity pages for all entity types
- Event filtering by entity (RelatedTo* interface or equivalent DB query)
- Collection hierarchy navigation (wars → battles → events)
- Hover popovers on all entity links
- Tab navigation on entity pages
- Global search with live autocomplete
- Perspective-aware event rendering
- Interactive Leaflet world map with layer toggles and entity color-coding
- Death cause rendering (50+ causes → specific prose)
- Circumstance/reason rendering
- DF calendar formatting (seconds72 → named month/day/season)
- Ruin state tracking derived from events
- Post-parse processing pipeline (kill lists, collection links, ruin status)

**High value (significantly enhance quality)**:
- df-narrator's 4 scoring formulas for entity importance ranking
- SVG Family Tree (multi-generation genealogy)
- Curse Lineage Tree (vampire/werebeast infection chains)
- D3 chord diagram for inter-civilization wars
- D3 population donut chart
- Interaction text from game raws (hist_string_1/2 via DFHack)
- Co-appearance rivalry detection
- Entity reputation scores from plus-mode data
- Squad links and site property links on HF pages
- Season display in event timestamps
- Live DFHack monitoring (deaths, arrivals, artifacts, announcements)

**Chronicler-exclusive (leverage unique architecture)**:
- Historical diffs across saves (cross-session trend analysis)
- LLM-generated narrative enrichment beyond templates
- JSON APIs for external tooling
- Live DFHack integration for current game state
- Cross-save artifact journey tracking
- Modpack history linked to world/event records
- "What mods were active when X happened?" query capability

---

## Open Items

### Verification Needed

| Assumption | Verification Method |
|------------|---------------------|
| `event_type = 'hf died'` matches DF XML output | Check actual XML event type text values |
| Region parsing captures spurious elements | Grep XML for `<region>` tags outside `<regions>` section |
| World 2 has ~28K HFs (5,466 lost = 19.5%) | Re-import World 2 in isolation and count |
| Written contents exist in our legends_plus XML | Check XML file for `<written_contents>` section |
| Kill count fix + re-computation is sufficient | Verify no cached/derived data depends on old kill_count values |
| Current xml_parser.py handles control characters | Check for FilteredStream-equivalent in ingestion pipeline |
| IBM CP473 encoding handled in xml_parser.py | Verify or add explicit encoding conversion |
| DFHack TCP RPC broken only under Prism, or all DFHack 53.x | Test on native Windows (HomeServer) |
| RFR 41 functions would work on HomeServer (native Windows) | Test on 192.168.4.194 deployment |
| Version integer format `"53.10"` → `5310` | Validate against actual DFHack behavior |
| Steam Workshop path on macOS | Test macOS Steam installation paths |

### Unresolved Design Decisions

- **lua_probes time-series vs. UPSERT**: Keep INSERT-only for time-series history, or UPSERT for current-snapshot-only? Configurable archival option (keep all last 24 hours, then hourly for older)?
- **Multi-participant events**: JSONB array `participants` on history_events row, or separate `event_participants` junction table?
- **DFHack TCP RPC vs. dfhack-run over SSH for future expansion**: Is SSH-based `dfhack-run` the permanent transport?
- **Manager order search with no results — CHEAT fallback**: Should Chronicler's advisor adopt the "CHEAT fallback" (force-overwrite first order with logging) or fail gracefully with a user alert?
- **Integration of df-ai heuristics as LLM system prompt content vs. compiled rules**: Best approach for each category TBD.
- **Observatory / Player Character distinction**: How does Chronicler determine which HFs are "player-related" in the database?
- **Map generation**: Use DF-exported `.bmp` if present vs. SkiaSharp/Pillow/equivalent programmatic generation from `regions` data?
- **Frontend framework**: Confirm Vue 3 + Vuetify 3 as Chronicler's choice, or decide on alternatives.
- **Event collection sub-events in Storyteller retrieval**: Should the Storyteller join to individual `history_events` within a collection for richer context?
- **Conflict resolution for modpack transitions mid-save**: What is the policy for modpack history inconsistency if user switches modpacks within an active world?
- **Level 2 conflict detection performance**: For large modpacks (50+ mods), benchmarking needed. Consider caching parsed object inventories.
- **Worldgen Lua access**: Whether DFHack Lua polling works on the worldgen screen is unconfirmed. Standard scripts only run in fortress mode.
- **Plus-mode inference completeness**: LegendsBrowser2's non-plus mode inference uses hardcoded position name lists for dwarf/elf/human/goblin entities. For modded games with custom entities, this inference breaks. Need a strategy for modded-game entity type detection without plus-mode data.
- **HF profile pointer bag nullable handling**: All `hf.info` sub-pointers are nullable. The ETL pipeline must handle all nullable paths gracefully.
- **Worldgen vs. post-worldgen HF data completeness**: `hf.worldgen_relationships` (up to 6 quick relationships with 22 types) exists only during worldgen and may not persist in post-worldgen data. Need to determine when to extract this.
- **Static export use case**: weblegends supports BFS-crawl static export for offline/sharing. Chronicler has no equivalent. Low priority but useful.
- **Map coordinate system for non-square worlds**: Need to verify L.CRS.Simple handles all world sizes with proper aspect ratio mapping.
- **PyLNP three-way merge with SELECT/CUT**: Line-based text merging is insufficient for v50 mods — full solution requires raw compiler pipeline.
- **Steam Workshop path on macOS**: The path `<Steam>/steamapps/workshop/content/975370/` is Windows-centric; macOS differs.
- **CoreSuspender under Prism**: TCP RPC game-thread calls confirmed broken on DFHack 53.x under Prism/UTM. Whether this affects all DFHack 53.x deployments or only Prism-virtualized ones is unconfirmed. Matters for HomeServer deployment.
- **RemoteFortressReader on native Windows**: RFR IS loaded (41 functions) but game-thread dispatch hangs under Prism. Whether RFR calls would work on HomeServer (native Windows) is untested.

### Gaps in Current Data Capture

- No position/noble tracking in live bridge.
- No HF link tracking in live bridge.
- `world.activities` not captured (parties, performances, scholarly work, training).
- `world.written_contents.all` in live bridge not captured.
- `world.jobs.list` not captured (workshop orders, construction tasks).
- Individual building footprints not captured.
- Corpse spatial data not captured.
- Full personality memories and preferences vectors not captured.
- Loyalty cascade causality may still be lost.
- Intermediate states (berserk dwarf who dies within one poll window) missable without DFHack EventManager.
- All HF sub-profile fields listed above remain unextracted from Legends XML.
- 12 event types defined in df-structures but not yet handled by any reference tool — need identification.

### Phase Completion Status

**Phase 0 — Data Integrity Hotfixes (~1 hour)**:
| Item | Status | Effort |
|------|--------|--------|
| 0.1 Fix kill_count computation (BUG-005) | NOT DONE | LOW (5 lines) |
| 0.2 Add link table UNIQUE constraints (BUG-006) | NOT DONE | MEDIUM |
| 0.3 Fix region parsing scope (BUG-008) | NOT DONE | LOW (1 line) |

**Phase 1 — Composite PK Schema Migration (4-6 hours)**:
| Item | Status | Effort |
|------|--------|--------|
| 1.x Composite PK migration (BUG-007) | NOT DONE | HIGH |

**Phase 2 — Storyteller Enrichment (3-4 hours)**:
| Item | Status | Effort |
|------|--------|--------|
| 2.1 Relationship traversal in storyteller | NOT DONE | MEDIUM |
| 2.2 Event payload enrichment in storyteller | NOT DONE | MEDIUM |
| 2.3 Emotion/zone data in live unit queries | NOT DONE | MEDIUM |
| 2.4 War name resolution | NOT DONE | LOW |
| 2.5 Confidence signaling in prompts | NOT DONE | LOW |

**Phase 3 — XML Completeness (2-3 hours)**:
| Item | Status | Effort |
|------|--------|--------|
| 3.1 Verify / fix region parsing | NOT DONE | LOW |
| 3.2 Written contents table + parser | NOT DONE | MEDIUM |
| 3.3 Historical eras table + parser | NOT DONE | MEDIUM |
| 3.4 Entity populations parsing | NOT DONE | MEDIUM (optional) |
| 3.5 Art forms (poetic/musical/dance) | NOT DONE | LOW |

**Phase 4 — Operational Hardening (4-6 hours)**:
| Item | Status | Effort |
|------|--------|--------|
| 4.1 Core test suite | NOT DONE | HIGH |
| 4.2 lua_probes cleanup | NOT DONE | LOW |
| 4.3 Bridge health monitoring | NOT DONE | LOW |
| 4.4 Migration framework | NOT DONE | MEDIUM (optional) |

**Previously Completed Items**:
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

---

## Metrics & Targets

- **Current data capture coverage**: ~15-20% of available DF data.
- **DF data dimensions**: 93 top-level `df.global.world` fields, 141+ history event types, 250+ announcement types, 100+ unit fields per dwarf.
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
- **kill_count fix effort**: ~5 lines.
- **LegendsViewer-Next event type count**: 115 WorldEvent types + 19 EventCollection types (canonical authoritative reference).
- **LegendsBrowser2 event type count**: 132 types.
- **df-structures event type count**: 144 types (definitive ceiling).
- **weblegends event handler count**: 94 handlers.
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
| df-narrator reference | `/Users/nathanielcannon/Claude/GitRepos/df-narrator/` |
| weblegends reference | `/Users/nathanielcannon/Claude/GitRepos/weblegends/` |
| LegendsBrowser v1 reference | `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/` |
| LegendsBrowser2 reference | `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/` |
| dfhack-client-python reference | `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/` |
| DwarfFortressLogger reference | `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/` |
| myDFHackScripts reference | `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/` |
| DwarvenSurveyor reference | `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/` |
| DF-Modloader reference | `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/` |
| ModHearth reference | `/Users/nathanielcannon/Claude/GitRepos/ModHearth/` |
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

### LegendsBrowser2 Additional Event Types (132 total, DF 0.47+)

Complete coverage adds these to the above: HfSimpleBattleEvent, HfWounded, HfEnslaved, HfFreed, HfRansomed, HfAttackedSite, HfDestroyedSite, HfConfronted, BodyAbused, CreatureDevoured, HfDoesInteraction, HfLearnsSecret, HfGainsSecretGoal, HfPerformedHorribleExperiments, HfDisturbedStructure, HfPrayedInsideStructure, HfPreach, HfProfanedStructure, HolyCityDeclaration, HfAskedAboutArtifact, HfViewedArtifact, HfConvicted, HfInterrogated, HfCarouse, HfGamble, AssumeIdentity, FailedFrameAttempt, FailedIntrigueCorruption, Sabotage, ArtifactHidden, ArtifactDropped, MasterpieceArchConstructed, MasterpieceDye, MasterpieceEngraving, MasterpieceFood, MasterpieceItem, MasterpieceItemImprovement, MasterpieceLost, EntityCreated, EntityDissolved, EntityIncorporated, EntityAllianceFormed, EntityOverthrown, EntityLaw, EntityPersecuted, EntityPrimaryCriminals, EntityEquipmentPurchase, EntityBreachFeatureLayer, EntityExpelsHf, CreateEntityPosition, InsurrectionStarted, RegionpopIncorporatedIntoEntity, ItemStolen, AgreementFormed, AgreementMade, AgreementConcluded, AgreementRejected, Trade, Merchant, DiplomatLost, FirstContact, FirstContactFailed, PeaceAccepted, PeaceRejected, FieldBattle, SquadVsSquad, TacticalSituation, SneakIntoSite, SpottedLeavingSite, ArtFormCreated, DanceFormCreated, MusicalFormCreated, PoeticFormCreated, WrittenContentComposed, KnowledgeDiscovered, AddEntitySiteProfileFlag, Ceremony, Competition, Performance, Procession.

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

### Site Key Fields

SiteType (22 types), UntranslatedName, Coordinates (List<Location>), Rectangle, Region, Structures, OwnerHistory (List<OwnerPeriod>), SiteProperties, RelatedHistoricalFigures, Battles, Conquerings, Raids, Duels, Purges, Persecutions, Insurrections, Coups, Abductions, BeastAttacks.

### Entity Key Fields

EntityType (11 types), IsCiv, Race, SiteHistory, EntityPositions, EntityPositionAssignments, EntityPopulation, Parent, Groups, EntityOccasions, LineColor, EntityEntityLinks.

### World Core Collections

Regions, UndergroundRegions, Landmasses, MountainPeaks, Rivers, Sites, HistoricalFigures, Entities, Eras, Artifacts, WorldConstructions, PoeticForms, MusicalForms, DanceForms, WrittenContents, Structures, Identities, EntityPopulations.

---

*Consolidated from*:
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/tmp/round2-pair-05.md` (Data Quality Analysis & Reference Tool Research, 2026-02-24)
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/tmp/round2-pair-06.md` (External Tools & Ecosystem Research, 2026-02-24)
*Round 3 consolidation date: 2026-02-25*
