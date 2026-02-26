# Round 2 Consolidation: External Tools & Ecosystem Research

## Source Documents

This document consolidates four rounds of source-level analysis across seven repositories and multiple reference tools:

- **df-narrator** (Python XML entity scoring + Markdown narrative generation)
- **weblegends** (C++ DFHack plugin, live in-game Wikipedia-style HTML server)
- **LegendsBrowser** (Java, DF 0.44 — most feature-complete XML browser)
- **LegendsBrowser2** (Go, DF 0.47 — most complete event type coverage)
- **dfhack-client-python** (RPC protocol reference)
- **DwarfFortressLogger / Dwarf Therapist** (memory layout architecture)
- **df-structures** (canonical DF field definitions)
- **myDFHackScripts** (Lua production bridge patterns)
- **DwarvenSurveyor** (C# XML streaming parser)
- **DF-Modloader** (Python raw compiler)
- **ModHearth** (C# DFHack-integrated GUI mod manager)
- **PyLNP** (three-way merge mod manager)
- **PyDwarf** (token-level raw API)
- **NexusMods/Vortex** (reference patterns)

---

## All Features & Requirements

### Entity Scoring and Importance Ranking

All scoring formulas below represent accumulated community knowledge and should become Chronicler's canonical "importance" ranking. They drive "Featured"/"Notable" UI badges, AI storyteller prioritization, and narrative focus selection.

**Figure Importance Score** (df-narrator verbatim formula):
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

**Special Type Detection (from event data)**:
- Vampire: any `active_interaction` containing "VAMPIRE" (case-insensitive)
- Necromancer: any `active_interaction` containing "NECROMANCER" or "RAISE"
- Werebeast: HfDoesInteraction events with `DEITY_CURSE_WEREBEAST_*` interaction
- Megabeast (XML-only): hardcoded race set — prefer weblegends approach: creature_raw_flags `HAS_ANY_TITAN` / `HAS_ANY_FEATURE_BEAST` / `HAS_ANY_UNIQUE_DEMON` (more robust for modded games)
- Deity/Force/Ghost/Adventurer: direct XML `associated_type` field
- From DFHack Lua: `hf.deity`, `hf.force`, `hf.ghost`, `hf.worldgen_acted`, `hf.brag_on_kill`, `hf.kill_quest`, `hf.chatworthy` flags

---

### Historical Figure Pages

Every HF page should display all of the following (consolidated from all tools):

**Identity and Status**
- Native + English name (e.g. "Kogan Uzolam, 'Blademaster'")
- Race, caste, sex (with gender icon and sex symbol from creature raws)
- Birth and death years with DF calendar formatting
- Special type flags with icons: deity/force/vampire/werebeast/necromancer/adventurer/ghost/leader
- Curse/transformation: if figure has an active curse with body transformation, render target caste's description
- Spheres of influence (for deities and forces)
- Goals list
- Journey pets list
- Kill count (computed from HfDied events where SlayerHfid matches this figure)
- Age at death rendered as fractional years (HTML fractions: ¼, ½, ¾ based on DF 28-day months)
- Computed importance score
- Orientation flags (from DFHack `hf.orientation_flags`)
- Curse year and curse seconds (from DFHack)
- Worldgen flags: `worldgen_acted`, `brag_on_kill`, `kill_quest`, `chatworthy`

**Extended HF Profile (via DFHack `hf.info` pointer — all nullable)**:
- Skills: `info.skills.skills` (job_skill enum vector) + `info.skills.points` (parallel XP vector), `professions_held`, `profession_years`, `account_balance`
- Location/whereabouts: `info.whereabouts.state`, `site_id`, `subregion_id`, `feature_layer_id`, `army_id`, `body_state` (Active, BuriedAtSite, UnburiedAtBattlefield, etc.), `year`, `year_tick`, `abs_smm_x/y` (strategic map coords)
- Personality: `info.personality.personality` (full `unit_personality` compound), mannerisms (70+ types), values, ethics, thought history (80+ categories)
- Kill records: `info.kills` vector — kill events with victim name/race/year/site/count
- Knowledge: `info.known_info.known_secrets`, `known_written_contents`, `known_identities`, `known_witness_reports`, `known_events`, `creature_knowledge`, `known_poetic_forms`, `known_musical_forms`, `known_dance_forms`, `belief_systems`, `known_locations`
- Reputation: `info.reputation` — wanted status, identities, journey profile
- Curse/interaction: `info.curse` — necromancy, transformations, undead status
- Artifacts held: `info.books` — inventory_profilest, held artifacts and equipment
- Masterpieces: `info.masterpieces` — creation events, art image chunks
- Metaphysical: `info.metaphysical` — spheres, appearance, deity form
- Relationships: `info.relationships.hf_visual` (current active), `info.relationships.hf_historical` (past), intrigues
- Wounds: `info.wounds` — missing body parts, childbirth
- Pets: `info.pets` — owned creature races

**Related Figures (HF-to-HF links)**
- All relationship types with sex-specific labels: mother, father, spouse/wife/husband, child/son/daughter, lover, companion, prisoner/imprisoner, master/apprentice/former_master/former_apprentice, pet_owner (show "pet" if creature adopts owner), former_spouse, deceased_spouse
- Deity worship strength (dubious <10, casual <25, average <75, faithful <90, ardent ≥90)
- Vague relationships (plus-mode)
- Intrigue actors and plots
- Worldgen-only quick relationships: `childhood_friend`, `war_buddy`, `jealous_obsession`, `lover`, `former_lover`, `scholar_buddy`, `artistic_buddy`, `athlete_buddy`, `athletic_rival`, `business_rival`, `religious_persecution_grudge`, `grudge`, `lieutenant`, `worshipped_deity`, `spouse`, `mother`, `father`, `master`, `apprentice`, `companion`, `ex_spouse`, `neighbor`, `shared_entity`

**Related Entities (HF-to-Entity links)**
- member, former_member, mercenary, former_mercenary, slave, former_slave, prisoner, former_prisoner, enemy, criminal
- Current and former positions with sex-specific title, start year / year range
- Squad links (current and former, with squad name and years)
- Occupation roles: tavern_keeper, performer, scholar, mercenary, monster_slayer, scribe, messenger (with linked location)
- Entity reputations with numeric scores: unsolved murders, first ageless year, hero, violent, psychopath, enemy fighter, friendly fighter, killer, murderer, poet, bard, dancer, storyteller, treasure hunter, preacher, brigand, intruder, monster, thief, hated/respected group, hunter, loyal soldier, comrade, bully

**Related Sites (HF-to-Site links)**
- occupation, seat_of_power, hangout, home (linking to specific structure if HOME_SITE_ABSTRACT_BUILDING), lair, prison
- Site property links (owned properties within sites)

**Used Identities**
- All identities used, with current identity flagged

**Full Event History**
- Paginated (1000 events/page), chronological
- Perspective-aware rendering: references to this HF render as short name/pronoun, not a link
- Season display in timestamps ("early spring of 125")

**Visualization: SVG Family Tree** (LegendsBrowser v1, high-value):
- Multi-generation genealogy: up to 3 generations up, all generations down
- Tree layout algorithm computing x-positions for non-overlapping nodes
- Nodes as colored rectangles (blue=male, pink=female, gold=deity, highlighted=self)
- Edges: horizontal for spouse links, L-shaped for parent-child
- Shows name, relation label (mother/father/son/daughter/grandson/uncle/etc.), birth/death years
- Auto-scroll to center on subject

**Visualization: Curse Lineage Tree** (LegendsBrowser v1, high-value):
- For vampires and werebeasts: "who bit whom" tree
- Traces HfDoesInteraction events for `DEITY_CURSE_WEREBEAST_*` and `DEITY_CURSE_VAMPIRE_*`
- Traverses upward to find Patient Zero (original curse source)
- Uses same SVG tree engine as family tree

---

### Entity (Civilization/Group) Pages

**Tabs on entity page**:
1. Leaders — table of leaders with date range (from/till year), linked to HF pages
2. Sites — table of all sites controlled, each with inline site creation/takeover/destruction history
3. Members — list of member HFs
4. Groups — child entities (sub-organizations)
5. Wars — table of wars: date range, war name (linked to collection), enemy entity (attacker/defender role)

**Plus content**:
- Administrative positions with holder (or "vacant"), sex-specific title, squad if applicable, linked site if land-holder
- Occasions (ceremonies, competitions, performances, processions) with schedule
- Entity honors list
- Entity position definitions (male/female names, succession type, spouse relationships, max age)
- Entity reputations and entity-to-entity links
- Worship list (deity figures worshipped)
- Weapons/equipment list

**Visualization**:
- Mini-map showing all owned sites
- D3 War Chord Diagram (LegendsBrowser v1): inter-civilization war relationships, each civ as arc segment, chords connecting warring civs, hover highlights
- Entity type icons (Font Awesome): crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity, etc.

**Entity type categorization** (from weblegends `categorize()`):
- civilization, site_government/population, vessel_crew, migrating_group, bandit_gang, religion (with worshipped deities listed), military_unit (mercenary/shadowy/versatile), outcasts, performance_troupe, merchant_company, guild

---

### Site Pages

**Tabs on site page**:
1. Structures — table of all structures (name, type, ruin status)
2. Properties — site properties (owner HF, type, linked structure)
3. History — site-level history events (creation, takeover, destruction, reclamation)

**Plus content**:
- Site type detail: fortress, hillockDwarf, camp, cavern, tomb, dark_fortress, mountain_hall, forest_retreat, town/hamlet, important_location, lair/simple_mound/simple_burrow/labyrinth/shrine/nest, castle/tower/monastery/fort, vault_monument
- Map: minimap rendering of site's global bounding box coordinates
- World populations and animal populations at site
- Current inhabitants: named HFs (via nemesis records) + anonymous populations with entity/civ affiliations
- Current artifacts located at site
- Current site ownership (live from DFHack, not from XML)
- Related entities with relationship type: capital, holy_city, monument, base_of_operation, residence, criminal_gang, primary_criminal_gang

**Structure sub-pages** (site-N/bld-M routing):
- Structure name, type, ruin status
- Structure type taxonomy: mead_hall, keep, temple (of specific deity), dark_tower, market, tomb (of specific HF), dungeon/sewers/catacombs, underworld_spire, tavern, library, counting_house, guildhall, tower, monastery, castle
- Full event history for the structure

---

### Event Collection Pages (Wars, Battles, etc.)

**Collection hierarchy**: wars contain battles/sieges, battles contain individual events. All levels navigable.

**War collection page**:
- Map showing all sites of both entities plus all battle markers (red diamond polygons)
- Aggressor and defender entities
- Date range, war name
- Expandable sub-collections (battles, sieges) in chronological order
- All events in the war

**Battle collection page**:
- Name, outcome
- Site location and map marker
- Attacking and defending squads with origin sites
- Member events: FieldBattle, SquadVsSquad, TacticalSituation, HfDied, HfWounded, etc.

**All other collection types** (each with appropriate summary and event list):
- beast_attack — attacker HFs, rampage count at site
- abduction — target HFs, location
- duel — participants
- entity_overthrown — target entity and site
- insurrection — site
- journey — traveler HFs
- occasion — entity, name, commemoration event (with sub-collections: ceremony, competition, performance, procession)
- persecution — target entity and site
- purge — purge adjective and site
- raid — site
- site_conquered — site
- theft — site

**On entity Wars tab**: wars displayed with date range, war name (linked), role (attacking/defending), enemy entity (linked).

---

### Artifact Pages

- Name, item description, material, item type, item subtype
- Page count (for written works)
- Contained written content link (for books/scrolls — italicized in links per weblegends pattern)
- Current location: site and structure link
- Current holder: HF link
- Creator HF link, creation year
- Unique holder count, lost/stolen status
- Artifact journey: chronological sequence of events (created, given, lost, stolen, possessed, stored) with year and parties involved
- Full event history
- Artifact flag detection via `item.flags.artifact` on created items (DFHack)
- Chain-of-custody: link all artifact events together by artifact ID from creation through destruction

---

### Written Content Pages

- Name, form (poem, short_story, musical_composition, choreography, etc.)
- Author HF link
- Linked art form (poetic/musical/dance form)
- References section (what the work refers to: entities, HFs, other forms)
- Style list
- Full event history

---

### Art Form Pages (Dance, Music, Poetry)

- Name, description with hyperlinked entity/HF/form mentions
- The `LinkDescription()` pattern: parse description text and replace entity/HF/form names with HTML links
- Full event history

---

### Geography Pages

- **Regions**: name, type, evilness (good/evil/neutral, color-coded: fuchsia=evil, aqua=good), full event history, region outline on map
- **Underground regions**: parsed data, dedicated view
- **Landmasses**: name, coordinate bounds, map highlight
- **Mountain peaks**: name, coords, volcano flag, map marker
- **Rivers**: name, list of paths, map rendering
- **World Constructions**: name, type (road, tunnel, bridge), coords, map marker, full event history
- Region terrain types (10 values): wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains

---

### Identity Pages

- Name, profession, entity link
- Used-by HF (cross-linked from events)
- Full event history

---

### World/Civilization Dashboard (Home Page)

- Entities grouped by race, showing only civilization-type entities and necromancer groups
- Interactive Leaflet world map (see Visualization section)
- Population tab with D3 donut/pie chart breakdown by race with numbers (LegendsBrowser v1)
- Wars tab with D3 chord diagram showing inter-civilization war relationships (LegendsBrowser v1)
- World statistics summary: years of recorded history, site count by type, civilization count, HF count, event count, artifact count

---

### Years and Events Browser

- `/years` — all years with event counts, grouped (chronological index of all history)
- `/year/{id}` — all events that occurred in that year as narrative sentences
- `/events` — all known event types as a list
- `/events/{type}` — all events of a given type, chronologically
- `/event/{id}` — individual event detail

---

### Global Search

- Full-text substring search (case-insensitive) across: historical figures, entities, sites, structures, regions, artifacts, world constructions, dance forms, musical forms, poetic forms, written contents, landmasses, mountain peaks, identities
- Live autocomplete via `GET /search?term=` returning JSON `[{label, value}]`
- Custom lightweight autocomplete widget fetching 50 suggestions per keystroke; navigates directly on selection
- Full results page with categorized results and counts per category
- HF list filtering by URL parameters: leader, deity, force, vampire, werebeast, necromancer, alive, ghost, adventurer, race
- HF sort options: name, race, birth, death, kills

---

### Narrative Event Rendering

**Core principle**: Every event should render as a human-readable narrative sentence, not a raw type code.

**Context-aware rendering**:
- Render events from the "perspective" of the current entity: suppress self-links (plain text for the current entity), use relational pronouns ("his wife", "her son")
- The `event_context` struct / `Context{HfId}` pattern from weblegends and LegendsBrowser2 is the right model
- "Story mode" rendering for WrittenContent references

**Death event rendering** (40+ death cause variants — render each as specific prose):
NONE, OLD_AGE, HUNGER, THIRST, SHOT, BLEED, DROWN, SUFFOCATE, STRUCK_DOWN, SCUTTLE, COLLISION, MAGMA, MAGMA_MIST, DRAGONFIRE, FIRE, SCALD, CAVEIN, DRAWBRIDGE, FALLING_ROCKS, CHASM, CAGE, MURDER, TRAP, VANISH, QUIT, ABANDON, HEAT, COLD, SPIKE, ENCASE_LAVA, ENCASE_MAGMA, ENCASE_ICE, BEHEAD, CRUCIFY, BURY_ALIVE, DROWN_ALT, BURN_ALIVE, FEED_TO_BEASTS, HACK_TO_PIECES, LEAVE_OUT_IN_AIR, BOIL, MELT, CONDENSE, SOLIDIFY, INFECTION, MEMORIALIZE, SCARE, DARKNESS, COLLAPSE, DRAIN_BLOOD, SLAUGHTER, VEHICLE, FALLING_OBJECT, LEAPT_FROM_HEIGHT, DROWN_ALT2, EXECUTION_GENERIC
- Each cause has a specific verb phrase (e.g. "was beheaded", "was burned to a crisp", "drowned")
- Append weapon info where available
- Append slayer (HF or creature race)
- Append age at death
- Live cause of death: subscribe to `eventful.onUnitDeath` and look up `df.global.world.incidents.all` for matching `incident_type.Death`, read `death_cause` enum and `criminal` (killer unit ID)

**Interaction event rendering** (hf_does_interaction):
- Text comes from interaction definition's `hist_string_1` and `hist_string_2` from game raws (via DFHack)
- Vampire biting, werebeast cursing, necromantic raising all use this mechanism
- Do NOT hardcode these strings — pull from game raws so modded interactions work

**Circumstance/Reason rendering** (adds narrative context):
- Reasons: glorify_hf → "in order to glorify [HF]"; artifact_is_heirloom_of_family_hfid → "of the [HF] family"; as_a_symbol_of_everlasting_peace; artifact_is_symbol_of_entity_position → "as a symbol of authority within [entity]"
- Circumstances: Death → "after the death of [HF]"; Prayer → "after praying to [HF]"; DreamAbout → "after dreaming about [HF]"; Dream → "after a dream"; Nightmare → "after a nightmare"; FromAfar → "from afar"

**Location rendering** (append to every event with location fields):
- "in [structure] in [site] in [region] in [layer]"
- Suppress any location component that matches the current page context

**Date/time formatting**:
- DF calendar: `doy = sec // 1200 + 1`, `month = min((doy-1)//28 + 1, 12)`, `day = (doy-1) % 28 + 1`
- Months: Granite through Obsidian (12 months × 28 days)
- Season display: "early/mid/late spring/summer/autumn/winter of [year]" (LegendsBrowser2)
- "In YEAR on the Nth of MONTH, " or "On the Nth of MONTH, " for same-year continuation
- Age at death: fractional display (¼ if days ≥ 28×3, ½ if ≥ 28×6, ¾ if ≥ 28×9)

**Missing event fallback**: If no handler exists for a given event type, fall back to DF's own `getSentence()` method (via DFHack) wrapped in an accessible container with the event type/ID noted.

---

### Complete Event Type Taxonomy

Chronicler must have a narrative template for every event type. The consolidated list merges weblegends' 94 handlers with LegendsBrowser2's 132 types and df-structures' 144 `history_event_type` variants (LB2 is most complete for DF 0.47+):

**HF Social / Relationship** (10 types):
AddHfEntityHonor, AddHfEntityLink, AddHfHfLink, AddHfSiteLink, RemoveHfEntityLink, RemoveHfHfLink, RemoveHfSiteLink, HfsFormedIntrigueRelationship, HfsFormedReputationRelationship, HfRelationshipDenied

**HF Life Events** (9 types):
HfDied, HfRevived, ChangedCreatureType, ChangeHfBodyState, ChangeHfJob, ChangeHfState, HfReachSummit, HfTravel, HfReunion

**HF Combat / Violence** (11 types):
HfSimpleBattleEvent, HfWounded, HfAbducted, HfEnslaved, HfFreed, HfRansomed, HfAttackedSite, HfDestroyedSite, HfConfronted, BodyAbused, CreatureDevoured

**HF Supernatural / Dark Arts** (5 types):
HfDoesInteraction, HfLearnsSecret, HfGainsSecretGoal, HfPerformedHorribleExperiments, HfDisturbedStructure

**HF Religion / Culture** (4 types):
HfPrayedInsideStructure, HfPreach, HfProfanedStructure, HolyCityDeclaration

**HF Intrigue** (10 types, v0.47+):
HfAskedAboutArtifact, HfViewedArtifact, HfConvicted, HfInterrogated, HfCarouse, HfGamble, AssumeIdentity, FailedFrameAttempt, FailedIntrigueCorruption, Sabotage

**HF Acquisitions** (3 types):
HfNewPet, HfEquipmentPurchase, HfRecruitedUnitTypeForEntity

**Artifacts** (13 types):
ArtifactCreated, ArtifactDestroyed, ArtifactLost, ArtifactFound, ArtifactGiven, ArtifactPossessed, ArtifactRecovered, ArtifactStored, ArtifactTransformed, ArtifactCopied, ArtifactClaimFormed, ArtifactHidden, ArtifactDropped

**Masterpieces** (7 types):
MasterpieceArchConstructed, MasterpieceDye, MasterpieceEngraving, MasterpieceFood, MasterpieceItem, MasterpieceItemImprovement, MasterpieceLost

**Sites / Constructions** (20+ types):
CreatedSite, DestroyedSite, SiteTakenOver, ReclaimSite, SiteRetired, SiteDied, SiteDispute, SiteTributeForced, AttackedSite, PlunderedSite, SiteSurrendered, EntityFledSite, EntityRampagedInSite, EntitySearchedSite, NewSiteLeader, EntityRelocate, BuildingProfileAcquired, ModifiedBuilding, CreatedStructure, RazedStructure, ReplacedStructure, CreatedWorldConstruction

**Entities** (14 types):
EntityCreated, EntityDissolved, EntityIncorporated, EntityAllianceFormed, EntityOverthrown, EntityLaw, EntityPersecuted, EntityPrimaryCriminals, EntityEquipmentPurchase, EntityBreachFeatureLayer, EntityExpelsHf, CreateEntityPosition, InsurrectionStarted, RegionpopIncorporatedIntoEntity, ItemStolen

**Diplomacy / Trade / Combat** (15 types):
AgreementFormed, AgreementMade, AgreementConcluded, AgreementRejected, Trade, Merchant, DiplomatLost, FirstContact, FirstContactFailed, PeaceAccepted, PeaceRejected, FieldBattle, SquadVsSquad, TacticalSituation, SneakIntoSite, SpottedLeavingSite

**Culture / Art / Knowledge** (7 types):
ArtFormCreated, DanceFormCreated, MusicalFormCreated, PoeticFormCreated, WrittenContentComposed, KnowledgeDiscovered, AddEntitySiteProfileFlag

**Occasions** (5 types):
Ceremony, Competition, Performance, Procession, Gamble

**Tiered event ingestion system** (from df-structures analysis):
- Tier 1 (always process): `HIST_FIGURE_DIED`, `ARTIFACT_CREATED`, `ARTIFACT_DESTROYED`, `HIST_FIGURE_SIMPLE_BATTLE_EVENT`, `WAR_FIELD_BATTLE`, `HIST_FIGURE_REVIVED`, `CHANGE_CREATURE_TYPE`
- Tier 2 (process for active HFs): `ADD_HF_HF_LINK`, `HF_LEARNS_SECRET`, `CHANGE_HF_MOOD`, `MASTERPIECE_CREATED_*` (all 6 variants), `WRITTEN_CONTENT_COMPOSED`
- Tier 3 (background enrichment): `WAR_*`, `ENTITY_*`, `CHANGE_HF_STATE`, `CHANGE_HF_JOB`

**Event collection classification sets** (for conflict filtering):
- `COMBAT_EVENTS` = {"attacked site", "hf attacked site", "field battle", "squad vs squad", "hf destroyed site", "plundered site", "site taken over", "razed structure", "hf simple battle event", "tactical situation", "site dispute", "reclaim site"}
- `COLLECTION_WAR_TYPES` = {"war", "battle", "siege", "attack", "raid", "insurrection"}
- `ARTIFACT_EVENT_TYPES` = {"artifact created", "artifact given", "artifact lost", "artifact possessed", "artifact stored", "item stolen", "artifact claim formed", "masterpiece item"}
- Artifact journey subset: {"artifact created", "artifact given", "artifact lost", "item stolen", "artifact possessed", "artifact stored"} — chronological sort by (year, sec)

---

### Visualization Features

**Interactive World Map (Leaflet.js)**:
- Base layer: world map PNG as image overlay (50% opacity)
- Coordinate system: L.CRS.Simple (no geographic projection), world coordinates from worldgen params
- Layer groups (each toggleable):
  - Sites: colored polygons by owning entity; gray for ruins; yellow for unowned
  - World Constructions: squares for point constructions, polylines for roads/bridges/tunnels
  - Mountain Peaks: triangle markers
  - Landmasses: semi-transparent rectangles
  - Regions: outline polygons, color-coded by evilness (fuchsia=evil, aqua=good)
  - Evilness fill layer (separate from region outlines)
  - Rivers: rendered paths
  - Battle markers: red diamond polygons on war/battle collection pages
- Tooltips and popups on every map element via fetch to `/popover/{type}/{id}`
- Entity color-coding: each entity type has Color() and Icon() methods; consistently used across map, lists, and links

**Hover Popovers**:
- Every entity hyperlink (HF, entity, site, structure, region, artifact, etc.) triggers hover popover
- Content fetched from `/popover/{type}/{id}` endpoint returning compact HTML snippet
- HF popover: name, race, sex, birth/death, type flags
- Site popover: name, type, owner entity
- Entity popover: name, type, race
- Critical UX feature for exploration without navigation

**D3 Population Donut Chart** (civilization dashboard, Population tab):
- D3.js donut/pie chart of world population by race with count labels

**D3 War Chord Diagram** (civilization dashboard, Wars tab):
- D3.js chord/ribbon diagram: each civilization as arc segment, chords connect warring pairs
- Hover highlights related chords

**SVG Family Tree** (HF detail page):
- Full spec in Historical Figure Pages section above

**Curse Lineage Tree** (HF detail page, for vampires/werebeasts):
- Full spec in Historical Figure Pages section above

**Icon System**:
- Font Awesome icons for entity/site/structure types throughout (map markers, list views, entity links)
- Crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity

---

### UI/UX Patterns

**Navigation**:
- Top navbar with dropdown for object types
- Tab navigation on entity pages with URL hash persistence (`#nav-leaders` etc.)
- Bootstrap 5 dark mode (bootstrap-dark.css)
- Responsive layout

**Customization**:
- Per-race color picker (jscolor) for map/UI colors (LegendsBrowser v1)
- Layer toggle controls on map
- Light/dark theme switching

**Debug**:
- JSON dump at bottom of every entity page during development

**LNP Archive Support** (LegendsBrowser v1):
- Support loading from `legends_archive.zip` (LNP/Lazy Newb Pack format)

**Tab State Persistence**:
- URL hash saves and restores active tab on page load

---

### Live Unit & Character Data Collection (DFHack)

- **Live unit watcher**: Subscribe to `eventful.UNIT_NEW_ACTIVE` for real-time arrival detection of dwarves, migrants, and creatures entering the fortress area
- **Citizen roster tracker**: Poll `df.global.world.units.active` (filtered by `dfhack.units.isCitizen()`) at configurable intervals (500 ticks ≈ 12 seconds at normal speed) to detect roster changes and trigger DB sync
- **Unit metadata extraction**: For every unit, automatically capture race, age, sex, readable name, visible name
- **Unit soul data extractor**: Extract from `unit_soul` the complete skill set (job_skill enum + experience int32), preferences, personality, and performance skills (musical instruments, poetic forms, musical forms, dance forms)
- **Soul personality snapshot**: Capture `unit_personality` including mannerisms (70+ distinct behaviors), values (type + strength), ethics (ethic + response), and thought history (unit_thought_type, 80+ categories)

---

### Real-Time Fortress Mode Monitoring (DFHack)

- **Death event handler with cause lookup**: Subscribe to `eventful.onUnitDeath` and immediately look up the death incident in `df.global.world.incidents.all` to get `death_cause` (enum `death_type`) and `criminal` (killer unit ID). Cross-reference killer via `df.unit.find(killer_id)` to get name and race.
- **Item creation tracking**: Subscribe to `eventful.onItemCreated` with sensitivity level 1. Detect artifact creation via `item.flags.artifact`. Log item description via `dfhack.items.getDescription(item, 0)` and material via `dfhack.matinfo.decode(item)`.
- **Job completion logging**: Subscribe to `eventful.onJobCompleted` for production event tracking.
- **Invasion tracking**: Subscribe to `eventful.onInvasion` for tactical alert generation.
- **Syndrome/curse tracking**: Subscribe to `eventful.SYNDROME` for transformation, curse, and disease detection on units.
- **Inventory change tracking**: Subscribe to `eventful.INVENTORY_CHANGE` for artifact movement and equipment tracking — more efficient than polling `items.all`.
- **Announcement/report polling**: Poll `df.global.world.status.reports` on a configurable tick interval (recommended: 500 ticks) to capture game announcements, alerts, and important messages.
- **Book/written content detection**: Poll `df.global.world.items.all` with book filter — `dfhack.items.getBookTitle(item)` to detect newly created literary works.
- **Agreement/petition monitoring**: Poll `df.global.world.agreements.all` to detect new petitions, trade agreements, and diplomatic agreements.
- **In-game time stamping**: Use `dfhack.world.ReadCurrentYear()`, `ReadCurrentMonth()`, `ReadCurrentDay()` to timestamp all events with in-game calendar dates.

---

### World History Monitoring (DFHack)

- **World history container access**: Read from `df.global.world.history` to access `events`, `events_death`, `relationship_events` (v0.47+), `figures`, `event_collections` (18 typed subcategories), `eras`, `intrigues` (v0.47+), and classified HF lists (`hf_artists`, `hf_poets`, `hf_bards`, `hf_dancers`, `hf_scholars`, `hf_heros`, `hf_religious`, `hf_merchant`, `hf_teachers` [index 11 = necromancers])
- **Live megabeast tracker**: Monitor `world.history.live_megabeasts`, `live_semimegabeasts`, `hf_allbeasts` for crisis events
- **Era transition detection**: Poll `df.global.world.history.eras` to detect era boundary crossings during worldgen and play
- **Worldgen real-time monitoring**: During worldgen, poll `df.global.world.history.figures` and `df.global.world.history.events` as they are being built in real-time. Track `era_determinerst` fields: `living_powers`, `living_megabeasts`, `living_semimegabeasts`, `civilized_races`, `civilized_total`, `civilized_mundane`. Flag HFs with `worldgen_acted` flag.

---

### Mod Management Features

#### Core Mod Manager (MVP)
- **Mod discovery via filesystem scan**: Scan `<DF_dir>/Mods/`, `<DF_dir>/data/vanilla/`, and `<DF_dir>/data/installed_mods/` for all `info.txt` files. Build a complete available-mods catalog without requiring DF to be running.
- **DFHack live mod discovery**: When DFHack is running and DF is at the world creation screen, execute `dfhack-run lua -f GetModMemoryData.lua` (pattern from ModHearth) to query `gui/mod-manager` via `reqscript` and call `manager.get_modlist_fields('base_available', viewScreen)`. Returned data: `id`, `name`, `displayed_version`, `numeric_version`, `earliest_compat_numeric_version`, `src_dir`, `mod_header`
- **info.txt parser**: Full token-based parser supporting all v50 fields: `ID`, `NAME`, `NUMERIC_VERSION`, `DISPLAYED_VERSION`, `EARLIEST_COMPATIBLE_NUMERIC_VERSION`, `EARLIEST_COMPATIBLE_DISPLAYED_VERSION`, `AUTHOR`, `DESCRIPTION`, `REQUIRES_ID`, `REQUIRES_ID_BEFORE_ME`, `REQUIRES_ID_AFTER_ME`, `CONFLICTS_WITH_ID`, and all Steam Workshop fields (`STEAM_TITLE`, `STEAM_DESCRIPTION`, `STEAM_TAG`, `STEAM_FILE_ID`, etc.)
- **Modpack CRUD backed by mod-manager.json**: Create, rename, delete (enforce minimum one modpack), set-default, import from JSON file, export to JSON file. Schema matches DFHack's format exactly.
- **Load order management**: Drag-and-drop (or CLI equivalent) reordering of mods within a modpack. Enforce header load order: `o_template → language → descriptor_* → material_template → inorganic → plant → tissue_template → item → building → b_detail_plan → body → c_variation → creature → entity → reaction → interaction → edit`
- **Mod browser with search/filter**: Dual-pane view (available/disabled mods vs. enabled mods). Search and filter boxes for each pane. Display mod name, description, version, author, and preview image (`preview.png` if present).
- **Undo to last saved state**: Track unsaved changes and allow reverting to the last persisted modpack configuration.
- **Profile import/export**: Full JSON import/export using the `DFHModpack` schema.
- **Fallback to cached mod list**: If neither filesystem scan nor DFHack query is available, show the last successful scan result.

#### Conflict Detection System
- **Level 1 — Metadata conflict detection** (O(n), no raw parsing):
  - Duplicate mod IDs in the active list
  - `CONFLICTS_WITH_ID` pairs both present in active list
  - `REQUIRES_ID_BEFORE_ME` violations
  - `REQUIRES_ID_AFTER_ME` violations
  - Version incompatibility: loaded `numeric_version` < `EARLIEST_COMPATIBLE_NUMERIC_VERSION`
- **Level 2 — Object ID conflict detection** (O(n × m), requires raw parsing):
  - Parse all `objects/*.txt` for each enabled mod
  - Build a map of `{object_type: {object_id: [mod_id, ...]}}`
  - Flag any `object_id` with multiple full definitions across mods (duplicate definitions cause silent corruption — not last-wins, but offset bugs)
  - Detect SELECT + CUT interactions: CUT in mod B removes an object that mod A's SELECT targets
- **Level 3 — Semantic conflict detection** (expensive, requires full compilation):
  - Full DF-Modloader compiler pipeline to detect `OT_REMOVE_TAG` vs. `OT_ADD_TAG` conflicts on the same token across mods
  - Requires known vanilla baseline
- **Visual conflict indicators**: Color-code mods in the active list by conflict status: clean (no indicator), problem (red text/highlight). Typed conflict messages: `MissingBefore`, `MissingAfter`, `ConflictPresent`.
- **Three-way merge conflict detection** (PyLNP pattern): Line-based three-way merge with vanilla baseline + accumulated mods + new mod. Return status: 0 (clean), 1 (potential issues), 2 (overlap merged, manual review), 3 (fatal, rebuild from scratch).

#### Raw File Parsing and Analysis
- **Raw file tokenizer**: Implement DF-Modloader's `split_lines_into_tokens()` algorithm. State machine: `COMMENTS → TOKEN → ARGS`. Discard everything outside `[` `]`.
- **Object type catalog**: Recognize all 18 DF super-types mapped to file prefixes (`[OBJECT:TYPE]`). Build per-type, per-file object inventories.
- **RawObject data model**:
  ```
  object_id: str
  tokens: List[List[str]]     # each token as flat list
  source_file_name: str
  source_mod_name_and_version: str
  is_removed: bool
  ```
- **SELECT/CUT token detection**: Parse `SELECT_<TYPE>` and `CUT_<TYPE>` tokens in raw files. Enumerate all sub-object selectors: `SELECT_CASTE`, `SELECT_ADDITIONAL_CASTE`, `SELECT_MATERIAL`, `SELECT_TISSUE`, `SELECT_TISSUE_LAYER`, `SELECT_GROWTH`
- **Raw visual diff viewer**: Show side-by-side diff of the same raw object across two or more mods. Highlight added/removed/changed tokens.
- **Embedded raw editor** (stretch): Allow in-application editing of raw files with syntax highlighting for DF token format. Track edits as a mod or mod overlay.

#### Advanced Mod Management (Long-term)
- **Full raw compiler** (DF-Modloader pattern):
  - EDIT object support: `SEL_BY_ID`, `SEL_BY_CLASS`, `SEL_BY_TAG`, `SEL_BY_TAG_PRECISE`, `PLUS_SELECT`, `UNSELECT`
  - OBJECT_TEMPLATE compilation: `COPY_TAGS_FROM`, `GO_TO_END`, `GO_TO_START`, `GO_TO_TAG`, argument substitution (`!ARG1`, `!ARG2`), recursion detection
  - USE_OBJECT_TEMPLATE processing: `OT_ADD_TAG`, `OT_REMOVE_TAG`, `OT_CONVERT_TAG + OTCT_TARGET/REPLACEMENT`, conditional variants (`OT_ADD_CTAG`, `OT_REMOVE_CTAG`, `OT_CONVERT_CTAG`)
  - `REMOVE_OBJECT` support (sets `is_removed = True`)
  - Output: per-super-type compiled files (`creature_compiled.txt`, etc.) with source comments
- **Legacy mod migration tool** (SyntaxUpdater pattern): Convert pre-v50 `c_variation_*` files to `o_template_cv_*`, `b_detail_plan_*` to `o_template_bdp_*`. Enable old mods to work with the new compiler.
- **Modpack content discovery**: Support modpack-in-modpack structure — directories with `modpack_info.txt` are treated as collections of sub-mods.
- **Virtual file system isolation** (Mod Organizer 2 pattern): Serve mods to DF without physically copying files. Each mod remains in its own folder. Per-mod activation/deactivation without reinstall.
- **Automated load order optimization** (LOOT pattern): Topological sort of the mod dependency graph derived from `REQUIRES_ID_BEFORE_ME`/`REQUIRES_ID_AFTER_ME` relationships. Flag missing masters, incompatible pairs, mismatched versions.
- **Mod update notifications**: Integrate with Steam Workshop API or DFFD/NexusMods DF page to check for available updates against the currently installed `numeric_version`.

#### Modpack History and Audit
- **DB schema for modpack state**: Store which modpack was active when each legend event, fortress event, or world was generated. Answer queries like "which mods were active when this artifact was created?"
- **Modpack snapshot at world creation**: Capture the full `object_load_order` via DFHack at world creation time and store it in the DB against the world record.
- **Mod annotation in legends**: When displaying a legend event or creature/entity, annotate which mod introduced that raw object (if applicable).

---

### Chronicler-Specific Advantages Over Reference Tools

1. **Persistent PostgreSQL database**: Unlike in-memory parse-on-start tools, enables: historical diffs across saves, trend analysis over fortress lifetime, cross-session queries, incremental updates
2. **LLM-enhanced narrative**: Use LLM generation for richer event sentences beyond templates; AI storyteller persona
3. **API-first design**: Expose JSON APIs in addition to HTML, enabling external tooling and programmatic access
4. **Live DFHack integration**: Provides data unavailable in XML: current inhabitants, site ownership, creature raw data for interaction text, squad names, occupation detail, age calculations from live tick
5. **Cross-save analytics**: Track population trends, war outcomes, artifact journeys across multiple fortress saves
6. **Mod history in DB**: Unique feature — link game events to the modpack active at time of generation

---

## Implementation Architecture

### DFHack Lua Bridge Architecture (Validated Production Pattern)

The `chronicler-bridge.lua` HTTP-serving approach is architecturally correct and validated by reference tools. It sidesteps all RPC connection management issues while providing full access to `df.global.*`.

**Module architecture for production bridge**:
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

**Event subscription pattern**:
```lua
eventful.enableEvent(eventful.eventType.ITEM_CREATED, 1)  -- sensitivity 1 = every tick
local modId = "DF_STATS"  -- unique module ID prevents conflicts
eventful.onUnitDeath[modId] = function(unitId) DeathLogger.log(unitId) end
eventful.onUnitDeath[modId] = nil  -- clean unsubscribe
```

**Available event types**:
```
TICK, JOB_INITIATED, JOB_STARTED, JOB_COMPLETED, UNIT_NEW_ACTIVE, UNIT_DEATH,
ITEM_CREATED, BUILDING, CONSTRUCTION, SYNDROME, INVASION, INVENTORY_CHANGE,
REPORT, UNIT_ATTACK, UNLOAD, INTERACTION, EVENT_MAX
```
Note: `REPORT` is best handled via polling, not event subscription.

**Polling pattern with dfhack.timeout**:
```lua
local function tick()
    if not watcherActive then return end
    AnnouncementLogger.watch()
    CitizenLogger.watch()
    if watcherActive then
        dfhack.timeout(500, 'ticks', tick)  -- reschedule: 500 ticks ≈ 12s at normal speed
    end
end
```
`'ticks'` = real game ticks (pauses when game pauses). `'frames'` = real-time frames (alternative).

**Generic watcher factory (change detection closure)**:
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

**Death cause and killer lookup via incidents**:
```lua
function Helper.getIncidentDeathCauseByVictimId(victimId)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death then
            if incident.victim == victimId then
                return incident.death_cause  -- enum death_type
            end
        end
    end
    return nil
end
-- incident.criminal = killer unit ID; cross-reference with df.unit.find(killer_id)
```

**Enum resolution pattern**:
```lua
function Helper.resolveEnum(k, v)
    local d = df[k]
    if d == nil then return tostring(v) end
    local dv = d[v]
    if dv == nil then return "unknown_enum_value" end
    return d[v] .. "," .. k .. "_value," .. tostring(v)
end
```

**Struct introspection for bridge development**:
```lua
local unit_type = df.global.world.units.all[0]._type
for field_name, field_info in pairs(unit_type._fields) do
    print("Field:", field_name, "Offset:", field_info.offset, "Type:", field_info.type_name)
end
-- Enum introspection:
for k, v in pairs(df.goal_type.attrs) do print("Enum key:", k, "Value:", v) end
```

**Module hot-reload pattern (for development iteration)**:
```lua
package.loaded["ModuleName"] = nil
local Module = require("ModuleName")
```

---

### DFHack RPC Protocol (dfhack-client-python — Reference Only)

**Handshake (TCP port 5000)**:
```
Client sends: b'DFHack?\n' + uint32(1)   # 12 bytes
Server replies: b'DFHack!\n' + uint32(1)  # 12 bytes — must match exactly
```

**Frame format (8-byte header + protobuf payload, little-endian)**:
```
bytes [0:2]  — int16: message ID (negative = reply code, positive = bound method ID)
bytes [2:4]  — padding (0x0000)
bytes [4:8]  — int32: payload size in bytes
```
Reply code constants: `-1` = RESULT (success), `-2` = FAIL, `-3` = TEXT (raises exception), `-4` = QUIT.

**Method binding via CoreBindRequest (channel 0)**:
```python
br.method = "GetUnitList"
br.input_msg = EmptyMessage.DESCRIPTOR.full_name
br.output_msg = UnitList.DESCRIPTOR.full_name
br.plugin = "RemoteFortressReader"
# Response: CoreBindReply.assigned_id — cache via lru_cache(maxsize=65534)
```

**Decorator pattern for auto-wiring**:
```python
@remote(plugin='RemoteFortressReader')
async def GetVersionInfo(output: VersionInfo = None): pass
@remote
async def GetVersion(output: StringMessage = None): pass
@remote
async def GetWorldInfo(output: GetWorldInfoOut = None): pass
```

**CRITICAL — TCP RPC broken for game-thread calls on DFHack 53.x under Prism/UTM**: CoreSuspender is never acquired from the network thread. Only `GetVersion`/`GetWorldInfo` work (cached). All game-thread RPC calls hang indefinitely. Use `dfhack-run` over SSH instead.

**Missing features in dfhack-client-python for production use**:
- No timeout on `asyncio.open_connection()`
- No retry/reconnect loop
- No heartbeat/health-check
- No thread safety (single global reader/writer)
- No recovery from `RPC_REPLY_TEXT`

---

### df-structures: Canonical Field Reference

**Access pattern for Lua via DFHack**:
```lua
-- instance-vector in XML maps directly to Lua path
-- <struct-type instance-vector='$global.world.history.figures'> -> df.global.world.history.figures
local hf = df.global.world.history.figures[i]
local hf_info = hf.info  -- historical_figure_info / hf_profilest (nullable bag of pointers)
```

**HF profile pointer bag — all nullable**:
```
metaphysical  -> spheres, appearance, deity form
skills        -> skill list, professions, account_balance, employment_held
pets          -> owned creature races
personality   -> unit_personality + mood
masterpieces  -> creation events, art image chunks
whereabouts   -> location: state, site_id, region_id, army_id, body_state, year, tick, smm coords
kills         -> kill events, killed races/sites/counts
wounds        -> missing body parts, childbirth
known_info    -> secrets, identities, witness reports, rumor events, creature knowledge, poetic/musical/dance forms, scholar knowledge, belief systems, known locations
curse         -> necromancy, transformations, undead status
books         -> held artifacts, equipment
reputation    -> wanted status, identities, journey profile
relationships -> hf_visual (current), hf_historical (past), intrigues
```

**Event subtype casting pattern in Lua**:
```lua
local e = df.history_event_war_field_battlest(event_ptr)
-- Cast to specific subtype to access subtype-specific fields
```

**Event virtual methods** (available on all events):
- `event:getRelatedHistfigIDs()`, `getRelatedSiteIDs()`, `getRelatedEntityIDs()`
- `wasHistfigKilled()`, `getKilledHistfigID()`, `wasHistfigRevived()`
- `getSentence()`, `getPhrase()`, `getImportance()`, `getEraImportance()`
- `event:categorize()` / `event:uncategorize()` — group events into era categories

---

### weblegends Memory Access Pattern (C++)

```cpp
df::historical_figure::find(id)       // O(log n) binary search in world->history.figures
df::historical_entity::find(id)       // world->entities.all
df::world_site::find(id)              // world->world_data->sites
df::artifact_record::find(id)         // world->artifacts.all
df::creature_raw::find(race_id)       // world->raws.creatures.all
binsearch_in_vector(vec, id)          // DFHack utility for sorted vector lookups
CoreSuspender suspend;                // Pause game thread during rendering
```

All rendering acquires CoreSuspender. Data comes exclusively from live DF memory — no file I/O.

**Cross-linking pattern**:
```cpp
// Always generate link:
void link(ostream &s, df::historical_figure *hf);

// Context-aware: suppress link if hf == context entity:
void event_link(ostream &s, const event_context &ctx, df::historical_figure *hf);

// Zombie handling: if curse.original_histfig_id != -1, render as "zombie" with hover
// Written content italicization: wrap in <em> if item has writingst/pagesst improvements
// Name translation: native name in <abbr title="ENGLISH">NATIVE</abbr>
```

**Event dispatch pattern**:
```cpp
// Each event type is a separate file: events/event_type_name.cpp
// Signature: void do_event(ostream &s, const event_context &ctx, df::specific_event_type *e)
// Central dispatch in helpers/event.cpp wraps with temporal context
// 1000-event pagination with year-group boundaries and week splits within dense years
```

---

### LegendsBrowser2 Data Model (Go)

**Root container**:
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

**RelatedTo interface**:
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

**Post-parse processing pipeline**:
1. Assign River IDs (rivers stored as slice, not map)
2. `addRelationshipEvents()` — synthesize AddHfHfLink events from HistoricalEventRelationships (plus-mode)
3. Set structure.SiteId for cross-reference
4. `processEvents()`:
   - Mark HFs as Vampire/Werebeast/Necromancer from interaction events
   - Build entity site lists from site events
   - Track ruin status of sites and structures
   - Resolve mountain peak IDs from coordinates
   - Fix world construction part relationships
   - Populate HF kill lists from HfDied events
5. `processCollections()`:
   - Assign Collection id back to each member event
   - Derive collection summary data (attacker HF ids, target HF ids, traveler HF ids)
   - Link sub-collections to parent occasions
   - Append wars to entity war lists
6. Non-plus mode inference: race cleanup, entity type/parent inference, art form name extraction, entity race inference from leader race, hardcoded position lists for dwarf/elf/human/goblin entities

---

### XML Parsing Architectures

**LegendsBrowser Java SAX Parsing**:
- SAX streaming with `@Xml("element_name")` annotation-driven field mapping
- `@XmlSubtypes` / `@XmlSubtype("battle")` polymorphic dispatch: read `<type>` first, switch to correct subclass, replay cached elements
- Handles 400MB+ exports at constant memory (no DOM)
- `CodingErrorAction.IGNORE` for malformed DF XML bytes
- Reads separately: `legends.xml`, `legends_plus.xml`, `world_history.txt`, `world_gen_param.txt`, `sites_and_pops.txt`, world map image

**LegendsBrowser2 Custom XML Tokenizer (Go)**:
- NOT using Go's standard `encoding/xml` — avoids attribute map and namespace overhead
- Custom `XMLParser` backed by `bufio.Reader`, reading byte-by-byte
- `model.go` is fully code-generated from an `analyze/` generator tool that inspects DF XML structure
- `cp473.go` converts legacy IBM CP473 characters to Unicode
- Progress bar via `pb/v3` on the reader proxy
- After loading `legends.xml`, auto-detect and load `legends_plus.xml` (replace suffix in path)
- World map: loads `-world_map.*` or `-detailed.*` (supports BMP), encodes to PNG in memory

**DwarvenSurveyor C# XML Streaming**:
```csharp
// XmlReader (streaming, not DOM) for large legends XML files
// Site fields: type, name, coords (x,y), rect (xMin:yMin,xMax:yMax)
// Region terrain types (10 values): wetland, forest, grassland, hills, desert, lake, tundra, glacier, ocean, mountains
```
Sample test fixtures available: `UNITYTESTregion1-00050-01-01-legends.xml` and `UNITYTESTregion1-00050-01-15-legends_plus.xml`.

**Dwarf Therapist Memory Layout Architecture (INI/QSettings, 29 sections)**:
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
Not viable for Chronicler (requires same-machine, elevated privileges, breaks each DF version). Value: scope reference for what data categories are available.

---

### HTTP Serving Architecture

**weblegends**: TCP socket listener on ports 5080–5089 (first available). One accept thread + one thread per client. Static export via `weblegends-export <folder>` — BFS crawl starting from `/`, follows all `href`/`src` attributes, writes static HTML files with deduplication via `set<string>`.

**LegendsBrowser2**: Go HTTP server on port 58881. All routes registered in `server.go`. Popover endpoints (`/popover/{type}/{id}`) return HTML snippets for hover popovers.

**Template Function Registry** (LegendsBrowser2 key functions):
- `hf id`, `entity id`, `site id`, `structure siteId structId`, `artifact id`, etc. → HTML anchor tags
- `events obj` → EventList for any object type
- `history siteId` → site history event list
- `story eventId` → event in story mode
- `time year seconds` → formatted time string with season
- `andList []string` → "a, b and c" formatting
- `initMap` → Leaflet init script
- `addSite id color`, `addRegion id`, `addLandmass id`, `addMountain id color`, `addWorldConstruction id`, `addRiver id`, `addCollection id` → map JavaScript emitters

---

### Raw Compiler Architecture (DF-Modloader)

**Compiler pipeline**:
1. `read_mod_raws_and_apply_edit_objects(mod)` — reads files in header-sorted order, builds `normal_objects` dict-of-dicts and `normal_objects_lists`
2. `apply_special_tokens_to_create_compiled_objects()` — processes OBJECT_TEMPLATE and normal objects
3. `write_compiled_objects(output_path)` — writes `*_compiled.txt` per super-type

**Reading mode state machine**: `"NONE"` → `"NEW"` (standard object) / `"OT"` (object template) / `"EDIT"`.

**Conflict model**: Last-mod-wins for full object definitions. EDIT objects layer in load order. No explicit conflict detection in DF-Modloader — duplicate IDs cause silent offset corruption.

**PyDwarf doubly-linked token model**:
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

---

### ModHearth Conflict Detection Algorithm

```
scannedModIDs = set()   -- already loaded
unscannedModIDs = set() -- not yet loaded
for each mod in load order:
    parse REQUIRES_ID_BEFORE_ME -> check mod in scannedModIDs (MissingBefore if not)
    parse REQUIRES_ID_AFTER_ME  -> check mod in unscannedModIDs (MissingAfter if not)
    parse CONFLICTS_WITH_ID     -> check mod in either set (ConflictPresent if found)
```

**mod-manager.json schema**:
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

---

### LegendsBrowser v1 Family Tree Layout Algorithm (Java)

The `FamilyMember.layout()` / `layoutUp()` / `layoutDown()` algorithm in `HfsController.java` is self-contained and portable:
- Traverses HF links to build a tree structure
- Computes non-overlapping x-positions for each generation
- Returns SVG coordinate data per node
- Handles both upward (ancestors) and downward (descendants) traversal independently

---

## Reference Tool Features

### df-narrator Reference Features

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

### weblegends Reference Features

| Feature | Status | Notes |
|---------|--------|-------|
| 94 event type handlers | Adapt | LB2's 132 is more complete baseline |
| Context-aware event rendering | Must adopt | `event_context` pattern critical for readability |
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

### LegendsBrowser v1 Reference Features

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
| SAX streaming parser | Reference | Java implementation; Python: iterparse |

### LegendsBrowser2 Reference Features

| Feature | Status | Notes |
|---------|--------|-------|
| 132 event types | Must adopt | Complete baseline for DF 0.47+ |
| RelatedTo* interface | Must adopt | Maps to PostgreSQL queries in Chronicler |
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

### DFHack Infrastructure Reference Features

| Feature | Status | Notes |
|---------|--------|-------|
| dfhack-run over SSH transport | Current approach | Replaces broken TCP RPC |
| chronicler-bridge.lua HTTP bridge | Current approach | Validated production pattern |
| eventful subscription system | Must adopt | Full event type list above |
| 500-tick polling rate | Adopt | 12s interval, production validated |
| Generic watcher factory | Adopt | Extend to handle deletions |
| Struct introspection | Reference | For bridge development iteration |
| Module hot-reload | Reference | Development convenience |
| Death via incident lookup | Must adopt | Only way to get cause + killer |
| Enum resolution | Must adopt | Makes raw enum values readable |
| exportlegends command | Must adopt | Richer than base DF XML export |

### Mod Management Reference Features

| Feature | Status | Notes |
|---------|--------|-------|
| info.txt full token parser | Must build | All v50 fields documented |
| mod-manager.json CRUD | Must build | Schema documented |
| Level 1 conflict detection | Must build | Metadata only, fast |
| Level 2 conflict detection (raw parsing) | Build next | Object ID deduplication critical |
| Level 3 semantic detection | Long-term | Requires full compiler |
| Three-way merge (PyLNP) | Long-term | Gold standard, requires baseline |
| Raw compiler pipeline | Long-term | DF-Modloader reference |
| Modpack history in DB | Must build | Unique differentiating feature |
| Dual-pane mod browser UI | Must build | ModHearth reference |
| Drag-and-drop load ordering | Must build | ModHearth reference |
| DFHack live mod query | Build next | reqscript pattern from ModHearth |
| Steam Workshop integration | Long-term | No existing DF tool does this |
| Raw visual diff viewer | Build next | PyDwarf doubly-linked model |
| LOOT-style auto-order | Long-term | No DF equivalent exists |
| Legacy mod migration | Long-term | SyntaxUpdater pattern |

---

## Data Access Patterns

### XML Export Files

All reference tools consume Dwarf Fortress XML export files:
- `legends.xml` — primary export file
- `legends_plus.xml` — supplementary file (available when exporting with DFHack's `exportlegends` plugin active); adds entity positions/assignments, entity honors, occasions and schedules, squad links, site properties, relationship profiles, HF intrigue actors/plots, werebeast/vampire/necromancer since-year tracking
- `world_history.txt` — leader/succession data
- `world_gen_param.txt` — world dimensions
- `sites_and_pops.txt` — site population data
- World map image (BMP or PNG)

**Field extraction from legends.xml** (df-narrator canonical):
- Sites: `id`, `name`, `type`, `coords`, structure count
- Entities: `id`, `name`
- Artifacts: `id`, `name`, `holder_hfid`, `creator_hfid`, item `name_string`, `mat`
- Historical Figures: `id`, `name`, `race`, `caste`, `birth_year`, `death_year`, `associated_type`, active_interactions, entity_links, hf_links, skills (with total_ip), spheres, site_links
- Events: `id`, `type`, `year`, `seconds72`, all other child elements as flat key→text dict
- Event Collections: `type`, `name`, `start_year`, `end_year`, aggressor/defender entity IDs, site_id, member event IDs

**Encoding gotchas**:
- DF XML has malformed bytes: must use `CodingErrorAction.IGNORE` (Java) or equivalent
- IBM CP473 legacy characters require conversion to Unicode (both LegendsBrowser versions include explicit conversion)

**Large file handling**: 25MB–400MB+ exports. All reference tools use streaming parsers (SAX or custom tokenizer) to avoid loading full DOM into memory.

### Live DFHack Global Paths Reference

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

### DFHack Lua Helper Functions Reference

```lua
-- Unit classification
dfhack.units.isCitizen(unit)         -- fortress citizen check
dfhack.units.isMale(unit)
dfhack.units.getRaceName(unit)
dfhack.units.getAge(unit)            -- float, in years
dfhack.units.getReadableName(unit)   -- "Firstname Lastname"
dfhack.units.getVisibleName(unit)    -- visible/alias name

-- Translation
dfhack.translation.translateName(name_compound)  -- compound name -> string

-- Items
dfhack.items.getBookTitle(item)
dfhack.items.getDescription(item, 0)
dfhack.matinfo.decode(item)          -- material information

-- Time
dfhack.world.ReadCurrentDay()
dfhack.world.ReadCurrentMonth()      -- 0-based
dfhack.world.ReadCurrentYear()
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
        info.txt
        objects/
        graphics/
  dfhack-config/
    mod-manager.json             -- DFHack modpack presets
```
Steam Workshop mods stored in `<Steam>/steamapps/workshop/content/975370/`. Appear in `base_available` only after DF has loaded them.

### Raw File Token Format

**Tokenizer pseudocode (DF-Modloader canonical)**:
```
state = COMMENTS
for each character c:
  if state == COMMENTS and c == '[': state = TOKEN
  elif state == TOKEN:
    if c == ':': state = ARGS
    elif c == ']': emit([token]); token = ""; state = COMMENTS
    else: token += c
  elif state == ARGS:
    if c == ']': emit([token] + args.split(':')); reset; state = COMMENTS
    else: args += c
```

**Header load order** (first line of each file determines category):
```
o_template, language, descriptor_shape, descriptor_color, descriptor_pattern,
material_template, inorganic, plant, tissue_template, item, building,
b_detail_plan, body, c_variation, creature, entity, reaction, interaction, edit
```

**18 DF super-types** map to specific `[OBJECT:TYPE]` headers. Object IDs must be globally unique per super-type — duplicate IDs cause silent corruption.

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
This is the canonical list of XML fields that reference historical figure IDs — represents accumulated community knowledge not obvious from XML structure.

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
Apply consistently across all Chronicler display layers.

### legends_plus.xml Additional Data

Plus-mode data includes: entity positions and assignments, entity honors, occasions and schedules, squad links, site properties, relationship profiles, HF intrigue actors/plots, werebeast/vampire/necromancer since-year tracking.

Non-plus inference compensates: race cleanup, entity type inference from events, hardcoded position lists for dwarf/elf/human/goblin entities.

---

## Key Insights

### Narrative Architecture

1. **Template-based vs. LLM-based rendering**: df-narrator, weblegends, and LegendsBrowser all use deterministic string templates. Chronicler's unique advantage is the ability to use LLM generation to produce richer, non-repetitive narrative prose. Templates should remain as a fast fallback and as training scaffolding.

2. **Context-aware self-reference suppression is critical**: The weblegends `event_context` pattern (suppressing links/full names when the referenced entity is the current page's subject) prevents the narrative from being flooded with redundant constructions like "Urist McFighter attacked Urist McFighter's enemy...". This must be implemented in Chronicler's narrative layer.

3. **Scoring formulas are well-calibrated**: df-narrator's four scoring formulas represent accumulated community knowledge about what makes DF entities narratively interesting. The figure score weights (deity > kills > artifacts > events) align with what players find compelling. These should not be discarded in favor of a raw "most events" ranking.

4. **Co-appearance rivalry detection** is a lightweight but effective narrative technique: scanning shared event participation surfaces meaningful figure pairs without requiring explicit relationship links.

### Event Type Coverage

5. **94 weblegends handlers vs. 132 LegendsBrowser2 types vs. 144 df-structures types**: LegendsBrowser2 is most complete for DF 0.47+, covering 38 additional event types over weblegends. df-structures defines 144 `history_event_type` variants — the definitive ceiling. Chronicler should target df-structures' full set as the baseline.

6. **Death cause granularity matters**: DF has 50+ distinct death causes. Rendering them as generic "died" is a significant quality loss. Users notice and care about the difference between "was beheaded", "drowned in magma", and "died of old age." Live cause lookup via incidents is required for fortress-mode deaths.

7. **Masterpiece events (6 types)**: Often overlooked but these track the craftwork and cultural output of civilizations. Important for the culture/history visualization layer.

### Data Model Insights

8. **Ruin state must be derived from events**: Sites and structures don't have an explicit `ruin` flag in XML — ruin status must be inferred during post-parse processing by tracking creation/destruction/reclaim events. LegendsBrowser2's `processEvents()` pipeline implements this correctly.

9. **Entity type inference for non-plus mode**: Without `legends_plus.xml`, entity types must be inferred from events (site takeover/creation patterns) and leader races. LegendsBrowser2 has hardcoded position name lists for dwarf/elf/human/goblin entities as a fallback.

10. **Kill list construction**: HF kill lists are not stored directly in the XML. They must be built during processing by scanning all `HfDied` events and indexing `slayer_hfid`. Both tools do this in the post-parse processing step.

11. **Relationship profiles are plus-mode only**: Visual/historical/identity relationship types (the scores like "hero", "murderer", "psychopath") are in `legends_plus.xml`. Without it, only basic link types are available.

12. **Complete data available via DFHack vs. accessible via RPC**: Dwarf Therapist's 29-section memory layout shows the full scope of data DF exposes — all of it is accessible via DFHack Lua using `df.global.*` paths without direct memory reading. TCP RPC is broken for game-thread calls on DFHack 53.x under Prism — use `dfhack-run` over SSH exclusively.

### Visualization Insights

13. **The Leaflet world map is the centerpiece feature**: It integrates all geographic entity types with entity-specific color coding and hover popovers. Battle markers on war pages make conflict geography immediately legible. This is the highest-value single visualization.

14. **The SVG Family Tree is a signature feature users love** (per LegendsBrowser1 documentation). It is unique to LegendsBrowser v1 and not present in v2 — a gap that Chronicler can fill. The layout algorithm is self-contained and portable.

15. **The Curse Lineage Tree** is a compelling narrative visualization that no other tool has implemented in v2. Tracing vampirism/werebeast infection chains is a compelling DF story element.

16. **D3 chord diagrams for wars** provide an at-a-glance overview of inter-civilization conflict patterns that is impossible to convey in tabular form.

### XML Parsing Insights

17. **Custom tokenizers outperform standard XML libraries** for DF-sized exports: Go's standard `encoding/xml` was bypassed in LegendsBrowser2 for a custom tokenizer; Java's DOM parsers require 1GB+ heap for large exports. Chronicler's Python ETL pipeline should use SAX or iterparse with `root.clear()` after each element, not ElementTree with full tree loading.

18. **Code generation from XML structure analysis** (LegendsBrowser2's `analyze/` tool) produces the most maintainable parser — the generated `model.go` adapts automatically when DF adds new XML fields. Worth considering for Chronicler's long-term maintainability.

19. **IBM CP473 encoding**: Both LegendsBrowser versions include explicit CP473→Unicode conversion. DF XML can contain legacy IBM code page characters that standard UTF-8 parsers will fail on or silently corrupt.

### Performance Insights

20. **Pagination at 1000 events/page** (weblegends) is the right threshold for figures/sites with dense histories. Within a dense year, split by DF weeks (every 7 days). Without pagination, pages for major deities or capital cities can have tens of thousands of events, making them unusable.

21. **All-in-memory maps vs. database**: LegendsBrowser2 keeps all data in `map[int]*T` for O(1) lookups. Chronicler's PostgreSQL backend requires indexed queries but gains persistence, cross-save diffing, and analytical query capabilities. Requires careful indexing strategy.

22. **500-tick polling rate (≈12 seconds) is production-validated**: The myDFHackScripts collection uses this for citizen, announcement, book, and petition polling. Suitable baseline for Chronicler's monitoring loops.

23. **Generic watcher factory pattern is the reusable core**: The `Helper.watch()` closure pattern (track known list, detect additions on each poll) is the correct abstraction for all Chronicler polling. Must be extended to detect deletions (items leaving the list) for complete change tracking.

### Mod Management Insights

24. **v50 is a clean break from pre-v50 modding**: SELECT/CUT tokens, info.txt metadata, and the `mod-manager.json` profile system are all new in v50. PyLNP, PyDwarf, and pre-v50 tools do not handle these. Chronicler must target v50 natively.

25. **Duplicate object IDs cause silent corruption, not last-wins**: The most dangerous raw conflict is two mods defining the same `[CREATURE:SOME_ID]`. This does not cleanly override — it causes offset bugs and silent data corruption. Level 2 conflict detection (object ID deduplication) is critical for safety.

26. **DFHack's `gui/mod-manager` Lua API is undocumented but functional**: ModHearth successfully calls `get_modlist_fields()` via `reqscript`. This is not formally documented for third-party use and may change across DFHack releases. Filesystem scan is the more robust primary path; DFHack query is the enriched secondary path.

27. **The DF mod ecosystem has no LOOT equivalent**: No centralized conflict ruleset, no automated dependency graph resolution, no community-curated load order database. Chronicler has an opportunity to fill this gap with community-contributed conflict rules.

28. **Modpack history in DB enables powerful queries**: Storing which modpack was active when each world/event was generated enables retrospective analysis — "what mods were running when this legendary artifact was created?" This is a unique feature not available in any existing mod manager.

29. **Cross-platform requirement**: ModHearth is Windows-only (Windows Forms). Chronicler's mod management UI runs on macOS. All UI code must be platform-neutral (web frontend or cross-platform Python UI).

30. **Steam Workshop integration gap**: No existing DF tool integrates Steam Workshop mod browsing, install, and update with the mod management workflow. Significant UX gap Chronicler could address via Steam Web API integration.

31. **Lua bridge is architecturally correct**: The `chronicler-bridge.lua` HTTP-serving approach validates as the right pattern. It sidesteps all RPC connection management issues while providing full access to `df.global.*`. The myDFHackScripts collection confirms this is the standard DFHack production pattern.

### Chronicler Integration Priorities

**Must-have for feature parity (all reference tools)**:
- All 132+ event types rendered as human-readable narrative sentences
- Full entity pages for all entity types (HF, Entity, Site, Structure, WorldConstruction, Artifact, WrittenContent, art forms, Region, geography, Identity)
- Event filtering by entity (RelatedTo* interface or equivalent DB query)
- Collection hierarchy (wars contain battles, battles contain events)
- Hover popovers on all entity links
- Tab navigation on entity pages
- Global search with live autocomplete
- Perspective-aware event rendering (current-entity context suppression)
- Interactive Leaflet world map with layer toggles and entity color-coding
- Death cause rendering (50+ causes → specific prose)
- Circumstance/reason rendering for artifacts and HF actions
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
- Entity reputation scores (hero, murderer, psychopath, etc.) from plus-mode data
- Squad links on HF pages
- Site property links on HF pages
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

## Open Questions & Gaps

### DFHack / Infrastructure

1. **Worldgen Lua access requires empirical validation**: df-structures confirms the data structures exist during worldgen, but whether DFHack Lua polling works on the worldgen screen (vs. after worldgen completes) is unconfirmed. The standard scripts (InvasionLogger, CitizenLogger) only run in fortress mode.

2. **Watcher factory deletion detection gap**: The `Helper.watch()` pattern from myDFHackScripts does not handle items leaving the list (only additions). Chronicler's implementation must handle unit deaths, artifact removal, and other deletion events explicitly.

3. **CoreSuspender under Prism**: TCP RPC game-thread calls are confirmed broken on DFHack 53.x under Prism/UTM. The root cause (CoreSuspender never acquired from network thread) is understood, but it is unconfirmed whether this affects all DFHack 53.x deployments or only Prism-virtualized ones. This distinction matters for HomeServer deployment.

4. **RemoteFortressReader 41 functions**: RFR IS loaded (bind succeeds, IDs assigned) but game-thread dispatch hangs under Prism. Whether RFR function calls would work on a native Windows installation (HomeServer) is untested.

5. **DFHack Lua ModManager API stability**: The `reqscript('gui/mod-manager')` and `get_modlist_fields()` pattern is undocumented for third-party use. It may change across DFHack releases without notice. Need to track DFHack changelog for breaking changes.

6. **Version integer format confirmation**: DFHack uses `numeric_version` with dots removed (`"53.10"` → `5310`). This is inferred from ModHearth source, not DFHack documentation — validate against actual behavior before production use.

### Data Model

7. **Event count discrepancy**: df-narrator's analysis found weblegends has 94 event handlers, LegendsBrowser2 has 132 types, and df-structures defines 144 `history_event_type` variants. The gap between 132 and 144 represents event types added after DF 0.47 and/or types not yet handled by any reference tool. Need to identify the 12 unhandled types.

8. **Plus-mode inference completeness**: LegendsBrowser2's non-plus mode inference uses hardcoded position name lists for dwarf/elf/human/goblin entities. For modded games with custom entities, this inference breaks. Need a strategy for modded-game entity type detection without plus-mode data.

9. **HF profile pointer bag nullable handling**: All `hf.info` sub-pointers are nullable. The ETL pipeline must handle all nullable paths gracefully without crashing on HFs with sparse data.

10. **Worldgen vs. post-worldgen HF data completeness**: `hf.worldgen_relationships` (up to 6 quick relationships with 22 types) exists only during worldgen and may not persist in the post-worldgen data. Need to determine when to extract this and whether it persists in `legends.xml`.

### Mod Management

11. **Steam Workshop path on macOS**: The Steam Workshop path `<Steam>/steamapps/workshop/content/975370/` is Windows-centric. On macOS Steam installations, the path differs. The mod manager must handle both paths.

12. **Conflict resolution for modded worlds in DB**: If a user switches modpacks mid-save (not recommended but possible), the DB modpack history will be inconsistent. Need a policy for how to handle modpack transitions within an active world.

13. **Level 2 conflict detection performance**: Building `{object_type: {object_id: [mod_id, ...]}}` requires parsing all raw files for all enabled mods. For large modpacks (50+ mods), this could be slow. Need to benchmark and consider caching parsed object inventories.

14. **PyLNP three-way merge with SELECT/CUT**: Line-based text merging is insufficient for v50 mods that use SELECT/CUT tokens — semantic understanding of tokens is needed for full accuracy. The full solution requires the raw compiler pipeline. Short-term: warn users that three-way merge results for v50 mods may be unreliable.

### UI/UX

15. **Static export use case**: weblegends supports BFS-crawl static export for offline/sharing use. Chronicler does not have an equivalent. Low priority but useful for sharing world histories without running the full server.

16. **LNP archive support**: LegendsBrowser v1 supports loading from `legends_archive.zip` (LNP/Lazy Newb Pack format). This format is less common with DF v50 but some users may still use it. Need to assess demand.

17. **Map coordinate system for non-square worlds**: The Leaflet world map uses `L.CRS.Simple`. For non-square world dimensions, the coordinate mapping must account for aspect ratio. LegendsBrowser2's approach uses worldgen params for width/height — need to verify this handles all world sizes.

---

## Source Files Referenced

### Narrator / Weblegends Sources
- `/Users/nathanielcannon/Claude/GitRepos/df-narrator/` (Python XML-based entity scoring and Markdown narrative generation)
- `/Users/nathanielcannon/Claude/GitRepos/weblegends/` (C++ DFHack plugin, live in-game HTML server)
- `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/` (Java, DF 0.44 XML browser)
- `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/` (Go, DF 0.47 XML browser)

### DFHack Infrastructure Sources
1. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/dfhack_remote.py` — RPC protocol implementation
2. `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/blendwarf.py` — API usage examples
3. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/memorylayout.h` — Memory layout system
4. `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/src/histfigure.h` — Historical figure extraction
5. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_figure.xml` — Complete HF structure
6. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history_event.xml` — Event type hierarchy
7. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.history.xml` — world_history container
8. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.soul.xml` — unit_soul structure
9. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.personality.xml` — personality and thought types
10. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.world.xml` — world container and worldgen structures
11. `/Users/nathanielcannon/Claude/GitRepos/df-structures/df.unit.xml` — unit structure helpers
12. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/FortressStatistics.lua` — Event orchestration
13. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/Helper.lua` — Watcher factory, incident lookup
14. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/DeathLogger.lua` — Death event handling
15. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/CitizenLogger.lua` — Citizen change detection
16. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/ItemLogger.lua` — Item creation handling
17. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnounceBooks.lua` — Book/item polling
18. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/PetitionLogger.lua` — Agreement polling
19. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/AnnouncementLogger.lua` — Report polling
20. `/Users/nathanielcannon/Claude/GitRepos/myDFHackScripts/unit.lua` — Struct introspection
21. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/Script/MapXMLParser.cs` — XML parsing
22. `/Users/nathanielcannon/Claude/GitRepos/DwarvenSurveyor/README.md` — exportlegends workflow

### Mod Management Sources
23. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/raw_handler.py` — Raw compiler implementation
24. `/Users/nathanielcannon/Claude/GitRepos/DF-Modloader/main.py` — Tkinter GUI wrapper
25. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModHearthManager.cs` — Core business logic
26. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/ModReference.cs` — Mod metadata object
27. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/DFHackModClasses.cs` — DFHack data structures
28. `/Users/nathanielcannon/Claude/GitRepos/ModHearth/bin/Debug/net7.0-windows/GetModMemoryData.lua` — DFHack Lua query
29. Dwarf Fortress Wiki — Info.txt file, Modding, Raw file, Mod articles
30. DFHack gui/mod-manager documentation and source
31. PyLNP core.mods documentation and forum thread
32. PyDwarf GitHub and modding documentation
33. NexusMods Wiki — About Load Orders, File Conflicts, Vortex approach
