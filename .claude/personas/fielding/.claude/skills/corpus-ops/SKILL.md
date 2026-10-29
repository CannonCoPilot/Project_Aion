---
name: corpus-ops
description: Search, read, browse and extend Fielding's research corpora (LDS discourses, Palimpsest library, scholarly papers). Use when: search the Journal of Discourses, conference talks, what did X teach about Y, find a quotation, exact phrase, speaker, citation, index a corpus, corpus stats.
---
# corpus-ops

**Tools (fielding-corpus MCP):** `corpus_search` · `corpus_document` · `corpus_list` · `corpus_speakers` · `corpus_stats`.
**Shell:** `./fc stats` · `./fc search lds "q" [--mode hybrid|semantic|lexical] [--speaker "Exact Name"] [--year-from/--year-to]` · `./fc index lds`.

## Answering a question from the corpus
1. `corpus_search` in hybrid mode. For a known phrase, use `mode="lexical"` with the phrase in double quotes.
2. **Read before you quote.** Call `corpus_document(doc_id, char_start, char_end)` around the hit. Snippets are for finding text, never for quoting it.
3. Quote verbatim with the hit's `citation`. That citation describes `text`. A `phrase_snippet` is elsewhere in the same document, so locate it before citing it.
4. Speaker filters need the exact catalogued name, which `corpus_speakers` gives you.
5. Say "as reported" (JD) or "as published" (Conference Report / Ensign). Neither is a verbatim recording.

## Extending a corpus
fetch (raw, serial, resumable) → parse (catalog) → index (resumable). See the workspace CLAUDE.md "Pipelines".
A new source gets a `doc_id` prefix documented in CLAUDE.md **before** its first record.
