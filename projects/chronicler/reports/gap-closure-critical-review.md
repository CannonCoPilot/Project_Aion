# Chronicler Gap Closure — Critical Review & Revised Plan

**Date**: 2026-02-22
**Session**: 32 (post-JICM resume)
**Scope**: Full critical review of the 4-phase gap closure plan against actual implementation state
**Status**: Supersedes `chronicler-gap-closure.md` as the authoritative implementation plan

---

## Executive Summary

The original gap closure plan was written **before** significant implementation work. A thorough code audit reveals that **~70% of the plan's tasks are already complete** — the Lua bridge is v6 with 16 data domains, the Python pipeline handles all new sections, and the storyteller already has 5 live data retrieval paths.

However, the audit also uncovered **5 previously unidentified issues**, including a kill_count computation bug that corrupts every historical figure's combat statistics, and a link table design flaw that silently accumulates duplicates on re-import.

The revised plan reorders priorities: **data integrity first**, then **retrieval enrichment**, then **XML completeness**, then **operational hardening**.

---

## Part I: Plan vs Reality Audit

### Already Implemented (Was Listed as TODO)

| Plan Item | Plan Status | Actual Status | Evidence |
|-----------|-------------|---------------|----------|
| T1-1: Report cursor tracking | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:252` — cursor-based, capped 200/tick |
| T1-2: Unit flag extraction | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:83` — mood, tantrum, ghostly, pregnancy, stress |
| T1-3: History event payloads | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:337` — extracts hfid/site/victim/slayer/reason |
| T1-4: History event cursor | Phase 1 TODO | **DONE** | `chronicler-bridge.lua` — `last_seen_event_id` global, 100/tick cap |
| T2-1: Emotion/thought capture | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:522` — per-dwarf emotions, 10 most recent |
| T2-2: Zone data capture | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:574` — civzones with bounds, up to 200 |
| T2-4: Event collection capture | Phase 1 TODO | **DONE** | `chronicler-bridge.lua:630` — last 50 collections |
| T3-1: Squads + mandates + crimes | Phase 1 TODO | **DONE** | Lines 704, 767, 813 — all three sections |
| Phase 2 bridge accessors | Phase 2 TODO | **DONE** | `bridge.py` — 24 accessor functions for all 16 sections |
| Phase 2 change detector expansion | Phase 2 TODO | **DONE** | `detector.py` — MOOD_CHANGED, MOOD_RESOLVED, GHOST, PREGNANCY_DETECTED, STRESS_SPIKE |
| Phase 2 watcher bridge storage | Phase 2 TODO | **DONE** | `watcher.py:90-94` — stores all 16 sections to lua_probes |
| Phase 3 live data retrieval | Phase 3 TODO | **DONE** | `context.py:392-553` — 5 retrieval functions + 23 keyword routes |
| Phase 3 system prompt update | Phase 3 TODO | **DONE** | `prompts.py` — dual-tier (HISTORICAL + LIVE), 12,000 char budget |
| Phase 4 boolean flag fix (BUG-001) | Phase 4 TODO | **DONE** | `xml_parser.py:159-183` — spheres, interactions, knowledge detection |
| Phase 4 site ownership (BUG-003) | Phase 4 TODO | **DONE** | `xml_parser.py:686-696` — cur_owner_id from legends_plus |

**Conclusion**: 15 of 22 original plan items are complete. The plan should not be re-executed as written — it would duplicate existing work.

### What's Genuinely Still Missing

| Gap | Severity | Phase | Effort |
|-----|----------|-------|--------|
| Composite PK migration (multi-world data loss) | **CRITICAL** | New Phase 1 | HIGH |
| kill_count computation bug | **HIGH** | New Phase 1 | LOW (5 lines) |
| Link table duplicate accumulation | **HIGH** | New Phase 1 | MEDIUM |
| Relationship traversal in storyteller | **MEDIUM** | New Phase 2 | MEDIUM |
| Emotion/zone data in storyteller queries | **MEDIUM** | New Phase 2 | MEDIUM |
| Event payload enrichment in storyteller | **MEDIUM** | New Phase 2 | MEDIUM |
| Missing XML sections (regions, written_contents, eras) | **LOW** | New Phase 3 | MEDIUM |
| Confidence signaling in prompts | **LOW** | New Phase 2 | LOW |
| War name resolution | **LOW** | New Phase 2 | LOW |
| lua_probes unbounded growth | **LOW** | New Phase 4 | LOW |
| Zero test coverage | **MEDIUM** | New Phase 4 | HIGH |

---

## Part II: Newly Discovered Issues

### BUG-005: kill_count Computation Inverted (CRITICAL)

**Location**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py:708-712`

