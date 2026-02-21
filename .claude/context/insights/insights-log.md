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
