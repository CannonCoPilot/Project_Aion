# Plan: Reorganize Civilization Detail View + Fix Enemy Link Bug

## Context

The Civilization detail view in the Explorer is currently a flat list of sections (positions table, simple site list, wars table, members button). The user wants it reorganized to match the People tab's `section-card` pattern, with richer data: site govts with structures/population/rulers, an overview tile, and proper nested position hierarchy. Additionally, `enemy` link types are incorrectly inflating member counts across the app (26,434 enemy links = 13.6% of all entity links).

## Phase A: Fix Enemy Link Bug (Backend)

**File**: `civilizations.py`

1. **Add constant** at top: `_MEMBER_LINK_TYPES = ("member", "former member")`
2. **Fix `list_civilizations`** member_count subquery: add `AND link_type IN ('member', 'former member')` to the hf_entity_links GROUP BY
3. **Fix `list_members`** endpoint: add same filter to both COUNT and SELECT queries
4. **Fix position dedup** in `get_civilization`: rewrite the positions query to use `LEFT JOIN LATERAL ... LIMIT 1` instead of plain LEFT JOIN (prevents duplicate rows when multiple hf_position_links exist for same hf+position)

## Phase B: Expand `get_civilization` Endpoint (Backend)

**File**: `civilizations.py`

5. **Query child site govts** via JSONB containment: `details->'entity_links' @> '[{"type":"PARENT","target":<civ_id>}]'::jsonb`
6. **Batch-fetch** for all site govt IDs (using `ANY($2::int[])`):
   - Sites: `sites WHERE owner_entity_id = ANY(...)`
   - Structures: `structures WHERE site_id = ANY(...)`
   - Population: `COUNT(*) FROM hf_entity_links WHERE entity_id = ANY(...) AND link_type IN (member types)`
   - Positions + holders: `entity_positions LEFT JOIN LATERAL (hf_position_links LIMIT 1) LEFT JOIN historical_figures`
7. **Compute overview data**: total_population (sum of site govt pops + civ direct members), civ ruler (first noble position holder), site_count
8. **New response shape**:
   ```
   { id, world_id, name, type, race,
     ruler: {hf_id, name, title} | null,
     total_population: int, site_count: int,
     site_govts: [{ id, name, site: {id,name,type}|null, structures: [{type},...],
                    population: int, ruler: {hf_id,name,title}|null,
                    positions: [{position_id,name,category,title,current_holder},...] }],
     positions: [...],  // civ-level positions (deduped)
     wars: [...] }
   ```

## Phase C: Rewrite Frontend `renderCivDetail()` (Template)

**File**: `explorer.html`

9. **Overview Tile** — `section-card` with 2×2 grid: Race, Sites, Population, Ruler (nav-link)
10. **Sites Table** — `section-card` with sortable table:
    - Columns: Site Govt | Site | Structures (unicode icons with tooltips) | Population | Ruler + Position
    - Icon map: `inn tavern→🍺, temple→⛪, mead hall→🏛, guildhall→⚒, tomb→⚰, market→🏪, dungeon→⛓, counting house→💰, keep→🏰, tower→🗼, library→📚, underworld spire→🔮`
11. **Positions Nested List** — `section-card` with collapsible groups:
    - Top group: "Civilization Positions" (civ-level positions)
    - Per site govt: "Site Govt Name → Site Name" with positions underneath
    - **Only show site govts that have at least one active (filled) position holder** — skip empty ones to reduce clutter on large civs (40+ site govts)
    - Each position row: Title - Position Name - Category badge - Current Holder (nav-link or "Vacant")
12. **Wars Table** — Same columns as before + Outcome column (shows "—" since DB has no outcome data)
13. **Members Table** — Update `renderMembersTable()`:
    - Rename "Link" header → "Membership"
    - Reorder columns: Name | Race | Position | Membership | Status
    - Drop "Profession" (HF table has no profession column)

## Files Modified

| File | Changes |
|------|---------|
| `chronicler/api/routes/civilizations.py` | Enemy filter (steps 1-4), expanded get_civilization (steps 5-8) |
| `chronicler/api/templates/explorer.html` | Rewrite renderCivDetail (steps 9-13) |

## Verification

1. Restart Chronicler app
2. Open Explorer → Civilizations tab
3. Verify member counts decreased (no more enemy inflation) — e.g., "the fly of groups" should show ~2644 members, not ~2765+
4. Click a civilization → verify 5 sections render in correct order
5. Sites table: check structure icons appear, population counts are non-zero, rulers show for site govts that have them
6. Positions nested list: verify civ-level + site-govt-level positions render without duplicates
7. Click "Load Members" → verify table shows Name|Race|Position|Membership|Status, no enemies listed
8. Wars table: verify Outcome column shows "—"
