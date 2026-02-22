# Chronicler Gap Closure — Implementation Plan

## Context

Comprehensive data gap analysis identified that Chronicler captures ~15-20% of available DF data. This plan closes the highest-impact gaps across 4 phases, focusing on lossless event capture, narrative enrichment, storyteller integration, and XML parser fixes.

**Reference**: `projects/chronicler/reports/data-gap-analysis-2026-02-22.md`
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Phase 1: Bridge Expansion (Lua-Side)

Expand `chronicler-bridge.lua` from v5 (11 sections) to v6 with lossless event capture, enriched unit data, and spatial context.

### 1.1 Report Cursor Tracking (T1-1)
- [ ] Add `last_seen_report_id` to bridge state (persisted across ticks via global)
- [ ] Replace `start = count - 20` with cursor-based fetch
- [ ] Fetch all reports since cursor (cap 200 per tick)
- [ ] Include report `id` in output for Python-side cursor tracking
- [ ] Validate: run bridge, generate burst of events, confirm none lost

### 1.2 Unit Flag Extraction (T1-2)
- [ ] Add to fortress_units loop: `has_mood`, `mood` enum, `in_tantrum`, `ghostly`, `active_invader`, `pregnancy_timer`, `emotionally_overloaded`
- [ ] Access paths: `u.flags1.has_mood`, `u.mood`, `u.flags3.in_tantrum`, `u.flags3.ghostly`, `u.flags1.active_invader`, `u.pregnancy_timer`, `u.flags2.emotionally_overloaded`
- [ ] Validate: check a dwarf in-game with known mood state

### 1.3 History Event Cursor + Payloads (T1-3, T1-4)
- [ ] Add `last_seen_event_id` to bridge state
- [ ] Fetch all events since cursor (cap 100 per tick)
- [ ] For each event, extract: `id`, `type`, `year`, `seconds`
- [ ] Extract common payload fields: iterate event children for hfid/site_id/artifact_id/entity_id fields
- [ ] Use pcall for safety (some event types may have unusual structures)
- [ ] Validate: advance game time, confirm new events captured with payloads

