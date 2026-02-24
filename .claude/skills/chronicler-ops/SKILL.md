---
name: chronicler-ops
model: opus
version: 1.0.0
description: >
  Chronicler and Dwarf Fortress operations — VM control, DFHack RPC, legends ingestion,
  live data pipeline, watcher management, and Windows app packaging.
  Use when working with Dwarf Fortress, DFHack, chronicler, legends XML, watcher, bridge,
  VM deployment, game data, fortress mode, units, historical figures, or the Chronicler
  project in any capacity.
category: development
tags: [chronicler, dfhack, dwarf-fortress, vm, legends, watcher, bridge, rpc]
created: 2026-02-24
---

# Chronicler-Ops Skill — VM, DF, and Data Pipeline Orchestration

End-to-end workflow guidance for Chronicler development: VM lifecycle, DFHack RPC,
Lua bridge, legends ingestion, live watcher, and deployment operations.

---

## Architecture Overview

```
Mac Studio (Jarvis)
├── chronicler CLI        → Python package at /Users/nathanielcannon/Claude/Projects/DwarfCron/
├── PostgreSQL            → localhost:5432, db=chronicler (CDM schema, 109K+ records)
├── vm-lifecycle.sh       → UTM/utmctl wrapper (start/stop/ssh/snapshot)
└── DFHackClient          → TCP RPC to VM port 5000

DF-Windows VM (UTM)
├── Windows 11 ARM        → Prism x86-64 emulation
├── Dwarf Fortress 53.10  → C:\Program Files (x86)\Steam\...\Dwarf Fortress\
├── DFHack 53.10-r1       → RPC on TCP :5000
├── chronicler-bridge.lua → HTTP JSON server on :8888
└── OpenSSH               → SSH on :22, user=Jarvis

HomeServer (Physical — 192.168.4.194)
├── Windows 10 Pro x86_64 → Native DF performance
├── DF + DFHack           → Same versions, RPC on :5000
└── PowerShell HTTP       → File server on :8888
```

---

## Quick Actions

| Need | Action |
|------|--------|
| Check VM status | `/vm` or `/vm health` |
| Boot VM | `/vm start` |
| Check DF connection | `/df` |
| List fortress units | `/df units` |
| Start bridge pipeline | Workflow 1 below |
| Start live watcher | Workflow 2 below |
| Ingest legends XML | Workflow 3 below |
| Compare legends snapshots | Workflow 4 below |
| Full deploy cycle | Workflow 5 below |
| Check DF framerate | `/df fps` |
| Pause/unpause game | `/df pause` / `/df unpause` |
| Create VM snapshot | `/vm snapshot <name>` |

---

## Key Paths

| Resource | Path |
|----------|------|
| Chronicler source | `/Users/nathanielcannon/Claude/Projects/DwarfCron/` |
| CLI entrypoint | `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler` |
| DFHack client | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py` |
| Proto definitions | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/proto/` |
| Bridge Lua script | `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/chronicler-bridge.lua` |
| VM scripts | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh` |
| VM config (shared) | `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-config.sh` |
| Legends data | `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/` |
| Pre-embark legends | `.../data/legends/region1-pre-embark/` |
| Post-embark legends | `.../data/legends/region1-post-embark/` |
| DB schema | PostgreSQL `chronicler` — CDM tables (units, historical_figures, events, etc.) |

---

## Connection Details

| Service | Host | Port | Protocol |
|---------|------|------|----------|
| DFHack RPC (VM) | 192.168.64.3 | 5000 | TCP/protobuf |
| Bridge HTTP (VM) | 192.168.64.3 | 8888 | HTTP/JSON |
| SSH (VM) | 192.168.64.3 | 22 | SSH (key: ~/.ssh/df-vm) |
| DFHack RPC (HomeServer) | 192.168.4.194 | 5000 | TCP/protobuf |
| Bridge HTTP (HomeServer) | 192.168.4.194 | 8888 | HTTP/JSON |
| PostgreSQL | localhost | 5432 | TCP (db=chronicler) |

---

## World Data (Current)

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

---

## Workflow 1: Start Bridge Pipeline

Deploy the Lua bridge to the VM, start it as a DFHack repeat job, and verify
the HTTP JSON endpoint is serving data.

### Prerequisites
- VM running (`/vm` shows "started")
- DF + DFHack running in fortress mode
- SSH accessible

### Steps

1. **Verify DF is running in fortress mode**:
   ```python
   from chronicler.dfhack.client import DFHackClient
   client = DFHackClient("192.168.64.3", 5000)
   client.connect()
   info = client.get_world_info()
   assert info['mode'] == 'MODE_DWARF', f"Expected fortress mode, got {info['mode']}"
   ```

2. **Deploy bridge Lua script to VM**:
   ```bash
   VM_IP=$(/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh ip)
   scp -i ~/.ssh/df-vm \
     /Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/chronicler-bridge.lua \
     "Jarvis@${VM_IP}:C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/hack/scripts/"
   ```

3. **Start bridge repeat job via RPC**:
   ```python
   result = client.run_command('lua', 'dfhack.run_script("chronicler-bridge")')
   ```
   Or via SSH:
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh ssh \
     "dfhack-run chronicler-bridge"
   ```

