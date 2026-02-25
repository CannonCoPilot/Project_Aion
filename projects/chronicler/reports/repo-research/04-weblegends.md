# Repository Research Report: weblegends

**Repository**: `GitRepos/weblegends`
**Author**: BenLubar
**Language**: C++ (DFHack plugin)
**Purpose**: In-game web server exposing live world history data via HTTP
**Key Files**: 30+ C++ source files, 96 event handler files

---

## Repository Overview

weblegends is a DFHack plugin that runs an HTTP web server inside the Dwarf Fortress process. It serves live world history data — figures, sites, entities, artifacts, events, eras — directly from game memory over HTTP. This is the only existing tool that provides live (in-memory) legends data without requiring an XML export cycle.

The plugin is by the same author as df-ai and provides an API that df-ai uses to expose its own status data.

---

## Architecture & Key Components

### HTTP Server (`http.cpp`, `server.cpp`)
- Custom socket-based HTTP server using CActiveSocket/CPassiveSocket
- Threaded client handling
- Keep-alive connection support
- Content-Type: text/html; charset=utf-8

### Layout System (`layout.cpp`)
- Wikipedia-style page layout with header navigation, sidebar, title
- CSS styling via `faux-wikipedia.css`
- CP437→UTF-8 stream buffer for proper character encoding

### Render Functions (render_*.cpp)
- `render_figure.cpp` (20KB): Historical figure detail pages with relationships, events, skills
- `render_site.cpp`: Site pages with structures, populations, events
- `render_entity.cpp`: Entity/civilization pages with positions, members, wars
- `render_item.cpp`: Artifact detail pages with history, holder chain
- `render_era.cpp`: Era browsing
- `render_eventcol.cpp`: Event collection (war, battle) detail pages
- `render_region.cpp`: Region detail
- `render_structure.cpp`: Site structure detail
- `render_layer.cpp`: Underground layer detail
- `render_list.cpp`: Paginated list views for all entity types
- `render_home.cpp`: Home page with civilization overview

### Event Handlers (`events/` directory — 96 files)
Each event type has its own .cpp file that renders the event as HTML with proper entity linking:
- `artifact_copied.cpp`, `artifact_created.cpp`, `item_stolen.cpp`
- `change_hf_body_state.cpp`, `hf_died.cpp`, `hf_wounded.cpp`
- `war_plundered_site.cpp`, `war_peace_rejected.cpp`
- `performance.cpp`, `ceremony.cpp`, `competition.cpp`
- `regionpop_incorporated_into_entity.cpp`
- And 84 more...

### Export System (`export.cpp`)
- Static HTML export of all pages for offline viewing
- Recursive page crawling with link following
- Queue-based export to avoid missing connected pages

### Map Rendering (`map.cpp`, 13KB)
- World map generation from live game memory
- Biome coloring, site markers, coordinate overlay
- Image output for embedding in HTML pages

### Helper System (`helpers.cpp`, 48KB + `helpers/`)
- Entity name resolution from live memory
- Event text generation with proper entity references
- Link generation for cross-page navigation
- Extensive use of df-structures for memory access

### Plugin API (`weblegends-plugin.h`)
- v0 and v1 handler interfaces for other plugins to register pages
- df-ai uses this to add its own pages to the weblegends server
- Extensible plugin system for third-party page providers

---

## Extractable Features for Chronicler

### F-WL-01: Live In-Memory Data Access Patterns
- **User QoL**: Access world data in real-time without export cycles — the game IS the data source
- **Implementation**: All render functions access `df::global` directly through DFHack's memory model. `helpers.cpp` (48KB) contains the complete resolution logic for translating memory pointers to display strings.
- **Chronicler relevance**: Validates that live data access via DFHack is architecturally sound; the render functions document exactly which memory paths contain which data

