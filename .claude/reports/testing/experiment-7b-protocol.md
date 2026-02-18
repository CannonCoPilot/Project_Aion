# Experiment 7b: JICM v7 Quality & Speed Re-Assessment (Fixed Extraction)

## Background

Experiment 7 (original) established that JICM v7 achieves 8.9x speedup over v6.1 and ~3.8x over
/compact, with 10/10 quality on session-natural probes. However, a **critical bug** was discovered:
the prep script's jq filter expected `.message.content` as a string, but JSONL entries use array
format. This means the "Recent Conversation" section was always empty — quality scores reflected
plan-only checkpoints, not conversation-aware ones.

**What's fixed in 7b**:
1. jq extraction filter handles array content (joins text blocks)
2. Filters added: `[Request interrupted`, session continuation preambles, `# End Session`
3. Clean test JSONL: truncated to pre-experiment organic work (removes experimental noise)
4. JSONL_PATH override: prep script can target a specific transcript file
5. v6.1 comparisons dropped (demonstrably slower, no quality advantage)
6. Threshold set to 65% for realistic token reduction measurement

**Key question**: With conversation extraction actually working, does JICM v7 produce better
checkpoints? Does adding real user messages improve restoration quality beyond plan-only?

## Research Questions

1. Does fixing conversation extraction improve restoration quality?
2. How does JICM v7 (with working extraction) compare to native `/compact`?
3. What is the optimal prep script configuration for quality-per-token efficiency?

## Hypotheses

- **H1**: JICM v7 with working extraction achieves quality >= /compact (non-inferiority)
- **H2**: Including user messages improves quality vs plan-only checkpoint
- **H3**: Standard config (10 msgs, 500 chars, plan) is the optimal quality-per-token trade-off
- **H4**: At 65% threshold, JICM v7 achieves >= 30% token reduction

## Design

### Independent Variables

**3 treatments** (between-trial):

| Code | Method | Msgs | Type | Truncation | Plan | JSONL |
|------|--------|------|------|------------|------|-------|
| C | /compact (native) | N/A | N/A | N/A | N/A | live |
| S | v7-standard | 10 | user-only | 500 chars | included | clean |
| X | v7-mixed | 10 | user+assistant | 500 chars | included | clean |

**Dropped from original**:
- M (v7-minimal): Too sparse — original experiment showed 1KB is insufficient
- E (v7-enriched): Includes compaction noise — original showed poor signal-to-noise
- v6.1 comparison: Demonstrably slower, no quality advantage

### Dependent Variables

1. **Speed**: Total cycle time (seconds)
2. **Quality**: Session-natural probe score (0-10)
3. **Checkpoint size**: Bytes and tokens of prepared context
4. **Token reduction**: Pre-treatment tokens → post-treatment tokens (% reduction)

### Block Schedule

3 blocks × 3 treatments = 9 trials. Balanced block design:

| Block | T1 | T2 | T3 |
|-------|----|----|-----|
| 1 | S | C | X |
| 2 | X | S | C |
| 3 | C | X | S |

### Threshold

Watcher threshold: **65%** (current operational default). This means:
- Trials trigger when W0 reaches ~65% context usage (~130K tokens)
- Provides realistic compression ratio measurement
- Post-compression target: ~25-35% (50-70K tokens)

---

## Quality Probe Methodology (v2 — Session-Natural)

Same as Experiment 7 original, with enhancements.

### Question Categories (10 types)

| # | Category | Description |
|---|----------|-------------|
| 1 | artifact_name | Script/file created or modified |
| 2 | timing_metric | Measured duration or speed |
| 3 | predecessor | System being improved/replaced |
| 4 | tooling | Hook/tool/component built |
| 5 | file_path | Path to key artifact |
| 6 | problem_fixed | Error/issue resolved |
| 7 | project_id | Experiment/task/version number |
| 8 | improvement | Speedup/gain measured |
| 9 | design_param | Config count, parameter value |
| 10 | key_finding | Main insight or discovery |

### Enhanced Probes (harder questions for ceiling-breaking)

Add 5 harder questions per trial targeting **conversation-specific recall**:

| # | Category | Description |
|---|----------|-------------|
| 11 | exact_quote | Reproduce a specific user phrase |
| 12 | decision_rationale | Why was a specific choice made |
| 13 | rejected_alternative | What approach was NOT chosen |
| 14 | sequence_order | What happened before/after X |
| 15 | detail_accuracy | Specific number, name, or error message |

**Scoring**: Same as before (exact=1, partial=0.5, unknown=0). Max score: 15.

### Ground Truth Format

```json
{
  "trial_id": "1-1",
  "treatment": "S",
  "probe_type": "session-natural-v2",
  "questions": ["...10 standard + 5 harder..."],
  "answers": [
    {"exact": "answer", "partial": "key term", "category": "artifact_name"},
    ...
  ],
  "recorded_by": "W5",
  "recorded_at": "ISO8601"
}
```

---

## Execution

### Prerequisites

1. Clean test JSONL at: `.claude/reports/testing/experiment-7-captures/clean-transcript.jsonl`
2. Fixed `jicm-prep-context.sh` with array-aware jq filter
3. Watcher threshold at 65%
4. W0 at idle prompt, W5 as observer

### Per-Trial Procedure

1. Clean `.prep-override` from prior trial (if exists)
2. Verify watcher at 80% (safe threshold between trials)
3. **Record ground truth**: Write 15 Q&A to `experiment-7b-captures/ground-truth-TRIAL.json`
4. Record pre-treatment context % and tokens
5. Apply treatment:
   - **C**: Send `/compact` to W0, wait for completion
   - **S**: Write `.prep-override` (S config + clean JSONL), restart watcher at **30%** (minimum safe threshold — restore overhead adds ~20% context), wait for JICM cycle
   - **X**: Write `.prep-override` (X config + clean JSONL), restart watcher at **30%** (same minimum), wait for JICM cycle
