# Consolidation: Knowledge Horizon & Unit-HF Data Model

## Source Documents

- `designs/knowledge-horizon.md`: Design specification for a dynamic PostgreSQL view-based masking system that restricts the LLM storyteller's access to Chronicler database records based on what a given fortress would realistically know about the world.
- `designs/unit-hf-field-mapping.md`: Field-level mapping and merge strategy for unifying live Unit records (from DFHack memory read) with Historical Figure records (from Legends XML) into a single "person" schema for LLM consumption.

---

## Features & Requirements

### Knowledge Horizon — Dynamic Database Masking

#### Core Concept
- The Knowledge Horizon is a dynamic masking system that limits the LLM's effective search space within the Chronicler database.
- Instead of exposing all ~1.65M CDM records across 35 tables, the mask exposes only data relevant to the fortress and its inhabitants.
- The mask grows organically as in-game conditions change (migrants arrive, squads raid, diplomats visit, artifacts are acquired, wars are declared).

#### Goals
- Reduce LLM search space so the LLM can be more thorough in sequential queries.
- Prevent the LLM from drawing inferences based on information a fortress would not logically possess.
- Dynamically expand the mask as the game state changes.
- Treat the Knowledge Horizon as an in-world limitation, not a system limitation (the LLM should represent ignorance as in-world uncertainty).

#### Masking Dimensions

**Geographic Scope**
- Always visible: The region containing the fortress; adjacent regions.
- Masked by default: Distant regions; other continents.
- Revealed by: Migrants from distant sites; trade caravan origins; raid targets.

**Civilization Scope**
- Always visible: The fortress's parent civilization structure (government type, notable positions).
- Masked by default: Internal details of foreign civilizations.
- Revealed by: Diplomatic contact; wars; raids on foreign sites.

**Individual Scope**
- Always visible: All fortress inhabitants (units table); their direct family.
- Masked by default: Individuals with no connection to fortress denizens.
- Revealed by: Arrival at fortress; family connection to a resident; organizational overlap.

#### Visibility Caveats (7 Rules)

**CAV-001: Organization Membership Propagation** (Status: Always visible with restrictions)
- Connections through shared organizations elevate visibility with nuance:
  - Cults / Secret Societies: A member carries knowledge of all other members of that cult.
  - Military Squads: Members know their squad-mates and chain of command.
  - Guilds / Craft Groups: Members know other guild members at the same site.
  - Religious Orders: Members know other worshippers of the same deity at nearby sites.
  - Civilization (broad): Members do NOT carry knowledge of every single civilization member.
- Rationale: A cult is small and secretive; a civilization has thousands of members — no individual carries a mental model of all of them.

**CAV-002: Civilization Nobles and Administrators** (Status: Always visible)
- All civilization members should carry knowledge of:
  - Civilization-level nobles (king, queen, duke, baron, etc.).
  - Administrators (bookkeeper, manager, expedition leader).
  - Law-givers and military commanders.
- These are public figures whose roles are known civilization-wide.

**CAV-003: Previous Residence Knowledge** (Status: Always visible)
- A dwarf carries knowledge of all inhabitants of their previous residences (sites where they lived before migrating to the fortress).
- Includes: Other residents who lived there concurrently; notable structures and site features; local government and notable figures.
- Derivation: Cross-reference `hf_site_links` for previous residencies, then expose all HFs with overlapping site links at those sites.

**CAV-004: Starting Dwarf Background Generation** (Status: Requires implementation — new game process)
- Dwarf Fortress starting dwarves (the initial 7) do not have historical figure backgrounds — they exist only as units, not as entries in the legends data, creating a knowledge gap.
- Proposed heuristic:
  1. Check known relationships of starting dwarves (spouse, children via unit data).
  2. Assign parentage from the civilization's HF pool based on name/race matching.
  3. Assign previous residency to the civilization's capital or a nearby site.
  4. Generate synthetic `hf_site_links` and `hf_links` entries for these dwarves.
  5. Mark synthetic entries with a `source = 'inferred'` flag so they are distinguishable from legends data.
- Trigger: Run on first `chronicler watch` cycle for a new fortress (when unit count <= 7 and no HF matches exist).

**CAV-005: Family Chain Propagation** (Status: Always visible, depth-limited)
- Family relationships propagate visibility transitively with depth limits:
  - Depth 1 (spouse, children, parents): Always visible.
  - Depth 2 (siblings, grandparents, in-laws): Visible if alive.
  - Depth 3+ (extended family): Masked unless another caveat reveals them.

