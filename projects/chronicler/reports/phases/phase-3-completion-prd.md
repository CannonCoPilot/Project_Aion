# Phase 3: Live Integration — Completion PRD

**Version**: 3.0
**Date**: 2026-03-20
**Status**: Active — guides all remaining Phase 3 work
**Supersedes**: `phase-3-live-integration.md` v2.0 (2026-03-05) for planning purposes; that document remains as historical reference.
**Milestone**: M3 — Live Complete
**Estimated Remaining Duration**: 5-6 weeks (Stages 3.5 + 3.6 + 3.4)

**Parent Documents**:
- `full-project-roadmap.md` v4.0 (2026-03-19) — master roadmap
- `product-requirements.md` v2.0 — REQ-IDs and priorities

**Companion Documents**:
- `phase-3-memory-cdm-mapping.md` v3.0 — DF memory → CDM field mapping (df-structures 53.11-r1)
- `phase-3-etl-plan.md` — Three-layer ETL plan (worldgen, fortress, adventure)
- `lvn-comparison-and-enhancements.md` — LVN feature comparison (33 enhancements, Phase 3 subset)
- `lvn-feature-audit.md` — Full LVN feature catalog

**Requirements Covered**:
- REQ-ETL-005 through ETL-012 (bridge + worldgen) — COMPLETE
- REQ-ETL-017 through ETL-024 (fortress state capture) — Stage 3.5
- REQ-STR-033 through STR-040 (narrative data layer) — Stage 3.6
- REQ-EMB-001 through EMB-006 (embedding pipelines) — Stage 3.4
- REQ-KH-001 through KH-012 (Knowledge Horizon) — COMPLETE

---

## 1. Executive Summary

### 1.1 Phase 3 Goal (Revised)

Phase 3 extends Chronicler's real-time data capabilities across six dimensions:

1. **Bridge enhancements** with reactive events and richer extraction ✓ COMPLETE
2. **Worldgen monitoring** with live progress tracking ✓ COMPLETE
3. **Knowledge Horizon** masking system for plausible fortress knowledge ✓ COMPLETE
4. **Fortress state capture** — periodic snapshots, combat reports, announcements, character arcs, threat tracking (NEW: v4.0)
5. **Narrative data layer** — scored events, causal linking, arc detection, hierarchical summaries, context assembly (NEW: v4.0)
6. **Embedding pipelines** for batch and live data, hybrid semantic search, narrative context retrieval

The first three are complete. This document guides completion of the remaining three.

### 1.2 Entry/Exit State

| | Original (v2.0) | Actual Current State |
|---|---|---|
| **Bridge** | v7 (1,077 lines, 7 domains, polling only) | **v9** (1,907 lines, 17 domains, eventful subscriptions, death cause enrichment, family chain, personality, skill delta tracking) |
| **Worldgen** | No monitoring | **Complete**: worldgen-bridge.lua, Python ingester, dashboard, backfill from legends, World Timeline page, 3 CLI commands |
| **Knowledge Horizon** | No KH | **Complete**: 519-line engine, Phase 1-3 init, 6 CAV rules, 5 `visible_*` views, KH gate on 5 entity types, watcher event revelation, nav toggle, LLM system prompt |
| **Fortress State** | N/A (not in v2.0) | **Partial**: Bridge v9 extracts `fortress_state` section; no dedicated tables, no combat reports, no character arcs |
| **Narrative Data Layer** | N/A (not in v2.0) | **Not started**: 0 tables, 0 code |
| **Embeddings** | Schema only (`embeddings` table, 0 rows) | **Schema only**: table exists but missing `world_id`, no vector index, no extractors, no search |

**Target Exit State**: Bridge v9+ with fortress state capture (8 new tables populated), narrative data layer operational (7 tables + materialized view + context assembler), embedding pipelines active (full-corpus batch + live incremental), hybrid semantic search functional, narrative context assembly complete. Schema fully stabilized for Phase 4 storytelling pipeline.

### 1.3 Recommended Completion Order

**3.5 → 3.6 → 3.4** (not the original 3.4 → 3.5 → 3.6)

| Order | Stage | Rationale |
|-------|-------|-----------|
| **1st** | **3.5 Fortress State Capture** | Pure data plumbing — same skillset as 3.0-3.1. Bridge v9 already partially supports it. Creates the raw data that 3.6 needs for scoring, causal linking, and arc detection. No LLM dependency. |
| **2nd** | **3.6 Narrative Data Layer** | Processes 3.5 data into narrative structures. Some tasks need LLM (Qwen3 8B for summarization). Creates the processed structures that make embedding most valuable. |
| **3rd** | **3.4 Embedding Pipelines** | Embeds the **complete** corpus (legends + live + narrative) in one pass. Hybrid search covers all data types. Narrative context retrieval integrates with the 3.6 context assembler. The capstone bridging Phase 3 → Phase 4. |

**Why not 3.4 first?** Embedding only legends-era entities produces an incomplete corpus. After 3.5/3.6 add ~15 new data types (combat reports, character narratives, event summaries, arcs, clusters), the text extractors would need significant rework. Building embeddings last means one clean implementation pass.

---

## 2. Progress Dashboard

### Completed Stages

| Stage | Date | Key Deliverables | Session |
|-------|------|------------------|---------|
| **3.0: CDM Schema Fixes** | 2026-03-09 | 4 migrations (V1-V4), entity_entity_links (5,594 rows), entity_site_links (2,913 rows), supplementary columns, Python ripple fixes. Fresh ingestion: 1,684,920 records, 0% RI. | S39 |
| **3.1: Bridge Enhancements** | 2026-03-17 | Bridge v9 (1,907 lines), 5 eventful subscriptions, death cause enrichment, family chain, personality/soul (50 facets), skill delta tracking, 7 new CDM tables, 14 ETL functions, all verified end-to-end. | S40-42 |
| **3.2: Worldgen Monitoring** | 2026-03-20 | `worldgen-bridge.lua` (257 lines), Python snapshot ingester, worldgen dashboard, historical backfill from legends (post-parse step 12), World Timeline page, Year Detail drill-down, 3 CLI commands (`worldgen watch/backfill/history`). Deferred: worldgen live map preview → Phase 5 (depends on map rendering). | S43 |
| **3.3: Knowledge Horizon** | 2026-03-20 | KH engine (519 lines), `knowledge_horizon` table (709 entries for world 1), 6 `visible_*` views, Phase 1-3 initialization + CAV-001/002, event revelation via watcher, CLI commands (`kh init/stats/clear`), API endpoints, search KH filtering, detail page KH gate (5 types), nav toggle with localStorage, LLM system prompt (storyteller integration deferred to Phase 4). | S43 |

