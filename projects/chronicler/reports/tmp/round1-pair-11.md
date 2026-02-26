# Consolidation: Narrator/Weblegends & Legends Browsers Research

## Source Documents

- **narrator-weblegends-research.md**: Exhaustive source-level analysis of df-narrator (Python XML-based entity scoring and Markdown narrative generation) and weblegends (C++ DFHack plugin, live in-game Wikipedia-style HTML server), extracting scoring formulas, 94 event type handlers, entity page structures, and data access patterns.
- **legends-browsers-research.md**: Deep inspection of LegendsBrowser (Java, DF 0.44) and LegendsBrowser2 (Go, DF 0.47) — the two most feature-complete XML-based Legends browsing tools — cataloguing all 132 event types, every page/route, the full data model, interactive visualizations, and recommended Chronicler feature parity targets.

---

## Feature Ideas for Chronicler

### Entity Scoring and Importance Ranking

All four scoring formulas below should become Chronicler's canonical "importance" ranking for entity selection, driving "Featured" or "Notable" UI badges, AI storyteller prioritization, and narrative focus selection.

**Figure Importance Score** (from df-narrator, verbatim formula):
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
- Note: position-type entity links may double-count (both the ×20 uncapped bonus and the ×3 capped bonus)

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
- Megabeast (XML-only): hardcoded race set — BUT prefer weblegends approach: use creature_raw_flags `HAS_ANY_TITAN` / `HAS_ANY_FEATURE_BEAST` / `HAS_ANY_UNIQUE_DEMON` (more robust for modded games)
- Deity/Force/Ghost/Adventurer: direct XML `associated_type` field

---

### Historical Figure Pages

Every HF page should display all of the following (consolidated from all four tools):

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

**Related Figures (HF-to-HF links)**
- All relationship types with sex-specific labels: mother, father, spouse/wife/husband, child/son/daughter, lover, companion, prisoner/imprisoner, master/apprentice/former_master/former_apprentice, pet_owner (show "pet" if creature adopts owner), former_spouse, deceased_spouse
- Deity worship strength (dubious <10, casual <25, average <75, faithful <90, ardent ≥90)
- Vague relationships (plus-mode)
- Intrigue actors and plots

**Related Entities (HF-to-Entity links)**
- member, former_member, mercenary, former_mercenary, slave, former_slave, prisoner, former_prisoner, enemy, criminal
- Current and former positions with sex-specific title, start year / year range
- Squad links (current and former, with squad name and years)
- Occupation roles: tavern_keeper, performer, scholar, mercenary, monster_slayer, scribe, messenger (with linked location)
- Entity reputations with numeric scores for each reputation type (full list): unsolved murders, first ageless year, hero, violent, psychopath, enemy fighter, friendly fighter, killer, murderer, poet, bard, dancer, storyteller, treasure hunter, preacher, brigand, intruder, monster, thief, hated/respected group, hunter, loyal soldier, comrade, bully

**Related Sites (HF-to-Site links)**
- occupation, seat_of_power, hangout, home (linking to specific structure if HOME_SITE_ABSTRACT_BUILDING), lair, prison
- Site property links (owned properties within sites)

**Used Identities**
- All identities used, with current identity flagged

**Full Event History**
- Paginated (1000 events/page), chronological
- Perspective-aware rendering: references to this HF render as short name/pronoun, not a link
- Season display in timestamps ("early spring of 125")

**Visualization: SVG Family Tree** (from LegendsBrowser v1, high-value):
- Multi-generation genealogy: up to 3 generations up, all generations down
- Tree layout algorithm computing x-positions for non-overlapping nodes
- Nodes as colored rectangles (blue=male, pink=female, gold=deity, highlighted=self)
- Edges: horizontal for spouse links, L-shaped for parent-child
- Shows name, relation label (mother/father/son/daughter/grandson/uncle/etc.), birth/death years
- Auto-scroll to center on subject

**Visualization: Curse Lineage Tree** (from LegendsBrowser v1, high-value):
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
- D3 War Chord Diagram (from LegendsBrowser v1): inter-civilization war relationships, each civ as arc segment, chords connecting warring civs, hover highlights
- Entity type icons (Font Awesome): crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity, etc.

**Entity type categorization** (from weblegends categorize()):
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

---

### Identity Pages

- Name, profession, entity link
- Used-by HF (cross-linked from events)
- Full event history

---

### World/Civilization Dashboard (Home Page)

