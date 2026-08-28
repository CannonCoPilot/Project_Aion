# JICM v7 Context Checkpoint
Generated: 2026-08-27T17:38:52Z

## Session Status
(session-state.md last updated 3177m ago — may be stale, prefer conversation for current task)

## Git State
Branch: main
### Uncommitted Changes
```
 M .claude/context/.current-dev-uuid
 M .claude/context/.current-genie-uuid
 M .claude/context/.current-jaques-uuid
 M .claude/context/.current-w0-uuid
 M .claude/context/.graphiti-last-ingest.json
 M .claude/context/.jsonl-compression-stats.json
 M .claude/context/.last-sample.w0
 M .claude/context/.memory-health.json
 M .claude/context/.pre-clear-scrollback-summary.md
 M .claude/context/.pre-clear-scrollback.md
 M .claude/context/.retrieval-state.json
 M .claude/context/.scratchpad.dev.md
 M .claude/context/.scratchpad.genie.md
 M .claude/context/.scratchpad.jaques.md
 M .claude/context/.scratchpad.md
```
### Recent Commits
```
 .claude/scripts/CLAUDE.md                          | 15 ++++
 .../scripts/{ => archived}/jarvis-statusline-v8.sh |  0
 .claude/scripts/signal-helper.sh                   |  2 +-
 CLAUDE.md                                          | 84 ++++++++++++++++++++++
 alfred/.claude/settings.json                       |  4 ++
 alfred/scripts/profile-loader.js                   |  8 +++
 6 files changed, 112 insertions(+), 1 deletion(-)
```

## Recent Conversation (last 10 messages)

### User Messages
pin it in the README, then rerun m04 and m07
Very interesting that the more we work on a task, the easier it seems to become.  Why do you think that is?  Do a deep dive into everything we've worked on for SnorkelAI so far to try to find real evidence to answer that question.
so what we really need is to do some exansive literature research on the current state of task failure, induction of hallucination, or any other kinds of potential failure modes that can be triggered in a frontier model.  Our job, separate from and above and beyond the job of other expert contributors, is to thoroughly analyze, explore, discover, and exploit the weaknesses of current rontier models.  I think that our current state of circumstantial evidence suggests that we are so far barking up the wrong tree.  I'll need you to put on your AI Scientist hat and formulate a plan for discovery research to learn everything you can about the current state of frontier model failure.  Chase down a wide range of types of source material including peer-reviewed scientific publications, white papers, blog posts, anecdotes from others in the field, and other source types even to the point of Tweets from AI leaders.  Cast a wide net, but trawl deeply. Dredge up anything and everything relevant that you can find. Gather all materials that you can obtain into a file space somewhere within the SnorkelAI project space. Organize it nicely. Keep local copies of everything. Keep an anotated bibliography of everything.  You have my clearance to set sail, Jacques. Bon voyage.
run the capability-tier experiment on the claims stage
build the harder claim set for EXP-02

### Assistant Responses
That result kills my own H2, and corrects something I told you earlier. Recording it:
The experiment ran, and it refutes the thing I told you to bank. Reporting it straight.

## What I predicted, and what happened

Pre-registered before any trial: H1 said the settled-minus-unsettled gap would **widen** with capability. Isolated claims-stage probe, three tiers:

| tier | model | k | settled | unsettled | gap | NE rate |
|---|---|---|---|---|---|---|
| T1 | haiku-4.5 | 1 | 0.33 | **1.00** | −0.67 | 0.60 ⚠ |
| T2 | sonnet-5 | 2 | 0.62 | **1.00** | −0.38 | 0.42 |
| T3 | opus-5 | 2 | 0.88 | **1.00** | −0.12 | 0.42 |

**Unsettled accuracy is 1.00 at every tier.** The gap narrows, but that is a **ceiling effect, not a null result** — the measure can't detect a difference in either direction. H1 unsupported, H0 unsupported, instrument saturated.

The pilot also exposed a confound my pre-registration missed: a model answering `not_evidenced` indiscriminately scores 2/2 without skill. I added a bias diagnostic (leaving the pre-registered measure untouched, and recording that I added it after seeing T1) — it correctly flags haiku, which over-abstains at 0.60 against a calibrated 0.33 and omitted a claim outright. T1 is failing the task, not exhibiting the failure.

## Then the free experiment killed my follow-up hypothesis too

Reading t3a's reasoning, I thought I'd found something: opus-5 in isolation articulates the necessary-not-sufficient trap *perfectly* — "that rules out the strongest form of 'wrong residue' but not mis-assignment among the S/T/Y candidates… which would need the library key, and the key is not deposited" — while m04r articulated the same distinction in the full task and ruled against itself. That suggested a **load-dependent** failure, linking A2 to context rot.

