# Phase 2: Explorer Core -- PRD/Roadmap

**Version**: 1.0
**Date**: 2026-02-25
**Phase Duration**: 4-6 weeks
**Milestone**: M2 -- Explorer Complete
**Entry State**: 6 tabs (People, Civilizations, Geography, Schema, Data, Graph), basic data grid, FK navigation, JSONB expansion
**Exit State**: Full entity detail pages for all 15+ entity types, global search with autocomplete, perspective-aware cross-linking, hover popovers, prev-next navigation

**Parent Document**: Full Project Roadmap (full-project-roadmap.md)
**Dependencies**: Phase 1 (M1 -- Data Complete)
**Requirements Covered**: REQ-EXP-001 through EXP-030, REQ-NAV-001 through NAV-005, REQ-VIS-022, REQ-VIS-023

---

## 1. Phase Overview

Phase 2 builds the complete entity browsing experience. After Phase 1 populates all data into PostgreSQL, Phase 2 creates the UI and API layers that let users explore every entity type in the world. The centerpiece deliverables are 15+ entity detail pages (Historical Figure with 24 sections, Entity/Civilization with 5 tabs, Site with 3 tabs, and 12+ secondary entity pages), plus global search, cross-linking infrastructure, and hover popovers.

### 1.1 Design Principles

1. **Every entity is a page**: Every entity type in the CDM has a dedicated detail page with API endpoint
2. **Every reference is a link**: Every entity name mentioned anywhere is a clickable hyperlink to that entity's page
3. **Perspective-aware**: When viewing events on an entity's page, that entity is suppressed from event text and replaced with relational pronouns
4. **Consistent navigation**: Hover popovers, breadcrumbs, prev/next buttons, and URL hash persistence work identically across all entity types
5. **Server-side rendering**: HTML generated server-side via Jinja2 templates, with JavaScript for interactive components only

### 1.2 Current State

**Built**:
- Explorer UI shell with 6 tabs (People, Civilizations, Geography, Schema, Data, Graph)
- Paginated data grid (10/25/50/100 per page, server-side)
- Column-level filtering (partially)
- Column sorting (partially)
- FK link navigation (click FK values)
- JSONB collapsible expansion
- SQL Runner (read-only, safety measures)
- Schema browser (table list + column detail)
- Graph tab (vis.js ego network, partially built)

**Not built**:
- Entity detail pages (0 of 15+ types)
- Cross-linking infrastructure
- Perspective-aware event rendering
- Global search with autocomplete
- Hover popovers
- Prev/next navigation
- DF calendar utility
- JSONB field inventory in schema browser
- Row detail overlay
- Query results export

---

## 2. Stage 2.1: Entity Detail Page Framework

**Duration**: 1 week
**Dependencies**: Phase 1 complete (all tables populated)
**Deliverables**: Generic template system, cross-linking infrastructure, perspective engine, calendar utility

### 2.1.1 Design Generic Detail Page Template

**Requirement**: REQ-EXP-011 through EXP-019
**Priority**: P1

**Template architecture**:
```
detail_base.html (generic layout)
  +-- entity_header.html (name, type badges, vital stats)
  +-- entity_tabs.html (tab navigation, content areas)
  +-- entity_events.html (paginated event table)
  +-- entity_minimap.html (placeholder for Phase 4 mini-map)
  +-- entity_sidebar.html (quick stats, related entities)
```

**Generic header template**:
```html
<div class="entity-header">
    <div class="entity-type-badge {{ entity_type_class }}">{{ entity_type_display }}</div>
    <h1>{{ entity.name }}</h1>
    {% if entity.name_english %}
        <h2 class="entity-name-english">"{{ entity.name_english }}"</h2>
    {% endif %}
    <div class="vital-stats">
        {% for stat in vital_stats %}
            <span class="stat-pill">{{ stat.label }}: {{ stat.value }}</span>
        {% endfor %}
    </div>
</div>
```

**Tab system**:
- Tabs defined per entity type configuration
- URL hash persistence (`#tab=events` in URL)
- Tab content loaded on first click (lazy loading for heavy tabs)
- Default tab: "Overview" for all entity types

**API pattern**:
```
GET /api/explorer/{entity_type}/{entity_id}           -- full entity data
GET /api/explorer/{entity_type}/{entity_id}/events     -- paginated events
GET /api/explorer/{entity_type}/{entity_id}/related     -- related entities
GET /api/explorer/{entity_type}/{entity_id}/eventchart  -- event count by year
```

