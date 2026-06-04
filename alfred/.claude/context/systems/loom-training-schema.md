# Loom Training Data Capture Schema — v1.2

**Purpose**: Define the golden I/O pair schema for capturing NEXUS agent runs as structured training data for future LoRA adapter fine-tuning and Loom context graph enrichment.

**Parent task**: AIProjects-fcmx (Design NEXUS Training Data Capture Layer)
**Orchestration**: T1.1 — Golden I/O Pair Schema Design
**Created**: 2026-03-29
**Revised**: 2026-03-29 (v1.2 — added tool call capture, phased build plan, updated size estimates)

---

## Design Principles

1. **Capture at the executor level** — one integration point covers all 26 personas (plus a secondary hook for team-runner.py consensus)
2. **Index + Content split** — lightweight JSONL index stays queryable with jq; full prompt/response text lives in separate files
3. **Persona-agnostic core + persona-specific extensions** — universal fields for all, optional fields per persona type
4. **Quality signals are backfilled** — capture happens at execution time; quality signals arrive asynchronously and are correlated by capture_id
5. **Capture both success and failure** — failed executions are high-value negative training examples
6. **Compatible with HuggingFace datasets** — JSONL rows map to instruction/input/output format for fine-tuning export

---

## Architecture: Index + Content Split (Option B)

```
.claude/data/training/
├── index/
│   ├── captures-2026-03-29.jsonl     # Daily index (metadata only, ~1-3 KB/record)
│   └── captures-2026-03-30.jsonl
├── content/
│   ├── cap-abc123-prompt.txt          # Full prompt text (10-100 KB typical)
│   ├── cap-abc123-response.txt        # Full response text (1-50 KB typical)
│   ├── cap-def456-prompt.txt
│   └── cap-def456-response.txt
├── quality/
│   └── backfill-2026-03-29.jsonl      # Quality signal updates (append-only)
└── archive/
    └── 2026-Q1/                       # Quarterly archive bundles
```

**Why this split**: Full prompts average 20-80 KB, responses 5-30 KB. Inline JSONL would produce 50-200 KB per record, making jq queries slow and files multi-GB per week. The index stays small and queryable; content is loaded on demand.

---

## Schema Definition

### Index Record (every execution — written to `index/captures-YYYY-MM-DD.jsonl`)

