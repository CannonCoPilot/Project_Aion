# Memory System Wiring Architecture v2.1 (Final)

**Date**: 2026-05-17
**Status**: APPROVED — proceed to implementation
**Supersedes**: Phase 2B ad-hoc wiring (000b377), v2.0 draft (this file prior revision)
**Authority**: Sir's 10-point directive + philosophical framework + planning evolution audit
**Designation**: Phase 2C of project-aion-final-phases

---

## Philosophical Foundation

Memory is the bridge between Sense and Purpose+Fulfillment. JICM ("Jarvis Internal Complex Memory") models this bridge computationally:

- **Amnesia** (forgetting what's relevant) threatens Purpose by severing continuity
- **Hyperthymesia** (remembering what's irrelevant) threatens Purpose by drowning signal in noise
- **Memory System functions** balance these extremes across multiple layers, each with affinity for different stages of the Sense-making pipeline (Signal → Interpretation → Abstraction → Mapping → Semantics)
- **Autonomic functions** = reflex-response (hooks, scripts, watcher) — no reasoning required
- **Intentional functions** = reasoning-guided (Claude LLM decides) — triggered autonomically but executed with judgment
- **Context Window** = the SOLE target of all Retrieve operations (via force-load, additionalContext, MCP tool result, CLI injection, or direct Read)
- **Store operations** can run as background scripts WITHOUT Claude (direct API calls to Qdrant/Neo4j)
- **Retrieve operations** MUST go through Claude (results must enter Context Window)

---

## Design Principles

1. **PreCompact = emergency fallback ONLY.** JICM owns the full compression lifecycle. Native autocompact fires only if all JICM layers have collapsed.
2. **COMMAND-LINKED, not COMMAND-ONLY.** Every function has an autonomic trigger. Commands provide optional manual access. No orphans.
3. **Prompt injection via tmux = functionally autonomous for Retrieve.** MCP search/retrieval achievable via watcher-style CLI injection. Store operations use direct API calls (no Claude involvement needed).
4. **NLP compression: repair via pipeline reposition.** Process raw inputs (scrollback 500-1000 lines, JSONL messages) BEFORE structuring. Achieve 30-50% reduction on naturally redundant raw data.
5. **JICM_GRAPHITI_ENABLED=true immediately.** Pre-populate graph with 42-file identity corpus. No deferral.
6. **Functions cluster at session stages.** Interdependent operations fire together at optimal timing, not scattered across patchwork hooks.
7. **Dedup via idempotent markers.** Functions that could fire at multiple stages use date-stamped marker files (`.memory-fn-ran-YYYY-MM-DD`).
8. **Store ≠ Retrieve path.** Store operations (ingest to RAG/Graphiti) run as async background scripts directly calling APIs. Retrieve operations (search RAG/Graphiti) inject instructions to Claude who executes MCP calls, delivering results to Context Window.

---

## Session Stage Model (5 canonical trigger points)

| Stage | Trigger | Budget | Primary Role |
|-------|---------|--------|--------------|
| **BOOT** | SessionStart(startup/resume/clear) | 3-5s | RETRIEVE (inject context + MCP search instructions into new window) |
| **TURN** | UserPromptSubmit | <500ms | RETRIEVE (pattern/search injection) + SENSE (health monitoring) |
| **COMPRESS** | Watcher cycle (.jicm-clear-now.signal) | 30-90s async | STORE + CURATE (consolidation, ingest, rotation, NLP compression) |
| **REST** | Watcher idle detection (>30min no prompt) OR high-activity threshold (>50 tools since last summary) | 10-30s async | STORE (summary→RAG, episode→Graphiti) + CURATE (log rotation, MEMORY.md micro-audit) |
| **MAINTAIN** | Watcher periodic (every 100 polls ≈ 100s) | <2s | META (service health pings, collection size monitoring, dashboard data) |

**Emergency fallback** (not a design junction): PreCompact writes a checkpoint via jicm-prep-context.sh. Does NOT trigger consolidation, ingest, rotation, or any other Memory function.

**REST trigger clarification**: The Stop hook fires after every Claude turn — it cannot inject prompts (session is idle). REST functions are triggered by the WATCHER detecting idle conditions, then injecting a "micro-meditation" prompt via tmux. This follows the same proven mechanism as HALT/RESUME injection.

---

## Function-to-Stage Mapping

### BOOT Stage (SessionStart)

| ID | Function | Process | Implementation | Status |
|----|----------|---------|---------------|--------|
| B1 | Compressed context injection | Retrieve | session-start.sh additionalContext | DONE |
| B2 | Scrollback summary injection | Retrieve | session-start.sh reads `.pre-clear-scrollback-summary.md` (full NLP+LLM compressed) | REWIRE |
| B3 | Mandatory RAG search instruction | Retrieve | session-start.sh additionalContext — MANDATORY block | REWIRE |
| B4 | Mandatory Graphiti search instruction | Retrieve | session-start.sh additionalContext — MANDATORY block | REWIRE |
| B5 | Stale signal cleanup | Curate | session-start.sh | DONE |
| B6 | Recent archive loading | Retrieve | session-start.sh gather_recent_archives() | DONE |

**B3/B4 — Mandatory MCP Retrieval Block** (replaces current soft suggestion):
```
MANDATORY CONTEXT RETRIEVAL — Execute these two searches BEFORE any other work:
1. mcp__jarvis-rag__search: query="[current_task_keywords extracted from checkpoint]" collection="sessions" limit=3
2. mcp__jarvis-graphiti__search: query="[current_task_keywords]"
Integrate findings into your understanding. If either returns no results, proceed without.
Do NOT skip these searches. They connect you to prior session knowledge.
```

The keywords are extracted by session-start.sh from the checkpoint's "## Current Task" section via grep/sed — injected dynamically.

### TURN Stage (UserPromptSubmit)

| ID | Function | Process | Implementation | Status |
|----|----------|---------|---------------|--------|
| T1 | JICM gate (threshold sensing) | Meta | jicm-gate.sh | DONE |
| T2 | Context health monitor | Meta/Retrieve | context-health-monitor.js (injects warnings) | DONE |
| T3 | Relevance retrieval — file excerpts | Retrieve (L5→L2) | relevance-retrieval.js pattern matching | DONE |
| T4 | Relevance retrieval — MCP search injection | Retrieve (L4→L2) | relevance-retrieval.js extension | NEW |
| T5 | Self-correction capture | Store (L1) | self-correction-capture.js | DONE |

**T4 — Mid-Session Semantic Search Injection**:

Extend `relevance-retrieval.js` to detect these signals and inject MANDATORY MCP search instructions:

| Signal | Detection Pattern | Injected Instruction |
|--------|-------------------|---------------------|
| Domain shift | Project/topic name not seen in last 5 prompts | `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="<project>" collection="sessions" limit=2]` |
| Recall request | "what did we...", "how did we...", "remember when...", "last time we..." | `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="<extracted topic>" collection="sessions" limit=3 AND mcp__jarvis-graphiti__search query="<topic>"]` |
| Pattern/approach | "pattern", "best practice", "how should I approach" | `[MEMORY RETRIEVAL: Call mcp__jarvis-graphiti__search query="<task domain> methodology"]` |
| Error + path | Error/failure keywords + absolute path | `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="<error context>" collection="codebase"]` |
| Reference lookup | "where is...", "which file...", "find the..." | `[MEMORY RETRIEVAL: Call mcp__jarvis-graphiti__search query="<entity name>"]` |

**Anti-Hyperthymesia**: Session dedup state prevents re-injection of same search within a session. Max 1 MCP instruction per prompt. Threshold: signal must score ≥2 keywords (≥1 if question signal present).

### COMPRESS Stage (JICM Watcher Cycle — Pre-/clear)

This is the **primary consolidation junction**. Fires when context reaches HARD threshold (300K). All curate+store functions that benefit from session-boundary timing cluster here.

| ID | Function | Process | Watcher Step | Status |
|----|----------|---------|-------------|--------|
| W1 | Wait for idle | — | Step 1 | DONE |
| W2 | HALT injection | — | Step 2 | DONE |
| W3 | Wait for ack ("Understood") | — | Step 3 | DONE |
| W4 | Scrollback capture (500-1000 lines) | Store (L1 sensory) | Step 4 (MOVED, was 5.6) | REWIRE |
| W5 | NLP-compress scrollback → summary | Curate (abstraction) | Step 4b (NEW) | NEW |
| W6 | NLP-compress raw JSONL messages | Curate (abstraction) | Step 4c (NEW) | NEW |
| W7 | Prep context (Tier 1 structuring from NLP output + Tier 2 LLM narrative) | Store (L3) | Step 5 | REWIRE |
| W8 | Checkpoint → RAG ingest (dedup 0.92) | Store (L3→L4) | Step 5.5 | DONE |
| W9 | Scrollback summary → RAG ingest | Store (L1→L4) | Step 5.6 (NEW) | NEW |
| W10 | Insights-log rotation (cap 200, archive rest) | Curate (anti-Hyperthymesia) | Step 5.7 (MOVED from session-start) | REWIRE |
| W11 | Corrections → RAG ingest | Store (L1→L4) | Step 5.8 (MOVED from session-start) | REWIRE |
| W12 | Graphiti episode (direct API, not prompt injection) | Store (L3→L5) | Step 5.9 (NEW) | NEW |
| W13 | /clear injection | — | Step 6 | DONE |
| W14 | Wait for resume signal | — | Step 7 | DONE |
| W15 | RESUME injection | Retrieve | Step 8 | DONE |
| W16 | Signal cleanup | — | Step 9 | DONE |

**Key architectural changes:**

**W4 — Scrollback capture expanded to 500-1000 lines**:
```bash
"$JICM_TMUX_BIN" capture-pane -t "$JICM_TMUX_TARGET" -p -S -1000 2>/dev/null
```
Captures the full visible + scrollback buffer. At ~80 chars/line, 1000 lines ≈ 80KB raw.

**W5 — NLP-compress scrollback**:
```bash
python3 "$NLP_SCRIPT" --mode aggressive --input "$SCROLLBACK_RAW" > "$SCROLLBACK_SUMMARY"
```
Raw 80KB → compressed ~40KB (aggressive mode: whitespace collapse + line dedup + truncation). Then LLM summarization in W7 takes this as input alongside JSONL data, producing a dense 2-5KB narrative.

**W6 — NLP-compress JSONL messages BEFORE Tier 1 structuring**:
The raw JSONL messages contain verbose tool results, repeated prompt text, and system boilerplate. NLP compression (standard mode: paragraph dedup, whitespace collapse, divider removal) reduces these by 30-50% before they're selected/truncated into Tier 1 format.

**Pipeline order (repaired)**:
```
Raw scrollback (1000 lines, ~80KB) → NLP aggressive → ~40KB compressed
Raw JSONL messages → NLP standard → 30-50% smaller
Both compressed inputs → Tier 1 structuring → clean markdown
Tier 1 markdown → LLM narrative (qwen3:8b) → 2-5KB checkpoint
Checkpoint → RAG ingest (dedup 0.92)
Scrollback summary → RAG ingest (separate, type=scrollback metadata)
```

**W12 — Graphiti episode via DIRECT API (not prompt injection)**:
Store operations do NOT need Claude involvement. The watcher calls Graphiti's REST API directly (same pattern as jicm-auto-ingest.py calls Qdrant directly):
```bash
GRAPHITI_INGEST="$PROJECT_DIR/.claude/scripts/graphiti-auto-ingest.py"
if [[ "${JICM_GRAPHITI_ENABLED:-true}" == "true" ]] && [[ -x "$ingest_python" ]]; then
    "$ingest_python" "$GRAPHITI_INGEST" \
        --content "$JICM_COMPRESSED_FILE" \
        --name "JICM cycle $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --source "jicm-compression-cycle" &
fi
```

**W10/W11 — Moved from session-start.sh to watcher**:
Rationale: consolidation is about the OLD session's data. It must fire BEFORE /clear while the watcher has async time budget. The session-start hook (post-/clear) should ONLY handle RETRIEVAL into the new context window — not curation of prior data.

### REST Stage (Watcher Idle Detection)

| ID | Function | Process | Implementation | Status |
|----|----------|---------|---------------|--------|
| R1 | Session summary → RAG ingest | Store (L3→L4) | Watcher calls jicm-prep-context.sh + jicm-auto-ingest.py | NEW |
| R2 | Session episode → Graphiti | Store (L3→L5) | Watcher calls graphiti-auto-ingest.py (direct API) | NEW |
| R3 | MEMORY.md micro-audit | Curate (L2/L6) | Watcher injects prompt: "Review MEMORY.md for staleness" | NEW |
| R4 | Log rotation | Curate (anti-Hyperthymesia) | Watcher calls log-rotation.sh (if logs > 100MB) | NEW |
| R5 | Scratchpad freshness check | Curate (L2) | Watcher injects prompt: "Prune stale scratchpad entries" | NEW |

**Trigger mechanism**: The watcher's main loop already detects idle (state-file mtime > JICM_IDLE_GRACE_SEC). Extend with a REST-stage detector:
```bash
REST_TRIGGER_IDLE_SEC=1800          # 30 minutes no user prompt
REST_TRIGGER_TOOL_COUNT=50          # Or 50+ tools since last summary
REST_MARKER="$PROJECT_DIR/.claude/context/.rest-ran-$(date +%Y-%m-%d)"
```

When idle threshold OR tool-count threshold is met AND marker doesn't exist for today:
1. Run R1 (checkpoint + ingest) — async, no Claude needed
2. Run R2 (Graphiti episode) — async, no Claude needed  
3. Run R4 (log rotation check) — async, no Claude needed
4. If session had git commits: inject R3 prompt via tmux ("Watcher here. Session has been idle. Please review MEMORY.md for entries that may be stale given today's work, update if needed, then reply Done.")
5. If scratchpad > 60 lines: inject R5 prompt via tmux
6. Write REST marker file

**R3/R5 use prompt injection** because they require LLM JUDGMENT (intentional memory curation). R1/R2/R4 are purely autonomic (no reasoning needed — just data pipeline operations).

### MAINTAIN Stage (Watcher Periodic — every 100 polls)

| ID | Function | Process | Implementation | Status |
|----|----------|---------|---------------|--------|
| M1 | State refresh (HUD/statusline tokens) | Meta (L6) | refresh_state_from_jsonl() every 5 polls | DONE |
| M2 | Service health ping (Qdrant, MLX, Neo4j) | Meta (L6) | HTTP health check → .memory-health.json | NEW |
| M3 | RAG collection size monitoring | Meta (L6, anti-Hyperthymesia) | Qdrant points_count → warn if > 10000 | NEW |
| M4 | Identity file change detection | Store (L5) | git diff on psyche/ files → queue re-ingestion | NEW |

**M2**: Every 100 polls (~100s), ping:
- Qdrant: `curl -sf --max-time 2 localhost:6333/collections`
- MLX Embed: `curl -sf --max-time 2 localhost:8000/health`
- Neo4j: `curl -sf --max-time 2 localhost:7474`

Write results to `.memory-health.json`. If any service DOWN, write warning to `.memory-health-alert` (consumed by context-health-monitor.js on next TURN as additionalContext warning).

**M3**: Check `curl localhost:6333/collections/sessions | jq .result.points_count`. If > 10000, log warning. Future: implement decay-based pruning of oldest low-relevance entries.

**M4**: Compare mtime of psyche/ files against last-ingestion timestamp. If any file modified since last Graphiti ingestion, queue for re-ingestion at next REST stage. This ensures the identity graph stays current as psyche files evolve.

---

## NLP Compression — Repaired Pipeline

### The Problem (diagnosed)
`compress-input.py` was positioned AFTER Tier 1 structuring. Tier 1 already produces clean non-redundant markdown → NLP achieves nothing (0.99 ratio). The compression algorithms (paragraph dedup, whitespace collapse, line dedup, section dedup, long-line truncation) are correct — they were applied to the wrong input.

### The Fix (pipeline reposition)

**NLP compression now processes RAW inputs where redundancy naturally exists:**

| Input | Mode | Expected Reduction | Rationale |
|-------|------|-------------------|-----------|
| Raw scrollback (1000 lines, ~80KB) | `aggressive` | 40-60% | Terminal output has repeated prompts, status lines, tool-call rendering, blank lines |
| Raw JSONL messages (user + assistant) | `standard` | 30-50% | Tool results are verbose, prompts repeat context, system tags add boilerplate |

**New pipeline position:**
```
                    ┌─── NLP aggressive ───┐
Raw scrollback ─────┤                      ├──→ Tier 1 structuring ──→ LLM narrative
Raw JSONL messages ─┤                      │         │
                    └─── NLP standard ─────┘         │
                                                     ↓
                                              Checkpoint file
                                                     │
                                          ┌──────────┼──────────┐
                                          ↓          ↓          ↓
                                     RAG ingest  Graphiti    BOOT inject
```

### Configuration
```bash
# In jicm-config.sh:
NLP_COMPRESS=true                        # Re-enabled (was: false)
NLP_COMPRESS_SCROLLBACK_MODE="aggressive" # For scrollback (heavy dedup)
NLP_COMPRESS_MESSAGES_MODE="standard"     # For JSONL messages (preserve structure)
NLP_COMPRESS_SCRIPT="$PROJECT_DIR/.claude/scripts/compress-input.py"
```

---

## Graphiti Pre-Population + Ongoing Maintenance

### Initial Corpus (42 files, 350KB)

| Priority | Category | Files | Key Contents |
|----------|----------|-------|-------------|
| P0 | Psyche/identity | 14 | jarvis-identity.md, capability-map.yaml, autopoietic-paradigm.md, self-knowledge/* |
| P0 | Self-constitution | 3 | jarvis-self-constitution-proposal.md, self-constitution-review-2026-02-08.md, EVO-2026-02-010 |
| P1 | Context top-level | 13 | session-state.md, current-plans.md, .active-plan, compaction-essentials.md, dev-session-instructions.md |
| P1 | Root docs | 5 | CLAUDE.md, README.md, jarvis_graph.md, paths-registry.yaml, CHANGELOG.md |
| P2 | Workflows + Guides | 4 | archon-maintenance-workflow.md, autonomous-commands-guide.md, autonomous-commands-quickstart.md |

### Ingestion Method
New script: `.claude/scripts/graphiti-prepopulate.py`
- Iterates corpus files
- For each: reads content, caps at 8000 chars, calls Graphiti MCP REST API directly
- Uses `group_id: "jarvis-core"`
- Tags each episode with `source_type: "identity-corpus"` for later filtering

### Ongoing Maintenance (MAINTAIN stage M4)
When psyche/ or identity files change (detected by mtime comparison):
- Queue changed files for re-ingestion
- Execute at next REST stage (low-priority, async)
- This ensures the relational graph evolves as self-knowledge evolves

### Enable Immediately
```bash
JICM_GRAPHITI_ENABLED=true    # In jicm-config.sh — no deferral
```

---

## Deduplication & Idempotency

### Stage Ownership (no function fires at two stages)

| Function | OLD Triggers | NEW Single Owner | Rationale |
|----------|-------------|-----------------|-----------|
| Scratchpad rotation | PreCompact + SessionStart(clear) | COMPRESS step (pre-/clear) | Rotation is about OLD session data; fire before /clear |
| Insights rotation | SessionStart(clear) | COMPRESS step 5.7 | Same: old session data |
| Corrections consolidation | SessionStart(clear) | COMPRESS step 5.8 | Same: old session data |
| Checkpoint → RAG | Watcher step 5.5 only | COMPRESS step 5.5 | Content-hash dedup makes multi-trigger safe, but single owner is cleaner |
| Session summary → RAG | /meditate-session only | REST stage R1 (autonomic) + /meditate-session (command-linked) | Both paths use same script; marker file prevents double ingest |

### SessionStart(clear) — Now RETRIEVAL-ONLY
After this refactor, session-start.sh (source=clear) does ONLY:
- B1: Inject compressed context
- B2: Inject scrollback summary
- B3: Inject mandatory RAG search instruction
- B4: Inject mandatory Graphiti search instruction
- B5: Clean stale signals
- B6: Load recent archives
- Write resume signal file

It does NOT perform any curation or storage — those moved to COMPRESS stage (watcher pre-/clear steps).

### Multi-Command Safety
All commands that invoke Memory functions check idempotency:
```bash
MARKER="$PROJECT_DIR/.claude/context/.memory-fn-ran-$(date +%Y-%m-%d)"
if [[ -f "$MARKER" ]]; then
    echo "Already ran today — skipping" >&2
    return 0
fi
```

Specific markers:
- `.consolidation-ran-YYYY-MM-DD` — insights rotation + corrections ingest
- `.rest-ran-YYYY-MM-DD` — REST stage functions (summary, episode, log rotation)
- `.graphiti-prepopulate-ran` — one-time corpus ingestion (never re-runs full corpus)

---

## Mid-Session Retrieval Architecture (T4 Detail)

The "rattlesnake reflex" — autonomic recall triggered by environmental signals in the user prompt.

### Detection Layer (relevance-retrieval.js extension)

```javascript
const MCP_SEARCH_SIGNALS = {
  // Domain shift: project name appears that wasn't in recent context
  domain_shift: {
    detect: (prompt, state) => {
      const projects = ["chronicler", "aifred", "pulse", "nexus", "jarvis-dev", "dwarf"];
      const mentioned = projects.filter(p => prompt.toLowerCase().includes(p));
      const recent = state.recent_projects || [];
      return mentioned.filter(p => !recent.includes(p));
    },
    inject: (topic) => `[MANDATORY MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="sessions" limit=2. Apply context from results.]`
  },
  
  // Explicit recall request
  recall: {
    patterns: [/what did we .{3,30}(about|for|with)/i, /how did we .{3,30}/i, /remember when/i, /last time we/i],
    inject: (topic) => `[MANDATORY MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="sessions" limit=3 AND mcp__jarvis-graphiti__search query="${topic}". Synthesize findings.]`
  },
  
  // Pattern/methodology request
  methodology: {
    patterns: [/\bpattern\b/i, /best practice/i, /how should (I|we) approach/i, /what.s the (right|correct) way/i],
    inject: (topic) => `[MEMORY RETRIEVAL: Call mcp__jarvis-graphiti__search query="${topic} methodology pattern". Apply if relevant.]`
  },
  
  // Error debugging with file context
  error_debug: {
    patterns: [/(error|fail|broke|crash|exception).{0,50}(\/Users|\.claude|\.\/)/i],
    inject: (topic) => `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="codebase". Check for prior solutions.]`
  }
};
```

### Anti-Hyperthymesia Guards
- Max 1 MCP injection per prompt (highest-scoring signal wins)
- Session dedup: won't re-inject same search target within a session
- Threshold: score ≥2 keywords (≥1 if question signal detected)
- Cap: injected instruction ≤ 200 chars

---

## Complete Memory Layer Mapping (consolidated from all iterations)

| Layer | Name | Components | Formation (Store) | Pruning (Curate) | Recall (Retrieve) |
|-------|------|-----------|-------------------|------------------|-------------------|
| L1 | Sensory Register | JSONL, scrollback, corrections.jsonl, insights-log | Autonomic: hooks capture signals continuously | COMPRESS: rotation caps, NLP compression | COMPRESS: raw data → structured checkpoint |
| L2 | Working Memory | scratchpad, session-state, active-plan, MEMORY.md, capability-map | Intentional: Claude writes (HALT prompt triggers scratchpad save) | COMPRESS: rotation; REST: micro-audit | BOOT: force-loaded @-imports (always in context) |
| L3 | Short-Term | .compressed-context-ready.md, scrollback-summary, archives | Autonomic: watcher prep script | Time-decay: archives older than 3h excluded from BOOT | BOOT: additionalContext injection |
| L4 | Long-Term Declarative | Qdrant RAG (sessions, jarvis-context, codebase, research) | Autonomic: COMPRESS step 5.5/5.6/5.8; REST step R1 | MAINTAIN: collection size monitoring; dedup threshold 0.92 | BOOT: mandatory MCP instruction; TURN: signal-triggered MCP instruction |
| L5 | Long-Term Procedural | Graphiti Neo4j (entities, relationships, facts); patterns/; reference/; psyche/ | Autonomic: COMPRESS step 5.9; REST step R2; MAINTAIN: identity re-ingest | Graph natural decay (Graphiti built-in edge weight decay) | BOOT: mandatory MCP instruction; TURN: signal-triggered MCP instruction; relevance-retrieval.js file excerpts |
| L6 | Meta-Memory | .jicm-state-hook.json, .memory-health.json, capability-map.yaml, HUD/statusline, dashboard | Autonomic: TURN (health monitor), MAINTAIN (service pings) | N/A (meta-data is always current) | TURN: health warnings as additionalContext; ALWAYS-ON: statusline |

---

## Implementation Plan (7 phases, ~8h total)

### Phase I: Enable Graphiti + Pre-Populate (45min)

1. Set `JICM_GRAPHITI_ENABLED=true` in jicm-config.sh
2. Write `graphiti-prepopulate.py` script (iterates 42 files, calls Graphiti REST API)
3. Execute pre-population (42 episodes × ~20s each = ~15min)
4. Validate: `mcp__jarvis-graphiti__search query="Jarvis identity"` returns entities
5. Write `.graphiti-prepopulate-ran` marker

### Phase II: COMPRESS Stage Rewiring (1.5h)

1. Move consolidation calls from session-start.sh to jicm-watcher.sh:
   - Add steps 5.7 (insights rotation) and 5.8 (corrections consolidation) BEFORE /clear
   - Remove these calls from session-start.sh source=clear block
2. Expand scrollback capture: `-S -200` → `-S -1000`
3. Add step 5.6b: NLP-compress scrollback → `.pre-clear-scrollback-summary.md`
4. Add step 5.9: Graphiti episode (direct API call via new `graphiti-auto-ingest.py`)
5. Write `graphiti-auto-ingest.py` (mirrors jicm-auto-ingest.py pattern for Neo4j)

### Phase III: NLP Compression Repair (1h)

1. Re-enable `NLP_COMPRESS=true` in jicm-config.sh (with new pipeline position)
2. In jicm-prep-context.sh: move NLP call to BEFORE Tier 1 structuring
   - After extracting raw USER_MSGS/ASST_MSGS, pipe through compress-input.py --mode standard
   - Use compressed output in Tier 1 template
3. In jicm-watcher.sh step 4b: pipe raw scrollback through compress-input.py --mode aggressive
4. Validate: run prep script manually, confirm NLP ratio 0.30-0.60 (not 0.99)
5. Add step 5.6c: scrollback summary → RAG ingest (jicm-auto-ingest.py with metadata type=scrollback)

### Phase IV: REST Stage Implementation (2h)

1. Add REST-stage detector to watcher main loop:
   - Track last_user_prompt_time (from .jicm-state-hook.json ts_epoch)
   - Track tool_count_since_last_rest (from JSONL assistant entries)
   - When idle > 1800s OR tools > 50: trigger REST functions
2. Implement R1: call jicm-prep-context.sh + jicm-auto-ingest.py (background, no Claude)
3. Implement R2: call graphiti-auto-ingest.py (background, no Claude)
4. Implement R3: if git commits today, inject MEMORY.md micro-audit prompt via tmux
5. Implement R4: check log sizes, call log-rotation.sh if > 100MB
6. Implement R5: if scratchpad > 60 lines, inject prune prompt via tmux
7. Write `.rest-ran-YYYY-MM-DD` marker after all functions complete

### Phase V: BOOT Stage Strengthening (1h)

1. In session-start.sh: replace soft "Query jarvis-rag..." with MANDATORY block
2. Extract current-task keywords from checkpoint (grep "Current Task" section, take first 50 chars)
3. Inject B3/B4 as structured instruction block in additionalContext
4. Update B2: read `.pre-clear-scrollback-summary.md` instead of raw tail -50

### Phase VI: TURN Stage Extension (1h)

1. Extend relevance-retrieval.js with MCP_SEARCH_SIGNALS (domain shift, recall, methodology, error)
2. Add `recent_projects` tracking to retrieval state
3. Add MCP instruction injection alongside existing file-excerpt injection
4. Validate: test with prompts containing each signal type

### Phase VII: MAINTAIN Stage + Final Validation (1h)

1. Add service health ping to watcher main loop (every 100 polls)
2. Add RAG collection size check (Qdrant points_count)
3. Add identity file change detection (mtime comparison for psyche/ files)
4. Full integration test: trigger a JICM cycle, verify all COMPRESS steps fire
5. Verify REST triggers after 30min idle
6. Verify BOOT retrieval instructions execute on next session start
7. Update session-state.md with Phase 2C completion status

---

## Files Modified/Created (complete manifest)

### Modified
- `.claude/scripts/jicm-config.sh` — GRAPHITI_ENABLED=true, NLP re-enabled, scrollback config, REST thresholds
- `.claude/scripts/jicm-watcher.sh` — Steps 4b/4c/5.6b/5.7/5.8/5.9, REST detector, MAINTAIN health pings
- `.claude/scripts/jicm-prep-context.sh` — NLP pipeline reposition (compress BEFORE structure)
- `.claude/hooks/session-start.sh` — Remove consolidation calls, strengthen B3/B4, read scrollback summary
- `.claude/hooks/relevance-retrieval.js` — Add T4 MCP search signals
- `.claude/scripts/compress-input.py` — Verify modes work on raw scrollback (may need minor adjustment)

### Created
- `.claude/scripts/graphiti-prepopulate.py` — One-time identity corpus ingestion
- `.claude/scripts/graphiti-auto-ingest.py` — Ongoing Graphiti episode ingestion (mirrors jicm-auto-ingest.py)

### Removed (from session-start.sh source=clear path)
- memory-consolidation.sh call (moved to watcher)
- scratchpad-rotate.sh call (moved to watcher, if not already there)

---

## Validation Criteria

| Stage | Test | Pass Condition |
|-------|------|----------------|
| BOOT | Start new session after /clear | additionalContext contains MANDATORY RETRIEVAL block with extracted keywords |
| BOOT | Check scrollback injection | `.pre-clear-scrollback-summary.md` contains NLP-compressed content (not raw 1000 lines) |
| TURN | Submit prompt with "what did we do about the dashboard" | additionalContext contains MCP search instruction for "dashboard" |
| TURN | Submit prompt with project name "chronicler" | RAG search instruction injected for "chronicler" |
| COMPRESS | Trigger JICM cycle (reach 300K or manual) | Steps 5.7/5.8/5.9 fire; insights rotated; Graphiti episode created |
| COMPRESS | Check NLP compression ratio | 0.30-0.60 on raw scrollback (not 0.99) |
| REST | Wait 30min idle OR simulate tool count >50 | REST marker created; checkpoint ingested to RAG; Graphiti episode created |
| MAINTAIN | Wait 100 polls (~100s) | .memory-health.json updated with service status |
| Graphiti | Search "Jarvis identity" | Returns entities from pre-populated corpus |
| Dedup | Run /meditate-session after REST already fired today | Marker file prevents double ingest |

---

*Memory System Wiring Architecture v2.1 (Final) — Project Aion Phase 2C*
*Jarvis Internal Complex Memory: Modelling the bridge between Sense and Purpose+Fulfillment*
