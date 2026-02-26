# Round 2 Consolidation: Data Pipeline & Ingestion Systems

## Source Documents

- `round1-pair-03.md`: Consolidation of the Live Polling Daemon (`watcher.py`) and the Monitoring & Observability system for the Storyteller web UI.
- `round1-pair-04.md`: Consolidation of Entity Position Extraction (CDM table additions from Legends XML) and the DF Data Ingestion & RAG Indexing plan (Qdrant knowledge base build-out).

---

## All Features & Requirements

### 1. Live Polling Daemon (`chronicler watch` / `watcher.py`)

- Continuous game-state capture: connect to DFHack on the target host (HomeServer or VM), dump live fortress data repeatedly on a configurable interval, disconnect gracefully on stop.
- Change detection across 5 event types: `ARRIVED`, `DIED`, `SKILL_UP`, `PROFESSION_CHANGED`, `SQUAD_CHANGED`.
- Fallback chain for data access (highest-to-lowest priority):
  1. RemoteFortressReader (RFR) — NOT available on HomeServer (DFHack 53.10-r1 does not ship it).
  2. HTTP bridge JSON — primary working path for HomeServer.
  3. Core RPC API (`ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads`).
  4. Lua probes via `dfhack-run` over SSH (replaces broken TCP RPC game-thread calls).
- System must operate at full capability using only the RPC+bridge path when RFR is unavailable.
- Game time tracking via Lua probe fallback when neither RFR nor bridge is available (probing `df.global.cur_year`, `cur_year_tick`, `cur_season`).
- CLI command `chronicler watch` with options: `--bridge-host`, `--interval`, `--enable-reports`, `--probe-interval`.
- Silent bootstrap on first cycle: log "Synced N units, 0 events" + game year/tick without generating false-positive change events.
- Store all detected change events in `unit_events` table in PostgreSQL.
- Store Lua probe results in `lua_probes` table for later querying.
- Store per-run metadata in `sync_snapshots` table.

### 2. Lua Bridge Script (`chronicler-bridge.lua`)

- Runs as a DFHack `repeat` job every 100 ticks on the DFHack console thread (where `CoreSuspend` works correctly).
- Writes comprehensive game state to `chronicler-state.json`, served over HTTP on port 8888.
- Current state: 51 lines — captures game time and creature raws only.
- Planned enhancement (+40 LOC) to add all data sections listed below.
- Data sections to be captured via `df.global`:
  - Game time: `df.global.cur_year`, `cur_year_tick`, `cur_season`
  - Fortress units: `df.global.world.units.active` — dwarves with stress, focus, names, squad assignments
  - Armies: `df.global.world.armies.all` — positions, member counts, controller IDs
  - Buildings: `df.global.world.buildings.all` — building counts by type
  - Artifacts: `df.global.world.artifacts.all` — named artifacts with translated names
  - History: `df.global.world.history.figures` / `.events` — counts and recent events
  - Announcements: `df.global.world.status.reports` — last 20 game announcements
  - Diplomacy: `entity.resources.diplomacy.state` — per-entity diplomatic relations for player civ (NOTE: `df.global.world.diplomacy` does NOT exist; must iterate entities)
  - Creature raws: `df.global.world.raws.creatures.all` — 934 creature type definitions
  - Unit count by race/caste
  - Building type summary
  - Active army positions
  - Fortress wealth and population statistics
- Invocation: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
- HTTP output served on port 8888 via PowerShell HTTP server on HomeServer.
- Bridge file location: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

### 3. Lua Probes (`probe.py`)

- Already-implemented probes: `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)`.
- New probes to add (+80 LOC):
  - `probe_game_time(client)` — cur_year, cur_year_tick, cur_season
  - `probe_population(client)` — unit counts by race from `world.units.active`
  - `probe_buildings(client)` — building counts by type from `world.buildings.all`
  - `probe_items_summary(client)` — item counts by type from `world.items.all`
  - `probe_artifacts(client)` — named artifacts from `world.artifacts.all`
  - `probe_history_figures(client)` — notable figures from `world.history.figures`
  - `probe_sites(client)` — active sites/civs from `world.entities.all`
  - `probe_reports(client)` — combat/announcements from `world.status.reports`
  - `probe_weather(client)` — `cur_season_tick`, weather state
  - `probe_unit_full(client, id)` — full unit data: skills, attributes, personality, beliefs, goals
- Each probe is a single-line Lua snippet returning JSON via `print(string.format(...))`.

### 4. Remote File Deployment to HomeServer (Phase 0)

- Deploy `chronicler-bridge.lua` to `dfhack-config/scripts/` on HomeServer without manual RDP intervention.
- Start the bridge as a repeat job via DFHack RPC.
- Start a PowerShell HTTP server on HomeServer port 8888 to serve `chronicler-state.json`.
- Remote access approach options (ranked by feasibility):
  1. User manually copies files via RDP (works now, manual)
  2. SMB to `C:\Users\Nathaniel` share + `script-paths.txt` entry (try next)
  3. WinRM / PowerShell Remoting (needs HomeServer config: `evil-winrm` or `pywinrm`)
  4. SSH server (OpenSSH Server Windows feature)
  5. DFHack RPC `run_command` to bootstrap file writes from existing RPC connection
