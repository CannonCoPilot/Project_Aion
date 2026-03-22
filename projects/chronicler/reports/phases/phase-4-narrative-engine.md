# Phase 4: Narrative Engine -- PRD/Roadmap

**Version**: 2.0 (v4.0 roadmap: AI Storytelling Pipeline redesign)
**Date**: 2026-03-19 (original 2026-02-25, renumbered 2026-03-04, expanded 2026-03-19)
**Phase Duration**: 6-9 weeks (expanded: +fortress saga generator, +narrative quality & tuning)
**Milestone**: M4 -- Storyteller v1.0
**Entry State**: 114 event templates, death cause renderer (61 mappings), circumstance/reason rendering, monitoring dashboard, keyword-routed storyteller, stable schema + narrative data layer from Phase 3
**Exit State**: Multi-model AI storytelling pipeline, fortress saga generator (multi-chapter narratives), agentic SQL storyteller, 132+ event narrative templates, war/battle/biography/civilization narratives, KH-storyteller integration, narrative quality evaluation, style presets, support for local LLMs (Qwen3 32B, GPT-OSS 120B) and cloud (Claude)

**Parent Document**: Full Project Roadmap v2.0 (full-project-roadmap.md)
**Dependencies**: Phase 1 (M1), Phase 2 (M2, rendering infrastructure), Phase 3 (M3, stable schema + KH data layer)
**Requirements Covered**: REQ-STR-001 through STR-032

> **Scope reduction**: ~60% of the event template work (Stages 3.1.1–3.1.12 original numbering) was completed during Phase 2 enhancements. See Roadmap v2.0 Phase 2 Stage 2.5 for the pre-completed inventory. Remaining work focuses on: template gap-fill, agentic storyteller, narrative generators, and KH integration.

---

## 1. Phase Overview

Phase 4 transforms the storyteller from a keyword-routing system into a full multi-model AI storytelling pipeline. The crown jewel: "tell me the story of fortress Girderspriced" generates a marvelously told multi-chapter saga using a local open-source LLM. The phase delivers: (1) deterministic event templates for the explorer UI, (2) an agentic LLM with autonomous SQL exploration for the chat interface, (3) a fortress saga generator that produces multi-chapter narratives from pre-processed narrative data (arcs, clusters, character profiles from Phase 3 Stage 3.6), (4) narrative quality evaluation and style tuning. Supports local LLMs (Qwen3 32B, GPT-OSS 120B) alongside cloud models (Claude).

### 1.1 Two Rendering Modes

**Template Mode (Fast Path)**: Deterministic, no LLM involvement. Used for event tables on explorer detail pages. Each of 132+ event types has a Python template that converts event data + entity names into natural-language HTML. This is what all existing legend browsers do.

**Agentic Mode (Rich Path)**: LLM with SQL tool use. Used for the chat/storyteller interface. The LLM receives an annotated schema summary, can execute read-only SQL queries (up to 5 rounds), and generates narrative responses. This is Chronicler's unique capability.

### 1.2 Current State

**Built**:
- 23 keyword routes (hf_flag, hf_race, entity_type, collection_type, artifacts, etc.)
- SSE streaming via sse_starlette
- Dual-tier context (HISTORICAL + LIVE)
- Confidence signaling (record count notes)
- "No record" honesty
- Per-interaction logging (storyteller_log table)
- 12,000 character context budget
- Name-based ILIKE search fallback
- World overview fallback

**Not built**:
- Event narrative templates (0 of 132+)
- Death cause renderer (0 of 50+ variants)
- Agentic SQL tool use
- War/battle/biography narrative generators
- Template vs. LLM hybrid rendering
- Monitoring dashboard

---

## 2. Stage 4.1: Event Narrative Template System

**Duration**: 2-3 weeks
**Dependencies**: Phase 1 (all event types in DB), Phase 2 (cross-linking infrastructure)
**Deliverables**: Template system architecture + 132+ event type implementations

### 2.1 Template System Architecture

**Requirement**: REQ-STR-016
**Priority**: P1

**Design**:

```python
class EventTemplate:
    """Base class for event narrative templates."""

    def render(self, event: dict, context: EventContext) -> str:
        """Render event to HTML narrative string."""
        raise NotImplementedError

    def render_text(self, event: dict, context: EventContext) -> str:
        """Render event to plain text (for LLM context)."""
        return self._strip_html(self.render(event, context))


class EventContext:
    """Context available to all event templates."""

    def __init__(self, world_id: int, linker: EntityLinkRenderer,
                 calendar: DFCalendar, name_cache: EntityNameCache,
                 perspective_id: int = None, perspective_type: str = None):
        self.world_id = world_id
        self.linker = linker
        self.calendar = calendar
        self.names = name_cache
        self.perspective_id = perspective_id
        self.perspective_type = perspective_type

    def link_hf(self, hf_id: int) -> str:
        """Generate linked HF name, handling perspective."""
        if self.perspective_type == 'hf' and hf_id == self.perspective_id:
            return '<em>they</em>'
        name = self.names.get_name('hf', hf_id)
        return self.linker.link('hf', hf_id, name, self.world_id)

    def link_entity(self, entity_id: int) -> str:
        if self.perspective_type == 'entity' and entity_id == self.perspective_id:
            return '<em>they</em>'
        name = self.names.get_name('entity', entity_id)
        return self.linker.link('entity', entity_id, name, self.world_id)

    def link_site(self, site_id: int) -> str:
        name = self.names.get_name('site', site_id)
        return self.linker.link('site', site_id, name, self.world_id)

    def link_artifact(self, artifact_id: int) -> str:
        name = self.names.get_name('artifact', artifact_id)
        return self.linker.link('artifact', artifact_id, name, self.world_id)

    def format_date(self, year: int, seconds72: int = None) -> str:
        return self.calendar.format_date(year, seconds72)


class EventTemplateRegistry:
    """Registry mapping event type strings to template implementations."""

    def __init__(self):
        self._templates: dict[str, EventTemplate] = {}
        self._fallback = FallbackTemplate()

    def register(self, event_type: str, template: EventTemplate):
        self._templates[event_type] = template

    def render(self, event: dict, context: EventContext) -> str:
        event_type = event.get('type', '')
        template = self._templates.get(event_type, self._fallback)
        return template.render(event, context)
```

**Pipeline**: Event record -> EventContext (with entity name cache) -> Template.render() -> HTML string

**Acceptance criteria**:
- Template system is extensible (add new types without modifying core)
- Context provides all cross-referencing utilities
- Perspective-aware rendering integrated
- Registry auto-discovers templates via class registration

### 2.2 HF Lifecycle Event Templates (15 types)

**Requirement**: REQ-STR-016
**Priority**: P1

