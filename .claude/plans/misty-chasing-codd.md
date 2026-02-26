# Phase 2: Explorer Core — Implementation Plan

## Context

Phase 1 (Data Foundation) is COMPLETE (64/64 checks passed). The CDM database has 109K+ entities across 16 tables, with `event_entity_xref` (871K rows) providing the cross-reference backbone. Phase 2 builds the complete entity browsing experience: 15+ detail pages, global search, cross-linking, perspective-aware event rendering, and hover popovers.

**Problem**: The current explorer (`explorer.html`, 2168 lines) renders everything client-side via JavaScript. Entity detail views exist only as in-panel JSON renderings — there are no dedicated URL-addressable entity pages. The PRD mandates server-side Jinja2 rendering with bookmarkable URLs per entity.

**Approach**: Create a new `detail_pages.py` router for server-side HTML endpoints (`/explorer/{type}/{world_id}/{id}`), a Jinja2 template hierarchy under `templates/detail/`, and wire the existing but unused `EntityLinkRenderer`, `EntityNameCache`, and `DFCalendar` as Jinja2 globals. The existing API routes and explorer.html remain functional — detail pages are additive.

## Stage 2.1: Entity Detail Page Framework (Week 1)

### Step 1: Wire existing utilities into Jinja2

**Modify** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/app.py`:
- Import `EntityLinkRenderer`, `EntityNameCache` from `chronicler.explorer.linking`
- Import `DFCalendar` from `chronicler.explorer.calendar`
- Create singletons: `linker = EntityLinkRenderer()`, `name_cache = EntityNameCache()`
- In lifespan: attach `app.state.name_cache = name_cache`
- Register Jinja2 globals on `templates.env.globals`: `entity_link` (linker.link), `entity_url` (linker.url_for), `df_date` (DFCalendar.format_date), `df_season` (DFCalendar.format_season), `df_short` (DFCalendar.format_short)
- Include new `detail_router` with NO prefix (HTML pages, not `/api`)

**Modify** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/__init__.py`:
- Export `EntityLinkRenderer`, `EntityNameCache`, `DFCalendar`, `PerspectiveRenderer`

### Step 2: Update EntityLinkRenderer for world_id in path

**Modify** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/linking.py`:
- Change all ROUTES from `/explorer/hf/{id}` to `/explorer/hf/{world_id}/{id}` (matches existing API pattern `people.py` uses)
- Update `link()` and `url_for()` to format `{world_id}` into path instead of `?world_id=` query param
- Add `data-world-id` attribute to generated `<a>` tags (needed for popover JS)
- Special case: `era` route uses `{name}` not `{id}` (PK is `(world_id, name)`)

### Step 3: Create PerspectiveRenderer

**Create** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/perspective.py`:
- `PerspectiveRenderer` class
- `render_event(event_row, perspective_type, perspective_id, world_id, linker, names)` → HTML string
- Maps event JSONB field names ending in `_hfid`, `_id`, `_site_id` etc. to entity types
- For perspective entity refs: replace with `<em>they</em>`/`<em>them</em>`/`<em>their</em>` based on field role
- For other entity refs: generate cross-linked `<a>` tags via linker
- `render_event_batch(events, ...)` → list of HTML strings (batches name resolution)

### Step 4: Create base detail template + partials

**Create** templates under `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/templates/`:

| File | Purpose |
|------|---------|
| `detail/detail_base.html` | Master layout: nav include, Tailwind CSS, breadcrumbs, entity header blocks, tab system, content block, prev/next buttons, JS block |
| `partials/_breadcrumbs.html` | Renders breadcrumb trail from list |
| `partials/_tabs.html` | Generic tab bar with hash persistence JS |
| `partials/_event_table.html` | Paginated event table (pre-rendered HTML rows from PerspectiveRenderer) |
| `partials/_prev_next.html` | Floating prev/next entity navigation buttons |

CSS theme: reuse existing dark stone/parchment/amber palette from explorer.html (`.section-card`, `.detail-header`, `.entity-link`, badge classes).

