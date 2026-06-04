# Loom Curation Pipeline Design

**Purpose**: Define the end-to-end flow from raw training data capture to curated golden dataset for LoRA fine-tuning.
**Parent**: T2.2 of orchestration `2026-03-26-nexus-training-data-capture-loom.yaml`
**Dependencies**: `loom-training-schema.md` (v1.2), `loom-quality-signals.md`, `loom-capture-points.md`
**Created**: 2026-03-29

---

## Pipeline Overview

```
Raw Capture  -->  Backfill  -->  Score  -->  Filter  -->  Review Gate  -->  Golden Set
(executor.sh)   (quality/)    (computed)   (exclude     (human or        (permanent,
                                            noise)       auto-promote)    export-ready)
```

The pipeline runs as a batch process (daily cron or on-demand). It does not interfere with the capture path — capture is always append-only and fast.

---

## 1. Ingestion Sources

| Source | Path | What It Provides | Read Method |
|--------|------|-----------------|-------------|
| **Training capture index** | `.claude/data/training/index/captures-*.jsonl` | All captured executions (metadata, pointers to content) | `jq` over daily JSONL files |
| **Quality backfill** | `.claude/data/training/quality/backfill-*.jsonl` | Human feedback, task closure status, correlated by `capture_id` | `jq` join on `capture_id` |
| **Content files** | `.claude/data/training/content/cap-*-{prompt,response}.txt` | Full prompt and response text | Read on demand during export |
| **Feedback JSONL** | `.claude/agent-output/results/ai-david/feedback.jsonl` | Sir's review verdicts (`agreed`/`adjust`/`wrong` + comments) | Parse, correlate by `task_id` + timestamp window |
| **Daily decision logs** | `.claude/agent-output/results/ai-david/YYYY-MM-DD.jsonl` | AI David persona_data (action, confidence, reasoning, pattern) | Parse for persona_data backfill |
| **Task evaluator results** | `.claude/agent-output/results/task-evaluator/*.json` | Evaluation outcomes (ready, risk, scope, approval) | Parse for task_evaluator persona_data |
| **Orchestrator decisions** | `.claude/agent-output/results/orchestrator/decisions-*.jsonl` | Routing decisions (classification, persona, confidence) | Parse for orchestrator persona_data |
| **Pulse API** | `http://localhost:8700/api/v1/tasks/{id}` | Current task status, labels, closure reason | HTTP GET per `task_ids[]` in capture records |

### Correlation Keys

- **capture_id**: Primary key linking index, backfill, and content files
- **task_ids[]**: Links capture records to Pulse tasks and feedback entries
- **session_id**: Links to raw execution logs (`.claude/logs/headless/executions/`)
- **timestamp + task_id**: Correlates feedback.jsonl entries to capture records (feedback has `decision_timestamp` field)

---

## 2. Filtering Rules (Exclusions)

Records matching any of these criteria are excluded from the curated dataset. They remain in the raw capture for debugging but are never promoted.

| Rule | Detection | Rationale |
|------|-----------|-----------|
| **Empty response** | `output.response_length == 0` OR response file is empty/missing | No LLM output to learn from |
| **Budget-exceeded with no useful output** | `output.subtype in ["error_max_budget", "error_max_turns"]` AND `output.response_length < 500` | Truncated output is incomplete — not worth training on |
| **Auth failure** | `result.error_class == "auth"` | Infrastructure error, not an LLM behavior |
| **Duplicate prompt hash (same day)** | Second+ occurrence of same `input.prompt_hash` within same `captures-YYYY-MM-DD.jsonl` | Identical retry — keep only the first (or best-scoring) |
| **Test/debug runs** | `job_name` starts with `test-` or `debug-` | Not production behavior |
| **Pre-check only** | `output.num_turns == 0` | No LLM invocation occurred |
| **Noise-tier score** | `quality_score < 0.30` after scoring | Per quality signals taxonomy — infrastructure failures with no training value |

### Deduplication Strategy

When duplicate `prompt_hash` values are found:
1. If one has human feedback and the other doesn't — keep the one with feedback
2. If both have feedback — keep the one with the better quality score
3. If neither has feedback — keep the first occurrence (earliest timestamp)

Cross-day duplicates are allowed — the same prompt on different days may produce different responses, which is valuable for training diversity.

---

## 3. Quality Scoring

Apply the taxonomy from `loom-quality-signals.md` to compute a composite score for each record.

### Scoring Process

```
1. Load index record
2. Load matching backfill record (by capture_id) if exists
3. Detect all applicable signals (positive + negative)
4. Compute: base_score(0.50) + sum(signal_weights)
5. Clamp to [0.0, 1.0]
6. Write scored record to scored output
```

