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

### 2026-02-20 [b01bb9908d17]

**Idle-hands infinite-commit bug**: The original `settings.json` had an inline command that unconditionally deleted `.idle-hands-active.W{n}` on every `UserPromptSubmit`. But idle-hands *itself* injects prompts — so its own injections were killing its state file before the `Stop` hook could advance phases. The fix extracts this to `prompt-timestamp.sh` which checks if the prompt starts with `[IDLE-HANDS]` and preserves the state file in that case. Classic case of a hook interfering with its own lifecycle.

### 2026-02-20 [812a601d6ab1]

**The "Cooking" guard is the critical addition.** Without it, the existing guards would have passed W0 as "idle" right now — the `❯` prompt is visible, the status bar has "tokens", there's no text at the prompt, and no "Interrupted" banner. Only the "Cooking..." indicator reveals the model is actively processing. In a long-running task (>15min), the timestamp would expire and Ennoia would have incorrectly injected an idle-hands prompt on top of active work.

### 2026-02-20 [e9aaf1f0101b]

**Chunking distribution**: The pages ranged from 1 chunk (short stubs like "Bone meal") to 88 chunks ("Stupid dwarf trick" — a massive community compilation). The biggest pages were: Stupid dwarf trick (88), Minecart (81), Quickstart guide (71), Megaproject (62), Defense guide (53). These dense guides are exactly the kind of content that makes RAG valuable — they contain detailed procedural knowledge that's hard to summarize into a single embedding.

**Skip rate**: Only 24/564 pages (4%) were too short (<100 chars after wikitext stripping). These were mostly redirect pages or stubs where the wikitext was primarily templates with no substantive content. The "Reaction token" page that was skipped likely had its content entirely in templates.

### 2026-02-20 [9120456ad8ee]

**Hash-based dedup worked perfectly**: The myDFHackScripts collection correctly detected all 21 Lua files had identical hashes to what was already indexed — saving 156 redundant embedding calls. This is the `file_hash` check in the ingestion pipeline: compute SHA-256 of the full text, check if Qdrant already has a point with that hash, skip if matched. Cheap guard against re-indexing unchanged content.

**df-wiki count discrepancy**: The final stats show `df-wiki: 1976` but we just ingested 4,232 points in the wiki run. This is likely because the codebase ingestion script ran its stats snapshot *during* the wiki ingestion (they were concurrent background tasks), catching it mid-flight. The actual count from the completed wiki task was 4,232.

### 2026-02-20 [92af4d563dcc]

The reflection uncovered a significant **configuration drift** problem. Three separate systems reference the evolution queue at three different paths (`.claude/evolution/`, `.claude/state/queues/`, and just `evolution-queue.yaml`), and none of the files actually exist. This means every reflection that generates proposals has been writing them into the report but they never reach an actionable queue. Similarly, the corrections files are referenced at `.claude/context/lessons/` in the AC-05 state file but actually live at `.claude/context/psyche/self-knowledge/`. This kind of path fragmentation is a hallmark of rapid organic growth without periodic consistency audits.

### 2026-02-20 [94a2f1086716]

**Reflection #12 complete.** The key finding is that the AC-05 → AC-06 pipeline (reflect → evolve) is structurally broken because the evolution queue file doesn't exist. This means 7+ proposals across multiple reflections have been "generated" only in report markdown, never reaching an actionable queue. The fix (REFL-012) is straightforward — create the file and update references — but its absence explains why `/evolve` cycles haven't been consuming reflection output.

The Graphiti ingestion (23 entities, 21 edges) ensures these findings persist across context boundaries, so even if this session compresses, the configuration drift pattern is retrievable.

### 2026-02-20 [19e6576a9982]

**Pattern matching on TUI indicators must be structural, not lexical.** Claude Code randomizes the processing verb from a pool (Cooking, Deliberating, Brewing, Pondering, etc.), so matching specific words creates a fragile guard. The reliable pattern is `● [A-Za-z]+…` — the `●` bullet is the constant structural element, and the unicode `…` (U+2026) terminates the verb. This same principle applies to any future TUI scraping: match the layout grammar, not the content vocabulary.

### 2026-02-20 [c9b64090394c]

The power of semantic search over code becomes clear with cross-collection queries. Instead of `grep` which matches literal strings, a query like "reading dwarf job assignments from memory" can find:
- C++ code in `dfhack` that accesses `df::unit::job` structures
- XML structure definitions in `df-structures` for the `unit_labor` type
- Lua scripts in `myDFHackScripts` that manipulate labor assignments
- Wiki documentation about how DF internally manages dwarves

All from a single natural language query, without knowing the exact variable names or file locations.

### 2026-02-20 [f1dbae344df5]

The key changes to `ingest_directory`:
1. **Default pattern changed**: `**/*.md` → `**/*` — now matches all files by default, not just markdown
2. **Comma-separated patterns**: `"**/*.cpp,**/*.h,**/*.lua"` now works, since we split on comma and union the results
3. **Binary file filter**: Auto-skips known binary extensions (images, archives, compiled objects) so the `**/*` default is safe
4. **Hidden/build dir filter**: Auto-skips `.git`, `build`, `node_modules`, `__pycache__`, `.venv`

This means a simple `ingest_directory("/path/to/repo", "my-collection")` will now index ALL text-based source files with zero configuration.

### 2026-02-20 [f1f0d7f07abf]

