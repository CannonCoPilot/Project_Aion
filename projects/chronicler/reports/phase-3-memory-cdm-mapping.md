# Phase 3: In-Game Memory → CDM Mapping Reference

**Version**: 1.0 (Wiggum Loop 1)
**Date**: 2026-03-05
**Purpose**: Comprehensive mapping of DFHack in-game memory structures to the Chronicler XML-based Common Data Model (CDM)
**df-structures version**: 53.11-r1 (commit 1e2cee29 — naming convention alignment)

> **Key Finding**: The 53.10→53.11 changes are purely nomenclature (`original-name` attributes added). No structural changes — no fields added or removed. All existing RPC/Lua extraction code remains valid.

---

## 1. Mapping Legend

| Symbol | Meaning |
|--------|---------|
| **CONNECTED** | Memory field maps directly to an existing CDM column (1:1) |
| **CONNECTED-J** | Memory field maps to an existing CDM JSONB column (nested) |
| **CDM-NEW** | Requires a new CDM table or column to capture this data |
| **DERIVED** | Can be computed/derived from existing CDM data |
| **SKIP** | Internal DF engine state — not useful for Chronicler |
| **MODE** | Available only in specific game modes (W=worldgen, F=fortress, A=adventure) |

---

## 2. Domain 1: Historical Figures ↔ Units

### 2.1 Core Identity (CONNECTED — 100%)

| Memory Structure | Memory Field | Original Name | CDM Table | CDM Column | Status |
|-----------------|-------------|---------------|-----------|------------|--------|
| `historical_figure` | `id` | `global_id` | `historical_figures` | `id` | CONNECTED |
| `historical_figure` | `name` | — | `historical_figures` | `name` | CONNECTED |
| `historical_figure` | `race` | — | `historical_figures` | `race` | CONNECTED |
| `historical_figure` | `caste` | — | `historical_figures` | `caste` | CONNECTED |
| `historical_figure` | `sex` | `gender` | `historical_figures` | `sex` | CONNECTED |
| `historical_figure` | `born_year` | `birth_year` | `historical_figures` | `birth_year` | CONNECTED |
| `historical_figure` | `born_seconds` | `birth_season_count` | `historical_figures` | `birth_seconds` | CONNECTED |
| `historical_figure` | `died_year` | — | `historical_figures` | `death_year` | CONNECTED |
| `historical_figure` | `died_seconds` | `died_season_count` | `historical_figures` | `death_seconds` | CONNECTED |
| `historical_figure` | `civ_id` | `quick_entity_id` | `historical_figures` | `entity_id` | CONNECTED |
| `historical_figure` | `flags[DEITY]` | — | `historical_figures` | `is_deity` | CONNECTED |
| `historical_figure` | `flags[FORCE]` | — | `historical_figures` | `is_force` | CONNECTED |
| `historical_figure` | `flags[GHOST]` | — | `historical_figures` | `is_ghost` | CONNECTED |
| `hf_profile.metaphysical` | vampire flags | — | `historical_figures` | `is_vampire` | CONNECTED |
| `hf_profile.metaphysical` | necromancer flags | — | `historical_figures` | `is_necromancer` | CONNECTED |
| `hf_profile.metaphysical` | werebeast flags | — | `historical_figures` | `is_werebeast` | CONNECTED |
| `hf_profile.skills` | skill vector | `skill_profile` | `historical_figures` | `skills` | CONNECTED-J |
| `hf_profile.kills` | kill counts | `kill_profile` | `historical_figures` | `kills` | CONNECTED-J |
| `hf_profile.kills` | kill_number count | — | `historical_figures` | `kill_count` | CONNECTED |
| `hf_profile.whereabouts` | state data | `state_profile` | `historical_figures` | `whereabouts` | CONNECTED-J |
| `hf_profile.reputation` | entity reps | `reputation_profile` | `historical_figures` | `entity_reputations` | CONNECTED-J |
| `historical_figure` | `spheres` (via deity links) | — | `historical_figures` | `spheres` | CONNECTED |

