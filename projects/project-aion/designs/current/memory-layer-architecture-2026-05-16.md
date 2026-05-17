# Memory Layer Architecture — Phase 2B Design Document

**Version**: 1.0.0
**Created**: 2026-05-16
**Status**: IMPLEMENTED (Phase 2B-α complete, 2B-β in progress)

---

## Foundational Principles

1. **Context Window is the sole target of Retrieval** — every Retrieve function must deliver data INTO the context window via: force-load, additionalContext, Read tool, MCP result, or CLI injection.
2. **Autonomic first, Intentional second** — if a memory function CAN be automated via hooks/scripts, it SHOULD be. Claude's reasoning capacity is reserved for judgment calls, not plumbing.
3. **Balance Amnesia ↔ Hyperthymesia at every layer** — each layer needs both a Formation mechanism and a Pruning mechanism.
4. **Layer affinity determines placement** — a function belongs in the layer whose pipeline stage it most directly serves.
5. **Freshness and Relevance gate Retrieval** — stale or irrelevant memory entering the context window is worse than no memory.

---

## Six Memory Layers

### L1: Sensory Register (Signal Detection → Awareness)

**"What just happened in the environment?"**

| Component | Process | Trigger | Target |
|-----------|---------|---------|--------|
| JSONL transcripts | Store | Autonomic (harness) | ~/.claude/projects/ |
| tmux scrollback | Store + Retrieve | Autonomic (terminal) + JICM capture | .pre-clear-scrollback.md |
| insight-capture.js | Curate | Autonomic (Stop hook) | insights-log.md |
| self-correction-capture.js | Curate | Autonomic (UPS) | corrections.jsonl |
| cross-project-commit-tracker.js | Curate | Autonomic (PostToolUse) | internal state |

**Anti-Hyperthymesia**: `memory-consolidation.sh` caps insights-log at 200 entries; `log-rotation.sh` manages diagnostic log sizes.

### L2: Working Memory (Interpretation → Abstraction)

**"What am I currently focused on?"**

| Component | Process | Trigger | Context Window Entry |
|-----------|---------|---------|---------------------|
| .scratchpad.md | Store + Retrieve | Intentional / force-loaded | @-import |
| session-state.md | Store + Retrieve | Intentional / force-loaded | @-import |
| .active-plan | Store + Retrieve | Intentional / force-loaded | @-import |
| capability-map.yaml | Retrieve (routing) | Force-loaded | @-import |
| MEMORY.md | Store + Retrieve | Auto-memory protocol | Auto-loaded |

**Anti-Hyperthymesia**: `scratchpad-rotate.sh` fires on SessionStart(clear) AND PreCompact. Threshold: 120 lines.

### L3: Short-Term Memory (Post-/clear Restoration)

**"What was I doing before I forgot?"**

| Component | Process | Trigger | Context Window Entry |
|-----------|---------|---------|---------------------|
| .compressed-context-ready.md | Curate + Store | jicm-prep-context.sh | SessionStart additionalContext |
| .pre-clear-scrollback.md | Curate + Store | Watcher step 5.6 | SessionStart additionalContext |
| gather_recent_archives() | Retrieve | SessionStart hook | additionalContext |
| JICM RESUME prompt | Retrieve | Watcher step 8 | CLI injection |

**Anti-Hyperthymesia**: Checkpoint archives auto-deleted after 7 days (ingested to L4 first).

### L4: Long-Term Declarative (Semantic Knowledge)

**"Searchable accumulated knowledge from all past work"**

| Component | Process | Trigger | Context Window Entry |
|-----------|---------|---------|---------------------|
| RAG sessions collection | Curate + Store | **Autonomic** (jicm-auto-ingest.py) | MCP search → tool result |
| RAG jarvis-context | Store | Manual + consolidation | MCP search → tool result |
| Graphiti (Neo4j) | Store | Manual (/reflect) | MCP search → tool result |

**Anti-Hyperthymesia**: Similarity dial (`JICM_RAG_DEDUP_THRESHOLD=0.92`) prevents redundant ingestion. Content-hash point IDs ensure idempotent upserts.

**Similarity Dial Documentation**:
- Configured in: `.claude/scripts/jicm-config.sh` → `JICM_RAG_DEDUP_THRESHOLD`
- Range: [0.0, 1.0] (0.0 = always ingest, 1.0 = only exact-duplicate skip)
- Default: 0.92
- Monitor: `curl localhost:6333/collections/sessions | jq .result.points_count`
- Adjust up (0.95) if collection growing too fast; down (0.85) if recall quality drops

### L5: Long-Term Procedural (Patterns/Skills/Procedures)

