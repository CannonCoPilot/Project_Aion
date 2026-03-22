# Stage 3.4: Embedding Pipelines — Implementation Plan

## Context

Stage 3.6 (Narrative Data Layer) is complete. The storyteller has 436K scored events, 6K arcs, 100 year summaries, and 36 character profiles — but no semantic search capability. All queries use ILIKE string matching, which can't find "the most powerful necromancer" or "battles near the mountain." Stage 3.4 adds the embedding infrastructure that enables conceptual search and provides the Phase 4 storyteller with semantically relevant context.

**Two pipelines:**
1. **Batch Legends Embedder** — one-time bulk embed of all legends data (~100K chunks)
2. **Live Stream Embedder** — incremental embedding of changed entities during watcher cycles

## File Structure

### New Files (5)
| File | Purpose |
|------|---------|
| `chronicler/embedding/__init__.py` | Package init |
| `chronicler/embedding/extractors.py` | Entity text extraction (3.4.1) |
| `chronicler/embedding/pipeline.py` | Batch + live embedding orchestration, chunking, MLX client (3.4.2-3.4.5) |
| `chronicler/embedding/search.py` | Hybrid search + narrative context retrieval (3.4.6-3.4.7) |
| `tests/test_embedding.py` | Unit + integration tests |

### Modified Files (4)
| File | Change |
|------|--------|
| `chronicler/db/schema.sql:653-662` | Add `world_id` column, UNIQUE constraint, vector index |
| `chronicler/cli.py` | Add `embed` command group (embed, embed status) |
| `chronicler/dfhack/watcher.py:609-611` | Insert live embedding hook (step 6b3) |
| `chronicler/storyteller/narrative_context.py:92-124` | Add embedding-based context blocks |

## Implementation Phases

### Phase A: Foundation (no inter-dependencies)

#### A1. Schema Migration
Add `world_id` to embeddings table + indexes:
```sql
ALTER TABLE embeddings ADD COLUMN world_id INT NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX idx_embeddings_unique ON embeddings(world_id, entity_type, entity_id, chunk_index);
CREATE INDEX idx_embeddings_hash ON embeddings(world_id, content_hash);
-- IVFFlat vector index built after first batch embed (needs data to cluster on)
```
Update `schema.sql` lines 653-662 for fresh installs.

#### A2. `embedding/extractors.py` — Entity Text Extractors
One `extract_*()` function per entity type. Reuses existing renderers:
- `extract_hf()` — extends `_format_hf()` from `context.py:807` with skills, goals, entity memberships
- `extract_event()` — extends `_format_event()` from `context.py:854` (only events with narrative_weight ≥ 10)
- `extract_site()` — name, type, coords, owner entity name
- `extract_entity()` — name, type, race
- `extract_artifact()` — name, material, type, creator
- `extract_written_content()` — title, form, styles, author
- `extract_art_form()` — name + full prose description (can be multi-chunk)
- `extract_unit()` — live unit: name, race, profession, personality traits/values/dreams, top skills, stress, mood
- `extract_announcement()` — game_reports.text with year/category context

Each function takes an `asyncpg.Record` (from enrichment JOINs) and returns a string.

Registry dict `BATCH_ENTITY_TYPES` maps type → (SQL query, extract function, optional weight filter).

#### A3. `embedding/pipeline.py` — Core Pipeline
Combines chunking, MLX client, and DB operations in one module:

**Chunking** (character-based, ~4 chars/token):
- `chunk_text(text, max_chars=2048, overlap_chars=256) → list[{chunk_index, chunk_text, content_hash}]`
- SHA-256 truncated to 16 hex chars for content_hash
- Most entities → 1 chunk. Only art_forms (avg 1528 chars) may produce 2.

**MLX Client:**
- `async embed_texts(texts: list[str]) → list[list[float]]` — calls `localhost:8000/embed_batch`
- Auto-chunks into groups of 512 per HTTP call
- Uses `httpx.AsyncClient` (existing dependency), `config.MLX_EMBED_URL`
- Graceful fallback: log warning + return empty on server unavailable

**DB Operations:**
- `async embed_entities(conn, world_id, entity_type, rows, extract_fn, force=False) → dict` — full pipeline for a batch of rows: extract → chunk → hash-check → embed → upsert
- `async embed_changed(conn, world_id, changes: list[tuple[str, int, str]]) → int` — for live pipeline: embed a list of (entity_type, entity_id, rendered_text) tuples
- Upsert: `INSERT ... ON CONFLICT (world_id, entity_type, entity_id, chunk_index) DO UPDATE`
- Pool connections have pgvector codec → pass numpy arrays directly for vector column

