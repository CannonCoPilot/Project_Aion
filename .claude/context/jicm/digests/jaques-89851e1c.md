# Phase 3 Pitfall Inventory and Phase 4 Milestone Build

## Phase 3 Pitfall Inventory

The Phase 3 pitfall inventory identified twelve independent issues in phosphosite FLR analysis, with four key findings derived directly from the 969-row CSV file rather than the paper's narrative:

1. **Column Mismatch**: The `Key` column tracks peptides while `PTM_positions` tracks individual sites, leading to a 19.4% false localization rate when naively compared, versus a true 12.7% rate.
2. **Monotonicity Instability**: Raw FLR is not monotone, but q-value is. At 1% threshold, this creates a 3-10% difference in site counts, converging at 5%.
3. **Decoy Count Discrepancy**: `DecoyP` is per-site while `Notes` is per-peptide, causing a 16% miscount in decoy sites.
4. **PSM Count Encoding**: `PSM_count` is stored as the string "-" in all 969 rows, making the paper's unique-site collapse procedure inapplicable to this dataset.

These issues were validated through direct computation on the deposited data, not just through methodological analysis. The inventory included citations from external literature, including Käll et al. 2008 on posterior error probabilities and the LuciPHOr framework.

## Phase 4 Milestone Build

The Phase 4 milestone build was structured as four stages, with the following key components:

1. **Task Configuration**: The `task.toml` file defined the workflow as a Comparative task with a multi-step reward strategy. The `multi_step_reward_strategy` was initially misconfigured due to TOML nesting rules, but was corrected to ensure proper reward distribution across the four stages.

2. **Solution Derivation**: The solution derivation script confirmed that the FLR formula `2 × cumsum(decoy) × (Tc/Xc) / rank` exactly reconstructs the deposited values with zero deviation across all six files. This validated the answer key against an external source before any agent interaction.

3. **Verification System**: The verification system included 29 baseline checks, all of which failed as expected when presented with flawed solutions. The system checked for proper column usage, correct row unit definitions, and evidence-backed recommendations.

4. **Packaging and Testing**: The bundle was packaged with a nested path structure (`tasks/<domain>/<subdomain>/`) to meet Starfish requirements. Preflight checks passed with zero blockers, and all 36 Docker gate runs completed successfully.

## Key Findings and Implications

- **Reporting Off-by-One**: Every published count in the paper's table was found to be exactly one higher than the number of sites at or below that rate. This discrepancy was consistent across 53 values, indicating a systematic reporting error that does not affect the paper's conclusions.

- **Residue Selection**: Glycine (pGly) was found to have a 58% rate of being followed by serine in decoy hits, compared to 11% for alanine (pAla). This sequence context evidence is critical for selecting the most reliable decoy residue.

- **Threshold Sensitivity**: The six searches showed a 1.27× site count at 5% threshold versus 4.08× at 1% threshold, indicating that the strict threshold is the one this method cannot determine reliably.

- **M4 Discriminator**: The M4 discriminator candidate focuses on reporting at 1% threshold and justifying the choice with evidence. This construct separates models that can provide defensible recommendations from those that merely restate counts.

## Tooling and Configuration Issues

Several tooling issues were identified and resolved during the build process:

- **TOML Configuration**: The `multi_step_reward_strategy` was initially nested incorrectly in the TOML file, causing it to be parsed as `None`. This was corrected to ensure proper reward distribution.
- **Preflight Script**: The `preflight.sh` script initially could not locate nested Starfish bundles and required a nested-path fallback to be added.
- **Packaging Script**: The `package_task.sh` script was modified to avoid creating a flat wrapper folder and to skip the derivation/embedding step, aligning with Starfish requirements.

These fixes ensured the bundle met all technical requirements and passed all gate checks.