**"How do I do things?"**

| Component | Process | Trigger | Context Window Entry |
|-----------|---------|---------|---------------------|
| patterns/ (57 files) | Store | Written during reflection | **Autonomic** via relevance-retrieval.js |
| reference/ (11 files) | Store | Intentional | Autonomic via relevance-retrieval.js |
| self-corrections.md | Store + Retrieve | Intentional + force-loaded | @-import |
| commands/ + skills/ | Store + Retrieve | Harness skill invocation | Skill execution |

**Autonomic Retrieval**: `relevance-retrieval.js` (UPS hook) matches prompt keywords against pattern triggers, injects excerpts as additionalContext. Session-tracked to prevent re-injection.

### L6: Meta-Memory (Self-knowledge about knowledge)

**"What do I know about what I know?"**

| Component | Process | Trigger | Context Window Entry |
|-----------|---------|---------|---------------------|
| .memory-health.json | Curate + Store | context-health-monitor.js (UPS) | additionalContext when degraded |
| .jicm-state-hook.json | Curate + Store | jicm-gate.sh (UPS) | Read by HUD |
| capability-map.yaml | Retrieve (routing) | Force-loaded | @-import |

**Context bridge**: health warnings inject into context window when layers are degraded (e.g., "L1: insights-log at 1160 lines"). Future: Pulse Dashboard page displays all layer health visually.

---

## Autonomic Functions (Phase 2B additions)

### A. Autonomic Consolidation (L3 → L4)
**Implementation**: `jicm-auto-ingest.py` runs at watcher step 5.5 after compression.
- Reads checkpoint → dedup check → chunk → embed → upsert to Qdrant sessions collection
- Async (non-blocking to JICM cycle)
- ~3s latency including embeddings

### B. Autonomic Relevance-Triggered Retrieval (L5 → L2)
**Implementation**: `relevance-retrieval.js` fires on UserPromptSubmit.
- Keyword matching against 12 pattern categories
- Question-signal detection lowers match threshold
- Session dedup prevents re-injection
- <200ms latency (file reads only, no network)

### C. Autonomic Anti-Hyperthymesia
**Implementation**: Three scripts coordinated by session-start.sh and PreCompact hook.
- `scratchpad-rotate.sh`: caps scratchpad at 120 lines (fires on JICM clear + PreCompact)
- `memory-consolidation.sh`: caps insights-log at 200 entries + ingests archive to RAG
- `log-rotation.sh`: diagnostic logs at 5MB, data logs at 2MB, archive pruning at 7 days

---

## Data Flow Diagram

```
User Prompt → [UPS hooks] → Context Window
                  │
                  ├── jicm-gate.sh (L6: writes token state)
                  ├── relevance-retrieval.js (L5→L2: injects pattern excerpts)
                  ├── context-health-monitor.js (L6→L2: injects health warnings)
                  └── self-correction-capture.js (L1: captures corrections)

JICM Cycle:
  threshold hit → HALT → prep-context.sh (L3: write checkpoint)
                       → auto-ingest.py (L4: checkpoint → RAG)
                       → capture-pane (L1: scrollback preservation)
                       → /clear
                       → session-start.sh (L3→L2: inject checkpoint + scrollback)
                       → RESUME

Periodic:
  scratchpad-rotate.sh (L2: anti-Hyperthymesia)
  memory-consolidation.sh (L1→L4: insights + corrections to RAG)
  log-rotation.sh (L1: disk hygiene)
```

---

## Configuration Reference

All memory system config lives in `.claude/scripts/jicm-config.sh`:

| Variable | Default | Purpose |
|----------|---------|---------|
| JICM_RAG_ENABLED | true | Master toggle for L4 auto-ingest |
| JICM_RAG_COLLECTION | sessions | Target Qdrant collection |
| JICM_RAG_DEDUP_THRESHOLD | 0.92 | Similarity dial (see L4 section) |
| JICM_RAG_QDRANT_URL | http://localhost:6333 | Qdrant endpoint |
| JICM_RAG_EMBED_URL | http://localhost:8000 | MLX embedding endpoint |
| JICM_GRAPHITI_ENABLED | false | Graphiti entity extraction (future) |

---

## Monitoring

- **File**: `.claude/context/.memory-health.json` (updated every UPS event)
- **Dashboard**: Future Pulse page (Task 6) will visualize per-layer health bars
- **Telemetry**: `.claude/logs/telemetry/memory-health-YYYY-MM-DD.jsonl`
- **Manual check**: `cat .claude/context/.memory-health.json | jq .overall`

---

*Memory Layer Architecture v1.0.0 — Phase 2B (2026-05-16)*