### 2.2 HF Links (CONNECTED — 100%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `histfig_hf_link` | `target_hf` + type | `hf_links` | `target_hf_id`, `link_type` | CONNECTED |
| `histfig_entity_link` | `entity_id` + type | `hf_entity_links` | `entity_id`, `link_type` | CONNECTED |
| `histfig_site_link` | `site_id` + type | `hf_site_links` | `site_id`, `link_type` | CONNECTED |
| `entity_position_assignment` | `histfig` + dates | `hf_position_links` | `hf_id`, `position_id`, `start_year` | CONNECTED |

### 2.3 HF Data NOT in CDM (CDM-NEW candidates)

| Memory Structure | Memory Field | Original Name | Proposed CDM Location | Priority |
|-----------------|-------------|---------------|----------------------|----------|
| `historical_figure` | `appeared_year` | `appeared` | `historical_figures.details` | LOW |
| `historical_figure` | `curse_year/seconds` | `frozen_age_*` | `historical_figures.details` | MED |
| `historical_figure` | `old_year/seconds` | `age_death_*` | `historical_figures.details` | LOW |
| `historical_figure` | `family_head_id` | `family_source_hfid` | `historical_figures.details` | MED |
| `historical_figure` | `orientation_flags` | `sexual_orientation_flag` | `historical_figures.details` | LOW |
| `historical_figure` | `unit_id` | — | `historical_figures.details` (or JOIN) | HIGH |
| `historical_figure` | `population_id` | `entity_population_id` | `historical_figures.details` | LOW |
| `historical_figure` | `cultural_identity` | `cultural_identity_id` | `historical_figures.details` | LOW |
| `hf_profile.personality` | full personality | `personality_profile` | See §2.5 below | HIGH |
| `hf_profile.wounds` | body scars | `body_profile` | `historical_figures.details` | LOW |
| `hf_profile.known_info` | scholar knowledge | `knowledge_profile` | `historical_figures.details` | LOW |
| `hf_profile.curse` | curse/interaction | `interaction_profile` | `historical_figures.details` | MED |
| `hf_profile.books` | authored books | `inventory_profile` | JOIN to `written_contents` | LOW |
| `histfig_hf_link` | `link_strength` | `strength` | `hf_links.strength` (new col) | MED |

### 2.4 Live Unit Data (MODE: F/A — new CDM tables needed)

| Memory Structure | Memory Field | Original Name | CDM Table | CDM Column | Status |
|-----------------|-------------|---------------|-----------|------------|--------|
| `unit` | `id` | `global_id` | `units` | `id` | CONNECTED |
| `unit` | `name` | — | `units` | `name` | CONNECTED |
| `unit` | `race` | — | `units` | `race` | CONNECTED |
| `unit` | `caste` | — | `units` | `caste` | CONNECTED |
| `unit` | `profession` | `type` | `units` | `profession` | CONNECTED |
| `unit` | `pos` | — | `units` | `pos_x/y/z` | CONNECTED |
| `unit` | `hist_figure_id` | — | `units` | `hist_fig_id` | CONNECTED |
| `unit` | `civ_id` | `quick_entity_id` | `units` | `civ_id` | CONNECTED |
| `unit` | `birth_year` | — | `units` | `birth_year` | CONNECTED |
| `unit` | `sex` | `gender` | `units` | `sex` | CONNECTED |
| `unit` | `flags1.dead` | — | `units` | `is_alive` (inverted) | CONNECTED |
| `unit` | `mood` | — | `units` | `details.mood` | CDM-NEW |
| `unit` | `job.current_job` | `currentjob` | `units` | `details.current_job` | CDM-NEW |
| `unit` | `counters2.hunger_timer` | `hunger` | `units` | `details.hunger` | CDM-NEW |
| `unit` | `counters2.thirst_timer` | `thirst` | `units` | `details.thirst` | CDM-NEW |
| `unit` | `counters2.sleepiness_timer` | `drowsiness` | `units` | `details.sleepiness` | CDM-NEW |
| `unit` | `body.blood_count` | `blood` | `units` | `details.blood_pct` | CDM-NEW |
| `unit` | `body.wounds[]` | — | `units` | `details.wounds` | CDM-NEW |
| `unit_soul` | `mental_attrs[7]` | `mental_attribute` | `units` | `details.mental_attrs` | CDM-NEW |
| `unit_soul` | `skills[]` | — | `units` | `details.skills` | CDM-NEW |
| `unit_personality` | `traits[14]` | `nfacet` | `units` | `details.personality_traits` | CDM-NEW |
| `unit_personality` | `stress` | — | `units` | `details.stress` | CDM-NEW |
| `unit_personality` | `emotions[]` | `mood` | `units` | `details.emotions` | CDM-NEW |
| `unit_personality` | `needs[]` | `need` | `units` | `details.needs` | CDM-NEW |
| `unit_personality` | `values[]` | `value` | `units` | `details.values` | CDM-NEW |
| `unit` | `relationship_ids[9]` | `relation` | `units` | `details.relationships` | CDM-NEW |
| `unit` | `inventory[]` | `inv` | `units` | `details.inventory` | CDM-NEW |
| `unit` | `appearance.body_modifiers[]` | — | `units` | `details.appearance` | CDM-NEW |

