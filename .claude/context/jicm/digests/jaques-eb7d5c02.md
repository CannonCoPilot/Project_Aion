## FORENSIC RECORD

### Context and State
The session was paused with the new task `demultiplex-read-fate-audit-001` fully built and gate-clean. The task is uncalibrated and unsubmitted, with the offer `52859a0a` expiring on 2026-08-20. The task is based on a scientific workflow with four milestones, each designed to test specific aspects of demultiplexing and data analysis. The task uses data from the same source run as the previous task but explores different scientific signals.

### Files and Metrics
- **.scratchpad.jaques.md**: Updated to reflect the current state, including the new task and operational rules learned during the session.
- **solution_explanation.md**: Contains the explanation of the solution for the new task.
- **task.toml**: Configuration file for the new task.
- **read_fate.json**: Contains data on the read fate for the new task.
- **variation_findings.json**: Contains findings on variation for the new task.
- **verification_gap.json**: Contains data on the verification gap for the new task.
- **remediation.json**: Contains remediation data for the new task.
- **run_manifest.json**: Contains the run manifest for the new task.
- **process_catalog.json**: Contains the process catalog for the new task.
- **test.sh**: Test script for the new task.
- **_common.py**: Common functions for the new task.
- **run_beech_cal.sh**: Script for running the Beech calibration.
- **solve.sh**: Script for solving the new task.
- **harbor.py**: Script for interacting with Harbor.
- **DERIVATION.md**: Documentation on the derivation process for the new task.
- **integrity.json**: Integrity data for the new task.
- **expected_truth.json**: Expected truth data for the new task.
- **03-source-runs-assessment.md**: Assessment of the source runs for the new task.
- **test_outputs.py**: Test outputs for the new task.
- **instruction.md**: Instructions for the new task.
- **result.json**: Results for the new task.
- **run_calibration3.sh**: Script for running the calibration.
- **config.json**: Configuration data for the new task.
- **summarise.py**: Script for summarizing the results.
- **portkey_probe.py**: Script for probing the Portkey API.
- **portkey_utils.py**: Utility functions for the Portkey API.
- **CLAUDE.md**: Documentation on the Claude API.

### Commit-like Hashes
- **52859a0a**: Offer ID for the new task.
- **56d5552**: Commit hash for the new task.
- **bbbaab75**: Zip file hash for the new task.
- **cff21db0**: Commit hash for the previous task.
- **c7c107e39e56**: Commit hash for the previous task.
- **c95439a5**: Zip file hash for the previous task.
- **8fce95af**: Zip file hash for the previous task.
- **cb869485**: Project ID for the Portkey API.

### Key Numbers / Metrics
- **1.000**: Perfect score for the new task.
- **0.000**: Zero score for the new task.
- **0/0**: No errors for the new task.
- **6/6**: All stages passed for the new task.
- **3,026**: Total demultiplexed data in GB.
- **12.5228**: Percentage of data that never carried into trimming.
- **0.0009**: Retention variation across lanes.
- **0.0503**: Retention variation across libraries.
- **104/104**: Number of samples processed.
- **0/104**: Number of samples with adapter sequences.
- **434,450**: Difference in bytes between FASTP and FALCO.
- **426,560**: Difference in bytes between FASTP and FALCO.
- **0.002**: Percentage difference in bytes between FASTP and FALCO.
- **12.5%**: Percentage of unassigned reads.
- **12.52**: Percentage of unassigned reads.
- **2292.08**: GB of data processed by FALCO.
- **12.39**: Percentage of unassigned reads in one lane.
- **12.68**: Percentage of unassigned reads in another lane.
- **13.4%**: Percentage of data removed by trimming.
- **16.6%**: Maximum percentage of data removed by trimming.
- **86.6%**: Minimum percentage of data retained.
- **11.5%**: Minimum percentage of data removed by trimming.
- **0.834**: Minimum retention rate.
- **0.885**: Maximum retention rate.