# Girderpriced Fortress Management Plan v2

**Date**: 2026-03-22 (Session 46)
**Fortress**: Girderpriced (site 2212), Orid Zurko (world_id=3→1 after re-ingest)
**Starting state**: Y250, 15th Granite (Early Spring), PAUSED, fresh save load
**Objective**: Play until all residents perish. No Armok Mode. Do not end play session until there are NO survivors.
**Data pipeline**: Bridge v10 → file_writer → live_etl → Legends Tables

---

## 1. Rules of Engagement

- **No Armok Mode**: No `createitem`, `createunit`, `full-heal -r`, `exterminate`, `reveal`, `force`, or any command that directly cheats units, terrain, items, or spawns.
- **Allowed DFHack**: Quickfort, autolabor, autofarm, autochop, seedwatch, tailor, buildingplan, timestream, quantum stockpiles, `orders import`, direct Lua for assignments/designations/structure creation.
- **Allowed control surface**: Pause/unpause, step, speed control, noble appointments, squad creation, labor toggling, workorders, building placement — all via programmatic Lua.
- **Data pipeline**: Every watcher cycle writes bridge data → on-disk JSON → Legends Tables.
- **End condition**: ALL fortress residents (citizens + residents) dead.

---

## 2. Immediate Priorities (Day 1, 15th Granite)

### 2A. Critical Infrastructure (First 100 Game-Days)

**LESSON FROM PREVIOUS ATTEMPT**: 11 dwarves died of starvation/dehydration within 3 seasons because food/drink infrastructure was not established immediately. The Still is the #1 priority.

#### Priority order:
1. **Dig stairwell** down from surface to z=132 (stone layer)
2. **Build a Still** (Quickfort `ws`) — brewing is the ONLY reliable drink source
3. **Place underground farm plots** at soil layer or muddy stone
4. **Enable autofarm + seedwatch** — prevents crop/seed depletion
5. **Build Carpenter workshop** (`wc`) — for beds, barrels, bins
6. **Build Mason workshop** (`wm`) — for doors, tables, chairs
7. **Import `library/basic` orders** — 45 essential production orders including brewing
8. **Place food + drink stockpiles** (`f`, `w`)
9. **Appoint Manager** — without one, workorders are never validated
10. **Build a Kitchen** (`wk`) — prepared meals from raw ingredients

### 2B. Quickfort Commands (Verified Working)

```lua
local quickfort = reqscript('quickfort')

-- Dig stairwell: 3x3 down-stairs at (93,92,z) for z=134 to 130
quickfort.apply_blueprint{mode='dig', data='j(3x3)', pos={x=93, y=92, z=134}}

-- Underground room at z=132 (10x10)
quickfort.apply_blueprint{mode='dig', data='d(10x10)', pos={x=88, y=88, z=132}}

-- Workshops (3x3 each)
quickfort.apply_blueprint{mode='build', data='ws', pos={x=88, y=88, z=132}}  -- Still
quickfort.apply_blueprint{mode='build', data='wc', pos={x=92, y=88, z=132}}  -- Carpenter
quickfort.apply_blueprint{mode='build', data='wm', pos={x=96, y=88, z=132}}  -- Mason
quickfort.apply_blueprint{mode='build', data='wk', pos={x=88, y=92, z=132}}  -- Kitchen

-- Farm plots (underground, 5x5)
quickfort.apply_blueprint{mode='build', data='p(5x5)', pos={x=92, y=92, z=132}}

-- Stockpiles on surface
quickfort.apply_blueprint{mode='place', data='f(5x5)', pos={x=90, y=90, z=134}}  -- Food
quickfort.apply_blueprint{mode='place', data='w(5x5)', pos={x=96, y=90, z=134}}  -- Wood
```

### 2C. Noble Appointments (Lua)

```lua
-- Find assignment for MANAGER position and appoint best candidate
local site_gov = df.global.plotinfo.main.fortress_entity
for _, a in ipairs(site_gov.positions.assignments) do
    for _, p in ipairs(site_gov.positions.own) do
        if p.id == a.position_id and p.code == "MANAGER" then
            -- Find a citizen to appoint
            for _, u in ipairs(df.global.world.units.active) do
                if dfhack.units.isCitizen(u) and dfhack.units.isAlive(u) then
                    a.histfig = u.hist_figure_id
                    break
                end
            end
        end
    end
end
```

