# Consolidation: Entity Position Extraction & Data Ingestion

## Source Documents

- `sparkling-sauteeing-snowglobe.md` (Entity Position Extraction): A complete implementation plan for extracting position definitions and position-holding records from Legends XML sources into two new CDM tables, enabling the Knowledge Horizon masking system's tier-based visibility rules.
- `df-ingestion-plan.md` (DF Data Ingestion & RAG Indexing): A draft plan to comprehensively index all relevant Dwarf Fortress codebase repositories, wiki documentation, and research materials into Qdrant for semantic search across the entire Chronicler project.

---

## Features & Requirements

### Entity Position Extraction (from `sparkling-sauteeing-snowglobe.md`)

- Extract all position data from the Legends XML that the parser previously skipped entirely:
  - 11,712 position definitions
  - 13,501 current position assignments
  - 41,199 historical position links
- Store position **definitions** per entity (generic and gendered names, spouse titles) in a new `entity_positions` table.
- Store **who held which position and when** (active and former) in a new `hf_position_links` table, merging data from standard legends and legends_plus.
- Support the **Knowledge Horizon masking system** with tier-based visibility:
  - Civilization nobles always visible
  - Religion title-holders always visible
  - Positions are the mechanism that enables these rules
- Expose new tables in the Database Explorer UI under the "Relationships" group.
- Support re-ingestion of existing worlds (idempotent upserts, DO NOTHING on conflict for FK mismatches).

### RAG / Semantic Search Indexing (from `df-ingestion-plan.md`)

- Build a comprehensive, searchable knowledge base across all DF reference sources to support Chronicler feature development and AI components.
- Index all relevant DF codebase repos into dedicated Qdrant collections:
  - `df-ai` — autonomous fort AI plugin (best DFHack plugin API reference)
  - `weblegends` — web legends viewer plugin (event/entity field reference for CDM)
  - `myDFHackScripts` — Lua scripting patterns for data emission (append to existing `dfhack` collection)
  - `df-structures` — XML definitions of ALL DF memory structures (canonical CDM data dictionary; CRITICAL priority)
  - `df-narrator` — Python legends XML parser + AI narrator pipeline (prototype of Chronicler storyteller)
  - `dfhack-client-python` — Python RPC client for Chronicler Phase 0 live data access
- Index DF wiki articles selectively (~500–800 high-value core articles out of 43,621 total pages):
  - Phase 1: Core gameplay categories (~300 pages): fortress mode, guides, game mechanics, interface, buildings, items, designations, industry, labors, jobs, healthcare, justice, dwarves, economy, getting started, fortress defense.
  - Phase 2: World/history/legends categories (~150 pages): adventure mode, events, lore, biomes, major humanoid races/civs, creature attributes; plus standalone pages for Legends, World_generation, Historical_figure, Entity, Site, Artifact, Personality_trait, Emotion, Thought, Need, Skill, Attribute, Military, Noble, Occupation, Position, Material, Metal, Stone, Wood, Gem.
  - Phase 3: Modding/data reference (~100 pages): game files reference, selective creature raw pages, building raw pages, selective inorganic/material raw pages.
- Index additional research documents into the `research` collection:
  - `dwarf-fortress-project-plan.md`
  - `features.txt` from myDFHackScripts
  - Any additional research notes generated during the process.
- Enable semantic search across all DF knowledge sources to support the AI Storyteller, AI Player, CDM design, and all other Chronicler components.

---

## Implementation Details

### New CDM Tables

#### `entity_positions` — Position definitions per entity

Source: legends_plus `<entity_position>` elements nested inside `<entity>`.

```sql
CREATE TABLE IF NOT EXISTS entity_positions (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,      -- local ID within entity (0, 1, 2...)
    name            TEXT,              -- generic name ("monarch", "general")
    name_male       TEXT,              -- gendered variant ("king")
    name_female     TEXT,              -- gendered variant ("queen")
    spouse          TEXT,              -- spouse title ("king consort")
    spouse_male     TEXT,
    spouse_female   TEXT,
    UNIQUE (world_id, entity_id, position_id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_entity_positions_entity
    ON entity_positions(world_id, entity_id);
```

Expected rows: ~11,712.

#### `hf_position_links` — Who held which position, when

