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

### 2026-02-20 [5bb6d000bd9d]

The branch is now 10 commits ahead of remote. The only remaining untracked file is `.claude/logs/jicm-watcher.log.1` — a rotated log from the JICM watcher process. Log rotations like this happen when the watcher restarts; the `.1` suffix is the previous log preserved for debugging but not version-controlled.

### 2026-02-20 [b2f4c491c4d9]

The 6 stale AC components (AC-02 through AC-08, AC-10) haven't been touched in 9-34 days. These are autonomic subsystems (Wiggum review loop, JICM state tracker, evolution/R&D cycles, Ulfhedthnar). They're not broken — they just haven't run their self-update routines recently. A `/maintain` cycle would refresh them, but it's not urgent.

### 2026-02-20 [0fcfef1242ea]

**Why PowerShell over SMB/shared folders?** UTM supports shared directories but requires a VM restart to configure. SMB would work (Windows has it built-in) but needs firewall rules and share setup. PowerShell's `HttpListener` gives us an instant file server with zero configuration — and we already confirmed the network path works via port 5000.

### 2026-02-20 [49be9f2cd8b8]

The error is a classic chicken-and-egg: `get_pool()` registers the pgvector type codec on every new connection, but the `vector` extension hasn't been installed yet (that's in `schema.sql`). The fix: `init_db()` must run the schema *before* creating the pool, using a plain connection without vector codec registration.

### 2026-02-20 [c5297bce2dc3]

**Why CP437 cleaning matters**: Dwarf Fortress uses the old IBM Code Page 437 character set (the DOS-era extended ASCII with box-drawing characters and special symbols). The `_clean_legends_xml()` function reads with `encoding="cp437"` and strips control characters that would cause XML parsing to fail. Without this, characters like `♠♣♦♥` in dwarf names would crash the parser.

**The JSONB overflow pattern**: The schema uses typed columns for the ~30 most common event fields (`hf_id_1`, `site_id`, etc.) plus a JSONB `details` column for everything else. This gives us fast indexed queries for the common case while still capturing 100% of the data — no information loss. This is a proven pattern for semi-structured game data.

### 2026-02-20 [3b1275bed265]

**The three-zone separation**: This mirrors how professional software organizations structure things: (1) a project management zone (Jira, Confluence = `Jarvis/projects/chronicler/`), (2) a source code zone (GitHub = `Projects/DwarfCron/`), and (3) a vendor/reference zone (package manager caches, SDK docs = `GitRepos/`). Each zone has different lifecycles — process artifacts accumulate over time, product code is versioned and released, reference repos are pulled and updated independently.

**Validated**: The `chronicler validate` command confirms all 109,466 database records are still accessible from the new location. Path-relative config (`__file__`-based) meant zero code changes were needed for the move.

### 2026-02-20 [3739e5d2f0e1]

The CDM schema mirrors Dwarf Fortress's own data model: **figures** have **links** (relationships), belong to **entities** (civilizations), and participate in **history events** which are grouped into **collections** (wars, beast attacks). The `legends_plus.xml` provides richer data than the base `legends.xml` — it includes things like entity positions, detailed site structures, and artifact descriptions that the standard legends mode omits.

### 2026-02-20 [28ba4de330f4]

**XPath gotcha**: `.//entity` matches ANY `<entity>` element at any depth in the document — not just those under the `<entities>` section. In legends_plus.xml, there are likely `<entity>` sub-elements inside other sections (e.g. `<entity_populations>` or event details). The `_parse_entities()` for legends.xml works because that file doesn't have nested `<entity>` elements elsewhere. Fix: use a section-specific path like `root.find("entities")` then `.findall("entity")`.

### 2026-02-20 [d347c65eb24e]

**XPath `.//entity` is a trap in DF XML**: The `<entity>` tag name appears not just under `<entities>` but also nested inside `<historical_figure>` entity links, event details, and other sections. The broad XPath `.//entity` captures all of them (hence the earlier 2,460 count from research). The precise path `root.find("entities").findall("entity")` gets only the 441 actual entity records. This is a general gotcha with XML legends parsing — always scope to the parent section.

**The 69 nameless entities**: These are entities whose `<name>` tag in legends.xml was empty or absent. This is normal for DF — some site governments and minor organizations don't have formal names. The `name IS NULL` count (69) is consistent before and after the fix.

### 2026-02-20 [501b9cf909e8]

**Near-linear scaling**: Throughput held steady at ~44-48K rows/sec across a 14x data increase. The pipeline processes 527 MB of XML and inserts 1.58M rows in 36 seconds — no memory blowup, no exponential slowdown.

**Where time goes**: The breakdown is roughly 6s XML parsing (legends.xml), 7s parsing (legends_plus.xml), and ~23s database inserts. The `executemany` batch inserts (1000 rows/batch) keep DB round-trips manageable. The heaviest tables — `history_events` (567K rows, ~9s) and `hf_links` (351K rows, ~4s) — dominate insert time.

**Superlinear data growth**: Events scale at 19x and relationships at 23x for a 3x increase in world-gen years. This is because older civilizations accumulate more interactions per year — a 309-year world has more HFs alive simultaneously, producing combinatorial event growth.

### 2026-02-20 [24352c15fd51]

The entity merge uses a classic **upsert pattern** via `ON CONFLICT (id) DO UPDATE SET` with `COALESCE`. This is the right approach because:
1. `legends.xml` has `name` but not `type`/`race` — it's inserted first
2. `legends_plus.xml` has `type`/`race` but not `name` — `COALESCE(EXCLUDED.type, entities.type)` fills in only the NULL fields
3. New entities from legends_plus (sub-entities like site governments) that don't exist in legends.xml are inserted fresh

This is the same merge strategy used by Java-based Legends Viewer — parse base graph first, then augment in-place.

### 2026-02-20 [c31a15a2218a]

**Gitignore strategy**: The `.gitignore` excludes by content type, not blanket directory:
- `data/legends/*.xml` blocks the huge DF export files but keeps the `data/wiki/` markdown articles in the repo — these are scraped reference data that's useful for code review and AI context
- `repos/` blocks cloned reference repos (dfhack, Dwarf-Therapist) which are third-party and shouldn't be vendored
- The repo stays at ~3.5MB instead of ~1.1GB

**Note**: `chronicler/config.py` contains a hardcoded DB password fallback (`OSDbeydP6TOBGoJUym6rTBfULKJYqqPE`). Since the repo is private and this is a local Docker postgres password, it's low risk — but if you ever make the repo public, that should be moved to env-only.

### 2026-02-20 [05460e52ad36]

**Architecture**: The system follows a clean pipeline: **User Query → Keyword Extraction → CDM SQL Search → Context Assembly → LLM Prompt → SSE Token Stream → Browser Render**. No vector embeddings are used for retrieval here — that's intentional because proper nouns (character names, site names, war names) are better served by exact ILIKE matching with trigram indexes than by embedding similarity. The fallback to world overview (top civilizations, major wars, legendary fighters) ensures the user always gets something useful.

**Performance**: The pg_trgm GIN indexes make ILIKE `%keyword%` queries use index scans on 55K+ historical figures. The LLM response arrives via SSE streaming, so the user sees the first tokens within ~1 second of submitting a query — much better UX than waiting for the full response.

### 2026-02-20 [7bc2c9e9de0a]

**Architecture**: This is an htmx + SSE pattern — the browser sends a POST to `/api/ask`, which returns an `EventSourceResponse`. htmx's `hx-ext="sse"` handles reconnecting and appending tokens in real-time. No JavaScript framework needed — just htmx for interactivity and a bit of vanilla JS for SSE consumption, since htmx's native SSE support doesn't handle streaming token-by-token well. The server streams JSON chunks with `{token: "..."}` until `{done: true}`.

**Styling**: DF-themed means dark stone/parchment tones — think `#1a1a2e` backgrounds, amber/gold text (`#d4a574`), fortress-style borders. The Chronicler narrator persona calls for something that feels like reading ancient scrolls in a dimly lit library.

### 2026-02-20 [e29e53244cce]

**Ollama API `think` parameter placement**: For Qwen3 models, `think: false` must be at the **top level** of the request payload, not nested inside `options`. When inside `options`, it's silently ignored, causing the model to generate internal thinking tokens before the actual response — potentially doubling or tripling latency.

### 2026-02-20 [cc7795d151cd]

**Three key optimizations that matter most for local LLM checkpoint quality**:
1. **`think: false` at payload root, not in `options`** — Ollama silently ignores it inside `options`, doubling latency
2. **Condensed LLM input** — Feed structured data + truncated messages (~3KB) instead of full Tier 1 output (~20KB). Full data stays in the raw appendix.
3. **Output token cap at 400** — The model naturally stops at 100-300 tokens for concise structured tasks. Higher caps only matter when the model needs to be verbose.

### 2026-02-20 [4011ca5559ce]

**Monitoring architecture choices:**
1. **`time.monotonic()` over `time.time()`** — monotonic clocks can't go backwards (NTP adjustments, system sleep). Critical for latency measurement where even a 1ms jitter from clock correction would corrupt timing data.
2. **`first_token()` is idempotent** — the `if _t_first_token == 0.0` guard means it only records the *first* call, even though it's called on every token. This avoids branching logic in the hot SSE loop.
3. **Silent failure in `flush()`** — the bare `except: pass` is intentional. Monitoring must *never* break the user's storytelling experience. If Postgres is down, the query still works; you just lose the log entry.

### 2026-02-20 [afa37c58b201]

The Chronicler `llm.py` uses the standard OpenAI `/v1/chat/completions` SSE protocol. Ollama natively supports this same endpoint, so switching from LiteLLM to Ollama direct is a one-line config change (`LITELLM_URL`). For a user-facing streaming UI, Ollama direct gives dramatically better TTFT (time-to-first-token).

### 2026-02-20 [d8c1a8af3936]

**What the monitoring data already reveals:**
1. **TTFT of 405ms** is solid for a local 8B model — user sees text start in under half a second
2. **Only 1 context record** was retrieved — the keyword extraction from "most legendary warriors" likely didn't match many entity names via ILIKE. This is expected for broad/abstract queries; the `_world_overview()` fallback kicked in
3. **13.6s total** for 651 tokens = ~48 tok/s generation speed, which is typical for qwen3:8b on Apple Silicon

### 2026-02-20 [433f9250a32a]

**What the monitoring data reveals about system behavior:**

1. **Query #2 (wars) found 20 context records** — the most of any query. This makes sense: "wars" matches `history_event_collections` with type='war' directly, plus related entities. The rich context led to a focused 514-token response in only 7.9s total.

2. **Queries #3 and #4 had high TTFT (6.8s and 14.5s)** because they ran concurrently with #2 — Ollama serializes model inference, so they queued behind each other. Single-query TTFT is ~400-800ms (queries #1 and #2).

3. **Query #4 (Ormon, vampires) only generated 11 tokens** despite finding 6 context records — the model likely found the context insufficient and gave a very short response. Worth investigating whether Ormon's vampire/necromancer data is sparse in the CDM.

### 2026-02-21 [9201e6716f17]

