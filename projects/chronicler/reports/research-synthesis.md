# Chronicler Research Synthesis

**Date**: 2026-02-23
**Scope**: Cross-analysis of 8 deep-research reports covering 12 repositories, 7 web-sourced threads, and ~278 KB of source-level analysis. Purpose: extract actionable patterns, identify capability gaps, and prioritize feature development for Chronicler.

---

## 1. Landscape Overview

The Dwarf Fortress legends/history ecosystem consists of five distinct tool categories, each addressing a different access paradigm:

| Category | Tools Analyzed | Data Source | Access Pattern |
|----------|---------------|-------------|----------------|
| **Legends Browsers** | LegendsViewer-Next, LegendsBrowser, LegendsBrowser2 | XML export files | Batch parse, in-memory, web UI |
| **Live Game Servers** | weblegends | DFHack C++ memory | Real-time HTTP, per-request render |
| **Autonomous Agents** | df-ai | DFHack C++ memory | Tick-based reactive loop |
| **Narrative Generators** | df-narrator | XML export files | Score + template, LLM-sized output |
| **Infrastructure Tools** | dfhack-client-python, DwarfFortressLogger, myDFHackScripts, DwarvenSurveyor, df-structures | Mixed (RPC, memory, Lua, XML) | Various |
| **Mod Management** | DF-Modloader, ModHearth, PyLNP, PyDwarf | Filesystem + DFHack Lua | Raw parsing, profile management |

**Chronicler's unique position**: No existing tool combines (1) persistent database storage, (2) live fortress polling, (3) legends XML ingestion, (4) LLM-driven narrative generation, and (5) worldgen monitoring. Chronicler is the first to attempt all five in a single system.

---

## 2. Event Type Taxonomy — The Canonical Reference

Cross-referencing all tools yields a definitive event type count:

| Source | Event Types | Authoritative? |
|--------|-------------|----------------|
| df-structures `history_event_type` enum | **144** | Yes (memory layout, canonical) |
| LegendsBrowser2 `events.go` | 132 | Yes (Go source, production) |
| LegendsViewer-Next `XMLParser.cs` | 115+ | Yes (.NET source, production) |
| weblegends `events/*.cpp` | 94 files | Yes (C++ source, production) |
| df-narrator | Generic (type string) | No (no per-type handling) |

**Synthesis**: df-structures defines **144 event types** in the `history_event_type` enum. This is the canonical source because it defines DF's actual memory layout. LegendsBrowser2's 132 types represent the most complete *handling* implementation. The gap between 132 and 144 consists of newer event types added in DF 0.47+ that some tools haven't implemented handlers for.

**Recommendation**: Chronicler should target all 144 event types from df-structures as the schema definition, with narrative templates for the 132 types that LegendsBrowser2 handles, and graceful fallback (raw field dump) for the remaining 12.

### Event Type Categories (merged taxonomy)

| Category | Count | Examples |
|----------|-------|---------|
| HF Lifecycle | 15 | died, revived, wounded, abducted, enslaved, freed, ransomed |
| HF Relationships | 10 | add/remove hf_hf_link, add/remove hf_entity_link, add/remove hf_site_link |
| HF Actions | 12 | attacked_site, destroyed_site, confronted, does_interaction, preach |
| HF Intrigue | 10 | convicted, interrogated, formed_intrigue, failed_frame, sabotage |
| Artifacts | 13 | created, destroyed, lost, found, given, possessed, recovered, stored, transformed, copied, claim_formed |
| Sites/Construction | 18 | created_site, destroyed_site, site_taken_over, reclaim_site, created_structure, razed_structure |
| Entities | 14 | entity_created, dissolved, incorporated, overthrown, law, persecuted, alliance_formed |
| War/Combat | 8 | field_battle, squad_vs_squad, tactical_situation, attacked_site, plundered_site |
| Diplomacy | 10 | peace_accepted/rejected, agreement_formed/concluded/rejected, trade, first_contact |
| Culture/Art | 7 | poetic/musical/dance_form_created, written_content_composed, knowledge_discovered |
| Masterpieces | 8 | arch_construct, item, dye, item_improvement, food, engraving, lost |
| Occasions | 5 | ceremony, competition, performance, procession, gamble |
| Misc | 14 | creature_devoured, body_abused, merchant, sneak_into_site, spotted_leaving, insurrection |

---

## 3. Data Model Convergence

