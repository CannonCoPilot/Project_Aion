# Chronicler Live Polling Daemon — Implementation Plan (Revised)

## Context

Chronicler's `sync-live` command is a one-shot pull: connect to DFHack, dump all sane units into PostgreSQL, disconnect. There's no continuous capture, no change detection, no event logging. To build a real narrative engine that tracks fortress life over time, we need a **polling daemon** that continuously captures game state and detects meaningful changes (arrivals, deaths, skill-ups, mood shifts).

### Environment (Ground Truth)

- **HomeServer**: Windows 10 Pro x86_64 at `192.168.4.194` (machine name `WIN-48L3R2QLQN0`) — physical PC on local network, NOT a VM
- **DF**: Dwarf Fortress 53.10, **DFHack**: 53.10-r1 (release) on x86_64
- **DFHack RPC**: TCP port 5000 (firewall rule "DFHack RPC" created, port open and responding)
- **RemoteFortressReader**: NOT AVAILABLE — `enable RemoteFortressReader` returns "Cannot enable plugin". Not shipped with DFHack 53.10-r1.
- **DF install path**: `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`
- **DFHack init chain**: `dfhack.init` → `onLoad.init` → `onMapLoad.init`
- **DFHack config scripts**: `dfhack-config/scripts/` — custom scripts placed here are auto-discoverable
- **User**: Nathaniel / DwarfF0rtress. RDP enabled on HomeServer.

### Data Access Strategy

**Lua scripting via `df.global` is the primary approach.** This is the officially supported method for community modders. Two complementary mechanisms:

1. **Bridge Lua script** (`chronicler-bridge.lua` as a `repeat` job) — PRIMARY MECHANISM. Runs every 100 ticks on the DFHack console thread (where `CoreSuspend` works), writes comprehensive game state to JSON served over HTTP. Captures: game time, creature raws, unit summaries w/ stress, armies, buildings, artifacts, announcements, diplomacy, history.

2. **Core RPC API** (`ListUnits`, `GetWorldInfo`, `ListEnums`, `ListSquads`) — Always works. Provides unit lists with full skill/profession data, world info, enum definitions. This is the baseline.

3. ~~**RPC Lua probes**~~ — `run_command('lua', ...)` HANGS due to CoreSuspend deadlock on RPC thread. Do NOT use. All data these probes would provide is now in the bridge.

**IMPORTANT**: `df.global.world.diplomacy` does NOT exist. Diplomacy is per-entity at `entity.resources.diplomacy.state`.

**What the bridge captures via `df.global`** (verified working):
- `df.global.world.units.active` — fortress dwarves with stress, focus, names, squads
- `df.global.world.armies.all` — army positions, member counts, controller IDs
- `df.global.world.buildings.all` — building counts by type
- `df.global.world.artifacts.all` — named artifacts with translated names
- `df.global.world.history.figures` / `.events` — counts + recent events
- `df.global.world.status.reports` — last 20 game announcements
- `entity.resources.diplomacy.state` — player civ diplomatic relations
- `df.global.cur_year` / `cur_year_tick` / `cur_season` — game time
- `df.global.world.raws.creatures.all` — 934 creature type definitions

Research confirmed via: df-structures XML, DFHack scripts repo, myDFHackScripts, df-ai. All indexed in Qdrant.

---

## Phase 0: Remote Access + Deploy Lua Bridge

**Goal**: Establish reliable file transfer and command execution to HomeServer so we can deploy and update Lua scripts without manual intervention.

**Current blockers**: impacket remote exec auth is failing. SMB signing required, null sessions disabled. Possible causes: account lockout from failed attempts, credential format issues, UAC token filtering for admin shares.

**Approach options** (try in order):
1. **SMB to Users share** — `smbclient //192.168.4.194/Users -U Nathaniel` should give access to `C:\Users\Nathaniel\`. Place scripts there, then add to `script-paths.txt`.
2. **RDP from Mac** — Install Microsoft Remote Desktop, connect to HomeServer, manually place files
3. **PowerShell remoting (WinRM)** — Enable on HomeServer, use `evil-winrm` or Python `pywinrm`
4. **SSH server on Windows** — Install OpenSSH Server feature on HomeServer
5. **DFHack RPC `run_command`** — Execute commands like `ls` or `lua` remotely via the existing RPC connection (already works for Lua probes!)

**Deploy steps once access works**:
1. Copy `chronicler-bridge.lua` to `dfhack-config/scripts/` (or a custom script dir)
2. Add `show` to dfhack.init (auto-show DFHack console on launch)
3. Start bridge: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
4. Start PowerShell HTTP server on port 8888 to serve `chronicler-state.json`
5. Verify bridge from Mac: `curl http://192.168.4.194:8888/chronicler-state.json`

**Smoke test**: Bridge returns JSON with `cur_year`, `cur_year_tick`, `creature_raws`.

---

## Phase 1: Schema + Event Model (~30 LOC SQL)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

Already designed — `unit_events` and `sync_snapshots` tables. Also `lua_probes` table for storing probe results. No changes needed from original plan.

