# Component Research: AI Dwarf Fortress Player (Fortress Advisor / Autonomous Agent)

**Date**: 2026-02-25
**Component**: Main Component 4 of 6 — AI Dwarf Fortress Player
**Sources**: planning-history.md, df-ai-research.md, dfhack-infrastructure-research.md, dwarven-surveyor-scripts-research.md, narrator-weblegends-research.md, research-synthesis.md

---

## 1. Feature Inventory

This section catalogs every discrete feature identified across all source documents relevant to the AI Player / Fortress Advisor component. Features are organized by subsystem domain, with user benefit, implementation approach, reference source, and complexity rating (S = Small/days, M = Medium/1-2 weeks, L = Large/2-4 weeks, XL = Extra Large/1+ months).

### 1.1 Core Architecture Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-001 | Tick-based multi-rate polling system | Advisor responds at appropriate frequencies for different concerns; population alerts fast (25 ticks), construction checks slower (240 ticks) | Python scheduler mirroring df-ai's `OnupdateCallback` with configurable tick intervals per subsystem. Uses bridge polling data at different cadences. | df-ai `event_manager.cpp`, planning-history §3.4 | M |
| F-002 | Ten-phase population update cycle | Systematic coverage of all population management concerns in round-robin order, preventing any domain from starving | Rotate through 10 phases on each advisor cycle: trading, citizenlist, nobles, jobs, military+crimes, pets, dead, caged, locations, emit JSON | df-ai `population.cpp:94-140`, planning-history §3.4 | M |
| F-003 | Reactive control architecture (invariant maintenance) | Fortress stays stable without explicit goal trees; deviations from desired state are corrected automatically | Five independent invariant-maintenance loops (population, plan, stocks, camera, trade) polling at different rates. "Current state deviates from desired by X → recommended action Y" | df-ai `ai.cpp`, planning-history §3.4 | L |
| F-004 | Exclusive action chain / serial action queue | Prevents conflicting multi-step actions (e.g., two trade negotiations); ensures one complex operation completes before next begins | FIFO action queue; one active action chain at a time; completion/failure reported before starting next. Analogous to df-ai's `ExclusiveCallback` coroutine system | df-ai `exclusive_callback.h`, planning-history §3.4 | M |
| F-005 | Advisor vs. autonomous mode toggle | Users choose between receiving recommendations or having the AI execute actions directly | Configuration flag: `mode: advisor` (recommend only, display in UI) vs `mode: autonomous` (execute via DFHack Lua commands). Advisor mode is safe default; autonomous requires explicit opt-in | planning-history §3.4, df-ai comparison table | M |
| F-006 | Fortress health summary (daily/annual) | Player gets at-a-glance fortress status report | Aggregate all subsystem statuses every 1,200 ticks (1 DF day); comprehensive annual review every 403,200 ticks (1 DF year). Present as structured JSON for LLM narrative or direct UI card | planning-history §3.4, df-ai research | M |
| F-007 | Event-driven reactive alerts | Immediate notification of critical events (death, invasion, mood) without waiting for polling cycle | Subscribe to DFHack `eventful` events: UNIT_DEATH, INVASION, SYNDROME, UNIT_NEW_ACTIVE, ITEM_CREATED. Bridge already supports polling; add event subscriptions for low-latency alerts | dfhack-infrastructure-research §5, myDFHackScripts `FortressStatistics.lua` | S |
| F-008 | Polling + Events hybrid architecture | Catches both immediate events and gradual state transitions; no blind spots | `eventful` subscriptions for real-time events (deaths, invasions, item creation) AND `dfhack.timeout` polling for state changes (citizen count, reports, petitions). 500-tick polling rate validated by myDFHackScripts | research-synthesis §13 Pattern 4, dfhack-infrastructure-research | M |

### 1.2 Population Management Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-010 | Citizen arrival/departure tracking | Know immediately when new dwarves arrive or citizens leave/die | Compare `citizen` set against `world->units.active` every 25 ticks. New dwarves get bedroom/dining assignments. Track sets of unit IDs: `citizen`, `military`, `pet`, `visitor`, `resident` | df-ai `population.cpp:155-270` | S |
| F-011 | Noble assignment advisor | Correct nobles assigned to required positions; room requirements met | Track noble positions: bookkeeper, manager, broker, mayor, sheriff, captain of guard. Validate room value requirements. Dismiss nobles from military if they have accounting/management/trading duties. Avoid assigning miners to bookkeeper | df-ai `population_nobles.cpp:26-100` | M |
| F-012 | Noble apartment validation | Nobles have rooms meeting their requirements; prevents tantrum spirals | `check_noble_apartments()` ensures rooms meet `required_value`. `attribute_noblerooms()` resolves room → noble mappings | df-ai `population_nobles.cpp` | S |
| F-013 | Job stall detection and auto-unsuspend | Production chains don't stall; suspended jobs automatically cleared | Scan all non-repeating suspended jobs each cycle and unsuspend them. Prevents cascading production failures from temporary material unavailability | df-ai `population.cpp:update_jobs()` | S |
| F-014 | Pet management advisor | Proper pasture assignments; milking/shearing scheduled; trainable animals identified | Detect pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing. Assign pets to pastures based on grass availability via `assign_unit_to_zone()` | df-ai `population_pets.cpp` | M |
| F-015 | Occupation assignment advisor | Tavern, library, temple roles filled; cultural life of fortress maintained | Place residents (non-citizen travelers) into tavern keeper, performer, scholar roles at locations. Track location occupation slots | df-ai `population_occupations.cpp` | S |
| F-016 | Dead unit handling | Bodies properly dealt with; ghost prevention; memorial slabs created | Monitor dead units, manage slab creation, coffin assignment. Deathwatch callback runs every tick for immediate detection | df-ai `population_death.cpp` | S |
| F-017 | Caged unit management | Captured enemies/animals properly handled; cages emptied when safe | Monitor `world->units.caged` for disposition: release, train, execute, or stockpile | df-ai `population.cpp` Phase 7 | S |
| F-018 | Baby/mother reunification (DF Bug 5551) | Prevent infant separation bug that causes tantrum spirals | Detect when baby is separated from sane, living, idle mother. Create `SeekInfant` jobs explicitly | df-ai `population.cpp` | S |
| F-019 | Immigration handling advisor | New migrants get rooms, are assessed for military potential | Wait for migrant status to clear before drafting. Auto-assign bedrooms and dining seats. Score migrants for skill potential | df-ai `population.cpp:update_citizenlist()` | S |