### Phase B: Pipelines (depends on Phase A)

#### B1. CLI `embed` Command Group
Add to `cli.py` following existing Click patterns:

`chronicler embed run`:
- `--world-id 1`, `--entity-types all|hf,site,...`, `--force`, `--batch-size 64`, `--dry-run`
- Iterates entity types in priority order: art_form → hf → event → site → entity → artifact → written_content
- For each type: paginated DB fetch (5000/page) → extract → chunk → hash-check → embed → upsert
- Progress logging per type: embedded/skipped/total, elapsed time
- After all types: build IVFFlat vector index if rows > 1000
- Performance target: full Tar Thran in < 10 min

`chronicler embed status`:
- Shows counts per entity_type, total embeddings, index status

#### B2. `embedding/search.py` — Hybrid Search
- `async hybrid_search(pool, world_id, query, limit=20) → list[dict]`
  1. Embed query via `embed_texts([query])`
  2. pgvector cosine search: `ORDER BY embedding <=> $1::vector LIMIT N`
  3. ILIKE keyword search: reuse `extract_keywords()` from `context.py:777`
  4. Reciprocal Rank Fusion (k=60) to merge ranked lists
  5. Return sorted by RRF score

- `async semantic_search(pool, world_id, query_vector, limit=10, threshold=0.3) → list[dict]`
  - Pure vector search with similarity threshold

### Phase C: Integration (depends on Phase B)

#### C1. Watcher Live Embedding Hook
Insert at `watcher.py:609` as step 6b3 "Live embedding":
1. Collect changed entity IDs from the cycle: unit deltas, reactive events, new history events, announcements
2. For each: extract text → check content_hash → queue if changed
3. Batch embed via `embed_changed()`
4. Deaths/invasions: prioritized but still within same cycle (no need for true async — typical cycle processes 0-5 entities in ~100ms)

```python
# 6b3. Live embedding (incremental)
if bd and bridge_available:
    try:
        embed_count = await _embed_cycle_changes(
            conn, world_id, etl_result, events, bd)
        if embed_count:
            extras['embedded'] = embed_count
    except Exception as e:
        log.debug("Live embedding failed: %s", e)
```

#### C2. Narrative Context Integration
Add to `narrative_context.py` `assemble_context()`:
- New `_gather_embedding_context()` function called for all query types
- Embeds the query text, searches embeddings table
- Returns T3-priority `ContextBlock` entries from semantic matches
- Additive — never replaces existing SQL-based gatherers

## Entity Count Estimates

| Entity Type | Total Rows | Embeddable | Est. Chunks | Avg Chars |
|-------------|-----------|------------|-------------|-----------|
| art_form | 1,402 | 1,402 | ~1,600 | 1,528 |
| hf | 96,259 | 96,259 | ~96,259 | ~250 |
| event (weight≥10) | 907,750 | ~100,000 | ~100,000 | ~150 |
| site | 4,365 | 4,365 | ~4,365 | ~200 |
| entity | 9,728 | 9,728 | ~9,728 | ~150 |
| artifact | 18,561 | 18,561 | ~18,561 | ~100 |
| written_content | 81,189 | 81,189 | ~81,189 | ~80 |
| **Total** | | | **~311,700** | |

At 64/batch, ~4,870 MLX calls. At ~18K tokens/sec → ~8-9 minutes for full embed.

## Validation Plan

### Automated (`chronicler validate-stage34`)
1. Schema: embeddings table has world_id, unique index, hash index
2. Batch pipeline: `chronicler embed run --entity-types art_form --batch-size 16` — verify rows appear
3. Content-hash dedup: re-run same command → 0 new embeddings
4. Force re-embed: `--force` → all re-embedded
5. Hybrid search: embed 100 HFs, search "powerful necromancer" → verify relevant results
6. Context assembly: `narrative_context.assemble_context()` includes embedding blocks
7. Vector search quality: cosine similarity > 0.3 for semantically related entities

### Manual Walkthrough
1. `chronicler embed run --world-id 1` — full batch, verify < 10 min
2. `chronicler embed status --world-id 1` — verify counts per type
3. `chronicler embed run --world-id 1` — second run, verify "0 new, N skipped"
4. Start `chronicler watch`, observe "embedded N" in cycle output
5. `chronicler narrative context --query-type fortress_saga` — verify semantic blocks appear
6. API: `GET /api/narrative/context?query_type=world_overview` — verify embedding results
