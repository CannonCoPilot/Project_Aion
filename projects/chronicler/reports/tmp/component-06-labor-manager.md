# Component 06: Dwarf Fortress Labor Manager

**Component**: Dwarf Fortress Labor Manager (like Dwarf Therapist)
**Date**: 2026-02-25
**Sources**: planning-history.md, df-ai-research.md, dfhack-infrastructure-research.md, dwarven-surveyor-scripts-research.md, narrator-weblegends-research.md, research-synthesis.md
**Scope**: Labor assignment optimization, skill tracking and progression, personality/trait visualization, happiness/stress management, squad assignment, noble management, profession management, dwarf filtering and sorting, memory layout reading, thought/emotion display, need satisfaction tracking, and all other population management or labor optimization functionality.

---

## 1. Feature Inventory

### 1.1 Core Labor Management Features

| ID | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|----|---------|-------------|---------------------|----------------|------------|
| LM-001 | Labor toggle grid (Dwarf Therapist-style) | Quickly enable/disable labors for each dwarf in a matrix view | 2D grid: dwarves (rows) x labors (columns). Each cell is a toggleable checkbox. Read labor state from `unit.labors[]` via DFHack Lua. Write changes via `dfhack-run` SSH command setting `df.global.world.units.active[i].status.labors[labor_id] = true/false` | Dwarf Therapist (core feature) | XL |
| LM-002 | Skill display and progression tracking | See skill levels, XP progress, and skill changes over time | Read `unit.status.current_soul.skills[]` where each skill has `id` (enum `job_skill`), `rating` (enum `skill_rating` 0-20), `experience` (int32). Store snapshots in CDM `units.skills_json` per watcher cycle. Track deltas between snapshots for "skill up" events | Dwarf Therapist grid cells, df-ai `population.cpp` | L |
| LM-003 | Personality trait visualization (50 facets) | Understand dwarf psychology and predict behavior/mood | Read `unit.status.current_soul.personality` structure containing 50 personality facets (each -50 to +50 scale). Display as radar chart, bar chart, or descriptive text. Map extreme values to natural language descriptions (e.g., facet > 40 = "very brave") | Dwarf Therapist personality tab | L |
| LM-004 | Happiness/stress level monitoring | Identify at-risk dwarves before tantrums or breakdowns | Read `unit.status.current_soul.personality.stress_level` (int32). Display as color-coded indicator (green/yellow/orange/red). Track stress trends over time via periodic snapshots. Alert when stress exceeds threshold | Dwarf Therapist stress column, df-ai `population.cpp` deathwatch | M |
| LM-005 | Squad assignment management | Organize military squads with appropriate members | Read `unit.military.squad_id` and `unit.military.squad_position` for current assignment. Display squad rosters. Allow reassignment via DFHack Lua commands. Show squad training status, equipment readiness | df-ai `population_military.cpp`, Dwarf Therapist military view | L |
| LM-006 | Noble/position management | Track and manage noble appointments, ensure requirements met | Read `ui->main.fortress_entity->positions.own` for position definitions. Track which positions are filled vs. vacant. Show noble room requirements (`required_value`). Alert on nobles without adequate rooms | df-ai `population_nobles.cpp` (AssignNoblesExclusive) | L |
| LM-007 | Profession management and custom professions | Assign profession labels and manage profession-based views | Read/write `unit.profession` and `unit.custom_profession`. Allow creating custom profession templates (name + labor set). Batch-apply profession templates to groups of dwarves | Dwarf Therapist custom professions | M |
| LM-008 | Dwarf filtering and sorting | Find specific dwarves quickly in large populations | Multi-criteria filter: by name, race, profession, skill level, stress, squad, arrival status. Sort by any column. Text search with accent-insensitive matching (`unaccent` PostgreSQL extension) | Dwarf Therapist filter bar, all legend browsers | M |
| LM-009 | Thought/emotion display | Understand what is making dwarves happy or unhappy | Read `unit.status.current_soul.personality.emotions[]` — each emotion has type (`unit_thought_type`, 80+ categories) and parameters. Display recent thoughts in natural language. Map thought types to human-readable descriptions | Dwarf Therapist thought bubble, DwarfFortressLogger `MEM_EMOTION` | M |
| LM-010 | Need satisfaction tracking | Identify unmet needs contributing to stress | Read `unit.status.current_soul.personality.needs[]` — each need has type and satisfaction level. Display as list with fulfillment status (met/unmet/critical). Recommend actions to satisfy needs (e.g., "needs to pray — assign to temple") | Dwarf Therapist needs tab, planning-history section 3.6 | M |
| LM-011 | Attribute display (6 physical + 12+ mental) | View dwarf capabilities for informed assignment decisions | Physical attributes from `unit.body.physical_attrs[]`: strength, agility, toughness, endurance, recuperation, disease_resistance. Mental attributes from `unit.status.current_soul.mental_attrs[]`: analytical_ability, focus, willpower, creativity, intuition, patience, memory, linguistic_ability, spatial_sense, musicality, kinesthetic_sense, empathy. Display with bar chart or numeric values | Dwarf Therapist attributes tab, df-structures `df.soul.xml` | M |
| LM-012 | Citizen roster with configurable polling | Live-updated list of all fortress inhabitants | Poll `df.global.world.units.active` filtering with `dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u)`. Configurable polling interval (default 500 ticks / ~12 seconds). Track arrivals, departures, deaths. Store in `fortress_denizens` table | df-ai `update_citizenlist()`, myDFHackScripts `CitizenLogger.lua` | M |
| LM-013 | Labor assignment advisor (AI-powered) | Get intelligent recommendations for optimal labor assignments | Use personality traits, skill levels, and current fortress needs to recommend labor assignments. LLM-based analysis: "Urist has high creativity and Legendary Stonecrafting — recommend Crafts labor" | planning-history section 3.6, df-ai heuristics | XL |
| LM-014 | Value/belief visualization | Understand dwarf values that affect behavior and social interactions | Read `unit.status.current_soul.personality.values[]` — each has type (`value_type`) and strength (int32). Display as categorized list with strength indicators. Values affect how dwarves react to events | Dwarf Therapist beliefs tab, df-structures `df.personality.xml` | S |
| LM-015 | Ethics display | View dwarf ethical stances that affect behavior | Read `unit.status.current_soul.personality.ethics[]` — each has `ethic_type` and `ethic_response`. Display ethical positions on topics like killing, theft, torture. Affects dwarf reactions to witnessed events | df-structures `df.personality.xml` | S |
| LM-016 | Mannerism tracking (70+ types) | Characterize dwarf behavioral quirks for narrative and gameplay | Read `unit.status.current_soul.personality.mannerisms[]` — each has `mannerism_type` (70+ distinct behaviors) and `mannerism_situation_type` (WHEN_ANGRY, WHEN_NERVOUS, etc.). Display as descriptive text | df-structures `df.personality.xml` | S |

