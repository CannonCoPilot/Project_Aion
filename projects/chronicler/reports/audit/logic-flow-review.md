# Chronicler Logic Flow Analysis Report

**Date**: 2026-03-10  
**Reviewer**: Code Review Agent (Level 1)  
**Scope**: Full data pipeline — XML ingest, post-parse enrichment, API/explorer rendering, live sync  
**Codebase**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/`  
**Files Reviewed**: 11 core modules (~6,500 lines)

---

## Executive Summary

The Chronicler codebase is architecturally sound with clean separation between ingest, enrichment, API, and rendering layers. However, this analysis identified **4 critical**, **6 high**, **9 medium**, and **6 low** findings across data integrity, idempotency, transaction safety, and correctness domains. The most impactful issues are: duplicate rows on re-ingestion (serial PK tables with `ON CONFLICT DO NOTHING`), missing transaction boundaries in the XML parse pipeline, a crash-causing SQL error in global search, and structure name resolution returning wrong entities.

---

## Findings

### CRITICAL

#### C-01: Re-ingestion creates duplicate rows in 4 tables (serial PK + ON CONFLICT DO NOTHING)

- **Category**: Data Integrity / Idempotency
- **Files**:
  - `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/section_parsers.py:275-290` (hf_links)
  - `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/section_parsers.py:310-315` (hf_relationship_profiles)
  - `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/section_parsers.py:325-330` (hf_vague_relationships)
  - `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/section_parsers.py:510-530` (history_event_participants)
- **Schema**: `chronicler/schema.sql`
- **Issue**: Four tables use `id SERIAL PRIMARY KEY` as their only uniqueness constraint:
  - `hf_links` — serial PK, no UNIQUE on `(world_id, hf_id, link_type, target_hf_id, entity_id)`
  - `hf_relationship_profiles` — serial PK, no UNIQUE on `(world_id, hf_id, target_hf_id)`
  - `hf_vague_relationships` — serial PK, no UNIQUE on `(world_id, hf_id)` + details
  - `history_event_participants` — serial PK, no UNIQUE on `(world_id, event_id, hf_id, site_id, entity_id, region_id)`
  
  The section parsers use `ON CONFLICT DO NOTHING`, but since the only PK is the auto-incrementing serial, conflicts never occur. Every re-ingest of the same XML doubles the rows in these tables.
- **Consequence**: After N re-ingestions:
  - Population counts (denizens, member counts) are inflated because they JOIN through `hf_links`
  - Event participant queries return duplicate rows, inflating event counts used for importance scoring
  - Relationship breadth scores in `scoring.py` are wrong (counts duplicated links)
  - Civilization citizen/member counts in `civilizations.py` routes are wrong
- **Recommended Fix**: Add composite UNIQUE constraints to each table:
  ```sql
  -- hf_links: add UNIQUE
  ALTER TABLE hf_links ADD CONSTRAINT uq_hf_links 
    UNIQUE (world_id, hf_id, link_type, target_hf_id, entity_id);
  
  -- history_event_participants: add UNIQUE
  ALTER TABLE history_event_participants ADD CONSTRAINT uq_hep
    UNIQUE (world_id, event_id, hf_id, site_id, entity_id, region_id);
  
  -- hf_relationship_profiles: add UNIQUE
  ALTER TABLE hf_relationship_profiles ADD CONSTRAINT uq_hf_relprof
    UNIQUE (world_id, hf_id, target_hf_id);
  ```
  For `hf_vague_relationships`, consider a content hash or accept that re-ingest requires prior DELETE.

---

#### C-02: Global search crashes on `written_contents` and `eras` tables (missing column)

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py:249-253`
- **Issue**: The `global_search` function hardcodes `importance_score` in the SELECT and ORDER BY for all entity types:
  ```python
  rows = await conn.fetch(f"""
      SELECT id, {display_col} AS display_name,
             importance_score
      FROM {config['table']}
      WHERE world_id = $1 AND ({where_search})
      ORDER BY importance_score DESC NULLS LAST
      LIMIT {limit}
  """, world_id, f"%{query}%")
  ```
  But `written_contents` and `eras` tables have no `importance_score` column. The schema confirms:
  - `written_contents`: columns are `world_id, id, title, content_type, author_hf_id, details`
  - `eras`: columns are `world_id, id, name, start_year, end_year, details`
