# Chronicler Event Type Taxonomy

**Date**: 2026-02-23
**Sources**: df-structures `history_event_type` enum (133 types), LegendsBrowser2 events.go (122 handled), Chronicler database world 8 (97 observed types)

---

## Overview

| Source | Event Types | Authority |
|--------|-------------|-----------|
| df-structures enum | 133 | Memory layout definition (canonical for older DF versions) |
| LegendsBrowser2 | 122 | Most complete handler implementation |
| Chronicler DB (world 8) | 97 | Observed in real DF 50.13 legends XML |
| DF 50.x-only (not in df-structures) | 8 | Added in Steam release, not yet in df-structures |

**Total canonical types**: 141 (133 from df-structures + 8 DF 50.x additions)

Note: The research synthesis incorrectly reported 144 types. The actual df-structures `history_event_type` enum has 133 entries (excluding `NONE = -1`).

---

## Complete Event Type List

### Category 1: HF Lifecycle (17 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| HIST_FIGURE_DIED | hf died | Yes (20,620) | Yes | Death of a historical figure |
| HIST_FIGURE_WOUNDED | hf wounded | Yes (3,263) | Yes | HF takes wounds in combat |
| HIST_FIGURE_ABDUCTED | hf abducted | Yes (3,282) | Yes | HF kidnapped |
| HIST_FIGURE_REVIVED | hf revived | Yes (425) | Yes | Resurrection or undead reanimation |
| HIST_FIGURE_REUNION | hf reunion | Yes (136) | Yes | HF reunited with family/companions |
| HIST_FIGURE_REACH_SUMMIT | — | No | Yes | HF climbs a mountain peak |
| HIST_FIGURE_TRAVEL | hf travel | Yes (802) | Yes | Long-distance journey |
| HIST_FIGURE_NEW_PET | hf new pet | Yes (319) | Yes | HF acquires a pet |
| HIST_FIGURE_SIMPLE_BATTLE_EVENT | hf simple battle event | Yes (17,238) | Yes | Generic combat action |
| HIST_FIGURE_SIMPLE_ACTION | — | No | **No** | Generic non-combat action |
| CHANGE_HF_STATE | change hf state | Yes (53,077) | Yes | State transition (settled, wandering, etc.) |
| CHANGE_HF_JOB | change hf job | Yes (49,584) | Yes | Profession change |
| CHANGE_HF_BODY_STATE | change hf body state | Yes (118) | Yes | Physical transformation |
| CHANGE_HF_MOOD | — | No | **No** | Mood change (strange mood, etc.) |
| CHANGE_CREATURE_TYPE | changed creature type | Yes (122) | Yes | Species transformation (curse) |
| HF_GAINS_SECRET_GOAL | hf gains secret goal | Yes (424) | Yes | Acquires a secret motivation |
| HF_RELATIONSHIP_DENIED | hf relationship denied | Yes (2,742) | Yes | Relationship attempt rejected |

### Category 2: HF Relationships & Links (10 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| ADD_HF_HF_LINK | add hf hf link | Yes (19,061) | Yes | New relationship between HFs |
| REMOVE_HF_HF_LINK | remove hf hf link | Yes (7,108) | Yes | Relationship ended |
| ADD_HF_ENTITY_LINK | add hf entity link | Yes (33,880) | Yes | HF joins entity |
| REMOVE_HF_ENTITY_LINK | remove hf entity link | Yes (1,568) | Yes | HF leaves entity |
| ADD_HF_SITE_LINK | add hf site link | Yes (4,208) | Yes | HF associated with site |
| REMOVE_HF_SITE_LINK | remove hf site link | Yes (841) | Yes | HF leaves site |
| ADD_HF_ENTITY_HONOR | add hf entity honor | Yes (16) | Yes | Honor/award granted |
| ASSUME_IDENTITY | assume identity | Yes (1,878) | Yes | HF takes false identity |
| HFS_FORMED_REPUTATION_RELATIONSHIP | hfs formed reputation relationship | Yes (3,579) | Yes | Reputation link formed |
| HFS_FORMED_INTRIGUE_RELATIONSHIP | hfs formed intrigue relationship | Yes (448) | Yes | Intrigue link formed |

