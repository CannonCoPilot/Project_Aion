# Research Report: claude-code-docs Analysis

**Date**: 2026-02-18
**Scope**: Full analysis of costiash/claude-code-docs — what it does, installation status, fork potential, Qdrant indexing strategy, and Jarvis self-knowledge value
**Branch**: Project_Aion
**Researcher**: Deep Research Agent (claude-sonnet-4-6)

---

## Executive Summary

`costiash/claude-code-docs` is a shell + Python tool that mirrors 571 official Anthropic documentation files locally (from `platform.claude.com` and `code.claude.com`) and registers a `/docs` slash command in Claude Code. The tool lets Claude semantically route natural-language queries to the right documentation file without hitting the network on every call.

It is **not currently installed** on this system. The `/docs` command is absent from `~/.claude/commands/`, and `~/.claude-code-docs/` does not exist.

The tool's core value proposition — offline documentation search — is already partially covered by Jarvis's Qdrant RAG pipeline. However, the **571 markdown files it mirrors** represent a high-value, structured corpus of Claude Code API and behavioral documentation that Jarvis does not currently have. Indexing those files into the `research` Qdrant collection would give Jarvis semantic access to Claude's full documented ecosystem at ~1-2ms query latency.

The fork-vs-use-as-is decision is straightforward: **use as-is for fetching** (the shell/Python fetcher is production-quality), then **skip its search layer entirely** in favor of Qdrant semantic search. Jarvis's RAG pipeline already supersedes the tool's keyword-based lookup.

---

## Key Findings

### Finding 1: What It Does and How It Works

The tool is a two-layer system:

**Layer 1 — Documentation Mirror (Shell + Python)**
- Discovers all documentation URLs from two Anthropic sitemaps:
  - `https://platform.claude.com/sitemap.xml` (API refs, guides, prompt library)
  - `https://code.claude.com/docs/sitemap.xml` (Claude Code CLI)
- Downloads 571 markdown files to `~/.claude-code-docs/docs/`
- Maintains a `docs_manifest.json` tracking file hashes and fetch timestamps
- Safety safeguards prevent mass deletion: 10% max deletion per sync, 250 min file floor
- Auto-updates every 3 hours via GitHub Actions on the upstream repo

**Layer 2 — Search / Slash Command (Shell + Python)**
- Registers `~/.claude/commands/docs.md` — this is the `/docs` slash command
- The command instructs Claude to call `claude-docs-helper.sh` with the user's query
- Claude itself acts as the "semantic router" — it reads matching files and synthesizes answers
- Python fallback: `search.py` does keyword-frequency + difflib fuzzy matching (NOT vector search)
- `build_search_index.py` builds a flat JSON index: title, preview, top-20 keywords per file

**Source sitemaps confirmed working as of 2025-12-05**:
- 573 paths discovered, 571 files downloadable
- Categories: API Reference (377 paths), Core Docs (82), Prompt Library (65), Claude Code (46), Release Notes + Resources (3+)

**Source**: https://github.com/costiash/claude-code-docs

---

### Finding 2: Installation Status

Not installed. Confirmed by:

```
$ which claude-code-docs          → not in PATH
$ npm list -g | grep claude        → not found
$ ls ~/.claude-code-docs           → directory does not exist
$ ls ~/.claude/commands/           → docs.md not present
```

The tool is npm-adjacent but actually installs via a bash one-liner (not npm). It is pure shell + Python — no node_modules required.

**Source**: Local system check (2026-02-18)

---

### Finding 3: Fork Potential

**Recommendation: Use as-is for fetching; skip its search layer entirely.**

| Aspect | As-Is | Forked |
|--------|-------|--------|
| Doc fetching (shell/Python) | Fully functional | No improvement needed |
| Sync safety safeguards | Production quality | No improvement needed |
| Search layer | Keyword + difflib (inferior) | Replace with Qdrant |
| `/docs` slash command | Relies on Claude routing | Replace with jarvis-rag MCP |
| Auto-update via GitHub Actions | Works if you pull regularly | Not needed — we control sync |
| Context budget impact | Moderate (Claude reads files) | Zero (MCP returns chunks) |

**What a fork would gain**:
1. A custom fetcher that writes docs directly to a staging path for Qdrant ingestion
2. Addition of a `collection: "claude-docs"` Qdrant collection target in the fetcher
3. Removal of the `/docs` command registration (Jarvis uses MCP tools instead)
4. Optional: extend sitemap discovery to catch future Anthropic doc additions