```jsonc
{
  // === Identity ===
  "capture_id": "cap-{uuid}",              // Unique correlation ID
  "version": "1.2",                         // Schema version

  // === Timing ===
  "timestamp": "2026-03-29T07:50:00Z",     // ISO 8601 UTC
  "duration_s": 66,                         // Wall-clock execution time

  // === Executor Context ===
  "job_name": "ai-david",                   // From registry.yaml
  "persona": "ai-david",                    // Persona name
  "persona_tier": "evaluate-and-route",     // Permission tier
  "engine": "claude-code",                  // claude-code | ollama | gemini-api
  "session_id": "headless-ai-david-20260329-075000",

  // === Model Info ===
  "model_requested": "opus",               // From persona config.yaml
  "model_actual": "claude-opus-4-6",       // From modelUsage (null for ollama/gemini)
  "router_model": "claude-opus-4-6",       // LLM router recommendation
  "router_overridden": false,              // Was persona's pinned model used instead?

  // === Token Usage (null for ollama/gemini — fields not available in their response envelopes) ===
  "tokens": {
    "input": 8,                            // null for ollama/gemini
    "output": 2236,                        // null for ollama/gemini
    "cache_read": 106193,                  // null for ollama/gemini
    "cache_creation": 40427,               // null for ollama/gemini
    "cache_hit_ratio": 72.4                // null for ollama/gemini
  },
  "cost_usd": 0.217,                      // 0 for ollama, from API for gemini

  // === Input (Prompt Side) ===
  "input": {
    "prompt_hash": "sha256:abc123...",      // Hash of full assembled prompt (for dedup/drift)
    "prompt_file": "content/cap-abc123-prompt.txt",  // Relative path to full prompt
    "prompt_length": 45000,                 // Char length of full prompt
    "prompt_components": {
      "persona_prompt_hash": "sha256:def456...", // Hash of persona prompt.md
      "job_prompt_length": 1200,
      "session_history_length": 0,
      "param_count": 2
    },
    "task_ids": ["AIProjects-67sl"],        // Array — supports multi-task personas
    "task_titles": ["Adopt Decision Audit Trail for AI David"],
    "task_labels": ["domain:nexus", "type:research", "stage:review"],
    "allowed_tools": ["Read", "Glob", "Grep", "WebFetch", "mcp__*"]
  },

  // === Output (Response Side) ===
  "output": {
    "response_file": "content/cap-abc123-response.txt",  // Relative path to full response
    "response_length": 4500,               // Char length
    "stop_reason": "end_turn",             // end_turn | max_turns | max_budget | error | null (ollama/gemini)
    "is_error": false,
    "subtype": "success",                  // success | error_max_turns | error_max_budget | error | failure
    "num_turns": 12,                       // Actual turns (1 for ollama/gemini — hardcoded, not actual)
    "signals_detected": {
      "review": null,                      // REVIEW_APPROVE | REVIEW_REJECT | null
      "pause": null,                       // PAUSE reason or null
      "critical": false,                   // CRITICAL/URGENT/SECURITY pattern found
      "directives_count": 0               // Number of embedded directives
    }
  },

  // === Execution Result ===
  "result": {
    "exit_code": 0,                        // 0=success, 1=failure, 124=timeout
    "error_class": null,                   // null | auth | transient | fatal
    "attempt": 1,                          // Which retry attempt (1 = first try)
    "attempts_total": 1,                   // Total attempts before final result
    "budget_pct_used": 45.2,              // Daily budget percentage at execution time
    "is_failure": false                    // true for records captured in failure branch
  },

  // === Quality Signals (backfilled via quality/ directory) ===
  "quality": {
    "quality_filled_at": null,             // ISO 8601 timestamp when backfill occurred
    "human_feedback": null,               // agreed | adjust | wrong
    "feedback_comment": null,
    "execution_outcome": null,            // success | paused | failed | skipped
    "tasks_closed": null,                 // Number of associated tasks that were eventually closed
    "confidence": null                    // high | medium | low (from persona output)
  },

  // === Record Type ===
  "record_type": "execution",             // execution | failure | team_consensus | trajectory

  // === Persona-Specific Extension ===
  "persona_data": {}                      // See extensions below
}
```

### Failure Records

Captured in the executor.sh failure branch (exit code != 0). Same schema, with:
- `result.is_failure: true`
- `result.error_class`: auth | transient | fatal
- `output.response_file`: may be null (no response on auth failures)
- `output.subtype`: "failure"
- `record_type`: "failure"

Failures are valuable negative examples. A persona that attempted a task and failed teaches what NOT to do.

### Team Consensus Records

Captured in team-runner.py after member verdicts are synthesized:
- `record_type`: "team_consensus"
- `persona_data.member_verdicts`: array of {persona, decision, confidence}
- `persona_data.consensus`: final team decision
- `persona_data.conflict_resolution`: how disagreements were resolved
- No `prompt_file` (consensus logic is code, not a prompt)

### Trajectory Records (ARC-AGI-3)

Captured by the Python exporter (`~/Code/arc-agi-3/training/loom_exporter.py`) after each game run. These are NOT prompt/response pairs — they are state-action trajectory sequences from turn-based game play.