**Python endpoint pattern**:
```python
@app.get("/api/explorer/hf/{hf_id}")
async def get_hf_detail(hf_id: int, world_id: int):
    hf = db.query(HistoricalFigure).filter_by(world_id=world_id, id=hf_id).first()
    if not hf:
        raise HTTPException(404, f"Historical figure {hf_id} not found")
    return {
        "entity": hf.to_dict(),
        "links": get_hf_links(world_id, hf_id),
        "entity_links": get_hf_entity_links(world_id, hf_id),
        "site_links": get_hf_site_links(world_id, hf_id),
        "events": get_entity_events(world_id, 'hf', hf_id, page=1, per_page=50),
        "vital_stats": compute_hf_vital_stats(hf),
    }
```

**Acceptance criteria**:
- Base template renders cleanly for any entity type
- Tab navigation works with URL hash persistence
- Vital stats display correctly
- Template is extensible for type-specific sections

### 2.1.2 Cross-Linking Infrastructure

**Requirement**: REQ-EXP-027, REQ-NAV-001
**Priority**: P1

**Description**: Build the system that converts entity ID references into navigable HTML links across all views.

**Link renderer**:
```python
class EntityLinkRenderer:
    """Converts entity references to HTML <a> tags."""

    # Entity type -> URL pattern mapping
    ROUTES = {
        'hf': '/explorer/hf/{id}',
        'entity': '/explorer/entity/{id}',
        'site': '/explorer/site/{id}',
        'artifact': '/explorer/artifact/{id}',
        'region': '/explorer/region/{id}',
        'structure': '/explorer/site/{site_id}/structure/{id}',
        'written_content': '/explorer/written_content/{id}',
        'event_collection': '/explorer/collection/{id}',
        'world_construction': '/explorer/construction/{id}',
        'art_form': '/explorer/art_form/{id}',
        'identity': '/explorer/identity/{id}',
        'landmass': '/explorer/landmass/{id}',
        'mountain_peak': '/explorer/mountain_peak/{id}',
        'river': '/explorer/river/{id}',
    }

    def link(self, entity_type: str, entity_id: int, display_name: str,
             world_id: int, css_class: str = '') -> str:
        """Generate HTML link for an entity reference."""
        url = self.ROUTES.get(entity_type, '#').format(id=entity_id)
        url = f"{url}?world_id={world_id}"
        classes = f"entity-link entity-{entity_type} {css_class}".strip()
        return f'<a href="{url}" class="{classes}" data-entity-type="{entity_type}" data-entity-id="{entity_id}">{display_name}</a>'
```

**Entity name resolution**:
```python
class EntityNameCache:
    """Cache entity names for link generation. Loaded lazily per world."""

    def __init__(self, db_session, world_id: int):
        self._cache = {}
        self.db = db_session
        self.world_id = world_id

    def get_name(self, entity_type: str, entity_id: int) -> str:
        key = (entity_type, entity_id)
        if key not in self._cache:
            self._cache[key] = self._lookup(entity_type, entity_id)
        return self._cache[key]

    def _lookup(self, entity_type: str, entity_id: int) -> str:
        TABLE_MAP = {
            'hf': ('historical_figures', 'name'),
            'entity': ('entities', 'name'),
            'site': ('sites', 'name'),
            'artifact': ('artifacts', 'name'),
            'region': ('regions', 'name'),
            # ... etc.
        }
        table, col = TABLE_MAP[entity_type]
        result = self.db.execute(
            f"SELECT {col} FROM {table} WHERE world_id = :wid AND id = :eid",
            {'wid': self.world_id, 'eid': entity_id}
        ).fetchone()
        return result[0] if result else f"Unknown {entity_type} #{entity_id}"
```

**Integration with event rendering**: Every event's details JSONB is processed to replace entity ID references with HTML links before rendering.

**Acceptance criteria**:
- All entity types have link routes
- Entity names resolved from DB with caching
- Links work from any view to any entity type
- Unknown/deleted entities display graceful fallback text
- Performance: name resolution adds < 50ms per page (cache warm)

### 2.1.3 Perspective-Aware Event Rendering

**Requirement**: REQ-EXP-028, REQ-NAV-002
**Priority**: P1

**Description**: When viewing events on an entity's page, that entity is the "perspective" entity. The renderer suppresses self-links and uses relational pronouns.