**What a fork is NOT worth**:
- The Python search modules (`search.py`, `build_search_index.py`) — Qdrant supersedes them
- The `claude-docs-helper.sh` slash command — Jarvis uses MCP, not file-reading slash commands
- Any CI/CD adaptation — Jarvis can run a cron-style refresh via n8n Milestone 5

**Verdict**: Fork only if Jarvis-specific CI integration is needed. For the immediate goal of getting docs into Qdrant, cloning the repo and running the fetcher as-is is sufficient.

---

### Finding 4: Semantic Indexing Potential

This is the highest-value integration. The 571 downloaded markdown files are a perfect corpus for a new Qdrant collection: `claude-docs`.

**Why this works well with the existing RAG pipeline**:
- Files are clean markdown (title headings, structured content, no binary)
- Average file size is small enough for the existing `chunk_text()` function (1000-char chunks, 200 overlap)
- The `ingest_directory()` tool in `mcp_server.py` already handles batch ingestion with hash-based deduplication
- Embedding model (qwen3-embedding:4b, 2560-dim) handles technical documentation well

**Estimated index size**:
- 571 files × ~3-8 chunks average = ~1,700-4,600 vectors
- At 2560 dims × 4 bytes = ~10kb per chunk; total ~17-46 MB in Qdrant memory
- This is trivial given current 6,491 vectors already stored

**Query quality prediction**: High. Claude Code documentation is highly technical and structured. Questions like "what payload fields does a stop hook receive?" or "how does the hooks lifecycle work?" would return precise chunk matches. Cosine similarity of 0.55-0.75 is achievable (comparable to current jarvis-context query results).

**Current tool's search vs Qdrant**:

| Aspect | claude-code-docs search | Qdrant semantic search |
|--------|------------------------|----------------------|
| Method | Keyword frequency + difflib | Dense vector similarity |
| Latency | ~200ms (file I/O) | ~1-2ms |
| Recall | Low (exact/fuzzy match only) | High (semantic concepts) |
| Paraphrase handling | No | Yes |
| Cross-document synthesis | Relies on Claude file reads | MCP returns chunks directly |
| Context budget | High (full file reads) | Low (chunks only) |

---

### Finding 5: How Better Self-Knowledge Helps Jarvis

#### 5a. Feature Implementation Brainstorming

Currently, when Jarvis considers implementing a new feature (e.g., "add a hook for tool approval"), it must reason from memory about the hooks API. With the Claude Code docs indexed in Qdrant, Jarvis could:

```
search(query="tool_use approval hook payload format", collection="claude-docs")
→ Returns exact chunk from hooks.md describing approval_decision field
```

This would eliminate hallucination risk on API surface details and provide ground-truth doc chunks during `/brainstorm` or `/reflect` phases.

**Specific benefit areas**:
- Hook payload schemas (PreToolUse, PostToolUse, Stop, Notification)
- MCP server tool definition format and transport options
- Memory system APIs (CLAUDE.md structure, allowed tools)
- Agent subagent patterns and context isolation
- Claude Code settings.json structure and allowed fields

#### 5b. /reflect and /evolve Patterns

The `/reflect` command (AC-05) currently synthesizes insights from Jarvis's own behavior. With Claude Code docs indexed, reflection could include a "spec-check" phase:

- **Spec-check query**: "Are we using the hooks PostToolUse event correctly per documentation?"
- **Evolution proposals**: Grounded in documented capabilities rather than inferred ones
- **Gap detection**: "The docs mention `--dangerously-skip-permissions` but our hooks don't test for that flag"

The `/evolve` pattern (EVO proposals) would benefit from doc-grounded capability discovery — finding documented features Jarvis doesn't yet use.

#### 5c. /maintenance Checks

Maintenance checks (AC-07) verify that Jarvis's infrastructure is correctly wired. With Claude Code docs available:
- Validate that `.mcp.json` structure matches the documented MCP configuration schema
- Check that CLAUDE.md `allowed_tools` syntax matches current Claude Code format
- Verify hook event names against the hooks documentation (e.g., confirming `Stop` vs `PostSessionEnd`)

#### 5d. Hooks, MCP, Skills Architecture Understanding

The Claude Code docs collection would directly index:
- `/en/hooks` — full hooks lifecycle, all event types, payload formats
- `/en/memory` — CLAUDE.md structure, project vs global instructions
- `/en/mcp` — MCP configuration, transport options, tool schemas
- `/en/github-actions` — CI/CD integration patterns
- All 6 SDK API references — relevant for MCP server authoring