- `record_type`: "trajectory"
- `persona`: "arc-agent" (separate node pool from Nexus personas)
- `job_name`: "context-agent" (LLM-powered) or "random" (baseline)
- `output.subtype`: "win" | "loss" | "timeout"
- `output.num_turns`: total game actions taken
- `tool_calls_file`: points to trajectory JSONL (not tool calls — each line is a turn: `{turn, action, data, reasoning, cells_changed, state, levels}`)
- `input.prompt_file`: system prompt + pre-game synthesis
- `output.response_file`: serialized RunMemory (accumulated game knowledge)

**Content files**:
- `cap-arc-{game_id}-prompt.txt` — system prompt + synthesis briefing
- `cap-arc-{game_id}-response.txt` — serialized RunMemory JSON
- `cap-arc-{game_id}-trajectory.jsonl` — per-turn action log

**Quality scoring signals** (for curation pipeline):

| Signal | Weight | Detection |
|--------|--------|-----------|
| Game won | +0.40 | `persona_data.won == true` |
| Levels completed > 0 | +0.20 | `persona_data.levels_completed > 0` |
| Efficient (actions < median) | +0.10 | Compare against running median |
| Zero levels completed | -0.30 | `persona_data.levels_completed == 0` |
| Random agent baseline | -0.50 | `job_name == "random"` |

**Gating**: Export controlled by `LOOM_EXPORT_ENABLED=true` env var in the ARC-AGI-3 agent.

---

### Persona-Specific Extensions

Each persona type populates the `persona_data` field with role-specific metadata extracted from the response.

#### AI David (`persona: ai-david`)
```jsonc
{
  "action": "execute",                     // execute | propose | escalate | defer | close | skip
  "confidence": "high",
  "risk": "safe",
  "pattern_matched": "approve-research-safe",
  "pattern_source": "learned-patterns.yaml",
  "reasoning": "...",
  "value": "...",
  "effort": "small",
  "reversible": true,
  "labels_added": ["pipeline:approved"],
  "labels_removed": ["waiting:david"]
}
```

#### Task Evaluator (`persona: task-evaluator`)
```jsonc
{
  "tasks_evaluated": 5,
  "results": [
    {
      "task_id": "AIProjects-xyz",
      "outcome": "ready",
      "risk": "safe",
      "scope": "single-task",
      "completeness_score": 7,
      "capability": "research",
      "orchestration_generated": false,
      "dedup_detected": false
    }
  ]
}
```

#### Orchestrator (`persona: orchestrator`)
```jsonc
{
  "dry_run": true,
  "tasks_routed": 3,
  "routes": [
    {
      "task_id": "AIProjects-xyz",
      "method": "deterministic",
      "rule_matched": "type-research",
      "classification": {
        "type": "research",
        "domain": "nexus",
        "risk": "safe",
        "capability": "research"
      },
      "routed_to_persona": "researcher",
      "stage_transition": "intake -> queue",
      "confidence": "high"
    }
  ]
}
```

#### Researcher (`persona: researcher`)
```jsonc
{
  "research_type": "investigation",
  "sources_checked": 5,
  "has_signal": true,
  "obsidian_path": "05-AI/Claude-Research/infrastructure/2026-03-29-topic.md",
  "summary_template": "investigation",
  "quality_checks": {
    "primary_sources": 3,
    "dates_verified": true,
    "uncertainty_flagged": true
  }
}
```

#### Infrastructure Deployer (`persona: infrastructure-deployer`)
```jsonc
{
  "tasks_received": 2,
  "results": [
    {
      "task_id": "AIProjects-xyz",
      "status": "completed",
      "service_name": "prometheus",
      "container": "prometheus",
      "port": 9090,
      "health_check": "pass",
      "files_modified": ["Docker/monitoring/docker-compose.yaml"],
      "rollback_triggered": false
    }
  ]
}
```

#### Task Executor / Autofix (`persona: autofix-executor`)
```jsonc
{
  "tasks_received": 5,
  "tasks_completed": 3,
  "tasks_skipped": 1,
  "tasks_paused": 1,
  "results": [
    {
      "task_id": "AIProjects-xyz",
      "status": "completed",
      "files_modified": [".claude/context/systems/nexus.md"],
      "git_committed": true
    }
  ]
}
```

