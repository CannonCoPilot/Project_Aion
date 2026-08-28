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