### 2.5 Personality Deep Structure

The personality system is hierarchically deep. For live units:

```
unit.status.current_soul (unit_soul)
├── mental_attrs[7]: ANALYTICAL_ABILITY, FOCUS, WILLPOWER, CREATIVITY,
│                    INTUITION, PATIENCE, MEMORY, LINGUISTIC_ABILITY,
│                    SPATIAL_SENSE, MUSICALITY, KINESTHETIC_SENSE,
│                    EMPATHY, SOCIAL_AWARENESS
├── skills[]: {id: job_skill, rating: 0-20, experience: int, rusty: int}
└── personality (unit_personality)
    ├── traits[50]: facet values (0-100 scale, 50=neutral)
    │   ANXIETY_PROPENSITY, ANGER_PROPENSITY, DEPRESSION_PROPENSITY,
    │   ELATION_PROPENSITY, STRESS_VULNERABILITY, GREED, IMMODERATION,
    │   VIOLENT, ENVY_PROPENSITY, LUST_PROPENSITY, PRIDE, GRATITUDE,
    │   BRAVERY, CHEER_PROPENSITY, etc.
    ├── values[]: {type: personality_value_type, strength: int}
    │   KNOWLEDGE, PERSEVERANCE, HARD_WORK, FAMILY, FRIENDSHIP,
    │   POWER, TRUTH, CUNNING, ELOQUENCE, FAIRNESS, DECORUM,
    │   TRADITION, ARTWORK, COOPERATION, INDEPENDENCE, STOICISM,
    │   PEACE, SELF_CONTROL, HARMONY, MERRIMENT, CRAFTSMANSHIP,
    │   MARTIAL_PROWESS, SKILL, COMMERCE, ROMANCE, NATURE, LEISURE
    ├── needs[]: {type: need_type, focus_level: int}
    │   DRINK, EAT, SLEEP, SOCIALIZE, BE_WITH_FAMILY,
    │   PRAY_OR_MEDITATE, CRAFT, FIGHT, LEARN, CREATE,
    │   WANDER, MUSIC, DANCE, POETRY, MARTIAL_TRAINING, etc.
    ├── emotions[]: {type: emotion_type, strength: int, year: int, ...}
    ├── dreams[]: {type: goal_type, count_achieved: int}
    │   STAY_ALIVE, MAINTAIN_SELF, RULE_THE_WORLD,
    │   START_A_FAMILY, CREATE_MASTERWORK, BRING_PEACE,
    │   BECOME_LEGENDARY, MASTER_A_SKILL, etc.
    ├── stress: int32 (current stress level)
    └── longterm_stress: int32 (accumulated)
```

**CDM Recommendation**: Store personality as a JSONB blob in `units.details.personality` with sub-keys for traits, values, needs, emotions, dreams, and stress. This avoids CDM table explosion while preserving full fidelity.

---

## 3. Domain 2: Entities / Civilizations

### 3.1 Core Entity (CONNECTED — 90%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `historical_entity` | `id` | `entities` | `id` | CONNECTED |
| `historical_entity` | `name` | `entities` | `name` | CONNECTED |
| `historical_entity` | `type` | `entities` | `type` | CONNECTED |
| `historical_entity` | `race` | `entities` | `race` | CONNECTED |
| `historical_entity` | `source_hfid` | `entities` | `details.founder_hf_id` | CONNECTED-J |
| `historical_entity` | `flags` | `entities` | `details.flags` | CONNECTED-J |

