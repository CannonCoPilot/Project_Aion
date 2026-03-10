# Plan: Fix Family & Relationship Data Completeness

## Context

The HF detail page's Family section and Relationships tab are missing significant relationship data due to three compounding issues:

1. **`lover` excluded from `family_types` filter** — 3,890 lover links never appear in Family section
2. **`deceased spouse` links are 100% one-directional** — 5,000 links with zero reverses in `post_parse.py`. The dead partner often has a `spouse` link back (creating 4,982 duplicates), but 14 deceased spouses have NO reverse link at all.
3. **6,448 co-parent pairs have NO explicit relationship link** — parents who share children but DF's XML never recorded a spouse/lover/partner link between them (48% of all 13,481 co-parent pairs). Example: Idala Curlsnake (HF 4825) has 12 children with 2 mothers but zero spouse/lover links to either.
4. **`spouse` + `deceased spouse` duplicates** — 4,982 HFs show the same person twice (once as "spouse", once as "deceased spouse") because post_parse adds `spouse` bidirectionally while the XML already has `deceased spouse` on one side.

### Data audit summary

| Link Type | DB Count | Bidirectional? | Gap |
|-----------|----------|----------------|-----|
| child | 61,810 | 100% (post_parse) | None |
| mother | 30,905 | child inverse (post_parse) | None |
| father | 30,905 | child inverse (post_parse) | None |
| spouse | 15,496 | 100% (post_parse) | 4,982 duplicate with deceased spouse |
| former spouse | 20,798 | 99.99% (XML) | 2 missing reverses |
| deceased spouse | 5,000 | **0%** | **5,000 missing reverses** |
| lover | 3,890 | 100% (XML) | Not in `family_types` filter |
| master | 3,220 | 100% (XML) | N/A (career) |
| apprentice | 3,220 | 100% (XML) | N/A (career) |
| former master | 3,312 | 100% (XML) | N/A (career) |
| former apprentice | 3,312 | 100% (XML) | N/A (career) |

Co-parent pairs: 13,481 total; 7,033 with explicit link; **6,448 with NO link** (67.6% both dead, 19.3% one alive, 13% both alive).

---

## Implementation

### Step 1: Migration script — fix deceased spouse + former spouse bidirectionality

**File:** New migration at `/Users/nathanielcannon/Claude/Projects/DwarfCron/migrations/` (e.g., `0004_fix_spouse_bidirectionality.sql`)

```sql
-- 1. Add reverse deceased spouse links where missing
INSERT INTO hf_links (world_id, hf_id, target_hf_id, link_type)
SELECT world_id, target_hf_id, hf_id, 'deceased spouse'
FROM hf_links
WHERE link_type = 'deceased spouse'
ON CONFLICT DO NOTHING;

-- 2. Add reverse former spouse links where missing
INSERT INTO hf_links (world_id, hf_id, target_hf_id, link_type)
SELECT world_id, target_hf_id, hf_id, 'former spouse'
FROM hf_links
WHERE link_type = 'former spouse'
ON CONFLICT DO NOTHING;

-- 3. Add reverse lover links where missing (safety)
INSERT INTO hf_links (world_id, hf_id, target_hf_id, link_type)
SELECT world_id, target_hf_id, hf_id, 'lover'
FROM hf_links
WHERE link_type = 'lover'
ON CONFLICT DO NOTHING;

-- 4. Remove duplicate spouse links where deceased spouse already exists
-- (keep deceased spouse as the more specific type)
DELETE FROM hf_links s
WHERE s.link_type = 'spouse'
  AND EXISTS (
    SELECT 1 FROM hf_links d
    WHERE d.world_id = s.world_id AND d.hf_id = s.hf_id
      AND d.target_hf_id = s.target_hf_id AND d.link_type = 'deceased spouse'
  );
```

### Step 2: Update post_parse.py — prevent future gaps

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py`
**Function:** `step_1_resolve_family_links()` (lines 38-78)

Add after the existing spouse enforcement (line 75):

- Bidirectional enforcement for `deceased spouse`
- Bidirectional enforcement for `former spouse`
- Bidirectional enforcement for `lover`
- Deduplication: delete `spouse` where `deceased spouse` exists for same pair

### Step 3: Add co-parent inference query to detail page

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`

After the existing relationships query (line 114), add a new query to find co-parents:

```python
# Infer co-parents: for each of this HF's children, find the other parent
co_parents = await conn.fetch("""
    SELECT DISTINCT ON (other_parent.target_hf_id)
        other_parent.target_hf_id,
        other_parent.link_type AS parent_type,  -- 'mother' or 'father'
        h.name AS target_name, h.race AS target_race,
        h.caste AS target_caste, h.death_year AS target_death_year,
        array_agg(DISTINCT child_link.target_hf_id) AS shared_child_ids
    FROM hf_links child_link                         -- this HF's child links
    JOIN hf_links other_parent                       -- child's other parent link
        ON other_parent.world_id = child_link.world_id
        AND other_parent.hf_id = child_link.target_hf_id   -- same child
        AND other_parent.link_type IN ('mother', 'father')
        AND other_parent.target_hf_id != $2                 -- not self
    LEFT JOIN historical_figures h
        ON h.world_id = other_parent.world_id AND h.id = other_parent.target_hf_id
    WHERE child_link.world_id = $1
        AND child_link.hf_id = $2
        AND child_link.link_type = 'child'
        -- Exclude co-parents who already have an explicit romantic link
        AND NOT EXISTS (
            SELECT 1 FROM hf_links ex
            WHERE ex.world_id = $1
                AND ((ex.hf_id = $2 AND ex.target_hf_id = other_parent.target_hf_id)
                  OR (ex.hf_id = other_parent.target_hf_id AND ex.target_hf_id = $2))
                AND ex.link_type IN ('spouse', 'former spouse', 'deceased spouse', 'lover')
        )
    GROUP BY other_parent.target_hf_id, other_parent.link_type,
             h.name, h.race, h.caste, h.death_year
""", world_id, hf_id)
```

