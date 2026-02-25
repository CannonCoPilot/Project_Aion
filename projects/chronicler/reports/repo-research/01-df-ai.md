# Repository Research Report: df-ai

**Repository**: `GitRepos/df-ai`
**Author**: BenLubar
**Language**: C++ (DFHack plugin)
**Purpose**: Fully autonomous AI that plays Dwarf Fortress without human input
**Target DF Version**: 0.44.x era (not updated for 50.x/Steam)

---

## Repository Overview

df-ai is a DFHack plugin (~700KB of C++ source) that implements a complete autonomous player for Dwarf Fortress. It handles every aspect of fortress management: site selection/embark, room planning, construction, military, trade, population management, stockpiling, farming, and more. It uses event-driven callbacks registered with DFHack's EventManager to respond to game state changes on every tick.

The plugin also integrates with the `weblegends` plugin to expose a live status dashboard via HTTP, showing the AI's current plans, population state, stock levels, and decisions.

---

## Architecture & Key Components

### AI Core (`ai.cpp`, `ai.h`)
- Central coordinator owning Population, Plan, Stocks, Camera, Trade subsystems
- Event-driven: `onupdate_register()` hooks into DFHack tick callbacks
- Maintains RNG for stochastic decisions
- JSON event logging (`eventsJson` stream) for post-game analysis
- `describe_*()` static methods for unit, item, job, event text generation
- `tag_enemies()` for hostile unit detection
- `watch_announcements()` for game event monitoring

### Population Management (`population.cpp`, `population.h`)
- Citizen tracking with sets for citizens, military, visitors, residents, pets
- Death watch system (`deathwatch()`)
- Job assignment and labor management (`update_jobs()`)
- Military squad management: random/targeted attack orders, squad composition
- Noble appointment system (`update_nobles()`, `check_noble_apartments()`)
- Pet management including milking, shearing, egg-laying, grazing tracking
- Trade initiation and execution with full merchant interaction
- Crime monitoring and justice system interaction
- Location/occupation assignment (temples, taverns, libraries)
- Caged creature management

### Fortress Planning (`plan.cpp`, `plan.h`, `plan_*.cpp`)
- Complete blueprint-based room layout system
- Room types: bedrooms, dining halls, workshops, stockpiles, farms, hospitals, offices, tombs, cisterns, wells
- Smooth/engrave/carve stone management
- Furniture assignment per room
- Priority-based construction queue
- Cistern water management system
- Room persistence across save/load

### Stocks Management (`stocks.cpp`, `stocks.h`, `stocks_*.cpp`)
- 130+ item categories tracked (from ammo to weapons)
- Stock detection: count current items by category
- Manager order queue: automatically queues work orders
- Equipment tracking per military dwarf
- Farm plot management: crop rotation, seasonal planting
- Forge queue: metal smelting and smithing priorities
- Trade goods preparation

### Embark System (`embark.cpp`, `embark.h`)
- Automatic world generation parameter selection
- Site finder based on biome, resources, aquifer
- Embark profile selection (skills, items)

### Event Manager (`event_manager.cpp`, `event_manager.h`)
- Tick-limited callback registration
- State change event system
- Exclusive callback queue (for UI-blocking operations like trade screens)
- dfplex client integration for remote viewing

### Camera System (`camera.cpp`, `camera.h`)
- Automatic viewport management
- Follow interesting events

---

## Extractable Features for Chronicler

### F-AI-01: Autonomous Decision Engine Architecture
- **User QoL**: Provides the architectural pattern for an AI player component that can run a fortress without user input, or provide suggestions
- **Implementation**: Event-driven tick callback system with subsystem modulators (Population, Plan, Stocks, Camera, Trade). Each subsystem registers periodic callbacks with different tick intervals. The exclusive callback queue handles UI-blocking operations sequentially.
- **Chronicler relevance**: Direct template for the "AI Dwarf Fortress Player" main component

### F-AI-02: Population State Machine
- **User QoL**: Track citizen lifecycle events (arrival, death, mood changes, military assignment) with full context
- **Implementation**: Maintains parallel sets of citizen/military/visitor/resident/pet IDs. `update_citizenlist()` detects additions/removals. `deathwatch()` monitors corpses for burial. `update_crimes()` checks justice queue.
- **Chronicler relevance**: Change detection patterns for the Watcher daemon; population event types for narrative generation

