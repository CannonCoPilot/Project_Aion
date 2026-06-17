# Insights Archive — 2026-06-06
# Rotated: 2026-06-06T12:15:48Z (6 entries)

### 2026-05-15 [aa029e6c302b]

The substantive findings (SQL f-string interpolation, colorFor duplication, Village posRef pattern, Sankey placeholder) are all real and verifiable — they map to actual code/commit-message content. The fabrication is in the *supporting evidence* (git output, file sizes, verification claims). This is exactly the 2026-05-06 "JICM compressor extrapolates forward, elides reframe turns" failure mode in agent form: an LLM filling in plausible-looking supporting detail that wasn't actually fetched. The architectural fix from Phase 1.2 holds — Jarvis captures narratives to disk and adds an authenticity audit header.

### 2026-05-15 [2bde8ea79377]

Eight months of subagent fabrication failures resolve to a single YAML schema bug: `tools: All tools` (English prose) parses as `["All", "tools"]` after comma-split. Two phantom tool names → zero real tools granted → text-completion fabrication of plausible-looking tool output. The detection signal was always in the `tool_uses: 0` response metadata, but it was missed because the failure surfaces as content-level hallucination rather than tool-injection error. The fix is now persisted on disk; the harness will read the canonical schemas at the next session start.

### 2026-05-15 [ff23a168bff5]

**Two-instance learning**: This bug existed for ~8 months and survived one full root-cause fix because the *second* copy was invisible to the first fix's blast radius. Two principles fall out: (1) `additionalDirectories` causes silent cross-workspace agent shadowing — always audit ALL listed directories when fixing agent configs, not just the primary cwd; (2) the empirical test (`tool_uses` count) is faster + more reliable than disk audit alone, because disk-clean does not imply harness-clean when multiple registries exist.

### 2026-05-15 [af13af65ce61]

**Hypothesis: in-process agent definition cache survives `/clear`.** Disk on both Jarvis and Jarvis-Dev is canonically clean, but the system prompt's Agent tool listing still shows `(Tools: All, tools)` for the 5 specialists. `deep-research` (which was never broken) displays its full tool list correctly. Most likely: Claude Code loads agent definitions once at process start; `/clear` clears conversation context but not the agent-definition cache. The Jarvis-Dev push from prior session happened AFTER this process started.

### 2026-05-15 [0fc807c8c91d]

**The cache-survives-/clear hypothesis is the simplest explanation.** Three converging signals:
1. Disk on both Jarvis and Jarvis-Dev is canonically clean (validator passes 17/17; grep returns zero `tools: All*` hits).
2. The system prompt's Agent tool listing still shows `(Tools: All, tools)` for the 5 specialists at this session's start.
3. `deep-research` (never broken) renders its actual tool list in the same prompt — asymmetry can only come from differential parsing at cache-fill time, not a structural feature like plugin-format.

The Jarvis-Dev fix was pushed AFTER this Claude Code CLI process started. `/clear` clears conversation context but the agent-definition cache is process-scoped, so the broken YAML state from the original process start persists.

### 2026-05-15 [0f0d8c1d994e]

**Why a parallel-process test is the right move**: a fresh `claude` invocation reads agent YAML from current disk state (which is clean). If the new process spawns `code-review` and produces real tool calls + a real file, that empirically proves the cache hypothesis without gambling this session's state. Confirmation comes from comparison, not from a destructive operation on the variable we want to preserve.

# Insights Archive — 2026-06-06
# Rotated: 2026-06-06T15:48:12Z (6 entries)

### 2026-05-15 [d2b370ceb140]

**Pre-flight observation from W8 is already the empirical proof.** The fresh process's system-prompt Agent listing shows `code-review (Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)` — the canonical list — vs W0's broken `(Tools: All, tools)`. Same disk, same workspace, same `additionalDirectories` including Jarvis-Dev. The only variable is process lifecycle. **Cache hypothesis confirmed before W8's subagent even returns.**

### 2026-05-15 [b197993454db]

- **Cache scope confirmed process-level, not session-level**: `/clear` resets conversation context but leaves the harness's in-memory agent-definition cache intact. Only a full Claude Code CLI process restart re-reads `.claude/agents/*.md` from disk. The Jarvis-Dev fix (`6601d6d`) was pushed *after* W0's `claude` process started, so W0 stayed broken across multiple `/clear` cycles even though disk was canonically clean.
- **The system-prompt Agent listing is the ground-truth diagnostic**: comparing W0's `(Tools: All, tools)` against this W8 process's `(Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)` proves the comma-split parsing artifact disappears once a fresh process loads the fixed YAML. No need to spawn the agent to know — the listing tells you upfront.
- **Asymmetric agent rendering as health-check**: `deep-research` (never broken) rendered its real tool list in W0's prompt while the five specialists showed the malformed value. That asymmetry was the smoking-gun signal; future regressions can be detected by `grep "(Tools: All, tools)"` against the in-context Agent block.