### Step 5: Create detail_pages router with stub routes

**Create** `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py`:
- Stub HTML handlers for all 16 entity types + chronological browser + event detail
- Each returns `templates.TemplateResponse("detail/{type}.html", context)` with breadcrumbs and entity data
- Pattern per route:
  ```python
  @router.get("/explorer/hf/{world_id}/{hf_id}", response_class=HTMLResponse)
  async def hf_detail_page(request: Request, world_id: int, hf_id: int):
      pool = request.app.state.pool
      name_cache = request.app.state.name_cache
      async with pool.acquire() as conn:
          # fetch entity + related data
          # batch_resolve names
      return templates.TemplateResponse("detail/hf.html", {
          "request": request, "active": "explorer",
          "entity": hf_data, "world_id": world_id, ...
      })
  ```

### Stage 2.1 Acceptance Criteria
- [ ] Base template renders cleanly at `/explorer/hf/{wid}/{id}`
- [ ] `{{ entity_link('hf', 42, 'Urist', 8) }}` generates correct `<a>` tag in any template
- [ ] `{{ df_date(42, 100000) }}` renders "the 4th of Hematite, Year 42"
- [ ] PerspectiveRenderer suppresses perspective entity and uses pronouns
- [ ] Existing explorer.html and all API routes still work unchanged

---

## Stage 2.2: Primary Entity Detail Pages (Weeks 2-3)

Build data-fetching handlers and templates for 8 primary entity types. Each follows: query DB → batch-resolve names → pre-render events → return TemplateResponse.

### HF Detail Page (most complex — sets all patterns)

**Template**: `detail/hf.html` with sub-includes under `detail/hf/` for the 24 sections.
**Route**: `GET /explorer/hf/{world_id}/{hf_id}`
**24 sections** grouped into tabs:
- Overview: profile card (race, birth/death, type badges, importance score), family tree placeholder
- Relationships: close (hf_links), vague (JSONB), worshipped deities
- Affiliations: entity memberships, positions with date ranges, squad links
- Sites: site links, site property links, dedicated structures
- Events: paginated event table, perspective-aware (this HF as perspective)
- Combat: notable kills, battles, beast attacks, snatcher-of
- Lore: artifacts, identities, entity reputations, intrigue, skills, spheres, journey pets

**Performance**: Use `asyncio.gather()` for independent queries (relationships, entity_links, site_links can run concurrently). Lazy-load events tab via htmx or JS fetch.

### Entity/Civilization Detail Page
**Template**: `detail/entity.html` (5 tabs: Leaders, Sites, Members, Groups, Wars)
**Route**: `GET /explorer/entity/{world_id}/{entity_id}`

### Site Detail Page
**Template**: `detail/site.html` (3 tabs: Structures, Properties, History)
**Route**: `GET /explorer/site/{world_id}/{site_id}`

### Artifact Detail Page
**Template**: `detail/artifact.html` (chain-of-custody timeline)
**Route**: `GET /explorer/artifact/{world_id}/{artifact_id}`
**Key query**: Events from `event_entity_xref WHERE entity_type='artifact'` to build custody chain.

### Region, Structure, Written Content, Event Collection
Simpler templates following same pattern. Structure uses nested route: `/explorer/site/{wid}/{site_id}/structure/{structure_id}`.

### Explorer.html Integration
**Modify** `explorer.html`: Update `navigateTo()` to redirect to detail page URLs:
```javascript
function navigateTo(tab, type, worldId, id) {
    if (USE_DETAIL_PAGES && DETAIL_ROUTES[type]) {
        window.location = DETAIL_ROUTES[type].replace('{wid}', worldId).replace('{id}', id);
        return;
    }
    // existing fallback...
}
```
Feature flag `USE_DETAIL_PAGES = true` for safe rollout.

### Stage 2.2 Acceptance Criteria
- [ ] All 8 primary entity detail pages render with all sections
- [ ] Sections with no data are hidden (not shown empty)
- [ ] Cross-links work between all entity types
- [ ] Perspective-aware event rendering on HF/Entity/Site events tabs
- [ ] Page loads < 2s for HFs with < 1000 events
- [ ] Explorer.html entity clicks navigate to detail pages