Sources: standard legends `<entity_position_link>` + `<entity_former_position_link>` on HFs; legends_plus `<entity_position_assignment>` on entities.

```sql
CREATE TABLE IF NOT EXISTS hf_position_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    hf_id           INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,      -- references entity_positions.position_id
    start_year      INT,
    end_year        INT,               -- NULL = currently held
    UNIQUE (world_id, hf_id, entity_id, position_id, start_year),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_hf
    ON hf_position_links(world_id, hf_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_entity
    ON hf_position_links(world_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_current
    ON hf_position_links(world_id, entity_id) WHERE end_year IS NULL;
```

Expected rows: ~41,000–55,000 (legends + legends_plus merged). 6,843 active + 34,356 former from legends.xml, plus up to 13,501 from legends_plus (mostly overlapping).

### Parser Modifications — `chronicler/ingest/xml_parser.py`

#### 1. Modify `_parse_historical_figures()` (line 169)

Add `hf_position_link_rows` as a 5th return list. After the site_link loop (line 263), parse active and former position links:

```python
# Position links (active)
for link in hf.findall("entity_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),  # maps to entity_positions.position_id
        _int(link, "start_year"),
        None,  # end_year (active = currently held)
    ))

# Former position links
for link in hf.findall("entity_former_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),
        _int(link, "start_year"),
        _int(link, "end_year"),
    ))
```

Return signature changes from `tuple[list, list, list, list]` to `tuple[list, list, list, list, list]`.

#### 2. Modify `_parse_legends_plus()` (line 451)

Add two new keys to the result dict: `"entity_positions"` and `"entity_position_assignments"`. In the entity enrichment loop (line 530), after `ent_details` extraction:

```python
# Position definitions
for pos in ent.findall("entity_position"):
    result["entity_positions"].append((
        world_id, eid,
        _int(pos, "id"),
        _text(pos, "name"),
        _text(pos, "name_male"),
        _text(pos, "name_female"),
        _text(pos, "spouse"),
        _text(pos, "spouse_male"),
        _text(pos, "spouse_female"),
    ))

# Current position assignments
for assign in ent.findall("entity_position_assignment"):
    histfig = _int(assign, "histfig")
    pos_id = _int(assign, "position_id")
    if histfig is not None and pos_id is not None:
        result["entity_position_assignments"].append((
            world_id, histfig, eid, pos_id,
            None, None,  # start/end year not in assignments
        ))
```

#### 3. Modify `import_legends()` — Step 4 (line 700): insert HF position links from standard legends

After `hf_site_links` batch insert (line 731):

```python
n = await _batch_insert(conn, "hf_position_links",
    ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
    hf_position_link_rows,
    on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
counts["hf_position_links"] = n
log.info("  hf_position_links: %d", n)
```

#### 4. Modify `import_legends()` — Step 5 (line 793): insert legends_plus position data

After entity enrichment insert (line 843):

```python
# Entity position definitions
if plus_data.get("entity_positions"):
    n = await _batch_insert(conn, "entity_positions",
        ["world_id", "entity_id", "position_id", "name",
         "name_male", "name_female", "spouse", "spouse_male", "spouse_female"],
        plus_data["entity_positions"],
        on_conflict="(world_id, entity_id, position_id) DO UPDATE SET "
            "name = COALESCE(EXCLUDED.name, entity_positions.name), "
            "name_male = COALESCE(EXCLUDED.name_male, entity_positions.name_male), "
            "name_female = COALESCE(EXCLUDED.name_female, entity_positions.name_female), "
            "spouse = COALESCE(EXCLUDED.spouse, entity_positions.spouse), "
            "spouse_male = COALESCE(EXCLUDED.spouse_male, entity_positions.spouse_male), "
            "spouse_female = COALESCE(EXCLUDED.spouse_female, entity_positions.spouse_female)")
    counts["entity_positions"] = n
    log.info("  entity_positions: %d", n)

# Position assignments from legends_plus (merge with position links)
if plus_data.get("entity_position_assignments"):
    n = await _batch_insert(conn, "hf_position_links",
        ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
        plus_data["entity_position_assignments"],
        on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
    counts["entity_position_assignments"] = n
    log.info("  entity_position_assignments: %d", n)
```

