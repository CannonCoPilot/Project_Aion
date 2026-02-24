# Research Report: LegendsBrowser & LegendsBrowser2 — Feature Analysis for Chronicler Parity

**Date**: 2026-02-23
**Scope**: Deep inspection of source code, templates, and models for both LegendsBrowser (Java, DF 0.44) and LegendsBrowser2 (Go, DF 0.47). Goal: extract every user-facing feature, design pattern, and data model detail to inform Chronicler feature parity.

---

## 1. Repository Overview

| Attribute | LegendsBrowser (v1) | LegendsBrowser2 (v2) |
|---|---|---|
| Language | Java (Spring-style, Velocity templates) | Go + Go HTML templates |
| DF Version | 0.44 | 0.47 (current parity target) |
| Source files | ~263 Java files | ~25 Go files + ~50 HTML templates |
| Port | 58881 | 58881 |
| Repo | `GitRepos/LegendsBrowser/` | `GitRepos/LegendsBrowser2/` |
| Key entry | `src/main/java/legends/` | `backend/` |

LegendsBrowser2 is the active, feature-complete reference. LegendsBrowser v1 has one unique feature not in v2: **SVG family tree + curse lineage tree** and the **D3.js chord diagram** for wars. These are both worth implementing in Chronicler.

---

## 2. Features & Capabilities (Complete Inventory)

### 2.1 Navigation Structure (LegendsBrowser2)

The navbar (`backend/templates/layout.html`) exposes:

- **Civilizations** — root `/`, groups entities by race, shows map
- **World Map** — `/worldmap`, interactive Leaflet map of entire world
- **Objects** dropdown:
  - Geography — `/geography` (regions, landmasses, mountain peaks, rivers)
  - Entities — `/entities`
  - Sites — `/sites`
  - Structures — `/structures`
  - Historical Figures — `/hfs`
  - Identities — `/identities`
  - World Constructions — `/worldconstructions`
  - Artifacts — `/artifacts`
  - Art Forms — `/artforms` (dance, musical, poetic forms combined)
  - Written Contents — `/writtencontents`
- **Years** — `/years`, chronological index of all events
- **Collections** — `/collections`, grouped event collections (wars, battles, etc.)
- **Search** — global search bar with live autocomplete (`/search?term=`)

### 2.2 All Page Types (Routes)

From `backend/server/server.go`:

| Route | Template | Data |
|---|---|---|
| `/` | `index.html` | Civilizations grouped by race |
| `/worldmap` | `worldMap.html` | All geo objects for Leaflet |
| `/geography` | `geography.html` | Regions, landmasses, mountains, rivers |
| `/entities` | `entities.html` | All entities, grouped by type |
| `/entity/{id}` | `entity.html` | Entity detail |
| `/sites` | `sites.html` | All sites, grouped by type |
| `/site/{id}` | `site.html` | Site detail with tabs |
| `/site/{siteId}/structure/{id}` | `structure.html` | Structure detail |
| `/structures` | `structures.html` | All structures across all sites |
| `/worldconstructions` | `worldconstructions.html` | World constructions grouped by type |
| `/worldconstruction/{id}` | `worldconstruction.html` | Construction detail |
| `/artifacts` | `artifacts.html` | Artifacts grouped by type |
| `/artifact/{id}` | `artifact.html` | Artifact detail |
| `/artforms` | `artforms.html` | Dance, Musical, Poetic forms combined |
| `/danceform/{id}` | `artform.html` | Dance form detail |
| `/musicalform/{id}` | `artform.html` | Musical form detail |
| `/poeticform/{id}` | `artform.html` | Poetic form detail |
| `/writtencontents` | `writtencontents.html` | Written contents grouped by type |
| `/writtencontent/{id}` | `writtencontent.html` | Written content detail |
| `/hfs` | `hfs.html` | Historical figures (filtered/sorted) |
| `/hf/{id}` | `hf.html` | HF detail |
| `/identities` | `identities.html` | All identities |
| `/identity/{id}` | `identity.html` | Identity detail |
| `/regions` | `regions.html` | Regions grouped by type |
| `/region/{id}` | `region.html` | Region detail |
| `/landmass/{id}` | `landmass.html` | Landmass detail |
| `/mountain/{id}` | `mountain.html` | Mountain peak detail |
| `/river/{id}` | `river.html` | River detail |
| `/years` | `years.html` | All years with event counts |
| `/year/{id}` | `year.html` | All events in a specific year |
| `/events` | `eventTypes.html` | List of all event types |
| `/events/{type}` | `eventType.html` | All events of a given type |
| `/event/{id}` | `event.html` | Single event detail |
| `/collections` | `collections.html` | All event collections, grouped by type |
| `/collection/{id}` | `collection.html` | Collection detail |
| `/search` | `search.html` | Full-text search results |
| `/map` | (raw PNG) | World map image |

**Popover endpoints** (every major entity type has a `/popover/{type}/{id}` route returning HTML snippets for hover popovers):
- entity, hf, site, structure, region, region, landmass, mountain, river, artifact, worldconstruction, writtencontent, collection, identity

### 2.3 Index Page (Civilizations Dashboard)

The root page (`index.html`) groups entities by race (dwarf, human, elf, goblin, necromancer, etc.) showing only civilization-type entities and necromancer groups. The Leaflet map is shown if map data is loaded.

**LegendsBrowser v1** additionally showed:
- Population tab with a **D3.js donut/pie chart** broken down by race with population numbers
- Wars tab with a **D3.js chord diagram** showing inter-civilization war relationships (source: `indexWars.vm`, using `chord.json` endpoint)

### 2.4 Historical Figure (HF) Detail Page