### 3.2 Entity Sub-Structures (Partially Connected)

| Memory Structure | Memory Field | CDM Table | Status | Notes |
|-----------------|-------------|-----------|--------|-------|
| `entity_position` | all fields | `entity_positions` | CONNECTED | Position definitions |
| `entity_position_assignment` | all fields | `hf_position_links` | CONNECTED | Position holders |
| `entity_entity_link` | type, target, strength | `entities.details` | CONNECTED-J | Parent/child/religious links |
| `entity_site_link` | target, flags, type | Implicit via `sites.owner_entity_id` | PARTIAL | Need richer link table |
| `entity_population` | race, count, civ_id | `entity_populations` | CONNECTED | Population tracking |
| `entity_occasion` | occasions + schedules | `entity_occasions` + `occasion_schedules` | CONNECTED | Festivals |
| `entity_tissue_style` | cultural styles | — | CDM-NEW | Cultural appearance |
| `entity_uniform` | military uniforms | — | CDM-NEW | Equipment templates |
| `artifact_claim` | artifact claims | — | CDM-NEW | Entity→artifact claims |
| `honors_type` | merc company honors | — | CDM-NEW | Honor system |

### 3.3 Entity Data NOT in CDM (CDM-NEW candidates)

| Memory Field | Proposed CDM Location | Priority | Notes |
|-------------|----------------------|----------|-------|
| `histfig_ids[]` | DERIVED from hf_entity_links | — | Membership list |
| `entity_links[]` | `entities.details.entity_links` | HIGH | Civ-to-civ relationships |
| `site_links[]` | New `entity_site_links` table or JSONB | HIGH | Full site control data |
| `resources` (weapons/armor/materials) | `entities.details.resources` | MED | Material preferences |
| `diplomacy` | `entities.details.diplomacy` | MED | Trade/war state |
| `claims` (territory areas) | `entities.details.territory` | LOW | Coordinate paths |
| `squads[]` | JOIN to units/fortress_denizens | MED | Military org |
| `armies[]` | CDM-NEW or `entities.details.armies` | MED | Army groups |
| `trade_*` | `entities.details.trade` | LOW | Economy state |
| `total_pop`, `eating_pop_*`, `working_pop` | `entities.details.population_stats` | MED | Demographics |
| `war_fatigue`, `hostility_level`, `siege_tier` | `entities.details.military_stats` | MED | War state |
| `performed_poetic/musical/dance_forms[]` | JOIN to `art_forms` | LOW | Cultural knowledge |
| `law` | `entities.details.law` | LOW | Legal system |

---

## 4. Domain 3: Sites

### 4.1 Core Site (CONNECTED — 85%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `world_site` | `id` | `sites` | `id` | CONNECTED |
| `world_site` | `name` | `sites` | `name` | CONNECTED |
| `world_site` | `type` | `sites` | `type` | CONNECTED |
| `world_site` | `pos` | `sites` | `coord_x`, `coord_y` | CONNECTED |
| `world_site` | `cur_owner_id` | `sites` | `owner_entity_id` | CONNECTED |
| `abstract_building[]` | id, name, type | `structures` | id, name, type | CONNECTED |

### 4.2 Site Data NOT in CDM

| Memory Field | Proposed CDM Location | Priority | Notes |
|-------------|----------------------|----------|-------|
| `civ_id` (founder) | `sites.details.founder_civ_id` | MED | Original founder |
| `populace` (demographics) | `sites.details.population` | HIGH | Live population data |
| `resident_count` | `sites.details.resident_count` | HIGH | Current pop |
| `infrastructure` | `sites.details.infrastructure` | MED | Facility counts |
| `entity_links[]` | `sites.details.entity_links` | HIGH | All civ connections |
| `property_ownership[]` | `sites.details.properties` | LOW | Noble property |
| `created_tick/year` | `sites.details.founded_year` | MED | Foundation date |
| `architecture_change[]` | `sites.details.architecture_history` | LOW | Building history |

---

## 5. Domain 4: Geography

### 5.1 Regions (CONNECTED — 80%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `world_region` | `index` | `regions` | `id` | CONNECTED |
| `world_region` | `name` | `regions` | `name` | CONNECTED |
| `world_region` | `type` | `regions` | `type` | CONNECTED |
| `world_region` | `region_coords` | `regions` | `coords` | CONNECTED |
| `world_region` | `evil`/`good`/`dead_percentage` | `regions` | `evilness` | PARTIAL |