### Category 3: HF Actions (14 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| HF_ATTACKED_SITE | hf attacked site | Yes (168) | Yes | HF leads attack on a site |
| HF_DESTROYED_SITE | hf destroyed site | Yes (123) | Yes | HF destroys a site |
| HF_CONFRONTED | hf confronted | Yes (127) | Yes | HF confrontation (challenge) |
| HF_DOES_INTERACTION | hf does interaction | Yes (52) | Yes | Supernatural interaction |
| HF_LEARNS_SECRET | hf learns secret | Yes (181) | Yes | Learns necromancy/vampirism |
| HF_PREACH | hf preach | Yes (449) | Yes | Religious preaching |
| HF_FREED | — | No | Yes | HF freed from captivity |
| HF_RANSOMED | hf ransomed | Yes (1) | Yes | HF ransomed |
| HF_ENSLAVED | — | No | Yes | HF enslaved |
| HF_ACT_ON_BUILDING | — | No | **No** | HF acts on a building |
| HF_ACT_ON_ARTIFACT | — | No | **No** | HF acts on an artifact |
| HF_RAZED_BUILDING | — | No | **No** | HF razes a building |
| HF_RECRUITED_UNIT_TYPE_FOR_ENTITY | hf recruited unit type for entity | Yes (3,441) | Yes | Military recruitment |
| SNEAK_INTO_SITE | — | No | Yes | Covert infiltration |

### Category 4: HF Intrigue (6 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| HF_CONVICTED | hf convicted | Yes (854) | Yes | Criminal conviction |
| HF_INTERROGATED | hf interrogated | Yes (40) | Yes | Interrogation |
| FAILED_INTRIGUE_CORRUPTION | failed intrigue corruption | Yes (1,245) | Yes | Corruption attempt failed |
| FAILED_FRAME_ATTEMPT | failed frame attempt | Yes (24) | Yes | Framing attempt failed |
| SABOTAGE | — | No | Yes | Sabotage action |
| SPOTTED_LEAVING_SITE | — | No | Yes | Caught leaving a site |

### Category 5: Artifacts (13 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| ARTIFACT_CREATED | artifact created | Yes (5,773) | Yes | Artifact forged/crafted |
| ARTIFACT_DESTROYED | — | No | Yes | Artifact destroyed |
| ARTIFACT_LOST | artifact lost | Yes (435) | Yes | Artifact whereabouts unknown |
| ARTIFACT_FOUND | artifact found | Yes (22) | Yes | Lost artifact rediscovered |
| ARTIFACT_RECOVERED | artifact recovered | Yes (16) | Yes | Artifact retrieved |
| ARTIFACT_POSSESSED | artifact possessed | Yes (67) | Yes | Artifact claimed by HF |
| ARTIFACT_GIVEN | artifact given | Yes (299) | Yes | Artifact transferred |
| ARTIFACT_STORED | artifact stored | Yes (4,721) | Yes | Artifact placed in storage |
| ARTIFACT_TRANSFORMED | — | No | Yes | Artifact altered |
| ARTIFACT_COPIED | artifact copied | Yes (287) | Yes | Written artifact copied |
| ARTIFACT_CLAIM_FORMED | artifact claim formed | Yes (732) | Yes | Ownership claim |
| ARTIFACT_HIDDEN | — | No | **No** | Artifact hidden |
| ARTIFACT_DROPPED | — | No | **No** | Artifact dropped |

### Category 6: Sites & Construction (11 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| CREATED_SITE | created site | Yes (1,126) | Yes | New site established |
| WAR_DESTROYED_SITE | destroyed site | Yes (10) | Yes | Site destroyed in war |
| RECLAIM_SITE | reclaim site | Yes (46) | Yes | Abandoned site reclaimed |
| SITE_DIED | — | No | Yes | Site population died off |
| SITE_RETIRED | — | No | Yes | Player retired a fortress |
| CREATED_BUILDING | created structure | Yes (1,401) | Yes | Building constructed |
| REPLACED_BUILDING | replaced structure | Yes (6) | Yes | Building replaced |
| ENTITY_RAZED_BUILDING | razed structure | Yes (35) | Yes | Building torn down |
| CREATED_WORLD_CONSTRUCTION | created world construction | Yes (203) | Yes | Road/bridge/tunnel |
| MODIFIED_BUILDING | modified building | Yes (12) | Yes | Building altered |
| BUILDING_PROFILE_ACQUIRED | building profile acquired | Yes (256) | Yes | Building gains profile |