### 1.2 Advanced Labor Management Features

| ID | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|----|---------|-------------|---------------------|----------------|------------|
| LM-017 | Skill-based labor auto-assignment | Automatically assign labors matching highest skills | Algorithm: for each dwarf, identify top N skills by rating/experience. Enable corresponding labors. Disable labors with no skill or very low skill. Configurable thresholds per labor type | Dwarf Therapist auto-labor, df-ai citizen assignment | L |
| LM-018 | Military draft/dismiss advisor | Right-sized military with appropriate members | Use df-ai heuristics: target 25%-75% of citizen count as military. Draft pool = eligible citizens (no noble position, no mining/woodcutting/hunting labor). Sort candidates by combat XP (lowest first for draft, lowest first for dismiss). Squad size scaling: 4/6/8/10 based on total military | df-ai `population_military.cpp:657-902` | L |
| LM-019 | Population migration tracking | Track arrivals, departures, and demographic changes | Detect new citizens via set comparison each polling cycle. Track in `fortress_denizens` table with `arrival_year`, `arrival_tick`, `departure_year`, `departure_cause`. Generate migration wave summaries. Link migrants to origin sites when HF data available | df-ai `update_citizenlist()`, myDFHackScripts `CitizenLogger.lua` | M |
| LM-020 | Job management and stall detection | Prevent production stalling due to suspended jobs | Scan `world->jobs.list` for suspended non-repeating jobs. Auto-unsuspend or alert user. Track job types and completion rates. Identify bottlenecks (e.g., all masonry jobs suspended = no mason assigned) | df-ai `update_jobs()` phase 3 | M |
| LM-021 | Pet/animal management | Assign animals to pastures, track useful traits | Detect pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing. Assign pets to pastures based on grass availability. Route via `assign_unit_to_zone()`. Track pet populations | df-ai `population_pets.cpp` (update_pets) | M |
| LM-022 | Occupation/location assignment | Assign residents to tavern, library, temple roles | Place residents (non-citizen travelers) into tavern keeper, performer, scholar roles at locations. Track occupation assignments. Display occupation status per location | df-ai `population_occupations.cpp` (assign_occupation) | M |
| LM-023 | Wound and health tracking | Monitor injuries and recovery for medical management | Read `unit.health` and `unit.body.wounds[]` for injury data. Display wound severity, affected body parts, treatment status. Alert on untreated wounds. Track recovery timeline | Dwarf Therapist health tab, DwarfFortressLogger `MEM_HEALTH`, `MEM_WOUND` | L |
| LM-024 | Inventory/equipment display | View what each dwarf is wearing and carrying | Read `unit.inventory[]` for equipped items. Display equipment list per dwarf. Show quality levels. Highlight missing equipment (soldier without weapon/armor). Cross-reference with squad uniform requirements | Dwarf Therapist equipment tab, df-ai `stocks_equipment.cpp` | L |
| LM-025 | Relationship visualization | See social connections between dwarves | Read `unit.relationship_ids[]` (9 slots: Mother, Father, Spouse, etc.) and `unit.hist_figure_id` -> `hf.histfig_links[]`. Display relationship graph. Identify family clusters. Alert on relationship-based stress (death of loved one) | myDFHackScripts `unit.lua`, df-structures `histfig_hf_link` subtypes | L |
| LM-026 | Goal/dream tracking | Track and support dwarf life goals | Read `unit.status.current_soul.personality.goals[]` — each has `goal_type` enum and accomplishment status. Display active goals with fulfillment status. Some goals: start_a_family, create_a_great_work_of_art, attain_a_position_of_importance, master_a_skill, etc. | df-structures `df.personality.xml`, DwarfFortressLogger `MEM_NEED` | S |
| LM-027 | Dwarf comparison view | Compare multiple dwarves side-by-side | Select 2-4 dwarves and view their skills, attributes, personality in parallel columns. Useful for choosing between candidates for a role or military position | Dwarf Therapist (implicit in grid) | M |
| LM-028 | Skill distribution analytics | See fortress-wide skill coverage at a glance | Aggregate skill data across all dwarves. Show: number of dwarves per skill, highest level per skill, skills with no practitioners, skill level distribution histogram. Identify workforce gaps | None (Chronicler original) | M |
| LM-029 | Stress trend analysis | Predict breakdowns before they happen | Track stress_level snapshots over time per dwarf. Plot stress trends. ML/statistical analysis: if stress increasing at rate X, predict breakdown in Y ticks. Identify common stress causes from thought history | None (Chronicler original) | L |
| LM-030 | Batch labor operations | Change labors for multiple dwarves at once | Select group of dwarves (by filter criteria). Apply labor changes to all selected. Operations: enable labor, disable labor, set profession, assign to squad, assign to location | Dwarf Therapist batch select | M |
| LM-031 | Labor optimization engine | Maximize fortress productivity through optimal assignments | Algorithm: given fortress production needs (from Stocks advisor), skill distribution, and personality data, compute optimal labor assignment matrix. Constraint satisfaction: each dwarf assigned at most N labors, critical labors always covered, personality preferences weighted | None (Chronicler original, inspired by df-ai) | XL |
| LM-032 | Newcomer orientation view | Quickly assess and assign new arrivals | When migration wave detected, show popup/panel with new arrivals. Display each newcomer's skills, personality highlights, and recommended role. Quick-assign buttons for common roles | df-ai `new_citizen()` triggers bedroom + dining assignment | M |
| LM-033 | Deathwatch and casualty tracking | Immediate notification of deaths with cause details | Run death detection every tick (df-ai `deathwatch` pattern). Look up death cause via `df.global.world.incidents.all` -> `incident.death_cause` (enum `death_type`), killer via `incident.criminal`. Log to `unit_events` table. Display death notification with narrative | df-ai `population_death.cpp`, myDFHackScripts `DeathLogger.lua` | M |
| LM-034 | Baby/child tracking | Track children's growth and potential | Monitor non-citizen children (excluded from labor but tracked). Show age, parents, expected maturation date. Track skill development during childhood. Predict adult capabilities from childhood training | df-ai baby reunification (DF Bug 5551 workaround) | S |
| LM-035 | Performance skill tracking | Track artistic and performance abilities | Read `unit.status.current_soul.performance_skills` -> `practical_experiencest`: musical_instruments[], poetic_forms[], musical_forms[], dance_forms[]. Each has skill ID, rating, experience | df-structures `df.soul.xml` (`practical_experiencest`) | S |