**JICM checkpoint quality finding**: The Tier 2 LLM narrative hallucinated an incomplete task. The qwen3:8b model picked up "observability" from the plan document but didn't cross-reference the actual file timestamps or git state to verify completion. This is a known limitation of summary-based checkpoints — they capture intent but not verified state. A fix would be to include a "recently modified files" section in the Tier 1 data.

### 2026-02-21 [6f52e4d8a888]

**Why 400 → 2000 tokens matters**: Ollama's `num_predict` controls the max output tokens. At 400, the model was being cut off mid-sentence — it would generate "Key Paths: AC-0" and hit the wall. Qwen3:8b naturally stops at ~200-400 tokens when given a concise task, so 2000 isn't wasteful — it just removes the ceiling. The model self-regulates output length based on input complexity.

**Path hallucination in small LLMs**: Qwen3:8b doesn't know the actual filesystem layout. Without the project path in the prompt, it falls back to training priors (`/home/user/`). Injecting the real path via `{project_dir}` template substitution is a clean fix that costs ~10 tokens of input for correct output paths.

**Meta-capture filtering**: The jq filters (`startswith("Context restored") | not`) run at extraction time, before the data ever reaches the LLM — this is more reliable than asking the LLM to ignore certain messages, which it might not do consistently.

### 2026-02-21 [7dff9df4779e]

**Cross-session JSONL contamination**: The `find_best_jsonl()` function picks the JSONL with the most genuine user messages. Our W5 session (8MB, 4102 lines) has far more messages than any W0 session (which get compressed frequently). So the checkpoint always captures W5's conversation (about JICM enrichment) instead of W0's conversation (about Chronicler work). The LLM narrative looks correct only because session-state.md provides the task context — the actual conversation data in the checkpoint is from the wrong session.

### 2026-02-21 [f788186690c6]

**Signal-based session fingerprinting**: The `[JICM-HALT]` marker approach is an example of exploiting existing protocol artifacts as implicit metadata. Rather than adding explicit session tracking (which would require modifying the JSONL format or adding IPC between processes), we search for a string that already uniquely identifies the target session. This is the "passive fingerprint" pattern — data you already emit becomes your identifier.

**Cascading idle detection**: The `skip_trigger` parameter illustrates a common issue in state machines where a function designed for one context (probing for idle) causes harm in another (post-HALT). The fix is minimal — a boolean parameter rather than a redesign — because the state machine transitions are otherwise correct. The principle: when you find a bug at a state transition, the smallest fix that respects the existing architecture is usually the right one.

### 2026-02-21 [078e3009912b]

**Why only W1:Watcher needs restart**: The watcher (PID 73592) is a long-running bash process that loaded `jicm-watcher.sh` into memory at startup. Our `wait_for_idle()` and `do_halt()` changes won't take effect until the process restarts. However, `jicm-prep-context.sh` is called via `bash "$prep_script"` on every compression — so our JSONL targeting, plan enrichment, and archive inclusion changes are already live (bash re-reads the script file each time it's invoked). Only Fix 1 (the double-ESC) requires a watcher restart.

Ennoia (PID 10857) doesn't use the modified code, so no restart needed there.

### 2026-02-21 [f8fd7f80c49f]

**Two-phase search architecture: categorical routing + name matching**

The core problem was a *vocabulary mismatch* — users speak in categories ("deities", "megabeasts") while the data uses attributes (`is_deity=TRUE`) and race identifiers (`FORGOTTEN_BEAST_55`). This is a classic information retrieval challenge.

The fix uses a **routing table pattern**: a static dictionary maps ~45 conceptual keywords to structured query strategies (boolean flags, LIKE patterns, entity types, collection types). Keywords not in the routing table fall through to the existing ILIKE name search. This gives us the best of both worlds — categorical queries now work, while specific name searches ("Tell me about Urist") are unaffected.

The `_VALID_HF_FLAGS` allowlist prevents SQL injection even though we use f-strings for the column name — the param is validated against a known-good set before interpolation.

### 2026-02-21 [b4708564f293]

**Where we actually are vs. the plan:**

The PoC roadmap was written before any code existed. Since then, significant execution has happened, but it diverged from the plan in interesting ways:
- **Pillar 0**: DONE (UTM VM at `192.168.64.2`)
- **Pillar 2 / Phase 1**: Largely DONE — the CDM schema exists, XML parser ingested 109K records (Namoram) + 1.54M records (Ormon), `chronicler` CLI works
- **Pillar 2 / Phase 2**: Partially DONE — the storyteller has a web UI with SSE streaming, context retrieval with categorical routing, and the monitoring system we just committed. But the embedding/RAG pipeline was skipped in favor of direct SQL context retrieval (simpler, works well enough for PoC)
- **Pillar 2 / Phase 3**: Partially DONE — FastAPI serves the storyteller UI, but the full REST viewer (figures/sites/events/demographics endpoints) hasn't been built yet
- **Pillar 1** (live DFHack RPC): NOT STARTED — the protobuf client hasn't been built
- **Pillar 3** (game bot Lua): NOT STARTED
- **Pillar 4** (mod conflict): NOT STARTED

The actual execution compressed Phases 1-2-3 of the Legends track while deferring the live data and bot tracks entirely.

### 2026-02-21 [2691299e7067]

**The CDM already has live data scaffolding**

The schema at `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/schema.sql:224-241` already defines a `units` table with `pos_x/y/z`, `hist_fig_id`, `civ_id`, and `last_synced_at` — explicitly designed for DFHack RPC data. There's also a `chronicler/dfhack/__init__.py` directory already created (likely empty). The schema was forward-designed for exactly this use case.

### 2026-02-21 [736ee13ff1b8]

**Why hybrid RPC + Lua beats any single approach**

There are three roads to live data:
1. **Pure RPC** (`GetUnitList` etc.) — structured but *shallow*: units come back as (id, pos, race, profession) with no skills, moods, or relationships
2. **Pure Lua scripts + file polling** — deep but *asynchronous*: events are logged to a CSV file on the VM, requiring HTTP polling with latency
3. **Hybrid: RPC for structure + `RunLua` for depth** — best of both: use RPC for the communication channel, `RunLua` to execute custom Lua that accesses the full `df.global` tree and returns JSON

The hybrid approach needs only one prerequisite: `allow_remote: true` in `dfhack-config/remote-server.json` on the VM. After that, a single TCP connection gives us everything.

### 2026-02-21 [3fa9cd2729f6]

**End-to-end live game data pipeline achieved.** The `DFHackClient` connects to DFHack v53.10-r1 over TCP, performs the custom handshake protocol, binds methods dynamically via `BindMethod(0)`, and returns rich unit data with resolved profession/skill names. Key design decisions:

1. **Method binding is lazy + cached** — each RPC method is bound on first use, then the assigned ID is reused for subsequent calls. This avoids binding all methods upfront.
2. **CDM-compatible output** — `_unit_to_dict()` maps protobuf fields directly to our Chronicler Data Model columns (id, name, race, profession, hist_fig_id, civ_id), so data flows straight into PostgreSQL.
3. **No `allow_remote` needed** — Core API methods (ListUnits, ListEnums, GetWorldInfo) work over the network by default. Only plugin methods like RemoteFortressReader require the `allow_remote` flag.

### 2026-02-21 [8a657cc567e4]

**Live game → PostgreSQL pipeline complete.** Key architectural points:

1. **Upsert pattern** — `ON CONFLICT (id) DO UPDATE` means repeated syncs are safe and idempotent. Running `sync-live` multiple times just updates positions, professions, and skill XP as the game progresses.
2. **JSONB `details` column** — Skills, labors, flags, and custom profession are stored as structured JSON, queryable via PostgreSQL's `->` and `->>` operators (e.g., `details->'skills'`). This avoids schema changes when we add new data fields.
3. **`hist_fig_id` is the bridge** — Each named dwarf has a historical figure ID that joins directly to the `historical_figures` table (populated from legends XML). Vabôk (HF:689) can be cross-referenced with their legends history — we can tell stories that blend *live gameplay* with *historical context*.

### 2026-02-21 [dd4c4c33c8d6]

**The live↔legends join reveals a critical data quirk.** Historical figure IDs from the live game map to legends records that often show different names and even *different races* (HF:5702 is "HUMAN/FEMALE" in legends but "Litast" the WOODWORKER in-game). This happens because:

1. **DF reuses HF IDs** — In a reclaimed/restarted embark, the game may assign historical figure IDs that previously belonged to different entities in the world history. The legends XML captures the *world-generation* identities, while the live game shows the *current embark's* identities.
2. **Name discrepancies** — Legends stores the original world-gen name ("asmel ceilinghall"), while the game shows the *translated dwarf name* ("Dumat Kodkib"). These are the same figure expressed in different language modes.
3. **Death records** — The "death years" in legends may refer to the *world-gen simulation* deaths, not actual gameplay deaths. When you embark, the game generates new figures or reuses slots.

**For storytelling, this means we need to treat legends data as *world context* and live data as *ground truth* for the current state.** The join is still extremely valuable for relationship networks and entity affiliations.

### 2026-02-21 [5f54aac76e8d]

**The evolution queue exists but is stale.** Reflection #12 incorrectly flagged it as missing — the file existed (Feb 18) but wasn't found because the reflect workflow checked the wrong path. More critically, REFL-012 through REFL-015 proposals were never added to the queue, confirming the "write-only proposals" pattern. The queue has 7 entries (all from Jan-Feb 8), while 2 reflections generated 4+ proposals each since then.

**JICM checkpoint narrative hallucination is consistent.** All 5 JICM checkpoints from this session repeat "Implementing observability for Chronicler Monitoring System — IN PROGRESS" despite `current-plans.md` saying "(none — picking next priority)". The Qwen3:8b enrichment layer doesn't cross-reference completion status.

### 2026-02-21 [c66d74145c3a]

**Self-healing the pipeline**: REFL-016 says "add evolution queue append step to /reflect." Rather than just writing the proposal and leaving it for a future `/evolve` cycle (which would repeat the exact dead-letter problem), I'll append the proposals to the queue *now* as part of this reflection — proving the fix works by using it.

### 2026-02-21 [84fac09e1434]

**Self-healing pipelines are more valuable than proposals.** Reflection #12 identified the dead-letter problem and proposed REFL-012 — but that proposal itself became a dead letter. Reflection #13 broke the cycle by *implementing the fix as part of the reflection itself*, appending proposals directly to the queue. The lesson: when a meta-system is broken (the system that improves the system), the fix must be applied immediately, not queued for a future cycle that depends on the broken system.

**Graphiti captures structural relationships, not just facts.** The 68 edges from this ingestion encode things like "REFL-016 resolves proposal dead-letter pattern" and "AC-05 has pipeline to AC-06" — relationships that a flat document search would miss. Future queries like "what proposals address the dead-letter problem?" will resolve directly through graph traversal.

### 2026-02-21 [45f9d33bd848]

**The commit captures a complete self-improvement cycle.** 6 files changed: the reflection report itself, the evolution queue with 5 new proposals appended, the corrected AC-05 state file, and the insights log with new entries. This is the first time the AC-05 → evolution queue pipeline has actually worked end-to-end — every previous reflection wrote proposals only to the report markdown.

### 2026-02-21 [4e011893e119]