Both versions display (source: `hf.html`, `hf.vm`):
- Name, race, sex (gender icon), birth/death years
- Special type flags: deity, force, vampire, werebeast, necromancer, adventurer
- Spheres of influence (for deities)
- Goals list
- Journey pets list
- Kill count (computed from `HfDied` events where SlayerHfid matches)
- Site links with link type (lair, home, seat of power, occupation, etc.)
- Current and former position links (e.g., "King of The Iron Hammer since 125")
- HF-to-HF links (spouse, child, parent, master/apprentice, deity, prisoner, etc.)
- Entity links (member of, enemy of, prisoner of, position in, etc.)
- Entity reputations with numeric scores for: unsolved murders, first ageless year, hero, violent, psychopath, enemy fighter, friendly fighter, killer, murderer, poet, bard, dancer, storyteller, treasure hunter, preacher, brigand, intruder, monster, thief, hated/respected group, hunter, loyal soldier, comrade, bully
- Vague relationships
- Intrigue actors and plots
- Used identities (with current identity flagged)
- Site property links
- Squad links (current and former)
- Full event history filtered to this HF

**LegendsBrowser v1 unique feature — Family Tree:**
An SVG-rendered family tree (`hffamily.vm`) traversing parent/child/spouse links up to 3 generations in each direction. Nodes are colored by gender/deity status. Each node shows name, relation label, and birth/death years. The tree auto-scrolls to center on the subject.

**LegendsBrowser v1 unique feature — Curse Lineage Tree:**
For vampires and werebeasts, a separate "Curse Lineage" tree is rendered showing who bit whom (tracing `HfDoesInteraction` events for `DEITY_CURSE_WEREBEAST_*` and `DEITY_CURSE_VAMPIRE_*` interactions). The tree traces upward to find the original curse source.

**Source files:**
- `src/main/java/legends/web/HfsController.java` — filter/sort logic
- `src/main/resources/templates/hf.vm` and `hffamily.vm`
- `backend/templates/hf.html`

### 2.5 Entity Detail Page

Both versions display (source: `entity.html`):

**Tabs:**
1. **Leaders** — table of leaders with date range (from/till), linked to their HF pages
2. **Sites** — table of sites controlled by this entity, each with inline event history (site creation, takeover, destruction)
3. **Members** — list of member HFs
4. **Groups** — child entities (sub-organizations)
5. **Wars** — table of wars showing date range, war name (linked to collection), and enemy entity (attacker/defender role)

Plus: mini-map showing all owned sites, full event history.

### 2.6 Site Detail Page

Tabs:
1. **Structures** — table of all structures within the site (name, type, ruin status)
2. **Properties** — site properties (owner HF, type, linked structure)
3. **History** — site-level history events (created, taken over, destroyed, reclaimed)

Plus: mini-map centered on site, full event list for the site.

### 2.7 Structure Detail Page

Shows: name, type, ruin status, site link. Full event list for the structure.

### 2.8 Collection Detail Page

Collections represent grouped events (wars, battles, sieges, etc.). Source: `collection.html`, `collectionDetail.html`, `collections.go`.

**Collection types handled:**
- `war` — shows sub-collections (battles, sieges) in chronological order
- `battle` — shows squads, attackers/defenders, outcome
- `beast attack` — shows attacker HFs
- `abduction` — shows target HFs
- `duel` — shows participants
- `entity overthrown` — shows target entity and site
- `insurrection` — shows site
- `journey` — shows traveler HFs
- `occasion` — shows entity, name, commemoration event
- `ceremony` — opening/main/closing ceremony of an occasion
- `competition` — named competition type
- `performance` — named performance type
- `procession` — links back to parent occasion
- `persecution` — shows target entity and site
- `purge` — shows purge adjective and site
- `raid` — shows site
- `site conquered` — shows site
- `theft` — shows site

Each collection page shows: map with battle markers (for wars/battles), sub-collections, and all events.

**Source:** `backend/model/collections.go`, `backend/templates/collection.html`, `backend/templates/collectionDetail.html`

### 2.9 Artifact Detail Page

Shows: name, item description, material, item type/subtype, page count, contained written content, current location (site), current holder (HF). Full event history.

### 2.10 Written Content Detail Page

Shows: name, form (poem, musical composition, choreography, etc.), author HF link, linked art form (poetic/musical/dance). References section (what the work refers to), style list. Full event history.

### 2.11 Art Form Detail Pages (Dance, Music, Poetry)

Shows: name, description (with hyperlinked mentions of entities, HFs, other forms). Full event history.

The `LinkDescription()` function in `functions.go` parses the description text and replaces entity/HF/form names with HTML links.

### 2.12 World Construction Detail Page

Shows: name, type (road, tunnel, bridge, etc.), coords. Map marker. Full event history.

### 2.13 Geography Pages

- **Landmass** — name, coordinate bounds, map highlight
- **Mountain Peak** — name, coords, volcano flag, map marker
- **River** — name, list of paths
- **Region** — name, type, evilness (good/evil/neutral), full event history, region outline on map

### 2.14 Identity Detail Page

Shows: name, profession, entity link, used-by HF (cross-linked back from events). Full event history.

### 2.15 Years and Events Pages

- `/years` — lists all years with event counts, grouped
- `/year/{id}` — all events that occurred in that year, rendered as narrative sentences
- `/events` — all known event types as a list
- `/events/{type}` — all events of that type, chronologically
- `/event/{id}` — individual event detail

### 2.16 Search

Full-text substring search across: historical figures, entities, sites, structures, regions, artifacts, world constructions, dance forms, musical forms, poetic forms, written contents, landmasses, mountain peaks.

