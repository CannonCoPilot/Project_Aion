# /df — DFHack & Dwarf Fortress Operations

**Purpose**: Interact with running Dwarf Fortress instance — RPC queries, Lua execution, bridge management, legends ingestion, watcher control.

**Usage**: `/df [subcommand] [args...]`

---

## Overview

Controls the DF+DFHack stack running in the DF-Windows VM. Uses Chronicler's `DFHackClient` for RPC and the Lua bridge for enriched data. This is the primary interface for game data access and in-game control.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| *(none)* | Connection test + world info + unit count |
| `units` | List all units with names, races, professions |
| `rpc <method>` | Raw RPC call (GetVersion, ListUnits, GetWorldInfo) |
| `lua <script>` | Execute Lua script via DFHack RPC |
| `bridge start` | Deploy and start Lua bridge repeat job |
| `bridge status` | Check bridge HTTP endpoint health + data freshness |
| `watch` | Start `chronicler watch` against VM target |
| `ingest <file>` | Ingest legends XML into PostgreSQL |
| `fps` | Check DF framerate via Lua probe |
| `pause` | Pause the game via DFHack |
| `unpause` | Unpause the game via DFHack |
| `cmd <dfhack-cmd>` | Execute arbitrary DFHack console command |

## Implementation

### RPC Connection
```python
from chronicler.dfhack.client import DFHackClient

VM_IP = "192.168.64.3"  # Or auto-detect: vm-lifecycle.sh ip
DFHACK_PORT = 5000

client = DFHackClient(VM_IP, DFHACK_PORT)
client.connect()
```

### Default (no args) — Connection Status
```python
ver = client.get_version()        # "53.10-r1"
info = client.get_world_info()    # mode, save_dir, world name, civ_id, site_id
units = client.list_units()       # count
print(f"DFHack {ver} | {info['mode']} | World: {info['world_english']}")
print(f"Save: {info['save_dir']} | Units: {len(units)}")
```

### `units`
```python
units = client.list_units()
for u in units:
    print(f"{u['name']} | {u.get('race_name', '?')} | {u.get('profession', '?')}")
```

### `rpc <method>`
Direct method call on the DFHack RPC client.

### `lua <script>`
```python
result = client.run_command('lua', script)
```

### `bridge start`
1. Deploy `chronicler-bridge.lua` to VM via SCP/push
2. Execute DFHack command: `script chronicler-bridge.lua`
3. Verify HTTP endpoint responds

### `bridge status`
```bash
curl -sf "http://$VM_IP:8888/game_time" | python -m json.tool
```

### `watch`
```bash
chronicler watch --bridge-host $VM_IP --rpc-host $VM_IP --rpc-port 5000
```

### `ingest <file>`
```bash
chronicler ingest "$1" --db chronicler
```

### `fps`
```python
result = client.run_command('lua', 'print(df.global.enabler.fps)')
```

### `pause` / `unpause`
```python
client.run_command('lua', 'df.global.pause_state = true')   # pause
client.run_command('lua', 'df.global.pause_state = false')  # unpause
```

### `cmd <dfhack-cmd>`
```python
result = client.run_command(command)
```

## Connection Details

- **DFHack RPC**: `192.168.64.3:5000` (TCP, protobuf)
- **Bridge HTTP**: `192.168.64.3:8888` (HTTP, JSON)
- **Chronicler Client**: `chronicler.dfhack.client.DFHackClient`
- **Proto defs**: `chronicler.dfhack.proto`

## Performance Baseline (VM)

| Metric | Value | Date |
|--------|-------|------|
| GetVersion latency | 0.3ms | 2026-02-24 |
| ListUnits (70 units) | 89ms | 2026-02-24 |
| PowerShell startup (Prism) | ~10s | 2026-02-24 |

## World: The Land of Dawning

- **Save**: Raldodok_planned
- **Civ ID**: 1009
- **Site ID**: 2154
- **Race ID**: 572
- **Legends exports**: `DwarfCron/data/legends/region1-{pre,post}-embark/`