All legends browsers converge on the same core entity types. The table below maps each tool's coverage:

| Entity Type | LV-Next | LB2 | weblegends | df-narrator | df-structures | Chronicler CDM |
|-------------|---------|-----|------------|-------------|---------------|----------------|
| Historical Figures | Full | Full | Full | Scored subset | Full (canonical) | Full |
| Sites | Full | Full | Full | Scored subset | Full | Full |
| Entities (Civs) | Full | Full | Full | Name only | Full | Full |
| Artifacts | Full | Full | Full | Scored subset | Full | Full |
| Regions | Full | Full | Full | No | Full | Full |
| Underground Regions | Full | Full | Full | No | Full | Partial |
| Structures | Full | Full | Full | No | Full | Full |
| World Constructions | Full | Full | Partial | No | Full | Missing |
| Written Content | Full | Full | Partial | No | Full | Partial |
| Art Forms (3 types) | Full | Full | Partial | No | Full | Missing |
| Identities | Full | Full | No | No | Full | Missing |
| Landmasses | Full | Full | No | No | Full | Partial |
| Mountain Peaks | Full | Full | No | No | Full | Partial |
| Rivers | Full | Stub | No | No | Full | Missing |
| Entity Populations | Full | Stub | Partial | No | Full | Partial |
| Event Collections | Full | Full | Full | Partial | Full | Partial |

### HF Field Completeness Audit

The most important entity is `HistoricalFigure`. Cross-referencing all sources against Chronicler's CDM:

**Already in Chronicler CDM**: id, name, race, caste, sex, birth_year, death_year, profession, associated_type, civ_id, unit_id

**Missing from Chronicler CDM** (high priority):
- `deity`, `force`, `ghost` flags (from `histfig_flags`)
- `active_interactions` (vampire/necromancer/werebeast detection)
- `spheres` (deity domains)
- `goals` (life goals)
- `skills` with XP points (from `info.skills`)
- `entity_links` with link type and position details
- `histfig_links` (family: mother/father/child/spouse)
- `site_links` (lair, home, seat_of_power)
- `kills` (notable and other kill records)
- `whereabouts` / `current_state` (geographic location)
- `vague_relationships` and `relationship_profiles`
- `entity_reputations` (murderer, hero, monster, etc.)
- `intrigue_actors` / `intrigue_plots` (v0.47+ intrigue system)
- `used_identities` / `current_identity` (false identity tracking)
- `journey_pets`
- `holds_artifact` (currently held artifacts)
- `breed_id`, `cultural_identity`, `family_head_id`

**Missing from Chronicler CDM** (medium priority):
- `orientation_flags`
- `curse_year` / `curse_seconds`
- `personality` (values, ethics, mannerisms — 70+ mannerism types, value types, ethic types)
- `knowledge_profile` (known secrets, known books, belief systems)
- `reputation_profile` (wanted status, journey profile)

---

## 4. Visualization Gap Analysis

Every legends browser provides visualization. Chronicler currently has none.

| Visualization | LV-Next | LB1 | LB2 | weblegends | Priority for Chronicler |
|---------------|---------|-----|-----|------------|------------------------|
| Interactive world map (Leaflet) | Yes | No | Yes | Static PNG | **P1** — centerpiece feature |
| Site markers (type-coded shapes) | Yes | Yes | Yes | No | **P1** |
| Civilization color coding | Yes (HSV) | Yes (jscolor) | Yes | No | **P1** |
| Family tree (graph viz) | Yes (Cytoscape dagre) | Yes (SVG custom) | No | No | **P2** |
| Curse lineage tree | No | Yes (SVG) | No | No | **P3** |
| Warfare graph (force-directed) | Yes (Cytoscape cola) | No | No | No | **P2** |
| War chord diagram | No | Yes (D3) | No | No | **P3** |
| Event timeline (line chart) | Yes (Chart.js) | No | No | No | **P2** |
| Population pie/doughnut | Yes (Chart.js) | Yes (D3) | No | No | **P2** |
| Event type breakdown (bar) | Yes (Chart.js) | No | No | No | **P3** |
| Per-object mini-map | Yes | No | No | Yes | **P2** |
| Hover popovers | No | Yes (Bootstrap) | Yes (Bootstrap) | No | **P2** |

### Map Implementation Consensus

