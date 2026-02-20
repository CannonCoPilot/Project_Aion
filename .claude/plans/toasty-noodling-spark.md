# Chronicler PoC — Phases 1-3 Implementation Plan

## Context

Chronicler is a Dwarf Fortress AI storyteller + living atlas. It reads from DFHack RPC (live fortress data) and legends XML (world history), stores in a PostgreSQL+pgvector CDM, and exposes AI storytelling + REST/WebSocket APIs.

**Pillar 0 is DONE**: UTM VM at `192.168.64.2` running Windows 11 ARM with DF + DFHack, TCP port 5000 accessible from macOS. The user is generating a save game for future data extraction.

**Goal**: PoC-quality — working demos, not polished production code. Each phase produces a runnable deliverable.

**Project root**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/`

---

## Key Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event table design | Single wide table + JSONB overflow | 144 subtypes; per-type tables absurd for PoC. ~20 nullable FK columns cover 95% of queries |
| ORM | Raw asyncpg | Simpler than SQLAlchemy for PoC; direct SQL is debuggable |
| Proto generation | Clone DFHack proto dir + `protoc` | 5 proto files needed; hand-writing is error-prone |
| XML parsing | `lxml.iterparse` (streaming) | Handles 200MB+ legends files without OOM |
| Embedding store | pgvector (same DB) | JOINs embedding results directly with CDM records; no cross-service |
| LLM backend | qwen3-32b via LiteLLM (localhost:4000) | Local, free, thinking mode = better prose |
| CLI framework | Click | Lightweight, composable subcommands |

## Infrastructure Reuse

All existing infrastructure is reused — no new containers:

| Component | Endpoint | Status |
|-----------|----------|--------|
| PostgreSQL + pgvector + pg_search | localhost:5432 | Running. Create new `chronicler` DB |
| MLX Embedding Server (2560-dim) | localhost:8000 | Running. `/embed_batch` for bulk |
| LiteLLM (qwen3-32b, 8b, fast) | localhost:4000 | Running |
| DFHack RPC (in UTM VM) | 192.168.64.2:5000 | Running when DF is active |

**New dependency**: `asyncpg` (not in Jarvis venv). Chronicler gets its own venv.

---

## Phase 1: CDM Design & Data Ingestion

### 1.1 Project Scaffold

Create `projects/chronicler/` with:
```
pyproject.toml              # deps: asyncpg, pgvector, lxml, httpx, protobuf, click, numpy, fastapi, uvicorn
chronicler/
  __init__.py
  cli.py                    # Click CLI: init-db, import, sync, embed, ask, serve
  config.py                 # DB DSN, DFHack host/port, MLX URL, LiteLLM URL
  db/
    __init__.py
    schema.sql              # Full CDM DDL
    connection.py           # asyncpg pool + pgvector codec registration
    queries.py              # Parameterized query functions
  ingest/
    __init__.py
    xml_parser.py           # Streaming legends.xml parser
  dfhack/
    __init__.py
    client.py               # TCP RPC client (rewritten from dfhack_remote.py)
    methods.py              # Typed RPC method wrappers
    sync.py                 # Unit sync pipeline
    proto/                  # .proto files + generated _pb2.py
  storyteller/              # (Phase 2)
  api/                      # (Phase 3)
