# Current Priorities

Active tasks and priorities for Project Aion (Jarvis Archon).

**Last Updated**: 2026-02-17
**Version**: v5.10.0

---

## Recently Completed (This Session)

### Stream 1: research-ops v2.1.0 — Native MCP Capability Reconstruction (2026-02-09)

**8 scripts created** in `.claude/skills/research-ops/scripts/`:
- `_common.sh` — shared utilities (credential extraction, HTTP helpers, error handling)
- `search-brave.sh` — Brave Search API (web/news/video/image, freshness filters)
- `search-arxiv.sh` — arXiv paper search (category/author/sort, xmllint parsing)
- `fetch-wikipedia.sh` — Wikipedia REST API (multi-lang, summary/full/search modes)
- `search-perplexity.sh` — Perplexity AI (4 sonar models, dynamic timeout, citations)
- `fetch-context7.sh` — Context7 workflow doc (PARTIAL, requires local-rag MCP)
- `deep-research-gpt.sh` — GPTResearcher workflow doc (BLOCKED, API key TBD)
- `test-all.sh` — validation suite (12/12 pass with real API calls)

**Results**: ~3,100 token savings/session (91% reduction), zero startup overhead, parallel execution enabled.
**Deep analysis**: Capability regressions limited to power-user features (Brave local search, arXiv PDF download, Wikipedia coordinates/fact extraction).

### Lean Core v5.9.0 + MCP Decomposition (2026-02-07/08)

**MCP Decomposition** (13 removed, 5 retained):
- Retained: memory, local-rag, fetch, git, playwright
- 4 replacement skills: filesystem-ops, git-ops, web-fetch, weather
- 14/14 functional tests passed, registry v5.0
- 9,750 tokens saved from tool definitions

**Lean Core Architecture**:
- Manifest router: capability-map.yaml (single authoritative selection guide)
- Pipeline design v4.0 (Decomposition-First paradigm)
- Marketplace research (45 marketplaces, 400+ skills inventoried)

### Master Wiggum Loop Iteration 1 — 14 Tasks (2026-02-08)
**Commit**: 4ac6cc5

| Task | Deliverable |
|------|-------------|
| Registry v5.0 | Complete rewrite, x-ops architecture |
| research-ops v2.0 | 14 backends (+Tavily, Serper, SerpAPI, Firecrawl, ScraperAPI, Perplexity) |
| context-management v4.0 | JICM v5.8.2 aligned (65/73/78.5% thresholds) |
| knowledge-ops v2.0 | 4-tier memory hierarchy |
| Marketplace inventory | 45 marketplaces, 10 functional groups |
| x-ops consolidation design | 22→12 skills (swiss-army-knife pattern) |
| Skill descriptions CSV | 22 skills cataloged, Progressive Disclosure |
| Psyche maps v2 | capability-map.yaml updated, _index.md aligned |
| Self-constitution review | v1.1.0-draft, thresholds/memory annotated |
| Pattern cross-reference | 48 patterns audited, 5 added to manifest |
| Agent refactoring | 12 agents, unified frontmatter, README updated |
| Workflow/Integrations | 3 deprecation notices, READMEs updated |
| Tool-reconstruction backlog | 43 prioritized items across 5 tiers |
| SOTA/auto-MCP research | Cannot unload auto-provisioned MCPs |

### Master Wiggum Loop Iteration 2 — 5 Tasks (2026-02-08)
**Commit**: c2a8159

| Task | Deliverable |
|------|-------------|
| Session state update | Full milestone history |
| Orphaned patterns | 6 patterns cross-referenced |
| Self-knowledge files | strengths, weaknesses, patterns-observed |
| Memory KG storage | 6 entities, 6 relations |
| Quality review | 3 key skills verified (research-ops, knowledge-ops, context-management) |

### Master Wiggum Loop Iteration 3 — 4 Tasks (2026-02-08)
**Commit**: 1e34159

- current-priorities.md rewritten for v5.9.0
- Pattern count 39→48 in 3 files
- capability-matrix.md → capability-map.yaml stale references fixed
- Psyche topology counts corrected (skills 11→22, hooks 14→28, agents 14→12)

### Master Wiggum Loop Iteration 4 — 3 Tasks (2026-02-08)
**Commit**: eb29b7b

- Capability-map.yaml verification: 21/22 skills, 12/12 agents — all consistent
- Session state updated through Iteration 4

### Master Wiggum Loop Iteration 5 (final) — 2 Tasks (2026-02-08)
**Commit**: 9f24a4e

- CLAUDE.md root-of-trust: pattern count 41→48, capability-matrix→capability-map.yaml

### Post-Loop Polish (2026-02-08)
**Commits**: 9eaf2ad, a14ed12, 6ed47ea

