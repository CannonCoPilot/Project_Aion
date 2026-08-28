# .scratchpad.jaques.md

## Starfish Task 2 Calibration

### Current State
- **Gateway key is live** with full quota (119,999 req / 360M tok).
- **Starfish task 2 calibration** is the priority since its difficulty is provisional and required before submission.
- **Calibration script** for task 2 was missing, so I adapted the approach from the beech calibration script.
- **Task 1 metadata** has been fixed, with six invented values corrected against the platform's schema.

### Calibration Progress
- **Calibration is running** for Starfish task 2 using gpt-5.5 with k=3.
- **Task 2's metadata** is already clean, so I focused on fixing task 1's metadata.
- **Calibration result** for task 2 was 0/3, but further analysis showed that all three trials got the science right but failed on two reporting checks.

### Verifier Diagnosis
- **Two verifier tests** were grading presentation rather than analysis:
  - `test_the_overlap_is_quantified_somewhere_in_the_audit` demanded both 30 overlapping patients and 45 affected samples, but the instruction only asked for one magnitude.
  - `test_the_signature_composition_is_characterised` required the batch-driven protein count to appear in `validation_design.json`, but the instruction didn't ask for it there.
- **Gate 1** cannot catch these issues because the reference always presents things its own way.
- **Gate 2** was run to check if the fixes were sufficient, and it confirmed that the checks still discriminate properly.

### Key Budget
- **One $10 key** is available, which is not enough to run both halves of the calibration (codex and Opus).
- **Key refresh** is needed before running the Opus half of the calibration.

### Beech Task
- **Beech task** `52859a0a` has expired, and `demultiplex-read-fate-audit-001` is ready for submission.
- **Beech difficulty** is left blank by rule, so the unrun Opus half doesn't block submission.

## Experiment 2: Adjudication by Degree

### Design
- **New deliverable**: `author_claims.md` with eight numbered claims in the authors' voice.
- **Four verdicts**: `supported`, `overstated`, `contradicted`, and `not_evidenced`.
- **Two claims of each verdict**, with discriminators turning on degree of overreach.
- **Baselines**: `accepts_the_overstated_claims` and `rejects_what_the_record_is_silent_on`.

### Prediction
- **C3 and C4** are expected to be where the difficulty breaks, as they test the `overstated` verdict.
- **C7 and C8** are expected to hold, as experiment 1 showed that `not_evidenced` was handled correctly.

### Cost
- **Screen cost**: ~$4.42.
- **Key budget**: ~$5.5 remains, so the screen fits without a refresh.

## Next Steps
- **Run the screen** for experiment 2 to test the adjudication by degree design.
- **Address Jorg's questions** once the screen is complete.