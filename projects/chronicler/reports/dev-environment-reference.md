# Chronicler — Dev Environment Reference Document

**Created**: 2026-02-24, Session 33
**Status**: Canonical reference — single source of truth for all VM/DF/DFHack architecture
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
**Dev artifacts**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [UTM Virtual Machine](#2-utm-virtual-machine)
3. [Dwarf Fortress Installation](#3-dwarf-fortress-installation)
4. [DFHack Installation & Configuration](#4-dfhack-installation--configuration)
5. [SSH Transport Layer](#5-ssh-transport-layer)
6. [File Transfer Methods](#6-file-transfer-methods)
7. [Data Access Architecture](#7-data-access-architecture)
8. [VM Automation Scripts](#8-vm-automation-scripts)
9. [Chronicler Bridge (Lua)](#9-chronicler-bridge-lua)
10. [Database Layer](#10-database-layer)
11. [Development Workflow](#11-development-workflow)
12. [Known Gotchas & Workarounds](#12-known-gotchas--workarounds)
13. [Network Topology](#13-network-topology)
14. [Alternative Host: HomeServer](#14-alternative-host-homeserver)
15. [Reference Repositories](#15-reference-repositories)
16. [Quick Reference Card](#16-quick-reference-card)

---

## 1. Architecture Overview

The Chronicler development environment spans two machines: the **Mac Studio** (host, running Jarvis + PostgreSQL + Qdrant) and a **UTM Windows 11 ARM VM** (guest, running Dwarf Fortress + DFHack). All communication between host and guest flows through SSH.

```
┌──────────────────────────────────────────────────────────────────┐
│ Mac Studio (Host) — macOS, ARM64                                 │
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │ Jarvis (Claude Code) │  │ Infrastructure (Docker)          │  │
│  │ tmux session: jarvis │  │  • PostgreSQL 16 (port 5432)     │  │
│  │  W0: Jarvis          │  │  • Qdrant (port 6333/6334)       │  │
│  │  W1: Watcher         │  │  • Neo4j (port 7474/7687)        │  │
│  │  W2: Ennoia          │  │  • Redis (port 6379)             │  │
│  │  W3: Virgil          │  │  • n8n (port 5678)               │  │
│  │  W4: Commands        │  │                                  │  │
│  │  W5: Jarvis-dev      │  │ DwarfCron venv (Python 3.12)     │  │
│  └─────────────────────┘  │  .venv/bin/chronicler CLI         │  │
│                            └──────────────────────────────────┘  │
│                                                                  │
│  SSH (port 22) ──────────────────────────────────┐               │
│  HTTP file server (port 8889) ───────────────────┤               │
│  DFHack RPC (port 5000, BROKEN for game-thread)──┤               │
│  Bridge HTTP (port 8888) ────────────────────────┤               │
└──────────────────────────────────────────────────│───────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │ UTM VM      │
                                            │ (QEMU/ARM)  │
                                            │             │
┌───────────────────────────────────────────────────────────────────┐
│ DF-Windows (Guest) — Windows 11 Pro ARM 64-bit (10.0.26200)      │
│                                                                   │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐ │
│  │ Dwarf Fortress 53.10 (Steam)    │  │ OpenSSH ARM64 v10.0    │ │
│  │ + DFHack 53.10-r1               │  │ sshd (auto-start)      │ │
│  │                                 │  │ Admin keys deployed     │ │
│  │ RemoteFortressReader (41 funcs) │  └────────────────────────┘ │
│  │ chronicler-bridge.lua (16 sec)  │                              │
│  │ DFHack RPC on TCP 5000         │  ┌────────────────────────┐ │
│  └─────────────────────────────────┘  │ HTTP File Server       │ │
│                                       │ (PowerShell, port 8889)│ │
│  Machine: WIN-MRGFUCCV202             │ Serves DF install dir  │ │
│  IP: 192.168.64.3                     └────────────────────────┘ │
│  User: Jarvis                                                     │
└───────────────────────────────────────────────────────────────────┘
```

### Key Design Principle

**All game-thread interaction goes through `dfhack-run` over SSH**, not TCP RPC. The TCP RPC protocol is broken for any call requiring the DFHack Core thread (which is all calls except `GetVersion` and `GetWorldInfo`). This is a fundamental constraint of DFHack 53.x running under QEMU/Prism ARM emulation — `CoreSuspender` never acquires from the network thread.

---

## 2. UTM Virtual Machine

### VM Identity

| Property | Value |
|----------|-------|
| VM Name | `DF-Windows` |
| Machine Name | `WIN-MRGFUCCV202` |
| IP Address | `192.168.64.3` |
| OS | Windows 11 Pro ARM 64-bit (10.0.26200) |
| Hypervisor | UTM (QEMU backend, Prism x86 translation) |
| utmctl binary | `/Applications/UTM.app/Contents/MacOS/utmctl` |

### VM Storage

| Property | Detail |
|----------|--------|
| Disk format | qcow2 |
| Data directory | `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/` |
| Disk auto-detection | `vm-config.sh` globs for `*.qcow2` (UUID changes on re-create) |
| Snapshots | Via `qemu-img` (requires: `brew install qemu`; VM must be stopped) |

### Guest Agent

The QEMU Guest Agent (SPICE Guest Tools) provides basic host↔guest communication:
- **Capabilities**: File push/pull, command execution, IP address query
- **Limitations**: `utmctl exec` is fire-and-forget (no stdout relay); `utmctl file pull` returns exit 0 even on failure (must check content, not `$?`)
- **Speed**: File transfer via Guest Agent is ~0.24 MB/s (440x slower than HTTP file server)
- **Use case**: Emergency fallback only — SSH is the primary transport for everything

### VM Lifecycle Commands

```bash
# All commands via vm-lifecycle.sh (sources vm-config.sh)
SCRIPTS=/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts

$SCRIPTS/vm-lifecycle.sh start       # Boot VM, wait for SSH, print IP
$SCRIPTS/vm-lifecycle.sh stop        # Graceful shutdown
$SCRIPTS/vm-lifecycle.sh suspend     # Suspend to memory
$SCRIPTS/vm-lifecycle.sh status      # Print VM status (started/stopped/suspended)
$SCRIPTS/vm-lifecycle.sh ip          # Print VM IP address
$SCRIPTS/vm-lifecycle.sh health      # Full health check (VM + SSH + services)
$SCRIPTS/vm-lifecycle.sh ssh [cmd]   # SSH into VM (or run command)
```

### VM Snapshots

```bash
# VM must be stopped for snapshot operations
$SCRIPTS/vm-lifecycle.sh snapshot <name>   # Create disk snapshot
$SCRIPTS/vm-lifecycle.sh restore <name>    # Restore to snapshot
$SCRIPTS/vm-lifecycle.sh snapshots         # List all snapshots
$SCRIPTS/vm-lifecycle.sh clone <name>      # Clone entire VM (no qemu-img needed)
```

### VM Bootstrap

For fresh VM setup (after Windows 11 ARM install + SPICE Guest Tools):

```bash
$SCRIPTS/vm-bootstrap.sh              # Full bootstrap (OpenSSH + SSH key + PS7)
$SCRIPTS/vm-bootstrap.sh --check      # Check current bootstrap status
$SCRIPTS/vm-bootstrap.sh --ssh-only   # Only SSH key setup (if OpenSSH already installed)
```

Bootstrap steps:
1. Verify Guest Agent connectivity
2. Install OpenSSH Server (via `Add-WindowsCapability`)
3. Generate ed25519 SSH key pair (`~/.ssh/df-vm`)
4. Deploy public key to `C:\Users\Jarvis\.ssh\authorized_keys` AND `C:\ProgramData\ssh\administrators_authorized_keys` (admin users need both)
5. Configure `~/.ssh/config` entry (`Host df-vm`)
6. Install PowerShell 7 via winget (best-effort)

---

## 3. Dwarf Fortress Installation

### Version & Location

| Property | Value |
|----------|-------|
| Version | Dwarf Fortress 53.10 (Steam release) |
| Install path | `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\` |
| DFHack version | 53.10-r1 |
| Current world | "The Land of Dawning" — year 250, 257×257 map |

### World Statistics (Live Data, Verified)

| Entity Type | Count |
|-------------|-------|
| Historical Figures | 48,366 |
| History Events | 442,716 |
| Entities (civilizations, religions, etc.) | 4,901 |
| Artifacts | 8,035 |
| Sites | 2,154 |
| Regions | 2,278 |

### Data Export

**Legends XML Export** (pre-embark or post-embark):
- DFHack command: `exportlegends`
- Produces two files: `region1-legends.xml` and `region1-legends_plus.xml`
- Post-embark export is preferred (includes HF records for starting dwarves)
- Files located in DF's save directory

**Legends XML Location**:
```
C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\data\save\regionN\
```

---

## 4. DFHack Installation & Configuration

### DFHack Architecture on This System

DFHack 53.10-r1 runs as a DLL injected into the Dwarf Fortress process. On Windows ARM, DF and DFHack run as x86 binaries under QEMU's Prism x86→ARM translation layer.

### Key Plugins

| Plugin | Status | Notes |
|--------|--------|-------|
| RemoteFortressReader | LOADED (41 RPC functions) | Auto-activates at init; `enable RemoteFortressReader` fails because no `plugin_enable()` exists — by design |
| chronicler-bridge.lua | User script | 16-section Lua bridge for data extraction |

### DFHack RPC Architecture (and Why It's Broken)

DFHack exposes an RPC server on TCP port 5000. The protocol uses Protocol Buffers with a handshake sequence. However, **game-thread calls hang indefinitely** on DFHack 53.x under Prism:

- **Working calls**: `GetVersion`, `GetWorldInfo` — these return cached data without requiring the DFHack Core thread
- **Broken calls**: `RunCommand`, all RemoteFortressReader functions, anything that dispatches to the game thread — `CoreSuspender` never acquires from the network thread, causing infinite hang
- **Root cause**: Prism's x86 translation layer interferes with the thread synchronization mechanism that DFHack uses to dispatch RPC calls to the main game thread

### DFHack Console Access

The DFHack console is accessible in two ways:

1. **`dfhack-run` over SSH** (PRIMARY, WORKING):
   ```bash
   ssh -i ~/.ssh/df-vm Jarvis@192.168.64.3 \
     '"C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\hack\dfhack-run.exe" <command>'
   ```
   This executes Lua/commands directly on the DFHack Core thread, bypassing TCP dispatch entirely.

2. **DFHack in-game console** (manual only):
   - Press backtick (`` ` ``) in DF to open DFHack console
   - Type commands directly
   - Not automatable from the host

### Available DFHack Commands for Chronicler

| Command | Purpose | Transport |
|---------|---------|-----------|
| `exportlegends` | Export full world history to XML | dfhack-run |
| `lua dfhack.world.ReadWorldFolder()` | Read world data structures | dfhack-run |
| `lua require('json').encode(...)` | JSON encode Lua table for extraction | dfhack-run |
| Custom Lua scripts | Access any DF data structure via `df.*` global | dfhack-run |

---

## 5. SSH Transport Layer

### Configuration

| Property | Value |
|----------|-------|
| SSH key | `~/.ssh/df-vm` (ed25519) |
| SSH user | `Jarvis` |
| SSH host | `192.168.64.3` (or `df-vm` via ssh config) |
| Timeout | 5 seconds (connection), 120 seconds (boot wait) |
| OpenSSH version | ARM64 v10.0 (MSI install) |

### SSH Config Entry

```
Host df-vm
    HostName 192.168.64.3
    User Jarvis
    IdentityFile ~/.ssh/df-vm
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
    ConnectTimeout 5
```

### Critical: OpenSSH ARM64 Requirement

The x64 (Win32-OpenSSH) build **crashes during KEXINIT** under Prism's x86 translation layer. The ARM64 MSI from GitHub releases MUST be used. Installation was done during VM bootstrap.

### Admin Key Deployment

Windows OpenSSH for admin users uses `C:\ProgramData\ssh\administrators_authorized_keys` (NOT the user's `.ssh/authorized_keys`). Both files are deployed during bootstrap with correct ACLs:
- `SYSTEM:F` + `Administrators:F` on `administrators_authorized_keys`
- `SYSTEM:F` + `Jarvis:F` on user's `authorized_keys`

---

## 6. File Transfer Methods

Three methods available, ordered by speed:

### 6.1 HTTP File Server (~105 MB/s)

A PowerShell HTTP listener running on the VM, serving files from the DF install directory.

```bash
# Start/stop/status
$SCRIPTS/vm-lifecycle.sh http-serve start
$SCRIPTS/vm-lifecycle.sh http-serve stop
$SCRIPTS/vm-lifecycle.sh http-serve status

# Download a file
$SCRIPTS/vm-lifecycle.sh http-pull <filename> [local-path]
# Example:
$SCRIPTS/vm-lifecycle.sh http-pull "data/save/region1/region1-legends.xml" /tmp/
```

**Implementation**: `file-server.ps1` is deployed to `C:\Users\Jarvis\file-server.ps1` and runs as a background PowerShell process. Requires URL ACL + firewall rule (set up automatically).

**Deployment**: Two paths:
- **SSH available**: SCP the script, launch via SSH (fast)
- **SSH unavailable**: Push via Guest Agent, launch via `exec-ps` (slow, ~10s PS startup)

### 6.2 SCP via SSH (~19 MB/s)

Direct file copy over the SSH connection.

```bash
# Single file pull
$SCRIPTS/vm-lifecycle.sh scp-pull <guest-path> [local-path]

# Parallel multi-file pull
$SCRIPTS/vm-lifecycle.sh scp-pull-multi <local-dir> <guest-path1> [guest-path2] ...

# Smart pull (SCP if SSH available, else Guest Agent fallback)
$SCRIPTS/vm-lifecycle.sh pull <guest-path> [local-path]
```

**Critical SCP flags**:
- `-O` (legacy SCP protocol) — OpenSSH 8.0+ defaults to SFTP mode which breaks `C:/` paths
- `-T` (disable strict filename check) — needed for Windows paths with spaces/parens

### 6.3 QEMU Guest Agent (~0.24 MB/s)

Emergency fallback only. 440x slower than HTTP.

```bash
# Push file to VM
$SCRIPTS/vm-lifecycle.sh push <local-file> <guest-path>

# Pull file from VM (legacy, slow)
$SCRIPTS/vm-lifecycle.sh pull-ga <guest-path>
```

### Speed Comparison

| Method | Speed | Use Case |
|--------|-------|----------|
| HTTP file server | ~105 MB/s | Legends XML download (25-100+ MB) |
| SCP | ~19 MB/s | Script deployment, small files |
| Guest Agent | ~0.24 MB/s | Emergency only (when SSH is unavailable) |

---

## 7. Data Access Architecture

### The Two Working Mechanisms

#### 1. `dfhack-run` over SSH (Real-Time Commands)

For executing individual DFHack/Lua commands and getting immediate results:

```bash
# Run a DFHack command
$SCRIPTS/vm-lifecycle.sh ssh \
  '"C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\hack\dfhack-run.exe" lua "print(df.global.world.world_data.name)"'

# Run a complex Lua snippet
$SCRIPTS/vm-lifecycle.sh ssh \
  '"C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\hack\dfhack-run.exe" lua "local units = df.global.world.units.active; print(#units)"'
```

**Characteristics**:
- Executes on DFHack's Core thread (full access to game state)
- Synchronous — waits for result
- Replaces broken TCP RPC for ALL game-thread operations
- SSH adds ~50-100ms overhead per command

#### 2. Chronicler Bridge Lua Script (Bulk Data, Periodic)

A DFHack repeat job (`chronicler-bridge.lua`) that runs periodically in-game, writes structured JSON to disk, and serves it via HTTP on port 8888.

```bash
# Check bridge output
curl -s http://192.168.64.3:8888/ | python3 -m json.tool | head -20

# Or pull bridge output file via SCP
$SCRIPTS/vm-lifecycle.sh scp-pull "C:/Users/Jarvis/chronicler-bridge-output.json" /tmp/
```

**16 Sections of Bridge Data**:

| Section | Content | Format |
|---------|---------|--------|
| `version` | Bridge version, world info | Static metadata |
| `time` | In-game year, month, day, tick | Temporal context |
| `fortress` | Fortress name, embark site | Identity |
| `weather` | Current weather conditions | State |
| `unit_summary` | All fortress units (name, prof, skills, stats) | Per-unit array |
| `unit_changes` | Detected changes since last cycle | Diff array |
| `buildings` | Fortress buildings with types and positions | Per-building array |
| `stockpiles` | Stockpile contents and categories | Per-stockpile array |
| `work_orders` | Manager work orders | Per-order array |
| `announcements` | Game announcements (combat, events) | Text array |
| `armies` | Military and hostile forces | Per-army array |
| `items` | Notable items (artifacts, etc.) | Per-item array |
| `map_features` | Notable map features | Feature array |
| `population` | Population statistics by race | Summary |
| `reports` | Combat reports, cursor-based | Event stream |
| `events` | In-game events with lossless capture | Event stream |

### What DOESN'T Work: TCP RPC

- DFHack RPC on TCP port 5000 is BROKEN for game-thread calls
- Only `GetVersion` and `GetWorldInfo` work (cached, no Core lock needed)
- ALL RemoteFortressReader functions hang indefinitely
- ALL `RunCommand` calls hang indefinitely
- Do NOT attempt to use TCP RPC for any data extraction

---

## 8. VM Automation Scripts

All scripts live at: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

### Script Architecture

```
vm-config.sh          ← Shared configuration (sourced by all others)
    ├── vm-lifecycle.sh   ← 19-command VM management wrapper
    ├── vm-bootstrap.sh   ← Phase 0 setup (OpenSSH, SSH keys, PS7)
    └── file-server.ps1   ← PowerShell HTTP file server (deployed to VM)
```

### vm-config.sh — Shared Configuration

Single source of truth for VM identity, paths, and SSH settings:

| Variable | Value |
|----------|-------|
| `VM_NAME` | `DF-Windows` |
| `UTMCTL` | `/Applications/UTM.app/Contents/MacOS/utmctl` |
| `SSH_KEY` | `$HOME/.ssh/df-vm` |
| `SSH_USER` | `Jarvis` |
| `SSH_TIMEOUT` | 5 seconds |
| `SSH_MAX_WAIT` | 120 seconds (boot wait) |
| `DFHACK_RPC_PORT` | 5000 |
| `BRIDGE_HTTP_PORT` | 8888 |
| `FILE_SERVE_PORT` | 8889 |

### vm-lifecycle.sh — Command Reference

| Category | Command | Description |
|----------|---------|-------------|
| **Lifecycle** | `start` | Boot VM, wait for SSH, print IP |
| | `stop` | Graceful shutdown (waits up to 60s) |
| | `suspend` | Suspend to memory |
| | `status` | Print VM status |
| | `ip` | Print VM IP address |
| | `ssh [cmd]` | SSH into VM (or run command) |
| | `health` | Full health check (VM + SSH + DFHack + Bridge + File Server) |
| **File Transfer** | `scp-pull <guest> [local]` | Fast download via SCP (~19 MB/s) |
| | `scp-pull-multi <dir> <g1>...` | Parallel SCP downloads |
| | `http-serve {start\|stop\|status}` | Manage HTTP file server |
| | `http-pull <file> [local]` | Download via HTTP (~105 MB/s) |
| | `pull <guest> [local]` | Smart pull (SCP → GA fallback) |
| | `pull-ga <guest>` | Legacy Guest Agent pull (~0.24 MB/s) |
| | `push <local> <guest>` | Upload via Guest Agent |
| **Execution** | `exec <cmd...>` | Fire-and-forget via Guest Agent |
| | `exec-capture <cmd>` | GA exec with output capture (temp file + done marker) |
| | `exec-ps <ps-cmd>` | Complex PowerShell via base64 `-EncodedCommand` |
| **Snapshots** | `snapshot <name>` | Create disk snapshot (VM must be stopped) |
| | `restore <name>` | Restore disk snapshot |
| | `snapshots` | List disk snapshots |
| | `clone <name>` | Clone entire VM |

### vm-bootstrap.sh — Bootstrap Sequence

```
Preflight → Install OpenSSH → SSH Key → SSH Config → PowerShell 7
```

- Preflight: VM must be running, Guest Agent must respond
- OpenSSH: `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`
- SSH Key: ed25519, deployed to both user and admin authorized_keys
- SSH Config: `Host df-vm` entry in `~/.ssh/config`
- PS7: `winget install --id Microsoft.PowerShell` (best-effort)

---

## 9. Chronicler Bridge (Lua)

### Location

- **Host path**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/src/chronicler/dfhack/scripts/chronicler-bridge.lua`
- **VM deployment path**: `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\hack\scripts\chronicler-bridge.lua`

### Deployment

```bash
# Deploy bridge script to VM via SCP
$SCRIPTS/vm-lifecycle.sh scp-pull is not used for deployment — use:
scp -O -T -i ~/.ssh/df-vm \
  /Users/nathanielcannon/Claude/Projects/DwarfCron/src/chronicler/dfhack/scripts/chronicler-bridge.lua \
  'Jarvis@192.168.64.3:"C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/hack/scripts/chronicler-bridge.lua"'
```

### Bridge Operation

The bridge is a DFHack repeat job that:
1. Runs every N game ticks (configurable)
2. Collects data from 16 sections using `df.*` globals
3. Encodes as JSON using DFHack's `require('json')`
4. Writes to a local file AND serves via HTTP on port 8888

### Bridge Version

Current: **v6** (16 sections, 7 data domains)

### Data Domains

1. **World context** (version, time, fortress identity)
2. **Unit data** (summary, changes, tracking)
3. **Infrastructure** (buildings, stockpiles, work orders)
4. **Military** (armies, combat reports)
5. **Events** (announcements, cursor-based events with lossless capture)
6. **Geography** (map features, weather)
7. **Economy** (items, population stats)

---

## 10. Database Layer

### PostgreSQL

| Property | Value |
|----------|-------|
| Engine | PostgreSQL 16 (Docker container) |
| Port | 5432 |
| Database | `chronicler` |
| Schema | CDM (Common Data Model), 35 tables, composite PKs |
| Record count | ~109,000 (world "Namoram") |
| Extensions | ParadeDB (full-text search) |

### Key Tables

| Table | Records | Description |
|-------|---------|-------------|
| `historical_figures` | 60,000+ | All known HFs from legends XML |
| `history_events` | 312,000+ | Historical events (battles, deaths, etc.) |
| `entities` | 4,901 | Civilizations, religions, military orders |
| `sites` | 2,154 | Cities, fortresses, caves |
| `regions` | 2,278 | Geographic regions |
| `artifacts` | 8,035 | Created artifacts |
| `units` | varies | Live fortress units (from bridge data) |
| `hf_links` | varies | Relationships between HFs |
| `hf_entity_links` | varies | HF memberships in entities |
| `worlds` | 1+ | World metadata |
| `fortress_denizens` | (planned) | Denizen registry — Phase 1 |
| `knowledge_horizon` | (planned) | Dynamic visibility — Phase 4 |

### Connection

```python
import asyncpg
conn = await asyncpg.connect('postgresql://localhost:5432/chronicler')
```

### Chronicler CLI

```bash
# Activate DwarfCron venv
source /Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/activate

# CLI commands
chronicler ingest <legends-xml>      # Import legends XML
chronicler watch                     # Start live watcher
chronicler story                     # Interactive storyteller
chronicler explore                   # Web-based explorer (http://localhost:8000)
chronicler denizens                  # (planned) List fortress denizens
```

---

## 11. Development Workflow

### Typical Session

1. **Start VM**: `$SCRIPTS/vm-lifecycle.sh start`
2. **Verify health**: `$SCRIPTS/vm-lifecycle.sh health`
3. **Start services**:
   - HTTP file server: `$SCRIPTS/vm-lifecycle.sh http-serve start`
   - Chronicler watcher: `chronicler watch` (from DwarfCron venv)
   - Explorer: `chronicler explore` (web UI at localhost:8000)
4. **Deploy bridge updates**: SCP the updated Lua script to VM
5. **Collect data**: `dfhack-run` for real-time Lua commands; bridge for bulk periodic data
6. **Run tests**: `pytest /Users/nathanielcannon/Claude/Projects/DwarfCron/tests/`
7. **Stop VM**: `$SCRIPTS/vm-lifecycle.sh stop` (or `suspend` to save state)

### Bridge Development Cycle

1. Edit `chronicler-bridge.lua` locally
2. Deploy to VM via SCP
3. In DFHack console (via `dfhack-run`): `kill-lua chronicler-bridge; script chronicler-bridge`
4. Verify output: `curl http://192.168.64.3:8888/`

### Watcher Development Cycle

1. Edit `chronicler/dfhack/watcher.py` locally
2. Run: `chronicler watch --interval 30 --world-id 1`
3. Watch database for changes: `SELECT * FROM units ORDER BY updated_at DESC LIMIT 5;`

---

## 12. Known Gotchas & Workarounds

### VM / UTM

| Gotcha | Impact | Workaround |
|--------|--------|------------|
| `utmctl exec` is fire-and-forget | No stdout from commands | Use `exec-capture` (temp file + done marker) or SSH |
| `utmctl file pull` returns 0 on failure | Silent failures | Check output content, not exit code |
| `utmctl file pull` path escaping | Double-backslash required | `"C:\\\\Windows\\\\Temp\\\\file.txt"` in bash |
| VM disk UUID changes on re-create | Hardcoded UUID breaks | `vm-config.sh` auto-detects via glob |
| PowerShell under Prism has ~10s startup | Fixed sleep unreliable | Poll with done-marker pattern |

### SSH / SCP

| Gotcha | Impact | Workaround |
|--------|--------|------------|
| OpenSSH x64 crashes under Prism | KEXINIT failure | Use ARM64 MSI from GitHub releases |
| SCP defaults to SFTP mode (OpenSSH 8.0+) | Windows paths break | Use `-O` flag for legacy SCP protocol |
| SCP strict filename check | Paths with spaces/parens fail | Use `-T` flag to disable |
| Admin users need two authorized_keys files | Key auth fails | Deploy to both user `.ssh/` and `C:\ProgramData\ssh\` |

### DFHack

| Gotcha | Impact | Workaround |
|--------|--------|------------|
| TCP RPC broken for game-thread calls | ALL data extraction via RPC hangs | Use `dfhack-run` over SSH |
| `enable RemoteFortressReader` fails | Confusing error message | Plugin auto-activates; no `plugin_enable()` exists — this is by design |
| RFR functions hang when game is paused | Calls need game thread | Unpause game before data extraction, or use dfhack-run |

### macOS (Bash 3.2)

| Gotcha | Impact | Workaround |
|--------|--------|------------|
| No associative arrays | Script compatibility | Use indexed arrays or temp files |
| No `readarray` / `mapfile` | Can't read arrays from pipe | Use `while read` loops |
| No `;&` in case statements | Fall-through unavailable | Use `|` patterns or if/elif chains |
| `set -euo pipefail` kills scripts | grep exit 1 on no match | Never use in hooks/scripts |

### tmux

| Gotcha | Impact | Workaround |
|--------|--------|------------|
| `$HOME/bin/tmux ... \| grep` breaks in zsh | Pipe fails silently | Use absolute path `/Users/nathanielcannon/bin/tmux` |
| `send-keys` with text + Enter | Input buffer corruption | Never combine — send text, then send Enter separately |
| Multi-line strings with `-l` | Buffer corruption | Never use multi-line strings with send-keys `-l` |

---

## 13. Network Topology

```
Host (Mac Studio)                  Guest (DF-Windows VM)
192.168.64.1                       192.168.64.3

  SSH client ──────────────────────→ :22 (OpenSSH ARM64)
  curl/wget ──────────────────────→ :8888 (Bridge HTTP)
  curl/wget ──────────────────────→ :8889 (File Server HTTP)
  [BROKEN] dfhack-client ─────────→ :5000 (DFHack RPC)

  :5432 (PostgreSQL) ←── chronicler ──→ :22 (dfhack-run via SSH)
  :6333 (Qdrant)
  :7687 (Neo4j)
  :6379 (Redis)
  :5678 (n8n)
  :8000 (MLX Embed)
```

### Ports Summary

| Port | Service | Host/Guest | Status |
|------|---------|------------|--------|
| 22 | SSH (OpenSSH) | Guest | WORKING — primary transport |
| 5000 | DFHack RPC | Guest | BROKEN for game-thread calls |
| 8888 | Bridge HTTP | Guest | WORKING — periodic bridge data |
| 8889 | File Server HTTP | Guest | WORKING — on-demand file download |
| 5432 | PostgreSQL | Host (Docker) | WORKING — chronicler database |
| 6333/6334 | Qdrant | Host (Docker) | WORKING — vector search |
| 7474/7687 | Neo4j | Host (Docker) | WORKING — knowledge graph |
| 8000 | MLX Embed | Host | WORKING — embedding server |

---

## 14. Alternative Host: HomeServer

An alternative Windows host exists but is NOT currently used for DF:

| Property | Value |
|----------|-------|
| OS | Windows 10 Pro x86_64 |
| IP | `192.168.4.194` |
| Machine name | `WIN-48L3R2QLQN0` |
| User | `Nathaniel` |
| Password | `DwarfF0rtress` |
| Status | Available but unused for DF |

This could serve as a future native x86 DF host (eliminating Prism translation overhead and the TCP RPC bug), but would require network configuration for cross-subnet communication.

---

## 15. Reference Repositories

All cloned at `/Users/nathanielcannon/Claude/GitRepos/`:

| Repository | Language | Relevance to Chronicler |
|-----------|----------|------------------------|
| **df-ai** | C++ (DFHack plugin) | AI player, event manager pattern, callback system |
| **df-narrator** | Python | Figure/site scoring formulas, Markdown narrative output |
| **df-structures** | XML | DF memory structure definitions (the "API" for DF data) |
| **dfhack-client-python** | Python | Python client for DFHack RPC (reference, not used due to RPC bug) |
| **weblegends** | C++ (DFHack plugin) | 96 per-event HTML generators, context-aware rendering |
| **DwarfFortressLogger** | C++ (Qt) | Real-time memory-mapped DF structure access |
| **myDFHackScripts** | Lua | Community DFHack scripts collection |
| **DwarvenSurveyor** | Lua | Map/survey scripts for DFHack |
| **LegendsBrowser** | Java | Classic legends browser (original) |
| **LegendsBrowser2** | Go + Vue.js | Custom streaming XML tokenizer, 100+ event types, collection summaries |
| **LegendsViewer-Next** | .NET 8 + Vue 3 | Leaflet.js maps, family trees, async XmlReader, fastest XML loader |
| **ModHearth** | TypeScript | Mod management platform |
| **DF-Modloader** | Python | Mod loading/installation utility |

Additional repos in DwarfCron product space:
- **Dwarf-Therapist**: `DwarfCron/repos/Dwarf-Therapist/` — Qt-based labor manager (memory-mapped access)
- **dfhack**: `DwarfCron/repos/dfhack/` — Full DFHack source (reference)

---

## 16. Quick Reference Card

```
═══════════════════════════════════════════════════════════
  CHRONICLER DEV ENVIRONMENT — QUICK REFERENCE
═══════════════════════════════════════════════════════════

VM CONTROL:
  start:    vm-lifecycle.sh start
  stop:     vm-lifecycle.sh stop
  status:   vm-lifecycle.sh status
  health:   vm-lifecycle.sh health
  ssh:      ssh df-vm   (or: vm-lifecycle.sh ssh)

DATA ACCESS:
  dfhack-run:  vm-lifecycle.sh ssh '"C:\Program Files (x86)\Steam\...\hack\dfhack-run.exe" <cmd>'
  bridge:      curl http://192.168.64.3:8888/

FILE TRANSFER:
  fast (HTTP):  vm-lifecycle.sh http-serve start && vm-lifecycle.sh http-pull <file>
  medium (SCP): vm-lifecycle.sh scp-pull <guest-path> [local]
  slow (GA):    vm-lifecycle.sh pull-ga <guest-path>

CHRONICLER CLI (from DwarfCron/.venv):
  ingest:   chronicler ingest <xml>
  watch:    chronicler watch
  story:    chronicler story
  explore:  chronicler explore  → http://localhost:8000

DATABASE:
  psql postgresql://localhost:5432/chronicler

KEY PATHS:
  VM scripts:     Jarvis/projects/chronicler/scripts/
  Bridge Lua:     DwarfCron/src/chronicler/dfhack/scripts/chronicler-bridge.lua
  Product code:   DwarfCron/src/chronicler/
  Tests:          DwarfCron/tests/

CRITICAL GOTCHA:
  TCP RPC (port 5000) is BROKEN for game-thread calls.
  ALWAYS use dfhack-run over SSH for data extraction.
═══════════════════════════════════════════════════════════
```

---

*Dev Environment Reference Document v1.0*
*Chronicler / DwarfCron Project*
*2026-02-24*
