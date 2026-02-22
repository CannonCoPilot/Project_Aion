# Chronicler Gap Closure — Revised Implementation Plan (v2)

## Context

Comprehensive code audit (2026-02-22) revealed that ~70% of the original plan's tasks were already implemented. Bridge is v6 (16 sections), Python pipeline handles all sections, storyteller has live data retrieval.

**The critical gap is data integrity, not missing features.**

**Full critical review**: `projects/chronicler/reports/gap-closure-critical-review.md`
**Data gap analysis**: `projects/chronicler/reports/data-gap-analysis-2026-02-22.md`
**Branch**: Project_Aion
**Product code**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

---

## Phase 0: Quick Data Integrity Fixes — NOT STARTED

### 0.1 Fix kill_count computation (BUG-005)
- [ ] Change `hf_id_1` to `hf_id_2` in kill subquery (`xml_parser.py:710-711`)
- [ ] Run corrected computation against live database
- [ ] Verify top-kill-count HFs are actual warriors, not random dead figures

### 0.2 Add link table UNIQUE constraints (BUG-006)
- [ ] Deduplicate existing rows in `hf_links`, `hf_entity_links`, `hf_site_links`
- [ ] Add UNIQUE constraints: `(hf_id, target_hf_id, link_type)`, etc.
- [ ] Update `ON CONFLICT` clauses to reference new constraints

### 0.3 Fix region parsing scope (BUG-008)
- [ ] Verify `.//region` captures spurious elements (grep XML for `<region>` outside `<regions>`)
- [ ] If confirmed, change to `root.findall("regions/region")`

---

## Phase 1: Composite PK Migration — NOT STARTED

### 1.1 Design composite PK schema
- [ ] All 12 legends tables: `PRIMARY KEY (world_id, id)`
- [ ] Link tables: add `world_id` column + composite UNIQUE constraints
- [ ] `structures`: PK becomes `(world_id, site_id, id)`
- [ ] Write new `schema.sql` with composite PKs throughout

### 1.2 Update foreign key references
- [ ] All child tables get explicit `world_id` column
- [ ] FK references become `(world_id, parent_id)` pairs
- [ ] `collection_events`, `collection_subcollections` FKs updated

### 1.3 Update import pipeline
- [ ] `_batch_insert` default conflict → table-specific strategies
- [ ] All import calls pass `world_id` correctly in composite contexts
- [ ] Test: re-import same world twice → no duplicates

### 1.4 Update storyteller queries
- [ ] All JOINs in `context.py` include `world_id`
- [ ] `_world_overview()` queries updated
- [ ] Name search queries updated

### 1.5 Execute migration
- [ ] `pg_dump -Fc chronicler > chronicler-pre-migration.dump`
- [ ] Apply new schema (DROP + CREATE)
- [ ] Re-import World 1 and World 2 from XML
- [ ] Verify: World 2 HF count includes previously-lost 5,466 records
- [ ] Verify: total records exceed pre-migration totals

---

## Phase 2: Storyteller Enrichment — NOT STARTED

### 2.1 Relationship traversal on HF match
- [ ] Query `hf_links` for spouse/children/parents when HF found
- [ ] Query `hf_entity_links` for civ memberships and positions
- [ ] Query `hf_site_links` for associated sites
- [ ] Format relationship data into context text

### 2.2 Event payload enrichment
- [ ] JOIN event queries to resolve hf_id → name, site_id → name
- [ ] Format: "Bomrek was slain by Urist at Goldenhall in year 253"

### 2.3 Emotion/zone integration in live unit queries
- [ ] Pull latest `dwarf_emotions` probe, match to unit IDs
- [ ] Pull latest `zones` probe, resolve unit pos → zone name
- [ ] Include in `_retrieve_live_units()` output

### 2.4 War name resolution
- [ ] JOIN collection queries to resolve entity IDs → names
- [ ] Format: "The War of Daggers (Dwarves vs Goblins, year 200-253)"

### 2.5 Confidence signaling
- [ ] Add context density note to system prompt
- [ ] If < 3 records: "Context is limited"
- [ ] If > 10 records: "Rich context available"

---

## Phase 3: XML Completeness — NOT STARTED

### 3.1 Written contents table + parser
- [ ] Create `written_contents` table with composite PK
- [ ] Parse from legends_plus.xml
- [ ] Add "book"/"poem"/"scroll" keywords to storyteller routing

### 3.2 Historical eras table + parser
- [ ] Create `historical_eras` table with composite PK
- [ ] Parse from legends.xml
- [ ] Use in storyteller for temporal context

### 3.3 Verify/fix region, underground_region, world_construction parsing
- [ ] Confirm parsers exist and populate tables correctly
- [ ] Fix scoping issues if found

---

## Phase 4: Operational Hardening — NOT STARTED

### 4.1 Test suite
- [ ] `test_xml_parser.py` — boolean flags, field mapping, composite PKs
- [ ] `test_context.py` — keyword routing, query generation
- [ ] `test_detector.py` — change detection across snapshots
- [ ] `test_schema.py` — FK constraints, composite PK enforcement

### 4.2 lua_probes cleanup
- [ ] Add retention policy (keep last N per probe_name per world_id)
- [ ] Run cleanup after each watcher cycle

### 4.3 Bridge health monitoring
- [ ] Track consecutive bridge failures
- [ ] Warn after 3 failures, continue with core-only data

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

### Phase 3 Storyteller (PARTIALLY DONE)
- [x] Live data retrieval → `context.py` (5 retrieval functions)
- [x] Keyword routing → `context.py` (23 live-data routes)
- [x] System prompt → `prompts.py` (dual-tier, 12K chars)
- [x] HF-to-unit cross-reference → `_retrieve_live_units()` JOINs to historical_figures
- [ ] **Relationship traversal** — NOT DONE
- [ ] **Event payload enrichment** — NOT DONE
- [ ] **Emotion/zone integration** — NOT DONE
- [ ] **War name resolution** — NOT DONE
- [ ] **Confidence signaling** — NOT DONE

### Phase 4 XML (PARTIALLY DONE)
- [x] Boolean flag debugging (BUG-001/REFL-023) — deities/vampires/necromancers/werebeasts
- [x] Site ownership fix (BUG-003) — from legends_plus cur_owner_id
- [ ] **Written contents** — NOT DONE
- [ ] **Historical eras** — NOT DONE
- [ ] **Region parsing verification** — NOT DONE

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

*Revised plan v2, 2026-02-22, Session 32*
*Previous: v1 (original plan, 70% superseded by implementation)*