All map implementations use the same coordinate approach:
- **Coordinate system**: `L.CRS.Simple` (no geographic projection)
- **Y-axis**: Inverted from DF coordinates (`map_height - y`)
- **Scale**: 4-10 pixels per world tile
- **Site markers**: Colored polygons/shapes coded by site type and owning civilization
- **Layer control**: Toggle site layers by civilization/type

**Chronicler's advantage**: With PostgreSQL + PostGIS (if extended), Chronicler could offer spatial queries that no in-memory tool can match.

---

## 5. Cross-Linking — The Core UX Pattern

Every successful legends browser makes **cross-linking** the central user experience. The pattern is consistent across all tools:

| Aspect | LV-Next | LB2 | weblegends |
|--------|---------|-----|------------|
| Link format | HTML `<a>` generated server-side | HTML `<a>` via Go template functions | HTML `<a>` via C++ `link()` function |
| Context awareness | No | Yes (`HfId` context → relational pronouns) | Yes (`event_context` → suppress self-links) |
| Rendering | `v-html` injection | Go template `{{ hf .Id }}` | `ostream << link(s, entity)` |
| Hover preview | No | Yes (Bootstrap popover via Ajax) | No |

**Key insight**: LegendsBrowser2's **perspective-aware rendering** is the gold standard. When viewing HF #123's page, events mentioning HF #123 render as "the dwarf" or use relational pronouns ("his wife"), while other entities remain fully linked. weblegends implements the same pattern via `event_link()` (suppresses link for context entity). LegendsViewer-Next does NOT do this.

**Recommendation for Chronicler**: Implement perspective-aware narrative generation. When the LLM generates event descriptions for an entity's page, pass the entity ID as context so the narrative uses appropriate pronouns and suppresses redundant self-references.

---

## 6. Scoring and Ranking — Entity Importance

Only df-narrator implements explicit importance scoring. The formulas are well-calibrated and directly usable:

### Figure Importance Score
```
events × 2 (cap 500) + kills × 15 + vampire(80) + necromancer(100) + deity(120) +
force(90) + megabeast(70) + HF_links × 3 (cap 100) + leadership_positions × 20 +
artifacts_held × 30 + spheres × 10 + skills_bonus (cap 80) + site_links × 5 (cap 50) +
entity_links × 3 (cap 60) + death_recorded(5)
```

### Site Importance Score
```
events + deaths × 2 + event_collections × 5 + structures × 3
```

### Conflict Importance Score
```
deaths × 3 + battles × 10 + sites_involved × 5 + duration_years
```

### Artifact Importance Score
```
events × 10 + unique_holders × 20 + lost_or_stolen(30) + named(50)
```

**Recommendation**: Add `importance_score` columns to Chronicler's CDM tables for `historical_figures`, `sites`, `artifacts`. Compute on ingestion using df-narrator's formulas. Use for LLM context selection — when the narrative engine needs to summarize a world, retrieve the top-N entities by score.

---

## 7. Live Data Access — Bridge Architecture Validation

The research confirms Chronicler's `chronicler-bridge.lua` approach is architecturally correct. Three independent codebases (df-ai, myDFHackScripts, weblegends) use the same fundamental patterns:

| Pattern | df-ai (C++) | myDFHackScripts (Lua) | Chronicler bridge (Lua) |
|---------|-------------|----------------------|------------------------|
| Tick-based polling | `OnupdateCallback` | `dfhack.timeout(500, 'ticks')` | `repeat --time 500 --timeUnits ticks` |
| Event subscription | N/A (C++ hooks) | `eventful.onUnitDeath[modId]` | Not yet (polling only) |
| Change detection | Set comparison (citizen IDs) | `Helper.watch()` factory | Snapshot comparison |
| Data access | `df::world->units.active` | `df.global.world.units.active` | `df.global.world.units.active` |
| Death cause lookup | Direct memory | `df.global.world.incidents.all` | Not yet |

### Bridge Enhancement Priorities

1. **Add `eventful` subscriptions** — `UNIT_DEATH`, `ITEM_CREATED`, `JOB_COMPLETED`, `UNIT_NEW_ACTIVE`, `SYNDROME` for reactive event capture (currently polling-only)
2. **Death cause enrichment** — Use `df.global.world.incidents.all` pattern from myDFHackScripts to get death cause enum + killer ID
3. **Parent/family chain** — `unit.relationship_ids.Mother/Father` for family tree data from live units
4. **Book detection** — `dfhack.items.getBookTitle(item)` for written work events
5. **Incident system** — Full incident lookup for crime/death narrative