### F-AI-03: Military Squad Management
- **User QoL**: Automated threat response, squad composition management, kill orders
- **Implementation**: `military_random_squad_attack_unit()`, `military_all_squads_attack_unit()`, `military_squad_attack_unit()`, `military_cancel_attack_order()`. Squad order change queue with reason tracking.
- **Chronicler relevance**: Military decision logging for narrative ("Urist ordered Squad 3 to intercept the goblin siege")

### F-AI-04: Stocks Tracking (130+ Categories)
- **User QoL**: Complete inventory awareness across all item categories with deficit detection
- **Implementation**: Enum-based stock categories from ammo_combat through weapons_ranged. Detection functions count items matching category criteria. Manager order templates auto-queue production.
- **Chronicler relevance**: Economic tracking dashboard, production statistics, resource deficit alerts

### F-AI-05: Trade Automation
- **User QoL**: Automated caravan interaction, goods valuation, diplomatic trade decisions
- **Implementation**: `set_up_trading()` selects trade depot and assigns broker. `PerformTradeExclusive` handles the trade screen interaction. `trade_helpers.cpp` implements goods valuation.
- **Chronicler relevance**: Trade event logging, economic narrative generation

### F-AI-06: Noble/Position Management
- **User QoL**: Automatic appointment of nobles based on fitness, apartment quality checks
- **Implementation**: Iterates entity positions, evaluates candidates, assigns positions. Checks room quality requirements per noble rank.
- **Chronicler relevance**: Political event tracking, succession narratives

### F-AI-07: Blueprint Room Planning
- **User QoL**: Structured fortress layout with room templates, priority ordering, furniture assignment
- **Implementation**: Room type enum, blueprint templates with size/furniture specs, priority queue for construction, persistence across saves. Over 46KB in planning code.
- **Chronicler relevance**: Fortress layout visualization, construction timeline narratives

### F-AI-08: Pet/Animal Management
- **User QoL**: Automated pasture assignment, milking/shearing/egg-collection awareness, breeding management
- **Implementation**: `pet_flags` bitfield tracks milkable/shearable/hunts_vermin/trainable/grazer/lays_eggs per animal. `update_pets()` assigns animals to appropriate zones.
- **Chronicler relevance**: Animal husbandry statistics, livestock demographics

### F-AI-09: JSON Event Logging
- **User QoL**: Machine-readable log of all AI decisions for post-game analysis
- **Implementation**: `event()` method writes JSON payloads with event name and structured data. Separate logger stream for human-readable log.
- **Chronicler relevance**: Event format reference for bridge JSON output; logging pattern for decision trail narratives

### F-AI-10: WebLegends Integration (Live Dashboard)
- **User QoL**: Real-time web-based view of AI state, fortress health, individual dwarf details
- **Implementation**: `weblegends.cpp` implements HTTP handler producing HTML. `report()` and `status()` methods in each subsystem generate both plain-text and HTML output.
- **Chronicler relevance**: Live dashboard pattern for Explorer UI; status reporting API design reference

### F-AI-11: Announcement Monitoring
- **User QoL**: Automatic classification and response to game announcements (sieges, births, deaths, mood changes)
- **Implementation**: `watch_announcements()` polls `last_announcement_id`, classifies new reports, triggers appropriate responses. `handle_pause_event()` processes pause-triggering announcements.
- **Chronicler relevance**: Announcement type classification for change detector; game event taxonomy

### F-AI-12: Citizen/Enemy Classification
- **User QoL**: Distinguish hostile visitors, hunting targets, combat participants
- **Implementation**: `is_attacking_citizen()`, `is_hunting_target()`, `is_in_conflict()` static methods examine unit flags, activities, and combat events.
- **Chronicler relevance**: Threat classification for fortress narrative ("The forgotten beast Ngathom attacked!")

---

## Key Insights

1. **df-ai proves full autonomous play is possible** via DFHack's C++ API — every game mechanic has API access
2. **Event-driven architecture** with tick-limited callbacks is the proven pattern for fortress monitoring
3. **The 130+ stock categories** provide a comprehensive item taxonomy useful for economic tracking
4. **JSON event logging** was a deliberate addition for analyzing AI behavior — same pattern Chronicler needs
5. **The code is for DF 0.44.x** and would need significant updates for DF 50.x, but the architectural patterns transfer directly
6. **Population management code** is the richest reference for citizen lifecycle tracking — more complete than any other tool