### 1.3 Integration Features (Cross-Component)

| ID | Feature | User Benefit | Code Implementation | Reference Tool | Complexity |
|----|---------|-------------|---------------------|----------------|------------|
| LM-036 | Labor Manager <-> Storyteller integration | Ask AI questions about your dwarves and get narrative answers | Unified Person JSON (merged Unit + HF data) fed to agentic storyteller. "Tell me about Urist" returns personality narrative, skill description, life events, relationships | planning-history section 4.3 (unified person schema) | L |
| LM-037 | Labor Manager <-> Knowledge Horizon | Only see dwarves your fortress knows about | Apply Knowledge Horizon masking: only show dwarves who are fortress denizens or 1-hop connections. Historical figures outside horizon are masked | planning-history section 3.7 | M |
| LM-038 | Labor Manager <-> Explorer integration | Navigate from labor grid to full dwarf detail page | Click any dwarf in labor grid -> navigate to People tab detail view. Cross-link to HF page if HF record exists. "View graph" button for relationship network | planning-history section 3.2 (People Tab) | S |
| LM-039 | Labor Manager <-> Live Event Stream | Real-time updates to labor view as events occur | Subscribe to `eventful` events: UNIT_NEW_ACTIVE (new arrivals), UNIT_DEATH (deaths), JOB_COMPLETED (skill ups), PROFESSION_CHANGED. Update labor grid in real-time via WebSocket push | myDFHackScripts event subscription pattern | L |
| LM-040 | Labor Manager <-> Stock Advisor | Recommend labor changes based on production needs | If Stock advisor identifies shortfall (e.g., no food), recommend enabling cooking/farming labors on idle dwarves. If military needs armor, recommend enabling armorsmith on skilled dwarf | df-ai `stocks.cpp` + `population.cpp` interaction | L |

---

## 2. Dwarf Therapist Architecture Analysis

### 2.1 Memory Layout Reading System

Dwarf Therapist (codebase at `/Users/nathanielcannon/Claude/GitRepos/DwarfFortressLogger/`) uses direct OS-level memory reading to access DF's data structures. This approach is **not viable for Chronicler** (requires same-machine access with elevated privileges), but the memory layout files serve as the authoritative reference for what data is available.

**Memory access methods by OS**:
- **Linux**: `ptrace()` syscall (restricted by `ptrace_scope`)
- **Windows**: `ReadProcessMemory()` Win32 API
- **macOS**: `task_for_pid()` Mach API

**The `MemoryLayout` class defines 29 named memory sections**:

```
MEM_GLOBALS    -> "addresses"              (global pointer addresses)
MEM_UNIT       -> "dwarf_offsets"          (field offsets within unit struct)
MEM_SOUL       -> "soul_details"           (soul struct field offsets)
MEM_HIST_FIG   -> "hist_figure_offsets"
MEM_HIST_EVT   -> "hist_event_offsets"
MEM_HIST_ENT   -> "hist_entity_offsets"
MEM_EMOTION    -> "emotion_offsets"
MEM_ACTIVITY   -> "activity_offsets"
MEM_NEED       -> "need_offsets"
MEM_HEALTH     -> "health_offsets"
MEM_WOUND      -> "unit_wound_offsets"
MEM_RACE       -> "race_offsets"
MEM_CASTE      -> "caste_offsets"
... (29 total sections covering the complete scope of Dwarf Therapist's data model)
```

Layout files are INI/QSettings files keyed by DF binary checksum. This is equivalent to what df-structures does via XML -- both describe the same in-memory layout for different consumers.

### 2.2 Dwarf Therapist Data Scope (What DT Reads)

The 29 memory sections collectively cover:
- **Units**: profession, attributes, skills, beliefs, needs, emotions, wounds, health
- **Soul**: skills (with XP/rating), preferences, complete personality
- **Historical figures**: kills, identity, fake identity
- **Historical events and entities**
- **Squads, jobs, items, materials**
- **Art images**

**HistFigure data extraction** (from `histfigure.h`):
```cpp
struct kill_info {
    QString name;
    int year;
    int site;
    int count;
    QString creature;
};
```
- `m_id` (HF ID)
- `m_address` (memory address)
- `m_fig_info_addr` (profile info address)
- `m_fake_ident_addr`, `m_fake_name_addr` (false identity / nickname)
- `m_notable_kills`, `m_other_kills` (kill records with name, year, site, count, creature type)

### 2.3 Dwarf Therapist Grid-Based UI Pattern

The core DT UI is a 2D matrix:
- **Rows**: Individual dwarves (sortable, filterable)
- **Columns**: Labor types (grouped by category)
- **Cells**: Toggle state (enabled/disabled) with skill-level color coding
- **Color coding**: Cell background color indicates skill level (darker = higher)
- **Column groups**: Mining, Woodworking, Stoneworking, Hunting, Healthcare, Farming, Metalsmithing, Crafts, Engineering, Other

**Custom Professions**:
- User-defined profession templates (name + set of enabled labors)
- Apply profession = batch-enable/disable labors to match template
- Persistent across sessions

### 2.4 Chronicler's DFHack Lua Equivalent

Since Chronicler cannot use DT's memory reading approach (remote VM), all data access goes through DFHack Lua. The equivalent access patterns:

```lua
-- Citizen scan (equivalent of DT's unit list)
for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isCitizen(u) and not dfhack.units.isBaby(u) then
        local data = {
            id = u.id,
            name = dfhack.TranslateName(u.name),
            profession = df.profession[u.profession],
            custom_profession = u.custom_profession,
            -- Labor toggles
            labors = {},
        }
        for labor_id = 0, df.unit_labor.HAUL_ANIMALS do
            data.labors[df.unit_labor[labor_id]] = u.status.labors[labor_id]
        end
        -- Skills from soul
        if u.status.current_soul then
            data.skills = {}
            for _, skill in ipairs(u.status.current_soul.skills) do
                table.insert(data.skills, {
                    id = df.job_skill[skill.id],
                    rating = skill.rating,
                    experience = skill.experience,
                })
            end
        end
    end
end
```

---

## 3. df-ai Population Management Architecture

### 3.1 Ten-Phase Population Update Cycle

df-ai runs population management every 25 game ticks via a 10-phase rotation:

```
Phase 0: update_trading    -- manage broker/caravan/trade
Phase 1: update_citizenlist -- track citizenship changes (new arrivals, deaths)
Phase 2: update_nobles      -- assign/reassign noble positions
Phase 3: update_jobs        -- unsuspend stalled non-repeating jobs
Phase 4: update_military + update_crimes -- draft/dismiss soldiers, review crimes
Phase 5: update_pets        -- manage pet traits (milkable, shearable, etc.)
Phase 6: update_deads       -- handle dead units, slabs
Phase 7: update_caged       -- manage caged units
Phase 8: update_locations   -- assign workers to tavern/library/temple occupations
Phase 9: emit population event JSON
```

A separate `deathwatch` callback runs **every tick** to catch newly dead units immediately.

**Source files**: `population.cpp`, `population.h`, `population_military.cpp`, `population_nobles.cpp`, `population_justice.cpp`, `population_death.cpp`, `population_pets.cpp`, `population_occupations.cpp`

### 3.2 Citizen Tracking Algorithm

**Data structure**: Sets of integer unit IDs categorized as: `citizen`, `military`, `pet`, `visitor`, `resident`.

**`update_citizenlist()` algorithm** (runs every 25 ticks, phase 1):
1. Scan `world->units.active` for all units where `Units::isCitizen(u) && !Units::isBaby(u)`
2. Compare against known `citizen` set
3. New citizens trigger:
   - `plan.new_citizen(uid)` -- assigns bedroom
   - `plan.getdiningroom(uid)` -- assigns dining room seat
   - `set_owner(room, uid)` -- marks ownership
4. Deleted citizens trigger:
   - `plan.del_citizen(uid)` -- releases bedroom
   - `plan.freecommonrooms(uid)` -- releases dining room, etc.

**Source**: `population.cpp:155-270`

### 3.3 Noble Assignment System

**`update_nobles()` algorithm** (runs every 25 ticks, phase 2):

Uses `AssignNoblesExclusive` to navigate the nobles screen. Assignment priority:
1. **Bookkeeper** (avoids miners)
2. **Manager** (needs an office)
3. **Broker** (needs to be able to trade)
4. **Mayor** (elected, not assigned)
5. **Sheriff / Captain of the Guard**

**Noble requirements enforcement**:
- `check_noble_apartments()` ensures nobles have rooms meeting their `required_value`
- `attribute_noblerooms()` assigns rooms based on noble position requirements
- Dismisses nobles from military if they have accounting/management/trading responsibilities

**Source**: `population_nobles.cpp:26-100`

### 3.4 Military Draft/Dismiss Algorithm

**`update_military()` algorithm** (runs every 25 ticks, phase 4):

```
target_military_size = citizen_count * (military_min%..military_max%)
  where military_min = 25%, military_max = 75% (from config)

If current_soldiers > max_military:
    partial_sort by XP (lowest first)
    queue Dismiss for excess soldiers

If current_soldiers < min_military:
    draft_pool = eligible citizens (no noble position, no mining/woodcutting/hunting labor)
    partial_sort by XP (lowest first for draft)
    queue Draft for needed soldiers
```

**Tool confiscation**: Before drafting, scans soldiers holding picks/axes needed for civilian labor (mining, wood cutting). Confiscates and substitutes alternate weapons via `MilitarySetupExclusive::UnequipTool`.

**Uniform selection**: Creates "Heavy melee" and "Heavy ranged" uniforms alternating every 3 squads. Full heavy armor: armor + helm + pants + gloves + shoes + shield + appropriate weapon.

**Squad creation**: Squads size at 4/6/8/10 members depending on total military count. Creates new squads via `D_MILITARY_CREATE_SQUAD` keystrokes.

**Attack orders**: `military_random_squad_attack_unit()` scores squads by members available minus current orders. Best-scoring squad attacks target.

**Source**: `population_military.cpp:657-902` (update), `population_military.cpp:904-1301` (attack)

### 3.5 Job Management

**`update_jobs()` algorithm** (runs every 25 ticks, phase 3):
- Simply un-suspends all non-repeating suspended jobs each cycle
- Prevents production chains from stalling when material availability changes
- Simple but effective -- prevents the common "everything suspended" problem

### 3.6 Pet Management

**`update_pets()` algorithm** (runs every 25 ticks, phase 5):
- Detects pet capabilities: milkable, shearable, trainable, egg-laying, vermin-hunting, grazing
- Assigns pets to pastures based on grass availability
- Routes pets through `assign_unit_to_zone()` for grazing zones

### 3.7 Occupation Assignment

**`assign_occupation()` algorithm** (runs every 25 ticks, phase 8):
- Places residents (non-citizen travelers) into roles at locations
- Roles: tavern keeper, performer, scholar, mercenary, monster_slayer, scribe, messenger
- Matches traveler capabilities to role requirements

### 3.8 Death Handling

**`update_deads()` algorithm** (runs every 25 ticks, phase 6):
- Handle dead units, create memorial slabs
- Track corpse locations
- Generate burial tasks

**`deathwatch` callback** (runs every tick):
- Immediate detection of newly dead units
- Triggers immediate response chain

### 3.9 DF Bug 5551 Workaround (Baby/Mother Reunification)

df-ai explicitly handles the case where a baby is separated from its mother:
- Creates `SeekInfant` jobs when a baby is separated from a sane, living, idle mother
- Prevents babies dying from neglect

---

## 4. Personality & Psychology System

### 4.1 Complete `unit_personality` Structure

From `df.personality.xml` (via df-structures), the personality system has four major subsystems:

#### 4.1.1 Personality Facets (50 traits)

Each facet is an integer on a -50 to +50 scale. The 50 facets cover behavioral tendencies such as:
- Combat-related: BRAVERY, ANGER, ANXIETY, STRESS_VULNERABILITY
- Social: FRIENDLINESS, GREGARIOUSNESS, POLITENESS, MODESTY, CLOSEDNESS
- Work-related: PERSEVERANCE, FOCUS, ABSTRACT_INCLINED, CURIOUS, IMMODERATION
- Emotional: DEPRESSION, EXCITEMENT_SEEKING, EMOTIONALLY_OBSESSIVE, DUTIFULNESS

Extreme values (beyond +/- 40) produce distinct behavioral effects in-game and can be mapped to natural language descriptions for narrative purposes.

#### 4.1.2 Values (`personality_valuest`)

Each value has:
- `type` (`value_type` enum): LAW, LOYALTY, FAMILY, FRIENDSHIP, POWER, TRUTH, CUNNING, ELOQUENCE, FAIRNESS, DECORUM, TRADITION, ARTWORK, COOPERATION, INDEPENDENCE, STOICISM, HARMONY, MERRIMENT, CRAFTSMANSHIP, MARTIAL_PROWESS, SELF_CONTROL, PERSEVERANCE, COMMERCE, ROMANCE, NATURE, PEACE, KNOWLEDGE, SACRIFICE, COMPETITION, LEISURE_TIME, HARD_WORK, EXCITEMENT
- `strength` (int32): -50 to +50 scale representing how strongly the dwarf values this