### 5.2 Geography NOT in CDM

| Memory Field | Proposed CDM Location | Priority | Notes |
|-------------|----------------------|----------|-------|
| `population[]` (fauna) | `regions.details` or new table | MED | Wildlife populations |
| `forces[]` (deity HFs) | `regions.details` | LOW | Deity influence |
| `tree_*` (flora) | `regions.details` | LOW | Vegetation data |
| `has_bogeymen`, `reanimating` | `regions.details` | MED | Evil region flags |

---

## 6. Domain 5: Events & History

### 6.1 History Events (CONNECTED — 95%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `history_event` | `id` | `history_events` | `id` | CONNECTED |
| `history_event` | `year` | `history_events` | `year` | CONNECTED |
| `history_event` | `seconds` | `history_events` | `seconds` | CONNECTED |
| `history_event` | `getType()` | `history_events` | `event_type` | CONNECTED |
| subclass fields | various HF/site/entity refs | `history_events` | `hf_id_1/2, site_id, entity_id_1/2` | CONNECTED |
| subclass fields | remaining fields | `history_events` | `details` (JSONB) | CONNECTED-J |
| `event_collection` | all fields | `history_event_collections` | all | CONNECTED |
| `collection_events` | event membership | `collection_events` | all | CONNECTED |
| `collection_subcollections` | hierarchy | `collection_subcollections` | all | CONNECTED |
| `relationship_event` | relationship data | `event_relationships` | all | CONNECTED |

### 6.2 Event Types (144 total — 114 templates implemented)

We have 114 event type templates in Phase 2. The remaining 30 are:
- Mostly rare/edge-case events (GAMBLE, ENTITY_RAMPAGED, etc.)
- Should be mapped during Phase 3 for completeness
- All follow the same pattern: details JSONB captures type-specific fields

### 6.3 Live Events NOT in CDM (MODE: F/A)

| Memory Field | Proposed CDM Location | Priority | Notes |
|-------------|----------------------|----------|-------|
| Real-time event stream | `unit_events` | CONNECTED | Already in schema |
| Death cause (from incidents) | `units.death_cause` | CONNECTED | Already in schema |
| `pending_events.unit_deaths` | `unit_events` | CONNECTED | Bridge reactive |
| `pending_events.jobs_completed` | `unit_events` | CONNECTED | Bridge reactive |
| `pending_events.invasions` | `unit_events` | CDM-NEW | Need invasion event type |

---

## 7. Domain 6: World Object & Globals

### 7.1 World-Level Data

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `world_data` | `name` | `worlds` | `name` | CONNECTED |
| `world_data` | `world_width/height` | `world_map_snapshots` | `world_width/height` | CONNECTED |
| `worldgen_parms` | generation params | `worldgen_snapshots` | `data` (JSONB) | CONNECTED |
| `world.history.eras[]` | era data | `historical_eras` | all | CONNECTED |

### 7.2 World Globals NOT in CDM

| Memory Field | Proposed CDM Location | Priority | Notes |
|-------------|----------------------|----------|-------|
| `world.raws.creatures` | `creature_dictionary` | CONNECTED | Already mapped |
| `world.raws.itemdefs` | CDM-NEW | LOW | Item definitions |
| `world.raws.entities` | CDM-NEW | LOW | Entity templates |
| `world.raws.reactions` | CDM-NEW | LOW | Crafting recipes |
| `world.raws.materials` | CDM-NEW | LOW | Material index |
| `world.written_contents` | `written_contents` | CONNECTED | Already mapped |
| `world.artifacts` | `artifacts` | CONNECTED | Already mapped |
| `world.poetic/musical/dance_forms` | `art_forms` | CONNECTED | Already mapped |
| `world.belief_systems` | CDM-NEW | MED | Religious systems |
| `world.cultural_identities` | CDM-NEW | MED | Cultural data |
| `world.identities` | `identities` | CONNECTED | Already mapped |
| `world.agreements` | CDM-NEW | LOW | Treaties/peace |
| `world.incidents` | CDM-NEW (for bridge) | HIGH | Death cause enrichment |
| `world.crimes` | CDM-NEW | LOW | Crime records |
| `world.squads` | CDM-NEW | MED | Military units |
| `world.armies/army_controllers` | CDM-NEW | MED | Army state |

