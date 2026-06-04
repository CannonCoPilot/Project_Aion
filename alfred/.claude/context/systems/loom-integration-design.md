# Loom Integration Design — Training Captures as Context Nodes

**Purpose**: Define how golden I/O pairs from the training capture layer become queryable content nodes for few-shot retrieval during persona runs.
**Parent task**: AIProjects-fcmx (Design NEXUS Training Data Capture Layer)
**Orchestration**: T3.1 — Loom Integration Design
**Schema reference**: `loom-training-schema.md` (v1.2)
**Created**: 2026-03-29

---

## Current State of Loom

Loom currently exists as a **determinism-focused model routing engine** (`~/Code/loom/determinism/`). It provides:
- A routing table (`routing_data/routing-table.yaml`) for model/temperature selection
- A SQLite backend for experiment storage (`database.py`)
- JSONL utilities for metrics (`storage.py`)
- Provider registry for engine abstraction (`providers.py`)

There is **no content graph, no node storage, and no retrieval system** today. Loom is purely a routing layer. This design extends Loom with a lightweight content node system built on JSONL + filesystem — no graph database needed for the initial implementation.

---

## 1. Content Node Mapping

A training capture record becomes a Loom content node when it meets quality criteria. Not every capture becomes a node — only golden-tier records (with `human_feedback: "agreed"` or high-confidence successful executions).

### Capture Record → Content Node Field Mapping

| Capture Field (schema v1.2) | Content Node Field | Purpose |
|-----|-----|-----|
| `capture_id` | `source_capture_id` | Provenance link back to raw capture |
| `persona` | `persona` | Retrieval filter — nodes are persona-scoped |
| `input.task_labels[]` | `domain`, `type`, `stage` | Parsed from labels for faceted query |
| `input.task_titles[]` | `task_summary` | Human-readable context for similarity matching |
| `persona_data.*` | `action_summary` | Persona-specific decision/action summary |
| `quality.human_feedback` | `quality_tier` | golden / correction / silver |
| `quality.confidence` | `confidence` | high / medium / low |
| `output.response_length` | `response_length` | For selecting appropriately-sized examples |
| `result.exit_code` | `is_success` | Boolean — successful execution |
| `tokens.input` + `tokens.output` | `total_tokens` | Cost-awareness for retrieval |
| `timestamp` | `captured_at` | Recency weighting |
| `input.prompt_file` | `prompt_path` | Pointer to full prompt text |
| `output.response_file` | `response_path` | Pointer to full response text |

### Content Node Schema

```jsonc
{
  "node_id": "ln-{uuid}",                    // Loom node ID
  "source_capture_id": "cap-abc123",         // Links to training capture
  "persona": "ai-david",                     // Primary retrieval key
  "domain": "nexus",                         // From task labels (domain:nexus)
  "type": "research",                        // From task labels (type:research)
  "stage": "queue",                          // Stage when captured
  "task_summary": "Adopt Decision Audit Trail for AI David",
  "action_summary": "execute — approved research task, safe risk, high confidence",
  "quality_tier": "golden",                  // golden | correction | silver
  "confidence": "high",
  "is_success": true,
  "response_length": 4500,
  "total_tokens": 110000,
  "captured_at": "2026-03-29T07:50:00Z",
  "prompt_path": "content/cap-abc123-prompt.txt",   // Relative to training dir
  "response_path": "content/cap-abc123-response.txt",
  "embedding_text": null,                    // Phase 2: for vector similarity
  "tags": ["approve-research-safe"]          // From persona_data.pattern_matched
}
```

### Persona-Specific `action_summary` Construction

| Persona | `action_summary` Template |
|---------|--------------------------|
| AI David | `"{action} — {reasoning_first_100_chars}, {risk} risk, {confidence} confidence"` |
| Orchestrator | `"routed {tasks_routed} tasks — {routes[0].method}: {routes[0].routed_to_persona}"` |
| Task Executor | `"completed {tasks_completed}/{tasks_received} — {files_modified_count} files modified"` |
| Researcher | `"{research_type} — {sources_checked} sources, signal: {has_signal}"` |
| Infra Deployer | `"deployed {service_name} — health: {health_check}, rollback: {rollback_triggered}"` |
| ARC Agent | `"{game_id}: {outcome}, {levels_completed}/{win_levels} levels, {total_actions} actions — {final_understanding_first_100_chars}"` |

---

## 2. Storage Strategy

### Per-Persona Pools (Recommended)

Content nodes are stored in **per-persona JSONL files** rather than a single shared pool.

```
.claude/data/loom/
├── nodes/
│   ├── ai-david.jsonl          # AI David golden examples (~300 nodes after 3 weeks)
│   ├── orchestrator.jsonl      # Routing decisions
│   ├── task-executor.jsonl     # Execution traces
│   ├── researcher.jsonl        # Research summaries
│   ├── infra-deployer.jsonl    # Infrastructure deployments
│   ├── task-evaluator.jsonl    # Evaluation decisions
│   └── arc-agent.jsonl         # ARC-AGI-3 game knowledge (action maps, mechanics, strategies)
├── index/
│   └── node-index.jsonl        # Cross-persona index for global queries
└── config/
    └── loom-nodes.yaml         # Node generation config (thresholds, limits)
```