### Schema Migration

- **`chronicler/db/schema.sql`**: Add two new CREATE TABLE statements after `hf_site_links` (after line 159).
- **`chronicler/db/migrate_positions.sql`** (new file): Standalone migration for existing databases with the two new CREATE TABLE + CREATE INDEX statements.

### Explorer Integration — `chronicler/api/routes/explorer.py`

Add new tables to `TABLE_GROUPS["Relationships"]`:

```python
"Relationships": [
    "hf_links", "hf_entity_links", "hf_site_links",
    "hf_position_links", "entity_positions",       # new
    ...
]
```

`_TABLE_TO_GROUP` reverse lookup updates automatically from the loop.

### FK Ordering Constraints

- Entities inserted at line ~697; HFs at line ~704; HF links at lines 714–731.
- Position links from standard legends insert after HFs (line 731) — no FK ordering issues.
- Position definitions from legends_plus insert in Step 5 (after entities exist).
- Position assignments from legends_plus insert in Step 5 (after both entities and HFs exist).
- Legends_plus assignments may reference HF IDs not present in standard legends — handled with `DO NOTHING` on FK violation (same pattern as existing link tables).

### RAG Ingestion — Codebase Repos

| Stream | Repo | Collection | Files | Est. Points |
|--------|------|------------|-------|-------------|
| 1A | `df-ai` (already cloned at `projects/df-ai/`) | `df-ai` (new) | All `.cpp`/`.h` in root, ~32k lines, 71 files | ~1,500–2,000 |
| 1B | `weblegends` (already cloned at `projects/weblegends/`) | `weblegends` (new) | All `.cpp`/`.h` in root + `events/` + `helpers/`, ~20k lines; priority: `events/*.cpp` (94 files) + `render_*.cpp` | ~3,000–4,000 |
| 1C | `myDFHackScripts` (already cloned at `projects/myDFHackScripts/`) | `dfhack` (append) | All `.lua` files, ~3.5k lines, 15 substantive scripts; exclude test*.lua, Incest.lua, .log | ~200–300 |
| 1D | `df-structures` (NOT YET CLONED — CRITICAL) | `df-structures` (new) | All `.xml` structure definition files (14+ key files: units, souls, history, entities, sites, items, artifacts, languages, regions, materials); exclude `.xsd`, Perl scripts | ~2,000–3,000 |
| 1E | `df-narrator` (NOT YET CLONED — HIGH) | `df-narrator` (new) | All `.py` files; working legends XML parser + embedding + chatbot pipeline | ~300–500 |
| 1F | `dfhack-client-python` (NOT YET CLONED — HIGH) | `dfhack-client-python` (new) | All `.py` + `.proto` files; Python RPC interface to DFHack | ~100–200 |

Not-yet-cloned repos also identified (MEDIUM/LOW priority):
- `LegendsBrowser2` (robertjanetzko/LegendsBrowser2) — Go legends browser, streaming XML parser reference
- `LegendsViewer-Next` (Kromtec/LegendsViewer-Next) — .NET + Vue frontend, viewer design reference
- `df-sites-analyzer` (DrPhilHarmonik/df-sites-analyzer) — small Python analysis scripts

### RAG Ingestion — Wiki (MediaWiki API)

Method:
1. MediaWiki API: `action=query&prop=extracts&explaintext=true&titles=PAGE`
2. Fetch page content as plain text (MediaWiki wikitext → text)
3. Chunk into ~1000-char segments with page title + section headers as metadata
4. Embed via MLX (Qwen3-Embedding-4B at `localhost:8000`)
5. Store in `df-wiki` collection with metadata: `{page_title, section, category, url}`
6. Add 1s delay between pages to avoid API rate limiting

### RAG Infrastructure

- **jarvis-rag MCP**: `ingest_file`, `ingest_directory` tools for codebase indexing
- **MLX embedding server**: `localhost:8000`, already running; model: Qwen3-Embedding-4B (2560-dim)
- **Qdrant**: `localhost:6333`, already running and healthy; all collections use 2560-dim Cosine
- **Python script**: Custom MediaWiki API crawler for wiki ingestion (to be written)
- **Git**: Clone missing repos before indexing

### Execution Order (RAG Plan)