4. **Verify bridge HTTP endpoint**:
   ```bash
   curl -sf "http://${VM_IP}:8888/game_time" | python3 -m json.tool
   ```
   Expected: JSON with `cur_year`, `cur_year_tick`, `fortress_age`.

5. **Check all 7 bridge data domains**:
   ```bash
   for endpoint in game_time units fortress creature_raws populations weather military; do
     echo -n "$endpoint: "
     curl -sf "http://${VM_IP}:8888/${endpoint}" | python3 -c \
       "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} items' if isinstance(d,list) else 'OK')" \
       2>/dev/null || echo "FAILED"
   done
   ```

### Verification
- All 7 endpoints return valid JSON
- `game_time` shows correct year/tick
- `units` count matches `/df units` RPC count

---

## Workflow 2: Start Live Watcher

Start the Chronicler watcher that continuously polls DFHack RPC and bridge
endpoints, detects changes, and writes to PostgreSQL.

### Prerequisites
- Bridge pipeline running (Workflow 1)
- PostgreSQL accessible
- Game unpaused (for time advancement)

### Steps

1. **Verify bridge is healthy**:
   ```bash
   VM_IP=$(/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh ip)
   curl -sf "http://${VM_IP}:8888/game_time" >/dev/null && echo "Bridge OK" || echo "Bridge DOWN"
   ```

2. **Start watcher**:
   ```bash
   /Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler watch \
     --bridge-host ${VM_IP} --rpc-host ${VM_IP} --rpc-port 5000
   ```
   Runs in foreground. Use `&` or a tmux pane for background.

3. **Monitor watcher output** — look for:
   - `Cycle N complete` — successful polling cycle
   - `Detected N changes` — new/modified data
   - `Wrote N rows to sync_snapshots` — PostgreSQL writes
   - `Bridge section X: N items` — bridge data consumption

4. **Verify DB writes**:
   ```sql
   SELECT COUNT(*) FROM sync_snapshots;
   SELECT COUNT(*) FROM lua_probes;
   SELECT MAX(created_at) FROM sync_snapshots;
   ```

### Graceful Shutdown
Send SIGTERM or SIGINT (Ctrl+C). The watcher handles both cleanly.

---

## Workflow 3: Ingest Legends XML

Parse and load Dwarf Fortress legends XML exports into the PostgreSQL CDM schema.

### Available Legends Files

| World | Period | Files | Location |
|-------|--------|-------|----------|
| region1 (Namoram) | Year 100 | legends + legends_plus | `data/legends/` |
| region2 (Namoram) | Year 309 | legends + legends_plus | `data/legends/` |
| region30 (Namoram) | Year 200 | legends + legends_plus | `data/legends/` |
| region1 (Land of Dawning) | Pre-embark (250-01-01) | legends + legends_plus | `data/legends/region1-pre-embark/` |
| region1 (Land of Dawning) | Post-embark (250-01-15) | legends + legends_plus | `data/legends/region1-post-embark/` |

### Steps

