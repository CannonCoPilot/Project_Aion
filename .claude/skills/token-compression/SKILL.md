---
name: token-compression
description: This skill should be used when the user asks about "token compression benchmarks", "compression mode comparison", "JICM benchmark", "cache ratio analysis", "world generation token cost", or wants to measure the impact of different compression settings on Claude Code session token usage.
version: 1.0.0
---

# Token Compression Benchmark

This skill provides benchmarking and analysis of JICM (Jarvis Intelligent Context Management) compression modes and their impact on token usage across Claude Code sessions.

## Overview

Different compression modes affect how much context is loaded at session startup ("world generation") and how aggressively tool outputs are compressed during a session. This skill benchmarks those modes by replaying existing session JSONL data to measure token economics per mode.

## Compression Modes

| Mode   | Description                                                        |
|--------|--------------------------------------------------------------------|
| none   | No compression — raw CLAUDE.md + full context loaded fresh         |
| light  | Observation masking only (large tool outputs compressed)           |
| medium | JICM checkpoint-based compression (LLM-enriched summaries)         |
| heavy  | Aggressive compaction + minimal context (essentials only)          |

Mode classification uses avg_cache_ratio thresholds from session JSONL data:
- none: cache_ratio < 20%
- light: 20% <= cache_ratio < 40%
- medium: 40% <= cache_ratio < 65%
- heavy: cache_ratio >= 65%

## Scripts

### scripts/token-extractor.py

Parses Claude Code session JSONL files and extracts per-session token metrics.

```
python3 token-extractor.py <jsonl_file_or_dir> [OPTIONS]
  --format <json|table|csv>   Output format (default: json)
  --aggregate                 Aggregate all files in a directory
  --session-id <id>           Filter to specific session
  --out <path>                Write output to file
```

### scripts/benchmark-harness.sh

Classifies sessions by compression mode and computes per-mode averages. Outputs a JSONL results file and a formatted comparison table.

```
benchmark-harness.sh [OPTIONS]
  --compression <mode>        Mode to benchmark: none|light|medium|heavy|all (default: all)
  --runs <N>                  Sessions to analyze per mode (default: 3)
  --session-dir <path>        JSONL session files location
  --output <path>             Results JSONL output path
  --baseline <mode>           Baseline mode for comparison (default: none)
```

## Metrics Captured

- input_tokens_total — direct input tokens
- output_tokens_total — generated output tokens
- cache_creation_tokens_total — tokens written to cache
- cache_read_tokens_total — tokens served from cache
- total_tokens_all — sum of all token types
- effective_tokens — input + output (billed at full rate)
- cache_ratio — cache_read / (cache_read + cache_creation + input) as %
- estimated_cost_usd — rough cost estimate using claude-sonnet-4 pricing

## Results Location

Benchmark results are appended to:
  .claude/metrics/token-compression/benchmark-results.jsonl

## Running a Benchmark

```bash
cd /Users/nathanielcannon/Claude/Project_Aion
.claude/skills/token-compression/scripts/benchmark-harness.sh \
  --compression all \
  --runs 3 \
  --baseline none
```

---

## Chain of Draft (CoD) — Reasoning Compression

Chain of Draft reduces reasoning token usage by 70–85% by replacing verbose chain-of-thought with minimal compressed draft steps (≤5 words per step).

### Template

The CoD system prompt injection block lives at:

```
.claude/skills/token-compression/templates/chain-of-draft.txt
```

Inject its contents **before** the main task instructions in any system prompt targeting reasoning-heavy subagents.

### Applying CoD to a Prompt File

```bash
cd /Users/nathanielcannon/Claude/Project_Aion
.claude/skills/token-compression/scripts/apply-cod.sh \
  --task-id <pulse-task-id> \
  path/to/system-prompt.txt
```

Options:
- `--dry-run` — preview without modifying the file
- `--force` — re-apply even if CoD is already present
- `--template <path>` — use a custom template
- `--log <path>` — write metrics to a custom log path

### CoD Metrics Log

Every `apply-cod.sh` run appends an entry to:

```
.claude/skills/token-compression/metrics/log.json
```

Each entry records: timestamp, target file, tokens before/after, tokens added, template size, and optional task ID.

### When to Use CoD

| Apply to | Skip for |
|---|---|
| Reasoning subagents | Code-generation agents |
| Math / logic tasks | Creative writing |
| Multi-step analysis | Summarization |
| Debugging diagnosis | Tool-use heavy workflows |

Target savings: **70–85% reduction** in reasoning step tokens.
Accuracy impact: **<3%** on structured reasoning tasks.