**Current code**:
```sql
SELECT hf_id_1 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_1
```

**Problem**: `hf_id_1` is the **victim** in death events (mapped from `hfid`, `victim_hfid`). `hf_id_2` is the **slayer** (mapped from `slayer_hfid`). This query groups by victim, giving every killed HF a count of 1. Since each HF dies once, kill_count is always 0 or 1 — never a real kill count.

**Correct query** (group by killer):
```sql
SELECT hf_id_2 AS hfid, COUNT(*) AS cnt
FROM history_events WHERE event_type = 'hf died' AND hf_id_2 IS NOT NULL
GROUP BY hf_id_2
```

**Impact**: The `_world_overview()` fallback query orders by `kill_count DESC` to find "Notable figures." With the bug, this returns arbitrary dead HFs instead of legendary warriors. Every storyteller response referencing combat prowess is based on corrupted data.

**Fix effort**: Change `hf_id_1` to `hf_id_2` on lines 710-711. Re-run the count computation. 5 lines changed.

---

### BUG-006: Link Table Duplicate Accumulation

**Location**: Schema + import pipeline

**Problem**: `hf_links`, `hf_entity_links`, `hf_site_links` use `SERIAL PRIMARY KEY` (auto-incrementing surrogate key). The import pipeline uses `ON CONFLICT DO NOTHING` — but since SERIAL always generates a new key, the conflict clause **never triggers**. Re-importing the same world appends exact duplicates.

**Schema**:
```sql
CREATE TABLE hf_links (
    id          SERIAL PRIMARY KEY,  -- ← always unique, conflict never triggers
    hf_id       INT REFERENCES historical_figures(id),
    target_hf_id INT REFERENCES historical_figures(id),
    link_type   TEXT
);
```

**Impact**: Re-importing World 1 would double all link records. The storyteller would show duplicate relationships ("Urist is married to Aban" × 2, or worse, N times for N re-imports).

**Fix**: Add UNIQUE constraints:
```sql
ALTER TABLE hf_links ADD CONSTRAINT uq_hf_links UNIQUE (hf_id, target_hf_id, link_type);
ALTER TABLE hf_entity_links ADD CONSTRAINT uq_hf_entity_links UNIQUE (hf_id, entity_id, link_type);
ALTER TABLE hf_site_links ADD CONSTRAINT uq_hf_site_links UNIQUE (hf_id, site_id, link_type);
```

Then `ON CONFLICT DO NOTHING` will correctly deduplicate on re-import.

---

### BUG-007: Composite PK Absence (Multi-World Data Loss)

**Location**: Schema — all legends tables

**Problem**: 13 tables use `id INT PRIMARY KEY` where `id` is the DF-internal sequential ID (starting from 1 in every generated world). Importing two worlds causes ID collisions. With `ON CONFLICT DO NOTHING`, World 2 records with IDs that already exist from World 1 are silently dropped.

**Affected tables** (sorted by data loss severity):

| Table | World 1 Records | Collision Impact |
|-------|----------------|------------------|
| `historical_figures` | 26,917 | 5,466 HFs lost from World 2 (19.5%) |
| `history_events` | ~500K+ | Massive event loss from World 2 |
| `sites` | 1,899 | ~1,800 sites lost from World 2 |
| `entities` | ~200 | Most entities lost from World 2 |
| `artifacts` | ~500 | Most artifacts lost from World 2 |
| `regions` | ~200 | All regions lost from World 2 |
| `underground_regions` | ~20 | All lost from World 2 |
| `history_event_collections` | ~2,000 | Most lost from World 2 |
| `identities` | ~100 | Most lost from World 2 |
| `landmasses` | ~10 | All lost from World 2 |
| `mountain_peaks` | ~30 | All lost from World 2 |
| `world_constructions` | ~50 | All lost from World 2 |

**The fix**: Migrate all legends tables to composite PKs `(world_id, id)`. This requires:

1. Schema migration (ALTER TABLE on every affected table)
2. Foreign key updates (hf_links, hf_entity_links, hf_site_links, collection_events, collection_subcollections, structures all reference parent tables by single-column FK)
3. Import pipeline update (all `_batch_insert` calls)
4. Storyteller query updates (all JOINs must include `world_id`)

**Complexity**: HIGH. This is the single most impactful change but also the most invasive. Every query touching legends data must be updated.

**Migration strategy** (detailed in Phase 1 below): Since there's no migration framework, the safest approach is:
1. Export current data (pg_dump)
2. Create new schema with composite PKs
3. Re-import all worlds from XML (guarantees clean data)
4. Verify record counts match expectations

---

### BUG-008: `_parse_regions()` Scoping Risk

**Location**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py:84`

**Current code**:
```python
for r in root.findall(".//region"):
```

**Problem**: `".//region"` finds ALL `<region>` elements anywhere in the document. But `<region>` tags also appear as children of `<site>` elements and potentially within `<historical_event>` elements. The entities parser already solved this problem by scoping to `<entities>` section to avoid bare `<entity>` refs.

**Impact**: Unknown — may insert spurious region records from non-region contexts. Needs investigation against actual XML.

**Fix**: Scope the search to the `<regions>` top-level section:
```python
for r in root.findall("regions/region"):
```

---

### DESIGN-001: `lua_probes` Table Unbounded Growth

**Observation**: Every watcher poll cycle inserts 16 new rows into `lua_probes` (one per bridge section). At 30-second intervals, that's 32 rows/minute, 1,920/hour, 46,080/day. Each row contains a full JSONB snapshot.

**Impact**: Over a week-long fortress session, this accumulates ~320K rows. The table has no TTL, no cleanup, no deduplication.

**Fix options**:
- Add a cleanup step to the watcher: DELETE rows older than N hours (keep latest per probe_name)
- Use UPSERT instead of INSERT (only keep latest snapshot per probe_name per world_id)
- Add a `UNIQUE (world_id, probe_name)` constraint and use `ON CONFLICT DO UPDATE`

The current INSERT-only approach is valid if historical probe data is valuable (time-series analysis of fortress state). If so, add periodic archival instead of deletion.

---

## Part III: Revised Implementation Plan

### Phase 0: Quick Data Integrity Fixes (Effort: 1 hour)

These are low-effort, high-impact fixes that can be deployed immediately.

#### 0.1 Fix kill_count computation (BUG-005)
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
**Change**: Lines 710-711 — replace `hf_id_1` with `hf_id_2` in the kill subquery
**Then**: Run the corrected computation against the live database to fix existing data

#### 0.2 Add link table UNIQUE constraints (BUG-006)
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`
**Changes**:
- Add `UNIQUE (hf_id, target_hf_id, link_type)` to `hf_links`
- Add `UNIQUE (hf_id, entity_id, link_type)` to `hf_entity_links`
- Add `UNIQUE (hf_id, site_id, link_type)` to `hf_site_links`
- Deduplicate existing data before applying constraints

#### 0.3 Fix region parsing scope (BUG-008)
**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
**Change**: Replace `root.findall(".//region")` with `root.findall("regions/region")`

---

### Phase 1: Composite PK Migration (Effort: 4-6 hours)

This is the critical architecture fix that enables multi-world correctness. Everything else is building on potentially corrupt data without this.

#### 1.1 Design composite PK schema

Transform all legends tables from `id INT PRIMARY KEY` to `PRIMARY KEY (world_id, id)`. This affects:

```
historical_figures    → PRIMARY KEY (world_id, id)
history_events        → PRIMARY KEY (world_id, id)
sites                 → PRIMARY KEY (world_id, id)
entities              → PRIMARY KEY (world_id, id)
artifacts             → PRIMARY KEY (world_id, id)
regions               → PRIMARY KEY (world_id, id)
underground_regions   → PRIMARY KEY (world_id, id)
history_event_collections → PRIMARY KEY (world_id, id)
identities            → PRIMARY KEY (world_id, id)
landmasses            → PRIMARY KEY (world_id, id)
mountain_peaks        → PRIMARY KEY (world_id, id)
world_constructions   → PRIMARY KEY (world_id, id)
```

#### 1.2 Update foreign key references

Tables that reference legends tables by single-column FK must add `world_id`:

```
structures          → REFERENCES sites(world_id, id)  ← PK becomes (world_id, site_id, id)
hf_links            → both hf_id and target_hf_id need (world_id, hf_id) refs
hf_entity_links     → hf_id needs (world_id, hf_id), entity_id needs (world_id, entity_id)
hf_site_links       → hf_id needs (world_id, hf_id), site_id needs (world_id, site_id)
collection_events   → both FKs need world_id prefix
collection_subcollections → both FKs need world_id prefix
event_relationships → source_hf, target_hf need world_id
```

**Design decision**: Should child tables carry their own `world_id`, or inherit it through the FK chain? Recommendation: **explicit `world_id` on every table**. This is denormalized but enables direct queries without JOINs and is consistent with the existing pattern (schema already has `world_id` on most tables).

#### 1.3 Update import pipeline

Modify `_batch_insert` default `on_conflict` from `"DO NOTHING"` to table-specific strategies:
- Legends tables: `ON CONFLICT (world_id, id) DO NOTHING` (idempotent re-import of same world)
- Link tables: `ON CONFLICT (world_id, hf_id, target_hf_id, link_type) DO NOTHING`
- `structures`: `ON CONFLICT (world_id, site_id, id) DO NOTHING`

#### 1.4 Update all storyteller queries

Every query in `context.py` that touches legends tables must include `world_id` in JOINs and WHEREs. Most already pass `world_id` as a parameter, so the changes are mechanical.

#### 1.5 Migration execution

Since there's no migration framework:
1. `pg_dump -Fc chronicler > chronicler-backup.dump`
2. Apply new schema.sql (DROP + CREATE)
3. Re-import all worlds from XML sources
4. Verify record counts match pre-migration totals (adjust for previously-lost records)

---

### Phase 2: Storyteller Enrichment (Effort: 3-4 hours)

The storyteller has basic live data retrieval but lacks the deep cross-referencing that makes narratives compelling.

#### 2.1 Relationship traversal on HF match

When an HF is found by name search, also query:
- `hf_links` → spouse, children, parents, master/apprentice
- `hf_entity_links` → civilization memberships, position titles
- `hf_site_links` → residences, lairs, associated sites

This enables "Tell me about Urist's family" to return actual family data instead of forcing LLM fabrication.

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py`
**Location**: After the HF name-match block (around line 200), add relationship queries.

#### 2.2 Event payload enrichment

When events are returned for an HF, JOIN to resolve IDs into names:
```sql
SELECT he.year, he.event_type,
       hf1.name as subject, hf2.name as object, s.name as site_name
FROM history_events he
LEFT JOIN historical_figures hf1 ON he.hf_id_1 = hf1.id AND he.world_id = hf1.world_id
LEFT JOIN historical_figures hf2 ON he.hf_id_2 = hf2.id AND he.world_id = hf2.world_id
LEFT JOIN sites s ON he.site_id = s.id AND he.world_id = s.world_id
WHERE (he.hf_id_1 = $1 OR he.hf_id_2 = $1) AND he.world_id = $2
ORDER BY he.year DESC LIMIT 10
```

This transforms "event type=hf died, hf_id_1=5678, hf_id_2=1234" into "Bomrek was slain by Urist at Goldenhall in year 253."

**File**: `context.py`, modify the event-fetch query inside name-match results.

#### 2.3 Emotion and zone data in live unit queries

The storyteller's `_retrieve_live_units()` already queries the `units` table but doesn't pull emotion or zone data from `lua_probes`. Add:
- Query latest `dwarf_emotions` probe, match emotions to unit IDs
- Query latest `zones` probe, resolve unit positions to zone names
- Include resolved location and top emotion in unit text formatting

**File**: `context.py`, enhance `_retrieve_live_units()`.

#### 2.4 War name resolution

When war/battle collections are returned, JOIN attacker_entity_id and defender_entity_id to `entities.name`:
```sql
SELECT hec.name, hec.start_year, hec.end_year,
       a.name as attacker, d.name as defender
