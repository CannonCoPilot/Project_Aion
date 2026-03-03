# Unified Scoring Design -- Chronicler CDM

**Version**: 2.1
**Date**: 2026-03-02
**Status**: Implemented (scoring.py, committed 2026-03-02)
**Supersedes**: v1.0 (importance-derived architecture), `artwork-scoring-design.md`

---

## 1. Design Philosophy

### Two-Score Architecture

Every scored entity in the Chronicler CDM receives exactly **two** scores:

| Score | Meaning | Drives |
|-------|---------|--------|
| **prominence_score** | "Common knowledge" — how widely known or structurally significant an entity is in the world | Default list ordering, search result ranking, narrator mention frequency |
| **salience_score** | "Narrative value" — how unusual, interesting, or story-worthy an entity is | Narrative focus depth, explorer "hidden gems", Phase 3 dramatic treatment |

There is **no** `importance_score`. The previous three-score system (importance → prominence + salience via subtraction) has been removed. Each score is computed independently from its own signal sources. No score is derived from another.

### Core Definitions

**Prominence** represents the "commoner's view" — what an average person in the world would know about. A fortress with a thousand events is prominent. A god worshipped by millions is prominent. A river that spans the continent is prominent. Prominence correlates with event count, link count, geographic size, and structural reach.

**Salience** represents "narrative value" — what makes something worth telling a story about. A vampire hiding among mortals is salient. A masterpiece poem is salient. A dark fortress is salient even if nothing has happened there yet. Salience correlates with supernatural flags, rarity, quality, danger, and type-based inherent interest.

### Key Principles

1. **"More is not better"** — A site with 10,000 mundane events is not 100x more interesting than one with 100. Caps and diminishing returns prevent event-count inflation.
2. **Independent computation** — Prominence and salience are computed from different signal sources. No subtraction, no derivation, no dependency between them.
3. **Category-based baselines** — Sites, structures, and event collections receive base scores from their type before any event-based signals are added. A dark fortress has inherent salience (S_base=40) regardless of event count.
4. **Per-type normalization** — All scores are normalized to 0.0–1.0 within each (table, column) pair per world. A region with `prominence_score=0.9` is the 90th percentile region, not comparable to an HF with `prominence_score=0.9` in absolute terms.

### Normalization Strategy

```sql
UPDATE {table} SET {col} = {col} / NULLIF(
  (SELECT MAX({col}) FROM {table} WHERE world_id = $1), 0)
WHERE world_id = $1 AND {col} > 0
```

**Three normalization passes:**
1. Art scores (written_contents, art_forms) — normalized immediately after art scoring (step 5g)
2. Core + geo scores (historical_figures, entities, sites, artifacts, regions, rivers, world_constructions) — normalized at the end of `_compute_geo_scores()` (step 6d)
3. New entity type scores (structures, history_event_collections, underground_regions, mountain_peaks) — normalized after all new scorers complete (step 11)

---

## 2. Scored Entity Types (13 types)

### 2.1 Historical Figures

**Source**: `scoring.py:compute_scores()`
**Schema columns**: `prominence_score`, `salience_score`, `is_author`, `is_auteur`

#### Prominence (structural reach — "how widely known")

```
P = LEAST(event_count * 2, 500)
  + LEAST(hf_links * 3, 100)
  + leadership_positions * 20
  + artifacts_held * 30
  + LEAST(site_links * 5, 50)
  + LEAST(entity_links * 3, 60)
  + death_recorded * 5
```

Plus author/auteur bonuses (applied after art scoring in step 5f):
- Author bonus: `P += SUM(wc.prominence_score)` for all authored works (includes quality factor, not raw copy_num)
- Auteur bonus: `P += SUM(tradition_size) / 10` summed across all form-creation events by this HF, where `tradition_size` = `COUNT(DISTINCT written_content.id)` for works sharing the same `details->>'form_id'`

| Signal | Source Table | Weight | Cap |
|--------|-------------|--------|-----|
| Event count | `historical_figures.event_count` (pre-computed in post-parse) | x2 | 500 |
| HF links | `hf_links` | x3 | 100 |
| Leadership positions | `hf_position_links` (active only) | x20 | -- |
| Artifacts held | `artifacts.holder_hf_id` | x30 | -- |
| Site links | `hf_site_links` | x5 | 50 |
| Entity links | `hf_entity_links` | x3 | 60 |
| Death recorded | `death_year IS NOT NULL` | +5 | -- |

