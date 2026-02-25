# Repository Research Report: Dwarf Therapist (DwarfFortressLogger)

**Repository**: `GitRepos/DwarfFortressLogger` (also at `DwarfCron/repos/Dwarf-Therapist`)
**Language**: C++ (Qt5 GUI application)
**Purpose**: External labor management and dwarf inspection tool for Dwarf Fortress
**Scale**: 300+ source files (header + implementation), Qt5 GUI
**Note**: The repo name "DwarfFortressLogger" is the fork name; the tool is Dwarf Therapist

---

## Repository Overview

Dwarf Therapist is the most popular external tool for Dwarf Fortress, providing a spreadsheet-like interface for managing dwarf labors, viewing attributes, skills, personalities, and health. It reads DF memory directly (not via DFHack RPC) using platform-specific memory inspection techniques. This is the primary reference for the "Labor Manager" component of Chronicler.

---

## Architecture & Key Components

### Core Data Model (src/)

**Dwarf** (`dwarf.h/cpp`): The central data class representing a single fortress inhabitant
- Name, nickname, translated name
- Current job, profession, custom profession
- Skills (with experience levels)
- Attributes (physical + mental)
- Labors (enabled/disabled flags for all labor types)
- Personality traits (50 facets)
- Beliefs (44 types)
- Goals/dreams
- Thoughts and emotions
- Happiness/stress level
- Health information
- Body part damage
- Equipment quality
- Focus/needs satisfaction
- Squad assignment
- Caste information
- Activity status

**DwarfJob** (`dwarfjob.h/cpp`): Current job tracking

**Attribute** (`attribute.h/cpp`): Physical/mental attribute system
- Strength, Agility, Toughness, Endurance, etc.
- Analytical Ability, Creativity, Patience, Memory, etc.

**Belief** (`belief.h/cpp`): Belief/value system (44 beliefs with strength levels)

**Emotion/EmotionGroup** (`emotion.h/cpp`, `emotiongroup.h/cpp`):
- Emotional state tracking
- Thought-emotion associations
- Stress contribution tracking

**Activity/ActivityEvent** (`activity.h/cpp`, `activityevent.h/cpp`):
- Current activities (socializing, praying, working, training)

### Column System

Dwarf Therapist's UI is a customizable grid with columns. Each column type extracts and displays specific dwarf data:

**SkillColumn** (`skillcolumn.h/cpp`): Skill level display with experience overlay
**LaborColumn** (`laborcolumn.h/cpp`): Toggle labor on/off
**AttributeColumn** (`attributecolumn.h/cpp`): Attribute values with rating
**BeliefColumn** (`beliefcolumn.h/cpp`): Belief strengths
**HappinessColumn** (`happinesscolumn.h/cpp`): Stress/happiness level
**HealthColumn** (`healthcolumn.h/cpp`): Injury/health status
**EquipmentColumn** (`equipmentcolumn.h/cpp`): Armor/weapon status
**FlagColumn** (`flagcolumn.h/cpp`): Boolean unit flags
**FocusColumn** (`focuscolumn.h/cpp`): Need satisfaction level
**CurrentJobColumn** (`currentjobcolumn.h/cpp`): Active task display
**CustomProfessionColumn** (`customprofessioncolumn.h/cpp`): Custom profession assignment

### Role System

**Role** (`role.h/cpp`): Role-based labor optimization
- Roles define ideal attribute/skill/trait combinations
- Automatic fitness scoring per dwarf per role
- Optimal assignment suggestions

**DefaultRoleWeight** (`defaultroleweight.h/cpp`): Default weighting factors

### Grid/View System

**GridView** (`gridview.h/cpp`): Customizable column layout
**GridViewDialog** (`gridviewdialog.h/cpp`): Column set configuration
**GridViewWidget** (`gridviewwidget.h/cpp`): Rendering engine