**CAV-006: Event-Based Revelation** (Status: Dynamic)
- Certain history events unmask previously hidden data:
  - War declaration: Reveals the enemy entity's leadership, sites, and military.
  - Caravan arrival: Reveals the sending civilization's trade goods and diplomats.
  - Migrant wave: Reveals each migrant's previous site and social connections.
  - Raid/expedition return: Reveals sites visited and entities encountered.
  - Artifact acquisition: Reveals the artifact's creation history and previous owners.

**CAV-007: LLM Inference Restrictions** (Status: Permanent rule)
- The LLM must be instructed:
  - Do NOT infer events or relationships not present in the unmasked data.
  - Do NOT speculate about masked regions or civilizations.
  - When asked about unknown areas, state that the fortress has no intelligence on that topic.
  - Treat the Knowledge Horizon as an in-world limitation, not a system limitation.

---

### Unit ↔ Historical Figure Data Model

#### Core Concept
- Units (live game entities from DFHack memory) and Historical Figures (legends XML data) often represent the same person.
- The mapping defines which fields exist on each, which overlap, and which source is authoritative — enabling the LLM storyteller to merge both views into a unified "person" for narrative generation.

#### Linkage Mechanism
- `units.hist_fig_id` → `historical_figures.id` (within same `world_id`).
- Not all units have HF records (born after legends export date).
- Not all HFs have unit records (dead, off-map, or non-fortress entities).

#### Overlapping Fields (Both Sources)

| Field | Unit Source | HF Source | Authoritative |
|-------|-------------|-----------|---------------|
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

#### Unit-Only Fields

| Field | Source | Notes |
|-------|--------|-------|
| Profession | `units.profession` | Current job assignment |
| Position (x,y,z) | `units.pos_x/y/z` | Real-time map coordinates |
| Skills | `units.details.skills[]` | Full skill list with levels + XP |
| Labors | `units.details.labors[]` | Active labor assignments |
| Personality traits | `units.details.personality.traits{}` | 50 facets, 0–100 scale |
| Values | `units.details.personality.values[]` | Core value priorities |
| Needs | `units.details.personality.needs[]` | Need satisfaction levels |
| Dreams/goals | `units.details.personality.dreams[]` | Life aspirations |
| Physical attributes | `units.details.physical_attrs{}` | STR, AGI, etc. (6 attributes) |
| Mental attributes | `units.details.mental_attrs{}` | Analytical, Focus, etc. (12+ attributes) |
| Stress level | Bridge `unit_summary` | Current stress counter |
| Mood | Bridge `unit_summary` | Strange mood status |
| Squad | `units.details.squad_id` | Military assignment |
| Old year (lifespan) | `units.details.old_year` | Expected death year |
| Cultural identity | `units.details.cultural_identity` | Cultural group beyond civ |

#### HF-Only Fields

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

---

## Implementation Details

### Knowledge Horizon — Database Architecture

**Preferred Approach: View-Based Masking**
- Create PostgreSQL views that filter base tables through a `visibility` predicate.
- Example:
  ```sql
  CREATE VIEW visible_historical_figures AS
  SELECT * FROM historical_figures
  WHERE id IN (SELECT hf_id FROM knowledge_horizon WHERE visible = true);
  ```
- The `knowledge_horizon` table stores per-HF (and per-entity, per-site) visibility flags, updated by the watcher when new data arrives.
- Applies to: historical figures, entities, sites — at minimum.

**Alternative Approach: Materialized Subset**
- Copy visible rows into shadow tables, refreshed on each watcher cycle.
- Pros: Faster queries.
- Cons: Higher storage cost; sync complexity.

**Recommended Path**: Start with view-based masking — simpler, no data duplication, naturally consistent. If query performance becomes an issue at 60K+ HFs, add materialized views with incremental refresh.

**Exploration Prerequisites** (must be done before implementation):
1. Map organization types present in `entities` and `hf_entity_links`.
2. Count HFs per organization type to size the visibility tiers.
3. Trace a sample dwarf's connections through `hf_links`, `hf_site_links`, `hf_entity_links` to validate propagation rules.
4. Identify starting dwarves in the `units` table that lack HF matches.

### Unit-HF Merge — Unified Person Schema

The LLM is served a single merged JSON "person" object:

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

### Unit-HF Merge Strategy (6 Rules)
1. Start with Unit data (always fresher for live entities).
2. Overlay HF data for historical depth (relationships, events, positions).
3. For conflicts: prefer Unit for real-time state; prefer HF for historical facts.
4. Personality data is Unit-only (not present in legends XML).
5. Event history comes from TWO sources: HF events (legends XML) + live-generated events (watcher state transitions). Both stored in `history_events` table, distinguished by `live_generated` flag and `source` column (see PRD v2.1 Section 5).
6. If a unit has no HF record and is an embark dwarf: flag `embark: true` — personality and skills are available; event history grows from live event generation forward.