| Event Type | Template Pattern | Key Fields |
|-----------|-----------------|------------|
| `hf_died` | "{HF} died in year {year} at {site}. Cause: {cause}. Age: {age}" | hfid, site_id, cause, slayer_hfid |
| `hf_revived` | "{HF} was raised from the dead by {raiser}" | hfid, raiser_hfid |
| `hf_wounded` | "{HF} was wounded by {wounder} at {site}" | woundee_hfid, wounder_hfid, site_id |
| `hf_abducted` | "{snatcher} abducted {target} from {site}" | snatcher_hfid, target_hfid, site_id |
| `hf_enslaved` | "{enslaver} enslaved {target}" | enslaver_hfid, target_hfid |
| `hf_freed` | "{HF} was freed from captivity" | hfid, freer_hfid |
| `hf_ransomed` | "{HF} was ransomed by {payer}" | hfid, payer_hfid |
| `body_abused` | "The body of {HF} was {abuse_type}" | hfid, abuse_type, site_id |
| `hf_new_pet` | "{HF} tamed {pet}" | group_hfid, pet_race |
| `hf_gained_secret_goal` | "{HF} conceived a secret goal: {goal}" | hfid, goal_type |
| `hf_learns_secret` | "{HF} learned the secret of {secret}" | student_hfid, secret_text |
| `hf_reunion` | "{HF1} and {HF2} were reunited" | group1_hfid, group2_hfid |
| `hf_confronted` | "{HF} confronted {target} about {situation}" | hfid, target_hfid, situation |
| `hf_recruited_unit_type` | "{HF} recruited {unit_type} for {entity}" | hfid, unit_type, entity_id |
| `change_hf_state` | "{HF} became {state} at {site}" | hfid, state, site_id |

**Example implementation for `hf_died`**:
```python
class HfDiedTemplate(EventTemplate):
    def render(self, event: dict, ctx: EventContext) -> str:
        d = event['details']
        hf = ctx.link_hf(d.get('hfid'))
        year = event['year']

        parts = [f"{hf} died"]

        # Location
        site_id = d.get('site_id')
        if site_id:
            parts.append(f"at {ctx.link_site(site_id)}")

        # Death cause (detailed rendering via DeathCauseRenderer)
        cause = d.get('death_cause')
        if cause:
            cause_text = DeathCauseRenderer.render(d, ctx)
            parts.append(f"({cause_text})")

        # Slayer
        slayer_id = d.get('slayer_hf_id')
        if slayer_id:
            slayer = ctx.link_hf(slayer_id)
            parts.append(f"killed by {slayer}")

            slayer_race = d.get('slayer_race')
            if slayer_race:
                parts.append(f"a {slayer_race}")

        # Age at death
        birth_year = d.get('birth_year')
        if birth_year and year:
            age = year - birth_year
            parts.append(f"at the age of {age}")

        return ' '.join(parts) + '.'
```

**Acceptance criteria**:
- All 15 HF lifecycle event types have templates
- Death events integrate with DeathCauseRenderer
- Slayer identity includes race when available
- Age at death computed correctly

### 2.3 Death Cause Rendering (50+ variants)

**Requirement**: REQ-STR-017
**Priority**: P1

**Death cause taxonomy** (from weblegends analysis, df-structures enum, myDFHackScripts):

| Category | Causes | Example Rendering |
|----------|--------|-------------------|
| Combat | SHOT, STRUCK_DOWN, MURDERED, HACK_TO_PIECES, BEHEAD | "shot to death", "struck down", "hacked to pieces" |
| Environment | DROWN, SUFFOCATE, MAGMA, CAVEIN, DRAWBRIDGE | "drowned", "suffocated", "burned in magma" |
| Fire | DRAGONFIRE, BURN_ALIVE, FIRE | "burned alive by dragonfire", "caught fire" |
| Blood | BLEED, DRAIN_BLOOD | "bled to death", "drained of blood" |
| Fall | LEAPT_FROM_HEIGHT, FELL | "leapt from a great height", "fell to their death" |
| Medical | INFECTION, OLD_AGE, THIRST, HUNGER, EXHAUSTION | "died of old age", "died of infection" |
| Execution | CRUCIFY, BEHEAD, BURY_ALIVE, DROWN, BURN_ALIVE | "was crucified", "was beheaded" |
| Supernatural | DRAIN_BLOOD, TRAP, CAGE, COLLISION | "was drained of blood by a vampire" |
| Misc | UNKNOWN, VANISH, MEMORIALIZE, GHOST_MURDER | "vanished", "was killed by a ghost" |

**DeathCauseRenderer implementation**:
```python
class DeathCauseRenderer:
    """Renders death cause with full context including weapon, slayer, and circumstance."""

    CAUSE_TEMPLATES = {
        'OLD_AGE': "died of old age",
        'SHOT': "was shot and killed{by_weapon}",
        'STRUCK_DOWN': "was struck down{by_weapon}",
        'BLEED': "bled to death",
        'DROWN': "drowned",
        'SUFFOCATE': "suffocated",
        'MAGMA': "was consumed by magma",
        'DRAGONFIRE': "was incinerated by dragonfire",
        'FIRE': "was burned alive",
        'CAVEIN': "was crushed in a cave-in",
        'DRAWBRIDGE': "was crushed by a drawbridge",
        'BEHEAD': "was beheaded",
        'CRUCIFY': "was crucified",
        'BURN_ALIVE': "was burned alive",
        'HACK_TO_PIECES': "was hacked to pieces",
        'DRAIN_BLOOD': "was drained of blood",
        'LEAPT_FROM_HEIGHT': "leapt from a great height",
        'FELL': "fell to death",
        'INFECTION': "died of infection",
        'MURDERED': "was murdered",
        'THIRST': "died of thirst",
        'HUNGER': "starved to death",
        'EXHAUSTION': "died of exhaustion",
        'CAGE': "died in a cage",
        'TRAP': "was killed by a trap",
        'COLLISION': "died in a collision",
        'BURY_ALIVE': "was buried alive",
        'GHOST_MURDER': "was killed by a ghost",
        'VANISH': "vanished",
        'SCUTTLED': "was scuttled",
        'SPIKES': "was impaled on spikes",
        'SLAIN': "was slain in combat",
        'MELTING': "melted",
        'FREEZING': "froze to death",
        # ... 20+ more variants
    }

    @classmethod
    def render(cls, event_details: dict, ctx: EventContext) -> str:
        cause = event_details.get('death_cause', 'UNKNOWN')
        template = cls.CAUSE_TEMPLATES.get(cause, f"died ({cause})")

        # Weapon info substitution
        weapon = event_details.get('weapon_item_type')
        if weapon:
            material = event_details.get('weapon_material', '')
            weapon_str = f" by a {material} {weapon}".strip() if material else f" by a {weapon}"
            template = template.replace('{by_weapon}', weapon_str)
        else:
            template = template.replace('{by_weapon}', '')

        return template
```

**Age at death with fractions** (REQ-STR-019):
```python
def render_age_at_death(birth_year: int, death_year: int, birth_seconds: int = 0,
                         death_seconds: int = 0) -> str:
    """Render age with 1/4, 1/2, 3/4 fractions."""
    age = death_year - birth_year
    if birth_seconds and death_seconds:
        fraction = (death_seconds - birth_seconds) / 403200  # ticks per year
        if fraction < 0:
            age -= 1
            fraction += 1
        if 0.125 <= fraction < 0.375:
            return f"{age} and a quarter"
        elif 0.375 <= fraction < 0.625:
            return f"{age} and a half"
        elif 0.625 <= fraction < 0.875:
            return f"{age} and three quarters"
    return str(age)
```

**Acceptance criteria**:
- All 50+ death cause variants have human-readable rendering
- Weapon info included when available
- Slayer race included when available
- Age fractions (1/4, 1/2, 3/4) rendered
- Unknown causes display gracefully

