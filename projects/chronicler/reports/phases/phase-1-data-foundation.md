# Phase 1: Data Foundation -- PRD/Roadmap

**Version**: 1.0
**Date**: 2026-02-25
**Phase Duration**: 3-4 weeks
**Milestone**: M1 -- Data Complete
**Entry State**: v0.8 -- 35 tables, 8/14+ XML sections parsed, 1.65M records across 3 worlds
**Exit State**: 40+ tables, all 15+ XML sections parsed (including creature_raw), post-parse pipeline running, creature dictionary populated, all entity types and fields complete, all worlds re-ingested and validated

**Parent Document**: Full Project Roadmap (full-project-roadmap.md)
**Requirements Covered**: REQ-CDM-001 through CDM-013, REQ-ETL-001 through ETL-004, REQ-SCR-001 through SCR-008

---

## 1. Phase Overview

Phase 1 establishes the complete data foundation upon which all other Chronicler features depend. No explorer page, narrative template, or visualization can be built until the underlying data is fully parsed, cross-referenced, and available in PostgreSQL. This phase transforms the CDM from its current 35-table, 8-section state into a comprehensive 40+ table schema with all 14+ XML sections parsed and a 10-step post-parse processing pipeline that resolves cross-references, derives flags, and computes importance scores.

### 1.1 Why This Phase Is Critical

- **Explorer pages (Phase 2)** need all entity types and fields populated before detail pages can be designed
- **Narrative templates (Phase 3)** need all 144 event types available with fully resolved entity references
- **Visualizations (Phase 4)** need geographic data (regions, landmasses, rivers, world constructions) for map layers
- **Knowledge Horizon (Phase 5)** needs the complete HF field set for visibility propagation rules
- **Scoring formulas** need kill lists, family links, and artifact ownership to compute meaningful importance scores

### 1.2 Current State Assessment

**What exists (v0.8)**:
- `xml_parser.py` (733 lines) with `lxml.etree.iterparse` streaming
- Dual-file merge (legends.xml + legends_plus.xml) with ID-based matching
- 8 parsed sections: sites, artifacts, regions, underground_regions, historical_figures, entities, history_events, history_event_collections, written_contents, historical_eras
- PostgreSQL CDM with 35 tables, composite PKs `(world_id, id)`, JSONB details columns
- 3 worlds ingested: total 1.65M records (Namoram is primary test world)
- Importance scores computed for HFs, sites, artifacts using df-narrator formulas
- 131-test suite, 0.19s execution

**What is missing**:
- 4 entity type tables (world_constructions, art_forms, identities, rivers)
- 2 incomplete tables (landmasses, mountain_peaks -- missing fields)
- 2 new system tables (worldgen_snapshots, world_modpacks)
- ~20 HF fields (active_interactions, spheres, goals, skills with XP, extended links, kills, whereabouts, etc.)
- 6+ unparsed XML sections
- Post-parse processing pipeline (10 steps)
- Referential integrity validation

---

## 2. Stage 1.1: CDM Schema Extensions

**Duration**: 1 week
**Dependencies**: None (can start immediately)
**Deliverables**: SQL migrations + SQLAlchemy models for all new tables and columns

### 2.1 New Entity Type Tables

#### Task 1.1.1: `world_constructions` Table

**Requirement**: REQ-CDM-006
**Priority**: P1

```sql
CREATE TABLE world_constructions (
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    id INTEGER NOT NULL,
    name TEXT,
    type TEXT,  -- road, bridge, tunnel
    coords TEXT,  -- pipe-delimited coordinate pairs (DF format)
    details JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE INDEX idx_world_constructions_type ON world_constructions(world_id, type);
CREATE INDEX idx_world_constructions_name ON world_constructions(world_id, name);
```

**Implementation notes**:
- World constructions in DF are roads, tunnels, and bridges connecting sites
- The `coords` field stores pipe-delimited coordinate pairs matching the DF export format
- The `type` field is TEXT (not enum) to handle any future construction types DF adds
- Details JSONB stores: start_site_id, end_site_id, path_coordinates (array), material, builder_entity_id

**XML source**: `<world_constructions>` section in legends_plus.xml
**Reference**: LegendsBrowser2 `world_construction.go`, LegendsViewer-Next `WorldConstruction.cs`

**Acceptance criteria**:
- Migration applies cleanly on all 3 existing worlds
- SQLAlchemy model matches table schema
- Model includes relationship definitions to worlds table

#### Task 1.1.2: `art_forms` Table

**Requirement**: REQ-CDM-006
**Priority**: P1

```sql
CREATE TABLE art_forms (
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    id INTEGER NOT NULL,
    name TEXT,
    form_type TEXT NOT NULL,  -- 'dance', 'musical', 'poetic'
    description TEXT,
    details JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE INDEX idx_art_forms_type ON art_forms(world_id, form_type);
CREATE INDEX idx_art_forms_name ON art_forms(world_id, name);
```

**Implementation notes**:
- DF exports three separate XML sections: `<dance_forms>`, `<musical_forms>`, `<poetic_forms>`
- All three are stored in a single `art_forms` table with `form_type` discriminator
- The `description` field contains the DF-generated description of the form
- Details JSONB stores: origin_entity_id, origin_hf_id, year_created, styles (array), instruments (for musical), rhythms (for dance), structure (for poetic)

**XML source**: `<dance_forms>`, `<musical_forms>`, `<poetic_forms>` in legends_plus.xml
**Reference**: LegendsBrowser2 `dance_form.go`, `musical_form.go`, `poetic_form.go`

**Acceptance criteria**:
- All three form types stored in single table
- `form_type` constraint allows only 'dance', 'musical', 'poetic'
- Details JSONB captures form-specific fields per type

#### Task 1.1.3: `identities` Table

**Requirement**: REQ-CDM-006
**Priority**: P1