Repeat for: BOOKKEEPER, BROKER, CHIEF_MEDICAL_DWARF

---

## 3. Fortress Layout Design

### Surface Level (z=134)
```
┌─────────────────────────────────────────┐
│  [Wagon area]     [Meeting Zone 7x7]    │
│  [Wood SP]  [Food SP]  [Stone SP]       │
│  [Surface Farm 5x5]  [Gather Zone]      │
│  [Trade Depot 5x5]                      │
│        ↓ Stairwell (3x3)               │
└─────────────────────────────────────────┘
```

### Underground Level 1 — Industry (z=132)
```
┌─────────────────────────────────────────┐
│  [Still]  [Kitchen]  [Carpenter]        │
│  [Mason]  [Craftsdwarf]  [Metalsmith]   │
│  [Farm 5x5]  [Farm 5x5]  [Farm 5x5]    │
│  [Food SP]  [Drink SP]  [Furniture SP]  │
│  [Refuse SP]  [Stone SP]  [Gem SP]      │
│        ↕ Stairwell                      │
└─────────────────────────────────────────┘
```

### Underground Level 2 — Living (z=131)
```
┌─────────────────────────────────────────┐
│  [Bedroom 1x3] [Bedroom 1x3] ... ×15   │
│  [Dining Hall 7x7 + tables/chairs]      │
│  [Meeting Hall / Tavern]                │
│  [Hospital Zone + chest + bed]          │
│        ↕ Stairwell                      │
└─────────────────────────────────────────┘
```

### Underground Level 3 — Military & Storage (z=130)
```
┌─────────────────────────────────────────┐
│  [Barracks / Training Zone]             │
│  [Weapon + Armor stockpiles]            │
│  [Weapon/Armor smith workshops]         │
│  [Smelter + Wood Furnace]               │
│  [Forge area for metalwork]             │
└─────────────────────────────────────────┘
```

---

## 4. Industry Workflows

### 4A. Food & Drink Pipeline

| Resource | Source | Workshop | Product | Storage |
|----------|--------|----------|---------|---------|
| Plump helmets | Underground farm | Still | Dwarven wine | Drink barrel |
| Plump helmets | Underground farm | Kitchen | Prepared meal | Food barrel |
| Pig tail | Underground farm | Still | Dwarven ale | Drink barrel |
| Cave wheat | Underground farm | Still + Quern | Flour → Biscuits | Food barrel |
| Surface crops | Surface farm | Kitchen | Prepared meal | Food barrel |

**Key orders** (from `library/basic`):
- Brew drink (perpetual)
- Prepare easy meal (perpetual)
- Process plants (as needed)

**Automation**:
```
dfhack-run enable autofarm
dfhack-run autofarm default 30
dfhack-run autofarm threshold 200 MUSHROOM_HELMET_PLUMP
dfhack-run enable seedwatch
```

### 4B. Furniture Pipeline

| Material | Workshop | Products |
|----------|----------|----------|
| Stone | Mason | Tables, chairs, doors, coffers, statues |
| Wood | Carpenter | Beds, bins, barrels, buckets, crutches |
| Metal | Metalsmith | Chains, cages (for traps) |

**Standing orders**:
```
dfhack-run workorder ConstructBed 10
dfhack-run workorder ConstructDoor 10
dfhack-run workorder ConstructTable 10
dfhack-run workorder ConstructChair 10
dfhack-run workorder MakeCharcoal 10
```

### 4C. Clothing Pipeline

```
dfhack-run enable tailor
```
Tailor plugin auto-manages clothing orders. Needs: Clothier workshop (`wo`), Loom (`wL`), and thread/cloth stockpile.

### 4D. Weapons & Armor Pipeline

1. Mine ores (magnetite, hematite, etc.)
2. **Smelter** (`es`): Smelt ore → metal bars
3. **Metalsmith Forge** (`wf`): Forge weapons + armor
4. **Wood Furnace** (`ew`): Make charcoal (fuel for smelting)

```
dfhack-run orders import library/smelting
dfhack-run orders import library/military
```