---

## Phase 2: Expand Lua Probes for ALL Game Data (~120 LOC Python)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/probe.py`

The probe framework already works (armies, diplomacy, unit detail). Expand to cover all data domains accessible via `df.global`:

```python
# Already implemented:
probe_armies(client)        # df.global.world.armies.all
probe_diplomacy(client)     # df.global.world.diplomacy.agreements
probe_unit_detail(client, id)  # df.unit.find(id) — stress, personality

# New probes to add:
probe_game_time(client)     # df.global.cur_year, cur_year_tick, cur_season
probe_population(client)    # df.global.world.units.active count by race
probe_buildings(client)     # df.global.world.buildings.all — count, types
probe_items_summary(client) # df.global.world.items.all — counts by type
probe_artifacts(client)     # df.global.world.artifacts.all — named artifacts
probe_history_figures(client)  # df.global.world.history.figures — notable figures
probe_sites(client)         # df.global.world.entities.all — active sites/civs
probe_reports(client)       # df.global.world.status.reports — combat/announcements
probe_weather(client)       # df.global.cur_season_tick, weather state
probe_unit_full(client, id) # Full unit: skills, attributes, personality, beliefs, goals
```

Each probe is a single-line Lua snippet returning JSON via `print(string.format(...))`.

---

## Phase 3: Enhanced Bridge Script (~80 LOC Lua)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`

Expand from current (game time + creature raws only) to a comprehensive data dump:

```lua
-- Current: game time + creature raws (51 lines)
-- Enhanced: add unit summary, building counts, recent events, artifact list
-- Runs every 100 ticks as repeat job
-- Writes chronicler-state.json with all sections
```

Key additions:
- Unit count by race/caste
- Building type summary
- Recent announcement text (last 20)
- Named artifact list
- Active army positions
- Fortress wealth/population stats

---

## Phase 4: Change Detector (~80 LOC Python) — Already Built

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/detector.py`

Already implemented. Tracks: ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED.

---

## Phase 5: Polling Daemon (~300 LOC Python) — Already Built, Needs Update

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py`

Already has RFR > bridge > core fallback chain. The key update: when neither RFR nor bridge is available, use Lua probes for game time instead of giving up:

```python
# Current fallback: game_year = None, game_tick = None
# New fallback: probe_game_time(client) via run_command('lua', ...)
```

This means the watcher can operate at full capability using ONLY the RPC connection — no HTTP bridge needed as a hard requirement.

---

## Phase 6: CLI Command — Already Built

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/cli.py`

`chronicler watch` command exists with `--bridge-host`, `--interval`, `--enable-reports`, `--probe-interval` options.

---

## File Summary (Remaining Work)

| File | Action | ~LOC |
|------|--------|------|
| `chronicler/config.py` | Modified | IP updated to 192.168.4.194 |
| `chronicler/dfhack/client.py` | Modified | IP updated to 192.168.4.194 |
| `chronicler/dfhack/probe.py` | Expand | +80 (new probes) |
| `chronicler/dfhack/scripts/chronicler-bridge.lua` | Expand | +40 (more data sections) |
| `chronicler/dfhack/watcher.py` | Minor update | +10 (Lua probe fallback for game time) |

**Total remaining**: ~130 LOC changes. No new files needed.

---

## What This Intentionally Does NOT Do

- **No RemoteFortressReader** — plugin not available in DFHack 53.10-r1
- **No worldgen capture via RPC** — no worldgen-specific RPC methods; `legends.xml` is the right path
- **No systemd/launchd service** — foreground CLI; Ctrl+C to stop
- **No websocket push** — monitoring dashboard already polls; events queryable via SQL

---

## Blocking Issue: Remote Access to HomeServer

The primary blocker is deploying files to HomeServer. Until we can place Lua scripts in the DF directory and start the PowerShell HTTP server, the bridge approach requires manual setup. Options ranked by feasibility:

1. **User manually copies files via RDP** (works now, manual)
2. **SMB to C:\Users\Nathaniel** + DFHack `script-paths.txt` pointing there (try next)
3. **WinRM/SSH** for full remote command execution (needs HomeServer config)
4. **DFHack RPC** can already execute arbitrary Lua — could bootstrap file writes from there

---

## Verification

1. Verify RPC connection: `chronicler sync-live` (already works)
2. Deploy bridge script to HomeServer
3. Start bridge: `repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]`
4. Start HTTP server on HomeServer port 8888
5. Verify bridge: `curl http://192.168.4.194:8888/chronicler-state.json`
6. Start watcher: `chronicler watch --interval 10 --probe-interval 60`
7. First cycle: "Synced N units, 0 events" + game year/tick (silent bootstrap)
8. Verify Lua probes: `SELECT * FROM lua_probes ORDER BY probed_at DESC LIMIT 10;`
9. Cause a change in DF → verify change event detected
10. `SELECT * FROM unit_events ORDER BY detected_at DESC LIMIT 20;`