For Jarvis, this is like giving the architect access to the building code. Currently, hooks and MCP behavior is inferred from `.claude/context/` notes and memory. With live doc search, behavior can be verified against Anthropic's current specification.

---

## Implementation Strategy: Indexing Claude Code Docs into Jarvis RAG

### Phase 1: Install and Fetch (Est. 10-15 minutes, one-time)

```bash
# 1. Install claude-code-docs to get the fetcher
curl -fsSL https://raw.githubusercontent.com/costiash/claude-code-docs/main/install.sh | bash

# This creates:
#   ~/.claude-code-docs/          — local repo clone
#   ~/.claude-code-docs/docs/     — 571 markdown files (after first sync)
#   ~/.claude/commands/docs.md    — /docs command (can ignore or delete)
```

After install, the docs are in `~/.claude-code-docs/docs/`. No further configuration needed for fetching.

### Phase 2: Create Qdrant Collection (New)

Add a `claude-docs` collection to the Qdrant stack. This requires:

1. Edit `/Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/mcp_server.py`:
   - Add `"claude-docs"` to `VALID_COLLECTIONS`
   - Add collection to `file_to_collection()` routing (docs from `~/.claude-code-docs/` path)

2. Create the collection in Qdrant (via HTTP or the existing `jarvis-rag` MCP):
   ```python
   # Collection spec: 2560-dim Cosine (matches all other collections)
   qdrant.create_collection(
       collection_name="claude-docs",
       vectors_config=VectorParams(size=2560, distance=Distance.COSINE)
   )
   ```

### Phase 3: Batch Ingest

Use the existing `ingest_directory` MCP tool:

```
ingest_directory(
    directory="/Users/nathanielcannon/.claude-code-docs/docs",
    collection="claude-docs",
    recursive=True
)
```

The `ingest_directory` tool already handles:
- Recursive `.md` file discovery
- SHA-256 deduplication (skip already-indexed files)
- Old vector cleanup on re-index
- 50-point batch upsert to avoid Qdrant timeouts

Estimated time: ~15-25 minutes for 571 files × ~5 chunks × Ollama embedding calls.

### Phase 4: Add Metadata Routing

Optionally, enrich chunk payloads with category metadata from the paths manifest. This enables filtered search:

```python
search(
    query="hook payload format",
    collection="claude-docs",
    filter={"category": "claude_code"}  # Only Claude Code CLI docs
)
```

This requires a small modification to `ingest()` to accept extra payload fields. The `paths_manifest.json` from the repo maps each URL path to a category.

### Phase 5: Wire into Jarvis Workflows

**session-start.sh** (AC-01): Add a claude-docs query to orientation:
```bash
# Query claude-docs for any hooks or MCP changes in the last sync
# Compare against .claude/context/notes on known behavior
```

**Maintenance checks** (AC-07): Add a verification query:
```
search("hooks Stop event payload schema", collection="claude-docs")
→ Diff against expected fields in hooks implementation
```

**Research skill**: The `research-ops` skill can query `claude-docs` as a backend:
```
When researching Claude Code capabilities, also query:
search(query, collection="claude-docs", top_k=5)
```

### Phase 6: Periodic Refresh

Add an n8n workflow (Milestone 5) to:
1. Run `cd ~/.claude-code-docs && git pull` weekly
2. Run the Python fetcher to sync new/changed docs
3. Re-run `ingest_directory` (hash deduplication makes this safe and fast)

Alternatively, a cron entry until n8n is wired:
```bash
# ~/.claude-code-docs update cron (weekly, Sunday 3am)
0 3 * * 0 cd ~/.claude-code-docs && git pull && python3 scripts/fetch_claude_docs.py
```

---

## Comparison Table

| Aspect | claude-code-docs (as-is) | Jarvis Qdrant Integration |
|--------|--------------------------|--------------------------|
| Search method | Keyword + Claude file routing | Dense vector (qwen3-embedding) |
| Query latency | 200ms-2s (file reads) | 1-2ms (Qdrant) |
| Context budget | High (Claude reads full files) | Low (chunk-level returns) |
| Offline | Yes | Yes (local Ollama + Qdrant) |
| Update mechanism | GitHub Actions + git pull | git pull + re-ingest |
| Cross-collection search | No | Yes (multi_search MCP tool) |
| Metadata filtering | No | Yes (Qdrant payload filters) |
| Integration with /reflect | No | Yes (MCP tool call) |
| Auto-grounding of proposals | No | Yes (doc-backed answers) |