**DwarfModel** (`dwarfmodel.h/cpp`): Qt model for dwarf data
**DwarfModelProxy** (`dwarfmodelproxy.h/cpp`): Sort/filter proxy

### Memory Access

**DFInstance** (`dfinstance.h/cpp`): Abstract base for DF memory access
- `dfinstancewindows.h/cpp`: Windows process memory reading
- `dfinstancelinux.h/cpp`: Linux /proc/pid/mem reading
- `dfinstanceosx.h/cpp`: macOS mach_vm_read
- `dfinstancenix.h/cpp`: Unix shared base

**GameDataReader** (`gamedatareader.h/cpp`): Memory layout configuration (loaded from INI)

### Custom Profession System

**CustomProfession** (`customprofession.h/cpp`): User-defined profession templates
- Labor sets
- Icon assignments
- Nickname patterns

### Fortress Entity

**FortressEntity** (`fortressentity.h/cpp`): Fortress-level data
- Noble positions
- Entity relationships
- Civilization information

### Equipment System

**EquipWarn** (`equipwarn.h/cpp`): Equipment deficit warnings
**EquipmentOverviewWidget** (`equipmentoverviewwidget.h/cpp`): Equipment summary view

### Color/Display System

**AdaptiveColorFactory** (`adaptivecolorfactory.h/cpp`): Dynamic color scaling
**CellColors** (`cellcolors.h/cpp`): Per-cell color computation
**ColorButton** (`colorbutton.h/cpp`): Color picker widgets

---

## Extractable Features for Chronicler

### F-DT-01: Labor Assignment Spreadsheet
- **User QoL**: Grid view showing all dwarves as rows, all labors as columns, with click-to-toggle assignment. The defining feature of Dwarf Therapist.
- **Implementation**: GridViewWidget renders a scrollable grid with DwarfModel providing data. LaborColumn provides toggle interaction. Changes are batched and committed back to DF memory.
- **Chronicler relevance**: Core feature of the Labor Manager component. Web implementation using HTML table with checkbox columns, backed by DFHack Lua commands for labor assignment.

### F-DT-02: Role-Based Labor Optimization
- **User QoL**: Automatically suggest which dwarves are best suited for which roles based on their attributes, skills, and personality traits
- **Implementation**: Role system scores each dwarf against role profiles. Profile defines weighted ideal attributes/skills/traits. Score = weighted sum of (actual/ideal) ratios.
- **Chronicler relevance**: AI-assisted labor recommendation in the Labor Manager; "Urist is 87% fit for Military, 92% fit for Mason"

### F-DT-03: Personality Trait Viewer (50 facets)
- **User QoL**: See each dwarf's full personality profile — all 50 personality facets with strength levels
- **Implementation**: Personality facets stored as integer values (-3 to +3 or similar range). Displayed as descriptive text ("very nervous" to "extremely calm").
- **Chronicler relevance**: People tab personality display; narrative personality descriptions for Storyteller ("Urist is a calm, analytical dwarf who values martial prowess")

### F-DT-04: Belief System Viewer (44 beliefs)
- **User QoL**: See what each dwarf values and believes — helps understand their needs and morale
- **Implementation**: 44 belief types (TRUTH, COMMERCE, POWER, etc.) with strength levels.
- **Chronicler relevance**: Belief data in CDM; personality-driven narrative enrichment

### F-DT-05: Emotion/Thought Tracking
- **User QoL**: See current emotional state, recent thoughts, stress contributors for each dwarf
- **Implementation**: EmotionGroup aggregates thoughts by type, tracks stress contribution per thought, computes overall happiness.
- **Chronicler relevance**: "Why is Urist unhappy?" query for Storyteller; stress trend tracking in time-series data

### F-DT-06: Skill Progression Display
- **User QoL**: See skill levels with experience progress bars, track skill growth over time
- **Implementation**: SkillColumn renders skill level as color-coded cell with experience overlay. Skills have raw experience points and derived levels.
- **Chronicler relevance**: Skill progression charts in Explorer; time-series skill tracking from watcher snapshots

