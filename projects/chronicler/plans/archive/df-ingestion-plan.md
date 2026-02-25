# Dwarf Fortress Complete Ingestion & Indexing Plan

**Date**: 2026-02-19
**Status**: Draft
**Goal**: Index all relevant DF codebase sources, wiki documentation, and research materials into Qdrant for semantic search across the Chronicler project.

---

## Current State

### Already Indexed (Qdrant Collections)

| Collection | Points | Content | Status |
|-----------|--------|---------|--------|
| `dfhack` | 8,476 | DFHack core + scripts source code | Well-indexed |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source | Indexed |
| `df-wiki` | 4 | Wiki articles (barely started — 3 creature stubs) | Needs work |

### Already Cloned (Not Indexed)

| Repo | Location | Key Value |
|------|----------|-----------|
| `df-ai` | `projects/df-ai/` | Best DFHack plugin API reference (~32k lines C++) |
| `weblegends` | `projects/weblegends/` | Event/entity field reference for CDM (~20k lines C++) |
| `myDFHackScripts` | `projects/myDFHackScripts/` | Lua scripting patterns for data emission (~3.5k lines) |

### Not Yet Cloned

| Repo | GitHub URL | Priority | Value |
|------|-----------|----------|-------|
| `df-structures` | DFHack/df-structures | **CRITICAL** | XML definitions of ALL DF memory structures — canonical CDM data dictionary |
| `df-narrator` | DrPhilHarmonik/df-narrator | HIGH | Python legends parser + AI narrator pipeline (prototype of Chronicler storyteller) |
| `dfhack-client-python` | McArcady/dfhack-client-python | HIGH | Python RPC client needed for Chronicler Phase 0 |
| `LegendsBrowser2` | robertjanetzko/LegendsBrowser2 | MEDIUM | Go legends browser (streaming XML parser reference) |
| `LegendsViewer-Next` | Kromtec/LegendsViewer-Next | LOW | .NET + Vue frontend (reference for viewer design) |
| `df-sites-analyzer` | DrPhilHarmonik/df-sites-analyzer | LOW | Small Python analysis scripts |

---

## Ingestion Plan

### Stream 1: Codebase Indexing (→ dedicated Qdrant collections)

#### 1A. Index df-ai → `df-ai` collection (NEW)
- **Files**: All `.cpp` and `.h` files in root (71 files, ~32k lines)
- **Exclude**: `thirdparty/`, `test/`, `CMakeLists.txt`, `.git/`
- **Chunking**: Per-function or ~500-line chunks with file path metadata
- **Est. points**: ~1,500-2,000

#### 1B. Index weblegends → `weblegends` collection (NEW)
- **Files**: All `.cpp` and `.h` files in root + `events/` + `helpers/`
- **Exclude**: `thirdparty/`, `test/`, `CMakeLists.txt`, `.git/`, `faux-wikipedia.css`
- **Priority**: `events/*.cpp` (94 files showing every history_event subtype) and `render_*.cpp` files
- **Est. points**: ~3,000-4,000

#### 1C. Index myDFHackScripts → `dfhack` collection (APPEND to existing)
- **Files**: All `.lua` files (15 substantive scripts)
- **Exclude**: `test*.lua`, `Incest.lua`, `.log` files
- **Note**: Check if already partially in dfhack collection before re-indexing
- **Est. points**: ~200-300

#### 1D. Clone & index df-structures → `df-structures` collection (NEW)
- **Files**: All `.xml` structure definition files (14+ key files covering units, souls, history, entities, sites, items, artifacts, languages, regions, materials)
- **Exclude**: `.xsd` schema files, Perl transform scripts, `.git/`
- **This is the most important single repo for CDM design**
- **Est. points**: ~2,000-3,000

#### 1E. Clone & index df-narrator → `df-narrator` collection (NEW)
- **Files**: All `.py` files
- **Value**: Working legends XML parser + embedding + chatbot pipeline
- **Est. points**: ~300-500

#### 1F. Clone & index dfhack-client-python → `dfhack-client-python` collection (NEW)
- **Files**: All `.py` files + `.proto` files
- **Value**: Python RPC interface to DFHack
- **Est. points**: ~100-200

### Stream 2: Wiki Indexing (→ `df-wiki` collection)

#### Strategy: MediaWiki API + Selective Category Crawl

The DF wiki has 43,621 pages (10,131 articles). We do NOT want all of them — most are individual creature entries, bug reports, or stubs. Target: **~500-800 high-value core articles**.

**Phase 1 — Core Gameplay Categories** (~300 pages):