FROM history_event_collections hec
LEFT JOIN entities a ON hec.attacker_entity_id = a.id AND hec.world_id = a.world_id
LEFT JOIN entities d ON hec.defender_entity_id = d.id AND hec.world_id = d.world_id
WHERE hec.world_id = $1 AND hec.type = 'war'
ORDER BY hec.start_year DESC LIMIT 10
```

**File**: `context.py`, modify `_run_category_query()` for `collection_type` route.

#### 2.5 Confidence signaling

Add data density awareness to the system prompt:
- Count total context records and chars
- If sparse (< 3 records or < 500 chars), prepend a note: "Context is limited — note uncertainty in your response"
- If rich (> 10 records), prepend: "Rich context available — synthesize comprehensively"

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/prompts.py`, modify `format_context()`.

---

### Phase 3: XML Completeness (Effort: 2-3 hours)

#### 3.1 Verify region parsing

Test `_parse_regions()` against actual XML to confirm `.//region` doesn't capture spurious elements. If it does, fix scoping per BUG-008.

#### 3.2 Add `written_contents` table and parser

Schema:
```sql
CREATE TABLE IF NOT EXISTS written_contents (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    title       TEXT,
    author_hf_id INT,
    type        TEXT,
    form_id     INT,
    year        INT,
    details     JSONB DEFAULT '{}',
    PRIMARY KEY (world_id, id)
);
```

Parser: Add `_parse_written_contents()` reading from legends_plus.xml.

**Storytelling value**: "Urist composed 'The Ballad of the Flaming Hammers' in year 237" — adds cultural depth.

#### 3.3 Add `historical_eras` table and parser

Schema:
```sql
CREATE TABLE IF NOT EXISTS historical_eras (
    id          INT,
    world_id    INT REFERENCES worlds(id),
    name        TEXT,
    type        TEXT,
    start_year  INT,
    end_year    INT,
    PRIMARY KEY (world_id, id)
);
```

Parser: Add `_parse_historical_eras()` reading from legends.xml.

**Storytelling value**: Provides temporal context — "During the Age of Myths (years 1-200)..." Enables era-aware narration.

#### 3.4 Add `entity_populations` parsing (optional)

Lower priority — tracks population counts per entity per site. Useful for "how many elves live in the forest?" but not critical for narrative quality.

#### 3.5 Art forms (lowest priority)

`poetic_forms`, `musical_forms`, `dance_forms` — these are referenced by `written_contents` but have minimal standalone storytelling value. Implement only if written_contents parsing reveals frequent references.

---

### Phase 4: Operational Hardening (Effort: 4-6 hours)

#### 4.1 Core test suite

Create `/Users/nathanielcannon/Claude/Projects/DwarfCron/tests/` with:

| Test File | What It Tests | Priority |
|-----------|---------------|----------|
| `test_xml_parser.py` | Parsing correctness, boolean detection, field mapping | HIGH |
| `test_context.py` | Keyword extraction, category routing, query generation | HIGH |
| `test_detector.py` | Change detection across snapshots | MEDIUM |
| `test_bridge.py` | Bridge accessor parsing, version detection | MEDIUM |
| `test_schema.py` | Schema integrity, FK constraints, composite PKs | HIGH |

**Minimum viable test set**:
- Parse a small test XML with known deities/vampires, verify boolean flags
- Verify kill_count computation with known event data
- Verify keyword routing maps to correct query types
- Verify composite PK prevents cross-world collisions

#### 4.2 lua_probes cleanup

Add a periodic cleanup to the watcher poll loop:
```python
# After storing new probes, delete old ones (keep last N per probe_name)
await conn.execute("""
    DELETE FROM lua_probes
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY world_id, probe_name
                ORDER BY captured_at DESC
            ) AS rn
            FROM lua_probes
        ) sub WHERE rn <= $1
    )
""", keep_count)  # e.g., keep_count=10
```

Alternatively, if time-series analysis is valuable, add a configurable retention policy (e.g., keep all probes from last 24 hours, then keep only one per hour for older data).

#### 4.3 Bridge health monitoring

Add to watcher:
- Track consecutive bridge fetch failures
- Log warning after 3 failures
- Continue with core-only data (already handled by fallback logic)
- Resume bridge polling when HTTP server returns

#### 4.4 Migration framework consideration

For future schema changes, consider adding a lightweight migration system:
- `chronicler/db/migrations/` directory with numbered SQL files
- `migrations` table tracking applied migrations
- CLI command `chronicler migrate` to apply pending migrations

This is not urgent (the project is pre-1.0 with a single operator) but would reduce risk of future schema changes.