6. **Immediately** reset watcher to 80% after cycle completes (prevent re-trigger)
7. Wait for W0 idle state (token counter > 0 and no `●` spinner)
8. Record post-treatment context % and tokens
9. Send 15 session-natural probe questions (no tags)
10. Wait for response (60s)
11. Capture response via `tmux capture-pane`
12. Score response against ground truth
13. Record metrics to `experiment-7b-data.jsonl`
14. Inter-trial cooldown (30s)

**IMPORTANT**: Minimum watcher threshold for JICM trials is **30%**. Setting it lower causes
a cycle loop — restore overhead (~22% context from session-start hook + file reads) exceeds
the threshold, re-triggering compression immediately.

### Treatment Override Configs

**Standard (S)**:
```
JSONL_PATH=/Users/Jarvis/Claude/Jarvis/.claude/reports/testing/experiment-7-captures/clean-transcript.jsonl
JSONL_TAIL_LINES=25000
USER_MSG_COUNT=10
MSG_TRUNCATE_CHARS=500
INCLUDE_PLAN=true
INCLUDE_ASSISTANT=false
```

**Mixed (X)**:
```
JSONL_PATH=/Users/Jarvis/Claude/Jarvis/.claude/reports/testing/experiment-7-captures/clean-transcript.jsonl
JSONL_TAIL_LINES=25000
USER_MSG_COUNT=10
MSG_TRUNCATE_CHARS=500
INCLUDE_PLAN=true
INCLUDE_ASSISTANT=true
```

---

## Analysis Plan

### Primary Analysis

1. **Quality comparison**: Mean quality score by treatment (C vs S vs X)
2. **Non-inferiority**: JICM v7 vs /compact (margin = 3 points / 20% on 15-point scale)
3. **Extraction impact**: Compare 7b scores to 7-original (plan-only) scores

### Secondary Analysis

1. **Speed**: Descriptive stats + comparison (JICM v7 vs /compact)
2. **Token reduction**: % reduction at 65% threshold
3. **Per-category analysis**: Which question types benefit from conversation extraction
4. **Hard question performance**: Score breakdown for questions 11-15 (conversation-specific)
5. **Checkpoint efficiency**: Quality per KB of checkpoint

### Decision Criteria

- v7 is **acceptable** if quality >= 80% of /compact (12/15 if /compact scores 15/15)
- **Recommended config**: Highest quality among S and X (tie-broken by checkpoint size)
- **Extraction value**: If S or X scores significantly higher than plan-only baseline (7-original S score), extraction is valuable

---

## Timing Estimate

| Phase | Trials | Per-Trial | Total |
|-------|--------|-----------|-------|
| Setup | — | — | ~10 min |
| Live trials | 9 | ~10 min | ~90 min |
| Analysis | — | — | ~15 min |
| **Total** | | | **~115 min** |

## Data Collection

**File**: `.claude/reports/testing/experiment-7b-data.jsonl`

**Schema**:
```json
{
  "phase": "live",
  "treatment": "C|S|X",
  "block_id": 1,
  "trial_id": "1-1",
  "start_s": 1771200000,
  "end_s": 1771200032,
  "duration_s": 32,
  "start_pct": 65,
  "end_pct": 28,
  "start_tokens": 130000,
  "end_tokens": 56000,
  "quality_score_10": 8.5,
  "quality_score_15": 12.0,
  "quality_details": [1,1,0,1,1,0.5,1,1,0.5,0,1,0.5,0,1,1],
  "checkpoint_bytes": 4900,
  "checkpoint_lines": 38,
  "outcome": "success|timeout|error",
  "notes": "",
  "timestamp": "2026-02-17T17:00:00Z"
}
```

## Future Work

1. **Anti-poisoning characterization**: Systematically test the boundary of Claude's model-level
   anti-poisoning defense. See research brief:
   `.claude/reports/research/claude-anti-poisoning-defense-2026-02-17.md`
   Open questions: model specificity (Opus vs Sonnet vs Haiku), detection boundary (subtle
   fact modifications), context distance effect, cross-session persistence.

2. **Powered quality study**: If 7b results are promising, run 20+ trials to achieve
   statistical significance for non-inferiority claims.

3. **Task completion metrics**: Supplement fact-recall probes with task continuation tests —
   can Jarvis actually resume and complete work after restoration?

---

## Changes from Experiment 7 Original

| Aspect | Original (7) | Re-run (7b) |
|--------|-------------|-------------|
| Extraction | Broken (string-only filter) | Fixed (array-aware) |
| Treatments | 5 (C, M, S, E, X) | 3 (C, S, X) |
| JSONL source | Live (experiment-contaminated) | Clean (pre-experiment truncation) |
| Threshold | Variable (20-40%) | Fixed (65%) |
| Quality probe | 10 questions | 15 questions (10 standard + 5 hard) |
| v6.1 comparison | Included | Dropped |
| Trial count | 20 planned, 4 completed | 9 planned |

## Files

| Action | File |
|--------|------|
| Create | `.claude/reports/testing/experiment-7b-protocol.md` (this file) |
| Create | `.claude/reports/testing/experiment-7b-data.jsonl` (data) |
| Create | `.claude/reports/testing/experiment-7b-captures/` (captures + ground truth) |
| Use | `.claude/reports/testing/experiment-7-captures/clean-transcript.jsonl` (clean JSONL) |
| Modified | `.claude/scripts/jicm-prep-context.sh` (extraction fix + JSONL_PATH override) |
