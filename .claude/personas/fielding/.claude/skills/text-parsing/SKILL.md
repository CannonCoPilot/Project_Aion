---
name: text-parsing
description: Parse complex-layout text of any format — epub, PDF (incl. columnar), HTML, raw txt, OCR text, scanned page images. Use when: extract text, parse epub, PDF columns, apparatus/footnotes, OCR, scans, long-s, ligatures, dehyphenate, split a document into units, normalise text.
---
# text-parsing — use what exists, do not rewrite it

**Born-digital (Palimpsest product code, tested, venv `Projects/palimpsest/core/.venv`, Python 3.12):**
| need | module (`core/palimpsest/`) |
|---|---|
| PDF / EPUB / HTML / MD / txt → text | `ingest/extractor.py` `extract_text` |
| EPUB sections, endnote links, OPF metadata, with offsets | `ingest/epub_parser.py` `parse_epub` |
| column-aware PDF, body vs apparatus | `ingest/lds_columnar.py` `extract_fulltext` |
| NFC, quotes, Gutenberg boilerplate, sha256 | `ingest/normalizer.py` |
| sentences / paragraphs / sections, offset-anchored | `ingest/segmenter.py` |
| front/back matter, chapters, verses | `layout.py` `detect_layout_sections` |

**Scanned pages and OCR (OriginalDR, `projects/originaldr/ocr-spike/`):** follow the
`/Users/nathanielcannon/Claude/Project_Aion/.claude/skills/AI_OCR/SKILL.md` ladder (Kraken R2 → vision-LLM R3) and the
transcription rules in memory. Only one olmOCR model may run at a time (`r3-runner-v3.sh`).

**OCR text you did not make (archive.org `_djvu.txt`):** dehyphenate at line ends, strip running heads and
margin noise, use `_page_numbers.json` for citable pages, and mark `text_quality="ocr"`.

## Rules
- State the text rule in the parser's docstring: what is removed, what is kept, and why.
- Every derived unit keeps character offsets back into its source.
- A splitter or cleaner is validated against a known-answer set before it touches the real corpus.
