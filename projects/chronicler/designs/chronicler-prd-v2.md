# Chronicler PRD v2.2 — From Data Pipeline to Fortress Intelligence

**Date**: 2026-02-24 (Revised)
**Session**: 33
**Status**: Active development plan
**Supersedes**: PRD v2.0 (same file, pre-revision), `gap-closure-critical-review.md` (Phase 0-4 COMPLETE), `data-gap-analysis-2026-02-22.md` (reference only)
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

### Revision History

| Version | Date | Changes |
|---------|------|---------|
| v2.0 | 2026-02-23 | Initial PRD synthesizing gap analysis + user G1/G2 feedback |
| v2.1 | 2026-02-23 | 5 major corrections: embark-aware HF fallback, Unit-based relationships, live event generation, embark flag, agentic LLM queries |
| v2.2 | 2026-02-24 | Environment update: HomeServer → UTM Win11 VM; data access architecture revised (dfhack-run over SSH replaces broken TCP RPC); live world data confirmed (48K HFs, 442K events) |

---

## Executive Summary

Chronicler has completed its foundation phase: 35 PostgreSQL tables with composite PKs, 131 tests, a 16-section Lua bridge, lossless event capture, and a storyteller with 5 live data retrieval paths. The validation suite (9 identified gaps) and user review revealed that the **next leap isn't more data capture — it's making the existing data intelligent**.

Four strategic priorities emerge:

1. **Denizen Registry** — A gateway table that tracks every being who has touched the fortress, serving as the root node for all queries and the anchor for Narrative Value Scores
2. **Embark-Aware Data Unification** — Post-embark legends re-export as primary path; synthetic HF records only as fallback; relationships sourced from Unit data, not heuristic guessing
3. **Live Event Generation** — Convert runtime state transitions (kills, marriages, deaths, profession changes) into `history_events`-compatible records, giving fortress-born entities a proper event history
4. **Agentic Storyteller** — Replace keyword-routed extraction with an LLM that autonomously executes SQL queries, performing iterative rounds of data exploration to build evidence-based responses