**Live autocomplete** via `/search?term=` returning JSON `[{label, value}]`. Client-side: custom `Autocomplete` class in `autocomplete.js`, fetches 50 results, navigates on selection.

**Search results page**: categorized results with counts per category.

---

## 3. XML Parsing Strategy

### LegendsBrowser (Java)

**File:** `src/main/java/legends/LegendsReader.java` and `src/main/java/legends/xml/handlers/`

**Approach: SAX streaming with annotation-driven reflection.**

1. Uses Java's SAX `XMLReader` + a custom `AnnotationContentHandler` (extends `StackContentHandler`).
2. Model classes are annotated with `@Xml("element_name")` to map XML elements to Java fields.
3. Events use `@XmlSubtypes` / `@XmlSubtype("battle")` polymorphic dispatch: the `<type>` element is read first, the handler switches to the correct subclass config, then caches already-read elements and replays them.
4. For 400MB+ exports: recommends 1024MB+ heap via `.l4j.ini`. No explicit chunking — relies on JVM SAX parser streaming.
5. Charset: UTF-8 with `CodingErrorAction.IGNORE` to handle malformed DF XML bytes.
6. Separately reads: `legends.xml`, `legends_plus.xml` (if available), `world_history.txt`, `world_gen_param.txt`, `sites_and_pops.txt`, world map image.

**Key files:**
- `src/main/java/legends/xml/handlers/AnnotationContentHandler.java` — subtype dispatch, element caching
- `src/main/java/legends/xml/handlers/AnnotationConfig.java` — reflection config per class
- `src/main/java/legends/xml/annotation/Xml.java` — `@Xml` field annotation

### LegendsBrowser2 (Go)

**File:** `backend/util/xml.go`, `backend/model/parse.go`

**Approach: Custom hand-written streaming tokenizer.**

1. **NOT** using Go's standard `encoding/xml` decoder for the main parse (though it's imported). Uses a custom `XMLParser` struct backed by `bufio.Reader`.
2. The tokenizer (`util/xml.go`) reads byte-by-byte, emitting `StartElement` / `EndElement` tokens. It supports self-closing elements. The `Value()` method reads text content between tags.
3. `Parse()` in `model/parse.go` calls `NewLegendsParser()` which wraps the file in a `pb.ProgressBar` proxy reader for CLI progress display.
4. Generated code: `model/model.go` is **code-generated** (`// Code generated by legendsbrowser; DO NOT EDIT.`). The `analyze/` directory contains the generator tool that analyzes DF XML structure and produces Go struct definitions and parse functions.
5. After parsing `legends.xml`, automatically looks for `legends_plus.xml` (replacing `-legends.xml` with `-legends_plus.xml` in path).
6. World map: loads from `-world_map.*` or `-detailed.*` (supports BMP via `golang.org/x/image/bmp`), encodes to PNG in memory.
7. World history: loads from `-world_history.txt` using regex to extract leader names and reign start years.

**CP473 encoding:** `backend/util/cp473.go` — converts legacy IBM CP473 characters to Unicode. Both tools handle the DF character encoding quirk.

**Performance observations:**
- The custom tokenizer avoids the overhead of Go's standard XML decoder attribute parsing and namespace handling.
- Progress bar gives real-time feedback during loading of 25MB+ files.
- The `Same.json` / `overwrites.json` in `analyze/` suggest the code generator deduplicates fields that appear identically across event subtypes to reduce generated code size.

---

## 4. Event Types (Comprehensive List)

LegendsBrowser2 handles **132 event types** (verified by grep count on `events.go`). LegendsBrowser v1 handles ~119 event Java files (slightly fewer, as v2 targets DF 0.47).

### Complete Event Type List (LegendsBrowser2)

**HF Social / Relationship:**
- `AddHfEntityHonor` — HF receives a title/honor from entity
- `AddHfEntityLink` — HF joins/becomes position/enemy/prisoner/slave/squad member of entity
- `AddHfHfLink` — HF-to-HF relationship formed (marriage, master/apprentice, deity worship, romance, various friendship/rivalry types)
- `AddHfSiteLink` — HF establishes residence, occupation, seat of power, prison link at site
- `RemoveHfEntityLink` — HF leaves entity
- `RemoveHfHfLink` — HF relationship ends
- `RemoveHfSiteLink` — HF vacates site link
- `HfsFormedIntrigueRelationship` — intrigue relationship formed
- `HfsFormedReputationRelationship` — reputation relationship formed
- `HfRelationshipDenied` — relationship request denied

**HF Life Events:**
- `HfDied` — death with cause, slayer info, method
- `HfRevived` — resurrection
- `ChangedCreatureType` — race change (transformation)
- `ChangeHfBodyState` — body state change
- `ChangeHfJob` — profession change
- `ChangeHfState` — state change (location, mood)
- `HfReachSummit` — mountain summit reached
- `HfTravel` — travel event (used for journey collections)
- `HfReunion` — reunion of HFs

**HF Combat / Violence:**
- `HfSimpleBattleEvent` — single combat
- `HfWounded` — wounding
- `HfAbducted` — abduction
- `HfEnslaved` — enslavement
- `HfFreed` — freed from captivity
- `HfRansomed` — ransomed
- `HfAttackedSite` — solo attack on site
- `HfDestroyedSite` — solo site destruction
- `HfConfronted` — confrontation
- `BodyAbused` — body abuse post-death
- `CreatureDevoured` — creature eaten

**HF Supernatural / Dark Arts:**
- `HfDoesInteraction` — curse given (vampirism, werebeast curse), divine interaction
- `HfLearnsSecret` — necromancy secret learned
- `HfGainsSecretGoal` — secret goal gained
- `HfPerformedHorribleExperiments` — dark experiments
- `HfDisturbedStructure` — structure disturbance

