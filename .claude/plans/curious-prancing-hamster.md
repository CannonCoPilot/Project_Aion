# Chronicler — Proof-of-Concept Roadmap

## Context

The Chronicler project aims to build an AI storyteller + living atlas for Dwarf Fortress. A comprehensive research report exists at `.claude/context/research/dwarf-fortress-project-plan.md` with the full 5-phase vision. All reference repos (DFHack, df-structures, df-ai, df-narrator, dfhack-client-python, weblegends, Dwarf Therapist) are cloned into `projects/` and indexed into Qdrant (22,254 vectors across 10 collections).

**This plan delivers proof-of-concept first steps** across the four main pillars, plus the environment setup. Each pillar produces a minimal but working demo — not a polished MVP, but enough to prove the concept and unblock further development.

## Pillar 0: Environment Setup (UTM + DF + DFHack)

**Goal**: Dwarf Fortress running with DFHack inside a UTM Windows 11 ARM VM, with DFHack's TCP port accessible from macOS.

This is a collaborative walkthrough — Jarvis guides, user executes on the VM.

### Steps

1. **Install UTM** — Download from [mac.getutm.app](https://mac.getutm.app) (free)
2. **Get Windows 11 ARM ISO** — Download from [microsoft.com/en-us/software-download/windows11arm64](https://www.microsoft.com/en-us/software-download/windows11arm64) (~5.5 GB)
3. **Create VM** — UTM "+" → Virtualize → Windows. Config: 8 GB RAM, 6 CPU cores, 128 GB storage. Enable "Install drivers and SPICE tools"
4. **Install Windows** — Boot ISO, install. If stuck at Wi-Fi screen: Shift+F10 → `OOBE\BYPASSNRO` or `start ms-cxh:localonly`
5. **Run Windows Update** — Critical for October 2025 Prism/AVX2 update
6. **Install Steam** — Download from steampowered.com inside the VM
7. **Install Dwarf Fortress** (App 975370) — Purchase/install via Steam
8. **Install DFHack** (App 2346660) — Free, install to same Steam library
9. **Configure DFHack remote** — Edit `dfhack-config/remote-server.json`: `{"allow_remote": true, "port": 5000}`
10. **Configure UTM networking** — Set to "macOS Shared Network". Note VM IP via `ipconfig` inside VM (typically `192.168.64.x`)
11. **Verify** — Launch DF via DFHack, confirm DFHack logo appears. From macOS: `nc -zv <vm-ip> 5000`

**Deliverable**: DFHack running, TCP port 5000 reachable from macOS.

---

## Pillar 1: Live Data Extraction → LLM

**Goal**: Python script on macOS connects to DFHack in the VM, pulls live game state (units, map info), formats it as context, and sends to a local LLM for narration.

### Architecture

```
[DF+DFHack in VM] --TCP:5000--> [Python on macOS] --HTTP--> [Ollama/LLM]
```

### Steps

1. **Generate protobuf bindings** — Clone DFHack source (we have it at `projects/`), run `protoc` on the `.proto` files to generate Python classes:
   - `library/proto/CoreProtocol.proto`
   - `library/proto/BasicApi.proto`
   - `plugins/proto/RemoteFortressReader.proto`

2. **Build the RPC client** — Adapt `dfhack-client-python` patterns into a clean module:
   - `chronicler/dfhack/client.py` — TCP connection, handshake, RPC binding
   - `chronicler/dfhack/methods.py` — Typed wrappers for GetUnitList, GetWorldInfo, GetMapInfo, etc.

3. **Build the data formatter** — Transform protobuf responses into structured text:
   - Unit summaries: name, race, profession, mood, current job, location
   - Fort overview: population count, active jobs, recent events

4. **Build the LLM bridge** — Send formatted context to Ollama (already running locally):
   - System prompt: "You are a narrator observing a dwarven fortress..."
   - Context: formatted game state
   - User query: free-form question about the fort

5. **Wire into a CLI** — `python -m chronicler live --host <vm-ip>` opens an interactive prompt

### Key Files to Create

```
projects/chronicler/
  chronicler/
    __init__.py
    dfhack/
      __init__.py
      client.py          # TCP RPC client (adapted from dfhack-client-python)
      methods.py          # RPC method wrappers
      proto/              # Generated protobuf Python files
    live/
      __init__.py
      formatter.py        # Game state → structured text
      narrator.py         # LLM integration (Ollama)
    cli.py               # Click CLI entry point
  pyproject.toml
```

### Key Patterns to Reuse

- **dfhack-client-python** (`projects/dfhack-client-python/dfhack_remote.py`): TCP connection, handshake protocol (`DFHack?\n`), `@remote` decorator pattern for RPC binding
- **Protobuf files**: From DFHack source — `RemoteFortressReader.proto` defines `UnitList`, `MapBlock`, `WorldMap`, etc.

**Deliverable**: Interactive CLI that answers "what's happening in my fort?" with LLM-narrated responses grounded in live game data.

---

## Pillar 2: Legends XML → Database → Simple Viewer

**Goal**: Parse a `legends.xml` export into PostgreSQL, then serve it via a minimal web viewer where you can browse historical figures, sites, and events.

### Architecture

```
[legends.xml] --parser--> [PostgreSQL CDM tables] --FastAPI--> [Browser]
```

### Steps

1. **Create CDM schema** — Add tables to existing Jarvis PostgreSQL (schema `chronicler`):
   - `world`, `region`, `site`, `structure`
   - `entity` (civilization)
   - `historical_figure` (with traits, skills, links as JSONB)
   - `history_event` (with details as JSONB)
   - `history_collection`
   - `artifact`

2. **Build XML parser** — Streaming parser using `lxml.iterparse` for memory efficiency:
   - Parse order: world → regions → sites → entities → figures → events → artifacts
   - Adapt df-narrator's entity extraction logic but write to Postgres instead of markdown
   - Support both `legends.xml` and `legends_plus.xml`

3. **Build simple FastAPI viewer** — Minimal routes + server-rendered HTML (Jinja2):
   - `/` — World overview: name, year, entity/figure/event counts
   - `/figures` — Paginated table of historical figures (sortable by significance score)
   - `/figures/{id}` — Figure detail: biography, events timeline, relationships
   - `/sites` — Paginated table of sites
   - `/sites/{id}` — Site detail: structures, events, population
   - `/events` — Filterable event log (by type, year, figure, site)

### Key Files to Create

```
projects/chronicler/
  chronicler/
    db/
      __init__.py
      schema.sql          # CDM DDL
      models.py           # SQLAlchemy models
      queries.py          # Query functions
    ingest/
      __init__.py
      xml_parser.py       # Streaming legends.xml parser
    viewer/
      __init__.py
      app.py              # FastAPI app
      templates/           # Jinja2 HTML templates
        base.html
        index.html
        figures.html
        figure_detail.html
        sites.html
        site_detail.html
        events.html
```

### Key Patterns to Reuse

- **df-narrator** (`projects/df-narrator/df_narrator.py`): Entity extraction logic, HF_FIELDS reference, scoring system (`score_figure()`, site scoring)
- **df-narrator** (`projects/df-narrator/df_legends_common.py`): XML cleaning regex, entity type mappings
- **Existing Postgres**: `jarvis-postgres` Docker container, `jarvis` database, pgvector 0.8.1 available

### Getting Test Data

A `legends.xml` is required. Two options:
- **Export from the game**: In DF, enter Legends mode → export XML (produces `region1-legends.xml` and optionally `region1-legends_plus.xml` with DFHack's `exportlegends`)
- **Download sample**: Community-shared legends exports exist on the Bay 12 forums and Reddit

**Deliverable**: `python -m chronicler import legends.xml` populates the DB. `python -m chronicler viewer` serves a browseable web UI at localhost:8080.

---

## Pillar 3: Game Bot (Basic DFHack Automation)

**Goal**: A Lua script running inside DFHack that can issue basic commands to "poke" the game — designate digging, assign labors, trigger events — enabling automated gameplay for data gathering.

### Architecture

```
[chronicler-bot.lua inside DFHack] → [Direct df.* memory writes] → [DF game loop picks up]
```

### Steps

1. **Write the bot Lua script** — `chronicler-bot.lua` that DFHack loads:
   - Uses `dfhack.onStateChange` for lifecycle management
   - Uses `repeatutil` for periodic polling (replaces df-ai's custom event system)
   - Logs all actions to `chronicler-bot.log`

2. **Implement basic commands** (direct memory write pattern from df-ai):
   - `dig_area(x1,y1,z, x2,y2,z)` — Designate a rectangular area for digging
   - `set_labor(unit_id, labor, enabled)` — Toggle a labor on a unit
   - `dump_items(area)` — Mark items in an area for dumping
   - `list_units()` — Print all citizen units with key stats
   - `list_jobs()` — Print active jobs

3. **Implement event logging** — Write game events to a structured log:
   - Unit births, deaths, mood changes
   - Job completions
   - Combat events
   - Output as JSON lines for easy parsing from macOS

4. **Add a simple auto-play mode** — "poke the game" functionality:
   - Auto-designate digging of a basic staircase down
   - Auto-assign miners to available dwarves
   - Auto-create a basic stockpile
   - This is NOT smart AI — just enough to make things happen

### Key Patterns from df-ai

From the df-ai analysis, the two critical patterns:

**Direct memory writes** (fast path, no UI navigation needed):
```lua
-- Dig designation (from df-ai plan.cpp pattern)
local des = dfhack.maps.getTileDesignation(x, y, z)
des.dig = df.tile_dig_designation.Default
local block = dfhack.maps.getTileBlock(x, y, z)
block.flags.designated = true
block.dsgn_check_cooldown = 0
```

**Unit scanning** (from df-ai population.cpp pattern):
```lua
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u) then
        -- process citizen
    end
end
```

### Key Files to Create

```
projects/chronicler/
  dfhack/
    chronicler-bot.lua     # Main bot script
    chronicler-events.lua  # Event logger
    chronicler-utils.lua   # Shared utility functions
```

These files get copied into the DFHack `hack/scripts/` directory in the VM.

**Deliverable**: In DFHack console, run `chronicler-bot` to start automated basic gameplay. Events stream to a log file readable from macOS via shared folder or network.

---

## Pillar 4: Mod Conflict Detector

**Goal**: CLI tool that compares two DF mods and identifies conflicting raw file entries.

### Architecture

```
[mod_a/raw/] + [mod_b/raw/] --parser--> [conflict report]
```

### Steps

1. **Build raw file parser** — DF raws are a custom text format:
   - Objects defined by `[OBJECT:TYPE]` headers
   - Entries defined by `[TYPE:ID]` tags
   - Nested properties as `[TAG:VALUE]` lines
   - Parser produces: `{file: str, object_type: str, object_id: str, tokens: list}`

2. **Build conflict detector** — Compare two parsed mod directories:
   - **Override conflicts**: Same object ID modified by both mods
   - **Token conflicts**: Same object, different tokens changed
   - **Missing dependency**: Mod references an object from another mod
   - Output: colored terminal report showing each conflict with context

3. **Wire into CLI** — `python -m chronicler mods diff <mod_a_path> <mod_b_path>`

### Key Files to Create

```
projects/chronicler/
  chronicler/
    mods/
      __init__.py
      raw_parser.py        # DF raw file parser
      conflict.py          # Conflict detection logic
```

### DF Raw Format Reference

```
[OBJECT:CREATURE]

[CREATURE:DWARF]
    [DESCRIPTION:A short, sturdy creature fond of drink and industry.]
    [NAME:dwarf:dwarves:dwarven]
    [CASTE_NAME:dwarf:dwarves:dwarven]
    [CREATURE_TILE:1]
    [COLOR:3:0:0]
    ...
```

Mods live in `data/installed_mods/<mod_id>/` or `mods/<mod_id>/` in the DF directory. Vanilla raws are in `data/vanilla/`.

**Deliverable**: `python -m chronicler mods diff path/to/mod_a path/to/mod_b` outputs a conflict report.

---

## Project Structure (Combined)

```
projects/chronicler/
  pyproject.toml              # Python package config (click, fastapi, lxml, protobuf, httpx, ollama)
  chronicler/
    __init__.py
    cli.py                    # Click CLI: import, viewer, live, mods
    dfhack/                   # Pillar 1: DFHack RPC client
      client.py
      methods.py
      proto/                  # Generated protobuf files
    live/                     # Pillar 1: Live narrator
      formatter.py
      narrator.py
    db/                       # Pillar 2: CDM database
      schema.sql
      models.py
      queries.py
    ingest/                   # Pillar 2: XML parser
      xml_parser.py
    viewer/                   # Pillar 2: Web viewer
      app.py
      templates/
    mods/                     # Pillar 4: Mod tools
      raw_parser.py
      conflict.py
  dfhack/                     # Pillar 3: Lua scripts (copied to VM)
    chronicler-bot.lua
    chronicler-events.lua
    chronicler-utils.lua
```

---

## Execution Sequence

### Phase A: Foundation (do first)
1. **Pillar 0**: Set up UTM + DF + DFHack (collaborative walkthrough)
2. Create `projects/chronicler/` scaffold with `pyproject.toml`

### Phase B: Parallel Workstreams (after DF is running)
3. **Pillar 3**: Game bot Lua scripts — fastest to test since they run inside DFHack directly
4. **Pillar 1**: Live data extraction — depends on DFHack TCP being reachable
5. **Pillar 2**: Legends parser + viewer — can proceed in parallel once we have a `legends.xml` export (generate from the game during Phase A)

### Phase C: Independent
6. **Pillar 4**: Mod conflict detector — no game dependency, can be done anytime

### Dependency Graph

```
Pillar 0 (Environment) ──┬──> Pillar 3 (Game Bot)
                         ├──> Pillar 1 (Live Data → LLM)
                         └──> Export legends.xml ──> Pillar 2 (Legends Viewer)

Pillar 4 (Mod Conflicts) ──> Independent (no game needed)
```

---

## Verification

### Pillar 0
- [ ] `nc -zv <vm-ip> 5000` succeeds from macOS terminal
- [ ] DFHack logo visible in DF window

### Pillar 1
- [ ] `python -m chronicler live --host <vm-ip>` connects and shows unit list
- [ ] Free-form question returns LLM-narrated response about current fort state

### Pillar 2
- [ ] `python -m chronicler import <legends.xml>` populates PostgreSQL tables
- [ ] `python -m chronicler viewer` serves browseable UI at localhost:8080
- [ ] Can click through figures, sites, events in the browser

### Pillar 3
- [ ] `chronicler-bot` command in DFHack console starts the bot
- [ ] Bot designates digging and logs events to a file
- [ ] Events log is parseable JSON lines

### Pillar 4
- [ ] `python -m chronicler mods diff <mod_a> <mod_b>` outputs conflict report
- [ ] Correctly identifies when two mods modify the same creature/item
