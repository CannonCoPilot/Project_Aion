# Loom Quality Signal Taxonomy and Scoring Rubric

**Purpose**: Define how to assess training data quality from NEXUS agent runs, compute composite scores, and decide what to keep for LoRA fine-tuning.
**Parent**: T2.1 of orchestration `2026-03-26-nexus-training-data-capture-loom.yaml`
**Schema reference**: `loom-training-schema.md` (v1.2)
**Created**: 2026-03-29

---

## Signal Categories

### 1. Positive Signals (indicate high-quality training examples)

| Signal | Source | Weight | Description |
|--------|--------|--------|-------------|
| `human_agreed` | `feedback.jsonl` → `feedback: "agreed"` | +0.40 | Sir reviewed the decision and confirmed it was correct. Strongest signal. |
| `task_closed_success` | Pulse API → task status `completed` | +0.25 | The task this execution acted on was eventually closed successfully. |
| `correct_routing` | Orchestrator `persona_data.routes[].confidence: "high"` + task reaches `stage:done` | +0.20 | Orchestrator routed the task and it completed without re-routing. |
| `successful_deployment` | Infra deployer `persona_data.results[].health_check: "pass"` | +0.20 | Infrastructure change deployed and health check passed. |
| `high_confidence` | Any persona `persona_data.confidence: "high"` | +0.10 | Persona self-reported high confidence (weak signal alone, strong when combined). |
| `clean_execution` | `result.exit_code: 0` + `output.is_error: false` + `result.attempt: 1` | +0.10 | Succeeded on first attempt with no errors. |
| `pattern_matched` | AI David `persona_data.pattern_matched` is non-null | +0.05 | Decision matched a learned pattern (consistent behavior). |

### 2. Negative Signals (indicate bad examples or correction opportunities)

| Signal | Source | Weight | Description |
|--------|--------|--------|-------------|
| `human_wrong` | `feedback.jsonl` → `feedback: "wrong"` | -0.50 | Sir marked the decision as incorrect. Strongest negative signal. |
| `human_adjusted` | `feedback.jsonl` → `feedback: "adjust"` | -0.25 | Decision was directionally right but needed correction. |
| `task_failed` | Pulse API → task status changed back from `in_progress` to `open` | -0.20 | Execution attempted the task but it wasn't completed. |
| `rollback_triggered` | Infra deployer `persona_data.results[].rollback_triggered: true` | -0.30 | Deployment was rolled back — the output caused harm. |
| `wrong_routing` | Orchestrator routed to persona X, but task was later re-routed to persona Y | -0.20 | Routing was incorrect (detected by comparing route vs. eventual executor). |
| `retry_required` | `result.attempt > 1` | -0.10 | Required retries before succeeding (flaky output). |
| `budget_exceeded` | `output.subtype: "error_max_budget"` or `"error_max_turns"` | -0.15 | Hit budget/turn limits — output may be truncated or incomplete. |
| `error_execution` | `result.is_failure: true` | -0.20 | Execution failed entirely (auth, timeout, fatal). |

### 3. Derived Signals (computed, not directly observed)

| Signal | Computation | Weight | Description |
|--------|------------|--------|-------------|
| `feedback_latency` | Time between `timestamp` and `feedback.jsonl` entry timestamp | Modifier | Fast feedback (< 24h) = higher confidence in signal accuracy. |
| `prompt_drift` | Compare `input.prompt_components.persona_prompt_hash` across captures for same persona | Flag | If persona prompt changed between capture and feedback, the feedback may not apply to the current prompt version. |
| `task_complexity` | Count of `input.task_labels` containing `scope:multi-task` or orchestration references | Modifier | Complex tasks with successful outcomes are higher-value training examples. |
| `cost_efficiency` | `cost_usd / output.response_length` | Informational | Unusually expensive executions relative to output length may indicate thrashing. |

---

## Composite Quality Score (0.0 - 1.0)

### Computation

```
base_score = 0.50  (neutral starting point)

# Apply all detected signals
for signal in detected_signals:
    base_score += signal.weight

# Clamp to [0.0, 1.0]
quality_score = max(0.0, min(1.0, base_score))
```

### Score Interpretation

| Score Range | Score Band | Meaning |
|-------------|------------|---------|
| 0.85 - 1.00 | **Confirmed** | Human-confirmed correct or high-confidence success. Auto-promotes to curated set. |
| 0.70 - 0.84 | **Probable** | Successful execution, likely good but no human confirmation. May auto-promote after backfill. |
| 0.50 - 0.69 | **Neutral** | Clean execution but no confirming signals. Pending review. |
| 0.30 - 0.49 | **Weak** | Some negative signals. Negative training example candidate. |
| 0.00 - 0.29 | **Bad** | Failed or human-corrected. Excluded as noise (unless paired as negative). |

> **Naming note**: Score bands (Confirmed/Probable/Neutral/Weak/Bad) are distinct from _retention tiers_ (Golden/Correction/Silver/Failure/Noise) defined in `loom-training-schema.md`. Score bands describe quality; retention tiers describe lifecycle policy. A "Probable" score-band record has "Silver" retention tier.

### Example Scores