**HF Religion / Culture:**
- `HfPrayedInsideStructure` — prayer event
- `HfPreach` — preaching
- `HfProfanedStructure` — structure profaned
- `HolyCityDeclaration` — holy city declared

**HF Intrigue:**
- `HfAskedAboutArtifact` — artifact inquiry
- `HfViewedArtifact` — artifact viewed
- `HfConvicted` — convicted of crime
- `HfInterrogated` — interrogation
- `HfCarouse` — carousing
- `HfGamble` — gambling
- `AssumeIdentity` — false identity assumed
- `FailedFrameAttempt` — frame attempt failed
- `FailedIntrigueCorruption` — corruption attempt failed
- `Sabotage` — sabotage

**HF Acquisitions:**
- `HfNewPet` — pet acquisition
- `HfEquipmentPurchase` — equipment purchase
- `HfRecruitedUnitTypeForEntity` — recruited for entity

**Artifacts:**
- `ArtifactCreated` — creation (with creator, reason, sanctified HF)
- `ArtifactDestroyed` — destruction
- `ArtifactLost` — loss
- `ArtifactFound` — found
- `ArtifactGiven` — gifted
- `ArtifactPossessed` — possessed
- `ArtifactRecovered` — recovered
- `ArtifactStored` — stored
- `ArtifactTransformed` — transformed
- `ArtifactCopied` — copied (from original or copy)
- `ArtifactClaimFormed` — claim established (heirloom, symbol, treasure)

**Sites / Constructions:**
- `CreatedSite` — site founded
- `DestroyedSite` — site destroyed
- `SiteTakenOver` — site conquered
- `ReclaimSite` — site reclaimed
- `SiteRetired` — site retired
- `SiteDied` — site died (abandoned)
- `SiteDispute` — dispute over site
- `SiteTributeForced` — tribute demanded
- `AttackedSite` — site attacked
- `PlunderedSite` — site plundered
- `HfAttackedSite` — HF solo attack
- `HfDestroyedSite` — HF solo destruction
- `SiteSurrendered` — site surrendered
- `EntityFledSite` — entity fled site
- `EntityRampagedInSite` — entity rampaged
- `EntitySearchedSite` — site searched
- `NewSiteLeader` — new site leader appointed
- `EntityRelocate` — entity relocated
- `BuildingProfileAcquired` — building profile acquired
- `ModifiedBuilding` — building modified
- `CreatedStructure` — structure built
- `RazedStructure` — structure razed
- `ReplacedStructure` — structure replaced
- `CreatedWorldConstruction` — world construction built

**Entities:**
- `EntityCreated` — entity founded
- `EntityDissolved` — entity dissolved
- `EntityIncorporated` — entity incorporated
- `EntityAllianceFormed` — alliance formed
- `EntityOverthrown` — entity overthrown
- `EntityLaw` — law enacted
- `EntityPersecuted` — entity persecuted
- `EntityPrimaryCriminals` — primary criminals established
- `EntityEquipmentPurchase` — entity equipment purchased
- `EntityBreachFeatureLayer` — breach of underground
- `EntityExpelsHf` — HF expelled
- `CreateEntityPosition` — position created
- `InsurrectionStarted` — insurrection begun
- `RegionpopIncorporatedIntoEntity` — population incorporated
- `ItemStolen` — item stolen

**Diplomacy / Trade:**
- `AgreementFormed` — agreement formed
- `AgreementMade` — agreement accepted
- `AgreementConcluded` — agreement concluded
- `AgreementRejected` — agreement rejected
- `Trade` — trade occurred
- `Merchant` — merchant event
- `DiplomatLost` — diplomat lost
- `FirstContact` — first contact between civs
- `FirstContactFailed` — first contact failed
- `PeaceAccepted` — peace accepted
- `PeaceRejected` — peace rejected
- `FieldBattle` — field battle (large scale)
- `SquadVsSquad` — squad combat
- `TacticalSituation` — tactical situation
- `SneakIntoSite` — infiltration
- `SpottedLeavingSite` — spy spotted

**Culture / Art:**
- `ArtFormCreated` — art form (dance/music/poem) created
- `DanceFormCreated` — dance form created
- `MusicalFormCreated` — musical form created
- `PoeticFormCreated` — poetic form created
- `WrittenContentComposed` — written content composed
- `KnowledgeDiscovered` — knowledge discovered

**Masterpices:**
- `MasterpieceArchConstructed` — architectural masterpiece
- `MasterpieceDye` — dye masterpiece
- `MasterpieceEngraving` — engraving masterpiece
- `MasterpieceFood` — food masterpiece
- `MasterpieceItem` — item masterpiece
- `MasterpieceItemImprovement` — item improvement masterpiece
- `MasterpieceLost` — masterpiece lost

**Occasions:**
- `Ceremony` — ceremony event
- `Competition` — competition event
- `Performance` — performance event
- `Procession` — procession event
- `Gamble` — gambling event

**Misc:**
- `ChangeHfBodyState`
- `HfCarouse`

### Event Rendering Pattern

Every event implements an `Html(*Context) string` method returning a human-readable narrative sentence. The `Context` struct carries:
- `World *DfWorld` — all data
- `HfId int` — current context HF (affects pronoun/possessive rendering)
- `Story bool` — if true, renders in "story" voice (used for `WrittenContent` references)
- `Event *HistoricalEvent` — the event being rendered

The context provides helper functions: `hf()`, `entity()`, `site()`, `artifact()`, `structure()`, `region()`, `collection()`, etc. — each returns an HTML anchor tag with the appropriate CSS class for hover popover activation.