### 2026-05-15 [b1016b984efd]

**The risk of using the launch script as-is is "wrong session resumed".** When Sir kills W0's claude process and relaunches via the script, `find_latest_w0_session()` will pick whichever JSONL has the most recent mtime in the project dir. If W8 (or W6) was active more recently than this W0 session, the launch script will `--resume` THEIR conversation, not yours. The script's protection is incomplete: it knows about W5's deterministic UUID but not about ad-hoc child sessions.

### 2026-05-15 [14bc48bc0662]

**The `--exclude-dynamic-system-prompt-sections` flag is your friend** for cache continuity. It strips git status, time-varying env, etc. from the system prompt, which keeps the prompt prefix stable across requests so Anthropic's 5-min prompt cache can hit on first-API-call after relaunch. Already wired in the W0 base command at line 486. As long as the restart sequence completes within ~5 minutes of the kill, you should retain most cache.

### 2026-05-15 [0e7f01a31ca9]

**The 20-tool-use review (vs Phase E-3's 2-tool-use diagnostic) is itself confirming evidence.** A specialist agent doing real grep/bash work on the commit and finding a real temporal sync issue between three files in the same commit is exactly what AC-03 protocol looked like before it broke — and exactly what we just restored. The contrast with W0's chronic tool_uses: 0 + confabulation is now anchored in observable behavior.

### 2026-05-15 [dcd535e4782d]

**End-to-end root-cause resolution confirmed.** The three-layer fix (Jarvis disk `74a6706` → Jarvis-Dev disk `6601d6d` → process restart) has fully restored specialist agent tool injection. The `code-review` agent executed real Write + Bash calls in 7 seconds with 2 tool uses — contrast W0's prior-process `tool_uses: 0` + 8 months of confabulated reports. AC-03 milestone review protocol with specialist agents is now operational in this process.

# Insights Archive — 2026-06-06
# Rotated: 2026-06-06T17:44:07Z (3 entries)

### 2026-05-15 [3d915f5ad2fe]

**V1-V8 implementation summary**: The Village tab has been rebuilt from the ground up. What was 385 LOC of colored circles on a dark grid is now a multi-file system: `village-map.ts` (tilemap + BFS + zone routing), `village-animations.css` (12 CSS keyframes lifted from pokegents), `persona-colors.ts` (shared sprite assignment + hue-rotate variety), and a rewritten `VillageView.tsx` (~320 LOC) with real pixel-art character sprites from pixel-agents, floor/wall tiles, zone-affinity routing (70% home zone bias), dual-speed movement (60ms busy vs 225ms idle), weighted animation selector with anti-repeat, hover mini-cards, and a busy-glow ring for live-state personas.

### 2026-05-15 [38dd525a4b66]

**Phase 1.4 selective scope rationale**: The 5 chosen items hit the high-value/low-effort sweet spot — the WS proxy closes an architectural boundary violation, the Village live state was the last TODO blocking V4 feature-completeness, and the AC-03 carry-overs clear technical debt before it compounds. The remaining 10 items are either cosmetic (Sankey, pixel-art sprites) or require more substantial infrastructure (Canvas+d3-force migration, ruamel.yaml). Those are Phase 1.4-deferred — available for cherry-picking but not blocking Phase 2 entry.

**WS proxy architecture**: The proxy creates per-client upstream connections rather than a shared fan-out. This matches pulse's channel-subscription model where each client independently subscribes. The pending-message buffer handles the startup race (client sends subscribe before upstream opens). The bind-mount + `--reload` combination means the entire iteration loop — edit pulse/app.py on host → uvicorn auto-reloads → frontend polls updated endpoint — is now zero-manual-step.

### 2026-05-16 [0c29f5bf9550]

**Canvas force simulation — why zero deps**: The d3-force algorithm is ~50 lines of physics: charge repulsion (inverse-square, O(n²)), link springs (Hooke's law per edge), center gravity (linear pull), and velocity damping. For 163 nodes, the O(n²) charge loop is 13K iterations per frame — trivial for modern JS engines at 60fps. The `alpha` decay (0.995x per tick, settling to <0.001 in ~700 frames ≈ 12s) means the simulation converges and stops burning CPU, while user interaction (drag/zoom) bumps alpha to keep it responsive. This replaces ReactFlow + all its internal dependencies with raw Canvas 2D calls — fewer abstractions, full control over the bloom/glow rendering pipeline.

**Bloom via `shadowBlur`**: Canvas 2D's `shadowBlur` property on the 2D context generates a Gaussian blur halo around any draw call. Setting `shadowColor` to the node's color and `shadowBlur` to 18px on hover creates a convincing glow effect without WebGL shaders or post-processing passes. The performance cost is proportional to blur radius × arc perimeter — negligible for 8px circles.

# Insights Archive — 2026-06-06
# Rotated: 2026-06-07T01:35:59Z (8 entries)

### 2026-05-16 [340342db2deb]

**Phase 2's real value isn't compression — it's observability.** The dashboard surface (2B) and the per-task telemetry (TC Phase 4) turn token spend from a mystery into a visible, actionable metric. Right now you can't see where tokens go in a session. After Phase 2, every persona, every pipeline run, every JICM cycle has a token cost attached and charted. The compression techniques (2A) reduce the number; the dashboard (2B) makes the number visible. Both matter, but visibility has compounding returns — it informs future optimization decisions across all phases.

### 2026-05-16 [e1348163f328]

**The audit's most consequential finding is the compact fallback gap.** When Claude Code's native auto-compact fires (at ~70% context), `jicm-precompact.sh` correctly writes a fresh checkpoint — then `session-start.sh` ignores it. This means the safety net for the most common context-pressure event is disconnected. Every auto-compact resumption since v7.9 deployment has gotten zero compressed context injection, relying entirely on force-loaded `@-imports` for continuity. The `@-imports` carry scratchpad + session-state + identity, so the system doesn't collapse, but the LLM-enriched narrative and conversation excerpt — the whole point of JICM's two-tier compression — are discarded silently. This is a one-line fix with outsized impact.

**The threshold question is strategic, not technical.** At 250K/300K soft/hard (25%/30% of 1M), JICM fires early — trading context space for safety margin. With the compact fallback gap fixed, the safety net is stronger, which justifies raising thresholds to ~400K/500K. This would roughly double the useful context window before JICM cycles intervene, reducing cycle frequency from "every few hours" to "once per long session." The tradeoff: higher thresholds mean more context to compress when the cycle does fire, increasing LLM compression time from ~16s to ~25-30s. Acceptable.

### 2026-05-16 [06d796574c93]

**The PTY wrapper is conceptually simple but empirically unproven.** The Unix PTY abstraction (master/slave fd pair) is the same mechanism tmux uses internally — we're just removing one layer of indirection. Claude Code's `isatty()` check will return true because the slave fd IS a real TTY. The risk isn't in the PTY mechanism itself but in how Claude Code's TUI framework (likely Ink/React-Ink) handles injected input vs keyboard input in raw terminal mode. Raw mode means the TUI reads individual bytes, not line-buffered input — so the injection must write bytes at the right cadence (exactly as the current tmux `send-keys` + `sleep 0.3` pattern does). Test 2 resolves this empirically in 10 minutes.

**Why half a day of tests is worth it**: The alternative — committing to hook-only and discovering months later that the nudge compliance rate is 60% — costs more in accumulated UX friction than one morning of PTY experimentation costs in engineering time.

### 2026-05-16 [e387c0ab11e2]

**Reading the raw evidence**: T1's log shows the marker twice — once from PTY echo (line discipline), once from cat's output. Both terminated with `^M` (CR), confirming our `\r` injection correctly simulates Enter. T2-T5 show bash's bracket-paste-mode sequences (`^[[?2004h`/`l`) wrapping each command — bash sees a real terminal and enables all its normal features. T4 critically proves `/clear` passes through the PTY as literal text with zero interception at the terminal layer.

### 2026-05-16 [70d0e2051e9a]

**Threshold analysis from 38 measured cycles**: Median trigger at 324K tokens, P75 at 355K, P90 at 420K. The 300K hard threshold catches 63% of cycles at or near the target zone. The 36% below 300K includes manual triggers and idle checkpoints, not threshold misses. 18% above 400K reflects watcher-to-actuation latency (dominated by Claude Code's 57s startup time, not detection delay). The 300K threshold is well-calibrated for the 1M context window — no adjustment needed.

### 2026-05-16 [1b8b4c81a446]

**The pipeline's deepest structural gap is G1 + G8**: NLP compression achieves nothing measurable (0.99 ratio), and the compressed checkpoints — the most valuable distilled knowledge about each work session — never flow into long-term memory (RAG). Every JICM cycle produces a 10KB checkpoint that captures current task, progress, decisions, and next steps. These checkpoints are consumed once by session-start.sh and then archived to a flat file directory that nothing indexes. If the checkpoints were automatically ingested into the `sessions` RAG collection, Claude would have semantic search over all prior work sessions — the very capability that the resume instructions ask for ("Query jarvis-rag search with collection 'sessions'") but that depends on manual /meditate-session runs that rarely happen.

**The second deepest gap is G3 + G6**: The HUD displays stale data because the legacy state file isn't written, and the scratchpad (the most critical transient memory) can grow past its 80-line budget because rotation only triggers on PreCompact, not on JICM's own compression cycle.

### 2026-05-16 [99410c53862e]

**The philosophical framework reframes every JICM decision**: Sir's premises establish that Memory (in an LLM harness) isn't about storing data — it's the bridge between Sense (what's happening now) and Purpose+Fulfillment (what we're trying to achieve). The 10 gaps I identified map directly: G1 (NLP no-op) is a *Sense-making pipeline failure* — the compression step should abstract signal into map, but instead passes raw signal through unchanged. G8 (checkpoints never reach RAG) is an *Amnesia failure* — distilled experience evaporates instead of forming lasting memory. The scratchpad's bloat (716 lines) is *Hyperthymesia* — undifferentiated accumulation without the forgetting that keeps memory useful.

**Autonomic vs Intentional maps perfectly to hooks vs reasoning**: Hooks (SessionStart, Stop, PreCompact) are the rattlesnake reflex — automatic, fast, triggered by environmental stimuli. Claude's reasoning (deciding to query RAG, choosing what to save to scratchpad) is the intentional memory function — slower, contextual, guided by Purpose. Both must work together, and both must serve both formation and recall.

### 2026-05-17 [4589147fc5d7]

**Phase 2B delivered a complete memory system in one session by exploiting architectural symmetry**: every layer has the same three concerns (Curate/Store/Retrieve), so each task follows the same pattern — identify the broken mechanism, write or fix the component, wire it to its trigger. The hardest task (relevance-retrieval) was ~80 LOC because the capability-map already existed as a routing table — the hook just performs the lookup that Claude previously had to reason about. The biggest disk impact wasn't a new feature but a maintenance policy: log-rotation recovered 391MB by enforcing a rule that already existed conceptually but had no automation.

# Insights Archive — 2026-06-06
# Rotated: 2026-06-07T04:27:31Z (3 entries)

### 2026-05-17 [9d1f1d7e897b]

**85KB of force-loaded content = 21,819 tokens (~2.2% of the 1M window) permanently consumed before any work begins.** The largest consumers are `.active-plan` (23.5KB — contains full historical workstream state) and `CLAUDE.md` (12.3KB — operational instructions). This is the "always-on memory tax" that Phase 2B's context-budget pattern was designed to make visible. The dashboard now surfaces this cost in real-time, making future optimization decisions data-driven rather than guessed.

### 2026-05-17 [67526c615b17]

**The audit reveals a clear pattern: JICM's stop-and-wait cycle is the ONLY autonomic trigger point for most Store/Curate functions.** Native autocompact (Claude Code's built-in 70% threshold) fires `jicm-precompact.sh` which writes a checkpoint, but does NOT trigger L4 ingest, insights rotation, or corrections consolidation. This means the most common context-pressure event silently bypasses the consolidation pipeline.

### 2026-05-17 [f1a106fde6c2]

**The NLP compression failure reveals a pipeline ordering bug, not a fundamental limitation.** The script deduplicates paragraphs, collapses whitespace, and removes repeated sections — operations that yield nothing on already-structured output. Applied to the RAW scrollback (200 lines of terminal output with prompt repetition, status lines, and tool-call rendering) or raw JSONL messages (with verbose tool results), the same techniques would achieve 30-50% reduction. The compression step is in the wrong position in the pipeline.

# Insights Archive — 2026-06-06
# Rotated: 2026-06-07T05:33:13Z (3 entries)

### 2026-05-18 [3f4a1dd447ab]

**The session completed 5 of 7 implementation phases before hitting context pressure at 258K tokens.** The 3 remaining phases (REST idle detection, TURN mid-session retrieval, MAINTAIN health pings) are all additive — they don't depend on the phases already implemented. The core architectural changes (consolidation moved to watcher, NLP repositioned, Graphiti enabled, BOOT strengthened) are committed and will be active on next watcher restart. The Graphiti pre-population script is still running async, ingesting the 34-file identity corpus into Neo4j — that work completes independently of the CLI session.

### 2026-05-18 [e7cbc5c1beb9]

**Concurrent Graphiti ingestion jobs can saturate Ollama to the point of unresponsiveness.** Each `graphiti-core` `add_episode` call generates multiple LLM requests for entity extraction, relationship building, and summarization. Five simultaneous processes exhausted the LLM's capacity, causing all requests (including health checks) to time out. Future improvement: the watcher should serialize Graphiti ingestion or cap concurrent jobs to 1. The REST and COMPRESS stages already serialize (one background job each), but the manual re-ingestion of 3 files in parallel was the trigger.

### 2026-05-18 [4f979b33a169]

**The saturation was caused by concurrent LLM+embedding requests from 5 Graphiti processes, all routing through the same single-threaded Ollama inference.**

