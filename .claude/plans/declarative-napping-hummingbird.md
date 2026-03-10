# Plan: Redesign Prominence & Salience as Independent Metrics

## Context

The current scoring system in `scoring.py` computes `importance_score` first, then derives prominence and salience from it (e.g., `prominence = importance - salience`). This makes prominence a residual rather than an independent metric. The user has provided detailed guidelines redefining:

- **Prominence** = "common knowledge" (how widely known/significant in the world)
- **Salience** = "narrative value" (how unusual/interesting/story-worthy)

Key principles: "more is not better", scores provide "commoner's view" world knowledge for the LLM, and also serve as exploration metrics in the browser UI.

**Trigger**: User guidelines specifying independent calculation, removal of `importance_score`, formula changes (river `sqrt`, written work `1/(1-quality)`, category-based sites), and new entity types to score.

---

## Step 1: Revise Design Document (FIRST)

**File**: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/reports/unified-scoring-design.md`

Rewrite `unified-scoring-design.md` to reflect the new architecture BEFORE any code changes. This document becomes the authoritative specification:

- **Two-score architecture** — Remove importance_score entirely. Only prominence_score and salience_score.
- **Independent computation philosophy** — Each score computed from its own signal sources. No subtraction, no derivation.
- **Core definitions**: Prominence = "common knowledge" (how widely known). Salience = "narrative value" (how unusual/interesting).
- **Per-entity-type formulas** — All new formulas documented (HF, Site, Artifact, Entity, Written Content, Art Form, Region, River, World Construction, Structure, Event Collection, Underground Region, Mountain Peak)
- **Category-based site/structure scoring** — Type categorization tables
- **Quality multipliers for written content** — `1/(1-quality)` for salience, `quality * 0.3` for prominence
- **`sqrt(length)` for rivers** — Replace old `length²`
- **4 new scored entity types** — Structures, Event Collections, Underground Regions, Mountain Peaks
- **Identities and landmasses explicitly excluded** with rationale
- **Outstanding design challenges** — Salience "coolness" problem, future IDF event weighting
- **Knowledge Horizon integration notes** — How scores feed into Phase 3/5 proximity knowledge

This is a complete rewrite of the existing document, not a patch.

---

## Step 2: Schema Migration

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql`
**New file**: `chronicler/db/migrate_remove_importance.sql`

### 2a: Remove `importance_score` column from 4 tables
- `historical_figures` — DROP COLUMN importance_score, DROP INDEX idx_hf_importance
- `entities` — DROP COLUMN importance_score, DROP INDEX idx_entities_importance
- `sites` — DROP COLUMN importance_score, DROP INDEX idx_sites_importance
- `artifacts` — DROP COLUMN importance_score, DROP INDEX idx_artifacts_importance

### 2b: Add scoring columns to 4 new tables
- `structures` — ADD prominence_score REAL DEFAULT 0, salience_score REAL DEFAULT 0
- `history_event_collections` — ADD prominence_score REAL DEFAULT 0, salience_score REAL DEFAULT 0
- `underground_regions` — ADD prominence_score REAL DEFAULT 0, salience_score REAL DEFAULT 0
- `mountain_peaks` — ADD prominence_score REAL DEFAULT 0, salience_score REAL DEFAULT 0

### 2c: Do NOT score (per user guidelines)
- `identities` — no columns (avoid spoiling secret identities)
- `landmasses` — no columns (not prominent/salient enough)

### 2d: Update `schema.sql`
Remove `importance_score` from CREATE TABLE statements. Add new columns to the 4 new tables.

### 2e: Clean up old migration files
- Update `migrate_importance_scores.sql` header to note it's superseded
- Update `migrate_prominence_salience.sql` header to note it's superseded

---

## Step 3: Rewrite `scoring.py` — Independent Prominence & Salience

**File**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py` (967 lines → full rewrite)

### 3a: Rename entry point
`compute_importance_scores()` → `compute_scores()` (update all callers)

### 3b: Historical Figures — Independent Scores

**Prominence** (structural reach — "how widely known"):
```python
P = LEAST(event_count * 2, 500)
  + LEAST(hf_links * 3, 100)
  + leadership_positions * 20
  + artifacts_held * 30
  + LEAST(site_links * 5, 50)
  + LEAST(entity_links * 3, 60)
  + death_recorded * 5
```
Plus author/auteur bonuses applied later (Step 3o).

**Salience** (narrative interest — "how unusual/interesting"):
```python
S = kill_count * 15
  + is_vampire * 80
  + is_necromancer * 100
  + is_deity * 120
  + is_force * 90
  + is_werebeast * 70