- CURRENT BLOCKER: impacket remote exec auth failing — SMB signing required, null sessions disabled, possible account lockout.

### 5. Monitoring & Observability System

- Log every LLM interaction in the Storyteller web UI with full context.
- Captured fields per interaction:
  - `query` — user query text
  - `world` — world ID
  - `keywords` — searched keywords (array); requires `_extract_keywords` rename to public
  - `context_stats` — `context_records`, `context_chars`, `context_categories`
  - `model` — model name
  - `temperature` — temperature setting
  - `tokens_streamed` — token count
  - `response_chars` — response character count
  - `status` — success/error
  - `error` — error details if any
  - Four-phase latency breakdown: (1) context retrieval duration, (2) TTFT (time to first token), (3) LLM streaming duration, (4) total wall time
- Zero user-facing latency impact: `flush()` is async and called after the SSE stream completes.
- Monitoring dashboard page at `/monitoring` with:
  - Summary cards: total interactions, avg TTFT, avg total latency, error count.
  - Table of recent interactions: time, query, world, context records, tokens, TTFT, total, status.
  - Click-to-expand full detail for any row.
  - Auto-refresh every 30 seconds via `setInterval` + `fetch()`.
  - Same Tailwind dark theme as `index.html`.
- Three JSON API endpoints:
  - `GET /api/monitoring/interactions?limit=50&world_id=N` — recent interactions list.
  - `GET /api/monitoring/interactions/{id}` — full detail for one interaction.
  - `GET /api/monitoring/summary` — aggregate stats (total, avg TTFT, avg latency, error rate).

### 6. Entity Position Extraction (CDM — Legends XML)

- Extract all position data previously skipped entirely by the parser:
  - 11,712 position definitions
  - 13,501 current position assignments
  - 41,199 historical position links
- Store position definitions per entity (generic and gendered names, spouse titles) in new `entity_positions` table.
- Store who held which position and when (active and former) in new `hf_position_links` table, merging data from standard legends and legends_plus.
- Support the Knowledge Horizon masking system with tier-based visibility:
  - Civilization nobles always visible.
  - Religion title-holders always visible.
  - Positions are the mechanism enabling these rules.
- Expose new tables in the Database Explorer UI under the "Relationships" group.
- Support re-ingestion of existing worlds (idempotent upserts, DO NOTHING on conflict for FK mismatches).

### 7. RAG / Semantic Search Knowledge Base (DF Indexing)

- Build a comprehensive, searchable knowledge base across all DF reference sources to support Chronicler feature development and AI components (Storyteller, AI Player, CDM design, live interaction).
- Index all relevant DF codebase repositories into dedicated Qdrant collections:
  - `df-ai` — autonomous fort AI plugin (best DFHack plugin API reference)
  - `weblegends` — web legends viewer plugin (event/entity field reference for CDM)
  - `myDFHackScripts` — Lua scripting patterns (append to existing `dfhack` collection)
  - `df-structures` — XML definitions of ALL DF memory structures (canonical CDM data dictionary; CRITICAL priority)
  - `df-narrator` — Python legends XML parser + AI narrator pipeline (direct prototype reference; HIGH priority)
  - `dfhack-client-python` — Python RPC client for Chronicler Phase 0 live data access (HIGH priority)
- Index DF wiki articles selectively (~500–800 high-value core articles out of 43,621 total pages):
  - Phase 1: Core gameplay (~300 pages): fortress mode, guides, game mechanics, interface, buildings, items, designations, industry, labors, jobs, healthcare, justice, dwarves, economy, getting started, fortress defense.
  - Phase 2: World/history/legends (~150 pages): adventure mode, events, lore, biomes, major humanoid races/civs, creature attributes; plus standalone pages for Legends, World_generation, Historical_figure, Entity, Site, Artifact, Personality_trait, Emotion, Thought, Need, Skill, Attribute, Military, Noble, Occupation, Position, Material, Metal, Stone, Wood, Gem.
  - Phase 3: Modding/data reference (~100 pages): game files reference, selective creature raw pages, building raw pages, selective inorganic/material raw pages.
- Index additional research documents into the `research` collection:
  - `dwarf-fortress-project-plan.md`
  - `features.txt` from myDFHackScripts
  - Any additional research notes generated during the process.
- MEDIUM/LOW priority repos also identified for future cloning:
  - `LegendsBrowser2` (robertjanetzko/LegendsBrowser2) — Go legends browser, streaming XML parser reference
  - `LegendsViewer-Next` (Kromtec/LegendsViewer-Next) — .NET + Vue frontend, viewer design reference
  - `df-sites-analyzer` (DrPhilHarmonik/df-sites-analyzer) — small Python analysis scripts

