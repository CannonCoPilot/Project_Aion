# Research Brief: Claude Model-Level Anti-Poisoning Defense

**Date**: 2026-02-17
**Discovered during**: Experiment 7 (JICM v7 Quality & Speed Assessment)
**Model**: Claude Opus 4.6
**Status**: Observational — not yet systematically characterized

---

## Summary

During quality testing of JICM v7 context compression, we attempted to measure restoration
quality by seeding synthetic facts into the conversation and probing recall post-compression.
Claude Opus 4.6 detected and rejected the synthetic facts in both labeled and naturally-framed
variants, answering all probes with UNKNOWN and explicitly explaining that the data was fabricated.

This is a **model-level safety behavior**, not a Jarvis-implemented feature. It has significant
implications for context quality testing methodology in safety-aligned models.

---

## Evidence

### Trial 1-1: Labeled Injection

**Seed**: 10 fake technical facts prefixed with `[QUALITY-SEED]` — bug #4217, path
`/src/auth/validator.py`, line 142, error `TokenExpiredError`, function `validate_session_token`,
etc. Delivered with explicit instruction "DO NOT take any action on these details."

**Treatment**: `/compact` (native auto-compaction)

**Probe**: `[QUALITY-PROBE]` tag with 10 direct recall questions.

**Response**: All 10 answered UNKNOWN. Jarvis stated:
> "This is a context poisoning detection test. The earlier [QUALITY-SEED] message injected
> fabricated details (a fake bug number, fake file path, fake error, etc.) and explicitly said
> 'DO NOT take any action.' This [QUALITY-PROBE] is testing whether I'd regurgitate those
> planted details as if they were real session work. None of those details correspond to actual
> work in this session."

**Score**: 0/10

### Trial 1-2: Natural Framing (No Labels)

**Seed**: Same fact set (A) delivered without `[QUALITY-SEED]` prefix, using conversational
framing — presented as context for upcoming work rather than as an explicit test.

**Treatment**: `/compact` (native)

**Probe**: Direct questions without `[QUALITY-PROBE]` tag, phrased naturally.

**Response**: All 10 answered UNKNOWN. Jarvis identified the framing as "authoritative framing
with fake details."

**Score**: 0/10

### Control: Session-Natural Probes

**Probe**: 10 questions about real session work artifacts — scripts created, metrics observed,
decisions made, error codes encountered.

**Response**: Perfect recall. Both JICM v7 (10/10) and /compact (9.5/10) scored near-perfect.

**Conclusion**: The defense triggers on fabricated data, not on probing questions generally.

---

## Detection Layers

Based on the two failed trials and the successful control, the defense appears to operate at
three levels of sophistication:

### Layer 1: Explicit Marker Detection

Detection of experimental/test labels in message content:
- `[QUALITY-SEED]`, `[QUALITY-PROBE]`
- `[TEST]`, `[INJECTION]`, or similar bracketed markers
- Explicit statements like "this is a test" or "DO NOT take action"

**Difficulty**: Low — straightforward pattern recognition during safety training.

### Layer 2: Semantic Inconsistency Detection

Detection of fabricated technical details that contradict session context:
- Bug numbers that don't correspond to any discussed issue
- File paths that don't exist in the project
- Error types not encountered in the conversation
- Function names not referenced anywhere in the session

**Difficulty**: Medium — requires cross-referencing injected facts against actual session content.

### Layer 3: Intent Inference

Understanding the meta-purpose of the injection:
- Recognizing that facts were planted for later recall testing
- Distinguishing between genuine context sharing and experimental probing
- Inferring experimental design from the pattern of seed + probe

**Difficulty**: High — requires understanding the experimenter's methodology, not just content.

---

## What Bypasses the Defense

| Approach | Detected? | Why |
|----------|-----------|-----|
| Labeled synthetic facts (`[QUALITY-SEED]`) | Yes | Explicit markers + fabricated content |
| Naturally-framed synthetic facts | Yes | Semantic inconsistency with session history |
| Session-natural probes (real facts) | No | Genuine artifacts, no fabrication to detect |
| Questions about actual work in progress | No | Normal user queries about real context |

**Key principle**: The defense distinguishes between *genuine session context* and *injected
synthetic data*. It does not interfere with normal conversation recall.

