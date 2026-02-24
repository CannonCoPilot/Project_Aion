# Research Report: Chronicler/DF Memory System Audit

**Date**: 2026-02-23
**Scope**: Systematic query of Qdrant (14 collections) and Graphiti (Neo4j) for all stored knowledge about Chronicler, Dwarf Fortress, DFHack, and related topics. Full collection inventory and gap identification for PRD v2.1 planning.

---

## Executive Summary

Both memory systems contain significant but complementary knowledge about the Chronicler/DF ecosystem. Qdrant holds the richest technical content across 14 specialized collections (8,476 DFHack docs, 3,071 df-structures XML files, 400 weblegends event renderers, 32 df-narrator source files, etc.). Graphiti holds high-level relational facts from session reflections — primarily what Chronicler has done and validated, not how it works.

The most notable gap: **no session summaries for Sessions 30-32 are stored in the `sessions` Qdrant collection** (only 10 points total, covering Graphiti/RAG infrastructure sessions). All Chronicler-specific session knowledge lives only in Graphiti episodic nodes and in-context session-state.md. The `codebase` collection has been indexed with Jarvis infrastructure files (claude-code-docs, agent templates) but **not with DwarfCron product code** — the actual Chronicler Python modules are not searchable via RAG.

---

## Key Findings

### 1. Chronicler Architecture Knowledge

**Source**: Graphiti episodic node "Reflection #15 — Session 32" (relevance: highest available)

Session 32 is documented in detail in Graphiti. Key facts stored:

- Chronicler has an 8-question validation suite run across both worlds (Namoram/World 1, Ormon/World 2)
- The storyteller uses keyword-routed context retrieval (23 fixed routes) feeding a 12,000-char budget to Qwen3 8B
- Four critical gaps were found via validation: boolean flag parsing, site ownership, sparse-context hallucination, war context missing entity names
- Three evolution proposals were queued: REFL-023 (XML boolean fix), REFL-024 (confidence signaling), REFL-025 (war context enrichment)
- All four gaps from REFL-023/024/025 were subsequently closed in Session 32's gap closure work

**Source**: Qdrant `research` collection — `dwarf-fortress-project-plan.md` (scores: 0.69–0.73)

The early research document (2026-02-18) remains the most semantically dense DF architecture document in Qdrant. It establishes:
- CDM (Common Data Model) as the core architectural concept
- Three-tier development topology: macOS host / Windows game / TCP bridge
- Lua scripts preferred over C++ plugins for hot-reload iteration
- PostgreSQL + pgvector as the CDM backend

This document represents the **original architecture vision** that Chronicler has now implemented and exceeded.

**Source**: Active file `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/chronicler-prd-v2.md`

PRD v2.1 is the authoritative current architecture document. Memory systems know very little about its specific contents — it's newer than the last Graphiti ingestion.

---

### 2. DFHack Integration Knowledge

**Source**: Qdrant `dfhack` collection (8,476 points), `mydfhack-scripts` collection (160 points), `dfhack-client-python` collection (6 points)

The DFHack collection is the largest in Qdrant but its top results for Chronicler-relevant queries consistently surface `myDFHackScripts/PetitionLogger.lua` (score ~0.70–0.75). This suggests the collection is indexed from the general DFHack documentation corpus but that **the Chronicler-specific bridge patterns (cursored polling, HTTP serving, pcall safety)** are not the closest semantic matches to general DFHack documentation.

Key technical facts stored in Qdrant about DFHack:

- **RPC interface**: dfhack-client-python (originally "Blendwarf") demonstrates the Protobuf/TCP pattern. Uses `@remote` decorator, `connect()`/`close()`, `run_command()` for Lua execution. File: `/Users/nathanielcannon/Claude/GitRepos/dfhack-client-python/blendwarf.py`
- **Lua scripting**: myDFHackScripts shows real-world patterns: `dfhack.eventful`, `LogHandler`, `Helper.parseTable()`, repeat job patterns for change detection
- **Unit enumeration**: `df.global.world.units.all` is the canonical iteration target (confirmed in test2.lua)
- **Entity position structures**: `histfig_entity_link_former_positionst`, `histfig_entity_link_former_mercenaryst` etc. found in df-structures symbols.xml

**Source**: Qdrant `dfhack` collection — weblegends results for "hist_figure_id" (score: 0.73)

`/Users/nathanielcannon/Claude/GitRepos/weblegends/events/add_hf_site_link.cpp` contains patterns for site-link event rendering that reference `event->histfig`, `event->civ`, `event->structure`, `event->site` — the field names that map directly to Chronicler's `history_events` JSONB.

---

### 3. Data Pipeline Knowledge

**Source**: Qdrant `df-narrator` collection (32 points) — `df_narrator.py`

The complete `score_figure()` function is accessible:

