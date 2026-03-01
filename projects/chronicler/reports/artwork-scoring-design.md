# Artwork Scoring Design — Prominence & Salience

**Version**: 1.0
**Date**: 2026-02-28
**Status**: Design — Pending Implementation
**Phase**: Phase 2 (scoring infrastructure) + Phase 3 (narrative integration)
**Depends On**: Artifact parser fix (capture `<writing>` tag linking artifacts to written_contents)

---

## 1. Data Model Summary

The DF art system has three layers, each with distinct scoring implications:

### Layer 1: Art Traditions (`art_forms` — 240 rows)

A **tradition** is a named artistic genre created by a single HF.

| Field | Description |
|-------|-------------|
| `form_type` | The artistic essence: dance (180), musical (58), poetic (2) |
| creator HF | Tracked via `dance/musical/poetic form created` events |

A tradition is NOT a written work. It is conceptual — a genre label that written works may be composed within.

**Key relationships**:
- Tradition `form_type` correlates with but does not determine the `form` of works composed within it
- Dance traditions produce 7 work forms (poem, musical composition, choreography, short story, novel, letter, play)
- Musical traditions produce 2 forms (poem, musical composition)
- Poetic traditions produce 1 form (poem only)
- 47 traditions have zero works composed within them

### Layer 2: Written Works (`written_contents` — 37,486 rows)

A **written work** is a unique original composition. Each has exactly one author. There are 22 distinct forms.

| Field | Description | Data Coverage |
|-------|-------------|---------------|
| `author_hf_id` | The single original author | 100% |
| `form` | Literary form (poem, essay, manual, etc.) | 100% |
| `details->form_id` | Link to art tradition (if any) | 60% (22,607 tradition-linked; 14,879 standalone) |
| `details->author_roll` | Quality roll, 1–256 | 61% (22,915 have rolls; 14,571 missing) |
| `styles` | Array of style descriptors | 63% have 1+: 15,833 with 1 style, 7,969 with 2 styles |

**Standalone forms** (never tradition-linked): manual, guide, essay, chronicle, biography, dictionary, cultural history, cultural comparison, autobiography, star chart, treatise, alternate history, comparative biography, genealogy, encyclopedia.

### Layer 3: Physical Artifacts (books, scrolls, codices)

A **physical artifact** is a scroll, book, or codex that contains a written work.

| Fact | Value |
|------|-------|
| Artifacts with `<writing>` tag | 7,418 |
| Link mechanism | `artifact.writing` → `written_content.id` |
| `artifact copied` events | 349 total, 299 distinct artifacts |
| Max copies per artifact | 3 |

**PARSER GAP**: The `<writing>` tag is NOT currently captured by `xml_parser.py:_parse_artifacts()` (line 414 sets `details = None`). Must fix before implementing copy-based scoring.

---

## 2. Scoring System

### 2.1 Written Work Prominence (Copy Number)

**Concept**: A work's prominence reflects its physical spread through the world. Each step of dissemination adds to its Copy Number (copy_num).

**Scoring ladder**:

| Stage | Condition | copy_num | Description |
|-------|-----------|----------|-------------|
| Composed | All written works | 1 | Exists as an original composition |
| Inscribed | Has a linked artifact (`<writing>` tag) | 2 | Physically inscribed onto scroll/book/codex |
| Copied 1x | 1 `artifact copied` event | 3 | Copied to a second site's library |
| Copied 2x | 2 copy events | 4 | Spread to a third site |
| Copied 3x+ | 3+ copy events | 5 (capped) | Widely distributed |

**Result**: `written_work.prominence = copy_num` (range: 1–5)

**Data distribution** (Tar Thran, 37,486 works):
- copy_num = 1: ~30,068 works (composed only, no physical artifact)
- copy_num = 2: ~7,119 works (inscribed but never copied)
- copy_num = 3: ~249 works (copied once)
- copy_num = 4: ~43 works (copied twice)
- copy_num = 5: ~7 works (copied 3+ times)

### 2.2 Written Work Salience (Quality x Style)