### Signal Detection Priority

1. **Human feedback signals** (highest priority — override all others)
   - `quality.human_feedback == "agreed"` -> +0.40
   - `quality.human_feedback == "wrong"` -> -0.50
   - `quality.human_feedback == "adjust"` -> -0.25
2. **Task outcome signals** (strong, but async)
   - `quality.tasks_closed > 0` -> +0.25
   - Task status reverted to open -> -0.20
3. **Execution quality signals** (available immediately)
   - Clean first-attempt success -> +0.10
   - High confidence -> +0.10
   - Retry required -> -0.10
4. **Persona-specific signals** (role-dependent)
   - Routing correct (orchestrator) -> +0.20
   - Rollback triggered (infra) -> -0.30
   - Pattern matched (AI David) -> +0.05

### Records Without Backfill

Records that haven't been backfilled yet get a partial score based on execution-time signals only. These are tagged `score_partial: true` and re-scored on subsequent pipeline runs when backfill data arrives.

---

## 4. Review Gate

### Auto-Promotion Threshold: **quality_score >= 0.85** (aligns with "Confirmed" score band)

Records at or above this threshold are automatically promoted to the curated set without human review. This threshold is met when:
- Human agreed + task closed + clean execution (score = 1.0)
- Human agreed + clean execution (score = 0.90+)
- Correct routing + task closed + high confidence (score = 0.85+)

> **Note**: The curated set file is `curated-index.jsonl` (not "golden-index"). "Golden" is a _retention tier_ (permanent, human-confirmed). "Curated" means quality-gated and export-ready — includes both auto-promoted and human-reviewed records.

### Human Review Range: **0.50 <= quality_score < 0.85**

Records in this range are flagged for human review. They appear on the dashboard review page with:
- The prompt/response pair
- The quality score and contributing signals
- A promote/reject/skip action

### Auto-Exclude Threshold: **quality_score < 0.30**

Records below 0.30 are auto-excluded (noise tier). They are never shown for review.

### Negative Example Candidates: **0.30 <= quality_score < 0.50**

Records in this range are negative example candidates. They are reviewed separately with a "use as negative example" action. The curation script tags them as `training_label: "rejected"` if promoted as negatives.

### Review Volume Estimate

Based on current Nexus throughput (~80 runs/day):
- ~20% will have human feedback within 48h -> auto-promoted or auto-excluded
- ~60% will be silver-tier (no feedback) -> starts in review range, may auto-promote after backfill
- ~15% will auto-promote (clean execution + high confidence)
- ~5% will be noise-tier -> auto-excluded

Expected daily human review load: **10-20 records** (the ambiguous middle). This drops as more feedback accumulates and patterns stabilize.

---

## 5. Golden Set Criteria

A record enters the golden set (permanent, used for training) when ALL of:

| Criterion | Required Value |
|-----------|---------------|
| `quality_score` | >= 0.85 (auto) OR human-promoted from review |
| `output.response_length` | > 500 chars (meaningful response) |
| Content files exist | Both prompt and response files present and non-empty |
| Not a duplicate | No other golden record with same `prompt_hash` |
| Schema version | Compatible with current export format |

### Golden Set Storage

Golden records are copied (not moved) to a golden index:

```
.claude/data/training/
├── golden/
│   ├── curated-index.jsonl          # All golden records (append-only)
│   ├── curated-negatives.jsonl      # Negative examples (separate file)
│   └── stats.json                  # Counts by persona, score distribution
```

The golden index is the input to export scripts. It is append-only — records are never removed (corrections are added as new negative entries, not deletions).

### Negative Example Quota

Per `loom-quality-signals.md`, negative examples are capped at 10-20% of each persona's training set:

```
per_persona_negative_pct = count(golden_negatives for persona) / count(golden for persona)
if per_persona_negative_pct > 0.20:
    stop adding negatives for this persona until positives catch up
```

---

## 6. Curation Script Interface

### Script: `curate-training-data.sh` (spec only — not implemented)