---

## Implementation Architecture

### Environment (Ground Truth — HomeServer)

- **Host**: Windows 10 Pro x86_64 at `192.168.4.194`, machine name `WIN-48L3R2QLQN0`. Physical PC on local network, NOT a VM.
- **DF version**: Dwarf Fortress 53.10.
- **DFHack version**: 53.10-r1 (release) on x86_64.
- **DFHack RPC**: TCP port 5000. Firewall rule "DFHack RPC" created; port open and responding.
- **RemoteFortressReader**: NOT AVAILABLE on HomeServer. `enable RemoteFortressReader` returns "Cannot enable plugin." Not shipped with DFHack 53.10-r1.
- **DF install path**: `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`
- **DFHack init chain**: `dfhack.init` → `onLoad.init` → `onMapLoad.init`
- **DFHack config scripts**: `dfhack-config/scripts/` — custom scripts placed here are auto-discoverable.
- **User/pass**: Nathaniel / DwarfF0rtress. RDP enabled.

### Environment (UTM VM — Separate Target)

- **VM identity**: `DF-Windows` / `WIN-MRGFUCCV202` / `192.168.64.3` / Windows 11 Pro ARM 64-bit (10.0.26200)
- **VM access**: SSH with key `~/.ssh/df-vm`; `dfhack-run` over SSH as primary data transport.
- **RPC gotcha**: TCP RPC BROKEN for game-thread calls on DFHack 53.x under Prism. `GetVersion`/`GetWorldInfo` work (cached, no Core lock). All other calls hang indefinitely. Use `dfhack-run` over SSH.
- **File transfer**: HTTP file server on port 8889 (~105 MB/s) or SCP via `vm-lifecycle.sh scp-pull` (~19 MB/s, requires `-O -T` flags for Windows paths).

### Environment (Storyteller Web UI / Database)

- Web UI live at `localhost:8080`.
- Full SSE streaming from Qwen3-8B via LiteLLM.
- Two worlds loaded and queryable: Namoram (world 5, 109K records) and Ormon (1.54M records).
- Database: PostgreSQL `chronicler` on localhost:5432.

### Critical Data Access Gotchas

- `df.global.world.diplomacy` does NOT exist. Diplomacy is per-entity at `entity.resources.diplomacy.state`.
- `run_command('lua', ...)` via RPC HANGS due to CoreSuspend deadlock on the RPC thread. Do NOT use Lua probes over RPC for game-thread data. All such data is now routed through the bridge script.
- The bridge script runs on the DFHack console thread where CoreSuspend works correctly.
- `ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads` Core RPC calls always work as baseline.
- All `df.global` access paths verified against `df-structures` XML and DFHack scripts repo.

### Database Schema

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

#### `unit_events` table
Change events: `ARRIVED`, `DIED`, `SKILL_UP`, `PROFESSION_CHANGED`, `SQUAD_CHANGED`.

#### `sync_snapshots` table
Per-run metadata for each polling cycle.

#### `lua_probes` table
Stored results of Lua probe calls with timestamps.

#### `storyteller_log` table (+16 lines to schema.sql)
One row per LLM interaction:
```sql
-- Fields:
query TEXT,
world INT,
keywords TEXT[],
context_records INT,
context_chars INT,
context_categories TEXT[],
model TEXT,
temperature FLOAT,
tokens_streamed INT,
response_chars INT,
status TEXT,
error TEXT,
context_retrieval_ms FLOAT,
ttft_ms FLOAT,
llm_streaming_ms FLOAT,
total_ms FLOAT
```

#### `entity_positions` table (new, after `hf_site_links`, line 159 of schema.sql)
```sql
CREATE TABLE IF NOT EXISTS entity_positions (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,
    name            TEXT,
    name_male       TEXT,
    name_female     TEXT,
    spouse          TEXT,
    spouse_male     TEXT,
    spouse_female   TEXT,
    UNIQUE (world_id, entity_id, position_id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_entity_positions_entity
    ON entity_positions(world_id, entity_id);
```
Expected rows: ~11,712.

#### `hf_position_links` table (new)
```sql
CREATE TABLE IF NOT EXISTS hf_position_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    hf_id           INT NOT NULL,
    entity_id       INT NOT NULL,
    position_id     INT NOT NULL,
    start_year      INT,
    end_year        INT,
    UNIQUE (world_id, hf_id, entity_id, position_id, start_year),
    FOREIGN KEY (world_id, hf_id) REFERENCES historical_figures(world_id, id),
    FOREIGN KEY (world_id, entity_id) REFERENCES entities(world_id, id)
);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_hf
    ON hf_position_links(world_id, hf_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_entity
    ON hf_position_links(world_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_hf_position_links_current
    ON hf_position_links(world_id, entity_id) WHERE end_year IS NULL;
```
Expected rows: ~41,000–55,000.