- Stray context-snapshot.md moved to context-management/references/
- Session reflection report (AC-05)
- MEMORY.md + restructuring-lessons.md
- All 3 topology maps (nous, pneuma, soma) aligned with v5.9.0

### X-ops Skill Consolidation (2026-02-08)
**Commit**: c618123

- 4 Swiss-Army-Knife router skills: doc-ops, self-ops, mcp-ops, autonom-ops
- capability-map.yaml: 21→10 discoverable skills
- 26 total skill dirs (10 discoverable + 15 absorbed subordinates + 1 example)

---

## Stream 0 Completed Work (2026-02-09)

All 3 Wiggum Loops + code reviews complete. Bulk replacement re-executed successfully.

- C1-C5 critical fixes (capability-map.yaml, plugin-decompose, mcp-validation)
- Count harmonization: patterns 51, skills 28, commands 40, hooks 28, agents 13
- Index updates: skills/_index.md (+6 entries), knowledge-ops pattern count
- README updates: commands/README.md, hooks/README.md
- Bulk replacement: capability-matrix.md → capability-map.yaml in 19 operational files (26 substitutions)
- Glossary: "Capability Matrix" → "Capability Map", path corrected
- Deprecation header added to capability-matrix-update-workflow.md
- Code reviews: 3 loops, all findings addressed
- **Status**: COMPLETE — needs commit + push

---

## Up Next

### Tool Reconstruction Backlog
**Status**: 43 items, major progress across all tiers
- P1: 6/8 DONE (remaining: GPTResearcher + Chroma/db-ops — both blocked)
- P2: 7 high-value MCPs (Serena DEFERRED — stability issues)
- P3: **5/5 RESEARCHED** (omc patterns + supabase-agent-skills completed, 6 patterns identified)
- P4: 4/6 x-ops consolidations DONE (self-ops, doc-ops, mcp-ops, autonom-ops)
- P5: 5 future (infrastructure needed)
- **Hook optimization**: Matchers added, ~70% fewer processes per tool call
- Backlog: `.claude/context/reference/tool-reconstruction-backlog.md`

### Phase 6 / Roadmap II Phase A — COMPLETE (2026-02-09)
**Status**: All PR-12 sub-PRs COMPLETE, PR-13 COMPLETE, PR-14 COMPLETE
**Commit**: 5b38374 (32 files, +3874/-78)
- PR-12.1-12.10: ALL COMPLETE — all 9 Hippocrenae ACs active
- PR-13: Monitoring — telemetry-dashboard.sh + benchmark-suite.yaml (10 benchmarks)
- PR-14: SOTA Catalog — 55 entries, 9 categories
- **Residual**: AC-06/07 scaffolded (specs+scripts, not execution-wired) — failure_modes_tested now true via B.4 degradation benchmarks
- **Verified**: 5-agent parallel audit confirmed all deliverables
- **Roadmap II**: `.claude/plans/roadmap-ii.md` — Phase A section updated with carry-forward table

### Roadmap II Phase B — COMPLETE (7/7)
- B.1: claude-code-docs install — **DONE**
- B.2: Deep Research Pattern Decomposition — **DONE**
- B.3: Hook Consolidation — **DONE**
- B.4: Context Engineering JICM Integration — **DONE**
- B.5: Skill-Level Model Routing — **DONE**
- B.6: Automatic Skill Learning — **DONE**
- B.7: AC-10 Ulfhedthnar — **DONE**

### Roadmap II Phase F — Aion Quartet — COMPLETE
- F.0: AC-03 hotfix + VERSION 5.10.0 + roadmap rewrite — **DONE** (96ee40b)
- F.1: Ennoia MVP (session orchestrator) — **DONE** (02b4272, 14/14 tests, v0.2)
- F.2: Virgil MVP (codebase guide dashboard) — **DONE** (cf5cb0d, all tests pass, v0.2)
- F.3: Remaining Aion Quartet wiring — **DONE** (housekeep.sh, valedictions, cap-map, orchestration docs)
- **Status**: COMPLETE (4/4)

### JICM v6.1 Enhancement (2026-02-10/11) — COMPLETE
- 20 Wiggum Loop TDD cycles, 196 tests passing
- E1: ESC-triggered idle detection (replaces spinner polling)
- E2: Token extraction range validation
- E3: v6.1 compression agent prompt
- E4: Session-start/restart differentiation
- E5: Cycle metrics + telemetry (JSONL)
- E6: v5 watcher removal — 164 lines from session-start, 6 consumers migrated to .jicm-state
- E7: /compact hook cleanup
- E8: Session-state de-prioritization
- **Report**: `.claude/context/designs/jicm-v6.1-implementation-report.md`
- **Deferred**: jarvis-watcher.sh file deletion (still used for command signals)
- **Needs**: Commit + push

