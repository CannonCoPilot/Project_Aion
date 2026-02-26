# Phase 2: Explorer Core — Implementation Plan

## Context

Phase 1 (Data Foundation) is complete (64/64 checks). The `chronicler` database has 1.94M records for world "Tar Thran" (world_id=2), including 48K historical figures, 436K events, 871K cross-reference rows, and 39 tables. The existing web UI (`chronicler serve` on port 8080) has a monolithic SPA at `/explorer` with 6 tabs (People, Civilizations, Geography, Events, Database, Graph) and JSON API routes.

Phase 2 builds the complete entity browsing experience: 15+ entity detail pages, global search, cross-linking, perspective-aware events, hover popovers, and navigation aids. The PRD is at `projects/chronicler/reports/phases/phase-2-explorer-core.md`.

## Architecture Decisions

1. **Server-rendered detail pages** — Each entity type gets its own HTML route (e.g., `GET /explorer/hf/{id}?world_id=N`) served via Jinja2 templates. The existing SPA at `/explorer` is preserved; its `navigateTo()` function is updated to redirect to detail pages instead of inline rendering.

2. **Template inheritance** — New `base.html` extracts shared `<head>` (Tailwind config, dark theme, fonts). Detail pages extend `detail_base.html` which extends `base.html`. Existing templates (`explorer.html`, `index.html`, `monitoring.html`) remain standalone initially — no refactoring risk.

3. **New route modules** — `detail.py` (HTML routes for all entity pages), `search.py` (global search + popover APIs). Existing `people.py`, `civilizations.py`, `geography.py`, `events.py`, `explorer.py` get targeted extensions for missing sub-endpoints.

4. **Cross-linking via Jinja2 globals** — `EntityLinkRenderer` registered as `link()` template function. `EntityNameCache` uses per-page batch resolution with 5-min TTL per world.

5. **CDN-only for external libs** — Continue pattern. Add Tippy.js for popovers.

## File Map

### New Files (~30)

| File | Purpose |
|------|---------|
| `chronicler/explorer/__init__.py` | Explorer package |
| `chronicler/explorer/linking.py` | EntityLinkRenderer + EntityNameCache |
| `chronicler/explorer/events.py` | PerspectiveRenderer + event text |
| `chronicler/explorer/calendar.py` | DFCalendar (months, seasons, dates) |
| `chronicler/api/routes/detail.py` | HTML routes for all 15+ entity detail pages |
| `chronicler/api/routes/search.py` | Global search + popover API |
| `chronicler/api/templates/base.html` | Shared HTML head + Tailwind config |
| `chronicler/api/templates/partials/_breadcrumb.html` | Breadcrumb nav |
| `chronicler/api/templates/partials/_search_bar.html` | Global search input |
| `chronicler/api/templates/partials/_entity_header.html` | Entity header (name, badges, stats) |
| `chronicler/api/templates/partials/_entity_events.html` | Paginated event table |
| `chronicler/api/templates/explorer/detail_base.html` | Detail page base layout |
| `chronicler/api/templates/explorer/hf.html` | HF detail (24 sections) |
| `chronicler/api/templates/explorer/entity.html` | Entity/Civ (5 tabs) |
| `chronicler/api/templates/explorer/site.html` | Site (3 tabs) |
| `chronicler/api/templates/explorer/artifact.html` | Artifact (chain-of-custody) |
| `chronicler/api/templates/explorer/region.html` | Region |
| `chronicler/api/templates/explorer/structure.html` | Structure |
| `chronicler/api/templates/explorer/written_content.html` | Written Content |
| `chronicler/api/templates/explorer/collection.html` | Event Collection (hierarchy) |
| `chronicler/api/templates/explorer/underground_region.html` | Underground Region |
| `chronicler/api/templates/explorer/landmass.html` | Landmass |
| `chronicler/api/templates/explorer/mountain_peak.html` | Mountain Peak |
| `chronicler/api/templates/explorer/river.html` | River |
| `chronicler/api/templates/explorer/construction.html` | World Construction |
| `chronicler/api/templates/explorer/art_form.html` | Art Form |
| `chronicler/api/templates/explorer/identity.html` | Identity |
| `chronicler/api/templates/explorer/era.html` | Historical Era |
| `chronicler/api/templates/explorer/years.html` | Chronological browser |
| `tests/test_explorer_framework.py` | DFCalendar + linking unit tests |
| `tests/test_detail_pages.py` | Detail page integration tests |
| `chronicler/ingest/validate_phase2.py` | Phase 2 DoD validator |