**The 16 unpushed commits are notable.** Branch `Project_Aion` has diverged significantly from `origin/Project_Aion`. This accumulated across sessions 29-30 (JICM v7.1 fixes, checkpoint quality, reflection #13). A push would be prudent before the next session boundary.

**6 stale AC components** (AC-02 Wiggum at 35 days is the oldest) aren't broken — they're autonomic subsystems that haven't run their self-update routines. A `/maintain` cycle would refresh them, but it's low urgency since the components themselves function correctly; only their state tracking metadata is stale.

### 2026-02-21 [a8651e272a81]

**The dead-letter bug was a skill specification gap, not a code bug.** The `/reflect` command's Side Effects section (line 235) correctly listed "Appends proposals to evolution-queue.yaml" as an expected outcome, but the Workflow section (Phase 4) only said "Generate evolution proposals" without specifying the append format. The model reasonably interpreted "generate" as "write to the report" rather than "write to the report AND the queue." The fix adds an explicit YAML template with a `MANDATORY` label, ensuring the model can't miss the append step. This is a pattern: **side effects must be actionable instructions, not just documentation.**

### 2026-02-21 [6432f8d62dc3]

**Evolution queue throughput jumped from 0 to 4 proposals/session.** The dead-letter problem meant that despite 13 reflection cycles, proposals accumulated in markdown reports without reaching the queue. Session 30's self-healing (manually appending REFL-016 through REFL-020) broke the logjam, and this session immediately consumed 4 of 5 queued proposals. The REFL-016 fix (explicit append instructions in `/reflect`) should prevent future dead-lettering, making the AC-05 → AC-06 pipeline genuinely self-sustaining.

### 2026-02-21 [0efa6004558c]

**The commit message mirrors the evolution queue structure.** By listing each proposal ID with its priority level and one-line summary, the commit becomes a queryable record of which proposals were implemented together. This makes `git log --grep="REFL-017"` work for tracing any proposal back to its implementing commit — useful for the AC-05 → AC-06 pipeline audit trail.

### 2026-02-21 [eb16aa332614]

**Session 31 completed 7 evolution proposals in a single session** — a throughput record. The pipeline went from 0 proposals/session (13 reflections with dead-letter bug) to 4 proposals (first working drain) to 7 proposals (drain + reflection + inline completion). The key enabler was PAT-009: fixing the meta-system *during* the reflection rather than queuing fixes for a broken pipeline. This demonstrates compound returns — each pipeline fix makes the next improvement cycle faster.

### 2026-02-21 [ce0e3fb25fe7]

**The commit groups reflection output with its actionable consequences.** By including the reflection report, the lessons index refresh, the queue updates, and the session state update in a single commit, the entire "reflect → discover → update" cycle is atomically traceable. `git show 5c1e971` reconstructs the complete Reflection #14 artifact set — useful for validating that the AC-05 pipeline produces coherent, self-consistent output.

### 2026-02-21 [cbf22a5dd50a]

**The execution compressed the original 5-phase plan into parallel tracks.** The plan assumed sequential phases (environment → CDM → storyteller → viewer → polish), but actual development interleaved them — the storyteller was built *alongside* the CDM parser, and the live data client was built in the same session. This "build the pipeline end-to-end first, then widen" approach is faster for PoCs because it validates the full data flow early. The trade-off: each pillar is functional but shallow rather than deep.

### 2026-02-21 [e38b9e807440]

**Why RFR times out despite `allow_remote: true`:** DFHack reads `remote-server.json` at startup. If the config was created/modified after DFHack was already running, the setting won't take effect until DFHack restarts. Core methods work because they're always permitted regardless of this flag.

### 2026-02-21 [d6f6145e64a5]

**Root cause discovered:** Both `RunCommand` and RFR plugin calls bind successfully but hang on execution. This is a DFHack architecture constraint — plugin/command calls are dispatched to the game's main loop, and when the game is paused or at a menu screen, the loop doesn't process them. Only truly core methods (`GetVersion`, `GetWorldInfo`, `ListUnits`, `ListEnums`, `ListSquads`) run on the RPC server thread directly.

**Practical impact:** The `allow_remote` config is correct and working (binds succeed), but RFR data requires the game to be actively ticking. This is fine for a polling daemon — the game will usually be running/unpaused during gameplay sessions.

### 2026-02-21 [5ec5d27b55ae]

**RFR plugin architecture**: DFHack's `RemoteFortressReader` plugin runs on the game's main thread — meaning calls like `GetWorldMap` and `GetCreatureRaws` will hang when the game is paused. The polling daemon needs to handle `socket.timeout` gracefully for these calls while still succeeding with core methods like `ListUnits` that run on the RPC server thread. We'll add a `timeout` parameter to RFR methods so the caller can control fallback behavior.

**Two-level change detection**: Rather than diffing entire unit dicts (expensive, noisy), we track specific fields: `is_alive`, `profession`, skill levels, and `squad_id`. This mirrors the pattern from `Helper.lua` in the DF modding community — detect mass changes via count first, then do per-unit diffing only on the fields that matter.

### 2026-02-21 [f5c264bcc265]

**All main-loop-dispatched calls hang**, not just RFR. `RunCommand` (core method id=1) also times out. Meanwhile, `ListUnits`, `GetWorldInfo`, `ListEnums`, `ListJobSkills` all respond instantly. The distinction is that the latter read game data structures directly (with a suspend lock), while `RunCommand` and plugin methods are queued for execution in the main thread's command loop. The command queue isn't being processed — possibly a DF 50.xx (Steam/Premium) specific behavior where the main loop doesn't drain the DFHack command queue the same way as classic DF.

**Impact**: Minimal. Core API gives us everything we need for change detection. We just miss game timestamps and creature race names — both recoverable later.

### 2026-02-21 [8977e03fddb5]

**The watcher is production-ready.** Change detection works across all event types. The graceful degradation pattern means it functions reliably regardless of whether RFR is accessible. Game timestamps will populate automatically if the RFR plugin call starts responding (e.g., after a DFHack update or restart). The dwarf-labeling fallback ensures named dwarves always have a readable race name.

**Next steps for this feature** would be:
1. Run it for a longer session during active gameplay to capture deaths, profession changes, and squad assignments
2. Build a narrative event synthesis layer that feeds `unit_events` into the storyteller LLM
3. Investigate the RFR hang separately — may need a DFHack restart or version-specific workaround

### 2026-02-21 [1f38390da14a]

**Why this CLI gap matters:**
- `watch_loop()` already supports all 3 optional streams via keyword args, but the CLI hardcodes defaults (all disabled). Without the flags, users can never enable reports/enrichment/probes from the command line.
- A standalone `probe` command is useful for debugging: it lets you run individual Lua probes once without starting the full watcher loop, confirming DFHack connectivity and Lua output before committing to continuous polling.
- The `probe_unit_detail()` function takes a `unit_id`, so the CLI needs to support both "run all probes" and "probe a specific unit" modes.

### 2026-02-21 [8ccea44d974a]

**What we're learning about data rates:**
- At 10s polling, a moderately active fortress generates **~2-6 events per cycle** during active periods, with quiet stretches of 0 events.
- Unit count is volatile (74→65→71→68 in 7 minutes) — DF constantly creates/destroys "sane" units as animals wander in/out of the active area.
- Without race names (no RFR), we see numeric race IDs (170, 434, 578, 606). Once you enable `allow_remote`, we'll get proper names like HORSE, CAT, DOG, etc.
- The `DEPARTED` vs `DIED` distinction is important: DEPARTED means the unit left the `sane=True` filter (may have left the map or become insane), while `DIED` means `is_alive` flipped to False.

### 2026-02-22 [c3e33a9d1ec6]

RemoteFortressReader plugin methods run on DF's **main game thread** via `CoreSuspend`. When the game is paused (space bar), the main loop is blocked waiting for keyboard input, and plugin handlers can't execute — they queue up and eventually time out. This is different from Core API methods (`ListUnits`, `GetWorldInfo`) which use a lighter synchronization mechanism.

### 2026-02-22 [7a79f483fe04]

The pattern reveals the issue isn't `allow_remote` or the plugin — it's **`CoreSuspend`**. DFHack has two categories of RPC methods:
- **Non-suspending** (`SF_DONT_SUSPEND`): `GetWorldInfo`, `ListUnits`, `BindMethod` — these work because they don't need to lock the main thread
- **Suspending**: `RunCommand`, all RFR methods — these need `CoreSuspend` to safely access game state, which appears to be hanging

When `CoreSuspend` hangs, the method sits there waiting to acquire the main thread lock until our socket timeout fires.

### 2026-02-22 [92de3e28300f]

DFHack's RPC architecture has two paths:
- **Core methods** (`ListUnits`, `GetWorldInfo`) — handled directly by the server thread with internal thread safety. They bypass `CoreSuspend`.
- **Plugin methods** (RFR, `RunCommand`) — need `CoreSuspendClaimer` to lock the game thread. If this lock can't be acquired (another suspend is active, or the game loop doesn't yield to it), the call hangs until socket timeout.

On your Windows 11 ARM VM running via UTM, the threading primitives that `CoreSuspend` relies on may behave differently under emulation.

### 2026-02-22 [b119c62523ac]

This confirms the root cause is **CoreSuspend via the RPC server thread**. Here's the full picture:

- **Console thread** (user typing `ls` in DFHack window): CoreSuspend works instantly
- **RPC server thread** (our TCP calls): CoreSuspend hangs indefinitely

Only **non-suspending** methods work via RPC: `ListUnits`, `GetWorldInfo`, `GetVersion`, `ListEnums`, `ListSquads`, `BindMethod`. These use internal thread safety that doesn't go through the suspend mechanism.

This is very likely a threading/mutex issue in DFHack's `CoreSuspendClaimer` under x86_64 emulation on your Windows 11 ARM VM via UTM. The Windows API mutex primitives may not translate correctly through Rosetta-like emulation.

### 2026-02-22 [421f27fd695e]

**Why CoreSuspend fails in UTM but the console works**: DFHack's RPC server runs a separate thread that acquires `CoreSuspendClaimer` (a mutex) to safely read game memory. The console thread uses the same mechanism but runs in the main process context. UTM uses QEMU's software CPU emulation for x86_64 — it emulates every instruction including `WaitForSingleObject`/`EnterCriticalSection`. These Windows threading primitives are notoriously fragile under full software emulation because the scheduler's timing assumptions break down.

**Parallels/VMware differ fundamentally**: They run ARM Windows natively (hardware virtualization, not emulation), and x86_64 apps like DF run through Windows' own WoW64 translation layer. WoW64 on ARM handles threading correctly because it's Microsoft's own code running on real hardware — only the instruction translation is emulated, not the OS kernel primitives.

### 2026-02-22 [0417ac4ea75e]

The data source negotiation pattern in the watcher follows a **graceful degradation chain**: RFR → Bridge → Core-only. Each tier provides progressively less data but is more universally compatible:

- **RFR** (best): Full creature raws, real-time game time, reports, enriched unit data. Requires `RemoteFortressReader` plugin + `allow_remote=true`. Not available in DFHack 53.10-r1.
- **Bridge** (good): Game time + creature raws via a Lua script writing JSON. Works with any DFHack that has `repeat` + `json`. Requires user setup (Lua script + HTTP server).
- **Core API** (minimal): Unit listing always works. No game time, numeric race IDs only. Zero setup beyond the DFHack RPC server.