**Qdrant vs PostgreSQL/pgvector for this use case:**

At 28.8K points with 2560-dim vectors, **Qdrant is the right choice**. Here's why:

1. **Dimension matters**: Qwen3-Embedding-4B produces 2560-dim vectors (10 KB each). pgvector uses IVFFlat or HNSW indexing, but performance degrades noticeably above ~1536 dimensions. Qdrant's HNSW implementation is optimized for high-dimensional vectors.

2. **Storage efficiency**: Qdrant stores vectors in memory-mapped files, giving near-RAM speed with disk-backed persistence. pgvector stores vectors as Postgres rows, adding per-row overhead.

3. **At current scale (585 MB)**: Either would work fine. The choice becomes meaningful at ~100K+ points where Qdrant's dedicated vector index (segment-based HNSW) outperforms pgvector's table-scan approach for filtered queries.

4. **When pgvector would make sense**: If you wanted to JOIN vector search results with relational data (e.g., session metadata in Postgres) in a single query. But Qdrant's payload filtering + Postgres for relational data (as we have now) is actually the cleaner architecture.

Bottom line: **stay with Qdrant**. At the current ~600 MB, scaling to 500K points (~10 GB) is well within a Mac Studio's capacity. The dedicated Docker volume makes backup/migration straightforward.

### 2026-02-20 [080e552f96fe]

The indexing is comprehensive — 22K vectors covering the entire DFHack ecosystem codebase plus 4K wiki articles. This gives us deep domain knowledge about DF's memory structures, API surfaces, Lua scripting patterns, and game mechanics. The **indexing phase is complete** and ready to support downstream work.

The research report at `/Users/nathanielcannon/Claude/Jarvis/.claude/context/research/dwarf-fortress-project-plan.md` defines "Chronicler" — a 5-phase project (Foundation → CDM → AI Storyteller → Data Viewer → Release). No actual Chronicler code exists yet.

### 2026-02-20 [0b50ee7fc975]

**Why four pillars in parallel rather than sequential?** The DF ecosystem is wide but loosely coupled. The game bot (Pillar 3) is pure Lua inside DFHack — no Python dependency. The legends viewer (Pillar 2) needs only an XML file, not a running game. The mod detector (Pillar 4) needs nothing. This means we can validate all four concepts before committing to deep integration, and each pillar produces a standalone "it works!" demo.

**The two-track command pattern** from df-ai is the key architectural insight for Pillar 3: most game interactions can be done via direct memory writes (dig designations, labor toggling, item flags) without navigating DF's UI menus. The df-ai uses Boost coroutines for complex menu navigation, but in Lua we can use DFHack's built-in `repeatutil` and direct `df.*` struct access for the simple PoC.

### 2026-02-20 [f3130bc34995]

The `dfhack-client-python` reference (`/Users/nathanielcannon/Claude/Jarvis/projects/dfhack-client-python/dfhack_remote.py`) gives us the complete DFHack RPC wire protocol: `DFHack?\n` handshake → `CoreBindRequest` to register methods → 8-byte headers (2-byte ID + 2 padding + 4-byte size) → protobuf payloads. The `@remote()` decorator pattern with type annotations for input/output messages is elegant and we'll adapt it into a cleaner class-based client.

### 2026-02-20 [b7b0f73ae44c]

**Why UTM?** UTM is a QEMU-based virtualization frontend for macOS that supports Apple Hypervisor.framework on Apple Silicon. Unlike Parallels (paid) or VirtualBox (no ARM Windows support), UTM is free and handles Windows 11 ARM natively. The key detail: Windows on ARM includes "Prism" — Microsoft's x86/x64 translation layer (similar to Rosetta). Since the October 2025 Windows Update, Prism gained AVX2 emulation, which Dwarf Fortress's Steam version requires.

### 2026-02-20 [4e08f3cd99c5]

UTM's "Virtualize" mode uses Apple's Hypervisor.framework for near-native performance. The "Emulate" mode uses QEMU's software emulation (much slower). Since we're running Windows ARM on Apple Silicon ARM, virtualization is the right choice — the CPU architecture matches natively. The Prism translation layer inside Windows handles x86→ARM translation for Steam and DF.

### 2026-02-20 [35926347ab99]

The UEFI shell is the firmware's fallback when no boot device is found in the boot order. `startup.nsh` is a script the firmware tries to auto-run (like AUTOEXEC.BAT from DOS days). `exit` drops you back to the firmware's boot manager UI. The `FS0:\EFI\Boot\bootaa64.efi` path is the standard ARM64 UEFI boot loader location — `aa64` = AArch64 (ARM 64-bit).

### 2026-02-20 [fa12db19fe30]

DFHack's remote server exposes the same protobuf RPC interface internally that plugins use — `CoreBindRequest` to register methods, then numbered RPC calls. By default it only listens on `127.0.0.1` (localhost inside the VM). Setting `allow_remote: true` binds it to `0.0.0.0`, making it reachable from the host macOS through UTM's shared network bridge. Port 5000 is the default — no firewall rules needed since UTM's shared networking uses macOS's vmnet framework.

### 2026-02-20 [41adf1245a85]

Windows 11 defaults to blocking all unsolicited inbound traffic. Since DFHack's remote server listens on port 5000 but Windows doesn't know about it, the firewall silently drops the connection. Even ICMP ping is blocked by default on Windows 11 — that's why both `ping` and `nc` fail.