1. **Pull legends XML from VM** (if not already local):
   ```bash
   VM_IP=$(/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh ip)
   mkdir -p /Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-pre-embark
   scp -i ~/.ssh/df-vm \
     "Jarvis@${VM_IP}:\"C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/region1-00250-01-01-legends.xml\"" \
     /Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-pre-embark/
   scp -i ~/.ssh/df-vm \
     "Jarvis@${VM_IP}:\"C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/region1-00250-01-01-legends_plus.xml\"" \
     /Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-pre-embark/
   ```

2. **Ingest into PostgreSQL**:
   ```bash
   /Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler ingest \
     /Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/region1-pre-embark/region1-00250-01-01-legends.xml \
     --db chronicler
   ```

3. **Validate ingestion counts**:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM historical_figures) AS hf_count,
     (SELECT COUNT(*) FROM historical_events) AS event_count,
     (SELECT COUNT(*) FROM entities) AS entity_count,
     (SELECT COUNT(*) FROM sites) AS site_count,
     (SELECT COUNT(*) FROM regions) AS region_count,
     (SELECT COUNT(*) FROM artifacts) AS artifact_count;
   ```

4. **Verify world record**:
   ```sql
   SELECT world_id, name, alternate_name FROM worlds;
   ```

### Post-Ingestion Checks
- No orphaned foreign keys
- Event counts match XML `<historical_events>` element count
- HF count matches legends_plus `<historical_figures>` count

---

## Workflow 4: Compare Legends Snapshots

Diff pre-embark and post-embark legends to identify new events, entities,
and world-state changes that occurred during the embark period.

### Steps

1. **Count elements in each XML**:
   ```bash
   LEGENDS_DIR="/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends"
   for period in region1-pre-embark region1-post-embark; do
     echo "=== $period ==="
     for tag in historical_event historical_figure entity site artifact; do
       count=$(grep -c "<${tag}>" "$LEGENDS_DIR/$period/"*legends.xml 2>/dev/null || echo 0)
       echo "  $tag: $count"
     done
   done
   ```

2. **Identify new events** (post-embark minus pre-embark):
   ```python
   import xml.etree.ElementTree as ET

   pre = ET.parse('.../region1-pre-embark/region1-00250-01-01-legends.xml')
   post = ET.parse('.../region1-post-embark/autosave_1-00250-01-15-legends.xml')

   pre_ids = {e.find('id').text for e in pre.findall('.//historical_event')}
   post_ids = {e.find('id').text for e in post.findall('.//historical_event')}
   new_ids = post_ids - pre_ids
   print(f"New events since embark: {len(new_ids)}")
   ```

3. **Classify new events by type**:
   ```python
   new_events = [e for e in post.findall('.//historical_event')
                 if e.find('id').text in new_ids]
   from collections import Counter
   types = Counter(e.find('type').text for e in new_events)
   for t, c in types.most_common():
       print(f"  {t}: {c}")
   ```

4. **Check for new historical figures** (births, arrivals):
   ```python
   pre_hf = {e.find('id').text for e in pre.findall('.//historical_figure')}
   post_hf = {e.find('id').text for e in post.findall('.//historical_figure')}
   new_hf = post_hf - pre_hf
   print(f"New historical figures since embark: {len(new_hf)}")
   ```

### Use Cases
- Track fortress events (constructions, deaths, mood changes)
- Identify new arrivals (migrant waves, visitors)
- Detect world events that happened concurrently (wars, beast attacks)

---

## Workflow 5: Full Deploy Cycle

Complete pipeline setup: push scripts, start bridge, verify, start watcher.
This is the standard startup sequence for a Chronicler data gathering session.

### Steps

1. **Boot VM** (if not running):
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh start
   ```

2. **Verify DF + DFHack running**:
   ```python
   from chronicler.dfhack.client import DFHackClient
   client = DFHackClient("192.168.64.3", 5000)
   client.connect()
   ver = client.get_version()
   info = client.get_world_info()
   units = client.list_units()
   print(f"DFHack {ver} | {info['mode']} | {info.get('world_english', '?')} | {len(units)} units")
   ```

3. **Deploy bridge** (Workflow 1, steps 2-5)

4. **Start watcher** (Workflow 2, steps 2-3)

