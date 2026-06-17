
## Rotation 2026-06-06T17:44:07Z (entries pre-6h cutoff)


### 2026-06-06 — Palimpsest Research Expansion + PRD (ACTIVE)

**CURRENTLY RUNNING — 4 deep-reading subagents**:
- Agent 1: Genomics papers (10 items) — Hi-C, TADs, ENCODE, Barabási, TEs, miRNAs
- Agent 2: NLP/narrative papers (12 items) — GNAT, BookNLP, Chambers, Lehnert, Reagan, dotplot, recurrence
- Agent 3: Literary studies books (8 items) — Piper, Underwood, Eve, Moretti, Jockers, Toolan, Carlisle, Burn
- Agent 4: Visualization papers (7 items) — StoryRibbons, storylines, Circos, NetworkNarratives

**WHEN AGENTS RETURN** (next session):
1. Collate all 4 agents' analyses into comprehensive annotated bibliography
2. Use findings to refine PRD (resolve open questions in section 8)
3. Review all documentary work produced this session
4. Finalize PRD with specific technical decisions informed by literature

**Library status**: 45 papers/books on disk + 89 dataset files
- alignment/: 5 files
- visualization/: 6 files
- nlp-narrative/: 24 files (including IJ companions Burn + Carlisle)
- genomics/: 10 files (Hi-C, TADs, Rao loops, ENCODE II, Roadmap, Bonev review, Barabási×2, Senft TEs, Bartel miRNAs)

**Key documents produced this session**:
- `research/domain-synthesis/01-conceptual-framework.md` — 7 sections, ~5000 words
- `research/domain-synthesis/02-PRD-outline.md` — 8-section PRD draft (vision, 5-layer arch, workflows, tech stack, MVP, roadmap)
- `research/reports/04-annotated-research-index.md` — topical lookup (9 sections)
- `research/reports/05-genomics-foundations-catalog.md` — 38 reviews, 9 domains
- `research/bibliography/master-bibliography.md` — 49 entries + pending

**Pipeline** (built earlier this session): `src/pipeline/` — 6 scripts, venv at `.venv/`, tested on CHAPLIN, Moretti, Circos EPUB

**Key discoveries**:
- GNAT (EMNLP 2023) = closest prior art (Smith-Waterman for narrative)
- "Narrative alphabet" = original concept (confirmed by deep-research: no prior work uses this term)
- Swinehart datasets = gold-standard validation data (pos↔seq = fabula/syuzhet mapping)
- ENCODE 46:1 regulation-to-content ratio → text likely similar
- Hi-C paradigm → "Hi-C for text" = cross-reference proximity mapping

### 2026-06-06 — Palimpsest Research + ScholarGateway MCP (PRIOR)

**Project focus**: Computational literary analysis platform (Palimpsest) + cross-domain alignment research
**ScholarGateway MCP**: `/Users/nathanielcannon/Claude/Projects/ScholarGateway/` — 10 tools, scholarly backend, FastMCP 3.0
**Palimpsest**: `/Users/nathanielcannon/Claude/Projects/palimpsest/` — 4-module text comparison system (semantic, syntactic, structural, string matching)
**Research output**: `/Users/nathanielcannon/Claude/Projects/palimpsest/research/`
**HDS Skill**: `.claude/skills/_disabled/hds/` — Hierarchical Delta Synthesis (document merging via delta extraction)

**Research topics (cross-domain alignment thesis)**:
- Whole genome alignment (MUMmer, Cactus, minimap2)
- Protein structural alignment (Foldseek, TM-align, AlphaFold)
- Semantic text alignment (embeddings, passage correspondence)
- Circos plotting and genome browser visualization
- Swinehart Infinite Jest / CYOA visualizations
- NLP for narrative: dialog attribution (BookNLP), emotional arcs, discourse parsing
- Signal extraction from creative text (entropy, surprisal, topic flow)

**Key papers cataloged**: `palimpsest/research/reports/01-alignment-and-visualization-catalog.md`
**Domain synthesis**: `palimpsest/research/domain-synthesis/00-alignment-convergence-thesis.md`

**Status**: ALL PENDING STEPS COMPLETE. Ready for next phase.