### Remaining Stages

| Stage | Status | Est. Duration | Dependencies |
|-------|--------|---------------|--------------|
| **3.5: Fortress State Capture** | NOT STARTED | 2 weeks | Bridge v9 (complete) |
| **3.6: Narrative Data Layer** | NOT STARTED | 2 weeks | Stage 3.5 (scored events need combat data) |
| **3.4: Embedding Pipelines** | NOT STARTED (schema only) | 1-2 weeks | Stages 3.5+3.6 (full corpus); MLX embed server (operational) |

### LVN Phase 3 Tasks (Disposition)

The v3.0 roadmap added tasks 3.1.7-3.1.10 to Stage 3.1, but these were not implemented when Stage 3.1 was marked complete. Disposition:

| Task | Description | Disposition | Rationale |
|------|-------------|-------------|-----------|
| 3.1.7 (LVN-P3-1) | Real-time event feed via WebSocket | **Move → Stage 3.5** | More valuable after fortress state capture provides richer events. Integrate with the fortress timeline (3.6.5). |
| 3.1.8 (LVN-P3-2) | "Dwarf of the Day" highlight | **Defer → Phase 5** | Dashboard visualization feature; requires character narrative profiles (3.6.6) to be interesting. |
| 3.1.9 (LVN-P3-3) | Live army tracking placeholder | **Move → Stage 3.5** | Natural fit alongside threat tracking (3.5.4). |
| 3.1.10 (LVN-MAP) | DFHack biome/terrain data extraction | **Defer → Phase 5** | Map layer data; bridge already has the Lua function. Phase 5 (Stage 5.1.8-5.1.9) is where it's consumed. |

---

## 3. Stage 3.5: Comprehensive Fortress State Capture

**Duration**: 2 weeks
**Requirements**: REQ-ETL-017 through REQ-ETL-024
**Dependencies**: Bridge v9 (complete), SSH transport (complete), CDM Phase 1 (complete)

### 3.5.0 Design Rationale

> Watching Girderspriced fall revealed that the story isn't just events — it's the *progression of state over time*. Population dwindling from 15→6→0, undead growing 43→45, the fortress sliding from functional to doomed. The CDM must capture periodic fortress state snapshots, combat reports at full resolution, and game announcements as narrative events, so the AI storytelling pipeline has the raw material to construct compelling narratives.

### 3.5.1 Existing Infrastructure to Leverage

Bridge v9 already extracts several data types that Stage 3.5 formalizes into dedicated tables:

| Bridge Section | Lines | Maps to Stage 3.5 Task |
|---------------|-------|----------------------|
| `fortress_state` | ~60 | 3.5.1 (fortress_state_snapshots) |
| `announcements` | ~40 | 3.5.3 (game_announcements) |
| `reactive_events.unit_deaths` | ~30 | 3.5.7 (death_narratives) |
| `incidents` (via etl_expanded.py) | ~150 | 3.5.7 (death_narratives — incident chain) |
| `dwarf_personality` | ~80 | 3.5.5 (character_arcs — personality snapshot) |
| `dwarf_skills` / `skill_changes` | ~60 | 3.5.5 (character_arcs — skill snapshot) |

**New Lua extraction needed**: combat reports (`df.global.world.status.reports`), hostile entity enumeration, environmental state, session boundary detection.

### 3.5.2 Schema Migrations

**Migration V5: Fortress State Capture Tables**

