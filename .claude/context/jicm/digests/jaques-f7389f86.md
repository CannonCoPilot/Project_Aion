## Gate 2's False-Alarm Bug Fix (Commit `5b031b6`)

The Gate 2 false-alarm bug was resolved by addressing a critical flaw in the verification logic. Previously, the gate relied solely on the exit status of the `test.sh` script, which always returned `0` for Starfish tasks. This led to incorrect pass verdicts for naive baselines that clearly failed. The fix involved updating the logic to consider both the exit status and the contents of `reward.txt`. Now, a pass is only granted if `test.sh` exits with `0` **and** `reward.txt` contains the value `1`. This change prevents silent misclassification of baseline failures.

Two additional issues were resolved during the implementation:

1. **Hardcoded `/workspace` path**: The path to the working directory was generalized to derive from the Dockerfile's `WORKDIR` directive. This ensures flexibility and correctness across different task configurations.
2. **Mounting only `solve.sh`**: The Starfish sample's `solve.sh` script invokes a sibling `solve.py` file. Mounting only `solve.sh` would break the execution of sound bundles. The fix involved mounting the entire solution directory to ensure all necessary files are accessible.

The fix was rigorously tested using a synthetic Starfish-shaped bundle. The test confirmed that the updated logic correctly identifies and rejects naive baselines, while passing valid solutions. The Beech regression suite was also run, confirming that the fix did not introduce any new issues. The regression suite passed all 43 runs with zero failures.

## The Testing Doc Arrival and Rule Changes (Commit `c8b3420`)

The Testing Doc, delivered by W11:Jarvis-dev, introduced several significant changes to the project's rules and guidelines. The document was thoroughly analyzed and integrated into the project's documentation and memory files. Key changes include:

- **Starfish's Internal Gates**: Starfish already has its own two gates, which must be validated before submission. Specifically, `harbor run -a oracle` must score a mean of `1.000`, and `harbor run -a nop` must score a mean of `0.000`. These gates are now the authoritative checks for Starfish tasks.
- **Bundle Path Structure**: The bundle path is now nested under `tasks/<domain>/<subdomain>/<task-name>/`, with no wrapper folder in the ZIP. This structure aligns with the rejection of tar.gz formats.
- **Instruction Constraints**: The `instruction.md` file must be between 150–250 words and adhere to a strict style guide. It must avoid numbered steps, thresholds, and LLM voice. However, stating the evaluation metric or scoring formula is allowed.
- **Task Requirements**: Tasks must include at least 25 logical agent steps, a `solution_explanation.md` file of at least 500 words, a `[agent] timeout_sec ≥ 900`, and difficulty bands quantified by frontier solve rates. Additionally, there is a limit of 10 submissions per day.
- **Task Styles**: A second task style, rubric-based with LLM-as-judge, was identified. This expands the project's scope beyond the previously modeled deterministic tasks.

One correction was made to the project's documentation: a recommendation to copy the sample's `environment/generate_data.py` pattern was retracted. This pattern violated the guidelines, which explicitly prohibit generation artifacts in the bundle. The sample was reclassified as a worked example rather than a conformance reference.

## Remaining Blockers and Next Steps

Despite the progress, one critical issue remains unresolved: the `navigate` command is still being classified by the classifier, even though the 22 allow rules are correctly configured on disk. This issue is attributed to the session being cleared rather than relaunched, which fixed the permission configuration at launch. The `navigate` command is essential for accessing the live `coding-submission-guidelines.md` diff and the 9 unheld cross-project pages, including the `Recent Updates` page, which is the platform's change log and the only source for detecting drift.

The recommended solution is to restart the session using the `restart-lane` command. This action will reload the configuration and potentially resolve the `navigate` issue. However, this step requires user approval, as it involves restarting the current window.

In the meantime, the P1 corpus work is unblocked and can proceed. This includes the rule cards backfilled from the teardown, the 16 mirrored GitBook pages, and the 8 Testing tabs. The next steps involve:

- **Running the `navigate` command** to test if the issue is resolved.
- **Fixing the persona's import path** to point to the correct scratchpad file.
- **Starting the P1 corpus work**, including writing rule cards and validating the schema.

The `recent-updates.md` file was found to be an empty template, confirming that the platform's change log is not a reliable source for drift detection. This finding aligns with the project's anticipated limitations and validates the need for checksum-diffing the mirrors as the primary method for detecting drift.

The `corpus_lint.py` script was developed to enforce the schema, validate the scope, and detect drift via SHA-256 hash mismatches. The script also checks for consistency in `supersedes/superseded_by` links and flags dangling wikilinks. This ensures that the corpus remains mechanically checked and up-to-date.

The P1 corpus was successfully built and validated, resulting in 29 atomic cards. The script was negative-tested to ensure it correctly identifies and flags issues. The coverage report was also refined to provide actionable insights into the project's knowledge gaps.

The next phase involves scoping the first Starfish task, which is constrained by the domain, subdomain, and difficulty level. The task must include a deterministic data generator, a digest-pinned Dockerfile, and a comprehensive solution explanation. The task must also be validated using the `harbor` and `stb` tools, which are now installed and configured.

The task was built and validated using the `harbor` tool, confirming that the required gates pass. The `harbor run -a oracle` and `harbor run -a nop` commands were executed, resulting in the expected scores of `1.000` and `0.000`, respectively. This confirms that the task meets the required standards and is ready for submission.

The final step involves running the frontier calibration against GPT 5.5 and Opus 4.8 to validate the `frontier` difficulty band. This step is crucial for ensuring that the task's difficulty is accurately measured and not just a design argument. The calibration will be executed using the valid API key and the correct base URLs for the models.

The project is now in a state where the first Starfish task is ready for submission, pending the final calibration and any necessary adjustments based on the results. The next steps will involve running the calibration and addressing any remaining issues or questions.