### 2.4 Relationship Event Templates (10 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `add_hf_hf_link` | "{HF1} formed a {link_type} bond with {HF2}" |
| `remove_hf_hf_link` | "The {link_type} bond between {HF1} and {HF2} ended" |
| `add_hf_entity_link` | "{HF} joined {entity} as {position}" |
| `remove_hf_entity_link` | "{HF} left {entity}" |
| `add_hf_site_link` | "{HF} became associated with {site}" |
| `remove_hf_site_link` | "{HF} departed from {site}" |
| `hf_relationship_denied` | "{HF1}'s request for a relationship with {HF2} was denied" |
| `hf_reach_summit` | "{HF} reached the summit of {peak}" |
| `hf_travel` | "{HF} traveled to {destination}" |
| `hf_preach` | "{HF} preached about {topic} at {site}" |

### 2.5 Artifact Event Templates (13 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `artifact_created` | "{HF} created {artifact}, a {material} {item_type}, at {site}" |
| `artifact_destroyed` | "{artifact} was destroyed" |
| `artifact_lost` | "{artifact} was lost" |
| `artifact_found` | "{artifact} was found by {finder}" |
| `artifact_given` | "{giver} gave {artifact} to {receiver}" |
| `artifact_possessed` | "{artifact} was claimed by {possessor}" |
| `artifact_recovered` | "{artifact} was recovered" |
| `artifact_stored` | "{artifact} was stored at {site}" |
| `artifact_transformed` | "{artifact} was transformed" |
| `artifact_copied` | "A copy of {artifact} was made" |
| `artifact_claim_formed` | "A claim was formed on {artifact}" |
| `hf_does_interaction` | "{HF} performed {interaction} on {target}" |
| `item_stolen` | "{thief} stole {item} from {site}" |

### 2.6 Site/Construction Event Templates (18 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `created_site` | "{entity} founded {site}" |
| `destroyed_site` | "{attacker} destroyed {site}" |
| `site_taken_over` | "{new_owner} took over {site} from {old_owner}" |
| `reclaim_site` | "{entity} reclaimed {site}" |
| `abandoned_site` | "{entity} abandoned {site}" |
| `created_structure` | "A {structure_type} was built at {site}" |
| `razed_structure` | "The {structure} at {site} was razed" |
| `replaced_structure` | "{old_structure} at {site} was replaced by {new_structure}" |
| `add_hf_site_link` | "{HF} settled at {site}" |
| `created_world_construction` | "A {construction_type} was built connecting {site1} to {site2}" |
| `hf_attacked_site` | "{HF} attacked {site}" |
| `hf_destroyed_site` | "{HF} destroyed {site}" |
| `site_dispute` | "A dispute arose at {site} between {entity1} and {entity2}" |
| `site_retired` | "{site} was retired from play" |
| `plundered_site` | "{attacker} plundered {site}" |
| `rampaged_in_site` | "{creature} rampaged in {site}" |
| `new_site_leader` | "{HF} became the leader of {site}" |
| `site_tribute` | "{entity} paid tribute at {site}" |

### 2.7 Entity Event Templates (14 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `entity_created` | "{entity} was founded by {hf}" |
| `entity_dissolved` | "{entity} dissolved" |
| `entity_incorporated` | "{entity1} was incorporated into {entity2}" |
| `entity_overthrown` | "{entity} was overthrown" |
| `entity_law` | "{entity} enacted a {law_type} law" |
| `entity_persecuted` | "{entity1} persecuted {entity2}" |
| `alliance_formed` | "{entity1} and {entity2} formed an alliance" |
| `entity_breach` | "{entity} was breached" |
| `entity_equipment_purchase` | "{entity} purchased equipment" |
| `entity_expels_hf` | "{entity} expelled {hf}" |
| `entity_fled_site` | "{entity} fled {site}" |
| `entity_primary_criminals` | "Criminal activity arose in {entity}" |
| `entity_rampaged` | "{entity} rampaged" |
| `first_contact` | "{entity1} made first contact with {entity2}" |

### 2.8 War/Combat Event Templates (8 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `field_battle` | "A battle took place between {attacker} and {defender} at {region}" |
| `squad_vs_squad` | "{squad1} clashed with {squad2}" |
| `tactical_situation` | "A tactical situation developed at {site}" |
| `attacked_site` | "{attacker} attacked {site}, defended by {defender}" |
| `plundered_site` | "{attacker} plundered {site}" |
| `hf_attacked_site` | "{hf} personally led an attack on {site}" |
| `creature_devoured` | "{creature} devoured {victim}" |
| `hf_does_interaction` (combat) | "{hf} used {ability} against {target}" |

### 2.9 Diplomacy Event Templates (10 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `peace_accepted` | "{entity1} and {entity2} agreed to peace" |
| `peace_rejected` | "{entity1} rejected peace with {entity2}" |
| `agreement_formed` | "{entity1} and {entity2} formed an agreement regarding {topic}" |
| `agreement_concluded` | "The agreement between {entity1} and {entity2} concluded" |
| `agreement_rejected` | "{entity1} rejected the agreement with {entity2}" |
| `trade` | "Trade occurred between {entity1} and {entity2} at {site}" |
| `first_contact` | "{entity1} made first contact with {entity2}" |
| `diplomat_lost` | "A diplomat from {entity} was lost" |
| `merchant_arrived` | "A merchant from {entity} arrived at {site}" |
| `tribute_established` | "{entity1} established tribute to {entity2}" |

### 2.10 Culture/Art Event Templates (7 types)

| Event Type | Template Pattern |
|-----------|-----------------|
| `poetic_form_created` | "{hf} created the poetic form {form_name} for {entity}" |
| `musical_form_created` | "{hf} created the musical form {form_name}" |
| `dance_form_created` | "{hf} created the dance form {form_name}" |
| `written_content_composed` | "{hf} composed {title}, a {form}" |
| `knowledge_discovered` | "Knowledge of {topic} was discovered by {hf}" |
| `hf_performed_masterwork` | "{hf} created a masterwork" |
| `artifact_created` (cultural) | "{hf} crafted {artifact} as a cultural artifact" |

### 2.11 Remaining Event Templates (~25 types)

Masterpiece events (8 types), occasion events (5 types), and miscellaneous events (12+ types).

**Masterpiece events**: `masterpiece_arch_construct`, `masterpiece_item`, `masterpiece_dye`, `masterpiece_item_improvement`, `masterpiece_food`, `masterpiece_engraving`, `masterpiece_lost`

**Occasion events**: `ceremony`, `competition`, `performance`, `procession`, `gamble`

**Misc**: `creature_devoured`, `body_abused`, `merchant`, `sneak_into_site`, `spotted_leaving`, `insurrection`, `hf_convicted`, `hf_interrogated`, `sabotage`, `hf_carved_tunnel`, `entity_searched_site`, `hf_formed_intrigue_relationship`

### 2.12 Missing Event Fallback

**Requirement**: REQ-STR-022
**Priority**: P2

```python
class FallbackTemplate(EventTemplate):
    """Renders events with no specific template as structured field dump."""

    def render(self, event: dict, ctx: EventContext) -> str:
        d = event.get('details', {})
        event_type = event.get('type', 'unknown')

        parts = [f'<span class="event-type-badge">{event_type}</span>']

        # Linkify any known entity references
        for key, value in d.items():
            if key.endswith('_hfid') or key.endswith('_hf_id') or key == 'hfid':
                parts.append(f"{key}: {ctx.link_hf(value)}")
            elif key.endswith('_site_id') or key == 'site_id':
                parts.append(f"{key}: {ctx.link_site(value)}")
            elif key.endswith('_entity_id') or key == 'entity_id':
                parts.append(f"{key}: {ctx.link_entity(value)}")
            else:
                parts.append(f"{key}: {value}")

        return ' | '.join(parts)
```