#### Salience (narrative interest — "how unusual/interesting")

```
S = kill_count * 15
  + is_vampire * 80
  + is_necromancer * 100
  + is_deity * 120
  + is_force * 90
  + is_werebeast * 70
```

| Signal | Source | Weight |
|--------|--------|--------|
| Kill count | `historical_figures.kill_count` | x15 |
| Vampire flag | `historical_figures.is_vampire` | +80 |
| Necromancer flag | `historical_figures.is_necromancer` | +100 |
| Deity flag | `historical_figures.is_deity` | +120 |
| Force of nature | `historical_figures.is_force` | +90 |
| Werebeast flag | `historical_figures.is_werebeast` | +70 |

Both computed in a **single UPDATE** with two separate column assignments — no subtraction, no dependency between them.

---

### 2.2 Entities (Civilizations, Religions, Guilds, etc.)

**Source**: `scoring.py:_compute_entity_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Scoring Method: TF-IDF per Entity Type

Entities are scored per-type (e.g., all civilizations together, all guilds together). This prevents large civilizations from dominating small guild scores.

**Three signal sources:**

1. **Event participation** (`event_entity_xref`): TF-IDF weighted by event type rarity within entity type
2. **HF membership links** (`hf_entity_links`): TF-IDF weighted by link type rarity
3. **Event collection participation** (`history_event_collections`): Fixed weights for wars, sieges, etc.

#### IDF Formulas

```
event_idf(event_type) = log2(N / n_i)
  where N = entities of this type, n_i = entities with this event type

link_idf(link_type) = log2(N / n_i)
  where N = entities of this type, n_i = entities with this link type
```

**Floor weights** (minimum IDF) prevent narratively significant events from scoring zero. See `EVENT_FLOOR_WEIGHTS` and `LINK_FLOOR_WEIGHTS` in `scoring.py`.

#### Prominence vs Salience

```
prominence = raw event + link + collection count (unweighted)
salience   = same counts but IDF-weighted (rare events score higher)
```

Both normalized to 0–1000 per entity type, then to 0–1 during final normalization.

---

### 2.3 Sites — Category-Based Scoring

**Source**: `scoring.py:compute_scores()` + `_compute_geo_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Category System

Sites receive base scores from their type category, then add event-based signals:

```python
SITE_CATEGORIES = {
    "commonly_known": {
        "types": ["fortress", "castle", "mountain halls", "town", "hillocks", "hamlet"],
        "p_base": 50, "s_base": 0,
    },
    "uncommonly_known": {
        "types": ["cave", "forest retreat", "lair", "camp", "monastery", "fort"],
        "p_base": 15, "s_base": 20,
    },
    "mysterious": {
        "types": ["shrine", "labyrinth", "vault", "tomb", "tower"],
        "p_base": 5, "s_base": 50,
    },
    "dark": {
        "types": ["dark fortress", "dark pits"],
        "p_base": 20, "s_base": 40,
    },
}
```

#### Formulas

```
P = category_p_base + event_count + structure_count * 3
S = category_s_base + event_collection_count * 5 + death_count * 2
```

**Design rationale**: A dark fortress has inherent salience (S_base=40) regardless of how many events happened there. A hamlet has high base prominence (P_base=50) because everyone knows where the hamlet is, but zero base salience because it's mundane. Event-based signals then differentiate within each category.

Sites whose type doesn't match any category receive default bases of `p_base=10, s_base=0`.

---

### 2.4 Artifacts — Independent Scores

**Source**: `scoring.py:compute_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Prominence (how widely known)

```
P = event_count * 10 + is_named * 50
```

#### Salience (narratively active)

```
S = has_holder * 20
```

No longer derived from a shared importance_score.

---

### 2.5 Written Contents — Quality Multipliers

**Source**: `scoring.py:_compute_art_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Prominence: Copy Number with Quality Boost

```
P_base = copy_num                    # 1-5 (copy ladder)
P = P_base * (1 + quality * 0.3)     # quality factor without overwhelming
```