```python
def score_figure(hfid, hf, event_counts, kill_counts, artifact_by_holder):
    s = min(event_counts.get(hfid, 0) * 2, 500)   # Events, capped at 500
    s += kill_counts.get(hfid, 0) * 15              # Kill count bonus
    if hf.get("vamp"):   s += 80    # Type bonuses
    if hf.get("necro"):  s += 100
    if hf.get("deity"):  s += 120
    if hf.get("force"):  s += 90
    if hf.get("mega"):   s += 70
    s += min(len(hf.get("hf_links", [])) * 3, 100)  # Relationships (capped)
    s += sum(20 for el in hf.get("entity_links", [])
             if el["type"] in ("position", "former_position", "position_claim"))
    s += len(artifact_by_holder.get(hfid, [])) * 30  # Artifacts held
    s += len(hf.get("spheres", [])) * 10             # Divine spheres
    # Skills, site_links, entity_links, death also contribute
    return s
```

This is the **authoritative reference implementation** for global figure ranking. The NVS formula in PRD v2.1 is deliberately different (fortress-centric rather than global), but both formulas should be computed and stored — the agentic LLM can choose which ranking to use per question.

**Source**: Qdrant `df-narrator` collection — `df_legends_common.py`

`HF_FIELDS` dict confirms which event fields reference HF IDs: `{'hfid', 'slayer_hfid', 'hfid1', 'hfid2', 'group_hfid', 'snatcher_hfid', 'changee_hfid', 'changer_hfid', ...}`. These are the join keys for event→HF queries in Chronicler's agentic SQL layer.

**Source**: Qdrant `df-structures` collection (3,071 points) — `df.history_figure.xml`

HF link type hierarchy is confirmed:
- `histfig_hf_link_motherst` (inherits-from `histfig_hf_link`)
- `histfig_hf_link_fatherst` (inherits-from `histfig_hf_link`)
- Additional child types at score 0.750+

This validates PRD v2.1's Section 4.1 approach of sourcing relationships from Unit records' 9 relationship slots when HF records are missing.

**Source**: Qdrant `df-structures` collection — `df.dfhack.xml`

Skill level thresholds confirmed: Novice (XP: 600), Adequate (XP: 700). Full enum present in this file — relevant for the skill milestone detection in the live Event Generator (PRD Phase 2).

**Source**: Qdrant `weblegends` collection (400 points) — `render_figure.cpp` (score: 0.835), event files

`weblegends` is the highest-quality reference for event rendering patterns. Key files:
- `render_figure.cpp`: HF page structure — site links, prison rendering, `link_type` switch
- `events/hist_figure_simple_action.cpp`: "performed horrible experiments" case — shows event type rendering patterns
- `events/ceremony.cpp`: Occasion/schedule/ordinal fields, `do_location()` helper

---

### 4. HomeServer Knowledge

**Source**: MEMORY.md (always loaded) — highest confidence facts

The HomeServer knowledge in MEMORY.md is the canonical source:
- Windows 10 Pro x86_64 at `192.168.4.194` (machine: WIN-48L3R2QLQN0)
- User: Nathaniel, Pass: DwarfF0rtress
- DF + DFHack 53.10-r1 at `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`
- DFHack RPC on TCP port 5000
- RemoteFortressReader NOT available
- File transfer: PowerShell HttpListener on port 8888
- Bridge deployment: SMB via impacket to `Users` share

**Source**: Graphiti entity "Firebronze fortress" (jarvis-core group)

Graphiti stores only this one fortress name from JICM context enrichment — it represents the live game state during Sessions 31-32. The entity's summary confirms: "JICM v7 used Firebronze fortress data for context retrieval. Chronicler used Firebronze fortress for validation."

**Gap**: No Graphiti entities for `192.168.4.194`, `DFHack RPC`, `HomeServer`, `Windows`. HomeServer infrastructure facts were never ingested into Graphiti — they live only in MEMORY.md.

---

### 5. Reference Repository Knowledge

**Source**: Qdrant specialized collections for LegendsBrowser2, LegendsViewer-Next, df-ai

Note: `LegendsBrowser2` and `LegendsViewer-Next` do NOT have dedicated Qdrant collections. They exist as git repos at `/Users/nathanielcannon/Claude/GitRepos/` but were not indexed. Only `df-ai`, `weblegends`, `df-narrator`, `df-structures`, `mydfhack-scripts` have indexed collections.

**Source**: Qdrant `df-ai` collection (1,204 points) — `room.h` (scores 0.57–0.74)

The df-ai collection is indexed but `room.h` dominates all results — it appears the df-ai indexing captured primarily C++ header files focused on room/building management. The event manager callback patterns mentioned in PRD v2.1's reference section are not surfacing from this collection via semantic search.

---

## Comparison: Memory System Coverage

| Topic | Qdrant | Graphiti | MEMORY.md | Active Files |
|-------|--------|----------|-----------|--------------|
| DFHack API patterns | Good (8.4K docs) | None | Gotchas only | bridge.py |
| df-structures (schema) | Good (3K XML) | None | None | design docs |
| Chronicler current arch | Not indexed | Partial (Session 32) | Key facts | PRD v2.1 |
| Live event generation | Not indexed | None | None | PRD v2.1 only |
| Denizen registry design | Not indexed | None | None | PRD v2.1 only |
| Agentic storyteller design | Not indexed | None | None | PRD v2.1 only |
| HomeServer facts | Not indexed | Not indexed | Complete | None |
| Scoring formulas | df-narrator source | None | None | PRD v2.1 |
| HF link types | df-structures XML | None | None | design docs |
| Validation results | Not indexed | Session 32 reflection | None | gap-closure |
| DwarfCron product code | NOT INDEXED | None | None | /Projects/DwarfCron/ |

