# Insights Archive — 2026-06-19
# Rotated: 2026-06-19T17:38:34Z (2 entries)

### 2026-06-06 [6632bef209bb]

The key line in the log confirms the fix: `main loop (poll 1s, target aion:0, backend tmux)`. Previously it would have shown `target jarvis:0`. The watcher is now monitoring W0 via the correct tmux session name. The `JICM_TMUX_TARGET` resolves from `TMUX_SESSION` at startup, so the inline env export was the right fix over changing the default.

### 2026-06-06 [a734a4a3ccb4]

- **Anna's Archive has no REST API** — the entire search surface is HTML scraping with regex MD5 extraction (`/md5/([a-f0-9]{32})`). The only official JSON endpoint is `fast_download.json` for member downloads. Every existing implementation (Go, Rust, Python, Dart) scrapes HTML for search.
- **The ElasticSearch JSON endpoint** (`/db/aarecord_elasticsearch/md5:{hash}.json`) exists but is explicitly "not an API" — it returns 403 for some MD5s and works for others, likely depending on Cloudflare's mood. The HTML `/md5/{hash}` page is the reliable fallback for metadata.
- **Atomic file writes** (write to `.tmp`, rename on success) prevent partial files when downloads fail mid-transfer. This is critical for large PDFs/EPUBs where a network interruption could leave a corrupt file that the skip-existing check would then treat as complete.

# Insights Archive — 2026-06-19
# Rotated: 2026-06-20T00:02:14Z (9 entries)

### 2026-06-06 [10d2635bda76]

- **The dispatcher auto-decomposed the battle test tasks** into child tasks with dependencies — it didn't dispatch them all in parallel. The genome task (`AION-d264447d`) is `active:running`, while The Correspondent and Pseudepigrapha are `blocked:yes, reason:dependency`. This is the orchestrator's sibling-awareness logic from `orchestrate.py:84-111`.
- **Fork failure led to seed fallback**: The chain fork failed because the forked session also hits the external import prompt (20s timeout). The bridge correctly fell back to injecting directly into the seed (Protos). The auto-confirm fix I just committed will prevent this in future seed restarts, but forks still need the same treatment — they'll need the same `capture-pane` + `send-keys` logic in the fork wait loop.
- **The `mcp_config` field is flowing through the pipeline**: The request file shows `"mcp_config": "/workspace/.claude/jobs/personas/book-retriever/mcp.json"` — the executor resolved the persona's MCP config and included it in the payload. However, since the fork failed and it fell back to Protos, the `--mcp-config` flag wasn't used on this run. The MCP tools worked anyway because Protos loaded `annas-archive` from `alfred/.mcp.json` at startup.

### 2026-06-06 [fdd2c7b9373b]

- **`lookupISBN` design**: The tool strips hyphens, detects ISBN-10 vs ISBN-13 by digit count, then searches Anna's Archive with the bare numeric string (which produces the cleanest results — a single ISBN query returns exact matches without catalog noise). It then cross-references each result's `identifiers.isbn13[]` and `identifiers.isbn10[]` against the query and tags matches as `"exact"` or `"fuzzy"`. Results are sorted exact-first so the caller can trust `results[0]` for programmatic workflows.
- **ISBN in search results vs info results**: Anna's Archive's search result HTML cards don't include ISBNs — they only show title, author, publisher, and filepath. ISBNs are only available on the detail page (`/md5/{hash}`), which is why `lookupISBN` makes `info` calls for enrichment rather than trying to parse ISBNs from the search page.

### 2026-06-06 [715580e562f1]

- **Organized downloads solve two problems**: (1) files are now discoverable by author/title in the filesystem rather than by opaque Anna's Archive filenames, and (2) the `Author/Title/` structure maps naturally to RAG collection namespacing — a future `ingestLibrary` tool can walk the tree and create per-author or per-title Qdrant collections.
- **The `_resolve_organized_dest` function calls `info()` before download** — this adds one HTTP request per download but provides the metadata needed for directory naming. Since `info()` results are used for both directory creation and the response's `author`/`title` fields, there's no wasted work. The trade-off is acceptable: one extra scrape (~500ms) per download vs permanent filesystem organization.
- **Three config locations, two gitignored**: The download path is set in three `.mcp.json` files — root (`.mcp.json`, gitignored), Alfred's (`alfred/.mcp.json`, gitignored), and the persona's (`alfred/.claude/jobs/personas/book-retriever/mcp.json`, tracked). Only the persona config is committed. The other two are local-only because they contain the member secret key.

### 2026-06-06 [da5290067eab]