- **Consequence**: Any search query that matches written contents or eras triggers an asyncpg `UndefinedColumnError`, crashing the search endpoint. Since the loop iterates ALL entity types, even a search that would only match HFs will fail when it reaches the written_contents/eras iterations.
- **Recommended Fix**: Use `importance_score` only when the table has it:
  ```python
  has_score = "importance_score" in config["columns"]
  score_select = "importance_score" if has_score else "0 AS importance_score"
  score_order = "importance_score DESC NULLS LAST" if has_score else "id"
  ```

---

#### C-03: No transaction boundary around XML parse — partial data on failure

- **Category**: Transaction Boundaries / Data Integrity
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py:77-120`
- **Issue**: The `parse_legends_xml` function acquires a single connection and runs all batch inserts via `executemany`. Each `executemany` call runs in its own implicit transaction. If the parse fails midway (e.g., on section 12 of 19), the database contains:
  - Complete data for sections 1-11
  - Partial data for section 12
  - No data for sections 13-19
  
  There is no wrapping transaction and no rollback capability.
- **Consequence**: The post-parse pipeline runs on incomplete data. Importance scores, denizen counts, and relationship derivations are computed on a partial dataset. The user sees an apparently successful ingest (some tables populated) with silently missing data. Re-running requires a full DB wipe (per MEMORY.md: `DROP SCHEMA public CASCADE`).
- **Recommended Fix**: Wrap the entire parse in an explicit transaction:
  ```python
  async with pool.acquire() as conn:
      async with conn.transaction():
          for event, elem in context:
              # ... all batch inserts happen within this transaction
  ```
  On failure, the entire parse rolls back cleanly.

---

#### C-04: Structure name resolution returns wrong entity (ambiguous key)

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/linking.py:62-72`
- **Issue**: The `resolve_name` function maps entity types to `(table, name_col, id_col)` and queries:
  ```python
  SELECT {name_col} FROM {table} WHERE world_id = $1 AND {id_col} = $2
  ```
  For structures, the mapping is `("structures", "name", "id")`. But the structures table has PK `(world_id, site_id, id)` — the local `id` is NOT unique within a world. Multiple sites can have structure id=0, id=1, etc.
  
  `fetchval` returns the first arbitrary match.
- **Consequence**: Event perspective rendering shows the wrong structure name. For example, an event at site A's temple (structure id=1) could display site B's tavern name (also structure id=1). This affects every event template that uses `{structure}` — approximately 6 templates including `razed_structure`, `created_structure`, `hf_profaned_structure`, etc.
- **Recommended Fix**: The perspective renderer already has `site_id` in the event details. Pass it through to `resolve_name` or use a specialized resolver:
  ```python
  # In linking.py, add structure-specific resolution:
  if entity_type == "structure":
      name = await conn.fetchval(
          "SELECT name FROM structures WHERE world_id = $1 AND site_id = $2 AND id = $3",
          world_id, site_id, entity_id
      )
  ```

---

### HIGH

#### H-01: XML parser exception handler silently swallows data loss

- **Category**: Data Integrity / Error Handling
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py:94-99`
- **Issue**: The inner loop has a broad `except Exception` that logs but continues:
  ```python
  except Exception:
      logger.exception("Error parsing element in section %s", section_tag)
      # Continue parsing — don't let one bad record kill the import
  ```
  This catches ALL exceptions including `asyncpg.InterfaceError` (connection lost), `MemoryError`, `KeyboardInterrupt` (in some contexts). The design intent (skip bad XML records) is correct, but the catch is too broad.
- **Consequence**: If the DB connection drops mid-parse, the parser silently skips ALL remaining records in that section, logging each as a "parse error." The user sees a successful completion with drastically low row counts. Combined with C-03 (no transaction), this creates a silently corrupt dataset.
- **Recommended Fix**: Catch only XML/value errors for record-level failures; let connection errors propagate:
  ```python
  except (ValueError, TypeError, etree.XMLSyntaxError) as e:
      logger.warning("Skipping bad record in %s: %s", section_tag, e)
  ```

---

#### H-02: Batch insert fallback loses error context and is non-transactional

- **Category**: Data Integrity / Error Handling  
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py:131-139`
- **Issue**: When `executemany` fails, the fallback inserts rows one-by-one:
  ```python
  for i, row in enumerate(rows):
      try:
          await conn.execute(sql, *row)
      except Exception:
          logger.exception("Row %d failed for %s: %s", i, table, row[:3])
  ```
  Problems:
  1. The failed `executemany` may have partially committed rows (no explicit transaction), so the row-by-row retry can create duplicates for tables with serial PKs (see C-01).
  2. The fallback continues even if every row fails, producing N exception logs.
  3. Failed rows are silently skipped — no count of failures is returned to the caller.