```
Usage: curate-training-data.sh [OPTIONS]

Options:
  --date YYYY-MM-DD     Process captures from this date (default: yesterday)
  --range START END     Process date range
  --all                 Process all unscored captures
  --backfill-only       Only run quality backfill, skip scoring/promotion
  --score-only          Only compute scores, skip promotion
  --dry-run             Show what would be promoted, don't write golden index
  --stats               Print current golden set statistics and exit

Input:
  .claude/data/training/index/captures-*.jsonl     (raw capture records)
  .claude/data/training/quality/backfill-*.jsonl   (quality signal backfill)
  .claude/agent-output/results/ai-david/feedback.jsonl  (human feedback)
  Pulse API (http://localhost:8700)                 (task status lookups)

Output:
  .claude/data/training/golden/curated-index.jsonl       (promoted records)
  .claude/data/training/golden/curated-negatives.jsonl   (negative examples)
  .claude/data/training/golden/stats.json               (statistics)
  .claude/data/training/quality/backfill-YYYY-MM-DD.jsonl  (new backfill records)
  stdout: summary of actions taken (promoted, excluded, pending review)

Exit codes:
  0 - Success
  1 - Error (file I/O, API failure)
  2 - No records to process
```

### Processing Steps (per invocation)

```
1. BACKFILL: Read feedback.jsonl + Pulse API + persona output files
   - For each capture record with unfilled quality fields:
     - Match feedback by task_id + timestamp window (capture ts <= feedback decision_ts <= capture ts + 7d)
     - Query Pulse for task status (completed? labels changed?)
     - Extract `confidence` from persona output files (persona_data.confidence) → backfill to quality.confidence
     - Write backfill record to quality/backfill-YYYY-MM-DD.jsonl
   - Note: feedback.jsonl has no capture_id — correlation uses task_id + timestamp window (not capture_id)

2. SCORE: Merge index + backfill, compute quality scores
   - Load index records for target date(s)
   - Join with backfill records by capture_id
   - Apply signal taxonomy weights
   - Output: scored record set with quality_score field

3. FILTER: Apply exclusion rules
   - Remove empty responses, auth failures, duplicates, noise-tier
   - Output: filtered record set

4. PROMOTE: Apply review gate thresholds
   - score >= 0.85 -> append to curated-index.jsonl
   - 0.30 <= score < 0.50 AND negative quota not full -> append to curated-negatives.jsonl
   - 0.50 <= score < 0.85 -> log as "pending review" (dashboard picks these up)
   - score < 0.30 -> log as "excluded (noise)"

5. STATS: Update stats.json
   - Total golden, total negatives, per-persona counts
   - Score distribution histogram
   - Negative example percentage per persona
```

### Stats Output Format

```json
{
  "last_run": "2026-04-15T06:00:00Z",
  "golden_total": 1247,
  "negatives_total": 156,
  "negative_pct": 12.5,
  "by_persona": {
    "ai-david": { "golden": 340, "negatives": 51, "negative_pct": 15.0 },
    "orchestrator": { "golden": 280, "negatives": 28, "negative_pct": 10.0 },
    "task-executor": { "golden": 210, "negatives": 32, "negative_pct": 15.2 },
    "researcher": { "golden": 95, "negatives": 10, "negative_pct": 10.5 },
    "infrastructure-deployer": { "golden": 85, "negatives": 17, "negative_pct": 20.0 },
    "task-evaluator": { "golden": 237, "negatives": 18, "negative_pct": 7.6 }
  },
  "score_distribution": {
    "0.0-0.3": 45,
    "0.3-0.5": 89,
    "0.5-0.7": 234,
    "0.7-0.9": 412,
    "0.9-1.0": 623
  },
  "pending_review": 34,
  "ready_for_training": {
    "ai-david": true,
    "orchestrator": true,
    "task-executor": false,
    "researcher": false
  }
}
```

---

## Scheduling

| Job | Frequency | Rationale |
|-----|-----------|-----------|
| Quality backfill | Every 6 hours | `curate-training-data.sh --backfill-only` — register as Nexus cron job `training-backfill` in registry.yaml |
| Full curation run | Daily at 06:00 UTC | `curate-training-data.sh --all` — register as Nexus cron job `training-curation` in registry.yaml |
| Loom node generation | Daily at 07:00 UTC | `generate-loom-nodes.sh` — runs after curation, reads from `curated-index.jsonl` (NOT raw captures) |
| Stats report | After each curation run | Appended to curation output |
| Retention cleanup | Weekly (Sunday 04:00 UTC) | Per retention policy in schema doc — drop noise at 30d, silver at 90d |

---

## Dashboard Integration (Future)

The curation pipeline produces data that the dashboard can display:

- **Pending review queue**: Records with 0.50 <= score < 0.85 shown on review page
- **Golden set stats**: Per-persona counts, score distributions, readiness for training
- **Negative example review**: Separate queue for 0.30-0.50 records with "use as negative" action

This is out of scope for the curation pipeline design — the pipeline writes files, the dashboard reads them.