**Acceptance criteria**:
- All 132 LB2-handled types have dedicated templates
- Remaining 12 types use fallback with entity linking
- No event renders as raw JSON in the UI

---

## 3. Stage 4.2: Narrative Enrichment

**Duration**: 1 week
**Dependencies**: Stage 4.1 (event templates)
**Deliverables**: Higher-order narrative generators

### 3.1 Circumstance/Reason Rendering

**Requirement**: REQ-STR-018
**Priority**: P2

Some events include `reason` or `circumstance` fields that provide additional narrative context.

**Reasons**: glorify_hf, artifact_is_heirloom, symbol_of_everlasting_peace, part_of_trade, cement_bonds_of_friendship, in_accordance_with_prophecy, etc.

**Circumstances**: Death, Prayer, DreamAbout, Nightmare, FromAfar, InsideGoodTile, etc.

```python
REASON_TEMPLATES = {
    'glorify_hf': "to glorify {target_hf}",
    'artifact_is_heirloom': "because the artifact was a family heirloom",
    'symbol_of_everlasting_peace': "as a symbol of everlasting peace",
    'part_of_trade': "as part of a trade agreement",
    'cement_bonds_of_friendship': "to cement bonds of friendship",
}

CIRCUMSTANCE_TEMPLATES = {
    'Death': "upon their death",
    'Prayer': "while praying",
    'DreamAbout': "in a dream",
    'Nightmare': "in a nightmare",
    'FromAfar': "from a great distance",
}
```

### 3.2 Temporal Context in Events

**Requirement**: REQ-STR-020
**Priority**: P2

When rendering event lists, add temporal context:
- First event in a year: "In year 125..."
- Subsequent events in same year: suppress year prefix
- Events with seconds72: "On the 3rd of Granite, 125..."
- Events across year boundary: insert year header

```python
class TemporalContextRenderer:
    def __init__(self):
        self._last_year = None

    def wrap_event(self, event: dict, rendered_text: str, ctx: EventContext) -> str:
        year = event['year']
        seconds72 = event.get('seconds72')

        if year != self._last_year:
            self._last_year = year
            if seconds72:
                prefix = ctx.format_date(year, seconds72)
            else:
                prefix = f"In year {year}"
            return f'<span class="temporal-context">{prefix}</span>, {rendered_text}'
        else:
            if seconds72:
                date = ctx.calendar.from_seconds72(year, seconds72)
                prefix = f"On the {DFCalendar._ordinal(date['day'])} of {date['month']}"
                return f'<span class="temporal-context">{prefix}</span>, {rendered_text}'
            return rendered_text
```

### 3.3 War Narrative Generation

**Requirement**: REQ-STR-013
**Priority**: P2

**Description**: Generate rich war narratives from event collection data.

**Algorithm**:
1. Load war event collection (type='war')
2. Extract aggressor/defender entities
3. Load sub-collections (battles, sieges)
4. For each sub-collection, load individual events
5. Construct chronological narrative with statistics

**Output structure**:
```
The War of [Name] (Year X - Year Y)
- Aggressor: [Entity1] (linked)
- Defender: [Entity2] (linked)
- Duration: N years
- Battles: M
- Casualties: K

[Chronological narrative of key events...]

Battle of [Site] (Year Z)
  Attacker: [Entity1], led by [HF]
  Defender: [Entity2], led by [HF]
  Outcome: [Victor] victory
  Notable deaths: [HF1], [HF2]
```

### 3.4 Battle Detail Rendering

**Requirement**: REQ-STR-014
**Priority**: P2

Per-battle rendering with:
- Attacker/defender civilizations and generals (linked)
- Region/site location (linked)
- Named participants from event details
- Outcome (victory/defeat/stalemate)
- Casualty counts
- Individual events within the battle

### 3.5 Civilization Rise-and-Fall Narratives

**Requirement**: REQ-STR-015
**Priority**: P2

Generate civilization history narratives from:
- Chronological entity events
- Leader succession (from hf_entity_links with position changes)
- Site acquisitions and losses
- Wars fought (as aggressor and defender)
- Current state (active/inactive/destroyed)

### 3.6 Character Profile/Biography Generation

**Requirement**: REQ-STR-008
**Priority**: P1

Given a figure_id, generate a comprehensive biography:
1. Load HF record (all fields)
2. Load unit record if available (for live fortress data)
3. Load all events involving this HF (from event_entity_xref)
4. Load relationships (family, entity memberships, site associations)
5. Load artifacts held/created
6. Construct chronological narrative

**Output structure**:
```
[Name], [Race] [Sex]
Born in Year [X] at [Site]
[Supernatural flags: Vampire since Year Y, Necromancer, etc.]

Early Life:
[Birth, family, early events]

Career:
[Positions held, organizations joined]

Achievements:
[Notable kills, artifacts created, masterworks]

Relationships:
[Spouse, children, notable bonds]

Death (if applicable):
[Death narrative with full cause rendering]

Legacy:
[Structures dedicated, continuing influence]
```

---

## 4. Stage 4.3: Agentic Storyteller

**Duration**: 2-3 weeks
**Dependencies**: Stage 4.1 (event templates for context), Phase 1 (complete data)
**Deliverables**: Agentic SQL storyteller with tool use

### 4.1 Annotated Schema Summary

**Requirement**: REQ-STR-007
**Priority**: P1

Build a compressed schema summary (~2K tokens) that the LLM uses to formulate SQL queries.

```python
def generate_schema_summary(world_id: int) -> str:
    """Generate annotated schema summary for LLM system prompt."""
    return """
## Database Schema (PostgreSQL, read-only)

### Core Tables
- historical_figures (world_id, id, name, race, caste, sex, birth_year, death_year,
  profession, is_deity, is_force, is_vampire, is_necromancer, is_werebeast, is_ghost,
  importance_score, spheres TEXT[], skills JSONB, kills JSONB, details JSONB)
  -- Primary key: (world_id, id). 48K+ records. Top 50 by importance_score are most notable.

- entities (world_id, id, name, race, type, details JSONB)
  -- Civilizations, religions, groups. 4.9K records.

- sites (world_id, id, name, type, coords, owner_entity_id, details JSONB, importance_score)
  -- 2.1K records. Types: Fortress, Town, Cave, DarkFortress, etc.

- history_events (world_id, id, year, seconds72, type TEXT, details JSONB)
  -- 442K+ records. 144 event types. Key JSONB fields: hfid, site_id, entity_id, slayer_hf_id, etc.

- history_event_collections (world_id, id, type, start_year, end_year, details JSONB)
  -- Wars, battles, beast attacks. 19 collection types.

### Relationship Tables
- hf_links (world_id, source_hf_id, target_hf_id, link_type)
  -- Family/social links between HFs.
- hf_entity_links (world_id, hf_id, entity_id, link_type, position_id)
  -- Memberships, positions, etc.
- hf_site_links (world_id, hf_id, site_id, link_type)

### Cross-Reference
- event_entity_xref (world_id, event_id, entity_type, entity_id, role)
  -- Index of which entities are mentioned in which events.

### Live Data (current fortress)
- units (world_id, unit_id, name, race, profession, hist_fig_id, stress_level, skills_json)
- fortress_denizens (world_id, unit_id, name, narrative_value)

All queries MUST include: WHERE world_id = {world_id}
"""
```