| Scenario | Signals | Score |
|----------|---------|-------|
| AI David: agreed, task closed, first attempt | +0.40 +0.25 +0.10 | **0.50 + 0.75 = 1.0** (clamped) |
| Orchestrator: routed correctly, high confidence | +0.20 +0.10 | **0.50 + 0.30 = 0.80** |
| Executor: succeeded but needed retry | +0.10 -0.10 | **0.50 + 0.00 = 0.50** |
| AI David: wrong, task failed | -0.50 -0.20 | **0.50 - 0.70 = 0.00** (clamped) |
| AI David: adjusted, task still closed | -0.25 +0.25 | **0.50 + 0.00 = 0.50** |

---

## Capturable vs. Noise Threshold

### Minimum quality score for retention: **0.30**

Records below 0.30 are noise — they failed for infrastructure reasons (auth errors, timeouts, budget exhaustion with no output) rather than producing meaningful LLM output. These have no training value.

### What falls below 0.30 (noise examples)

- Auth failures with no response (`is_failure: true`, `error_class: "auth"`, no response file)
- Budget-exceeded with empty/truncated output AND no task outcome
- Duplicate prompt hashes within the same day (second+ run of identical prompt)
- Test/debug runs (if a `test_run` flag is ever added to nexus-settings)

### What stays above 0.30 (even if bad)

- Failed executions that produced a response (the response teaches what NOT to do)
- Human-corrected decisions (the correction IS the training data)
- Rollback-triggered deployments (shows the bad path)

---

## Negative Example Policy

### Recommendation: Include negative examples at 10-20% of training set

Research supports this:
- **LIMA paper**: Small amounts of carefully curated negative examples improve boundary learning
- **DPO/RLHF literature**: Paired positive/negative examples are the gold standard for preference alignment
- **Practical LoRA experience**: 10-20% negative examples helps the model learn "what not to do" without destabilizing

### How to construct negative examples

| Source | Training Label | Format |
|--------|---------------|--------|
| `human_wrong` feedback | `rejected` | Same prompt, mark response as the wrong answer. Pair with a corrected version if `feedback_comment` provides one. |
| `human_adjusted` feedback | `rejected` (soft) | Use as negative only if `feedback_comment` explains what was wrong. Otherwise treat as noisy positive. |
| `rollback_triggered` | `rejected` | The deployment output caused harm — clear negative signal. |
| `task_failed` after execution | `rejected` (weak) | Use only when paired with a later successful execution of the same task (same `task_ids`). |
| `result.is_failure: true` with response | `rejected` | The execution produced output but still failed. |

### Negative example construction rules

1. **Never use noise-tier records** (score < 0.30) as negative examples — they teach nothing useful
2. **Always pair with a positive** when possible — same task, same persona, different outcome
3. **Cap at 20%** of per-persona training set — more than this degrades training
4. **Prefer human-labeled negatives** (`wrong` > `adjust` > inferred) — human signal is 10x more valuable
5. **Exclude corrections where the comment says "I already approved this"** — these are process errors, not LLM errors

### Per-Persona Negative Example Targets

| Persona | Negative % Target | Primary Negative Source |
|---------|-------------------|----------------------|
| AI David | 15% | `feedback: "wrong"` and `feedback: "adjust"` with comment |
| Orchestrator | 10% | Re-routed tasks (original route was wrong) |
| Task Executor | 15% | `rollback_triggered`, tasks that failed then succeeded on re-run |
| Researcher | 10% | Research rejected or redone (rare — mostly positives) |
| Infra Deployer | 20% | `rollback_triggered`, `health_check: "fail"` |

---

## Signal Availability Timeline

Not all signals are available at capture time. The quality backfill process fills them in asynchronously.

| Signal | Available At | Backfill Lag |
|--------|-------------|-------------|
| `clean_execution` | Capture time | Immediate |
| `high_confidence` | Capture time | Immediate |
| `pattern_matched` | Capture time | Immediate |
| `budget_exceeded` | Capture time | Immediate |
| `error_execution` | Capture time | Immediate |
| `human_agreed/adjusted/wrong` | After Sir reviews | Hours to days |
| `task_closed_success` | After task lifecycle completes | Hours to weeks |
| `correct_routing` | After routed task reaches `stage:done` | Hours to days |
| `rollback_triggered` | At capture time (infra deployer reports it) | Immediate |
| `wrong_routing` | After re-routing detected | Hours to days |

**Implication**: Initial quality scores are partial (only immediate signals). Scores improve as backfill runs. The curation pipeline should re-score records after backfill.

---

## Schema Field Mapping

How each signal maps to schema fields from `loom-training-schema.md` v1.2:

| Signal | Schema Fields Used |
|--------|-------------------|
| `human_agreed` | `quality.human_feedback == "agreed"` |
| `human_wrong` | `quality.human_feedback == "wrong"` |
| `human_adjusted` | `quality.human_feedback == "adjust"` |
| `task_closed_success` | `quality.tasks_closed > 0` |
| `clean_execution` | `result.exit_code == 0 && !output.is_error && result.attempt == 1` |
| `high_confidence` | `persona_data.confidence == "high"` (primary) — backfilled to `quality.confidence` during curation |
| `error_execution` | `result.is_failure == true` |
| `budget_exceeded` | `output.subtype in ["error_max_budget", "error_max_turns"]` |
| `rollback_triggered` | `persona_data.results[].rollback_triggered == true` (infra deployer only) |
| `correct_routing` | `persona_data.routes[].confidence == "high"` + task reached done (orchestrator) |
| `pattern_matched` | `persona_data.pattern_matched != null` (AI David only) |