### F-WL-02: 96 Event Type Renderers
- **User QoL**: Every event type rendered with full context, linked entities, and natural-language descriptions
- **Implementation**: Individual .cpp files per event type, each extracting type-specific fields and generating hyperlinked HTML. This is the most complete event rendering reference for live data.
- **Chronicler relevance**: Event type rendering templates for Explorer event detail views; natural-language event descriptions for Storyteller

### F-WL-03: Wikipedia-Style Hyperlinked Navigation
- **User QoL**: Every entity reference is a clickable link — browse from a figure to their killer to the site where they died to the entity that controls that site
- **Implementation**: Layout system with standardized URL patterns (/figure/123, /site/456, /entity/789). `helpers.cpp` generates links with consistent URL structure.
- **Chronicler relevance**: Explorer UI navigation pattern; URL routing design for the web frontend

### F-WL-04: World Map from Live Memory
- **User QoL**: See the current state of the world map without exporting legends
- **Implementation**: `map.cpp` reads terrain data directly from `df::global` memory, generates an image with biome colors and site markers.
- **Chronicler relevance**: Real-time map data access patterns; could enhance Geography tab with live map data

### F-WL-05: Static Export System
- **User QoL**: Export the entire web view as static HTML files for offline browsing or sharing
- **Implementation**: `export.cpp` crawls all pages recursively, following links and queuing connected pages, writing HTML to disk.
- **Chronicler relevance**: "Export to HTML" feature for sharing world histories; snapshot functionality

### F-WL-06: Plugin Extension API
- **User QoL**: Other DFHack plugins can add pages to the web server, creating an extensible platform
- **Implementation**: `weblegends-plugin.h` defines handler interfaces (v0 for simple, v1 for full control including status codes and headers). Plugins register via DFHack's data sharing system.
- **Chronicler relevance**: Plugin architecture reference if Chronicler ever needs to support third-party extensions

### F-WL-07: Entity Detail Pages
- **User QoL**: Detailed pages for historical figures (relationships, events, skills, positions), sites (structures, populations), entities (positions, members, diplomatic relations)
- **Implementation**:
  - `render_figure.cpp` (20KB): Full HF biography with links, relationships, events, positions held
  - `render_entity.cpp` (7KB): Entity overview with position hierarchy, members, wars
  - `render_site.cpp` (4KB): Site with structures, events, populations
  - `render_item.cpp` (7KB): Artifact with creation story, holder chain, associated events
- **Chronicler relevance**: Detail page content structure for all Explorer tabs

### F-WL-08: Paginated List Views
- **User QoL**: Browse large numbers of entities (50K+ figures) with pagination
- **Implementation**: `render_list.cpp` implements generic paginated list rendering for all entity types with page navigation.
- **Chronicler relevance**: Pagination pattern for Explorer table views

### F-WL-09: CP437 Stream Buffer
- **User QoL**: Correct display of DF character names and special characters
- **Implementation**: Custom `cp437_streambuf` wrapper that converts CP437 bytes to UTF-8 on output.
- **Chronicler relevance**: Encoding handling reference; confirmed same approach as Chronicler's `dfhack.df2utf()`

---

## Key Insights

1. **weblegends is the only tool that serves live data via HTTP** — this is architecturally identical to what Chronicler's bridge does, but weblegends runs as a native C++ DFHack plugin rather than Lua + Python
2. **96 event type renderers** provide the definitive reference for how to display each event type with appropriate context
3. **The helpers.cpp file (48KB)** is essentially a complete DF data access library — every entity resolution pattern needed is documented there
4. **The plugin extension API** demonstrates that weblegends was designed as a platform, not just a viewer — df-ai leverages this extensively
5. **Performance is native C++** and serves pages near-instantly from game memory — Chronicler's Python/Lua bridge approach will be slower but more maintainable
6. **The static export** feature addresses the use case of sharing world history — something Chronicler should also support
7. **weblegends only works while DF is running** — it has no persistence, no database, no search. Chronicler's PostgreSQL backend addresses all of these gaps