1. Clone missing repos: df-structures, df-narrator, dfhack-client-python
2. Index codebase repos (Streams 1A–1F) — parallel ingestion via jarvis-rag MCP
3. Index research docs (Stream 3) — quick, 2–3 documents
4. Build wiki ingestion script (Python, MediaWiki API)
5. Run wiki ingestion (Stream 2, Phase 1 → 2 → 3)
6. Validate — demonstrate semantic search across all collections

---

## Status & Completion

### Entity Position Extraction

- **Status**: COMPLETE (plan marked `[COMPLETE]`, created 2026-02-22, Session 32)
- CDM had zero position data before this work despite the XML containing 11,712 position definitions, 13,501 current assignments, and 41,199 historical links.
- All parser modifications, schema migration, and explorer integration defined and presumably implemented.
- Re-ingestion of world 5 (Namoram) required after schema migration.

### RAG Indexing Plan

- **Status**: Draft (dated 2026-02-19)
- Already indexed at time of plan:
  - `dfhack` collection: 8,476 points (DFHack core + scripts)
  - `dwarf-therapist` collection: 926 points (Dwarf Therapist C++/Qt source)
  - `df-wiki` collection: 4 points (barely started — only 3 creature stubs)
- Already cloned but NOT indexed at time of plan: `df-ai`, `weblegends`, `myDFHackScripts`
- Not yet cloned at time of plan: `df-structures`, `df-narrator`, `dfhack-client-python`, `LegendsBrowser2`, `LegendsViewer-Next`, `df-sites-analyzer`
- Execution status (beyond the draft date) unknown from document alone.

---

## Key Decisions & Design Choices

### Entity Position Extraction

- **Dual-source merge strategy**: Position links come from two sources (standard legends XML and legends_plus XML). Both are merged into a single `hf_position_links` table using `DO NOTHING` on conflict, so overlapping records from both sources do not create duplicates.
- **NULL end_year = active**: A `NULL` value in `end_year` signals a currently-held position. A partial index on this condition supports efficient queries for current holders.
- **Position IDs are entity-local**: `position_id` is a local identifier within an entity (0, 1, 2...), not globally unique. The composite key `(world_id, entity_id, position_id)` is the correct reference.
- **Legends_plus assignments lack year data**: `<entity_position_assignment>` elements do not carry start/end year, so those fields are stored as NULL. This means assignment rows from legends_plus may land in the `DO NOTHING` path if a corresponding legends link already covers the same (hf, entity, position) combination with a real start_year.
- **Upsert on position definitions**: Position definitions use `DO UPDATE SET ... COALESCE(...)` rather than `DO NOTHING` to allow legends_plus to enrich records already inserted from standard legends (e.g., filling in gendered name variants).
- **Knowledge Horizon dependency**: This entire feature exists to enable the Knowledge Horizon masking system's tier-based visibility rules. Without position data, nobles and title-holders cannot be reliably identified for always-visible tier assignment.

### RAG Indexing

- **Selective wiki crawl**: 43,621 wiki pages exist, but only ~500–800 are high-value for Chronicler development. Bulk crawl avoided in favor of targeted category-based selection.
- **df-structures rated CRITICAL**: This is the most important single repo for CDM design — it is the canonical data dictionary for all DF memory structures.
- **df-narrator rated HIGH**: It represents a working prototype of the Chronicler AI storyteller pipeline (legends XML parser + embedding + chatbot), making it a direct design reference.
- **dfhack-client-python rated HIGH**: Needed for Chronicler Phase 0 live data access via DFHack RPC.
- **Chunking strategy**: Codebase files chunked per-function or ~500-line segments; wiki articles chunked at ~1000-char segments — both include contextual metadata (file path, page title, section).
- **Parallel ingestion**: Codebase repo indexing to be executed in parallel via jarvis-rag MCP to minimize elapsed time.
- **myDFHackScripts appended to existing dfhack collection**: Rather than a new collection, Lua scripts augment the existing DFHack codebase collection to keep DFHack-related content co-located for semantic search.

---

## Metrics & Targets

### Entity Position Extraction

