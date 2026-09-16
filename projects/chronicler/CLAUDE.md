# Chronicler — Development Artifacts

Development process artifacts for the DwarfCron/Chronicler project (AI storyteller + living atlas for Dwarf Fortress).

**Deliverable code lives at**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

## Structure

| Directory | Purpose |
|-----------|---------|
| `plans/` | Implementation plans, phase roadmaps |
| `designs/` | Architecture decisions, CDM schema designs |
| `reports/` | Ingestion reports, validation results, test outputs |
| `experiments/` | Parser experiments, performance benchmarks |
| `progress/` | Phase completion tracking |

## Reference Repos

Cloned reference repos live at `/Users/nathanielcannon/Claude/GitRepos/`:
- `df-ai`, `df-narrator`, `df-structures`, `dfhack-client-python`
- `weblegends`, `DwarfFortressLogger`, `myDFHackScripts`

## Where DF runs

Two rigs. Both run the **same x86-64 Steam PE a Windows player runs**, so DFHack's
memory offsets are the player's offsets on either. What differs is everything around
the binary.

### CrossOver — the inner loop (default since 2026-09-15)

CrossOver 26.2, bottle `Win10`. DF **v0.53.15 win64 STEAM** + DFHack **53.15-r2**,
installed by the real Windows Steam client (genuine `appmanifest` files; DFHack is
Steam app 2346660). DFHack self-reports `Structure size verification check passed`
and `getOSType() == "windows"`.

- **RPC**: `127.0.0.1:5555`, held by `wineserver` — a real macOS loopback socket.
- 🔴 **Not 5000.** macOS ControlCenter (AirPlay Receiver) owns `*:5000`, DFHack's
  default. DFHack logs the bind failure and then starts **no server at all**, which
  presents as "RPC is broken" rather than "port taken".
- 🔴 **Leave `allow_remote` FALSE.** The socket is genuinely local, so a local client
  reaches it without opening the server to the network. The VM rig has to set it true
  to cross the guest boundary, which DFHack's own docs call insecure.
- **No deploy step**: the DF directory is an ordinary macOS path. `cp`, not `scp`.

**Toolset**: `DwarfCron/scripts/cx-lifecycle.sh` (+ `cx-config.sh`, `cx-rpc.py`), and
`chronicler/dfhack/scripts/chronicler-ui.lua` in-game.

    cx-lifecycle.sh start          cold start -> live RPC in 3.5s
    cx-lifecycle.sh load region1   clicks through the menus, map in 12s
    cx-lifecycle.sh deploy         push the in-game Lua into the bottle
    cx-lifecycle.sh health         process / port / handshake / Lua exec
    cx-lifecycle.sh ui click <text>

🔴 **`chronicler-ui.lua` addresses controls by their RENDERED TEXT**, not by
viewscreen fields. Three other routes were tried and rejected against DF 53.15:
`gui.simulateInput(title,'SELECT')` does nothing; DFHack's own `load-save` prints
`UNTESTED WARNING` and then fails on `sel_menu_line`/`saves`/`sel_idx`, none of which
still exist; and poking fields directly is how `load-save` got stale. `Export XML` is
a string DF must draw for a human to click — a field name carries no such guarantee.
Widget hit-testing reads `gps.precise_mouse_x/y` in **pixels**; set the tile position
alone and every click lands in the top-left corner.

Measured 2026-09-15 (M4 Max): DF runs at **99 fps / 100 ticks per second — its own
cap**, so emulation is not the bottleneck. Headless worldgen (`-gen`) ≈40s for a
pocket region. RPC `GetVersion` p50 0.119 ms; a Lua round trip ≈20 ms (core-suspend
cost, and the number that matters for bridge design).

🔴 **Known broken**: `-gen` writes `save/regionN` with an uncompressed `world.dat`
and DF's own menus never list it. `COMPRESSED_SAVES` was tested as the cause and
**disproved**. Worldgen output is currently unloadable; use an existing save.

### UTM VM — the fidelity backstop

UTM `DF-Windows`, Windows 11 ARM, at `192.168.64.3`, user `Jarvis`, key `~/.ssh/df-vm`.
DFHack 53.10-r1. QEMU backend, 6 vCPU / 8 GB (under-provisioned on a 16-core/128 GB
host), qcow2 snapshots with the VM stopped.

Reach DFHack with `dfhack-run` over SSH — TCP RPC (port 5000) is broken under Prism
for game-thread calls. *(Corrected 2026-08-25: this file said `192.168.64.2` + TCP 5000.)*
🔴 **That Prism defect is specific to this rig.** On CrossOver, TCP RPC serves
game-thread calls fine — `get_world_info` 12 ms and `list_units` 26 ms against a
loaded fortress, measured 2026-09-15. Do not carry the SSH workaround across.

Keep the VM for pre-release certification: Wine is not Windows, and it is what
adjudicates a divergence before a tool ships to players.

⚠️ `vm-lifecycle.sh` lives **here** (Jarvis repo, `projects/chronicler/scripts/`) while
its counterpart `cx-lifecycle.sh` lives in **DwarfCron**. The two sibling scripts are
in different repositories; `/vm` and `/df` point at this copy. Unresolved.

## Project Context

- **DB**: PostgreSQL `chronicler` database on localhost:5432 — 81 tables in `public`.
  It is the `jarvis-postgres` **Docker** container (paradedb image), reachable on TCP
  5432; `pg_isready` with no `-h` probes the Unix socket and reports "no response".
- **Worlds** (verified against the live DB, 2026-09-15):

  | id | name | source | scale |
  |----|------|--------|-------|
  | 1 | **Orid Zurko** — The Universe of Cyclones | `region2-00250-01-01-legends.xml` | 49,614 figures / 473,129 events |
  | 2 | **Slozgo Xâgu** — The Universe of Vision | `region1-00050-01-15-legends.xml` | 347 figures / 2,068 events |

  ⚠️ World 2's event count **grows while the watcher runs** — the legends ingest laid
  down 2,057 and live cycles have since added 11. Treat it as a reading taken on a
  date, not a constant; query the DB rather than trusting the number here.

  *World 1 was previously recorded here as "Namoram — The Destined World";
  `tests/test_phase4_validation.py` comments say "Tar Thran / The Land of Dawning".
  Both are stale doc text — the entity IDs still resolve, only the labels drifted.*
- **Live fortress**: **Nokimast, "Ochresabres"** — save `region1`, 15th Granite year 50,
  44 units / 7 true settlers, world_id 2. *(Was: "Girderpriced, COLLAPSED Y256 Winter.
  No live fortress; a new embark is needed." Superseded 2026-09-15.)*
- **Test suite**: `pytest tests/` — 447 passed. The 37 failures in
  `test_phase4_validation.py` are `httpx ConnectError` against an explorer that is not
  running, not regressions. ⚠️ Run `pytest tests/`, not bare `pytest`: the latter tries
  to collect `repos/dfhack/depends/googletest` and dies on 7 collection errors.