**Source:** `backend/model/events.go` (all 132 event Html() implementations), `backend/model/context.go`

---

## 5. Data Model

### 5.1 DfWorld (root container) — `backend/model/model.go` (generated)

```
DfWorld {
    Name_, Altname string
    FilePath, PlusFilePath string
    Plus bool (legends_plus loaded)
    Width, Height int (from worldgen params)
    MapData []byte (PNG)
    MapReady bool
    
    Regions           map[int]*Region
    UndergroundRegions map[int]*UndergroundRegion
    Sites             map[int]*Site
    WorldConstructions map[int]*WorldConstruction
    Artifacts         map[int]*Artifact
    HistoricalFigures map[int]*HistoricalFigure
    Identities        map[int]*Identity
    EntityPopulations map[int]*EntityPopulation
    Entities          map[int]*Entity
    HistoricalEvents  map[int]*HistoricalEvent
    HistoricalEventCollections map[int]*HistoricalEventCollection
    HistoricalEventRelationships []*HistoricalEventRelationship
    HistoricalEras    []*HistoricalEra
    DanceForms        map[int]*DanceForm
    MusicalForms      map[int]*MusicalForm
    PoeticForms       map[int]*PoeticForm
    WrittenContents   map[int]*WrittenContent
    Landmasses        map[int]*Landmass
    MountainPeaks     map[int]*MountainPeak
    Rivers            []*River
}
```

### 5.2 HistoricalFigure

Key fields (source: `src/main/java/legends/model/HistoricalFigure.java` + generated Go model):

```
Name, Race, Caste
Sex (int: 0=male, 1=female)
BirthYear, BirthSeconds72
DeathYear, DeathSeconds72
AssociatedType
EntPopId

// Computed flags (not in XML, derived from events)
Leader bool (from world_history.txt)
Vampire bool (from HfDoesInteraction DEITY_CURSE_VAMPIRE_*)
Werebeast bool (from HfDoesInteraction DEITY_CURSE_WEREBEAST_*)
Necromancer bool (from HfLearnsSecret SECRET_*)
Deity, Force, Ghost, Adventurer bool (direct XML)
Kills []int (slain HF ids)

// Links
HfLink []HfLink           {Hfid, LinkType}
EntityLink []EntityLink   {EntityId, LinkType}
SiteLink []SiteLink       {SiteId, LinkType}
EntityPositionLink []EntityPositionLink
EntityFormerPositionLink []EntityPositionLink
EntityReputation []EntityReputation
EntitySquadLink, EntityFormerSquadLink
VagueRelationship []VagueRelationship
RelationshipProfile (visual/historical/identity)
IntrigueActor []IntrigueActor
IntriguePlot []IntriguePlot
SitePropertyLink []SitePropertyLink

// Content
Goals []string
Spheres []string
JourneyPet []string
HfSkill []HfSkill          {SkillId, TotalIp, MinLevel}
ActiveInteraction string
InteractionKnowledge []string
UsedIdentityIds []int
CurrentIdentityId int
HoldsArtifact []int

// Plus-only
WerebeastSince, VampireSince, NecromancerSince int
```

### 5.3 Entity

```
Name, Race, Type (civilization, sitegovernment, religion, militaryunit, guild, etc.)
Profession, Parent int, Child []int

// Computed
Necromancer bool
Sites []int (all site ids ever associated)
Wars []*HistoricalEventCollection
Leaders []*EntityLeader  {Hf, StartYear, EndYear}

// Plus data
EntityPosition []EntityPosition  {Id, Name, NameMale, NameFemale, Succession, Spouse...}
EntityPositionAssignment []EntityPositionAssignment
Honor []EntityHonor
Occasion []Occasion  {Name, OccasionType, Event int, Schedule []Schedule}

// Members
HistfigId []int
WorshipId []int
Weapons []string

// Links
EntityLink []EntityEntityLink
EntityReputation []EntityReputation
```

### 5.4 Site

```
Name, Type (fortress, hillockDwarf, camp, cavern, tomb, etc.)
Rectangle string ("x1,y1:x2,y2")  // map coords
Owner int (current owning entity)
Ruin bool (computed from events)

Structures map[int]*Structure
SiteProperties map[int]*SiteProperty
```

### 5.5 Structure

```
Name, Type (temple, guildhall, dungeon, tomb, mead_hall, etc.)
SiteId int
Ruin bool
```

### 5.6 HistoricalEvent

```
Id_ int
Year, Seconds72 int
Collection int (parent event collection id, -1 if none)
Details HistoricalEventDetails  // polymorphic interface
```

### 5.7 HistoricalEventCollection

```
Id_ int
Type string (war, battle, beast_attack, abduction, ...)
StartYear, StartSeconds72, EndYear, EndSeconds72 int
Event []int (member event ids)
Eventcol []int (sub-collection ids)
Details HistoricalEventCollectionDetails  // polymorphic
```

### 5.8 Artifact

```
Name, ItemDescription, ItemType, ItemSubtype, Mat string
PageCount int
Writing int (WrittenContent id, -1 if none)
SiteId int (storage location)
StructureLocalId int
HolderHfid int (current holder)
AbsTileX/Y/Z int
```

### 5.9 WrittenContent

```
Name, Form (poem, short_story, musical_composition, etc.)
AuthorHfid int
FormId int (dance/music/poetic form id)
Reference []Reference  {Type, Id}
Style []string
```

### 5.10 Entity Position (plus-mode)

```
Id_, Name_, NameMale, NameFemale string
Succession (election, heir, etc.)
Spouse, Spouse2 string
MaxAge int
```