| Table | Expected Row Count |
|-------|--------------------|
| `entity_positions` | ~11,712 |
| `hf_position_links` (combined) | ~41,000–55,000 |
| — Active (end_year IS NULL) | ~6,843 (from legends) + overlap from legends_plus |
| — Former | ~34,356 (from legends) |
| — From legends_plus assignments | up to ~13,501 (mostly overlapping) |

- Test suite: all 131 tests must pass after changes (`pytest tests/ -q`).
- Explorer check: new tables must appear in Schema tab under "Relationships" group.

### Verification Queries

Position names for a sample civilization:
```sql
SELECT ep.name, ep.name_male, ep.name_female, e.name as entity_name
FROM entity_positions ep
JOIN entities e ON e.world_id = ep.world_id AND e.id = ep.entity_id
WHERE ep.world_id = 5 AND e.type = 'civilization'
LIMIT 20;
```

Current position holders with resolved names:
```sql
SELECT hf.name as holder, ep.name as position, ep.name_male, e.name as entity_name
FROM hf_position_links hpl
JOIN historical_figures hf ON hf.world_id = hpl.world_id AND hf.id = hpl.hf_id
JOIN entity_positions ep ON ep.world_id = hpl.world_id AND ep.entity_id = hpl.entity_id AND ep.position_id = hpl.position_id
JOIN entities e ON e.world_id = hpl.world_id AND e.id = hpl.entity_id
WHERE hpl.world_id = 5 AND hpl.end_year IS NULL
ORDER BY e.name, ep.position_id
LIMIT 20;
```

### RAG Indexing — Final State Targets

| Collection | Est. Points | Content |
|-----------|-------------|---------|
| `dfhack` | ~8,700 | DFHack core + scripts + myDFHackScripts |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source |
| `df-ai` | ~1,500–2,000 | Autonomous fort AI plugin |
| `weblegends` | ~3,000–4,000 | Web legends viewer plugin |
| `df-structures` | ~2,000–3,000 | DF memory structure XML definitions |
| `df-narrator` | ~300–500 | Python legends parser + narrator |
| `dfhack-client-python` | ~100–200 | Python RPC client |
| `df-wiki` | ~5,000–8,000 | Core DF wiki articles (~500–800 pages) |
| `research` | ~1,200 | DF project plan + features notes |

- **Total new points from plan**: ~12,000–18,000
- **Grand total across all DF collections after plan**: ~21,000–27,000 points
- **MLX bulk embedding estimate**: ~30–60 minutes for ~20k chunks
- **Qdrant memory impact**: ~200MB additional RAM for ~20k points at 2560-dim (within capacity)

---

## Files Modified / Touched

### Entity Position Extraction

| Action | File |
|--------|------|
| Modify | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql` — add 2 tables + indexes after `hf_site_links` (after line 159) |
| Create | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/migrate_positions.sql` — standalone migration for existing databases |
| Modify | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` — 4 changes: `_parse_historical_figures()` (line 169), `_parse_legends_plus()` (line 451), `import_legends()` Step 4 (line 700), `import_legends()` Step 5 (line 793) |
| Modify | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py` — add tables to TABLE_GROUPS |

### RAG Indexing (planned, not necessarily complete)

| Action | Target |
|--------|--------|
| Clone | `df-structures` from DFHack/df-structures |
| Clone | `df-narrator` from DrPhilHarmonik/df-narrator |
| Clone | `dfhack-client-python` from McArcady/dfhack-client-python |
| Create | Python MediaWiki API crawler script |
| Ingest | All `.cpp`/`.h` from `projects/df-ai/` → `df-ai` Qdrant collection |
| Ingest | All `.cpp`/`.h` from `projects/weblegends/` → `weblegends` Qdrant collection |
| Ingest | All `.lua` from `projects/myDFHackScripts/` → `dfhack` Qdrant collection (append) |
| Ingest | All `.xml` from `df-structures/` → `df-structures` Qdrant collection |
| Ingest | All `.py` from `df-narrator/` → `df-narrator` Qdrant collection |
| Ingest | All `.py`/`.proto` from `dfhack-client-python/` → `dfhack-client-python` Qdrant collection |
| Ingest | `dwarf-fortress-project-plan.md`, `features.txt` → `research` Qdrant collection |
| Ingest | ~500–800 DF wiki articles (3 phases) → `df-wiki` Qdrant collection |