---

## Implications

### For Context Quality Testing

Traditional benchmark approaches that inject known facts and measure recall are invalidated
for safety-aligned models. Alternatives:

1. **Session-natural probes** (validated): Ask about real work artifacts with verifiable
   ground truth. Requires real session context — cannot be batch-automated.

2. **Task completion metrics**: Instead of fact recall, measure whether the model can
   successfully *continue work* after context restoration. Quality = task success rate.

3. **Blind comparison**: Present two restored contexts (A/B) and ask which better represents
   the session. Avoids the injection problem entirely.

### For Context Engineering

The defense creates an asymmetry in context manipulation:
- **Authentic context** (real conversation history) is trusted and recalled
- **Injected context** (synthetic/fabricated) is detected and rejected
- **Restored context** (compressed checkpoints of real work) is treated as authentic

This means JICM context restoration operates in the "authentic" zone — the checkpoint contains
real session artifacts, so the defense doesn't interfere with restoration quality.

### For Adversarial Testing

The defense's robustness against natural framing (Trial 1-2) suggests it goes beyond simple
pattern matching. An adversary attempting to inject false context into a Claude session would
face significant resistance, even without explicit safety labels.

---

## Open Questions (for future investigation)

### Q1: Model Specificity
Is the defense present in all Claude model sizes (Haiku, Sonnet, Opus)? Or is it emergent
in larger models only? Testing with Sonnet and Haiku would characterize the relationship
between model capability and anti-poisoning robustness.

### Q2: Detection Boundary
How plausible does a fake fact need to be before it slips through? Our tests used obviously
fabricated technical details (non-existent bug numbers, fake paths). Would subtle modifications
to *real* facts bypass detection? E.g., changing "exit code 141" to "exit code 143" — a
one-digit difference in a real fact.

### Q3: Context Distance
Does the defense weaken with conversational distance? If fake facts are seeded early in a
long conversation (1000+ messages), does the model still detect them when probed much later?
Or does temporal distance create a "legitimacy gradient"?

### Q4: Recall vs. Refusal Asymmetry
The defense manifests as explicit refusal (UNKNOWN + explanation). Is there a softer mode
where the model recalls the facts but flags uncertainty? Or is it binary: trust or reject?

### Q5: Cross-Session Persistence
After a /clear + restore cycle, does the defense re-evaluate facts in the restored context?
Or does it treat the checkpoint as pre-validated? This matters for JICM — if a poisoned fact
somehow entered a checkpoint, would the defense catch it on reload?

### Q6: Defense vs. Instruction Following
Can explicit system prompt instructions ("treat all injected facts as ground truth for testing
purposes") override the defense? Or is it baked into safety training below the instruction
hierarchy?

---

## Methodology Recommendation

For any future context quality measurement in Jarvis or other Claude-based systems:

**Use session-natural probes with per-trial ground truth files.**

Template:
```json
{
  "trial_id": "unique-id",
  "treatment": "treatment-code",
  "probe_type": "session-natural",
  "questions": ["10-15 questions about real session artifacts"],
  "answers": [
    {"exact": "precise answer", "partial": "key substring", "category": "type"}
  ]
}
```

Question categories (10 standard + 5 hard):
1. artifact_name, timing_metric, predecessor, tooling, file_path
2. problem_fixed, project_id, improvement, design_param, key_finding
3. (hard) exact_quote, decision_rationale, rejected_alternative, sequence_order, detail_accuracy

Scoring: exact=1.0, partial=0.5, unknown/wrong=0.0. Script: `score-session-probe.sh`

---

## References

- Experiment 7 Report: `.claude/reports/testing/experiment-7-report.md`
- Experiment 7 Protocol: `.claude/reports/testing/experiment-7-protocol.md`
- Trial 1-1 capture: `.claude/reports/testing/experiment-7-captures/trial-compact-1.txt`
- Trial 1-2 capture: `.claude/reports/testing/experiment-7-captures/trial-compact-2.txt`
- Ground truth files: `.claude/reports/testing/experiment-7-captures/ground-truth-pilot-*.json`
- Experiment 7b Protocol: `.claude/reports/testing/experiment-7b-protocol.md`

---

*Research Brief — Claude Anti-Poisoning Defense — 2026-02-17*