```sql
-- 3.5.1: Periodic fortress vital signs
CREATE TABLE IF NOT EXISTS fortress_state_snapshots (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    season          TEXT,
    population      INT,
    military_count  INT,
    food_stocks     INT,
    drink_stocks    INT,
    wealth          BIGINT,
    happiness_distribution JSONB,  -- {"ecstatic": 3, "happy": 5, "content": 4, "unhappy": 2, "miserable": 1}
    threats         JSONB,          -- [{"type": "undead", "count": 43}, {"type": "invader", "count": 5}]
    captured_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(world_id, tick)
);

-- 3.5.2: Blow-by-blow combat data
CREATE TABLE IF NOT EXISTS combat_reports (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    report_id       INT NOT NULL,
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    report_type     TEXT NOT NULL,   -- 'combat', 'sparring', 'hunting', 'other'
    attacker_unit_id INT,
    defender_unit_id INT,
    body_part       TEXT,
    attack_type     TEXT,            -- 'strike', 'bite', 'wrestle', 'shoot'
    weapon          TEXT,
    result_text     TEXT,
    raw_text        TEXT NOT NULL,
    UNIQUE(world_id, report_id)
);

-- 3.5.3: Game announcement narrative beats
CREATE TABLE IF NOT EXISTS game_announcements (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    category        TEXT NOT NULL,   -- 'combat', 'social', 'economic', 'environmental', 'death', 'migration', 'diplomacy'
    text            TEXT NOT NULL,
    related_unit_ids JSONB,          -- [42, 67, 103]
    related_site_id INT,
    UNIQUE(world_id, tick, text)     -- dedup identical announcements
);

-- 3.5.4: Hostile entity population over time
CREATE TABLE IF NOT EXISTS threat_tracking (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    tick            BIGINT NOT NULL,
    hostile_count   INT DEFAULT 0,
    undead_count    INT DEFAULT 0,
    invader_count   INT DEFAULT 0,
    megabeast_count INT DEFAULT 0,
    threat_details  JSONB,           -- [{"unit_id": 42, "race": "zombie", "pos": [10,20,3]}]
    UNIQUE(world_id, tick)
);

-- 3.5.5: Per-unit development tracking (delta-based)
CREATE TABLE IF NOT EXISTS character_arcs (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT NOT NULL,
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    stress_level    INT,
    happiness       TEXT,            -- derived category: ecstatic/happy/content/unhappy/miserable
    skill_snapshot  JSONB,           -- {"MINING": {"rating": 5, "xp": 1200}, ...}
    profession      TEXT,
    squad_id        INT,
    notable_events_since_last JSONB, -- ["promoted to militia commander", "mother died"]
    UNIQUE(world_id, unit_id, tick)
);

-- 3.5.6: Fortress environmental conditions
CREATE TABLE IF NOT EXISTS environmental_state (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    season          TEXT NOT NULL,
    temperature     INT,
    weather         TEXT,
    fortress_depth  INT,             -- z-levels dug
    features_discovered JSONB,       -- ["cavern_1", "magma_sea", "adamantine"]
    UNIQUE(world_id, tick)
);

-- 3.5.7: Enriched death records with full incident chain
CREATE TABLE IF NOT EXISTS death_narratives (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT NOT NULL,
    hf_id           INT,
    tick            BIGINT NOT NULL,
    year            INT NOT NULL,
    cause           TEXT NOT NULL,
    killer_unit_id  INT,
    killer_race     TEXT,
    weapon          TEXT,
    body_part       TEXT,
    combat_report_ids JSONB,         -- [101, 102, 103] — chain of combat reports leading to death
    witness_unit_ids  JSONB,         -- [42, 67] — units present at death
    location        TEXT,
    narrative_text  TEXT,             -- Pre-generated prose summary (populated by Stage 3.6)
    UNIQUE(world_id, unit_id, tick)
);

-- 3.5.8: Session boundary markers (chapter breaks)
CREATE TABLE IF NOT EXISTS session_markers (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    tick            BIGINT NOT NULL,
    event_type      TEXT NOT NULL,    -- 'save', 'load', 'pause', 'unpause', 'season_change', 'year_change'
    fortress_state_at_marker JSONB,   -- snapshot of key metrics at this moment
    UNIQUE(world_id, tick, event_type)
);

-- Indexes for temporal queries
CREATE INDEX IF NOT EXISTS idx_fss_world_tick ON fortress_state_snapshots(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_combat_world_tick ON combat_reports(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_announce_world_tick ON game_announcements(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_announce_category ON game_announcements(world_id, category);
CREATE INDEX IF NOT EXISTS idx_threat_world_tick ON threat_tracking(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_arcs_world_unit ON character_arcs(world_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_arcs_world_tick ON character_arcs(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_env_world_tick ON environmental_state(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_death_narr_world ON death_narratives(world_id, year);
CREATE INDEX IF NOT EXISTS idx_session_world_tick ON session_markers(world_id, tick);
```

### 3.5.3 Task Breakdown

| Task | REQ | Description | Deliverable | Depends On |
|------|-----|-------------|-------------|------------|
| **3.5.1** | ETL-017 | **Fortress state snapshots** — Extend watcher to capture fortress vital signs every 200 ticks. Promote existing bridge `fortress_state` section into the new `fortress_state_snapshots` table. Add happiness distribution histogram computation and threat summary JSONB. | `watcher.py` extension + `etl_expanded.py` function | Bridge v9 (done) |
| **3.5.2** | ETL-018 | **Combat report ingestion** — New Lua function `get_combat_reports()` reading `df.global.world.status.reports`. Parse attacker/defender/weapon/bodypart/result from report text. Python ingester promotes to `combat_reports` table. Sampling: capture all during active combat (threat_tracking.hostile_count > 0), sample 1-in-10 during peace. | New Lua function + Python ingester | — |
| **3.5.3** | ETL-019 | **Game announcement parsing** — Promote existing bridge `announcements` section into `game_announcements` table. Add category classification via keyword matching (combat: "strikes", "bites"; death: "has died", "has been struck down"; migration: "arrived", "petition"; social: "elected", "mandate"; economic: "crafted", "trade"; diplomacy: "diplomat", "caravan"). Extract related unit IDs from announcement text via name matching. | `etl_expanded.py` function + keyword classifier | — |
| **3.5.4** | ETL-020 | **Hostile entity tracking** — New Lua function `get_hostile_entities()` enumerating all units with `flags1.active_invader` or `flags1.marauder` or `undead` race flag. Capture count by category (undead, invader, megabeast, wildlife). Write periodic snapshots to `threat_tracking`. Integrate with existing bridge army tracking. Include **LVN-P3-3 (live army tracking)**: push alert to WebSocket on hostile count increase > threshold. | Lua function + Python ingester + alert | — |
| **3.5.5** | ETL-021 | **Character development tracking** — Extend watcher to capture per-unit snapshots into `character_arcs` every 500 ticks. Delta detection: only write when meaningful change (skill rating up, stress change > 5000, profession change, squad change, notable event occurred). Build from existing `dwarf_skills`/`dwarf_personality`/`skill_changes` bridge sections. | Watcher extension + delta engine | — |
| **3.5.6** | ETL-022 | **Environmental state capture** — New Lua function reading `df.global.cur_season`, temperature from `df.global.weather`, fortress depth from z-level extent, discovered features from map data. Write periodic snapshots to `environmental_state` on season transitions. | Lua function + Python ingester | — |
| **3.5.7** | ETL-023 | **Death circumstance enrichment** — Upgrade existing death cause enrichment in `reactive_events` handler. For each death: (1) find all `combat_reports` involving the unit in the 200 ticks before death, (2) identify killer from final combat report, (3) find witness units from same combat reports, (4) assemble the full incident chain. Write to `death_narratives`. Cross-reference: existing `incidents` data from bridge (etl_expanded.py). | Incident chain resolver + death_narratives writer | 3.5.2 (combat reports) |
| **3.5.8** | ETL-024 | **Session boundary markers** — Hook `dfhack.onStateChange` for SAVE, LOAD, PAUSE, UNPAUSE events. Also detect season_change and year_change from `game_time` comparisons between watcher cycles. For each boundary, snapshot current fortress state and write to `session_markers`. | Lua state hook + Python marker writer | 3.5.1 (fortress state) |
| **3.5.9** | LVN-P3-1 | **Real-time event feed** — WebSocket (or SSE) endpoint pushing rendered events to the frontend as they occur. Source: watcher change detection + reactive events. Render via existing `PerspectiveRenderer`. Frontend: scrolling event feed panel (sidebar or dashboard widget). | WebSocket endpoint + frontend component | 3.5.1-3.5.7 (richer events) |

