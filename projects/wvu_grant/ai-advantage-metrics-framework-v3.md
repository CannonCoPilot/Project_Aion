# IMAGINE-AI: Metrics Framework for Demonstrating AI Advantage

**DE-FOA-0003612, Focus Area 2-B: Genotype to Phenotype (BER)**

---

## Background

Genetic potential routinely fails to translate into realized function in microbial systems. Traditional statistical approaches — logistic regression, GLMM, homology-based annotation — assume phenotypic outcomes are linearly separable functions of individual genomic features. This assumption fails where the most important biology occurs: emergent phenotypes arising from multi-gene interactions, regulatory feedback, and community context. AI advantage in genotype-to-phenotype prediction operates at three distinct levels: **throughput amplification** (doing the same thing faster), **quality enhancement** (doing existing things more accurately), and **latent pattern discovery** (connecting dots across genomic, transcriptomic, and metabolic data that human-directed analyses cannot detect at scale).

Even upstream of phenotype prediction, the quality of reference databases constrains all downstream analyses. Martí et al. (2025, *mSystems*) demonstrated that contamination and version asynchrony between NCBI nucleotide and taxonomy databases introduce spurious taxonomic classifications — including false *Plasmodium* annotations in mouse microbiome studies — that propagate silently through traditional pipelines. Their decontaminated Centrifuge indices (1.0–1.4 trillion nucleotides across all domains of life), developed at LLNL by members of the IMAGINE-AI team, provide state-of-the-art reference databases that address known weaknesses in standard classification workflows and will serve as the taxonomic backbone for IMAGINE-AI's data harmonization pipeline.

The DOE Genesis Mission FOA calls for "metrics to identify AI advantage" including "scaling behavior which shows increasing performance as additional data, computing, and/or other resources are applied" and "statistically defensible performance comparisons to non-AI baselines" with "uncertainty, robustness, and reproducibility" characterization.

---

## Project Objectives Alignment

**Objective A**: Demonstrate AI advantage in genotype-to-phenotype prediction accuracy and speed of scientific discovery.

**Objective B**: Accelerate the design-build-test-learn workflow through high-throughput phenotyping and industry partnership.

The metrics framework below serves Objective A directly and provides quantitative foundations for Objective B's Phase II scaling argument.

---

## Comparative Testing Design: The "Comps" Approach

### Why Not a Direct Human-vs-AI Trial?

A naive comparison — assigning identical tasks to human researchers and AI agents — is statistically underpowered and operationally infeasible. Creating a meaningful experimental design would require dozens of researchers performing replicate analyses, consuming budget and person-months that should be directed at science. More fundamentally, it measures the wrong thing: the question is not whether AI is faster than a graduate student, but whether AI-enabled workflows produce better science than the best published pre-AI work.

### The Retrospective Benchmarking Approach

We adopt a strategy where we reanalyze published pre-AI genotype-to-phenotype studies with known outcomes and use them as benchmarks.

**Protocol**:

1. **Curate a Reference Set**: Identify 15–25 published studies (2020–2026) that performed genotype-to-phenotype prediction on microbial datasets using traditional statistical methods. Selection criteria: (a) raw data publicly available, (b) methods reproducible from paper description, (c) quantitative performance metrics reported (accuracy, F1, R², RMSE). Priority given to studies using BacDive, IMG, NCBI, or µGrowthDB — the same data sources IMAGINE-AI uses.

2. **Reproduce with AI Agents**: Feed the same input data through the IMAGINE-AI pipeline, operated entirely by agentic AI workflows. The AI agents handle data retrieval, harmonization, feature engineering, model training, evaluation, and reporting — the full scientific workflow, not just the model fitting step.

3. **Compare Outcomes**: Evaluate IMAGINE-AI outputs against the published results on (a) predictive accuracy on the same test organisms, (b) number of organisms for which phenotype predictions could be made (prediction frontier), (c) novel interaction patterns identified, and (d) total wall-clock time from data acquisition to results.

4. **Forward Validation**: A subset of IMAGINE-AI predictions that exceed published results — particularly predictions for organisms not covered in the original studies — are selected for experimental validation during high-throughput phenotyping.

Each included study is an independent replicate with its own sample, methods, and performance ceiling. Sampling from published baselines provides more statistical power than feasible human trials, and the approach is fully reproducible.