---

## 8. Worldgen Monitoring — Novel Capability

The worldgen scraping research reveals a genuine capability gap in the DF ecosystem. **No existing tool monitors worldgen in real time.** The `world_generatorst` struct at `df.global.world.worldgen_status` provides:

- 12-state generation phase enum (None through Done)
- Progress counters (rivers, civs, rampages)
- Phase completion flags (caves placed, megabeasts placed, etc.)
- Event cursor (`last_event_id_added`)
- Live access to `world.history.figures/events/eras` as they populate

**Implementation**: A `worldgen-bridge.lua` script using the existing `repeat` job pattern, polling every 30 frames (~0.5s), writing JSON snapshots. The report includes a complete implementation template.

**Chronicler value**: First-ever real-time worldgen dashboard. Shows civilization count rising, event accumulation curves, era transitions, and phase progression as the world generates.

---

## 9. Mod Management — Scope Assessment

The mod management research covers a broad but tangentially relevant domain. Key findings:

| Aspect | Relevance to Chronicler |
|--------|------------------------|
| `info.txt` parsing (v50 format) | LOW — Chronicler is a legends tool, not a mod manager |
| `mod-manager.json` integration | LOW — unless tracking which mods were active during a world's generation |
| Raw file parsing / conflict detection | LOW — outside Chronicler's core scope |
| Modpack profile management | NONE — separate tool entirely |

**Recommendation**: Defer mod management entirely. If needed later, the research report provides a complete tiered implementation plan. The only potentially relevant feature is recording which mods were active when a world was generated, which could be captured during worldgen monitoring.

---

## 10. Death Cause Rendering — 40+ Variants

weblegends provides the definitive death cause rendering with 40+ distinct death causes, each with specific prose:

```
OLD_AGE → "died of old age"
SHOT → "was shot and killed"
BLEED → "bled to death"
DROWN → "drowned"
SUFFOCATE → "suffocated"
MAGMA → "was consumed by magma"
DRAGONFIRE → "was killed by dragonfire"
CAVEIN → "was crushed in a cave-in"
DRAWBRIDGE → "was smashed by a drawbridge"
BEHEAD → "was beheaded"
CRUCIFY → "was crucified"
BURN_ALIVE → "was burned to a crisp"
HACK_TO_PIECES → "was hacked to pieces"
DRAIN_BLOOD → "was drained of blood"
LEAPT_FROM_HEIGHT → "leapt from a great height"
INFECTION → "succumbed to infection"
... (25+ more)
```

Each death also includes: weapon info, slayer identity with race, and age at death (with fractional year display).

**Recommendation**: Implement the full death cause taxonomy in Chronicler's narrative engine. This is one of the highest-value narrative enrichment features.

---

## 11. Calendar and Time Formatting

All tools converge on the same DF calendar formula:

```python
# seconds72 → calendar date
day_of_year = seconds72 // 1200 + 1
month = min((day_of_year - 1) // 28 + 1, 12)
day = (day_of_year - 1) % 28 + 1

# Month names (DF months)
months = ["Granite", "Slate", "Felsite",    # Spring
          "Hematite", "Malachite", "Galena", # Summer
          "Limestone", "Sandstone", "Timber", # Autumn
          "Moonstone", "Opal", "Obsidian"]    # Winter

# Season from month
season = ["early spring", "mid spring", "late spring",
          "early summer", "mid summer", "late summer",
          "early autumn", "mid autumn", "late autumn",
          "early winter", "mid winter", "late winter"][month - 1]
```

**Recommendation**: Implement this once in a shared utility and use consistently across all narrative and display code.

---

## 12. Consolidated Action Items

### Tier 1 — Critical (blocks narrative engine and explorer)

| # | Action | Source Report | Effort |
|---|--------|-------------|--------|
| 1 | Add all 144 event types from df-structures to CDM event type taxonomy | dfhack-infrastructure | Medium |
| 2 | Extend HF CDM with missing high-priority fields (flags, interactions, skills, links, kills, whereabouts) | All legends browsers | Large |
| 3 | Add importance scoring columns and compute on ingestion | df-narrator | Small |
| 4 | Implement death cause narrative rendering (40+ causes) | weblegends | Medium |
| 5 | Implement perspective-aware event narrative generation | LegendsBrowser2, weblegends | Medium |
| 6 | Add cross-linking infrastructure (entity references in event text become navigable links) | All legends browsers | Medium |
| 7 | Implement DF calendar utility (seconds72 → date/month/season) | df-narrator, weblegends | Small |