Copy number ladder:

| Stage | Condition | copy_num |
|-------|-----------|----------|
| Composed | All works | 1 |
| Inscribed | Has linked artifact (`details->writing_id`) | +1 |
| Copied 1x | 1 `artifact copied` event | +1 |
| Copied 2x | 2 copy events | +1 |
| Copied 3x+ | 3+ copy events | +1 (capped at 5 total) |

#### Salience: Non-Linear Quality Multiplier

```
quality       = author_roll / 256.0        (0.0–1.0)
style_count   = len(styles)               (0, 1, or 2)
S_base        = quality * (1 + style_count)
quality_capped = min(quality, 0.99)        # avoid division by zero
S = S_base * (1 / (1 - quality_capped))    # non-linear boost
```

The `1/(1-quality)` formula creates a "long tail" where rare masterpieces become dramatically more salient:

| Quality | Multiplier | Effect |
|---------|------------|--------|
| 0.50 | 2.0x | Modest boost |
| 0.80 | 5.0x | Notable work |
| 0.90 | 10.0x | Exceptional |
| 0.95 | 20.0x | Masterpiece |
| 0.99 | 100.0x | Legendary (cap) |

**Missing data**: Works without `author_roll` default to salience 0.

---

### 2.6 Art Forms (Traditions)

**Source**: `scoring.py:_compute_art_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Linkage

Written contents are linked to art forms via the JSONB field `written_contents.details->>'form_id'`, cast to `INT` and matched against `art_forms.id`. This is the only join path — there is no direct foreign key.

#### Prominence: Unique Authors

```
P = COUNT(DISTINCT author_hf_id) for works in this tradition
```

A tradition known by many different authors has spread through the culture.

#### Salience: Average Work Quality

```
S = AVG(written_content.salience_score) for works in this tradition
      WHERE salience_score > 0
```

Inherits the non-linear quality boost from written content salience (Section 2.5). Depends on written content salience being computed first (step 5b must precede step 5d).

---

### 2.7 Regions

**Source**: `scoring.py:_compute_geo_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Prominence: Size x Evilness

```
P = tile_count * evilness_factor
```

#### Salience: Evilness Density

```
S = evilness_factor / tile_count
```

| Evilness | Factor |
|----------|--------|
| Evil | 3.0 |
| Good | 2.0 |
| Neutral | 0.0 (unscored) |

Only evil and good regions receive scores. A large evil region has high prominence (dominates the map) but low salience (diffuse danger). A small evil region has low prominence but high salience (concentrated danger).

---

### 2.8 Rivers — sqrt(length)

**Source**: `scoring.py:_compute_geo_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Prominence

```
P = sqrt(path_length)
```

**Rationale**: `sqrt` provides diminishing returns — a river twice as long is only 1.4x as prominent. This prevents the longest river from dominating while still rewarding length. Replaces the old `length²` formula which made long rivers 4x as prominent per doubling.

#### Salience: Starting Region Evilness

```
S = evilness_factor of the region containing the river's first coordinate
```

---

### 2.9 World Constructions

**Source**: `scoring.py:_compute_geo_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Roads and Tunnels

```
P = length                    (proportional, no squaring)
S = max evilness_factor across ALL tiles the road/tunnel passes through
```

#### Bridges

Score 0 (awaiting future design clarification).

#### Fortifications

```
P = fixed high value (rare in game, well-known)
S = fixed high value (rare in game, narratively interesting)
```

Fortifications are independently significant rather than derived from other WCs.

---

### 2.10 Structures (NEW)