```

### 1.2 CDM Schema (schema.sql)

**Core tables** (11 tables + 6 link tables + indexes):

| Table | PK | Source | Key Fields |
|-------|-----|--------|------------|
| `worlds` | SERIAL | XML root | name, alt_name, import_path |
| `regions` | id (int) | XML | name, type, coords |
| `sites` | id (int) | XML | name, type, coord_x/y, owner_entity_id |
| `structures` | (site_id, id) | XML | name, type |
| `entities` | id (int) | XML | name, type (16 types), race, details JSONB |
| `historical_figures` | id (int) | XML | name, race, caste, birth/death years, entity_id, is_deity/vampire/necro flags, kill_count, event_count, skills/spheres/personality as JSONB |
| `hf_links` | SERIAL | XML | hf_id → target_hf_id + link_type (spouse/mother/father/etc) |
| `hf_entity_links` | SERIAL | XML | hf_id → entity_id + link_type + position_name |
| `hf_site_links` | SERIAL | XML | hf_id → site_id + link_type |
| `history_events` | id (int) | XML | year, seconds, event_type, ~20 nullable FK cols (hf_id_1/2, entity_id_1/2, site_id, artifact_id, region_id), details JSONB |
| `history_event_collections` | id (int) | XML | type, name, parent_id, start/end years, attacker/defender entity_ids |
| `collection_events` | (collection_id, event_id) | XML | join table |
| `collection_subcollections` | (parent_id, child_id) | XML | self-referencing join |
| `artifacts` | id (int) | XML | name, item_type, material, creator_hf_id, holder_hf_id, site_id |
| `units` | id (int) | DFHack RPC | name, race, profession, pos_x/y/z, skills/personality/labors as JSONB, last_synced_at |
| `embeddings` | SERIAL | Embed pipeline | entity_type, entity_id, chunk_index, chunk_text, content_hash, embedding vector(2560) |

Indexes on: events(year), events(event_type), events(hf_id_1/2), events(site_id), embeddings(entity_type, entity_id), embeddings vector ivfflat cosine.

### 1.3 Database Connection (connection.py)

- `create_pool(dsn)` → asyncpg pool with pgvector codec
- `init_db()` → CREATE DATABASE chronicler + run schema.sql
- Module-level singleton pool accessor

### 1.4 Configuration (config.py)

```python
DB_DSN = "postgresql://jarvis:{password}@localhost:5432/chronicler"
DFHACK_HOST = "192.168.64.2"
DFHACK_PORT = 5000
MLX_EMBED_URL = "http://localhost:8000"
LITELLM_URL = "http://localhost:4000"
EMBED_DIM = 2560
```

Password from env var or `.claude/secrets/credentials.yaml`.

### 1.5 XML Parser (xml_parser.py) — Core pipeline

Streaming `lxml.iterparse` with batch INSERTs (1000 rows/flush):

**Parse order** (matches XML structure + FK dependencies):
1. `<name>`, `<altname>` → `worlds`
2. `<regions><region>` → `regions`
3. `<sites><site>` + nested `<structures>` → `sites`, `structures`
4. `<entities><entity>` → `entities`
5. `<historical_figures><historical_figure>` → `historical_figures` + `hf_links` + `hf_entity_links` + `hf_site_links`
6. `<historical_events><historical_event>` → `history_events`
7. `<historical_event_collections>` → `history_event_collections` + `collection_events` + `collection_subcollections`
8. `<artifacts><artifact>` → `artifacts`

**Event type mapping**: Dict mapping ~30 common event types to their FK column assignments. Unmapped types dump all children to `details` JSONB.

**Reusable from df-narrator** (`/Users/nathanielcannon/Claude/Jarvis/projects/df-narrator/df_legends_common.py`):
- `_CONTROL_CHAR_RE` for XML cleaning
- `HF_FIELDS` set for cross-referencing event participants
- `format_time()` for year/seconds display
- `resolve_hf/site/entity()` patterns

### 1.6 DFHack RPC Client (client.py) — Rewritten from dfhack_remote.py

Source: `/Users/nathanielcannon/Claude/Jarvis/projects/dfhack-client-python/dfhack_remote.py`

**Fixes applied**:
1. **Bug fix line 26**: `h[4:7]` → `h[4:8]` (reads 3 bytes instead of 4 for 32-bit size)
2. **Configurable host/port** (was hardcoded `127.0.0.1:5000`)
3. **Error handling**: `RPC_REPLY_FAIL` raises exception instead of silent `None`
4. **Instance-based**: Replace global `_reader/_writer` with `DFHackClient` class + context manager
5. **Reconnect logic**: Exponential backoff on connection failure

### 1.7 Proto Compilation

Clone DFHack's proto directory (not full repo) and run `protoc`:
- `CoreProtocol.proto`, `Basic.proto`, `BasicApi.proto`, `RemoteFortressReader.proto`
- Generates `*_pb2.py` into `chronicler/dfhack/proto/`

### 1.8 RPC Methods (methods.py) + Unit Sync (sync.py)

Typed wrappers for: `GetGameValidity`, `GetMapInfo`, `GetUnitList`, `GetViewInfo`, `GetReports`

**Unit sync**: GetUnitList → batch UPSERT into `units` (ON CONFLICT DO UPDATE, set last_synced_at)

### 1.9 CLI Commands

- `chronicler init-db` — Create database + schema
- `chronicler import <path> [--legends-plus <path>]` — Import legends XML
- `chronicler sync [--host HOST] [--port PORT]` — Sync live units from DFHack
- `chronicler stats` — Show DB row counts

### Phase 1 Deliverable

```bash
python -m chronicler init-db
python -m chronicler import /path/to/region1-legends.xml
python -m chronicler sync --host 192.168.64.2
python -m chronicler stats  # shows row counts
```

### Phase 1 Verification

```sql
-- After import: verify counts match XML
SELECT 'figures' AS t, COUNT(*) FROM historical_figures
UNION ALL SELECT 'events', COUNT(*) FROM history_events
UNION ALL SELECT 'sites', COUNT(*) FROM sites
UNION ALL SELECT 'entities', COUNT(*) FROM entities;

