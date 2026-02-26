# Consolidation: Live Polling Daemon & Monitoring System

## Source Documents

- `merry-wandering-ullman.md`: Implementation plan for a continuous live polling daemon that connects to DFHack via RPC, deploys a Lua bridge script to HomeServer, and detects fortress change events (arrivals, deaths, skill-ups, mood shifts) into PostgreSQL.
- `effervescent-bouncing-feather.md`: Implementation plan for a lightweight monitoring and observability system (~230 LOC) that logs every LLM interaction in the Chronicler Storyteller web UI with 4-phase latency breakdowns, token counts, and a dashboard page.

---

## Features & Requirements

### Live Polling Daemon (watcher.py)

- Continuous game-state capture: connect to DFHack on HomeServer, dump live fortress data repeatedly on a configurable interval, disconnect gracefully on stop.
- Change detection across 5 event types: ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED.
- Fallback chain: RemoteFortressReader (RFR) → HTTP bridge JSON → Core RPC API → Lua probes. System must operate at full capability using only the RPC connection if the HTTP bridge is unavailable.
- Game time tracking via Lua probe fallback when neither RFR nor bridge is available (probe `df.global.cur_year`, `cur_year_tick`, `cur_season`).
- CLI command `chronicler watch` with options: `--bridge-host`, `--interval`, `--enable-reports`, `--probe-interval`.
- Silent bootstrap on first cycle: log "Synced N units, 0 events" + game year/tick without generating false-positive change events.
- Store all detected change events in `unit_events` table in PostgreSQL.
- Store Lua probe results in `lua_probes` table for later querying.
- Store per-run metadata in `sync_snapshots` table.

### Lua Bridge Script (chronicler-bridge.lua)

- Runs as a DFHack `repeat` job every 100 ticks on the DFHack console thread (where CoreSuspend works).
- Writes comprehensive game state to `chronicler-state.json`, served over HTTP on port 8888.
- Data sections captured (verified working via `df.global`):
  - Game time: `df.global.cur_year`, `cur_year_tick`, `cur_season`
  - Fortress units: `df.global.world.units.active` — dwarves with stress, focus, names, squad assignments
  - Armies: `df.global.world.armies.all` — positions, member counts, controller IDs
  - Buildings: `df.global.world.buildings.all` — building counts by type
  - Artifacts: `df.global.world.artifacts.all` — named artifacts with translated names
  - History: `df.global.world.history.figures` / `.events` — counts and recent events
  - Announcements: `df.global.world.status.reports` — last 20 game announcements
  - Diplomacy: `entity.resources.diplomacy.state` — per-entity diplomatic relations for player civ
  - Creature raws: `df.global.world.raws.creatures.all` — 934 creature type definitions
  - Unit count by race/caste
  - Building type summary
  - Active army positions
  - Fortress wealth and population statistics

### Lua Probes (probe.py)

- Already implemented probes: `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)`.
- New probes to add:
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

### Remote Access & Deployment (Phase 0)

- Deploy `chronicler-bridge.lua` to `dfhack-config/scripts/` on HomeServer without manual RDP intervention.
- Start the bridge as a repeat job via DFHack RPC.
- Start a PowerShell HTTP server on HomeServer port 8888 to serve `chronicler-state.json`.
- Remote access approach options (ranked by feasibility):
  1. User manually copies files via RDP (works now, manual)
  2. SMB to `C:\Users\Nathaniel` share + `script-paths.txt` entry (try next)
  3. WinRM / PowerShell Remoting (needs HomeServer config: `evil-winrm` or `pywinrm`)
  4. SSH server (OpenSSH Server Windows feature)
  5. DFHack RPC `run_command` to bootstrap file writes from existing RPC connection

### Monitoring & Observability System

- Log every LLM interaction in the Storyteller web UI: query text, world ID, keywords searched, context stats, model configuration, token counts, 4-phase latency breakdown, status, and error details.
- Four-phase latency breakdown per interaction: (1) context retrieval, (2) TTFT (time to first token), (3) LLM streaming duration, (4) total wall time.
- Capture context metrics: `context_records`, `context_chars`, `context_categories`.
- Capture model config: model name, temperature.
- Capture token counts: `tokens_streamed`, `response_chars`.
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
- Keywords that were searched must be logged (requires `_extract_keywords` to be made public).

---

## Implementation Details

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

### Environment (Storyteller Web UI)

- Web UI live at `localhost:8080`.
- Full SSE streaming from Qwen3-8B via LiteLLM.
- Two worlds loaded and queryable: Namoram (109K records) and Ormon (1.54M records).
- Database: PostgreSQL `chronicler` on localhost:5432.

### Critical Data Access Gotchas

