# Phase 3 Stage 3.0: CDM Schema Fixes

## Context

Phase 3 (Live Integration) requires the CDM schema to support multi-world live data, entity relationships, and event reconciliation. A Wiggum Loop audit identified 4 APPEND violations where the schema diverges from CDM conventions or is missing tables entirely. These must be fixed before Stage 3.1 (Bridge Enhancements) can begin, since the bridge code will target these new tables and the corrected PK.

## Changes

### 1. Migration SQL (`chronicler/db/migrate_stage30_cdm_fixes.sql`)

Create a new migration file with 4 violation fixes + supplementary column additions:

**V1 — Units PK fix** (composite PK alignment):
```sql
ALTER TABLE units DROP CONSTRAINT units_pkey;
ALTER TABLE units ADD PRIMARY KEY (world_id, id);
```

**V2 — Unit Events reconciliation columns**:
```sql
ALTER TABLE unit_events ADD COLUMN IF NOT EXISTS reconciled_event_id INTEGER;
ALTER TABLE unit_events ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
```

**V3 — Entity-Entity Links table** (new):
```sql
CREATE TABLE IF NOT EXISTS entity_entity_links (
    world_id            INT NOT NULL,
    source_entity_id    INT NOT NULL,
    target_entity_id    INT NOT NULL,
    link_type           TEXT NOT NULL,
    strength            SMALLINT DEFAULT 100,
    details             JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, source_entity_id, target_entity_id, link_type),
    FOREIGN KEY (world_id, source_entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE,
    FOREIGN KEY (world_id, target_entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE
);
```

**V4 — Entity-Site Links table** (new):
```sql
CREATE TABLE IF NOT EXISTS entity_site_links (
    world_id            INT NOT NULL,
    entity_id           INT NOT NULL,
    site_id             INT NOT NULL,
    link_type           TEXT NOT NULL,
    flags               JSONB DEFAULT '{}',
    start_year          INT,
    end_year            INT,
    link_strength       INT DEFAULT 100,
    details             JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, entity_id, site_id, link_type),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id) ON DELETE CASCADE,
    FOREIGN KEY (world_id, site_id) REFERENCES sites(world_id, id) ON DELETE CASCADE
);
```

**Supplementary columns** (needed by Stage 3.1 bridge):
```sql
ALTER TABLE hf_links ADD COLUMN IF NOT EXISTS strength SMALLINT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS founded_year INT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS founder_entity_id INT;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends_xml';
```

**Indexes** for new tables:
```sql
CREATE INDEX IF NOT EXISTS idx_eel_target ON entity_entity_links(world_id, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_esl_site ON entity_site_links(world_id, site_id);
CREATE INDEX IF NOT EXISTS idx_unit_events_reconciled ON unit_events(reconciled_event_id) WHERE reconciled_event_id IS NOT NULL;
```

### 2. Update `schema.sql` (canonical schema)

Update `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`:
- Change `units` table: `id INT PRIMARY KEY` → `PRIMARY KEY (world_id, id)` with `id INT NOT NULL`
- Add `unit_events` reconciliation columns to the table definition
- Add new `entity_entity_links` and `entity_site_links` table definitions
- Add supplementary columns to `hf_links`, `sites`, `history_events` definitions
- Add new indexes

### 3. Fix Python code (ripple from V1 PK change)

**`chronicler/dfhack/sync.py:34`** — Critical breakage:
- `ON CONFLICT (id) DO UPDATE SET` → `ON CONFLICT (world_id, id) DO UPDATE SET`
- Remove `world_id = EXCLUDED.world_id` from the UPDATE SET (it's now part of the PK)

**`chronicler/denizens.py:484`** — Missing world_id in JOIN:
- `JOIN units u ON u.id = d.unit_id` → `JOIN units u ON u.id = d.unit_id AND u.world_id = d.world_id`

### 4. Run migration against live DB

```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron
.venv/bin/python -c "
import asyncio, asyncpg
async def migrate():
    conn = await asyncpg.connect('postgresql://localhost/chronicler')
    with open('chronicler/db/migrate_stage30_cdm_fixes.sql') as f:
        await conn.execute(f.read())
    await conn.close()
asyncio.run(migrate())
"
```

### 5. Existing ingestion pipeline test

Run the existing legends ingestion to verify no regressions:
```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron
.venv/bin/chronicler ingest data/legends/region1-post-embark --world-id 1 --drop
```

## Verification

1. **Schema check**: Query `information_schema.columns` to confirm new columns/tables exist
2. **PK check**: `\d units` shows `PRIMARY KEY (world_id, id)`
3. **Python check**: Run `chronicler ingest` with test data — no errors on `ON CONFLICT`
4. **JOIN check**: Run denizens query manually to verify the world_id JOIN works
5. **New tables check**: `SELECT count(*) FROM entity_entity_links` and `entity_site_links` return 0 (empty but exist)

## Files Touched

| File | Action |
|------|--------|
| `chronicler/db/migrate_stage30_cdm_fixes.sql` | CREATE (new migration) |
| `chronicler/db/schema.sql` | EDIT (PK fix, new tables, new columns) |
| `chronicler/dfhack/sync.py` | EDIT (ON CONFLICT fix) |
| `chronicler/denizens.py` | EDIT (JOIN fix) |