### 4.2 SQL Tool Definition

**Requirement**: REQ-STR-007
**Priority**: P1

```python
SQL_TOOL = {
    "name": "query_database",
    "description": "Execute a read-only SQL query against the Chronicler PostgreSQL database. Returns up to 50 rows. Use this to explore world data and find information for your narrative response.",
    "parameters": {
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": "A read-only SQL query. Must include WHERE world_id = N. No INSERT/UPDATE/DELETE."
            },
            "purpose": {
                "type": "string",
                "description": "Brief explanation of what you're looking for with this query."
            }
        },
        "required": ["sql", "purpose"]
    }
}
```

### 4.3 SQL Safety Layer

**Requirement**: REQ-STR-007
**Priority**: P1

```python
class SQLSafetyLayer:
    """Validate and execute SQL queries safely."""

    BLOCKED_KEYWORDS = {
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE',
        'CREATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'DO',
    }

    MAX_ROWS = 50
    TIMEOUT_SECONDS = 5

    @classmethod
    def validate(cls, sql: str, world_id: int) -> tuple[bool, str]:
        """Validate SQL query. Returns (is_valid, error_message)."""
        sql_upper = sql.upper().strip()

        # Must be SELECT
        if not sql_upper.startswith('SELECT'):
            return False, "Only SELECT queries are allowed"

        # Check for blocked keywords
        for keyword in cls.BLOCKED_KEYWORDS:
            if keyword in sql_upper.split():
                return False, f"Blocked keyword: {keyword}"

        # Must contain world_id filter
        if f'world_id' not in sql.lower():
            return False, "Query must include world_id filter"

        return True, ""

    @classmethod
    async def execute(cls, sql: str, world_id: int, db_session) -> dict:
        """Execute validated SQL with timeout and row limit."""
        is_valid, error = cls.validate(sql, world_id)
        if not is_valid:
            return {"error": error, "rows": []}

        # Enforce LIMIT
        sql_limited = cls._enforce_limit(sql)

        try:
            result = await asyncio.wait_for(
                db_session.execute(text(sql_limited)),
                timeout=cls.TIMEOUT_SECONDS
            )
            rows = [dict(row) for row in result.fetchall()]
            return {"rows": rows, "count": len(rows)}
        except asyncio.TimeoutError:
            return {"error": "Query timed out (5s limit)", "rows": []}
        except Exception as e:
            return {"error": str(e), "rows": []}

    @classmethod
    def _enforce_limit(cls, sql: str) -> str:
        """Ensure query has LIMIT clause."""
        if 'LIMIT' not in sql.upper():
            return f"{sql.rstrip(';')} LIMIT {cls.MAX_ROWS}"
        return sql
```

### 4.4 Agentic Prompt

**Requirement**: REQ-STR-007
**Priority**: P1

```python
AGENTIC_SYSTEM_PROMPT = """
You are the Chronicler, the keeper of all knowledge in the world of {world_name}.
You have access to a PostgreSQL database containing the complete history of this world.

{schema_summary}

## Your Role
- Answer questions about the world's history, figures, civilizations, wars, and events
- Use the query_database tool to explore the database and find relevant information
- You may make up to 5 SQL queries per response to gather information
- Always cite specific records you found (names, years, events)
- If records do not contain information about what the user asks, say so honestly

## Fortress Context (Live Data)
{denizen_summary}

## Data Tiers
- HISTORICAL: legends data from world generation (comprehensive, complete)
- LIVE: current fortress state from watcher (real-time, limited to active fortress)

## Narrative Guidelines
- Write in the voice of a knowledgeable historian/chronicler
- Include specific details: names, dates, places, relationships
- When describing deaths, include cause and circumstances
- When describing wars, mention key battles and outcomes
- Use DF calendar conventions (seasons, months)
- If confidence is low (<3 records found), note this to the user
- **SECRET IDENTITY PROTECTION**: The `identities` table contains secret identities
  (e.g., a vampire masquerading as a human). The narrative engine MUST NOT reveal
  secret identities unless the identity has been explicitly revealed through in-game
  events. This requires a workaround — possibly filtering identity joins based on a
  "revealed" flag or event-based discovery. Design this carefully to avoid spoilers
  while still allowing the chronicler to hint at mysteries
- **REGIONAL KNOWLEDGE HORIZON — Geographic Common Knowledge**: Geographic features
  (peaks, rivers, biome type, placenames, world constructions) within a unit's region
  should be treated as common knowledge for that unit, NOT gated by prominence scores.
  The Knowledge Horizon system must implement proximity-based knowability:
    - `IF unit IN region THEN region_info_detailed` — unit knows all placenames,
      feature names, biome details, and high-prominence event collections and HFs
      within the region
    - `IF unit NEAR region THEN region_info_basics` — unit knows region name, general
      biome type, major features only
    - `IF unit NEAR feature THEN feature_info_detailed` — unit knows specific details
      of nearby geographic features regardless of region membership
  Prominence and salience scores on geographic features still matter for narrative
  *weighting* (how much emphasis the LLM gives a feature in generated text), but
  *knowability* is determined by spatial proximity, not score thresholds. This
  distinction is critical: a unit living next to a small, low-prominence creek still
  knows it exists. Design the Knowledge Horizon to include a "regional encyclopedic
  knowability" layer that the LLM can use to decide what details to include or exclude
  based on the perspective unit's location
"""
```

### 4.5 Multi-Round SQL Exploration

**Requirement**: REQ-STR-007
**Priority**: P1

**Agent loop**:
```python
async def agentic_storyteller(query: str, world_id: int, db_session):
    """Run the agentic storyteller with up to 5 SQL rounds."""
    messages = [
        {"role": "system", "content": build_system_prompt(world_id)},
        {"role": "user", "content": query}
    ]

    for round_num in range(5):
        response = await llm_client.chat(
            messages=messages,
            tools=[SQL_TOOL],
            stream=True
        )

        # Collect response
        content, tool_calls = await collect_response(response)

        if not tool_calls:
            # No more SQL needed - this is the final answer
            yield content
            break

        # Execute SQL tool calls
        for tool_call in tool_calls:
            sql = tool_call.arguments['sql']
            purpose = tool_call.arguments.get('purpose', '')
            result = await SQLSafetyLayer.execute(sql, world_id, db_session)

            messages.append({
                "role": "assistant",
                "content": content,
                "tool_calls": [tool_call]
            })
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result)
            })
    else:
        # Reached max rounds - yield whatever content we have
        yield content
```

### 4.6 SSE Stream Filtering

**Requirement**: REQ-STR-007
**Priority**: P1

**Description**: Filter tool calls from the SSE stream so only narrative tokens are sent to the client.

```python
async def stream_agentic_response(query: str, world_id: int):
    """SSE stream that hides tool calls from client."""
    async for event in agentic_storyteller(query, world_id, db):
        if isinstance(event, str):
            # Narrative token - send to client
            yield {"event": "message", "data": event}
        elif isinstance(event, ToolCallEvent):
            # Tool call - send progress indicator only
            yield {"event": "progress", "data": f"Querying database... ({event.purpose})"}
        elif isinstance(event, ToolResultEvent):
            # Tool result - hide from client
            pass

    yield {"event": "done", "data": ""}
```