-- Verify cross-references work
SELECT h.name, COUNT(e.id) as events
FROM historical_figures h
JOIN history_events e ON e.hf_id_1 = h.id
GROUP BY h.name ORDER BY events DESC LIMIT 10;

-- After sync: verify live units
SELECT name, race, profession FROM units WHERE is_alive LIMIT 20;
```

---

## Phase 2: AI Storyteller Pipeline

### 2.1 Biography Assembler (storyteller/biography.py)

Given `figure_id`, assembles structured biography from CDM:
1. Query historical_figures for core bio
2. Query hf_links for relationships (spouse, parents, children, deity, master)
3. Query hf_entity_links for political positions held
4. Query hf_site_links for home/lair
5. Query history_events WHERE hf_id_1 = id OR hf_id_2 = id ORDER BY year
6. Query artifacts WHERE creator_hf_id = id OR holder_hf_id = id

Output: structured markdown biography (~1000-5000 chars depending on figure importance).

Scoring formula adapted from df-narrator (`/Users/nathanielcannon/Claude/Jarvis/projects/df-narrator/df_narrator.py` lines 51-70):
```
score = min(events*2, 500) + kills*15 + type_bonus + links*3 + positions*20 + artifacts*30
```

### 2.2 Entity Text Generators (storyteller/generators.py)

Similar assemblers for sites, entities, wars, artifacts. Each produces structured text for embedding.

### 2.3 Embedding Pipeline (storyteller/embeddings.py)

For each entity:
1. Generate text via assembler
2. Chunk at ~1000 chars, 200-char overlap, sentence boundaries (pattern from `infrastructure/rag-service/mcp_server.py:55-98`)
3. Content-hash dedup (skip unchanged entities)
4. Call MLX `POST localhost:8000/embed_batch` (batches of 32)
5. INSERT into `embeddings` table

CLI: `chronicler embed [--entity-type TYPE] [--limit N]`

### 2.4 RAG Retrieval (storyteller/retrieval.py)

```python
async def semantic_search(query, top_k=5, entity_type=None):
    # 1. Embed query via MLX
    # 2. SELECT ... FROM embeddings ORDER BY embedding <=> $1 LIMIT $2
    # 3. Return [{entity_type, entity_id, chunk_text, score}]

async def build_context(query, max_tokens=4000):
    # Semantic search → fetch full bios for matched entities → assemble within budget
```

### 2.5 Prompt Templates (storyteller/prompts.py)

Four modes:
- **Narrator**: "You are the Chronicler, keeper of legends..."
- **Biographer**: "Craft the biography of {name}, a {race}..."
- **In-Character**: "You are {name}. Speak in first person. Your traits: {traits}..."
- **World Q&A**: "You are a knowledgeable guide to {world_name}..."

All grounded in CDM data via RAG context injection.

### 2.6 LLM Integration (storyteller/narrator.py)

Call LiteLLM at localhost:4000:
- Model: `qwen3-32b` (thinking mode for richer prose)
- Temperature: 0.7
- Max tokens: 2000
- System prompt: selected template + RAG context
- User prompt: the question

### 2.7 CLI Ask Command

`chronicler ask "Who was the most tragic dwarf?" [--mode narrator|biographer|character|qa] [--figure-id N]`

### Phase 2 Deliverable

```bash
python -m chronicler embed --entity-type historical_figure --limit 100
python -m chronicler ask "Who was the most legendary warrior?"
python -m chronicler ask "Tell me about your life" --mode character --figure-id 42
```

### Phase 2 Verification

```sql
SELECT entity_type, COUNT(*) FROM embeddings GROUP BY entity_type;
-- Should show historical_figure entries
```

Manual: verify narrative responses reference real events/names from the CDM.

---

## Phase 3: Data Viewer Backend

### 3.1 FastAPI App (api/app.py)

FastAPI with CORS, DB pool lifecycle, router registration. Serves at `localhost:8080`.

### 3.2 REST Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/stats` | GET | World overview: counts of all entity types, year range |
| `/figures` | GET | List figures (paginated, filterable by race/alive, sortable by event_count/kills) |
| `/figures/{id}` | GET | Figure detail + relationships + events |
| `/figures/{id}/biography` | GET | Assembled biography text |
| `/entities` | GET | List civilizations/religions/guilds |
| `/entities/{id}` | GET | Entity detail + members + sites |
| `/sites` | GET | List sites (filterable by type/owner) |
| `/sites/{id}` | GET | Site detail + structures + events |
| `/events` | GET | Paginated event log (filterable by type/year/figure/site) |
| `/events/types` | GET | All event types with counts |
| `/artifacts` | GET | List artifacts |
| `/artifacts/{id}` | GET | Artifact detail + ownership chain |
| `/collections` | GET | List wars/battles/etc. |
| `/collections/{id}` | GET | Collection detail + events + subcollections |
| `/search` | GET | Full-text (pg_search BM25) + semantic (pgvector) search |
| `/demographics/races` | GET | Population by race |
| `/demographics/timeline` | GET | Events per time bucket |
| `/demographics/deaths` | GET | Death cause breakdown |
| `/ask` | POST | AI storyteller endpoint |