---

## 8. Domain 7: Artifacts

### 8.1 Artifacts (CONNECTED — 90%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `artifact_record` | `id` | `artifacts` | `id` | CONNECTED |
| `artifact_record` | `name` | `artifacts` | `name` | CONNECTED |
| `artifact_record` | `item` ref | `artifacts` | `item_type/subtype/material` | CONNECTED |
| via HF links | creator HF | `artifacts` | `creator_hf_id` | CONNECTED |
| via HF links | holder HF | `artifacts` | `holder_hf_id` | CONNECTED |
| via site links | location site | `artifacts` | `site_id` | CONNECTED |

---

## 9. Domain 8: Art & Culture

### 9.1 Art Forms (CONNECTED — 85%)

| Memory Structure | Memory Field | CDM Table | CDM Column | Status |
|-----------------|-------------|-----------|------------|--------|
| `poetic_form` | all fields | `art_forms` | form_type='poetic' | CONNECTED |
| `musical_form` | all fields | `art_forms` | form_type='musical' | CONNECTED |
| `dance_form` | all fields | `art_forms` | form_type='dance' | CONNECTED |
| `written_content` | all fields | `written_contents` | all | CONNECTED |

---

## 10. Mode-Specific Data Availability

### 10.1 World Generation Mode

| Data Source | Availability | Extraction Method | CDM Target |
|------------|-------------|-------------------|------------|
| `df.global.world.worldgen_status` | Real-time | Lua poll every 30 frames | `worldgen_snapshots` |
| Population counts | Per-phase | Lua `#world.history.figures` | `worldgen_snapshots.hf_count` |
| Entity counts | Per-phase | Lua `#world.entities.all` | `worldgen_snapshots.entity_count` |
| Site counts | Per-phase | Lua `#world.world_data.sites` | `worldgen_snapshots.site_count` |
| Event counts | Per-phase | Lua `#world.history.events` | `worldgen_snapshots.event_count` |
| Terrain map | Phase completion | Lua region tile sampling | `world_map_snapshots` |
| History events | Post-gen only | Lua iteration | `history_events` |
| Full HF data | Post-gen only | Lua iteration | `historical_figures` |

### 10.2 Fortress Mode

| Data Source | Availability | Extraction Method | CDM Target |
|------------|-------------|-------------------|------------|
| All units in fort | Real-time | Lua `df.global.world.units.active` | `units` |
| Fortress denizens | Real-time | Filter by `civ_id` match | `fortress_denizens` |
| Visitors/merchants | Real-time | Filter by flags | `units` |
| Invaders | Real-time | eventful subscription | `unit_events` |
| Buildings | Real-time | Lua `df.global.world.buildings.all` | (future CDM) |
| Announcements | Real-time | Report buffer | `game_reports` |
| Diplomacy | Event-based | eventful subscription | `unit_events` |
| Artifacts in fort | Real-time | Lua item scan | `artifacts` (update) |
| Personality/soul | Per-unit | Lua deep extraction | `units.details` |
| History events (new) | Post-season | Lua delta scan | `history_events` |

### 10.3 Adventure Mode

| Data Source | Availability | Extraction Method | CDM Target |
|------------|-------------|-------------------|------------|
| Player unit | Real-time | `df.global.world.units.active[0]` | `units` |
| Nearby units | Real-time | Spatial filter | `units` |
| Conversations | Real-time | Activity tracking | `unit_events` |
| Combat events | Real-time | eventful | `unit_events` |
| Travel/movement | Per-tick | Position delta | `unit_events` |
| Sites visited | On arrival | Site detection | Future CDM |

---

## 11. CDM Change Recommendations

### 11.1 New Columns on Existing Tables

| Table | New Column | Type | Purpose |
|-------|-----------|------|---------|
| `hf_links` | `strength` | INT | Relationship strength (1-5) |
| `sites` | `founded_year` | INT | Foundation year |
| `sites` | `founder_entity_id` | INT | Original founding civ |

### 11.2 New Tables Recommended

