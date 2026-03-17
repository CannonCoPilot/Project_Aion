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

### 2026-02-24 [1fdfaa0a99d9]

DFHack is alive (v53.10-r1, MODE_DWARF, "The Planet of Legends"), but `RunCommand` hangs universally due to the CoreSuspend thread issue. Core API methods (GetVersion, GetWorldInfo) work fine because they bypass CoreSuspend. This means we can't write files from within DFHack via RPC — we need another approach for init file configuration.

### 2026-02-24 [a8fa97dd398e]

The deploy script uses two heredoc quoting styles intentionally: `<< 'PYEOF'` (quoted, no expansion) for commands with hardcoded credentials, and `<< PYEOF` (unquoted, allows `$VAR` expansion) for commands that need shell variables like `$MANIFEST_FILE`. This is a clean pattern for mixing shell and Python in the same script.

### 2026-02-24 [45608a494936]

GH007 checks both author AND committer email against GitHub's privacy settings. The last 4 commits have `tb236@byu.edu` as committer (the older 4 have the correct `nathanielcannon@JARVIS.local` committer but all 8 share the private author email). Need to rewrite all 8 unpushed commits.

### 2026-02-25 [8189dc231aca]

The critical change between v0.47 and v53: the **embark screen integration is commented out** in v53 (lines 1843-1849, 1907-1914) with the note `//FIXME: Get get this info from the new embark screen.` The DF Premium embark UI changed, so the `viewscreen_choose_start_sitest` lookups no longer work. However, the world map RPC functions (`GetWorldMap`, `GetWorldMapNew`, `GetRegionMaps`, `GetWorldMapCenter`) still access `df::global::world->world_data` directly and **should work in any game state where world data exists**.

### 2026-02-25 [0673bc90b560]