### 3.3 WebSocket Live Unit Stream (api/routes/live.py)

`WS /ws/units` — Single background DFHack poller broadcasts to all connected clients via asyncio queue. Delta updates every 5 seconds.

### 3.4 Pydantic Response Models (api/models.py)

Standard paginated response: `{items: [...], total: int, limit: int, offset: int}`

### 3.5 CLI Serve

`chronicler serve [--host 0.0.0.0] [--port 8080]` → `uvicorn chronicler.api.app:app`

### Phase 3 Deliverable

```bash
python -m chronicler serve
curl localhost:8080/stats
curl localhost:8080/figures?limit=5&sort_by=event_count
curl -X POST localhost:8080/ask -d '{"question":"Who was the greatest warrior?"}'
```

### Phase 3 Verification

```bash
# Smoke test all endpoints
curl localhost:8080/stats
curl localhost:8080/figures?limit=5
curl localhost:8080/figures/1
curl localhost:8080/search?q=dragon&mode=text
curl localhost:8080/demographics/races
curl localhost:8080/openapi.json | python -m json.tool | head -20
```

---

## Execution Order & Dependencies

```
Phase 1 (can be parallelized internally):
  1.1 Scaffold + 1.2 Schema + 1.3 Connection + 1.4 Config  ← parallel
       ↓
  1.5 XML Parser  ← depends on schema/connection
  1.6-1.7 DFHack Client + Proto  ← parallel with XML work
       ↓
  1.8-1.9 Methods + Sync + CLI  ← depends on both tracks

Phase 2 (sequential, depends on Phase 1 data):
  2.1 Biography → 2.2 Generators → 2.3 Embeddings → 2.4 Retrieval → 2.5-2.6 Prompts + LLM → 2.7 CLI

Phase 3 (mostly parallel, depends on Phase 1 DB):
  3.1 App + 3.4 Models + 3.2 Routes  ← parallel
  3.3 WebSocket  ← depends on DFHack client
  3.5 AI endpoint  ← depends on Phase 2
```

## Files Touched Summary

**New files** (~25 files in `projects/chronicler/`):
- `pyproject.toml`, `chronicler/__init__.py`, `cli.py`, `config.py`
- `db/schema.sql`, `db/connection.py`, `db/queries.py`
- `ingest/xml_parser.py`
- `dfhack/client.py`, `dfhack/methods.py`, `dfhack/sync.py`, `dfhack/proto/*.proto`
- `storyteller/biography.py`, `generators.py`, `embeddings.py`, `retrieval.py`, `prompts.py`, `narrator.py`
- `api/app.py`, `api/models.py`, `api/routes/{figures,entities,sites,events,artifacts,collections,search,demographics,ask,live}.py`

**Existing files referenced** (read-only patterns to adapt):
- `/Users/nathanielcannon/Claude/Jarvis/projects/dfhack-client-python/dfhack_remote.py` — RPC client base (has bug at line 26)
- `/Users/nathanielcannon/Claude/Jarvis/projects/df-narrator/df_legends_common.py` — XML utilities, HF_FIELDS, name resolution
- `/Users/nathanielcannon/Claude/Jarvis/projects/df-narrator/df_narrator.py` — scoring formulas, XML parsing patterns
- `/Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/mcp_server.py` — chunking, hashing, embedding call patterns
- `/Users/nathanielcannon/Claude/Jarvis/infrastructure/docker-compose.yml` — PG config reference

**Infrastructure change**: Add `02-create-chronicler-db.sql` to `infrastructure/init-scripts/` for clean reprovisioning.
