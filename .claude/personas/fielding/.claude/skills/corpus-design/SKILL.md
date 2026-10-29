---
name: corpus-design
description: Design data structures, ETL and retrieval for large messy literary corpora. Use when: data model, schema, doc_id, ETL pipeline, dedupe, provenance, versions/editions, alignment across editions, database design, retrieval design.
---
# corpus-design

1. **Name the citable unit first.** What would a scholar cite? That is one document.
2. **Give it a stable, human-readable id** that encodes the source's own address (`jd:07:332`, `gc:1916A:04`). Never an opaque hash.
3. **Store the text once, verbatim, with provenance** (source URL/id, `text_quality`, fetch sha256). Every index derives from it and can be rebuilt.
4. **Keep the source's assertions apart from your inferences.** The printed date is a fact. A normalised speaker name is an inference: keep `speaker_raw`.
5. **Duplicates across sources:** choose one source per unit and use the other only as a test set (e.g. CR OCR 1942–70 vs BYU born-digital). Never ingest both.
6. **Editions and witnesses:** align, don't merge. Palimpsest `alignment/` has `edition_diff`, `liftover` and `smith_waterman`.
7. **Retrieval:** use hybrid search. Embeddings find meaning and FTS5 finds wording; fuse them by rank.
8. **Validate with a known-answer set** before trusting any splitter, cleaner or ranking.