### Ablation Design

To determine *which* AI components drive advantage, systematic ablation runs remove individual components:

| Ablation Condition | What's Removed | What It Tests |
|-------------------|---------------|---------------|
| Full IMAGINE-AI | Nothing | Upper bound |
| −Foundation models | ESM-style embeddings → one-hot encoding | Value of learned representations |
| −GNN | Graph networks → independent feature vectors | Value of interaction modeling |
| −Multi-omics | Genomics only, no transcriptomics/metabolomics | Value of data integration |
| −Agentic workflow | Manual pipeline execution, same models | Value of AI-managed workflow |
| Traditional baseline | Logistic regression / GLMM only | Lower bound |

This directly serves the FOA's emphasis on "AI model explainability and traceability" — it answers not just *whether* AI is better but *why*.

---

## Metrics for Quantifying AI Advantage

### Phase 1 Metrics (Decision Gate, Month 6)

These metrics are evaluable within the 9-month Phase 1 timeline using publicly available data and Phase 1 experimental outputs.

---

**Metric 1: Predictive Accuracy Advantage (PAA)** — *Phase 1*

Macro-averaged F1 (categorical traits) and RMSE (quantitative growth rates) for IMAGINE-AI versus published baselines and reproduced traditional models, evaluated on held-out test taxa using 10-fold stratified cross-validation repeated 10 times. Decision gate: ≥5 percentage-point F1 improvement or ≥10% RMSE reduction (permutation test, p < 0.05). PAA is computed separately per trait class (morphological, metabolic, growth kinetics) to identify where AI advantage concentrates.

---

**Metric 2: Scaling Exponent (SE)** — *Phase 1*

Fit `Performance(n) = a·n^α + c` over bootstrapped training subsets (10%, 25%, 50%, 75%, 100%). Compare α_AI versus α_traditional. A higher scaling exponent means the AI model extracts more information per additional training example — directly addressing the FOA's signature interest in scaling behavior. Decision gate: α_AI > α_traditional (p < 0.05, Spearman). Extension: compute SE separately at increasing biological complexity (pure culture → in silico consortia → experimental consortia) to test whether AI advantage *amplifies* with problem difficulty.

---

**Metric 3: Prediction Frontier Expansion (PFE)** — *Phase 1*

The fraction of organisms in the dataset for which IMAGINE-AI produces a confident phenotype prediction (probability ≥ 0.8) but the best traditional baseline produces either no prediction or unacceptable uncertainty. PFE quantifies pure capability expansion — new biological knowledge that could not exist without AI. Validated by selecting a random sample of AI-unique predictions for experimental confirmation during high-throughput phenotyping. The confirmation rate is itself a metric: PFE-Validation = confirmed / tested.

---

**Metric 4: Interaction Discovery Rate (IDR)** — *Phase 1*

The fraction of gene-gene or species-species interaction effects identified by AI (via GNN edge importance or transformer attention) that are (a) not detectable by traditional pairwise statistical tests (chi-square, GLMM interaction terms) at p < 0.10, and (b) validated by literature co-expression evidence or experimental consortia phenotyping. IDR measures the "connecting the dots" dimension — latent patterns in genotype-phenotype relationships that emerge from network-aware models but are invisible to additive, feature-independent methods. For the nitrogen fixation use case, the most consequential interactions are those predicting consortia N₂ fixation performance from individual genome features.

---

**Metric 5: Uncertainty Calibration Index (UCI)** — *Phase 1*

Reliability diagram analysis across confidence bins ([0.5–0.6) through [0.9–1.0]): UCI = 1 − mean absolute deviation between predicted confidence and observed accuracy. A well-calibrated model (UCI ≥ 0.85) means predictions labeled "80% confident" are correct ~80% of the time — critical for efficient DBTL experiment targeting. Compare UCI_AI vs UCI_traditional to determine whether AI not only predicts better but *knows when it's wrong* better.

---

**Metric 6: Workflow Efficiency Quotient (WEQ)** — *Phase 1*