### 4.7 Mode Toggle

**Requirement**: REQ-STR-007
**Priority**: P1

```python
# Configuration
STORYTELLER_MODE = os.getenv('CHRONICLER_STORYTELLER_MODE', 'keyword')
# Options: 'keyword' (existing), 'agentic' (new), 'hybrid' (both available)
```

### 4.8 Template vs. LLM Hybrid Rendering

**Requirement**: REQ-STR-030
**Priority**: P1

**Description**: Event tables on explorer pages use templates (fast, deterministic). The chat interface uses LLM-enhanced rendering.

```python
def render_event_for_explorer(event: dict, context: EventContext) -> str:
    """Fast path: deterministic template rendering for explorer UI."""
    return template_registry.render(event, context)

async def render_event_for_chat(event: dict, context: EventContext) -> str:
    """Rich path: LLM-enhanced rendering for storyteller."""
    template_text = template_registry.render_text(event, context)
    # Optionally enhance with LLM for richer narrative
    if event.get('type') in HIGH_VALUE_EVENT_TYPES:
        return await llm_enhance(template_text, context)
    return template_text
```

---

## 5. Stage 4.4: Monitoring and Observability

**Duration**: 0.5 weeks
**Dependencies**: Stage 4.3 (agentic storyteller)
**Deliverables**: Enhanced logging and monitoring dashboard

### 5.1 Enhanced Storyteller Logging

**Requirement**: REQ-STR-028
**Priority**: P1

**Four-phase latency tracking**:
```python
@dataclass
class StorytellerMetrics:
    query_received_at: float
    context_built_at: float      # Phase 1: keyword extraction + DB queries
    llm_first_token_at: float    # Phase 2: LLM TTFT
    llm_complete_at: float       # Phase 3: Full LLM response
    stream_complete_at: float    # Phase 4: SSE delivery complete

    # Agentic-mode additions
    sql_queries_count: int = 0
    sql_total_time: float = 0.0
    sql_queries: list = None  # List of {sql, purpose, duration, row_count}
```

### 5.2 Monitoring Dashboard

**Requirement**: REQ-STR-029
**Priority**: P2

**Route**: `GET /monitoring`

**Dashboard content**:
- Summary cards: total queries, avg latency, error rate, queries today
- Recent interactions table (last 50)
- Latency histogram (4-phase breakdown)
- Error log
- Auto-refresh every 30 seconds

**API**: `GET /api/monitoring/stats`, `GET /api/monitoring/recent`

---

## 6. Definition of Done (M4 Milestone)

### Event Templates
- [ ] Template system architecture implemented
- [ ] 132+ event types have dedicated templates
- [ ] Death cause renderer handles 50+ variants
- [ ] Fallback template for remaining event types
- [ ] Perspective-aware rendering integrated
- [ ] Temporal context rendering works
- [ ] Circumstance/reason rendering works

### Narrative Generators
- [ ] War narrative generation
- [ ] Battle detail rendering
- [ ] Civilization rise-and-fall narratives
- [ ] Character biography generation
- [ ] Age at death with fractions

### Agentic Storyteller
- [ ] Annotated schema summary generated
- [ ] SQL tool definition and safety layer
- [ ] Multi-round SQL exploration (up to 5 rounds)
- [ ] SSE stream filtering (tool calls hidden)
- [ ] Mode toggle (keyword/agentic/hybrid)
- [ ] Template vs. LLM hybrid rendering

### Observability
- [ ] Four-phase latency logging
- [ ] Monitoring dashboard with auto-refresh

---

## Stage 4.5: AI Narrative Generators (LVN v3.0)

**Duration**: 1-2 weeks

These enhancements leverage the agentic storyteller infrastructure from Stage 4.3 to generate higher-order narratives. Added after the Legends Viewer Next feature comparison (2026-03-18).

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.5.1 | REQ-LVN-NAR-001 | **AI-generated world summary** — on world load, aggregate key statistics (total HFs, civs, wars, sites, notable events) and feed to LLM to generate a cached 2-3 paragraph overview. Displayed on world landing page. Cache invalidated on re-ingestion. | World summary generator |
| 4.5.2 | REQ-LVN-NAR-002 | **Character obituary generator** — newspaper-style obituary for dead HFs. Template-based with optional LLM enhancement: birth/death dates, notable positions, key relationships, cause of death, legacy. Accessible from HF detail page death badge. | Obituary template + generator |
| 4.5.3 | REQ-LVN-NAR-003 | **"This Year in History" summary** — for any selected year, generate a newspaper-style page showing: major events, notable births/deaths, wars started/ended, sites founded/destroyed, position changes. Template-rendered with optional AI narrative. | Year summary page |
| 4.5.4 | REQ-LVN-NAR-004 | **Notable events highlight reel** — top 20 most notable events by importance score, rendered with AI prose. Displayed as a "Greatest Moments" page with event cards, context, and drill-down links. | Highlight reel page |

### Definition of Done (Stage 4.5)
- [ ] World summary generates on world page load (< 5s with LLM, < 500ms cached)
- [ ] Character obituary accessible from dead HF detail pages
- [ ] Year-in-history page renders for any valid year with template content
- [ ] Highlight reel shows top 20 events with drill-down links

---

## Stage 4.6: Fortress Saga Generator (v4.0)

**Duration**: 2-3 weeks
**Dependencies**: Stage 4.3 (agentic storyteller infra), Phase 3 Stage 3.6 (narrative data layer)
**Deliverables**: Multi-chapter fortress narrative generation pipeline

> **Design rationale**: This is the crown jewel. Watching Girderspriced fall — population dwindling, undead growing, Dastot's last stand — crystallized what the AI storyteller must become. Not just a Q&A interface, but a saga generator that captures founding, struggle, personality, battle, and fate in a narrative that rivals hand-written fiction. The system consumes pre-processed narrative structures (arcs, clusters, character profiles, state snapshots) from Phase 3 Stage 3.6 and feeds them chapter-by-chapter to a local LLM.

### 6.1 Saga Chapter Planner

**Requirement**: REQ-STR-041
**Priority**: P1

```python
class SagaChapterPlanner:
    """Plans chapter structure for a fortress saga."""

    CHAPTER_TYPES = [
        'founding',      # The embark and early days
        'early_days',    # Establishing the fortress
        'first_crisis',  # First major challenge
        'golden_age',    # Peak prosperity period
        'challenges',    # Multiple intermediate crises
        'decline',       # Things going wrong
        'last_stand',    # Final battle or crisis
        'fall',          # Fortress loss (if applicable)
        'epilogue',      # Legacy and aftermath
    ]

    async def plan_saga(self, world_id: int, fortress_id: int,
                         token_budget_per_chapter: int = 24000) -> list[SagaChapter]:
        """Generate chapter outline from narrative arcs and state snapshots."""
        # Load detected arcs
        arcs = await self.load_narrative_arcs(world_id)
        # Load state transitions (population milestones, threat spikes)
        transitions = await self.load_state_transitions(world_id)
        # Load character profiles for key figures
        characters = await self.load_key_characters(world_id, top_n=10)

        chapters = []
        for chapter_type in self.CHAPTER_TYPES:
            relevant_arcs = self._match_arcs_to_chapter(arcs, chapter_type)
            if not relevant_arcs and chapter_type not in ('founding', 'epilogue'):
                continue  # Skip chapters with no content

            chapters.append(SagaChapter(
                chapter_type=chapter_type,
                title=None,  # LLM-generated later
                focus_arcs=relevant_arcs,
                key_characters=self._select_chapter_characters(characters, relevant_arcs),
                time_range=self._compute_time_range(relevant_arcs, transitions),
                narrative_tone=self._infer_tone(chapter_type, relevant_arcs),
                token_budget=token_budget_per_chapter,
            ))

        return chapters
```