**Algorithm**:
```python
class PerspectiveRenderer:
    """Render events from a specific entity's perspective."""

    def render_event(self, event: dict, perspective_type: str,
                     perspective_id: int, linker: EntityLinkRenderer) -> str:
        """Render a single event from the perspective of an entity."""
        text = self._base_render(event)

        # Replace perspective entity references with pronouns
        for field, value in event['details'].items():
            if self._is_entity_ref(field) and value == perspective_id:
                entity_type = self._field_to_entity_type(field)
                if entity_type == perspective_type:
                    # This is the perspective entity - use pronoun
                    text = text.replace(
                        linker.link(entity_type, value, name, world_id),
                        self._pronoun(perspective_type, event, field)
                    )
            else:
                # Other entity - make it a link
                text = self._linkify(text, field, value, linker)

        return text

    def _pronoun(self, entity_type: str, event: dict, field: str) -> str:
        """Generate appropriate pronoun based on context."""
        if field in ('hfid', 'hf_id', 'hist_figure_id'):
            return '<em>they</em>'  # subject
        elif field in ('target_hfid', 'victim_hfid'):
            return '<em>them</em>'  # object
        elif field == 'slayer_hf_id':
            return '<em>their</em>'  # possessive in "their hand"
        return '<em>they</em>'
```

**Reference**: weblegends (C++) implements full perspective-aware rendering with extensive pronoun substitution. LegendsBrowser2 (Go) also has context-aware rendering per event type.

**Acceptance criteria**:
- Perspective entity suppressed from event text
- Appropriate pronouns used based on grammatical role
- Non-perspective entities remain as links
- Works for all entity types as perspective

### 2.1.4 DF Calendar Utility

**Requirement**: REQ-NAV-005
**Priority**: P1

**Description**: Consistent DF date formatting used across all views and narrative.

```python
class DFCalendar:
    """Dwarf Fortress calendar conversion utility."""

    MONTHS = [
        'Granite', 'Slate', 'Felsite',       # Spring
        'Hematite', 'Malachite', 'Galena',   # Summer
        'Limestone', 'Sandstone', 'Timber',   # Autumn
        'Moonstone', 'Opal', 'Obsidian',     # Winter
    ]

    SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter']
    SEASON_PARTS = ['Early', 'Mid', 'Late']

    TICKS_PER_DAY = 1200
    DAYS_PER_MONTH = 28
    MONTHS_PER_YEAR = 12
    TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR  # 403,200

    @classmethod
    def from_seconds72(cls, year: int, seconds72: int) -> dict:
        """Convert year + seconds72 to structured date."""
        day_of_year = seconds72 // cls.TICKS_PER_DAY
        month_idx = day_of_year // cls.DAYS_PER_MONTH
        day_of_month = (day_of_year % cls.DAYS_PER_MONTH) + 1
        season_idx = month_idx // 3
        season_part_idx = month_idx % 3

        return {
            'year': year,
            'month': cls.MONTHS[min(month_idx, 11)],
            'month_idx': month_idx,
            'day': day_of_month,
            'season': cls.SEASONS[min(season_idx, 3)],
            'season_part': cls.SEASON_PARTS[min(season_part_idx, 2)],
        }

    @classmethod
    def format_date(cls, year: int, seconds72: int = None) -> str:
        """Format a DF date as human-readable string."""
        if seconds72 is None or seconds72 <= 0:
            return f"Year {year}"
        date = cls.from_seconds72(year, seconds72)
        return f"the {cls._ordinal(date['day'])} of {date['month']}, Year {year}"

    @classmethod
    def format_season(cls, year: int, seconds72: int) -> str:
        """Format as season string."""
        date = cls.from_seconds72(year, seconds72)
        return f"{date['season_part']} {date['season']}, Year {year}"

    @staticmethod
    def _ordinal(n: int) -> str:
        """Convert integer to ordinal string."""
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10 if n % 100 not in (11, 12, 13) else 0, 'th')
        return f"{n}{suffix}"
```

**Acceptance criteria**:
- All DF dates consistently formatted across all views
- Seasons and months correct
- Edge cases handled (year-only, seconds72=0)
- Used by event rendering, entity detail pages, and storyteller

---

## 3. Stage 2.2: Primary Entity Detail Pages

**Duration**: 2-3 weeks
**Dependencies**: Stage 2.1 (framework, cross-linking, perspective renderer, calendar)
**Deliverables**: Detail pages for the 8 most important entity types

### 3.1 Historical Figure Detail Page

**Requirement**: REQ-EXP-011
**Priority**: P1

The most complex detail page with 24 sections. This is the highest-traffic page type (HFs are the most frequently browsed entity type across all DF legend viewers).

**Route**: `GET /explorer/hf/{hf_id}?world_id={wid}`
**API**: `GET /api/explorer/hf/{hf_id}?world_id={wid}`

**24 Sections**:

| # | Section | Data Source | UI Element |
|---|---------|-------------|------------|
| 1 | Profile Overview | HF record + computed stats | Card with badges |
| 2 | Family Tree | hf_links (Mother/Father/Child/Spouse) | Cytoscape.js dagre (Phase 4, placeholder now) |
| 3 | Skills | HF skills JSONB | Scrollable table with rank icons |
| 4 | Related Factions/Groups | hf_entity_links | Linked entity list with position badges |
| 5 | Related Sites | hf_site_links | Linked site list with link type |
| 6 | Close Relationships | hf_links (all types) | Two-column list, sex-specific labels |
| 7 | Vague Relationships | HF details->vague_relationships | Simple list |
| 8 | Worshipped Deities | hf_links WHERE link_type='Deity' | List with worship strength badge |
| 9 | Journey Pets | HF journey_pets JSONB | Simple list |
| 10 | Noble Positions | hf_entity_links WHERE link_type='Position' | Timeline with date ranges |
| 11 | Worshipping Figures | hf_links targeting this HF WHERE link_type='Deity' | List (only shown if HF is_deity) |
| 12 | Worshipping Entities | entities that worship this HF | List (only shown if HF is_deity) |
| 13 | Notable Kills | HF kills->notable JSONB | Linked list with death type |
| 14 | Artifacts | HF holds_artifact + events | Linked artifact list |
| 15 | Dedicated Structures | structures WHERE deity_hf_id = this HF | Linked structure list |
| 16 | Snatcher Of | events WHERE type='hf_abducted' AND snatcher_hfid = this | Linked list |
| 17 | Battles | event_collections WHERE type='battle' AND involves this HF | Linked collection list with role |
| 18 | Beast Attacks | event_collections WHERE type='beast_attack' AND involves this HF | Linked collection list |
| 19 | Full Event History | event_entity_xref -> history_events | Paginated table, 1000/page |
| 20 | Entity Reputations | HF entity_reputations JSONB | Table with entity link + reputation type |
| 21 | Intrigue Actors/Plots | HF intrigue_actors JSONB | Detailed list |
| 22 | Used Identities | identities WHERE hf_id = this | Linked identity list |
| 23 | Squad Links | hf_entity_links WHERE link_type contains 'squad' | List |
| 24 | Site Property Links | hf_site_links WHERE link_type='SiteProperty' | Linked site list |

**Profile Overview card detail**:
```
Name: Urist Axedwarf "The Fiery Shield"
Race: Dwarf (Male)
Born: Year 1 (age 250)
Died: Year 251 (killed by Zefon, a goblin, SHOT, age 250)
Spheres: WAR, FORTRESSES (deity only)
Civilization: The Iron Hammers (Dwarf)
Type: [Vampire] [Necromancer] [Leader] [Ghost]
Importance Score: 847
```

**Visual type flag badges** (CSS classes from research synthesis):
```css
.hf-badge-vampire { background: #8b0000; color: white; }
.hf-badge-necromancer { background: #4b0082; color: white; }
.hf-badge-werebeast { background: #8b4513; color: white; }
.hf-badge-deity { background: #ffd700; color: black; }
.hf-badge-force { background: #87ceeb; color: black; }
.hf-badge-ghost { background: #c0c0c0; color: black; }
.hf-badge-leader { background: #228b22; color: white; }
.hf-badge-megabeast { background: #ff4500; color: white; }
```

**Event history pagination**:
- Default: 50 events per page on detail page
- "Show all" option loads 1000/page (with warning)
- Events rendered with perspective-aware renderer (this HF as perspective)
- Each event shows: year, date (if seconds72), type badge, narrative text with entity links

**Acceptance criteria**:
- All 24 sections render when data is available
- Sections with no data are hidden (not shown as empty)
- Perspective-aware event rendering works
- All entity references are cross-linked
- Page loads in < 2s for HFs with < 1000 events
- Page loads in < 5s for HFs with 1000+ events (paginated)

### 3.2 Entity (Civilization) Detail Page

**Requirement**: REQ-EXP-012
**Priority**: P1

**Route**: `GET /explorer/entity/{entity_id}?world_id={wid}`

**5 Tabs**:

| Tab | Content | Key Queries |
|-----|---------|-------------|
| **Leaders** | Position holders with date ranges | hf_entity_links WHERE link_type='Position' |
| **Sites** | Owned sites (current + historical) | sites WHERE owner_entity_id = this |
| **Members** | Notable members by importance score | hf_entity_links WHERE entity_id = this |
| **Groups** | Sub-entities, related groups | entity details->child_entities |
| **Wars** | War participation as aggressor/defender | event_collections WHERE type='war' AND involves this |

