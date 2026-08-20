# .scratchpad.genie.md

## In-Progress Work

### Data Provenance Audit Push to Team Repo

- Push to `emm0012-wvu/IMAGINE-AI` on `cannon/data-provenance-audit` branch completed.
- Delivered:
  - `docs/01_workflow.md` - Detailed pipeline workflow with measured losses at each stage.
  - `docs/02_agentic_tool_proposal.md` - Proposal for a fully engineered agentic workflow with reproducibility and endpoint control.
  - `docs/03_data_quality_report.md` - Data quality report benchmarked against Jen's dataset.
  - `data/` - Six staged datasets with column-level documentation.
  - `scripts/` - Seven working scripts as a snapshot of the current pipeline.

### Key Findings

- **Querying on biomass denominator yields 1.15 accepted rates/paper vs 0.009 for broad topic query (~128× improvement).**
- **Pipeline reproduced one of the same failure modes as Jen's dataset** - five accepted rates were values cited from other papers.
- **Data quality improvements**:
  - Provenance completeness: 60% → 99.6%
  - `subject_type` completeness: absent → present
  - Retained rejections: none → 7,511 with reasons

### Issues and Considerations

- **Nearly destroyed existing README** - Recovered and preserved in `docs/00_ara_provenance_audit.md`.
- **Team conventions**:
  - `CLAUDE.md` asks contributors to claim work with a dated line in `PROGRESS.md` - not added due to shared file dependency.
  - PR not opened - requires user decision.

### Current State

- **Final corpus**: 273 accepted rates from 85 papers over 6,367 screened.
- **Protein-normalised rates**: 136 fully canonical, 144 with partial canonical parse.
- **Magnitude flag**: 7 rates flagged for implausible values.
- **Pipeline scripts**: 7 working scripts in `scripts/` directory.
- **Data size**: 8.3 MB across 22 files, within git limits.

### Next Steps

- Address team conventions (PROGRESS.md entry and PR).
- Finalize documentation and ensure all deliverables are properly documented.
- Continue monitoring and refining the pipeline for further improvements.