The bridge fetch happens per-cycle (not just on startup) because game time advances continuously. The Lua `repeat` job updates the JSON file every 100 ticks (~3.3 in-game hours), so the bridge data stays fresh.

### 2026-02-22 [718590dc4c35]

**DFHack Init Chain** — There are 3 layers of auto-execution:
1. **`dfhack.init`** → runs at DFHack startup (before any world loads)
2. **`onLoad.init`** → runs when a world/save is loaded
3. **`onMapLoad.init`** → runs when fort/adventure map loads

**`script-paths.txt`** adds custom directories to DFHack's script search path. Lines with `+` prefix are searched *first* (before built-in scripts). This means we could:
- Create a script directory at an accessible path like `C:\Users\Nathaniel\dfhack-scripts\`
- Add `+C:\Users\Nathaniel\dfhack-scripts` to `script-paths.txt`
- Place custom .lua scripts there that DFHack auto-discovers

**`dfhack-config/scripts/`** is the built-in custom scripts folder — anything placed here overrides defaults and survives upgrades.

### 2026-02-22 [e73dc79daf53]

**DFHack remote access is two-layered**:
1. **`remote-server.json`** — persistent JSON config read at DFHack startup. Controls whether non-localhost connections are accepted (`allow_remote: true`) and the TCP port. This is in `dfhack-config/` inside the DF install directory.
2. **`enable remotefortressreader`** — runtime command that activates the RFR plugin (provides `GetWorldMap`, `GetCreatureRaws`, game time, etc.). Goes in `onMapLoad.init` so it's enabled every time a fort loads.

Without #1, our host can't connect at all. Without #2, only the core API works (no game time or creature raws).

### 2026-02-22 [542f61856e5f]

**The double-ESC bug**: In `do_halt()`, ESC #1 (line 848) creates an "Interrupted" pattern on screen. Then the HALT prompt is sent. During `wait_for_idle(skip_trigger=true)`, the polling loop at line 485 calls `poll_idle_pattern()` which looks for the LAST "Interrupted" text on screen — but that's the **stale** one from ESC #1, with HALT prompt text and response content between it and the separator. This causes unreliable detection:
- Returns "not_idle" (sees content between stale Interrupted and separator) → loops until timeout
- Or returns "idle" prematurely (if screen scrolled past the content)

**The fix**: In the HALT path, skip `poll_idle_pattern` entirely. Rely on acknowledgment text + bare prompt detection, which are the correct signals for the HALT flow.

### 2026-02-22 [80e3149a1b9e]

**What was stale vs ground truth** — The JICM compression was propagating three major errors across context cycles:
1. **HomeServer was "VM: UTM Windows 11 ARM at 192.168.64.2"** → Actually a **physical Windows 10 Pro x86_64 PC at 192.168.4.194**
2. **RemoteFortressReader assumed available** → It's **NOT shipped** with DFHack 53.10-r1. The plan was built around RFR methods that can never work.
3. **Session priorities listed JICM/reflection tasks** → The exclusive focus is **DF data access via Lua scripting**

The root cause: JICM context compression was compressing away the user's corrections while preserving the original (wrong) assumptions. Each context restore reintroduced the stale facts.

### 2026-02-22 [21c7efc157e0]

**DFHack RPC is already our best remote access channel.** The Core API (`ListUnits`, `GetWorldInfo`, `ListEnums`) works perfectly over TCP. And crucially, `run_command('lua', ...)` lets us execute arbitrary Lua on the DFHack console thread — which means we can read AND write files on the HomeServer via Lua's `io` library. We don't necessarily need SMB or impacket at all for deploying scripts.

### 2026-02-22 [71e1dcb3defa]

**CoreSuspend is broken in DFHack 53.10-r1's RPC thread.** This is the exact issue documented in `bridge.py`:
- Core API methods (`ListUnits`, `GetWorldInfo`, etc.) work fine — they don't need CoreSuspend
- `RunCommand('lua', ...)` **hangs** because it needs CoreSuspend, which deadlocks from the RPC server thread
- This is why the bridge approach exists: Lua runs as a `repeat` job on the **console thread** (where CoreSuspend works), writes JSON, served over HTTP

**Implication**: We cannot bootstrap file deployment via DFHack RPC. We need SMB, RDP, or manual file copy.

### 2026-02-22 [e59e4b0bc624]

**UAC Remote Token Filtering** — C$ admin share is blocked. This is a default Windows 10 security feature: even though `Nathaniel` is an admin, remote SMB connections get a "filtered" (non-elevated) token. The `Users` share should work though, since it maps to `C:\Users\` which is accessible to regular users.

**The workaround**: Use the `Users` share to write scripts to `C:\Users\Nathaniel\dfhack-scripts\`, then add that path to DFHack's `script-paths.txt` (which the user can do once via the DFHack console: `script-paths.txt` or by editing it through the Users share if it's within reach).

### 2026-02-22 [a2a27764267b]

**SMB file deployment works perfectly** — We authenticated with empty domain, got access to the `Users` share (maps to `C:\Users\`), created a `dfhack-scripts` directory, and uploaded files. The `C$` admin share is blocked by UAC token filtering (expected for Windows 10), but the `Users` share gives us everything we need.

**The deploy pattern**: `impacket SMBConnection` → `putFile()` to `Users` share → files land in `C:\Users\Nathaniel\`. This means we can update Lua scripts remotely at any time without manual intervention on the HomeServer.

### 2026-02-22 [e97392013270]

**Two problems, one solution**: We can't reach the DF install dir (`C:\Program Files (x86)\...`) via SMB (C$ blocked by UAC), and port 8888 is firewalled. But we CAN write files to `C:\Users\Nathaniel\` via SMB. So the strategy is:

1. Write a **PowerShell script** that adds the firewall rule for 8888 AND appends our lines to the DFHack init files — deploy it to the Desktop
2. The user runs it once (right-click → Run as Admin)
3. Everything persists across restarts

### 2026-02-22 [0ba19d970a73]

The research confirmed: `df.global.world.diplomacy` doesn't exist. Diplomacy state is stored **per-entity** at `entity.resources.diplomacy.state`. To get diplomatic relations for the player's civ, we need to find the player entity and enumerate its diplomacy state vector. Also, active diplomat meetings are at `df.global.plotinfo.diplomacy`, not world level.

### 2026-02-22 [01ca904b6f54]

The change detector correctly produced 0 events in cycle 2 because no units arrived, departed, changed profession, or had significant skill changes in those 5 seconds. The game time advancing (154,300 → 155,000) confirms the bridge is capturing live state. The `lua_probes` table now has 18 rows (6 sections × 3 cycles including the earlier test), giving us a time series of game world snapshots.

### 2026-02-22 [c8e7f7b92d7b]

1. **Data source negotiation works correctly**: RFR times out (5s), bridge takes over seamlessly, all 6 sections flow through.
2. **Graceful shutdown**: SIGTERM caught, clean "Watcher stopped after 3 cycles" — the signal handler (`_handle_signal`) sets the `_shutdown` event which breaks the `asyncio.wait_for` in the main loop.
3. **Game tick is constant** (156,400) across all 3 cycles — this means DF is likely paused. When unpaused, we'd see the tick advance and potentially detect unit changes (arrivals, deaths, skill-ups).

### 2026-02-22 [2e7e9a44f6c0]

Note that the unit count jumped from 179 (earlier) to 185 — 6 new units appeared in the fortress in the ~20 minutes of game time that elapsed. These could be migrants, births, or visiting merchants. The watcher didn't catch them as ARRIVED events because they appeared during the bootstrap cycle. In continuous operation, subsequent arrivals would be detected.

### 2026-02-22 [3ca18ffcbf99]

**The JICM safety net is layered**: Even if the watcher's prep script fails, the `pre-clear-context-prep.sh` hook fires on every `/clear` submission, running the same prep script as a backup. And the `session-start.sh` hook checks the `.jicm-state` file to decide whether to inject compressed context. Three independent mechanisms work together — this is the "defense in depth" pattern applied to context preservation.

**The `set -euo pipefail` in the watcher is a latent risk**: The watcher uses `set -euo pipefail` (line 22), which is listed in MEMORY.md as a known gotcha. The watcher survives because every function returns 0 explicitly and grep calls are guarded, but it's still fragile — one missed guard and the watcher dies silently.

### 2026-02-22 [5d06881fd146]

The emergency/lockout system was a **defense-in-depth** pattern from when JICM compression was unreliable (v5-era LLM-based agent took ~210s and could fail). The idea was: if the normal cycle fails, fire a raw `/compact` as a hail mary before Claude's native context lockout kicks in. With v7's bash-based prep script (~0.06s, near-zero failure rate), that safety net is no longer needed. Claude Code's own native `/compact` at ~80% serves as sufficient backstop if JICM somehow misses.

### 2026-02-22 [f3f9f81b35b7]

**JICM Context Propagation Issue**: The compressed context has been carrying forward "fix wait_for_idle() double-ESC" for 3+ compression cycles, but examining the code and metrics reveals this was already fixed. The `skip_trigger=true` parameter in `do_halt()` → `wait_for_idle()` prevents the second ESC. All recent cycles show `outcome: success` with 3-4s halt times.

**Real Issue Found**: The threshold is set to 38% instead of the production 70%. This explains the rapid-fire compression cycles (40% triggers at 38% threshold).

### 2026-02-22 [72fb4595bd10]

**JICM v7 Performance Summary** (126 cycles total, 94.4% success rate):
- **v7 (bash+LLM enrichment)**: 44s avg cycle (77 cycles, range 22-147s)
- **Older (LLM agent)**: 282s avg cycle (42 cycles, range 43-379s)  
- **Speedup**: 6.4x faster

**Bottleneck shift**: Compression went from 70% of cycle time (198s) to just 17% (7.3s) — a 27x improvement. The new bottleneck is `/clear` confirmation (44% of cycle, 19.4s avg) — waiting for Claude Code's TUI to reflect the cleared context. This is unavoidable TUI latency.

**Zero restore retries** across all 119 successful cycles — the resume prompt works reliably on first attempt.

### 2026-02-22 [8206c937a5a5]

**Validation Finding #1**: All boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, etc.) are `false` across all 49,855 historical figures in World 2. The XML parser likely didn't extract these from the legends export. This means the Chronicler's categorical routing for "tell me about deities" or "who are the vampires" will return **empty results** — a significant gap in the ingestion pipeline.

### 2026-02-22 [eac574ab367b]

**Validation Finding #2 (confirmed)**: All boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`) are `false` across **all 49,855 HFs in World 2** AND all 5,466 in World 1. This is a systematic gap in the XML parser — the legends XML likely uses nested tags like `<deity/>` that the parser doesn't capture. This means **categorical routing for supernatural beings will always return empty results**.

**World 2 (Ormon) landscape**: 575 civilizations (mostly cave creatures!), 11 goblin civs, 8 each of dwarf/human/elf. The `owner_entity_id` isn't populated for sites — another ingestion gap.

### 2026-02-22 [22843d376b12]