Then merge co-parents into the family list (around line 401):

```python
# Add lover to family types
family_types = {'mother', 'father', 'child', 'spouse', 'former spouse', 'deceased spouse', 'lover'}
family = [dict(r) for r in relationships if r['link_type'] in family_types]

# Add inferred co-parents
for cp in co_parents:
    child_count = len(cp['shared_child_ids'])
    family.append({
        'target_hf_id': cp['target_hf_id'],
        'link_type': 'partner',  # inferred relationship
        'target_name': cp['target_name'],
        'target_race': cp['target_race'],
        'target_caste': cp['target_caste'],
        'target_death_year': cp['target_death_year'],
        'inferred': True,
        'shared_children': child_count,
    })

# Sort family: parents first, then spouses/partners, then children
FAMILY_ORDER = {
    'father': 0, 'mother': 1,
    'spouse': 2, 'deceased spouse': 3, 'former spouse': 4, 'lover': 5, 'partner': 6,
    'child': 7,
}
family.sort(key=lambda f: (FAMILY_ORDER.get(f['link_type'], 99), f.get('target_name', '')))
```

Also pass `co_parents` data to the graph builder so co-parent nodes appear in the relationship graph.

### Step 4: Update Family section in hf_detail.html

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/hf_detail.html`
**Section:** Family (lines 156-172)

Update the display to:
- Show `partner` type with "(inferred)" annotation and shared child count
- Group relationships by category (Parents / Spouses & Partners / Children)
- Show `lover` relationships

```html
<div class="section-card">
  <div class="section-title">Family</div>
  <div class="space-y-1 text-sm">
    {% for f in family %}
      <div class="flex items-center gap-2">
        <span class="text-stone-500 text-xs w-28">
          {{ f.link_type|title }}{% if f.get('inferred') %} <span class="text-amber-600/60">(inferred)</span>{% endif %}:
        </span>
        {{ linker.link('hf', f.target_hf_id, f.target_name, world_id)|safe }}
        <span class="text-stone-600 text-xs">{{ f.target_race|default('', true)|title }}</span>
        {% if f.target_death_year and f.target_death_year > 0 %}
          <span class="text-stone-700 text-xs">(d.{{ f.target_death_year }})</span>
        {% endif %}
        {% if f.get('shared_children') %}
          <span class="text-stone-600 text-xs">({{ f.shared_children }} children)</span>
        {% endif %}
      </div>
    {% endfor %}
  </div>
</div>
```

### Step 5: Update Relationships tab — include co-parents in graph data

**File:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`
**Section:** Graph data construction (lines 406-486)

Add co-parent HF IDs to `graph_hf_ids` so they appear in the relationship graph:

```python
# Add co-parents to graph
for cp in co_parents:
    graph_hf_ids.add(cp['target_hf_id'])
```

Add edges for co-parent relationships (with dashed lines to indicate inferred):

```python
# Add inferred co-parent edges
for cp in co_parents:
    graph_data['edges'].append({
        'from': f"hf-{hf_id}",
        'to': f"hf-{cp['target_hf_id']}",
        'label': 'partner',
        'color': {'color': '#f472b6', 'highlight': '#f6b93b'},  # pink like other romance
        'font': {'color': '#78716c', 'size': 9, 'strokeWidth': 0},
        'dashes': [5, 5],  # dashed = inferred
        'arrows': '',
    })
```

---

## Files Modified

| File | Change |
|------|--------|
| `migrations/0004_fix_spouse_bidirectionality.sql` | New — one-time data fix |
| `chronicler/ingest/post_parse.py` | Extend step_1 with deceased spouse/former spouse/lover bidirectional + dedup |
| `chronicler/api/routes/detail_pages.py` | Add co-parent query, add `lover` to family_types, sort family, dedup spouse types, add co-parents to graph |
| `chronicler/api/templates/hf_detail.html` | Update Family section display, show partner/lover/inferred labels |

All paths relative to `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Verification

1. **Run migration:** `psql -h localhost -U jarvis -d chronicler -f migrations/0004_fix_spouse_bidirectionality.sql`
2. **Verify deceased spouse bidirectionality:**
   ```sql
   SELECT COUNT(*) FROM hf_links WHERE link_type = 'deceased spouse';
   -- Should be ~10,000 (doubled from 5,000)
   ```
3. **Verify deduplication:**
   ```sql
   SELECT COUNT(*) FROM hf_links a JOIN hf_links b
   ON a.world_id = b.world_id AND a.hf_id = b.hf_id AND a.target_hf_id = b.target_hf_id
   WHERE a.link_type = 'spouse' AND b.link_type = 'deceased spouse';
   -- Should be 0 (all duplicates removed)
   ```
4. **Test Idala Curlsnake (HF 4825):** Family section should show:
   - 2 Partners: Laci Equalbirths (4 children), Ditari Leapriddle (8 children)
   - 12 Children (existing)
5. **Test HF 2941 (diverse links):** Family section should show:
   - Father, Mother, Deceased Spouse (not duplicate with spouse), Former Spouse, Lover, Children
6. **Start server:** `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler serve`
7. **Browse to:** `localhost:5001/explorer` → People tab → select Idala Curlsnake → verify Family section and Relationships tab graph