---

## 5. Trade System

### 5A. Setup

1. **Build Trade Depot** (surface, accessible from map edge):
   ```lua
   quickfort.apply_blueprint{mode='build', data='D', pos={x=75, y=88, z=134}}
   ```
   Requires 3-wide clear path from depot to map edge.

2. **Appoint Broker** (noble with Appraisal skill):
   ```lua
   -- Set BROKER position to a citizen
   -- (Same pattern as Manager appointment above)
   ```

### 5B. Trading When Caravans Arrive

Caravan detection via bridge `announcements` section or game events.

```lua
-- Check for active caravans
local caravan_count = 0
for _, e in ipairs(df.global.world.entities.all) do
    if e.flags.trader then caravan_count = caravan_count + 1 end
end
```

Trade commands (DFHack):
```
dfhack-run caravan list        -- show active caravans
dfhack-run caravan extend 14   -- extend stay by 14 days
dfhack-run caravan happy       -- restore willingness to trade
```

Mark items for trade (Lua):
```lua
local depot = nil
for _, b in ipairs(df.global.world.buildings.all) do
    if b:getType() == df.building_type.TradeDepot then depot = b break end
end
-- Items near depot auto-hauled for trade if marked
```

### 5C. Trade Priorities

| Import Priority | Export Priority |
|----------------|----------------|
| Steel bars / weapons | Crafts (stone/bone) |
| Leather / cloth | Prepared meals (excess) |
| Seeds (rare crops) | Cut gems |
| Anvil (if lost) | Mugs / goblets |

---

## 6. Military & Defense

### 6A. Squad Creation

```lua
-- Find militia commander assignment
local site_gov = df.global.plotinfo.main.fortress_entity
local mc_assign = nil
for _, a in ipairs(site_gov.positions.assignments) do
    for _, p in ipairs(site_gov.positions.own) do
        if p.id == a.position_id and p.code == "MILITIA_COMMANDER" then
            mc_assign = a
            break
        end
    end
    if mc_assign then break end
end

-- Create squad
local squad = dfhack.military.makeSquad(mc_assign.id)
squad.alias = "Iron Guard"

-- Assign soldiers (find best combat-skilled citizens)
local soldiers = {}
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and dfhack.units.isAlive(u) then
        table.insert(soldiers, u)
    end
end
-- Sort by combat skills, assign top N to squad positions 0-9
for i, u in ipairs(soldiers) do
    if i > 10 then break end
    dfhack.military.addToSquad(u.id, squad.id, i - 1)
end
```

### 6B. Invasion Response

When invasion detected (via bridge `armies` section or `onInvasion` eventful callback):

1. **Pause game**
2. **Assess threat**: Count invaders, classify by race/equipment
3. **Station squad**: Move to defensive position near entrance
4. **Optional**: Raise bridge if built as drawbridge defense
5. **Unpause and monitor**: Track combat via announcements/events

```lua
-- Burrow all civilians to safe area
dfhack.run_command('burrow', 'units', 'set', 'Safe', 'Citizens')

-- Station military at entrance
-- (Squad orders via military screen — may need direct struct manipulation)
```

### 6C. Fortification Design

- **Entrance**: 3-wide corridor with cage traps (`Tc`) + weapon traps (`Tw`)
- **Drawbridge**: Retractable bridge (`gx`) connected to lever (`Tl`) at entrance
- **Fortifications**: Carved (`CF`) for archer positions overlooking entrance
- **Burrow**: Civilian retreat burrow for invasion lockdown

---

## 7. Data Pipeline Integration

### 7A. Watcher Configuration

```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron
.venv/bin/chronicler watch --world-id 1 --interval 30
```

Every 30 seconds:
1. Bridge collects 26 sections from game memory
2. Watcher fetches via SSH+JSON
3. `file_writer.write_bridge_to_disk()` → 27 JSON files
4. `live_etl.run_live_etl()` → 11 sync functions → Legends Tables
5. Existing ETL (ingest_expanded, state_capture, embedding) also runs

### 7B. Verification Checkpoints

