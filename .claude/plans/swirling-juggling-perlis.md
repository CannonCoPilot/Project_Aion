# Bridge-Primary Watcher Architecture

## Context

The Chronicler watcher (`watcher.py`) crashes at startup because `DFHackClient.connect()` fails — DFHack's TCP RPC handshake deadlocks under QEMU/Prism x86 emulation (CoreSuspender mutex issue). This blocks the ENTIRE live data pipeline. The bridge Lua script (running in-process on the DFHack console thread) provides richer data than RPC and works on all platforms. All 36 downstream ETL functions already consume bridge data exclusively. RPC is a legacy dependency for the `units` table only.

**Goal**: Make the bridge the primary and default data transport. RPC becomes an opt-in optimization flag. The watcher must start and run completely hands-free on any platform.

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | Add resolved names (profession, race, english_name), civ_id, labors to `get_units()` | ~15 new lines |
| `DwarfCron/chronicler/dfhack/watcher.py` | Bridge-primary startup; remove default RPC; add `_bridge_units_to_upsert()` adapter; opt-in RPC with reconnect | ~80 lines changed |
| `DwarfCron/chronicler/dfhack/sync.py` | Ensure `upsert_units()` handles bridge-shaped input (minor key mapping) | ~10 lines |
| `DwarfCron/chronicler/cli.py` | Replace `--no-rpc` concept with `--enable-rpc` opt-in flag | ~5 lines |
| `DwarfCron/tests/test_watcher.py` or new test file | Bridge unit adapter tests, startup resilience | ~40 lines |

## Implementation Steps

### Step 1: Enhance Bridge Lua — Add Missing Fields (~15 lines Lua)

In `chronicler-bridge.lua`, within the `get_units()` function, add:

```lua
-- For each unit u in the fortress_units loop:
unit.civ_id = u.civ_id                                           -- was missing
unit.english_name = dfhack.translation.translateName(u.name, true) -- English name
unit.race_name = df.creature_raw.find(u.race).name[0]             -- resolved race
unit.profession_name = dfhack.units.getProfessionName(u)           -- resolved profession
unit.labors = {}                                                   -- labor list
for i = 0, df.unit_labor.HAUL_ANIMALS do
    if u.status.labors[i] then table.insert(unit.labors, i) end
end
```

Also check if `creature_raws` section already has race mappings — if so, reuse that approach.

### Step 2: Refactor Watcher Startup — Bridge-Primary (~50 lines)

**Current** (`watcher.py:405-410`):
```python
client = DFHackClient(DFHACK_HOST, DFHACK_PORT)
client.connect()  # CRASHES if RPC unavailable
```

**New**: Remove RPC from default startup. Probe bridge first.

```python
# Bridge probe (primary transport)
bridge_data = fetch_bridge_data(_bridge_host, _bridge_port)
if bridge_data:
    bridge_available = True
    # ... existing bridge setup code
else:
    log.error("Bridge unavailable at %s:%d — cannot start watcher", ...)
    return  # or raise

# RPC probe (opt-in only, via --enable-rpc flag)
client = None
rpc_available = False
if enable_rpc:
    try:
        client = DFHackClient(DFHACK_HOST, DFHACK_PORT)
        client.connect()
        rpc_available = True
        log.info("RPC connected (opt-in mode)")
    except (ConnectionError, OSError, TimeoutError) as e:
        log.warning("RPC unavailable (%s) — bridge-only mode", e)
```

### Step 3: Bridge Unit Adapter — `_bridge_units_to_upsert()` (~30 lines)

New function in `watcher.py` that converts bridge `fortress_units` to the dict format `upsert_units()` expects:

```python
def _bridge_units_to_upsert(bridge_data: dict, race_map: dict) -> list[dict]:
    """Convert bridge fortress_units → upsert_units() input format."""
    raw = bridge_data.get('unit_summary', {}).get('fortress_units', [])
    units = []
    for bu in raw:
        # Resolve names — use bridge-provided resolved names if available,
        # else fall back to race_map + numeric IDs
        race_name = bu.get('race_name') or race_map.get(bu.get('race', 0), str(bu.get('race', 0)))
        profession = bu.get('profession_name') or str(bu.get('profession', 0))

        details = {
            'english_name': bu.get('english_name'),
            'caste': bu.get('caste'),
            'gender': bu.get('sex'),
            'stress': bu.get('stress'),
            'longterm_stress': bu.get('longterm_stress'),
            'focus': bu.get('focus'),
            'combat_hardened': bu.get('combat_hardened'),
            'mood': bu.get('mood'),
            'has_mood': bu.get('has_mood', False),
            'relationships': bu.get('relationships', {}),
            'cultural_identity': bu.get('cultural_identity'),
            'labors': bu.get('labors', []),
        }

        units.append({
            'id': bu.get('id', 0),
            'name': bu.get('name', ''),
            'race': bu.get('race', 0),
            'race_name': race_name,
            'profession': profession,
            'pos_x': bu.get('pos_x'),
            'pos_y': bu.get('pos_y'),
            'pos_z': bu.get('pos_z'),
            'is_alive': bu.get('is_alive', True),
            'hist_fig_id': bu.get('hist_fig_id') if bu.get('hist_fig_id', -1) != -1 else None,
            'civ_id': bu.get('civ_id') if bu.get('civ_id', -1) != -1 else None,
            'birth_year': bu.get('birth_year'),
            'sex': bu.get('sex'),
            'death_cause': bu.get('death_cause') if bu.get('death_cause', -1) != -1 else None,
            'details': details,
        })
    return units
```

### Step 4: Main Cycle — Use Bridge Units by Default

In the main cycle (line ~541), replace:
```python
# Old: RPC primary, minimal bridge fallback
units = client.list_units(sane=True, skills=True, profession=True)
```

With:
```python
# New: Bridge primary, RPC opt-in
if rpc_available and client:
    try:
        units = client.list_units(sane=True, skills=True, profession=True)
    except (TimeoutError, OSError) as e:
        log.warning("RPC list_units failed: %s — using bridge units", e)
        units = _bridge_units_to_upsert(bd, race_map) if bd else []
else:
    units = _bridge_units_to_upsert(bd, race_map) if bd else []
```

### Step 5: CLI Flag Change

In `cli.py`, add `--enable-rpc` flag (opt-in, default False):
```python
@click.option("--enable-rpc", is_flag=True,
              help="Also connect to DFHack RPC (lower latency for units, requires working TCP port 5000)")
```

Pass through to `watch_loop(... enable_rpc=enable_rpc)`.

### Step 6: Sync.py — Ensure Bridge Compatibility

Review `upsert_units()` to confirm it handles the bridge-shaped dict from Step 3. Key mappings:
- `u.get('details', {}).get('english_name')` — works if details has english_name
- `str(u.get('race_name', u['race']))` — works if race_name is populated
- `u['details']` as JSONB — works if details is a dict

Likely minimal or zero changes needed since the adapter in Step 3 produces the exact expected shape.

### Step 7: Deploy Enhanced Bridge to VM

After modifying the Lua script:
```bash
scp -O -T -i ~/.ssh/df-vm \
  chronicler/dfhack/scripts/chronicler-bridge.lua \
  'Jarvis@192.168.64.3:"C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/hack/scripts/chronicler-bridge.lua"'
```

Then reload: `controller.dfhack_command("kill-lua chronicler-bridge")` + `controller.run_bridge()`

### Step 8: Integration Test — Full Pipeline Validation

1. Start watcher: `chronicler watch --world-id 1 --interval 30`
2. Unpause game with timestream: `controller.unpause()` + `controller.enable_timestream(100)`
3. Wait 2-3 cycles (60-90 seconds)
4. Check DB:
   ```sql
   SELECT count(*) FROM units WHERE world_id = 1;  -- Should be > 0
   SELECT source, count(*) FROM history_events WHERE world_id = 1 GROUP BY source;  -- Should show 'live' rows
   SELECT count(*) FROM fortress_state_snapshots WHERE world_id = 1;  -- Should have snapshots
   ```
5. Verify watcher logs show successful cycle completions with bridge data
6. Run existing tests: `pytest tests/test_watcher.py tests/test_narrative.py tests/test_state_capture.py`

## Verification Checklist

- [ ] Watcher starts without RPC (bridge-only, default mode)
- [ ] Bridge data includes resolved names (race, profession, english_name)
- [ ] Bridge data includes civ_id and labors
- [ ] `units` table populates from bridge data (was 0 rows)
- [ ] All 36 ETL functions continue to work
- [ ] Existing tests pass
- [ ] `--enable-rpc` flag works when RPC is available
- [ ] Watcher handles bridge failure gracefully (clear error, not crash)
- [ ] Full pipeline: bridge → file_writer → live_etl → expanded_etl → state_capture → DB
