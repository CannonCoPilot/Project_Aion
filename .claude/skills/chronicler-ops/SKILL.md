---
name: chronicler-ops
description: Chronicler and Dwarf Fortress operations — VM control, DFHack RPC, legends ingestion, live data pipeline, watcher management, and Windows app packaging. Use when working with Dwarf Fortress, DFHack, chronicler, legends XML, watcher, bridge, VM deployment, game data, fortress mode, units, historical figures, or the Chronicler project in any capacity.
version: 1.0.0
---

# Chronicler Operations

End-to-end workflow guidance for the Chronicler project — from VM lifecycle to game data pipeline to legends ingestion.

## When This Skill Applies

This skill activates when the task involves:
- Dwarf Fortress or DFHack interaction
- VM lifecycle operations (start, stop, deploy, snapshot)
- Legends XML ingestion or analysis
- Live data pipeline (bridge, watcher, change detection)
- Chronicler CLI operations
- DFHack Lua scripting or RPC calls
- Windows app packaging

## Architecture Overview

```
Mac (Jarvis)                         VM (DF-Windows)
┌─────────────────┐                  ┌─────────────────────────────┐
│ chronicler CLI   │◄─── RPC ───────►│ DFHack 53.10-r1             │
│ watcher          │    (port 5000)   │ ├── Dwarf Fortress 53.10   │
│ xml_parser       │                  │ ├── chronicler-bridge.lua   │
│ storyteller      │◄─── HTTP ──────►│ └── PowerShell HTTP server  │
│ web UI (FastAPI) │    (port 8888)   │                             │
│                  │                  │ OS: Win11 ARM (Prism x86)   │
│ PostgreSQL       │                  │ IP: 192.168.64.3            │
│ (localhost:5432) │                  │ SSH: Jarvis@df-vm           │
└─────────────────┘                  └─────────────────────────────┘
```

## Key Paths

### Mac (Development)
| Path | Purpose |
|------|---------|
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/` | Chronicler product code |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler` | CLI entrypoint |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/` | DFHack client, watcher, bridge, detector |
| `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/` | Legends XML exports |
| `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/` | VM automation scripts |

### VM (DF-Windows)
| Path | Purpose |
|------|---------|
| `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\` | DF + DFHack install |
| `C:\...\Dwarf Fortress\hack\scripts\` | DFHack Lua scripts |
| `C:\...\Dwarf Fortress\save\` | Save files |

## Workflows

### 1. Full Deploy Cycle (VM → Bridge → Watcher)

```
Step 1: Ensure VM running
  vm-lifecycle.sh start

Step 2: Deploy bridge Lua script
  scp -i ~/.ssh/df-vm chronicler-bridge.lua Jarvis@$(vm-lifecycle.sh ip):"C:\...\hack\scripts\"

Step 3: Start bridge (via DFHack console or onMapLoad.init)
  /df cmd "script chronicler-bridge.lua"

Step 4: Start HTTP server on VM
  vm-lifecycle.sh ssh "powershell Start-Process ..."

Step 5: Verify bridge
  curl http://$(vm-lifecycle.sh ip):8888/game_time

Step 6: Start watcher
  chronicler watch --bridge-host $(vm-lifecycle.sh ip) --rpc-host $(vm-lifecycle.sh ip)
```

### 2. Legends Ingestion

```
Step 1: Pull legends XML from VM
  utmctl file pull DF-Windows "<path>" > local.xml

Step 2: Ingest into PostgreSQL
  chronicler ingest local.xml --db chronicler

Step 3: Verify counts
  psql chronicler -c "SELECT COUNT(*) FROM historical_figures"

Step 4: (Optional) Compare pre/post embark
  chronicler diff pre-embark.xml post-embark.xml
```

### 3. Snapshot Workflow

```
Step 1: Stop VM
  vm-lifecycle.sh stop

Step 2: Create snapshot
  vm-lifecycle.sh snapshot "baseline-year250"

Step 3: Start VM
  vm-lifecycle.sh start

Step 4: (Later) Restore
  vm-lifecycle.sh stop
  vm-lifecycle.sh restore "baseline-year250"
  vm-lifecycle.sh start
```

### 4. DFHack Game Control

```
# Pause/unpause
  /df pause
  /df unpause

# Check FPS
  /df fps

# Execute Lua
  /df lua "print(df.global.gamemode)"
  /df lua "for _,u in pairs(df.global.world.units.active) do print(u.name.first_name) end"

# Run DFHack command
  /df cmd "prospect all"
  /df cmd "reveal"
```

### 5. Performance Profiling

```
# RPC latency
  python -c "from chronicler.dfhack.client import DFHackClient; ..."

# DF FPS
  /df fps

# Bridge data freshness
  curl -s http://VM_IP:8888/game_time | python -m json.tool

# Watcher cycle timing
  chronicler watch --once  # Single cycle with timing
```

## Connection Reference

| Service | Host | Port | Protocol | Client |
|---------|------|------|----------|--------|
| DFHack RPC | 192.168.64.3 | 5000 | TCP/Protobuf | `chronicler.dfhack.client.DFHackClient` |
| Bridge HTTP | 192.168.64.3 | 8888 | HTTP/JSON | `curl` or `chronicler.dfhack.bridge` |
| SSH | 192.168.64.3 | 22 | SSH | `ssh df-vm` (after bootstrap) |
| PostgreSQL | localhost | 5432 | TCP | `psql chronicler` |
| VM Guest Agent | N/A | N/A | QEMU GA | `utmctl exec/file` |

## World Data

| Property | Value |
|----------|-------|
| World | The Land of Dawning |
| Save | Raldodok_planned |
| Region | region1 |
| Game date (embark) | Year 250, Spring |
| Civ ID | 1009 |
| Site ID | 2154 |
| Race ID | 572 (Dwarf) |
| DFHack | 53.10-r1 |
| DF | 53.10 |

## Gotchas

- **CoreSuspend broken over RPC**: DFHack's `RunCommand` hangs when called remotely. Use Lua bridge for commands that need game thread access.
- **Bridge needs repeat job**: The Lua bridge runs as a DFHack `repeat` job. It must be started after each DF launch.
- **Prism PowerShell startup**: ~10s latency for PowerShell under ARM emulation. Use `exec-ps` or SSH.
- **utmctl exec no stdout**: Guest agent exec doesn't relay output. Use `exec-capture` or `exec-ps`.
- **Legends XML size**: 300+ MB per export. Pull via `utmctl file pull` (fast) or SCP.
- **ON CONFLICT dedup**: Use composite PKs in PostgreSQL to avoid silent data loss (fixed in gap-closure).