---

## Stage 2.3: Secondary Entity Detail Pages (Week 4)

8 simpler entity pages + chronological browser + single event detail page.

| Page | Route | Key Content |
|------|-------|-------------|
| Underground Region | `/explorer/underground_region/{wid}/{id}` | Type, depth, coordinates, events |
| Landmass | `/explorer/landmass/{wid}/{id}` | Name, bounding box, contained sites |
| Mountain Peak | `/explorer/mountain_peak/{wid}/{id}` | Name, height, is_volcano, coords |
| River | `/explorer/river/{wid}/{id}` | Name, end_type, path coords |
| World Construction | `/explorer/construction/{wid}/{id}` | Name, type (road/bridge/tunnel), connected sites |
| Art Form | `/explorer/art_form/{wid}/{id}` | Name, form_type (dance/musical/poetic), description |
| Identity | `/explorer/identity/{wid}/{id}` | Name, race, associated HF (linked), entity |
| Era | `/explorer/era/{wid}/{name}` | Name, start_year, event stats (PK is name, not id) |
| Years Browser | `/explorer/years?world_id={wid}` | Year list with event counts, drill-down |
| Event Detail | `/explorer/event/{wid}/{event_id}` | All JSONB fields, cross-linked entity refs |

### Stage 2.3 Acceptance Criteria
- [ ] All 8 secondary pages render correctly
- [ ] Chronological browser lists all years with counts
- [ ] Single event detail page shows all JSONB fields with entity links
- [ ] Era page handles name-based PK (not numeric id)

---

## Stage 2.4: Search and Navigation (Week 5)

### Global Search
**Add** `/api/search` endpoint to `explorer.py`: searches all 16 entity types with `unaccent()` ILIKE matching, results sorted by exact-match priority → type priority → alphabetical.
**Add** `_search.html` partial to `_nav.html`: input with 200ms debounced autocomplete dropdown, results grouped by entity type.

### HF Filtering
**Modify** `people.py`: add filter params (is_deity, is_vampire, etc.) and sort options to search_people().
**Modify** `explorer.html`: add filter checkboxes above People tab results.

### Hover Popovers
**Add** `/api/popover/{entity_type}/{world_id}/{entity_id}` lightweight endpoint.
**Add** Tippy.js to `detail_base.html` + `explorer.html`. Delegated mouseover on `.entity-link` elements, 300ms delay, AJAX-loaded, client-side LRU cache.

### Navigation Aids
- Breadcrumbs (already in templates from Stage 2.1)
- Prev/next buttons (already in templates)
- URL hash tab persistence (JS in detail_base.html)

### Schema & Data Browser Enhancements
- JSONB field inventory endpoint + UI button in schema browser
- Row detail overlay (modal on row click in data browser)
- CSV/JSON export endpoints (StreamingResponse)

### Stage 2.4 Acceptance Criteria
- [ ] Global search returns results within 200ms, accent-insensitive
- [ ] HF filter checkboxes work with AND logic
- [ ] Popovers appear on hover after 300ms, dismissible, interactive
- [ ] Prev/next navigates within entity type
- [ ] Tab state persists in URL hash across page loads
- [ ] JSONB key inventory displays in schema browser
- [ ] Row detail overlay works for any table
- [ ] CSV/JSON export downloads correct data

---

## Files Summary

### New Files (26)