Instead of human-vs-AI task races, WEQ is computed from the "comps" approach: wall-clock time for IMAGINE-AI (agentic workflow) to reproduce a published study's full analysis versus the reported person-months in the original publication. WEQ = Published_person-months / AI_wall-clock-months. This captures real-world throughput amplification against a meaningful baseline without requiring parallel human effort. Expected range: 10–100× for computationally intensive analyses where AI agents automate data retrieval, harmonization, and model iteration.

---

**Metric 7: Consortia Emergence Score (CES)** — *Phase 1 (preliminary) / Phase 2 (full)*

CES = Corr(AI_predicted_consortia_phenotype, observed) − Corr(additive_pure_culture_sum, observed). A positive CES means the AI model captures emergent community behavior that additive models miss. Phase 1 evaluates CES on existing PI/Co-PI consortia dataset phenotypes and in silico composites. Phase 2 scales CES evaluation across the full DBTL experimental matrix.

---

### Phase 2 Metrics (Performance Assessment, Annual)

These metrics require larger datasets, extended experimental validation, or cross-domain generalization testing that exceeds Phase 1 scope. They are described here to demonstrate the trajectory toward transformative capability that the FOA requires.

---

**Metric 8: Dark Matter Illumination Rate (DMIR)** — *Phase 2*

The fraction of proteins in environmental metagenomes with no detectable homology to characterized proteins (the "functional dark matter" comprising 40–60% of environmental sequences per Pavlopoulos et al. 2023) that IMAGINE-AI can assign confident functional predictions via protein language model embeddings and structure-based inference. DMIR = (proteins annotated by AI but not by BLAST/InterProScan) / (total unannotated by traditional methods). Phase 2 evaluation uses JGI IMG/M metagenomes from DOE-relevant environments (soil, rhizosphere, subsurface).

---

**Metric 9: Compositional Fidelity Score (CFS)** — *Phase 2*

Measures false discovery rate inflation attributable to compositionality violations in microbiome differential abundance testing. Applied to synthetic communities with known structure (Dirichlet-multinomial generative model), CFS = 1 − FDR_compositional_artifacts. AI methods that learn distributional properties directly (variational autoencoders, Dirichlet-multinomial neural models) should exhibit CFS > 0.85 versus CFS 0.60–0.75 for DESeq2/LEfSe (per Nearing et al. 2022). Requires large-scale synthetic benchmarking infrastructure appropriate for Phase 2.

---

**Metric 10: Cross-Biome Generalization Index (CBGI)** — *Phase 2*

Performance on held-out biomes not represented in training data, normalized to training-biome performance: CBGI = Performance(novel_biome) / Performance(training_biome). Models trained on human-gut-enriched databases (BacDive, µGrowthDB) are tested on soil, marine, and subsurface metagenomes from NMDC and TARA Oceans. CBGI near 1.0 indicates robust generalization; below 0.5 indicates environment-specific overfitting. Requires cross-environment datasets at scale appropriate for Phase 2.

---

**Metric 11: Discovery Throughput Index (DTI)** — *Phase 2*

Novel validated findings (new species, new functional assignments, new ecological associations) per unit of total project effort (compute-hours + FTE-hours). Findings qualify as "novel" if absent from training databases, not predicted by traditional pipelines, and confirmed by expert review or experiment. Phase 2 evaluation aggregates across the full DBTL cycle to measure whether IMAGINE-AI's integrated workflow produces more discoveries per dollar than conventional approaches — the ultimate ROI metric for DOE investment decisions.

---

**Metric 12: Curation Efficiency Ratio (CER)** — *Phase 2*

Ontology-compliance improvement per FTE-hour invested, comparing AI-assisted versus manual data curation. As IMAGINE-AI scales to larger and more heterogeneous datasets in Phase 2, the curation bottleneck becomes rate-limiting. LLM-assisted harmonization (demonstrated at 89% expert agreement by Reimer et al. 2025) versus rule-based approaches (67%) provides the benchmark. CER = quality_improvement / FTE_invested, normalized to manual curation baseline.

---

**Metric 13: Hypothesis Novelty Yield (HNY)** — *Phase 2*

The fraction of AI-generated hypotheses that are both novel (not derivable from traditional analysis of the same data) and experimentally validated. HNY is the ultimate Level 3 metric — it measures whether AI produces genuine new biology. Expected to be low (0.05–0.20) but even modest rates across thousands of predictions represent transformative knowledge expansion. Requires the experimental throughput of Phase 2's automated DBTL workflow for adequate statistical power.