**Why per-persona files**:
- Retrieval is always persona-scoped — a persona only needs its own examples
- File sizes stay small: ~300-500 nodes per persona = 150-500 KB per file
- `jq` queries stay fast on small files
- No cross-persona pollution in few-shot examples
- Independent rotation per persona

### Indexing

Each JSONL file is the index. Fields are designed for `jq` filtering:

```bash
# Find AI David's golden examples for nexus domain research tasks
jq -c 'select(.domain == "nexus" and .type == "research" and .quality_tier == "golden")' \
    .claude/data/loom/nodes/ai-david.jsonl

# Find the 5 most recent high-confidence orchestrator routing decisions
jq -c 'select(.confidence == "high")' .claude/data/loom/nodes/orchestrator.jsonl \
    | tail -5

# Find correction examples (where human disagreed — negative training signal)
jq -c 'select(.quality_tier == "correction")' .claude/data/loom/nodes/ai-david.jsonl
```

### Cross-Persona Index

`node-index.jsonl` contains lightweight references for cross-persona queries (e.g., "how many golden nodes exist across all personas?"):

```jsonc
{
  "node_id": "ln-abc123",
  "persona": "ai-david",
  "domain": "nexus",
  "quality_tier": "golden",
  "captured_at": "2026-03-29T07:50:00Z"
}
```

---

## 3. Retrieval Use Case — Few-Shot Example Injection

### When a Persona Runs

During prompt assembly in `executor.sh` (lines 340-453), the executor can optionally inject few-shot examples from Loom content nodes. This happens **after** the persona prompt is loaded but **before** the task-specific prompt.

### Query Interface

A shell function `loom_get_examples()` retrieves relevant content nodes:

```bash
loom_get_examples() {
    local persona="$1"        # Required: which persona's pool
    local domain="$2"         # Optional: domain:nexus, domain:coding, etc.
    local type="$3"           # Optional: type:research, type:fix, etc.
    local max_examples="${4:-3}"  # Default: 3 examples
    local quality="${5:-golden}"  # Default: golden tier only

    local node_file=".claude/data/loom/nodes/${persona}.jsonl"
    [[ ! -f "$node_file" ]] && return 0

    # Build jq filter
    local filter='select(.quality_tier == "'"$quality"'")'
    [[ -n "$domain" ]] && filter="$filter | select(.domain == \"$domain\")"
    [[ -n "$type" ]] && filter="$filter | select(.type == \"$type\")"

    # Get matching nodes, most recent first, limited to max_examples
    local nodes
    nodes=$(jq -c "$filter" "$node_file" | sort -t'"' -k2 -r | head -"$max_examples")

    # For each node, load the response file and format as a few-shot example
    while IFS= read -r node; do
        local response_path
        response_path=$(echo "$node" | jq -r '.response_path')
        local task_summary
        task_summary=$(echo "$node" | jq -r '.task_summary')
        local action_summary
        action_summary=$(echo "$node" | jq -r '.action_summary')

        local response_file=".claude/data/training/${response_path}"
        [[ ! -f "$response_file" ]] && continue

        echo "---"
        echo "EXAMPLE — Task: ${task_summary}"
        echo "Action taken: ${action_summary}"
        echo "Response:"
        # Truncate to first 2000 chars to control prompt size
        head -c 2000 "$response_file"
        echo ""
    done <<< "$nodes"
}
```

### Prompt Assembly Integration

In `executor.sh`, after persona prompt load (~line 362):

```bash
# Inject few-shot examples from Loom (if available and enabled)
if [[ "${LOOM_FEWSHOT_ENABLED:-false}" == "true" ]]; then
    LOOM_EXAMPLES=$(loom_get_examples "$PERSONA_NAME" "$TASK_DOMAIN" "$TASK_TYPE" 3)
    if [[ -n "$LOOM_EXAMPLES" ]]; then
        FULL_PROMPT="${FULL_PROMPT}

## Successful Past Examples (for reference)

${LOOM_EXAMPLES}

## Current Task
"
    fi
fi
```

### Token Budget Control

Few-shot examples add to prompt length. Safeguards:
- **Max 3 examples** per run (default)
- **2000 char truncation** per example response
- **Total few-shot budget**: ~6-8 KB added to prompt (well within the 20-80 KB typical prompt range)
- Toggle: `LOOM_FEWSHOT_ENABLED=true` in nexus-settings.json (default: false)
- If prompt exceeds a configurable threshold (e.g., 100 KB), skip few-shot injection

### Retrieval Priority

When multiple nodes match the query, prioritize by:
1. **Quality tier**: golden > correction > silver
2. **Domain + type match**: exact match > domain-only match > any
3. **Recency**: newer examples reflect current patterns better
4. **Diversity**: avoid multiple examples from the same task — deduplicate by `task_summary`

---

## 4. Storage Location

### Primary Location

```
${PROJECT_DIR}/.claude/data/loom/
```