---

## Part IV: Assumptions Revised

### Original Assumptions → Corrections

| Original Assumption | Correction |
|---------------------|------------|
| "Bridge is v5 with 11 sections" | Bridge is **v6 with 16 sections** — all T1 and T2 bridge tasks are done |
| "Storyteller queries only legends tables" | Storyteller has **5 live data retrieval paths** with 23 keyword routes |
| "Boolean flags all FALSE" | **Fixed** — deities detected via spheres, vampires via interactions, etc. |
| "Site ownership all NULL" | **Fixed** — 1,145/1,899 World 2 sites have owners from legends_plus |
| "Change detector handles only 5 events" | Detector handles **11 event types** across core and bridge paths |
| "8000 char context budget" | Already **12,000 chars** |
| "The critical gap is missing features" | The critical gap is **data integrity** — composite PKs, kill_count, link dedup |
| "Phase 1 should be bridge expansion" | Phase 1 should be **schema migration** — everything else builds on corrupt foundations |

### New Assumptions (to verify)

| Assumption | Verification Needed |
|-----------|---------------------|
| `event_type = 'hf died'` matches DF XML output | Check actual XML event type text values |
| Region parsing captures spurious elements | Grep XML for `<region>` tags outside `<regions>` section |
| World 2 has ~28K HFs (5,466 lost = 19.5%) | Re-import World 2 in isolation and count |
| Written contents exist in our legends_plus XML | Check XML file for `<written_contents>` section |
| Kill count fix + re-computation is sufficient | Verify no cached/derived data depends on old kill_count values |

---

## Part V: Dependency Graph

```
Phase 0 (Quick Fixes)  ←─ No dependencies, do first
    │
    ├─ 0.1 kill_count fix
    ├─ 0.2 link table constraints
    └─ 0.3 region scope fix
    │
Phase 1 (Composite PKs)  ←─ Depends on Phase 0 (clean link tables first)
    │
    ├─ 1.1 Design new schema
    ├─ 1.2 Update FK references
    ├─ 1.3 Update import pipeline
    ├─ 1.4 Update storyteller queries
    └─ 1.5 Execute migration + re-import
    │
Phase 2 (Storyteller)  ←─ Depends on Phase 1 (queries need correct PKs)
    │
    ├─ 2.1 Relationship traversal
    ├─ 2.2 Event payload enrichment
    ├─ 2.3 Emotion/zone integration
    ├─ 2.4 War name resolution
    └─ 2.5 Confidence signaling
    │
Phase 3 (XML)  ←─ Independent of Phase 2, but use Phase 1 schema
    │
    ├─ 3.1 Verify region parsing
    ├─ 3.2 Written contents
    ├─ 3.3 Historical eras
    └─ 3.4-3.5 Optional (entity_populations, art forms)
    │
Phase 4 (Hardening)  ←─ After Phase 1-3 (test what's been built)
    │
    ├─ 4.1 Test suite
    ├─ 4.2 lua_probes cleanup
    ├─ 4.3 Bridge health monitoring
    └─ 4.4 Migration framework (optional)
```

---

## Appendix: File Inventory

| Component | Path | Lines |
|-----------|------|-------|
| Lua bridge (v6) | `.../DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua` | 922 |
| XML parser | `.../DwarfCron/chronicler/ingest/xml_parser.py` | 733 |
| Context retriever | `.../DwarfCron/chronicler/storyteller/context.py` | 723 |
| System prompts | `.../DwarfCron/chronicler/storyteller/prompts.py` | 93 |
| Watcher | `.../DwarfCron/chronicler/dfhack/watcher.py` | 355 |
| Change detector | `.../DwarfCron/chronicler/dfhack/detector.py` | 246 |
| Bridge accessor | `.../DwarfCron/chronicler/dfhack/bridge.py` | 308 |
| DB schema | `.../DwarfCron/chronicler/db/schema.sql` | 378 |
| Gap analysis | `.../Jarvis/projects/chronicler/reports/data-gap-analysis-2026-02-22.md` | 898 |
| This review | `.../Jarvis/projects/chronicler/reports/gap-closure-critical-review.md` | (this file) |

---

*Critical Review v1.0 — Session 32, 2026-02-22*
*Supersedes: `chronicler-gap-closure.md` (original plan)*