### 1.3 Military Management Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-020 | Military sizing advisor | Optimal military-to-civilian ratio maintained | Target: `citizen_count × (25%..75%)`. Min 25%, max 75% configurable. Scale squads as population grows | df-ai `population_military.cpp:657-902` | S |
| F-021 | Draft/dismiss logic with XP-based selection | Best soldiers retained; weakest cycled out; civilian labor preserved | If soldiers > max: partial_sort by XP (lowest first), dismiss excess. If soldiers < min: draft from eligible pool (no nobles, no miners/woodcutters/hunters), lowest XP first | df-ai `population_military.cpp` | M |
| F-022 | Squad creation and sizing | Proper squad organization as fortress grows | Squad sizes: 4/6/8/10 members depending on total military count. Creates new squads when needed. Alternating heavy melee / heavy ranged uniforms every 3 squads | df-ai `population_military.cpp` | M |
| F-023 | Uniform selection advisor | Soldiers properly equipped for their role | Create "Heavy melee" and "Heavy ranged" uniforms. Full heavy armor: armor + helm + pants + gloves + shoes + shield + weapon appropriate to role | df-ai `population_military.cpp` | S |
| F-024 | Tool confiscation for military service | Miners/woodcutters who get drafted don't hoard civilian tools | Before drafting, scan soldiers holding picks/axes needed for civilian labor. Confiscate and substitute alternate weapons via equipment swap | df-ai `population_military.cpp:MilitarySetupExclusive::UnequipTool` | S |
| F-025 | Attack order management | Threats engaged by appropriate squads; best squad selected for each target | Score squads by (members available − current orders), send best-scoring squad. Batch attack orders via `MilitarySquadAttackExclusive` | df-ai `population_military.cpp:904-1301` | M |
| F-026 | Threat assessment and response | Early warning of dangers; appropriate military response | Monitor for hostile units, forgotten beasts, megabeasts, invaders. Tag enemies via `tag_enemies_onupdate`. Score threat severity for prioritized response | df-ai `ai.cpp`, `population_military.cpp` | L |
| F-027 | Training management | Soldiers improve skills through organized training | Set `squad->cur_alert_idx = 1` (training mode) once barracks reaches build stage. Monitor training quality | df-ai `population_military.cpp` | S |
| F-028 | Justice and crime monitoring | Criminal activity detected and addressed; keeps fortress law and order | Scan `world->crimes` for new criminal activity. Assign sheriff/captain of guard. Process punishments | df-ai `population_justice.cpp` | S |

### 1.4 Resource Management Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-030 | Three-tier stock threshold model | Precise inventory management with per-capita scaling; never run out of critical items | Three thresholds for ~100 item categories: `Needed` (absolute floor), `NeededPerDwarf` (per 100 citizens), `WatchStock` (monitor only). Plus `AlsoCount` for context items | df-ai `stocks.h:147-159`, planning-history §3.4 | L |
| F-031 | Automatic production ordering | Items produced before running out; production chains maintained | When stock falls below threshold: `queue_need(item, amount)` → `add_manager_order(template, amount)`. Check existing orders, avoid duplicates within 5 units | df-ai `stocks_manager.cpp:25-260` | M |
| F-032 | Manager order stall detection and clearing | Production never completely stalls from stuck orders | If front manager order stuck in `validated` state on same job type across two monthly checks, trim quantities by 3/month to clear queue | df-ai `stocks_update.cpp:46-73` | S |
| F-033 | Manager order CHEAT fallback | Production never completely stops even with UI bugs | If search filter returns no matching orders, force-overwrite first order with desired template (with "[CHEAT]" log). Last resort to prevent total production stall | df-ai `stocks_manager.cpp:ManagerOrderExclusive::Run()` | S |
| F-034 | Farm management advisor | Correct crops planted per season per biome; food/drink/textile production maintained | Track farmplots with biome/season-appropriate crop selection. Distinct categories: drink_plants, thread_plants, mill_plants, bag_plants, dye_plants, slurry_plants, grow_plants | df-ai `stocks_farm.cpp` | M |
| F-035 | Metalworking production chain advisor | Efficient ore → bars → equipment pipeline; no wasted metal | 4-step chain: (1) `update_simple_metal_ores()` scan world for ore, (2) `may_forge_bars()` compute producible bars, (3) `queue_need_forge()` decide production, (4) Metal preferences from material flags | df-ai `stocks_forge.cpp` | M |
| F-036 | Equipment production advisor | Military and civilian equipment needs met | Track weapon, armor, and tool requirements. Match to available materials and skilled crafters. Queue appropriate workshop orders | df-ai `stocks_equipment.cpp` | M |
| F-037 | Kitchen management | Optimal food preparation; correct items marked for cooking | `update_kitchen()` marks cookable items. Prevents cooking of valuable/planted items. Manages meal quality | df-ai `stocks.cpp:update_kitchen()` | S |
| F-038 | Tree cutting management | Wood supply maintained without deforesting entire surface | `cuttrees()` uses `tree_list()` to queue wood cutting jobs. Maintains `last_cutpos` to avoid redundant cuts. Balance wood supply vs. surface integrity | df-ai `stocks.cpp:cuttrees()` | S |
| F-039 | Stockpile configuration advisor | Stockpiles correctly configured for their intended contents | Configure stockpile categories using appropriate UI settings. Match stockpile types to adjacent workshop types for workflow efficiency | df-ai `stocks.cpp:try_construct_stockpile()` | S |

### 1.5 Construction and Planning Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-040 | Room type taxonomy (22 types) | All fortress room types tracked and managed | Track: corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot, furnace, garbagedump, infirmary, jail, location, nobleroom, outpost, pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop | df-ai `room.h:35-57`, planning-history §3.4 | S |
| F-041 | Construction state machine | Clear progress tracking from planning to completion | Four states: `plan → dig → dug → finished`. Each room advances through lifecycle with monitoring at each transition | df-ai `plan.cpp`, planning-history §3.4 | M |
| F-042 | Priority-driven construction sequencing | Most important rooms built first; proper fortress development order | JSON-driven priority filter system. `plan_priority_t` structs with filter (room type, status, users) and action (dig, dig_immediate, finish, etc.). Loaded from `plans/generic01.json` | df-ai `plan_priorities.h` | M |
| F-043 | Blueprint / floor plan system | Structured fortress layouts; repeatable designs | Parse JSON blueprint files from `plans/` directory. Blueprint files specify room types, min/max counts, tags, `count_as` (1 dormitory = 39 bedrooms), limits per room type | df-ai `blueprint.h`, `plan_setup.h`, `plan_setup_blueprint.cpp` | L |
| F-044 | Room assignment workflow | Citizens get rooms automatically; departing citizens free rooms | `new_citizen(uid)` → `getbedroom(uid)` → `getdiningroom(uid)` → `set_owner(room, uid)`. `del_citizen(uid)` → `freebedroom(uid)` → `freecommonrooms(uid)` | df-ai `plan.h:104-125` | M |
| F-045 | Idle detection and room activation | Fortress expands organically based on population needs | `checkidle()` checks if additional rooms should be dug when no tasks pending (more citizens than bedroom capacity, need workshop types). Activates dormant room plans | df-ai `plan_task.cpp` | S |
| F-046 | Vein mining advisor | Ore deposits located and efficiently mined | `list_map_veins()` scans map blocks for `block_square_event_mineralst`. `dig_vein()` routes shaft to vein. Tracks `dug_veins` to avoid re-digging | df-ai `plan.cpp`, planning-history §3.4 | M |
| F-047 | Cistern and water supply advisor | Reliable water supply for fortress; well access for hospital | Separate workflow managing water source → reservoir → well. Uses levers and floodgates. `monitor_cistern()` checks water fill levels | df-ai `plan_cistern.cpp`, planning-history §3.4 | L |
| F-048 | Room smoothing and engraving | Room value increases through stone smoothing and engraving | Schedule smoothing and engraving jobs for finished rooms. Prioritize noble rooms that need value increases | df-ai `plan_smooth.cpp` | S |
| F-049 | Furniture type management (28 types) | All furniture properly placed in appropriate rooms | 28 furniture types tracked: archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap, chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive, lever, nest_box, offering_place, pedestal, restraint, roller, statue, table, track_stop, traction_bench, vertical_axle, weapon_rack, well | df-ai `room.h` layout_type enum | S |
| F-050 | Stockpile subtype management (17 types) | Correct storage for all item categories | 17 stockpile subtypes corresponding to DF's native stockpile categories | df-ai `stocks.h`, planning-history §3.4 | S |