### 3.5.4 Validation Criteria

- [ ] `fortress_state_snapshots` populated with ≥ 50 entries for active fortress
- [ ] `combat_reports` captures blow-by-blow combat during siege/combat encounter
- [ ] `game_announcements` captures and categorizes ≥ 5 announcement types
- [ ] `threat_tracking` records hostile entity counts accurately (verify against `dfhack-run lua 'print(#df.global.world.units.active)'` filtered)
- [ ] `character_arcs` shows delta detection working (no duplicate snapshots when nothing changed)
- [ ] `death_narratives` links combat_report_ids to actual combat_reports rows
- [ ] `session_markers` detects season_change transitions
- [ ] Event feed pushes rendered event text to WebSocket client within 5s of game event

---

## 4. Stage 3.6: Narrative Data Layer

**Duration**: 2 weeks
**Requirements**: REQ-STR-033 through REQ-STR-040
**Dependencies**: Stage 3.5 (needs combat reports, state snapshots, character arcs for scoring and arc detection)

### 4.0 Design Rationale

> A Qwen3 32B model has a ~128K token context window. A fortress like Girderspriced generates thousands of events. Raw data dumps overwhelm the LLM. The narrative data layer pre-processes CDM data into structures optimized for LLM consumption: scored events with drama ratings, detected story arcs, hierarchical summaries at multiple granularities, causal chains showing how one event leads to another, and character profiles with personality-driven narrative voice. This is the bridge between "database of facts" and "material for storytelling."

### 4.1 LLM Infrastructure

Several tasks require local LLM inference. Specification:

| Component | Model | Access | Purpose |
|-----------|-------|--------|---------|
| **Event summarization** | Qwen3 8B | Ollama direct (localhost:11434) | Fast summaries at year/season/arc granularity |
| **Arc title generation** | Qwen3 8B | Ollama direct | Short descriptive titles for detected arcs |
| **Cluster naming** | Qwen3 8B | Ollama direct | Short titles for event clusters |
| **Character profiles** | Qwen3 8B | Ollama direct | Role descriptions and arc summaries |
| **Embedding** | Qwen3-Embedding-4B | MLX server (localhost:8000) | Used in Stage 3.4, not 3.6 |

**Key rule**: All LLM calls use `think: false` at payload root (not inside `options`; see MEMORY.md Ollama gotcha). Use Ollama direct (not LiteLLM proxy) for latency-sensitive batch work.

**Batch processing pattern**: Generate narrative structures during low-activity periods or on-demand via CLI. Cache aggressively. Re-generate only when underlying data changes beyond a threshold.

### 4.2 Schema Migrations

**Migration V6: Narrative Data Layer Tables**

```sql
-- 3.6.1: Events enriched with narrative metadata
CREATE TABLE IF NOT EXISTS narrative_events (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    event_id        INT NOT NULL,      -- FK to history_events.id
    narrative_weight FLOAT DEFAULT 0,   -- 0-100, overall storytelling importance
    drama_score     FLOAT DEFAULT 0,    -- 0-100, dramatic intensity
    irony_flags     JSONB,              -- {"necromancer_killed_by_undead": true, ...}
    emotional_tone  TEXT,               -- tragic, heroic, ironic, peaceful, ominous, triumphant
    UNIQUE(world_id, event_id)
);

-- 3.6.2: Cause → effect relationships between events
CREATE TABLE IF NOT EXISTS event_causal_links (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    cause_event_id  INT NOT NULL,
    effect_event_id INT NOT NULL,
    link_type       TEXT NOT NULL,      -- military_weakened, cascading_death, invasion_triggered, economic_collapse, social_cascade
    confidence      FLOAT DEFAULT 0.5,  -- 0-1
    UNIQUE(world_id, cause_event_id, effect_event_id)
);

-- 3.6.3: Detected story threads
CREATE TABLE IF NOT EXISTS narrative_arcs (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    arc_type        TEXT NOT NULL,      -- siege_defense, tantrum_spiral, rise_and_fall, last_stand, golden_age, founding_days, trade_prosperity, plague, megabeast_attack, succession_crisis, artifact_quest
    title           TEXT,               -- LLM-generated descriptive title
    start_tick      BIGINT NOT NULL,
    end_tick        BIGINT,
    key_events      JSONB NOT NULL,     -- [event_id, event_id, ...]
    characters      JSONB,              -- [{"hf_id": 42, "role": "protagonist"}, ...]
    resolution      TEXT,               -- "fortress_survived", "total_collapse", "pyrrhic_victory", "ongoing"
    dramatic_weight FLOAT DEFAULT 0
);

-- 3.6.4: Pre-computed text summaries at multiple granularities
CREATE TABLE IF NOT EXISTS event_summaries (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    scope           TEXT NOT NULL,      -- 'world', 'fortress', 'character', 'arc'
    scope_id        INT,                -- world_id, fortress_site_id, hf_id, or arc_id
    granularity     TEXT NOT NULL,      -- 'year', 'season', 'arc', 'chapter'
    summary_text    TEXT NOT NULL,
    key_events      JSONB,              -- [event_id, ...] that the summary covers
    generated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(world_id, scope, scope_id, granularity)
);

-- 3.6.5: Unified chronological stream (materialized view)
-- Defined as a VIEW here; materialized in implementation for performance
-- Joins: history_events + fortress_state_snapshots + combat_reports + game_announcements
-- Queryable by time range and minimum narrative weight

-- 3.6.6: Pre-computed character profiles for key figures
CREATE TABLE IF NOT EXISTS character_narratives (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    unit_id         INT,
    hf_id           INT,
    character_name  TEXT NOT NULL,
    role_description TEXT,              -- "expedition leader and secret necromancer"
    arc_summary     TEXT,               -- Key life events in prose
    key_moments     JSONB,              -- [{"tick": 100, "event": "promoted to militia commander"}, ...]
    personality_voice TEXT,             -- Writing style notes derived from 50 personality facets
    ironic_dimensions JSONB,           -- {"necromancer_killed_by_undead": true}
    generated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(world_id, COALESCE(unit_id, -1), COALESCE(hf_id, -1))
);

-- 3.6.8: Temporally grouped related events
CREATE TABLE IF NOT EXISTS event_clusters (
    id              SERIAL PRIMARY KEY,
    world_id        INT NOT NULL REFERENCES worlds(id),
    cluster_type    TEXT NOT NULL,      -- 'siege', 'caravan', 'tantrum', 'construction', 'combat_encounter'
    start_tick      BIGINT NOT NULL,
    end_tick        BIGINT NOT NULL,
    event_ids       JSONB NOT NULL,     -- [event_id, ...]
    summary         TEXT,               -- LLM-generated cluster title
    UNIQUE(world_id, cluster_type, start_tick)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_narr_events_world ON narrative_events(world_id, narrative_weight DESC);
CREATE INDEX IF NOT EXISTS idx_causal_cause ON event_causal_links(world_id, cause_event_id);
CREATE INDEX IF NOT EXISTS idx_causal_effect ON event_causal_links(world_id, effect_event_id);
CREATE INDEX IF NOT EXISTS idx_arcs_world_type ON narrative_arcs(world_id, arc_type);
CREATE INDEX IF NOT EXISTS idx_summaries_scope ON event_summaries(world_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_char_narr_world ON character_narratives(world_id);
CREATE INDEX IF NOT EXISTS idx_clusters_world ON event_clusters(world_id, start_tick);
```