### Parser Modifications — `chronicler/ingest/xml_parser.py`

#### 1. `_parse_historical_figures()` (line 169)
Add `hf_position_link_rows` as a 5th return list. After the site_link loop (line 263), parse active and former position links:

```python
# Position links (active)
for link in hf.findall("entity_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),  # maps to entity_positions.position_id
        _int(link, "start_year"),
        None,  # end_year (active = currently held)
    ))

# Former position links
for link in hf.findall("entity_former_position_link"):
    hf_position_link_rows.append((
        world_id, hfid,
        _int(link, "entity_id"),
        _int(link, "position_profile_id"),
        _int(link, "start_year"),
        _int(link, "end_year"),
    ))
```
Return signature changes from `tuple[list, list, list, list]` to `tuple[list, list, list, list, list]`.

#### 2. `_parse_legends_plus()` (line 451)
Add two new keys to result dict: `"entity_positions"` and `"entity_position_assignments"`. In the entity enrichment loop (line 530):

```python
# Position definitions
for pos in ent.findall("entity_position"):
    result["entity_positions"].append((
        world_id, eid,
        _int(pos, "id"),
        _text(pos, "name"),
        _text(pos, "name_male"),
        _text(pos, "name_female"),
        _text(pos, "spouse"),
        _text(pos, "spouse_male"),
        _text(pos, "spouse_female"),
    ))

# Current position assignments
for assign in ent.findall("entity_position_assignment"):
    histfig = _int(assign, "histfig")
    pos_id = _int(assign, "position_id")
    if histfig is not None and pos_id is not None:
        result["entity_position_assignments"].append((
            world_id, histfig, eid, pos_id,
            None, None,  # start/end year not in assignments
        ))
```

#### 3. `import_legends()` — Step 4 (line 700): insert HF position links from standard legends
After `hf_site_links` batch insert (line 731):

```python
n = await _batch_insert(conn, "hf_position_links",
    ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
    hf_position_link_rows,
    on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
counts["hf_position_links"] = n
log.info("  hf_position_links: %d", n)
```

#### 4. `import_legends()` — Step 5 (line 793): insert legends_plus position data
After entity enrichment insert (line 843):

```python
# Entity position definitions
if plus_data.get("entity_positions"):
    n = await _batch_insert(conn, "entity_positions",
        ["world_id", "entity_id", "position_id", "name",
         "name_male", "name_female", "spouse", "spouse_male", "spouse_female"],
        plus_data["entity_positions"],
        on_conflict="(world_id, entity_id, position_id) DO UPDATE SET "
            "name = COALESCE(EXCLUDED.name, entity_positions.name), "
            "name_male = COALESCE(EXCLUDED.name_male, entity_positions.name_male), "
            "name_female = COALESCE(EXCLUDED.name_female, entity_positions.name_female), "
            "spouse = COALESCE(EXCLUDED.spouse, entity_positions.spouse), "
            "spouse_male = COALESCE(EXCLUDED.spouse_male, entity_positions.spouse_male), "
            "spouse_female = COALESCE(EXCLUDED.spouse_female, entity_positions.spouse_female)")
    counts["entity_positions"] = n
    log.info("  entity_positions: %d", n)

# Position assignments from legends_plus (merge with position links)
if plus_data.get("entity_position_assignments"):
    n = await _batch_insert(conn, "hf_position_links",
        ["world_id", "hf_id", "entity_id", "position_id", "start_year", "end_year"],
        plus_data["entity_position_assignments"],
        on_conflict="(world_id, hf_id, entity_id, position_id, start_year) DO NOTHING")
    counts["entity_position_assignments"] = n
    log.info("  entity_position_assignments: %d", n)
```

### FK Ordering Constraints

- Entities inserted at line ~697; HFs at line ~704; HF links at lines 714–731.
- Position links from standard legends insert after HFs (line 731) — no FK ordering issues.
- Position definitions from legends_plus insert in Step 5 (after entities exist).
- Position assignments from legends_plus insert in Step 5 (after both entities and HFs exist).
- Legends_plus assignments may reference HF IDs not present in standard legends — handled with `DO NOTHING` on FK violation (same pattern as existing link tables).

### Python Modules (New and Modified)

#### `chronicler/dfhack/probe.py` (+80 LOC expansion)
Expand existing probe framework with 10 new probe functions.

#### `chronicler/dfhack/watcher.py` (+10 LOC change)
Existing file with RFR > bridge > core fallback chain. Update: when neither RFR nor bridge available, use `probe_game_time(client)` for game time instead of returning `None`.

#### `chronicler/monitoring.py` (~80 LOC new file)
- `InteractionLog` dataclass with all metric fields.
- Timing methods using `time.monotonic()`: `start()`, `context_done()`, `llm_start()`, `first_token()`, `count_token()`, `finish()`.
- `async flush(pool)` — single INSERT to `storyteller_log`, called after SSE stream completes.

