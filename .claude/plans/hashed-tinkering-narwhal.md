# Plan: Integrate Enriched Event Data into Chronicler UI

## Context

The enrichment pipeline (Phase 1) populated the `details` JSONB column on `history_events` with fields like `reason`, `circumstance`, `occasion_type`, and more from `legends_plus.xml`. However, the UI rendering pipeline only displays entity-reference placeholders (`{hfid}`, `{site_id}`) and a few non-entity fields that happen to have template placeholders (`{cause}`, `{state}`). Fields like `reason` and `circumstance` are in the database but **invisible** to users. The user's request: surface all enriched data in the UI.

**Approach**: Add expandable enrichment tags below event rows. Events with extra detail get a `▸` expand affordance; clicking reveals inline tags showing key-value pairs. This uses progressive disclosure — the main event text stays clean, but all enrichment data is one click away.

---

## Step 1: Add `extract_enrichment_details()` to perspective.py

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/perspective.py`

Add after `merge_columns_into_details()` (after line 296):

- A `_SUPPRESS_FROM_ENRICHMENT` frozenset containing all `ENTITY_REF_FIELDS` keys plus internal noise fields (`type`, `subtype`, `hist_event_collection_id`)
- A new function `extract_enrichment_details(event: dict) -> dict` that:
  1. Gets raw `details` from the event JSONB (NOT the merged version — avoids adding entity columns back)
  2. Looks up the EVENT_TEMPLATE for this event type
  3. For each key in details:
     - Skips if key is in `_SUPPRESS_FROM_ENRICHMENT`
     - Skips if `{key}` placeholder exists in the template string (already rendered in narrative text)
     - Skips None values
  4. Formats the label (snake_case → Title Case)
  5. Handles nested dicts (like `circumstance`) by flattening to "Key: Value; Key: Value"
  6. Returns `{display_label: display_value}` dict (empty dict if no enrichment)

This is the single source of truth for "what enrichment to show."

---

## Step 2: Add `enrichment` key to all route handlers in detail_pages.py

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`

Update import to include `extract_enrichment_details`.

Add `'enrichment': extract_enrichment_details(dict(ev))` to the event dict at **10 locations**:

| Line | Entity Page |
|------|------------|
| 862  | HF detail |
| 1421 | Site detail |
| 1563 | Artifact detail |
| 1669 | Region detail |
| 1789 | Structure detail |
| 2014 | Collection detail |
| 2120 | Underground region |
| 2266 | Mountain peak |
| 2594 | Entity/Era |
| 2975 | Years browser API |

Also add to the single event API (line 3039).

Performance: `extract_enrichment_details()` is pure dict iteration — no DB queries. Negligible overhead even for HF pages with 5000+ events.

---

## Step 3: Add CSS and JS to detail_base.html

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/detail_base.html`

**CSS** (after line ~91, inside existing `<style>` block):
- `.event-row.has-enrichment`: pointer cursor on date cell, `▸`/`▾` indicator via `::before` pseudo-element
- `.enrichment-row`: hidden by default (`display: none`), visible when `.visible` class added
- `.enrichment-tag`: inline-block pill with stone-800 bg, stone-400 text, subtle border — matches dark theme
- `.enrichment-label`: dimmer color for the key
- `.enrichment-value`: brighter color for the value

**JS** (after line ~191, after tab switching script):
- `toggleEnrichment(eventRow)`: finds next sibling enrichment row, toggles `.visible` class and `.expanded` on parent

---

## Step 4: Update event table markup in 10 templates

Two patterns based on existing markup:

### Pattern A: Table-based templates (6 files)
Add `has-enrichment` class + `onclick` to `<tr>`, then add sibling `<tr class="enrichment-row">` with enrichment tags.

| Template | Line | Notes |
|----------|------|-------|
| `hf_detail.html` | 722 | Also needs `hf-event-overflow` on enrichment row |
| `site_detail.html` | 217 | |
| `structure_detail.html` | 96 | |
| `artifact_detail.html` | 155 | |
| `region_detail.html` | 113 | |
| `collection_detail.html` | 191 | |
| `partials/_hf_inline.html` | 561 | Inline HF partial |

### Pattern B: Div-based templates (3 files)
Add `has-enrichment` class + `onclick` to event `<div>`, then add sibling `<div class="enrichment-row">` with enrichment tags.

| Template | Line |
|----------|------|
| `mountain_peak_detail.html` | 65 |
| `underground_region_detail.html` | 55 |
| `era_detail.html` | 74 |

Both patterns render enrichment identically inside:
```jinja2
{% if ev.enrichment %}
  {% for label, value in ev.enrichment.items() %}
  <span class="enrichment-tag">
    <span class="enrichment-label">{{ label }}:</span>
    <span class="enrichment-value">{{ value }}</span>
  </span>
  {% endfor %}
{% endif %}
```

---

## Step 5: Update years browser client-side rendering

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/years_browser.html`

Update JS event rendering loop (line 119-126):
- Check `ev.enrichment && Object.keys(ev.enrichment).length > 0`
- Add `has-enrichment` class + `onclick` to event div
- Render hidden `<div class="enrichment-row">` with enrichment tag spans
- Add `toggleYBEnrichment()` function (same toggle logic)
- Add `escapeHtml()` helper for safe value rendering

---

## Files Modified (summary)

| # | File | Change |
|---|------|--------|
| 1 | `chronicler/explorer/perspective.py` | Add `_SUPPRESS_FROM_ENRICHMENT` + `extract_enrichment_details()` |
| 2 | `chronicler/api/routes/detail_pages.py` | Add import + `enrichment` key at 11 locations |
| 3 | `chronicler/api/templates/detail_base.html` | CSS rules + `toggleEnrichment()` JS |
| 4 | `chronicler/api/templates/hf_detail.html` | Enrichment row markup |
| 5 | `chronicler/api/templates/site_detail.html` | Enrichment row markup |
| 6 | `chronicler/api/templates/structure_detail.html` | Enrichment row markup |
| 7 | `chronicler/api/templates/artifact_detail.html` | Enrichment row markup |
| 8 | `chronicler/api/templates/region_detail.html` | Enrichment row markup |
| 9 | `chronicler/api/templates/collection_detail.html` | Enrichment row markup |
| 10 | `chronicler/api/templates/mountain_peak_detail.html` | Enrichment row markup (div) |
| 11 | `chronicler/api/templates/underground_region_detail.html` | Enrichment row markup (div) |
| 12 | `chronicler/api/templates/era_detail.html` | Enrichment row markup (div) |
| 13 | `chronicler/api/templates/partials/_hf_inline.html` | Enrichment row markup |
| 14 | `chronicler/api/templates/years_browser.html` | JS enrichment rendering |

---

## Verification

1. **Restart Chronicler server** to pick up Python changes
2. **HF detail page**: Navigate to a historical figure with many events. Look for `▸` indicators on events that have enrichment data. Click to expand — should see labeled tags (e.g., "Reason: glorify hf", "Circumstance: Type: Histeventcollection; Hist Event Collection: 81")
3. **Site detail page**: Same check on a major site's History tab
4. **Years browser**: Load a year, verify enrichment tags appear on enriched events
5. **Regression check**: Events WITHOUT enrichment data should look identical to before (no expand affordance, no layout changes)
6. **SQL spot-check**: `SELECT id, event_type, details FROM history_events WHERE world_id = 1 AND details != '{}' LIMIT 10` — verify enrichment tags match DB content
