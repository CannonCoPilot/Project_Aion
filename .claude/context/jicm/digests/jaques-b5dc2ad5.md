## FORENSIC RECORD

### Task 2 Feasibility Gate
The feasibility gate for Task 2 was **passed decisively**. The published statistics from the paper were successfully recomputed from the deposited tables, with ten published quantities aligning exactly. The only discrepancy noted was in the background SNP count, which was off by 20 (220,200 in the deposit vs. 220,220 in the paper). This discrepancy did not propagate into the significance calls, and the paper's own Bonferroni threshold aligned with the deposited data. The feasibility gate was committed as `37910fa` and documented in `27-task-002-feasibility-gate.md`.

### Calibration Driver
The calibration driver, which was initially stalled, was later found to be blocked due to a Cloudflare bot-block triggered by the default `urllib` user-agent. This led to incorrect readings of the budget status. After correcting the user-agent to a browser-compatible one, the driver was able to confirm that the budget had indeed refilled, albeit briefly. However, the gateway later returned a server-side error (`400 {"message":"Following keys are not valid: vertex"}`), which was traced to a misconfiguration on Snorkel's side. This issue was escalated for resolution.

### Phosphosite Task Revisions
The phosphosite task was revised to address reviewer feedback. The comparison population was explicitly defined, with rules for which cells must be present or absent in `comparison.csv`. The task was hardened by introducing four new discriminators based on real data:
- **Multiple published tables**: The task now includes three real published tables from the open-access paper (PXD007058, PXD000612, and PXD008355), requiring agents to identify which table the deposit corresponds to.
- **Tie sensitivity**: The estimator's sensitivity to tied-probability rows was introduced, with permutations showing up to 17 site count variations.
- **Directional sequence metric**: The metric was refined to require directional measurements (e.g., next-residue-is-serine), which Gly showed 58% adjacency, while Ala showed 10%.
- **Answer-key lookalike**: The `Incorrect pool.` flag was identified as a per-peptide identity flag, not a per-site position flag, and was used to test agents' ability to distinguish between real and lookalike answer keys.

The revised task was committed as `73bc0fd`, with all gates passing and 36/36 baselines failing. The instruction file was trimmed to 250 words, and the task was hardened to ensure it remained at the frontier level.

### Subagent Calibration Harness
A subagent calibration harness was developed to mimic the `stb harbor AI run` process. The harness stages a trial and scores it using the real verifier in the real image. It was tested against the oracle and an empty run, confirming its reliability. However, it was noted that the harness is not sandboxed and could potentially read grading material, which is a limitation compared to the containerized `harbor` process.

### Context and Isolation
It was confirmed that general-purpose subagents do not inherit the chat history of the parent session. However, they do inherit the working directory, which can lead to the loading of `CLAUDE.md` and the memory index. To mitigate this, a new `run` subcommand was implemented to stage trials outside the repo, using `claude -p` with `--system-prompt` and `--strict-mcp-config` to ensure isolation. This was committed as `56c4ae5`.

### Trial Outcomes
Two trials (`h01` and `h02`) were run against the hardened phosphosite task. Both initially passed but were later found to be contaminated due to the inherited context. After re-running with the isolated harness, both trials failed the new directional-metric check, indicating that the hardening had successfully increased the difficulty. The trials were rescored, with `h02` passing 46/46 and `h01` failing one check.

### Pending Actions
- The server-side `vertex` 400 error needs to be escalated to Snorkel for resolution.
- The `email` field in `task.toml` remains `"anonymous"` and requires user input.
- The isolated harness needs to be fully validated to ensure it does not inherit any unwanted context.
- The vocabulary-quiz defect in the directional-metric check needs to be addressed to avoid false negatives.