#### `chronicler/api/routes/monitoring.py` (~55 LOC new file)
Three endpoints: interactions list, interaction detail, summary aggregate.

#### `chronicler/api/templates/monitoring.html` (~80 LOC new file)
Tailwind dark theme dashboard page with summary cards, interactions table, click-to-expand, 30s auto-refresh.

#### `chronicler/api/routes/storyteller.py` (+18 LOC)
Inline instrumentation (not middleware). Create `InteractionLog` at request start. Call `log.context_done()` after `retrieve_context()` + `format_context()`. Call `log.llm_start()` / `log.first_token()` / `log.count_token()` inside the SSE generator. Call `log.flush(pool)` after `{"done": True}` is yielded.

#### `chronicler/api/app.py` (+6 LOC)
Include monitoring router. Add `GET /monitoring` page route.

#### `chronicler/storyteller/context.py` (rename only)
Rename `_extract_keywords` → `extract_keywords` (2-line change) to allow the storyteller route to log keywords searched.

#### `chronicler/config.py` and `chronicler/dfhack/client.py`
IP updated to `192.168.4.194` (HomeServer).

### Explorer Integration — `chronicler/api/routes/explorer.py`

Add new tables to `TABLE_GROUPS["Relationships"]`:
```python
"Relationships": [
    "hf_links", "hf_entity_links", "hf_site_links",
    "hf_position_links", "entity_positions",       # new
    ...
]
```
`_TABLE_TO_GROUP` reverse lookup updates automatically from the loop.

### Schema Migration Files

- **`chronicler/db/schema.sql`**: Add two new CREATE TABLE statements after `hf_site_links` (after line 159).
- **`chronicler/db/migrate_positions.sql`** (new file): Standalone migration for existing databases.

### RAG Infrastructure

- **jarvis-rag MCP**: `ingest_file`, `ingest_directory` tools for codebase indexing.
- **MLX embedding server**: `localhost:8000`, model Qwen3-Embedding-4B (2560-dim Cosine). Already running.
- **Qdrant**: `localhost:6333`, already running and healthy. All collections use 2560-dim Cosine.
- **Python MediaWiki API crawler**: custom script to be written for wiki ingestion.
- **Git**: Clone missing repos before indexing.

### RAG Codebase Ingestion Streams

| Stream | Repo | Collection | Files | Est. Points | Status |
|--------|------|------------|-------|-------------|--------|
| 1A | `df-ai` (already cloned at `projects/df-ai/`) | `df-ai` (new) | All `.cpp`/`.h`, ~32k lines, 71 files | ~1,500–2,000 | Not yet indexed |
| 1B | `weblegends` (already cloned at `projects/weblegends/`) | `weblegends` (new) | All `.cpp`/`.h`, ~20k lines; priority: `events/*.cpp` (94 files) | ~3,000–4,000 | Not yet indexed |
| 1C | `myDFHackScripts` (already cloned at `projects/myDFHackScripts/`) | `dfhack` (append) | All `.lua`, ~3.5k lines, 15 scripts; exclude test*.lua, Incest.lua, .log | ~200–300 | Not yet indexed |
| 1D | `df-structures` (NOT YET CLONED — CRITICAL) | `df-structures` (new) | All `.xml` structure definition files (14+ key files) | ~2,000–3,000 | Not cloned |
| 1E | `df-narrator` (NOT YET CLONED — HIGH) | `df-narrator` (new) | All `.py` | ~300–500 | Not cloned |
| 1F | `dfhack-client-python` (NOT YET CLONED — HIGH) | `dfhack-client-python` (new) | All `.py` + `.proto` | ~100–200 | Not cloned |

### RAG Execution Order

1. Clone missing repos: `df-structures` (DFHack/df-structures), `df-narrator` (DrPhilHarmonik/df-narrator), `dfhack-client-python` (McArcady/dfhack-client-python).
2. Index codebase repos (Streams 1A–1F) — parallel ingestion via jarvis-rag MCP.
3. Index research docs (`dwarf-fortress-project-plan.md`, `features.txt`) — quick, 2–3 documents.
4. Build wiki ingestion Python script (MediaWiki API).
5. Run wiki ingestion (Phase 1 → 2 → 3, ~500–800 pages total; 1s delay between pages).
6. Validate — demonstrate semantic search across all collections.

### RAG Wiki Ingestion Method

1. MediaWiki API: `action=query&prop=extracts&explaintext=true&titles=PAGE`
2. Fetch page content as plain text (wikitext → text).
3. Chunk into ~1000-char segments with page title + section headers as metadata.
4. Embed via MLX (Qwen3-Embedding-4B at `localhost:8000`).
5. Store in `df-wiki` collection with metadata: `{page_title, section, category, url}`.
6. Add 1s delay between pages to avoid API rate limiting.

### Research Sources Confirming df.global Access Paths

- `df-structures` XML — definitive structure definitions.
- DFHack scripts repo — reference implementations.
- `myDFHackScripts` — community examples.
- `df-ai` — automation reference.
- All indexed in Qdrant for semantic search.