```sql
CREATE TABLE identities (
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    id INTEGER NOT NULL,
    name TEXT,
    race TEXT,
    caste TEXT,
    birth_year INTEGER,
    birth_seconds72 INTEGER,
    profession TEXT,
    hf_id INTEGER,  -- FK to the HF who assumed this identity
    entity_id INTEGER,  -- FK to associated entity
    details JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE INDEX idx_identities_hf ON identities(world_id, hf_id);
CREATE INDEX idx_identities_name ON identities(world_id, name);
```

**Implementation notes**:
- Identities are false identities assumed by historical figures (vampires, spies, etc.)
- Critical for vampire/intrigue narrative: the HF's "real" identity vs. their cover identity
- `hf_id` links to the HF who uses this identity
- `entity_id` links to the entity the identity is associated with (e.g., the civilization the spy infiltrated)
- Details JSONB stores: nemesis_id, active_since_year, replaced_identity_id

**XML source**: `<identities>` in legends_plus.xml
**Reference**: LegendsBrowser2 `identity.go`, LegendsViewer-Next `Identity.cs`

**Acceptance criteria**:
- HF-to-identity linkage via `hf_id` is correct
- Identity chains are navigable (identity replaced another identity)

#### Task 1.1.4: `rivers` Table

**Requirement**: REQ-CDM-006
**Priority**: P1

```sql
CREATE TABLE rivers (
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    id INTEGER NOT NULL,
    name TEXT,
    name_english TEXT,
    path TEXT,  -- pipe-delimited coordinate pairs for river path
    end_type TEXT,  -- ocean, lake, underground, etc.
    details JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);

CREATE INDEX idx_rivers_name ON rivers(world_id, name);
```

**Implementation notes**:
- Rivers in DF have a path (series of coordinates) and an end type
- The `path` field stores pipe-delimited coordinate pairs matching the DF export format
- Rivers are used for map visualization (polyline layer)
- Rivers connect to sites (some sites are on rivers), but this is derived from proximity rather than explicit FK
- Details JSONB stores: source_coordinates, width_estimates, elevation_changes

**XML source**: `<rivers>` in legends_plus.xml (stub in some versions)
**Reference**: LegendsBrowser2 has river stub; LegendsViewer-Next has partial river handling

**Acceptance criteria**:
- River path coordinates parsed correctly
- River names translated (both DF-language and English)

### 2.2 Complete Existing Tables

#### Task 1.1.5: Complete `landmasses` and `mountain_peaks`

**Requirement**: REQ-CDM-006
**Priority**: P1

**Current state**: Both tables exist but are missing fields from legends_plus.xml.

**Additions for `landmasses`**:
```sql
ALTER TABLE landmasses ADD COLUMN IF NOT EXISTS coord_1 TEXT;  -- bounding box corner 1
ALTER TABLE landmasses ADD COLUMN IF NOT EXISTS coord_2 TEXT;  -- bounding box corner 2
```

**Additions for `mountain_peaks`**:
```sql
ALTER TABLE mountain_peaks ADD COLUMN IF NOT EXISTS height INTEGER;  -- elevation
ALTER TABLE mountain_peaks ADD COLUMN IF NOT EXISTS is_volcano BOOLEAN DEFAULT FALSE;
```

**Implementation notes**:
- Landmasses need bounding box coordinates for map rectangle rendering
- Mountain peaks need height for potential elevation-based rendering and volcano flag for map markers
- These fields exist in legends_plus.xml but were skipped in the initial parser implementation

**Acceptance criteria**:
- All existing records updated with new fields on re-ingestion
- No data loss for existing fields

### 2.3 HF Field Extensions

#### Task 1.1.6: Extend `historical_figures` with High-Priority Fields

**Requirement**: REQ-CDM-007
**Priority**: P1

This is the most impactful single task in Phase 1. The HF table currently captures 18 columns. After this extension, it will capture 30+ discrete data points, with complex nested data in JSONB.

**New columns**:
```sql
ALTER TABLE historical_figures
    ADD COLUMN IF NOT EXISTS spheres TEXT[],  -- deity spheres array
    ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '[]',  -- life goals with accomplishment status
    ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]',  -- skills with id, rating, XP
    ADD COLUMN IF NOT EXISTS kills JSONB DEFAULT '{}',  -- kill records (notable + other)
    ADD COLUMN IF NOT EXISTS whereabouts JSONB DEFAULT '{}',  -- current location data
    ADD COLUMN IF NOT EXISTS entity_reputations JSONB DEFAULT '[]',  -- reputation across entities
    ADD COLUMN IF NOT EXISTS intrigue_actors JSONB DEFAULT '[]',  -- intrigue system data
    ADD COLUMN IF NOT EXISTS used_identities JSONB DEFAULT '[]',  -- false identity IDs
    ADD COLUMN IF NOT EXISTS journey_pets JSONB DEFAULT '[]',  -- companion animals
    ADD COLUMN IF NOT EXISTS holds_artifact INTEGER[];  -- artifact IDs currently held

CREATE INDEX idx_hf_spheres ON historical_figures USING gin(spheres);
```

**HF fields stored in `details` JSONB (overflow)**:
- `breed_id`, `cultural_identity`, `family_head_id`
- `orientation_flags`
- `curse_year`, `curse_seconds`
- `personality` (values, ethics, mannerisms -- 70+ mannerism types)
- `knowledge_profile` (known secrets, books, belief systems)
- `vague_relationships` and `relationship_profiles`

**Implementation notes**:
- `spheres` uses PostgreSQL native TEXT array for GIN indexing (enables queries like "find all deities with DEATH sphere")
- `goals` JSONB structure: `[{"type": "MASTER_SKILL", "skill": "AXE", "accomplished": false}]`
- `skills` JSONB structure: `[{"id": 42, "name": "AXE", "rating": 15, "xp": 28000}]`
- `kills` JSONB structure: `{"notable": [{"hf_id": 123, "type": "SHOT"}], "other": 47}`
- `whereabouts` JSONB structure: `{"state": "settled", "site_id": 456, "subregion_id": null}`
- `entity_reputations` JSONB: `[{"entity_id": 789, "type": "HERO", "severity": 3}]`