### 4.3 Task Breakdown

| Task | REQ | Description | Deliverable | LLM? | Depends On |
|------|-----|-------------|-------------|------|------------|
| **3.6.1** | STR-033 | **Narrative event scoring** — Score every `history_events` row by narrative importance. Formula: `base_weight[event_type] × character_importance × rarity_multiplier × irony_bonus`. Base weights: death=80, battle=70, artifact_created=50, site_taken=60, skill_up=5, etc. Character importance from `prominence_score`. Rarity: events unique to one entity score higher. Irony detection: necromancer+undead death, legendary+mundane death, diplomat+murder. Emotional tone: rule-based classifier from event type + outcome. | Scoring engine + `narrative_events` population | No | Stage 3.5 (for fortress events) |
| **3.6.2** | STR-034 | **Causal event linking** — Detect cause→effect chains via temporal proximity + logical rules. Rules: (a) military death within 200 ticks of next death = cascading_death, (b) invasion event within 500 ticks before combat deaths = invasion_triggered, (c) food/drink depletion before starvation death = economic_collapse, (d) death of important figure before tantrum/unhappiness spike = social_cascade, (e) military weakening (deaths > 30% of squad) before next invasion = military_weakened. | Causal chain detector + `event_causal_links` | No | 3.6.1 (needs scored events) |
| **3.6.3** | STR-035 | **Narrative arc detection** — Cluster events by type + temporal proximity + character overlap into arcs. Algorithm: sliding window over timeline, group events sharing entity references or causal links, classify by dominant event types. Arc types: siege_defense (combat events + threat tracking spike), tantrum_spiral (unhappiness + violence), last_stand (population decline + combat), golden_age (wealth growth + low threats), founding_days (first N years). Set resolution based on outcome. | Arc detection engine + `narrative_arcs` | No (titles via LLM: 3.6.3b) | 3.6.2 (needs causal links) |
| **3.6.3b** | STR-035 | **Arc title generation** — For each detected arc, generate a short descriptive title via Qwen3 8B. Input: arc type, key events summary, character names, resolution. Output: 5-10 word title (e.g., "The Undead Siege of Winter 251"). | LLM title generator | **Yes** (Qwen3 8B) | 3.6.3 |
| **3.6.4** | STR-036 | **Hierarchical event summarization** — Pre-compute text summaries at year, season, arc, and chapter granularity. Feed top-N scored events per scope to Qwen3 8B with a summarization prompt. Year summaries: top 20 events. Season summaries: top 10. Arc summaries: all key events. Character summaries: all events involving that character. Implement cache invalidation: re-generate when new events exceed 10% of existing for that scope. | Summary generator + `event_summaries` | **Yes** (Qwen3 8B) | 3.6.1 (scored events) |
| **3.6.5** | STR-037 | **Fortress timeline materialized view** — `CREATE MATERIALIZED VIEW fortress_timeline AS ...` joining history_events (with narrative_weight from narrative_events), fortress_state_snapshots, combat_reports, game_announcements into a unified chronological stream. Columns: world_id, tick, year, season, entry_type (event/snapshot/combat/announcement), entry_id, narrative_weight, summary_text, entity_refs JSONB. API endpoint: `GET /api/fortress/timeline?world_id={wid}&start_tick={t1}&end_tick={t2}&min_weight={w}`. | Materialized view + refresh trigger + API | No | 3.5 tables + 3.6.1 |
| **3.6.6** | STR-038 | **Character narrative profiles** — For each fortress citizen (and historically important HFs), generate: role_description (from profession + positions), arc_summary (key life events in prose), personality_voice (writing style derived from 50 personality facets — e.g., high ANXIETY + high CREATIVITY → "anxious, detail-obsessed, finds beauty in chaos"). Regenerate on death, promotion, combat, artifact creation. | Character profile generator + `character_narratives` | **Yes** (Qwen3 8B) | Stage 3.5.5 (character arcs) |
| **3.6.7** | STR-039 | **Narrative context assembler** — Python module `narrative_context.py` that, given a query type and parameters, assembles an optimal LLM context within a token budget. Query types: `fortress_saga` (arc + state + characters), `character_bio` (character profile + events + arcs), `battle_account` (combat reports + deaths + timeline), `current_situation` (latest state + threats + recent events). Assembly priority: query-specific structured facts first, then supporting context by narrative_weight, then background from event_summaries. **Integration point**: This module will call the embedding search (Stage 3.4) for semantic augmentation once available. Initially operates SQL-only. | `chronicler/storyteller/narrative_context.py` | No | 3.6.1-3.6.6 (all narrative tables) |
| **3.6.8** | STR-040 | **Event clustering** — Group events within 500 ticks sharing entity references or causal links into clusters. Classify by dominant event types: siege (combat+death+threat), caravan (trade+diplomacy), tantrum (unhappiness+violence), construction (building+crafting), combat_encounter (combat reports from same fight). Generate cluster summary title via LLM. | Clustering algorithm + `event_clusters` | **Yes** (Qwen3 8B, titles only) | 3.6.2 (causal links) |