5. **Unpause game** to let time advance:
   ```python
   client.run_command('lua', 'df.global.pause_state = false')
   ```

6. **Monitor**: Watch for cycles completing, data flowing to PostgreSQL.

---

## Workflow 6: VM Snapshot Management

Create and restore named snapshots for safe experimentation.

### Steps

1. **Pause game and save**:
   ```python
   client.run_command('lua', 'df.global.pause_state = true')
   client.run_command('quicksave', '')
   ```

2. **Stop VM** (snapshots require stopped VM):
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh stop
   ```

3. **Create snapshot**:
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh snapshot "pre-experiment-name"
   ```

4. **Start VM and continue**:
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh start
   ```

5. **Restore** (if experiment fails):
   ```bash
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh stop
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh restore "pre-experiment-name"
   /Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-lifecycle.sh start
   ```

---

## Workflow 7: Performance Profiling

Measure DF and pipeline performance for capacity planning.

### Steps

1. **DFHack RPC latency**:
   ```python
   import time
   times = []
   for _ in range(10):
       t0 = time.time()
       client.get_version()
       times.append(time.time() - t0)
   print(f"GetVersion: {sum(times)/len(times)*1000:.1f}ms avg")
   ```

2. **ListUnits latency**:
   ```python
   t0 = time.time()
   units = client.list_units()
   elapsed = time.time() - t0
   print(f"ListUnits ({len(units)} units): {elapsed*1000:.0f}ms")
   ```

3. **DF framerate** (via Lua):
   ```python
   result = client.run_command('lua', 'print(df.global.enabler.fps)')
   ```

4. **Bridge freshness**:
   ```bash
   curl -sf "http://${VM_IP}:8888/game_time" | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   print(f'Game: year {d[\"cur_year\"]}, tick {d[\"cur_year_tick\"]}')
   "
   ```

5. **Watcher cycle time**: Look for `Cycle N complete in Xs` in watcher output.

### Performance Baselines (VM — 2026-02-24)

| Metric | Value |
|--------|-------|
| GetVersion (10x avg) | 0.3ms |
| ListUnits (70 units) | 89ms |
| PowerShell startup (Prism) | ~10s |
| SSH connection | <1s |
| Bridge HTTP response | <100ms |

---

## Gotchas and Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| DFHack RPC timeout | DF not running or paused during worldgen | Ensure DF is in fortress mode |
| Bridge returns empty JSON | Bridge repeat job not started | Run `chronicler-bridge` script in DFHack |
| `utmctl exec` no output | Fire-and-forget design | Use `exec-capture` or `exec-ps` from vm-lifecycle.sh |
| `utmctl file pull` silent fail | Returns exit 0 on error | Check output content, not `$?` |
| Snapshot fails | VM must be stopped first | `/vm stop` before snapshot |
| SSH key rejected | Bootstrap not run or key mismatch | `/vm bootstrap` |
| Watcher no changes | Game is paused | `/df unpause` |
| PowerShell slow on VM | Prism x86-64 emulation overhead | Use poll-with-marker pattern, not fixed sleep |
| `disconnect` error on client | Method is `close()` not `disconnect()` | Use `client.close()` |
| Path escaping in utmctl | Needs double-backslash in bash | `"C:\\\\Windows\\\\Temp\\\\file.txt"` |
| VM disk UUID changes | Recreating VM changes UUID | Use `vm-config.sh` auto-detection (glob `*.qcow2`) |

---

## Related Resources

- `/vm` command: `/Users/nathanielcannon/Claude/Jarvis/.claude/commands/vm.md`
- `/df` command: `/Users/nathanielcannon/Claude/Jarvis/.claude/commands/df.md`
- VM scripts: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`
- DFHack client: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py`
- Bridge script: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/chronicler-bridge.lua`
- CDM schema: PostgreSQL `chronicler` database
- DF reference repos: `/Users/nathanielcannon/Claude/GitRepos/{df-structures,dfhack-client-python,weblegends}/`
- VM Operations Runbook: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/docs/vm-operations-runbook.md`
- DF/DFHack Runbook: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/docs/df-dfhack-runbook.md`