- **Consequence**: Partial data insertion with no visibility into how many rows were lost.
- **Recommended Fix**: Track failure count, abort if threshold exceeded, and wrap in a savepoint:
  ```python
  failures = 0
  for i, row in enumerate(rows):
      try:
          await conn.execute(sql, *row)
      except Exception:
          failures += 1
          if failures > len(rows) * 0.1:  # >10% failure rate
              raise RuntimeError(f"Too many failures in {table}")
  ```

---

#### H-03: Post-parse pipeline continues after step failure — dependent steps get wrong data

- **Category**: Data Integrity / Control Flow
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py:51-60`
- **Issue**: The pipeline catches exceptions per step and continues:
  ```python
  except Exception:
      elapsed = time.monotonic() - t0
      timings[name] = -round(elapsed, 3)  # negative = failed
      logger.exception("Post-parse step %s FAILED after %.3fs", name, elapsed)
      # Continue with remaining steps — some are independent
  ```
  But the steps have dependencies:
  - Step 5 (`derive_event_counts`) feeds Step 9 (`compute_importance_scores`)
  - Step 1 (`populate_relationships`) feeds Step 9 (relationship breadth scoring)
  - Step 10 (`compute_denizens`) depends on Step 1's `hf_links` data
  
  If Step 5 fails, Step 9 runs with stale/zero event counts, producing wrong importance scores.
- **Consequence**: Silently incorrect importance scores, population counts, or relationship data that persists in the DB.
- **Recommended Fix**: Define explicit dependencies and skip downstream steps when a dependency fails:
  ```python
  STEP_DEPS = {
      "compute_importance_scores": {"derive_event_counts", "populate_relationships"},
      "compute_denizens": {"populate_relationships"},
  }
  ```

---

#### H-04: Denizens computation includes `former_site_link` residents

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/denizens.py:30-47`
- **Issue**: The seed query for denizens includes both current and former site links:
  ```sql
  WHERE hl.link_type IN ('site_link', 'former_site_link')
  ```
  An HF with a `former_site_link` to site A and a `site_link` to site B gets counted as a denizen of BOTH sites. The `ON CONFLICT (world_id, site_id, hf_id) DO NOTHING` means the first link processed wins, which is nondeterministic.
- **Consequence**: Population counts are inflated. An HF who moved from site A to site B is counted in both. This cascades into:
  - Site detail page shows inflated population
  - Civilization citizen counts are inflated
  - Site importance scoring (which uses denizen count) is inflated
- **Recommended Fix**: Prefer `site_link` over `former_site_link`. If an HF has a current `site_link`, do not insert from `former_site_link`:
  ```sql
  -- Only seed from current site_links first
  INSERT INTO denizens ...
  FROM hf_links hl ... WHERE hl.link_type = 'site_link' ...
  
  -- Then add former_site_link only if no current link exists
  INSERT INTO denizens ...
  FROM hf_links hl ... WHERE hl.link_type = 'former_site_link'
    AND NOT EXISTS (SELECT 1 FROM denizens d WHERE d.world_id = hl.world_id AND d.hf_id = hl.hf_id)
  ```

---