| Category | Est. Pages | Description |
|----------|-----------|-------------|
| DF2014:Fortress mode | 65 | Core fortress mechanics |
| DF2014:Guides | 47 | Tutorials and walkthroughs |
| DF2014:Game mechanics | 34 | Engine mechanics |
| DF2014:Interface | 50 | UI reference |
| DF2014:Buildings | 26 | Building types and usage |
| DF2014:Items | 52 | Item types and properties |
| DF2014:Designations | 10 | Mining/channeling commands |
| DF2014:Industry | 17 | Production chains |
| DF2014:Labors | 7 | Labor system |
| DF2014:Jobs | 6 | Job system |
| DF2014:Healthcare | 14 | Health mechanics |
| DF2014:Justice | 10 | Justice system |
| DF2014:Dwarves | 29 | Dwarf mechanics |
| DF2014:Economy | 5 | Economic systems |
| DF2014:Getting started | 14 | Beginner content |
| DF2014:Fortress defense | 12 | Military and defense |

**Phase 2 — World/History/Legends** (~150 pages):

| Category | Est. Pages | Description |
|----------|-----------|-------------|
| DF2014:Adventurer mode | 38 | Adventure mode mechanics |
| DF2014:Events | 4+ | History event types |
| DF2014:Lore | 4 | World lore |
| DF2014:Biomes | 16 | Geographic biome types |
| DF2014:Humanoids | 238 (selective) | Major sentient races/civs only (~30) |
| DF2014:Creature attributes | 35 | Attribute system |

Plus standalone pages:
- `DF2014:Legends`, `DF2014:World_generation`, `DF2014:Historical_figure`
- `DF2014:Entity`, `DF2014:Site`, `DF2014:Artifact`
- `DF2014:Personality_trait`, `DF2014:Emotion`, `DF2014:Thought`, `DF2014:Need`
- `DF2014:Skill`, `DF2014:Attribute`, `DF2014:Military`
- `DF2014:Noble`, `DF2014:Occupation`, `DF2014:Position`
- `DF2014:Material`, `DF2014:Metal`, `DF2014:Stone`, `DF2014:Wood`, `DF2014:Gem`

**Phase 3 — Modding/Data Reference** (~100 pages):

| Category | Est. Pages | Description |
|----------|-----------|-------------|
| DF2014:Files | 18 | Game file reference |
| DF2014:Creature raw pages | 769 (selective) | Raw token reference (~20 key pages) |
| DF2014:Building raw pages | 2 | Building raw tokens |
| DF2014:Inorganic raw pages | 265 (selective) | Material raw reference (~10 key pages) |

**Ingestion method**:
1. Use MediaWiki API: `action=query&prop=extracts&explaintext=true&titles=PAGE`
2. Fetch page content as plain text (MediaWiki handles wikitext → text conversion)
3. Chunk into ~1000-char segments with page title + section headers as metadata
4. Embed via MLX (Qwen3-Embedding-4B at localhost:8000)
5. Store in `df-wiki` collection with metadata: `{page_title, section, category, url}`

**Est. total wiki points**: ~5,000-8,000

### Stream 3: Research Collection Additions

- Index `dwarf-fortress-project-plan.md` → `research` collection
- Index `features.txt` from myDFHackScripts → `research` collection
- Index any additional research notes generated during this process

---

## Execution Order

1. **Clone missing repos** (df-structures, df-narrator, dfhack-client-python)
2. **Index codebase repos** (1A-1F) — parallel ingestion via jarvis-rag MCP
3. **Index research docs** (Stream 3) — quick, 2-3 documents
4. **Build wiki ingestion script** — Python script using MediaWiki API
5. **Run wiki ingestion** (Stream 2, Phase 1 → 2 → 3)
6. **Validate** — demonstrate semantic search across all collections

## Expected Final State

| Collection | Est. Points | Content |
|-----------|-------------|---------|
| `dfhack` | ~8,700 | DFHack core + scripts + myDFHackScripts |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source |
| `df-ai` | ~1,500-2,000 | Autonomous fort AI plugin |
| `weblegends` | ~3,000-4,000 | Web legends viewer plugin |
| `df-structures` | ~2,000-3,000 | DF memory structure XML definitions |
| `df-narrator` | ~300-500 | Python legends parser + narrator |
| `dfhack-client-python` | ~100-200 | Python RPC client |
| `df-wiki` | ~5,000-8,000 | Core DF wiki articles |
| `research` | ~1,200 | +DF project plan, features notes |

**Total new points**: ~12,000-18,000
**Grand total across all DF collections**: ~21,000-27,000 points

---

## Tools Required

- **jarvis-rag MCP**: `ingest_file`, `ingest_directory` tools for codebase indexing
- **MLX embedding server**: localhost:8000 (already running)
- **Qdrant**: localhost:6333 (already running, healthy)
- **Python script**: Custom MediaWiki API crawler for wiki ingestion
- **Git**: Clone missing repos

## Risk Factors

- **MLX server throughput**: Bulk embedding of ~20k chunks may take 30-60 minutes
- **Wiki API rate limiting**: MediaWiki API may throttle at high request rates — add 1s delay between pages
- **Qdrant memory**: Adding ~20k points at 2560-dim ≈ ~200MB additional RAM (within capacity)
