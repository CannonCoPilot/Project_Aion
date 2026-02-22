# Reflection Report — 2026-02-22 (Session 32b, Post-JICM)

## Summary
- Corrections analyzed: 4 (this segment)
- Problems identified: 2
- Proposals generated: 1
- Planning tracker: N/A (quick depth)

## Session Work Analyzed

This segment focused on Phase 4 of the Chronicler Gap Closure plan: fixing the XML parser's boolean flag detection and site ownership parsing.

**Key accomplishment**: Identified root cause of all-FALSE boolean flags across 49,855+ historical figures — the parser was looking for XML tags that don't exist in DF legends exports (`<deity>`, `<force>`, `<ghost>`) and checking `associated_type` for supernatural types (it only contains professions like STANDARD, HUNTER, etc.).

**Fix**: Replaced with correct detection patterns (spheres for deities, DEITY_MAJOR_CURSE for vampires, SECRET knowledge for necromancers, DEITY_CURSE_WEREBEAST for werebeasts). Result: 1,865 supernatural HFs now properly flagged + details JSONB enriched with sphere/interaction data.

## Self-Corrections (This Segment)

| # | Category | What Happened | Lesson |
|---|----------|--------------|--------|
| 1 | tool-use | Used `infrastructure/.venv` then tried `psycopg2`/`psycopg` — project uses `asyncpg` via DwarfCron venv | Always use the project's own venv; check imports in the project code first |
| 2 | tool-use | Used `grep -P` (PCRE flag) on macOS which doesn't support it | macOS grep is BSD, not GNU. Use `grep -oE` or `awk` for extended regex |
| 3 | efficiency | Didn't use `LC_ALL=C` initially for CP437-encoded XML, causing awk multibyte failures | Always set `LC_ALL=C` when processing non-UTF-8 files on macOS |
| 4 | efficiency | Ran XML parse to count deities (1,300) but DB update only showed 6 — didn't initially account for PK collision between worlds | Check schema constraints before assuming UPDATE will match all parsed records |

## Patterns Observed

### Pattern: Schema assumptions cause data surprises
The `historical_figures` table uses `id INT PRIMARY KEY` without `world_id` in the composite key. This caused World 2's import to silently skip 5,466 HFs (including 1,294 deities) that collided with World 1 IDs. The `ON CONFLICT DO NOTHING` made this invisible until now.

**Recurrence risk**: Medium. Any multi-world table with simple `id` PK has this issue.

### Pattern: DF XML structure differs from documentation assumptions
The parser was written based on assumed XML tag names (`<deity>`, `<force>`, `<ghost>`) rather than empirical investigation of the actual XML structure. The real structure uses `<sphere>` for deities, `<active_interaction>` for vampires/werebeasts, and `<interaction_knowledge>` for necromancers.

**Lesson**: Always inspect actual data before writing parsers. `grep` + `sort | uniq -c` on the source data reveals structure faster than reading documentation.

## Things Done Well

1. **Methodical investigation** — checked XML tag structure systematically before coding the fix
2. **Targeted UPDATE** instead of full re-import — safer and faster
3. **Enriched beyond requirements** — added details JSONB with spheres/interactions/knowledge for future queries
4. **End-to-end validation** — tested parser → DB update → storyteller retrieval → format output
5. **Logical commit units** — Phase 4 parser fix separate from Phase 1-3 bridge/watcher changes

## Evolution Proposal

### REFL-026: Migrate Historical Figures to Composite Primary Key (world_id, id) [HIGH]
**Problem**: The `historical_figures` table uses `id INT PRIMARY KEY` without `world_id` in the composite key. When World 2 was imported with `ON CONFLICT DO NOTHING`, 5,466 HFs (including 1,294 deities) silently collided with World 1 IDs and were dropped. This is invisible at ingest time — the only signal was a count mismatch discovered during validation.

**Recurrence risk**: Every multi-world table with a simple `id` PK has this problem. Tables affected: `historical_figures`, `entities`, `sites`, `regions`, `artifacts`, `written_contents`, `event_collections`. Any future world import will silently overwrite or skip data.

**Proposal**: Migrate all CDM tables to composite primary keys `(world_id, id)`. Update all foreign key references accordingly. Re-import World 2 data after migration.

**Implementation**:
1. Generate migration script: `ALTER TABLE ... DROP CONSTRAINT ... ADD PRIMARY KEY (world_id, id)`
2. Update all FK references (e.g., `hf_links.hf_id` → `(world_id, hf_id)`)
3. Update Python model layer (`chronicler/models/`) with composite PKs
4. Update storyteller context queries to include `world_id` filter
5. Re-import World 2 legends XML
6. Validate: count comparison between XML parse and DB records per world

**Effort**: Medium-High (schema migration + model updates + re-import + validation)

---

## Next Steps

1. Deploy bridge v6 to HomeServer (Phase 1 validation)
2. Run watcher to validate Phase 2 live data capture
3. Implement REFL-026 (composite PK migration) to recover 5,466 missing World 2 HFs
4. Phase 4.3-4.4 (region parsing, written contents, eras) — lower priority
