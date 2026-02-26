# Round 3 Consolidation: User Interface, Data Model & Infrastructure

**Sources merged**:
- `round2-pair-03.md` — Explorer Web UI (6-tab domain architecture, Phases 1–7 complete), VM Automation Infrastructure (5-phase UTM Windows 11 ARM VM control), Windows App packaging strategy, DFHack bridge expansion, unit/HF field mapping
- `round2-pair-04.md` — Knowledge Horizon dynamic masking design, Unit↔HF data model, Event Type Taxonomy (141 canonical types), CDM entity coverage & gaps, Narrative Engine, Visualization features, Live Data Bridge architecture, Research findings from 12 repositories

**Date consolidated**: 2026-02-25

---

## Complete Feature Inventory

### 1. Chronicler's Unique Position in the DF Ecosystem

Chronicler is the first tool in the DF ecosystem that combines ALL of:
1. Persistent database storage (PostgreSQL)
2. Live fortress polling (DFHack bridge)
3. Legends XML ingestion (batch parse → CDM)
4. LLM-driven narrative generation (storyteller)
5. Worldgen monitoring (novel; no prior tool does this)
6. Dynamic Knowledge Horizon masking (limits LLM's search space to what the fortress plausibly knows)

No existing tool (LegendsViewer-Next, LegendsBrowser, LegendsBrowser2, weblegends, df-narrator, df-ai) covers all six simultaneously.

---

### 2. Explorer Web UI

#### 2.1 Tab Architecture

- Replace generic Schema/Data/Graph tabs with domain-specific tabs.
- Final tab order: `People | Civilizations | Geography | Events | Database | Graph`
- **Database** tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries; power-user access must not be removed.
- **Graph** tab = existing vis.js ego-network graph visualization as a standalone tab, also launchable from any domain detail view via "View graph" buttons.
- Update `_nav.html` to keep top-level pages (Chat / Explorer / Monitoring) and add sub-tabs within Explorer.
- Single-world simplification: hardcode `world_id=8` ("Thadar En" / "Namoram") in frontend API calls; keep `world_id` parameter in routes for schema correctness.
- Explorer is exposed at route `/explorer` within the existing Chronicler web app (not a standalone tool).

#### 2.2 Shared Top Navigation

- Top nav bar with links to: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`).
- Active page highlighted in amber.
- Implemented as a Jinja2 partial: `_nav.html`.
- Each template sets a `{% set active = "<page>" %}` variable before including the partial.
- `index.html`: Change body to `flex flex-col h-screen`; add nav partial before sidebar; wrap sidebar+main in `<div class="flex flex-1 overflow-hidden">`.
- `monitoring.html`: Replace existing `<header>` block with the nav partial include.

#### 2.3 People Tab

- Unified searchable interface merging historical figures (HFs) and in-game units.
- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter.
- Filter input stored in `peopleResults` array; `filterPeopleList(q)` re-renders matching items.
- Search supports both Dwarvish names and English translations.
- Accent-insensitive search: DF names use diacritics (ö, ü, ï, é) that break plain `ILIKE`; use `unaccent(name) ILIKE unaccent($1)` pattern with `unaccent` extension enabled on the PostgreSQL database.
- **Right panel detail card**:
  - Both Dwarvish and English names prominently displayed.
  - Biographical info: race, caste, birth/death years, computed age.
  - Relationships list (spouse, parent, child, master, etc.) with clickable names.
  - Entity memberships with position titles.
  - Skills table (for units).
  - Key life events (collapsed by default).
  - Graph button: opens ego-network in Graph tab for this entity.

##### Age Display

- Computed at display time, not stored — avoids staleness.
- Living unit/HF with `birth_year` and `game_year`: `"127 (born year 23)"`.
- Living unit/HF with `birth_year` only: `"born year 23"`.
- Dead entity with both years: `"Year 150, age 127 (old age)"`.
- Units without `birth_year` (pre-expansion bridge): gracefully show "?".
- `current_game_year` fetched from `sync_snapshots` (most recent snapshot for world).

##### HF Detail View (`renderHfDetail()`)

- Already comprehensive from legends XML extraction; no structural changes needed.
- Shows: biography, relationships, entity memberships, positions held, site links, identities, events.
- Add: computed age display using `current_game_year`.
- Cross-navigation: when a unit exists for this HF, show linked Unit card with nav-link.

##### Unit Detail View (`renderUnitDetail()`)

- Add biography card (expanded): `birth_year`, computed age, sex, death_cause.
- Relationships section: from `unit.details.relationships` — show Spouse, Mother, Father as nav-links (resolved histfig IDs to names via batch lookup).
- Personality section: 50 traits as compact grid with descriptive labels, values list, needs with satisfaction bars, dreams with accomplished flags.
- Attributes section: 6 physical + 12 mental attributes as bar charts.
- Linked HF card: when `hist_fig_id` exists and HF is found, show "This unit has a corresponding Historical Figure record." with nav-link. When HF not found: "Born after legends export."
- Skills table.
- Both Dwarvish and English names.

##### HF ↔ Unit Linkage Gap Handling

- Unit `hist_fig_id` values (36,469+) can exceed max HF id (35,333) from the legends XML export.
- Gracefully display "No legends record — born after legends export" when HF not found.
- Cross-navigation: Unit detail links to HF record and vice versa when both exist.

#### 2.4 Civilizations Tab

- Browse entities: civilizations, religions, military orders.
- **Left panel**: Entity list grouped by type (Civilization, Religion, Military, Other), with race badges and member counts. Filter input (name/race substring) + sort dropdown (Name A-Z, Name Z-A, Most Members, Most Sites).
- **Right panel detail card**:
  - Entity name, type, race.
  - Positions table: Position | Title (gender-appropriate) | Category (color-coded badge) | Site | Current Holder.
    - Noble: king, queen, duke, baron, count, lord, monarch, emperor, consort — amber badge.
    - Military: general, captain, militia, commander, sheriff, champion, marshal — red badge.
    - Administrator: manager, bookkeeper, broker, expedition leader, mayor, chief medical — blue badge.
    - Other: fallback — stone badge.
  - Gender-appropriate title: `is_female = (holder_sex == 1 or holder_caste == "FEMALE")`, pick `name_female` / `name_male` / `name`.
  - Notable members (leaders, deities, vampires).
  - Controlled sites with links to Geography tab.
  - Related events (wars, conquests).

##### Members Loading

- Load up to 1,000 members (limit raised from prior lower value).
- Columns: Name, Race, Link Type, Position (from `position_name`), Status.
- Clickable column headers → toggle sort ascending/descending.
- Filter input → client-side substring on name/race/position.
- Data stored in `civMembersData`; client-side sort and filter without re-fetch.

#### 2.5 Geography Tab

- Browse sites, regions, and structures with connections to entities and HFs.
- **Left panel**: Sites grouped by type (town, fortress, cave, shrine, etc.). Filter input (name/owner substring) + sort dropdown (Name A-Z, Name Z-A, Most HFs, Most Structures).
- **Right panel detail card**: Site detail with structures, owner civ, notable inhabitants, historical events at this location.
- Regions list with type.
- Cross-linking: clicking a site from the Civilizations tab navigates to Geography tab detail.

#### 2.6 Events & Timeline Tab

- Browse historical events chronologically with participant filtering.
- **Controls**: Year range slider, event type dropdown, participant search.
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable).
- **Collection view**: Expandable war/battle trees.
- Event collections: WAR, BATTLE, SIEGE, and others.
- Collection detail with sub-events.
- Filtered event list: by year range, event type, HF participant, site, with limit.

#### 2.7 Database Tab (Schema Browser + Data Browser)

- Formerly the "Explorer" page, now the Database tab within the new Explorer architecture.

##### Schema Browser

- Table list with row counts (use `pg_stat_user_tables.n_live_tup` for speed; exact count on detail view).
- Columns, types, primary keys, foreign keys (outgoing + incoming), and indexes per table.
- Table names validated against regex `^[a-z_][a-z0-9_]*$` plus existence check in `information_schema.tables`.
- Two-column layout: table list (left, 280px) + detail panel (right).
- Table list: clickable items showing `table_name (row_count)`, grouped by category (Legends, Geography, Live, Monitoring).
- Detail panel: columns table with PK badge, FK links (clickable → navigate to target table), incoming FKs, indexes.

##### Data Browser

- Table selector dropdown (reuses table list from schema browser).
- Filter bar: text search across text columns + sort column dropdown + ascending/descending toggle.
- Data grid with:
  - Clickable column headers for sorting.
  - FK values as clickable links navigating to the referenced row (carrying `world_id` for composite PKs).
  - JSONB columns as collapsible `<details>` with formatted JSON.
  - Booleans as colored indicators; NULLs as gray italic.
  - Long text truncated with expand-on-click.
- Pagination: Previous/Next buttons, page X of Y display, rows-per-page selector (25 / 50 / 100).
- SQL Runner: collapsible textarea, Run button, results grid, row limit selector, execution time display.
- SQL Runner safety: keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE) as defense-in-depth; primary defense is `conn.transaction(readonly=True)`; wrapped query with enforced LIMIT cap; all dynamic table/column names validated against `information_schema` before interpolation.

#### 2.8 Graph Tab

- vis.js ego-network visualization of historical figures (HFs), entities, and sites.
- Reuses existing Graph tab implementation; launchable from domain views via "View graph" buttons throughout.
- Search box with typeahead → `/api/explorer/graph/search` → results displayed as `Name (type)`.
- World selector dropdown.
- Depth selector: 1-hop / 2-hop / 3-hop radio buttons.
- vis.js canvas: full remaining height, dark background, forceAtlas2Based physics.
- Node info panel: overlay on click showing entity details + "Expand" button.
- Click-to-expand: adds clicked node's 1-hop connections to existing graph incrementally.
- Legend: node shapes and colors.
- Performance guard: node count badge; warning at 500+ nodes; refuse expansion at 1,000+ nodes.
- vis.js loaded from CDN: `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js` (no build step required).
- Graph query pattern: BFS from center node, depth 1–3 (clamped). Each hop:
  1. Fetch frontier HF details from `historical_figures`.
  2. Fetch HF→HF edges from `hf_links` (bidirectional).
  3. Fetch HF→Entity edges from `hf_entity_links` (with `position_name`).
  4. Fetch HF→Site edges from `hf_site_links`.
  5. Build next frontier from discovered HF IDs not yet visited.
- All entity/site detail fetches batched with `ANY($1::int[])` — no per-node N+1 queries.
- Node styling:
  - HF (default): dot, stone (#78716c).
  - HF (deity): dot, gold (#f6b93b).
  - HF (vampire): dot, red (#ef4444).
  - HF (necromancer): dot, purple (#a855f7).
  - HF (werebeast): dot, orange (#f97316).
  - HF (ghost): dot, slate (#94a3b8).
  - Entity (civilization): diamond, blue (#3b82f6).
  - Entity (religion): diamond, purple (#a855f7).
  - Site: square, green (#22c55e).
- Edge colors: family=green, spouse=pink, enemy=red, membership=blue (dashed), site link=lime (dashed).
- Node ID prefixing (`hf-123`, `entity-456`, `site-789`) avoids ID collisions between entity types.
- Return format vis.js DataSet-compatible:
  ```json
  {
    "nodes": [{"id": "hf-123", "label": "Urist", "shape": "dot", "color": {...}}],
    "edges": [{"from": "hf-123", "to": "hf-456", "label": "spouse", "color": "#f472b6"}]
  }
  ```

#### 2.9 Knowledge Horizon Filter (Stub, Phase 8, Deferred)

- Concept: filter all Explorer views to show only entities/events within the fortress's "known world."
- UI: "Fortress Knowledge" toggle in tab bar, hidden until horizon data exists.
- `knowledge_horizon` table: `(world_id, entity_type, entity_id, visible BOOLEAN)`.
- Backend: horizon status endpoint + optional `?horizon=true` filter param on existing endpoints.
- Full computation deferred; stub SQL table and endpoint in place for future activation.
- Explorer also serves as the design workbench for tier-propagation logic for this dynamic masking system.

#### 2.10 Cross-Linking Navigation

- Clicking a name in any tab navigates to the relevant tab's detail view.
- "View graph" buttons throughout domain views jump to Graph tab with entity pre-loaded.
- Civilizations → Geography (controlled sites).
- People → Civilizations (entity memberships).
- People → Geography (site links from HF data).
- Unit detail → HF detail (when linked) and vice versa.

#### 2.11 Sidebar Scroll Consistency

- Filter/sort controls in `flex-shrink-0` header; list containers have `overflow-y-auto`.

---

### 3. Knowledge Horizon — Dynamic Database Masking

#### Core Concept

The Knowledge Horizon is a dynamic masking system that limits the LLM's effective search space within the Chronicler database. Instead of exposing all ~1.65M CDM records across 35 tables, the mask exposes only data relevant to the fortress and its inhabitants. The mask grows organically as in-game conditions change (migrants arrive, squads raid, diplomats visit, artifacts are acquired, wars are declared).

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

### 4. Unit ↔ Historical Figure Data Model

#### Core Concept

Units (live game entities from DFHack memory) and Historical Figures (legends XML data) often represent the same person. The mapping defines which fields exist on each, which overlap, and which source is authoritative — enabling the LLM storyteller to merge both views into a unified "person" for narrative generation.

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

#### Unit-HF Merge Strategy (6 Rules)

1. Start with Unit data (always fresher for live entities).
2. Overlay HF data for historical depth (relationships, events, positions).
3. For conflicts: prefer Unit for real-time state; prefer HF for historical facts.
4. Personality data is Unit-only (not present in legends XML).
5. Event history comes from TWO sources: HF events (legends XML) + live-generated events (watcher state transitions). Both stored in `history_events` table, distinguished by `live_generated` flag and `source` column.
6. If a unit has no HF record and is an embark dwarf: flag `embark: true` — personality and skills are available; event history grows from live event generation forward.

#### Fortress Denizens Registry

- The `fortress_denizens` registry tracks fortress relevance: status, NVS (narrative visibility score), and embark flag.
- Serves as the routing layer for the agentic storyteller — determines which beings the LLM prioritizes.
- Is the authoritative source for "who is currently relevant to the fortress."

#### Integration: Knowledge Horizon + Unit-HF Merge

- The Knowledge Horizon masking system determines WHICH historical figures are visible to the LLM.
- The Unit-HF field mapping determines HOW those visible figures are presented to the LLM (merged person schema).
- The `fortress_denizens` registry is the bridge: it identifies fortress-relevant units, the merge layer produces their unified person objects, and the Knowledge Horizon governs which external HFs are reachable from those persons via relationship traversal.
- Starting dwarves (CAV-004) and embark dwarves (Merge Rule 6) share the same problem: no HF record. Both require synthetic data generation with `source = 'inferred'` flags.
- CAV-003 (Previous Residence Knowledge) directly uses `hf_site_links` — the same table that appears in the HF-only fields of the field mapping.

---

### 5. DFHack Bridge — Unit Data Extraction

#### Fields Currently Captured (~15 fields out of 100+ available)

- Identity: id, name, english_name, first_name, race (via race_map), caste (in schema but NOT previously in bridge output), profession.
- Position: pos_x/y/z.
- State: is_alive, flags1/2/3, mood, has_mood, had_mood.
- Social: civ_id, hist_fig_id, squad_id, squad_position.
- Emotional: stress, focus, longterm_stress, combat_hardened.
- Physical: pregnancy_timer, pregnancy_spouse, soldier_mood.
- Skills: full skill list (id, rating, experience) via `dwarf_skills` section.
- Emotions: recent emotions (type, thought, strength, severity, year) via `dwarf_emotions` section.

#### New Fields to Extract (High Value, Phase 3 — COMPLETE)

| Field | Lua Path | Narrative/Analytical Value |
|-------|----------|---------------------------|
| birth_year | `u.birth_year` | Age calculation, generational stories |
| birth_time | `u.birth_time` | Precise birth timing |
| old_year | `u.old_year` | Expected lifespan |
| sex | `u.sex` | Gender for title selection |
| caste (from bridge) | `u.caste` | Currently in schema but not bridge output |
| relationship_ids | `u.relationship_ids[type]` | Spouse, Mother, Father — 9 slots, histfig IDs |
| death_cause | `u.counters.death_cause` | Enriches death events beyond boolean |
| cultural_identity | `u.cultural_identity` | Cultural group beyond civ_id |
| personality traits | `u.status.current_soul.personality.traits[facet]` | 50 facets (Brave, Curious, etc.) |
| personality values | `u.status.current_soul.personality.values[i]` | Core values (Family, Tradition, Power...) |
| personality needs | `u.status.current_soul.personality.needs[i]` | 30 need types with focus_level |
| life goals/dreams | `u.status.current_soul.personality.dreams[i]` | Start family, master skill, etc. |
| physical attrs | `u.body.physical_attrs[type].value` | Strength, Agility, etc. (6 attrs) |
| mental attrs | `u.status.current_soul.mental_attrs[type].value` | Analytical, Focus, etc. (12 attrs) |
| preferences | `u.status.current_soul.preferences[i]` | Likes/dislikes for materials, creatures |
| need states | `u.counters2.hunger_timer` etc. | Hunger, thirst, sleep timers |

#### Expanded `unit_summary` Section Code

```lua
-- Biographical
entry.birth_year = u.birth_year
entry.birth_time = u.birth_time
entry.old_year = u.old_year
entry.sex = u.sex
entry.caste = u.caste

-- Relationships (9 slots, 0-indexed)
entry.relationships = {}
local rel_types = {'PetOwner','Spouse','Mother','Father','LastAttacker','GroupLeader','Draggee','Dragger','RiderMount'}
for i, rtype in ipairs(rel_types) do
    local hfid = u.relationship_ids[i-1]
    if hfid and hfid > -1 then
        entry.relationships[rtype] = hfid
    end
end

-- Death cause (for dead units still in list)
if dfhack.units.isDead(u) then
    entry.death_cause = u.counters.death_cause
end

-- Cultural identity
entry.cultural_identity = u.cultural_identity
```

#### New `dwarf_personality` Bridge Section Code

```lua
local soul = u.status.current_soul
if soul then
    local p = soul.personality
    -- Traits (50 facets, 0-100 scale stored as 0-10000 internally)
    entry.traits = {}
    for i = 0, 49 do
        entry.traits[df.personality_facet_type[i]] = p.traits[i]
    end
    -- Values
    entry.values = {}
    for _, v in ipairs(p.values) do
        table.insert(entry.values, {type=df.value_type[v.type], strength=v.strength})
    end
    -- Needs with focus level
    entry.needs = {}
    for _, n in ipairs(p.needs) do
        table.insert(entry.needs, {type=df.need_type[n.id], focus=n.focus_level, level=n.need_level})
    end
    -- Dreams/goals
    entry.dreams = {}
    for _, d in ipairs(p.dreams) do
        table.insert(entry.dreams, {type=df.goal_type[d.type], accomplished=d.flags.accomplished})
    end
    -- Physical attributes (6)
    entry.physical_attrs = {}
    for i = 0, 5 do
        local attr = u.body.physical_attrs[i]
        entry.physical_attrs[df.physical_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
    -- Mental attributes (12)
    entry.mental_attrs = {}
    for i = 0, 11 do
        local attr = soul.mental_attrs[i]
        entry.mental_attrs[df.mental_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
end
```

#### Bridge Data Domains Covered

- `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.

#### Bridge Enhancement Requirements (Planned)

1. Add `eventful` subscriptions for reactive event capture (currently polling-only):
   - `UNIT_DEATH`
   - `ITEM_CREATED`
   - `JOB_COMPLETED`
   - `UNIT_NEW_ACTIVE`
   - `SYNDROME`
2. Death cause enrichment — use `df.global.world.incidents.all` pattern from myDFHackScripts to get death cause enum + killer ID.
3. Parent/family chain — `unit.relationship_ids.Mother/Father` for family tree data from live units.
4. Book detection — `dfhack.items.getBookTitle(item)` for written work events.
5. Incident system — full incident lookup for crime/death narrative.

#### Polling + Events Hybrid Pattern (proven from myDFHackScripts)

Use `eventful` subscriptions for real-time events (deaths, item creation) AND polling via `dfhack.timeout` for state changes (citizen count, reports, petitions). Catches both immediate events and gradual state transitions.

#### Bridge Architecture Validation (from Research)

Three independent codebases (df-ai, myDFHackScripts, weblegends) use the same fundamental patterns, confirming Chronicler's approach:

| Pattern | df-ai (C++) | myDFHackScripts (Lua) | Chronicler bridge (Lua) |
|---|---|---|---|
| Tick-based polling | `OnupdateCallback` | `dfhack.timeout(500, 'ticks')` | `repeat --time 500 --timeUnits ticks` |
| Event subscription | N/A (C++ hooks) | `eventful.onUnitDeath[modId]` | Not yet (polling only) |
| Change detection | Set comparison (citizen IDs) | `Helper.watch()` factory | Snapshot comparison |
| Data access | `df::world->units.active` | `df.global.world.units.active` | `df.global.world.units.active` |
| Death cause lookup | Direct memory | `df.global.world.incidents.all` | Not yet |

---

### 6. Event Type Taxonomy — Full Canonical Inventory

#### Authoritative Count: 141 Total Canonical Types

- 133 from df-structures `history_event_type` enum (excluding `NONE = -1`)
- 8 additional types added in the DF 50.x Steam release (not yet in df-structures enum)

NOTE: The research-synthesis.md incorrectly reported 144 types. The event-type-taxonomy.md (dated 2026-02-23) corrects this. All downstream tooling and planning must use **141**, not 144.

Coverage across tools:

| Source | Event Types | Authoritative? |
|--------|-------------|----------------|
| df-structures `history_event_type` enum | 133 | Yes — canonical for older DF versions |
| DF 50.x Steam additions (not in enum yet) | 8 | Yes — observed in real DF 50.13 DB |
| **Total canonical** | **141** | **Combined authoritative** |
| LegendsBrowser2 `events.go` | 122 handled | Yes — most complete handler implementation |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Yes — .NET source, production |
| weblegends `events/*.cpp` | 94 files | Yes — C++ source, production |
| Chronicler DB (world 8, "Thadar En") | 97 observed types | Real DF 50.13 legends XML observation |
| df-narrator | Generic (type string) | No — no per-type handling |

#### Chronicler Strategy for Unhandled Types

- Store all event types as TEXT column (no DB enum constraint)
- Raw event data stored in `details` JSONB column
- The agentic storyteller handles all types via LLM interpretation of raw field data — no per-type template required
- This covers the 11 types in df-structures with no LegendsBrowser2 handler, gracefully

#### Recommended Target

All 141 event types for schema definition, with narrative templates for the 122 types that LegendsBrowser2 handles, and graceful LLM fallback (raw field dump) for the remaining 19.

#### Category 1: HF Lifecycle (17 types)

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

#### Category 2: HF Relationships & Links (10 types)

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

#### Category 3: HF Actions (14 types)

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

#### Category 4: HF Intrigue (6 types)

| df-structures Name | DB Name | DB Count (World 8) | In LB2? | Description |
|---|---|---|---|---|
| HF_CONVICTED | hf convicted | 854 | Yes | Criminal conviction |
| HF_INTERROGATED | hf interrogated | 40 | Yes | Interrogation |
| FAILED_INTRIGUE_CORRUPTION | failed intrigue corruption | 1,245 | Yes | Corruption attempt failed |
| FAILED_FRAME_ATTEMPT | failed frame attempt | 24 | Yes | Framing attempt failed |
| SABOTAGE | — | Not in DB | Yes | Sabotage action |
| SPOTTED_LEAVING_SITE | — | Not in DB | Yes | Caught leaving a site |

#### Category 5: Artifacts (13 types)

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

#### Category 6: Sites & Construction (11 types)

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

#### Category 7: Entities (14+ types)

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

#### Category 8: War & Combat (8+ types)

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

#### Category 9: Diplomacy (9+ types)

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

#### Category 10: Culture & Art (8+ types)

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

#### Category 11: Masterpieces (7 types — all NOT in DB, all in LB2)

| df-structures Name | Description |
|---|---|
| MASTERPIECE_CREATED_ARCH_CONSTRUCT | Masterwork construction |
| MASTERPIECE_CREATED_ITEM | Masterwork item |
| MASTERPIECE_CREATED_DYE_ITEM | Masterwork dyed item |
| MASTERPIECE_CREATED_ITEM_IMPROVEMENT | Masterwork improvement |
| MASTERPIECE_CREATED_FOOD | Masterwork meal |
| MASTERPIECE_CREATED_ENGRAVING | Masterwork engraving |
| MASTERPIECE_LOST | Masterwork destroyed/lost |

#### DF 50.x Steam-Era Event Types (8 types — Not in df-structures enum)

These appear in Chronicler's database (world 8, DF 50.13) but are not in the df-structures `history_event_type` enum:

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

#### 11 Types in df-structures with No LegendsBrowser2 Handler

Chronicler relies on LLM fallback for these:

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

### 7. CDM Entity Coverage & Gaps

#### Core Entity Types — Coverage Across Tools

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

Required New CDM Entity Types:
- `WorldConstructions` table (roads, bridges, tunnels)
- `ArtForms` tables × 3 (poetic, musical, dance)
- `Identities` table (false identities assumed by HFs)
- `Rivers` table
- Full `Entity Populations` extension

#### Importance Scoring

Add `importance_score` columns to: `historical_figures`, `sites`, `artifacts`, `conflicts` (from df-narrator formulas). Compute on XML ingestion. Use for LLM context selection (top-N entities by score for world summary generation).

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

### 8. Narrative Engine Features

#### Event Rendering Pipeline

Standard pattern (adopted from all successful tools):
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

### 9. Visualization Features

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

#### Map Implementation Consensus

- Coordinate system: `L.CRS.Simple` (no geographic projection)
- Y-axis: Inverted from DF coordinates (`map_height - y`)
- Scale: 4-10 pixels per world tile
- Site markers: Colored polygons/shapes coded by site type and owning civilization
- Layer control: Toggle site layers by civilization/type
- Chronicler advantage: PostgreSQL + PostGIS (if extended) enables spatial queries no in-memory tool can match

---

### 10. Worldgen Monitoring (Novel Capability)

No existing tool monitors worldgen in real time.

Available data in `world_generatorst` struct at `df.global.world.worldgen_status`:
- 12-state generation phase enum (None through Done)
- Progress counters (rivers, civs, rampages)
- Phase completion flags (caves placed, megabeasts placed, etc.)
- Event cursor (`last_event_id_added`)
- Live access to `world.history.figures/events/eras` as they populate

Implementation: A `worldgen-bridge.lua` script using the existing `repeat` job pattern, polling every 30 frames (~0.5s), writing JSON snapshots.

CDM addition: `worldgen_snapshots` table.

Chronicler value: First-ever real-time worldgen dashboard showing:
- Civilization count rising
- Event accumulation curves
- Era transitions
- Phase progression as world generates

---

### 11. Post-Parse Processing Pipeline

Every legends browser runs a post-parse cross-referencing pass (LV-Next: 12 resolve steps, LB2: 6 process steps). Chronicler requires the same after XML ingestion:

1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores

---

### 12. LLM Advisor (AI DF Player)

Exclusive action queue architecture (from df-ai):
- Maintain one active action chain
- Queue pending actions
- Report completion/failure before starting next

Stock threshold model from df-ai provides reference heuristics for LLM advisor context.

---

### 13. Mod Awareness (Deferred)

The only potentially relevant feature is recording which mods were active when a world was generated, capturable during worldgen monitoring. Full mod management (raw file parsing, conflict detection, profile management) is deferred and out of scope for Chronicler core.

---

### 14. VM Autonomous Control Infrastructure

- Jarvis must have full autonomous control over a Windows environment for: file transfers, script execution, DFHack console commands, in-game control, and Windows app packaging.
- The UTM VM (`DF-Windows`) is the primary candidate; the HomeServer (`WIN-48L3R2QLQN0`, 192.168.4.194) is a fallback for DF hosting.
- `utmctl` is the primary interface for VM lifecycle management: `list`, `status`, `start`, `stop`, `suspend`, `exec`, `file push/pull`, `ip-address`, `clone`.
- SSH key-based authentication must be established from Mac to the VM.
- `utmctl exec` is fire-and-forget (no stdout relay) — use `exec-capture` (simple commands) or `exec-ps` (complex PowerShell via base64) for output capture.
- PowerShell 7 must be installed on the VM (`winget install Microsoft.PowerShell`).
- QEMU Guest Agent + SPICE Guest Tools required for guest-agent-based file transfer.
- `qemu-img` (v10.2.1 via Homebrew) must be available on Mac for VM snapshot/restore.
- VM disk UUID changes on re-create — auto-detect via glob pattern, never hardcode.
- `utmctl file pull` returns exit 0 on failure — always validate output content, not `$?`.
- PowerShell takes ~10s to start under Prism ARM emulation — always use polling with done-marker pattern rather than fixed sleep.

#### VM Identity & Configuration

- VM name: `DF-Windows`.
- VM IP: `192.168.64.3`.
- VM hostname: `WIN-MRGFUCCV202`.
- VM OS: Windows 11 Pro ARM 64-bit (10.0.26200).
- SSH key: `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control).
- SSH user on VM: `Chronicler`.
- QEMU disk path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`.
- Disk UUID (current, auto-detected): `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- `qemu-img` version: 10.2.1 (installed via Homebrew).
- `utmctl` binary: available and fully mapped.
- DFHack RPC port: 5000.
- HTTP file server port: 8889.
- DF install path on VM (planned): `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`.
- DF version: 53.10, DFHack version: 53.10-r1.

#### HomeServer Identity

- Hostname: `WIN-48L3R2QLQN0`.
- IP: `192.168.4.194`.
- User: `Nathaniel`, Password: `DwarfF0rtress`.
- OS: Windows 10 Pro x86_64.

#### File Transfer Methods (VM)

- HTTP file server on port 8889: ~105 MB/s. Start via `vm-lifecycle.sh http-serve start`.
- SCP via `vm-lifecycle.sh scp-pull`: ~19 MB/s. Requires `-O -T` flags for Windows paths with spaces/parentheses.
- Guest Agent: emergency-only (~0.24 MB/s, 440x slower than HTTP server).

#### Live Data Access

TCP RPC is broken for game-thread calls on DFHack 53.x running under Prism (ARM Windows VM). Only cached calls (GetVersion, GetWorldInfo) work — all other calls hang waiting for CoreSuspender. This is a thread scheduling issue where the TCP server's network thread cannot acquire the Core lock.

Working transports:
1. `dfhack-run` over SSH — executes Lua commands directly on the DFHack Core thread, bypassing TCP. Verified access to all data domains.
2. `chronicler-bridge.lua` — HTTP-served JSON for bulk data (runs within DFHack's process, unaffected by TCP issue).

Verified live data access via `dfhack-run` SSH (world 8 "Thadar En"):
- `df.global.world.history.figures` — 48,366 HFs
- `df.global.world.history.events` — 442,716 events
- `df.global.world.entities.all` — 4,901 entities
- `df.global.world.artifacts.all` — 8,035 artifacts
- `df.global.world.world_data.sites` — 2,154 sites

---

## Architecture & Implementation

### Technology Stack

- FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs.
- Single `explorer.html` template.
- API routes structured in separate files per domain.
- PostgreSQL with `unaccent` extension for diacritic-tolerant search.
- vis.js loaded from CDN (`https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`) — no build step.
- Server start: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`.

### API Routes

#### People (`chronicler/api/routes/people.py`)

- `GET /api/people/search?q=...&type=all|hf|unit` — Unified search across HFs + units by name (Dwarvish and English); returns type, race, alive/dead status.
- `GET /api/people/hf/{world_id}/{hf_id}` — HF detail: name, race, birth/death, relationships (from `hf_links`), entity memberships (from `hf_entity_links`), site links (from `hf_site_links`), position history (from `hf_position_links`), key events, identities, `current_game_year`.
- `GET /api/people/unit/{unit_id}` — Unit detail: both names, race, profession, skills, labors, position, linked HF (if linkable), civ membership, `current_game_year`, expanded fields from Phase 3.
- `GET /api/people/hf/{world_id}/{hf_id}/events?limit=50` — Events involving this HF.
- `GET /api/people/hf/{world_id}/{hf_id}/relationships` — Graph-ready relationship data.
- Relationship name resolution via batch lookup:
  ```python
  rel_ids = [v for v in relationships.values() if v]
  hf_names = await conn.fetch(
      "SELECT id, name FROM historical_figures WHERE world_id = $1 AND id = ANY($2::int[])",
      world_id, rel_ids)
  name_map = {r["id"]: r["name"] for r in hf_names}
  ```
  Return `resolved_relationships`: `[{type: "Spouse", hf_id: 12345, name: "Urist McHammer"}]`.
- `current_game_year` fetch pattern:
  ```python
  current_year = await conn.fetchval(
      "SELECT game_year FROM sync_snapshots WHERE world_id = $1 "
      "ORDER BY synced_at DESC LIMIT 1", world_id)
  ```
- `unaccent` search pattern: `unaccent(name) ILIKE unaccent($1)` on `name` and `english_name` fields.

#### Civilizations (`chronicler/api/routes/civilizations.py`)

- `GET /api/civilizations?type=...` — List entities with type filter, member counts, site counts.
- `GET /api/civilizations/{world_id}/{entity_id}` — Entity detail.
- `GET /api/civilizations/{world_id}/{entity_id}/positions` — Position hierarchy with current/former holders.
- `GET /api/civilizations/{world_id}/{entity_id}/members?limit=1000` — Paginated member list from `hf_entity_links`.
- Position query:
  ```sql
  SELECT ep.position_id, ep.name, ep.name_male, ep.name_female,
         hpl.hf_id AS holder_hf_id, hf.name AS holder_name,
         hf.sex AS holder_sex, hf.caste AS holder_caste,
         s.id AS site_id, s.name AS site_name
  FROM entity_positions ep
  LEFT JOIN hf_position_links hpl ON ...
  LEFT JOIN historical_figures hf ON ...
  LEFT JOIN sites s ON s.world_id = ep.world_id AND s.owner_entity_id = ep.entity_id
  WHERE ep.world_id = $1 AND ep.entity_id = $2
  ORDER BY ep.name
  ```
- `_categorize_position(name)` helper classifies positions into Noble / Military / Administrator / Other.

#### Geography (`chronicler/api/routes/geography.py`)

- `GET /api/geography/sites?type=...&owner=...` — Sites with owner entity, type filter.
- `GET /api/geography/sites/{world_id}/{site_id}` — Site detail.
- `GET /api/geography/regions` — Regions list with type.

#### Events (`chronicler/api/routes/events.py`)

- `GET /api/events?year_from=...&year_to=...&type=...&hf=...&site=...&limit=100` — Filtered event list.
- `GET /api/events/collections?type=WAR|BATTLE|...` — Event collections.
- `GET /api/events/collections/{world_id}/{id}` — Collection detail with sub-events.

#### Explorer / Database Tab (`chronicler/api/routes/explorer.py`)

- `GET /api/explorer/tables` — All tables with row counts.
- `GET /api/explorer/tables/{name}` — Columns, types, PKs, FKs, indexes.
- `GET /api/explorer/tables/{name}/data?page=1&limit=25&sort=&order=asc&filter=` — Paginated rows with column metadata.
- `POST /api/explorer/query` — Read-only SQL results (SELECT/WITH only, `conn.transaction(readonly=True)`, max 500 rows).
- `graph_search()`: add `unaccent` wrapping on HF, entity, site, unit name searches.
- Add Knowledge Horizon endpoint (stub).
- Do NOT refactor existing `explorer.py` — add new domain route files alongside it.
- Row serialization: `_serialize_row()` helper converts asyncpg types (datetime, Decimal, bytes) to JSON-safe values.

#### Graph Endpoints (in `explorer.py`)

- `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=1` — Ego network: HF center + HF/entity/site links.
- `GET /api/explorer/graph/entity/{world_id}/{entity_id}?depth=1` — Entity center + member HFs.
- `GET /api/explorer/graph/site/{world_id}/{site_id}?depth=1` — Site center + linked HFs.
- `GET /api/explorer/graph/search?q=&world_id=` — Typeahead search across HFs, entities, sites.

### Database Schema (`chronicler/db/schema.sql`)

#### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```
Also run manually against live `chronicler` database.

#### Units Table New Columns

```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex SMALLINT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```

- `english_name`: populated from existing `details->>'english_name'` JSONB; both `name` and `english_name` written on insert/update.
- `birth_year` and `sex` get dedicated columns (not JSONB) because they are used in queries.
- Rich data (personality, relationships, attributes) stays in `details` JSONB — too varied/nested for columns.

#### Knowledge Horizon Table (Stub)

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);
```

#### Knowledge Horizon View-Based Masking (Full Implementation)

Preferred approach for full implementation (beyond the stub):
```sql
CREATE VIEW visible_historical_figures AS
SELECT * FROM historical_figures
WHERE id IN (SELECT hf_id FROM knowledge_horizon WHERE visible = true);
```

Applies to: historical figures, entities, sites — at minimum.

### Knowledge Horizon — Database Architecture Alternatives

**Preferred Approach: View-Based Masking**
- Create PostgreSQL views that filter base tables through a `visibility` predicate.
- Naturally consistent with live data; no data duplication.

**Alternative Approach: Materialized Subset**
- Copy visible rows into shadow tables, refreshed on each watcher cycle.
- Pros: Faster queries.
- Cons: Higher storage cost; sync complexity.

**Recommended Path**: Start with view-based masking. If query performance becomes an issue at 60K+ HFs, add materialized views with incremental refresh.

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

### VM Scripts

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

#### Existing Scripts (Phase 0 Complete)

- `vm-config.sh`: Shared config — auto-detects disk UUID via glob `*.qcow2`, defines DRY constants for VM name, IP, SSH key, user, etc.
- `vm-lifecycle.sh`: 19-command VM control wrapper (451 lines) — covers all `utmctl` operations plus `exec-capture` and `exec-ps` helpers.
- `vm-bootstrap.sh`: Autonomous Phase 0 bootstrap script — OpenSSH install, SSH key deployment, SSH config, PowerShell 7 install (343 lines).

#### Scripts to Be Created

- `vm-install-df.sh` — DF/DFHack install + configuration (Phase 1).
- `vm-test-rpc.py` — RPC validation test script (Phase 1).
- `vm-ssh.sh` — SSH connection wrapper with retry/timeout/key handling (Phase 2).
- `vm-deploy.sh` — SCP-based deployment script for Lua/PS1/configs (Phase 2).
- `vm-dfhack-cmd.sh` — Execute DFHack commands via SSH → `dfhack-run` (Phase 2).
- `vm-service-manager.sh` — Start/stop HTTP server, bridge, PostgreSQL (Phase 2).
- `vm-deploy-all.sh` — One-command full deployment (Phase 2).
- `vm-watch.sh` — Start watcher pointed at VM (Phase 2).

### Chronicler Product Code Files

Location: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

#### Explorer UI — Files Modified or Created

| Action | File |
|--------|------|
| Create | `chronicler/api/templates/partials/_nav.html` |
| Create | `chronicler/api/routes/explorer.py` |
| Create | `chronicler/api/routes/people.py` |
| Create | `chronicler/api/routes/civilizations.py` |
| Create | `chronicler/api/routes/geography.py` |
| Create | `chronicler/api/routes/events.py` |
| Create | `chronicler/api/templates/explorer.html` |
| Modify | `chronicler/api/app.py` (import + register all new routers; add `/explorer` page route; add `active` context variable to `/` and `/monitoring` routes) |
| Modify | `chronicler/api/templates/index.html` (flex layout, nav partial) |
| Modify | `chronicler/api/templates/monitoring.html` (replace header with nav partial) |
| Modify | `chronicler/config.py` (remove hardcoded `192.168.4.194`, add `VM_HOST` auto-detection via `utmctl ip-address`) |
| Modify | `chronicler/db/schema.sql` (unaccent extension, unit columns, knowledge_horizon table) |
| Modify | `chronicler/dfhack/scripts/chronicler-bridge.lua` (expanded unit field extraction) |
| Modify | `chronicler/dfhack/watcher.py` (handle new bridge fields) |
| Modify | `chronicler/sync/sync.py` (handle new bridge fields) |
| Create | `projects/chronicler/designs/unit-hf-field-mapping.md` (design doc for LLM integration mapping) |

#### Windows App Packaging — Files to Be Created

- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/pyinstaller.spec`
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/build-windows.sh`

### app.py Modifications

- Import and include `explorer_router` (and all new domain routers) with `/api` prefix.
- Add `GET /explorer` page route rendering `explorer.html`.
- Add `active` context variable to existing `/` and `/monitoring` routes.

### Database — Current State and Extension Plan

- **DB**: PostgreSQL `chronicler` on localhost:5432
- **Current scale**: 1.65M records (world "Namoram" CDM)
- **World 8 ("Thadar En")**: 312,254 events (legends XML), 442,716 events (live data), 97 observed event types, 48,366 HFs, 8,035 artifacts, 4,901 entities, 2,154 sites
- **Event type storage**: TEXT column (no DB enum), `details` JSONB column for raw fields
- **Schema extensions needed**: HF missing fields (high + medium priority), WorldConstructions table, ArtForms × 3, Identities, Rivers, worldgen_snapshots, importance_score columns, knowledge_horizon table (per-HF/per-entity/per-site visibility flags)

### CDM / XML Ingestion — Current State

- XML legends ingestion: Built (CDM schema)
- XML+ merge (legends_plus): Built; need audit vs LV-Next merge rules
- 131-test suite: Built; need event type coverage tests added

---

## Phase-by-Phase Status

### Explorer UI

- **Explorer Redesign** (original 6-tab domain architecture): COMPLETE. Domain-specific Explorer built (People, Civilizations, Geography, Events, Database, Graph); all API route files created; cross-linking navigation implemented; HF↔Unit gap handled; SQL runner preserved.
- **Phase 1** (Accent-Insensitive Search): COMPLETE. `unaccent` extension enabled; `unaccent(name) ILIKE unaccent($1)` in `search_people()` and `graph_search()`.
- **Phase 2** (Age Calculation): COMPLETE. `current_game_year` added to HF and Unit responses; frontend computes and displays age.
- **Phase 3** (Unit Data Extraction Expansion): COMPLETE. Bridge Lua script expanded with biographical, relationship, personality, attribute fields; `dwarf_personality` section added; schema columns `birth_year`, `sex`, `death_cause` added; watcher/sync updated.
- **Phase 4** (Unit/HF Field Mapping + Detail View Completeness): COMPLETE. HF detail verified complete; unit detail view expanded with all new sections; relationship name resolution in `get_unit()`; field mapping design doc created.
- **Phase 5** (Position Table Enhancement): COMPLETE. Position table renamed to 5-column layout (Position | Title | Category | Site | Current Holder); gender-appropriate title logic; category badges; site nav-links.
- **Phase 6** (Left Panel Sort/Filter): COMPLETE. Filter inputs and sort dropdowns added to People, Civilizations, and Geography tab sidebars; scroll consistency enforced.
- **Phase 7** (Load Members Enhancement): COMPLETE. Member limit raised to 1,000; columns expanded; client-side sort and filter; Position column added.
- **Phase 8** (Knowledge Horizon Filter): DEFERRED — NOT STARTED. Stub SQL table and backend endpoint planned; UI toggle hidden until horizon data exists.

### Database Explorer (from original plan — SUBSUMED into Explorer architecture)

- Phase 1 (Navigation + Schema Browser): COMPLETE (subsumed as Database tab).
- Phase 2 (Data Browser): COMPLETE (subsumed as Database tab).
- Phase 3 (Entity Graph): COMPLETE (subsumed as Graph tab).
- Note: The functionality described in the original 3-tab Database Explorer plan (Schema Browser, Data Browser, Entity Graph) maps directly to the Database tab and Graph tab in the final 6-tab Explorer architecture. These are the same system at different stages of planning maturity.

### VM Automation — ACTIVE (created 2026-02-24)

#### Phase 0 Pre-Work — COMPLETE

- [x] `vm-lifecycle.sh` created and tested (19-command VM control wrapper, 451 lines).
- [x] `vm-bootstrap.sh` created (343 lines).
- [x] `vm-config.sh` created with auto-detecting disk UUID.
- [x] SSH key pair generated: `~/.ssh/df-vm` (ed25519).
- [x] `utmctl` API fully mapped.
- [x] Disk UUID auto-detected: `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- [x] `qemu-img` installed (v10.2.1).
- [x] `exec-capture` and `exec-ps` verified against running VM.
- [x] OS confirmed: Windows 11 Pro ARM 64-bit (10.0.26200).
- [x] `utmctl exec` returns output — hostname `WIN-MRGFUCCV202` verified.
- [x] `utmctl ip-address` returns valid IP `192.168.64.3`.

#### Phase 0 Pending

- [ ] SSH key-based auth working from Mac (pending: run `vm-bootstrap.sh`).

#### Phase 1 (DF + DFHack Risk Validation) — NOT STARTED

- Critical risk: DF is x86-64 only. On Windows 11 ARM in UTM, it runs under Prism x86-64 translation + QEMU ARM virtualization (double emulation). DFHack memory introspection under Prism is untested.
- Phase 1 is the make-or-break gate — must be completed before investing further.
- Steps:
  1. Install Steam via SSH (`winget install Valve.Steam`).
  2. User installs DF from Steam (requires interactive Steam login via UTM display).
  3. User verifies DF launches (window renders, no crash).
  4. Jarvis installs DFHack 53.10-r1 (download + extract to DF dir via SCP).
  5. Jarvis configures `remote-server.json` (`allow_remote: true`, port 5000).
  6. Jarvis launches DF with DFHack and opens firewall rule via `netsh`.
  7. Jarvis tests RPC Core methods: `ListUnits`, `GetWorldInfo`, `ListEnums` from Mac.
  8. Jarvis/user deploys + tests Lua bridge (SCP bridge.lua, start repeat job in DFHack console).
  9. Jarvis deploys + tests HTTP server (SCP PS1, start via SSH, curl from Mac).
  10. Jarvis runs performance benchmark: DF FPS, RPC latency, bridge freshness.
- Validation matrix:
  - DF launches under Prism: PASS → continue; FAIL → VM = packaging-only, DF stays on HomeServer.
  - DFHack loads: PASS → continue; FAIL → try without plugins; if still fails, VM = packaging-only.
  - RPC Core methods respond: PASS → continue; FAIL → debug network config.
  - Bridge repeat job runs: PASS → continue; FAIL → try manual Lua execution.
  - Performance >10 FPS: PASS → VM is primary DF host; FAIL → VM = secondary, HomeServer = primary.
- Report: `projects/chronicler/reports/vm-risk-validation.md` — document Phase 1 results.

#### Phase 2 (Automation Stack) — NOT STARTED

- `vm-ssh.sh`: SSH connection wrapper with retry, timeout, key handling.
- `vm-deploy.sh`: SCP-based deployment of Lua scripts, PS1 scripts, and configs.
- `vm-dfhack-cmd.sh`: Execute DFHack console commands via SSH → `dfhack-run`.
- `vm-service-manager.sh`: Start/stop HTTP server, bridge, PostgreSQL.
- VM lifecycle automation: start → wait for SSH → return IP.
- Snapshot management: stop → `qemu-img snapshot -c <name> <qcow2>` → start.
- Health check script: ping VM, test SSH, test DFHack RPC, check bridge freshness.
- `vm-deploy-all.sh`: One-command full Chronicler deployment.
- `vm-watch.sh`: Start watcher pointed at VM.
- Chronicler `config.py` update: remove hardcoded HomeServer IP (`192.168.4.194`), add `VM_HOST` auto-detection via `utmctl ip-address`.

#### Phase 3 (Chronicler Full Integration Against VM) — NOT STARTED

- Deploy bridge v6+ via `vm-deploy-all.sh`.
- Start bridge repeat job via SSH → `dfhack-run` or `onMapLoad.init`.
- Run `chronicler watch` against target host.
- Verify all data domains: `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- Verify v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.
- Trigger in-game change → verify `unit_events` row is created.
- Start `chronicler serve` → test web UI.
- Run full 131-test suite.
- 30-minute stability test: verify memory, connections, and data integrity.

#### Phase 4 (HomeServer SSH Enhancement) — NOT STARTED (parallel with 2–3)

- HomeServer currently works for DFHack RPC and SMB file transfer but lacks SSH, remote exec, and auto-start services.
- User-performed steps: Install OpenSSH Server via Settings, start and set sshd to Automatic, open firewall on port 22.
- Jarvis-autonomous steps after SSH is available:
  - Deploy SSH public key.
  - Verify key-based auth: `ssh Nathaniel@192.168.4.194 hostname`.
  - Test SCP file deploy.
  - Test remote PowerShell execution.
  - Create Task Scheduler job for auto-start HTTP server on login.
  - Test `dfhack-run` via SSH tunnel: `ssh -L 5001:localhost:5000 Nathaniel@192.168.4.194 -N`.

#### Phase 5 (Platform Decision + Windows App Foundation) — NOT STARTED

- Platform decision rule: If VM runs DF at >10 FPS with stable RPC → VM is primary. Otherwise → hybrid (HomeServer for DF, VM for packaging).
- Platform comparison:
  - VM (DF works): Full automation (utmctl + SSH), snapshots, offline dev, ARM Windows target, low complexity.
  - VM (packaging only) + HomeServer (DF): Split automation, partial offline dev, x86 Windows via HomeServer, medium complexity.
  - HomeServer only: SSH-only automation, no snapshots, no offline dev, x86 Windows (majority target), low complexity.
- Deliverable Windows app components:
  - Python runtime: PyInstaller → `chronicler.exe` (build on VM or HomeServer).
  - Database: Embedded PostgreSQL or SQLite (SQLite preferred for single-user simplicity).
  - LLM runtime: Bundled Ollama + Qwen3-1.7B, or llama.cpp for lighter footprint.
  - Web UI: FastAPI + Jinja2 on localhost (already built).
  - DFHack connector: TCP RPC client (already built in `client.py`).
  - Bridge auto-setup: Installer copies Lua script, auto-configures `onMapLoad.init`.
  - System tray: `pystray` for background service with Start/Stop controls.
  - Installer: NSIS or Inno Setup wrapping all components.
- Steps:
  1. Document Phase 1–4 results in `platform-decision.md`.
  2. Choose packaging tool (PyInstaller recommended for maturity).
  3. Create `packaging/` directory with build configs.
  4. Test basic `chronicler.exe` build in VM.
  5. Create installer script.
  6. Test full install → run → verify cycle in clean VM snapshot.
- Report: `projects/chronicler/reports/platform-decision.md`.

### Knowledge Horizon & Data Model Status

#### Built / Verified

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
| `knowledge_horizon` stub table + endpoint | Partial (stub only) |
| `history_events` dual-source schema | Built (CDM exists) |

#### Knowledge Horizon — Design complete, implementation not yet begun

- **Status**: Design complete; implementation not yet begun.
- **Prerequisites**: 4 exploration queries listed above must be run first.
- **Trigger for implementation**: When the LLM storyteller is being integrated with live database queries.
- **Created**: 2026-02-22, Session 32.

#### Unit-HF Field Mapping — Design complete, partially implemented

- **Status**: Design complete and revised; implementation partially in place (CDM schema exists with `units` and `historical_figures` tables; `history_events` table supports dual-source events).
- **Revision history**:
  - Created 2026-02-23, Session 33.
  - Updated 2026-02-23, Session 34: corrected event history source (was HF-only, now HF + live); added denizen registry reference.
- **Open work**: The `fortress_denizens` registry integration, NVS scoring, and embark dwarf handling are designed but not confirmed as fully implemented.

### Not Started / Gap (Full Inventory)

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
| Knowledge Horizon view-based masking implementation | P1 (blocks LLM storyteller integration) |
| Fortress denizens registry integration + NVS scoring | P1 |
| Embark dwarf synthetic HF generation | P1 |
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
| Post-parse cross-referencing pipeline (7 steps) | P2 |
| HF CDM missing medium-priority fields | P2 |
| Curse lineage tree | P3 |
| Warfare graph (Cytoscape.js cola) | P3 |
| War chord diagram (D3.js) | P3 |
| Event type breakdown bar chart | P3 |
| Mod awareness (active mods per world) | Deferred |
| df-ai stock advisor integration | Deferred |
| Raw mod file parser / conflict detection | Deferred |

---

## Design Decisions

### Explorer UI Architecture

- **Units and HFs are ontologically the same type of being**: Both have relationships, memberships, positions, biographical data. The disparity was a data extraction gap, not a conceptual one. This drove Phase 3 and the field mapping work.
- **Rich personality/attribute data stays in `details` JSONB**: Too varied and nested for columns. Only query-critical fields (`birth_year`, `sex`, `english_name`) get dedicated columns.
- **Do not refactor `explorer.py`**: Add new domain route files alongside it to avoid breaking existing functionality.
- **Preserve SQL runner**: Keep raw Database tab (formerly Schema/Data) available for ad-hoc queries; do not remove power-user access.
- **Single-world simplification**: Hardcode `world_id` in frontend calls; keep it in route signatures for schema correctness.
- **Personality data in separate bridge section (`dwarf_personality`)**: Keeps `unit_summary` lean; personality data is large and not always needed. Separation allows selective sync without re-syncing all unit fields.
- **Reuse vis.js graph**: The existing ego-network graph is functional; add "View graph" buttons throughout domain views rather than rebuilding graph logic.
- **Age is computed at display time**: Not stored; avoids staleness and is trivial to compute from `birth_year` and `current_game_year`.
- **Member limit raised to 1,000 with client-side sort/filter**: Avoids repeated round-trips for sort/filter operations on a fixed dataset.
- **Gender-appropriate titles**: Use `name_female` / `name_male` / `name` from entity_positions data; derive gender from `sex == 1 OR caste == "FEMALE"`.
- **Knowledge Horizon as a stub**: The concept is architecturally important for an AI storyteller, but computation is non-trivial; stub the table and toggle now, fill later.
- **HF↔Unit gap is a known data limitation**: Units born after the legends XML export have `hist_fig_id` values that exceed the maximum HF id; display graceful fallback rather than an error.
- **Explorer as the design workbench**: The Explorer is the planned design workbench for tier-propagation logic in the Knowledge Horizon (dynamic masking) system.
- **Three-tab structure** (Schema / Data / Graph) provides progressive complexity — now embedded as Database + Graph within the 6-tab structure.
- **Shared nav partial**: `_nav.html` avoids duplicating navigation HTML across templates.
- **vis.js from CDN**: Avoids adding a build step to the project.
- **SQL Runner two-layer safety**: keyword blocklist (defense-in-depth) + `conn.transaction(readonly=True)` as the primary guard; max 500 rows enforced.
- **Graph BFS depth clamped at 3**: Prevents runaway query expansion.
- **Graph batched fetches**: All entity/site detail fetches use `ANY($1::int[])` — no per-node N+1 queries.
- **Graph performance limits**: Hard limit at 1,000 nodes (expansion refused); warning at 500.
- **Node ID prefixing**: `hf-123`, `entity-456`, `site-789` avoids ID collisions between entity types in vis.js.

### Knowledge Horizon Design Choices

- **View-based masking preferred over shadow/materialized tables**: Avoids data duplication and sync complexity; naturally consistent with live data. Materialized views are the performance escape hatch if needed at 60K+ HF scale.
- **Civilization-broad membership does NOT propagate visibility**: A civilization has thousands of members — no individual carries a mental model of all of them. Cults and squads are small and do propagate because members realistically know each other.
- **Family depth cap at 3**: Extended family beyond depth 2 is masked unless another caveat independently reveals them — prevents unbounded graph traversal.
- **Synthetic HF records for starting dwarves**: Because the initial 7 dwarves have no legends records, heuristic inference is required. These records are flagged `source = 'inferred'` to distinguish them from canonical legends data.
- **In-world framing of ignorance**: The LLM must present masked knowledge as the fortress genuinely not knowing, not as a system limitation. This preserves narrative immersion.
- **Knowledge Horizon as a dedicated `knowledge_horizon` table**: A dedicated table with per-entity/per-HF/per-site visibility flags, updated by the watcher loop — not a one-time static filter.

### Unit-HF Merge Design Choices

- **Unit is authoritative for real-time state; HF is authoritative for historical facts**: This resolves the majority of field conflicts cleanly without case-by-case logic.
- **Personality is Unit-only**: Legends XML does not contain personality data. There is no HF-side override.
- **Dual-source event history**: The `history_events` table stores both legends-derived events and live watcher-generated events in the same schema, distinguished by `live_generated` flag and `source` column. This allows seamless narrative generation across pre-game history and in-game events.
- **Embark dwarf flag (`embark: true`)**: Embark dwarves (unit count <= 7, no HF record) are a known data gap. They are flagged explicitly rather than silently having missing history, allowing the storyteller to handle them with appropriate narrative framing.
- **`fortress_denizens` as routing layer**: The registry is the single source of truth for "who matters to the fortress right now" — preventing the LLM from treating every HF in the visible set as equally narrative-relevant.

### Event Type Storage Strategy

- **Store event type as TEXT, raw data in JSONB `details` column. No DB-level enum constraint.**
- Rationale: DF adds new event types with each release (8 DF 50.x types are not even in df-structures yet). A DB enum would break on import of any unknown type. TEXT + JSONB allows the LLM to interpret any type gracefully using raw field data, without requiring a per-type template.

### Narrative Engine: LLM Over Templates

- **Use LLM for all event narrative generation, not pre-built templates per type.**
- Rationale: 141 event types × multiple contexts = impractical template surface area. LLM reads raw `details` JSONB and generates perspective-aware narrative. Per-type templates still valuable as LLM prompts but not required as standalone renderers.

### Event Type Count Correction

- The research-synthesis.md reported 144 types from df-structures. The event-type-taxonomy.md corrects this: the actual `history_event_type` enum has 133 entries (excluding `NONE = -1`). The total canonical count is **141** (133 + 8 DF 50.x additions). All downstream tooling and planning must use 141, not 144.

### Transport: dfhack-run SSH Over TCP RPC

- **Use `dfhack-run` over SSH as primary live-data transport. TCP RPC abandoned for game-thread calls.**
- Rationale: TCP RPC is broken for game-thread calls on DFHack 53.x under Prism (ARM Windows VM). CoreSuspender cannot be acquired from the network thread. `dfhack-run` SSH executes Lua commands directly on the DFHack Core thread, bypassing this issue entirely. Verified access to all needed data domains.

### Visualization Stack

- **Recommended**: Leaflet.js for world map, Cytoscape.js (dagre layout) for family tree, Cytoscape.js (cola layout) for warfare graph, Chart.js for timelines/distribution, D3.js for chord diagrams.
- Rationale: These are the consensus implementations across all existing successful tools.

### Perspective-Aware Narrative (LB2 Gold Standard)

- **Implement LB2-style perspective-aware narrative** where viewing an entity's own page causes events involving that entity to render with pronouns/relational references rather than self-links.
- Rationale: LegendsBrowser2 is identified as the gold standard for this UX. LegendsViewer-Next omits it. weblegends implements the same pattern. It is essential for readable narrative in entity-centric views.

### Worldgen Monitoring

- **Build `worldgen-bridge.lua` for first-ever real-time worldgen dashboard.**
- Rationale: Novel capability (no existing tool does this), confirmed accessible via `df.global.world.worldgen_status`, already have a complete implementation template from research.

### Mod Management — Deferred

- **Defer full mod management. Only capture active mods list during worldgen monitoring.**
- Rationale: Mod management (raw parsing, conflict detection, profile management) is entirely outside Chronicler's core scope as a legends/history/live-fortress tool.

### Post-Parse Processing

- **Run a 7-step post-parse cross-referencing pass after every XML ingestion.**
- Rationale: All successful legends browsers do this (LV-Next: 12 steps, LB2: 6 steps). Without it, relational data (family links, flags, scores, kill lists) is incomplete. Failure to cross-reference is the primary source of data quality issues in simpler tools.

### Importance Scoring

- **Add `importance_score` to HF, site, artifact, and conflict CDM tables. Compute using df-narrator's formulas on ingestion.**
- Rationale: LLM context windows are finite. When generating world summaries or story narratives, the system needs a principled way to select which entities to include. df-narrator's scoring formulas are well-calibrated from empirical DF data.

### VM Platform Strategy

- **Prefer UTM VM over HomeServer** for full local control, offline dev, and snapshot capability.
- **HomeServer remains fallback** for DF hosting if VM cannot run DF under Prism double-emulation.
- **Phase 1 risk validation gates all further VM investment** — no premature commitment before the make-or-break emulation test.
- **Snapshot/restore capability** is a key VM advantage for clean Windows app packaging tests.
- **Decision rule is empirical and binary**: >10 FPS with stable RPC = VM primary; otherwise hybrid.
- **Fresh Windows install recommended** over password recovery for predictability.
- **Full autonomous bootstrap after guest agent availability** — user only handles GUI steps (OS install, Steam login, initial DF launch).
- **`exec-capture` / `exec-ps` pattern** chosen because `utmctl exec` cannot relay stdout.
- **Done-marker polling pattern** chosen over fixed sleep because PowerShell startup latency under Prism is variable (~10s).
- **Disk UUID auto-detection via glob** chosen because UUID changes on VM re-create.

### Windows App Architecture Decisions

- **PyInstaller** chosen as packaging tool (recommended for maturity over alternatives).
- **SQLite preferred** over embedded PostgreSQL for single-user app simplicity.
- **Bundled Ollama + Qwen3-1.7B** chosen for LLM runtime; llama.cpp noted as lighter alternative.
- **`pystray`** chosen for system tray background service.
- **NSIS or Inno Setup** for installer.
- **Bridge auto-setup via installer** copying Lua script + configuring `onMapLoad.init`.

### Config Hardcoding Fix

- Remove hardcoded `192.168.4.194` (HomeServer IP) from `config.py`.
- Replace with `VM_HOST` auto-detection via `utmctl ip-address` so config is not environment-specific.

---

## Open Items

### Explorer UI

- **Preferences field extraction**: `u.status.current_soul.preferences[i]` — planned but not yet extracted in the bridge script.
- **Need state extraction**: `u.counters2.hunger_timer` etc. — planned but not yet extracted.
- **LLM storyteller integration**: The unified person JSON schema from the field mapping doc is designed for LLM use, but actual integration with the storyteller has not been specified or implemented.
- **Full Knowledge Horizon computation logic**: How to populate the `knowledge_horizon` table based on actual fortress knowledge is entirely unspecified; stub only.
- **"View graph" buttons from domain views**: The requirement is stated but the specific implementation for each tab's "View graph" entry points is not detailed.
- **Events tab — Year range slider**: Whether using HTML5 range input, a JS library, etc., is not specified.
- **Geography tab — right panel detail**: What constitutes "notable inhabitants" and "historical events at this location" in the site detail card requires schema clarification.
- **Regions in Geography tab**: No detail given on what the Regions list shows beyond "regions list with type."
- **Database tab grouping**: Table grouping categories (Legends, Geography, Live, Monitoring) require a defined mapping from table names to categories; this logic is not specified.
- **Cross-linking from Events tab**: How clickable participants and locations navigate to People or Geography tabs is not specified.
- **Civilizations tab — Related events section**: How wars, conquests are fetched and displayed is not detailed.

### Knowledge Horizon

- Exact query form for the 4 prerequisite explorations (organization type counts, HF per organization, sample dwarf connection trace, starting dwarves without HF matches) has not yet been run against the Namoram world.
- Performance threshold at 60K+ HFs is unverified — unclear whether view-based masking will remain fast enough without materialized views.
- The NVS (narrative visibility score) formula for `fortress_denizens` is referenced but not yet defined.
- Interaction between Knowledge Horizon updates and the watcher loop (timing, frequency, incremental vs full refresh) is not yet specified.

### Unit-HF Merge

- The `fortress_denizens` registry integration and embark dwarf handling are designed but not confirmed as fully implemented in current codebase.
- NVS (narrative visibility score) formula is referenced but not defined in either source document.
- Handling of dwarves who are in the legends XML but are NOT fortress-relevant (e.g., distant HFs revealed by CAV-003 or CAV-006) needs a clear priority/filtering rule separate from `fortress_denizens`.

### Event Types

- 44 of 141 canonical types have zero occurrences in world 8 ("Thadar En") — either genuinely rare events or possibly a parsing gap. Needs verification against a larger or different world.
- The 8 DF 50.x Steam-era types are not in df-structures enum. Their full field schemas are undocumented — must be reverse-engineered from real DB records.
- Template/prompt coverage plan for all 19 non-LB2 types needs to be drafted.

### CDM Gaps

- Medium-priority HF missing fields (personality as stored in legends XML — values, ethics, mannerisms) may overlap with Unit personality data. The precise relationship needs to be documented: is legends-XML personality data the same as DFHack unit personality, or different?
- `WorldConstructions`, `ArtForms × 3`, `Identities`, and `Rivers` CDM tables are entirely absent. These need full schema design before implementation.
- `Entity Populations` extension scope is partially defined — needs a full field audit.

### Visualization

- No front-end framework decision has been documented for the full visualization suite. The visualization features require a web UI — whether this is a served web app, Electron, or something else is an open architectural question.
- PostGIS extension for spatial queries is mentioned as a Chronicler advantage but not yet provisioned.

### Live Bridge

- `eventful` subscriptions are confirmed available in DFHack but not yet implemented in Chronicler's bridge.
- Incident lookup (`df.global.world.incidents.all`) is referenced as the pattern for death cause resolution but not yet wired into the bridge.

### VM Infrastructure

- **Phase 1 outcome is unknown**: Whether DF + DFHack will actually run under Prism double-emulation is the central open question. All downstream VM phases depend on this result.
- **DFHack RPC on VM**: MEMORY.md notes that TCP RPC is broken for game-thread calls on DFHack 53.x under Prism. The relationship between the known RPC breakage and the Phase 1 validation plan (which still describes testing RPC methods) needs reconciliation. The intent is to validate that `dfhack-run` SSH works as the replacement transport.
- **Steam installation on ARM VM**: The plan calls for `winget install Valve.Steam` via SSH, but Steam may not support ARM Windows natively and may require x64 emulation. This is a risk not explicitly addressed.
- **HomeServer SSH**: Requires user action to install OpenSSH Server — no automated path until the user completes this step.
- **`vm-bootstrap.sh` execution**: SSH key-based auth is the last pending Phase 0 item; requires running `vm-bootstrap.sh` and verifying the result.
- **Windows app delivery target**: The deliverable Windows app is described architecturally but no implementation has begun. The SQLite vs. embedded PostgreSQL choice is listed as a preference (SQLite) but not a final decision.
- **ARM vs x86 Windows packaging target**: The VM provides ARM Windows; HomeServer provides x86_64. The majority of end-user machines are likely x86_64. The packaging strategy for targeting the right architecture is not fully resolved.
- **Qwen3-1.7B on Windows**: Whether the bundled Ollama + Qwen3-1.7B will run adequately on typical end-user Windows machines (without dedicated GPU) is not validated.
- **`chronicler.exe` naming and distribution**: No decisions on code signing, distribution channel, or update mechanism for the Windows app.

### Research Synthesis Source Verification

- Research synthesis references 8 deep-research reports across 12 repositories and 7 web-sourced threads, but the underlying repository list and thread list are not fully enumerated in the consolidated documents. Full source list should be preserved in the planning history document.

---

## Metrics & Targets

### World Data Reference

| World | DB Name | Events (legends XML) | Events (live) | HFs | Entities | Artifacts | Sites | Event Types Observed |
|---|---|---|---|---|---|---|---|---|
| "Namoram" | CDM (primary) | ~109K records total | — | — | — | — | — | — |
| "Thadar En" (world 8) | Chronicler DB | 312,254 | 442,716 | 48,366 | 4,901 | 8,035 | 2,154 | 97 of 141 |

### Data Scale Context

- 35K historical figures, 312K events, 208K relationship links, 70 live units (as of original design).
- 109K total records in world "Namoram" (per MEMORY.md).
- 35 PostgreSQL tables with composite PKs.
- 131 tests.
- Units table has ontological parity with HFs — both have relationships, memberships, positions, biographical data — but extraction was historically far less comprehensive for units.

### Knowledge Horizon Scale Targets

- Total CDM records (full unmasked): ~1.65M across 35 tables.
- Target HF scale: 60K+ HFs is the threshold at which view-based masking may need upgrading to materialized views for query performance.
- Visibility tier sizing: To be determined by the prerequisite exploration queries.

### Unit-HF Data Model Metrics

- Personality traits: 50 facets, each on a 0–100 scale.
- Physical attributes: 6 attributes (STR, AGI, etc.).
- Mental attributes: 12+ attributes (Analytical, Focus, etc.).
- Unit relationship slots: 9 slots in `units.details.relationships`.
- HF type flags: 6 boolean flags (is_deity, is_vampire, etc.).

### Event Frequency Reference (World 8, "Thadar En")

Most common event types:
- change hf state: 53,077
- change hf job: 49,584
- add hf entity link: 33,880
- written content composed: 26,819
- hf died: 20,620
- add hf hf link: 19,061
- hf simple battle event: 17,238

Rarest observed (present in world 8):
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
| 8 | Run Knowledge Horizon prerequisite exploration queries (4 tasks) | Knowledge Horizon design | Small |
| 9 | Implement `knowledge_horizon` table + view-based masking (blocks LLM storyteller) | Knowledge Horizon design | Medium |
| 10 | Implement `fortress_denizens` registry + NVS scoring | Unit-HF merge design | Medium |
| 11 | Implement embark dwarf synthetic HF generation (CAV-004) | Unit-HF merge design | Small |

### Tier 2 — High Value (visualization and data completeness)

| # | Action | Source | Effort |
|---|---|---|---|
| 12 | Interactive world map with Leaflet.js (CRS.Simple, site markers, civ colors) | LV-Next, LB2 | Large |
| 13 | Family tree visualization (Cytoscape.js dagre) | LV-Next, LB1 | Medium |
| 14 | Event timeline charts (Chart.js line/bar) | LV-Next | Medium |
| 15 | Population distribution charts | LV-Next, LB1 | Small |
| 16 | Hover popovers for entity preview | LB2 | Medium |
| 17 | Global search with autocomplete | LB2 | Medium |
| 18 | Add missing CDM entity types: WorldConstructions, ArtForms (3), Identities, Rivers | All legends browsers | Large |
| 19 | Extend HF CDM with missing medium-priority fields | All legends browsers | Medium |
| 20 | Post-parse cross-referencing pipeline (7 steps) | LV-Next, LB2 | Medium |

### Tier 3 — Bridge Enhancements

| # | Action | Source | Effort |
|---|---|---|---|
| 21 | Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, UNIT_NEW_ACTIVE, SYNDROME) | myDFHackScripts | Small |
| 22 | Death cause resolution via `df.global.world.incidents.all` | myDFHackScripts | Small |
| 23 | Parent/family chain extraction (`unit.relationship_ids.Mother/Father`) | myDFHackScripts | Small |
| 24 | Book/written work detection (`dfhack.items.getBookTitle`) | myDFHackScripts | Small |
| 25 | Create `worldgen-bridge.lua` for real-time worldgen monitoring | worldgen-scraping research | Medium |
| 26 | Add `worldgen_snapshots` CDM table | worldgen-scraping research | Small |

### Tier 4 — Stretch / Deferred

| # | Action | Source | Effort |
|---|---|---|---|
| 27 | Curse lineage tree (vampire/werebeast "who bit whom") | LB1 | Medium |
| 28 | Warfare graph (Cytoscape.js cola force-directed) | LV-Next | Medium |
| 29 | War chord diagram (D3.js) | LB1 | Medium |
| 30 | Mod awareness (record active mods per world) | mod-management research | Small |
| 31 | Stock threshold model from df-ai as LLM advisor context | df-ai | Medium |
| 32 | Raw file parser for mod conflict detection | mod-management research | Large |
