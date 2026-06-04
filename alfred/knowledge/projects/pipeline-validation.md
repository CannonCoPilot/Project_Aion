# pipeline-validation

**Path**: `/Users/nathanielcannon/Claude/Alfred-Dev` (AIfred project root)
**Type**: testing
**Status**: active
**Created/Registered**: 2026-05-28

---

## Overview

End-to-end validation of the Nexus automation pipeline — specifically the Ollama integration paths (pre-gather, tool-dispatch), cost-ledger telemetry accuracy, and engine fallback behaviour. Six test scenarios (PIPE-01 through PIPE-06) exercise health-summary, weekly-digest, context-maintenance, creative-think, and telemetry auditing across ollama / ollama-chat / claude-interactive engine types.

---

## Goal

Confirm that the Nexus dispatcher + executor correctly routes jobs to Ollama, injects pre-gathered data, dispatches tool calls, records $0 cost entries, falls back to claude-interactive when Ollama is unavailable, and produces accurate cost-ledger entries for all engine types.

---

## Status

Active — PIPE-01, PIPE-03, PIPE-04, PIPE-05, PIPE-06 still open. PIPE-02 closed 2026-05-29.

---

## Architecture

Dispatcher (`dispatcher.sh`) reads `registry.yaml` every cycle, selects eligible jobs, and invokes `executor.sh`. The executor resolves the engine (ollama / claude-interactive), optionally runs a pre_gather script to inject data into the prompt, and for `tools:true` jobs enters a multi-turn `/api/chat` loop that exposes a `run_command` tool to the model.

Cost-ledger entries are written by `lib/cost-log.sh` after each execution. Execution logs land in `.claude/logs/headless/executions/`.

---

## Evaluator Brief

### Key File Paths

| Path | Purpose |
|------|---------|
| `.claude/jobs/executor.sh` | Main Nexus job executor — engine routing, Ollama integration, tool-dispatch loop |
| `.claude/jobs/dispatcher.sh` | Scheduler — reads registry, triggers executor per schedule |
| `.claude/jobs/registry.yaml` | Source of truth for all job definitions, schedules, engine config |
| `.claude/data/cost-ledger.jsonl` | Append-only cost + telemetry log for every execution |
| `.claude/jobs/lib/gather-health-data.sh` | Pre-gather script for health-summary job |
| `.claude/jobs/lib/gather-weekly-data.sh` | Pre-gather script for weekly-digest job |
| `.claude/jobs/lib/cost-log.sh` | Writes cost-ledger entries |
| `.claude/logs/headless/executions/` | Per-execution log files (timestamped) |
| `.claude/logs/headless/ollama-chat-audit.jsonl` (MISSING) | Structured JSONL audit log for Ollama /api/chat interactions |
| `.claude/agent-output/results/pipeline-validation/` | Test-reviewer output reports for this project |

### Models & Tools

| Model / Tool | Role |
|------|---------|
| Ollama qwen3:32b | Primary LLM engine for Nexus jobs (pre-gather + tool-dispatch) |
| claude-sonnet-4-6 (claude-interactive) | Fallback engine when Ollama is unavailable |
| dispatcher.sh | Cron-style job scheduler |
| executor.sh `_execute_ollama_with_tools()` | Multi-turn Ollama tool-dispatch loop |
| Pulse CLI (`pulse`) | Task tracking for validation sub-tasks |
| `lib/cost-log.sh` | Cost and telemetry ledger writes |

### Decisions Made

| Date | Decision | Source |
|------|----------|--------|
| 2026-05-28 | `context-maintenance` job configured with `tools:true` and `max_tool_rounds:8` in registry.yaml | AION-2ba9fb29 |
| 2026-05-28 | Structured JSONL audit logging added to `_execute_ollama_with_tools()` — 7 event types, log at `ollama-chat-audit.jsonl` | AION-c40ee686 (report) |
| 2026-05-28 | cost-ledger confirmed to record `cost=0` + `engine=ollama` for Ollama-routed executions | AION-c0e7bf37 |
| 2026-05-29 | PIPE-02 (weekly-digest via Ollama pre-gather) passed — dispatcher, pre-gather injection, and artifact generation all verified | AION-3fed0284 |
| 2026-05-29 | tmux window lifecycle (creation and cleanup) verified correct for health-summary job | AION-694076db |
| 2026-05-28 | claude-interactive fallback entries in cost-ledger reflect real Anthropic costs | AION-74924e7e |
| 2026-05-28 | Telemetry audit final check: no untracked traffic detected in proxy DB | AION-1a0ad31b |

### Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Does Ollama (qwen3:32b) generate a valid, useful health report from pre-gathered data? (PIPE-01) | [ ] open — AION-cc3d2455 |
| 2 | Does pre-gather script correctly inject Docker and disk data into the Ollama prompt? (PIPE-01) | [ ] open — AION-7e5abc4c |
| 3 | Is a dashboard notification displayed after health-summary runs via Ollama? (PIPE-01) | [ ] open — AION-af351119 |
| 4 | Does `creative-think` (Ollama tool-dispatch) correctly read interest profile and write state JSON? (PIPE-04) | [ ] open — AION-4c286538 |
| 5 | Does the executor correctly fall back to claude-interactive when Ollama is down? (PIPE-05) | [ ] open — AION-85ddbcb8, blocked |
| 6 | Do ollama-chat cost-ledger entries include `tool_calls` count? (PIPE-06) | [ ] open — AION-75cfc3eb |
| 7 | Are all cost-ledger `engine` and `job` fields accurate across all six PIPE tests? (PIPE-06) | [ ] open — AION-d0e7bfdf |

### Related Tasks

| Task ID | Title | Status | Phase |
|---------|-------|--------|-------|
| AION-bbb4a40a | [PIPE-01] Live test: health-summary via Ollama pre-gather | open | live-test |
| AION-3fed0284 | [PIPE-02] Live test: weekly-digest via Ollama pre-gather | closed | live-test |
| AION-5e7f555f | [PIPE-03] Live test: context-maintenance via Ollama tool-dispatch | open | live-test |
| AION-4c286538 | [PIPE-04] Live test: creative-think via Ollama tool-dispatch | open | live-test |
| AION-3b70a864 | [PIPE-05] Fallback test: Ollama→claude-interactive degradation | open | live-test |
| AION-08829a02 | [PIPE-06] Telemetry audit: verify cost-ledger accuracy for all engine types | open | telemetry |

<!-- Last maintained: 2026-05-30 by context-maintainer -->
