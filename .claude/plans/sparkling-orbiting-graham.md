# Unified Prominence & Salience Scoring System — Implementation Plan

## Context

The User asked for a comprehensive expansion of the Prominence and Salience scoring system beyond the initial artwork-focused design (`artwork-scoring-design.md`). The current scoring module (`scoring.py`, 719 lines) scores 7 entity types but has gaps: 7 entity types are unscored, HF scoring ignores 8 available CDM signals, and a pipeline ordering bug causes entity scores to be zero on fresh imports. This plan unifies all scoring into a single coherent system.

**Deliverables**:
1. Comprehensive design document: `projects/chronicler/reports/unified-scoring-design.md`
2. Full implementation: schema + parser fix + pipeline fix + scoring module expansion + UI updates

---

## Step 1: Design Document

Write `Jarvis/projects/chronicler/reports/unified-scoring-design.md` documenting all formulas for all 14 entity types. This supersedes `artwork-scoring-design.md` (which becomes a historical reference). The document covers every formula, normalization strategy, and data dependency.

---

## Step 2: Schema Migrations

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`

Add scoring columns to 7 tables + 2 boolean flags on HFs:

| Table | Columns to Add |
|-------|----------------|
| `written_contents` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `art_forms` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `structures` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `history_event_collections` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `underground_regions` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `landmasses` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `mountain_peaks` | `prominence_score REAL DEFAULT 0`, `salience_score REAL DEFAULT 0` |
| `historical_figures` | `is_author BOOLEAN DEFAULT FALSE`, `is_auteur BOOLEAN DEFAULT FALSE` |

Also create a migration SQL file for existing databases and bake columns into `schema.sql` CREATE TABLE blocks for fresh installs.

---

## Step 3: Parser Fix

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`
**Function**: `_parse_artifacts()` (~line 401)

Capture the `<writing>` tag from artifact XML and store as `details->writing_id`. Currently the function sets `details = None`. Change to build a `details` dict when `<writing>` is present. ~5 lines changed.

---

## Step 4: Pipeline Reordering (Bug Fix)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/post_parse.py`
**Function**: `run_all()` (line 23)

Swap steps 7 and 8 so `event_entity_xref` is built BEFORE scoring reads it:
```
step_7 → build_event_entity_xref (was step_8)
step_8 → calculate_importance_scores (was step_7)
```

This fixes the bug where entity IDF scores are zero on fresh imports because `event_entity_xref` was empty when scoring queried it.

---

## Step 5: Enhance HF Scoring (8 New Signals)

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py`

Add 8 signals already in the CDM but unused in scoring:

### Prominence additions:
- **Skill breadth/depth**: `LEAST(skill_count * 2 + max_skill_ip / 5000, 80)` — from `skills` JSONB
- **Masterpiece events**: count of `masterpiece_created_*` events × 10

### Salience additions:
- **Sphere count**: `sphere_count * 10` — from `spheres TEXT[]`
- **Goals**: `goal_count * 5` — from `goals` JSONB
- **Entity reputations**: Hero/Monster/Murderer = ×20; others = ×5 — from `entity_reputations` JSONB
- **Intrigue actors**: `intrigue_count * 15` — from `intrigue_actors` JSONB
- **Used identities**: `identity_count * 10` — from `used_identities` JSONB
- **Vague relationships**: `LEAST(vague_rel_count * 3, 30)` — from `details->'vague_relationships'`

Implementation uses CTEs to precompute JSONB-derived values to avoid per-row subqueries on 48K HFs.

---

## Step 6: New Scoring Functions (7 Entity Types)

### 6a. Structures
- Prominence = TYPE_WEIGHT + event_count × 2 + has_deity × 20
- Salience = has_deity × 30 + TYPE_IS_MYSTERIOUS × 20
- Type hierarchy: temple/fortress (15) > tomb/dungeon (12) > mead_hall/library (10) > market (8) > guildhall (6) > shop (4)

### 6b. Event Collections (wars, sieges, etc.)
- Prominence = duration × TYPE_WEIGHT + sub_collection_count × 5 + event_count
- Salience = death_count × 5 + (war/insurrection/persecution bonus) × 20
- Duration weights: war (3.0), beast_attack/insurrection (2.0), site_conquered (2.0), battle (1.5)

### 6c. Written Contents (from artwork-scoring-design.md)
- Prominence = copy_num ladder (1-5): composed → inscribed → copied 1-3x
- Salience = (author_roll / 256) × (1 + style_count), range 0-3
- Requires parser fix (Step 3) for artifact→written_content linking

### 6d. Art Forms/Traditions (from artwork-scoring-design.md)
- Prominence = COUNT(DISTINCT author_hf_id) for works in this tradition
- Salience = AVG(written_content.salience_score) for works in tradition
- Computed after written content scoring (data dependency)

### 6e. Underground Regions
- Prominence = DEPTH_WEIGHT + tile_count × 0.5
- Salience = underworld(50) / magma(30) type bonus + event_count × 3

### 6f. Landmasses
- Prominence = normalized equally (limited signal data — typically 1-3 per world)
- Salience = evil_region_overlap × 10

### 6g. Mountain Peaks
- Prominence = height/100 + is_volcano × 50
- Salience = is_volcano × 30

---

## Step 7: Artwork → HF Bonus Integration

After art scoring (Step 6c/6d), compute HF bonuses:
- Set `is_author = TRUE` if any written_contents has `author_hf_id = hf.id`
- Set `is_auteur = TRUE` if HF created any art tradition (via form-created events)
- `author_prominence_bonus = SUM(copy_num)` of all authored works (capped at 200)
- `auteur_prominence_bonus = tradition_work_count / 10` (capped at 150)
- Add bonuses to HF prominence_score before normalization

---

## Step 8: Unified Normalization

Extract normalization into `_normalize_all_scores(conn, world_id)`. Normalize all 14 entity types (28 columns total) to 0.0-1.0 using the existing pattern:
```sql
UPDATE {table} SET {col} = {col} / NULLIF(
  (SELECT MAX({col}) FROM {table} WHERE world_id = $1), 0)
