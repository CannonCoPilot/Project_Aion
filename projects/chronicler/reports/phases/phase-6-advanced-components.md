# Phase 6: Advanced Components -- PRD/Roadmap

**Version**: 1.0
**Date**: 2026-02-25
**Phase Duration**: 6-10 weeks
**Milestone**: M6 -- Full Suite
**Entry State**: No mod management, no labor management, no AI advisor
**Exit State**: Core mod manager, labor toggle grid with skill tracking, LLM-enhanced fortress advisor

**Parent Document**: Full Project Roadmap (full-project-roadmap.md)
**Dependencies**: Phase 2 (explorer pages), Phase 3 (narrative engine for advisor), Phase 5 (enhanced bridge for labor data)
**Requirements Covered**: REQ-MOD-001 through MOD-020, REQ-LAB-001 through LAB-025, REQ-ADV-001 through ADV-025

---

## 1. Phase Overview

Phase 6 builds the three advanced user-facing components that distinguish Chronicler from a simple legends viewer: (1) Mod Manager for DF mod lifecycle management, (2) Labor Manager for Dwarf Therapist-style population management, and (3) AI Fortress Advisor for LLM-enhanced gameplay guidance. Each component is substantial and can be developed in parallel once prerequisites are met.

This phase is divided into core (P3 priority) and advanced (P4/deferred) sub-stages. The core sub-stages deliver functional, usable components. The advanced sub-stages add optimization, automation, and stretch features that can be deferred without blocking Phase 7.

---

## 2. Stage 6.1: Mod Manager Core

**Duration**: 2-3 weeks
**Dependencies**: Phase 1 (world_modpacks table), VM infrastructure (SSH access to DF install)
**Deliverables**: Mod discovery, info.txt parsing, modpack CRUD, load order, basic conflict detection, CLI

### 2.1 Filesystem Mod Discovery

**Requirement**: REQ-MOD-001
**Priority**: P3

**Description**: Scan the DF installation directories to discover installed mods.

**Scan locations** (relative to DF install directory):
```
<DF_dir>/Mods/                    -- User-installed mods
<DF_dir>/data/vanilla/            -- Vanilla game data
<DF_dir>/data/installed_mods/     -- Currently active mods
```

**Implementation**:
```python
class ModDiscovery:
    """Discover mods from DF filesystem via SSH."""

    DF_MOD_PATHS = [
        'Mods/',
        'data/vanilla/',
        'data/installed_mods/',
    ]

    async def scan(self, df_install_path: str) -> list[dict]:
        """Scan DF directories for mods. Returns list of mod metadata."""
        mods = []
        for path in self.DF_MOD_PATHS:
            full_path = os.path.join(df_install_path, path)
            # List subdirectories via SSH
            dirs = await ssh_exec(f'ls -1 "{full_path}" 2>/dev/null')
            for mod_dir in dirs.split('\n'):
                mod_dir = mod_dir.strip()
                if not mod_dir:
                    continue
                info_path = os.path.join(full_path, mod_dir, 'info.txt')
                info_content = await ssh_exec(f'cat "{info_path}" 2>/dev/null')
                if info_content:
                    mod = self._parse_info_txt(info_content)
                    mod['source_path'] = os.path.join(path, mod_dir)
                    mod['source_type'] = self._classify_source(path)
                    mods.append(mod)
        return mods

    def _classify_source(self, path: str) -> str:
        if 'vanilla' in path:
            return 'vanilla'
        elif 'installed_mods' in path:
            return 'active'
        else:
            return 'available'
```

### 2.2 DFHack Live Mod Discovery

**Requirement**: REQ-MOD-002
**Priority**: P3

```python
async def discover_mods_via_dfhack(self) -> list[dict]:
    """Query DFHack for currently loaded mods."""
    result = await dfhack_run_lua("""
        local mods = {}
        -- Access mod list through DFHack's mod awareness
        for _, mod in ipairs(df.global.world.raws.installed_mods) do
            table.insert(mods, {
                id = mod.id,
                name = mod.name,
                version = mod.version,
                numeric_version = mod.numeric_version,
            })
        end
        return json.encode(mods)
    """)
    return json.loads(result)
```

### 2.3 info.txt Parser

**Requirement**: REQ-MOD-003
**Priority**: P3

