## Working Details — .scratchpad.jaques.md

### Phase 2 Summary and Selection

**Phase 2** concluded with the evaluation of the shortlisted candidates from Phase 1. The lead candidate, **E1 (Gath et al., scATAC)**, was ruled out due to licensing restrictions on the 10x Genomics PBMC10k multiome dataset. The terms of use for 10x data prohibit redistribution without express written consent, and the Zenodo archive, while CC BY 4.0, is derived from 10x data, which complicates its use in a task requiring redistribution.

The selected candidate is **P1 (Ramsbottom et al., 2022, *J Proteome Res*, `PXD028840`)**. This dataset is CC BY 4.0 and contains site-level tables that are small enough to be shipped within the task bundle. The dataset includes 35 CSV files, with the synthetic-peptide subset totaling approximately 3.5 MB. The key finding from the paper — a 27% difference in site counts depending on the decoy amino acid used — was validated by extracting and analyzing one of the files, confirming the published numbers with a one-row discrepancy, which is within acceptable bounds.

### Design Considerations

- **Data Licensing**: The selected dataset is fully redistributable under CC BY 4.0, ensuring compliance with the project's requirements.
- **Data Size**: The dataset is compact, with the synthetic-peptide subset being 0.08–0.37 MB per file, making it feasible to include in the task bundle.
- **Reconstructibility**: The headline number (866 sites at 5% FLR for pAla by the decoy method) is reproducible from the deposited files, and the trap — the 24% spread in estimator results — is already embedded in the data.
- **Pitfall Inventory**: Six independent pitfalls are already documented from the source paper, including the choice of decoy amino acid, binarization, and threshold selection. These pitfalls are independent and arise from the scientific reasoning and methodological choices in the paper.

### Next Steps

- **Phase 3**: Build the pitfall inventory with a resolving citation per entry, ensuring that the five pitfalls are genuinely independent and not just variations of a single theme.
- **Task Design**: Develop a milestone scientific workflow task that recreates part or all of the paper's methods. The task will include four milestones, each ending in a decision point that requires the agent to quantify the gap and establish what it confirms and what remains unsettled.
- **Benchmarking and Hardening**: Iteratively benchmark the task to evaluate how far model failures can be pushed at various workflow stages. The task will be hardened to ensure that it discriminates at the M4 stage, where the agent must turn a measurement into a defensible recommendation rather than restating it.

### Key Files and Metrics

- **Files**: 
  - `13-phase2-feasibility-and-selection.md` (commit `5bec12c`)
  - `12-phase1-paper-shortlist.md` (commit `1906fb9`)
  - `11-paper-reconstruction-programme.md` (commit `523a973`)
  - `task.toml` (9×)
  - `study_design.json` (8×)
  - `solve.py` (12×)
  - `generate_data.py` (3×)
  - `author_claims.md` (1×)
  - `expected_truth.json` (1×)
  - `review_report.md` (1×)
  - `derive.sh` (3×)
  - `run_cal2.sh` (6×)
  - `run_gates.sh` (2×)
  - `instruction.md` (1×)

- **Metrics**:
  - **Site Counts**: 252,189 phosphosites at 1% PSM FDR, 121,896 at 1% site-localisation FDR.
  - **FLR Spread**: 24% difference in estimator results at 5% FLR.
  - **Data Size**: 0.08–0.37 MB per file for the synthetic-peptide subset.
  - **Reconstructed Number**: 865 sites at 5% FLR for pAla (paper reports 866).
  - **Pitfall Spread**: 24% at 5% FLR, 3.5× at 1% FLR.

### Conclusion

The selected candidate, **P1**, provides a robust foundation for the next phase of the project. The dataset is redistributable, the key findings are reproducible, and the pitfalls are embedded in the data. The next step is to build the task and begin benchmarking to evaluate model performance and harden the task to ensure it discriminates at the M4 stage.