#### H-05: Artifact holder determination ignores `artifact_lost` and `artifact_dropped` finality

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py:206-232`
- **Issue**: The artifact holder CTE uses `DISTINCT ON` ordered by year DESC to find the most recent holder event. The COALESCE chain tries `holder_hf_id` then `new_holder_hf_id`. But for `artifact_lost` and `artifact_dropped` events, neither field is set — there is no holder. The COALESCE returns NULL for both, meaning the UPDATE sets `current_holder_hf_id = NULL` and `current_holder_site_id = NULL`.
  
  However, these event types ARE in the filter list. If the most recent event is `artifact_lost`, the CTE correctly finds it but the JOIN produces a NULL holder update that overwrites a previous valid holder. This is actually the correct behavior.
  
  The real issue: `artifact_destroyed` is NOT in the event type list, so destroyed artifacts retain their last holder rather than being marked as destroyed.
- **Consequence**: Destroyed artifacts show a "current holder" on their detail page, which is misleading.
- **Recommended Fix**: Add `artifact_destroyed` to the event type list and set holder to a sentinel value or NULL.

---

#### H-06: Sync loop JSONB merge can overwrite XML-parsed data with sparse bridge data

- **Category**: Data Integrity / State Management
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/sync.py:131-145`
- **Issue**: The unit sync upsert merges details:
  ```sql
  details = COALESCE(historical_figures.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb)
  ```
  JSONB `||` is a shallow merge. If the bridge sends `{"current_job": "Mason"}` and the existing details from XML parsing contain `{"current_job": "Miner", "skills": [...], "personality": {...}}`, the merge correctly updates `current_job` but preserves other keys. However, if the bridge sends `{"skills": ["masonry"]}`, it REPLACES the entire `skills` array rather than merging it.
  
  More critically: the `name` and `race` fields use `COALESCE(EXCLUDED.name, historical_figures.name)` — if the bridge sends a NULL name (missing field), the existing name is preserved. But if it sends an empty string, the name is overwritten to empty.
- **Consequence**: Bridge sync can degrade rich XML-parsed data with sparse live data, especially for array/nested JSONB fields and empty-string fields.
- **Recommended Fix**: Validate bridge data before upsert — reject empty strings for name/race. For JSONB arrays, use `jsonb_set` for targeted updates rather than `||`.

---

### MEDIUM

#### M-01: Event detail page — related events query passes JSONB as $4 string parameter

- **Category**: Business Logic Correctness / Edge Case
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py:501-515`
- **Issue**: The related events query:
  ```sql
  (he.details->>'site_id')::int = (($4)::jsonb->>'site_id')::int
  ```
  Parameter `$4` is `event["details"]` which, thanks to the JSONB codec in `db.py`, is a Python dict. asyncpg will encode it as a JSONB value. The cast `($4)::jsonb` is redundant but not harmful. However, if the event has no `site_id` in its details, `(($4)::jsonb->>'site_id')::int` returns NULL, and the `=` comparison becomes `NULL = NULL` which is FALSE in SQL. The `OR` branch then runs the subquery, which is correct.
  
  The actual issue: if `event["details"]` is None (NULL in DB), `($4)::jsonb` fails with a cast error.
- **Consequence**: Crash on event detail page for events with NULL details column.
- **Recommended Fix**: Add a NULL guard: `AND event["details"] is not None` before query, or use `COALESCE($4, '{}'::jsonb)` in SQL.

---

#### M-02: HF detail page event query limited to 500 — no indication to user

- **Category**: Edge Case / UX
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py:87-92`
- **Issue**: Events are limited to 500 per entity across all detail pages. For high-importance HFs (deities, long-lived leaders), event counts can exceed 1,000. The template receives a truncated list with no indication that events were cut off.
- **Consequence**: Users see an incomplete event timeline without knowing it's truncated. Important events (like death) could be missing if they're beyond the 500th chronologically.
- **Recommended Fix**: Return the total count alongside the results and display a "showing 500 of N events" message. Or paginate.

---

#### M-03: browse_entities — race_filter and race config filter can conflict

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/explorer.py:198-207`
- **Issue**: The HF entity type has `"race"` in its `filters` list. The race_filter pill feature adds a second `race = $N` clause. If a user sends both `?race=dwarf&race_filter=elf`, the WHERE clause becomes `race = 'dwarf' AND race = 'elf'`, which always returns zero results.
- **Consequence**: Confusing zero-result pages when both filter mechanisms are used simultaneously.
- **Recommended Fix**: Either remove `race` from the HF filters list (use only race_filter) or merge them: if `race_filter` is set, skip the `race` config filter.

---

#### M-04: Eras table — SERIAL ID + ON CONFLICT DO NOTHING causes duplicates on re-ingest

- **Category**: Data Integrity / Idempotency
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/section_parsers.py:565-575`
- **Schema**: `eras` table uses `id SERIAL` with `ON CONFLICT DO NOTHING`
- **Issue**: Same pattern as C-01 but for eras. Re-ingestion creates duplicate era entries. Unlike hf_links (which has thousands of rows), eras typically number 3-10, so the impact is smaller but still incorrect.
- **Consequence**: Era browsing shows duplicates. Era detail pages may link to wrong era ID.
- **Recommended Fix**: Add UNIQUE constraint on `(world_id, name, start_year)` or use a natural PK.