```

Both computed in a **single UPDATE** with two separate column assignments — no subtraction, no dependency between them.

### 3c: Sites — Category-Based Scoring (NEW approach)

Replace the importance-derived approach with category-based base scores:

```python
SITE_CATEGORIES = {
    # "Commonly known" — well-known settlement types
    "commonly_known": {
        "types": ["fortress", "castle", "mountain halls", "town", "hillocks", "hamlet"],
        "p_base": 50, "s_base": 0,
    },
    # "Uncommonly known" — remote or unusual
    "uncommonly_known": {
        "types": ["cave", "forest retreat", "lair", "camp", "monastery", "fort"],
        "p_base": 15, "s_base": 20,
    },
    # "Mysterious" — rare, dangerous, or mystical
    "mysterious": {
        "types": ["shrine", "labyrinth", "vault", "tomb", "tower"],
        "p_base": 5, "s_base": 50,
    },
    # "Dark" — evil civilization sites
    "dark": {
        "types": ["dark fortress", "dark pits"],
        "p_base": 20, "s_base": 40,
    },
}
```

**Formula**:
```python
P = category_p_base + event_count + structure_count * 3
S = category_s_base + event_collection_count * 5 + death_count * 2
```

### 3d: Artifacts — Independent Scores (minor refactor)

**Prominence** (how widely known):
```python
P = event_count * 10 + is_named * 50
```

**Salience** (narratively active):
```python
S = has_holder * 20
```

No longer derived from importance_score.

### 3e: Entities — Already Independent (just remove importance_score)

Current design is correct:
- **Prominence** = raw event/link/collection counts (unweighted)
- **Salience** = IDF-weighted counts (rare events score higher)

Change: Remove `importance_score` from the UPDATE statement and reset query. Keep the rest.

### 3f: Written Content — Quality Multipliers (NEW formulas)

**Prominence** with quality boost:
```python
P_base = copy_num                    # 1-5 (already implemented)
P = P_base * (1 + quality * 0.3)     # quality factor without overwhelming
```

**Salience** with non-linear quality multiplier:
```python
S_base = quality * (1 + style_count)  # already implemented
quality_capped = min(quality, 0.99)   # avoid division by zero
S = S_base * (1 / (1 - quality_capped))  # non-linear boost for high quality
```

The `1/(1-quality)` formula makes high-quality works dramatically more salient:
- quality 0.5 → multiplier 2.0x
- quality 0.8 → multiplier 5.0x
- quality 0.95 → multiplier 20.0x
- quality 0.99 → multiplier 100.0x (capped)

### 3g: Art Forms (Traditions) — No Change

- Prominence = unique authors (keep)
- Salience = avg work salience (keep — this will inherit the new non-linear boost from 3f)

### 3h: Regions — No Change

- P = size × evilness_factor (keep)
- S = evilness_factor / size (keep)
- Only evil/good regions scored (keep)

### 3i: Rivers — `sqrt(length)` (CHANGE)

**Prominence**: `P = sqrt(length)` (was `length²`)
**Salience**: Start region evilness (no change)

### 3j: World Constructions — Revised

**Roads/Tunnels**:
- P = length (proportional, was `length²`)
- S = low baseline + bump if in evil/good region (keep the `_coords_touch_evil_good` logic)

**Fortifications**:
- P = high fixed value (rare in game, well-known)
- S = high fixed value (rare in game, interesting)
- No longer `0.5 × max(other WC)` — fixed values since fortifications are independently significant

**Bridges**: Score 0 (await clarification per user guidelines)

### 3k: NEW — Structures

Category-based:
```python
STRUCTURE_WEIGHTS = {
    "temple":    {"p": 15, "s_deity": 30},
    "fortress":  {"p": 15, "s": 0},
    "tomb":      {"p": 12, "s": 20},
    "dungeon":   {"p": 12, "s": 20},
    "mead_hall": {"p": 10, "s": 0},
    "library":   {"p": 10, "s": 0},
    "market":    {"p": 8,  "s": 0},
    "guildhall": {"p": 6,  "s": 0},
    "shop":      {"p": 4,  "s": 0},
    # default:   {"p": 5,  "s": 0}
}
```
```python
P = type_weight_p + event_count * 2
S = type_weight_s + has_deity * 30
```

### 3l: NEW — Event Collections

```python
COLLECTION_TYPE_WEIGHTS = {
    "war": 3.0,
    "insurrection": 2.5,
    "persecution": 2.5,
    "beast attack": 2.0,
    "site conquered": 2.0,
    "battle": 1.5,
    "duel": 1.5,
    "abduction": 1.0,
    "theft": 1.0,
}
```
```python
P = duration * type_weight + sub_collection_count * 5 + event_count
S = death_count * 5 + type_bonus  # wars/insurrections/persecutions get +20
```
Duration = `end_year - start_year` (or 1 if same year). Death count from events with `event_type = 'hf died'` at the collection's site.

### 3m: NEW — Underground Regions

```python
DEPTH_WEIGHTS = {1: 5, 2: 10, 3: 15}  # cavern layer depth
```
```python
P = depth_weight + tile_count * 0.5
S = is_underworld * 50 + is_magma * 30
```

### 3n: NEW — Mountain Peaks

```python
P = (height / 100) + is_volcano * 50
S = is_volcano * 30
```
If height data is not available in the schema, use coords-based proxy.

### 3o: HF Author/Auteur Bonuses — Updated Target

Currently bonuses are added to `importance_score`. Change to add to `prominence_score` instead:
- Author bonus: `prominence_score += SUM(copy_num)` for all authored works
- Auteur bonus: `prominence_score += (#unique works in tradition) / 10`

### 3p: Normalization — Same Approach, Updated Targets

Remove `importance_score` from normalization. Add the 4 new tables:
```python
normalize_targets = [
    # Art (Phase 1 normalization)
    ("written_contents", "prominence_score"),
    ("written_contents", "salience_score"),
    ("art_forms", "prominence_score"),
    ("art_forms", "salience_score"),
    # Geographic + entities (Phase 2 normalization)
    ("regions", "prominence_score"),
    ("regions", "salience_score"),
    ("rivers", "prominence_score"),
    ("rivers", "salience_score"),
    ("world_constructions", "prominence_score"),
    ("world_constructions", "salience_score"),
    ("sites", "prominence_score"),
    ("sites", "salience_score"),
    ("historical_figures", "prominence_score"),
    ("historical_figures", "salience_score"),
    ("entities", "prominence_score"),
    ("entities", "salience_score"),
    ("artifacts", "prominence_score"),
    ("artifacts", "salience_score"),
    # NEW tables
    ("structures", "prominence_score"),
    ("structures", "salience_score"),
    ("history_event_collections", "prominence_score"),
    ("history_event_collections", "salience_score"),
    ("underground_regions", "prominence_score"),
    ("underground_regions", "salience_score"),
    ("mountain_peaks", "prominence_score"),
    ("mountain_peaks", "salience_score"),
]
```

---

## Step 4: Update Callers

### 4a: `chronicler/ingest/post_parse.py`
- Line 32: `step_7_calculate_importance_scores` → `step_7_calculate_scores`
- Line 307-311: Update function name and import

### 4b: `chronicler/cli.py`
- Line 351: Update import from `compute_importance_scores` → `compute_scores`
- Line 356: Update call

### 4c: `chronicler/ingest/validate_phase1.py`
- Lines 319-327: Replace `importance_score > 0` with `prominence_score > 0`
- Lines 424-429: Replace `importance_score` in SELECT/ORDER BY with `prominence_score`

### 4d: `chronicler/storyteller/annotated_schema.py`
- Lines 43, 58, 68, 205, 240, 243, 244: Remove/replace all `importance_score` references

### 4e: `chronicler/_schema_check.py` (if exists)
- Line 88: Replace `importance_score` reference

---

## Step 5: Update API Routes and Templates

### 5a: Routes — Minimal Changes
- `detail_pages.py` — Already uses `prominence_score` for sorting. Remove any remaining `importance_score` SELECTs
- `people.py` — Already uses `prominence_score` for sorting. No change needed

### 5b: Templates — Remove `importance_score` Displays
- `hf_detail.html` — Remove importance_score display if present
- `entity_detail.html` — Remove importance_score display if present
- `site_detail.html` — Remove importance_score display if present
- `artifact_detail.html` — Remove importance_score display if present

---

## Step 6: Migration & Re-Ingestion

1. Apply schema migration (DROP importance_score, ADD new columns)
2. Run full re-ingestion: `chronicler ingest --world-name "Tar Thran" path/to/legends`
3. Verify score distributions across all entity types
4. Check that sorting works in the web UI
5. Verify no division-by-zero errors (especially `1/(1-quality)`)

---

## Critical Files

| File | Change Type |
|------|-------------|
| `chronicler/scoring.py` | **Major rewrite** — new formulas, new functions, remove importance |
| `chronicler/db/schema.sql` | Remove importance_score columns, add new table columns |
| `chronicler/db/migrate_remove_importance.sql` | **New** — migration script |
| `chronicler/ingest/post_parse.py` | Rename function call |
| `chronicler/cli.py` | Rename function call |
| `chronicler/ingest/validate_phase1.py` | Replace importance_score references |
| `chronicler/storyteller/annotated_schema.py` | Replace importance_score references |
| `chronicler/api/routes/detail_pages.py` | Minor — remove importance_score SELECTs |
| `chronicler/api/routes/people.py` | Minor — verify prominence_score used |
| `chronicler/api/templates/*.html` | Remove importance_score displays |
| `unified-scoring-design.md` | Rewrite design document |

## Edge Cases & Risks

1. **Division by zero**: `1/(1-quality)` when quality = 1.0 → cap at 0.99
2. **Negative scores**: Cannot happen with independent formulas (all additive)
3. **Empty event counts**: All COALESCE'd to 0 already
4. **Missing height data for mountains**: Fall back to 0 prominence if no height column
5. **Event collection duration**: If start_year = end_year, treat as duration = 1
6. **Bridge scoring**: User said "await clarification" — leave at 0 for now

## Verification Plan

1. Run `chronicler ingest` with full test world (Tar Thran)
2. Query top-10 by prominence and salience for each entity type — verify sensible ordering
3. Verify all templates load without errors (no missing `importance_score` references)
4. Check that `1/(1-quality)` produces expected non-linear distribution
5. Compare river prominence distribution (sqrt vs old squared) — verify reasonable spread
6. Verify new entity types (structures, event_collections, underground_regions, mountain_peaks) have non-zero scores