**Reference**: LegendsBrowser2 `historicalfigure.go` (127 fields parsed), LegendsViewer-Next `HistoricalFigure.cs` (115+ fields)

**Acceptance criteria**:
- All high-priority HF fields populated from legends_plus.xml
- GIN index on spheres enables deity-sphere queries
- Skills JSONB includes XP points from `info.skills.points[]` parallel array
- Existing HF data (18 columns) is preserved during migration

#### Task 1.1.7: Add `active_interactions` for Supernatural Detection

**Requirement**: REQ-CDM-007, REQ-SCR-008
**Priority**: P1

```sql
ALTER TABLE historical_figures
    ADD COLUMN IF NOT EXISTS active_interactions TEXT[];

CREATE INDEX idx_hf_interactions ON historical_figures USING gin(active_interactions);
```

**Implementation notes**:
- `active_interactions` contains interaction type strings: "VAMPIRE", "NECROMANCER", "WEREBEAST"
- This is the primary mechanism for supernatural detection (REQ-SCR-008)
- Currently, `is_vampire`, `is_necromancer`, `is_werebeast` flags are derived during ingestion; with `active_interactions`, we can also derive "since when" and "who turned them"
- The existing boolean flags should be maintained as convenience columns, computed from active_interactions during post-parse processing

**Detection logic** (from research synthesis):
```python
# Vampire: "VAMPIRE" in any active_interaction string
# Necromancer: "NECROMANCER" or "RAISE" in any active_interaction string
# Werebeast: "WEREBEAST" in any active_interaction string
```

**Acceptance criteria**:
- GIN index enables fast supernatural-type queries
- Boolean convenience flags (`is_vampire`, etc.) are re-derived from active_interactions in post-parse step

### 2.4 System Tables

#### Task 1.1.8: Add `worldgen_snapshots` Table

**Requirement**: REQ-CDM-010
**Priority**: P2

```sql
CREATE TABLE worldgen_snapshots (
    id SERIAL PRIMARY KEY,
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    phase TEXT NOT NULL,  -- worldgen phase name (12 states)
    progress_pct FLOAT,
    cur_year INTEGER,
    data JSONB DEFAULT '{}',
    captured_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_worldgen_world_phase ON worldgen_snapshots(world_id, phase);
CREATE INDEX idx_worldgen_captured ON worldgen_snapshots(world_id, captured_at);
```

**Implementation notes**:
- This table is used by Phase 5 (worldgen monitoring) but the schema should be created now for forward compatibility
- Each snapshot captures the state of `df.global.world.worldgen_status` at a point in time
- `phase` values: None, Terrain, ElevationMap, Rainfall, Drainage, Temperature, Volcanism, SavageryEvilness, Regions, Rivers, Civilizations, Done
- `data` JSONB stores: rivers_generated, civs_generated, megabeasts_placed, caves_placed, last_event_id, figure_count, site_count, entity_count

**Acceptance criteria**:
- Table created with all indexes
- No data populated yet (that is Phase 5 work)

#### Task 1.1.9: Add `world_modpacks` Table

**Requirement**: REQ-CDM-011
**Priority**: P3

```sql
CREATE TABLE world_modpacks (
    id SERIAL PRIMARY KEY,
    world_id INTEGER NOT NULL REFERENCES worlds(id),
    snapshot_time TIMESTAMP DEFAULT NOW(),
    modpack_name TEXT,
    mods JSONB DEFAULT '[]',  -- array of {mod_id, name, version, load_order}
    details JSONB DEFAULT '{}'
);

CREATE INDEX idx_modpacks_world ON world_modpacks(world_id);
```

**Implementation notes**:
- This table is used by Phase 6 (Mod Manager) but the schema should be created now
- Each row captures the active mod list at a point in time (typically world creation)
- `mods` JSONB array: `[{"id": "dfhack", "name": "DFHack", "version": "53.10-r1", "order": 1}]`

**Acceptance criteria**:
- Table created
- No data populated yet (that is Phase 6 work)

---

## 3. Stage 1.2: XML Parser Completion

**Duration**: 1-2 weeks
**Dependencies**: Stage 1.1 (new tables must exist before parsing into them)
**Deliverables**: Parser extensions for all missing XML sections, expanded HF field parsing

### 3.1 New Section Parsers

#### Task 1.2.1: Parse `<world_constructions>` Section

**Requirement**: REQ-ETL-003
**Priority**: P1

**XML structure** (from df-structures analysis):
```xml
<world_constructions>
  <world_construction>
    <id>0</id>
    <name>the Long Road</name>
    <type>road</type>
    <coords>42,15|43,15|44,15|45,16|46,16</coords>
  </world_construction>
</world_constructions>
```

**Implementation approach**:
- Add `_parse_world_constructions()` method to `XmlParser` class
- Use existing iterparse pattern: `for event, elem in etree.iterparse(source, events=('end',), tag='world_construction')`
- Map fields: id, name, type -> columns; all others -> details JSONB
- Call `root.clear()` after each element to maintain constant memory

**Reference implementation**: LegendsBrowser2 `world_construction.go` lines 15-67

**Acceptance criteria**:
- All world constructions parsed from legends_plus.xml
- Coordinates stored in pipe-delimited format
- Type field populated (road, bridge, tunnel)
- Record count matches LV-Next / LB2 for same world

#### Task 1.2.2: Parse `<dance_forms>`, `<musical_forms>`, `<poetic_forms>` Sections

**Requirement**: REQ-ETL-003
**Priority**: P1

**XML structure**:
```xml
<dance_forms>
  <dance_form>
    <id>0</id>
    <name>the Spiraling Whirl</name>
    <description>A spiraling dance performed by dwarves...</description>
  </dance_form>
</dance_forms>
```

**Implementation approach**:
- Add `_parse_art_forms(form_type)` method that handles all three section types
- Call three times with form_type='dance', 'musical', 'poetic'
- Set `form_type` column from the calling context, not from XML data
- Each form type may have type-specific fields (instruments for musical, rhythms for dance, structure for poetic) -- all go into details JSONB