**All v50 fields**:
```python
class InfoTxtParser:
    """Parse DF mod info.txt files (v50 format)."""

    FIELDS = {
        '[ID:': 'id',
        '[NAME:': 'name',
        '[NUMERIC_VERSION:': 'numeric_version',
        '[DISPLAYED_VERSION:': 'displayed_version',
        '[EARLIEST_COMPATIBLE_NUMERIC_VERSION:': 'earliest_compatible',
        '[EARLIEST_COMPATIBLE_DISPLAYED_VERSION:': 'earliest_compatible_display',
        '[AUTHOR:': 'author',
        '[DESCRIPTION:': 'description',
        '[REQUIRES_ID:': 'requires_ids',  # multiple
        '[REQUIRES_ID_BEFORE_ME:': 'requires_before',  # multiple
        '[REQUIRES_ID_AFTER_ME:': 'requires_after',  # multiple
        '[CONFLICTS_WITH_ID:': 'conflicts_with',  # multiple
        '[STEAM_TITLE:': 'steam_title',
        '[STEAM_DESCRIPTION:': 'steam_description',
        '[STEAM_TAG:': 'steam_tags',  # multiple
        '[STEAM_KEY_VALUE_TAG:': 'steam_kv_tags',  # multiple
        '[STEAM_METADATA:': 'steam_metadata',
        '[STEAM_FILE_ID:': 'steam_file_id',
        '[STEAM_CHANGELOG:': 'steam_changelog',
    }

    MULTI_VALUE_FIELDS = {
        'requires_ids', 'requires_before', 'requires_after',
        'conflicts_with', 'steam_tags', 'steam_kv_tags'
    }

    def parse(self, content: str) -> dict:
        """Parse info.txt content into structured dict."""
        result = {field: [] if field in self.MULTI_VALUE_FIELDS else None
                  for field in set(self.FIELDS.values())}

        for line in content.split('\n'):
            line = line.strip()
            for prefix, field in self.FIELDS.items():
                if line.startswith(prefix):
                    value = line[len(prefix):].rstrip(']').strip()
                    if field in self.MULTI_VALUE_FIELDS:
                        result[field].append(value)
                    else:
                        result[field] = value
                    break

        return result
```

### 2.4 Modpack CRUD

**Requirement**: REQ-MOD-004
**Priority**: P3

```python
class ModpackManager:
    """Manage mod profiles via mod-manager.json."""

    CONFIG_FILENAME = 'mod-manager.json'

    async def list_profiles(self) -> list[dict]:
        """List all modpack profiles."""
        config = await self._load_config()
        return config.get('profiles', [])

    async def create_profile(self, name: str, mods: list[str]) -> dict:
        """Create a new modpack profile."""
        config = await self._load_config()
        profile = {
            'name': name,
            'mods': mods,
            'created_at': datetime.now().isoformat(),
            'is_default': False,
        }
        config.setdefault('profiles', []).append(profile)
        await self._save_config(config)
        return profile

    async def activate_profile(self, profile_name: str):
        """Activate a modpack profile (write to DF's mod config)."""
        profile = await self.get_profile(profile_name)
        # Write mod list to DF's installed_mods directory
        # This involves copying mod folders to data/installed_mods/
        for mod_id in profile['mods']:
            await self._install_mod(mod_id)

    async def snapshot_current(self, world_id: int):
        """Snapshot current active mods for a world."""
        active_mods = await self.discover_mods_via_dfhack()
        await db.execute(
            "INSERT INTO world_modpacks (world_id, modpack_name, mods) "
            "VALUES (:wid, :name, :mods)",
            {'wid': world_id, 'name': 'auto-snapshot', 'mods': json.dumps(active_mods)}
        )
```

### 2.5 Profile Import/Export

**Requirement**: REQ-MOD-005
**Priority**: P3

JSON format with version compatibility warnings.

### 2.6 Load Order Management

**Requirement**: REQ-MOD-006
**Priority**: P3

**18 canonical header types** (from DF modding reference):
```python
HEADER_ORDER = [
    'CREATURE', 'ENTITY', 'INTERACTION', 'LANGUAGE', 'MATERIAL_TEMPLATE',
    'INORGANIC', 'PLANT', 'ITEM', 'BUILDING', 'REACTION', 'TISSUE_TEMPLATE',
    'BODY', 'BODY_DETAIL_PLAN', 'CREATURE_VARIATION', 'DESCRIPTOR',
    'GRAPHICS', 'MUSIC', 'SOUND',
]
```

Mods are ordered by: (1) explicit dependency chains, (2) header type priority, (3) user-specified order.

### 2.7 Level 1 Conflict Detection

**Requirement**: REQ-MOD-007
**Priority**: P3