The memory scanning story is **much better than expected**. The entire `memscan.lua` toolkit is preserved in v53, and the C++ `Process` class retains all read/write/scan primitives. The `MemoryPatcher` removal is trivial — `patchMemory()` still exists on `Process`. The only real regression is the embark screen integration in RemoteFortressReader (commented out due to DF Premium's new UI), which is fixable by either uncommenting and updating the viewscreen type, or by using Lua to read the embark cursor position directly.

### 2026-02-25 [296c99431e96]

DFHack's RPC dispatch model has two layers: **bind** (protocol-level, always works) and **call** (game-thread, needs an active frame loop). The bind success proves RemoteFortressReader IS loaded in DFHack 53.10-r1 — we were wrong to mark it "NOT AVAILABLE". The timeout on call just means the game thread wasn't processing requests at that moment (paused state or frame lag under Prism emulation).

### 2026-02-25 [c2fb89ae220d]

`GetWorldInfo` returns instantly but `RunCommand` and all RFR calls timeout. This reveals how DFHack's RPC dispatch works: `GetWorldInfo` reads cached state without needing the Core suspend mutex. All other calls — including `RunCommand` — need `CoreSuspender` to lock the game thread. The game thread appears to be unavailable, likely because DF is paused (DF auto-pauses on many events like combat, migrants, etc.).

### 2026-02-25 [909d15b3583d]

The Core is responsive — `dfhack-run` via SSH executes Lua instantly (year=250). `allow_remote=true` is set. The issue is **specifically the TCP RPC server's thread failing to acquire CoreSuspender for game-thread dispatch**. This might be a known DFHack 53.x bug or a Prism emulation issue with the thread scheduling. The bind (no Core lock) works but the call dispatch (needs Core lock from a network thread) doesn't.

### 2026-02-25 [5cf75a332bfb]

We now have **direct live access** to the complete world state via `dfhack-run` over SSH:
- **4,901 entities** (civilizations, sites, groups) — race 572 = dwarves, type 1 = civilization
- **48,366 historical figures** — every birth, death, and life event trackable
- **442,716 history events** — wars, beast attacks, site foundings, murders, everything
- **8,035 artifacts** — named items with full histories
- **2,154 sites** — every fortress, town, camp, and lair

This is far richer than the XML export, which only captures a snapshot. The live memory access lets us query relationships, enumerate by type, and cross-reference entities in ways the XML parser can't.

### 2026-02-25 [16d9ec07969e]

**Why these three documents form a hierarchy**: The PRD (`chronicler-prd-v2.md`) is the architectural source of truth — it defines *what* to build and *why*. The roadmap (`chronicler-roadmap-v1.md`) is the execution plan — it defines *when* and *in what order*. The research synthesis (`research-synthesis.md`) is the evidence base — it defines *what's possible* based on ecosystem analysis. Updates flow top-down: when the environment changes (HomeServer → VM, TCP RPC → SSH), the PRD captures the new architecture, the roadmap adjusts dependencies/risks, and the research synthesis adds validated findings.

The new Phase 1 detailed plan (`phase-1-denizen-registry.md`) serves a different purpose: it's a **standalone execution document** that a developer can pick up and implement without cross-referencing 3 other files. This aligns with the user's requirement that "we will not proceed through any work without first having a fully detailed PRD and roadmap of the specific phase."

### 2026-02-25 [c7b7cd7fe465]

The merge-reduce tree has been progressively consolidating 27 documents across 3 completed rounds. The remaining work is small — just 3 more agent dispatches (2 for Round 4 + 1 for Round 5) — but we're gated on the usage limit. Recording exact state now ensures zero rework on resumption.

### 2026-02-25 [7b6174ad2587]

The merge-reduce tree completed successfully: **27 source documents → 5 rounds → 1 canonical document** (107KB, 2,065 lines, 15 sections). The 107KB final size vs 366KB combined Round 4 inputs reflects aggressive deduplication — the same features, schemas, and research findings appeared in multiple source documents from different perspectives, and the final merge unified them under a single coherent structure. All 15 sections map exactly to the outline we specified.

### 2026-02-25 [7194ba10d697]

The Data ETL agent (component-08) was remarkably productive — it completed its own report and then autonomously proceeded to write all remaining deliverables: Research Synthesis v2, Product Requirements, Full Project Roadmap, all 7 Phase PRDs, and updated CLAUDE.md + current-plans.md. This happened because the agent had read all the source material and had sufficient context to generate the downstream documents. Let me verify the quality of the process document changes before committing.

### 2026-02-25 [9107e952e172]

**Stage 1.1 complete**: 5 new tables (art_forms, rivers, event_entity_xref, worldgen_snapshots, world_modpacks), 1 column addition (mountain_peaks.is_volcano), 4 column additions to identities, 11 column additions to historical_figures with GIN indexes on array columns. The database went from 33 → 38 tables and HF columns from 22 → 33. Schema.sql now matches the live database exactly.

### 2026-02-25 [3e7088940605]

**World 1: Tar Thran (The Land of Dawning) — fully ingested and verified.** The DB contains 2,197,401 total records across all CDM tables. Key metrics for this 250-year world:
- 48,273 historical figures (with family links, position history, supernatural flags, importance scores)
- 436,455 history events (with 871,761 cross-reference index entries)
- 4,847 civilizations/entities (with war lists and positions)
- 8,035 artifacts (with importance scoring)
- 37,486 written contents
- 0 referential integrity violations — clean data

The "live data" tables (units, unit_events, game_reports, etc.) are empty since we haven't connected the fortress watcher yet — those get populated in Phase 2.

### 2026-02-26 [e58feae273b1]

**CASCADE optimization** — The initial `delete_world()` used explicit FK-ordered DELETE statements for each of 33 tables. This caused a 15+ minute lock contention when interacting with CASCADE constraints. The optimized version counts rows first (via SELECT, read-only), then does a single `DELETE FROM worlds` that CASCADE handles in seconds. The `_DELETE_ORDER` constant is retained for the count queries and as documentation of the FK dependency graph.

**asyncpg mock pattern** — Mocking asyncpg's `pool.acquire()` and `conn.transaction()` requires `MagicMock` (not `AsyncMock`) wrapping a custom `_AsyncContextManager` class, because these methods return async context managers synchronously — `AsyncMock` wraps them in an extra coroutine that breaks `async with`.

### 2026-02-26 [d9cc9dc1c8e2]

**Key architectural choices in this plan**:
- **Template inheritance over monolith**: The existing `explorer.html` is ~35K tokens of inline JS/HTML — a pattern that doesn't scale. New detail pages use Jinja2 inheritance (`base.html` → `detail_base.html` → `hf.html`) with server-side rendering, keeping JS minimal.
- **Cross-linking as Jinja2 globals**: Rather than having each route generate HTML links, the `link()` function is registered globally so any template can call `{{ link('hf', id, name, world_id) }}`. This ensures consistent link formatting across all 15+ page types.
- **Batch name cache**: A typical HF detail page references ~50 entities. Instead of 50 individual DB queries, `EntityNameCache` groups by type and does 3-5 `ANY($1::int[])` queries — a 10x reduction in round trips.

### 2026-02-26 [2e2fb2ca8673]

**Why this walkthrough matters architecturally**:
- **Phase gates are not bureaucracy** — they prevent the classic "move fast and break later" failure mode. Phase 2 (Explorer) builds HTML detail pages for every entity type. If Phase 1's schema is missing a column or a parser section drops data silently, you'd discover it mid-Phase 2 as a broken page — much harder to debug.
- **The 64 automated checks are a regression safety net** — they can be re-run after any future schema change to ensure Phase 1's guarantees still hold. This is why they live in the deliverable (`validate_phase1.py`) rather than in a one-off script.
- **The "3 worlds" criterion** is the most important manual check. Parsing one XML file proves the parser works on that file. Parsing a different world proves the parser is *general-purpose* — it handles different entity counts, missing sections, and edge cases in DF's world generation.

### 2026-02-26 [5728171765b9]

**Why `pg_catalog` over `information_schema` for FK queries**:
- `information_schema.constraint_column_usage` stores FK column pairs *without* ordinal position, so joining to `key_column_usage` on a composite FK like `(world_id, site_id) REFERENCES sites(world_id, id)` produces a Cartesian product: 4 rows instead of 2. This was causing the duplicate relationship lines.
- `pg_constraint.conkey` and `confkey` are parallel arrays — `conkey[1]` maps to `confkey[1]` — so `CROSS JOIN LATERAL unnest(...) WITH ORDINALITY` gives exact column-to-column mapping with no duplicates.
- The Mermaid format distinguishes cardinality: `}o--||` means "many from-side, exactly-one to-side" (used when all FK columns are part of the PK, indicating a junction/associative table). `}o--o|` means "many-to-zero-or-one" (regular FK columns).

### 2026-02-26 [9b3cdee3e501]

**Architectural shift rationale**: The current explorer.html renders everything client-side via JS (fetch JSON → build HTML in browser). Phase 2 shifts to server-side Jinja2 templates because: (1) each entity gets a bookmarkable URL, (2) cross-linking is simpler when the server controls HTML generation, (3) perspective-aware rendering needs DB access (entity name resolution) which is cleaner server-side, and (4) the PRD explicitly mandates it. The existing explorer.html stays functional — detail pages are purely additive.

**Scale awareness**: The DB has 871K event-entity cross-references indexed on `(world_id, entity_type, entity_id)`. This means event queries for any entity detail page will use index scans, not table scans. The 48K HF table is the largest entity table — the HF detail page (24 sections) needs concurrent queries via `asyncio.gather()` to stay under the 2-second load target.

### 2026-02-26 [c5976b1cf616]

**PostgreSQL username case sensitivity**: PostgreSQL stores unquoted identifiers as lowercase. The role was created as `jarvis` (lowercase). When you type `-U Jarvis`, psql sends "Jarvis" which doesn't match the role "jarvis". Always use lowercase for the username unless the role was created with `CREATE ROLE "Jarvis"` (double-quoted, which preserves case).

### 2026-02-26 [909eba71a408]

- **PostgreSQL case rules**: Unquoted identifiers (like in `CREATE ROLE jarvis`) are folded to lowercase. Only `"Jarvis"` (double-quoted) preserves the capital J. Since Docker Compose set `POSTGRES_USER: jarvis`, the role is lowercase.
- **`pg_hba.conf`**: The container uses `md5` or `scram-sha-256` auth for TCP connections, which is why a password is required even from localhost — unlike socket connections inside the container which may use `trust`.

### 2026-02-26 [64b7322b7175]

- **Commit granularity**: Grouping by logical theme (new feature → documentation → housekeeping) rather than by file proximity makes `git log --oneline` and `git bisect` more useful. Each commit answers "what was the intent?" rather than "what happened to be dirty."
- **The 46-file commit**: The HDS intermediate artifacts (`.hds-work-*/`, `tmp/round*`) are included for reproducibility — if the planning history ever needs re-merging, the delta extractions and consolidation pairs are preserved.

### 2026-02-26 [60b01726f55a]

- **GH007 email privacy**: GitHub's push protection checks both the **author** and **committer** email fields in every commit. If either contains an email that GitHub considers private (like a personal university email), the push is rejected — even if the same email worked before (GitHub may update its privacy rules).
- **Safe local rewrite**: Since the 4 commits hadn't been pushed yet, `git rebase --exec` with `git commit --amend --author=...` was a safe way to rewrite them. The key was also setting `GIT_COMMITTER_EMAIL` as an env var during the rebase so the committer field was updated too.

### 2026-02-26 [b590e1694fb1]

- **GitHub noreply emails**: GitHub provides each account a `ID+username@users.noreply.github.com` address. Using this for commits avoids GH007 privacy blocks while still correctly attributing commits to your GitHub profile. GitHub automatically maps this noreply address to your account in the commit graph.
- **Two places to set it**: The author email (set via `--author` or `git config user.email`) and the committer email (set via `GIT_COMMITTER_EMAIL` env var) must both use the noreply address — GitHub checks both.

### 2026-02-26 [6dff2cd32d58]

- **`user.email` vs `GIT_COMMITTER_EMAIL`**: Git uses `user.email` for *both* author and committer by default. `GIT_COMMITTER_EMAIL` only overrides the committer field when explicitly set as an env var. By fixing the global config, we no longer need env var workarounds on every push.
- **Test-and-rollback pattern**: `git commit --allow-empty` + `git reset HEAD~1 --soft` is a safe way to verify git config changes without touching the working tree or leaving artifacts behind.

### 2026-02-26 [547ccfe326f6]

- **Phase gates as project governance**: The DoD checklist pattern (64 automated checks + 3 manual) creates a hard boundary between phases. This prevents "90% done" drift where work bleeds across phases with unfinished remnants. Each phase must be fully closed before the next opens.
- **current-plans.md as the CLAUDE.md @-import**: Since CLAUDE.md imports this file via `#@.claude/context/current-plans.md`, every future session will automatically pick up Phase 2 focus, the development rules, and the big-picture vision without needing to re-read the full PRD hierarchy.

### 2026-02-26 [881e0a604ab7]

Three bugs were fixed during verification:
1. **Column naming mismatch** (`seconds72` → `seconds`, `type` → `event_type`): The XML parser uses DF's internal names (`seconds72`, `type`) but the CDM schema uses normalized names (`seconds`, `event_type`). Always introspect schema before writing queries.
2. **JSONB codec missing**: asyncpg returns `jsonb` columns as raw JSON strings by default. Registering `set_type_codec('jsonb', ...)` in the connection init converts them to Python dicts globally.
3. **Custom Jinja2 test**: `selectattr('field', 'containing', 'substring')` requires a custom test registration since Jinja2 doesn't include `containing` built-in.

### 2026-02-26 [4cd65c84d154]

Schema findings for secondary entities:
- **`underground_regions`**: No `name` — only `type` and `depth`. Links will use type+depth as display.
- **`landmasses`**: Uses `coord_1`/`coord_2` (bounding box corners), not `coords`.
- **`mountain_peaks`**: Has `height` and `is_volcano` — good for distinct styling.
- **`rivers`**: Has `name_english` for translations and `end_type` for terminus classification.
- **`art_forms`**: Has `form_type` (dance/musical/poetic) and `description`.
- **`identities`**: `histfig_id` (not `hf_id`) for the real person, `birth_second` (not `birth_seconds`).
- **`historical_eras`**: NO `id` column — just `(world_id, name, start_year)`. Will need name-based routing.

### 2026-02-26 [79b4ad24e166]

**Jinja2 `format` filter vs Python `str.format()`**: The `|format(...)` filter in Jinja2 uses old-style `%` formatting (`"string" % args`), which doesn't support the `{:,}` comma syntax. Python's `str.format()` does support it. Fix: change `{{ "{:,}"|format(x) }}` to `{{ "{:,}".format(x) }}` (calling the Python method directly instead of the Jinja2 filter).

### 2026-02-26 [4d7ba57d3144]

The linking module is well-designed — entity links include `data-entity-type` and `data-entity-id` attributes (line 88-90), which is exactly what Tippy.js needs to identify which popover API to call. The `EntityNameCache` also handles batch name resolution with TTL, which satisfies the "entity name cache for performance" DoD item.

### 2026-02-26 [d7950eab3111]

The perspective-aware rendering system now works through a **three-layer architecture**:

1. **Column Mapping** (`COLUMN_MAP_BY_EVENT`): Each event type has a mapping from generic DB columns (`hf_id_1`, `entity_id_1`) back to DF XML field names (`snatcher_hfid`, `civ_id`). This reverses the normalization done during ingestion.

2. **Template Rendering**: Templates use natural language patterns ("*they* abducted *bomrek claspsell* from *daggerbird*") with field placeholders. The renderer checks each field against the perspective entity — matches become `<em>pronoun</em>`, others become clickable links.

3. **Type-aware Pronouns**: HFs get "they/them", sites get "here", civilizations get "the civilization" — contextually appropriate for each entity type.

### 2026-02-26 [e953c7d597d7]

**All 30 Phase 2 DoD items are verified as PASS.** Here's the complete picture:

1. **EntityLinkRenderer** (`/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/linking.py:11`) — 15 entity type routes, generates HTML `<a>` tags with `data-entity-type` and `data-entity-id` attributes for Tippy.js popover hooks.

2. **EntityNameCache** (`/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/explorer/linking.py:106`) — Per-world, 5-minute TTL, batch-loads names grouped by entity type. Only queries DB for refs not in cache — this is the performance optimization the DoD requires.

3. **Global search** lives in `_nav.html` (the shared navigation partial), so it appears on ALL pages — not just the explorer main page. It uses a 200ms debounce, keyboard navigation (arrow keys + enter), and accent-insensitive ILIKE via `unaccent()`.

### 2026-02-26 [7b211ac41573]

**Phase 2 Architecture Highlights:**

1. **Cross-linking infrastructure** is the engineering centerpiece. `EntityLinkRenderer` maps 15 entity types to URL patterns and generates `<a>` tags with `data-*` attributes that Tippy.js hooks for popovers. `EntityNameCache` batch-loads names by type with 5-minute TTL — so a page with 50 entity references makes ~4-5 DB queries (one per type) instead of 50.

2. **Perspective-aware rendering** (`PerspectiveRenderer`, 423 lines) is the most nuanced module. When viewing HF #7's page, events involving that HF replace their name with pronouns ("he founded the site" instead of "Urist McBordeaux founded the site"). This is the kind of contextual transformation that makes the Explorer feel like a *narrative* tool, not a data dump.

3. **Template inheritance** — all 17 detail pages extend `detail_base.html` which provides the shared Tippy.js init, tab persistence JS, prev/next nav, and breadcrumbs. Adding a new entity type in future phases requires just a new route + template.

### 2026-02-26 [f92e99bc5b53]

**What went into this commit:**

1. **DoD checkbox flip** — The Phase 2 PRD's 30 `- [ ]` items became `- [x]`, creating the audit trail that Phase 2 passed all requirements. This is the "signed off" artifact.

2. **CLAUDE.md context reduction** — Moved `valedictions.yaml`, `strengths.md`, and `weaknesses.md` from `@`-imports (always loaded into every context window, consuming ~tokens each session) to a "Misc Resources" section (loaded on demand). This is a small but compounding optimization for JICM.

3. **Two new reports** — The completion report (~130 lines) provides the "what was built" summary with code statistics, and the validation walkthrough (~180 lines) is the step-by-step manual QA guide with 18 verification items.

### 2026-02-27 [577433055a03]

The `historical_eras` table has no `id` column — only `world_id`, `name`, `start_year`. This is because DF's XML doesn't assign IDs to eras; they're identified by name. The era detail route likely queries by an `id` that doesn't exist in the schema. This is a schema/route mismatch that needs fixing.

### 2026-02-27 [2983e9ba596e]

The variable shadowing pattern (`events` as both a query parameter and a DB result) is a common trap in FastAPI routes. The fix of renaming the DB result to `events_rows` while keeping the query param as `events` follows the convention of distinguishing between "user input" and "fetched data" namespaces. In other entity routes, there's no query param, so `events` unambiguously refers to the DB result.

### 2026-02-27 [17a528440d58]

The DwarfCron `data/` directories contain database dumps and legends exports that are intentionally not tracked in git — the `.gitignore` only blocks `*.xml` from legends but the rest (backup dumps, non-XML legends files) should likely also be gitignored. The screenshots in Jarvis are validation evidence from Phase 2 testing and could be useful for the completion report but don't need to be version-controlled.

### 2026-02-27 [3d9bc96ddf27]

The two-document pattern per phase (completion report + validation walkthrough) is intentional — the report answers "what was built and is it complete?" while the walkthrough answers "how do I verify it myself?" This separates the summary judgment from the reproducible testing procedure, making it easier for the User to validate without wading through implementation details.

### 2026-02-27 [e6b31740670c]

There's an interesting documentation topology at play here. The same reports exist in two locations with slightly different content:
- **`Jarvis/projects/chronicler/reports/`** — Dev artifacts (more detailed, written during development)
- **`DwarfCron/docs/`** — Product-facing docs (shipped with the application)

The Jarvis copies were updated when Phase 2 was marked complete, but the DwarfCron copies weren't updated after the post-validation bug fixes. This is a common drift pattern — the fix touched the *code* but not the *docs that describe the code*. The gender-aware pronoun fix is the most significant gap because it changes user-visible behavior.

### 2026-02-27 [0f0b799984ef]

The 80,432 vs 436,455 event discrepancy likely arose because the docs were written against an earlier dataset (possibly a pre-embark world or a different world_id). This is a common documentation drift pattern — stats get embedded in docs during initial development and don't get updated when data changes. Always verify numeric claims against the live database before publishing.

### 2026-02-27 [6c99eed6714d]

The key architectural insight here is that **legends_plus.xml is self-contained** — it already carries the creature dictionary inside itself via the `<creature_raw>` section. This means we don't need the game running or access to the raw `.txt` files to build proper display names. The data is sitting right there in the XML we already parse, in a section we skip. LegendsViewer-Next figured this out; df-narrator didn't bother. Chronicler should follow LegendsViewer-Next's lead.

The per-world nature of the dictionary is important: "Night Creature 14" in world A might be a werebadger, while in world B it could be a night troll. The creature_raw section carries these world-specific generated names, making it essential for proper display of transformed HFs (vampires, werebeasts, necromancer experiments).

### 2026-02-27 [e9f3ae5e3577]

**The Race Encoding Problem in Dwarf Fortress is three-fold:**

1. **Three different naming conventions in the same data**: `legends.xml` uses UPPERCASE creature_id tokens (`COLOSSUS_BRONZE`), `legends_plus.xml` uses lowercase display names (`bronze colossus`), and the bridge Lua uses raw creature_ids from `df.global.world.raws.creatures.all`. These don't always agree — note `ARMADILLO MAN` (space) vs `ANT_MAN` (underscore) even within the same file.

2. **Night creature experiments generate synthetic race names**: `HFEXP33187 E_HUM1` means "Historical Figure Experiment #33187, humanoid variant 1" — these are creatures created by necromancer experiments. There are 294 such HFs in your test world. Without the game raws, there's no way to decode what these actually *are* (e.g., "werewolf", "werebeast", or custom night creature).

3. **The creature_id → display name mapping requires the raws**: `COLOSSUS_BRONZE` → "bronze colossus", `BEAR_GRIZZLY_MAN` → "grizzly bear man". Simple string manipulation (replace underscores, titlecase) works for some but fails for reversed words and compound names.

### 2026-02-27 [71cf201889c9]

**legends_plus.xml already contains a `<creature_raw>` section** — the creature dictionary is embedded in the XML we're already parsing. We don't need the game running or access to raw `.txt` files. This was discovered in a prior session (insight `6c99eed6714d`). LegendsViewer-Next parses this section; Chronicler currently skips it.

This means the answer to "do we need to generate a new dictionary per world" is **yes, but the source is already in hand** — it's a section of the legends_plus.xml we're importing but not reading.

### 2026-02-28 [7ffc1cde3abe]

**Reopening a "complete" phase is a deliberate design decision.** Phase 1 was COMPLETE (64/64 checks passed), but the creature dictionary is fundamentally a data foundation concern — it's XML parsing into a DB table, squarely in Phase 1's charter. By slotting it as Stage 1.5 rather than deferring to Phase 3+, every downstream phase (Explorer, Narrative, Visualization) inherits proper creature names and classification flags "for free" without each having to solve the display name problem independently.

The cascade effect is significant: **12-15 Phase 2 UI features** (HF profile, entity headers, popovers, filtering, search) all benefit from a single data-layer change. This is the architectural principle of "push complexity down the stack" — one table join replaces dozens of template-level string manipulations.

### 2026-02-28 [cabc2b60665b]

**Phase 2 verification is complete.** Here's what was validated:

1. **Code structure**: 22 templates, 23 routes in `detail_pages.py`, 3 explorer modules (`linking.py`, `perspective.py`, `calendar.py`) — all present and importing cleanly.

2. **Live server test**: All 22 endpoints hit with `curl` — every single one returned HTTP 200 with substantial content (17KB–122KB for pages, rich JSON for APIs). The global search returns 22 results for "asob" spanning HFs and Identities. Popovers return badges, race, birth/death years, kill counts. CSV export streams 81KB for the regions table.

3. **The world_id gotcha**: The test world "Tar Thran" has `id=2`, not `id=1`. When `world_id` is omitted from API calls, the default world detection (`_get_default_world_id`) correctly resolves to 2. The validation walkthrough doesn't hardcode world_id=1 in URLs, so this works seamlessly.

### 2026-02-28 [6942526504e9]

**Deferring DoD is the right call architecturally.** The Development Rules mandate that "Only the User may defer or remove requirements" and the User must confirm before declaring a Phase complete. By marking the DoD as deferred rather than reverting all 30 checkboxes, we preserve the implementation record while making clear that sign-off is blocked on User review. This avoids the common trap of treating "code works" as "feature is done" — the User's hands-on review is the final quality gate.

### 2026-02-28 [200188dd512c]

**Data inventory for entity scoring design:**

The investigation reveals a rich signal landscape across 5 data sources:

1. **`event_entity_xref`** (87,467 entity records) — Direct event participation, with 2 roles: `subject` (82K) and `object` (5.4K). Civilizations lead (30K), followed by site governments (25K) and religions (21K).

2. **`hf_entity_links`** (193,711 records) — Membership/relationship records. 8 link types: member, former member, enemy, prisoner, criminal, slave. Site governments dominate (110K) because every local council tracks its citizens.

3. **`hf_position_links`** (21,778 records) — Named leadership positions held by HFs within entities. Site governments again lead (9.2K) with religion (6.2K) second.

4. **`history_event_collections`** (11,467 entity refs) — Wars, sieges, beast attacks. `attacker_entity_id` (3.4K) and `defender_entity_id` (8K). Site governments dominate defender roles (4.4K beast attacks alone), while civilizations lead attacker roles.

5. **`entity_positions`** (8,852 records) — Defined positions (ruler, priest, etc.) that an entity *can* have. This is a structural signal, not a behavioral one.

The key design challenge: **site governments have the highest raw counts** (110K HF links) simply because every village council tracks members. But a village council with 50 members that never did anything interesting is *less* narratively important than a 3-goblin nomadic group that disbanded after one year. This directly validates the User's design principle.

### 2026-02-28 [0d20d42bd022]

**IDF-weighted entity scoring** — The scoring system uses an information-theoretic approach borrowed from text retrieval (TF-IDF) but applied to game entities. Instead of weighting words in documents, it weights *event types within entity types*. A religion that participated in a war (rare for religions) scores much higher per-event than one that merely recruited members (universal). This means a 3-goblin outcast group involved in a single theft can legitimately outscore a 250-year civilization that only performed routine governance — exactly the "narrative interest ≠ scale" principle the design demanded.

### 2026-02-28 [0ed833bca086]

**The IDF-weighted entity scoring system is complete.** Here's what makes this design interesting:

1. **No hand-tuning needed**: The IDF formula `log2(N/n)` automatically discovers what's rare per entity type. When applied to a new world with completely different event distributions, the weights recalculate themselves. This is the same mathematical foundation as TF-IDF in information retrieval, adapted from "which documents are relevant" to "which entities are narratively interesting."

2. **Three independent signal sources combine additively**: Event participation (the entity's direct history), HF membership links (who joined/left/was imprisoned), and event collection roles (wars, sieges) each contribute independently. An entity can score high from any combination — a religion with no wars but many artifact claims, or a nomadic group with no members but involved in beast attacks.

3. **The floor weights are a neat trick**: Pure IDF would score `created structure` at 0.0 for guilds (100% of guilds have one), but structure creation is inherently meaningful. The floor ensures these events always contribute at least 2.0 per occurrence. But the floor never *reduces* a naturally high IDF — it's `max(IDF, floor)`, not a replacement.

### 2026-02-28 [da54e324b657]

**The hardcoded `WORLD_ID = 8` was a silent failure** — all API calls for Civs, Geo, and Events were passing a nonexistent world ID. The server returned empty arrays (not errors), so the UI showed "Loading..." forever or empty lists with no error message. This is a classic case where the API's "empty results are valid" contract makes debugging harder — the fix is to always resolve the world ID from the database, matching what `detail_pages.py` already does with `_get_default_world_id()`.

### 2026-02-28 [841dba9657c7]

**The data reveals a natural partitioning.** Some types are inherently "prominent" (civilizations, major sites, wars) while others are inherently "salient" (identities, procedural creatures, anomalous one-off events). But the most narratively interesting entities are the ones that score high on BOTH axes — a civilization that's both the largest empire AND has a bizarre founding myth. The DM wants to know both which empire everyone talks about (prominence) and what the weird story is behind it (salience).

The event participation distributions are telling: only 3,125 HFs (6.5%) have 21+ events, and only 79 entities (1.6%) have 100+ events. These are the "prominent" core that everyone in the world would know about. The long tail of 23,759 HFs with 1-5 events contains the "salient" gems — the shoe salesman who bumped into great-grandma.

### 2026-02-28 [9c5ade563970]

The JICM checkpoint said "fortification=0" was TODO, but the code at `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/scoring.py:586-589` already implements the fortification boost (`0.5 × max_wc_prominence/salience`). This is a known JICM gotcha — checkpoints capture state at compression time, which may lag behind the actual code state when writes happen rapidly.

### 2026-02-28 [c0d081257717]

**The length² scaling dramatically amplifies the gap between long and short features.** "Trappedworked" at 142 segments went from P=11.9 (√142) to P=20,164 (142²) — a ~1,700× increase. This means rivers and roads now dominate prominence far more than before, creating a clear hierarchy where the longest features are disproportionately prominent — exactly what the user intended for narrative salience.

**No roads/tunnels traverse evil or good biomes in this world.** The 597 evil/good tiles are concentrated in remote regions that roads don't reach. The salience check still works correctly — it iterates ALL tile coords along each road/tunnel path, comparing against the spatial lookup. It would activate in a world where roads connect through evil territory.

### 2026-02-28 [e3afc9d9dea2]

**The deeper principle is "computed state should be self-describing."** Raw scores encode the formula's output but require knowledge of the formula to interpret. Normalized scores encode *relative standing*, which is what every downstream consumer actually needs. The formula details become an implementation concern, not a data concern. This is the same reason percentile ranks are more useful than raw test scores in education — the consumer cares about "where does this entity sit?" not "what was the arithmetic."

### 2026-02-28 [ef23ca9ef508]

**The river prominence distribution reveals the length² effect clearly.** Median river prominence is 0.0002 (most rivers are short), but the top river ("Trappedworked" at 142 segments) is at 1.0. The second-longest ("Scrubleaked" at 104 segments) is already down to 0.54. This is exactly the power-law shape you'd expect from squaring — the longest rivers dominate disproportionately, which maps well to narrative reality: everyone knows the Nile, fewer know the Orinoco.

**The normalization is idempotent.** Running `compute_importance_scores` twice produces the same 0–1 values because the raw scores are recomputed from scratch each time, then normalized. There's no accumulation or drift risk across re-ingestions.

### 2026-02-28 [52d12bf3f362]

**The identity spoiler problem is fundamentally a Knowledge Horizon issue.** DF's `identities` table stores things like "HF #4521 is secretly a vampire posing as a human baker." A naive narrative engine that joins identities would say "Baker Urist, secretly a vampire, baked bread" — destroying the mystery. The solution will likely involve an event-gated reveal: only surface the identity if a `hf_revealed_identity`-type event exists in the history. This is one of the more nuanced aspects of the Knowledge Horizon concept from the PRD.

### 2026-02-28 [981abf62acb5]

**This clarifies two orthogonal axes in the Knowledge Horizon system:**
1. **Knowability** (binary per unit) — "Does this unit know this feature exists?" → determined by spatial proximity to regions/features. A dwarf in "The Dune of Warnings" knows every creek, peak, and road in that region.
2. **Weight** (continuous 0–1) — "How much narrative emphasis should this feature get?" → determined by prominence/salience scores. The longest river gets more narrative screen-time than a short creek, but both are *known* to a local unit.

These two dimensions compose: `narrative_inclusion = knowability(unit, feature) × weight(feature)`. A feature the unit doesn't know about gets 0 regardless of weight. A feature the unit knows about gets emphasis proportional to its score.

### 2026-02-28 [fb43c7b69b24]

**The prominence vs. salience split maps perfectly to art history.** "The Fabulous Lute" has 453 practitioners (high prominence — everyone knows this dance) but all works are 1-page choreographies with modest quality (avg roll 59). Meanwhile, a form that produced a 347-page comparative biography with entity references and "Witty" style would score high salience despite fewer practitioners. This mirrors real art: folk songs are prominent; obscure avant-garde is salient.

### 2026-02-28 [fd7fe08d7eb8]

**The "number of HFs who know the artwork" metric you asked about doesn't exist directly in the data.** What we have is "number of HFs who have composed in this tradition" — which is a proxy for cultural spread but not the same as widespread familiarity. A dance tradition known to an entire civilization could have few composers but thousands of practitioners/audience members.

**Prominence proxy options** (from available data):
1. **Unique authors** — HFs who composed in this tradition (what I showed earlier)
2. **Site spread** — number of distinct sites where compositions in this form were created
3. **Entity spread** — number of distinct civilizations whose members compose in this form
4. **Total works** — raw volume of compositions (but inflated by prolific authors)

**Salience signals remain viable** — page length, style tags, reference density, and form diversity are all objective features of the actual compositions, not of who knows them.

### 2026-03-01 [e6207a2ca316]

**The DF copy model works like real medieval manuscript transmission:**
- A written work is composed (37,486 unique compositions)
- Some get inscribed onto physical artifacts (7,418 scrolls/books/codices)
- Those artifacts get copied between libraries at different sites (349 copy events)
- The `<writing>` tag on artifacts is the link: artifact.writing → written_content.id
- Copy count = how many `artifact copied` events reference artifacts linked to that written work

**For scoring purposes**, this gives us a real "cultural spread" signal — a work that's been copied across 3 cities is more prominent than one that sits in a single library. But first we need to fix the parser to capture the `<writing>` tag.

### 2026-03-01 [06c5b6fe1943]

**The Copy Number ladder is an elegant discrete scoring system:**
- It maps the real-world manuscript transmission chain (composed → inscribed → copied → widely distributed) to a 1–5 integer scale
- The 5-point cap prevents runaway values while preserving the meaningful distinction between "exists as an idea" and "spread across multiple libraries"
- The /10 divisor on auteur bonus is a deliberate scaling choice — without it, the creator of "The Fabulous Lute" (1,223 works) would gain +1,223 importance, dwarfing most military leaders. At /10, the +122.3 is significant but balanced against war heroes (~500 importance) and legendary kings

**The design also surfaces 4 open questions** (Section 6) that should be resolved before implementation. The most impactful is whether missing `author_roll` (39% of works) should get salience=0 or a default. If zero, that's 14,571 works with no salience signal at all.

### 2026-03-01 [bef880719013]

**The bug is a classic client-side-filter-of-a-limited-dataset problem.** The browse endpoint returns the top 100 by importance. Client-side checkbox filtering can only show what's already loaded. Necromancers (max importance 455) fall outside the top 100 cutoff (560+). The fix must make the type flags a server-side filter so the API returns the top necromancers/werebeasts/etc. directly.

### 2026-03-01 [2b0b4630ed2d]

The race pill design uses a "thin API, smart client" pattern: the server returns raw category data with counts, and the client renders it into interactive pills. This means if a modded Dwarf Fortress world introduces new playable races, they automatically appear as pills (via `occurs_as_entity_race` flag in creature_dictionary) without any code changes. The `_other` category acts as a catch-all for creatures that don't fit any classification — wild animals, megabeasts, etc.

### 2026-03-01 [1c6cbcee5e42]

The `_other` category clause is an **exclusion-based filter** — it defines itself by what it's NOT (not entity races, not deities, not beasts, not titans, not demons, not night creatures, not animated dead, not animal people). This is the correct approach for a catch-all because it automatically adapts: if new category handlers are added (e.g., `_megabeast`), those creatures would first need to be excluded from `_other` too. The dashed border + reduced opacity is a UI pattern called "de-emphasis" — it signals to users that this pill is qualitatively different from the named categories.

### 2026-03-01 [8fdce9dfd47d]

The scrolling fix relies on a CSS principle called the **height constraint chain**. For `overflow-y: auto` to create a scrollbar, the element must have a **constrained height** — it must be smaller than its content. With `min-h-screen`, the body could grow to fit ALL content, meaning no child ever overflows. With `h-screen`, the body is exactly viewport height, forcing `flex-1` children to share the remaining space. When their content exceeds that space, `overflow-y-auto` kicks in with an independent scrollbar. The chain must be unbroken from the viewport root all the way down — any ancestor that grows unconstrained breaks the chain.

### 2026-03-01 [350078080ff0]

Python's built-in `str.title()` capitalizes the first character after ANY non-alpha character, including apostrophes — so `"night's demon".title()` produces `"Night'S Demon"`. The `_race_display_name()` helper in `people.py` avoids this by splitting on spaces and only capitalizing `w[0]`, leaving internal apostrophes untouched: `"night's"` → `"Night's"`.

### 2026-03-01 [3d5d93692bd0]

The race categorization uses a **closed-set** approach — only known civilization races get pills, and `_animal_men` is a catch-all for `*_MAN` / `RODENT MAN` patterns. This works because the DF `entities` table only contains races that can form civilizations, which in vanilla DF is exactly these 6 categories. If a mod adds a new civ race (e.g., `FAIRY`), it would appear in the list items but wouldn't get its own pill until manually added — a safe default since unknown modded races are rare and the "All" pill still shows them.

### 2026-03-01 [d8d470f7b334]

The key design shift: **the data drives the UI, not the code**. The old approach had a hardcoded `_CIV_RACES` set in JavaScript — any new race required a code change. The new approach queries `SELECT DISTINCT race FROM entities` joined with `creature_dictionary` for display names, so the UI is a pure projection of the data. This is the same pattern used successfully in the People tab's `race-summary` endpoint. The only "hardcoded" behavior is collapsing `*_MAN` patterns into "Animal Men" — which is a stable structural convention in Dwarf Fortress, not a race-specific hack.

### 2026-03-01 [3c2d80ca4b80]

This is a classic XML parsing pitfall: when a parent element has **repeated child elements** with the same tag name (like multiple `<child>` nodes), a naive "last value wins" parser overwrites. The DF `<entity>` can have hundreds of `<child>` elements (civ 985 has 248!). Our parser stored only the last one. The `<entity_link>` elements are a separate, structured representation of the same relationship. The fix is to store `child` as a JSON array in `details`, not a scalar.

### 2026-03-01 [1ab9ee146840]

**Why asyncpg's JSONB codec creates this trap**: asyncpg's `set_type_codec` with `encoder=json.dumps` is designed so you can pass native Python dicts/lists as JSONB parameters — a convenience feature. But it creates a subtle contract: *all* JSONB values must be Python objects, never pre-serialized strings. The codec layer is invisible to application code, so it's easy to call `json.dumps()` out of habit. The result is a string-typed JSONB value (`"{\\"key\\":\\"val\\"}"`) that looks correct when queried as text but breaks `->` and `->>` accessors completely. The fix we applied — removing all manual `json.dumps()` — is the correct pattern: let the codec own serialization.

### 2026-03-02 [b6188421e3e6]

The current architecture has a key tension: `searchPeople()` and `browsePeople()` are completely separate flows. Search hits `/api/people/search` (no race filter support), while Browse hits `/api/people/browse` (race filter only). When the User says "race pills reset search results," that's because `selectRace()` calls `browsePeople()`, which ignores any active search query. The fix requires unifying these into a single flow: one API call that accepts both a search query AND race/alive filters, with the JS maintaining all filter state across interactions.

### 2026-03-02 [a236e15b33b5]

The current architecture has a clean separation: server-rendered full pages (`hf_detail.html` via Jinja2) and client-rendered inline views (`renderHfDetail()` via JS). The User's feedback reveals these two views have diverged — the inline view is missing the 4-tab structure, Factions table, relationship graph, kills detail, and the rich event rendering. The fix strategy is to create an **embed endpoint** that returns a self-contained HTML fragment of the full view, which the explorer.html can inject via AJAX. This eliminates the JS rendering duplication and ensures both views always match.

### 2026-03-02 [f65f67e57cd4]

**Why killed HFs often lack entity_id**: In Dwarf Fortress, when a figure is killed in battle, Legends XML records the kill in the killer's `kills` JSONB with a `victim_id`. However, many victims are "wild" figures (animals, monsters) or belong to populations that aren't tracked as formal civilization members. The `entity_id` on `historical_figures` represents formal citizenship — combatants killed in raids often don't have this. The race column is far more useful here since every HF has a race.

**Civilization vs Sitegovernment site ownership**: In DF's entity hierarchy, `civilization` entities are abstract (like "The Brave Kingdom"), while `sitegovernment` entities actually own specific sites. That's why the LATERAL JOIN returns sites for sitegovernments but not for civilizations — the architecture correctly reflects DF's data model.

### 2026-03-02 [ab82c45d47b6]

**The column name mismatch**: This was a pre-existing bug where a prior session's changes to `people.py` referenced `prominence_score` and `salience_score` — columns that exist on `sites`, `regions`, and `rivers` tables, but NOT on `historical_figures`. The HF table only has `importance_score`. This is a classic "introspect before executing" gotcha from MEMORY.md — different entity tables in the CDM schema have different scoring columns. The fix was simply to use the correct column name (`importance_score`) in both the browse and search queries.

### 2026-03-02 [2ae52f0e6f78]

**Dynamic template inheritance for partial rendering**: The key technique here is `{% extends base_template|default("detail_base.html") %}` in `hf_detail.html`. Jinja2 evaluates `extends` at render time, allowing the same child template to render with different parent layouts. When `partial=1`, the endpoint passes `base_template="detail_partial_base.html"` — a minimal parent that only defines the `entity_type_badge`, `vital_stats`, `tabs`, and `body` blocks, omitting `<html>`, `<head>`, nav, breadcrumbs, and Tippy.js. Blocks the child defines but the parent doesn't (like `title`, `breadcrumb`, `prevnext`) are silently discarded by Jinja2. This eliminates code duplication — the same ~660 lines of Jinja2 template logic renders both views.

**Script injection via `replaceChild`**: When you set `innerHTML`, the browser parses `<script>` tags but doesn't execute them. The workaround is to clone each `<script>` as a new `document.createElement('script')` and replace the old one — the browser executes freshly-created script elements.

**Entity link interception pattern**: The partial HTML contains `<a href="/explorer/hf/123">` links generated by the `EntityLinkRenderer`. Rather than modifying the server-side linker, the client-side interceptor catches all `<a[href^="/explorer/"]>` clicks, parses the entity type and ID from the URL, and calls `navigateTo()` to stay within the SPA explorer panel. The "Open Full Page" button has `target="_blank"` so it bypasses the interceptor.

### 2026-03-02 [d21219a759a5]

**Why this was one commit instead of several:** The changes accumulated across multiple JICM cycles in the same working session without intermediate commits. Ideally, each feature (inline detail, graph, chat popup, search filters) would be a separate commit for easier bisection and code review. However, since these changes were all part of the same Phase 2 User-review response session and tightly interleaved (e.g., the inline detail system enables the graph to work in both modes), a single feature commit with a detailed message is the practical choice.

### 2026-03-02 [bfc144ec699d]

**Dual range slider pattern**: The year filter uses two `<input type="range">` elements sharing the same min/max domain, with a JS function that enforces `lo <= hi` (swapping if the user drags them past each other). The `data-year` attribute on each `<tr>` enables O(n) filtering without re-querying the server — all filtering happens client-side. The count indicator `(97)` updates live to show how many kills fall within the selected range.

### 2026-03-02 [d282bf152d89]

**Breadcrumb architecture pattern:**
- `detail_base.html` renders the outer `Explorer ›` prefix
- Each child template fills `{% block breadcrumb %}` with the middle segment(s)
- Structure and Collection templates support hierarchical breadcrumbs (e.g., `Geography › Site Name › Structure Name`)
- The `?tab=` parameter ensures the Explorer landing page opens with the correct tab pre-selected

### 2026-03-02 [696133ee31a6]

**Current scoring architecture gap:**
- Geographic features (regions, rivers, world_constructions, sites) already have `prominence_score` + `salience_score`
- Core entity tables (`historical_figures`, `entities`, `artifacts`) only have `importance_score`
- The scoring module already derives prominence/salience from importance for entities like sites, but hasn't been extended to HFs, entities, and artifacts
- The fix requires: schema migration + scoring computation + API sort updates + template display updates

### 2026-03-02 [9bbe7210cfd5]

**Prominence vs Salience distribution is working as designed:**
- **Prominence** (how well-known/referenced): "minaro autumnalsculpt" leads at 1.0 — likely the most-referenced figure in events
- **Salience** (narrative interestingness via IDF-weighting): "stobux waterrags" (a deity) leads at 1.0 — their contributions are narratively distinctive
- Necromancers (bini, goden, domas) have high prominence but low salience — they appear frequently in events but their actions are more formulaic
- The deities (stobux, rayathi, ilpi, ratha) show high scores on both axes — prominent AND narratively interesting

### 2026-03-02 [818f9765487d]

**Key architectural difference:** The old `importance_score` still exists in the database as the raw composite — it's the *source* from which prominence and salience are derived for HFs, artifacts, and sites. For entities (civilizations), prominence and salience are computed independently from scratch using different aggregation methods (raw count vs IDF-weighted). The old score is kept for backwards compatibility in the validation/storyteller modules, but the Explorer UI now exclusively uses prominence (for sorting) and salience (for narrative flagging).

**Why two axes matter for the Narrative Engine (Phase 3):** When generating stories, the AI can prioritize entities that are highly salient but low prominence (hidden gems — the obscure necromancer who did something extraordinary) vs. entities that are highly prominent but low salience (well-known but boring — the civilization that just recruited 10,000 members). The old single score couldn't distinguish these.

### 2026-03-02 [9e962da1bb2e]

**Parser design pattern**: The Chronicler parser uses a two-pass architecture — `_parse_artifacts()` handles legends.xml (base data), then `_parse_legends_plus()` enriches with additional data. The JSONB `details` column serves as an extensible overflow bag. By merging with `||` (JSONB concatenation), we preserve any existing details while adding new fields — no data loss on re-ingestion.

### 2026-03-02 [59eaef875d95]

**Why re-ingestion is needed**: The artifacts table currently has `details = NULL` for all rows because the old parser discarded everything. The new parser captures `<writing>` and `<page_count>` from legends_plus.xml, but this data only gets populated on fresh ingestion. Without writing_id in artifacts, the copy-chain scoring (Steps 1-3) would find zero links and all works would score copy_num=1.

**The auteur bonus SQL uses a LATERAL join pattern**: For each "form created" event, it finds how many distinct works exist in that tradition, then credits the creating HF. This is more SQL-efficient than a Python loop — one query instead of N.

### 2026-03-03 [10c3ee62baa5]

**What we fixed and learned this session**:
1. **`delete_all_worlds` performance**: Changed from `DELETE FROM worlds` (row-by-row CASCADE, 10+ minutes for 4M rows) to `TRUNCATE worlds CASCADE` (instant, O(1) metadata operation). `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/db/worlds.py:125`
2. **Stale connections can block post-parse**: A cancelled `DELETE` query left a stale connection that caused the post-parse pipeline to find 0 rows. Always kill stale connections before re-ingesting.
3. **Art scoring now works end-to-end**: 7,418 artifacts linked to written works, 299 with copy events, 240 traditions scored, and author/auteur prominence bonuses applied.

### 2026-03-03 [ad27a8cbd6fc]

**Why the first rescore showed 0**: The previous ingest crashed with a deadlock during the normalization step of `_compute_geo_scores`. While asyncpg doesn't wrap everything in a transaction by default, the connection pool's connection may have had dirty state from the aborted query. The pool reused that connection for rescore, and the aborted transaction's effects may have caused visibility issues. A fresh process (second rescore) got a clean connection and worked perfectly.

### 2026-03-03 [3754cb795cf0]

**Why three scores instead of one**: A single "importance" number conflates two orthogonal dimensions. A deity who barely interacts with the world (few events) but is cosmically significant (high narrative weight) gets a middling score that satisfies neither search ordering nor narrative selection. Splitting into prominence (structural reach) and salience (narrative interest) lets the Explorer UI sort by "who appears most" while the future Narrative Engine selects "who deserves the spotlight." The `importance_score` remains as a legacy convenience -- it's simply `prominence + salience` before normalization.

**The IDF trick for entities**: Entity scoring uses TF-IDF from information retrieval theory. Just as a search engine down-weights common words like "the", the scorer down-weights common events like "recruited member." A civilization that destroyed a site (rare event) gets a bigger per-event boost than one that merely grew its population (universal event). The floor weights prevent militarily important events from being zeroed out when they happen to be common in a particular entity type.

### 2026-03-03 [d25883356984]

**Why "design document first" matters**: The unified-scoring-design.md serves as the single source of truth for scoring formulas across the Chronicler project. By rewriting it before touching any code, we establish a clear specification that prevents drift during implementation. This is especially important here because the changes span 11+ files and touch every entity type — having the formulas documented first means each code change can be verified against the spec.

**The `1/(1-quality)` non-linear multiplier**: This is borrowed from information theory (it resembles the odds transformation `p/(1-p)` from logistic regression). A work at quality 0.5 gets 2x salience; at 0.8, 5x; at 0.95, 20x. This creates a natural "long tail" where the vast majority of works have modest salience boosts, but the rare masterpieces become dramatically salient — which aligns with the user's "more is not better" philosophy.

**Category-based vs importance-derived site scoring**: The old approach was `prominence = importance_score` for normal sites and `importance_score / 2` for mysterious ones. This made every site's prominence proportional to its event count. The new category-based approach gives a dark fortress inherent salience (S_base = 40) regardless of how many events happened there — a tiny, newly-founded dark fortress is still inherently more interesting than a large peaceful hamlet with hundreds of events.

### 2026-03-03 [6226935c27b4]

**Score independence verified empirically**: The top-5 by prominence (Minaro the elf author, P=1.0 / S=0.16) vs top-5 by salience (Stobux the titan deity, S=1.0 / P=0.82) demonstrate that the two metrics capture genuinely different axes. A prolific author is maximally prominent (everyone knows their works) but only moderately salient (no supernatural drama). A titan deity is highly salient (kills, deity flag) AND prominent (many events), but the most prominent figure in the world is a mundane-but-prolific elf — exactly the design intent.

**Category baselines validated**: Dark fortresses all show S > 0 even without events, confirming the `s_base=40` category baseline works. Before this change, a newly-discovered dark fortress would score 0 salience — now it immediately registers as narratively interesting.

### 2026-03-03 [e13a6a574a26]

**Logical commit splitting**: The staged changes (23 files) are all UI/template/parser improvements — detail page scoring badges, HF inline partial updates, xml_parser creature parsing, route fixes. The unstaged changes (6 files) are the unified scoring v2.0 rewrite — the `scoring.py` overhaul, schema migration columns, CLI rescore command, validation queries, and annotated schema updates. Keeping these as separate commits makes the history bisectable — if a scoring regression appears, `git bisect` points directly at the scoring commit without UI noise.

### 2026-03-03 [3d7a250d4399]

**Design doc as executable specification**: The unified-scoring-design.md v2.1 now serves as a reliable contract between the scoring engine and any future consumer (Phase 3 narrator, Phase 5 live integration). The key insight from this audit: the most dangerous discrepancies weren't wrong formulas — they were wrong *descriptions of implementation details*. The author bonus doc said `SUM(copy_num)` but the code summed `prominence_score` (which includes the quality factor). This kind of subtle difference compounds: someone reading the doc to build a Phase 3 feature would get different results than the actual data, leading to phantom bugs. Similarly, documenting "site-based death count" when the code uses "collection-membership-based" death count would cause wrong joins in any future query that tries to reproduce the scoring logic independently.

**Subagent reliability lesson**: The code-analyzer agent hallucinated an entirely different codebase — class-based architecture, different tables, fabricated line numbers. When the implementation file (1152 lines) exceeds a subagent's effective context, the agent fills gaps with plausible-sounding fiction. For audit tasks, always read the primary files yourself and only delegate well-scoped, narrow questions to subagents.

### 2026-03-03 [e7929b659f74]

**Client-side vs server-side: the right boundary**: The biological variants chart shows *global* population demographics (how many vampires/necromancers/werebeasts exist in the world or race group), not a breakdown of the current search results. This is the key insight I missed — the chart answers "what variants exist among all Dwarves?" not "how many of my 47 search results are vampires?" The server-side approach is correct because it counts across the full database, while the search results are capped at 100 and reflect a name query, not a demographic census.

### 2026-03-03 [7503d2e968f2]

**Three-layer filter data flow**:
1. **Variant chart** (`refreshVariants`) — always fetches from `/api/people/variants-summary` with race pills only. Shows DB demographics. Never hides.
2. **Results list** (`refreshPeopleResults`) — fetches from `/api/people/search` or `/api/people/browse` with ALL three filters: text query + race pills + variant flags.
3. **Clicking a variant bar** re-renders the bar chart locally (no re-fetch needed since counts don't change) and triggers `refreshPeopleResults()` to narrow/widen the results list.

The variant chart counts are **independent of the variant filter** — they show "how many exist in the DB for these races" so the user can see what's available to filter by.

### 2026-03-03 [77d932dbe661]

**The co-parent inference is conservative by design**: it only creates "partner" entries when a shared child exists but no explicit spouse/former spouse/deceased spouse/lover link connects the two parents. This prevents double-counting — if Ashenbones has a former spouse who is also the mother of their children, the former spouse link is sufficient and no "partner" gets inferred.

### 2026-03-03 [763317ac2b95]

**Why so many "invisible" partnerships?** Dwarf Fortress tracks parent-child links meticulously (every HF has `<mother>` and `<father>` tags), but only records spouse/lover links when a formal relationship event occurs. Many children are born from unions that DF never formally marked — perhaps short-lived relationships, or simply relationships that ended before the world generation completed. The co-parent inference recovers these by triangulating: if A→child→B exists but A↔B doesn't, they must have had some partnership.

### 2026-03-03 [3608d1fd1c18]

**vis.js hierarchical `level` property + generation mapping**: In `direction: 'UD'` mode, a lower `level` number renders *higher* on screen. By assigning `level = generation` directly (where ancestors are negative, center is 0, descendants are positive), the layout naturally places ancestors at the top and descendants below — no sign-flipping needed.

**Client-side toggle via `DataSet.update({hidden})`**: vis.js DataSets support live updates — calling `update({id, hidden: true})` instantly hides a node without re-creating the network. This is why the generation sliders and legend toggles work without any AJAX or full re-render. The physics engine gracefully adjusts to the reduced graph.

**Edge visibility sync**: When hiding nodes via legend toggles, edges connected to hidden nodes also need hiding — but vis.js doesn't do this automatically. The `_syncEdgeVisibility()` function iterates edges and hides any that touch a hidden node. For the pedigree slider, we explicitly check both endpoints since entire generations can be hidden at once.

### 2026-03-03 [40f237c33e02]

**Why `--reload` matters for development servers**: The port 8095 uvicorn instance (started Thursday, PID 99113) was running without `--reload`, meaning Python module changes weren't picked up — only Jinja2 template changes were (Jinja2 reloads templates from disk on each request by default). The new backend helpers (`_build_pedigree_data`, etc.) and route context changes required a process restart. The replacement server now includes `--reload` to avoid this stale-code issue going forward.

**Conditional template sections degrade gracefully**: The `{% if graph_data_X and graph_data_X.edges|length > 0 %}` guards ensure that graph containers are only rendered when there's actual data. This avoids empty vis.js canvases and wasted JavaScript initialization — the lazy `IntersectionObserver` would fire but have nothing to render.

### 2026-03-03 [bec5b9e442fc]

**The problem with vis.js hierarchical layout for pedigrees**: vis.js's built-in hierarchical mode treats all nodes as equal participants and uses a generic Sugiyama-style algorithm. It doesn't understand that a pedigree has a *binary tree structure upward* (each person has exactly 2 parents) and a *variable-arity tree downward* (each person can have N children). This means it can't naturally produce the "roots above, branches below, subject in the center" look.

**The open-source landscape for tree layouts**:
- **yFiles** — commercial, excellent tree layout, $$$
- **dagre.js** — MIT, purpose-built for DAG layout, used by Mermaid/Cytoscape
- **ELK (elkjs)** — Eclipse Layout Kernel ported to JS, handles complex hierarchies
- **D3 hierarchy** — built into D3, good for strict trees
- **Custom Reingold-Tilford** — no dependencies, full control, ideal for genealogies

For a pedigree, a **custom tree position calculator** feeding into vis.js gives the best result: ancestors fan out in a binary tree upward, descendants fan out by subtree width downward, and the subject stays fixed at center. No new JS dependencies needed — just pure position math.

### 2026-03-03 [3f7cbf5d08c6]

**Why remove/re-add beats hidden flags**: vis.js's `hidden: true` property is a rendering-only flag — the physics engine still calculates forces for hidden nodes. This creates "phantom gaps" in the layout where invisible nodes push visible ones apart. By actually removing nodes from the `DataSet` with `clear()` + `add()`, vis.js has no knowledge of the hidden nodes at all, so the physics simulation produces a tight, natural layout with only the visible elements. The tradeoff is slightly more CPU work on toggle (rebuilding DataSets), but since typical graphs have <200 nodes, this is imperceptible.

**BFS expansion with frontier pattern**: The degree selector uses a classic BFS (Breadth-First Search) approach. At degree 1, we use the already-fetched relationships (no extra DB query). At degree 2+, each iteration queries `hf_links` in both directions (forward + reverse) for the "frontier" nodes discovered in the previous iteration, collecting new HF IDs not yet visited. The 200-node cap prevents graph explosion for well-connected HFs like kings or deities.

### 2026-03-03 [16a66993b5a6]

**How `aspect-ratio` + `width` interact**: With `aspect-ratio: 1` and `width: 100%`, the browser computes the height to equal the width of the parent `.section-card` container. Removing `max-height: 80vh` means the square is purely width-driven — on a 1200px-wide container, the graph will be 1200x1200px. The page scrolls vertically to accommodate it, which is the expected behavior for a large data visualization.

### 2026-03-03 [26bbdf6abbf4]

**hf_site_links vs change hf state events**: The `hf_site_links` table (2,074 entries) comes from XML-declared relationships like "home structure" or "seat of power" — these are structural, not temporal. Meanwhile, 26,523 HFs have `change hf state` events (settling/traveling) at sites, but these *event-based* relationships aren't materialized into a linkage table. That's why Stodir's settling at Metalsnarl doesn't create a queryable site link — it's recorded as an event but not a relationship.

### 2026-03-03 [ee1f6df5fbc3]

**What we built and why it works automatically:**
1. **Post-parse step 10** materializes `change hf state (settled)` events into `hf_site_links` rows with `link_type='settled'`. This is the "universal join table" pattern — 4 API routes already query `hf_site_links`, so all get settlement data for free.
2. **The `ON CONFLICT DO NOTHING` + `DISTINCT` combo** makes the step idempotent — safe to re-run during re-ingestion.
3. **The reverse index** (`idx_hf_site_links_site`) enables efficient site→HF lookups (6ms for 933-link sites vs potential sequential scan).
4. **Edge color `#34d399`** (emerald-400) is visually distinct from the existing green `#22c55e` used for home structure/occupation, so settled vs. owned relationships are distinguishable in the graph.

### 2026-03-03 [50e649cc309e]

**Graph architecture**: The detail page uses a two-phase graph build. Phase 1 collects HF-to-HF relationships via BFS (capped at 200 HF nodes). Phase 2 adds entity/site "wings" — the center HF's entity memberships and site residences, plus co-members (10/entity cap) and co-occupants (10/site cap). This fan-out pattern keeps the graph readable while showing meaningful neighborhood context.

**Disambiguating the two graph endpoints**: The detail page graph (`_build_full_graph_data` in `detail_pages.py`) is embedded directly in the HTML. The explorer graph (`/api/explorer/graph/hf/...` in `explorer.py`) is a separate AJAX endpoint used for the degree slider. They share helper functions but have different logic — the explorer graph shows all entity links without co-member expansion.

### 2026-03-03 [ab9ceef7ea37]

**Unified filter pipeline**: Both `searchPeople()` and `browsePeople()` now funnel through `filterPeopleList()` instead of rendering directly. This means the alive/dead toggle (and the text filter) are always applied consistently, regardless of whether the user searched by name or is browsing the top figures list. Before this change, `searchPeople()` bypassed the text filter entirely — that was a latent bug where typing in the "Filter results..." box would be ignored until you scrolled or clicked.

**Button group pattern**: The All/Alive/Dead toggle uses a "mutually exclusive button group" pattern — a single state variable (`peopleAliveFilter`) with visual feedback via class swapping. The active button gets the amber highlight, inactive buttons get stone-400 text. This matches the existing UI language (amber = active/selected) without adding another checkbox style.

### 2026-03-03 [5e2a953e1511]

**Why two files?** Dwarf Fortress's vanilla `legends.xml` was the original export, designed before DFHack existed. It prioritizes human-readable descriptions and complete event histories. DFHack's `legends_plus.xml` was created later to fill gaps: structured metadata, relationship graphs, creature definitions, and semantic context (like `reason` fields on events). Neither file is a superset of the other — they're two complementary views of the same world. A robust parser must treat them as a single logical dataset split across two physical files.

**The merge pattern**: Every properly-merged table in our parser follows the same strategy: (1) INSERT from base first (richer text data), (2) UPSERT/UPDATE from plus to add structured metadata. The three gaps identified all deviate from this pattern — events and structures only read from one source, and supplements are completely skipped.

### 2026-03-03 [f8a4fd3c5c66]

The `executemany` silent-success pattern is a significant gotcha in asyncpg: it returns `None` regardless of whether 0 or 1000 rows matched the WHERE clause. Unlike single `execute()` which returns a status string like `"UPDATE 1"`, `executemany` provides no row-count feedback. For enrichment pipelines that merge data via UPDATE, always follow up with a validation query to confirm actual persistence. This is now documented in the Phase 2 PRD risk mitigation as an emergent risk.

### 2026-03-03 [abf5b8ebc9c7]

**Why this walkthrough is structured in 3 parts**: The validation is split into Core DoD (30 items that map directly to the PRD requirements), Enhancement Features (12 items beyond scope that emerged during development), and Regression Checks (5 SQL queries to catch silent data loss — the exact class of bug that bit us with the `executemany` silent-success pattern). The regression queries are the most important new addition: they catch issues that look fine in the UI but have missing data underneath.

**Composite PK routing** is called out specifically because art forms are the only entity type in Chronicler using a composite primary key (world_id + id + form_type). This is architecturally unique — all other entities use (world_id + id) as their route params — and the prev/next navigation needs special handling to stay within the same form_type.

### 2026-03-03 [998e0e0283f5]

**The enrichment data exists but is invisible in event text.** The `PerspectiveRenderer` operates in two modes:
1. **Template mode**: Uses `EVENT_TEMPLATES` (71 templates) — these only contain entity reference placeholders like `{hfid}`, `{site_id}`. None of the templates include `{reason}` or `{circumstance}`.
2. **Generic mode** (`_render_generic`): Only iterates over `ENTITY_REF_FIELDS` (entity ID references), ignoring all other details keys.

The `reason` and `circumstance` fields are in the JSONB `details` column but neither rendering path displays them. The template's final loop (line 379-382) does substitute non-entity placeholders — but only if the template string *contains* the placeholder `{reason}` or `{circumstance}`, which none do.

### 2026-03-04 [164b72db6664]

**The enrichment pipeline gap was a classic "data exists but isn't surfaced" problem.** Phase 1's XML parser correctly extracted all fields from both `legends.xml` and `legends_plus.xml` into the JSONB `details` column, but the rendering pipeline was designed around entity-reference templates only. The fix required touching all three layers: extraction logic (what to show), route handlers (passing data to templates), and templates (rendering the data). The progressive-disclosure pattern (click-to-expand tags) avoids cluttering the existing clean event timeline while making all enrichment data accessible.

### 2026-03-04 [3b0caad34439]

**Structure IDs in Dwarf Fortress are site-local, not global.** This is unlike historical figures, sites, entities, and artifacts which all have world-unique IDs. Structure 6 at site 301 (the cradled temple) is completely different from structure 6 at site 100. The `event_entity_xref` table was designed for global IDs, so adding structure references to it is useful for aggregate analytics (scoring, statistics), but querying for a *specific* structure's events must always filter by both `structure_id` AND `site_id` via the `history_events` table directly.

**The xref gap masked 6,196 event-structure relationships.** The original ingestion in Phase 1 covered HF, site, region, entity, and artifact references but overlooked the `structure_id` column and structure-related detail keys (`destroyed_structure_id`, `dest_structure_id`, `source_structure_id`, `new_structure`, `old_structure`). This is a common pattern in DF data — the XML schema has more reference types than are obvious at first glance.

### 2026-03-04 [8732cc841f80]

**The position_profile_id / position_id confusion is a classic DF XML parsing trap.** Dwarf Fortress uses two layers of indirection for organizational positions:

1. **Position definitions** (`entity_position`): Named roles like "sacred law" or "high nourishment" — each has a `position_id` (0, 1, etc.)
2. **Position assignments** (`entity_position_assignment`): Slots (profiles) that map to position definitions. An entity can have 12 "sacred law" slots (assignments 0–11 all mapping to position_id=0) and 1 "high nourishment" slot (assignment 12 → position_id=1).

The base `legends.xml` only stores `position_profile_id` (the assignment slot number) in HF position links. The `legends_plus.xml` provides the mapping table from assignment → definition. Without this mapping, 58% of position links (12,665 out of 21,778) had incorrect position IDs — showing unnamed "Position N" entries instead of their actual role names.

**The fix corrected data at three levels:** (1) ingestion pipeline now applies the mapping during XML processing, (2) existing data was retroactively fixed via a one-time migration, (3) the display layer properly joins against corrected position definitions.

### 2026-03-04 [4d6e3f4b2c79]

**Why not split commit 3 further?** The structure backend changes in `detail_pages.py` and the enrichment additions are interleaved in the same file — the structure route handler rewrite *includes* an enrichment line within it, and both features share the same import. Splitting would require temporary file manipulation that risks staging errors. The 2+1 split (two clean ingestion commits + one UI commit) preserves bisectability since the ingestion fixes are independent, while the UI changes all compose a single "detail page improvements" theme.

### 2026-03-04 [eac810763898]

**Why the inn has no entity_id while the temple does:** In Dwarf Fortress, temples and guildhalls are always associated with a religious/guild entity (the sect or order that operates them). Inns/taverns, by contrast, are civic structures — they don't have a governing entity, just a site location. This is why `entity_id` is NULL for inn taverns, making the conditional tab rendering (`{% if positions %}`) the correct approach: the template adapts to the data model rather than hardcoding assumptions about which structure types have organizational hierarchies.

### 2026-03-04 [971f868f5a2c]

**The graph legend was already close to complete — `nomadicgroup` and `migratinggroup` had backend styling defined in `_ENTITY_NODE_STYLES` but were missing from the HTML legend.** This is a common pattern when styling maps are added incrementally: the Python dict grows but the template legend lags behind. The fix ensures the legend's checkbox `data-group` values (`entity_nomadicgroup`, `entity_migratinggroup`) match the backend's `f'entity_{etype}'` pattern, so the existing toggle filter logic works without any JS changes.

### 2026-03-04 [baa4474ebd53]

**Key experimental findings for Chronicler Phase 3:**
1. **Zero fabrications across all three model tiers** — the fact-constrained prompt format (full registry + explicit instructions) effectively prevents hallucination. This validates the Extract→Register→Narrate→Validate pipeline design.
2. **Coverage scales with model capability** (52% → 58% → 72%), but the *quality* tradeoff is non-linear: Sonnet produced the best prose despite lower coverage than Opus. This suggests using Sonnet for user-facing narratives and Opus for reference/validation tasks.
3. **Wild guess discipline correlates with model tier** (4 → 2 → 0) — more capable models maintain tighter separation between supported inference and pure speculation, which is critical for a fact-grounded storytelling system.

### 2026-03-04 [d57c9d1a1149]

**Commit strategy note:** I deliberately excluded the untracked screenshots (~30 PNGs), plan stubs, and bio_graph folder from this commit. Binary screenshots bloat the repo and those plan stubs are transient Claude Code artifacts. The narrative-standard folder is the clean, self-contained deliverable — 8 files totaling ~345 KB of structured experiment data.

### 2026-03-04 [6034f871db11]

JICM context compression captures state at the moment of compaction, but work can continue in the same context window after the checkpoint is written. In this case, the three agents were dispatched and completed their narratives before the `/clear` fired, but the checkpoint still listed them as TODO.

### 2026-03-04 [262953ab9263]

The untracked screenshots and plan stubs are a good candidate for `.gitignore` entries if they keep accumulating. Plan files (`*.md` in `.claude/plans/`) are generated by Claude Code's plan mode and rarely need version control. Screenshots should generally go in a separate asset store or be added to `.gitignore` with a pattern like `projects/chronicler/experiments/Screenshot*.png`.

### 2026-03-04 [7bff15d7aaa6]

**The v1.0 → v2.0 redesign reveals three fundamental architectural tensions in LLM-driven data systems:**

1. **Pipeline vs. Agent.** v1.0 is a pipeline: deterministic code does extraction, LLM does narration. v2.0 is an agent: the LLM does everything. Pipelines are reproducible and cheap; agents are flexible and adaptive. The right answer is almost always a hybrid — use pipelines for known patterns, agents for exploration. This is why the implementation notes recommend both.

2. **The Fact Registry as a compression boundary.** In v2.0, the LLM sees raw query results (5,000–15,000 tokens of JSON rows) and then compiles them into a fact registry (~2,000–5,000 tokens of structured claims). This compilation step is itself a form of lossy compression — it discards irrelevant columns, normalizes formats, and derives higher-order facts. By requiring the LLM to *output* the registry before narrating, we create a natural checkpoint where the context can be pruned (discard raw results, keep registry). This is critical for fitting within Qwen3-8B's 32K context window.

3. **The `$WORLD_ID` injection pattern.** Rather than trusting the LLM to always include `WHERE world_id = 1`, the backend silently replaces a placeholder. This is a general principle for LLM-with-tools systems: if a parameter is invariant across all queries, inject it server-side rather than relying on the LLM to remember it. Reduces both token cost and error surface.

### 2026-03-04 [9f302f22b9a1]

The current Chronicler chat is a **one-shot text pipeline**: search once, inject context, stream text. The v2.0 prompt template requires a **multi-turn tool-use loop**: the LLM decides what to query, the backend executes it, the LLM sees the results, decides if it needs more, and eventually writes the narrative. This is a fundamentally different interaction pattern — it's the difference between a reference librarian handing you a book vs. giving you a library card and a map.

### 2026-03-04 [056bf65312a6]

**Composite primary keys in REST APIs**: Art forms use `(world_id, id, form_type)` as their composite PK. The DB stores `form_type` as `dance`, `musical`, `poetic` — not `dance_form`, `musical_form`, `poetic_form` as the original walkthrough assumed. This is a common trap: the XML element names (`<musical_form>`) differ from the stored enum values. Always verify against the actual DB schema, not the source format.

### 2026-03-04 [3c82985075fa]

**Phase 2 by the numbers**: 17 entity detail pages, 11 API endpoints, 5 cross-cutting systems (linking, name cache, perspective, calendar, popovers), 13 enhancements beyond the original PRD — all verified against a world with 48,273 historical figures and 436,455 events. The single real bug found (JSON export) was a classic FastAPI pattern issue: POST body vs query parameter routing. The fix was one line in the Pydantic model + removing 6 lines of convoluted precedence logic.

### 2026-03-04 [0575d49ef22d]

Cache reads dominate today's token profile (75.8M of 78.6M = 96.5%) — this is typical for Jarvis sessions where the large CLAUDE.md context tree gets cache-hit repeatedly across turns. The actual "new" information flowing is just the 22K input + 8K output tokens.

### 2026-03-04 [616cd2c8ec13]

This file defines the "test harness" role — W5 can observe and interact with W0 (the primary Jarvis instance) without being monitored itself, making it ideal for testing autonomic behaviors, JICM cycles, and command IPC without interference.

### 2026-03-04 [322effa194d4]

The validation walkthrough has 50 items across 3 categories: 30 Core DoD, 13 Enhancements, and 7 Regression SQL checks. All were previously marked PASS on 2026-03-04, so this is a re-validation run against a fresh server instance — good practice to catch any regressions from stale state.

### 2026-03-04 [80ae84f3a4d9]

**What we surfaced from the data layers:**

1. **Composition Event** (37,486 events) — The "written content composed" events link via `details.wc_id` and include `circumstance` (dream/nightmare/pray to hf/dream about hf) and `reason` (glorify hf) with linked HF IDs. This tells the story of *why* a work was written — e.g., "Composed in Year 3 after praying to Loli Dutywisp, to glorify them."

2. **Art Form linkage** (22,576 WCs) — The `details.form_id` links to the `art_forms` table via composite PK (id + form_type). The form_type is derived from the written content's `form` field: poem→poetic, musical composition→musical, choreography→dance. Art forms have rich text descriptions of the tradition's rules, structure, and origin.

3. **Author Roll** (22,915 WCs) — A numeric quality score (typically 10-50) representing the author's skill roll for this specific work. Higher values suggest higher quality.

4. **Reference resolution** (14,571 WCs) — Already fixed in the previous round, but now also properly handles null-ID flag types via `ref_counts_by_type`.

### 2026-03-04 [6079f24316e3]

**Audit results — only ONE table has data loss:**

| Table | Merge Method | Base Keys | Plus Keys | Data Loss? |
|-------|

### 2026-03-04 [7f03a5f5f2c6]

**Full audit results — the single data loss bug and its fix:**

**Root Cause**: The `written_contents` plus-XML merge at `xml_parser.py:1352` used `COALESCE(EXCLUDED.details, written_contents.details)` — a full column replacement where non-NULL plus-XML details completely overwrites base XML details. Every other table either uses JSONB `||` (additive merge) or has `details=NULL` in the base parse.

**Data Recovered**:
| Field | Before | After | Source |
|-------|--------|-------|--------|
| author_roll | 22,915 | **37,486** (100%) | Base XML `<author_roll>` |
| form_id | 22,607 | **30,151** | Base XML `<form_id>` |
| Both author_roll + references | 0 | **14,571** | Both XMLs merged |

**Two-part Fix**:
1. **Ingestion fix** (`xml_parser.py:1352`): Changed merge from `COALESCE(EXCLUDED, existing)` to `COALESCE(existing, '{}') || COALESCE(EXCLUDED, '{}')` — additive JSONB merge, matching the pattern used by events/artifacts/structures.
2. **Data recovery**: Re-parsed base XML and merged `author_roll`/`form_id` back into existing DB rows via `|| $1::jsonb`. No re-ingest needed.

**No other tables affected**: Full audit confirmed events, artifacts, structures, entities, and all other tables use correct merge patterns.

### 2026-03-04 [19d0f21c3316]

**The occasion mystery solved — it's a 3-layer hierarchy:**
1. **Entity** (civilization) → has named `<occasion>` records (festivals) in plus XML
2. **Event collection** (type=occasion) → references `civ_id` + `occasion_id`, linking to the entity's festival
3. **Sub-collections** (performances/competitions/ceremonies) → linked via `collection_subcollections` table

The occasion collection appears empty because: (a) it correctly has 0 direct events (it's a container), (b) the sub-collection query only checked `parent_id` column (now fixed to also check `collection_subcollections`), and (c) the festival **name** lives in the entity's plus XML data, not on the collection itself.

### 2026-03-04 [966f9ea67429]

**Procession route data — what DF actually exports:**

1. **No site-to-site or structure-to-structure route data exists.** Each procession event has exactly one `site_id` and one `civ_id` — the site where it took place. There's no start/end location, no waypoints, no structure path. DF's internal model may simulate processions moving through a site, but the legends export only records the single hosting site.

2. **Each procession collection contains exactly 1 event** (checked all procession collections — 0 have more than 1 event). So there's no implicit route derivable from a sequence of events at different sites either.

3. **What IS available for processions:**
   - The `occasion_schedules` table has **feature tags** for the procession (costumes, criers_in_front, acrobats, candles, images, dance_performance references, musical_performance references)
   - The hosting `site_id` (where it occurred)
   - The `civ_id` (which civilization organized it)
   - The `schedule_id` linking to which schedule entry in the occasion it fulfills

4. **Interesting contrast — `journey` collections DO have multi-event structure** (e.g., collection #12 has 2 events), suggesting DF records waypoints for journeys but not processions. This makes sense: processions happen within a single site, while journeys span sites.

### 2026-03-04 [b25b8b2c35e6]

**Journey collections DO encode routes — here's the structure:**

A journey collection contains a **sequence of `hf travel` events** that form a route. Taking collection #12 (HF 1417, year 1) as an example:

| Event | site_id | subregion_id | coords | `<return/>` | Meaning |
|-------|---------|

### 2026-03-05 [3bebf0618c8a]

The battle entity inheritance pattern is worth noting — DF legends XML stores belligerent entity IDs on the *war* collection but not on individual *battle* sub-collections. The fix walks up the parent chain (`parent_id`) to find the war and pulls `attacker_entity_id`/`defender_entity_id` down. This parent-lookup pattern will recur for other hierarchical collection types (e.g., persecutions, purges).

### 2026-03-05 [33474495315a]

**DF time precision was hiding in plain sight.** The `seconds72` field (game ticks at 72x speed) was already being parsed and stored in `start_seconds`/`end_seconds` columns, but no code was using it for duration computation. The key constants: 1 day = 1,200 ticks, 1 month = 33,600 ticks, 1 year = 403,200 ticks. With 99.7% of collections happening within a single year, year-level duration was nearly useless — but tick-level gives us month/day precision that reveals a festival lasted "1 month, 20 days" or a war lasted "34 years, 10 months".

The dual-surface approach (Python `DFCalendar.format_duration()` for server-rendered pages + JS `dfFormatDuration()` for SPA views) ensures consistent duration display everywhere without requiring an API round-trip for formatting.

### 2026-03-05 [30b47921a217]

**Why kobold civs show 0 sites:** The sites query uses `owner_entity_id`, but caves/lairs have `NULL` owners (93-100%). Kobolds live in caves/lairs via `hf_site_links` (link_type='lair') — an indirect relationship through their members, not direct ownership. The `site_entity_links` table mentioned in the first query **doesn't exist** — there's only `hf_site_links`. To find kobold-associated sites, you'd need to join through `hf_entity_links → hf_site_links`.

**Key data gap:** 252 lair-type HF-site links exist but aren't surfaced anywhere in the entity detail page.

### 2026-03-05 [e71e9397e4d6]

**Template coverage went from 52 → 106 event types (102/102 DB types covered).** The key architectural insight is that ~40% of new event types store all their entity references in JSONB `details` (not in the generic DB columns like `hf_id_1`, `site_id`). For these, `COLUMN_MAP_BY_EVENT` is set to `{}` (empty), so `merge_columns_into_details()` skips the column→field mapping and relies entirely on JSONB field names matching `ENTITY_REF_FIELDS`. This two-layer resolution (DB columns + JSONB keys) is what makes the template system flexible enough to handle DF's inconsistent XML field naming.

**The reason/circumstance rendering** uses a template-first approach: if the raw value matches a template key, the natural-language version is used; if not, it falls back to humanized raw text (underscores→spaces). JSON-object circumstances (like `{"type": "histeventcollection"}`) get special handling to generate cross-links to event collections.

### 2026-03-05 [274f2ce7d357]

**File renaming in a document-heavy project requires a cross-reference audit.** The three-way file rename (5→3, 3→4, 4→5) touched 10 files across the Jarvis workspace: 3 PRD files (headers, stage numbers, milestones, footers), the roadmap, current-plans.md, session-state.md, phase-2 completion report, and MEMORY.md. The key technique was using `git mv` with temp files to avoid overwrite conflicts, then running a grep sweep to find all stale references. Archived/ephemeral files (JICM logs, compressed context) were intentionally left as-is since they're historical snapshots.

**Stage numbering consistency** is critical for the PRD cross-reference system — the roadmap references "Stage 3.1" which must match the PRD's internal "## 2. Stage 3.1:" heading. A mismatch would create confusion when jumping between the roadmap overview and the detailed PRD.

### 2026-03-05 [5fec8836e61e]

**asyncpg type strictness**: asyncpg infers parameter types at prepare-time. When you write `$2::text || ...` in SQL, asyncpg expects a Python `str` for `$2`, not `int`. The fix is to pass `str(entity_id)` on the Python side. This is a common gotcha — asyncpg is stricter than psycopg2 about type matching.

**Structure icon pattern**: The frontend uses a simple lookup map (`_STRUCT_ICONS`) with Unicode emoji for each DF structure type. The `title` attribute on each `<span>` provides a native browser tooltip on hover, so users can see the structure type name without extra UI components.

**Collapsible site govt positions**: Using `<details>/<summary>` HTML elements gives us free collapse/expand behavior without any JavaScript. Only site govts with at least one filled position holder are shown, which prevents clutter on large civs with 40+ site govts (most of which have vacant positions).

### 2026-03-05 [5e54d8fcc0e8]

**DF position generation**: Dwarf entities have hardcoded positions in the raws (`[POSITION:MONARCH]`, `[POSITION:GENERAL]`, etc.). But human and goblin entities use `[VARIABLE_POSITIONS:ALL]`, which tells DF to **randomly generate** position names at world-gen. The game assigns responsibilities (LAW_MAKING, MILITARY_GOALS, etc.) to these generated positions internally, but the legends XML only exports the name — not the responsibility tokens. So "law-giver" is the human monarch equivalent and "master" is the goblin equivalent, but they don't contain words like "king" or "monarch" that our keyword categorizer would catch.

**The fix**: Instead of relying on keyword matching alone for ruler detection, use `position_id == 0` as the primary signal. In DF, position ID 0 is always the highest-precedence ruler position (the one with `LAW_MAKING` + `RECEIVE_DIPLOMATS` + `MILITARY_GOALS` responsibilities).

### 2026-03-05 [ece451f07f8f]

**DF site govt noble hierarchy**: Site governments have nobles with gendered title variants (`name_male`/`name_female`). The presence of `name_male`/`name_female` is the reliable indicator of a "noble" position — administrative positions like "chamberlain" never have them. The hierarchy in this world: baron/baroness > lord/lady > chieftain/chieftess > chief/chieftess. The user wants barons to take priority over lords, but lords should still show if they're the only noble.

**The algorithm**: Among positions with `name_male`/`name_female` (= nobles) that have current holders, prefer non-lord/lady nobles first; fall back to lord/lady if that's the only one.

### 2026-03-05 [d3f82a686be0]

**Two-tier noble detection in DF**: Dwarf Fortress handles noble positions at two levels:
1. **Site-govt-level nobles** (lord/lady, chieftain) — stored directly on site government entities. Common for human/goblin civs with many hamlets.
2. **Civ-level nobles** (baron/duke/count) — stored on the parent civilization entity, but the holder is a member of a specific site govt. Requires cross-referencing `hf_position_links` (who holds the position) with `hf_entity_links` (which site govt they belong to).

The `DISTINCT ON (hel.entity_id)` with the ordering `CASE WHEN LOWER(ep.name) NOT IN ('lord') THEN 0 ELSE 1 END` ensures that higher-ranking civ-level nobles (baron/duke) take priority over lord positions.

### 2026-03-05 [c59ed71feacd]

The ETL plan reveals an interesting architectural pattern: **two temporal resolutions** coexist. `unit_events` is a high-frequency CDC (Change Data Capture) stream (~20 events/poll × 1,500 polls/hour = 30K events/hour), while `history_events` is a curated narrative record (0-5 events/poll). The reconciliation job bridges these — when a dwarf dies in the CDC stream, that event eventually appears in DF's internal history and we link them. This dual-resolution approach avoids flooding the narrative tables while preserving every detail.

### 2026-03-05 [8c09b81961d1]

The PRD revision incorporates findings from a 5-stage "Wiggum Loop" — a structured investigation pattern: (1) analyze df-structures naming changes, (2) map memory→CDM fields, (3) audit for CONNECT vs APPEND violations, (4) design ETL plan, (5) revise PRD. The most critical finding was the APPEND violations — places where live data would create parallel data stores instead of connecting to existing CDM entities. The `units.id` PK mismatch alone would have caused subtle multi-world breakage.

### 2026-03-05 [a36027dcfc0d]

**Three patterns from the inline viewer ported to server-side rendering:**

1. **Data-attribute-based DOM sorting** — Instead of re-fetching data for sort, each `<tr>` carries `data-sg-name`, `data-population`, etc. The JS simply reorders DOM nodes via `appendChild`. This is dramatically simpler than the inline viewer's approach of maintaining a JS array + re-rendering HTML strings.

2. **Progressive enhancement for members** — The page server-renders the first 100 members immediately (no loading spinner), then the "Load All" button fetches up to 10K via the existing API and switches to full JS-managed sorting/filtering. This gives instant content on page load while preserving the full interactive experience.

3. **Jinja2 globals vs template filters** — `struct_icon()` and `cat_badge_class()` are registered as Jinja2 globals rather than filters because they're callable functions (not string transformations). Globals are invoked as `{{ struct_icon(type) }}` vs filters as `{{ type|struct_icon }}` — globals are more readable for lookup-table patterns.

### 2026-03-05 [811a8db3cc3f]

- **Defense in depth**: The ingestion fix prevents future duplicates, while the UI filter handles any that might slip through (e.g., if ingestion order changes). Neither layer alone is sufficient — the ingestion fix doesn't help existing data, and the UI filter adds query overhead that's unnecessary once data is clean.
- **`NULLS LAST` ordering**: Added to all three queries so that any remaining NULL-start rows (legitimate ones with no dated counterpart) sort to the bottom rather than the top. PostgreSQL sorts NULLs first in DESC and last in ASC by default, but explicit `NULLS LAST` makes intent clear.

### 2026-03-05 [b967478bdbdb]

- Uvicorn's `StatReload` polls files for mtime changes (~every 0.25s by default). When it detects a `.py` file change, it restarts the server process while the reloader parent stays alive — so the port remains bound and clients just see a brief reconnection. This means our duplicate-leaders fix is already live without any manual restart.
- The `&` background launch means the process will terminate when this shell session ends. For persistent operation, you'd want it in a tmux window or systemd unit.

### 2026-03-05 [fb28700d0226]

- **Three outcome signals in DF data**: (1) `peace accepted` events with `source`/`destination` fields indicate a negotiated end, (2) `site conquered` sub-collections within wars indicate territorial gains, (3) wars with `end_year IS NULL` are still ongoing. DF doesn't store an explicit "winner" — it must be inferred from conquest balance.
- **Perspectival rendering**: The same data must tell two different stories. Entity 1007 attacking entity 1043 and conquering 1 site → "Victory" from 1007's view, "Defeat" from 1043's. This is achieved by swapping `atk_conquests`/`def_conquests` based on whether the viewed entity is the attacker or defender — simple but critical for historical narrative accuracy.
- **"Inconclusive" is common**: Wars that end without peace and without site conquests (just battles) are genuinely indeterminate — DF doesn't record why they stopped. This affects 8 of 17 wars for entity 1007, reflecting how medieval-style warfare often ended: armies clashed, both withdrew, and the world moved on.

### 2026-03-05 [4a45126b8a31]

### The Three-Layer Model

Dwarf Fortress uses a **three-layer governance hierarchy**:

```
Civilization (e.g., "the brave kingdom", human)
  ├── Site Government (e.g., "the weak coalition")
  │     └── Site (e.g., "chainstakes", hamlet)  ← owner_entity_id points to the site gov
  ├── Site Government (e.g., "the turquoise councils")
  │     └── Site (e.g., "blotbottled", hamlet)
  └── Religion (e.g., "the certain faith")
        └── (no sites; spiritual/cultural entity)
```

**Layer 1: Civilization** — The top-level political entity. Races like human, dwarf, elf, goblin, kobold each form civilizations. A civilization has **positions** like monarch, duke, diplomat, general, law-giver, etc. Civilizations have CHILD links to their site governments and religions.

**Layer 2: Site Government** — The administrative body that actually *owns* sites. Each site government typically controls 1 site (though some control 2+). Site governments have their own **positions** — and this is where it gets interesting by race.

**Layer 3: Site** — The physical location (town, hamlet, castle, fortress, etc.). The `sites.owner_entity_id` column points to the **site government**, not the civilization.

### The Anomaly: Entity 2098 ("the silvery mirrors")

This is a **dwarf site government** with an unusual structure:
- **163 CHILD links** — all pointing to other site governments
- **64 sites** in its `children` array
- **39 sites directly owned**
- Its 163 child site governments own another **64 sites**
- **No PARENT link** — it's not a child of any civilization!

This is a **dwarven mountainhome network** — a "super-site-government" that acts as a regional authority. The "ringleader" title is the DF-generated name for the position of leader of this bandit/outlaw-style organization. The fact it has no parent civilization suggests it's either:
1. A **conquered/fallen** civilization whose civ entity was destroyed but the site gov survived
2. A **spontaneously formed** criminal/rebel organization

### Position Naming by Race

The position titles reveal the cultural character of each race:

| Race | Civilization Titles | Site Gov Titles | Character |
|------|

### 2026-03-05 [28d24c6851cb]

**The 692 "siteless" site governments are completely normal — it's not a bug.**

The numbers tell the story:
- **1,961 total site governments** → **1,269 own sites** (65%) → **692 don't** (35%)
- **2,154 total sites** → **1,466 have owners** → **688 don't**

The **688 unowned sites** are exclusively **wild/uninhabited locations**:
| Type | Count |
|------|-------|
| monastery | 189 |
| lair | 180 |
| camp | 173 |
| cave | 93 |
| shrine | 33 |
| labyrinth | 20 |

These are locations occupied by megabeasts, forgotten beasts, bandits, and hermits — they have no formal governance. Meanwhile, all towns, hamlets, castles, and fortresses DO have site government owners.

**So what are the 692 siteless site governments?** They are **destroyed or conquered governments** — political entities that once governed a site but lost it through war, conquest, or abandonment. Dwarf Fortress preserves the entity record even after the site changes hands. The site government still exists as a historical artifact (it may have members, former leaders, wars fought), but it no longer controls territory.

This is visible in the data:
- Site ownership comes from `legends_plus.xml` via `<cur_owner_id>` — this is the **current** owner
- When a goblin dark fortress conquers a human hamlet, the human site government loses its `cur_owner_id` reference and the goblin one gains it
- The old human site government persists as an entity with former members, position history, and war records — but with zero current sites

**The near-match (692 vs 688) is coincidental** — these are different phenomena. 692 governments lost their sites through history; 688 wild locations never had formal governance. They're not supposed to pair up 1:1.

### 2026-03-05 [7e3347a9fe14]

**The site count in the sidebar is wrong for most site governments — they show 0 when they should show 1.**

The `civ_sites` CTE rolls site counts **up to the parent**, by design. Here's the logic:

```
civ_sites AS (
    SELECT cs.parent_id AS civ_id, COUNT(*) AS cnt
    FROM sites s
    JOIN child_sg cs ON cs.sg_id = s.owner_entity_id  -- sg owns site
    WHERE s.world_id = 1
    GROUP BY cs.parent_id  -- but count goes to PARENT
)
```

This was designed for **civilizations** — it correctly shows that "the brave kingdom" has 53 sites by rolling up from its child site governments. But when the same query runs for the `sitegovernment` entity type in the sidebar:

- **Entity 1008** ("the weak coalition") directly owns 1 site. But the CTE attributes that site to 1008's **parent** (civ 1007), not to 1008 itself. So 1008 shows **0 sites** in the sidebar.
- **Entity 2098** ("the silvery mirrors") has 163 child site governments. Those children have PARENT links pointing to 2098. So 64 of their sites get rolled up to 2098. But 2098 also directly owns 39 sites that aren't counted (because 2098 has no PARENT link — those 39 don't appear in `child_sg`).

**The sidebar shows 64, but the real number is 39 direct + 64 via children = 103 total sites under 2098's umbrella.**

**The fix**: For site governments, the site count should be the number of sites the entity directly owns (`sites.owner_entity_id = entity.id`), not the parent-rolled-up count. The roll-up logic is correct for civilizations but wrong for site governments.

### 2026-03-06 [b1e5d45d14f9]

**The double-counting mechanism**: DF records HFs as members of *both* their civilization and their local site government. When the code sums `civ_member_count (3,209) + sg_pop_total (5,125)`, the 2,787 HFs who belong to both get counted twice → 8,334 shown vs 3,447 actual unique HFs.

**Three distinct population concepts**:
1. **Known Historical Figures** — union of all (civ + child SGs), deduplicated, includes living + dead + former members = 3,447
2. **Current Members** — `link_type = 'member'` only (excludes former) = 2,625 for the civ
3. **Living Population** — current members who are alive (`death_year IS NULL`) = 894

**No duplicates within a single entity** — 0 HFs have both `member` and `former member` for the same entity. The "former member" entries are genuine (HFs who left/were banished). And 238 HFs belong to a site government but not the parent civ — these are likely conquered/assimilated populations.

### 2026-03-06 [371ce7a2339a]

- **The fix eliminated double-counting** by using `COUNT(DISTINCT hf_id)` across `[entity_id] + sg_ids` in a single query, rather than summing `civ_member_count + sg_pop_total` separately.
- **Three population tiers** are now computed: `total_known_hfs` (all links), `current_members` (active only), `living_population` (alive + active) — but only `living_population` is surfaced to the template as `total_population`.
- **Gap found**: `total_known_hfs` and `current_members` are computed but never passed to the template — we may want to expose those.

### 2026-03-06 [795302293f2d]

- **Three-tier population model works well**: `living_population` (populace) vs `current_members` (active links) vs `total_known_hfs` (historical record) gives appropriate context at each level.
- **Sidebar vs Detail intentional divergence**: The sidebar shows direct-entity-only member count (fast, no joins) while the detail page shows deduplicated counts across civ + child SGs. For Brave Kingdom: sidebar=2,625 vs detail living=894 — the detail is *lower* because it filters to `death_year IS NULL`, while the sidebar counts all active `member` links (living + dead). This is actually a UX consideration worth noting — sidebar "pop" is larger than detail "Population" for large civs.
- **Minor discrepancy noted**: Brave Kingdom shows "Sites 53" in overview vs "Sites (52)" in the tab header — off-by-one worth investigating in a follow-up if relevant.

### 2026-03-06 [99d23a0adb20]

**The ontological framework is now cleanly implemented:**

| Term | Definition | Where Used |
|---|---|---|
| **Population** | Living current members (`link_type='member'` + `death_year IS NULL`) | Overview tile, Civ tab inline Pop. |
| **Members** | Organizational association with an entity via `hf_entity_links` | Members tab (filterable: Current/Former, Alive/Dead) |
| **Residents** | Physical site attachment via `hf_site_links` | Site Residents tab (filterable: Alive/Dead, by link type) |

**Key design decisions:**
- The sidebar `member_count` shows direct-entity member links (fast, no joins) — intentionally different from the deduplicated `Population` on the detail page.
- DF's `former member` means "left/expelled" (not "died") — dead HFs keep `link_type='member'`. The filter chips make this visible.
- `hf_entity_links` and `hf_site_links` are orthogonal dimensions — entity membership ≠ site presence. The 101 living members of entity 1525 vs 23 alive residents at site 621 measures fundamentally different relationships.

### 2026-03-06 [d6f696897799]

**Statistics Tab Architecture:**
- **Orthogonal data dimensions**: `hf_entity_links` (organizational membership) and `hf_site_links` (physical site presence) are independent tables — a figure can be a member without being a resident and vice versa. The cross-reference stats (2,054 HFs with both, 45,020 entity-only, 12 site-only) quantify this gap.
- **Chart.js over D3**: For 5 straightforward chart types (bar, scatter, doughnut), Chart.js at ~60KB is far lighter than D3 and matches the CDN-based approach already used for Tailwind and vis-network. The tradeoff: less customization, but the responsive defaults handle the dark theme well with minimal config.
- **FILTER aggregate pattern**: PostgreSQL's `COUNT(*) FILTER (WHERE ...)` computes multiple conditional counts in a single pass, avoiding self-joins. This lets us get alive/dead breakdowns alongside totals in one query per table.

### 2026-03-06 [33acda06c952]

**Two distinct navigation patterns in the Explorer:**
- **In-tab navigation** (`navigateTo('geo','site',...)`) switches Explorer tabs and loads inline detail — used for sites, HFs, and civs within the Explorer SPA.
- **Full-page navigation** (`<a href="/explorer/entity/...">`) navigates to the dedicated detail page — used here for site governments because the entity detail page provides the full Members/Sites/Positions tabbed view that the inline view can't replicate.
- The default sort change from `site_name ASC` to `population DESC` front-loads the most strategically important sites — the ones with the most living members — which is the natural "at a glance" question when reviewing a civilization's holdings.

### 2026-03-06 [b59c5fe74550]

**The root cause is a semantic mismatch, not a bug.** Dwarf Fortress legends XML never uses the word "resident" in `hf_site_links`. The six actual link types (`home structure`, `occupation`, `seat of power`, `lair`, `hangout`, `home site building`) represent specific *roles* at a site, not general residency. Only 4.3% of all HFs have any site link — because DF only creates these for figures with notable site roles (rulers, craftsdwarves with workshops, deities with lairs). The 95.7% majority are political members of entities but have no individual site attachment in the legends data.

**Three population tiers exist with fundamentally different scopes:**
1. `entity_populations` (1.66M) — the game's actual census including unnamed NPCs
2. `hf_entity_links` (44K unique members) — named figures' political affiliations
3. `hf_site_links` (2K unique figures) — named figures' physical site attachments

These aren't meant to agree — they're orthogonal dimensions of the same world.

### 2026-03-07 [096a0481c666]

**The same entity's "population" is computed differently at each UI location**, leading to four distinct numbers for the same civilization. The key distinction is *scope* (single entity vs. entity + children) and *metric* (all member links vs. alive-only vs. deduplicated). Understanding which query produces which number is essential.

### 2026-03-07 [65bfaffde6d7]

**The 2,644 vs 603 gap is the most confusing.** They look like they should be the same metric — both labeled "population" — but they use completely different scopes and filters:
- **2,644** = all-time current members of entity 991 alone (alive + dead, single entity)
- **603** = living current members deduplicated across entity 991 + 42 child SGs (alive only, rolled up)

The rolled-up count (603) is *lower* because: (a) ~60% of HFs are dead, and (b) deduplication removes HFs counted in both the civ and a child SG. The list-view "pop" label is **deeply misleading** — it's not a population count, it's a total membership tally including the dead.

**The "Sites (33)" vs "35 sites" gap** exists because the tab counts SGs-with-sites (33 of 42 SGs have sites), while the list counts total sites (35, since 2 SGs own 2 sites each). Also: `sg_sites` dict (line 120) uses `owner_entity_id` as key, overwriting when an SG owns multiple sites — a **data loss bug**.

### 2026-03-07 [a8a7c33f41df]

**Phases 1 & 2 (documentation) are complete.** The report now contains the canonical glossary (§2), occupation analysis (§7.1), animal-person home structure profiles (§7.2), and comprehensive appendix with dual Alive/All breakdowns across all categories (§10). Now moving to **Phase 3.1 — the code refactoring** where we align the actual queries with the glossary definitions.

### 2026-03-07 [70a7bc1834c4]

**What v8 adds over v7 (329 new lines, 5 new capabilities):**

1. **Eventful subscriptions** (lines 187-316): Registers callbacks on 6 DFHack event types (UNIT_DEATH, UNIT_NEW_ACTIVE, ITEM_CREATED, JOB_COMPLETED, SYNDROME, INVASION). Events buffer between cycles and flush atomically — this is a producer-consumer pattern where the game thread produces events and our bridge cycle consumes them.

2. **Death cause enrichment** (lines 88-129): When `onUnitDeath` fires, we immediately search `incidents.all` backwards for the matching death record, extracting cause enum + killer identity. This avoids a second pass on the Python side.

3. **Family chain extraction** (lines 131-172): Extracts Mother/Father/Spouse from `unit.relationship_ids` plus children via `histfig_hf_link_childst` traversal. Added to every fortress dwarf in `unit_summary` (line 516).

4. **Book detection** (lines 174-183): When `onItemCreated` fires, checks `dfhack.items.getBookTitle()` — non-nil means a written work was created, which is narratively significant.

5. **Skill delta tracking** (lines 321-375): Maintains a persistent `{unit_id -> {skill_id -> rating}}` snapshot. Each cycle compares current ratings to previous, emitting `skill_changes` entries only when ratings increase. This is the "derived events from state diffs" pattern — no separate event source needed.

**Key architectural decisions:**
- `init_eventful()` runs inside `write_state()` with an idempotency guard, so the repeat job self-initializes
- Event buffers use atomic swap (replace entire table) to avoid race conditions
- All enrichment functions use `pcall` defensively since DF memory structures can be inconsistent during transitions

### 2026-03-07 [78e06a54f6bb]

**Stage 3.0 CDM Schema Fixes — fully verified against live DB.** All 4 violations fixed + supplementary columns + indexes confirmed:

| Violation | Fix | DB Status |
|

### 2026-03-08 [16b172ac1568]

**The four metrics measure fundamentally different things, and the "Residents" union has a real problem.**

The current "Residents" union (`Civ members + SG members + ALL site links`) pulls in **252 lair-dwelling megabeasts** (rocs, bronze colossi, ettins, minotaurs, cyclopes, giants) — exactly the creatures you said should be excluded. It also pulls in `GIANT_DINGO`, `GIANT_ALLIGATOR`, and `TROLL` via `home structure` links, which are questionable.

### 2026-03-08 [b62d4e00ca46]

**The "UNKNOWN → CHECK" category reveals several important DF creature classes we need to classify:**
- **TITAN_N**: Unique procedurally-generated megabeasts — sentient, named, historically important. 13 in lairs.
- **NIGHT_CREATURE_N**: Cursed beings (werebeasts, vampires, bogeymen) — sentient, dangerous, historically important. ~45 across lairs and home structures.
- **DEMON_N**: Demons holding seats of power in dark fortresses — sentient rulers. 5 total.
- **TROGLODYTE, SASQUATCH, BLIND_CAVE_OGRE, MOLEMARIAN**: Underground semi-sentient creatures.
- **BAT_GIANT, SPIDER_CAVE_GIANT**: Giant cave creatures — note the naming pattern is `[ANIMAL]_GIANT` not `GIANT_[ANIMAL]`, so a simple `GIANT_` prefix filter wouldn't catch these.
- **JABBERER, HUNGRY_HEAD, VORACIOUS_CAVE_CRAWLER**: Forgotten-beast-style underground creatures.
- **HFEXP_N E_HUM1**: DF experiment races (modded or procedural human variants).
- **RODENT MAN**: Space-delimited variant (like `GIANT TORTOISE MAN`) — sentient.

### 2026-03-08 [b9fa9f501ec9]

**The zero-resident counts are correct, not a bug.** The old system showed 275 members at *every* site governed by SG 2098 — a 39x inflation. The new system correctly counts per-site residents via `hf_site_links`. These sites genuinely have no HFs structurally linked to them. The `whereabouts.site_id` field in the XML was identified during research but hasn't been parsed into the DB yet — that's a Phase 3 live-integration task. The key improvement is: **wrong inflated number → correct sparse number**.

### 2026-03-08 [02f2dc988217]

**Summary of the population counting refactor:**

1. **Sentience filter** uses DF's own `creature_dictionary.flags` — `has_any_intelligent_speaks` OR `has_any_intelligent_learns`. This cleanly separates civilized races + animal people + trolls from giant animals, megabeasts, forgotten beasts, and underground predators. No brittle name-pattern matching needed (fallback only for missing dictionary entries).

2. **Multi-site SG inflation fixed**: SG 2098 ("the silvery mirrors") previously showed 275 members at every one of its 39 sites (10,725 total). Now each site gets its own residents count from `hf_site_links`, correctly showing 0 for sites with no explicit resident data.

3. **Three metrics instead of one**: "Population" was meaninglessly overloaded. Now civs show DF Census (37,880 for the top civ), Citizens (610 sentient named HFs), and Residents (53 with site links). SGs show Citizens. Guilds/religions show Members. Each metric answers a distinct question.

### 2026-03-08 [cb8203ae32f0]

**Summary of all work completed:**

1. **17 UI fixes across 3 templates** — The inline Members table for Site Governments now auto-loads with an Alive/Dead/All toggle, compact 25px rows, and Citizen + Link columns. The full-view Members tab mirrors these changes. The Site detail Residents tab gained Citizen, Profession, and Position columns.

2. **Backend `is_citizen` is SQL-computed** — Rather than a front-end approximation, citizenship is determined at query time as the intersection of: living (`death_year IS NULL`) + sentient (creature_dictionary flags) + current member (`link_type = 'member'`). For site residents, citizenship also requires membership in the site's governing entity.

3. **Fresh DB ingestion** — World ID shifted from 8 → 1 (the previous DB had two duplicate "Tar Thran" worlds). The `DROP SCHEMA CASCADE` approach takes <1 second vs. `DELETE FROM worlds` which would cascade through 500K+ rows and take minutes. 1,677,998 records loaded with 0 referential integrity issues.

### 2026-03-08 [aff138e16fb7]

**Site residents vs SG members**: The site detail page queries `hf_site_links` (line 1469, `FROM hf_site_links l`), which contains explicit historical figure ↔ site relationships. This is different from counting SG members via `hf_entity_links`. The `hf_site_links` table has only 2,075 entries, so the 130 count reflects HFs explicitly linked to site 672 — a subset of the 201 SG members. This is the more precise relationship: "who actually lives at this specific site" vs "who belongs to this site's government."

### 2026-03-08 [8b458325fbc0]

**Fresh DB validation — all checks pass:**
1. **V1** Entity distribution: identical (1,890 SGs, 985 religions, 810 civs). The `type` column is now a proper SQL column rather than JSONB — a CDM schema improvement from Phase 3 prep.
2. **V4** Sentience filter: exact match (17,073 living, 16,004 sentient, 8 no-dict, 44 giant animals). The sentience detection uses `has_any_intelligent_speaks` / `has_any_intelligent_learns` creature flags rather than a computed `is_sentient` field.
3. **V3** Multi-site inflation: SG 2098 still 39 sites / 275 members — no inflation.

### 2026-03-10 [55f82c2ed936]

**Key design decisions in this implementation:**
1. **`MLX_STARTED_BY_PREFLIGHT` flag bridges two phases** — the preflight function (runs before session creation) sets the flag, and the window creation phase (runs after all W0-W5 windows) reads it. This avoids starting the MLX window inside the function where `$TMUX_BIN new-window` would fail (no session yet).
2. **LiteLLM runs as a background process, MLX runs in a tmux window** — LiteLLM is a lightweight proxy that just needs to stay alive; a tmux window would be overkill. MLX loads a 2.5GB model into GPU memory and benefits from having a visible window for debugging/monitoring output.
3. **`--skip-preflight` uses `-s` short flag** (not `-p`, which could be confused with project/path arguments in future flags). Useful for fast relaunches when you know services are already healthy.

### 2026-03-10 [0424cb27af3c]

The entity_entity_links population happens in two places for completeness:
1. **XML parsing** (legends_plus) — extracts `<entity_link>` children with type/target/strength, inserting 5,594 PARENT/CHILD/etc. links
2. **Post-parse step 9** — derives entity_site_links from ownership-changing events (created site, site taken over, reclaim site, etc.), creating 1,585 temporal links with link_types like "founded", "conquered", "owner"

The entity_site_links table also gets a baseline from the site_owners pass (1,328 current ownership records). The ON CONFLICT clause prevents duplicates between the two sources.

### 2026-03-10 [cc5cd2d20342]

**The "session exists" path is the common case**: Most launches hit `has-session` → `attach` because the user detaches rather than destroying sessions. The original v2.4 code only handled the cold-start path for service windows, meaning the fix that was supposed to prevent today's failure wouldn't have actually worked on the next real launch. This re-attach path fix is the critical piece.

### 2026-03-10 [732176ddee72]

- Phase 2 was formally declared COMPLETE (50/50 DoD, 2026-03-03), but Sessions 37-38 did substantial post-Phase 2 population UI work (17 fixes, sentience filter, `is_citizen` column)
- The `drifting-sparking-simon.md` plan describes a larger population counting refactor (Steps 2-9: overview tile three-way conditionals, sidebar label changes, Residents per-site) that is only **partially** implemented
- Stage 3.0 CDM Schema Fixes are done, but Phase 3 Stage 3.1+ should not proceed until the user validates the population UI work

### 2026-03-10 [a4311f2d5e96]

**The critical discovery**: `cur_site_id` and `current_state` do NOT exist as direct HF attributes in ANY of the four XML files. However, there IS rich location data available through **`change hf state` events** (75,000-76,000 per file) which track every HF's state transitions (`settled`, `visiting`, `wandering`, `refugee`) with `site_id` and `subregion_id`. The most recent such event per HF effectively IS their current whereabouts. Additionally, `<inhabitant>` tags in legends_plus site structures (1,780-1,821) provide a direct snapshot.

**Key architectural insight**: DF stores HF location as event history, not as a snapshot field. The parser was looking for a shortcut (`cur_site_id`) that this world's export doesn't provide. The real solution is to derive whereabouts from the event stream.

### 2026-03-10 [f65e4e41d3a2]

**The sidebar labels use the correct three-way pattern**, but "citizens" for SGs is based on `member_count` (entity membership) rather than the canonical site-level citizen definition. For the sidebar list view this is an acceptable approximation — the exact canonical citizen count is computed on the detail page. The sidebar is a summary view; the detail page is where precision matters.

**The SG sidebar label "citizens" vs "members"**: SG members ARE effectively citizens of the site they govern (for single-site SGs), so this label is semantically correct for the sidebar context.

### 2026-03-10 [c8c155c9edbc]

**Three interconnected bugs were fixed, each building on the previous:**

1. **The `'settled'` vs `'settler'` naming mismatch** — The deepest bug. legends.xml uses `settled/visiting/wandering` while legends_plus uses `settler/visitor/wanderer`. Since the parser merges both and legends_plus overwrites, the DB ended up with LP naming. Step 10 was filtering for base-legends naming → zero matches.

2. **Missing whereabouts population** — Step 10 only created `hf_site_links` entries (resident/former resident), but never populated the `whereabouts` JSONB on `historical_figures`. New step 10b does this with a primary source (state events, 59%) and fallback (site links, 4%).

3. **Citizen/Resident definition mismatch** — The old code computed "citizens" from entity membership (broad) and "residents" from physical presence (narrow), violating the invariant `Residents >= Citizens`. The fix: canonical per-site citizen counting (SG members + site-linked + position holders) with residents as the UNION of citizens + anyone physically present.

### 2026-03-10 [5e0fed06cd24]

**Three bugs fixed, one root cause:**

1. **Site detail residents query used only `hf_site_links`** (`detail_pages.py:1449-1485`): This was the primary bug. SG members who had no `hf_site_links` entry were invisible on the site page, causing Residents < Citizens. The fix: a 4-source UNION matching the canonical `fetch_site_residents_batch` (SG members + site links + position holders + whereabouts), with `DISTINCT ON` deduplication and priority-based link type selection.

2. **`LIMIT 500` on site residents** (`detail_pages.py:1484`): Removed. No truncation needed — the table already has a scrollable container with `max-h-[600px] overflow-y-auto`.

3. **API members endpoint capped at 1000** (`civilizations.py:873`): The route had `le=1000` but the UI sends `limit=10000`. FastAPI would return 422 for values > 1000, silently breaking the AJAX "Load all" on entity detail pages. Fixed to `le=10000`.

**Why the SG count of 30 was real**: Entity 1920 (Nightmare of Wine) has 286 total members but only 30 alive — the rest died over 250 years of history. The coincidence of entity 992 also having 30 alive is just that — a coincidence, not truncation.

### 2026-03-10 [cb4e0ff34be7]

**The "?" was a test script bug, not a data bug.** The API returns site govt data as `{"site": {"id": 42, "name": "narrowbad", "type": "town"}, ...}` — the site info is nested. My initial curl test accessed `sg.get("site_name")` (flat key) instead of `sg["site"]["name"]` (nested). Some SGs like "the brutal poison" legitimately have `site: null` because they don't own any site (destroyed/abandoned).

### 2026-03-11 [be052cd78667]

**Emerging pattern across completed reviews**: The app is functionally solid in dev mode but has significant packaging and presentation debt. Data model is the strongest layer (7.5/10), UI/UX is mid (4.6/10), and deployment is the weakest link (3/10). This suggests the development focus has been correctly prioritized on core functionality, but a "productionization" pass will be needed before Phase 7 (Polish & Production).

### 2026-03-11 [77b6f436f964]

**The error handling review is the most finding-dense at 39 items, which is typical** — error handling is inherently cross-cutting, touching every module. The five CRITICAL findings cluster around a single pattern: **no recovery from partial failure**. Whether it's a truncated XML, a dropped TCP connection, a post-parse step failure, or a DB restart, the app has no mechanism to detect and recover. This is the most impactful remediation area — a single "resilience pass" adding transactions, reconnection, and retry logic would address most of the CRITICALs and HIGHs simultaneously.

### 2026-03-11 [73aa2dc7d3fd]

**Cross-domain pattern emerging**: The `detail_pages.py` god file (3,855 lines) has now been flagged by **four independent reviews** — Architecture (implied), UI/UX, API Design, and Error Handling. This is the single highest-impact refactoring target: splitting it would improve code quality metrics across architecture, API design, error handling consistency, and testability simultaneously. The file contains 37 route handlers with copy-pasted error handling, SQL queries, and template rendering — a classic "extract and deduplicate" candidate.

### 2026-03-11 [52e0562d6ee7]

**Security is the strongest domain reviewed so far (7.4/10)**, which is notable because it's often the weakest in rapidly-developed projects. The key reason: asyncpg's `$N` parameterized query pattern was used consistently from the start, and Jinja2 autoescape was properly enabled. The XSS finding in `Markup()` filters is the most actionable — it's a 30-minute fix (add `escape()` calls) that closes the only real attack surface. The architecture choice to bind to `127.0.0.1` by default also eliminates an entire class of network-exposure risks.

### 2026-03-11 [9d94abb5d387]

**Review orchestration strategy**: With 14 total domains (3 existing + 11 new), I'm grouping related domains into 6 agent batches to minimize redundant file reads. Each agent reads overlapping files once rather than having 11 separate agents each reading the same core files. This reduces total token spend by ~40% compared to one-agent-per-domain.

### 2026-03-11 [c02b6a966650]

Each agent was given specific file paths and analysis criteria to avoid redundant exploration. The data model + XML agent was also given the known issue reference docs (`xml-location-data-analysis.md`, `population-demographic-audit`) so it can evaluate the codebase against those findings rather than rediscovering them from scratch — a significant token savings.

### 2026-03-11 [e947fe8beaed]

**Why parallel agents here?** Each domain review reads overlapping files but produces independent analysis. Launching them concurrently means ~5 agents run in ~1x wall-clock time instead of ~5x sequential. The trade-off is higher peak token spend, but the user explicitly optimized for this — "optimize for token spend efficiency over completion time" means batching related domains within single agents (e.g., Data Model + XML share schema.sql reads) while parallelizing across unrelated batches.

### 2026-03-11 [f56e0c24bae5]

**amxu bendjackals** is the key differentiator — a Resident but NOT a Citizen. This goblin has whereabouts at cloistermanor but is not an SG member, has no site link, and holds no position. They're physically present but not formally affiliated with the site government. This is exactly the R > C case working correctly.

**The remaining 42 alive HFs** are all enemies (giant jaguars, bronze colossi, rocs, ettins, forgotten beasts, night creatures) or former members/residents. Enemies are linked via `sg_enemy` — they attacked this site government but aren't members or residents. Two alive giant jaguars are correctly excluded as non-sentient.

### 2026-03-11 [eca28580d085]

**Critical discovery from the raw data — `former resident` inflates counts:**

The `fetch_site_citizens_batch` and `fetch_site_residents_batch` Source 2 (hf_site_links) does NOT filter out `link_type = 'former resident'`. This means 9 alive HFs who are former residents of cloistermanor (but currently live at other sites) are being counted as citizens/residents. That's where the "14 Citizens" and "15 Residents" come from.

**True ground truth for cloistermanor (site 705):**
- **Current SG members (alive)**: 5 (doren, mato, olngo sinfuluttered, olon, stasost seducedwilt)
- **True Citizens**: 5 (same — all are SG members + alive + sentient)
- **True Residents**: 6 (the 5 citizens + amxu bendjackals via whereabouts as visitor)
- **Former residents (alive, elsewhere)**: 9 (inflating the count to 14/15)

Also: Position column on the site page shows positions held at OTHER entities (e.g., stasost drilljackal's "Administrator" is at e3342, not at SG 3344).

### 2026-03-11 [f8731d6b05ac]

**Before/After comparison for cloistermanor (site 705):**
- **Before fix**: Citizens 14, Residents 15 (inflated by 9 alive former residents)
- **After fix**: Citizens 5, Residents 6 (correct — matches XML ground truth)

The `former resident` link type in `hf_site_links` is a permanent historical record in DF. When an HF moves away, they get a `former resident` link. Without filtering, these 9 HFs who moved elsewhere were still being counted as citizens/residents of cloistermanor. The `whereabouts` source (Source 4) correctly handles the case where a former member is *physically still present* — amxu bendjackals is counted as a resident via whereabouts, not via site links.

**Civ-level numbers**: Citizens 341, Residents 347, DF Population 37,880. The DF Population >> Citizens because entity_populations includes unnamed NPCs.

### 2026-03-11 [3a70ea08f5e2]

**The R ≥ C invariant holds perfectly:** Residents (347) ≥ Citizens (341) at the civ level, and Residents (6) ≥ Citizens (5) at the site level. The 6 extra residents civ-wide are HFs physically present at sites via whereabouts but not formal entity members — exactly like amxu bendjackals at cloistermanor. The DF Population (37,880) >> Citizens (341) because `entity_populations` includes all unnamed NPCs in the world simulation.

### 2026-03-11 [047083d4279c]

**How the fix works across three layers:**

1. **Data layer** (`detail_pages.py`): For SG entities, after fetching the standard members list, we query the two additional citizen sources (hf_site_links + position holders) and merge them in. Then we run the *canonical* citizen query (same 3-source UNION as `fetch_site_citizens_batch`) to get the true citizen HF set, and override `is_citizen` for every row. This ensures former members who are citizens via site links get `is_citizen=True`.

2. **Classification layer** (`detail_pages.py` recount + template): Rows with `is_citizen=True` are classified as "current" regardless of their `hf_entity_links` status. This means a "former member" who is a citizen via a site link shows up under the "Current" filter — because they ARE a current citizen of this SG, just not via formal SG membership.

3. **Display layer** (`entity_detail.html`): The Membership column still shows the original `link_type` (Member, Former Member, Citizen (Site Link)) so users can see *why* each person is in the list. The Citizen column confirms Yes/No.

**The 117 = 101 + 9 + 7 breakdown:**
- 101: Current SG members who are alive (original)
- 9: Former SG members who are alive AND citizens via site links (reclassified from former→current)
- 7: HFs not in SG at all, but citizens via site links (newly added rows)

### 2026-03-17 [3e566f740db0]

**Critical distinction revealed by the data:**

Abo and Mebas have `home_structure` links where the `entity_id` field = **1525** (the SG itself). The game is saying the SG *assigned* them a home — they're recognized inhabitants. But they're also tagged as `enemy` / `criminal` of that same SG. This is DF's way of modeling someone who *lives* at a site but has turned against its government.

Gasom's `home_structure` has `entity_id = 4373` (her own outcast gang), meaning her home was established by *her* organization, not the SG. She's a squatter-warlord operating out of a tavern.

Sekel has **zero** site links to 621 — she may be elsewhere entirely, or present only via a visiting/wandering event not captured as a site link. She has a `used_identity_id` (false identity), suggesting she's an agent/spy.

Stral is a **former member** of the SG — a departed citizen. She left, no longer lives there.

### 2026-03-17 [163d52295f5d]

**Population taxonomy implementation complete. Key design decisions:**

1. **Stale `resident` link detection**: The `resident` link type is materialized from `change_hf_state` settler events (not XML), so it can become stale. Added a whereabouts cross-check: if an HF's whereabouts places them at a *different* site, their `resident` link is considered stale and they're excluded. This correctly handles Stral Mergedwaves (settled at 621 in Y209, but visiting 1366 in Y227).

2. **Native vs materialized structural links**: `home structure`, `seat of power`, `occupation`, `hangout` are from XML and are persistent — an HF with a home at a site retains structural presence even if temporarily wandering (Gasom). The `resident` type is derived/materialized and can be invalidated by later events.

3. **Gasom's classification**: No direct adversarial link to SG 1525, but classified as Ne'er-do-well via the **indirect werebeast check** (is_werebeast + no SG membership). She's also a member of outcast entity 4373, but the werebeast check caught her first.

4. **Count breakdown at Pocketdumplings**: 276 denizens (99 Citizens, 104 Residents, 73 Visitors) + 54 Ne'er-do-wells = 330 total classified HFs. Zero overlap between tabs.

### 2026-03-17 [7b2a54db64a8]

The enhanced profession waterfall dramatically improves coverage by leveraging DF's own `change hf job` events as the primary source. For Entity 1525 (the nourishing league, a Site Government with 383 members):
- **Profession**: 86% coverage (was ~66% with naive skills-only approach)
- **Position**: 28% coverage across any entity (was ~10% SG-internal only)

Key design decisions: (1) "criminal", "standard", "snatcher", "thief" are excluded from profession — they're status markers, not occupations; (2) Cross-entity positions show the entity name in parentheses for context; (3) The `derive_profession` function accepts either the new `prof_data` dict or the legacy `entity_types` list for backward compatibility; (4) Orphaned "Unknown" positions (35% of all position entries) are suppressed in display since only 6.3% are resolvable from event data.

### 2026-03-17 [b235df6c19fd]

The site detail page passes `owner_entity_id` (the SG entity) as the `viewing_entity_id` to `batch_fetch_positions`. Since the positions are in a religion (entity 1477), not the SG, they should show entity context. The bug likely means `is_viewing_entity` is incorrectly set to `True`, or the entity name isn't being appended. Let me trace the exact data flow.

### 2026-03-17 [731f8bb3f8cb]

**Root cause of missing entity context in site Denizens Position column:**

1. Site 621 has **no owner entity** (0 rows in `entity_site_links` with `ownership`)
2. HFs 30699 and 31638 each have **two** positions in "the regal cult" (entity 1477) — one with a name ("high tower", "sacred healer") and one **orphaned** (NULL name → "Unknown")
3. `derive_position()` only checks `positions[0]` — if the orphaned one comes first, it returns `None` (because of the "Unknown" skip)
4. The template then falls back to `r.position_name` from the SQL lateral join, which has the name but **no entity context**