**Reference implementation**: LegendsBrowser2 `dance_form.go`, `musical_form.go`, `poetic_form.go`

**Acceptance criteria**:
- All three form types parsed into single `art_forms` table
- `form_type` discriminator correctly set
- Form-specific fields stored in details JSONB

#### Task 1.2.3: Parse `<identities>` Section

**Requirement**: REQ-ETL-003
**Priority**: P1

**XML structure**:
```xml
<identities>
  <identity>
    <id>0</id>
    <name>Urist McFake</name>
    <race>DWARF</race>
    <caste>MALE</caste>
    <birth_year>125</birth_year>
    <birth_seconds72>100800</birth_seconds72>
    <profession>TRADER</profession>
    <histfig_id>4521</histfig_id>
    <entity_id>42</entity_id>
  </identity>
</identities>
```

**Implementation approach**:
- Add `_parse_identities()` method
- Map core fields to columns: id, name, race, caste, birth_year, birth_seconds72, profession, hf_id (from histfig_id), entity_id
- Remaining fields go to details JSONB

**Acceptance criteria**:
- Identity records linked to correct HFs via `hf_id`
- Entity association captured

#### Task 1.2.4: Parse `<rivers>` Section

**Requirement**: REQ-ETL-003
**Priority**: P1

**Implementation notes**:
- River data in legends_plus.xml varies by DF version -- some versions have minimal river data
- Parse whatever is available: id, name, path coordinates, end_type
- If the section is empty or minimal, log a warning and continue

**Acceptance criteria**:
- Rivers parsed if present in XML
- Graceful handling if section is empty/minimal

#### Task 1.2.5: Complete `<mountain_peaks>` and `<landmasses>` Parsing

**Requirement**: REQ-ETL-003
**Priority**: P1

**Implementation notes**:
- Current parser handles basic fields for both
- Extend to capture: height and is_volcano for mountain_peaks; bounding box coords for landmasses
- These fields are in legends_plus.xml

**Acceptance criteria**:
- Mountain peak height and volcano flag populated
- Landmass bounding box coordinates populated

### 3.2 Expanded HF Parsing

#### Task 1.2.6: Parse Expanded HF Fields from legends_plus.xml

**Requirement**: REQ-ETL-003, REQ-CDM-007
**Priority**: P1

This is the most complex parser extension. The HF section in legends_plus.xml contains significantly more data than legends.xml.

**Fields to parse**:

| Field Group | XML Elements | Target Column |
|-------------|-------------|---------------|
| Skills | `<skill>` elements within `<skills>` | `skills` JSONB |
| Kills | `<notable_kill>` and `<other_kill_count>` | `kills` JSONB |
| Whereabouts | `<current_state>`, `<site_id>`, `<subregion_id>` | `whereabouts` JSONB |
| Entity reputations | `<entity_reputation>` elements | `entity_reputations` JSONB |
| Active interactions | `<active_interaction>` elements | `active_interactions` TEXT[] |
| Intrigue actors | `<intrigue_actor>` elements | `intrigue_actors` JSONB |
| Used identities | `<used_identity_id>` elements | `used_identities` JSONB |
| Journey pets | `<journey_pet>` elements | `journey_pets` JSONB |
| Holds artifact | `<holds_artifact>` elements | `holds_artifact` INTEGER[] |
| Spheres | `<sphere>` elements | `spheres` TEXT[] |
| Goals | `<goal>` elements with `<accomplished>` | `goals` JSONB |
| Vague relationships | `<vague_relationship>` elements | `details` JSONB |
| Relationship profiles | `<relationship_profile_hf>` elements | `details` JSONB |

**Implementation approach**:
- Extend existing `_parse_historical_figure()` method
- For each field group, add a sub-parser that extracts the nested XML structure
- Use the pattern: check if element exists, iterate children, build structured data, assign to column
- All fields in the overflow category go to `details` JSONB as before

**Skill parsing detail**:
```python
skills = []
for skill_elem in hf_elem.findall('.//skill'):
    skill_id = int(skill_elem.findtext('id', '0'))
    rating = int(skill_elem.findtext('rating', '0'))
    xp = int(skill_elem.findtext('experience', '0'))
    skills.append({'id': skill_id, 'rating': rating, 'xp': xp})
```

**Kill parsing detail**:
```python
kills = {'notable': [], 'other': 0}
for kill_elem in hf_elem.findall('.//notable_kill'):
    kills['notable'].append({
        'hf_id': int(kill_elem.findtext('hf_id', '0')),
        'type': kill_elem.findtext('type', '')
    })
kills['other'] = int(hf_elem.findtext('other_kill_count', '0'))
```

**Reference implementation**: LegendsBrowser2 `historicalfigure.go` (process function, lines 50-250)

**Acceptance criteria**:
- All listed field groups populated
- Skills include XP points (not just rating)
- Active interactions enable supernatural detection
- Kill records include both notable (with victim HF ID) and other (count)
- No regression in existing HF field parsing

#### Task 1.2.7: Parse `<entity_populations>` Section Fully

**Requirement**: REQ-ETL-003
**Priority**: P2

**Implementation notes**:
- Entity populations track racial composition of entities/sites
- Currently partially parsed
- Full parsing includes: entity_id, race, count, site_id (if site-specific)

**Acceptance criteria**:
- All entity population records captured
- Race counts accurate

#### Task 1.2.8: Audit Dual-File Merge Rules

**Requirement**: REQ-ETL-002
**Priority**: P1

**Description**: Review the legends.xml + legends_plus.xml merge strategy against LV-Next and LB2 implementations to ensure no data is lost or overwritten incorrectly.

**Audit checklist**:
1. Verify that legends_plus.xml fields always supplement (not replace) legends.xml fields
2. Check that per-tile coordinate arrays from legends_plus replace summary coordinates from legends
3. Verify `cur_owner_id` from legends_plus takes precedence over entity references in legends
4. Check that legends_plus-only sections (identities, art_forms, etc.) are parsed from the correct file
5. Verify HF fields from legends_plus (skills, kills, etc.) supplement the legends.xml HF data