**Concept**: Salience reflects the intrinsic artistic interest of the work — quality of craftsmanship and stylistic distinctiveness.

**Formula**:
```
quality = author_roll / 256.0            -- normalized to 0.0–1.0
style_count = len(styles)                -- 0, 1, or 2
salience = quality * (1 + style_count)   -- quality amplified by stylistic richness
```

**Rationale**:
- `quality` alone ranges 0.0–1.0 (author_roll / 256)
- `style_count` acts as a multiplier: 0 styles = 1x, 1 style = 2x, 2 styles = 3x
- A masterwork (roll=256) with 2 styles: `1.0 * 3 = 3.0`
- A mediocre work (roll=128) with no style: `0.5 * 1 = 0.5`
- Missing `author_roll` → quality defaults to 0.0 (salience = 0)

**Result**: `written_work.salience` (range: 0.0–3.0, normalized to 0.0–1.0 post-computation)

### 2.3 HF Author Prominence (from Works)

**Concept**: An HF who authors works gains prominence proportional to how widely those works spread. This creates an "Author" flag on the HF.

**Formula**:
```
author_prominence_bonus = SUM(copy_num) for each work authored by this HF
```

**Flag**: `is_author = TRUE` if `COUNT(written_contents WHERE author_hf_id = hf.id) > 0`

**Data notes**:
- 37,486 `written content composed` events, each with a unique author_hf_id
- Prolific authors (many works, some inscribed/copied) get substantial prominence boosts
- An author with 10 works all at copy_num=1 gets +10; one with 3 works at copy_num=5 gets +15

### 2.4 HF Auteur Prominence (from Traditions)

**Concept**: An HF who creates an art tradition gains prominence proportional to how many unique works have been composed within that tradition. This creates an "Auteur" flag on the HF.

**Formula**:
```
auteur_prominence_bonus = COUNT(DISTINCT written_contents WHERE form_id = tradition.id) / 10
```

**Flag**: `is_auteur = TRUE` if HF is the creator of any art tradition (tracked via `dance/musical/poetic form created` events)

**Data notes** (Tar Thran):
- 240 traditions, each with a single creator HF
- Tradition sizes range from 0 to 1,223 unique works (median: 53)
- Top auteur: creator of "The Fabulous Lute" → 1,223 works → +122.3 prominence bonus
- 47 traditions have 0 works → auteur gets +0 (tradition created but never adopted)
- Division by 10 prevents auteurs from overwhelming other prominence signals

---

## 3. Art Form (Tradition) Scoring

Art forms themselves also receive prominence and salience scores for their tradition-level detail pages.

### 3.1 Tradition Prominence

**Formula**:
```
tradition.prominence = COUNT(DISTINCT author_hf_id) for works in this tradition
```

**Rationale**: A tradition known by many different authors has spread through the culture — that's prominence.

**Data range**: 0 to 453 unique authors (The Fabulous Lute)

### 3.2 Tradition Salience

**Formula**:
```
tradition.salience = AVG(work.salience) for works in this tradition
```

**Rationale**: A tradition whose works are consistently high-quality and stylistically rich is more narratively interesting.

---

## 4. Normalization

All scores are normalized to 0.0–1.0 within their category after computation, matching the pattern established for geographic feature scoring:

```sql
UPDATE <table> SET <score_col> = <score_col> / NULLIF(
  (SELECT MAX(<score_col>) FROM <table> WHERE world_id = $1), 0)
WHERE world_id = $1 AND <score_col> > 0
```

**Categories normalized independently**:
- `written_contents.prominence_score`
- `written_contents.salience_score`
- `art_forms.prominence_score`
- `art_forms.salience_score`

HF prominence bonuses (author + auteur) are additive to the existing HF importance_score, then the entire HF set is normalized together.

---

## 5. Implementation Prerequisites

### 5.1 Parser Fix (MUST DO FIRST)