### 1.4 Emotion/Thought Capture (T2-1)
- [ ] New section `dwarf_emotions` in bridge output
- [ ] For each fortress dwarf, read `status.current_soul.personality.emotions` vector
- [ ] Per emotion: extract `type`, `thought`, `subthought`, `strength`, `year`, `year_tick`
- [ ] Resolve `subthought` to name where possible (if it's an HF ID, look up `df.historical_figure.find()`)
- [ ] Cap at 10 most recent emotions per dwarf
- [ ] Validate: check a stressed dwarf's emotions match expectations

### 1.5 Zone Data Capture (T2-2)
- [ ] New section `zones` in bridge output
- [ ] Iterate `world.buildings.all`, filter to `building_type.Civzone`
- [ ] Per zone: `id`, `type` (civzone_type enum), `x1`, `y1`, `x2`, `y2`, `z`, `name` (if named)
- [ ] Also capture zone `assigned_units` count
- [ ] Cap at 200 zones
- [ ] Validate: verify tavern/temple/bedroom zones appear with correct bounds

### 1.6 Event Collection Capture (T2-4)
- [ ] New section `event_collections` in bridge output
- [ ] Read `world.history.event_collections` — focus on active/recent ones
- [ ] Per collection: `id`, `type`, `name`, `start_year`, `end_year`, `attacker_entity_id`, `defender_entity_id`, `site_id`
- [ ] Resolve entity names inline where feasible
- [ ] Cap at 50 most recent collections
- [ ] Validate: check known war collections match expectations

### 1.7 Squads + Mandates + Crimes (T3-1)
- [ ] New section `squads`: read `world.squads.all` — id, name, members, leader, orders
- [ ] New section `mandates`: read `world.mandates` — type, item, quantity, punishments
- [ ] New section `crimes`: read `world.incidents` — type, status, victim, criminal
- [ ] Cap each at 50 entries
- [ ] Validate: check if fortress has squads/mandates to verify

### Deploy & Test
- [ ] Deploy updated bridge to HomeServer via `deploy-bridge.py`
- [ ] Run DFHack `repeat` command to start bridge
- [ ] Verify HTTP output contains all new sections
- [ ] Run Python `fetch_bridge_data()` and confirm parsing

---

## Phase 2: Python Pipeline Updates

### 2.1 Bridge Accessor Functions
- [ ] Add `get_zones(bridge_data)` → list of zone dicts
- [ ] Add `get_dwarf_emotions(bridge_data)` → list of per-dwarf emotion dicts
- [ ] Add `get_event_collections(bridge_data)` → list of collection dicts
- [ ] Add `get_squads(bridge_data)` → list of squad dicts
- [ ] Add `get_mandates(bridge_data)` → list of mandate dicts
- [ ] Add `get_crimes(bridge_data)` → list of crime dicts
- [ ] Update `get_announcements()` to handle cursor-based report list
- [ ] Update `get_history()` to handle cursor-based event list with payloads

### 2.2 Watcher Updates
- [ ] Track announcement cursor: store `last_seen_report_id` in watcher state
- [ ] Track event cursor: store `last_seen_event_id` in watcher state
- [ ] Store all new announcements to `game_reports` table (not just last 20)
- [ ] Store enriched events to `history_events` table (bridging legends ↔ live)
- [ ] Store new bridge sections to `lua_probes` table

### 2.3 Change Detector Expansion
- [ ] New event type: `MOOD_CHANGED` — detect `has_mood` flag changes
- [ ] New event type: `MOOD_RESOLVED` — detect mood completion (artifact created or failed)
- [ ] New event type: `TANTRUM` — detect `in_tantrum` flag
- [ ] New event type: `PREGNANCY_DETECTED` — detect non-zero `pregnancy_timer`
- [ ] New event type: `ZONE_CHANGED` — detect unit moving between zones (optional, may be noisy)
- [ ] New event type: `EMOTION_TRIGGER` — detect high-severity emotions (grief, horror)

### 2.4 Location Resolution
- [ ] Function `resolve_unit_location(unit_pos, zones)` → zone_type, zone_name
- [ ] Call during watcher cycle, store resolved location in unit details JSONB
- [ ] Include location name in unit_events context (e.g., "DIED in the tavern")

### 2.5 Schema Migrations
- [ ] Add columns to `units`: `mood` (TEXT), `has_mood` (BOOLEAN), `in_tantrum` (BOOLEAN), `location_zone` (TEXT)
- [ ] Add columns to `unit_events`: `location` (TEXT)
- [ ] Evaluate if new tables needed for emotions, zones, squads, mandates, crimes (vs lua_probes JSONB)

---

## Phase 3: Storyteller Enhancement

### 3.1 Live Data Retrieval
- [ ] Add `_retrieve_live_units(pool, world_id)` — query units table for fortress inhabitants
- [ ] Add `_retrieve_live_events(pool, world_id, limit)` — query unit_events for recent changes
- [ ] Add `_retrieve_live_reports(pool, world_id, limit)` — query game_reports for announcements
- [ ] Add `_retrieve_fortress_state(pool, world_id)` — armies, buildings, diplomacy from lua_probes
- [ ] Integrate into `retrieve_context()` main flow

### 3.2 Cross-Reference Queries
- [ ] When matching a live unit, JOIN to historical_figures via hist_fig_id
- [ ] When matching an HF, check if they're alive in units table
- [ ] Traverse hf_links for family/relationship context
- [ ] Traverse hf_entity_links for membership/position context

### 3.3 System Prompt Enhancement
- [ ] Add data structure guidance: describe what data categories exist
- [ ] Add confidence signaling: "If context is sparse, note uncertainty"
- [ ] Add emotional/spatial awareness: "Emotions have causes; locations have names"
- [ ] Distinguish legends (historical) vs live (current) data in context formatting
- [ ] Increase context budget from 8000 chars to ~12000 chars for richer narratives

### 3.4 Keyword Routing Expansion
- [ ] Add fortress-related routes: "fortress", "dwarves", "stress", "mood" → live unit queries
- [ ] Add event routes: "recent", "today", "happened" → unit_events + game_reports
- [ ] Add military routes: "army", "siege", "squad" → armies + squads from lua_probes

---

## Phase 4: XML Parser Fixes

### 4.1 Boolean Flag Debugging (REFL-023) — DONE
- [x] Find a known deity in legends XML by manual grep
- [x] Trace parser execution for that HF to find where boolean detection fails
- [x] Fix tag detection — root cause: parser looked for nonexistent `<deity>`, `<force>`, `<ghost>` tags
  - Deities detected via `<sphere>` child elements (1,300 in World 2 XML, 154 in World 1)
  - Vampires detected via `<active_interaction>` starting with `DEITY_MAJOR_CURSE` (54 in World 2)
  - Necromancers detected via `<interaction_knowledge>` starting with `SECRET` (247 in World 2)
  - Werebeasts detected via `<active_interaction>` starting with `DEITY_CURSE_WEREBEAST` (132 in World 2)
  - Also stores spheres/interactions/knowledge in `details` JSONB for enriched queries
- [x] Updated both World 1 and World 2 HFs in DB with corrected flags
- [x] Validated: supernatural HFs now query correctly
- **NOTE (BUG-004)**: Schema uses `id INT PRIMARY KEY` without `world_id` composite key. World 2 is missing 5,466 HFs (including 1,294 deities) due to ID collision with World 1. Requires schema migration to fix.

### 4.2 Site Ownership Fix (BUG-003) — DONE
- [x] Examined legends_plus XML for `<cur_owner_id>` inside `<site>` elements
- [x] Added site ownership extraction to `_parse_legends_plus()`
- [x] Added pipeline step to UPDATE `sites.owner_entity_id` from cur_owner_id
- [x] Applied fix: World 2: 1,145/1,899 sites now have owners; World 1: 226 sites updated

### 4.3 Region/Geography Parsing
- [ ] Add `<regions>` parsing → regions table (name, type, coords, evilness, rainfall, etc.)
- [ ] Add `<underground_regions>` parsing → underground_regions table
- [ ] Add `<world_constructions>` parsing → world_constructions table

### 4.4 Written Contents + Eras
- [ ] Add `written_contents` table (id, title, author_hf_id, type, year, subject_type, subject_id)
- [ ] Parse `<written_contents>` from legends_plus.xml
- [ ] Add `historical_eras` table (id, name, type, start_year, end_year)
- [ ] Parse `<historical_eras>` from legends.xml

---

## Validation Strategy

After each phase:
1. Deploy updated bridge, verify HTTP output
2. Run watcher for 3+ cycles, confirm new data captured
3. Query database for new data, verify correctness
4. Test storyteller with queries targeting new data
5. Check for hallucinations or data gaps in LLM responses

---

## Dependencies

- HomeServer must be running (DF + DFHack + HTTP server)
- PostgreSQL must be accessible
- LiteLLM must be running for storyteller tests
- Bridge deploy requires SMB access to HomeServer

---

*Plan created 2026-02-22, Session 32*