WHERE world_id = $1 AND {col} > 0
```

Tables: historical_figures, entities, sites, artifacts, regions, rivers, world_constructions, written_contents, art_forms, structures, history_event_collections, underground_regions, landmasses, mountain_peaks.

---

## Step 9: API/Template Updates

### Templates needing score display added:
- `written_content_detail.html` — Prominence + Salience in vital stats
- `art_form_detail.html` — Prominence + Salience in vital stats
- `collection_detail.html` — Prominence + Salience in vital stats
- `structure_detail.html` — Prominence + Salience in vital stats
- `underground_region_detail.html` — Prominence + Salience
- `landmass_detail.html` — Prominence + Salience
- `mountain_peak_detail.html` — Prominence + Salience

### Search ordering:
Update `detail_pages.py` to sort by `prominence_score DESC NULLS LAST` for entity types that have the column (currently some sort by kill_count or name).

---

## Step 10: Verification

1. Run `chronicler rescore --world-id=5` to populate all scores
2. SQL spot checks: top 10 HFs by salience (should include deities/vampires), top written works by prominence (multiply-copied), top event collections (wars)
3. Verify entity scores are non-zero (pipeline fix)
4. Visit each detail page type to confirm UI display
5. Performance target: rescore < 30s for 2M-event world

---

## Execution Order (Dependencies)

```
Step 1 (design doc) — independent, do first
Step 2 (schema) — must precede all scoring
Step 3 (parser fix) — must precede art scoring
Step 4 (pipeline fix) — must precede rescore verification
Steps 5-7 (scoring functions) — after schema; internal order:
  5 (HF enhancement) → 6c/6d (art) → 7 (HF art bonuses) → 8 (normalize)
  6a/6b/6e/6f/6g can run in any order
Step 9 (templates) — after schema columns exist
Step 10 (verification) — last
```

---

## Files Modified

| File | Change |
|------|--------|
| `chronicler/db/schema.sql` | Add columns to 7 tables + 2 HF flags |
| `chronicler/db/migrate_unified_scoring.sql` | New migration for existing DBs |
| `chronicler/ingest/xml_parser.py` | Capture `<writing>` tag (~5 lines) |
| `chronicler/ingest/post_parse.py` | Swap steps 7/8 (~4 lines) |
| `chronicler/scoring.py` | Major expansion: 8 new HF signals, 7 new type scorers, unified normalization (~600 new lines) |
| `chronicler/api/templates/*.html` (7 files) | Add Prominence/Salience display |
| `chronicler/api/routes/detail_pages.py` | Update search ordering |
| `projects/chronicler/reports/unified-scoring-design.md` | New comprehensive design doc |