---

#### M-05: Scoring — HF temporal span assumes 250 years for living figures

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py:60-64`
- **Issue**: 
  ```sql
  WHEN hf.birth_year >= 0
      THEN 250.0  -- still alive, assume full span
  ```
  This hardcoded 250-year assumption creates scoring bias. In a 50-year-old world, a living HF born in year 1 gets `temporal_span = 250` while a dead HF who lived 49 years gets `temporal_span = 49`. The living HF's normalized temporal score is 5x higher than it should be.
- **Consequence**: Living HFs are systematically overscored in young worlds. This distorts the "Top Historical Figures" ranking on the landing page.
- **Recommended Fix**: Use the world's current year instead of 250:
  ```sql
  WHEN hf.birth_year >= 0
      THEN (w.current_year - hf.birth_year)::float
  ```
  (Join to `worlds` table for `current_year`.)

---

#### M-06: Scoring — artifact scores mix normalized and flat values

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py:230-240`
- **Issue**: Artifact scoring uses:
  ```sql
  n.norm_events * 0.60 +
  n.holder_bonus * 0.20 +   -- flat bonus, not normalized
  n.subtype_bonus * 0.20
  ```
  `holder_bonus` is 0 or 20 (flat), and `subtype_bonus` is 0 or 10 (flat). With weights, an artifact with a holder and subtype gets `20*0.20 + 10*0.20 = 6` bonus points. An artifact with maximum events gets `100*0.60 = 60` points. So the maximum possible score is 66, not 100. No artifact can ever score above 66.
- **Consequence**: Artifact importance scores are compressed into 0-66 range instead of 0-100. This makes artifacts appear less important relative to other entity types in cross-type rankings.
- **Recommended Fix**: Normalize holder_bonus and subtype_bonus to 0-100 scale, or adjust weights so max = 100.

---

#### M-07: Entity scoring — `hf_links.link_type = 'member'` may not cover all membership types

- **Category**: Business Logic Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py:178-185`
- **Issue**: Entity member count uses `link_type = 'member'`. But HF-entity links from XML include types like `'position'`, `'prisoner'`, `'enemy'`, `'squad'`, etc. These are excluded from the member count, which may or may not be intentional.
- **Consequence**: Entities with many position-holders but few explicit members get underscored. This particularly affects small site governments where the leader has a `position` link, not a `member` link.
- **Recommended Fix**: Clarify intent. If all HF-entity links should count toward entity importance, broaden the filter. If only formal membership should count, document the decision.

---

#### M-08: Denizens — dead HFs removed but death_year check misses sentinel value

- **Category**: Edge Case
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/denizens.py:50-56`
- **Issue**: The dead HF removal query:
  ```sql
  DELETE FROM denizens d
  USING historical_figures hf
  WHERE d.world_id = $1
    AND d.hf_id = hf.id
    AND d.world_id = hf.world_id
    AND hf.death_year > 0
  ```
  DF uses `-1` as the sentinel for "alive" (per the module docstring and xml_parser comments). This query correctly removes HFs with `death_year > 0`. But if an HF has `death_year = 0` (died in year 0, which is valid in DF), they are NOT removed from denizens.
- **Consequence**: HFs who died in year 0 of the world appear as living denizens.
- **Recommended Fix**: Change to `hf.death_year >= 0` or `hf.death_year != -1` to handle year-0 deaths.

---

#### M-09: Post-parse entity-entity links — strength increment not idempotent