**Deliverable**: Verification report documenting all merge rules and their correctness

**Acceptance criteria**:
- Written report covering all merge edge cases
- Any discrepancies filed as bugs

---

## 4. Stage 1.3: Post-Parse Processing Pipeline

**Duration**: 1-2 weeks
**Dependencies**: Stage 1.2 (all sections must be parsed before post-processing)
**Deliverables**: 10-step processing pipeline as a callable module

### 4.1 Pipeline Architecture

The post-parse pipeline runs after all XML sections have been ingested into PostgreSQL. It performs cross-referencing, derivation, and validation in a specific order (later steps depend on earlier steps).

```python
class PostParseProcessor:
    """Runs after XML ingestion to resolve cross-references and derive computed data."""

    def __init__(self, db_session, world_id: int):
        self.db = db_session
        self.world_id = world_id

    def run_all(self):
        """Execute all 10 processing steps in order."""
        self.step_1_resolve_family_links()
        self.step_2_resolve_position_assignments()
        self.step_3_derive_supernatural_flags()
        self.step_4_compute_site_ruin_status()
        self.step_5_build_entity_war_lists()
        self.step_6_compute_hf_kill_lists()
        self.step_7_calculate_importance_scores()
        self.step_8_build_event_entity_xref()
        self.step_9_resolve_site_ownership_history()
        self.step_10_validate_referential_integrity()
```

### 4.2 Processing Steps

#### Task 1.3.1: Step 1 -- Resolve HF-to-HF Family Links

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Process `hf_links` table to establish bidirectional family relationships.

**Algorithm**:
1. Query all `hf_links` where `link_type` IN ('Mother', 'Father', 'Child', 'Spouse')
2. For each parent link, ensure the inverse child link exists
3. For each spouse link, ensure the inverse spouse link exists
4. Build family clusters (connected components of family links)

**SQL approach**:
```sql
-- Ensure bidirectional mother links
INSERT INTO hf_links (world_id, source_hf_id, target_hf_id, link_type, details)
SELECT world_id, target_hf_id, source_hf_id, 'Child', '{}'
FROM hf_links
WHERE link_type = 'Mother' AND world_id = :world_id
ON CONFLICT DO NOTHING;
```

**Acceptance criteria**:
- All family relationships are bidirectional
- No orphaned parent/child links
- Family cluster sizes plausible (no single cluster containing >50% of HFs)

#### Task 1.3.2: Step 2 -- Resolve HF-to-Entity Position Assignments

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Process `hf_entity_links` to identify leaders, nobles, and position holders.

**Algorithm**:
1. Query all `hf_entity_links` where `link_type` = 'Position'
2. Cross-reference with `entity_positions` to resolve position names
3. Update HF details JSONB with position history (position name, entity name, start year, end year)

**Acceptance criteria**:
- All position assignments resolved to human-readable position names
- Leader/noble flags derivable from position assignments
- Position date ranges populated where available

#### Task 1.3.3: Step 3 -- Derive Supernatural Flags from Interaction Events

**Requirement**: REQ-ETL-004, REQ-SCR-008
**Priority**: P1

**Description**: Re-derive `is_vampire`, `is_necromancer`, `is_werebeast` flags from `active_interactions` column.

**Algorithm**:
```python
def step_3_derive_supernatural_flags(self):
    """Derive boolean flags from active_interactions array."""
    self.db.execute("""
        UPDATE historical_figures
        SET is_vampire = (active_interactions && ARRAY['VAMPIRE']::TEXT[]),
            is_necromancer = (active_interactions && ARRAY['NECROMANCER', 'RAISE']::TEXT[]),
            is_werebeast = (active_interactions && ARRAY['WEREBEAST']::TEXT[])
        WHERE world_id = :world_id
          AND active_interactions IS NOT NULL
          AND array_length(active_interactions, 1) > 0
    """, {'world_id': self.world_id})
```

**Also derive from events**: If `active_interactions` is empty but events contain `HfDoesInteraction` of type vampire/necromancer/werebeast targeting this HF, set the flags.

**Acceptance criteria**:
- Boolean flags match active_interactions data
- Event-based derivation catches cases where active_interactions is not populated
- Vampire/necromancer/werebeast counts match LV-Next for same world

#### Task 1.3.4: Step 4 -- Compute Site Ruin Status

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Determine which sites are ruined vs. active based on destruction/reclaim events.

**Algorithm**:
1. Query all events of type `destroyed_site`, `site_taken_over`, `reclaim_site`, `abandoned_site`
2. For each site, determine the latest state-changing event
3. Set `is_ruin` flag on sites table (add column if needed)

```sql
-- Sites destroyed and never reclaimed
UPDATE sites SET details = jsonb_set(details, '{is_ruin}', 'true')
WHERE (world_id, id) IN (
    SELECT DISTINCT ON (s.world_id, s.id) s.world_id, s.id
    FROM sites s
    JOIN history_events e ON e.world_id = s.world_id
    WHERE e.type IN ('destroyed_site', 'abandoned_site')
    AND e.details->>'site_id' = s.id::TEXT
    AND NOT EXISTS (
        SELECT 1 FROM history_events e2
        WHERE e2.world_id = s.world_id
        AND e2.type IN ('reclaim_site', 'site_taken_over')
        AND e2.details->>'site_id' = s.id::TEXT
        AND e2.year > e.year
    )
);
```

**Acceptance criteria**:
- Sites with no destruction event marked as active
- Sites with destruction but later reclaim marked as active
- Ruin count matches LV-Next for same world

#### Task 1.3.5: Step 5 -- Build Entity War Lists

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Extract war participation data from event collections and link to entities.

**Algorithm**:
1. Query all `history_event_collections` where type = 'war'
2. Extract attacker/defender entity IDs from details JSONB
3. Build war list per entity in details JSONB

```python
for war in wars:
    aggressor_id = war.details.get('aggressor_ent_id')
    defender_id = war.details.get('defender_ent_id')
    # Add war reference to both entities
```