- Entities grouped by race, showing only civilization-type entities and necromancer groups
- Interactive Leaflet world map (see Visualization section)
- Population tab with D3 donut/pie chart breakdown by race with numbers (from LegendsBrowser v1)
- Wars tab with D3 chord diagram showing inter-civilization war relationships (from LegendsBrowser v1)
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

### Narrative Event Rendering (All Event Types)

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

**Interaction event rendering** (hf_does_interaction):
- Text comes from interaction definition's `hist_string_1` and `hist_string_2` from game raws (via DFHack)
- Vampire biting, werebeast cursing, necromantic raising all use this mechanism
- Do NOT hardcode these strings — pull from game raws so modded interactions work

**Circumstance/Reason rendering** (adds narrative context to why events happened):
- Reasons: glorify_hf → "in order to glorify [HF]"; artifact_is_heirloom_of_family_hfid → "of the [HF] family"; as_a_symbol_of_everlasting_peace; artifact_is_symbol_of_entity_position → "as a symbol of authority within [entity]"
- Circumstances: Death → "after the death of [HF]"; Prayer → "after praying to [HF]"; DreamAbout → "after dreaming about [HF]"; Dream → "after a dream"; Nightmare → "after a nightmare"; FromAfar → "from afar"

**Location rendering** (append to every event with location fields):
- "in [structure] in [site] in [region] in [layer]"
- Suppress any location component that matches the current page context

**Date/time formatting**:
- DF calendar: `doy = sec // 1200 + 1`, `month = min((doy-1)//28 + 1, 12)`, `day = (doy-1) % 28 + 1`
- Months: Granite through Obsidian (12 months × 28 days)
- Season display: "early/mid/late spring/summer/autumn/winter of [year]" (from LegendsBrowser2)
- "In YEAR on the Nth of MONTH, " or "On the Nth of MONTH, " for same-year continuation
- Age at death: fractional display (¼ if days ≥ 28×3, ½ if ≥ 28×6, ¾ if ≥ 28×9)

**Missing event fallback**: If no handler exists for a given event type, fall back to DF's own getSentence() method (via DFHack) wrapped in an accessible container with the event type/ID noted.

---

### Complete Event Type Taxonomy (consolidated from all sources)

Chronicler must have a narrative template for every event type. The consolidated list below merges weblegends' 94 handlers with LegendsBrowser2's 132 types (LB2 is more complete for DF 0.47+):

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

**HF Intrigue** (10 types):
HfAskedAboutArtifact, HfViewedArtifact, HfConvicted, HfInterrogated, HfCarouse, HfGamble, AssumeIdentity, FailedFrameAttempt, FailedIntrigueCorruption, Sabotage

**HF Acquisitions** (3 types):
HfNewPet, HfEquipmentPurchase, HfRecruitedUnitTypeForEntity

**Artifacts** (11 types):
ArtifactCreated, ArtifactDestroyed, ArtifactLost, ArtifactFound, ArtifactGiven, ArtifactPossessed, ArtifactRecovered, ArtifactStored, ArtifactTransformed, ArtifactCopied, ArtifactClaimFormed

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
- See HF section above for full spec

**Curse Lineage Tree** (HF detail page, for vampires/werebeasts):
- See HF section above for full spec

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

**Debug**:
- JSON dump at bottom of every entity page during development (`{{ json . }}`)

**LNP Archive Support** (LegendsBrowser v1):
- Support loading from `legends_archive.zip` (LNP/Lazy Newb Pack format)

**Tab State Persistence**:
- URL hash saves and restores active tab on page load

---

### Chronicler-Specific Advantages to Build On

1. **Persistent PostgreSQL database** — unlike in-memory parse-on-start tools, enables: historical diffs across saves, trend analysis over fortress lifetime, cross-session queries, incremental updates
2. **LLM-enhanced narrative** — use LLM generation for richer event sentences beyond templates; AI storyteller persona
3. **API-first design** — expose JSON APIs in addition to HTML, enabling external tooling and programmatic access
4. **live DFHack integration** — provides data unavailable in XML: current inhabitants, site ownership, creature raw data for interaction text, squad names, occupation detail, age calculations from live tick
5. **Cross-save analytics** — track population trends, war outcomes, artifact journeys across multiple fortress saves

---

## Reference Implementations

### df-narrator HF_FIELDS Set (canonical XML HF-reference fields)

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