### Compression Timing Experiment 1 (2026-02-13) — COMPLETE
- 5-loop Wiggum experiment: /compact vs JICM compression timing
- 6 matched pairs (12 trials), 5 with both treatments successful
- **Result**: JICM 2.3x slower (median 313.5s vs 140s, p=0.03125, r=0.833)
- JICM compression agent = 73% of total time (optimization target)
- JICM 100% reliable vs /compact 83%
- **Report**: `.claude/reports/testing/compression-experiment-report.md`
- **Data**: `.claude/reports/testing/compression-timing-data.jsonl`

### Compression Timing Experiment 2 — Context Volume Regression (2026-02-13) — COMPLETE
- 2×2 factorial design: treatment (compact/JICM) × context level (45%/75%)
- 19 trials (4 pilot + 15 experiment), 4 blocks, early stopping invoked
- **Result 1**: Context volume has NO effect on compression time (F=1.31, p=0.277)
- **Result 2**: JICM 3.9x slower than /compact (F=122.22, p<0.001, η²=0.917 massive effect)
- **Result 3**: JICM 100% failure at ≥74% context (0/4 success) — **root cause confirmed**: emergency /compact handler (73%) preempts JICM cycle in watcher main loop; JICM ceiling is 72%
- 5 bugs found+fixed (B7-B11): cascading failure, macOS head, ceiling abort, plateau detection, /clear hardening
- **Report**: `.claude/reports/testing/compression-regression-report.md`
- **Data**: `.claude/reports/testing/compression-regression-data.jsonl`
- **Actions taken**: JICM threshold lowered to 55% (17-point margin below 72% ceiling), 72% ceiling documented in AC-04 spec

### Compression Timing Experiment 3 — Context Volume Revised (2026-02-13/14) — COMPLETE
- 2×2 factorial: treatment (compact/JICM) × context level (40% vs 70%), revised from Exp 2
- 24 trials attempted, 18 successful (6 failed due to tmux pane staleness)
- **Result 1**: Context volume has NO effect on compression time (F=2.33, p=0.149) — replicates Exp 2
- **Result 2**: /compact 3.8x faster than JICM (F=197.1, p<0.001, η²=0.934) — replicates Exps 1+2
- **Result 3**: JICM-high 4/4 SUCCESS at 67-72% context — first ever above 70%, validates 72% ceiling
- **Result 4**: JICM negative trend — faster at higher context (Spearman rho=-0.706, p=0.034)
- **Result 5**: Compression ratios scale with volume (JICM-high 3.8:1, /compact-high 2.4:1)
- **Report**: `.claude/reports/testing/experiment-3-report.md`
- **Data**: `.claude/reports/testing/compression-exp3-data.jsonl`
- **Protocol**: `.claude/reports/testing/experiment-3-protocol.md`
- **Recommendations**: Keep threshold at 55%, no volume optimization needed, consider Haiku for compress agent, investigate negative JICM trend

### Compression Optimization Experiments 4-5-6 — SUPERSEDED BY JICM v7 (2026-02-14)
- **Status**: SUPERSEDED — JICM v7 eliminates LLM compression agent entirely
- Experiments 4-6 aimed to optimize the 210s compression agent (model, thinking, preprocessing)
- JICM v7 replaces the agent with a 0.03s bash script, rendering these experiments moot
- Infrastructure and data preserved in `.claude/scripts/dev/` and `.claude/reports/testing/`

### JICM v7 — Script-Based Context Preparation (2026-02-16) — COMPLETE
- **Key insight**: Compression agent is ~70% redundant under stop-and-wait architecture
  - Claude Code auto-loads foundation docs (CLAUDE.md, capability-map, identity) on /clear
  - JSONL transcript contains full structured conversation (superior to chat export)
  - What Jarvis needs after /clear: (1) what was I doing, (2) what's the plan, (3) what's next
- **Implementation**: `jicm-prep-context.sh` extracts user messages + plan + status from JSONL
- **Performance**: 0.028s vs 210s (7,500x faster), projected total cycle ~30s vs ~285s
- **Live tested**: JICM cycle on 2026-02-16 23:22 MST — successful restoration
- **Files**: jicm-prep-context.sh, plan-tracker.js, watcher v7, session-start v7, ennoia plan tracking
- **Deprecated**: compression-agent.md, compression-agent-preassembled.md, intelligent-compress.md, compaction-essentials.md
- **Plan**: `.claude/plans/robust-painting-stonebraker.md`

