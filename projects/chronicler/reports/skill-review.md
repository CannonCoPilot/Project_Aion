# Chronicler / DwarfCron Project -- Skill Review Document

**Purpose**: Comprehensive reference of every Jarvis skill relevant to Chronicler development.
Each skill is assessed for its direct applicability to building the Chronicler application suite
(World History Visualizer, Database Explorer, AI Storyteller, AI Player, Mod Manager, Labor Manager,
Data ETL, CDM/Database, LLM Architecture, Backend/Frontend).

**Date**: 2026-02-24
**Skills Reviewed**: 31 (all skills in `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/`)
**Relevance Tiers**: CRITICAL (directly enables Chronicler work), HIGH (regularly useful),
MODERATE (useful in specific contexts), LOW (marginally relevant), INFRASTRUCTURE (supports
the development environment rather than the product itself).

---

## Table of Contents

1. [CRITICAL -- Chronicler-Specific](#1-critical----chronicler-specific)
   - 1.1 chronicler-ops
2. [HIGH -- Core Development Skills](#2-high----core-development-skills)
   - 2.1 research-ops
   - 2.2 knowledge-ops
   - 2.3 mcp-ops (router)
   - 2.4 mcp-builder
   - 2.5 ralph-loop
   - 2.6 dev-ops
   - 2.7 validation
3. [MODERATE -- Document and Presentation Skills](#3-moderate----document-and-presentation-skills)
   - 3.1 doc-ops (router)
   - 3.2 xlsx
   - 3.3 pdf
   - 3.4 docx
   - 3.5 pptx
   - 3.6 deck-ops
4. [MODERATE -- Web and Data Retrieval](#4-moderate----web-and-data-retrieval)
   - 4.1 web-fetch
   - 4.2 filesystem-ops
   - 4.3 git-ops
5. [INFRASTRUCTURE -- Session and Autonomy Management](#5-infrastructure----session-and-autonomy-management)
   - 5.1 autonom-ops (router)
   - 5.2 session-management
   - 5.3 context-management
   - 5.4 autonomous-commands
   - 5.5 self-ops (router)
   - 5.6 self-improvement
   - 5.7 jarvis-status
   - 5.8 usage-dashboard
6. [SPECIALIZED / NICHE](#6-specialized--niche)
   - 6.1 ulfhedthnar
   - 6.2 skill-creator
   - 6.3 plugin-decompose
   - 6.4 mcp-validation
   - 6.5 weather
   - 6.6 example-skill
7. [Cross-Cutting Patterns for Chronicler](#7-cross-cutting-patterns-for-chronicler)
8. [Recommended Skill Usage by Chronicler Component](#8-recommended-skill-usage-by-chronicler-component)

---

## 1. CRITICAL -- Chronicler-Specific

### 1.1 chronicler-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/chronicler-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | opus |
| **Category** | development |
| **Commands** | `/vm`, `/df` |

**What it does**: The primary skill for all Chronicler and Dwarf Fortress operations. Provides
end-to-end workflow guidance for VM lifecycle management (UTM/utmctl), DFHack RPC interaction,
Lua bridge pipeline, legends XML ingestion, live watcher management, file transfer (SCP, HTTP,
Guest Agent), HomeServer deployment, performance profiling, and snapshot management.

**Chronicler relevance**: This is the single most important skill for Chronicler development.
Every aspect of the Chronicler project touches this skill.

**Key patterns and workflows it enables**:

1. **VM Lifecycle (Workflow 0, 5, 6)**: Boot/stop/snapshot the DF-Windows UTM VM. File transfer
   via SCP (~19 MB/s), HTTP file server (~105 MB/s), or Guest Agent (~0.24 MB/s emergency fallback).
   Critical for all development cycles that require game interaction.

2. **Bridge Pipeline (Workflow 1)**: Deploy `chronicler-bridge.lua` to VM, start as DFHack repeat
   job, verify 7 HTTP JSON endpoints (`game_time`, `units`, `fortress`, `creature_raws`,
   `populations`, `weather`, `military`). This is the primary real-time data extraction mechanism
   for the live watcher component.

3. **Live Watcher (Workflow 2)**: Start the Chronicler watcher that polls DFHack RPC + bridge
   endpoints, detects changes, and writes to PostgreSQL. This is the heart of the real-time
   data pipeline that feeds the Database Explorer, AI Storyteller, and Labor Manager components.

4. **Legends Ingestion (Workflow 3)**: Parse and load Dwarf Fortress legends XML exports into
   the PostgreSQL CDM schema. Covers both pre-embark and post-embark snapshots. This is the
   primary batch data ingestion path that populates the World History Visualizer and all historical
   data components.

5. **Legends Comparison (Workflow 4)**: Diff pre-embark and post-embark legends to identify new
   events, entities, and world-state changes. Directly supports the "what happened during the
   embark" narrative generation for the AI Storyteller.

6. **HomeServer Deployment (Workflow 8)**: Deploy Lua scripts and configuration to the physical
   HomeServer (192.168.4.194) via SMB/impacket. Supports the multi-target deployment model
   (VM for dev, HomeServer for production-like testing).

7. **Legends Export Automation (Workflow 9)**: Full pipeline from in-game export to transfer to
   PostgreSQL ingestion. Supports the automated data refresh cycle.

8. **Performance Profiling (Workflow 7)**: Measure DFHack RPC latency, ListUnits throughput,
   bridge HTTP response times, and watcher cycle times. Critical for optimizing the data pipeline
   and understanding capacity constraints.

**Connection details documented**:
- DFHack RPC (VM): `192.168.64.3:5000` (TCP/protobuf)
- Bridge HTTP (VM): `192.168.64.3:8888` (HTTP/JSON)
- SSH (VM): `192.168.64.3:22` (key: `~/.ssh/df-vm`)
- File Server (VM): `192.168.64.3:8889` (HTTP)
- PostgreSQL: `localhost:5432` (db=chronicler)

**Key paths**:
- Chronicler source: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`
- CLI entrypoint: `/Users/nathanielcannon/Claude/Projects/DwarfCron/.venv/bin/chronicler`
- DFHack client: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/client.py`
- Bridge Lua: `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua`
- VM scripts: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh`
- Legends data: `/Users/nathanielcannon/Claude/Projects/DwarfCron/data/legends/`

**Comprehensive troubleshooting table**: Covers 13 common issues with causes and fixes, including
DFHack RPC timeouts, bridge empty JSON, utmctl quirks, SSH key issues, path escaping, OpenSSH
ARM64 requirements, and more.

---

## 2. HIGH -- Core Development Skills

### 2.1 research-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/research-ops/SKILL.md` |
| **Version** | 2.2.0 |
| **Model** | opus |
| **Backends** | 14 (web, academic, financial, AI-augmented, scraping) |

**What it does**: Multi-source research skill with 14 backends including WebSearch (built-in),
Brave Search, arXiv, Wikipedia, Perplexity AI search, Tavily, Serper/SerpAPI, PubMed, Firecrawl,
ScraperAPI, Alpha Vantage, Context7, and GPTResearcher. Provides scripts for search, synthesis,
and research planning.

**Chronicler relevance (HIGH)**: Essential for researching Dwarf Fortress internals, DFHack APIs,
similar projects (df-ai, df-narrator, weblegends), modding communities, and game data structures.
Also valuable for researching visualization libraries, ETL patterns, and LLM integration approaches.

**Key workflows for Chronicler**:

- **DFHack API Research**: Use WebSearch + WebFetch to explore DFHack documentation, Lua scripting
  guides, and RPC protocol specifications. Essential for expanding the bridge pipeline and adding
  new data extraction endpoints.

- **Competitor/Reference App Analysis**: Research existing DF tools (Legends Viewer, Dwarf Therapist,
  Soundsense, Stonesense) to identify features for the Chronicler components. Perplexity sonar
  mode provides AI-synthesized summaries with citations.

- **Visualization Library Selection**: Research D3.js, Plotly, Recharts, and other visualization
  frameworks for the World History Visualizer. Use `search-arxiv.sh` for academic papers on
  historical data visualization and timeline rendering.

- **LLM Architecture Research**: Research RAG patterns, prompt engineering techniques, and
  narrative generation approaches for the AI Storyteller and AI Player components. arXiv backend
  covers ML/AI papers.

- **Research Plan + Synthesize Pipeline**: `research-plan.sh` decomposes complex questions into
  sub-queries; `research-synthesize.sh` aggregates results from multiple backends into a
  structured synthesis. Use for comprehensive feature research phases.

**Scripts**:
- `scripts/search-brave.sh` -- web/news/video search with freshness filters
- `scripts/search-arxiv.sh` -- academic papers (CS/ML/physics)
- `scripts/fetch-wikipedia.sh` -- encyclopedia facts
- `scripts/search-perplexity.sh` -- AI-augmented search with citations
- `scripts/research-plan.sh` -- query decomposition
- `scripts/research-synthesize.sh` -- multi-source aggregation

---

### 2.2 knowledge-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/knowledge-ops/SKILL.md` |
| **Version** | 2.1.0 |
| **Model** | opus |
| **Architecture** | 4-tier memory hierarchy |

**What it does**: Manages the 4-tier memory architecture: Tier 1 (Dynamic KG via Memory MCP),
Tier 2 (Persistent files -- MEMORY.md, patterns, session state), Tier 3 (Semantic RAG via
local-rag/Qdrant), Tier 4 (Documentary grounding -- design docs, plans, configs). Also includes
the Lotus Wisdom reflection patterns (AC-05/06) and Knowledge Lifecycle Management with maturity
stages (Seedling, Growing, Evergreen).

**Chronicler relevance (HIGH)**: The Chronicler project generates a large volume of design
decisions, research findings, and implementation patterns that must persist across sessions.
The knowledge-ops skill is the system for retaining and retrieving this accumulated knowledge.

**Key workflows for Chronicler**:

- **Cross-Session Memory**: Store DFHack API discoveries, CDM schema decisions, and performance
  baselines in Tier 2 (MEMORY.md) so they survive session boundaries. Critical DFHack gotchas
  (RPC hangs, Prism emulation quirks) are already stored here.

- **Research Indexing**: Ingest repository analysis reports, legends XML structure documentation,
  and feature research into Tier 3 (Qdrant RAG) for semantic retrieval. When researching a new
  feature, query the RAG for previously documented findings.

- **Design Document Grounding**: Use Tier 4 to reference authoritative design documents (CDM
  schema, pipeline architecture, component PRDs) during implementation. Prevents design drift.

- **Pattern Storage**: Store recurring Chronicler development patterns (bridge endpoint addition
  workflow, CDM table creation pattern, legends parsing pattern) as Tier 2 patterns for reuse.

- **Knowledge Graph**: Use Tier 1 (Memory MCP) during active development sessions to track
  relationships between entities (DFHack functions, CDM tables, bridge endpoints, component
  dependencies).

**Tier selection guide for Chronicler**:
- "What DFHack function do I need?" -- Tier 3 (RAG search over indexed repos)
- "What's the CDM schema for historical_events?" -- Tier 4 (Read schema file directly)
- "What did we decide about the watcher polling interval?" -- Tier 2 (MEMORY.md or session state)
- "Which bridge endpoints feed into the Labor Manager?" -- Tier 1 (session KG)

---

### 2.3 mcp-ops (Router)

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/mcp-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Absorbs** | mcp-builder, mcp-validation, plugin-decompose, skill-creator |

**What it does**: Router skill that dispatches to four sub-skills for the full MCP/skill lifecycle:
building new MCP servers, validating existing MCPs, decomposing plugins for integration, and
creating new skills.

**Chronicler relevance (HIGH)**: The Chronicler project may benefit from custom MCP servers for
specialized tool access (e.g., a DFHack MCP server, a Legends query MCP, or a CDM exploration
MCP). This router provides the entry point for building and validating such servers.

**Key workflows for Chronicler**:
- **Build DFHack MCP**: If we decide to expose DFHack commands as MCP tools, `mcp-builder`
  provides the 4-phase workflow (Research, Implement, Review/Test, Evaluate) with TypeScript
  and Python patterns.
- **Build CDM Query MCP**: Expose PostgreSQL CDM queries as MCP tools for natural-language
  database exploration -- directly supports the Database Explorer component.
- **Validate Integration**: After building a new MCP, use `mcp-validation` to verify installation,
  configuration, and functional correctness through the 5-phase harness.
- **Create Chronicler Skills**: Use `skill-creator` to package new Chronicler-specific workflows
  into reusable skills (e.g., a `legends-analysis` skill, a `cdm-migration` skill).

---

### 2.4 mcp-builder

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/mcp-builder/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~23,000 |

**What it does**: Complete guide for creating MCP servers that enable LLMs to interact with
external services. Covers the full lifecycle: deep research and planning, implementation
(project structure, core infrastructure, tools), review/testing, and evaluation creation.
Supports both TypeScript (recommended) and Python (FastMCP).

**Chronicler relevance (HIGH)**: The Chronicler architecture will eventually need MCP servers to
expose game data, CDM queries, and DFHack commands as tools that Claude (or other LLMs) can
use directly. This is especially relevant for:

- **AI Storyteller**: An MCP server exposing narrative-relevant CDM queries would let the
  storytelling LLM pull historical events, character relationships, and world state on demand.

- **AI Player**: An MCP server wrapping DFHack commands would let an AI agent issue game
  commands (designate mining, assign labors, manage military) through structured tool calls.

- **Database Explorer**: An MCP server with CDM schema-aware query tools would provide
  natural-language database exploration capabilities.

**Key patterns**:
- 4-phase workflow: Research, Implement, Review/Test, Evaluate
- Tool design: Zod/Pydantic schemas, output schemas, annotations
- FastMCP 3.0 for Python servers (already used for local-rag and graphiti MCPs)
- Reference files in `reference/`: mcp_best_practices.md, node_mcp_server.md, python_mcp_server.md

---

### 2.5 ralph-loop

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/ralph-loop/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | sonnet |
| **Commands** | `/ralph-loop`, `/cancel-ralph` |

**What it does**: Iterative prompt-feeding engine for autonomous task cycling. The same prompt
is re-fed on each exit; Claude sees accumulated work in files and git history. Each iteration
must demonstrate measurable progress. Features configurable max iterations, completion promise
detection (`<promise>DONE</promise>`), and strict operational rules preventing false promises,
premature exit, scope reduction, and idle iterations.

**Chronicler relevance (HIGH)**: Many Chronicler development tasks are iterative and convergent,
making them ideal candidates for the Ralph Loop:

- **CDM Schema Evolution**: "Add CDM tables for all remaining legends_plus entity types. Run
  migration, verify ingestion counts. Iterate until all entity types are covered."

- **Bridge Endpoint Expansion**: "Add HTTP endpoints for all 41 RemoteFortressReader RPC
  functions. Deploy, test each endpoint, document response format. Iterate until complete."

- **Test Suite Building**: "Add unit tests for all chronicler CLI commands. Run tests after each
  addition. Iterate until coverage exceeds 90%."

- **ETL Pipeline Hardening**: "Identify and fix all edge cases in legends XML parsing. Run full
  ingestion, check for errors, fix, re-run. Iterate until zero-error ingestion."

- **Frontend Component Implementation**: "Implement the timeline visualization component. Render,
  review screenshot, fix layout issues. Iterate until visually correct."

**Strict rules that benefit Chronicler work**:
- Minimum 3 iterations prevents premature "done" declarations
- Each iteration must show file changes (enforces actual code writing)
- Scope reduction is explicitly prohibited (prevents cutting features)

---

### 2.6 dev-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/dev-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Commands** | `/dev-test` |

**What it does**: Autonomous testing skill for the Jarvis infrastructure, enabling Jarvis-dev (W5)
to test the primary Jarvis session (W0). Includes 5 workflows: automated test suite, JICM cycle
testing, command IPC testing, hook validation, and prompt delivery + idle detection.

**Chronicler relevance (HIGH)**: While primarily an infrastructure testing skill, the dev-ops
patterns are directly applicable to Chronicler integration testing:

- **Bridge Pipeline Testing**: Adapt the send-prompt-and-capture-output pattern to test bridge
  endpoint responses, watcher cycle completion, and data flow to PostgreSQL.

- **End-to-End Pipeline Validation**: Use the JICM cycle test pattern as a template for
  testing the full Chronicler pipeline (VM boot, bridge start, watcher start, data verification).

- **Automated Regression**: Build test suites for Chronicler CLI commands using the dev-ops
  test runner pattern (bash scripts with pass/fail reporting).

**Key scripts**:
- `send-to-jarvis.sh` -- send prompts, wait for idle (pattern reusable for CLI testing)
- `capture-jarvis.sh` -- capture output (pattern reusable for log verification)
- `watch-jicm.sh` -- poll state (pattern reusable for watcher state monitoring)
- `jarvis-live-tests.sh` -- automated test runner (template for Chronicler test suite)

---

### 2.7 validation

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/validation/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Commands** | `/tooling-health`, `/health-report`, `/validate-selection`, `/design-review` |

**What it does**: Comprehensive validation across four domains: tooling health (MCPs, plugins,
hooks, skills, subagents), infrastructure health (Docker, Memory MCP, context files), selection
accuracy (tool/agent/skill selection tests), and design review (PARC pattern: Prompt, Assess,
Relate, Create).

**Chronicler relevance (HIGH)**: The `/design-review` command is particularly valuable for
Chronicler development. Before implementing a new component (e.g., the Labor Manager UI, the
AI Player command system, a new CDM migration), running a PARC review ensures the approach
is sound:

- **Prompt**: Parse the feature requirement clearly
- **Assess**: Check existing patterns, search for prior art in the codebase
- **Relate**: Consider architectural impact on other components
- **Create**: Recommend implementation approach

The `/health-report` command verifies Docker services (PostgreSQL, Qdrant, Neo4j) are running,
which is essential since Chronicler depends on PostgreSQL for the CDM.

---

## 3. MODERATE -- Document and Presentation Skills

### 3.1 doc-ops (Router)

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/doc-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Absorbs** | docx, xlsx, pdf, pptx |

**What it does**: Router for all document format operations. Dispatches to docx (Word), xlsx
(Excel), pdf (PDF), and pptx (PowerPoint) sub-skills. Also handles format conversion
(Any to PDF via soffice, PDF to images via pdftoppm, DOCX to markdown via pandoc).

**Chronicler relevance (MODERATE)**: Useful for producing project deliverables: PRD documents,
roadmap presentations, data analysis reports, and research syntheses. The conversion patterns
(especially markdown to docx/pdf) support polished document generation from Chronicler planning
artifacts.

---

### 3.2 xlsx

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/xlsx/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~2,600 |

**What it does**: Spreadsheet creation, editing, and analysis with formulas, formatting, and
data visualization. Supports openpyxl for complex formatting/formulas and pandas for data
analysis. Includes LibreOffice-based formula recalculation.

**Chronicler relevance (MODERATE)**: Useful for:

- **Data Analysis Reports**: Generate Excel spreadsheets from CDM query results for analysis
  of world demographics, event distributions, entity counts, and historical trends.

- **CDM Schema Documentation**: Create formatted spreadsheets documenting all CDM tables, their
  columns, foreign key relationships, and record counts.

- **Performance Baselines**: Track and visualize pipeline performance metrics (ingestion times,
  watcher cycle durations, RPC latencies) in Excel with formulas.

- **Legends Comparison Reports**: Structure pre-embark vs. post-embark entity counts in
  spreadsheet format with formula-based deltas.

---

### 3.3 pdf

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/pdf/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~8,300 |

**What it does**: PDF creation (reportlab), extraction (pdfplumber, pypdf), merging, splitting,
form filling, OCR (pytesseract), and command-line tools (pdftotext, qpdf, pdftk).

**Chronicler relevance (MODERATE)**: Primarily useful for:

- **Report Generation**: Create polished PDF reports from Chronicler data (world histories,
  fortress timelines, demographic analyses) using reportlab.

- **Table Extraction from Reference PDFs**: If DF modding documentation or game data references
  are in PDF format, pdfplumber can extract tables for ingestion into the CDM.

- **Documentation Distribution**: Convert planning documents and PRDs to PDF for sharing.

---

### 3.4 docx

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/docx/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~12,500 |

**What it does**: Word document creation (docx-js), editing (OOXML manipulation), tracked changes
(redlining workflow), text extraction (pandoc), and raw XML access.

**Chronicler relevance (MODERATE)**: Useful for producing formal project documentation (PRDs,
design documents, roadmaps) in Word format when required. The tracked changes workflow supports
collaborative document review processes.

---

### 3.5 pptx

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/pptx/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~14,000 |

**What it does**: PowerPoint creation (html2pptx workflow), editing (OOXML), template-based
creation (rearrange + inventory + replace workflow), thumbnail grids, and slide-to-image conversion.

**Chronicler relevance (MODERATE)**: Useful for creating project presentations, feature demos,
and stakeholder updates about Chronicler development progress.

---

### 3.6 deck-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/deck-ops/SKILL.md` |
| **Version** | 1.2.0 |
| **Model** | sonnet |
| **Token Cost** | ~18,000 |

**What it does**: End-to-end presentation creation with a 7-phase pipeline (Discover, Envision,
Architect, Design, Generate, Review, Refine). Includes zone-based layout model, audience-first
design philosophy, and iterative refinement via the "Presentation Wiggum Loop."

**Chronicler relevance (MODERATE)**: Best used when creating high-quality presentations about
the Chronicler project for stakeholders or showcasing features. The research-backed, narrative-arc
approach produces more compelling presentations than simple bullet-point slides.

---

## 4. MODERATE -- Web and Data Retrieval

### 4.1 web-fetch

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/web-fetch/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | sonnet |
| **Replaces** | mcp__fetch, mcp__mcp-gateway__fetch |

**What it does**: Web content retrieval using WebFetch (HTML to markdown + AI processing),
WebSearch (web search), curl (API calls, file downloads), and gh CLI (GitHub content).

**Chronicler relevance (MODERATE)**: Essential for:

- **DFHack Documentation**: Fetch DFHack wiki pages, GitHub READMEs, and Lua scripting guides
  using WebFetch for AI-processed summaries.

- **DF Community Resources**: Search for and retrieve Dwarf Fortress modding guides, community
  tools, and data format documentation.

- **GitHub Repository Analysis**: Use `gh` CLI to explore DF-related repositories (df-structures,
  dfhack-client-python, weblegends) for feature research.

- **API Documentation**: Fetch documentation for libraries being evaluated for Chronicler
  (visualization frameworks, database drivers, web frameworks).

---

### 4.2 filesystem-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/filesystem-ops/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | haiku |
| **Replaces** | mcp__filesystem (15 tools) |

**What it does**: File and directory operations using built-in tools (Read, Write, Edit, Glob,
Grep) and Bash commands (ls, mkdir, mv, stat). Works with any absolute path.

**Chronicler relevance (MODERATE)**: Foundational skill used constantly during Chronicler
development for reading source files, editing code, searching the codebase, and managing
file structures. The selection rules (Glob for finding files, Grep for content search, Read/Write
for content operations) apply directly to navigating the DwarfCron codebase.

---

### 4.3 git-ops

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/git-ops/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | sonnet |
| **Replaces** | mcp__git (12 tools) |

**What it does**: Git operations via Bash commands. Covers status, log, diff, show, branches,
fetch, checkout, stage, commit (HEREDOC pattern), and push (PAT workflow with
`CannonCoPilot` token from credentials.yaml).

**Chronicler relevance (MODERATE)**: All Chronicler development is version-controlled on the
`Project_Aion` branch. The git-ops skill provides the commit and push patterns needed to save
work. The PAT-based push workflow is specific to the AIfred/Jarvis repo structure.

---

## 5. INFRASTRUCTURE -- Session and Autonomy Management

These skills support the Jarvis development environment rather than the Chronicler product
directly. However, they are essential for maintaining productive development sessions.

### 5.1 autonom-ops (Router)

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/autonom-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Absorbs** | autonomous-commands, session-management, context-management, ralph-loop |

**What it does**: Router for session orchestration. Dispatches to autonomous-commands (signal-based
native command execution), session-management (session lifecycle), context-management (JICM v6.1
context monitoring), and ralph-loop (iterative development).

**Chronicler relevance (INFRASTRUCTURE)**: Keeps development sessions healthy. The context
management sub-skill is particularly important during long Chronicler development sessions that
consume large amounts of context reading source files, legends XML, and database schemas.

---

### 5.2 session-management

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/session-management/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | sonnet |
| **Commands** | `/checkpoint`, `/end-session` |

**What it does**: Session lifecycle management: start (AC-01: greeting, load state, suggest action),
checkpoint (save state for MCP restart), and end (AC-09: commit, push, notification). Supports
continue (default) and fresh (--fresh) launch modes.

**Chronicler relevance (INFRASTRUCTURE)**: Ensures Chronicler work state is preserved across
session boundaries. The `/checkpoint` command saves current task state before MCP restarts, and
`/end-session` commits and pushes all Chronicler work.

---

### 5.3 context-management

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/context-management/SKILL.md` |
| **Version** | 5.0.0 |
| **Model** | sonnet |
| **Commands** | `/context-budget`, `/context-checkpoint`, `/smart-compact`, `/intelligent-compress` |

**What it does**: JICM v6.1 context monitoring, analysis, and compaction. Manages context
thresholds (50% caution, 55% compress trigger, 73% emergency, 78.5% lockout). Automatic
compression via jicm-watcher.sh (stop-and-wait model). Includes proactive context reduction
techniques: observation masking, context ordering, and context partitioning.

**Chronicler relevance (INFRASTRUCTURE)**: Chronicler development sessions are context-heavy due
to reading large source files, legends XML, and database schemas. Effective context management
prevents data loss from auto-compaction. The observation masking technique (write verbose output
to temp file, inject compact summary) is especially important when reading large legends XML
files or long database query results.

---

### 5.4 autonomous-commands

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/autonomous-commands/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | haiku |

**What it does**: Execute Claude Code built-in slash commands autonomously via signal-based
watcher system. Signal files are written by Claude and consumed by the command-handler in tmux
window 4, which injects keystrokes into the primary Jarvis session.

**Chronicler relevance (INFRASTRUCTURE)**: Enables autonomous context management during long
Chronicler development sessions. The `signal_compact` function can trigger context compaction
without interrupting the development flow.

---

### 5.5 self-ops (Router)

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/self-ops/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Absorbs** | self-improvement, jarvis-status, validation |

**What it does**: Router for self-improvement, status monitoring, and validation workflows.
Dispatches to self-improvement (AC-05 through AC-08), jarvis-status (autonomic system health),
and validation (tooling/infrastructure/selection/design review).

**Chronicler relevance (INFRASTRUCTURE)**: The self-improvement cycle (reflect, maintain,
research, evolve) can identify and fix issues in the Chronicler development workflow. The
validation sub-skill's `/health-report` checks Docker services that Chronicler depends on.

---

### 5.6 self-improvement

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/self-improvement/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Commands** | `/self-improve`, `/reflect`, `/evolve`, `/research`, `/maintain` |

**What it does**: Orchestrates AC-05 through AC-08 for continuous improvement: reflection
(analyze corrections, identify patterns), maintenance (codebase hygiene, freshness audits),
R&D (discover improvements), and evolution (implement proposals with risk assessment).

**Chronicler relevance (INFRASTRUCTURE)**: The `/reflect` command can analyze Chronicler-related
corrections and mistakes to improve future development. The `/maintain` command can identify
stale Chronicler documentation, orphaned planning files, and outdated schema docs. The `/research`
command can discover new tools and patterns relevant to Chronicler development.

---

### 5.7 jarvis-status

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/jarvis-status/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |

**What it does**: Display the current status of all Jarvis autonomic components (AC-01 through
AC-09) with health grades (A+ through F), recent activity logs, and active alerts.

**Chronicler relevance (INFRASTRUCTURE)**: Provides a quick health check of the development
environment. Useful at the start of a Chronicler development session to verify all systems are
operational.

---

### 5.8 usage-dashboard

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/usage-dashboard/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | haiku |
| **Commands** | `/usage`, `/usage daily`, `/usage monthly`, `/usage blocks` |

**What it does**: Token usage analytics via ccusage (daily/monthly/blocks/totals), cmonitor
(realtime session monitoring), and claude-spend (browser dashboard).

**Chronicler relevance (INFRASTRUCTURE)**: Helps monitor token consumption during Chronicler
development. Long development sessions with large file reads and database queries can consume
significant tokens. The `/usage today` command provides quick visibility into current spend.

---

## 6. SPECIALIZED / NICHE

### 6.1 ulfhedthnar

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/ulfhedthnar/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | opus |
| **Activation** | Detection hook threshold OR `/unleash` command |
| **Status** | Locked / Internal |

**What it does**: AC-10 Neuros Override System -- "berserker problem-solving mode." Activates
when normal approaches are exhausted. Features 5 Override Protocols: Frenzy Mode (parallel agent
decomposition), Berserker Wiggum Loop (mandatory minimum iterations with forced reframing),
Approach Rotation (6 systematic strategies), Escalation Ladder (progressive escalation from
local search to user), and Progress Anchoring (persistent partial solutions).

**Chronicler relevance (SPECIALIZED)**: Valuable when stuck on hard Chronicler problems:

- **DFHack Integration Barriers**: When RPC calls hang, bridge endpoints fail, or Prism emulation
  causes unexpected behavior, the Frenzy Mode spawns 4 parallel agents (Direct, Research,
  Decompose, Creative) to attack the problem simultaneously.

- **Complex Data Mapping**: When legends XML structures don't map cleanly to the CDM schema,
  the Approach Rotation cycles through Direct, Decompose, Analogize, Invert, Brute-force, and
  Creative strategies.

- **Performance Bottlenecks**: When the data pipeline is too slow and obvious optimizations
  don't help, the Berserker Wiggum Loop forces 5+ iterations with mandatory reframing at each
  step.

**Safety constraints**: Cannot bypass destructive operation confirmations, respects JICM context
budgets, auto-disengages after problem resolution or strategy exhaustion.

---

### 6.2 skill-creator

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/skill-creator/SKILL.md` |
| **Version** | 1.0.0 |
| **Model** | sonnet |
| **Token Cost** | ~5,100 |

**What it does**: Guide for creating new skills. Covers the 6-step process: understand with
concrete examples, plan reusable contents, initialize (init_skill.py), edit (SKILL.md + resources),
package (package_skill.py), and iterate. Emphasizes progressive disclosure (metadata, SKILL.md
body, bundled resources) and concise context-aware design.

**Chronicler relevance (SPECIALIZED)**: Useful if Chronicler development reveals the need for
new specialized skills, such as:
- `legends-analysis` -- workflows for comparing and analyzing legends XML snapshots
- `cdm-migration` -- workflows for CDM schema evolution and data migration
- `df-lua-scripting` -- reference guide for writing DFHack Lua scripts

---

### 6.3 plugin-decompose

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/plugin-decompose/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | sonnet |

**What it does**: Analyze and decompose Claude Code plugins for integration into Jarvis as
native tools. Features 9-step workflow: Browse, Discover, Review, Analyze, Scan Redundancy,
Decompose, Execute (with dry-run), and Rollback.

**Chronicler relevance (LOW)**: Primarily relevant if third-party Claude Code plugins are
discovered that could benefit Chronicler development (e.g., a database exploration plugin, a
data visualization plugin).

---

### 6.4 mcp-validation

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/mcp-validation/SKILL.md` |
| **Version** | N/A |
| **Model** | sonnet |

**What it does**: Systematic 5-phase MCP server validation: installation verification,
configuration audit, tool inventory, functional testing, and tier recommendation (Tier 1 always-on,
Tier 2 task-scoped, Tier 3 triggered).

**Chronicler relevance (LOW)**: Only relevant when validating new MCP servers built for the
Chronicler project (e.g., after building a DFHack MCP or CDM query MCP using mcp-builder).

---

### 6.5 weather

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/weather/SKILL.md` |
| **Version** | 2.0.0 |
| **Model** | haiku |

**What it does**: Weather information via wttr.in API (no key required). Returns current
conditions for Salt Lake City by default.

**Chronicler relevance (NONE)**: No direct relevance to Chronicler development. This is a
general-purpose utility skill for the Jarvis environment.

---

### 6.6 example-skill

| Field | Value |
|-------|-------|
| **Location** | `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/example-skill/SKILL.md` |
| **Version** | 1.0.0 |

**What it does**: Template and reference for creating new Claude Code plugin skills. Demonstrates
the required structure (SKILL.md with YAML frontmatter) and optional supporting files.

**Chronicler relevance (NONE)**: Reference template only. Useful only if creating new Chronicler-
specific skills (in which case, use `skill-creator` instead for the full workflow).

---

## 7. Cross-Cutting Patterns for Chronicler

Several patterns emerge from reviewing all skills that are particularly valuable for
Chronicler development:

### Pattern: Iterative Convergence (ralph-loop + ulfhedthnar)

**When**: Building features that have clear completion criteria but uncertain path to completion.
**How**: Start with a Ralph Loop (`/ralph-loop "prompt" --max-iterations N`). If stuck after
several iterations, the ulfhedthnar detection hook may trigger berserker mode for more aggressive
problem-solving.
**Example**: Building the legends XML parser for a new entity type -- iterate until all entities
parse cleanly and match expected counts.

### Pattern: Research-then-Build (research-ops + knowledge-ops + mcp-builder)

**When**: Implementing a new Chronicler component that requires external knowledge.
**How**: Use research-ops to gather information (WebSearch for documentation, arXiv for papers,
Perplexity for synthesized answers). Store findings in knowledge-ops Tier 3 (Qdrant RAG) for
future retrieval. Then implement using the gathered knowledge, potentially building MCP servers
for new tool integrations.
**Example**: Researching visualization frameworks for the World History Visualizer -- search,
evaluate, store findings, then implement.

### Pattern: Design-Validate-Build (validation + dev-ops)

**When**: Implementing architectural changes to the Chronicler system.
**How**: Run `/design-review` (PARC pattern) before implementation to verify the approach. After
implementation, use dev-ops testing patterns to validate the change works end-to-end.
**Example**: Changing the watcher polling mechanism -- PARC review first, implement, then
automated pipeline test.

### Pattern: Multi-Target Deployment (chronicler-ops Workflows 5, 8)

**When**: Deploying Chronicler components to both the VM and HomeServer.
**How**: Use chronicler-ops Workflow 5 for VM deployment (bridge + watcher) and Workflow 8 for
HomeServer deployment (SMB/impacket). Test on VM first, then deploy to HomeServer.
**Example**: New bridge endpoint -- deploy to VM via SCP, test, then deploy to HomeServer via SMB.

### Pattern: Data Pipeline Testing (chronicler-ops + dev-ops)

**When**: Verifying the full data extraction and ingestion pipeline.
**How**: Use chronicler-ops Workflow 5 to start the full pipeline, then adapt dev-ops patterns
to verify data flow: check bridge HTTP responses, verify watcher cycle completion, query
PostgreSQL for expected records.
**Example**: After modifying the watcher, run the full pipeline and verify all 7 bridge endpoints
are being consumed and data appears in the correct CDM tables.

### Pattern: Context-Aware Long Sessions (context-management + usage-dashboard)

**When**: Long Chronicler development sessions that read many large files.
**How**: Monitor context usage with `/context` periodically. Use observation masking (write large
outputs to temp files) when reading legends XML or large database result sets. Set up the JICM
watcher for automatic compression at 55%.
**Example**: Reading and analyzing a 50MB legends XML file -- write extracted data to a temp
file, keep only a summary in context.

---

## 8. Recommended Skill Usage by Chronicler Component

| Chronicler Component | Primary Skills | Secondary Skills |
|----------------------|----------------|------------------|
| **World History & Demographics Visualizer** | chronicler-ops (Workflows 3, 4), research-ops | xlsx (data analysis), deck-ops (presentation) |
| **Database Explorer Tools** | chronicler-ops (CDM paths), mcp-builder (CDM MCP) | validation (/design-review), xlsx (data export) |
| **AI Dwarf Fortress Storyteller** | chronicler-ops (Workflows 1, 2), mcp-builder (narrative MCP), research-ops | knowledge-ops (RAG for narrative context) |
| **AI Dwarf Fortress Player** | chronicler-ops (DFHack RPC), mcp-builder (DFHack MCP) | ralph-loop (iterative AI testing), ulfhedthnar (hard problems) |
| **Dwarf Fortress Mod Manager** | research-ops (mod ecosystem research), web-fetch | filesystem-ops, plugin-decompose |
| **Dwarf Fortress Labor Manager** | chronicler-ops (bridge: units, military), mcp-builder | ralph-loop (UI iteration), research-ops (Dwarf Therapist analysis) |
| **Data ETL (Legends XML)** | chronicler-ops (Workflows 3, 9), ralph-loop | dev-ops (pipeline testing), validation |
| **Data ETL (In-Game Memory)** | chronicler-ops (Workflows 1, 2, 7), research-ops (DFHack APIs) | mcp-builder, knowledge-ops |
| **CDM / Database** | chronicler-ops (CDM schema), validation (/design-review) | xlsx (schema docs), ralph-loop (migration iteration) |
| **LLM Architecture** | research-ops (RAG/prompt patterns), mcp-builder, knowledge-ops | web-fetch (paper retrieval) |
| **Backend Framework** | validation (/design-review), dev-ops (testing patterns) | git-ops, filesystem-ops |
| **Frontend Framework** | research-ops (framework selection), ralph-loop (UI iteration) | deck-ops (mockups), pdf (reports) |

---

## Appendix: Complete Skill Inventory

| # | Skill | Version | Model | Type | Chronicler Relevance |
|---|-------|---------|-------|------|---------------------|
| 1 | chronicler-ops | 1.0.0 | opus | standalone | CRITICAL |
| 2 | research-ops | 2.2.0 | opus | standalone | HIGH |
| 3 | knowledge-ops | 2.1.0 | opus | standalone | HIGH |
| 4 | mcp-ops | 1.0.0 | sonnet | router | HIGH |
| 5 | mcp-builder | 1.0.0 | sonnet | standalone | HIGH |
| 6 | ralph-loop | 2.0.0 | sonnet | standalone | HIGH |
| 7 | dev-ops | 1.0.0 | sonnet | standalone | HIGH |
| 8 | validation | 1.0.0 | sonnet | standalone | HIGH |
| 9 | doc-ops | 1.0.0 | sonnet | router | MODERATE |
| 10 | xlsx | 1.0.0 | sonnet | standalone | MODERATE |
| 11 | pdf | 1.0.0 | sonnet | standalone | MODERATE |
| 12 | docx | 1.0.0 | sonnet | standalone | MODERATE |
| 13 | pptx | 1.0.0 | sonnet | standalone | MODERATE |
| 14 | deck-ops | 1.2.0 | sonnet | standalone | MODERATE |
| 15 | web-fetch | 2.0.0 | sonnet | standalone | MODERATE |
| 16 | filesystem-ops | 2.0.0 | haiku | standalone | MODERATE |
| 17 | git-ops | 2.0.0 | sonnet | standalone | MODERATE |
| 18 | autonom-ops | 1.0.0 | sonnet | router | INFRASTRUCTURE |
| 19 | session-management | 2.0.0 | sonnet | standalone | INFRASTRUCTURE |
| 20 | context-management | 5.0.0 | sonnet | standalone | INFRASTRUCTURE |
| 21 | autonomous-commands | 1.0.0 | haiku | standalone | INFRASTRUCTURE |
| 22 | self-ops | 1.0.0 | sonnet | router | INFRASTRUCTURE |
| 23 | self-improvement | 1.0.0 | sonnet | standalone | INFRASTRUCTURE |
| 24 | jarvis-status | 1.0.0 | sonnet | standalone | INFRASTRUCTURE |
| 25 | usage-dashboard | 1.0.0 | haiku | standalone | INFRASTRUCTURE |
| 26 | ulfhedthnar | 1.0.0 | opus | locked | SPECIALIZED |
| 27 | skill-creator | 1.0.0 | sonnet | standalone | SPECIALIZED |
| 28 | plugin-decompose | 2.0.0 | sonnet | standalone | LOW |
| 29 | mcp-validation | N/A | sonnet | standalone | LOW |
| 30 | weather | 2.0.0 | haiku | standalone | NONE |
| 31 | example-skill | 1.0.0 | N/A | template | NONE |

---

*Skill Review Document -- Chronicler / DwarfCron Project*
*Generated 2026-02-24 | Covers all 31 skills in `.claude/skills/`*