---

## Completion Status

### Live Polling Daemon

| Component | Status |
|-----------|--------|
| `dfhack/client.py` | Complete (IP updated to `192.168.4.194`) |
| `dfhack/probe.py` (armies, diplomacy, unit_detail) | Complete |
| `dfhack/detector.py` (ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED) | Complete |
| `dfhack/watcher.py` (polling daemon with fallback chain) | Complete; needs +10 LOC Lua probe fallback for game time |
| `cli.py` (`chronicler watch` command) | Complete |
| DB schema (`unit_events`, `sync_snapshots`, `lua_probes`) | Designed; migration needs to be applied |
| `dfhack/probe.py` (10 new probes) | Not yet implemented (+80 LOC) |
| `chronicler-bridge.lua` (expanded from 51 to ~91 lines) | Not yet implemented (+40 LOC) |
| Remote file deployment to HomeServer | BLOCKED — impacket remote exec auth failing; manual RDP workaround available |

**Primary blocker**: deploying Lua scripts to HomeServer without manual RDP. impacket remote exec auth is failing due to SMB signing required, null sessions disabled, and possible account lockout.

### Monitoring System

| Component | Status |
|-----------|--------|
| `chronicler/monitoring.py` | Not yet created (~80 LOC) |
| `chronicler/api/routes/monitoring.py` | Not yet created (~55 LOC) |
| `chronicler/api/templates/monitoring.html` | Not yet created (~80 LOC) |
| `storyteller.py` instrumentation | Not yet modified (+18 LOC) |
| `app.py` route registration | Not yet modified (+6 LOC) |
| `context.py` keyword rename | Not yet done (2-line rename) |
| `storyteller_log` table in schema.sql | Not yet added (+16 LOC) |

**Total monitoring work remaining**: ~230 LOC, 3 new files, 4 modified files. No new dependencies required.

### Entity Position Extraction

- **Status**: COMPLETE (plan marked `[COMPLETE]`, created 2026-02-22, Session 32)
- CDM had zero position data before this work despite XML containing 11,712 position definitions, 13,501 current assignments, and 41,199 historical links.
- All parser modifications, schema migration, and explorer integration defined and implemented.
- Re-ingestion of world 5 (Namoram) required after schema migration.
- Test suite: all 131 tests must pass after changes (`pytest tests/ -q`).

### RAG Indexing Plan

- **Status**: Draft (dated 2026-02-19); execution status beyond draft date is unknown.
- Already indexed at time of plan:
  - `dfhack` collection: 8,476 points (DFHack core + scripts)
  - `dwarf-therapist` collection: 926 points (Dwarf Therapist C++/Qt source)
  - `df-wiki` collection: 4 points (barely started — only 3 creature stubs)
- Already cloned but NOT indexed at time of plan: `df-ai`, `weblegends`, `myDFHackScripts`.
- Not yet cloned at time of plan: `df-structures`, `df-narrator`, `dfhack-client-python`, `LegendsBrowser2`, `LegendsViewer-Next`, `df-sites-analyzer`.

---

## Design Decisions & Rationale

### Polling Daemon Architecture

- **Lua scripting via `df.global` is the primary data access approach**, not RPC plugin calls. This is the officially supported community modding method.
- **Bridge + probes are complementary**: bridge handles bulk periodic dumps every 100 ticks; probes handle targeted queries on a separate configurable interval.
- **No RemoteFortressReader dependency**: RFR not available in DFHack 53.10-r1 on HomeServer; architecture must not require it.
- **No systemd/launchd service**: daemon runs as foreground CLI process (Ctrl+C to stop). Intentional simplicity for a dev tool.
- **No websocket push**: monitoring dashboard polls on 30s interval; events are queryable via SQL. Sufficient for local dev use.
- **No worldgen capture via RPC**: no worldgen-specific RPC methods exist. `legends.xml` is the correct path for historical data.
- **Lua probe data via bridge only**: `run_command('lua', ...)` hangs due to CoreSuspend deadlock on the RPC thread. All game-thread data routes through the HTTP bridge script instead.

### Monitoring Architecture

- **Inline instrumentation, not middleware**: middleware cannot capture per-phase latencies or SSE body content. Instrumentation is placed directly in the `/api/ask` handler and SSE generator.
- **Async flush after stream completes**: `log.flush(pool)` is called after `{"done": True}` is yielded, ensuring zero user-facing latency impact from logging.
- **PostgreSQL for structured data, not Python `logging`**: structured timing/metric data goes to the database for queryability; stdout logging is not used for LLM interactions.
- **No log rotation**: one row per question. Grows slowly for a local dev tool; rotation not needed.
- **No request middleware for read-only endpoints** (worlds, stats): only LLM interactions warrant monitoring overhead.
- **30-second poll for dashboard auto-refresh**: real-time websocket monitoring deemed unnecessary for local use.

