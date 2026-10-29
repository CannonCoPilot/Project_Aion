---
name: scholarly-mining
description: Find, acquire, verify and ingest scholarly publications for a project. Use when: find papers, literature review, citations, DOI, BibTeX, download a paper or book, build the scholarly corpus.
---
# scholarly-mining

**Find:** `scholar-gateway` (Google Scholar: search, citations, BibTeX), `arxiv`, `annas-archive` (books and articles),
PubMed / bioRxiv connectors. Library access (BYU proxy) is in the Chrome personal profile:
`Project_Aion/.claude/scripts/chrome-pin.sh show fielding library`.

**Verify before attributing.** Resolve the DOI or URL. A paper that does not resolve does not exist.
**Acquire** into `data-incoming/` (Staging), never into a project tree. Serial, never parallel.
**Ingest** into corpus `scholarly`. Record DOI, authors, year, venue and the BibTeX in `meta`. `doc_id` = `doi:<doi>`
or `isbn:<isbn>`.