### Experiment 7b — JICM v7 Quality Assessment (2026-02-17) — COMPLETE
- 9 live trials, 3 treatments (S=Standard, C=/compact, X=Mixed), 15-question probes
- **Result**: Non-inferiority confirmed — JICM v7 matches /compact quality
- Clean trial scores: S=9.5, C=8.5, X=9.25 (out of 15)
- **Discovery**: File-reading confound — W0 reads source files during probes, boosting all methods to 12.0/15
- **Discovery**: Cascade confound — /compact preserves prior probe answers in compacted context
- **Discovery**: Anti-poisoning defense — Claude B.4 detects planted synthetic facts (invalidated Exp 7 methodology)
- **Codebase hardening**: gitignore +15 patterns, 21 runtime files untracked, 10 stale archives removed
- **Reports**: experiment-7b-protocol.md, experiment-7b-report.md, experiment-7b-data.jsonl
- **Research**: claude-anti-poisoning-defense-2026-02-17.md

### Phase C — Mac Studio Infrastructure — IN PROGRESS (2026-02-17+)

**Milestone 0: Foundation Bootstrap** — COMPLETE (2026-02-17)
- Python 3.12.12, uv 0.10.3, Docker 29.2.0, Ollama 0.16.2, MLX, jq/yq/htop/git-lfs
- Infrastructure venv: `/Users/nathanielcannon/Claude/Jarvis/infrastructure/.venv/`

**Milestone 1: Local Model Serving** — COMPLETE (2026-02-17)
- 7 models pulled (53 GB): qwen3:32b, qwen3:8b, qwen3:0.6b, qwen3-coder, qwen3-vl:8b, qwen3-embedding:4b, nomic-embed-text
- LiteLLM proxy on :4000 with 7 routes
- Key findings: qwen3-embedding:4b outputs 2560-dim (not 2048), qwen3-coder is 30B MoE (3.3B active)

**Milestone 2: Database Stack** — NEARLY COMPLETE (2026-02-18)
- Docker Compose: 5/5 containers healthy (PostgreSQL/ParadeDB, Qdrant, Neo4j, Redis, n8n)
- PostgreSQL: pgvector + pg_search, 3 DBs, 3 analytics tables
- Qdrant: 4 collections (jarvis-context, codebase, research, sessions) — 2560-dim Cosine
- Neo4j: v2026.01.4 CE + APOC
- Redis: redis-stack, 2GB maxmemory, AOF persistence
- MCPs registered: qdrant-mcp, postgres-mcp, neo4j (untested), local-rag
- BLOCKED: n8n MCP (needs API key from browser setup at http://localhost:5678)
- Decision pending: MCP→Skill decomposition for context budget optimization (~3000-6000 token savings)

**Milestone 3: RAG Pipeline** — COMPLETE (2026-02-18)
- jarvis-rag FastMCP 3.0 server: 6 tools (search, multi_search, ingest, ingest_directory, list_collections, delete_file)
- Initial indexing: 474 files → 6,491 vectors (jarvis-context: 3300, research: 1189, codebase: 2002)
- Validation: 6 semantic queries returning highly relevant results (0.50-0.75 cosine)
- Dependencies: fastmcp 3.0.0, qdrant-client 1.16.2, httpx 0.28.1 in infrastructure venv
- Commit: 63a6be0

**Milestone 4: Graphiti Cross-Session Memory** — COMPLETE (2026-02-18)
- graphiti-core 0.28.0, OllamaNoThinkClient for Qwen3 thinking mode suppression
- NoOpCrossEncoder (RRF reranking, no cloud cross-encoder needed)
- EMBEDDING_DIM=2560 (Qwen3-embedding-4B), embedder direct to Ollama (bypasses LiteLLM)
- 4 seed episodes → 36 entity nodes, 29 entity edges in Neo4j
- jarvis-graphiti MCP: 6 tools (search, search_nodes, add_episode, get_episodes, get_entity, graph_stats)
- Registered in .mcp.json, all tools validated
- TODO: Wire into session lifecycle (AC-01 query, AC-09 capture)

**Milestone 5: n8n Workflows** — NEXT
- Complete n8n admin setup (browser at http://localhost:5678)
- Register n8n-mcp, build automation workflows
- Session summaries, RAG re-indexing, scheduled maintenance

**Milestones 6-7**: Voice pipeline, service management — queued

---

## Backlog

See `projects/project-aion/roadmap.md` for full roadmap.

### Deferred Items
- AC-02/AC-03 remediation workflow integration
- Hippocrenae documentation (from Autopoietic Paradigm v2.0.0)
- Auto-restart after rate-limit pattern
- Self-constitution directory restructuring (aspirational)

---

## Notes

**Branch**: All work on `Project_Aion` branch (origin/Project_Aion)
**Baseline**: `main` branch is read-only AIfred baseline at `2ea4e8b`
**MCPs**: 5 active (memory, local-rag, fetch, git, playwright)

---

*Project Aion — Jarvis Development Priorities*