### Fortress Denizens Registry
- The `fortress_denizens` registry tracks fortress relevance: status, NVS (narrative visibility score), and embark flag.
- Serves as the routing layer for the agentic storyteller — determines which beings the LLM prioritizes.
- Is the authoritative source for "who is currently relevant to the fortress."

### Integration Between the Two Systems
- The Knowledge Horizon masking system determines WHICH historical figures are visible to the LLM.
- The Unit-HF field mapping determines HOW those visible figures are presented to the LLM (merged person schema).
- The `fortress_denizens` registry is the bridge: it identifies fortress-relevant units, the merge layer produces their unified person objects, and the knowledge horizon governs which external HFs are reachable from those persons via relationship traversal.
- Starting dwarves (CAV-004) and embark dwarves (Merge Rule 6) share the same problem: no HF record. Both require synthetic data generation with `source = 'inferred'` flags.
- CAV-003 (Previous Residence Knowledge) directly uses `hf_site_links` — the same table that appears in the HF-only fields of the field mapping document.

---

## Status & Completion

### Knowledge Horizon
- **Status**: Design complete; implementation not yet begun.
- **Prerequisites**: Database exploration queries (4 tasks listed) must be run first.
- **Trigger for implementation**: When the LLM storyteller is being integrated with live database queries.
- **Created**: 2026-02-22, Session 32.

### Unit-HF Field Mapping
- **Status**: Design complete and revised; implementation partially in place (CDM schema exists with `units` and `historical_figures` tables; `history_events` table supports dual-source events).
- **Revision history**:
  - Created 2026-02-23, Session 33.
  - Updated 2026-02-23, Session 34: corrected event history source (was HF-only, now HF + live); added denizen registry reference.
- **Open work**: The `fortress_denizens` registry integration, NVS scoring, and embark dwarf handling are designed but not confirmed as fully implemented.

---

## Key Decisions & Design Choices

### Knowledge Horizon Decisions
- **View-based masking preferred over shadow/materialized tables**: Avoids data duplication and sync complexity; naturally consistent with live data. Materialized views are the performance escape hatch if needed at 60K+ HF scale.
- **Civilization-broad membership does NOT propagate visibility**: A civilization has thousands of members — no individual carries a mental model of all of them. Cults and squads are small and do propagate because members realistically know each other.
- **Family depth cap at 3**: Extended family beyond depth 2 is masked unless another caveat independently reveals them — prevents unbounded graph traversal.
- **Synthetic HF records for starting dwarves**: Because the initial 7 dwarves have no legends records, heuristic inference is required. These records are flagged `source = 'inferred'` to distinguish them from canonical legends data.
- **In-world framing of ignorance**: The LLM must present masked knowledge as the fortress genuinely not knowing, not as a system limitation. This preserves narrative immersion.
- **Knowledge Horizon as a `knowledge_horizon` table**: A dedicated table with per-entity/per-HF/per-site visibility flags, updated by the watcher loop — not a one-time static filter.

### Unit-HF Merge Decisions
- **Unit is authoritative for real-time state; HF is authoritative for historical facts**: This resolves the majority of field conflicts cleanly without case-by-case logic.
- **Personality is Unit-only**: Legends XML does not contain personality data. There is no HF-side override.
- **Dual-source event history**: The `history_events` table stores both legends-derived events and live watcher-generated events in the same schema, distinguished by `live_generated` flag and `source` column. This allows seamless narrative generation across pre-game history and in-game events.
- **Embark dwarf flag (`embark: true`)**: Embark dwarves (unit count <= 7, no HF record) are a known data gap. They are flagged explicitly rather than silently having missing history, allowing the storyteller to handle them with appropriate narrative framing.
- **`fortress_denizens` as routing layer**: The registry is the single source of truth for "who matters to the fortress right now" — preventing the LLM from treating every HF in the visible set as equally narrative-relevant.

---

## Metrics & Targets

### Knowledge Horizon
- **Total CDM records**: ~1.65M across 35 tables (the full unmasked dataset).
- **Target HF scale**: 60K+ HFs is the threshold at which view-based masking may need upgrading to materialized views for query performance.
- **Visibility tier sizing**: To be determined by the exploration prerequisite queries (count HFs per organization type).

### Unit-HF Data Model
- **Personality traits**: 50 facets, each on a 0–100 scale.
- **Physical attributes**: 6 attributes (STR, AGI, etc.).
- **Mental attributes**: 12+ attributes (Analytical, Focus, etc.).
- **Unit relationship slots**: 9 slots in `units.details.relationships`.
- **HF type flags**: 6 boolean flags (is_deity, is_vampire, etc.).
- **Reference world**: "Namoram" — PostgreSQL `chronicler` database, 109K records, as of Session 33–34.