- **Category**: Idempotency
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py:361-380`
- **Issue**: The event-derived entity-entity links use:
  ```sql
  ON CONFLICT ... DO UPDATE SET strength = entity_entity_links.strength + 1
  ```
  Each re-run of `run_post_parse` increments strength by 1 for every matching event, regardless of whether this step already ran. After N post-parse runs, strength values are N times too high.
- **Consequence**: Entity-entity link strengths grow unboundedly on repeated post-parse runs, distorting any UI that displays link strength.
- **Recommended Fix**: Either:
  1. DELETE event-derived entity_entity_links before re-inserting, or
  2. Use `SET strength = EXCLUDED.strength` (count from events, not increment), or
  3. Track which rows were event-derived vs XML-parsed with a `source` column.

---

### LOW

#### L-01: Connection pool uses private `_closed` attribute

- **Category**: State Management / Maintainability
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db.py:21`
- **Issue**: `if _pool is None or _pool._closed:` accesses a private attribute of asyncpg's Pool class. This could break on asyncpg version upgrades.
- **Consequence**: Silent pool recreation failures on asyncpg upgrade.
- **Recommended Fix**: Use try/except around pool operations or check with a public API method.

---

#### L-02: Perspective renderer — `hf_gains_secret_goal` template defined twice

- **Category**: Dead Code
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/perspective.py` (lines ~47 and ~195)
- **Issue**: The `EVENT_TEMPLATES` dict defines `hf_gains_secret_goal` twice:
  ```python
  "hf_gains_secret_goal": "{hf} gained the secret goal of {goal} in {year}",  # line ~47
  ...
  "hf_gains_secret_goal": "{hf} gained the secret goal of {goal} in {year}",  # line ~195
  ```
  Python dicts silently keep the last value. Both definitions are identical, so no functional impact.
- **Consequence**: None (cosmetic duplication).
- **Recommended Fix**: Remove the duplicate.

---

#### L-03: Name resolution for creature_dictionary would fail with world_id filter

- **Category**: Edge Case
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/linking.py:20-31`
- **Issue**: `creature_dictionary` is not in the `NAME_RESOLUTION` map (correctly), so `resolve_name(conn, world_id, "creature", id)` returns the fallback string. But if someone adds it naively with `world_id` in the query, it would fail because `creature_dictionary` has no `world_id` column.
- **Consequence**: No current impact. Latent risk if creature resolution is added without accounting for the schema difference.
- **Recommended Fix**: Add a comment documenting that creature_dictionary is world-independent.

---

#### L-04: detail_pages — creature_detail queries without world_id

- **Category**: Correctness
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/api/routes/detail_pages.py` (creature_detail route)
- **Issue**: The creature detail route correctly queries `creature_dictionary` without `world_id` (since the table has none), but uses `world_id` when querying HFs of that race. This is correct behavior. However, the URL scheme `/explorer/creature/{creature_id}` uses the serial `id` of creature_dictionary, while all other entity types use the DF XML `id` within a world. This inconsistency could confuse API consumers.
- **Consequence**: Minor API inconsistency.
- **Recommended Fix**: Document the distinction or consider using `race` as the URL parameter instead of numeric ID.

---

#### L-05: Watcher — filesystem polling instead of event-based monitoring

- **Category**: State Management
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/watcher.py:60-85`
- **Issue**: Despite the docstring mentioning watchdog, the implementation uses manual polling with `glob` + `stat` every 5 seconds. This is functional but not optimal for detecting rapid file changes.
- **Consequence**: Up to 5 seconds of latency for detecting new legends files. Acceptable for the use case.
- **Recommended Fix**: Low priority. Could switch to watchdog if latency becomes an issue.

---

#### L-06: Perspective renderer — details parsed as JSON string fallback