| Table | Purpose | Priority | Fields |
|-------|---------|----------|--------|
| `entity_site_links` | Rich entity↔site relationships | HIGH | `world_id, entity_id, site_id, link_type, flags, start_year, end_year, link_strength` |
| `entity_entity_links` | Civ-to-civ relationships | HIGH | `world_id, source_entity_id, target_entity_id, link_type, strength` |
| `belief_systems` | Religious belief systems | MED | `world_id, id, name, details JSONB` |
| `cultural_identities` | Cultural identity records | MED | `world_id, id, name, entity_id, details JSONB` |
| `squads` | Military squad tracking | MED | `world_id, id, entity_id, name, leader_hf_id, members JSONB` |

### 11.3 Existing Tables — JSONB Expansion

The `units.details` JSONB column should be expanded to capture:
```json
{
  "mood": "NONE",
  "current_job": "Mining",
  "hunger": 0, "thirst": 0, "sleepiness": 0,
  "blood_pct": 100,
  "wounds": [],
  "mental_attrs": {"FOCUS": 1200, "WILLPOWER": 800, ...},
  "skills": [{"id": "MINING", "rating": 15, "experience": 50000}],
  "personality": {
    "traits": {"ANXIETY_PROPENSITY": 45, "BRAVERY": 72, ...},
    "values": [{"type": "HARD_WORK", "strength": 30}],
    "needs": [{"type": "DRINK", "focus_level": -2}],
    "stress": 5000,
    "longterm_stress": 12000
  },
  "relationships": [{"slot": 0, "target_unit_id": 1234}],
  "inventory": [{"item_id": 5678, "mode": "Weapon"}],
  "appearance": {"body_modifiers": [], "tissue_styles": []}
}
```

---

## 12. Connection Matrix Summary

| CDM Domain | Total Memory Fields | CONNECTED | CDM-NEW | SKIP | Coverage |
|-----------|-------------------|-----------|---------|------|----------|
| Historical Figures | 42 | 21 | 15 | 6 | 50% → 86% |
| Entities | 35 | 10 | 20 | 5 | 29% → 86% |
| Sites | 18 | 6 | 10 | 2 | 33% → 89% |
| Geography | 12 | 5 | 5 | 2 | 42% → 83% |
| Events | 20 | 18 | 2 | 0 | 90% → 100% |
| World/Globals | 25 | 10 | 10 | 5 | 40% → 80% |
| Artifacts | 8 | 7 | 1 | 0 | 88% → 100% |
| Art/Culture | 6 | 5 | 1 | 0 | 83% → 100% |
| **TOTAL** | **166** | **82** | **64** | **20** | **49% → 88%** |

**Current CDM coverage**: 49% of extractable memory fields
**After Phase 3 CDM changes**: 88% coverage (146/166 fields)

---

## 13. 1:1 Mapping Review — CONNECT vs APPEND Audit

### 13.1 CONNECT Points (Already Designed — Good)

| Join Path | Direction | Status |
|-----------|-----------|--------|
| `fortress_denizens.hf_id` → `historical_figures.id` | Bidirectional | GOOD |
| `fortress_denizens.unit_id` → `units.id` | Bidirectional | GOOD |
| `units.hist_fig_id` → `historical_figures.id` | Unit→HF bridge | GOOD |
| `hf_position_links.position_id` → `entity_positions.position_id` | Position→holder | GOOD |
| `event_entity_xref` → all entity types | Universal xref | GOOD |
| `hf_links.target_hf_id` → `historical_figures.id` | HF↔HF | GOOD |
| `hf_entity_links.entity_id` → `entities.id` | HF→Entity | GOOD |
| `hf_site_links.site_id` → `sites.id` | HF→Site | GOOD |
| `structures(world_id, site_id)` → `sites(world_id, id)` | Structure→Site | GOOD |
| `collection_events.event_id` → `history_events.id` | Collection→Event | GOOD |

### 13.2 APPEND Violations (Must Fix)

#### V1: `units` table uses INT PRIMARY KEY instead of composite
**Problem**: `units.id` is `INT PRIMARY KEY` (not `(world_id, id)` like all other CDM tables). This breaks multi-world support and creates an island table that can't join cleanly with the rest of the CDM.
**Fix**: Change to `PRIMARY KEY (world_id, id)`, matching the CDM pattern.