### 1.6 Trade Management Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-060 | Full trading cycle management | Automated/advised caravan trading; no missed trade opportunities | 9-step cycle: (1) Detect caravan via `ui->caravans`, (2) Identify broker, (3) Request broker at depot, (4) Wait for items at depot, (5) Open trade screen, (6) Scan trader items with `want_trader_item()`, (7) Balance offer ≥ request × 110%, (8) Handle counter-offers iteratively, (9) Dismiss broker | df-ai `trade_manager.cpp:31-722` | L |
| F-061 | Trade value calculation | Fair trades executed; fortress gets good deals | `item_or_container_price_for_caravan()` calculates trade values. Ensure offer meets or exceeds 110% of request (game's trade ratio) | df-ai `trade_helpers.cpp` | M |
| F-062 | Trade item selection advisor | Intelligent selection of what to buy and sell | `want_trader_item()` evaluates each trader item. Consider current stock levels, item quality, material needs. Prioritize scarce items | df-ai `trade_manager.cpp` | M |
| F-063 | Caravan detection and broker routing | Never miss a trading opportunity; broker dispatched automatically | Detect caravan arrival via `ui->caravans`. Request broker at depot via appropriate game actions. Monitor `BringItemToDepot` jobs for readiness | df-ai `population.cpp:update_trading()` | S |

### 1.7 Embark and Site Selection Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-070 | Embark site evaluation | Optimal embark location chosen based on multiple criteria | Evaluate potential embark sites for: water access, metal ores, soil depth, trees, neighbors (friendly/hostile), cavern proximity, aquifer status, biome quality | df-ai `embark.cpp` | L |
| F-071 | Initial party configuration | Starting 7 dwarves have appropriate skill distribution | Select skills for starting dwarves to cover essential roles: mining, carpentry, masonry, cooking, brewing, farming, medical | df-ai `embark.cpp` | M |
| F-072 | Random embark with auto-restart | Continuous autonomous play through fortress loss and re-embark | On fortress loss detection, auto-queue new embark if `random_embark` is enabled. Persist state before reset | df-ai `event_manager.cpp:569-608`, `ai.cpp` | M |

### 1.8 Fortress Lifecycle Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-080 | Fortress loss detection | Automatic detection of fortress-ending events; post-mortem generation | Monitor text viewer for loss messages: "Your strength has been broken", etc. Clear all handlers, persist state, optionally queue re-embark | df-ai `event_manager.cpp:569-608`, planning-history §3.4 | S |
| F-081 | Pause/timeout detection and handling | Game doesn't get stuck on modal dialogs or unexpected pauses | `pause_onupdate` monitors `*pause_state`. If paused >10 × fps ticks, call `timeout_sameview()` → `unpause()`. Handles stuck modal dialogs | df-ai `ai.cpp:196-260` | S |
| F-082 | Fortress post-mortem narrative | Player gets compelling story of how their fortress fell | On fortress loss, generate narrative from accumulated events, deaths, milestones. LLM-enhanced retelling of the fortress's history | planning-history §3.4, df-ai research | M |

### 1.9 Mood and Happiness Management Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-090 | Stress level monitoring | Catch dwarves before tantrum spirals; prevent cascading fortress-ending spirals | Monitor `unit.stress_level` across watcher cycles. Alert on high stress. Correlate with unmet needs | planning-history §3.6, watcher.py change detection | S |
| F-091 | Need satisfaction tracking | Identify and address unmet needs before they cause problems | Track personality needs/memories/preferences. Map DF trait scores to actionable recommendations (e.g., "Urist needs to socialize — assign tavern duty") | planning-history §3.6, df-structures `df.personality.xml` | M |
| F-092 | Strange mood tracking | Moods detected and resources gathered proactively | Detect mood changes via `CHANGE_HF_MOOD` event or polling. Identify required materials. Alert player to provide them. Track mood success/failure | df-ai event taxonomy, dfhack-infrastructure-research | S |
| F-093 | Personality-aware labor assignment | Right dwarves assigned to tasks matching their traits and preferences | Use `unit_personality` (50 facets), values, ethics, and skill data to recommend labor assignments. Match personality to role (e.g., aggressive → military, creative → crafts) | planning-history §3.6, DwarfFortressLogger `soul_details` | L |

### 1.10 LLM-Enhanced Advisor Features

| # | Feature | User Benefit | Implementation | Reference | Complexity |
|---|---------|-------------|----------------|-----------|------------|
| F-100 | Natural language fortress advice | Player asks questions in plain English and gets contextual answers | LLM receives fortress state snapshot + df-ai heuristic knowledge as system prompt. Answers questions like "Should I expand my military?" with data-backed advice | planning-history §3.4, df-ai comparison table | L |
| F-101 | Situation assessment with reasoning | Player understands WHY the AI recommends an action, not just what | LLM explains reasoning: "Your food stock is at 45 (threshold: 50 for 80 dwarves = 40 needed). You have 2 idle farmers and unplanted farmplots. Recommendation: plant plump helmets." | df-ai comparison table, planning-history §3.4 | M |
| F-102 | Multi-step action plans | Complex fortress projects broken into ordered steps | LLM generates step-by-step plans: "To establish a steel industry: (1) Locate iron ore veins, (2) Build smelters, (3) Smelt iron bars, (4) Build forge, (5) Produce steel using flux stone" | df-ai `stocks_forge.cpp` chain logic | M |
| F-103 | Context-aware proactive alerts | Important developments surfaced without player asking | LLM periodically reviews fortress state and generates unsolicited alerts for critical situations: low food, approaching goblin siege, noble lacking office, stressed dwarf approaching tantrum | planning-history §3.4, df-ai subsystem model | L |
| F-104 | Decision explanation in narrative voice | Advice delivered in Chronicler's persona for immersive experience | "The Chronicler" persona wraps advisor output: "The chronicles suggest your fortress would benefit from expanding the barracks. Three squads vie for training time in a single sparring hall." | planning-history §3.3 storyteller persona | S |
| F-105 | Stock threshold model as LLM context | LLM knows exact numeric thresholds for all 100 item categories | Extract df-ai's `Watch.Needed` and `Watch.NeededPerDwarf` default values for each stock item. Inject as structured context in LLM system prompt | df-ai `stocks.h`, research-synthesis §12 item 25 | M |
| F-106 | Military heuristics as LLM prompt advisories | LLM gives military advice grounded in tested heuristics | Use df-ai's 25%/75% military bounds, XP-based selection, squad sizing as explicit system prompt guidance | df-ai `population_military.cpp`, research-synthesis §12 | S |
| F-107 | Agentic SQL for fortress analysis | AI can query fortress database to build data-driven recommendations | LLM autonomously executes SQL queries against CDM (up to 5 rounds). Examines unit data, events, stocks. Builds evidence-based fortress assessments | planning-history §3.3 (agentic storyteller) | L |

---

## 2. df-ai Architecture Analysis

### 2.1 Overview

df-ai is a DFHack C++ plugin that plays Dwarf Fortress completely autonomously. It manages everything from initial embark site selection through full fortress lifecycle including construction, population, military, economy, and end-game. The architecture is fundamentally **reactive and polling-based**, not goal-based or planner-based.

**Source**: `/Users/nathanielcannon/Claude/GitRepos/df-ai/`

### 2.2 Top-Level Class Structure

```cpp
class AI {
    Population pop;    // Citizens, military, nobles, pets, justice, occupations
    Plan plan;         // Construction, rooms, blueprints, cisterns, smoothing
    Stocks stocks;     // Item tracking, production, farms, metalwork, equipment
    Camera camera;     // Viewport following (not relevant to Chronicler)
    Trade trade;       // Full trading cycle
    OnupdateCallback *pause_onupdate;       // Pause detection
    OnupdateCallback *tag_enemies_onupdate; // Threat tagging
    OnupdateCallback *announcements_onupdate; // Announcement monitoring
};
```

### 2.3 Event Manager (Tick-Based Dispatch)

The `EventManager` maintains two callback lists and an exclusive queue:

- **`onupdate_list`**: Callbacks that fire at scheduled tick intervals. List sorted by `minyeartick` (next-fire-time). Dispatch stops when hitting a callback not yet due. Effectively a priority queue.
- **`onstatechange_list`**: Callbacks that fire on game state events (world load/unload, pause/unpause, viewscreen change).
- **Exclusive queue**: At most one `ExclusiveCallback` runs at a time. Exclusive callbacks are Boost.Coroutines2 coroutines that hold UI control for multi-step interactions. When active, normal `onupdate` callbacks are suspended.

Registration patterns:
```cpp
// Repeating — fires every ticklimit game ticks
OnupdateCallback *onupdate_register(descr, ticklimit, initialtickdelay, callback);

// One-shot — fires once, removed when callback returns true
OnupdateCallback *onupdate_register_once(descr, callback);

// State change — fires on SC_WORLD_UNLOADED, SC_PAUSED, SC_VIEWSCREEN_CHANGED, etc.
OnstatechangeCallback *onstatechange_register(descr, callback);
```

**Timing reference**: 1 DF year = 12 months x 28 days x 1,200 ticks/day = 403,200 ticks. "Every 25 ticks" fires ~16,000 times/year.

### 2.4 Subsystem Update Schedule (Complete)

| Subsystem | File(s) | Update Frequency | Scope |
|-----------|---------|-----------------|-------|
| Population | `population.cpp` | Every 25 ticks | Citizens, jobs, unsuspend |
| Military | `population_military.cpp` | Every 25 ticks (phase 4) | Draft/dismiss, squads, attack |
| Nobles | `population_nobles.cpp` | Every 25 ticks (phase 2) | Position assignment |
| Trading | `trade_manager.cpp` | Every 25 ticks (phase 0) | Caravan, broker, trade |
| Pets | `population_pets.cpp` | Every 25 ticks (phase 5) | Pasture, milking, shearing |
| Justice | `population_justice.cpp` | Every 25 ticks (phase 4) | Crime, punishment |
| Occupations | `population_occupations.cpp` | Every 25 ticks (phase 8) | Tavern, performer, scholar |
| Construction Plan | `plan.cpp` | Every 240 ticks | Dig, build, furnish |
| Cistern | `plan_cistern.cpp` | Every 240 ticks | Water supply |
| Room smoothing | `plan_smooth.cpp` | As needed | Stone smoothing, engraving |
| Stockpile mgmt | `stocks.cpp` | Every 100 ticks | Item count, production |
| Farm management | `stocks_farm.cpp` | Every 100 ticks | Crop selection, rotation |
| Metalwork | `stocks_forge.cpp` | Every 100 ticks | Ore, bars, equipment |
| Equipment | `stocks_equipment.cpp` | Every 100 ticks | Weapons, armor, tools |
| Embark | `embark.cpp` | Once (setup) | Site selection, party |
| Blueprint setup | `plan_setup.cpp` | Once | JSON → room layout |

### 2.5 Decision Mechanism

There is **no planner or goal tree**. The AI makes decisions by:
1. Polling game state on every tick period
2. Computing desired state vs. current state
3. Queuing actions (as `ExclusiveCallback` objects) to close the gap

This is a **reactive invariant-maintenance** architecture. Five subsystems independently maintain their invariants. Their overlapping correction loops collectively steer the fortress toward stability.

### 2.6 Population Update Cycle (10 Phases, 25-Tick Rotation)

```
Phase 0: update_trading    — manage broker/caravan/trade
Phase 1: update_citizenlist — track citizenship changes (new arrivals, deaths)
Phase 2: update_nobles      — assign/reassign noble positions
Phase 3: update_jobs        — unsuspend stalled non-repeating jobs
Phase 4: update_military + update_crimes — draft/dismiss soldiers, review crimes
Phase 5: update_pets        — manage pets (milkable, shearable, trainable, etc.)
Phase 6: update_deads       — handle dead units, slabs
Phase 7: update_caged       — manage caged units
Phase 8: update_locations   — assign workers to tavern/library/temple
Phase 9: emit population event JSON
```

A separate `deathwatch` callback runs **every tick** to catch newly dead units immediately.

### 2.7 Construction Task Lifecycle

```
want_dig(room)          → task_type::want_dig
  → wantdig → digroom() → task_type::dig_room
    → dig_room monitors until tiles are floor/open
      → room status = dug
        → construct_room() → construct_* tasks
          → once built → furnish_room()
            → try_furnish() per furniture item
```

Plan processes tasks from two queues (`tasks_generic`, `tasks_furniture`) in a background scan pattern, checking one task per update to avoid frame-rate spikes.

### 2.8 Stock Threshold Model (Three-Tier)

```cpp
struct Watch {
    map<stock_item::item, int32_t> Needed;        // absolute minimum
    map<stock_item::item, int32_t> NeededPerDwarf; // per 100 dwarves
    map<stock_item::item, int32_t> WatchStock;     // items to monitor
    set<stock_item::item> AlsoCount;               // count-only items
};
```

Three data structures per item category:
```cpp
map<stock_item::item, int32_t> count_free;   // available, unowned
map<stock_item::item, int32_t> count_total;  // total including owned
map<stock_item::item, map<int16_t, pair<int32_t,int32_t>>> count_subtype; // per-subtype
```

Approximately 100 named stock item categories tracked.

### 2.9 Military Draft/Dismiss Algorithm

```
target_military_size = citizen_count × (military_min%..military_max%)
  where military_min = 25%, military_max = 75% (configurable)

If current_soldiers > max_military:
    partial_sort by XP (lowest first)
    queue Dismiss for excess soldiers

If current_soldiers < min_military:
    draft_pool = eligible citizens (no noble position, no mining/woodcutting/hunting labor)
    partial_sort by XP (lowest first for draft)
    queue Draft for needed soldiers
```

Squad sizing: 4/6/8/10 members depending on total military count.
Uniform alternation: "Heavy melee" and "Heavy ranged" every 3 squads.

### 2.10 Trading Algorithm

9-step sequential process:
1. Detect caravan arrival via `ui->caravans`
2. Identify broker unit by `entity_position_responsibility::TRADE`
3. Request broker at depot
4. Wait for items to arrive at depot (poll `BringItemToDepot` jobs)
5. Open trade screen
6. Scan trader items, apply `want_trader_item()` to evaluate each
7. Balance offer ≥ request × 110% (game's trade ratio)
8. Handle counter-offers iteratively
9. Dismiss broker after trade

### 2.11 Error Handling Patterns

| Pattern | Mechanism | Source |
|---------|-----------|--------|
| Pause/timeout | If paused >10×fps ticks → `timeout_sameview()` → `unpause()` | `ai.cpp:196-260` |
| Screen mismatch | `ExpectScreen<T>()` asserts current viewscreen type; logs on mismatch | `exclusive_callback.h` |
| Fortress loss | Check text viewer for loss messages → clear handlers → persist → re-embark | `event_manager.cpp:569-608` |
| Manager stall | Stuck `validated` order → trim quantities by 3/month | `stocks_update.cpp:46-73` |
| CHEAT fallback | No matching orders in search → force-overwrite first order | `stocks_manager.cpp` |
| Debug logging | `ai.debug()` → `df-ai.log`; assertion failures → `df-ai-debug.log` | `debug.h` |

---

## 3. Advisor vs. Autonomous Modes

### 3.1 Mode Spectrum

The AI Player component supports a spectrum from passive observation to full autonomous play:

| Mode | Description | User Interaction | Execution |
|------|-------------|-----------------|-----------|
| **Observer** | Monitors fortress state; generates reports; no recommendations | User reads reports; makes all decisions | None |
| **Advisor** (default) | Monitors state; generates specific recommendations with reasoning | User reviews and selects recommendations to execute | User executes manually |
| **Semi-Autonomous** | Executes pre-approved action categories automatically; asks for approval on others | User sets policy; AI executes within policy; alerts for out-of-policy situations | AI executes routine actions (unsuspend jobs, assign rooms); asks for approval on military, trade, major construction |
| **Autonomous** | Full df-ai-style automatic play | User watches; can override/pause at any time | AI executes all actions via DFHack Lua commands |

### 3.2 Advisor Mode Implementation

In advisor mode, the AI:
1. Reads fortress state via bridge polling and event subscriptions
2. Runs all subsystem analysis (population, stocks, military, construction, trade)
3. Generates structured recommendations as JSON objects:
   ```json
   {
     "subsystem": "military",
     "severity": "warning",
     "recommendation": "Draft 3 more soldiers",
     "reasoning": "Current military is 8 (20% of 40 citizens). Minimum target is 25% = 10 soldiers.",
     "action": {"type": "draft", "count": 3, "candidates": [12, 45, 67]},
     "data": {"current_military": 8, "citizen_count": 40, "target_min": 10}
   }
   ```
4. Displays recommendations in UI (fortress dashboard panel)
5. LLM can narrate recommendations in Chronicler persona

### 3.3 Autonomous Mode Implementation

In autonomous mode, the AI:
1. Performs all advisor-mode analysis
2. Translates recommendations into DFHack Lua commands
3. Executes commands via `dfhack-run` over SSH
4. Logs all actions taken with reasoning
5. Uses exclusive action queue to prevent conflicts

**Execution path**: Recommendation → Lua command generation → `dfhack-run` over SSH → verify result → log outcome

### 3.4 Key Design Decision: LLM Heuristics vs. Compiled Rules

**Unresolved** (noted in planning-history §13.2): Whether df-ai heuristics should be injected as LLM system prompt context (flexible, can reason about edge cases) or compiled as deterministic rules (fast, predictable, no hallucination risk).

**Recommended hybrid**: Use compiled rules for time-critical decisions (job unsuspend, death detection, military response to invasion) and LLM reasoning for strategic decisions (embark site evaluation, long-term resource planning, post-mortem analysis).

---

## 4. Data Requirements

### 4.1 Live Game State Needed for Decision-Making

All data accessed via the DFHack Lua bridge (`chronicler-bridge.lua`) or `dfhack-run` over SSH.

#### Currently Captured (Bridge v6, 16 sections)

| Domain | Data | Usage for AI Player |
|--------|------|---------------------|
| `game_time` | Year, tick, month, day | Scheduling, season-aware farming |
| `unit_summary` | 12 fields + flags + mood + emotions per unit | Population tracking, mood management |
| `dwarf_skills` | Per-dwarf skill levels | Labor assignment, military draft scoring |
| `dwarf_emotions` | Emotional states | Stress monitoring, happiness management |
| `buildings` | Building list with types | Room tracking, workshop availability |
| `artifacts` | Artifact inventory | Trade value, mood requirements |
| `armies` | Army positions and composition | Threat assessment |
| `announcements` | Game reports (cursor-based, 200/tick) | Event detection, alert generation |
| `diplomacy` | Diplomatic relations | Trade timing, war warnings |
| `squads` | Military squad composition | Military management |
| `mandates` | Noble mandates | Mandate compliance |
| `crimes` | Criminal activity | Justice system |
| `zones` | Activity zones | Pasture management |
| `entities` | Entity relationships | Civilization context |

#### Not Yet Captured (Required for AI Player)

| Domain | Data | Lua Path | Priority |
|--------|------|----------|----------|
| Health/wounds | Unit injury status | `unit.health`, `unit.body.wounds` | HIGH |
| Inventory/equipment | What each dwarf carries | `unit.inventory` | HIGH |
| Birth year / old year | Age and lifespan | `unit.birth_year`, `unit.old_year` | MEDIUM |
| Relationship IDs (9 slots) | Family connections | `unit.relationship_ids` | MEDIUM |
| Following status | Who follows whom | `unit.following` | LOW |
| Personality needs/memories | Full need satisfaction | `unit.status.current_soul.personality` | MEDIUM |
| Manager orders | Production queue | `world.manager_orders` | HIGH |
| Jobs list | Active job assignments | `world.jobs.list` | HIGH |
| Items (all) | Complete item inventory | `world.items.all` (HIGH perf risk) | MEDIUM |
| Stockpile contents | What's in each stockpile | Via building/stockpile links | HIGH |
| Noble positions | Current noble assignments | `ui.main.fortress_entity.positions` | HIGH |
| Incidents | Deaths, crimes with causes | `world.incidents.all` | HIGH |

#### DFHack Global State Access Patterns (from df-ai)

```lua
df.global.cur_year          -- Current game year
df.global.cur_year_tick     -- Current tick within year
df.global.pause_state       -- Game paused?
df.global.ui                -- Fortress UI state, noble positions, squad list
df.global.world             -- World: units, items, buildings, jobs, history
df.global.plotinfo.main.fortress_site.name  -- Fortress name
```

#### DFHack Module Functions

```lua
dfhack.units.isCitizen(u)       -- Is fortress citizen?
dfhack.units.isDead(u)          -- Is dead?
dfhack.units.isSane(u)          -- Is sane (not insane/tantruming)?
dfhack.units.getNoblePositions(u) -- Noble positions held
dfhack.units.getPosition(u)     -- Map position (x,y,z)
dfhack.units.getRaceName(u)     -- Race string
dfhack.units.getAge(u)          -- Age in years
dfhack.units.getReadableName(u) -- Full name string
```

### 4.2 Key Data Structures (from df-ai's C++ Access)

| Structure | Lua Equivalent | Contents |
|-----------|---------------|----------|
| `df::world->units.active` | `df.global.world.units.active` | All active units |
| `df::world->items.other[idx]` | `df.global.world.items.other[idx]` | Items by category |
| `df::world->jobs.list` | `df.global.world.jobs.list` | Active job list |
| `df::world->manager_orders` | `df.global.world.manager_orders` | Production queue |
| `df::ui->main.fortress_entity->squads` | `df.global.ui.main.fortress_entity.squads` | Military squads |
| `df::ui->main.fortress_entity->positions.own` | `df.global.ui.main.fortress_entity.positions.own` | Noble positions |
| `df::ui->caravans` | `df.global.ui.caravans` | Active caravans |
| `df::building::find(id)` | `df.building.find(id)` | Building lookup |
| `df::squad::find(id)` | `df.squad.find(id)` | Squad lookup |
| `df::historical_figure::find(id)` | `df.historical_figure.find(id)` | HF lookup |

### 4.3 CDM Schema Requirements

The AI Player needs these fortress_denizens and related tables:

```sql
-- Already planned:
fortress_denizens (unit tracking, NVS, status)
units (live unit state, skills, personality, mood)
history_events (live-generated events for fortress history)

-- Needed additionally for AI Player:
fortress_state_snapshots (periodic fortress health summaries)
advisor_recommendations (logged recommendations with outcomes)
production_orders (current and historical manager orders)
stockpile_inventory (current stock levels by category)
military_status (squad composition, training levels, equipment)
```

---

## 5. LLM Integration

### 5.1 How LLM Enhances Beyond Rule-Based (df-ai Comparison)

| Aspect | df-ai (C++ Rule-Based) | Chronicler LLM Approach | Advantage |
|--------|----------------------|------------------------|-----------|
| Decision source | Deterministic heuristics | LLM reasoning over game state | Handles novel situations |
| Latency | Sub-millisecond (in-process) | Seconds per decision | Rule-based for time-critical |
| Game state access | Direct memory read | DFHack Lua RPC + JSON bridge | Slightly slower but sufficient |
| UI interaction | Simulated keypresses | Lua script injection via DFHack RPC | Cleaner, less fragile |
| Planning horizon | Reactive (detect→correct per tick) | Can reason about multi-step plans | Strategic planning |
| Adaptability | Fixed rules, limited config | Adapts to any situation via reasoning | Handles edge cases |
| Explainability | Low (implicit in code logic) | High (LLM narrates decisions) | Player understanding |
| Coverage | Complete (embark to end-game) | Incremental (build as needed) | df-ai more complete today |

### 5.2 LLM System Prompt Architecture

The AI Player's LLM receives a structured system prompt containing:

```
1. PERSONA: "The Chronicler" advisor voice
2. FORTRESS STATE: Current state snapshot (population, stocks, military, construction, threats)
3. HEURISTIC KNOWLEDGE: df-ai thresholds and rules as reference data
   - Stock thresholds (100 categories with Needed/NeededPerDwarf values)
   - Military proportions (25-75% range)
   - Room type taxonomy (22 types)
   - Construction priority sequence
4. DATABASE SCHEMA: CDM summary for SQL tool use
5. SQL TOOL: Read-only query capability (up to 5 rounds)
6. RECENT ALERTS: Last N alerts from subsystem analysis
7. INSTRUCTIONS: Respond as advisor; explain reasoning; cite data
```

### 5.3 LLM Use Cases

| Use Case | Input | LLM Role | Output |
|----------|-------|----------|--------|
| "How is my fortress doing?" | Full state snapshot | Synthesize, prioritize concerns | Narrative assessment with priorities |
| "Should I expand military?" | Military + population data | Analyze ratio, threats, resources | Recommendation with reasoning |
| "My dwarves keep dying" | Death events + cause analysis | Diagnose patterns, suggest fixes | Root cause analysis + action plan |
| "What should I build next?" | Construction state + needs | Plan expansion based on population | Prioritized build list |
| "Prepare for siege" | Military + stocks + construction | Multi-step preparation plan | Checklist with timeline |
| "Why is Urist unhappy?" | Individual unit state + needs | Personality-aware diagnosis | Specific happiness fixes |
| Proactive alert generation | Periodic state review | Identify emerging problems | Priority-sorted alert list |
| Post-mortem analysis | Fortress death state | Narrative reconstruction | Story of the fortress's fall |

### 5.4 LLM-Rule Hybrid Architecture

```
                     ┌─────────────────┐
                     │  Bridge Polling  │
                     │  (100 ticks)     │
                     └───────┬─────────┘
                             │
                     ┌───────▼─────────┐
                     │  State Snapshot  │
                     │  Aggregator      │
                     └───────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
    │ Rule Engine    │ │ Alert    │ │ LLM Advisor  │
    │ (deterministic)│ │ Manager  │ │ (on-demand)  │
    │                │ │          │ │              │
    │ • Job unsuspend│ │ • Death  │ │ • Strategy   │
    │ • Room assign  │ │ • Invasion│ │ • Diagnosis  │
    │ • Stock alerts │ │ • Mood   │ │ • Planning   │
    │ • Draft check  │ │ • Stall  │ │ • Post-mortem│
    └───────┬────────┘ └────┬─────┘ └──────┬───────┘
            │               │              │
            └───────────────┼──────────────┘
                            │
                    ┌───────▼─────────┐
                    │ Action Queue    │
                    │ (exclusive,     │
                    │  serial FIFO)   │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │                           │
    ┌─────────▼──────┐          ┌─────────▼──────┐
    │ Advisor Mode   │          │ Autonomous Mode│
    │ (display only) │          │ (execute via   │
    │                │          │  dfhack-run)   │
    └────────────────┘          └────────────────┘
```

---

## 6. Existing Implementation Status

### 6.1 What Exists (as of v0.8, 2026-02-25)

| Component | Status | Details |
|-----------|--------|---------|
| Bridge polling daemon | COMPLETE | `chronicler watch` CLI, 100-tick bridge, fallback chain, change detection |
| Change detector | COMPLETE | 11 event types: death, mood, stress, pregnancy, ghost, etc. |
| Bridge data domains | COMPLETE | 16 sections, 7 data domains including units, buildings, squads, armies |
| Lua probes | PARTIAL | `probe_armies()`, `probe_diplomacy()`, `probe_unit_detail(id)` |
| Unit data extraction | PARTIAL | ~15 fields captured of 100+ available |
| Watcher system | COMPLETE | `chronicler watch`, 3+ cycles verified, graceful shutdown |
| DFHack transport | COMPLETE | `dfhack-run` over SSH verified for all data domains |
| Stress monitoring | COMPLETE | Via watcher change detection |
| Death detection | PARTIAL | Flag-based only; incident lookup not yet implemented |
| Advisor subsystems | NOT STARTED | No rule engine, no recommendation generation |
| LLM advisor integration | NOT STARTED | Storyteller exists but not fortress-advisor mode |
| Autonomous execution | NOT STARTED | No action execution pipeline |
| Stock threshold model | NOT STARTED | Listed as Tier 4 / Stretch goal |
| Military advisor | NOT STARTED | No draft/dismiss logic |
| Trade advisor | NOT STARTED | No caravan detection |
| Construction advisor | NOT STARTED | No room planning |
| Blueprint system | NOT STARTED | No JSON blueprint parsing |
| Fortress health dashboard | NOT STARTED | No summary generation |
| Embark advisor | NOT STARTED | No site evaluation |

### 6.2 What's Planned (from Planning History)

The AI Player component is mentioned in planning-history §3.4 with 17 advisor subsystems listed. It is categorized as part of the long-term roadmap (post-v1.0). The v1.0 focus is on the Denizen Registry, Agentic Storyteller, and Explorer — the AI Player is explicitly a later phase.

Key planned items (from Tier 4 action items):
- Stock threshold model from df-ai as LLM advisor context (item #25)
- df-ai heuristics as LLM prompt vs. compiled rules (design decision pending)

### 6.3 Dependencies

The AI Player depends on:
1. **Denizen Registry** (Phase 1) — needs to know who matters
2. **Bridge expansion** (Phase 2) — needs manager orders, jobs, stockpile data, noble positions
3. **Agentic Storyteller** (Phase 3) — shares LLM infrastructure and SQL tool
4. **Knowledge Horizon** (Phase 4) — scopes what the advisor "knows about"

---

## 7. Open Questions and Design Decisions

### 7.1 Unresolved Design Decisions

| # | Question | Options | Considerations |
|---|----------|---------|----------------|
| Q-001 | LLM heuristics vs. compiled rules | (A) All LLM, (B) All rules, (C) Hybrid | Hybrid recommended: rules for time-critical, LLM for strategic. Risk of hallucinated advice with pure LLM |
| Q-002 | df-ai stock thresholds: extract exact defaults or use as reference? | (A) Extract all ~100 Needed/NeededPerDwarf values, (B) Use categories only | Extract exact values — they represent tested heuristics. Store as configuration YAML |
| Q-003 | Manager order CHEAT fallback: adopt for autonomous mode? | (A) Yes with logging, (B) No, alert player instead | In autonomous mode, CHEAT prevents total stall. In advisor mode, alert player |
| Q-004 | Blueprint system: implement df-ai's JSON format or design new? | (A) Parse df-ai's format, (B) New format | df-ai's format is DF-version-specific. New format with CDM integration preferred, but df-ai format as import capability |
| Q-005 | Embark advisor: rule-based or LLM? | (A) Port df-ai's embark.cpp logic, (B) LLM with site data | LLM better for explaining trade-offs to player. Rules for scoring, LLM for narrative |
| Q-006 | Action execution: dfhack-run per action or batch? | (A) Individual SSH calls, (B) Batch Lua script | Batch preferred for latency. Generate a Lua script with multiple actions, execute once |
| Q-007 | Player Character distinction | How to identify and specially treat the player's main character | Needed for autonomous mode to avoid endangering the player's character |
| Q-008 | Update cadence in Chronicler context | Mirror df-ai's 25/100/240 tick rates exactly or adapt? | Adapt: Chronicler's bridge polls every 100 ticks. Subsystem analysis runs on bridge poll results, not per-tick. Advisory cadence: every bridge poll for population, every 3rd for stocks, every 10th for construction |
| Q-009 | Scope of autonomous actions | Which categories of action can be autonomously executed? | Start with safe actions (unsuspend jobs, assign rooms). Require approval for military, demolition, trade. Configurable per category |
| Q-010 | Integration with Storyteller | Should advisor and storyteller share the same LLM instance? | Yes — use same agentic SQL infrastructure. Different system prompts for advisor vs. storyteller mode |

### 7.2 Architectural Open Questions

| # | Question | Impact |
|---|----------|--------|
| AQ-001 | How to handle df-ai's version-specific C++ code for DF 53.10? | df-ai was designed for older DF. Many DFHack APIs may have changed. Lua equivalents must be verified empirically |
| AQ-002 | TCP RPC broken under Prism — permanent limitation? | If permanent, all game interaction must go through `dfhack-run` over SSH. Latency: ~50-100ms per command vs. <1ms for in-process |
| AQ-003 | Can exclusive action serialization work over SSH? | SSH calls are fire-and-forget (no synchronous response). Must use polling to verify action completion. Adds latency to autonomous mode |
| AQ-004 | Performance impact of advisor analysis on game speed? | Bridge polling + analysis runs on host machine, not in DF process. Should have zero game performance impact. But `dfhack-run` execution pauses game briefly per command |
| AQ-005 | How to verify df-ai's Lua equivalents on DFHack 53.10-r1? | Need systematic testing of all `df.global.*` paths. Some may have been renamed or restructured in 53.x |

### 7.3 Data Capture Gaps for AI Player

| Gap | Impact | Priority | Mitigation |
|-----|--------|----------|------------|
| Manager orders not captured | Cannot track production queue | HIGH | Add `world.manager_orders` to bridge |
| Jobs list not captured | Cannot identify stalled/idle workers | HIGH | Add `world.jobs.list` to bridge |
| Noble positions not tracked in live bridge | Cannot verify noble assignments | HIGH | Add noble position extraction |
| Stockpile-level inventory not captured | Stock threshold model incomplete | HIGH | Bridge enhancement to count items per stockpile |
| Item-level inventory not captured | Cannot evaluate individual items for trade | MEDIUM | `world.items.all` has HIGH performance risk; use category counts instead |
| Health/wounds not captured | Cannot assess military readiness | MEDIUM | Add to unit data extraction |
| Full personality needs/memories | Cannot do deep happiness analysis | MEDIUM | Add `unit.status.current_soul.personality` extraction |
| Loyalty cascade causality | May miss cause of cascade events | LOW | Event-driven detection |

### 7.4 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM hallucinating bad advice | HIGH | Fortress destruction from bad suggestions | Always show data backing; never execute without confirmation in advisor mode; compile critical rules |
| SSH latency too slow for autonomous mode | MEDIUM | Actions lag behind game state | Batch multiple actions per SSH call; pre-compute action scripts |
| df-ai heuristics not applicable to DF 53.10 | MEDIUM | Wrong thresholds/behaviors | Verify empirically; treat as starting points, not absolutes |
| Stock threshold extraction incomplete | LOW | Missing item categories | Extract what's available; add categories incrementally |
| Autonomous mode causes fortress loss | HIGH | Player loses game due to AI error | Require explicit opt-in; start with safe-only action categories; comprehensive logging |

---

## 8. Reference Implementation Details

### 8.1 df-ai Room Type Taxonomy (22 Types)

```
corridor, barracks, bedroom, cemetery, cistern, dininghall, farmplot,
furnace, garbagedump, infirmary, jail, location, nobleroom, outpost,
pasture, pitcage, pond, releasecage, stockpile, tradedepot, windmill, workshop
```

### 8.2 df-ai Furniture Types (28 Types)

```
archery_target, armor_stand, bed, bookcase, cabinet, cage, cage_trap,
chair, chest, coffin, door, floodgate, gear_assembly, hatch, hive,
lever, nest_box, offering_place, pedestal, restraint, roller, statue,
table, track_stop, traction_bench, vertical_axle, weapon_rack, well
```

### 8.3 df-ai Room Status Progression

```
plan → dig → dug → finished
```

### 8.4 df-ai Construction Priority Actions

```
dig, dig_immediate, unignore_furniture, finish, start_ore_search,
past_initial_phase, deconstruct_wagons, dig_next_cavern_outpost
```

### 8.5 df-ai Stock Item Categories (~100 Named)

Defined in `STOCKS_ENUMS` macro in `stocks.h`. Categories include all items a competent DF player must track: food, drink, seeds, cloth, leather, bars, blocks, mechanisms, beds, tables, chairs, doors, coffins, armor, weapons, ammunition, quivers, backpacks, flasks, trade goods, etc.

### 8.6 df-ai Farm Plant Categories

```
drink_plants    — brewable crops
thread_plants   — textile crops
mill_plants     — millable crops
bag_plants      — quarry bush etc.
dye_plants      — dye-producing
slurry_plants   — slurry-producing
grow_plants     — general growing
```

### 8.7 df-ai DFHack API Modules Used

| Module | Key Functions |
|--------|-------------|
| `modules/Gui` | Get/set cursor, current viewscreen, reveal on map |
| `modules/Screen` | Show/dismiss viewscreens |
| `modules/Units` | `isCitizen()`, `isDead()`, `isSane()`, `getNoblePositions()`, `getPosition()` |
| `modules/Buildings` | `constructBuilding()`, building state queries |
| `modules/Maps` | `getTileType()`, `getTileWalkable()`, block iteration |
| `modules/Job` | `linkIntoWorld()`, `getWorker()` |
| `modules/Materials` | `MaterialInfo`, property lookup |
| `modules/World` | `ReadWorldFolder()` |

### 8.8 df-ai Key Data Structures Accessed

```
df::world → units, items, buildings, jobs, manager_orders, history, crimes
df::ui → follow_unit, caravans, squads, site_id, group_id, main.fortress_entity
df::unit → status, labors, military, inventory, body, health, occupations, relationships
df::item → type, material, quality, stack size
df::building → type, build stage, position
df::squad → positions, orders, schedule, cur_alert_idx
df::historical_figure → unit_id, site links
df::manager_order → job_type, amount_left, material
```

### 8.9 Equivalent Lua Patterns (from myDFHackScripts)

**Citizen scan**:
```lua
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

**Death cause resolution**:
```lua
function getDeathCause(unit_id)
    for _, incident in ipairs(df.global.world.incidents.all) do
        if incident.type == df.incident_type.Death and incident.victim == unit_id then
            return df.death_type[incident.death_cause], incident.criminal
        end
    end
    return nil, nil
end
```

**Change detection (watcher factory)**:
```lua
function watch(getCurrentList, getKey, logChange, logNew)
    local known_items = {}
    local firstCall = true
    return function()
        if firstCall then
            known_items = getCurrentList()
            firstCall = false
            return
        end
        local current = getCurrentList()
        -- Detect new items by key comparison
        local known_keys = {}
        for _, item in ipairs(known_items) do known_keys[getKey(item)] = true end
        for _, item in ipairs(current) do
            if not known_keys[getKey(item)] then logNew(item) end
        end
        known_items = current
    end
end
```

**Event subscription**:
```lua
local modId = "CHRONICLER_AI"
eventful.enableEvent(eventful.eventType.UNIT_DEATH, 1)
eventful.enableEvent(eventful.eventType.INVASION, 1)
eventful.enableEvent(eventful.eventType.UNIT_NEW_ACTIVE, 1)
eventful.enableEvent(eventful.eventType.SYNDROME, 1)

eventful.onUnitDeath[modId] = function(unitId) ... end
eventful.onInvasion[modId] = function() ... end
```

---

## 9. Implementation Recommendations

### 9.1 Phase Ordering

1. **Phase A: Data Foundation** (blocks everything else)
   - Extend bridge with manager orders, jobs list, noble positions, stockpile data
   - Add `eventful` subscriptions for critical events
   - Add death cause resolution via incidents
   - Estimated effort: M

2. **Phase B: Rule Engine** (core advisor logic)
   - Implement stock threshold model (extract df-ai values)
   - Implement population management checks (10-phase cycle adapted)
   - Implement military sizing advisor
   - Implement job stall detection
   - Estimated effort: L

3. **Phase C: LLM Advisor Integration**
   - Build fortress state snapshot aggregator
   - Create AI Player system prompt with heuristic knowledge
   - Integrate with agentic SQL tool (shared with Storyteller)
   - Build recommendation display UI
   - Estimated effort: L

4. **Phase D: Autonomous Mode** (optional, post-advisor)
   - Build Lua command generation from recommendations
   - Build exclusive action queue with SSH execution
   - Build verification loop
   - Build safety rails (action category approval, override capability)
   - Estimated effort: XL

### 9.2 Priority Features for MVP Advisor

1. Stock level monitoring with threshold alerts (F-030, F-031)
2. Military sizing advisor (F-020, F-021)
3. Job stall detection (F-013)
4. Death/threat alerts (F-007, F-026)
5. Fortress health summary (F-006)
6. LLM natural language questions about fortress state (F-100)

### 9.3 Deferred Features

- Blueprint/floor plan system (F-043) — complex, low priority
- Embark site evaluation (F-070) — requires pre-embark game state
- Full autonomous mode (Phase D) — requires extensive safety testing
- Cistern management (F-047) — complex fluid dynamics
- Post-mortem narrative (F-082) — depends on event history completeness

---

## 10. Cross-Component Dependencies

| Dependency | From Component | To AI Player | Nature |
|-----------|---------------|-------------|--------|
| Denizen Registry | Database Explorer | AI Player needs "who matters" list | Data |
| Bridge Polling | Data ETL | AI Player reads fortress state | Infrastructure |
| Agentic SQL | Storyteller | Shared LLM + SQL tool | Code sharing |
| Knowledge Horizon | Database Masking | Scopes what advisor "knows" | Configuration |
| CDM Schema | Database | Stores fortress state + recommendations | Schema |
| Unit Data Expansion | Labor Manager | Shared personality/skill data | Data |
| Event System | Storyteller | Live event detection feeds both | Event bus |

---

*Component 4 of 6 complete. All features, algorithms, timing data, decision trees, code patterns, and implementation details extracted from all 6 source documents. Total: 55+ discrete features cataloged, complete df-ai architecture analysis, 4-mode advisor spectrum, full data requirements mapping, LLM integration architecture, and 10 unresolved design decisions documented.*