### 4.4 CLI Commands

```
chronicler narrative score [--world-id N] [--force]     # Run narrative event scoring
chronicler narrative arcs [--world-id N]                 # Detect and display narrative arcs
chronicler narrative summarize [--world-id N] [--scope]  # Generate hierarchical summaries
chronicler narrative profiles [--world-id N]             # Generate character profiles
chronicler narrative timeline [--world-id N] [--year Y]  # Display fortress timeline
chronicler narrative status [--world-id N]               # Show narrative data layer stats
```

### 4.5 Validation Criteria

- [ ] `narrative_events` covers ≥ 95% of `history_events` rows with non-zero scores
- [ ] Irony detection fires for at least 1 known ironic event (verify manually)
- [ ] `event_causal_links` detects cascading deaths during siege sequences
- [ ] `narrative_arcs` detects siege_defense arc during invasion period
- [ ] `event_summaries` generates readable year-level summaries (spot-check 3 years)
- [ ] `fortress_timeline` materialized view returns ordered entries for a time range
- [ ] `character_narratives` produces distinct personality voices for 2+ characters with different facets
- [ ] Narrative context assembler produces ≤ 32K tokens for a fortress_saga query
- [ ] `event_clusters` groups temporally adjacent combat events into single clusters
- [ ] `chronicler narrative status` shows non-zero counts for all narrative tables

---

## 5. Stage 3.4: Embedding Pipelines (Revised)

**Duration**: 1-2 weeks
**Requirements**: REQ-EMB-001 through REQ-EMB-006
**Dependencies**: Stages 3.5 + 3.6 (full corpus), MLX embed server (operational at localhost:8000)

### 5.0 Design Rationale

Embedding the full corpus — legends entities, live fortress data, AND narrative structures — in a single implementation pass produces the most complete and useful semantic search index. The embedding pipeline is the capstone of Phase 3: it bridges the structured CDM data layer to Phase 4's AI storytelling pipeline by enabling conceptual queries ("most powerful necromancer", "battles near the mountain", "fortress under siege") that augment SQL-retrieved structured context.

### 5.1 Schema Fix: Embeddings Table Migration

**Current `embeddings` table (schema.sql:653) has gaps**:

| Issue | Fix |
|-------|-----|
| Missing `world_id` | Add `world_id INT NOT NULL REFERENCES worlds(id)` — every other CDM table has it |
| No UNIQUE constraint | Add `UNIQUE(world_id, entity_type, entity_id, chunk_index)` |
| No content_hash index | Add `CREATE UNIQUE INDEX idx_embed_hash ON embeddings(content_hash)` for dedup |
| No vector similarity index | Add `CREATE INDEX idx_embed_vector ON embeddings USING hnsw (embedding vector_cosine_ops)` |

**Migration V7: Embeddings Schema Fix**

```sql
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS world_id INT;
-- Backfill world_id for any existing rows (there are none currently)
ALTER TABLE embeddings ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE embeddings ADD CONSTRAINT fk_embed_world FOREIGN KEY (world_id) REFERENCES worlds(id);
ALTER TABLE embeddings ADD CONSTRAINT uq_embed_entity UNIQUE (world_id, entity_type, entity_id, chunk_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embed_hash ON embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_embed_vector ON embeddings USING hnsw (embedding vector_cosine_ops);
```

### 5.2 Entity Types for Embedding

The text extractor must cover ALL embeddable entity types:

| Entity Type | Source Table | Text Content | Est. Count (Tar Thran) |
|-------------|-------------|--------------|----------------------|
| `historical_figure` | `historical_figures` | Name, race, caste, spheres, kills, positions, key events | ~1,800 |
| `entity` | `entities` | Name, type, race, sites, wars, positions | ~40 |
| `site` | `sites` | Name, type, region, structures, owners, events | ~150 |
| `artifact` | `artifacts` | Name, type, material, holder, creator, description | ~200 |
| `region` | `regions` | Name, type, evilness, sites | ~100 |
| `written_content` | `written_content` | Title, author, form, references | ~100 |
| `event_collection` | `event_collections` | Type, participants, outcome, event count | ~500 |
| `world_construction` | `world_constructions` | Name, type, coordinates | ~50 |
| `character_narrative` | `character_narratives` | Role description, arc summary, key moments | ~15 (fortress) |
| `event_summary` | `event_summaries` | Summary text (year/season/arc level) | ~250+ |
| `narrative_arc` | `narrative_arcs` | Title, type, key events, characters, resolution | ~10-30 |
| `event_cluster` | `event_clusters` | Summary, type, event list | ~50-100 |
| **Total** | | | **~3,300+** |

### 5.3 Task Breakdown

| Task | REQ | Description | Deliverable | Depends On |
|------|-----|-------------|-------------|------------|
| **3.4.0** | — | **Schema migration V7** — Fix embeddings table (add world_id, UNIQUE constraint, content_hash index, HNSW vector index). | SQL migration | — |
| **3.4.1** | EMB-001 | **Entity text extractors** — Build `chronicler/embed/extractors.py` with per-type text extraction functions. Each extractor queries the CDM for all relevant fields, concatenates into an embeddable text representation. Include extractors for all 12 entity types listed above. | Extractor module | 3.6 (narrative tables) |
| **3.4.2** | EMB-002 | **Chunking strategy** — Split entity text into embedding-sized chunks (512 tokens max, 64-token overlap). SHA-256 content_hash per chunk. Most entities produce 1 chunk; long site histories or HF biographies may produce 2-3. Skip re-embedding if content_hash matches existing row. | Chunker class | 3.4.1 |
| **3.4.3** | EMB-003 | **Batch embedding CLI** — `chronicler embed [--world-id N] [--entity-types TYPE,...] [--force] [--batch-size 32]`. Calls MLX embed server at `localhost:8000/embed` with batched requests. Target: full world (~3,300 entities) in < 5 minutes. Progress bar. Resume capability (skip already-embedded chunks by content_hash). | CLI command | 3.4.1, 3.4.2 |
| **3.4.4** | EMB-004 | **Incremental live embedding** — Extend watcher to detect entity changes via content_hash comparison. Re-embed only entities whose extracted text has changed. Trigger: watcher cycle detects unit_events or bridge data changes → mark affected entities for re-embedding → batch re-embed at end of cycle. | Watcher extension | 3.4.1, 3.4.2 |
| **3.4.5** | EMB-004 | **Reactive event embedding** — Immediately embed high-priority events: deaths (death_narratives), invasions (game_announcements category=combat), new arcs (narrative_arcs). Bypass the regular batch cycle. | Reactive embed handler | 3.4.4 |
| **3.4.6** | EMB-005 | **Hybrid semantic search** — Augment global search with pgvector cosine similarity alongside existing ILIKE text search. Implement Reciprocal Rank Fusion (RRF) to merge text and semantic result sets: `RRF_score = Σ 1/(k + rank_i)` with k=60. New API endpoint: `GET /api/search/semantic?q=TEXT&types=TYPE,...&limit=N`. Frontend: toggle "Semantic search" in search bar. | Search upgrade + API + UI toggle | 3.4.3 (populated embeddings) |
| **3.4.7** | EMB-006 | **Semantic context augmentation for narrative assembler** — Extend the narrative context assembler (3.6.7) to query embeddings for semantically relevant entities beyond what SQL retrieves. For a "fortress_saga" query, embed the query text and find similar character_narratives, event_summaries, and narrative_arcs. Append to the assembled context within token budget. | Extension to `narrative_context.py` | 3.6.7, 3.4.3 |