---

## Decision Gate Summary (Phase 1 Go/No-Go, Month 6)

| Metric | Threshold | Evidence |
|--------|----------|----------|
| PAA | ≥5 pp F1 or ≥10% RMSE improvement (p<0.05) | Held-out test taxa, 10×10 CV |
| SE | α_AI > α_trad (p<0.05) | Bootstrap subsets |
| PFE | >0% frontier expansion with ≥60% confirmation rate | AI-unique predictions validated experimentally |
| IDR | ≥3 validated interaction effects not detectable by pairwise methods | GNN/attention extraction + literature/experimental confirmation |
| WEQ | ≥10× throughput vs. published study timelines | "Comps" retrospective benchmarking |
| UCI | UCI_AI ≥ 0.85 | Reliability diagram analysis |
| CES | CES > 0 (p<0.05, bootstrap CI) | PI/Co-PI existing consortia data |

---

## Data Sources and Models

**Genotypic**: IMG (>450K prokaryotic genomes), NCBI RefSeq (23,063 species-representative assemblies), NFixDB (>4,000 nitrogenase gene clusters across 50 phyla). **Taxonomic Reference**: LLNL decontaminated Centrifuge databases (Martí et al. 2025; 1.0–1.4 trillion nucleotides, quality-controlled against NCBI nt/taxonomy version asynchrony) — available to the team via LLNL Co-PIs, providing robust taxonomic classification as input to downstream genotype-to-phenotype modeling. **Phenotypic**: BacDive (>100,000 strains, 20,060 type strains covering 98% of validly described prokaryotes), µGrowthDB (quantitative growth rates). **Integrated**: PI/Co-PI datasets with growth phenotypes (n=1,420), metatranscriptomes (n=590), metaproteomes (n=117), and fully sequenced genomes/metagenomes for consortia members.

**AI Models**: ESM-style protein/genome language models for learned representations; AtomGPT-style domain-adapted models for structured reasoning; GNNs for gene-gene, pathway, and species interaction networks; multimodal deep learning integrating genomics + transcriptomics + metabolomics + environment; ensemble gradient boosting for robustness. Agentic workflows via AtomGPT.org APIs, AGAPI agents, and MCP-based integrations for automated data retrieval, harmonization, training, and experiment planning.

**"Comps" Reference Set**: 15–25 published pre-AI genotype-to-phenotype studies (2020–2026) with publicly available data, reproducible methods, and quantitative performance metrics. Priority: studies using BacDive, IMG, NCBI, µGrowthDB on microbial phenotype prediction including nitrogen fixation, growth kinetics, metabolic capacity, and community assembly.

---

## References

1. Koblitz et al. (2025) *Commun. Biol.* 8:527 — ML phenotype prediction, 79–98% accuracy
2. Karlsen et al. (2023) *FEMS Microbiol. Rev.* 47:fuad025 — Phenotype prediction structural gaps
3. Pavlopoulos et al. (2023) *Nature* 622:594 — 40–60% functional dark matter
4. Nearing et al. (2022) *Nat. Commun.* 13:342 — <25% DA method concordance
5. Gao et al. (2024) *Nat. Hum. Behav.* / arXiv:2304.10578 — 3.02× AI publication rate
6. Birhane et al. (2023) *Nat. Rev. Phys.* 5:277 — Three-level AI advantage framework
7. Han et al. (2025) *Nat. Commun.* 16:2041 — DL binning +22% MAGs
8. Wang et al. (2024) *Genome Biol.* 25:34 — AnnoPRO protein annotation
9. Reimer et al. (2025) *Bioinform. Adv.* 5:vbaf021 — LLM curation, 89% vs 67%
10. Meyer et al. (2022) *Nat. Methods* 19:429 — CAMI II benchmark
11. Lesimple et al. (2023) *mSystems* 8:e00407-23 — k-mer phenotype prediction
12. Gloor et al. (2017) *Front. Microbiol.* 8:2224 — Compositionality violations
13. Martí et al. (2025) *mSystems* DOI:10.1128/msystems.01239-24 — Decontaminated Centrifuge databases, reference quality impact on classification

---

*IMAGINE-AI Metrics Framework v3.0 — 2026-04-16*
