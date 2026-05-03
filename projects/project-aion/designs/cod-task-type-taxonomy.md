# Chain-of-Draft Task-Type Taxonomy (Phase 2 Prep)

**Version**: 1.0.0
**Date**: 2026-05-03
**Status**: Foundational — drives Tasks 2.2 (few-shot library) and 2.5 (benchmark task selection)
**Cross-references**:
- Roadmap: `projects/project-aion/reports/token-compression-roadmap.md` §3 Phase 2, §4.6 decision tree
- Implementation guide: `projects/project-aion/reports/token-compression-implementation-guide.md` §6
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`

---

## Purpose

Define the five Jarvis task types that comprise the Phase 2 CoD experimental scope.
For each type, specify:
1. **Definition** — what counts as this task type
2. **Distinguishing features** — how to identify a task as this type
3. **Reasoning shape** — pattern of internal deliberation
4. **Baseline thinking-token range** — what we expect without CoD
5. **CoD fit** — why CoD might (or might not) help
6. **Quality regression risk** — specific failure modes
7. **Sample prompts** — three concrete examples per type

The five types map to the Phase 2 hypothesis brackets in the pre-registration:
code_review (-55), bug_diagnosis (-50), planning (-45), research (-35), session_mgmt (-40).

The bracketing is a **structure-fit theory**: tasks with checklist-like reasoning structure compress
best under CoD; tasks requiring multi-source synthesis compress least. Stage 2 will validate this.

---

## Type 1: code_review

### Definition
Analyzing existing code for correctness, style, architecture, security, or
performance. Output is typically a list of findings with explanations and
recommended fixes. Task is *evaluative*, not *generative* — does NOT include
"write a function", "implement X", "generate code".

### Distinguishing features
- Prompt references existing code (file path, code block, diff)
- Prompt asks for assessment, identification, or critique
- Expected output: enumerated findings, severity classifications, actionable recommendations
- Reasoning artifacts: visible thinking blocks enumerate code paths and check each against criteria

### Reasoning shape: **structured checklist**
The model walks through the code applying a stable evaluation framework
(security checks → correctness checks → style checks → architecture checks).
Each check is largely independent; the rationale chain is shallow per check
but wide across checks.

### Baseline thinking-token range
- Small diff (10-50 lines): 1,500-3,500 thinking tokens
- Medium PR (100-500 lines): 4,000-8,000 thinking tokens
- Large refactor (1000+ lines): 8,000-15,000 thinking tokens

### CoD fit: **HIGH (target -55%)**
Rationale: each check is a discrete reasoning unit (≤5 words: "buffer overflow risk",
"missing null check", "naming style violation"). The structured-checklist character
maps almost directly onto CoD's compressed-step format. Few-shot examples should
emphasize the per-check pattern.

### Quality regression risk
- **Loss of nuance** when severity classification requires context (e.g., "this is
  fine in test code but unsafe in production"). CoD's 5-word limit may flatten
  context-dependent assessments to context-free ones.
- **Missed cross-cutting concerns** (e.g., an API change that ripples through 3
  files; CoD's per-step format may treat each file independently).
- Mitigation: at Phase 2.2 few-shot authoring, include one example per file
  demonstrating context-preservation through cross-step references.

### Sample prompts
1. "Review this PR. Focus on the authentication flow changes — are session tokens still rotated correctly after the refactor?"
2. "Audit the error-handling in `src/db/connection.py`. Are there any paths that swallow exceptions silently?"
3. "Look at the new `parseUserInput` function. Is the input sanitization adequate for SQL injection prevention?"

---

## Type 2: bug_diagnosis

### Definition
Root-cause analysis of an observed failure (test failure, crash, unexpected
behavior, regression). Output is typically a hypothesis chain leading to a
specific root cause and a proposed fix. Task is *investigative*, not
*generative* — distinct from "implement the fix" which is code generation.

### Distinguishing features
- Prompt presents a symptom (error message, stack trace, failing test, regression)
- Prompt asks "why" or "what's causing this"
- Expected output: hypothesis-test sequence converging to root cause; minimal fix
- Reasoning artifacts: visible thinking enumerates candidate causes and rules each in/out

### Reasoning shape: **hypothesis-test branching**
The model generates candidate causes (often 3-5), then tests each against the
evidence. Tests can rule out causes quickly (single-step rejection) or require
multi-step investigation. Final step converges on the surviving hypothesis.

### Baseline thinking-token range
- Simple bug (typo, off-by-one): 800-2,000 thinking tokens
- Concurrency / race condition: 4,000-10,000 thinking tokens
- Cross-system regression: 6,000-12,000 thinking tokens

### CoD fit: **HIGH (target -50%)**
Rationale: each hypothesis-test cycle is naturally compressible. "Hypothesis: race in lock
acquisition. Evidence: stack trace shows mutex contention. Verdict: confirmed."
This 3-step pattern fits the CoD format almost exactly. The risk is that
*ruling out* candidates often requires evidence interpretation that CoD's
5-word limit can't capture.

### Quality regression risk
- **Premature convergence** — CoD's compression may push the model to commit to
  the first plausible hypothesis without ruling out alternatives.
- **Lost evidence chain** — for cross-system regressions, the evidence
  interpretation IS the diagnosis. CoD compresses out the interpretation.
- Mitigation: few-shot examples should demonstrate explicit "rule out" steps
  even when compressed (`"Rule out: lock-free works"` rather than skipping
  the rejection).

### Sample prompts
1. "The chain-resume tests are flaky. They pass locally but fail ~30% of the time in CI. What's likely causing this?"
2. "After upgrading asyncpg from 0.27 to 0.29, our connection pool is leaking connections. Why?"
3. "This test `test_jicm_cycle` is failing with 'tokens=0' — it was passing yesterday. Diagnose what changed."

---

## Type 3: planning

### Definition
Proposing an approach for new work — architecture decisions, implementation
strategy, phasing, dependency ordering, scope decomposition. Output is
typically a structured plan with steps, decisions, tradeoffs, and a
recommendation. Task is *strategic*, not *tactical* — distinct from "write
the code" which is code generation.

### Distinguishing features
- Prompt asks "how should we...", "what's the best approach to...", "design X"
- Prompt may reference constraints (timeline, dependencies, existing architecture)
- Expected output: phased plan, decision points, recommended path with rationale
- Reasoning artifacts: visible thinking explores 2-4 candidate approaches before recommending

### Reasoning shape: **option enumeration → tradeoff comparison → recommendation**
The model enumerates 2-4 candidate approaches, then for each: identifies
strengths, weaknesses, fit-to-context. Concludes with a recommendation backed
by the comparison. The tree-of-options character means breadth matters.

### Baseline thinking-token range
- Single-feature plan: 2,000-5,000 thinking tokens
- Phased rollout (3-5 stages): 5,000-10,000 thinking tokens
- Architectural redesign: 10,000-20,000 thinking tokens

### CoD fit: **MEDIUM (target -45%)**
Rationale: tradeoff comparison can compress tightly when the axes are stable
("Approach A: faster, less safe. Approach B: slower, safer. Pick B if
production-bound."). But option *enumeration* needs space — CoD's 5-word limit
risks dropping options 3 and 4. The breadth of consideration is what produces
quality recommendations; compressing it too aggressively narrows the option
space.

### Quality regression risk
- **Reduced option breadth** — CoD may converge on the first 2 options rather
  than enumerate 4. The quality of the recommendation degrades when fewer
  alternatives are weighed.
- **Lost context-fit reasoning** — recommendation often hinges on a
  context-specific consideration ("this codebase already uses pattern X, so
  approach Y aligns better"). CoD's 5-word limit may strip this.
- Mitigation: few-shot examples explicitly enumerate 4 options with one-line
  tradeoff each, demonstrating that CoD's per-step compression need not
  reduce the *number* of steps.

### Sample prompts
1. "How should we approach migrating the JICM v7 watcher to v8? Consider rollback semantics and parallel-deploy options."
2. "Design the phasing for adding RAG-based search to the explorer UI. We have 3 weeks."
3. "What's the right architecture for sharing context between Jarvis and AIFred-Pro? One-way, two-way, or shared file system?"

---

## Type 4: research

### Definition
Synthesizing information from multiple sources to answer a question or
inform a decision. Sources may be code, docs, web research, prior session
notes. Output is typically a structured summary with citations and
caveats. Task is *aggregative*, not *evaluative*.

### Distinguishing features
- Prompt asks "what is...", "compare X and Y", "summarize..."
- Prompt may reference multiple sources or topics
- Expected output: organized summary, often with comparative tables or
  source attribution
- Reasoning artifacts: visible thinking traverses sources and integrates findings

### Reasoning shape: **multi-source synthesis**
The model reads source A, extracts relevant points; reads source B,
extracts relevant points; identifies overlaps, conflicts, gaps; integrates
into a coherent narrative. The synthesis step is where quality lives — it's
not just concatenation but interpretation.

### Baseline thinking-token range
- 2-3 source synthesis: 3,000-6,000 thinking tokens
- 5+ source synthesis: 6,000-15,000 thinking tokens
- Comparison-table research: 8,000-20,000 thinking tokens

### CoD fit: **LOW (target -35%)**
Rationale: synthesis quality is *exactly* the thing CoD's 5-word limit
threatens. "Source A: claims X" + "Source B: claims Y" + "Conclusion: X" is
a synthesis failure — it's quotation, not interpretation. The interpretive
glue is what users want from research tasks. Compressing the glue
degrades the output.

### Quality regression risk
- **Synthesis collapse** — CoD compresses out the integrative reasoning that
  distinguishes research from quotation.
- **Lost caveats** — research output quality depends on flagging where
  sources disagree, are outdated, or have known biases. Compressing these
  caveats produces overconfident output.
- **Citation drop** — CoD's brevity-incentive may strip source attribution.
- Mitigation: research is the **borderline case** for CoD. Few-shot
  examples should demonstrate compressed synthesis with preserved
  citations (`"A,B agree: X. C disagrees: Y."`). If the few-shot library
  cannot demonstrate quality preservation, EXCLUDE research from CoD
  default routing per the skip rules.

### Sample prompts
1. "Research the SOTA for prompt caching in 2026. Compare Anthropic's TTL options to OpenAI's approach."
2. "What does the literature say about effort-of-thinking measurement in LLM agents? Are there validated rubrics?"
3. "Summarize the trade-offs between Postgres and SQLite for embedded analytics workloads (under 100GB). Cite sources."

---

## Type 5: session_mgmt

### Definition
Managing project state, priorities, context boundaries, work continuation —
the meta-task of coordinating Jarvis's own operation. Includes: updating
session-state.md, deciding what to work on next, scoping the next stage,
preserving context before /clear, post-resume restoration.

### Distinguishing features
- Prompt is operational ("what's next?", "update session-state", "checkpoint
  this work")
- Prompt may follow a Hippocrenae signal (AC-04 JICM, AC-09 meditation)
- Expected output: state update, prioritized next-step list, or checkpoint document
- Reasoning artifacts: visible thinking reviews state, computes deltas, ranks priorities

### Reasoning shape: **state-delta computation**
The model reads current state files, identifies what changed since the last
update, computes the next-state, and writes it back. Reasoning is
relatively *mechanical* — there's a stable algorithm (read → diff → rank
→ write) — but parameter-rich (many state files, many priority axes).

### Baseline thinking-token range
- Single-file checkpoint: 500-1,500 thinking tokens
- Multi-file state update: 1,500-4,000 thinking tokens
- Cross-project priority rerank: 3,000-8,000 thinking tokens

### CoD fit: **MEDIUM (target -40%)**
Rationale: state-delta computation is mechanical, so compression doesn't
threaten the algorithm — but the *parameter set* is large. CoD's 5-word limit
forces decisions about which deltas matter ("Phase 2 prep: started" vs "Phase
2 CoD prep work has begun this session"). The risk is that state files
become *terse* in a way that future-Jarvis can't decompress (defeats the
preservation purpose).

### Quality regression risk
- **Future-decompressibility loss** — state files written under CoD may be
  too compressed for *future-session* Jarvis to interpret correctly. This is
  a **temporal mismatch** failure mode unique to session_mgmt.
- **Lost decision history** — "decided to prioritize X over Y because Z" may
  compress to "X over Y" — the rationale is what makes the decision auditable.
- Mitigation: explicitly **EXCLUDE state-file *writes*** from CoD scope.
  Apply CoD only to the *reasoning* about state, not the *output state files*
  themselves. State files must remain self-contained for cross-session
  consumption.

### Sample prompts
1. "What's the highest-leverage thing to work on next, given the current Phase 2 prep status and the pending JICM 7.9.6c work?"
2. "Update session-state.md to reflect the four JICM cycles completed today and the Phase 2 CoD prep started."
3. "We're approaching the JICM threshold. Compute what to checkpoint and write the scratchpad entry."

---

## Summary table

| Task type | CoD fit | Target reduction | Reasoning shape | Quality risk |
|-----------|---------|------------------|-----------------|--------------|
| code_review | HIGH | -55% | Structured checklist | Lost cross-cutting concerns |
| bug_diagnosis | HIGH | -50% | Hypothesis-test branching | Premature convergence |
| planning | MEDIUM | -45% | Option enumeration + tradeoff | Reduced option breadth |
| research | LOW | -35% | Multi-source synthesis | Synthesis collapse |
| session_mgmt | MEDIUM | -40% | State-delta computation | Future-decompressibility loss |

## Skip-rule alignment

Per roadmap §4.6 decision tree, the following task types are **NEVER** subject to CoD:
- Arithmetic / numeric reasoning (paper measures -4% on math)
- Code generation (interferes with structured output)
- Creative writing (narrative coherence requires expanded reasoning)
- Tool-use heavy workflows (rationale IS the tool selection)

These are **out of scope for Phase 2** and out of scope for this taxonomy. The
five task types above are reasoning-eligible by construction.

---

## Implications for downstream tasks

### Task 2.2 (few-shot library)
- 5 example files at `.claude/skills/token-compression/prompts/cod-examples/`:
  - `code-review.md` — emphasize per-check pattern with cross-cutting flags
  - `bug-diagnosis.md` — emphasize explicit "rule out" steps
  - `planning.md` — demonstrate 4-option enumeration with one-line tradeoffs
  - `research.md` — preserve citations through compression; if not
    achievable, document the failure and recommend research be excluded
    from default CoD routing
  - `session-mgmt.md` — apply CoD to *reasoning about state*, NOT to
    *state file writes*
- Each file: 3-5 examples, ≤200 tokens per file, format `Q: ... Reasoning: [≤5w]; [≤5w]; [≤5w]. A: ...`

### Task 2.4 (runtime wiring)
- Detection of task type at injection time is required.
- `detect-phase.sh` is a v0.1.0 stub looking for *post-hoc* CoT markers — not
  suitable for *proactive* task-type classification at injection time.
- Two routing options:
  - **A. User-tagged**: explicit `--task-type code-review` flag at apply-cod.sh
    invocation; fail-safe (no auto-routing means no misroute risk).
  - **B. Heuristic-classified**: build a new `classify-task-type.py` that
    reads the prompt and emits one of {code_review, bug_diagnosis, planning,
    research, session_mgmt, none}. Higher misroute risk; requires its own
    eval against a labeled prompt set.
- Recommendation: **A first**, B deferred until eval data justifies it.

### Task 2.5 (benchmark)
- Per-task-type benchmark requires ≥5 prompts per type (25 total minimum
  per pre-registration sample_targets).
- Quality scoring uses cc-compression-bench rubric methodology — for each
  prompt, define `key_points`, `must_use_terms`, `must_avoid` BEFORE
  running the benchmark.
- Phase 2.5 is GATED on Phase 1.1 Stage-2 PASS (currently scheduled
  2026-05-15) so output_token brevity baseline is established when
  measuring thinking_token reduction.

---

*CoD Task-Type Taxonomy v1.0.0 — 2026-05-03*