#### ARC Game Agent (`persona: arc-agent`)
```jsonc
{
  "game_id": "sc25-f9b21a2f",
  "won": true,
  "levels_completed": 3,
  "win_levels": 3,
  "total_actions": 45,
  "action_map": {"ACTION1": "moves player up", "ACTION2": "moves player down"},
  "mechanics": ["border acts as wall", "colored cells are goals"],
  "final_understanding": "Navigate player to match reference pattern...",
  "reflections_count": 4,
  "level_summaries": [
    {"level": 1, "outcome": "win", "actions_taken": 12, "duration_secs": 8.5}
  ]
}
```

---

## Storage Design

### Size Estimates (corrected)

| Component | Per Record | Per Day (80 runs) | Per Week | Per Month |
|-----------|------------|-------------------|----------|-----------|
| Index JSONL | 1-3 KB | 80-240 KB | 0.5-1.7 MB | 2-7 MB |
| Prompt text file | 20-80 KB | 1.6-6.4 MB | 11-45 MB | 48-192 MB |
| Response text file | 5-30 KB | 0.4-2.4 MB | 3-17 MB | 12-72 MB |
| **Total** | **26-113 KB** | **2-9 MB** | **14-64 MB** | **62-271 MB** |

At ~80 runs/day (current Nexus throughput): **~1-3 GB per quarter** for all data. Manageable.

### Rotation Strategy

- **Index files**: Daily rotation (`captures-YYYY-MM-DD.jsonl`) — small, always fast to query
- **Content files**: Accumulate in `content/` — files are small individually, cleanup driven by retention policy
- **Quality backfill**: Daily rotation (`backfill-YYYY-MM-DD.jsonl`)
- **Archive**: Quarterly bundles to `archive/YYYY-QN/` with tar.gz compression

### Quality Signal Backfill

Quality signals are written to `quality/backfill-YYYY-MM-DD.jsonl` as correlation records:

```jsonc
{
  "capture_id": "cap-abc123",             // Links to index record
  "quality_filled_at": "2026-03-30T14:00:00Z",
  "human_feedback": "agreed",
  "feedback_comment": null,
  "execution_outcome": "success",
  "tasks_closed": 1
}
```

A merge script combines index + backfill records by `capture_id` for export. The index file itself is **never modified after write** — quality data lives in the backfill file. This keeps the append-only guarantee.

### Correlation Strategy

Records are correlated by:
1. **capture_id** — primary key, globally unique, present in index + backfill + content filenames
2. **task_ids[]** — array of all Pulse task IDs processed in this run (fixes multi-task correlation)
3. **session_id** — links to executor session and raw output file in `logs/headless/executions/`

**Correlation paths**:
- Index → backfill: by `capture_id` (exact match)
- Index → content files: by `capture_id` in filename
- Feedback.jsonl → capture: by `task_id` + timestamp window (feedback.jsonl has no `capture_id`) — window: capture_ts <= feedback_decision_ts <= capture_ts + 7d
- Pulse task status → capture: by `task_ids[]` array lookup

---

## Capture Points in Executor

### Primary: Success path (executor.sh, after line ~1140)

After `$RESPONSE` is extracted from `$RESULT` and signal extraction completes. All metadata variables are in scope.

### Secondary: Failure path (executor.sh, around line ~1081-1090)

Before `exit 1`. Captures partial data:
- `$FULL_PROMPT` is available (prompt was assembled before invocation)
- `$RESULT` may be empty or contain error text
- `$EXEC_EXIT_CODE`, `$ERROR_CLASS` are set
- Token counts may be unavailable (set to null)
- `result.is_failure: true` flags these records

### Tertiary: Team consensus (team-runner.py, after verdict synthesis)