- **Category**: Edge Case / Defensive Code
- **File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/perspective.py:252-255`
- **Issue**: The renderer has a fallback for string-type details:
  ```python
  if isinstance(details, str):
      import json
      details = json.loads(details)
  ```
  The `import json` inside a function is a minor performance hit on every call. More importantly, since `db.py` registers a JSONB codec that auto-decodes, this branch should never execute for normal DB reads.
- **Consequence**: Negligible performance impact. The branch exists as defensive code for dict-mode calls.
- **Recommended Fix**: Move the import to module level. Consider removing the branch if it's truly unreachable.

---

## Summary Table

| ID | Severity | Category | File | Summary |
|----|----------|----------|------|---------|
| C-01 | CRITICAL | Data Integrity | section_parsers.py, schema.sql | Re-ingest duplicates in 4 serial-PK tables |
| C-02 | CRITICAL | Correctness | explorer.py:249 | Global search crashes on tables without importance_score |
| C-03 | CRITICAL | Transaction | xml_parser.py:77 | No transaction boundary — partial data on failure |
| C-04 | CRITICAL | Correctness | linking.py:62 | Structure name resolution returns wrong entity |
| H-01 | HIGH | Error Handling | xml_parser.py:94 | Broad except swallows connection errors |
| H-02 | HIGH | Error Handling | xml_parser.py:131 | Batch fallback non-transactional, loses context |
| H-03 | HIGH | Control Flow | post_parse.py:51 | Dependent pipeline steps run after failure |
| H-04 | HIGH | Correctness | denizens.py:30 | Former site links inflate population counts |
| H-05 | HIGH | Correctness | post_parse.py:206 | Destroyed artifacts retain stale holder |
| H-06 | HIGH | Data Integrity | sync.py:131 | JSONB shallow merge can overwrite rich data |
| M-01 | MEDIUM | Edge Case | detail_pages.py:501 | Related events query crashes on NULL details |
| M-02 | MEDIUM | Edge Case | detail_pages.py:87 | 500-event limit with no user indication |
| M-03 | MEDIUM | Correctness | explorer.py:198 | Dual race filter produces zero results |
| M-04 | MEDIUM | Idempotency | section_parsers.py:565 | Eras duplicate on re-ingest |
| M-05 | MEDIUM | Correctness | scoring.py:60 | 250-year temporal assumption biases scoring |
| M-06 | MEDIUM | Correctness | scoring.py:230 | Artifact scores capped at 66/100 |
| M-07 | MEDIUM | Correctness | scoring.py:178 | Member count filter may miss link types |
| M-08 | MEDIUM | Edge Case | denizens.py:50 | Year-0 deaths not removed from denizens |
| M-09 | MEDIUM | Idempotency | post_parse.py:361 | Entity-entity strength increments unboundedly |
| L-01 | LOW | Maintainability | db.py:21 | Private attribute access on pool |
| L-02 | LOW | Dead Code | perspective.py | Duplicate template key |
| L-03 | LOW | Edge Case | linking.py:20 | creature_dictionary world_id latent risk |
| L-04 | LOW | Correctness | detail_pages.py | creature URL scheme inconsistency |
| L-05 | LOW | State Mgmt | watcher.py:60 | Polling instead of event-based watching |
| L-06 | LOW | Edge Case | perspective.py:252 | Inline json import in hot path |

---

## Positive Observations

1. **Idempotent post-parse design**: Steps 1-8 correctly use `ON CONFLICT DO UPDATE/NOTHING` patterns for tables with proper composite keys (relationships, entity_entity_links, entity_site_links, collection_events, event_relationships).

2. **Memory-efficient XML parsing**: The iterparse + `elem.clear()` + sibling deletion pattern correctly manages memory for multi-GB XML files.

3. **Name caching in perspective renderer**: The `NameCache` class with cross-call sharing via `name_cache` dict avoids N+1 query patterns when rendering 500 events.

4. **HTML escaping in linkify**: Proper escaping of `&`, `<`, `>`, `"` prevents XSS in entity names.

5. **Sort column validation in browse**: The `valid_columns` check prevents SQL injection through the sort parameter.

6. **Graceful sync loop**: Consecutive error tracking with exponential backoff is well-designed for the bridge polling use case.

7. **SafeFormatMap**: Prevents `KeyError` crashes on unknown template placeholders by returning `[key]` — much better than crashing.

---

## Recommended Fix Priority

1. **C-01 + M-04** (re-ingest duplicates): Add UNIQUE constraints to serial-PK tables. This is the highest-impact fix because it affects correctness of all downstream computations (scores, counts, populations).

2. **C-02** (search crash): Simple fix, high visibility — search is a core feature.

3. **C-04** (structure resolution): Pass site_id through to resolver. Affects display correctness for ~6 event templates.

4. **C-03** (transaction boundary): Wrap parse in explicit transaction. Requires testing with large XML files to ensure memory/connection stability.

5. **H-04** (former_site_link): Fix denizen seeding to prefer current links. Directly affects population accuracy.

6. **M-09** (strength increment): Make post-parse entity links idempotent. Quick fix with DELETE before INSERT or SET instead of increment.

7. **Remaining HIGH/MEDIUM**: Address in subsequent passes based on user priority.
