# Phase 4 Stage 4.1: Event Template Gap-Fill + Temporal Rendering

## Context

Phase 3 is COMPLETE (27/27 DoD). Phase 4 "Narrative Engine" has 8 stages, ~70 tasks, est. 6-9 weeks. The PRD (v2.1) defines Stage 4.1 as "Event Narrative Template System" — proposing a formal `EventTemplate`/`EventTemplateRegistry` class hierarchy.

**However**, the existing `PerspectiveRenderer` (3,062 lines, `perspective.py`) already delivers this functionality with 114/132+ event types, perspective-aware pronoun switching, death cause rendering (61 mappings in `death_cause.py`), and a robust dispatch mechanism (`EVENT_TEMPLATES` dict + `_resolve_template()` dynamic overrides + `_render_generic()` fallback).

**Decision**: Fill the ~22 template gaps in `PerspectiveRenderer` rather than refactoring 3,062 lines of working code into a new class hierarchy. The PRD's architecture was written before the renderer existed — the existing implementation satisfies the same requirements through different code organization. Add `TemporalContextRenderer` as a lightweight wrapper and address GAP-2 (artifact claim chains) at render time.

## Scope

**Stage 4.1** (this plan): Event template gap-fill, temporal context, artifact claim synthesis
**Stage 4.2** (next): Narrative enrichment — war/battle/biography generators, GAP-1 HF attribution
**Stage 4.3** (after): Agentic SQL storyteller — the core new capability of Phase 4

## Files to Modify

| File | Change | Est. Lines |
|------|--------|-----------|
| `DwarfCron/chronicler/explorer/perspective.py` | Add ~22 EVENT_TEMPLATES entries + COLUMN_MAP entries + 3 dynamic branches + `TemporalContextRenderer` class + `synthesize_artifact_claim_lost()` | ~120 |
| `DwarfCron/chronicler/api/routes/detail_pages.py` | Wire TemporalContextRenderer into event lists; add artifact claim chain DB query for HF pages | ~40 |
| `DwarfCron/tests/test_perspective.py` | NEW: 30+ tests (template coverage, dynamic branches, claim synthesis, temporal renderer) | ~200 |

## Implementation Steps

### Step 1: Add ~22 Missing Event Templates (~30 min)

Add to `EVENT_TEMPLATES` dict in `perspective.py`:

**HF**: `hf freed`
**Artifact**: `artifact transformed`, `artifact claim lost` (synthetic)
**Site**: `abandoned site`, `site retired`, `rampaged in site`, `site tribute`
**Entity**: `entity expels hf`, `entity fled site`, `entity rampaged`, `first contact`
**Diplomacy**: `agreement concluded`, `agreement rejected`, `diplomat lost`, `merchant arrived`, `tribute established`
**Masterpiece**: `hf performed masterwork`, `masterpiece arch construct`, `masterpiece dye`, `masterpiece item improvement`, `masterpiece food`, `masterpiece engraving`, `masterpiece lost`

Also add corresponding `COLUMN_MAP_BY_EVENT` entries mapping DB columns to template placeholders.

### Step 2: Add 3 Dynamic Override Branches (~15 min)

In `_resolve_template()`:
- `first contact` — perspective-aware rendering when viewed from one of the entities
- `masterpiece *` group — enrich with `item_type` field when present in details
- `agreement concluded/rejected` — surface `agreement_id` when present

### Step 3: Artifact Claim Chain Synthesis (GAP-2) (~45 min)

New function `synthesize_artifact_claim_lost_events(hf_id, all_claims)` in `perspective.py`:
- Takes this HF's claim events + ALL claim events for the same artifacts
- Detects when a later claim by a different HF supersedes this HF's claim
- Generates synthetic `artifact_claim_lost` events at render time (not written to DB)
- Wire into `detail_pages.py` HF handler with one additional DB query

### Step 4: TemporalContextRenderer (~30 min)

New class in `perspective.py` — wraps `PerspectiveRenderer` to emit year headers:
- Maintains `_last_year` state per page request
- Prepends `<span class="temporal-context">Year N</span>` when year changes
- `reset()` method for use between page sections

Wire into all 4 detail page event lists in `detail_pages.py` (HF, site, entity, artifact).

### Step 5: Tests (~45 min)

New file `tests/test_perspective.py` with 30+ tests:
- 22 tests: one per new template type (verify rendering produces expected text)
- 3 tests: dynamic override branches (perspective, masterpiece item_type, agreement_id)
- 5 tests: artifact claim chain synthesis (no later claim, later claim creates lost, year ordering, same-HF no self-lost, template renders)
- 5 tests: TemporalContextRenderer (header on year change, no duplicate, reset, HTML class)

### Step 6: Coverage Validation (~15 min)

Python script querying all distinct `event_type` values from DB, cross-referencing against `EVENT_TEMPLATES` keys. Target: 0 uncovered types (or only types outside PRD scope, documented).

## Verification

1. `pytest tests/test_perspective.py -v` — all 30+ tests pass
2. `pytest tests/` — full suite regression (existing tests still pass)
3. Coverage script shows 0 missing types against live DB
4. Manual: load HF detail page in browser (`http://localhost:8080/world/1/hf/<id>`), confirm:
   - Year headers appear between event years
   - New event types render with proper templates (not generic fallback)
   - Artifact claim events show claim chain context
5. `chronicler serve --reload` starts without import errors

## Stage 4.1 DoD Checklist (from PRD Section 8)

- [ ] 132+ event types have dedicated templates (currently 114, adding 22 = 136)
- [ ] Death cause renderer handles 50+ variants (already done — 61 mappings)
- [ ] Fallback template for remaining event types (already done — `_render_generic()`)
- [ ] Perspective-aware rendering integrated (already done — pronoun switching)
- [ ] Temporal context rendering works (Step 4)
- [ ] Circumstance/reason rendering works (already done — `_resolve_template()` handles reason/circumstance fields)

## What Comes Next

**Stage 4.2 — Narrative Enrichment** (1 week):
- War narrative generator (from event collections)
- Battle detail rendering
- Character biography generator
- GAP-1: Live event HF attribution pipeline
- New `chronicler/storyteller/attribution.py` module

**Stage 4.3 — Agentic Storyteller** (2-3 weeks):
- `chronicler/storyteller/agentic.py` — SQLSafetyLayer + SQL_TOOL + AgenticStoryteller
- New route `POST /api/agentic/ask` with SSE streaming
- Mode toggle in storyteller UI (keyword/agentic/hybrid)
- Annotated schema injection from existing `annotated_schema.py`