Ten m-series trials already contain `claims_assessment.json` under the full-task condition. Scoring them costs nothing:

| condition | n | settled | **unsettled** |
|---|---|---|---|
| **loaded** (after full reconstruction) | 10 | 0.97 | **19/20 = 0.95** |
| **isolated** | 2 | 0.
Building this properly means grounding every claim in the actual deposit. Let me look at what the tables can and cannot settle.
Good material. Digging into what is genuinely underdetermined versus merely unstated:
Now testing candidate claims against the data — each must be settleable one way only:
Two candidates need sharper tests before I trust them. Checking whether `PTM_best_score` is decisively refuted, and whether the pool note has a hidden trap:
All three verified decisively. One candidate died under scrutiny, which is worth recording. Building the set:
All ten hold. Now negative-testing the verifier — a checker that never fails proves nothing:
Six for six — the verifier discriminates. Writing the agent-facing statements and the design record:
Built and verified. **10 claims, mix 4 contradicted / 1 supported / 5 not_evidenced.**

## What makes this set harder

EXP-01 showed the old two unsettled items were solved unprompted by both sonnet-5 and opus-5 because *"the key is not deposited"* is a one-step observation. So every new unsettled claim is underdetermined in a **structurally different way**, and each carries a **salient computation that looks decisive but isn't**:

| claim | kind | the trap |
|---|---|---|
| `pool_note_marks_a_synthesis_mismatch` | necessary-not-sufficient | Recorded `Pool` equals the USI pool in **37/37** noted rows — but that compares two records of the *same observation*. The pool a peptide was *synthesised into* is nowhere in the deposit. |
| `a_score_threshold_is_recorded` | floor ≠ threshold | Every table has a clean score floor (0.7066–0.8032) that reads as a cut-off. A floor is consistent with *any* threshold at or below it — and the floors **differ per table**. |
| `replicates_are_technical` | provenance unrecorded | `rep1`/`rep2` sit right there in the USI; nothing records which *kind* of replicate. |
| `every_synthesised_peptide_appears_here` | absence vs non-detection | The canonical shape: only *observed* peptides are listed. |
| `identification_and_localisation_errors_are_separable` | confounded error kinds | `DecoyP` looks like an error flag; it records only that the **position** is on the decoy residue. Nothing validates the peptide **ID**. |

Blanket strategies fail by construction — all-NE scores 5/10, all-contradicted 4/10.

## Verification, not assertion

`verify_claims.py` **recomputes all ten from the shipped CSVs** and exits non-zero if any recomputation stops matching its verdict. And it's **negative-tested**, not just run — six perturbations, each of which should flip exactly one claim, and all six flipped: making `PTM_best_score` a true per-site max, filling `PSM_count`, breaking one decoy correspondence, adding a `design_pool` column, adding a `score_thres

## Resume Instructions
You are Jarvis. Context was cleared via JICM v7 stop-and-wait cycle.
Foundation docs (CLAUDE.md, capability-map.yaml, identity) are auto-loaded.

### Context restoration checklist:
1. Review the session status, active plan, scratchpad, and conversation above.
2. Check .claude/context/.scratchpad.md for transient working details (credentials, paths, gotchas).
3. Query jarvis-rag (collection: sessions) for recent session summaries relevant to current work.
4. Query jarvis-graphiti for facts related to current task.
5. If conversation above is sparse, read session-state.md for full priorities.
6. Resume work immediately. Do NOT greet. Do NOT ask what to work on.

---

## Session History Digest (previous session ef5b8621)

*What actually happened in the session before this one — distilled from its full
transcript. The checkpoint above is curated working state; this is the record.*

# .scratchpad.jaques.md

## Current State

### Bundle Status
- Commit: `a382e62`
- README pin: **Uncommitted**
- Gate 1: Pass
- Gate 2: 41/41 baselines fail
- Oracle: 1.000
- NOP: 0.000
- Preflight: 0 BLOCK
- Portal replay: Clean

### Open Decisions
1. **Sequence Metric Contradiction (a)/(b):**
   - (a) Tighten the sequence check to require a measure that demonstrably separates Gly
   - (b) Drop Gly from `EXCLUDED_RESIDUES` when the trial's own declared metric doesn't support excluding it

2. **README Pin Commitment:**
   - Whether to commit the pinned definition in the README

