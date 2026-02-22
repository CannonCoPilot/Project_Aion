# Chronicler Gap Closure — Revised Implementation Plan (v2)

## Context

Comprehensive code audit (2026-02-22) revealed that ~70% of the original plan's tasks were already implemented. Bridge is v6 (16 sections), Python pipeline handles all sections, storyteller has live data retrieval.

**The critical gap is data integrity, not missing features.**

**Full critical review**: `projects/chronicler/reports/gap-closure-critical-review.md`
**Data gap analysis**: `projects/chronicler/reports/data-gap-analysis-2026-02-22.md`
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Phase 0: Quick Data Integrity Fixes — DONE

### 0.1 Fix kill_count computation (BUG-005) — DONE
- [x] Separated kill_count into independent UPDATE (was LEFT JOIN'd to event_count)
- [x] Changed grouping from `hf_id_1` (victim) to `hf_id_2` (slayer)
- [x] Ran corrected computation: 8,680 figures updated (was max=3, now max=146)
- [x] Verified: top killers are Bronze Colossus(146), Roc(142), Dwarf warrior(117), Forgotten Beast(98)

### 0.2 Add link table UNIQUE constraints (BUG-006) — DONE
- [x] Deduped: 4,679 from hf_links, 23 from hf_entity_links (hf_site_links clean)
- [x] Added UNIQUE constraints: `uq_hf_links`, `uq_hf_entity_links`, `uq_hf_site_links`
- [x] Updated ON CONFLICT: hf_links/hf_site_links → DO NOTHING on composite key; hf_entity_links → DO UPDATE SET position_name

### 0.3 Fix region parsing scope (BUG-008) — DONE
- [x] Verified: no spurious matches in actual XML (240/240 regions, 125/125 underground_regions)
- [x] Changed `.//region` → `regions/region` and `.//underground_region` → `underground_regions/underground_region` for correctness

---

## Phase 1: Composite PK Migration — DONE

### 1.1 Design composite PK schema — DONE
- [x] All legends tables: `PRIMARY KEY (world_id, id)` — 13 tables migrated
- [x] Link tables: `world_id` column + composite UNIQUE + composite FKs
- [x] `structures`: PK = `(world_id, site_id, id)`, FK to sites composite
- [x] `collection_events`/`collection_subcollections`: world_id + composite FKs
- [x] New `schema.sql` + `migrate_composite_pk.sql` written

### 1.2 Update foreign key references — DONE
- [x] Link tables: composite FKs `(world_id, hf_id) REFERENCES historical_figures(world_id, id)`
- [x] Junction tables: composite FKs to events + collections
- [x] Soft FKs (events.hf_id_1 etc.) left as INT — no schema constraint needed

### 1.3 Update import pipeline — DONE
- [x] Parse functions emit `world_id` in link/junction/structure rows
- [x] All ON CONFLICT clauses reference composite keys
- [x] Computed counts (event_count, kill_count) scoped by world_id parameter
- [x] Entity enrichment conflict target: `(world_id, id)`

### 1.4 Update storyteller queries — DONE
- [x] `hf_links` JOIN: `hf2.world_id = hl.world_id AND hf2.id = hl.target_hf_id`
- [x] `hf_entity_links` JOIN: `e.world_id = hel.world_id AND e.id = hel.entity_id`
- [x] All existing WHERE clauses already filter by world_id (no changes needed)

### 1.5 Execute migration — DONE
- [x] Backup: `chronicler-pre-migration.dump` (17MB)
- [x] Migration: 18 tables dropped + recreated + 18 indexes
- [x] World 1 (Namoram): 5,466 HFs, 29,682 events — previously lost to ID collision
- [x] World 2 (Ormon): 55,321 HFs, 566,973 events — full count preserved
- [x] **Total HFs: 60,787** (was 55,321 — 5,466 recovered = 9.9% data restoration)
- [x] **10,932 cross-world ID collisions** now resolved by composite PKs
- [x] Kill counts verified correct in both worlds (max: 117 in Ormon, 87 in Namoram)

---

## Phase 2: Storyteller Enrichment — DONE

### 2.1 Relationship traversal on HF match — DONE
- [x] Query `hf_links` for spouse/children/parents when HF found
- [x] Query `hf_entity_links` for civ memberships and positions
- [x] Query `hf_site_links` for associated sites
- [x] Format relationship data into context text

### 2.2 Event payload enrichment — DONE
- [x] JOIN event queries to resolve hf_id → name, site_id → name
- [x] Format: "Bomrek was slain by Urist at Goldenhall in year 253"
- [x] Added `_format_event()` with natural-language templates for 6 event types
- [x] Added `_summarize_details()` for JSONB detail fields

### 2.3 Emotion/zone integration in live unit queries — DONE
- [x] Pull latest `dwarf_emotions` probe via `_build_emotion_map()`, match to unit IDs
- [x] Pull latest `zones` probe via `_build_zone_owner_map()`, resolve owner → zone name
- [x] Included in `_retrieve_live_units()` output (top 3 emotions, zone assignment)

### 2.4 War name resolution — DONE
- [x] JOIN collection queries to resolve entity IDs → names (3 locations)
- [x] Format: "War Name (war, year X–Y) — Attacker vs Defender"
- [x] Updated: `collection_type` category route, `_world_overview`, name search

### 2.5 Confidence signaling — DONE
- [x] Prepend context density note to results
- [x] If < 3 records: "Context is limited — be cautious about specific details"
- [x] If > 10 records: "Rich context available — multiple data sources matched"

---

## Phase 3: XML Completeness — DONE

### 3.1 Written contents table + parser — DONE
- [x] Create `written_contents` table with composite PK (world_id, id)
- [x] Parse from legends.xml (title, author_hfid, form, styles, form_id, author_roll)
- [x] Enrich from legends_plus.xml (type, page_start/end, references, CamelCase styles)
- [x] Add "book"/"poem"/"scroll"/"composition"/"music"/"literature"/"writing" keywords to storyteller routing
- [x] Storyteller query JOINs to historical_figures for author name resolution
- [x] Imported: 61,692 written contents across 2 worlds

### 3.2 Historical eras table + parser — DONE
- [x] Create `historical_eras` table with composite PK (world_id, name)
- [x] Parse from legends.xml with raw int parsing (preserves start_year = -1)
- [x] Imported: 2 eras (both "Age of Myth", start_year = -1)

### 3.3 Verify/fix region, underground_region, world_construction parsing — DONE
- [x] Regions: XML counts match DB exactly (240 + 2,431 = 2,671)
- [x] Underground regions: XML counts match DB exactly (125 + 1,445 = 1,570)
- [x] **BUG FOUND+FIXED**: underground_regions had NULL type/depth — was only parsed from legends_plus.xml (which lacks these fields). Added `_parse_underground_regions()` to parse type/depth from legends.xml first, then enrich coords from plus
- [x] World constructions: already parsed correctly from legends_plus (14 + 425 = 439)
- [x] Backfilled all 1,570 underground_regions with type/depth data (0 NULLs remaining)

---

## Phase 4: Operational Hardening — DONE

### 4.1 Test suite — DONE
- [x] `test_xml_parser.py` — boolean flags, field mapping, composite PKs, written contents, eras, helpers (26 tests)
- [x] `test_context.py` — keyword extraction, category routing, HF/event/details formatting (30 tests)
- [x] `test_detector.py` — bootstrap, arrivals/departures, unit diffs, bridge events (29 tests)
- [x] `test_schema.py` — composite PKs (17), FK constraints (25), UNIQUE constraints (4) — integration tests via asyncpg (46 tests)
- **Total: 131 tests, all passing in 0.19s**

### 4.2 lua_probes retention cleanup — DONE
- [x] Add retention policy (keep last N per probe_name per world_id) via `_cleanup_lua_probes_count()`
- [x] Run cleanup after bridge section storage (every 10 watcher cycles to avoid overhead)
- [x] Removed unused `_cleanup_lua_probes` function (kept only `_cleanup_lua_probes_count`)

### 4.3 Bridge health monitoring — DONE
- [x] Track consecutive bridge failures via failure counter
- [x] Warn after 3 failures, continue with core-only data (graceful degradation)

---

## Previously Completed (from original plan)

### Phase 1 Bridge (ALL DONE)
- [x] T1-1: Report cursor tracking → bridge v6
- [x] T1-2: Unit flag extraction → bridge v6
- [x] T1-3/T1-4: History event cursor + payloads → bridge v6
- [x] T2-1: Emotion/thought capture → bridge v6
- [x] T2-2: Zone data capture → bridge v6
- [x] T2-4: Event collection capture → bridge v6
- [x] T3-1: Squads + mandates + incidents → bridge v6

### Phase 2 Python (ALL DONE)
- [x] Bridge accessor functions → `bridge.py` (24 functions)
- [x] Watcher bridge storage → `watcher.py` (16 sections to lua_probes)
- [x] Change detector expansion → `detector.py` (11 event types)

### Phase 3 Storyteller (ALL DONE)
- [x] Live data retrieval → `context.py` (5 retrieval functions)
- [x] Keyword routing → `context.py` (23 live-data routes)
- [x] System prompt → `prompts.py` (dual-tier, 12K chars)
- [x] HF-to-unit cross-reference → `_retrieve_live_units()` JOINs to historical_figures
- [x] Relationship traversal → hf_links, hf_entity_links, hf_site_links queries
- [x] Event payload enrichment → `_format_event()` + `_summarize_details()`
- [x] Emotion/zone integration → `_build_emotion_map()` + `_build_zone_owner_map()`
- [x] War name resolution → entity JOINs in 3 query locations
- [x] Confidence signaling → context density note prepended to results

### Phase 4 XML (ALL DONE)
- [x] Boolean flag debugging (BUG-001/REFL-023) — deities/vampires/necromancers/werebeasts
- [x] Site ownership fix (BUG-003) — from legends_plus cur_owner_id
- [x] Written contents — 61,692 rows, dual-source parsing (legends.xml + legends_plus.xml)
- [x] Historical eras — parsed from legends.xml with raw int for start_year
- [x] Region parsing — verified, fixed underground_regions type/depth loss bug

---

## Dependency Graph

```
Phase 0 (Quick Fixes)     ← No dependencies
    ↓
Phase 1 (Composite PKs)   ← Requires Phase 0 clean data
    ↓
Phase 2 (Storyteller)     ← Needs Phase 1 correct queries
Phase 3 (XML)             ← Needs Phase 1 composite PK schema (parallel with Phase 2)
    ↓
Phase 4 (Hardening)       ← Tests cover Phase 1-3 changes
```

---

---

## Completion Summary

**All phases complete.** The Chronicler Gap Closure plan has been fully executed:
- **Phase 0**: 3 data integrity bugs fixed (kill_count, link table dedup, region parsing)
- **Phase 1**: Composite PK migration across 13 tables, 10,932 cross-world ID collisions resolved, 5,466 HFs recovered
- **Phase 2**: Storyteller enriched with relationship traversal, event formatting, emotion/zone integration, war name resolution, confidence signaling
- **Phase 3**: XML completeness — written_contents (61,692 rows), historical_eras, underground_region type/depth backfill
- **Phase 4**: 131-test suite (0.19s), lua_probes retention, bridge health monitoring

*Completed: 2026-02-22, Session 32*
*Revised plan v2, 2026-02-22, Session 32*
*Previous: v1 (original plan, 70% superseded by implementation)*
