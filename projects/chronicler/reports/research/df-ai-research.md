# Research Report: df-ai Architecture and Chronicler Integration Patterns

**Date**: 2026-02-23
**Scope**: Complete source-level analysis of the df-ai C++ DFHack plugin for Dwarf Fortress autonomous play. Repository at `/Users/nathanielcannon/Claude/GitRepos/df-ai/`. All major source files read and analyzed.

---

## Executive Summary

df-ai is a DFHack plugin written in C++ that plays Dwarf Fortress completely autonomously — managing everything from initial embark site selection through full fortress lifecycle including construction, population, military, economy, and end-game. It achieves this through a layered tick-based event loop combined with an "Exclusive Callback" coroutine system that drives multi-step UI interactions (navigating the game's screens by simulating keypresses).

The architecture is fundamentally **reactive and polling-based**, not goal-based or planner-based. Five main subsystems (`Population`, `Plan`, `Stocks`, `Camera`, `Trade`) register timer callbacks that fire at different intervals, each scanning the game state and taking the smallest sufficient corrective action. There is no explicit goal tree or planner; the system relies on overlapping invariant-maintenance loops that collectively steer the fortress.

For Chronicler's Python/LLM-based fortress management assistant, df-ai is a gold mine of domain knowledge: it encodes every major decision a competent DF player makes, in explicit deterministic logic. The key transferable patterns are: the tick-period update schedule, the stock threshold model, the room type taxonomy, the task queue with exclusive context model, and the priority sequencing of construction phases.

---

## Key Findings

### 1. Overall Architecture: Tick-Based Reactive Loop with Exclusive Coroutines

**File**: `/Users/nathanielcannon/Claude/GitRepos/df-ai/ai.h`, `ai.cpp`, `event_manager.h`, `event_manager.cpp`

The top-level `AI` class owns five major subsystems as direct member objects:
```cpp
class AI {
    Population pop;
    Plan plan;
    Stocks stocks;
    Camera camera;
    Trade trade;
    OnupdateCallback *pause_onupdate;
    OnupdateCallback *tag_enemies_onupdate;
    OnupdateCallback *announcements_onupdate;
};
```

All coordination flows through a singleton `EventManager events` that maintains two lists:
- `onupdate_list`: callbacks that fire at scheduled tick intervals (e.g., every 25 ticks, every 240 ticks)
- `onstatechange_list`: callbacks that fire on game state events (world load/unload, pause/unpause, viewscreen change)

Additionally, `EventManager` has an **exclusive queue**: at most one `ExclusiveCallback` runs at a time. Exclusive callbacks are coroutines (using Boost.Coroutines2) that hold control of the UI for multi-step interactions — navigating menus, entering text, scrolling lists. This is how actions like "draft a soldier" or "place a manager order" work: the system pauses all normal callbacks and drives the DF UI directly by injecting interface key events.

**Decision mechanism**: There is no planner or goal tree. The AI makes decisions by:
1. Polling game state on every tick period
2. Computing desired state vs. current state
3. Queuing actions (as `ExclusiveCallback` objects) to close the gap

**Source**: `ai.cpp:85-105` (startup chain), `event_manager.cpp:517-568` (onupdate dispatch)

---

### 2. Event Manager: Registration and Dispatch

**File**: `/Users/nathanielcannon/Claude/GitRepos/df-ai/event_manager.h`, `event_manager.cpp`

The `EventManager` provides four registration patterns:

```cpp
// Repeating — fires every ticklimit game ticks
OnupdateCallback *onupdate_register(descr, ticklimit, initialtickdelay, callback);

// One-shot — fires once, removed when callback returns true
OnupdateCallback *onupdate_register_once(descr, callback);
OnupdateCallback *onupdate_register_once(descr, ticklimit, callback);
OnupdateCallback *onupdate_register_once(descr, ticklimit, initialtickdelay, callback);

// State change — fires on SC_WORLD_UNLOADED, SC_PAUSED, SC_VIEWSCREEN_CHANGED, etc.
OnstatechangeCallback *onstatechange_register(descr, callback);
OnstatechangeCallback *onstatechange_register_once(descr, callback);
```

Tick limits are in DF game ticks. One DF year = 12 months × 28 days × 1200 ticks/day = 403,200 ticks. So "every 25 ticks" fires roughly 16,000 times/year.

The `onupdate` dispatch loop (called from the DFHack hook on every game update) runs sorted by `minyeartick` — earliest-due callback first — and stops when it hits a callback not yet due. This means the list is effectively a priority queue sorted by next-fire-time.

Exclusive callbacks have three entry points:
- `register_exclusive`: install immediately (with optional force flag)
- `queue_exclusive`: enqueue for later (ordered FIFO)
- `each_exclusive<T>`: iterate over current + queued exclusives of a given type

When an exclusive is active, normal `onupdate` callbacks are suspended. Only one exclusive runs at a time, preventing UI conflicts.

**State events observed**: `SC_WORLD_UNLOADED` (auto-disable), `SC_PAUSED`/`SC_UNPAUSED`, `SC_VIEWSCREEN_CHANGED` (detect fort loss/completion screens).

**Source**: `event_manager.h:38-112`, `event_manager.cpp:45-70` (tick check), `event_manager.cpp:517-568` (dispatch)

---

### 3. Decision Making: The Five Subsystems

#### 3a. Population (every 25 ticks, 10-phase rotation)

**File**: `population.cpp`, `population.h`, `population_military.cpp`, `population_nobles.cpp`, `population_justice.cpp`, `population_death.cpp`, `population_pets.cpp`, `population_occupations.cpp`

Population runs a 10-phase round-robin on each update, cycling through:
```
Phase 0: update_trading   — manage broker/caravan/trade
Phase 1: update_citizenlist — track citizenship changes (new arrivals, deaths)
Phase 2: update_nobles     — assign/reassign noble positions
Phase 3: update_jobs       — unsuspend stalled non-repeating jobs
Phase 4: update_military + update_crimes — draft/dismiss soldiers, review crimes
Phase 5: update_pets       — manage pet traits (milkable, shearable, etc.)
Phase 6: update_deads      — handle dead units, slabs
Phase 7: update_caged      — manage caged units
Phase 8: update_locations  — assign workers to tavern/library/temple occupations
Phase 9: emit population event JSON
```

A separate `deathwatch` callback runs every tick to catch newly dead units immediately.

**Citizen tracking**: Sets of integer unit IDs: `citizen`, `military`, `pet`, `visitor`, `resident`. New citizens trigger `plan.new_citizen()` which assigns a bedroom. Deleted citizens trigger `plan.del_citizen()` and `plan.freebedroom()`.

**Source**: `population.cpp:94-140` (update dispatch), `population.cpp:155-270` (citizenlist)

#### 3b. Plan (every 240 ticks)

**File**: `plan.h`, `plan.cpp`, `plan_task.cpp`, `plan_construct.cpp`, `plan_smooth.cpp`, `plan_cistern.cpp`, `plan_priorities.cpp`, `plan_persist.cpp`, `plan_assign.cpp`, `plan_find.cpp`

Plan manages all construction and room lifecycle. It maintains:
- `tasks_generic` and `tasks_furniture`: two separate task queues
- `rooms_and_corridors`: all known rooms
- `priorities`: JSON-driven priority rules that sequence which rooms to dig/construct first

Task types (from `room.h:150-173`):
```
check_construct, check_furnish, check_idle, check_rooms,
construct_activityzone, construct_farmplot, construct_furnace,
construct_stockpile, construct_tradedepot, construct_windmill,
construct_workshop, dig_cistern, dig_garbage, dig_room,
dig_room_immediate, furnish, monitor_cistern, monitor_farm_irrigation,
monitor_room_value, rescue_caged, setup_farmplot, want_dig
```

On each update, Plan processes tasks from both queues in a background scan pattern (`bg_idx_generic`, `bg_idx_furniture`), checking one task per update to avoid frame-rate spikes. Each task has a `last_status` string for diagnostics.

**Construction sequencing**: Rooms start at status `plan`, advance through `dig` → `dug` → `finished`. The Plan watches for completion and advances each room through its lifecycle, constructing workshops/stockpiles/furniture once digging is done.

**Priority system** (`plan_priorities.h`): A vector of `plan_priority_t` structs, each with:
- A filter over room properties (type, status, users, etc.)
- An action (dig, dig_immediate, unignore_furniture, finish, start_ore_search, past_initial_phase, deconstruct_wagons, dig_next_cavern_outpost)

These are loaded from JSON (the `plans/generic01.json` file), allowing custom fort layouts.

**Source**: `plan.cpp:38-93` (constructor, workshop priorities), `plan.h:27-227` (full interface)

#### 3c. Stocks (every 100 ticks)

**File**: `stocks.h`, `stocks.cpp`, `stocks_update.cpp`, `stocks_manager.cpp`, `stocks_farm.cpp`, `stocks_forge.cpp`, `stocks_detect.cpp`, `stocks_find.cpp`, `stocks_queue.cpp`, `stocks_trade.cpp`, `stocks_equipment.cpp`

Stocks tracks approximately 100 named item categories (from `STOCKS_ENUMS` in `stocks.h`) with three data structures:
```cpp
map<stock_item::item, int32_t> count_free;   // available, unowned
map<stock_item::item, int32_t> count_total;  // total including owned
map<stock_item::item, map<int16_t, pair<int32_t,int32_t>>> count_subtype;  // per-subtype breakdown
```

The `Watch` struct defines thresholds:
```cpp
struct Watch {
    map<stock_item::item, int32_t> Needed;        // absolute minimum
    map<stock_item::item, int32_t> NeededPerDwarf; // per 100 dwarves
    map<stock_item::item, int32_t> WatchStock;     // items to monitor
    set<stock_item::item> AlsoCount;               // items to count but not act on
};
```

When stock of a watched item falls below threshold, `act()` is called, which triggers `queue_need()` → `add_manager_order()` → queues a `ManagerOrderExclusive`. The manager order exclusive opens the job management screen and places the order.

**Farm management**: Tracks `farmplots` with biome/season-appropriate crop selection. Distinct plant categories: `drink_plants`, `thread_plants`, `mill_plants`, `bag_plants`, `dye_plants`, `slurry_plants`, `grow_plants`.

**Metal smelting**: `may_forge_bars()` computes available ore → bars conversion, considering current manager orders to avoid over-ordering.

**Source**: `stocks.h:25-337`, `stocks_update.cpp:26-100` (update cycle), `stocks_manager.cpp:25-260` (manager order placement)

#### 3d. Camera (variable period)

**File**: `camera.h`, `camera.cpp`

Manages viewport following (tracks active units for the movie/CMV recording), pause handling, and lockstep mode (hooks the OS timer to run the game at maximum CPU speed for recording CMV demos). Not relevant to Chronicler.

#### 3e. Trade

**File**: `trade.h`, `trade_manager.cpp`, `trade_helpers.cpp`

Full trading cycle managed by `Population::update_trading()` → `perform_trade()` → `PerformTradeExclusive`. The AI:
1. Detects caravan arrival via `ui->caravans`
2. Identifies broker unit by `entity_position_responsibility::TRADE`
3. Requests broker at depot via keystrokes to `BUILDJOB_DEPOT_REQUEST_TRADER` / `BUILDJOB_DEPOT_BRING`
4. Waits for items to arrive at depot (polling `BringItemToDepot` jobs)
5. Opens trade screen (`BUILDJOB_DEPOT_TRADE`)
6. Scans trader items, applies `want_trader_item()` to decide what to buy
7. Balances offer ≥ request × 110% (the game's trade ratio)
8. Handles counter-offers iteratively
9. Dismisses broker after trade

Trade value calculation: `item_or_container_price_for_caravan()` in `trade_helpers.cpp`.

**Source**: `trade_manager.cpp:31-722` (full trading logic)

---

### 4. Game State Reading: DFHack Data Access Patterns

**Files**: All `.cpp` files, especially `population.cpp`, `stocks_detect.cpp`, `plan.cpp`

df-ai reads game state through DFHack's C++ bindings which expose DF's in-memory data structures. Key patterns:

**Global state access** (via `REQUIRE_GLOBAL` macros):
```cpp
REQUIRE_GLOBAL(cur_year);
REQUIRE_GLOBAL(cur_year_tick);
REQUIRE_GLOBAL(pause_state);
REQUIRE_GLOBAL(ui);      // fortress UI state, noble positions, squad list
REQUIRE_GLOBAL(world);   // world data: units, items, buildings, jobs, history
```

**Unit iteration**:
```cpp
for (auto u : world->units.active) {
    if (Units::isCitizen(u) && !Units::isBaby(u)) { ... }
}
```

**Item lookup by type** (`items_other_id` categories):
```cpp
for (auto it : world->items.other[items_other_id::IN_PLAY]) { ... }
for (auto it : world->items.other[idx]) { ... }  // typed item lists
```

**Building lookup**: `df::building::find(bld_id)`, `virtual_cast<df::building_tradedepotst>(bld)`

**Historical figures and squads**:
```cpp
df::historical_figure::find(hf_id)
df::squad::find(squad_id)
ui->main.fortress_entity->squads  // all fortress squads
ui->main.fortress_entity->positions.own  // noble positions
```

**Job list scanning**:
```cpp
for (auto j = world->jobs.list.next; j; j = j->next) {
    if (j->item->job_type == job_type::TradeAtDepot) { ... }
}
```

**Map tile queries** (DFHack Maps module):
```cpp
Maps::getTileType(coord)
Maps::getTileWalkable(coord)
df::block_square_event_mineralst  // ore vein scanning
```

**Viewscreen type checking**:
```cpp
strict_virtual_cast<df::viewscreen_dwarfmodest>(Gui::getCurViewscreen(true))
Gui::getFocusString(screen)
```

**Source**: `population.cpp:155-270`, `plan_construct.cpp:44-100`, `stocks_detect.cpp`

---

### 5. AI Subsystems Taxonomy

Complete subsystem inventory:

| Subsystem | File(s) | Update Frequency | Scope |
|-----------|---------|-----------------|-------|
| Population | `population.cpp` | Every 25 ticks | Citizens, jobs, unblock suspended tasks |
| Military | `population_military.cpp` | Every 25 ticks (phase 4) | Draft/dismiss, squads, attack orders |
| Nobles | `population_nobles.cpp` | Every 25 ticks (phase 2) | Assign broker, manager, bookkeeper, mayor, sheriff |
| Trading | `trade_manager.cpp` | Every 25 ticks (phase 0) | Caravan detection, broker routing, trade execution |
| Pets | `population_pets.cpp` | Every 25 ticks (phase 5) | Pasture assignment, milking/shearing scheduling |
| Justice | `population_justice.cpp` | Every 25 ticks (phase 4) | Crime detection, punishment |
| Occupations | `population_occupations.cpp` | Every 25 ticks (phase 8) | Tavern keeper, performer, scholar assignment |
| Construction Plan | `plan.cpp` | Every 240 ticks | Dig rooms, build structures, furnish |
| Cistern | `plan_cistern.cpp` | Every 240 ticks | Water supply construction |
| Room smoothing | `plan_smooth.cpp` | As needed | Stone smoothing, engraving |
| Stockpile mgmt | `stocks.cpp` | Every 100 ticks | Count items, queue production orders |
| Farm management | `stocks_farm.cpp` | Every 100 ticks | Crop selection, farm season rotation |
| Metalwork | `stocks_forge.cpp` | Every 100 ticks | Ore smelting, bar forging, equipment production |
| Equipment | `stocks_equipment.cpp` | Every 100 ticks | Weapons, armor, tools |
| Embark | `embark.cpp` | Once (setup) | Site selection, initial party |
| Blueprint setup | `plan_setup.cpp` | Once | Translate JSON blueprint to room layout |

---

### 6. Room and Building Management

**Files**: `room.h`, `plan.h`, `blueprint.h`, `plan_setup.h`, `plan_setup_blueprint.cpp`

**Room type taxonomy** (complete, from `room.h:35-57`):
```
corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot,
furnace, garbagedump, infirmary, jail, location, nobleroom, outpost,
pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop
```

**Room status progression**: `plan → dig → dug → finished`

Each `room` struct carries:
- `min`/`max` coordinates (bounding box)
- `accesspath`: vector of connected room pointers (corridor graph)
- `layout`: vector of furniture items to place after construction
- `owner`: unit ID (-1 if unowned)
- `squad_id`: for barracks
- `bld_id`: DFHack building ID once constructed
- `users`/`has_users`: occupancy tracking
- `required_value`: for noble rooms that need a minimum room value

**Furniture types** (`layout_type`): archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well.

**Room assignment workflow**:
```
new_citizen(uid)
  → plan.getbedroom(uid)         // assign unused bedroom
  → plan.getdiningroom(uid)      // assign dining hall seat
  → set_owner(room, uid)         // mark ownership in room struct + game building

del_citizen(uid)
  → plan.freebedroom(uid)        // release bedroom
  → plan.freecommonrooms(uid)    // release dining room, etc.
```

**Blueprint system**: The fort layout comes from JSON blueprint files in the `plans/` directory. `PlanSetup` (a one-shot `ExclusiveCallback`) reads these at embark to place all rooms on the map. Blueprint files specify:
- Room types and their minimum/maximum counts
- Tags grouping room types for prioritized placement
- `count_as` (one dormitory room = 39 bedrooms)
- `limits` per room type

**Source**: `room.h:182-264`, `plan.h:104-125` (room assignment), `blueprint.h`, `plan_setup.h`

---

### 7. Military Management

**File**: `population_military.cpp`

Military management runs in `update_military()` every 25 ticks (phase 4). The algorithm:

**Tool confiscation**: Before drafting, scans soldiers holding picks/axes needed for civilian labor (mining, wood cutting). Confiscates and substitutes alternate weapons via `MilitarySetupExclusive::UnequipTool`.

**Draft/dismiss logic**:
```
target_military_size = citizen_count × (military_min%..military_max%)
  where military_min = 25%, military_max = 75% (from config)

If current_soldiers > max_military:
    partial_sort by XP (lowest first)
    queue Dismiss for excess soldiers

If current_soldiers < min_military:
    draft_pool = eligible citizens (no noble position, no mining/woodcutting/hunting labor)
    partial_sort by XP (lowest first for draft)
    queue Draft for needed soldiers
```

**Uniform selection**: Creates "Heavy melee" and "Heavy ranged" uniforms alternating every 3 squads. Full heavy armor: armor + helm + pants + gloves + shoes + shield + appropriate weapon.

**Squad creation**: Squads size at 4/6/8/10 members depending on total military count. Creates new squads via `D_MILITARY_CREATE_SQUAD` keystrokes.

**Attack orders**: `military_random_squad_attack_unit()` scores squads by members available minus current orders, sends the best-scoring squad to kill the target. Attack orders are batched and executed by `MilitarySquadAttackExclusive` which navigates the squads screen.

**Training**: Once a barracks reaches build stage, sets `squad->cur_alert_idx = 1` (training mode).

**Source**: `population_military.cpp:657-902` (update_military), `population_military.cpp:904-1301` (attack ordering)

---

### 8. Resource Management

**File**: `stocks.h`, `stocks.cpp`, `stocks_farm.cpp`, `stocks_forge.cpp`, `stocks_trade.cpp`

**The Watch structure**: Three threshold levels for each of ~100 item types:
- `Needed`: absolute floor; if below this, act immediately
- `NeededPerDwarf`: scales with population (per 100 dwarves)
- `WatchStock`: items to monitor but not necessarily act on

**Production ordering**: `queue_need(item, amount)` → `add_manager_order(template, amount)` → checks existing orders, avoids duplicates within 5 units, queues `ManagerOrderExclusive`.

**Metalworking chain**:
1. `update_simple_metal_ores()`: scan world for metal ores, compute smeltable bars
2. `may_forge_bars()`: returns bars producible from ore for a given material
3. `queue_need_forge()`: decides ore → bars → item production chain
4. Metal preferences from `metal_pref` (material flags like ITEMS_WEAPON, ITEMS_ARMOR)

**Food/agriculture**:
- `update_kitchen()`: marks cookable items in the kitchen
- `farmplot()`: selects crops per season based on biome (underground = underground plants; outdoor = surface plants)
- Separate tracking for drink plants, thread plants, mill plants, bag plants, dye plants

**Tree cutting**: `cuttrees()` uses `tree_list()` (set of tree base coords) to queue wood cutting, maintaining a separate `last_cutpos` to avoid redundant cuts.

**Stockpile management**: `try_construct_stockpile()` configures stockpile categories using the `viewscreen_layer_stockpilest` screen.

**Source**: `stocks.h:147-159` (Watch), `stocks.h:248-336` (full Stocks interface)

---

### 9. Population Management

**File**: `population.cpp`, `population_nobles.cpp`, `population_occupations.cpp`, `population_pets.cpp`

**Immigration handling**: `update_citizenlist()` scans `world->units.active` every 25 ticks, comparing against the known `citizen` set. New dwarves get bedrooms, dining room seats. The system waits for migrant status to clear before drafting migrants into the military.

**Noble assignment** (`update_nobles()`): Uses `AssignNoblesExclusive` to navigate the nobles screen. Assigns:
- Bookkeeper (avoids miners)
- Manager (needs an office)
- Broker (needs to be able to trade)
- Mayor, Sheriff, Captain of the Guard, etc.
- Dismisses nobles from military if they have accounting/management/trading responsibilities

**Noble requirements**: `check_noble_apartments()` ensures nobles have rooms meeting their requirements (`required_value`). Attributes rooms from `attribute_noblerooms()`.

**Job management** (`update_jobs()`): Simply un-suspends all non-repeating suspended jobs each cycle. This prevents production chains from stalling when material availability changes.

**Pet management** (`update_pets()`): Detects pet capabilities (milkable, shearable, trainable, egg-laying, vermin-hunting, grazing). Assigns pets to pastures based on grass availability. Routes pets through `assign_unit_to_zone()` for grazing zones.

**Occupation assignment** (`assign_occupation()`): Places residents (non-citizen travelers) into tavern keeper, performer, scholar roles at locations.

**DF Bug 5551 workaround** (infant/mother reunification): Explicitly creates `SeekInfant` jobs when a baby is separated from a sane, living, idle mother.

**Source**: `population.cpp:155-270` (citizenlist), `population_nobles.cpp:26-100` (noble assignment)

---

### 10. Error Handling

**File**: `ai.cpp`, `debug.h`, `exclusive_callback.h`

df-ai's error handling is pragmatic rather than comprehensive:

**Pause/timeout detection**: `pause_onupdate` monitors `*pause_state`. If paused for more than 10 × fps ticks, calls `timeout_sameview()` which tries `unpause()`. This handles stuck modal dialogs.

**Exclusive screen mismatches**: `ExpectScreen<T>()` in `ExclusiveCallback` asserts that the current viewscreen matches the expected type. On mismatch, the assert fires and the state is logged to `df-ai-debug.log`. `MaybeExpectScreen<T>()` is the non-fatal version.

**Fortress loss detection**: In `EventManager::onstatechange()`, text viewer content is checked for loss messages ("Your strength has been broken", etc.). On match, all event handlers are cleared, state is persisted, and if `random_embark` is enabled, a new embark is queued.

**Manager order stall handling**: In `Stocks::update()`, if the front manager order is stuck in `validated` state on the same job type across two monthly checks, quantities are trimmed by 3 per month to clear the queue.

**CHEAT fallback** in `ManagerOrderExclusive::Run()`: If the search filter returns no matching orders, the first order in the list is force-overwritten with the desired template, logging "[CHEAT]". This ensures production never completely stalls.

**Debug logging**: `ai.debug()` writes to `df-ai.log`. A separate `dfai_debug_log()` opens `df-ai-debug.log` on first call (assertion failures, unexpected states).

**Source**: `ai.cpp:196-260` (timeout_sameview, pause watching), `event_manager.cpp:569-608` (fortress loss detection), `stocks_update.cpp:46-73` (manager stall clearing)

---

### 11. Plan Execution: Multi-Step Construction

**Files**: `plan.cpp`, `plan_task.cpp`, `plan_construct.cpp`, `plan_setup.cpp`

**Blueprint-to-plan pipeline** (runs once at embark):
1. `PlanSetup::Run()` reads JSON blueprints from `plans/` and `rooms/` directories
2. `build_from_blueprint()` iterates blueprint plan, placing room blueprints with random offsets
3. `create_from_blueprint()` converts blueprint room definitions to live `room*` objects
4. Rooms are linked via `accesspath` corridors
5. Priority list loaded from blueprint's `priorities` array

**Construction task lifecycle**:
```
want_dig(room)          → adds task_type::want_dig
  → wantdig → digroom() → adds task_type::dig_room
    → dig_room monitors until tiles are floor/open
      → room status = dug
        → construct_room() → adds construct_* tasks (workshop/stockpile/etc.)
          → once built → furnish_room()
            → try_furnish() per furniture item
```

**Idle detection**: `checkidle()` is called when no tasks are pending. It checks if additional rooms should be dug (more citizens than bedroom capacity, need workshop types, etc.) and activates dormant room plans.

**Vein mining**: `list_map_veins()` scans map blocks for `block_square_event_mineralst` events to find ore deposits. `dig_vein()` routes a shaft to the vein. The Plan tracks `dug_veins` to avoid re-digging.

**Cistern management**: A separate workflow (`plan_cistern.cpp`) manages the water cistern: channels water source → reservoir → well. Uses levers and floodgates. `monitor_cistern()` checks water fill levels.

**Source**: `plan.cpp:111-151` (startup/blueprint load), `plan_task.cpp` (task processing), `plan_setup.cpp` (blueprint→room translation)

---

### 12. Integration Points and APIs

**DFHack APIs used**:
| Module | Usage |
|--------|-------|
| `modules/Gui` | Get/set cursor coords, get current viewscreen, reveal on map |
| `modules/Screen` | Show/dismiss viewscreens |
| `modules/Units` | `isCitizen()`, `isDead()`, `isSane()`, `getNoblePositions()`, `getPosition()` |
| `modules/Buildings` | `constructBuilding()`, building state queries |
| `modules/Maps` | `getTileType()`, `getTileWalkable()`, map block iteration |
| `modules/Job` | `linkIntoWorld()`, `getWorker()` |
| `modules/Materials` | `MaterialInfo`, material property lookup |
| `modules/World` | `ReadWorldFolder()` |

**Key df:: structs accessed**:
- `df::world` → units, items, buildings, jobs, manager_orders, history, crimes
- `df::ui` → follow_unit, caravans, squads, site_id, group_id, main.fortress_entity
- `df::unit` → status, labors, military, inventory, body, health, occupations, relationships
- `df::item` → type, material, quality, stack size
- `df::building` → type, build stage, position
- `df::squad` → positions, orders, schedule, cur_alert_idx
- `df::historical_figure` → unit_id, site links
- `df::manager_order` → job_type, amount_left, material

**Lockstep hook** (`hooks.cpp`): df-ai can hook `GetTickCount`/`gettimeofday`/`SDL_GetTicks` to control simulated time, running the game at maximum CPU speed for CMV recording. This is unrelated to Chronicler but demonstrates deep DFHack integration capability.

---

## Comparison: df-ai Architecture vs. LLM-Based System

| Aspect | df-ai (C++ Rule-Based) | Chronicler LLM Approach |
|--------|----------------------|------------------------|
| Decision source | Deterministic heuristics encoded in C++ | LLM reasoning over game state |
| Latency | Sub-millisecond (in-process) | Seconds per decision |
| Game state access | Direct memory read (`df::world`, `df::unit`, etc.) | DFHack Lua RPC + JSON bridge |
| UI interaction | Simulated keypresses via ExclusiveCallback | Lua script injection via DFHack RPC |
| Planning horizon | Reactive (detect→correct per tick) | Can reason about multi-step plans |
| Adaptability | Fixed rules, limited configurability | Adapts to any situation via reasoning |
| Explainability | Low (implicit in code logic) | High (LLM can narrate decisions) |
| Coverage | Complete (embark to end-game) | Incremental (build as needed) |

---

## Recommendations for Chronicler

### 1. Primary Recommendation: Use df-ai as Domain Knowledge, Not as Code

The df-ai codebase is a comprehensive encyclopedia of DF fortress management heuristics. For Chronicler's LLM assistant, the most valuable use is extracting its decision logic as **system prompt context and structured knowledge**.

Specific recommendations:

**A. Stock thresholds model**: The `Watch` struct's Needed/NeededPerDwarf/WatchStock pattern is directly transferable. Implement the same three-tier threshold model in Chronicler's advisor context. The ~100 stock item categories represent all items an LLM assistant should be able to monitor.

**B. Update schedule**: Mirror df-ai's polling frequencies as advisory cadence:
- Every 25 ticks: population alerts (new arrivals, deaths, nobles needing assignment)
- Every 100 ticks: stockpile status check, production queue review
- Every 240 ticks: construction status, room completion check
- Every 1200 ticks (1 day): full fortress health summary

**C. Room taxonomy**: Use df-ai's room types directly as Chronicler's room vocabulary for construction advice and spatial reasoning. The 22 room types plus 17 stockpile subtypes are well-suited for natural language descriptions.

**D. Task state machine**: Implement `plan→dig→dug→finished` as explicit room states in Chronicler's CDM schema. This enables accurate "what still needs to be done" reporting.

**E. Military proportions**: The 25%–75% min/max military percentage (configurable) is a well-tested heuristic. Chronicler's advisor should use this as the default suggestion range.

### 2. Alternative: Thin Lua Adapter Layer

df-ai's game state reading patterns (iterating `world->units.active`, scanning `world->manager_orders`, etc.) are directly expressible in DFHack Lua. Chronicler can implement equivalent Lua scripts called via RPC to produce JSON snapshots:

```lua
-- Equivalent of df-ai's citizenlist scan
local citizens = {}
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u) then
        table.insert(citizens, {
            id = u.id,
            name = dfhack.TranslateName(u.name),
            job = u.job.current_job and df.job_type[u.job.current_job.job_type] or nil,
            squad_id = u.military.squad_id,
            mood = df.mood_type[u.mood]
        })
    end
end
```

### 3. Exclusive Callback Pattern → LLM Action Chains

df-ai's exclusive callback pattern — one multi-step action at a time, queue others — is directly analogous to how an LLM should execute multi-step actions. Chronicler's action executor should:
- Maintain one active action chain at a time
- Queue pending actions
- Report completion/failure of each step before starting the next

### 4. Action Items
- [ ] Extract df-ai's `Watch.Needed` and `Watch.NeededPerDwarf` default values for each stock item as Chronicler advisor context
- [ ] Map df-ai's room_type enum to Chronicler's CDM room taxonomy, resolving any gaps
- [ ] Implement the 10-phase population update cycle as Chronicler's polling schedule (possibly event-driven from the live polling daemon rather than timer-based)
- [ ] Create Lua equivalents of df-ai's key scan functions: citizenlist scan, stockpile count scan, active military scan, pending construction scan
- [ ] Use df-ai's military draft/dismiss heuristics (25%/75% bounds, XP-based selection) as Chronicler LLM system prompt advisories
- [ ] Study `stocks_farm.cpp` for crop selection logic to advise on farm management
- [ ] Review `plan_priorities.h` filter system as a model for Chronicler's room priority DSL

---

## Sources

All sources are local source files from `/Users/nathanielcannon/Claude/GitRepos/df-ai/`:

1. `ai.h` / `ai.cpp` — Top-level AI class, subsystem wiring, pause/unpause handling
2. `event_manager.h` / `event_manager.cpp` — Tick-based callback system, exclusive queue
3. `exclusive_callback.h` / `exclusive_callback.cpp` — Coroutine-based UI interaction system
4. `population.h` / `population.cpp` — 10-phase population management loop
5. `population_military.cpp` — Squad creation, draft/dismiss, attack ordering
6. `population_nobles.cpp` — Noble position assignment
7. `plan.h` / `plan.cpp` — Construction planning, room lifecycle, task queue
8. `plan_priorities.h` — Priority filter DSL for room sequencing
9. `plan_setup.h` / `plan_setup.cpp` — Blueprint-to-room-graph translation
10. `plan_construct.cpp` — Building/workshop construction logic
11. `stocks.h` / `stocks.cpp` — Item tracking, threshold management
12. `stocks_manager.cpp` — Manager order queue/exclusive
13. `stocks_update.cpp` — Item counting scan
14. `trade_manager.cpp` — Complete trading cycle
15. `room.h` — Room/furniture struct definitions, task type enum
16. `blueprint.h` — Blueprint data model
17. `hooks.cpp` — Lockstep SDL/time hooks
18. `config.h` — Runtime configuration options
19. `plans/generic01.json` — Blueprint plan JSON (room type tags, limits, priorities)
20. `CHANGELOG.md` — Feature history and design decisions

---

## Uncertainties

- The exact Lua equivalents of `df::world` member traversals are not confirmed — they depend on DFHack's Lua bindings, which may differ slightly from the C++ API in naming.
- df-ai's `plans/rooms/` directory (containing individual room blueprint JSON files) was not fully read. These define the spatial layouts of individual rooms and would be needed to implement a blueprint-aware construction advisor.
- The `variable_string.h` system (used for blueprint template variable substitution) was not fully analyzed. It may be relevant if Chronicler wants to generate dynamic room descriptions.
- df-ai's behavior on DF version 53.10 (the current Steam version) is uncertain — the codebase is designed for older DF versions and may not compile/run correctly against 53.10's DFHack bindings.

## Related Topics

- DFHack Lua scripting reference (for implementing Lua equivalents of df-ai's C++ scans)
- Chronicler CDM schema alignment with df-ai's room/stock taxonomies
- dfhack-client-python for RPC-based execution of Lua scan scripts
- DF building/construction APIs available via DFHack 53.10-r1 Lua
