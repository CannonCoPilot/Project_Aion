# Plan: Fix Duplicate Leaders in Entity Detail Page

## Context

The Leaders tab on entity detail pages shows duplicate entries: every **current** position holder appears twice — once with a start year and once with `?`. This affects 2,120 position holder groups across all entities in the database.

**Root cause**: Position links are ingested from two XML sources:
1. `legends.xml` → `<entity_position_link>` with `start_year` (e.g., year 196)
2. `legends_plus.xml` → `<entity_position_assignment>` with **no start/end years** (NULL)

Both are inserted into `hf_position_links`. The unique constraint on `(world_id, hf_id, entity_id, position_id, start_year)` doesn't catch duplicates because PostgreSQL treats `NULL ≠ NULL` — so `(1, 32247, 1007, 0, 196)` and `(1, 32247, 1007, 0, NULL)` are considered distinct.

A partial unique index `idx_hf_position_links_null_start_dedup` prevents multiple NULL-start rows for the same combo, but doesn't prevent a NULL row from coexisting with a dated row.

## Fix: Two layers

### Layer 1: Ingestion fix (prevent future duplicates)

**File**: `chronicler/api/routes/../../../chronicler/ingest/xml_parser.py` (line 1418-1423)

Before inserting `entity_position_assignments`, delete any NULL-start rows where a dated row already exists for the same `(world_id, hf_id, entity_id, position_id)`:

```python
# Delete NULL-start assignments that will be superseded by dated legends.xml rows
await conn.execute("""
    DELETE FROM hf_position_links a
    USING hf_position_links b
    WHERE a.world_id = b.world_id AND a.hf_id = b.hf_id
      AND a.entity_id = b.entity_id AND a.position_id = b.position_id
      AND a.start_year IS NULL AND b.start_year IS NOT NULL
      AND a.world_id = $1
""", world_id)
```

Actually, better approach: after inserting assignments with `ON CONFLICT DO NOTHING`, run a cleanup that removes NULL-start rows where a dated row exists. This handles both orderings (legends first or plus first).

### Layer 2: UI deduplication (handle existing data)

**File**: `chronicler/api/routes/detail_pages.py` (the leaders query, ~line 1228)

Modify the Leaders query to consolidate duplicates by preferring the row with a start_year. Use `DISTINCT ON (hf_id, position_id)` ordered to prefer non-NULL start_year:

```sql
SELECT DISTINCT ON (p.hf_id, p.position_id)
    p.hf_id, p.position_id, p.start_year, p.end_year,
    h.name AS hf_name, h.race AS hf_race,
    ep.name AS position_name
FROM hf_position_links p
JOIN historical_figures h ON h.world_id = p.world_id AND h.id = p.hf_id
LEFT JOIN entity_positions ep ON ep.world_id = p.world_id
      AND ep.entity_id = p.entity_id AND ep.position_id = p.position_id
WHERE p.world_id = $1 AND p.entity_id = $2
ORDER BY p.hf_id, p.position_id, p.start_year DESC NULLS LAST
```

Wait — that collapses *legitimate* multi-stints (same person, different time periods). We need to keep those. The issue is specifically NULL-start rows that duplicate a dated row.

Better: filter out NULL-start rows when a dated row exists for the same (hf_id, entity_id, position_id):

```sql
SELECT p.hf_id, p.position_id, p.start_year, p.end_year,
       h.name AS hf_name, h.race AS hf_race,
       ep.name AS position_name
FROM hf_position_links p
JOIN historical_figures h ON h.world_id = p.world_id AND h.id = p.hf_id
LEFT JOIN entity_positions ep ON ep.world_id = p.world_id
      AND ep.entity_id = p.entity_id AND ep.position_id = p.position_id
WHERE p.world_id = $1 AND p.entity_id = $2
  AND NOT (p.start_year IS NULL AND EXISTS (
      SELECT 1 FROM hf_position_links p2
      WHERE p2.world_id = p.world_id AND p2.hf_id = p.hf_id
        AND p2.entity_id = p.entity_id AND p2.position_id = p.position_id
        AND p2.start_year IS NOT NULL
  ))
ORDER BY p.start_year DESC
```

This preserves legitimate multi-stints while hiding NULL-start shadows.

### Layer 3: Database cleanup (fix existing data)

Run a one-time cleanup after ingestion fix to remove existing duplicates:

```sql
DELETE FROM hf_position_links a
USING hf_position_links b
WHERE a.world_id = b.world_id AND a.hf_id = b.hf_id
  AND a.entity_id = b.entity_id AND a.position_id = b.position_id
  AND a.start_year IS NULL AND b.start_year IS NOT NULL;
```

Expected: ~2,120 rows deleted.

## Implementation Steps

1. **Fix ingestion** (`xml_parser.py:1418-1425`): After inserting entity_position_assignments, run the cleanup DELETE to remove NULL-start shadows
2. **Fix Leaders query** (`detail_pages.py:~1228`): Add the `NOT EXISTS` filter to exclude NULL-start shadows
3. **Run DB cleanup**: Execute the DELETE on the live database
4. **Verify**: Check Leaders tab shows no more duplicates, and legitimate multi-stints (different time periods) still appear

## Critical Files

- `chronicler/ingest/xml_parser.py` (line 1418-1425) — ingestion fix
- `chronicler/api/routes/detail_pages.py` (line ~1228) — leaders query fix

## Verification

1. Before: `SELECT count(*) FROM (SELECT hf_id, entity_id, position_id FROM hf_position_links WHERE world_id=1 GROUP BY 1,2,3 HAVING count(*)>1) sub` → 2,120
2. After cleanup: same query → 0
3. Leaders tab for entity 1007 → no duplicate entries, no `?` start years for current holders
4. Legitimate multi-stints preserved (person who held position A from year 50-100, then again from 150-present → still shows 2 rows)