---

## 6. Search and Filtering

### HF Filtering (both versions)

The HF list page (`/hfs`) supports URL query parameters:
- `leader=1` — only leaders
- `deity=1` — only deities
- `force=1` — only forces
- `vampire=1` — only vampires
- `werebeast=1` — only werebeasts
- `necromancer=1` — only necromancers
- `alive=1` — only living (death_year == -1)
- `ghost=1` — only ghosts (TODO in v2)
- `adventurer=1` — only adventurers
- `race=X` — filter by race

**Sort options:** name, race, birth, death, kills

### Global Search

Substring match (case-insensitive) across all entity types. Both autocomplete (JSON, 50 results) and full results page (categorized).

---

## 7. Visualization

### 7.1 Interactive World Map (Leaflet.js)

**File:** `backend/static/js/map.js`, `backend/templates/worldMap.html`

The world map is the centerpiece visualization:

- Coordinate system: `L.CRS.Simple` (no projection), world coordinates from worldgen params (`DIM:W:H`).
- World map image served as `/map` (PNG) as a `L.imageOverlay` at 50% opacity.
- **Layer groups** (toggled via `L.control.layers`):
  - Sites (colored polygons by owning entity, gray for ruins)
  - World Constructions (squares for point constructions, polylines for roads/bridges/tunnels)
  - Mountain Peaks (triangles)
  - Landmasses (semi-transparent rectangles)
  - Regions (outline polygons, colored by evilness: fuchsia=evil, aqua=good)
  - Evilness (separate fill layer)
- **Tooltips**: every map element has a `bindTooltip` + `bindPopup` calling `urlToolTip(type, id)` which synchronously fetches `/popover/{type}/{id}` HTML.
- **Battle markers**: red diamond polygons on war/battle collection pages.
- **Entity color-coded sites**: sites colored by their owning entity's color from entity type.

Each entity has a `Color()` method and an `Icon()` method (Font Awesome icon class). For example:
- Civilization types get distinct colors.
- Sites with no owner: yellow (`#ff0`).
- Ruins: gray (`#aaa`).

### 7.2 SVG Family Tree (LegendsBrowser v1 only)

**File:** `src/main/resources/templates/hffamily.vm`

A custom SVG-rendered genealogy tree:
- Traverses HF links up to 3 generations up and all generations down.
- Computes x-positions using a tree layout algorithm (`FamilyMember.layout()`, `layoutUp()`, `layoutDown()`).
- Renders nodes as colored `<rect>` elements (blue=male, pink=female, gold=deity, highlighted=self).
- Renders edges as `<polyline>` elements (horizontal for spouse links, L-shaped for parent-child).
- Shows name, relation label (mother/father/son/daughter/grandson/uncle/etc.), birth/death years.
- Horizontal scroll to center on subject via JavaScript `scrollLeft`.

### 7.3 D3 Chord Diagram (LegendsBrowser v1 only)

**File:** `src/main/resources/templates/indexWars.vm`

On the Civilizations index page (Wars tab), a D3.js v3 chord/ribbon diagram shows inter-civilization war relationships. Each civilization is an arc segment; chords connect warring civilizations. Hover highlights related chords.

### 7.4 D3 Population Donut Chart (LegendsBrowser v1 only)

**File:** `src/main/resources/templates/indexPop.vm`

On the Civilizations index page (Population tab), a D3.js v3 donut chart shows world population breakdown by race with count labels.

### 7.5 Hover Popovers

**File:** `backend/templates/layout.html` (JavaScript), `backend/templates/popover*.html`

Every entity hyperlink (`a.hf`, `a.entity`, `a.site`, etc.) triggers a Bootstrap popover on hover. The popover content is fetched synchronously via Ajax from the corresponding `/popover/{type}/{id}` route.

Popover templates show a compact summary:
- HF popover: name, race, sex, birth/death, flags (vampire etc.)
- Site popover: name, type, owner entity
- Entity popover: name, type, race
- etc.

---

## 8. Cross-Linking

Cross-linking is the core value proposition of both tools. The `HistoricalEventDetails` interface in LegendsBrowser2 implements:

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

**Source:** `backend/model/eventList.go`

This enables any entity page to call `world.EventsMatching(func(d) bool { return d.RelatedToHf(id) })` and get all events mentioning that HF. The same applies to every entity type.

**EventList** (`backend/model/eventList.go`): A `NewEventList(world, obj)` factory dispatches on the type of `obj` (Entity, HistoricalFigure, Artifact, Site, Structure, Region, WrittenContent, DanceForm, MusicalForm, PoeticForm, MountainPeak, Identity, or raw event slice).

The `Context` struct (carrying `HfId`) enables **perspective-aware rendering**: when viewing an event from an HF's page, references to that HF render as short names ("the dwarf") rather than full links, and relationships are expressed relationally ("his wife", "her son").

---

## 9. Collection Summarization

### War Summary

A `War` collection (`HistoricalEventCollectionWar`) contains:
- `Name_` — the war's name (e.g., "The Grim Struggle")
- `AggressorEntId`, `DefenderEntId`
- `StartYear`, `EndYear`
- Sub-collections: battles, sieges

On the **Entity page** Wars tab, wars are shown as:
- Date range
- War name (linked)
- Role (attacking/defending) with enemy entity linked

On the **War collection page**:
- Map showing all sites of both entities plus all battle markers
- Expandable list of sub-collections (battles), each with their own events

### Battle Summary

`HistoricalEventCollectionBattle` contains:
- `Name_`, `Outcome`
- `SiteId` (battle location)
- `Coords` (x,y for map marker)
- `AttackingSquadSite[]`, `DefendingSquadSite[]` (origins of squads)
- Member events: FieldBattle, SquadVsSquad, TacticalSituation, HfDied, HfWounded, etc.