### Modified Files (~8)

| File | Changes |
|------|---------|
| `chronicler/api/app.py` | Register detail + search routers, add Jinja2 globals |
| `chronicler/api/routes/people.py` | Add type flag filter params, kills/artifacts/battles/worshippers endpoints |
| `chronicler/api/routes/civilizations.py` | Add groups sub-endpoint |
| `chronicler/api/routes/geography.py` | Add region detail, structure detail |
| `chronicler/api/routes/events.py` | Add year listing, single-event detail, event type stats |
| `chronicler/api/routes/explorer.py` | Add JSONB key inventory, row detail overlay, CSV/JSON export |
| `chronicler/api/templates/explorer.html` | Update navigateTo() to redirect to detail pages, add HF filters, export buttons |
| `chronicler/cli.py` | Add validate-phase2 command |

## Implementation Stages

### Stage 2.1: Entity Detail Page Framework

**Goal**: Build the reusable infrastructure before any detail pages.

1. **DFCalendar utility** (`explorer/calendar.py`) — 12 months, 4 seasons, `format_date(year, seconds72)`, `format_season()`, `_ordinal()`. Register as Jinja2 globals.

2. **EntityLinkRenderer + EntityNameCache** (`explorer/linking.py`) — Route map for 14 entity types. `link(entity_type, id, name, world_id)` produces `<a class="entity-link entity-{type}" href="..." data-entity-type data-entity-id>`. Cache uses `ANY($1::int[])` batch queries per entity type, 5-min TTL.

3. **PerspectiveRenderer** (`explorer/events.py`) — Takes event dict + perspective entity. Replaces perspective-entity references with pronouns (they/them/their based on field role). Linkifies all other entity references. Uses canonical HF-field list from research synthesis for ID detection (`*_hfid`, `*_entity_id`, `*_site_id`). Generates structured summary text per event (full narrative templates deferred to Phase 3).

4. **Base templates** — `base.html` (shared head), `detail_base.html` (header + content + sidebar layout), partials (_breadcrumb, _entity_header, _entity_events, _search_bar).

5. **Detail HTML router** (`routes/detail.py`) — Skeleton with first route (HF) and registration in `app.py`. Jinja2 globals wired up.

6. **Framework tests** — DFCalendar edge cases, link generation, name cache mock.

### Stage 2.2: Primary Entity Detail Pages (8 types)

Each page follows: fetch data in route -> pass to template -> template extends detail_base.html -> uses link() and df_date() globals.

1. **HF detail page** (`/explorer/hf/{id}`) — 24 sections. Server-loads core record + relationships + links. Lazy-loads events via AJAX (upgrade to use `event_entity_xref` instead of `hf_id_1/hf_id_2`). JSONB fields: skills, kills, entity_reputations, intrigue_actors, journey_pets, spheres, goals. Badges: vampire/necromancer/deity/ghost/etc. Family tree as linked list (Cytoscape deferred to Phase 4). New sub-endpoints in `people.py`: `/kills`, `/artifacts`, `/battles`, `/worshippers`.

2. **Entity/Civilization page** (`/explorer/entity/{id}`) — 5 tabs: Leaders (positions), Sites (owned), Members (paginated by importance), Groups (child entities from JSONB), Wars (attacker/defender). Reuses existing `civilizations.py` endpoints. Add `/groups` sub-endpoint.

3. **Site page** (`/explorer/site/{id}`) — 3 tabs: Structures, Properties (from JSONB), History (ownership timeline from events). Ruin status indicator.

4. **Artifact page** (`/explorer/artifact/{id}`) — Chain-of-custody timeline from events. Material, creator, holder. Written content link if book.

5. **Region page** (`/explorer/region/{id}`) — Biome type + evilness badges. Contained sites. Events.

6. **Structure page** (`/explorer/site/{site_id}/structure/{id}`) — Nested URL. Type badge, deity link for temples, entity owner.

7. **Written Content page** (`/explorer/written_content/{id}`) — Author (linked HF), referenced entities, styles, form type.