### Entity Position Extraction

- **Dual-source merge strategy**: Position links come from two sources (standard legends XML and legends_plus XML). Both are merged into `hf_position_links` using `DO NOTHING` on conflict so overlapping records do not create duplicates.
- **NULL end_year = active**: A `NULL` value in `end_year` signals a currently-held position. A partial index on this condition supports efficient queries for current holders.
- **Position IDs are entity-local**: `position_id` is a local identifier within an entity (0, 1, 2...), not globally unique. The composite key `(world_id, entity_id, position_id)` is the correct reference.
- **Legends_plus assignments lack year data**: `<entity_position_assignment>` elements do not carry start/end year, so those fields are stored as NULL. Assignment rows from legends_plus may land in the `DO NOTHING` path if a corresponding legends link already covers the same (hf, entity, position) combination with a real start_year.
- **Upsert on position definitions**: Position definitions use `DO UPDATE SET ... COALESCE(...)` rather than `DO NOTHING` to allow legends_plus to enrich records already inserted from standard legends (e.g., filling in gendered name variants).
- **Knowledge Horizon dependency**: This entire feature exists to enable the Knowledge Horizon masking system's tier-based visibility rules. Without position data, nobles and title-holders cannot be reliably identified for always-visible tier assignment.

### RAG Indexing

- **Selective wiki crawl**: 43,621 wiki pages exist, but only ~500–800 are high-value for Chronicler development. Bulk crawl avoided in favor of targeted category-based selection.
- **df-structures rated CRITICAL**: The most important single repo for CDM design — canonical data dictionary for all DF memory structures.
- **df-narrator rated HIGH**: Represents a working prototype of the Chronicler AI storyteller pipeline (legends XML parser + embedding + chatbot); direct design reference.
- **dfhack-client-python rated HIGH**: Needed for Chronicler Phase 0 live data access via DFHack RPC.
- **Chunking strategy**: Codebase files chunked per-function or ~500-line segments; wiki articles chunked at ~1000-char segments — both include contextual metadata (file path, page title, section).
- **Parallel ingestion**: Codebase repo indexing to be executed in parallel via jarvis-rag MCP to minimize elapsed time.
- **myDFHackScripts appended to existing dfhack collection**: Rather than a new collection, Lua scripts augment the existing DFHack codebase collection to keep DFHack-related content co-located for semantic search.

---

## Metrics & Targets

### Polling Daemon

- Bridge polling interval: every 100 game ticks (DFHack repeat job).
- Watcher polling interval: configurable via `--interval` (verified default: 10 seconds).
- Probe interval: configurable via `--probe-interval` (verified default: 60 seconds).
- Total remaining LOC for daemon: ~130 LOC changes across 5 files, no new files.

### Monitoring System

- Total remaining LOC: ~230 LOC.
- New files: 3 (`monitoring.py`, `routes/monitoring.py`, `templates/monitoring.html`).
- Modified files: 4 (`storyteller.py`, `app.py`, `context.py`, `schema.sql`).
- New dependencies: 0.
- Dashboard auto-refresh interval: 30 seconds.
- Default interactions list page size: 50 (`?limit=50`).
- Storyteller log schema addition: +16 lines to `schema.sql`.

### Entity Position Extraction

| Table | Expected Row Count |
|-------|--------------------|
| `entity_positions` | ~11,712 |
| `hf_position_links` (combined) | ~41,000–55,000 |
| — Active (end_year IS NULL) | ~6,843 (from legends) + overlap from legends_plus |
| — Former | ~34,356 (from legends) |
| — From legends_plus assignments | up to ~13,501 (mostly overlapping) |

- Test suite requirement: all 131 tests must pass after changes (`pytest tests/ -q`).
- Explorer check: new tables must appear in Schema tab under "Relationships" group.

### RAG Indexing — Final State Targets

| Collection | Est. Points | Content |
|-----------|-------------|---------|
| `dfhack` | ~8,700 | DFHack core + scripts + myDFHackScripts |
| `dwarf-therapist` | 926 | Dwarf Therapist C++/Qt source |
| `df-ai` | ~1,500–2,000 | Autonomous fort AI plugin |
| `weblegends` | ~3,000–4,000 | Web legends viewer plugin |
| `df-structures` | ~2,000–3,000 | DF memory structure XML definitions |
| `df-narrator` | ~300–500 | Python legends parser + narrator |
| `dfhack-client-python` | ~100–200 | Python RPC client |
| `df-wiki` | ~5,000–8,000 | Core DF wiki articles (~500–800 pages) |
| `research` | ~1,200 | DF project plan + features notes |

- Total new points from plan: ~12,000–18,000.
- Grand total across all DF collections after plan: ~21,000–27,000 points.
- MLX bulk embedding estimate: ~30–60 minutes for ~20k chunks.
- Qdrant memory impact: ~200MB additional RAM for ~20k points at 2560-dim (within capacity).

### Verification Steps