After all member executor.sh runs complete and consensus is determined.
- No prompt/response files (consensus is code logic, not LLM)
- `persona_data` contains member verdicts and resolution
- `record_type: "team_consensus"`

### Capture Toggle

Environment variable: `TRAINING_CAPTURE_ENABLED=true|false`
- Default: `false` (no capture until explicitly enabled)
- Set in `nexus-settings.json` or executor env
- When disabled, zero overhead — no file I/O, no hashing

### Engine-Specific Field Availability

| Field | claude-code | ollama | gemini-api |
|-------|-------------|--------|------------|
| tokens.* | Available | null | null |
| cost_usd | Available | 0 | Available |
| model_actual | From `.modelUsage` | null (use model_requested) | null (use model_requested) |
| stop_reason | Available | null | null |
| num_turns | Actual | 1 (hardcoded) | 1 (hardcoded) |
| output.subtype | Available | "success" or "failure" | "success" or "failure" |

---

## Retention Strategy & Training Data Requirements

### How Much Data Do We Need?

Based on LoRA/QLoRA research (see `deep-research/2026-03-29_lora-qlora-training-data-requirements.md`):

| Training Target | Min Examples | Good | Diminishing Returns | Time to Accumulate (80 runs/day) |
|----------------|-------------|------|---------------------|--------------------------------|
| **Task classification/routing** (orchestrator) | 200-500 | 500-1,000 | ~2,000 | 3-6 days → min, 6-12 days → good |
| **Bash command generation** (task-executor) | 500-1,000 | 1,000-3,000 | ~5,000 | 6-12 days → min (filtered to executor runs) |
| **Decision-making** (AI David) | 1,000-2,000 | 2,000-5,000 | ~10,000 | 12-25 days → min (filtered to AI David) |
| **Research summarization** (researcher) | 500-1,000 | 1,000-3,000 | ~5,000 | ~60 days → min (researcher runs less often) |

**Key insight**: Quality >> Quantity. 1 expert-curated example = 10-50 synthetic examples (LIMA paper). Records with `human_feedback: "agreed"` are worth 10x raw captures.

### Retention Tiers

| Tier | Criteria | Retention | Purpose |
|------|----------|-----------|---------|
| **Golden** | `human_feedback: "agreed"` + `is_failure: false` | Permanent | Core training corpus |
| **Correction** | `human_feedback: "adjust"` or `"wrong"` | Permanent | Negative examples + corrections |
| **Silver** | Successful execution, no human feedback yet | 90 days | Bulk training, awaiting feedback |
| **Failure** | `is_failure: true` | 90 days | Negative signal, error pattern detection |
| **Noise** | Skipped runs, empty results, budget-exceeded | 30 days | Debugging only, no training value |

### Retention Policy

```
Days 0-30:    Keep everything (all tiers)
Days 31-90:   Drop noise tier (clean up empty/skipped runs)
Days 91+:     Drop silver and failure tiers (keep only golden + correction)
Quarterly:    Archive golden + correction to archive/YYYY-QN/
```

### Content File Cleanup

Content files (prompt/response text) follow the same retention tiers:
- Golden/correction content: never deleted
- Silver/failure content: deleted when index record ages out
- Cleanup script runs weekly, reads index to determine tier, deletes orphaned content files

### First Training Run Milestone

**Recommended**: Wait until you have:
- 500 classification examples (orchestrator) with 20+ per category → **~1 week of capture**
- 300 AI David decisions with feedback (mix of agreed/adjust/wrong) → **~2-3 weeks with active review**
- 200 executor bash-generation examples → **~2-3 weeks filtered**

**Hardware**: QLoRA on Llama 3.1 8B fits in 12-16 GB VRAM (AIServer RTX 3090). Training time: 15-60 min for 1K-5K examples.

### When to Retrain

- When dataset doubles in size (not on a fixed schedule)
- When classification categories or policies change (e.g., new persona added)
- When eval accuracy drops below baseline
- When feedback patterns shift (new "wrong" patterns appear)

