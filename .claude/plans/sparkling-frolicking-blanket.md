# Plan: Materialize HF-Site Settlement Links

## Context

`hf_site_links` has 2,074 XML-declared links (home structure, occupation, seat of power, lair, hangout), but 54,364 `change hf state` "settled" events across 26,523 HFs are not materialized into queryable relationships. This means:
- Graph traversal can't find HF-to-site connections for the vast majority of HFs
- Site detail pages show no residents
- Stodir's settling at Metalsnarl (and 5 other HFs who settled there in year 250) is invisible

**Key leverage**: `hf_site_links` is consumed by 4 API routes (HF detail, people summary, explorer graph, geography). Adding new `link_type = 'settled'` rows automatically propagates to ALL consumers with zero query changes.

## Changes (6 files, ~95 lines)

### 1. New post-parse step 10: `post_parse.py`

- Add `step_10_materialize_hf_settlement_links()` — single INSERT with DISTINCT + ON CONFLICT DO NOTHING
- Renumber existing step 10 (validation) to step 11
- Update `run_all()` to call new step between 9 and 11

```sql
INSERT INTO hf_site_links (world_id, hf_id, site_id, link_type)
SELECT DISTINCT e.world_id, e.hf_id_1, e.site_id, 'settled'
FROM history_events e
WHERE e.world_id = $1
  AND e.event_type = 'change hf state'
  AND e.details->>'state' = 'settled'
  AND e.hf_id_1 IS NOT NULL AND e.site_id IS NOT NULL
ON CONFLICT DO NOTHING
```

Expected: ~30K new rows (54K events deduplicated by unique HF-site pairs).

**Also run this SQL once against live DB** to backfill without re-ingesting.

### 2. Graph edge colors: `detail_pages.py` + `explorer.py`

Add `'settled': '#34d399'` (emerald-400) to edge color dicts and `'settled': 'residence'` to category map. Visually distinct from existing green (#22c55e) used for home structure/occupation.

### 3. Residents tab on site detail page: `detail_pages.py` + `site_detail.html`

- Add residents query in `site_detail_page()` (reverse hf_site_links lookup, LIMIT 200)
- Add "Residents" tab to template with name, race, link type, alive/dead status, supernatural badges
- Tab shows count in button label

### 4. Reverse index: `schema.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_hf_site_links_site ON hf_site_links(site_id);
```

Currently only `hf_id` is indexed. With ~32K rows, the reverse lookup (site -> HFs) needs this index. Also apply to live DB.

### 5. Design decision: settled only, not visiting

Only `settled` events are materialized. Visiting events (15,260) are too transient — 51% are "be with master" (following someone). The event History tab on each site page already shows visiting events for users who want that detail.

## Verification

1. Run backfill SQL on live DB, confirm ~30K rows inserted
2. Check Metalsnarl (site 1110): Residents tab should show Stodir + 4 other HFs who settled there
3. Check Cobalt Inks HF detail: any member should now show Metalsnarl in Related Sites
4. Graph: settled edges appear as emerald hexagon connections
5. `SELECT link_type, count(*) FROM hf_site_links GROUP BY 1` — `settled` appears with ~30K

## Files

| File | Change |
|------|--------|
| `DwarfCron/chronicler/ingest/post_parse.py` | New step 10, renumber 10->11 |
| `DwarfCron/chronicler/api/routes/detail_pages.py` | Edge colors + residents query |
| `DwarfCron/chronicler/api/routes/explorer.py` | Edge color for settled |
| `DwarfCron/chronicler/api/templates/site_detail.html` | Residents tab |
| `DwarfCron/chronicler/db/schema.sql` | Reverse index |