**Header**:
- Entity name + English translation
- Race badge (colored per civilization color system)
- Type badge (civilization, religion, performance_troupe, etc.)
- Member count
- Mini-map placeholder (sites highlighted)

**Position badges**:
```css
.position-noble { background: #daa520; }      /* amber */
.position-military { background: #dc143c; }   /* red */
.position-admin { background: #4169e1; }       /* blue */
.position-other { background: #808080; }       /* gray */
```

**Acceptance criteria**:
- All 5 tabs functional with correct data
- Leaders show position names and date ranges
- Sites distinguished between current and historical ownership
- Members sorted by importance score
- War tab shows aggressor/defender role

### 3.3 Site Detail Page

**Requirement**: REQ-EXP-013
**Priority**: P1

**Route**: `GET /explorer/site/{site_id}?world_id={wid}`

**3 Tabs**:

| Tab | Content | Key Queries |
|-----|---------|-------------|
| **Structures** | Buildings/structures at this site | structures WHERE site_id = this |
| **Properties** | Site properties, populations, features | site details JSONB |
| **History** | Ownership history + events | ownership_history + events |

**Header**:
- Site name + English translation
- Type badge (24 site types with distinct colors)
- Current owner entity (linked)
- Coordinates
- Mini-map placeholder
- Ruin status indicator (if destroyed)

**Ownership history timeline**:
```
Year 1-250: Founded by The Iron Hammers (Dwarves)
Year 250-350: Conquered by The Midnight Menace (Goblins)
Year 350: Destroyed
Year 412: Reclaimed by The Iron Hammers (Dwarves)
```

**Acceptance criteria**:
- All 3 tabs functional
- Structures listed with type and status
- Ownership history rendered as timeline
- Ruin status visible in header

### 3.4 Artifact Detail Page

**Requirement**: REQ-EXP-014
**Priority**: P2

**Route**: `GET /explorer/artifact/{artifact_id}?world_id={wid}`

**Key feature**: Chain-of-custody timeline showing every holder of the artifact.

**Chain-of-custody construction**:
1. Query events involving this artifact (from event_entity_xref)
2. Extract holder changes from events: created_by, given_to, stolen_by, lost, recovered
3. Render as vertical timeline with linked HF/entity at each step

**Content**:
- Name + English translation
- Material + item type
- Current holder/location (linked)
- Written content reference (if book/scroll)
- Creation details (maker HF, site, year)
- Full event history
- Importance score

**Acceptance criteria**:
- Chain-of-custody timeline renders correctly
- All holders linked
- Written content connection shown (if applicable)

### 3.5 Region Detail Page

**Requirement**: REQ-EXP-015
**Priority**: P2

**Route**: `GET /explorer/region/{region_id}?world_id={wid}`

**Content**:
- Region name
- Biome type (10 types: Wetland, Desert, Forest, etc.) with colored badge
- Evilness level (benign/neutral/evil, color-coded: aqua/white/fuchsia)
- Contained sites (linked list)
- Mini-map placeholder (region tiles highlighted)
- Events in this region
- Coordinate data

**Acceptance criteria**:
- Biome and evilness badges render correctly
- Sites within region linked

### 3.6 Structure Detail Page

**Requirement**: REQ-EXP-016
**Priority**: P2

**Route**: `GET /explorer/site/{site_id}/structure/{structure_id}?world_id={wid}`

**Content**:
- Structure name
- Type badge (12+ types: temple, tomb, mead_hall, library, dungeon, etc.)
- Ruin status
- Parent site (linked)
- Deity (if temple, linked to HF)
- Entity owner
- Events involving this structure

**Acceptance criteria**:
- Nested URL under parent site
- Type badges for all 12+ structure types
- Deity link for temples

### 3.7 Written Content Detail Page

**Requirement**: REQ-EXP-017
**Priority**: P2

**Route**: `GET /explorer/written_content/{wc_id}?world_id={wid}`

**Content**:
- Title
- Form (poem, short_story, essay, letter, etc.)
- Author (linked HF)
- Referenced entities (linked)
- Styles (list)
- Associated artifact (if a physical book)

**Acceptance criteria**:
- Author linked to HF page
- Referenced entities all cross-linked
- Form type displayed

### 3.8 Event Collection Detail Page

**Requirement**: REQ-EXP-018
**Priority**: P2

**Route**: `GET /explorer/collection/{collection_id}?world_id={wid}`

**Hierarchy display**: Event collections can contain sub-collections (War contains Battles, Battles contain individual events). Display as expandable tree.

