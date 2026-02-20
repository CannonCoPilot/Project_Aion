# Reindex Queue

**Created**: 2026-02-19
**Updated**: 2026-02-19 16:02 MST
**Status**: Repos cloned, partial indexing done, awaiting MCP restart for Graphiti

---

## Priority 1: Jarvis Self-Knowledge (Graphiti) — BLOCKED on MCP restart

Re-ingest core identity, architecture, and design docs through Graphiti knowledge graph
using the new MLX embedding pipeline. **Requires MCP restart** (Graphiti MCP still using
old Ollama URL until next session; `.mcp.json` already updated to `localhost:8000/v1`).

Files to ingest as episodes via `mcp__jarvis-graphiti__add_episode`:
- `.claude/context/psyche/jarvis-identity.md` — core identity
- `.claude/context/psyche/capability-map.yaml` — capability manifest
- `.claude/context/components/orchestration-overview.md` — AC components
- `.claude/context/session-state.md` — current state + history
- `.claude/context/patterns/_index.md` — 51 patterns
- `.claude/plans/mac-studio-db-ai-roadmap.md` — roadmap
- `CLAUDE.md` — master config
- `.claude/context/research/dwarf-fortress-project-plan.md` — DF project plan

## Priority 2: claude-code-docs (Qdrant RAG) — CLONED, not indexed

- **Repo**: cloned to `projects/claude-code-docs` (598 markdown files)
- **Target collection**: `codebase`
- **Command**: `ingest_directory(directory="projects/claude-code-docs", collection="codebase", pattern="**/*.md")`

## Priority 3: Dwarf Fortress Repos (Qdrant RAG) — PARTIALLY DONE

| Repo | Collection | Clone | Index Status |
|------|-----------|-------|-------------|
| DwarfFortressLogger | `dwarf-therapist` | DONE (`projects/DwarfFortressLogger`) | TODO: `**/*.py`, `**/*.lua`, `**/*.cpp`, `**/*.h`, `**/*.md` |
| myDFHackScripts | `dfhack` | DONE (`projects/myDFHackScripts`) | DONE: 27 files, 156 chunks (Lua) |
| df-ai | `dfhack` | DONE (`projects/df-ai`) | TODO: `**/*.cpp`, `**/*.h`, `**/*.md` |
| weblegends | `dfhack` | DONE (`projects/weblegends`) | TODO: `**/*.cpp`, `**/*.h`, `**/*.md` |

Updated collection stats after myDFHackScripts indexing:
- `dwarf-therapist`: 912 points
- `dfhack`: ~5,587 points (+156 new chunks)
- `df-wiki`: 4 points

---

## Execution Plan

1. [x] Clone repos to `projects/` directory — ALL DONE
2. [x] myDFHackScripts indexed (27 files, 156 chunks into `dfhack`)
3. [ ] Index remaining DF repos via `ingest_directory` calls (direct, not via subagents)
4. [ ] Index claude-code-docs (598 markdown files into `codebase`)
5. [ ] After MCP restart: Run Graphiti self-knowledge reindex (Priority 1)

## Notes

- Subagent MCP tool calls were rejected (permission issue) — run indexing directly
- MLX server restarted with new `/v1/embeddings` OpenAI-compatible endpoint
- `.mcp.json` updated: `jarvis-graphiti` OLLAMA_BASE_URL → `http://localhost:8000/v1`
- Graphiti E2E test passed: `OpenAIEmbedder` → MLX → 2560-dim vectors
