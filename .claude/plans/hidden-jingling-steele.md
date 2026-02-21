# Entity Merge Fix — Implementation Plan

## Context

The Chronicler XML parser (`chronicler/ingest/xml_parser.py`) parses entities from `legends.xml` only, which provides `id` + `name` but NOT `type` or `race`. The `legends_plus.xml` file provides `type`, `race`, and metadata (`histfig_id`, `child`) but is NOT parsed for entities. Result: all 441 entities in the DB have NULL type and race, and 2,019 sub-entities from legends_plus are missing entirely.

**Data complement** (same ID space — natural join on `id`):

| Field | legends.xml (441 entities) | legends_plus.xml (2,460 entities) |
|-------|---------------------------|----------------------------------|
| `id` | Yes | Yes |
| `name` | Yes | No |
| `type` | No | Yes (civilization, sitegovernment, religion, etc.) |
| `race` | No | Yes (dwarf, serpent_man, etc.) |
| `histfig_id` | No | Yes (leader HF for site governments) |
| `child` | No | Yes (entity self-reference) |

**Reference repo validation**: None of the reference repos (weblegends, df-narrator, DwarfFortressLogger, df-ai) do XML merging — they all use live memory or single-file parsing. The standard merge pattern from Java-based Legends Viewer tools is: parse legends.xml first (base graph), parse legends_plus second (match by `id`, augment in-place). We follow this pattern.

## Changes

### 1. Add entity parsing to `_parse_legends_plus()` (~15 lines)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
**Function**: `_parse_legends_plus()` (line 320)

Add `"entities": []` to the result dict, then iterate `root.findall(".//entity")` to extract:
- `id`, `world_id`, `name` (will be None — legends_plus lacks it), `type`, `race`
- `details` JSONB: `{"histfig_id": X, "child": Y}` (only if present)

```python
import json

# After existing event_relationships loop (~line 381):
for ent in root.findall(".//entity"):
    ent_details = {}
    hfid = _int(ent, "histfig_id")
    child = _int(ent, "child")
    if hfid is not None:
        ent_details["histfig_id"] = hfid
    if child is not None:
        ent_details["child"] = child
    result["entities"].append((
        _int(ent, "id"),
        world_id,
        _text(ent, "name"),   # None in legends_plus (no <name> tag)
        _text(ent, "type"),   # e.g. "civilization", "sitegovernment"
        _text(ent, "race"),   # e.g. "dwarf", "serpent_man"
        json.dumps(ent_details) if ent_details else None,
    ))
```

### 2. Add entity upsert to `import_legends()` (~10 lines)

**File**: same
**Function**: `import_legends()` (line 409)

In Step 5 (legends_plus enrichment, ~line 561), add entity upsert after the existing insertions:

```python
if plus_data and "entities" in plus_data:
    n = await _batch_insert(conn, "entities",
        ["id", "world_id", "name", "type", "race", "details"],
        plus_data["entities"],
        on_conflict="(id) DO UPDATE SET "
            "type = COALESCE(EXCLUDED.type, entities.type), "
            "race = COALESCE(EXCLUDED.race, entities.race), "
            "details = COALESCE(EXCLUDED.details, entities.details)")
    counts["entities_plus"] = n
    log.info("  entities (plus enrichment): %d", n)
```

**Upsert semantics**:
- For 441 entities in both files: `name` stays from legends.xml (Step 4), `type`/`race` get filled from legends_plus (Step 5)
- For 2,019 entities only in legends_plus: full insert with `type`/`race` but `name=NULL` (these are sub-entities like military units, guilds, etc. that don't have standalone names in the XML export)
- `COALESCE` ensures we never overwrite good data with NULL

### 3. Update world_id fixup loop

**File**: same
**Function**: `import_legends()` (line 446-453)

Add `"entities"` to the existing key list that fixes world_id from 0 to the real value:

```python
for key in ("landmasses", "mountain_peaks", "underground_regions",
             "identities", "event_relationships", "entities"):  # ← add "entities"
```

### 4. Add `"entities"` to result dict initialization

Ensure the `"entities"` key is included in the initial `plus_data` dict init at line 328 so it exists even when `_parse_legends_plus` produces zero entities (defensive).

## Files Modified

| File | Change |
|------|--------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` | All 4 changes above |

No schema changes needed — the `entities` table already has `type`, `race`, and `details` columns.

## Verification

1. **Reset DB**: `chronicler reset` or drop/recreate schema to clear stale data
2. **Re-ingest**: `chronicler ingest` (auto-detects legends files in `data/legends/`)
3. **Verify entity counts**:
   ```sql
   SELECT count(*) FROM entities;                          -- expect ~2,460 (up from 441)
   SELECT count(*) FROM entities WHERE type IS NOT NULL;   -- expect ~2,460
   SELECT count(*) FROM entities WHERE race IS NOT NULL;   -- expect ~441+ (sub-entities may lack race)
   SELECT count(*) FROM entities WHERE name IS NOT NULL;   -- expect 441 (legends.xml names)
   ```
4. **Spot-check merge quality** — verify a known entity has both name AND type:
   ```sql
   SELECT id, name, type, race, details FROM entities WHERE id = 0;
   -- Should show: name from legends.xml, type/race from legends_plus
   ```
5. **Verify entity type distribution**:
   ```sql
   SELECT type, count(*) FROM entities GROUP BY type ORDER BY count(*) DESC;
   -- Should show: sitegovernment, civilization, religion, militaryunit, etc.
   ```