**Metadata-based conflict detection**:
```python
class ConflictDetector:
    """Detect mod conflicts from metadata."""

    def detect_level1(self, mods: list[dict]) -> list[dict]:
        """Level 1: metadata-based conflict detection."""
        conflicts = []
        mod_ids = {m['id']: m for m in mods}
        scanned = set()

        for mod in mods:
            # Check dependencies
            for req_id in mod.get('requires_ids', []):
                if req_id not in mod_ids:
                    conflicts.append({
                        'type': 'missing_dependency',
                        'severity': 'error',
                        'mod': mod['id'],
                        'requires': req_id,
                    })

            # Check explicit conflicts
            for conflict_id in mod.get('conflicts_with', []):
                if conflict_id in mod_ids:
                    conflicts.append({
                        'type': 'explicit_conflict',
                        'severity': 'error',
                        'mod1': mod['id'],
                        'mod2': conflict_id,
                    })

            # Check version compatibility
            for req_id in mod.get('requires_ids', []):
                if req_id in mod_ids:
                    req_mod = mod_ids[req_id]
                    earliest = mod.get('earliest_compatible')
                    if earliest and req_mod.get('numeric_version'):
                        if req_mod['numeric_version'] < earliest:
                            conflicts.append({
                                'type': 'version_incompatible',
                                'severity': 'warning',
                                'mod': mod['id'],
                                'requires': req_id,
                                'min_version': earliest,
                                'actual_version': req_mod['numeric_version'],
                            })

            # Check load order
            for req_before in mod.get('requires_before', []):
                if req_before in mod_ids:
                    # Check that req_before comes before this mod
                    pass  # Implementation depends on ordered list

            scanned.add(mod['id'])

        return conflicts
```

### 2.8 Visual Conflict Indicators

**Requirement**: REQ-MOD-010
**Priority**: P3

```css
.conflict-clean { border-left: 4px solid #28a745; }     /* Green */
.conflict-warning { border-left: 4px solid #ffc107; }   /* Yellow */
.conflict-overlap { border-left: 4px solid #fd7e14; }   /* Orange */
.conflict-fatal { border-left: 4px solid #dc3545; }     /* Red */
```

### 2.9 Modpack Snapshot at World Creation

**Requirement**: REQ-MOD-016
**Priority**: P3

Hook into worldgen detection (from Phase 5) to automatically snapshot active mods when a new world is created.

### 2.10 CLI Interface

**Requirement**: REQ-MOD-020
**Priority**: P3

```
chronicler mods list                    -- List discovered mods
chronicler mods profiles                -- List modpack profiles
chronicler mods activate <profile>      -- Activate a modpack profile
chronicler mods check                   -- Run conflict detection
chronicler mods snapshot <world_id>     -- Snapshot current mods for world
chronicler mods export <profile> <file> -- Export profile to JSON
chronicler mods import <file>           -- Import profile from JSON
```

---

## 3. Stage 6.2: Labor Manager Core

**Duration**: 2-3 weeks
**Dependencies**: Phase 5 (enhanced bridge with personality/skills data)
**Deliverables**: Citizen roster, skill display, stress monitoring, labor grid, personality visualization

### 3.1 Citizen Roster

**Requirement**: REQ-LAB-012
**Priority**: P2

**Route**: `GET /explorer/labor?world_id={wid}`

**API**: `GET /api/labor/roster?world_id={wid}`

```python
@app.get("/api/labor/roster")
async def get_citizen_roster(world_id: int):
    """Get current citizen roster with full labor manager data."""
    units = await db.fetch_all(
        "SELECT u.*, fd.narrative_value "
        "FROM units u "
        "LEFT JOIN fortress_denizens fd ON fd.world_id = u.world_id AND fd.unit_id = u.unit_id "
        "WHERE u.world_id = :wid AND u.is_alive = TRUE "
        "ORDER BY fd.narrative_value DESC NULLS LAST",
        {'wid': world_id}
    )
    return [enrich_unit_for_labor(u) for u in units]
```

**Roster display**: Table with columns for Name, Race, Profession, Stress, Squad, Notable Skills, and Labor Assignment Status.

### 3.2 Skill Display and Progression

**Requirement**: REQ-LAB-002
**Priority**: P3