### Beast Attack

`HistoricalEventCollectionBeastAttack`:
- Derives `AttackerHfIds` by scanning member events for attacker HF ids
- Text: "the second rampage of [creature] in [site]"

### Abduction

`HistoricalEventCollectionAbduction`:
- Derives `TargetHfids` from member `HfAbducted` events
- Text: "the abduction of [HF1] and [HF2] in [location]"

---

## 10. Performance Optimizations

### LegendsBrowser (Java)
- SAX streaming (no DOM), constant memory regardless of file size
- Separate loading thread so UI stays responsive during load
- `LinkedHashMap` for insertion-order iteration (important for timeline display)
- Reflection config cached per class (`AnnotationConfig`), not per instance

### LegendsBrowser2 (Go)
- Custom tokenizer avoids Go XML parser overhead (attribute maps, namespace handling)
- `bufio.Reader` for buffered I/O
- Generated code (`model/model.go`) avoids runtime reflection entirely
- All data in in-memory maps (`map[int]*T`) — O(1) lookups
- Map image converted to PNG once on load, served from memory (`w.MapData []byte`)
- Event filtering: linear scan over all events (acceptable for typical export sizes); no pre-built indexes
- Progress bar via `pb/v3` library shows bytes-processed progress

---

## 11. UI/UX Patterns

### Bootstrap 5 (LegendsBrowser2)

- Dark mode via `bootstrap-dark.css` (auto-applied on top of Bootstrap 5)
- Font Awesome 6 solid icons for entity type glyphs (crown=leader, skull=necromancer, droplet=vampire, moon=werebeast, hiking=adventurer, hands=deity, etc.)
- Bootstrap Icons for UI chrome
- `navbar-expand-lg` collapsible top navigation
- Bootstrap tabs (`nav-tabs`) for multi-section entity pages (Leaders/Sites/Members/Groups/Wars on entity; Structures/Properties/History on site)
- Bootstrap popovers on hover for inline entity previews
- Bootstrap tables (`table-hover`, `table-sm`, `table-borderless`) for data lists
- Responsive layout (`container`, `row`, `col-*`)

### Tab State Persistence

URL hash (`#nav-leaders`) saves and restores active tab on page load. JavaScript in `layout.html`:
```javascript
var hash = document.location.hash;
if (hash && hash.startsWith("#nav-")) {
    var someTabTriggerEl = document.querySelector('.nav-link[data-bs-target="' + hashPieces[0] + '"]')
    var tab = new bootstrap.Tab(someTabTriggerEl)
    tab.show()
}
```

### JSON Debug Dump

Every entity page ends with `{{ json . }}` — renders the complete Go struct as JSON for debugging. This is extremely useful during development.

### Autocomplete Search

`autocomplete.js` is a custom lightweight autocomplete widget (not a library). It fetches suggestions from `/search?term=` on each input event and navigates directly to the result URL on selection.

### Entity Color Coding

Entities have a `Color()` method (hex string) used consistently for map markers, entity labels, and UI accents. Users can customize race colors in LegendsBrowser v1 via a `jscolor` color picker.

### Icon System

`backend/model/icons.go` maps entity/site/structure/artifact types to Font Awesome CSS class strings. This is used throughout: map markers, list views, entity links.

---

## 12. Exclusive Features by Version

### LegendsBrowser v1 Only

1. **SVG Family Tree** — multi-generation genealogy visualization with layout algorithm, relationship labels, gender/deity color coding, auto-scroll to subject. Handles up to 3 generations up and all generations down.
2. **Curse Lineage Tree** — vampire/werebeast "who bit whom" tree using the same SVG engine but tracing `HfDoesInteraction` events. Traces upward to find Patient Zero.
3. **D3 Population Pie Chart** — donut chart of world population by race on the civilizations index.
4. **D3 War Chord Diagram** — inter-civilization war relationship visualization.
5. **LNP archive support** — supports `legends_archive.zip` from LNP (Lazy Newb Pack).
6. **Customizable race colors** — `jscolor` picker on index page to set per-race map/UI colors.
7. **Relationship Profiles** — displays visual/historical/identity relationship profiles with type label.
8. **Squad links** — current and former squad memberships with squad ID and entity.
9. **Site Property Links** — links from HF page to owned properties in sites.

### LegendsBrowser2 Only

1. **Rivers** — full river entities with detail pages, map rendering (stub in `AddMapRiver`, data present)
2. **Underground regions** — parsed but no dedicated view yet
3. **Event type browser** — `/events` lists all known event types; `/events/{type}` shows all events of that type
4. **Written Content** with linked form references and style list
5. **Identity detail pages** with full event history
6. **Intrigue actors/plots** on HF page
7. **Ruin state tracking** on sites/structures (derived from events during processing)
8. **Season display** in event timestamps ("early spring of 125")
9. **Perspective-aware event rendering** (HfId context)

---

## 13. Processing Pipeline (LegendsBrowser2)

After XML parsing, `world.process()` in `backend/model/process.go` runs post-processing:

1. Assign River IDs (rivers stored as slice, not map)
2. `addRelationshipEvents()` — synthesizes `AddHfHfLink` events from `HistoricalEventRelationships` (plus-mode data not in main event stream)
3. Set `structure.SiteId` for cross-reference
4. `processEvents()`:
   - Mark HFs as Vampire/Werebeast/Necromancer based on interaction events
   - Build entity site lists from site takeover/creation/destruction events
   - Track ruin status of sites and structures
   - Resolve mountain peak IDs from coordinates
   - Fix world construction part relationships
   - Populate HF kill lists from `HfDied` events