**Acceptance criteria**:
- All wars attributed to aggressor and defender entities
- War count per entity matches expectations

#### Task 1.3.6: Step 6 -- Compute HF Kill Lists

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Build kill records from death events and HF kill data.

**Algorithm**:
1. Query all events of type where details contains a slayer HF ID
2. For each slayer, build the kill list
3. Cross-reference with HF `kills` JSONB from XML parsing
4. Reconcile (XML kills may include pre-game kills; events are game-era only)

**Acceptance criteria**:
- Kill lists include both XML-sourced and event-sourced kills
- No duplicate kills
- Kill count per HF matches expectations

#### Task 1.3.7: Step 7 -- Calculate Importance Scores

**Requirement**: REQ-ETL-004, REQ-SCR-001 through REQ-SCR-004
**Priority**: P1

**Description**: Compute importance scores for HFs, sites, artifacts, and **all entity types** (civilizations, religions, guilds, etc.).

HFs, sites, and artifacts use fixed formulas adapted from df-narrator. Entities use an **IDF-weighted event rarity scoring system** — each entity is scored by the sum of its events weighted by how rare each event type is *within its own entity type*. This means a religion that claimed an artifact (1.1% of religions) scores higher per-event than one that merely recruited members (100% of religions).

**HF, Site, Artifact Formulas** (fixed, adapted from df-narrator):
- HF: `LEAST(events*2, 500) + kills*15 + supernatural_flags + links + positions + artifacts`
- Site: `events + deaths*2 + event_collections*5 + structures*3`
- Artifact: `events*10 + named(50) + has_holder(20)`

**Entity Scoring Formula** (IDF-weighted, empirical):
```
score(entity) = Σ count(event_type_i) × max(IDF(event_type_i), floor_weight_i)
              + Σ count(link_type_j)  × max(IDF(link_type_j),  floor_weight_j)
              + Σ count(collection_k) × fixed_weight_k

where IDF(event_type_i) = log2(N_type / n_entities_with_event_i)
```

Three signal sources:
1. **Event participation** (`event_entity_xref`) — weighted by event type rarity within entity type
2. **HF membership links** (`hf_entity_links`) — weighted by link type rarity (criminals, prisoners rare = high weight)
3. **Event collection roles** (`history_event_collections`) — fixed weights for wars (15), conquests (10), beast attacks (5)

Floor weights prevent narratively important but common events from scoring zero:
- Military conflict (attacked site, field battle, destroyed site): 5.0
- Political change (entity overthrown, site taken over): 4.0
- Criminal/unusual (entity primary criminals, sneak into site): 4.0
- Structural creation (created site, created structure): 2.0

Scores are normalized per entity type to 0-1000 range for UI comparability.

**Implementation**: `chronicler/scoring.py` — `_compute_entity_scores()` with batch queries (6 queries per entity type, not per entity).

**Acceptance criteria**:
- All HFs, sites, artifacts, and entities have non-null importance scores
- Top-scoring entities are plausible (deities/forces at top for HFs; war-fighting civs at top for entities)
- Score distributions follow expected patterns (long tail with few high-importance entities)
- Entity scores normalize correctly within each type (top = 1000, bottom near 0)
- IDF weights computed dynamically — no hand-tuning required per world

#### Task 1.3.8: Step 8 -- Build Event-to-Entity Cross-Reference Index

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Create an index mapping events to all entities they reference, enabling efficient "show all events for entity X" queries.

**Approach**:
```sql
CREATE TABLE IF NOT EXISTS event_entity_xref (
    world_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,  -- 'hf', 'entity', 'site', 'artifact', 'region'
    entity_id INTEGER NOT NULL,
    role TEXT,  -- 'subject', 'object', 'location', 'artifact', etc.
    PRIMARY KEY (world_id, event_id, entity_type, entity_id)
);

CREATE INDEX idx_xref_entity ON event_entity_xref(world_id, entity_type, entity_id);
```

**Population algorithm**:
1. For each event, extract all entity references from details JSONB
2. The set of JSONB keys that reference HFs: `hf_id`, `hfid`, `slayer_hf_id`, `group_1_hfid`, `group_2_hfid`, `attacker_hfid`, `defender_hfid`, `winner_hfid`, `loser_hfid`, `hist_figure_id`, `trickster_hfid`, `target_hfid`, `snatcher_hfid`, `changee_hfid`, `changer_hfid`, `doer_hfid`, `student_hfid`, `teacher_hfid`
3. Similar key sets for sites, entities, artifacts, regions
4. Insert one xref row per (event, entity) pair

**Reference**: LegendsBrowser2 uses `HF_FIELDS` set constant; df-narrator uses it for co-appearance scoring

**Acceptance criteria**:
- All entity references in event details are indexed
- Query "SELECT * FROM event_entity_xref WHERE entity_type='hf' AND entity_id=X" returns all events involving HF X
- Index supports the rivalry detection algorithm (co-appearance counting)

#### Task 1.3.9: Step 9 -- Resolve Site Ownership History

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Build a chronological ownership history for each site from events.

**Algorithm**:
1. Query events: `created_site`, `destroyed_site`, `site_taken_over`, `reclaim_site`, `abandoned_site`
2. For each site, build ordered list of ownership changes
3. Store in site details JSONB as `ownership_history` array

```json
{
    "ownership_history": [
        {"entity_id": 42, "from_year": 1, "to_year": 250, "event": "created_site"},
        {"entity_id": 78, "from_year": 250, "to_year": 350, "event": "site_taken_over"},
        {"entity_id": null, "from_year": 350, "to_year": null, "event": "destroyed_site"}
    ]
}
```

**Acceptance criteria**:
- All sites have ownership_history populated
- Ownership transitions match event chronology
- Current owner (`cur_owner_id`) matches latest ownership entry

#### Task 1.3.10: Step 10 -- Validate Referential Integrity

**Requirement**: REQ-ETL-004
**Priority**: P1

**Description**: Verify that all FK-like references resolve to existing records.