```javascript
// Skill display with progression tracking
function renderSkillTable(unit) {
    const skills = unit.skills_json || [];
    const previousSkills = unit.previous_skills_json || [];

    return skills
        .sort((a, b) => b.rating - a.rating)
        .map(skill => {
            const prev = previousSkills.find(s => s.id === skill.id);
            const delta = prev ? skill.experience - prev.experience : 0;
            const ratingName = SKILL_RATING_NAMES[skill.rating] || `Level ${skill.rating}`;

            return `<tr>
                <td>${SKILL_NAMES[skill.id] || skill.name}</td>
                <td>${ratingName}</td>
                <td>${skill.experience}</td>
                <td class="${delta > 0 ? 'skill-up' : ''}">${delta > 0 ? '+' + delta : ''}</td>
            </tr>`;
        }).join('');
}

const SKILL_RATING_NAMES = {
    0: 'Dabbling', 1: 'Novice', 2: 'Adequate', 3: 'Competent',
    4: 'Skilled', 5: 'Proficient', 6: 'Talented', 7: 'Adept',
    8: 'Expert', 9: 'Professional', 10: 'Accomplished',
    11: 'Great', 12: 'Master', 13: 'High Master', 14: 'Grand Master',
    15: 'Legendary', 16: 'Legendary+1', 17: 'Legendary+2',
    18: 'Legendary+3', 19: 'Legendary+4', 20: 'Legendary+5',
};
```

### 3.3 Happiness/Stress Monitoring

**Requirement**: REQ-LAB-004
**Priority**: P2

```javascript
function getStressColor(stressLevel) {
    if (stressLevel < 0) return '#28a745';           // Ecstatic (green)
    if (stressLevel < 25000) return '#6c757d';       // Fine (gray)
    if (stressLevel < 50000) return '#ffc107';       // Unhappy (yellow)
    if (stressLevel < 100000) return '#fd7e14';      // Very unhappy (orange)
    return '#dc3545';                                 // Tantrum-prone (red)
}

function getStressLabel(stressLevel) {
    if (stressLevel < -100000) return 'Ecstatic';
    if (stressLevel < -25000) return 'Happy';
    if (stressLevel < 0) return 'Content';
    if (stressLevel < 25000) return 'Fine';
    if (stressLevel < 50000) return 'Unhappy';
    if (stressLevel < 100000) return 'Very Unhappy';
    return 'On the verge of a tantrum';
}
```

**Stress trend tracking**: Store stress snapshots per watcher cycle. Display mini sparkline chart showing trend.

### 3.4 Dwarf Filtering/Sorting

**Requirement**: REQ-LAB-008
**Priority**: P2

Multi-criteria filters: name search, race, profession, skill range, stress level, squad, has notable trait.

Sort options: Name, Stress, Profession, Highest Skill, Narrative Value, Arrival Date.

### 3.5 Thought/Emotion Display

**Requirement**: REQ-LAB-009
**Priority**: P2

```python
THOUGHT_TYPES = {
    0: "was interested in something",
    1: "was amused",
    2: "was annoyed",
    3: "was frightened",
    # ... 80+ thought types from df-structures
}

def render_emotions(emotions: list[dict]) -> list[str]:
    """Render recent emotions as natural language."""
    return [
        f"{THOUGHT_TYPES.get(e['type'], f'thought #{e[\"type\"]}')} "
        f"(strength: {e['strength']})"
        for e in sorted(emotions, key=lambda x: x['strength'], reverse=True)[:10]
    ]
```

### 3.6 Population Migration Tracking

**Requirement**: REQ-LAB-015
**Priority**: P2

Track arrivals and departures in `fortress_denizens` table. Link migrants to origin sites when available.

### 3.7 Deathwatch and Casualty Tracking

**Requirement**: REQ-LAB-025
**Priority**: P2

**4 detection mechanisms**:
1. Flag check: `unit.flags1.dead` or `unit.flags2.killed`
2. Absence detection: unit disappears from active list between cycles
3. Announcement parsing: death text in game reports
4. History event: UNIT_DEATH from eventful (Phase 5)

**Death cause enrichment**: Use Phase 5 death cause renderer for display.

### 3.8 Labor Toggle Grid

**Requirement**: REQ-LAB-001
**Priority**: P3

**Dwarf Therapist-style 2D grid**: Dwarves as rows, labors as columns. Each cell is a toggle.