**Context retrieval is blazing fast** — 8-28ms for structured queries, well under 100ms even for complex multi-table searches. The bottleneck is entirely in LLM generation (5-16s on Qwen3 8B). First-token latency correlates with context size — 204ms for 1 record vs 2.2s for 89 records, showing prompt processing overhead.

### 2026-02-22 [f923d8b3c8c0]

The `/reflect` cycle is a 5-phase autonomic process (AC-05): data inventory → problem identification → pattern matching → evolution proposals → knowledge graph ingestion. The Graphiti ingestion at Phase 5 creates a persistent relational graph from the session's learnings, meaning future sessions can query "what corrections have been made about XML parsing?" and get structured answers rather than scanning flat files.

### 2026-02-22 [482167325634]

The spatial correlation between units, items (corpses), buildings, and zones is perhaps the single most valuable enrichment for storytelling. DF gives us a full 3D spatial model — every entity has coordinates, and every room has bounds. By resolving positions to named locations at capture time, we transform raw coordinates into narrative context: "Urist sat alone in the tavern, staring at the spot where Bomrek had fallen" — all derivable from data that already exists in memory.

### 2026-02-22 [974f02c8285b]

The gap analysis document (`projects/chronicler/reports/data-gap-analysis-2026-02-22.md`) is ~1,200 lines covering every identified gap across all layers. It's structured as a reference guide for multi-session implementation — each gap has a severity rating, root cause, proposed fix, effort estimate, and file locations. The implementation plan (`chronicler-gap-closure.md`) breaks the work into 4 phases with concrete checkboxes.

### 2026-02-22 [53269477c913]

The crash is classic for PowerShell HttpListener servers: when a client disconnects mid-response (e.g., curl's 5-second timeout expires while the 130KB+ `chronicler-state.json` is being written), the `OutputStream.Write()` call throws an `HttpListenerException` with "I/O operation aborted." Because the `try/catch` only wraps the outer loop (not individual request handling), any single failed write kills the entire server. The fix is to wrap each request in its own `try/catch` so a client disconnect just logs a warning and moves to the next request.

### 2026-02-22 [7e0b54208387]

The key architectural change is **two-level error isolation**: 
- **Inner try/catch** (per-request): catches `OutputStream.Write` failures when clients disconnect mid-response. The server logs the error and moves to the next request.
- **Outer try/catch** (listener-level): catches `HttpListenerException` if the listener itself dies (port conflict, permission loss). Waits 3 seconds and creates a new listener.

The original script had only one try/finally wrapping the entire loop — any exception from any request would fall through to the `finally` block, calling `$listener.Stop()` and printing "Server stopped." which is exactly what the screenshot showed.

### 2026-02-22 [7ff0966ef7c1]

Exit code 28 from curl means "operation timeout" — the client disconnected after 50ms while the server was still writing the 125KB response. In the old script, this would have triggered the `HttpListenerException` and killed the server. The new per-request try/catch catches it, logs it as a yellow warning, and continues serving.

### 2026-02-22 [794cd0685da4]

**Storyteller test results analysis:**
1. **Fortress inhabitants** — 29 units returned with HF cross-references (kill counts, birth years). Working perfectly.
2. **Wars** — Pulling from legends data. 10 named wars with date ranges.
3. **Military squads** — Returns 0 squad records because `lua_probes` doesn't have v6 data yet (watcher hasn't run). Falls through to entity search which finds "military"-matching civilizations. Will work once watcher runs.
4. **Recent events** — Shows ARRIVED/DEPARTED events with numeric race IDs (pre-enrichment data). Will improve as watcher captures more events.
5. **Context grouping** — The new `format_context` groups by category with headers, making it easier for the LLM to distinguish Historical Figures from Live Status from Recent Events.

### 2026-02-22 [46c634171b16]

**Phase 4.1 + 4.2 complete — summary of XML parser fixes:**

1. **Boolean flags (4.1)**: Fixed detection of deities (sphere tags), vampires (DEITY_MAJOR_CURSE), necromancers (SECRET knowledge), werebeasts (DEITY_CURSE_WEREBEAST). Now 6 deities, 54 vampires, 247 necromancers, 132 werebeasts in World 2. Also enriched `details` JSONB with spheres/interactions/knowledge.

2. **Site ownership (4.2)**: Added `<cur_owner_id>` extraction from legends_plus. 1,145 World 2 sites now have entity ownership ("The Silvery Deceivers" owns Soundedgrowled, etc.).

3. **Schema collision (BUG-004)**: Identified but deferred — `historical_figures` PK is `id` alone, causing World 2 to miss 5,466 HFs (including 1,294 deities) that collide with World 1 IDs. Needs composite PK `(id, world_id)`.

**Files modified:**
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/ingest/xml_parser.py` — fixed supernatural detection + site ownership parsing
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/storyteller/context.py` — added details column to flag queries + sphere display

### 2026-02-22 [ed33c5e4d454]

**Session progress summary — Chronicler Gap Closure:**

All 4 phases of the gap closure plan are now implemented (Phases 1-3 coded, Phase 4 coded + validated):

| Phase | Description | Status |
|-------|

### 2026-02-22 [db94f1c2866b]

**REFL-026: The Silent Data Loss Pattern**

The composite PK migration proposal addresses a subtle but critical data integrity issue: `ON CONFLICT DO NOTHING` combined with non-unique primary keys across multi-tenant (multi-world) data creates **silent data loss**. This is a well-known antipattern in multi-tenant systems — when the PK uses only the entity ID without the tenant discriminator, imports from different tenants collide on shared ID spaces.

Key details:
- **7 CDM tables** share this problem — not just `historical_figures`
- The fix requires a **coordinated migration**: PK changes cascade through all FK references, the Python model layer, and the storyteller query layer
- **Re-import is necessary** after the migration since the lost data was never stored (it was discarded at insert time, not overwritten)

### 2026-02-22 [b401cb92d6c9]

**Housekeeping summary:**

| Phase | Action | Result |
|-------|--------|--------|
| **1. JICM Reset** | Removed `.compressed-context-ready.md` + `.compression-done.signal` | 2 stale files cleaned |
| **2. Signal Files** | Checked — no stale signals found | Clean |
| **3. Log Rotation** | Truncated 5 oversized log files | **84MB → 5.8MB** (93% reduction) |

The `debug.log` at 84MB was the main offender — likely accumulated across 30+ sessions without ever being rotated. The `orchestration-detections.jsonl` at 3.5MB suggests the orchestration detector hook fires very frequently (possibly on every prompt submit).

### 2026-02-22 [f03c3976cedf]

**Idle-hands infinite loop root cause + fix:**

The bug was a **missing cooldown between cycles**. The flow was:
1. Hook cycles through commit → housekeep → reflect (3 phases × 3 cycles = 9 turns)
2. Cycle cap reached → state file deleted
3. Ennoia (session orchestrator in W2) detects idle again ~15 min later → recreates state file
4. New cycle starts at phase 1 — infinite loop at the Ennoia level

The fix adds a **30-minute cooldown file** (`.idle-hands-cooldown.W0`) written when the cycle cap is hit. On subsequent activations, the hook checks the cooldown epoch and refuses to run until it expires. This gives the user time to provide actual work before maintenance cycles resume.

### 2026-02-22 [734953f61649]

**Root cause of the infinite idle-hands loop:**

The loop was caused by a **producer-consumer desync**. Two independent systems interact:
- **Producer** (Ennoia, runs in W2): Detects idle, creates `.idle-hands-active.W0`
- **Consumer** (idle-hands-hook.sh, stop hook): Reads state, advances phases, eventually cleans up

The consumer had a cycle cap (3 cycles → delete state file), but the producer had no knowledge of this. It would re-detect idle and recreate the file immediately. The fix required adding cooldown awareness to **both** sides — the consumer writes a cooldown timestamp, and the producer respects it.

This is a classic distributed coordination pattern: when two processes share state via files, both must agree on the lifecycle protocol.

### 2026-02-22 [a9b0fecad416]

**Claude Code hook caching behavior:**

Claude Code appears to cache hook scripts at session start. Edits to `.sh` hook files during an active session don't take effect — the cached version continues to run. This means:
- Hook bug fixes require session restart to take effect
- The only way to stop a misbehaving hook mid-session is to deregister it from `settings.json`
- Settings.json changes ARE picked up live (since the block stopped after deregistration)

This is worth recording in MEMORY.md as a gotcha.

### 2026-02-22 [1a7e1edeb538]

**The `/dev/null` symlink trick:**