- `df.global.world.diplomacy` does NOT exist. Diplomacy is per-entity at `entity.resources.diplomacy.state`.
- `run_command('lua', ...)` via RPC HANGS due to CoreSuspend deadlock on the RPC thread. Do NOT use Lua probes over RPC for game-thread data. All such data is now routed through the bridge script.
- The bridge script runs on the DFHack console thread where CoreSuspend works correctly.
- `ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads` Core RPC calls always work as baseline. These provide unit lists with full skill/profession data, world info, and enum definitions.

### Database Schema

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

Tables (all `CREATE IF NOT EXISTS` for idempotent re-runs):

- `unit_events` — change events: ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED.
- `sync_snapshots` — per-run metadata for each polling cycle.
- `lua_probes` — stored results of Lua probe calls with timestamps.
- `storyteller_log` — one row per LLM interaction, capturing:
  - `query` — user query text
  - `world` — world ID
  - `keywords` — searched keywords (array)
  - `context_stats` — `context_records`, `context_chars`, `context_categories`
  - `model` — model name
  - `temperature` — temperature setting
  - `tokens_streamed` — token count
  - `response_chars` — response character count
  - `status` — success/error
  - `error` — error details if any
  - 4-phase timing: context retrieval duration, TTFT, LLM streaming duration, total duration

### Python Modules

**`chronicler/dfhack/probe.py`** (~+80 LOC expansion):
- Expand existing probe framework with 10 new probe functions listed above.
- Each probe returns structured JSON from a single-line Lua snippet.

**`chronicler/dfhack/watcher.py`** (~+10 LOC change):
- Existing file with RFR > bridge > core fallback chain.
- Update: when neither RFR nor bridge available, use `probe_game_time(client)` for game time instead of returning `None`.

**`chronicler/monitoring.py`** (~80 LOC new file):
- `InteractionLog` dataclass with all metric fields.
- Timing methods using `time.monotonic()`: `start()`, `context_done()`, `llm_start()`, `first_token()`, `count_token()`, `finish()`.
- `async flush(pool)` — single INSERT to `storyteller_log`, called after SSE stream completes.

**`chronicler/api/routes/monitoring.py`** (~55 LOC new file):
- Three endpoints: interactions list, interaction detail, summary aggregate.

**`chronicler/api/templates/monitoring.html`** (~80 LOC new file):
- Tailwind dark theme dashboard page.
- Summary cards, interactions table, click-to-expand, 30s auto-refresh.

### Modified Files (Monitoring)

**`chronicler/api/routes/storyteller.py`** (+18 LOC):
- Inline instrumentation (not middleware — middleware cannot measure per-phase latencies or SSE body content).
- Create `InteractionLog` at request start.
- Call `log.context_done()` after `retrieve_context()` + `format_context()`.
- Call `log.llm_start()` / `log.first_token()` / `log.count_token()` inside the SSE generator.
- Call `log.flush(pool)` after `{"done": True}` is yielded.

**`chronicler/api/app.py`** (+6 LOC):
- Include monitoring router.
- Add `GET /monitoring` page route.

**`chronicler/storyteller/context.py`** (rename only):
- Rename `_extract_keywords` → `extract_keywords` to allow the storyteller route to log keywords searched.

### Modified Files (Watcher + Probes)

**`chronicler/config.py`** — IP updated to `192.168.4.194`.
**`chronicler/dfhack/client.py`** — IP updated to `192.168.4.194`.

### Lua Bridge Script

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

- Current state: 51 lines, captures game time + creature raws only.
- Enhanced: +40 LOC to add unit summary, building counts, recent events, artifact list, army positions, fortress wealth/population stats.
- Invocation: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
- HTTP output: `chronicler-state.json` served on port 8888 via PowerShell HTTP server on HomeServer.

### Research Sources Confirming df.global Access Paths

- `df-structures` XML — definitive structure definitions.
- DFHack scripts repo — reference implementations.
- `myDFHackScripts` — community examples.
- `df-ai` — automation reference.
- All indexed in Qdrant for semantic search.

---

## Status & Completion

### Live Polling Daemon

| Component | Status |
|---|---|
| `dfhack/client.py` | Complete (IP updated) |
| `dfhack/probe.py` (armies, diplomacy, unit_detail) | Complete |
| `dfhack/detector.py` (change detection) | Complete — tracks ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED |
| `dfhack/watcher.py` (polling daemon with fallback chain) | Complete, needs minor update (+10 LOC: Lua probe fallback for game time) |
| `cli.py` (`chronicler watch` command) | Complete |
| DB schema (`unit_events`, `sync_snapshots`, `lua_probes`) | Designed, needs migration applied |
| `dfhack/probe.py` (10 new probes) | Not yet implemented (+80 LOC) |
| `chronicler-bridge.lua` (expanded) | Not yet implemented (+40 LOC over current 51-line version) |
| Remote file deployment to HomeServer | BLOCKED — impacket remote exec auth failing (SMB signing required, null sessions disabled, possible account lockout) |

**Primary blocker**: deploying Lua scripts to HomeServer without manual RDP. impacket remote exec auth is failing. Manual RDP workaround is available but not automated.

