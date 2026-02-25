# Entity Position Extraction — Implementation Plan [COMPLETE]

## Context

The Knowledge Horizon masking system requires position data to implement tier-based visibility (civilization nobles always visible, religion title-holders always visible). The CDM has **zero position data** despite the legends XML containing 11,712 position definitions, 13,501 current assignments, and 41,199 historical position links. The parser skips all position-related elements. This plan extracts them.

**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## New CDM Tables

### `entity_positions` — Position definitions per entity

Source: legends_plus `<entity_position>` nested inside `<entity>` elements.

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

Expected: ~11,712 rows.

### `hf_position_links` — Who held which position, when

Sources: standard legends `<entity_position_link>` + `<entity_former_position_link>` on HFs, plus legends_plus `<entity_position_assignment>` on entities.

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

Expected: ~41,199 rows (6,843 active + 34,356 former) from legends.xml, plus up to 13,501 from legends_plus assignments (mostly overlapping).

---

## Parser Modifications

### File: `chronicler/ingest/xml_parser.py`

### 1. Modify `_parse_historical_figures()` (line 169)

Add `hf_position_link_rows` as a 5th return list. After the site_link loop (line 263), add:

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

### 2. Modify `_parse_legends_plus()` (line 451)

Add two new keys to the result dict:
- `"entity_positions"` — position definitions from `<entity_position>` children
- `"entity_position_assignments"` — current holders from `<entity_position_assignment>` children

In the entity enrichment loop (line 530), add after the `ent_details` extraction:

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

### 3. Modify `import_legends()` — Step 4 insertion (line 700)

After the `hf_site_links` batch insert (line 731), add:

```python
# HF position links (from standard legends)
n = await _batch_insert(conn, "hf_position_links",
    ["world_id", "hf_id", "entity_id", "position_id",
     "start_year", "end_year"],
    hf_position_link_rows,
    on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
counts["hf_position_links"] = n
log.info("  hf_position_links: %d", n)
```

### 4. Modify `import_legends()` — Step 5 legends_plus enrichment (line 793)

After the entity enrichment insert (line 843), add:

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
        ["world_id", "hf_id", "entity_id", "position_id",
         "start_year", "end_year"],
        plus_data["entity_position_assignments"],
        on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
    counts["entity_position_assignments"] = n
    log.info("  entity_position_assignments: %d", n)
```

---

## Schema Migration

### File: `chronicler/db/schema.sql`

Add the two new CREATE TABLE statements after `hf_site_links` (after line 159).

### File: `chronicler/db/migrate_positions.sql` (new)

Standalone migration for existing databases:

```sql
-- Entity position extraction migration
CREATE TABLE IF NOT EXISTS entity_positions (...);
CREATE TABLE IF NOT EXISTS hf_position_links (...);
CREATE INDEX IF NOT EXISTS ...;
```

---

## Explorer Integration

### File: `chronicler/api/routes/explorer.py`

Add the new tables to `TABLE_GROUPS`:

```python
"Relationships": [
    "hf_links", "hf_entity_links", "hf_site_links",
    "hf_position_links", "entity_positions",       # ← new
    ...
]
```

Update `_TABLE_TO_GROUP` reverse lookup (automatic from the loop).

---

## FK Ordering Constraint

The `hf_position_links` table has FKs to both `entities` and `historical_figures`. In the current pipeline:
- Entities are inserted at line ~697
- HFs are inserted at line ~704
- HF links follow at lines 714-731

Position links from standard legends go here (after HFs, line 731).

Position definitions from legends_plus go in Step 5 (after entities exist).
Position assignments from legends_plus also go in Step 5 (after both entities and HFs exist).

**No FK ordering issues** — both dependencies are satisfied by the time we insert.

However: `hf_position_links` from legends_plus assignments reference HF IDs that may not exist if the HF was in legends_plus but not in standard legends. Use `DO NOTHING` on conflict and skip failed FKs silently (same pattern as existing link tables).

---

## Verification

1. **Run migration** on existing `chronicler` database
2. **Re-ingest** world 5 (Namoram): `chronicler ingest data/legends/region2-legends.xml --legends-plus data/legends/region2-legends_plus.xml`
3. **Verify counts**:
   - `entity_positions`: expect ~11,712 rows
   - `hf_position_links`: expect ~41,000-55,000 rows (legends + legends_plus merged)
4. **Verify joins**:
   ```sql
   -- Position names for a sample civilization
   SELECT ep.name, ep.name_male, ep.name_female, e.name as entity_name
   FROM entity_positions ep
   JOIN entities e ON e.world_id = ep.world_id AND e.id = ep.entity_id
   WHERE ep.world_id = 5 AND e.type = 'civilization'
   LIMIT 20;

   -- Current position holders with resolved names
   SELECT hf.name as holder, ep.name as position, ep.name_male, e.name as entity_name
   FROM hf_position_links hpl
   JOIN historical_figures hf ON hf.world_id = hpl.world_id AND hf.id = hpl.hf_id
   JOIN entity_positions ep ON ep.world_id = hpl.world_id AND ep.entity_id = hpl.entity_id AND ep.position_id = hpl.position_id
   JOIN entities e ON e.world_id = hpl.world_id AND e.id = hpl.entity_id
   WHERE hpl.world_id = 5 AND hpl.end_year IS NULL
   ORDER BY e.name, ep.position_id
   LIMIT 20;
   ```
5. **Run test suite**: `pytest tests/ -q` — all 131 tests must pass
6. **Explorer check**: new tables appear in Schema tab under "Relationships" group

---

## Files Modified

| Action | File |
|--------|------|
| Modify | `chronicler/db/schema.sql` — add 2 tables + indexes |
| Create | `chronicler/db/migrate_positions.sql` — standalone migration |
| Modify | `chronicler/ingest/xml_parser.py` — 4 changes (parse functions + import pipeline) |
| Modify | `chronicler/api/routes/explorer.py` — add tables to TABLE_GROUPS |

---

*Plan created 2026-02-22, Session 32*