### 6.2 Multi-Model Narrative Generator

**Requirement**: REQ-STR-043
**Priority**: P1

```python
class NarrativeGenerator:
    """Generate narrative text against configurable LLM backends."""

    MODEL_CONFIGS = {
        'qwen3-32b': {
            'provider': 'ollama',
            'model': 'qwen3:32b',
            'context_window': 128000,
            'recommended_budget': 24000,
            'strengths': 'Long context, good creative writing',
        },
        'gpt-oss-120b': {
            'provider': 'litellm',
            'model': 'ollama/gpt-oss:120b',
            'context_window': 64000,
            'recommended_budget': 16000,
            'strengths': 'Strong reasoning, detailed prose',
        },
        'claude-sonnet': {
            'provider': 'anthropic',
            'model': 'claude-sonnet-4-6',
            'context_window': 200000,
            'recommended_budget': 48000,
            'strengths': 'Highest quality, excellent narrative coherence',
        },
    }

    async def generate_chapter(self, chapter: SagaChapter,
                                context: str, style: str,
                                model: str = 'qwen3-32b') -> AsyncIterator[str]:
        """Generate a saga chapter, streaming tokens."""
        config = self.MODEL_CONFIGS[model]
        prompt = self._build_chapter_prompt(chapter, context, style)

        async for token in self._stream_llm(config, prompt):
            yield token

    def _build_chapter_prompt(self, chapter, context, style) -> list[dict]:
        """Build LLM messages for chapter generation."""
        style_preset = NARRATIVE_STYLE_PRESETS[style]

        return [
            {"role": "system", "content": f"""You are the Chronicler, a master storyteller
recording the history of a Dwarf Fortress world.

{style_preset.system_instructions}

You are writing Chapter {chapter.index}: "{chapter.title}" of the saga of this fortress.
Narrative tone for this chapter: {chapter.narrative_tone}
Time period: Year {chapter.time_range.start_year} to Year {chapter.time_range.end_year}

IMPORTANT: Only include facts present in the context below. Do not invent events,
characters, or details not supported by the data. If information is sparse, let the
narrative reflect that — silence and mystery are powerful storytelling tools."""},
            {"role": "user", "content": f"""Write this chapter using the following
fortress data:

{context}

Key characters in this chapter:
{chapter.character_summaries}

Write a compelling, detailed narrative chapter. Include specific names, dates, and
details from the data. Use vivid prose appropriate to the {style} style."""}
        ]
```

### 6.3 Combat Scene Generator

**Requirement**: REQ-STR-045
**Priority**: P2

```python
class CombatSceneGenerator:
    """Transform combat report chains into vivid prose."""

    async def generate_combat_scene(self, combat_reports: list[dict],
                                      context: dict, model: str) -> str:
        """Generate combat prose from structured combat reports."""
        # Build combat timeline
        timeline = self._build_combat_timeline(combat_reports)

        prompt = f"""Transform these combat reports into vivid narrative prose.
Maintain chronological order. Describe the flow of combat — momentum shifts,
critical blows, the final strike. Use the weapon and body part details for
visceral description.

Combat Reports:
{self._format_reports(timeline)}

Combatants:
- Attacker: {context.get('attacker_name', 'Unknown')} ({context.get('attacker_race', '')})
- Defender: {context.get('defender_name', 'Unknown')} ({context.get('defender_race', '')})

Write 2-4 paragraphs of vivid combat prose."""

        return await self._generate(prompt, model)

    def _format_reports(self, timeline: list[dict]) -> str:
        """Format combat reports for LLM consumption."""
        lines = []
        for report in timeline:
            lines.append(
                f"Tick {report['tick']}: {report['attacker']} "
                f"{report['attack_type']} {report['defender']} "
                f"in the {report['body_part']} with {report['weapon']}. "
                f"Result: {report['result_text']}"
            )
        return '\n'.join(lines)
```

### 6.4 Atmospheric Prose Generator

**Requirement**: REQ-STR-046
**Priority**: P2

```python
class AtmosphericGenerator:
    """Generate scene-setting prose from fortress state + environment."""

    async def generate_scene_setting(self, state_snapshot: dict,
                                       environmental: dict,
                                       recent_events: list[dict],
                                       model: str) -> str:
        """Generate atmospheric opening paragraph for a chapter."""
        prompt = f"""Write a single atmospheric paragraph setting the scene for
a Dwarf Fortress narrative chapter.

Environmental conditions:
- Season: {environmental.get('season', 'Unknown')}
- Year: {state_snapshot.get('year', '?')}

Fortress state:
- Population: {state_snapshot.get('population', '?')} citizens remaining
- Military: {state_snapshot.get('military_count', '?')} soldiers
- Food stores: {state_snapshot.get('food_stocks', '?')} units
- Threats outside: {state_snapshot.get('threats', {}).get('hostile_count', 0)} hostile entities
  ({state_snapshot.get('threats', {}).get('undead_count', 0)} undead)

Recent notable events:
{chr(10).join(f'- {e.get("summary", "")}' for e in recent_events[:5])}

Write vivid, evocative prose. No more than 3-4 sentences. Set the mood."""

        return await self._generate(prompt, model)
```

### 6.5 Saga Compilation

**Requirement**: REQ-STR-047
**Priority**: P2

Assembles generated chapters into a complete saga document with:
- Table of contents with chapter titles and time ranges
- Character index (all named characters with links to entity detail pages)
- Timeline sidebar (key dates alongside chapter navigation)
- Cross-links to entity detail pages (entity names are clickable)
- Output formats: HTML (for saga reader), Markdown (for export), PDF (via WeasyPrint)

---

## Stage 4.7: Narrative Quality & Tuning (v4.0)

**Duration**: 1-2 weeks
**Dependencies**: Stage 4.6 (saga generator to evaluate)
**Deliverables**: Quality evaluation framework, style presets, prompt optimization, feedback system

### 7.1 Narrative Style Presets

**Requirement**: REQ-STR-051
**Priority**: P2