```javascript
function renderLaborGrid(units, labors) {
    // Header row: labor names (rotated 90 degrees for compact display)
    const header = labors.map(l =>
        `<th class="labor-header"><div class="rotated">${l.name}</div></th>`
    ).join('');

    // Data rows: one per dwarf
    const rows = units.map(unit => {
        const cells = labors.map(labor => {
            const enabled = unit.labors[labor.id] || false;
            const skillLevel = getSkillForLabor(unit, labor.id);
            return `<td class="labor-cell ${enabled ? 'enabled' : 'disabled'} skill-${skillLevel}"
                        data-unit="${unit.unit_id}" data-labor="${labor.id}"
                        onclick="toggleLabor(${unit.unit_id}, ${labor.id})">
                        ${enabled ? '&#10003;' : ''}
                    </td>`;
        }).join('');
        return `<tr>
            <td class="dwarf-name">${unit.name}</td>
            <td class="dwarf-stress" style="color:${getStressColor(unit.stress_level)}">${getStressLabel(unit.stress_level)}</td>
            ${cells}
        </tr>`;
    }).join('');

    return `<table class="labor-grid"><thead><tr><th>Name</th><th>Stress</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}
```

**Write-back**: Toggle sends command via dfhack-run:
```python
async def toggle_labor(unit_id: int, labor_id: int, enabled: bool):
    """Toggle a labor assignment for a unit."""
    lua_cmd = f"""
        local unit = df.unit.find({unit_id})
        if unit then
            unit.labors[{labor_id}] = {str(enabled).lower()}
        end
    """
    await dfhack_run_lua(lua_cmd)
```

### 3.9 Personality Trait Visualization

**Requirement**: REQ-LAB-003
**Priority**: P3

50 personality facets rendered as radar chart or horizontal bar chart. Map extreme values to natural language descriptions.

```python
FACET_DESCRIPTIONS = {
    0: {'name': 'ANXIETY', 'low': 'fearless', 'high': 'anxiety-prone'},
    1: {'name': 'ANGER', 'low': 'slow to anger', 'high': 'quick to anger'},
    2: {'name': 'DEPRESSION', 'low': 'rarely depressed', 'high': 'depression-prone'},
    # ... 47 more facets
}
```

### 3.10 Attribute Display

**Requirement**: REQ-LAB-011
**Priority**: P3

6 physical + 12+ mental attributes displayed as bar chart with descriptive labels.

---

## 4. Stage 6.3: AI Fortress Advisor Core

**Duration**: 2-3 weeks
**Dependencies**: Phase 3 (LLM infrastructure), Phase 5 (enhanced bridge data)
**Deliverables**: Advisor mode framework, fortress health summary, reactive alerts, LLM advice

### 4.1 Advisor Mode Framework

**Requirement**: REQ-ADV-005
**Priority**: P3

```python
class FortressAdvisor:
    """AI-powered fortress advisor with two modes."""

    class Mode(Enum):
        ADVISOR = 'advisor'      # Recommend only
        AUTONOMOUS = 'autonomous'  # Execute via DFHack

    def __init__(self, mode: Mode = Mode.ADVISOR):
        self.mode = mode
        self.alert_queue = asyncio.Queue()

    async def process_state(self, fortress_state: dict):
        """Process fortress state and generate recommendations/actions."""
        alerts = []

        # Check all invariants
        for checker in self.invariant_checkers:
            violations = await checker.check(fortress_state)
            for violation in violations:
                if self.mode == Mode.ADVISOR:
                    alerts.append(violation.as_recommendation())
                elif self.mode == Mode.AUTONOMOUS:
                    await violation.execute_fix()
                    alerts.append(violation.as_action_taken())

        for alert in alerts:
            await self.alert_queue.put(alert)