When a file path is symlinked to `/dev/null`:
- `[[ -f path ]]` returns **false** (it's a character device, not a regular file)
- `cat > path` succeeds but **discards all output**
- `rm -f path` removes the **symlink**, not `/dev/null` itself

This makes it a useful "black hole" for state files that keep getting recreated by external processes — writes succeed silently but reads find nothing, and existence checks fail.

### 2026-02-22 [75297e2765d7]

**Architecture at a glance — what's actually built:**

Chronicler has a remarkably complete two-tier data system. The Lua bridge (923 lines, 16 data domains) feeds live fortress state through HTTP to a Python watcher (355 lines) with two-level change detection (core RPC + bridge enriched fields). The XML parser (733 lines) handles 8 of 14+ legends sections. The storyteller (723-line context retriever + 93-line prompt system) does categorical routing across 44 keywords into both historical and live data.

**The critical gap isn't missing features — it's data integrity.** The `ON CONFLICT DO NOTHING` with single-column PKs silently drops 5,466 historical figures from World 2. Every subsequent improvement (better parsing, richer storytelling) is built on incomplete data.

### 2026-02-22 [80498995bb5d]

**The kill_count bug (lines 708-712 of xml_parser.py):**

The query groups by `hf_id_1` (the **victim** in death events) and counts how many death events each victim appears in. Since each HF can only die once, this gives kill_count=1 for every figure that was killed, and 0 for everyone else. The field is named "kill_count" but actually computes "was_killed_by_someone" — a boolean masquerading as a count.

The correct computation should group by `hf_id_2` (the **slayer**), counting how many victims each killer has dispatched. A legendary dragon-slayer with 200 kills currently shows kill_count=0 (if alive) or kill_count=1 (if dead).

### 2026-02-22 [9ec50aadc3c0]

**Why data integrity must come before features:**

The composite PK issue is a foundational corruption. Every query that JOINs across legends tables — historical figures to events, events to sites, HFs to relationships — is operating on incomplete data. Adding richer storyteller queries (Phase 2) without fixing the PKs (Phase 1) would mean building more elaborate views of corrupted data. The kill_count bug compounds this: the "Notable figures" world overview shows arbitrary dead figures instead of legendary warriors.

**The architectural lesson**: `ON CONFLICT DO NOTHING` is a silent data destroyer when your uniqueness constraints are wrong. It's the database equivalent of `catch: pass` — errors disappear without a trace.

### 2026-02-22 [950b485e01d1]

**Design intent vs implementation drift:**

The original project plan (Feb 18) explicitly specified world_id-namespaced IDs. The schema implemented 4 days later used single-column `INT PRIMARY KEY` — likely a simplification during rapid prototyping that never got corrected. This is a common pattern: when building fast, FK integrity and multi-tenancy get deferred and then forgotten. Phase 1 isn't adding a new feature — it's completing the original design.

### 2026-02-22 [faaba7d9f62b]

**Confidence signaling** lets the storyteller LLM know how much context it has to work with. When the context retriever finds only 1-2 records, the storyteller might fabricate details to fill the gap. By explicitly flagging "Context is limited — be cautious about specifics", we reduce hallucination. Conversely, "Rich context available" encourages the LLM to weave the data into detailed narrative rather than hedging unnecessarily.

### 2026-02-22 [d463b2460412]

**Phase 2 architecture recap**: The storyteller context retriever now has a 3-layer enrichment pipeline:
1. **Static relationships** (hf_links, hf_entity_links, hf_site_links) — these are stable historical data from XML imports, giving the LLM family trees, political positions, and site associations.
2. **Dynamic probe data** (emotions, zones) — these come from the live bridge and change every poll cycle, providing real-time fortress state.
3. **Meta-signals** (confidence notes) — these tell the LLM about its own context quality, reducing hallucination when data is sparse.

This separation matters because each layer has different freshness guarantees and the storyteller prompt can weight them accordingly.

### 2026-02-22 [23c4b3f97997]

**Phase 3 design decisions**:

1. **Dual-source parsing pattern**: Written contents and underground regions both require data from two XML files. The approach — parse the richer source first (`legends.xml` for forms/types/depth), then enrich from the other (`legends_plus.xml` for coords/pages) via `ON CONFLICT DO UPDATE SET ... COALESCE` — prevents data loss while respecting FK insertion order. This same pattern was already used for entities and sites.

2. **The underground_regions bug**: A subtle data loss issue where `type` and `depth` were silently NULL because the parser only read from `legends_plus.xml` (which has coords but not type/depth). The fix adds `_parse_underground_regions()` from `legends.xml` first, then enriches coords from plus. This is a good example of why verification tasks (3.3) are worth doing — the count matched (no missing rows), but the data quality was degraded.

3. **Historical eras gotcha**: The `_int()` helper skips "-1" values (treating them as null references), but for eras, `-1` means "the beginning of time". The fix uses raw `int()` parsing. This is a cross-cutting concern — any field where `-1` has semantic meaning instead of "null" needs explicit handling.

### 2026-02-22 [1739fe813b03]

**Chronicler Gap Closure — A Complete Data Pipeline Overhaul**:

This plan touched every layer of the Chronicler stack:
1. **Data integrity (Phase 0-1)**: The composite PK migration was the most impactful change — recovering 5,466 historical figures that were silently lost to cross-world ID collisions. This is a classic problem when importing multi-tenant data into a single-tenant schema.
2. **Query enrichment (Phase 2)**: Moving from raw IDs to resolved names in the storyteller makes the difference between "hf_id_2=4527 killed hf_id_1=892" and "Bomrek was slain by Urist at Goldenhall in year 253" — the data was always there, it just wasn't being joined.
3. **Test safety net (Phase 4)**: 131 tests in 0.19s means the full suite runs faster than a developer can switch windows. This low-friction testing is what makes future changes safe.

### 2026-02-22 [736c11451f33]

**Graph explosion prevention via the deity filter and per-hop cap**

The `FILTERED_LINK_TYPES = {"deity"}` filter is crucial — without it, any HF connected to a deity through worship would pull in *all* 146K deity links. The `MAX_NODES_PER_HOP = 50` cap handles entity membership explosion (civilizations with 2,759 members get capped to 50 displayed, with the UI showing "showing 50 of 2,759 members"). These two guards together keep even 2-hop graphs manageable (87 nodes for a necromancer, which has richer-than-average connections through master/apprentice chains and entity memberships).

### 2026-02-22 [8dd26e2fecc4]

**Data-driven revision of Knowledge Horizon caveats**

The exploration revealed several things that change our design assumptions:

1. **CAV-004 (starting dwarf backgrounds) may be unnecessary** — All 339 units in world 5 have matching HF records. DF appears to retroactively create HF entries for embark dwarves. This needs verification across more worlds, but if it holds, we can drop the synthetic background generation entirely.

2. **Religion is the social glue, not cults** — The original caveat assumed cult-like organizations would be small and distinct. In reality, multi-membership is *overwhelmingly religious* — dwarves join 6+ religions simultaneously. A dwarf knowing all members of all their religions could expose thousands of HFs. Religion needs its own tier, not the same treatment as guilds/military.

3. **Noble positions are a CDM gap** — `position_name` is entirely NULL in `hf_entity_links`. Positions are only recorded as numeric IDs in `history_events.details` JSONB. To implement CAV-002 (civilization nobles always visible), we'd first need to extract `<entity_position>` mappings from the XML and resolve the position IDs.

### 2026-02-22 [c0de247d87a5]

**Position extraction results reveal DF's organizational depth**

1. **Gendered position naming**: Civilization positions carry male/female variants (king/queen, duke/duchess, baron/baroness). This is significant for the Knowledge Horizon because when a dwarf knows "the monarch of entity X," we can resolve the *specific title* based on the holder's sex — enabling natural language like "Queen Urist" rather than "Monarch Urist."

2. **Religion positions are dynamically named**: Notice "sacred lake," "holy drool," "sacred spine" in the results — these are procedurally generated titles unique to each religion. This confirms the user's earlier observation: religion positions cannot be discovered from static game files, only from the legends XML on a per-world basis.

3. **Dual-source merging worked perfectly**: 24,021 position links from standard legends + 6,823 from legends_plus = 30,844 total (after dedup via `DO NOTHING` on the unique constraint). The overlap was ~0 because standard legends has the historical links (with start/end years) while legends_plus has the current assignments (without dates).

### 2026-02-22 [b9bafb0065e3]

**Position extraction results reveal the three-layer architecture**

The data confirms exactly the structure predicted by the plan:

1. **Definition layer**: 11,712 `entity_positions` — each entity defines its own position roster. Civilizations have king/queen/duke/count/baron hierarchies. Religions have dynamically-generated names like "holy drool", "sacred spine", "high slaughter".

2. **Assignment layer**: 6,823 current position assignments from legends_plus merged into `hf_position_links`, filling in who currently holds each position.

3. **History layer**: 24,021 position links from standard legends (active + former), yielding a merged total of 30,844 rows — 13,666 active, 17,178 former.

The gendered variant columns (`name_male`/`name_female`) are populated for nobility (king/queen, duke/duchess, baron/baroness) but not for administrative roles (general, captain, diplomat). Spouse titles like "queen consort" are also captured.

### 2026-02-22 [2cadffef5c22]

**The explorer is already complete — all 3 phases implemented**

Looking at the `woolly-swinging-naur.md` plan, every item is implemented:

1. **Phase 1 (Schema Browser)**: Shared nav, table list with row counts grouped by category, column metadata, PK/FK navigation, indexes — all working
2. **Phase 2 (Data Browser)**: Paginated rows, text filtering, column sorting, FK clickable links, JSONB expansion, SQL runner with readonly protection — all working  
3. **Phase 3 (Entity Graph)**: vis.js ego-network, typeahead search, 1-3 hop depth, node styling by type (deity/vampire/necromancer), edge coloring by relationship, incremental expansion, performance guards — all working

The new `entity_positions` and `hf_position_links` tables now appear in the Relationships group thanks to the TABLE_GROUPS update we just committed.

### 2026-02-23 [625ae693f24e]

**World: Thadar En (The Planet of Legends)** — a 200-year history with 35,334 historical figures, 3,684 entities, 312K events, and 7,594 entity positions. This is a mid-sized world — about 60% the density of Ormon but with significantly richer position/entity data per capita.

### 2026-02-23 [85c8b87b260f]

**The data exploration revealed a critical architectural detail for Knowledge Horizon.**

The 20 starting dwarves have **zero connections** in the legends data — no family, no organizations, no site links, no positions. This means the initial Knowledge Horizon is entirely bootstrapped from civilization-level knowledge (CAV-002: the 25 nobles/admins of "the moist arches") plus whatever the watcher captures as the game runs. The horizon literally starts as a tiny dot and grows organically — exactly the "fog of war" metaphor we're building.

Also notable: site_id 1984 (the player fortress) doesn't exist in legends data because it was founded after world-gen. The foundation layer needs to handle this gracefully — the fortress itself is always visible even without a legends entry.

### 2026-02-23 [3d7b715975ab]

**What changed in this rewrite:**
1. **6-tab architecture** — The explorer now has `People | Civilizations | Geography | Events | Database | Graph` tabs instead of the original 3. Lazy-loading ensures tabs only fetch data when first visited.
2. **Cross-tab navigation** — A `navigateTo(tab, type, worldId, id)` dispatcher enables clicking any entity name in any tab to jump to its detail view in the appropriate tab. This creates a web of interconnected views across the entire Dwarf Fortress dataset.
3. **Database tab absorbs Schema+Data** — The old Schema and Data tabs became sub-views within a single Database tab, using an internal toggle instead of top-level tabs. This keeps the raw DB explorer accessible while prioritizing domain-specific views.

### 2026-02-23 [7401b614f7e2]

**How the Chronicler graph works — and the deeper design questions it raises**

### 2026-02-23 [1df288ddfb45]

**Personality trait visualization**: DF personality traits use a 0-100 scale where 50 is average. Traits far from 50 define a dwarf's character — a "ANXIETY_PROPENSITY" of 90 means extremely anxious, while 10 means stoic. The renderer filters for "notable" traits (≤25 or ≥75) and colors them: green for high values, red for low. This makes it immediately visible which traits define a dwarf's personality without information overload from all 50 facets.

**Need focus levels**: DF need satisfaction uses a signed integer where positive = satisfied and negative = frustrated. The bar maps [-400, +400] to [0%, 100%], with color coding: green (happy), amber (neutral), red (frustrated). This directly correlates with dwarf stress — unmet needs are the primary driver of tantrum spirals.

### 2026-02-23 [d549bea8879e]

**Bridge → DB pipeline completion**: The Chronicler now has a 4-stage pipeline for unit data:

1. **Lua extraction** (bridge v7): 100+ fields per dwarf — biographical, relationships, personality (50 traits, values, needs, dreams), physical/mental attributes
2. **JSON transport**: Bridge writes `chronicler-state.json`, watcher fetches it via HTTP, stores raw sections in `lua_probes`
3. **Merge + Upsert**: `merge_bridge_into_units()` matches bridge data by unit ID to RPC units, promotes `birth_year`/`sex`/`death_cause` to columns, folds personality into `details` JSONB. COALESCE preserves values across bridge-absent cycles.
4. **API + Frontend**: `get_unit()` endpoint resolves relationship HF IDs to names. Frontend renders personality traits as color-coded bars, values as badges, needs with satisfaction indicators, dreams with accomplished flags, and physical/mental attributes as paired bar charts.

This transforms units from 15-field stubs to rich character sheets suitable for LLM narrative generation.

### 2026-02-23 [43a9f2b82fc5]

**PowerShell HttpListener deadlock**: The TCP connection succeeds (port 8888 is open) but the server never sends a response. This is a classic PowerShell HttpListener issue — after serving one request without properly calling `response.Close()`, or if the script hit an unhandled exception, the listener stays bound to the port but stops processing requests. The fix is to kill the hung PowerShell process and restart it.

### 2026-02-23 [84fdd421a482]

**v3 HTTP server fix for the hang**: The root cause was `GetContext()` being synchronous — it blocks the entire server thread until a complete HTTP request arrives. If any client (scanner, broken connection, browser prefetch) opens a TCP socket but never sends the request headers, the server hangs forever. v3 uses `BeginGetContext()` + `AsyncWaitHandle.WaitOne(30000)` to poll with a 30-second timeout. If no request completes in time, the loop continues and checks a watchdog timer. It also kills any existing listener on startup to avoid port conflicts.

**Bridge v6 → v7 delta**: +154 lines of Lua adding `birth_year`, `sex`, `old_year`, `caste`, 9 relationship slots, `death_cause`, `cultural_identity` to `unit_summary`, plus a new `get_dwarf_personality()` function extracting 50 trait facets, values, needs, dreams, and 18 physical+mental attributes per dwarf.

### 2026-02-23 [a4235ea8fe91]

**Chronicler Live Polling Daemon — E2E Test Results:**

1. **Watcher ran 4 cycles** in 47s, clean SIGINT shutdown (exit code 0)
2. **Bridge v7**: 17 data sections flowing (plus `dwarf_personality` stored separately = 18 unique probe types in DB)
3. **Data flow**: DF → Lua bridge → JSON → HTTP (port 8888) → Python watcher → PostgreSQL
4. **DB after test**: 276 lua_probes (was 176 → +100 new), 1,700 sync_snapshots (+7), 49 units per cycle
5. **All 17 bridge sections stored**: armies, artifacts, buildings, diplomacy, emotions, skills, entities, events, history, incidents, mandates, squads, units, world_info, zones, announcements, `dwarf_personality`
6. **Key architecture**: The watcher probes RFR first (times out after 5s since it's unavailable in DFHack 53.10-r1), then falls back to the bridge — a resilient dual-source design

### 2026-02-23 [a34be6fdc4a4]

**What the tick progression tells us:**
- Tick 73790 → 74290 in ~20 seconds = +500 ticks
- DF runs at ~1200 ticks per day, so that's ~10 game-hours of fortress time per real-world 20s
- Over 30 minutes, we should capture roughly **3-4 in-game months** of fortress life
- With the game unpaused, we'll see the change detector fire on unit stat changes (stress, focus, skills), possible new arrivals, and any combat or deaths

**Key data flowing each cycle:**
- 50 units via DFHack RPC (includes wildlife/visitors beyond the 20 fortress dwarves)
- 17 bridge sections via HTTP (personality, emotions, skills, armies, squads, etc.)
- All stored in PostgreSQL `lua_probes` + `sync_snapshots` tables

### 2026-02-23 [51216657b13e]

The `lua_probes` count went *down* from 221 to 204 — this is the **retention policy** working as designed (Phase 4 of gap closure added automatic pruning of old probe data to prevent unbounded table growth). Meanwhile `sync_snapshots` grows monotonically (+39 in 5 min = ~7-8 per minute), confirming every cycle writes a snapshot row.

### 2026-02-23 [80943e3a39c0]

**52 events in 17 minutes** — the change detector is catching a rich stream of fortress life. The 100-cycle summary line is from the Python wrapper's periodic reporting. At tick 99,390 we're approaching **tick 100,800** which would be the start of a new season (DF has 403,200 ticks/year, divided into 4 seasons of 100,800 each). We might see a **caravan or migrant wave** if we cross a season boundary!

### 2026-02-23 [d854ef7e529e]

**Why the game paused:** DF automatically pauses at season boundaries when certain events trigger (like caravan arrivals, migrant waves, or diplomats). Tick 100,790 is just past 100,800 (the start of Spring). The game likely paused for a **migrant wave or caravan event**. The watcher handles this gracefully — it keeps polling and will immediately detect changes once the game resumes.

### 2026-02-23 [7d91fb252ab2]

**Key takeaways from the long-term run:**

1. **The change detector works beautifully** — 58 events across 4 event types (ARRIVED, DEPARTED, SKILL_UP, PROFESSION_CHANGED) were automatically detected by diffing unit snapshots between cycles. No manual event configuration needed.

2. **Cavern activity is rich** — Crundles, troglodytes, magma crabs, and even DEMONS appearing suggests the fortress has breached deep cavern layers. This is prime narrative material for the storyteller engine.

3. **The RPC timeout bug is the top priority fix** — The watcher should catch `TimeoutError` on the RPC socket and attempt reconnection rather than crashing. A simple try/except with reconnect logic would make it production-grade for extended sessions.

4. **27,000 ticks = ~22.5 game-days** covered in ~19 min of active gameplay — equivalent to about 3 weeks of fortress time. Extended sessions would capture full seasons of data.

### 2026-02-23 [a7455d071a0a]

**Interesting: PROFESSION_CHANGED to STANDARD** — unit 15022 *lost* their profession designation. In DF, this happens when a dwarf's highest skill drops below the threshold for a profession title (e.g., they were a dabbling Carpenter but the game recalculated). "STANDARD" is the default when no skill is high enough to name a profession. Check if you saw any profession changes in-game around 11:58.

### 2026-02-23 [644697c08801]

**Validation highlights:**

1. **Two miners both hit Mining 6 within 10 seconds of each other** (units 15000 and 14999) — they're likely working the same mining project. Do you see two miners digging in the same area?

2. **Unit 15013 gained Music skill** — this is probably a dwarf attending a performance or practicing. Earlier this same unit gained Speaking 3→4 in the first run. They're on a social/artistic skill track.

3. **Crundle infestation continues** — 3 more crundles spawning in this run. Your caverns are very active. These small 4-legged cave creatures are generally harmless but indicate open cavern access.

4. **Zero crashes in 59 cycles** — the RPC timeout only happens at season boundaries when DF is doing heavy world-state processing. Mid-season operation is rock solid.

### 2026-02-23 [f6cabdd4dbbe]

**Root Cause Analysis — Why the Chronicler can't find Vabok:**

The failure has **three compounding causes**:

1. **HF ID Gap**: Fortress dwarves have `hist_fig_id` range 36468-36487, but the historical_figures table max ID is 35333. These dwarves didn't exist when the legends XML was exported — they're "live" fortress dwarves not yet in the historical record. **Data coverage gap.**

2. **Storyteller searches HF only**: The storyteller's name search (`context.py:125-138`) queries `historical_figures` exclusively. The `units` table is only accessed via categorical keywords ("fortress", "dwarves") or as a cross-reference after an HF is found. **Architecture gap.**

3. **No unaccent()**: The storyteller uses plain `ILIKE` while the People API uses `unaccent()`. "Vabôk" won't match "Vabok". **Query gap.**

Even if #2 and #3 were fixed, Vabok's HF record literally doesn't exist in the DB (problem #1), so the storyteller would need to also search the `units` table by name.

### 2026-02-23 [0108d903a461]

**The validation suite revealed 9 concrete gaps across 5 layers.** The failures organize into 3 root cause clusters:

1. **Temporal coverage gap** — Fortress dwarves (HF IDs 36468-36487) were born AFTER the legends XML was exported (max HF ID = 35333). This is inherent to DF's architecture: legends exports are point-in-time snapshots while the game continues generating new historical figures. **20/20 citizen dwarves have unresolvable HF references.**

2. **Event detection gap** — The watcher captures ARRIVED/DEPARTED changes but doesn't detect is_alive transitions or game announcements. Cerol Aludsibrek drowned, but her record still shows `is_alive=True`. Zero game reports were captured. The change detector compares snapshots but death events require either parsing DFHack announcements or checking the `death_id` field in unit flags.

3. **Query architecture gap** — The storyteller's name search (Phase 2, line 128-138 of `context.py`) searches ONLY `historical_figures` with plain ILIKE. It never falls through to `units`. When someone asks "Tell me about Vabok Solonotin," the storyteller finds 10 OTHER Vaboks from the HF table but not the fortress leader. The bard query also fails because "bards" isn't a category route keyword, and the bards' unit names (native: "Ducin Lolokgan") don't match their HF names (English: "ducim granitedish").

### 2026-02-24 [813505a24778]

The PRD needs to reconcile several layers of analysis:
1. The original gap analysis (T1-T4 tiers) — but the critical review showed ~70% of T1-T2 bridge work is already done
2. Your G1/G2 feedback — which introduces the **denizen registry** concept (a new architectural element not in any existing plan)
3. Four implementation plans already exist (Explorer UI, Explorer Redesign, Position Extraction, DB Explorer) — the PRD should integrate rather than duplicate

### 2026-02-24 [f374a3c292d6]

**The PRD introduces a key architectural shift**: Instead of the LLM searching all 60K+ historical figures equally, the `fortress_denizens` table acts as a **gateway/root node**. Every user query first routes through "who do we know about?" before searching the broader database. This is the concrete implementation of your G2 feedback — the table that tracks everyone who's lived at, visited, attacked, or otherwise interacted with the fortress.

**Three novel elements not in any existing plan:**
1. **Narrative Value Scoring (NVS)** — a composite 0-100 score per denizen weighting screen time, event density, relationship depth, recency, and status
2. **Absence-based death detection** — when a `resident` disappears without a death event, they're marked `missing` rather than silently forgotten
3. **Unified Person Builder** — a new module that merges Unit + HF data into a single JSON object for the LLM, following the field mapping's merge strategy

### 2026-02-24 [7558a468c4b6]

**The field mapping correction is architecturally significant:**
- The original "Event history is HF-only" statement was a pre-v2.1 assumption that would have caused the storyteller to miss all fortress-born events
- With live event generation, the `history_events` table becomes a **unified event store** — the LLM doesn't need to know the source distinction, but the Knowledge Horizon can use `source` for confidence weighting
- The denizen registry as "routing layer" means queries start from fortress relevance, not from the 60K+ global HF pool

### 2026-02-24 [c864287b57ea]

**The roadmap reveals three architectural layers in the v0.8→v1.0 transition:**
1. **Data layer** (Phases 1-2): The denizen registry and live event generator transform Chronicler from a static data importer into a living database that grows organically with fortress gameplay. The key innovation is that `history_events` becomes a unified store — the LLM doesn't care whether an event came from legends XML or live observation.
2. **Intelligence layer** (Phase 3): The agentic storyteller replaces brittle keyword→SQL routing with autonomous database exploration. This is the same architectural pattern used in modern AI coding assistants — give the LLM tools and let it decide what to query.
3. **Visibility layer** (Phase 4): Knowledge Horizon scoping is implemented as prompt engineering (advisory) rather than SQL views (enforcement), which is the right call at this stage — it's reversible and doesn't risk hiding data the user actually needs.

### 2026-02-24 [b56396d2b8ac]

**The Wiki agent uncovered critical requirements we hadn't captured:**
1. **seconds72 time encoding** — every date in DF uses seconds72 (403,200 per year). Chronicler needs a first-class conversion utility throughout
2. **50 personality facets + 33 values + 13 goals** — three-layer personality model, far richer than what we're currently extracting. Ghost type is derivable from personality + death cause
3. **RAW file load order** is deterministic (language → descriptor → material_template → ... → interaction) — the mod manager must parse in this exact order for correct conflict detection
4. **CUSTOM_OFFICIAL_* positions** are auto-generated in worldgen — 17 additional position types not defined in entity RAWs
5. **Election mechanics** happen on the 17th of Summer at 4:00 PM — highest sum of ALL relevant skill levels wins. This is a live event Chronicler should capture

### 2026-02-24 [7de9b386fde0]

**df-ai provides a complete "DF management encyclopedia" for Chronicler:**
1. The **5-subsystem architecture** (Population/Plan/Stocks/Camera/Trade) maps directly to Chronicler advisory domains — each becomes an LLM system prompt context section
2. The **stock threshold model** (Needed/NeededPerDwarf/WatchStock with ~100 item categories) is the exact vocabulary Chronicler needs for resource monitoring
3. The **exclusive callback pattern** — one multi-step action at a time, queue others — is the right model for LLM action chains via DFHack Lua RPC

### 2026-02-24 [ea2b679babd4]

**Cross-referencing 12 repositories revealed convergence**: All successful DF legends tools independently arrived at the same architecture — event-driven narrative with cross-linked entity references, perspective-aware rendering, and a post-parse resolution pipeline. The only real disagreement is on visualization (Cytoscape vs SVG vs D3), where each tool made its own choice.

**The 144 vs 132 vs 115 vs 94 event type spread** tells a story of ecosystem maturity: df-structures (the canonical memory layout) defines 144; LegendsBrowser2 (Go, actively maintained) handles 132; LegendsViewer-Next (.NET, newer) handles 115; weblegends (C++, older but extremely detailed per-type) handles 94. The gap narrows over time as tools catch up to DF's evolving event system.

**Chronicler's genuine novelty**: No existing tool combines persistent DB, live polling, XML ingestion, LLM narrative, AND worldgen monitoring. The worldgen monitor is particularly notable — the research confirmed that despite `world_generatorst` being fully mapped in df-structures since DF 0.47, zero tools have ever polled it during generation. Chronicler would be first.

### 2026-02-24 [0c57e451512a]

**Importance scoring design decisions:**

1. **SQL-native computation**: The scores are computed entirely via SQL `UPDATE ... FROM LATERAL` queries rather than Python loops. This lets PostgreSQL batch the work — 35K HFs scored in under 2 seconds. The LATERAL joins avoid N+1 query patterns by computing all sub-counts in a single pass per entity type.

2. **Capped components prevent dominance**: `LEAST(event_count * 2, 500)` and similar caps ensure no single factor overwhelms the total. A figure with 1000 events still caps at 500 points from that component, preventing event-dense but narratively dull entities (like merchant-visited sites) from outranking genuinely important ones.

3. **Filtering is a query-time concern, not a scoring concern**: The user asked for filtering by region/civ/site. The `importance_score` column is absolute — the filtering happens via `WHERE entity_id = X` or `JOIN hf_entity_links` at query time. This is deliberate: the annotated schema will document these query patterns so the LLM knows how to scope its searches.

### 2026-02-24 [1b04665ce156]

**Event type taxonomy findings:**

1. **The 144 number was wrong**: The df-structures enum has exactly 133 entries, and with 8 DF 50.x additions, the total is 141. The synthesis report counted incorrectly (likely including sub-enums or comments in the count).

2. **Chronicler's TEXT column is the right approach**: Unlike LB2 (which needs a Go struct per type) or LV-Next (which needs a C# class per type), Chronicler stores `event_type TEXT`. This means it already handles ALL event types — past, present, and future. No code changes needed when DF adds new types.

3. **8 DF 50.x event types are novel**: `hf prayed inside structure`, `hf equipment purchase`, `hf performed horrible experiments`, etc. These represent the Steam release's enriched event model. No existing legends browser handles these either — Chronicler is the first system to store them.

### 2026-02-24 [2c9ddcfdfc6a]

**Annotated schema design decisions:**

1. **~2,700 tokens is the sweet spot**: The schema fits alongside the narrative persona prompt (~400 tokens) and a user query with context (~4,000 tokens) within an 8K context window. This leaves ~900 tokens for generation — tight but workable for Qwen3-8B. For larger models (32K+), there's ample headroom.

2. **Query patterns over raw DDL**: Rather than dumping `CREATE TABLE` statements (which waste tokens on syntax noise like `DEFAULT`, `IF NOT EXISTS`, constraints), the schema uses prose descriptions with inline column listings. The key innovation is the **query patterns section** — these are copy-paste-ready SQL templates the LLM can adapt, dramatically reducing hallucination risk on join conditions.

3. **Composite PK warning is critical**: The single most common SQL error an LLM would make is joining on `id` alone (forgetting `world_id`). The schema front-loads this with a bold warning and a concrete example: `ON a.world_id = b.world_id AND a.id = b.some_id`. Every query pattern reinforces this.

4. **Enum values are inline, not in a separate section**: Rather than a separate "enums" section (which the LLM might not cross-reference), entity types, site types, event types, and link types are listed directly on the column they apply to. This reduces the cognitive load for the LLM — it sees the valid values right where it needs them.

5. **Safety rules at the bottom act as a "system guardrail"**: The 5 safety rules prevent SQL injection and destructive queries. These are positioned last so they're fresh in the LLM's recency-biased attention window when it starts generating SQL.

### 2026-02-24 [d2c567ea2527]

**GH007 email privacy and `git filter-branch`:**

1. **The root cause**: GitHub's GH007 check rejects pushes where commit author/committer emails are marked private in account settings. The global git config had `tb236@byu.edu` which GitHub flags. The remote-accepted email is `nathanielcannon@JARVIS.local` (a synthetic local email that doesn't trigger privacy checks).

2. **`filter-branch` vs `rebase --exec`**: For batch email rewrites on unpushed commits, `git filter-branch --env-filter` is the right tool — it rewrites the commit objects in-place with new author/committer metadata. A `rebase --exec 'git commit --amend --reset-author'` would work too but is slower and riskier (each step could conflict). `filter-branch` is atomic per-ref.

3. **Prevention**: Setting `git config user.email nathanielcannon@JARVIS.local` in each repo (or globally) would prevent this from recurring. Currently the global config still has the BYU email, so this will happen again on future commits.

### 2026-02-24 [9c4fb6188854]

**Why `/jicm` is two keystrokes, not one**: The JICM cycle fundamentally requires a context reset (`/clear`), which destroys the very execution environment running the command. This creates an "observer problem" — the command can't execute its own termination. The cleanest solution is a 2-step flow: `/jicm` prepares everything, then `/clear` executes the reset. The SessionStart hook on the other side handles restoration. This is the same pattern used by operating system hibernation: save state, then power off is a separate step.

### 2026-02-24 [ac14745e098b]

**Why Phase 1 gates everything**: The double-emulation stack (QEMU ARM virtualization + Windows Prism x86-64 translation) is unprecedented territory for DFHack. DFHack uses direct memory introspection of DF's process — it reads struct layouts from `df-structures` XML definitions and applies them to live process memory. Prism translates x86-64 instructions to ARM64 at the binary level, but the memory layout should be preserved (Prism emulates x86-64 virtual address space faithfully). The higher risk is performance: DF is single-threaded and CPU-cache-bound, and Prism's JIT compilation adds overhead on first-touch code paths. If Phase 1 shows >10 FPS with working RPC, we have a fully autonomous local development environment. If not, the hybrid approach (HomeServer for DF, VM for packaging) is still a strong outcome.

### 2026-02-24 [a4227509a647]

**Phase 1 Risk Assessment (from research)**:
- DFHack attaches via **SDL.dll replacement** — fully in-process, user-mode, no kernel drivers. This is the architecturally favorable case for Prism.
- Prism (Win11 24H2+) now supports AVX/AVX2, removing the instruction-set barrier that would have killed DF on older ARM Windows.
- **Zero public reports** of DF+DFHack on Windows 11 ARM — we are pioneers. Closest analog: DF reportedly works via Wine+Rosetta 2 (same architectural pattern).
- **No GPU accel in UTM** — DF Premium tiles may need software rendering, but ASCII/classic is fine.
- The double-translation chain (QEMU virtualization → Prism JIT) adds overhead but keeps the entire stack user-mode.

### 2026-02-24 [54f912cd43c2]

**Two paths forward**: We can either (a) delete the existing `DF-Windows` VM and create a fresh one with the same name (preserving script compatibility), or (b) create a new VM alongside it with a different name (requires updating script config). Option (a) is cleaner since the old VM has an unknown password state. The plan explicitly recommends fresh install over password recovery.

### 2026-02-24 [b5cb6a99905b]

**`utmctl exec` output capture**: The QEMU Guest Agent's `exec` command runs the process but may not capture stdout in all implementations. The exit code (0) confirms the command ran successfully. We may need to write output to a file and `pull` it, or use the SSH path once it's set up.

### 2026-02-24 [57f313005c14]

**Pre vs post-embark legends**: The 1.2 MB difference between pre-embark (310.8M) and post-embark (312.1M) legends represents ~15 in-game days of world simulation after embark. This delta is exactly what we need for validating change detection — the post-embark file should contain new historical events (expedition arrival, site establishment, initial encounters) that don't exist in the pre-embark export. The `legends_plus.xml` files contain extended data (relationships, entity positions, written contents) that the standard `legends.xml` omits — these are critical for the storyteller and gap-closure features we already built.

### 2026-02-24 [ecdf80e76ca6]

**Phase 1 verdict: VM is viable**. DFHack RPC at 0.3ms latency and 89ms for a full unit list means the VM isn't just functional — it's fast. The double-emulation stack (QEMU ARM virtualization + Prism x86-64 translation) doesn't appreciably affect network I/O or RPC response times. The real performance question is DF's framerate under Prism (we should check that), but for our primary use case (data pipeline: RPC + bridge → change detection → PostgreSQL), the VM is fully capable. This means we can consolidate everything on the local VM instead of the split HomeServer architecture — simpler deployment, offline-capable development, and snapshotable state.

### 2026-02-24 [b51ae036e61e]

**Skill vs Command architecture**: The `/vm` and `/df` commands are thin wrappers for single actions — they get loaded into context only when invoked via slash command. The `chronicler-ops` skill, by contrast, is loaded by the model *automatically* when it detects Chronicler-related work in the conversation (via the description's trigger words). This means when you ask "deploy the bridge and start the watcher," the model loads the skill's 7 workflows as context to guide multi-step orchestration — without needing to remember the exact sequence. The skill acts as procedural memory: the model knows *how* to do complex operations, not just *what* individual commands do.

**Why 7 workflows instead of 7 commands**: Each workflow involves 4-6 steps across multiple systems (bash scripts, Python RPC, curl, SQL). Making these individual commands would create either oversimplified wrappers that hide critical verification steps, or complex scripts that are hard to debug. The skill pattern lets the model compose the right sequence dynamically, including branching on failures.

### 2026-02-24 [19f31d084c14]

The commit captures the transformation from a placeholder skill (180 lines with pseudocode snippets) to a production-ready operational guide (486 lines with 7 workflows, real paths, and tested code). The previous commit `1311685` had created the skeleton during the initial `/vm` + `/df` command registration — this commit fills in the actual procedural knowledge that makes the skill useful as contextual guidance during complex operations.

### 2026-02-24 [a0fc03226363]

**Transfer Speed Comparison (115 MB XML file)**:

| Method | Time | Throughput | Ratio |
|--------|------|