### Tier 2 — High Value (visualization and data completeness)

| # | Action | Source Report | Effort |
|---|--------|-------------|--------|
| 8 | Interactive world map with Leaflet.js (CRS.Simple, site markers, civ colors) | LV-Next, LB2 | Large |
| 9 | Family tree visualization (Cytoscape.js dagre) | LV-Next, LB1 | Medium |
| 10 | Event timeline charts (Chart.js line/bar) | LV-Next | Medium |
| 11 | Population distribution charts | LV-Next, LB1 | Small |
| 12 | Hover popovers for entity preview | LB2 | Medium |
| 13 | Global search with autocomplete | LB2 | Medium |
| 14 | Add missing CDM entity types: WorldConstructions, ArtForms (3), Identities, Rivers | All legends browsers | Large |

### Tier 3 — Bridge Enhancements

| # | Action | Source Report | Effort |
|---|--------|-------------|--------|
| 15 | Add `eventful` subscriptions (UNIT_DEATH, ITEM_CREATED, UNIT_NEW_ACTIVE, SYNDROME) | myDFHackScripts | Small |
| 16 | Death cause resolution via `df.global.world.incidents.all` | myDFHackScripts | Small |
| 17 | Parent/family chain extraction (`unit.relationship_ids.Mother/Father`) | myDFHackScripts | Small |
| 18 | Book/written work detection (`dfhack.items.getBookTitle`) | myDFHackScripts | Small |
| 19 | Create `worldgen-bridge.lua` for real-time worldgen monitoring | worldgen-scraping | Medium |
| 20 | Add `worldgen_snapshots` CDM table | worldgen-scraping | Small |

### Tier 4 — Stretch / Deferred

| # | Action | Source Report | Effort |
|---|--------|-------------|--------|
| 21 | Curse lineage tree (vampire/werebeast "who bit whom") | LB1 | Medium |
| 22 | Warfare graph (Cytoscape.js cola force-directed) | LV-Next | Medium |
| 23 | War chord diagram (D3.js) | LB1 | Medium |
| 24 | Mod awareness (record active mods per world) | mod-management | Small |
| 25 | Stock threshold model from df-ai as LLM advisor context | df-ai | Medium |
| 26 | Raw file parser for mod conflict detection | mod-management | Large |

---

## 13. Architectural Patterns Worth Adopting

### Pattern 1: Event Rendering Pipeline

All successful tools follow the same pipeline:
```
Event (typed struct) → Context (current entity perspective) → Template (per-type prose) → HTML (with entity links)
```

For Chronicler with LLM:
```
Event (CDM row) → Context (target entity + related entities) → LLM prompt (with event type template) → Narrative (with entity references marked for linking)
```

### Pattern 2: Post-Parse Processing Pipeline

Every legends browser runs a post-parse cross-referencing pass (LV-Next: 12 resolve steps, LB2: 6 process steps). Chronicler should do the same after XML ingestion:
1. Resolve HF-to-HF family links
2. Resolve HF-to-entity position assignments
3. Derive vampire/werebeast/necromancer flags from interaction events
4. Compute site ruin status from destruction/reclaim events
5. Build entity war lists from event collections
6. Compute HF kill lists from death events
7. Calculate importance scores

### Pattern 3: Exclusive Action Queue (from df-ai)

df-ai's "one exclusive action at a time, queue others" maps directly to how Chronicler's LLM should execute multi-step fortress management actions:
- Maintain one active action chain
- Queue pending actions
- Report completion/failure before starting next

### Pattern 4: Polling + Events Hybrid (from myDFHackScripts)

The proven pattern is: use `eventful` subscriptions for real-time events (deaths, item creation) AND polling via `dfhack.timeout` for state changes (citizen count, reports, petitions). This hybrid approach catches both immediate events and gradual state transitions.

---

## 14. Key Reference Data

### df-narrator HF_FIELDS — Canonical HF Reference Field List

These XML event fields reference historical figure IDs:
```
hfid, slayer_hfid, hfid1, hfid2, group_hfid, snatcher_hfid,
changee_hfid, changer_hfid, woundee_hfid, wounder_hfid,
doer_hfid, target_hfid, attacker_hfid, defender_hfid,
hist_fig_id, body_hfid, hfid_target, hfid_attacker,
hfid_defender, trickster_hfid, cover_hfid, student_hfid,
teacher_hfid, trainer_hfid, seeker_hfid
```