File: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py`

The `_parse_artifacts()` function (line 401) must capture:
- `<writing>` tag → store as `details->writing_id` (integer FK to written_contents.id)

This is the only parser change needed. All other data (author_roll, styles, form_id, copy events) is already captured.

### 5.2 Schema Changes

```sql
-- Add scoring columns to written_contents
ALTER TABLE written_contents ADD COLUMN prominence_score FLOAT DEFAULT 0.0;
ALTER TABLE written_contents ADD COLUMN salience_score FLOAT DEFAULT 0.0;

-- Add scoring columns to art_forms
ALTER TABLE art_forms ADD COLUMN prominence_score FLOAT DEFAULT 0.0;
ALTER TABLE art_forms ADD COLUMN salience_score FLOAT DEFAULT 0.0;

-- Add author/auteur flags to historical_figures
ALTER TABLE historical_figures ADD COLUMN is_author BOOLEAN DEFAULT FALSE;
ALTER TABLE historical_figures ADD COLUMN is_auteur BOOLEAN DEFAULT FALSE;
```

### 5.3 Scoring Function

Add `_compute_art_scores(conn, world_id)` to `scoring.py`, called from `compute_importance_scores()`.

Steps:
1. Build artifact→written_content map from `artifacts.details->writing_id`
2. Build copy count map from `artifact copied` events + artifact→writing link
3. Compute written work prominence (copy_num ladder)
4. Compute written work salience (quality x style)
5. Compute tradition prominence (unique authors)
6. Compute tradition salience (avg work salience)
7. Update HF flags (is_author, is_auteur)
8. Update HF importance_score with author + auteur bonuses
9. Normalize all scores to 0.0–1.0

---

## 6. Resolved Questions

1. **Missing author_roll**: 14,571 works (39%) have no `author_roll`. **Decision: salience = 0.** These works still have prominence from copy_num and remain in the general knowledge pool. They simply won't be prioritized as high-profile narrative options. (Resolved 2026-02-28)
2. **Standalone forms**: Manuals, guides, essays have no tradition. Their salience comes purely from quality x style. This is sufficient for now.
3. **Copy event attribution**: The `artifact copied` event has `artifact_id` but we need to join through `artifact.writing_id` to reach the written work. If multiple written works share an artifact (e.g., a codex with 3 poems), the copy event boosts all of them. Is this correct behavior?
4. **HF author prominence cap**: Should there be a cap on how much author/auteur prominence can contribute to HF importance, to prevent prolific-but-minor scribes from outranking warriors and kings?

## 7. Future Scoring Layer (Post Data-Streaming)

After the in-game live data streaming pipeline is implemented (Phase 5), art
scoring will receive an additional layer of signals derived from fortress-mode
gameplay. These signals are NOT available from legends XML — they come from
real-time observation of fortress activity. Planned additions include:

- **Performance count**: Number of times a work has been performed in the
  fortress tavern/temple (increases prominence)
- **Emotional responses**: Number and valence of emotional reactions from
  fortress denizens witnessing performances (increases salience)
- **Fortress-local familiarity**: Works performed frequently in the player's
  fortress should receive a local prominence boost relative to that fortress's
  narrative perspective

These signals will be additive to the legends-based scoring defined above.
The existing copy_num, quality, and tradition scoring remain the baseline;
live data adds a real-time layer on top.

---

## 7. Example Calculations

### Written Work: "Unusual Stolenmatch" (Essay, id=0)
- copy_num: 1 (composed) + 1 (has artifact, writing=0 → book in gold) = **2**
- quality: author_roll not captured for this work → salience = **0.0**
- After normalization: prominence = 2/5 = **0.40**

### Tradition: "The Fabulous Lute" (Dance, 1,223 works, 453 unique authors)
- prominence = 453 (unique authors) → normalized = 453/453 = **1.00** (top tradition)
- salience = avg(quality * (1 + style_count)) across 1,223 works

### HF: Creator of "The Fabulous Lute"
- is_auteur = TRUE
- auteur_bonus = 1,223 / 10 = **+122.3** added to HF importance_score
- If also an author of 5 works with total copy_num=12: author_bonus = **+12**

---

*Artwork Scoring Design v1.0 — Chronicler Phase 2/3*