---

## Recommendations

1. **Primary: Install + Ingest into Qdrant** (High priority, low complexity)
   - Run the install one-liner to get the fetcher working
   - Add `claude-docs` collection to Qdrant
   - Run `ingest_directory` on `~/.claude-code-docs/docs/`
   - Update `mcp_server.py` VALID_COLLECTIONS + routing
   - Rationale: 571 high-quality markdown files, existing ingestion tooling handles it, query quality will be excellent
   - Caveats: ~20-minute one-time setup, Ollama must be running during ingest

2. **Secondary: Delete the /docs slash command** (Low priority, optional cleanup)
   - After ingestion, the `~/.claude/commands/docs.md` file is redundant
   - Jarvis uses MCP tools, not slash commands for doc lookup
   - Rationale: Avoids context pollution from an unused command definition

3. **Tertiary: Wire into /reflect spec-check phase** (Medium priority)
   - Add a "spec-check" step to the `/reflect` workflow that queries `claude-docs` for any APIs Jarvis uses
   - Rationale: Ground-truth verification of hook/MCP/memory API usage against documentation

4. **Do not fork** (Confirmed)
   - The fetcher is solid; no Jarvis-specific modifications needed
   - Forking creates maintenance burden with no net gain

---

## Action Items

- [ ] Run install one-liner: `curl -fsSL https://raw.githubusercontent.com/costiash/claude-code-docs/main/install.sh | bash`
- [ ] Add `claude-docs` to `VALID_COLLECTIONS` in `/Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/mcp_server.py`
- [ ] Create Qdrant collection `claude-docs` (2560-dim Cosine)
- [ ] Run `ingest_directory("/Users/nathanielcannon/.claude-code-docs/docs", "claude-docs")`
- [ ] Update `file_to_collection()` routing for `~/.claude-code-docs/` paths
- [ ] Optional: remove `~/.claude/commands/docs.md` after ingestion confirmed working
- [ ] Optional: add weekly cron for doc refresh until n8n Milestone 5 is wired
- [ ] Wire `claude-docs` collection into `/reflect` spec-check phase (EVO proposal candidate)

---

## Sources

1. [costiash/claude-code-docs — GitHub](https://github.com/costiash/claude-code-docs)
2. [install.sh — Raw](https://raw.githubusercontent.com/costiash/claude-code-docs/main/install.sh)
3. [scripts/fetch_claude_docs.py](https://github.com/costiash/claude-code-docs/blob/main/scripts/fetch_claude_docs.py)
4. [scripts/build_search_index.py](https://github.com/costiash/claude-code-docs/blob/main/scripts/build_search_index.py)
5. [scripts/lookup/search.py](https://github.com/costiash/claude-code-docs/blob/main/scripts/lookup/search.py)
6. [scripts/fetcher/config.py](https://github.com/costiash/claude-code-docs/blob/main/scripts/fetcher/config.py)
7. [scripts/fetcher/safeguards.py](https://github.com/costiash/claude-code-docs/blob/main/scripts/fetcher/safeguards.py)
8. [scripts/claude-docs-helper.sh.template](https://github.com/costiash/claude-code-docs/blob/main/scripts/claude-docs-helper.sh.template)
9. [paths_manifest.json](https://github.com/costiash/claude-code-docs/blob/main/paths_manifest.json)
10. [Jarvis RAG MCP Server](/Users/nathanielcannon/Claude/Jarvis/infrastructure/rag-service/mcp_server.py)

---

## Uncertainties

- The Claude Code docs at `code.claude.com/docs/sitemap.xml` may change structure; the fetcher's safeguards handle this but the manifest's 2025-12-05 timestamp suggests content may have shifted
- Embedding quality for API reference docs (which contain a lot of code syntax) has not been tested; the current chunk_text() function strips nothing, so code blocks will be embedded as-is
- The 46 Claude Code CLI paths include dynamic content (VS Code, GitHub Actions) — some may be stale relative to current Claude Code 2.1.45 (installed on this system)

## Related Topics

- n8n workflow automation for periodic doc refresh (Milestone 5)
- EVO proposal for `/reflect` spec-check phase (doc-grounded evolution)
- Graphiti episode ingestion from Claude Code changelogs (structured knowledge graph entries for API changes)
- Metadata-filtered Qdrant search (category field on chunk payloads)