### Site Type Taxonomy (union of all sources)

```
Camp, Cave, Castle, Dark Fortress, Dark Pits, Forest Retreat, Fort, Fortress,
Hamlet, Hillocks, Important Location, Labyrinth, Lair, Monastery,
Mountain Halls, Mysterious Dungeon, Mysterious Lair, Mysterious Palace,
Ruins, Shrine, Tomb, Tower, Town, Vault
```
(24 distinct types)

### Entity Type Taxonomy (from weblegends + LB2)

```
Civilization, Site Government, Nomadic Group, Migrating Group,
Religion, Military Unit (mercenary/shadowy/versatile), Guild,
Performance Troupe, Merchant Company, Vessel Crew, Bandit Gang,
Outcast, Semi-Megabeast, Mega-Beast, Unknown
```

### HF Relationship Types (from df-structures, comprehensive)

**HF-to-HF**: Mother, Father, Child, Spouse, Former Spouse, Deceased Spouse, Lover, Deity, Companion, Prisoner, Imprisoner, Master, Former Master, Apprentice, Former Apprentice, Pet Owner

**HF-to-Entity**: Member, Former Member, Mercenary, Former Mercenary, Slave, Former Slave, Prisoner, Former Prisoner, Enemy, Criminal, Position, Former Position, Position Claim, Occupation, Former Occupation, Squad, Former Squad

**HF-to-Site**: Lair, Home Site (abstract/realization building), Seat of Power, Hangout, Occupation, Prison

---

## 15. What Chronicler Already Has vs. What's Needed

| Capability | Current Status | Gap |
|-----------|---------------|-----|
| XML legends ingestion | Built (CDM schema) | Need all 144 event types |
| XML+ merge (legends_plus) | Built | Need audit vs LV-Next merge rules |
| Live polling (bridge) | Built (7 data domains) | Need eventful subscriptions + death cause |
| Change detection | Built (snapshot comparison) | Adequate |
| PostgreSQL persistence | Built (1.65M records) | Need schema extensions for missing fields |
| 131-test suite | Built | Need event type coverage tests |
| CLI interface | Built (`chronicler watch`) | Need `chronicler explore` for browsing |
| Narrative enrichment | Partial (storyteller) | Need perspective-aware, death causes, cross-links |
| Worldgen monitoring | Not started | Novel capability, template ready |
| Map visualization | Not started | P1 gap |
| Family tree visualization | Not started | P2 gap |
| Charts/graphs | Not started | P2 gap |
| Search | Not started | P2 gap |
| Hover popovers | Not started | P2 gap |
| Mod awareness | Not started | Deferred |
| df-ai advisor knowledge | Not started | Deferred |

---

## 16. Sources Summary

| Report | Repos Covered | Key Contribution |
|--------|--------------|-----------------|
| df-ai-research | df-ai (C++) | Fortress management heuristics, tick-based architecture, stock thresholds, military proportions |
| legendsviewer-next-research | LegendsViewer-Next (.NET/Vue) | 115 event types, Leaflet map, Cytoscape family tree, Chart.js viz, pagination patterns |
| narrator-weblegends-research | df-narrator (Python), weblegends (C++) | 4 scoring formulas, 94 event handlers, 40+ death causes, HF_FIELDS set, context-aware linking |
| legends-browsers-research | LegendsBrowser (Java), LegendsBrowser2 (Go) | 132 event types, SVG family tree, curse lineage, D3 chord diagram, search, popovers |
| dfhack-infrastructure-research | dfhack-client-python, DwarfFortressLogger, df-structures, DwarvenSurveyor, myDFHackScripts | RPC protocol, 144 event type enum, HF field definitions, Lua scripting patterns, death cause lookup |
| mod-management-research | DF-Modloader, ModHearth, PyLNP, PyDwarf | info.txt format, mod-manager.json, raw parsing, conflict detection (deferred for Chronicler) |
| worldgen-scraping-research | df-structures, df-ai, weblegends, DFHack discussions | `world_generatorst` struct, 12-state machine, live Lua access paths, implementation template |
| dwarven-surveyor-scripts-research | DwarvenSurveyor (Unity), myDFHackScripts (Lua) | Map rendering, biome taxonomy, death cause via incidents, citizen detection, book detection |