### Category 7: Entities (14 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| ENTITY_CREATED | entity created | Yes (1,112) | Yes | New organization formed |
| ENTITY_ACTION | — | No | **No** | Generic entity action |
| ENTITY_INCORPORATED | entity incorporated | Yes (313) | Yes | Entity absorbed into another |
| ENTITY_DISSOLVED | entity dissolved | Yes (4) | Yes | Entity disbanded |
| ENTITY_LAW | entity law | Yes (8) | Yes | Law enacted |
| ENTITY_PERSECUTED | entity persecuted | Yes (375) | Yes | Religious/political persecution |
| ENTITY_OVERTHROWN | entity overthrown | Yes (10) | Yes | Government overthrown |
| ENTITY_ALLIANCE_FORMED | entity alliance formed | Yes (9) | Yes | Alliance between entities |
| ENTITY_EQUIPMENT_PURCHASE | entity equipment purchase | Yes (3) | Yes | Military equipment purchase |
| ENTITY_BREACH_FEATURE_LAYER | entity breach feature layer | Yes (1) | Yes | Underground breach |
| ENTITY_SEARCHED_SITE | — | No | Yes | Entity searches a site |
| ENTITY_RAMPAGED_IN_SITE | — | No | Yes | Entity rampages at site |
| ENTITY_FLED_SITE | — | No | Yes | Entity flees a site |
| ENTITY_EXPELS_HF | — | No | Yes | Entity expels member |
| REGIONPOP_INCORPORATED_INTO_ENTITY | regionpop incorporated into entity | Yes (42) | Yes | Population joins entity |
| CREATE_ENTITY_POSITION | create entity position | Yes (1,145) | Yes | New position title |
| ADD_ENTITY_SITE_PROFILE_FLAG | — | No | **No** | Site profile flag set |

### Category 8: War & Combat (8 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| WAR_ATTACKED_SITE | attacked site | Yes (346) | Yes | Siege or attack on site |
| WAR_FIELD_BATTLE | field battle | Yes (102) | Yes | Open-field battle |
| WAR_PLUNDERED_SITE | plundered site | Yes (98) | Yes | Site looted after capture |
| WAR_SITE_NEW_LEADER | new site leader | Yes (74) | Yes | Leadership changed |
| WAR_SITE_TAKEN_OVER | site taken over | Yes (69) | Yes | Site conquered |
| WAR_SITE_TRIBUTE_FORCED | site tribute forced | Yes (1) | Yes | Tribute imposed |
| TACTICAL_SITUATION | — | No | Yes | Tactical military event |
| SQUAD_VS_SQUAD | — | No | Yes | Squad combat |
| SITE_SURRENDERED | — | No | Yes | Site capitulation |
| BODY_ABUSED | body abused | Yes (258) | Yes | Corpse desecration |
| CREATURE_DEVOURED | creature devoured | Yes (5,412) | Yes | Entity eaten |
| ITEM_STOLEN | item stolen | Yes (3,256) | Yes | Theft |
| INSURRECTION_STARTED | — | No | Yes | Uprising begins |
| INSURRECTION_ENDED | — | No | **No** | Uprising ends |

### Category 9: Diplomacy (9 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| FIRST_CONTACT | — | No | Yes | First meeting between civilizations |
| FIRST_CONTACT_FAILED | — | No | Yes | Failed contact attempt |
| WAR_PEACE_ACCEPTED | peace accepted | Yes (53) | Yes | Peace treaty signed |
| WAR_PEACE_REJECTED | peace rejected | Yes (6) | Yes | Peace offer rejected |
| TOPICAGREEMENT_CONCLUDED | — | No | Yes | Agreement concluded |
| TOPICAGREEMENT_REJECTED | — | No | Yes | Agreement rejected |
| TOPICAGREEMENT_MADE | — | No | Yes | Agreement proposed |
| DIPLOMAT_LOST | — | No | Yes | Diplomat killed/missing |
| AGREEMENTS_VOIDED | — | No | **No** | Agreements cancelled |
| AGREEMENT_FORMED | agreement formed | Yes (2,379) | Yes | Formal agreement |
| AGREEMENT_CONCLUDED | — | No | Yes | Agreement completed |
| SITE_DISPUTE | site dispute | Yes (231) | Yes | Territorial dispute |
| TRADE | trade | Yes (737) | Yes | Trade event |
| MERCHANT | — | No | Yes | Merchant caravan |