**Validation queries**:
```sql
-- HF links referencing non-existent HFs
SELECT source_hf_id, target_hf_id FROM hf_links
WHERE world_id = :world_id
AND target_hf_id NOT IN (SELECT id FROM historical_figures WHERE world_id = :world_id);

-- Entity links referencing non-existent entities
SELECT hf_id, entity_id FROM hf_entity_links
WHERE world_id = :world_id
AND entity_id NOT IN (SELECT id FROM entities WHERE world_id = :world_id);

-- Site links referencing non-existent sites
SELECT hf_id, site_id FROM hf_site_links
WHERE world_id = :world_id
AND site_id NOT IN (SELECT id FROM sites WHERE world_id = :world_id);

-- Events referencing non-existent entities (spot check top entity fields)
SELECT id, type FROM history_events
WHERE world_id = :world_id
AND details->>'hfid' IS NOT NULL
AND (details->>'hfid')::INTEGER NOT IN (SELECT id FROM historical_figures WHERE world_id = :world_id);
```

**Tolerance**: Some broken references are expected (DF itself has referential integrity issues in edge cases). Log warnings for broken references but do not fail.

**Acceptance criteria**:
- Validation report generated with counts of broken references per table
- Broken reference rate < 0.1% of total references
- No systematic breakage (e.g., all references to a particular table broken)

---

## 5. Stage 1.4: Test Suite Extension

**Duration**: 0.5 weeks (parallel with Stages 1.2-1.3)
**Dependencies**: Stages 1.1-1.3 (test against new code)
**Deliverables**: Extended pytest suite

### Task 1.4.1: Tests for New XML Sections

**Scope**: Add at least one test per new XML section:
- `test_parse_world_constructions()`
- `test_parse_dance_forms()`
- `test_parse_musical_forms()`
- `test_parse_poetic_forms()`
- `test_parse_identities()`
- `test_parse_rivers()`
- `test_parse_mountain_peaks_extended()`
- `test_parse_landmasses_extended()`

**Approach**: Create test XML snippets for each section. Verify correct table insertion, field mapping, and JSONB details population.

### Task 1.4.2: Tests for Post-Parse Processing Steps

**Scope**: Add tests for each of the 10 processing steps:
- `test_step_1_family_links_bidirectional()`
- `test_step_2_position_resolution()`
- `test_step_3_supernatural_flag_derivation()`
- `test_step_4_site_ruin_status()`
- `test_step_5_entity_war_lists()`
- `test_step_6_hf_kill_lists()`
- `test_step_7_importance_scores()`
- `test_step_8_event_entity_xref()`
- `test_step_9_site_ownership_history()`
- `test_step_10_referential_integrity()`

**Approach**: Use test fixtures with known data relationships. Verify computed outputs match expected values.

### Task 1.4.3: Tests for New CDM Tables and Constraints

**Scope**: Verify schema integrity:
- Composite PK constraints on all new tables
- JSONB default values
- Index existence
- FK constraint behavior (cascade/restrict)

### Task 1.4.4: Re-Ingest All Worlds and Verify Record Counts

**Scope**: Full regression test:
1. Re-ingest all 3 existing worlds (Namoram + 2 others)
2. Compare record counts: new counts should be >= old counts (we are adding data, not removing)
3. Verify no data loss in existing columns
4. Verify new columns populated for all HFs
5. Verify post-parse processing completes without errors

**Acceptance criteria**:
- All 3 worlds re-ingested successfully
- Record count delta documented (expected increase from new sections)
- No regressions in existing data
- Test suite passes (target: 160+ tests, 0 failures)

---

## 6. Stage 1.5: Creature Dictionary

**Duration**: 0.5-1 week
**Dependencies**: Stage 1.1 (schema), Stage 1.2 (parser infrastructure)
**Requirement**: REQ-CDM-013, REQ-ETL-003

### Rationale

The `legends_plus.xml` file contains a `<creature_raw>` section with the complete per-world creature dictionary — every creature that exists in the world, including procedurally generated night creatures, titans, and demons. This section is currently skipped during parsing.

Without it, race values stored in `historical_figures.race` are opaque tokens like `HFEXP33187 E_HUM1`, `COLOSSUS_BRONZE`, or `TITAN_5`. The creature dictionary maps these to human-readable names ("night's wolf", "bronze colossus", "desert titan") and provides classification flags (megabeast, titan, night_creature, etc.) that Phase 2's Explorer UI needs for badges, filtering, and display.

This is per-world data: night creature experiments are unique to each world (created by specific necromancers), titans have procedural biome names, and demons have unique descriptive names. The dictionary must be rebuilt for every world ingested.

### Data Available in `<creature_raw>`

Each `<creature>` element provides:

| Field | XML Tag | Example (DWARF) | Example (Night Creature) | Example (Titan) |
|-------|---------|-----------------|--------------------------|-----------------|
| Token ID | `<creature_id>` | `DWARF` | `HFEXP2679 E_FS1` | `TITAN_5` |
| Display name | `<name_singular>` | `dwarf` | `mistake of Setoc` | `desert titan` |
| Plural name | `<name_plural>` | `dwarves` | `mistakes of Setoc` | `desert titans` |
| Classification | Boolean tags | `<mundane/>` | `<generated/>`, `<has_any_night_creature/>`, `<fanciful/>` | `<has_any_titan/>`, `<generated/>` |

**Not available in XML export** (only in live game raws): `name_adjective` (e.g., "dwarven"), `description` (flavor text), caste-specific names, body plans.

### Classification Flags

Boolean presence-tags (self-closing XML elements) provide creature classification without hardcoding:

| Flag Tag | Meaning | UI Use |
|----------|---------|--------|
| `<has_any_megabeast/>` | Roc, Dragon | Megabeast badge |
| `<has_any_titan/>` | Procedural titans | Titan badge |
| `<has_any_unique_demon/>` | World-specific demons | Demon badge |
| `<has_any_night_creature/>` | Necromancer experiments | Night creature badge |
| `<has_any_feature_beast/>` | Forgotten beasts | FB badge |
| `<generated/>` | Procedurally created | Generated indicator |
| `<occurs_as_entity_race/>` | Can form civilizations | Civilized race marker |
| `<savage/>` | Savage biome creature | Biome classification |
| `<evil/>` | Evil biome creature | Alignment badge |
| `<good/>` | Good biome creature | Alignment badge |
| `<mundane/>` | Normal animal | Filter: mundane vs interesting |
| `<fanciful/>` | Supernatural/magical | Supernatural marker |

### Tasks

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 1.5.1 | CDM-013 | Create `creature_dictionary` table: `(world_id INT, creature_id TEXT, name_singular TEXT, name_plural TEXT, flags JSONB, PRIMARY KEY (world_id, creature_id))` | SQL migration |
| 1.5.2 | ETL-003 | Parse `<creature_raw>` section from `legends_plus.xml` — extract `creature_id`, `name_singular`, `name_plural`, and all boolean classification tags into `flags` JSONB | Parser extension |
| 1.5.3 | CDM-013 | Add `get_creature_name(world_id, creature_id)` helper that returns `name_singular` from dictionary, falling back to `creature_id.replace('_', ' ').title()` if not found | Python utility |
| 1.5.4 | CDM-013 | Update `chronicler ingest` to parse creature_raw before post-parse pipeline (creature dictionary must be available for any downstream enrichment) | CLI update |
| 1.5.5 | CDM-013 | Add tests: creature dictionary populated on ingest, all HF race values resolve via dictionary, classification flags correctly extracted, fallback works for unknown creature_ids | pytest additions |

### Acceptance Criteria

- `creature_dictionary` table populated for test world "Tar Thran" with 1,879+ entries
- All 1,086 unique `historical_figures.race` values resolve to display names via dictionary lookup
- Night creature experiments (37 unique names like "night's wolf", "mistake of Setoc") correctly decoded
- Procedural titans (33 entries like "desert titan", "forest titan") correctly named
- Unique demons (11 entries like "chestnut demon", "buffalo devil") correctly named
- Classification flags (megabeast, titan, demon, night_creature, generated, entity_race, evil, good, savage, mundane, fanciful) correctly extracted as JSONB booleans
- `get_creature_name()` falls back gracefully for creature_ids not in dictionary
- Ingestion order: creature_raw parsed AFTER schema setup, BEFORE post-parse pipeline

---

## 7. Definition of Done (M1 Milestone)

Phase 1 is complete when ALL of the following are true:

### Data Schema
- [ ] 40+ CDM tables exist with correct schemas
- [ ] All new entity type tables created (world_constructions, art_forms, identities, rivers)
- [ ] Existing tables completed (landmasses, mountain_peaks)
- [ ] System tables created (worldgen_snapshots, world_modpacks)
- [ ] HF table extended with all high-priority fields
- [ ] `active_interactions` column with GIN index
- [ ] `event_entity_xref` table populated
- [ ] `creature_dictionary` table created and populated per world (REQ-CDM-013)

### XML Parser
- [ ] All 15+ XML sections parseable (including `<creature_raw>`)
- [ ] Dual-file merge rules audited and verified
- [ ] Expanded HF field parsing (skills, kills, whereabouts, reputations, interactions, etc.)
- [ ] Entity population parsing complete
- [ ] Creature dictionary parsed from `<creature_raw>` section of legends_plus.xml

### Post-Parse Pipeline
- [ ] All 10 processing steps implemented and working
- [ ] Family links bidirectional
- [ ] Supernatural flags derived from interactions
- [ ] Site ruin status computed
- [ ] War lists per entity
- [ ] Kill lists per HF
- [ ] Importance scores computed (4 formulas)
- [ ] Event-entity cross-reference index built
- [ ] Site ownership history resolved
- [ ] Referential integrity validated

### Creature Dictionary
- [ ] All HF race tokens resolve to display names via creature_dictionary
- [ ] Night creature experiments decoded to readable names
- [ ] Classification flags extracted (megabeast, titan, demon, night_creature, etc.)
- [ ] Fallback for unknown creature_ids works gracefully
- [ ] `get_creature_name()` utility available for all downstream code

### Verification
- [ ] All 3 existing worlds re-ingested with new parser
- [ ] Record counts documented and plausible
- [ ] Test suite extended (target: 170+ tests)
- [ ] All tests passing
- [ ] No regressions in existing functionality

---

## 8. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DF XML format changes between versions | Low | Medium | Parser is already version-tolerant (unknown elements go to JSONB) |
| legends_plus.xml missing sections in some worlds | Medium | Low | Graceful handling: log warning, skip missing sections |
| Large world (1M+ events) causes slow post-parse processing | Medium | Medium | Use batch SQL updates (UPDATE ... FROM) instead of row-by-row |
| HF field expansion causes memory issues | Low | Medium | iterparse with root.clear() maintains constant memory |
| Referential integrity failures > threshold | Medium | Low | Log and continue; broken refs are expected in edge cases |
| Test data fixture maintenance burden | Medium | Low | Use small, focused test XML snippets, not full world exports |

---

## 9. Dependencies on Other Phases

Phase 1 outputs feed directly into:

| Consumer Phase | What It Needs From Phase 1 |
|---------------|---------------------------|
| **Phase 2 (Explorer)** | All entity types, fields, and creature dictionary for detail pages, badges, and filtering |
| **Phase 3 (Narrative)** | All 144 event types with resolved entity references |
| **Phase 4 (Visualization)** | Geographic data (regions, rivers, constructions) for map layers |
| **Phase 5 (Live Integration)** | Complete HF field set for Knowledge Horizon rules |
| **Phase 6 (Advanced)** | CDM schema stability for Mod Manager and Labor Manager |
| **Phase 7 (Polish)** | Finalized schema for index optimization and documentation |

---

*Phase 1: Data Foundation PRD/Roadmap v1.1 -- 2026-02-27*
*5 Stages, 38 Tasks, 3-4 Weeks Estimated*
