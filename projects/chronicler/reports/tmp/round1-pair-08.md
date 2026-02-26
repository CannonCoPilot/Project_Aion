# Consolidation: Event Type Taxonomy & Research Synthesis

**Date**: 2026-02-24
**Consolidation round**: Round 1, Pair 08

---

## Source Documents

- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/event-type-taxonomy.md`: A complete, authoritative cross-referenced taxonomy of all 141 canonical Dwarf Fortress history event types (133 from df-structures + 8 DF 50.x additions), organized into 11 categories with per-type DB presence counts and LegendsBrowser2 handler coverage, including 11 unhandled types and 8 new Steam-era types.
- `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research-synthesis.md`: A broad cross-analysis of 8 deep-research reports covering 12 repositories and 7 web-sourced threads, synthesizing actionable patterns, visualization strategies, data model gaps, live data access architecture, and prioritized action items for the Chronicler application.

---

## Features & Requirements

### Core Application — Chronicler's Unique Position

Chronicler is the first tool in the DF ecosystem that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse → CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel, no prior tool does this)

No existing tool (LegendsViewer-Next, LegendsBrowser, LegendsBrowser2, weblegends, df-narrator, df-ai) covers all five simultaneously.

---

### Feature Area 1: Event Type Coverage

#### Canonical Event Type Count

The authoritative count is **141 total canonical types**:
- 133 from df-structures `history_event_type` enum (excluding `NONE = -1`)
- 8 additional types added in the DF 50.x Steam release (not yet in df-structures enum)

NOTE: The research synthesis document incorrectly reported 144 types; the event-type-taxonomy document corrects this to 133 from df-structures + 8 new = 141 total.

Coverage across tools:
| Source | Event Types | Authoritative? |
|--------|-------------|----------------|
| df-structures `history_event_type` enum | 133 | Yes — memory layout definition, canonical for older DF versions |
| DF 50.x Steam additions (not in enum yet) | 8 | Yes — observed in real DF 50.13 DB |
| **Total canonical** | **141** | **Combined authoritative** |
| LegendsBrowser2 `events.go` | 122 handled | Yes — most complete handler implementation |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Yes — .NET source, production |
| weblegends `events/*.cpp` | 94 files | Yes — C++ source, production |
| Chronicler DB (world 8, "Thadar En") | 97 observed types | Real DF 50.13 legends XML observation |
| df-narrator | Generic (type string) | No — no per-type handling |

#### Chronicler Strategy for Unhandled Types

- Store all event types as-is in a `TEXT` column (no DB enum constraint)
- Raw event data stored in `details` JSONB column
- The agentic storyteller handles all types via LLM interpretation of raw field data — no per-type template required
- This covers the 11 types in df-structures with no LegendsBrowser2 handler, gracefully

#### Recommended Target

Chronicler should target all 141 event types for schema definition, with narrative templates for the 122 types that LegendsBrowser2 handles, and graceful LLM fallback (raw field dump) for the remaining 19.

---

#### Complete Event Type List by Category

##### Category 1: HF Lifecycle (17 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HIST_FIGURE_DIED | hf died | 20,620 | Yes | Death of a historical figure |
| HIST_FIGURE_WOUNDED | hf wounded | 3,263 | Yes | HF takes wounds in combat |
| HIST_FIGURE_ABDUCTED | hf abducted | 3,282 | Yes | HF kidnapped |
| HIST_FIGURE_REVIVED | hf revived | 425 | Yes | Resurrection or undead reanimation |
| HIST_FIGURE_REUNION | hf reunion | 136 | Yes | HF reunited with family/companions |
| HIST_FIGURE_REACH_SUMMIT | — | Not in DB | Yes | HF climbs a mountain peak |
| HIST_FIGURE_TRAVEL | hf travel | 802 | Yes | Long-distance journey |
| HIST_FIGURE_NEW_PET | hf new pet | 319 | Yes | HF acquires a pet |
| HIST_FIGURE_SIMPLE_BATTLE_EVENT | hf simple battle event | 17,238 | Yes | Generic combat action |
| HIST_FIGURE_SIMPLE_ACTION | — | Not in DB | **No** | Generic non-combat action (unhandled) |
| CHANGE_HF_STATE | change hf state | 53,077 | Yes | State transition (settled, wandering, etc.) |
| CHANGE_HF_JOB | change hf job | 49,584 | Yes | Profession change |
| CHANGE_HF_BODY_STATE | change hf body state | 118 | Yes | Physical transformation |
| CHANGE_HF_MOOD | — | Not in DB | **No** | Mood change (strange mood, etc.) — unhandled |
| CHANGE_CREATURE_TYPE | changed creature type | 122 | Yes | Species transformation (curse) |
| HF_GAINS_SECRET_GOAL | hf gains secret goal | 424 | Yes | Acquires a secret motivation |
| HF_RELATIONSHIP_DENIED | hf relationship denied | 2,742 | Yes | Relationship attempt rejected |

##### Category 2: HF Relationships & Links (10 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ADD_HF_HF_LINK | add hf hf link | 19,061 | Yes | New relationship between HFs |
| REMOVE_HF_HF_LINK | remove hf hf link | 7,108 | Yes | Relationship ended |
| ADD_HF_ENTITY_LINK | add hf entity link | 33,880 | Yes | HF joins entity |
| REMOVE_HF_ENTITY_LINK | remove hf entity link | 1,568 | Yes | HF leaves entity |
| ADD_HF_SITE_LINK | add hf site link | 4,208 | Yes | HF associated with site |
| REMOVE_HF_SITE_LINK | remove hf site link | 841 | Yes | HF leaves site |
| ADD_HF_ENTITY_HONOR | add hf entity honor | 16 | Yes | Honor/award granted |
| ASSUME_IDENTITY | assume identity | 1,878 | Yes | HF takes false identity |
| HFS_FORMED_REPUTATION_RELATIONSHIP | hfs formed reputation relationship | 3,579 | Yes | Reputation link formed |
| HFS_FORMED_INTRIGUE_RELATIONSHIP | hfs formed intrigue relationship | 448 | Yes | Intrigue link formed |

##### Category 3: HF Actions (14 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HF_ATTACKED_SITE | hf attacked site | 168 | Yes | HF leads attack on a site |
| HF_DESTROYED_SITE | hf destroyed site | 123 | Yes | HF destroys a site |
| HF_CONFRONTED | hf confronted | 127 | Yes | HF confrontation (challenge) |
| HF_DOES_INTERACTION | hf does interaction | 52 | Yes | Supernatural interaction |
| HF_LEARNS_SECRET | hf learns secret | 181 | Yes | Learns necromancy/vampirism |
| HF_PREACH | hf preach | 449 | Yes | Religious preaching |
| HF_FREED | — | Not in DB | Yes | HF freed from captivity |
| HF_RANSOMED | hf ransomed | 1 | Yes | HF ransomed |
| HF_ENSLAVED | — | Not in DB | Yes | HF enslaved |
| HF_ACT_ON_BUILDING | — | Not in DB | **No** | HF acts on a building — unhandled |
| HF_ACT_ON_ARTIFACT | — | Not in DB | **No** | HF acts on an artifact — unhandled |
| HF_RAZED_BUILDING | — | Not in DB | **No** | HF razes a building — unhandled |
| HF_RECRUITED_UNIT_TYPE_FOR_ENTITY | hf recruited unit type for entity | 3,441 | Yes | Military recruitment |
| SNEAK_INTO_SITE | — | Not in DB | Yes | Covert infiltration |

##### Category 4: HF Intrigue (6 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HF_CONVICTED | hf convicted | 854 | Yes | Criminal conviction |
| HF_INTERROGATED | hf interrogated | 40 | Yes | Interrogation |
| FAILED_INTRIGUE_CORRUPTION | failed intrigue corruption | 1,245 | Yes | Corruption attempt failed |
| FAILED_FRAME_ATTEMPT | failed frame attempt | 24 | Yes | Framing attempt failed |
| SABOTAGE | — | Not in DB | Yes | Sabotage action |
| SPOTTED_LEAVING_SITE | — | Not in DB | Yes | Caught leaving a site |

##### Category 5: Artifacts (13 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ARTIFACT_CREATED | artifact created | 5,773 | Yes | Artifact forged/crafted |
| ARTIFACT_DESTROYED | — | Not in DB | Yes | Artifact destroyed |
| ARTIFACT_LOST | artifact lost | 435 | Yes | Artifact whereabouts unknown |
| ARTIFACT_FOUND | artifact found | 22 | Yes | Lost artifact rediscovered |
| ARTIFACT_RECOVERED | artifact recovered | 16 | Yes | Artifact retrieved |
| ARTIFACT_POSSESSED | artifact possessed | 67 | Yes | Artifact claimed by HF |
| ARTIFACT_GIVEN | artifact given | 299 | Yes | Artifact transferred |
| ARTIFACT_STORED | artifact stored | 4,721 | Yes | Artifact placed in storage |
| ARTIFACT_TRANSFORMED | — | Not in DB | Yes | Artifact altered |
| ARTIFACT_COPIED | artifact copied | 287 | Yes | Written artifact copied |
| ARTIFACT_CLAIM_FORMED | artifact claim formed | 732 | Yes | Ownership claim |
| ARTIFACT_HIDDEN | — | Not in DB | **No** | Artifact hidden — unhandled |
| ARTIFACT_DROPPED | — | Not in DB | **No** | Artifact dropped — unhandled |

##### Category 6: Sites & Construction (11 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| CREATED_SITE | created site | 1,126 | Yes | New site established |
| WAR_DESTROYED_SITE | destroyed site | 10 | Yes | Site destroyed in war |
| RECLAIM_SITE | reclaim site | 46 | Yes | Abandoned site reclaimed |
| SITE_DIED | — | Not in DB | Yes | Site population died off |
| SITE_RETIRED | — | Not in DB | Yes | Player retired a fortress |
| CREATED_BUILDING | created structure | 1,401 | Yes | Building constructed |
| REPLACED_BUILDING | replaced structure | 6 | Yes | Building replaced |
| ENTITY_RAZED_BUILDING | razed structure | 35 | Yes | Building torn down |
| CREATED_WORLD_CONSTRUCTION | created world construction | 203 | Yes | Road/bridge/tunnel |
| MODIFIED_BUILDING | modified building | 12 | Yes | Building altered |
| BUILDING_PROFILE_ACQUIRED | building profile acquired | 256 | Yes | Building gains profile |

##### Category 7: Entities (14+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| ENTITY_CREATED | entity created | 1,112 | Yes | New organization formed |
| ENTITY_ACTION | — | Not in DB | **No** | Generic entity action — unhandled |
| ENTITY_INCORPORATED | entity incorporated | 313 | Yes | Entity absorbed into another |
| ENTITY_DISSOLVED | entity dissolved | 4 | Yes | Entity disbanded |
| ENTITY_LAW | entity law | 8 | Yes | Law enacted |
| ENTITY_PERSECUTED | entity persecuted | 375 | Yes | Religious/political persecution |
| ENTITY_OVERTHROWN | entity overthrown | 10 | Yes | Government overthrown |
| ENTITY_ALLIANCE_FORMED | entity alliance formed | 9 | Yes | Alliance between entities |
| ENTITY_EQUIPMENT_PURCHASE | entity equipment purchase | 3 | Yes | Military equipment purchase |
| ENTITY_BREACH_FEATURE_LAYER | entity breach feature layer | 1 | Yes | Underground breach |
| ENTITY_SEARCHED_SITE | — | Not in DB | Yes | Entity searches a site |
| ENTITY_RAMPAGED_IN_SITE | — | Not in DB | Yes | Entity rampages at site |
| ENTITY_FLED_SITE | — | Not in DB | Yes | Entity flees a site |
| ENTITY_EXPELS_HF | — | Not in DB | Yes | Entity expels member |
| REGIONPOP_INCORPORATED_INTO_ENTITY | regionpop incorporated into entity | 42 | Yes | Population joins entity |
| CREATE_ENTITY_POSITION | create entity position | 1,145 | Yes | New position title |
| ADD_ENTITY_SITE_PROFILE_FLAG | — | Not in DB | **No** | Site profile flag set — unhandled |

##### Category 8: War & Combat (8+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| WAR_ATTACKED_SITE | attacked site | 346 | Yes | Siege or attack on site |
| WAR_FIELD_BATTLE | field battle | 102 | Yes | Open-field battle |
| WAR_PLUNDERED_SITE | plundered site | 98 | Yes | Site looted after capture |
| WAR_SITE_NEW_LEADER | new site leader | 74 | Yes | Leadership changed after battle |
| WAR_SITE_TAKEN_OVER | site taken over | 69 | Yes | Site conquered |
| WAR_SITE_TRIBUTE_FORCED | site tribute forced | 1 | Yes | Tribute imposed |
| TACTICAL_SITUATION | — | Not in DB | Yes | Tactical military event |
| SQUAD_VS_SQUAD | — | Not in DB | Yes | Squad combat |
| SITE_SURRENDERED | — | Not in DB | Yes | Site capitulation |
| BODY_ABUSED | body abused | 258 | Yes | Corpse desecration |
| CREATURE_DEVOURED | creature devoured | 5,412 | Yes | Entity eaten |
| ITEM_STOLEN | item stolen | 3,256 | Yes | Theft |
| INSURRECTION_STARTED | — | Not in DB | Yes | Uprising begins |
| INSURRECTION_ENDED | — | Not in DB | **No** | Uprising ends — unhandled |

##### Category 9: Diplomacy (9+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| FIRST_CONTACT | — | Not in DB | Yes | First meeting between civilizations |
| FIRST_CONTACT_FAILED | — | Not in DB | Yes | Failed contact attempt |
| WAR_PEACE_ACCEPTED | peace accepted | 53 | Yes | Peace treaty signed |
| WAR_PEACE_REJECTED | peace rejected | 6 | Yes | Peace offer rejected |
| TOPICAGREEMENT_CONCLUDED | — | Not in DB | Yes | Agreement concluded |
| TOPICAGREEMENT_REJECTED | — | Not in DB | Yes | Agreement rejected |
| TOPICAGREEMENT_MADE | — | Not in DB | Yes | Agreement proposed |
| DIPLOMAT_LOST | — | Not in DB | Yes | Diplomat killed/missing |
| AGREEMENTS_VOIDED | — | Not in DB | **No** | Agreements cancelled — unhandled |
| AGREEMENT_FORMED | agreement formed | 2,379 | Yes | Formal agreement |
| AGREEMENT_CONCLUDED | — | Not in DB | Yes | Agreement completed |
| SITE_DISPUTE | site dispute | 231 | Yes | Territorial dispute |
| TRADE | trade | 737 | Yes | Trade event |
| MERCHANT | — | Not in DB | Yes | Merchant caravan |

##### Category 10: Culture & Art (8+ types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| POETIC_FORM_CREATED | poetic form created | 49 | Yes | New poetic form invented |
| MUSICAL_FORM_CREATED | musical form created | 73 | Yes | New musical form |
| DANCE_FORM_CREATED | dance form created | 25 | Yes | New dance form |
| WRITTEN_CONTENT_COMPOSED | written content composed | 26,819 | Yes | Written work created |
| KNOWLEDGE_DISCOVERED | knowledge discovered | 2,790 | Yes | Knowledge/technology advance |
| PERFORMANCE | performance | 6,929 | Yes | Public performance |
| COMPETITION | competition | 4,404 | Yes | Competitive event |
| PROCESSION | procession | 2,305 | Yes | Formal procession |
| CEREMONY | ceremony | 3,591 | Yes | Religious ceremony |
| GAMBLE | gamble | 1,682 | Yes | Gambling event |

##### Category 11: Masterpieces (7 types — all NOT in DB, all in LB2)

| df-structures Name | Description |
|---|---|
| MASTERPIECE_CREATED_ARCH_CONSTRUCT | Masterwork construction |
| MASTERPIECE_CREATED_ITEM | Masterwork item |
| MASTERPIECE_CREATED_DYE_ITEM | Masterwork dyed item |
| MASTERPIECE_CREATED_ITEM_IMPROVEMENT | Masterwork improvement |
| MASTERPIECE_CREATED_FOOD | Masterwork meal |
| MASTERPIECE_CREATED_ENGRAVING | Masterwork engraving |
| MASTERPIECE_LOST | Masterwork destroyed/lost |

---

#### DF 50.x Steam-Era Event Types (8 types — Not in df-structures enum)

These appear in Chronicler's database (world 8, DF 50.13) but are not in the df-structures `history_event_type` enum. They were added in the Steam release.

| DB Name | Count (World 8) | Likely Purpose |
|---|---|---|
| hf prayed inside structure | 388 | HF prayer at temple/shrine |
| hf equipment purchase | 523 | HF buys equipment (individual, vs entity-level purchase) |
| hf performed horrible experiments | 43 | Necromancer experiments |
| hf profaned structure | 41 | HF desecrates a building |
| entity relocate | 55 | Entity moves to new site |
| entity primary criminals | 47 | Entity designates criminals |
| holy city declaration | 9 | City declared holy |
| hf viewed artifact | 56 | HF examines an artifact |

---

#### 11 Types in df-structures with No LegendsBrowser2 Handler

These exist in the `history_event_type` enum but LegendsBrowser2 has no `Html()` handler. Chronicler relies on LLM fallback for these:

1. AGREEMENTS_VOIDED — Diplomatic agreements cancelled
2. ARTIFACT_DROPPED — Artifact discarded
3. ARTIFACT_HIDDEN — Artifact hidden from view
4. CHANGE_HF_MOOD — HF mood change (strange mood onset)
5. ENTITY_ACTION — Generic entity action
6. HF_ACT_ON_ARTIFACT — HF manipulates an artifact
7. HF_ACT_ON_BUILDING — HF acts on a building
8. HF_RAZED_BUILDING — HF personally destroys a building
9. HIST_FIGURE_SIMPLE_ACTION — Generic HF non-combat action
10. INSURRECTION_ENDED — Uprising resolved
11. ADD_ENTITY_SITE_PROFILE_FLAG — Site profile flag added

---

### Feature Area 2: Data Model / CDM

#### Core Entity Types — Coverage

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | df-structures | Chronicler CDM |
|---|---|---|---|---|---|---|
| Historical Figures | Full | Full | Full | Scored subset | Full (canonical) | Full |
| Sites | Full | Full | Full | Scored subset | Full | Full |
| Entities (Civs) | Full | Full | Full | Name only | Full | Full |
| Artifacts | Full | Full | Full | Scored subset | Full | Full |
| Regions | Full | Full | Full | No | Full | Full |
| Underground Regions | Full | Full | Full | No | Full | Partial |
| Structures | Full | Full | Full | No | Full | Full |
| World Constructions | Full | Full | Partial | No | Full | **Missing** |
| Written Content | Full | Full | Partial | No | Full | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | Full | **Missing** |
| Identities | Full | Full | No | No | Full | **Missing** |
| Landmasses | Full | Full | No | No | Full | Partial |
| Mountain Peaks | Full | Full | No | No | Full | Partial |
| Rivers | Full | Stub | No | No | Full | **Missing** |
| Entity Populations | Full | Stub | Partial | No | Full | Partial |
| Event Collections | Full | Full | Full | Partial | Full | Partial |

#### Historical Figure (HF) CDM — Completeness Audit

Already in Chronicler CDM: `id`, `name`, `race`, `caste`, `sex`, `birth_year`, `death_year`, `profession`, `associated_type`, `civ_id`, `unit_id`

Missing — High Priority:
- `deity`, `force`, `ghost` flags (from `histfig_flags`)
- `active_interactions` (vampire/necromancer/werebeast detection)
- `spheres` (deity domains)
- `goals` (life goals)
- `skills` with XP points (from `info.skills`)
- `entity_links` with link type and position details
- `histfig_links` (family: mother/father/child/spouse)
- `site_links` (lair, home, seat_of_power)
- `kills` (notable and other kill records)
- `whereabouts` / `current_state` (geographic location)
- `vague_relationships` and `relationship_profiles`
- `entity_reputations` (murderer, hero, monster, etc.)
- `intrigue_actors` / `intrigue_plots` (v0.47+ intrigue system)
- `used_identities` / `current_identity` (false identity tracking)
- `journey_pets`
- `holds_artifact` (currently held artifacts)
- `breed_id`, `cultural_identity`, `family_head_id`

Missing — Medium Priority:
- `orientation_flags`
- `curse_year` / `curse_seconds`
- `personality` (values, ethics, mannerisms — 70+ mannerism types, value types, ethic types)
- `knowledge_profile` (known secrets, known books, belief systems)
- `reputation_profile` (wanted status, journey profile)

Missing — Required New CDM Entity Types:
- `WorldConstructions` table (roads, bridges, tunnels)
- `ArtForms` tables × 3 (poetic, musical, dance)
- `Identities` table (false identities assumed by HFs)
- `Rivers` table
- Full `Entity Populations` extension

#### Importance Scoring — Addition to CDM

Add `importance_score` columns to: `historical_figures`, `sites`, `artifacts`, `conflicts` (from df-narrator formulas).

Compute on XML ingestion. Use for LLM context selection (top-N entities by score for world summary generation).

Scoring formulas (from df-narrator, directly usable):

**Figure Importance Score**:
```
events × 2 (cap 500) + kills × 15 + vampire(80) + necromancer(100) + deity(120) +
force(90) + megabeast(70) + HF_links × 3 (cap 100) + leadership_positions × 20 +
artifacts_held × 30 + spheres × 10 + skills_bonus (cap 80) + site_links × 5 (cap 50) +
entity_links × 3 (cap 60) + death_recorded(5)
```

**Site Importance Score**:
```
events + deaths × 2 + event_collections × 5 + structures × 3
```

**Conflict Importance Score**:
```
deaths × 3 + battles × 10 + sites_involved × 5 + duration_years
```

**Artifact Importance Score**:
```
events × 10 + unique_holders × 20 + lost_or_stolen(30) + named(50)
```

#### Reference Taxonomies

**Site Types** (24 distinct, union of all sources):
Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress, Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery, Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace, Ruins, Shrine, Tomb, Tower, Town, Vault

**Entity Types** (from weblegends + LB2):
Civilization, Site Government, Nomadic Group, Migrating Group, Religion, Military Unit (mercenary/shadowy/versatile), Guild, Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang, Outcast, Semi-Megabeast, Mega-Beast, Unknown

**HF Relationship Types** (comprehensive, from df-structures):
- HF-to-HF: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner
- HF-to-Entity: Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position, Former Position, Position Claim, Occupation, Former Occupation, Squad, Former Squad
- HF-to-Site: Lair, Home Site (abstract/realization building), Seat of Power, Hangout, Occupation, Prison

**HF XML Event Fields That Reference HF IDs** (canonical list from df-narrator):
```
hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid,
changee_hfid, changer_hfid, woundee_hfid, wounder_hfid,
doer_hfid, target_hfid, attacker_hfid, defender_hfid,
hist_fig_id, body_hfid, hfid_target, hfid_attacker,
hfid_defender, trickster_hfid, cover_hfid, student_hfid,
teacher_hfid, trainer_hfid, seeker_hfid
```

---

### Feature Area 3: Narrative Engine

#### Event Rendering Pipeline (adopted from all successful tools)

Standard pattern:
```
Event (typed struct) → Context (current entity perspective) → Template (per-type prose) → HTML (with entity links)
```

Chronicler with LLM:
```
Event (CDM row) → Context (target entity + related entities) → LLM prompt (with event type template) → Narrative (with entity references marked for linking)
```

#### Perspective-Aware Rendering (LegendsBrowser2 gold standard)

When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or relational pronouns ("his wife"), while other entities remain fully linked. weblegends implements the same via `event_link()` (suppresses link for context entity). LegendsViewer-Next does NOT do this.

Requirement: Implement perspective-aware narrative generation. Pass entity ID as context to LLM so narrative uses appropriate pronouns and suppresses redundant self-references.

#### Death Cause Rendering (40+ variants, from weblegends)

Complete death cause taxonomy with specific prose per cause:
```
OLD_AGE → "died of old age"
SHOT → "was shot and killed"
BLEED → "bled to death"
DROWN → "drowned"
SUFFOCATE → "suffocated"
MAGMA → "was consumed by magma"
DRAGONFIRE → "was killed by dragonfire"
CAVEIN → "was crushed in a cave-in"
DRAWBRIDGE → "was smashed by a drawbridge"
BEHEAD → "was beheaded"
CRUCIFY → "was crucified"
BURN_ALIVE → "was burned to a crisp"
HACK_TO_PIECES → "was hacked to pieces"
DRAIN_BLOOD → "was drained of blood"
LEAPT_FROM_HEIGHT → "leapt from a great height"
INFECTION → "succumbed to infection"
... (25+ more variants)
```

Each death also includes: weapon info, slayer identity with race, and age at death (with fractional year display).

Requirement: Implement full 40+ death cause taxonomy in Chronicler's narrative engine. Highest-value narrative enrichment feature.

#### Cross-Linking Infrastructure

Every successful legends browser makes cross-linking the central UX. All entity references in event narrative text must become navigable links.

| Aspect | LV-Next | LB2 | weblegends |
|---|---|---|---|
| Link format | HTML `<a>` generated server-side | HTML `<a>` via Go template functions | HTML `<a>` via C++ `link()` function |
| Context awareness | No | Yes (`HfId` context → relational pronouns) | Yes (`event_context` → suppress self-links) |
| Rendering | `v-html` injection | Go template `{{ hf .Id }}` | `ostream << link(s, entity)` |
| Hover preview | No | Yes (Bootstrap popover via Ajax) | No |

#### DF Calendar Utility (shared across all narrative/display code)

Formula (all tools use the same approach):
```python
# seconds72 → calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

# Month names
months = ["Granite", "Slate", "Felsite",      # Spring
          "Hematite", "Malachite", "Galena",   # Summer
          "Limestone", "Sandstone", "Timber",  # Autumn
          "Moonstone", "Opal", "Obsidian"]     # Winter

# Season
season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```

Requirement: Implement once in a shared utility, use consistently everywhere.

---

### Feature Area 4: Visualization

Chronicler currently has NO visualization. Every existing legends browser provides at least map and chart visualization.

| Visualization | LV-Next | LB1 | LB2 | weblegends | Priority for Chronicler |
|---|---|---|---|---|---|
| Interactive world map (Leaflet) | Yes | No | Yes | Static PNG | **P1** — centerpiece feature |
| Site markers (type-coded shapes) | Yes | Yes | Yes | No | **P1** |
| Civilization color coding | Yes (HSV) | Yes (jscolor) | Yes | No | **P1** |
| Family tree (graph viz) | Yes (Cytoscape dagre) | Yes (SVG custom) | No | No | **P2** |
| Curse lineage tree | No | Yes (SVG) | No | No | **P3** |
| Warfare graph (force-directed) | Yes (Cytoscape cola) | No | No | No | **P2** |
| War chord diagram | No | Yes (D3) | No | No | **P3** |
| Event timeline (line chart) | Yes (Chart.js) | No | No | No | **P2** |
| Population pie/doughnut | Yes (Chart.js) | Yes (D3) | No | No | **P2** |
| Event type breakdown (bar) | Yes (Chart.js) | No | No | No | **P3** |
| Per-object mini-map | Yes | No | No | Yes | **P2** |
| Hover popovers | No | Yes (Bootstrap) | Yes (Bootstrap) | No | **P2** |

#### Map Implementation Consensus (all implementations use same approach)

- Coordinate system: `L.CRS.Simple` (no geographic projection)
- Y-axis: Inverted from DF coordinates (`map_height - y`)
- Scale: 4-10 pixels per world tile
- Site markers: Colored polygons/shapes coded by site type and owning civilization
- Layer control: Toggle site layers by civilization/type
- Chronicler advantage: PostgreSQL + PostGIS (if extended) enables spatial queries no in-memory tool can match

---

### Feature Area 5: Explorer / Search UI

Required features (none currently built):
- `chronicler explore` CLI command for browsing
- Global search with autocomplete (LB2 pattern)
- Per-entity pages (HF, Site, Entity, Artifact, etc.) with cross-linked event lists
- Hover popovers for entity preview (Bootstrap + Ajax pattern from LB2)
- Pagination for large entity lists
- Filter/sort by event type, date range, entity

---

### Feature Area 6: Live Data Bridge

#### Current Transport Architecture

TCP RPC is broken for game-thread calls on DFHack 53.x running under Prism (ARM Windows VM). Only cached calls (GetVersion, GetWorldInfo) work — all other calls hang waiting for CoreSuspender. This is a thread scheduling issue where the TCP server's network thread cannot acquire the Core lock.

Working transports:
1. `dfhack-run` over SSH — executes Lua commands directly on the DFHack Core thread, bypassing TCP. Verified access to all data domains.
2. `chronicler-bridge.lua` — HTTP-served JSON for bulk data (runs within DFHack's process, unaffected by TCP issue)

Verified live data access via `dfhack-run` SSH (world 8 "Thadar En"):
- `df.global.world.history.figures` — 48,366 HFs
- `df.global.world.history.events` — 442,716 events
- `df.global.world.entities.all` — 4,901 entities
- `df.global.world.artifacts.all` — 8,035 artifacts
- `df.global.world.world_data.sites` — 2,154 sites

#### Bridge Architecture Validation

Three independent codebases (df-ai, myDFHackScripts, weblegends) use the same fundamental patterns, confirming Chronicler's approach:

| Pattern | df-ai (C++) | myDFHackScripts (Lua) | Chronicler bridge (Lua) |
|---|---|---|---|
| Tick-based polling | `OnupdateCallback` | `dfhack.timeout(500, 'ticks')` | `repeat --time 500 --timeUnits ticks` |
| Event subscription | N/A (C++ hooks) | `eventful.onUnitDeath[modId]` | Not yet (polling only) |
| Change detection | Set comparison (citizen IDs) | `Helper.watch()` factory | Snapshot comparison |
| Data access | `df::world->units.active` | `df.global.world.units.active` | `df.global.world.units.active` |
| Death cause lookup | Direct memory | `df.global.world.incidents.all` | Not yet |

#### Bridge Enhancement Requirements

1. Add `eventful` subscriptions for reactive event capture (currently polling-only):
   - `UNIT_DEATH`
   - `ITEM_CREATED`
   - `JOB_COMPLETED`
   - `UNIT_NEW_ACTIVE`
   - `SYNDROME`
2. Death cause enrichment — use `df.global.world.incidents.all` pattern from myDFHackScripts to get death cause enum + killer ID
3. Parent/family chain — `unit.relationship_ids.Mother/Father` for family tree data from live units
4. Book detection — `dfhack.items.getBookTitle(item)` for written work events
5. Incident system — full incident lookup for crime/death narrative

#### Polling + Events Hybrid Pattern (proven from myDFHackScripts)

Use `eventful` subscriptions for real-time events (deaths, item creation) AND polling via `dfhack.timeout` for state changes (citizen count, reports, petitions). Catches both immediate events and gradual state transitions.

---

### Feature Area 7: Worldgen Monitoring

Novel capability — no existing tool monitors worldgen in real time.

Available data in `world_generatorst` struct at `df.global.world.worldgen_status`:
- 12-state generation phase enum (None through Done)
- Progress counters (rivers, civs, rampages)
- Phase completion flags (caves placed, megabeasts placed, etc.)
- Event cursor (`last_event_id_added`)
- Live access to `world.history.figures/events/eras` as they populate

Implementation: A `worldgen-bridge.lua` script using the existing `repeat` job pattern, polling every 30 frames (~0.5s), writing JSON snapshots.

CDM addition: `worldgen_snapshots` table.

Chronicler value: First-ever real-time worldgen dashboard. Shows:
- Civilization count rising
- Event accumulation curves
- Era transitions
- Phase progression as world generates

---

### Feature Area 8: Post-Parse Processing Pipeline

Every legends browser runs a post-parse cross-referencing pass (LV-Next: 12 resolve steps, LB2: 6 process steps). Chronicler requires the same after XML ingestion:

1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores

---

### Feature Area 9: LLM Advisor (AI DF Player)

Exclusive action queue architecture (from df-ai):
- Maintain one active action chain
- Queue pending actions
- Report completion/failure before starting next

Stock threshold model from df-ai provides reference heuristics for LLM advisor context.

---

### Feature Area 10: Mod Awareness (Deferred)

The only potentially relevant feature is recording which mods were active when a world was generated, capturable during worldgen monitoring. Full mod management (raw file parsing, conflict detection, profile management) is deferred and out of scope for Chronicler core.

---

## Implementation Details

### Database

- **DB**: PostgreSQL `chronicler` on localhost:5432
- **Current scale**: 1.65M records (world "Namoram" CDM)
- **World 8 ("Thadar En")**: 312,254 events, 97 observed event types, 48,366 HFs, 442,716 total events (from live data), 8,035 artifacts, 4,901 entities, 2,154 sites
- **Event type storage**: TEXT column (no DB enum), `details` JSONB column for raw fields
- **Schema extensions needed**: HF missing fields (high + medium priority), WorldConstructions table, ArtForms × 3, Identities, Rivers, worldgen_snapshots, importance_score columns

### CDM / XML Ingestion

- XML legends ingestion: Built (CDM schema)
- XML+ merge (legends_plus): Built; need audit vs LV-Next merge rules
- 131-test suite: Built; need event type coverage tests added

### Bridge / Transport

- Live polling bridge: Built (7 data domains)
- `dfhack-run` SSH transport: Verified for all data domains
- File transfer methods: HTTP file server on port 8889 (~105 MB/s), SCP via `vm-lifecycle.sh scp-pull` (~19 MB/s)
- VM: UTM Win11 ARM (`DF-Windows` / `192.168.64.3`), DF 53.10 + DFHack 53.10-r1

### CLI

- `chronicler watch` command: Built
- `chronicler explore` command: Not yet built

---

## Status & Completion

### Built / Verified

| Component | Status |
|---|---|
| XML legends ingestion (CDM schema) | Built |
| XML+ merge (legends_plus) | Built |
| Live polling bridge (7 data domains) | Built |
| `dfhack-run` SSH transport | Verified |
| Change detection (snapshot comparison) | Built |
| PostgreSQL persistence (1.65M records) | Built |
| 131-test suite | Built |
| `chronicler watch` CLI | Built |
| Narrative enrichment (partial storyteller) | Partial |

### Not Started / Gap

| Component | Priority |
|---|---|
| All 141 event types in CDM taxonomy | P1 |
| HF CDM missing high-priority fields | P1 |
| Importance scoring columns + compute | P1 |
| Death cause narrative rendering (40+) | P1 |
| Perspective-aware event narrative | P1 |
| Cross-linking infrastructure | P1 |
| DF calendar utility | P1 |
| Event type coverage tests | P1 |
| Interactive world map (Leaflet.js) | P1 |
| `chronicler explore` command | P1 |
| Family tree visualization (Cytoscape.js dagre) | P2 |
| Event timeline charts (Chart.js) | P2 |
| Population distribution charts | P2 |
| Hover popovers | P2 |
| Global search with autocomplete | P2 |
| Per-object mini-map | P2 |
| Missing CDM entity types (WorldConstructions, ArtForms × 3, Identities, Rivers) | P2 |
| `eventful` subscriptions (UNIT_DEATH, etc.) | P2 |
| Death cause via `df.global.world.incidents.all` | P2 |
| Parent/family chain extraction | P2 |
| Book/written work detection | P2 |
| `worldgen-bridge.lua` | P2 |
| `worldgen_snapshots` CDM table | P2 |
| Curse lineage tree | P3 |
| Warfare graph (Cytoscape.js cola) | P3 |
| War chord diagram (D3.js) | P3 |
| Event type breakdown bar chart | P3 |
| Mod awareness (active mods per world) | Deferred |
| df-ai stock advisor integration | Deferred |
| Raw mod file parser / conflict detection | Deferred |

---

## Key Decisions & Design Choices

### Event Type Storage Strategy

Decision: Store event type as TEXT, raw data in JSONB `details` column. No DB-level enum constraint.

Rationale: DF adds new event types with each release (8 DF 50.x types are not even in df-structures yet). A DB enum would break on import of any unknown type. TEXT + JSONB allows the LLM to interpret any type gracefully using raw field data, without requiring a per-type template.

### Narrative Engine: LLM Over Templates

Decision: Use LLM for all event narrative generation, not pre-built templates per type.

Rationale: 141 event types × multiple contexts = impractical template surface area. LLM reads raw `details` JSONB and generates perspective-aware narrative. Per-type templates still valuable as LLM prompts but not required as standalone renderers.

### Event Type Count Correction

The research-synthesis.md reported 144 types from df-structures. The event-type-taxonomy.md (dated same day, 2026-02-23) corrects this: the actual `history_event_type` enum has 133 entries (excluding `NONE = -1`). The total canonical count is **141** (133 + 8 DF 50.x additions). All downstream tooling and planning should use 141, not 144.

### Transport: dfhack-run SSH Over TCP RPC

Decision: Use `dfhack-run` over SSH as primary live-data transport. TCP RPC abandoned for game-thread calls.

Rationale: TCP RPC is broken for game-thread calls on DFHack 53.x under Prism (ARM Windows VM). CoreSuspender cannot be acquired from the network thread. `dfhack-run` SSH executes Lua commands directly on the DFHack Core thread, bypassing this issue entirely. Verified access to all needed data domains.

### Visualization Stack

Decision (recommended): Leaflet.js for world map, Cytoscape.js (dagre layout) for family tree, Cytoscape.js (cola layout) for warfare graph, Chart.js for timelines/distribution, D3.js for chord diagrams.

Rationale: These are the consensus implementations across all existing successful tools.

### Perspective-Aware Narrative (LB2 Gold Standard)

Decision: Implement LB2-style perspective-aware narrative where viewing an entity's own page causes events involving that entity to render with pronouns/relational references rather than self-links.

Rationale: LegendsBrowser2 is identified as the gold standard for this UX. LegendsViewer-Next omits it. weblegends implements the same pattern. It is essential for readable narrative in entity-centric views.

### Worldgen Monitoring

Decision: Build `worldgen-bridge.lua` for first-ever real-time worldgen dashboard.

Rationale: Novel capability (no existing tool does this), confirmed accessible via `df.global.world.worldgen_status`, already have a complete implementation template from research.

### Mod Management — Deferred

Decision: Defer full mod management. Only capture active mods list during worldgen monitoring.

Rationale: Mod management (raw parsing, conflict detection, profile management) is entirely outside Chronicler's core scope as a legends/history/live-fortress tool.

### Post-Parse Processing

Decision: Run a 7-step post-parse cross-referencing pass after every XML ingestion.

Rationale: All successful legends browsers do this (LV-Next: 12 steps, LB2: 6 steps). Without it, relational data (family links, flags, scores, kill lists) is incomplete. Failure to cross-reference is the primary source of data quality issues in simpler tools.

### Importance Scoring

Decision: Add `importance_score` to HF, site, artifact, and conflict CDM tables. Compute using df-narrator's formulas on ingestion.

Rationale: LLM context windows are finite. When generating world summaries or story narratives, the system needs a principled way to select which entities to include. df-narrator's scoring formulas are well-calibrated from empirical DF data.

---

## Metrics & Targets

### World 8 ("Thadar En") Summary Statistics

- Total events: 312,254 (legends XML observed)
- Total events (live data via dfhack-run): 442,716
- Distinct event types observed in DB: 97 of 141 canonical
- Historical figures (live): 48,366
- Entities (live): 4,901
- Artifacts (live): 8,035
- Sites (live): 2,154

### Event Frequency Reference (World 8)

Most common event types:
- change hf state: 53,077
- change hf job: 49,584
- add hf entity link: 33,880
- written content composed: 26,819
- hf died: 20,620
- add hf hf link: 19,061
- hf simple battle event: 17,238

Rarest observed:
- site tribute forced: 1
- hf ransomed: 1
- entity breach feature layer: 1

### Test Suite

- Current: 131 tests built
- Target: Add event type coverage tests for all 141 canonical types

### Narrative Engine Targets

- Death cause rendering: 40+ distinct cause variants
- Perspective-aware generation: Required for all entity-centric views
- Cross-linking: All entity references in narrative must be navigable

### Event Type Coverage Target

- Chronicler CDM: 141 canonical types (133 df-structures + 8 DF 50.x)
- LLM narrative templates: 122 types (all LB2-handled types)
- Graceful LLM fallback: 19 remaining types (11 unhandled df-structures + 8 DF 50.x)

---

## Appendix: Prioritized Action Item List

### Tier 1 — Critical (blocks narrative engine and explorer)

| # | Action | Source | Effort |
|---|---|---|---|
| 1 | Add all 141 event types from df-structures + DF 50.x to CDM event type taxonomy | dfhack-infrastructure | Medium |
| 2 | Extend HF CDM with missing high-priority fields (flags, interactions, skills, links, kills, whereabouts) | All legends browsers | Large |
| 3 | Add importance scoring columns and compute on ingestion | df-narrator | Small |
| 4 | Implement death cause narrative rendering (40+ causes) | weblegends | Medium |
| 5 | Implement perspective-aware event narrative generation | LB2, weblegends | Medium |
| 6 | Add cross-linking infrastructure (entity references → navigable links) | All legends browsers | Medium |
| 7 | Implement DF calendar utility (seconds72 → date/month/season) | df-narrator, weblegends | Small |

### Tier 2 — High Value (visualization and data completeness)

| # | Action | Source | Effort |
|---|---|---|---|
| 8 | Interactive world map with Leaflet.js (CRS.Simple, site markers, civ colors) | LV-Next, LB2 | Large |
| 9 | Family tree visualization (Cytoscape.js dagre) | LV-Next, LB1 | Medium |
| 10 | Event timeline charts (Chart.js line/bar) | LV-Next | Medium |
| 11 | Population distribution charts | LV-Next, LB1 | Small |
| 12 | Hover popovers for entity preview | LB2 | Medium |
| 13 | Global search with autocomplete | LB2 | Medium |
| 14 | Add missing CDM entity types: WorldConstructions, ArtForms (3), Identities, Rivers | All legends browsers | Large |

### Tier 3 — Bridge Enhancements

| # | Action | Source | Effort |
|---|---|---|---|
| 15 | Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, UNIT_NEW_ACTIVE, SYNDROME) | myDFHackScripts | Small |
| 16 | Death cause resolution via `df.global.world.incidents.all` | myDFHackScripts | Small |
| 17 | Parent/family chain extraction (`unit.relationship_ids.Mother/Father`) | myDFHackScripts | Small |
| 18 | Book/written work detection (`dfhack.items.getBookTitle`) | myDFHackScripts | Small |
| 19 | Create `worldgen-bridge.lua` for real-time worldgen monitoring | worldgen-scraping research | Medium |
| 20 | Add `worldgen_snapshots` CDM table | worldgen-scraping research | Small |

### Tier 4 — Stretch / Deferred

| # | Action | Source | Effort |
|---|---|---|---|
| 21 | Curse lineage tree (vampire/werebeast "who bit whom") | LB1 | Medium |
| 22 | Warfare graph (Cytoscape.js cola force-directed) | LV-Next | Medium |
| 23 | War chord diagram (D3.js) | LB1 | Medium |
| 24 | Mod awareness (record active mods per world) | mod-management research | Small |
| 25 | Stock threshold model from df-ai as LLM advisor context | df-ai | Medium |
| 26 | Raw file parser for mod conflict detection | mod-management research | Large |