5. `processCollections()`:
   - Assign `Collection` id back to each member event
   - Derive collection summary data (attacker HF ids for beast attacks, target HF ids for abductions, traveler HF ids for journeys)
   - Link sub-collections to parent occasion collections
   - Append wars to entity war lists
6. Non-plus mode inference:
   - Race cleanup (strip numeric suffixes)
   - Entity type and parent inference from site events
   - Art form name extraction from description text
   - Entity race inference from leader race
   - Hardcoded position lists for dwarf/elf/human/goblin entities

---

## 14. Template Function Registry (LegendsBrowser2)

`backend/templates/templates.go` (not shown but referenced) registers global template functions. From usage in templates, confirmed functions include:

- `hf id` → HTML anchor for HF
- `entity id` → HTML anchor for entity
- `site id` → HTML anchor for site
- `structure siteId structId` → HTML anchor for structure
- `artifact id` → HTML anchor for artifact
- `region id` → HTML anchor for region
- `collection id` → HTML for collection
- `writtenContent id` → HTML for written content
- `musicalForm id`, `danceForm id`, `poeticForm id` → art form links
- `events obj` → creates EventList for obj
- `history siteId` → site history event list
- `getEntity id` → returns entity struct (for position lookup)
- `getCollection id` → returns collection struct
- `getOccasion civId occasionId` → returns occasion
- `story eventId` → renders event in story mode
- `time year seconds` → formatted time string with season
- `context writtenContent` → creates context for WrittenContent
- `title s` → title-case string
- `andList []string` → "a, b and c" formatting
- `json obj` → JSON marshal for debug
- `capitalize s`, `strip s` → string utilities
- `world` → current DfWorld
- `suburi` → configured sub-URI prefix
- `initMap` → emits Leaflet initialization script
- `addSite id color`, `addRegion id`, `addLandmass id`, `addMountain id color`, `addWorldConstruction id`, `addRiver id`, `addCollection id` → emit map JavaScript

---

## 15. Recommendations for Chronicler

### Must-Have (Feature Parity with LegendsBrowser2)

1. **All 132 event types** rendered as human-readable narrative sentences. The `Html(*Context)` pattern should be adopted: a context object carrying the current-perspective entity ID enables relational pronouns.
2. **Full entity pages** for: HF, Entity, Site, Structure, WorldConstruction, Artifact, WrittenContent, DanceForm, MusicalForm, PoeticForm, Region, Landmass, Mountain, River, Identity.
3. **Event filtering by entity** — every entity page must show all events related to that entity. The `RelatedTo*` interface methods are the authoritative pattern.
4. **Collection hierarchy** — wars contain battles, battles contain events. The nested display is essential for making sense of conflicts.
5. **Hover popovers** — inline previews without navigation are critical UX for exploration.
6. **Tab navigation** on entity pages (Leaders, Sites, Members, Wars, etc.).
7. **Global search** with live autocomplete.

### High-Value Additions (LegendsBrowser v1 Features Not in v2)

1. **SVG Family Tree** — the genealogy visualization is a signature feature users love. The layout algorithm in `HfsController.java` is self-contained and can be ported.
2. **Curse Lineage Tree** — vampire/werebeast lineages are compelling narratives.
3. **D3 Population Chart** — population statistics in visual form.
4. **Squad links** on HF pages.
5. **Relationship profile scores** (hero, murderer, monster, etc.) on HF pages.

### Chronicler-Specific Advantages to Build On

1. **Persistent database** — unlike LegendsBrowser's in-memory parse-on-start, Chronicler's PostgreSQL backend enables: historical diffs across saves, trend analysis, cross-session queries.
2. **Natural language narrative** — Chronicler can leverage LLM generation for richer event sentences rather than just templates.
3. **API-first design** — Chronicler should expose JSON APIs in addition to HTML pages, enabling external tooling.

---

## Sources

1. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/java/legends/LegendsReader.java` — Java SAX parsing entry point
2. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/java/legends/xml/handlers/AnnotationContentHandler.java` — SAX annotation handler
3. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/java/legends/model/World.java` — Java world model (all data collections)
4. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/java/legends/web/HfsController.java` — HF filter/sort + Family Tree algorithm
5. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/resources/templates/hf.vm` — Java HF page template
6. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/resources/templates/hffamily.vm` — SVG family tree template
7. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/resources/templates/indexPop.vm` — D3 population chart
8. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser/src/main/resources/templates/indexWars.vm` — D3 war chord diagram
9. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/util/xml.go` — Go custom tokenizer
10. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/parse.go` — Go parse orchestration
11. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/model.go` — Generated Go world model (1.3MB)
12. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/events.go` — All 132 event Html() implementations
13. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/collections.go` — Collection Html() implementations
14. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/context.go` — Context/linking helper functions
15. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/eventList.go` — EventList factory and RelatedTo interface
16. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/process.go` — Post-parse processing pipeline
17. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/history.go` — World history parser
18. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/map.go` — Map loading and region outline algorithm
19. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/functions.go` — Template helper functions, season/time formatting
20. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/server/server.go` — All route registrations
21. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/server/search.go` — Search implementation
22. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/static/js/map.js` — Leaflet map JavaScript
23. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/templates/layout.html` — Base layout, navbar, popover JS
24. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/templates/hf.html` — HF detail template
25. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/templates/entity.html` — Entity detail template
26. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/templates/site.html` — Site detail template
27. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/templates/collection.html` + `collectionDetail.html` — Collection templates
28. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/data.go` — Hardcoded race position data
29. `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/backend/model/collections.go` — Collection summarization