### 5.4 Embedding Infrastructure

| Component | Details |
|-----------|---------|
| **Model** | Qwen3-Embedding-4B via MLX |
| **Server** | `localhost:8000/embed` (tmux window `MLX-Embed`) |
| **Dimension** | 2560 |
| **Distance** | Cosine similarity |
| **Index** | HNSW (pgvector) |
| **Batch size** | 32 texts per request (tunable) |
| **Token limit** | 512 tokens per chunk, 64-token overlap |

### 5.5 Validation Criteria

- [ ] `embeddings` table has `world_id`, UNIQUE constraint, HNSW index
- [ ] `chronicler embed` populates all 12 entity types
- [ ] Content-hash dedup prevents redundant re-embedding on re-run
- [ ] `chronicler embed --force` re-embeds everything
- [ ] Hybrid search returns relevant results for "necromancer" (HFs with necromancer flags)
- [ ] Hybrid search returns relevant results for "siege" (event clusters, narrative arcs)
- [ ] RRF scoring produces better results than ILIKE or semantic alone (manual spot-check)
- [ ] Narrative context assembler uses semantic search to augment SQL-only retrieval
- [ ] Incremental embedding detects and re-embeds changed entities after watcher cycle
- [ ] Full embed completes in < 5 minutes for Tar Thran world

---

## 6. Phase 3 Definition of Done

### Core Requirements (ALL must pass)

| # | Check | Stage |
|---|-------|-------|
| 1 | Bridge v9+ with eventful subscriptions, death cause enrichment, family chain, personality, skill delta — all operational | 3.1 ✓ |
| 2 | Worldgen monitoring: bridge + ingester + dashboard + CLI commands | 3.2 ✓ |
| 3 | Knowledge Horizon: engine + 6 CAV rules + visible_* views + KH gate + nav toggle + watcher revelation | 3.3 ✓ |
| 4 | Fortress state snapshots: ≥ 50 entries populated during active play | 3.5 |
| 5 | Combat reports: blow-by-blow capture during combat encounters | 3.5 |
| 6 | Game announcements: captured and categorized (≥ 5 categories) | 3.5 |
| 7 | Threat tracking: hostile entity counts over time | 3.5 |
| 8 | Character arcs: delta-based snapshots for fortress citizens | 3.5 |
| 9 | Death narratives: enriched with incident chain + combat report refs | 3.5 |
| 10 | Session markers: season transitions detected | 3.5 |
| 11 | Real-time event feed: WebSocket push of rendered events | 3.5 |
| 12 | Narrative event scoring: ≥ 95% coverage with non-zero scores | 3.6 |
| 13 | Causal event linking: cascading death chains detected | 3.6 |
| 14 | Narrative arcs: siege_defense arc detected during invasion | 3.6 |
| 15 | Event summaries: year-level summaries readable (spot-check 3) | 3.6 |
| 16 | Fortress timeline: materialized view queryable by time range | 3.6 |
| 17 | Character narratives: distinct personality voices for different facets | 3.6 |
| 18 | Narrative context assembler: ≤ 32K tokens for fortress_saga query | 3.6 |
| 19 | Event clusters: temporally adjacent combat events grouped | 3.6 |
| 20 | Embeddings schema: world_id + UNIQUE + HNSW index | 3.4 |
| 21 | Batch embedding: all 12 entity types, < 5 min for Tar Thran | 3.4 |
| 22 | Content-hash dedup: no redundant re-embedding on re-run | 3.4 |
| 23 | Hybrid semantic search: RRF results better than ILIKE alone | 3.4 |
| 24 | Narrative context uses semantic augmentation | 3.4 |
| 25 | Incremental embedding: watcher triggers re-embed on change | 3.4 |
| 26 | All CLI commands functional: `embed`, `narrative score/arcs/summarize/profiles/timeline/status` | 3.4+3.6 |
| 27 | DB schema stabilized — no further table additions expected before Phase 4 | All |

### Deferred Items (NOT required for Phase 3 DoD)