This is the canonical list of XML fields that reference historical figure IDs. Not obvious from XML structure — represents accumulated community knowledge.

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

### weblegends Cross-Linking Pattern (C++)

```cpp
// Always generate link:
void link(ostream &s, df::historical_figure *hf);

// Context-aware: suppress link if hf == context entity:
void event_link(ostream &s, const event_context &ctx, df::historical_figure *hf);

// Zombie handling: if curse.original_histfig_id != -1, render as "zombie" with hover
// Written content italicization: wrap in <em> if item has writingst/pagesst improvements
// Name translation: native name in <abbr title="ENGLISH">NATIVE</abbr>
```

The `event_context` struct pattern should be adopted in Chronicler's rendering layer.

### weblegends Event Dispatch Pattern (C++)

```cpp
// Each event type is a separate file: events/event_type_name.cpp
// Signature: void do_event(ostream &s, const event_context &ctx, df::specific_event_type *e)
// Central dispatch in helpers/event.cpp wraps with temporal context:
// "In YEAR on the Nth of MONTH, " / "On the Nth of MONTH, "
// 1000-event pagination with year-group boundaries and week splits within dense years
```

94 `.cpp` files, one per event type, all following the same `do_event(ostream, context, event*)` pattern.

### weblegends DFHack Memory Access Pattern (C++)

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

### LegendsBrowser2 RelatedTo Interface (Go)

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

Every event implements all RelatedTo* methods. Enables `world.EventsMatching(func(d) bool { return d.RelatedToHf(id) })` for any entity type. Chronicler should adopt this interface for its event model (mapped to PostgreSQL queries or in-memory filtering depending on context).

### LegendsBrowser2 DfWorld Root Container (Go)

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

This is the complete DF world data model — every entity type Chronicler's CDM must represent.

### LegendsBrowser2 Processing Pipeline (Go, post-parse)

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

### LegendsBrowser Java SAX Parsing Approach

- SAX streaming with `@Xml("element_name")` annotation-driven field mapping
- `@XmlSubtypes` / `@XmlSubtype("battle")` polymorphic dispatch: read `<type>` first, switch to correct subclass, replay cached elements
- Handles 400MB+ exports at constant memory (no DOM)
- `CodingErrorAction.IGNORE` for malformed DF XML bytes
- Reads separately: `legends.xml`, `legends_plus.xml`, `world_history.txt`, `world_gen_param.txt`, `sites_and_pops.txt`, world map image

### LegendsBrowser2 Custom XML Tokenizer (Go)

- NOT using Go's standard `encoding/xml` — avoids attribute map and namespace overhead
- Custom `XMLParser` backed by `bufio.Reader`, reading byte-by-byte
- `model.go` is fully code-generated from an `analyze/` generator tool that inspects DF XML structure
- `cp473.go` converts legacy IBM CP473 characters to Unicode (DF encoding quirk — both tools handle this)
- Progress bar via `pb/v3` on the reader proxy for real-time feedback during loading
- After loading `legends.xml`, auto-detect and load `legends_plus.xml` (replace suffix in path)
- World map: loads `-world_map.*` or `-detailed.*` (supports BMP via golang.org/x/image/bmp), encodes to PNG in memory

### LegendsBrowser2 Template Function Registry

Key template functions registered globally:
- `hf id`, `entity id`, `site id`, `structure siteId structId`, `artifact id`, `region id`, `collection id`, `writtenContent id`, `musicalForm id`, `danceForm id`, `poeticForm id` → HTML anchor tags
- `events obj` → EventList for any object type
- `history siteId` → site history event list
- `story eventId` → event in story mode
- `time year seconds` → formatted time string with season
- `andList []string` → "a, b and c" formatting
- `initMap` → Leaflet init script
- `addSite id color`, `addRegion id`, `addLandmass id`, `addMountain id color`, `addWorldConstruction id`, `addRiver id`, `addCollection id` → map JavaScript emitters

### LegendsBrowser v1 Family Tree Layout Algorithm (Java)

The `FamilyMember.layout()` / `layoutUp()` / `layoutDown()` algorithm in `HfsController.java` is self-contained and can be ported:
- Traverses HF links to build a tree structure
- Computes non-overlapping x-positions for each generation
- Returns SVG coordinate data per node
- Handles both upward (ancestors) and downward (descendants) traversal independently

---

## Data Access Patterns

### XML Export Files (All Four Tools)