**War detail**:
- Aggressor entity (linked)
- Defender entity (linked)
- Duration (start_year to end_year)
- Sub-collections (battles, sieges)
- All events (paginated)
- Map markers placeholder (battle locations)

**Battle detail**:
- Attacker/defender entities (linked)
- Location (site or region, linked)
- Outcome
- Individual events
- Named participants

**19 collection types**: battle, war, duel, raid, site_conquered, insurrection, persecution, purge, entity_overthrown, beast_attack, abduction, theft, occasion, procession, ceremony, performance, competition, journey

**Acceptance criteria**:
- Hierarchy navigation (parent/child collections)
- War and battle views show attacker/defender
- All 19 collection types handled
- Events within collection paginated

---

## 4. Stage 2.3: Secondary Entity Detail Pages

**Duration**: 1 week
**Dependencies**: Stage 2.1 (framework)
**Deliverables**: Detail pages for remaining entity types + chronological browser

### 4.1 Secondary Entity Pages

Each secondary entity type follows the same generic detail template pattern but with simpler content.

#### Task 2.3.1: Underground Region Detail Page

**Route**: `GET /explorer/underground_region/{id}?world_id={wid}`
- Type (cavern layer 1/2/3, magma sea, underworld)
- Depth
- Coordinates
- Related events

#### Task 2.3.2: Landmass Detail Page

**Route**: `GET /explorer/landmass/{id}?world_id={wid}`
- Name
- Bounding box coordinates
- Mini-map placeholder
- Contained regions/sites

#### Task 2.3.3: Mountain Peak Detail Page

**Route**: `GET /explorer/mountain_peak/{id}?world_id={wid}`
- Name
- Height
- Is volcano (with distinct styling)
- Coordinates
- Related events

#### Task 2.3.4: River Detail Page

**Route**: `GET /explorer/river/{id}?world_id={wid}`
- Name + English translation
- Path coordinates
- End type (ocean, lake, underground)
- Mini-map placeholder with river path

#### Task 2.3.5: World Construction Detail Page

**Route**: `GET /explorer/construction/{id}?world_id={wid}`
- Name
- Type (road, bridge, tunnel)
- Path coordinates
- Connected sites
- Mini-map placeholder

#### Task 2.3.6: Art Form Detail Pages (3 types)

**Route**: `GET /explorer/art_form/{id}?world_id={wid}`
- Name
- Form type (dance, musical, poetic)
- Description
- Origin entity/HF (linked)
- Creation year
- Form-specific details (instruments, rhythms, structure)

#### Task 2.3.7: Identity Detail Page

**Route**: `GET /explorer/identity/{id}?world_id={wid}`
- Assumed name + race + profession
- Associated HF (the real person, linked)
- Entity association (linked)
- Active since year
- Replaced identity (if any, linked)

#### Task 2.3.8: Historical Era Detail Page

**Route**: `GET /explorer/era/{id}?world_id={wid}`
- Era name
- Type
- Start year - End year (duration)
- Major events within era
- Statistics (events per category)

### 4.2 Chronological Browser

#### Task 2.3.9: Years and Events Browser

**Requirement**: REQ-VIS-022
**Priority**: P2

**Route**: `GET /explorer/years?world_id={wid}`

**Description**: Chronological index of all events organized by year.

**UI elements**:
- Year selector (jump to year)
- Events per year summary (expandable)
- Event type filter
- Pagination: 1000 events per page
- Event type meta-page: counts per type with links

**API**:
```
GET /api/explorer/years?world_id={wid}                         -- year list with event counts
GET /api/explorer/years/{year}?world_id={wid}&page=1           -- events in specific year
GET /api/explorer/event_types?world_id={wid}                   -- event type statistics
GET /api/explorer/event/{event_id}?world_id={wid}              -- single event detail
```

**Acceptance criteria**:
- All years with events listed
- Events within year paginated
- Event type statistics page functional
- Individual event detail page with all JSONB fields rendered

---

## 5. Stage 2.4: Search and Navigation

**Duration**: 1 week
**Dependencies**: Stages 2.2-2.3 (entity pages must exist as link targets)
**Deliverables**: Global search, filtering, popovers, navigation aids, export

### 5.1 Global Search with Live Autocomplete

**Requirement**: REQ-EXP-021, REQ-EXP-020
**Priority**: P1

**API**: `GET /api/search?term={term}&world_id={wid}&types={types}&limit=50`