#### Daemon Verification
1. Verify RPC connection: `chronicler sync-live` (already works).
2. Deploy bridge script to HomeServer (`dfhack-config/scripts/`).
3. Start bridge: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`.
4. Start HTTP server on HomeServer port 8888.
5. Verify bridge: `curl http://192.168.4.194:8888/chronicler-state.json`.
6. Start watcher: `chronicler watch --interval 10 --probe-interval 60`.
7. First cycle: confirm "Synced N units, 0 events" + game year/tick.
8. Verify Lua probes: `SELECT * FROM lua_probes ORDER BY probed_at DESC LIMIT 10;`
9. Cause a change in DF; verify change event detected.
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`

#### Monitoring Verification
1. Run schema migration: `psql -U jarvis -d chronicler -c "CREATE TABLE IF NOT EXISTS storyteller_log (...)"`
2. Restart uvicorn: `chronicler serve --port 8080`.
3. Open `http://localhost:8080`, ask a question, verify SSE streaming still works.
4. Open `http://localhost:8080/monitoring`, verify the interaction appears with timing data.
5. `curl http://localhost:8080/api/monitoring/summary` — verify aggregate stats.
6. `curl http://localhost:8080/api/monitoring/interactions?limit=5` — verify JSON output.

#### Entity Position Verification Queries
```sql
-- Position names for a sample civilization
SELECT ep.name, ep.name_male, ep.name_female, e.name as entity_name
FROM entity_positions ep
JOIN entities e ON e.world_id = ep.world_id AND e.id = ep.entity_id
WHERE ep.world_id = 5 AND e.type = 'civilization'
LIMIT 20;

-- Current position holders with resolved names
SELECT hf.name as holder, ep.name as position, ep.name_male, e.name as entity_name
FROM hf_position_links hpl
JOIN historical_figures hf ON hf.world_id = hpl.world_id AND hf.id = hpl.hf_id
JOIN entity_positions ep ON ep.world_id = hpl.world_id AND ep.entity_id = hpl.entity_id AND ep.position_id = hpl.position_id
JOIN entities e ON e.world_id = hpl.world_id AND e.id = hpl.entity_id
WHERE hpl.world_id = 5 AND hpl.end_year IS NULL
ORDER BY e.name, ep.position_id
LIMIT 20;
```

---

## Open Questions & Gaps

### Daemon / Bridge Deployment

- **HomeServer remote deployment remains blocked**: impacket remote exec auth is failing (SMB signing required, null sessions disabled, possible account lockout). Manual RDP workaround is available but automation requires resolution of one of the following alternatives: SMB share approach, WinRM/PowerShell Remoting, SSH server installation, or RPC-based file bootstrapping. No automated path has succeeded yet.
- **HTTP server lifecycle management**: How is the PowerShell HTTP server started and kept running on HomeServer across DF restarts? No automated lifecycle management described in source documents.
- **Bridge script path on HomeServer**: The exact path `dfhack-config/scripts/` relative to DF install (`C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`) needs to be confirmed on HomeServer.

### Monitoring

- The `_extract_keywords` function rename from private to public is a very small change, but if any other internal callers use the private name, they must also be updated. No audit of callers was performed in the source documents.

### Entity Position Extraction

- Re-ingestion of world 5 (Namoram) was required after schema migration. It is unclear from the documents whether this re-ingestion was completed as part of the Session 32 work.
- The plan notes legends_plus assignments may silently fall into the `DO NOTHING` path when start_year is NULL and a matching standard-legends row already exists. This means some assignment records from legends_plus may be silently dropped with no count feedback; whether this is acceptable or if a reconciliation query is needed is not addressed.

### RAG Indexing

- Execution status of the RAG plan beyond its 2026-02-19 draft date is unknown. It is unclear which (if any) of the not-yet-indexed repos have since been cloned and indexed.
- The current state of the `df-wiki` collection (4 points at plan time, target ~5,000–8,000 points) is unknown.
- The MediaWiki crawler script has not been written; no template or prior implementation exists in the source documents.
- `LegendsBrowser2`, `LegendsViewer-Next`, and `df-sites-analyzer` are identified as MEDIUM/LOW priority but have no concrete indexing plan or timeline.
- No description of how the `research` collection's existing ~1,200 points were generated or what documents they cover; the plan adds `dwarf-fortress-project-plan.md` and `features.txt` but does not audit existing content.

### Broader Architecture

- The source documents are scoped to HomeServer (`192.168.4.194`) as the DF runtime. MEMORY.md identifies a separate UTM VM (`192.168.64.3`) with a different data access approach (SSH `dfhack-run` instead of TCP RPC due to Prism deadlock). The relationship between these two environments — whether the polling daemon targets one or both, and whether the bridge/probe architecture differs between them — is not resolved in these documents.
- The Knowledge Horizon masking system is referenced as the downstream consumer of position data, but the masking system itself has no implementation details in these source documents; its completion status and requirements are deferred to other planning documents.