---

## Recommendations

### Primary Recommendation: Index DwarfCron Product Code into Qdrant

The `codebase` Qdrant collection (2,014 points) contains only Jarvis infrastructure files. The actual Chronicler Python package at `/Users/nathanielcannon/Claude/Projects/DwarfCron/` — including `watcher.py`, `context.py`, `bridge.py`, `xml_parser.py` — is completely absent from all memory systems.

**Rationale**: The agentic storyteller and Phase 1-3 implementation work will require frequent lookups into existing Chronicler code patterns. Without RAG indexing, every session must re-read source files from scratch.

**Action**: Run the RAG re-index workflow (or manually trigger `jarvis-rag` indexing) against `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/`.

### Alternative: Ingest PRD v2.1 into Graphiti

PRD v2.1 defines 4 phases of new architecture that Graphiti has no knowledge of. A targeted Graphiti episode ingestion would allow future sessions to query the knowledge graph for implementation plans.

**Rationale**: PRD v2.1 is 1,197 lines and will not stay in context. Graphiti would let future sessions retrieve specific sections (e.g., "denizen registry schema", "event generator patterns") without loading the full document.

---

## Action Items

- [ ] Index `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/` into the `codebase` Qdrant collection
- [ ] Ingest PRD v2.1 key sections as Graphiti episodes (denizen registry, agentic loop, live event generator)
- [ ] Add HomeServer infrastructure facts to Graphiti (currently only in MEMORY.md)
- [ ] Index `/Users/nathanielcannon/Claude/GitRepos/LegendsBrowser2/` and `/Users/nathanielcannon/Claude/GitRepos/LegendsViewer-Next/` into Qdrant for benchmarking reference

---

## Sources

### Qdrant Collections Queried

1. `jarvis-context` (3,300 pts) — `/Users/nathanielcannon/Claude/Jarvis/.claude/context/` files
2. `codebase` (2,014 pts) — Jarvis infrastructure, claude-code-docs, agent templates
3. `research` (1,224 pts) — `/Users/nathanielcannon/Claude/Jarvis/.claude/context/research/dwarf-fortress-project-plan.md` (dominant)
4. `sessions` (10 pts) — Session 26 and Session 29 summaries only
5. `dfhack` (8,476 pts) — DFHack documentation corpus
6. `df-structures` (3,071 pts) — DF memory structure XML definitions
7. `df-narrator` (32 pts) — df-narrator source code
8. `df-ai` (1,204 pts) — df-ai C++ source
9. `weblegends` (400 pts) — weblegends event rendering C++ files
10. `mydfhack-scripts` (160 pts) — Community DFHack Lua scripts
11. `dfhack-client-python` (6 pts) — dfhack-client-python (Blendwarf)
12. `df-wiki` (4,232 pts) — DF wiki articles
13. `df-logger` (3,747 pts) — DwarfFortressLogger source
14. `dwarf-therapist` (926 pts) — Dwarf Therapist source

### Graphiti / Neo4j

15. 124 Entity nodes, 8 Episodic nodes in `jarvis-core` group
16. Chronicler-specific entity: `Chronicler` node with 13 RELATES_TO edges
17. Key episodic: "Reflection #15 — Session 32" — full validation results stored

### Active Design Documents

18. `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/designs/chronicler-prd-v2.md` — PRD v2.1 (authoritative)
19. `/Users/nathanielcannon/Claude/Jarvis/.claude/context/session-state.md` — Session 32 accomplishments
20. `/Users/nathanielcannon/Claude/GitRepos/df-narrator/df_narrator.py` — score_figure() reference implementation

---

## Uncertainties

1. **df-narrator Qdrant indexing path**: The Qdrant `df-narrator` collection points to `/Users/nathanielcannon/Claude/Jarvis/projects/df-narrator/` but the actual files were found at `/Users/nathanielcannon/Claude/GitRepos/df-narrator/`. The Qdrant payload paths may be stale.

2. **Session completeness in Graphiti**: Only 8 Episodic nodes exist in Graphiti. Sessions 27-32 are present but Sessions 28-31 detail is sparse. The Chronicler gap closure (Phase 0-4) completed in Session 32 is only briefly mentioned.

3. **DFHack collection relevance**: The `dfhack` collection (8,476 points) returns `PetitionLogger.lua` as the top result for most DFHack-related queries. This suggests the collection indexes a large DFHack documentation corpus where the Lua scripting patterns most semantically similar to Chronicler bridge patterns are petition/log handler scripts.

---

## Related Topics

- DwarfCron product code indexing strategy (RAG coverage gap)
- Graphiti ingestion of design documents (PRD v2.1 has never been ingested)
- LegendsBrowser2 and LegendsViewer-Next Qdrant indexing (currently absent)
- Knowledge Horizon implementation (Phase 4 — no memory system knowledge exists yet)
