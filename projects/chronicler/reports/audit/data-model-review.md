# Data Model Review — Chronicler CDM

**Date**: 2026-03-10
**Reviewer**: Jarvis Code Review Agent (Opus 4.6)
**Schema**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`
**Score**: 7/10

---

## Executive Summary

The Chronicler CDM schema demonstrates a pragmatic, well-structured design for Dwarf Fortress data. The composite PK strategy `(world_id, id)` is consistent across all XML-sourced entity tables, with SERIAL PKs used appropriately for junction tables and entities without XML IDs. The JSONB `details` overflow pattern handles DF's highly variable data elegantly. Key gaps include zero secondary indexes (no `CREATE INDEX` beyond PKs/UNIQUEs), no migration framework, and JSONB query performance bottlenecks that will worsen at scale.

---

## Methodology

1. Full review of `chronicler/db/schema.sql`
2. Review of `chronicler/db/sync.py` for INSERT/upsert patterns
3. Review of `chronicler/db/queries.py` for query patterns against schema
4. Review of `chronicler/ingest/enrichment.py` / `post_parse.py` for derived data
5. PK consistency analysis across all tables

---

## Findings

### DM-001 — Dead Code in `_build_upsert_sql` for `creature_dictionary` [CRITICAL]

**File**: `chronicler/db/sync.py:215-224`

The `creature_dictionary` upsert branch is unreachable dead code — the function has an early `return` at line 214 for the default case, so the creature_dictionary block never executes. The table is actually populated via `enrichment.py` which uses its own SQL, so this is non-blocking but signals broken routing in sync.py.

**Fix**: Remove the dead code. If `creature_dictionary` ever needs `sync_table()`, add it to `UNIQUE_CONSTRAINT_TABLES`.

---

### DM-002 — No Migration Framework [HIGH]

**File**: `chronicler/db/` (no migrations directory)

Schema managed as a single `schema.sql` with `CREATE TABLE IF NOT EXISTS`. No versioned migrations, no rollback capability, no schema version tracking. Stage 3.0 applied V1-V4 changes as direct SQL tracked only in planning docs.

**Impact**: Schema changes require DROP+recreate or manual ALTER. No audit trail of deployed schema version.

**Fix**: Add lightweight migration system (numbered SQL files + `schema_version` tracking table). Alternatively adopt Alembic if moving to SQLAlchemy.

---

### DM-003 — Missing FK Indexes on JSONB-Referenced Event Lookups [HIGH]

**File**: `chronicler/db/queries.py:330-343`

The `get_historical_figure()` queries events by scanning 12 different JSONB `details->>` fields with OR conditions. No indexes exist on any `details->>` expressions. With ~500K events, every HF detail page does a sequential scan.

**Fix**: Create GIN index: `CREATE INDEX idx_events_details_gin ON history_events USING GIN (details jsonb_path_ops);`

---

### DM-004 — No GIN Indexes on JSONB `details` Columns [HIGH]

**File**: `chronicler/db/schema.sql` (index section)

Every table has a JSONB `details` column. Zero GIN indexes exist. The `history_events.details` column is the most queried (500K+ rows, 12-18 JSONB key lookups per detail page).

**Fix**: Add GIN index at minimum for `history_events`. Consider for `historical_figures` and `entities`.

---

### DM-005 — HF Event Query Performance (Biggest Bottleneck) [HIGH]

**File**: `chronicler/db/queries.py:316-348`

The HF detail page event query uses 12-18 `OR` conditions on JSONB expressions. This is the single biggest performance bottleneck in the Explorer. Two fix options:

1. **Materialized junction table**: `hf_event_links(world_id, hfid, event_id, role)` populated during enrichment
2. **GIN index + containment query**: Rewrite to `details @> '{"hfid": N}'::jsonb`

Option 1 preferred for Phase 3+ where event counts grow with live bridge data.

---

### DM-006 — COALESCE Hack in `hf_site_links` UNIQUE Constraint [MEDIUM]

**File**: `chronicler/db/schema.sql:222`

`UNIQUE(world_id, hfid, site_id, link_type, COALESCE(sub_id, -1))` — sentinel value -1 could theoretically collide. Use `NULLS NOT DISTINCT` (PG15+) or document clearly.

---

### DM-007 — Missing FK Constraints on Link Tables [MEDIUM]

**File**: `chronicler/db/schema.sql`

Multiple link tables (`hf_links`, `hf_entity_links`, `hf_site_links`, `entity_entity_links`, `entity_site_links`, `entity_populations`, `event_relationships`, `site_structures`) reference entity IDs without FK constraints. Likely intentional (DF XML has forward references and partial data). The RI check in enrichment compensates.

**Fix**: Document the intentional absence of FKs. Consider deferred FK constraints for post-ingestion validation.

---

### DM-008 — `entity_site_links` Missing Temporal Columns in Sync [MEDIUM]

**File**: `chronicler/db/sync.py:49`

Schema defines `start_year` and `end_year` on `entity_site_links`, but sync `TABLE_COLUMNS` omits them. XML-parsed links with temporal data lose it.

**Fix**: Add `"start_year", "end_year"` to the `entity_site_links` entry in `TABLE_COLUMNS`.

---

### DM-009 — `entity_populations` Lacks Temporal Dimension [MEDIUM]

**File**: `chronicler/db/schema.sql:140-149`

No timestamp or snapshot indicator. Phase 3 live bridge updates will overwrite previous counts with no history.

**Fix**: Add `snapshot_year INTEGER` or `snapshot_at TIMESTAMPTZ` column.

---

### DM-010 — Hardcoded SENTIENT_RACES [MEDIUM]

**File**: `chronicler/ingest/enrichment.py:50-62`

~15 hardcoded races. Modded DF worlds may have additional sentient races.

**Fix**: Acceptable for vanilla DF (current scope). Phase 7: allow user config. Phase 3: consider parsing creature raws from DFHack.

---

### DM-011 — Inconsistent PK Strategy [LOW]

**Files**: `chronicler/db/schema.sql:263,280`

`rivers` and `historical_eras` use SERIAL PK (no XML IDs) while most tables use composite `(world_id, id)`. This is correct behavior but undocumented.

**Fix**: Document PK strategy in schema.sql header comments.

---

### DM-012 — `cur_site_id` Has No FK or Index [LOW]

**File**: `chronicler/db/schema.sql:185`

Phase 3 forward-looking column, currently always NULL.

**Fix**: Add partial index when Phase 3 populates it.

---

## PK Consistency Analysis

| PK Type | Count | Tables |
|---------|-------|--------|
| Composite `(world_id, id)` | 17 | regions, sites, artifacts, entities, historical_figures, history_events, etc. |
| Triple composite | 2 | site_structures, event_collection_events |
| SERIAL + UNIQUE | 6 | hf_links, hf_entity_links, hf_site_links, entity_entity_links, entity_site_links, creature_dictionary |
| SERIAL only | 6 | worlds, rivers, historical_eras, worldgen_snapshots, knowledge_horizon, embeddings |

**Assessment**: Consistent within each category. Division is logical.

---

## Phase 3 Readiness Assessment

**Verdict: CONDITIONAL PASS**

Must-fix before Phase 3:
1. **DM-003/DM-004**: Add GIN indexes on `history_events.details` — live bridge will add events, worsening scan performance
2. **DM-002**: Migration framework needed — Phase 3 adds tables/columns incrementally
3. **DM-009**: Temporal dimension for `entity_populations` — live bridge updates need history

Should-fix:
4. **DM-008**: Sync temporal columns for `entity_site_links`
5. **DM-005**: Event-figure junction table for scalable event lookups