All four tools consume Dwarf Fortress XML export files. The primary file is `legends.xml`; the supplementary file is `legends_plus.xml` (available when exporting with DFHack's `exportlegends` plugin active, adds plus-mode data not in base export). Additional files: `world_history.txt` (leader/succession data), `world_gen_param.txt` (world dimensions), `sites_and_pops.txt`, world map image (BMP or PNG).

**Field extraction from legends.xml** (df-narrator canonical list):
- Sites: `id`, `name`, `type`, `coords`, structure count
- Entities: `id`, `name`
- Artifacts: `id`, `name`, `holder_hfid`, `creator_hfid`, item `name_string`, `mat`
- Historical Figures: `id`, `name`, `race`, `caste`, `birth_year`, `death_year`, `associated_type`, active_interactions, entity_links, hf_links, skills (with total_ip), spheres, site_links
- Events: `id`, `type`, `year`, `seconds72`, all other child elements as flat key→text dict
- Event Collections: `type`, `name`, `start_year`, `end_year`, aggressor/defender entity IDs, site_id, member event IDs

**Encoding gotcha**: DF XML has malformed bytes. Must use `CodingErrorAction.IGNORE` (Java) or equivalent. IBM CP473 legacy characters require conversion to Unicode.

**Large file handling**: 25MB–400MB+ exports. All four tools use streaming parsers (SAX or custom tokenizer) to avoid loading full DOM into memory. Java recommends 1024MB+ heap for very large exports.

### Live DFHack Memory Access (weblegends)

- Direct C++ struct pointer access via DFHack's generated bindings
- `df::*::find(id)` uses O(log n) binary search in DF's sorted lookup tables
- `CoreSuspender` acquired at start of each render call — briefly pauses DF simulation thread for data consistency
- No caching — every HTTP request re-renders from live memory (intentional: game state changes continuously)
- Provides data unavailable in XML: current inhabitants (via nemesis records), current site ownership, current artifact locations, current year/tick for age calculations, creature raws (caste descriptions, gender symbols), interaction definitions (hist_string_1/2), squad names, occupation records, entity position names

### DFHack Lua / dfhack-run (Chronicler's current approach)

- `dfhack-run` over SSH for real-time Lua commands (replaces broken TCP RPC for game-thread calls)
- `chronicler-bridge.lua` repeat job writes JSON served over HTTP for bulk data
- TCP RPC works ONLY for cached calls (GetVersion, GetWorldInfo)
- RFR plugin loaded (41 functions) but game-thread dispatch hangs on DFHack 53.x under Prism

### HTTP Serving Architecture (weblegends and LegendsBrowser2)

**weblegends**: TCP socket listener on ports 5080–5089 (first available). One accept thread + one thread per client. Static export via `weblegends-export <folder>` — BFS crawl starting from `/`, follows all `href`/`src` attributes, writes static HTML files with deduplication via `set<string>`.

**LegendsBrowser2**: Go HTTP server on port 58881. All routes registered in `server.go`. Popover endpoints (`/popover/{type}/{id}`) return HTML snippets for hover popovers.

### legends_plus.xml (additional data when DFHack exportlegends is used)

Plus-mode data includes: entity positions and assignments, entity honors, occasions and schedules, squad links, site properties, relationship profiles, HF intrigue actors/plots, werebeast/vampire/necromancer since-year tracking. Non-plus inference compensates: race cleanup, entity type inference from events, hardcoded position lists.

---

## Key Insights

### Narrative Architecture

1. **Template-based vs. LLM-based rendering**: df-narrator, weblegends, and LegendsBrowser all use deterministic string templates. Chronicler's unique advantage is the ability to use LLM generation to produce richer, non-repetitive narrative prose. Templates should remain as a fast fallback and as training scaffolding.

2. **Context-aware self-reference suppression**: The weblegends `event_context` pattern (suppressing links/full names when the referenced entity is the current page's subject) is critical for readability. It prevents the narrative from being flooded with redundant "Urist McFighter attacked Urist McFighter's enemy..." constructions. This must be implemented in Chronicler's narrative layer.

3. **Scoring formulas are well-calibrated**: df-narrator's four scoring formulas represent accumulated community knowledge about what makes DF entities narratively interesting. The figure score weights (deity > kills > artifacts > events) align with what players find compelling. These should not be discarded in favor of a raw "most events" ranking.

4. **Co-appearance rivalry detection** is a lightweight but effective narrative technique: scanning shared event participation surfaces meaningful figure pairs without requiring explicit relationship links.

### Event Type Coverage

5. **94 weblegends handlers vs. 132 LegendsBrowser2 types**: LegendsBrowser2 is more complete, covering 38 additional event types introduced in DF 0.44–0.47. Chronicler should target LB2's 132-type coverage as the baseline, not weblegends' 94.

6. **Death cause granularity matters**: DF has 50+ distinct death causes. Rendering them as generic "died" is a significant quality loss. Users notice and care about the difference between "was beheaded", "drowned in magma", and "died of old age."

7. **Masterpiece events (6 types)**: Often overlooked but these track the craftwork and cultural output of civilizations. Important for the culture/history visualization layer.

### Data Model Insights

8. **Ruin state must be derived from events**: Sites and structures don't have an explicit `ruin` flag in XML — ruin status must be inferred during post-parse processing by tracking creation/destruction/reclaim events. LegendsBrowser2's `processEvents()` pipeline implements this correctly.

9. **Entity type inference for non-plus mode**: Without `legends_plus.xml`, entity types must be inferred from events (site takeover/creation patterns) and leader races (a goblin-led entity is probably a goblin civilization). LegendsBrowser2 has hardcoded position name lists for dwarf/elf/human/goblin entities as a fallback.

10. **Kill list construction**: HF kill lists are not stored directly in the XML. They must be built during processing by scanning all `HfDied` events and indexing `slayer_hfid`. Both tools do this in the post-parse processing step.

11. **Relationship profiles are plus-mode only**: Visual/historical/identity relationship types (the scores like "hero", "murderer", "psychopath") are in `legends_plus.xml`. Without it, only basic link types are available.

### Visualization Insights

12. **The Leaflet world map is the centerpiece feature**: It integrates all geographic entity types (sites, regions, constructions, mountains, rivers, landmasses) with entity-specific color coding and hover popovers. Battle markers on war pages make conflict geography immediately legible. This is the highest-value single visualization.

13. **The SVG Family Tree is a signature feature users love** (per LegendsBrowser1 documentation). It is unique to LegendsBrowser v1 and not present in v2 — a gap that Chronicler can fill. The layout algorithm is self-contained and portable.

14. **The Curse Lineage Tree** is a compelling narrative visualization that no other tool has implemented in v2. Tracing vampirism/werebeast infection chains is a compelling DF story element.

15. **D3 chord diagrams for wars** provide an at-a-glance overview of inter-civilization conflict patterns that is impossible to convey in tabular form.

### XML Parsing Insights

16. **Custom tokenizers outperform standard XML libraries** for DF-sized exports: Go's standard `encoding/xml` was bypassed in LegendsBrowser2 for a custom tokenizer; Java's DOM parsers require 1GB+ heap for large exports, necessitating SAX streaming. Chronicler's Python ETL pipeline should use SAX or iterparse, not ElementTree with full tree loading (though df-narrator uses `root.clear()` after extraction as a memory mitigation).

17. **Code generation from XML structure analysis** (LegendsBrowser2's `analyze/` tool) produces the most maintainable parser — the generated `model.go` adapts automatically when DF adds new XML fields. Worth considering for Chronicler's long-term maintainability.

18. **IBM CP473 encoding**: Both LegendsBrowser versions include explicit CP473→Unicode conversion. DF XML can contain legacy IBM code page characters that standard UTF-8 parsers will fail on or silently corrupt.

### Performance Insights

19. **Pagination at 1000 events/page** (weblegends) is the right threshold for figures/sites with dense histories. Within a dense year, split by DF weeks (every 7 days). Without pagination, pages for major deities or capital cities can have tens of thousands of events, making them unusable.

20. **All-in-memory maps vs. database**: LegendsBrowser2 keeps all data in `map[int]*T` for O(1) lookups. Chronicler's PostgreSQL backend requires indexed queries but gains persistence, cross-save diffing, and analytical query capabilities that in-memory tools cannot provide. The trade-off is worth it but requires careful indexing strategy.

### Chronicler Integration Priorities (Ranked)

High priority (must-have for feature parity):
- All 132 event types rendered as human-readable narrative sentences
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

High value (significantly enhance quality):
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

Chronicler-exclusive (leverage unique architecture):
- Historical diffs across saves (cross-session trend analysis)
- LLM-generated narrative enrichment beyond templates
- JSON APIs for external tooling
- Live DFHack integration for current game state
- Cross-save artifact journey tracking