---

## Relationship to Existing Data

### Three-Layer Logging Architecture (unchanged)

| Layer | Purpose | File | Captures Text? |
|-------|---------|------|----------------|
| **L1: Loki/Promtail** | Operational health | `logs/headless/nexus.jsonl` | No |
| **L2: Cost Ledger** | Financial tracking | `data/cost-ledger.jsonl` | No |
| **L3: Execution Artifacts** | Raw API responses | `logs/headless/executions/*.json` | Yes (scattered) |
| **L4: Training Capture (NEW)** | ML training data | `data/training/` | Yes (normalized) |

The training capture layer is additive. No existing infrastructure needs modification.

### What L4 adds over L3

L3 (execution artifacts) already saves raw API responses, but:
- Files are unindexed — no queryable JSONL, just timestamped JSON blobs
- No prompt text captured (only the response)
- No quality signals (no feedback correlation)
- No multi-task awareness (one file per run, not per task)
- No retention policy (569 MB, 40K+ files accumulating indefinitely)

L4 normalizes all of this into a queryable, export-ready format.

---

## Export Formats

### HuggingFace / Fine-Tuning Export

Merge script reads index + backfill + content, filters, produces:

```jsonc
{
  "instruction": "You are {persona}. {persona_prompt_summary}",
  "input": "{task_title}\n{task_labels}\n{job_prompt}",
  "output": "{full_response}",
  "metadata": {
    "persona": "ai-david",
    "confidence": "high",
    "human_feedback": "agreed",
    "model": "claude-opus-4-6",
    "capture_id": "cap-abc123"
  }
}
```

**Per-persona datasets**: Export filtered by persona for targeted adapters:
- `ai-david-decisions.jsonl` — decision-making adapter
- `orchestrator-routing.jsonl` — classification adapter
- `executor-commands.jsonl` — bash command generation adapter

### Loom Context Graph Export

```jsonc
{
  "node_type": "execution_trace",
  "persona": "ai-david",
  "task_domain": "nexus",
  "summary": "{first 200 chars of response}",
  "quality_score": 0.95,
  "embedding_text": "{task_title} {reasoning}",
  "source_capture_id": "cap-{uuid}"
}
```

---

## Schema Versioning

- `version` field in every index record (current: "1.2")
- `quality_filled_at` timestamp indicates whether quality signals have been backfilled (null = not yet)
- Breaking changes increment major version; additive changes increment minor
- Index records are immutable after write — quality data lives in separate backfill files
- Migration scripts live in `data/training/migrations/`

---

## Field Size Limits

Text files have no hard limit — they are separate files, so large prompts don't impact index queryability.

| Field (in index) | Max Size | Notes |
|-------------------|----------|-------|
| `persona_data.reasoning` | 5,000 chars | Hard truncate in index; full text in response file |
| `quality.feedback_comment` | 2,000 chars | From feedback.jsonl |
| `input.task_labels` | 50 labels | Should never hit this |
| Prompt text file | No limit | Separate file, not in index |
| Response text file | No limit | Separate file, not in index |

---

## Tool Call Capture (v1.2 extension)

### The Gap

The v1.1 schema captures the prompt and final response, but misses the **intermediate tool calls** — the bash commands, file reads, greps, and edits that Claude executes during a multi-turn run. For a 12-turn executor session, turns 2-11 (the actual work) are lost.

This is the critical data for training a small model to generate bash commands for operational tasks.

### Tool Calls Schema Extension

Added to the index record:

```jsonc
{
  // ... existing fields ...

  // === Tool Calls (Phase 2+ only — null in Phase 1) ===
  "tool_calls_file": "content/cap-abc123-tools.jsonl",  // Separate file, one line per call
  "tool_calls_summary": {
    "total": 12,
    "by_tool": {
      "Bash": 5,
      "Read": 4,
      "Grep": 2,
      "Edit": 1
    }
  }
}
```