- **The organized download structure works end-to-end**: `_resolve_organized_dest` called `info()` to get author="Virginia Evans" and title="The Correspondent: A Novel", sanitized them into filesystem-safe directory names, and created `Virginia Evans/The Correspondent_ A Novel/` under the library root. Both the `downloadBook` (fast download) and `memberDownload` (quota-tracked) paths produced files in the same organized directory.
- **Pipeline decomposition gap**: The orchestrator treated `action:retrieve` tasks as research tasks and only generated search/verify subtasks. It never created a download step. This is because the dispatcher's decomposition logic doesn't have domain-specific knowledge about the book-retriever persona's full workflow (search → verify → download). The fix is either (a) make the persona prompt explicitly instruct "always download after verification" or (b) add download-step generation to the orchestrator's task decomposition for `action:retrieve` labels.
- **The filenames remain verbose** (Anna's Archive URL-derived names include title, author, year, publisher, ISBN, MD5, and "Anna's Archive" branding). A future improvement would be to rename downloaded files to a cleaner format like `Title - Author (Year).ext` while preserving the MD5 in a sidecar `.meta.json` file for traceability.

### 2026-06-06 [3ebd6e3d66bc]

- **Root cause of all fork failures**: `_capture_seed_session_id` reads from `~/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev/` (the symlink slug), but Claude Code resolved the symlink and wrote to `~/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion-alfred/` (the real path slug). The session ID was always stale because it came from a different directory.
- **The `--resume` flag** uses Claude Code's internal session store keyed by session UUID. When `_capture_seed_session_id` returned a UUID from the wrong project slug, `--resume` couldn't find the conversation → "No conversation found with session ID" → fork fails → timeout → (previously) seed fallback → seed pollution.
- **Fix**: `_capture_seed_session_id` needs to check BOTH project slug paths, or better, use the resolved real path.

### 2026-06-06 [1717beb87c2f]

- **The root cause chain was four bugs deep**: (1) symlink slug mismatch → wrong session ID → fork fails, (2) seed fallback pollutes Protos → context grows, (3) forked Sonnet session inherits 125K from polluted Opus seed → 62% of 200K → autocompact fires, (4) autocompact consumes paste-buffer task prompt. Each bug masked the next.
- **The persona isolation architecture** eliminates issues 3 and 4 structurally. By removing Jarvis's `@`-imports from the root CLAUDE.md, Alfred's seed drops from 125K → ~30K tokens. Even if the external import prompt fires and is accepted, the root CLAUDE.md contributes only 734 tokens instead of the previous ~23K of Jarvis context.
- **`--add-dir` is the key flag**: it loads a directory's CLAUDE.md with full `@`-import resolution, exactly like auto-discovered CLAUDE.md files. This means the Jarvis persona CLAUDE.md's `@.claude/context/psyche/api_aware.md` etc. resolve correctly relative to the project root — no changes to the @-import paths needed.
- **Audit numbers**: Alfred seed now loads ~30K tokens (14% of Sonnet 200K). Jarvis sessions are unchanged — same ~125K tokens loaded via `--add-dir` plus root CLAUDE.md. The separation is invisible to Jarvis.

### 2026-06-06 [b0085cb1264d]

- **Fork model inheritance**: When `--resume --fork-session` creates a fork, the new session inherits the seed's model setting. This means the seed's model choice propagates to every chain. Getting it right at the seed level cascades correctly through the entire pipeline.
- **Seed priming is essential**: The "Seed ready" prompt serves two purposes — it confirms the session is interactive AND it caches the initial context (CLAUDE.md, hooks, system prompt). Without it, the fork starts from an un-cached baseline, losing the ~15s cold-start benefit that priming provides.

### 2026-06-06 [e8acf0eecaf7]

- **Double-priming is harmless but wasteful**: If launch-aion.sh primes the seed via the background subshell, and then the bridge's `ensure_seed()` also primes it, the seed just gets asked "Seed ready" twice. The second time adds ~$0.01 and 8 seconds but causes no state corruption. The bridge priming is a safety net for the case where launch-aion.sh's background priming failed or the seed was restarted.
- **The bridge priming COULD be conditional**: Check if the seed already responded to a prompt before injecting another one. But the complexity isn't worth it for an 8-second cost on a rare code path.

### 2026-06-06 [cde17bce2979]

- **Styx** — in Greek mythology, the river separating the world of the living from the underworld. Charon ferries souls across it. Fitting for the daemon that ferries task prompts from Alfred's Pulse queue (the living world of tickets) across into Claude Code chain sessions (where they're executed and reaped). The reaper function completes the metaphor.
- **The `bridge|styx)` case pattern** accepts both names so existing muscle memory or docs referencing `--restart bridge` still work.