#### 4.1.3 Ethics (`personality_ethicst`)

Each ethic has:
- `ethic_type` enum: covers topics like KILLING, ASSAULT, VANDALISM, THEFT, TREASON, LYING, BREAKING_OATHS, etc.
- `ethic_response` enum: ACCEPTABLE, PERSONAL_MATTER, JUSTIFIED_IF_PROVOKED, JUSTIFIED_IF_NO_REPERCUSSION, TABOO, MISGUIDED, SHUN, APPALLING, PUNISH_REPRIMAND, PUNISH_SERIOUS, UNTHINKABLE, REQUIRED, NOT_APPLICABLE

#### 4.1.4 Mannerisms (`mannerismst`)

70+ distinct behavioral mannerisms, each with:
- `mannerism_type` enum: TALKS_WHISPERS, TALKS_MUMBLES, LAUGHS_CACKLES, LAUGHS_RARELY, POSTURE_SLOUCH, POSTURE_STRAIGHT, FIDGETS, STARES, PACES, GESTURES_WILDLY, TAPS_FINGERS, SCRATCHES, etc.
- `mannerism_situation_type` enum: WHEN_ANGRY, WHEN_NERVOUS, WHEN_HAPPY, WHEN_SAD, WHEN_BORED, WHEN_ANXIOUS, etc.

#### 4.1.5 Thoughts (`unit_thought_type`)

80+ thought categories capturing recent mental events:

**Conflict/Trauma**: Conflict, Trauma, WitnessDeath, UnexpectedDeath, Death, Kill
**Relationships**: LoveSeparated, LoveReunited, NewRomance, BecomeParent
**Achievement**: MakeMasterwork, MadeArtifact, MasterSkill
**Negative**: JailReleased, Miscarriage, GhostNightmare, GhostHaunt
**Physical**: Thirsty, Dehydrated, Hungry, Starving, MajorInjuries, MinorInjuries
**Governance**: Elected, Reelected, Incident, HearRumor
**Environment**: Drowsy, VeryDrowsy, Rest, FreakishWeather, Rain, SnowStorm

#### 4.1.6 Needs

Needs represent ongoing requirements for dwarf well-being. Each need has a type and satisfaction level. Unmet needs contribute to stress accumulation.

#### 4.1.7 Goals / Dreams

Goals from `goal_type` enum include:
- START_A_FAMILY
- CREATE_A_GREAT_WORK_OF_ART
- ATTAIN_A_POSITION_OF_IMPORTANCE
- MASTER_A_SKILL
- FALL_IN_LOVE
- SEE_THE_GREAT_NATURAL_SITES
- BRING_PEACE_TO_THE_WORLD
- MAKE_A_GREAT_DISCOVERY
- BECOME_A_LEGENDARY_WARRIOR
- RULE_THE_WORLD

Each goal tracks accomplishment status.

### 4.2 Visualization Approaches

**Radar Chart / Spider Plot**: Display 8-10 most significant personality facets as a radar chart. Good for quick "personality fingerprint" at a glance.

**Bar Chart**: Display all 50 facets as horizontal bars, color-coded by extremity. Green = moderate, Yellow = notable, Red = extreme.

**Natural Language Description**: Map facet values to prose descriptions:
- Facet > 40: "extremely [trait]" (e.g., "extremely brave")
- Facet 20-40: "very [trait]"
- Facet -20 to 20: neutral (not mentioned)
- Facet -40 to -20: "somewhat [opposite]"
- Facet < -40: "extremely [opposite]"

**Voice Emulation** (for Storyteller integration): Use soul data (traits, beliefs, goals, needs) to derive a personality description. Map DF trait scores to narrative personality dimensions. Feed to LLM for character-consistent dialogue generation.

### 4.3 Stress System Mechanics

Stress is a single int32 value that accumulates based on:
- Unmet needs
- Negative thoughts (witnessing death, injury, loss of loved one)
- Lack of social interaction
- Poor living conditions
- Conflicting values (forced to do something against their ethics)

Stress thresholds (approximate):
- 0-24,999: Content (green)
- 25,000-49,999: Unhappy (yellow)
- 50,000-99,999: Very Unhappy (orange)
- 100,000+: Near Breaking (red)
- 150,000+: Tantrum/Berserk risk

### 4.4 Happiness Management Strategies

Based on personality data, the Labor Manager can recommend:
1. **Social needs**: Assign to tavern duty, increase meeting zone time
2. **Creative needs**: Enable crafting labors, assign to workshop
3. **Religious needs**: Assign to temple duty
4. **Physical needs**: Ensure adequate food/drink/rest
5. **Achievement needs**: Enable labors matching highest skills for masterwork potential
6. **Family needs**: Ensure family members have adjacent rooms, avoid separating families across squads

---

## 5. Data Requirements

### 5.1 Live Unit Data (from DFHack Lua Bridge)

**Currently captured** (in `chronicler-bridge.lua` v6, 16 sections):
- `unit_summary`: 12 fields + flags + mood + emotions
- `dwarf_skills`: skill arrays per unit
- `dwarf_emotions`: emotion/thought arrays per unit
- `squads`: squad membership and orders
- `zones`: zone assignments

**Not yet captured** (required for Labor Manager):
- `unit.status.labors[]` -- complete labor toggle array (critical for LM-001)
- `unit.body.physical_attrs[]` -- 6 physical attributes
- `unit.status.current_soul.mental_attrs[]` -- 12+ mental attributes
- `unit.status.current_soul.personality.values[]` -- value/belief data
- `unit.status.current_soul.personality.ethics[]` -- ethical stances
- `unit.status.current_soul.personality.mannerisms[]` -- behavioral quirks
- `unit.status.current_soul.personality.needs[]` -- need satisfaction
- `unit.status.current_soul.personality.goals[]` -- life goals/dreams
- `unit.status.current_soul.personality.stress_level` -- stress level
- `unit.status.current_soul.performance_skills` -- artistic skills
- `unit.health` / `unit.body.wounds[]` -- health/wound data
- `unit.inventory[]` -- equipped items
- `unit.birth_year`, `unit.old_year` -- lifespan data
- `unit.relationship_ids[9]` -- family relationship IDs
- `unit.custom_profession` -- custom profession string
- Full personality memories/preferences vectors

### 5.2 Skill Snapshots (Time-Series)

For skill progression tracking (LM-002), periodic snapshots of skill data:

```sql
CREATE TABLE IF NOT EXISTS skill_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    unit_id         INT NOT NULL,
    skill_id        TEXT NOT NULL,     -- job_skill enum name
    rating          INT NOT NULL,       -- 0-20 skill_rating
    experience      INT NOT NULL,       -- XP points
    game_year       INT NOT NULL,
    game_tick       INT NOT NULL,
    captured_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, unit_id, skill_id, game_year, game_tick)
);
```

### 5.3 CDM Tables (Existing)

**Already relevant**:
- `units` table: `id, world_id, figure_id, name, race, caste, site_id, pos_x, pos_y, pos_z, skills_json, labors_json, attributes_json, personality_json, beliefs_json, goals_json, relationships_json, mood, stress_level, updated_at`
- `fortress_denizens` table: `id, world_id, unit_id, hf_id, name, english_name, race, status, embark, arrival_year, arrival_tick, departure_year, departure_tick, departure_cause, narrative_value, last_seen_tick, details`
- `unit_events` table: Change events (ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED)

### 5.4 Additional CDM Tables Needed

```sql
-- Labor assignment history (track changes over time)
CREATE TABLE IF NOT EXISTS labor_assignments (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    unit_id         INT NOT NULL,
    labor_id        TEXT NOT NULL,      -- unit_labor enum name
    enabled         BOOLEAN NOT NULL,
    changed_at_year INT,
    changed_at_tick INT,
    changed_by      TEXT DEFAULT 'user', -- 'user', 'auto', 'advisor'
    captured_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Custom profession definitions
CREATE TABLE IF NOT EXISTS custom_professions (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    name            TEXT NOT NULL,
    labors_json     JSONB NOT NULL,     -- {"Mining": true, "Masonry": false, ...}
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, name)
);

-- Personality snapshots (for trend analysis)
CREATE TABLE IF NOT EXISTS personality_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL,
    unit_id         INT NOT NULL,
    stress_level    INT,
    thoughts_json   JSONB,              -- recent thoughts array
    needs_json      JSONB,              -- needs with satisfaction levels
    game_year       INT NOT NULL,
    game_tick       INT NOT NULL,
    captured_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.5 Unified Person Schema (JSON for LLM)

The planning history defines this canonical JSON structure for merged Unit + HF data:

```json
{
  "name": "Urist McHammer",
  "english_name": "Suntin",
  "race": "Dwarf",
  "caste": "Female",
  "birth_year": 23,
  "age": 127,
  "is_alive": true,
  "profession": "Legendary Miner",
  "civilization": "The Dagger of Feasting",
  "relationships": [
    {"type": "Spouse", "name": "Olin Lashskirt", "hf_id": 12345}
  ],
  "personality": {
    "notable_traits": ["Very brave"],
    "values": ["Family"],
    "unmet_needs": ["Socialize"],
    "dreams": ["Start a family (accomplished)"]
  },
  "positions_held": [
    {"title": "Militia Commander", "entity": "The Dagger of Feasting", "current": true}
  ],
  "skills": [
    {"name": "Mining", "level": 20, "label": "Legendary"}
  ],
  "key_events": [
    {"year": 45, "type": "slew", "description": "Slew a forgotten beast"}
  ],
  "sources": {"unit_id": 567, "hf_id": 12340, "world_id": 8}
}
```

**Unit-HF Merge Strategy (6 Rules)**:
1. Start with Unit data (always fresher)
2. Overlay HF data for historical depth
3. For conflicts: prefer Unit for real-time; prefer HF for historical facts
4. Personality data is Unit-only
5. Event history from TWO sources, distinguished by `live_generated` flag
6. Embark dwarves with no HF: flag `embark: true`

---

## 6. Existing Implementation Status

### 6.1 Currently Built (v0.8)

| Component | Status | Details |
|-----------|--------|---------|
| Unit data capture in bridge | COMPLETE | 12 fields + flags + mood + emotions per unit |
| Skill capture in bridge | COMPLETE | `dwarf_skills` section captures skill arrays |
| Emotion capture in bridge | COMPLETE | `dwarf_emotions` section captures thought/emotion data |
| Squad capture in bridge | COMPLETE | `squads` section with membership |
| Change detection (5 types) | COMPLETE | ARRIVED, DIED, SKILL_UP, PROFESSION_CHANGED, SQUAD_CHANGED |
| Watcher polling daemon | COMPLETE | `chronicler watch` CLI, configurable interval |
| Fortress denizens table | PLANNED | DDL ready, implementation Phase 1 |
| CDM units table | COMPLETE | Schema with skills_json, personality_json, etc. |
| Test suite | COMPLETE | 131 tests, 0.19s |

### 6.2 Not Yet Built (Required for Labor Manager)

| Component | Status | Effort | Priority |
|-----------|--------|--------|----------|
| Labor toggle array capture | NOT STARTED | S | P1 -- critical for core feature |
| Physical/mental attribute capture | NOT STARTED | S | P1 |
| Full personality capture (values, ethics, mannerisms) | NOT STARTED | M | P1 |
| Need satisfaction capture | NOT STARTED | S | P1 |
| Goal/dream capture | NOT STARTED | S | P2 |
| Stress level capture | NOT STARTED | S | P1 |
| Wound/health capture | NOT STARTED | M | P2 |
| Inventory/equipment capture | NOT STARTED | M | P2 |
| Relationship IDs capture | NOT STARTED | S | P1 |
| Performance skills capture | NOT STARTED | S | P3 |
| Labor grid UI | NOT STARTED | XL | P1 |
| Personality visualization | NOT STARTED | L | P2 |
| Skill progression time-series | NOT STARTED | M | P2 |
| Stress trend analysis | NOT STARTED | L | P3 |
| Labor optimization engine | NOT STARTED | XL | P3 |
| Custom profession system | NOT STARTED | M | P2 |
| Batch labor operations | NOT STARTED | M | P2 |
| DFHack labor write-back | NOT STARTED | M | P1 |

### 6.3 Bridge Data Captured vs. Needed

**Currently captured** (bridge v6):
```
game_time, creature_raws, unit_summary (12 fields + flags + mood + emotions),
armies, buildings, artifacts, announcements (cursor-based, 200/tick),
diplomacy, history (cursor-based, 100/tick), world_info, entities,
dwarf_skills, dwarf_emotions, zones, event_collections, squads,
mandates, crimes
```

**Not captured but needed for Labor Manager**:
```
unit.status.labors[]              -- THE critical missing piece
unit.body.physical_attrs[]        -- 6 physical attributes
unit.status.current_soul.mental_attrs[]  -- 12+ mental attributes
unit.status.current_soul.personality.values[]
unit.status.current_soul.personality.ethics[]
unit.status.current_soul.personality.mannerisms[]
unit.status.current_soul.personality.needs[]
unit.status.current_soul.personality.goals[]
unit.status.current_soul.personality.stress_level
unit.status.current_soul.performance_skills
unit.health / unit.body.wounds[]
unit.inventory[]
unit.birth_year / unit.old_year
unit.relationship_ids[9]
unit.custom_profession
```

---

## 7. Open Questions & Design Decisions

### 7.1 Critical Design Decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Labor write-back mechanism** | (a) `dfhack-run` SSH to set individual labors, (b) Deploy Lua script that accepts batch labor commands via HTTP, (c) Bridge extension to accept write commands | (b) -- HTTP endpoint on bridge for batch operations is most efficient. Single SSH round-trip per batch. |
| 2 | **Grid UI framework** | (a) HTML table with JavaScript toggles, (b) Canvas/WebGL grid (Dwarf Therapist style), (c) Virtual scrolling table (AG Grid or similar) | (c) -- Virtual scrolling table handles 200+ dwarves x 80+ labors without DOM explosion. AG Grid or TanStack Table with custom cell renderers. |
| 3 | **Personality visualization style** | (a) Radar chart (D3.js), (b) Bar chart with color coding, (c) Natural language only, (d) Combined: visual + text | (d) -- Combined approach gives both at-a-glance and detailed views. |
| 4 | **Skill snapshot frequency** | (a) Every watcher cycle (~10s), (b) Only on skill-up events, (c) Once per game day/month | (b) -- Event-driven snapshots avoid massive storage while capturing all changes. |
| 5 | **Labor optimization algorithm** | (a) Heuristic rules (df-ai style), (b) Constraint satisfaction solver, (c) LLM-based recommendation, (d) Hybrid: rules + LLM explanation | (d) -- Rules for fast computation, LLM for explanation and edge cases. |
| 6 | **Stress trend prediction** | (a) Simple linear regression, (b) Threshold-based alerts only, (c) ML model trained on historical data | (b) initially, then (a) -- Start with simple threshold alerts, add trend analysis later. |
| 7 | **Real-time vs. polled labor state** | (a) Poll labor state every watcher cycle, (b) Event-driven via `INVENTORY_CHANGE` or similar | (a) -- Labor state changes are infrequent; polling every 10s is sufficient. No DFHack event for labor toggle changes. |

### 7.2 Technical Uncertainties

1. **Labor write-back latency**: Setting labors via `dfhack-run` SSH involves a network round-trip (~50-100ms). For batch operations (toggling 20 labors on 5 dwarves = 100 commands), this could take 5-10 seconds. Need to batch into single Lua script execution.

2. **DFHack labor enumeration completeness**: The `unit_labor` enum in df-structures may not match the exact labor set in DF 53.10. Need empirical verification of available labors.

3. **Performance with 200+ dwarves**: Full personality + skill + attribute capture for 200+ dwarves every 10 seconds = significant data volume. May need selective capture (only capture full personality on detail view request, not every poll cycle).

4. **Stress calculation accuracy**: The exact stress accumulation formula is partially documented. DF's internal stress mechanics may not be fully reverse-engineered.

5. **Custom profession persistence**: Where to store custom profession definitions -- in Chronicler's PostgreSQL (persistent across sessions but not in-game) or injected into DFHack (visible in-game but lost on DF restart).

6. **Labor-skill mapping**: Not all labors have corresponding skills. The mapping between `unit_labor` enum and `job_skill` enum is not 1:1. Need a complete mapping table.

### 7.3 Architecture Implications

**Bridge Extension Required**: The `chronicler-bridge.lua` needs approximately 200-300 additional lines to capture all Labor Manager data. New sections:
- `labors` section: complete labor toggle array per citizen
- `personality_full` section: values, ethics, mannerisms, needs, goals, stress
- `attributes` section: physical + mental attributes
- `health` section: wound/health data
- `equipment` section: inventory items

**Write Path Required**: Current bridge is read-only. Labor Manager needs a write path:
- New `chronicler-commands.lua` script that accepts JSON commands
- HTTP endpoint (port 8889 or separate port) for receiving commands
- Command types: `set_labor`, `set_profession`, `assign_squad`, `batch_labor`

**WebSocket for Real-Time Updates**: Labor grid should update in real-time:
- Bridge emits events when labor/skill/mood changes detected
- WebSocket push from Python watcher to frontend
- Matches existing SSE streaming pattern from storyteller

### 7.4 Deferred Decisions

- **Labor template sharing**: Should custom profession templates be exportable/importable between different fortress saves?
- **Historical labor data**: How long to retain labor assignment history? Rolling window vs. full history?
- **Multi-user labor management**: If multiple browser tabs are open, how to handle concurrent labor modifications?
- **Integration with df-ai heuristics**: Should df-ai's labor assignment rules be embedded as system prompt context for the LLM advisor, or as compiled rule engine?
- **Graphiti/Neo4j integration**: Should dwarf relationship graphs be stored in Neo4j for graph queries, or remain in PostgreSQL JSONB?

---

## 8. Implementation Roadmap (Labor Manager Phases)

### Phase LM-1: Data Foundation (Bridge Extension)
- Extend `chronicler-bridge.lua` with labor, personality, attribute, health sections
- Add `unit.relationship_ids[9]` capture
- Add `unit.status.labors[]` complete capture
- Add stress_level capture
- Estimated effort: M (Medium)

### Phase LM-2: Core Labor Grid UI
- Implement virtual scrolling grid (dwarves x labors)
- Read-only initially (display labor state from bridge data)
- Filter/sort by name, profession, skill level
- Color-coded cells by skill level
- Estimated effort: XL (Extra Large)

### Phase LM-3: Labor Write-Back
- Implement `chronicler-commands.lua` for accepting labor modifications
- HTTP endpoint for batch labor commands
- Wire grid toggle actions to write-back
- Estimated effort: L (Large)

### Phase LM-4: Personality & Psychology Display
- Personality facet visualization (radar + bar + text)
- Value/belief display
- Thought/emotion display
- Stress monitoring with color-coded indicators
- Need satisfaction display
- Estimated effort: L (Large)

### Phase LM-5: Advanced Features
- Custom profession system
- Batch labor operations
- Skill progression tracking (time-series)
- Stress trend analysis
- Labor optimization advisor (LLM-powered)
- Military draft/dismiss advisor
- Noble management
- Estimated effort: XL (Extra Large)

---

## 9. Reference Data

### 9.1 DF Labor Types (Complete List)

The `unit_labor` enum defines all assignable labors. Key categories:

**Mining/Digging**: MINE
**Woodworking**: CARPENTER, BOWYER, WOOD_CRAFT
**Stoneworking**: MASON, STONE_CRAFT, STONE_DETAIL
**Hunting**: HUNT, TRAPPER, ANIMAL_TRAIN, ANIMAL_CARE
**Healthcare**: DIAGNOSE, SURGERY, BONE_SETTING, SUTURE, DRESSING, FEED_WATER, RECOVER_WOUNDED
**Farming**: PLANT, MILLER, BREWER, COOK, PROCESS_PLANT, MAKE_CHEESE, MILK, SHEAR, BUTCHER, TANNER, MAKE_LYE, MAKE_POTASH, DYE, PRESS
**Metalsmithing**: SMELT, FORGE_WEAPON, FORGE_ARMOR, FORGE_FURNITURE, METAL_CRAFT
**Crafts**: LEATHER, CLOTHIER, MAKE_CLOTHES, EXTRACT_STRAND, WEAVE, POTTERY, GLAZER, WAX_WORKING, STRAND_EXTRACT
**Engineering**: MECHANIC, SIEGE_ENGINEER, SIEGE_OPERATE, PUMP_OPERATE
**Other**: FISH, CLEAN_FISH, DISSECT_FISH, FELL_TREE, CUT_GEM, ENCRUST_GEM, WOOD_BURN, MAKE_SOAP, MAKE_CHARCOAL, BUILD_ROAD, BUILD_CONSTRUCTION, PULL_LEVER, CLEAN, HAUL_STONE, HAUL_WOOD, HAUL_BODY, HAUL_FOOD, HAUL_REFUSE, HAUL_ITEMS, HAUL_FURNITURE, HAUL_ANIMALS, HAUL_WATER, GELD

### 9.2 DF Skill Rating Scale

| Rating | Label | Numeric |
|--------|-------|---------|
| 0 | Dabbling | 0 |
| 1 | Novice | 1 |
| 2 | Adequate | 2 |
| 3 | Competent | 3 |
| 4 | Skilled | 4 |
| 5 | Proficient | 5 |
| 6 | Talented | 6 |
| 7 | Adept | 7 |
| 8 | Expert | 8 |
| 9 | Professional | 9 |
| 10 | Accomplished | 10 |
| 11 | Great | 11 |
| 12 | Master | 12 |
| 13 | High Master | 13 |
| 14 | Grand Master | 14 |
| 15+ | Legendary | 15-20 |

### 9.3 Physical Attributes

| Attribute | Description | Affects |
|-----------|-------------|---------|
| STRENGTH | Muscle power | Carrying capacity, melee damage |
| AGILITY | Speed and coordination | Dodge, attack speed |
| TOUGHNESS | Physical resilience | Damage resistance |
| ENDURANCE | Stamina | Fatigue resistance |
| RECUPERATION | Healing speed | Wound recovery |
| DISEASE_RESISTANCE | Immune system | Disease chance |

### 9.4 Mental Attributes

| Attribute | Description | Affects |
|-----------|-------------|---------|
| ANALYTICAL_ABILITY | Logic and reasoning | Research, strategy skills |
| FOCUS | Concentration | Skill improvement rate |
| WILLPOWER | Mental resilience | Stress resistance, interrogation |
| CREATIVITY | Imaginative capacity | Art quality, invention |
| INTUITION | Gut instinct | Ambush detection, social reading |
| PATIENCE | Tolerance for delay | Teaching, crafting quality |
| MEMORY | Recall ability | Skill retention, knowledge |
| LINGUISTIC_ABILITY | Language aptitude | Communication, writing |
| SPATIAL_SENSE | Spatial reasoning | Architecture, navigation |
| MUSICALITY | Musical aptitude | Performance skills |
| KINESTHETIC_SENSE | Body awareness | Combat, dance |
| EMPATHY | Emotional awareness | Social skills, diplomacy |

### 9.5 Dwarf Therapist Memory Sections Relevant to Labor Manager

| Section | INI Key | Data Scope |
|---------|---------|------------|
| MEM_UNIT | "dwarf_offsets" | Core unit struct: position, job, labors, profession |
| MEM_SOUL | "soul_details" | Soul: skills, preferences, personality compound |
| MEM_EMOTION | "emotion_offsets" | Emotion/thought entries |
| MEM_NEED | "need_offsets" | Need satisfaction data |
| MEM_HEALTH | "health_offsets" | Health status |
| MEM_WOUND | "unit_wound_offsets" | Individual wound records |
| MEM_ACTIVITY | "activity_offsets" | Current activity |
| MEM_RACE | "race_offsets" | Race definitions |
| MEM_CASTE | "caste_offsets" | Caste definitions |

All 29 sections are equivalent to DFHack Lua `df.global.*` paths. Chronicler accesses the same data through Lua rather than direct memory reads.

### 9.6 df-ai Stock Threshold Model (Relevant to Labor Recommendations)

df-ai's three-tier threshold system drives production and therefore labor needs:

```
Watch.Needed[item]         -- absolute minimum stock
Watch.NeededPerDwarf[item] -- per 100 dwarves scaling
Watch.WatchStock[item]     -- items to monitor
Watch.AlsoCount[item]      -- count for context
```

When stock falls below threshold, production is needed, which means the corresponding labor must be enabled on at least one dwarf. This creates the Stock Advisor -> Labor Manager feedback loop.

---

## 10. Sources

All findings extracted from these source documents:

1. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/planning-history.md` -- Sections 3.6 (Labor Manager), 3.4 (AI Player/Advisor), 4.3 (Unit-HF Data Model), 4.4 (Database Schema), 5.2 (Live Bridge)
2. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/df-ai-research.md` -- Sections 3a (Population), 7 (Military Management), 9 (Population Management), complete subsystem taxonomy
3. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/dfhack-infrastructure-research.md` -- Sections 2 (DwarfFortressLogger/Dwarf Therapist), 3 (df-structures memory layouts), 5 (myDFHackScripts patterns)
4. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/dwarven-surveyor-scripts-research.md` -- Part 2 (myDFHackScripts unit access patterns, death detection, citizen logging)
5. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research/narrator-weblegends-research.md` -- weblegends entity page structure (figure relationship rendering, occupation rendering)
6. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/research-synthesis.md` -- Sections 3 (HF field completeness audit), 7 (bridge architecture validation), 12 (consolidated action items)

---

*Component 06 research complete. 40 features inventoried. All personality, psychology, labor, military, noble, and population management systems documented with implementation details, data structures, and reference tool analysis.*