Each line in the tool calls file:

```jsonc
{
  "seq": 1,                                                // Global sequence across all tool calls
  "turn": 2,                                               // Which assistant message (1-indexed)
  "tool_use_id": "toolu_01AxykebWvYicQ8JgYzsnb2e",       // Claude API correlation ID
  "tool": "Bash",
  "input": {"command": "docker ps --filter name=postgres"},
  "output_length": 450,
  "output_file": "content/cap-abc123-tool-1-output.txt",  // Only for outputs > 1 KB (null otherwise)
  "output_inline": "CONTAINER ID  IMAGE  ...",             // Inline for outputs <= 1 KB (preview for large)
  "is_error": false,
  "duration_ms": null                                      // Not available from stream-json events
}
```

**Storage**: Tool call outputs are the largest data — a single `docker logs` output can be 100 KB+. Small outputs inline, large outputs in separate files. The index only stores the summary counts.

### Implementation Approach: `--output-format stream-json`

**CRITICAL**: `stream-json` requires `--verbose` when used with `-p` (print mode). Without `--verbose`, assistant/user events containing tool_use and tool_result blocks are omitted.

Claude Code's `stream-json --verbose` format emits events as JSONL during execution:

```jsonc
{"type": "system", "subtype": "init", ...}
{"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "toolu_abc", "name": "Bash", "input": {"command": "..."}}]}}
{"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "toolu_abc", "content": "..."}]}}
{"type": "result", "subtype": "success", "result": "...", "total_cost_usd": 0.15, ...}
```

The parser (`lib/stream-parser.py`) reads this stream and produces:
1. The final `result` event emitted as raw bytes to stdout (byte-identical to `--output-format json`)
2. A sidecar JSONL file with structured tool call records
3. Large tool outputs split to separate files (>1KB threshold)

---

## Phased Build Plan

### Phase 1: Metadata Capture ✅ COMPLETE (2026-03-30)

- `write_training_capture()` in executor.sh captures prompt/response/tokens/model per run
- Index records + content files in `.claude/data/training/{index,content}/`
- Toggle: `training_capture.enabled` in nexus-settings.json
- 47 records captured in first 24 hours across 12 personas
- 3-agent code review caught 7 issues (all fixed before merge)

### Phase 2+3: Tool Call Capture ✅ COMPLETE (2026-03-30)

*Phases 2 and 3 were collapsed into a single conditional switch — shadow mode was skipped in favor of a toggle-gated production path with instant rollback.*

- Built `lib/stream-parser.py` (Python): reads `--output-format stream-json --verbose` JSONL, emits result envelope (byte-identical to json format) to stdout, writes tool calls to sidecar JSONL
- Executor.sh conditional: when `stream_json=true`, pipes through parser; when false, uses original json path (zero regression)
- PIPESTATUS-based exit code detection for timeout (124) vs parser failure (2)
- `write_training_capture()` processes tool call files, renames with capture_id, builds tool_calls_summary
- 14 unit tests + live validation against real multi-turn streams
- 3-agent code review + deep project analysis caught and fixed: PIPESTATUS in subshell, byte-identity via json.dump, sed injection risk, local at top-level scope
- Toggle: `training_capture.stream_json` in nexus-settings.json (currently `false` — enable for tool call capture)

**Env var overrides**: `TRAINING_CAPTURE_ENABLED`, `TRAINING_STREAM_JSON`, `TRAINING_TOOL_INLINE_MAX`

### Phase 4: Quality + Export (Week 7-8)
**Build the feedback loop and export pipeline.**

- Backfill mechanism: script reads feedback.jsonl + task closures, writes to `quality/backfill-*.jsonl`
- Export scripts:
  - `export-decisions.sh` — AI David decisions with feedback → HuggingFace JSONL
  - `export-commands.sh` — Bash tool calls with task context → command generation training set
  - `export-routing.sh` — Orchestrator classifications → routing adapter training set