8. **Event Collection page** (`/explorer/collection/{id}`) — Hierarchy (war > battles > events). Attacker/defender. Subcollections expandable. 19 collection types.

9. **Bridge SPA to detail pages** — Update `navigateTo()` in `explorer.html` to redirect to `/explorer/{type}/{id}?world_id=N` for HF, entity, site. Add "View Detail" buttons on People/Civ/Geo tab detail panels.

### Stage 2.3: Secondary Entity Pages + Chronological Browser

All simple single-section pages extending `detail_base.html`:

1. Underground Region, Landmass, Mountain Peak, River, World Construction, Art Form, Identity, Historical Era — each gets one route in `detail.py` and one template.

2. **Chronological browser** (`/explorer/years`) — Year list with event counts (sidebar), events per year (paginated main content), event type filter, jump-to-year. New API endpoints in `events.py`: `/years`, `/years/{year}`, `/event_types`, `/event/{id}`.

### Stage 2.4: Search and Navigation

1. **Global search** (`routes/search.py`) — `GET /api/search?term=&world_id=&types=&limit=50`. Searches 15+ entity types with `unaccent() ILIKE`. Sorted: exact match first, then type priority, then alphabetical. Frontend: debounced 200ms autocomplete in nav bar, results grouped by type.

2. **HF type flag filters** — Checkboxes (deity, vampire, necromancer, werebeast, alive, ghost) above People tab. AND logic. Filtered count display.

3. **Hover popovers** — `GET /api/popover/{type}/{id}?world_id=`. Returns minimal JSON. Tippy.js via CDN. Delegated mouseover on `.entity-link`. 300ms delay, cached per link.

4. **Breadcrumb + prev/next** — Breadcrumb: Home > Type > Name. Prev/next: query adjacent IDs, render as floating buttons.

5. **URL hash tab persistence** — JS reads/writes `#tab=X` for tabbed detail pages.

6. **JSONB field inventory** — New endpoint in `explorer.py`: `GET /api/explorer/schema/jsonb_keys/{table}/{column}`. Renders in Schema browser.

7. **Row detail overlay** — Click row in Data browser -> modal with all fields, JSONB expanded, FK links. New endpoint: `GET /api/explorer/tables/{name}/row`.

8. **Export** — `GET /api/explorer/export/data/{table}?format=csv|json`. `GET /api/explorer/export/query?format=csv|json&sql=`. StreamingResponse for large sets.

### Stage 2.5: Validation and Delivery

1. **Phase 2 validator** (`validate_phase2.py`) — Automated DoD checks against live server: all 15+ entity routes return 200, search works, cross-links valid, events paginate, etc.

2. **CLI command** — `chronicler validate-phase2 --world-id N`

3. **Completion report** — Summary + mini-tutorial in `projects/chronicler/reports/phase-2-completion-report.md`.

## Dependency Graph

```
2.1.1 (calendar) ──┐
2.1.2 (linking)  ──┤── 2.1.5 (detail router + app.py) ──┬── 2.2.* (primary pages)
2.1.3 (perspective)┤                                      ├── 2.3.* (secondary pages)
2.1.4 (templates) ─┘                                      └── 2.4.* (search/nav)
2.1.6 (tests) ── independent
```

Stages 2.2 and 2.3 can be interleaved. Stage 2.4 depends on entity pages existing as link targets.

## Performance Targets

- HF detail (<1000 events): < 2s page load
- HF detail (1000+ events): < 5s (paginated)
- Global search: < 200ms response
- Popover AJAX: < 100ms (single-row PK lookup)
- Entity name cache warm: < 50ms per page

## Verification Plan

1. `chronicler serve --port 8080` — start the web server
2. Navigate to `/explorer/hf/1172?world_id=2` (top deity) — verify 24 sections render
3. Navigate to `/explorer/entity/18?world_id=2` — verify 5 tabs
4. Navigate to `/explorer/site/1?world_id=2` — verify 3 tabs
5. Test global search: type "Urist" — verify autocomplete dropdown
6. Hover over entity links — verify popovers appear
7. Click prev/next buttons — verify navigation
8. Run `chronicler validate-phase2 --world-id 2` — all checks pass
9. Run test suite: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/pytest tests/ -v`