### Monitoring System

| Component | Status |
|---|---|
| `chronicler/monitoring.py` | Not yet created (~80 LOC) |
| `chronicler/api/routes/monitoring.py` | Not yet created (~55 LOC) |
| `chronicler/api/templates/monitoring.html` | Not yet created (~80 LOC) |
| `storyteller.py` instrumentation | Not yet modified (+18 LOC) |
| `app.py` route registration | Not yet modified (+6 LOC) |
| `context.py` keyword rename | Not yet done (2-line rename) |
| `storyteller_log` table in schema.sql | Not yet added (+16 LOC) |

**Total monitoring work remaining**: ~230 LOC, 3 new files, 4 modified files. No new dependencies required.

---

## Key Decisions & Design Choices

### Polling Daemon Architecture

- **Lua scripting via `df.global` is the primary data access approach**, not RPC plugin calls. This is the officially supported community modding method.
- **Bridge + probes are complementary**: bridge handles bulk periodic dumps; probes handle targeted queries.
- **No RemoteFortressReader dependency**: RFR not available in DFHack 53.10-r1 on HomeServer; architecture must not require it.
- **No systemd/launchd service**: daemon runs as foreground CLI process (Ctrl+C to stop). Intentional simplicity for dev tool.
- **No websocket push**: monitoring dashboard polls on 30s interval; events are queryable via SQL. Sufficient for local dev use.
- **No worldgen capture via RPC**: no worldgen-specific RPC methods. `legends.xml` is the correct path for historical data.
- **Lua probe data via bridge only**: `run_command('lua', ...)` hangs due to CoreSuspend deadlock on the RPC thread. All game-thread data routes through the HTTP bridge instead.

### Monitoring Architecture

- **Inline instrumentation, not middleware**: middleware cannot capture per-phase latencies or SSE body content. Instrumentation is placed directly in the `/api/ask` handler and SSE generator.
- **Async flush after stream completes**: `log.flush(pool)` is called after `{"done": True}` is yielded, ensuring zero user-facing latency impact from logging.
- **PostgreSQL for structured data, not Python `logging`**: structured timing/metric data goes to the database for queryability; stdout logging is not used for LLM interactions.
- **No log rotation**: one row per question. Grows slowly for a local dev tool; rotation not needed.
- **No request middleware for read-only endpoints** (worlds, stats): only LLM interactions warrant the monitoring overhead.
- **30-second poll for dashboard auto-refresh**: real-time websocket monitoring deemed unnecessary for local use.

### Data Correctness

- `df.global.world.diplomacy` path is incorrect. Must use `entity.resources.diplomacy.state` on each entity object.
- All `df.global` access paths verified against `df-structures` XML and DFHack scripts repo before implementation.

---

## Metrics & Targets

### Polling Daemon

- Bridge polling interval: every 100 game ticks (DFHack repeat job).
- Watcher polling interval: configurable via `--interval` (default appears to be 10 seconds based on verification step 6).
- Probe interval: configurable via `--probe-interval` (default appears to be 60 seconds).
- **Total remaining LOC for daemon**: ~130 LOC changes across 5 files, no new files.

### Monitoring System

- **Total remaining LOC**: ~230 LOC.
- **New files**: 3 (`monitoring.py`, `routes/monitoring.py`, `templates/monitoring.html`).
- **Modified files**: 4 (`storyteller.py`, `app.py`, `context.py`, `schema.sql`).
- **New dependencies**: 0.
- Dashboard auto-refresh interval: 30 seconds.
- Default interactions list page size: 50 (`?limit=50`).
- Storyteller log schema size: +16 lines to `schema.sql`.

### Verification Steps (Combined)

**Daemon verification**:
1. Verify RPC connection: `chronicler sync-live` (already works).
2. Deploy bridge script to HomeServer.
3. Start bridge: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`.
4. Start HTTP server on HomeServer port 8888.
5. Verify bridge: `curl http://192.168.4.194:8888/chronicler-state.json`.
6. Start watcher: `chronicler watch --interval 10 --probe-interval 60`.
7. First cycle: confirm "Synced N units, 0 events" + game year/tick.
8. Verify Lua probes: `SELECT * FROM lua_probes ORDER BY probed_at DESC LIMIT 10;`
9. Cause a change in DF; verify change event detected.
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`

**Monitoring verification**:
1. Run schema migration: `psql -U jarvis -d chronicler -c "CREATE TABLE IF NOT EXISTS storyteller_log (...)"`
2. Restart uvicorn: `chronicler serve --port 8080`.
3. Open `http://localhost:8080`, ask a question, verify SSE streaming still works.
4. Open `http://localhost:8080/monitoring`, verify the interaction appears with timing data.
5. `curl http://localhost:8080/api/monitoring/summary` — verify aggregate stats.
6. `curl http://localhost:8080/api/monitoring/interactions?limit=5` — verify JSON output.
