# Unit ↔ Historical Figure Field Mapping

## Purpose

Units (live game entities) and Historical Figures (legends data) often represent the same person. This mapping defines which fields exist on each, which overlap, and which source is authoritative — enabling the LLM storyteller to merge both views into a unified "person" when generating narratives.

## Linkage

- `units.hist_fig_id` → `historical_figures.id` (within same `world_id`)
- Not all units have HF records (born after legends export)
- Not all HFs have unit records (dead, off-map, or non-fortress entities)

## Field Mapping

### Both (overlapping)

| Field | Unit Source | HF Source | Authoritative |
|-------|-----------|----------|---------------|
| Name (Dwarvish) | `units.name` | `historical_figures.name` | Unit (live, may change) |
| Name (English) | `units.english_name` | — | Unit only |
| Race | `units.race` | `historical_figures.race` | Either (should match) |
| Caste | `units.caste` | `historical_figures.caste` | Either (should match) |
| Birth year | `units.birth_year` | `historical_figures.birth_year` | HF (canonical) |
| Death year | — | `historical_figures.death_year` | HF only |
| Death cause | `units.death_cause` | `historical_figures.death_cause` | HF (richer text) |
| Sex | `units.sex` (0=M, 1=F) | `historical_figures.caste` | Unit (numeric) |
| Alive status | `units.is_alive` | `death_year IS NULL` | Unit (real-time) |
| Civilization | `units.civ_id` | `historical_figures.entity_id` | Unit (may change) |
| Relationships | `units.details.relationships` (9 slots) | `hf_links` table | HF (comprehensive) |
| Entity memberships | — | `hf_entity_links` table | HF only |
| Position history | — | `hf_position_links` table | HF only |

### Unit-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Profession | `units.profession` | Current job assignment |
| Position (x,y,z) | `units.pos_x/y/z` | Real-time map coordinates |
| Skills | `units.details.skills[]` | Full skill list with levels + XP |
| Labors | `units.details.labors[]` | Active labor assignments |
| Personality traits | `units.details.personality.traits{}` | 50 facets, 0-100 scale |
| Values | `units.details.personality.values[]` | Core value priorities |
| Needs | `units.details.personality.needs[]` | Need satisfaction levels |
| Dreams/goals | `units.details.personality.dreams[]` | Life aspirations |
| Physical attributes | `units.details.physical_attrs{}` | STR, AGI, etc. (6) |
| Mental attributes | `units.details.mental_attrs{}` | Analytical, Focus, etc. (12+) |
| Stress level | Bridge `unit_summary` | Current stress counter |
| Mood | Bridge `unit_summary` | Strange mood status |
| Squad | `units.details.squad_id` | Military assignment |
| Old year (lifespan) | `units.details.old_year` | Expected death year |
| Cultural identity | `units.details.cultural_identity` | Cultural group beyond civ |

### HF-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Kill count | `historical_figures.kill_count` | Lifetime kills |
| Event count | `historical_figures.event_count` | Historical events involved in |
| Type flags | `is_deity, is_vampire, ...` | 6 boolean flags |
| Identities | `identities` table | Assumed names/disguises |
| Site links | `hf_site_links` table | Home, lair, prison, etc. |
| Spheres | `historical_figures.details` | Deity spheres of influence |
| Written works | Events table | Authored books/compositions |
| Reputation | Events table | Derived from event participation |

## Unified Person Schema (for LLM)

```json
{
  "name": "Urist McHammer",
  "english_name": "Suntin",
  "race": "Dwarf",
  "caste": "Female",
  "birth_year": 23,
  "age": 127,
  "is_alive": true,
  "profession": "Legendary Miner",
  "civilization": "The Dagger of Feasting",

  "relationships": [
    {"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345},
    {"type": "Mother", "name": "Urvad Glazedchest", "hf_id": 12346}
  ],

  "personality": {
    "notable_traits": ["Very brave", "Very curious", "Somewhat anxious"],
    "values": ["Family", "Craftsmanship"],
    "unmet_needs": ["Socialize", "Practice martial art"],
    "dreams": ["Start a family (accomplished)", "Master a skill"]
  },

  "positions_held": [
    {"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}
  ],

  "skills": [
    {"name": "Mining", "level": 20, "label": "Legendary"},
    {"name": "Hammerdwarf", "level": 12, "label": "Great"}
  ],

  "key_events": [
    {"year": 45, "type": "slew", "description": "Slew a forgotten beast"},
    {"year": 120, "type": "artifact", "description": "Created Asën Nidostdishmab"}
  ],

  "sources": {
    "unit_id": 567,
    "hf_id": 12340,
    "world_id": 8
  }
}
```

## Merge Strategy

1. Start with Unit data (always fresher for live entities)
2. Overlay HF data for historical depth (relationships, events, positions)
3. For conflicts, prefer Unit for real-time state, HF for historical facts
4. Personality data is Unit-only (not in legends XML)
5. Event history comes from TWO sources: HF events (legends XML) + live-generated events (watcher state transitions) — both stored in `history_events` table, distinguished by `live_generated` flag and `source` column (see PRD v2.1 Section 5)
6. If unit has no HF record and is an embark dwarf: flag `embark: true` — personality and skills available, event history grows from live event generation
7. The `fortress_denizens` registry tracks fortress relevance (status, NVS, embark flag) and serves as the routing layer for the agentic storyteller — it determines which beings the LLM prioritizes

---

*Created 2026-02-23, Session 33*
*Updated 2026-02-23, Session 34 — corrected event history source (was HF-only, now HF + live), added denizen registry reference*
