# FORENSIC RECORD

## Session Summary

The session focused on resolving issues with the genomic data pipeline, particularly around the adjudication of PGPR (Plant Growth-Promoting Rhizobacteria) papers and the correction of misaligned ARA (Acetylene Reduction Assay) rates. The work involved identifying and fixing errors in the extraction of ARA values from scientific papers, ensuring that the correct columns were being used for data retrieval.

Key activities included:
- Re-extracting ARA values from the paper PMC7536287, which had previously been misaligned due to a colspan issue in the table structure.
- Running a parser across 32 other papers with similar issues to identify and correct misaligned ARA values.
- Identifying 50 suspect rates across 8 papers, with the dominant issue being ARA values incorrectly placed under IAA (Indole-3-Acetic Acid) production columns.
- Correcting 29 of these rates and dropping 21 that were found to be invalid or non-existent in the context of the paper.

The session also involved updating the control profiles used in the nif panel scan to ensure they were independent and not part of the same Pfam clan as the target profiles. This was crucial for maintaining the integrity of the results and ensuring that the control profiles did not introduce bias.

## File and Metric Usage

### Files

- **12_genomic_track_methods.md**: Updated to reflect the latest changes and findings from the session, including the correction of ARA values and the update to control profiles.
- **.scratchpad.genie.md**: Updated to document the in-progress work and decisions made during the session, particularly the pending decision on applying the audit results to the corpus of record.
- **nif_panel_scan.py**: Modified to include the new control profiles and ensure the scanner was using the updated logic.
- **fetch_nif_profiles.py**: Adjusted to fetch the new control profiles and ensure they were correctly integrated into the pipeline.
- **adjudicate_pgpr_negatives.py**: Used to adjudicate the negative cases in the PGPR papers, ensuring that the correct data was being used for analysis.
- **pull_strain_genomes.py**: Updated to handle the new assembly accessions and ensure the genomes were correctly pulled and merged into the manifest.
- **rate_strain_resolution.json**: Updated to reflect the new resolution of strain rates after the corrections were made.
- **adjudicate_route_b.py**: Modified to handle the adjudication of Route B papers, ensuring that the correct accessions were being used.
- **route_b_assemblies.json**: Updated to include the new assemblies identified during the adjudication process.
- **strain_genomes_manifest.json**: Updated to reflect the new genomes pulled and merged into the manifest.
- **genie.compressed.md**: Updated to reflect the latest state of the project, including the new findings and corrections.

### Commit-like Hashes

- **406fd04**: Commit that introduced the adjudication of Route B papers and the initial correction of ARA values.
- **c2c73c4**: Final commit that applied the audit results and updated the control profiles.
- **2f8c28b**: Commit that re-extracted the ARA values from PMC7536287 and corrected the misalignment.
- **3a0de6d**: Commit that adjudicated the negative cases in the PGPR papers and updated the control profiles.
- **496dc1f**: Commit that pulled the new genomes and updated the manifest.

### Key Numbers / Metrics

- **29.60**: Corrected ARA value for ED5 in PMC7536287.
- **22.88**: ARA value that was found to be incorrect and needed correction.
- **45.7%**: Percentage of confirmed ARA values after the audit.
- **11.1%**: Percentage of suspect ARA values identified during the audit.
- **22/22**: All 22 rates in PMC7236179 were successfully re-extracted and corrected.
- **43%**: Percentage of rates that were neither confirmed nor refuted during the audit.
- **29.26**: ARA value that was found to be incorrect and needed correction.
- **1096.10**: Incorrect ARA value that was identified as part of the hydrolytic enzymes column.
- **732.93**: Incorrect ARA value that was identified as part of the IAA production column.
- **517.19**: Incorrect ARA value that was identified as part of the IAA production column.
- **30.24**: Corrected ARA value for ED5 in another paper.
- **8.23**: Minimum ARA value reported in the paper.
- **0.159**: Minimum ARA value that was incorrectly identified due to a colspan issue.
- **1.68**: ARA value that was correctly identified and used in the analysis.
- **1.41**: ARA value that was correctly identified and used in the analysis.
- **42%**: Percentage of rates that were exposed to the colspan issue.
- **38%**: Percentage of rates that were not affected by the colspan issue.
- **1.80**: ARA value that was correctly identified and used in the analysis.
- **0.95**: ARA value that was correctly identified and used in the analysis.
- **57/264**: Number of papers and rates that were initially flagged due to colspan issues.
- **59%**: Percentage of rates that were initially flagged due to colspan issues.
- **0.05**: ARA value that was correctly identified and used in the analysis.
- **100%**: Percentage of confirmed ARA values in the strain genomes.
- **24/54**: Number of core-positive strains identified after the corrections were made.