### Category 10: Culture & Art (8 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| POETIC_FORM_CREATED | poetic form created | Yes (49) | Yes | New poetic form invented |
| MUSICAL_FORM_CREATED | musical form created | Yes (73) | Yes | New musical form |
| DANCE_FORM_CREATED | dance form created | Yes (25) | Yes | New dance form |
| WRITTEN_CONTENT_COMPOSED | written content composed | Yes (26,819) | Yes | Written work created |
| KNOWLEDGE_DISCOVERED | knowledge discovered | Yes (2,790) | Yes | Knowledge/technology advance |
| PERFORMANCE | performance | Yes (6,929) | Yes | Public performance |
| COMPETITION | competition | Yes (4,404) | Yes | Competitive event |
| PROCESSION | procession | Yes (2,305) | Yes | Formal procession |
| CEREMONY | ceremony | Yes (3,591) | Yes | Religious ceremony |
| GAMBLE | gamble | Yes (1,682) | Yes | Gambling event |

### Category 11: Masterpieces (7 types)

| df-structures Name | DB Name | In DB? | In LB2? | Description |
|---------------------|---------|--------|---------|-------------|
| MASTERPIECE_CREATED_ARCH_CONSTRUCT | — | No | Yes | Masterwork construction |
| MASTERPIECE_CREATED_ITEM | — | No | Yes | Masterwork item |
| MASTERPIECE_CREATED_DYE_ITEM | — | No | Yes | Masterwork dyed item |
| MASTERPIECE_CREATED_ITEM_IMPROVEMENT | — | No | Yes | Masterwork improvement |
| MASTERPIECE_CREATED_FOOD | — | No | Yes | Masterwork meal |
| MASTERPIECE_CREATED_ENGRAVING | — | No | Yes | Masterwork engraving |
| MASTERPIECE_LOST | — | No | Yes | Masterwork destroyed/lost |

---

## DF 50.x Event Types (Not in df-structures enum)

These 8 event types appear in Chronicler's database (world 8, DF 50.13) but are NOT in our version of the df-structures `history_event_type` enum. They were added in the Steam release.

| DB Name | Count | Likely Purpose |
|---------|-------|----------------|
| hf prayed inside structure | 388 | HF prayer at temple/shrine |
| hf equipment purchase | 523 | HF buys equipment (vs entity purchase) |
| hf performed horrible experiments | 43 | Necromancer experiments |
| hf profaned structure | 41 | HF desecrates a building |
| entity relocate | 55 | Entity moves to new site |
| entity primary criminals | 47 | Entity designates criminals |
| holy city declaration | 9 | City declared holy |
| hf viewed artifact | 56 | HF examines an artifact |

---

## 11 Types in df-structures but NOT Handled by LB2

These types exist in the `history_event_type` enum but LegendsBrowser2 has no `Html()` handler for them:

1. **AGREEMENTS_VOIDED** — Diplomatic agreements cancelled
2. **ARTIFACT_DROPPED** — Artifact discarded
3. **ARTIFACT_HIDDEN** — Artifact hidden from view
4. **CHANGE_HF_MOOD** — HF mood change (strange mood onset)
5. **ENTITY_ACTION** — Generic entity action
6. **HF_ACT_ON_ARTIFACT** — HF manipulates an artifact
7. **HF_ACT_ON_BUILDING** — HF acts on a building
8. **HF_RAZED_BUILDING** — HF personally destroys a building
9. **HIST_FIGURE_SIMPLE_ACTION** — Generic HF non-combat action
10. **INSURRECTION_ENDED** — Uprising resolved
11. **ADD_ENTITY_SITE_PROFILE_FLAG** — Site profile flag added

**Chronicler strategy**: Store all event types as-is (TEXT column, no enum). The agentic storyteller handles them via LLM interpretation with the raw event data in the `details` JSONB column. No per-type template needed — the LLM reads the fields directly.

---

## Summary Statistics (World 8: Thadar En)

- **Total events**: 312,254
- **Distinct event types observed**: 97
- **Most common**: change hf state (53,077), change hf job (49,584), add hf entity link (33,880)
- **Rarest observed**: site tribute forced (1), hf ransomed (1), entity breach feature layer (1)
