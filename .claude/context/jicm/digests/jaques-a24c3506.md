# .scratchpad.jaques.md

## Task 1 Calibration Status

- Calibration loop running on claude-sonnet-4-5 tier, targeting 8 counted trials
- Current standing: 1 counted trial from 12 attempted
- 10 trials died on gateway budget, 1 wrote nothing
- Stage profile from counted trial:
  - protocol: 3/3
  - recomputation: 2/5
  - forensic_reconstruction: 0/2
  - adjudication: 4/4
- Loop now timestamps every probe to measure refill cadence empirically
- Observed refill window: ~5-6 minutes (but only once)
- Current state: budget spent for ~22 minutes straight

## Task 2 Feasibility

- Candidate: Nikelski, Rubtsov & Irwin, *Mol Ecol* 10.1111/mec.17526
- Dataset: Dryad 10.5061/dryad.prr4xgxw7
- Files pulled and verified: 13/13 against manifest sha256
- Data includes:
  - Three GEMMA association files (220,201 rows each)
  - Three phenotype files (320 rows each)
  - ADMIXTURE K=2 proportions
  - PC scores
  - LD data (up to 10.38 MB)
  - Metadata
- Total size: ~132 MB (excluding 7.3 GB VCF)
- License: CC0-1.0 verified via API
- Next step: Attempt to reproduce paper's published statistics from these tables

## Key Findings

- `stb keys refresh` is capped at 20 refreshes account-wide
- Usage allowance refills on a time window (observed ~5-6 minutes, but likely more complex)
- Zero-inference probes may count against request-based limits
- Otter/Starfish key rotation doesn't reset budget
- Calibration loop now waits and polls at zero inference cost

## Pending Actions

- Continue monitoring calibration loop for refill cadence
- Attempt to reproduce paper's statistics from task 2 dataset
- Finalize task 2 scaffolding if reproducibility is confirmed
- Continue running calibration loop in background