This PRD defines the architecture, implementation phases, and success criteria for the transition from "data pipeline" to "fortress intelligence system."

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Denizen Registry](#3-denizen-registry)
4. [Data Unification](#4-data-unification)
5. [Live Event Generation](#5-live-event-generation)
6. [Explorer Enhancement](#6-explorer-enhancement)
7. [Agentic Storyteller](#7-agentic-storyteller)
8. [Bridge Expansion](#8-bridge-expansion)
9. [Knowledge Horizon](#9-knowledge-horizon)
10. [Reference Tool Benchmarking](#10-reference-tool-benchmarking)
11. [Implementation Phases](#11-implementation-phases)
12. [Success Criteria](#12-success-criteria)
13. [Dependencies & Risks](#13-dependencies--risks)
14. [File Inventory](#14-file-inventory)

---

## 1. Product Vision

### Current State (v0.8)

Chronicler is a **data pipeline with a chat interface**. It ingests Dwarf Fortress legends XML (world history) and live bridge data (fortress state), stores it in PostgreSQL, and provides a storyteller LLM that narrates based on keyword-routed database queries.

**What works well:**
- 16-section Lua bridge with lossless event capture (cursor-based reports + events)
- 131-test suite with composite PK correctness
- Storyteller with dual-tier context (HISTORICAL + LIVE), 12,000-char budget
- Explorer with Schema/Data/Graph/People/Civilizations/Geography tabs
- Change detector handling 11 event types (death, mood, stress, pregnancy, ghost, etc.)

**What's missing:**
- No concept of "who matters" — the LLM searches 60K+ HFs equally
- Starting dwarves (7-20 units) may lack Historical Figure records if only pre-embark legends were exported
- No live event generation — in-game kills, marriages, and deaths aren't recorded as `history_events`
- Deaths go undetected when a unit simply disappears between polls
- No unified "person" view merging Unit + HF data
- Storyteller uses static keyword→SQL routing rather than autonomous data exploration
- Explorer shows raw database views, not fortress-centric intelligence

### Target State (v1.0)

Chronicler becomes a **fortress intelligence system** with three pillars:

1. **Denizen-Centric Data**: Every fortress-relevant being tracked in a registry, with Unit+HF data merged and live events recorded as they happen
2. **Agentic Intelligence**: The LLM autonomously queries the database, exploring relationships and events through iterative SQL execution until it can provide an evidence-based response
3. **Domain-Specific Explorer**: Fortress-centric views (People, Events, Civilizations, Geography) with cross-linking, NVS sorting, and Knowledge Horizon masking

**Key mental model**: The denizen registry is the **root node of the Knowledge Horizon graph**. The agentic storyteller is not a retrieval pipeline — it is an autonomous analyst with read-only database access.

---

## 2. Architecture Overview

### Runtime Environment

**DF runs on UTM Win11 VM** (`DF-Windows` / `192.168.64.3`). DF 53.10 + DFHack 53.10-r1.

**Data access transport**: `dfhack-run` over SSH (key: `~/.ssh/df-vm`). TCP RPC is broken for game-thread calls on DFHack 53.x — only cached calls (GetVersion/GetWorldInfo) work; all other calls hang waiting for CoreSuspender. The `dfhack-run` command executes Lua directly on the DFHack Core thread via SSH, bypassing the TCP dispatch entirely.

**Confirmed live data** (world "The Land of Dawning", year 250, 257×257):
- 48,366 historical figures
- 442,716 history events
- 4,901 entities (8 dwarf civs, 8 human, 8 elf, 9 goblin, 8 kobold + underground)
- 8,035 artifacts
- 2,154 sites
- 2,278 regions

**File transfer**: HTTP file server on port 8889 (~105 MB/s) or SCP via SSH (~19 MB/s). Guest Agent is emergency-only (~0.24 MB/s).

### Data Flow (Current → Target)

```
CURRENT:
  Legends XML → Parser → PostgreSQL (35 tables) → Keyword Routing → Context Assembly → LLM → Chat
  Live Bridge → Watcher → PostgreSQL (units/events/probes) → Keyword Routing ↗ (partial)
  dfhack-run (SSH) → Lua commands → stdout (verified working for all data domains)

TARGET:
  Legends XML → Parser ──────────────────────────────→ PostgreSQL (40+ tables)
  Post-Embark Legends Re-export → Parser (with embark detection) ↗
  Live Bridge → Watcher ──────────────────────────────↗
  Live Bridge → Event Generator → history_events ─────↗
  dfhack-run (SSH) → Lua probes → Watcher ────────────↗
  Embark HF Fallback (if no post-embark export) ──────↗
                                                          ↓
                                                    Denizen Registry
                                                          ↓
                                                    LLM (Agentic SQL Tool Use)
                                                      ↓               ↓
                                                    Chat          Explorer
                                                                (fortress-centric views)
```

### New Architectural Components

| Component | Table/Module | Purpose |
|-----------|-------------|---------|
| Denizen Registry | `fortress_denizens` table | Gateway: every being who touched the fortress |
| Embark HF Fallback | `chronicler/synthetic.py` | Creates HF records for starting dwarves ONLY if not found in imported legends |
| Live Event Generator | `chronicler/events.py` | Converts runtime state transitions into `history_events`-compatible records |
| Death Detector | Watcher enhancement | Detects `is_alive` transitions + absence-based detection |
| Unified Person Builder | `chronicler/storyteller/person.py` | Merges Unit + HF data into single JSON for LLM consumption |
| Agentic SQL Interface | `chronicler/storyteller/agent.py` | LLM tool-use wrapper providing read-only SQL execution |
| Knowledge Horizon | `knowledge_horizon` table + views | Dynamic masking of database scope |

---

## 3. Denizen Registry

### Concept

The denizen registry tracks every unit/historical figure who has **been present at, lived at, visited, attacked, skulked around, or otherwise interacted with** the local fortress. It serves three purposes:

1. **LLM Gateway**: The agentic storyteller uses the denizen registry as its starting point for most queries
2. **Narrative Value Scoring**: Each denizen carries a score reflecting their storytelling importance (based on events, relationships, screen time)
3. **Death Tracking**: By maintaining a registry of known denizens, the system can detect when someone "falls off the radar" — even without an explicit death event

### Schema

```sql
CREATE TABLE IF NOT EXISTS fortress_denizens (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT,                -- NULL if HF-only (never had unit record)
    hf_id           INT,                -- NULL if unit-only (no HF match yet)
    name            TEXT NOT NULL,       -- Best available name
    english_name    TEXT,                -- English translation if available
    race            TEXT,
    status          TEXT NOT NULL DEFAULT 'unknown',
        -- 'resident'   : Currently living in fortress
        -- 'departed'   : Left alive (migrated out, caravan departed)
        -- 'deceased'   : Confirmed dead
        -- 'missing'    : Was resident, now absent (no departure/death event)
        -- 'visitor'    : Temporary presence (diplomat, merchant, performer)
        -- 'attacker'   : Hostile presence (siege, ambush)
        -- 'skulker'    : Covert presence (thief, snatcher)
        -- 'historical' : Known only from legends/relationships, never physically present
    embark          BOOLEAN DEFAULT FALSE,  -- TRUE if this was a starting dwarf at embark
    arrival_year    INT,                -- Year first detected at fortress
    arrival_tick    INT,                -- Tick within year
    departure_year  INT,                -- Year departed/died (NULL if still present)
    departure_tick  INT,
    departure_cause TEXT,               -- 'death', 'departure', 'unknown'
    narrative_value FLOAT DEFAULT 0.0,  -- Storytelling importance score (0.0-100.0)
    last_seen_tick  INT,                -- Last watcher cycle where this denizen was observed
    details         JSONB DEFAULT '{}', -- Extended metadata (roles, notable events, etc.)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (world_id, unit_id),
    UNIQUE (world_id, hf_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_status
    ON fortress_denizens(world_id, status);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_narrative
    ON fortress_denizens(world_id, narrative_value DESC);
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_hf
    ON fortress_denizens(world_id, hf_id) WHERE hf_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fortress_denizens_embark
    ON fortress_denizens(world_id) WHERE embark = TRUE;
```

### Population Sources

| Source | Trigger | Status Set | Embark? |
|--------|---------|------------|---------|
| Watcher detects new unit | Unit appears in bridge `unit_summary` | `resident` | See below |
| First watcher cycle | Unit count ≤ starting count, no prior watcher data | `resident` | `TRUE` |
| Watcher detects unit departure | Unit no longer in `unit_summary`, no death flag | `missing` → investigate | — |
| Bridge `announcements` | "A human caravan has arrived", "An ambush!" | `visitor` / `attacker` | — |
| Bridge `armies` | Army controller matches hostile entity | `attacker` | — |
| Legends XML import | HF with `hf_site_links` to fortress site | `historical` | — |
| Relationship chain | Spouse/parent/child of a `resident` | `historical` (known through relationship) | — |

**Embark detection**: On the first watcher cycle (no prior `fortress_denizens` entries), all detected units are marked `embark = TRUE`. Subsequent arrivals detected by the watcher are NOT embark dwarves.

### Narrative Value Score

The NVS is a composite score (0-100) reflecting a denizen's storytelling importance. It's recomputed periodically by the watcher. The formula draws from **df-narrator**'s scoring approach (event density, kill count, type bonuses) adapted for fortress context.

**Score components:**

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Screen time | 30% | Watcher cycles where this denizen was observed ÷ total cycles |
| Event density | 25% | Count of `history_events` (HF + live-generated) involving this entity |
| Relationship depth | 20% | Number of `hf_links` + unit relationships to other denizens |
| Recency | 15% | Inverse of ticks since last observation |
| Status weight | 10% | `resident` = 1.0, `deceased` = 0.8, `visitor` = 0.5, `historical` = 0.3 |

**Usage**: The agentic storyteller can query NVS to prioritize which denizens to include in its analysis. The explorer sorts/filters by NVS for "most interesting characters" views.

### Death Detection

The current system can't detect deaths unless a specific death event fires. The denizen registry enables a more robust approach:

1. **Direct detection**: Unit `is_alive` flag transitions from `true` to `false` → mark `deceased`, generate a `UNIT_DIED` live event
2. **Absence detection**: Denizen with `status = 'resident'` not observed for N consecutive watcher cycles → mark `missing`
3. **Announcement correlation**: "X has been struck down" announcement → match name to denizen → mark `deceased`, generate event
4. **History event correlation**: `HIST_FIGURE_DIED` event with matching `hf_id` → mark `deceased`

The `missing` status is critical: it captures cases where a dwarf simply disappears (killed by a forgotten beast, fell into a chasm, loyalty cascade) without a clean death event. The agentic storyteller can then investigate what happened to a `missing` denizen by querying events and announcements near `last_seen_tick`.

---

## 4. Data Unification

### 4.1 Embark-Aware HF Handling (Gap G1) — REVISED

**Problem**: The 7-20 starting dwarves have `hist_fig_id` values beyond the pre-embark legends XML export range. They exist as Units but may have no Historical Figure records.

**Primary solution**: Instruct the user to perform a **post-embark legends re-export** from the live fortress using DFHack's `exportlegends` command. This updated pair of XMLs will include HF records for all dwarves created at embark (the player can use DFHack to set the starting number to anything over 1; the game default is 7).

**Fallback solution**: If the user imports only pre-embark legends (or if the ETL pipeline detects embark dwarves missing from HF records), generate synthetic HF records from Unit data.

**ETL pipeline logic**:

```python
async def ensure_embark_hf_records(conn, world_id, embark_units):
    """Check embark dwarves for HF records; create synthetic ones if missing.

    This runs AFTER legends XML import and AFTER the first watcher cycle
    (which identifies embark dwarves via the embark flag).
    """
    for unit in embark_units:
        if unit['hist_fig_id'] is None:
            continue

        # Check if HF already exists (would exist if post-embark export was used)
        existing = await conn.fetchval(
            "SELECT id FROM historical_figures WHERE world_id = $1 AND id = $2",
            world_id, unit['hist_fig_id'])
        if existing:
            # HF record found — post-embark export was used, nothing to do
            # Optionally mark it as an embark dwarf in details
            await conn.execute("""
                UPDATE historical_figures
                SET details = details || '{"embark": true}'::jsonb
                WHERE world_id = $1 AND id = $2
            """, world_id, unit['hist_fig_id'])
            continue

        # HF record NOT found — pre-embark export only, create synthetic HF
        # Pull ALL data from the Unit record, including relationships
        relationships = unit.get('details', {}).get('relationships', [])

        await conn.execute("""
            INSERT INTO historical_figures (
                world_id, id, name, race, caste, birth_year,
                entity_id, embark, details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
        """, world_id, unit['hist_fig_id'], unit['name'], unit['race'],
            unit.get('caste'), unit.get('birth_year'), unit.get('civ_id'),
            json.dumps({
                'synthetic': True,
                'generated_from': 'unit_record',
                'unit_id': unit['id'],
                'relationships_from_unit': relationships,
                'generation_reason': 'Embark dwarf not found in imported legends XML'
            }))

        # Create hf_links from Unit relationship data (NOT from heuristic guessing)
        for rel in relationships:
            if rel.get('histfig_id'):
                await conn.execute("""
                    INSERT INTO hf_links (world_id, hf_id, target_hf_id, link_type)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                """, world_id, unit['hist_fig_id'],
                    rel['histfig_id'], rel.get('type', 'unknown'))
```

**Key design decisions (REVISED from v2.0):**

1. **Post-embark re-export is PRIMARY** — user documentation should instruct: "Export legends from DFHack after embark for best results"
2. **Synthetic HFs are FALLBACK ONLY** — created only when embark dwarves' `hist_fig_id` values aren't found in imported HF records
3. **`embark` flag** — new `BOOLEAN` column on `historical_figures` table, set `TRUE` for all embark dwarves (whether from re-export or synthetic). Replaces clunky "born after legends export" label
4. **Relationships from Unit records** — when synthetic HFs are needed, relationship data (spouse, parents, children) comes from the Unit record's `details.relationships[]` field (9 slots), NOT from heuristic guessing based on name/race matching against the civ HF pool
5. **Idempotent on re-import** — if the user later imports a post-embark legends export, the HF records will update via `ON CONFLICT DO UPDATE`, replacing synthetic data with authoritative legends data while preserving the `embark` flag

**Schema change on `historical_figures`:**
```sql
ALTER TABLE historical_figures ADD COLUMN IF NOT EXISTS embark BOOLEAN DEFAULT FALSE;
```

### 4.2 Unit↔HF Merge for Storyteller

**Problem**: The storyteller treats Units and HFs as separate entities. "Tell me about Urist" might match the HF record (legends history) OR the Unit record (live state) but never both.

**Solution**: The Unified Person Builder merges both data sources when building context for the agentic LLM.

**Merge strategy** (from `unit-hf-field-mapping.md`):

1. Start with Unit data (always fresher for live entities)
2. Overlay HF data for historical depth (relationships, events, positions)
3. For conflicts: prefer Unit for real-time state, HF for historical facts
4. Personality data is Unit-only (not in legends XML)
5. Event history: HF events from legends XML + live-generated events from the Event Generator (section 5)
6. If unit has no HF record and is an embark dwarf: flag `embark: true` — personality and skills available, event history will grow from live event generation

**Implementation**: New module `chronicler/storyteller/person.py` with:
- `build_unified_person(conn, world_id, identifier)` → unified JSON
- Accepts unit_id, hf_id, or name search
- Returns the schema defined in `unit-hf-field-mapping.md`

### 4.3 Death Detection Enhancement (Gap G2)

Add to the watcher's polling loop:

```python
async def detect_deaths(conn, world_id, current_units, previous_units, event_gen):
    """Detect deaths by comparing current unit list to previous cycle."""
    current_ids = {u['id'] for u in current_units}
    previous_ids = {u['id'] for u in previous_units}

    # Units that disappeared
    missing_ids = previous_ids - current_ids
    for uid in missing_ids:
        prev_unit = next(u for u in previous_units if u['id'] == uid)
        await conn.execute("""
            UPDATE fortress_denizens
            SET status = 'missing', departure_year = $3, departure_tick = $4
            WHERE world_id = $1 AND unit_id = $2 AND status = 'resident'
        """, world_id, uid, current_year, current_tick)

    # Units whose is_alive changed
    for unit in current_units:
        if unit.get('flags', {}).get('killed') or not unit.get('is_alive', True):
            await conn.execute("""
                UPDATE fortress_denizens
                SET status = 'deceased', departure_cause = 'death',
                    departure_year = $3, departure_tick = $4
                WHERE world_id = $1 AND unit_id = $2 AND status IN ('resident', 'missing')
            """, world_id, unit['id'], current_year, current_tick)

            # Generate a live death event (see Section 5)
            await event_gen.record_death(world_id, unit, current_year, current_tick)
```

---

## 5. Live Event Generation

### Concept

**This is a new capability not in PRD v2.0.** Instead of relying solely on legends XML for event history, Chronicler should **generate EVENT records from live in-game data**. When a dwarf kills a wolf, this should be detected and converted into an EVENT record matching the `history_events` table structure. Marriage, death, childbirth, profession changes, position assignments, and the like should emerge from the database monitoring system.

This is essential for fortress-born entities (embark dwarves, babies born in-fortress) who have no pre-existing HF event history. Without live event generation, these characters would appear to the storyteller as having no history at all — despite potentially having the richest in-game stories.

### Event Types to Generate

Events are detected by comparing successive watcher cycles (state diffs) and by monitoring bridge sections (announcements, armies, buildings).

| Event Type | Detection Method | Maps to HF Event Type |
|-----------|------------------|----------------------|
| **Death** | `is_alive` transition FALSE, or unit disappearance | `HF_DIED` |
| **Kill** | Attacker's `kill_count` increases between cycles | `HF_SIMPLE_BATTLE_EVENT` |
| **Marriage** | New spouse relationship appears in unit data | `ADD_HF_HF_LINK` (spouse) |
| **Childbirth** | New unit appears with parent relationships pointing to fortress denizens | `HF_BORN` (custom) |
| **Profession change** | `profession` field changes between cycles | `CHANGE_CREATURE_TYPE` (approximate) |
| **Position assignment** | Position data changes (from entity_position_assignments) | `ASSUME_IDENTITY` or custom |
| **Mood** | Strange mood detected by change detector | `STRANGE_MOOD` (custom) |
| **Artifact creation** | New artifact appears in bridge data | `ARTIFACT_CREATED` |
| **Arrival (migrant)** | New unit detected by watcher, not first cycle | `HF_REACHED_SUMMIT` (approximate) or custom `MIGRANT_ARRIVED` |
| **Departure** | Unit disappears without death flag | `HF_LEFT_SITE` (custom) |
| **Skill milestone** | Skill level crosses a threshold (Proficient → Expert → Master → Legendary) | Custom `SKILL_MILESTONE` |
| **Stress event** | Stress level crosses critical thresholds | Custom `STRESS_CRISIS` |

### Schema

Live-generated events use the **same `history_events` table** as legends XML events, with a distinguishing flag:

```sql
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS live_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE history_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'legends';
    -- 'legends'      : From legends XML import
    -- 'live_watcher'  : Generated by the watcher from state transitions
    -- 'live_bridge'   : Generated from bridge announcement/army data
```

This design ensures that the agentic storyteller queries a **single unified events table** and doesn't need to distinguish between legends events and live events. The `source` column allows filtering if needed (e.g., for Knowledge Horizon masking where legends events have different confidence than live-observed events).

### Event Generator Module

```python
class EventGenerator:
    """Converts runtime state transitions into history_events records."""

    def __init__(self, conn, world_id):
        self.conn = conn
        self.world_id = world_id
        self._next_event_id = None  # Auto-assigned beyond legends range

    async def _get_next_event_id(self):
        """Get next available event ID (beyond the max legends event ID)."""
        if self._next_event_id is None:
            max_id = await self.conn.fetchval(
                "SELECT COALESCE(MAX(id), 0) FROM history_events WHERE world_id = $1",
                self.world_id)
            self._next_event_id = max_id + 10000  # Gap for safety
        self._next_event_id += 1
        return self._next_event_id

    async def record_death(self, world_id, unit, year, tick):
        event_id = await self._get_next_event_id()
        await self.conn.execute("""
            INSERT INTO history_events (
                world_id, id, year, seconds, type, hf_id,
                site_id, details, live_generated, source
            ) VALUES ($1, $2, $3, $4, 'hf died', $5, $6, $7, TRUE, 'live_watcher')
        """, world_id, event_id, year, tick,
            unit.get('hist_fig_id'), self._fortress_site_id,
            json.dumps({
                'unit_id': unit['id'],
                'cause': unit.get('death_cause', 'unknown'),
                'name': unit.get('name')
            }))

    async def record_kill(self, world_id, killer_unit, victim_info, year, tick):
        event_id = await self._get_next_event_id()
        await self.conn.execute("""
            INSERT INTO history_events (
                world_id, id, year, seconds, type, hf_id, hf_id_2,
                site_id, details, live_generated, source
            ) VALUES ($1, $2, $3, $4, 'hf simple battle event', $5, $6, $7, $8, TRUE, 'live_watcher')
        """, world_id, event_id, year, tick,
            killer_unit.get('hist_fig_id'), victim_info.get('hist_fig_id'),
            self._fortress_site_id,
            json.dumps({
                'killer_unit_id': killer_unit['id'],
                'killer_name': killer_unit.get('name'),
                'victim_name': victim_info.get('name')
            }))

    async def record_profession_change(self, world_id, unit, old_prof, new_prof, year, tick):
        event_id = await self._get_next_event_id()
        await self.conn.execute("""
            INSERT INTO history_events (
                world_id, id, year, seconds, type, hf_id,
                site_id, details, live_generated, source
            ) VALUES ($1, $2, $3, $4, 'change creature type', $5, $6, $7, TRUE, 'live_watcher')
        """, world_id, event_id, year, tick,
            unit.get('hist_fig_id'), self._fortress_site_id,
            json.dumps({
                'unit_id': unit['id'],
                'old_profession': old_prof,
                'new_profession': new_prof,
                'name': unit.get('name')
            }))

    async def record_skill_milestone(self, world_id, unit, skill_name, old_level, new_level, year, tick):
        event_id = await self._get_next_event_id()
        await self.conn.execute("""
            INSERT INTO history_events (
                world_id, id, year, seconds, type, hf_id,
                site_id, details, live_generated, source
            ) VALUES ($1, $2, $3, $4, 'skill milestone', $5, $6, $7, TRUE, 'live_watcher')
        """, world_id, event_id, year, tick,
            unit.get('hist_fig_id'), self._fortress_site_id,
            json.dumps({
                'unit_id': unit['id'],
                'skill': skill_name,
                'old_level': old_level,
                'new_level': new_level,
                'name': unit.get('name')
            }))

    # Additional methods: record_marriage, record_birth, record_mood,
    # record_artifact_created, record_arrival, record_departure, etc.
```

### Integration with Watcher

The Event Generator is instantiated per watcher cycle and receives state diffs from the change detector:

```python
# In watcher polling loop
event_gen = EventGenerator(conn, world_id)

# Death detection feeds into event generator
await detect_deaths(conn, world_id, current_units, previous_units, event_gen)

# Profession change detection
for unit_id, changes in unit_diffs.items():
    if 'profession' in changes:
        await event_gen.record_profession_change(
            world_id, unit, changes['profession']['old'],
            changes['profession']['new'], year, tick)

    # Kill count delta detection
    old_kills = changes.get('kill_count', {}).get('old', 0)
    new_kills = changes.get('kill_count', {}).get('new', 0)
    if new_kills > old_kills:
        # Attempt to identify victim from announcements
        await event_gen.record_kill(world_id, unit, victim_info, year, tick)

    # Skill milestone detection
    for skill_change in changes.get('skills', []):
        if skill_change['new_level'] in MILESTONE_LEVELS:
            await event_gen.record_skill_milestone(
                world_id, unit, skill_change['name'],
                skill_change['old_level'], skill_change['new_level'], year, tick)
```

### Why This Matters

Without live event generation, a fortress that has been running for 10 in-game years would show embark dwarves (and fortress-born children) with **zero events** in their history. The storyteller would have nothing to say about them except their current state. With live event generation, these characters accumulate a growing event history — battles fought, skills mastered, positions held, marriages formed — that makes them narratively rich subjects for the storyteller, on par with HFs imported from legends XML.

---

## 6. Explorer Enhancement

### Current State

The explorer has 6 tabs: People, Civilizations, Geography, Database (Schema+Data), Graph. All implemented in Session 32-33 via the Explorer Redesign plan and Explorer UI Enhancements plan.

### Remaining Work (from active plans)

**Phases 1-7 of `rippling-honking-crescent.md` are COMPLETE.** Remaining:

| Item | Plan | Status | PRD Phase |
|------|------|--------|-----------|
| Phase 8: Knowledge Horizon stub | rippling-honking-crescent | Deferred | Phase 5 |
| Phase 3: Unit data extraction expansion | rippling-honking-crescent | NOT STARTED | Phase 2 |
| Accent-insensitive search | rippling-honking-crescent | Plan only | Phase 2 |
| Events & Timeline tab | shiny-churning-sprout | NOT STARTED | Phase 4 |
| Entity Position Extraction | sparkling-sauteeing-snowglobe | COMPLETE | — |

### New Explorer Features (Denizen-Centric)

Once the denizen registry and live event generation exist, the People tab should add:

1. **"Fortress Folk" default view**: Shows only `fortress_denizens` where `status IN ('resident', 'deceased', 'missing')`, sorted by NVS
2. **Status badges**: Green (resident), Gray (departed), Red (deceased), Yellow (missing), Star (embark)
3. **Unified person detail**: Click any denizen → merged Unit + HF view (both data sources)
4. **Event timeline**: Per-denizen event list combining legends events + live-generated events, chronologically sorted
5. **Death investigation**: For `missing` denizens, show timeline of last observations and nearby events
6. **NVS column**: Sortable narrative value score
7. **Embark badge**: Visual indicator for founding dwarves

### Events Tab Enhancements

The Events tab (from shiny-churning-sprout Phase 4) should include:

- **Source filter**: Toggle between "All Events", "Legends Only", "Live Only"
- **Fortress events**: Default to showing only events at the fortress site or involving fortress denizens
- **Event detail cards**: Following **weblegends** pattern — context-aware rendering with circumstance/reason fields where available
- **Collection view**: Expandable war/battle/siege trees (following **LegendsBrowser2** collection summarization pattern)

---

## 7. Agentic Storyteller

### REVISED Architecture (v2.1)

**The v2.0 PRD defined a keyword→SQL routing pipeline.** This is replaced with an **agentic architecture** where the LLM autonomously executes SQL queries against the database.

**Why**: The keyword-routing approach is brittle — it requires anticipating every possible user question and mapping it to a fixed set of SQL queries. An agentic approach lets the LLM decide what data it needs, query for it, analyze the results, and iterate until it has enough evidence to answer the user's question.

### Current Architecture (v0.8 — to be replaced)

```
User question
  → extract_keywords()
  → stop-word filter
  → categorical routing (23 fixed routes) + ILIKE search
  → format_context()
  → 12,000 char budget
  → LLM (Qwen3 8B) generates response
```

Problems:
- Fixed routing can't handle novel questions
- LLM has no agency — it sees pre-selected context and must work with whatever it gets
- No iterative refinement — single pass, take it or leave it
- Can't follow chains of reasoning ("Who killed the dwarf who was married to the mayor?")

### Target Architecture (v1.0 — Agentic)

```
User question
  ↓
LLM receives system prompt with:
  - Database schema summary (table names, key columns, row counts)
  - SQL tool definition (read-only SELECT/WITH queries only)
  - Denizen registry summary (top denizens by NVS, recent events)
  - Instructions: "You have read-only access to the Chronicler database.
    Execute SQL queries to find the information you need. You may run
    multiple queries, refining your search based on results."
  ↓
LLM decides what to query → emits SQL tool call
  ↓
Tool executor: validates query (read-only), executes, returns results (max 50 rows)
  ↓
LLM analyzes results → may issue another query (up to N rounds)
  ↓
LLM composes final response with evidence citations
```

### SQL Tool Definition

```python
SQL_TOOL = {
    "name": "query_database",
    "description": """Execute a read-only SQL query against the Chronicler database.

    The database contains Dwarf Fortress world data:
    - historical_figures: 60K+ legendary figures with names, races, kill counts
    - history_events: 312K+ historical events (battles, deaths, artifact creation, etc.)
    - entities: Civilizations, religions, military orders with positions and members
    - sites: Cities, fortresses, caves with structures and populations
    - units: Live fortress inhabitants with skills, personality, stress, mood
    - fortress_denizens: Registry of beings who interacted with the fortress
    - hf_links: Relationships between historical figures (family, enemies, etc.)
    - hf_entity_links: Memberships in civilizations and organizations

    Use SELECT or WITH (CTE) queries only. Queries are limited to 50 rows.
    Use ILIKE for name searches (names use Dwarvish + English translations).
    Key join pattern: historical_figures.id = hf_links.hf_id (within same world_id).
    """,
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": "The SQL query to execute (SELECT or WITH only)"
            },
            "reasoning": {
                "type": "string",
                "description": "Why you're running this query — what information you're looking for"
            }
        },
        "required": ["sql", "reasoning"]
    }
}
```

### Tool Executor Safety

```python
async def execute_storyteller_query(conn, sql: str, max_rows: int = 50) -> dict:
    """Execute a read-only SQL query for the agentic storyteller.

    Safety:
    1. Keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE)
    2. Primary defense: asyncpg readonly transaction
    3. Row limit enforcement via LIMIT injection
    4. Timeout: 5 seconds per query
    """
    # Defense in depth: keyword check
    forbidden = {'insert', 'update', 'delete', 'drop', 'alter', 'truncate',
                 'create', 'grant', 'revoke'}
    tokens = sql.lower().split()
    if any(t in forbidden for t in tokens):
        return {"error": "Query contains forbidden keyword", "rows": []}

    # Primary defense: readonly transaction
    try:
        async with conn.transaction(readonly=True):
            # Enforce row limit
            if 'limit' not in sql.lower():
                sql = f"SELECT * FROM ({sql}) _q LIMIT {max_rows}"

            rows = await asyncio.wait_for(
                conn.fetch(sql), timeout=5.0)

            return {
                "columns": [col for col in rows[0].keys()] if rows else [],
                "rows": [dict(r) for r in rows[:max_rows]],
                "row_count": len(rows),
                "truncated": len(rows) >= max_rows
            }
    except asyncio.TimeoutError:
        return {"error": "Query timed out (5s limit)", "rows": []}
    except Exception as e:
        return {"error": str(e), "rows": []}
```

### Agentic Loop

```python
async def agentic_storyteller(conn, user_question: str, world_id: int, max_rounds: int = 5):
    """Run the agentic storyteller loop.

    The LLM receives the user's question, a database schema summary,
    and a SQL tool. It iteratively queries until satisfied, then
    composes a final narrative response.
    """
    # Build schema summary (cached, updated on server start)
    schema_summary = await build_schema_summary(conn, world_id)

    # Build denizen context (top 10 by NVS, recent events)
    denizen_context = await build_denizen_summary(conn, world_id)

    messages = [
        {"role": "system", "content": AGENTIC_SYSTEM_PROMPT.format(
            schema=schema_summary,
            denizens=denizen_context,
            world_id=world_id
        )},
        {"role": "user", "content": user_question}
    ]

    for round_num in range(max_rounds):
        response = await llm_call(messages, tools=[SQL_TOOL])

        if response.stop_reason == "end_turn":
            # LLM is done — return the final text response
            return response.text

        if response.stop_reason == "tool_use":
            for tool_call in response.tool_calls:
                if tool_call.name == "query_database":
                    result = await execute_storyteller_query(
                        conn, tool_call.input["sql"])
                    messages.append({"role": "assistant", "content": response.content})
                    messages.append({"role": "user", "content": [
                        {"type": "tool_result",
                         "tool_use_id": tool_call.id,
                         "content": json.dumps(result, default=str)}
                    ]})

    # Max rounds reached — ask LLM to conclude with what it has
    messages.append({"role": "user", "content":
        "You've reached the maximum number of queries. Please provide your best answer based on the data gathered so far."})
    response = await llm_call(messages)
    return response.text
```

### Agentic System Prompt

```
You are the Chronicler, a scholar-narrator of Dwarf Fortress. You have read-only
access to the fortress's historical database via SQL queries.

DATABASE SCHEMA:
{schema}

FORTRESS DENIZENS (top characters by narrative importance):
{denizens}

INSTRUCTIONS:
1. When the user asks a question, think about what data you need to answer it.
2. Use the query_database tool to execute SQL queries. You may run multiple queries.
3. Start with broad queries to orient yourself, then narrow down.
4. For name searches, use ILIKE '%name%' — names may be Dwarvish or English.
5. Always include world_id = {world_id} in WHERE clauses.
6. Check both historical_figures AND units tables for fortress inhabitants.
7. Look at the fortress_denizens table for beings connected to the fortress.
8. Events in history_events with live_generated = TRUE are from fortress observation,
   not from ancient legends — treat these as highly reliable.
9. After gathering enough data, compose a narrative response in character.

RESPONSE STYLE:
- Speak as an in-world chronicler documenting the fortress's history
- Cite specific events, dates, and relationships from your query results
- If data is sparse, acknowledge uncertainty: "The records are incomplete..."
- Distinguish between legends data (ancient history) and live observations (recent)
- If a denizen is marked as 'missing', speculate cautiously about their fate
```

### LLM Requirements

The agentic architecture requires a model that supports **tool use** (function calling). Options:

| Model | Tool Use | Latency | Quality | Notes |
|-------|----------|---------|---------|-------|
| **Claude (Sonnet/Haiku)** via API | Native | ~2-3s TTFT | Excellent | Best tool use, API cost |
| **Qwen3 32B** via Ollama | Supported | ~5-8s TTFT | Good | Local, free, needs testing |
| **Qwen3 8B** via Ollama | Partial | ~0.4s TTFT | Moderate | Current model, may lack tool use reliability |
| **Llama 3.1 70B** via Ollama | Supported | ~10s TTFT | Good | Local, proven tool use |

**Recommendation**: Start with Qwen3 32B for local development (already running via LiteLLM). For production quality, Claude Haiku via API offers the best tool-use reliability at reasonable cost. The agentic system should support model swapping via config.

### Migration Path from v0.8

The existing keyword-routing retrieval in `chronicler/storyteller/context.py` is retained as a **fallback mode**. The agentic mode is the new default, but users can toggle back if:
- The LLM generates too many queries (performance concern)
- Tool use isn't reliable with the configured model
- Simpler, faster responses are preferred

Config toggle: `storyteller_mode: "agentic" | "keyword"` in `chronicler/config.py`.

---

## 8. Bridge Expansion

### Current Bridge State (v6, 16 sections)

All Tier 1 and most Tier 2 items from the gap analysis are implemented. Remaining bridge work:

| Item | Gap Analysis ID | Priority | Effort |
|------|----------------|----------|--------|
| Unit birth_year, sex, death_cause | rippling Phase 3 | HIGH | ~15 lines Lua |
| Unit personality traits (50 facets) | rippling Phase 3 | MEDIUM | ~60 lines Lua |
| Unit relationships (9 slots) | rippling Phase 3 | HIGH | ~15 lines Lua |
| Unit physical/mental attributes | rippling Phase 3 | LOW | ~30 lines Lua |
| Unit cultural_identity | rippling Phase 3 | LOW | ~2 lines Lua |

**Note**: These are all defined in `rippling-honking-crescent.md` Phase 3. The PRD doesn't redefine them — it schedules them within the phased implementation.

### New Bridge Section: Denizen Tracking

Add a lightweight `denizen_tracking` section to the bridge that emits:

```lua
-- For each unit, emit minimal tracking data
entry.id = u.id
entry.hist_fig_id = u.hist_figure_id
entry.is_alive = not dfhack.units.isDead(u)
entry.pos = {x=u.pos.x, y=u.pos.y, z=u.pos.z}
entry.kill_count = u.status.current_soul and u.status.current_soul.performance_group_ref or 0
```

This is separate from the full `unit_summary` — it runs over ALL units (not just fortress dwarves) to detect visitors, merchants, diplomats, and attackers. Capped at 500 entries to bound performance.

### New Bridge Section: Relationship Extraction

For embark dwarves and new arrivals, extract the 9 relationship slots:

```lua
local rels = {}
if u.status and u.status.current_soul then
    for _, rel in ipairs(u.status.current_soul.relationships) do
        table.insert(rels, {
            type = df.unit_relationship_type[rel.type] or tostring(rel.type),
            histfig_id = rel.histfig_id,
            unit_id = rel.unit_id
        })
    end
end
entry.relationships = rels
```

---

## 9. Knowledge Horizon

The Knowledge Horizon design (`knowledge-horizon.md`) defines the long-term masking system. The denizen registry is its foundation — the "root node" that determines what's visible.

### Phased Rollout

| Phase | Scope | When |
|-------|-------|------|
| **Phase 1** (this PRD) | Denizen registry as starting point for agentic queries | Immediate |
| **Phase 2** | View-based masking for HFs (visible if denizen or 1-hop from denizen) | After Phase 1 validated |
| **Phase 3** | Geographic masking (visible sites = fortress region + denizen origins) | After Phase 2 |
| **Phase 4** | Full Knowledge Horizon with 7 caveats (CAV-001 through CAV-007) | Long-term |

In the agentic architecture, the Knowledge Horizon manifests as **query constraints injected into the system prompt** rather than database views. The LLM is instructed to scope its queries through the denizen registry and to avoid speculating about entities outside the fortress's knowledge.

This PRD implements Phase 1 only. The denizen registry table is designed to support Phases 2-4 without schema changes.

---

## 10. Reference Tool Benchmarking

Chronicler must **match or exceed** the capabilities of existing DF legends viewers. Analysis of 10 reference repositories (Session 33) identified these benchmarking targets:

### Must Match (Parity Features)

| Feature | Best-in-class Tool | Chronicler Status |
|---------|-------------------|-------------------|
| Streaming XML parse (>25MB files) | LegendsBrowser2 (custom Go tokenizer) | DONE (lxml iterparse) |
| 100+ event type rendering | LegendsBrowser2, LegendsViewer-Next | PARTIAL (wide table, 141 types enumerated) |
| Entity/figure/site cross-linking | All viewers | DONE (Explorer 6-tab with FK navigation) |
| Ego-network graph visualization | None (Chronicler original) | DONE (vis.js, 1-3 hop) |
| War/battle collection trees | LegendsBrowser2 | TODO (Events tab Phase 4) |
| Context-aware event rendering | weblegends (96 per-event .cpp files) | TODO (event detail cards) |
| Family tree visualization | LegendsViewer-Next (genealogy) | TODO (future) |

### Must Exceed (Differentiating Features)

| Feature | Existing Tool Capability | Chronicler Advantage |
|---------|------------------------|---------------------|
| **Live fortress data** | None (all viewers are post-game) | Real-time unit state via bridge |
| **AI narrative** | None | Agentic storyteller with SQL tool use |
| **Live event generation** | None | Runtime state → history_events records |
| **Unified person view** | None (HF-only in all viewers) | Merged Unit + HF + personality + events |
| **Embark dwarf coverage** | None (starting dwarves invisible everywhere) | Embark-aware HF handling + live events |
| **Narrative Value Scoring** | df-narrator (figure scoring for Markdown export) | Real-time NVS updated per watcher cycle |
| **Database exploration** | None (viewers are read-only displays) | SQL runner, schema browser, JSONB expansion |
| **Knowledge Horizon masking** | None | Dynamic visibility based on fortress knowledge |

### Scoring Formula Comparison

**df-narrator scoring** (for figure ranking):
```
score = min(events × 2, 500) + kills × 15 + type_bonus + links × 3 + positions × 20 + artifacts × 30
```

**Chronicler NVS** (for fortress-centric ranking):
```
NVS = (screen_time × 0.30) + (event_density × 0.25) + (relationship_depth × 0.20) + (recency × 0.15) + (status_weight × 0.10)
```

The key difference: df-narrator ranks globally (who is most important in world history), while NVS ranks locally (who is most important to the fortress's story). Both are valid — Chronicler should compute both scores and let the agentic LLM decide which to prioritize based on the user's question.

---

## 11. Implementation Phases

### Phase 1: Denizen Registry + Death Detection (Effort: 6-8 hours)

**Goal**: Establish the denizen registry as the central tracking table, with death/departure detection and embark detection.

**Tasks:**

1. **Schema**: Create `fortress_denizens` table + indexes (with `embark` column)
2. **Initial population**: Script to scan existing `units` table and create denizen entries for all known units
3. **Embark detection**: On first watcher cycle (no prior denizen data), mark all detected units as `embark = TRUE`
4. **HF linking**: For each denizen with `hist_fig_id`, set `hf_id` if the HF exists in `historical_figures`
5. **Watcher integration**: On each poll cycle:
   - Detect new units → register as `resident`
   - Detect missing units → mark `missing` or `deceased` based on flags
   - Update `last_seen_tick` for all observed units
6. **Death detection**: Compare current unit list to previous cycle, check `is_alive` transitions
7. **NVS computation**: Initial formula based on event count + relationship count + observation cycles
8. **CLI command**: `chronicler denizens` — list all denizens with status, NVS, HF link status, embark flag

**Files modified:**
- `chronicler/db/schema.sql` — add `fortress_denizens` table
- `chronicler/dfhack/watcher.py` — denizen tracking + death detection
- `chronicler/cli.py` — add `denizens` command
- New: `chronicler/denizens.py` — denizen management module

**Verification:**
- Run watcher for 3+ cycles → denizens table populated with all fortress units
- First cycle units all have `embark = TRUE`
- Kill a dwarf in DF → denizen status changes to `deceased` within 2 cycles
- Run `chronicler denizens` → see all 20+ fortress dwarves with status, NVS, and embark flag

---

### Phase 2: Embark HF Handling + Unit Data Expansion + Live Event Generator (Effort: 6-8 hours)

**Goal**: Embark dwarves get HF records (from re-export or synthetic fallback), unit data extraction expands, and live event generation begins.

**Tasks:**

1. **`embark` column on `historical_figures`**: Add `embark BOOLEAN DEFAULT FALSE`
2. **ETL embark check**: After legends import + first watcher cycle, check each embark dwarf's `hist_fig_id` against `historical_figures`; create synthetic HF only if missing
3. **Relationship extraction from Units**: When synthetic HFs are needed, pull relationship data from Unit records (9 relationship slots), NOT from heuristic civ HF pool guessing
4. **Bridge expansion** (from rippling Phase 3): birth_year, sex, death_cause, relationships, personality traits
5. **Schema expansion**: Add `birth_year`, `sex`, `death_cause` columns to `units`; add `live_generated`, `source` columns to `history_events`
6. **Watcher sync**: Write expanded bridge fields to `units` table + `details` JSONB
7. **Live Event Generator**: New module detecting state transitions and writing `history_events` records
8. **Event types implemented**: Death, profession change, skill milestone (first 3)
9. **User documentation**: Instructions for post-embark legends re-export

**Files modified:**
- `chronicler/ingest/xml_parser.py` — `embark` column handling, re-import idempotency
- `chronicler/db/schema.sql` — `units` columns, `embark` on HFs, `live_generated`/`source` on events
- `chronicler/dfhack/scripts/chronicler-bridge.lua` — expanded extraction + relationship slots
- `chronicler/dfhack/watcher.py` — new field sync + event generator integration
- New: `chronicler/synthetic.py` — embark HF fallback generation
- New: `chronicler/events.py` — live event generator

**Verification:**
- With post-embark export: embark dwarves appear in `historical_figures` with `embark = TRUE`, NO synthetic flag
- Without post-embark export: embark dwarves get synthetic HF records with relationships from Unit data
- Kill a dwarf → death event appears in `history_events` with `live_generated = TRUE`
- Change a dwarf's profession → profession change event generated
- `units` table has `birth_year` and `sex` populated
- `details` JSONB includes personality, relationships, attributes

---

### Phase 3: Agentic Storyteller + Explorer Integration (Effort: 8-10 hours)

**Goal**: Storyteller uses agentic SQL tool-use for autonomous data exploration; explorer shows fortress-centric views with live events.

**Tasks:**

1. **SQL tool definition**: Read-only query tool with safety validation
2. **Agentic loop**: Multi-round LLM → SQL → results → LLM cycle (max 5 rounds)
3. **Schema summary builder**: Auto-generated table/column/rowcount summary for LLM system prompt
4. **Denizen summary builder**: Top denizens by NVS + recent events for LLM context
5. **Unified Person Builder**: New module merging Unit + HF data per the field mapping
6. **Agentic system prompt**: In-world chronicler persona with database access instructions
7. **Fallback mode**: Config toggle to revert to keyword-routing if needed
8. **Explorer People tab**: "Fortress Folk" default view sorted by NVS with embark badges
9. **Explorer status badges**: Visual status indicators (resident/deceased/missing/embark)
10. **Explorer unified detail**: Merged Unit + HF view with combined event timeline
11. **SSE streaming**: Agentic responses streamed to UI (tool calls hidden, final response streamed)

**Files modified:**
- New: `chronicler/storyteller/agent.py` — agentic loop + SQL tool executor
- New: `chronicler/storyteller/person.py` — unified person builder
- `chronicler/storyteller/context.py` — retained as fallback mode
- `chronicler/storyteller/prompts.py` — agentic system prompt
- `chronicler/config.py` — `storyteller_mode` config
- `chronicler/api/routes/storyteller.py` — agentic endpoint
- `chronicler/api/templates/explorer.html` — fortress folk view + event timeline
- `chronicler/api/routes/people.py` — denizen endpoint with unified person

**Verification:**
- "Tell me about [fortress dwarf]" → LLM executes 2-3 queries, returns merged personality + history
- "Who died recently?" → LLM queries denizen registry + death events, returns accurate report
- "Tell me about my fortress" → LLM explores denizens, events, demographics, composes overview
- "Who killed the dwarf who was married to the mayor?" → LLM chains multiple queries to find answer
- Explorer People tab defaults to fortress denizens with NVS sort and embark badges
- Fallback mode (`storyteller_mode: keyword`) still works

---

### Phase 4: Events Tab + Knowledge Horizon Stub (Effort: 4-6 hours)

**Goal**: Events & Timeline tab for the explorer, and the initial Knowledge Horizon system.

**Tasks:**

1. **Events API**: Endpoints for filtered event browsing (year range, type, participant, source)
2. **Events tab**: Chronological table with clickable participants and locations
3. **Source filter**: Toggle between "All Events", "Legends Only", "Live Only"
4. **Event collection view**: Expandable war/battle trees (benchmarking LegendsBrowser2)
5. **Event detail cards**: Context-aware rendering following weblegends pattern
6. **Knowledge Horizon table**: `knowledge_horizon` table with visibility flags
7. **Horizon population**: Script to set initial visibility based on denizen registry
8. **Horizon integration**: Agentic LLM system prompt includes horizon constraints

**Files modified:**
- New: `chronicler/api/routes/events.py` — events endpoints
- `chronicler/api/templates/explorer.html` — events tab + horizon toggle
- `chronicler/db/schema.sql` — `knowledge_horizon` table
- New: `chronicler/horizon.py` — horizon computation

**Verification:**
- Events tab: filter by year range, see events with clickable participants
- Source filter: "Live Only" shows fortress events, "Legends Only" shows pre-fortress history
- Knowledge Horizon constraints in agentic system prompt
- Event collections (wars, battles) expandable in tree view

---

### Phase 5: Polish + Long-Term Features (Effort: varies)

**Goal**: Quality of life improvements and advanced features.

**Tasks (prioritized):**
1. Accent-insensitive search (`unaccent` extension) — from rippling Phase 1
2. Age calculation display — from rippling Phase 2
3. Position table enhancement (gender-appropriate titles) — from rippling Phase 5
4. Sidebar sort/filter — from rippling Phase 6
5. Load members enhancement — from rippling Phase 7
6. Additional live event types (marriage, birth, artifact creation, mood, arrival/departure)
7. Narrative engine (proactive story generation) — from session-state next steps
8. Skills time-series tracking — from session-state next steps
9. Full Knowledge Horizon with all 7 caveats — from knowledge-horizon.md
10. Interactive maps (Leaflet.js) — benchmarking LegendsViewer-Next
11. Family tree visualization — benchmarking LegendsViewer-Next
12. Global figure scoring (df-narrator formula) alongside NVS

---

## 12. Success Criteria

### Phase 1 Complete When:
- [ ] `fortress_denizens` table exists and is populated by watcher
- [ ] First-cycle units marked `embark = TRUE`
- [ ] Deaths detected within 2 watcher cycles (direct flag detection)
- [ ] Missing denizens detected within 3 cycles (absence detection)
- [ ] `chronicler denizens` CLI command shows all fortress inhabitants with status and embark flag
- [ ] NVS scores computed and sortable

### Phase 2 Complete When:
- [ ] Embark dwarves have HF records (from re-export OR synthetic fallback)
- [ ] `embark` flag set on `historical_figures` for all embark dwarves
- [ ] When synthetic: relationships sourced from Unit data (not heuristic guessing)
- [ ] `history_events` table accepts live-generated events with `live_generated = TRUE`
- [ ] At least 3 event types generated from live data (death, profession change, skill milestone)
- [ ] `units` table has `birth_year`, `sex`, `death_cause` columns populated
- [ ] Personality traits, relationships, attributes in `details` JSONB

### Phase 3 Complete When:
- [ ] Agentic storyteller executes SQL queries autonomously (2-5 rounds per question)
- [ ] "Tell me about [name]" returns merged Unit + HF data with evidence from queries
- [ ] "Who died recently?" returns accurate death report from live events
- [ ] "Who killed X?" demonstrates multi-step query chaining
- [ ] Config toggle between agentic and keyword mode works
- [ ] Explorer People tab defaults to fortress denizens with NVS sort and embark badges

### Phase 4 Complete When:
- [ ] Events tab functional with year/type/participant/source filters
- [ ] Knowledge Horizon constraints active in agentic system prompt
- [ ] Event collections (wars, battles) expandable in tree view
- [ ] Source filter distinguishes legends vs live events

---

## 13. Dependencies & Risks

### Dependencies

| Dependency | Required For | Status |
|------------|-------------|--------|
| Composite PK migration | All phases | COMPLETE (Session 32) |
| 131-test suite | Regression safety | COMPLETE (Session 32) |
| Bridge v6 (16 sections) | Phase 1 denizen tracking | COMPLETE |
| Explorer 6-tab structure | Phases 3-4 UI integration | COMPLETE |
| Entity position extraction | Phase 3 position display | COMPLETE |
| UTM Win11 VM access | Phase 2 bridge deployment | Available (SSH + HTTP file server + SCP) |
| LLM with tool-use support | Phase 3 agentic storyteller | Available (Qwen3 32B, Claude API) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bridge deployment failures (VM offline) | MEDIUM | Phase 2 bridge changes can be tested locally with mock data; deploy via SCP to VM |
| TCP RPC broken for game-thread calls | HIGH | Use `dfhack-run` over SSH as primary transport; TCP RPC only for cached calls (GetVersion/GetWorldInfo) |
| NVS formula over-weights screen time (bias toward oldest dwarves) | LOW | Tune weights iteratively; add recency decay |
| Post-embark legends re-export unavailable (user can't/won't do it) | LOW | Synthetic HF fallback works automatically; user just gets less HF data |
| Synthetic HF data conflicts with later legends re-import | LOW | `ON CONFLICT DO UPDATE` replaces synthetic data with authoritative legends data; `embark` flag preserved |
| Knowledge Horizon too aggressive (hides useful data) | MEDIUM | Default to advisory (system prompt) not enforcement (SQL views) |
| LLM context overflow with rich denizen data | MEDIUM | Schema summary is static (~2K tokens); query results capped at 50 rows |
| Agentic LLM generates too many queries (latency) | MEDIUM | Max rounds cap (5); fallback to keyword mode; model-specific tuning |
| Agentic LLM writes invalid SQL | LOW | Read-only transaction rejects writes; keyword blocklist; 5s timeout |
| Live event IDs collide with legends event IDs | LOW | Gap of 10,000+ between max legends ID and first live ID |

---

## 14. File Inventory

### Existing Files (Modified by This PRD)

| File | Phases | Changes |
|------|--------|---------|
| `chronicler/db/schema.sql` | 1, 2, 4 | `fortress_denizens`, unit columns, `embark` on HFs, event columns, `knowledge_horizon` |
| `chronicler/dfhack/watcher.py` | 1, 2 | Denizen tracking, death detection, embark detection, event generator integration |
| `chronicler/dfhack/scripts/chronicler-bridge.lua` | 2 | Expanded unit fields, relationship extraction, denizen tracking section |
| `chronicler/storyteller/context.py` | 3 | Retained as fallback keyword-routing mode |
| `chronicler/storyteller/prompts.py` | 3 | Agentic system prompt, schema summary |
| `chronicler/api/templates/explorer.html` | 3, 4 | Fortress folk view, event timeline, events tab, horizon toggle |
| `chronicler/api/routes/people.py` | 3 | Denizen endpoint, unified person |
| `chronicler/api/routes/storyteller.py` | 3 | Agentic endpoint with SSE streaming |
| `chronicler/ingest/xml_parser.py` | 2 | `embark` column handling, re-import idempotency |
| `chronicler/cli.py` | 1 | `denizens` command |
| `chronicler/config.py` | 3 | `storyteller_mode` toggle |

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `chronicler/denizens.py` | 1 | Denizen registry management |
| `chronicler/synthetic.py` | 2 | Embark HF fallback generation (relationships from Unit data) |
| `chronicler/events.py` | 2 | Live event generator (state transitions → history_events) |
| `chronicler/storyteller/agent.py` | 3 | Agentic SQL tool-use loop |
| `chronicler/storyteller/person.py` | 3 | Unified person builder |
| `chronicler/api/routes/events.py` | 4 | Events API endpoints |
| `chronicler/horizon.py` | 4 | Knowledge Horizon computation |

### Reference Documents

| Document | Path | Relationship to PRD |
|----------|------|---------------------|
| Data Gap Analysis | `projects/chronicler/reports/data-gap-analysis-2026-02-22.md` | Exhaustive gap catalog (input) |
| Gap Closure Critical Review | `projects/chronicler/reports/gap-closure-critical-review.md` | Phase 0-4 execution (COMPLETE) |
| Knowledge Horizon Design | `projects/chronicler/designs/knowledge-horizon.md` | Phase 4+ architecture |
| Unit-HF Field Mapping | `projects/chronicler/designs/unit-hf-field-mapping.md` | Phase 3 merge strategy |
| Explorer UI Enhancements | `.claude/plans/rippling-honking-crescent.md` | Phases 1-7 COMPLETE, Phase 8 deferred |
| Explorer Redesign | `.claude/plans/shiny-churning-sprout.md` | Tab structure (COMPLETE) |
| Entity Position Extraction | `.claude/plans/sparkling-sauteeing-snowglobe.md` | Position data (COMPLETE) |
| Database Explorer | `.claude/plans/woolly-swinging-naur.md` | Schema/Data/Graph tabs (COMPLETE) |

### Reference Repositories (Benchmarking)

| Repository | Language | Key Features for Chronicler |
|-----------|----------|----------------------------|
| LegendsBrowser2 | Go + Vue.js | Custom streaming XML tokenizer, 100+ event types, collection summaries |
| LegendsViewer-Next | .NET 8 + Vue 3 | Leaflet.js maps, family trees, async XmlReader, fastest loader |
| df-narrator | Python | Figure/site/conflict scoring formulas, Markdown LLM output |
| weblegends | C++ (DFHack plugin) | 96 per-event HTML generators, context-aware circumstance/reason display |
| df-ai | C++ (DFHack plugin) | Event manager pattern, callback registration system |
| DwarfFortressLogger | C++ (Qt) | Real-time memory-mapped DF structure access |

---

*Chronicler PRD v2.2 — From Data Pipeline to Fortress Intelligence*
*Session 34, 2026-02-24*
*Synthesizes: gap-analysis, critical-review, knowledge-horizon, unit-hf-mapping, user G1/G2 feedback, 5 user corrections, 10 reference repo analyses, dfhack-run SSH transport discovery*