### m-Series Final Results
- Post-pin: 7/8 = 87.5%
- `difficulty` remains unset
- m04r failed on two different checks (absent-evidence stage and decoy-residue check)

### Research Programme Highlights
- **Verifier's Rule**: The ease of training AI to solve a task is proportional to how verifiable the task is
- **AbstentionBench**: 20 frontier LLMs, 20 datasets. Abstention is unsolved. Scaling does not help. Reasoning fine-tuning degrades it 24% on average
- **The Hallucination Tax of RFT**: Standard RFT cuts refusal rates by over 80%
- **HLE-Verified**: Only 668 of ~2,500 items passed clean validation; 1,143 repaired; 689 released as "uncertain"

### EXP-01 Results
- **Claims Stage Experiment**: Unsettled accuracy is 1.00 at every tier
- **Haiku**: Over-abstains at 0.60 against a calibrated 0.33 and omitted a claim outright
- **Sonnet-5 and Opus-5**: Articulate the necessary-not-sufficient trap perfectly
- **Loaded vs Isolated Conditions**: 19/20 (0.95) vs 4/4 (1.00) - m04r is a single outlier

### EXP-02 Claim Set
- **10 claims**: 4 contradicted / 1 supported / 5 not_evidenced
- **Harder claims**: Underdetermined in structurally different ways, each with a salient computation that looks decisive but isn't
- **Verification**: `verify_claims.py` recomputes all ten from the shipped CSVs and exits non-zero if any recomputation stops matching its verdict
- **Pre-run Gotchas**:
  - Calibrated NE rate is 0.50, not 0.33
  - Success condition: At least one NE kind must fall below ceiling on opus-5

### Rejected Candidate
- **Aggregate-only claim**: "The extra site in each published cell is identifiable" was rejected due to potential for a sixth defect of the family

## Historical Context

### m-Series Trials
- m01: 50/50 PASS
- m02: 50/50 PASS
- m03: 50/50 PASS
- m04: 48/50 FAIL (monotonicity + sequence metric)
- m05: 50/50 PASS
- m06: 50/50 PASS
- m07: 49/50 FAIL (monotonicity)
- m08: 50/50 PASS

### Monotonicity Audit
- m01, m04, and m07 initially failed due to convention dispute
- After pinning the definition in the README, m04r and m07r passed
- m04r failed on two different checks (absent-evidence stage and decoy-residue check)

### Research Findings
- **Label Noise**: MMLU has 6.49% incorrect answers; HLE-Verified shows significant label noise
- **Evaluation Crisis**: Karpathy notes significant issues with evaluation benchmarks
- **Inverse Scaling**: Some tasks show U-shaped inverse scaling at larger scales

### Task Design
- **AbstentionBench**: Measures reasoning LLMs' failure to abstain on unanswerable questions
- **Necessary-Not-Sufficient Trap**: A key failure mode where models write the gap into their own basis and rule against themselves anyway

## Files and Metrics

### Files
- `.scratchpad.jaques.md`
- `verify_claims.py`
- `statements.md`
- `claims_assessment.json`
- `run_meta.json`
- `agent_stdout.txt`
- `published_results.md`
- `2602.13964`
- `2406.04127`
- `2510.21460`
- `www.jasonwei.net`
- `2306.09479`
- `2211.02011`
- `2311.12983`
- `2411.04872`
- `x.com`
- `SOURCES.json`
- `BIBLIOGRAPHY.md`
- `00-research-programme.md`
- `A2-absent-evidence-reasoning.md`
- `99-synthesis.md`
- `2506.09038`
- `2505.13988`
- `2509.04664`
- `2506.06941`
- `2506.09250`
- `www.anthropic.com`
- `metr.org`
- `www.trychroma.com`
- `2307.03172`
- `2410.05229`
- `MEMORY.md`
- `0.01`
- `16-phase5-ladder-screen.md`
- `b6hjyddbk.output`
- `bkiezhihj.output`
- `subagent_calibrate.py`
- `instruction.md`
- `build_task_data.py`
- `reconstruction_parameters.json`

### Commit-like Hashes
- `a382e62`
- `56c4ae5`
- `285905cf`
- `66a0975844b1`

### Key Numbers / Metrics
- 7/8
- 0.33
- 0.50
- 4%
- 2/2
- 37/37
- 0.7066
- 0.8032
- 5/10
- 4/10
- 5,890
- 1,077
- 50%
- 5890/5890
- 0.4682
- 4/4
- 0.67
- 0.60
- 0.38
- 0.12
- 1.00
- 19/20
- 0.95
- 0.62