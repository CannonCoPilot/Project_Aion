# Plan: Enhance Parser for Journey & Route Details

## Context

The user asked us to surface all journey and route details from DF legends XML for narrative engine and visualization features. Investigation revealed that the `<return/>` boolean tag (1,124 markers across all regions) is **silently dropped** by the parser, coords are stored as raw strings without numeric decomposition, and the `hf travel` event template is too minimal. Journey collections also lack dedicated UI rendering showing route progression.

This is Phase 3 (Narrative Engine) groundwork — ensuring the data layer has complete travel data before building narrative features on top.

## Steps

### Step 1: Fix `<return/>` boolean tag parsing
**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`

Add `_EVENT_BOOLEAN_TAGS = frozenset({"return"})` near line 45. Modify `_parse_event()` lines 320-321:

```python
# Before:
if not val:
    continue

# After:
if not val:
    if tag in _EVENT_BOOLEAN_TAGS:
        details[tag] = True
    continue
```

**Impact:** ~99 events in region1 (1,124 total across all regions) gain `details.return = true`.

### Step 2: Parse coords into numeric x,y for visualization
**File:** `xml_parser.py`, in the `else` clause at line 339-341

After `details[tag] = val`, add coords parsing:

```python
else:
    details[tag] = val
    if tag == "coords" and "," in val:
        parts = val.split(",")
        if len(parts) == 2:
            try:
                details["coords_x"] = int(parts[0])
                details["coords_y"] = int(parts[1])
            except ValueError:
                pass
```

Note: `-1,-1` coords are already caught by `_SKIP_VALUES` and never reach this code.

### Step 3: Enhance `hf travel` template with dynamic resolution
**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/perspective.py`

Add dynamic template in `_resolve_template()` (line 487) — same pattern as `change hf state`:

```python
if event_type == 'hf travel':
    is_return = details.get('return') is True
    has_site = details.get('site_id') is not None
    has_region = details.get('region_id') is not None
    if is_return and has_site:
        return '{hfid} returned to {site_id}'
    elif is_return and has_region:
        return '{hfid} returned to {region_id}'
    elif has_site:
        return '{hfid} traveled to {site_id}'
    elif has_region:
        return '{hfid} traveled through {region_id}'
    return '{hfid} traveled'
```

Update `COLUMN_MAP_BY_EVENT['hf travel']` (line 171) to include `region_id`:
```python
'hf travel': {
    'hf_id_1': 'hfid', 'site_id': 'site_id', 'region_id': 'region_id',
},
```

### Step 4: Suppress new fields from enrichment noise
**File:** `perspective.py`, `_SUPPRESS_FROM_ENRICHMENT` (line 311)

Add `'return'`, `'coords_x'`, `'coords_y'` to the suppression set so they don't appear as redundant enrichment tags.

### Step 5: Add journey-specific route context to collection detail page
**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`

For `coll_type == 'journey'`, query the collection's events and build a route summary:
- Extract traveler HF from first `hf travel` event
- Build ordered list of stops: each with `is_return`, `site_id`/`region_id`, `coords`, resolved names
- Pass `journey_traveler` and `journey_route` to template context

### Step 6: Add Journey Route card to collection template
**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/collection_detail.html`

Add a "Journey Route" section card (after Location card) showing:
- Traveler name (linked)
- Visual route: `Region #112 → Site #39 (↩ return)` with arrow connectors
- Return stops highlighted with emerald accent (matching existing design language)
- Coordinates shown in muted text

### Step 7: Re-ingest and verify
- Drop & recreate schema, re-ingest world data
- Restart server
- Verify with queries and UI

## Files to Modify
1. `chronicler/ingest/xml_parser.py` — Steps 1-2 (parser fixes)
2. `chronicler/explorer/perspective.py` — Steps 3-4 (template + suppression)
3. `chronicler/api/routes/detail_pages.py` — Step 5 (route context)
4. `chronicler/api/templates/collection_detail.html` — Step 6 (route UI)

## What's NOT Changing
- **DB schema** — all new data fits in existing `details` JSONB
- **Multiple `group_hfid`** — data analysis shows 0 events with multiple tags; no change needed
- **`feature_layer_id = -1`** — correctly skipped by `_SKIP_VALUES`; underground layers (0+) already captured
- **`ordinal`** in journey collections — already captured in details JSONB

## Verification
1. `SELECT id, details->'return' FROM history_events WHERE event_type='hf travel' AND details ? 'return' LIMIT 5` → should return `true`
2. `SELECT id, details->'coords_x' FROM history_events WHERE details ? 'coords_x' LIMIT 5` → should return integers
3. Journey collection page (e.g., `/explorer/collection/0?world_id=1`) → shows Route card
4. HF detail page for a traveler → event text says "returned to" for return events
5. Non-travel events unaffected (spot-check a battle/artifact event)