Every 5 game-years (or ~3 real-time cycles):
```sql
-- Verify live data flowing to Legends Tables
SELECT source, COUNT(*) FROM history_events WHERE world_id = 1 GROUP BY source;
-- Should show source='live' rows increasing

-- Verify HF updates
SELECT id, name, unit_id, death_year, details->>'live_stress'
FROM historical_figures
WHERE world_id = 1 AND unit_id IS NOT NULL
LIMIT 5;

-- Verify site details updated
SELECT id, details->>'fortress_state' IS NOT NULL as has_state
FROM sites WHERE world_id = 1 AND details->>'fortress_state' IS NOT NULL;
```

### 7C. Game Control Loop

```
REPEAT:
  1. PAUSE — assess situation
  2. CHECK bridge data — food, drink, population, threats
  3. DECIDE — what needs doing (dig, build, assign, defend?)
  4. EXECUTE — Quickfort, Lua commands, orders
  5. UNPAUSE — let game advance (timestream for speed if safe)
  6. WAIT — 30-60 seconds for watcher cycle
  7. CHECK data pipeline — verify live_etl summary
  8. GOTO 1
```

---

## 8. Speed & Latency Management

### Approach: Burst-then-observe

1. **Setup phase** (Y250 Spring): PAUSED. Issue all designations, build orders, appointments. No time advancement.
2. **Burst phase**: `timestream set fps 100`, unpause for 1-2 seasons.
3. **Observe phase**: Pause, collect full bridge data, assess state.
4. **React phase**: Issue corrections (labor changes, new buildings, military orders).
5. **Repeat**: Burst → Observe → React cycle.

### Speed settings:
```
dfhack-run enable timestream
dfhack-run timestream set fps 100   -- Fast but not too fast for data capture
dfhack-run timestream set fps 50    -- Slower for careful observation
dfhack-run timestream set fps 500   -- Maximum speed (use sparingly)
```

### Popup dismissal (essential for unattended running):
```lua
-- Universal "unblock game" function
local ps=df.global.world.status.popups
while #ps>0 do ps:erase(0) end
df.global.world.status.display_timer=0
for i=1,10 do
    local f=dfhack.gui.getCurFocus(true)
    if f[1]=="dwarfmode/Default" then break end
    dfhack.screen._doSimulateInput(
        dfhack.gui.getCurViewscreen(),
        {df.interface_key.LEAVESCREEN})
end
df.global.pause_state=false
```

---

## 9. Survival Strategy

### Phase 1: Establish (Y250 Spring-Summer)
- Dig underground, build workshops, plant farms, brew drink
- Goal: self-sustaining food/drink by end of Summer

### Phase 2: Fortify (Y250 Autumn-Winter)
- Build trade depot, catch autumn caravan
- Dig deeper, build bedrooms, dining hall
- Start military training

### Phase 3: Industrialize (Y251+)
- Full metalworking pipeline (ore → bars → weapons/armor)
- Hospital, temple, library (citizen happiness)
- Expand military

### Phase 4: Endure (Y252+)
- Defend against sieges
- Manage population through migrants
- Track every death via live_etl pipeline

### Phase 5: The End
- When threats overwhelm defenses: document everything
- Record the death of every citizen via death_sync
- Final fortress state captured in sites.details

---

## 10. Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Starvation (experienced before!) | Still + autofarm + seedwatch on Day 1 |
| FPS death under timestream | Never set fps to 0; keep ≤500 |
| Necromancer citizens raising corpses | Monitor refuse stockpile; wall off graveyard |
| Aquifer | Check z=132 for aquifer tiles before digging |
| SSH timeout during fast sim | Retry with exponential backoff |
| Popup blocking game loop | Universal unblock function before every unpause |
| Data pipeline hang | Verify watcher cycle count every 5 min |

---

## 11. World ID Tracking Note

**Current**: `world_id=1` hardcoded in watcher and CLI defaults.

**Future requirement**: When multiple worlds exist in the DB, need:
- Auto-detect world from bridge `world_info.world_name`
- Match against `worlds.name` in DB
- Pass resolved world_id through entire pipeline
- Add `--auto-world` flag to `chronicler watch` that does this lookup

This is tracked as a future enhancement, not blocking current gameplay.

---

*Girderpriced Fortress Management Plan v2*
*Prepared for autonomous gameplay session — Y250 Spring to fortress death*