| File | Stage |
|------|-------|
| `chronicler/api/routes/detail_pages.py` | 2.1 |
| `chronicler/explorer/perspective.py` | 2.1 |
| `chronicler/api/templates/detail/detail_base.html` | 2.1 |
| `chronicler/api/templates/partials/_tabs.html` | 2.1 |
| `chronicler/api/templates/partials/_event_table.html` | 2.1 |
| `chronicler/api/templates/partials/_breadcrumbs.html` | 2.1 |
| `chronicler/api/templates/partials/_prev_next.html` | 2.1 |
| `chronicler/api/templates/detail/hf.html` | 2.2 |
| `chronicler/api/templates/detail/entity.html` | 2.2 |
| `chronicler/api/templates/detail/site.html` | 2.2 |
| `chronicler/api/templates/detail/artifact.html` | 2.2 |
| `chronicler/api/templates/detail/region.html` | 2.2 |
| `chronicler/api/templates/detail/structure.html` | 2.2 |
| `chronicler/api/templates/detail/written_content.html` | 2.2 |
| `chronicler/api/templates/detail/collection.html` | 2.2 |
| `chronicler/api/templates/detail/underground_region.html` | 2.3 |
| `chronicler/api/templates/detail/landmass.html` | 2.3 |
| `chronicler/api/templates/detail/mountain_peak.html` | 2.3 |
| `chronicler/api/templates/detail/river.html` | 2.3 |
| `chronicler/api/templates/detail/construction.html` | 2.3 |
| `chronicler/api/templates/detail/art_form.html` | 2.3 |
| `chronicler/api/templates/detail/identity.html` | 2.3 |
| `chronicler/api/templates/detail/era.html` | 2.3 |
| `chronicler/api/templates/detail/years.html` | 2.3 |
| `chronicler/api/templates/detail/event.html` | 2.3 |
| `chronicler/api/templates/partials/_search.html` | 2.4 |

### Modified Files (7)

| File | Stage | Changes |
|------|-------|---------|
| `chronicler/api/app.py` | 2.1 | Jinja2 globals, name_cache on app.state, detail_router |
| `chronicler/explorer/linking.py` | 2.1 | world_id in path, data-world-id attr, era name route |
| `chronicler/explorer/__init__.py` | 2.1 | Export all classes |
| `chronicler/api/templates/explorer.html` | 2.2, 2.4 | navigateTo() redirect, HF filters, row overlay, export buttons |
| `chronicler/api/routes/explorer.py` | 2.3, 2.4 | Search, popover, JSONB keys, export endpoints |
| `chronicler/api/routes/people.py` | 2.4 | Type flag filters + sort |
| `chronicler/api/templates/partials/_nav.html` | 2.4 | Global search bar |

All paths relative to `/Users/nathanielcannon/Claude/Projects/DwarfCron/`.

---

## Reusable Existing Code

- **`EntityLinkRenderer`** (`explorer/linking.py:11-103`): 16 entity types with routes + labels. Needs world_id path update only.
- **`EntityNameCache`** (`explorer/linking.py:106-219`): Batch name resolution with 5-min TTL. Ready to use as singleton on `app.state`.
- **`DFCalendar`** (`explorer/calendar.py:1-115`): All 4 format methods complete. Zero changes needed.
- **`_serialize_value()`** (`routes/explorer.py`): Date/decimal/bytes serialization helper.
- **Query patterns** from `routes/people.py:90-203`: HF detail query structure (relationships, entity_links, site_links, positions) — extend for 24-section HF page.
- **CSS classes** from `explorer.html:28-60`: `.section-card`, `.detail-header`, `.badge-*`, `.nav-link`, `.fk-link`, tab active/inactive.

## Key DB Facts

- `event_entity_xref`: 871K rows, indexed on `(world_id, entity_type, entity_id)` — fast entity-scoped event queries
- `historical_eras`: PK is `(world_id, name)`, NOT numeric id. Only 1 row. Route uses name.
- `historical_figures`: 48K rows (largest entity table)
- `history_events`: 436K rows
- DB DSN: `postgresql://jarvis:{password}@localhost:5432/chronicler` (from `config.py`)

## Verification

After each stage:
1. `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve`
2. Verify existing explorer at `http://localhost:8000/explorer` still works
3. Navigate to new detail pages (e.g., `http://localhost:8000/explorer/hf/2/1`)
4. Verify cross-links navigate correctly between entity types
5. Check browser console for JS errors
6. Test edge cases: entities with 0 events, 0 relationships
