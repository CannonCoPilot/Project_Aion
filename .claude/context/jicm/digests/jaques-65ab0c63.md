# .scratchpad.jaques.md

## STATUS

- **Starfish task 2** (`biomarker-leakage-validation-001`) is built, committed (`47d1eaf`), and gate-clean (17/17, 8/8 baselines). Harbor oracle scores 1.000, nop 0.000. The task is ready for submission but difficulty is provisional and must be calibrated.
- **Beech task** (`demultiplex-read-fate-audit-001`) is ready for submission. It is gate-clean, verified from the archive, and submission metadata is documented in `SUBMISSION-METADATA-demultiplex-read-fate-audit-001.md`. The Opus 4.8 calibration half is unrun due to the gateway key being at $8.10 of its $10 limit.
- **Browser gate** for W13 is resolved as unfixable locally. The classifier is upstream and not related to launch-time configuration. No further action is needed.
- **Task 1** (`demultiplex-flowcell-release-001`) has metadata using invented vocabulary (`Statistical Genetics` is not a valid Biology subdomain). This is a real finding but not urgent as it is not being submitted.

## NEXT STEPS

1. **Calibrate Starfish task 2** (`biomarker-leakage-validation-001`) using the gateway key. This requires cycling the key and running the calibration script.
2. **Submit Beech task** (`demultiplex-read-fate-audit-001`). The task is ready for submission, and the offer expires on 2026-08-20.
3. **Address Task 1 metadata issues**. The task uses invented vocabulary and must be corrected before submission.

## DETAILS

### Starfish Task 2 (`biomarker-leakage-validation-001`)

- **Task Description**: A published 12-protein response signature with four independent design defects. The task requires the agent to audit the claim and design a real validation.
- **Gate 1**: 17/17 tests passed.
- **Gate 2**: 8/8 baselines failed on their own check.
- **Harbor**: Oracle scored 1.000, nop scored 0.000.
- **Generator**: Deterministic and verified.
- **Instruction**: 250 words, no tool names, no thresholds.
- **Solution Explanation**: 934 words.

### Beech Task (`demultiplex-read-fate-audit-001`)

- **Task Description**: A four-stage task with difficulty concentrated in adjudication. The task is a genuine four-stage task with the difficulty in adjudication.
- **Gate 1**: 24 runs, 0 failures.
- **Gate 2**: 24 runs, 0 failures.
- **Harbor**: Oracle scored 1.000, nop scored 0.000.
- **Verification**: Preflight 0/0, gates 24/24, portal replay 6/6.
- **Submission Metadata**: Documented in `SUBMISSION-METADATA-demultiplex-read-fate-audit-001.md`.

### Task 1 (`demultiplex-flowcell-release-001`)

- **Metadata Issues**: Uses invented vocabulary (`Statistical Genetics` is not a valid Biology subdomain).
- **Gate 1**: 24 runs, 0 failures.
- **Gate 2**: 24 runs, 0 failures.
- **Harbor**: Oracle scored 1.000, nop scored 0.000.

## OUTSTANDING ISSUES

- **Starfish Task 2 Calibration**: Requires a key cycle to run the calibration script.
- **Beech Task Submission**: The task is ready for submission, but the Opus 4.8 calibration half is unrun.
- **Task 1 Metadata**: Must be corrected before submission.

## FILES

- `task.toml` (30×)
- `solution_explanation.md` (4×)
- `test.sh` (12×)
- `reward.txt` (6×)
- `run_gates.sh` (2×)
- `solve.sh` (9×)
- `validation_design.json` (1×)
- `solve.py` (1×)
- `instruction.md` (8×)
- `study_design.json` (2×)
- `CLAUDE.md` (8×)
- `human_scores.json` (1×)
- `expected_truth.json` (2×)
- `aion-inbox.sh` (3×)
- `coding-submission-guidelines.md` (2×)
- `09-task-2-scoping.md` (1×)
- `settings.json` (1×)
- `08-submission-form-schema.md` (2×)
- `aion-lane-restart.sh` (2×)
- `instructions.md` (1×)
- `experts.snorkel-ai.com` (1×)
- `SUBMISSION-METADATA-demultiplex-read-fate-audit-001.md` (2×)
- `demultiplex-read-fate-audit-001.zip` (2×)
- `11-domain-vocabulary.md` (2×)
- `package_task.sh` (1×)
- `read_fate.json` (8×)
- `DERIVATION.md` (8×)
- `README.md` (3×)
- `seed_readfate_step4_workdir.py` (1×)
- `build_readfate_task_data.py` (2×)
- `10-readfate-calibration-2026-08-19.md` (1×)
- `run_beech_cal.sh` (1×)
- `bikzpg4uu.output` (1×)
- `result.json` (1×)
- `b32mu4ozi.output` (1×)
- `jaques.compressed.md` (1×)

## METRICS

- **Starfish Task 2**:
  - Gate 1: 17/17
  - Gate 2: 8/8
  - Harbor: Oracle 1.000, Nop 0.000
  - Generator: Deterministic
  - Instruction: 250 words
  - Solution Explanation: 934 words

- **Beech Task**:
  - Gate 1: 24/24
  - Gate 2: 24/24
  - Harbor: Oracle 1.000, Nop 0.000
  - Preflight: 0/0
  - Portal Replay: 6/6

- **Task 1**:
  - Gate 1: 24/24
  - Gate 2: 24/24
  - Harbor: Oracle 1.000, Nop 0.000

- **Key Numbers**:
  - 8/8
  - 1.000
  - 0.000
  - 8.10
  - 0.89
  - 0.79
  - 0.72
  - p=0.006
  - p=0.582
  - 17/17
  - 0.833
  - 0.77
  - 0.86
  - 0.12
  - 0.615
  - 0.155
  - 0.08
  - 0.11
  - 0.62
  - 2%
  - 0.006
  - 0.759
  - 0.138
  - 0.72