**Implementation**:
```python
@app.get("/api/search")
async def global_search(term: str, world_id: int, types: str = None, limit: int = 50):
    """Search across all entity types with accent-insensitive matching."""
    results = []
    search_types = types.split(',') if types else ALL_ENTITY_TYPES

    for entity_type in search_types:
        table, name_col = SEARCH_TABLES[entity_type]
        query = f"""
            SELECT id, {name_col} as name, '{entity_type}' as type
            FROM {table}
            WHERE world_id = :wid
            AND unaccent({name_col}) ILIKE unaccent(:term)
            ORDER BY importance_score DESC NULLS LAST, {name_col}
            LIMIT :limit
        """
        rows = db.execute(query, {'wid': world_id, 'term': f'%{term}%', 'limit': limit})
        results.extend([dict(r) for r in rows])

    # Sort combined results: exact match first, then by type priority, then alphabetical
    results.sort(key=lambda r: (
        0 if r['name'].lower() == term.lower() else 1,
        ENTITY_TYPE_PRIORITY.get(r['type'], 99),
        r['name'].lower()
    ))
    return results[:limit]
```

**Frontend autocomplete**:
```javascript
// Debounced 200ms keystroke handler
let searchTimeout;
document.getElementById('global-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const term = e.target.value;
        if (term.length < 2) return;
        fetch(`/api/search?term=${encodeURIComponent(term)}&world_id=${worldId}`)
            .then(r => r.json())
            .then(results => renderSearchDropdown(results));
    }, 200);
});
```

**Search result categorization**: Results grouped by entity type in dropdown, with type badges.

**Acceptance criteria**:
- Accent-insensitive matching (Urist matches Urist and urist)
- Live autocomplete with 200ms debounce
- Results categorized by entity type
- Exact matches prioritized
- Search scope: all 15+ entity types
- Performance: < 200ms response for typical queries

### 5.2 HF Filtering by Type Flags

**Requirement**: REQ-EXP-022
**Priority**: P2

**Route**: `GET /explorer/hf?world_id={wid}&filter=vampire&sort=kills`

**Filter options**: deity, force, vampire, werebeast, necromancer, alive, ghost, adventurer, race (dropdown)
**Sort options**: name, race, birth year, death year, kills (importance_score), alphabetical

**Implementation**: Add filter checkboxes above the People tab data grid. Each filter translates to a SQL WHERE clause condition.

**Acceptance criteria**:
- All filter options functional
- Multiple filters combinable (AND logic)
- Sort options work correctly
- Filtered count displayed

### 5.3 Hover Popovers

**Requirement**: REQ-NAV-003, REQ-VIS-011
**Priority**: P2

**API**: `GET /api/popover/{entity_type}/{entity_id}?world_id={wid}`

**Popover content by type**:
| Entity Type | Popover Fields |
|-------------|---------------|
| HF | name, race, sex, birth/death year, type flags (badges), profession |
| Site | name, type, current owner entity |
| Entity | name, type, race |
| Artifact | name, material, current holder |
| Region | name, biome type, evilness |
| Structure | name, type, parent site |

**Frontend implementation**:
```javascript
// Tippy.js or Bootstrap 5 popover
document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('.entity-link');
    if (!link || link._popoverLoaded) return;

    const type = link.dataset.entityType;
    const id = link.dataset.entityId;

    fetch(`/api/popover/${type}/${id}?world_id=${worldId}`)
        .then(r => r.json())
        .then(data => {
            link._popoverLoaded = true;
            tippy(link, {
                content: renderPopoverHTML(type, data),
                allowHTML: true,
                interactive: true,
                delay: [300, 100],  // show after 300ms hover, hide after 100ms leave
            }).show();
        });
});
```

**Acceptance criteria**:
- Hover triggers popover after 300ms
- Popover content loaded via AJAX (not preloaded)
- Popover dismisses on mouse leave
- Popover is interactive (links inside popover are clickable)
- No duplicate AJAX calls for same entity

### 5.4 Breadcrumb / Prev-Next Navigation

**Requirement**: REQ-NAV-004, REQ-EXP-029
**Priority**: P2

**Prev/Next buttons**: Floating action buttons on entity detail pages that navigate to the previous/next entity of the same type (by ID order).

**URL hash tab persistence**: When switching tabs on a detail page, update URL hash. On page load, restore the tab from URL hash.

```javascript
// Tab hash persistence
window.addEventListener('hashchange', () => {
    const tab = location.hash.replace('#tab=', '');
    if (tab) activateTab(tab);
});

document.querySelectorAll('.tab-link').forEach(link => {
    link.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        location.hash = `tab=${tab}`;
    });
});
```