#### V2: `unit_events` is a parallel event stream
**Problem**: `unit_events` captures live state changes (job change, mood shift, death), while `history_events` captures legends events. When a dwarf dies in-game, it becomes both a `unit_event` AND (after legends export) a `HIST_FIGURE_DIED` in `history_events`. Two separate event systems create a split narrative.
**Fix**: Add a `source` column to distinguish origin (`legends_xml`, `live_bridge`, `worldgen`). For events that exist in both, add `unit_event_id` FK to `unit_events` for reconciliation. Alternatively, keep `unit_events` as a high-frequency ephemeral stream (per-tick deltas) and periodically promote significant events into `history_events` with a `source='live'` marker.
**Recommendation**: Keep both tables but add reconciliation. `unit_events` is the high-frequency CDC (change data capture) stream; `history_events` is the curated narrative record. A reconciliation job maps live deaths/battles to their eventual history_event IDs.

#### V3: Entity-to-entity relationships missing
**Problem**: Memory has `entity_entity_link` (PARENT, CHILD, RELIGIOUS with strength), but CDM has no table for civ-to-civ relationships. A goblin dark fortress's vassal relationship to its parent civilization is invisible.
**Fix**: New `entity_entity_links` table: `(world_id, source_entity_id, target_entity_id, link_type, strength)`.

#### V4: Entity-to-site relationships are flattened
**Problem**: Only `sites.owner_entity_id` exists. Memory has rich `entity_site_link` with 20+ flags (capital, fortress, holy_city, trade_partner, criminal_gang, reclaim, etc.) and temporal data. A religion's holy cities, a criminal gang's base of operations, a merchant company's trade routes — all invisible.
**Fix**: New `entity_site_links` table: `(world_id, entity_id, site_id, link_type, flags JSONB, start_year, end_year, link_strength)`.

#### V5: Art images have no CDM table
**Problem**: `art_image` (artwork descriptions with elements and properties — "a dwarf killing a dragon in jade") referenced by events and artifacts but not stored in CDM. These are the actual visual descriptions of engravings, statues, etc.
**Fix**: New `art_images` table or store in `artifacts.details` / `structures.details` JSONB depending on context. Low priority for Phase 3.

### 13.3 CONNECT Strategy — The Bridge Pattern

The core CONNECT architecture for live integration:

```
LEGENDS DATA (XML export, batch)          LIVE DATA (DFHack bridge, real-time)
─────────────────────────────────         ────────────────────────────────────
historical_figures ←─── hist_fig_id ──→ units
  (birth, death, links)                    (position, job, mood, personality)
                                           │
entities ←─── civ_id ─────────────────→ units.civ_id
  (civ name, type, race)                   │
                                           │
history_events ←── reconciliation ───→ unit_events
  (curated narrative)                      (CDC stream, per-tick deltas)
                                           │
fortress_denizens ←─ unit_id + hf_id ──→ Both
  (narrative registry, lifecycle tracking)
```

**Key Principle**: Every live data record MUST have a FK back to a legends entity. If a live unit has no `hist_fig_id`, it's a "disconnected unit" (animal, visitor without HF record) and should be tracked in `units` but NOT in `fortress_denizens` until a HF link is established.

---

## 14. Extraction Priority Tiers

### Tier 1: Critical (Must-Have for Phase 3)
- Live unit state (position, job, status) → `units` table
- Personality/soul deep extraction → `units.details` JSONB
- Entity-site relationships → new `entity_site_links` table
- Entity-entity relationships → new `entity_entity_links` table
- Death cause enrichment from incidents → `units.death_cause`
- Worldgen monitoring → `worldgen_snapshots`

### Tier 2: Important (Should-Have)
- Family chain extraction (HF links with strength) → `hf_links.strength`
- Military squad data → new `squads` table
- Army tracking → entity details JSONB
- Population demographics → entity/site details JSONB
- Belief systems → new table
- Cultural identities → new table

### Tier 3: Nice-to-Have (Defer if needed)
- Item definitions / crafting recipes
- Detailed territory coordinates
- Trade/economy state
- Crime/evidence tracking
- Detailed wound/scar data
- Wildlife populations per region