```python
NARRATIVE_STYLE_PRESETS = {
    'epic_saga': StylePreset(
        name='Epic Saga',
        description='Tolkien-esque high fantasy prose',
        system_instructions="""Write in the style of a grand epic saga. Use elevated
language, dramatic pacing, and sweeping descriptions. Treat dwarves as heroic figures
in a mythic narrative. Deaths should be dramatic, battles should be sweeping, and
quiet moments should carry weight.""",
        vocabulary_hints=['thus', 'ere', 'fell', 'smote', 'wrought'],
    ),
    'war_correspondent': StylePreset(
        name='War Correspondent',
        description='Journalistic, factual, AP-style reporting',
        system_instructions="""Write as a war correspondent embedded in the fortress.
Use clear, factual prose with specific numbers and dates. Quote announcements directly.
Report on casualties with clinical precision but human empathy. Include logistics
(food stores, military strength) as context for events.""",
    ),
    'personal_diary': StylePreset(
        name='Personal Diary',
        description='First-person journal entries from a fortress dwarf',
        system_instructions="""Write as diary entries from a dwarf living in the fortress.
Use first-person perspective, colloquial language, personal observations. Express
emotions about events. Worry about food, complain about the weather, mourn the fallen.
Include mundane details alongside dramatic events.""",
    ),
    'academic_history': StylePreset(
        name='Academic History',
        description='Dry, scholarly historical analysis',
        system_instructions="""Write as a scholarly historian analyzing the fortress.
Use formal academic prose, cite specific dates and figures, discuss causes and effects.
Maintain analytical distance. Use footnote-style asides for speculation.""",
    ),
    'bardic_tale': StylePreset(
        name='Bardic Tale',
        description='Oral tradition storytelling with rhythm and repetition',
        system_instructions="""Write as a bard telling the tale around a fire. Use
rhythmic prose, repetition for emphasis, direct dialogue, audience address ("and
there stood Dastot, mark you well"). Make heroes larger than life and villains
terrifying. Build to dramatic climaxes.""",
    ),
    'dark_comedy': StylePreset(
        name='Dark Comedy',
        description='Ironic, absurdist, gallows humor',
        system_instructions="""Write with dry, ironic humor in the style of Pratchett
or Adams. Find the absurdity in fortress life. Zombie cats attacking kittens is funny.
A necromancer killed by his own undead is darkly ironic. Treat tragedy with understated
wit. The fortress is simultaneously heroic and ridiculous.""",
    ),
}
```

### 7.2 Factual Accuracy Checker

**Requirement**: REQ-STR-049
**Priority**: P2

```python
class FactualAccuracyChecker:
    """Validate generated narratives against CDM data."""

    async def check(self, narrative_text: str, world_id: int) -> AccuracyReport:
        """Check narrative for factual accuracy."""
        # Extract entity mentions via NER or regex
        mentions = self._extract_entity_mentions(narrative_text)

        verified = 0
        hallucinated = 0
        unverifiable = 0

        for mention in mentions:
            if mention.type == 'character':
                exists = await self._verify_character(mention.name, world_id)
            elif mention.type == 'site':
                exists = await self._verify_site(mention.name, world_id)
            elif mention.type == 'date':
                exists = await self._verify_date(mention.value, world_id)
            else:
                unverifiable += 1
                continue

            if exists:
                verified += 1
            else:
                hallucinated += 1

        accuracy = verified / max(verified + hallucinated, 1) * 100
        return AccuracyReport(
            accuracy_score=accuracy,
            verified_count=verified,
            hallucinated_count=hallucinated,
            unverifiable_count=unverifiable,
            hallucinated_mentions=[m for m in mentions if not m.verified],
        )
```

### 7.3 Narrative Caching

**Requirement**: REQ-STR-054
**Priority**: P2

```sql
CREATE TABLE generated_narratives (
    id SERIAL PRIMARY KEY,
    world_id INTEGER REFERENCES worlds(id),
    scope TEXT NOT NULL,          -- 'fortress', 'character', 'war', 'year', 'world'
    scope_id TEXT,                -- entity identifier within scope
    style TEXT NOT NULL,          -- preset name
    model TEXT NOT NULL,          -- model used for generation
    narrative_text TEXT NOT NULL,
    quality_score FLOAT,          -- composite of accuracy + coherence
    version INTEGER DEFAULT 1,
    data_hash TEXT,               -- hash of input data; re-generate when changed
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(world_id, scope, scope_id, style, model, version)
);

CREATE INDEX idx_narratives_lookup ON generated_narratives(world_id, scope, scope_id, style);
```

---

## Stage 4.8: Monitoring Enhancements

**Duration**: 0.5 weeks

**Pre-completed work** (from Phase 2):
- [x] Monitoring dashboard (`/monitoring`) with interaction list, summary stats, detail view
- [x] Per-interaction logging (`storyteller_log` table)

**Remaining work**:

| Task | REQs | Description | Deliverable |
|------|------|-------------|-------------|
| 4.8.1 | STR-028 | Enhance logging with four-phase latency tracking (context, TTFT, LLM, SSE) | Logging improvements |
| 4.8.2 | STR-029 | Add agentic-mode metrics (SQL query count, SQL total time, per-query stats) | Dashboard enhancements |
| 4.8.3 | STR-055 | Add saga generation metrics (chapters generated, avg quality score, model comparison, token usage) | Saga monitoring |
| 4.8.4 | STR-056 | Add narrative quality dashboard (accuracy trends, coherence, user feedback, prompt performance) | Quality monitoring |

---

## 8. Definition of Done (M4 Milestone)

### Event Templates
- [ ] Template system architecture implemented
- [ ] 132+ event types have dedicated templates
- [ ] Death cause renderer handles 50+ variants
- [ ] Fallback template for remaining event types
- [ ] Perspective-aware rendering integrated
- [ ] Temporal context rendering works
- [ ] Circumstance/reason rendering works

### Narrative Generators
- [ ] War narrative generation
- [ ] Battle detail rendering
- [ ] Civilization rise-and-fall narratives
- [ ] Character biography generation
- [ ] Age at death with fractions

### Agentic Storyteller
- [ ] Annotated schema summary generated
- [ ] SQL tool definition and safety layer
- [ ] Multi-round SQL exploration (up to 5 rounds)
- [ ] SSE stream filtering (tool calls hidden)
- [ ] Mode toggle (keyword/agentic/hybrid)
- [ ] Template vs. LLM hybrid rendering

### AI Narrative Generators (LVN)
- [ ] World summary generates on world page load
- [ ] Character obituary accessible from dead HF detail pages
- [ ] Year-in-history page renders for any valid year
- [ ] Highlight reel shows top 20 events

### Fortress Saga Generator (v4.0)
- [ ] Saga chapter planner generates coherent chapter outline from detected arcs
- [ ] Multi-model generator produces narrative against Qwen3 32B and at least one other model
- [ ] Combat scene generator transforms combat reports into vivid prose
- [ ] Atmospheric prose generator creates scene-setting from state snapshots
- [ ] Saga compilation produces HTML with ToC, character index, and entity links
- [ ] Incremental saga updates detect chapter-worthy events and generate new chapters
- [ ] Full fortress saga generates end-to-end (plan → chapters → compile) in < 10 minutes

### Narrative Quality & Tuning (v4.0)
- [ ] 6+ narrative style presets available with distinct voice
- [ ] Factual accuracy checker validates entity names and dates against CDM
- [ ] Narrative caching prevents re-generation of unchanged content
- [ ] User feedback (thumbs up/down) collected and aggregated
- [ ] Prompt optimization framework can compare prompt variants

### Observability
- [ ] Four-phase latency logging
- [ ] Monitoring dashboard with auto-refresh
- [ ] Saga generation metrics tracked
- [ ] Narrative quality dashboard operational

---

*Phase 4: Narrative Engine PRD/Roadmap v2.0 -- 2026-03-19*
*8 Stages, 65+ Tasks, 6-9 Weeks Estimated (v4.0: AI Storytelling Pipeline + Fortress Saga Generator + Narrative Quality & Tuning)*