### F-DT-07: Health/Injury Display
- **User QoL**: See wound status, body part damage, health categories for each dwarf
- **Implementation**: HealthColumn, HealthCategory, HealthInfo classes parse wound data. BodyPartDamage, BodyPartLayer track specific injuries.
- **Chronicler relevance**: Health status in People tab; injury narratives for Storyteller

### F-DT-08: Equipment Status Overview
- **User QoL**: See what each dwarf is wearing/wielding, identify equipment deficits
- **Implementation**: EquipmentColumn maps items to body slots, EquipWarn flags missing/damaged equipment.
- **Chronicler relevance**: Equipment status display in People tab; military readiness assessment

### F-DT-09: Custom Profession Templates
- **User QoL**: Define custom professions with specific labor sets, apply to multiple dwarves
- **Implementation**: CustomProfession stores labor flag set + display name + icon. Apply to dwarf sets all labors according to template.
- **Chronicler relevance**: Profession template management in Labor Manager; "set all miners to also do masonry"

### F-DT-10: Adaptive Color Scaling
- **User QoL**: Visually distinguish good/bad/neutral values at a glance using color gradients
- **Implementation**: AdaptiveColorFactory computes colors based on value ranges with configurable gradients. Green=good, red=bad, gradient between.
- **Chronicler relevance**: Color coding for Explorer tables; heatmap visualizations for skill/happiness/stress

### F-DT-11: Sort/Filter/Group Dwarves
- **User QoL**: Sort by any attribute, filter by profession/squad/custom criteria, group by category
- **Implementation**: DwarfModelProxy implements Qt's sort/filter proxy with multi-criteria sorting and text-based filtering.
- **Chronicler relevance**: Explorer People tab sorting/filtering; "show me all unhappy military dwarves sorted by stress"

### F-DT-12: Activity Monitoring
- **User QoL**: See what each dwarf is currently doing — working, socializing, praying, idle
- **Implementation**: Activity/ActivityEvent classes decode the game's activity system. CurrentJobColumn shows the current task.
- **Chronicler relevance**: Activity status in live fortress monitoring; idle dwarf detection for labor optimization

### F-DT-13: Need Satisfaction Tracking
- **User QoL**: See which needs are unmet for each dwarf (prayer, alcohol, socialization, etc.)
- **Implementation**: FocusColumn displays need satisfaction levels. Needs system tracks time since last satisfaction event.
- **Chronicler relevance**: Need-based narrative enrichment; "Urist hasn't had a drink in 3 months" alerts

### F-DT-14: Memory Layout Configuration (INI files)
- **User QoL**: Update tool for new DF versions by editing memory layout INI files without recompilation
- **Implementation**: GameDataReader loads memory offsets from INI files, enabling community updates between releases.
- **Chronicler relevance**: Understanding of how external tools locate DF data; could inform alternative data access methods

---

## Key Insights

1. **Dwarf Therapist IS the reference implementation** for labor management — any Chronicler Labor Manager must match or exceed its capabilities
2. **The role-based optimization system** is unique to DT — no other tool suggests optimal labor assignments based on dwarf attributes
3. **50 personality facets + 44 beliefs + emotions** = the deepest psychological model in any DF tool — Chronicler should expose all of this data
4. **Direct memory reading** (not DFHack RPC) means DT works independently of DFHack — Chronicler instead leverages DFHack's Lua API which is safer but has the game-thread dispatch issue
5. **300+ source files** = DT is a substantial application — Chronicler's web-based approach will be architecturally simpler but must match feature parity
6. **Custom profession templates** are heavily used by players — the Mod Manager or Labor Manager should support saving/loading these
7. **The grid view paradigm** (dwarves as rows, properties as columns) is the established UI pattern — Chronicler's web table should follow the same layout
8. **Equipment/health/activity monitoring** together provide a complete "dwarf status dashboard" that Chronicler should replicate