| Item | Deferred To | Rationale |
|------|-------------|-----------|
| KH-storyteller integration (REQ-STR-032) | Phase 4 Stage 4.3 | Needs agentic storyteller |
| Worldgen live map preview (3.2.4) | Phase 5 Stage 5.1 | Needs map rendering infrastructure |
| "Dwarf of the Day" (LVN-P3-2) | Phase 5 | Dashboard visualization |
| DFHack biome data for map (LVN-MAP) | Phase 5 Stage 5.1 | Map layer data |
| Environmental state: weather + temperature | Phase 5 | Low priority (REQ-ETL-022 is P3) |
| death_narratives.narrative_text pre-generation | Phase 4 | Needs storyteller pipeline |

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Combat reports parsing complexity**: `df.global.world.status.reports` may have undocumented structure | High | Medium | Start with raw text capture; parse structured fields iteratively. Consult df-structures repo. |
| **LLM quality for summaries/profiles**: Qwen3 8B may produce low-quality narrative text | Medium | Medium | Start with template-based generation; upgrade to LLM only where templates are insufficient. Quality checkpoint after 3.6.4. |
| **Embedding throughput**: MLX server may bottleneck on batch embedding | Medium | Low | Already benchmarked at 5-15x Ollama throughput. Batch size tunable. |
| **HNSW index build time**: pgvector HNSW can be slow for initial index creation | Low | Low | ~3K vectors at 2560-dim is small. Use ivfflat if HNSW proves too slow. |
| **Narrative arc detection accuracy**: Rule-based detection may miss subtle arcs or produce false positives | Medium | Medium | Start with high-confidence arc types (siege, founding). Iterate. Human spot-check. |
| **Schema migration on live data**: V5-V7 migrations run against active fortress DB | Low | Low | All CREATE TABLE (not ALTER); no existing data at risk. |
| **Context window overflow**: Narrative context assembler may exceed token budget for complex queries | Medium | Low | Hard token budget with priority-based truncation. Test with largest known fortress. |

---

## 8. Architecture After Phase 3

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Chronicler Architecture                      │
│                         (Post-Phase 3)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DF Game ──► Bridge v9 ──► Watcher ──► CDM Tables (40+)           │
│     │           │              │            │                       │
│     │     17 sections    change detect   ┌──┴──────────────┐       │
│     │           │              │         │  Phase 1-2 Core  │       │
│     │           │              │         │  (legends, HFs,  │       │
│     │           │              │         │   sites, events) │       │
│     │           │              │         └──────────────────┘       │
│     │           │              │                                    │
│     │           │              ▼                                    │
│     │           │    ┌─── Phase 3 NEW ───────────────────┐         │
│     │           │    │                                    │         │
│     │           │    │  Stage 3.5: State Capture          │         │
│     │           │    │  ├─ fortress_state_snapshots       │         │
│     │           │    │  ├─ combat_reports                 │         │
│     │           │    │  ├─ game_announcements             │         │
│     │           │    │  ├─ threat_tracking                │         │
│     │           │    │  ├─ character_arcs                 │         │
│     │           │    │  ├─ death_narratives               │         │
│     │           │    │  └─ session_markers                │         │
│     │           │    │                                    │         │
│     │           │    │  Stage 3.6: Narrative Layer        │         │
│     │           │    │  ├─ narrative_events (scored)      │         │
│     │           │    │  ├─ event_causal_links             │         │
│     │           │    │  ├─ narrative_arcs                 │         │
│     │           │    │  ├─ event_summaries (LLM)          │         │
│     │           │    │  ├─ fortress_timeline (mat. view)  │         │
│     │           │    │  ├─ character_narratives (LLM)     │         │
│     │           │    │  └─ event_clusters                 │         │
│     │           │    │                                    │         │
│     │           │    │  Stage 3.4: Embedding Layer        │         │
│     │           │    │  ├─ embeddings (pgvector 2560)     │         │
│     │           │    │  ├─ hybrid search (ILIKE+RRF)      │         │
│     │           │    │  └─ narrative context assembler    │         │
│     │           │    │       (SQL + semantic)             │         │
│     │           │    └────────────────────────────────────┘         │
│     │           │                                                   │
│     │    ┌──────┴──────┐                                           │
│     │    │ Knowledge   │     ┌──────────────────────────┐          │
│     │    │ Horizon     │────►│  Explorer UI + KH Gate   │          │
│     │    │ (5 views)   │     └──────────────────────────┘          │
│     │    └─────────────┘                                           │
│     │                              ▼                                │
│     │                    ┌─────────────────────┐                   │
│     │                    │   Phase 4 Ready:     │                  │
│     │                    │   AI Storytelling    │                  │
│     │                    │   Pipeline           │                  │
│     │                    │   (narrative context  │                  │
│     │                    │    assembler feeds    │                  │
│     │                    │    Qwen3 32B /        │                  │
│     │                    │    Claude)            │                  │
│     │                    └─────────────────────┘                   │
│     │                                                               │
└─────┴───────────────────────────────────────────────────────────────┘
```

---

## 9. Table Summary (New in Phase 3 Remaining)

| Table | Stage | Rows (Est.) | Purpose |
|-------|-------|-------------|---------|
| `fortress_state_snapshots` | 3.5 | 50-500/session | Vital signs over time |
| `combat_reports` | 3.5 | 100-10K/session | Blow-by-blow combat |
| `game_announcements` | 3.5 | 50-500/session | Narrative event beats |
| `threat_tracking` | 3.5 | 50-500/session | Hostile population curves |
| `character_arcs` | 3.5 | 200-2K/session | Per-unit development |
| `environmental_state` | 3.5 | 10-40/session | Season/depth/weather |
| `death_narratives` | 3.5 | 5-50/session | Enriched death records |
| `session_markers` | 3.5 | 10-100/session | Chapter boundaries |
| `narrative_events` | 3.6 | ~436K (all history_events) | Scored events |
| `event_causal_links` | 3.6 | ~5K-50K | Cause→effect chains |
| `narrative_arcs` | 3.6 | 10-100 | Detected story threads |
| `event_summaries` | 3.6 | 250-1K | Hierarchical summaries |
| `fortress_timeline` | 3.6 | (materialized view) | Unified timeline |
| `character_narratives` | 3.6 | 15-100 | Character profiles |
| `event_clusters` | 3.6 | 50-500 | Grouped events |
| `embeddings` (enhanced) | 3.4 | ~3,300+ | Full corpus vectors |

**Total new tables**: 15 (+ 1 materialized view + 1 enhanced existing table)

---

## 10. Companion Document Updates Required

After Phase 3 completion, update:

| Document | Update Needed |
|----------|---------------|
| `full-project-roadmap.md` | Mark Stages 3.5, 3.6, 3.4 COMPLETE with dates |
| `product-requirements.md` | Mark REQ-ETL-017-024, REQ-STR-033-040, REQ-EMB-001-006 as implemented |
| `phase-3-live-integration.md` | Add completion notes cross-referencing this document |
| `planning-history.md` | Add v3.0 Completion PRD entry |
| `current-plans.md` | Update Phase 3 status and move to Phase 4 |
| `session-state.md` | Update current phase/stage |