```

### 4.2 LLM Fortress Advice

**Requirement**: REQ-ADV-020
**Priority**: P3

```python
ADVISOR_SYSTEM_PROMPT = """
You are a Dwarf Fortress gameplay advisor for the fortress of {fortress_name}.

Current Fortress State:
- Population: {pop_count} citizens ({babies} babies, {children} children)
- Military: {military_count} soldiers in {squad_count} squads
- Mood: {happy_count} happy, {unhappy_count} unhappy, {tantrum_count} tantrum-prone
- Notable events: {recent_events}

Your role is to:
1. Analyze the current fortress state
2. Identify potential problems (starvation, invasion, tantrum spiral, etc.)
3. Recommend specific actions the player should take
4. Explain your reasoning with reference to specific data

Always base your advice on the data provided. Do not speculate about things not in the data.
Format recommendations as numbered action items with priority levels.
"""
```

### 4.3 Citizen Arrival/Departure Tracking

**Requirement**: REQ-ADV-008
**Priority**: P2

Set comparison every 25 ticks to detect arrivals and departures. Auto-recommend bedroom/dining assignment for new arrivals.

### 4.4 Event-Driven Reactive Alerts

**Requirement**: REQ-ADV-007
**Priority**: P2

```python
ALERT_RULES = {
    'UNIT_DEATH': AlertRule(
        severity='HIGH',
        message_template="A citizen has died: {unit_name}. Cause: {death_cause}.",
        actions=['check_military', 'assign_replacement'],
    ),
    'INVASION': AlertRule(
        severity='CRITICAL',
        message_template="INVASION DETECTED! Hostile forces approaching!",
        actions=['activate_military', 'seal_fortress', 'civilian_alert'],
    ),
    'SYNDROME': AlertRule(
        severity='MEDIUM',
        message_template="{unit_name} has been afflicted with a syndrome.",
        actions=['check_hospital', 'quarantine_if_contagious'],
    ),
}
```

### 4.5 Military Sizing Advisor

**Requirement**: REQ-ADV-011
**Priority**: P3

Target: 25%-75% of citizen count (configurable). XP-based draft/dismiss selection.

### 4.6 Stock Threshold Model

**Requirement**: REQ-ADV-013
**Priority**: P3

Three-tier model with ~100 item categories:
- **Needed**: absolute minimum (e.g., 5 picks, 1 anvil)
- **NeededPerDwarf**: scales with population (e.g., 2 drinks per dwarf)
- **WatchStock**: alert when below threshold (e.g., 30 plump helmets)

### 4.7 Fortress Health Summary

**Requirement**: REQ-ADV-006
**Priority**: P3

Daily and annual aggregation of fortress metrics.

### 4.8 Fortress Post-Mortem Narrative

**Requirement**: REQ-ADV-023
**Priority**: P3

On fortress loss, generate an LLM narrative from accumulated events, population history, and cause of abandonment.

---

## 5. Stages 6.4-6.6: Advanced/Deferred Features (P4)

These stages contain stretch features that are not required for M6 milestone completion.

### Stage 6.4: Advanced Mod Management
- Level 2 conflict detection (object ID overlap)
- Raw file tokenizer (state machine parser)
- Three-way file merge (PyLNP algorithm)
- Full raw compiler (EDIT/SELECT/CUT processing)
- Steam Workshop integration

### Stage 6.5: Advanced Labor Management
- Skill-based labor auto-assignment
- Labor optimization engine (constraint satisfaction)
- AI-powered labor advisor (personality + skills + needs -> recommendations)
- Stress trend analysis with prediction

### Stage 6.6: Advanced Advisor
- Construction planning (22 room types, 4-state machine)
- Trade cycle management (9-step process)
- Embark site evaluation (water, metal, soil, trees, neighbors)
- Random embark with auto-restart

---

## 6. Definition of Done (M6 Milestone)

### Mod Manager Core
- [ ] Filesystem mod discovery (3 directories)
- [ ] DFHack live mod discovery
- [ ] info.txt parser (all v50 fields)
- [ ] Modpack CRUD (create, rename, delete, set-default)
- [ ] Profile import/export
- [ ] Load order management (18 header types)
- [ ] Level 1 conflict detection (metadata)
- [ ] Visual conflict indicators (4 severity levels)
- [ ] Modpack snapshot at world creation
- [ ] CLI interface (chronicler mods)

### Labor Manager Core
- [ ] Citizen roster with configurable polling
- [ ] Skill display and progression tracking
- [ ] Happiness/stress monitoring (color-coded, trends)
- [ ] Dwarf filtering/sorting (multi-criteria)
- [ ] Thought/emotion display (80+ types)
- [ ] Population migration tracking
- [ ] Deathwatch and casualty tracking (4 mechanisms)
- [ ] Labor toggle grid (Dwarf Therapist-style)
- [ ] Personality trait visualization (50 facets)
- [ ] Attribute display (6 physical + 12 mental)

### AI Fortress Advisor Core
- [ ] Advisor mode framework (recommend vs. autonomous)
- [ ] LLM fortress advice with data-backed reasoning
- [ ] Citizen arrival/departure tracking
- [ ] Event-driven reactive alerts
- [ ] Military sizing advisor
- [ ] Stock threshold model (~100 categories)
- [ ] Fortress health summary
- [ ] Fortress post-mortem narrative

---

*Phase 6: Advanced Components PRD/Roadmap v1.0 -- 2026-02-25*
*6 Stages (3 core + 3 deferred), 50+ Tasks, 6-10 Weeks Estimated*