- Retention cleanup cron (weekly): enforce tier-based retention, delete orphaned content

**What you get**: Export-ready datasets, automated quality signal backfill, clean retention.

### Phase 5: First Training Run (Week 8-10)
**When thresholds are met, run first QLoRA adapter.**

- Prerequisites:
  - 500+ routing examples (orchestrator) → classification adapter
  - 300+ AI David decisions with feedback → decision adapter
  - 500+ bash command sequences (executor) → command generation adapter
- Training: QLoRA on Llama 3.1 8B via Unsloth, 15-60 min on RTX 3090
- Evaluation: compare adapter output against ground truth (captured quality signals)
- If good: deploy adapter via Ollama, test on low-risk tasks

### Phase 6: Continuous Improvement (Ongoing)
**Data flywheel spins.**

- New Nexus runs → training capture → quality backfill → export → retrain
- Retrain triggers: dataset doubles, policy changes, eval accuracy drops
- Per-persona adapters: AI David decision-maker, orchestrator router, executor command generator
- Dashboard integration: training data stats on tasks.example.com

---

## Size Estimates (Updated with Tool Calls)

| Component | Per Record | Per Day (80 runs) | Per Month |
|-----------|------------|-------------------|-----------|
| Index JSONL | 1-3 KB | 80-240 KB | 2-7 MB |
| Prompt text | 20-80 KB | 1.6-6.4 MB | 48-192 MB |
| Response text | 5-30 KB | 0.4-2.4 MB | 12-72 MB |
| Tool calls JSONL | 5-50 KB | 0.4-4 MB | 12-120 MB |
| Tool call outputs | 10-200 KB | 0.8-16 MB | 24-480 MB |
| **Total** | **41-363 KB** | **3-29 MB** | **98-871 MB** |

At the high end with full tool call outputs: **~1-3.5 GB per quarter**. Still manageable for AIServer storage. The retention policy keeps this bounded — golden+correction data is permanent, everything else ages out.

---

## Review Fixes Applied (v1.0 → v1.1)

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Size estimate off by 20-50x | Corrected estimates, switched to index+content split |
| 2 | Failed executions silently dropped | Added failure capture point, `result.is_failure` flag, `record_type` field |
| 3 | Multi-task backfill correlation broken | Changed `task_id` to `task_ids[]` array, backfill uses `capture_id` exclusively |
| 4 | ollama/gemini token fields silently zero | Documented engine-specific field availability table, use null not 0 |
| 5 | team-runner.py consensus not captured | Added team_consensus record type with tertiary capture point |
| 6 | Version field doesn't distinguish backfill | Added `quality_filled_at` timestamp, index records are immutable |
| 7 | router_model naming inconsistency | Standardized on `router_model`, documented Pulse metadata uses `router_recommendation` |

---

## Next Steps

### Completed
- ~~T1.2: Capture Point Specification~~ — done (2026-03-29)
- ~~Phase 1: Metadata capture~~ — done (2026-03-30, AIProjects-xyyn)
- ~~Phase 2+3: Tool call capture + stream-json switch~~ — done (2026-03-30, session 596)

### Remaining Orchestration Tasks
- T2.1: Quality signal taxonomy (what signals exist, how to score them) — spec done at `loom-quality-signals.md`, implementation pending
- T2.2: Curation pipeline (raw → golden dataset, filtering rules) — spec done at `loom-curation-pipeline.md`, implementation pending
- T3.1: Loom integration (content nodes, context router)
- T3.2: Fine-tuning export + LoRA adapter strategy — spec done at `loom-lora-strategy.md`

### Remaining Implementation
- **Phase 4: Quality backfill + export scripts** ← NEXT
- Phase 5: First QLoRA training run (~when thresholds met)
- Phase 6: Continuous improvement flywheel