**Source**: `scoring.py:_compute_structure_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Category-Based Scoring

```python
STRUCTURE_WEIGHTS = {
    "temple":    {"p": 15, "s": 0, "s_deity": 30},
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

#### Formulas

```
P = type_weight_p + event_count * 2
S = type_weight_s + has_deity * type_s_deity  (default 30 if no per-type s_deity)
```

**Structure type normalization**: Raw `type` column values are normalized via `.lower().replace(" ", "_")` before dictionary lookup (e.g., `"Mead Hall"` → `"mead_hall"`).

Temples with a linked deity receive significant salience boost. Deity presence is detected from the structure's `details` JSONB (`deity` or `deity_hf` keys).

---

### 2.11 Event Collections (NEW)

**Source**: `scoring.py:_compute_collection_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Type Weights

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

#### Formulas

```
P = duration * type_weight + sub_collection_count * 5 + event_count
S = death_count * 5 + type_bonus
```

- Duration = `end_year - start_year` (minimum 1)
- Death count from events with `event_type = 'hf died'` within the collection's membership (via `collection_events` join table, not site-based)
- Type bonus: wars/insurrections/persecutions get +20

---

### 2.12 Underground Regions (NEW)

**Source**: `scoring.py:_compute_underground_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Formulas

```
P = depth_weight + tile_count * 0.5
S = is_underworld * 50 + is_magma * 30
```

Depth weights: Layer 1 = 5, Layer 2 = 10, Layer 3 = 15 (default 5 for unknown depth).

**Detection method**: `is_underworld` and `is_magma` are derived by substring matching on the `type` column — `"underworld" in type.lower()` and `"magma" in type.lower()` respectively. These are not boolean columns in the schema.

---

### 2.13 Mountain Peaks (NEW)

**Source**: `scoring.py:_compute_mountain_scores()`
**Schema columns**: `prominence_score`, `salience_score`

#### Formulas

```
P = (height / 100) + is_volcano * 50
S = is_volcano * 30
```

Volcanoes receive significant salience as rare geographic features.

---

## 3. Explicitly Unscored Entity Types

### 3.1 Identities (2,928 rows)

**Not scored.** Identities are secret alter-egos of HFs. Scoring them would spoil the narrative discovery of secret identities. Their significance derives from the parent HF's scores.

### 3.2 Landmasses (~100 rows)

**Not scored.** Landmasses have too little signal data to produce meaningful differentiation (typically 1–3 per world). Their primary value is geographic containment, not narrative significance.

### 3.3 Historical Eras (~1 row)

**Not scored.** Too few instances to normalize meaningfully.

---

## 4. Pipeline Architecture

### Execution Order (Data Dependencies)

```
compute_scores(conn, world_id)
  |
  +-- [1] HF prominence (no dependencies)
  |   HF salience (no dependencies)
  |   Both computed in one UPDATE — independent
  |
  +-- [2] Site prominence + salience (category-based, no cross-entity dependencies)
  |
  +-- [3] Artifact prominence + salience (independent, no cross-entity dependencies)
  |
  +-- [4] _compute_entity_scores() — IDF-weighted, per entity type
  |     (no cross-type dependencies)
  |
  +-- [5] _compute_art_scores()
  |     +-- [5a] Written work prominence (copy_num + quality boost)
  |     +-- [5b] Written work salience (quality * 1/(1-quality))
  |     +-- [5c] Tradition prominence (unique authors)
  |     +-- [5d] Tradition salience (avg work salience — depends on 5b)
  |     +-- [5e] HF is_author / is_auteur flags
  |     +-- [5f] HF prominence += author + auteur bonuses
  |     +-- [5g] Normalize written_contents + art_forms scores to 0–1
  |
  +-- [6] _compute_geo_scores()
  |     +-- [6a] Region scoring
  |     +-- [6b] River scoring (sqrt length)
  |     +-- [6c] World construction scoring
  |     +-- [6d] NORMALIZE core + geo scores to 0–1
  |            (HFs, entities, sites, artifacts, regions, rivers, world_constructions)
  |
  +-- [7] _compute_structure_scores()
  |
  +-- [8] _compute_collection_scores()
  |
  +-- [9] _compute_underground_scores()
  |
  +-- [10] _compute_mountain_scores()
  |
  +-- [11] NORMALIZE new entity type scores to 0–1
```

### Critical Dependencies

```
[5b] Written work salience ── must precede ──► [5d] Tradition salience
[5a-5d] Art scoring ───────── must precede ──► [5e-5f] HF author/auteur updates
[5f] HF author bonuses ────── must precede ──► [6d] HF normalization
[1-4] Core scoring ─────────── must precede ──► [6d] Core normalization
[6a-6c] Geo scoring ────────── must precede ──► [6d] Geo normalization
[7-10] New entity scoring ──── must precede ──► [11] New entity normalization
```

**No cross-dependencies between passes**: Steps 7-10 write to tables not touched by step 6d. Steps 1-4 write to tables not touched by step 11. The three normalization passes are independent of each other.

---

## 5. Schema Summary

### Tables with Scoring Columns

| Table | prominence_score | salience_score | is_author | is_auteur |
|-------|:---:|:---:|:---:|:---:|
| `historical_figures` | Y | Y | Y | Y |
| `entities` | Y | Y | | |
| `sites` | Y | Y | | |
| `artifacts` | Y | Y | | |
| `regions` | Y | Y | | |
| `rivers` | Y | Y | | |
| `world_constructions` | Y | Y | | |
| `art_forms` | Y | Y | | |
| `written_contents` | Y | Y | | |
| `structures` | Y | Y | | |
| `history_event_collections` | Y | Y | | |
| `underground_regions` | Y | Y | | |
| `mountain_peaks` | Y | Y | | |

### Tables NOT Scored

| Table | Reason |
|-------|--------|
| `identities` | Would spoil secret identity discovery |
| `landmasses` | Insufficient signal data |
| `historical_eras` | Too few instances |

---

## 6. Implementation Files

| File | Role |
|------|------|
| `chronicler/scoring.py` | All scoring functions (13 entity types) |
| `chronicler/ingest/post_parse.py` | Pipeline orchestration (calls `compute_scores`) |
| `chronicler/cli.py` | CLI `rescore` command |
| `chronicler/db/schema.sql` | Column definitions |
| `chronicler/db/migrate_prominence_salience.sql` | Migration adding prominence/salience columns |
| `chronicler/db/migrate_remove_importance.sql` | Migration removing deprecated importance_score |
| `chronicler/db/migrate_art_scoring.sql` | Migration adding scoring to art forms |
| `chronicler/db/migrate_geo_scoring.sql` | Migration adding scoring to geo entities |
| `chronicler/storyteller/annotated_schema.py` | Schema descriptions reference scores |
| `chronicler/ingest/validate_phase1.py` | Validation queries use prominence_score |
| `chronicler/api/routes/detail_pages.py` | API endpoints use scores for sorting/display |

---

## 7. Outstanding Design Challenges

### Salience "Coolness" Problem

The current salience formulas for HFs rely entirely on boolean flags (vampire, deity, etc.) and kill count. This captures the "supernatural" axis well but misses other forms of narrative interest: political intrigue, artistic genius, tragic death, unlikely survival, etc. Future iterations could incorporate:
- Entity reputation flags (Hero/Monster/Murderer from `entity_reputations` JSONB)
- Sphere associations (deities with unusual sphere combinations)
- Death circumstances (dramatic deaths score higher)
- Intrigue involvement

### IDF Event Weighting for HFs

Currently HFs use fixed event weights. A future enhancement could apply the entity IDF approach to HFs — weighting events by their rarity within the HF population. This would make unusual events (e.g., "artifact destroyed") more salient than common ones (e.g., "changed state").

### Knowledge Horizon Integration (Phase 3/5)

Prominence and salience scores will feed into the Phase 3 narrative perspective system and Phase 5 live integration:
- **Prominence** drives entity *mention frequency* — the narrator refers to prominent entities more often
- **Salience** drives *narrative focus* — salient entities receive more detailed, dramatic treatment
- In Phase 5 (proximity-based knowledge), prominence determines how far an entity's "reputation reaches" — a prominent fortress is known across the continent, while a mysterious shrine is only known locally

---

## 8. Performance Characteristics

The scoring pipeline processes the full Tar Thran test world (48K HFs, 37K written works, 2.2M total records) in under 30 seconds. Key optimizations:

- **Batch queries**: All scoring uses set-based SQL updates, not per-row loops (except written content copy_num, which uses in-memory Python computation with batch UPDATE)
- **IDF computation**: One query per entity type, not per entity
- **LATERAL joins**: Used for HF scoring to avoid correlated subqueries
- **Three-pass normalization**: Art scores normalized immediately (step 5g); core+geo scores normalized in step 6d; new entity types normalized in step 11

---

*Unified Scoring Design v2.1 -- Chronicler Phase 2*
*Two-score architecture: prominence (common knowledge) + salience (narrative value)*