**Acceptance criteria**:
- Prev/Next buttons navigate within entity type
- URL hash updates on tab switch
- Tab restored from URL hash on page load
- Breadcrumb shows: Home > Entity Type > Entity Name

### 5.5 JSONB Column Field Inventory

**Requirement**: REQ-EXP-004
**Priority**: P2

**Description**: In the schema browser, for each table with a JSONB column, show the union of all keys found across rows.

**API**: `GET /api/explorer/schema/jsonb_keys/{table_name}/{column_name}?world_id={wid}`

**Implementation**:
```sql
SELECT DISTINCT jsonb_object_keys(details) as key
FROM {table_name}
WHERE world_id = :wid AND details IS NOT NULL AND details != '{}'::jsonb
ORDER BY key;
```

**For nested JSONB**: Sample N rows and recursively extract key paths.

**Acceptance criteria**:
- All JSONB columns show their key inventory
- Nested keys shown as path (e.g., `skills[].name`)

### 5.6 Row Detail Overlay

**Requirement**: REQ-EXP-010
**Priority**: P2

**Description**: Click a row in the data browser for a full-screen detail view.

**Content**:
- All columns rendered with labels
- JSONB columns expanded as tree
- FK values as clickable links
- Related records listed (from event_entity_xref)
- Quick link to entity detail page (if entity has one)

**Acceptance criteria**:
- Works for any table in data browser
- JSONB fully expanded
- FK links functional

### 5.7 Query Results Export

**Requirement**: REQ-EXP-025
**Priority**: P2

**Formats**: CSV, JSON

**API**:
```
GET /api/explorer/export/data/{table_name}?format=csv&world_id={wid}&filters=...
GET /api/explorer/export/query?format=json&sql=...&world_id={wid}
```

**Implementation**: Streaming response for large result sets. CSV uses Python `csv.writer`, JSON uses `json.dumps`.

**Acceptance criteria**:
- CSV and JSON export functional
- Large result sets streamed (not buffered in memory)
- SQL Runner results exportable
- Data browser results exportable with current filters applied

---

## 6. Definition of Done (M2 Milestone)

Phase 2 is complete when ALL of the following are true:

### Entity Detail Pages
- [x] Historical Figure detail page (24 sections)
- [x] Entity/Civilization detail page (5 tabs)
- [x] Site detail page (3 tabs)
- [x] Artifact detail page (chain-of-custody)
- [x] Region detail page
- [x] Structure detail page
- [x] Written Content detail page
- [x] Event Collection detail page (hierarchy)
- [x] Underground Region detail page
- [x] Landmass detail page
- [x] Mountain Peak detail page
- [x] River detail page
- [x] World Construction detail page
- [x] Art Form detail pages (3 types)
- [x] Identity detail page
- [x] Historical Era detail page
- [x] Years and Events browser

### Search and Navigation
- [x] Global search with live autocomplete (accent-insensitive)
- [x] HF filtering by type flags
- [x] Hover popovers on all entity links
- [x] Breadcrumb / Prev-Next navigation
- [x] URL hash tab persistence
- [x] JSONB field inventory in schema browser
- [x] Row detail overlay in data browser
- [x] Query results export (CSV/JSON)

### Cross-Cutting
- [x] Cross-linked entity references everywhere
- [x] Perspective-aware event rendering
- [x] DF calendar formatting
- [x] Entity name cache for performance
- [x] All pages load within performance targets

---

## 7. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| HF detail page too slow (24 sections, many queries) | Medium | High | Lazy-load sections; use event_entity_xref index; cache heavy queries |
| Search too slow across 15+ tables | Medium | Medium | Use ILIKE with index; consider pg_trgm extension for fuzzy matching |
| Popover AJAX storms (many links hovered quickly) | Medium | Low | Debounce + LRU cache on client; rate limit on server |
| Cross-linking breaks for deleted/missing entities | Low | Medium | Graceful fallback text for unresolvable entity IDs |
| Tab state lost on navigation | Low | Low | URL hash persistence handles this |

---

## 8. Dependencies on Other Phases

| Consumer Phase | What It Needs From Phase 2 |
|---------------|---------------------------|
| **Phase 3 (Narrative)** | Event rendering infrastructure, cross-linking, perspective engine |
| **Phase 4 (Visualization)** | Detail page framework for embedding maps, charts, trees |
| **Phase 5 (Live Integration)** | Entity detail pages for KH-masked views |
| **Phase 6 (Advanced)** | Labor Manager builds on unit/HF detail pages |

---

*Phase 2: Explorer Core PRD/Roadmap v1.0 -- 2026-02-25*
*4 Stages, 30+ Tasks, 4-6 Weeks Estimated*