This keeps Loom nodes in the AIProjects data directory, co-located with the training capture data at `.claude/data/training/`. The `data/` directory is already excluded from MCP exposure by the `isExcluded()` filter in homelab-mcp.

### Size Estimates

| Persona | Nodes/Month | File Size/Month | After 6 Months |
|---------|-------------|-----------------|----------------|
| AI David | ~100-150 golden | 50-100 KB | 300-600 KB |
| Orchestrator | ~80-120 | 40-80 KB | 240-480 KB |
| Task Executor | ~60-100 | 30-60 KB | 180-360 KB |
| Researcher | ~10-20 | 5-15 KB | 30-90 KB |
| Infra Deployer | ~20-40 | 10-25 KB | 60-150 KB |
| Task Evaluator | ~50-80 | 25-50 KB | 150-300 KB |
| **Total** | **~320-510** | **160-330 KB** | **~1-2 MB** |

Negligible storage. The content node files are metadata pointers — the actual prompt/response text lives in `.claude/data/training/content/`.

---

## 5. Rotation and Growth Policy

### Growth Control

Content nodes are inherently bounded because only golden-tier records qualify. With ~80 runs/day and ~30-40% golden rate (after human review ramp-up), expect ~25-35 new nodes/day across all personas.

### Rotation Rules

| Rule | Trigger | Action |
|------|---------|--------|
| **Cap per persona** | >1000 nodes in a persona file | Evict oldest silver-tier nodes until under cap |
| **Golden is permanent** | Never | Golden nodes are never rotated — they are the curated corpus |
| **Correction cap** | >200 correction nodes per persona | Keep most recent 200, archive rest |
| **Silver aging** | Silver node >90 days old without promotion to golden | Remove from node file |
| **Duplicate detection** | Same `prompt_hash` as existing node | Skip — don't create duplicate node |
| **Seasonal refresh** | Quarterly | Review and prune nodes referencing deprecated patterns, old label taxonomies, or decommissioned services |

### Node Promotion Flow

```
Training Capture (all runs)
    ↓ filter: exit_code=0, human_feedback="agreed"
Content Node (golden tier)
    ↓ filter: confidence="high", is_success=true
Few-Shot Candidate (retrievable by personas)
```

Records without human feedback can be provisionally added as silver-tier nodes (queryable but lower priority). When feedback arrives via the quality backfill mechanism, nodes are promoted to golden or reclassified as corrections.

### Node Generation Script

A `generate-loom-nodes.sh` script runs daily at 07:00 UTC (after curation completes at 06:00):
1. Reads curated records from `.claude/data/training/golden/curated-index.jsonl` (output of `curate-training-data.sh`)
2. Does NOT re-read raw captures or re-score — the curation pipeline already handles quality gating
3. Filters for records not yet in any persona node pool (by `source_capture_id`)
4. Deduplicates against existing nodes (by `prompt_hash`)
5. Appends new content nodes to the appropriate persona JSONL file
6. Updates the cross-persona index

Register as Nexus cron job `loom-node-gen` in registry.yaml.

---

## Phase 2: Vector Similarity (Future)

When the node pool grows large enough (>500 nodes per persona), switch from `jq` filtering to embedding-based retrieval:

1. Generate embeddings for the `embedding_text` field (task_summary + action_summary) using a local embedding model via Ollama (e.g., `nomic-embed-text`)
2. Store embeddings in a lightweight vector index (SQLite + numpy, or ChromaDB)
3. At query time, embed the current task description and find nearest neighbors
4. Fall back to `jq` filtering if the embedding service is unavailable

This is not needed for Phase 1 — `jq` filtering by domain/type/quality is sufficient for pools under 500 nodes.

---

## Integration with Existing Loom Code

The content node system is independent of the existing Loom routing engine (`~/Code/loom/determinism/`). They share the Loom name but serve different purposes:

| Loom Component | Purpose | Storage |
|----------------|---------|---------|
| **Routing engine** | Model/temperature selection | SQLite + YAML routing table |
| **Content nodes** (new) | Few-shot example retrieval | JSONL files in AIProjects |

Future integration: the routing engine could use content node quality signals (e.g., "which model produced the most golden-tier outputs for this task type?") to refine its routing recommendations. This is a Phase 3+ consideration.

---

## Settings

Add to `nexus-settings.json`:

```json
{
  "loom_nodes": {
    "enabled": false,
    "fewshot_enabled": false,
    "max_examples": 3,
    "max_example_chars": 2000,
    "max_prompt_with_fewshot": 102400,
    "node_dir": ".claude/data/loom",
    "quality_threshold": "golden",
    "silver_ttl_days": 90,
    "max_nodes_per_persona": 1000,
    "max_corrections_per_persona": 200
  }
}
```

---

## Next Steps

- **T3.2**: Fine-tuning export format and LoRA adapter strategy (parallel deliverable)
- **Implementation**: Node generation script (`generate-loom-nodes.sh`)
- **Implementation**: `loom_get_examples()` function in executor.sh
- **Implementation**: nexus-settings.json entries for Loom node config
- **Phase 2**: Embedding-based retrieval when node pools exceed 500
