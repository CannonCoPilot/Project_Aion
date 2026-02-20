# Jarvis Insights Log

Captured automatically by insight-capture.js hook.
Processed by /reflect Phase 5 for Graphiti ingestion.

---

### 2026-02-19 [5c7a59bb0f7e]

**RTK and git --amend**: The RTK hook intercepts `git commit` and doesn't support `--amend`. When you need git operations that RTK can't handle, bypass it by calling `/opt/homebrew/bin/git` directly. This is a stable workaround — RTK is a token-saving proxy, not a full git replacement.

**GH007 email gotcha**: Even after setting `git config user.email`, the *current shell environment* may not pick it up for new commits. Always pass `GIT_COMMITTER_EMAIL` as an env var on the commit line itself, not just in git config.

### 2026-02-19 [04e9539383c5]

Notice the idle checkpoint fired after only 15 seconds of watcher uptime — because the *user's* idle time was 658 seconds (since the last UserPromptSubmit timestamp was ~11 minutes ago while we were waiting for the watcher restart). The checkpoint correctly measured idle from the user's perspective, not the watcher's. This is the right behavior: if the watcher restarts mid-session, it immediately catches up on any missed idle checkpoints rather than waiting another 30 seconds.

### 2026-02-19 [524cf547f205]

The IDLE-HANDS system sent 10 identical "review and commit" messages because the JICM watcher's idle checkpoint timer detected no activity and kept re-triggering. The AC state files were the only uncommitted work — now resolved. The session is clean.

### 2026-02-19 [9d7576bc78d9]

**DFHack found 1,968 indexable files** — that's the full depth of the codebase including df-structures XML (129 files), Lua scripts (156), C++ plugins (86), stonesense (3D viewer plugin), all headers, and docs. With an average of ~4 chunks per file and ~2-3 seconds per embedding, this indexing job will run for roughly 4-6 hours. Running all three jobs simultaneously will triple the queue to Ollama, so expect wall-clock time to be dominated by the DFHack job. This is a one-time cost — subsequent re-indexes will skip unchanged files via content hashing.

### 2026-02-19 [38f479d22fc6]

The indexing was interrupted when JICM triggered context compression in the previous session. The `index_to_qdrant.py` script is idempotent — it checks file hashes in Qdrant before re-embedding, so we can safely re-run it to continue where it left off. The script uses Ollama's `qwen3-embedding:4b` (2560-dim vectors) for consistency with the rest of Jarvis's RAG infrastructure.

### 2026-02-19 [87b8cb63f9ea]

- The Apple **Neural Engine** (38 TOPS on M4 Max) is NOT used by any of these options — it's only accessible via Core ML with fixed input shapes, making it impractical for dynamic embedding workloads
- **vLLM** on Apple Silicon exists in two forms: `vllm-metal` (official, no embeddings) and `vllm-mlx` (independent, supports `/v1/embeddings`)
- **LM Studio** uses llama.cpp OR MLX, but has a known bug with the `dimensions` API parameter and is closed-source — not suitable for Jarvis's headless infrastructure
- **PyTorch MPS** is 30–60x slower than MLX — avoid for inference

### 2026-02-19 [71ecfcd68180]

**Graphiti still uses Ollama for embeddings** — it goes through `OpenAIEmbedder` pointed at Ollama's `/v1/embeddings` endpoint. The MLX server only exposes `/embed` (custom format), not the OpenAI-compatible `/v1/embeddings`. Migrating Graphiti would require either adding an OpenAI-compatible endpoint to the MLX server or switching to `vllm-mlx`. Since Graphiti embedding calls are infrequent (only during `add_episode()`), the RAG service migration covers the high-throughput path. We can tackle Graphiti separately.

### 2026-02-19 [6401bf566d1f]

**Benchmark results — MLX vs Ollama**:
- **MLX average**: ~170ms (57-395ms range, with first request warming cache)
- **Ollama average**: ~536ms (413-677ms range, consistently high)
- **Speedup**: ~3x for warm requests. The MLX server's cache also gives near-zero latency for repeated queries.
- The 395ms first request includes curl connection overhead + any Metal kernel JIT. Subsequent requests settle around 57-154ms.
- For batch ingestion (dozens of chunks), this gap compounds dramatically since MLX supports batching while Ollama processes one at a time.

### 2026-02-19 [b5864036011b]

**Subagent MCP permissions**: When subagents call MCP tools, each tool call generates a permission prompt in the parent session. If the user rejects one or interrupts, all pending subagent MCP calls get rejected simultaneously. For bulk MCP operations like multi-repo indexing, it's better to either (a) run them directly in the main context with user standing approval, or (b) batch multiple repos into a single `ingest_directory` call if the tool supports it.

### 2026-02-19 [b3c31bf94ebf]

**@-imports in CLAUDE.md are context budget multipliers.** Every `@file` directive in CLAUDE.md loads that file's entire contents into the system prompt for every turn of the conversation. A 280-line completed plan file costs ~1,500 tokens per turn — across a typical 50-turn session, that's 75,000 tokens of dead weight. The right pattern is: `@`-import only files that provide active routing value (capability maps, identity, references), and use `session-state.md` priorities for current work tracking since that file is already loaded via the Key References table.

### 2026-02-19 [9621422d13ea]

**Hook consolidation pattern**: `usage-tracker.js` (lines 1-18) explicitly states it merged 3 separate hooks into one: `selection-audit.js`, `file-access-tracker.js`, and `memory-maintenance.js`. It writes to the same `selection-audit.jsonl` log file with identical categorization logic. The archived `selection-audit.js` is **fully superseded** — re-registering it would create duplicate logging. The priority item "Re-register selection-audit.js" is stale.

### 2026-02-20 [5a5347840ae3]

**Exit code 137 = SIGKILL** — this is the OS or container runtime forcefully killing the process. Common causes: OOM killer (process exceeded memory limits), or Claude Code's background task timeout. The DFHack indexing job was embedding 1,968 files and got through 1,272 (65%) producing 6,909 chunks before being killed. The already-indexed data should be safely persisted in Qdrant — upserts are atomic.

### 2026-02-20 [76bb8ae61b8b]

**HNSW indexing threshold**: Qdrant collections with `indexed_vectors_count: 0` aren't broken — they're below the `indexing_threshold: 10000`. Qdrant uses brute-force search for small collections (fast enough under ~10k points). The dfhack collection (8,476 points, 8,039 indexed) is close to the threshold and has partial HNSW indexing already built across its segments. Search works on all collections regardless.

### 2026-02-20 [154fb3f65d18]

**DF Wiki is a MediaWiki site with 43,621 pages (10,131 articles).** The API supports bulk fetching via `action=query&list=categorymembers`. The DF2014 pseudo-namespace holds the bulk of relevant content. Key categories are large: Creatures (689 pages), Creature raw pages (769), Fortress mode (65), Guides (47), Game mechanics (34), Buildings (26), Items (52). For RAG, we want the core gameplay/mechanics pages (~500-800 high-value articles), NOT all 10k articles (many are individual creature variants, bug reports, or stubs).