**Completed this session (Palimpsest phase)**:
- ScholarGateway MCP: built, venv installed, registered in `.mcp.json`, downloads→`palimpsest/research/papers/`
- Alfred Scholar persona: `alfred/.claude/jobs/personas/scholar/` (config.yaml, prompt.md, mcp.json, permissions.yaml)
- AnnasTools pushed to GitHub: https://github.com/CannonCoPilot/AnnasTools (8 commits, public)
- 17 papers/books downloaded (~139MB) across alignment/, visualization/, nlp-narrative/
- 3 research reports + 1 domain synthesis + 1 master bibliography in palimpsest/research/
- Key concept: "narrative alphabet" inspired by Foldseek's 3Di structural alphabet

**Completed this session (Pipeline v2 phase)**:
- Persona isolation verified: JICM unaffected, 38 .claude/ CLAUDE.md files are lazy-loaded not eager
- Protos seed: restarted at 66K tokens (was 124.8K), Opus 4.6 (was 4.7), primed "Seed ready"
- AION_MODEL env var: single source of truth for model across Jarvis + Protos + bridge + chain-executor
- Seed priming fix: two-step send-keys (text + sleep 0.5 + Enter), detect "bypass permissions" not ❯
- Bridge→Styx rename: all tmux window refs updated in launch-aion.sh + launch-jarvis-tmux.sh
- Window ordering: reorder_windows() function assigns permanent indices (0:Jarvis through 11:Jarvis-dev)
- 15 stale Pulse tasks closed (Anna's Tools battle test residue)
- organization-auditor.sh + setup-hook.sh path fixes
- Commits: 85f9f35, edae452, 0f2a78c, 215c285 (all pushed)

**Remaining for next session**:
- BookNLP paper/docs (Bamman), Chambers & Jurafsky narrative schemas
- Download Swinehart Infinite Digest CSV datasets from samizdat.co/digest/
- Begin Palimpsest module integration with research findings
- "Narrative alphabet" proof-of-concept (encode narrative structure as searchable 1D sequence)
- ScholarGateway: needs restart of Claude Code to pick up new MCP registration

### 2026-06-06 — AnnasTools MCP + Pipeline v2 Fixes (PRIOR)

**AnnasTools MCP Server** — 13 tools, fully tested, organized downloads working.
**Project code**: `/Users/nathanielcannon/Claude/Projects/AnnasTools/`
**Planning/research**: `/Users/nathanielcannon/Claude/Project_Aion/projects/annas_archive/`
**Library**: `/Users/nathanielcannon/Claude/Project_Aion/projects/annas_archive/library/`
**Credentials**: `projects/annas_archive/credentials.txt` (member key: `yqgZHZRM45jA1ZNJKajsMpvLtp8WV`)

**AnnasTools commits (7 total on main):**
- `d1998ab` fix: suppress XMLParsedAsHTMLWarning in EPUB extraction
- `9d8370b` feat: organized downloads — Author/Title/ directory structure
- `cce19d4` feat: add lookupISBN tool for exact ISBN-to-metadata resolution
- `54cf973` feat: add text extraction, search, and RAG chunking tools (extractText, searchText, chunkForRAG)
- `9bcbefd` docs: comprehensive README with architecture + tool reference
- `bffd155` feat: enrich info HTML fallback parser — 12 metadata fields
- `1c2a2f6` feat: Anna's Archive MCP server — 8 tools, live search verified

**13 MCP tools**: searchBook, searchJournal, info, fastDownload, downloadBook, downloadJournal, memberDownload, lookupDoi, lookupISBN, extractText, searchText, chunkForRAG

**Library contents (3 files):**
- `/Users/nathanielcannon/Claude/Project_Aion/projects/annas_archive/library/Virginia Evans/The Correspondent_ A Novel/` — EPUB (5.1MB), MOBI (2.3MB), PDF (4.1MB)

**Pipeline v2 fixes (Project_Aion commits):**
- `fb29ce9` arch: persona-isolated CLAUDE.md — shared root + Jarvis via --add-dir
- `81d0911` fix: reject parent CLAUDE.md imports — eliminates fork autocompact
- `551483b` fix: _capture_seed_session_id checks both project slug paths
- `168ace2` fix: eliminate seed pollution — hard-fail on fork failure
- `982cc46` fix: prevent over-decomposition of retrieval tasks
- `3b6868a` fix: auto-confirm external CLAUDE.md import prompt in seed + fork
- `ea7a655` feat: per-persona MCP loading in pipeline v2
- `3501d89` feat: Alfred book-retriever persona for Anna's Archive MCP
- `82a50de` config: update persona mcp.json download path to library directory

**Root cause chain diagnosed and fixed:**
1. `_capture_seed_session_id` read from wrong project slug dir (symlink vs resolved path) → stale session ID → every `--resume --fork-session` failed with "No conversation found"
2. Fork failure fell back to injecting directly into Protos (seed pollution)
3. Polluted seed grew to 125K tokens; forked Sonnet sessions (200K context) saw 62% usage → autocompact fired → consumed task prompt from paste buffer
4. Fix: persona-isolated CLAUDE.md architecture — root CLAUDE.md stripped to shared-only (734 tokens, zero @-imports), Jarvis identity moved to `.claude/personas/jarvis/CLAUDE.md`, loaded via `--add-dir` flag

**Persona isolation architecture (key change):**
- Root `CLAUDE.md`: shared infrastructure only (workspace layout, guardrails, filesystem policy, git workflow) — NO @-imports
- `.claude/personas/jarvis/CLAUDE.md`: Jarvis identity, autonomic behavior, planning systems, memory tiers, all @-imports to psyche/context files
- `alfred/.claude/CLAUDE.md`: unchanged (Alfred's own)
- `launch-aion.sh`: all 6 Claude launch commands now include `--add-dir .claude/personas/jarvis`
- Alfred seed token footprint: ~30K (14% of Sonnet 200K) — down from 125K (62%)

**Evaluator anti-decomposition fix:**
- `evaluate.py`: changed decomposition criteria from ANY-of to ALL-of, added `action:retrieve` exemption, default to NO decomposition
- Root cause: qwen3:32b evaluator saw numbered steps in task descriptions and atomized them into separate subtasks

**Member account research result:**
- No JSON API for account/quota data. `fast_download.json` returns only `download_url`. Account pages are HTML-only. All implementations handle quota reactively via error codes.

**RAG infrastructure assessment:**
- jarvis-rag MCP: 6 tools, ingest/search/multi_search/list_collections/delete_file/ingest_directory
- Qdrant: 2560-dim Cosine, collections: jarvis-context, codebase, research, sessions + 10 DF repos
- Chunking: 1000 chars, 200 overlap, sentence-boundary aware
- Gap: ingest only reads UTF-8 text — no PDF/EPUB parser. AnnasTools chunkForRAG fills this gap
- No download-then-ingest pipeline exists anywhere yet

**Battle test tasks:**
- `AION-cbdc5e97` The Correspondent: COMPLETE (3 formats downloaded manually)
- `AION-d264447d` Chinese Chestnut Genome: pipeline ran search subtasks, 4 papers documented
- `AION-ab19fdf8` Pseudepigrapha: pipeline ran search, 27 MD5s found
- `AION-84db40a8` PDF download test: executed (PDF downloaded to output/misc, moved to library)

**Protos/Bridge current state:**
- Protos: restarted clean after persona isolation commit, needs re-priming
- Bridge: restarted with all fixes (dual-slug, seed protection, import rejection, per-persona MCP)
- Both need restart AGAIN after persona isolation to benefit from reduced token footprint

**Next steps:**
1. Push AnnasTools to GitHub as public repo
2. Verify Protos seed runs at ~30K tokens (not 125K) after persona isolation takes effect
3. Test end-to-end fork: seed → fork → task injection → download → sentinel
4. Update session-state.md with new architecture
5. Consider adding download-then-ingest RAG pipeline connecting AnnasTools → jarvis-rag

### Reference: Claude Code MCP CLI Flags
- `--mcp-config <path>`: per-session MCP config file
- `--strict-mcp-config`: restrict to only specified MCPs
- `--add-dir <path>`: additional directory with CLAUDE.md processing

### 2026-06-04 — Professional GitHub Presence (COMPLETE)
8 showcase repos public with professional READMEs. Profile README at CannonCoPilot/CannonCoPilot.


## Rotation 2026-06-07T05:33:13Z (entries pre-6h cutoff)


