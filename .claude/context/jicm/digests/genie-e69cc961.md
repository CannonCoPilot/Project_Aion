# .scratchpad.genie.md

## 2026-08-26

### Genome Pull Verification

- **Genome pull completed successfully** with all 11,130 of 11,143 expected folders.
- **Completeness**: 99.4% of folders have both `.fna` and `.faa` files.
- **Integrity**: No truncated files detected, and all files match the remote source.
- **Exclusions**: Two accessions (`GCA_039536225` and `GCA_039532385`) were identified as upstream assembly defects and will be excluded downstream.

### Assembly-Level Features

- **Computed assembly-level features** for all 11,128 genomes in 52 seconds.
- **Features included**: genome size, GC content, true coding density, gene density, contig count, N50, L50, and ambiguous base counts.
- **Validation**: Genome sizes matched NCBI exactly, and GC content aligned within NCBI's rounding.
- **True coding density**: Measured at scale for the first time, with a median of 0.871 and a Pearson correlation of 0.3726 with gene density (r² = 0.1388).

### Coding Density Impact

- **Revised analysis** of coding density impact showed that the correlation with gene density was inflated by including genomes with partial protein FASTAs.
- **Corrected correlation**: r = 0.2556, r² = 0.065 (n = 10,952).
- **Impact on report**: The report was updated to reflect the corrected values and the conclusion that gene density is not a proxy for coding density.

### Strain Resolution and Nif Panel

- **Strain resolution**: 327 of 451 rates (72.5%) carry a strain designation, and 98.3% of assemblies have strain designations cached.
- **Local collection limitation**: The BacDive-derived collection is not suitable for resolving strain designations from ARA papers.
- **Nif panel scan**: 9 strain-specific genomes were pulled and scanned, showing 100% concordance with the nif panel, compared to 44% at the species level.

### Species-Level Labels and Pseudo-Replication

- **Variance decomposition**: 41% of variance in C2H4/protein rates is within-species, with 59% between-species.
- **Pseudo-replication cost**: Species-level labels may miss important strain-specific variations, especially in well-characterized organisms with engineered mutants.

### Literature with Rate + Accession

- **Base rate**: 17% of rate-bearing papers cite an accession, which is not significantly different from the corpus-wide base rate of 20%.
- **Ceiling**: ~76 rates and ≤39 assemblies can be gained from the existing corpus, with adjudication needed to distinguish comparison genomes.

### Files and Metrics

- **Files**: `nif_panel_strain_genomes.json`, `strain_genomes_manifest.json`, `rate_strain_resolution.json`, `unit_canonicalization.json`, `assembly_features.csv`, `assembly_features_summary.json`.
- **Metrics**: 9/9 core-positive strain genomes, 41% within-species variance, 59% between-species variance, 17% of rate-bearing papers cite an accession.

### Commits

- **6d2a1f2**: Finalized strain genome analysis and nif panel results.
- **182e8d2**: Updated methods doc with Q4 findings.
- **57f2b03**: Methods proposal for Tier 1 nif panel.
- **0b89123**: Tier 1 nif panel built and run.
- **a47aed2**: Updated report with corrected coding density impact.
- **489f150**: Assembly features script and results.
- **784da51**: Genome pull verification script and results.

### Key Numbers

- **9/9**: All 9 strain-specific genomes show nifHDK core.
- **41%**: Within-species variance in C2H4/protein rates.
- **59%**: Between-species variance in C2H4/protein rates.
- **17%**: Rate-bearing papers citing an accession.
- **20%**: Corpus-wide base rate of papers citing an accession.
- **44%**: Species-level nifHDK core positivity.
- **39/39**: All 39 rates in strain-specific genomes are core-positive.
- **0.592**: Between-species η² for species with ≥2 rates.
- **0.408**: Within-species η² for species with ≥2 rates.
- **6,372**: PMC XMLs in fulltext directory.
- **11,143**: Expected genome folders.
- **72.5%**: Rates with strain designations.
- **14,649**: Assemblies with strain designations.
- **14,897**: Total assemblies.
- **98.3%**: Assemblies with strain designations.
- **33%**: Bare-strain-only rates.
- **2,147**: Full texts in acquired directory.
- **8/90**: Resolved strain designations in initial probe.

### Next Steps

- **Continue with Tier 2 analysis** if resources allow.
- **Chase Q4** to resolve strain designations in ARA papers.
- **Update the report** with the latest findings and recommendations.